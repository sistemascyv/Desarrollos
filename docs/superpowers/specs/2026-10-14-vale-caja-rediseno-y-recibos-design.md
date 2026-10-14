# Vale de Caja: rediseño fiel al papel real + módulo nuevo de Recibos — diseño

## Contexto

Se mezclaron dos conceptos distintos bajo "Vale de Caja":

1. **Vales de viaje** para choferes (plata que la empresa adelanta a un
   chofer) — siempre en pesos, con un talonario de papel real ya en uso
   (ver foto de referencia: "VALE DE CAJA", logo, N° 00175656, campos "A
   favor de", "Por $", "CONCEPTO: Por gastos de camión a ___", dos firmas
   en blanco "Firma" / "Firma Autorizada"). El Vale de Caja digital actual
   no se parece a este papel — tiene "Recibí de Carossio Vairolatti y Cía
   SRL", el monto en letras, y una sola firma con nombre impreso — nada de
   eso existe en el papel real.
2. **Recibos** que arma Tesorería cuando la empresa **recibe** plata de un
   tercero (ej: venta de un camión) — needs un "Recibí de [nombre
   editable]" en vez del nombre fijo de la empresa, y puede ser en pesos o
   dólares.

Se agregó dólares (y ya existían reales) al Vale de Caja por error de
alcance — eso en realidad correspondía al caso de Recibos. Este documento
corrige eso: separa los dos conceptos en dos módulos.

## Parte 1: Vale de Caja — volver a ser solo para choferes, en pesos

### Moneda

El formulario de carga **deja de mostrar el selector de moneda** — todo
vale nuevo se crea en ARS. El campo `moneda` en el schema de
`vales_caja` se queda con los 3 valores (`ARS`, `BRL`, `USD`) para no
romper los vales viejos que ya existen en reales/dólares en el
historial — solo se saca la posibilidad de *elegir* otra moneda al cargar
uno nuevo.

### Impreso: rediseño fiel al talonario de papel

Referencia exacta (foto provista por el usuario): logo de la empresa
("CAROSSIO, VAIROLATTI & CIA SRL", con el isotipo de flechas en círculo —
ya existe como `logo.jpg` en la raíz del repo, mismo diseño y colores que
el papel) + "transporte" + dirección "SAN LORENZO 31, 2400 SAN FRANCISCO
(Cba.)", arriba a la derecha el N° del vale y la fecha en 3 casilleros
(DÍA / MES / AÑO), título "VALE DE CAJA" grande y subrayado, luego:

```
A favor de .......................... [nombre del chofer]
Por $ ................................ [importe]
CONCEPTO: ............................. [texto libre]

.......................   .......................
      Firma                  Firma Autorizada
```

Cambios respecto al impreso actual:

- **Se saca la marca de agua de fondo** (`vale-marca-agua.png` deja de
  usarse en este impreso) — el papel real no la tiene, solo el logo
  arriba. El archivo no se borra del repo (podría reutilizarse en algo
  más), solo se deja de referenciar acá.
- **Se agrega el logo real** (`logo.jpg`) en el encabezado, con el texto
  "transporte" y la dirección al lado, reproduciendo el membrete del
  papel.
- **Fecha en 3 casilleros** (DÍA/MES/AÑO) en vez de una fecha corrida —
  se arma en el frontend separando `fechaSola(paraImprimir.fecha)`
  (formato `DD/MM/YYYY`) en sus 3 partes, no hace falta ningún campo
  nuevo en la base.
- **"A favor de"**: se completa solo con el nombre del chofer ya elegido
  en el formulario (`paraImprimir.expand.chofer.nombre`) — no es un campo
  nuevo, ni editable aparte.
- **"Por $ [importe]"**: reemplaza a "Recibí de Carossio Vairolatti y Cía
  SRL" + "la cantidad de pesos argentinos [importe en letras]". **Ya no
  se imprime el monto en letras** — el papel real no lo tiene. La función
  `importeEnLetras` deja de usarse en Vale de Caja (puede seguir
  existiendo en `lib/numeroEnLetras.ts` por si se necesita en otro lado).
- **"CONCEPTO: [texto libre]"**: reemplaza las dos líneas de observación
  (`observacion1`/`observacion2`) por un solo renglón de texto libre —
  mapea al campo `observacion1` ya existente (se renombra solo la
  *etiqueta* visible a "Concepto", con placeholder tipo "ej: Gastos de
  viaje a Uruguay"; el nombre del campo en la base se deja igual,
  `observacion1`, para no tocar el schema). **El campo `observacion2` deja
  de pedirse en el formulario de carga** para vales nuevos (los vales
  viejos que ya tengan algo cargado ahí no se tocan, simplemente no se
  muestra más en el impreso ni en el formulario).
- **Dos líneas de firma en blanco**, lado a lado, etiquetadas "Firma" y
  "Firma Autorizada" — **sin ningún nombre impreso debajo de ninguna de
  las dos**, igual que el papel.
- **Se saca el campo "nombre de quien firma" del formulario** (`nombre_firma`)
  — ya no se pide ni se completa al cargar un vale nuevo. En el schema,
  el campo pasa de `required: true` a `required: false` (los vales
  nuevos lo guardan vacío; no se borra el dato de los vales viejos). No
  aparecía en ningún otro lado de la UI (ni en el historial), así que
  sacarlo del formulario no afecta nada más.
- **Letra más grande**: `font-size` del impreso sube de `13px` a `17px`
  (clase `body.imprimiendo-vale #vale-imprimible` en `index.css`).

## Parte 2: Recibos (módulo nuevo)

### Modelo de datos

Nueva colección `recibos`, independiente de `vales_caja` (sin relación a
`choferes`, numeración propia arrancando en 1):

- `numero` (number, autoincremental por hook — mismo patrón que
  `vales_caja.numero`, `required: false` para no chocar con el orden de
  validación de PocketBase, `unique: true` como backstop)
- `fecha` (date)
- `recibido_de` (text, requerido) — precargado con "Carossio Vairolatti y
  Cía SRL" al abrir el formulario, pero completamente editable (para el
  caso real: "a veces nos pagan un camión y ponemos recibí de Pepito en
  lugar de Carossio Vairolatti").
- `importe` (number)
- `moneda` (select: `ARS`, `USD` — sin reales, a diferencia de Vale de
  Caja)
- `concepto` (text, libre — mismo uso que el "Concepto" de Vale de Caja)
- `creado_por` (text, server-side desde el usuario autenticado)

Reglas de acceso: mismo criterio que `vales_caja`
(`@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "recibos")`)
pero con el módulo `recibos` **separado** de `vale_caja` (permiso nuevo e
independiente, confirmado con el usuario). `updateRule: null` (solo se
crea vía hook, igual que vales_caja). `deleteRule`: `rol = "admin"`.

No hay concepto de "usado"/consumido por una rendición — un recibo no se
gasta, es solo un registro de algo que la empresa recibió. No hace falta
nada parecido a `/usar`/`/liberar`.

### Hook (`pb_hooks/recibos.pb.js`, nuevo archivo)

`onRecordBeforeCreateRequest` para la numeración correlativa y
`creado_por` — mismo patrón exacto que `pb_hooks/vales_caja.pb.js` (filtro
`"numero >= 0"` no vacío, `-numero` para tomar el último, sin funciones
compartidas top-level, todo autocontenido en el callback).

### Frontend (`web/src/pages/tesoreria/RecibosPage.tsx`, nuevo archivo)

Misma estructura que `ValeCajaPage.tsx` (formulario de carga + historial
+ impresión), con las diferencias:

- Sin selector de chofer.
- Campo "Recibí de" (texto, editable, precargado con "Carossio
  Vairolatti y Cía SRL").
- Selector de moneda con solo 2 opciones (Pesos Argentinos / Dólares).
- Campo "Concepto" (texto libre, reemplaza observacion1/observacion2 —
  acá se arranca limpio, sin el peso de compatibilidad hacia atrás que sí
  tiene Vale de Caja).
- Impreso con el mismo membrete (logo, "transporte", dirección, N°,
  fecha en 3 casilleros, letra grande, sin marca de agua) pero:
  ```
  Recibí de .......................... [editable, precargado]
  Por $ ................................ [importe]
  CONCEPTO: ............................. [texto libre]

  .......................   .......................
        Firma                  Firma Autorizada
  ```

Registro del módulo: `web/src/types.ts` (`{ id: 'recibos', label:
'Recibos', group: 'TESORERIA', path: 'finanzas/recibos' }`) y la ruta
correspondiente en `App.tsx`, mismo patrón que `vale_caja`.

## Fuera de alcance

- No se migra la numeración del talonario de papel (175656 en adelante)
  al sistema — confirmado con el usuario, quedan como dos numeraciones
  independientes.
- No se imprime ningún nombre debajo de las firmas, en ninguno de los dos
  módulos — confirmado con el usuario.
- No se toca `vale-marca-agua.png` como archivo (se deja de referenciar
  desde el CSS de impresión, pero no se borra).

## Testing

Mismo criterio de siempre: antes de dar por terminado, aplicar las
migraciones contra una PocketBase local real (ya se usó este mismo
mecanismo para probar la migración de USD en Vale de Caja) y confirmar
que el hook de numeración de `recibos` funciona igual que el de
`vales_caja` (correlativo, sin duplicados, `creado_por` completado
server-side). Para el impreso, verificar visualmente en el navegador
(no hay forma automatizada de comparar un PDF/impreso contra la foto de
referencia) que el layout se parece razonablemente al papel real.
