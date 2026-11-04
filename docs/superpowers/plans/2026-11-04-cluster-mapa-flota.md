# Agrupar (cluster) marcadores en el Mapa en vivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar visualmente los marcadores del Mapa en vivo de flota cuando están muy juntos (burbuja con número), desarmándose solos al acercar el zoom o al tocarlos para mostrar las unidades reales de adentro.

**Architecture:** Los marcadores pasan de agregarse directo al `L.Map` a agregarse a un `L.MarkerClusterGroup` (de la librería `leaflet.markercluster`) creado una sola vez junto con el mapa. El patrón existente de actualización incremental (`Map<string, L.Marker>` en un `ref`, sin recrear todo cada 60 segundos) se mantiene — solo cambia a qué capa se agregan/quitan los marcadores.

**Tech Stack:** Leaflet 1.9.4 (ya instalado) + `leaflet.markercluster` 1.5.3 (nueva dependencia) + `@types/leaflet.markercluster` (nueva devDependency).

## Global Constraints

- Alcance: únicamente `web/src/pages/flota/satelital/MapaTab.tsx` y `web/package.json`/`package-lock.json` (vía `npm install`, nunca editados a mano). No se toca ninguna otra pestaña de Posición de Flota.
- Un marcador dentro del grupo de clustering se saca con `grupo.removeLayer(marcador)`, nunca con `marcador.remove()` — confirmado por investigación previa a este plan: `marcador.remove()` no actualiza la estructura interna del grupo, la unidad queda invisible pero la librería la sigue contando en el número de la burbuja.
- `setLatLng`/`setIcon`/`setPopupContent` sobre un marcador ya agrupado se llaman directo, sin sacar y volver a agregar — confirmado que funciona correctamente desde la versión 1.0.0 de la librería en adelante (la instalada es 1.5.3).
- No se toca `web/tsconfig.app.json` — la ampliación de tipos de `@types/leaflet.markercluster` se activa por el `import 'leaflet.markercluster';` real en el archivo, no depende de inclusión ambiental (que sí estaría restringida por el `"types": ["vite/client"]` ya configurado ahí).
- No se personaliza el color de la burbuja del cluster (queda el estilo por defecto de la librería) ni se fuerza ningún umbral de zoom específico (queda el comportamiento automático).
- No se agrega ningún test automatizado de componente React (fuera de alcance, decisión ya tomada en el eje de tests automáticos).

---

### Task 1: Clustering de marcadores en el Mapa en vivo

**Files:**
- Modify: `web/package.json` / `web/package-lock.json` (vía `npm install`, no a mano)
- Modify: `web/src/pages/flota/satelital/MapaTab.tsx`

**Interfaces:**
- Consumes: `L.MarkerClusterGroup`, `L.markerClusterGroup()` de la librería `leaflet.markercluster` (tipados por `@types/leaflet.markercluster`, que amplía el namespace `leaflet` ya importado).
- No produce ninguna interfaz nueva para otros archivos (es la única tarea del plan).

- [ ] **Step 1: Instalar las dependencias nuevas**

```bash
cd web && npm install leaflet.markercluster@^1.5.3
cd web && npm install -D @types/leaflet.markercluster@^1.5.6
```

- [ ] **Step 2: Agregar los imports nuevos en `web/src/pages/flota/satelital/MapaTab.tsx`**

El archivo hoy empieza así (líneas 1-6):

```tsx
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { pb } from '../../../lib/pb';
import { useToast } from '../../../lib/ToastContext';
import { type VehiculoPressa, type PuntoRuta, num, formatoFecha } from './types';
```

Reemplazar por:

```tsx
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { pb } from '../../../lib/pb';
import { useToast } from '../../../lib/ToastContext';
import { type VehiculoPressa, type PuntoRuta, num, formatoFecha } from './types';
```

- [ ] **Step 3: Agregar el `ref` del grupo de clustering**

Dentro de `FlotaMapa`, los `refs` hoy son:

```tsx
  const toast = useToast();
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadoresRef = useRef<Map<string, L.Marker>>(new Map());
  const primerFitRef = useRef(false);
  const polylineRef = useRef<L.Polyline | null>(null);
```

Reemplazar por (se agrega `grupoRef` después de `marcadoresRef`):

```tsx
  const toast = useToast();
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadoresRef = useRef<Map<string, L.Marker>>(new Map());
  const grupoRef = useRef<L.MarkerClusterGroup | null>(null);
  const primerFitRef = useRef(false);
  const polylineRef = useRef<L.Polyline | null>(null);
```

- [ ] **Step 4: Crear el grupo de clustering junto con el mapa**

El efecto de creación del mapa hoy es:

```tsx
  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    const mapa = L.map(contenedorRef.current).setView([-34, -64], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapa);
    mapaRef.current = mapa;
    return () => { mapa.remove(); mapaRef.current = null; };
  }, []);
```

Reemplazar por:

```tsx
  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    const mapa = L.map(contenedorRef.current).setView([-34, -64], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapa);
    const grupo = L.markerClusterGroup();
    grupo.addTo(mapa);
    grupoRef.current = grupo;
    mapaRef.current = mapa;
    return () => { mapa.remove(); mapaRef.current = null; grupoRef.current = null; };
  }, []);
```

- [ ] **Step 5: Usar el grupo de clustering en el efecto de actualización de marcadores**

El efecto hoy es:

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

Reemplazar por:

```tsx
  useEffect(() => {
    const mapa = mapaRef.current;
    const grupo = grupoRef.current;
    if (!mapa || !grupo) return;
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
        marcador = L.marker([v.lat, v.lng], { icon: iconoParaVehiculo(v) }).addTo(grupo);
        marcador.bindPopup(popup);
        marcador.bindTooltip(v.alias);
        marcador.on('click', () => mostrarRecorrido(v));
        marcadoresRef.current.set(v.id, marcador);
      }
    });
    // Sacar del grupo (no del mapa directo) las unidades que ya no vinieron
    // en esta respuesta -- un marcador agrupado hay que sacarlo con el
    // método del grupo, si no la librería lo sigue contando en la burbuja
    // aunque el marcador haya desaparecido.
    for (const [id, marcador] of marcadoresRef.current) {
      if (!vivos.has(id)) { grupo.removeLayer(marcador); marcadoresRef.current.delete(id); }
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

Nota: `mostrarRecorrido` (la función que dibuja la polyline del recorrido histórico) sigue agregando la línea directo a `mapa` con `L.polyline(...).addTo(mapa)` — eso no cambia, el clustering es solo para los marcadores de unidades, no para la polyline.

- [ ] **Step 6: Verificar build, lint y la suite de tests existente**

Run: `cd web && npm run build`
Expected: exit code 0, sin errores de TypeScript (los tipos de `L.MarkerClusterGroup`/`L.markerClusterGroup` vienen de `@types/leaflet.markercluster`, activados por el import real en el archivo).

Run: `cd web && npm run lint`
Expected: exit code 0, mismos warnings preexistentes de siempre, ninguno nuevo.

Run: `cd web && npm run test`
Expected: `Test Files 3 passed (3)`, `Tests 48 passed (48)` — sin cambios, esta tarea no toca `web/src/lib/`.

- [ ] **Step 7: Verificación manual en el navegador**

Run: `cd web && npm run dev`, loguearse, ir a `/flota/posicion/mapa`.

Expected, confirmar TODOS estos puntos (no alcanza con probar solo la carga inicial):
- Con varias unidades juntas en pantalla (zoom alejado, como arranca el mapa hoy), aparece una burbuja con un número en vez de marcadores sueltos superpuestos.
- Tocar la burbuja, o acercar el zoom a mano, la desarma y aparecen las unidades reales de adentro (con sus íconos de camión/acoplado/círculo normales).
- **Dejar la pantalla abierta al menos 60 segundos** (el intervalo de actualización automática, `ACTUALIZACION_MS` en `PosicionFlotaPage.tsx`) y confirmar que una unidad que sigue agrupada se ve bien después de esa actualización automática de posición — no solo en la carga inicial.
- Tocar una unidad individual (agrupada o no) sigue abriendo su recorrido de hoy, igual que antes del cambio.
- Si alguna unidad deja de reportar entre una actualización y la siguiente, desaparece del mapa Y el número de la burbuja que la contenía baja en 1 (no se queda contando una unidad invisible).

**Si el entorno de quien implementa esta tarea no tiene acceso a un navegador** (pasó en las 3 rondas anteriores de este mismo proyecto — no asumir que sí hay uno disponible): no inventar un resultado de esta verificación. Reportar el Step 7 como no realizado, dejar claro en el reporte que la confianza en el resultado se apoya en la lectura del código y en el build/lint/test en verde, y marcar el estado final como DONE_WITH_CONCERNS en vez de DONE.

- [ ] **Step 8: Commit**

```bash
git add web/package.json web/package-lock.json web/src/pages/flota/satelital/MapaTab.tsx
git commit -m "Mapa de flota: agrupar marcadores cercanos (clustering)"
```

---

## Self-Review

**1. Cobertura del spec:** el alcance (solo Mapa en vivo), la librería elegida y su justificación, el cambio de capa de los marcadores (`L.markerClusterGroup` en vez de agregarlos directo al mapa) manteniendo el patrón de actualización incremental, el detalle de `removeLayer` vs `remove()`, y la verificación explícita de mover una unidad agrupada después de una actualización automática, están todos cubiertos en la Tarea 1. Lo marcado como fuera de alcance en el spec (color de la burbuja, umbral de zoom específico, otras pestañas) no tiene ninguna tarea que lo toque — correcto.

**2. Placeholders:** ninguno — todo el código (imports, refs, los dos efectos modificados) está completo, no resumido.

**3. Consistencia de tipos:** `grupoRef` se declara `useRef<L.MarkerClusterGroup | null>(null)` (Step 3) y se usa exactamente con ese tipo en los Steps 4 y 5 (`L.markerClusterGroup()` devuelve un `L.MarkerClusterGroup`, asignado directo sin casts). El guard `if (!mapa || !grupo) return;` en el Step 5 asegura que `grupo` no es `null` en el resto del efecto, consistente con cómo ya se usa `mapa` después de su propio guard.
