import { useEffect, useRef, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import type { BcraEntidad, Cheque, EstadoCheque } from '../../types';
import { money } from '../../lib/format';

interface Candidato {
  cuit_emisor: string;
  numero_cheque: string;
  monto: string;
  emisor_nombre: string;
  incluir: boolean;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

  function onPickFile(file: File | null) {
    setSelectedFile(file);
    setCandidatos(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function extraer() {
    if (!selectedFile) { toast('Elegí una imagen primero.', 'warn'); return; }
    setExtrayendo(true);
    try {
      const image_base64 = await fileToBase64(selectedFile);
      const res = await pb.send<{ cheques: Array<{ cuit_emisor: string | null; numero_cheque: string | null; monto: number | null; emisor_nombre: string | null }> }>(
        '/api/cheques/extraer-cuit',
        { method: 'POST', body: { image_base64, media_type: selectedFile.type || 'image/jpeg' } },
      );
      const list = res.cheques || [];
      if (list.length === 0) {
        toast('No se detectó ningún cheque en la imagen. Podés cargarlo a mano abajo.', 'warn');
      }
      setCandidatos([
        ...list.map((c) => ({
          cuit_emisor: c.cuit_emisor || '',
          numero_cheque: c.numero_cheque || '',
          monto: c.monto != null ? String(c.monto) : '',
          emisor_nombre: c.emisor_nombre || '',
          incluir: true,
        })),
        { cuit_emisor: '', numero_cheque: '', monto: '', emisor_nombre: '', incluir: list.length === 0 },
      ]);
    } catch (e) {
      toast('Error leyendo la imagen: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setExtrayendo(false);
    }
  }

  function setCandidato(i: number, patch: Partial<Candidato>) {
    setCandidatos((cur) => (cur ? cur.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) : cur));
  }

  async function guardarCandidatos() {
    if (!candidatos || !selectedFile) return;
    const aGuardar = candidatos.filter((c) => c.incluir && c.cuit_emisor.trim());
    if (aGuardar.length === 0) { toast('No hay ningún cheque para guardar (falta el CUIT).', 'warn'); return; }
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
      const res = await pb.send<{ cuit: string; denominacion: string | null; tieneRechazados: boolean; entidades: BcraEntidad[] }>(
        `/api/cheques/bcra/${cheque.cuit_emisor}`,
        { method: 'GET' },
      );
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
        <div className="row">
          <div className="field">
            <label>Captura de pantalla (app del banco)</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={(e) => onPickFile(e.target.files?.[0] || null)} />
          </div>
          <button onClick={extraer} disabled={!selectedFile || extrayendo}>
            {extrayendo ? 'Leyendo imagen…' : 'Leer cheques de la imagen'}
          </button>
        </div>
        {previewUrl && (
          <div style={{ marginTop: 12 }}>
            <img src={previewUrl} alt="preview" style={{ maxWidth: 260, borderRadius: 8, border: '1px solid var(--border)' }} />
          </div>
        )}

        {candidatos && (
          <div style={{ marginTop: 16 }}>
            <div className="hint">Revisá los datos antes de guardar — la lectura automática puede equivocarse.</div>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr><th></th><th>CUIT emisor</th><th>Emisor</th><th>N° cheque</th><th className="num">Monto</th></tr>
                </thead>
                <tbody>
                  {candidatos.map((c, i) => (
                    <tr key={i}>
                      <td><input type="checkbox" checked={c.incluir} onChange={(e) => setCandidato(i, { incluir: e.target.checked })} /></td>
                      <td><input value={c.cuit_emisor} onChange={(e) => setCandidato(i, { cuit_emisor: e.target.value.replace(/\D/g, '') })} placeholder="11 dígitos" style={{ width: 120 }} /></td>
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
      </div>

      <div className="card">
        <h2>Cheques cargados</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>CUIT</th><th>Emisor</th><th>N° cheque</th><th className="num">Monto</th>
                <th>Estado</th><th>BCRA</th><th></th>
              </tr>
            </thead>
            <tbody>
              {cheques.map((c) => (
                <tr key={c.id}>
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
              ))}
            </tbody>
          </table>
          {cheques.length === 0 && <div className="empty">No hay cheques cargados todavía.</div>}
        </div>
      </div>
    </main>
  );
}
