# Fichadas: Importar feriados desde API pública — diseño

## Contexto

Hoy los feriados (`fichadas_feriados`) se cargan a mano, uno por uno, desde
la pestaña Carga y novedades (fecha + nombre opcional). Argentina publica
sus feriados nacionales por decreto cada año, y existe una API pública
gratuita y sin clave que los expone:

```
GET https://date.nager.at/api/v3/publicholidays/{año}/AR
```

Confirmado probando el endpoint real para 2026: devuelve 16 feriados, todos
con `types: ["Public"]` — son exactamente los feriados nacionales fijos y
trasladables del decreto anual (Año Nuevo, Carnaval, 24 de marzo, Semana
Santa, 1° de Mayo, 25 de Mayo, etc.). La API **no incluye** feriados puente
ni días no laborables (esos se deciden y publican aparte, más cerca de la
fecha) — lo cual encaja de modo natural con una regla ya confirmada del
negocio: en esta empresa de transporte, los puentes y no laborables casi
siempre se trabajan, así que no tienen que entrar al calendario de
Fichadas. No hace falta filtrar nada del lado del sistema: lo que la API
devuelve ya es exactamente lo que hay que cargar.

## Qué se agrega

Un botón **"Importar feriados {año actual}"** al lado del formulario manual
de alta de feriado, en la misma sección "Feriados" de
`CargaTab.tsx`. Al apretarlo:

1. Pide el endpoint de arriba con el año actual (`new Date().getFullYear()`
   — sin selector de año, confirmado con el usuario: solo año actual).
2. Por cada feriado devuelto, si **ya existe** un `fichadas_feriados` con
   esa `fecha` (comparando el string `YYYY-MM-DD` tal cual), se salta sin
   error ni duplicado — cubre tanto reimportaciones del mismo año como
   feriados ya cargados a mano.
3. Los que no existen se crean con `fecha` (de la API) y `nombre` =
   `localName` de la API (el nombre en español, ej: "Día de la
   Revolución de Mayo").
4. Al terminar, un toast resume el resultado: cuántos se importaron y
   cuántos ya existían (ej: "Importados: 12, ya existían: 4").
5. La lista de feriados ya visible en pantalla se refresca igual que
   después de un alta manual.

El formulario manual (fecha + nombre + "Agregar feriado") queda intacto,
sin cambios — sigue siendo la vía para cualquier feriado puntual que la
API no traiga (o para corregir/completar un nombre).

## Manejo de errores

Si el fetch falla (sin conexión, la API no responde, error HTTP) se
muestra un toast de error con el mensaje, sin tocar nada en
`fichadas_feriados` — el formulario manual sigue disponible como siempre,
nada queda en un estado intermedio raro.

## Fuera de alcance

- Selector de año (confirmado: solo el año actual).
- Traer feriados puente / no laborables (la API no los expone, y la
  empresa los trabaja igual — no hace falta ningún filtro adicional).
- Deshacer una importación en bloque — si algo se importó por error, se
  borra de a uno con el botón "✕" que ya existe en la lista.
- Otros países/provincias — el código de país queda fijo en `AR`.

## Testing

Sin lógica de agregación nueva que necesite `tsx` — es un fetch + mapeo
simple. Se verifica con el build (`npm run build`) y una prueba manual
real contra la API (que ya se hizo durante el brainstorming: el endpoint
2026/AR responde 16 feriados con el formato esperado) más una verificación
en el navegador después del deploy (importar el año actual, confirmar que
aparecen sin duplicar los que ya estaban).
