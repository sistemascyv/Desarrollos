import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
}

interface ConfirmContextValue {
  confirm: (message: string, title?: string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>({ open: false, title: '', message: '' });
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((message: string, title = 'Confirmar') => {
    setState({ open: true, title, message });
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function respond(result: boolean) {
    setState((s) => ({ ...s, open: false }));
    resolveRef.current?.(result);
    resolveRef.current = null;
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state.open && (
        <div className="modal-bg">
          <div className="modal" style={{ maxWidth: 420 }}>
            <h3>{state.title}</h3>
            <p style={{ fontSize: 13, margin: 0 }}>{state.message}</p>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="secondary" onClick={() => respond(false)}>
                Cancelar
              </button>
              <button className="danger" onClick={() => respond(true)}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
  return ctx.confirm;
}
