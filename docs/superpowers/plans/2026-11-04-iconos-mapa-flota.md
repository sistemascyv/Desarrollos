# Íconos de vehículo en el Mapa en vivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los círculos de color del Mapa en vivo de flota por íconos de vehículo (camión para tractores, acoplado para semirremolques) que comunican estado (parado/en movimiento) o cadena de frío según el tipo de unidad.

**Architecture:** Los marcadores de Leaflet dejan de ser `L.circleMarker` y pasan a ser `L.marker` con `L.divIcon` (SVG inline, sin archivos de imagen ni dependencias nuevas), unificando también el caso "sin ícono especial" al mismo tipo de marcador para que la actualización en cada refresco use siempre `setIcon()`. Los colores se resuelven con variables CSS ya existentes (`--ok`, `--err`) más una nueva (`--frio`), referenciadas en vivo dentro del SVG — el mismo patrón `color-mix()` que ya usa este proyecto para el scrollbar.

**Tech Stack:** React 19 + TypeScript, Leaflet 1.9 (`@types/leaflet` ya instalado), sin dependencias nuevas.

## Global Constraints

- Regla de negocio: `alias` empieza con "T" (mayúscula o minúscula) → tipo "camion", rojo (`var(--err)`) si `velocidad === 0`, verde (`var(--ok)`) si `velocidad > 0`. `alias` empieza con "S" → tipo "acoplado", celeste (`var(--frio)`) si `temperaturas.length > 0`, rojo (`var(--err)`) si no. Cualquier otro alias → ícono círculo (mismo look que el `circleMarker` de hoy: `v.estadoColor ? '#' + v.estadoColor : '#185FA5'`).
- Todo marcador (con ícono especial o fallback) se crea como `L.marker` + `L.divIcon`, nunca `L.circleMarker` — `marcadoresRef` queda tipado `Map<string, L.Marker>`, un solo tipo.
- Nueva variable CSS `--frio: #4cc9f0;`, mismo valor en `:root` y en `:root[data-theme='dark']` (no hace falta un segundo tono — es un color de ícono sobre el mapa, no de texto sobre el fondo de la app).
- La franja superior del acoplado usa `color-mix(in srgb, <color> 65%, black)` calculado en el momento a partir del mismo color recibido — no se agrega una variable CSS nueva solo para eso.
- No se agrega ningún test automatizado de componente React (fuera de alcance, decisión ya tomada en el eje de tests automáticos).
- No se toca `web/src/pages/flota/satelital/types.ts` ni ningún otro archivo fuera de `web/src/pages/flota/satelital/MapaTab.tsx` y `web/src/index.css`.

---

### Task 1: Íconos SVG por tipo de vehículo en el Mapa en vivo

**Files:**
- Modify: `web/src/index.css` (agregar `--frio` a los dos bloques de variables, más dos reglas nuevas)
- Modify: `web/src/pages/flota/satelital/MapaTab.tsx` (funciones de ícono nuevas + cambiar el efecto de actualización de marcadores)

**Interfaces:**
- Consumes: `VehiculoPressa` de `web/src/pages/flota/satelital/types.ts` (sin cambios) — campos usados: `alias: string`, `velocidad: number`, `temperaturas: number[]`, `estadoColor: string | null`, `lat: number | null`, `lng: number | null`.
- No produce ninguna interfaz nueva para otros archivos (es la única tarea del plan).

- [ ] **Step 1: Agregar la variable `--frio` y las reglas de CSS para los íconos en `web/src/index.css`**

En el bloque `:root` (líneas 17-19 hoy):

```css
  --ok: #3f8f5f;
  --warn: #b8860b;
  --err: #b3382c;
```

Reemplazar por:

```css
  --ok: #3f8f5f;
  --warn: #b8860b;
  --err: #b3382c;
  --frio: #4cc9f0;
```

En el bloque `:root[data-theme='dark']` (líneas 50-52 hoy):

```css
  --ok: #4caf7d;
  --warn: #e0a92e;
  --err: #e5645a;
```

Reemplazar por:

```css
  --ok: #4caf7d;
  --warn: #e0a92e;
  --err: #e5645a;
  --frio: #4cc9f0;
```

Al final del archivo, agregar (Leaflet pone fondo blanco y borde a los `divIcon` por defecto cuando no se les da una clase propia — hay que neutralizarlo; y un `<svg>` inline deja un pequeño espacio de línea base por debajo si no se le pone `display: block`):

```css

/* ---------- íconos de vehículo en el mapa en vivo de flota ---------- */
.flota-icon {
  background: transparent;
  border: none;
}
.flota-icon svg {
  display: block;
}
```

- [ ] **Step 2: Agregar las funciones de ícono en `web/src/pages/flota/satelital/MapaTab.tsx`**

Ubicarlas antes de la función `FlotaMapa` (después de los imports, línea 7 hoy). Agregar:

```tsx
type TipoIconoVehiculo = 'camion' | 'acoplado' | null;

function tipoIconoDeAlias(alias: string): TipoIconoVehiculo {
  const primera = alias.trim().charAt(0).toUpperCase();
  if (primera === 'T') return 'camion';
  if (primera === 'S') return 'acoplado';
  return null;
}

function iconoCamion(color: string): L.DivIcon {
  return L.divIcon({
    className: 'flota-icon',
    html: `<svg viewBox="0 0 64 64" width="28" height="28"><rect x="4" y="18" width="20" height="22" rx="2" fill="${color}"/><path d="M24 24h8l6 8v8h-14z" fill="${color}"/><circle cx="12" cy="42" r="5" fill="#111822" stroke="${color}" stroke-width="2"/><circle cx="32" cy="42" r="5" fill="#111822" stroke="${color}" stroke-width="2"/></svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function iconoAcoplado(color: string): L.DivIcon {
  const franja = `color-mix(in srgb, ${color} 65%, black)`;
  return L.divIcon({
    className: 'flota-icon',
    html: `<svg viewBox="0 0 64 64" width="28" height="28"><rect x="8" y="20" width="44" height="18" rx="2" fill="${color}"/><rect x="8" y="20" width="44" height="5" fill="${franja}"/><circle cx="18" cy="42" r="5" fill="#111822" stroke="${color}" stroke-width="2"/><circle cx="44" cy="42" r="5" fill="#111822" stroke="${color}" stroke-width="2"/></svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function iconoCirculo(color: string): L.DivIcon {
  return L.divIcon({
    className: 'flota-icon',
    html: `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="8" fill="${color}" fill-opacity="0.85" stroke="${color}" stroke-width="2"/></svg>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function iconoParaVehiculo(v: VehiculoPressa): L.DivIcon {
  const tipo = tipoIconoDeAlias(v.alias);
  if (tipo === 'camion') return iconoCamion(v.velocidad > 0 ? 'var(--ok)' : 'var(--err)');
  if (tipo === 'acoplado') return iconoAcoplado(v.temperaturas.length > 0 ? 'var(--frio)' : 'var(--err)');
  return iconoCirculo(v.estadoColor ? '#' + v.estadoColor : '#185FA5');
}
```

- [ ] **Step 3: Cambiar el tipo de `marcadoresRef`**

En `web/src/pages/flota/satelital/MapaTab.tsx`, la línea (hoy línea 17):

```tsx
  const marcadoresRef = useRef<Map<string, L.CircleMarker>>(new Map());
```

Reemplazar por:

```tsx
  const marcadoresRef = useRef<Map<string, L.Marker>>(new Map());
```

- [ ] **Step 4: Usar los íconos nuevos en el efecto de actualización de marcadores**

El efecto hoy (líneas 70-104) es:

```tsx
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const vivos = new Set<string>();
    vehiculos.forEach((v) => {
      if (v.lat === null || v.lng === null) return;
      vivos.add(v.id);
      const color = v.estadoColor ? '#' + v.estadoColor : '#185FA5';
      const popup = `<strong>${v.alias}</strong> (${v.patente})<br>${v.estado || '—'}<br>${num(v.velocidad)} km/h · ${v.direccion || ''}<br><span style="color:#888">${formatoFecha(v.actualizado)}</span>`;
      let marcador = marcadoresRef.current.get(v.id);
      if (marcador) {
        marcador.setLatLng([v.lat, v.lng]);
        marcador.setStyle({ color, fillColor: color });
        marcador.setPopupContent(popup);
      } else {
        marcador = L.circleMarker([v.lat, v.lng], { radius: 8, color, fillColor: color, fillOpacity: 0.85, weight: 2 }).addTo(mapa);
        marcador.bindPopup(popup);
        marcador.bindTooltip(v.alias);
        marcador.on('click', () => mostrarRecorrido(v));
        marcadoresRef.current.set(v.id, marcador);
      }
    });
    // Sacar del mapa unidades que ya no vinieron en esta respuesta.
    for (const [id, marcador] of marcadoresRef.current) {
      if (!vivos.has(id)) { marcador.remove(); marcadoresRef.current.delete(id); }
    }
    // Solo la primera vez centramos/encuadramos en todas las unidades —
    // después el usuario puede haber movido el mapa a mano, no se lo pisamos.
    if (!primerFitRef.current && marcadoresRef.current.size > 0) {
      const bounds = L.latLngBounds([...marcadoresRef.current.values()].map((m) => m.getLatLng()));
      mapa.fitBounds(bounds, { padding: [30, 30] });
      primerFitRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculos]);
```

Reemplazar por (solo cambian las 2 líneas dentro del `if`/`else` que crean/recolorean el marcador — el resto queda idéntico):

```tsx
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const vivos = new Set<string>();
    vehiculos.forEach((v) => {
      if (v.lat === null || v.lng === null) return;
      vivos.add(v.id);
      const popup = `<strong>${v.alias}</strong> (${v.patente})<br>${v.estado || '—'}<br>${num(v.velocidad)} km/h · ${v.direccion || ''}<br><span style="color:#888">${formatoFecha(v.actualizado)}</span>`;
      let marcador = marcadoresRef.current.get(v.id);
      if (marcador) {
        marcador.setLatLng([v.lat, v.lng]);
        marcador.setIcon(iconoParaVehiculo(v));
        marcador.setPopupContent(popup);
      } else {
        marcador = L.marker([v.lat, v.lng], { icon: iconoParaVehiculo(v) }).addTo(mapa);
        marcador.bindPopup(popup);
        marcador.bindTooltip(v.alias);
        marcador.on('click', () => mostrarRecorrido(v));
        marcadoresRef.current.set(v.id, marcador);
      }
    });
    // Sacar del mapa unidades que ya no vinieron en esta respuesta.
    for (const [id, marcador] of marcadoresRef.current) {
      if (!vivos.has(id)) { marcador.remove(); marcadoresRef.current.delete(id); }
    }
    // Solo la primera vez centramos/encuadramos en todas las unidades —
    // después el usuario puede haber movido el mapa a mano, no se lo pisamos.
    if (!primerFitRef.current && marcadoresRef.current.size > 0) {
      const bounds = L.latLngBounds([...marcadoresRef.current.values()].map((m) => m.getLatLng()));
      mapa.fitBounds(bounds, { padding: [30, 30] });
      primerFitRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculos]);
```

- [ ] **Step 5: Verificar build, lint y la suite de tests existente**

Run: `cd web && npm run build`
Expected: exit code 0, sin errores de TypeScript (los tipos de `L.DivIcon`/`L.Marker` vienen de `@types/leaflet`, ya instalado en el proyecto).

Run: `cd web && npm run lint`
Expected: exit code 0, mismos warnings preexistentes de siempre, ninguno nuevo.

Run: `cd web && npm run test`
Expected: `Test Files 3 passed (3)`, `Tests 48 passed (48)` — sin cambios, esta tarea no toca `web/src/lib/`.

- [ ] **Step 6: Verificación manual en el navegador**

Run: `cd web && npm run dev`, loguearse, ir a `/flota/posicion/mapa`.

Expected:
- Las unidades cuyo alias empieza con "T" se ven como ícono de camión: rojo si están paradas (velocidad 0), verde si están en movimiento.
- Las unidades cuyo alias empieza con "S" se ven como ícono de acoplado: celeste si tienen temperatura reportada (equipo de frío activo), rojo si no.
- Cualquier otra unidad se ve igual que antes (círculo de color).
- Tocar una unidad sigue abriendo su recorrido de hoy en el mapa, igual que antes del cambio.
- El popup y el tooltip de cada unidad siguen mostrando la misma información que antes.

**Si el entorno de quien implementa esta tarea no tiene acceso a un navegador** (puede pasar en este proyecto — no asumir que sí hay uno disponible): no inventar un resultado de esta verificación. Reportar el Step 6 como no realizado, dejar claro en el reporte que la confianza en el resultado se apoya en la lectura del código y en el build/lint/test en verde, y marcar el estado final como DONE_WITH_CONCERNS en vez de DONE.

- [ ] **Step 7: Commit**

```bash
git add web/src/index.css web/src/pages/flota/satelital/MapaTab.tsx
git commit -m "Mapa de flota: iconos de camion/acoplado segun tipo, estado y frio"
```

---

## Self-Review

**1. Cobertura del spec:** la regla de negocio completa (prefijo T/S, color por velocidad o por `temperaturas.length`, fallback para otros prefijos) está en `iconoParaVehiculo` (Step 2). El cambio de `L.circleMarker` a `L.marker`+`L.divIcon` unificado, incluyendo el fallback, está en Steps 2-4. La variable `--frio` nueva en ambos temas y las reglas CSS para neutralizar el estilo por defecto de los `divIcon` están en Step 1. Las formas SVG exactas aprobadas en el mockup visual están transcriptas tal cual (ajustando solo el tamaño de visualización, como pedía el spec) en `iconoCamion`/`iconoAcoplado`. Lo marcado como fuera de alcance en el spec (otras pestañas, librerías nuevas, cambiar el criterio de "con frío" o de velocidad) no tiene ninguna tarea que lo toque — correcto.

**2. Placeholders:** ninguno — todo el código (CSS y TypeScript) está completo, no resumido ni descrito en prosa.

**3. Consistencia de tipos:** `iconoParaVehiculo(v: VehiculoPressa): L.DivIcon` es la única función que el efecto de actualización llama (Step 4), y coincide exactamente con la firma definida en Step 2. `marcadoresRef` pasa a `Map<string, L.Marker>` (Step 3) y el efecto modificado (Step 4) solo llama métodos que `L.Marker` sí tiene (`setLatLng`, `setIcon`, `setPopupContent`, `bindPopup`, `bindTooltip`, `on`, `remove`, `getLatLng`) — no quedó ningún `setStyle` residual (ese método no existe en `L.Marker`, solo en `L.Path`/`L.CircleMarker`).
