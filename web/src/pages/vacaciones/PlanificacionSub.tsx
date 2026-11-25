import { useMemo, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { NOMBRES_MESES } from '../../lib/format';
import type { Chofer, FichadasLegajo, FichadasVacacion, FichadasVacacionNota } from '../../types';

type Grupo = 'administrativos' | 'choferes';

const DIAS_SEMANA_CORTO = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

function diasDelMes(anio: number, mes: number): string[] {
  const cantidad = new Date(anio, mes, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= cantidad; d++) out.push(`${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  return out;
}

// 0 = lunes ... 6 = domingo (semana arrancando lunes, igual criterio que el
// resto del sistema -- ver DIAS_SEMANA en PersonalPage.tsx).
function offsetPrimerDia(anio: number, mes: number): number {
  const dow = new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay(); // 0=domingo..6=sabado
  return (dow + 6) % 7;
}

export function PlanificacionSub() {
  const toast = useToast();
  const now = useMemo(() => new Date(), []);
  const [grupo, setGrupo] = useState<Grupo>('administrativos');
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [vacaciones, setVacaciones] = useState<FichadasVacacion[]>([]);
  const [notas, setNotas] = useState<FichadasVacacionNota[]>([]);
  const [cargando, setCargando] = useState(false);
  const [generado, setGenerado] = useState(false);
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const [textoNota, setTextoNota] = useState('');

  function marcarSinGenerar() {
    setGenerado(false);
  }

  async function generar() {
    setCargando(true);
    try {
      const diasDelMesElegido = diasDelMes(anio, mes);
      const desde = diasDelMesElegido[0];
      const hasta = diasDelMesElegido[diasDelMesElegido.length - 1];
      const [l, c, v, n] = await Promise.all([
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ filter: 'estado = true' }),
        pb.collection('choferes').getFullList<Chofer>({ filter: 'activo = true' }),
        pb.collection('fichadas_vacaciones').getFullList<FichadasVacacion>({ filter: pb.filter('desde <= {:h} && hasta >= {:d}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_vacaciones_notas').getFullList<FichadasVacacionNota>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h} && grupo = {:g}', { d: desde, h: hasta, g: grupo }) }),
      ]);
      setLegajos(l); setChoferes(c); setVacaciones(v); setNotas(n);
      setGenerado(true);
    } catch (e) {
      toast('No se pudo generar el calendario: ' + (e instanceof Error ? e.message : ''), 'err');
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

  function nombresDelDia(fecha: string): string[] {
    return vacaciones
      .filter((v) => v.desde <= fecha && v.hasta >= fecha && idsDelGrupo.has(v.legajo))
      .map((v) => legajoPorId.get(v.legajo)?.nombre || '—');
  }

  const dias = useMemo(() => (generado ? diasDelMes(anio, mes) : []), [generado, anio, mes]);
  const celdas = useMemo(() => {
    if (!dias.length) return [];
    const out: (string | null)[] = [];
    const offset = offsetPrimerDia(anio, mes);
    for (let i = 0; i < offset; i++) out.push(null);
    out.push(...dias);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [dias, anio, mes]);

  function abrirDia(fecha: string) {
    setDiaAbierto(fecha);
    setTextoNota(notaPorFecha.get(fecha)?.texto || '');
  }

  async function guardarNota() {
    if (!diaAbierto) return;
    try {
      const existente = notaPorFecha.get(diaAbierto);
      const texto = textoNota.trim();
      if (existente && !texto) {
        await pb.collection('fichadas_vacaciones_notas').delete(existente.id);
        setNotas((ns) => ns.filter((n) => n.id !== existente.id));
      } else if (existente) {
        await pb.collection('fichadas_vacaciones_notas').update(existente.id, { texto });
        setNotas((ns) => ns.map((n) => (n.id === existente.id ? { ...n, texto } : n)));
      } else if (texto) {
        const creada = await pb.collection('fichadas_vacaciones_notas').create<FichadasVacacionNota>({ fecha: diaAbierto, grupo, texto });
        setNotas((ns) => [...ns, creada]);
      }
      setDiaAbierto(null);
    } catch (e) {
      toast('No se pudo guardar la nota: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  const nombresDelDiaAbierto = diaAbierto ? nombresDelDia(diaAbierto) : [];

  return (
    <div className="card">
      <div className="hint">Calendario de quién está de vacaciones cada día, armado con los períodos ya cargados en "Vacaciones" — hacé clic en un día para ver el detalle completo y agregar una nota operativa.</div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Ver</label>
          <select value={grupo} onChange={(e) => { setGrupo(e.target.value as Grupo); marcarSinGenerar(); }}>
            <option value="administrativos">Administrativos</option>
            <option value="choferes">Choferes</option>
          </select>
        </div>
        <div className="field">
          <label>Mes</label>
          <select value={mes} onChange={(e) => { setMes(Number(e.target.value)); marcarSinGenerar(); }}>
            {NOMBRES_MESES.map((label, i) => <option key={label} value={i + 1}>{label}</option>)}
          </select>
        </div>
        <div className="field"><label>Año</label><input type="number" value={anio} onChange={(e) => { setAnio(Number(e.target.value)); marcarSinGenerar(); }} style={{ width: 90 }} /></div>
        <button onClick={generar} disabled={cargando}>{cargando ? 'Generando…' : 'Generar'}</button>
      </div>

      {generado && (
        <div className="calendario-planificacion">
          {DIAS_SEMANA_CORTO.map((d) => <div key={d} className="calendario-dow">{d}</div>)}
          {celdas.map((fecha, i) => {
            if (!fecha) return <div key={'vacio' + i} className="calendario-celda calendario-celda-vacia" />;
            const nombres = nombresDelDia(fecha);
            const nota = notaPorFecha.get(fecha);
            const numero = Number(fecha.split('-')[2]);
            return (
              <div key={fecha} className="calendario-celda" onClick={() => abrirDia(fecha)}>
                <div className="calendario-numero">{numero}</div>
                <div className="calendario-nombres">
                  {nombres.slice(0, 3).map((n, j) => <span key={j} className="tag calendario-tag">{n}</span>)}
                  {nombres.length > 3 && <span className="calendario-mas">+{nombres.length - 3} más</span>}
                </div>
                {nota && <div className="calendario-nota">{nota.texto}</div>}
              </div>
            );
          })}
        </div>
      )}

      {diaAbierto && (
        <div className="modal-bg" onClick={() => setDiaAbierto(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3>{diaAbierto.split('-').reverse().join('/')}</h3>
            <div className="hint" style={{ marginBottom: 10 }}>
              {nombresDelDiaAbierto.length ? 'De vacaciones: ' + nombresDelDiaAbierto.join(', ') : 'Nadie de vacaciones este día.'}
            </div>
            <div className="field">
              <label>Nota</label>
              <input value={textoNota} onChange={(e) => setTextoNota(e.target.value)} autoFocus style={{ width: '100%' }} />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="secondary" onClick={() => setDiaAbierto(null)}>Cancelar</button>
              <button onClick={guardarNota}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
