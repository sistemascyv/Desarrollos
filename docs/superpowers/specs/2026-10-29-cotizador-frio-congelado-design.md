# Cotizador: cotizar en Frío y Congelado — Design

## Contexto

El Cotizador hoy solo puede facturar carga Seca: la consulta a `cuadro_tarifario` tiene hardcodeado `filter: "categoria = 'seco'"` (`CotizadorPage.tsx:126`) y la función de cálculo (`calcularItem` en `cotizadorMotor.ts`) asume la estructura de precios de Seco (banda por Kg o m³, por zona origen↔destino). El Cuadro Tarifario ya tiene datos cargados para Frío y Congelado, pero con una estructura más simple: un valor fijo por banda de Kg, sin zona ni m³ (`CuadroTarifarioFila.valor`, no `.valores`).

Sub-proyecto independiente de "Cuadro Tarifario: descargar como imagen" (spec del mismo día) — no se bloquean entre sí.

## Decisiones (confirmadas con el usuario)

- La categoría (Seco/Frío/Congelado) se elige **una vez por cotización completa**, no por ítem — un viaje es de un solo tipo de carga.
- El **mínimo por sucursal** aplica igual para las 3 categorías — no hay que cargar mínimos distintos por categoría.
- El campo "Metros Cúbicos" del formulario de ítems se **oculta** cuando la cotización es Frío o Congelado (no participa del cálculo en esas categorías).

## Modelo de datos

Se agrega el campo `categoria: 'seco' | 'frio' | 'congelado'` (select) a la colección `cotizaciones`, con el mismo set de valores que ya usa `cuadro_tarifario.categoria`. Las cotizaciones existentes (hoy todas Seco, de antes de esta feature) se backfillean a `'seco'` en la misma migración — mismo patrón que `1789270000_usuarios_sucursal.js` (campo `required: false` al agregarlo + loop de backfill, no hace falta volver a tocar la colección para poner `required: true` después).

```js
// pb_migrations/<timestamp>_cotizaciones_categoria.js
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('cotizaciones01');
  collection.schema.addField(new SchemaField({
    system: false, id: 'cot0categoria1', name: 'categoria', type: 'select',
    required: false, presentable: true, unique: false,
    options: { maxSelect: 1, values: ['seco', 'frio', 'congelado'] },
  }));
  dao.saveCollection(collection);

  dao.findRecordsByFilter('cotizaciones', "categoria = ''", '', 500, 0).forEach((c) => {
    c.set('categoria', 'seco');
    dao.saveRecord(c);
  });
  return null;
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('cotizaciones01');
  collection.schema.removeField('cot0categoria1');
  return dao.saveCollection(collection);
})
```

## Carga de datos

Hoy `CotizadorPage.tsx` pide al servidor solo `categoria = 'seco'` y guarda el resultado en un estado llamado `filasSeco`. Pasa a pedir **todas** las filas sin filtro de categoría (mismo patrón que ya usa `CuadroTarifarioPage.tsx`) y se renombra el estado a `filas` (todas las categorías). Se filtra en el cliente por la categoría elegida:

```ts
const filasCategoria = filas.filter((f) => f.categoria === categoria);
```

Evita un viaje al servidor si el usuario cambia de categoría antes de guardar.

## Cálculo de precio

Nueva función en `cotizadorMotor.ts`, separada de `calcularItem` (que queda intacta para Seco):

```ts
// Frio/Congelado: banda por Kg nada mas (esas tablas no tienen columna de
// zona ni de m3) -- el total es el valor fijo de la banda, directo.
export function calcularItemFrioCongelado(filas: CuadroTarifarioFila[], kilos: number): ItemCalculado | null {
  if (kilos <= 0) return null;
  const fila = bandaPorLimiteSuperior(filas, kilos, (f) => f.rango_kg_hasta);
  if (!fila || fila.valor == null) return null;
  return { precio: fila.valor, total: fila.valor, porUnidad: false };
}
```

En `CotizadorPage.tsx`, el cálculo de cada ítem se bifurca según la categoría elegida:

```ts
const itemsCalculados = itemsParseados.map((p) => {
  if (categoria === 'seco') {
    const clave = claveZona(traficoOrigen, traficoDestino);
    return clave ? calcularItem(filasCategoria, p.kilos, p.m3, clave) : null;
  }
  return calcularItemFrioCongelado(filasCategoria, p.kilos);
});
```

El mínimo por sucursal (`minimoDeSucursal`) no cambia — se sigue aplicando igual sin importar la categoría, usando `sucursalQuePaga` como hoy.

## UI

- Selector de categoría: mismos botones Seco/Frío/Congelado que ya existen en `CuadroTarifarioPage.tsx` (se extrae la constante `CATEGORIAS` a un archivo compartido, p.ej. `web/src/lib/categoriasTarifario.ts`, para no duplicarla). Se muestra junto a Origen/Destino/Paga en, y se bloquea una vez guardada la cotización (`disabled={!!ultimoCreado}` — mismo criterio que ya usan esos 3 campos).
- Tabla de ítems: la columna "Metros Cúbicos" (input y header) se oculta cuando `categoria !== 'seco'`.
- Impresión (`CotizacionImprimirPage.tsx`): se agrega "Categoría: Seco/Frío/Congelado" en el bloque de encabezado, al lado de "Cotización: N°".

## Fuera de alcance

- No se agregan mínimos distintos por categoría (confirmado: es el mismo mínimo para las 3).
- No se permite mezclar categorías dentro de una misma cotización.
- La numeración correlativa (prefijo por sucursal del usuario, `pb_hooks/cotizaciones.pb.js`) no cambia — sigue sin relación con la categoría.

## Testing

- Build (`npm run build`) para confirmar tipos.
- Prueba manual: crear una cotización Frío y otra Congelado, confirmar que el precio sale de la banda de Kg correcta, que no se puede cargar m³, que el mínimo por sucursal sigue funcionando si el subtotal queda por debajo del piso, y que la impresión muestra la categoría correcta.
- Confirmar que una cotización Seco existente (de antes de esta feature) sigue abriendo e imprimiendo bien después de la migración (categoria backfillenada a 'seco').
