import { useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { esCuitValido } from '../../lib/cuit';
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

  // Un total por período (sumando todas las entidades) para el gráfico
  // de evolución — el BCRA manda el más reciente primero, se da vuelta
  // para que el gráfico corra de más viejo a más nuevo, izquierda a derecha.
  const evolucion = (() => {
    if (!reporte) return [];
    const porPeriodo = new Map<string, number>();
    for (const d of reporte.deudaHistorica) {
      if (!d.periodo) continue;
      porPeriodo.set(d.periodo, (porPeriodo.get(d.periodo) || 0) + (d.monto || 0));
    }
    return [...porPeriodo.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([periodo, total]) => ({ periodo, total }));
  })();
  const maxEvolucion = Math.max(1, ...evolucion.map((e) => e.total));

  const saldoActual = reporte ? reporte.deudaActual.reduce((s, d) => s + (d.monto || 0), 0) : 0;
  const peorSituacion = reporte ? Math.max(0, ...reporte.deudaActual.map((d) => d.situacion ?? 0)) : 0;

  return (
    <main>
      <div className="card">
        <h2>Central de Deudores</h2>
        <div className="hint" style={{ marginBottom: 12 }}>
          Reporte de riesgo crediticio armado con datos gratuitos del BCRA: deuda actual, evolución de los últimos 24 meses y
          cheques rechazados. No incluye Score ni consultas (eso es de servicios pagos como Equifax, no del BCRA).
        </div>
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
            <div className="summary-grid">
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
                <div className="val">{SITUACION_BCRA[peorSituacion] || '—'}</div>
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
              <div className="bar-chart">
                <div className="bar-chart-bars">
                  {evolucion.map((e, i) => (
                    <div className="bar-chart-col" key={e.periodo} title={`${formatPeriodo(e.periodo)}: ${money(e.total)}`}>
                      <div className="bar-chart-bar" style={{ height: `${(e.total / maxEvolucion) * 100}%` }} />
                      {(i % 3 === 0 || i === evolucion.length - 1) && (
                        <div className="bar-chart-label">{formatPeriodo(e.periodo)}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="hint">Fuente: Banco Central (BCRA). Pasá el mouse por una barra para ver el detalle.</div>
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
