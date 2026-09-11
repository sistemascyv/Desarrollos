import { useState } from 'react';
import { type VehiculoPressa, num, formatoFecha, haceCuanto } from './types';

// Solo entran acá las unidades que mandan al menos un canal de
// temperatura real (Pressa manda -999.9 en los que no tienen sensor
// cableado, ya filtrado en el hook) — hoy son los semirremolques con
// equipo de frío.
export function CadenaFrioTab({ vehiculos }: { vehiculos: VehiculoPressa[] }) {
  const [minAceptable, setMinAceptable] = useState('-5');
  const [maxAceptable, setMaxAceptable] = useState('8');

  const min = Number(minAceptable);
  const max = Number(maxAceptable);
  const conSensor = vehiculos.filter((v) => v.temperaturas.length > 0);

  function fueraDeRango(v: VehiculoPressa) {
    return v.temperaturas.some((t) => t < min || t > max);
  }

  const ordenados = [...conSensor].sort((a, b) => {
    const af = fueraDeRango(a) ? 0 : 1;
    const bf = fueraDeRango(b) ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.alias.localeCompare(b.alias);
  });
  const fuera = conSensor.filter(fueraDeRango).length;

  return (
    <>
      <div className="card">
        <h2>Cadena de frío</h2>
        <div className="hint">Semirremolques con sensor de temperatura activo — {conSensor.length} de {vehiculos.length} unidades.</div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field"><label>Rango aceptable, mínimo (°C)</label><input type="number" value={minAceptable} onChange={(e) => setMinAceptable(e.target.value)} /></div>
          <div className="field"><label>Rango aceptable, máximo (°C)</label><input type="number" value={maxAceptable} onChange={(e) => setMaxAceptable(e.target.value)} /></div>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>Rango de referencia genérico, editable — ajustalo según lo que transporte cada unidad.</div>
      </div>

      {conSensor.length === 0 ? (
        <div className="card"><div className="empty">Ninguna unidad está reportando temperatura en este momento.</div></div>
      ) : (
        <div className="card">
          {fuera > 0 && (
            <div className="hint" style={{ color: 'var(--err)', marginBottom: 10 }}>
              ⚠ {fuera} unidad{fuera > 1 ? 'es' : ''} fuera del rango aceptable.
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Unidad</th><th>Patente</th><th className="num">Temperatura</th><th>Estado</th><th>Actualizado</th></tr>
              </thead>
              <tbody>
                {ordenados.map((v) => {
                  const fuera = fueraDeRango(v);
                  return (
                    <tr key={v.id}>
                      <td className="admin-name">{v.alias}</td>
                      <td>{v.patente}</td>
                      <td className="num">
                        <span className="badge" style={{ color: fuera ? 'var(--err)' : 'var(--ok)', borderColor: fuera ? 'var(--err)' : 'var(--ok)' }}>
                          {v.temperaturas.map((t) => `${num(t, 1)}°C`).join(' / ')}
                        </span>
                      </td>
                      <td style={fuera ? { color: 'var(--err)' } : undefined}>{fuera ? 'Fuera de rango' : 'En rango'}</td>
                      <td>{formatoFecha(v.actualizado)} <span className="hint">({haceCuanto(v.actualizado)})</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
