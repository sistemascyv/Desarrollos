import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate } from '../../lib/format';
import { procesarPeriodo, fmtAbsHora, fmtDur, type ResultadoDia } from './motor';
import type { FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad } from '../../types';

type SubTab = 'detalle' | 'ausencias' | 'extra' | 'resumen';
type Formato = 'entradas_salidas' | 'horas_extra' | 'parte_diario' | 'ausentismo';

function nombreDiaCorto(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function ResultadosTab() {
  const toast = useToast();
  const [desde, setDesde] = useState(() => { const n = new Date(); return isoDate(new Date(n.getFullYear(), n.getMonth(), 1)); });
  const [hasta, setHasta] = useState(() => isoDate(new Date()));
  const [cargando, setCargando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoDia[] | null>(null);
  const [sinLegajo, setSinLegajo] = useState<string[]>([]);
  const [subTab, setSubTab] = useState<SubTab>('detalle');
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroNombre, setFiltroNombre] = useState('');
  const [formato, setFormato] = useState<Formato>('entradas_salidas');
  const [fechaParte, setFechaParte] = useState(() => isoDate(new Date()));

  async function buscar() {
    if (!desde || !hasta) { toast('Elegí el rango de fechas.', 'warn'); return; }
    setCargando(true);
    try {
      const [legajos, marcas, novedades, feriados, empresas] = await Promise.all([
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ filter: 'estado = true', expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>(),
      ]);
      const empresaNombrePorId = new Map(empresas.map((e) => [e.id, e.nombre]));
      const { resultados: res, tarjetasSinLegajo } = procesarPeriodo({
        legajos, marcas, novedades, feriados, empresaNombrePorId, desde, hasta,
      });
      setResultados(res);
      setSinLegajo(tarjetasSinLegajo);
    } catch (e) {
      toast('No se pudo procesar el período: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCargando(false);
    }
  }

  const base = useMemo(() => {
    if (!resultados) return [];
    return resultados.filter((r) =>
      (!filtroArea || r.area === filtroArea) &&
      (!filtroNombre || r.nombre.toLowerCase().includes(filtroNombre.toLowerCase()))
    );
  }, [resultados, filtroArea, filtroNombre]);

  const areas = useMemo(() => Array.from(new Set((resultados || []).map((r) => r.area))).sort(), [resultados]);

  if (!resultados) {
    return (
      <div className="card">
        <h2>Resultados por período</h2>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field"><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="field"><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <button onClick={buscar} disabled={cargando}>{cargando ? 'Procesando…' : 'Procesar período'}</button>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>Cruza las marcas cargadas contra el horario esperado de cada empleado activo en ese rango.</div>
      </div>
    );
  }

  const totalAusencias = base.filter((r) => r.ausente).length;
  const totalHE = base.reduce((s, r) => s + r.hE, 0);
  const totalHN = base.reduce((s, r) => s + r.hN, 0);

  return (
    <>
      <div className="card">
        <h2>Resultados por período</h2>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field"><label>Desde</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="field"><label>Hasta</label><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <button onClick={buscar} disabled={cargando}>{cargando ? 'Procesando…' : 'Volver a procesar'}</button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Filtrar por área</label>
            <select value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)}>
              <option value="">Todas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="field"><label>Buscar empleado</label><input value={filtroNombre} onChange={(e) => setFiltroNombre(e.target.value)} placeholder="Nombre..." /></div>
        </div>
        <div className="summary-grid summary-grid-compact" style={{ marginTop: 14 }}>
          <div className="stat"><div className="lbl">Jornadas (filtro actual)</div><div className="val">{base.length}</div></div>
          <div className="stat"><div className="lbl">Ausencias sin justificar</div><div className="val">{totalAusencias}</div></div>
          <div className="stat"><div className="lbl">Horas extra (H E)</div><div className="val">{fmtDur(totalHE)}</div></div>
          <div className="stat"><div className="lbl">Horas normales (H N)</div><div className="val">{fmtDur(totalHN)}</div></div>
        </div>
        {sinLegajo.length > 0 && (
          <div className="hint" style={{ marginTop: 10 }}>⚠ {sinLegajo.length} tarjeta(s) sin empleado asociado: {sinLegajo.join(', ')}</div>
        )}
      </div>

      <div className="card">
        <h2>Formatos para presentar</h2>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Formato</label>
            <select value={formato} onChange={(e) => setFormato(e.target.value as Formato)}>
              <option value="entradas_salidas">Informe de Entradas y Salidas (por área)</option>
              <option value="horas_extra">Horas Extra Mensual (por área)</option>
              <option value="parte_diario">Parte Diario (una fecha)</option>
              <option value="ausentismo">Control de Ausentismo (por depósito)</option>
            </select>
          </div>
          {formato === 'parte_diario' && (
            <div className="field"><label>Fecha del parte</label><input type="date" value={fechaParte} onChange={(e) => setFechaParte(e.target.value)} /></div>
          )}
          <button className="small secondary" onClick={() => descargarFormato(formato, resultados, fechaParte, toast)}>Descargar Excel</button>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ padding: '0 0 10px' }}>
          <button className={subTab === 'detalle' ? 'small' : 'small secondary'} onClick={() => setSubTab('detalle')}>Detalle diario</button>
          <button className={subTab === 'ausencias' ? 'small' : 'small secondary'} onClick={() => setSubTab('ausencias')}>Ausencias sin justificar</button>
          <button className={subTab === 'extra' ? 'small' : 'small secondary'} onClick={() => setSubTab('extra')}>Horas extra</button>
          <button className={subTab === 'resumen' ? 'small' : 'small secondary'} onClick={() => setSubTab('resumen')}>Resumen por empleado</button>
        </div>
        <VistaSubTab subTab={subTab} filas={base} filtroArea={filtroArea} />
      </div>
    </>
  );
}

function VistaSubTab({ subTab, filas, filtroArea }: { subTab: SubTab; filas: ResultadoDia[]; filtroArea: string }) {
  if (subTab === 'resumen') return <ResumenPorEmpleado filas={filas} />;
  let mostrar = filas;
  if (subTab === 'ausencias') mostrar = filas.filter((r) => r.ausente);
  else if (subTab === 'extra') mostrar = [...filas.filter((r) => r.hE > 0)].sort((a, b) => b.hE - a.hE);
  else mostrar = [...filas].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.fecha.localeCompare(b.fecha));

  if (!mostrar.length) return <div className="empty">Sin registros para esta vista con el filtro actual.</div>;

  if (filtroArea) return <TablaDetalle filas={mostrar} />;
  const grupos = new Map<string, ResultadoDia[]>();
  mostrar.forEach((r) => { if (!grupos.has(r.area)) grupos.set(r.area, []); grupos.get(r.area)!.push(r); });
  return (
    <>
      {Array.from(grupos.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([area, fs]) => (
        <div key={area}>
          <h3 style={{ margin: '16px 0 6px', fontSize: 13, color: 'var(--navy)' }}>{area} <span style={{ color: 'var(--suave)', fontWeight: 400 }}>({fs.length} registros)</span></h3>
          <TablaDetalle filas={fs} />
        </div>
      ))}
    </>
  );
}

function TablaDetalle({ filas }: { filas: ResultadoDia[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Legajo</th><th>Identificador</th><th>Empleado</th><th>Depósito</th><th>Fecha</th><th>Día</th>
            <th>H N</th><th>H E</th><th>Ent.</th><th>Sal.</th><th>Ent. (2)</th><th>Sal. (2)</th><th>Novedad</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((r, i) => (
            <tr key={r.idLegajo + r.fecha + i} className={r.ausente ? 'row-ausente' : ''}>
              <td>{r.nroLegajo}</td>
              <td>{r.identificador}</td>
              <td>{r.nombre}</td>
              <td>{r.deposito}</td>
              <td>{r.fecha}</td>
              <td>{r.dia}</td>
              <td>{fmtDur(r.hN)}</td>
              <td>{r.hE > 0 ? <span className="tag tag-extra">{fmtDur(r.hE)}</span> : '—'}</td>
              <td>{fmtAbsHora(r.paresReales[0]?.[0])}</td>
              <td>{fmtAbsHora(r.paresReales[0]?.[1])}</td>
              <td>{fmtAbsHora(r.paresReales[1]?.[0])}</td>
              <td>{fmtAbsHora(r.paresReales[1]?.[1])}</td>
              <td>{r.ausente ? <span className="tag tag-ausente">AUSENTE</span> : (r.novedad || '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ResumenEmpleado { nombre: string; area: string; jornadas: number; ausencias: number; hN: number; hE: number }

function ResumenPorEmpleado({ filas }: { filas: ResultadoDia[] }) {
  const porEmpleado = new Map<string, ResumenEmpleado>();
  filas.forEach((r) => {
    if (!porEmpleado.has(r.idLegajo)) porEmpleado.set(r.idLegajo, { nombre: r.nombre, area: r.area, jornadas: 0, ausencias: 0, hN: 0, hE: 0 });
    const p = porEmpleado.get(r.idLegajo)!;
    p.jornadas++;
    if (r.ausente) p.ausencias++;
    p.hN += r.hN; p.hE += r.hE;
  });
  const grupos = new Map<string, ResumenEmpleado[]>();
  Array.from(porEmpleado.values()).forEach((p) => { if (!grupos.has(p.area)) grupos.set(p.area, []); grupos.get(p.area)!.push(p); });

  return (
    <>
      {Array.from(grupos.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([area, personas]) => {
        personas.sort((a, b) => a.nombre.localeCompare(b.nombre));
        const subAus = personas.reduce((s, p) => s + p.ausencias, 0);
        const subHN = personas.reduce((s, p) => s + p.hN, 0);
        const subHE = personas.reduce((s, p) => s + p.hE, 0);
        return (
          <div key={area}>
            <h3 style={{ margin: '16px 0 6px', fontSize: 13, color: 'var(--navy)' }}>{area} <span style={{ color: 'var(--suave)', fontWeight: 400 }}>({personas.length} empleados)</span></h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Empleado</th><th>Jornadas</th><th>Ausencias sin justificar</th><th>H N total</th><th>H E total</th></tr></thead>
                <tbody>
                  {personas.map((p) => (
                    <tr key={p.nombre}>
                      <td>{p.nombre}</td><td>{p.jornadas}</td>
                      <td>{p.ausencias > 0 ? <span className="tag tag-ausente">{p.ausencias}</span> : '0'}</td>
                      <td>{fmtDur(p.hN)}</td><td>{fmtDur(p.hE)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, background: '#f0f0f0' }}>
                    <td>SUBTOTAL {area}</td><td>—</td><td>{subAus}</td><td>{fmtDur(subHN)}</td><td>{fmtDur(subHE)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---------- exportables a Excel ----------

type Fila = (string | number | Date | null)[];

function construirEntradasSalidas(resultados: ResultadoDia[]): Record<string, Fila[]> {
  const porArea = new Map<string, ResultadoDia[]>();
  resultados.forEach((r) => { if (!porArea.has(r.area)) porArea.set(r.area, []); porArea.get(r.area)!.push(r); });
  const hojas: Record<string, Fila[]> = {};
  porArea.forEach((filas, area) => {
    const aoa: Fila[] = [['INFORME DE ENTRADAS Y SALIDAS'], [],
      ['Legajo', 'Identificador', 'Empleado', 'Fecha', 'Día', 'H N', 'H E', 'Ent.', 'Sal.', 'Ent. (2)', 'Sal. (2)', 'Novedad']];
    const porEmpleado = new Map<string, ResultadoDia[]>();
    filas.forEach((r) => { if (!porEmpleado.has(r.idLegajo)) porEmpleado.set(r.idLegajo, []); porEmpleado.get(r.idLegajo)!.push(r); });
    porEmpleado.forEach((fs) => {
      fs.sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((r) => {
        aoa.push([
          r.nroLegajo, r.identificador, r.nombre, r.fecha, r.dia,
          r.hN / 60, r.hE > 0 ? r.hE / 60 : null,
          r.paresReales[0]?.[0] != null ? fmtAbsHora(r.paresReales[0][0]) : null,
          r.paresReales[0]?.[1] != null ? fmtAbsHora(r.paresReales[0][1]) : null,
          r.paresReales[1]?.[0] != null ? fmtAbsHora(r.paresReales[1][0]) : null,
          r.paresReales[1]?.[1] != null ? fmtAbsHora(r.paresReales[1][1]) : null,
          r.ausente ? 'AUSENTE' : (r.novedad || null),
        ]);
      });
      aoa.push(['TOTALES:']);
    });
    hojas[area.substring(0, 31)] = aoa;
  });
  return hojas;
}

function construirHorasExtraMensual(resultados: ResultadoDia[]): Record<string, Fila[]> {
  const fechas = Array.from(new Set(resultados.map((r) => r.fecha))).sort();
  const porArea = new Map<string, Map<string, { nombre: string; porDia: Map<string, number> }>>();
  resultados.forEach((r) => {
    if (!porArea.has(r.area)) porArea.set(r.area, new Map());
    const emps = porArea.get(r.area)!;
    if (!emps.has(r.idLegajo)) emps.set(r.idLegajo, { nombre: r.nombre, porDia: new Map() });
    const e = emps.get(r.idLegajo)!;
    e.porDia.set(r.fecha, (e.porDia.get(r.fecha) || 0) + r.hE);
  });
  const hojas: Record<string, Fila[]> = {};
  porArea.forEach((emps, area) => {
    const aoa: Fila[] = [['HORAS EXTRAS', ...fechas.map((f) => f), 'TOTAL']];
    const totalesPorFecha = fechas.map(() => 0);
    Array.from(emps.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)).forEach((emp) => {
      let totalEmp = 0;
      const fila: Fila = [emp.nombre];
      fechas.forEach((f, i) => {
        const h = (emp.porDia.get(f) || 0) / 60;
        fila.push(h > 0 ? Math.round(h * 100) / 100 : null);
        totalesPorFecha[i] += h; totalEmp += h;
      });
      fila.push(Math.round(totalEmp * 100) / 100);
      aoa.push(fila);
    });
    aoa.push(['TOTAL', ...totalesPorFecha.map((t) => Math.round(t * 100) / 100), Math.round(totalesPorFecha.reduce((a, b) => a + b, 0) * 100) / 100]);
    hojas[area.substring(0, 31)] = aoa;
  });
  return hojas;
}

function construirParteDiario(resultados: ResultadoDia[], fecha: string): Record<string, Fila[]> {
  const filas = resultados.filter((r) => r.fecha === fecha);
  const porArea = new Map<string, ResultadoDia[]>();
  filas.forEach((r) => { if (!porArea.has(r.area)) porArea.set(r.area, []); porArea.get(r.area)!.push(r); });
  const hojas: Record<string, Fila[]> = {};
  porArea.forEach((empleados, area) => {
    const aoa: Fila[] = [['PARTE DIARIO —', fecha, area], [],
      ['Legajo', 'Identificador', 'Empleado', 'Ent.', 'Sal.', 'Ent. (2)', 'Sal. (2)', 'Novedades']];
    empleados.sort((a, b) => a.nombre.localeCompare(b.nombre)).forEach((r) => {
      aoa.push([
        r.nroLegajo, r.identificador, r.nombre,
        r.paresReales[0]?.[0] != null ? fmtAbsHora(r.paresReales[0][0]) : null,
        r.paresReales[0]?.[1] != null ? fmtAbsHora(r.paresReales[0][1]) : null,
        r.paresReales[1]?.[0] != null ? fmtAbsHora(r.paresReales[1][0]) : null,
        r.paresReales[1]?.[1] != null ? fmtAbsHora(r.paresReales[1][1]) : null,
        r.ausente ? 'AUSENTE' : (r.novedad || null),
      ]);
    });
    hojas[area.substring(0, 31)] = aoa;
  });
  return hojas;
}

function construirControlAusentismo(resultados: ResultadoDia[]): Record<string, Fila[]> {
  const porDeposito = new Map<string, Map<string, { nombre: string; motivo: string }[]>>();
  resultados.forEach((r) => {
    if (!r.ausente && !r.novedad) return;
    const dep = r.deposito && r.deposito !== '—' ? r.deposito : 'SIN DEPÓSITO DETECTADO';
    if (!porDeposito.has(dep)) porDeposito.set(dep, new Map());
    const porFecha = porDeposito.get(dep)!;
    if (!porFecha.has(r.fecha)) porFecha.set(r.fecha, []);
    porFecha.get(r.fecha)!.push({ nombre: r.nombre, motivo: r.ausente ? 'AUSENTE (sin justificar)' : r.novedad });
  });
  const hojas: Record<string, Fila[]> = {};
  porDeposito.forEach((porFecha, dep) => {
    const aoa: Fila[] = [['DEPOSITO ' + dep], []];
    Array.from(porFecha.keys()).sort().forEach((fecha) => {
      const items = porFecha.get(fecha)!;
      aoa.push([fecha, nombreDiaCorto(fecha), items.map((i) => `${i.nombre} - ${i.motivo}`).join(' / ')]);
    });
    hojas[dep.substring(0, 31)] = aoa;
  });
  return hojas;
}

function descargarFormato(formato: Formato, resultados: ResultadoDia[], fechaParte: string, toast: (msg: string, kind: 'ok' | 'err' | 'warn') => void) {
  let hojas: Record<string, Fila[]>;
  let nombreArchivo: string;
  if (formato === 'entradas_salidas') { hojas = construirEntradasSalidas(resultados); nombreArchivo = 'informe_entradas_salidas.xlsx'; }
  else if (formato === 'horas_extra') { hojas = construirHorasExtraMensual(resultados); nombreArchivo = 'horas_extra_mensual.xlsx'; }
  else if (formato === 'parte_diario') { hojas = construirParteDiario(resultados, fechaParte); nombreArchivo = 'parte_diario.xlsx'; }
  else { hojas = construirControlAusentismo(resultados); nombreArchivo = 'control_ausentismo.xlsx'; }

  if (!Object.keys(hojas).length) { toast('No hay datos para este formato con el período/filtro actual.', 'warn'); return; }
  const wb = XLSX.utils.book_new();
  Object.entries(hojas).forEach(([nombre, aoa]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  });
  XLSX.writeFile(wb, nombreArchivo);
}
