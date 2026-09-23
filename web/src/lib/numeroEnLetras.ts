// Port directo de Conversion.cs (Aplicacion Impresion Recibo v3), la
// misma redacción en mayúsculas que ya usa el recibo manual.
function numeroATexto(valorEntrada: number): string {
  const valor = Math.trunc(valorEntrada);
  if (valor === 0) return 'CERO';
  if (valor === 1) return 'UNO';
  if (valor === 2) return 'DOS';
  if (valor === 3) return 'TRES';
  if (valor === 4) return 'CUATRO';
  if (valor === 5) return 'CINCO';
  if (valor === 6) return 'SEIS';
  if (valor === 7) return 'SIETE';
  if (valor === 8) return 'OCHO';
  if (valor === 9) return 'NUEVE';
  if (valor === 10) return 'DIEZ';
  if (valor === 11) return 'ONCE';
  if (valor === 12) return 'DOCE';
  if (valor === 13) return 'TRECE';
  if (valor === 14) return 'CATORCE';
  if (valor === 15) return 'QUINCE';
  if (valor < 20) return 'DIECI' + numeroATexto(valor - 10);
  if (valor === 20) return 'VEINTE';
  if (valor < 30) return 'VEINTI' + numeroATexto(valor - 20);
  if (valor === 30) return 'TREINTA';
  if (valor === 40) return 'CUARENTA';
  if (valor === 50) return 'CINCUENTA';
  if (valor === 60) return 'SESENTA';
  if (valor === 70) return 'SETENTA';
  if (valor === 80) return 'OCHENTA';
  if (valor === 90) return 'NOVENTA';
  if (valor < 100) return numeroATexto(Math.trunc(valor / 10) * 10) + ' Y ' + numeroATexto(valor % 10);
  if (valor === 100) return 'CIEN';
  if (valor < 200) return 'CIENTO ' + numeroATexto(valor - 100);
  if ([200, 300, 400, 600, 800].includes(valor)) return numeroATexto(Math.trunc(valor / 100)) + 'CIENTOS';
  if (valor === 500) return 'QUINIENTOS';
  if (valor === 700) return 'SETECIENTOS';
  if (valor === 900) return 'NOVECIENTOS';
  if (valor < 1000) return numeroATexto(Math.trunc(valor / 100) * 100) + ' ' + numeroATexto(valor % 100);
  if (valor === 1000) return 'MIL';
  if (valor < 2000) return 'MIL ' + numeroATexto(valor % 1000);
  if (valor < 1000000) {
    let texto = numeroATexto(Math.trunc(valor / 1000)) + ' MIL';
    if (valor % 1000 > 0) texto += ' ' + numeroATexto(valor % 1000);
    return texto;
  }
  if (valor === 1000000) return 'UN MILLON';
  if (valor < 2000000) return 'UN MILLON ' + numeroATexto(valor % 1000000);
  if (valor < 1000000000000) {
    const resto = valor - Math.trunc(valor / 1000000) * 1000000;
    let texto = numeroATexto(Math.trunc(valor / 1000000)) + ' MILLONES';
    if (resto > 0) texto += ' ' + numeroATexto(resto);
    return texto;
  }
  if (valor === 1000000000000) return 'UN BILLON';
  if (valor < 2000000000000) return 'UN BILLON ' + numeroATexto(valor - Math.trunc(valor / 1000000000000) * 1000000000000);
  const resto = valor - Math.trunc(valor / 1000000000000) * 1000000000000;
  let texto = numeroATexto(Math.trunc(valor / 1000000000000)) + ' BILLONES';
  if (resto > 0) texto += ' ' + numeroATexto(resto);
  return texto;
}

export function importeEnLetras(importe: number): string {
  const entero = Math.trunc(importe);
  const centavos = Math.round((importe - entero) * 100);
  const dec = centavos > 0 ? ` CON ${centavos}/100` : '';
  return numeroATexto(entero) + dec;
}
