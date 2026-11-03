// ---------------------------------------------------------------------------
// AMAZON EVENTBRIDGE
//
// La portada (Get started), Rules en el bus default, Create rule (asistente
// de 5 pasos: detalle, horario Schedule con rate/cron o patrón de eventos con
// el formulario de EC2 y el editor JSON, destinos Lambda/SQS/SNS, etiquetas y
// revisión), el detalle de la regla (Targets, Event schedule / Event pattern,
// Monitoring y Tags), Edit, Enable/Disable y Delete.
//
// El modelo vive en modelo/lambda.js. El tiempo va comprimido: una regla
// rate(N minutes) dispara cada N × 10 s (SIMULADOR.md §3). Event buses,
// Pipes y Scheduler van como «no disponible».
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import { cambiarEstadoRegla, crearRegla, editarRegla, eliminarRegla, funcionLambda, periodoRegla, probarPatronEventos, reglaEventBridge } from '../modelo.js';
import { noExiste } from './comun.js';
import { copiar, tablaEtiquetas } from './sns.js';

const { h } = ui;

const migaEb = { texto: 'Amazon EventBridge', ruta: 'eventbridge' };
const migaReglas = { texto: 'Rules', ruta: 'eventbridge/reglas' };
const reglas = (cx) => cx.estado.eventbridge?.reglas ?? [];
const rutaRegla = (r, resto = '') => `eventbridge/reglas/${encodeURIComponent(r.nombre ?? r)}${resto ? `/${resto}` : ''}`;
const arnBus = (cx) => `arn:aws:events:us-east-1:${cx.estado.cuenta?.id ?? '123456789012'}:event-bus/default`;

const tipoRegla = (r) => (r.tipo === 'programada' ? 'Scheduled Standard' : 'Standard');
const estadoRegla = (r) => (r.estado === 'ENABLED' ? ui.estado('exito', 'Enabled') : ui.estado('detenido', 'Disabled'));
const NOMBRE_DESTINO = { lambda: 'Lambda function', sqs: 'SQS queue', sns: 'SNS topic' };

/** «50 s», «10 min», «4 h»: cada cuánto dispara en el simulador. */
function textoPeriodo(ms) {
  const s = Math.round(ms / 1000);
  if (s < 120) return `${s} s`;
  if (s < 7200) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}

/** El nombre del recurso de un destino (la función, la cola o el tema). */
const nombreDestino = (arn) => String(arn).split(':').pop();

/** La ruta del recurso de un destino, para el enlace. */
function rutaDestino(d) {
  const n = encodeURIComponent(nombreDestino(d.arn));
  if (d.tipo === 'lambda') return `lambda/funciones/${n}`;
  if (d.tipo === 'sqs') return `sqs/colas/${n}`;
  if (d.tipo === 'sns') return `sns/temas/${n}`;
  return null;
}

/* ================================================================ portada */

function portada(cx) {
  cx.migas([migaEb]);
  return h(
    'div',
    { class: 'cx-pagina' },
    h(
      'div',
      { class: 'cx-msj-portada' },
      h(
        'div',
        { class: 'cx-msj-portada__texto' },
        h('p', { class: 'cx-texto-sec' }, 'Application Integration'),
        h('h1', { class: 'cx-msj-portada__titulo' }, 'Amazon EventBridge'),
        h('p', { class: 'cx-msj-portada__lema' }, 'Build event-driven applications at scale across AWS, existing systems, or SaaS apps.'),
        h('p', { class: 'cx-texto-sec' }, 'Amazon EventBridge is a serverless event bus that makes it easier to connect applications using data from your own apps, integrated SaaS apps, and AWS services. Use rules to route events to targets such as AWS Lambda, Amazon SQS, and Amazon SNS, or to run them on a schedule.')
      ),
      ui.contenedor({
        titulo: 'Get started',
        cuerpo: h('div', { class: 'cx-form' }, h('p', {}, 'Create a rule that reacts to events or runs on a schedule.'), h('div', { class: 'cx-acciones', style: { justifyContent: 'flex-end' } }, ui.boton('Create rule', { variante: 'primario', alClic: () => cx.ir('eventbridge/reglas/crear') })))
      })
    ),
    h(
      'div',
      { class: 'cx-msj-tarjetas-inicio' },
      ui.contenedor({
        titulo: 'EventBridge Rule',
        info: 'eb-regla',
        cx,
        cuerpo: [h('p', { class: 'cx-texto-sec' }, 'Route events from AWS services, your apps, or a schedule to one or more targets.'), ui.boton('Create rule', { escribe: true, alClic: () => cx.ir('eventbridge/reglas/crear') })]
      }),
      ui.contenedor({
        titulo: 'EventBridge Pipes',
        cuerpo: [h('p', { class: 'cx-texto-sec' }, 'Connect a source to a target with optional filtering, enrichment and transformation.'), ui.boton('Create pipe', { desactivado: true })]
      }),
      ui.contenedor({
        titulo: 'EventBridge Schedule',
        cuerpo: [h('p', { class: 'cx-texto-sec' }, 'Create, run and manage scheduled tasks at scale with EventBridge Scheduler.'), ui.boton('Create schedule', { desactivado: true }), h('small', { class: 'cx-texto-sec' }, 'Simulador: los horarios se crean como reglas de tipo Schedule.')]
      })
    ),
    ui.contenedor({
      titulo: 'How it works',
      cuerpo: h(
        'div',
        { class: 'cx-msj-flujo' },
        h('div', { class: 'cx-msj-flujo__caja' }, h('b', {}, 'Event source'), h('small', {}, 'AWS services (EC2…), or a schedule')),
        h('span', { class: 'cx-msj-flujo__flecha' }, '→'),
        h('div', { class: 'cx-msj-flujo__caja cx-msj-flujo__caja--tema' }, h('b', {}, 'Rule'), h('small', {}, 'Event pattern or rate() / cron()')),
        h('span', { class: 'cx-msj-flujo__flecha' }, '→'),
        h('div', { class: 'cx-msj-flujo__destinos' }, h('div', { class: 'cx-msj-flujo__caja' }, h('b', {}, 'Lambda')), h('div', { class: 'cx-msj-flujo__caja' }, h('b', {}, 'SQS')), h('div', { class: 'cx-msj-flujo__caja' }, h('b', {}, 'SNS')))
      )
    })
  );
}

/* ================================================================ la lista */

function borrarRegla(cx, r, { alTerminar } = {}) {
  cx.confirmar({
    titulo: `Delete rule ${r.nombre}?`,
    textoBoton: 'Delete',
    palabra: 'delete',
    contenido: [
      h('p', {}, 'Deleting this rule removes all of its targets. The rule stops sending events to them immediately.'),
      ui.alerta({ tipo: 'aviso', contenido: 'This action can’t be undone.' })
    ],
    aceptar: () => {
      const res = cx.hacer({ servicio: 'EventBridge', accion: 'DeleteRule', error: `Failed to delete rule ${r.nombre}` }, (e) => eliminarRegla(e, r.nombre));
      if (!res.ok) return false;
      cx.flash({ tipo: 'exito', texto: `Rule ${r.nombre} was deleted successfully.` });
      alTerminar?.();
    }
  });
}

function alternarRegla(cx, r) {
  const activa = r.estado !== 'ENABLED';
  const res = cx.hacer({ servicio: 'EventBridge', accion: activa ? 'EnableRule' : 'DisableRule', error: `Failed to ${activa ? 'enable' : 'disable'} rule ${r.nombre}` }, (e) => cambiarEstadoRegla(e, r.nombre, activa));
  if (res.ok) cx.flash({ tipo: 'exito', texto: `Rule ${r.nombre} was ${activa ? 'enabled' : 'disabled'} successfully.` });
}

function listaReglas(cx) {
  cx.migas([migaEb, { texto: 'Rules' }]);
  const t = ui.tabla(cx, {
    titulo: 'Rules',
    info: 'eb-regla',
    variante: 'contenedor',
    filas: () => reglas(cx),
    clave: (r) => r.nombre,
    seleccion: 'unica',
    filtro: 'Find rules by name',
    columnas: [
      { titulo: 'Name', valor: (r) => ui.enlace(r.nombre, rutaRegla(r), { cx }), texto: (r) => r.nombre },
      { titulo: 'Status', valor: estadoRegla, texto: (r) => r.estado },
      { titulo: 'Type', valor: tipoRegla },
      { titulo: 'Description', valor: (r) => r.descripcion || '-' }
    ],
    acciones: (sel) => [
      ui.boton(sel[0]?.estado === 'DISABLED' ? 'Enable' : 'Disable', { desactivado: !sel[0], escribe: true, alClic: () => alternarRegla(cx, sel[0]) }),
      ui.boton('Edit', { desactivado: !sel[0], escribe: true, alClic: () => cx.ir(rutaRegla(sel[0], 'editar')) }),
      ui.boton('Delete', { desactivado: !sel[0], escribe: true, alClic: () => borrarRegla(cx, sel[0]) }),
      ui.boton('Create rule', { variante: 'primario', alClic: () => cx.ir('eventbridge/reglas/crear') })
    ],
    vacio: { titulo: 'No rules', texto: 'No rules to display', accion: () => ui.boton('Create rule', { escribe: true, alClic: () => cx.ir('eventbridge/reglas/crear') }) }
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Rules', info: 'eb-regla', cx, descripcion: 'A rule watches for specific types of events. When a matching event occurs, the event is routed to the targets associated with the rule. A rule can be associated with one or more targets.' }),
    ui.contenedor({
      titulo: 'Select event bus',
      cuerpo: ui.campo({
        etiqueta: 'Event bus',
        descripcion: 'Select or enter event bus name',
        control: ui.selector({ valor: 'default', opciones: [{ valor: 'default', etiqueta: 'default' }] })
      })
    }),
    t
  );
}

/* ======================================================== el asistente */

const PASOS_PROGRAMA = ['Define rule detail', 'Define schedule', 'Select target(s)', 'Configure tags', 'Review and create'];
const PASOS_PATRON = ['Define rule detail', 'Build event pattern', 'Select target(s)', 'Configure tags', 'Review and create'];
const ESTADOS_EC2 = ['pending', 'running', 'stopping', 'stopped', 'shutting-down', 'terminated'];
const UNIDADES = [
  { valor: 'minutes', etiqueta: 'minutes' },
  { valor: 'hours', etiqueta: 'hours' },
  { valor: 'days', etiqueta: 'days' }
];

/** La expresión rate(...) con singular para 1, como la arma la consola. */
function expresionRate(valor, unidad) {
  const n = Number(valor);
  return `rate(${valor} ${n === 1 ? unidad.replace(/s$/, '') : unidad})`;
}

/** El patrón que arma el formulario de EC2. */
function patronFormulario(f) {
  const p = { source: ['aws.ec2'], 'detail-type': ['EC2 Instance State-change Notification'] };
  const detalle = {};
  if (f.ec2Estados === 'algunos' && f.estados.length) detalle.state = [...f.estados];
  if (f.ec2Instancias === 'algunas' && f.instancias.length) detalle['instance-id'] = [...f.instancias];
  if (Object.keys(detalle).length) p.detail = detalle;
  return JSON.stringify(p, null, 2);
}

/** Un evento de ejemplo de EC2 para «Test pattern». */
function eventoEjemploEc2(cx, f) {
  const inst = f.instancias[0] ?? cx.estado.instancias?.[0]?.id ?? 'i-1234567890abcdef0';
  return JSON.stringify(
    {
      version: '0',
      id: '7bf73129-1428-4cd3-a780-95db273d1602',
      'detail-type': 'EC2 Instance State-change Notification',
      source: 'aws.ec2',
      account: cx.estado.cuenta?.id ?? '123456789012',
      time: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      region: 'us-east-1',
      resources: [`arn:aws:ec2:us-east-1:${cx.estado.cuenta?.id ?? '123456789012'}:instance/${inst}`],
      detail: { 'instance-id': inst, state: f.estados[0] ?? 'stopped' }
    },
    null,
    2
  );
}

/** El formulario inicial (vacío o con una regla para Edit). */
function formularioDe(cx, r) {
  const rate = r?.expresion ? /^rate\((\d+)\s+(minute|minutes|hour|hours|day|days)\)$/.exec(r.expresion) : null;
  const cron = r?.expresion ? /^cron\((.+)\)$/.exec(r.expresion) : null;
  const campos = cron ? cron[1].trim().split(/\s+/) : ['0', '12', '*', '*', '?', '*'];
  return {
    paso: 0,
    editar: Boolean(r),
    nombre: r?.nombre ?? '',
    descripcion: r?.descripcion ?? '',
    activa: r ? r.estado === 'ENABLED' : true,
    tipo: r?.tipo ?? 'patron',
    patronProg: cron ? 'cron' : 'rate',
    rateValor: rate ? rate[1] : '',
    rateUnidad: rate ? (rate[2].endsWith('s') ? rate[2] : `${rate[2]}s`) : 'minutes',
    cron: campos,
    fuente: 'aws',
    metodo: r?.patron ? 'json' : 'formulario',
    ec2Estados: 'algunos',
    estados: ['stopped'],
    ec2Instancias: 'todas',
    instancias: [],
    patron: r?.patron ?? '',
    prueba: null,
    destinos: r?.destinos?.length ? r.destinos.map((d) => ({ tipo: d.tipo, arn: d.arn, entrada: d.entrada, constante: d.constante })) : [{ tipo: null, arn: null, entrada: 'evento', constante: '' }],
    etiquetas: (r?.etiquetas ?? []).map((e) => ({ ...e })),
    errores: {}
  };
}

const expresionDe = (f) => (f.patronProg === 'rate' ? expresionRate(f.rateValor.trim(), f.rateUnidad) : `cron(${f.cron.map((c) => c.trim()).join(' ')})`);
const patronDe = (f) => (f.metodo === 'formulario' ? patronFormulario(f) : f.patron);

function asistenteRegla(cx, { nombre } = {}) {
  const regla = nombre ? reglaEventBridge(cx.estado, nombre) : null;
  cx.migas(nombre ? [migaEb, migaReglas, { texto: nombre, ruta: regla ? rutaRegla(regla) : null }, { texto: 'Edit rule' }] : [migaEb, migaReglas, { texto: 'Create rule' }]);
  if (nombre && !regla) return noExiste(cx, 'Rule', nombre, 'eventbridge/reglas');
  const e = cx.estado;
  const f = formularioDe(cx, regla);
  if (regla?.patron) f.patron = regla.patron;
  const pasos = () => (f.tipo === 'programada' ? PASOS_PROGRAMA : PASOS_PATRON);
  let zona = null;

  const irA = (i) => {
    f.paso = i;
    f.errores = {};
    zona.repintar();
    cx.raiz?.querySelector?.('.cx-principal, main')?.scrollTo?.(0, 0);
  };

  /** Lo que la consola revisa antes de pasar al siguiente paso. */
  function revisar(paso) {
    f.errores = {};
    if (paso === 0) {
      if (!f.nombre.trim()) f.errores.nombre = 'Rule name is required.';
      else if (!/^[.\-_A-Za-z0-9]{1,64}$/.test(f.nombre.trim())) f.errores.nombre = 'Rule name can only contain numbers, letters, periods (.), hyphens (-) and underscores (_), up to 64 characters.';
    }
    if (paso === 1 && f.tipo === 'programada') {
      if (f.patronProg === 'rate' && !/^[1-9]\d*$/.test(f.rateValor.trim())) f.errores.rate = 'The value must be a positive whole number.';
      else if (!periodoRegla(expresionDe(f))) f.errores.horario = 'Parameter ScheduleExpression is not valid. Revisa el formato: un cron lleva 6 campos y uno de «Day of month» o «Day of the week» debe ser «?».';
    }
    if (paso === 1 && f.tipo === 'patron') {
      if (f.metodo === 'formulario' && f.ec2Estados === 'algunos' && !f.estados.length) f.errores.estados = 'Select at least one state.';
      if (f.metodo === 'formulario' && f.ec2Instancias === 'algunas' && !f.instancias.length) f.errores.instancias = 'Select at least one instance.';
      if (f.metodo === 'json') {
        try {
          probarPatronEventos(f.patron, '{}');
        } catch (err) {
          f.errores.patron = err.message;
        }
      }
    }
    if (paso === 2) {
      f.destinos.forEach((d, i) => {
        if (!d.tipo) f.errores[`tipo${i}`] = 'Select a target.';
        else if (!d.arn) f.errores[`arn${i}`] = `Select a ${NOMBRE_DESTINO[d.tipo].split(' ').pop()}.`;
        if (d.entrada === 'constante') {
          try {
            JSON.parse(d.constante);
          } catch {
            f.errores[`constante${i}`] = 'Input is not a valid JSON text.';
          }
        }
      });
    }
    return !Object.values(f.errores).some(Boolean);
  }

  const siguiente = () => {
    if (!revisar(f.paso)) return zona.repintar();
    irA(Math.min(4, f.paso + 1));
  };

  function guardar() {
    for (let i = 0; i < 3; i++) {
      if (!revisar(i)) return irA(i);
    }
    const datos = {
      nombre: f.nombre.trim(),
      descripcion: f.descripcion,
      tipo: f.tipo,
      expresion: f.tipo === 'programada' ? expresionDe(f) : null,
      patron: f.tipo === 'patron' ? patronDe(f) : null,
      destinos: f.destinos.map((d) => ({ arn: d.arn, entrada: d.entrada, constante: d.constante })),
      activa: f.activa,
      etiquetas: f.etiquetas
    };
    if (f.editar) {
      const r = cx.hacer({ servicio: 'EventBridge', accion: 'PutRule', error: `Failed to update rule ${f.nombre}` }, (es) => {
        const x = editarRegla(es, regla.nombre, datos);
        if ((x.estado === 'ENABLED') !== f.activa) cambiarEstadoRegla(es, x.nombre, f.activa);
        return x;
      }, { atomico: true });
      if (r.ok) {
        cx.flash({ tipo: 'exito', texto: `Rule ${regla.nombre} was updated successfully.` });
        cx.ir(rutaRegla(regla));
      }
      return;
    }
    const r = cx.hacer({ servicio: 'EventBridge', accion: 'PutRule', error: `Failed to create rule ${datos.nombre}` }, (es) => crearRegla(es, datos), { atomico: true });
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Rule ${r.valor.nombre} was created successfully.`, accion: { texto: 'View rule', alClic: () => cx.ir(rutaRegla(r.valor)) } });
      cx.ir('eventbridge/reglas');
    }
  }

  /* ---------- paso 1 */
  function paso1() {
    return [
      ui.contenedor({
        titulo: 'Rule detail',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Name',
            control: ui.entrada({ valor: f.nombre, desactivado: f.editar, etiquetaAccesible: 'Name', alCambiar: (v) => (f.nombre = v) }),
            restriccion: 'Maximum of 64 characters consisting of numbers, lower/upper case letters, .,-,_.',
            error: f.errores.nombre
          }),
          ui.campo({ etiqueta: 'Description', opcional: true, control: ui.entrada({ valor: f.descripcion, placeholder: 'Enter description', etiquetaAccesible: 'Description', alCambiar: (v) => (f.descripcion = v) }) }),
          ui.campo({ etiqueta: 'Event bus', info: 'eb-bus', cx, descripcion: 'Select the event bus for this rule.', control: ui.selector({ valor: 'default', desactivado: f.editar, opciones: [{ valor: 'default', etiqueta: 'default' }] }) }),
          ui.interruptor({ etiqueta: 'Activate the rule on the selected event bus', marcada: f.activa, alCambiar: (v) => (f.activa = v) }),
          ui.campo({
            etiqueta: 'Rule type',
            info: 'eb-regla',
            cx,
            control: ui.tarjetas({
              columnas: 2,
              valor: f.tipo,
              opciones: [
                { valor: 'patron', etiqueta: 'Rule with an event pattern', descripcion: 'A rule that runs when an event matches the defined event pattern. EventBridge sends the event to the specified target.', desactivado: f.editar && f.tipo !== 'patron' },
                { valor: 'programada', etiqueta: 'Schedule', descripcion: 'A rule that runs on a schedule.', desactivado: f.editar && f.tipo !== 'programada' }
              ],
              alCambiar: (v) => {
                f.tipo = v;
                zona.repintar();
              }
            })
          }),
          f.tipo === 'programada' && !f.editar
            ? ui.alerta({
                tipo: 'info',
                titulo: 'Use Amazon EventBridge Scheduler to create schedules',
                contenido: 'Amazon EventBridge Scheduler is a serverless scheduler that allows you to create, run, and manage tasks from one central, managed service. We recommend using EventBridge Scheduler to create new schedules. (Simulador: aquí sigues con «Continue to create rule».)'
              })
            : null
        )
      })
    ];
  }

  /* ---------- paso 2: horario */
  function paso2Programa() {
    const expresion = expresionDe(f);
    const periodo = periodoRegla(expresion);
    const etiquetasCron = ['Minutes', 'Hours', 'Day of month', 'Month', 'Day of the week', 'Year'];
    return [
      ui.contenedor({
        titulo: 'Schedule pattern',
        info: 'eb-programa',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Choose the schedule type that best meets your needs.',
            control: ui.radios({
              valor: f.patronProg,
              opciones: [
                { valor: 'cron', etiqueta: 'A fine-grained schedule that runs at a specific time, such as 8:00 a.m. PST on the first Monday of every month.' },
                { valor: 'rate', etiqueta: 'A schedule that runs at a regular rate, such as every 10 minutes.' }
              ],
              alCambiar: (v) => {
                f.patronProg = v;
                f.errores = {};
                zona.repintar();
              }
            })
          }),
          f.patronProg === 'rate'
            ? ui.campo({
                etiqueta: 'Rate expression',
                descripcion: 'Enter a value and the unit of time to run the schedule.',
                control: h(
                  'div',
                  { class: 'cx-msj-rate' },
                  ui.entrada({ tipo: 'number', valor: f.rateValor, etiquetaAccesible: 'Value', alCambiar: (v) => (f.rateValor = v), alEnter: () => zona.repintar() }),
                  ui.selector({
                    valor: f.rateUnidad,
                    etiquetaAccesible: 'Unit',
                    opciones: UNIDADES,
                    alCambiar: (v) => {
                      f.rateUnidad = v;
                      zona.repintar();
                    }
                  })
                ),
                error: f.errores.rate ?? f.errores.horario
              })
            : ui.campo({
                etiqueta: 'Cron expression',
                descripcion: 'Define the cron expression for the schedule. Cron expressions are in UTC.',
                control: h(
                  'div',
                  { class: 'cx-msj-cron' },
                  f.cron.map((c, i) =>
                    h(
                      'label',
                      { class: 'cx-msj-cron__campo' },
                      h('span', { class: 'cx-msj-cron__valor' }, ui.entrada({ valor: c, etiquetaAccesible: etiquetasCron[i], alCambiar: (v) => (f.cron[i] = v) })),
                      h('small', {}, etiquetasCron[i])
                    )
                  )
                ),
                restriccion: 'Ejemplo: cron(0/15 * * * ? *) = cada 15 minutos; cron(0 12 * * ? *) = diario a las 12:00 UTC.',
                error: f.errores.horario
              }),
          h(
            'div',
            { class: 'cx-bloque' },
            ui.pares(
              [
                { etiqueta: 'Schedule expression', valor: h('span', { class: 'cx-mono' }, expresion) },
                { etiqueta: 'Simulador: dispara cada', valor: periodo ? textoPeriodo(periodo) : '-' }
              ],
              { columnas: 2 }
            ),
            h('p', { class: 'cx-texto-sec' }, 'En el simulador el tiempo va acelerado: 1 minuto de AWS son 10 s. Por ejemplo, rate(5 minutes) dispara cada 50 s.'),
            ui.boton('Refresh', { icono: 'refresh', alClic: () => zona.repintar() })
          )
        )
      })
    ];
  }

  /* ---------- paso 2: patrón */
  function paso2Patron() {
    const instancias = (e.instancias ?? []).filter((i) => i.estado !== 'terminated');
    const formulario = f.metodo === 'formulario';
    const vista = patronDe(f);
    return [
      ui.contenedor({
        titulo: 'Event source',
        cuerpo: ui.radios({
          valor: f.fuente,
          opciones: [
            { valor: 'aws', etiqueta: 'AWS events or EventBridge partner events', descripcion: 'Events sent from AWS services or EventBridge partners.' },
            { valor: 'otros', etiqueta: 'Other', descripcion: 'Custom events or events sent from more than one source.', desactivado: true },
            { valor: 'todos', etiqueta: 'All events', descripcion: 'All events sent to your account.', desactivado: true }
          ],
          alCambiar: (v) => (f.fuente = v)
        })
      }),
      ui.contenedor({
        titulo: 'Creation method',
        cuerpo: ui.radios({
          valor: f.metodo,
          opciones: [
            { valor: 'formulario', etiqueta: 'Use pattern form', descripcion: 'Use a template provided by EventBridge to create an event pattern.' },
            { valor: 'json', etiqueta: 'Custom pattern (JSON editor)', descripcion: 'Write an event pattern in JSON.' }
          ],
          alCambiar: (v) => {
            if (v === 'json' && !f.patron.trim()) f.patron = patronFormulario(f);
            f.metodo = v;
            f.errores = {};
            zona.repintar();
          }
        })
      }),
      ui.contenedor({
        titulo: 'Event pattern',
        info: 'eb-patron',
        cx,
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          formulario
            ? [
                ui.campo({ etiqueta: 'Event source', control: ui.selector({ valor: 'aws', opciones: [{ valor: 'aws', etiqueta: 'AWS services' }, { valor: 'socios', etiqueta: 'EventBridge partners', desactivado: true }] }) }),
                ui.campo({
                  etiqueta: 'AWS service',
                  control: ui.selector({
                    valor: 'ec2',
                    filtrar: true,
                    opciones: [
                      { valor: 'autoscaling', etiqueta: 'Auto Scaling', desactivado: true },
                      { valor: 'ec2', etiqueta: 'EC2' },
                      { valor: 's3', etiqueta: 'Simple Storage Service (S3)', desactivado: true },
                      { valor: 'health', etiqueta: 'Health', desactivado: true }
                    ]
                  }),
                  descripcion: 'Simulador: por ahora solo EC2 manda eventos (cuando una instancia cambia de estado).'
                }),
                ui.campo({ etiqueta: 'Event type', control: ui.selector({ valor: 'cambio', opciones: [{ valor: 'cambio', etiqueta: 'EC2 Instance State-change Notification' }] }) }),
                ui.campo({
                  etiqueta: 'Event Type Specification 1',
                  control: ui.radios({
                    valor: f.ec2Estados,
                    opciones: [
                      { valor: 'todos', etiqueta: 'Any state' },
                      { valor: 'algunos', etiqueta: 'Specific state(s)' }
                    ],
                    alCambiar: (v) => {
                      f.ec2Estados = v;
                      zona.repintar();
                    }
                  })
                }),
                f.ec2Estados === 'algunos'
                  ? ui.campo({
                      etiqueta: 'State(s)',
                      control: ui.selector({
                        multiple: true,
                        valores: f.estados,
                        placeholder: 'Select state(s)',
                        opciones: ESTADOS_EC2.map((s) => ({ valor: s, etiqueta: s })),
                        alCambiar: (v) => {
                          f.estados = v;
                          zona.repintar();
                        }
                      }),
                      error: f.errores.estados
                    })
                  : null,
                ui.campo({
                  etiqueta: 'Event Type Specification 2',
                  control: ui.radios({
                    valor: f.ec2Instancias,
                    opciones: [
                      { valor: 'todas', etiqueta: 'Any instance' },
                      { valor: 'algunas', etiqueta: 'Specific instance Id(s)' }
                    ],
                    alCambiar: (v) => {
                      f.ec2Instancias = v;
                      zona.repintar();
                    }
                  })
                }),
                f.ec2Instancias === 'algunas'
                  ? ui.campo({
                      etiqueta: 'Instance Id(s)',
                      control: ui.selector({
                        multiple: true,
                        valores: f.instancias,
                        placeholder: 'Select instance(s)',
                        opciones: instancias.map((i) => ({ valor: i.id, etiqueta: i.id, descripcion: i.nombre || undefined })),
                        vacio: 'No instances',
                        alCambiar: (v) => {
                          f.instancias = v;
                          zona.repintar();
                        }
                      }),
                      error: f.errores.instancias
                    })
                  : null,
                h('b', {}, 'Event pattern'),
                h('pre', { class: 'cx-log' }, vista),
                h(
                  'div',
                  { class: 'cx-acciones' },
                  ui.boton('Copy', { icono: 'copy', alClic: () => copiar(cx, vista, 'Event pattern') }),
                  ui.boton('Edit pattern', {
                    alClic: () => {
                      f.patron = vista;
                      f.metodo = 'json';
                      zona.repintar();
                    }
                  })
                )
              ]
            : ui.campo({
                etiqueta: 'Event pattern',
                descripcion: 'Write the event pattern in JSON. Each field lists the values that match, for example { "source": ["aws.ec2"] }.',
                control: ui.area({ valor: f.patron, filas: 12, monoespaciado: true, etiquetaAccesible: 'Event pattern JSON', alCambiar: (v) => (f.patron = v) }),
                error: f.errores.patron
              }),
          h(
            'div',
            { class: 'cx-acciones' },
            ui.boton('Test pattern', {
              alClic: () => {
                try {
                  f.prueba = probarPatronEventos(patronDe(f), eventoEjemploEc2(cx, f)) ? 'si' : 'no';
                } catch (err) {
                  f.prueba = `error:${err.message}`;
                }
                zona.repintar();
              }
            })
          ),
          f.prueba === 'si'
            ? ui.alerta({ tipo: 'exito', contenido: 'Sample event matched the event pattern.' })
            : f.prueba === 'no'
              ? ui.alerta({ tipo: 'aviso', contenido: 'Sample event did not match the event pattern. (Se probó con un evento de EC2 de ejemplo con el primer estado elegido.)' })
              : f.prueba
                ? ui.alerta({ tipo: 'error', contenido: f.prueba.slice(6) })
                : null
        )
      })
    ];
  }

  /* ---------- paso 3: destinos */
  function paso3() {
    const opcionesRecurso = (tipo) => {
      if (tipo === 'lambda') return (e.lambda?.funciones ?? []).map((fn) => ({ valor: fn.arn, etiqueta: fn.nombre }));
      if (tipo === 'sqs') return (e.sqs?.colas ?? []).map((c) => ({ valor: c.arn, etiqueta: c.nombre, descripcion: c.tipo }));
      if (tipo === 'sns') return (e.sns?.temas ?? []).map((t) => ({ valor: t.arn, etiqueta: t.nombre, descripcion: t.tipo }));
      return [];
    };
    const etiquetaRecurso = { lambda: 'Function', sqs: 'Queue', sns: 'Topic' };
    return [
      ...f.destinos.map((d, i) =>
        ui.contenedor({
          titulo: `Target ${i + 1}`,
          info: 'eb-destino',
          cx,
          acciones: f.destinos.length > 1 ? ui.boton('Remove', { alClic: () => (f.destinos.splice(i, 1), zona.repintar()) }) : null,
          cuerpo: h(
            'div',
            { class: 'cx-form' },
            ui.campo({
              etiqueta: 'Target types',
              descripcion: 'Select an EventBridge event bus, EventBridge API destination (SaaS partner), or another AWS service as a target.',
              control: ui.radios({
                valor: 'servicio',
                opciones: [
                  { valor: 'bus', etiqueta: 'EventBridge event bus', desactivado: true },
                  { valor: 'api', etiqueta: 'EventBridge API destination', desactivado: true },
                  { valor: 'servicio', etiqueta: 'AWS service' }
                ]
              })
            }),
            ui.campo({
              etiqueta: 'Select a target',
              descripcion: 'Select target(s) to invoke when an event matches your event pattern or when schedule is triggered (limit of 5 targets per rule).',
              control: ui.selector({
                placeholder: 'Select a target',
                filtrar: true,
                valor: d.tipo,
                opciones: [
                  { valor: 'apigw', etiqueta: 'API Gateway', desactivado: true },
                  { valor: 'logs', etiqueta: 'CloudWatch log group', desactivado: true },
                  { valor: 'ecs', etiqueta: 'ECS task', desactivado: true },
                  { valor: 'kinesis', etiqueta: 'Kinesis stream', desactivado: true },
                  { valor: 'lambda', etiqueta: 'Lambda function' },
                  { valor: 'sns', etiqueta: 'SNS topic' },
                  { valor: 'sqs', etiqueta: 'SQS queue' },
                  { valor: 'sfn', etiqueta: 'Step Functions state machine', desactivado: true }
                ],
                alCambiar: (v) => {
                  d.tipo = v;
                  d.arn = null;
                  zona.repintar();
                }
              }),
              error: f.errores[`tipo${i}`]
            }),
            d.tipo
              ? ui.campo({
                  etiqueta: etiquetaRecurso[d.tipo],
                  control: ui.selector({
                    placeholder: `Select ${etiquetaRecurso[d.tipo].toLowerCase()}`,
                    filtrar: true,
                    valor: d.arn,
                    opciones: opcionesRecurso(d.tipo),
                    vacio: `No ${NOMBRE_DESTINO[d.tipo].toLowerCase()}s. Create one first.`,
                    alCambiar: (v) => (d.arn = v)
                  }),
                  error: f.errores[`arn${i}`]
                })
              : null,
            d.tipo === 'sqs' ? h('p', { class: 'cx-texto-sec' }, 'EventBridge adds a statement to the queue’s access policy so the rule can send messages to it.') : null,
            d.tipo === 'lambda' ? h('p', { class: 'cx-texto-sec' }, 'EventBridge adds the permission for events.amazonaws.com to invoke the function.') : null,
            ui.expandible({
              titulo: 'Additional settings',
              abierto: d.entrada === 'constante',
              contenido: h(
                'div',
                { class: 'cx-form' },
                ui.campo({
                  etiqueta: 'Configure target input',
                  descripcion: 'You can customize the text from an event before EventBridge passes the event to the target of a rule.',
                  control: ui.radios({
                    valor: d.entrada,
                    opciones: [
                      { valor: 'evento', etiqueta: 'Matched events' },
                      { valor: 'constante', etiqueta: 'Constant (JSON text)' },
                      { valor: 'transformador', etiqueta: 'Input transformer', desactivado: true }
                    ],
                    alCambiar: (v) => {
                      d.entrada = v;
                      zona.repintar();
                    }
                  })
                }),
                d.entrada === 'constante'
                  ? ui.campo({
                      etiqueta: 'Specify the constant in JSON text',
                      control: ui.area({ valor: d.constante, filas: 4, monoespaciado: true, placeholder: '{ "mensaje": "hola" }', etiquetaAccesible: 'Constant JSON', alCambiar: (v) => (d.constante = v) }),
                      error: f.errores[`constante${i}`]
                    })
                  : null
              )
            })
          )
        })
      ),
      h('div', {}, ui.boton('Add another target', { desactivado: f.destinos.length >= 5, alClic: () => (f.destinos.push({ tipo: null, arn: null, entrada: 'evento', constante: '' }), zona.repintar()) }))
    ];
  }

  /* ---------- paso 4: etiquetas */
  function paso4() {
    return [
      ui.contenedor({
        titulo: 'Tags - optional',
        descripcion: 'A tag is a label that you assign to an AWS resource. Each tag consists of a key and an optional value.',
        cuerpo: ui.editorEtiquetas({ filas: f.etiquetas })
      })
    ];
  }

  /* ---------- paso 5: revisión */
  function paso5() {
    const seccion = (titulo, i, cuerpo) => ui.contenedor({ titulo: `Step ${i + 1}: ${titulo}`, acciones: ui.boton('Edit', { alClic: () => irA(i) }), cuerpo });
    return [
      seccion(pasos()[0], 0, ui.pares(
        [
          { etiqueta: 'Rule name', valor: f.nombre },
          { etiqueta: 'Description', valor: f.descripcion || '-' },
          { etiqueta: 'Event bus', valor: 'default' },
          { etiqueta: 'Rule state', valor: f.activa ? 'Enabled' : 'Disabled' },
          { etiqueta: 'Rule type', valor: f.tipo === 'programada' ? 'Schedule' : 'Standard rule' }
        ],
        { columnas: 3 }
      )),
      seccion(
        pasos()[1],
        1,
        f.tipo === 'programada'
          ? ui.pares([{ etiqueta: 'Schedule expression', valor: expresionDe(f) }, { etiqueta: 'Simulador: dispara cada', valor: periodoRegla(expresionDe(f)) ? textoPeriodo(periodoRegla(expresionDe(f))) : '-' }], { columnas: 2 })
          : h('pre', { class: 'cx-log' }, patronDe(f))
      ),
      seccion(
        pasos()[2],
        2,
        h(
          'table',
          { class: 'cx-msj-tabla' },
          h('thead', {}, h('tr', {}, ['Target Name', 'Type', 'Arn', 'Input'].map((t) => h('th', {}, t)))),
          h('tbody', {}, f.destinos.map((d) => h('tr', {}, h('td', {}, nombreDestino(d.arn ?? '-')), h('td', {}, NOMBRE_DESTINO[d.tipo] ?? '-'), h('td', { class: 'cx-mono' }, d.arn ?? '-'), h('td', {}, d.entrada === 'constante' ? `Constant: ${d.constante}` : 'Matched event'))))
        )
      ),
      seccion(pasos()[3], 3, f.etiquetas.filter((t) => t.llave.trim()).length ? tablaEtiquetas(cx, f.etiquetas.filter((t) => t.llave.trim())) : h('p', { class: 'cx-texto-sec' }, 'No tags associated with the resource.'))
    ];
  }

  function pie() {
    const cuerpo = [];
    cuerpo.push(ui.boton('Cancel', { variante: 'texto', alClic: () => cx.ir(f.editar ? rutaRegla(regla) : 'eventbridge/reglas') }));
    if (f.editar && f.paso < 4) cuerpo.push(ui.boton('Skip to Review and update', { alClic: () => (revisar(f.paso) ? irA(4) : zona.repintar()) }));
    if (f.paso > 0) cuerpo.push(ui.boton('Previous', { alClic: () => irA(f.paso - 1) }));
    if (f.paso === 0 && f.tipo === 'programada' && !f.editar) {
      cuerpo.push(ui.boton('Continue in EventBridge Scheduler', { desactivado: true, titulo: 'No disponible en el simulador' }));
      cuerpo.push(ui.boton('Continue to create rule', { variante: 'primario', escribe: false, alClic: siguiente }));
    } else if (f.paso < 4) cuerpo.push(ui.boton('Next', { variante: 'primario', escribe: false, alClic: siguiente }));
    else cuerpo.push(ui.boton(f.editar ? 'Update rule' : 'Create rule', { variante: 'primario', alClic: guardar }));
    return h('div', { class: 'cx-pie-form' }, cuerpo);
  }

  zona = ui.region(() => {
    const lista = pasos();
    const cuerpo = [paso1, f.tipo === 'programada' ? paso2Programa : paso2Patron, paso3, paso4, paso5][f.paso]();
    return h(
      'div',
      { class: 'cx-asis' },
      h(
        'nav',
        { class: 'cx-asis__pasos', 'aria-label': 'Steps' },
        h(
          'ol',
          {},
          lista.map((p, i) =>
            h(
              'li',
              { class: ['cx-asis__paso', i === f.paso && 'cx-asis__paso--actual', i > f.paso && 'cx-asis__paso--futuro'], 'aria-current': i === f.paso ? 'step' : undefined },
              h('small', {}, `Step ${i + 1}${i === 3 ? ' - optional' : ''}`),
              i < f.paso ? h('a', { href: '#', class: 'cx-enlace', onclick: (ev) => (ev.preventDefault(), irA(i)) }, p) : h('span', {}, p)
            )
          )
        )
      ),
      h('div', { class: 'cx-asis__cuerpo cx-pagina' }, ui.encabezado({ titulo: lista[f.paso], info: f.paso === 1 ? (f.tipo === 'programada' ? 'eb-programa' : 'eb-patron') : 'eb-regla', cx }), cuerpo, pie())
    );
  });
  return zona;
}

/* ================================================================ detalle */

function tablaDestinos(cx, r) {
  return ui.contenedor({
    titulo: 'Targets',
    contador: r.destinos.length,
    info: 'eb-destino',
    cx,
    acciones: ui.boton('Edit', { escribe: true, alClic: () => cx.ir(rutaRegla(r, 'editar')) }),
    cuerpo: r.destinos.length
      ? h(
          'table',
          { class: 'cx-msj-tabla' },
          h('thead', {}, h('tr', {}, ['Target Name', 'Type', 'Arn', 'Input', 'Role'].map((t) => h('th', {}, t)))),
          h(
            'tbody',
            {},
            r.destinos.map((d) => {
              const existe = d.tipo === 'lambda' ? funcionLambda(cx.estado, d.arn) : d.tipo === 'sqs' ? (cx.estado.sqs?.colas ?? []).some((c) => c.arn === d.arn) : (cx.estado.sns?.temas ?? []).some((t) => t.arn === d.arn);
              return h(
                'tr',
                {},
                h('td', {}, existe ? ui.enlace(nombreDestino(d.arn), rutaDestino(d), { cx }) : h('span', {}, nombreDestino(d.arn), ' ', ui.estado('error', 'Not found'))),
                h('td', {}, NOMBRE_DESTINO[d.tipo]),
                h('td', { class: 'cx-mono' }, d.arn),
                h('td', {}, d.entrada === 'constante' ? `Constant: ${d.constante}` : 'Matched event'),
                h('td', {}, '-')
              );
            })
          )
        )
      : h('p', { class: 'cx-texto-sec' }, 'No targets. This rule doesn’t send events anywhere: choose Edit to add a target.')
  });
}

function detalleRegla(cx, { nombre }) {
  cx.migas([migaEb, migaReglas, { texto: nombre }]);
  if (!reglaEventBridge(cx.estado, nombre)) return noExiste(cx, 'Rule', nombre, 'eventbridge/reglas');
  const st = { pestana: cx.memoria.ebPestana ?? 'destinos' };
  const cabeza = cx.vivo(() => {
    const r = reglaEventBridge(cx.estado, nombre);
    if (!r) return noExiste(cx, 'Rule', nombre, 'eventbridge/reglas');
    return h('div', { class: 'cx-pagina' }, [
      ui.encabezado({
        titulo: r.nombre,
        info: 'eb-regla',
        cx,
        acciones: [
          ui.boton('Edit', { escribe: true, alClic: () => cx.ir(rutaRegla(r, 'editar')) }),
          ui.boton('Delete', { escribe: true, alClic: () => borrarRegla(cx, r, { alTerminar: () => cx.ir('eventbridge/reglas') }) }),
          ui.boton(r.estado === 'ENABLED' ? 'Disable' : 'Enable', { escribe: true, alClic: () => alternarRegla(cx, r) })
        ]
      }),
      ui.contenedor({
        titulo: 'Rule details',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Rule name', valor: r.nombre },
            { etiqueta: 'Status', valor: estadoRegla(r) },
            { etiqueta: 'Type', valor: tipoRegla(r) },
            { etiqueta: 'Description', valor: r.descripcion || '-' },
            { etiqueta: 'Rule ARN', valor: ui.copiable(r.arn) },
            { etiqueta: 'Event bus name', valor: 'default' },
            { etiqueta: 'Event bus ARN', valor: arnBus(cx) },
            { etiqueta: 'Created', valor: ui.fecha(r.creado) },
            { etiqueta: 'Monitoring', valor: ui.enlace('View in CloudWatch', 'cloudwatch/metricas', { cx }) }
          ],
          { columnas: 3 }
        )
      })
    ]);
  });
  const pestanas = cx.vivo(() => {
    const r = reglaEventBridge(cx.estado, nombre);
    if (!r) return null;
    return ui.pestanas({
      activa: st.pestana,
      alCambiar: (id) => (st.pestana = cx.memoria.ebPestana = id),
      pestanas: [
        { id: 'destinos', texto: 'Targets', contenido: () => tablaDestinos(cx, r) },
        r.tipo === 'programada'
          ? { id: 'programa', texto: 'Event schedule', contenido: () => ui.contenedor({ titulo: 'Event schedule', info: 'eb-programa', cx, cuerpo: ui.pares([{ etiqueta: 'Schedule expression', valor: h('span', { class: 'cx-mono' }, r.expresion) }, { etiqueta: 'Simulador: dispara cada', valor: textoPeriodo(periodoRegla(r.expresion) ?? 0) }], { columnas: 2 }) }) }
          : { id: 'patron', texto: 'Event pattern', contenido: () => ui.contenedor({ titulo: 'Event pattern', info: 'eb-patron', cx, acciones: ui.boton('Copy', { icono: 'copy', alClic: () => copiar(cx, r.patron, 'Event pattern') }), cuerpo: h('pre', { class: 'cx-log' }, r.patron) }) },
        { id: 'monitoreo', texto: 'Monitoring', contenido: () => monitoreoRegla(cx, r) },
        { id: 'etiquetas', texto: 'Tags', contenido: () => tablaEtiquetas(cx, r.etiquetas) }
      ]
    });
  });
  return h('div', { class: 'cx-pagina' }, cabeza, pestanas);
}

function monitoreoRegla(cx, r) {
  const ahora = Date.now();
  const falta = r.estado === 'ENABLED' && r.tipo === 'programada' && r.proximo ? Math.max(0, Math.ceil((r.proximo - ahora) / 1000)) : null;
  return ui.contenedor({
    titulo: 'Monitoring',
    info: 'eb-regla',
    cx,
    descripcion: 'Totales desde que creaste la regla (simulador). En AWS los ves en CloudWatch → AWS/Events (TriggeredRules, Invocations, FailedInvocations).',
    cuerpo: ui.pares(
      [
        { etiqueta: 'TriggeredRules (total)', valor: String(r.disparos) },
        { etiqueta: 'Invocations (total)', valor: String(r.disparos * r.destinos.length) },
        { etiqueta: 'FailedInvocations (total)', valor: r.fallidos ? h('span', {}, ui.estado('error', String(r.fallidos))) : '0' },
        { etiqueta: 'Last triggered', valor: r.ultimoDisparo ? ui.fecha(r.ultimoDisparo) : '-' },
        {
          etiqueta: 'Next trigger (simulador)',
          valor: r.tipo !== 'programada' ? 'Cuando llegue un evento que cumpla el patrón' : r.estado !== 'ENABLED' ? 'Rule disabled' : falta === null ? '-' : `in ${falta} s`
        }
      ],
      { columnas: 3 }
    )
  });
}

/* ================================================================ ayudas */

const ayudas = {
  'eb-regla': {
    titulo: 'Regla de EventBridge',
    texto: [
      'Una **regla** escucha eventos y, cuando uno le interesa, lo manda a sus **destinos** (targets): una Lambda, una cola de SQS, un tema de SNS…',
      'Hay dos tipos:',
      ['**Rule with an event pattern**: reacciona a lo que pasa en tu cuenta, por ejemplo «una instancia EC2 pasó a stopped».', '**Schedule**: corre sola cada cierto tiempo (`rate(5 minutes)`) o a una hora fija (`cron(…)`), como un despertador.'],
      'Una regla puede tener hasta **5 destinos**. Si la deshabilitas (Disable), deja de mandar eventos sin borrarse.'
    ]
  },
  'eb-bus': { titulo: 'Event bus', texto: ['El **bus** es el «tubo» por donde viajan los eventos. Los servicios de AWS mandan los suyos al bus **default**, que es el que usarás en el curso.'] },
  'eb-programa': {
    titulo: 'Horarios: rate y cron',
    texto: [
      '`rate(valor unidad)`: cada cierto tiempo. Usa singular con 1: `rate(1 minute)`, `rate(5 minutes)`, `rate(1 hour)`, `rate(2 days)`.',
      '`cron(minutos horas día-del-mes mes día-de-la-semana año)`: a horas fijas, en **UTC**. Uno de los dos días debe ser `?`. Ejemplo: `cron(0 12 * * ? *)` = todos los días a las 12:00 UTC (6:00 en el centro de México).',
      'Simulador: el tiempo va **acelerado**, 1 minuto de AWS son **10 s**. `rate(5 minutes)` dispara cada 50 s.'
    ]
  },
  'eb-patron': {
    titulo: 'Patrón de eventos',
    texto: [
      'Un **patrón** es un JSON que dice qué eventos te interesan. Cada campo lista los valores aceptados, siempre entre corchetes:',
      '`{ "source": ["aws.ec2"], "detail-type": ["EC2 Instance State-change Notification"], "detail": { "state": ["stopped"] } }`',
      'Ese patrón atrapa las instancias que se detienen. Usa **Test pattern** para comprobarlo antes de guardar.'
    ]
  },
  'eb-destino': {
    titulo: 'Destinos (targets)',
    texto: [
      'El **destino** recibe el evento: una **Lambda** lo procesa, una cola **SQS** lo guarda para después y un tema **SNS** lo reparte (por ejemplo, a tu correo).',
      'Con **Constant (JSON text)** mandas siempre el mismo JSON en lugar del evento.',
      'La consola agrega sola los permisos: el de invocar la Lambda y el de escribir en la cola.'
    ]
  }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'eventbridge',
  nombre: 'Amazon EventBridge',
  titulo: 'Amazon EventBridge',
  descripcion: 'Serverless event bus that connects application data',
  categoria: 'integracion',
  claves: 'eventbridge eventos reglas rules cron rate horario schedule cloudwatch events',
  inicio: 'eventbridge',
  menu: [
    { texto: 'Get started', ruta: 'eventbridge' },
    { seccion: 'Buses', items: [{ texto: 'Event buses', ruta: 'eventbridge/buses' }, { texto: 'Rules', ruta: 'eventbridge/reglas' }, des('Global endpoints'), des('Archives'), des('Replays')] },
    { seccion: 'Pipes', items: [des('Pipes')] },
    { seccion: 'Scheduler', items: [des('Schedules'), des('Schedule groups')] },
    { seccion: 'Integration', items: [des('Partner event sources'), des('API destinations'), des('Connections')] },
    { seccion: 'Schema registry', items: [des('Schemas')] }
  ],
  rutas: {
    '': portada,
    buses: (cx) => (cx.migas([migaEb, { texto: 'Event buses' }]), ui.noDisponible('Event buses', 'En el simulador todas las reglas viven en el bus «default». Ve a Rules para crear las tuyas.')),
    reglas: listaReglas,
    'reglas/crear': (cx) => asistenteRegla(cx),
    'reglas/:nombre': detalleRegla,
    'reglas/:nombre/editar': (cx, p) => asistenteRegla(cx, p)
  },
  busqueda: [
    { texto: 'Rules', ruta: 'eventbridge/reglas', claves: 'reglas' },
    { texto: 'Create rule', ruta: 'eventbridge/reglas/crear', claves: 'crear regla horario cron rate' }
  ],
  ayudas
};
