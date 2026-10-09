// ---------------------------------------------------------------------------
// EL MUNDO
//
// Un solo dibujo grande (3200 × 1800) por el que se mueve la cámara. De
// izquierda a derecha: la ciudad de Ana, la agenda (DNS), la autopista
// (internet) y el fraccionamiento amurallado (la VPC) con sus dos calles.
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
  blanco: '#f7f4ff'
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

/** Una etiqueta redonda con texto. El ancho se estima por número de letras. */
function pastilla(x, y, txt, o = {}) {
  const { s = 20, bg = C.blanco, fg = C.tinta, mono = false, cls = '', id = '' } = o;
  const w = Math.round(txt.length * s * (mono ? 0.61 : 0.57) + s * 1.4);
  const h = Math.round(s * 1.8);
  return `<g class="pastilla ${cls}"${id ? ` id="${id}"` : ''}>
    <rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${w}" height="${h}" rx="${h / 2}" fill="${bg}"/>
    <text x="${x}" y="${n(y + s * 0.35)}" text-anchor="middle" font-size="${s}" fill="${fg}" class="${mono ? 'tmono' : 'tsans'}">${txt}</text>
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

/** Una casa de frente, parada sobre su punto base (x, y). */
function casa(x, y, o = {}) {
  const { c = C.cian, t = C.rosa, w = 120, h = 80, cls = '' } = o;
  const x0 = x - w / 2;
  const y0 = y - h;
  return `<g class="casa ${cls}">
    <ellipse cx="${x}" cy="${y + 4}" rx="${n(w * 0.6)}" ry="11" fill="${C.sombra}" opacity=".45"/>
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="11" fill="${c}"/>
    <path d="M${x + w * 0.16} ${y0}H${x + w / 2 - 11}a11 11 0 0 1 11 11V${y - 11}a11 11 0 0 1-11 11H${x + w * 0.16}z" fill="${C.tinta}" opacity=".15"/>
    <path d="M${x0 - 12} ${y0 + 5}L${x} ${y0 - 44}L${x + w / 2 + 12} ${y0 + 5}Z" fill="${t}" stroke="${t}" stroke-width="11" stroke-linejoin="round"/>
    <path d="M${x} ${y0 - 44}L${x + w / 2 + 12} ${y0 + 5}H${x + 10}Z" fill="${C.tinta}" opacity=".16"/>
    <rect class="ventana" x="${x0 + 14}" y="${y0 + 18}" width="26" height="26" rx="6" fill="#ffe27a"/>
    <rect class="ventana ventana--b" x="${x + w / 2 - 40}" y="${y0 + 18}" width="26" height="26" rx="6" fill="#ffe27a"/>
    <path d="M${x - 14} ${y}v-36a14 14 0 0 1 28 0v36z" fill="${C.tinta}" opacity=".72"/>
    <circle cx="${x + 7}" cy="${y - 20}" r="2.6" fill="${C.amarillo}"/>
  </g>`;
}

/** El guardia de la puerta de una casa: el grupo de seguridad. */
function guardia(x, y, cls = '') {
  return `<g class="guardia ${cls}" transform="translate(${x} ${y})">
    <ellipse cy="19" rx="17" ry="5" fill="${C.sombra}" opacity=".5"/>
    <g class="guardia__cuerpo">
      <circle r="19" fill="${C.rosa}"/>
      <path d="M0-19a19 19 0 0 1 0 38z" fill="${C.tinta}" opacity=".16"/>
      <path d="M-19-6a19 19 0 0 1 38 0z" fill="#2a1a6e"/>
      <rect x="-23" y="-8" width="34" height="6" rx="3" fill="#2a1a6e"/>
      <circle cy="-13" r="4" fill="${C.amarillo}"/>
      <circle class="ojo" cx="-7" cy="3" r="3.2" fill="${C.blanco}"/><circle class="ojo" cx="7" cy="3" r="3.2" fill="${C.blanco}"/>
    </g>
  </g>`;
}

/** La caseta de la entrada de una calle: la NACL. `y` es la base, `yCalle` el eje de la calle. */
function caseta(x, y, yCalle, cls = '') {
  return `<g class="caseta ${cls}">
    <ellipse cx="${x}" cy="${y + 3}" rx="36" ry="7" fill="${C.sombra}" opacity=".45"/>
    <rect x="${x - 28}" y="${y - 62}" width="56" height="62" rx="8" fill="${C.lila}"/>
    <path d="M${x + 6} ${y - 62}h14a8 8 0 0 1 8 8v46a8 8 0 0 1-8 8h-14z" fill="${C.tinta}" opacity=".16"/>
    <rect x="${x - 36}" y="${y - 74}" width="72" height="16" rx="8" fill="${C.amarillo}"/>
    <path d="M${x - 20} ${y - 74}h12l-8 16h-12zM${x + 4} ${y - 74}h12l-8 16h-12z" fill="${C.tinta}" opacity=".55"/>
    <rect x="${x - 18}" y="${y - 48}" width="36" height="24" rx="6" fill="${C.tinta}" opacity=".75"/>
    <circle class="ojo" cx="${x - 7}" cy="${y - 36}" r="3" fill="${C.blanco}"/><circle class="ojo" cx="${x + 7}" cy="${y - 36}" r="3" fill="${C.blanco}"/>
    <g class="pluma">
      <rect x="${x - 6}" y="${yCalle - 34}" width="12" height="68" rx="6" fill="${C.blanco}"/>
      <path d="M${x - 6} ${yCalle - 18}h12v12h-12zM${x - 6} ${yCalle + 6}h12v12h-12z" fill="${C.rosa}"/>
    </g>
  </g>`;
}

/** Un letrero con tablas: la tabla de rutas. Cada tabla es { t, tipo, id }. */
function letrero(x, yPoste, tablas, o = {}) {
  const { w = 220, alto = 44, s = 17, id = '', cls = '', titulo = '' } = o;
  const y0 = yPoste - 14 - tablas.length * (alto + 6);
  const color = { local: C.teal, puerta: C.amarillo, nat: C.naranja };
  const filas = tablas
    .map((b, i) => {
      const y = y0 + i * (alto + 6);
      if (b.tipo === 'vacia') {
        return `<g class="tabla tabla--vacia"${b.id ? ` id="${b.id}"` : ''}>
          <rect x="${x - w / 2}" y="${y}" width="${w}" height="${alto}" rx="10" fill="none" stroke="${C.blanco}" stroke-opacity=".55" stroke-width="2.5" stroke-dasharray="9 7"/>
          <text x="${x}" y="${y + alto / 2 + 6}" text-anchor="middle" font-size="15.5" fill="${C.blanco}" opacity=".85" class="tsans">${b.t}</text>
        </g>`;
      }
      return `<g class="tabla tabla--${b.tipo}"${b.id ? ` id="${b.id}"` : ''}>
        <rect x="${x - w / 2}" y="${y}" width="${w}" height="${alto}" rx="10" fill="${color[b.tipo]}"/>
        <rect x="${x - w / 2}" y="${y + alto - 9}" width="${w}" height="9" rx="4.5" fill="${C.tinta}" opacity=".16"/>
        <text x="${x}" y="${y + alto / 2 + 4}" text-anchor="middle" font-size="${s}" fill="${C.tinta}" class="tmono">${b.t}</text>
      </g>`;
    })
    .join('');
  return `<g class="letrero ${cls}"${id ? ` id="${id}"` : ''}>
    <ellipse cx="${x}" cy="${yPoste + 2}" rx="20" ry="5" fill="${C.sombra}" opacity=".45"/>
    <rect x="${x - 5}" y="${y0 + 10}" width="10" height="${yPoste - y0 - 10}" rx="4" fill="#8f7bd6"/>
    ${filas}
    ${titulo ? pastilla(x, y0 - 21, titulo, { s: 16.5, bg: C.tinta, fg: C.blanco, cls: 'letrero__titulo' }) : ''}
  </g>`;
}

/** Un paquete chiquito: el tráfico de la autopista, los intrusos, las respuestas. */
export function mini(color = C.cian, escala = 1) {
  return `<g transform="scale(${escala})">
    <ellipse cy="15" rx="13" ry="4" fill="${C.sombra}" opacity=".45"/>
    <rect x="-15" y="-15" width="30" height="28" rx="8" fill="${color}"/>
    <path d="M3-15h4a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H3z" fill="${C.tinta}" opacity=".16"/>
    <circle cx="-5" cy="-2" r="2.6" fill="${C.tinta}"/><circle cx="6" cy="-2" r="2.6" fill="${C.tinta}"/>
  </g>`;
}

// ------------------------------------------------------------------ rutas

/** Los caminos por los que viajan los paquetes. */
export const RUTAS = {
  consulta: 'M640 960C700 760 900 640 1090 620',
  autopista: 'M700 1060C950 1320 1280 1260 1440 1070S1600 960 1690 960',
  entrar: 'M1690 960H1880',
  'al-cruce': 'M1880 960H2060',
  'a-caseta': 'M2060 960V850H2105',
  'a-casa': 'M2105 850H2300',
  'a-puerta': 'M2300 850V800',
  'casa-bd': 'M2300 850H2060V1210H2360',
  'bd-nat': 'M2360 1210H2060V850H2700',
  'nat-fuera': 'M2700 850H2060V960H1690',
  intruso: 'M1420 1085C1500 990 1600 960 1700 960',
  'intruso-calle': 'M2060 850H2190'
};

/** A dónde mira la cámara: [x, y, ancho, alto], siempre 16:9. Lo importante queda en el 70 % de arriba. */
export const CAM = {
  todo: [150, 330, 3000, 1688],
  mapa: [100, 176, 3000, 1688],
  ana: [-60, 790, 1250, 703],
  consulta: [150, 430, 1906, 1072],
  internet: [450, 782, 1500, 844],
  vpc: [1420, 520, 2000, 1125],
  puerta: [1330, 748, 900, 506],
  cruce: [1580, 729, 760, 428],
  caseta: [1710, 666, 860, 484],
  casa: [1950, 599, 760, 428],
  calles: [1645, 580, 1830, 1029],
  privada: [1950, 902, 1100, 619],
  intruso: [1110, 648, 1300, 731]
};

// ------------------------------------------------------------------ piezas

function cielo() {
  const r = semilla(11);
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
    <circle cx="900" cy="300" r="620" fill="url(#g-niebla-rosa)"/>
    <circle cx="2700" cy="1500" r="760" fill="url(#g-niebla-teal)"/>
    <circle cx="2500" cy="200" r="520" fill="url(#g-niebla-lila)"/>
    ${puntos}
    <ellipse cx="430" cy="1160" rx="470" ry="110" fill="${C.tierra}"/>
    <ellipse cx="1150" cy="700" rx="250" ry="60" fill="${C.tierra}"/>
    <ellipse cx="1250" cy="1520" rx="330" ry="80" fill="${C.tierra}" opacity=".8"/>
    <ellipse cx="1500" cy="560" rx="200" ry="52" fill="${C.tierra}" opacity=".7"/>`;
}

function ciudadDeAna() {
  const r = semilla(4);
  const edificio = (x, w, h, c) => {
    let v = '';
    for (let fy = 0; fy < Math.floor((h - 26) / 30); fy++) {
      for (let fx = 0; fx < Math.floor((w - 16) / 24); fx++) {
        const luz = r() < 0.55;
        v += `<rect x="${x - w / 2 + 12 + fx * 24}" y="${1130 - h + 16 + fy * 30}" width="13" height="17" rx="3" fill="${luz ? '#ffe27a' : C.tinta}" opacity="${luz ? 0.95 : 0.35}"${luz && r() < 0.4 ? ' class="ventana"' : ''}/>`;
      }
    }
    return `<g>
      <rect x="${x - w / 2}" y="${1130 - h}" width="${w}" height="${h}" rx="12" fill="${c}"/>
      <path d="M${x + w * 0.2} ${1130 - h}H${x + w / 2 - 12}a12 12 0 0 1 12 12V1130H${x + w * 0.2}z" fill="${C.tinta}" opacity=".18"/>
      ${v}
    </g>`;
  };
  return `<g id="ciudad">
    <ellipse cx="380" cy="1134" rx="260" ry="16" fill="${C.sombra}" opacity=".45"/>
    ${edificio(210, 96, 190, '#5a4fd6')}
    ${edificio(310, 110, 270, '#7a5cf0')}
    ${edificio(420, 92, 160, '#4a66e8')}
    ${arbol(150, 1136, 22)}
    ${arbol(770, 1150, 24, '#28d7b4')}
    <g id="ana" transform="translate(505 1130)">
      <ellipse cy="3" rx="30" ry="7" fill="${C.sombra}" opacity=".45"/>
      <rect x="-27" y="-74" width="54" height="74" rx="24" fill="${C.teal}"/>
      <path d="M4-74h-1a24 24 0 0 1 24 24v26a24 24 0 0 1-24 24h1z" fill="${C.tinta}" opacity=".16"/>
      <circle cy="-98" r="27" fill="#ffc9a3"/>
      <path d="M-27-100a27 27 0 0 1 54 0q-4-15-27-12t-27 12z" fill="#3a1f6b"/>
      <circle cx="-9" cy="-95" r="3" fill="${C.tinta}"/><circle cx="10" cy="-95" r="3" fill="${C.tinta}"/>
      <path d="M-6-85q7 6 13 0" stroke="${C.tinta}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    </g>
    ${pastilla(505, 1168, 'Ana', { s: 19 })}
    <g id="celular" transform="translate(600 1050)">
      <ellipse cy="100" rx="52" ry="9" fill="${C.sombra}" opacity=".45"/>
      <rect x="-55" y="-95" width="110" height="190" rx="22" fill="${C.tinta}"/>
      <rect x="-46" y="-80" width="92" height="160" rx="13" fill="url(#g-pantalla)"/>
      <rect x="-37" y="-66" width="74" height="24" rx="12" fill="${C.blanco}"/>
      <text x="0" y="-49" text-anchor="middle" font-size="13.5" fill="${C.tinta}" class="tsans">tienda.com</text>
      <rect x="-37" y="-30" width="74" height="42" rx="9" fill="${C.blanco}" opacity=".3"/>
      <rect x="-37" y="20" width="34" height="42" rx="9" fill="${C.blanco}" opacity=".3"/>
      <rect x="3" y="20" width="34" height="42" rx="9" fill="${C.blanco}" opacity=".3"/>
      <circle class="toque" cx="18" cy="-54" r="10" fill="none" stroke="${C.amarillo}" stroke-width="3"/>
    </g>
  </g>`;
}

function agenda() {
  return `<g id="agenda">
    <ellipse cx="1150" cy="712" rx="170" ry="20" fill="${C.sombra}" opacity=".45"/>
    <g class="flota">
      <path d="M1150 574L1018 540V676L1150 708L1282 676V540Z" fill="${C.rosa}"/>
      <path d="M1150 562L1030 532V656L1150 686Z" fill="${C.blanco}"/>
      <path d="M1150 562L1270 532V656L1150 686Z" fill="#e4dcff"/>
      <path d="M1048 566l84 21M1048 594l84 21M1048 622l84 21M1168 587l84-21M1168 615l84-21M1168 643l84-21" stroke="#b9aee6" stroke-width="5" stroke-linecap="round"/>
      <path d="M1236 520v70l-14-12-14 12v-70z" fill="${C.amarillo}"/>
      <g class="capa capa-resuelto">
        <rect x="1040" y="560" width="96" height="26" rx="8" fill="${C.amarillo}" transform="rotate(14 1088 573)"/>
        <rect x="1164" y="560" width="96" height="26" rx="8" fill="${C.teal}" transform="rotate(-14 1212 573)"/>
      </g>
    </g>
    ${pastilla(1150, 754, 'La agenda · DNS (Route 53)', { s: 21 })}
  </g>`;
}

function autopista() {
  const carril = (color, dur, inicio, dy, reversa) => `<g>
      <g transform="translate(0 ${dy})">${mini(color, 0.85)}</g>
      <animateMotion dur="${dur}s" begin="-${inicio}s" repeatCount="indefinite"${reversa ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ''}><mpath href="#r-autopista"/></animateMotion>
    </g>`;
  return `<g id="autopista">
    <path d="${RUTAS.consulta}" fill="none" stroke="${C.raya}" stroke-width="5" stroke-dasharray="3 15" stroke-linecap="round" opacity=".8"/>
    <path d="${RUTAS.autopista}" fill="none" stroke="${C.viaBorde}" stroke-width="92" stroke-linecap="round"/>
    <path d="${RUTAS.autopista}" fill="none" stroke="${C.via}" stroke-width="78" stroke-linecap="round"/>
    <path class="rayas" d="${RUTAS.autopista}" fill="none" stroke="${C.raya}" stroke-width="5" stroke-dasharray="26 24"/>
    <g id="trafico">
      ${carril(C.cian, 13, 1, -17, false)}
      ${carril(C.lila, 13, 5.5, -17, false)}
      ${carril(C.verde, 13, 9.5, -17, false)}
      ${carril(C.rosa, 15, 2, 17, true)}
      ${carril(C.naranja, 15, 8, 17, true)}
      ${carril(C.cian, 15, 12, 17, true)}
    </g>
    ${pastilla(1120, 1180, 'Internet: la autopista', { s: 21, bg: C.tinta, fg: C.blanco })}
    <g opacity=".85">
      ${casa(1190, 1512, { c: '#5a4fd6', t: '#8f7bd6', w: 76, h: 52 })}
      ${casa(1290, 1528, { c: '#4a66e8', t: '#8f7bd6', w: 76, h: 52 })}
      ${arbol(1370, 1530, 20)}
      ${casa(1480, 566, { c: '#5a4fd6', t: '#8f7bd6', w: 76, h: 52 })}
      ${arbol(1560, 570, 20, '#28d7b4')}
    </g>
  </g>`;
}

function fraccionamiento() {
  const muro = 'M1760 890V620Q1760 560 1820 560H3030Q3090 560 3090 620V1300Q3090 1360 3030 1360H1820Q1760 1360 1760 1300V1030';
  return `<g id="vpc">
    <path d="${muro}Z" fill="#18246f"/>
    <path d="${muro}Z" fill="url(#g-pasto)" opacity=".5"/>

    <!-- las dos calles como grupos de direcciones -->
    <g class="capa capa-zonas">
      <rect x="2120" y="630" width="940" height="300" rx="34" fill="${C.verde}" fill-opacity=".13" stroke="${C.verde}" stroke-width="3" stroke-dasharray="14 10"/>
      <rect x="2120" y="990" width="940" height="300" rx="34" fill="${C.rosa}" fill-opacity=".12" stroke="${C.rosa}" stroke-width="3" stroke-dasharray="14 10"/>
    </g>

    <g class="capa capa-calles">
      <path d="M1771 960H2060M2060 850V1210M2060 850H2800M2060 1210H2800" fill="none" stroke="${C.viaBorde}" stroke-width="72" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M1771 960H2060M2060 850V1210M2060 850H2800M2060 1210H2800" fill="none" stroke="${C.via}" stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M1771 960H2060M2060 850V1210M2060 850H2800M2060 1210H2800" fill="none" stroke="${C.raya}" stroke-width="4" stroke-dasharray="18 18" opacity=".8"/>
    </g>

    <g class="capa capa-zonas">
      ${pastilla(2345, 930, 'Calle pública · subred 10.0.1.0/24', { s: 22, bg: C.verde, id: 'etq-publica' })}
      <g id="etq-privada">${pastilla(2345, 1290, 'Calle privada · subred 10.0.2.0/24', { s: 22, bg: C.rosa, fg: C.blanco })}</g>
      <g id="etq-renombrada">${pastilla(2345, 1290, 'Calle «publica-1a» · 10.0.2.0/24', { s: 22, bg: C.amarillo })}</g>
    </g>

    <g class="capa capa-casas">
      ${arbol(2210, 1076, 22)}${arbol(2680, 946, 20, '#28d7b4')}${arbol(3010, 1340, 22)}${arbol(1850, 1300, 26)}${arbol(1930, 1322, 20, '#28d7b4')}${arbol(1850, 650, 24, '#28d7b4')}
      ${casa(2300, 806, { c: C.cian, t: C.rosa, cls: 'casa--web' })}
      ${casa(2500, 806, { c: '#7a8cf5', t: C.naranja })}
      ${casa(2360, 1166, { c: C.amarillo, t: '#7a5cf0', cls: 'casa--bd' })}
      ${casa(2580, 1166, { c: '#7a8cf5', t: C.naranja })}
      ${pastilla(2300, 644, 'servidor web', { s: 17, bg: C.tinta, fg: C.blanco })}
      ${pastilla(2360, 1004, 'base de datos', { s: 17, bg: C.tinta, fg: C.blanco })}
    </g>

    <g class="capa capa-ips">
      ${pastilla(2300, 706, '10.0.1.25', { s: 19, mono: true })}
      ${pastilla(2500, 706, '10.0.1.26', { s: 19, mono: true })}
      ${pastilla(2360, 1066, '10.0.2.40', { s: 19, mono: true })}
      ${pastilla(2580, 1066, '10.0.2.41', { s: 19, mono: true })}
    </g>
    <g class="capa capa-publica">
      ${pastilla(2300, 608, 'desde afuera: 203.0.113.10', { s: 16.5, bg: C.amarillo, mono: true })}
    </g>

    <g class="capa capa-nat">
      <ellipse cx="2700" cy="810" rx="46" ry="9" fill="${C.sombra}" opacity=".45"/>
      <rect x="2664" y="736" width="72" height="70" rx="14" fill="${C.naranja}"/>
      <path d="M2706 736h16a14 14 0 0 1 14 14v42a14 14 0 0 1-14 14h-16z" fill="${C.tinta}" opacity=".16"/>
      <path class="nat__flecha" d="M2680 771h34m-13-13l13 13-13 13" fill="none" stroke="${C.tinta}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      ${pastilla(2700, 710, 'NAT · solo salida', { s: 17, bg: C.tinta, fg: C.blanco })}
    </g>

    <g class="capa capa-letrero-cruce">
      ${letrero(1916, 925, [{ t: '10.0.0.0/16 → local', tipo: 'local', id: 'tb-cruce' }], { id: 'lt-cruce', w: 206, s: 16 })}
    </g>
    <g class="capa capa-letreros">
      ${letrero(2940, 905, [{ t: '10.0.0.0/16 → local', tipo: 'local' }, { t: '0.0.0.0/0 → puerta', tipo: 'puerta', id: 'tb-puerta' }], { id: 'lt-publica', titulo: 'tabla de rutas' })}
      ${letrero(2940, 1265, [{ t: '10.0.0.0/16 → local', tipo: 'local' }, { t: 'sin letrero a la puerta', tipo: 'vacia', id: 'tb-vacia' }], { id: 'lt-privada', titulo: 'tabla de rutas' })}
    </g>
    <g class="capa capa-ruta-nat">
      <g class="tabla tabla--nat" id="tb-nat">
        <rect x="2830" y="1215" width="220" height="44" rx="10" fill="${C.naranja}"/>
        <text x="2940" y="1241" text-anchor="middle" font-size="17" fill="${C.tinta}" class="tmono">0.0.0.0/0 → NAT</text>
      </g>
    </g>

    <g class="capa capa-casetas">
      ${caseta(2150, 806, 850, 'caseta--publica')}
      ${caseta(2150, 1166, 1210, 'caseta--privada')}
    </g>
    <g class="capa capa-guardias">
      ${guardia(2386, 790, 'guardia--web')}
      ${guardia(2586, 790)}
      ${guardia(2446, 1150)}
      ${guardia(2666, 1150)}
    </g>

    <!-- la barda y la puerta -->
    <path d="${muro}" fill="none" stroke="#0f8f84" stroke-width="30" stroke-linecap="round"/>
    <path id="barda" d="${muro}" fill="none" stroke="${C.teal}" stroke-width="18" stroke-linecap="round" pathLength="1"/>
    <path d="${muro}" fill="none" stroke="${C.tinta}" stroke-opacity=".28" stroke-width="18" stroke-dasharray="20 26"/>
    <g id="puerta">
      <g class="pluma-puerta">
        <rect x="1753" y="892" width="14" height="136" rx="7" fill="${C.blanco}"/>
        <path d="M1753 915h14v20h-14zM1753 958h14v20h-14zM1753 1000h14v16h-14z" fill="${C.rosa}"/>
      </g>
      <rect x="1730" y="834" width="60" height="62" rx="12" fill="#12b3a1"/>
      <path d="M1722 840L1760 800L1798 840Z" fill="${C.rosa}" stroke="${C.rosa}" stroke-width="10" stroke-linejoin="round"/>
      <rect x="1730" y="1024" width="60" height="62" rx="12" fill="#12b3a1"/>
      <path d="M1766 834h12a12 12 0 0 1 12 12v38a12 12 0 0 1-12 12h-12zM1766 1024h12a12 12 0 0 1 12 12v38a12 12 0 0 1-12 12h-12z" fill="${C.tinta}" opacity=".18"/>
      <circle class="foco" cx="1760" cy="866" r="9"/><circle class="foco" cx="1760" cy="1056" r="9"/>
    </g>
    <g class="capa capa-vpc-etq">
      ${pastilla(2425, 560, 'VPC · 10.0.0.0/16 · el fraccionamiento', { s: 28, bg: C.teal })}
    </g>
    <g class="capa capa-puerta-etq">
      ${pastilla(1760, 766, 'La puerta · Internet Gateway', { s: 20 })}
    </g>
  </g>`;
}

function paqui() {
  return `<g id="paqui" transform="translate(690 1000)">
    <g class="paqui__salto">
      <ellipse cy="31" rx="27" ry="7" fill="${C.sombra}" opacity=".5"/>
      <g class="paqui__caja">
        <rect x="-30" y="-30" width="60" height="58" rx="14" fill="${C.amarillo}"/>
        <path d="M8-30h8a14 14 0 0 1 14 14v30a14 14 0 0 1-14 14H8z" fill="${C.naranja}" opacity=".55"/>
        <rect x="-30" y="12" width="60" height="9" fill="${C.naranja}" opacity=".9"/>
        <circle cx="-11" cy="-8" r="7.5" fill="${C.blanco}"/><circle cx="12" cy="-8" r="7.5" fill="${C.blanco}"/>
        <circle class="pupila" cx="-9.5" cy="-7" r="3.6" fill="${C.tinta}"/><circle class="pupila" cx="13.5" cy="-7" r="3.6" fill="${C.tinta}"/>
        <path d="M-6 4q6.5 6 13 0" stroke="${C.tinta}" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
    </g>
    <g id="paqui-etq" transform="translate(0 -60)">
      <path d="M-7 13h14l-7 9z" fill="${C.blanco}"/>
      <rect id="paqui-etq-caja" x="-50" y="-15" width="100" height="30" rx="15" fill="${C.blanco}"/>
      <text id="paqui-etq-texto" x="0" y="6" text-anchor="middle" font-size="17" fill="${C.tinta}" class="tmono"></text>
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
      <radialGradient id="g-niebla-teal"><stop offset="0" stop-color="${C.teal}" stop-opacity=".14"/><stop offset="1" stop-color="${C.teal}" stop-opacity="0"/></radialGradient>
      <radialGradient id="g-niebla-lila"><stop offset="0" stop-color="${C.lila}" stop-opacity=".2"/><stop offset="1" stop-color="${C.lila}" stop-opacity="0"/></radialGradient>
      <radialGradient id="g-pasto" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#2a3ba8"/><stop offset="1" stop-color="#18246f" stop-opacity="0"/></radialGradient>
      <linearGradient id="g-pantalla" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.teal}"/><stop offset="1" stop-color="${C.cian}"/></linearGradient>
      <g id="rutas" fill="none" stroke="none">${rutas}</g>
    </defs>
    ${cielo()}
    ${autopista()}
    ${ciudadDeAna()}
    ${agenda()}
    ${fraccionamiento()}
    <g id="rastros">${rastros}</g>
    <g id="efimeros"></g>
    ${paqui()}
    <g id="encima"></g>`;
}
