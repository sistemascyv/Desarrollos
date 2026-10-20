# Fichadas: fecha de inicio para horas extra fijas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una fecha de inicio (`horas_extra_fijas_desde`) al acuerdo de horas extra fijas de un legajo, para que el motor de cálculo deje de inventar esas horas en períodos anteriores a que el acuerdo real empezara a regir.

**Architecture:** Un campo nuevo de texto (`YYYY-MM-DD`, opcional) en `fichadas_legajos`. En `procesarPeriodo()` (motor.ts), `horaFijaDelDia` se gatea por esa fecha — sin fecha cargada, comportamiento idéntico al actual (compatibilidad hacia atrás). La pantalla de Configuración gana un campo "Vigente desde" junto al editor de horas por día ya existente.

**Tech Stack:** React + TypeScript (Vite), PocketBase (migraciones), `tsx` para probar el motor.

## Global Constraints

- Una sola fecha para todo el acuerdo (no una por día) — confirmado, un acuerdo de horas fijas es uno solo aunque cubra varios días de la semana.
- Sin `horas_extra_fijas_desde` cargado, el comportamiento es idéntico al de hoy (se aplica siempre, sin corte) — ningún legajo existente necesita backfill (confirmado por SQL directo en producción: 0 legajos con horas extra fijas configuradas hoy).
- El gating afecta también la guarda "día libre sin fichada ni novedad" — antes de la fecha de inicio, ese día se trata como un día libre común (no genera fila), igual que si no tuviera ninguna hora fija configurada.
- Fuera de alcance: fecha de inicio por día individual, fecha de fin del acuerdo, backfill de datos reales.

---

## Task 1: Migración — campo horas_extra_fijas_desde en fichadas_legajos

**Files:**
- Create: `pb_migrations/1789210000_fichadas_legajos_horas_fijas_desde.js`
- Modify: `web/src/types.ts`

**Interfaces:**
- Produces: campo `horas_extra_fijas_desde` (text, opcional) en `fichadas_legajos`; `FichadasLegajo.horas_extra_fijas_desde?: string`.

- [ ] **Step 1: Escribir la migración**

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Fecha desde la cual rige el acuerdo de horas extra fijas de un legajo
// (ej: Ludeña en Córdoba) -- una sola fecha para todo el acuerdo, no una
// por día. Opcional: sin cargar, el motor sigue aplicando las horas fijas
// siempre, igual que hoy (compatibilidad hacia atrás, confirmado por SQL
// directo: 0 legajos con horas extra fijas configuradas en producción,
// no hace falta backfill). Ver
// docs/superpowers/specs/2026-10-20-fichadas-horas-extra-fijas-vigencia-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.addField(new SchemaField({
    system: false, id: 'fcl0hefijdesd1', name: 'horas_extra_fijas_desde', type: 'text',
    required: false, presentable: false, unique: false,
    options: { min: null, max: null, pattern: '' },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.removeField('fcl0hefijdesd1');
  return dao.saveCollection(collection);
})
```

- [ ] **Step 2: Probar contra una PocketBase local real**

```bash
mkdir -p /tmp/pb-test && cd /tmp/pb-test
curl -sL -o pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v0.22.55/pocketbase_0.22.55_linux_amd64.zip"
unzip -o pb.zip
rm -rf data mig hooks
mkdir -p mig hooks
cp /ruta/al/repo/pb_migrations/*.js mig/
cp /ruta/al/repo/pb_hooks/*.js hooks/
./pocketbase migrate up --migrationsDir mig --hooksDir hooks --dir data
```

Expected: `Applied 1789210000_fichadas_legajos_horas_fijas_desde.js` sin errores.

- [ ] **Step 3: Verificar el campo quedó bien definido**

```bash
python3 -c "
import sqlite3, json
con = sqlite3.connect('data/data.db')
row = con.execute(\"SELECT schema FROM _collections WHERE name='fichadas_legajos'\").fetchone()
data = json.loads(row[0])
campo = [f for f in data if f['name']=='horas_extra_fijas_desde'][0]
assert campo['required'] is False
assert campo['type'] == 'text'
print('OK: horas_extra_fijas_desde presente, opcional, tipo text')
"
```

Expected: imprime `OK: horas_extra_fijas_desde presente...` sin error en los asserts.

- [ ] **Step 4: Agregar el campo en `web/src/types.ts`**

Buscar:

```typescript
export interface FichadasLegajo extends BaseRecord {
  nro_legajo?: string;
  nro_tarjeta: string;
  nombre: string;
  dni?: string;
  empresa?: string;
  horario?: string;
  dias_personalizados?: DiaHorario[] | null;
  horas_extra_fijas?: HoraExtraFija[] | null;
  estado: boolean;
  fecha_alta?: string; // "YYYY-MM-DD", opcional -- vacío en legajos de antes del sistema
  fecha_baja?: string; // "YYYY-MM-DD", opcional -- si está cargada, estado = false
  motivo_baja?: string; // una de MOTIVOS_BAJA (motor.ts), solo si fecha_baja está cargada
  expand?: { empresa?: FichadasEmpresa; horario?: FichadasHorario };
}
```

Reemplazar por:

```typescript
export interface FichadasLegajo extends BaseRecord {
  nro_legajo?: string;
  nro_tarjeta: string;
  nombre: string;
  dni?: string;
  empresa?: string;
  horario?: string;
  dias_personalizados?: DiaHorario[] | null;
  horas_extra_fijas?: HoraExtraFija[] | null;
  horas_extra_fijas_desde?: string; // "YYYY-MM-DD", opcional -- vacío = sin corte, se aplica siempre (igual que antes de este campo)
  estado: boolean;
  fecha_alta?: string; // "YYYY-MM-DD", opcional -- vacío en legajos de antes del sistema
  fecha_baja?: string; // "YYYY-MM-DD", opcional -- si está cargada, estado = false
  motivo_baja?: string; // una de MOTIVOS_BAJA (motor.ts), solo si fecha_baja está cargada
  expand?: { empresa?: FichadasEmpresa; horario?: FichadasHorario };
}
```

- [ ] **Step 5: Commit**

```bash
git add pb_migrations/1789210000_fichadas_legajos_horas_fijas_desde.js web/src/types.ts
git commit -m "Fichadas: campo horas_extra_fijas_desde en legajos"
```

(Incluir `Co-Authored-By: Claude <noreply@anthropic.com>`.)

---

## Task 2: Motor — gatear horaFijaDelDia por fecha de vigencia

**Files:**
- Modify: `web/src/pages/fichadas/motor.ts`

**Interfaces:**
- Consumes: `FichadasLegajo.horas_extra_fijas_desde` (Task 1).
- Produces: `procesarPeriodo()` deja de aplicar `horaFijaDelDia` en días anteriores a `horas_extra_fijas_desde` (sin cambiar su firma ni su tipo de retorno).

- [ ] **Step 1: Gatear horaFijaDelDia por fecha**

Buscar:

```typescript
      const novedad = novedadManual(idLegajo, fecha);
      const horaFijaDelDia = (legajo.horas_extra_fijas || []).find((h) => h.dia === dia);

      if (!trabaja && !novedad && !horaFijaDelDia) continue; // día libre programado, sin novedad ni horas fijas: no se reporta
```

Reemplazar por:

```typescript
      const novedad = novedadManual(idLegajo, fecha);
      // Las horas fijas solo cuentan desde que el acuerdo está vigente --
      // sin horas_extra_fijas_desde cargado (cualquier legajo configurado
      // antes de este campo, o sin fecha puesta), se comporta igual que
      // siempre: se aplican sin ningún corte.
      const horaFijaBruta = (legajo.horas_extra_fijas || []).find((h) => h.dia === dia);
      const horaFijaDelDia = horaFijaBruta && (!legajo.horas_extra_fijas_desde || fecha >= legajo.horas_extra_fijas_desde)
        ? horaFijaBruta
        : undefined;

      if (!trabaja && !novedad && !horaFijaDelDia) continue; // día libre programado, sin novedad ni horas fijas vigentes: no se reporta
```

- [ ] **Step 2: Escribir el script de prueba**

```typescript
// Prueba standalone: fecha de vigencia de horas_extra_fijas_desde en
// procesarPeriodo. Se corre con tsx y se borra después.
import { procesarPeriodo } from './motor';
import type { FichadasLegajo } from '../../types';

let ok = 0, fail = 0;
function check(nombre: string, cond: boolean, extra?: unknown) {
  if (cond) { ok++; console.log(`  OK   ${nombre}`); }
  else { fail++; console.log(`  FALLA ${nombre} ->`, extra); }
}

// Legajo con horas fijas lunes (dia=1, 4.5hs) -- el período de prueba
// cubre dos lunes: 2026-01-05 (antes de la vigencia) y 2026-01-12
// (después). Sin horario de trabajo asignado (dias_personalizados
// vacío), para que SOLO la hora fija determine si el día genera fila.
function legajoConVigencia(desde: string | undefined): FichadasLegajo {
  return {
    id: 'l1', created: '', updated: '',
    nro_tarjeta: 'l1', nombre: 'Prueba', estado: true,
    horas_extra_fijas: [{ dia: 1, horas: 4.5 }],
    horas_extra_fijas_desde: desde,
  };
}

// Caso 1: sin horas_extra_fijas_desde -- se aplica siempre (comportamiento actual).
{
  const legajo = legajoConVigencia(undefined);
  const { resultados } = procesarPeriodo({
    legajos: [legajo], marcas: [], novedades: [], feriados: [],
    empresaNombrePorId: new Map(), desde: '2026-01-05', hasta: '2026-01-12',
  });
  const lunes1 = resultados.find((r) => r.fecha === '2026-01-05');
  const lunes2 = resultados.find((r) => r.fecha === '2026-01-12');
  check('sin fecha: primer lunes genera fila con hE=270min', lunes1?.hE === 270, lunes1);
  check('sin fecha: segundo lunes también genera fila con hE=270min', lunes2?.hE === 270, lunes2);
}

// Caso 2: con horas_extra_fijas_desde = 2026-01-10 -- el primer lunes (05)
// queda antes de la vigencia, no genera fila; el segundo (12) sí.
{
  const legajo = legajoConVigencia('2026-01-10');
  const { resultados } = procesarPeriodo({
    legajos: [legajo], marcas: [], novedades: [], feriados: [],
    empresaNombrePorId: new Map(), desde: '2026-01-05', hasta: '2026-01-12',
  });
  const lunes1 = resultados.find((r) => r.fecha === '2026-01-05');
  const lunes2 = resultados.find((r) => r.fecha === '2026-01-12');
  check('con fecha: primer lunes (antes de la vigencia) no genera fila', lunes1 === undefined, lunes1);
  check('con fecha: segundo lunes (después de la vigencia) genera fila con hE=270min', lunes2?.hE === 270, lunes2);
}

// Caso 3: el día exacto de horas_extra_fijas_desde ya cuenta (inclusive).
{
  const legajo = legajoConVigencia('2026-01-12');
  const { resultados } = procesarPeriodo({
    legajos: [legajo], marcas: [], novedades: [], feriados: [],
    empresaNombrePorId: new Map(), desde: '2026-01-05', hasta: '2026-01-12',
  });
  const lunes2 = resultados.find((r) => r.fecha === '2026-01-12');
  check('día == fecha de vigencia cuenta (inclusive)', lunes2?.hE === 270, lunes2);
}

console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3: Correr la prueba y borrarla**

Run: `cd web && npx tsx src/pages/fichadas/motor.test-vigencia.ts`
Expected: `5 ok, 0 fallas` (si el conteo real difiere porque se agregó/quitó algún `check(...)`, lo que manda es que todas las que haya pasen en 0, no el número exacto).

```bash
rm web/src/pages/fichadas/motor.test-vigencia.ts
```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/motor.ts
git commit -m "Fichadas: gatear horas extra fijas por fecha de vigencia"
```

---

## Task 3: Configuración — campo "Vigente desde" en Horas extra fijas

**Files:**
- Modify: `web/src/pages/fichadas/ConfiguracionTab.tsx`

**Interfaces:**
- Consumes: `FichadasLegajo.horas_extra_fijas_desde` (Task 1).
- Produces: el formulario de Horas extra fijas guarda `horas_extra_fijas_desde` junto con `horas_extra_fijas`.

- [ ] **Step 1: `HorasFijasSub` — guardar también la fecha de vigencia**

Buscar:

```typescript
  async function guardar(horas: HoraExtraFija[]) {
    setGuardando(true);
    try {
      await pb.collection('fichadas_legajos').update(idLegajo, { horas_extra_fijas: horas.length ? horas : null });
      toast('Horas extra fijas guardadas.', 'ok');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }
```

Reemplazar por:

```typescript
  async function guardar(horas: HoraExtraFija[], desde: string) {
    setGuardando(true);
    try {
      await pb.collection('fichadas_legajos').update(idLegajo, {
        horas_extra_fijas: horas.length ? horas : null,
        horas_extra_fijas_desde: desde || null,
      });
      toast('Horas extra fijas guardadas.', 'ok');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }
```

- [ ] **Step 2: Pasarle la fecha inicial al editor**

Buscar:

```tsx
      {legajo && (
        <div style={{ marginTop: 14 }} key={idLegajo}>
          <EditorHorasFijas horasIniciales={legajo.horas_extra_fijas || []} onGuardar={guardar} guardando={guardando} />
        </div>
      )}
    </>
  );
}

function EditorHorasFijas({ horasIniciales, onGuardar, guardando }: { horasIniciales: HoraExtraFija[]; onGuardar: (horas: HoraExtraFija[]) => void; guardando: boolean }) {
  const toast = useToast();
  const [valores, setValores] = useState<string[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = horasIniciales.find((h) => h.dia === i + 1);
    return f ? String(f.horas).replace('.', ',') : '';
  }));

  function guardar() {
    const horas: HoraExtraFija[] = [];
    for (let i = 0; i < 7; i++) {
      const txt = valores[i].trim();
      if (!txt) continue;
      const n = Number(txt.replace(',', '.'));
      if (!isFinite(n) || n <= 0 || n > 24) { toast(`Revisá las horas del ${DIAS_SEMANA[i]}.`, 'warn'); return; }
      horas.push({ dia: i + 1, horas: n });
    }
    onGuardar(horas);
  }

  return (
    <>
      {DIAS_SEMANA.map((nombre, i) => (
```

Reemplazar por:

```tsx
      {legajo && (
        <div style={{ marginTop: 14 }} key={idLegajo}>
          <EditorHorasFijas horasIniciales={legajo.horas_extra_fijas || []} desdeInicial={legajo.horas_extra_fijas_desde || ''} onGuardar={guardar} guardando={guardando} />
        </div>
      )}
    </>
  );
}

function EditorHorasFijas({ horasIniciales, desdeInicial, onGuardar, guardando }: { horasIniciales: HoraExtraFija[]; desdeInicial: string; onGuardar: (horas: HoraExtraFija[], desde: string) => void; guardando: boolean }) {
  const toast = useToast();
  const [valores, setValores] = useState<string[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = horasIniciales.find((h) => h.dia === i + 1);
    return f ? String(f.horas).replace('.', ',') : '';
  }));
  const [desde, setDesde] = useState(desdeInicial);

  function guardar() {
    const horas: HoraExtraFija[] = [];
    for (let i = 0; i < 7; i++) {
      const txt = valores[i].trim();
      if (!txt) continue;
      const n = Number(txt.replace(',', '.'));
      if (!isFinite(n) || n <= 0 || n > 24) { toast(`Revisá las horas del ${DIAS_SEMANA[i]}.`, 'warn'); return; }
      horas.push({ dia: i + 1, horas: n });
    }
    onGuardar(horas, desde);
  }

  return (
    <>
      <div className="field" style={{ marginBottom: 10, maxWidth: 200 }}>
        <label>Vigente desde</label>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      </div>
      <div className="hint" style={{ marginBottom: 10 }}>Vacío: las horas fijas se aplican siempre, sin fecha de corte (igual que antes de este campo).</div>
      {DIAS_SEMANA.map((nombre, i) => (
```

- [ ] **Step 3: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/fichadas/ConfiguracionTab.tsx
git commit -m "Fichadas: campo Vigente desde en Horas extra fijas"
```

---

## Task 4: Desplegar y verificar

**Files:** (ninguno nuevo — solo push y verificación)

- [ ] **Step 1: Push**

```bash
git push origin claude/cyv-driver-renditions-form-h4l5fu
```

- [ ] **Step 2: Esperar el deploy y confirmar**

Sondear `https://api.github.com/repos/sistemascyv/Desarrollos/actions/runs?branch=claude/cyv-driver-renditions-form-h4l5fu&per_page=1` hasta `status: completed` (o confirmar directamente que el hash del bundle JS cambió en `https://app.carossiovairolatti.com.ar/`).

- [ ] **Step 3: Verificación final en producción**

Entrar a Fichadas → Configuración → Horas extra fijas, elegir un empleado, confirmar que aparece el campo "Vigente desde" (vacío por defecto, ya que ningún legajo lo tiene cargado), poner una fecha de prueba + horas en un día, guardar, y confirmar que no rompe nada. Entrar a Resultados o Estadísticas con un período que incluya fechas antes y después de esa fecha de prueba, y confirmar que las horas fijas solo aparecen después de la fecha configurada.
