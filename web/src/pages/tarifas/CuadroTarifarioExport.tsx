import type { CSSProperties } from 'react';
import { money, isoDate, fechaSola } from '../../lib/format';
import { MembreteImpreso } from '../../components/MembreteImpreso';
import { TablaCuadro } from './TablaCuadro';
import type { CuadroTarifarioFila, CuadroTarifarioMinimos, Sucursal } from '../../types';

const CATEGORIA_LABEL: Record<CuadroTarifarioFila['categoria'], string> = {
  seco: 'Seco', frio: 'Frío', congelado: 'Congelado',
};

// Bloque usado SOLO para generar la imagen descargable (CuadroTarifarioPage.tsx
// lo monta siempre fuera de pantalla) -- no es parte de la vista normal en
// pantalla, por eso no tiene el scroll/maxHeight de "table-wrap" ni el
// mensaje de "sin datos": si no hay filas para la categoria, la tabla sale
// vacia en la imagen, que es una situacion que no deberia darse (el boton
// de descarga esta en la misma pantalla que ya muestra esas filas).
export function CuadroTarifarioExport({ categoria, filas, minimos, sucursal }: {
  categoria: CuadroTarifarioFila['categoria'];
  filas: CuadroTarifarioFila[];
  minimos: CuadroTarifarioMinimos | null;
  sucursal?: Sucursal;
}) {
  return (
    <div className="cuadro-tarifario-export" style={{
      background: '#fff', padding: 24, fontFamily: 'Arial, sans-serif', fontSize: 16, color: '#000',
      '--panel2': '#f1e9dc', '--border': '#e3d7c4', '--brand-dark': '#623c2e', '--accent': '#623c2e',
      '--muted': '#8a7a68', '--warn': '#b8860b',
    } as CSSProperties}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
        <MembreteImpreso sucursal={sucursal} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Tarifario — {CATEGORIA_LABEL[categoria]}</div>
          <div style={{ fontSize: 10, color: '#333' }}>Generado el {fechaSola(isoDate(new Date()))}</div>
        </div>
      </div>

      {minimos && (
        <div style={{ border: '1px solid #999', borderRadius: 6, padding: '12px 20px', marginTop: 16, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={{ marginBottom: 8, fontWeight: 700, textAlign: 'center' }}>Mínimo por sucursal</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 8, columnGap: 24, justifyItems: 'center' }}>
            <div>San Francisco: {money(minimos.san_francisco)}</div>
            <div>Córdoba: {money(minimos.cordoba)}</div>
            <div>Buenos Aires: {money(minimos.buenos_aires)}</div>
            <div>Rosario: {money(minimos.rosario)}</div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <TablaCuadro categoria={categoria} filas={filas} />
      </div>
    </div>
  );
}
