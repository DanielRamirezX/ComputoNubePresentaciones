// ---------------------------------------------------------------------------
// EC2 · LAUNCH TEMPLATES Y AUTO SCALING GROUPS
//
// Las plantillas de lanzamiento (lista con su panel inferior, Create launch
// template y Modify template (Create new version) con el mismo asistente de
// Launch instance de ec2-instancias.js en «modo plantilla», el detalle con sus
// versiones y Launch instance from template) y los grupos de Auto Scaling
// (lista, el asistente de 7 pasos, el detalle con Capacity overview y las
// pestañas Details, Integrations, Automatic scaling, Instance management,
// Activity y Monitoring, Edit, las políticas dinámicas y las acciones
// programadas). El botón propio del simulador «Simular hora pico» sube la CPU
// del grupo para ver escalar en clase.
//
// El modelo vive en modelo/autoscaling.js. Los balanceadores (Attach to a new
// load balancer) se crean con llamar('crearGrupoDestino' / 'crearBalanceador')
// del módulo de ELB.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import * as modelo from '../modelo.js';
import {
  ami as amiDe,
  crearAccionProgramada,
  crearGrupoAutoScaling,
  crearPlantillaLanzamiento,
  crearPoliticaEscalado,
  crearVersionPlantilla,
  consultaPoliticaEscalado,
  definirVersionPredeterminada,
  editarGrupoAutoScaling,
  editarPoliticaEscalado,
  eliminarAccionProgramada,
  eliminarGrupoAutoScaling,
  eliminarPlantillaLanzamiento,
  eliminarPoliticaEscalado,
  eliminarVersionPlantilla,
  esperaInstanciasAsg,
  existeFuncion,
  grupoAutoScalingDe,
  habilitarPoliticaEscalado,
  ID_ZONA,
  llamar,
  METRICAS_SEGUIMIENTO,
  metricaAsg,
  metricaSeguimiento,
  plantillaLanzamientoDe,
  protegerInstanciasAsg,
  separarInstanciasAsg,
  simularCargaAsg,
  textoVersionPlantilla,
  versionDePlantilla,
  DURACION_AUTOSCALING
} from '../modelo.js';
import { asistenteLanzar } from './ec2-instancias.js';
import { enlaceRecurso, idParentesis, noExiste, opcionesVpc, panelVacio } from './comun.js';

const { h } = ui;

/* ================================================================ ayudas */

const plantillas = (cx) => cx.estado.autoscaling?.plantillas ?? [];
const grupos = (cx) => cx.estado.autoscaling?.grupos ?? [];
const plantillaDe = (cx, id) => plantillas(cx).find((p) => p.id === id) ?? null;
const grupoDe = (cx, nombre) => grupos(cx).find((g) => g.nombre === nombre) ?? null;
const rutaGrupo = (g) => `ec2/autoscaling/${encodeURIComponent(typeof g === 'string' ? g : g.nombre)}`;
/** Vuelve al detalle del grupo con una pestaña abierta (como AWS al crear una política). */
const irAPestanaGrupo = (cx, g, pestana) => {
  cx.memoria.pestanaGrupo = { nombre: typeof g === 'string' ? g : g.nombre, pestana };
  cx.ir(rutaGrupo(g));
};
const decodificar = (t) => {
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
};

/** «use1-az6 (us-east-1a)», como la columna Availability Zone de Auto Scaling. */
const zonaAsg = (az) => `${ID_ZONA[az] ?? az} (${az})`;

const MESES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** «2026 October 15, 02:11:21 AM -06:00», la fecha de Activity history. */
function fechaAws(texto) {
  if (!texto) return '–';
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return '–';
  const dos = (n) => String(Math.abs(n)).padStart(2, '0');
  const h12 = d.getHours() % 12 || 12;
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()} ${MESES[d.getMonth()]} ${d.getDate()}, ${dos(h12)}:${dos(d.getMinutes())}:${dos(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'} ${off >= 0 ? '+' : '-'}${dos(Math.trunc(off / 60))}:${dos(off % 60)}`;
}

/** El estado del grupo en la lista: Updating capacity, Deleting o nada. */
function estadoGrupo(g) {
  if (g.estado === 'borrando') return ui.estado('espera', 'Deleting');
  const activos = g.instancias.filter((m) => m.ciclo === 'Pending' || m.ciclo === 'InService');
  const cambiando = activos.length !== g.deseado || g.instancias.some((m) => m.ciclo === 'Pending' || m.ciclo === 'Terminating');
  return cambiando ? ui.estado('pendiente', 'Updating capacity') : '–';
}

function saludGrupo(g) {
  const total = g.instancias.length;
  if (!total) return '–';
  const sanas = g.instancias.filter((m) => m.salud === 'Healthy').length;
  return ui.estado(sanas === total ? 'exito' : 'aviso', `${sanas}/${total} Healthy`);
}

/** «plantilla-web | Version Default» con el enlace a la plantilla. */
function plantillaDeGrupo(cx, g) {
  const p = plantillaDe(cx, g.plantilla.id);
  return h('span', {}, p ? ui.enlace(p.nombre, `ec2/plantillas/${p.id}`, { cx }) : h('span', { class: 'cx-texto-sec' }, g.plantilla.id), ` | Version ${textoVersionPlantilla(g.plantilla.version)}`);
}

const nombreTg = (cx, arn) => (cx.estado.elb?.gruposDestino ?? []).find((t) => t.arn === arn)?.nombre ?? String(arn).replace(/^.*:targetgroup\/([^/]+)\/.*$/, '$1');
const enlaceTg = (cx, arn) => ui.enlace(nombreTg(cx, arn), `ec2/grupos-destino/${encodeURIComponent(nombreTg(cx, arn))}`, { cx });

const ETIQUETA_DISTRIBUCION = { 'balanced-best-effort': 'Balanced best effort', 'balanced-only': 'Balanced only' };

const ESTADOS_ACTIVIDAD = {
  Successful: ['exito', 'Successful'],
  InProgress: ['pendiente', 'In progress'],
  Failed: ['error', 'Failed'],
  Cancelled: ['detenido', 'Cancelled']
};

/** La hora pico vigente del grupo (la de CloudWatch si existe; si no, la del grupo). */
function horaPicoVigente(cx, g) {
  const ahora = Date.now();
  const cw = typeof modelo.cargaVigente === 'function' ? modelo.cargaVigente(cx.estado, { asg: g.nombre }, ahora) : null;
  if (cw) return { cpu: cw.cpu, hasta: cw.hasta };
  return g.horaPico && g.horaPico.hasta > ahora ? g.horaPico : null;
}

/* ===================================================== plantillas: lista */

/** El resumen de una versión (lo que comparten el detalle, el panel y el paso 1 del grupo). */
function paresVersion(cx, p, v, columnas = 3) {
  const d = v?.datos;
  if (!d) return h('p', { class: 'cx-texto-sec' }, 'This version no longer exists.');
  const a = amiDe(d.ami);
  const sub = d.subredId ? cx.estado.subredes.find((s) => s.id === d.subredId) : null;
  return ui.pares(
    [
      { etiqueta: 'AMI ID', valor: a?.id ?? d.ami },
      { etiqueta: 'Instance type', info: 'tipo-instancia', valor: d.tipo },
      { etiqueta: 'Key pair name', valor: d.llave ?? '–' },
      { etiqueta: 'Security groups', valor: d.gruposSeguridad.length ? h('div', {}, d.gruposSeguridad.map((id) => h('div', {}, enlaceRecurso(cx, id, { texto: idParentesis(cx.estado.gruposSeguridad.find((g) => g.id === id)) })))) : '–' },
      { etiqueta: 'Subnet', valor: sub ? enlaceRecurso(cx, sub.id, { conNombre: true }) : "Don't include in launch template" },
      { etiqueta: 'Storage (volumes)', valor: d.volumenes.map((x) => `${x.tamano} GiB ${x.tipo}`).join(', ') },
      { etiqueta: 'IAM instance profile', valor: d.perfilIam ?? '–' },
      { etiqueta: 'Resource tags', valor: d.etiquetas.length ? d.etiquetas.map((t) => `${t.llave}=${t.valor}`).join(', ') : '–' },
      { etiqueta: 'User data', info: 'user-data', valor: d.userData ? h('pre', { class: 'cx-log cx-escalar-ud' }, d.userData) : '–' }
    ],
    { columnas, cx }
  );
}

function borrarPlantilla(cx, p) {
  cx.confirmar({
    titulo: 'Delete launch template',
    textoBoton: 'Delete',
    palabra: 'Delete',
    contenido: [
      h('p', {}, 'Are you sure you want to delete the launch template ', h('b', {}, `${p.nombre} (${p.id})`), '? All versions of the launch template will be deleted.'),
      grupos(cx).some((g) => g.plantilla.id === p.id && g.estado === 'activo')
        ? ui.alerta({ tipo: 'aviso', contenido: 'An Auto Scaling group uses this launch template. After you delete it, the group can’t launch new instances.' })
        : null
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'EC2', accion: 'DeleteLaunchTemplate', error: 'Failed to delete launch template' }, (e) => eliminarPlantillaLanzamiento(e, p.id));
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: 'Delete launch template request succeeded' });
      cx.ir('ec2/plantillas');
    }
  });
}

function versionPredeterminada(cx, p) {
  const st = { version: String(p.versionDefault) };
  const m = cx.modal({
    titulo: 'Set default version',
    contenido: h(
      'div',
      { class: 'cx-form' },
      ui.pares([{ etiqueta: 'Launch template', valor: `${p.id} (${p.nombre})` }, { etiqueta: 'Current default version', valor: String(p.versionDefault) }], { columnas: 2 }),
      ui.campo({
        etiqueta: 'Template version',
        control: ui.selector({ opciones: p.versiones.map((v) => ({ valor: String(v.numero), etiqueta: `${v.numero}${v.descripcion ? ` (${v.descripcion})` : ''}` })), valor: st.version, alCambiar: (v) => (st.version = v) })
      })
    ),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Set as default version', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'EC2', accion: 'ModifyLaunchTemplate', error: 'Failed to set the default version' }, (e) => definirVersionPredeterminada(e, p.id, st.version));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Successfully set version ${st.version} as the default version of ${p.nombre}.` });
          }
        }
      })
    ]
  });
}

function menuPlantilla(cx, p) {
  return ui.menuBoton(
    'Actions',
    () => [
      { texto: 'Launch instance from template', desactivado: !p, alClic: () => cx.ir(`ec2/plantillas/${p.id}/lanzar`) },
      { texto: 'Modify template (Create new version)', escribe: true, desactivado: !p, alClic: () => cx.ir(`ec2/plantillas/${p.id}/modificar`) },
      { texto: 'Create Auto Scaling group', escribe: true, desactivado: !p, alClic: () => ((cx.memoria.plantillaParaGrupo = p.id), cx.ir('ec2/autoscaling/crear')) },
      { texto: 'Set default version', escribe: true, desactivado: !p, alClic: () => versionPredeterminada(cx, p) },
      { texto: 'Create Spot Fleet', desactivado: true },
      { texto: 'Manage tags', desactivado: true },
      '-',
      { texto: 'Delete template', escribe: true, desactivado: !p, alClic: () => borrarPlantilla(cx, p) }
    ],
    { desactivado: !p }
  );
}

function pestanasPlantilla(cx, p, st) {
  return ui.pestanas({
    activa: st.pestana,
    alCambiar: (x) => (st.pestana = x),
    pestanas: [
      {
        id: 'detalles',
        texto: 'Details',
        contenido: () => {
          const zona = ui.region(() => {
            const v = versionDePlantilla(p, st.version) ?? versionDePlantilla(p, '$Default');
            return ui.contenedor({
              titulo: 'Launch template version details',
              acciones: ui.selector({
                opciones: p.versiones.map((x) => ({ valor: String(x.numero), etiqueta: `${x.numero}${x.numero === p.versionDefault ? ' (Default)' : ''}`, descripcion: x.descripcion || undefined })),
                valor: String(v?.numero ?? p.versionDefault),
                compacto: true,
                etiquetaAccesible: 'Version',
                alCambiar: (x) => ((st.version = Number(x)), zona.repintar())
              }),
              cuerpo: h(
                'div',
                { class: 'cx-form' },
                ui.pares([{ etiqueta: 'Version', valor: String(v?.numero ?? '–') }, { etiqueta: 'Description', valor: v?.descripcion || '–' }, { etiqueta: 'Date created', valor: ui.fechaLarga(v?.creado) }, { etiqueta: 'Created by', valor: p.creadoPor }], { columnas: 4 }),
                paresVersion(cx, p, v)
              )
            });
          });
          return zona;
        }
      },
      {
        id: 'versiones',
        texto: 'Versions',
        contenido: () =>
          ui.tabla(cx, {
            titulo: 'Versions',
            variante: 'contenedor',
            filas: () => [...(plantillaDe(cx, p.id)?.versiones ?? [])].reverse(),
            clave: (v) => String(v.numero),
            seleccion: 'unica',
            filtro: false,
            columnas: [
              { titulo: 'Version', valor: (v) => `${v.numero}${v.numero === p.versionDefault ? ' (Default)' : ''}${v.numero === p.ultimaVersion ? ' (Latest)' : ''}` },
              { titulo: 'Description', valor: (v) => v.descripcion || '–' },
              { titulo: 'Instance type', valor: (v) => v.datos.tipo },
              { titulo: 'AMI ID', valor: (v) => amiDe(v.datos.ami)?.id ?? v.datos.ami },
              { titulo: 'Create time', valor: (v) => ui.fecha(v.creado) },
              { titulo: 'Created by', valor: () => p.creadoPor }
            ],
            acciones: (sel) => [
              ui.boton('Delete template version', {
                escribe: true,
                desactivado: sel.length !== 1,
                alClic: () =>
                  cx.confirmar({
                    titulo: 'Delete launch template version',
                    textoBoton: 'Delete',
                    palabra: 'Delete',
                    contenido: h('p', {}, `Are you sure you want to delete version ${sel[0].numero} of ${p.nombre}?`),
                    aceptar: () => {
                      const r = cx.hacer({ servicio: 'EC2', accion: 'DeleteLaunchTemplateVersions', error: 'Failed to delete launch template version' }, (e) => eliminarVersionPlantilla(e, p.id, sel[0].numero));
                      if (!r.ok) return false;
                      cx.flash({ tipo: 'exito', texto: `Successfully deleted version ${sel[0].numero} of ${p.nombre}.` });
                    }
                  })
              })
            ]
          })
      },
      {
        id: 'etiquetas',
        texto: 'Template tags',
        contenido: () =>
          ui.contenedor({
            titulo: 'Template tags',
            contador: p.etiquetas.length,
            cuerpo: p.etiquetas.length
              ? ui.pares(p.etiquetas.map((t) => ({ etiqueta: t.llave, valor: t.valor || '–' })), { columnas: 3 })
              : h('div', { class: 'cx-tabla__vacia' }, h('b', {}, 'No tags'), h('div', {}, 'This launch template has no tags.'))
          })
      }
    ]
  });
}

function listaPlantillas(cx) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Launch templates' }]);
  const st = { pestana: 'detalles', version: null };
  const t = ui.tabla(cx, {
    titulo: 'Launch templates',
    info: 'plantilla-lanzamiento',
    filas: () => plantillas(cx),
    clave: (p) => p.id,
    seleccion: 'unica',
    filtro: 'Search',
    columnas: [
      { titulo: 'Launch template ID', valor: (p) => ui.enlace(p.id, `ec2/plantillas/${p.id}`, { cx }) },
      { titulo: 'Launch template name', valor: (p) => p.nombre },
      { titulo: 'Default version', valor: (p) => String(p.versionDefault) },
      { titulo: 'Latest version', valor: (p) => String(p.ultimaVersion) },
      { titulo: 'Create time', valor: (p) => ui.fecha(p.creado) },
      { titulo: 'Created by', valor: (p) => p.creadoPor },
      { titulo: 'Managed', valor: () => 'false' },
      { titulo: 'Operator', valor: () => '–' }
    ],
    acciones: (sel) => [menuPlantilla(cx, sel[0] ?? null), ui.boton('Create launch template', { variante: 'primario', alClic: () => cx.ir('ec2/plantillas/crear') })],
    vacio: { titulo: 'No launch templates', texto: 'You do not have any launch templates in this region', accion: ui.boton('Create launch template', { escribe: true, alClic: () => cx.ir('ec2/plantillas/crear') }) },
    alSeleccionar: () => ((st.version = null), panel.repintar())
  });
  const panel = cx.vivo(() => {
    const sel = t.seleccion();
    if (sel.length !== 1) return panelVacio('Select a launch template');
    const p = sel[0];
    return ui.panelInferior({ titulo: `${p.id} (${p.nombre})`, contenido: pestanasPlantilla(cx, p, st) });
  });
  return h('div', { class: 'cx-pagina' }, t, panel);
}

function detallePlantilla(cx, { id }) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Launch templates', ruta: 'ec2/plantillas' }, { texto: id }]);
  const p = plantillaDe(cx, id);
  if (!p) return noExiste(cx, 'Launch template', id, 'ec2/plantillas');
  const st = { pestana: 'detalles', version: null };
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: `${p.id} (${p.nombre})`, info: 'plantilla-lanzamiento', cx, acciones: [ui.botonRefrescar(() => cx.refrescar()), menuPlantilla(cx, p)] }),
    cx.vivo(() => {
      const x = plantillaDe(cx, id);
      if (!x) return noExiste(cx, 'Launch template', id, 'ec2/plantillas');
      return ui.contenedor({
        titulo: 'Launch template details',
        info: 'version-plantilla',
        cx,
        cuerpo: ui.pares(
          [
            { etiqueta: 'Launch template ID', valor: ui.copiable(x.id) },
            { etiqueta: 'Launch template name', valor: x.nombre },
            { etiqueta: 'Default version', valor: String(x.versionDefault) },
            { etiqueta: 'Latest version', valor: String(x.ultimaVersion) },
            { etiqueta: 'Owner', valor: x.creadoPor },
            { etiqueta: 'Auto Scaling guidance', info: 'guia-autoscaling', valor: x.guia ? 'Enabled' : 'Disabled' }
          ],
          { columnas: 3, cx }
        )
      });
    }),
    pestanasPlantilla(cx, p, st)
  );
}

/* ================================================ plantillas: crear y modificar */

/** La sección de arriba de Create launch template («Launch template name and description»). */
function seccionNombrePlantilla(cx, f, { modificar, plantilla }) {
  const zona = ui.region(() =>
    ui.contenedor({
      titulo: modificar ? 'Launch template name and version description' : 'Launch template name and description',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        modificar
          ? ui.pares([{ etiqueta: 'Launch template name', valor: `${plantilla.nombre} (${plantilla.id})` }], { columnas: 1 })
          : ui.campo({
              etiqueta: 'Launch template name',
              requerido: true,
              info: 'plantilla-lanzamiento',
              cx,
              control: ui.entrada({ valor: f.nombre, placeholder: 'MyTemplate', alCambiar: (v) => (f.nombre = v) }),
              restriccion: 'Must be unique to this account. Max 128 chars. No spaces or special characters like ‘&’, ‘*’, ‘@’.',
              error: f.errores.nombre
            }),
        ui.campo({
          etiqueta: 'Template version description',
          control: ui.entrada({ valor: f.descripcion, placeholder: 'A prod webserver for MyApp', alCambiar: (v) => (f.descripcion = v) }),
          restriccion: 'Max 255 chars',
          error: f.errores.descripcion
        }),
        ui.campo({
          etiqueta: 'Auto Scaling guidance',
          info: 'guia-autoscaling',
          cx,
          descripcion: 'Select this if you intend to use this template with EC2 Auto Scaling',
          control: ui.casilla({ etiqueta: 'Provide guidance to help me set up a template that I can use with EC2 Auto Scaling', marcada: f.guia, alCambiar: (v) => ((f.guia = v), f.alCambiarGuia?.()) })
        }),
        modificar
          ? ui.campo({
              etiqueta: 'Source template version',
              descripcion: 'The new version starts with the settings of this version. Change them below.',
              control: ui.selector({
                opciones: plantilla.versiones.map((v) => ({ valor: String(v.numero), etiqueta: `${v.numero}${v.numero === plantilla.versionDefault ? ' (Default)' : ''}`, descripcion: v.descripcion || undefined })),
                valor: String(f.origen),
                alCambiar: (v) => f.alCambiarOrigen?.(Number(v))
              })
            })
          : [
              ui.expandible({ titulo: 'Template tags', contenido: h('div', { style: { paddingTop: '10px' } }, ui.editorEtiquetas({ filas: f.etiquetas })) }),
              ui.expandible({
                titulo: 'Source template',
                contenido: h(
                  'div',
                  { class: 'cx-form', style: { paddingTop: '10px' } },
                  ui.campo({
                    etiqueta: 'Source template',
                    descripcion: 'Start from the settings of an existing launch template.',
                    control: ui.selector({
                      opciones: plantillas(cx).map((p) => ({ valor: p.id, etiqueta: p.nombre, descripcion: p.id })),
                      valor: null,
                      placeholder: 'Select a launch template',
                      vacio: 'No launch templates',
                      alCambiar: (v) => f.alCambiarOrigen?.(v)
                    })
                  })
                )
              })
            ]
      )
    })
  );
  return zona;
}

function crearPlantillaPagina(cx) {
  // «Source template»: el asistente vuelve a abrirse con los datos de otra plantilla.
  const fuente = cx.memoria.fuentePlantilla ? plantillaDe(cx, cx.memoria.fuentePlantilla) : null;
  cx.memoria.fuentePlantilla = null;
  const f = { nombre: '', descripcion: '', guia: false, etiquetas: [], errores: {} };
  const arriba = seccionNombrePlantilla(cx, f, { modificar: false });
  f.alCambiarGuia = () => cx.refrescar();
  f.alCambiarOrigen = (id) => {
    cx.memoria.fuentePlantilla = id;
    cx.ir('ec2/plantillas/crear');
  };
  return asistenteLanzar(cx, {
    tipo: 'plantilla',
    inicial: fuente ? versionDePlantilla(fuente, '$Default')?.datos : undefined,
    titulo: 'Create launch template',
    descripcion: 'Creating a launch template allows you to create a saved instance configuration that can be reused, shared and launched at a later time. Templates can have multiple versions.',
    migas: [{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Launch templates', ruta: 'ec2/plantillas' }, { texto: 'Create launch template' }],
    arriba,
    guia: () => f.guia,
    textoEnviar: 'Create launch template',
    cancelar: 'ec2/plantillas',
    validar: () => {
      f.errores = {};
      if (!f.nombre.trim()) f.errores.nombre = 'Launch template name is required.';
      else if (!/^[a-zA-Z0-9()./_-]{3,128}$/.test(f.nombre.trim())) f.errores.nombre = 'Must be 3 to 128 characters: letters, numbers and ( ) . / _ - only, without spaces.';
      if (f.descripcion.length > 255) f.errores.descripcion = 'Max 255 chars';
      arriba.repintar();
      return !Object.values(f.errores).some(Boolean);
    },
    alEnviar: ({ datos, nuevoGrupo }) => {
      const r = cx.hacer(
        { servicio: 'EC2', accion: 'CreateLaunchTemplate', error: 'Failed to create launch template' },
        (e) => crearPlantillaLanzamiento(e, { nombre: f.nombre.trim(), descripcion: f.descripcion, guia: f.guia, datos, nuevoGrupo, etiquetas: f.etiquetas }),
        { atomico: true }
      );
      if (r.ok) {
        cx.memoria.plantillaCreada = { id: r.valor.id, version: 1, nueva: true };
        cx.ir('ec2/plantillas/creada');
      }
    }
  });
}

function modificarPlantilla(cx, { id }) {
  const p = plantillaDe(cx, id);
  if (!p) {
    cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Launch templates', ruta: 'ec2/plantillas' }, { texto: id }]);
    return noExiste(cx, 'Launch template', id, 'ec2/plantillas');
  }
  const origen = cx.memoria.origenVersion?.id === id ? cx.memoria.origenVersion.numero : p.versionDefault;
  cx.memoria.origenVersion = null;
  const f = { descripcion: '', guia: p.guia, origen, etiquetas: [], errores: {} };
  const arriba = seccionNombrePlantilla(cx, f, { modificar: true, plantilla: p });
  f.alCambiarGuia = () => cx.refrescar();
  f.alCambiarOrigen = (n) => {
    cx.memoria.origenVersion = { id, numero: n };
    cx.ir(`ec2/plantillas/${id}/modificar`);
  };
  return asistenteLanzar(cx, {
    tipo: 'plantilla',
    inicial: versionDePlantilla(p, origen)?.datos,
    titulo: 'Modify template (Create new version)',
    descripcion: 'Create a new version of this launch template. The new version starts with the settings of the source version.',
    migas: [{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Launch templates', ruta: 'ec2/plantillas' }, { texto: p.id, ruta: `ec2/plantillas/${p.id}` }, { texto: 'Modify template (Create new version)' }],
    arriba,
    guia: () => f.guia,
    textoEnviar: 'Create template version',
    cancelar: `ec2/plantillas/${p.id}`,
    validar: () => {
      f.errores = {};
      if (f.descripcion.length > 255) f.errores.descripcion = 'Max 255 chars';
      arriba.repintar();
      return !f.errores.descripcion;
    },
    alEnviar: ({ datos, nuevoGrupo }) => {
      const r = cx.hacer(
        { servicio: 'EC2', accion: 'CreateLaunchTemplateVersion', error: 'Failed to create launch template version' },
        (e) => crearVersionPlantilla(e, p.id, { descripcion: f.descripcion, guia: f.guia, datos, nuevoGrupo }),
        { atomico: true }
      );
      if (r.ok) {
        cx.memoria.plantillaCreada = { id: p.id, version: r.valor.numero, nueva: false };
        cx.ir('ec2/plantillas/creada');
      }
    }
  });
}

function plantillaCreada(cx) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Launch templates', ruta: 'ec2/plantillas' }, { texto: 'Create launch template' }]);
  const datos = cx.memoria.plantillaCreada;
  const p = datos ? plantillaDe(cx, datos.id) : null;
  if (!p) return listaPlantillas(cx);
  const crearGrupo = () => {
    cx.memoria.plantillaParaGrupo = p.id;
    cx.ir('ec2/autoscaling/crear');
  };
  return h(
    'div',
    { class: 'cx-pagina' },
    h(
      'div',
      { class: 'cx-flash cx-flash--exito' },
      ui.icono('status-positive'),
      h(
        'div',
        { class: 'cx-flash__cuerpo' },
        h('div', { class: 'cx-flash__titulo' }, 'Success'),
        h('div', {}, datos.nueva ? 'Successfully created ' : 'Successfully modified ', ui.enlace(`${p.nombre}(${p.id})`, `ec2/plantillas/${p.id}`, { cx }), datos.nueva ? '.' : `. Version ${datos.version} was created.`)
      )
    ),
    ui.expandible({ titulo: 'Actions log', fuerte: true, contenido: h('ul', { class: 'cx-pasos' }, (datos.nueva ? ['Create launch template'] : ['Create launch template version']).map((x) => h('li', {}, ui.estado('exito', 'Succeeded'), x))) }),
    ui.contenedor({
      titulo: 'Next Steps',
      cuerpo: h(
        'div',
        { class: 'cx-escalar-pasos' },
        h('div', {}, h('b', {}, 'Launch an instance'), h('p', { class: 'cx-texto-sec' }, 'With On-Demand Instances, you pay for compute capacity by the second (for Linux, with a minimum of 60 seconds) or by the hour (for all other operating systems) with no long-term commitments or upfront payments. Launch an On-Demand Instance from your launch template.'), ui.enlace('Launch instance from this template', `ec2/plantillas/${p.id}/lanzar`, { cx })),
        h(
          'div',
          {},
          h('b', {}, 'Create an Auto Scaling group from your template'),
          h('p', { class: 'cx-texto-sec' }, 'Amazon EC2 Auto Scaling helps you maintain application availability and allows you to scale your Amazon EC2 capacity up or down automatically according to conditions you define. You can use Auto Scaling to help ensure that you are running your desired number of Amazon EC2 instances during demand spikes to maintain performance and decrease capacity during lulls to reduce costs.'),
          ui.enlace('Create Auto Scaling group', crearGrupo)
        ),
        h('div', {}, h('b', {}, 'Create Spot Fleet'), h('p', { class: 'cx-texto-sec' }, 'A Spot Instance is an unused EC2 instance that is available for less than the On-Demand price. Spot Instances are well-suited for data-analysis, batch jobs, background processing, and optional tasks.'), h('span', { class: 'cx-enlace cx-enlace--apagado' }, 'Create Spot Fleet'))
      )
    }),
    h('div', { class: 'cx-pie-form' }, ui.boton('View launch templates', { variante: 'primario', escribe: false, alClic: () => cx.ir('ec2/plantillas') }))
  );
}

function lanzarDesdePlantilla(cx, { id }) {
  const p = plantillaDe(cx, id);
  if (!p) {
    cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Launch templates', ruta: 'ec2/plantillas' }, { texto: id }]);
    return noExiste(cx, 'Launch template', id, 'ec2/plantillas');
  }
  const numero = cx.memoria.versionLanzar?.id === id ? cx.memoria.versionLanzar.numero : p.versionDefault;
  cx.memoria.versionLanzar = null;
  const v = versionDePlantilla(p, numero) ?? versionDePlantilla(p, '$Default');
  const arriba = ui.contenedor({
    titulo: 'Launch template',
    info: 'plantilla-lanzamiento',
    cx,
    descripcion: 'The instance starts with the settings of this launch template version. You can override them below.',
    cuerpo: h(
      'div',
      { class: 'cx-fila-campos' },
      ui.campo({ etiqueta: 'Source template', control: ui.selector({ opciones: plantillas(cx).map((x) => ({ valor: x.id, etiqueta: x.nombre, descripcion: x.id })), valor: p.id, alCambiar: (x) => cx.ir(`ec2/plantillas/${x}/lanzar`) }) }),
      ui.campo({
        etiqueta: 'Source template version',
        control: ui.selector({
          opciones: p.versiones.map((x) => ({ valor: String(x.numero), etiqueta: `${x.numero}${x.numero === p.versionDefault ? ' (Default)' : ''}`, descripcion: x.descripcion || undefined })),
          valor: String(v.numero),
          alCambiar: (x) => {
            cx.memoria.versionLanzar = { id, numero: Number(x) };
            cx.ir(`ec2/plantillas/${id}/lanzar`);
          }
        })
      })
    )
  });
  return asistenteLanzar(cx, {
    tipo: 'desdePlantilla',
    inicial: v.datos,
    titulo: 'Launch instance from template',
    descripcion: 'Launch an instance using the settings saved in a launch template.',
    migas: [{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Launch templates', ruta: 'ec2/plantillas' }, { texto: p.id, ruta: `ec2/plantillas/${p.id}` }, { texto: 'Launch instance from template' }],
    arriba,
    cancelar: `ec2/plantillas/${p.id}`
  });
}

/* ======================================================= grupos: la lista */

function borrarGrupos(cx, sel) {
  cx.confirmar({
    titulo: 'Delete Auto Scaling group',
    textoBoton: 'Delete',
    palabra: 'delete',
    ancho: 'grande',
    contenido: h(
      'table',
      { class: 'cx-tabla__tabla' },
      h('thead', {}, h('tr', {}, ['Name', 'Deletion protection', 'Force delete resources', 'Behavior'].map((t) => h('th', {}, h('span', { class: 'cx-tabla__orden' }, t))))),
      h(
        'tbody',
        {},
        sel.map((g) => h('tr', {}, h('td', {}, g.nombre), h('td', {}, 'None (default)'), h('td', {}, 'Enabled'), h('td', {}, ui.estado('info', g.instancias.length ? 'Deletes ASG and resources' : 'Deletes ASG'))))
      )
    ),
    aceptar: () => {
      const r = cx.hacer({ servicio: 'AutoScaling', accion: 'DeleteAutoScalingGroup', error: 'Failed to delete Auto Scaling group' }, (e) => sel.forEach((g) => eliminarGrupoAutoScaling(e, g.nombre)), { atomico: true });
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Deleting Auto Scaling group ${sel.map((g) => g.nombre).join(', ')}. It will disappear when all its instances are terminated.` });
      if (cx.ruta !== 'ec2/autoscaling') cx.ir('ec2/autoscaling');
    }
  });
}

function listaGrupos(cx) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Auto Scaling groups' }]);
  const t = ui.tabla(cx, {
    titulo: 'Auto Scaling groups',
    info: 'grupo-autoscaling',
    filas: () => grupos(cx),
    clave: (g) => g.nombre,
    seleccion: 'multiple',
    filtro: 'Search your Auto Scaling groups',
    ultimaActualizacion: true,
    columnas: [
      { titulo: 'Name', valor: (g) => ui.enlace(g.nombre, rutaGrupo(g), { cx }) },
      { titulo: 'Status', valor: (g) => estadoGrupo(g), texto: (g) => (g.estado === 'borrando' ? 'Deleting' : '') },
      { titulo: 'Launch template/configuration', valor: (g) => plantillaDeGrupo(cx, g) },
      { titulo: 'Instances', valor: (g) => String(g.instancias.length) },
      { titulo: 'Instance health', valor: (g) => saludGrupo(g) },
      { titulo: 'Desired capacity', valor: (g) => String(g.deseado) },
      { titulo: 'Min', valor: (g) => String(g.min) },
      { titulo: 'Max', valor: (g) => String(g.max) },
      {
        titulo: 'Availability Zones',
        valor: (g) => {
          const zonas = [...new Set(g.subredes.map((id) => cx.estado.subredes.find((s) => s.id === id)?.az).filter(Boolean))];
          return zonas.length === 1 ? zonas[0] : `${zonas.length} Availability Zones`;
        }
      },
      { titulo: 'Creation time', valor: (g) => ui.fechaLarga(g.creado) }
    ],
    acciones: (sel) => [
      ui.boton('Launch configurations', { desactivado: true }),
      ui.boton('Launch templates', { iconoDerecha: 'external', alClic: () => cx.ir('ec2/plantillas') }),
      ui.menuBoton(
        'Actions',
        () => [
          { texto: 'Edit', escribe: true, desactivado: sel.length !== 1 || sel[0].estado !== 'activo', alClic: () => cx.ir(`${rutaGrupo(sel[0])}/editar`) },
          { texto: 'Delete', escribe: true, desactivado: !sel.length || sel.some((g) => g.estado !== 'activo'), alClic: () => borrarGrupos(cx, sel) },
          '-',
          { texto: 'Start instance refresh', desactivado: true },
          { texto: 'Cancel instance refresh', desactivado: true },
          { texto: 'Add or edit warm pool', desactivado: true }
        ],
        { desactivado: !sel.length }
      ),
      ui.boton('Create Auto Scaling group', { variante: 'primario', alClic: () => cx.ir('ec2/autoscaling/crear') })
    ],
    vacio: {
      titulo: 'No Auto Scaling groups',
      texto: 'You don’t have any Auto Scaling groups in this region. An Auto Scaling group keeps the number of instances you choose running and replaces the ones that fail.',
      accion: ui.boton('Create Auto Scaling group', { escribe: true, alClic: () => cx.ir('ec2/autoscaling/crear') })
    }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

/* ============================================== grupos: el asistente (7 pasos) */

const PASOS = ['Choose launch template', 'Choose instance launch options', 'Integrate with other services', 'Configure group size and scaling', 'Add notifications', 'Add tags', 'Review'];
const OPCIONALES = new Set([2, 3, 4, 5]);

/** El marco del asistente: los pasos a la izquierda (cx-asis, el mismo de IAM). */
function marcoAsistente(cx, f, { titulo, descripcion, info, cuerpo, pie, irA }) {
  return h(
    'div',
    { class: 'cx-asis' },
    h(
      'nav',
      { class: 'cx-asis__pasos', 'aria-label': 'Steps' },
      h(
        'ol',
        {},
        PASOS.map((p, i) =>
          h(
            'li',
            { class: ['cx-asis__paso', i === f.paso && 'cx-asis__paso--actual', i > f.paso && 'cx-asis__paso--futuro'], 'aria-current': i === f.paso ? 'step' : undefined },
            h('small', {}, `Step ${i + 1}${OPCIONALES.has(i) ? ' - optional' : ''}`),
            i < f.paso ? h('a', { href: '#', class: 'cx-enlace', onclick: (ev) => (ev.preventDefault(), irA(i)) }, p) : h('span', {}, p)
          )
        )
      )
    ),
    h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo, info, cx, descripcion }), cuerpo, pie)
  );
}

function crearGrupoPagina(cx) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Auto Scaling groups', ruta: 'ec2/autoscaling' }, { texto: 'Create Auto Scaling group' }]);
  const e = cx.estado;
  const vpcDef = e.vpcs.find((v) => v.porDefecto) ?? e.vpcs[0];
  const preelegida = cx.memoria.plantillaParaGrupo && plantillaDe(cx, cx.memoria.plantillaParaGrupo) ? cx.memoria.plantillaParaGrupo : null;
  cx.memoria.plantillaParaGrupo = null;
  const f = {
    paso: 0,
    nombre: '',
    plantillaId: preelegida,
    version: '$Default',
    vpcId: vpcDef?.id ?? null,
    subredes: [],
    distribucion: 'balanced-best-effort',
    balanceo: 'ninguno',
    tipoTg: 'tg',
    gruposDestino: [],
    nuevo: { tipo: 'application', nombre: '', esquema: 'internet-facing', puerto: '80', tgNombre: '', nombreTocado: false },
    saludElb: false,
    saludEbs: false,
    gracia: '300',
    deseado: '1',
    min: '1',
    max: '1',
    escalado: 'ninguno',
    politica: { nombre: 'Target Tracking Policy', metrica: 'ASGAverageCPUUtilization', grupoDestino: null, objetivo: '50', calentamiento: '300', sinReducir: false },
    mantenimiento: 'none',
    proteccion: false,
    monitoreo: false,
    notificaciones: [],
    etiquetas: [],
    errores: {}
  };

  const plantilla = () => plantillaDe(cx, f.plantillaId);
  const subredesVpc = () => e.subredes.filter((s) => s.vpcId === f.vpcId);
  const tgsVpc = () => (e.elb?.gruposDestino ?? []).filter((t) => t.vpcId === f.vpcId && (t.tipoDestino ?? 'instance') === 'instance');
  const puedeCrearLb = existeFuncion('crearBalanceador') && existeFuncion('crearGrupoDestino');
  // La zona se arma al final, cuando ya existen todas las funciones de los pasos.
  let zona = null;

  const irA = (i) => {
    f.paso = i;
    zona.repintar();
    cx.raiz.querySelector('.cx-principal, main')?.scrollTo?.(0, 0);
  };

  /** Lo que la consola revisa antes de dejar pasar de un paso al siguiente. */
  function revisar(paso) {
    f.errores = {};
    if (paso === 0) {
      if (!f.nombre.trim()) f.errores.nombre = 'Auto Scaling group name is required.';
      else if (f.nombre.trim().length > 255) f.errores.nombre = 'Must be no more than 255 characters.';
      if (!plantilla()) f.errores.plantilla = 'Select a launch template.';
    }
    if (paso === 1 && !f.subredes.length) f.errores.subredes = 'Select at least one Availability Zone and subnet.';
    if (paso === 2) {
      if (f.balanceo === 'existente' && !f.gruposDestino.length) f.errores.tgs = 'Select at least one target group.';
      if (f.balanceo === 'nuevo') {
        if (!f.nuevo.nombre.trim()) f.errores.lbNombre = 'Load balancer name is required.';
        if (!f.nuevo.tgExistente && !f.nuevo.tgNombre.trim()) f.errores.tgNombre = 'Target group name is required.';
      }
      if (!/^\d+$/.test(String(f.gracia).trim())) f.errores.gracia = 'Enter a whole number of seconds.';
    }
    if (paso === 3) {
      for (const k of ['deseado', 'min', 'max']) if (!/^\d+$/.test(String(f[k]).trim())) f.errores[k] = 'Enter a whole number.';
      if (f.escalado === 'seguimiento') {
        if (!f.politica.nombre.trim()) f.errores.polNombre = 'Scaling policy name is required.';
        if (!(Number(f.politica.objetivo) > 0)) f.errores.objetivo = 'Target value must be greater than 0.';
      }
    }
    return !Object.values(f.errores).some(Boolean);
  }

  const siguiente = () => {
    if (!revisar(f.paso)) return zona.repintar();
    irA(Math.min(6, f.paso + 1));
  };

  function pie() {
    return h(
      'div',
      { class: 'cx-pie-form' },
      ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir('ec2/autoscaling') }),
      f.paso > 0 && f.paso < 6 ? ui.boton('Skip to review', { alClic: () => (revisar(f.paso) ? irA(6) : zona.repintar()) }) : null,
      f.paso > 0 ? ui.boton('Previous', { alClic: () => irA(f.paso - 1) }) : null,
      f.paso < 6 ? ui.boton('Next', { variante: 'primario', escribe: false, alClic: siguiente }) : ui.boton('Create Auto Scaling group', { variante: 'primario', alClic: crear })
    );
  }

  /* ---------- paso 1 */
  function paso1() {
    const p = plantilla();
    const v = p ? versionDePlantilla(p, f.version) : null;
    const opcionesVersion = p
      ? [
          { valor: '$Default', etiqueta: `Default (${p.versionDefault})` },
          { valor: '$Latest', etiqueta: `Latest (${p.ultimaVersion})` },
          ...[...p.versiones].reverse().map((x) => ({ valor: String(x.numero), etiqueta: String(x.numero), descripcion: x.descripcion || undefined }))
        ]
      : [];
    return [
      ui.contenedor({
        titulo: 'Name',
        cuerpo: ui.campo({
          etiqueta: 'Auto Scaling group name',
          info: 'grupo-autoscaling',
          cx,
          descripcion: 'Enter a name to identify the group.',
          control: ui.entrada({ valor: f.nombre, alCambiar: (x) => (f.nombre = x) }),
          restriccion: 'Must be unique to this account in the current Region and no more than 255 characters.',
          error: f.errores.nombre
        })
      }),
      ui.contenedor({
        titulo: 'Launch template',
        info: 'plantilla-lanzamiento',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.alerta({ tipo: 'info', contenido: 'The EC2 console only supports creating Auto Scaling groups with launch templates. Launch configurations are no longer supported for new accounts.' }),
          ui.campo({
            etiqueta: 'Launch template',
            descripcion: 'Choose a launch template that contains the instance-level settings, such as the Amazon Machine Image (AMI), instance type, key pair, and security groups.',
            control: ui.selector({
              opciones: plantillas(cx).map((x) => ({ valor: x.id, etiqueta: x.nombre, descripcion: x.id })),
              valor: f.plantillaId,
              filtrar: true,
              placeholder: 'Select a launch template',
              vacio: 'No launch templates. Create one first.',
              alCambiar: (x) => ((f.plantillaId = x), (f.version = '$Default'), zona.repintar())
            }),
            restriccion: ui.enlace('Create a launch template', () => cx.ir('ec2/plantillas/crear'), { externo: true }),
            error: f.errores.plantilla
          }),
          p
            ? ui.campo({
                etiqueta: 'Version',
                info: 'version-plantilla',
                cx,
                control: h('div', { style: { maxWidth: '260px' } }, ui.selector({ opciones: opcionesVersion, valor: f.version, alCambiar: (x) => ((f.version = x), zona.repintar()) })),
                restriccion: ui.enlace('Create a launch template version', () => cx.ir(`ec2/plantillas/${p.id}/modificar`), { externo: true })
              })
            : null,
          p && v
            ? ui.pares(
                [
                  { etiqueta: 'Description', valor: v.descripcion || '–' },
                  { etiqueta: 'Launch template', valor: h('div', {}, ui.enlace(p.nombre, `ec2/plantillas/${p.id}`, { cx }), h('div', { class: 'cx-texto-sec' }, p.id)) },
                  { etiqueta: 'Instance type', valor: v.datos.tipo },
                  { etiqueta: 'AMI ID', valor: amiDe(v.datos.ami)?.id ?? v.datos.ami },
                  { etiqueta: 'Security groups', valor: '–' },
                  { etiqueta: 'Request Spot Instances', valor: 'No' },
                  { etiqueta: 'Key pair name', valor: v.datos.llave ?? '–' },
                  { etiqueta: 'Security group IDs', valor: v.datos.gruposSeguridad.length ? h('div', {}, v.datos.gruposSeguridad.map((id) => h('div', {}, enlaceRecurso(cx, id)))) : '–' }
                ],
                { columnas: 3 }
              )
            : null,
          p && v?.datos.subredId ? ui.alerta({ tipo: 'aviso', contenido: 'This launch template includes a subnet. The Auto Scaling group uses the subnets that you choose in the next step instead.' }) : null
        )
      })
    ];
  }

  /* ---------- paso 2 */
  function paso2() {
    const v = plantilla() ? versionDePlantilla(plantilla(), f.version) : null;
    return [
      ui.contenedor({
        titulo: 'Instance type requirements',
        descripcion: 'You can keep the same instance attributes or instance type from your launch template, or you can choose to override the launch template by specifying different instance attributes or manually adding instance types.',
        acciones: ui.boton('Override launch template', { desactivado: true }),
        cuerpo: ui.pares([{ etiqueta: 'Launch template', valor: plantilla()?.nombre ?? '–' }, { etiqueta: 'Version', valor: textoVersionPlantilla(f.version) }, { etiqueta: 'Instance type', valor: v?.datos.tipo ?? '–' }], { columnas: 3 })
      }),
      ui.contenedor({
        titulo: 'Network',
        info: 'zonas-asg',
        cx,
        descripcion: 'For most applications, you can use multiple Availability Zones and let EC2 Auto Scaling balance your instances across the zones. The default VPC and default subnets are suitable for getting started quickly.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'VPC',
            info: 'vpc',
            cx,
            descripcion: 'Choose the VPC that defines the virtual network for your Auto Scaling group.',
            control: ui.selector({ opciones: opcionesVpc(e), valor: f.vpcId, filtrar: true, alCambiar: (x) => ((f.vpcId = x), (f.subredes = []), (f.gruposDestino = []), zona.repintar()) }),
            restriccion: ui.enlace('Create a VPC', () => cx.ir('vpc/vpcs/crear'), { externo: true })
          }),
          ui.campo({
            etiqueta: 'Availability Zones and subnets',
            descripcion: 'Define which Availability Zones and subnets your Auto Scaling group can use in the chosen VPC.',
            control: ui.selector({
              multiple: true,
              valores: f.subredes,
              filtrar: true,
              placeholder: 'Select Availability Zones and subnets',
              vacio: 'This VPC has no subnets',
              opciones: subredesVpc().map((s) => ({ valor: s.id, etiqueta: `${zonaAsg(s.az)} | ${s.id}${s.nombre ? ` (${s.nombre})` : ''}`, descripcion: `${s.cidr}${s.porDefecto ? '  Default' : ''}` })),
              alCambiar: (x) => ((f.subredes = x), (f.errores.subredes = null))
            }),
            restriccion: ui.enlace('Create a subnet', () => cx.ir('vpc/subredes/crear'), { externo: true }),
            error: f.errores.subredes
          }),
          ui.campo({
            etiqueta: 'Availability Zone distribution',
            info: 'zonas-asg',
            cx,
            descripcion: 'Auto Scaling automatically balances instances across Availability Zones. If launch failures occur in a zone, select a strategy.',
            control: ui.tarjetas({
              columnas: 3,
              valor: f.distribucion,
              opciones: [
                { valor: 'balanced-best-effort', etiqueta: 'Balanced best effort', descripcion: 'If launches fail in one Availability Zone, Auto Scaling will attempt to launch in another healthy Availability Zone.' },
                { valor: 'balanced-only', etiqueta: 'Balanced only', descripcion: 'If launches fail in one Availability Zone, Auto Scaling will continue to attempt to launch in the unhealthy Availability Zone to preserve balanced distribution.' },
                { valor: 'reservas', etiqueta: 'Reservations Then Balanced', descripcion: 'Prioritizes launching into Capacity Reservations, distributing across AZs with available reservations.', desactivado: true }
              ],
              alCambiar: (x) => (f.distribucion = x)
            })
          })
        )
      })
    ];
  }

  /* ---------- paso 3 */
  function paso3() {
    const zonasElegidas = new Set(f.subredes.map((id) => e.subredes.find((s) => s.id === id)?.az));
    const lb = f.nuevo;
    if (!lb.nombreTocado) {
      lb.nombre = `${f.nombre.trim() || 'asg'}-1`.slice(0, 32);
      lb.tgNombre = `${f.nombre.trim() || 'asg'}-1`.slice(0, 32);
    }
    const tocar = () => (lb.nombreTocado = true);
    return [
      ui.contenedor({
        titulo: 'Load balancing',
        info: 'balanceo-asg',
        cx,
        descripcion: 'Use the options below to attach your Auto Scaling group to an existing load balancer, or to a new load balancer that you define.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Select Load balancing options',
            control: ui.tarjetas({
              columnas: 3,
              valor: f.balanceo,
              opciones: [
                { valor: 'ninguno', etiqueta: 'No load balancer', descripcion: 'Traffic to your Auto Scaling group will not be fronted by a load balancer.' },
                { valor: 'existente', etiqueta: 'Attach to an existing load balancer', descripcion: 'Choose from your existing load balancers.' },
                { valor: 'nuevo', etiqueta: 'Attach to a new load balancer', descripcion: puedeCrearLb ? 'Quickly create a basic load balancer to attach to your Auto Scaling group.' : 'Load balancers aren’t available in this simulator yet.', desactivado: !puedeCrearLb }
              ],
              alCambiar: (x) => ((f.balanceo = x), (f.saludElb = x !== 'ninguno' ? f.saludElb : false), zona.repintar())
            })
          }),
          f.balanceo === 'existente'
            ? [
                ui.campo({
                  etiqueta: 'Attach to an existing load balancer',
                  descripcion: 'Select the load balancers that you want to attach to your Auto Scaling group.',
                  control: ui.radios({
                    valor: 'tg',
                    opciones: [
                      { valor: 'tg', etiqueta: 'Choose from your load balancer target groups', descripcion: 'This option allows you to attach Application, Network, or Gateway Load Balancers.' },
                      { valor: 'clb', etiqueta: 'Choose from Classic Load Balancers', desactivado: true }
                    ]
                  })
                }),
                ui.campo({
                  etiqueta: 'Existing load balancer target groups',
                  info: 'balanceo-asg',
                  cx,
                  descripcion: 'Only instance target groups that belong to the same VPC as your Auto Scaling group are available for selection.',
                  control: ui.selector({
                    multiple: true,
                    valores: f.gruposDestino,
                    filtrar: true,
                    placeholder: 'Select target groups',
                    vacio: 'No target groups in this VPC. Create one in EC2 › Target Groups.',
                    opciones: tgsVpc().map((t) => ({ valor: t.arn, etiqueta: `${t.nombre} | ${t.protocolo}`, descripcion: `Port ${t.puerto} · ${t.vpcId}` })),
                    alCambiar: (x) => ((f.gruposDestino = x), (f.errores.tgs = null))
                  }),
                  error: f.errores.tgs
                })
              ]
            : null,
          f.balanceo === 'nuevo'
            ? h(
                'div',
                { class: 'cx-form cx-bloque' },
                h('h3', { class: 'cx-h3' }, 'Attach to a new load balancer'),
                h('p', { class: 'cx-texto-sec' }, 'Define a new load balancer to create and attach to this Auto Scaling group.'),
                ui.campo({
                  etiqueta: 'Load balancer type',
                  descripcion: 'Choose from the load balancer types offered below. Type selection cannot be changed after the load balancer is created.',
                  control: ui.tarjetas({
                    columnas: 2,
                    valor: lb.tipo,
                    opciones: [
                      { valor: 'application', etiqueta: 'Application Load Balancer', descripcion: 'HTTP, HTTPS' },
                      { valor: 'network', etiqueta: 'Network Load Balancer', descripcion: 'TCP, UDP, TLS' }
                    ],
                    alCambiar: (x) => ((lb.tipo = x), (lb.tgExistente = null), zona.repintar())
                  })
                }),
                ui.campo({ etiqueta: 'Load balancer name', descripcion: 'Name cannot be changed after the load balancer is created.', control: ui.entrada({ valor: lb.nombre, alCambiar: (x) => ((lb.nombre = x), tocar()) }), error: f.errores.lbNombre }),
                ui.campo({
                  etiqueta: 'Load balancer scheme',
                  descripcion: 'Scheme cannot be changed after the load balancer is created.',
                  control: ui.radios({
                    valor: lb.esquema,
                    opciones: [
                      { valor: 'internal', etiqueta: 'Internal' },
                      { valor: 'internet-facing', etiqueta: 'Internet-facing' }
                    ],
                    alCambiar: (x) => (lb.esquema = x)
                  })
                }),
                ui.campo({
                  etiqueta: 'Network mapping',
                  descripcion: 'Your new load balancer will be created using the same VPC and Availability Zone selections as your Auto Scaling group. You can select different subnets and add subnets from additional Availability Zones.',
                  control: ui.pares([{ etiqueta: 'VPC', valor: f.vpcId }, { etiqueta: 'Availability Zones and subnets', valor: f.subredes.length ? h('div', {}, f.subredes.map((id) => h('div', {}, `${zonaAsg(e.subredes.find((s) => s.id === id)?.az)} | ${id}`))) : '–' }], { columnas: 2 })
                }),
                lb.tipo === 'application' && zonasElegidas.size < 2 ? ui.alerta({ tipo: 'aviso', contenido: 'At least two subnets in two different Availability Zones must be specified. Go back to Step 2 and choose another zone.' }) : null,
                ui.alerta({
                  tipo: 'info',
                  titulo: 'Ojo con el grupo de seguridad del balanceador',
                  contenido: `Como en AWS, este paso no te deja elegir grupo de seguridad: el balanceador nuevo usa el grupo «default» de la VPC${(() => {
                    const sg = e.gruposSeguridad.find((g) => g.vpcId === f.vpcId && g.porDefecto);
                    return sg ? ` (${sg.id})` : '';
                  })()}, que no deja entrar tráfico de internet. Después de crear el grupo de Auto Scaling, ve a EC2 › Load Balancers › tu balanceador › pestaña Security y cámbialo por uno que permita HTTP (puerto 80) desde 0.0.0.0/0.`
                }),
                ui.campo({
                  etiqueta: 'Listeners and routing',
                  descripcion: 'If you require secure listeners, or multiple listeners, you can configure them from the Load Balancing console after your load balancer is created.',
                  control: h(
                    'div',
                    { class: 'cx-fila-campos' },
                    ui.campo({ etiqueta: 'Protocol', control: ui.entrada({ valor: lb.tipo === 'application' ? 'HTTP' : 'TCP', desactivado: true }) }),
                    ui.campo({ etiqueta: 'Port', control: ui.entrada({ tipo: 'number', valor: lb.puerto, alCambiar: (x) => (lb.puerto = x) }) }),
                    ui.campo({
                      etiqueta: 'Default routing (forward to)',
                      control: ui.selector({
                        opciones: [{ valor: 'crear', etiqueta: 'Create a target group' }, ...tgsVpc().filter((t) => t.protocolo === (lb.tipo === 'application' ? 'HTTP' : 'TCP')).map((t) => ({ valor: t.arn, etiqueta: t.nombre, descripcion: `${t.protocolo}:${t.puerto}` }))],
                        valor: lb.tgExistente ?? 'crear',
                        alCambiar: (x) => ((lb.tgExistente = x === 'crear' ? null : x), (f.errores.tgNombre = null), zona.repintar())
                      })
                    })
                  )
                }),
                lb.tgExistente
                  ? null
                  : ui.campo({ etiqueta: 'New target group name', descripcion: 'An instance target group with default settings will be created.', control: ui.entrada({ valor: lb.tgNombre, alCambiar: (x) => ((lb.tgNombre = x), tocar()) }), error: f.errores.tgNombre })
              )
            : null
        )
      }),
      ui.contenedor({
        titulo: 'VPC Lattice integration options',
        descripcion: 'To improve networking capabilities and scalability, integrate your Auto Scaling group with VPC Lattice.',
        cuerpo: ui.tarjetas({
          columnas: 2,
          valor: 'no',
          opciones: [
            { valor: 'no', etiqueta: 'No VPC Lattice service', descripcion: 'VPC Lattice will not manage your Auto Scaling group’s network access and connectivity with other services.' },
            { valor: 'si', etiqueta: 'Attach to VPC Lattice service', descripcion: 'Incoming requests associated with specified VPC Lattice target groups will be routed to your Auto Scaling group.', desactivado: true }
          ]
        })
      }),
      ui.contenedor({
        titulo: 'Health checks',
        info: 'salud-asg',
        cx,
        descripcion: 'Health checks increase availability by replacing unhealthy instances. When you use multiple health checks, all are evaluated, and if at least one fails, instance replacement occurs.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'EC2 health checks', control: h('span', { class: 'cx-texto-sec' }, ui.icono('status-info'), ' Always enabled') }),
          ui.campo({
            etiqueta: 'Additional health check types - optional',
            info: 'salud-asg',
            cx,
            control: h(
              'div',
              { class: 'cx-form' },
              ui.casilla({ etiqueta: 'Turn on Elastic Load Balancing health checks', descripcion: 'Elastic Load Balancing monitors whether instances are available to handle requests. When it reports an unhealthy instance, EC2 Auto Scaling can replace it on its next periodic check.', marcada: f.saludElb, desactivado: f.balanceo === 'ninguno', alCambiar: (x) => (f.saludElb = x) }),
              ui.casilla({ etiqueta: 'Turn on VPC Lattice health checks', descripcion: 'VPC Lattice can monitor whether instances are available to handle requests.', desactivado: true }),
              ui.casilla({ etiqueta: 'Turn on Amazon EBS health checks', descripcion: 'EBS monitors whether an instance’s root volume or attached volume stalls. When it reports an unhealthy instance, EC2 Auto Scaling can replace the instance on its next periodic health check.', marcada: f.saludEbs, alCambiar: (x) => (f.saludEbs = x) })
            )
          }),
          ui.campo({
            etiqueta: 'Health check grace period',
            info: 'salud-asg',
            cx,
            descripcion: 'This time period delays the first health check until your instances finish initializing. It doesn’t prevent an instance from terminating when placed into a non-running state.',
            control: h('div', { style: { maxWidth: '160px' } }, ui.entrada({ tipo: 'number', valor: f.gracia, sufijo: 'seconds', alCambiar: (x) => (f.gracia = x) })),
            error: f.errores.gracia
          })
        )
      })
    ];
  }

  /* ---------- paso 4 */
  function paso4() {
    const pol = f.politica;
    const tgsPoliticas = f.balanceo === 'existente' ? f.gruposDestino : [];
    return [
      ui.contenedor({
        titulo: 'Group size',
        info: 'capacidad-asg',
        cx,
        descripcion: 'Set the initial size of the Auto Scaling group. After creating the group, you can change its size to meet demand, either manually or by using automatic scaling.',
        cuerpo: h(
          'div',
          { class: 'cx-form', style: { maxWidth: '460px' } },
          ui.campo({ etiqueta: 'Desired capacity type', descripcion: 'Choose the unit of measurement for the desired capacity value. vCPUs and Memory(GiB) are only supported for mixed instances groups configured with a set of instance attributes.', control: ui.selector({ opciones: [{ valor: 'u', etiqueta: 'Units (number of instances)' }], valor: 'u', desactivado: true }) }),
          ui.campo({ etiqueta: 'Desired capacity', descripcion: 'Specify your group size.', control: ui.entrada({ tipo: 'number', valor: f.deseado, min: 0, alCambiar: (x) => (f.deseado = x) }), error: f.errores.deseado })
        )
      }),
      ui.contenedor({
        titulo: 'Scaling',
        info: 'capacidad-asg',
        cx,
        descripcion: 'You can resize your Auto Scaling group manually or automatically to meet changes in demand.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          h('div', {}, h('b', {}, 'Scaling limits'), h('div', { class: 'cx-texto-sec' }, 'Set limits on how much your desired capacity can be increased or decreased.')),
          h(
            'div',
            { class: 'cx-fila-campos', style: { maxWidth: '460px' } },
            ui.campo({ etiqueta: 'Min desired capacity', control: ui.entrada({ tipo: 'number', valor: f.min, min: 0, alCambiar: (x) => (f.min = x) }), restriccion: 'Equal or less than desired capacity', error: f.errores.min }),
            ui.campo({ etiqueta: 'Max desired capacity', control: ui.entrada({ tipo: 'number', valor: f.max, min: 0, alCambiar: (x) => (f.max = x) }), restriccion: 'Equal or greater than desired capacity', error: f.errores.max })
          ),
          h('div', {}, h('b', {}, 'Automatic scaling - optional'), h('div', {}, 'Choose whether to use a target tracking policy ', ui.info(cx, 'politica-seguimiento')), h('div', { class: 'cx-texto-sec' }, 'You can set up other metric-based scaling policies and scheduled scaling after creating your Auto Scaling group.')),
          ui.tarjetas({
            columnas: 2,
            valor: f.escalado,
            opciones: [
              { valor: 'ninguno', etiqueta: 'No scaling policies', descripcion: 'Your Auto Scaling group will remain at its initial size and will not dynamically resize to meet demand.' },
              { valor: 'seguimiento', etiqueta: 'Target tracking scaling policy', descripcion: 'Choose a CloudWatch metric and target value and let the scaling policy adjust the desired capacity in proportion to the metric’s value.' }
            ],
            alCambiar: (x) => ((f.escalado = x), zona.repintar())
          }),
          f.escalado === 'seguimiento'
            ? h(
                'div',
                { class: 'cx-form', style: { maxWidth: '460px' } },
                ui.campo({ etiqueta: 'Scaling policy name', control: ui.entrada({ valor: pol.nombre, alCambiar: (x) => (pol.nombre = x) }), error: f.errores.polNombre }),
                ui.campo({
                  etiqueta: 'Metric type',
                  info: 'politica-seguimiento',
                  cx,
                  descripcion: 'Monitored metric that determines if resource utilization is too low or high. If using EC2 metrics, consider enabling detailed monitoring for better scaling performance.',
                  control: ui.selector({
                    opciones: METRICAS_SEGUIMIENTO.map((x) => ({ valor: x.valor, etiqueta: x.etiqueta, desactivado: x.valor === 'ALBRequestCountPerTarget' && !tgsPoliticas.length })),
                    valor: pol.metrica,
                    alCambiar: (x) => ((pol.metrica = x), (pol.grupoDestino = x === 'ALBRequestCountPerTarget' ? tgsPoliticas[0] : null), zona.repintar())
                  }),
                  restriccion: !tgsPoliticas.length ? 'Application Load Balancer request count per target needs a target group attached to the group (Step 3).' : null
                }),
                pol.metrica === 'ALBRequestCountPerTarget'
                  ? ui.campo({ etiqueta: 'Target group', control: ui.selector({ opciones: tgsPoliticas.map((arn) => ({ valor: arn, etiqueta: nombreTg(cx, arn) })), valor: pol.grupoDestino, alCambiar: (x) => (pol.grupoDestino = x) }) })
                  : null,
                ui.campo({ etiqueta: 'Target value', control: h('div', { style: { maxWidth: '120px' } }, ui.entrada({ tipo: 'number', valor: pol.objetivo, alCambiar: (x) => (pol.objetivo = x) })), error: f.errores.objetivo }),
                ui.campo({ etiqueta: 'Instance warmup', info: 'calentamiento', cx, control: h('div', { style: { maxWidth: '160px' } }, ui.entrada({ tipo: 'number', valor: pol.calentamiento, sufijo: 'seconds', alCambiar: (x) => (pol.calentamiento = x) })) }),
                ui.casilla({ etiqueta: 'Disable scale in to create only a scale-out policy', marcada: pol.sinReducir, alCambiar: (x) => (pol.sinReducir = x) })
              )
            : null
        )
      }),
      ui.contenedor({
        titulo: 'Instance maintenance policy',
        descripcion: 'Control your Auto Scaling group’s availability during instance replacement events.',
        cuerpo: ui.tarjetas({
          columnas: 2,
          valor: f.mantenimiento,
          opciones: [
            { valor: 'none', etiqueta: 'No policy', descripcion: 'For rebalancing events, new instances will launch before terminating others. For all other events, instances terminate and launch at the same time.' },
            { valor: 'launch-before', etiqueta: 'Launch before terminating', descripcion: 'A new instance must be provisioned first before an existing instance can be terminated.' },
            { valor: 'terminate-launch', etiqueta: 'Terminate and launch', descripcion: 'Terminate and launch at the same time.' },
            { valor: 'flexible', etiqueta: 'Flexible', descripcion: 'Launch and terminate at the same time and allow a percentage over and under the desired capacity.' }
          ],
          alCambiar: (x) => (f.mantenimiento = x)
        })
      }),
      ui.contenedor({
        titulo: 'Additional settings',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Instance scale-in protection', info: 'proteccion-asg', cx, control: ui.casilla({ etiqueta: 'Enable instance scale-in protection', marcada: f.proteccion, alCambiar: (x) => (f.proteccion = x) }) }),
          ui.campo({ etiqueta: 'Monitoring', control: ui.casilla({ etiqueta: 'Enable group metrics collection within CloudWatch', marcada: f.monitoreo, alCambiar: (x) => (f.monitoreo = x) }) }),
          ui.campo({ etiqueta: 'Default instance warmup', control: ui.casilla({ etiqueta: 'Enable default instance warmup', desactivado: true }) })
        )
      })
    ];
  }

  /* ---------- paso 5 */
  function paso5() {
    const temas = e.sns?.temas ?? [];
    return ui.contenedor({
      titulo: 'Notifications',
      info: 'notificaciones-asg',
      cx,
      descripcion: 'Send notifications to SNS topics whenever Amazon EC2 Auto Scaling launches or terminates the EC2 instances in your Auto Scaling group.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        f.notificaciones.map((n, i) =>
          h(
            'div',
            { class: 'cx-bloque cx-form' },
            h('div', { class: 'cx-escalar-fila' }, h('b', {}, `Notification ${i + 1}`), ui.boton('Remove', { alClic: () => (f.notificaciones.splice(i, 1), zona.repintar()) })),
            ui.campo({
              etiqueta: 'SNS Topic',
              control: ui.selector({ opciones: temas.map((t) => ({ valor: t.arn, etiqueta: t.nombre ?? t.arn, descripcion: t.arn })), valor: n.temaArn, placeholder: 'Select an SNS topic', vacio: 'No SNS topics. Create one in Amazon SNS.', alCambiar: (x) => (n.temaArn = x) })
            }),
            ui.campo({
              etiqueta: 'Event types',
              control: h(
                'div',
                { class: 'cx-escalar-casillas' },
                [
                  ['launch', 'Launch'],
                  ['terminate', 'Terminate'],
                  ['launch_error', 'Fail to launch'],
                  ['terminate_error', 'Fail to terminate']
                ].map(([valor, etiqueta]) => ui.casilla({ etiqueta, marcada: n.eventos.includes(valor), alCambiar: (x) => (n.eventos = x ? [...n.eventos, valor] : n.eventos.filter((y) => y !== valor)) }))
              )
            })
          )
        ),
        h('div', {}, ui.boton('Add notification', { alClic: () => (f.notificaciones.push({ temaArn: null, eventos: ['launch', 'terminate', 'launch_error', 'terminate_error'] }), zona.repintar()) }))
      )
    });
  }

  /* ---------- paso 6 */
  function paso6() {
    const filas = f.etiquetas;
    return ui.contenedor({
      titulo: `Tags (${filas.length})`,
      info: 'etiquetas-asg',
      cx,
      descripcion: 'Add tags to help you search, filter, and track your Auto Scaling group across AWS. You can also choose to automatically add these tags to instances when they are launched.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        filas.length
          ? h(
              'div',
              { class: 'cx-reglas', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto auto' } },
              h('div', { class: 'cx-reglas__cabeza' }, 'Key'),
              h('div', { class: 'cx-reglas__cabeza' }, 'Value', h('i', { style: { fontWeight: 400 } }, ' - optional')),
              h('div', { class: 'cx-reglas__cabeza' }, 'Tag new instances'),
              h('div'),
              filas.map((t, i) => [
                ui.entrada({ valor: t.llave, placeholder: 'Enter key', etiquetaAccesible: 'Key', alCambiar: (x) => (t.llave = x) }),
                ui.entrada({ valor: t.valor, placeholder: 'Enter value', etiquetaAccesible: 'Value', alCambiar: (x) => (t.valor = x) }),
                ui.casilla({ etiquetaAccesible: 'Tag new instances', marcada: t.propagar, alCambiar: (x) => (t.propagar = x) }),
                ui.boton('Remove', { alClic: () => (filas.splice(i, 1), zona.repintar()) })
              ])
            )
          : h('p', { class: 'cx-texto-sec' }, 'No tags associated with the resource.'),
        h('div', {}, ui.boton('Add tag', { desactivado: filas.length >= 50, alClic: () => (filas.push({ llave: '', valor: '', propagar: true }), zona.repintar()) }), h('div', { class: 'cx-campo__restriccion', style: { marginTop: '4px' } }, `You can add ${50 - filas.length} more tags.`))
      )
    });
  }

  /* ---------- paso 7 */
  function paso7() {
    const p = plantilla();
    const editar = (i) => ui.boton('Edit', { alClic: () => irA(i) });
    const sub = (id) => e.subredes.find((s) => s.id === id);
    const tgs = f.balanceo === 'existente' ? f.gruposDestino.map((arn) => nombreTg(cx, arn)).join(', ') : f.balanceo === 'nuevo' ? `New load balancer ${f.nuevo.nombre} with target group ${f.nuevo.tgExistente ? nombreTg(cx, f.nuevo.tgExistente) : `${f.nuevo.tgNombre} (new)`}` : 'No load balancer';
    const bloque = (i, titulo, pares) => ui.contenedor({ titulo: `Step ${i + 1}: ${titulo}`, acciones: editar(i), cuerpo: ui.pares(pares, { columnas: 3 }) });
    return [
      bloque(0, 'Choose launch template', [
        { etiqueta: 'Auto Scaling group name', valor: f.nombre },
        { etiqueta: 'Launch template', valor: p ? `${p.nombre} (${p.id})` : '–' },
        { etiqueta: 'Version', valor: textoVersionPlantilla(f.version) }
      ]),
      bloque(1, 'Choose instance launch options', [
        { etiqueta: 'VPC', valor: f.vpcId },
        { etiqueta: 'Availability Zones and subnets', valor: h('div', {}, f.subredes.map((id) => h('div', {}, `${zonaAsg(sub(id)?.az)} | ${id}`))) },
        { etiqueta: 'Availability Zone distribution', valor: ETIQUETA_DISTRIBUCION[f.distribucion] }
      ]),
      bloque(2, 'Integrate with other services', [
        { etiqueta: 'Load balancing', valor: tgs },
        { etiqueta: 'Health check type', valor: f.saludElb ? 'EC2, ELB' : 'EC2' },
        { etiqueta: 'Health check grace period', valor: `${f.gracia} seconds` }
      ]),
      bloque(3, 'Configure group size and scaling', [
        { etiqueta: 'Desired capacity', valor: f.deseado },
        { etiqueta: 'Min desired capacity', valor: f.min },
        { etiqueta: 'Max desired capacity', valor: f.max },
        { etiqueta: 'Scaling policy', valor: f.escalado === 'seguimiento' ? `${f.politica.nombre}: ${metricaSeguimiento(f.politica.metrica)?.etiqueta} = ${f.politica.objetivo}` : 'No scaling policies' },
        { etiqueta: 'Instance scale-in protection', valor: f.proteccion ? 'Enabled' : 'Disabled' },
        { etiqueta: 'Group metrics collection', valor: f.monitoreo ? 'Enabled' : 'Disabled' }
      ]),
      bloque(4, 'Add notifications', [{ etiqueta: 'Notifications', valor: f.notificaciones.filter((n) => n.temaArn).length ? f.notificaciones.filter((n) => n.temaArn).map((n) => n.temaArn.split(':').pop()).join(', ') : 'No notifications' }]),
      bloque(5, 'Add tags', [{ etiqueta: 'Tags', valor: f.etiquetas.filter((t) => t.llave.trim()).length ? h('div', {}, f.etiquetas.filter((t) => t.llave.trim()).map((t) => h('div', {}, `${t.llave} = ${t.valor}${t.propagar ? ' (Tag new instances)' : ''}`))) : 'No tags' }])
    ];
  }

  function crear() {
    if (![0, 1, 2, 3].every((i) => revisar(i) || (irA(i), false))) return;
    const r = cx.hacer(
      { servicio: 'AutoScaling', accion: 'CreateAutoScalingGroup', error: 'Failed to create Auto Scaling group' },
      (est) => {
        let tgs = f.balanceo === 'existente' ? f.gruposDestino : [];
        if (f.balanceo === 'nuevo') {
          // El balanceador nuevo: una subred por zona, el grupo de seguridad por omisión de la VPC.
          const porZona = new Map();
          for (const id of f.subredes) {
            const s = est.subredes.find((x) => x.id === id);
            if (s && !porZona.has(s.az)) porZona.set(s.az, s.id);
          }
          const alb = f.nuevo.tipo === 'application';
          const tg = f.nuevo.tgExistente
            ? llamar('grupoDestinoDe', est, f.nuevo.tgExistente)
            : llamar('crearGrupoDestino', est, { nombre: f.nuevo.tgNombre.trim(), tipoDestino: 'instance', protocolo: alb ? 'HTTP' : 'TCP', puerto: Number(f.nuevo.puerto) || 80, vpcId: f.vpcId });
          const sgDefecto = est.gruposSeguridad.find((g) => g.vpcId === f.vpcId && g.porDefecto)?.id;
          llamar('crearBalanceador', est, {
            nombre: f.nuevo.nombre.trim(),
            tipo: f.nuevo.tipo,
            esquema: f.nuevo.esquema,
            vpcId: f.vpcId,
            subredes: [...porZona.values()],
            gruposSeguridad: alb && sgDefecto ? [sgDefecto] : [],
            oyentes: [{ protocolo: alb ? 'HTTP' : 'TCP', puerto: Number(f.nuevo.puerto) || 80, tgArn: tg.arn }]
          });
          tgs = [tg.arn];
        }
        const pol = f.politica;
        return crearGrupoAutoScaling(est, {
          nombre: f.nombre.trim(),
          plantillaId: f.plantillaId,
          version: f.version,
          subredes: f.subredes,
          distribucion: f.distribucion,
          gruposDestino: tgs,
          tipoSalud: f.saludElb ? 'ELB' : 'EC2',
          saludEbs: f.saludEbs,
          gracia: Number(f.gracia),
          min: Number(f.min),
          deseado: Number(f.deseado),
          max: Number(f.max),
          politica:
            f.escalado === 'seguimiento'
              ? { nombre: pol.nombre.trim(), metrica: pol.metrica, grupoDestino: pol.metrica === 'ALBRequestCountPerTarget' ? pol.grupoDestino ?? tgs[0] : null, objetivo: Number(pol.objetivo), calentamiento: Number(pol.calentamiento) || 0, sinReducir: pol.sinReducir }
              : null,
          etiquetas: f.etiquetas,
          notificaciones: f.notificaciones.filter((n) => n.temaArn),
          proteccionReduccion: f.proteccion,
          monitoreo: f.monitoreo,
          mantenimiento: f.mantenimiento
        });
      },
      { atomico: true }
    );
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `${r.valor.nombre} created successfully` });
      cx.ir('ec2/autoscaling');
    }
  }

  function pintar() {
    const cuerpos = [paso1, paso2, paso3, paso4, paso5, paso6, paso7];
    const titulos = [
      ['Choose launch template', 'Specify a launch template that contains settings common to all EC2 instances that are launched by this Auto Scaling group.'],
      ['Choose instance launch options', 'Choose the VPC network environment that your instances are launched into, and customize the instance types and purchase options.'],
      ['Integrate with other services - optional', 'Use a load balancer to distribute network traffic across multiple servers. Enable service-to-service communications with VPC Lattice. You can also customize health check replacements and monitoring.'],
      ['Configure group size and scaling - optional', 'Define your group’s desired capacity and scaling limits. You can optionally add automatic scaling to adjust the size of your group.'],
      ['Add notifications - optional', 'Send notifications to SNS topics whenever Amazon EC2 Auto Scaling launches or terminates the EC2 instances in your Auto Scaling group.'],
      ['Add tags - optional', 'Add tags to help you search, filter, and track your Auto Scaling group across AWS.'],
      ['Review', 'Review the settings of your Auto Scaling group and choose Create Auto Scaling group.']
    ];
    const [titulo, descripcion] = titulos[f.paso];
    return marcoAsistente(cx, f, { titulo, descripcion, info: 'grupo-autoscaling', cuerpo: cuerpos[f.paso](), pie: pie(), irA });
  }

  if (!plantillas(cx).length) {
    cx.flash({ tipo: 'info', texto: 'You need a launch template first. Create one in EC2 › Launch Templates.', accion: { texto: 'Create launch template', alClic: () => cx.ir('ec2/plantillas/crear') } });
  }
  zona = ui.region(() => pintar());
  return h('div', { class: 'cx-pagina' }, zona);
}

/* ================================================ grupos: el detalle y sus pestañas */

function editarCapacidad(cx, g) {
  const f = { deseado: String(g.deseado), min: String(g.min), max: String(g.max) };
  const m = cx.modal({
    titulo: 'Group size',
    ancho: 'chico',
    contenido: h(
      'div',
      { class: 'cx-form' },
      h('p', { class: 'cx-texto-sec' }, 'Specify the size of the Auto Scaling group by changing the desired capacity. You can also specify minimum and maximum scaling limits.'),
      ui.campo({ etiqueta: 'Desired capacity type', descripcion: 'Choose the unit of measurement for the desired capacity value. vCPUs and Memory(GiB) are only supported for mixed instances groups configured with a set of instance attributes.', control: ui.selector({ opciones: [{ valor: 'u', etiqueta: 'Units (number of instances)' }], valor: 'u', desactivado: true }) }),
      ui.campo({ etiqueta: 'Desired capacity', descripcion: 'Specify your group size.', control: ui.entrada({ tipo: 'number', valor: f.deseado, min: 0, etiquetaAccesible: 'Desired capacity', alCambiar: (x) => (f.deseado = x) }) }),
      h('div', {}, h('b', {}, 'Scaling limits'), h('div', { class: 'cx-texto-sec' }, 'Set limits on how much your desired capacity can be increased or decreased.')),
      h(
        'div',
        { class: 'cx-fila-campos' },
        ui.campo({ etiqueta: 'Min desired capacity', control: ui.entrada({ tipo: 'number', valor: f.min, min: 0, etiquetaAccesible: 'Min desired capacity', alCambiar: (x) => (f.min = x) }), restriccion: 'Equal or less than desired capacity' }),
        ui.campo({ etiqueta: 'Max desired capacity', control: ui.entrada({ tipo: 'number', valor: f.max, min: 0, etiquetaAccesible: 'Max desired capacity', alCambiar: (x) => (f.max = x) }), restriccion: 'Equal or greater than desired capacity' })
      )
    ),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Update', {
        variante: 'primario',
        alClic: () => {
          const num = (v) => (String(v).trim() === '' ? '' : Number(v));
          const r = cx.hacer({ servicio: 'AutoScaling', accion: 'UpdateAutoScalingGroup', error: 'Failed to update group size' }, (e) => editarGrupoAutoScaling(e, g.nombre, { deseado: num(f.deseado), min: num(f.min), max: num(f.max) }));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `${g.nombre} updated successfully` });
          }
        }
      })
    ]
  });
}

function simularHoraPico(cx, g) {
  const f = { cpu: '90', minutos: '10' };
  const m = cx.modal({
    titulo: 'Simular hora pico',
    contenido: h(
      'div',
      { class: 'cx-form' },
      ui.alerta({
        tipo: 'info',
        titulo: 'Botón propio del simulador',
        contenido: 'En AWS la carga llega sola (muchos clientes a la vez). Aquí la simulas: la CPU de las instancias de tu grupo sube durante un rato. Si tu grupo tiene una política de target tracking, verás cómo la alarma pasa a In alarm y el grupo lanza más instancias. El tiempo va acelerado: cada periodo de una métrica (1 o 5 minutos en AWS) dura 10 segundos aquí.'
      }),
      ui.campo({ etiqueta: 'CPU de la hora pico', control: ui.selector({ opciones: ['60', '70', '80', '90', '100'].map((v) => ({ valor: v, etiqueta: `${v} %` })), valor: f.cpu, alCambiar: (x) => (f.cpu = x) }) }),
      ui.campo({ etiqueta: 'Duración', control: ui.selector({ opciones: ['5', '10', '15', '20', '30'].map((v) => ({ valor: v, etiqueta: `${(Number(v) * DURACION_AUTOSCALING.periodo) / 1000} s reales (${v} periodos de métrica)` })), valor: f.minutos, alCambiar: (x) => (f.minutos = x) }) })
    ),
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Iniciar hora pico', {
        variante: 'primario',
        alClic: () => {
          const r = cx.hacer({ servicio: 'Simulador', accion: 'SimularHoraPico', error: 'No se pudo simular la hora pico' }, (e) => simularCargaAsg(e, g.nombre, { cpu: Number(f.cpu), minutos: Number(f.minutos) }));
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'info', texto: `Hora pico simulada: la CPU de ${g.nombre} sube a ${f.cpu} % durante ${(Number(f.minutos) * DURACION_AUTOSCALING.periodo) / 1000} s (${f.minutos} periodos de métrica). Mira las pestañas Activity y Monitoring.` });
          }
        }
      })
    ]
  });
}

/** El aviso de la hora pico y la CPU actual del grupo (arriba del detalle). */
function avisoHoraPico(cx, g) {
  const pico = horaPicoVigente(cx, g);
  if (!pico) return null;
  const cpu = metricaAsg(cx.estado, { namespace: 'AWS/EC2', metrica: 'CPUUtilization', dimensiones: { AutoScalingGroupName: g.nombre }, estadistica: 'Average' }, Date.now());
  const s = Math.max(0, Math.round((pico.hasta - Date.now()) / 1000));
  return ui.alerta({
    tipo: 'aviso',
    titulo: 'Hora pico simulada en curso',
    contenido: `La carga de tu grupo está al ${pico.cpu} % por ${s} s más (${Math.ceil(s / 10)} min simulados). CPU promedio del grupo ahora: ${cpu === null || cpu === undefined ? 'sin datos todavía' : `${Math.round(cpu * 10) / 10} %`}. Deseado: ${g.deseado}, máximo: ${g.max}.`
  });
}

function capacidad(cx, g) {
  return ui.contenedor({
    titulo: 'Capacity overview',
    info: 'capacidad-asg',
    cx,
    acciones: ui.boton('Edit', { escribe: true, desactivado: g.estado !== 'activo', alClic: () => editarCapacidad(cx, g) }),
    cuerpo: ui.pares(
      [
        { etiqueta: 'Desired capacity', valor: String(g.deseado) },
        { etiqueta: 'Desired capacity type', valor: 'Units (number of instances)' },
        { etiqueta: 'Scaling limits', valor: `${g.min} - ${g.max}` },
        { etiqueta: 'Status', valor: estadoGrupo(g) },
        { etiqueta: 'Instances', valor: String(g.instancias.length) },
        { etiqueta: 'Instance health', valor: saludGrupo(g) }
      ],
      { columnas: 6, cx }
    )
  });
}

function pestanaDetalles(cx, nombre) {
  return cx.vivo(() => {
    const g = grupoDe(cx, nombre);
    if (!g) return null;
    const p = plantillaDe(cx, g.plantilla.id);
    const v = versionDePlantilla(p, g.plantilla.version);
    const editar = () => ui.boton('Edit', { escribe: true, desactivado: g.estado !== 'activo', alClic: () => cx.ir(`${rutaGrupo(g)}/editar`) });
    const zonas = [...new Set(g.subredes.map((id) => cx.estado.subredes.find((s) => s.id === id)?.az).filter(Boolean))];
    return [
      ui.contenedor({
        titulo: 'Group details',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Auto Scaling group name', valor: g.nombre },
            { etiqueta: 'Desired capacity', valor: String(g.deseado) },
            { etiqueta: 'Minimum capacity', valor: String(g.min) },
            { etiqueta: 'Maximum capacity', valor: String(g.max) },
            { etiqueta: 'Date created', valor: ui.fechaLarga(g.creado) },
            { etiqueta: 'Auto Scaling group ARN', valor: ui.copiable(g.arn) }
          ],
          { columnas: 3 }
        )
      }),
      ui.contenedor({
        titulo: 'Launch template',
        info: 'plantilla-lanzamiento',
        cx,
        acciones: editar(),
        cuerpo: ui.pares(
          [
            { etiqueta: 'Launch template', valor: p ? h('div', {}, ui.enlace(p.nombre, `ec2/plantillas/${p.id}`, { cx }), h('div', { class: 'cx-texto-sec' }, p.id)) : h('span', { class: 'cx-texto-sec' }, `${g.plantilla.id} (deleted)`) },
            { etiqueta: 'Version', valor: textoVersionPlantilla(g.plantilla.version) },
            { etiqueta: 'Description', valor: v?.descripcion || '–' },
            { etiqueta: 'AMI ID', valor: v ? amiDe(v.datos.ami)?.id : '–' },
            { etiqueta: 'Instance type', valor: v?.datos.tipo ?? '–' },
            { etiqueta: 'Security group IDs', valor: v?.datos.gruposSeguridad.length ? h('div', {}, v.datos.gruposSeguridad.map((id) => h('div', {}, enlaceRecurso(cx, id)))) : '–' },
            { etiqueta: 'Key pair name', valor: v?.datos.llave ?? '–' },
            { etiqueta: 'Request Spot Instances', valor: 'No' }
          ],
          { columnas: 4, cx }
        )
      }),
      ui.contenedor({
        titulo: 'Network',
        info: 'zonas-asg',
        cx,
        acciones: editar(),
        cuerpo: ui.pares(
          [
            { etiqueta: 'Availability Zones', valor: h('div', {}, zonas.map((z) => h('div', {}, zonaAsg(z)))) },
            { etiqueta: 'Subnet ID', valor: h('div', {}, g.subredes.map((id) => h('div', {}, enlaceRecurso(cx, id)))) },
            { etiqueta: 'Availability Zone distribution', valor: ETIQUETA_DISTRIBUCION[g.distribucion] ?? g.distribucion }
          ],
          { columnas: 3 }
        )
      }),
      ui.contenedor({
        titulo: 'Health checks',
        info: 'salud-asg',
        cx,
        acciones: editar(),
        cuerpo: ui.pares(
          [
            { etiqueta: 'Health check type', valor: g.tipoSalud === 'ELB' ? 'EC2, ELB' : 'EC2' },
            { etiqueta: 'Health check grace period', valor: `${g.gracia} seconds` },
            { etiqueta: 'Amazon EBS health checks', valor: g.saludEbs ? 'Enabled' : 'Disabled' }
          ],
          { columnas: 3, cx }
        )
      }),
      ui.contenedor({
        titulo: 'Advanced configurations',
        acciones: editar(),
        cuerpo: ui.pares(
          [
            { etiqueta: 'Termination policies', valor: 'Default' },
            { etiqueta: 'Default cooldown', valor: '300 seconds' },
            { etiqueta: 'Instance scale-in protection', info: 'proteccion-asg', valor: g.proteccionReduccion ? 'Enabled' : 'Disabled' },
            { etiqueta: 'Instance maintenance policy', valor: { none: 'No policy', 'launch-before': 'Launch before terminating', 'terminate-launch': 'Terminate and launch', flexible: 'Flexible' }[g.mantenimiento] ?? 'No policy' },
            { etiqueta: 'Group metrics collection', valor: g.monitoreo ? 'Enabled' : 'Disabled' },
            { etiqueta: 'Service-linked role', valor: `arn:aws:iam::${cx.estado.cuenta.id}:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling` }
          ],
          { columnas: 3, cx }
        )
      })
    ];
  });
}

function pestanaIntegraciones(cx, nombre) {
  return cx.vivo(() => {
    const g = grupoDe(cx, nombre);
    if (!g) return null;
    return [
      ui.contenedor({
        titulo: 'Load balancing',
        info: 'balanceo-asg',
        cx,
        acciones: ui.boton('Edit', { escribe: true, desactivado: g.estado !== 'activo', alClic: () => cx.ir(`${rutaGrupo(g)}/editar`) }),
        cuerpo: ui.pares(
          [
            { etiqueta: 'Load balancer target groups', valor: g.gruposDestino.length ? h('div', {}, g.gruposDestino.map((arn) => h('div', {}, enlaceTg(cx, arn)))) : '–' },
            { etiqueta: 'Classic Load Balancers', valor: '–' },
            { etiqueta: 'Elastic Load Balancing health checks', valor: g.tipoSalud === 'ELB' ? 'Turned on' : 'Turned off' }
          ],
          { columnas: 3 }
        )
      }),
      ui.contenedor({ titulo: 'VPC Lattice integration options', cuerpo: ui.pares([{ etiqueta: 'VPC Lattice target groups', valor: '–' }], { columnas: 3 }) }),
      ui.contenedor({ titulo: 'Application Recovery Controller (ARC) zonal shift', cuerpo: ui.pares([{ etiqueta: 'Zonal shift', valor: 'Disabled' }], { columnas: 3 }) })
    ];
  });
}

/** El texto de «Execute policy when» / «Take the action» de una política, como en la tarjeta de AWS. */
function textoPolitica(p) {
  if (p.tipo === 'TargetTrackingScaling') {
    const m = metricaSeguimiento(p.metrica);
    return { cuando: `As required to maintain ${m?.etiqueta ?? p.metrica} at ${p.objetivo}`, accion: 'Add or remove capacity units as required', extra: `${p.calentamiento} seconds to warm up before including in metric`, reducir: p.sinReducir ? 'Disabled' : 'Enabled' };
  }
  const unidad = p.ajuste === 'PercentChangeInCapacity' ? 'percent of group' : 'capacity units';
  const verbo = (v) => (p.ajuste === 'ExactCapacity' ? `Set to ${v} capacity units` : v >= 0 ? `Add ${v} ${unidad}` : `Remove ${-v} ${unidad}`);
  if (p.tipo === 'SimpleScaling') return { cuando: p.alarma ? `${p.alarma} breaches the alarm threshold` : 'No alarm selected', accion: verbo(p.valor), extra: `And then wait: ${p.enfriamiento} seconds before allowing another scaling activity`, reducir: '–' };
  return {
    cuando: p.alarma ? `${p.alarma} breaches the alarm threshold` : 'No alarm selected',
    accion: p.pasos.map((s) => `${verbo(s.valor)} when ${s.inferior ?? '-infinity'} <= breach < ${s.superior ?? '+infinity'}`).join('; '),
    extra: `${p.calentamiento} seconds to warm up before including in metric`,
    reducir: '–'
  };
}

const RECURRENCIAS = [
  { valor: 'once', etiqueta: 'Once' },
  { valor: '30m', etiqueta: 'Every 30 minutes' },
  { valor: '1h', etiqueta: 'Every 1 hour' },
  { valor: '1d', etiqueta: 'Every day' },
  { valor: '1w', etiqueta: 'Every week' },
  { valor: 'cron', etiqueta: 'Cron' }
];

function crearProgramada(cx, g) {
  const ahora = new Date(Date.now() + 5 * 60000);
  const dos = (n) => String(n).padStart(2, '0');
  const f = { nombre: '', deseado: '', min: '', max: '', recurrencia: 'once', cron: '0 22 * * *', fecha: `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`, hora: `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}` };
  const form = ui.region(() =>
    h(
      'div',
      { class: 'cx-form' },
      ui.campo({ etiqueta: 'Name', control: ui.entrada({ valor: f.nombre, alCambiar: (x) => (f.nombre = x) }) }),
      h('div', {}, h('b', {}, 'Desired capacity'), h('div', { class: 'cx-texto-sec' }, 'Specify the size of the group. Leave a field empty to keep its current value.')),
      h(
        'div',
        { class: 'cx-fila-campos' },
        ui.campo({ etiqueta: 'Desired capacity', control: ui.entrada({ tipo: 'number', valor: f.deseado, alCambiar: (x) => (f.deseado = x) }) }),
        ui.campo({ etiqueta: 'Min', control: ui.entrada({ tipo: 'number', valor: f.min, alCambiar: (x) => (f.min = x) }) }),
        ui.campo({ etiqueta: 'Max', control: ui.entrada({ tipo: 'number', valor: f.max, alCambiar: (x) => (f.max = x) }) })
      ),
      ui.campo({ etiqueta: 'Recurrence', control: ui.selector({ opciones: RECURRENCIAS, valor: f.recurrencia, alCambiar: (x) => ((f.recurrencia = x), form.repintar()) }) }),
      f.recurrencia === 'cron'
        ? ui.campo({ etiqueta: 'Cron expression', control: ui.entrada({ valor: f.cron, alCambiar: (x) => (f.cron = x) }), restriccion: 'Minute Hour Day-of-month Month Day-of-week. En el simulador las expresiones cron se guardan, pero no se ejecutan.' })
        : null,
      ui.campo({ etiqueta: 'Time zone', control: ui.selector({ opciones: [{ valor: 'UTC', etiqueta: 'Etc/UTC' }], valor: 'UTC', desactivado: true }) }),
      ui.campo({
        etiqueta: f.recurrencia === 'once' ? 'Specific start time' : 'Start time',
        control: h('div', { class: 'cx-fila-campos' }, ui.entrada({ tipo: 'date', valor: f.fecha, etiquetaAccesible: 'Start date', alCambiar: (x) => (f.fecha = x) }), ui.entrada({ tipo: 'time', valor: f.hora, etiquetaAccesible: 'Start time', alCambiar: (x) => (f.hora = x) }))
      })
    )
  );
  const m = cx.modal({
    titulo: 'Create scheduled action',
    contenido: form,
    pie: [
      ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }),
      ui.boton('Create', {
        variante: 'primario',
        alClic: () => {
          const inicio = new Date(`${f.fecha}T${f.hora || '00:00'}`);
          const r = cx.hacer({ servicio: 'AutoScaling', accion: 'PutScheduledUpdateGroupAction', error: 'Failed to create scheduled action' }, (e) =>
            crearAccionProgramada(e, g.nombre, {
              nombre: f.nombre,
              deseado: f.deseado,
              min: f.min,
              max: f.max,
              recurrencia: f.recurrencia === 'cron' ? f.cron : f.recurrencia,
              inicio: Number.isNaN(inicio.getTime()) ? 'invalid' : inicio.toISOString()
            })
          );
          if (r.ok) {
            m.cerrar();
            cx.flash({ tipo: 'exito', texto: `Scheduled action ${r.valor.nombre} created successfully.` });
          }
        }
      })
    ]
  });
}

function pestanaEscalado(cx, nombre) {
  const politicas = ui.tabla(cx, {
    titulo: 'Dynamic scaling policies',
    info: 'politica-seguimiento',
    variante: 'contenedor',
    descripcion: 'Dynamic scaling policies adjust the capacity of your group in response to changes in a CloudWatch metric.',
    filas: () => grupoDe(cx, nombre)?.politicas ?? [],
    clave: (p) => p.nombre,
    seleccion: 'unica',
    filtro: false,
    columnas: [
      { titulo: 'Policy name', valor: (p) => p.nombre },
      { titulo: 'Policy type', valor: (p) => ({ TargetTrackingScaling: 'Target tracking scaling', StepScaling: 'Step scaling', SimpleScaling: 'Simple scaling' })[p.tipo] },
      { titulo: 'Enabled or disabled?', valor: (p) => (p.habilitada ? ui.estado('exito', 'Enabled') : ui.estado('detenido', 'Disabled')) },
      { titulo: 'Execute policy when', valor: (p) => textoPolitica(p).cuando },
      { titulo: 'Take the action', valor: (p) => textoPolitica(p).accion },
      { titulo: 'Instances need', valor: (p) => textoPolitica(p).extra },
      { titulo: 'Scale in', valor: (p) => textoPolitica(p).reducir },
      { titulo: 'CloudWatch alarms', valor: (p) => (p.alarmas?.length ? h('div', {}, p.alarmas.map((a) => h('div', { class: 'cx-texto-sec' }, a))) : p.alarma ?? '–') }
    ],
    acciones: (sel) => {
      const g = grupoDe(cx, nombre);
      const p = sel[0];
      return [
        ui.menuBoton(
          'Actions',
          () => [
            { texto: 'Edit', escribe: true, desactivado: !p, alClic: () => cx.ir(`${rutaGrupo(nombre)}/politicas/${encodeURIComponent(p.nombre)}`) },
            { texto: p?.habilitada ? 'Disable' : 'Enable', escribe: true, desactivado: !p, alClic: () => cx.hacer({ servicio: 'AutoScaling', accion: 'PutScalingPolicy', error: 'Failed to update scaling policy' }, (e) => habilitarPoliticaEscalado(e, nombre, p.nombre, !p.habilitada)) },
            '-',
            {
              texto: 'Delete',
              escribe: true,
              desactivado: !p,
              alClic: () =>
                cx.confirmar({
                  titulo: 'Delete scaling policy',
                  textoBoton: 'Delete',
                  contenido: h('p', {}, `Are you sure you want to delete the scaling policy ${p.nombre}?${p.alarmas?.length ? ' Its CloudWatch alarms will also be deleted.' : ''}`),
                  aceptar: () => {
                    const r = cx.hacer({ servicio: 'AutoScaling', accion: 'DeletePolicy', error: 'Failed to delete scaling policy' }, (e) => eliminarPoliticaEscalado(e, nombre, p.nombre));
                    if (!r.ok) return false;
                    cx.flash({ tipo: 'exito', texto: `Scaling policy ${p.nombre} deleted successfully.` });
                  }
                })
            }
          ],
          { desactivado: !p }
        ),
        ui.boton('Create dynamic scaling policy', { escribe: true, desactivado: g?.estado !== 'activo', alClic: () => cx.ir(`${rutaGrupo(nombre)}/politicas/crear`) })
      ];
    },
    vacio: { titulo: 'No dynamic scaling policies', texto: 'Create a dynamic scaling policy to scale your group automatically.' }
  });
  const programadas = ui.tabla(cx, {
    titulo: 'Scheduled actions',
    info: 'accion-programada',
    variante: 'contenedor',
    descripcion: 'Scheduled actions change the group size at the dates and times that you choose.',
    filas: () => grupoDe(cx, nombre)?.programadas ?? [],
    clave: (p) => p.nombre,
    seleccion: 'unica',
    filtro: 'Filter scheduled actions',
    columnas: [
      { titulo: 'Name', valor: (p) => p.nombre },
      { titulo: 'Desired capacity', valor: (p) => ui.guion(p.deseado) },
      { titulo: 'Min', valor: (p) => ui.guion(p.min) },
      { titulo: 'Max', valor: (p) => ui.guion(p.max) },
      { titulo: 'Recurrence', valor: (p) => RECURRENCIAS.find((r) => r.valor === p.recurrencia)?.etiqueta ?? p.recurrencia },
      { titulo: 'Time zone', valor: () => 'Etc/UTC' },
      { titulo: 'Start time', valor: (p) => ui.fecha(p.inicio) },
      { titulo: 'End time', valor: (p) => ui.fecha(p.fin) }
    ],
    acciones: (sel) => [
      ui.menuBoton(
        'Actions',
        () => [
          {
            texto: 'Delete',
            escribe: true,
            desactivado: !sel.length,
            alClic: () => {
              const r = cx.hacer({ servicio: 'AutoScaling', accion: 'DeleteScheduledAction', error: 'Failed to delete scheduled action' }, (e) => eliminarAccionProgramada(e, nombre, sel[0].nombre));
              if (r.ok) cx.flash({ tipo: 'exito', texto: `Scheduled action ${sel[0].nombre} deleted successfully.` });
            }
          }
        ],
        { desactivado: !sel.length }
      ),
      ui.boton('Create scheduled action', { escribe: true, desactivado: grupoDe(cx, nombre)?.estado !== 'activo', alClic: () => grupoDe(cx, nombre) && crearProgramada(cx, grupoDe(cx, nombre)) })
    ],
    vacio: { titulo: 'No scheduled actions', texto: 'Scheduled actions change the size of the group at a specific time.' }
  });
  return [
    politicas,
    ui.contenedor({
      titulo: 'Predictive scaling policies (0)',
      descripcion: 'Predictive scaling forecasts future load based on historical data and launches capacity ahead of time.',
      acciones: ui.boton('Create predictive scaling policy', { desactivado: true }),
      cuerpo: h('p', { class: 'cx-texto-sec' }, 'El escalado predictivo necesita días de métricas: en el simulador no está disponible.')
    }),
    programadas
  ];
}

function pestanaInstancias(cx, nombre) {
  const t = ui.tabla(cx, {
    titulo: 'Instances',
    info: 'ciclo-asg',
    variante: 'contenedor',
    filas: () => grupoDe(cx, nombre)?.instancias ?? [],
    clave: (m) => m.id,
    seleccion: 'multiple',
    filtro: 'Filter instances',
    columnas: [
      { titulo: 'Instance ID', valor: (m) => ui.enlace(m.id, `ec2/instancias/${m.id}`, { cx, externo: true }) },
      { titulo: 'Lifecycle', valor: (m) => m.ciclo },
      { titulo: 'Instance type', valor: (m) => cx.estado.instancias.find((i) => i.id === m.id)?.tipo ?? '–' },
      { titulo: 'Weighted capacity', valor: () => '–' },
      { titulo: 'Launch template/configuration', valor: (m) => (plantillaDe(cx, m.plantillaId) ? ui.enlace(plantillaDe(cx, m.plantillaId).nombre, `ec2/plantillas/${m.plantillaId}`, { cx }) : m.plantillaId) },
      { titulo: 'Availability Zone', valor: (m) => zonaAsg(m.az) },
      { titulo: 'Health status', valor: (m) => (m.salud === 'Healthy' ? ui.estado('exito', 'Healthy') : ui.estado('error', 'Unhealthy')) },
      { titulo: 'Protected from', valor: (m) => (m.protegida ? 'Scale in' : '–') }
    ],
    acciones: (sel) => {
      const ids = sel.map((m) => m.id);
      const hacer = (accion, fn, texto) => {
        const r = cx.hacer({ servicio: 'AutoScaling', accion, error: 'Failed to update instances' }, fn);
        if (r.ok) cx.flash({ tipo: 'exito', texto });
      };
      return [
        ui.menuBoton(
          'Actions',
          () => [
            { texto: 'Detach', escribe: true, desactivado: !sel.length, alClic: () => separar(cx, nombre, sel) },
            { texto: 'Set to Standby', escribe: true, desactivado: !sel.length || sel.some((m) => m.ciclo !== 'InService'), alClic: () => hacer('EnterStandby', (e) => esperaInstanciasAsg(e, nombre, ids, true), `Moved ${ids.join(', ')} to Standby.`) },
            { texto: 'Set to InService', escribe: true, desactivado: !sel.length || sel.some((m) => m.ciclo !== 'Standby'), alClic: () => hacer('ExitStandby', (e) => esperaInstanciasAsg(e, nombre, ids, false), `Moved ${ids.join(', ')} out of Standby.`) },
            { texto: 'Set scale-in protection', escribe: true, desactivado: !sel.length, alClic: () => hacer('SetInstanceProtection', (e) => protegerInstanciasAsg(e, nombre, ids, true), `Scale-in protection set for ${ids.join(', ')}.`) },
            { texto: 'Remove scale-in protection', escribe: true, desactivado: !sel.length, alClic: () => hacer('SetInstanceProtection', (e) => protegerInstanciasAsg(e, nombre, ids, false), `Scale-in protection removed for ${ids.join(', ')}.`) },
            '-',
            { texto: 'Replace root volume', desactivado: true }
          ],
          { desactivado: !sel.length }
        )
      ];
    },
    vacio: { titulo: 'No instances', texto: 'This Auto Scaling group has no instances yet. Wait a few seconds and refresh.' }
  });
  return [
    t,
    ui.contenedor({
      titulo: 'Lifecycle hooks (0)',
      descripcion: 'Lifecycle hooks let you perform custom actions as the group launches or terminates instances.',
      acciones: ui.boton('Create lifecycle hook', { desactivado: true }),
      cuerpo: h('p', { class: 'cx-texto-sec' }, 'No lifecycle hooks.')
    }),
    ui.contenedor({ titulo: 'Warm pool', acciones: ui.boton('Create warm pool', { desactivado: true }), cuerpo: h('p', { class: 'cx-texto-sec' }, 'No warm pool.') })
  ];
}

function separar(cx, nombre, sel) {
  const st = { reemplazar: true };
  cx.confirmar({
    titulo: 'Detach instance',
    textoBoton: 'Detach instance',
    contenido: [
      h('p', {}, `The following instances will be detached from ${nombre}. They keep running, but they are no longer part of the group:`),
      h('ul', {}, sel.map((m) => h('li', {}, m.id))),
      ui.casilla({ etiqueta: 'Add a new instance to the Auto Scaling group to balance the load', descripcion: 'If you don’t select this option, the desired capacity decreases.', marcada: true, alCambiar: (x) => (st.reemplazar = x) })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'AutoScaling', accion: 'DetachInstances', error: 'Failed to detach instances' }, (e) => separarInstanciasAsg(e, nombre, sel.map((m) => m.id), { reemplazar: st.reemplazar }));
      if (!r.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Detached ${sel.map((m) => m.id).join(', ')} from ${nombre}.` });
    }
  });
}

function pestanaActividad(cx, nombre) {
  const notificaciones = ui.tabla(cx, {
    titulo: 'Activity notifications',
    info: 'notificaciones-asg',
    variante: 'contenedor',
    filas: () => (grupoDe(cx, nombre)?.notificaciones ?? []).map((n, i) => ({ ...n, i })),
    clave: (n) => String(n.i),
    seleccion: null,
    filtro: false,
    columnas: [
      { titulo: 'SNS topic', valor: (n) => n.temaArn.split(':').pop() },
      { titulo: 'Event types', valor: (n) => n.eventos.map((x) => ({ launch: 'Launch', terminate: 'Terminate', launch_error: 'Fail to launch', terminate_error: 'Fail to terminate' })[x]).join(', ') }
    ],
    vacio: { titulo: 'No notifications', texto: 'Add notifications when you create the group (Step 5) to receive an email for each launch and termination.' }
  });
  const historial = ui.tabla(cx, {
    titulo: 'Activity history',
    info: 'actividad-asg',
    variante: 'contenedor',
    filas: () => grupoDe(cx, nombre)?.actividad ?? [],
    clave: (a) => a.id,
    seleccion: null,
    filtro: 'Filter activity history',
    columnas: [
      {
        titulo: 'Status',
        valor: (a) => {
          const [tipo, texto] = ESTADOS_ACTIVIDAD[a.estado] ?? ['info', a.estado];
          return ui.estado(tipo, texto);
        },
        texto: (a) => a.estado
      },
      { titulo: 'Description', valor: (a) => h('span', { class: 'cx-escalar-desc' }, a.descripcion) },
      { titulo: 'Cause', valor: (a) => h('span', { class: 'cx-escalar-causa' }, a.causa) },
      { titulo: 'Start time', valor: (a) => fechaAws(a.inicio) },
      { titulo: 'End time', valor: (a) => fechaAws(a.fin) }
    ],
    vacio: { titulo: 'No activities', texto: 'There are no scaling activities for this group yet.' }
  });
  return [notificaciones, historial];
}

/* ---------- Monitoring: gráficas SVG calculadas (no se guardan series) */

const SVG = 'http://www.w3.org/2000/svg';
function svg(etiqueta, atributos = {}, ...hijos) {
  const el = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const x of hijos.flat(Infinity)) if (x) el.append(x instanceof Node ? x : document.createTextNode(String(x)));
  return el;
}

/** El número de un eje como lo abrevia CloudWatch: 58.9k, 1.2M. */
function numeroEje(v) {
  if (v >= 1e6) return `${Math.round(v / 1e5) / 10}M`;
  if (v >= 1e4) return `${Math.round(v / 100) / 10}k`;
  return String(Math.round(v * 10) / 10);
}

/** Una gráfica de línea: puntos [{ t, v }] del más viejo al más nuevo. */
function grafica(titulo, unidad, puntos, { maximo } = {}) {
  const ancho = 460;
  const alto = 150;
  const izq = 40;
  const abajo = 22;
  const valores = puntos.map((p) => p.v).filter((v) => v !== null && v !== undefined);
  const tope = maximo ?? Math.max(1, ...valores.map((v) => v * 1.15));
  const x = (i) => izq + (i * (ancho - izq - 6)) / Math.max(1, puntos.length - 1);
  const y = (v) => 6 + (alto - abajo - 6) * (1 - Math.min(v, tope) / tope);
  const tramos = [];
  let actual = [];
  puntos.forEach((p, i) => {
    if (p.v === null || p.v === undefined) {
      if (actual.length) tramos.push(actual);
      actual = [];
    } else actual.push(`${x(i).toFixed(1)},${y(p.v).toFixed(1)}`);
  });
  if (actual.length) tramos.push(actual);
  const hora = (t) => {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };
  const ultimo = valores.length ? valores.at(-1) : null;
  return h(
    'div',
    { class: 'cx-escalar-grafica' },
    h('div', { class: 'cx-escalar-grafica__titulo' }, h('b', {}, titulo), h('span', { class: 'cx-texto-sec' }, ` ${unidad}`), h('span', { class: 'cx-escalar-grafica__valor' }, ultimo === null ? 'No data' : String(Math.round(ultimo * 100) / 100))),
    svg(
      'svg',
      { viewBox: `0 0 ${ancho} ${alto}`, class: 'cx-escalar-grafica__svg', role: 'img', 'aria-label': titulo },
      [0, 0.5, 1].map((f) => [svg('line', { x1: izq, x2: ancho - 6, y1: y(tope * f), y2: y(tope * f), class: 'cx-escalar-grafica__rejilla' }), svg('text', { x: izq - 6, y: y(tope * f) + 4, 'text-anchor': 'end', class: 'cx-escalar-grafica__eje' }, numeroEje(tope * f))]),
      tramos.map((t) => (t.length === 1 ? svg('circle', { cx: t[0].split(',')[0], cy: t[0].split(',')[1], r: 2.5, class: 'cx-escalar-grafica__punto' }) : svg('polyline', { points: t.join(' '), class: 'cx-escalar-grafica__linea' }))),
      puntos.length ? [svg('text', { x: izq, y: alto - 4, class: 'cx-escalar-grafica__eje' }, hora(puntos[0].t)), svg('text', { x: ancho - 6, y: alto - 4, 'text-anchor': 'end', class: 'cx-escalar-grafica__eje' }, hora(puntos.at(-1).t))] : null
    ),
    valores.length ? null : h('div', { class: 'cx-escalar-grafica__vacia cx-texto-sec' }, 'No data available. Wait a few periods (10 s each) after the instances start.')
  );
}

/** La serie de una métrica: la de CloudWatch (serieMetrica) si existe; si no, se calcula aquí. */
function serie(cx, consulta, puntos = 30) {
  if (typeof modelo.serieMetrica === 'function') return modelo.serieMetrica(cx.estado, consulta, { puntos, ahora: Date.now() });
  const p = DURACION_AUTOSCALING.periodo;
  const ultimo = Math.floor(Date.now() / p) - 1;
  return Array.from({ length: puntos }, (_, i) => {
    const t = (ultimo - puntos + 1 + i) * p;
    return { t, v: metricaAsg(cx.estado, consulta, t + p) };
  });
}

function pestanaMonitoreo(cx, nombre) {
  const st = { vista: 'ec2' };
  const zona = cx.vivo(() => {
    const g = grupoDe(cx, nombre);
    if (!g) return null;
    const dim = { AutoScalingGroupName: g.nombre };
    const ec2 = (metrica, estadistica = 'Average') => serie(cx, { namespace: 'AWS/EC2', metrica, dimensiones: dim, estadistica });
    const asg = (metrica) => serie(cx, { namespace: 'AWS/AutoScaling', metrica, dimensiones: dim, estadistica: 'Average' });
    const conCw = existeFuncion('valorMetrica');
    return h(
      'div',
      { class: 'cx-form' },
      ui.segmentado({ opciones: [{ valor: 'asg', etiqueta: 'Auto Scaling' }, { valor: 'ec2', etiqueta: 'EC2' }], valor: st.vista, alCambiar: (x) => ((st.vista = x), zona.repintar()) }),
      st.vista === 'ec2'
        ? h(
            'div',
            { class: 'cx-escalar-graficas' },
            grafica('CPU Utilization', '(Percent)', ec2('CPUUtilization'), { maximo: 100 }),
            conCw ? grafica('Network In', '(Bytes)', ec2('NetworkIn')) : null,
            conCw ? grafica('Network Out', '(Bytes)', ec2('NetworkOut')) : null,
            conCw ? grafica('Status Check Failed (Any)', '(Count)', ec2('StatusCheckFailed', 'Sum'), { maximo: 1 }) : null
          )
        : conCw
          ? h(
              'div',
              { class: 'cx-escalar-graficas' },
              grafica('Group In Service Instances', '(Count)', asg('GroupInServiceInstances'), { maximo: Math.max(1, g.max) }),
              grafica('Group Desired Capacity', '(Count)', asg('GroupDesiredCapacity'), { maximo: Math.max(1, g.max) }),
              grafica('Group Pending Instances', '(Count)', asg('GroupPendingInstances'), { maximo: Math.max(1, g.max) }),
              grafica('Group Terminating Instances', '(Count)', asg('GroupTerminatingInstances'), { maximo: Math.max(1, g.max) })
            )
          : ui.pares(
              [
                { etiqueta: 'Group In Service Instances', valor: String(g.instancias.filter((m) => m.ciclo === 'InService').length) },
                { etiqueta: 'Group Desired Capacity', valor: String(g.deseado) },
                { etiqueta: 'Group Pending Instances', valor: String(g.instancias.filter((m) => m.ciclo === 'Pending').length) },
                { etiqueta: 'Group Terminating Instances', valor: String(g.instancias.filter((m) => m.ciclo === 'Terminating').length) }
              ],
              { columnas: 4 }
            ),
      h('p', { class: 'cx-texto-sec' }, 'Cada punto es un periodo de CloudWatch: en el simulador dura 10 segundos (en AWS, 1 o 5 minutos).')
    );
  });
  return ui.contenedor({ titulo: 'Monitoring', info: 'monitoreo-asg', cx, acciones: ui.boton('View all CloudWatch metrics', { iconoDerecha: 'external', desactivado: !cx.servicioDe('cloudwatch') || cx.servicioDe('cloudwatch').proximamente, alClic: () => cx.ir('cloudwatch') }), cuerpo: zona });
}

function detalleGrupo(cx, { nombre: crudo }) {
  const nombre = decodificar(crudo);
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Auto Scaling groups', ruta: 'ec2/autoscaling' }, { texto: nombre }]);
  if (!grupoDe(cx, nombre)) return noExiste(cx, 'Auto Scaling group', nombre, 'ec2/autoscaling');
  // Si se llega desde «Create dynamic scaling policy», abre la pestaña de donde salió.
  const pedida = cx.memoria.pestanaGrupo?.nombre === nombre ? cx.memoria.pestanaGrupo.pestana : null;
  cx.memoria.pestanaGrupo = null;
  const st = { pestana: pedida ?? 'detalles' };
  const cabeza = cx.vivo(() => {
    const g = grupoDe(cx, nombre);
    if (!g) return noExiste(cx, 'Auto Scaling group', nombre, 'ec2/autoscaling');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: g.nombre,
        info: 'grupo-autoscaling',
        cx,
        acciones: [
          ui.botonRefrescar(() => cx.refrescar()),
          ui.boton('Simular hora pico', { icono: 'upload', escribe: true, desactivado: g.estado !== 'activo', titulo: 'Botón propio del simulador: sube la CPU del grupo', alClic: () => simularHoraPico(cx, g) }),
          ui.menuBoton(
            'Actions',
            () => [
              { texto: 'Edit', escribe: true, desactivado: g.estado !== 'activo', alClic: () => cx.ir(`${rutaGrupo(g)}/editar`) },
              { texto: 'Delete', escribe: true, desactivado: g.estado !== 'activo', alClic: () => borrarGrupos(cx, [g]) },
              '-',
              { texto: 'Start instance refresh', desactivado: true },
              { texto: 'Add or edit warm pool', desactivado: true }
            ],
            { alinear: 'derecha' }
          )
        ]
      }),
      g.estado === 'borrando' ? ui.alerta({ tipo: 'info', titulo: 'Deleting', contenido: 'This Auto Scaling group is being deleted. Its instances are terminating; the group disappears when they are gone.' }) : null,
      avisoHoraPico(cx, g),
      capacidad(cx, g)
    );
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    cabeza,
    ui.pestanas({
      activa: st.pestana,
      alCambiar: (p) => (st.pestana = p),
      pestanas: [
        { id: 'detalles', texto: 'Details', contenido: () => pestanaDetalles(cx, nombre) },
        { id: 'integraciones', texto: 'Integrations', contenido: () => pestanaIntegraciones(cx, nombre) },
        { id: 'escalado', texto: 'Automatic scaling', contenido: () => pestanaEscalado(cx, nombre) },
        { id: 'instancias', texto: 'Instance management', contenido: () => pestanaInstancias(cx, nombre) },
        { id: 'refresh', texto: 'Instance refresh', desactivada: true, contenido: () => null },
        { id: 'actividad', texto: 'Activity', contenido: () => pestanaActividad(cx, nombre) },
        { id: 'monitoreo', texto: 'Monitoring', contenido: () => pestanaMonitoreo(cx, nombre) }
      ]
    })
  );
}

/* =============================================================== Edit */

function editarGrupoPagina(cx, { nombre: crudo }) {
  const nombre = decodificar(crudo);
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Auto Scaling groups', ruta: 'ec2/autoscaling' }, { texto: nombre, ruta: rutaGrupo(nombre) }, { texto: 'Edit' }]);
  const g = grupoDe(cx, nombre);
  if (!g) return noExiste(cx, 'Auto Scaling group', nombre, 'ec2/autoscaling');
  const e = cx.estado;
  const vpcId = e.subredes.find((s) => s.id === g.subredes[0])?.vpcId;
  const f = {
    plantillaId: g.plantilla.id,
    version: g.plantilla.version,
    subredes: [...g.subredes],
    distribucion: g.distribucion,
    gruposDestino: [...g.gruposDestino],
    saludElb: g.tipoSalud === 'ELB',
    saludEbs: g.saludEbs,
    gracia: String(g.gracia),
    proteccion: g.proteccionReduccion,
    monitoreo: g.monitoreo
  };
  const zona = ui.region(() => {
    const p = plantillaDe(cx, f.plantillaId);
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.contenedor({
        titulo: 'Launch template',
        info: 'plantilla-lanzamiento',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-fila-campos' },
          ui.campo({ etiqueta: 'Launch template', control: ui.selector({ opciones: plantillas(cx).map((x) => ({ valor: x.id, etiqueta: x.nombre, descripcion: x.id })), valor: p ? f.plantillaId : null, placeholder: 'Select a launch template', alCambiar: (x) => ((f.plantillaId = x), (f.version = '$Default'), zona.repintar()) }) }),
          ui.campo({
            etiqueta: 'Version',
            control: ui.selector({
              opciones: p ? [{ valor: '$Default', etiqueta: `Default (${p.versionDefault})` }, { valor: '$Latest', etiqueta: `Latest (${p.ultimaVersion})` }, ...p.versiones.map((v) => ({ valor: String(v.numero), etiqueta: String(v.numero) }))] : [],
              valor: f.version,
              alCambiar: (x) => (f.version = x)
            })
          })
        )
      }),
      ui.contenedor({
        titulo: 'Network',
        info: 'zonas-asg',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.pares([{ etiqueta: 'VPC', valor: vpcId ?? '–' }], { columnas: 1 }),
          ui.campo({
            etiqueta: 'Availability Zones and subnets',
            control: ui.selector({
              multiple: true,
              valores: f.subredes,
              filtrar: true,
              opciones: e.subredes.filter((s) => s.vpcId === vpcId).map((s) => ({ valor: s.id, etiqueta: `${zonaAsg(s.az)} | ${s.id}${s.nombre ? ` (${s.nombre})` : ''}`, descripcion: s.cidr })),
              alCambiar: (x) => (f.subredes = x)
            })
          }),
          ui.campo({ etiqueta: 'Availability Zone distribution', control: ui.radios({ valor: f.distribucion, opciones: [{ valor: 'balanced-best-effort', etiqueta: 'Balanced best effort' }, { valor: 'balanced-only', etiqueta: 'Balanced only' }], alCambiar: (x) => (f.distribucion = x) }) })
        )
      }),
      ui.contenedor({
        titulo: 'Load balancing',
        info: 'balanceo-asg',
        cx,
        cuerpo: ui.campo({
          etiqueta: 'Load balancer target groups',
          descripcion: 'Instances of the group are registered in these target groups.',
          control: ui.selector({
            multiple: true,
            valores: f.gruposDestino,
            filtrar: true,
            placeholder: 'Select target groups',
            vacio: 'No target groups in this VPC',
            opciones: (e.elb?.gruposDestino ?? []).filter((t) => t.vpcId === vpcId).map((t) => ({ valor: t.arn, etiqueta: `${t.nombre} | ${t.protocolo}`, descripcion: `Port ${t.puerto}` })),
            alCambiar: (x) => (f.gruposDestino = x)
          })
        })
      }),
      ui.contenedor({
        titulo: 'Health checks',
        info: 'salud-asg',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.casilla({ etiqueta: 'Turn on Elastic Load Balancing health checks', marcada: f.saludElb, alCambiar: (x) => (f.saludElb = x) }),
          ui.casilla({ etiqueta: 'Turn on Amazon EBS health checks', marcada: f.saludEbs, alCambiar: (x) => (f.saludEbs = x) }),
          ui.campo({ etiqueta: 'Health check grace period', control: h('div', { style: { maxWidth: '160px' } }, ui.entrada({ tipo: 'number', valor: f.gracia, sufijo: 'seconds', alCambiar: (x) => (f.gracia = x) })) })
        )
      }),
      ui.contenedor({
        titulo: 'Advanced configurations',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.casilla({ etiqueta: 'Enable instance scale-in protection', descripcion: 'New instances launched by the group will be protected from scale in.', marcada: f.proteccion, alCambiar: (x) => (f.proteccion = x) }),
          ui.casilla({ etiqueta: 'Enable group metrics collection within CloudWatch', marcada: f.monitoreo, alCambiar: (x) => (f.monitoreo = x) })
        )
      })
    );
  });
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: `Edit ${g.nombre}`, info: 'grupo-autoscaling', cx, descripcion: 'Change the launch template, network, load balancing and health checks of the group. To change the group size, use Edit in Capacity overview.' }),
    zona,
    ui.pieFormulario({
      cancelar: () => cx.ir(rutaGrupo(g)),
      textoEnviar: 'Update',
      enviar: () => {
        const r = cx.hacer({ servicio: 'AutoScaling', accion: 'UpdateAutoScalingGroup', error: 'Failed to update Auto Scaling group' }, (est) =>
          editarGrupoAutoScaling(est, g.nombre, {
            plantillaId: f.plantillaId,
            version: f.version,
            subredes: f.subredes,
            distribucion: f.distribucion,
            gruposDestino: f.gruposDestino,
            tipoSalud: f.saludElb ? 'ELB' : 'EC2',
            saludEbs: f.saludEbs,
            gracia: f.gracia === '' ? '' : Number(f.gracia),
            proteccionReduccion: f.proteccion,
            monitoreo: f.monitoreo
          })
        );
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: `${g.nombre} updated successfully` });
          cx.ir(rutaGrupo(g));
        }
      }
    })
  );
}

/* ================================================== políticas: crear y editar */

function paginaPolitica(cx, { nombre: crudo, politica }) {
  const nombre = decodificar(crudo);
  const editando = politica !== undefined && politica !== 'crear';
  const nombrePol = editando ? decodificar(politica) : null;
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Auto Scaling groups', ruta: 'ec2/autoscaling' }, { texto: nombre, ruta: rutaGrupo(nombre) }, { texto: editando ? 'Edit scaling policy' : 'Create dynamic scaling policy' }]);
  const g = grupoDe(cx, nombre);
  if (!g) return noExiste(cx, 'Auto Scaling group', nombre, 'ec2/autoscaling');
  const anterior = editando ? g.politicas.find((p) => p.nombre === nombrePol) : null;
  if (editando && !anterior) return noExiste(cx, 'Scaling policy', nombrePol, rutaGrupo(nombre));
  const alarmas = (cx.estado.cloudwatch?.alarmas ?? []).filter((a) => a.creadaPor !== 'autoscaling');
  const f = {
    tipo: anterior?.tipo ?? 'TargetTrackingScaling',
    nombre: anterior?.nombre ?? (g.politicas.some((p) => p.nombre === 'Target Tracking Policy') ? '' : 'Target Tracking Policy'),
    metrica: anterior?.metrica ?? 'ASGAverageCPUUtilization',
    grupoDestino: anterior?.grupoDestino ?? g.gruposDestino[0] ?? null,
    objetivo: String(anterior?.objetivo ?? 50),
    calentamiento: String(anterior?.calentamiento ?? 300),
    sinReducir: anterior?.sinReducir ?? false,
    alarma: anterior?.alarma ?? null,
    accion: anterior?.ajuste === 'ExactCapacity' ? 'set' : (anterior?.valor ?? anterior?.pasos?.[0]?.valor ?? 1) < 0 ? 'remove' : 'add',
    unidad: anterior?.ajuste === 'PercentChangeInCapacity' ? 'percent' : 'units',
    valor: String(Math.abs(anterior?.valor ?? 1)),
    pasos: (anterior?.pasos ?? [{ inferior: 0, superior: null, valor: 1 }]).map((s) => ({ inferior: s.inferior ?? '', superior: s.superior ?? '', valor: String(Math.abs(s.valor)) })),
    enfriamiento: String(anterior?.enfriamiento ?? 300)
  };
  const zona = ui.region(() => {
    const accion = ui.selector({
      opciones: [
        { valor: 'add', etiqueta: 'Add' },
        { valor: 'remove', etiqueta: 'Remove' },
        { valor: 'set', etiqueta: 'Set to' }
      ],
      valor: f.accion,
      alCambiar: (x) => ((f.accion = x), zona.repintar())
    });
    const unidad = ui.selector({
      opciones: [
        { valor: 'units', etiqueta: 'capacity units' },
        { valor: 'percent', etiqueta: 'percent of group', desactivado: f.accion === 'set' }
      ],
      valor: f.accion === 'set' ? 'units' : f.unidad,
      alCambiar: (x) => (f.unidad = x)
    });
    const campoAlarma = ui.campo({
      etiqueta: 'CloudWatch alarm',
      info: 'politica-pasos',
      cx,
      descripcion: 'Choose an alarm that can scale capacity whenever its threshold is breached.',
      control: ui.selector({ opciones: alarmas.map((a) => ({ valor: a.nombre, etiqueta: a.nombre, descripcion: a.razon ?? undefined })), valor: f.alarma, placeholder: 'Select an alarm', vacio: 'No CloudWatch alarms. Create one in CloudWatch › Alarms.', filtrar: true, alCambiar: (x) => (f.alarma = x) }),
      restriccion: ui.enlace('Create a CloudWatch alarm', () => cx.ir('cloudwatch'), { externo: true })
    });
    return h(
      'div',
      { class: 'cx-form' },
      ui.campo({
        etiqueta: 'Policy type',
        control: ui.selector({
          opciones: [
            { valor: 'TargetTrackingScaling', etiqueta: 'Target tracking scaling' },
            { valor: 'StepScaling', etiqueta: 'Step scaling' },
            { valor: 'SimpleScaling', etiqueta: 'Simple scaling' }
          ],
          valor: f.tipo,
          desactivado: editando,
          alCambiar: (x) => ((f.tipo = x), (f.nombre = f.nombre || (x === 'TargetTrackingScaling' ? 'Target Tracking Policy' : '')), zona.repintar())
        })
      }),
      ui.campo({ etiqueta: 'Scaling policy name', control: ui.entrada({ valor: f.nombre, alCambiar: (x) => (f.nombre = x) }) }),
      f.tipo === 'TargetTrackingScaling'
        ? [
            ui.campo({
              etiqueta: 'Metric type',
              info: 'politica-seguimiento',
              cx,
              control: ui.selector({ opciones: METRICAS_SEGUIMIENTO.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta, desactivado: m.valor === 'ALBRequestCountPerTarget' && !g.gruposDestino.length })), valor: f.metrica, alCambiar: (x) => ((f.metrica = x), zona.repintar()) })
            }),
            f.metrica === 'ALBRequestCountPerTarget'
              ? ui.campo({ etiqueta: 'Target group', control: ui.selector({ opciones: g.gruposDestino.map((arn) => ({ valor: arn, etiqueta: nombreTg(cx, arn) })), valor: f.grupoDestino, alCambiar: (x) => (f.grupoDestino = x) }) })
              : null,
            ui.campo({ etiqueta: 'Target value', control: h('div', { style: { maxWidth: '140px' } }, ui.entrada({ tipo: 'number', valor: f.objetivo, alCambiar: (x) => (f.objetivo = x) })) }),
            ui.campo({ etiqueta: 'Instances need', info: 'calentamiento', cx, control: h('div', { style: { maxWidth: '260px' } }, ui.entrada({ tipo: 'number', valor: f.calentamiento, sufijo: 'seconds to warm up before including in metric', alCambiar: (x) => (f.calentamiento = x) })) }),
            ui.casilla({ etiqueta: 'Disable scale in to create only a scale-out policy', marcada: f.sinReducir, alCambiar: (x) => (f.sinReducir = x) })
          ]
        : null,
      f.tipo === 'SimpleScaling'
        ? [
            campoAlarma,
            ui.campo({ etiqueta: 'Take the action', control: h('div', { class: 'cx-fila-campos' }, h('div', { style: { width: '130px' } }, accion), h('div', { style: { width: '90px' } }, ui.entrada({ tipo: 'number', valor: f.valor, etiquetaAccesible: 'Value', alCambiar: (x) => (f.valor = x) })), h('div', { style: { width: '190px' } }, unidad)) }),
            ui.campo({ etiqueta: 'And then wait', control: h('div', { style: { maxWidth: '360px' } }, ui.entrada({ tipo: 'number', valor: f.enfriamiento, sufijo: 'seconds before allowing another scaling activity', alCambiar: (x) => (f.enfriamiento = x) })) })
          ]
        : null,
      f.tipo === 'StepScaling'
        ? [
            campoAlarma,
            ui.campo({
              etiqueta: 'Take the action',
              descripcion: 'The step bounds are relative to the alarm threshold (breach = metric value − threshold). Leave a bound empty for infinity.',
              control: h(
                'div',
                { class: 'cx-form' },
                h('div', { style: { width: '160px' } }, accion),
                f.pasos.map((s, i) =>
                  h(
                    'div',
                    { class: 'cx-fila-campos cx-escalar-paso' },
                    h('div', { style: { width: '90px' } }, ui.entrada({ tipo: 'number', valor: s.valor, etiquetaAccesible: 'Value', alCambiar: (x) => (s.valor = x) })),
                    h('div', { style: { width: '170px' } }, unidad),
                    h('span', {}, 'when'),
                    h('div', { style: { width: '90px' } }, ui.entrada({ tipo: 'number', valor: s.inferior, placeholder: '-infinity', etiquetaAccesible: 'Lower bound', alCambiar: (x) => (s.inferior = x) })),
                    h('span', {}, '<= breach <'),
                    h('div', { style: { width: '90px' } }, ui.entrada({ tipo: 'number', valor: s.superior, placeholder: '+infinity', etiquetaAccesible: 'Upper bound', alCambiar: (x) => (s.superior = x) })),
                    f.pasos.length > 1 ? ui.boton('Remove', { alClic: () => (f.pasos.splice(i, 1), zona.repintar()) }) : null
                  )
                ),
                h('div', {}, ui.boton('Add step', { alClic: () => (f.pasos.push({ inferior: '', superior: '', valor: '1' }), zona.repintar()) }))
              )
            }),
            ui.campo({ etiqueta: 'Instances need', info: 'calentamiento', cx, control: h('div', { style: { maxWidth: '360px' } }, ui.entrada({ tipo: 'number', valor: f.calentamiento, sufijo: 'seconds to warm up after each step', alCambiar: (x) => (f.calentamiento = x) })) })
          ]
        : null,
      f.tipo !== 'TargetTrackingScaling' && !existeFuncion('agregarAccionAlarma')
        ? ui.alerta({ tipo: 'info', contenido: 'Para que la alarma dispare esta política, en CloudWatch › Alarms edita la alarma y agrega una acción de Auto Scaling (Auto Scaling action) que elija este grupo y esta política.' })
        : null
    );
  });
  const firmar = (v) => (f.accion === 'remove' ? -Math.abs(Number(v)) : Math.abs(Number(v)));
  const ajuste = () => (f.accion === 'set' ? 'ExactCapacity' : f.unidad === 'percent' ? 'PercentChangeInCapacity' : 'ChangeInCapacity');
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: editando ? 'Edit scaling policy' : 'Create dynamic scaling policy', info: f.tipo === 'TargetTrackingScaling' ? 'politica-seguimiento' : 'politica-pasos', cx, descripcion: `Auto Scaling group: ${g.nombre}` }),
    ui.contenedor({ cuerpo: zona }),
    ui.pieFormulario({
      cancelar: () => irAPestanaGrupo(cx, g, 'escalado'),
      textoEnviar: editando ? 'Update' : 'Create',
      enviar: () => {
        const p = {
          nombre: f.nombre,
          tipo: f.tipo,
          metrica: f.metrica,
          grupoDestino: f.metrica === 'ALBRequestCountPerTarget' ? f.grupoDestino : null,
          objetivo: Number(f.objetivo),
          calentamiento: f.calentamiento === '' ? 300 : Number(f.calentamiento),
          sinReducir: f.sinReducir,
          alarma: f.alarma,
          ajuste: ajuste(),
          valor: f.accion === 'set' ? Math.abs(Number(f.valor)) : firmar(f.valor),
          pasos: f.pasos.map((s) => ({ inferior: s.inferior, superior: s.superior, valor: f.accion === 'set' ? Math.abs(Number(s.valor)) : firmar(s.valor) })),
          enfriamiento: f.enfriamiento === '' ? 300 : Number(f.enfriamiento)
        };
        const r = cx.hacer({ servicio: 'AutoScaling', accion: 'PutScalingPolicy', error: editando ? 'Failed to update scaling policy' : 'Failed to create scaling policy' }, (e) =>
          editando ? editarPoliticaEscalado(e, g.nombre, anterior.nombre, p) : crearPoliticaEscalado(e, g.nombre, p)
        );
        if (r.ok) {
          cx.flash({ tipo: 'exito', texto: editando ? `Scaling policy ${r.valor.nombre} updated successfully.` : `Scaling policy ${r.valor.nombre} created successfully.` });
          irAPestanaGrupo(cx, g, 'escalado');
        }
      }
    })
  );
}

/* ================================================================ ayudas */

export const ayudasEscalar = {
  'plantilla-lanzamiento': {
    titulo: 'Plantilla de lanzamiento',
    texto: [
      'Una **launch template** es la **receta** de una instancia: sistema operativo (AMI), tipo, par de llaves, grupo de seguridad, disco y user data. La guardas una vez y la usas muchas veces.',
      'Auto Scaling la usa cada vez que necesita una instancia nueva: por eso todas las instancias del grupo salen iguales.',
      'Desde **Actions** puedes lanzar una instancia con ella (**Launch instance from template**), crear una nueva versión (**Modify template**) o borrarla.'
    ]
  },
  'version-plantilla': {
    titulo: 'Versiones de la plantilla',
    texto: [
      'Una plantilla no se edita: se le crean **versiones** (1, 2, 3…). Así puedes regresar a una versión anterior si la nueva falla.',
      '**Default** es la versión que se usa si no dices otra; **Latest** es la más nueva. Un grupo de Auto Scaling con «Latest» usa siempre la última versión en sus instancias nuevas.',
      'La versión nueva **no** se vuelve Default sola: usa Actions → **Set default version**.'
    ]
  },
  'guia-autoscaling': {
    titulo: 'Auto Scaling guidance',
    texto: [
      'Marca esta casilla si la plantilla es para un **grupo de Auto Scaling**. La consola te avisa qué campos sirven y cuáles no.',
      'La regla más importante: **no incluyas la subred** en la plantilla. El grupo decide en qué subredes (y zonas) lanza cada instancia.'
    ]
  },
  'etiquetas-plantilla': {
    titulo: 'Resource tags',
    texto: ['Las etiquetas que pongas aquí se copian a cada instancia que se lance con la plantilla. La etiqueta **Name** es el nombre que ves en la lista de instancias.']
  },
  'grupo-autoscaling': {
    titulo: 'Grupo de Auto Scaling',
    texto: [
      'Un **Auto Scaling group** es un grupo de instancias iguales (salen de la misma plantilla) que AWS mantiene vivo por ti:',
      [
        '**Se cura solo:** si una instancia se apaga o se borra, lanza otra para reemplazarla.',
        '**Crece y se encoge:** con políticas de escalado, agrega instancias cuando hay mucha carga y las quita cuando baja.',
        '**Reparte en zonas:** si eliges subredes en dos o más zonas, pone instancias en cada una (alta disponibilidad).'
      ],
      'Para borrarlo usa **Delete**: primero pasa a **Deleting**, termina sus instancias y luego desaparece.'
    ]
  },
  'capacidad-asg': {
    titulo: 'Desired, Min y Max',
    texto: [
      [
        '**Desired capacity:** cuántas instancias quieres ahora. El grupo lanza o termina hasta llegar a ese número.',
        '**Min desired capacity:** el mínimo; el grupo nunca baja de aquí.',
        '**Max desired capacity:** el máximo; ni la política más ansiosa pasa de aquí (te protege de una factura enorme).'
      ],
      'Siempre debe cumplirse: **Min ≤ Desired ≤ Max**. Si no, AWS responde con un error de validación.'
    ]
  },
  'zonas-asg': {
    titulo: 'Zonas y subredes del grupo',
    texto: [
      'Elige subredes en **dos o más zonas de disponibilidad**: si un centro de datos falla, las instancias de la otra zona siguen atendiendo.',
      '**Balanced best effort:** si no puede lanzar en una zona, prueba en otra. **Balanced only:** insiste en la misma zona para mantener el reparto parejo.',
      'Para que tus páginas se vean desde internet, las subredes deben ser **públicas** (con ruta al Internet Gateway) o estar detrás de un balanceador.'
    ]
  },
  'balanceo-asg': {
    titulo: 'Balanceador y Auto Scaling',
    texto: [
      'Con un **balanceador** (ALB) tus clientes usan una sola dirección y el balanceador reparte las visitas entre las instancias sanas del grupo.',
      'El grupo **registra solo** cada instancia nueva en el **target group** y la quita cuando la termina.',
      '**Attach to a new load balancer** crea el balanceador y su target group aquí mismo. Ojo: usa el grupo de seguridad por omisión de la VPC; después edítalo para dejar entrar HTTP (80).'
    ]
  },
  'salud-asg': {
    titulo: 'Health checks del grupo',
    texto: [
      '**EC2** (siempre activo): si la instancia no está *running* (detenida, terminada), el grupo la reemplaza.',
      '**ELB** (opcional): además, si el balanceador dice que la instancia está **unhealthy** (por ejemplo, su servidor web no responde), el grupo la termina y lanza otra.',
      'El **grace period** es el tiempo que espera antes de revisar una instancia nueva, para darle chance de instalar todo. En AWS se usa 300 s; en el simulador ese tiempo dura 15 s.'
    ]
  },
  'politica-seguimiento': {
    titulo: 'Target tracking',
    texto: [
      'La política de **seguimiento de objetivo** es como el termostato de tu casa: tú dices «quiero la CPU en 50 %» y el grupo agrega o quita instancias para acercarse a ese valor.',
      'AWS crea dos alarmas en CloudWatch: `TargetTracking-…-AlarmHigh` (para crecer) y `TargetTracking-…-AlarmLow` (para encogerse). **No las borres ni las edites.**',
      'La nueva capacidad se calcula con una regla de tres: capacidad × métrica ÷ objetivo. Por ejemplo, 2 instancias al 90 % con objetivo 50 → 4 instancias.'
    ]
  },
  'politica-pasos': {
    titulo: 'Step y simple scaling',
    texto: [
      'Estas políticas reaccionan a una **alarma de CloudWatch** que tú creas (por ejemplo, CPU > 70 %).',
      '**Simple:** cuando suena la alarma hace una sola acción (agregar 1 instancia) y espera el *cooldown*.',
      '**Step:** la acción depende de qué tanto se pasó la métrica del umbral (por ejemplo, +1 si se pasó poco, +3 si se pasó mucho).',
      'La alarma debe tener una **acción de Auto Scaling** que apunte a esta política.'
    ]
  },
  calentamiento: {
    titulo: 'Warmup y cooldown',
    texto: [
      'Una instancia recién lanzada tarda en estar lista. El **warmup** (o el *cooldown* de las políticas simples) es el tiempo que el grupo espera antes de volver a escalar, para no lanzar de más.',
      'En el simulador el tiempo va acelerado: 300 s de AWS duran 20 s.'
    ]
  },
  'accion-programada': {
    titulo: 'Acciones programadas',
    texto: [
      'Cambian el tamaño del grupo a una hora fija: por ejemplo, «a las 8 pm sube a 4 instancias» porque sabes que a esa hora llegan más clientes.',
      'Pueden correr una vez (**Once**) o repetirse (cada hora, cada día…). Si dejas un campo vacío, se queda como está.'
    ]
  },
  'ciclo-asg': {
    titulo: 'Lifecycle y Health status',
    texto: [
      [
        '**Pending:** la instancia está arrancando.',
        '**InService:** ya trabaja para el grupo.',
        '**Standby:** sigue prendida pero el grupo no la cuenta (sirve para darle mantenimiento).',
        '**Terminating:** el grupo la está borrando (porque sobraba o porque estaba enferma).'
      ],
      '**Health status** dice si el health check la ve sana (**Healthy**) o enferma (**Unhealthy**, y entonces la reemplaza).'
    ]
  },
  'proteccion-asg': {
    titulo: 'Scale-in protection',
    texto: ['Una instancia **protegida** no se termina cuando el grupo se encoge (scale in). Sí se reemplaza si se enferma, y sí se borra al borrar el grupo.']
  },
  'actividad-asg': {
    titulo: 'Activity history',
    texto: [
      'Es la bitácora del grupo: cada instancia que lanzó o terminó, con su **causa** en el texto de AWS.',
      'Ahí ves la **autocuración**: «an instance was taken out of service in response to an EC2 health check…» seguida de «…launched in response to an unhealthy instance needing to be replaced».',
      'Y el escalado: «a monitor alarm TargetTracking-…-AlarmHigh… triggered policy… changing the desired capacity from 2 to 3».'
    ]
  },
  'notificaciones-asg': {
    titulo: 'Notificaciones',
    texto: ['El grupo puede avisar a un **tema de SNS** cada vez que lanza o termina una instancia (o cuando falla). Si el tema tiene una suscripción de correo confirmada, te llega un email.']
  },
  'etiquetas-asg': {
    titulo: 'Etiquetas del grupo',
    texto: ['Con **Tag new instances** marcado, la etiqueta se copia a cada instancia nueva. Usa **Name** para que tus instancias tengan nombre en la lista de EC2 (por ejemplo `web-asg`).']
  },
  'monitoreo-asg': {
    titulo: 'Monitoring',
    texto: [
      'Las gráficas de **EC2** muestran el promedio de las instancias del grupo (CPU, red). Las de **Auto Scaling** muestran cuántas instancias hay en cada estado.',
      'Usa el botón **Simular hora pico** (propio del simulador) para ver subir la CPU y escalar al grupo.'
    ]
  }
};

/** Las «Features» del buscador de la barra. */
export const busquedaEscalar = [
  { texto: 'Launch templates', ruta: 'ec2/plantillas', claves: 'plantilla template' },
  { texto: 'Create launch template', ruta: 'ec2/plantillas/crear', claves: 'plantilla' },
  { texto: 'Auto Scaling groups', ruta: 'ec2/autoscaling', claves: 'asg escalar escalado autoscaling' },
  { texto: 'Create Auto Scaling group', ruta: 'ec2/autoscaling/crear', claves: 'asg escalar' }
];

export const rutasEscalar = {
  plantillas: listaPlantillas,
  'plantillas/crear': crearPlantillaPagina,
  'plantillas/creada': plantillaCreada,
  'plantillas/:id': detallePlantilla,
  'plantillas/:id/modificar': modificarPlantilla,
  'plantillas/:id/lanzar': lanzarDesdePlantilla,
  autoscaling: listaGrupos,
  'autoscaling/crear': crearGrupoPagina,
  'autoscaling/:nombre': detalleGrupo,
  'autoscaling/:nombre/editar': editarGrupoPagina,
  'autoscaling/:nombre/politicas/crear': paginaPolitica,
  'autoscaling/:nombre/politicas/:politica': paginaPolitica
};
