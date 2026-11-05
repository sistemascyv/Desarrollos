# Monitoreo y auto-reinicio del servidor de producción — Diseño

**Contexto:** El 2026-11-05 el servidor de producción (AWS Lightsail, instancia `sistemascyv-produccion`) dejó de responder por completo (memoria agotada por el servicio `fwupd`, ya desactivado, más 2GB de swap agregados como mitigación). La única forma de recuperarlo fue que el usuario entrara a mano a la consola de AWS y lo reiniciara. El usuario planteó el riesgo real: si vuelve a pasar y él no está disponible (ej. de vacaciones), nadie se entera ni actúa. Este spec agrega una red de seguridad automática para ese escenario — no reemplaza arreglar la causa raíz cuando se pueda identificar, es un respaldo para cuando (no si) algo inesperado vuelva a tumbar el servidor.

## Decisión de alcance

Se investigó antes de proponer nada:
- La API de AWS Lightsail expone una acción de reinicio simple y documentada (`RebootInstance`, invocable por CLI con `aws lightsail reboot-instance --instance-name <nombre>`) — confirma que automatizar el reinicio es técnicamente viable.
- Un watchdog de hardware dentro del servidor (la alternativa "a prueba de kernel totalmente trabado") **no es confiable en una VM administrada como esta** — las nubes como Lightsail generalmente no exponen ese dispositivo al sistema operativo invitado. Se descarta como solución principal.
- Dado que si el servidor está colgado nada que corra adentro de él mismo puede reaccionar, el chequeo tiene que ser **externo**. El lugar natural, dado que el proyecto ya usa GitHub Actions para toda su infraestructura (deploys, CI), es un workflow nuevo con trigger `schedule`.

Confirmado con el usuario: reinicio automático (no solo aviso) + notificación por **email y WhatsApp**.

## Arquitectura

**Workflow nuevo:** `.github/workflows/monitor-produccion.yml`, independiente de `deploy.yml`/`deploy-staging.yml`, con `on: schedule` cada 5 minutos (`cron: '*/5 * * * *'`).

**Lógica de cada corrida (un solo job, sin estado entre pasos de la misma corrida más que lo normal del shell):**
1. Pedir `GET https://app.carossiovairolatti.com.ar/api/health`. Si responde `200`, terminar ahí (todo bien, nada que hacer) — y si existe un issue abierto de "servidor caído" de una corrida anterior, cerrarlo con un comentario de que se recuperó (usando `gh issue list`/`gh issue close` con el `GITHUB_TOKEN` que ya tiene cada workflow de este repo).
2. Si falla, esperar 3 minutos y reintentar. Si falla de nuevo, esperar 3 minutos más y reintentar una tercera vez. Recién si las **3 veces seguidas** (~10 minutos en total) fallan, se considera una caída real — esto evita que una falla de red momentánea entre el runner de GitHub y el servidor (que no tiene nada que ver con la salud real del servidor) dispare un reinicio innecesario.
3. Antes de reiniciar: chequear si ya existe un issue abierto de "servidor caído" creado en la última hora (vía `gh issue list` filtrando por label y fecha). Si existe, **no reiniciar de nuevo** — evita un bucle de reinicios si el problema es persistente y no se resuelve solo con un reinicio. Solo se deja constancia (comentario en el issue existente).
4. Si no hay un issue reciente: reiniciar el servidor (`aws lightsail reboot-instance --instance-name sistemascyv-produccion`), y crear un issue nuevo en el repo (título tipo "🔴 Servidor de producción caído — reinicio automático disparado", con la hora y qué se intentó) con una label fija (ej. `incidente-servidor`) para poder filtrarlo en el paso 1/3 de corridas futuras.
5. Mandar el aviso de WhatsApp (ver abajo) con el mismo mensaje resumido, tanto si se reinició como si se omitió por el cooldown del paso 3.

**Por qué el email no necesita nada nuevo:** crear el issue de GitHub ya dispara la notificación por correo de GitHub al dueño del repo (comportamiento por defecto de GitHub para issues nuevos en repos que uno mira) — no hace falta configurar SMTP ni ningún servicio de correo aparte.

**WhatsApp vía CallMeBot:** servicio gratuito para uso personal (confirmado antes de proponerlo). El usuario hace un opt-in único (manda un mensaje de WhatsApp fijo al número de CallMeBot) y recibe una API key. El workflow manda el aviso con un `curl` a `https://api.callmebot.com/whatsapp.php?phone=...&text=...&apikey=...`.

## Credenciales nuevas (secrets del repo)

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`: de un usuario de AWS IAM **nuevo, con permisos mínimos** — únicamente `lightsail:RebootInstance` (y `lightsail:GetInstanceState` si hace falta para alguna verificación) sobre la instancia `sistemascyv-produccion` puntual, no credenciales de administrador. Separado de cualquier otra credencial que ya exista en el repo (que son todas SSH, no de API de AWS).
- `CALLMEBOT_PHONE` / `CALLMEBOT_APIKEY`: obtenidos del opt-in de WhatsApp que hace el usuario una sola vez.

## Fuera de alcance

- No se toca la causa raíz de por qué el servidor podría colgarse en el futuro (eso se resuelve caso por caso cuando pase, como se hizo hoy con `fwupd`) — este spec es la red de seguridad, no la prevención.
- No se agrega monitoreo de métricas (memoria, CPU, disco) más allá del health check HTTP existente — si en el futuro se quiere ver tendencias antes de que algo se caiga del todo, es un proyecto aparte.
- No se cambia nada de los workflows de deploy existentes (`deploy.yml`, `deploy-staging.yml`) — el monitoreo es un workflow completamente separado e independiente.
- El límite de "no más de un reinicio automático por hora" se implementa con la existencia de un issue reciente, no con un mecanismo de cooldown más sofisticado — suficiente para el caso de uso, sin agregar infraestructura extra (ej. una base de datos o un servicio de estado separado).
