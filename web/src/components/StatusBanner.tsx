import { useOnlineStatus } from '../lib/useOnlineStatus';
import { discardRejected, flushQueue, getRejected, retryRejected } from '../lib/offlineQueue';
import { useToast } from '../lib/ToastContext';
import { useConfirm } from '../lib/ConfirmContext';

const ACCION: Record<string, string> = { create: 'Alta', update: 'Cambio', delete: 'Borrado' };

export function StatusBanner() {
  const { online, queueLength, rejectedLength } = useOnlineStatus();
  const toast = useToast();
  const confirm = useConfirm();

  if (online && queueLength === 0 && rejectedLength === 0) return null;

  async function syncNow() {
    const { ok, failed } = await flushQueue();
    if (failed === 0) toast('Sincronización completa.', 'ok');
    else toast(`${ok} sincronizados, ${failed} pendientes.`, 'warn');
  }

  async function descartar(qid: string, titulo: string) {
    if (!(await confirm(`Se pierde este cambio y no se manda al servidor:\n${titulo}\n¿Descartarlo?`, 'Descartar cambio'))) return;
    discardRejected(qid);
  }

  // Cambios que el servidor rechazó (validación, permisos, mes cerrado…): no se
  // reintentan solos porque reintentar no los arregla — se muestran acá para
  // que el usuario decida.
  const rechazadas = rejectedLength > 0 ? getRejected() : [];

  return (
    <>
      {!online && (
        <div className="status-banner offline">
          <span>
            Sin conexión — los cambios se guardan en este dispositivo y se sincronizan solos al reconectar
            {queueLength ? ` (${queueLength} pendiente${queueLength === 1 ? '' : 's'})` : ''}.
          </span>
        </div>
      )}
      {online && queueLength > 0 && (
        <div className="status-banner pending">
          <span>
            {queueLength} cambio{queueLength === 1 ? '' : 's'} sin sincronizar.
          </span>
          <button className="secondary" onClick={syncNow}>
            Sincronizar ahora
          </button>
        </div>
      )}
      {rechazadas.length > 0 && (
        <div className="status-banner offline" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <strong>
            {rechazadas.length} cambio{rechazadas.length === 1 ? '' : 's'} que el servidor rechazó (no se guardaron):
          </strong>
          {rechazadas.map((op) => {
            const titulo = `${ACCION[op.type] || op.type}${op.label ? ' — ' + op.label : ` en ${op.collection}`}`;
            return (
              <div key={op.qid} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                <span>
                  {titulo}: {op.error}
                </span>
                <span style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
                  <button className="secondary" onClick={() => retryRejected(op.qid)}>Reintentar</button>
                  <button className="secondary" onClick={() => descartar(op.qid, titulo)}>Descartar</button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
