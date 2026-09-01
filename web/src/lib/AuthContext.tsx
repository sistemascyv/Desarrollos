import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { pb } from './pb';
import type { Usuario, Rol } from '../types';

interface AuthContextValue {
  usuario: Usuario | null;
  isAuthed: boolean;
  isAdmin: boolean;
  login: (identity: string, password: string) => Promise<void>;
  logout: () => void;
  canAccessModule: (moduleId: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function recordToUsuario(): Usuario | null {
  const model = pb.authStore.record;
  if (!model) return null;
  return {
    id: model.id,
    created: model.created,
    updated: model.updated,
    username: model.username,
    email: model.email,
    nombre: model.nombre,
    rol: model.rol as Rol,
    activo: model.activo,
    modulos: model.modulos || [],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(recordToUsuario());

  useEffect(() => {
    return pb.authStore.onChange(() => {
      setUsuario(recordToUsuario());
    });
  }, []);

  useEffect(() => {
    if (!pb.authStore.isValid) return;
    // Los datos del usuario (rol, módulos) quedan cacheados en el navegador
    // desde el login. Al abrir la app pedimos una versión fresca al servidor
    // para que los cambios de un admin (agregar/quitar módulos, rol, activo)
    // se reflejen sin que el usuario tenga que volver a loguearse.
    pb.collection('usuarios').authRefresh().catch(() => {
      pb.authStore.clear();
    });
  }, []);

  async function login(identity: string, password: string) {
    const result = await pb.collection('usuarios').authWithPassword(identity, password);
    if (result.record.activo === false) {
      pb.authStore.clear();
      throw new Error('Usuario desactivado. Contactá a un administrador.');
    }
  }

  function logout() {
    pb.authStore.clear();
  }

  const isAdmin = usuario?.rol === 'admin';

  function canAccessModule(moduleId: string) {
    if (isAdmin) return true;
    return !!usuario?.modulos?.includes(moduleId);
  }

  const value: AuthContextValue = {
    usuario,
    isAuthed: !!usuario,
    isAdmin,
    login,
    logout,
    canAccessModule,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
