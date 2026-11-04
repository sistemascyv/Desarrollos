# Íconos de vehículo más grandes y con contorno — Ajuste

**Contexto:** Ajuste de polish visual sobre `docs/superpowers/specs/2026-11-04-iconos-mapa-flota-design.md` (ya en producción). El usuario probó los íconos de camión/acoplado en el mapa real y reportó que se pierden un poco, mimetizándose con el fondo del mapa a ciertos niveles de zoom: "los haría más grande... o con contorno".

## Decisión (confirmada con mockup visual)

Opción **A**, combinando ambas ideas:

- **Tamaño:** de 28px a 44px de ancho/alto (el SVG interno sigue en `viewBox="0 0 64 64"`, solo cambia el tamaño de visualización). `iconAnchor` pasa de `[14, 14]` a `[22, 22]` para seguir centrado sobre el punto GPS real.
- **Contorno:** un borde blanco (`stroke="#ffffff"`) alrededor de la silueta — `stroke-width="3"` en las formas del cuerpo (caja del camión, capot, caja del acoplado), `stroke-width="2.5"` en las ruedas (que hoy tienen el contorno del mismo color que el relleno, poco contrastante). Se agrega `stroke-linejoin="round"` donde corresponda para que las esquinas del contorno queden prolijas.

Se aplica igual a `iconoCamion` y `iconoAcoplado` (mismo tratamiento en las dos funciones). La franja superior del acoplado (el `color-mix` que marca el techo) no lleva contorno propio — solo el borde exterior de la caja, para no dejar una línea rara adentro de la silueta.

## Fuera de alcance

- `iconoCirculo` (el fallback para unidades que no son tractor ni semi) no se toca — no fue parte del pedido.
- No cambia la regla de negocio de colores (verde/rojo por velocidad, celeste/rojo por frío) — solo tamaño y contorno.
