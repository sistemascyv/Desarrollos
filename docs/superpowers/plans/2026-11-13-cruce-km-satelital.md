# Cruce automático de km con el satelital — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón "Verificar con satelital" en Planilla Choferes que compara, para el chofer y rango de fechas elegidos, el km cargado a mano en los tramos contra el km real del satelital (Pressa/Megatrans), por unidad.

**Architecture:** Todo el cambio vive en un solo archivo de frontend, `web/src/pages/planilla/PlanillaChoferesPage.tsx`. Reusa el endpoint ya existente `GET /api/flota/km-real/:desde/:hasta` (`pb_hooks/km_real.pb.js`, no se toca), copiando el mismo patrón de llamada que ya usa `web/src/pages/flota/satelital/KmRealTab.tsx`. No hay cambios de backend ni de base de datos — es puramente informativo, no guarda ni modifica nada.

**Tech Stack:** React 19 + TypeScript + Vite. Cliente PocketBase (`pb.send` para rutas custom). Sin tests automatizados de frontend.

## Global Constraints

- Segundo sub-proyecto de la automatización de liquidación de sueldos de choferes (el primero, "Sueldos", ya está en staging). No incluye nada de los sub-proyectos siguientes (pantalla de novedades, cálculo de liquidación, integración del chofer).
- El km que se compara contra el satelital es `km_recorridos + km_alargue` de cada tramo (NO `km_dobles` — ver spec, es un conteo para pago, no distancia física).
- Se incluyen los tramos de posicionamiento (`es_posicionamiento: true`) en la suma.
- El cruce entre el `tractor` (texto libre en Tramo) y la unidad que devuelve el satelital se hace por: `vehiculos.codigo` == `tractor` (case-insensitive, sin espacios) para encontrar el vehículo, y luego `alias` o `patente` normalizados contra ese vehículo para encontrar la unidad en la respuesta del satelital. Si no hay match en cualquiera de los 2 pasos: mostrar "Sin dato satelital para esta unidad", nunca un 0.
- Diferencia con `|diferencia%| > 10` se marca visualmente (clase `badge pending`, ya usada en el resto de la app para avisos — ver `web/src/index.css:394-406`).
- No se guarda nada en la base, no se modifica ningún tramo, no hay endpoint nuevo.
- Sin tests automatizados de frontend en este proyecto — cada tarea termina con `cd web && npm run build` limpio + verificación manual. La validación final contra datos reales del satelital solo se puede hacer en staging (no hay forma de simular Pressa/Megatrans localmente) — la verificación manual de este plan se limita a que el flujo, los estados de carga/error y el cálculo de agrupación se vean y funcionen bien con datos ya cargados.

---

### Task 1: Botón "Verificar con satelital" + cruce en PlanillaChoferesPage

**Files:**
- Modify: `web/src/pages/planilla/PlanillaChoferesPage.tsx`

**Interfaces:**
- Consumes: estado ya existente `tramos: Tramo[]` (línea 68, ya filtrado por chofer+rango de fechas por `loadTramos()`, línea 267-284), `vehiculos: Vehiculo[]` (línea 51, cargado por `refreshCatalogs()`), `choferId`/`desde`/`hasta` (líneas 56, 58-59), `mensajeDeError` (ya importado, usado en el mismo archivo en `loadTramos`/`toggleVale`), `pb` (ya importado), endpoint `GET /api/flota/km-real/:desde/:hasta` tal como existe hoy en `pb_hooks/km_real.pb.js` (responde `{ total, unidades: [{alias, patente, distanciaKm}], megatransFallidos, megatransOmitidos }`).
- Produces: nada que otra tarea consuma — este plan tiene una sola tarea.

- [ ] **Step 1: Agregar el tipo local y el estado nuevo**

Justo antes de `export function PlanillaChoferesPage()` (línea 45), agregar el tipo:

```tsx
interface CruceUnidad {
  tractor: string;
  kmCargados: number;
  kmSatelital: number | null; // null = sin dato del satelital para esta unidad
}
```

Dentro del componente, junto al resto de los `useState` (después de la línea `const [editingTramo, setEditingTramo] = useState<Tramo | null>(null);`, línea 75), agregar:

```tsx
  const [verificando, setVerificando] = useState(false);
  const [cruceSatelital, setCruceSatelital] = useState<CruceUnidad[] | null>(null);
```

- [ ] **Step 2: Agregar la función `verificarSatelital`**

Justo después del cierre de la función `loadTramos` (después de la línea 284, antes de `async function loadValesDisponibles() {` en la línea 286), agregar:

```tsx
  async function verificarSatelital() {
    if (!choferId || !desde || !hasta) { toast('Elegí chofer y el rango de fechas.', 'warn'); return; }
    setVerificando(true);
    setCruceSatelital(null);
    try {
      const desdeUnix = Math.floor(new Date(desde + 'T00:00:00').getTime() / 1000);
      const hastaUnix = Math.floor(new Date(hasta + 'T23:59:59').getTime() / 1000);
      const res = await pb.send<{ unidades: { alias: string; patente: string; distanciaKm: number }[]; megatransFallidos?: number }>(
        `/api/flota/km-real/${desdeUnix}/${hastaUnix}`, { method: 'GET' }
      );
      const unidadesSatelital = res.unidades || [];
      if (res.megatransFallidos) {
        toast(`${res.megatransFallidos} unidad(es) de Megatrans no respondieron — el cruce puede estar incompleto.`, 'warn');
      }

      const porTractor = new Map<string, number>();
      for (const t of tramos) {
        const tractor = (t.tractor || '').trim();
        if (!tractor) continue;
        const km = (t.km_recorridos || 0) + (t.km_alargue || 0);
        porTractor.set(tractor, (porTractor.get(tractor) || 0) + km);
      }

      const normalizar = (s: string) => s.replace(/\s+/g, '').toUpperCase();
      const resultado: CruceUnidad[] = [];
      for (const [tractor, kmCargados] of porTractor) {
        const vehiculo = vehiculos.find((v) => normalizar(v.codigo) === normalizar(tractor));
        let kmSatelital: number | null = null;
        if (vehiculo) {
          const match = unidadesSatelital.find((u) =>
            normalizar(u.alias) === normalizar(vehiculo.codigo) ||
            (!!vehiculo.patente && normalizar(u.patente) === normalizar(vehiculo.patente))
          );
          if (match) kmSatelital = match.distanciaKm;
        }
        resultado.push({ tractor, kmCargados, kmSatelital });
      }
      resultado.sort((a, b) => a.tractor.localeCompare(b.tractor));
      setCruceSatelital(resultado);
    } catch (e) {
      toast('No se pudo verificar con el satelital: ' + mensajeDeError(e), 'err');
    } finally {
      setVerificando(false);
    }
  }
```

- [ ] **Step 3: Agregar el botón**

En el `<div className="row">` de la card "Filtrar tramos" (línea 537-553), después del botón "Imprimir" (línea 552), agregar:

```tsx
          <button className="secondary" onClick={verificarSatelital} disabled={verificando || !choferId || !desde || !hasta}>
            {verificando ? 'Verificando…' : 'Verificar con satelital'}
          </button>
```

El bloque completo de botones de esa card queda (sin cambios en las líneas anteriores, solo se agrega la línea nueva al final):

```tsx
          <button onClick={() => { loadTramos(); loadValesDisponibles(); }} disabled={cargando}>{cargando ? 'Buscando…' : 'Buscar'}</button>
          <button className="secondary" onClick={() => { setEditingTramo(null); setModalOpen(true); }}>+ Nuevo tramo</button>
          <button className="secondary" onClick={exportExcel}>Exportar Excel</button>
          <button className="secondary" onClick={() => window.print()}>Imprimir</button>
          <button className="secondary" onClick={verificarSatelital} disabled={verificando || !choferId || !desde || !hasta}>
            {verificando ? 'Verificando…' : 'Verificar con satelital'}
          </button>
```

- [ ] **Step 4: Agregar la tabla de resultado**

Justo después del cierre de la card "Filtrar tramos" (después de la línea 554, `</div>`, antes de `<div className="card">` que abre la card "Tarifa y viático por mes" en la línea 556), agregar:

```tsx
      {cruceSatelital && (
        <div className="card">
          <h2>Cruce con satelital</h2>
          <div className="hint">Km cargados en los tramos (km_recorridos + km_alargue) vs. km real del satelital (Pressa/Megatrans) para el mismo período.</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Unidad</th><th className="num">Km cargados</th><th className="num">Km satelital</th><th className="num">Diferencia</th></tr></thead>
              <tbody>
                {cruceSatelital.map((c) => {
                  const diferencia = c.kmSatelital !== null ? c.kmCargados - c.kmSatelital : null;
                  const diferenciaPct = c.kmSatelital !== null && c.kmSatelital !== 0 ? ((diferencia as number) / c.kmSatelital) * 100 : null;
                  const alerta = diferenciaPct !== null && Math.abs(diferenciaPct) > 10;
                  return (
                    <tr key={c.tractor}>
                      <td className="admin-name">{c.tractor}</td>
                      <td className="num">{c.kmCargados.toLocaleString('es-AR')}</td>
                      <td className="num">{c.kmSatelital !== null ? c.kmSatelital.toLocaleString('es-AR') : 'Sin dato satelital para esta unidad'}</td>
                      <td className="num">
                        {diferencia !== null ? (
                          <span className={alerta ? 'badge pending' : undefined}>
                            {diferencia > 0 ? '+' : ''}{diferencia.toLocaleString('es-AR')} km{diferenciaPct !== null ? ` (${diferenciaPct.toFixed(1)}%)` : ''}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
                {cruceSatelital.length === 0 && <tr><td className="empty" colSpan={4}>No hay tramos con unidad cargada en este período.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Build**

```bash
cd web && npm run build
```

Expected: `tsc -b && vite build` limpio, sin errores de TypeScript.

- [ ] **Step 6: Verificación manual (con datos ya cargados, sin depender del satelital real)**

Con el frontend corriendo (`npm run dev`) contra una instancia de PocketBase con datos de prueba (puede ser staging, logueado como admin, en modo lectura — no hace falta escribir nada):

1. Entrar a Planilla Choferes, elegir un chofer que tenga tramos cargados con `tractor` y `km_recorridos` en algún mes, y el rango de fechas de ese mes.
2. Confirmar que el botón "Verificar con satelital" aparece deshabilitado si falta chofer o fechas, y habilitado cuando están los 3.
3. Tocar el botón — mientras responde, el texto cambia a "Verificando…" y el botón queda deshabilitado.
4. Si el usuario logueado NO tiene el módulo `flota_posicion`: confirmar que aparece el toast de error con el mensaje real del backend ("No tenés acceso al módulo de Posición de Flota"), no un error genérico.
5. Si el usuario SÍ tiene `flota_posicion`: confirmar que aparece la tabla "Cruce con satelital" con una fila por cada `tractor` distinto usado por el chofer en ese rango, con la suma de `km_recorridos + km_alargue` en la columna "Km cargados" (confirmar a mano que la suma es correcta contra los tramos visibles en la tabla de abajo).
6. Si alguna unidad no tiene un `vehiculos.codigo` que coincida con el `tractor` cargado, o el satelital no devolvió esa unidad: confirmar que esa fila dice "Sin dato satelital para esta unidad" y no "0" ni un guion en esa celda puntual (sí puede haber un guion en la columna Diferencia, que es distinto).
7. Si hay una fila con diferencia mayor al 10% en valor absoluto, confirmar que se ve con el estilo de aviso (`badge pending`, el mismo amarillo/naranja que ya se usa en otros avisos de la app).

**Nota:** la comparación contra el km REAL del satelital (que los números devueltos por Pressa/Megatrans sean correctos) solo se puede confirmar en staging/producción contra el servicio real — no es parte de esta verificación.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/planilla/PlanillaChoferesPage.tsx
git commit -m "feat(planilla-choferes): boton Verificar con satelital, cruce de km por unidad"
```

## Self-Review

**1. Cobertura del spec:** botón visible solo con chofer+fechas ✅ (Step 3, `disabled`), agrupación por tractor + suma km_recorridos+km_alargue sin km_dobles ✅ (Step 2), una sola llamada al endpoint existente ✅ (Step 2, un solo `pb.send`), match vehículo→unidad por código luego alias/patente con fallback a "sin dato" ✅ (Step 2), tabla con las 4 columnas pedidas + alerta por umbral 10% ✅ (Step 4), manejo de error 403/502 con mensaje real del backend ✅ (catch con `mensajeDeError`), aviso de `megatransFallidos` ✅ (Step 2), sin guardar nada en la base ✅ (todo el estado es local al componente, ningún `create`/`update`), sin endpoint nuevo ✅ (reusa `/api/flota/km-real` tal cual).

**2. Placeholders:** ninguno — todo el código de cada paso está completo.

**3. Consistencia de tipos:** `CruceUnidad` se define una vez (Step 1) y se usa igual en `verificarSatelital` (Step 2) y en el render (Step 4) — mismos 3 campos (`tractor`, `kmCargados`, `kmSatelital`) en los 3 lugares.

## Ejecución

Plan completo y guardado en `docs/superpowers/plans/2026-11-13-cruce-km-satelital.md`. Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** - despacho un subagente nuevo por tarea, reviso entre tareas, iteración rápida.

**2. Inline Execution** - ejecuto las tareas en esta misma sesión con executing-plans, por lotes con checkpoints.

¿Cuál preferís?
