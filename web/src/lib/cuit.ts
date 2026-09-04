// Validación del dígito verificador del CUIT/CUIL (algoritmo oficial AFIP,
// módulo 11). La usamos para filtrar candidatos de OCR: de todos los
// números de 11 dígitos que aparezcan en una captura (montos, cuentas,
// fechas, el CUIT real...), solo dejamos pasar los que además cumplen esta
// cuenta matemática — un número al azar tiene ~1/11 de chance de pasarla.
const MULTIPLICADORES = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function esCuitValido(cuit: string): boolean {
  if (!/^\d{11}$/.test(cuit)) return false;
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(cuit[i]) * MULTIPLICADORES[i];
  const resto = suma % 11;
  let verificador = 11 - resto;
  if (verificador === 11) verificador = 0;
  if (verificador === 10) return false; // esquema especial, no lo tratamos como válido acá
  return verificador === Number(cuit[10]);
}

export interface CandidatoCuit {
  cuit: string;
  valido: boolean;
}

// Patrones para candidatos de CUIT en texto de OCR: 11 dígitos seguidos
// (con límite de palabra a los costados, para no agarrar un pedazo de un
// número más largo), o el formato con separadores XX-XXXXXXXX-X /
// XX XXXXXXXX X que a veces usan los sistemas. A propósito NO se usa un
// separador "suelto" tipo [\d -]+ : en una fila de tabla como
// "27951512 30587156611 JOSE..." (importe pegado al CUIT por un solo
// espacio) eso terminaría uniendo dos números vecinos en un solo
// candidato de más de 11 dígitos, y se perdían los dos.
const PATRONES_CUIT = [/\b\d{11}\b/g, /\b\d{2}[- ]\d{8}[- ]\d\b/g];

// Extrae del texto crudo de OCR todos los candidatos de CUIT, marcando
// cuáles pasan la validación de dígito verificador — el OCR a veces
// confunde un solo dígito (ej. un 5 leído como 8) y el número real queda
// "casi bien"; con eso alcanza para precargarlo igual y que solo haga
// falta corregir el dígito que falló, en vez de tipear los 11 de cero.
export function extraerCandidatosCuit(textoOcr: string): CandidatoCuit[] {
  const vistos = new Set<string>();
  const resultado: CandidatoCuit[] = [];
  for (const patron of PATRONES_CUIT) {
    for (const c of textoOcr.match(patron) || []) {
      const soloDigitos = c.replace(/[^0-9]/g, '');
      if (soloDigitos.length !== 11) continue;
      if (vistos.has(soloDigitos)) continue;
      vistos.add(soloDigitos);
      resultado.push({ cuit: soloDigitos, valido: esCuitValido(soloDigitos) });
    }
  }
  // Los válidos primero.
  return resultado.sort((a, b) => Number(b.valido) - Number(a.valido));
}

export interface ChequeDetectado {
  cuit: string;
  valido: boolean;
  numeroCheque: string;
  monto: string;
  emisorNombre: string;
}

// Palabras de encabezado/UI del banco que no son parte del nombre del
// emisor, para no meterlas dentro de "emisorNombre" cuando quedan en la
// misma línea de OCR que los datos del cheque.
const PALABRAS_IGNORADAS = new Set([
  'FECHA', 'EMISION', 'EMISIÓN', 'EMISOR', 'PAGO', 'NRO', 'CHEQUE', 'IMPORTE', 'ENVIADO', 'POR',
  'CUIT', 'RAZON', 'RAZÓN', 'SOCIAL', 'ESTADO', 'EMITIDO', 'EMITIDO-PENDIENTE', 'PENDIENTE',
  'ACEPTADO', 'RECHAZADO', 'ACEPTAR', 'CANTIDAD', 'SELECCIONADA', 'TOTAL', 'PERSONALIZAR',
  'VISTA', 'PODES', 'PODÉS', 'SELECCIONAR', 'LAS', 'COLUMNAS', 'MOSTRAR', 'AE', 'ACTIVO',
  'ACTIVO-PENDIENTE',
]);

// Palabras cortas (2 letras) que sí son parte real de una razón social
// ("DE SEADO SAS", "ARAUCO S.A.") — el filtro de basura de 2 letras que
// pega el OCR (checkbox de la fila, guiones sueltos: "Od", "ad", "[J")
// se las comía a todas por igual solo por el largo.
const PALABRAS_CORTAS_VALIDAS = new Set(['DE', 'LA', 'EL', 'SA', 'Y']);

// Cuando la columna "Estado" no entra en una línea (ACTIVO-PENDIENTE /
// EMITIDO-PENDIENTE) el OCR la corta rara: "EMITIDO-" sin la segunda
// palabra, o "ENDIENTE" con la "P" perdida. La lista exacta de arriba no
// las agarra por ser fragmentos distintos — acá se filtra por substring
// contra las frases completas conocidas en vez de match exacto.
const RUIDO_ESTADO = 'activo-pendiente emitido-pendiente rechazado aceptado';

// Convierte el texto de un monto ya recortado ("298.380,82", "298.380.82",
// "2.269.306 00"...) al formato con punto decimal que espera el backend.
// El OCR a veces confunde la coma decimal con un punto o un espacio — en
// vez de asumir siempre "punto = miles, coma = decimal", se toma el
// ÚLTIMO separador (sea cual sea el símbolo) como el decimal, y se saca
// cualquier otro separador antes (de miles), evitando multiplicar el
// monto real por 100.
function normalizarMonto(crudo: string): string {
  const ultimoSep = Math.max(crudo.lastIndexOf('.'), crudo.lastIndexOf(','), crudo.lastIndexOf(' '));
  const parteEntera = crudo.slice(0, ultimoSep).replace(/[.,\s]/g, '');
  const parteDecimal = crudo.slice(ultimoSep + 1);
  return parteEntera + '.' + parteDecimal;
}

// La fila de la tabla del banco siempre trae los campos en el MISMO
// orden: Fecha de pago, N° de cheque, Importe, Enviado por CUIT, Enviado
// por razón social, Estado, Emisor CUIT. Antes se buscaba cada campo
// suelto en toda la línea, así que si uno salía mal leído (ej. una fecha
// sin las barras) su basura podía colarse en la búsqueda de otro campo
// vecino. Ahora se recorre la línea de izquierda a derecha respetando
// ese orden fijo: cada campo se busca solo a partir de donde terminó el
// anterior, nunca antes.
const RE_FECHA = /\d{1,2}\/\d{1,2}\/\d{2,4}|(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(19|20)\d{2}/;
const RE_NRO_CHEQUE = /\d{5,9}/;
// El inicio es libre en cantidad de dígitos (un monto puede empezar con
// más de 3 dígitos antes del primer separador de miles, ej. "1.346.108");
// lo único que identifica "esto es un monto" es que termine en un
// separador (coma, punto, o el espacio en que a veces lo lee el OCR)
// seguido de 2 dígitos exactos.
const RE_MONTO = /\$?\s?\d[\d.,\s]*[.,\s]\d{2}\b/;

// Saca símbolos sueltos que el OCR pega a la primera/última palabra
// (checkbox de la fila, guiones, corchetes), encabezados de la UI del
// banco y restos de la columna Estado, dejando solo lo que parece parte
// real de un nombre.
function limpiarNombre(texto: string): string {
  return texto
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ-]/g, '').replace(/^-+|-+$/g, '').trim())
    .filter((p) => {
      const larga = p.length > 2 || PALABRAS_CORTAS_VALIDAS.has(p.toUpperCase());
      if (!larga || PALABRAS_IGNORADAS.has(p.toUpperCase())) return false;
      const low = p.toLowerCase();
      return !(low.length >= 4 && RUIDO_ESTADO.includes(low));
    })
    .join(' ')
    .trim();
}

interface Ancla {
  idxLinea: number;
  cuit: string;
  numeroCheque: string;
  monto: string;
  nombreBase: string;
}

export function extraerChequesDeLineas(lineas: string[]): ChequeDetectado[] {
  // Primera pasada: una fila "ancla" es una línea que trae CUIT + N° de
  // cheque — las dos únicas cosas que identifican de verdad una fila real
  // de la tabla. Todo lo demás (líneas sin CUIT, o con CUIT pero sin N°
  // de cheque) son restos de columnas que se envolvieron en dos líneas
  // visuales (nombre largo, "Estado" cortado) y se resuelven en la
  // segunda pasada.
  const anclas: Ancla[] = [];
  const idxAncla = new Set<number>();
  const vistos = new Set<string>();

  lineas.forEach((lineaOriginal, idxLinea) => {
    const cuitMatches = lineaOriginal.match(/\b\d{11}\b/g);
    if (!cuitMatches || cuitMatches.length === 0) return;
    // Dos CUIT por fila: "Enviado por CUIT" (puede ser un tercero que
    // agrupa cheques de varios clientes) y "Emisor CUIT" — el verdadero
    // librador, al que hay que consultarle el historial en el BCRA, en la
    // columna más a la derecha. Nos quedamos con el último match.
    const cuit = cuitMatches[cuitMatches.length - 1];

    let resto = lineaOriginal;
    for (const m of cuitMatches) resto = resto.replace(m, ' ');

    let cursor = 0;
    const fechaMatch = resto.slice(cursor).match(RE_FECHA);
    if (fechaMatch && fechaMatch.index != null) cursor += fechaMatch.index + fechaMatch[0].length;

    const nroMatch = resto.slice(cursor).match(RE_NRO_CHEQUE);
    if (!nroMatch || nroMatch.index == null) return; // sin N° de cheque no es una fila real
    const numeroCheque = nroMatch[0];
    cursor += nroMatch.index + nroMatch[0].length;

    let monto = '';
    const montoMatch = resto.slice(cursor).match(RE_MONTO);
    if (montoMatch && montoMatch.index != null) {
      monto = normalizarMonto(montoMatch[0].replace(/[^\d.,\s]/g, '').trim());
      cursor += montoMatch.index + montoMatch[0].length;
    }

    const clave = cuit + '|' + numeroCheque;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    idxAncla.add(idxLinea);
    anclas.push({ idxLinea, cuit, numeroCheque, monto, nombreBase: limpiarNombre(resto.slice(cursor)) });
  });

  // Segunda pasada: una razón social larga ("SUCESORES DE ALFREDO
  // WILLINER") no entra en el ancho de la columna y el banco la parte en
  // dos líneas visuales, y el OCR las lee como líneas sueltas — a veces
  // ANTES de la línea con los datos de esa fila (si el nombre queda
  // arriba del todo en una fila más alta de lo normal), a veces después.
  // Cada línea que no es un ancla se pega al ancla más cercana por
  // posición, sea anterior o posterior, en vez de asumir siempre "la
  // fila anterior".
  // Cada fragmento (el propio de la ancla + los que se le peguen) guarda
  // su idxLinea, para poder ordenar el nombre final por posición real en
  // vez de "ancla primero, extras después" (que invertía el orden cuando
  // el fragmento envuelto venía ANTES de la línea ancla).
  const fragmentos: { idxLinea: number; texto: string }[][] = anclas.map((a) => [
    { idxLinea: a.idxLinea, texto: a.nombreBase },
  ]);

  lineas.forEach((lineaOriginal, idxLinea) => {
    if (idxAncla.has(idxLinea) || anclas.length === 0) return;
    const cola = limpiarNombre(lineaOriginal);
    if (!cola) return;
    let mejor = 0;
    let mejorDist = Infinity;
    anclas.forEach((a, i) => {
      const d = Math.abs(a.idxLinea - idxLinea);
      // En un empate (misma distancia a la fila anterior y a la
      // siguiente) gana la siguiente: un nombre envuelto casi siempre es
      // el arranque del nombre de la fila que viene, no la cola de la
      // anterior.
      if (d <= mejorDist) {
        mejorDist = d;
        mejor = i;
      }
    });
    fragmentos[mejor].push({ idxLinea, texto: cola });
  });

  return anclas.map((a, i) => ({
    cuit: a.cuit,
    valido: esCuitValido(a.cuit),
    numeroCheque: a.numeroCheque,
    monto: a.monto,
    emisorNombre: fragmentos[i]
      .sort((x, y) => x.idxLinea - y.idxLinea)
      .map((f) => f.texto)
      .filter(Boolean)
      .join(' '),
  }));
}
