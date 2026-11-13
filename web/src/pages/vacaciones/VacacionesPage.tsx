import { useState } from 'react';
import { AsignarVacacionesSub } from './AsignarVacacionesSub';
import { GruposRestriccionSub } from './GruposRestriccionSub';

type Vista = 'vacaciones' | 'grupos';

export function VacacionesPage() {
  const [vista, setVista] = useState<Vista>('vacaciones');

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Vacaciones</h2>
        <div className="hint">Días por antigüedad, asignación de períodos, liquidación y grupos de restricción — reemplaza los Excel de licencias que arma RRHH a mano.</div>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className={vista === 'vacaciones' ? 'small' : 'small secondary'} onClick={() => setVista('vacaciones')}>Vacaciones</button>
          <button type="button" className={vista === 'grupos' ? 'small' : 'small secondary'} onClick={() => setVista('grupos')}>Grupos de restricción</button>
        </div>
      </div>

      {vista === 'vacaciones' && <AsignarVacacionesSub />}
      {vista === 'grupos' && <GruposRestriccionSub />}
    </main>
  );
}
