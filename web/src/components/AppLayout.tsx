import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { MODULES } from '../types';
import { ThemeToggle } from './ThemeToggle';
import { StatusBanner } from './StatusBanner';

export function AppLayout() {
  const { usuario, isAdmin, canAccessModule, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? ' active' : ''}`;

  return (
    <div>
      <div className="mobile-topbar">
        <button type="button" className="secondary small" onClick={() => setSidebarOpen((o) => !o)}>
          Menú
        </button>
        <strong>Carossio Vairolatti</strong>
      </div>

      <div id="app-layout">
        <aside id="sidebar" className={sidebarOpen ? 'open' : ''}>
          <div className="brand">
            <div className="name">Carossio Vairolatti</div>
            <div className="sub">Sistema Integral</div>
          </div>
          <nav id="sidebar-nav" onClick={() => setSidebarOpen(false)}>
            <NavLink to="/inicio" className={navLinkClass}>
              Inicio
            </NavLink>
            <div className="nav-group-label">Liquidación</div>
            {MODULES.map(
              (m) =>
                canAccessModule(m.id) && (
                  <NavLink key={m.id} to={`/${m.path}`} className={navLinkClass}>
                    {m.label}
                  </NavLink>
                ),
            )}
            {isAdmin && (
              <>
                <div className="nav-sep" />
                <NavLink to="/administracion/choferes" className={navLinkClass}>
                  Administración
                </NavLink>
              </>
            )}
          </nav>
          <div className="sidebar-footer">
            <ThemeToggle />
            <span className="sidebar-user">
              {usuario?.nombre || usuario?.username || usuario?.email}
              {isAdmin ? ' · admin' : ''}
            </span>
            <button type="button" className="nav-item" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>
        </aside>

        <div id="content-area">
          <StatusBanner />
          <Outlet />
        </div>
      </div>
    </div>
  );
}
