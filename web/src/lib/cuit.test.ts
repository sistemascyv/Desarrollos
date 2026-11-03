import { describe, it, expect } from 'vitest';
import {
  esCuitValido,
  tipoPersonaPorCuit,
  situacionADias,
  tipoSociedadDeDenominacion,
  extraerCandidatosCuit,
  extraerChequesDeLineas,
} from './cuit';

describe('esCuitValido', () => {
  it('acepta un CUIT válido de persona física', () => {
    expect(esCuitValido('20123456786')).toBe(true);
  });

  it('acepta un CUIT válido de persona jurídica', () => {
    expect(esCuitValido('30710407165')).toBe(true);
  });

  it('rechaza un CUIT con dígito verificador incorrecto', () => {
    expect(esCuitValido('20123456780')).toBe(false);
  });

  it('rechaza un string que no tiene 11 dígitos', () => {
    expect(esCuitValido('1234567890')).toBe(false);
  });

  it('rechaza un string con caracteres no numéricos', () => {
    expect(esCuitValido('2012345678A')).toBe(false);
  });

  it('rechaza el esquema especial donde el verificador calculado es 10', () => {
    expect(esCuitValido('00000000069')).toBe(false);
  });
});

describe('tipoPersonaPorCuit', () => {
  it('reconoce prefijo 20 como Física', () => {
    expect(tipoPersonaPorCuit('20123456786')).toBe('Física');
  });

  it('reconoce prefijo 30 como Jurídica', () => {
    expect(tipoPersonaPorCuit('30710407165')).toBe('Jurídica');
  });

  it('devuelve null para un prefijo no clasificado', () => {
    expect(tipoPersonaPorCuit('50123456786')).toBeNull();
  });
});

describe('situacionADias', () => {
  it('clasifica situación 0 o 1 como normal hasta 31 días', () => {
    expect(situacionADias(0)).toBe('Hasta 31 días (situación normal)');
    expect(situacionADias(1)).toBe('Hasta 31 días (situación normal)');
  });

  it('clasifica situación 2 como 32 a 90 días', () => {
    expect(situacionADias(2)).toBe('32 a 90 días');
  });

  it('clasifica situación 3 como 91 a 180 días', () => {
    expect(situacionADias(3)).toBe('91 a 180 días');
  });

  it('clasifica situación 4 como 181 a 365 días', () => {
    expect(situacionADias(4)).toBe('181 a 365 días');
  });

  it('clasifica situación 5 o más como más de 365 días', () => {
    expect(situacionADias(5)).toBe('Más de 365 días');
    expect(situacionADias(6)).toBe('Más de 365 días');
  });
});

describe('tipoSociedadDeDenominacion', () => {
  it('reconoce el sufijo S.A.', () => {
    expect(tipoSociedadDeDenominacion('DREAN S.A.')).toBe('S.A.');
  });

  it('reconoce el sufijo S.R.L.', () => {
    expect(tipoSociedadDeDenominacion('TRANSPORTE SRL')).toBe('S.R.L.');
  });

  it('reconoce Cooperativa cuando termina en COOPERATIVA LTDA', () => {
    expect(tipoSociedadDeDenominacion('CONSORCIO COOPERATIVA LTDA')).toBe('Cooperativa');
  });

  it('devuelve null si no matchea ningún sufijo conocido', () => {
    expect(tipoSociedadDeDenominacion('JUAN PEREZ')).toBeNull();
  });

  it('devuelve null si la denominación es null', () => {
    expect(tipoSociedadDeDenominacion(null)).toBeNull();
  });
});

describe('extraerCandidatosCuit', () => {
  it('extrae un CUIT válido y uno invalido de texto OCR, válidos primero', () => {
    const resultado = extraerCandidatosCuit(
      'CUIT: 20123456786 Importe $100, otro invalido 11111111111'
    );
    expect(resultado).toEqual([
      { cuit: '20123456786', valido: true },
      { cuit: '11111111111', valido: false },
    ]);
  });

  it('reconoce el formato con separadores XX-XXXXXXXX-X', () => {
    const resultado = extraerCandidatosCuit('Emisor 20-12345678-6 Importe $500');
    expect(resultado).toEqual([{ cuit: '20123456786', valido: true }]);
  });

  it('no duplica el mismo CUIT si aparece dos veces', () => {
    const resultado = extraerCandidatosCuit('20123456786 y de nuevo 20123456786');
    expect(resultado).toEqual([{ cuit: '20123456786', valido: true }]);
  });
});

describe('extraerChequesDeLineas', () => {
  it('parsea una línea simple con fecha, N° de cheque, importe, CUITs y emisor', () => {
    const lineas = [
      '05/03/2026 1234567 $298.380,82 20123456786 DREAN SA ACTIVO 30710407165',
    ];
    expect(extraerChequesDeLineas(lineas)).toEqual([
      {
        cuit: '30710407165',
        valido: true,
        numeroCheque: '1234567',
        monto: '298380.82',
        emisorNombre: 'DREAN SA',
      },
    ]);
  });

  it('pega una razón social envuelta en la línea anterior a la fila ancla', () => {
    const lineas = [
      'SUCESORES DE',
      '05/03/2026 1234567 $298.380,82 20123456786 ALFREDO WILLINER ACTIVO 30710407165',
    ];
    expect(extraerChequesDeLineas(lineas)).toEqual([
      {
        cuit: '30710407165',
        valido: true,
        numeroCheque: '1234567',
        monto: '298380.82',
        emisorNombre: 'SUCESORES DE ALFREDO WILLINER',
      },
    ]);
  });
});
