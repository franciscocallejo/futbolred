# FútbolRed · Fútbol escolar de Toledo

«Partidos y Tabla» incorpora un panel de la Diputación con grupos cadetes,
infantiles y grupos femeninos de categorías combinadas de Somos Deporte 3-18
para 2026/27. El grupo inicial es CM-01. La función consulta el portal al
solicitar una vista, con caché de 15 minutos en Netlify. Los datos de
competiciones almacenados en Supabase siguen disponibles en su panel habitual.

## Preparar una versión de prueba

Usa un despliegue con compilación de funciones, por ejemplo un repositorio
conectado a Netlify o Netlify CLI. La raíz de este paquete contiene
`netlify.toml`, `package.json` y `package-lock.json`. Netlify publica
`public` y empaqueta la función de `netlify/functions`. Usa Node.js 22
o posterior. No se necesitan claves adicionales para el portal provincial.

Antes de publicar, abre «Partidos y Tabla» en la URL de prueba y verifica
CM-01 e IM-01. Compara el calendario y los resultados de una jornada con el
portal de la Diputación. Comprueba también la clasificación y el cambio de
grupo. Si la función devuelve 502, consulta sus registros en Netlify.
Se verificaron calendario, resultados y clasificación de CM-01 contra el portal
oficial desde el entorno de desarrollo. Falta repetir la prueba desde Netlify.

La actualización se hace al consultar la sección. Esta versión no instala
una tarea diaria ni escribe en Supabase.
