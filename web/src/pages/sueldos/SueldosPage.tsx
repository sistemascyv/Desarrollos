import { useState } from 'react';
import { CategoriasSub } from './CategoriasSub';

type Vista = 'categorias' | 'tarifas';

export function SueldosPage() {
  const [vista, setVista] = useState<Vista>('categorias');

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Sueldos</h2>
        <div className="hint">Categorías de convenio y tarifas de viaje — base para calcular la liquidación mensual de sueldos.</div>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className={vista === 'categorias' ? 'small' : 'small secondary'} onClick={() => setVista('categorias')}>Categorías de convenio</button>
          <button type="button" className={vista === 'tarifas' ? 'small' : 'small secondary'} onClick={() => setVista('tarifas')}>Tarifas de viaje</button>
        </div>
      </div>

      {vista === 'categorias' && <CategoriasSub />}
      {vista === 'tarifas' && <div className="card">Próximamente.</div>}
    </main>
  );
}
