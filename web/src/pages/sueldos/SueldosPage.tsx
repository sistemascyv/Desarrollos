import { useState } from 'react';
import { CategoriasSub } from './CategoriasSub';
import { TarifasViajeSub } from './TarifasViajeSub';
import { LiquidacionChoferesSub } from './LiquidacionChoferesSub';
import { LiquidacionAdministrativosSub } from './LiquidacionAdministrativosSub';

type Vista = 'categorias' | 'tarifas' | 'liquidacion_choferes' | 'liquidacion_administrativos';

export function SueldosPage() {
  const [vista, setVista] = useState<Vista>('categorias');

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Sueldos</h2>
        <div className="hint">Categorías de convenio, tarifas de viaje y liquidación mensual.</div>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className={vista === 'categorias' ? 'small' : 'small secondary'} onClick={() => setVista('categorias')}>Categorías de convenio</button>
          <button type="button" className={vista === 'tarifas' ? 'small' : 'small secondary'} onClick={() => setVista('tarifas')}>Tarifas de viaje</button>
          <button type="button" className={vista === 'liquidacion_choferes' ? 'small' : 'small secondary'} onClick={() => setVista('liquidacion_choferes')}>Liquidación — Choferes</button>
          <button type="button" className={vista === 'liquidacion_administrativos' ? 'small' : 'small secondary'} onClick={() => setVista('liquidacion_administrativos')}>Liquidación — Administrativos</button>
        </div>
      </div>

      {vista === 'categorias' && <CategoriasSub />}
      {vista === 'tarifas' && <TarifasViajeSub />}
      {vista === 'liquidacion_choferes' && <LiquidacionChoferesSub />}
      {vista === 'liquidacion_administrativos' && <LiquidacionAdministrativosSub />}
    </main>
  );
}
