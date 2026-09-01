import { useOnlineStatus } from '../lib/useOnlineStatus';
import { flushQueue } from '../lib/offlineQueue';
import { useToast } from '../lib/ToastContext';

export function StatusBanner() {
  const { online, queueLength } = useOnlineStatus();
  const toast = useToast();

  if (online && queueLength === 0) return null;

  async function syncNow() {
    const { ok, failed } = await flushQueue();
    if (failed === 0) toast('Sincronización completa.', 'ok');
    else toast(`${ok} sincronizados, ${failed} pendientes.`, 'warn');
  }

  if (!online) {
    return (
      <div className="status-banner offline">
        <span>
          Sin conexión — los cambios se guardan en este dispositivo y se sincronizan solos al reconectar
          {queueLength ? ` (${queueLength} pendiente${queueLength === 1 ? '' : 's'})` : ''}.
        </span>
      </div>
    );
  }

  return (
    <div className="status-banner pending">
      <span>
        {queueLength} cambio{queueLength === 1 ? '' : 's'} sin sincronizar.
      </span>
      <button className="secondary" onClick={syncNow}>
        Sincronizar ahora
      </button>
    </div>
  );
}
