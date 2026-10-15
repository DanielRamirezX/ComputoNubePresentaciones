// ---------------------------------------------------------------------------
// EL MUNDO
//
// Un solo dibujo grande (3200 × 1800) por el que se mueve la cámara.
// Arriba: el archivo con su encargado (Amazon RDS), la otra sucursal (la copia
// en espera de Multi-AZ) y, en la loma, el archivo de lujo de tres edificios
// (Aurora) con el archivero dormilón (Aurora Serverless).
// En medio: la papelería de don Beto con su libreta (una base instalada a mano
// en un servidor), la sala de consulta con sus fotocopias (réplicas de
// lectura) y el álbum de cada día (respaldos).
// Abajo: el guardarropa de fichas (DynamoDB), el contador (Redshift) y el
// tablero de corcho (Neptune).
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
  piel: '#ffc9a3',
  papel: '#fff6dc'
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

/** Un archivero de tres cajones, parado en (x, y). */
function archivero(x, y, k = 1, color = C.cian) {
  return `<g transform="translate(${x} ${y}) scale(${k})">
    <ellipse cy="3" rx="30" ry="6" fill="${C.sombra}" opacity=".45"/>
    <rect x="-25" y="-84" width="50" height="84" rx="7" fill="${color}"/>
    <path d="M8-84h10a7 7 0 0 1 7 7v70a7 7 0 0 1-7 7h-10z" fill="${C.tinta}" opacity=".16"/>
    <g fill="${C.tinta}" opacity=".2"><rect x="-19" y="-78" width="38" height="22" rx="4"/><rect x="-19" y="-52" width="38" height="22" rx="4"/><rect x="-19" y="-26" width="38" height="22" rx="4"/></g>
    <g fill="${C.tinta}"><rect x="-7" y="-70" width="14" height="5" rx="2.5"/><rect x="-7" y="-44" width="14" height="5" rx="2.5"/><rect x="-7" y="-18" width="14" height="5" rx="2.5"/></g>
  </g>`;
}

/** Una personita chiquita con lupa: alguien que solo viene a consultar. */
function lector(x, y, color, voltea = false) {
  return `<g transform="translate(${x} ${y}) scale(${voltea ? -1 : 1} 1)">
    <ellipse cy="3" rx="18" ry="5" fill="${C.sombra}" opacity=".45"/>
    <rect x="-15" y="-40" width="30" height="40" rx="13" fill="${color}"/>
    <circle cy="-52" r="15" fill="${C.piel}"/>
    <path d="M-15-54a15 15 0 0 1 30 0q-6-9-15-7t-15 7z" fill="#3a1f6b"/>
    <circle cx="-5" cy="-51" r="2.2" fill="${C.tinta}"/><circle cx="6" cy="-51" r="2.2" fill="${C.tinta}"/>
    <path d="M15-24l12-12" stroke="#8f7bd6" stroke-width="5" stroke-linecap="round"/>
    <circle cx="31" cy="-40" r="9" fill="${C.cian}" fill-opacity=".45" stroke="${C.blanco}" stroke-width="4"/>
  </g>`;
}

/** Un tache rojo: aparece con la bandera «error». */
function tache(x, y, k = 1, cls = 'tache--copia') {
  return `<g class="tache ${cls}" transform="translate(${x} ${y}) scale(${k})">
    <circle r="22" fill="${C.rosa}"/><circle r="22" fill="none" stroke="${C.blanco}" stroke-width="4.5"/>
    <path d="M-8-8l16 16M8-8l-16 16" stroke="${C.tinta}" stroke-width="6" stroke-linecap="round"/>
  </g>`;
}

// ---------------------------------------------------------------- personajes

/** Una caja chiquita con ojos: los clientes, los pedidos, las consultas. */
export function mini(color = C.cian, escala = 1) {
  return `<g transform="scale(${escala})">
    <ellipse cy="15" rx="13" ry="4" fill="${C.sombra}" opacity=".45"/>
    <rect x="-15" y="-15" width="30" height="28" rx="8" fill="${color}"/>
    <path d="M3-15h4a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H3z" fill="${C.tinta}" opacity=".16"/>
    <circle cx="-5" cy="-2" r="2.6" fill="${C.tinta}"/><circle cx="6" cy="-2" r="2.6" fill="${C.tinta}"/>
  </g>`;
}

/** Una hoja con renglones: una copia, una página del álbum. */
function hoja(escala = 1) {
  return `<g transform="scale(${escala})">
    <ellipse cy="21" rx="14" ry="4" fill="${C.sombra}" opacity=".45"/>
    <path d="M-16-20h22l10 10v28a3 3 0 0 1-3 3h-29a3 3 0 0 1-3-3v-35a3 3 0 0 1 3-3z" fill="${C.papel}"/>
    <path d="M6-20v10h10z" fill="${C.tinta}" opacity=".18"/>
    <path d="M-11-8h16M-11-1h22M-11 6h22M-11 13h14" stroke="${C.tinta}" stroke-opacity=".4" stroke-width="2.6" stroke-linecap="round"/>
  </g>`;
}

/** El diablito de la mudanza con una pila de libretas: AWS DMS. */
function carrito(escala = 1) {
  return `<g transform="scale(${escala})">
    <ellipse cy="34" rx="44" ry="7" fill="${C.sombra}" opacity=".45"/>
    <path d="M30-70V24H-22" fill="none" stroke="#8f7bd6" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="-26" y="-6" width="52" height="26" rx="5" fill="${C.rosa}"/>
    <rect x="-22" y="-28" width="46" height="22" rx="5" fill="${C.cian}"/>
    <rect x="-24" y="-50" width="48" height="22" rx="5" fill="${C.amarillo}"/>
    <rect x="-20" y="-68" width="42" height="18" rx="5" fill="${C.verde}"/>
    <g stroke="${C.tinta}" stroke-opacity=".35" stroke-width="2.5"><path d="M-18 7h36M-14-17h30M-16-39h32M-12-59h26"/></g>
    <circle cx="-6" cy="-41" r="2.6" fill="${C.tinta}"/><circle cx="6" cy="-41" r="2.6" fill="${C.tinta}"/>
    <circle class="rueda" cx="22" cy="28" r="9" fill="${C.tinta}"/><circle cx="22" cy="28" r="3.5" fill="${C.lila}"/>
  </g>`;
}

/** Las figuras que el guion puede soltar en el mapa. `alto` es a qué altura va su etiqueta. */
export const PIEZAS = {
  hoja: { svg: hoja, alto: 44 },
  carrito: { svg: carrito, alto: 92 }
};

// ------------------------------------------------------------------ rutas

/** Los caminos por los que viajan Tiki y compañía. */
export const RUTAS = {
  archivo: 'M600 948C760 760 1100 540 1350 610C1450 640 1500 660 1500 700',
  rebote: 'M1260 660C1330 560 1420 560 1478 650',
  'aur-2': 'M2450 590C2510 470 2600 470 2650 590',
  'aur-3': 'M2450 590C2560 420 2760 420 2850 590',
  despierta: 'M2760 600H2985',
  sync: 'M1700 650C1800 580 1900 580 1985 650',
  'pide-a': 'M1800 905C1700 860 1580 790 1530 735',
  'pide-b': 'M1800 905C1880 860 1990 800 2040 730',
  'copia-1': 'M1500 720C1430 790 1340 840 1310 875',
  'copia-2': 'M1500 720C1570 790 1660 840 1690 875',
  pagina: 'M1500 720C1700 640 2100 700 2230 860',
  baja: 'M1500 700C1720 860 2060 1080 2040 1250C2030 1340 1965 1350 1965 1405',
  query: 'M1500 1386C1470 1340 1420 1330 1390 1330',
  scan: 'M1500 1386C1300 1386 1170 1370 1170 1332H1830C1830 1370 1700 1386 1500 1386',
  adentro: 'M1070 702H1430',
  postit: 'M1070 702H1160',
  'a-dax': 'M1180 1452C1140 1452 1100 1440 1092 1412',
  mudanza: 'M700 1010C900 1010 1000 760 1290 750H1430',
  'a-guarda': 'M1080 1395H1440'
};

/** A dónde mira la cámara: [x, y, ancho, alto], siempre 16:9. Lo importante queda en el 68 % de arriba. */
export const CAM = {
  todo: [80, 240, 3120, 1755],
  mapa: [80, 140, 3120, 1755],
  tienda: [-60, 620, 1300, 731],
  libreta: [250, 770, 640, 360],
  archivo: [1050, 290, 1150, 647],
  sucursal: [1150, 300, 1300, 731],
  aurora: [2250, 250, 1000, 563],
  replicas: [880, 470, 1300, 731],
  respaldos: [1700, 510, 1000, 563],
  guarda: [960, 1010, 1150, 647],
  ganchos: [1130, 1090, 900, 506],
  cache: [1040, 330, 900, 506],
  otras: [2050, 940, 1250, 703],
  mudanza: [100, 230, 2050, 1153]
};

// ------------------------------------------------------------------ piezas

function cielo() {
  const r = semilla(31);
  let puntos = '';
  for (let i = 0; i < 170; i++) {
    const x = n(-500 + r() * 4300);
    const y = n(-100 + r() * 2100);
    const rad = n(0.9 + r() * 2.3);
    const titila = r() < 0.35;
    puntos += `<circle cx="${x}" cy="${y}" r="${rad}" fill="${C.blanco}" opacity="${n(0.12 + r() * 0.45)}"${titila ? ` class="titila" style="animation-delay:-${n(r() * 5)}s"` : ''}/>`;
  }
  return `
    <rect x="-700" y="-300" width="4700" height="2500" fill="url(#g-cielo)"/>
    <circle cx="560" cy="860" r="560" fill="url(#g-niebla-rosa)"/>
    <circle cx="1520" cy="1300" r="700" fill="url(#g-niebla-teal)"/>
    <circle cx="2700" cy="520" r="560" fill="url(#g-niebla-lila)"/>
    ${puntos}
    <ellipse cx="480" cy="1052" rx="500" ry="92" fill="${C.tierra}"/>
    <ellipse cx="1760" cy="752" rx="660" ry="52" fill="${C.tierra}"/>
    <ellipse cx="2740" cy="652" rx="440" ry="46" fill="${C.tierra}"/>
    <ellipse cx="1500" cy="972" rx="430" ry="40" fill="${C.tierra2}"/>
    <ellipse cx="2260" cy="985" rx="250" ry="32" fill="${C.tierra2}"/>
    <ellipse cx="1500" cy="1442" rx="540" ry="52" fill="${C.tierra}"/>
    <ellipse cx="2620" cy="1342" rx="560" ry="50" fill="${C.tierra}"/>`;
}

/** La papelería de don Beto, con su libreta en el mostrador: una base en tu propio servidor. */
function tienda() {
  const B = 1040;
  return `<g id="tienda">
    <ellipse cx="510" cy="${B + 4}" rx="300" ry="16" fill="${C.sombra}" opacity=".45"/>
    <rect x="270" y="810" width="500" height="${B - 810}" rx="14" fill="#5a4fd6"/>
    <path d="M640 810h118a12 12 0 0 1 12 12v${B - 822}H640z" fill="${C.tinta}" opacity=".18"/>
    <rect x="296" y="872" width="330" height="168" rx="10" fill="#231a6e"/>
    <ellipse cx="460" cy="930" rx="190" ry="90" fill="url(#g-calido)"/>
    <!-- repisa con cuadernos -->
    <path d="M312 902H612" stroke="#8f7bd6" stroke-width="6" stroke-linecap="round"/>
    <g>
      <rect x="322" y="876" width="16" height="25" rx="3" fill="${C.amarillo}"/><rect x="342" y="880" width="14" height="21" rx="3" fill="${C.rosa}"/>
      <rect x="360" y="874" width="17" height="27" rx="3" fill="${C.teal}"/><rect x="381" y="879" width="13" height="22" rx="3" fill="${C.lila}"/>
      <rect x="520" y="877" width="16" height="24" rx="3" fill="${C.cian}"/><rect x="540" y="881" width="14" height="20" rx="3" fill="${C.naranja}"/>
      <rect x="558" y="875" width="17" height="26" rx="3" fill="${C.verde}"/><rect x="579" y="880" width="14" height="21" rx="3" fill="${C.amarillo}"/>
    </g>
    <!-- don Beto -->
    <g id="beto" transform="translate(410 978)">
      <rect x="-30" y="-58" width="60" height="70" rx="24" fill="${C.teal}"/>
      <rect x="-20" y="-40" width="40" height="52" rx="10" fill="${C.blanco}"/>
      <circle cy="-82" r="27" fill="${C.piel}"/>
      <path d="M-27-84q-2-14 6-20M27-84q2-14-6-20" stroke="#8a8aa8" stroke-width="7" stroke-linecap="round" fill="none"/>
      <circle class="ojo" cx="-9" cy="-86" r="3" fill="${C.tinta}"/><circle class="ojo" cx="10" cy="-86" r="3" fill="${C.tinta}"/>
      <path d="M-14-72q7-8 14-2q7-6 14 2q-7 4-14 0q-7 4-14 0z" fill="#5d4a7a"/>
    </g>
    <!-- el mostrador y la libreta -->
    <rect x="300" y="975" width="322" height="65" rx="8" fill="${C.naranja}"/>
    <rect x="300" y="975" width="322" height="12" rx="6" fill="${C.amarillo}"/>
    <g transform="translate(500 966)"><g id="libreta">
      <path d="M-62-10l60-6v26l-60 6z" fill="${C.blanco}"/>
      <path d="M62-10l-60-6v26l60 6z" fill="${C.papel}"/>
      <path d="M-56-6l50-5M-56 0l50-5M-56 6l50-5" stroke="${C.cian}" stroke-width="1.6"/>
      <path d="M8-11l50 5M8-5l50 5M8 1l50 5" stroke="${C.cian}" stroke-width="1.6"/>
      <path d="M-30-14v24M32-12v24" stroke="${C.rosa}" stroke-width="1.6"/>
      <path d="M-2-16v26" stroke="#8f7bd6" stroke-width="3"/>
    </g></g>
    <!-- la puerta con su letrero -->
    <rect x="650" y="900" width="92" height="140" rx="10" fill="#231a6e"/>
    <rect x="660" y="912" width="72" height="62" rx="6" fill="#4cc9f0" opacity=".35"/>
    <circle cx="728" cy="990" r="5" fill="${C.amarillo}"/>
    <g id="tb-abierto">${pastilla(696, 944, 'ABIERTO', { s: 14, bg: C.verde, mono: true })}</g>
    <!-- el toldo y el nombre -->
    <path d="M256 818H784L768 860H272Z" fill="${C.rosa}"/>
    <path d="M256 818h48l-6 42h-26zM352 818h48l-4 42h-40zM448 818h48l-2 42h-44zM544 818h48v42h-46zM640 818h48l2 42h-44zM736 818h48l-16 42h-30z" fill="${C.blanco}" opacity=".85"/>
    ${pastilla(520, 786, 'Papelería El Lápiz', { s: 23, bg: C.amarillo })}
    ${arbol(200, B + 8, 26, '#28d7b4')}${arbol(860, B + 14, 22)}
    <!-- el registro de arranque (laboratorio) -->
    <g class="capa capa-log">
      <path d="M1052 900v130" stroke="#8f7bd6" stroke-width="8" stroke-linecap="round"/>
      <ellipse cx="1052" cy="1034" rx="40" ry="8" fill="${C.sombra}" opacity=".45"/>
      <rect x="912" y="716" width="280" height="190" rx="14" fill="${C.tinta}" stroke="#8f7bd6" stroke-width="6"/>
      <g class="log__lineas" font-size="15" fill="#7be495">
        <text class="tmono log__l" x="930" y="772">+----+---------+-----+</text>
        <text class="tmono log__l" x="930" y="794">| id | nombre  | cal |</text>
        <text class="tmono log__l" x="930" y="816">+----+---------+-----+</text>
        <text class="tmono log__l" x="930" y="838">|  1 | Ana     |  95 |</text>
        <text class="tmono log__l" x="930" y="860">|  3 | Mariana |  92 |</text>
        <text class="tmono log__l" x="930" y="882">|  2 | Luis    |  88 |</text>
      </g>
      ${pastilla(1052, 714, 'System log', { s: 17, bg: C.verde })}
    </g>
  </g>`;
}

/** El archivo con su encargado: Amazon RDS. */
function archivo() {
  return `<g id="archivo">
    <ellipse cx="1500" cy="744" rx="250" ry="14" fill="${C.sombra}" opacity=".5"/>
    <!-- el frontón -->
    <path d="M1260 492L1500 404L1740 492Z" fill="#e4dcff" stroke="#e4dcff" stroke-width="14" stroke-linejoin="round"/>
    <path d="M1500 404L1740 492H1500Z" fill="${C.tinta}" opacity=".12"/>
    <rect x="1262" y="492" width="476" height="22" rx="8" fill="#c9bdf5"/>
    <!-- el cuerpo -->
    <rect x="1280" y="514" width="440" height="226" rx="10" fill="#e4dcff"/>
    <path d="M1620 514h90a10 10 0 0 1 10 10v216h-100z" fill="${C.tinta}" opacity=".1"/>
    <g fill="#c9bdf5"><rect x="1294" y="530" width="22" height="210" rx="6"/><rect x="1684" y="530" width="22" height="210" rx="6"/></g>
    <!-- la ventanilla, con sus archiveros y el encargado -->
    <rect class="archivo__luz" x="1330" y="560" width="340" height="168" rx="12" fill="#231a6e"/>
    <ellipse cx="1500" cy="640" rx="170" ry="80" fill="url(#g-calido)" class="archivo__brillo"/>
    ${archivero(1372, 724, 0.9, C.cian)}${archivero(1428, 724, 0.9, C.amarillo)}${archivero(1484, 724, 0.9, C.rosa)}
    <g transform="translate(1610 712)"><g id="encargado">
      <ellipse cy="12" rx="26" ry="6" fill="${C.sombra}" opacity=".5"/>
      <g class="robot__cuerpo">
        <path d="M0-50v-12" stroke="${C.blanco}" stroke-width="4" stroke-linecap="round"/>
        <circle class="titila" cy="-64" r="6" fill="${C.amarillo}"/>
        <rect x="-26" y="-50" width="52" height="56" rx="14" fill="${C.teal}"/>
        <path d="M8-50h4a14 14 0 0 1 14 14v28a14 14 0 0 1-14 14h-4z" fill="${C.tinta}" opacity=".16"/>
        <rect x="-18" y="-40" width="36" height="20" rx="10" fill="${C.tinta}"/>
        <circle class="ojo" cx="-8" cy="-30" r="4" fill="${C.blanco}"/><circle class="ojo" cx="8" cy="-30" r="4" fill="${C.blanco}"/>
        <path d="M-26-20h-12v-16M26-20h12v-16" fill="none" stroke="${C.teal}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </g></g>
    <rect class="archivo__apagon" x="1330" y="560" width="340" height="168" rx="12" fill="${C.sombra}"/>
    <rect x="1320" y="722" width="360" height="18" rx="9" fill="#c9bdf5"/>
    ${tache(1440, 640, 1.2, 'tache--origen')}
    <g id="tb-archivo">${pastilla(1500, 378, 'El archivo', { s: 26, bg: C.amarillo })}</g>
    <g class="capa capa-encargado-etq">${pastilla(1610, 538, 'el encargado', { s: 16 })}</g>

    <!-- la libretita de lo más pedido: una caché -->
    <g class="capa capa-cache">
      <path d="M1186 690v50M1250 690v50" stroke="#8f7bd6" stroke-width="6" stroke-linecap="round"/>
      <rect x="1168" y="584" width="100" height="108" rx="10" fill="#d9a35c"/>
      <rect x="1176" y="592" width="84" height="92" rx="6" fill="#b47c3c"/>
      <g id="postits">
        <rect x="1182" y="598" width="34" height="32" rx="3" fill="${C.amarillo}" transform="rotate(-6 1199 614)"/>
        <rect x="1222" y="600" width="32" height="30" rx="3" fill="${C.rosa}" transform="rotate(5 1238 615)"/>
        <rect x="1186" y="640" width="32" height="32" rx="3" fill="${C.verde}" transform="rotate(4 1202 656)"/>
        <rect x="1224" y="642" width="30" height="30" rx="3" fill="${C.cian}" transform="rotate(-5 1239 657)"/>
        <path d="M1190 610h18M1190 617h12M1228 612h16M1228 619h10M1193 653h18M1231 655h14" stroke="${C.tinta}" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/>
      </g>
      <g id="tb-cache">${pastilla(1218, 556, 'lo más pedido', { s: 16 })}</g>
    </g>

    <!-- el candado de la organización (laboratorio) -->
    <g class="capa capa-candado">
      <path d="M1338 572L1662 716M1338 716L1662 572" stroke="#8a8aa8" stroke-width="9" stroke-linecap="round" stroke-dasharray="16 7"/>
      <g transform="translate(1500 650)"><g id="tb-candado">
        <path d="M-22-14v-18a22 22 0 0 1 44 0v18" fill="none" stroke="${C.blanco}" stroke-width="10"/>
        <rect x="-36" y="-16" width="72" height="58" rx="12" fill="${C.amarillo}" stroke="${C.tinta}" stroke-width="5"/>
        <text y="22" text-anchor="middle" font-size="20" fill="${C.tinta}" class="tmono">SCP</text>
      </g></g>
    </g>
  </g>`;
}

/** La otra sucursal, con su copia en espera: Multi-AZ. */
function sucursal() {
  const cable = 'M1720 640C1800 590 1900 590 1972 640';
  return `<g class="capa capa-sucursal">
    <ellipse cx="2070" cy="744" rx="170" ry="12" fill="${C.sombra}" opacity=".5"/>
    <path d="M1916 560L2070 500L2224 560Z" fill="#c9bdf5" stroke="#c9bdf5" stroke-width="12" stroke-linejoin="round"/>
    <rect x="1930" y="560" width="280" height="180" rx="10" fill="#c9bdf5"/>
    <path d="M2140 560h60a10 10 0 0 1 10 10v170h-70z" fill="${C.tinta}" opacity=".12"/>
    <rect class="sucursal__luz" x="1964" y="596" width="212" height="132" rx="10" fill="#231a6e"/>
    ${archivero(2020, 724, 0.8, C.cian)}${archivero(2068, 724, 0.8, C.amarillo)}${archivero(2116, 724, 0.8, C.rosa)}
    <rect x="1956" y="722" width="228" height="16" rx="8" fill="#b6a8ee"/>
    ${tache(2016, 664)}
    ${pastilla(2070, 472, 'otra sucursal', { s: 19, bg: C.lila })}
    <g class="capa capa-multiaz">
      <path d="${cable}" fill="none" stroke="#12b3a1" stroke-width="10" stroke-linecap="round"/>
      <path class="cable" d="${cable}" fill="none" stroke="${C.teal}" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="10 12"/>
      ${pastilla(1846, 566, 'copia al instante', { s: 15.5, bg: C.teal })}
      ${pastilla(1500, 780, 'zona a', { s: 16, bg: C.verde })}
      ${pastilla(2070, 780, 'zona b', { s: 16, bg: C.cian })}
    </g>
    <g class="capa capa-corona" transform="translate(2070 426)">
      <g class="flota">
        <path d="M-34 14l-6-34 20 16 20-26 20 26 20-16-6 34z" fill="${C.amarillo}" stroke="${C.tinta}" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="-20" cy="-4" r="3.5" fill="${C.rosa}"/><circle cy="-14" r="4" fill="${C.teal}"/><circle cx="20" cy="-4" r="3.5" fill="${C.rosa}"/>
      </g>
    </g>
  </g>`;
}

/** El archivo de lujo en la loma: tres edificios con dos copias cada uno (Aurora), y el dormilón (Aurora Serverless). */
function aurora() {
  const edificio = (x, c) => `<g>
    <ellipse cx="${x}" cy="644" rx="86" ry="9" fill="${C.sombra}" opacity=".45"/>
    <path d="M${x - 78} 520L${x} 476L${x + 78} 520Z" fill="${C.amarillo}" stroke="${C.amarillo}" stroke-width="10" stroke-linejoin="round"/>
    <rect x="${x - 70}" y="520" width="140" height="120" rx="10" fill="${c}"/>
    <path d="M${x + 30} 520h30a10 10 0 0 1 10 10v110h-40z" fill="${C.tinta}" opacity=".14"/>
    <rect x="${x - 56}" y="538" width="112" height="96" rx="8" fill="#231a6e"/>
    <g class="capa capa-seis">${archivero(x - 24, 628, 0.62, C.cian)}${archivero(x + 24, 628, 0.62, C.rosa)}</g>
  </g>`;
  return `<g id="aurora">
    ${edificio(2450, '#7a5cf0')}${edificio(2650, '#5a4fd6')}${edificio(2850, '#7a5cf0')}
    ${pastilla(2650, 436, 'el archivo de lujo · 3 edificios', { s: 20, bg: C.amarillo })}
    ${arbol(2330, 652, 22, '#28d7b4')}
    <g class="capa capa-dormilon">
      <g id="dormilon" transform="translate(3030 640)">
        <ellipse cy="3" rx="34" ry="7" fill="${C.sombra}" opacity=".45"/>
        <rect x="-30" y="-96" width="60" height="96" rx="10" fill="${C.lila}"/>
        <path d="M10-96h10a10 10 0 0 1 10 10v76a10 10 0 0 1-10 10h-10z" fill="${C.tinta}" opacity=".16"/>
        <g fill="${C.tinta}" opacity=".2"><rect x="-23" y="-56" width="46" height="22" rx="4"/><rect x="-23" y="-28" width="46" height="22" rx="4"/></g>
        <g class="dormilon__ojos--abiertos"><circle cx="-10" cy="-74" r="6" fill="${C.blanco}"/><circle cx="10" cy="-74" r="6" fill="${C.blanco}"/><circle cx="-9" cy="-73" r="3" fill="${C.tinta}"/><circle cx="11" cy="-73" r="3" fill="${C.tinta}"/></g>
        <g class="dormilon__ojos--cerrados" stroke="${C.tinta}" stroke-width="3.5" fill="none" stroke-linecap="round"><path d="M-16-74q6 5 12 0M4-74q6 5 12 0"/></g>
        <g class="zzz" fill="${C.blanco}">
          <text class="tsans z1" x="22" y="-104" font-size="22">z</text><text class="tsans z2" x="36" y="-124" font-size="27">z</text><text class="tsans z3" x="52" y="-148" font-size="33">Z</text>
        </g>
      </g>
      ${pastilla(3030, 690, 'el dormilón', { s: 17 })}
    </g>
  </g>`;
}

/** La sala de consulta: fotocopias del archivo para los que solo leen (réplicas de lectura). */
function salaDeConsulta() {
  const mesa = (x) => `<g>
    <rect x="${x - 72}" y="952" width="144" height="14" rx="7" fill="${C.naranja}"/>
    <path d="M${x - 60} 966v44M${x + 60} 966v44" stroke="#c46a2a" stroke-width="8" stroke-linecap="round"/>
    <g transform="translate(${x} 930)">${hoja(1.1)}</g>
    ${tache(x + 34, 900, 0.85)}
  </g>`;
  return `<g class="capa capa-replicas"><g transform="translate(0 -50)">
    <path d="M1500 794C1430 820 1340 880 1310 930" fill="none" stroke="${C.raya}" stroke-width="5" stroke-dasharray="3 14" stroke-linecap="round"/>
    <path d="M1500 794C1570 820 1660 880 1690 930" fill="none" stroke="${C.raya}" stroke-width="5" stroke-dasharray="3 14" stroke-linecap="round"/>
    ${mesa(1310)}${mesa(1690)}
    ${lector(1190, 1012, C.rosa)}${lector(1430, 1012, C.amarillo, true)}${lector(1570, 1012, C.verde)}${lector(1810, 1012, C.cian, true)}
    ${pastilla(1310, 1050, 'fotocopia 1', { s: 16 })}${pastilla(1690, 1050, 'fotocopia 2', { s: 16 })}
  </g></g>`;
}

/** El álbum de cada día y el reloj: los respaldos automáticos. */
function album() {
  let dias = '';
  for (let f = 0; f < 4; f++) {
    for (let c = 0; c < 7; c++) {
      const i = f * 7 + c;
      dias += `<rect class="dia" x="${2176 + c * 22}" y="${846 + f * 22}" width="18" height="18" rx="4" fill="${i === 26 ? C.amarillo : C.blanco}" opacity="${i === 26 ? 1 : 0.75}" style="--i:${i}"/>`;
    }
  }
  return `<g class="capa capa-album"><g transform="translate(0 -70)">
    <path d="M2186 960l-14 26M2334 960l14 26M2260 960v26" stroke="#8f7bd6" stroke-width="7" stroke-linecap="round"/>
    <rect x="2160" y="808" width="186" height="156" rx="12" fill="${C.cian}"/>
    <rect x="2160" y="808" width="186" height="32" rx="12" fill="#1a8fd0"/>
    <text x="2253" y="830" text-anchor="middle" font-size="16" fill="${C.blanco}" class="tsans">un respaldo por día</text>
    ${dias}
    <g transform="translate(2398 820)"><g id="reloj">
      <circle r="38" fill="${C.blanco}" stroke="${C.tinta}" stroke-width="5"/>
      <path d="M0-28v5M28 0h-5M0 28v-5M-28 0h5" stroke="${C.tinta}" stroke-width="4" stroke-linecap="round"/>
      <path d="M0 0L-6-17" stroke="${C.tinta}" stroke-width="5" stroke-linecap="round"/>
      <path d="M0 0L23 9" stroke="${C.rosa}" stroke-width="4" stroke-linecap="round"/>
      <circle r="4" fill="${C.tinta}"/>
    </g></g>
    ${pastilla(2398, 886, '10:14', { s: 17, bg: C.tinta, fg: C.amarillo, mono: true })}
    ${pastilla(2253, 1010, 'el álbum · hasta 35 días', { s: 16.5 })}
  </g></g>`;
}

/** El guardarropa: una ficha y lo que quieras dentro (DynamoDB). */
function guardarropa() {
  const fichas = ['mía', 'toño', 'ana', 'beto', 'luis', 'sofi', 'leo'];
  const colores = [C.rosa, C.verde, C.amarillo, C.lila, C.cian, C.naranja, C.teal];
  const bolsa = (i, x) => {
    const c = colores[i];
    const formas = [
      `<rect x="-26" y="0" width="52" height="58" rx="14" fill="${c}"/><path d="M-12 0v-8a12 12 0 0 1 24 0v8" fill="none" stroke="${c}" stroke-width="5"/>`,
      `<path d="M-30 8h60l-6 52h-48z" fill="${c}"/><path d="M-14 8q14-22 28 0" fill="none" stroke="${c}" stroke-width="5"/>`,
      `<rect x="-34" y="4" width="68" height="48" rx="9" fill="${c}"/><rect x="-10" y="-4" width="20" height="10" rx="4" fill="none" stroke="${c}" stroke-width="5"/><path d="M-34 24h68" stroke="${C.tinta}" stroke-opacity=".2" stroke-width="4"/>`,
      `<ellipse cy="30" rx="30" ry="28" fill="${c}"/><path d="M-8 4q8-10 16 0" fill="none" stroke="${c}" stroke-width="5"/>`,
      `<rect x="-24" y="2" width="48" height="66" rx="16" fill="${c}"/><rect x="-14" y="30" width="28" height="22" rx="6" fill="${C.tinta}" opacity=".2"/><path d="M-10 2q10-14 20 0" fill="none" stroke="${c}" stroke-width="5"/>`,
      `<path d="M-26 6h52l8 46h-68z" fill="${c}"/><circle cx="0" cy="28" r="7" fill="${C.blanco}" opacity=".6"/>`,
      `<rect x="-22" y="6" width="44" height="54" rx="8" fill="${c}"/><path d="M-22 22h44" stroke="${C.tinta}" stroke-opacity=".2" stroke-width="4"/>`
    ];
    return `<g class="bolsa" transform="translate(${x} 1222)"><g id="bolsa-${fichas[i]}">
      <path d="M0-6v8" stroke="#8a8aa8" stroke-width="4"/>
      <g class="bolsa__cuerpo">${formas[i]}</g>
      ${pastilla(0, 104, fichas[i], { s: 15, bg: C.blanco, mono: true })}
    </g></g>`;
  };
  return `<g id="guardarropa">
    <ellipse cx="1500" cy="1440" rx="440" ry="16" fill="${C.sombra}" opacity=".5"/>
    <rect x="1090" y="1170" width="820" height="200" rx="18" fill="#3a2f9a"/>
    <rect x="1090" y="1170" width="820" height="200" rx="18" fill="url(#g-calido)" opacity=".6"/>
    <path d="M1110 1214H1890" stroke="#8a8aa8" stroke-width="8" stroke-linecap="round"/>
    ${fichas.map((_, i) => bolsa(i, 1170 + i * 110)).join('')}
    <rect x="1100" y="1360" width="800" height="72" rx="10" fill="${C.naranja}"/>
    <rect x="1100" y="1360" width="800" height="14" rx="7" fill="${C.amarillo}"/>
    <path d="M1700 1374h180v58h-180z" fill="${C.tinta}" opacity=".12"/>
    <g transform="translate(1860 1352)"><path d="M-16 0a16 16 0 0 1 32 0z" fill="${C.amarillo}"/><circle cy="-18" r="4" fill="${C.amarillo}"/><rect x="-20" y="-2" width="40" height="6" rx="3" fill="#c46a2a"/></g>
    <g id="tb-guarda">${pastilla(1500, 1132, 'El guardarropa', { s: 26, bg: C.amarillo })}</g>
    <g class="capa capa-dax">
      <rect x="1022" y="1384" width="52" height="46" rx="8" fill="#8f7bd6"/><rect x="1016" y="1378" width="64" height="12" rx="6" fill="#b69cff"/>
      <g transform="translate(1048 1370)"><g id="tb-dax">
        <rect x="-26" y="-26" width="52" height="30" rx="5" fill="${C.amarillo}" transform="rotate(-6)"/>
        <path d="M-18-16h30M-18-8h22" stroke="${C.tinta}" stroke-opacity=".5" stroke-width="3" stroke-linecap="round" transform="rotate(-6)"/>
      </g></g>
      ${pastilla(1048, 1322, 'libretita', { s: 15 })}
    </g>
  </g>`;
}

/** El contador que estudia años de ventas (Redshift) y el tablero de corcho (Neptune). */
function otras() {
  const libros = [
    ['2023', C.lila], ['2024', C.cian], ['2025', C.verde], ['2026', C.amarillo]
  ]
    .map(([a, c], i) => `<g><rect x="${2262}" y="${1238 - i * 26}" width="104" height="24" rx="5" fill="${c}"/><text x="2314" y="${1255 - i * 26}" text-anchor="middle" font-size="14" fill="${C.tinta}" class="tmono">${a}</text></g>`)
    .join('');
  const barras = [36, 54, 46, 72, 90]
    .map((h, i) => `<rect class="barra" x="${2410 + i * 26}" y="${1214 - h}" width="18" height="${h}" rx="4" fill="${[C.cian, C.verde, C.amarillo, C.rosa, C.teal][i]}" style="--i:${i}"/>`)
    .join('');
  const caras = [
    [2790, 1120, C.rosa], [2880, 1106, C.amarillo], [2966, 1132, C.verde],
    [2820, 1202, C.cian], [2920, 1214, C.lila], [3000, 1196, C.naranja]
  ];
  const hilos = [[0, 1], [1, 2], [0, 3], [3, 4], [1, 4], [4, 5], [2, 5]]
    .map(([a, b]) => `<path d="M${caras[a][0]} ${caras[a][1]}L${caras[b][0]} ${caras[b][1]}" stroke="${C.rosa}" stroke-width="3.5" stroke-linecap="round"/>`)
    .join('');
  return `<g id="otras">
    <!-- el contador -->
    <g id="contador">
      <rect x="2396" y="1086" width="170" height="140" rx="10" fill="#231a6e" stroke="#8f7bd6" stroke-width="5"/>
      <path d="M2406 1214H2556" stroke="${C.blanco}" stroke-opacity=".4" stroke-width="3"/>
      <g id="barras">${barras}</g>
      <g transform="translate(2510 1300)">
        <rect x="-26" y="-60" width="52" height="64" rx="20" fill="${C.rosa}"/>
        <circle cy="-82" r="23" fill="${C.piel}"/>
        <path d="M-23-86a23 23 0 0 1 46 0q-10-10-23-8t-23 8z" fill="#3a1f6b"/>
        <circle cx="-8" cy="-82" r="8" fill="none" stroke="${C.tinta}" stroke-width="3"/><circle cx="9" cy="-82" r="8" fill="none" stroke="${C.tinta}" stroke-width="3"/>
        <circle cx="-8" cy="-82" r="2.5" fill="${C.tinta}"/><circle cx="9" cy="-82" r="2.5" fill="${C.tinta}"/>
      </g>
      <rect x="2236" y="1264" width="330" height="16" rx="8" fill="${C.naranja}"/>
      <path d="M2252 1280v54M2550 1280v54" stroke="#c46a2a" stroke-width="9" stroke-linecap="round"/>
      ${libros}
      ${pastilla(2400, 1016, 'el contador · años de ventas', { s: 18 })}
    </g>
    <!-- el tablero de corcho -->
    <g id="corcho">
      <path d="M2790 1280v54M2980 1280v54" stroke="#8f7bd6" stroke-width="8" stroke-linecap="round"/>
      <rect x="2752" y="1078" width="276" height="206" rx="12" fill="#c9884a"/>
      <rect x="2764" y="1090" width="252" height="182" rx="6" fill="#d9a35c"/>
      <g class="hilos">${hilos}</g>
      ${caras.map(([x, y, c]) => `<g transform="translate(${x} ${y})"><circle r="19" fill="${c}"/><circle cx="-6" cy="-3" r="2.4" fill="${C.tinta}"/><circle cx="6" cy="-3" r="2.4" fill="${C.tinta}"/><path d="M-5 6q5 4 10 0" stroke="${C.tinta}" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cy="-19" r="4" fill="${C.rosa}"/></g>`).join('')}
      ${pastilla(2890, 1016, 'el tablero de corcho', { s: 18 })}
    </g>
    ${arbol(3110, 1346, 22, '#28d7b4')}
  </g>`;
}

function tiki() {
  return `<g id="tiki" transform="translate(600 948)">
    <g class="tiki__salto">
      <ellipse cy="35" rx="25" ry="7" fill="${C.sombra}" opacity=".5"/>
      <g class="tiki__cuerpo">
        <path d="M-27-34h54v62l-7 6-6.7-6-6.7 6-6.6-6-6.7 6-6.6-6-6.7 6-7-6z" fill="${C.papel}"/>
        <path d="M12-34h15v62l-7 6-6.7-6-1.3 1.2z" fill="${C.tinta}" opacity=".08"/>
        <rect x="-27" y="-34" width="54" height="10" fill="${C.rosa}"/>
        <circle cx="-9" cy="-9" r="7" fill="${C.blanco}" stroke="${C.tinta}" stroke-opacity=".12"/><circle cx="9" cy="-9" r="7" fill="${C.blanco}" stroke="${C.tinta}" stroke-opacity=".12"/>
        <circle class="pupila" cx="-7.5" cy="-8" r="3.4" fill="${C.tinta}"/><circle class="pupila" cx="10.5" cy="-8" r="3.4" fill="${C.tinta}"/>
        <path d="M-6 3q6 5.5 12 0" stroke="${C.tinta}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M-17 13h22M-17 20h30" stroke="${C.tinta}" stroke-opacity=".3" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="-17" cy="-1" r="3" fill="${C.rosa}" opacity=".45"/><circle cx="17" cy="-1" r="3" fill="${C.rosa}" opacity=".45"/>
      </g>
    </g>
    <g id="tiki-etq" transform="translate(0 -64)">
      <path d="M-7 13h14l-7 9z" fill="${C.blanco}"/>
      <rect id="tiki-etq-caja" x="-50" y="-15" width="100" height="30" rx="15" fill="${C.blanco}"/>
      <text id="tiki-etq-texto" x="0" y="6" text-anchor="middle" font-size="17" fill="${C.tinta}" class="tmono"></text>
    </g>
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
      <radialGradient id="g-niebla-teal"><stop offset="0" stop-color="${C.cian}" stop-opacity=".16"/><stop offset="1" stop-color="${C.cian}" stop-opacity="0"/></radialGradient>
      <radialGradient id="g-niebla-lila"><stop offset="0" stop-color="${C.lila}" stop-opacity=".2"/><stop offset="1" stop-color="${C.lila}" stop-opacity="0"/></radialGradient>
      <radialGradient id="g-calido"><stop offset="0" stop-color="${C.amarillo}" stop-opacity=".34"/><stop offset="1" stop-color="${C.amarillo}" stop-opacity="0"/></radialGradient>
      <g id="rutas" fill="none" stroke="none">${rutas}</g>
    </defs>
    ${cielo()}
    <path d="${RUTAS.archivo}" fill="none" stroke="${C.raya}" stroke-width="5" stroke-dasharray="3 15" stroke-linecap="round" opacity=".8"/>
    ${aurora()}
    ${salaDeConsulta()}
    ${album()}
    ${sucursal()}
    ${archivo()}
    ${tienda()}
    ${guardarropa()}
    ${otras()}
    <g id="rastros">${rastros}</g>
    <g id="efimeros"></g>
    ${tiki()}
    <g id="encima"></g>`;
}
