import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { MODULES, type ModuleDef } from '../types';

const ICONO_CHOFERES = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 16h1.5l1.2-4.8A2 2 0 0 1 7.6 9.7h8.8a2 2 0 0 1 1.9 1.5L19.5 16H21" />
    <path d="M3 16v2.5A1.5 1.5 0 0 0 4.5 20h1A1.5 1.5 0 0 0 7 18.5V16" />
    <path d="M17 16v2.5a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5V16" />
    <path d="M3 16h18" />
    <circle cx="7.5" cy="16" r="1.6" />
    <circle cx="16.5" cy="16" r="1.6" />
  </svg>
);

const ICONO_CHEQUES = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" />
    <path d="M7 14h4" />
    <circle cx="17" cy="14.5" r="1.6" />
  </svg>
);

const ICONO_ADMIN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.5a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87A1.7 1.7 0 0 0 3.09 12.46H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V.99" />
  </svg>
);

const ICONO_DEFECTO = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const ICONOS: Record<string, ReactNode> = {
  planilla_choferes: ICONO_CHOFERES,
  control_cheques: ICONO_CHEQUES,
  administracion: ICONO_ADMIN,
};

export function HomePage() {
  const { usuario, isAdmin, canAccessModule } = useAuth();
  const accesibles = MODULES.filter((m) => canAccessModule(m.id));

  const items: ModuleDef[] = [...accesibles];
  if (isAdmin) {
    items.push({ id: 'administracion', label: 'Administración', group: 'Sistema', path: 'administracion/choferes' });
  }

  const grupos: string[] = [];
  for (const m of items) if (!grupos.includes(m.group)) grupos.push(m.group);

  return (
    <main>
      <div className="home-hero">
        <h1>Hola, {usuario?.nombre || usuario?.username}</h1>
        <p className="hint">Elegí un módulo para empezar.</p>
      </div>

      {grupos.map((grupo) => (
        <section key={grupo} className="home-section">
          <h2 className="home-section-title">{grupo}</h2>
          <div className="module-grid">
            {items
              .filter((m) => m.group === grupo)
              .map((m) => (
                <Link key={m.id} to={`/${m.path}`} className="module-card">
                  <div className="module-card-icon">{ICONOS[m.id] || ICONO_DEFECTO}</div>
                  <div className="label">{m.label}</div>
                  <div className="module-card-cta">Entrar →</div>
                </Link>
              ))}
          </div>
        </section>
      ))}

      {items.length === 0 && (
        <p className="empty">Todavía no tenés módulos asignados. Contactá a un administrador.</p>
      )}
    </main>
  );
}
