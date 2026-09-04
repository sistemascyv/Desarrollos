import { useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { esCuitValido, situacionADias, tipoPersonaPorCuit, tipoSociedadDeDenominacion } from '../../lib/cuit';
import { money } from '../../lib/format';
import { SITUACION_BCRA, type DeudorReporte } from '../../types';

// "YYYYMM" o "YYYY-MM" -> "MM/YY" para las etiquetas del gráfico y las
// tablas — si el BCRA manda otro formato, se muestra tal cual llega en
// vez de romper.
function formatPeriodo(p: string): string {
  const m = p.match(/^(\d{4})-?(\d{2})$/);
  if (!m) return p;
  return `${m[2]}/${m[1].slice(2)}`;
}

export function CentralDeudoresPage() {
  const toast = useToast();
  const [cuit, setCuit] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [reporte, setReporte] = useState<DeudorReporte | null>(null);

  async function consultar() {
    const limpio = cuit.replace(/\D/g, '');
    if (limpio.length !== 11) { toast('El CUIT debe tener 11 dígitos.', 'warn'); return; }
    if (!esCuitValido(limpio)) { toast('Ese CUIT no pasó la validación del dígito verificador — igual se puede consultar.', 'warn'); }
    setBuscando(true);
    setReporte(null);
    try {
      const res = await pb.send<DeudorReporte>(`/api/deudores/bcra/${limpio}`, { method: 'GET' });
      setReporte(res);
    } catch (e) {
      toast('Error consultando el BCRA: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setBuscando(false);
    }
  }

  // Por período, la deuda separada en 3 categorías (normal / seguimiento
  // especial / con problemas o peor) en vez de un solo total — así el
  // gráfico muestra no solo cuánto debía sino en qué estado, que es la
  // parte que realmente importa para evaluar riesgo. El BCRA manda el
  // período más reciente primero, se da vuelta para que corra de más
  // viejo a más nuevo, izquierda a derecha.
  const evolucion = (() => {
    if (!reporte) return [];
    const porPeriodo = new Map<string, { normal: number; especial: number; problemas: number }>();
    for (const d of reporte.deudaHistorica) {
      if (!d.periodo) continue;
      const fila = porPeriodo.get(d.periodo) || { normal: 0, especial: 0, problemas: 0 };
      const monto = d.monto || 0;
      if (d.situacion === 2) fila.especial += monto;
      else if (d.situacion != null && d.situacion >= 3) fila.problemas += monto;
      else fila.normal += monto;
      porPeriodo.set(d.periodo, fila);
    }
    return [...porPeriodo.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodo, f]) => ({ periodo, ...f, total: f.normal + f.especial + f.problemas }));
  })();
  const maxEvolucion = Math.max(1, ...evolucion.map((e) => e.total));

  const saldoActual = reporte ? reporte.deudaActual.reduce((s, d) => s + (d.monto || 0), 0) : 0;
  const peorSituacion = reporte ? Math.max(0, ...reporte.deudaActual.map((d) => d.situacion ?? 0)) : 0;
  // Nada de esto pide otra consulta: el tipo de persona sale del propio
  // prefijo del CUIT, el tipo de sociedad de la razón social que ya
  // manda el BCRA, y los rangos de días son la traducción oficial del
  // código de situación (ver lib/cuit.ts).
  const tipoPersona = reporte ? tipoPersonaPorCuit(reporte.cuit) : null;
  const tipoSociedad = reporte ? tipoSociedadDeDenominacion(reporte.denominacion) : null;
  const peorSituacionHistorica = reporte ? Math.max(0, ...reporte.deudaHistorica.map((d) => d.situacion ?? 0)) : 0;

  return (
    <main>
      <div className="card">
        <h2>Central de Deudores</h2>
        <div className="row">
          <div className="field">
            <label>CUIT a consultar</label>
            <input
              value={cuit}
              onChange={(e) => setCuit(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && consultar()}
              placeholder="11 dígitos, sin guiones"
              maxLength={11}
              style={{ width: 220 }}
            />
          </div>
          <button onClick={consultar} disabled={buscando}>{buscando ? 'Consultando…' : 'Consultar'}</button>
        </div>
      </div>

      {reporte && (
        <>
          <div className="card">
            <h2>{reporte.denominacion || reporte.cuit}</h2>
            <div className="hint" style={{ marginBottom: 12 }}>CUIT {reporte.cuit}</div>
            <div className="summary-grid summary-grid-compact">
              <div className="stat">
                <div className="lbl">Tipo de persona</div>
                <div className="val">{tipoPersona || '—'}</div>
              </div>
              <div className="stat">
                <div className="lbl">Tipo de sociedad</div>
                <div className="val">{tipoSociedad || '—'}</div>
              </div>
              <div className="stat">
                <div className="lbl">Deuda actual (sistema financiero)</div>
                <div className="val">{money(saldoActual)}</div>
              </div>
              <div className="stat">
                <div className="lbl">Entidades con deuda</div>
                <div className="val">{reporte.deudaActual.length}</div>
              </div>
              <div className={`stat${peorSituacion > 1 ? ' saldo-neg' : ''}`}>
                <div className="lbl">Peor situación actual</div>
                <div className="val">{peorSituacion > 0 ? (SITUACION_BCRA[peorSituacion] || peorSituacion) : 'Sin deuda registrada'}</div>
              </div>
              <div className={`stat${peorSituacion > 1 ? ' saldo-neg' : ''}`}>
                <div className="lbl">Situación actual</div>
                <div className="val">{peorSituacion > 0 ? situacionADias(peorSituacion) : 'Sin deuda registrada'}</div>
              </div>
              <div className={`stat${peorSituacionHistorica > 1 ? ' saldo-neg' : ''}`}>
                <div className="lbl">Máximo atraso últimos 24 meses</div>
                <div className="val">{peorSituacionHistorica > 0 ? situacionADias(peorSituacionHistorica) : 'Sin registro'}</div>
              </div>
              <div className={`stat${reporte.rechazos.length > 0 ? ' saldo-neg' : ''}`}>
                <div className="lbl">Cheques rechazados</div>
                <div className="val">{reporte.rechazos.length}</div>
              </div>
            </div>
          </div>

          {evolucion.length > 0 && (
            <div className="card">
              <h2>Evolución de deuda (últimos 24 meses)</h2>
              <div className="bar-chart-legend">
                <span><i style={{ background: 'var(--ok)' }} /> Situación normal</span>
                <span><i style={{ background: 'var(--warn)' }} /> Seguimiento especial</span>
                <span><i style={{ background: 'var(--err)' }} /> Con problemas o peor</span>
              </div>
              <div className="bar-chart">
                <div className="bar-chart-axis">
                  <span>{money(maxEvolucion)}</span>
                  <span>{money(maxEvolucion / 2)}</span>
                  <span>$0</span>
                </div>
                <div className="bar-chart-bars">
                  {evolucion.map((e, i) => (
                    <div
                      className="bar-chart-col"
                      key={e.periodo}
                      title={`${formatPeriodo(e.periodo)}: ${money(e.total)} total — normal ${money(e.normal)}, seguimiento especial ${money(e.especial)}, con problemas o peor ${money(e.problemas)}`}
                    >
                      <div className="bar-chart-stack" style={{ height: `${(e.total / maxEvolucion) * 100}%` }}>
                        {e.normal > 0 && <div className="bar-chart-seg" style={{ flex: e.normal, background: 'var(--ok)' }} />}
                        {e.especial > 0 && <div className="bar-chart-seg" style={{ flex: e.especial, background: 'var(--warn)' }} />}
                        {e.problemas > 0 && <div className="bar-chart-seg" style={{ flex: e.problemas, background: 'var(--err)' }} />}
                      </div>
                      {(i % 3 === 0 || i === evolucion.length - 1) && (
                        <div className="bar-chart-label">{formatPeriodo(e.periodo)}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="hint">Fuente: Banco Central (BCRA). Pasá el mouse por una barra para ver el detalle de cada mes.</div>
            </div>
          )}

          {reporte.deudaActual.length > 0 && (
            <div className="card">
              <h2>Deuda actual por entidad</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Entidad</th><th>Situación</th><th className="num">Monto</th>
                      <th>Días atraso</th><th>Refinanciada</th><th>Proceso judicial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.deudaActual.map((d, i) => (
                      <tr key={i}>
                        <td>{d.entidad ?? '—'}</td>
                        <td>{d.situacion != null ? (SITUACION_BCRA[d.situacion] || d.situacion) : '—'}</td>
                        <td className="num">{d.monto != null ? money(d.monto) : '—'}</td>
                        <td>{d.diasAtrasoPago ?? '—'}</td>
                        <td>{d.refinanciaciones ? 'Sí' : 'No'}</td>
                        <td>{d.procesoJud ? 'Sí' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reporte.rechazos.length > 0 && (
            <div className="card">
              <h2>Cheques rechazados</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Entidad</th><th>N° cheque</th><th>Fecha rechazo</th>
                      <th className="num">Monto</th><th>Causal</th><th>Pagado</th><th>En proceso judicial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.rechazos.map((r, i) => (
                      <tr key={i}>
                        <td>{r.entidad ?? '—'}</td>
                        <td>{r.nroCheque}</td>
                        <td>{r.fechaRechazo}</td>
                        <td className="num">{money(r.monto)}</td>
                        <td>{r.causal || '—'}</td>
                        <td>{r.fechaPago ? r.fechaPago : 'No'}</td>
                        <td>{r.procesoJud ? 'Sí' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reporte.deudaHistorica.length > 0 && (
            <div className="card">
              <h2>Evolución histórica detallada</h2>
              <div className="table-wrap" style={{ maxHeight: 300 }}>
                <table>
                  <thead>
                    <tr><th>Período</th><th>Entidad</th><th>Situación</th><th className="num">Monto</th></tr>
                  </thead>
                  <tbody>
                    {reporte.deudaHistorica.map((d, i) => (
                      <tr key={i}>
                        <td>{d.periodo ? formatPeriodo(d.periodo) : '—'}</td>
                        <td>{d.entidad ?? '—'}</td>
                        <td>{d.situacion != null ? (SITUACION_BCRA[d.situacion] || d.situacion) : '—'}</td>
                        <td className="num">{d.monto != null ? money(d.monto) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
