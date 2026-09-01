import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthed } = useAuth();
  if (!isAuthed) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAuthed, isAdmin } = useAuth();
  if (!isAuthed) return <Navigate to="/" replace />;
  if (!isAdmin) return <Navigate to="/inicio" replace />;
  return <>{children}</>;
}

export function RequireModule({ moduleId, children }: { moduleId: string; children: React.ReactNode }) {
  const { isAuthed, canAccessModule } = useAuth();
  if (!isAuthed) return <Navigate to="/" replace />;
  if (!canAccessModule(moduleId)) return <Navigate to="/inicio" replace />;
  return <>{children}</>;
}
