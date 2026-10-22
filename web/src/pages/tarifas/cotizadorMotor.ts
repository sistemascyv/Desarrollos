import type { CuadroTarifarioFila, CuadroTarifarioMinimos, Sucursal } from '../../types';
import { isoDate } from '../../lib/format';

// Mismo orden/criterio que CuadroTarifarioPage.tsx: C=Cordoba, S=San
// Francisco, R=Rosario, B=Buenos Aires.
const LETRA_SUCURSAL: Record<Sucursal, string> = {
  cordoba: 'C', rosario: 'R', san_francisco: 'S', buenos_aires: 'B',
};

// Las 10 claves no siguen una regla de orden simple (no es alfabetico ni
// por precedencia fija -- ver Global Constraints del plan), asi que se
// prue({ba ambos ordenes contra este set en vez de intentar derivarlo.
const CLAVES_ZONA_VALIDAS = ['CC', 'CS', 'CR', 'CB', 'RR', 'RS', 'RB', 'SS', 'SB', 'BB'];

export function claveZona(origen: Sucursal, destino: Sucursal): string | null {
  const a = LETRA_SUCURSAL[origen];
  const b = LETRA_SUCURSAL[destino];
  if (CLAVES_ZONA_VALIDAS.includes(a + b)) return a + b;
  if (CLAVES_ZONA_VALIDAS.includes(b + a)) return b + a;
  return null;
}

export function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ItemCalculado {
  precio: number;
  total: number;
  porUnidad: boolean;
}

// null = no se pudo calcular: ni kilos ni m3 cargados, ninguno cae en una
// banda de la tabla, o la banda que ganó es "por Kg" (>=1101 Kg) sin
// kilos cargados (no se inventa un peso a partir del volumen).
export function calcularItem(filasSeco: CuadroTarifarioFila[], kilos: number, m3: number, clave: string): ItemCalculado | null {
  const filaKg = kilos > 0 ? filasSeco.find((f) => kilos >= f.rango_kg_desde && kilos <= f.rango_kg_hasta) : undefined;
  const filaM3 = m3 > 0 ? filasSeco.find((f) => f.rango_m3_desde != null && f.rango_m3_hasta != null && m3 >= f.rango_m3_desde && m3 <= f.rango_m3_hasta) : undefined;

  // Si la fila matcheo pero le falta justo esa clave de zona (dato
  // incompleto), no se inventa un precio $0 -- se descarta esa fila como
  // candidata, igual criterio que "ninguna fila matcheo".
  const candidatos: { fila: CuadroTarifarioFila; precio: number }[] = [];
  if (filaKg?.valores?.[clave] != null) candidatos.push({ fila: filaKg, precio: filaKg.valores[clave] });
  if (filaM3?.valores?.[clave] != null) candidatos.push({ fila: filaM3, precio: filaM3.valores[clave] });
  if (candidatos.length === 0) return null;

  const elegido = candidatos.reduce((a, b) => (b.precio > a.precio ? b : a));
  const porUnidad = !!elegido.fila.por_unidad;
  if (porUnidad && kilos <= 0) return null;

  const total = porUnidad ? redondear2(elegido.precio * kilos) : elegido.precio;
  return { precio: elegido.precio, total, porUnidad };
}

export function minimoDeSucursal(minimos: CuadroTarifarioMinimos, sucursal: Sucursal): number {
  return minimos[sucursal];
}

export interface TotalesCotizacion {
  subTotal: number;
  recargo: number;
  seguro: number;
  netoGravado: number;
  iva: number;
  total: number;
}

export function calcularTotales(params: {
  totalesItems: number[];
  valorDeclaradoTotal: number;
  minimoAplicable: number;
  seguroActivo: boolean;
  seguroPorcentaje: number;
  contraReembolso: number;
  taxiFlet: number;
}): TotalesCotizacion {
  const subTotal = redondear2(params.totalesItems.reduce((a, b) => a + b, 0));
  const recargo = redondear2(Math.max(0, params.minimoAplicable - subTotal));
  const seguro = redondear2(params.seguroActivo ? params.valorDeclaradoTotal * (params.seguroPorcentaje / 100) : 0);
  const netoGravado = redondear2(subTotal + recargo + seguro + params.contraReembolso + params.taxiFlet);
  const iva = redondear2(netoGravado * 0.21);
  const total = redondear2(netoGravado + iva);
  return { subTotal, recargo, seguro, netoGravado, iva, total };
}

export function fechaVencimiento(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00');
  d.setDate(d.getDate() + 10);
  return isoDate(d);
}
