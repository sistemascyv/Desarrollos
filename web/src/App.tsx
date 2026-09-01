import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { PlanillaChoferesPage } from './pages/planilla/PlanillaChoferesPage';
import { AdminPage } from './pages/admin/AdminPage';
import { AppLayout } from './components/AppLayout';
import { RequireAuth, RequireAdmin, RequireModule } from './components/RequireAuth';

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
