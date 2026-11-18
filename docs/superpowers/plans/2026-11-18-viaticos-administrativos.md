# Viáticos 4.1.12/4.1.13 en Liquidación — Administrativos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar los 2 viáticos que faltan (Comida 4.1.12 + Especial 4.1.13, por día trabajado, exentos de los 6 descuentos) a la Liquidación — Administrativos, corrigiendo un gap real detectado comparando contra recibos de sueldo reales.

**Architecture:** 2 filas nuevas de datos en la colección ya existente `sueldos_tarifas_viaje` (migración nueva, no se toca la anterior que ya está en staging), la función `calcularLiquidacionSueldoMensual` (`motor.ts`) separa la base de descuentos (`brutoSujetoRetencion`) del monto de viáticos (exento), y `LiquidacionAdministrativosSub.tsx` calcula los días trabajados del mes (de los mismos `ResultadoDia` que ya trae) y busca las 2 tarifas.

**Tech Stack:** React 19 + TypeScript + Vite, PocketBase. Sin tests automatizados de frontend.

## Global Constraints

- Los viáticos **NO entran en la base de los 6 descuentos** — se calculan sobre `basico + montoHorasExtra + montoAntiguedad` únicamente (sin cambios respecto a lo ya desplegado), y se suman recién al final.
- `diasTrabajados` = cantidad de `ResultadoDia` del legajo en el mes con `paresEsperados.length > 0 && !ausente` (un día que tenía horario esperado y no fue marcado ausente).
- No se toca `LiquidacionChoferesSub.tsx` ni nada de Fichadas/`procesarPeriodo`. No se agrega "ASIG. EXT." — fuera de alcance.
- Nombres de las 2 tarifas nuevas, exactos (sin tildes, mismo criterio ASCII que ya usan las tarifas existentes de `sueldos_tarifas_viaje`): `"Viaticos 4.1.12 - Comida (por dia trabajado)"` = $17.524,83, `"Viaticos 4.1.13 - Especial (por dia trabajado)"` = $8.793,93.
- Sin tests automatizados de frontend — cada tarea termina con `cd web && npm run build` limpio + verificación manual. La última tarea se verifica contra recibos de sueldo reales que ya tiene el usuario (septiembre y octubre 2026, legajo real "Actis Tobías") si ese legajo y esos meses están cargados en staging — no inventar cifras de ese recibo si no están disponibles en este entorno, dejar la verificación descripta para que la haga quien tenga acceso a staging.

---

### Task 1: Migración — 2 tarifas nuevas en sueldos_tarifas_viaje

**Files:**
- Create: `pb_migrations/1789510000_viaticos_administrativos.js`

**Interfaces:**
- Produces: 2 filas nuevas en `sueldos_tarifas_viaje` (`nombre`, `valor`), consumidas por la Task 3.

- [ ] **Step 1: Escribir la migración**

Crear `pb_migrations/1789510000_viaticos_administrativos.js`:

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Liquidación — Administrativos: faltaban los viáticos 4.1.12 (Comida) y
// 4.1.13 (Especial), por día trabajado, exentos de los 6 descuentos --
// detectado comparando contra recibos de sueldo reales (ver
// docs/superpowers/specs/2026-11-18-viaticos-administrativos-design.md).
// sueldos_tarifas_viaje ya existe (creada en 1789480000, ya desplegada en
// staging) -- esta migración solo agrega 2 filas más, mismo patrón
// idempotente que ya usó esa migración (no duplica si ya existen). Valores
// de la escala vigente desde 1° de noviembre de 2026, misma fuente que el
// resto de Sueldos.
migrate((db) => {
  const dao = new Dao(db);
  const tarifas = dao.findCollectionByNameOrId('sueldos_tarifas_viaje');

  const tarifasNuevas = [
    { nombre: "Viaticos 4.1.12 - Comida (por dia trabajado)", valor: 17524.83 },
    { nombre: "Viaticos 4.1.13 - Especial (por dia trabajado)", valor: 8793.93 },
  ];
  for (const t of tarifasNuevas) {
    let yaExiste = null;
    try { yaExiste = dao.findFirstRecordByFilter(tarifas.id, "nombre = {:nombre}", { nombre: t.nombre }); } catch (e) { /* no existe, seguimos */ }
    if (yaExiste) continue;
    const record = new Record(tarifas, { nombre: t.nombre, valor: t.valor });
    dao.saveRecord(record);
  }

  return null;
}, (db) => {
  const dao = new Dao(db);
  const tarifas = dao.findCollectionByNameOrId('sueldos_tarifas_viaje');

  const nombres = [
    "Viaticos 4.1.12 - Comida (por dia trabajado)",
    "Viaticos 4.1.13 - Especial (por dia trabajado)",
  ];
  for (const nombre of nombres) {
    try {
      const record = dao.findFirstRecordByFilter(tarifas.id, "nombre = {:nombre}", { nombre });
      dao.deleteRecord(record);
    } catch (e) { /* ya no existía */ }
  }

  return null;
})
```

- [ ] **Step 2: Verificar sintaxis**

```bash
node -c pb_migrations/1789510000_viaticos_administrativos.js
```
Expected: sin salida.

- [ ] **Step 3: Levantar una instancia de prueba y correr la migración**

Reusar/crear una instancia de prueba, copiar `pb_migrations/*.js` + `pb_hooks/*.js` actuales, correr:
```bash
./pocketbase.exe migrate up
```
Expected: corre limpio, termina con "Applied 1789510000_viaticos_administrativos.js migration".

- [ ] **Step 4: Verificar los valores con sqlite**

```bash
python3 -c "
import sqlite3
con = sqlite3.connect('pb_data/data.db')
cur = con.cursor()
cur.execute(\"SELECT nombre, valor FROM sueldos_tarifas_viaje WHERE nombre LIKE 'Viaticos 4.1%'\")
for row in cur.fetchall(): print(row)
"
```
Expected:
```
('Viaticos 4.1.12 - Comida (por dia trabajado)', 17524.83)
('Viaticos 4.1.13 - Especial (por dia trabajado)', 8793.93)
```

- [ ] **Step 5: Commit**

```bash
git add pb_migrations/1789510000_viaticos_administrativos.js
git commit -m "feat(sueldos): tarifas de viaticos 4.1.12/4.1.13 para Administrativos"
```

---

### Task 2: `calcularLiquidacionSueldoMensual` separa base de descuentos de viáticos

**Files:**
- Modify: `web/src/pages/fichadas/motor.ts:850-904`

**Interfaces:**
- Produces: `LiquidacionSueldoMensual` gana los campos `brutoSujetoRetencion`, `diasTrabajados`, `tarifaComida`, `tarifaEspecial`, `montoViaticos`; `calcularLiquidacionSueldoMensual` recibe 3 parámetros nuevos (`diasTrabajados`, `tarifaComida`, `tarifaEspecial`) — consumidos por la Task 3.

- [ ] **Step 1: Reemplazar la interfaz y la función completas**

En `web/src/pages/fichadas/motor.ts`, reemplazar desde `export interface LiquidacionSueldoMensual {` (línea 850) hasta el cierre de `calcularLiquidacionSueldoMensual` (línea 904, el `}` final) por:

```typescript
export interface LiquidacionSueldoMensual {
  basico: number;
  antiguedadPct: number;
  horasExtraMes: number;
  montoHorasExtra: number;
  montoAntiguedad: number;
  brutoSujetoRetencion: number;
  diasTrabajados: number;
  tarifaComida: number;
  tarifaEspecial: number;
  montoViaticos: number;
  bruto: number;
  descuentoJubilacion: number;
  descuentoLey19032: number;
  descuentoObraSocial: number;
  descuentoAnsal: number;
  descuentoCuotaSindical: number;
  descuentoSeguroSepelio: number;
  totalDescuentos: number;
  neto: number;
}

// Sueldo mensual de un legajo administrativo: básico + horas extra REALES de
// ese mes (a diferencia de la liquidación de vacaciones, que promedia 6
// meses) + antigüedad − descuentos + viáticos = neto. A diferencia de
// calcularLiquidacionVacaciones, acá el básico YA es el sueldo del mes
// completo -- no se prorratea por día ni se suma plus vacacional. Los
// viáticos 4.1.12 (Comida) y 4.1.13 (Especial) se pagan por día trabajado y
// NO entran en la base de los 6 descuentos -- confirmado contra recibos de
// sueldo reales: esa base es solo básico+horas extra+antigüedad
// (brutoSujetoRetencion), los viáticos se suman recién al final.
export function calcularLiquidacionSueldoMensual(params: {
  basico: number;
  fechaAlta: string | null | undefined;
  categoria: FichadasCategoria;
  horasExtraMes: number; // en HORAS, no minutos
  anioMes: string; // "YYYY-MM"
  diasTrabajados: number;
  tarifaComida: number;
  tarifaEspecial: number;
}): LiquidacionSueldoMensual | null {
  const { basico, fechaAlta, categoria, horasExtraMes, anioMes, diasTrabajados, tarifaComida, tarifaEspecial } = params;
  if (!fechaAlta) return null;
  const anio = Number(anioMes.slice(0, 4));
  const antiguedadPct = calcularAntiguedadPctLiquidacion(fechaAlta, anio);
  if (antiguedadPct === null) return null;

  const valorHoraExtra = (basico / 24 / 8) * 1.5;
  const montoHorasExtra = valorHoraExtra * horasExtraMes;
  const montoAntiguedad = (basico + montoHorasExtra) * (antiguedadPct / 100);
  const brutoSujetoRetencion = basico + montoHorasExtra + montoAntiguedad;

  const montoViaticos = diasTrabajados * (tarifaComida + tarifaEspecial);
  const bruto = brutoSujetoRetencion + montoViaticos;

  const descuentoJubilacion = brutoSujetoRetencion * (categoria.pct_jubilacion / 100);
  const descuentoLey19032 = brutoSujetoRetencion * (categoria.pct_ley19032 / 100);
  const descuentoObraSocial = brutoSujetoRetencion * (categoria.pct_obra_social / 100);
  const descuentoAnsal = brutoSujetoRetencion * (categoria.pct_ansal / 100);
  const descuentoCuotaSindical = brutoSujetoRetencion * (categoria.pct_cuota_sindical / 100);
  const descuentoSeguroSepelio = brutoSujetoRetencion * (categoria.pct_seguro_sepelio / 100);
  const totalDescuentos = descuentoJubilacion + descuentoLey19032 + descuentoObraSocial + descuentoAnsal + descuentoCuotaSindical + descuentoSeguroSepelio;
  const neto = brutoSujetoRetencion - totalDescuentos + montoViaticos;

  return {
    basico, antiguedadPct, horasExtraMes, montoHorasExtra, montoAntiguedad, brutoSujetoRetencion,
    diasTrabajados, tarifaComida, tarifaEspecial, montoViaticos, bruto,
    descuentoJubilacion, descuentoLey19032, descuentoObraSocial, descuentoAnsal, descuentoCuotaSindical, descuentoSeguroSepelio,
    totalDescuentos, neto,
  };
}
```

- [ ] **Step 2: Build**

```bash
cd web && npm run build
```
Expected: falla acá, porque `LiquidacionAdministrativosSub.tsx` (Task 3, todavía no actualizado) llama a `calcularLiquidacionSueldoMensual` sin los 3 parámetros nuevos — **es el resultado esperado en este punto**. Confirmá que el único error de `tsc` apunta a esa llamada faltando propiedades (`diasTrabajados`/`tarifaComida`/`tarifaEspecial`) y no a otra cosa.

- [ ] **Step 3: Verificación numérica a mano**

Con un ejemplo simple (`basico=1000000`, `fechaAlta='2020-01-01'`, `anioMes='2026-11'`, `horasExtraMes=0`, `categoria` de prueba con los 6 `pct_*` de siempre, `diasTrabajados=20`, `tarifaComida=17524.83`, `tarifaEspecial=8793.93`), confirmar a mano (node -e o calculadora):
- `antiguedadPct` = 7
- `montoAntiguedad` = 1000000*0.07 = 70000
- `brutoSujetoRetencion` = 1000000+0+70000 = 1070000
- `montoViaticos` = 20*(17524.83+8793.93) = 20*26318.76 = 526375.2
- `bruto` = 1070000+526375.2 = 1596375.2
- `totalDescuentos` = 1070000*0.215 = 230050
- `neto` = 1070000-230050+526375.2 = 1366325.2

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/fichadas/motor.ts
git commit -m "feat(sueldos): separar base de descuentos de viaticos en calcularLiquidacionSueldoMensual"
```

---

### Task 3: Conectar viáticos en LiquidacionAdministrativosSub.tsx

**Files:**
- Modify: `web/src/pages/sueldos/LiquidacionAdministrativosSub.tsx`

**Interfaces:**
- Consumes: `calcularLiquidacionSueldoMensual` (Task 2, con los 3 parámetros nuevos), colección `sueldos_tarifas_viaje` (Task 1, ya legible por el módulo `sueldos` desde el sub-proyecto 1).

- [ ] **Step 1: Agregar el import del tipo de tarifa**

En `web/src/pages/sueldos/LiquidacionAdministrativosSub.tsx`, línea 6, agregar `SueldosTarifaViaje` a la lista de tipos importados:

```typescript
import type { Chofer, FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad, HistorialLegajo, SueldosTarifaViaje } from '../../types';
```

- [ ] **Step 2: Agregar las constantes de nombre de tarifa**

Después de la línea de imports (antes de `export function LiquidacionAdministrativosSub()`), agregar:

```typescript
const NOMBRE_TARIFA_COMIDA = 'Viaticos 4.1.12 - Comida (por dia trabajado)';
const NOMBRE_TARIFA_ESPECIAL = 'Viaticos 4.1.13 - Especial (por dia trabajado)';
```

- [ ] **Step 3: Calcular días trabajados, buscar tarifas y pasarlas al cálculo**

Reemplazar el bloque completo entre el `Promise.all` de marcas/novedades/etc. (línea 53) y el `setResultado(calc)` (línea 74) por:

```typescript
      const [legajosTodos, marcas, novedades, feriados, empresas, historial, tarifas] = await Promise.all([
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>(),
        pb.collection('fichadas_legajo_historial').getFullList<HistorialLegajo>(),
        pb.collection('sueldos_tarifas_viaje').getFullList<SueldosTarifaViaje>(),
      ]);
      const legajosAjustados = legajosTodos.map((l) => ((l.estado || l.fecha_baja) ? l : { ...l, horas_extra_fijas: null }));
      const empresaNombrePorId = new Map(empresas.map((e) => [e.id, e.nombre]));
      const { resultados } = procesarPeriodo({
        legajos: legajosAjustados, marcas, novedades, feriados, historial, empresaNombrePorId, desde, hasta,
      });

      const resultadosLegajo = resultados.filter((r) => r.idLegajo === legajoId);
      const minutosExtra = resultadosLegajo.reduce((acc, r) => acc + r.hE, 0);
      const horasExtraMes = minutosExtra / 60;
      const diasTrabajados = resultadosLegajo.filter((r) => r.paresEsperados.length > 0 && !r.ausente).length;

      const tarifaPorNombre = new Map(tarifas.map((t) => [t.nombre, t.valor]));
      const tarifaComida = tarifaPorNombre.get(NOMBRE_TARIFA_COMIDA);
      const tarifaEspecial = tarifaPorNombre.get(NOMBRE_TARIFA_ESPECIAL);
      if (tarifaComida === undefined || tarifaEspecial === undefined) {
        toast('No se encontró la tarifa de viáticos (revisá los nombres en Sueldos → Tarifas de viaje).', 'warn');
      }

      const calc = calcularLiquidacionSueldoMensual({
        basico: legajo.basico, fechaAlta: legajo.fecha_alta, categoria, horasExtraMes, anioMes,
        diasTrabajados, tarifaComida: tarifaComida ?? 0, tarifaEspecial: tarifaEspecial ?? 0,
      });
      if (!calc) { setAviso('No se pudo calcular (revisá la fecha de alta del legajo).'); return; }
      setResultado(calc);
```

- [ ] **Step 4: Agregar la tarjeta y la tabla de viáticos a la UI**

En el `summary-grid summary-grid-compact` (línea 110-116), agregar una tarjeta de Viáticos entre "Antigüedad" y "Bruto":

```tsx
            <div className="stat"><div className="lbl">Básico</div><div className="val">{resultado.basico.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Horas extra ({resultado.horasExtraMes.toFixed(1)} hs)</div><div className="val">{resultado.montoHorasExtra.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Antigüedad ({resultado.antiguedadPct}%)</div><div className="val">{resultado.montoAntiguedad.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Viáticos (exento)</div><div className="val">{resultado.montoViaticos.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Bruto</div><div className="val">{resultado.bruto.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Neto</div><div className="val">{resultado.neto.toLocaleString('es-AR')}</div></div>
```

Y agregar una tabla nueva de "Viáticos" justo antes del `<h3>` de "Descuentos" (línea 118):

```tsx
          <h3 style={{ fontSize: 13, color: 'var(--navy)' }}>Viáticos (días trabajados: {resultado.diasTrabajados})</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Concepto</th><th className="num">Días</th><th className="num">Tarifa</th><th className="num">Monto</th></tr></thead>
              <tbody>
                <tr><td>Comida (4.1.12)</td><td className="num">{resultado.diasTrabajados}</td><td className="num">{resultado.tarifaComida.toLocaleString('es-AR')}</td><td className="num">{(resultado.diasTrabajados * resultado.tarifaComida).toLocaleString('es-AR')}</td></tr>
                <tr><td>Especial (4.1.13)</td><td className="num">{resultado.diasTrabajados}</td><td className="num">{resultado.tarifaEspecial.toLocaleString('es-AR')}</td><td className="num">{(resultado.diasTrabajados * resultado.tarifaEspecial).toLocaleString('es-AR')}</td></tr>
                <tr><td><strong>Total viáticos</strong></td><td></td><td></td><td className="num"><strong>{resultado.montoViaticos.toLocaleString('es-AR')}</strong></td></tr>
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: 13, color: 'var(--navy)' }}>Descuentos</h3>
```

- [ ] **Step 5: Build**

```bash
cd web && npm run build
```
Expected: limpio.

- [ ] **Step 6: Verificación manual**

Con lectura de código (sin navegador en este entorno): confirmar que `resultado.diasTrabajados`/`tarifaComida`/`tarifaEspecial`/`montoViaticos` están definidos en `LiquidacionSueldoMensual` (Task 2) y se usan con esos mismos nombres acá, que `tarifaPorNombre` busca exactamente los 2 nombres sembrados en la Task 1, y que el aviso de "no se encontró la tarifa" aparece si falta alguna (no se calcula con 0 en silencio sin avisar).

Si el legajo real "Actis Tobías" y los meses septiembre/octubre 2026 están cargados en la instancia de staging a la que tengas acceso: calcular ahí y confirmar que el Neto coincide con "Haberes" del recibo real que ya tiene el usuario (septiembre: $1.424.808,68; octubre no es comparable directo porque fue un mes parcial por vacaciones). Si no tenés acceso a esos datos reales en este entorno, dejar esta verificación para quien sí lo tenga, documentándola en el reporte.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/sueldos/LiquidacionAdministrativosSub.tsx
git commit -m "feat(sueldos): mostrar viaticos 4.1.12/4.1.13 en Liquidacion Administrativos"
```

## Self-Review

**1. Cobertura del spec:** 2 tarifas nuevas ✅ (Task 1), fórmula que separa base de descuentos de viáticos ✅ (Task 2), días trabajados = `paresEsperados.length>0 && !ausente` ✅ (Task 3), UI con las 2 filas + tarjeta "Viáticos (exento)" ✅ (Task 3), no se toca Choferes/Fichadas/ASIG.EXT ✅ (ningún task los toca).

**2. Placeholders:** ninguno.

**3. Consistencia de tipos:** `LiquidacionSueldoMensual` se amplía en la Task 2 y se consume con los mismos nombres de campo en la Task 3 (`diasTrabajados`, `tarifaComida`, `tarifaEspecial`, `montoViaticos`, `brutoSujetoRetencion`). Los nombres de tarifa (`NOMBRE_TARIFA_COMIDA`/`NOMBRE_TARIFA_ESPECIAL`) coinciden carácter por carácter entre la Task 1 (seed) y la Task 3 (lookup).

## Ejecución

Plan completo y guardado en `docs/superpowers/plans/2026-11-18-viaticos-administrativos.md`.

**1. Subagent-Driven (recomendado)** - despacho un subagente por tarea, reviso entre tareas.

**2. Inline Execution** - lo ejecuto yo mismo en esta sesión.

¿Cuál preferís?
