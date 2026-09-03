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
