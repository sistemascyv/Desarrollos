import { useState } from 'react';
import { type VehiculoPressa, num, formatoFecha, haceCuanto } from './types';

type Severidad = 'critico' | 'atencion' | 'normal';

const EVENTOS_CRITICOS = ['frenada brusca'];
const EVENTOS_ATENCION = ['fin ralenti'];

// No pide nada nuevo a Pressa: usa la misma foto de Monitor Search que
// ya trae el mapa, solo la mira con otro criterio (qué unidad necesita
// atención ahora mismo) en vez de dónde está.
export function EventosTab({ vehiculos }: { vehiculos: VehiculoPressa[] }) {
  const [umbralBateria, setUmbralBateria] = useState('3.4');
  const umbral = Number(umbralBateria);

  function severidad(v: VehiculoPressa): Severidad {
    const estadoBajo = v.estado.toLowerCase();
    if (EVENTOS_CRITICOS.some((e) => estadoBajo.includes(e))) return 'critico';
    if (v.bateriaAux !== null && v.bateriaAux < umbral) return 'critico';
    if (EVENTOS_ATENCION.some((e) => estadoBajo.includes(e))) return 'atencion';
    return 'normal';
  }

  const orden: Record<Severidad, number> = { critico: 0, atencion: 1, normal: 2 };
  const ordenados = [...vehiculos].sort((a, b) => {
    const d = orden[severidad(a)] - orden[severidad(b)];
    return d !== 0 ? d : a.alias.localeCompare(b.alias);
  });
  const criticos = vehiculos.filter((v) => severidad(v) === 'critico').length;
  const atencion = vehiculos.filter((v) => severidad(v) === 'atencion').length;

  const etiqueta: Record<Severidad, string> = { critico: 'Atención', atencion: 'Revisar', normal: 'Normal' };
  const color: Record<Severidad, string> = { critico: 'var(--err)', atencion: 'var(--warn)', normal: 'var(--ok)' };

  return (
    <>
      <div className="card">
        <h2>Eventos de manejo y de equipo</h2>
        <div className="hint">Frenadas bruscas y batería del equipo satelital baja, a partir del último estado reportado de cada unidad.</div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field"><label>Batería del rastreador — umbral de atención (V)</label><input type="number" step="0.1" value={umbralBateria} onChange={(e) => setUmbralBateria(e.target.value)} /></div>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>Es la batería del equipo GPS (celda tipo litio, ~4.2V cargada), no la batería del vehículo — umbral de referencia, editable.</div>
        <div className="summary-grid summary-grid-compact" style={{ marginTop: 14 }}>
          <div className="stat"><div className="lbl">Requieren atención</div><div className="val" style={{ color: 'var(--err)' }}>{criticos}</div></div>
          <div className="stat"><div className="lbl">Para revisar</div><div className="val" style={{ color: 'var(--warn)' }}>{atencion}</div></div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Unidad</th><th>Patente</th><th>Situación</th><th>Último evento</th><th className="num">Batería equipo</th><th>Actualizado</th></tr>
            </thead>
            <tbody>
              {ordenados.map((v) => {
                const sev = severidad(v);
                return (
                  <tr key={v.id}>
                    <td className="admin-name">{v.alias}</td>
                    <td>{v.patente}</td>
                    <td><span className="badge" style={{ color: color[sev], borderColor: color[sev] }}>{etiqueta[sev]}</span></td>
                    <td>{v.estado || '—'}</td>
                    <td className="num" style={v.bateriaAux !== null && v.bateriaAux < umbral ? { color: 'var(--err)' } : undefined}>
                      {v.bateriaAux !== null ? `${num(v.bateriaAux, 2)} V` : '—'}
                    </td>
                    <td>{formatoFecha(v.actualizado)} <span className="hint">({haceCuanto(v.actualizado)})</span></td>
                  </tr>
                );
              })}
              {ordenados.length === 0 && <tr><td className="empty" colSpan={6}>Sin unidades reportadas por Pressa.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
