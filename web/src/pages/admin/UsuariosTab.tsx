import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { MODULES, type Rol, type Usuario } from '../../types';

export function UsuariosTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const { usuario: self } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [items, setItems] = useState<Usuario[]>([]);
  const [search, setSearch] = useState('');

  const [nombre, setNombre] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Rol>('operador');
  const [modulos, setModulos] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editModulos, setEditModulos] = useState<string[]>([]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  async function load() {
    try {
      const list = await pb.collection('usuarios').getFullList<Usuario>({ sort: '-created' });
      setItems(list);
    } catch (e) {
      toast('No se pudo cargar usuarios: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function toggleModulo(id: string) {
    setModulos((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function create() {
    if (!username.trim() || !password) { toast('Faltan usuario y/o contraseña.', 'warn'); return; }
    if (password.length < 8) { toast('La contraseña debe tener al menos 8 caracteres.', 'warn'); return; }
    try {
      const body: Record<string, unknown> = {
        username: username.trim(), password, passwordConfirm: password,
        nombre: nombre.trim(), rol, activo: true, emailVisibility: true, modulos,
      };
      if (email.trim()) body.email = email.trim();
      await pb.collection('usuarios').create(body);
      setNombre(''); setUsername(''); setEmail(''); setPassword(''); setRol('operador'); setModulos([]);
      onChanged();
      toast('Usuario creado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function toggleRol(id: string, currentRol: Rol) {
    const nuevo: Rol = currentRol === 'admin' ? 'operador' : 'admin';
    try {
      await pb.collection('usuarios').update(id, { rol: nuevo });
      await load();
      toast('Rol actualizado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function toggleActivo(id: string, currentlyActive: boolean) {
    if (self?.id === id) { toast('No podés desactivar tu propio usuario.', 'warn'); return; }
    try {
      await pb.collection('usuarios').update(id, { activo: !currentlyActive });
      await load();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function remove(id: string) {
    if (self?.id === id) { toast('No podés borrar tu propio usuario.', 'warn'); return; }
    if (!(await confirm('¿Borrar este registro? Esta acción no se puede deshacer.', 'Borrar registro'))) return;
    try {
      await pb.collection('usuarios').delete(id);
      await load();
      toast('Borrado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function openModulesModal(u: Usuario) {
    setEditingId(u.id);
    setEditModulos(u.modulos || []);
  }

  async function saveUserModules() {
    if (!editingId) return;
    try {
      await pb.collection('usuarios').update(editingId, { modulos: editModulos });
      setEditingId(null);
      await load();
      toast('Módulos actualizados.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter((u) => [u.username, u.nombre, u.email].some((v) => String(v || '').toLowerCase().includes(q)))
    : items;
  const editingUser = items.find((u) => u.id === editingId) || null;

  return (
    <div className="card">
      <h2>Usuarios</h2>
      <div className="row">
        <div className="field"><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
        <div className="field"><label>Usuario (para loguearse)</label><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ej: sistemas" /></div>
        <div className="field" style={{ flex: 1 }}><label>Email (opcional)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Contraseña</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mín. 8 caracteres" /></div>
        <div className="field">
          <label>Rol</label>
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
            <option value="operador">Operador</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
      </div>
      <div className="field" style={{ marginTop: 6 }}>
        <label>Módulos habilitados (solo aplica a operadores; un admin ve todos)</label>
        <div className="module-checklist">
          {MODULES.map((m) => (
            <label key={m.id}>
              <input type="checkbox" checked={modulos.includes(m.id)} onChange={() => toggleModulo(m.id)} />
              {m.label} <span className="hint" style={{ margin: 0 }}>({m.group})</span>
            </label>
          ))}
        </div>
      </div>
      <div className="row">
        <button onClick={create}>+ Agregar</button>
      </div>
      <div className="hint">Operador: puede cargar y editar tramos y tarifas en los módulos que tenga habilitados. Administrador: ve todos los módulos y además gestiona choferes, vehículos, clientes, rutas y usuarios. El login acepta usuario o email.</div>

      <div className="admin-toolbar">
        <input type="text" placeholder="Buscar por usuario, nombre o email..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="count-badge">{filtered.length}{q ? ` de ${items.length}` : ''} {filtered.length === 1 ? 'usuario' : 'usuarios'}</span>
      </div>

      <div className="table-wrap" style={{ maxHeight: '50vh', marginTop: 10 }}>
        <table>
          <thead>
            <tr><th>Usuario</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Módulos</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td className="empty" colSpan={7}>Sin usuarios todavía.</td></tr>}
            {items.length > 0 && filtered.length === 0 && <tr><td className="empty" colSpan={7}>No hay resultados para "{search}".</td></tr>}
            {filtered.map((u) => {
              const inactivo = u.activo === false;
              const isSelf = self?.id === u.id;
              const modulosTxt = u.rol === 'admin'
                ? 'Todos'
                : ((u.modulos || []).length ? (u.modulos || []).map((id) => MODULES.find((m) => m.id === id)?.label || id).join(', ') : '—');
              return (
                <tr key={u.id} className={inactivo ? 'inactivo' : ''}>
                  <td className="admin-name">{u.username}{isSelf ? <span className="badge"> vos</span> : ''}</td>
                  <td>{u.nombre || '—'}</td>
                  <td>{u.email || '—'}</td>
                  <td>{u.rol === 'admin' ? 'Administrador' : 'Operador'}</td>
                  <td>{modulosTxt}</td>
                  <td>{inactivo ? <span className="badge">Inactivo</span> : <span className="badge" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>Activo</span>}</td>
                  <td className="actions-cell">
                    <button className="small secondary" disabled={u.rol === 'admin'} onClick={() => openModulesModal(u)}>Módulos</button>
                    <button className="small secondary" onClick={() => toggleRol(u.id, u.rol)}>{u.rol === 'admin' ? 'Hacer operador' : 'Hacer admin'}</button>
                    <button className="small secondary" disabled={isSelf} onClick={() => toggleActivo(u.id, !inactivo)}>{inactivo ? 'Reactivar' : 'Desactivar'}</button>
                    <button className="small danger" disabled={isSelf} onClick={() => remove(u.id)}>Borrar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <div className="modal-bg open">
          <div className="modal" style={{ maxWidth: 420 }}>
            <span className="close-x" onClick={() => setEditingId(null)}>✕</span>
            <h3>Módulos de {editingUser.nombre || editingUser.username}</h3>
            <div className="module-checklist">
              {MODULES.map((m) => (
                <label key={m.id}>
                  <input
                    type="checkbox"
                    checked={editModulos.includes(m.id)}
                    onChange={() => setEditModulos((cur) => (cur.includes(m.id) ? cur.filter((x) => x !== m.id) : [...cur, m.id]))}
                  />
                  {m.label} <span className="hint" style={{ margin: 0 }}>({m.group})</span>
                </label>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="secondary" onClick={() => setEditingId(null)}>Cancelar</button>
              <button onClick={saveUserModules}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
