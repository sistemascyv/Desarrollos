# Fichadas: horas extra fijas por persona Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un concepto de "horas extra fijas por persona" al módulo Fichadas — un monto de horas por día de la semana que se suma siempre a las horas extra calculadas de esa persona, haya fichado ese día o no (caso real: Ludeña en Córdoba, 4,5h fijas lunes a jueves y 2,5h los sábados).

**Architecture:** Un campo JSON nuevo en `fichadas_legajos` (mismo patrón que `dias_personalizados`), una suma puntual dentro del motor de cálculo existente (`motor.ts::procesarPeriodo`, después de calcular `hE`), y una pestaña nueva en Configuración que reusa el patrón ya establecido de "Horario personalizado" (selector de empleado + editor por día de la semana).

**Tech Stack:** React + TypeScript (Vite), PocketBase (migraciones), `tsx` (ya es devDependency de este proyecto) para probar el motor de cálculo como script standalone sin levantar un navegador.

## Global Constraints

- Nadie tiene `horas_extra_fijas` configurado por defecto — es opt-in, solo para casos puntuales que un admin cargue a mano.
- Las horas fijas se suman **siempre** para el día de la semana configurado, independientemente de si la persona fichó ese día o no (no se recalculan ni se saltean si el día resulta `ausente`).
- Las horas fijas se suman **sin pasar por el redondeo de bloques** de `incrementoRedondeo` — ese redondeo es solo para horas derivadas de fichadas reales, no para un monto fijo por acuerdo.
- No se valida que el día configurado coincida con un día que la plantilla de esa persona marque como laborable — queda a criterio de quien carga el acuerdo.
- No hay fecha de inicio/fin para el acuerdo — qued a indefinido hasta que se edite o borre a mano.

---

## Task 1: Migración — campo `horas_extra_fijas` en `fichadas_legajos`

**Files:**
- Create: `pb_migrations/1789140000_fichadas_legajos_horas_extra_fijas.js`

**Interfaces:**
- Produces: campo `horas_extra_fijas` (json, opcional) en `fichadas_legajos` — lista de `{ dia: number, horas: number }`.

- [ ] **Step 1: Escribir la migración**

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Fichadas: horas extra fijas por persona (ej: Ludeña en Córdoba, 4,5h
// lunes a jueves + 2,5h sábados). Mismo patrón que dias_personalizados --
// json opcional, nadie lo tiene configurado por defecto. Ver
// docs/superpowers/specs/2026-10-16-fichadas-horas-extra-fijas-design.md.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.addField(new SchemaField({
    // [{ "dia": 1, "horas": 4.5 }, ...] -- dia: 1=lunes..7=domingo, mismo
    // criterio que DiaHorario.
    system: false, id: 'fcl0horexfij1', name: 'horas_extra_fijas', type: 'json',
    required: false, presentable: false, unique: false, options: { maxSize: 200000 },
  }));
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId('fichadas_legajos');
  collection.schema.removeField('fcl0horexfij1');
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

(En Windows, usar `pocketbase_0.22.55_windows_amd64.zip` y `pocketbase.exe`.)

Expected: `Applied 1789140000_fichadas_legajos_horas_extra_fijas.js` sin errores, y todas las migraciones anteriores también aplican limpio (son ~65 archivos a esta altura).

- [ ] **Step 3: Verificar el campo quedó bien definido**

```bash
python3 -c "
import sqlite3, json
con = sqlite3.connect('data/data.db')
row = con.execute(\"SELECT schema FROM _collections WHERE name='fichadas_legajos'\").fetchone()
data = json.loads(row[0])
campo = [f for f in data if f['name']=='horas_extra_fijas'][0]
print(campo)
"
```

Expected: imprime el campo con `'type': 'json'`, `'required': False`.

- [ ] **Step 4: Commit**

```bash
git add pb_migrations/1789140000_fichadas_legajos_horas_extra_fijas.js
git commit -m "Fichadas: campo horas_extra_fijas en legajos"
```

---

## Task 2: Motor de cálculo — sumar las horas fijas

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/pages/fichadas/motor.ts`
- Create: `web/src/pages/fichadas/motor.test-horas-fijas.ts` (script standalone, se borra después de correrlo — ver Step 4)

**Interfaces:**
- Consumes: campo `horas_extra_fijas` de Task 1.
- Produces: `procesarPeriodo()` suma las horas fijas correspondientes a `hE` de cada `ResultadoDia`, sin tocar ningún otro consumidor (todo lo que ya lee `hE` — pantalla, los 4 exports a Excel — recibe el valor ya sumado automáticamente).

- [ ] **Step 1: Agregar el tipo en `web/src/types.ts`**

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
  estado: boolean;
  expand?: { empresa?: FichadasEmpresa; horario?: FichadasHorario };
}
```

Reemplazar por:

```typescript
export interface HoraExtraFija {
  dia: number; // 1=lunes .. 7=domingo, mismo criterio que DiaHorario
  horas: number;
}

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
  expand?: { empresa?: FichadasEmpresa; horario?: FichadasHorario };
}
```

- [ ] **Step 2: Modificar `web/src/pages/fichadas/motor.ts`**

Buscar:

```typescript
      const hN = teoricoTotal > 0 ? Math.min(worked, teoricoTotal) : worked;
      const hEcruda = Math.max(0, worked - teoricoTotal);
      const incremento = incrementoRedondeo(depositoDelDia);
      const hE = Math.floor(hEcruda / incremento) * incremento;
```

Reemplazar por:

```typescript
      const hN = teoricoTotal > 0 ? Math.min(worked, teoricoTotal) : worked;
      const hEcruda = Math.max(0, worked - teoricoTotal);
      const incremento = incrementoRedondeo(depositoDelDia);
      const hECalculada = Math.floor(hEcruda / incremento) * incremento;
      // Horas extra fijas por acuerdo (ej: Ludeña en Córdoba) -- se suman
      // siempre para el día de la semana configurado, haya fichado o no
      // ese día puntual, y sin pasar por el redondeo de arriba (no son
      // horas derivadas de fichadas reales).
      const horaFijaDelDia = (legajo.horas_extra_fijas || []).find((h) => h.dia === dia);
      const hE = hECalculada + (horaFijaDelDia ? horaFijaDelDia.horas * 60 : 0);
```

- [ ] **Step 3: Escribir el script de prueba**

```typescript
// Prueba standalone del caso "horas extra fijas" (Ludeña): un día de la
// semana con fichadas reales normales (las fijas se suman arriba de lo
// calculado) y un día de la semana sin ninguna fichada real (las fijas
// igual se suman, aunque el día quede "ausente"). Se corre con tsx, no
// es parte de ningún framework de tests -- este proyecto no tiene uno
// para el frontend, se verifica así como ya se hizo con numeroEnLetras.
import { procesarPeriodo } from './motor';
import type { FichadasLegajo, FichadasMarca } from '../../types';

let ok = 0, fail = 0;
function check(nombre: string, cond: boolean, extra?: unknown) {
  if (cond) { ok++; console.log(`  OK   ${nombre}`); }
  else { fail++; console.log(`  FALLA ${nombre} ->`, extra); }
}

function proximoDiaSemana(desde: Date, diaDeseado: number): Date {
  const d = new Date(desde);
  for (;;) {
    const jsDay = d.getUTCDay();
    const col = jsDay === 0 ? 7 : jsDay;
    if (col === diaDeseado) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
function fmt(d: Date): string { return d.toISOString().slice(0, 10); }

const lunes = proximoDiaSemana(new Date('2026-01-01T00:00:00Z'), 1);
const sabado = proximoDiaSemana(lunes, 6);
const fechaLunes = fmt(lunes);
const fechaSabado = fmt(sabado);

const legajo: FichadasLegajo = {
  id: 'leg1', created: '', updated: '',
  nro_tarjeta: '999', nombre: 'Ludeña', estado: true,
  dias_personalizados: [
    { dia: 1, trabaja: true, pares: [[480, 1020]] }, // lunes 08:00-17:00 (9h teórico)
    { dia: 6, trabaja: true, pares: [[480, 720]] },  // sábado 08:00-12:00 (4h teórico)
  ],
  horas_extra_fijas: [
    { dia: 1, horas: 4.5 },
    { dia: 6, horas: 2.5 },
  ],
};

// Lunes: fichó 08:00 a 18:00 (10h reales, 1h de extra calculada -> 60min,
// CORDOBA redondea cada 15min -> 60min calculados exactos).
const marcas: FichadasMarca[] = [
  { id: 'm1', created: '', updated: '', legajo: 'leg1', tarjeta: '999', fecha: fechaLunes, hora: '08:00', minutos: 480, deposito: 'CORDOBA' },
  { id: 'm2', created: '', updated: '', legajo: 'leg1', tarjeta: '999', fecha: fechaLunes, hora: '18:00', minutos: 1080, deposito: 'CORDOBA' },
  // Sábado: SIN ninguna fichada real (ausente ese día puntual).
];

const { resultados } = procesarPeriodo({
  legajos: [legajo], marcas, novedades: [], feriados: [],
  empresaNombrePorId: new Map(),
  desde: fechaLunes, hasta: fechaSabado,
});

const resultLunes = resultados.find((r) => r.fecha === fechaLunes);
const resultSabado = resultados.find((r) => r.fecha === fechaSabado);

check('lunes: existe resultado', !!resultLunes, resultados);
check('lunes: hE = 60 (calculada) + 270 (4.5h fijas) = 330', resultLunes?.hE === 330, resultLunes);
check('lunes: no quedó ausente (fichó)', resultLunes?.ausente === false, resultLunes);

check('sábado: existe resultado', !!resultSabado, resultados);
check('sábado: ausente = true (no fichó)', resultSabado?.ausente === true, resultSabado);
check('sábado: hE = 0 (calculada, sin fichadas) + 150 (2.5h fijas) = 150, aunque esté ausente', resultSabado?.hE === 150, resultSabado);

console.log(`\n${ok} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 4: Correr la prueba y borrarla**

Run: `cd web && npx tsx src/pages/fichadas/motor.test-horas-fijas.ts`
Expected: `6 ok, 0 fallas`.

```bash
rm web/src/pages/fichadas/motor.test-horas-fijas.ts
```

(Se borra porque este proyecto no tiene un framework de tests para el frontend — no queda un archivo `.test.ts` suelto sin un runner que lo ejecute solo. La lógica ya quedó verificada; si en el futuro se arma un test runner para este proyecto, este mismo caso es un buen punto de partida.)

- [ ] **Step 5: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/pages/fichadas/motor.ts
git commit -m "Fichadas: sumar horas extra fijas por persona al cálculo"
```

---

## Task 3: Pantalla — pestaña "Horas extra fijas" en Configuración

**Files:**
- Modify: `web/src/pages/fichadas/ConfiguracionTab.tsx`

**Interfaces:**
- Consumes: `horas_extra_fijas` (Task 1/2).
- Produces: nueva sub-pestaña en Configuración, mismo patrón que "Horario personalizado" (selector de empleado + editor por día de la semana).

- [ ] **Step 1: Agregar la sub-pestaña**

Buscar:

```typescript
const SUB_TABS = [
  { id: 'empleados', label: 'Empleados' },
  { id: 'horario_personal', label: 'Horario personalizado' },
  { id: 'plantillas', label: 'Plantillas de horario' },
  { id: 'areas', label: 'Áreas' },
] as const;
```

Reemplazar por:

```typescript
const SUB_TABS = [
  { id: 'empleados', label: 'Empleados' },
  { id: 'horario_personal', label: 'Horario personalizado' },
  { id: 'horas_fijas', label: 'Horas extra fijas' },
  { id: 'plantillas', label: 'Plantillas de horario' },
  { id: 'areas', label: 'Áreas' },
] as const;
```

Buscar:

```tsx
        {subTab === 'horario_personal' && <HorarioPersonalSub legajos={legajos} onChanged={refrescar} />}
```

Agregar justo después:

```tsx
        {subTab === 'horario_personal' && <HorarioPersonalSub legajos={legajos} onChanged={refrescar} />}
        {subTab === 'horas_fijas' && <HorasFijasSub legajos={legajos} onChanged={refrescar} />}
```

- [ ] **Step 2: Agregar el import del tipo**

Buscar:

```typescript
import type { DiaHorario, FichadasEmpresa, FichadasHorario, FichadasLegajo } from '../../types';
```

Reemplazar por:

```typescript
import type { DiaHorario, FichadasEmpresa, FichadasHorario, FichadasLegajo, HoraExtraFija } from '../../types';
```

- [ ] **Step 3: Agregar los componentes nuevos**

Insertar justo después del cierre de `HorarioPersonalSub` (busca el comentario `// ---------- Plantillas de horario ----------` y agregá esto justo antes):

```tsx
// ---------- Horas extra fijas (por empleado) ----------

function HorasFijasSub({ legajos, onChanged }: { legajos: FichadasLegajo[]; onChanged: () => void }) {
  const toast = useToast();
  const [idLegajo, setIdLegajo] = useState(legajos[0]?.id || '');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (!idLegajo && legajos[0]) setIdLegajo(legajos[0].id); }, [legajos, idLegajo]);

  const legajo = legajos.find((l) => l.id === idLegajo);

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

  return (
    <>
      <div className="hint">Un monto de horas que se suma siempre a las horas extra calculadas de esa persona, para el día de la semana elegido — haya fichado ese día o no. Dejar un día en blanco significa que no tiene nada fijo ese día.</div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="field" style={{ flex: 2 }}>
          <label>Empleado</label>
          <select value={idLegajo} onChange={(e) => setIdLegajo(e.target.value)}>
            {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
      </div>
      {legajo && (
        <div style={{ marginTop: 14 }} key={idLegajo}>
          <EditorHorasFijas horasIniciales={legajo.horas_extra_fijas || []} onGuardar={guardar} guardando={guardando} />
        </div>
      )}
    </>
  );
}

function EditorHorasFijas({ horasIniciales, onGuardar, guardando }: { horasIniciales: HoraExtraFija[]; onGuardar: (horas: HoraExtraFija[]) => void; guardando: boolean }) {
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
      if (isNaN(n) || n <= 0) continue;
      horas.push({ dia: i + 1, horas: n });
    }
    onGuardar(horas);
  }

  return (
    <>
      {DIAS_SEMANA.map((nombre, i) => (
        <div key={nombre} className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
          <div style={{ flex: '0 0 90px', fontWeight: 600, fontSize: 12 }}>{nombre}</div>
          <div className="field" style={{ flex: '0 0 100px' }}>
            <input
              value={valores[i]}
              placeholder="0"
              onChange={(e) => setValores((a) => a.map((v, idx) => idx === i ? e.target.value : v))}
            />
          </div>
          <div className="hint" style={{ margin: 0 }}>horas</div>
        </div>
      ))}
      <button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar horas fijas'}</button>
    </>
  );
}

```

- [ ] **Step 4: Build**

Run: `cd web && npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/fichadas/ConfiguracionTab.tsx
git commit -m "Fichadas: pantalla para cargar horas extra fijas por persona"
```

---

## Task 4: Desplegar y verificar

**Files:** (ninguno nuevo — solo push y verificación)

- [ ] **Step 1: Push**

```bash
git push origin claude/cyv-driver-renditions-form-h4l5fu
```

- [ ] **Step 2: Esperar el deploy y confirmar**

Sondear `https://api.github.com/repos/sistemascyv/Desarrollos/actions/runs?branch=claude/cyv-driver-renditions-form-h4l5fu&per_page=1` hasta `status: completed` (o, si da rate limit, confirmar directamente que el hash del bundle JS en `https://app.carossiovairolatti.com.ar/` cambió respecto al que estaba antes del push).

- [ ] **Step 3: Verificación final en producción**

Entrar a Fichadas → Configuración → "Horas extra fijas", elegir un empleado real, cargar un valor de prueba en un día (ej: 1 hora el lunes), guardar, y confirmar que no tira error. Si hay datos reales de Ludeña disponibles para ese mes, correr el cálculo en Resultados para un período que lo incluya y confirmar a ojo que sus horas extra son mayores a las de un empleado comparable sin horas fijas configuradas.
