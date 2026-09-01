export type Rol = 'admin' | 'operador';

export interface BaseRecord {
  id: string;
  created: string;
  updated: string;
}

export interface Chofer extends BaseRecord {
  nombre: string;
  localidad?: string;
  activo: boolean;
}

export interface Vehiculo extends BaseRecord {
  codigo: string;
  marca_modelo?: string;
  activo: boolean;
}

export interface Cliente extends BaseRecord {
  nombre: string;
  activo: boolean;
}

export interface Ruta extends BaseRecord {
  origen: string;
  destino: string;
  cliente?: string;
  activo: boolean;
}

export interface Tarifa extends BaseRecord {
  mes: string; // "YYYY-MM"
  tarifa_km: number;
  valor_viatico_noche?: number;
}

export interface Tramo extends BaseRecord {
  tractor?: string;
  dia_salida: string; // "YYYY-MM-DD"
  hora_salida?: string;
  dia_llegada?: string;
  hora_llegada?: string;
  origen?: string;
  destino?: string;
  cliente?: string;
  es_posicionamiento?: boolean;
  peajes?: number;
  gastos_varios?: number;
  km_alargue?: number;
  comida_viaje?: number;
  comida_internacional?: number;
  entrega_retiro_sfco?: number;
  interrupcion?: number;
  cyd_manual?: number;
  control_gral?: number;
  descanso?: number;
  vale_nro?: string;
  vale_importe?: number;
  total_gastos?: number;
  km_recorridos?: number;
  km_dobles?: number;
  control?: boolean;
  permanencia?: number;
  cruce_frontera?: number;
  chofer: string;
  mes: string; // "YYYY-MM", calculado de dia_salida
}

export interface Usuario extends BaseRecord {
  username: string;
  email?: string;
  nombre?: string;
  rol: Rol;
  activo: boolean;
  modulos?: string[];
}

export interface ModuleDef {
  id: string;
  label: string;
  group: string;
  path: string; // ej: "liquidacion/planilla-choferes"
}

export const MODULES: ModuleDef[] = [
  { id: 'planilla_choferes', label: 'Planilla Choferes', group: 'Liquidación', path: 'liquidacion/planilla-choferes' },
];
