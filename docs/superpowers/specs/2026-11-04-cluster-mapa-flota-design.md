# Agrupar (cluster) marcadores en el Mapa en vivo — Diseño

**Contexto:** En el Mapa en vivo de Posición de Flota (`web/src/pages/flota/satelital/MapaTab.tsx`), el mapa arranca centrado en todo el país (`[-34, -64]`, zoom 5) y hace `fitBounds` automático a todas las unidades la primera vez que llegan datos — es común ver varios marcadores juntos o superpuestos a ese nivel de zoom. El usuario pidió agrupar visualmente los marcadores cercanos en una burbuja con un número cuando están muy juntos, y que esa burbuja se "despliegue" (mostrando las unidades reales de adentro) al tocarla o al acercar el zoom — el patrón estándar de "marker clustering", confirmado con capturas de referencia de otra app.

## Alcance

Solo en la pestaña "Mapa en vivo" de Posición de Flota — es la única pantalla del sistema que muestra varias unidades como marcadores en un mapa al mismo tiempo (Cadena de frío y Eventos son tablas, Recorrido histórico dibuja una única línea).

## Librería

`leaflet.markercluster` (última versión estable 1.5.3, compatible con Leaflet 1.9.4 ya instalado) + `@types/leaflet.markercluster` para los tipos. Es la librería estándar para este patrón exacto en Leaflet — no hay nada equivalente ya instalado ni tiene sentido reimplementar el algoritmo de agrupamiento espacial a mano.

- **Color/estilo de la burbuja:** por defecto de la librería (verde/amarillo/naranja según cuántas unidades agrupa) — se puede ajustar a los colores de marca más adelante si no convence.
- **Umbral de zoom al que se desarman los grupos:** comportamiento automático de la librería (basado en qué tan cerca están los marcadores en pantalla, no en un número de zoom fijo).

## Cambio técnico en `MapaTab.tsx`

Los marcadores dejan de agregarse directo al mapa (`.addTo(mapa)`) y pasan a agregarse a un grupo de clustering (`L.markerClusterGroup()`, creado una vez junto con el mapa y guardado en un `ref` nuevo, agregado al mapa él mismo). El patrón ya existente de no recrear todo en cada actualización (un `Map<string, L.Marker>` en un `ref`, que mueve/actualiza/crea/borra marcadores) se mantiene igual — cambia únicamente a qué capa se agregan los marcadores nuevos, y cómo se sacan los que dejan de reportar.

**Detalle importante, investigado antes de escribir este diseño (no es una suposición):** un marcador que vive dentro de un grupo de clustering tiene que sacarse con el método propio del grupo (`grupo.removeLayer(marcador)`), no con el método genérico del marcador (`marcador.remove()`) — este último no actualiza la estructura interna del grupo, y la unidad queda invisible pero sigue contada en el número de la burbuja. El efecto de limpieza de marcadores viejos se actualiza para usar el método correcto.

Sobre mover una unidad existente (`setLatLng`, ya usado hoy cada 60 segundos para actualizar posición): hay reportes antiguos de bugs al mover un marcador mientras está agrupado, pero la guía más reciente del mantenedor de la librería dice que desde la versión 1.0.0 en adelante (la nuestra es 1.5.3) `setLatLng` funciona correctamente sin necesidad de sacar y volver a agregar el marcador. Se mantiene el código tal cual está hoy en ese punto, pero la verificación manual de esta funcionalidad debe confirmar explícitamente que una unidad agrupada sigue viéndose bien después de al menos una actualización de posición (no alcanza con probar solo la carga inicial).

Todo lo demás del componente queda igual: el popup al tocar una unidad, el tooltip con el alias, el dibujo del recorrido histórico al hacer click (no usa clustering, sigue agregándose directo al mapa), y el ajuste automático de encuadre (`fitBounds`) la primera vez — ese cálculo usa las coordenadas de los marcadores directamente, no depende de si están agrupados o no.

## Fuera de alcance

- No se toca ninguna otra pestaña de Posición de Flota.
- No se personaliza el color/estilo de la burbuja del cluster en esta vuelta — queda con el estilo por defecto de la librería.
- No se fuerza ningún umbral de zoom específico — queda el comportamiento automático de la librería.
