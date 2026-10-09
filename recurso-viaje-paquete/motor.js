// ---------------------------------------------------------------------------
// EL MOTOR
//
// Dibuja el mundo, mueve la cámara y corre el guion momento por momento.
// Avanzar: →, espacio, Enter o tocar la pantalla. Regresar: ←.
// R repite la animación, F pantalla completa, N notas del docente.
// La posición se guarda en la dirección (#/7) para poder recargar.
// ---------------------------------------------------------------------------

import { mundo, mini as miniSvg, CAM } from './mundo.js';
import { GUION } from './guion.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const QUIETO = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CANCELADO = Symbol('cancelado');

const escenario = $('escenario');
const svg = $('mundo');
svg.innerHTML = mundo();

const paquiEl = $('paqui');
const efimeros = $('efimeros');
const encima = $('encima');

let actual = -1;
let turno = 0; // cambia en cada momento: las animaciones viejas se dan cuenta y se detienen
let notas = false;

/* ----------------------------------------------------------------- capas */

// Qué capas quedan encendidas al terminar cada momento (acumulado).
const CAPAS_FIN = [];
{
  const vivas = new Set();
  for (const m of GUION) {
    for (const c of m.mas ?? []) vivas.add(c);
    for (const c of m.menos ?? []) vivas.delete(c);
    for (const c of m.fin ?? []) vivas.add(c);
    CAPAS_FIN.push(new Set([...vivas, ...(m.temporal ?? [])]));
  }
}

let capas = new Set();
function ponerCapas(conjunto) {
  capas = new Set(conjunto);
  svg.setAttribute('class', [...capas].map((c) => `on-${c}`).join(' '));
  for (const el of svg.querySelectorAll('.capa')) {
    const nombre = [...el.classList].find((c) => c.startsWith('capa-')).slice(5);
    el.classList.toggle('ver', capas.has(nombre));
  }
}

/* ---------------------------------------------------------------- cámara */

let cam = [...CAM.todo];
let cuadro = 0;
const suave = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function fijarCamara(v) {
  cam = v;
  svg.setAttribute('viewBox', v.map((x) => x.toFixed(1)).join(' '));
}

function camara(destino, ms = 1400) {
  cancelAnimationFrame(cuadro);
  if (!ms || QUIETO) return fijarCamara([...destino]);
  const inicio = [...cam];
  const t0 = performance.now();
  const paso = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = suave(k);
    fijarCamara(inicio.map((a, i) => a + (destino[i] - a) * e));
    if (k < 1) cuadro = requestAnimationFrame(paso);
  };
  cuadro = requestAnimationFrame(paso);
}

/* ---------------------------------------------------------------- Paqui */

function paqui({ x, y, etq, ver, nace, brinca } = {}) {
  if (x !== undefined) paquiEl.setAttribute('transform', `translate(${x} ${y})`);
  if (etq !== undefined) {
    $('paqui-etq-texto').textContent = etq;
    const w = Math.max(60, etq.length * 10.4 + 26);
    $('paqui-etq-caja').setAttribute('x', -w / 2);
    $('paqui-etq-caja').setAttribute('width', w);
    $('paqui-etq').style.display = etq ? '' : 'none';
  }
  if (ver !== undefined) paquiEl.classList.toggle('oculto', !ver);
  if (nace) reanimar(paquiEl, 'nace');
  if (brinca) reanimar($('paqui-etq'), 'brinca');
}

function reanimar(el, clase) {
  el.classList.remove(clase);
  void el.getBoundingClientRect();
  el.classList.add(clase);
}

function rastros(ids = []) {
  for (const t of svg.querySelectorAll('.rastro')) {
    t.style.strokeDashoffset = ids.includes(t.id.slice(2)) ? '0' : '1';
  }
}

/* ------------------------------------------------ herramientas del guion */

function herramientas(mio) {
  const vivo = () => {
    if (mio !== turno) throw CANCELADO;
  };

  const espera = (ms) =>
    new Promise((ok, no) => {
      setTimeout(() => (mio === turno ? ok() : no(CANCELADO)), QUIETO ? Math.min(ms, 60) : ms);
    });

  /** Mueve un elemento por una ruta. Con `rastro`, va pintando el camino recorrido. */
  const mover = (el, ruta, ms, { reversa = false, rastro = false } = {}) =>
    new Promise((ok, no) => {
      const camino = $(`r-${ruta}`);
      const largo = camino.getTotalLength();
      const linea = rastro ? $(`t-${ruta}`) : null;
      const t0 = performance.now();
      const dur = QUIETO ? 1 : ms;
      const paso = (t) => {
        if (mio !== turno) return no(CANCELADO);
        const k = Math.min(1, (t - t0) / dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const p = camino.getPointAtLength(largo * (reversa ? 1 - e : e));
        el.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
        if (linea) linea.style.strokeDashoffset = String(1 - e);
        if (k < 1) requestAnimationFrame(paso);
        else ok();
      };
      requestAnimationFrame(paso);
    });

  const etiqueta = (texto, escala = 1) => {
    const w = texto.length * 9.9 + 24;
    return `<g class="mini__etq" transform="translate(0 ${-40 * escala}) scale(${escala})">
      <rect x="${-w / 2}" y="-14" width="${w}" height="28" rx="14" fill="#f7f4ff"/>
      <text y="5.5" text-anchor="middle" font-size="16" fill="#0a0c2c" class="tmono">${texto}</text>
    </g>`;
  };

  const crear = (clase, x, y, dentro, donde = efimeros) => {
    vivo();
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', `efi ${clase}`);
    g.setAttribute('transform', `translate(${x} ${y})`);
    g.innerHTML = dentro;
    donde.appendChild(g);
    return g;
  };

  const quitar = (el, ms = 0) => {
    setTimeout(() => {
      el.classList.add('sale');
      setTimeout(() => el.remove(), 400);
    }, ms);
  };

  return {
    espera,
    mover,
    quitar,
    paqui,
    rastros,
    viajar: (ruta, ms, o) => mover(paquiEl, ruta, ms, o),

    bandera(nombre, encendida) {
      vivo();
      const n = new Set(capas);
      if (encendida) n.add(nombre);
      else n.delete(nombre);
      ponerCapas(n);
    },

    /** Un paquete chiquito con etiqueta. */
    mini(color, texto, x, y, escala = 1) {
      const g = crear('mini', x, y, `<g class="efi__pop"><g class="mini__cuerpo">${miniSvg(color, 1.2 * escala)}</g><g class="mini__rot">${texto ? etiqueta(texto, escala) : ''}</g></g>`);
      g.dataset.escala = escala;
      return g;
    },
    etqMini(g, texto) {
      g.querySelector('.mini__rot').innerHTML = etiqueta(texto, Number(g.dataset.escala));
    },

    /**
     * Un globo de diálogo. Su pico apunta a (x + cola, y): hacia abajo, o hacia
     * arriba con `abajo` (el globo queda debajo de quien habla).
     */
    globo(x, y, texto, { ms = 0, escala = 1, cola = 0, abajo = false } = {}) {
      const w = texto.length * 9.7 + 38;
      const g = crear(
        'globo',
        x,
        y,
        `<g transform="scale(${escala})"><g class="efi__pop">
          <path d="${abajo ? `M${cola - 9} 2h18l-9 -13z` : `M${cola - 9} -2h18l-9 13z`}" fill="#f7f4ff"/>
          <rect x="${-w / 2}" y="${abajo ? 0 : -42}" width="${w}" height="42" rx="21" fill="#f7f4ff"/>
          <text y="${abajo ? 27 : -15}" text-anchor="middle" font-size="17.5" fill="#0a0c2c" class="tsans">${texto}</text>
        </g></g>`,
        encima
      );
      if (ms) quitar(g, ms);
      return g;
    },

    /** Una palomita o un tache. */
    sello(x, y, bien, ms = 0) {
      const g = crear(
        'sello',
        x,
        y,
        `<g class="efi__pop">
          <circle r="25" fill="${bien ? '#7be495' : '#ff4f8b'}"/>
          <circle r="25" fill="none" stroke="#f7f4ff" stroke-width="5"/>
          <path d="${bien ? 'M-11 1l8 8 15-17' : 'M-9-9l18 18M9-9l-18 18'}" fill="none" stroke="#0a0c2c" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
        </g>`,
        encima
      );
      if (ms) quitar(g, ms);
      return g;
    },

    brilla(id) {
      vivo();
      $(id).classList.add('brilla');
    },

    confeti(x, y) {
      const colores = ['#ffcf3f', '#ff4f8b', '#2ee6c5', '#4cc9f0', '#7be495', '#f7f4ff'];
      let piezas = '';
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const d = 90 + ((i * 53) % 110);
        piezas += `<rect class="confeti" x="-6" y="-6" width="${8 + (i % 3) * 4}" height="${8 + (i % 2) * 5}" rx="3" fill="${colores[i % colores.length]}" style="--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d - 50)}px;--giro:${(i % 2 ? 1 : -1) * (160 + i * 9)}deg"/>`;
      }
      quitar(crear('fiesta', x, y, piezas, encima), 1300);
    }
  };
}

/* ------------------------------------------- la tarjeta de la dirección */

const ANATOMIA = [
  {
    chip: 'Cómo se lee una dirección',
    titulo: 'De izquierda a derecha, de lo grande a lo chico',
    oct: [10, 0, 1, 25],
    fijos: 4,
    rotulos: [
      { desde: 1, hasta: 3, clase: 'a', texto: 'el fraccionamiento', sub: 'VPC' },
      { desde: 5, hasta: 5, clase: 'b', texto: 'la calle', sub: 'subred' },
      { desde: 7, hasta: 7, clase: 'c', texto: 'la casa', sub: 'servidor' }
    ],
    cuenta: '',
    remate: 'Igual que un domicilio: colonia, calle y número. Solo que aquí todo son números del 0 al 255.'
  },
  {
    chip: 'Grupos de direcciones · CIDR',
    titulo: 'La diagonal dice cuántos números quedan fijos',
    oct: [10, 0, 0, 0],
    fijos: 2,
    diag: '/16',
    cuenta: '65,536 direcciones',
    remate: '<b>10.0.0.0/16</b> quiere decir «todo lo que empiece con 10.0». Así se escribe el fraccionamiento completo.'
  },
  {
    chip: 'Grupos de direcciones · CIDR',
    titulo: 'Número más grande, grupo más chico',
    oct: [10, 0, 1, 0],
    fijos: 3,
    diag: '/24',
    cuenta: '256 direcciones',
    remate: '<b>10.0.1.0/24</b> quiere decir «todo lo que empiece con 10.0.1». Así se escribe una calle.'
  },
  {
    chip: 'Grupos de direcciones · CIDR',
    titulo: 'Y el grupo más grande de todos',
    oct: [0, 0, 0, 0],
    fijos: 0,
    diag: '/0',
    cuenta: 'Todas las direcciones',
    remate: '<b>0.0.0.0/0</b>: ningún número queda fijo. Es la forma de escribir «cualquier lugar de internet».'
  }
];

let ruleta = 0;
function pintarAnatomia(sub) {
  clearInterval(ruleta);
  const a = ANATOMIA[sub];
  $('an-chip').textContent = a.chip;
  $('an-titulo').textContent = a.titulo;
  $('an-cuenta').textContent = a.cuenta;
  $('an-remate').innerHTML = a.remate;

  let html = '';
  a.oct.forEach((v, i) => {
    const fijo = i < a.fijos;
    const estado = a.diag ? (fijo ? 'fijo' : 'libre') : '';
    html += `<span class="ip__oct ${estado}" style="grid-column:${i * 2 + 1}"${fijo ? '' : ' data-libre'}>${v}</span>`;
    if (i < 3) html += `<span class="ip__punto" style="grid-column:${i * 2 + 2}">.</span>`;
  });
  if (a.diag) {
    html += `<span class="ip__diag" style="grid-column:8">${a.diag}</span>`;
    a.oct.forEach((_, i) => {
      const fijo = i < a.fijos;
      html += `<span class="ip__rot ip__rot--${fijo ? 'fijo' : 'libre'}" style="grid-column:${i * 2 + 1}">${fijo ? 'fijo' : 'cualquiera'}</span>`;
    });
  } else {
    for (const r of a.rotulos) {
      html += `<span class="ip__rot ip__rot--${r.clase}" style="grid-column:${r.desde} / ${r.hasta + 1}">${r.texto}<small>${r.sub}</small></span>`;
    }
  }
  $('an-ip').innerHTML = html;

  // Los números libres giran: cualquier valor del 0 al 255 cabe ahí.
  const libres = [...$('an-ip').querySelectorAll('[data-libre]')];
  if (libres.length && !QUIETO) {
    ruleta = setInterval(() => {
      for (const el of libres) el.textContent = Math.floor(Math.random() * 256);
    }, 110);
  }
}

/* ------------------------------------------------------------- momentos */

const cuerpo = document.querySelector('.rotulo__cuerpo');

function pintarRotulo(m) {
  const tarjeta = m.tarjeta ?? null;
  escenario.classList.toggle('con-tarjeta', Boolean(tarjeta));
  escenario.classList.toggle('con-portada', tarjeta === 'portada' || tarjeta === 'fin');
  for (const t of document.querySelectorAll('.tarjeta')) t.classList.toggle('activa', t.id === `t-${tarjeta}`);
  if (tarjeta === 'anatomia') pintarAnatomia(m.sub ?? 0);
  else clearInterval(ruleta);

  if (!tarjeta) {
    $('r-parada').textContent = m.parada ?? '';
    $('r-titulo').textContent = m.titulo ?? '';
    $('r-texto').innerHTML = m.texto ?? '';
    $('r-aws').hidden = !m.aws;
    $('r-aws-nombre').textContent = m.aws ?? '';
    reanimar(cuerpo, 'entra');
    reanimar($('r-aws'), 'entra');
  }

  $('nota').hidden = !(notas && m.nota);
  $('nota').textContent = m.nota ?? '';
  $('cuenta').textContent = `${actual + 1} / ${GUION.length}`;
  [...$('avance').children].forEach((b, i) => {
    b.classList.toggle('hecho', i < actual);
    b.classList.toggle('actual', i === actual);
  });
}

/** Deja el mundo como queda al terminar el momento `i`. */
function estadoFinal(i) {
  const m = GUION[i];
  ponerCapas(CAPAS_FIN[i]);
  paqui({ ver: true, etq: '', ...m.paq });
  rastros(m.rastro ?? []);
}

async function ir(i, animar = true) {
  i = Math.max(0, Math.min(GUION.length - 1, i));
  const adelante = animar && i === actual + 1;
  const repite = animar && i === actual;
  actual = i;
  const mio = ++turno;
  const m = GUION[i];

  efimeros.innerHTML = '';
  encima.innerHTML = '';
  for (const el of svg.querySelectorAll('.brilla')) el.classList.remove('brilla');
  history.replaceState(null, '', `#/${i + 1}`);
  pintarRotulo(m);

  if ((adelante || repite) && m.accion && !QUIETO) {
    // Arranca desde donde terminó el momento anterior y corre la animación.
    if (i > 0) estadoFinal(i - 1);
    const inicio = new Set(i > 0 ? CAPAS_FIN[i - 1] : []);
    for (const c of GUION[i - 1]?.temporal ?? []) inicio.delete(c);
    for (const c of m.mas ?? []) inicio.add(c);
    for (const c of m.menos ?? []) inicio.delete(c);
    ponerCapas(inicio);
    camara(CAM[m.cam]);
    try {
      await m.accion(herramientas(mio));
    } catch (e) {
      if (e !== CANCELADO) console.error(e);
      return;
    }
    if (mio !== turno) return;
    // Deja las capas finales sin borrar lo que la animación dejó a la vista.
    ponerCapas(CAPAS_FIN[i]);
    if (m.paq) paqui({ ...m.paq });
    rastros(m.rastro ?? []);
    return;
  }

  camara(CAM[m.cam], animar ? 1400 : 0);
  estadoFinal(i);
}

const siguiente = () => (actual < GUION.length - 1 ? ir(actual + 1) : null);
const anterior = () => (actual > 0 ? ir(actual - 1) : null);

/* ------------------------------------------------------------- controles */

$('avance').innerHTML = GUION.map((m, i) => `<button type="button" aria-label="Ir al momento ${i + 1}" data-i="${i}"></button>`).join('');
$('avance').addEventListener('click', (e) => {
  e.stopPropagation();
  const b = e.target.closest('button');
  if (b) ir(Number(b.dataset.i));
});

function pantallaCompleta() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

document.querySelector('.controles').addEventListener('click', (e) => e.stopPropagation());
$('btn-sig').addEventListener('click', siguiente);
$('btn-ant').addEventListener('click', anterior);
$('btn-repetir').addEventListener('click', () => ir(actual));
$('btn-pantalla').addEventListener('click', pantallaCompleta);
$('btn-reiniciar').addEventListener('click', (e) => {
  e.stopPropagation();
  ir(0);
});

// Tocar el escenario avanza; los botones, ligas y preguntas hacen lo suyo.
escenario.addEventListener('click', (e) => {
  if (e.target.closest('a, button, fieldset')) return;
  siguiente();
});

for (const p of document.querySelectorAll('.pregunta')) {
  p.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-ok')) {
      b.classList.add('bien');
      p.classList.add('resuelta');
    } else {
      b.classList.remove('mal');
      void b.offsetWidth;
      b.classList.add('mal');
    }
  });
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const enBoton = e.target.closest?.('button, a');
  const tecla = e.key;
  if (tecla === 'ArrowRight' || tecla === 'PageDown' || (!enBoton && (tecla === ' ' || tecla === 'Enter'))) {
    e.preventDefault();
    siguiente();
  } else if (tecla === 'ArrowLeft' || tecla === 'PageUp' || tecla === 'Backspace') {
    e.preventDefault();
    anterior();
  } else if (tecla === 'Home') ir(0);
  else if (tecla === 'End') ir(GUION.length - 1, false);
  else if (tecla === 'f' || tecla === 'F') pantallaCompleta();
  else if (tecla === 'r' || tecla === 'R') ir(actual);
  else if (tecla === 'n' || tecla === 'N') {
    notas = !notas;
    $('nota').hidden = !(notas && GUION[actual].nota);
  }
});

// Deslizar en el celular.
let toqueX = null;
escenario.addEventListener('touchstart', (e) => (toqueX = e.touches[0].clientX), { passive: true });
escenario.addEventListener('touchend', (e) => {
  if (toqueX === null) return;
  const dx = e.changedTouches[0].clientX - toqueX;
  toqueX = null;
  if (Math.abs(dx) < 60) return;
  e.preventDefault();
  if (dx < 0) siguiente();
  else anterior();
});

// Arranca donde diga la dirección (#/7), sin animar.
const pedido = Number((location.hash.match(/^#\/(\d+)/) ?? [])[1]);
fijarCamara([...CAM.todo]);
ir(Number.isInteger(pedido) && pedido >= 1 ? pedido - 1 : 0, false);
