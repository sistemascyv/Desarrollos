import { describe, it, expect } from 'vitest';
import { importeEnLetras } from './numeroEnLetras';

describe('importeEnLetras', () => {
  it('convierte cero', () => {
    expect(importeEnLetras(0)).toBe('CERO');
  });

  it('convierte un número simple de un dígito', () => {
    expect(importeEnLetras(1)).toBe('UNO');
  });

  it('convierte un número de la serie VEINTI (21)', () => {
    expect(importeEnLetras(21)).toBe('VEINTIUNO');
  });

  it('convierte cien exacto', () => {
    expect(importeEnLetras(100)).toBe('CIEN');
  });

  it('convierte ciento uno', () => {
    expect(importeEnLetras(101)).toBe('CIENTO UNO');
  });

  it('convierte mil quinientos', () => {
    expect(importeEnLetras(1500)).toBe('MIL QUINIENTOS');
  });

  it('convierte dos mil quinientos', () => {
    expect(importeEnLetras(2500)).toBe('DOS MIL QUINIENTOS');
  });

  it('convierte un millón exacto', () => {
    expect(importeEnLetras(1000000)).toBe('UN MILLON');
  });

  it('convierte un monto grande con millones, miles y centavos', () => {
    expect(importeEnLetras(1234567.89)).toBe(
      'UN MILLON DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE CON 89/100'
    );
  });

  it('agrega la leyenda CON X/100 solo cuando hay centavos', () => {
    expect(importeEnLetras(250.5)).toBe('DOSCIENTOS CINCUENTA CON 50/100');
    expect(importeEnLetras(250)).not.toContain('CON');
  });
});
