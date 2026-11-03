// Fija la zona horaria ANTES de cualquier otra cosa: fechaHora() formatea con
// toLocaleString, que depende de la TZ del proceso. Sin esto, el test pasa en
// una máquina en horario de Argentina y falla en CI (que corre en UTC).
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { describe, it, expect } from 'vitest';
import { money, isoDate, monthLabel, uid, fechaHora, fechaSola } from './format';

describe('money', () => {
  it('formatea un número entero como moneda ARS', () => {
    expect(money(1000)).toContain('1.000,00');
    expect(money(1000)).toContain('$');
  });

  it('formatea un número con decimales', () => {
    expect(money(1234.5)).toContain('1.234,50');
  });

  it('devuelve cero formateado para valores no numéricos', () => {
    expect(money('abc')).toContain('0,00');
  });

  it('devuelve cero formateado para undefined', () => {
    expect(money(undefined)).toContain('0,00');
  });
});

describe('isoDate', () => {
  it('formatea una fecha como YYYY-MM-DD con ceros a la izquierda', () => {
    expect(isoDate(new Date(2026, 2, 5))).toBe('2026-03-05');
  });
});

describe('monthLabel', () => {
  it('convierte "YYYY-MM" al nombre del mes capitalizado en español', () => {
    expect(monthLabel('2026-03')).toBe('Marzo de 2026');
  });

  it('funciona para el primer mes del año', () => {
    expect(monthLabel('2026-01')).toBe('Enero de 2026');
  });
});

describe('uid', () => {
  it('devuelve un string con el formato tmp_<timestamp>_<random>', () => {
    expect(uid()).toMatch(/^tmp_\d+_[a-z0-9]+$/);
  });

  it('genera valores distintos en llamadas sucesivas', () => {
    expect(uid()).not.toBe(uid());
  });
});

describe('fechaHora', () => {
  it('devuelve string vacío para null o undefined', () => {
    expect(fechaHora(null)).toBe('');
    expect(fechaHora(undefined)).toBe('');
  });

  it('formatea una fecha-hora de PocketBase (con espacio en vez de T) a horario de Argentina', () => {
    expect(fechaHora('2026-09-22 12:34:56.789Z')).toBe('22/9/2026, 09:34:56');
  });
});

describe('fechaSola', () => {
  it('devuelve string vacío para null o undefined', () => {
    expect(fechaSola(null)).toBe('');
    expect(fechaSola(undefined)).toBe('');
  });

  it('formatea una fecha de PocketBase a DD/MM/YYYY sin corrimiento de día por UTC', () => {
    expect(fechaSola('2026-09-23 00:00:00.000Z')).toBe('23/09/2026');
  });

  it('funciona para el primer día de un mes de un solo dígito', () => {
    expect(fechaSola('2026-01-05 00:00:00.000Z')).toBe('05/01/2026');
  });
});
