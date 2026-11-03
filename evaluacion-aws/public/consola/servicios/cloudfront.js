// ---------------------------------------------------------------------------
// AMAZON CLOUDFRONT
//
// Distributions: la lista, Create distribution (asistente de 5 pasos como el de
// 2026: Choose a plan, Get started, Specify origin, Enable security y Review
// and create), el detalle con sus pestañas (General, Security, Origins,
// Behaviors, Error pages, Invalidations, Tags), Edit settings, Create/Edit
// origin, Create/Edit behavior, Create invalidation, Enable/Disable y Delete.
// También Origin access (los OAC) y Policies (las políticas de caché
// administradas, solo lectura).
//
// El modelo vive en modelo/borde.js. Botón propio del simulador: «Open in
// browser», que abre el dominio d123.cloudfront.net en el navegador simulado
// (red.js pide el objeto al origen).
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  CLASES_PRECIO,
  ENDPOINT_S3_WEB,
  PLANES_CLOUDFRONT,
  POLITICAS_CACHE,
  cambiarEstadoDistribucion,
  crearComportamientoCache,
  crearDistribucion,
  crearInvalidacion,
  crearOrigenCloudFront,
  distribucionDe,
  editarComportamientoCache,
  editarDistribucion,
  editarOrigenCloudFront,
  eliminarComportamientoCache,
  eliminarDistribucion,
  eliminarOrigenCloudFront,
  politicaOac
} from '../modelo.js';
import { noExiste } from './comun.js';
import { copiar, tablaEtiquetas } from './sns.js';

const { h } = ui;

const migaCf = { texto: 'CloudFront', ruta: 'cloudfront' };
const migaDists = { texto: 'Distributions', ruta: 'cloudfront/distribuciones' };
const dists = (cx) => cx.estado.cloudfront?.distribuciones ?? [];
const rutaDist = (d, resto = '') => `cloudfront/distribuciones/${d.id}${resto ? `/${resto}` : ''}`;
const buckets = (cx) => cx.estado.buckets ?? [];
const albs = (cx) => (cx.estado.elb?.balanceadores ?? []).filter((b) => b.tipo === 'application');

const TEXTO_VISOR = { 'allow-all': 'HTTP and HTTPS', 'redirect-to-https': 'Redirect HTTP to HTTPS', 'https-only': 'HTTPS only' };
const TEXTO_METODOS = { GET_HEAD: 'GET, HEAD', GET_HEAD_OPTIONS: 'GET, HEAD, OPTIONS', ALL: 'GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE' };
const TEXTO_PROTOCOLO = { 'http-only': 'HTTP only', 'https-only': 'HTTPS only', 'match-viewer': 'Match viewer' };
const TEXTO_TIPO_ORIGEN = { s3: 'S3', 's3-website': 'Custom origin (S3 website endpoint)', elb: 'Elastic Load Balancer', custom: 'Custom origin' };
const TEXTO_HTTP = { http2: 'HTTP/2, HTTP/1.1, HTTP/1.0', http2and3: 'HTTP/3, HTTP/2, HTTP/1.1, HTTP/1.0', 'http1.1': 'HTTP/1.1, HTTP/1.0', http3: 'HTTP/3, HTTP/1.1, HTTP/1.0' };
const planTexto = (v) => PLANES_CLOUDFRONT.find((p) => p.valor === v)?.etiqueta ?? 'Pay as you go';
const claseTexto = (v) => CLASES_PRECIO.find((c) => c.valor === v)?.etiqueta ?? v;

/** El estado de la columna Status (Enabled / Disabled). */
const estadoDist = (d) => (d.habilitada ? ui.estado('exito', 'Enabled') : ui.estado('inactivo', 'Disabled'));
/** La columna Last modified: «Deploying» mientras se despliega. */
const modificadoDist = (d) => (d.estado === 'Deploying' ? ui.estado('pendiente', 'Deploying') : ui.fecha(d.modificado));

/** Botón propio del simulador: abre el dominio de la distribución en el navegador simulado. */
function botonAbrir(cx, d, { variante = 'normal' } = {}) {
  return ui.boton('Open in browser', {
    variante,
    icono: 'external',
    titulo: 'Botón del simulador: abre el dominio de la distribución desde tu casa',
    desactivado: !d,
    alClic: () => {
      if (!d.desplegada) {
        cx.flash({ tipo: 'info', titulo: 'Todavía se está desplegando', texto: 'Tu distribución tarda unos 30 segundos en llegar a todas las ubicaciones de borde. Mientras tanto su dominio todavía no existe. Espera a que «Last modified» muestre una fecha.' });
        return;
      }
      cx.navegador(`https://${d.dominio}`);
    }
  });
}

/* ================================================================ la lista */

function confirmarEstado(cx, d, habilitar) {
  cx.confirmar({
    titulo: habilitar ? 'Enable distribution?' : 'Disable distribution?',
    textoBoton: habilitar ? 'Enable' : 'Disable',
    contenido: habilitar
      ? h('p', {}, `Enable distribution ${d.id}? CloudFront will start serving requests again after the change is deployed.`)
      : [
          h('p', {}, `Disable distribution ${d.id}? After the change is deployed, CloudFront stops responding to requests for the domain ${d.dominio}${d.alias.length ? ` and its alternate domain names` : ''}.`),
          ui.alerta({ tipo: 'info', contenido: 'Para borrar una distribución primero hay que deshabilitarla y esperar a que termine de desplegarse (unos 30 s en el simulador).' })
        ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'CloudFront', accion: 'UpdateDistribution', error: `Failed to ${habilitar ? 'enable' : 'disable'} distribution` }, (e) => cambiarEstadoDistribucion(e, d.id, habilitar));
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Successfully ${habilitar ? 'enabled' : 'disabled'} distribution ${d.id}. The change is being deployed.` });
    }
  });
}

function confirmarBorrado(cx, d, { alTerminar } = {}) {
  if (d.habilitada || d.estado !== 'Deployed') {
    const m = cx.modal({
      titulo: 'Delete distribution?',
      ancho: 'mediano',
      contenido: ui.alerta({
        tipo: 'aviso',
        titulo: 'You can’t delete this distribution yet',
        contenido: d.habilitada ? 'To delete a distribution, first disable it and wait until the change is deployed. (Primero usa Disable y espera a que «Last modified» muestre la fecha.)' : 'The distribution is still deploying. Wait until the change is deployed and try again.'
      }),
      pie: ui.boton('Close', { variante: 'primario', alClic: () => m.cerrar() })
    });
    return;
  }
  cx.confirmar({
    titulo: 'Delete distribution?',
    textoBoton: 'Delete',
    contenido: h('p', {}, `Are you sure you want to delete distribution ${d.id} (${d.dominio})? This action can’t be undone.`),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'CloudFront', accion: 'DeleteDistribution', error: 'Failed to delete distribution' }, (e) => eliminarDistribucion(e, d.id));
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Successfully deleted distribution ${d.id}.` });
      alTerminar?.();
    }
  });
}

function listaDistribuciones(cx) {
  cx.migas([migaCf, { texto: 'Distributions' }]);
  const t = ui.tabla(cx, {
    titulo: 'Distributions',
    info: 'cloudfront',
    filas: () => dists(cx),
    clave: (d) => d.id,
    seleccion: 'unica',
    filtro: 'Search all distributions',
    columnas: [
      { titulo: 'ID', valor: (d) => ui.enlace(d.id, rutaDist(d), { cx }), texto: (d) => d.id },
      { titulo: 'Name', valor: (d) => d.nombre || '-' },
      { titulo: 'Description', valor: (d) => d.descripcion || '-' },
      { titulo: 'Type', valor: () => 'Standard' },
      { titulo: 'Domain name', valor: (d) => ui.copiable(d.dominio), texto: (d) => d.dominio },
      { titulo: 'Alternate domain names', valor: (d) => (d.alias.length ? d.alias.join(', ') : '-') },
      { titulo: 'Origins', valor: (d) => d.origenes.map((o) => o.dominio).join(', ') },
      { titulo: 'Status', valor: (d) => estadoDist(d), texto: (d) => (d.habilitada ? 'Enabled' : 'Disabled') },
      { titulo: 'Last modified', valor: (d) => modificadoDist(d), texto: (d) => (d.estado === 'Deploying' ? 'Deploying' : d.modificado) },
      { titulo: 'Pricing plan', valor: (d) => planTexto(d.plan) }
    ],
    acciones: (sel) => [
      botonAbrir(cx, sel[0]),
      ui.boton(sel[0] && !sel[0].habilitada ? 'Enable' : 'Disable', { desactivado: sel.length !== 1, escribe: true, alClic: () => confirmarEstado(cx, sel[0], !sel[0].habilitada) }),
      ui.boton('Delete', { desactivado: sel.length !== 1, escribe: true, alClic: () => confirmarBorrado(cx, sel[0]) }),
      ui.boton('Create distribution', { variante: 'primario', alClic: () => cx.ir('cloudfront/distribuciones/crear') })
    ],
    vacio: { titulo: 'No distributions', texto: 'You don’t have any distributions.', accion: () => ui.boton('Create distribution', { escribe: true, alClic: () => cx.ir('cloudfront/distribuciones/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

/* ===================================================== crear distribución */

/** El marco de un asistente: los pasos a la izquierda y el contenido a la derecha. */
function asistente(cx, { pasos, paso, titulo, info, descripcion, cuerpo, pie, alElegir }) {
  return h(
    'div',
    { class: 'cx-asis' },
    h(
      'nav',
      { class: 'cx-asis__pasos', 'aria-label': 'Steps' },
      h(
        'ol',
        {},
        pasos.map((p, i) =>
          h(
            'li',
            { class: ['cx-asis__paso', i === paso && 'cx-asis__paso--actual', i > paso && 'cx-asis__paso--futuro', i < paso && alElegir && 'cx-cf-paso--clic'], 'aria-current': i === paso ? 'step' : undefined, onclick: i < paso && alElegir ? () => alElegir(i) : null },
            h('small', {}, `Step ${i + 1}`),
            h('span', {}, p)
          )
        )
      )
    ),
    h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo, info, cx, descripcion }), cuerpo, pie)
  );
}

/** Los valores recomendados de caché según el tipo de origen (Preconfigured distribution settings). */
function cacheRecomendada(tipo) {
  if (tipo === 's3') return { protocoloVisor: 'redirect-to-https', metodos: 'GET_HEAD', politicaCache: 'CachingOptimized', comprimir: true };
  return { protocoloVisor: 'redirect-to-https', metodos: 'ALL', politicaCache: 'UseOriginCacheControlHeaders', comprimir: true };
}

/** El formulario de un origen (lo usan Create distribution, Create origin y Edit origin). */
function origenVacio() {
  return { tipo: 's3', dominio: '', ruta: '', acceso: 'oac', protocolo: 'http-only', puertoHttp: '80', puertoHttps: '443', id: '' };
}

/** El tipo de origen real a partir de lo que eligió el alumno. */
function tipoDeOrigen(f) {
  const d = f.dominio.trim().toLowerCase();
  if (f.tipo === 's3') return d.includes('.s3-website') ? 's3-website' : 's3';
  return f.tipo;
}

/** Si el ALB no tiene listener HTTPS, CloudFront le habla por HTTP (el simulador no tiene certificados). */
function protocoloParaAlb(cx, dominio) {
  const lb = albs(cx).find((b) => b.dns === dominio.trim().toLowerCase());
  return lb && !lb.oyentes?.some((o) => o.protocolo === 'HTTPS') ? 'http-only' : 'https-only';
}

const parametrosOrigen = (cx, f) => {
  const tipo = tipoDeOrigen(f);
  return {
    tipo,
    dominio: f.dominio.trim(),
    ruta: f.ruta.trim(),
    acceso: tipo === 's3' ? f.acceso : undefined,
    protocolo: tipo === 'elb' && f.personalizar !== true ? protocoloParaAlb(cx, f.dominio) : f.protocolo,
    puertoHttp: f.puertoHttp,
    puertoHttps: f.puertoHttps,
    id: f.id.trim() || undefined
  };
};

/** El selector «Origin» con los buckets (y su endpoint de sitio web) o los ALB de la cuenta. */
function controlOrigen(cx, f, repintar) {
  if (f.tipo === 's3') {
    const opciones = buckets(cx).flatMap((b) => [
      { valor: `${b.nombre}.s3.us-east-1.amazonaws.com`, etiqueta: `${b.nombre}.s3.us-east-1.amazonaws.com`, grupo: 'Amazon S3' },
      ...(b.sitioWeb ? [{ valor: `${b.nombre}.${ENDPOINT_S3_WEB}`, etiqueta: `${b.nombre}.${ENDPOINT_S3_WEB}`, descripcion: 'S3 static website endpoint', grupo: 'S3 static website endpoints' }] : [])
    ]);
    return ui.selector({
      placeholder: 'Choose an S3 bucket',
      filtrar: true,
      valor: f.dominio || null,
      opciones,
      vacio: 'No S3 buckets. Create a bucket in Amazon S3 first.',
      opcionLibre: (texto) => ({ valor: texto, etiqueta: texto }),
      etiquetaAccesible: 'S3 origin',
      alCambiar: (v) => {
        f.dominio = v;
        if (!f.idTocado) f.id = '';
        repintar();
      }
    });
  }
  if (f.tipo === 'elb') {
    return ui.selector({
      placeholder: 'Choose a load balancer',
      filtrar: true,
      valor: f.dominio || null,
      opciones: albs(cx).map((b) => ({ valor: b.dns, etiqueta: b.dns, descripcion: `${b.nombre} · ${b.esquema} · ${b.estado}` })),
      vacio: 'No Application Load Balancers. Create one in EC2 → Load Balancers first.',
      etiquetaAccesible: 'Elastic Load Balancer origin',
      alCambiar: (v) => {
        f.dominio = v;
        f.protocolo = protocoloParaAlb(cx, v);
        repintar();
      }
    });
  }
  return ui.entrada({ valor: f.dominio, placeholder: 'example.com', etiquetaAccesible: 'Origin domain', alCambiar: (v) => (f.dominio = v) });
}

/** Los campos de un origen: dominio, ruta, acceso a S3 y protocolo. `editar`: el origen que se edita (o null). */
function camposOrigen(cx, f, repintar, { editar = null, conNombre = false } = {}) {
  const tipo = tipoDeOrigen(f);
  const bucketWeb = tipo === 's3' ? buckets(cx).find((b) => `${b.nombre}.s3.us-east-1.amazonaws.com` === f.dominio && b.sitioWeb) : null;
  const errorOrigen = f.intento && !f.dominio.trim() ? 'Choose or enter an origin.' : null;
  return [
    editar
      ? ui.pares([{ etiqueta: 'Origin domain', valor: editar.dominio }, { etiqueta: 'Origin type', valor: TEXTO_TIPO_ORIGEN[editar.tipo] }], { columnas: 2 })
      : [
          ui.campo({
            etiqueta: 'Origin type',
            info: 'cf-origen',
            cx,
            control: ui.tarjetas({
              columnas: 3,
              valor: f.tipo,
              alCambiar: (v) => {
                f.tipo = v;
                f.dominio = '';
                f.protocolo = v === 'elb' ? 'https-only' : 'match-viewer';
                repintar();
              },
              opciones: [
                { valor: 's3', etiqueta: 'Amazon S3', descripcion: 'Static website, file downloads, or video streaming from an S3 bucket.' },
                { valor: 'elb', etiqueta: 'Elastic Load Balancer', descripcion: 'An Application Load Balancer in front of your EC2 instances.' },
                { valor: 'apigw', etiqueta: 'API Gateway', descripcion: 'Disponible en AWS; no en este simulador.', desactivado: true },
                { valor: 'mediapackage', etiqueta: 'Elemental MediaPackage', descripcion: 'Video streaming origin.', desactivado: true },
                { valor: 'vpc', etiqueta: 'VPC origin', descripcion: 'Origins in private subnets.', desactivado: true },
                { valor: 'custom', etiqueta: 'Other', descripcion: 'Any web server with a public domain name.' }
              ]
            })
          }),
          ui.campo({
            etiqueta: f.tipo === 's3' ? 'S3 origin' : f.tipo === 'elb' ? 'Elastic Load Balancer origin' : 'Origin domain',
            descripcion: f.tipo === 's3' ? 'Choose an S3 bucket.' : f.tipo === 'elb' ? 'Choose a load balancer.' : 'Enter the domain name of your web server.',
            control: controlOrigen(cx, f, repintar),
            error: errorOrigen
          }),
          bucketWeb
            ? ui.alerta({
                tipo: 'info',
                titulo: 'This S3 bucket has static web hosting enabled.',
                contenido: [
                  h('p', {}, 'If you plan to use this distribution as a website, we recommend using the S3 website endpoint rather than the bucket endpoint.'),
                  ui.boton('Use website endpoint', { alClic: () => ((f.dominio = `${bucketWeb.nombre}.${ENDPOINT_S3_WEB}`), repintar()) })
                ]
              })
            : null
        ],
    ui.campo({
      etiqueta: 'Origin path',
      opcional: true,
      descripcion: 'Enter a URL path to append to the origin domain name for origin requests.',
      control: ui.entrada({ valor: f.ruta, placeholder: '/folder', etiquetaAccesible: 'Origin path', alCambiar: (v) => (f.ruta = v) })
    }),
    conNombre
      ? ui.campo({
          etiqueta: 'Name',
          descripcion: 'Enter a name for this origin.',
          control: ui.entrada({ valor: f.id || f.dominio, desactivado: Boolean(editar), etiquetaAccesible: 'Origin name', alCambiar: (v) => ((f.id = v), (f.idTocado = true)) })
        })
      : null,
    tipo === 's3'
      ? ui.campo({
          etiqueta: 'Origin access',
          info: 'cf-oac',
          cx,
          control: ui.tarjetas({
            columnas: 2,
            valor: f.acceso,
            alCambiar: (v) => ((f.acceso = v), repintar()),
            opciones: [
              { valor: 'publico', etiqueta: 'Public', descripcion: 'Bucket must allow public access.' },
              { valor: 'oac', etiqueta: 'Origin access control settings (recommended)', descripcion: 'Bucket can restrict access to only CloudFront.' }
            ]
          })
        })
      : null,
    tipo === 's3' && f.acceso === 'oac'
      ? ui.alerta({ tipo: 'info', contenido: 'CloudFront crea un Origin access control (OAC) y agrega a la política del bucket un permiso para que solo esta distribución lea los archivos. Así el bucket se queda privado (Block all public access encendido).' })
      : null,
    tipo === 's3-website'
      ? ui.alerta({ tipo: 'info', contenido: 'Es el endpoint de sitio web del bucket: solo habla HTTP y el bucket debe ser público (política con s3:GetObject para "*" y sin Block public access). No usa OAC.' })
      : null,
    tipo === 'elb' || tipo === 'custom'
      ? [
          ui.campo({
            etiqueta: 'Protocol',
            control: ui.radios({
              horizontal: true,
              valor: f.protocolo,
              alCambiar: (v) => ((f.protocolo = v), (f.personalizar = true), repintar()),
              opciones: [
                { valor: 'http-only', etiqueta: 'HTTP only' },
                { valor: 'https-only', etiqueta: 'HTTPS only' },
                { valor: 'match-viewer', etiqueta: 'Match viewer' }
              ]
            })
          }),
          h(
            'div',
            { class: 'cx-fila-campos cx-cf-arriba' },
            ui.campo({ etiqueta: 'HTTP port', control: ui.entrada({ valor: f.puertoHttp, tipo: 'number', etiquetaAccesible: 'HTTP port', alCambiar: (v) => (f.puertoHttp = v) }), restriccion: 'Port must be 80, 443, or between 1024 and 65535.' }),
            ui.campo({ etiqueta: 'HTTPS port', control: ui.entrada({ valor: f.puertoHttps, tipo: 'number', etiquetaAccesible: 'HTTPS port', alCambiar: (v) => (f.puertoHttps = v) }) })
          ),
          tipo === 'elb' && f.protocolo !== 'http-only'
            ? ui.alerta({ tipo: 'aviso', contenido: 'En el simulador los balanceadores no tienen certificado (solo listener HTTP:80). Si CloudFront le habla por HTTPS, la página dará 504. Elige HTTP only.' })
            : null
        ]
      : null
  ];
}

/** Los campos de un comportamiento de caché. */
function camposCache(cx, c, repintar) {
  return [
    ui.campo({
      etiqueta: 'Viewer protocol policy',
      info: 'cf-comportamiento',
      cx,
      control: ui.radios({
        valor: c.protocoloVisor,
        alCambiar: (v) => (c.protocoloVisor = v),
        opciones: Object.entries(TEXTO_VISOR).map(([valor, etiqueta]) => ({ valor, etiqueta }))
      })
    }),
    ui.campo({
      etiqueta: 'Allowed HTTP methods',
      control: ui.radios({
        valor: c.metodos,
        alCambiar: (v) => (c.metodos = v),
        opciones: Object.entries(TEXTO_METODOS).map(([valor, etiqueta]) => ({ valor, etiqueta }))
      })
    }),
    ui.campo({
      etiqueta: 'Cache policy',
      descripcion: 'Choose an existing cache policy.',
      control: ui.selector({
        valor: c.politicaCache,
        opciones: POLITICAS_CACHE.map((p) => ({ valor: p.nombre, etiqueta: p.nombre, descripcion: p.descripcion, etiquetaDerecha: 'Managed' })),
        etiquetaAccesible: 'Cache policy',
        alCambiar: (v) => ((c.politicaCache = v), repintar())
      })
    }),
    ui.campo({
      etiqueta: 'Compress objects automatically',
      control: ui.radios({ horizontal: true, valor: c.comprimir ? 'si' : 'no', alCambiar: (v) => (c.comprimir = v === 'si'), opciones: [{ valor: 'no', etiqueta: 'No' }, { valor: 'si', etiqueta: 'Yes' }] })
    })
  ];
}

function crearDistribucionPagina(cx) {
  cx.migas([migaCf, migaDists, { texto: 'Create distribution' }]);
  const f = {
    paso: 0,
    plan: 'payg',
    nombre: '',
    descripcion: '',
    dominio: '',
    origen: origenVacio(),
    recomendado: true,
    cache: cacheRecomendada('s3'),
    objetoRaiz: 'index.html',
    clasePrecio: 'PriceClass_All',
    waf: false,
    etiquetas: [],
    intento: false
  };
  const PASOS = ['Choose a plan', 'Get started', 'Specify origin', 'Enable security', 'Review and create'];
  const repintar = () => vista.repintar();
  const ir = (n) => {
    f.paso = n;
    f.intento = false;
    repintar();
    vista.scrollIntoView?.({ block: 'start' });
  };

  const pie = (siguiente, textoSiguiente = 'Next') =>
    h(
      'div',
      { class: 'cx-pie-form' },
      ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir('cloudfront/distribuciones') }),
      f.paso > 0 ? ui.boton('Previous', { alClic: () => ir(f.paso - 1) }) : null,
      ui.boton(textoSiguiente, { variante: 'primario', alClic: siguiente })
    );

  function pasoPlan() {
    return asistente(cx, {
      pasos: PASOS,
      paso: 0,
      alElegir: ir,
      titulo: 'Choose a plan',
      info: 'cf-plan',
      descripcion: 'Choose a flat-rate plan that bundles CloudFront with security features, or pay as you go.',
      cuerpo: ui.contenedor({
        titulo: 'Pricing plan',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.tarjetas({
            columnas: 3,
            valor: f.plan,
            alCambiar: (v) => ((f.plan = v), repintar()),
            opciones: PLANES_CLOUDFRONT.map((p) => ({ valor: p.valor, etiqueta: `${p.etiqueta} · ${p.precio}`, descripcion: p.descripcion }))
          }),
          f.plan !== 'payg' ? ui.alerta({ tipo: 'info', contenido: 'Los planes de tarifa fija (flat-rate) incluyen AWS WAF y protección DDoS sin cobros por uso. En el simulador la protección se activa sola con estos planes. Para el examen CLF-C02 lo importante es «Pay as you go»: pagas por los datos que salen y por las peticiones.' }) : null
        )
      }),
      pie: pie(() => ir(1))
    });
  }

  function pasoInicio() {
    const errorNombre = f.intento && !f.nombre.trim() ? 'Distribution name is required.' : null;
    return asistente(cx, {
      pasos: PASOS,
      paso: 1,
      alElegir: ir,
      titulo: 'Get started',
      info: 'cloudfront',
      cuerpo: [
        ui.contenedor({
          titulo: 'Distribution options',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({
              etiqueta: 'Distribution name',
              descripcion: 'The name appears as the value of the Name tag. You can change it later.',
              control: ui.entrada({ valor: f.nombre, placeholder: 'my-website', etiquetaAccesible: 'Distribution name', alCambiar: (v) => (f.nombre = v) }),
              restriccion: 'Up to 128 characters.',
              error: errorNombre
            }),
            ui.campo({ etiqueta: 'Description', opcional: true, control: ui.entrada({ valor: f.descripcion, etiquetaAccesible: 'Description', alCambiar: (v) => (f.descripcion = v) }) }),
            ui.campo({
              etiqueta: 'Distribution type',
              control: ui.tarjetas({
                columnas: 2,
                valor: 'single',
                opciones: [
                  { valor: 'single', etiqueta: 'Single website or app', descripcion: 'Create a standard distribution for one website or application.' },
                  { valor: 'multi', etiqueta: 'Multi-tenant architecture', descripcion: 'Create a template for many distribution tenants (SaaS).', desactivado: true }
                ]
              })
            })
          )
        }),
        ui.contenedor({
          titulo: 'Domain - optional',
          info: 'cf-cname',
          cx,
          descripcion: 'Use your own domain name (for example www.example.com) instead of the CloudFront domain.',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({
              etiqueta: 'Domain',
              opcional: true,
              control: ui.entrada({ valor: f.dominio, placeholder: 'www.example.com', etiquetaAccesible: 'Domain', alCambiar: (v) => (f.dominio = v) }),
              descripcion: 'It is added as an alternate domain name (CNAME) of the distribution.'
            }),
            ui.alerta({ tipo: 'info', contenido: 'En el simulador no hace falta certificado de ACM. Después crea tú el registro en Route 53: Create record → Alias → «Alias to CloudFront distribution».' })
          )
        }),
        ui.contenedor({ titulo: 'Tags - optional', plegable: true, abierto: false, cuerpo: ui.editorEtiquetas({ filas: f.etiquetas }) })
      ],
      pie: pie(() => {
        f.intento = true;
        if (!f.nombre.trim()) return repintar();
        ir(2);
      })
    });
  }

  function pasoOrigen() {
    const o = f.origen;
    o.intento = f.intento;
    const tipo = tipoDeOrigen(o);
    const recomendada = cacheRecomendada(tipo === 's3' ? 's3' : 'otro');
    return asistente(cx, {
      pasos: PASOS,
      paso: 2,
      alElegir: ir,
      titulo: 'Specify origin',
      info: 'cf-origen',
      descripcion: 'An origin is where CloudFront gets your content from, such as an S3 bucket or a load balancer.',
      cuerpo: [
        ui.contenedor({ titulo: 'Origin', cuerpo: h('div', { class: 'cx-form' }, camposOrigen(cx, o, repintar)) }),
        ui.contenedor({
          titulo: 'Settings',
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.tarjetas({
              columnas: 2,
              valor: f.recomendado ? 'si' : 'no',
              alCambiar: (v) => {
                // Al pasar a «Customize» se parte de lo recomendado para este tipo de origen.
                const antes = f.recomendado;
                f.recomendado = v === 'si';
                if (f.recomendado || antes) f.cache = { ...recomendada };
                repintar();
              },
              opciones: [
                { valor: 'si', etiqueta: 'Use recommended origin settings', descripcion: 'Use the recommended cache and origin settings for your origin type.' },
                { valor: 'no', etiqueta: 'Customize origin settings', descripcion: 'Customize the cache and origin settings.' }
              ]
            }),
            f.recomendado
              ? ui.pares(
                  [
                    { etiqueta: 'Viewer protocol policy', valor: TEXTO_VISOR[recomendada.protocoloVisor] },
                    { etiqueta: 'Allowed HTTP methods', valor: TEXTO_METODOS[recomendada.metodos] },
                    { etiqueta: 'Cache policy', valor: recomendada.politicaCache },
                    { etiqueta: 'Compress objects automatically', valor: 'Yes' }
                  ],
                  { columnas: 2 }
                )
              : [
                  camposCache(cx, f.cache, repintar),
                  ui.campo({
                    etiqueta: 'Price class',
                    info: 'cf-clase-precio',
                    cx,
                    descripcion: f.plan === 'payg' ? 'Choose the edge locations that CloudFront uses.' : 'Flat-rate plans always use all edge locations.',
                    control: ui.radios({ valor: f.plan === 'payg' ? f.clasePrecio : 'PriceClass_All', alCambiar: (v) => (f.clasePrecio = v), opciones: CLASES_PRECIO.map((c) => ({ ...c, desactivado: f.plan !== 'payg' && c.valor !== 'PriceClass_All' })) })
                  })
                ],
            ui.campo({
              etiqueta: 'Default root object',
              opcional: true,
              info: 'cf-objeto-raiz',
              cx,
              descripcion: 'The object (file name) to return when a viewer requests the root URL (/) instead of a specific object.',
              control: ui.entrada({ valor: f.objetoRaiz, placeholder: 'index.html', etiquetaAccesible: 'Default root object', alCambiar: (v) => (f.objetoRaiz = v) })
            })
          )
        })
      ],
      pie: pie(() => {
        f.intento = true;
        if (!o.dominio.trim()) return repintar();
        if (f.recomendado) f.cache = { ...recomendada };
        ir(3);
      })
    });
  }

  function pasoSeguridad() {
    const fija = f.plan !== 'payg';
    return asistente(cx, {
      pasos: PASOS,
      paso: 3,
      alElegir: ir,
      titulo: 'Enable security',
      info: 'cf-waf',
      cuerpo: ui.contenedor({
        titulo: 'Web Application Firewall (WAF)',
        descripcion: 'Protect your website from common web threats such as SQL injection, cross-site scripting, and bots.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.tarjetas({
            columnas: 2,
            valor: fija || f.waf ? 'si' : 'no',
            alCambiar: (v) => ((f.waf = v === 'si'), repintar()),
            opciones: [
              { valor: 'si', etiqueta: 'Enable security protections', descripcion: fija ? 'Included in your flat-rate plan.' : 'Monthly cost estimate: about $14.00/month plus $0.60 per million requests.' },
              { valor: 'no', etiqueta: 'Do not enable security protections', descripcion: 'You can enable AWS WAF later in the Security tab.', desactivado: fija }
            ]
          }),
          ui.alerta({ tipo: 'info', contenido: 'En el simulador solo se guarda tu elección: se crea una web ACL «CreatedByCloudFront-…», pero no filtra tráfico.' })
        )
      }),
      pie: pie(() => ir(4))
    });
  }

  function pasoRevision() {
    const o = f.origen;
    const tipo = tipoDeOrigen(o);
    const bloque = (i, titulo, pares) => ui.contenedor({ titulo: `Step ${i + 1}: ${titulo}`, acciones: ui.boton('Edit', { alClic: () => ir(i) }), cuerpo: ui.pares(pares, { columnas: 3 }) });
    return asistente(cx, {
      pasos: PASOS,
      paso: 4,
      alElegir: ir,
      titulo: 'Review and create',
      cuerpo: [
        bloque(0, 'Choose a plan', [{ etiqueta: 'Pricing plan', valor: planTexto(f.plan) }]),
        bloque(1, 'Get started', [
          { etiqueta: 'Distribution name', valor: f.nombre.trim() },
          { etiqueta: 'Description', valor: f.descripcion.trim() || '-' },
          { etiqueta: 'Alternate domain names', valor: f.dominio.trim() || '-' }
        ]),
        bloque(2, 'Specify origin', [
          { etiqueta: 'Origin', valor: o.dominio.trim() },
          { etiqueta: 'Origin type', valor: TEXTO_TIPO_ORIGEN[tipo] },
          { etiqueta: 'Origin path', valor: o.ruta.trim() || '-' },
          ...(tipo === 's3' ? [{ etiqueta: 'Origin access', valor: o.acceso === 'oac' ? 'Origin access control (OAC)' : 'Public' }] : []),
          ...(tipo === 'elb' || tipo === 'custom' ? [{ etiqueta: 'Protocol', valor: TEXTO_PROTOCOLO[parametrosOrigen(cx, o).protocolo] }] : []),
          { etiqueta: 'Viewer protocol policy', valor: TEXTO_VISOR[f.cache.protocoloVisor] },
          { etiqueta: 'Cache policy', valor: f.cache.politicaCache },
          { etiqueta: 'Default root object', valor: f.objetoRaiz.trim() || '-' },
          { etiqueta: 'Price class', valor: claseTexto(f.plan === 'payg' ? f.clasePrecio : 'PriceClass_All') }
        ]),
        bloque(3, 'Enable security', [{ etiqueta: 'Web Application Firewall (WAF)', valor: f.plan !== 'payg' || f.waf ? 'Enabled' : 'Not enabled' }])
      ],
      pie: pie(crear, 'Create distribution')
    });
  }

  function crear() {
    const p = {
      nombre: f.nombre.trim(),
      descripcion: f.descripcion.trim(),
      plan: f.plan,
      origen: parametrosOrigen(cx, f.origen),
      comportamiento: { ...f.cache },
      waf: f.plan !== 'payg' || f.waf,
      clasePrecio: f.clasePrecio,
      objetoRaiz: f.objetoRaiz.trim(),
      alias: f.dominio.trim() ? [f.dominio.trim()] : [],
      etiquetas: f.etiquetas
    };
    const r = cx.hacer({ servicio: 'CloudFront', accion: 'CreateDistribution', error: 'Failed to create distribution' }, (e) => crearDistribucion(e, p));
    if (r.ok) {
      const d = r.valor;
      const oac = d.origenes[0].oacId;
      cx.flash({
        tipo: 'exito',
        titulo: `Successfully created new distribution ${d.id}.`,
        texto: oac ? `We updated the S3 bucket policy of ${d.origenes[0].recurso} so that only this distribution (OAC) can read your files. The distribution is deploying (about 30 seconds in the simulator).` : 'The distribution is deploying (about 30 seconds in the simulator).'
      });
      cx.ir(rutaDist(d));
    }
  }

  function pintar() {
    return [pasoPlan, pasoInicio, pasoOrigen, pasoSeguridad, pasoRevision][f.paso]();
  }
  const vista = ui.region(() => pintar());
  return h('div', { class: 'cx-pagina' }, vista);
}

/* ================================================================ detalle */

function detalleDistribucion(cx, { id }) {
  cx.migas([migaCf, migaDists, { texto: id }]);
  if (!distribucionDe(cx.estado, id)) return noExiste(cx, 'Distribution', id, 'cloudfront/distribuciones');
  const st = { pestana: cx.memoria.cfPestana ?? 'general' };
  cx.memoria.cfPestana = null;
  return cx.vivo(() => {
    const d = distribucionDe(cx.estado, id);
    if (!d) return noExiste(cx, 'Distribution', id, 'cloudfront/distribuciones');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: d.id,
        info: 'cloudfront',
        cx,
        acciones: [
          ui.boton(d.habilitada ? 'Disable' : 'Enable', { escribe: true, alClic: () => confirmarEstado(cx, d, !d.habilitada) }),
          ui.boton('Delete', { escribe: true, alClic: () => confirmarBorrado(cx, d, { alTerminar: () => cx.ir('cloudfront/distribuciones') }) }),
          botonAbrir(cx, d, { variante: 'primario' })
        ]
      }),
      d.estado === 'Deploying'
        ? ui.alerta({ tipo: 'info', titulo: 'Deploying', contenido: `Los cambios se están propagando a las ubicaciones de borde. ${d.desplegada ? 'Mientras tanto, la distribución sigue sirviendo con la configuración anterior.' : 'El dominio todavía no responde: espera unos segundos.'}` })
        : null,
      ui.pestanas({
        activa: st.pestana,
        alCambiar: (p) => (st.pestana = p),
        pestanas: [
          { id: 'general', texto: 'General', contenido: () => pestanaGeneral(cx, d) },
          { id: 'seguridad', texto: 'Security', contenido: () => pestanaSeguridad(cx, d) },
          { id: 'origenes', texto: 'Origins', contenido: () => pestanaOrigenes(cx, d) },
          { id: 'comportamientos', texto: 'Behaviors', contenido: () => pestanaComportamientos(cx, d) },
          { id: 'errores', texto: 'Error pages', contenido: () => pestanaErrores(cx) },
          { id: 'invalidaciones', texto: 'Invalidations', contenido: () => pestanaInvalidaciones(cx, d) },
          { id: 'etiquetas', texto: 'Tags', contenido: () => tablaEtiquetas(cx, d.etiquetas) },
          { id: 'logging', texto: 'Logging', contenido: () => ui.noDisponible('Logging', 'Los registros estándar (a S3 o CloudWatch Logs) no están en este simulador.') }
        ]
      })
    );
  });
}

function pestanaGeneral(cx, d) {
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({
      titulo: 'Details',
      cuerpo: ui.pares(
        [
          { etiqueta: 'Distribution domain name', valor: ui.copiable(d.dominio) },
          { etiqueta: 'ARN', valor: ui.copiable(d.arn) },
          { etiqueta: 'Last modified', valor: modificadoDist(d) }
        ],
        { columnas: 3 }
      )
    }),
    ui.contenedor({
      titulo: 'Settings',
      acciones: ui.boton('Edit', { escribe: true, alClic: () => cx.ir(rutaDist(d, 'editar')) }),
      cuerpo: ui.pares(
        [
          { etiqueta: 'Name', valor: d.nombre },
          { etiqueta: 'Description', valor: d.descripcion || '-' },
          { etiqueta: 'Pricing plan', valor: planTexto(d.plan), info: 'cf-plan' },
          { etiqueta: 'Price class', valor: claseTexto(d.clasePrecio), info: 'cf-clase-precio' },
          { etiqueta: 'Supported HTTP versions', valor: TEXTO_HTTP[d.versionesHttp] },
          { etiqueta: 'Alternate domain names', valor: d.alias.length ? h('div', {}, d.alias.map((a) => h('div', {}, a))) : '-', info: 'cf-cname' },
          { etiqueta: 'Default root object', valor: d.objetoRaiz || '-', info: 'cf-objeto-raiz' },
          { etiqueta: 'IPv6', valor: d.ipv6 ? 'On' : 'Off' },
          { etiqueta: 'Standard logging', valor: 'Off' },
          { etiqueta: 'Custom SSL certificate', valor: '-' },
          { etiqueta: 'Status', valor: estadoDist(d) }
        ],
        { columnas: 3, cx }
      )
    })
  );
}

function pestanaSeguridad(cx, d) {
  const fija = d.plan !== 'payg';
  return ui.contenedor({
    titulo: 'Web Application Firewall (WAF)',
    info: 'cf-waf',
    cx,
    acciones: ui.boton(d.waf ? 'Disable AWS WAF protections' : 'Enable AWS WAF protections', {
      escribe: true,
      desactivado: fija && Boolean(d.waf),
      alClic: () => {
        const r = cx.hacer({ servicio: 'CloudFront', accion: 'UpdateDistribution', error: 'Failed to update security protections' }, (e) => editarDistribucion(e, d.id, { waf: !d.waf }));
        if (r.ok) cx.flash({ tipo: 'exito', texto: `Security protections ${r.valor.waf ? 'enabled' : 'disabled'} for distribution ${d.id}.` });
      }
    }),
    cuerpo: ui.pares(
      [
        { etiqueta: 'Status', valor: d.waf ? ui.estado('exito', 'Enabled') : ui.estado('inactivo', 'Not enabled') },
        { etiqueta: 'Web ACL', valor: d.waf?.webAcl ?? '-' },
        { etiqueta: 'Pricing plan', valor: fija ? `${planTexto(d.plan)} (includes AWS WAF)` : 'Pay as you go' }
      ],
      { columnas: 3 }
    )
  });
}

function pestanaOrigenes(cx, d) {
  const t = ui.tabla(cx, {
    titulo: 'Origins',
    variante: 'contenedor',
    info: 'cf-origen',
    filas: () => distribucionDe(cx.estado, d.id)?.origenes ?? [],
    clave: (o) => o.id,
    seleccion: 'unica',
    filtro: 'Filter origins',
    columnas: [
      { titulo: 'Origin name', valor: (o) => o.id },
      { titulo: 'Origin domain', valor: (o) => o.dominio },
      { titulo: 'Origin path', valor: (o) => o.ruta || '-' },
      { titulo: 'Origin type', valor: (o) => TEXTO_TIPO_ORIGEN[o.tipo] },
      { titulo: 'Origin Shield region', valor: () => '-' },
      { titulo: 'Origin access', valor: (o) => (o.oacId ? (cx.estado.cloudfront.oacs.find((x) => x.id === o.oacId)?.nombre ?? o.oacId) : '-') }
    ],
    acciones: (sel) => [
      ui.boton('Edit', { desactivado: sel.length !== 1, escribe: true, alClic: () => cx.ir(rutaDist(d, `origenes/${encodeURIComponent(sel[0].id)}/editar`)) }),
      ui.boton('Delete', {
        desactivado: sel.length !== 1,
        escribe: true,
        alClic: () =>
          cx.confirmar({
            titulo: 'Delete origin?',
            textoBoton: 'Delete',
            contenido: h('p', {}, `Delete origin ${sel[0].id}?`),
            aceptar: () => {
              const r = cx.hacer({ servicio: 'CloudFront', accion: 'UpdateDistribution', error: 'Failed to delete origin' }, (e) => eliminarOrigenCloudFront(e, d.id, sel[0].id));
              if (!r.ok) return false;
              cx.flash({ tipo: 'exito', texto: `Successfully deleted origin ${sel[0].id}.` });
            }
          })
      }),
      ui.boton('Create origin', { variante: 'primario', alClic: () => cx.ir(rutaDist(d, 'origenes/crear')) })
    ]
  });
  const oac = d.origenes.find((o) => o.oacId);
  return h(
    'div',
    { class: 'cx-pagina' },
    t,
    oac
      ? ui.contenedor({
          titulo: 'S3 bucket policy (OAC)',
          plegable: true,
          abierto: false,
          descripcion: `The policy that allows this distribution to read ${oac.recurso}. It was added to the bucket when you created the origin.`,
          acciones: ui.boton('Copy policy', { icono: 'copy', alClic: () => copiar(cx, politicaOac(cx.estado, d, oac.recurso), 'Policy') }),
          cuerpo: h('pre', { class: 'cx-log' }, politicaOac(cx.estado, d, oac.recurso))
        })
      : null
  );
}

function pestanaComportamientos(cx, d) {
  return ui.tabla(cx, {
    titulo: 'Behaviors',
    variante: 'contenedor',
    info: 'cf-comportamiento',
    filas: () => (distribucionDe(cx.estado, d.id)?.comportamientos ?? []).map((c, i) => ({ ...c, i })),
    clave: (c) => c.patron,
    seleccion: 'unica',
    filtro: false,
    columnas: [
      { titulo: 'Precedence', valor: (c) => String(c.i) },
      { titulo: 'Path pattern', valor: (c) => (c.patron === '*' ? 'Default (*)' : c.patron) },
      { titulo: 'Origin or origin group', valor: (c) => c.origenId },
      { titulo: 'Viewer protocol policy', valor: (c) => TEXTO_VISOR[c.protocoloVisor] },
      { titulo: 'Cache policy name', valor: (c) => c.politicaCache },
      { titulo: 'Origin request policy name', valor: () => '-' },
      { titulo: 'Response headers policy name', valor: () => '-' }
    ],
    acciones: (sel) => [
      ui.boton('Edit', { desactivado: sel.length !== 1, escribe: true, alClic: () => cx.ir(rutaDist(d, `comportamientos/${sel[0].i}/editar`)) }),
      ui.boton('Delete', {
        desactivado: sel.length !== 1 || sel[0]?.patron === '*',
        escribe: true,
        alClic: () =>
          cx.confirmar({
            titulo: 'Delete behavior?',
            textoBoton: 'Delete',
            contenido: h('p', {}, `Delete behavior ${sel[0].patron}?`),
            aceptar: () => {
              const r = cx.hacer({ servicio: 'CloudFront', accion: 'UpdateDistribution', error: 'Failed to delete behavior' }, (e) => eliminarComportamientoCache(e, d.id, sel[0].patron));
              if (!r.ok) return false;
              cx.flash({ tipo: 'exito', texto: `Successfully deleted behavior ${sel[0].patron}.` });
            }
          })
      }),
      ui.boton('Create behavior', { variante: 'primario', alClic: () => cx.ir(rutaDist(d, 'comportamientos/crear')) })
    ]
  });
}

function pestanaErrores(cx) {
  return ui.tabla(cx, {
    titulo: 'Custom error responses',
    variante: 'contenedor',
    filas: () => [],
    clave: (x) => x,
    filtro: false,
    columnas: [
      { titulo: 'HTTP error code', valor: () => '' },
      { titulo: 'Error caching minimum TTL', valor: () => '' },
      { titulo: 'Response page path', valor: () => '' },
      { titulo: 'HTTP response code', valor: () => '' }
    ],
    acciones: () => [ui.boton('Create custom error response', { desactivado: true, titulo: 'No disponible en el simulador' })],
    vacio: { titulo: 'No custom error responses', texto: 'Las respuestas de error personalizadas no están en este simulador.' }
  });
}

function pestanaInvalidaciones(cx, d) {
  return ui.tabla(cx, {
    titulo: 'Invalidations',
    variante: 'contenedor',
    info: 'cf-invalidacion',
    filas: () => distribucionDe(cx.estado, d.id)?.invalidaciones ?? [],
    clave: (x) => x.id,
    seleccion: 'unica',
    filtro: 'Search invalidations',
    columnas: [
      { titulo: 'Invalidation ID', valor: (x) => ui.enlace(x.id, rutaDist(d, `invalidaciones/${x.id}`), { cx }), texto: (x) => x.id },
      { titulo: 'Status', valor: (x) => (x.estado === 'Completed' ? ui.estado('exito', 'Completed') : ui.estado('pendiente', 'In progress')), texto: (x) => x.estado },
      { titulo: 'Date created', valor: (x) => ui.fecha(x.creado), texto: (x) => x.creado }
    ],
    acciones: (sel) => [
      ui.boton('View details', { desactivado: sel.length !== 1, alClic: () => cx.ir(rutaDist(d, `invalidaciones/${sel[0].id}`)) }),
      ui.boton('Copy to new', { desactivado: sel.length !== 1, escribe: true, alClic: () => ((cx.memoria.cfRutas = sel[0].rutas.join('\n')), cx.ir(rutaDist(d, 'invalidaciones/crear'))) }),
      ui.boton('Create invalidation', { variante: 'primario', alClic: () => cx.ir(rutaDist(d, 'invalidaciones/crear')) })
    ],
    vacio: { titulo: 'No invalidations', texto: 'Use an invalidation to remove files from CloudFront edge caches before they expire.' }
  });
}

/* ========================================================= editar ajustes */

function editarAjustesPagina(cx, { id }) {
  const d = distribucionDe(cx.estado, id);
  cx.migas([migaCf, migaDists, { texto: id, ruta: d ? rutaDist(d) : null }, { texto: 'Edit settings' }]);
  if (!d) return noExiste(cx, 'Distribution', id, 'cloudfront/distribuciones');
  const f = { nombre: d.nombre, descripcion: d.descripcion, clasePrecio: d.clasePrecio, alias: d.alias.map((a) => ({ valor: a })), objetoRaiz: d.objetoRaiz, versionesHttp: d.versionesHttp, ipv6: d.ipv6 };
  const forma = ui.region(() =>
    ui.contenedor({
      titulo: 'Settings',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Name', control: ui.entrada({ valor: f.nombre, etiquetaAccesible: 'Name', alCambiar: (v) => (f.nombre = v) }) }),
        ui.campo({
          etiqueta: 'Price class',
          info: 'cf-clase-precio',
          cx,
          descripcion: d.plan === 'payg' ? 'Choose the price class associated with the maximum price that you want to pay.' : 'Flat-rate plans always use all edge locations.',
          control: ui.radios({ valor: f.clasePrecio, alCambiar: (v) => (f.clasePrecio = v), opciones: CLASES_PRECIO.map((c) => ({ ...c, desactivado: d.plan !== 'payg' && c.valor !== 'PriceClass_All' })) })
        }),
        ui.campo({
          etiqueta: 'Alternate domain name (CNAME)',
          opcional: true,
          info: 'cf-cname',
          cx,
          descripcion: 'Add the custom domain names that you use in URLs for the files served by this distribution.',
          control: h(
            'div',
            { class: 'cx-form' },
            f.alias.map((a, i) =>
              h(
                'div',
                { class: 'cx-fila-campos cx-cf-fila' },
                ui.entrada({ valor: a.valor, placeholder: 'www.example.com', etiquetaAccesible: `Alternate domain name ${i + 1}`, alCambiar: (v) => (a.valor = v) }),
                ui.boton('Remove', { alClic: () => (f.alias.splice(i, 1), forma.repintar()) })
              )
            ),
            h('div', {}, ui.boton('Add item', { alClic: () => (f.alias.push({ valor: '' }), forma.repintar()) }))
          )
        }),
        ui.alerta({ tipo: 'info', contenido: 'En AWS real un nombre alterno necesita un certificado de ACM (us-east-1) que lo cubra. El simulador no pide certificado.' }),
        ui.campo({ etiqueta: 'Custom SSL certificate', opcional: true, control: ui.selector({ placeholder: 'Choose certificate', opciones: [], vacio: 'No certificates (no disponible en el simulador)', desactivado: true }) }),
        ui.campo({
          etiqueta: 'Supported HTTP versions',
          control: ui.radios({ valor: f.versionesHttp, alCambiar: (v) => (f.versionesHttp = v), opciones: Object.entries(TEXTO_HTTP).map(([valor, etiqueta]) => ({ valor, etiqueta })) })
        }),
        ui.campo({ etiqueta: 'Default root object', opcional: true, info: 'cf-objeto-raiz', cx, control: ui.entrada({ valor: f.objetoRaiz, placeholder: 'index.html', etiquetaAccesible: 'Default root object', alCambiar: (v) => (f.objetoRaiz = v) }) }),
        ui.campo({ etiqueta: 'IPv6', control: ui.radios({ horizontal: true, valor: f.ipv6 ? 'on' : 'off', alCambiar: (v) => (f.ipv6 = v === 'on'), opciones: [{ valor: 'off', etiqueta: 'Off' }, { valor: 'on', etiqueta: 'On' }] }) }),
        ui.campo({ etiqueta: 'Description', opcional: true, control: ui.entrada({ valor: f.descripcion, etiquetaAccesible: 'Description', alCambiar: (v) => (f.descripcion = v) }) })
      )
    })
  );
  function guardar() {
    const p = { nombre: f.nombre, descripcion: f.descripcion, clasePrecio: f.clasePrecio, alias: f.alias.map((a) => a.valor.trim()).filter(Boolean), objetoRaiz: f.objetoRaiz.trim(), versionesHttp: f.versionesHttp, ipv6: f.ipv6 };
    const r = cx.hacer({ servicio: 'CloudFront', accion: 'UpdateDistribution', error: 'Failed to update distribution' }, (e) => editarDistribucion(e, d.id, p));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Successfully updated distribution ${d.id}. The changes are being deployed.` });
      cx.ir(rutaDist(d));
    }
  }
  return h('div', { class: 'cx-pagina cx-pagina--form' }, ui.encabezado({ titulo: 'Edit settings', info: 'cloudfront', cx }), forma, ui.pieFormulario({ cancelar: () => cx.ir(rutaDist(d)), enviar: guardar, textoEnviar: 'Save changes' }));
}

/* ================================================================ orígenes */

function origenPagina(cx, { id, origen }) {
  const d = distribucionDe(cx.estado, id);
  const editar = d && origen ? d.origenes.find((o) => o.id === origen) : null;
  cx.migas([migaCf, migaDists, { texto: id, ruta: d ? rutaDist(d) : null }, { texto: origen ? 'Edit origin' : 'Create origin' }]);
  if (!d) return noExiste(cx, 'Distribution', id, 'cloudfront/distribuciones');
  if (origen && !editar) return noExiste(cx, 'Origin', origen, rutaDist(d));
  const f = editar
    ? { ...origenVacio(), tipo: editar.tipo === 's3-website' ? 's3' : editar.tipo, dominio: editar.dominio, ruta: editar.ruta, acceso: editar.oacId ? 'oac' : 'publico', protocolo: editar.protocolo, puertoHttp: String(editar.puertoHttp), puertoHttps: String(editar.puertoHttps), id: editar.id, personalizar: true }
    : origenVacio();
  const forma = ui.region(() => ui.contenedor({ titulo: 'Settings', cuerpo: h('div', { class: 'cx-form' }, camposOrigen(cx, f, () => forma.repintar(), { editar, conNombre: true })) }));
  function guardar() {
    f.intento = true;
    forma.repintar();
    if (!f.dominio.trim()) return;
    const p = parametrosOrigen(cx, f);
    if (editar) p.actualizarPolitica = true;
    const r = cx.hacer({ servicio: 'CloudFront', accion: 'UpdateDistribution', error: editar ? 'Failed to update origin' : 'Failed to create origin' }, (e) => (editar ? editarOrigenCloudFront(e, d.id, editar.id, p) : crearOrigenCloudFront(e, d.id, p)));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: editar ? `Successfully updated origin ${r.valor.id}.` : `Successfully created origin ${r.valor.id}.` });
      cx.memoria.cfPestana = 'origenes';
      cx.ir(rutaDist(d));
    }
  }
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: editar ? 'Edit origin' : 'Create origin', info: 'cf-origen', cx }),
    forma,
    ui.pieFormulario({ cancelar: () => ((cx.memoria.cfPestana = 'origenes'), cx.ir(rutaDist(d))), enviar: guardar, textoEnviar: editar ? 'Save changes' : 'Create origin' })
  );
}

/* ========================================================= comportamientos */

function comportamientoPagina(cx, { id, indice }) {
  const d = distribucionDe(cx.estado, id);
  const editar = d && indice !== undefined ? d.comportamientos[Number(indice)] : null;
  cx.migas([migaCf, migaDists, { texto: id, ruta: d ? rutaDist(d) : null }, { texto: indice !== undefined ? 'Edit behavior' : 'Create behavior' }]);
  if (!d) return noExiste(cx, 'Distribution', id, 'cloudfront/distribuciones');
  if (indice !== undefined && !editar) return noExiste(cx, 'Behavior', indice, rutaDist(d));
  const origen0 = d.origenes.find((o) => o.id === editar?.origenId) ?? d.origenes[0];
  const c = editar ? { ...editar } : { patron: '', origenId: origen0.id, ...cacheRecomendada(origen0.tipo === 's3' ? 's3' : 'otro') };
  const st = { intento: false };
  const forma = ui.region(() =>
    ui.contenedor({
      titulo: 'Settings',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Path pattern',
          info: 'cf-comportamiento',
          cx,
          control: ui.entrada({ valor: c.patron === '*' ? 'Default (*)' : c.patron, placeholder: '/images/*', desactivado: editar?.patron === '*', etiquetaAccesible: 'Path pattern', alCambiar: (v) => (c.patron = v) }),
          restriccion: 'Use * to match any characters and ? to match one character, for example /images/*.jpg.',
          error: st.intento && !c.patron.trim() ? 'Path pattern is required.' : null
        }),
        ui.campo({
          etiqueta: 'Origin and origin groups',
          control: ui.selector({ valor: c.origenId, opciones: d.origenes.map((o) => ({ valor: o.id, etiqueta: o.id, descripcion: o.dominio })), etiquetaAccesible: 'Origin', alCambiar: (v) => (c.origenId = v) })
        }),
        h('h3', { class: 'cx-h3' }, 'Cache key and origin requests'),
        camposCache(cx, c, () => forma.repintar())
      )
    })
  );
  function guardar() {
    st.intento = true;
    forma.repintar();
    if (!c.patron.trim()) return;
    const p = { patron: c.patron.trim(), origenId: c.origenId, protocoloVisor: c.protocoloVisor, metodos: c.metodos, politicaCache: c.politicaCache, comprimir: c.comprimir };
    const r = cx.hacer({ servicio: 'CloudFront', accion: 'UpdateDistribution', error: editar ? 'Failed to update behavior' : 'Failed to create behavior' }, (e) => (editar ? editarComportamientoCache(e, d.id, editar.patron, p) : crearComportamientoCache(e, d.id, p)));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: editar ? 'Successfully updated behavior.' : `Successfully created behavior ${r.valor.patron}.` });
      cx.memoria.cfPestana = 'comportamientos';
      cx.ir(rutaDist(d));
    }
  }
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: editar ? 'Edit behavior' : 'Create behavior', info: 'cf-comportamiento', cx }),
    forma,
    ui.pieFormulario({ cancelar: () => ((cx.memoria.cfPestana = 'comportamientos'), cx.ir(rutaDist(d))), enviar: guardar, textoEnviar: editar ? 'Save changes' : 'Create behavior' })
  );
}

/* ============================================================ invalidaciones */

function crearInvalidacionPagina(cx, { id }) {
  const d = distribucionDe(cx.estado, id);
  cx.migas([migaCf, migaDists, { texto: id, ruta: d ? rutaDist(d) : null }, { texto: 'Create invalidation' }]);
  if (!d) return noExiste(cx, 'Distribution', id, 'cloudfront/distribuciones');
  const f = { rutas: cx.memoria.cfRutas ?? '', intento: false };
  cx.memoria.cfRutas = null;
  const forma = ui.region(() =>
    ui.contenedor({
      titulo: 'Object paths',
      info: 'cf-invalidacion',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Add object paths',
          control: ui.area({ valor: f.rutas, filas: 6, monoespaciado: true, alCambiar: (v) => (f.rutas = v) }),
          descripcion: 'Enter one path per line. Each path must start with /. Example: /index.html or /images/*',
          error: f.intento && !f.rutas.trim() ? 'Enter at least one object path.' : null
        }),
        ui.alerta({ tipo: 'info', contenido: 'Una invalidación borra esos archivos de la caché de las ubicaciones de borde: la siguiente petición los vuelve a pedir al origen. Úsala cuando subes una versión nueva de index.html. «/*» invalida todo.' })
      )
    })
  );
  function crear() {
    f.intento = true;
    forma.repintar();
    if (!f.rutas.trim()) return;
    const r = cx.hacer({ servicio: 'CloudFront', accion: 'CreateInvalidation', error: 'Failed to create invalidation' }, (e) => crearInvalidacion(e, d.id, f.rutas.split('\n')));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Successfully created invalidation ${r.valor.id}.` });
      cx.ir(rutaDist(d, `invalidaciones/${r.valor.id}`));
    }
  }
  return h('div', { class: 'cx-pagina cx-pagina--form' }, ui.encabezado({ titulo: 'Create invalidation', info: 'cf-invalidacion', cx }), forma, ui.pieFormulario({ cancelar: () => ((cx.memoria.cfPestana = 'invalidaciones'), cx.ir(rutaDist(d))), enviar: crear, textoEnviar: 'Create invalidation' }));
}

function detalleInvalidacion(cx, { id, inv }) {
  const d = distribucionDe(cx.estado, id);
  cx.migas([migaCf, migaDists, { texto: id, ruta: d ? rutaDist(d) : null }, { texto: inv }]);
  if (!d) return noExiste(cx, 'Distribution', id, 'cloudfront/distribuciones');
  return cx.vivo(() => {
    const x = distribucionDe(cx.estado, id)?.invalidaciones.find((i) => i.id === inv);
    if (!x) return noExiste(cx, 'Invalidation', inv, rutaDist(d));
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: x.id,
        acciones: [ui.boton('Copy to new', { escribe: true, alClic: () => ((cx.memoria.cfRutas = x.rutas.join('\n')), cx.ir(rutaDist(d, 'invalidaciones/crear'))) })]
      }),
      ui.contenedor({
        titulo: 'Invalidation details',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Distribution', valor: ui.enlace(d.id, rutaDist(d), { cx }) },
            { etiqueta: 'Status', valor: x.estado === 'Completed' ? ui.estado('exito', 'Completed') : ui.estado('pendiente', 'In progress') },
            { etiqueta: 'Date created', valor: ui.fecha(x.creado) }
          ],
          { columnas: 3 }
        )
      }),
      ui.contenedor({ titulo: 'Object paths', cuerpo: h('pre', { class: 'cx-log' }, x.rutas.join('\n')) })
    );
  });
}

/* ========================================================= OAC y políticas */

function accesoOrigen(cx) {
  cx.migas([migaCf, { texto: 'Origin access' }]);
  const usos = (oac) => dists(cx).filter((d) => d.origenes.some((o) => o.oacId === oac.id)).map((d) => d.id);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Origin access', info: 'cf-oac', cx }),
    ui.tabla(cx, {
      titulo: 'Origin access control',
      variante: 'contenedor',
      info: 'cf-oac',
      filas: () => cx.estado.cloudfront?.oacs ?? [],
      clave: (o) => o.id,
      filtro: 'Search',
      columnas: [
        { titulo: 'Name', valor: (o) => o.nombre },
        { titulo: 'ID', valor: (o) => o.id },
        { titulo: 'Description', valor: (o) => o.descripcion || '-' },
        { titulo: 'Signing behavior', valor: () => 'Sign requests (recommended)' },
        { titulo: 'Origin type', valor: () => 'S3' },
        { titulo: 'Used by', valor: (o) => usos(o).join(', ') || '-' }
      ],
      acciones: () => [ui.boton('Create control setting', { desactivado: true, titulo: 'En el simulador el OAC se crea al elegir «Origin access control» en el origen' })],
      vacio: { titulo: 'No origin access controls', texto: 'Se crea uno solo cuando eliges «Origin access control settings» para un origen de S3.' }
    }),
    ui.contenedor({ titulo: 'Legacy access identities', plegable: true, abierto: false, cuerpo: ui.alerta({ tipo: 'info', contenido: 'Origin access identity (OAI) es la forma anterior a OAC. AWS recomienda OAC.' }) })
  );
}

function politicas(cx) {
  cx.migas([migaCf, { texto: 'Policies' }]);
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Policies', info: 'cf-comportamiento', cx }),
    ui.pestanas({
      pestanas: [
        {
          id: 'cache',
          texto: 'Cache',
          contenido: () =>
            ui.tabla(cx, {
              titulo: 'Managed policies',
              variante: 'contenedor',
              filas: () => POLITICAS_CACHE,
              clave: (p) => p.id,
              filtro: false,
              columnas: [
                { titulo: 'Name', valor: (p) => p.nombre },
                { titulo: 'Description', valor: (p) => p.descripcion },
                { titulo: 'Minimum TTL', valor: (p) => String(p.ttl[0]) },
                { titulo: 'Default TTL', valor: (p) => String(p.ttl[1]) },
                { titulo: 'Maximum TTL', valor: (p) => String(p.ttl[2]) }
              ]
            })
        },
        { id: 'origen', texto: 'Origin request', contenido: () => ui.noDisponible('Origin request policies') },
        { id: 'cabeceras', texto: 'Response headers', contenido: () => ui.noDisponible('Response headers policies') }
      ]
    })
  );
}

/* ================================================================ ayudas */

const ayudas = {
  cloudfront: {
    titulo: 'Amazon CloudFront',
    texto: [
      '**CloudFront** es la red de entrega de contenido (CDN) de AWS. Guarda copias de tus archivos en cientos de **ubicaciones de borde** (edge locations) por todo el mundo, cerca de tus usuarios.',
      'Así tu página carga más rápido (menos latencia), aguanta más visitas y tu origen (un bucket de S3 o un balanceador) recibe menos peticiones.',
      ['Una **distribución** tiene un dominio como `d1234abcd.cloudfront.net`.', 'Es un servicio **global**: no vive en una región ni en una VPC.', 'Cada cambio tarda en **desplegarse** a todas las ubicaciones (en el simulador, unos 30 s).'],
      'Para el examen: CloudFront = caché global + HTTPS + protección (AWS Shield Standard viene incluido y gratis; AWS WAF es opcional).'
    ]
  },
  'cf-plan': {
    titulo: 'Planes de precio',
    texto: [
      'Desde noviembre de 2025 CloudFront ofrece **planes de tarifa fija** (Free, Pro, Business, Premium) que incluyen CDN, AWS WAF, protección DDoS y DNS de Route 53 por un precio mensual.',
      '**Pay as you go** es el modelo clásico: pagas por los GB que salen hacia los usuarios y por las peticiones, con todas las opciones disponibles.',
      'La transferencia de datos de un origen de AWS (S3, ALB) hacia CloudFront no se cobra.'
    ]
  },
  'cf-origen': {
    titulo: 'Origen (origin)',
    texto: [
      'El **origen** es donde vive la versión original de tus archivos. CloudFront se los pide la primera vez y luego los guarda en caché.',
      ['**Amazon S3**: un bucket. Puede ser privado si usas OAC (recomendado).', '**S3 website endpoint**: `bucket.s3-website-us-east-1.amazonaws.com`; el bucket debe ser público y solo habla HTTP.', '**Elastic Load Balancer**: tu ALB con instancias EC2 detrás.', '**Other**: cualquier servidor web con un nombre público.'],
      '**Origin path** agrega una carpeta: con `/sitio`, la petición `/index.html` se pide como `/sitio/index.html`.'
    ]
  },
  'cf-oac': {
    titulo: 'Origin access control (OAC)',
    texto: [
      'Con **OAC** tu bucket de S3 se queda **privado** y solo CloudFront puede leerlo: nadie abre los archivos directo con la URL de S3.',
      'La consola agrega a la política del bucket un permiso `s3:GetObject` para el servicio `cloudfront.amazonaws.com`, con la condición `AWS:SourceArn` = el ARN de tu distribución.',
      'Si borras ese permiso de la política, CloudFront recibe **403 Access Denied**.'
    ]
  },
  'cf-comportamiento': {
    titulo: 'Comportamientos (behaviors)',
    texto: [
      'Un **comportamiento** decide qué hacer con las peticiones que coinciden con un **path pattern** (por ejemplo `/imagenes/*`): a qué origen van y cuánto tiempo se guardan en caché.',
      'Se revisan en orden de **precedencia**; el último siempre es **Default (*)**, que atiende todo lo demás.',
      ['**Viewer protocol policy**: «Redirect HTTP to HTTPS» manda a HTTPS a quien entra con http://.', '**Cache policy**: `CachingOptimized` guarda hasta 1 día por omisión; `CachingDisabled` no guarda nada.']
    ]
  },
  'cf-invalidacion': {
    titulo: 'Invalidaciones',
    texto: [
      'Si cambias un archivo en el origen, las ubicaciones de borde pueden seguir entregando la copia vieja hasta que **expire** (el TTL).',
      'Una **invalidación** borra esas copias ya: la siguiente visita pide el archivo nuevo al origen.',
      ['`/index.html` invalida un archivo.', '`/imagenes/*` invalida una carpeta.', '`/*` invalida todo.'],
      'En AWS las primeras 1,000 rutas al mes son gratis; después se cobran.'
    ]
  },
  'cf-clase-precio': {
    titulo: 'Clase de precio (price class)',
    texto: [
      'Decide qué ubicaciones de borde usa tu distribución (solo en Pay as you go).',
      ['**All edge locations**: la mejor velocidad en todo el mundo, la más cara.', '**200**: sin las regiones más caras (Sudamérica, Australia…).', '**100**: solo Norteamérica y Europa: la más barata.'],
      'Si tus usuarios están en México, la 100 ya los atiende desde Norteamérica.'
    ]
  },
  'cf-waf': {
    titulo: 'AWS WAF',
    texto: [
      '**AWS WAF** (Web Application Firewall) filtra peticiones maliciosas en la capa 7: inyección SQL, cross-site scripting, bots y reglas por IP o país.',
      'Se conecta a CloudFront, a un ALB o a API Gateway mediante una **web ACL**.',
      'No confundir: **AWS Shield Standard** (contra DDoS) viene gratis con CloudFront y Route 53; **Shield Advanced** cuesta aparte.'
    ]
  },
  'cf-cname': {
    titulo: 'Nombres alternos (CNAMEs)',
    texto: [
      'Para que tus usuarios entren por `www.tudominio.com` en lugar de `d1234abcd.cloudfront.net` necesitas dos cosas:',
      ['Agregar `www.tudominio.com` en **Alternate domain names** de la distribución (si no, CloudFront contesta **403**).', 'Crear en **Route 53** un registro **A Alias** que apunte a la distribución.'],
      'En AWS real también hace falta un certificado de **ACM** en us-east-1; el simulador se lo salta.'
    ]
  },
  'cf-objeto-raiz': {
    titulo: 'Default root object',
    texto: [
      'Es el archivo que CloudFront entrega cuando alguien pide la raíz del sitio (`/`), por ejemplo `index.html`.',
      'Sin él, la raíz de un bucket de S3 con OAC contesta **403 Access Denied**. Escríbelo sin diagonal: `index.html`, no `/index.html`.'
    ]
  }
};

export default {
  id: 'cloudfront',
  nombre: 'CloudFront',
  titulo: 'CloudFront',
  descripcion: 'Global Content Delivery Network',
  categoria: 'redes',
  claves: 'cdn cloudfront distribucion borde edge cache',
  inicio: 'cloudfront/distribuciones',
  menu: [
    { texto: 'Distributions', ruta: 'cloudfront/distribuciones' },
    { texto: 'Distribution tenants', desactivado: true },
    { texto: 'Policies', ruta: 'cloudfront/politicas' },
    { texto: 'Functions', desactivado: true },
    { texto: 'Static IPs', desactivado: true },
    { texto: 'VPC origins', desactivado: true },
    { seccion: 'Telemetry', items: [{ texto: 'Monitoring', desactivado: true }, { texto: 'Alarms', desactivado: true }, { texto: 'Logs', desactivado: true }] },
    { seccion: 'Reports & analytics', items: [{ texto: 'Cache statistics', desactivado: true }, { texto: 'Popular objects', desactivado: true }, { texto: 'Usage', desactivado: true }] },
    { seccion: 'Security', items: [{ texto: 'Origin access', ruta: 'cloudfront/acceso-origen' }, { texto: 'Field-level encryption', desactivado: true }, { texto: 'Key management', desactivado: true }] }
  ],
  rutas: {
    '': listaDistribuciones,
    distribuciones: listaDistribuciones,
    'distribuciones/crear': crearDistribucionPagina,
    'distribuciones/:id': detalleDistribucion,
    'distribuciones/:id/editar': editarAjustesPagina,
    'distribuciones/:id/origenes/crear': origenPagina,
    'distribuciones/:id/origenes/:origen/editar': origenPagina,
    'distribuciones/:id/comportamientos/crear': comportamientoPagina,
    'distribuciones/:id/comportamientos/:indice/editar': comportamientoPagina,
    'distribuciones/:id/invalidaciones/crear': crearInvalidacionPagina,
    'distribuciones/:id/invalidaciones/:inv': detalleInvalidacion,
    'acceso-origen': accesoOrigen,
    politicas
  },
  busqueda: [
    { texto: 'Distributions', ruta: 'cloudfront/distribuciones', claves: 'distribuciones cdn' },
    { texto: 'Create distribution', ruta: 'cloudfront/distribuciones/crear' },
    { texto: 'Origin access', ruta: 'cloudfront/acceso-origen', claves: 'oac' },
    { texto: 'Cache policies', ruta: 'cloudfront/politicas' }
  ],
  ayudas
};
