# Íconos de vehículo en el Mapa en vivo — Diseño

**Contexto:** En el Mapa en vivo de Posición de Flota (`web/src/pages/flota/satelital/MapaTab.tsx`), cada unidad se muestra hoy como un círculo de color (`L.circleMarker` de Leaflet), coloreado con el `estadoColor` que manda Pressa. El usuario pidió distinguir visualmente tractores de semirremolques con íconos de vehículo, y usar el color para comunicar dos cosas distintas según el tipo de unidad: si un tractor está parado o en movimiento, y si un semi tiene el equipo de frío activo.

## Regla de negocio

Por cada unidad, según el prefijo de su `alias` (el código con el que Pressa identifica la unidad, ej. "T045", "S012"):

- **Empieza con "T" (tractor):** ícono de camión. **Rojo** si `velocidad === 0` (parado), **verde** si `velocidad > 0` (en movimiento).
- **Empieza con "S" (semirremolque):** ícono de acoplado. **Celeste** si `temperaturas.length > 0` (tiene equipo de frío activo — mismo criterio ya usado en `CadenaFrioTab.tsx` para "esta unidad tiene sensor de frío"), **rojo** si no.
- **Cualquier otro prefijo:** sin cambios — se queda con el círculo de color que ya se usa hoy (`estadoColor` de Pressa, o azul por defecto).

## Estilo visual

Confirmado con el usuario vía mockup interactivo: íconos geométricos simples (formas rectas, sin detalle de cabina/parabrisas) — se leen bien aunque el mapa tenga muchas unidades juntas y estén chicos.

- Verde y rojo: mismos tokens de color que ya usa el sistema (`--ok` / `--err`, los que pinta `CadenaFrioTab.tsx` para en-rango/fuera-de-rango).
- Celeste: color nuevo, no existía antes en el sistema. Se agrega como variable `--frio` (o nombre equivalente) en `web/src/index.css`, junto a las demás, con el valor `#4cc9f0` confirmado en el mockup.

## Cambio técnico en `MapaTab.tsx`

Los marcadores dejan de ser `L.circleMarker` y pasan a ser `L.marker` con un `L.divIcon` (SVG inline, sin archivos de imagen nuevos ni dependencias nuevas). El patrón de actualización que ya existe se mantiene igual: un `Map<string, L.Marker>` guardado en un `ref` (hoy es `Map<string, L.CircleMarker>`), que en cada actualización de los 60 segundos mueve (`setLatLng`) y re-colorea el marcador existente en vez de recrearlo — así no parpadea. La única diferencia es que en vez de `marcador.setStyle({ color, fillColor: color })` se usa `marcador.setIcon(iconoCalculado)` para redibujar el ícono si cambió de estado (parado/movimiento, con/sin frío).

Todo lo demás del componente queda igual: el popup al tocar una unidad, el tooltip con el alias, el dibujo del recorrido histórico al hacer click, y el ajuste automático de encuadre (`fitBounds`) la primera vez que cargan unidades.

## Fuera de alcance

- No se toca ninguna otra pestaña de Posición de Flota (Cadena de frío, Eventos, Recorrido histórico, Km real) — el pedido es específicamente sobre el Mapa en vivo.
- No se agrega ninguna librería ni archivo de imagen nuevo — los íconos son SVG inline generados en el propio componente.
- No se cambia el criterio de qué cuenta como "con frío" (`temperaturas.length > 0`) ni el de velocidad — son los mismos que ya usa el resto del sistema.
