import { useMemo, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate } from '../../lib/format';
import type { Chofer, FichadasLegajo, FichadasVacacion, FichadasVacacionNota } from '../../types';

type Grupo = 'administrativos' | 'choferes';

function nombreDiaCorto(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function primerDiaDelMes(): string {
  const n = new Date();
  return isoDate(new Date(n.getFullYear(), n.getMonth(), 1));
}
function ultimoDiaDelMes(): string {
  const n = new Date();
  return isoDate(new Date(n.getFullYear(), n.getMonth() + 1, 0));
}

export function PlanificacionSub() {
  const toast = useToast();
  const [grupo, setGrupo] = useState<Grupo>('administrativos');
  const [desde, setDesde] = useState(primerDiaDelMes);
  const [hasta, setHasta] = useState(ultimoDiaDelMes);
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [vacaciones, setVacaciones] = useState<FichadasVacacion[]>([]);
  const [notas, setNotas] = useState<FichadasVacacionNota[]>([]);
  const [cargando, setCargando] = useState(false);
  const [generado, setGenerado] = useState(false);
  const [editandoNota, setEditandoNota] = useState<string | null>(null);
  const [textoNota, setTextoNota] = useState('');

  async function generar() {
    if (!desde || !hasta) { toast('Elegí el rango de fechas.', 'warn'); return; }
    if (hasta < desde) { toast('"Hasta" no puede ser anterior a "Desde".', 'warn'); return; }
    setCargando(true);
    try {
      const [l, c, v, n] = await Promise.all([
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ filter: 'estado = true' }),
        pb.collection('choferes').getFullList<Chofer>({ filter: 'activo = true' }),
        pb.collection('fichadas_vacaciones').getFullList<FichadasVacacion>({ filter: pb.filter('desde <= {:h} && hasta >= {:d}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_vacaciones_notas').getFullList<FichadasVacacionNota>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h} && grupo = {:g}', { d: desde, h: hasta, g: grupo }) }),
      ]);
      setLegajos(l); setChoferes(c); setVacaciones(v); setNotas(n);
      setGenerado(true);
    } catch (e) {
      toast('No se pudo generar el cuadro: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCargando(false);
    }
  }

  const legajosDeChofer = useMemo(() => new Set(choferes.map((c) => c.legajo).filter(Boolean)), [choferes]);
  const legajoPorId = useMemo(() => new Map(legajos.map((l) => [l.id, l])), [legajos]);
  const notaPorFecha = useMemo(() => new Map(notas.map((n) => [n.fecha, n])), [notas]);

  const idsDelGrupo = useMemo(() => {
    const filtrados = grupo === 'choferes'
      ? legajos.filter((l) => legajosDeChofer.has(l.id))
      : legajos.filter((l) => !legajosDeChofer.has(l.id));
    return new Set(filtrados.map((l) => l.id));
  }, [legajos, legajosDeChofer, grupo]);

  const dias = useMemo(() => {
    if (!generado) return [];
    const out: string[] = [];
    const finMs = new Date(hasta + 'T00:00:00Z').getTime();
    for (let cur = new Date(desde + 'T00:00:00Z').getTime(); cur <= finMs; cur += 86400000) {
      out.push(new Date(cur).toISOString().slice(0, 10));
    }
    return out;
  }, [generado, desde, hasta]);

  function nombresDelDia(fecha: string): string {
    const nombres = vacaciones
      .filter((v) => v.desde <= fecha && v.hasta >= fecha && idsDelGrupo.has(v.legajo))
      .map((v) => legajoPorId.get(v.legajo)?.nombre || '—');
    return nombres.length ? nombres.join(', ') : '—';
  }

  function abrirNota(fecha: string) {
    setEditandoNota(fecha);
    setTextoNota(notaPorFecha.get(fecha)?.texto || '');
  }

  async function guardarNota(fecha: string) {
    try {
      const existente = notaPorFecha.get(fecha);
      const texto = textoNota.trim();
      if (existente && !texto) {
        await pb.collection('fichadas_vacaciones_notas').delete(existente.id);
        setNotas((ns) => ns.filter((n) => n.id !== existente.id));
      } else if (existente) {
        await pb.collection('fichadas_vacaciones_notas').update(existente.id, { texto });
        setNotas((ns) => ns.map((n) => (n.id === existente.id ? { ...n, texto } : n)));
      } else if (texto) {
        const creada = await pb.collection('fichadas_vacaciones_notas').create<FichadasVacacionNota>({ fecha, grupo, texto });
        setNotas((ns) => [...ns, creada]);
      }
      setEditandoNota(null);
    } catch (e) {
      toast('No se pudo guardar la nota: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <div className="card">
      <div className="hint">Cuadro día por día de quién está de vacaciones, armado con los períodos ya cargados en "Vacaciones" — agregá una nota operativa por día si hace falta, igual que la planilla de comunicados.</div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Ver</label>
          <select value={grupo} onChange={(e) => { setGrupo(e.target.value as Grupo); setGenerado(false); }}>
            <option value="administrativos">Administrativos</option>
            <option value="choferes">Choferes</option>
          </select>
        </div>
        <div className="field"><label>Desde</label><input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setGenerado(false); }} /></div>
        <div className="field"><label>Hasta</label><input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setGenerado(false); }} /></div>
        <button onClick={generar} disabled={cargando}>{cargando ? 'Generando…' : 'Generar'}</button>
      </div>

      {generado && (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Día</th><th>De vacaciones</th><th>Nota</th></tr></thead>
            <tbody>
              {dias.map((fecha) => (
                <tr key={fecha}>
                  <td>{nombreDiaCorto(fecha)} {fecha.split('-').reverse().join('/')}</td>
                  <td>{nombresDelDia(fecha)}</td>
                  <td>
                    {editandoNota === fecha ? (
                      <div className="row" style={{ gap: 6 }}>
                        <input value={textoNota} onChange={(e) => setTextoNota(e.target.value)} style={{ flex: 1 }} autoFocus />
                        <button className="small" onClick={() => guardarNota(fecha)}>Guardar</button>
                        <button className="small secondary" onClick={() => setEditandoNota(null)}>Cancelar</button>
                      </div>
                    ) : (
                      <span onClick={() => abrirNota(fecha)} style={{ cursor: 'pointer' }}>
                        {notaPorFecha.get(fecha)?.texto || <span style={{ color: 'var(--suave)' }}>+ agregar nota</span>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
