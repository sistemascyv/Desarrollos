import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { AppLayout } from './components/AppLayout';
import { RequireAuth, RequireAdmin, RequireModule } from './components/RequireAuth';

const PlanillaChoferesPage = lazy(() =>
  import('./pages/planilla/PlanillaChoferesPage').then((m) => ({ default: m.PlanillaChoferesPage }))
);
const ControlChequesPage = lazy(() =>
  import('./pages/cheques/ControlChequesPage').then((m) => ({ default: m.ControlChequesPage }))
);
const CentralDeudoresPage = lazy(() =>
  import('./pages/deudores/CentralDeudoresPage').then((m) => ({ default: m.CentralDeudoresPage }))
);
const ValeCajaPage = lazy(() =>
  import('./pages/tesoreria/ValeCajaPage').then((m) => ({ default: m.ValeCajaPage }))
);
const RecibosPage = lazy(() =>
  import('./pages/tesoreria/RecibosPage').then((m) => ({ default: m.RecibosPage }))
);
const ReporteCombustiblePage = lazy(() =>
  import('./pages/flota/ReporteCombustiblePage').then((m) => ({ default: m.ReporteCombustiblePage }))
);
const PanelCubiertasPage = lazy(() =>
  import('./pages/flota/PanelCubiertasPage').then((m) => ({ default: m.PanelCubiertasPage }))
);
const PosicionFlotaPage = lazy(() =>
  import('./pages/flota/satelital/PosicionFlotaPage').then((m) => ({ default: m.PosicionFlotaPage }))
);
const FichadasPage = lazy(() =>
  import('./pages/fichadas/FichadasPage').then((m) => ({ default: m.FichadasPage }))
);
const BotTarifasPage = lazy(() =>
  import('./pages/tarifas/BotTarifasPage').then((m) => ({ default: m.BotTarifasPage }))
);
const CuadroTarifarioPage = lazy(() =>
  import('./pages/tarifas/CuadroTarifarioPage').then((m) => ({ default: m.CuadroTarifarioPage }))
);
const CotizadorPage = lazy(() =>
  import('./pages/tarifas/CotizadorPage').then((m) => ({ default: m.CotizadorPage }))
);
const CotizacionImprimirPage = lazy(() =>
  import('./pages/tarifas/CotizacionImprimirPage').then((m) => ({ default: m.CotizacionImprimirPage }))
);
const AdminPage = lazy(() => import('./pages/admin/AdminPage').then((m) => ({ default: m.AdminPage })));

function LoginOrRedirect() {
  const { isAuthed } = useAuth();
  if (isAuthed) return <Navigate to="/inicio" replace />;
  return <LoginPage />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginOrRedirect />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/inicio" element={<HomePage />} />
        <Route
          path="/liquidacion/planilla-choferes"
          element={
            <RequireModule moduleId="planilla_choferes">
              <PlanillaChoferesPage />
            </RequireModule>
          }
        />
        <Route
          path="/finanzas/control-cheques"
          element={
            <RequireModule moduleId="control_cheques">
              <ControlChequesPage />
            </RequireModule>
          }
        />
        <Route
          path="/finanzas/central-deudores"
          element={
            <RequireModule moduleId="central_deudores">
              <CentralDeudoresPage />
            </RequireModule>
          }
        />
        <Route
          path="/finanzas/vale-de-caja"
          element={
            <RequireModule moduleId="vale_caja">
              <ValeCajaPage />
            </RequireModule>
          }
        />
        <Route
          path="/finanzas/recibos"
          element={
            <RequireModule moduleId="recibos">
              <RecibosPage />
            </RequireModule>
          }
        />
        <Route
          path="/flota/consumo-combustible"
          element={
            <RequireModule moduleId="consumo_combustible">
              <ReporteCombustiblePage />
            </RequireModule>
          }
        />
        <Route
          path="/flota/panel-cubiertas"
          element={
            <RequireModule moduleId="panel_cubiertas">
              <PanelCubiertasPage />
            </RequireModule>
          }
        />
        <Route path="/flota/posicion" element={<Navigate to="/flota/posicion/mapa" replace />} />
        <Route
          path="/flota/posicion/:tab"
          element={
            <RequireModule moduleId="flota_posicion">
              <PosicionFlotaPage />
            </RequireModule>
          }
        />
        <Route path="/rrhh/fichadas" element={<Navigate to="/rrhh/fichadas/carga" replace />} />
        <Route
          path="/rrhh/fichadas/:tab"
          element={
            <RequireModule moduleId="fichadas">
              <FichadasPage />
            </RequireModule>
          }
        />
        <Route
          path="/comercial/bot-tarifas"
          element={
            <RequireModule moduleId="bot_tarifas">
              <BotTarifasPage />
            </RequireModule>
          }
        />
        <Route
          path="/comercial/tarifas"
          element={
            <RequireModule moduleId="cuadro_tarifario">
              <CuadroTarifarioPage />
            </RequireModule>
          }
        />
        <Route
          path="/comercial/cotizador"
          element={
            <RequireModule moduleId="cotizador">
              <CotizadorPage />
            </RequireModule>
          }
        />
        <Route
          path="/comercial/cotizador/:id/imprimir"
          element={
            <RequireModule moduleId="cotizador">
              <CotizacionImprimirPage />
            </RequireModule>
          }
        />
        <Route path="/administracion" element={<Navigate to="/administracion/choferes" replace />} />
        <Route
          path="/administracion/:tab"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
