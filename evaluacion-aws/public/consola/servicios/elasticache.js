// ---------------------------------------------------------------------------
// AMAZON ELASTICACHE
//
// La consola de ElastiCache: Dashboard con «Get started», las listas por
// motor (Valkey, Redis OSS, Memcached) y la de cachés serverless, «Create
// cache» (Serverless o Design your own cache, con sus ajustes por omisión o
// personalizados), el detalle de una caché con su endpoint y Delete. Basta el
// recurso y sus estados (creating → available, deleting): no guarda datos.
// El modelo vive en modelo/rds.js.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import { cacheDe, crearCacheElasticache, eliminarCacheElasticache, motorCache, TIPOS_NODO_CACHE } from '../modelo.js';
import { enlaceRecurso, noExiste, opcionesVpc } from './comun.js';
import { estadoRds } from './rds.js';

const { h } = ui;

/** Una región que se repinta a mano con la separación de 20 px entre contenedores. */
const regionPagina = (fn) => ui.region(fn, { clase: 'cx-pagina' });

const caches = (cx) => cx.estado.elasticache?.caches ?? [];
const motorTexto = (m) => motorCache(m)?.nombre ?? m;
const rutaCache = (c) => `elasticache/caches/${c.nombre}`;
const tipoTexto = (c) => (c.despliegue === 'serverless' ? 'Serverless' : c.motor === 'memcached' ? 'Memcached cluster' : 'Node-based cluster');

/* ============================================================ dashboard */

function panel(cx) {
  cx.migas([{ texto: 'ElastiCache', ruta: 'elasticache' }, { texto: 'Dashboard' }]);
  const recursos = cx.vivo(() => {
    const lista = caches(cx);
    const cuenta = (fn) => lista.filter(fn).length;
    const item = (texto, n, ruta) => h('div', { class: 'cx-resumen-recursos__item' }, ruta ? ui.enlace(texto, ruta, { cx }) : h('span', { class: 'cx-texto-sec' }, texto), h('span', {}, String(n)));
    return ui.contenedor({
      titulo: 'Resources',
      acciones: ui.botonRefrescar(() => cx.refrescar()),
      cuerpo: h(
        'div',
        { class: 'cx-resumen-recursos' },
        item('Serverless caches', cuenta((c) => c.despliegue === 'serverless'), 'elasticache/serverless'),
        item('Valkey caches', cuenta((c) => c.motor === 'valkey'), 'elasticache/valkey'),
        item('Redis OSS caches', cuenta((c) => c.motor === 'redis'), 'elasticache/redis'),
        item('Memcached caches', cuenta((c) => c.motor === 'memcached'), 'elasticache/memcached'),
        item('Global datastores', 0),
        item('Backups', 0)
      )
    });
  });
  const tarjeta = (motor, texto) =>
    h(
      'div',
      { class: 'cx-bloque' },
      h('div', { class: 'cx-bloque__titulo' }, motorTexto(motor), motor === 'valkey' ? h('span', { class: 'cx-insignia cx-insignia--azul', style: { marginLeft: '8px' } }, 'Recommended') : null),
      h('p', { class: 'cx-texto-sec' }, texto),
      h('div', { style: { marginTop: '12px' } }, ui.boton(`Create ${motorTexto(motor)} cache`, { escribe: true, alClic: () => cx.ir(`elasticache/crear/${motor}`) }))
    );
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Get started with Amazon ElastiCache', info: 'cache-elasticache', cx, descripcion: 'A fully managed, in-memory caching service with microsecond read and write latency. Put a cache in front of your database to answer repeated queries from memory.' }),
    recursos,
    ui.contenedor({
      titulo: 'Create a cache',
      info: 'cache-motor',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-rds-crear-opciones' },
        tarjeta('valkey', 'Open source, Redis OSS compatible. Serverless pricing up to 33% lower than other engines.'),
        tarjeta('memcached', 'Simple, multithreaded key-value cache. No replication or persistence.'),
        tarjeta('redis', 'Data structures, replication and persistence. Compatible with existing Redis OSS clients.')
      )
    })
  );
}

/* ============================================================ listas */

function lista(cx, filtro, titulo, motorCrear) {
  cx.migas([{ texto: 'ElastiCache', ruta: 'elasticache' }, { texto: titulo }]);
  const t = ui.tabla(cx, {
    titulo,
    info: 'cache-elasticache',
    filas: () => caches(cx).filter(filtro),
    clave: (c) => c.nombre,
    seleccion: 'unica',
    filtro: 'Search caches',
    columnas: [
      { titulo: 'Cache name', valor: (c) => ui.enlace(c.nombre, rutaCache(c), { cx }) },
      { titulo: 'Status', valor: (c) => estadoRds(c) },
      { titulo: 'Engine', valor: (c) => motorTexto(c.motor) },
      { titulo: 'Engine version', valor: (c) => c.version },
      { titulo: 'Deployment option', valor: (c) => tipoTexto(c) },
      { titulo: 'Node type', valor: (c) => c.tipoNodo ?? '–' },
      { titulo: 'Endpoint', valor: (c) => (c.estado === 'creating' ? '–' : `${c.endpoint}:${c.puerto}`) }
    ],
    acciones: (sel) => [
      ui.menuBoton('Actions', () => [
        { texto: 'Modify', desactivado: true },
        { texto: 'Backup', desactivado: true },
        { texto: 'Delete', escribe: true, desactivado: !sel[0] || sel[0].estado !== 'available', alClic: () => eliminar(cx, sel[0]) }
      ], { desactivado: !sel.length }),
      ui.boton('Create cache', { variante: 'primario', alClic: () => cx.ir(`elasticache/crear/${motorCrear}`) })
    ],
    vacio: { titulo: 'No caches', texto: 'You don’t have any caches.', accion: ui.boton('Create cache', { escribe: true, alClic: () => cx.ir(`elasticache/crear/${motorCrear}`) }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

const listaServerless = (cx) => lista(cx, (c) => c.despliegue === 'serverless', 'Serverless caches', 'valkey');
const listaValkey = (cx) => lista(cx, (c) => c.motor === 'valkey', 'Valkey caches', 'valkey');
const listaRedis = (cx) => lista(cx, (c) => c.motor === 'redis', 'Redis OSS caches', 'redis');
const listaMemcached = (cx) => lista(cx, (c) => c.motor === 'memcached', 'Memcached caches', 'memcached');

function eliminar(cx, c) {
  const f = { respaldo: c.motor !== 'memcached', nombre: `${c.nombre}-final` };
  cx.confirmar({
    titulo: `Delete ${c.nombre}?`,
    palabra: 'delete',
    ancho: 'grande',
    contenido: [
      h('p', {}, `Deleting the cache ${c.nombre} removes all of its data. This can’t be undone.`),
      c.motor === 'memcached'
        ? null
        : ui.campo({
            etiqueta: 'Create backup',
            control: ui.radios({ valor: f.respaldo ? 'si' : 'no', opciones: [{ valor: 'si', etiqueta: 'Yes' }, { valor: 'no', etiqueta: 'No' }], alCambiar: (v) => (f.respaldo = v === 'si') })
          }),
      c.motor === 'memcached' ? null : ui.campo({ etiqueta: 'Backup name', control: ui.entrada({ valor: f.nombre, alCambiar: (v) => (f.nombre = v) }) })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'ElastiCache', accion: c.despliegue === 'serverless' ? 'DeleteServerlessCache' : 'DeleteReplicationGroup', error: `Failed to delete ${c.nombre}` }, (e) => eliminarCacheElasticache(e, c.nombre, { respaldoFinal: f.respaldo ? f.nombre : null }));
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Deleting cache ${c.nombre}.` });
        if (cx.ruta.startsWith('elasticache/caches/')) cx.ir('elasticache/serverless');
      }
      return r.ok;
    }
  });
}

/* ============================================================ crear */

function crear(cx, { motor }) {
  cx.migas([{ texto: 'ElastiCache', ruta: 'elasticache' }, { texto: 'Create cache' }]);
  const e = cx.estado;
  const vpcDef = e.vpcs.find((v) => v.porDefecto) ?? e.vpcs[0];
  const subredesDe = (vpcId) => e.subredes.filter((s) => s.vpcId === vpcId);
  const f = {
    motor: motorCache(motor) ? motor : 'valkey',
    despliegue: 'serverless',
    metodo: 'cluster',
    nombre: '',
    descripcion: '',
    version: null,
    ajustes: 'defecto',
    vpcId: vpcDef?.id ?? null,
    subredes: subredesDe(vpcDef?.id).slice(0, 3).map((s) => s.id),
    sgs: e.gruposSeguridad.filter((g) => g.vpcId === vpcDef?.id && g.porDefecto).map((g) => g.id),
    datosGb: '',
    ecpu: '',
    tipoNodo: 'cache.t4g.micro',
    replicas: '1',
    nodos: '1',
    multiAz: true,
    respaldo: false,
    retencion: '1',
    errores: {}
  };
  f.version = motorCache(f.motor).versiones[0];
  const form = regionPagina(() => {
    const m = motorCache(f.motor);
    const serverless = f.despliegue === 'serverless';
    const personalizar = !serverless || f.ajustes === 'propios';
    const red = [
      ui.campo({ etiqueta: 'Network type', control: ui.radios({ valor: 'ipv4', horizontal: true, opciones: [{ valor: 'ipv4', etiqueta: 'IPv4' }, { valor: 'dual', etiqueta: 'Dual stack', desactivado: true }] }) }),
      ui.campo({
        etiqueta: 'VPC ID',
        info: 'vpc',
        cx,
        control: ui.selector({
          opciones: opcionesVpc(e),
          valor: f.vpcId,
          alCambiar: (v) => {
            f.vpcId = v;
            f.subredes = subredesDe(v).slice(0, 3).map((s) => s.id);
            f.sgs = e.gruposSeguridad.filter((g) => g.vpcId === v && g.porDefecto).map((g) => g.id);
            form.repintar();
          }
        })
      }),
      ui.campo({
        etiqueta: 'Subnet IDs',
        descripcion: serverless ? 'Choose subnets in at least two Availability Zones.' : 'Choose the subnets for the cache subnet group.',
        control: ui.selector({ multiple: true, valores: f.subredes, filtrar: true, opciones: subredesDe(f.vpcId).map((s) => ({ valor: s.id, etiqueta: `${s.id}${s.nombre ? ` (${s.nombre})` : ''}`, descripcion: `${s.az} · ${s.cidr}` })), alCambiar: (v) => (f.subredes = v) })
      }),
      ui.campo({
        etiqueta: 'Security groups',
        info: 'grupo-seguridad',
        cx,
        descripcion: `Allow inbound TCP ${m.puerto} from the security group of your application servers.`,
        control: ui.selector({ multiple: true, valores: f.sgs, filtrar: true, opciones: e.gruposSeguridad.filter((g) => g.vpcId === f.vpcId).map((g) => ({ valor: g.id, etiqueta: g.nombre, descripcion: g.id })), alCambiar: (v) => (f.sgs = v) })
      })
    ];
    return [
      ui.contenedor({
        titulo: 'Engine',
        info: 'cache-motor',
        cx,
        cuerpo: ui.tarjetas({
          valor: f.motor,
          columnas: 3,
          opciones: [
            { valor: 'valkey', etiqueta: 'Valkey - recommended', descripcion: 'Open source, compatible with Redis OSS. Lower price.' },
            { valor: 'memcached', etiqueta: 'Memcached', descripcion: 'Simple multithreaded caching.' },
            { valor: 'redis', etiqueta: 'Redis OSS', descripcion: 'Data structures, replication and persistence.' }
          ],
          alCambiar: (v) => {
            f.motor = v;
            f.version = motorCache(v).versiones[0];
            form.repintar();
          }
        })
      }),
      ui.contenedor({
        titulo: 'Deployment option',
        info: 'cache-despliegue',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.tarjetas({
            valor: f.despliegue,
            columnas: 2,
            opciones: [
              { valor: 'serverless', etiqueta: 'Serverless - new', descripcion: 'Use a serverless cache that automatically scales capacity and is highly available across multiple Availability Zones.' },
              { valor: 'propio', etiqueta: 'Design your own cache', descripcion: 'Choose a node type, size and number of nodes for your cache.' }
            ],
            alCambiar: (v) => ((f.despliegue = v), form.repintar())
          }),
          serverless
            ? null
            : ui.campo({
                etiqueta: 'Creation method',
                control: ui.radios({
                  valor: f.metodo,
                  opciones: [
                    { valor: 'facil', etiqueta: 'Easy create', descripcion: 'Use a recommended configuration (Demo, Dev/Test or Production).', desactivado: true },
                    { valor: 'cluster', etiqueta: 'Cluster cache', descripcion: 'Set all of the configuration options for your new cache.' },
                    { valor: 'respaldo', etiqueta: 'Restore from backup', descripcion: 'Restore a cache from a backup.', desactivado: true }
                  ],
                  alCambiar: (v) => (f.metodo = v)
                })
              })
        )
      }),
      ui.contenedor({
        titulo: 'Settings',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Name', control: ui.entrada({ valor: f.nombre, placeholder: 'my-cache', alCambiar: (v) => (f.nombre = v) }), error: f.errores.nombre, restriccion: 'The name can have up to 40 characters, must begin with a letter and can contain only letters, numbers and hyphens. It can’t end with a hyphen or contain two consecutive hyphens.' }),
          ui.campo({ etiqueta: 'Description', opcional: true, control: ui.entrada({ valor: f.descripcion, alCambiar: (v) => (f.descripcion = v) }) }),
          ui.campo({ etiqueta: serverless ? 'Major engine version' : 'Engine version', control: ui.selector({ opciones: m.versiones.map((v, i) => ({ valor: v, etiqueta: v, etiquetaDerecha: i === 0 ? 'Latest' : undefined })), valor: f.version, alCambiar: (v) => (f.version = v) }) })
        )
      }),
      serverless
        ? ui.contenedor({
            titulo: 'Default settings',
            info: 'cache-despliegue',
            cx,
            cuerpo: h(
              'div',
              { class: 'cx-form' },
              ui.radios({ valor: f.ajustes, opciones: [{ valor: 'defecto', etiqueta: 'Use default settings', descripcion: 'Uses the default VPC, its subnets and default security group, with no usage limits.' }, { valor: 'propios', etiqueta: 'Customize default settings' }], alCambiar: (v) => ((f.ajustes = v), form.repintar()) }),
              f.ajustes === 'defecto'
                ? ui.pares(
                    [
                      { etiqueta: 'VPC', valor: vpcDef?.id },
                      { etiqueta: 'Subnets', valor: `${f.subredes.length} subnets` },
                      { etiqueta: 'Security groups', valor: 'default' },
                      { etiqueta: 'Maximum data storage', valor: 'No limit' },
                      { etiqueta: 'Maximum ECPU per second', valor: 'No limit' },
                      { etiqueta: 'Encryption in transit', valor: 'Required' }
                    ],
                    { columnas: 3 }
                  )
                : null
            )
          })
        : ui.contenedor({
            titulo: 'Cluster settings',
            cuerpo: h(
              'div',
              { class: 'cx-form' },
              ui.campo({ etiqueta: 'Node type', control: ui.selector({ opciones: TIPOS_NODO_CACHE.map((t) => ({ valor: t.tipo, etiqueta: t.tipo, descripcion: `${t.memoria} GiB memory · ${t.precio} USD/hour` })), valor: f.tipoNodo, alCambiar: (v) => (f.tipoNodo = v) }) }),
              f.motor === 'memcached'
                ? ui.campo({ etiqueta: 'Number of nodes', control: ui.entrada({ tipo: 'number', valor: f.nodos, alCambiar: (v) => (f.nodos = v) }), restriccion: '1 to 60 nodes' })
                : [
                    ui.campo({ etiqueta: 'Number of replicas', control: ui.entrada({ tipo: 'number', valor: f.replicas, alCambiar: (v) => (f.replicas = v) }), restriccion: '0 to 5 replicas per shard' }),
                    ui.casilla({ etiqueta: 'Multi-AZ', descripcion: 'Automatically fail over to a replica in another Availability Zone if the primary node fails.', marcada: f.multiAz, alCambiar: (v) => (f.multiAz = v) })
                  ]
            )
          }),
      personalizar ? ui.contenedor({ titulo: 'Connectivity', cuerpo: h('div', { class: 'cx-form' }, red) }) : null,
      serverless && personalizar
        ? ui.contenedor({
            titulo: 'Cache usage limits',
            info: 'cache-limites',
            cx,
            cuerpo: h(
              'div',
              { class: 'cx-fila-campos' },
              ui.campo({ etiqueta: 'Maximum data storage', opcional: true, control: ui.entrada({ tipo: 'number', valor: f.datosGb, sufijo: 'GB', alCambiar: (v) => (f.datosGb = v) }), restriccion: '1 to 5,000 GB' }),
              ui.campo({ etiqueta: 'Maximum ECPU per second', opcional: true, control: ui.entrada({ tipo: 'number', valor: f.ecpu, alCambiar: (v) => (f.ecpu = v) }), restriccion: '1,000 to 15,000,000 ECPU per second' })
            )
          })
        : null,
      f.motor === 'memcached' || (serverless && !personalizar)
        ? null
        : ui.contenedor({
            titulo: 'Backup',
            cuerpo: h(
              'div',
              { class: 'cx-form' },
              ui.casilla({ etiqueta: 'Enable automatic backups', marcada: f.respaldo, alCambiar: (v) => ((f.respaldo = v), form.repintar()) }),
              f.respaldo ? ui.campo({ etiqueta: 'Backup retention period', control: ui.entrada({ tipo: 'number', valor: f.retencion, sufijo: 'days', alCambiar: (v) => (f.retencion = v) }) }) : null
            )
          }),
      ui.pieFormulario({ cancelar: () => cx.ir('elasticache'), textoEnviar: 'Create', enviar: crearYa })
    ];
  });

  function crearYa() {
    f.errores = {};
    if (!f.nombre.trim()) {
      f.errores.nombre = 'Name is required.';
      return form.repintar();
    }
    const serverless = f.despliegue === 'serverless';
    const r = cx.hacer(
      { servicio: 'ElastiCache', accion: serverless ? 'CreateServerlessCache' : 'CreateReplicationGroup', error: 'Failed to create cache' },
      (e2) =>
        crearCacheElasticache(e2, {
          nombre: f.nombre,
          motor: f.motor,
          despliegue: f.despliegue,
          descripcion: f.descripcion,
          version: f.version,
          vpcId: f.vpcId,
          subredes: f.subredes,
          gruposSeguridad: f.sgs,
          limites: serverless && f.ajustes === 'propios' ? { datosGb: f.datosGb, ecpu: f.ecpu } : null,
          tipoNodo: f.tipoNodo,
          nodos: Number(f.nodos),
          replicas: Number(f.replicas),
          multiAz: f.multiAz,
          retencionRespaldo: f.respaldo ? Number(f.retencion) : 0
        }),
      { atomico: true }
    );
    if (r.ok) {
      cx.flash({ tipo: 'progreso', titulo: `Creating ${r.valor.nombre}`, texto: 'The cache will be available in a few minutes.' });
      cx.ir(serverless ? 'elasticache/serverless' : `elasticache/${f.motor}`);
    }
  }

  return h('div', { class: 'cx-pagina cx-pagina--form cx-rds-form' }, ui.encabezado({ titulo: `Create ${motorTexto(f.motor)} cache`, info: 'cache-elasticache', cx }), form);
}

/* ============================================================ detalle */

function detalle(cx, { nombre }) {
  cx.migas([{ texto: 'ElastiCache', ruta: 'elasticache' }, { texto: 'Caches', ruta: 'elasticache/serverless' }, { texto: nombre }]);
  if (!cacheDe(cx.estado, nombre)) return noExiste(cx, 'Cache', nombre, 'elasticache/serverless');
  const st = { pestana: 'detalles' };
  return cx.vivo(() => {
    const c = cacheDe(cx.estado, nombre);
    if (!c) return noExiste(cx, 'Cache', nombre, 'elasticache/serverless');
    const listo = c.estado !== 'creating';
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: c.nombre,
        info: 'cache-elasticache',
        cx,
        acciones: [ui.botonRefrescar(() => cx.refrescar()), ui.menuBoton('Actions', () => [{ texto: 'Modify', desactivado: true }, { texto: 'Delete', escribe: true, desactivado: c.estado !== 'available', alClic: () => eliminar(cx, c) }])]
      }),
      ui.contenedor({
        titulo: 'Cache settings',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Name', valor: c.nombre },
            { etiqueta: 'Status', valor: estadoRds(c) },
            { etiqueta: 'Engine', valor: `${motorTexto(c.motor)} ${c.version}` },
            { etiqueta: 'Deployment option', valor: tipoTexto(c) },
            { etiqueta: 'Description', valor: c.descripcion || '–' },
            { etiqueta: 'ARN', valor: ui.copiable(c.arn) },
            { etiqueta: c.motor === 'memcached' && c.despliegue !== 'serverless' ? 'Configuration endpoint' : c.despliegue === 'serverless' ? 'Endpoint' : 'Primary endpoint', valor: listo ? ui.copiable(`${c.endpoint}:${c.puerto}`) : '–' },
            { etiqueta: 'Reader endpoint', valor: listo && c.endpointLectura ? ui.copiable(`${c.endpointLectura}:${c.puertoLectura ?? c.puerto}`) : '–' },
            { etiqueta: 'Created', valor: ui.fechaLarga(c.creado) }
          ],
          { columnas: 3 }
        )
      }),
      ui.pestanas({
        activa: st.pestana,
        alCambiar: (p) => (st.pestana = p),
        pestanas: [
          {
            id: 'detalles',
            texto: c.despliegue === 'serverless' ? 'Capacity' : 'Nodes',
            contenido: () =>
              c.despliegue === 'serverless'
                ? ui.contenedor({
                    titulo: 'Cache usage limits',
                    info: 'cache-limites',
                    cx,
                    cuerpo: ui.pares(
                      [
                        { etiqueta: 'Maximum data storage', valor: c.limites?.datosGb ? `${c.limites.datosGb} GB` : 'No limit' },
                        { etiqueta: 'Maximum ECPU per second', valor: c.limites?.ecpu ? String(c.limites.ecpu) : 'No limit' },
                        { etiqueta: 'Current data stored', valor: listo ? '0.02 GB' : '–' }
                      ],
                      { columnas: 3, cx }
                    )
                  })
                : ui.contenedor({
                    titulo: 'Nodes',
                    cuerpo: ui.pares(
                      [
                        { etiqueta: 'Node type', valor: c.tipoNodo },
                        { etiqueta: c.motor === 'memcached' ? 'Number of nodes' : 'Number of replicas', valor: String(c.motor === 'memcached' ? c.nodos : c.replicas) },
                        { etiqueta: 'Multi-AZ', valor: c.multiAz ? 'Enabled' : 'Disabled' }
                      ],
                      { columnas: 3 }
                    )
                  })
          },
          {
            id: 'red',
            texto: 'Connectivity and security',
            contenido: () =>
              ui.contenedor({
                titulo: 'Connectivity and security',
                cuerpo: ui.pares(
                  [
                    { etiqueta: 'VPC', valor: enlaceRecurso(cx, c.vpcId, { conNombre: true }) },
                    { etiqueta: 'Subnets', valor: h('div', {}, c.subredes.map((s) => h('div', {}, enlaceRecurso(cx, s)))) },
                    { etiqueta: 'Security groups', valor: h('div', {}, c.gruposSeguridad.map((g) => h('div', {}, enlaceRecurso(cx, g)))) },
                    { etiqueta: 'Port', valor: String(c.puerto) },
                    { etiqueta: 'Encryption in transit', valor: c.despliegue === 'serverless' ? 'Required' : 'Enabled' },
                    { etiqueta: 'Encryption at rest', valor: 'Enabled' }
                  ],
                  { columnas: 3 }
                )
              })
          },
          { id: 'respaldos', texto: 'Backups', contenido: () => ui.contenedor({ titulo: 'Backup', cuerpo: ui.pares([{ etiqueta: 'Automatic backups', valor: c.retencionRespaldo ? `Enabled (${c.retencionRespaldo} days)` : 'Disabled' }], { columnas: 1 }) }) },
          { id: 'monitoreo', texto: 'Monitoring', contenido: () => ui.alerta({ tipo: 'info', titulo: 'No disponible en este simulador', contenido: 'Las métricas de la caché (CacheHits, CacheMisses, ECPU) solo existen en la consola real.' }) }
        ]
      })
    );
  });
}

/* ================================================================ ayudas */

const ayudas = {
  'cache-elasticache': {
    titulo: 'Amazon ElastiCache',
    texto: [
      '**ElastiCache** es una memoria rapidísima que pones **frente a tu base de datos**: guarda las respuestas de las consultas que se repiten y las entrega en microsegundos, sin molestar a la base.',
      'Ejemplo: el catálogo de la tienda se consulta miles de veces; la primera vez sale de RDS y se guarda en la caché; las siguientes salen de la caché.',
      'La caché vive **en memoria**: no es para guardar datos para siempre.'
    ]
  },
  'cache-motor': {
    titulo: 'Motores de caché',
    texto: [
      '**Valkey**: de código abierto y compatible con Redis OSS; es el recomendado y el más barato.',
      '**Redis OSS**: estructuras de datos, réplicas y persistencia.',
      '**Memcached**: el más simple; sin réplicas ni respaldos. Usa el puerto `11211` (los otros, el `6379`).'
    ]
  },
  'cache-despliegue': {
    titulo: 'Serverless o diseñada por ti',
    texto: [
      '**Serverless**: no eliges servidores; la caché crece y se reparte sola en varias zonas. Pagas por datos guardados y por ECPU (unidades de procesamiento).',
      '**Design your own cache**: eliges el tipo de nodo (`cache.t4g.micro`…), cuántos nodos y réplicas, y si es Multi-AZ.'
    ]
  },
  'cache-limites': {
    titulo: 'Límites de uso',
    texto: ['Pon un máximo de GB y de ECPU por segundo para que una caché serverless **no te cobre de más** si recibe muchísimo tráfico.']
  }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'elasticache',
  nombre: 'ElastiCache',
  titulo: 'Amazon ElastiCache',
  descripcion: 'In-Memory Cache',
  categoria: 'bases',
  claves: 'cache valkey redis memcached memoria',
  inicio: 'elasticache',
  menu: [
    { texto: 'Dashboard', ruta: 'elasticache' },
    { seccion: 'Resources', items: [{ texto: 'Serverless caches', ruta: 'elasticache/serverless' }, { texto: 'Valkey caches', ruta: 'elasticache/valkey' }, { texto: 'Redis OSS caches', ruta: 'elasticache/redis' }, { texto: 'Memcached caches', ruta: 'elasticache/memcached' }, des('Global datastores')] },
    { seccion: 'Configurations', items: [des('Backups'), des('Subnet groups'), des('Parameter groups'), des('Users'), des('User group')] },
    des('Events'),
    des('Reserved nodes'),
    des('Service updates')
  ],
  rutas: {
    '': panel,
    serverless: listaServerless,
    valkey: listaValkey,
    redis: listaRedis,
    memcached: listaMemcached,
    'crear/:motor': crear,
    'caches/:nombre': detalle
  },
  busqueda: [
    { texto: 'Serverless caches', ruta: 'elasticache/serverless', claves: 'valkey redis' },
    { texto: 'Create cache', ruta: 'elasticache/crear/valkey', claves: 'valkey redis memcached' },
    { texto: 'Memcached caches', ruta: 'elasticache/memcached' }
  ],
  ayudas
};

