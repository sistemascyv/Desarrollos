import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { MODULES } from '../types';

export function HomePage() {
  const { usuario, isAdmin, canAccessModule } = useAuth();
  const accesibles = MODULES.filter((m) => canAccessModule(m.id));

  return (
    <div className="card">
      <h1>Hola, {usuario?.nombre || usuario?.username}.</h1>
      <p className="hint">Elegí un módulo para empezar.</p>

      <div className="module-grid">
        {accesibles.map((m) => (
          <Link key={m.id} to={`/${m.path}`} className="module-card">
            <div className="group">{m.group}</div>
            <div className="label">{m.label}</div>
          </Link>
        ))}

        {isAdmin && (
          <Link to="/administracion/choferes" className="module-card">
            <div className="group">Sistema</div>
            <div className="label">Administración</div>
          </Link>
        )}
      </div>

      {accesibles.length === 0 && !isAdmin && (
        <p className="empty">Todavía no tenés módulos asignados. Contactá a un administrador.</p>
      )}
    </div>
  );
}
