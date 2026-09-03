import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { MODULES, type ModuleDef } from '../types';

export function HomePage() {
  const { usuario, isAdmin, canAccessModule } = useAuth();
  const accesibles = MODULES.filter((m) => canAccessModule(m.id));

  const items: ModuleDef[] = [...accesibles];
  if (isAdmin) {
    items.push({ id: 'administracion', label: 'Administración', group: 'Sistema', path: 'administracion/choferes' });
  }

  return (
    <main>
      <div className="home-hero">
        <h1>Hola, {usuario?.nombre || usuario?.username}</h1>
        <p className="hint">Elegí un módulo para empezar.</p>
      </div>

      <div className="module-grid">
        {items.map((m) => (
          <Link key={m.id} to={`/${m.path}`} className="module-card">
            <div className="group">{m.group}</div>
            <div className="label">{m.label}</div>
            <div className="module-card-cta">Entrar →</div>
          </Link>
        ))}
      </div>

      {items.length === 0 && (
        <p className="empty">Todavía no tenés módulos asignados. Contactá a un administrador.</p>
      )}
    </main>
  );
}
