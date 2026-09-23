# Reglas comunes para las tareas de sección (B, C y D)

Proyecto: `C:\Users\danie\Repositories\Computo en la nube\presentacion-iaas-paas-saas`

La BASE ya existe (motor, sistema visual, componentes y la sección 0 de referencia).
Tres agentes trabajan **al mismo tiempo**, cada uno en una sección distinta.

## Antes de escribir código, lee completos
1. `docs/BRIEF.md` — arquitectura, contrato del motor, dirección visual, reglas.
2. `docs/COMPONENTES.md` — catálogo real de componentes y API del motor (manda sobre el BRIEF si difieren).
3. `docs/GUION.md` — solo la sección que te toca: son los textos exactos y verificados.
4. La sección 0 como referencia de calidad: `src/slides/00-inicio.html`, `src/css/sections/s0-inicio.css`,
   `src/js/sections/s0-inicio.js`. Tu sección debe verse del mismo nivel o mejor, y coherente con ella.

## Reglas
- Edita **solo** los 3 archivos de tu sección (y capturas en `docs/capturas/<tu-prefijo>-*.png`).
  No toques archivos compartidos (`template.html`, `base.css`, `components.css`, `deck.js`,
  `build.mjs`, `config.js`) ni los de otras secciones. Si necesitas algo que la base no tiene,
  resuélvelo en tus archivos con tu prefijo y menciónalo en tu reporte final.
- Usa los componentes existentes antes de inventar nuevos. Clases propias con tu prefijo; JS en IIFE
  usando `Deck.onSlide`.
- Textos: los del GUION. No cambies datos, cifras ni nombres de servicios. Español correcto con acentos.
- Animaciones con propósito (explican algo, guían la mirada). Respeta `prefers-reduced-motion`.
- Código de colores fijo: On-premises gris, IaaS azul, PaaS verde, SaaS coral, “Tú” amarillo.
- Cada diapositiva con `<aside class="notes">` usando las notas del GUION.
- Sin logotipos de marcas: nombres en chips de texto.

## Verificación obligatoria antes de terminar
1. `node build.mjs` sin errores (otros agentes pueden estar escribiendo sus secciones al mismo
   tiempo; si el build falla por un archivo que no es tuyo, espera un minuto y reintenta; no lo edites).
2. Capturas con Edge headless (comando en BRIEF §5, con `?all=1`) de **cada** diapositiva tuya a
   1280×720 y a 390×844, guardadas en `docs/capturas/`. Ábrelas y revísalas: nada cortado, nada
   encimado, sin scroll horizontal, texto legible.
3. Revisa que la interacción funcione con teclado (pasos) y con clic/tap.
4. Sin errores de consola (puedes usar `--enable-logging=stderr --v=0` o revisar con un script).

**Reporte final**: tu sandbox no puede ejecutar el CLI de Orca. Intenta `worker_done` una sola vez;
si falla, no insistas: termina tu turno con un mensaje final que empiece con `REPORTE FINAL` e incluya
resumen, archivos modificados, verificación hecha y pendientes. El coordinador lo lee de tu terminal.

**Evita comandos que pidan aprobación**: usa `msedge --headless=new --screenshot` y `node` sobre archivos
del proyecto. No abras puertos de depuración remota (CDP, `--remote-debugging-port`), no uses
WebSockets ni descargues nada: esos comandos detienen tu sesión esperando aprobación manual.
Para medir desbordes basta con revisar tus capturas.
