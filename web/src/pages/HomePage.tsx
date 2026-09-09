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
  // Mismo orden de grupos que el menú lateral (RRHH, TESORERIA,
  // MANTENIMIENTO...), no alfabético — el orden en que aparecen en MODULES.
  const grupos = [...new Set(items.map((m) => m.group))];

  return (
    <main>
      <div className="home-hero">
        <h1>Hola, {usuario?.nombre || usuario?.username}</h1>
        <p className="hint">Elegí un módulo para empezar.</p>
      </div>

      {grupos.map((grupo) => (
        <div key={grupo} style={{ marginBottom: 28 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
            color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em',
            margin: '0 0 12px',
          }}
          >
            {grupo}
          </h2>
          <div className="module-grid">
            {items.filter((m) => m.group === grupo).map((m) => (
              <Link key={m.id} to={`/${m.path}`} className="module-card">
                <div className="label">{m.label}</div>
                <div className="module-card-cta">Entrar →</div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <p className="empty">Todavía no tenés módulos asignados. Contactá a un administrador.</p>
      )}
    </main>
  );
}
