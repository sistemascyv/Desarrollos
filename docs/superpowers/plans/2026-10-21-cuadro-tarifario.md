# Cuadro Tarifario Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traer el cuadro tarifario de fletes (Seco, Frío, Congelado) a Sistema
CyV como una copia propia e independiente, de solo lectura salvo por un
control de "% de actualización" (admin-only) que recalcula todos los valores.

**Architecture:** Colección nueva `cuadro_tarifario` en PocketBase (una fila
por rango de peso/categoría), un endpoint custom admin-only que recalcula
todos los valores por %, y una página nueva de solo-lectura (más el control de
% para admin) gateada por un módulo de permiso nuevo e independiente
(id interno `cuadro_tarifario`, label "Tarifas").

**Tech Stack:** PocketBase (Go hooks JS/goja), React + TypeScript, Vite.

## Global Constraints

- El orden de las 10 columnas de zona de Seco es fijo y NO alfabético:
  `CC, CS, CR, CB, RR, RS, RB, SS, SB, BB` (igual que el sistema de terceros).
- Zonas: C=Córdoba, S=San Francisco, R=Rosario, B=Buenos Aires — se muestran
  las siglas tal cual, sin nombre completo.
- El % se aplica siempre a las 3 categorías juntas, nunca por separado.
- Sin historial de cada % aplicado, sin edición celda por celda, sin
  herramienta de importar reutilizable — todo esto fue decidido explícitamente
  fuera de alcance (ver spec).
- Redondeo a 2 decimales en todo cálculo de %.
- Spec completo: `docs/superpowers/specs/2026-10-21-cuadro-tarifario-design.md`.

---

### Task 1: Colección `cuadro_tarifario` + carga inicial + tipos

**Files:**
- Create: `pb_migrations/1789230000_created_cuadro_tarifario.js`
- Modify: `web/src/types.ts` (agregar interfaz `CuadroTarifarioFila` y entrada
  en `MODULES`)

**Interfaces:**
- Produces: colección PocketBase `cuadro_tarifario` con id
  `cuadrotarifa01`, campos `categoria` (select: `seco`/`frio`/`congelado`),
  `rango_kg_desde`/`rango_kg_hasta` (number), `rango_m3_desde`/
  `rango_m3_hasta` (number, opcionales), `valores` (json, opcional, solo
  `seco`), `valor` (number, opcional, solo `frio`/`congelado`). 85 filas
  seedeadas (33 `seco`, 26 `frio`, 26 `congelado`).
- Produces: interfaz TS `CuadroTarifarioFila` en `types.ts`:
  ```ts
  export interface CuadroTarifarioFila extends BaseRecord {
    categoria: 'seco' | 'frio' | 'congelado';
    rango_kg_desde: number;
    rango_kg_hasta: number;
    rango_m3_desde?: number;
    rango_m3_hasta?: number;
    valores?: Record<string, number>; // solo seco: CC,CS,CR,CB,RR,RS,RB,SS,SB,BB
    valor?: number; // solo frio/congelado
  }
  ```
- Produces: entrada en `MODULES` (`types.ts`): `{ id: 'cuadro_tarifario',
  label: 'Tarifas', group: 'COMERCIAL', path: 'comercial/tarifas' }`. El id
  interno NO es `tarifas` a secas: `"tarifas"` es substring literal de
  `"bot_tarifas"`, y como `modulos` es un campo `json` sus reglas de permiso
  usan `~` (substring), así que un id `tarifas` quedaría matcheado también
  por cualquiera con el módulo `bot_tarifas` (encontrado en la revisión de
  esta misma Task 1). El label visible sigue siendo "Tarifas".
- Consumes: ninguna (primer task del plan).

- [ ] **Step 1: Crear la migración con schema + seed completo**

Archivo completo `pb_migrations/1789230000_created_cuadro_tarifario.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
// Cuadro tarifario de fletes (Seco/Frío/Congelado) -- copia propia e
// independiente del sistema de ventas de terceros, para consulta rápida y
// como base de un futuro cotizador. Se actualiza solo por % (ver
// pb_hooks/cuadro_tarifario.pb.js), nunca celda por celda -- por eso la
// carga inicial de valores reales va acá, a mano, verificada contra el
// Excel/texto que pasó el usuario (mismo criterio que el backfill de
// fechas de CINTIA).
migrate((db) => {
  const collection = new Collection({
    "id": "cuadrotarifa01",
    "name": "cuadro_tarifario",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false, "id": "ctf0categoria1", "name": "categoria", "type": "select",
        "required": true, "presentable": true, "unique": false,
        "options": { "maxSelect": 1, "values": ["seco", "frio", "congelado"] },
      },
      {
        "system": false, "id": "ctf0kgdesde001", "name": "rango_kg_desde", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": true },
      },
      {
        "system": false, "id": "ctf0kghasta001", "name": "rango_kg_hasta", "type": "number",
        "required": true, "presentable": true, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": true },
      },
      {
        "system": false, "id": "ctf0m3desde001", "name": "rango_m3_desde", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        "system": false, "id": "ctf0m3hasta001", "name": "rango_m3_hasta", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
      {
        // solo categoria="seco": {"CC":N,"CS":N,"CR":N,"CB":N,"RR":N,"RS":N,"RB":N,"SS":N,"SB":N,"BB":N}
        "system": false, "id": "ctf0valores001", "name": "valores", "type": "json",
        "required": false, "presentable": false, "unique": false, "options": { "maxSize": 5000 },
      },
      {
        // solo categoria="frio"/"congelado": un unico precio por rango
        "system": false, "id": "ctf0valor00001", "name": "valor", "type": "number",
        "required": false, "presentable": false, "unique": false,
        "options": { "min": 0, "max": null, "noDecimal": false },
      },
    ],
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "viewRule": "@request.auth.id != \"\" && (@request.auth.rol = \"admin\" || @request.auth.modulos ~ \"cuadro_tarifario\")",
    "createRule": null,
    "updateRule": null,
    "deleteRule": "@request.auth.rol = \"admin\"",
    "options": {},
  });
  const dao = new Dao(db);
  dao.saveCollection(collection);

  const seco = [
    {"rango_kg_desde": 0, "rango_kg_hasta": 30, "rango_m3_desde": 0.0, "rango_m3_hasta": 0.1, "valores": {"CC": 13264.34, "CS": 13264.34, "CR": 16580.42, "CB": 16580.42, "RR": 16580.42, "RS": 16580.42, "RB": 16580.42, "SS": 13264.34, "SB": 16580.42, "BB": 16580.42}},
    {"rango_kg_desde": 31, "rango_kg_hasta": 40, "rango_m3_desde": 0.101, "rango_m3_hasta": 0.133, "valores": {"CC": 18372.47, "CS": 18372.47, "CR": 22965.59, "CB": 22965.59, "RR": 22965.59, "RS": 22965.59, "RB": 22965.59, "SS": 18372.47, "SB": 22965.59, "BB": 22965.59}},
    {"rango_kg_desde": 41, "rango_kg_hasta": 50, "rango_m3_desde": 0.134, "rango_m3_hasta": 0.166, "valores": {"CC": 21290.66, "CS": 21290.66, "CR": 26613.33, "CB": 26613.33, "RR": 26613.33, "RS": 26613.33, "RB": 26613.33, "SS": 21290.66, "SB": 26613.33, "BB": 26613.33}},
    {"rango_kg_desde": 51, "rango_kg_hasta": 60, "rango_m3_desde": 0.167, "rango_m3_hasta": 0.2, "valores": {"CC": 25910.52, "CS": 25910.52, "CR": 32388.15, "CB": 32388.15, "RR": 32388.15, "RS": 32388.15, "RB": 32388.15, "SS": 25910.52, "SB": 32388.15, "BB": 32388.15}},
    {"rango_kg_desde": 61, "rango_kg_hasta": 70, "rango_m3_desde": 0.201, "rango_m3_hasta": 0.233, "valores": {"CC": 27414.11, "CS": 27414.11, "CR": 34267.64, "CB": 34267.64, "RR": 34267.64, "RS": 34267.64, "RB": 34267.64, "SS": 27414.11, "SB": 34267.64, "BB": 34267.64}},
    {"rango_kg_desde": 71, "rango_kg_hasta": 80, "rango_m3_desde": 0.234, "rango_m3_hasta": 0.266, "valores": {"CC": 29359.64, "CS": 29359.64, "CR": 36699.55, "CB": 36699.55, "RR": 36699.55, "RS": 36699.55, "RB": 36699.55, "SS": 29359.64, "SB": 36699.55, "BB": 36699.55}},
    {"rango_kg_desde": 81, "rango_kg_hasta": 90, "rango_m3_desde": 0.267, "rango_m3_hasta": 0.3, "valores": {"CC": 32387.84, "CS": 32387.84, "CR": 40484.8, "CB": 40484.8, "RR": 40484.8, "RS": 40484.8, "RB": 40484.8, "SS": 32387.84, "SB": 40484.8, "BB": 40484.8}},
    {"rango_kg_desde": 91, "rango_kg_hasta": 100, "rango_m3_desde": 0.301, "rango_m3_hasta": 0.333, "valores": {"CC": 34841.38, "CS": 34841.38, "CR": 43551.72, "CB": 43551.72, "RR": 43551.72, "RS": 43551.72, "RB": 43551.72, "SS": 34841.38, "SB": 43551.72, "BB": 43551.72}},
    {"rango_kg_desde": 101, "rango_kg_hasta": 150, "rango_m3_desde": 0.334, "rango_m3_hasta": 0.5, "valores": {"CC": 44767.97, "CS": 44767.97, "CR": 55959.96, "CB": 55959.96, "RR": 55959.96, "RS": 55959.96, "RB": 55959.96, "SS": 44767.97, "SB": 55959.96, "BB": 55959.96}},
    {"rango_kg_desde": 151, "rango_kg_hasta": 200, "rango_m3_desde": 0.501, "rango_m3_hasta": 0.666, "valores": {"CC": 52260.88, "CS": 52260.88, "CR": 65326.1, "CB": 65326.1, "RR": 65326.1, "RS": 65326.1, "RB": 65326.1, "SS": 52260.88, "SB": 65326.1, "BB": 65326.1}},
    {"rango_kg_desde": 201, "rango_kg_hasta": 250, "rango_m3_desde": 0.667, "rango_m3_hasta": 0.833, "valores": {"CC": 56415.3, "CS": 56415.3, "CR": 70519.13, "CB": 70519.13, "RR": 70519.13, "RS": 70519.13, "RB": 70519.13, "SS": 56415.3, "SB": 70519.13, "BB": 70519.13}},
    {"rango_kg_desde": 251, "rango_kg_hasta": 300, "rango_m3_desde": 0.834, "rango_m3_hasta": 1.0, "valores": {"CC": 65790.87, "CS": 65790.87, "CR": 82238.59, "CB": 82238.59, "RR": 82238.59, "RS": 82238.59, "RB": 82238.59, "SS": 65790.87, "SB": 82238.59, "BB": 82238.59}},
    {"rango_kg_desde": 301, "rango_kg_hasta": 350, "rango_m3_desde": 1.001, "rango_m3_hasta": 1.166, "valores": {"CC": 69354.03, "CS": 69354.03, "CR": 86692.54, "CB": 86692.54, "RR": 86692.54, "RS": 86692.54, "RB": 86692.54, "SS": 69354.03, "SB": 86692.54, "BB": 86692.54}},
    {"rango_kg_desde": 351, "rango_kg_hasta": 400, "rango_m3_desde": 1.167, "rango_m3_hasta": 1.333, "valores": {"CC": 72917.04, "CS": 72917.04, "CR": 91146.3, "CB": 91146.3, "RR": 91146.3, "RS": 91146.3, "RB": 91146.3, "SS": 72917.04, "SB": 91146.3, "BB": 91146.3}},
    {"rango_kg_desde": 401, "rango_kg_hasta": 450, "rango_m3_desde": 1.334, "rango_m3_hasta": 1.5, "valores": {"CC": 76480.46, "CS": 76480.46, "CR": 95600.57, "CB": 95600.57, "RR": 95600.57, "RS": 95600.57, "RB": 95600.57, "SS": 76480.46, "SB": 95600.57, "BB": 95600.57}},
    {"rango_kg_desde": 451, "rango_kg_hasta": 500, "rango_m3_desde": 1.501, "rango_m3_hasta": 1.666, "valores": {"CC": 80042.82, "CS": 80042.82, "CR": 100053.53, "CB": 100053.53, "RR": 100053.53, "RS": 100053.53, "RB": 100053.53, "SS": 80042.82, "SB": 100053.53, "BB": 100053.53}},
    {"rango_kg_desde": 501, "rango_kg_hasta": 550, "rango_m3_desde": 1.667, "rango_m3_hasta": 1.833, "valores": {"CC": 83606.27, "CS": 83606.27, "CR": 104507.84, "CB": 104507.84, "RR": 104507.84, "RS": 104507.84, "RB": 104507.84, "SS": 83606.27, "SB": 104507.84, "BB": 104507.84}},
    {"rango_kg_desde": 551, "rango_kg_hasta": 600, "rango_m3_desde": 1.834, "rango_m3_hasta": 2.0, "valores": {"CC": 87169.63, "CS": 87169.63, "CR": 108962.04, "CB": 108962.04, "RR": 108962.04, "RS": 108962.04, "RB": 108962.04, "SS": 87169.63, "SB": 108962.04, "BB": 108962.04}},
    {"rango_kg_desde": 601, "rango_kg_hasta": 650, "rango_m3_desde": 2.001, "rango_m3_hasta": 2.166, "valores": {"CC": 90732.59, "CS": 90732.59, "CR": 113415.74, "CB": 113415.74, "RR": 113415.74, "RS": 113415.74, "RB": 113415.74, "SS": 90732.59, "SB": 113415.74, "BB": 113415.74}},
    {"rango_kg_desde": 651, "rango_kg_hasta": 700, "rango_m3_desde": 2.167, "rango_m3_hasta": 2.333, "valores": {"CC": 94296.41, "CS": 94296.41, "CR": 117870.51, "CB": 117870.51, "RR": 117870.51, "RS": 117870.51, "RB": 117870.51, "SS": 94296.41, "SB": 117870.51, "BB": 117870.51}},
    {"rango_kg_desde": 701, "rango_kg_hasta": 750, "rango_m3_desde": 2.334, "rango_m3_hasta": 2.5, "valores": {"CC": 97860.21, "CS": 97860.21, "CR": 122325.26, "CB": 122325.26, "RR": 122325.26, "RS": 122325.26, "RB": 122325.26, "SS": 97860.21, "SB": 122325.26, "BB": 122325.26}},
    {"rango_kg_desde": 751, "rango_kg_hasta": 800, "rango_m3_desde": 2.501, "rango_m3_hasta": 2.666, "valores": {"CC": 101422.8, "CS": 101422.8, "CR": 126778.5, "CB": 126778.5, "RR": 126778.5, "RS": 126778.5, "RB": 126778.5, "SS": 101422.8, "SB": 126778.5, "BB": 126778.5}},
    {"rango_kg_desde": 801, "rango_kg_hasta": 850, "rango_m3_desde": 2.667, "rango_m3_hasta": 2.833, "valores": {"CC": 104985.22, "CS": 104985.22, "CR": 131231.53, "CB": 131231.53, "RR": 131231.53, "RS": 131231.53, "RB": 131231.53, "SS": 104985.22, "SB": 131231.53, "BB": 131231.53}},
    {"rango_kg_desde": 851, "rango_kg_hasta": 900, "rango_m3_desde": 2.834, "rango_m3_hasta": 3.0, "valores": {"CC": 108549.32, "CS": 108549.32, "CR": 135686.65, "CB": 135686.65, "RR": 135686.65, "RS": 135686.65, "RB": 135686.65, "SS": 108549.32, "SB": 135686.65, "BB": 135686.65}},
    {"rango_kg_desde": 901, "rango_kg_hasta": 950, "rango_m3_desde": 3.001, "rango_m3_hasta": 3.166, "valores": {"CC": 112111.74, "CS": 112111.74, "CR": 140139.67, "CB": 140139.67, "RR": 140139.67, "RS": 140139.67, "RB": 140139.67, "SS": 112111.74, "SB": 140139.67, "BB": 140139.67}},
    {"rango_kg_desde": 951, "rango_kg_hasta": 1100, "rango_m3_desde": 3.167, "rango_m3_hasta": 3.666, "valores": {"CC": 115675.39, "CS": 115675.39, "CR": 144594.24, "CB": 144594.24, "RR": 144594.24, "RS": 144594.24, "RB": 144594.24, "SS": 115675.39, "SB": 144594.24, "BB": 144594.24}},
    {"rango_kg_desde": 1101, "rango_kg_hasta": 1400, "rango_m3_desde": 3.667, "rango_m3_hasta": 4.667, "valores": {"CC": 112.18, "CS": 112.18, "CR": 140.23, "CB": 140.23, "RR": 140.23, "RS": 140.23, "RB": 140.23, "SS": 112.18, "SB": 140.23, "BB": 140.23}},
    {"rango_kg_desde": 1401, "rango_kg_hasta": 2000, "rango_m3_desde": 4.668, "rango_m3_hasta": 6.667, "valores": {"CC": 103.18, "CS": 103.18, "CR": 128.98, "CB": 128.98, "RR": 128.98, "RS": 128.98, "RB": 128.98, "SS": 103.18, "SB": 128.98, "BB": 128.98}},
    {"rango_kg_desde": 2001, "rango_kg_hasta": 3500, "rango_m3_desde": 6.668, "rango_m3_hasta": 11.667, "valores": {"CC": 95.01, "CS": 95.01, "CR": 118.76, "CB": 118.76, "RR": 118.76, "RS": 118.76, "RB": 118.76, "SS": 95.01, "SB": 118.76, "BB": 118.76}},
    {"rango_kg_desde": 3501, "rango_kg_hasta": 5000, "rango_m3_desde": 11.668, "rango_m3_hasta": 16.667, "valores": {"CC": 88.5, "CS": 88.5, "CR": 110.62, "CB": 110.62, "RR": 110.62, "RS": 110.62, "RB": 110.62, "SS": 88.5, "SB": 110.62, "BB": 110.62}},
    {"rango_kg_desde": 5001, "rango_kg_hasta": 7000, "rango_m3_desde": 16.668, "rango_m3_hasta": 23.333, "valores": {"CC": 81.46, "CS": 81.46, "CR": 101.83, "CB": 101.83, "RR": 101.83, "RS": 101.83, "RB": 101.83, "SS": 81.46, "SB": 101.83, "BB": 101.83}},
    {"rango_kg_desde": 7001, "rango_kg_hasta": 10000, "rango_m3_desde": 23.334, "rango_m3_hasta": 33.333, "valores": {"CC": 73.67, "CS": 73.67, "CR": 92.09, "CB": 92.09, "RR": 92.09, "RS": 92.09, "RB": 92.09, "SS": 73.67, "SB": 92.09, "BB": 92.09}},
    {"rango_kg_desde": 10001, "rango_kg_hasta": 13000, "rango_m3_desde": 33.334, "rango_m3_hasta": 43.333, "valores": {"CC": 70.34, "CS": 70.34, "CR": 87.93, "CB": 87.93, "RR": 87.93, "RS": 87.93, "RB": 87.93, "SS": 70.34, "SB": 87.93, "BB": 87.93}},
  ];

  const frio = [
    {"rango_kg_desde": 0, "rango_kg_hasta": 30, "valor": 22837.76}, {"rango_kg_desde": 31, "rango_kg_hasta": 40, "valor": 31632.66},
    {"rango_kg_desde": 41, "rango_kg_hasta": 50, "valor": 36657.04}, {"rango_kg_desde": 51, "rango_kg_hasta": 60, "valor": 44611.24},
    {"rango_kg_desde": 61, "rango_kg_hasta": 70, "valor": 47200.03}, {"rango_kg_desde": 71, "rango_kg_hasta": 80, "valor": 50549.75},
    {"rango_kg_desde": 81, "rango_kg_hasta": 90, "valor": 55763.5}, {"rango_kg_desde": 91, "rango_kg_hasta": 100, "valor": 59987.87},
    {"rango_kg_desde": 101, "rango_kg_hasta": 150, "valor": 77078.89}, {"rango_kg_desde": 151, "rango_kg_hasta": 200, "valor": 89979.78},
    {"rango_kg_desde": 201, "rango_kg_hasta": 250, "valor": 97132.61}, {"rango_kg_desde": 251, "rango_kg_hasta": 300, "valor": 113274.9},
    {"rango_kg_desde": 301, "rango_kg_hasta": 350, "valor": 119409.74}, {"rango_kg_desde": 351, "rango_kg_hasta": 400, "valor": 125544.32},
    {"rango_kg_desde": 401, "rango_kg_hasta": 450, "valor": 131679.6}, {"rango_kg_desde": 451, "rango_kg_hasta": 500, "valor": 137813.1},
    {"rango_kg_desde": 501, "rango_kg_hasta": 550, "valor": 143948.43}, {"rango_kg_desde": 551, "rango_kg_hasta": 600, "valor": 150083.61},
    {"rango_kg_desde": 601, "rango_kg_hasta": 650, "valor": 156218.11}, {"rango_kg_desde": 651, "rango_kg_hasta": 700, "valor": 162354.1},
    {"rango_kg_desde": 701, "rango_kg_hasta": 750, "valor": 168490.05}, {"rango_kg_desde": 751, "rango_kg_hasta": 800, "valor": 174623.92},
    {"rango_kg_desde": 801, "rango_kg_hasta": 850, "valor": 180757.47}, {"rango_kg_desde": 851, "rango_kg_hasta": 900, "valor": 186893.95},
    {"rango_kg_desde": 901, "rango_kg_hasta": 950, "valor": 193027.5}, {"rango_kg_desde": 951, "rango_kg_hasta": 1000, "valor": 199163.19},
  ];

  const congelado = [
    {"rango_kg_desde": 0, "rango_kg_hasta": 30, "valor": 31139.06}, {"rango_kg_desde": 31, "rango_kg_hasta": 40, "valor": 43130.82},
    {"rango_kg_desde": 41, "rango_kg_hasta": 50, "valor": 49981.5}, {"rango_kg_desde": 51, "rango_kg_hasta": 60, "valor": 60826.98},
    {"rango_kg_desde": 61, "rango_kg_hasta": 70, "valor": 64356.77}, {"rango_kg_desde": 71, "rango_kg_hasta": 80, "valor": 68924.07},
    {"rango_kg_desde": 81, "rango_kg_hasta": 90, "valor": 76032.98}, {"rango_kg_desde": 91, "rango_kg_hasta": 100, "valor": 81792.86},
    {"rango_kg_desde": 101, "rango_kg_hasta": 150, "valor": 105096.29}, {"rango_kg_desde": 151, "rango_kg_hasta": 200, "valor": 122686.53},
    {"rango_kg_desde": 201, "rango_kg_hasta": 250, "valor": 132439.34}, {"rango_kg_desde": 251, "rango_kg_hasta": 300, "valor": 154449.19},
    {"rango_kg_desde": 301, "rango_kg_hasta": 350, "valor": 162813.98}, {"rango_kg_desde": 351, "rango_kg_hasta": 400, "valor": 171178.42},
    {"rango_kg_desde": 401, "rango_kg_hasta": 450, "valor": 179543.82}, {"rango_kg_desde": 451, "rango_kg_hasta": 500, "valor": 187906.78},
    {"rango_kg_desde": 501, "rango_kg_hasta": 550, "valor": 196272.24}, {"rango_kg_desde": 551, "rango_kg_hasta": 600, "valor": 204637.5},
    {"rango_kg_desde": 601, "rango_kg_hasta": 650, "valor": 213001.82}, {"rango_kg_desde": 651, "rango_kg_hasta": 700, "valor": 221368.19},
    {"rango_kg_desde": 701, "rango_kg_hasta": 750, "valor": 229734.49}, {"rango_kg_desde": 751, "rango_kg_hasta": 800, "valor": 238097.96},
    {"rango_kg_desde": 801, "rango_kg_hasta": 850, "valor": 246460.99}, {"rango_kg_desde": 851, "rango_kg_hasta": 900, "valor": 254828.02},
    {"rango_kg_desde": 901, "rango_kg_hasta": 950, "valor": 263191.05}, {"rango_kg_desde": 951, "rango_kg_hasta": 1000, "valor": 271557.01},
  ];

  seco.forEach((f) => {
    const r = new Record(collection, Object.assign({ categoria: 'seco' }, f));
    dao.saveRecord(r);
  });
  frio.forEach((f) => {
    const r = new Record(collection, Object.assign({ categoria: 'frio' }, f));
    dao.saveRecord(r);
  });
  congelado.forEach((f) => {
    const r = new Record(collection, Object.assign({ categoria: 'congelado' }, f));
    dao.saveRecord(r);
  });

  return null;
}, (db) => {
  const dao = new Dao(db);
  return dao.deleteCollection(dao.findCollectionByNameOrId("cuadrotarifa01"));
})
```

- [ ] **Step 2: Agregar `CuadroTarifarioFila` y el módulo `tarifas` a `types.ts`**

Ubicar el bloque `export const MODULES: ModuleDef[] = [...]` (cerca de la
línea 296) y agregar una entrada más al final del array, antes del `];`:

```ts
  { id: 'cuadro_tarifario', label: 'Tarifas', group: 'COMERCIAL', path: 'comercial/tarifas' },
```

Agregar la interfaz nueva en cualquier lugar razonable del archivo (junto a
otras interfaces de colecciones, por ejemplo después de `TarifaBotAjuste`):

```ts
export interface CuadroTarifarioFila extends BaseRecord {
  categoria: 'seco' | 'frio' | 'congelado';
  rango_kg_desde: number;
  rango_kg_hasta: number;
  rango_m3_desde?: number;
  rango_m3_hasta?: number;
  valores?: Record<string, number>; // solo seco: CC,CS,CR,CB,RR,RS,RB,SS,SB,BB
  valor?: number; // solo frio/congelado
}
```

- [ ] **Step 3: Probar la migración contra una PocketBase local real**

Descargar (si no está ya) el binario de PocketBase usado en este proyecto
(v0.22.55) en un directorio de scratch, copiar `pb_migrations` y
`pb_hooks`, correr `./pocketbase migrate up`, y verificar directo con
sqlite3:

```bash
sqlite3 pb_data/data.db "SELECT categoria, COUNT(*) FROM cuadro_tarifario GROUP BY categoria;"
```

Esperado: `congelado|26`, `frio|26`, `seco|33`.

```bash
sqlite3 pb_data/data.db "SELECT rango_kg_desde, rango_kg_hasta, valores FROM cuadro_tarifario WHERE categoria='seco' AND rango_kg_desde=0;"
```

Esperado: una fila `0|30|{"CC":13264.34,...,"BB":16580.42}`.

```bash
sqlite3 pb_data/data.db "SELECT rango_kg_desde, rango_kg_hasta, valor FROM cuadro_tarifario WHERE categoria='frio' AND rango_kg_desde=951;"
```

Esperado: `951|1000|199163.19`.

- [ ] **Step 4: Verificar que el build de TypeScript compila**

```bash
cd web && npm run build
```

Esperado: build exitoso, sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add pb_migrations/1789230000_created_cuadro_tarifario.js web/src/types.ts
git commit -m "Cuadro Tarifario: coleccion + carga inicial (Seco/Frio/Congelado) + tipos"
```

---

### Task 2: Endpoint para aplicar porcentaje

**Files:**
- Create: `pb_hooks/cuadro_tarifario.pb.js`

**Interfaces:**
- Consumes: colección `cuadro_tarifario` (Task 1) — campos `categoria`,
  `valores`, `valor`.
- Produces: `POST /api/cuadro-tarifario/aplicar-porcentaje`, body
  `{ porcentaje: number }`, responde `{ ok: true, filas_actualizadas: N }`
  en éxito, 403 si el usuario autenticado no es admin, 400 si el
  porcentaje es inválido.

- [ ] **Step 1: Escribir el endpoint completo**

Archivo completo `pb_hooks/cuadro_tarifario.pb.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
// Cuadro Tarifario: el unico endpoint que puede escribir en
// cuadro_tarifario (la coleccion no tiene createRule/updateRule para
// usuarios normales -- ver pb_migrations/1789230000_created_cuadro_tarifario.js).
// Recalcula TODAS las filas (seco+frio+congelado juntas) aplicando el
// mismo % -- no hay un % independiente por categoria. Sin historial de
// cada aplicacion (decidido explicitamente en el spec).

function redondear2(n) {
  return Math.round(n * 100) / 100;
}

// Un campo "json" leido desde un record puede llegar como objeto ya
// parseado, como texto, o (mismo problema ya visto con auth.get("modulos")
// en otras colecciones de este proyecto) como arreglo de bytes -- se
// normaliza a texto antes de parsear para cubrir los 3 casos.
function leerJson(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  const texto = Array.isArray(raw) ? String.fromCharCode.apply(null, raw) : String(raw);
  return JSON.parse(texto);
}

routerAdd("POST", "/api/cuadro-tarifario/aplicar-porcentaje", (c) => {
  const info = $apis.requestInfo(c);
  const auth = info.authRecord;
  if (!auth || auth.get("rol") !== "admin") {
    throw new ForbiddenError("Solo un administrador puede aplicar el porcentaje.");
  }

  const body = info.data || {};
  const porcentaje = Number(body.porcentaje);
  if (!porcentaje || Number.isNaN(porcentaje) || porcentaje <= 0 || porcentaje > 50) {
    return c.json(400, { message: "Ingresá un porcentaje válido, mayor a 0 y hasta 50." });
  }
  const factor = 1 + porcentaje / 100;

  const dao = $app.dao();
  const coleccion = dao.findCollectionByNameOrId("cuadro_tarifario");
  // Filtro real, no vacio -- un filtro "" rompe findRecordsByFilter en
  // esta version de PocketBase (ya confirmado varias veces en este
  // proyecto).
  const filas = dao.findRecordsByFilter(coleccion.id, "rango_kg_desde >= 0", "", 500, 0);

  filas.forEach((f) => {
    if (f.get("categoria") === "seco") {
      const valores = leerJson(f.get("valores")) || {};
      const nuevos = {};
      Object.keys(valores).forEach((k) => {
        nuevos[k] = redondear2(valores[k] * factor);
      });
      f.set("valores", nuevos);
    } else {
      const valorActual = Number(f.get("valor")) || 0;
      f.set("valor", redondear2(valorActual * factor));
    }
    dao.saveRecord(f);
  });

  return c.json(200, { ok: true, filas_actualizadas: filas.length });
});
```

- [ ] **Step 2: Probar el endpoint contra una PocketBase local real**

Con la misma PocketBase local del Task 1 corriendo (`./pocketbase serve`),
crear un usuario admin de prueba si no existe (`./pocketbase admin create
test@test.com test12345678 --dir pb_data`), loguearse con
`/api/collections/usuarios/auth-with-password` para obtener un token, y
llamar al endpoint:

```bash
curl -X POST http://127.0.0.1:8090/api/cuadro-tarifario/aplicar-porcentaje \
  -H "Authorization: Bearer <token-admin>" \
  -H "Content-Type: application/json" \
  -d '{"porcentaje": 10}'
```

Esperado: `{"ok":true,"filas_actualizadas":85}`.

Verificar con sqlite3 que una fila de `seco` quedó multiplicada por 1.10 y
redondeada a 2 decimales (la fila `rango_kg_desde=0` de `seco` tenía
`CC=13264.34` → debe quedar `14590.77` = `round(13264.34*1.1, 2)`):

```bash
sqlite3 pb_data/data.db "SELECT valores FROM cuadro_tarifario WHERE categoria='seco' AND rango_kg_desde=0;"
```

Esperado: `{"CC":14590.77,...}` (y el resto de las claves también
multiplicadas por 1.10 y redondeadas).

Verificar que una fila de `frio` también cambió (`rango_kg_desde=0` tenía
`valor=22837.76` → debe quedar `25121.54` = `round(22837.76*1.1, 2)`):

```bash
sqlite3 pb_data/data.db "SELECT valor FROM cuadro_tarifario WHERE categoria='frio' AND rango_kg_desde=0;"
```

Esperado: `25121.54`.

Repetir la llamada con un usuario NO admin autenticado (o sin header
`Authorization`) y confirmar que responde 403 y que los valores en la DB
no cambiaron.

Repetir con `{"porcentaje": 500}` y confirmar 400 (fuera del rango
permitido).

- [ ] **Step 3: Commit**

```bash
git add pb_hooks/cuadro_tarifario.pb.js
git commit -m "Cuadro Tarifario: endpoint admin-only para aplicar % a las 3 categorias"
```

---

### Task 3: Pantalla `CuadroTarifarioPage.tsx`

**Files:**
- Create: `web/src/pages/tarifas/CuadroTarifarioPage.tsx`
- Modify: `web/src/App.tsx` (import + ruta nueva)

**Interfaces:**
- Consumes: `CuadroTarifarioFila` (Task 1, `types.ts`), endpoint
  `POST /api/cuadro-tarifario/aplicar-porcentaje` (Task 2), `money()` de
  `web/src/lib/format.ts`, `useAuth()` de `web/src/lib/AuthContext.tsx`
  (para `isAdmin`), `useConfirm()` de `web/src/lib/ConfirmContext.tsx`,
  `useToast()` de `web/src/lib/ToastContext.tsx`, `pb` de `web/src/lib/pb.ts`.
- Produces: ruta `/comercial/tarifas`, gateada con
  `<RequireModule moduleId="cuadro_tarifario">`.

- [ ] **Step 1: Escribir la página completa**

Archivo completo `web/src/pages/tarifas/CuadroTarifarioPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useAuth } from '../../lib/AuthContext';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { money } from '../../lib/format';
import type { CuadroTarifarioFila } from '../../types';

// Orden fijo de las 10 combinaciones de zona -- igual que en el sistema de
// terceros, NO es alfabetico (ver spec). C=Cordoba, S=San Francisco,
// R=Rosario, B=Buenos Aires.
const COLUMNAS_ZONA: { key: string; label: string }[] = [
  { key: 'CC', label: 'C⇄C' }, { key: 'CS', label: 'C⇄S' },
  { key: 'CR', label: 'C⇄R' }, { key: 'CB', label: 'C⇄B' },
  { key: 'RR', label: 'R⇄R' }, { key: 'RS', label: 'R⇄S' },
  { key: 'RB', label: 'R⇄B' }, { key: 'SS', label: 'S⇄S' },
  { key: 'SB', label: 'S⇄B' }, { key: 'BB', label: 'B⇄B' },
];

const CATEGORIAS = [
  { id: 'seco', label: 'Seco' },
  { id: 'frio', label: 'Frío' },
  { id: 'congelado', label: 'Congelado' },
] as const;
type CategoriaId = typeof CATEGORIAS[number]['id'];

export function CuadroTarifarioPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [filas, setFilas] = useState<CuadroTarifarioFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState<CategoriaId>('seco');
  const [porcentaje, setPorcentaje] = useState('');
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    try {
      const items = await pb.collection('cuadro_tarifario').getFullList<CuadroTarifarioFila>({ sort: 'rango_kg_desde' });
      setFilas(items);
    } catch (e) {
      toast('No se pudo cargar el cuadro tarifario: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCargando(false);
    }
  }

  async function aplicarPorcentaje() {
    const limpio = porcentaje.replace(',', '.').trim();
    const valor = Number(limpio);
    if (!limpio || Number.isNaN(valor) || valor <= 0 || valor > 50) {
      toast('Ingresá un porcentaje válido, mayor a 0 y hasta 50.', 'warn');
      return;
    }
    const ok = await confirm(
      `Se va a aplicar un ajuste de +${limpio}% a TODOS los valores de Seco, Frío y Congelado. ¿Confirmar?`,
      'Aplicar porcentaje',
    );
    if (!ok) return;
    setAplicando(true);
    try {
      await pb.send('/api/cuadro-tarifario/aplicar-porcentaje', { method: 'POST', body: { porcentaje: valor } });
      setPorcentaje('');
      await cargar();
      toast('Cuadro tarifario actualizado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setAplicando(false);
    }
  }

  const filasTab = filas.filter((f) => f.categoria === tab);

  return (
    <main>
      <div className="card">
        <h2>Cuadro Tarifario</h2>
        <div className="hint">Valores de referencia propios de Sistema CyV — no modifica el sistema de ventas de terceros.</div>

        {isAdmin && (
          <div className="row" style={{ marginTop: 10 }}>
            <div className="field">
              <label>% de actualización</label>
              <input
                type="text"
                inputMode="decimal"
                value={porcentaje}
                disabled={aplicando}
                onChange={(e) => setPorcentaje(e.target.value)}
                placeholder="ej: 5"
                style={{ width: 100 }}
              />
            </div>
            <button onClick={aplicarPorcentaje} disabled={aplicando}>{aplicando ? 'Aplicando…' : 'Aplicar'}</button>
          </div>
        )}

        <div className="row" style={{ marginTop: 12 }}>
          {CATEGORIAS.map((c) => (
            <button key={c.id} className={tab === c.id ? 'small' : 'small secondary'} onClick={() => setTab(c.id)}>{c.label}</button>
          ))}
        </div>

        <div className="table-wrap" style={{ marginTop: 10, maxHeight: '70vh' }}>
          {tab === 'seco' ? (
            <table>
              <thead>
                <tr>
                  <th>Rango (Kg)</th><th>Rango (m³)</th>
                  {COLUMNAS_ZONA.map((c) => <th key={c.key} className="num">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {filasTab.map((f) => (
                  <tr key={f.id}>
                    <td>{f.rango_kg_desde} a {f.rango_kg_hasta} Kg</td>
                    <td>{f.rango_m3_desde} a {f.rango_m3_hasta} Mts³</td>
                    {COLUMNAS_ZONA.map((c) => <td key={c.key} className="num">{money(f.valores?.[c.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead><tr><th>Desde (Kg)</th><th>Hasta (Kg)</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {filasTab.map((f) => (
                  <tr key={f.id}>
                    <td>{f.rango_kg_desde}</td>
                    <td>{f.rango_kg_hasta}</td>
                    <td className="num">{money(f.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!cargando && filasTab.length === 0 && <div className="empty">Sin datos para esta categoría.</div>}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Agregar la ruta en `App.tsx`**

Agregar el import junto a los demás, después de la línea de
`BotTarifasPage`:

```tsx
import { CuadroTarifarioPage } from './pages/tarifas/CuadroTarifarioPage';
```

Agregar la ruta nueva, justo después del bloque de la ruta
`/comercial/bot-tarifas` (antes del `<Route path="/administracion" ...`):

```tsx
        <Route
          path="/comercial/tarifas"
          element={
            <RequireModule moduleId="cuadro_tarifario">
              <CuadroTarifarioPage />
            </RequireModule>
          }
        />
```

- [ ] **Step 3: Verificar que el build de TypeScript compila**

```bash
cd web && npm run build
```

Esperado: build exitoso, sin errores de tipos.

- [ ] **Step 4: Dar el módulo `tarifas` a un usuario de prueba y verificar en el navegador**

Con el dev server corriendo (`npm run dev` dentro de `web/`) y la
PocketBase local del Task 1/2 ya con el hook de Task 2 copiado, loguearse
como admin, entrar a Administración → Usuarios, tildar el módulo
"Tarifas" en el usuario de prueba, y verificar:
- Como admin: la pantalla `/comercial/tarifas` muestra el control de %,
  las 3 pestañas (Seco con 33 filas y 10 columnas de zona, Frío y
  Congelado con 26 filas cada una), y aplicar un % recalcula y refresca
  la tabla.
- Como el usuario de prueba (no-admin, con el módulo `tarifas` tildado):
  ve las 3 pestañas de solo lectura, sin el control de %.
- Un usuario sin el módulo `tarifas` ni admin es redirigido a `/inicio` al
  entrar a `/comercial/tarifas`.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/tarifas/CuadroTarifarioPage.tsx web/src/App.tsx
git commit -m "Cuadro Tarifario: pantalla con 3 categorias y control de % admin-only"
```

---

### Task 4: Deploy

**Files:** ninguno (solo build + push + verificación en producción).

**Interfaces:**
- Consumes: Tasks 1-3 completos y revisados.

- [ ] **Step 1: Build final**

```bash
cd web && npm run build
```

Anotar el hash del bundle generado (`dist/assets/index-XXXXXXXX.js`).

- [ ] **Step 2: Commit final si quedó algo pendiente, y push**

```bash
git push
```

- [ ] **Step 3: Verificar el deploy en producción**

```bash
until curl -s https://app.carossiovairolatti.com.ar/ | grep -q "index-XXXXXXXX"; do sleep 15; done
```

(reemplazar `index-XXXXXXXX` por el hash real del Step 1). Esperado: el
comando termina solo cuando el nuevo bundle está servido en producción.
