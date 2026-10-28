// ---------------------------------------------------------------------------
// LA CONSOLA DE AWS SIMULADA
//
//   const consola = montarConsola(contenedor, { estado, alumno, alCambiar, soloLectura });
//   consola.irA('ec2/instancias');
//   consola.destruir();
//
// Arma el marco (barra superior con buscador, región y cuenta; barra de
// favoritos; menú lateral del servicio; migas; alertas «flashbar»; panel de
// ayuda a la derecha) y un enrutador interno que NO toca location.hash: la
// ruta vive en memoria ('vpc/subredes/subnet-0abc…').
//
// Cada servicio (servicios/*.js) declara su menú y sus rutas; cada ruta es una
// función (cx, params) → nodo. `cx` es el contexto que reciben todas las
// pantallas: el estado, ir(), hacer() para llamar acciones de modelo.js,
// flash(), modal(), ayuda()… Ver NUCLEO.md.
//
// Cada segundo llama avanzar(estado) (pending → running…) y repinta solo las
// zonas «vivas» que cambiaron, sin tocar lo que el alumno está escribiendo.
// ---------------------------------------------------------------------------

import { avanzar, clonar, ErrorAws, REGION } from './modelo.js';
import { SERVICIOS } from './servicios/index.js';
import * as ui from './ui.js';
import { abrirNavegador } from './navegador.js';

const { h, icono, reemplazar, iconoServicio, CATEGORIAS } = ui;

/* ================================================================ estilos */

/** Carga consola.css una sola vez (si la página no lo trae ya). */
function cargarEstilos() {
  const url = new URL('./consola.css', import.meta.url).href;
  const ya = [...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === url || /consola\/consola\.css(\?|$)/.test(l.getAttribute('href') ?? ''));
  if (!ya) document.head.append(h('link', { rel: 'stylesheet', href: url, 'data-consola': '' }));
}

const formatoCuenta = (id) => String(id ?? '').replace(/^(\d{4})(\d{4})(\d{4})$/, '$1-$2-$3');

/* =================================================================== rutas */

/** 'vpc/subredes/subnet-1' contra 'subredes/:id' → { id: 'subnet-1' } | null */
function coincide(patron, partes) {
  const p = patron ? patron.split('/') : [];
  if (p.length !== partes.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(partes[i]);
    else if (p[i] !== partes[i]) return null;
  }
  return params;
}

function resolver(servicio, resto) {
  const partes = resto ? resto.split('/').filter(Boolean) : [];
  const patrones = Object.keys(servicio.rutas ?? {}).sort((a, b) => (a.match(/:/g)?.length ?? 0) - (b.match(/:/g)?.length ?? 0));
  for (const patron of patrones) {
    const params = coincide(patron, partes);
    if (params) return { vista: servicio.rutas[patron], params, patron };
  }
  return null;
}

/* ============================================================ las regiones */

const REGIONES = [
  ['United States', [['N. Virginia', 'us-east-1'], ['Ohio', 'us-east-2'], ['N. California', 'us-west-1'], ['Oregon', 'us-west-2']]],
  ['Asia Pacific', [['Mumbai', 'ap-south-1'], ['Osaka', 'ap-northeast-3'], ['Seoul', 'ap-northeast-2'], ['Singapore', 'ap-southeast-1'], ['Sydney', 'ap-southeast-2'], ['Tokyo', 'ap-northeast-1']]],
  ['Canada', [['Central', 'ca-central-1']]],
  ['Europe', [['Frankfurt', 'eu-central-1'], ['Ireland', 'eu-west-1'], ['London', 'eu-west-2'], ['Paris', 'eu-west-3'], ['Stockholm', 'eu-north-1']]],
  ['Mexico', [['Central', 'mx-central-1']]],
  ['South America', [['São Paulo', 'sa-east-1']]]
];

/* ================================================== ayudas de la consola */

const AYUDAS_BASE = {
  region: {
    titulo: 'Regiones',
    texto: [
      'Una **región** es un lugar del mundo donde AWS tiene centros de datos (por ejemplo **N. Virginia**, `us-east-1`). Lo que creas vive en la región que tengas elegida arriba a la derecha.',
      'Si un día «desaparecen» tus recursos, casi siempre es porque cambiaste de región sin querer.',
      'En este simulador trabajas siempre en **N. Virginia (us-east-1)**.'
    ]
  },
  simulador: {
    titulo: 'Este simulador',
    texto: [
      'Esta consola imita la consola real de AWS: los nombres de botones y menús están en inglés, igual que en AWS, y los errores salen en rojo con el mensaje en inglés que daría AWS.',
      'Las ayudas «Info» (como esta) están en español. Úsalas cuando no sepas para qué sirve un campo.',
      'Nada de lo que hagas aquí cuesta dinero ni toca una cuenta real.'
    ]
  },
  navegador: {
    titulo: 'El navegador',
    texto: [
      'Es un navegador de prueba que abre direcciones **desde tu casa** (tu IP pública) hacia tus servidores en la nube.',
      'Escribe la IP pública o el DNS público de tu instancia. Si la página no carga, algo en el camino la bloquea: revisa la red, las reglas y el servidor web.'
    ]
  }
};

/* ============================================================ montarConsola */

export function montarConsola(contenedor, opciones = {}) {
  cargarEstilos();
  const estado = opciones.estado;
  if (!estado) throw new Error('montarConsola: falta opciones.estado (usa cuentaNueva() de modelo.js)');
  const alumno = opciones.alumno ?? {};
  const soloLectura = Boolean(opciones.soloLectura);
  const alCambiar = typeof opciones.alCambiar === 'function' ? opciones.alCambiar : () => {};

  const servicios = new Map(SERVICIOS.map((s) => [s.id, s]));
  const ayudas = { ...AYUDAS_BASE };
  for (const s of SERVICIOS) Object.assign(ayudas, s.ayudas ?? {});

  // Lo que la consola recuerda mientras está montada (no va al estado).
  const memoria = {
    ruta: '',
    recientes: ['ec2', 'vpc', 's3', 'iam'],
    flashes: [],
    lateralAbierto: true,
    ayudaAbierta: null,
    refrescadores: [],
    datos: {} // para pasar cosas entre pantallas (cx.memoria)
  };

  /* ---------------------------------------------------------- esqueleto */

  const raiz = h('div', { class: ['cx', soloLectura && 'cx-solo'], 'data-consola': '' });
  const barra = h('header', { class: 'cx-barra' });
  const favoritos = h('nav', { class: 'cx-favoritos', 'aria-label': 'Favorites' });
  const lateral = h('nav', { class: 'cx-lateral', 'aria-label': 'Service navigation' });
  const fila = h('div', { class: 'cx-fila-migas' });
  const flashbar = h('div', { class: 'cx-flashbar', 'aria-live': 'polite' });
  const pagina = h('div', { class: 'cx-pagina' });
  const principal = h('main', { class: 'cx-principal', tabindex: '-1' }, fila, flashbar, pagina);
  const ayuda = h('aside', { class: 'cx-ayuda', 'aria-label': 'Help panel', hidden: true });
  const cuerpo = h('div', { class: 'cx-cuerpo' }, lateral, principal, ayuda);
  const capa = h('div', { class: 'cx-capa' });
  const modales = h('div', { class: 'cx-modales' });
  ui.agregar(raiz, [barra, favoritos, cuerpo, capa, modales]);
  contenedor.replaceChildren(raiz);

  // El marco no debe desplazarse nunca (solo .cx-principal y los paneles): un
  // scrollIntoView o un foco podrían moverlo y esconder la barra superior.
  for (const el of [raiz, cuerpo]) {
    el.addEventListener('scroll', () => {
      if (el.scrollTop || el.scrollLeft) el.scrollTop = el.scrollLeft = 0;
    });
  }

  /* ------------------------------------------------------------ contexto */

  let migasActuales = [];
  const pilaZonas = []; // zonas vivas que se están construyendo (ver cx.vivo)

  const cx = {
    estado,
    alumno,
    soloLectura,
    raiz,
    get ruta() {
      return memoria.ruta;
    },
    /** El id del servicio de la pantalla actual ('ec2', 'vpc'…): sirve a las pantallas compartidas. */
    servicio: 'inicio',
    memoria: memoria.datos,

    ir,

    /**
     * Llama una acción de modelo.js: cx.hacer({ servicio: 'VPC', accion: 'CreateVpc', error: 'Failed to create VPC' }, (e) => crearVpc(e, {...}))
     * Si sale bien, avisa a alCambiar y repinta; si lanza ErrorAws, muestra la alerta roja
     * con su mensaje. Devuelve { ok, valor, error }.
     *   atomico: true → la prueba primero sobre una copia (para acciones que hacen varias cosas).
     *   flash: false  → no muestra la alerta roja (la pantalla la muestra a su modo).
     */
    hacer(meta, fn, { atomico = false, flash: mostrar = true } = {}) {
      if (soloLectura) {
        cx.flash({ tipo: 'info', texto: 'Modo de solo lectura: no se pueden hacer cambios en esta cuenta.' });
        return { ok: false, error: new ErrorAws('ReadOnly', 'Read-only mode') };
      }
      try {
        if (atomico) fn(clonar(estado));
        const valor = fn(estado);
        try {
          alCambiar(estado, { servicio: meta?.servicio ?? cx.servicio, accion: meta?.accion ?? '' });
        } catch (e) {
          console.error('alCambiar falló', e);
        }
        refrescar();
        return { ok: true, valor };
      } catch (e) {
        const esAws = e instanceof ErrorAws || e?.name === 'ErrorAws';
        if (!esAws) console.error(e);
        if (mostrar) {
          cx.flash({
            tipo: 'error',
            titulo: meta?.error,
            texto: esAws ? e.message : `An unexpected error occurred: ${e?.message ?? e}`,
            fijo: true
          });
          principal.scrollTop = 0;
        }
        return { ok: false, error: e };
      }
    },

    /**
     * Alerta de la flashbar: { tipo: 'exito' | 'error' | 'info' | 'aviso' | 'progreso', titulo, texto (texto o nodos),
     * accion: { texto, alClic } }. Sobrevive a la siguiente navegación (para el «Successfully created…» tras crear).
     */
    flash(f) {
      // Las rojas se van con la siguiente navegación; las demás sobreviven a una.
      const item = { ...f, id: ui.idUnico('flash'), navegaciones: f.tipo === 'error' ? 1 : 0 };
      memoria.flashes = [item, ...memoria.flashes].slice(0, 4);
      pintarFlashes();
      return item.id;
    },
    quitarFlash(id) {
      memoria.flashes = memoria.flashes.filter((f) => f.id !== id);
      pintarFlashes();
    },
    limpiarFlashes() {
      memoria.flashes = [];
      pintarFlashes();
    },

    modal: (op) => ui.modal(raiz, op),
    confirmar: (op) => ui.confirmar(raiz, op),

    /** Abre el panel de ayuda con un tema registrado (ver `ayudas` en cada servicio). */
    ayuda(tema) {
      memoria.ayudaAbierta = tema;
      pintarAyuda();
    },

    /** Abre el navegador simulado (opcionalmente con una dirección). */
    navegador: (url) => abrirNavegador(cx, url),

    /** Las migas de pan de la pantalla actual: [{ texto, ruta }]. */
    migas(lista) {
      migasActuales = lista;
      pintarFila();
    },

    /** Registra una función que se llama cada segundo y tras cada acción. */
    alRefrescar(fn) {
      // Se anota quién la registró (las zonas vivas en construcción) para
      // soltarla cuando esa zona se reconstruya.
      memoria.refrescadores.push({ fn, pila: [...pilaZonas] });
    },

    /**
     * Una zona «viva»: se vuelve a construir con fn() cada segundo, pero solo se
     * reemplaza si cambió lo que se ve y si el alumno no está escribiendo dentro.
     * .repintar() la fuerza.
     */
    vivo(fn, { etiqueta = 'div', clase } = {}) {
      const el = h(etiqueta, { class: clase });
      const zona = {};
      let ultimo = null;
      const pintar = (forzar) => {
        const a = document.activeElement;
        if (!forzar && a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
        // Lo que se registre mientras se construye (tablas, zonas internas) es de esta zona.
        const marca = memoria.refrescadores.length;
        pilaZonas.push(zona);
        let nuevo;
        try {
          nuevo = h('div', {}, fn());
        } finally {
          pilaZonas.pop();
        }
        const nuevas = memoria.refrescadores.splice(marca);
        const html = nuevo.innerHTML;
        if (!forzar && html === ultimo) return; // no cambió: se queda lo de antes
        ultimo = html;
        memoria.refrescadores = memoria.refrescadores.filter((r) => !r.pila.includes(zona)).concat(nuevas);
        el.replaceChildren(...nuevo.childNodes);
      };
      pintar(true);
      cx.alRefrescar(() => pintar(false));
      el.repintar = () => pintar(true);
      return el;
    },

    /** Repinta ya todas las zonas vivas (lo hace solo cada segundo). */
    refrescar: () => refrescar(),

    /** El servicio registrado con ese id (para íconos y nombres). */
    servicioDe: (id) => servicios.get(id),
    iconoServicio
  };

  /* ---------------------------------------------------------- navegación */

  function ir(ruta = '') {
    ui.cerrarDesplegable();
    // Si la consola es angosta, el menú lateral flota encima del contenido:
    // se cierra al navegar para dejar ver la pantalla nueva.
    if (raiz.clientWidth && raiz.clientWidth < 900) memoria.lateralAbierto = false;
    const limpia = String(ruta ?? '').replace(/^\/+|\/+$/g, '');
    const [id, ...resto] = limpia.split('/');
    const servicio = servicios.get(id || 'inicio') ?? servicios.get('inicio');
    const restoRuta = servicios.has(id) ? resto.join('/') : '';
    memoria.ruta = servicios.has(id) ? limpia : 'inicio';
    cx.servicio = servicio.id;
    if (servicio.id !== 'inicio') memoria.recientes = [servicio.id, ...memoria.recientes.filter((x) => x !== servicio.id)].slice(0, 8);

    // Las alertas viejas se van tras una navegación (las nuevas sobreviven a la primera).
    memoria.flashes = memoria.flashes.filter((f) => (f.navegaciones += 1) <= 1);

    memoria.refrescadores = [];
    migasActuales = [];
    let nodo;
    const r = resolver(servicio, restoRuta);
    try {
      nodo = r ? r.vista(cx, r.params) : ui.noDisponible('Page not found', `La dirección «${limpia}» no existe en este simulador.`);
    } catch (e) {
      console.error(e);
      nodo = ui.alerta({ tipo: 'error', titulo: 'Something went wrong', contenido: String(e?.message ?? e) });
    }
    reemplazar(pagina, nodo);
    if (!migasActuales.length && servicio.id !== 'inicio') migasActuales = [{ texto: servicio.titulo ?? servicio.nombre, ruta: servicio.id }];
    pintarLateral(servicio);
    pintarFila();
    pintarFlashes();
    pintarFavoritos();
    principal.scrollTop = 0;
    raiz.classList.toggle('cx--inicio', servicio.id === 'inicio');
  }

  function refrescar() {
    // Copia: una zona puede cambiar la lista mientras se recorre.
    for (const r of [...memoria.refrescadores]) {
      if (!memoria.refrescadores.includes(r)) continue;
      try {
        r.fn();
      } catch (e) {
        console.error('Error al refrescar', e);
      }
    }
  }

  /* ---------------------------------------------------------- la barra */

  const buscador = ui.entrada({ placeholder: 'Search', etiquetaAccesible: 'Search for services, features, and more', buscar: true, sufijo: '[Alt+S]' });
  const inputBuscar = buscador.querySelector('input');

  function resultadosBusqueda(texto) {
    const t = texto.trim().toLowerCase();
    // Primero el servicio que se llama así («VPC»), luego los que empiezan
    // así y al final los que solo lo mencionan: Enter abre el primero.
    const rango = (x) => {
      const n = String(x.nombre ?? '').toLowerCase();
      return n === t ? 0 : n.startsWith(t) ? 1 : 2;
    };
    const srv = SERVICIOS.filter((s) => s.id !== 'inicio' && `${s.nombre} ${s.titulo ?? ''} ${s.descripcion ?? ''} ${s.claves ?? ''}`.toLowerCase().includes(t)).sort(
      (a, b) => rango(a) - rango(b)
    );
    const funciones = SERVICIOS.flatMap((s) => (s.busqueda ?? []).map((b) => ({ ...b, servicio: s }))).filter((b) => `${b.texto} ${b.claves ?? ''}`.toLowerCase().includes(t));
    return { srv, funciones };
  }

  function pintarBusqueda() {
    const texto = inputBuscar.value;
    if (!texto.trim()) {
      if (ui.cerrarDesplegable && abiertoBuscar()) ui.cerrarDesplegable();
      return;
    }
    const { srv, funciones } = resultadosBusqueda(texto);
    const elegir = (ruta) => {
      ui.cerrarDesplegable();
      inputBuscar.value = '';
      inputBuscar.blur();
      ir(ruta);
    };
    const contenido = h(
      'div',
      { class: 'cx-busqueda' },
      h('div', { class: 'cx-busqueda__titulo' }, `Services`),
      srv.length
        ? srv.map((s) =>
            h(
              'button',
              { type: 'button', class: 'cx-busqueda__item', onclick: () => elegir(s.proximamente ? s.id : s.inicio ?? s.id) },
              iconoServicio(s, 28),
              h('span', {}, h('b', {}, s.nombre), h('small', {}, s.proximamente ? 'Próximamente en el simulador' : s.descripcion ?? ''))
            )
          )
        : h('div', { class: 'cx-busqueda__vacio' }, 'No services match your search'),
      funciones.length ? h('div', { class: 'cx-busqueda__titulo' }, 'Features') : null,
      funciones.slice(0, 8).map((f) =>
        h(
          'button',
          { type: 'button', class: 'cx-busqueda__item cx-busqueda__item--funcion', onclick: () => elegir(f.ruta) },
          iconoServicio(f.servicio, 20),
          h('span', {}, h('b', {}, f.texto), h('small', {}, `${f.servicio.nombre} feature`))
        )
      )
    );
    const d = ui.abrirDesplegable(buscador, contenido, { ancho: Math.max(420, buscador.offsetWidth), clase: 'cx-desplegable--busqueda' });
    if (d) d.esBusqueda = true;
  }
  const abiertoBuscar = () => raiz.querySelector('.cx-desplegable--busqueda');
  inputBuscar.addEventListener('input', pintarBusqueda);
  inputBuscar.addEventListener('focus', () => inputBuscar.value && pintarBusqueda());
  inputBuscar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      raiz.querySelector('.cx-busqueda__item')?.focus();
    } else if (e.key === 'Enter') {
      // Si la lista aún no se abrió, se arma en ese momento.
      if (!abiertoBuscar()) pintarBusqueda();
      raiz.querySelector('.cx-busqueda__item')?.click();
    } else if (e.key === 'Escape') {
      ui.cerrarDesplegable();
      inputBuscar.blur();
    }
  });

  function menuServicios(b) {
    const porCategoria = {};
    for (const s of SERVICIOS) if (s.id !== 'inicio') (porCategoria[s.categoria] ??= []).push(s);
    const ir2 = (s) => {
      ui.cerrarDesplegable();
      ir(s.inicio ?? s.id);
    };
    const contenido = h(
      'div',
      { class: 'cx-menu-servicios' },
      h(
        'div',
        { class: 'cx-menu-servicios__col' },
        h('div', { class: 'cx-busqueda__titulo' }, 'Recently visited'),
        memoria.recientes
          .map((id) => servicios.get(id))
          .filter(Boolean)
          .map((s) => h('button', { type: 'button', class: 'cx-busqueda__item', onclick: () => ir2(s) }, iconoServicio(s, 20), h('span', {}, h('b', {}, s.nombre))))
      ),
      h(
        'div',
        { class: 'cx-menu-servicios__col' },
        h('div', { class: 'cx-busqueda__titulo' }, 'All services'),
        Object.entries(porCategoria).map(([cat, lista]) => [
          h('div', { class: 'cx-menu-servicios__cat' }, CATEGORIAS[cat]?.nombre ?? cat),
          lista.map((s) =>
            h('button', { type: 'button', class: 'cx-busqueda__item', onclick: () => ir2(s) }, iconoServicio(s, 20), h('span', {}, h('b', {}, s.nombre), h('small', {}, s.proximamente ? 'Próximamente' : s.descripcion ?? '')))
          )
        ])
      )
    );
    const d = ui.abrirDesplegable(b, contenido, { ancho: 560, clase: 'cx-desplegable--panel' });
    if (d) d.ancla = b;
  }

  function menuRegion(b) {
    const contenido = h(
      'div',
      { class: 'cx-menu-region' },
      ui.alerta({ tipo: 'info', contenido: 'En este laboratorio trabajas en N. Virginia (us-east-1). Las demás regiones se ven, pero no se pueden elegir.' }),
      REGIONES.map(([grupo, lista]) => [
        h('div', { class: 'cx-menu-region__grupo' }, grupo),
        lista.map(([nombre, codigo]) =>
          h(
            'button',
            {
              type: 'button',
              class: ['cx-menu-region__item', codigo === REGION.codigo && 'cx-menu-region__item--actual'],
              disabled: codigo !== REGION.codigo,
              onclick: () => ui.cerrarDesplegable()
            },
            h('span', {}, nombre),
            h('span', { class: 'cx-menu-region__codigo' }, codigo),
            codigo === REGION.codigo ? icono('check') : null
          )
        )
      ])
    );
    const d = ui.abrirDesplegable(b, contenido, { ancho: 300, alinear: 'derecha', clase: 'cx-desplegable--panel' });
    if (d) d.ancla = b;
  }

  function menuCuenta(b) {
    const cuenta = formatoCuenta(estado.cuenta?.id);
    const contenido = h(
      'div',
      { class: 'cx-menu-cuenta' },
      h(
        'div',
        { class: 'cx-menu-cuenta__datos' },
        h('div', {}, h('span', { class: 'cx-menu-cuenta__etq' }, 'Account ID'), ui.copiable(cuenta, { etiqueta: 'Account ID copied' })),
        h('div', {}, h('span', { class: 'cx-menu-cuenta__etq' }, 'Federated user'), h('span', {}, alumno.nombre || estado.cuenta?.usuario || 'alumno')),
        alumno.matricula ? h('div', {}, h('span', { class: 'cx-menu-cuenta__etq' }, 'Matrícula'), h('span', {}, alumno.matricula)) : null
      ),
      ['Account', 'Organization', 'Service Quotas', 'Billing and Cost Management', 'Security credentials'].map((t) => h('button', { type: 'button', class: 'cx-menu__item', disabled: true }, t)),
      h('div', { class: 'cx-menu-cuenta__pie' }, h('button', { type: 'button', class: 'cx-boton cx-boton--normal', disabled: true }, h('span', {}, 'Sign out')))
    );
    const d = ui.abrirDesplegable(b, contenido, { ancho: 300, alinear: 'derecha', clase: 'cx-desplegable--panel' });
    if (d) d.ancla = b;
  }

  function botonBarra(contenido, op) {
    const b = h('button', { type: 'button', class: ['cx-barra__boton', op.clase], title: op.titulo, 'aria-label': op.titulo, disabled: op.desactivado }, contenido);
    b.addEventListener('click', () => (b.getAttribute('aria-expanded') === 'true' ? ui.cerrarDesplegable() : op.alClic?.(b)));
    return b;
  }

  function pintarBarra() {
    const nombre = alumno.nombre || estado.cuenta?.usuario || 'alumno';
    reemplazar(
      barra,
      h(
        'a',
        {
          href: '#',
          class: 'cx-marca',
          title: 'Console Home',
          onclick: (e) => {
            e.preventDefault();
            ir('inicio');
          }
        },
        h('span', { class: 'cx-marca__logo' }, '☁︎ Consola'),
        h('span', { class: 'cx-marca__simulador' }, 'Simulador')
      ),
      botonBarra(icono('grid'), { titulo: 'Services', alClic: menuServicios }),
      h('div', { class: 'cx-barra__buscar' }, buscador),
      h('div', { class: 'cx-barra__espacio' }),
      botonBarra([icono('browser'), h('span', { class: 'cx-barra__texto' }, 'Navegador')], { titulo: 'Navegador de prueba (abre direcciones desde tu casa)', alClic: () => cx.navegador(''), clase: 'cx-barra__boton--texto' }),
      botonBarra(icono('terminal'), { titulo: 'CloudShell (not available in this simulator)', desactivado: true }),
      botonBarra(icono('notification'), { titulo: 'Notifications', alClic: (b) => {
        const d = ui.abrirDesplegable(b, h('div', { class: 'cx-menu-cuenta' }, h('div', { class: 'cx-busqueda__titulo' }, 'Notifications'), h('p', { class: 'cx-texto-sec', style: { padding: '8px 16px 16px' } }, 'No new notifications.')), { ancho: 280, alinear: 'derecha', clase: 'cx-desplegable--panel' });
        if (d) d.ancla = b;
      } }),
      botonBarra(icono('help'), { titulo: 'Help', alClic: () => cx.ayuda('simulador') }),
      botonBarra(icono('settings'), { titulo: 'Settings', desactivado: true }),
      // Región y cuenta tienen versión larga y corta: en anchos medianos se compactan (como en AWS).
      botonBarra([h('span', { class: 'cx-barra__largo' }, `United States (${REGION.corto})`), h('span', { class: 'cx-barra__corto' }, REGION.corto), icono('caret-down')], { titulo: `Region: ${REGION.nombre}`, alClic: menuRegion, clase: 'cx-barra__boton--texto cx-barra__region' }),
      botonBarra([h('span', { class: 'cx-barra__cuenta' }, h('span', { class: 'cx-barra__usuario' }, nombre), h('span', { class: 'cx-barra__largo' }, ` @ ${formatoCuenta(estado.cuenta?.id)}`)), icono('caret-down')], { titulo: `Account: ${nombre} @ ${formatoCuenta(estado.cuenta?.id)}`, alClic: menuCuenta, clase: 'cx-barra__boton--texto cx-barra__boton--cuenta' })
    );
  }

  function pintarFavoritos() {
    const favs = ['ec2', 'vpc', 's3', 'iam'].map((id) => servicios.get(id)).filter(Boolean);
    reemplazar(
      favoritos,
      favs.map((s) =>
        h(
          'a',
          {
            href: '#',
            class: ['cx-favorito', cx.servicio === s.id && 'cx-favorito--activo'],
            onclick: (e) => {
              e.preventDefault();
              ir(s.inicio ?? s.id);
            }
          },
          iconoServicio(s, 16),
          h('span', {}, s.nombre)
        )
      )
    );
  }

  /* ---------------------------------------------------------- lateral */

  function activo(ruta) {
    return memoria.ruta === ruta || memoria.ruta.startsWith(`${ruta}/`);
  }

  function pintarLateral(servicio) {
    const menu = servicio.menu ?? [];
    raiz.classList.toggle('cx--sin-lateral', !menu.length || !memoria.lateralAbierto);
    if (!menu.length) {
      reemplazar(lateral);
      return;
    }
    // La ruta activa es la más larga que coincide.
    const rutas = menu.flatMap((m) => (m.items ? m.items : [m])).filter((m) => m.ruta);
    const mejor = rutas.filter((m) => activo(m.ruta)).sort((a, b) => b.ruta.length - a.ruta.length)[0];
    const item = (m) =>
      m.ruta && !m.desactivado
        ? h(
            'a',
            {
              href: '#',
              class: ['cx-lateral__item', m === mejor && 'cx-lateral__item--activo'],
              'aria-current': m === mejor ? 'page' : undefined,
              onclick: (e) => {
                e.preventDefault();
                ir(m.ruta);
              }
            },
            m.texto,
            m.nuevo ? h('span', { class: 'cx-lateral__nuevo' }, 'New') : null,
            m.externo ? icono('external', 'cx-icono--chico') : null
          )
        : h('span', { class: 'cx-lateral__item cx-lateral__item--desactivado', title: 'No disponible en este simulador' }, m.texto, m.externo ? icono('external', 'cx-icono--chico') : null);
    reemplazar(
      lateral,
      h(
        'div',
        { class: 'cx-lateral__cabeza' },
        ui.enlace(servicio.titulo ?? servicio.nombre, servicio.inicio ?? servicio.id, { cx, clase: 'cx-lateral__titulo' }),
        h('button', { type: 'button', class: 'cx-lateral__cerrar', 'aria-label': 'Close navigation', title: 'Close navigation', onclick: () => alternarLateral(false) }, icono('angle-left'))
      ),
      h(
        'div',
        { class: 'cx-lateral__lista' },
        menu.map((m) => {
          if (!m.items) return item(m);
          const lista = h('div', { class: 'cx-lateral__grupo-items' }, m.items.map(item));
          const cab = h(
            'button',
            {
              type: 'button',
              class: 'cx-lateral__seccion',
              'aria-expanded': 'true',
              onclick: () => {
                lista.hidden = !lista.hidden;
                cab.setAttribute('aria-expanded', String(!lista.hidden));
                cab.firstChild.replaceWith(icono(lista.hidden ? 'caret-right' : 'caret-down'));
              }
            },
            icono('caret-down'),
            h('span', {}, m.seccion)
          );
          return h('div', { class: 'cx-lateral__grupo' }, cab, lista);
        })
      )
    );
  }

  function alternarLateral(abrir) {
    memoria.lateralAbierto = abrir ?? !memoria.lateralAbierto;
    pintarLateral(servicios.get(cx.servicio));
    pintarFila();
  }

  /* ---------------------------------------------------------- migas, flash, ayuda */

  function pintarFila() {
    const servicio = servicios.get(cx.servicio);
    const conMenu = (servicio?.menu ?? []).length > 0;
    reemplazar(
      fila,
      conMenu && !memoria.lateralAbierto ? h('button', { type: 'button', class: 'cx-fila-migas__menu', 'aria-label': 'Open navigation', title: 'Open navigation', onclick: () => alternarLateral(true) }, icono('menu')) : null,
      !conMenu && cx.servicio === 'inicio' ? h('span', { class: 'cx-fila-migas__menu cx-fila-migas__menu--fijo' }, icono('menu')) : null,
      migasActuales.length ? ui.migas(cx, migasActuales) : h('span'),
      h('button', { type: 'button', class: 'cx-fila-migas__ayuda', 'aria-label': 'Open help panel', title: 'Help panel', onclick: () => (memoria.ayudaAbierta ? cerrarAyuda() : cx.ayuda('simulador')) }, icono('info'))
    );
  }

  const TIPOS_FLASH = { exito: 'status-positive', error: 'status-negative', info: 'status-info', aviso: 'status-warning', progreso: 'spinner' };

  function pintarFlashes() {
    reemplazar(
      flashbar,
      memoria.flashes.map((f) =>
        h(
          'div',
          { class: ['cx-flash', `cx-flash--${f.tipo ?? 'info'}`], role: f.tipo === 'error' ? 'alert' : 'status' },
          icono(TIPOS_FLASH[f.tipo] ?? 'status-info', f.tipo === 'progreso' ? 'cx-gira' : ''),
          h('div', { class: 'cx-flash__cuerpo' }, f.titulo ? h('div', { class: 'cx-flash__titulo' }, f.titulo) : null, f.texto ? h('div', { class: 'cx-flash__texto' }, f.texto) : null),
          f.accion
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'cx-flash__accion',
                  onclick: () => {
                    cx.quitarFlash(f.id);
                    f.accion.alClic();
                  }
                },
                f.accion.texto
              )
            : null,
          h('button', { type: 'button', class: 'cx-flash__cerrar', 'aria-label': 'Dismiss', onclick: () => cx.quitarFlash(f.id) }, icono('close'))
        )
      )
    );
  }

  function cerrarAyuda() {
    memoria.ayudaAbierta = null;
    pintarAyuda();
  }

  function pintarAyuda() {
    const tema = memoria.ayudaAbierta;
    ayuda.hidden = !tema;
    raiz.classList.toggle('cx--con-ayuda', Boolean(tema));
    if (!tema) return reemplazar(ayuda);
    const a = ayudas[tema] ?? { titulo: 'Ayuda', texto: ['Todavía no hay ayuda para este tema.'] };
    reemplazar(
      ayuda,
      h('div', { class: 'cx-ayuda__cabeza' }, h('h2', { class: 'cx-h2' }, a.titulo), h('button', { type: 'button', class: 'cx-modal__cerrar', 'aria-label': 'Close help panel', onclick: cerrarAyuda }, icono('close'))),
      h(
        'div',
        { class: 'cx-ayuda__cuerpo' },
        (a.texto ?? []).map((p) => (Array.isArray(p) ? h('ul', {}, p.map((li) => h('li', {}, ui.textoRico(li)))) : h('p', {}, ui.textoRico(p)))),
        h('p', { class: 'cx-ayuda__nota' }, 'Ayuda del simulador, en español. Los nombres de la consola siguen en inglés, como en AWS.')
      )
    );
    ayuda.querySelector('.cx-modal__cerrar')?.focus();
  }

  /* ---------------------------------------------------------- teclado y reloj */

  const teclas = (e) => {
    if (!raiz.isConnected) return;
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      inputBuscar.focus();
      inputBuscar.select();
    }
  };
  window.addEventListener('keydown', teclas);

  const reloj = setInterval(() => {
    if (!raiz.isConnected) return;
    let cambio = false;
    try {
      cambio = avanzar(estado);
    } catch (e) {
      console.error('avanzar falló', e);
    }
    if (cambio) {
      try {
        alCambiar(estado, { tipo: 'tiempo' });
      } catch (e) {
        console.error('alCambiar falló', e);
      }
    }
    refrescar();
  }, 1000);

  // Por si el estado trae transiciones vencidas (la cuenta se guardó hace rato).
  if (avanzar(estado)) {
    try {
      alCambiar(estado, { tipo: 'tiempo' });
    } catch (e) {
      console.error(e);
    }
  }

  // En pantallas angostas el menú lateral empieza cerrado.
  if ((contenedor.clientWidth || window.innerWidth) < 900) memoria.lateralAbierto = false;

  pintarBarra();
  ir(opciones.ruta ?? 'inicio');

  return {
    irA: (ruta) => ir(ruta),
    get ruta() {
      return memoria.ruta;
    },
    refrescar,
    destruir() {
      clearInterval(reloj);
      window.removeEventListener('keydown', teclas);
      ui.cerrarDesplegable();
      contenedor.replaceChildren();
    }
  };
}
