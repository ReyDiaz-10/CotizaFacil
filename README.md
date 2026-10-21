# CotizaFácil

Primera capa de la aplicación para organizar trabajos y preparar alternativas de cotización que un técnico puede compartir desde distintos canales.

## Ejecutar

Abre `index.html` en un navegador moderno. La app no requiere instalar paquetes ni configurar servicios y guarda los datos localmente en ese navegador.

## Incluido en este incremento

- Crear un trabajo con cliente, oficio, fecha y duración estimada.
- Preparar varias alternativas para el mismo trabajo, cada una con precio, días y alcance.
- Guardar, buscar y filtrar trabajos.
- Compartir una alternativa mediante WhatsApp, correo, texto copiable o impresión/guardar como PDF.
- Interfaz adaptable a móvil y escritorio.

## Límites de esta capa

Los datos viven en `localStorage` del navegador, no en una cuenta o servidor. El enlace de WhatsApp abre el compositor de mensajes y el usuario confirma el envío. Las cotizaciones compartidas desde esta primera capa contienen el texto en el mensaje; un enlace público que el cliente pueda abrir requiere la siguiente capa: API, base de datos y alojamiento. El estado de seguimiento es básico y se puede cambiar haciendo doble clic sobre la fila del trabajo.

## Siguiente capa recomendada

1. Repositorio y documentación de decisiones.
2. API FastAPI y modelos SQL para usuarios, trabajos y cotizaciones.
3. Vínculos públicos de lectura para compartir cotizaciones.
4. Inicio de sesión, copias de seguridad y despliegue.
5. Asistencia de IA opcional para mejorar el texto de las propuestas.
