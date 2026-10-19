# Fichadas: Importar feriados desde API pública Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón "Importar feriados {año actual}" a la sección Feriados de Carga y novedades, que trae los feriados nacionales de Argentina desde una API pública gratuita y los carga en `fichadas_feriados` sin duplicar los que ya existen.

**Architecture:** Una sola función nueva en `CargaTab.tsx` que hace `fetch` directo desde el navegador a `https://date.nager.at/api/v3/publicholidays/{año}/AR` (CORS abierto, confirmado `access-control-allow-origin: *`), compara las fechas devueltas contra los feriados ya cargados en memoria, y crea los que faltan uno por uno con `pb.collection('fichadas_feriados').create()` — mismo patrón que ya usa `agregarFeriado()` en el mismo archivo.

**Tech Stack:** React + TypeScript (Vite), `fetch` nativo del navegador (sin librería nueva), PocketBase SDK ya en uso.

## Global Constraints

- Solo el año actual (`new Date().getFullYear()`) — sin selector de año.
- No se filtra nada de la respuesta de la API: todo lo que devuelve son feriados nacionales fijos/trasladables reales (confirmado: 16 para 2026, todos `types: ["Public"]`), la API ya no incluye puentes ni no laborables.
- Un feriado ya existente (misma `fecha`, comparación de string exacta `YYYY-MM-DD`) se saltea, no se duplica ni se sobreescribe.
- El nombre del feriado importado es el `localName` de la API (nombre en español).
- El formulario manual de alta de feriado (fecha + nombre + "Agregar feriado") no se toca.
- Si el fetch falla, un toast de error y nada se crea a medias — no se interrumpe el resto de la pantalla.

---

## Task 1: Botón "Importar feriados" en CargaTab.tsx

**Files:**
- Modify: `web/src/pages/fichadas/CargaTab.tsx`

**Interfaces:**
- No produce nada consumido por otras tareas — es la única tarea del plan.

- [ ] **Step 1: Agregar el estado de carga**

Buscar:

```typescript
  const [feriados, setFeriados] = useState<FichadasFeriado[]>([]);
  const [feriadoFecha, setFeriadoFecha] = useState('');
  const [feriadoNombre, setFeriadoNombre] = useState('');
```

Reemplazar por:

```typescript
  const [feriados, setFeriados] = useState<FichadasFeriado[]>([]);
  const [feriadoFecha, setFeriadoFecha] = useState('');
  const [feriadoNombre, setFeriadoNombre] = useState('');
  const [importandoFeriados, setImportandoFeriados] = useState(false);
```

- [ ] **Step 2: Agregar la función `importarFeriados`**

Buscar:

```typescript
  async function quitarFeriado(id: string) {
    if (!(await confirm('¿Quitar este feriado?', 'Quitar feriado'))) return;
    try {
      await pb.collection('fichadas_feriados').delete(id);
      cargarFeriados();
    } catch (e) {
      toast('No se pudo quitar: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
```

Reemplazar por:

```typescript
  async function quitarFeriado(id: string) {
    if (!(await confirm('¿Quitar este feriado?', 'Quitar feriado'))) return;
    try {
      await pb.collection('fichadas_feriados').delete(id);
      cargarFeriados();
    } catch (e) {
      toast('No se pudo quitar: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function importarFeriados() {
    setImportandoFeriados(true);
    try {
      const anio = new Date().getFullYear();
      const res = await fetch(`https://date.nager.at/api/v3/publicholidays/${anio}/AR`);
      if (!res.ok) throw new Error(`La API respondió ${res.status}`);
      const datos: { date: string; localName: string }[] = await res.json();
      const fechasExistentes = new Set(feriados.map((f) => f.fecha));
      let importados = 0;
      let yaExistian = 0;
      for (const d of datos) {
        if (fechasExistentes.has(d.date)) { yaExistian++; continue; }
        await pb.collection('fichadas_feriados').create({ fecha: d.date, nombre: d.localName });
        importados++;
      }
      await cargarFeriados();
      toast(`Importados: ${importados}, ya existían: ${yaExistian}.`, 'ok');
    } catch (e) {
      toast('No se pudo importar: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setImportandoFeriados(false);
    }
  }
```

- [ ] **Step 3: Agregar el botón en la sección Feriados**

Buscar:

```tsx
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field"><label>Fecha</label><input type="date" value={feriadoFecha} onChange={(e) => setFeriadoFecha(e.target.value)} /></div>
          <div className="field" style={{ flex: 2 }}><label>Nombre (opcional)</label><input value={feriadoNombre} onChange={(e) => setFeriadoNombre(e.target.value)} placeholder="Ej: Día de la Bandera" /></div>
          <button onClick={agregarFeriado}>Agregar feriado</button>
        </div>
        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
```

Reemplazar por:

```tsx
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field"><label>Fecha</label><input type="date" value={feriadoFecha} onChange={(e) => setFeriadoFecha(e.target.value)} /></div>
          <div className="field" style={{ flex: 2 }}><label>Nombre (opcional)</label><input value={feriadoNombre} onChange={(e) => setFeriadoNombre(e.target.value)} placeholder="Ej: Día de la Bandera" /></div>
          <button onClick={agregarFeriado}>Agregar feriado</button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="secondary" disabled={importandoFeriados} onClick={importarFeriados}>
            {importandoFeriados ? 'Importando…' : `Importar feriados ${new Date().getFullYear()}`}
          </button>
        </div>
        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/CargaTab.tsx
git commit -m "Fichadas: importar feriados nacionales desde API pública"
```

(Incluir `Co-Authored-By: Claude <noreply@anthropic.com>`.)

---

## Task 2: Desplegar y verificar

**Files:** (ninguno nuevo — solo push y verificación)

- [ ] **Step 1: Push**

```bash
git push origin claude/cyv-driver-renditions-form-h4l5fu
```

- [ ] **Step 2: Esperar el deploy y confirmar**

Sondear `https://api.github.com/repos/sistemascyv/Desarrollos/actions/runs?branch=claude/cyv-driver-renditions-form-h4l5fu&per_page=1` hasta `status: completed` (o confirmar directamente que el hash del bundle JS cambió en `https://app.carossiovairolatti.com.ar/`).

- [ ] **Step 3: Verificación final en producción**

Entrar a Fichadas → Carga y novedades, tocar "Importar feriados {año actual}", confirmar que aparece el toast con el resumen (importados/ya existían) y que la lista de feriados se actualiza con los feriados nacionales del año sin duplicar ninguno de los que ya estaban cargados. Tocarlo una segunda vez y confirmar que esta vez da "Importados: 0, ya existían: N" (idempotente).
