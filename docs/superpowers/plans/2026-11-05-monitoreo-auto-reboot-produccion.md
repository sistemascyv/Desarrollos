# Monitoreo y auto-reinicio del servidor de producción Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un workflow de GitHub Actions que chequea cada 5 minutos si producción responde, y si deja de hacerlo durante ~10 minutos seguidos, reinicia el servidor solo (vía la API de AWS Lightsail) y deja aviso por email (un issue de GitHub) — sin que un humano tenga que estar mirando.

**Architecture:** Un workflow nuevo e independiente (`monitor-produccion.yml`), sin relación con `deploy.yml`/`deploy-staging.yml`. Toda la lógica de decisión (reintentos, cooldown, reinicio, aviso) vive en un único script de shell dentro de un step, usando `gh` CLI (issues) y `aws` CLI (reinicio), ambos preinstalados en los runners de GitHub-hosted. El estado de "¿ya reiniciamos hace poco?" se guarda como un issue abierto de GitHub en vez de inventar un mecanismo de estado nuevo.

**Tech Stack:** GitHub Actions (`schedule` + `workflow_dispatch`), `gh` CLI, AWS CLI v2, `aws-actions/configure-aws-credentials@v4`.

## Global Constraints

- Archivo nuevo: `.github/workflows/monitor-produccion.yml`. No se modifica `deploy.yml` ni `deploy-staging.yml`.
- Trigger: `schedule` cada 5 minutos (`cron: '*/5 * * * *'`) + `workflow_dispatch` (para poder probarlo a mano).
- `concurrency: { group: monitor-produccion, cancel-in-progress: false }` — el ciclo de reintentos puede tardar hasta ~6-7 minutos (dos esperas de 3 minutos), más que el intervalo del cron (5 minutos); sin esto, dos corridas podrían superponerse y evaluar la caída dos veces en paralelo. Con esto, una corrida nueva simplemente espera en cola a que termine la anterior en vez de correr en simultáneo — no es parte del spec original, es una corrección necesaria para que la lógica de cooldown funcione de verdad.
- `permissions: { issues: write }` declarado explícitamente a nivel workflow — el `GITHUB_TOKEN` automático no tiene permisos de escritura sobre issues a menos que se declare.
- Label fija para los incidentes: `incidente-servidor`. El workflow la crea sola si no existe (`gh label create --force`, idempotente) — no requiere que el usuario la cree a mano antes.
- Health check: `GET https://app.carossiovairolatti.com.ar/api/health`, hasta 3 intentos espaciados por 3 minutos (`sleep 180`) antes de considerar una caída real.
- Cooldown: si ya hay un issue abierto con la label `incidente-servidor` creado en la última hora, no se reinicia de nuevo — solo se comenta en el issue existente.
- Reinicio real: `aws lightsail reboot-instance --instance-name sistemascyv-produccion`, región `us-east-1`.
- **Fuera de alcance de este plan:** el aviso por WhatsApp (CallMeBot) — el usuario todavía no tiene la API key. Ese paso se agrega después, en una tarea separada, cuando la tenga. Este plan solo implementa el aviso por email (vía el issue de GitHub, que dispara la notificación de GitHub automáticamente).
- **Prerequisito manual, fuera de este repo, que el usuario tiene que hacer él mismo antes de que el workflow funcione:** crear un usuario de AWS IAM con permisos mínimos (solo `lightsail:RebootInstance`, idealmente restringido a la instancia `sistemascyv-produccion` puntual) y cargar sus credenciales como los secrets `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` en GitHub (Settings → Secrets and variables → Actions). Este plan no puede hacer eso por el usuario — ninguna tarea de este plan crea esas credenciales, solo las referencia por nombre.

---

### Task 1: Workflow de monitoreo y auto-reinicio

**Files:**
- Create: `.github/workflows/monitor-produccion.yml`

**Interfaces:**
- Consumes: secrets del repo `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (deben existir ya creados a mano por el usuario — ver prerequisito en Global Constraints); el `GITHUB_TOKEN` automático de GitHub Actions.
- Produces: nada que otra tarea de este plan consuma (es la única tarea funcional del plan).

- [ ] **Step 1: Crear `.github/workflows/monitor-produccion.yml`**

```yaml
name: Monitoreo de producción (auto-reinicio)

on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch: {}

concurrency:
  group: monitor-produccion
  cancel-in-progress: false

permissions:
  issues: write

jobs:
  monitorear:
    runs-on: ubuntu-latest
    steps:
      - name: Confirmar que gh y aws estan disponibles en el runner
        run: |
          gh --version
          aws --version

      - name: Configurar credenciales de AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Chequear salud del servidor y actuar si hace falta
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -u
          URL="https://app.carossiovairolatti.com.ar/api/health"
          LABEL="incidente-servidor"
          INSTANCIA="sistemascyv-produccion"

          gh label create "$LABEL" --color "d73a4a" --description "Incidente de caida del servidor de produccion" --force

          chequear_salud() {
            curl -fsS --max-time 10 "$URL" > /dev/null 2>&1
          }

          SANO=false
          if chequear_salud; then
            SANO=true
          else
            echo "Intento 1 fallo, esperando 3 minutos..."
            sleep 180
            if chequear_salud; then
              SANO=true
            else
              echo "Intento 2 fallo, esperando 3 minutos..."
              sleep 180
              if chequear_salud; then
                SANO=true
              else
                echo "Intento 3 fallo. Se considera caida real."
                SANO=false
              fi
            fi
          fi

          if [ "$SANO" = true ]; then
            echo "Servidor sano."
            ISSUE_ABIERTO=$(gh issue list --label "$LABEL" --state open --json number --jq '.[0].number // empty')
            if [ -n "$ISSUE_ABIERTO" ]; then
              echo "Cerrando issue #$ISSUE_ABIERTO (el servidor se recupero)."
              gh issue comment "$ISSUE_ABIERTO" --body "El servidor volvio a responder a las $(date -u +%Y-%m-%dT%H:%M:%SZ) UTC. Cerrando este incidente."
              gh issue close "$ISSUE_ABIERTO"
            fi
            exit 0
          fi

          echo "Servidor caido tras 3 intentos. Revisando si ya hay un incidente reciente..."
          CUTOFF=$(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ)
          ISSUES_JSON=$(gh issue list --label "$LABEL" --state open --json number,createdAt)
          RECIENTE=$(echo "$ISSUES_JSON" | jq -r --arg cutoff "$CUTOFF" 'map(select(.createdAt > $cutoff)) | .[0].number // empty')

          if [ -n "$RECIENTE" ]; then
            echo "Ya hay un incidente reciente (#$RECIENTE), no reinicio de nuevo (cooldown de 1 hora)."
            gh issue comment "$RECIENTE" --body "El servidor sigue sin responder a las $(date -u +%Y-%m-%dT%H:%M:%SZ) UTC. No se dispara un nuevo reinicio automatico porque ya hay un incidente abierto de la ultima hora."
            exit 0
          fi

          echo "No hay incidente reciente. Reiniciando la instancia..."
          aws lightsail reboot-instance --instance-name "$INSTANCIA"

          gh issue create \
            --title "Servidor de produccion caido - reinicio automatico disparado ($(date -u +%Y-%m-%d\ %H:%M) UTC)" \
            --label "$LABEL" \
            --body "El chequeo automatico de salud fallo 3 veces seguidas (unos 10 minutos) contra $URL. Se disparo un reinicio automatico de la instancia $INSTANCIA via la API de AWS Lightsail a las $(date -u +%Y-%m-%dT%H:%M:%SZ) UTC. Este issue se va a cerrar solo cuando el servidor vuelva a responder."
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/monitor-produccion.yml
git commit -m "CI: monitoreo de produccion con auto-reinicio y aviso por GitHub issue"
```

---

### Task 2: Verificación manual con `workflow_dispatch`

**Files:**
- Ninguno (solo verificación, no toca código).

**Interfaces:**
- Consumes: el workflow creado en Task 1.
- Produces: nada.

- [ ] **Step 1: Confirmar que las credenciales de AWS ya están cargadas**

Antes de disparar el workflow, confirmar con el usuario que ya creó el usuario IAM y cargó `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` como secrets del repo (prerequisito documentado en Global Constraints). Si todavía no lo hizo, el Step 2 de esta tarea va a fallar en el paso "Configurar credenciales de AWS" — en ese caso, avisarle exactamente qué falta y esperar a que lo complete antes de seguir.

- [ ] **Step 2: Disparar el workflow a mano, con el servidor sano**

Ir a la pestaña Actions del repo en GitHub → "Monitoreo de producción (auto-reinicio)" → "Run workflow" (botón de `workflow_dispatch`). Antes de hacerlo, confirmar que el servidor está sano en ese momento:

Run: `curl -s https://app.carossiovairolatti.com.ar/api/health`
Expected: `{"message":"API is healthy.","code":200,"data":{"canBackup":true}}`

- [ ] **Step 3: Revisar el resultado de la corrida**

Expected, revisando el log del job en GitHub Actions:
- El paso "Confirmar que gh y aws estan disponibles" imprime versiones sin error.
- El paso "Configurar credenciales de AWS" termina en verde (si falla acá, ver Step 1 de esta tarea).
- El paso principal detecta "Servidor sano" en el primer intento (sin esperar los 3 minutos), no crea ningún issue, no llama a `aws lightsail reboot-instance`, y el job termina en verde en menos de un minuto.
- Confirmar en la pestaña Issues del repo que no se creó ningún issue nuevo con la label `incidente-servidor`.

- [ ] **Step 4: Documentar la limitación de esta verificación**

**No se prueba el camino de "caída real" contra el servidor de producción** — hacerlo implicaría tumbar el servidor real a propósito solo para testear el workflow, lo cual no vale el riesgo. Queda como una limitación aceptada, no bloqueante: la lógica de ese camino (reintentos, cooldown, llamada a `aws lightsail reboot-instance`, creación del issue) fue revisada línea por línea en el código del Step 1 de Task 1, pero su comportamiento en un incidente real recién se confirma la próxima vez que el servidor efectivamente se caiga — que es exactamente el escenario para el que se construyó esto.

- [ ] **Step 5: Avisarle al usuario qué falta de su lado**

Recordarle al usuario, como cierre de esta tarea, que:
- Falta sumar el aviso por WhatsApp cuando tenga la API key de CallMeBot (fuera de alcance de este plan, tarea separada a futuro).
- El workflow ya está activo con el cron cada 5 minutos desde el momento en que este commit llegue a la rama de producción — no hace falta ningún paso adicional de su parte para que empiece a correr solo.

---

## Self-Review

**1. Cobertura del spec:** el trigger (`schedule` cada 5 minutos + `workflow_dispatch` agregado como mejora práctica), los 3 reintentos espaciados por 3 minutos, el cooldown vía issue reciente con la label fija, la creación del issue (dispara el email de GitHub) y su cierre automático al recuperarse, y el reinicio real vía `aws lightsail reboot-instance`, están todos en el Step 1 de Task 1. El prerequisito de las credenciales de AWS (que el plan no puede crear por el usuario) está documentado en Global Constraints y chequeado explícitamente en Task 2. La exclusión de WhatsApp está declarada en Global Constraints y no tiene ninguna tarea que la implemente — correcto, es justamente lo que se acordó dejar afuera.

**2. Placeholders:** ninguno — el YAML completo del workflow está en el plan, no resumido ni descrito en prosa.

**3. Consistencia de tipos:** no aplica tipos de lenguaje tipado acá (es un script de shell dentro de YAML), pero se revisaron los nombres usados de punta a punta: `$LABEL` ("incidente-servidor") es el mismo valor en la creación del label, en la búsqueda de issues, en el filtro de cooldown y en la creación del issue nuevo — no hay ninguna variante del nombre. `$INSTANCIA` ("sistemascyv-produccion") coincide exactamente con el nombre real de la instancia visto en la consola de AWS Lightsail (confirmado en capturas de pantalla anteriores de esta sesión).

**Riesgo identificado y resuelto durante la escritura de este plan:** el ciclo completo de reintentos puede tardar más que el intervalo del cron (hasta ~6-7 minutos de reintentos contra un cron de 5 minutos), lo que podría hacer que dos corridas se superpongan y evaluaran la misma caída en paralelo, rompiendo la lógica de cooldown. Se agregó `concurrency` al workflow (no estaba en el spec original) específicamente para evitar esto — las corridas se encolan en vez de correr en simultáneo.
