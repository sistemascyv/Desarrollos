# Instalador de un clic para Bot Tarifas — diseño

## Contexto y problema

Hoy, para usar el botón "Actualizar tarifas" en una PC nueva, hace falta
instalar el conector a mano: copiar la carpeta `BOT ACT TARIFAS`, tener
Python instalado, armar el `venv` ahí mismo, copiar/crear el `.env`, y
correr `registrar_protocolo.ps1`. Esto ya falló una vez en una PC con
Windows 8.1 — el `venv` de la carpeta original está armado para la PC de
Sistemas y copiarlo tal cual a otra máquina no funciona, sin ningún error
visible (el mismo patrón de falla silenciosa que ya se investigó y
corrigió varias veces en este proyecto).

## Objetivo

Un botón **"Descargar instalador"** en la pantalla de Actualizar Tarifas
que baja un único `.exe`. Doble clic en la PC nueva, sin pedir nada más,
y queda todo instalado y funcionando.

## Cambio de arquitectura clave

Hoy el protocolo `bottarifas://` está registrado apuntando a
`pythonw.exe` + `bot_runner.py`, usando el `venv` de esa carpeta — esa es
la parte que no es portable entre PCs. El instalador nuevo compila
`bot_runner.py` (que ya importa `bot_login.py`) a un ejecutable real con
PyInstaller — mismo sistema que ya usa `bot_gui_moderno.exe` y ya está
probado funcionando en producción — así la PC de destino **no necesita
tener Python instalado en absoluto**. Esto elimina de raíz la clase de
bug que rompió en Windows 8.1, no solo para esa PC sino para cualquier PC
nueva de acá en adelante.

## Fuera de alcance

- No se toca el flujo actual de la PC de Sistemas (sigue usando su
  `venv` como hasta ahora) — el instalador es para PCs nuevas.
- No se migra `bot_gui_moderno.exe` (el ejecutable standalone con
  ventana propia) a este esquema — sigue como está, es un flujo distinto
  (uso manual, no disparado desde la web).
- No se pide confirmación ni credenciales al usuario durante la
  instalación — vienen incluidas en el `.exe` (confirmado con el
  usuario).

## Un ajuste necesario en `bot_login.py`

Al escribir este diseño se encontró que, al compilar con PyInstaller,
`os.path.dirname(os.path.abspath(__file__))` — que hoy ancla la carpeta
de logs a la ubicación real del script (arreglo de un bug anterior en
este mismo proyecto) — **no resuelve correctamente la ubicación real del
`.exe`** dentro de un módulo empaquetado: apunta a una ruta sintética
dentro del paquete, no a la carpeta real donde vive el ejecutable. La
forma correcta de saber "dónde estoy" en una app congelada con PyInstaller
es `os.path.dirname(sys.executable)`.

Ajuste mínimo y retrocompatible en `bot_login.py` (no cambia nada para el
flujo actual por `venv`, que sigue usando `__file__` exactamente como
hoy):

```python
if getattr(sys, "frozen", False):
    carpeta_bot = os.path.dirname(sys.executable)
else:
    carpeta_bot = os.path.dirname(os.path.abspath(__file__))
```

El mismo criterio aplica a la carga del `.env` (`load_dotenv()`): hay que
pasarle la ruta explícita (`load_dotenv(os.path.join(carpeta_bot,
".env"))`) en vez de dejar que la busque sola, por la misma razón.

## El instalador

Un segundo ejecutable chico, compilado aparte (`instalador.py`), que
lleva empaquetada la carpeta ya compilada de `bot_runner` (PyInstaller
"onedir", no "onefile" — un `.exe` de un solo archivo se autoextrae a una
carpeta temporal en cada arranque, lo que rompería el mismo anclaje de
rutas de arriba una vez instalado; el ejecutable instalado tiene que
vivir en una carpeta real y fija). El instalador en sí **sí** es
"onefile" — es la única entrega, se descarga una sola vez y se corre una
sola vez, no importa la demora de autoextracción para ese caso puntual.

Al ejecutarse, `instalador.py`:

1. Copia la carpeta empaquetada de `bot_runner` a
   `%LOCALAPPDATA%\BotTarifas\` (no hace falta ser administrador de esa
   PC — mismo criterio ya usado para el registro del protocolo hoy).
2. Escribe `%LOCALAPPDATA%\BotTarifas\.env` con las credenciales
   `BOT_TARIFAS_USER`/`BOT_TARIFAS_PASS`, que ya vienen fijas dentro del
   código del instalador (no se piden ni se leen de ningún otro lado).
3. Registra `bottarifas://` en `HKCU\Software\Classes` apuntando a la
   ruta absoluta ya resuelta (ej. `C:\Users\<usuario>\AppData\Local\
   BotTarifas\bot_runner\bot_runner.exe "%1"` — Python resuelve
   `%LOCALAPPDATA%` a su valor real vía `os.environ["LOCALAPPDATA"]`
   antes de escribir la clave; el registro no expande variables de
   entorno en un valor `REG_SZ` común, así que hay que guardar la ruta ya
   expandida, no el texto literal `%LOCALAPPDATA%` — mismo criterio que
   ya usa `registrar_protocolo.ps1` hoy, que también escribe la ruta
   absoluta ya resuelta) — usando el módulo `winreg` de Python
   directamente (sin llamar a
   PowerShell ni a ningún script externo).
4. Muestra un cartel de Windows simple (`ctypes.windll.user32.MessageBoxW`,
   de la librería estándar, sin agregar ninguna dependencia nueva)
   confirmando "Instalación completa — ya podés usar Actualizar Tarifas
   desde Sistema CyV en esta PC", o el error puntual si algo falla (por
   ejemplo, no se pudo escribir en `%LOCALAPPDATA%`).

## Dónde se sirve el instalador

El `.exe` compilado se guarda en `web/public/instalador_bot_tarifas.exe`
del repo de Sistema CyV — ese directorio ya se copia tal cual dentro de
`web/dist/` en cada build (mismo mecanismo que ya usan `favicon.ico`,
etc.), y `web/dist/` se sincroniza a `pb_public/` en cada deploy **sin**
`--delete`, así que un archivo puesto ahí persiste entre deploys sin
necesitar ningún cambio en el pipeline de CI. Queda servido en
`https://<dominio>/instalador_bot_tarifas.exe`.

Como el instalador se compila con PyInstaller (fuera de este repo, en la
carpeta `BOT ACT TARIFAS` del escritorio, igual que `bot_gui_moderno.exe`
hoy), el flujo para actualizarlo es manual: compilar ahí, copiar el
`.exe` resultante a `web/public/` en el repo de Sistema CyV, commitear y
desplegar — no hay build automático de Python en este repo.

## Frontend

En `web/src/pages/tarifas/BotTarifasPage.tsx`, un botón chico y
secundario arriba del botón principal "Actualizar tarifas":

```
¿Primera vez en esta PC? [Descargar instalador]
```

visible siempre (no solo cuando falla algo), enlazando directo a
`/instalador_bot_tarifas.exe` con el atributo `download`.

## Testing

- Compilar `bot_runner` (onedir) y el instalador (onefile) en la PC de
  Sistemas y correr el instalador ahí mismo apuntando a una carpeta de
  instalación de prueba (no `%LOCALAPPDATA%\BotTarifas\` real, para no
  pisar el conector que ya funciona ahí) — confirmar que copia los
  archivos, escribe el `.env`, y que el `.exe` instalado corre y escribe
  su log en la carpeta correcta (la prueba puntual que ya existe,
  `test_logs_ruta.py`, sirve de referencia para qué comportamiento
  verificar, pero apuntado al build congelado, no al script).
- Si hay forma de probarlo en una segunda PC de verdad (la de Windows
  8.1, u otra sin Python instalado), es la prueba más representativa del
  problema real que esto resuelve — hacerla si es posible antes de dar
  el instalador por terminado.
