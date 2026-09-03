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

// Reconstruye, a partir de las líneas de texto que detectó el OCR (una
// línea de tabla = un cheque), el CUIT + emisor + N° de cheque + monto de
// cada fila. Solo el CUIT tiene una forma de auto-validarse (el dígito
// verificador); los otros tres campos son "mejor esfuerzo" y quedan
// editables en la UI por si el OCR se equivocó en algo.
//
// La vista personalizada del banco puede traer DOS CUIT por fila:
// "Enviado por CUIT" (quien reenvía/gestiona el cobro, puede ser un
// tercero que agrupa cheques de varios clientes) y "Emisor CUIT" (el
// verdadero librador del cheque, que es a quien hay que consultarle el
// historial en el BCRA). Cuando aparecen los dos, "Emisor CUIT" es la
// columna más a la derecha, así que nos quedamos con el último match de
// la fila en vez del primero.
export function extraerChequesDeLineas(lineas: string[]): ChequeDetectado[] {
  const resultado: ChequeDetectado[] = [];
  const vistos = new Set<string>();

  for (const lineaOriginal of lineas) {
    const cuitMatches = lineaOriginal.match(/\b\d{11}\b/g);
    if (!cuitMatches || cuitMatches.length === 0) continue;
    const cuit = cuitMatches[cuitMatches.length - 1];

    let resto = lineaOriginal;
    for (const m of cuitMatches) resto = resto.replace(m, ' ');
    resto = resto.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' '); // fechas dd/mm/aaaa
    // A veces el OCR pierde las barras y la fecha queda pegada como un
    // bloque de 8 dígitos (ddmmaaaa) — sin esto, ese bloque se confundía
    // con el N° de cheque (ambos tienen forma de "varios dígitos seguidos").
    resto = resto.replace(/\b(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(19|20)\d{2}\b/g, ' ');

    let monto = '';
    // El separador final (los 2 dígitos de centavos) a veces lo lee el OCR
    // como espacio en vez de coma ("52.269.306 00").
    const montoMatch = resto.match(/\$?\s?\d{1,3}(?:[.,]\d{3})+[.,\s]\d{2}\b|\$\s?\d+[.,]\d{2}\b/);
    if (montoMatch) {
      const crudo = montoMatch[0].replace(/[^\d.,\s]/g, '').trim();
      // El OCR a veces confunde la coma decimal con un punto ("298.380.82"
      // en vez de "298.380,82") — en vez de asumir siempre "punto = miles,
      // coma = decimal", se toma el ÚLTIMO separador (sea cual sea el
      // símbolo) como el decimal, y se saca cualquier otro separador antes
      // (de miles), evitando multiplicar el monto real por 100.
      const ultimoSep = Math.max(crudo.lastIndexOf('.'), crudo.lastIndexOf(','), crudo.lastIndexOf(' '));
      const parteEntera = crudo.slice(0, ultimoSep).replace(/[.,\s]/g, '');
      const parteDecimal = crudo.slice(ultimoSep + 1);
      monto = parteEntera + '.' + parteDecimal;
      resto = resto.replace(montoMatch[0], ' ');
    }

    let numeroCheque = '';
    const nroMatch = resto.match(/\b\d{5,9}\b/);
    if (nroMatch) {
      numeroCheque = nroMatch[0];
      resto = resto.replace(nroMatch[0], ' ');
    }

    const emisorNombre = resto
      .split(/\s+/)
      // Saca símbolos sueltos que el OCR pega a la primera/última palabra
      // (checkbox de la fila, guiones, corchetes) — solo dejamos letras.
      .map((p) => p.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ-]/g, '').trim())
      .filter((p) => (p.length > 2 || PALABRAS_CORTAS_VALIDAS.has(p.toUpperCase())) && !PALABRAS_IGNORADAS.has(p.toUpperCase()))
      .join(' ')
      .trim();

    // Dos cheques distintos pueden tener el mismo CUIT emisor (misma
    // empresa, cheques distintos) — lo que no puede repetirse es el N° de
    // cheque, así que deduplicamos por cuit+número y no solo por cuit.
    const clave = cuit + '|' + numeroCheque;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    resultado.push({ cuit, valido: esCuitValido(cuit), numeroCheque, monto, emisorNombre });
  }

  return resultado;
}
