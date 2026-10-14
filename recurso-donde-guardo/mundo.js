// ---------------------------------------------------------------------------
// EL MUNDO
//
// Un solo dibujo grande (3200 × 1800) por el que se mueve la cámara. De
// izquierda a derecha: la ciudad de Ana (y, arriba, el hospital con su camión),
// la bodega con forma de cubeta (Amazon S3) con sus sótanos fríos (las clases
// de almacenamiento) y el barrio de los servidores con su cajón (EBS), su
// pizarrón (instance store) y el estante de todos (EFS).
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
  hielo: '#bfefff'
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

/** Una casa de frente, parada sobre su punto base (x, y): un servidor. */
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

/** Un letrero con tablas: la regla de ciclo de vida. Cada tabla es { t, tipo, id }. */
function letrero(x, yPoste, tablas, o = {}) {
  const { w = 220, alto = 44, s = 17, id = '', cls = '', titulo = '' } = o;
  const y0 = yPoste - 14 - tablas.length * (alto + 6);
  const color = { tibio: C.lila, frio: C.cian };
  const filas = tablas
    .map((b, i) => {
      const y = y0 + i * (alto + 6);
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

/** Un candado chiquito, centrado en (x, y). */
function candado(x, y, k = 1) {
  return `<g transform="translate(${x} ${y}) scale(${k})">
    <path d="M-4.5-4v-4.5a4.5 4.5 0 0 1 9 0v4.5" fill="none" stroke="${C.blanco}" stroke-width="3"/>
    <rect x="-8" y="-5" width="16" height="13" rx="3.5" fill="${C.blanco}" stroke="${C.tinta}" stroke-width="2"/>
    <circle cy="1.5" r="2" fill="${C.tinta}"/>
  </g>`;
}

/** Una fila de cajas guardadas sobre una repisa, cada una con su candado (capa «candados»). */
function cajas(x0, yBase, cuantas, paleta, o = {}) {
  const { paso = 48, nieve = false, hielo = false } = o;
  let s = '';
  for (let i = 0; i < cuantas; i++) {
    const x = x0 + i * paso;
    const alto = 22 + ((i * 7) % 3) * 4;
    s += `<g>
      <rect x="${x}" y="${yBase - alto}" width="30" height="${alto}" rx="5" fill="${paleta[i % paleta.length]}"/>
      <rect x="${x + 19}" y="${yBase - alto}" width="11" height="${alto}" rx="5" fill="${C.tinta}" opacity=".16"/>
      <rect x="${x + 5}" y="${yBase - alto + 6}" width="12" height="4" rx="2" fill="${C.tinta}" opacity=".45"/>
      ${nieve ? `<path d="M${x - 2} ${yBase - alto + 3}q0-7 8-7h18q8 0 8 7q-5 4-9 0q-4 5-8 0q-4 4-8 0q-5 3-9 0z" fill="${C.blanco}"/>` : ''}
      ${hielo ? `<rect x="${x - 5}" y="${yBase - alto - 6}" width="40" height="${alto + 6}" rx="7" fill="${C.hielo}" fill-opacity=".42" stroke="#e8fbff" stroke-width="2"/>` : ''}
      <g class="capa capa-candados">${candado(x + 15, yBase - alto / 2 + 2, 0.72)}</g>
    </g>`;
  }
  return s;
}

/** Carámbanos colgando de un techo. */
function carambanos(x0, x1, y, cuantos, largo, seed) {
  const r = semilla(seed);
  const paso = (x1 - x0) / cuantos;
  let d = '';
  for (let i = 0; i < cuantos; i++) {
    const w = paso * (0.55 + r() * 0.4);
    const h = largo * (0.45 + r() * 0.55);
    const x = x0 + i * paso + (paso - w) / 2;
    d += `M${n(x)} ${y}l${n(w / 2)} ${n(h)}l${n(w / 2)} ${n(-h)}z`;
  }
  return `<path d="${d}" fill="${C.hielo}"/>`;
}

/** Copos quietos que titilan: el frío de los sótanos. */
function copos(x0, x1, y0, y1, cuantos, seed) {
  const r = semilla(seed);
  let s = '';
  for (let i = 0; i < cuantos; i++) {
    s += `<circle cx="${n(x0 + r() * (x1 - x0))}" cy="${n(y0 + r() * (y1 - y0))}" r="${n(1.6 + r() * 1.8)}" fill="${C.blanco}" opacity="${n(0.35 + r() * 0.5)}" class="titila" style="animation-delay:-${n(r() * 4)}s"/>`;
  }
  return s;
}

/** El cajón del servidor: un volumen EBS. */
function cajonera(x, y, k = 1) {
  return `<g class="cajonera" transform="translate(${x} ${y}) scale(${k})">
    <ellipse cy="4" rx="42" ry="8" fill="${C.sombra}" opacity=".45"/>
    <rect x="-35" y="-74" width="70" height="74" rx="10" fill="${C.amarillo}"/>
    <path d="M12-74h13a10 10 0 0 1 10 10v54a10 10 0 0 1-10 10h-13z" fill="${C.naranja}" opacity=".5"/>
    <rect x="-27" y="-65" width="54" height="24" rx="6" fill="${C.tinta}" opacity=".22"/>
    <rect x="-27" y="-35" width="54" height="24" rx="6" fill="${C.tinta}" opacity=".22"/>
    <rect x="-9" y="-56" width="18" height="6" rx="3" fill="${C.tinta}"/>
    <rect x="-9" y="-26" width="18" height="6" rx="3" fill="${C.tinta}"/>
    <circle class="titila" cx="21" cy="-59" r="3" fill="${C.teal}"/>
  </g>`;
}

// ---------------------------------------------------------------- personajes

/** Una caja chiquita: lo que se guarda, los curiosos, los pedidos. */
export function mini(color = C.cian, escala = 1) {
  return `<g transform="scale(${escala})">
    <ellipse cy="15" rx="13" ry="4" fill="${C.sombra}" opacity=".45"/>
    <rect x="-15" y="-15" width="30" height="28" rx="8" fill="${color}"/>
    <path d="M3-15h4a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H3z" fill="${C.tinta}" opacity=".16"/>
    <circle cx="-5" cy="-2" r="2.6" fill="${C.tinta}"/><circle cx="6" cy="-2" r="2.6" fill="${C.tinta}"/>
  </g>`;
}

/** Una foto chiquita: las copias de Foti. */
function miniFoto(escala = 1) {
  return `<g transform="scale(${escala})">
    <ellipse cy="19" rx="13" ry="4" fill="${C.sombra}" opacity=".45"/>
    <rect x="-15" y="-17" width="30" height="34" rx="5" fill="${C.blanco}"/>
    <rect x="-11" y="-13" width="22" height="20" rx="3" fill="${C.cian}"/>
    <circle cx="6" cy="-8" r="2.6" fill="${C.amarillo}"/>
    <path d="M-11 2q4-4 7.3 0t7.3 0t7.4 0v2a3 3 0 0 1-3 3h-16a3 3 0 0 1-3-3z" fill="#1a8fd0"/>
    <circle cx="-4" cy="-4" r="2.3" fill="${C.tinta}"/><circle cx="4" cy="-4" r="2.3" fill="${C.tinta}"/>
  </g>`;
}

/** El retrato del cajón: un snapshot. */
function retrato(escala = 1) {
  return `<g transform="scale(${escala})">
    <ellipse cy="23" rx="16" ry="4.5" fill="${C.sombra}" opacity=".45"/>
    <rect x="-21" y="-21" width="42" height="42" rx="8" fill="${C.lila}"/>
    <rect x="-15" y="-15" width="30" height="30" rx="4" fill="${C.tinta}"/>
    <rect x="-8" y="-9" width="16" height="18" rx="3" fill="${C.amarillo}"/>
    <path d="M-4-3h8M-4 4h8" stroke="${C.tinta}" stroke-width="2.4" stroke-linecap="round"/>
  </g>`;
}

/** El camión de la mudanza con el aparato a bordo: AWS Snowball. */
function camion() {
  return `<g>
    <ellipse cy="31" rx="62" ry="7" fill="${C.sombra}" opacity=".45"/>
    <rect x="-62" y="-46" width="84" height="64" rx="10" fill="${C.teal}"/>
    <path d="M-2-46h14a10 10 0 0 1 10 10v44a10 10 0 0 1-10 10h-14z" fill="${C.tinta}" opacity=".16"/>
    <rect x="-48" y="-32" width="40" height="36" rx="7" fill="${C.blanco}"/>
    <path d="M-36-32v-6a8 8 0 0 1 16 0v6" fill="none" stroke="${C.blanco}" stroke-width="5"/>
    <circle cx="-34" cy="-14" r="2.8" fill="${C.tinta}"/><circle cx="-22" cy="-14" r="2.8" fill="${C.tinta}"/>
    <path d="M-33-6q5 4 10 0" stroke="${C.tinta}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M22-24h20a8 8 0 0 1 7 4l9 16a8 8 0 0 1 1 4v10a8 8 0 0 1-8 8h-29z" fill="${C.amarillo}"/>
    <path d="M28-17h12a4 4 0 0 1 3.5 2l6 11h-21.5z" fill="${C.tinta}" opacity=".7"/>
    <rect x="-62" y="12" width="121" height="8" rx="4" fill="${C.tinta}" opacity=".3"/>
    <g class="rueda"><circle cx="-38" cy="20" r="12" fill="${C.tinta}"/><circle cx="-38" cy="20" r="5" fill="${C.lila}"/></g>
    <g class="rueda"><circle cx="36" cy="20" r="12" fill="${C.tinta}"/><circle cx="36" cy="20" r="5" fill="${C.lila}"/></g>
  </g>`;
}

/** Las figuras que el guion puede soltar en el mapa. `alto` es a qué altura va su etiqueta. */
export const PIEZAS = {
  foto: { svg: miniFoto, alto: 44 },
  retrato: { svg: retrato, alto: 48 },
  camion: { svg: camion, alto: 76 }
};

// ------------------------------------------------------------------ rutas

/** Los caminos por los que viajan Foti y compañía. */
export const RUTAS = {
  subir: 'M690 910C700 560 1150 370 1390 410C1470 424 1500 500 1500 768',
  'copia-b': 'M1500 768C1600 420 1900 480 1955 770',
  'copia-c': 'M1500 768C1640 380 2080 420 2140 750',
  curioso: 'M900 770Q1020 800 1140 790',
  'a-ia': 'M1500 768H1640V954H1500',
  'a-glacier': 'M1500 954H1330V1118H1500',
  'a-deep': 'M1500 1118H1640V1282H1500',
  pedido: 'M690 910C850 700 1050 620 1200 690',
  'robot-baja': 'M1450 768H1640V954H1450',
  retrato: 'M2612 716C2500 380 1900 300 1600 400C1520 430 1500 520 1500 700',
  'efs-2': 'M2940 812C2940 900 2760 880 2750 975',
  'efs-3': 'M2500 1070H2640',
  'efs-4': 'M2910 1070H2770',
  camion: 'M560 690H880C1000 690 1000 790 1100 790',
  rebote: 'M1130 480C1250 380 1400 380 1500 480'
};

/** A dónde mira la cámara: [x, y, ancho, alto], siempre 16:9. Lo importante queda en el 68 % de arriba. */
export const CAM = {
  todo: [80, 240, 3120, 1755],
  mapa: [80, 140, 3120, 1755],
  ana: [-120, 700, 1250, 703],
  subida: [80, 300, 1900, 1069],
  cubeta: [786, 290, 1387, 780],
  copias: [930, 270, 1387, 780],
  torre: [395, 500, 2170, 1220],
  piso0: [1030, 500, 900, 506],
  piso1: [1080, 800, 800, 450],
  piso2: [1080, 965, 800, 450],
  piso3: [1080, 1130, 800, 450],
  izquierda: [-100, 480, 2170, 1220],
  ebs: [2050, 540, 1000, 563],
  foto: [1040, 240, 1960, 1103],
  efs: [2000, 610, 1420, 799],
  camion: [150, 340, 1700, 956]
};

// ------------------------------------------------------------------ piezas

function cielo() {
  const r = semilla(23);
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
    <circle cx="700" cy="380" r="620" fill="url(#g-niebla-rosa)"/>
    <circle cx="1500" cy="1250" r="700" fill="url(#g-niebla-teal)"/>
    <circle cx="2700" cy="420" r="560" fill="url(#g-niebla-lila)"/>
    ${puntos}
    <ellipse cx="430" cy="1070" rx="470" ry="100" fill="${C.tierra}"/>
    <ellipse cx="1560" cy="828" rx="660" ry="62" fill="${C.tierra}"/>
    <ellipse cx="900" cy="1420" rx="300" ry="70" fill="${C.tierra}" opacity=".7"/>
    <ellipse cx="2150" cy="1480" rx="260" ry="60" fill="${C.tierra}" opacity=".6"/>`;
}

function ciudadDeAna() {
  const B = 1040; // el piso de la ciudad
  const r = semilla(4);
  const edificio = (x, w, h, c) => {
    let v = '';
    for (let fy = 0; fy < Math.floor((h - 26) / 30); fy++) {
      for (let fx = 0; fx < Math.floor((w - 16) / 24); fx++) {
        const luz = r() < 0.55;
        v += `<rect x="${x - w / 2 + 12 + fx * 24}" y="${B - h + 16 + fy * 30}" width="13" height="17" rx="3" fill="${luz ? '#ffe27a' : C.tinta}" opacity="${luz ? 0.95 : 0.35}"${luz && r() < 0.4 ? ' class="ventana"' : ''}/>`;
      }
    }
    return `<g>
      <rect x="${x - w / 2}" y="${B - h}" width="${w}" height="${h}" rx="12" fill="${c}"/>
      <path d="M${x + w * 0.2} ${B - h}H${x + w / 2 - 12}a12 12 0 0 1 12 12V${B}H${x + w * 0.2}z" fill="${C.tinta}" opacity=".18"/>
      ${v}
    </g>`;
  };
  return `<g id="ciudad">
    <ellipse cx="380" cy="${B + 4}" rx="260" ry="16" fill="${C.sombra}" opacity=".45"/>
    ${edificio(210, 96, 190, '#5a4fd6')}
    ${edificio(310, 110, 270, '#7a5cf0')}
    ${edificio(420, 92, 160, '#4a66e8')}
    ${arbol(150, B + 6, 22)}
    ${arbol(770, B + 20, 24, '#28d7b4')}
    <g id="ana" transform="translate(505 ${B})">
      <ellipse cy="3" rx="30" ry="7" fill="${C.sombra}" opacity=".45"/>
      <rect x="-27" y="-74" width="54" height="74" rx="24" fill="${C.teal}"/>
      <path d="M4-74h-1a24 24 0 0 1 24 24v26a24 24 0 0 1-24 24h1z" fill="${C.tinta}" opacity=".16"/>
      <circle cy="-98" r="27" fill="#ffc9a3"/>
      <path d="M-27-100a27 27 0 0 1 54 0q-4-15-27-12t-27 12z" fill="#3a1f6b"/>
      <circle cx="-9" cy="-95" r="3" fill="${C.tinta}"/><circle cx="10" cy="-95" r="3" fill="${C.tinta}"/>
      <path d="M-6-85q7 6 13 0" stroke="${C.tinta}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    </g>
    ${pastilla(505, B + 38, 'Ana', { s: 19 })}
    <g id="celular" transform="translate(600 ${B - 80})">
      <ellipse cy="100" rx="52" ry="9" fill="${C.sombra}" opacity=".45"/>
      <rect x="-55" y="-95" width="110" height="190" rx="22" fill="${C.tinta}"/>
      <rect x="-46" y="-80" width="92" height="160" rx="13" fill="url(#g-pantalla)"/>
      <rect x="-37" y="-70" width="74" height="24" rx="12" fill="${C.blanco}"/>
      <text x="0" y="-53" text-anchor="middle" font-size="13.5" fill="${C.tinta}" class="tsans">Mis fotos</text>
      <rect x="-37" y="-38" width="34" height="34" rx="8" fill="${C.amarillo}"/>
      <rect x="3" y="-38" width="34" height="34" rx="8" fill="${C.rosa}"/>
      <rect x="-37" y="2" width="34" height="34" rx="8" fill="${C.lila}"/>
      <rect x="3" y="2" width="34" height="34" rx="8" fill="${C.blanco}" opacity=".45"/>
      <rect x="-30" y="46" width="60" height="24" rx="12" fill="${C.tinta}"/>
      <text x="0" y="63" text-anchor="middle" font-size="13" fill="${C.blanco}" class="tsans">Subir</text>
      <circle class="toque" cx="0" cy="58" r="12" fill="none" stroke="${C.amarillo}" stroke-width="3"/>
    </g>
  </g>`;
}

/** El hospital con sus 120 TB, la carretera y el camión ya estacionado en la bodega. */
function hospital() {
  const via = 'M240 690H880C1000 690 1000 790 1120 790H1176';
  const r = semilla(9);
  let ventanas = '';
  for (let fy = 0; fy < 4; fy++) {
    for (let fx = 0; fx < 6; fx++) {
      const luz = r() < 0.6;
      ventanas += `<rect x="${296 + fx * 29}" y="${492 + fy * 34}" width="17" height="20" rx="4" fill="${luz ? '#ffe27a' : C.tinta}" opacity="${luz ? 0.95 : 0.3}"${luz && r() < 0.35 ? ' class="ventana"' : ''}/>`;
    }
  }
  return `<g class="capa capa-hospital">
    <ellipse cx="430" cy="652" rx="330" ry="52" fill="${C.tierra}"/>
    <path d="${via}" fill="none" stroke="${C.viaBorde}" stroke-width="66" stroke-linecap="round"/>
    <path d="${via}" fill="none" stroke="${C.via}" stroke-width="54" stroke-linecap="round"/>
    <path class="rayas" d="${via}" fill="none" stroke="${C.raya}" stroke-width="4" stroke-dasharray="26 24"/>
    <ellipse cx="420" cy="644" rx="190" ry="13" fill="${C.sombra}" opacity=".45"/>
    <rect x="280" y="470" width="200" height="170" rx="12" fill="#e4dcff"/>
    <path d="M430 470h38a12 12 0 0 1 12 12v158h-50z" fill="${C.tinta}" opacity=".14"/>
    ${ventanas}
    <rect x="346" y="436" width="68" height="44" rx="10" fill="${C.blanco}"/>
    <path d="M374 443h12v8h8v12h-8v8h-12v-8h-8v-12h8z" fill="${C.rosa}"/>
    <rect x="492" y="556" width="112" height="84" rx="10" fill="#5a4fd6"/>
    <path d="M574 556h20a10 10 0 0 1 10 10v74h-30z" fill="${C.tinta}" opacity=".18"/>
    <g fill="${C.tinta}" opacity=".7"><rect x="504" y="570" width="24" height="60" rx="4"/><rect x="536" y="570" width="24" height="60" rx="4"/><rect x="568" y="570" width="24" height="60" rx="4"/></g>
    <g fill="${C.teal}">
      <circle class="titila" cx="516" cy="582" r="3"/><circle class="titila" cx="548" cy="596" r="3" style="animation-delay:-1.1s"/><circle class="titila" cx="580" cy="582" r="3" style="animation-delay:-2.3s"/>
      <circle class="titila" cx="516" cy="610" r="3" style="animation-delay:-.6s"/><circle class="titila" cx="580" cy="612" r="3" style="animation-delay:-1.7s"/>
    </g>
    ${arbol(230, 646, 22, '#28d7b4')}${arbol(660, 648, 20)}
    ${pastilla(440, 404, 'Hospital · 120 TB de radiografías', { s: 20 })}
  </g>
  <g class="capa capa-camion-llego" transform="translate(1100 790)">${camion()}</g>`;
}

/** La bodega de AWS: una cubeta gigante. Amazon S3 y un bucket. */
function bodega() {
  const cuerpo = 'M1196 548H1764L1712 808Q1710 820 1698 820H1262Q1250 820 1248 808Z';
  const calidos = [C.amarillo, C.rosa, C.teal, C.cian, C.verde, C.lila, C.naranja];
  return `<g id="bodega">
    <ellipse cx="1480" cy="826" rx="290" ry="16" fill="${C.sombra}" opacity=".5"/>
    <path d="M1210 536C1210 330 1750 330 1750 536" fill="none" stroke="#6a55c7" stroke-width="18" stroke-linecap="round"/>
    <path d="M1210 536C1210 330 1750 330 1750 536" fill="none" stroke="#8f7bd6" stroke-width="9" stroke-linecap="round"/>
    <path d="${cuerpo}" fill="${C.naranja}"/>
    <path d="M1590 548H1764L1712 808Q1710 820 1698 820H1590Z" fill="${C.tinta}" opacity=".15"/>
    <path d="M1222 680L1738 680L1727 734L1233 734Z" fill="${C.tinta}" opacity=".08"/>

    <!-- por dentro: el mostrador -->
    <rect x="1290" y="604" width="380" height="196" rx="16" fill="#231a6e"/>
    <ellipse cx="1480" cy="660" rx="200" ry="110" fill="url(#g-calido)"/>
    <path d="M1480 604v22" stroke="#8f7bd6" stroke-width="4"/>
    <path d="M1462 640a18 18 0 0 1 36 0z" fill="${C.amarillo}"/>
    <path d="M1306 690H1654" stroke="#8f7bd6" stroke-width="7" stroke-linecap="round"/>
    ${cajas(1312, 686, 3, calidos)}${cajas(1552, 686, 2, calidos.slice(3))}
    <rect x="1290" y="786" width="380" height="14" rx="7" fill="${C.tinta}" opacity=".35"/>

    <!-- la orilla y el nombre -->
    <rect x="1176" y="520" width="608" height="46" rx="23" fill="${C.amarillo}"/>
    <rect x="1176" y="550" width="608" height="16" rx="8" fill="${C.naranja}" opacity=".55"/>
    <circle cx="1210" cy="540" r="11" fill="#6a55c7"/><circle cx="1750" cy="540" r="11" fill="#6a55c7"/>
    <g class="capa capa-nombre">
      <g id="etq-nombre">${pastilla(1480, 543, 'fotos-ana-20261013', { s: 21, bg: C.tinta, fg: C.blanco, mono: true, id: 'tb-nombre' })}</g>
      <g id="etq-tuya">${pastilla(1480, 543, 'fotos-tu-nombre-fecha', { s: 21, bg: C.tinta, fg: C.amarillo, mono: true })}</g>
    </g>

    <!-- la cortina: Block Public Access -->
    <g id="cortina">
      <rect x="1172" y="726" width="84" height="94" rx="12" fill="#d96a1e"/>
      <rect x="1184" y="740" width="60" height="80" rx="6" fill="${C.blanco}"/>
      <path d="M1184 754h60M1184 767h60M1184 780h60M1184 793h60M1184 806h60" stroke="${C.tinta}" stroke-opacity=".22" stroke-width="3"/>
      <rect x="1164" y="716" width="100" height="18" rx="9" fill="${C.rosa}"/>
      <g id="tb-candado">
        <path d="M1206 792v-7a8 8 0 0 1 16 0v7" fill="none" stroke="${C.tinta}" stroke-width="4.5"/>
        <rect x="1201" y="791" width="26" height="21" rx="5" fill="${C.amarillo}" stroke="${C.tinta}" stroke-width="3"/>
        <circle cx="1214" cy="801.5" r="3" fill="${C.tinta}"/>
      </g>
    </g>
    <g class="capa capa-cortina-etq">
      ${pastilla(1108, 856, 'la cortina: cerrada', { s: 17.5 })}
    </g>

    <g class="capa capa-bodega-etq">
      ${pastilla(1480, 340, 'La bodega infinita · Amazon S3', { s: 28, bg: C.naranja })}
    </g>
  </g>`;
}

/** Una cubeta chica al fondo: otro edificio de la bodega (otra zona de disponibilidad). */
function cubetaChica(x, y, txt) {
  return `<g>
    <ellipse cx="${x}" cy="${y + 4}" rx="86" ry="9" fill="${C.sombra}" opacity=".45"/>
    <g transform="translate(${x} ${y}) scale(.33)">
      <path d="M-270-284C-270-490 270-490 270-284" fill="none" stroke="#6a55c7" stroke-width="20" stroke-linecap="round"/>
      <path d="M-284-272H284L232-12Q230 0 218 0H-218Q-230 0-232-12Z" fill="#7a5cf0"/>
      <path d="M110-272H284L232-12Q230 0 218 0H110Z" fill="${C.tinta}" opacity=".18"/>
      <rect x="-190" y="-216" width="380" height="196" rx="20" fill="#231a6e"/>
      <rect x="-304" y="-300" width="608" height="46" rx="23" fill="${C.lila}"/>
    </g>
    <g class="capa capa-copias" transform="translate(${x} ${y - 36})"><g class="copia">${miniFoto(0.95)}</g></g>
    ${pastilla(x, y - 176, txt, { s: 17, bg: C.tinta, fg: C.blanco })}
  </g>`;
}

function zonasDeLaBodega() {
  return `<g class="capa capa-zonas">
    ${cubetaChica(2140, 800, 'zona c')}
    ${cubetaChica(1955, 820, 'zona b')}
  </g>`;
}

/** Los sótanos: las clases de almacenamiento, cada vez más frías. */
function sotanos() {
  const tibios = ['#9d8bf0', '#6fa8ff', '#b69cff', '#7a8cf5'];
  const frios = ['#7fd4ff', '#9fe0ff', '#5fb8f0'];
  const helados = ['#8fc7ff', '#b9e6ff'];
  const piso = (y, relleno, aws) => `
    <rect x="1250" y="${y}" width="460" height="140" rx="16" fill="${relleno}"/>
    <rect x="1250" y="${y + 126}" width="460" height="14" rx="7" fill="${C.tinta}" opacity=".3"/>
    <path d="M1266 ${y + 74}H1694" stroke="${C.blanco}" stroke-opacity=".28" stroke-width="6" stroke-linecap="round"/>
    <text x="1268" y="${y + 119}" font-size="15.5" fill="${C.blanco}" opacity=".85" class="tmono">${aws}</text>`;
  const lengueta = (y, izq, der, color, fg = C.tinta) => `
    ${pastilla(1264, y, izq, { s: 18, bg: color, fg, ancla: 'izq' })}
    ${pastilla(1696, y, der, { s: 16, bg: C.tinta, fg: C.blanco, ancla: 'der' })}`;
  return `<g class="capa capa-sotanos">
    <rect x="1228" y="812" width="504" height="526" rx="30" fill="#0d1040" stroke="${C.viaBorde}" stroke-width="5"/>

    <!-- las bajadas entre pisos -->
    <rect x="1610" y="786" width="60" height="70" fill="#3a2f9a"/>
    <rect x="1300" y="972" width="60" height="50" fill="#1d5fae"/>
    <rect x="1610" y="1136" width="60" height="50" fill="#0f3f86"/>

    ${piso(846, '#3a2f9a', 'S3 Standard-IA')}
    ${cajas(1276, 916, 4, tibios)}${cajas(1566, 916, 3, tibios.slice(1))}

    ${piso(1010, '#1d5fae', 'S3 Glacier Flexible')}
    ${cajas(1396, 1080, 3, frios, { nieve: true })}${cajas(1566, 1080, 3, frios.slice(1), { nieve: true })}
    ${carambanos(1262, 1698, 1010, 17, 26, 5)}
    ${copos(1262, 1698, 1040, 1136, 10, 6)}

    ${piso(1174, '#0f3f86', 'S3 Glacier Deep Archive')}
    ${cajas(1282, 1244, 4, helados, { hielo: true })}${cajas(1572, 1244, 3, helados, { hielo: true })}
    ${carambanos(1262, 1698, 1174, 22, 36, 8)}
    ${copos(1262, 1698, 1200, 1304, 22, 12)}
    <rect x="1250" y="1296" width="460" height="18" rx="9" fill="${C.hielo}" opacity=".5"/>

    <!-- el mostrador también es un piso -->
    <text x="1308" y="780" font-size="15.5" fill="${C.blanco}" opacity=".85" class="tmono">S3 Standard</text>
    <g id="tb-piso0">${lengueta(604, 'el mostrador', 'sale al instante', C.amarillo)}</g>
    <g id="tb-piso1">${lengueta(846, 'la trastienda', 'al instante, con cobro', C.lila)}</g>
    <g id="tb-piso2">${lengueta(1010, 'el cuarto frío', 'minutos a horas', C.cian)}</g>
    <g id="tb-piso3">${lengueta(1174, 'el congelador', 'hasta 12 horas', C.blanco)}</g>

    <path d="M1772 856V1290" stroke="${C.cian}" stroke-width="7" stroke-linecap="round"/>
    <path d="M1757 1278l15 20l15-20" fill="none" stroke="${C.cian}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    ${pastilla(1796, 1052, 'más barato guardar', { s: 17.5, bg: C.cian, ancla: 'izq' })}
    ${pastilla(1796, 1094, 'más lento sacar', { s: 17.5, bg: C.tinta, fg: C.blanco, ancla: 'izq' })}
  </g>`;
}

/** La regla del calendario y el bodeguero automático. */
function ayudantes() {
  return `<g class="capa capa-regla">
    ${letrero(1050, 706, [{ t: 'día 30 → trastienda', tipo: 'tibio', id: 'tb-dia30' }, { t: 'día 180 → congelador', tipo: 'frio', id: 'tb-dia180' }], { w: 256, s: 16.5, titulo: 'regla de ciclo de vida' })}
  </g>
  <g class="capa capa-robot">
    <g id="robot" transform="translate(1800 790)">
      <ellipse cy="27" rx="30" ry="7" fill="${C.sombra}" opacity=".5"/>
      <g class="robot__cuerpo">
        <path d="M0-44v-14" stroke="${C.blanco}" stroke-width="4" stroke-linecap="round"/>
        <circle class="titila" cy="-60" r="6" fill="${C.amarillo}"/>
        <rect x="-27" y="-44" width="54" height="56" rx="14" fill="${C.teal}"/>
        <path d="M8-44h5a14 14 0 0 1 14 14v28a14 14 0 0 1-14 14h-5z" fill="${C.tinta}" opacity=".16"/>
        <rect x="-19" y="-33" width="38" height="20" rx="10" fill="${C.tinta}"/>
        <circle class="ojo" cx="-8" cy="-23" r="4" fill="${C.blanco}"/><circle class="ojo" cx="8" cy="-23" r="4" fill="${C.blanco}"/>
        <rect x="-11" y="-4" width="22" height="6" rx="3" fill="${C.tinta}" opacity=".5"/>
        <path d="M-27-16h-10v18M27-16h10v18" fill="none" stroke="${C.teal}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <circle cx="-14" cy="17" r="9" fill="${C.tinta}"/><circle cx="14" cy="17" r="9" fill="${C.tinta}"/>
      <circle cx="-14" cy="17" r="3.5" fill="${C.lila}"/><circle cx="14" cy="17" r="3.5" fill="${C.lila}"/>
    </g>
    ${pastilla(1858, 706, 'bodeguero automático', { s: 17 })}
  </g>`;
}

/** El barrio de los servidores: cada uno con su cajón, y un estante para todos. */
function servidores() {
  const cable = (d) => `<path d="${d}" fill="none" stroke="#12b3a1" stroke-width="9" stroke-linecap="round"/><path class="cable" d="${d}" fill="none" stroke="${C.teal}" stroke-width="4" stroke-linecap="round" stroke-dasharray="10 12"/>`;
  const carpetas = (y) => {
    const r = semilla(y);
    const colores = [C.amarillo, C.rosa, C.teal, C.cian, C.verde, C.lila, C.naranja];
    let s = '';
    let x = 2646;
    let i = 0;
    while (x < 2756) {
      const w = 9 + Math.round(r() * 6);
      const h = 20 + Math.round(r() * 9);
      s += `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" rx="2.5" fill="${colores[(i++ + y) % colores.length]}"/>`;
      x += w + 3;
    }
    return s;
  };
  return `<g class="capa capa-servidores">
    <rect x="2290" y="590" width="400" height="620" rx="34" fill="${C.verde}" fill-opacity=".1" stroke="${C.verde}" stroke-width="3" stroke-dasharray="14 10"/>
    <rect x="2720" y="590" width="400" height="620" rx="34" fill="${C.cian}" fill-opacity=".1" stroke="${C.cian}" stroke-width="3" stroke-dasharray="14 10"/>
    ${pastilla(2490, 590, 'zona de disponibilidad a', { s: 18, bg: C.verde })}
    ${pastilla(2920, 590, 'zona de disponibilidad b', { s: 18, bg: C.cian })}

    ${arbol(3070, 1196, 22)}${arbol(2330, 1196, 20, '#28d7b4')}${arbol(3076, 800, 20, '#28d7b4')}

    <path d="M2520 772H2580" stroke="#12b3a1" stroke-width="9" stroke-linecap="round"/>
    <path d="M2838 772H2880" stroke="#12b3a1" stroke-width="9" stroke-linecap="round"/>
    ${casa(2460, 800, { c: C.cian, t: C.rosa, cls: 'casa--s1' })}
    <g id="cajon">${cajonera(2612, 800)}</g>
    ${casa(2940, 800, { c: '#7a8cf5', t: C.naranja })}
    ${cajonera(2812, 800, 0.8)}
    ${casa(2440, 1100, { c: '#9d8bf0', t: C.teal })}
    ${casa(2970, 1100, { c: '#6fa8ff', t: C.rosa })}
    ${pastilla(2460, 648, 'servidor', { s: 17, bg: C.tinta, fg: C.blanco })}

    <g class="capa capa-ebs-etq">
      ${pastilla(2612, 836, 'el cajón · EBS', { s: 17.5 })}
    </g>

    <g class="capa capa-pizarron">
      <path d="M2334 772l-8 28M2370 772l8 28" stroke="#8f7bd6" stroke-width="6" stroke-linecap="round"/>
      <rect x="2318" y="716" width="68" height="56" rx="8" fill="#8f7bd6"/>
      <rect x="2324" y="722" width="56" height="44" rx="4" fill="${C.blanco}"/>
      <g class="garabatos" fill="none" stroke-linecap="round" stroke-width="3.5">
        <path d="M2331 733q6-6 11 0t11 0t11 0" stroke="${C.rosa}"/>
        <path d="M2331 745h30" stroke="${C.tinta}"/>
        <path d="M2331 756h19" stroke="#12b3a1"/>
      </g>
      ${pastilla(2352, 836, 'el pizarrón', { s: 17.5 })}
    </g>

    <g class="capa capa-efs">
      ${cable('M2500 1070H2632')}
      ${cable('M2910 1070H2778')}
      ${cable('M2750 972C2760 880 2940 900 2940 812')}
      <ellipse cx="2705" cy="1104" rx="88" ry="10" fill="${C.sombra}" opacity=".45"/>
      <rect x="2630" y="966" width="150" height="134" rx="12" fill="#5b3f8f"/>
      <rect x="2640" y="976" width="130" height="114" rx="6" fill="${C.tinta}" opacity=".5"/>
      ${carpetas(1010)}${carpetas(1048)}${carpetas(1086)}
      <rect x="2636" y="1010" width="138" height="6" rx="3" fill="#8f7bd6"/>
      <rect x="2636" y="1048" width="138" height="6" rx="3" fill="#8f7bd6"/>
      <rect x="2636" y="1086" width="138" height="6" rx="3" fill="#8f7bd6"/>
      <g id="tb-estante">${pastilla(2705, 1136, 'el estante de todos · EFS', { s: 17.5 })}</g>
    </g>
  </g>`;
}

function foti() {
  return `<g id="foti" transform="translate(690 910)">
    <g class="foti__salto">
      <ellipse cy="35" rx="27" ry="7" fill="${C.sombra}" opacity=".5"/>
      <g class="foti__caja">
        <rect x="-30" y="-33" width="60" height="66" rx="9" fill="${C.blanco}"/>
        <rect x="-24" y="-27" width="48" height="42" rx="5" fill="url(#g-pantalla)"/>
        <circle cx="17" cy="-21" r="4.5" fill="${C.amarillo}"/>
        <path d="M-24 6q6-6 12 0t12 0t12 0t12 0v4a5 5 0 0 1-5 5h-38a5 5 0 0 1-5-5z" fill="#1a8fd0"/>
        <path d="M12-33h9a9 9 0 0 1 9 9v48a9 9 0 0 1-9 9h-9z" fill="${C.tinta}" opacity=".1"/>
        <circle cx="-9" cy="-8" r="7" fill="${C.blanco}"/><circle cx="9" cy="-8" r="7" fill="${C.blanco}"/>
        <circle class="pupila" cx="-7.5" cy="-7" r="3.4" fill="${C.tinta}"/><circle class="pupila" cx="10.5" cy="-7" r="3.4" fill="${C.tinta}"/>
        <path d="M-6 22q6 5.5 12 0" stroke="${C.tinta}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <g class="foti__candado" transform="translate(23 25)">
          <path d="M-4.5-5v-4.5a4.5 4.5 0 0 1 9 0v4.5" fill="none" stroke="${C.amarillo}" stroke-width="3.5"/>
          <rect x="-8.5" y="-5.5" width="17" height="14" rx="4" fill="${C.amarillo}" stroke="${C.tinta}" stroke-width="2.5"/>
          <circle cy="1.5" r="2" fill="${C.tinta}"/>
        </g>
        <g class="foti__hielo">
          <rect x="-40" y="-43" width="80" height="86" rx="14" fill="${C.hielo}" fill-opacity=".5" stroke="#e8fbff" stroke-width="3"/>
          <path d="M-30-32h16M-30-32v16" stroke="#fff" stroke-width="4.5" stroke-linecap="round" opacity=".9"/>
          <path d="M20 33l10-10M9 35l5-5" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>
        </g>
      </g>
    </g>
    <g id="foti-etq" transform="translate(0 -64)">
      <path d="M-7 13h14l-7 9z" fill="${C.blanco}"/>
      <rect id="foti-etq-caja" x="-50" y="-15" width="100" height="30" rx="15" fill="${C.blanco}"/>
      <text id="foti-etq-texto" x="0" y="6" text-anchor="middle" font-size="17" fill="${C.tinta}" class="tmono"></text>
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
      <linearGradient id="g-pantalla" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.teal}"/><stop offset="1" stop-color="${C.cian}"/></linearGradient>
      <g id="rutas" fill="none" stroke="none">${rutas}</g>
    </defs>
    ${cielo()}
    <path d="${RUTAS.subir}" fill="none" stroke="${C.raya}" stroke-width="5" stroke-dasharray="3 15" stroke-linecap="round" opacity=".8"/>
    ${hospital()}
    ${ciudadDeAna()}
    ${zonasDeLaBodega()}
    ${bodega()}
    ${sotanos()}
    ${ayudantes()}
    ${servidores()}
    <g id="rastros">${rastros}</g>
    <g id="efimeros"></g>
    ${foti()}
    <g id="encima"></g>`;
}
