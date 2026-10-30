import { money } from '../../lib/format';
import type { CuadroTarifarioFila } from '../../types';

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

export function TablaCuadro({ categoria, filas }: { categoria: CuadroTarifarioFila['categoria']; filas: CuadroTarifarioFila[] }) {
  if (categoria === 'seco') {
    return (
      <table>
        <thead>
          <tr>
            <th>Rango (Kg)</th><th>Rango (m³)</th><th>Unidad</th>
            {COLUMNAS_ZONA.map((c) => <th key={c.key} className="num">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
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
    );
  }
  return (
    <table style={{ width: 'auto' }}>
      <thead><tr><th>Desde (Kg)</th><th>Hasta (Kg)</th><th className="num">Valor</th></tr></thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.id}>
            <td>{f.rango_kg_desde}</td>
            <td>{f.rango_kg_hasta}</td>
            <td className="num">{money(f.valor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
