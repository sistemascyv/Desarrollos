import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChoferesTab } from './ChoferesTab';
import { VehiculosTab } from './VehiculosTab';
import { ClientesTab } from './ClientesTab';
import { RutasTab } from './RutasTab';
import { UsuariosTab } from './UsuariosTab';

const TABS = [
  { id: 'choferes', label: 'Choferes' },
  { id: 'vehiculos', label: 'Vehículos / Tractores' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'rutas', label: 'Rutas frecuentes' },
  { id: 'usuarios', label: 'Usuarios' },
];

export function AdminPage() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const [refreshTick, setRefreshTick] = useState(0);
  const bump = () => setRefreshTick((n) => n + 1);

  if (!tab || !TABS.some((t) => t.id === tab)) {
    return <Navigate to="/administracion/choferes" replace />;
  }

  return (
    <main>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Administración</h2>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tab ? 'small' : 'small secondary'}
              onClick={() => navigate(`/administracion/${t.id}`)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'choferes' && <ChoferesTab version={refreshTick} onChanged={bump} />}
      {tab === 'vehiculos' && <VehiculosTab version={refreshTick} onChanged={bump} />}
      {tab === 'clientes' && <ClientesTab version={refreshTick} onChanged={bump} />}
      {tab === 'rutas' && <RutasTab version={refreshTick} onChanged={bump} />}
      {tab === 'usuarios' && <UsuariosTab version={refreshTick} onChanged={bump} />}
    </main>
  );
}
