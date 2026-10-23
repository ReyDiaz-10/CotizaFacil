# CotizaFácil

Aplicación para que técnicos organicen trabajos y preparen cotizaciones para sus clientes.

## Funciones actuales

- Inicio de sesión y registro de técnicos con contraseña protegida.
- Acceso por nombre de usuario; el correo solo se solicita al pedir la suscripción.
- Saludo por nombre de pila y perfil editable con negocio y oficio.
- Plan gratuito: hasta dos alternativas de cotización guardadas por cuenta.
- Plan técnico: $30.000 COP por 30 días. El pago es manual en esta versión; el administrador revisa el comprobante y activa el plan desde su panel.
- Panel privado de administración con cuentas, trabajos, cotizaciones, solicitudes de pago, activación/baja y permisos para IA.
- Centro de ayuda con preguntas frecuentes y canales de soporte configurables desde el panel: correo, WhatsApp y redes sociales opcionales. Al guardar se actualizan los enlaces públicos de la app.
- El panel muestra un registro de inicios de sesión, cambios de permisos, activaciones, bajas y restablecimientos de contraseña con fecha y hora.
- Hay dos acciones de baja independientes: cancelar solo el plan (conserva el acceso gratis) o cancelar el acceso completo al portal (invalida las sesiones activas).
- La campana muestra solicitudes, avisos de vencimiento, activaciones y decisiones sobre continuidad. El plan dura 30 días; sin continuidad programada, vence y vuelve al nivel gratis. El admin puede programar la continuidad solo durante las 48 horas anteriores y cancelarla con un motivo que se registra, aparece en la web y se envía por correo.
- El administrador configura titular, cuenta bancaria, llave y, opcionalmente, una imagen QR desde el panel. El QR solo se muestra al técnico si se cargó uno.
- Los técnicos pueden abrir el portal de suscripción desde su perfil, enviar el comprobante y administrar sus cotizaciones guardadas.
- Solicitudes de suscripción notificadas al administrador por correo cuando SMTP está configurado; el panel permite revisar y enviar un comprobante informativo al técnico.
- Recordatorio automático por correo dos días antes del vencimiento mientras el servidor esté encendido.
- Registro local en `backend/data/free_users.json` y `backend/data/subscribed_users.json`; los trabajos se guardan en archivos individuales dentro de `backend/data/workspaces/`.
- Gemini redacta el alcance indicado por el técnico; el precio y la duración los confirma el técnico.
- Creación de logotipo con instrucciones en el perfil. El logo acompaña las descargas PDF, Word y Excel.
- Búsqueda web de oportunidades recientes para el oficio del técnico en Medellín y el Valle de Aburrá; el permiso se administra por técnico desde el panel. Muestra páginas citadas por Gemini Search y abre cada fuente en una pestaña nueva. Límite predeterminado: 3 búsquedas iniciadas por usuario y día.
- Descarga de cotizaciones PDF, Word, Excel, texto y ZIP; compartir por WhatsApp, correo y texto.

## Configuración en Windows CMD

Desde la carpeta raíz, ejecuta cada línea por separado:

```cmd
cd backend
py -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
copy .env.example .env
notepad .env
```

En `backend/.env`, configura `ADMIN_USERNAME` y `ADMIN_PASSWORD`. También puedes guardar la clave de Google AI Studio desde **Panel de administración → Configurar proveedor**; no la compartas por chat ni la pongas en el repositorio. El panel permite elegir Ollama local, Gemini u otra API compatible, guardar la configuración y probar la conexión antes de usarla. La clave escrita en el panel se guarda en `backend/data/ai_settings.json`, archivo excluido de Git. Para avisos y comprobantes por correo, pega en `MAIL_APP_PASSWORD` una contraseña de aplicación del correo administrador (o especifica otra dirección en `MAIL_USER`); nunca uses ni compartas la contraseña normal de tu correo.

La redacción de cotizaciones usa el proveedor y el modelo probados desde el panel. Ollama ejecuta modelos localmente y requiere que el servicio esté activo en el equipo donde corre el backend. La búsqueda web y los logotipos con IA requieren seleccionar Gemini y configurar una clave; la disponibilidad y el costo dependen del nivel de facturación habilitado en Google AI Studio. La búsqueda está limitada por defecto a tres solicitudes por técnico al día (`OPPORTUNITY_DAILY_LIMIT`). Verifica los límites y posibles cobros del modelo antes de habilitarlo para muchos usuarios.

Arranca desde la carpeta `backend`:

```cmd
python -m uvicorn app.main:app --reload
```

Abre `http://127.0.0.1:8000`. Para entrar como administrador utiliza `ADMIN_USERNAME` y `ADMIN_PASSWORD` configurados en `.env`. El panel se abre en el menú lateral.

## Almacenamiento y límites

- Los JSON de cuentas y archivos de trabajos se crean en `backend/data/` al usar la app. Git ignora esa carpeta para no subir datos personales.
- Si se configuran `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, cuentas, trabajos, notificaciones, auditoría y ajustes se guardan en Supabase Postgres; QR, comprobantes y logotipos van al bucket privado `cotizafacil-private`. El modo local sigue funcionando si las dos variables están vacías.
- Las contraseñas de técnicos se guardan como hashes; las sesiones usan cookies HTTP-only.
- El admin puede restablecer contraseñas de técnicos y desactivar/reactivar sus cuentas. Las acciones quedan registradas en `backend/data/audit_log.jsonl`.
- La suscripción se habilita por 30 días desde la aprobación manual en el panel. Al vencer, la cuenta vuelve al límite gratuito.
- Al iniciar la app se crea, si todavía no existe, la cuenta de demostración definida por `DEMO_TECH_USERNAME`, `DEMO_TECH_PASSWORD`, `DEMO_TECH_FIRST_NAME` y `DEMO_TECH_TRADE` en tu `.env` local. Cambia su contraseña después de probarla o elimina esas variables.
- Los usuarios pueden solicitar el plan y dejar una referencia de pago. Verifica el pago fuera de la aplicación antes de pulsar **Confirmar pago y activar**.
- El panel permite previsualizar y enviar por correo un comprobante informativo; todavía no es una factura electrónica validada por la DIAN.
- El logo con IA usa la API de Gemini configurada en el servidor y se limita a una generación por cuenta cada 30 días.

## Supabase y publicación en Render

La integración está preparada en `backend/app/cloud.py`, `backend/supabase/schema.sql` y `render.yaml`. La app usa una tabla privada JSONB para conservar el formato actual de los datos, y Supabase Storage privado para imágenes. La clave `SUPABASE_SERVICE_ROLE_KEY` se usa solo desde el servidor. No la pegues en `app.js`, no la compartas por chat y no la subas a GitHub.

1. Crea un proyecto en Supabase y ejecuta `backend/supabase/schema.sql` desde el SQL Editor.
2. Copia la URL del proyecto y su clave `service_role` desde el panel de Supabase. Guárdalas como `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `backend/.env` para migrar localmente. Conserva el archivo fuera de Git.
3. Con el servidor local detenido, desde `backend` ejecuta `python scripts/migrate_json_to_supabase.py` para ver cuántos registros e imágenes se migrarían. Si la vista previa coincide con lo esperado, ejecuta `python scripts/migrate_json_to_supabase.py --apply`. La migración no sube la clave de Gemini; guárdala otra vez desde el panel después del despliegue. Mantén una copia local de `backend/data` hasta comprobar el resultado.
4. En Render, crea un Blueprint desde este repositorio y selecciona `render.yaml`. Añade los valores `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` y `GEMINI_API_KEY` cuando Render los solicite. Nunca uses la clave de Supabase en el navegador. El blueprint usa el plan gratuito, por lo que el servidor puede tardar en despertar tras inactividad; CotizaFácil deja un recordatorio de esa limitación en la campana de administración.
5. Render asigna una dirección `onrender.com` al servicio. Para un dominio propio tendrás que registrar el dominio y conectarlo desde Render mediante los registros DNS que muestre el panel; no se compra ni se configura un dominio personalizado automáticamente.

La integración en la nube no se activa en esta copia local hasta que existan esas dos variables de Supabase y se haya creado la tabla y el bucket. La migración es manual y re-ejecutable: usa `upsert`, así que detén la app antes para evitar que cambien los datos mientras se copian.

## Importante antes de publicar en internet

La app todavía requiere configurar el proyecto Supabase, aplicar el esquema, completar la migración, cargar las variables privadas en Render y verificar el despliegue antes de abrirla a técnicos. Antes de uso público también conviene añadir verificación de correo, límites antiabuso y copias de seguridad.

Los recordatorios por SMS aún no están conectados: requieren una cuenta de mensajería, consentimiento del cliente y un servicio programado que siga activo cuando el técnico cierre la página. Los recordatorios por correo de suscripción también dependen de que SMTP esté configurado y el servidor permanezca encendido. Para el piloto, usa WhatsApp y correo; decide el proveedor y el costo de SMS antes de incluirlo en el plan mensual.

### Ollama local en Windows

Ollama sirve para desarrollar y probar CotizaFácil en el mismo PC. Instálalo desde CMD con `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://ollama.com/install.ps1 | iex"`, vuelve a abrir CMD y ejecuta `ollama pull qwen3:4b`. En **Panel de administración → Configurar proveedor**, selecciona Ollama, dirección `http://localhost:11434`, modelo `qwen3:4b`, deja vacía la clave y pulsa **Probar conexión** antes de guardar. Consulta todos los pasos y la alternativa `qwen3:1.7b` en `INSTRUCCIONES_COTIZAFACIL.txt`.

Ollama local solo funciona cuando el servidor de CotizaFácil corre en ese mismo computador. En Render, `localhost` apunta al servidor Render, así que no llega a tu PC; para la web publicada configura Gemini u otro proveedor alojado. No expongas directamente el puerto local de Ollama a internet.
