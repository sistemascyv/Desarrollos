import { Fragment, useEffect, useRef, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import type { BcraResultado, Cheque, EstadoCheque } from '../../types';
import { money } from '../../lib/format';
import { leerCuitsDeImagen } from '../../lib/ocr';
import { esCuitValido } from '../../lib/cuit';

interface Candidato {
  cuit_emisor: string;
  numero_cheque: string;
  monto: string;
  emisor_nombre: string;
  incluir: boolean;
  cuitValidado: boolean;
}

export function ControlChequesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extrayendo, setExtrayendo] = useState(false);
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [consultandoId, setConsultandoId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [textoOcr, setTextoOcr] = useState<string | null>(null);
  const [mostrarTextoOcr, setMostrarTextoOcr] = useState(false);

  useEffect(() => {
    load();
  }, []);

  // Ctrl+V / clic derecho → Pegar en cualquier parte de la página pega la
  // imagen del portapapeles, sin necesidad de tener el foco en un campo.
  const onPickFileRef = useRef<(file: File | null) => void>(() => {});
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            onPickFileRef.current(file);
            toast('Imagen pegada desde el portapapeles.', 'ok');
          }
          e.preventDefault();
          break;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [toast]);

  async function load() {
    try {
      const items = await pb.collection('cheques').getFullList<Cheque>({ sort: '-created' });
      setCheques(items);
    } catch (e) {
      toast('No se pudieron cargar los cheques: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function onPickFile(file: File | null) {
    setSelectedFile(file);
    setCandidatos(null);
    setPreviewUrl((cur) => {
      if (cur) URL.revokeObjectURL(cur);
      return file ? URL.createObjectURL(file) : null;
    });
  }
  onPickFileRef.current = onPickFile;

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) onPickFile(file);
  }

  async function extraer() {
    if (!selectedFile) { toast('Elegí una imagen primero.', 'warn'); return; }
    setExtrayendo(true);
    setTextoOcr(null);
    setMostrarTextoOcr(false);
    try {
      const { candidatos: leidos, textoCrudo } = await leerCuitsDeImagen(selectedFile);
      setTextoOcr(textoCrudo);
      const validados = leidos.filter((c) => c.valido);
      const sinValidar = leidos.filter((c) => !c.valido);
      if (leidos.length === 0) {
        toast('No se detectó ningún número de 11 dígitos en la imagen. Cargalo a mano abajo.', 'warn');
      } else if (validados.length === 0) {
        toast('Encontró números de 11 dígitos pero ninguno pasó la validación de CUIT — revisalos, seguro el OCR se equivocó en un dígito.', 'warn');
      }
      setCandidatos([
        ...validados.map((c) => ({ cuit_emisor: c.cuit, numero_cheque: '', monto: '', emisor_nombre: '', incluir: true, cuitValidado: true })),
        ...sinValidar.map((c) => ({ cuit_emisor: c.cuit, numero_cheque: '', monto: '', emisor_nombre: '', incluir: false, cuitValidado: false })),
        { cuit_emisor: '', numero_cheque: '', monto: '', emisor_nombre: '', incluir: leidos.length === 0, cuitValidado: false },
      ]);
    } catch (e) {
      toast('Error leyendo la imagen: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setExtrayendo(false);
    }
  }

  function setCandidato(i: number, patch: Partial<Candidato>) {
    setCandidatos((cur) =>
      cur
        ? cur.map((c, idx) => {
            if (idx !== i) return c;
            const actualizado = { ...c, ...patch };
            if ('cuit_emisor' in patch) actualizado.cuitValidado = esCuitValido(actualizado.cuit_emisor);
            return actualizado;
          })
        : cur,
    );
  }

  async function guardarCandidatos() {
    if (!candidatos || !selectedFile) return;
    const aGuardar = candidatos.filter((c) => c.incluir && c.cuit_emisor.trim());
    if (aGuardar.length === 0) { toast('No hay ningún cheque para guardar (falta el CUIT).', 'warn'); return; }
    const sinVerificar = aGuardar.filter((c) => !c.cuitValidado);
    if (sinVerificar.length > 0) {
      const ok = await confirm(
        `${sinVerificar.length} CUIT no pasó la validación del dígito verificador (${sinVerificar.map((c) => c.cuit_emisor).join(', ')}). ¿Guardar igual?`,
        'CUIT sin verificar',
      );
      if (!ok) return;
    }
    setGuardando(true);
    try {
      for (const c of aGuardar) {
        const form = new FormData();
        form.append('imagen', selectedFile);
        form.append('cuit_emisor', c.cuit_emisor.trim());
        form.append('estado', 'pendiente');
        if (c.numero_cheque.trim()) form.append('numero_cheque', c.numero_cheque.trim());
        if (c.monto.trim()) form.append('monto', c.monto.trim());
        if (c.emisor_nombre.trim()) form.append('emisor_nombre', c.emisor_nombre.trim());
        await pb.collection('cheques').create(form);
      }
      toast(`${aGuardar.length} cheque${aGuardar.length === 1 ? '' : 's'} guardado${aGuardar.length === 1 ? '' : 's'}.`, 'ok');
      onPickFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setCandidatos(null);
      await load();
    } catch (e) {
      toast('Error guardando: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  async function consultarBcra(cheque: Cheque) {
    setConsultandoId(cheque.id);
    try {
      const res = await pb.send<BcraResultado>(`/api/cheques/bcra/${cheque.cuit_emisor}`, { method: 'GET' });
      await pb.collection('cheques').update(cheque.id, {
        bcra_consultado: true,
        bcra_tiene_rechazados: res.tieneRechazados,
        bcra_detalle: res,
        bcra_fecha_consulta: new Date().toISOString(),
      });
      toast(res.tieneRechazados ? 'Atención: este CUIT tiene cheques rechazados registrados.' : 'Sin cheques rechazados registrados.', res.tieneRechazados ? 'warn' : 'ok');
      await load();
    } catch (e) {
      toast('Error consultando el BCRA: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setConsultandoId(null);
    }
  }

  async function cambiarEstado(cheque: Cheque, estado: EstadoCheque) {
    try {
      await pb.collection('cheques').update(cheque.id, { estado });
      await load();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
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
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={extraer} disabled={!selectedFile || extrayendo}>
            {extrayendo ? 'Leyendo imagen…' : 'Leer cheques de la imagen'}
          </button>
          {selectedFile && (
            <button className="secondary" onClick={() => { onPickFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
              Quitar imagen
            </button>
          )}
        </div>

        {candidatos && (
          <div style={{ marginTop: 16 }}>
            <div className="hint">
              El CUIT se completa solo (validado con el dígito verificador) — revisalo igual antes de guardar.
              Emisor, N° de cheque y monto se cargan a mano.
            </div>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr><th></th><th>CUIT emisor</th><th></th><th>Emisor</th><th>N° cheque</th><th className="num">Monto</th></tr>
                </thead>
                <tbody>
                  {candidatos.map((c, i) => (
                    <tr key={i}>
                      <td><input type="checkbox" checked={c.incluir} onChange={(e) => setCandidato(i, { incluir: e.target.checked })} /></td>
                      <td>
                        <input
                          value={c.cuit_emisor}
                          onChange={(e) => setCandidato(i, { cuit_emisor: e.target.value.replace(/\D/g, '') })}
                          placeholder="11 dígitos"
                          maxLength={11}
                          style={{ width: 120, borderColor: c.cuit_emisor && !c.cuitValidado ? 'var(--warn)' : undefined }}
                        />
                      </td>
                      <td>
                        {c.cuit_emisor.length === 11 && (
                          c.cuitValidado
                            ? <span className="badge" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>OK</span>
                            : <span className="badge" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }} title="No pasó la validación del dígito verificador — revisalo, seguro el OCR se equivocó en un dígito.">Sin verificar</span>
                        )}
                      </td>
                      <td><input value={c.emisor_nombre} onChange={(e) => setCandidato(i, { emisor_nombre: e.target.value })} /></td>
                      <td><input value={c.numero_cheque} onChange={(e) => setCandidato(i, { numero_cheque: e.target.value })} style={{ width: 110 }} /></td>
                      <td><input type="number" step="0.01" value={c.monto} onChange={(e) => setCandidato(i, { monto: e.target.value })} style={{ width: 110 }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="secondary" onClick={() => setCandidatos(null)}>Cancelar</button>
              <button onClick={guardarCandidatos} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cheques'}</button>
            </div>
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
        <h2>Cheques cargados</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th><th>CUIT</th><th>Emisor</th><th>N° cheque</th><th className="num">Monto</th>
                <th>Estado</th><th>BCRA</th><th></th>
              </tr>
            </thead>
            <tbody>
              {cheques.map((c) => {
                const tieneDetalle = !!(c.bcra_tiene_rechazados && c.bcra_detalle?.rechazos?.length);
                const abierto = expandidoId === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td>
                        {tieneDetalle && (
                          <button
                            className={`expand-btn${abierto ? ' open' : ''}`}
                            onClick={() => setExpandidoId(abierto ? null : c.id)}
                          >
                            {abierto ? '▾' : '▸'}
                          </button>
                        )}
                      </td>
                      <td>{c.cuit_emisor}</td>
                      <td>{c.emisor_nombre || '—'}</td>
                      <td>{c.numero_cheque || '—'}</td>
                      <td className="num">{c.monto ? money(c.monto) : '—'}</td>
                      <td>
                        <select value={c.estado} onChange={(e) => cambiarEstado(c, e.target.value as EstadoCheque)}>
                          <option value="pendiente">Pendiente</option>
                          <option value="aceptado">Aceptado</option>
                          <option value="rechazado">Rechazado</option>
                        </select>
                      </td>
                      <td>
                        {c.bcra_consultado ? (
                          c.bcra_tiene_rechazados ? (
                            <span className="badge" style={{ color: 'var(--err)', borderColor: 'var(--err)' }}>Tiene rechazados</span>
                          ) : (
                            <span className="badge" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>Sin rechazos</span>
                          )
                        ) : (
                          <span className="badge">No consultado</span>
                        )}
                      </td>
                      <td className="actions-cell">
                        <button className="small secondary" onClick={() => consultarBcra(c)} disabled={consultandoId === c.id}>
                          {consultandoId === c.id ? 'Consultando…' : 'Consultar BCRA'}
                        </button>
                        <button className="small danger" onClick={() => borrar(c)}>Borrar</button>
                      </td>
                    </tr>
                    {tieneDetalle && (
                      <tr className={`detail-row${abierto ? ' open' : ''}`}>
                        <td></td>
                        <td colSpan={7}>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Entidad</th><th>N° cheque</th><th>Fecha rechazo</th>
                                  <th className="num">Monto</th><th>Causal</th><th>Pagado</th><th>En proceso judicial</th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.bcra_detalle!.rechazos.map((r, i) => (
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
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {cheques.length === 0 && <div className="empty">No hay cheques cargados todavía.</div>}
        </div>
      </div>
    </main>
  );
}
