// Ayudas para redactar las tareas de los laboratorios (puro: sin window ni document).

/** Escapa texto para meterlo en HTML. */
export const esc = (t) =>
  String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Un nombre o valor exacto: <code>…</code>. */
export const c = (t) => `<code>${esc(t)}</code>`;

/** Un bloque listo para copiar (el script de user data). */
export const bloque = (t) => `<pre class="lab-codigo"><code>${esc(t)}</code></pre>`;

/** Una lista de viñetas. */
export const vinetas = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

/** El script de user data que instala Apache y escribe la página. */
export const scriptApache = (h1, parrafo) =>
  ['#!/bin/bash', 'dnf install -y httpd', `echo "<h1>${h1}</h1><p>${parrafo}</p>" > /var/www/html/index.html`, 'systemctl enable --now httpd'].join('\n');
