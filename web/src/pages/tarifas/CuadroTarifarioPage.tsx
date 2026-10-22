import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { pb } from '../../lib/pb';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { money } from '../../lib/format';
import type { CuadroTarifarioFila, CuadroTarifarioMinimos } from '../../types';

// Orden fijo de las 10 combinaciones de zona -- igual que en el sistema de
// terceros, NO es alfabetico (ver spec). C=Cordoba, S=San Francisco,
// R=Rosario, B=Buenos Aires.
const COLUMNAS_ZONA: { key: string; label: string }[] = [
  { key: 'CC', label: 'C⇄C' }, { key: 'CS', label: 'C⇄S' },
  { key: 'CR', label: 'C⇄R' }, { key: 'CB', label: 'C⇄B' },
  { key: 'RR', label: 'R⇄R' }, { key: 'RS', label: 'R⇄S' },
  { key: 'RB', label: 'R⇄B' }, { key: 'SS', label: 'S⇄S' },
  { key: 'SB', label: 'S⇄B' }, { key: 'BB', label: 'B⇄B' },
];

const CATEGORIAS = [
  { id: 'seco', label: 'Seco' },
  { id: 'frio', label: 'Frío' },
  { id: 'congelado', label: 'Congelado' },
] as const;
type CategoriaId = typeof CATEGORIAS[number]['id'];

export function CuadroTarifarioPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [filas, setFilas] = useState<CuadroTarifarioFila[]>([]);
  const [minimos, setMinimos] = useState<CuadroTarifarioMinimos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState<CategoriaId>('seco');
  const [porcentaje, setPorcentaje] = useState('');
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    try {
      const [items, minItems] = await Promise.all([
        pb.collection('cuadro_tarifario').getFullList<CuadroTarifarioFila>({ sort: 'rango_kg_desde' }),
        pb.collection('cuadro_tarifario_minimos').getFullList<CuadroTarifarioMinimos>(),
      ]);
      setFilas(items);
      setMinimos(minItems[0] || null);
    } catch (e) {
      toast('No se pudo cargar el cuadro tarifario: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCargando(false);
    }
  }

  async function aplicarPorcentaje() {
    const limpio = porcentaje.replace(',', '.').trim();
    const valor = Number(limpio);
    if (!limpio || Number.isNaN(valor) || valor <= 0 || valor > 50) {
      toast('Ingresá un porcentaje válido, mayor a 0 y hasta 50.', 'warn');
      return;
    }
    const ok = await confirm(
      `Se va a aplicar un ajuste de +${limpio}% a TODOS los valores de Seco, Frío, Congelado y los mínimos por sucursal. ¿Confirmar?`,
      'Aplicar porcentaje',
    );
    if (!ok) return;
    setAplicando(true);
    try {
      await pb.send('/api/cuadro-tarifario/aplicar-porcentaje', { method: 'POST', body: { porcentaje: valor } });
      setPorcentaje('');
      await cargar();
      toast('Cuadro tarifario actualizado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setAplicando(false);
    }
  }

  const filasTab = filas.filter((f) => f.categoria === tab);

  return (
    <main>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2>Cuadro Tarifario</h2>
            <div className="hint">Valores de referencia propios de Sistema CyV — no modifica el sistema de ventas de terceros. <Link to="/comercial/cotizador">Ir al Cotizador →</Link></div>
          </div>
          {minimos && (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <div style={{ border: '1px solid var(--brand)', borderRadius: 6, padding: '16px 24px', width: '100%', maxWidth: 560, marginTop: 48 }}>
                <div className="hint" style={{ marginBottom: 12, fontWeight: 700, textAlign: 'center' }}>Mínimo por sucursal</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 12, columnGap: 24, justifyItems: 'center' }}>
                  <div>San Francisco: {money(minimos.san_francisco)}</div>
                  <div>Córdoba: {money(minimos.cordoba)}</div>
                  <div>Buenos Aires: {money(minimos.buenos_aires)}</div>
                  <div>Rosario: {money(minimos.rosario)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="row" style={{ marginTop: 10 }}>
            <div className="field">
              <label>% de actualización</label>
              <input
                type="text"
                inputMode="decimal"
                value={porcentaje}
                disabled={aplicando}
                onChange={(e) => setPorcentaje(e.target.value)}
                placeholder="ej: 5"
                style={{ width: 100 }}
              />
            </div>
            <button onClick={aplicarPorcentaje} disabled={aplicando}>{aplicando ? 'Aplicando…' : 'Aplicar'}</button>
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          {CATEGORIAS.map((c) => (
            <button key={c.id} className={tab === c.id ? 'small' : 'small secondary'} onClick={() => setTab(c.id)}>{c.label}</button>
          ))}
        </div>

        <div className="table-wrap" style={{ marginTop: 10, maxHeight: '70vh' }}>
          {tab === 'seco' ? (
            <table>
              <thead>
                <tr>
                  <th>Rango (Kg)</th><th>Rango (m³)</th><th>Unidad</th>
                  {COLUMNAS_ZONA.map((c) => <th key={c.key} className="num">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {filasTab.map((f) => (
                  <tr key={f.id}>
                    <td>{f.rango_kg_desde} a {f.rango_kg_hasta} Kg</td>
                    <td>{f.rango_m3_desde} a {f.rango_m3_hasta} Mts³</td>
                    <td>
                      {f.por_unidad && <span className="badge" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }} title="El valor es precio por Kg, no un monto fijo por banda">Por Kg</span>}
                    </td>
                    {COLUMNAS_ZONA.map((c) => <td key={c.key} className="num">{money(f.valores?.[c.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead><tr><th>Desde (Kg)</th><th>Hasta (Kg)</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {filasTab.map((f) => (
                  <tr key={f.id}>
                    <td>{f.rango_kg_desde}</td>
                    <td>{f.rango_kg_hasta}</td>
                    <td className="num">{money(f.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!cargando && filasTab.length === 0 && <div className="empty">Sin datos para esta categoría.</div>}
        </div>
      </div>
    </main>
  );
}
