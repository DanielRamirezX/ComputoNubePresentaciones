// Las piezas con que se escribe cada sesión: recuadros, la mascota, bloques de
// código con botón de copiar, botones de la consola y capturas con marcas.
// Las comparten todas las sesiones de la ruta.

const ICONO_RECUADRO = { recuerda: 'foco', consejo: 'check', cuidado: 'alerta', tecnico: 'engrane', sabias: 'estrella', examen: 'insignia' };
const ETIQUETA_RECUADRO = {
  recuerda: 'Recuerda',
  consejo: 'Consejo',
  cuidado: 'Cuidado',
  tecnico: 'Cosas técnicas',
  sabias: '¿Sabías que?',
  examen: 'Así lo pregunta el examen'
};

export const icono = (nombre) => `<svg class="icono" aria-hidden="true"><use href="#i-${nombre}"></use></svg>`;

export const recuadro = (tipo, html) => `
  <div class="recuadro recuadro--${tipo}">
    <svg class="recuadro__icono" aria-hidden="true"><use href="#i-${ICONO_RECUADRO[tipo]}"></use></svg>
    <div><span class="recuadro__etiqueta">${ETIQUETA_RECUADRO[tipo]}</span><p>${html}</p></div>
  </div>`;


export const nubi = (html, cara = 'nubi') => `
  <div class="nubi">
    <svg class="nubi__imagen" viewBox="0 0 160 120" aria-hidden="true"><use href="#${cara}"></use></svg>
    <p class="nubi__globo">${html}</p>
  </div>`;


export const lista = (elementos) => `<ul>${elementos.map((e) => `<li>${e}</li>`).join('')}</ul>`;

// Un botón de la consola de AWS, dibujado para que el alumno lo reconozca.
export const boton = (texto, traduccion) =>
  `<span class="consola-boton">${texto}</span>${traduccion ? ` <span class="traduccion">(${traduccion})</span>` : ''}`;


// Un bloque de código con botón de copiar (el botón lo agrega app.js).
export const codigo = (texto) => `<pre class="codigo"><code>${texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;

/* ------------------------------------------------------------ capturas */

// Capturas reales de la consola, tomadas en el sandbox del docente con el
// Account ID tapado. Ancho y alto evitan saltos al cargar.
export const TAMANOS = {
  's1/01-sandbox-datacamp': [1265, 766],
  's1/02-consola-inicio': [1512, 470],
  's1/03-ec2-panel': [760, 520],
  's1/04-lanzar-nombre-ami': [1330, 565],
  's1/05-tipo-lista': [820, 580],
  's1/06-tipo-elegido': [1230, 290],
  's1/07-llaves': [820, 220],
  's1/08-red': [820, 440],
  's1/09-disco': [820, 400],
  's1/10-user-data': [820, 360],
  's1/11-resumen': [410, 400],
  's1/12-exito': [760, 142],
  's1/13-running': [820, 450],
  's1/14-pagina-web': [720, 174],
  's1/15-acciones-menu': [450, 450],
  's1/16-system-log': [910, 425],
  's1/17-estado-menu': [815, 195],
  's1/18-stop-modal': [612, 364],
  's1/19-stopped': [790, 295],
  's1/20-terminate-menu': [815, 155],
  's1/21-terminate-modal': [612, 324],
  's1/22-terminated': [720, 140],
  's1/23-volumes': [960, 475],
  's1/24-salir': [952, 480],
  's2/01-consola-inicio': [1507, 470],
  's2/02-buscar-iam': [700, 508],
  's2/03-iam-denegado': [1451, 623],
  's2/04-politicas-denegado': [1451, 310],
  's2/05-identidad': [391, 450],
  's2/06-secrets-inicio': [1451, 390],
  's2/07-secreto-tipo': [1195, 390],
  's2/08-llave': [1195, 440],
  's2/09-nombre': [1195, 270],
  's2/10-permisos-recurso': [1195, 540],
  's2/11-rotacion': [1195, 410],
  's2/12-revisar': [1195, 470],
  's2/13-guardar': [990, 440],
  's2/14-lista-secretos': [1451, 150],
  's2/15-leer-fallo': [1195, 400],
  's2/16-negaciones': [1195, 385],
  's2/17-cloudtrail-denegado': [1451, 390],
  's2/18-security-groups': [1451, 586],
  's2/19-sg-nombre-error': [1195, 265],
  's2/20-sg-origen': [1195, 240],
  's2/21-sg-reglas': [1195, 515],
  's2/22-sg-creado': [1210, 400],
  's2/23-vpc-panel': [1110, 611],
  's2/24-nacl-reglas': [1225, 425],
  's2/25-borrar-secreto-menu': [1195, 190],
  's2/26-borrar-secreto': [442, 263],
  's2/27-secreto-programado': [1205, 290],
  's2/28-borrar-sg-menu': [1060, 220],
  's2/29-borrar-sg': [604, 125],
  's2/30-sg-borrado': [1060, 160],
  's3/01-vpc-panel': [1345, 585],
  's3/02-tu-vpc': [1123, 545],
  's3/03-mapa-default': [1097, 500],
  's3/04-rutas-default': [1123, 265],
  's3/05-vpc-and-more': [1270, 450],
  's3/06-vpc-and-more-rutas': [765, 350],
  's3/07-nat': [1260, 545],
  's3/08-vpc-only': [1345, 435],
  's3/09-vpc-creada': [1123, 545],
  's3/10-subred-vpc': [1345, 275],
  's3/11-zonas': [850, 385],
  's3/12-subred-publica': [1280, 475],
  's3/13-subred-privada': [1280, 535],
  's3/14-subredes-creadas': [1123, 235],
  's3/15-igw-lista': [1123, 175],
  's3/16-igw-denegado': [1335, 385],
  's3/17-rutas-propias': [1123, 245],
  's3/18-targets': [1345, 520],
  's3/19-cloudfront': [1345, 360],
  's3/20-route53': [1345, 420],
  's3/21-mapa-propio': [1097, 275],
  's3/22-borrar-menu': [1123, 235],
  's3/23-borrar-confirmar': [757, 435],
  's3/24-borrada': [1123, 175],
};

// Una captura con marcas numeradas. Cada marca es [x, y, texto], con x e y en
// porcentaje de la imagen; los textos salen al pie, en el mismo orden.
// app.js agrega el visor que la amplía al tocarla.
export const captura = (ruta, alt, marcas = []) => {
  const [ancho, alto] = TAMANOS[ruta];
  return `
  <figure class="captura">
    <button class="captura__marco" type="button" data-ampliar aria-label="Ampliar captura: ${alt}">
      <img src="capturas/${ruta}.webp" width="${ancho}" height="${alto}" alt="${alt}" loading="lazy">
      ${marcas.map(([x, y], k) => `<span class="captura__marca" style="left:${x}%;top:${y}%" aria-hidden="true"><b>${k + 1}</b></span>`).join('')}
    </button>
    ${marcas.length ? `<figcaption><ol class="captura__claves">${marcas.map(([, , texto]) => `<li>${texto}</li>`).join('')}</ol></figcaption>` : ''}
  </figure>`;
};

/** Las capturas de una carpeta: capturasDe('s1')('03-ec2-panel', …). */
export const capturasDe = (carpeta) => (archivo, alt, marcas) => captura(`${carpeta}/${archivo}`, alt, marcas);
