import { useState } from 'react';
import { CategoriasSub } from './CategoriasSub';
import { TarifasViajeSub } from './TarifasViajeSub';
import { LiquidacionChoferesSub } from './LiquidacionChoferesSub';

type Vista = 'categorias' | 'tarifas' | 'liquidacion';

export function SueldosPage() {
  const [vista, setVista] = useState<Vista>('categorias');

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Sueldos</h2>
        <div className="hint">Categorías de convenio, tarifas de viaje y liquidación mensual de choferes.</div>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className={vista === 'categorias' ? 'small' : 'small secondary'} onClick={() => setVista('categorias')}>Categorías de convenio</button>
          <button type="button" className={vista === 'tarifas' ? 'small' : 'small secondary'} onClick={() => setVista('tarifas')}>Tarifas de viaje</button>
          <button type="button" className={vista === 'liquidacion' ? 'small' : 'small secondary'} onClick={() => setVista('liquidacion')}>Liquidación mensual</button>
        </div>
      </div>

      {vista === 'categorias' && <CategoriasSub />}
      {vista === 'tarifas' && <TarifasViajeSub />}
      {vista === 'liquidacion' && <LiquidacionChoferesSub />}
    </main>
  );
}
