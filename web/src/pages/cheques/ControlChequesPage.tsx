import { Fragment, useEffect, useRef, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import type { BcraResultado, Cheque } from '../../types';
import { money } from '../../lib/format';
import { leerChequesDeImagen } from '../../lib/ocr';
import { esCuitValido } from '../../lib/cuit';

interface Pendiente {
  cuit_emisor: string;
  numero_cheque: string;
  monto: string;
  emisor_nombre: string;
}

export function ControlChequesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [guardandoPendiente, setGuardandoPendiente] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [textoOcr, setTextoOcr] = useState<string | null>(null);
  const [mostrarTextoOcr, setMostrarTextoOcr] = useState(false);
  const [detalleBcraId, setDetalleBcraId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const items = await pb.collection('cheques').getFullList<Cheque>({ sort: '-created' });
      setCheques(items);
    } catch (e) {
      toast('No se pudieron cargar los cheques: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  // El usuario solo pasa la imagen: apenas hay un archivo, se procesa
  // solo (lee, guarda lo verificado, consulta el BCRA) — sin botones de
  // "Leer" ni "Guardar" en el medio.
  async function procesarImagen(file: File) {
    setPreviewUrl((cur) => {
      if (cur) URL.revokeObjectURL(cur);
      return URL.createObjectURL(file);
    });
    setPendientes([]);
    setTextoOcr(null);
    setMostrarTextoOcr(false);
    setProcesando(true);
    try {
      const { cheques: detectados, textoCrudo } = await leerChequesDeImagen(file);
      setTextoOcr(textoCrudo);
      if (detectados.length === 0) {
        toast('No se detectó ningún CUIT válido en la imagen. Podés cargar el cheque a mano abajo.', 'warn');
        setPendientes([{ cuit_emisor: '', numero_cheque: '', monto: '', emisor_nombre: '' }]);
        return;
      }

      const validos = detectados.filter((d) => d.valido);
      const dudosos = detectados.filter((d) => !d.valido);

      if (dudosos.length > 0) {
        setPendientes(
          dudosos.map((d) => ({
            cuit_emisor: d.cuit,
            numero_cheque: d.numeroCheque,
            monto: d.monto,
            emisor_nombre: d.emisorNombre,
          })),
        );
        toast(`${dudosos.length} CUIT no pasó la validación — revisalo abajo.`, 'warn');
      }

      for (const d of validos) {
        await guardarYConsultar(file, d.cuit, d.numeroCheque, d.monto, d.emisorNombre);
      }
      if (validos.length > 0) {
        toast(`${validos.length} cheque${validos.length === 1 ? '' : 's'} guardado${validos.length === 1 ? '' : 's'} y consultado${validos.length === 1 ? '' : 's'} en el BCRA.`, 'ok');
      }
    } catch (e) {
      toast('Error leyendo la imagen: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setProcesando(false);
    }
  }

  async function guardarYConsultar(imagen: File, cuit: string, numeroCheque: string, monto: string, emisorNombre: string) {
    try {
      const form = new FormData();
      form.append('imagen', imagen);
      form.append('cuit_emisor', cuit);
      form.append('estado', 'pendiente');
      if (numeroCheque) form.append('numero_cheque', numeroCheque);
      if (monto) form.append('monto', monto);
      if (emisorNombre) form.append('emisor_nombre', emisorNombre);
      const registro = await pb.collection('cheques').create<Cheque>(form);
      await load();

      try {
        const res = await pb.send<BcraResultado>(`/api/cheques/bcra/${cuit}`, { method: 'GET' });
        await pb.collection('cheques').update(registro.id, {
          bcra_consultado: true,
          bcra_tiene_rechazados: res.tieneRechazados,
          bcra_detalle: res,
          bcra_fecha_consulta: new Date().toISOString(),
        });
        await load();
      } catch (e) {
        toast('Cheque guardado, pero falló la consulta al BCRA: ' + (e instanceof Error ? e.message : ''), 'warn');
      }
    } catch (e) {
      toast('Error guardando el cheque ' + cuit + ': ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function onPickFile(file: File | null) {
    if (file) procesarImagen(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) onPickFile(file);
  }

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) onPickFile(file);
          e.preventDefault();
          break;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setPendiente(i: number, patch: Partial<Pendiente>) {
    setPendientes((cur) => cur.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function quitarPendiente(i: number) {
    setPendientes((cur) => cur.filter((_, idx) => idx !== i));
  }

  function agregarPendienteVacio() {
    setPendientes((cur) => [...cur, { cuit_emisor: '', numero_cheque: '', monto: '', emisor_nombre: '' }]);
  }

  async function guardarPendiente(i: number) {
    const p = pendientes[i];
    if (!p.cuit_emisor.trim()) { toast('Falta el CUIT.', 'warn'); return; }
    if (!esCuitValido(p.cuit_emisor)) {
      const ok = await confirm(`El CUIT ${p.cuit_emisor} no pasó la validación del dígito verificador. ¿Guardar igual?`, 'CUIT sin verificar');
      if (!ok) return;
    }
    if (!previewUrl) { toast('Se perdió la imagen original, volvé a pegarla.', 'err'); return; }
    setGuardandoPendiente(i);
    try {
      const res = await fetch(previewUrl);
      const blob = await res.blob();
      const file = new File([blob], 'cheque.png', { type: blob.type || 'image/png' });
      await guardarYConsultar(file, p.cuit_emisor.trim(), p.numero_cheque.trim(), p.monto.trim(), p.emisor_nombre.trim());
      quitarPendiente(i);
      toast('Cheque guardado.', 'ok');
    } catch (e) {
      toast('Error guardando: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardandoPendiente(null);
    }
  }

  async function consultarBcra(cheque: Cheque) {
    try {
      const res = await pb.send<BcraResultado>(`/api/cheques/bcra/${cheque.cuit_emisor}`, { method: 'GET' });
      await pb.collection('cheques').update(cheque.id, {
        bcra_consultado: true,
        bcra_tiene_rechazados: res.tieneRechazados,
        bcra_detalle: res,
        bcra_fecha_consulta: new Date().toISOString(),
      });
      await load();
    } catch (e) {
      toast('Error consultando el BCRA: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function borrar(cheque: Cheque) {
    if (!(await confirm('¿Borrar este cheque de la lista? Esta acción no se puede deshacer.', 'Borrar cheque'))) return;
    try {
      await pb.collection('cheques').delete(cheque.id);
      await load();
      toast('Borrado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function limpiarLista() {
    if (cheques.length === 0) return;
    if (!(await confirm(`¿Borrar los ${cheques.length} cheques de la lista? Esta acción no se puede deshacer.`, 'Limpiar lista'))) return;
    try {
      await Promise.all(cheques.map((c) => pb.collection('cheques').delete(c.id)));
      await load();
      toast('Lista limpiada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <main>
      <div className="card">
        <h2>Cargar cheques desde una captura</h2>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => onPickFile(e.target.files?.[0] || null)}
        />
        <div
          className={`dropzone${dragOver ? ' dragover' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="Captura elegida" />
          ) : (
            <>
              <strong>Hacé clic para elegir una imagen</strong>
              o arrastrala acá, o pegala con Ctrl+V (o clic derecho → Pegar)
            </>
          )}
        </div>
        <div className="hint" style={{ marginTop: 10 }}>
          {procesando
            ? 'Leyendo la imagen, guardando y consultando el BCRA…'
            : 'Solo tenés que pegar la captura — el CUIT se lee y valida solo, y se consulta el BCRA automáticamente.'}
        </div>

        {pendientes.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="hint">
              Estos no se guardaron solos porque el CUIT no pasó la validación (o no se detectó ninguno) — revisá y guardá a mano.
            </div>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr><th>CUIT emisor</th><th>Emisor</th><th>N° cheque</th><th className="num">Monto</th><th></th></tr>
                </thead>
                <tbody>
                  {pendientes.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          value={p.cuit_emisor}
                          onChange={(e) => setPendiente(i, { cuit_emisor: e.target.value.replace(/\D/g, '') })}
                          placeholder="11 dígitos"
                          maxLength={11}
                          style={{ width: 120, borderColor: p.cuit_emisor && !esCuitValido(p.cuit_emisor) ? 'var(--warn)' : undefined }}
                        />
                      </td>
                      <td><input value={p.emisor_nombre} onChange={(e) => setPendiente(i, { emisor_nombre: e.target.value })} /></td>
                      <td><input value={p.numero_cheque} onChange={(e) => setPendiente(i, { numero_cheque: e.target.value })} style={{ width: 110 }} /></td>
                      <td><input type="number" step="0.01" value={p.monto} onChange={(e) => setPendiente(i, { monto: e.target.value })} style={{ width: 110 }} /></td>
                      <td className="actions-cell">
                        <button className="small secondary" onClick={() => guardarPendiente(i)} disabled={guardandoPendiente === i}>
                          {guardandoPendiente === i ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button className="small danger" onClick={() => quitarPendiente(i)}>Descartar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="small secondary" style={{ marginTop: 8 }} onClick={agregarPendienteVacio}>+ Agregar otro a mano</button>
          </div>
        )}

        {textoOcr != null && (
          <div style={{ marginTop: 12 }}>
            <a className="link" onClick={() => setMostrarTextoOcr((v) => !v)}>
              {mostrarTextoOcr ? 'Ocultar' : 'Ver'} texto que detectó la lectura automática
            </a>
            {mostrarTextoOcr && (
              <pre
                style={{
                  marginTop: 8, padding: 10, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  background: 'var(--input)', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 200, overflow: 'auto',
                }}
              >
                {textoOcr || '(vacío)'}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2>Cheques cargados</h2>
          <button className="small danger" onClick={limpiarLista} disabled={cheques.length === 0}>Limpiar lista</button>
        </div>
        <div className="table-wrap">
          <table className="tabla-cheques">
            <colgroup>
              <col style={{ width: '15%' }} />
              <col style={{ width: '27%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>CUIT</th><th>Emisor</th><th>N° cheque</th>
                <th className="num" style={{ paddingRight: 20 }}>Monto</th>
                <th style={{ paddingLeft: 20, textAlign: 'center' }}>BCRA</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cheques.map((c) => {
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td>{c.cuit_emisor}</td>
                      <td>{c.emisor_nombre || '—'}</td>
                      <td>{c.numero_cheque || '—'}</td>
                      <td className="num" style={{ paddingRight: 20 }}>{c.monto != null ? money(c.monto) : '—'}</td>
                      <td style={{ textAlign: 'center', paddingLeft: 20 }}>
                        {c.bcra_consultado ? (
                          <button className="bcra-link" onClick={() => setDetalleBcraId(c.id)}>
                            {c.bcra_tiene_rechazados ? (
                              <span className="badge" style={{ color: 'var(--err)', borderColor: 'var(--err)' }}>Tiene rechazados</span>
                            ) : (
                              <span className="badge" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>Sin rechazos</span>
                            )}
                          </button>
                        ) : (
                          <button className="small secondary" onClick={() => consultarBcra(c)}>Consultar BCRA</button>
                        )}
                      </td>
                      <td className="actions-cell">
                        <button className="small danger" onClick={() => borrar(c)}>Borrar</button>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {cheques.length === 0 && <div className="empty">No hay cheques cargados todavía.</div>}
        </div>
      </div>

      {detalleBcraId && (() => {
        const c = cheques.find((x) => x.id === detalleBcraId);
        if (!c) return null;
        const det = c.bcra_detalle;
        const rechazos = det?.rechazos || [];
        return (
          <div className="modal-bg" onClick={() => setDetalleBcraId(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Info BCRA — {c.emisor_nombre || c.cuit_emisor}</h3>
              <div className="row"><strong>CUIT:</strong> {c.cuit_emisor}</div>
              <div className="row"><strong>Denominación (BCRA):</strong> {det?.denominacion || '—'}</div>
              <div className="row">
                <strong>Estado:</strong>{' '}
                {c.bcra_tiene_rechazados ? (
                  <span className="badge" style={{ color: 'var(--err)', borderColor: 'var(--err)' }}>Tiene rechazados</span>
                ) : (
                  <span className="badge" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>Sin rechazos</span>
                )}
              </div>
              {c.bcra_fecha_consulta && (
                <div className="row"><strong>Consultado:</strong> {new Date(c.bcra_fecha_consulta).toLocaleString('es-AR')}</div>
              )}
              {rechazos.length > 0 && (
                <div className="row">
                  <strong>Cheques rechazados:</strong>
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Entidad</th><th>N° cheque</th><th>Fecha rechazo</th>
                          <th className="num">Monto</th><th>Causal</th><th>Pagado</th><th>En proceso judicial</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rechazos.map((r, i) => (
                          <tr key={i}>
                            <td>{r.entidad ?? '—'}</td>
                            <td>{r.nroCheque}</td>
                            <td>{r.fechaRechazo}</td>
                            <td className="num">{money(r.monto)}</td>
                            <td>{r.causal || '—'}</td>
                            <td>{r.fechaPago ? r.fechaPago : 'No'}</td>
                            <td>{r.procesoJud ? 'Sí' : 'No'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="row" style={{ textAlign: 'right', marginTop: 16 }}>
                <button className="secondary" onClick={() => setDetalleBcraId(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
}
