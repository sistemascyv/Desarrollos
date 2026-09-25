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

export interface ValeCaja extends BaseRecord {
  numero: number;
  fecha: string;
  chofer: string;
  nombre_firma: string;
  importe: number;
  moneda: 'ARS' | 'BRL';
  observacion1?: string;
  observacion2?: string;
  usado: boolean;
  creado_por?: string;
}

export interface Vehiculo extends BaseRecord {
  codigo: string;
  patente?: string;
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
  km_reales?: number;
  km_convenio?: number;
  activo: boolean;
}

export interface Tarifa extends BaseRecord {
  mes: string; // "YYYY-MM"
  tarifa_km: number;
  valor_viatico_noche?: number;
  creado_por?: string; // lo completa el servidor
  editado_por?: string;
}

// Un mes en esta lista no admite cambios en tramos ni tarifas hasta que un
// admin lo reabra (pb_hooks/planilla.pb.js).
export interface PeriodoCerrado extends BaseRecord {
  mes: string; // "YYYY-MM"
  cerrado_por?: string;
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
  litros_consumidos?: number;
  litros_intermedios?: number; // repostaje en ruta (no en el inicio/fin del viaje)
  litros_equipo_frio?: number;
  chofer: string;
  mes: string; // "YYYY-MM", calculado de dia_salida
  creado_por?: string; // los completa el servidor (auditoría)
  editado_por?: string;
}

export interface Usuario extends BaseRecord {
  username: string;
  email?: string;
  nombre?: string;
  rol: Rol;
  activo: boolean;
  modulos?: string[];
}

export type EstadoCheque = 'pendiente' | 'aceptado' | 'rechazado';

export interface BcraRechazo {
  causal: string | null;
  entidad: number | null;
  nroCheque: number | string;
  fechaRechazo: string;
  monto: number;
  fechaPago: string | null;
  fechaPagoMulta: string | null;
  estadoMulta: string | null;
  enRevision: boolean;
  procesoJud: boolean;
}

export interface BcraDeuda {
  entidad: string | null;
  situacion: number | null;
  monto: number | null;
  diasAtrasoPago?: number | null;
  refinanciaciones?: boolean;
  recategorizacionOblig?: boolean;
  situacionJuridica?: boolean;
  irrecDisposicionTecnica?: boolean;
  enRevision?: boolean;
  procesoJud?: boolean;
}

export interface BcraDeudaHistorica {
  periodo: string | null;
  entidad: string | null;
  situacion: number | null;
  monto: number | null;
  enRevision?: boolean;
  procesoJud?: boolean;
}

export interface BcraResultado {
  cuit: string;
  denominacion: string | null;
  tieneRechazados: boolean;
  rechazos: BcraRechazo[];
}

// Reporte completo de un CUIT para el módulo Central de Deudores — sin
// "tieneRechazados" (eso es un resumen puntual de Control de Cheques),
// con deuda actual e histórica siempre presentes.
export interface DeudorReporte {
  cuit: string;
  denominacion: string | null;
  deudaActual: BcraDeuda[];
  deudaHistorica: BcraDeudaHistorica[];
  rechazos: BcraRechazo[];
}

// Situaciones del BCRA (Central de Deudores): 0 sin información, 1
// normal, 2 seguimiento especial, 3 con problemas, 4 alto riesgo de
// insolvencia, 5/6 irrecuperable.
export const SITUACION_BCRA: Record<number, string> = {
  0: 'Sin información',
  1: 'Situación normal',
  2: 'Seguimiento especial',
  3: 'Con problemas',
  4: 'Alto riesgo de insolvencia',
  5: 'Irrecuperable',
  6: 'Irrecuperable',
};

export interface Cheque extends BaseRecord {
  imagen: string;
  cuit_emisor: string;
  emisor_nombre?: string;
  numero_cheque?: string;
  monto?: number;
  estado: EstadoCheque;
  bcra_consultado?: boolean;
  bcra_tiene_rechazados?: boolean;
  bcra_detalle?: BcraResultado;
  bcra_fecha_consulta?: string;
  notas?: string;
}

export interface ReporteArchivo extends BaseRecord {
  tipo: 'combustible' | 'cubiertas';
  nombre_archivo: string;
  usuario?: string;
  datos: unknown;
  expand?: { usuario?: Usuario };
}

// Fichadas (RRHH) — análisis del reloj biométrico. `dias` describe la
// semana completa (7 entradas) de una plantilla de horario u horario
// personalizado: cada día trae sus pares [entradaMin, salidaMin] (0-1439,
// minutos desde medianoche) — más de un par = turno partido.
export interface DiaHorario {
  dia: number; // 1=lunes .. 7=domingo
  trabaja: boolean;
  pares: [number, number][];
}

export interface FichadasEmpresa extends BaseRecord {
  nombre: string;
}

export interface FichadasHorario extends BaseRecord {
  nombre: string;
  dias: DiaHorario[];
}

export interface FichadasLegajo extends BaseRecord {
  nro_legajo?: string;
  nro_tarjeta: string;
  nombre: string;
  dni?: string;
  empresa?: string;
  horario?: string;
  dias_personalizados?: DiaHorario[] | null;
  estado: boolean;
  expand?: { empresa?: FichadasEmpresa; horario?: FichadasHorario };
}

export interface FichadasMarca extends BaseRecord {
  legajo?: string;
  tarjeta: string;
  fecha: string; // "YYYY-MM-DD"
  hora: string; // "HH:MM"
  minutos: number;
  deposito?: string;
  reloj?: string;
  archivo_origen?: string;
}

export interface FichadasNovedad extends BaseRecord {
  legajo: string;
  fecha: string;
  texto: string;
}

export interface FichadasFeriado extends BaseRecord {
  fecha: string;
  nombre?: string;
}

export interface ModuleDef {
  id: string;
  label: string;
  group: string;
  path: string; // ej: "liquidacion/planilla-choferes"
}

export const MODULES: ModuleDef[] = [
  { id: 'planilla_choferes', label: 'Planilla Choferes', group: 'RRHH', path: 'liquidacion/planilla-choferes' },
  { id: 'control_cheques', label: 'Control de Cheques', group: 'TESORERIA', path: 'finanzas/control-cheques' },
  { id: 'central_deudores', label: 'Central de Deudores', group: 'TESORERIA', path: 'finanzas/central-deudores' },
  { id: 'vale_caja', label: 'Vale de Caja', group: 'TESORERIA', path: 'finanzas/vale-de-caja' },
  { id: 'consumo_combustible', label: 'Consumo de Combustible', group: 'MANTENIMIENTO', path: 'flota/consumo-combustible' },
  { id: 'panel_cubiertas', label: 'Panel de Cubiertas', group: 'MANTENIMIENTO', path: 'flota/panel-cubiertas' },
  { id: 'flota_posicion', label: 'Posición de Flota', group: 'MANTENIMIENTO', path: 'flota/posicion' },
  { id: 'fichadas', label: 'Fichadas', group: 'RRHH', path: 'rrhh/fichadas' },
  { id: 'bot_tarifas', label: 'Actualizar Tarifas', group: 'COMERCIAL', path: 'comercial/bot-tarifas' },
];

// Resultado de una corrida del Bot Act Tarifas (Python + Selenium, corre en
// una PC de la oficina) contra el sistema de ventas de terceros.
export interface SucursalTarifaAjuste {
  antes: string | null;
  despues: string | null;
  cambio_pct: number | null;
  ok: boolean;
}

export interface TarifaBotAjuste extends BaseRecord {
  porcentaje: number;
  exito?: boolean;
  sucursales?: Record<string, SucursalTarifaAjuste>;
  basicas?: Record<string, SucursalTarifaAjuste>;
  error?: string;
  ejecutado_por?: string;
  entorno?: 'test' | 'produccion' | '';
}
