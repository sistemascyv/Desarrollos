# Liquidación de sueldos mensual — Administrativos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Última pieza de la automatización de liquidación de sueldos: pantalla "Liquidación — Administrativos" (4ª pestaña de Sueldos) que calcula básico + horas extra reales del mes + antigüedad − descuentos = neto para legajos que NO son choferes.

**Architecture:** Reusa casi todo lo que ya existe: `procesarPeriodo` (Fichadas) para las horas extra reales del mes, una función nueva `calcularLiquidacionSueldoMensual` en `motor.ts` (misma mecánica que `calcularLiquidacionVacaciones`, sin prorrateo por día), y el mismo patrón visual que ya tiene `LiquidacionChoferesSub.tsx`. Solo hace falta una migración de permisos (4 colecciones de Fichadas que todavía no leía el módulo `sueldos`) y la pantalla nueva.

**Tech Stack:** React 19 + TypeScript + Vite, PocketBase. Sin tests automatizados de frontend.

## Global Constraints

- "Administrativo" = cualquier legajo de `fichadas_legajos` que NO esté vinculado desde `choferes.legajo` — no se agrega ningún campo nuevo para esto.
- `calcularLiquidacionSueldoMensual` NO prorratea por día (el básico ya es el sueldo completo del mes) y usa las horas extra REALES de ese mes (no un promedio de 6 meses).
- Misma fórmula de antigüedad (`calcularAntiguedadPctLiquidacion`, ya existe) y de valor de hora extra (`basico/24/8*1.5`) que ya usa `calcularLiquidacionVacaciones` — no reinventar.
- No incluye nada de ausentismo/presentismo ni cambios a `procesarPeriodo`/Fichadas.
- Sin tests automatizados de frontend — cada tarea termina con `cd web && npm run build` limpio + verificación manual. La verificación con datos REALES de fichadas de un mes concreto solo se puede confirmar en staging — no hay forma de simular esto localmente con certeza.

---

### Task 1: `calcularLiquidacionSueldoMensual` en motor.ts

**Files:**
- Modify: `web/src/pages/fichadas/motor.ts`

**Interfaces:**
- Consumes: `calcularAntiguedadPctLiquidacion(fechaAlta, anio)` (ya existe, línea ~709), tipo `FichadasCategoria` (ya importado en el archivo).
- Produces: `export interface LiquidacionSueldoMensual { basico: number; antiguedadPct: number; horasExtraMes: number; montoHorasExtra: number; montoAntiguedad: number; bruto: number; descuentoJubilacion: number; descuentoLey19032: number; descuentoObraSocial: number; descuentoAnsal: number; descuentoCuotaSindical: number; descuentoSeguroSepelio: number; totalDescuentos: number; neto: number; }` y `export function calcularLiquidacionSueldoMensual(params: { basico: number; fechaAlta: string | null | undefined; categoria: FichadasCategoria; horasExtraMes: number; anioMes: string }): LiquidacionSueldoMensual | null` — los consume la Task 3.

- [ ] **Step 1: Agregar la interfaz y la función**

En `web/src/pages/fichadas/motor.ts`, después del cierre de `calcularLiquidacionVacaciones` (busca la línea `}` que cierra esa función, justo antes del final del archivo — es la última función del archivo hoy), agregar:

```typescript

export interface LiquidacionSueldoMensual {
  basico: number;
  antiguedadPct: number;
  horasExtraMes: number;
  montoHorasExtra: number;
  montoAntiguedad: number;
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
// meses) + antigüedad − descuentos = neto. A diferencia de
// calcularLiquidacionVacaciones, acá el básico YA es el sueldo del mes
// completo -- no se prorratea por día ni se suma plus vacacional.
export function calcularLiquidacionSueldoMensual(params: {
  basico: number;
  fechaAlta: string | null | undefined;
  categoria: FichadasCategoria;
  horasExtraMes: number; // en HORAS, no minutos
  anioMes: string; // "YYYY-MM"
}): LiquidacionSueldoMensual | null {
  const { basico, fechaAlta, categoria, horasExtraMes, anioMes } = params;
  if (!fechaAlta) return null;
  const anio = Number(anioMes.slice(0, 4));
  const antiguedadPct = calcularAntiguedadPctLiquidacion(fechaAlta, anio);
  if (antiguedadPct === null) return null;

  const valorHoraExtra = (basico / 24 / 8) * 1.5;
  const montoHorasExtra = valorHoraExtra * horasExtraMes;
  const montoAntiguedad = (basico + montoHorasExtra) * (antiguedadPct / 100);
  const bruto = basico + montoHorasExtra + montoAntiguedad;

  const descuentoJubilacion = bruto * (categoria.pct_jubilacion / 100);
  const descuentoLey19032 = bruto * (categoria.pct_ley19032 / 100);
  const descuentoObraSocial = bruto * (categoria.pct_obra_social / 100);
  const descuentoAnsal = bruto * (categoria.pct_ansal / 100);
  const descuentoCuotaSindical = bruto * (categoria.pct_cuota_sindical / 100);
  const descuentoSeguroSepelio = bruto * (categoria.pct_seguro_sepelio / 100);
  const totalDescuentos = descuentoJubilacion + descuentoLey19032 + descuentoObraSocial + descuentoAnsal + descuentoCuotaSindical + descuentoSeguroSepelio;
  const neto = bruto - totalDescuentos;

  return {
    basico, antiguedadPct, horasExtraMes, montoHorasExtra, montoAntiguedad, bruto,
    descuentoJubilacion, descuentoLey19032, descuentoObraSocial, descuentoAnsal, descuentoCuotaSindical, descuentoSeguroSepelio,
    totalDescuentos, neto,
  };
}
```

- [ ] **Step 2: Build**

```bash
cd web && npm run build
```
Expected: limpio.

- [ ] **Step 3: Verificación manual (cálculo a mano)**

Con un ejemplo simple a mano (ej. `basico=1000000`, `fechaAlta='2020-01-01'`, `anioMes='2026-11'`, `horasExtraMes=10`, y una `categoria` de prueba con `pct_jubilacion=11, pct_ley19032=3, pct_obra_social=2.55, pct_ansal=0.45, pct_cuota_sindical=3, pct_seguro_sepelio=1.5`), confirmar a mano (calculadora) que:
- `antiguedadPct` = (2026-2020)+1 = 7
- `valorHoraExtra` = 1000000/24/8*1.5 = 7812.5
- `montoHorasExtra` = 7812.5*10 = 78125
- `montoAntiguedad` = (1000000+78125)*0.07 = 75468.75
- `bruto` = 1000000+78125+75468.75 = 1153593.75
- `totalDescuentos` = 1153593.75 * (11+3+2.55+0.45+3+1.5)/100 = 1153593.75*0.215 = 248022.65625
- `neto` = 1153593.75 - 248022.65625 = 905571.09375

Podés verificarlo rápido con un script descartable (`node -e "..."` o un archivo temporal en el scratchpad) que importe la lógica a mano (no hace falta compilar el módulo TS, alcanza con reproducir las cuentas) y comparar contra estos números. Si no coincide, hay un error en la fórmula del Step 1.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/fichadas/motor.ts
git commit -m "feat(sueldos): calcularLiquidacionSueldoMensual para administrativos"
```

---

### Task 2: Migración — permisos de lectura para "sueldos" sobre fichadas_marcas/novedades/empresas/legajo_historial

**Files:**
- Create: `pb_migrations/1789500000_liquidacion_administrativos_permisos.js`

**Interfaces:**
- Produces: lectura (list/view) de `fichadas_marcas`, `fichadas_novedades`, `fichadas_empresas`, `fichadas_legajo_historial` abierta también al módulo `sueldos`.

- [ ] **Step 1: Confirmar el estado real actual de las 4 colecciones**

```bash
grep -n "reglaConVacaciones\s*=" pb_migrations/1789460000_liquidacion_permisos_cruzados.js
```
Expected: `'@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones")'` — esta es la regla ACTUAL (list/view) de `fichadas_marcas` y `fichadas_novedades` (nadie la tocó después).

```bash
grep -n "reglaLecturaConPersonal\s*=" pb_migrations/1789470000_personal_modulo_propio.js
```
Expected: `'@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "personal")'` — esta es la regla ACTUAL (list/view) de `fichadas_empresas` y `fichadas_legajo_historial` (tienen "personal" de más que marcas/novedades, nadie las tocó después).

Si cualquiera de las 2 no coincide, parar y revisar qué migración posterior las cambió antes de seguir.

- [ ] **Step 2: Escribir la migración**

Crear `pb_migrations/1789500000_liquidacion_administrativos_permisos.js`:

```javascript
/// <reference path="../pb_data/types.d.ts" />
// Liquidación de sueldos — Administrativos (último sub-proyecto de la
// automatización de liquidación de sueldos, ver
// docs/superpowers/specs/2026-11-13-liquidacion-sueldos-administrativos-design.md).
// La pantalla nueva corre procesarPeriodo() (Fichadas) para un legajo
// puntual, así que necesita leer fichadas_marcas/fichadas_novedades/
// fichadas_empresas/fichadas_legajo_historial -- ninguna de las 4 tenía
// todavía "sueldos" como alternativa de lectura (fichadas_categorias,
// tramos, fichadas_legajos y fichadas_feriados ya lo tenían desde
// 1789480000/1789490000). Solo lectura, no se toca ninguna regla de
// escritura.
migrate((db) => {
  const dao = new Dao(db);

  const reglaMarcasNovedadesConSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "sueldos")';
  ['fichadas_marcas', 'fichadas_novedades'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaMarcasNovedadesConSueldos;
    collection.viewRule = reglaMarcasNovedadesConSueldos;
    dao.saveCollection(collection);
  });

  const reglaEmpresasHistorialConSueldos = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "personal" || @request.auth.modulos ~ "sueldos")';
  ['fichadas_empresas', 'fichadas_legajo_historial'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaEmpresasHistorialConSueldos;
    collection.viewRule = reglaEmpresasHistorialConSueldos;
    dao.saveCollection(collection);
  });

  return null;
}, (db) => {
  const dao = new Dao(db);

  const reglaMarcasNovedadesOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones")';
  ['fichadas_marcas', 'fichadas_novedades'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaMarcasNovedadesOriginal;
    collection.viewRule = reglaMarcasNovedadesOriginal;
    dao.saveCollection(collection);
  });

  const reglaEmpresasHistorialOriginal = '@request.auth.id != "" && (@request.auth.rol = "admin" || @request.auth.modulos ~ "fichadas" || @request.auth.modulos ~ "reportes" || @request.auth.modulos ~ "vacaciones" || @request.auth.modulos ~ "personal")';
  ['fichadas_empresas', 'fichadas_legajo_historial'].forEach((nombre) => {
    const collection = dao.findCollectionByNameOrId(nombre);
    collection.listRule = reglaEmpresasHistorialOriginal;
    collection.viewRule = reglaEmpresasHistorialOriginal;
    dao.saveCollection(collection);
  });

  return null;
})
```

- [ ] **Step 3: Verificar sintaxis**

```bash
node -c pb_migrations/1789500000_liquidacion_administrativos_permisos.js
```
Expected: sin salida.

- [ ] **Step 4: Levantar una instancia de prueba y correr la migración**

Reusar/crear una instancia de prueba, copiar `pb_migrations/*.js` + `pb_hooks/*.js` actuales, correr:
```bash
./pocketbase.exe migrate up
```
Expected: corre limpio, termina con "Applied 1789500000_liquidacion_administrativos_permisos.js migration".

- [ ] **Step 5: Probar en vivo los permisos de lectura**

Crear un usuario de prueba no-admin con `modulos: ["sueldos"]` solamente, autenticarlo, y confirmar con curl que puede LEER `fichadas_marcas`, `fichadas_novedades`, `fichadas_empresas` y `fichadas_legajo_historial` (GET a cada colección, esperar 200 con datos, no una lista vacía).

- [ ] **Step 6: Commit**

```bash
git add pb_migrations/1789500000_liquidacion_administrativos_permisos.js
git commit -m "feat(sueldos): permiso de lectura para marcas/novedades/empresas/historial"
```

---

### Task 3: Pantalla "Liquidación — Administrativos"

**Files:**
- Create: `web/src/pages/sueldos/LiquidacionAdministrativosSub.tsx`
- Modify: `web/src/pages/sueldos/SueldosPage.tsx`

**Interfaces:**
- Consumes: `calcularLiquidacionSueldoMensual` y `procesarPeriodo` (Task 1 y ya existente) de `../fichadas/motor`, colecciones `choferes`, `fichadas_legajos`, `fichadas_marcas`, `fichadas_novedades`, `fichadas_feriados`, `fichadas_empresas`, `fichadas_legajo_historial` (Task 2 abre el permiso que falta).
- Produces: pestaña nueva en `SueldosPage.tsx`.

- [ ] **Step 1: Crear `LiquidacionAdministrativosSub.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate, NOMBRES_MESES } from '../../lib/format';
import { procesarPeriodo, calcularLiquidacionSueldoMensual, type LiquidacionSueldoMensual } from '../fichadas/motor';
import type { Chofer, FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad, HistorialLegajo } from '../../types';

export function LiquidacionAdministrativosSub() {
  const toast = useToast();
  const now = useRef(new Date());
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [legajoId, setLegajoId] = useState('');
  const [anio, setAnio] = useState(String(now.current.getFullYear()));
  const [mes, setMes] = useState(String(now.current.getMonth() + 1).padStart(2, '0'));
  const [calculando, setCalculando] = useState(false);
  const [resultado, setResultado] = useState<LiquidacionSueldoMensual | null>(null);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [todos, choferes] = await Promise.all([
          pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ filter: 'estado = true', sort: 'nombre', expand: 'categoria' }),
          pb.collection('choferes').getFullList<Chofer>(),
        ]);
        const legajosDeChofer = new Set(choferes.map((c) => c.legajo).filter(Boolean));
        setLegajos(todos.filter((l) => !legajosDeChofer.has(l.id)));
      } catch (e) {
        toast('No se pudieron cargar los legajos: ' + (e instanceof Error ? e.message : ''), 'err');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function calcular() {
    if (!legajoId) { toast('Elegí un legajo.', 'warn'); return; }
    setCalculando(true);
    setResultado(null);
    setAviso('');
    try {
      const anioMes = anio + '-' + mes;
      const legajo = legajos.find((l) => l.id === legajoId);
      if (!legajo) { setAviso('Legajo no encontrado.'); return; }
      if (!legajo.fecha_alta) { setAviso('Este legajo no tiene fecha de alta cargada (Personal → Empleados).'); return; }
      if (!legajo.basico) { setAviso('Este legajo no tiene un básico cargado (Personal → Empleados).'); return; }
      const categoria = legajo.expand?.categoria;
      if (!categoria) { setAviso('Este legajo no tiene una categoría de convenio asignada (Personal → Empleados).'); return; }

      const diasDelMes = new Date(Number(anio), Number(mes), 0).getDate();
      const desde = anioMes + '-01';
      const hasta = anioMes + '-' + String(diasDelMes).padStart(2, '0');

      const [legajosTodos, marcas, novedades, feriados, empresas, historial] = await Promise.all([
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>(),
        pb.collection('fichadas_legajo_historial').getFullList<HistorialLegajo>(),
      ]);
      const legajosAjustados = legajosTodos.map((l) => ((l.estado || l.fecha_baja) ? l : { ...l, horas_extra_fijas: null }));
      const empresaNombrePorId = new Map(empresas.map((e) => [e.id, e.nombre]));
      const { resultados } = procesarPeriodo({
        legajos: legajosAjustados, marcas, novedades, feriados, historial, empresaNombrePorId, desde, hasta,
      });

      const minutosExtra = resultados.filter((r) => r.idLegajo === legajoId).reduce((acc, r) => acc + r.hE, 0);
      const horasExtraMes = minutosExtra / 60;

      const calc = calcularLiquidacionSueldoMensual({
        basico: legajo.basico, fechaAlta: legajo.fecha_alta, categoria, horasExtraMes, anioMes,
      });
      if (!calc) { setAviso('No se pudo calcular (revisá la fecha de alta del legajo).'); return; }
      setResultado(calc);
    } catch (e) {
      toast('No se pudo calcular la liquidación: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCalculando(false);
    }
  }

  return (
    <div className="card">
      <div className="hint">Básico + horas extra reales del mes + antigüedad − descuentos = neto. Solo legajos que no son choferes (los choferes se liquidan en la pestaña "Liquidación — Choferes").</div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="field" style={{ minWidth: 220 }}>
          <label>Legajo</label>
          <select value={legajoId} onChange={(e) => setLegajoId(e.target.value)}>
            <option value="">— elegir —</option>
            {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Mes</label>
          <select value={mes} onChange={(e) => setMes(e.target.value)}>
            {NOMBRES_MESES.map((label, i) => <option key={label} value={String(i + 1).padStart(2, '0')}>{label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Año</label>
          <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} style={{ width: 90 }} />
        </div>
        <button onClick={calcular} disabled={calculando || !legajoId}>{calculando ? 'Calculando…' : 'Calcular'}</button>
      </div>

      {aviso && <div className="hint" style={{ marginTop: 14, color: 'var(--warn)' }}>{aviso}</div>}

      {resultado && (
        <div style={{ marginTop: 16 }}>
          <div className="summary-grid summary-grid-compact" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="lbl">Básico</div><div className="val">{resultado.basico.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Horas extra ({resultado.horasExtraMes.toFixed(1)} hs)</div><div className="val">{resultado.montoHorasExtra.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Antigüedad ({resultado.antiguedadPct}%)</div><div className="val">{resultado.montoAntiguedad.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Bruto</div><div className="val">{resultado.bruto.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Neto</div><div className="val">{resultado.neto.toLocaleString('es-AR')}</div></div>
          </div>

          <h3 style={{ fontSize: 13, color: 'var(--navy)' }}>Descuentos</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Concepto</th><th className="num">Monto</th></tr></thead>
              <tbody>
                <tr><td>Jubilación</td><td className="num">{resultado.descuentoJubilacion.toLocaleString('es-AR')}</td></tr>
                <tr><td>Ley 19032</td><td className="num">{resultado.descuentoLey19032.toLocaleString('es-AR')}</td></tr>
                <tr><td>Obra Social</td><td className="num">{resultado.descuentoObraSocial.toLocaleString('es-AR')}</td></tr>
                <tr><td>ANSSAL</td><td className="num">{resultado.descuentoAnsal.toLocaleString('es-AR')}</td></tr>
                <tr><td>Cuota Sindical</td><td className="num">{resultado.descuentoCuotaSindical.toLocaleString('es-AR')}</td></tr>
                <tr><td>Seguro de Sepelio</td><td className="num">{resultado.descuentoSeguroSepelio.toLocaleString('es-AR')}</td></tr>
                <tr><td><strong>Total descuentos</strong></td><td className="num"><strong>{resultado.totalDescuentos.toLocaleString('es-AR')}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

Nota: `isoDate` se importa pero no se termina usando en este componente (los rangos de fecha se arman con strings directo) — si `npm run build` marca el import como no usado (TypeScript con `noUnusedLocals`), sacar `isoDate` del import en el Step 4 de abajo.

- [ ] **Step 2: Conectar la pestaña en `SueldosPage.tsx`**

Reemplazar `web/src/pages/sueldos/SueldosPage.tsx` completo por:

```tsx
import { useState } from 'react';
import { CategoriasSub } from './CategoriasSub';
import { TarifasViajeSub } from './TarifasViajeSub';
import { LiquidacionChoferesSub } from './LiquidacionChoferesSub';
import { LiquidacionAdministrativosSub } from './LiquidacionAdministrativosSub';

type Vista = 'categorias' | 'tarifas' | 'liquidacion_choferes' | 'liquidacion_administrativos';

export function SueldosPage() {
  const [vista, setVista] = useState<Vista>('categorias');

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Sueldos</h2>
        <div className="hint">Categorías de convenio, tarifas de viaje y liquidación mensual.</div>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className={vista === 'categorias' ? 'small' : 'small secondary'} onClick={() => setVista('categorias')}>Categorías de convenio</button>
          <button type="button" className={vista === 'tarifas' ? 'small' : 'small secondary'} onClick={() => setVista('tarifas')}>Tarifas de viaje</button>
          <button type="button" className={vista === 'liquidacion_choferes' ? 'small' : 'small secondary'} onClick={() => setVista('liquidacion_choferes')}>Liquidación — Choferes</button>
          <button type="button" className={vista === 'liquidacion_administrativos' ? 'small' : 'small secondary'} onClick={() => setVista('liquidacion_administrativos')}>Liquidación — Administrativos</button>
        </div>
      </div>

      {vista === 'categorias' && <CategoriasSub />}
      {vista === 'tarifas' && <TarifasViajeSub />}
      {vista === 'liquidacion_choferes' && <LiquidacionChoferesSub />}
      {vista === 'liquidacion_administrativos' && <LiquidacionAdministrativosSub />}
    </main>
  );
}
```

- [ ] **Step 3: Build**

```bash
cd web && npm run build
```
Expected: limpio. Si `tsc` marca `isoDate` como import no usado en `LiquidacionAdministrativosSub.tsx`, sacarlo del import (`import { NOMBRES_MESES } from '../../lib/format';`) y volver a buildear.

- [ ] **Step 4: Verificación manual (con datos reales en staging)**

Entrar a Sueldos → confirmar que ahora hay 4 pestañas, con "Liquidación — Choferes" en vez de "Liquidación mensual". En "Liquidación — Administrativos": confirmar que el selector de legajo NO incluye a ningún chofer ya vinculado (comparar contra la lista de Administración → Choferes). Elegir un legajo administrativo real con fichadas de un mes concreto y un mes con marcas reales, calcular, y confirmar que básico/horas extra/antigüedad/descuentos/neto tienen sentido (cruzar a mano contra lo que ya muestra Fichadas → Resultados → Horas Extra para ese legajo y mes). Probar también un legajo sin fecha_alta/básico/categoría y confirmar que aparece el aviso correspondiente.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/sueldos/LiquidacionAdministrativosSub.tsx web/src/pages/sueldos/SueldosPage.tsx
git commit -m "feat(sueldos): pantalla de liquidacion mensual de administrativos"
```

## Self-Review

**1. Cobertura del spec:** fórmula sin prorrateo por día con horas reales del mes ✅ (Task 1), "administrativo" derivado de `choferes.legajo` sin campo nuevo ✅ (Task 3 Step 1), permisos de las 4 colecciones ✅ (Task 2), pestaña nueva + renombre de la 3ª ✅ (Task 3 Step 2), avisos ante datos faltantes ✅ (Task 3), reuso de `procesarPeriodo` sin tocar Fichadas ✅.

**2. Placeholders:** ninguno.

**3. Consistencia de tipos:** `LiquidacionSueldoMensual` se define en `motor.ts` (Task 1) y se consume igual en `LiquidacionAdministrativosSub.tsx` (Task 3) — mismos 13 campos en ambos lugares.

## Ejecución

Plan completo y guardado en `docs/superpowers/plans/2026-11-13-liquidacion-sueldos-administrativos.md`.

**1. Subagent-Driven (recomendado)** - despacho un subagente por tarea, reviso entre tareas.

**2. Inline Execution** - lo ejecuto yo mismo en esta sesión.

¿Cuál preferís?
