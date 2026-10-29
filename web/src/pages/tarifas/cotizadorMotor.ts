import type { CuadroTarifarioFila, CuadroTarifarioMinimos, Sucursal } from '../../types';
import { isoDate } from '../../lib/format';

// Mismo orden/criterio que CuadroTarifarioPage.tsx: C=Cordoba, S=San
// Francisco, R=Rosario, B=Buenos Aires.
const LETRA_SUCURSAL: Record<Sucursal, string> = {
  cordoba: 'C', rosario: 'R', san_francisco: 'S', buenos_aires: 'B',
};

// Las 10 claves no siguen una regla de orden simple (no es alfabetico ni
// por precedencia fija -- ver Global Constraints del plan), asi que se
// prueba ambos ordenes contra este set en vez de intentar derivarlo.
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

// Primera banda (ordenadas de menor a mayor) cuyo limite superior cubre
// el valor real -- en vez de pedir desde<=valor<=hasta, que deja afuera
// cualquier valor no entero que caiga justo en el hueco entre el "hasta"
// de una banda entera y el "desde" de la siguiente (las bandas de la
// tabla son en kilos/m3 enteros, pero un peso real de bascula no lo es).
function bandaPorLimiteSuperior(filas: CuadroTarifarioFila[], valor: number, hasta: (f: CuadroTarifarioFila) => number | null | undefined): CuadroTarifarioFila | undefined {
  return filas.find((f) => {
    const h = hasta(f);
    return h != null && valor <= h;
  });
}

// null = no se pudo calcular: ni kilos ni m3 cargados, ninguno cae en una
// banda de la tabla, o la unica candidata disponible es "por Kg" (>=1101
// Kg) sin kilos cargados (no se inventa un peso a partir del volumen).
export function calcularItem(filasSeco: CuadroTarifarioFila[], kilos: number, m3: number, clave: string): ItemCalculado | null {
  const filaKg = kilos > 0 ? bandaPorLimiteSuperior(filasSeco, kilos, (f) => f.rango_kg_hasta) : undefined;
  const filaM3 = m3 > 0 ? bandaPorLimiteSuperior(filasSeco, m3, (f) => f.rango_m3_hasta) : undefined;

  // Si la fila matcheo pero le falta justo esa clave de zona (dato
  // incompleto), no se inventa un precio $0 -- se descarta esa fila como
  // candidata, igual criterio que "ninguna fila matcheo". Una fila "por
  // Kg" sin kilos tampoco entra a competir (no hay peso real para
  // convertir su precio-por-kg en un total) -- se descarta aca, no
  // despues de elegir, porque "por Kg" solo puede matchear via m3 cuando
  // kilos<=0 (si kilos>0 esa misma fila hubiera entrado tambien por
  // filaKg), asi que nunca hay otra candidata valida que se pierda por
  // filtrar esta antes.
  const candidatos: ItemCalculado[] = [];
  for (const fila of [filaKg, filaM3]) {
    const precio = fila?.valores?.[clave];
    if (fila == null || precio == null) continue;
    const porUnidad = !!fila.por_unidad;
    if (porUnidad && kilos <= 0) continue;
    const total = porUnidad ? redondear2(precio * kilos) : precio;
    candidatos.push({ precio, total, porUnidad });
  }
  if (candidatos.length === 0) return null;

  // Gana el candidato cuyo TOTAL real es mas caro -- nunca el precio de
  // tabla crudo. Una fila "por Kg" guarda un precio POR KG, no el total
  // de la banda, asi que comparar precio contra precio de una fila de
  // monto fijo compara unidades distintas (ej: 103,18 $/Kg contra
  // $65.790,87 de monto fijo -- el precio crudo es "mas barato" pero el
  // total real para 1500 Kg es $154.770, muy por encima).
  return candidatos.reduce((a, b) => (b.total > a.total ? b : a));
}

// Frio/Congelado: a diferencia de Seco, esas tablas no tienen columna de
// zona ni de m3 -- el precio es un valor fijo por banda de Kg, sin
// comparar candidatos ni zona de trafico.
export function calcularItemFrioCongelado(filas: CuadroTarifarioFila[], kilos: number): ItemCalculado | null {
  if (kilos <= 0) return null;
  const fila = bandaPorLimiteSuperior(filas, kilos, (f) => f.rango_kg_hasta);
  if (!fila || fila.valor == null) return null;
  return { precio: fila.valor, total: fila.valor, porUnidad: false };
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
