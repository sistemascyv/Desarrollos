import type { DiaHorario, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad } from '../../types';

// Motor de cálculo de fichadas — portado 1:1 de la lógica ya validada en
// el prototipo standalone (fichadas_prototipo.html). Misma fórmula de
// H N / H E, misma tolerancia de matching, mismo redondeo por depósito.
// Cualquier cambio acá debe revisarse contra ese prototipo.

export const DIAS_NOMBRE = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const TOLERANCIA_MIN = 180;
// tope de tramos reales por día que soportan las planillas (Parte Diario
// de CINTIA trae 4 pares Ent/Sal de "horarios trabajados")
const MAX_TRAMOS = 4;

export interface ResultadoDia {
  idLegajo: string;
  nroLegajo: string;
  identificador: string; // nro_tarjeta
  nombre: string;
  dni: string;
  area: string;
  deposito: string;
  fecha: string;
  dia: string;
  paresEsperados: [number, number][];
  paresReales: [number | null, number | null][];
  hN: number;
  hE: number;
  ausente: boolean;
  novedad: string;
  causa: string; // '' (no es ausencia), 'Sin Justificar', o una de CAUSAS_AUSENTISMO
}

// Lista fija, igual a la que ya usaba el Excel de RRHH -- no agregar ni
// sacar ninguna sin actualizar también la migración del campo `causa`.
export const CAUSAS_AUSENTISMO: string[] = [
  'Enfermedad', 'Accidente', 'COVID-19', 'Examen', 'Permiso Gremial', 'Capacitación',
  'Casamiento', 'Nacimiento', 'Fallecimiento de Familiar', 'Donación de Sangre', 'Mudanza',
  'Fam. Enfermo', 'Razones Particulares', 'Maternidad', 'Cuarentena', 'PARO', 'Suspendido',
];
export const CAUSA_SIN_JUSTIFICAR = 'Sin Justificar';

function jsDayToColumnDia(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

function fechaAMinutosAbsolutos(fechaStr: string): number {
  const [y, m, d] = fechaStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 60000;
}

function fechaAUtcMs(fechaStr: string): number {
  const [y, m, d] = fechaStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function incrementoRedondeo(deposito: string | null): number {
  return deposito === 'CORDOBA' ? 15 : 30;
}

function horarioEsperado(legajo: FichadasLegajo, dia: number): { trabaja: boolean; pares: [number, number][] } {
  const diasFuente: DiaHorario[] = legajo.dias_personalizados ?? legajo.expand?.horario?.dias ?? [];
  const fila = diasFuente.find((d) => d.dia === dia);
  if (!fila || !fila.pares.length) return { trabaja: false, pares: [] };
  return { trabaja: true, pares: fila.pares };
}

export function procesarPeriodo(params: {
  legajos: FichadasLegajo[];
  marcas: FichadasMarca[];
  novedades: FichadasNovedad[];
  feriados: FichadasFeriado[];
  empresaNombrePorId: Map<string, string>;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}): { resultados: ResultadoDia[]; tarjetasSinLegajo: string[] } {
  const { legajos, marcas, novedades, feriados, empresaNombrePorId, desde, hasta } = params;

  const legajoPorTarjeta = new Map<string, FichadasLegajo>();
  legajos.forEach((l) => legajoPorTarjeta.set(l.nro_tarjeta.trim(), l));

  const novedadPorLegajoFecha = new Map<string, { texto: string; causa: string }>();
  novedades.forEach((n) => novedadPorLegajoFecha.set(n.legajo + '|' + n.fecha, { texto: n.texto, causa: n.causa || '' }));
  const feriadoPorFecha = new Map<string, string>();
  feriados.forEach((f) => feriadoPorFecha.set(f.fecha, f.nombre || 'Feriado'));

  function novedadManual(idLegajo: string, fecha: string): string {
    const m = novedadPorLegajoFecha.get(idLegajo + '|' + fecha);
    if (m) return m.texto;
    const f = feriadoPorFecha.get(fecha);
    if (f) return 'FERIADO — ' + f;
    return '';
  }

  const tarjetasSinLegajo = new Set<string>();
  const marcasPorLegajo = new Map<string, { abs: number; deposito: string }[]>();
  marcas.forEach((m) => {
    if (m.fecha < desde || m.fecha > hasta) return;
    const legajo = legajoPorTarjeta.get(m.tarjeta.trim());
    if (!legajo) {
      tarjetasSinLegajo.add(m.tarjeta);
      return;
    }
    const abs = fechaAMinutosAbsolutos(m.fecha) + m.minutos;
    if (!marcasPorLegajo.has(legajo.id)) marcasPorLegajo.set(legajo.id, []);
    marcasPorLegajo.get(legajo.id)!.push({ abs, deposito: m.deposito || '' });
  });
  marcasPorLegajo.forEach((arr) => arr.sort((a, b) => a.abs - b.abs));

  // Todo legajo activo tiene que evaluarse día por día aunque no tenga
  // ninguna fichada real en el período -- si alguien no vino nunca y nadie
  // cargó ninguna justificación, eso es exactamente "Sin Justificar", el
  // caso más claro de ausentismo sin justificar. Esto puede marcar de más
  // a alguien recién ingresado antes de su fecha_alta real -- si esa
  // fecha está cargada, la ventana de abajo ya lo corta; si no está
  // cargada (legajo de antes del sistema), sigue siendo una limitación
  // conocida y aceptada.
  // Un legajo dado de baja (estado=false) con fecha_baja cargada también se
  // siembra acá: el recorte de ventana de abajo lo acota a su [fecha_alta,
  // fecha_baja] real, así que si se fue mucho antes del período pedido
  // simplemente no entra en ningún día del loop -- sembrarlo no agrega nada
  // de más, y deja evaluar sus días sin fichar previos a su baja real.
  legajos.forEach((l) => {
    if ((l.estado || l.fecha_baja) && !marcasPorLegajo.has(l.id)) {
      marcasPorLegajo.set(l.id, []);
    }
  });

  const [yD, mD, dD] = desde.split('-').map(Number);
  const [yH, mH, dH] = hasta.split('-').map(Number);
  const utcDesde = Date.UTC(yD, mD - 1, dD);
  const utcHasta = Date.UTC(yH, mH - 1, dH);

  const resultados: ResultadoDia[] = [];

  for (const [idLegajo, marcasGlobal] of marcasPorLegajo.entries()) {
    const legajo = legajos.find((l) => l.id === idLegajo);
    if (!legajo) continue;
    const usados = new Array(marcasGlobal.length).fill(false);
    const areaNombre = legajo.empresa ? empresaNombrePorId.get(legajo.empresa) || '—' : '—';

    // Ventana real de actividad de este legajo dentro del período pedido --
    // si tiene fecha_alta/fecha_baja cargada, no se generan resultados
    // fuera de ese rango (ex-empleado ya no cuenta después de su baja,
    // alta reciente no cuenta antes de su ingreso real). Sin esas fechas
    // cargadas, el comportamiento es igual al de siempre (todo el período).
    const ventanaDesde = legajo.fecha_alta ? Math.max(utcDesde, fechaAUtcMs(legajo.fecha_alta)) : utcDesde;
    const ventanaHasta = legajo.fecha_baja ? Math.min(utcHasta, fechaAUtcMs(legajo.fecha_baja)) : utcHasta;

    for (let cur = ventanaDesde; cur <= ventanaHasta; cur += 86400000) {
      const dt = new Date(cur);
      const fecha = dt.toISOString().slice(0, 10);
      const dia = jsDayToColumnDia(dt.getUTCDay());
      const nombreDia = DIAS_NOMBRE[dt.getUTCDay()];
      const { trabaja, pares } = horarioEsperado(legajo, dia);
      const anchorAbs = fechaAMinutosAbsolutos(fecha);
      const novedad = novedadManual(idLegajo, fecha);
      // Las horas fijas solo cuentan desde que el acuerdo está vigente --
      // sin horas_extra_fijas_desde cargado (cualquier legajo configurado
      // antes de este campo, o sin fecha puesta), se comporta igual que
      // siempre: se aplican sin ningún corte.
      const horaFijaBruta = (legajo.horas_extra_fijas || []).find((h) => h.dia === dia);
      const horaFijaDelDia = horaFijaBruta && (!legajo.horas_extra_fijas_desde || fecha >= legajo.horas_extra_fijas_desde)
        ? horaFijaBruta
        : undefined;

      if (!trabaja && !novedad && !horaFijaDelDia) continue; // día libre programado, sin novedad ni horas fijas vigentes: no se reporta

      const paresReales: [number | null, number | null][] = [];
      let worked = 0;
      let teoricoTotal = 0;
      let depositoDelDia: string | null = null;

      pares.forEach(([eEsp, sEsp]) => {
        const eEspAbs = anchorAbs + eEsp;
        const sEspAbs = anchorAbs + (sEsp >= eEsp ? sEsp : sEsp + 1440);
        teoricoTotal += sEspAbs - eEspAbs;

        let bestE = -1, bestEDiff = Infinity;
        marcasGlobal.forEach((m, idx) => {
          if (usados[idx]) return;
          const diff = Math.abs(m.abs - eEspAbs);
          if (diff < bestEDiff && diff <= TOLERANCIA_MIN) { bestEDiff = diff; bestE = idx; }
        });
        let bestS = -1, bestSDiff = Infinity;
        marcasGlobal.forEach((m, idx) => {
          if (usados[idx] || idx === bestE) return;
          const diff = Math.abs(m.abs - sEspAbs);
          if (diff < bestSDiff && diff <= TOLERANCIA_MIN) { bestSDiff = diff; bestS = idx; }
        });

        // solo consumimos las marcas si matcheó COMPLETO (entrada y salida)
        // contra este tramo esperado. Si solo matchea un lado (ej: alguien
        // que entra 3+hs antes de lo que dice su horario asignado, y esa
        // entrada temprana deja fuera de tolerancia a la salida real),
        // no la consumimos acá — queda libre para el paso de "tramos
        // extra" de abajo, que empareja entrada+salida reales aunque no
        // se parezcan al horario teórico.
        if (bestE >= 0 && bestS >= 0) {
          usados[bestE] = true; usados[bestS] = true;
          depositoDelDia = marcasGlobal[bestE].deposito;
          worked += marcasGlobal[bestS].abs - marcasGlobal[bestE].abs;
          paresReales.push([marcasGlobal[bestE].abs, marcasGlobal[bestS].abs]);
        }
      });

      // tramos extra: marcas sobrantes del mismo día calendario, no
      // matcheadas contra ningún par esperado (horario flexible / vueltas
      // a marcar fuera del turno teórico). Se emparejan de a 2 en orden
      // cronológico hasta completar el tope de tramos reales por día.
      if (paresReales.length < MAX_TRAMOS) {
        const diaIndexAnchor = Math.floor(anchorAbs / 1440);
        const sobrantes: number[] = [];
        marcasGlobal.forEach((m, idx) => {
          if (usados[idx]) return;
          if (Math.floor(m.abs / 1440) === diaIndexAnchor) sobrantes.push(idx);
        });
        sobrantes.sort((a, b) => marcasGlobal[a].abs - marcasGlobal[b].abs);
        let i = 0;
        while (i < sobrantes.length && paresReales.length < MAX_TRAMOS) {
          const idxE = sobrantes[i];
          const idxS = i + 1 < sobrantes.length ? sobrantes[i + 1] : null;
          usados[idxE] = true;
          depositoDelDia = depositoDelDia || marcasGlobal[idxE].deposito;
          if (idxS !== null) {
            usados[idxS] = true;
            depositoDelDia = depositoDelDia || marcasGlobal[idxS].deposito;
            worked += marcasGlobal[idxS].abs - marcasGlobal[idxE].abs;
            paresReales.push([marcasGlobal[idxE].abs, marcasGlobal[idxS].abs]);
            i += 2;
          } else {
            paresReales.push([marcasGlobal[idxE].abs, null]);
            i += 1;
          }
        }
      }

      const hN = teoricoTotal > 0 ? Math.min(worked, teoricoTotal) : worked;
      const hEcruda = Math.max(0, worked - teoricoTotal);
      const incremento = incrementoRedondeo(depositoDelDia);
      const hECalculada = Math.floor(hEcruda / incremento) * incremento;
      // Horas extra fijas por acuerdo (ej: Ludeña en Córdoba) -- se suman
      // siempre para el día de la semana configurado, haya fichado o no
      // ese día puntual, y sin pasar por el redondeo de arriba (no son
      // horas derivadas de fichadas reales).
      const hE = hECalculada + (horaFijaDelDia ? horaFijaDelDia.horas * 60 : 0);

      const sinNingunaMarca = paresReales.every((p) => p[0] === null && p[1] === null);
      const ausente = trabaja && sinNingunaMarca && !novedad;
      // Un feriado nunca puede aportar causa de ausentismo, aunque exista
      // una fichadas_novedades cargada para ese legajo+fecha (pasa seguido:
      // "Asignar novedad" carga un rango de fechas que puede pisar un
      // feriado sin que nadie lo note).
      const causaNovedad = feriadoPorFecha.has(fecha)
        ? ''
        : novedadPorLegajoFecha.get(idLegajo + '|' + fecha)?.causa || '';
      const causa = ausente ? CAUSA_SIN_JUSTIFICAR : causaNovedad;

      resultados.push({
        idLegajo, nroLegajo: legajo.nro_legajo || '', identificador: legajo.nro_tarjeta,
        nombre: legajo.nombre, dni: legajo.dni || '', area: areaNombre, deposito: depositoDelDia || '—',
        fecha, dia: nombreDia,
        paresEsperados: pares, paresReales,
        hN, hE, ausente, novedad, causa,
      });
    }
  }

  resultados.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.fecha.localeCompare(b.fecha));
  return { resultados, tarjetasSinLegajo: Array.from(tarjetasSinLegajo) };
}

export function fmtAbsHora(abs: number | null | undefined): string {
  if (abs === null || abs === undefined) return '—';
  const mins = ((abs % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtDur(min: number | null | undefined): string {
  if (min === null || min === undefined || isNaN(min)) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hhmmAMinutos(txt: string): number | null {
  const m = txt.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// ---------- parseo de los .txt crudos del reloj ----------

export interface MarcaParseada {
  tarjeta: string;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:MM
  minutos: number;
  deposito: string;
  reloj: string;
  archivo: string;
}

export function detectarDeposito(nombreArchivo: string): string {
  const n = nombreArchivo.toLowerCase();
  if (n.includes('cordoba') || n.includes('córdoba') || n.includes('cba')) return 'CORDOBA';
  if (n.includes('rosario')) return 'ROSARIO';
  if (n.includes('buenos_aires') || n.includes('bsas') || n.includes('bs_as') || n.includes('buenos aires') || n.includes('cortejarena')) return 'BUENOS AIRES';
  if (n.includes('san_francisco') || n.includes('san francisco')) return 'SAN FRANCISCO';
  return 'DESCONOCIDO';
}

export function parsearTxtReloj(texto: string, nombreArchivo: string): MarcaParseada[] {
  const deposito = detectarDeposito(nombreArchivo);
  const lines = texto.split(/\r?\n/).filter((l) => l.trim());
  const out: MarcaParseada[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    // formato: TARJETA DD/MM/AA HH:MM RELOJ MODO
    const m = line.trim().match(/^(\S+)\s+(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\s+(\S+)\s+(\S+)$/);
    if (!m) continue;
    const [, tarjeta, dd, mm, aa, hh, mi, reloj] = m;
    const fecha = `20${aa}-${mm}-${dd}`;
    const hora = `${hh}:${mi}`;
    const key = tarjeta + '|' + fecha + '|' + hora;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tarjeta, fecha, hora,
      minutos: parseInt(hh, 10) * 60 + parseInt(mi, 10),
      deposito, reloj, archivo: nombreArchivo,
    });
  }
  return out;
}

// ---------- Estadística de Horas Extras (agrupado por área y mes) ----------

export interface EstadisticaAreaMes {
  dotacion: number;
  hs: number; // horas (no minutos)
  hsTotalMes: number; // horas de TODAS las áreas ese mismo mes
  porcentaje: number; // hs / (dotacion * horasPosiblesMensuales), 0 si dotacion=0
  hsPorPersona: number; // hs / dotacion, 0 si dotacion=0
}

export interface FilaEstadisticaArea {
  area: string;
  meses: EstadisticaAreaMes[]; // 12 posiciones, índice 0=enero .. 11=diciembre
  promedioHs: number;
  totalHs: number;
}

export function calcularEstadisticaHorasExtras(params: {
  resultados: ResultadoDia[];
  areas: string[]; // nombres de área a incluir, en el orden a mostrar
  dotacionPorArea: Map<string, number>;
  horasPosiblesMensuales: number;
  mesesTranscurridos?: number; // 1-12, cantidad de meses sobre los que promediar; default 12 (año completo)
}): { filas: FilaEstadisticaArea[]; total: FilaEstadisticaArea } {
  const { resultados, areas, dotacionPorArea, horasPosiblesMensuales, mesesTranscurridos = 12 } = params;

  const hsPorAreaMes = new Map<string, number[]>(); // minutos acumulados
  areas.forEach((a) => hsPorAreaMes.set(a, new Array(12).fill(0)));
  const hsTotalPorMesMin = new Array(12).fill(0);

  resultados.forEach((r) => {
    const mesIndex = Number(r.fecha.slice(5, 7)) - 1;
    if (mesIndex < 0 || mesIndex > 11) return;
    hsTotalPorMesMin[mesIndex] += r.hE;
    if (!hsPorAreaMes.has(r.area)) hsPorAreaMes.set(r.area, new Array(12).fill(0));
    hsPorAreaMes.get(r.area)![mesIndex] += r.hE;
  });

  function calcularFila(area: string, dotacion: number, minutosPorMes: number[]): FilaEstadisticaArea {
    const meses: EstadisticaAreaMes[] = minutosPorMes.map((min, i) => {
      const hs = min / 60;
      const hsTotalMes = hsTotalPorMesMin[i] / 60;
      const porcentaje = dotacion > 0 ? hs / (dotacion * horasPosiblesMensuales) : 0;
      const hsPorPersona = dotacion > 0 ? hs / dotacion : 0;
      return { dotacion, hs, hsTotalMes, porcentaje, hsPorPersona };
    });
    const totalHs = meses.reduce((a, m) => a + m.hs, 0);
    const promedioHs = totalHs / mesesTranscurridos;
    return { area, meses, promedioHs, totalHs };
  }

  const filas = areas.map((area) => calcularFila(area, dotacionPorArea.get(area) || 0, hsPorAreaMes.get(area) || new Array(12).fill(0)));

  const dotacionTotal = areas.reduce((acc, area) => acc + (dotacionPorArea.get(area) || 0), 0);
  const minutosPorMesTotal = new Array(12).fill(0);
  areas.forEach((area) => {
    const arr = hsPorAreaMes.get(area) || [];
    arr.forEach((min, i) => { minutosPorMesTotal[i] += min; });
  });
  const total = calcularFila('TOTAL', dotacionTotal, minutosPorMesTotal);

  return { filas, total };
}

// ---------- Estadística de Ausentismo (agrupado por causa y mes) ----------

export interface EstadisticaCausaMes {
  horas: number;
  porcentaje: number; // horas / (dotacionTotal * horasPosiblesMensuales)
}

export interface FilaEstadisticaCausa {
  causa: string;
  meses: EstadisticaCausaMes[]; // 12 posiciones, índice 0=enero .. 11=diciembre
  promedioHoras: number;
  totalHoras: number;
}

function horasEsperadasDelDia(r: ResultadoDia): number {
  const minutos = r.paresEsperados.reduce((acc, [e, s]) => acc + (s >= e ? s - e : s + 1440 - e), 0);
  return minutos / 60;
}

export function calcularEstadisticaAusentismo(params: {
  resultados: ResultadoDia[];
  dotacionTotal: number;
  horasPosiblesMensuales: number;
  mesesTranscurridos?: number;
  // Última fecha con fichadas reales importadas (el .txt del reloj se sube
  // a mano, no en tiempo real). Sin esto, cada día entre la última subida
  // y hoy se contaría como "Sin Justificar" para todo el mundo -- no es
  // ausentismo, es que todavía no se cargó el archivo del reloj.
  ultimaFechaConDatos?: string;
}): { filas: FilaEstadisticaCausa[]; total: FilaEstadisticaCausa } {
  const { resultados, dotacionTotal, horasPosiblesMensuales, mesesTranscurridos = 12, ultimaFechaConDatos } = params;
  const causas = [...CAUSAS_AUSENTISMO, CAUSA_SIN_JUSTIFICAR];

  const horasPorCausaMes = new Map<string, number[]>();
  causas.forEach((c) => horasPorCausaMes.set(c, new Array(12).fill(0)));

  resultados.forEach((r) => {
    if (!r.causa || !horasPorCausaMes.has(r.causa)) return;
    if (r.causa === CAUSA_SIN_JUSTIFICAR && ultimaFechaConDatos && r.fecha > ultimaFechaConDatos) return;
    const mesIndex = Number(r.fecha.slice(5, 7)) - 1;
    if (mesIndex < 0 || mesIndex > 11) return;
    horasPorCausaMes.get(r.causa)![mesIndex] += horasEsperadasDelDia(r);
  });

  function calcularFila(causa: string, horasPorMes: number[]): FilaEstadisticaCausa {
    const meses: EstadisticaCausaMes[] = horasPorMes.map((horas) => {
      const porcentaje = dotacionTotal > 0 ? horas / (dotacionTotal * horasPosiblesMensuales) : 0;
      return { horas, porcentaje };
    });
    const totalHoras = meses.reduce((a, m) => a + m.horas, 0);
    const promedioHoras = totalHoras / mesesTranscurridos;
    return { causa, meses, promedioHoras, totalHoras };
  }

  const filas = causas.map((c) => calcularFila(c, horasPorCausaMes.get(c)!));

  const horasPorMesTotal = new Array(12).fill(0);
  causas.forEach((c) => {
    horasPorCausaMes.get(c)!.forEach((h, i) => { horasPorMesTotal[i] += h; });
  });
  const total = calcularFila('TOTAL', horasPorMesTotal);

  return { filas, total };
}

// ---------- Estadística de Rotación (altas/bajas mensuales, total empresa) ----------

// Mismos 4 motivos que ya usaba el Excel de RRHH -- no agregar ni sacar
// ninguno sin actualizar también la migración del campo `motivo_baja`.
export const MOTIVOS_BAJA: string[] = ['Despido', 'Renuncia', 'Acuerdo', 'Jubilación'];

export interface RotacionMes {
  dotacionInicial: number;
  ingresos: number;
  despidos: number;
  renuncias: number;
  acuerdos: number;
  jubilaciones: number;
  totalEgresos: number;
  dotacionFinal: number;
  indiceRotacion: number; // totalEgresos / dotacionInicial, 0 si dotacionInicial=0 (fracción, no %)
}

export interface MovimientoRotacion {
  nombre: string;
  fecha: string;
  tipo: 'ingreso' | 'egreso';
  motivo?: string; // solo para egresos
}

export function calcularEstadisticaRotacion(params: {
  legajos: FichadasLegajo[];
  anio: number;
  mesesTranscurridos?: number; // 1-12, default 12 (año completo)
}): { meses: RotacionMes[]; movimientos: MovimientoRotacion[] } {
  const { legajos, anio, mesesTranscurridos = 12 } = params;

  // Un legajo sin fecha_alta se asume "de antes" -- siempre activo desde
  // el inicio de cualquier período que se calcule acá (nunca cuenta como
  // "ingreso", porque no se sabe cuándo entró realmente).
  function activoAl(legajo: FichadasLegajo, fechaIso: string): boolean {
    const alta = legajo.fecha_alta || '0000-01-01';
    return alta < fechaIso && (!legajo.fecha_baja || legajo.fecha_baja >= fechaIso);
  }

  const meses: RotacionMes[] = [];
  const movimientos: MovimientoRotacion[] = [];

  for (let m = 0; m < 12; m++) {
    if (m >= mesesTranscurridos) {
      // Mes futuro (año actual todavía no llegó ahí): no se inventa nada.
      meses.push({ dotacionInicial: 0, ingresos: 0, despidos: 0, renuncias: 0, acuerdos: 0, jubilaciones: 0, totalEgresos: 0, dotacionFinal: 0, indiceRotacion: 0 });
      continue;
    }
    const inicioMes = `${anio}-${String(m + 1).padStart(2, '0')}-01`;
    const ultimoDia = new Date(Date.UTC(anio, m + 1, 0)).getUTCDate();
    const finMes = `${anio}-${String(m + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

    const dotacionInicial = legajos.filter((l) => activoAl(l, inicioMes)).length;
    const ingresosDelMes = legajos.filter((l) => l.fecha_alta && l.fecha_alta >= inicioMes && l.fecha_alta <= finMes);
    const egresosDelMes = legajos.filter((l) => l.fecha_baja && l.fecha_baja >= inicioMes && l.fecha_baja <= finMes);

    const despidos = egresosDelMes.filter((l) => l.motivo_baja === 'Despido').length;
    const renuncias = egresosDelMes.filter((l) => l.motivo_baja === 'Renuncia').length;
    const acuerdos = egresosDelMes.filter((l) => l.motivo_baja === 'Acuerdo').length;
    const jubilaciones = egresosDelMes.filter((l) => l.motivo_baja === 'Jubilación').length;
    const totalEgresos = egresosDelMes.length;
    const ingresos = ingresosDelMes.length;
    const dotacionFinal = dotacionInicial + ingresos - totalEgresos;
    const indiceRotacion = dotacionInicial > 0 ? totalEgresos / dotacionInicial : 0;

    ingresosDelMes.forEach((l) => movimientos.push({ nombre: l.nombre, fecha: l.fecha_alta!, tipo: 'ingreso' }));
    egresosDelMes.forEach((l) => movimientos.push({ nombre: l.nombre, fecha: l.fecha_baja!, tipo: 'egreso', motivo: l.motivo_baja }));

    meses.push({ dotacionInicial, ingresos, despidos, renuncias, acuerdos, jubilaciones, totalEgresos, dotacionFinal, indiceRotacion });
  }

  movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { meses, movimientos };
}
