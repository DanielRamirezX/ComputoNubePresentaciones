// ---------------------------------------------------------------------------
// EL MUNDO
//
// Un solo dibujo grande (3200 × 1800) por el que se mueve la cámara. De
// izquierda a derecha: la calle con la fila de clientes y el anfitrión de la
// puerta (el balanceador); la taquería de dos pisos, con dos locales abajo
// (dos zonas de disponibilidad) y sus planchas (servidores), y arriba la
// oficina del gerente (Auto Scaling), la receta (plantilla de lanzamiento), la
// pizarra con su campanita (CloudWatch) y la bitácora (CloudTrail); y a la
// derecha, la ventanilla del ayudante que llega con el timbre (Lambda).
//
// Todo se dibuja aquí con coordenadas del mundo; `guion.js` solo dice a dónde
// mira la cámara y qué capas están encendidas en cada momento.
// ---------------------------------------------------------------------------

const C = {
  tinta: '#0a0c2c',
  sombra: '#070925',
  tierra: '#161b5e',
  tierra2: '#1d2474',
  via: '#0f1450',
  viaBorde: '#2b3396',
  raya: '#6670e8',
  amarillo: '#ffcf3f',
  naranja: '#ff8a3c',
  rosa: '#ff4f8b',
  teal: '#2ee6c5',
  cian: '#4cc9f0',
  verde: '#7be495',
  lila: '#b69cff',
  blanco: '#f7f4ff',
  crema: '#fff3d6'
};

/** Aleatorio con semilla: el cielo sale igual cada vez. */
function semilla(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v) => Math.round(v * 10) / 10;

/** Lo que mide de ancho una pastilla con ese texto. */
function anchoPastilla(txt, s, mono) {
  return Math.round(txt.length * s * (mono ? 0.61 : 0.57) + s * 1.4);
}

/**
 * Una etiqueta redonda con texto. El ancho se estima por número de letras.
 * `ancla` dice qué punto es `x`: el centro, la orilla izquierda o la derecha.
 */
function pastilla(x, y, txt, o = {}) {
  const { s = 20, bg = C.blanco, fg = C.tinta, mono = false, cls = '', id = '', ancla = 'centro' } = o;
  const w = anchoPastilla(txt, s, mono);
  const h = Math.round(s * 1.8);
  const cx = ancla === 'izq' ? x + w / 2 : ancla === 'der' ? x - w / 2 : x;
  return `<g class="pastilla ${cls}"${id ? ` id="${id}"` : ''}>
    <rect x="${n(cx - w / 2)}" y="${n(y - h / 2)}" width="${w}" height="${h}" rx="${h / 2}" fill="${bg}"/>
    <text x="${n(cx)}" y="${n(y + s * 0.35)}" text-anchor="middle" font-size="${s}" fill="${fg}" class="${mono ? 'tmono' : 'tsans'}">${txt}</text>
  </g>`;
}

function arbol(x, y, r = 26, c = '#1fbf9f') {
  return `<g class="arbol">
    <ellipse cx="${x}" cy="${y + 3}" rx="${r * 0.7}" ry="6" fill="${C.sombra}" opacity=".4"/>
    <rect x="${x - 4}" y="${y - r * 0.9}" width="8" height="${r * 0.9}" rx="3" fill="#5b3f8f"/>
    <circle cx="${x}" cy="${n(y - r * 1.5)}" r="${r}" fill="${c}"/>
    <path d="M${x} ${n(y - r * 2.5)}a${r} ${r} 0 0 1 0 ${r * 2}z" fill="${C.tinta}" opacity=".16"/>
  </g>`;
}

const PISO = 1150; // la banqueta y el piso de la taquería
const PLANCHA = 1040; // la superficie de las planchas

// ---------------------------------------------------------------- personajes

/**
 * Un cliente de la fila, parado sobre (x, y). `d` es el retraso con que
 * aparece cuando se enciende su capa.
 */
function cliente(x, y, color, o = {}) {
  const { k = 1, d = 0, gorra = '' } = o;
  return `<g class="cliente" transform="translate(${x} ${y}) scale(${k})" style="--d:${d}s">
    <g class="cliente__pop">
      <ellipse cy="2" rx="22" ry="6" fill="${C.sombra}" opacity=".45"/>
      <g class="cliente__cuerpo">
        <rect x="-21" y="-58" width="42" height="58" rx="19" fill="${color}"/>
        <path d="M4-58h-2a19 19 0 0 1 19 19v20a19 19 0 0 1-19 19h2z" fill="${C.tinta}" opacity=".15"/>
        <circle cx="-7.5" cy="-38" r="3.3" fill="${C.tinta}"/><circle cx="7.5" cy="-38" r="3.3" fill="${C.tinta}"/>
        <path d="M-5-27q5 3.5 10 0" stroke="${C.tinta}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
        ${gorra ? `<path d="M-19-52a19 14 0 0 1 38 0z" fill="${gorra}"/><rect x="-26" y="-55" width="20" height="6" rx="3" fill="${gorra}"/>` : ''}
      </g>
    </g>
  </g>`;
}

/** Un cliente chiquito para el guion (m.mini): centrado, con los pies en +35. */
export function mini(color = C.cian, escala = 1) {
  return `<g transform="scale(${escala})">
    <ellipse cy="29" rx="17" ry="5" fill="${C.sombra}" opacity=".45"/>
    <rect x="-17" y="-21" width="34" height="50" rx="16" fill="${color}"/>
    <path d="M3-21h-1a16 16 0 0 1 16 16v18a16 16 0 0 1-16 16h1z" fill="${C.tinta}" opacity=".15"/>
    <circle cx="-6" cy="-4" r="2.8" fill="${C.tinta}"/><circle cx="6" cy="-4" r="2.8" fill="${C.tinta}"/>
    <path d="M-4 5q4 3 8 0" stroke="${C.tinta}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </g>`;
}

/**
 * Un taquero detrás de su plancha. Los pies quedan escondidos tras el
 * mostrador (en y = PLANCHA). Trae su cara de enfermo y su sudor, que se
 * encienden con banderas (on-enfermo1, on-pico…).
 */
function taquero(id, x, o = {}) {
  const { camisa = C.cian, piel = '#ffc9a3', pelo = '#3a1f6b' } = o;
  const y = PLANCHA;
  return `<g class="taquero" id="tq-${id}">
    <g class="taquero__cuerpo">
      <rect x="${x - 36}" y="${y - 112}" width="72" height="124" rx="30" fill="${camisa}"/>
      <path d="M${x + 6} ${y - 112}h0a30 30 0 0 1 30 30v64a30 30 0 0 1-30 30z" fill="${C.tinta}" opacity=".15"/>
      <rect x="${x - 25}" y="${y - 74}" width="50" height="86" rx="12" fill="${C.blanco}"/>
      <path d="M${x - 25} ${y - 58}h50" stroke="${C.tinta}" stroke-opacity=".12" stroke-width="4"/>
      <path class="taquero__brazo" d="M${x + 30} ${y - 84}q30 10 40 34" fill="none" stroke="${camisa}" stroke-width="15" stroke-linecap="round"/>
      <g class="taquero__espatula">
        <path d="M${x + 70} ${y - 50}l10 24" stroke="#8f7bd6" stroke-width="5" stroke-linecap="round"/>
        <rect x="${x + 70}" y="${y - 30}" width="26" height="10" rx="3" fill="#cfd3ff" transform="rotate(20 ${x + 83} ${y - 25})"/>
      </g>
      <circle cx="${x}" cy="${y - 140}" r="31" fill="${piel}"/>
      <path d="M${x - 31} ${y - 142}a31 31 0 0 1 62 0q-8-9-31-9t-31 9z" fill="${pelo}"/>
      <g class="taquero__gorro">
        <rect x="${x - 27}" y="${y - 186}" width="54" height="26" rx="8" fill="${C.blanco}"/>
        <circle cx="${x - 17}" cy="${y - 190}" r="15" fill="${C.blanco}"/><circle cx="${x}" cy="${y - 197}" r="17" fill="${C.blanco}"/><circle cx="${x + 17}" cy="${y - 190}" r="15" fill="${C.blanco}"/>
        <rect x="${x - 27}" y="${y - 168}" width="54" height="7" rx="3.5" fill="${C.tinta}" opacity=".1"/>
      </g>
      <g class="taquero__cara">
        <circle class="ojo" cx="${x - 10}" cy="${y - 140}" r="3.6" fill="${C.tinta}"/><circle class="ojo" cx="${x + 10}" cy="${y - 140}" r="3.6" fill="${C.tinta}"/>
        <path d="M${x - 8} ${y - 127}q8 7 16 0" stroke="${C.tinta}" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
      <g class="sudor">
        <path d="M${x - 40} ${y - 160}q-6 10 0 14q6-4 0-14z" fill="${C.cian}"/>
        <path d="M${x + 38} ${y - 150}q-5 8 0 11q5-3 0-11z" fill="${C.cian}"/>
      </g>
      <g class="taquero__enfermo">
        <circle cx="${x}" cy="${y - 140}" r="31" fill="${C.verde}" opacity=".55"/>
        <path d="M${x - 15} ${y - 145}l9 6M${x - 15} ${y - 139}l9-6M${x + 6} ${y - 145}l9 6M${x + 6} ${y - 139}l9-6" stroke="${C.tinta}" stroke-width="3" stroke-linecap="round"/>
        <path d="M${x - 8} ${y - 124}q8-6 16 0" stroke="${C.tinta}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M${x + 4} ${y - 126}l22 10" stroke="${C.blanco}" stroke-width="5" stroke-linecap="round"/>
        <circle cx="${x + 27}" cy="${y - 115}" r="4" fill="${C.rosa}"/>
      </g>
    </g>
  </g>`;
}

/** La plancha con su mostrador de azulejos. La brasa y los tacos van en la capa de su taquero. */
function plancha(x) {
  const y = PLANCHA;
  let azulejos = '';
  for (let i = 0; i < 5; i++) {
    const cx = x - 96 + i * 48;
    azulejos += `<rect x="${cx}" y="${y + 40}" width="40" height="40" rx="6" fill="${i % 2 ? C.crema : '#ffe0b0'}"/>
      <path d="M${cx + 20} ${y + 46}l14 14l-14 14l-14-14z" fill="${i % 2 ? C.cian : C.rosa}" opacity=".85"/>`;
  }
  return `<g class="plancha">
    <ellipse cx="${x}" cy="${PISO + 4}" rx="${130}" ry="10" fill="${C.sombra}" opacity=".45"/>
    <rect x="${x - 118}" y="${y + 22}" width="236" height="${PISO - y - 22}" rx="10" fill="${C.naranja}"/>
    ${azulejos}
    <rect x="${x - 118}" y="${y + 92}" width="236" height="${PISO - y - 92}" rx="8" fill="#d96a1e"/>
    <rect x="${x - 112}" y="${y - 4}" width="224" height="30" rx="9" fill="#3a3f6e"/>
    <rect x="${x - 112}" y="${y + 16}" width="224" height="10" rx="5" fill="${C.tinta}" opacity=".35"/>
  </g>`;
}

/** Lo que solo existe cuando hay taquero: la brasa, los tacos y el humo. */
function fuego(id, x) {
  const y = PLANCHA;
  const taco = (dx, c) => `<g transform="translate(${x + dx} ${y - 6})">
    <path d="M-16 0a16 13 0 0 1 32 0z" fill="${C.amarillo}"/>
    <path d="M-11 0a11 7 0 0 1 22 0z" fill="${c}"/>
  </g>`;
  return `<g class="fuego" id="brasa-${id}">
    <rect x="${x - 104}" y="${y - 2}" width="208" height="12" rx="6" fill="${C.naranja}" class="brasa"/>
    ${taco(-62, C.rosa)}${taco(-22, '#d9533f')}${taco(26, C.verde)}
    <g class="humos">
      <circle class="humo" cx="${x - 50}" cy="${y - 30}" r="12" fill="${C.blanco}" style="animation-delay:-.4s"/>
      <circle class="humo" cx="${x + 10}" cy="${y - 34}" r="10" fill="${C.blanco}" style="animation-delay:-1.3s"/>
      <circle class="humo" cx="${x + 56}" cy="${y - 28}" r="11" fill="${C.blanco}" style="animation-delay:-2.1s"/>
    </g>
  </g>`;
}

/** Chuy, el cliente con hambre: el que seguimos toda la animación. */
function chuy() {
  return `<g id="chuy" transform="translate(700 1115)">
    <g class="chuy__salto">
      <ellipse cy="35" rx="30" ry="7" fill="${C.sombra}" opacity=".5"/>
      <g class="chuy__caja">
        <rect x="-32" y="-30" width="64" height="65" rx="27" fill="${C.naranja}"/>
        <path d="M8-30h-3a27 27 0 0 1 27 27v11a27 27 0 0 1-27 27h3z" fill="${C.tinta}" opacity=".13"/>
        <path d="M-28-14a28 22 0 0 1 56 0z" fill="${C.cian}"/>
        <rect x="-44" y="-19" width="30" height="8" rx="4" fill="${C.cian}"/>
        <circle cx="-10" cy="0" r="8.5" fill="${C.blanco}"/><circle cx="11" cy="0" r="8.5" fill="${C.blanco}"/>
        <circle class="pupila" cx="-8.5" cy="1" r="4" fill="${C.tinta}"/><circle class="pupila" cx="12.5" cy="1" r="4" fill="${C.tinta}"/>
        <path d="M-7 17q8 6 16 0" stroke="${C.tinta}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
        <circle cx="-21" cy="12" r="5" fill="${C.rosa}" opacity=".55"/><circle cx="23" cy="12" r="5" fill="${C.rosa}" opacity=".55"/>
      </g>
    </g>
    <g id="chuy-etq" transform="translate(0 -70)">
      <path d="M-7 13h14l-7 9z" fill="${C.blanco}"/>
      <rect id="chuy-etq-caja" x="-50" y="-15" width="100" height="30" rx="15" fill="${C.blanco}"/>
      <text id="chuy-etq-texto" x="0" y="6" text-anchor="middle" font-size="17" fill="${C.tinta}" class="tmono"></text>
    </g>
  </g>`;
}

// -------------------------------------------------------------- piezas sueltas

function comanda(k = 1) {
  return `<g transform="scale(${k})">
    <ellipse cy="24" rx="12" ry="3.5" fill="${C.sombra}" opacity=".4"/>
    <path d="M-15-20h30v38l-5-4-5 4-5-4-5 4-5-4-5 4z" fill="${C.blanco}"/>
    <path d="M-9-11h18M-9-4h13M-9 3h16" stroke="${C.tinta}" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>
    <rect x="-6" y="-26" width="12" height="9" rx="2" fill="#8f7bd6"/>
  </g>`;
}

function sobre(k = 1) {
  return `<g transform="scale(${k})">
    <rect x="-22" y="-15" width="44" height="30" rx="5" fill="${C.blanco}"/>
    <path d="M-22-12l22 15l22-15" fill="none" stroke="${C.rosa}" stroke-width="4" stroke-linejoin="round"/>
  </g>`;
}

function celular(k = 1) {
  return `<g transform="scale(${k})">
    <rect x="-15" y="-26" width="30" height="52" rx="7" fill="${C.tinta}"/>
    <rect x="-11" y="-20" width="22" height="38" rx="3" fill="${C.teal}"/>
    <rect x="-8" y="-14" width="16" height="9" rx="4.5" fill="${C.blanco}"/>
  </g>`;
}

function taco(k = 1) {
  return `<g transform="scale(${k})">
    <ellipse cy="16" rx="20" ry="4" fill="${C.sombra}" opacity=".4"/>
    <path d="M-24 10a24 22 0 0 1 48 0z" fill="${C.amarillo}"/>
    <path d="M-17 10a17 12 0 0 1 34 0z" fill="#d9533f"/>
    <circle cx="-6" cy="3" r="3" fill="${C.verde}"/><circle cx="5" cy="1" r="3" fill="${C.blanco}"/><circle cx="12" cy="5" r="2.6" fill="${C.verde}"/>
  </g>`;
}

function receta(k = 1) {
  return `<g transform="scale(${k})">
    <rect x="-18" y="-24" width="36" height="46" rx="5" fill="${C.crema}"/>
    <rect x="-18" y="-24" width="36" height="11" rx="5" fill="${C.rosa}"/>
    <path d="M-11-4h22M-11 4h16M-11 12h20" stroke="${C.tinta}" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/>
  </g>`;
}

function molcajete(k = 1) {
  return `<g transform="scale(${k})">
    <ellipse cy="20" rx="24" ry="5" fill="${C.sombra}" opacity=".4"/>
    <path d="M-26-4h52a26 22 0 0 1-52 0z" fill="#5b3f8f"/>
    <ellipse cy="-4" rx="26" ry="8" fill="#d9533f"/>
    <circle cx="-8" cy="-6" r="3" fill="${C.verde}"/><circle cx="7" cy="-3" r="2.6" fill="${C.amarillo}"/>
    <path d="M-18 16l-6 6M18 16l6 6" stroke="#5b3f8f" stroke-width="6" stroke-linecap="round"/>
  </g>`;
}

function campanita(k = 1) {
  return `<g transform="scale(${k})">
    <path d="M-16 8q2-26 16-26t16 26z" fill="${C.amarillo}"/>
    <rect x="-20" y="6" width="40" height="7" rx="3.5" fill="${C.naranja}"/>
    <circle cy="16" r="5" fill="${C.naranja}"/>
  </g>`;
}

/** Las figuras que el guion puede soltar en el mapa. `alto` es a qué altura va su etiqueta. */
export const PIEZAS = {
  comanda: { svg: comanda, alto: 50 },
  sobre: { svg: sobre, alto: 40 },
  celular: { svg: celular, alto: 50 },
  taco: { svg: taco, alto: 40 },
  receta: { svg: receta, alto: 50 },
  molcajete: { svg: molcajete, alto: 46 },
  campanita: { svg: campanita, alto: 40 }
};

// ------------------------------------------------------------------ rutas

/** Los caminos por los que viajan Chuy y compañía. */
export const RUTAS = {
  llega: 'M700 1115H1040',
  p1: 'M1040 1115C1160 1085 1360 1085 1500 1115',
  p3: 'M1040 1115C1220 1080 1620 1080 1800 1115',
  p2: 'M1040 1115C1320 1075 1900 1075 2200 1115',
  'taco-1': 'M1460 1030C1460 960 1500 980 1500 1050',
  'taco-2': 'M2160 1030C2160 960 2200 980 2200 1050',
  'taco-3': 'M1760 1030C1760 960 1800 980 1800 1050',
  'receta-1': 'M1975 570C1900 640 1560 700 1500 850',
  'receta-2': 'M1975 570C2050 640 2180 700 2200 850',
  'receta-3': 'M1975 570C1930 640 1820 700 1800 850',
  'riel-1': 'M1300 990V846H1500',
  'riel-3': 'M1300 990V846H1800',
  'riel-2': 'M1300 990V846H2200',
  'mega-sms': 'M1745 620C1400 260 860 420 700 1010',
  'mega-correo': 'M1745 620C1450 330 1060 480 930 950',
  'mega-timbre': 'M1835 620C2300 330 2760 640 2878 990',
  vete: 'M1040 1115C900 1100 700 1100 460 1115'
};

/** A dónde mira la cámara: [x, y, ancho, alto], siempre 16:9. Lo importante queda en el 68 % de arriba. */
export const CAM = {
  todo: [80, 140, 3120, 1755],
  mapa: [80, 100, 3120, 1755],
  calle: [100, 760, 1067, 600],
  'calle-ancha': [100, 560, 1900, 1069],
  'cocina-a': [1120, 760, 1000, 563],
  cocina: [1170, 700, 1600, 900],
  edificio: [1130, 300, 1760, 990],
  oficina: [1300, 360, 1440, 810],
  pizarra: [2060, 430, 800, 450],
  puerta: [690, 520, 1830, 1029],
  megafono: [480, 360, 2700, 1519],
  riel: [1150, 700, 1650, 928],
  ventanilla: [2200, 660, 1240, 698]
};

// ------------------------------------------------------------------ escenario

function cielo() {
  const r = semilla(31);
  let puntos = '';
  for (let i = 0; i < 170; i++) {
    const x = n(-500 + r() * 4300);
    const y = n(-100 + r() * 1300);
    const rad = n(0.9 + r() * 2.3);
    const titila = r() < 0.35;
    puntos += `<circle cx="${x}" cy="${y}" r="${rad}" fill="${C.blanco}" opacity="${n(0.12 + r() * 0.45)}"${titila ? ` class="titila" style="animation-delay:-${n(r() * 5)}s"` : ''}/>`;
  }
  return `
    <rect x="-700" y="-300" width="4900" height="2500" fill="url(#g-cielo)"/>
    <circle cx="600" cy="560" r="620" fill="url(#g-niebla-rosa)"/>
    <circle cx="1980" cy="520" r="760" fill="url(#g-niebla-ambar)"/>
    <circle cx="3000" cy="700" r="560" fill="url(#g-niebla-lila)"/>
    ${puntos}
    <circle cx="420" cy="360" r="70" fill="${C.crema}" opacity=".9"/>
    <circle cx="448" cy="342" r="70" fill="#1a1259" opacity=".85"/>
    <rect x="-700" y="${PISO}" width="4900" height="900" fill="${C.tierra}"/>
    <rect x="-700" y="${PISO}" width="4900" height="26" fill="${C.tierra2}"/>
    <path d="M-700 ${PISO + 90}H4200" stroke="${C.raya}" stroke-width="5" stroke-dasharray="40 34" opacity=".35"/>`;
}

/** La calle de la izquierda: edificios al fondo, un farol y la fila. */
function calle() {
  const r = semilla(7);
  const edificio = (x, w, h, c) => {
    let v = '';
    for (let fy = 0; fy < Math.floor((h - 26) / 30); fy++) {
      for (let fx = 0; fx < Math.floor((w - 16) / 24); fx++) {
        const luz = r() < 0.5;
        v += `<rect x="${x - w / 2 + 12 + fx * 24}" y="${PISO - h + 16 + fy * 30}" width="13" height="17" rx="3" fill="${luz ? '#ffe27a' : C.tinta}" opacity="${luz ? 0.85 : 0.35}"${luz && r() < 0.35 ? ' class="ventana"' : ''}/>`;
      }
    }
    return `<g opacity=".8">
      <rect x="${x - w / 2}" y="${PISO - h}" width="${w}" height="${h}" rx="12" fill="${c}"/>
      <path d="M${x + w * 0.2} ${PISO - h}H${x + w / 2 - 12}a12 12 0 0 1 12 12V${PISO}H${x + w * 0.2}z" fill="${C.tinta}" opacity=".18"/>
      ${v}
    </g>`;
  };
  return `<g id="calle">
    ${edificio(170, 110, 330, '#3d3699')}
    ${edificio(300, 120, 250, '#4b42b8')}
    ${edificio(440, 100, 380, '#352f8a')}
    ${edificio(580, 130, 210, '#4a3fa8')}
    ${edificio(760, 110, 300, '#3d3699')}
    ${arbol(900, PISO + 4, 26, '#28d7b4')}
    <g class="farol">
      <rect x="976" y="${PISO - 230}" width="9" height="230" rx="4" fill="#8f7bd6"/>
      <path d="M980 ${PISO - 226}q0-26 30-26" fill="none" stroke="#8f7bd6" stroke-width="8" stroke-linecap="round"/>
      <path d="M996 ${PISO - 252}h30l-6 16h-18z" fill="${C.amarillo}"/>
      <ellipse cx="1011" cy="${PISO - 200}" rx="40" ry="60" fill="url(#g-luz)"/>
    </g>
  </g>`;
}

function fila() {
  const colores = [C.rosa, C.teal, C.lila, C.verde, C.cian, C.amarillo, '#ff9ec1', '#9fe0ff', '#c8b5ff', C.rosa, C.teal, C.lila];
  const corta = [1030, 962, 894].map((x, i) => cliente(x, PISO, colores[i], { gorra: i === 1 ? C.amarillo : '' })).join('');
  let larga = '';
  for (let i = 0; i < 10; i++) {
    const x = 826 - i * 64;
    larga += cliente(x, PISO, colores[(i + 3) % colores.length], { d: 0.25 + i * 0.16, k: 0.96 + (i % 3) * 0.03, gorra: i % 4 === 2 ? C.rosa : '' });
  }
  return `<g class="capa capa-fila">${corta}</g>
    <g class="capa capa-fila-larga">${larga}
      ${pastilla(560, 990, '¡hora pico!', { s: 22, bg: C.rosa, fg: C.blanco, cls: 'flota' })}
    </g>`;
}

/** El anfitrión de la puerta: el balanceador de carga. */
function anfitrion() {
  const x = 1110;
  return `<g class="capa capa-anfitrion" id="anfitrion">
    <ellipse cx="${x}" cy="${PISO + 4}" rx="44" ry="8" fill="${C.sombra}" opacity=".45"/>
    <rect x="${x - 26}" y="${PISO - 100}" width="52" height="100" rx="22" fill="${C.tinta}"/>
    <path d="M${x - 10} ${PISO - 100}l10 18l10-18" fill="${C.blanco}"/>
    <path d="M${x - 9} ${PISO - 80}l9 5l9-5v10l-9-5l-9 5z" fill="${C.rosa}"/>
    <circle cx="${x}" cy="${PISO - 124}" r="25" fill="#d9925f"/>
    <path d="M${x - 25} ${PISO - 126}a25 25 0 0 1 50 0q-10-8-25-8t-25 8z" fill="${C.tinta}"/>
    <circle class="ojo" cx="${x - 8}" cy="${PISO - 124}" r="3" fill="${C.tinta}"/><circle class="ojo" cx="${x + 8}" cy="${PISO - 124}" r="3" fill="${C.tinta}"/>
    <path d="M${x - 6} ${PISO - 113}q6 5 12 0" stroke="${C.tinta}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M${x + 22} ${PISO - 84}q30-6 40-34" fill="none" stroke="${C.tinta}" stroke-width="12" stroke-linecap="round"/>
    <rect x="${x + 46}" y="${PISO - 150}" width="34" height="44" rx="6" fill="${C.crema}" transform="rotate(14 ${x + 63} ${PISO - 128})"/>
    <g id="tb-anfitrion">${pastilla(x, PISO + 34, 'el anfitrión', { s: 17 })}</g>
  </g>`;
}

/** La taquería: dos locales abajo (dos zonas), la oficina arriba. */
function taqueria() {
  const papel = () => {
    let s = '';
    const colores = [C.rosa, C.amarillo, C.teal, C.lila, C.cian, C.verde];
    for (let i = 0; i < 30; i++) {
      const x = 1230 + i * 51;
      s += `<path d="M${x} 776h38l-4 26l-15-8l-15 8z" fill="${colores[i % colores.length]}" class="papel" style="animation-delay:-${(i % 5) * 0.4}s"/>`;
    }
    return `<path d="M1215 775H2740" stroke="#8f7bd6" stroke-width="3"/>${s}`;
  };
  return `<g id="taqueria">
    <ellipse cx="1975" cy="${PISO + 8}" rx="880" ry="22" fill="${C.sombra}" opacity=".5"/>

    <!-- planta baja: los dos locales -->
    <rect x="1180" y="760" width="1595" height="${PISO - 760}" fill="#2b2380"/>
    <rect x="1180" y="980" width="1595" height="${PISO - 980}" fill="#241d6e"/>
    <circle cx="1580" cy="900" r="300" fill="url(#g-calido)"/>
    <circle cx="2370" cy="900" r="300" fill="url(#g-calido)"/>
    ${papel()}
    <rect x="1180" y="760" width="36" height="200" rx="8" fill="${C.rosa}"/>
    <rect x="2740" y="760" width="36" height="${PISO - 760}" rx="8" fill="${C.rosa}"/>
    <path d="M1955 760h32v190a16 16 0 0 1-32 0z" fill="${C.rosa}"/>
    <rect x="1170" y="${PISO - 4}" width="1615" height="24" rx="6" fill="#3a2f9a"/>
    <path d="M1080 930H1262V958H1080z" fill="${C.crema}"/>
    <path d="M1080 930h26v28h-26zM1132 930h26v28h-26zM1184 930h26v28h-26zM1236 930h26v28h-26z" fill="${C.rosa}"/>
    <path d="M1080 958q13 14 26 0t26 0t26 0t26 0t26 0t26 0t26 0" fill="${C.crema}"/>

    <!-- planta alta: la oficina (todo lo de arriba baja 100) -->
    <g transform="translate(0 100)">
    <rect x="1300" y="300" width="1400" height="360" fill="#231a6e"/>
    <rect x="1300" y="300" width="1400" height="40" fill="#1b145a"/>
    <rect x="1170" y="648" width="1615" height="26" rx="8" fill="#3a2f9a"/>
    <rect x="1280" y="278" width="1440" height="28" rx="12" fill="${C.rosa}"/>
    <rect x="1290" y="306" width="22" height="350" fill="${C.rosa}"/>
    <rect x="2688" y="306" width="22" height="350" fill="${C.rosa}"/>
    ${pastilla(1990, 236, 'Taquería La Nube', { s: 44, bg: C.amarillo, cls: 'letrero-grande' })}
    <circle cx="1680" cy="238" r="7" fill="${C.rosa}" class="titila"/><circle cx="2300" cy="238" r="7" fill="${C.teal}" class="titila" style="animation-delay:-1.4s"/>
    </g>
  </g>`;
}

/** Las planchas, sus taqueros y la caja. */
function cocina() {
  return `<g id="cocina">
    <g class="capa capa-zonas">
      ${pastilla(1650, 836, 'local a · zona a', { s: 18, bg: C.verde })}
      ${pastilla(2370, 836, 'local b · zona b', { s: 18, bg: C.cian })}
    </g>
    <g class="capa capa-t1">${taquero(1, 1500, { camisa: C.cian })}</g>
    <g class="capa capa-t3">${taquero(3, 1800, { camisa: C.lila, piel: '#d9925f', pelo: C.tinta })}</g>
    <g class="capa capa-t2">${taquero(2, 2200, { camisa: C.verde, piel: '#f0b07a', pelo: '#5b2d1a' })}</g>
    <g class="hueco" id="hueco-4">
      <rect x="2486" y="900" width="108" height="120" rx="30" fill="none" stroke="${C.blanco}" stroke-opacity=".3" stroke-width="4" stroke-dasharray="12 10"/>
      ${pastilla(2540, 960, 'libre', { s: 16, bg: C.tinta, fg: C.blanco })}
    </g>
    ${plancha(1500)}${plancha(1800)}${plancha(2200)}${plancha(2540)}
    <g class="capa capa-t1">${fuego(1, 1500)}</g>
    <g class="capa capa-t3">${fuego(3, 1800)}</g>
    <g class="capa capa-t2">${fuego(2, 2200)}</g>
    ${pastilla(1500, 1188, 'plancha 1', { s: 16, bg: C.tinta, fg: C.blanco })}
    ${pastilla(1800, 1188, 'plancha 3', { s: 16, bg: C.tinta, fg: C.blanco })}
    ${pastilla(2200, 1188, 'plancha 2', { s: 16, bg: C.tinta, fg: C.blanco })}
    ${pastilla(2540, 1188, 'plancha 4', { s: 16, bg: C.tinta, fg: C.blanco })}

    <g class="capa capa-caja">
      <circle cx="1298" cy="990" r="20" fill="#ffc9a3"/>
      <path d="M1278 990a20 20 0 0 1 40 0q-6-7-20-7t-20 7z" fill="#7a2f5f"/>
      <circle cx="1292" cy="990" r="2.6" fill="${C.tinta}"/><circle cx="1304" cy="990" r="2.6" fill="${C.tinta}"/>
      <rect x="1276" y="1008" width="44" height="40" rx="16" fill="${C.amarillo}"/>
      <rect x="1250" y="1040" width="96" height="${PISO - 1040}" rx="8" fill="${C.teal}"/>
      <rect x="1262" y="1022" width="44" height="22" rx="5" fill="${C.tinta}"/>
      <rect x="1268" y="1027" width="32" height="8" rx="3" fill="${C.verde}"/>
      ${pastilla(1298, 1188, 'caja', { s: 16, bg: C.teal })}
    </g>

    <g class="capa capa-riel">
      <path d="M1290 818H2700" stroke="#cfd3ff" stroke-width="8" stroke-linecap="round"/>
      <path d="M1290 818H2700" stroke="${C.tinta}" stroke-opacity=".3" stroke-width="3" stroke-dasharray="4 26"/>
      <g id="tb-riel">${pastilla(2560, 852, 'el riel de las comandas', { s: 17 })}</g>
    </g>
  </g>`;
}

/** La oficina: el tablero del gerente, la receta, la pizarra, la campana y la bitácora. */
function oficina() {
  const gx = 1790;
  const gy = 650;
  return `<g id="oficina" transform="translate(0 100)">
    <!-- el tablero del gerente: mínimo, deseado y máximo -->
    <g class="capa capa-tablero">
      <rect x="1380" y="380" width="320" height="200" rx="16" fill="${C.blanco}"/>
      <rect x="1380" y="380" width="320" height="38" rx="16" fill="${C.amarillo}"/>
      <text x="1540" y="406" text-anchor="middle" font-size="20" fill="${C.tinta}" class="tsans">taqueros en turno</text>
      <g id="tb-min"><text x="1406" y="456" font-size="22" fill="${C.tinta}" class="tmono">mínimo</text><text x="1676" y="456" text-anchor="end" font-size="28" fill="${C.tinta}" class="tmono">1</text></g>
      <g id="tb-des"><text x="1406" y="505" font-size="22" fill="${C.rosa}" class="tmono">deseado</text>
        <text x="1676" y="507" text-anchor="end" font-size="34" fill="${C.rosa}" class="tmono d-2">2</text>
        <text x="1676" y="507" text-anchor="end" font-size="34" fill="${C.rosa}" class="tmono d-3">3</text>
      </g>
      <g id="tb-max"><text x="1406" y="554" font-size="22" fill="${C.tinta}" class="tmono">máximo</text><text x="1676" y="554" text-anchor="end" font-size="28" fill="${C.tinta}" class="tmono">3</text></g>
      <path d="M1540 380v-40" stroke="#8f7bd6" stroke-width="4"/><circle cx="1540" cy="340" r="6" fill="#8f7bd6"/>
    </g>

    <!-- el gerente -->
    <g id="gerente">
      <ellipse cx="${gx}" cy="${gy + 3}" rx="40" ry="7" fill="${C.sombra}" opacity=".5"/>
      <g class="gerente__cuerpo">
        <rect x="${gx - 34}" y="${gy - 108}" width="68" height="108" rx="28" fill="${C.naranja}"/>
        <path d="M${gx + 6} ${gy - 108}a28 28 0 0 1 28 28v52a28 28 0 0 1-28 28z" fill="${C.tinta}" opacity=".15"/>
        <path d="M${gx - 6} ${gy - 106}l6 40l6-40z" fill="${C.amarillo}"/>
        <circle cx="${gx}" cy="${gy - 134}" r="29" fill="#e8a877"/>
        <path d="M${gx - 29} ${gy - 140}a29 29 0 0 1 58 0q-6-14-29-14t-29 14z" fill="${C.blanco}" opacity=".85"/>
        <circle class="ojo" cx="${gx - 10}" cy="${gy - 136}" r="3.4" fill="${C.tinta}"/><circle class="ojo" cx="${gx + 10}" cy="${gy - 136}" r="3.4" fill="${C.tinta}"/>
        <path d="M${gx - 16} ${gy - 122}q8-7 16-1q8-6 16 1q-8 6-16 2q-8 4-16-2z" fill="${C.blanco}"/>
        <path d="M${gx - 30} ${gy - 80}q-26 10-26 40" fill="none" stroke="${C.naranja}" stroke-width="14" stroke-linecap="round"/>
        <rect x="${gx - 72}" y="${gy - 60}" width="40" height="52" rx="6" fill="#8f7bd6"/>
        <rect x="${gx - 66}" y="${gy - 50}" width="28" height="36" rx="3" fill="${C.blanco}"/>
        <g class="capa capa-megafono">
          <path d="M${gx + 30} ${gy - 82}q16-8 22-22" fill="none" stroke="${C.naranja}" stroke-width="14" stroke-linecap="round"/>
          <path d="M${gx + 44} ${gy - 112}l46-36v62z" fill="${C.amarillo}"/>
          <rect x="${gx + 34}" y="${gy - 118}" width="16" height="24" rx="5" fill="${C.rosa}"/>
          <path class="onda" d="M${gx + 104} ${gy - 140}q12 22 0 44" fill="none" stroke="${C.amarillo}" stroke-width="5" stroke-linecap="round"/>
          <path class="onda onda--2" d="M${gx + 120} ${gy - 152}q18 34 0 68" fill="none" stroke="${C.amarillo}" stroke-width="5" stroke-linecap="round"/>
        </g>
      </g>
      ${pastilla(gx, gy + 34, 'el gerente', { s: 17 })}
    </g>

    <!-- la receta: la plantilla de lanzamiento -->
    <g class="capa capa-receta" id="tb-receta">
      <rect x="1890" y="372" width="170" height="214" rx="10" fill="${C.crema}" transform="rotate(-3 1975 480)"/>
      <g transform="rotate(-3 1975 480)">
        <rect x="1890" y="372" width="170" height="44" rx="10" fill="${C.rosa}"/>
        <text x="1975" y="401" text-anchor="middle" font-size="19" fill="${C.blanco}" class="tsans">la receta</text>
        <text x="1906" y="442" font-size="15" fill="${C.tinta}" class="tmono">tortilla: maíz</text>
        <text x="1906" y="468" font-size="15" fill="${C.tinta}" class="tmono">carne: pastor</text>
        <text x="1906" y="494" font-size="15" fill="${C.tinta}" class="tmono">piña: sí</text>
        <text x="1906" y="520" font-size="15" fill="${C.tinta}" class="tmono">salsa: verde</text>
        <text x="1906" y="552" font-size="15" fill="${C.rosa}" class="tmono">al llegar:</text>
        <text x="1906" y="574" font-size="15" fill="${C.rosa}" class="tmono">prende plancha</text>
      </g>
      <circle cx="1975" cy="370" r="8" fill="${C.rosa}"/>
    </g>

    <!-- la pizarra de la cocina: CloudWatch -->
    <g class="capa capa-pizarra">
      <rect x="2120" y="380" width="310" height="214" rx="14" fill="#123a3a"/>
      <rect x="2128" y="388" width="294" height="198" rx="10" fill="#0c2a2c"/>
      <text x="2140" y="414" font-size="17" fill="${C.teal}" class="tmono">ocupación de la cocina</text>
      <path d="M2144 560H2404M2144 440V560" stroke="${C.blanco}" stroke-opacity=".35" stroke-width="3"/>
      <path d="M2144 506H2404" stroke="${C.rosa}" stroke-width="3" stroke-dasharray="10 8"/>
      <text x="2404" y="498" text-anchor="end" font-size="14" fill="${C.rosa}" class="tmono">70 %</text>
      <path class="grafica grafica--baja" d="M2150 548L2190 540L2230 545L2270 532L2310 538L2350 528L2396 532" fill="none" stroke="${C.teal}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
      <path class="grafica grafica--alta" d="M2150 548L2190 540L2230 530L2270 508L2310 484L2350 466L2396 452" fill="none" stroke="${C.amarillo}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
      <g id="termometro">
        <rect x="2462" y="400" width="34" height="180" rx="17" fill="${C.blanco}"/>
        <circle cx="2479" cy="586" r="26" fill="${C.blanco}"/>
        <rect x="2470" y="414" width="18" height="160" rx="9" fill="#1b145a"/>
        <rect class="nivel nivel--bajo" x="2470" y="524" width="18" height="50" rx="9" fill="${C.teal}"/>
        <rect class="nivel nivel--alto" x="2470" y="434" width="18" height="140" rx="9" fill="${C.rosa}"/>
        <circle class="bulbo" cx="2479" cy="586" r="18" fill="${C.teal}"/>
        <circle class="bulbo bulbo--alto" cx="2479" cy="586" r="18" fill="${C.rosa}"/>
      </g>
      <g id="tb-pizarra">${pastilla(2275, 622, 'la pizarra · métricas', { s: 16, bg: C.teal })}</g>
    </g>

    <!-- la campanita: una alarma -->
    <g class="capa capa-campana" id="campana">
      <path d="M2580 306V346" stroke="#8f7bd6" stroke-width="4"/>
      <g class="campana__cuerpo">
        <path d="M2552 410q2-60 28-60t28 60z" fill="${C.amarillo}"/>
        <rect x="2544" y="404" width="72" height="12" rx="6" fill="${C.naranja}"/>
        <circle cx="2580" cy="424" r="8" fill="${C.naranja}"/>
      </g>
      <g class="campana__ondas">
        <path d="M2534 360q-14 22 0 44M2626 360q14 22 0 44" fill="none" stroke="${C.amarillo}" stroke-width="5" stroke-linecap="round"/>
        <path d="M2518 350q-22 32 0 64M2642 350q22 32 0 64" fill="none" stroke="${C.amarillo}" stroke-width="4" stroke-linecap="round" opacity=".6"/>
      </g>
      <g class="campana__no">
        <circle cx="2580" cy="384" r="46" fill="none" stroke="${C.rosa}" stroke-width="9"/>
        <path d="M2548 416l64-64" stroke="${C.rosa}" stroke-width="9" stroke-linecap="round"/>
      </g>
      <g id="tb-campana">${pastilla(2580, 456, 'la campanita', { s: 15 })}</g>
    </g>

    <!-- la bitácora: CloudTrail -->
    <g class="capa capa-bitacora" id="tb-bitacora">
      <rect x="2540" y="584" width="140" height="18" rx="6" fill="#8f7bd6"/>
      <rect x="2556" y="602" width="12" height="46" fill="#6a55c7"/><rect x="2652" y="602" width="12" height="46" fill="#6a55c7"/>
      <path d="M2610 584l-50-6v-36l50 6z" fill="${C.crema}"/>
      <path d="M2610 584l50-6v-36l-50 6z" fill="${C.blanco}"/>
      <path d="M2568 552l34 4M2568 562l34 4M2568 572l26 3M2618 556l34-4M2618 566l34-4" stroke="${C.tinta}" stroke-opacity=".45" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M2662 548l14-40" stroke="${C.rosa}" stroke-width="5" stroke-linecap="round"/>
      ${pastilla(2610, 520, 'la bitácora', { s: 15 })}
    </g>
  </g>`;
}

/** La ventanilla del ayudante: AWS Lambda. Y el reloj de pared: EventBridge. */
function ventanilla() {
  const x = 2990;
  return `<g class="capa capa-ventanilla" id="ventanilla">
    <ellipse cx="${x}" cy="${PISO + 6}" rx="150" ry="12" fill="${C.sombra}" opacity=".45"/>
    <rect x="${x - 125}" y="920" width="250" height="${PISO - 920}" rx="16" fill="#7a5cf0"/>
    <path d="M${x + 40} 920h69a16 16 0 0 1 16 16v${PISO - 936}h-85z" fill="${C.tinta}" opacity=".16"/>
    <rect x="${x - 72}" y="960" width="144" height="84" rx="12" fill="#1b145a"/>
    <rect x="${x - 86}" y="1040" width="172" height="16" rx="8" fill="${C.crema}"/>
    <g id="ayudante">
      <rect x="${x - 26}" y="984" width="52" height="60" rx="22" fill="${C.lila}"/>
      <text x="${x}" y="1032" text-anchor="middle" font-size="24" fill="${C.tinta}" class="tsans">λ</text>
      <circle cx="${x}" cy="966" r="22" fill="#ffc9a3"/>
      <path d="M${x - 22} 964a22 22 0 0 1 44 0z" fill="${C.amarillo}"/>
      <rect x="${x - 26}" y="958" width="52" height="8" rx="4" fill="${C.amarillo}"/>
      <circle cx="${x - 7}" cy="970" r="2.8" fill="${C.tinta}"/><circle cx="${x + 7}" cy="970" r="2.8" fill="${C.tinta}"/>
      <path d="M${x - 5} 978q5 4 10 0" stroke="${C.tinta}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>
    <path d="M${x - 140} 920h280l-14-46h-252z" fill="${C.teal}"/>
    <path d="M${x - 140} 920h40l-8-46h-18zM${x - 60} 920h40l-4-46h-32zM${x + 20} 920h40v-46h-36zM${x + 100} 920h40l-14-46h-30z" fill="${C.blanco}" opacity=".85"/>
    <path d="M${x - 140} 920q20 16 40 0t40 0t40 0t40 0t40 0t40 0t40 0" fill="${C.teal}"/>
    ${pastilla(x, 1092, 'el ayudante · solo con timbre', { s: 15, bg: C.crema })}
    <g id="tb-timbre">
      <rect x="${x - 120}" y="980" width="30" height="44" rx="8" fill="${C.crema}"/>
      <circle cx="${x - 105}" cy="1002" r="9" fill="${C.rosa}"/>
      <circle class="toque" cx="${x - 105}" cy="1002" r="10" fill="none" stroke="${C.amarillo}" stroke-width="3"/>
    </g>
    <g class="capa capa-contador" id="tb-contador">
      ${pastilla(x, 1126, '494,077 pedidos · costo $0.00', { s: 16, bg: C.amarillo, mono: true })}
    </g>
    <g class="capa capa-reloj" id="tb-reloj">
      <circle cx="${x}" cy="812" r="40" fill="${C.blanco}"/>
      <circle cx="${x}" cy="812" r="40" fill="none" stroke="${C.rosa}" stroke-width="7"/>
      <circle cx="${x - 32}" cy="776" r="12" fill="${C.amarillo}"/><circle cx="${x + 32}" cy="776" r="12" fill="${C.amarillo}"/>
      <path d="M${x} 812V784M${x} 812l18 10" stroke="${C.tinta}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="${x}" cy="812" r="4" fill="${C.tinta}"/>
      ${pastilla(x + 120, 812, '2:00 a. m.', { s: 16, bg: C.tinta, fg: C.blanco, mono: true })}
    </g>
    ${pastilla(x, 862, 'antojitos al momento', { s: 16, bg: C.amarillo })}
  </g>`;
}

/** Todo el interior del SVG del mundo. */
export function mundo() {
  const rutas = Object.entries(RUTAS)
    .map(([id, d]) => `<path id="r-${id}" d="${d}"/>`)
    .join('');
  const rastros = Object.entries(RUTAS)
    .map(([id, d]) => `<path class="rastro" id="t-${id}" d="${d}" pathLength="1"/>`)
    .join('');
  return `
    <defs>
      <linearGradient id="g-cielo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0b0e3c"/><stop offset=".55" stop-color="#1a1259"/><stop offset="1" stop-color="#34196f"/>
      </linearGradient>
      <radialGradient id="g-niebla-rosa"><stop offset="0" stop-color="${C.rosa}" stop-opacity=".2"/><stop offset="1" stop-color="${C.rosa}" stop-opacity="0"/></radialGradient>
      <radialGradient id="g-niebla-ambar"><stop offset="0" stop-color="${C.naranja}" stop-opacity=".2"/><stop offset="1" stop-color="${C.naranja}" stop-opacity="0"/></radialGradient>
      <radialGradient id="g-niebla-lila"><stop offset="0" stop-color="${C.lila}" stop-opacity=".22"/><stop offset="1" stop-color="${C.lila}" stop-opacity="0"/></radialGradient>
      <radialGradient id="g-calido"><stop offset="0" stop-color="${C.amarillo}" stop-opacity=".22"/><stop offset="1" stop-color="${C.amarillo}" stop-opacity="0"/></radialGradient>
      <radialGradient id="g-luz"><stop offset="0" stop-color="${C.amarillo}" stop-opacity=".35"/><stop offset="1" stop-color="${C.amarillo}" stop-opacity="0"/></radialGradient>
      <g id="rutas" fill="none" stroke="none">${rutas}</g>
    </defs>
    ${cielo()}
    ${calle()}
    ${taqueria()}
    ${oficina()}
    ${cocina()}
    <rect id="oscuro-a" x="1216" y="772" width="740" height="${PISO - 772}" fill="#04051a"/>
    ${ventanilla()}
    ${anfitrion()}
    ${fila()}
    <g id="rastros">${rastros}</g>
    <g id="efimeros"></g>
    ${chuy()}
    <g id="encima"></g>`;
}
