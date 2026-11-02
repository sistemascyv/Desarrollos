# Administración → Usuarios: cambiar contraseña — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un admin puede resetear la contraseña de cualquier usuario desde Administración → Usuarios, sin necesitar la contraseña vieja.

**Architecture:** Un endpoint nuevo en `pb_hooks/usuarios.pb.js` (`POST /api/usuarios/:id/cambiar-password`), admin-only, que corre a nivel `Dao` (no pasa por la validación `oldPassword` del formulario REST estándar de PocketBase). Un botón + modal nuevo en `UsuariosTab.tsx` que lo llama.

**Tech Stack:** PocketBase (hook JS nuevo) + React/TypeScript (frontend, 1 archivo modificado).

## Global Constraints

- El endpoint exige `rol = "admin"` en el usuario autenticado (`ForbiddenError` si no) — ningún operador puede llamarlo, ni para sí mismo ni para otro.
- Mínimo 8 caracteres, validado tanto en el frontend (antes de llamar al endpoint) como en el backend (nunca confiar solo en la validación del cliente).
- No se pide `oldPassword` en ningún punto del flujo — es un reseteo admin, no autoservicio.
- No hay restricción para cambiar la propia contraseña del admin logueado (a diferencia de Borrar/Desactivar en esta misma pantalla, que sí bloquean actuar sobre uno mismo).
- Build: `npm run build` desde `web/` debe quedar limpio. No hay PocketBase local en este entorno — la verificación del hook es `node --check` (sintaxis) + revisión manual. Sistema en producción real — prohibido escribir datos de prueba contra PocketBase.

---

## File Structure

- **Create:** `pb_hooks/usuarios.pb.js` — endpoint `POST /api/usuarios/:id/cambiar-password`.
- **Modify:** `web/src/pages/admin/UsuariosTab.tsx` — botón "Contraseña" + modal + función que llama al endpoint.

---

### Task 1: Endpoint de cambio de contraseña

**Files:**
- Create: `pb_hooks/usuarios.pb.js`

**Interfaces:**
- Produces: `POST /api/usuarios/:id/cambiar-password` con body `{ password: string }`, devuelve `200 { ok: true }` si sale bien. La Task 2 lo consume vía `pb.send(...)`.

- [ ] **Step 1: Escribir el hook**

Crear `pb_hooks/usuarios.pb.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
// Cambiar la contraseña de un usuario, solo para administradores -- no
// usa el flujo de autoservicio normal de PocketBase (que exige
// oldPassword, pensado para que el propio usuario cambie su
// contraseña sabiendo la actual): un admin reseteando la de otro no
// tiene por qué conocerla. Corre a nivel Dao, que no pasa por esa
// validación del formulario REST estándar -- mismo patrón ya usado en
// pb_hooks/vales_caja.pb.js (/usar, /liberar) y el endpoint
// aplicar-porcentaje del Cuadro Tarifario.
routerAdd("POST", "/api/usuarios/:id/cambiar-password", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth || auth.get("rol") !== "admin") {
    throw new ForbiddenError("No tenés permiso para esto.");
  }
  const body = info.data || {};
  const nueva = String(body.password || "");
  if (nueva.length < 8) {
    throw new BadRequestError("La contraseña debe tener al menos 8 caracteres.");
  }
  const dao = $app.dao();
  const id = c.pathParam("id");
  let record;
  try {
    record = dao.findRecordById("usuarios", id);
  } catch (err) {
    throw new NotFoundError("Usuario no encontrado.");
  }
  record.setPassword(nueva);
  dao.saveRecord(record);
  return c.json(200, { ok: true });
});
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check pb_hooks/usuarios.pb.js`
Expected: sin output (exit code 0). `routerAdd`/`$apis`/`$app`/`ForbiddenError`/`BadRequestError`/`NotFoundError` son globals de PocketBase que no existen en Node — este check solo valida sintaxis JS, no ejecuta el hook (no hay PocketBase local en este entorno).

- [ ] **Step 3: Revisión manual**

Confirmar a mano, leyendo el archivo:
1. El chequeo de admin (`auth.get("rol") !== "admin"`) está ANTES de leer/usar el body — nadie sin ser admin puede llegar a tocar `password` ni la colección `usuarios`.
2. `record.setPassword(nueva)` es el método nativo de PocketBase para registros de colecciones tipo `auth` (confirmar contra la documentación de PocketBase si hay dudas — es el punto de mayor riesgo de este archivo, ya que no hay forma de ejecutarlo en este entorno para confirmar que el nombre del método es exacto).
3. El mensaje de error de cada caso (`ForbiddenError`/`BadRequestError`/`NotFoundError`) es claro y en español, mismo criterio que el resto de los hooks del repo.
4. No se lee `oldPassword` del body en ningún punto -- el endpoint entero existe justamente para no necesitarlo.

- [ ] **Step 4: Commit**

```bash
git add pb_hooks/usuarios.pb.js
git commit -m "feat: endpoint para que un admin cambie la contraseña de un usuario"
```

---

### Task 2: Botón + modal "Cambiar contraseña"

**Files:**
- Modify: `web/src/pages/admin/UsuariosTab.tsx`

**Interfaces:**
- Consumes: `POST /api/usuarios/:id/cambiar-password` (Task 1).
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Nuevo estado**

La línea 24-25 hoy es:

```tsx
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editModulos, setEditModulos] = useState<string[]>([]);
```

Agregar dos líneas nuevas justo después:

```tsx
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editModulos, setEditModulos] = useState<string[]>([]);
  const [passwordEditId, setPasswordEditId] = useState<string | null>(null);
  const [nuevaPassword, setNuevaPassword] = useState('');
```

- [ ] **Step 2: Función que llama al endpoint**

La función `saveUserModules` hoy termina así (líneas 111-121):

```tsx
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
```

Agregar una función nueva justo después:

```tsx
  async function guardarPassword() {
    if (!passwordEditId) return;
    if (nuevaPassword.length < 8) { toast('La contraseña debe tener al menos 8 caracteres.', 'warn'); return; }
    try {
      await pb.send(`/api/usuarios/${passwordEditId}/cambiar-password`, { method: 'POST', body: { password: nuevaPassword } });
      setPasswordEditId(null);
      setNuevaPassword('');
      toast('Contraseña actualizada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
```

- [ ] **Step 3: Variable derivada del usuario en edición**

La línea 127 hoy es:

```tsx
  const editingUser = items.find((u) => u.id === editingId) || null;
```

Agregar una línea nueva justo después:

```tsx
  const editingUser = items.find((u) => u.id === editingId) || null;
  const passwordEditUser = items.find((u) => u.id === passwordEditId) || null;
```

- [ ] **Step 4: Botón en la celda de acciones**

La línea 208 hoy es:

```tsx
                    <button className="small secondary" disabled={u.rol === 'admin'} onClick={() => openModulesModal(u)}>Módulos</button>
```

Agregar una línea nueva justo después (el resto de los botones de esa celda, líneas 209-211, quedan igual):

```tsx
                    <button className="small secondary" disabled={u.rol === 'admin'} onClick={() => openModulesModal(u)}>Módulos</button>
                    <button className="small secondary" onClick={() => { setPasswordEditId(u.id); setNuevaPassword(''); }}>Contraseña</button>
```

- [ ] **Step 5: Modal**

El modal de "Módulos" hoy termina así (líneas 220-243):

```tsx
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
```

Agregar un modal nuevo justo después del `)}` que cierra el modal de Módulos, antes del `</div>` final del componente:

```tsx
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

      {passwordEditUser && (
        <div className="modal-bg open">
          <div className="modal" style={{ maxWidth: 380 }}>
            <span className="close-x" onClick={() => setPasswordEditId(null)}>✕</span>
            <h3>Cambiar contraseña de {passwordEditUser.nombre || passwordEditUser.username}</h3>
            <div className="field">
              <label>Contraseña nueva</label>
              <input type="password" value={nuevaPassword} onChange={(e) => setNuevaPassword(e.target.value)} placeholder="mín. 8 caracteres" />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="secondary" onClick={() => setPasswordEditId(null)}>Cancelar</button>
              <button onClick={guardarPassword}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Build**

Run: `cd web && npm run build`
Expected: compila limpio.

- [ ] **Step 7: Verificación manual**

No hay navegador disponible en este entorno. Verificar por lectura de código:
1. `pb.send` ya se usa en otras páginas de este mismo proyecto con la misma forma (`pb.send(url, { method: 'POST', body: {...} })`) -- confirmar que la llamada nueva sigue exactamente ese mismo patrón.
2. El botón "Contraseña" no tiene `disabled` condicionado a nada (a diferencia de "Módulos", que se deshabilita para admins) -- confirmar que esto es intencional según el plan (cambiar la contraseña de un admin es un caso válido, sin restricción).
3. El modal nuevo sigue el mismo patrón visual (`modal-bg open` / `modal` / `close-x`) que el de Módulos, para que se vea consistente.

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/admin/UsuariosTab.tsx
git commit -m "feat: boton y modal para cambiar la contraseña de un usuario"
```
