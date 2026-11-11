import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import type { FichadasGrupoRestriccion, FichadasLegajo } from '../../types';

// ---------- Grupos de restricción (vacaciones que no pueden coincidir) ----------

export function GruposRestriccionSub() {
  const toast = useToast();
  const confirm = useConfirm();
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [grupos, setGrupos] = useState<FichadasGrupoRestriccion[]>([]);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [seleccionNueva, setSeleccionNueva] = useState<string[]>([]);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [seleccionEditando, setSeleccionEditando] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const l = await pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' });
        setLegajos(l);
      } catch (err) {
        toast('No se pudieron cargar los empleados: ' + (err instanceof Error ? err.message : ''), 'err');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargar() {
    try {
      const g = await pb.collection('fichadas_grupos_restriccion').getFullList<FichadasGrupoRestriccion>({ sort: 'nombre' });
      setGrupos(g);
    } catch (e) {
      toast('No se pudieron cargar los grupos: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
  useEffect(() => { cargar(); }, []);

  function opcionesSeleccionadas(select: HTMLSelectElement): string[] {
    return Array.from(select.selectedOptions).map((o) => o.value);
  }

  async function crear() {
    if (seleccionNueva.length < 2) { toast('Elegí al menos 2 personas para el grupo.', 'warn'); return; }
    try {
      await pb.collection('fichadas_grupos_restriccion').create({ nombre: nombreNuevo.trim() || null, legajos: seleccionNueva });
      setNombreNuevo(''); setSeleccionNueva([]);
      cargar();
      toast('Grupo creado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function abrirEdicion(g: FichadasGrupoRestriccion) {
    setEditandoId(g.id);
    setSeleccionEditando(g.legajos);
  }

  async function guardarEdicion() {
    if (!editandoId) return;
    if (seleccionEditando.length < 2) { toast('El grupo necesita al menos 2 personas.', 'warn'); return; }
    try {
      await pb.collection('fichadas_grupos_restriccion').update(editandoId, { legajos: seleccionEditando });
      setEditandoId(null);
      cargar();
      toast('Grupo actualizado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function eliminar(id: string) {
    if (!(await confirm('¿Eliminar este grupo de restricción?', 'Eliminar grupo'))) return;
    try {
      await pb.collection('fichadas_grupos_restriccion').delete(id);
      cargar();
      toast('Eliminado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  const legajoPorId = new Map(legajos.map((l) => [l.id, l]));

  return (
    <div className="card">
      <div className="hint">Personas que no pueden coincidir de vacaciones al mismo tiempo. Al asignar un período que se solapa con alguien del mismo grupo, la pestaña Vacaciones avisa (no bloquea).</div>
      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '14px 0 8px' }}>Nuevo grupo</h3>
      <div className="row">
        <div className="field"><label>Nombre (opcional)</label><input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Ej: Julian y Diego" /></div>
        <div className="field" style={{ flex: 2 }}>
          <label>Personas (Ctrl/Cmd + clic para elegir varias)</label>
          <select multiple value={seleccionNueva} onChange={(e) => setSeleccionNueva(opcionesSeleccionadas(e.target))} style={{ height: 140 }}>
            {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
        <button onClick={crear}>Crear grupo</button>
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Grupos ({grupos.length})</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Personas</th><th></th></tr></thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.id}>
                <td className="admin-name">{g.nombre || '—'}</td>
                <td>{g.legajos.map((id) => legajoPorId.get(id)?.nombre || '—').join(', ')}</td>
                <td>
                  <button className="small secondary" onClick={() => abrirEdicion(g)}>Editar</button>
                  <button className="small danger" onClick={() => eliminar(g.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editandoId && (
        <>
          <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Editar personas del grupo</h3>
          <div className="row">
            <div className="field" style={{ flex: 2 }}>
              <select multiple value={seleccionEditando} onChange={(e) => setSeleccionEditando(opcionesSeleccionadas(e.target))} style={{ height: 140 }}>
                {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>
            <button onClick={guardarEdicion}>Guardar</button>
            <button className="secondary" onClick={() => setEditandoId(null)}>Cancelar</button>
          </div>
        </>
      )}
    </div>
  );
}
