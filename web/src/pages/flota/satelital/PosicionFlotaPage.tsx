import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { pb } from '../../../lib/pb';
import { useToast } from '../../../lib/ToastContext';
import { type VehiculoPressa } from './types';
import { MapaTab } from './MapaTab';
import { CadenaFrioTab } from './CadenaFrioTab';
import { EventosTab } from './EventosTab';
import { RecorridoTab } from './RecorridoTab';
import { KmRealTab } from './KmRealTab';

const ACTUALIZACION_MS = 60000; // 1 minuto

const TABS = [
  { id: 'mapa', label: 'Mapa en vivo' },
  { id: 'frio', label: 'Cadena de frío' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'recorrido', label: 'Recorrido histórico' },
  { id: 'km', label: 'Km real' },
];

export function PosicionFlotaPage() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [vehiculos, setVehiculos] = useState<VehiculoPressa[]>([]);
  const [loading, setLoading] = useState(false);
  const [cargado, setCargado] = useState(false);

  async function buscar() {
    setLoading(true);
    try {
      const res = await pb.send<{ total: number; vehiculos: VehiculoPressa[] }>('/api/flota/pressa/monitor', { method: 'GET' });
      setVehiculos(res.vehiculos || []);
      setCargado(true);
    } catch (e) {
      toast('No se pudo consultar Pressa: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    buscar();
    const id = setInterval(buscar, ACTUALIZACION_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!tab || !TABS.some((t) => t.id === tab)) {
    return <Navigate to="/flota/posicion/mapa" replace />;
  }

  return (
    <main>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Posición de Flota</h2>
          <button className="small secondary" onClick={buscar} disabled={loading}>{loading ? 'Actualizando…' : 'Actualizar ahora'}</button>
        </div>
        <div className="hint">Satelital Pressa — {vehiculos.length} unidades, se actualiza solo cada 1 minuto.</div>
        <div className="row" style={{ marginTop: 14 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tab ? 'small' : 'small secondary'}
              onClick={() => navigate(`/flota/posicion/${t.id}`)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!cargado ? null : (
        <>
          {tab === 'mapa' && <MapaTab vehiculos={vehiculos} />}
          {tab === 'frio' && <CadenaFrioTab vehiculos={vehiculos} />}
          {tab === 'eventos' && <EventosTab vehiculos={vehiculos} />}
          {tab === 'recorrido' && <RecorridoTab vehiculos={vehiculos} />}
          {tab === 'km' && <KmRealTab />}
        </>
      )}
    </main>
  );
}
