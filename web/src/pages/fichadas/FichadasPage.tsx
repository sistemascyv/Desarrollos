import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CargaTab } from './CargaTab';
import { ResultadosTab } from './ResultadosTab';
import { ConfiguracionTab } from './ConfiguracionTab';

const TABS = [
  { id: 'carga', label: 'Carga y novedades' },
  { id: 'resultados', label: 'Resultados' },
  { id: 'configuracion', label: 'Configuración' },
];

export function FichadasPage() {
  const { tab } = useParams();
  const navigate = useNavigate();

  if (!tab || !TABS.some((t) => t.id === tab)) {
    return <Navigate to="/rrhh/fichadas/carga" replace />;
  }

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Fichadas</h2>
        <div className="hint">Análisis del reloj biométrico — reemplaza el procesamiento que antes hacía CINTIA.</div>
        <div className="row" style={{ marginTop: 14 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tab ? 'small' : 'small secondary'}
              onClick={() => navigate(`/rrhh/fichadas/${t.id}`)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'carga' && <CargaTab />}
      {tab === 'resultados' && <ResultadosTab />}
      {tab === 'configuracion' && <ConfiguracionTab />}
    </main>
  );
}
