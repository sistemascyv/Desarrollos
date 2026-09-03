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

// Extrae del texto crudo de OCR todas las secuencias de 11 dígitos
// (con o sin guiones, ej. "30-71234567-9" o "30712345679") que además
// pasan la validación de dígito verificador.
export function extraerCuitsValidos(textoOcr: string): string[] {
  const candidatos = textoOcr.match(/\d[\d-]{9,14}\d/g) || [];
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const c of candidatos) {
    const soloDigitos = c.replace(/[^0-9]/g, '');
    if (soloDigitos.length !== 11) continue;
    if (!esCuitValido(soloDigitos)) continue;
    if (vistos.has(soloDigitos)) continue;
    vistos.add(soloDigitos);
    resultado.push(soloDigitos);
  }
  return resultado;
}
