import type { DiaHorario, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad } from '../../types';

// Motor de cálculo de fichadas — portado 1:1 de la lógica ya validada en
// el prototipo standalone (fichadas_prototipo.html). Misma fórmula de
// H N / H E, misma tolerancia de matching, mismo redondeo por depósito.
// Cualquier cambio acá debe revisarse contra ese prototipo.

export const DIAS_NOMBRE = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const TOLERANCIA_MIN = 180;

export interface ResultadoDia {
  idLegajo: string;
  nroLegajo: string;
  identificador: string; // nro_tarjeta
  nombre: string;
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
}

function jsDayToColumnDia(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

function fechaAMinutosAbsolutos(fechaStr: string): number {
  const [y, m, d] = fechaStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 60000;
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

  const novedadPorLegajoFecha = new Map<string, string>();
  novedades.forEach((n) => novedadPorLegajoFecha.set(n.legajo + '|' + n.fecha, n.texto));
  const feriadoPorFecha = new Map<string, string>();
  feriados.forEach((f) => feriadoPorFecha.set(f.fecha, f.nombre || 'Feriado'));

  function novedadManual(idLegajo: string, fecha: string): string {
    const m = novedadPorLegajoFecha.get(idLegajo + '|' + fecha);
    if (m) return m;
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

    for (let cur = utcDesde; cur <= utcHasta; cur += 86400000) {
      const dt = new Date(cur);
      const fecha = dt.toISOString().slice(0, 10);
      const dia = jsDayToColumnDia(dt.getUTCDay());
      const nombreDia = DIAS_NOMBRE[dt.getUTCDay()];
      const { trabaja, pares } = horarioEsperado(legajo, dia);
      const anchorAbs = fechaAMinutosAbsolutos(fecha);
      const novedad = novedadManual(idLegajo, fecha);

      if (!trabaja && !novedad) continue; // día libre programado, sin novedad: no se reporta

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

        const entradaReal = bestE >= 0 ? marcasGlobal[bestE].abs : null;
        const salidaReal = bestS >= 0 ? marcasGlobal[bestS].abs : null;
        if (bestE >= 0) { usados[bestE] = true; depositoDelDia = marcasGlobal[bestE].deposito; }
        if (bestS >= 0) { usados[bestS] = true; depositoDelDia = depositoDelDia || marcasGlobal[bestS].deposito; }
        if (entradaReal !== null && salidaReal !== null) worked += salidaReal - entradaReal;
        paresReales.push([entradaReal, salidaReal]);
      });

      // segundo tramo: marcas sobrantes del mismo día calendario, no
      // matcheadas contra ningún par esperado (horario flexible / vuelta
      // a marcar horas extra fuera del turno teórico)
      if (paresReales.length < 2) {
        const diaIndexAnchor = Math.round(anchorAbs / 1440);
        const sobrantes: number[] = [];
        marcasGlobal.forEach((m, idx) => {
          if (usados[idx]) return;
          if (Math.round(Math.floor(m.abs / 1440)) === diaIndexAnchor) sobrantes.push(idx);
        });
        sobrantes.sort((a, b) => marcasGlobal[a].abs - marcasGlobal[b].abs);
        if (sobrantes.length >= 2) {
          const idxE = sobrantes[0], idxS = sobrantes[1];
          usados[idxE] = true; usados[idxS] = true;
          depositoDelDia = depositoDelDia || marcasGlobal[idxE].deposito;
          worked += marcasGlobal[idxS].abs - marcasGlobal[idxE].abs;
          paresReales.push([marcasGlobal[idxE].abs, marcasGlobal[idxS].abs]);
        } else if (sobrantes.length === 1) {
          usados[sobrantes[0]] = true;
          paresReales.push([marcasGlobal[sobrantes[0]].abs, null]);
        }
      }

      const hN = teoricoTotal > 0 ? Math.min(worked, teoricoTotal) : worked;
      const hEcruda = Math.max(0, worked - teoricoTotal);
      const incremento = incrementoRedondeo(depositoDelDia);
      const hE = Math.floor(hEcruda / incremento) * incremento;

      const sinNingunaMarca = paresReales.every((p) => p[0] === null && p[1] === null);
      const ausente = trabaja && sinNingunaMarca && !novedad;

      resultados.push({
        idLegajo, nroLegajo: legajo.nro_legajo || '', identificador: legajo.nro_tarjeta,
        nombre: legajo.nombre, area: areaNombre, deposito: depositoDelDia || '—',
        fecha, dia: nombreDia,
        paresEsperados: pares, paresReales,
        hN, hE, ausente, novedad,
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
  if (n.includes('buenos_aires') || n.includes('bsas') || n.includes('bs_as') || n.includes('buenos aires')) return 'BUENOS AIRES';
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
