// ---------------------------------------------------------------------------
// EL MUNDO
//
// Un solo dibujo grande (3200 × 1800) por el que se mueve la cámara. De
// izquierda a derecha: la tienda de Lupe con su alcancía y el cotizador
// (Pricing Calculator); arriba, la avenida de las formas de pagar el viaje
// (On-Demand, Savings Plans, reservadas, Spot, Dedicated Hosts) y el tablero de
// avisos (Health Dashboard); abajo, el banco con el estado de cuenta (Cost
// Explorer), la tarjeta con alarma (Budgets) y el perro guardián (Cost Anomaly
// Detection); a la derecha, la cartera de la familia (Organizations), el taller
// (Trusted Advisor), la asistencia (planes de soporte) y, abajo, la casa de
// seis pilares (Well-Architected).
//
// Todo se dibuja aquí con coordenadas del mundo; `guion.js` solo dice a dónde
// mira la cámara y qué capas, banderas y textos están encendidos.
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
  oro: '#ffb81f',
  naranja: '#ff8a3c',
  rosa: '#ff4f8b',
  teal: '#2ee6c5',
  cian: '#4cc9f0',
  verde: '#7be495',
  lila: '#b69cff',
  morado: '#5a4fd6',
  blanco: '#f7f4ff',
  apagado: '#33397a'
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

/** Un auto visto de lado, parado sobre (x, y). */
function auto(x, y, o = {}) {
  const { c = C.lila, w = 120, cls = '' } = o;
  const x0 = x - w / 2;
  return `<g class="auto ${cls}">
    <ellipse cx="${x}" cy="${y + 2}" rx="${w * 0.55}" ry="7" fill="${C.sombra}" opacity=".45"/>
    <path d="M${n(x0 + w * 0.2)} ${y - 46}L${n(x0 + w * 0.33)} ${y - 72}H${n(x0 + w * 0.7)}L${n(x0 + w * 0.84)} ${y - 46}Z" fill="${c}" stroke="${c}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M${n(x0 + w * 0.3)} ${y - 48}L${n(x0 + w * 0.37)} ${y - 66}H${n(x0 + w * 0.5)}V${y - 48}Z" fill="${C.cian}" opacity=".85"/>
    <path d="M${n(x0 + w * 0.55)} ${y - 48}V${y - 66}H${n(x0 + w * 0.67)}L${n(x0 + w * 0.75)} ${y - 48}Z" fill="${C.cian}" opacity=".85"/>
    <rect x="${x0}" y="${y - 50}" width="${w}" height="38" rx="13" fill="${c}"/>
    <path d="M${n(x0 + w * 0.62)} ${y - 50}H${x0 + w - 13}a13 13 0 0 1 13 13v12a13 13 0 0 1-13 13H${n(x0 + w * 0.62)}z" fill="${C.tinta}" opacity=".13"/>
    <rect x="${x0 + w - 12}" y="${y - 42}" width="10" height="8" rx="3" fill="#fff2b0"/>
    <rect x="${x0}" y="${y - 22}" width="${w}" height="8" rx="4" fill="${C.tinta}" opacity=".22"/>
    <g class="rueda"><circle cx="${x0 + w * 0.24}" cy="${y - 8}" r="12" fill="${C.tinta}"/><circle cx="${x0 + w * 0.24}" cy="${y - 8}" r="5" fill="${C.blanco}" opacity=".6"/></g>
    <g class="rueda"><circle cx="${x0 + w * 0.78}" cy="${y - 8}" r="12" fill="${C.tinta}"/><circle cx="${x0 + w * 0.78}" cy="${y - 8}" r="5" fill="${C.blanco}" opacity=".6"/></g>
  </g>`;
}

/** Una moneda chiquita: lo que se paga, lo que vuela. */
function monedita(escala = 1) {
  return `<g transform="scale(${escala})">
    <circle r="13" fill="${C.oro}"/>
    <circle r="13" fill="none" stroke="${C.naranja}" stroke-width="2.5"/>
    <circle r="8" fill="none" stroke="${C.amarillo}" stroke-width="2"/>
    <path d="M3-12a13 13 0 0 1 0 24" fill="${C.tinta}" opacity=".12"/>
  </g>`;
}

// ---------------------------------------------------------------- personajes

/** Una caja chiquita con ojos: pasajeros, intentos, pedidos. */
export function mini(color = C.cian, escala = 1) {
  return `<g transform="scale(${escala})">
    <ellipse cy="15" rx="13" ry="4" fill="${C.sombra}" opacity=".45"/>
    <rect x="-15" y="-15" width="30" height="28" rx="8" fill="${color}"/>
    <path d="M3-15h4a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H3z" fill="${C.tinta}" opacity=".16"/>
    <circle cx="-5" cy="-2" r="2.6" fill="${C.tinta}"/><circle cx="6" cy="-2" r="2.6" fill="${C.tinta}"/>
  </g>`;
}

/** Una moneda con ojos, más chica que Moni: el gasto de cada proyecto. */
function monedaPieza(escala = 1) {
  return `<g transform="scale(${escala})">
    <ellipse cy="19" rx="14" ry="4" fill="${C.sombra}" opacity=".45"/>
    ${monedita(1.25)}
    <circle cx="-4.5" cy="-2" r="2.4" fill="${C.tinta}"/><circle cx="4.5" cy="-2" r="2.4" fill="${C.tinta}"/>
  </g>`;
}

/** Un boleto de abono. */
function boleto(escala = 1) {
  return `<g transform="scale(${escala}) rotate(-8)">
    <ellipse cy="22" rx="20" ry="4.5" fill="${C.sombra}" opacity=".4"/>
    <path d="M-30-18h60v12a6 6 0 0 0 0 12v12h-60v-12a6 6 0 0 0 0-12z" fill="${C.amarillo}"/>
    <path d="M8-18v36" stroke="${C.tinta}" stroke-width="2.5" stroke-dasharray="4 4" opacity=".5"/>
    <rect x="-22" y="-8" width="22" height="5" rx="2.5" fill="${C.tinta}" opacity=".5"/>
    <rect x="-22" y="3" width="15" height="5" rx="2.5" fill="${C.tinta}" opacity=".3"/>
  </g>`;
}

/** Las figuras que el guion puede soltar en el mapa. `alto` es a qué altura va su etiqueta. */
export const PIEZAS = {
  moneda: { svg: monedaPieza, alto: 44 },
  boleto: { svg: boleto, alto: 46 }
};

// ------------------------------------------------------------------ rutas

/** Los caminos por los que viajan Moni y compañía. */
export const RUTAS = {
  'a-cotiza': 'M850 930C760 820 420 870 330 990',
  'a-avenida': 'M330 990C500 860 820 690 1040 690',
  't-abono': 'M1040 690H1300',
  't-renta': 'M1300 690H1560',
  't-spot': 'M1560 690H1820',
  asiento: 'M1820 690C1830 600 1870 590 1888 604',
  bajar: 'M1888 604C1950 560 1990 620 2000 690',
  't-garage': 'M2000 690H2050',
  regreso: 'M2050 690C1800 440 700 540 330 990',
  'a-banco': 'M330 990C560 1260 1200 1340 1460 1295',
  crear: 'M1460 1270C1500 1180 1580 1150 1640 1180',
  'a-familia': 'M1460 1295C1900 1260 2300 760 2470 570',
  'a-taller': 'M2470 570C2190 700 2190 1050 2400 1130',
  'a-pilares': 'M2400 1130C2300 1300 2420 1460 2540 1515',
  'a-lab': 'M2540 1515C2200 1480 1800 1360 1460 1295',
  lujo: 'M2700 605C2660 540 2580 505 2546 505'
};

/** A dónde mira la cámara: [x, y, ancho, alto], siempre 16:9. Lo importante queda en el 68 % de arriba. */
export const CAM = {
  todo: [80, 240, 3120, 1755],
  mapa: [80, 140, 3120, 1755],
  tienda: [-180, 560, 1180, 664],
  cotiza: [-160, 590, 1100, 619],
  avenida: [880, 240, 1500, 844],
  taxi: [800, 380, 840, 473],
  abono: [1050, 380, 840, 473],
  renta: [1300, 380, 840, 473],
  spot: [1560, 380, 840, 473],
  garage: [1720, 380, 840, 473],
  salud: [1840, 200, 700, 394],
  banco: [900, 920, 1400, 788],
  lab: [1150, 930, 960, 540],
  estado: [920, 990, 860, 484],
  presupuesto: [1380, 940, 780, 439],
  anomalia: [1650, 975, 700, 394],
  familia: [2360, 260, 900, 506],
  taller: [2190, 850, 800, 450],
  soporte: [2560, 820, 811, 456],
  pilares: [2380, 1230, 820, 461]
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
    <circle cx="600" cy="700" r="620" fill="url(#g-niebla-rosa)"/>
    <circle cx="1550" cy="1250" r="700" fill="url(#g-niebla-teal)"/>
    <circle cx="2750" cy="650" r="620" fill="url(#g-niebla-lila)"/>
    ${puntos}
    <ellipse cx="430" cy="1070" rx="520" ry="96" fill="${C.tierra}"/>
    <ellipse cx="1580" cy="712" rx="780" ry="64" fill="${C.tierra}"/>
    <ellipse cx="1560" cy="1345" rx="720" ry="70" fill="${C.tierra}"/>
    <ellipse cx="2700" cy="610" rx="560" ry="52" fill="${C.tierra}"/>
    <ellipse cx="2730" cy="1180" rx="560" ry="56" fill="${C.tierra}"/>
    <ellipse cx="2760" cy="1572" rx="330" ry="48" fill="${C.tierra}"/>`;
}

/** La tienda de Lupe, Lupe, su alcancía y el cotizador. */
function tienda() {
  const B = 1040; // el piso de la tienda
  const r = semilla(4);
  const edificio = (x, w, h, c) => {
    let v = '';
    for (let fy = 0; fy < Math.floor((h - 26) / 30); fy++) {
      for (let fx = 0; fx < Math.floor((w - 16) / 24); fx++) {
        const luz = r() < 0.5;
        v += `<rect x="${x - w / 2 + 12 + fx * 24}" y="${B - h + 16 + fy * 30}" width="13" height="17" rx="3" fill="${luz ? '#ffe27a' : C.tinta}" opacity="${luz ? 0.9 : 0.35}"${luz && r() < 0.4 ? ' class="ventana"' : ''}/>`;
      }
    }
    return `<g opacity=".75">
      <rect x="${x - w / 2}" y="${B - h}" width="${w}" height="${h}" rx="12" fill="${c}"/>
      <path d="M${x + w * 0.2} ${B - h}H${x + w / 2 - 12}a12 12 0 0 1 12 12V${B}H${x + w * 0.2}z" fill="${C.tinta}" opacity=".18"/>
      ${v}
    </g>`;
  };
  // franjas del toldo
  let toldo = '';
  for (let i = 0; i < 7; i++) {
    toldo += `<path d="M${392 + i * 40} 858h40v34a20 20 0 0 1-40 0z" fill="${i % 2 ? C.blanco : C.rosa}"/>`;
  }
  return `<g id="tienda">
    ${edificio(40, 96, 250, '#3c3a9e')}
    ${arbol(130, B + 6, 22)}${arbol(1000, B + 12, 22, '#28d7b4')}

    <!-- la nube donde viven sus dos servidores -->
    <g class="flota">
      <path d="M470 700a46 46 0 0 1 86-22a40 40 0 0 1 70 30a34 34 0 0 1-6 66H476a40 40 0 0 1-6-74z" fill="${C.blanco}" opacity=".95"/>
      <rect x="512" y="712" width="40" height="44" rx="8" fill="${C.cian}"/><rect x="566" y="712" width="40" height="44" rx="8" fill="${C.cian}"/>
      <path d="M520 724h24M520 736h24M574 724h24M574 736h24" stroke="${C.tinta}" stroke-width="3.5" stroke-linecap="round" opacity=".5"/>
      <circle class="titila" cx="542" cy="748" r="3" fill="${C.verde}"/><circle class="titila" cx="596" cy="748" r="3" fill="${C.verde}" style="animation-delay:-1.4s"/>
    </g>
    <path d="M560 790V846" stroke="${C.blanco}" stroke-width="4" stroke-dasharray="4 8" stroke-linecap="round" opacity=".7"/>

    <!-- la tienda -->
    <ellipse cx="530" cy="${B + 4}" rx="190" ry="14" fill="${C.sombra}" opacity=".45"/>
    <rect x="390" y="850" width="280" height="${B - 850}" rx="14" fill="${C.teal}"/>
    <path d="M610 850h46a14 14 0 0 1 14 14V${B}H610z" fill="${C.tinta}" opacity=".15"/>
    <rect x="410" y="912" width="120" height="78" rx="9" fill="#ffe27a" class="ventana"/>
    <g fill="${C.rosa}"><rect x="424" y="950" width="26" height="30" rx="5"/><rect x="458" y="940" width="22" height="40" rx="5" fill="${C.lila}"/><rect x="488" y="958" width="28" height="22" rx="5" fill="${C.cian}"/></g>
    <path d="M556 ${B}v-78a26 26 0 0 1 52 0v78z" fill="${C.tinta}" opacity=".72"/>
    <circle cx="596" cy="${B - 40}" r="3" fill="${C.amarillo}"/>
    ${toldo}
    <rect x="384" y="846" width="292" height="16" rx="8" fill="${C.rosa}"/>
    ${pastilla(530, 822, 'Tienda de Lupe', { s: 21 })}

    <!-- Lupe -->
    <g id="lupe" transform="translate(718 ${B})">
      <ellipse cy="3" rx="30" ry="7" fill="${C.sombra}" opacity=".45"/>
      <rect x="-27" y="-74" width="54" height="74" rx="24" fill="${C.morado}"/>
      <path d="M-17-60h34v44a10 10 0 0 1-10 10h-14a10 10 0 0 1-10-10z" fill="${C.amarillo}"/>
      <circle cy="-98" r="27" fill="#d9946a"/>
      <path d="M-28-96a28 28 0 0 1 56 0q-6-18-28-16t-28 16z" fill="#2a1450"/>
      <circle cx="22" cy="-112" r="11" fill="#2a1450"/>
      <circle cx="-9" cy="-95" r="3" fill="${C.tinta}"/><circle cx="10" cy="-95" r="3" fill="${C.tinta}"/>
      <path d="M-6-85q7 6 13 0" stroke="${C.tinta}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    </g>
    ${pastilla(718, B + 38, 'Lupe', { s: 19 })}

    <!-- la alcancía -->
    <g id="alcancia" transform="translate(850 ${B})">
      <ellipse cy="3" rx="54" ry="8" fill="${C.sombra}" opacity=".45"/>
      <rect x="-34" y="-22" width="14" height="22" rx="5" fill="#e0447a"/><rect x="18" y="-22" width="14" height="22" rx="5" fill="#e0447a"/>
      <ellipse cy="-46" rx="56" ry="40" fill="${C.rosa}"/>
      <path d="M20-84a56 40 0 0 1 0 78z" fill="${C.tinta}" opacity=".12"/>
      <ellipse cx="54" cy="-48" rx="13" ry="15" fill="#ff7aa8"/>
      <circle cx="51" cy="-50" r="2.6" fill="${C.tinta}"/><circle cx="58" cy="-45" r="2.6" fill="${C.tinta}"/>
      <circle cx="28" cy="-62" r="4" fill="${C.tinta}"/>
      <path d="M8-80l10-22l10 18z" fill="#e0447a"/>
      <rect x="-22" y="-88" width="30" height="7" rx="3.5" fill="${C.tinta}" opacity=".7"/>
      <path d="M-56-50q-16-4-12-16" stroke="${C.rosa}" stroke-width="5" fill="none" stroke-linecap="round"/>
    </g>

    <!-- el cotizador: AWS Pricing Calculator -->
    <g id="cotizador">
      <ellipse cx="230" cy="${B + 4}" rx="80" ry="10" fill="${C.sombra}" opacity=".45"/>
      <rect x="196" y="890" width="68" height="${B - 890}" rx="10" fill="${C.morado}"/>
      <path d="M240 890h14a10 10 0 0 1 10 10V${B}H240z" fill="${C.tinta}" opacity=".18"/>
      <rect x="104" y="664" width="252" height="232" rx="26" fill="${C.amarillo}"/>
      <path d="M300 664h30a26 26 0 0 1 26 26v180a26 26 0 0 1-26 26h-30z" fill="${C.naranja}" opacity=".45"/>
      <rect x="122" y="682" width="216" height="104" rx="14" fill="url(#g-lcd)"/>
      <text id="calc-tit" x="136" y="706" font-size="15" fill="${C.teal}" class="tmono">2 servidores · al mes</text>
      <text id="calc-num" x="300" y="756" text-anchor="end" font-size="44" fill="${C.blanco}" class="tmono">0.00</text>
      <text x="306" y="756" font-size="15" fill="${C.teal}" class="tmono">USD</text>
      <text id="calc-sub" x="136" y="778" font-size="15" fill="${C.amarillo}" class="tmono"></text>
      <g fill="${C.tinta}" opacity=".78">
        <rect x="128" y="800" width="42" height="34" rx="9"/><rect x="180" y="800" width="42" height="34" rx="9"/><rect x="232" y="800" width="42" height="34" rx="9"/><rect x="284" y="800" width="48" height="76" rx="11" fill="${C.rosa}" opacity="1"/>
        <rect x="128" y="842" width="42" height="34" rx="9"/><rect x="180" y="842" width="42" height="34" rx="9"/><rect x="232" y="842" width="42" height="34" rx="9"/>
      </g>
      <path d="M298 838h20M308 828v20" stroke="${C.blanco}" stroke-width="4" stroke-linecap="round"/>
      <g id="tb-cotiza">${pastilla(230, 636, 'cotiza antes de salir', { s: 18.5, bg: C.tinta, fg: C.blanco })}</g>
    </g>
  </g>`;
}

/** Un letrero sobre un poste, con su texto. */
function letreroPoste(x, yBase, txt, color, o = {}) {
  const { s = 17, alto = 210 } = o;
  return `<g>
    <rect x="${x - 4}" y="${yBase - alto}" width="8" height="${alto}" rx="4" fill="#8f7bd6"/>
    ${pastilla(x, yBase - alto, txt, { s, bg: color })}
  </g>`;
}

/** La avenida de las formas de pagar el viaje. */
function avenida() {
  const via = 'M960 700H2200';
  const B = 664; // la banqueta
  return `<g id="avenida">
    <path d="${RUTAS['a-avenida']}" fill="none" stroke="${C.raya}" stroke-width="5" stroke-dasharray="3 15" stroke-linecap="round" opacity=".7"/>
    <path d="${via}" fill="none" stroke="${C.viaBorde}" stroke-width="68" stroke-linecap="round"/>
    <path d="${via}" fill="none" stroke="${C.via}" stroke-width="56" stroke-linecap="round"/>
    <path class="rayas" d="${via}" fill="none" stroke="${C.raya}" stroke-width="4" stroke-dasharray="26 24"/>

    <!-- 1 · el taxi: On-Demand -->
    <g id="est-taxi">
      ${letreroPoste(1180, B, 'taxi · pagas por viaje', C.amarillo)}
      ${auto(1110, B, { c: C.amarillo, w: 130 })}
      <rect x="1086" y="562" width="48" height="16" rx="5" fill="${C.tinta}"/>
      <text x="1110" y="575" text-anchor="middle" font-size="12" fill="${C.amarillo}" class="tmono">TAXI</text>
      <g id="taximetro">
        <rect x="1010" y="500" width="92" height="44" rx="10" fill="${C.tinta}" stroke="${C.amarillo}" stroke-width="3"/>
        <text id="taxi-num" x="1094" y="530" text-anchor="end" font-size="20" fill="${C.verde}" class="tmono">0.00</text>
        <path d="M1056 544l-8 16" stroke="${C.amarillo}" stroke-width="3"/>
      </g>
    </g>

    <!-- 2 · el abono: Compute Savings Plans -->
    <g id="est-abono">
      <rect x="1310" y="530" width="120" height="${B - 530}" rx="14" fill="${C.cian}"/>
      <path d="M1390 530h26a14 14 0 0 1 14 14V${B}h-40z" fill="${C.tinta}" opacity=".15"/>
      <rect x="1302" y="512" width="136" height="26" rx="13" fill="${C.rosa}"/>
      <rect x="1328" y="556" width="84" height="56" rx="10" fill="#ffe27a" class="ventana"/>
      <rect x="1324" y="612" width="92" height="10" rx="5" fill="${C.tinta}" opacity=".4"/>
      <g transform="translate(1370 470)" id="tb-abono">${boleto(1.25)}</g>
      ${pastilla(1370, 420, 'abono · cualquier ruta', { s: 17, bg: C.cian })}
      <g id="tb-66">${pastilla(1460, 470, '−66 %', { s: 22, bg: C.verde, mono: true })}</g>
    </g>

    <!-- 3 · la renta anual: EC2 Instance Savings Plans e instancias reservadas -->
    <g id="est-renta">
      ${auto(1640, B, { c: C.lila, w: 120 })}
      <g transform="translate(1590 488)">
        <rect x="-38" y="-30" width="76" height="70" rx="10" fill="${C.blanco}"/>
        <rect x="-38" y="-30" width="76" height="20" rx="10" fill="${C.rosa}"/>
        <rect x="-38" y="-18" width="76" height="8" fill="${C.rosa}"/>
        <path d="M-22-36v12M22-36v12" stroke="${C.tinta}" stroke-width="5" stroke-linecap="round"/>
        <text y="26" text-anchor="middle" font-size="24" fill="${C.tinta}" class="tsans">1–3</text>
        <text y="38" text-anchor="middle" font-size="10" fill="${C.tinta}" class="tmono">AÑOS</text>
      </g>
      ${pastilla(1630, 420, 'el mismo auto, todo el año', { s: 17, bg: C.lila })}
      <g id="tb-72">${pastilla(1700, 490, '−72 %', { s: 22, bg: C.verde, mono: true })}</g>
    </g>

    <!-- 4 · el último asiento: Spot -->
    <g id="est-spot">
      <ellipse cx="1900" cy="${B + 2}" rx="120" ry="8" fill="${C.sombra}" opacity=".45"/>
      <rect x="1790" y="560" width="220" height="${B - 572}" rx="18" fill="${C.teal}"/>
      <path d="M1960 560h32a18 18 0 0 1 18 18v74h-50z" fill="${C.tinta}" opacity=".15"/>
      <g>
        <rect x="1804" y="578" width="34" height="34" rx="7" fill="${C.cian}" opacity=".6"/>
        <rect x="1846" y="578" width="34" height="34" rx="7" fill="${C.cian}" opacity=".6"/>
        <rect id="asiento" x="1872" y="578" width="34" height="34" rx="7" fill="${C.amarillo}" class="asiento" opacity="0"/>
        <rect x="1914" y="578" width="34" height="34" rx="7" fill="${C.cian}" opacity=".6"/>
        <rect x="1956" y="578" width="40" height="52" rx="7" fill="${C.cian}" opacity=".85"/>
        <circle cx="1821" cy="596" r="7" fill="${C.rosa}"/><circle cx="1863" cy="596" r="7" fill="${C.lila}"/><circle cx="1931" cy="596" r="7" fill="${C.naranja}"/>
      </g>
      <rect x="1790" y="626" width="220" height="10" rx="5" fill="${C.tinta}" opacity=".22"/>
      <g class="rueda"><circle cx="1836" cy="${B - 10}" r="13" fill="${C.tinta}"/><circle cx="1836" cy="${B - 10}" r="5" fill="${C.blanco}" opacity=".6"/></g>
      <g class="rueda"><circle cx="1966" cy="${B - 10}" r="13" fill="${C.tinta}"/><circle cx="1966" cy="${B - 10}" r="5" fill="${C.blanco}" opacity=".6"/></g>
      ${pastilla(1900, 396, 'último asiento libre', { s: 17, bg: C.teal })}
      <g id="tb-70">${pastilla(1900, 440, '−70 % · te pueden bajar', { s: 17, bg: C.verde })}</g>
    </g>

    <!-- 5 · el auto propio: Dedicated Hosts -->
    <g id="est-garage">
      <rect x="2050" y="540" width="130" height="${B - 540}" rx="12" fill="${C.morado}"/>
      <path d="M2034 552L2115 500L2196 552Z" fill="${C.rosa}" stroke="${C.rosa}" stroke-width="10" stroke-linejoin="round"/>
      <g class="garage__dentro">${auto(2115, B - 6, { c: C.naranja, w: 96 })}</g>
      <rect class="garage__puerta" x="2066" y="566" width="98" height="${B - 566}" rx="6" fill="#8f7bd6"/>
      <path class="garage__puerta" d="M2066 584h98M2066 600h98M2066 616h98M2066 632h98M2066 648h98" stroke="${C.tinta}" stroke-opacity=".25" stroke-width="3"/>
      <g transform="translate(2160 530)">
        <circle r="13" fill="none" stroke="${C.amarillo}" stroke-width="5"/>
        <path d="M10 8l18 18M22 20l6-6M18 16l5-5" stroke="${C.amarillo}" stroke-width="5" stroke-linecap="round"/>
      </g>
      ${pastilla(2115, 470, 'el auto solo tuyo', { s: 17, bg: C.naranja })}
    </g>

    <!-- el tablero de avisos: AWS Health Dashboard -->
    <g id="tablero-salud">
      <rect x="2236" y="330" width="8" height="${B - 330}" rx="4" fill="#8f7bd6"/>
      <rect x="2130" y="270" width="220" height="118" rx="16" fill="${C.tinta}" stroke="${C.cian}" stroke-width="4"/>
      <text x="2150" y="298" font-size="15" fill="${C.cian}" class="tmono">AVISOS DE AWS</text>
      <circle class="salud__luz" cx="2162" cy="332" r="10" fill="${C.verde}"/>
      <text id="salud-txt" x="2182" y="338" font-size="16" fill="${C.blanco}" class="tsans">todo en orden</text>
      <text id="salud-sub" x="2150" y="370" font-size="14" fill="${C.lila}" class="tmono">us-east-1</text>
    </g>
  </g>`;
}

/** El banco: estado de cuenta, la tarjeta con alarma y el perro guardián. */
function banco() {
  const meses = ['abr', 'may', 'jun', 'jul', 'ago', 'sep'];
  const altos = [150, 123, 102, 34, 61, 34];
  let barras = '';
  altos.forEach((h, i) => {
    const x = 1012 + i * 64;
    barras += `<g class="barra" style="transition-delay:${(i * 0.12).toFixed(2)}s">
      <rect x="${x}" y="${1255 - h}" width="44" height="${h}" rx="7" fill="${C.cian}"/>
      <rect class="barra__blog" x="${x}" y="${1255 - h}" width="44" height="${Math.round(h * 0.38)}" rx="7" fill="${C.rosa}"/>
    </g>
    <text x="${x + 22}" y="1282" text-anchor="middle" font-size="16" fill="${C.blanco}" opacity=".75" class="tmono">${meses[i]}</text>`;
  });
  return `<g id="banco">
    <!-- el estado de cuenta: Cost Explorer -->
    <ellipse cx="1190" cy="1306" rx="230" ry="12" fill="${C.sombra}" opacity=".45"/>
    <rect x="980" y="1020" width="420" height="280" rx="22" fill="#231a6e" stroke="${C.viaBorde}" stroke-width="5"/>
    <path d="M996 1255H1384" stroke="${C.blanco}" stroke-opacity=".3" stroke-width="3"/>
    <path d="M996 1205H1384M996 1155H1384" stroke="${C.blanco}" stroke-opacity=".08" stroke-width="3"/>
    ${barras}
    <g class="capa capa-etiquetas">
      ${pastilla(1330, 1112, 'blog', { s: 15, bg: C.rosa })}
      ${pastilla(1330, 1146, 'tienda', { s: 15, bg: C.cian })}
    </g>
    ${pastilla(1190, 1020, 'estado de cuenta · 6 meses', { s: 18, bg: C.tinta, fg: C.blanco })}
    <g id="tb-total">${pastilla(1100, 1072, '1.49 USD · 17 servicios', { s: 18, bg: C.amarillo, mono: true })}</g>

    <!-- la tarjeta con alarma: AWS Budgets -->
    <g id="tarjeta-budget">
      ${pastilla(1640, 1018, 'límite del mes: 10 USD', { s: 16.5, bg: C.tinta, fg: C.blanco })}
      <rect x="1520" y="1062" width="240" height="26" rx="13" fill="${C.tinta}" stroke="${C.blanco}" stroke-opacity=".3" stroke-width="2"/>
      <rect class="medidor__lleno" x="1523" y="1065" width="234" height="20" rx="10" fill="${C.verde}"/>
      <path d="M1724 1056v38" stroke="${C.blanco}" stroke-width="3"/>
      <text x="1724" y="1050" text-anchor="middle" font-size="14" fill="${C.amarillo}" class="tmono">85%</text>
      <g class="flota">
        <rect x="1540" y="1112" width="200" height="126" rx="16" fill="${C.amarillo}"/>
        <path d="M1690 1112h34a16 16 0 0 1 16 16v94a16 16 0 0 1-16 16h-34z" fill="${C.naranja}" opacity=".45"/>
        <rect x="1540" y="1136" width="200" height="22" fill="${C.tinta}" opacity=".8"/>
        <rect x="1558" y="1174" width="38" height="28" rx="6" fill="#e0b13a" stroke="${C.tinta}" stroke-opacity=".4" stroke-width="2"/>
        <path d="M1612 1214h40M1660 1214h30" stroke="${C.tinta}" stroke-width="5" stroke-linecap="round" opacity=".45"/>
        <circle cx="1612" cy="1186" r="5" fill="${C.tinta}"/><circle cx="1634" cy="1186" r="5" fill="${C.tinta}"/>
        <path d="M1614 1196q9 7 18 0" stroke="${C.tinta}" stroke-width="3" fill="none" stroke-linecap="round"/>
      </g>
      <g class="campana" transform="translate(1800 1076)">
        <g class="campana__cuerpo">
          <path d="M-17 10v-12a17 17 0 0 1 34 0v12l6 7h-46z" fill="${C.amarillo}"/>
          <circle cy="21" r="5" fill="${C.amarillo}"/>
          <path d="M0-19v-6" stroke="${C.amarillo}" stroke-width="4" stroke-linecap="round"/>
        </g>
        <g class="campana__ondas" fill="none" stroke="${C.rosa}" stroke-width="4" stroke-linecap="round">
          <path d="M-28-10q-8 10 0 22M28-10q8 10 0 22"/><path d="M-38-16q-12 16 0 34M38-16q12 16 0 34"/>
        </g>
      </g>
    </g>

    <!-- el perro guardián: Cost Anomaly Detection -->
    <g id="vigilante">
      <rect x="1880" y="1046" width="270" height="130" rx="16" fill="${C.tinta}" stroke="${C.lila}" stroke-width="4"/>
      <text x="1898" y="1072" font-size="14" fill="${C.lila}" class="tmono">gasto diario</text>
      <path d="M1900 1150l30-6l30 4l30-8l30 6l30-4l30 6l40-4" fill="none" stroke="${C.cian}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path class="pico" d="M2080 1146l20-8l12-54l14 56l24-4" fill="none" stroke="${C.rosa}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/>
      <g id="perro" transform="translate(2050 1262)">
        <ellipse cy="3" rx="44" ry="7" fill="${C.sombra}" opacity=".45"/>
        <g class="perro__cuerpo">
          <rect x="-36" y="-44" width="64" height="40" rx="18" fill="#c98a5a"/>
          <rect x="-32" y="-12" width="12" height="14" rx="5" fill="#a86d43"/><rect x="12" y="-12" width="12" height="14" rx="5" fill="#a86d43"/>
          <path class="perro__cola" d="M-36-36q-18-6-16-24" stroke="#c98a5a" stroke-width="8" fill="none" stroke-linecap="round"/>
          <rect x="10" y="-78" width="44" height="40" rx="16" fill="#c98a5a"/>
          <ellipse cx="54" cy="-52" rx="10" ry="8" fill="#e8b48b"/><circle cx="60" cy="-55" r="4" fill="${C.tinta}"/>
          <circle class="ojo" cx="34" cy="-62" r="4" fill="${C.tinta}"/>
          <path d="M14-76q-12 2-10 26q8-4 12-14z" fill="#8a5330"/>
          <rect x="10" y="-44" width="34" height="7" rx="3.5" fill="${C.rosa}"/>
        </g>
      </g>
      ${pastilla(2050, 1292, 'el perro guardián', { s: 16.5 })}
    </g>
  </g>`;
}

/** La cartera de la familia: AWS Organizations, la factura única y la regla (SCP). */
function familia() {
  const tarjeta = (x, y, color, txt, id) => `<g id="${id}">
    <rect x="${x - 50}" y="${y - 30}" width="100" height="60" rx="10" fill="${color}"/>
    <rect x="${x - 50}" y="${y - 18}" width="100" height="11" fill="${C.tinta}" opacity=".7"/>
    <rect x="${x - 38}" y="${y + 2}" width="20" height="14" rx="3" fill="#e0b13a"/>
    ${pastilla(x, y + 46, txt, { s: 15, bg: C.tinta, fg: C.blanco })}
  </g>`;
  return `<g id="familia" transform="translate(140 0)">
    <path d="M2430 590C2470 520 2520 500 2560 500M2560 605V520M2690 590C2650 520 2600 500 2560 500" fill="none" stroke="${C.lila}" stroke-width="4" stroke-dasharray="6 9" stroke-linecap="round" opacity=".7"/>
    <!-- la factura única -->
    <g id="factura">
      <path d="M2510 312h100v118l-10-8l-10 8l-10-8l-10 8l-10-8l-10 8l-10-8l-10 8l-10-8l-10 8z" fill="${C.blanco}"/>
      <rect x="2524" y="330" width="56" height="8" rx="4" fill="${C.tinta}" opacity=".6"/>
      <path d="M2524 352h72M2524 368h60M2524 384h72" stroke="${C.tinta}" stroke-width="5" stroke-linecap="round" opacity=".25"/>
      <rect x="2556" y="398" width="40" height="12" rx="6" fill="${C.verde}"/>
      ${pastilla(2560, 292, 'una sola factura', { s: 16.5, bg: C.blanco })}
    </g>
    <!-- la cartera del titular -->
    <g transform="translate(2560 486)">
      <ellipse cy="40" rx="70" ry="8" fill="${C.sombra}" opacity=".45"/>
      <rect x="-66" y="-36" width="132" height="72" rx="16" fill="#8a5330"/>
      <path d="M-66-14h132" stroke="#6a3c22" stroke-width="5"/>
      <rect x="30" y="-10" width="36" height="24" rx="8" fill="#6a3c22"/><circle cx="46" cy="2" r="5" fill="${C.amarillo}"/>
      <circle cx="-22" cy="4" r="5" fill="${C.tinta}"/><circle cx="2" cy="4" r="5" fill="${C.tinta}"/>
      <path d="M-18 16q8 6 16 0" stroke="${C.tinta}" stroke-width="3" fill="none" stroke-linecap="round"/>
    </g>
    ${tarjeta(2430, 590, C.cian, 'tienda', 'card-tienda')}
    ${tarjeta(2560, 605, C.rosa, 'pruebas', 'card-pruebas')}
    ${tarjeta(2690, 590, C.verde, 'blog', 'card-blog')}
    <g class="capa capa-volumen">${pastilla(2700, 380, 'se suma: descuento por volumen', { s: 15.5, bg: C.verde, ancla: 'izq' })}</g>

    <!-- la regla del titular: SCP -->
    <g class="capa capa-scp">
      <rect x="2326" y="396" width="8" height="110" rx="4" fill="#8f7bd6"/>
      <rect x="2256" y="372" width="148" height="66" rx="12" fill="${C.rosa}"/>
      <text x="2330" y="398" text-anchor="middle" font-size="14" fill="${C.tinta}" class="tmono">REGLA PARA TODAS</text>
      <text x="2330" y="424" text-anchor="middle" font-size="17" fill="${C.tinta}" class="tsans">nada de lujos</text>
      <g transform="translate(2376 506)" opacity=".9">${auto(0, 0, { c: '#e8c547', w: 70 })}</g>
    </g>
  </g>`;
}

/** La casa de seis pilares: AWS Well-Architected. */
function pilares() {
  const nombres = ['operación', 'seguridad', 'fiabilidad', 'rendimiento', 'costos', 'sostenibilidad'];
  const colores = [C.cian, C.rosa, C.verde, C.amarillo, C.naranja, C.teal];
  const cx = 2760;
  let cols = '';
  nombres.forEach((t, i) => {
    const x = cx - 135 + i * 54;
    cols += `<g id="pilar-${i + 1}">
      <rect x="${x - 19}" y="1388" width="38" height="140" rx="8" fill="${colores[i]}"/>
      <rect x="${x + 6}" y="1388" width="13" height="140" rx="6" fill="${C.tinta}" opacity=".15"/>
      <text transform="translate(${x + 5.5} 1520) rotate(-90)" font-size="15" fill="${C.tinta}" class="tsans">${t}</text>
    </g>`;
  });
  return `<g id="casa-pilares">
    <ellipse cx="${cx}" cy="1554" rx="210" ry="12" fill="${C.sombra}" opacity=".45"/>
    <path d="M${cx - 185} 1380L${cx} 1300L${cx + 185} 1380Z" fill="${C.lila}" stroke="${C.lila}" stroke-width="14" stroke-linejoin="round"/>
    <path d="M${cx} 1300L${cx + 185} 1380H${cx}Z" fill="${C.tinta}" opacity=".14"/>
    <rect x="${cx - 185}" y="1374" width="370" height="18" rx="9" fill="#8f7bd6"/>
    ${cols}
    <rect x="${cx - 193}" y="1526" width="386" height="22" rx="11" fill="#8f7bd6"/>
    ${pastilla(cx, 1346, 'bien construida', { s: 16, bg: C.tinta, fg: C.blanco })}
  </g>`;
}

/** El taller: AWS Trusted Advisor con sus seis luces. */
function taller() {
  const luces = [
    ['costos', C.amarillo, false],
    ['rendimiento', C.cian, false],
    ['seguridad', C.rosa, true],
    ['tolerancia', C.verde, false],
    ['límites', C.lila, true],
    ['operación', C.teal, false]
  ];
  let panel = '';
  luces.forEach(([t, c, basico], i) => {
    const x = 2340 + i * 76;
    panel += `<circle class="luz${basico ? ' luz--basico' : ''}" cx="${x}" cy="928" r="17" style="--c:${c}"/>
      <text x="${x}" y="966" text-anchor="middle" font-size="13.5" fill="${C.blanco}" class="tsans">${t}</text>`;
  });
  return `<g id="taller">
    <rect x="2288" y="880" width="484" height="104" rx="18" fill="${C.tinta}" stroke="${C.viaBorde}" stroke-width="4"/>
    ${panel}
    ${pastilla(2530, 880, 'el mecánico revisa', { s: 17, bg: C.amarillo })}
    <!-- el taller y el auto -->
    <rect x="2330" y="1000" width="400" height="160" rx="18" fill="#2a2380"/>
    <path d="M2310 1010L2530 990L2750 1010" fill="none" stroke="${C.rosa}" stroke-width="16" stroke-linecap="round"/>
    <path d="M2350 1060h360" stroke="${C.blanco}" stroke-opacity=".08" stroke-width="40"/>
    ${auto(2510, 1156, { c: C.cian, w: 150, cls: 'auto--taller' })}
    <g class="humo"><circle cx="2420" cy="1120" r="9" fill="${C.blanco}" opacity=".4"/><circle cx="2404" cy="1106" r="12" fill="${C.blanco}" opacity=".3"/></g>
    <!-- el mecánico -->
    <g id="mecanico" transform="translate(2680 1160)">
      <ellipse cy="3" rx="30" ry="7" fill="${C.sombra}" opacity=".5"/>
      <g class="robot__cuerpo">
        <path d="M0-74v-12" stroke="${C.blanco}" stroke-width="4" stroke-linecap="round"/>
        <circle class="titila" cy="-88" r="6" fill="${C.amarillo}"/>
        <rect x="-27" y="-74" width="54" height="56" rx="14" fill="${C.amarillo}"/>
        <path d="M8-74h5a14 14 0 0 1 14 14v28a14 14 0 0 1-14 14h-5z" fill="${C.tinta}" opacity=".16"/>
        <rect x="-19" y="-63" width="38" height="20" rx="10" fill="${C.tinta}"/>
        <circle class="ojo" cx="-8" cy="-53" r="4" fill="${C.blanco}"/><circle class="ojo" cx="8" cy="-53" r="4" fill="${C.blanco}"/>
        <rect x="-26" y="-18" width="52" height="18" rx="7" fill="${C.morado}"/>
        <g transform="translate(-40 -40) rotate(-12)">
          <rect x="-14" y="-18" width="28" height="36" rx="4" fill="${C.blanco}"/>
          <path d="M-8-8h16M-8 0h16M-8 8h10" stroke="${C.tinta}" stroke-width="3" stroke-linecap="round" opacity=".5"/>
        </g>
      </g>
    </g>
  </g>`;
}

/** La asistencia: los planes de soporte, de menos a más. */
function soporte() {
  const filas = [
    ['Basic', 'gratis', 'facturación y cuotas', C.blanco, 120],
    ['Business Support+', 'desde 29 USD', '< 30 min', C.cian, 210],
    ['Enterprise', 'desde 5,000 USD', '< 15 min · TAM', C.amarillo, 300],
    ['Unified Operations', 'desde 50,000 USD', '5 min', C.rosa, 390]
  ];
  let s = '';
  filas.forEach(([nombre, precio, tiempo, color, largo], i) => {
    const y = 905 + i * 60;
    s += `<g class="escalon" style="transition-delay:${(0.2 + i * 0.25).toFixed(2)}s">
      <rect x="2760" y="${y - 25}" width="${largo}" height="50" rx="25" fill="${color}" opacity=".22"/>
      ${pastilla(2770, y - 10, nombre, { s: 16.5, bg: color, ancla: 'izq' })}
      <text x="2780" y="${y + 20}" font-size="13.5" fill="${C.blanco}" class="tmono">${precio} · ${tiempo}</text>
    </g>`;
  });
  return `<g id="soporte">
    <rect x="2730" y="852" width="440" height="280" rx="22" fill="${C.tinta}" fill-opacity=".55" stroke="${C.viaBorde}" stroke-width="3"/>
    ${pastilla(2950, 852, 'planes de asistencia', { s: 17, bg: C.tinta, fg: C.blanco })}
    <g class="capa capa-escalones">${s}</g>
    <g class="capa capa-tam">
      <g transform="translate(3118 1046)">
        <ellipse cy="3" rx="20" ry="5" fill="${C.sombra}" opacity=".45"/>
        <rect x="-16" y="-46" width="32" height="46" rx="14" fill="${C.verde}"/>
        <circle cy="-60" r="17" fill="#ffc9a3"/>
        <path d="M-17-62a17 17 0 0 1 34 0q-6-10-17-8t-17 8z" fill="#3a1f6b"/>
        <circle cx="-6" cy="-60" r="2.4" fill="${C.tinta}"/><circle cx="6" cy="-60" r="2.4" fill="${C.tinta}"/>
        <rect x="-6" y="-40" width="12" height="20" rx="3" fill="${C.amarillo}"/>
      </g>
    </g>
  </g>`;
}

function moni() {
  return `<g id="moni" transform="translate(850 930)">
    <g class="moni__salto">
      <ellipse cy="35" rx="26" ry="7" fill="${C.sombra}" opacity=".5"/>
      <g class="moni__caja">
        <circle r="33" fill="${C.oro}"/>
        <circle r="33" fill="none" stroke="${C.naranja}" stroke-width="4"/>
        <circle r="25" fill="${C.amarillo}"/>
        <circle r="25" fill="none" stroke="${C.naranja}" stroke-width="2.5" stroke-dasharray="3 5" opacity=".7"/>
        <path d="M12-30a33 33 0 0 1 0 60a33 33 0 0 0 0-60z" fill="${C.tinta}" opacity=".12"/>
        <path d="M-18-20a26 26 0 0 1 14-8" stroke="${C.blanco}" stroke-width="4" stroke-linecap="round" opacity=".8"/>
        <circle cx="-9" cy="-3" r="6.5" fill="${C.blanco}"/><circle cx="9" cy="-3" r="6.5" fill="${C.blanco}"/>
        <circle class="pupila" cx="-7.5" cy="-2" r="3.3" fill="${C.tinta}"/><circle class="pupila" cx="10.5" cy="-2" r="3.3" fill="${C.tinta}"/>
        <path d="M-6 13q6 5.5 12 0" stroke="${C.tinta}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <circle cx="-17" cy="8" r="4" fill="${C.rosa}" opacity=".45"/><circle cx="17" cy="8" r="4" fill="${C.rosa}" opacity=".45"/>
      </g>
    </g>
    <g id="moni-etq" transform="translate(0 -60)">
      <path d="M-7 13h14l-7 9z" fill="${C.blanco}"/>
      <rect id="moni-etq-caja" x="-50" y="-15" width="100" height="30" rx="15" fill="${C.blanco}"/>
      <text id="moni-etq-texto" x="0" y="6" text-anchor="middle" font-size="17" fill="${C.tinta}" class="tmono"></text>
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
      <radialGradient id="g-niebla-rosa"><stop offset="0" stop-color="${C.rosa}" stop-opacity=".18"/><stop offset="1" stop-color="${C.rosa}" stop-opacity="0"/></radialGradient>
      <radialGradient id="g-niebla-teal"><stop offset="0" stop-color="${C.cian}" stop-opacity=".16"/><stop offset="1" stop-color="${C.cian}" stop-opacity="0"/></radialGradient>
      <radialGradient id="g-niebla-lila"><stop offset="0" stop-color="${C.lila}" stop-opacity=".2"/><stop offset="1" stop-color="${C.lila}" stop-opacity="0"/></radialGradient>
      <linearGradient id="g-lcd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d3a4a"/><stop offset="1" stop-color="#0a1f3c"/></linearGradient>
      <g id="rutas" fill="none" stroke="none">${rutas}</g>
    </defs>
    ${cielo()}
    ${tienda()}
    ${avenida()}
    ${banco()}
    ${familia()}
    ${pilares()}
    ${taller()}
    ${soporte()}
    <g id="rastros">${rastros}</g>
    <g id="efimeros"></g>
    ${moni()}
    <g id="encima"></g>`;
}

export { monedita };
