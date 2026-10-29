# Cuadro Tarifario: descargar como imagen — Design

## Contexto

`CuadroTarifarioPage.tsx` ya muestra el cuadro de tarifas en 3 pestañas (Seco, Frío, Congelado) más un cuadro de "Mínimo por sucursal". Estos valores se mandan a clientes por fuera del sistema (WhatsApp, mail), y hoy la única forma de hacerlo es una captura de pantalla manual, sin membrete ni logo. Se pide agregar un botón que descargue la pestaña activa como una imagen PNG lista para mandar, con el logo y los datos de la empresa.

Este es un sub-proyecto independiente de "Cotizador: cotizar en Frío y Congelado" (el otro pedido del mismo día) — no se bloquean entre sí.

## Alcance

- Agregar un botón "Descargar imagen" en `CuadroTarifarioPage.tsx`, al lado de las pestañas Seco/Frío/Congelado.
- Descarga un PNG de la categoría actualmente activa (no las 3 juntas).
- El PNG incluye: membrete con logo + dirección, título de la categoría, fecha de generación, el cuadro de "Mínimo por sucursal", y la tabla de precios de esa categoría.
- Disponible para cualquier usuario con acceso al módulo Tarifas (mismo criterio que ya tiene la página hoy — sin restricción nueva).

## Fuera de alcance

- No se cambia la vista en pantalla existente (tabs, tabla, mínimos) — el bloque exportable es una pieza nueva, aparte.
- No se generan las 3 imágenes de una sola vez.
- No se agrega backend/endpoint nuevo — todo el dato ya está cargado en el cliente (`filas`, `minimos`).

## Enfoque técnico

Se usa la librería `html-to-image` (nueva dependencia — no hay forma nativa del navegador de rasterizar un DOM a PNG). Convierte un nodo DOM a PNG en el cliente, sin servidor y sin abrir diálogo de impresión.

Mecánica:
1. Se monta siempre un bloque fuera de pantalla (`position: absolute; left: -9999px`, nunca un modal) con el contenido exportable de la categoría activa.
2. Al tocar "Descargar imagen", `html-to-image` convierte ese nodo a PNG (`toPng(nodo)`).
3. El PNG resultante se descarga vía un `<a download>` temporal — sin pasar por el servidor.

## Componentes

### `CuadroTarifarioExport.tsx` (nuevo)

Componente de presentación pura. Recibe por props:
- `categoria: CategoriaId` ('seco' | 'frio' | 'congelado')
- `filas: CuadroTarifarioFila[]` (ya filtradas por categoría, igual que `filasTab` en la página hoy)
- `minimos: CuadroTarifarioMinimos | null`

Renderiza (fondo blanco, padding generoso para que no quede pegado a los bordes):
- Membrete: `<img src="/vale-logo.jpg" style={{ height: 120 }} />` + dirección ("SAN LORENZO 31, 2400 SAN FRANCISCO (Cba.)") — mismo componente visual que `MembreteImpreso` de `RecibosPage.tsx`/`ValeCajaPage.tsx` (se extrae a un lugar compartido, ver "Reuso" abajo).
- Título: "Tarifario — Seco" / "Tarifario — Frío" / "Tarifario — Congelado" según `categoria`.
- Fecha de generación: `Generado el DD/MM/AAAA`.
- Cuadro de "Mínimo por sucursal" — mismo layout en grilla 2x2 que ya existe en `CuadroTarifarioPage.tsx` (San Francisco, Córdoba, Buenos Aires, Rosario).
- La tabla de precios: misma tabla que hoy se ve en pantalla para esa categoría (las 2 variantes ya existentes: la de Seco con 10 columnas de zona, o la simple de Frío/Congelado con Desde/Hasta/Valor).

**Reuso:** `MembreteImpreso` hoy vive adentro de `RecibosPage.tsx` (función no exportada). Se mueve a `web/src/components/MembreteImpreso.tsx` y se importa desde `RecibosPage.tsx`, `ValeCajaPage.tsx` y `CuadroTarifarioExport.tsx` — evita triplicar el mismo JSX. Mismo criterio, el render de la tabla de precios (las 2 variantes que hoy están inline en `CuadroTarifarioPage.tsx`, líneas 133-167) se extrae a una función/componente `TablaCuadro({ categoria, filas })` compartida entre la vista en pantalla y `CuadroTarifarioExport.tsx`, para que ambas tablas no se desincronicen con el tiempo.

### `CuadroTarifarioPage.tsx` (modificado)

- Agrega `const exportRef = useRef<HTMLDivElement>(null);` y estado `const [generando, setGenerando] = useState(false);`.
- Monta `<div ref={exportRef} style={{ position: 'absolute', left: -9999, top: 0 }}><CuadroTarifarioExport categoria={tab} filas={filasTab} minimos={minimos} /></div>` siempre (no condicional), para que `html-to-image` tenga el nodo ya pintado al hacer clic.
- Botón "Descargar imagen" al lado de las pestañas:
  ```tsx
  <button className="small secondary" onClick={descargarImagen} disabled={generando}>
    {generando ? 'Generando…' : 'Descargar imagen'}
  </button>
  ```
- Función `descargarImagen`:
  ```tsx
  async function descargarImagen() {
    if (!exportRef.current) return;
    setGenerando(true);
    try {
      const dataUrl = await toPng(exportRef.current, { pixelRatio: 2 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Tarifario-${CATEGORIAS.find((c) => c.id === tab)!.label}-${isoDate(new Date())}.png`;
      a.click();
    } catch (e) {
      toast('No se pudo generar la imagen: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGenerando(false);
    }
  }
  ```
  (`pixelRatio: 2` para que el texto no salga borroso al pegarlo en WhatsApp/mail — la mayoría de las pantallas de clientes son de alta densidad.)

## Nombre de archivo

`Tarifario-<Categoria>-<fecha ISO>.png`, ej: `Tarifario-Frio-2026-10-29.png`. Usa el `label` de la categoría (Seco/Frío/Congelado, con mayúscula) para que sea legible al mirar la carpeta de Descargas, y `isoDate(new Date())` (ya existe en `lib/format.ts`, mismo helper que usa el resto del sistema) para la fecha.

## Manejo de errores

Si `toPng` falla (poco común — la causa más probable es el logo sin terminar de cargar), se muestra un toast de error y no se descarga nada. El botón queda deshabilitado y en "Generando…" mientras se resuelve la promesa, para evitar doble clic y descargas duplicadas.

## Testing

- Build (`npm run build`) para confirmar que compila sin errores de tipos.
- Prueba manual en el navegador: entrar a Tarifas, cada una de las 3 pestañas, tocar "Descargar imagen", abrir el PNG resultante y confirmar que se ve el logo, la dirección, el título correcto, la fecha, los mínimos y la tabla completa — sin recortes ni texto borroso.
- Confirmar que la tabla de Seco (la más ancha, 10 columnas de zona) no queda cortada en el PNG — `html-to-image` captura el ancho real del nodo, así que no debería recortarse, pero se verifica a ojo.
