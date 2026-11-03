// ---------------------------------------------------------------------------
// AWS LAMBDA
//
// La portada (con la demo «How it works»), el Dashboard, la lista de
// Functions, Create function (Author from scratch, con el rol básico
// <fn>-role-xxxxxxxx y AWSLambdaBasicExecutionRole), y el detalle de una
// función: Function overview (diagrama con sus disparadores), Code (editor,
// Deploy y Test con eventos guardados), Test, Monitor, Configuration (General
// configuration, Triggers, Permissions, Environment variables, Tags) y Add
// trigger (SNS, SQS, EventBridge y S3).
//
// NUNCA se ejecuta el código del alumno: modelo/lambda.js lo lee como texto
// con un intérprete chiquito (ver su cabecera) y devuelve la respuesta solo si
// es un return sencillo. Siempre salen START, END y REPORT.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import {
  RUNTIMES_LAMBDA,
  agregarDisparador,
  crearFuncion,
  desplegarCodigo,
  disparadoresLambda,
  editarConfiguracionLambda,
  editarMapeoLambda,
  editarVariablesLambda,
  eliminarEventoPrueba,
  eliminarFuncion,
  funcionLambda,
  guardarEventoPrueba,
  interpretarCodigo,
  probarFuncion,
  quitarDisparador,
  runtimeLambda
} from '../modelo.js';
import { noExiste } from './comun.js';
import { graficaMetricas } from './cloudwatch.js';
import { copiar, tablaEtiquetas } from './sns.js';

const { h } = ui;

const migaLambda = { texto: 'Lambda', ruta: 'lambda' };
const migaFunciones = { texto: 'Functions', ruta: 'lambda/funciones' };
const funciones = (cx) => cx.estado.lambda?.funciones ?? [];
const rutaFn = (fn, resto = '') => `lambda/funciones/${encodeURIComponent(fn.nombre ?? fn)}${resto ? `/${resto}` : ''}`;
const nombreRuntime = (id) => runtimeLambda(id)?.nombre ?? id;
const esPython = (fn) => runtimeLambda(fn.runtime)?.lenguaje === 'py';

/** «3 minutes ago», como la consola. */
function hace(iso) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return s < 5 ? 'now' : `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? '1 minute ago' : `${m} minutes ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return hr === 1 ? '1 hour ago' : `${hr} hours ago`;
  const d = Math.round(hr / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

/** Timeout como lo pinta la consola: «0 min 3 sec». */
const textoTimeout = (seg) => `${Math.floor(seg / 60)} min ${seg % 60} sec`;

/** El nombre de un disparador como sale en el diagrama. */
const NOMBRE_DISPARADOR = { sns: 'SNS', sqs: 'SQS', eventbridge: 'EventBridge (CloudWatch Events)', s3: 'S3' };

/** Recuerdos por función (borrador del código, último resultado de Test, evento elegido). */
function memoriaFn(cx, nombre) {
  cx.memoria.lambda ??= {};
  cx.memoria.lambda[nombre] ??= { borrador: null, resultado: null, evento: null };
  return cx.memoria.lambda[nombre];
}

/* ===================================================== eventos de ejemplo */

/** Plantillas de «Template - optional» (Test → Create new event). */
function plantillasEvento(cx) {
  const cuenta = cx.estado.cuenta?.id ?? '123456789012';
  const ahora = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return [
    { valor: 'hello-world', etiqueta: 'Hello World', json: { key1: 'value1', key2: 'value2', key3: 'value3' } },
    {
      valor: 'sns',
      etiqueta: 'SNS Topic Notification',
      json: {
        Records: [
          {
            EventSource: 'aws:sns',
            EventVersion: '1.0',
            EventSubscriptionArn: `arn:aws:sns:us-east-1:${cuenta}:ExampleTopic:2bcfbf39-05c3-41de-beaa-fcfcc21c8f55`,
            Sns: { Type: 'Notification', MessageId: '95df01b4-ee98-5cb9-9903-4c221d41eb5e', TopicArn: `arn:aws:sns:us-east-1:${cuenta}:ExampleTopic`, Subject: 'example subject', Message: 'example message', Timestamp: '1970-01-01T00:00:00.000Z', MessageAttributes: {} }
          }
        ]
      }
    },
    {
      valor: 'sqs',
      etiqueta: 'SQS Receive Message',
      json: {
        Records: [
          {
            messageId: '19dd0b57-b21e-4ac1-bd88-01bbb068cb78',
            receiptHandle: 'MessageReceiptHandle',
            body: 'Hello from SQS!',
            attributes: { ApproximateReceiveCount: '1', SentTimestamp: '1523232000000', SenderId: '123456789012', ApproximateFirstReceiveTimestamp: '1523232000001' },
            messageAttributes: {},
            md5OfBody: '7b270e59b47ff90a553787216d55d91d',
            eventSource: 'aws:sqs',
            eventSourceARN: `arn:aws:sqs:us-east-1:${cuenta}:MyQueue`,
            awsRegion: 'us-east-1'
          }
        ]
      }
    },
    {
      valor: 's3',
      etiqueta: 'S3 Put',
      json: {
        Records: [
          {
            eventVersion: '2.0',
            eventSource: 'aws:s3',
            awsRegion: 'us-east-1',
            eventTime: '1970-01-01T00:00:00.000Z',
            eventName: 'ObjectCreated:Put',
            s3: { s3SchemaVersion: '1.0', configurationId: 'testConfigRule', bucket: { name: 'example-bucket', arn: 'arn:aws:s3:::example-bucket' }, object: { key: 'test/key', size: 1024, eTag: '0123456789abcdef0123456789abcdef' } }
          }
        ]
      }
    },
    {
      valor: 'eventbridge',
      etiqueta: 'EventBridge (CloudWatch Events) Scheduled Event',
      json: { version: '0', id: 'cdc73f9d-aea9-11e3-9d5a-835b769c0d9c', 'detail-type': 'Scheduled Event', source: 'aws.events', account: cuenta, time: ahora, region: 'us-east-1', resources: [`arn:aws:events:us-east-1:${cuenta}:rule/ExampleRule`], detail: {} }
    }
  ];
}

const JSON_INICIAL = JSON.stringify({ key1: 'value1', key2: 'value2', key3: 'value3' }, null, 2);

/* ================================================================ portada */

const DEMO = {
  js: ["export const handler = async (event) => {", "  console.log('Hello from Lambda!');", "  return { statusCode: 200, body: 'Hello from Lambda!' };", '};'].join('\n'),
  py: ['def lambda_handler(event, context):', "    print('Hello from Lambda!')", "    return {'statusCode': 200, 'body': 'Hello from Lambda!'}"].join('\n')
};

function portada(cx) {
  cx.migas([migaLambda]);
  const st = { lenguaje: 'js', salida: null };
  const demo = ui.region(() =>
    h(
      'div',
      { class: 'cx-form' },
      ui.segmentado({
        etiquetaAccesible: 'Language',
        valor: st.lenguaje,
        opciones: [
          { valor: 'js', etiqueta: 'Node.js' },
          { valor: 'py', etiqueta: 'Python' }
        ],
        alCambiar: (v) => {
          st.lenguaje = v;
          st.salida = null;
          demo.repintar();
        }
      }),
      h('pre', { class: 'cx-log' }, DEMO[st.lenguaje]),
      h(
        'div',
        { class: 'cx-acciones' },
        ui.boton('Run', {
          variante: 'primario',
          escribe: false,
          icono: 'caret-right',
          alClic: () => {
            // La demo también se interpreta (no se ejecuta), igual que el código del alumno.
            const r = interpretarCodigo(DEMO[st.lenguaje], st.lenguaje, {});
            st.salida = r;
            demo.repintar();
          }
        })
      ),
      st.salida
        ? h(
            'div',
            { class: 'cx-bloque' },
            h('b', {}, 'Response'),
            h('pre', { class: 'cx-log' }, JSON.stringify(st.salida.respuesta, null, 2)),
            h('b', {}, 'Function Logs'),
            h('pre', { class: 'cx-log' }, st.salida.logs.map((l) => l.texto).join('\n')),
            h('p', { class: 'cx-texto-sec' }, 'Así funciona Lambda: tú solo escribes la función; AWS la corre cuando llega un evento y te cobra por invocación y por milisegundo. No hay servidores que prender ni apagar.')
          )
        : null
    )
  );
  return h(
    'div',
    { class: 'cx-pagina' },
    h(
      'div',
      { class: 'cx-msj-portada' },
      h(
        'div',
        { class: 'cx-msj-portada__texto' },
        h('p', { class: 'cx-texto-sec' }, 'Compute'),
        h('h1', { class: 'cx-msj-portada__titulo' }, 'AWS Lambda'),
        h('p', { class: 'cx-msj-portada__lema' }, 'Run code without thinking about servers.'),
        h('p', { class: 'cx-texto-sec' }, 'AWS Lambda is a serverless compute service for running code without having to provision or manage servers. You pay only for the compute time you consume.')
      ),
      ui.contenedor({
        titulo: 'Get started',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          h('p', {}, 'Author a Lambda function from scratch, or choose from one of many preconfigured examples.'),
          h('div', { class: 'cx-acciones', style: { justifyContent: 'flex-end' } }, ui.boton('Create a function', { variante: 'primario', alClic: () => cx.ir('lambda/funciones/crear') }))
        )
      })
    ),
    ui.contenedor({ titulo: 'How it works', info: 'lambda-funcion', cx, cuerpo: demo }),
    ui.contenedor({
      titulo: 'Use cases',
      cuerpo: ui.pares(
        [
          { etiqueta: 'File processing', valor: 'Run code when a file lands in Amazon S3.' },
          { etiqueta: 'Stream and queue processing', valor: 'Process messages from Amazon SQS or notifications from Amazon SNS.' },
          { etiqueta: 'Scheduled tasks', valor: 'Run code every few minutes with an Amazon EventBridge rule.' }
        ],
        { columnas: 3 }
      )
    })
  );
}

/* ============================================================== dashboard */

function panel(cx) {
  cx.migas([migaLambda, { texto: 'Dashboard' }]);
  return cx.vivo(() => {
    const lista = funciones(cx);
    const bytes = lista.reduce((s, f) => s + new TextEncoder().encode(f.codigo ?? '').length, 0);
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({ titulo: 'Dashboard', acciones: [ui.boton('Create function', { variante: 'primario', alClic: () => cx.ir('lambda/funciones/crear') })] }),
      ui.contenedor({
        titulo: 'Resources for US East (N. Virginia)',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Lambda function(s)', valor: ui.enlace(String(lista.length), 'lambda/funciones', { cx }) },
            { etiqueta: 'Code storage', valor: `${(bytes / 1024).toFixed(1)} kB (0% of 75 GB)` },
            { etiqueta: 'Full account concurrency', valor: '1000' },
            { etiqueta: 'Unreserved account concurrency', valor: '1000' }
          ],
          { columnas: 4 }
        )
      }),
      ui.contenedor({
        titulo: 'Account-level metrics',
        descripcion: 'Totales desde que creaste cada función (simulador). Las gráficas por función están en su pestaña Monitor y en CloudWatch → All metrics → AWS/Lambda.',
        cuerpo: lista.length
          ? ui.pares(
              [
                { etiqueta: 'Invocations', valor: String(lista.reduce((s, f) => s + f.invocaciones, 0)) },
                { etiqueta: 'Errors', valor: String(lista.reduce((s, f) => s + f.errores, 0)) },
                { etiqueta: 'Throttles', valor: '0' },
                { etiqueta: 'Concurrent executions (max)', valor: lista.some((f) => f.invocaciones) ? '1' : '0' }
              ],
              { columnas: 4 }
            )
          : h('p', { class: 'cx-texto-sec' }, 'No data available. Create a function and test it to see metrics here.')
      })
    );
  });
}

/* ========================================================= la lista */

function borrarFuncion(cx, fn, { alTerminar } = {}) {
  cx.confirmar({
    titulo: 'Delete function',
    textoBoton: 'Delete',
    palabra: 'confirm',
    contenido: [
      h('p', {}, `Deleting a function permanently removes the function code. The related logs and roles are retained in your account.`),
      h('p', {}, h('b', {}, fn.nombre)),
      ui.alerta({ tipo: 'info', contenido: 'Simulador: como en AWS, el rol de ejecución se queda en IAM y el log group /aws/lambda/… se queda en CloudWatch. Los disparadores de SQS se borran con la función.' })
    ],
    aceptar: () => {
      const r = cx.hacer({ servicio: 'Lambda', accion: 'DeleteFunction', error: `Failed to delete function ${fn.nombre}` }, (e) => eliminarFuncion(e, fn.nombre));
      if (!r.ok) return false;
      if (cx.memoria.lambda) delete cx.memoria.lambda[fn.nombre];
      cx.flash({ tipo: 'exito', texto: `Successfully deleted function "${fn.nombre}".` });
      alTerminar?.();
    }
  });
}

function listaFunciones(cx) {
  cx.migas([migaLambda, { texto: 'Functions' }]);
  const t = ui.tabla(cx, {
    titulo: 'Functions',
    info: 'lambda-funcion',
    filas: () => funciones(cx),
    clave: (f) => f.nombre,
    seleccion: 'unica',
    filtro: 'Filter by tags and attributes or search by keyword',
    columnas: [
      { titulo: 'Function name', valor: (f) => ui.enlace(f.nombre, rutaFn(f), { cx }), texto: (f) => f.nombre },
      { titulo: 'Description', valor: (f) => f.descripcion || '-' },
      { titulo: 'Package type', valor: () => 'Zip' },
      { titulo: 'Runtime', valor: (f) => nombreRuntime(f.runtime) },
      { titulo: 'Last modified', valor: (f) => hace(f.modificado), texto: (f) => f.modificado }
    ],
    acciones: (sel) => [
      ui.menuBoton('Actions', () => [
        { texto: 'View details', desactivado: !sel[0], alClic: () => cx.ir(rutaFn(sel[0])) },
        { texto: 'Test', desactivado: !sel[0], alClic: () => ((memoriaFn(cx, sel[0].nombre).pestana = 'test'), cx.ir(rutaFn(sel[0]))) },
        { texto: 'Delete', escribe: true, desactivado: !sel[0], alClic: () => borrarFuncion(cx, sel[0]) }
      ]),
      ui.boton('Create function', { variante: 'primario', alClic: () => cx.ir('lambda/funciones/crear') })
    ],
    vacio: { titulo: 'No functions', texto: 'There is no data to display.', accion: () => ui.boton('Create function', { escribe: true, alClic: () => cx.ir('lambda/funciones/crear') }) }
  });
  return h('div', { class: 'cx-pagina' }, t);
}

/* ========================================================== Create function */

const OTROS_RUNTIMES = ['Java 21', 'Java 17', '.NET 8 (C#/F#/PowerShell)', 'Ruby 3.4', 'Amazon Linux 2023'];

function crearFuncionPagina(cx) {
  cx.migas([migaLambda, migaFunciones, { texto: 'Create function' }]);
  const e = cx.estado;
  const f = { modo: 'cero', nombre: '', runtime: 'nodejs22.x', arquitectura: 'x86_64', rol: 'nuevo', rolAbierto: false, rolExistente: null, intento: false };
  const rolesLambda = () => (e.iam?.roles ?? []).filter((r) => r.servicio === 'lambda.amazonaws.com');
  const forma = ui.region(() => {
    const errNombre = f.intento && !f.nombre.trim() ? 'Function name is required.' : null;
    const errRol = f.intento && f.rol === 'existente' && !f.rolExistente ? 'Choose an existing role.' : null;
    return [
      ui.tarjetas({
        columnas: 3,
        valor: f.modo,
        opciones: [
          { valor: 'cero', etiqueta: 'Author from scratch', descripcion: 'Start with a simple Hello World example.' },
          { valor: 'blueprint', etiqueta: 'Use a blueprint', descripcion: 'Build a Lambda application from sample code and configuration presets for common use cases.', desactivado: true },
          { valor: 'contenedor', etiqueta: 'Container image', descripcion: 'Select a container image to deploy for your function.', desactivado: true }
        ],
        alCambiar: (v) => (f.modo = v)
      }),
      ui.contenedor({
        titulo: 'Basic information',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Function name',
            info: 'lambda-funcion',
            cx,
            descripcion: 'Enter a name that describes the purpose of your function.',
            control: ui.entrada({ valor: f.nombre, placeholder: 'myFunctionName', etiquetaAccesible: 'Function name', alCambiar: (v) => (f.nombre = v) }),
            restriccion: 'Function name must be 1 to 64 characters, must be unique to the Region, and can’t include spaces. Valid characters are a-z, A-Z, 0-9, hyphens (-), and underscores (_).',
            error: errNombre
          }),
          ui.campo({
            etiqueta: 'Runtime',
            info: 'lambda-runtime',
            cx,
            descripcion: 'Choose the language to use to write your function. Note that the console code editor supports only Node.js, Python, and Ruby.',
            control: ui.selector({
              valor: f.runtime,
              opciones: [
                ...RUNTIMES_LAMBDA.map((r) => ({ valor: r.id, etiqueta: r.nombre, grupo: 'Latest supported' })),
                ...OTROS_RUNTIMES.map((n) => ({ valor: n, etiqueta: n, desactivado: true, etiquetaDerecha: 'No disponible en el simulador', grupo: 'Other supported' }))
              ],
              alCambiar: (v) => (f.runtime = v)
            })
          }),
          ui.campo({
            etiqueta: 'Architecture',
            info: 'lambda-arquitectura',
            cx,
            descripcion: 'Choose the instruction set architecture you want for your function code.',
            control: ui.radios({
              valor: f.arquitectura,
              opciones: [
                { valor: 'arm64', etiqueta: 'arm64' },
                { valor: 'x86_64', etiqueta: 'x86_64' }
              ],
              alCambiar: (v) => (f.arquitectura = v)
            })
          })
        )
      }),
      ui.contenedor({
        titulo: 'Permissions',
        info: 'lambda-rol',
        cx,
        descripcion: 'By default, Lambda will create an execution role with permissions to upload logs to Amazon CloudWatch Logs. You can customize this default role later when adding triggers.',
        cuerpo: ui.expandible({
          titulo: 'Change default execution role',
          abierto: f.rolAbierto,
          alAlternar: (v) => (f.rolAbierto = v),
          contenido: h(
            'div',
            { class: 'cx-form' },
            ui.campo({
              etiqueta: 'Execution role',
              descripcion: 'Choose a role that defines the permissions of your function. To create a custom role, go to the IAM console.',
              control: ui.radios({
                valor: f.rol,
                opciones: [
                  { valor: 'nuevo', etiqueta: 'Create a new role with basic Lambda permissions' },
                  { valor: 'existente', etiqueta: 'Use an existing role' },
                  { valor: 'plantilla', etiqueta: 'Create a new role from AWS policy templates', desactivado: true }
                ],
                alCambiar: (v) => {
                  f.rol = v;
                  forma.repintar();
                }
              })
            }),
            f.rol === 'nuevo'
              ? ui.alerta({ tipo: 'info', contenido: `Lambda will create an execution role named ${f.nombre.trim() || '<function-name>'}-role-xxxxxxxx, with permission to upload logs to Amazon CloudWatch Logs.` })
              : ui.campo({
                  etiqueta: 'Existing role',
                  descripcion: 'Choose an existing role that you’ve created to be used with this Lambda function. The role must have permission to upload logs to Amazon CloudWatch Logs.',
                  control: ui.selector({
                    placeholder: 'Choose an existing role',
                    filtrar: true,
                    valor: f.rolExistente,
                    opciones: rolesLambda().map((r) => ({ valor: r.nombre, etiqueta: r.nombre, descripcion: r.politicas.join(', ') || 'No policies' })),
                    vacio: 'No roles that Lambda can assume. Create one in IAM (trusted entity: Lambda).',
                    alCambiar: (v) => (f.rolExistente = v)
                  }),
                  error: errRol
                })
          )
        })
      }),
      ui.contenedor({
        titulo: 'Additional configurations',
        plegable: true,
        abierto: false,
        descripcion: 'Use additional configurations to set up networking, security, and governance for your function.',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.casilla({ etiqueta: 'Enable function URL', descripcion: 'Use function URLs to assign HTTP(S) endpoints to your Lambda function.', desactivado: true }),
          ui.casilla({ etiqueta: 'Enable VPC', descripcion: 'Connect your function to a VPC to access private resources during invocation.', desactivado: true }),
          ui.casilla({ etiqueta: 'Enable code signing', desactivado: true }),
          h('p', { class: 'cx-texto-sec' }, 'Simulador: estas opciones no están disponibles aquí.')
        )
      })
    ];
  }, { clase: 'cx-pagina' });

  function crear() {
    f.intento = true;
    forma.repintar();
    if (!f.nombre.trim() || (f.rol === 'existente' && !f.rolExistente)) return;
    const rol = f.rol === 'existente' ? { modo: 'existente', nombre: f.rolExistente } : { modo: 'nuevo' };
    const r = cx.hacer({ servicio: 'Lambda', accion: 'CreateFunction', error: 'Failed to create the function' }, (es) => crearFuncion(es, { nombre: f.nombre, runtime: f.runtime, arquitectura: f.arquitectura, rol }));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Successfully created the function ${r.valor.nombre}. You can now change its code and configuration. To invoke your function with a test event, choose "Test".` });
      cx.ir(rutaFn(r.valor));
    }
  }

  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Create function', info: 'lambda-funcion', cx, descripcion: 'Choose one of the following options to create your function.' }),
    forma,
    ui.pieFormulario({ cancelar: () => cx.ir('lambda/funciones'), enviar: crear, textoEnviar: 'Create function' })
  );
}

/* ======================================================= detalle: overview */

/** El texto corto de un disparador para el diagrama y la tabla. */
function detalleDisparador(d) {
  if (d.tipo === 'sqs') return `Batch size: ${d.tamanoLote}`;
  if (d.tipo === 'eventbridge') return d.expresion ? `Schedule expression: ${d.expresion}` : 'Event pattern';
  if (d.tipo === 's3') return `Event types: ${(d.eventos ?? []).join(', ')}${d.prefijo ? ` · Prefix: ${d.prefijo}` : ''}${d.sufijo ? ` · Suffix: ${d.sufijo}` : ''}`;
  return 'Topic subscription';
}

/** La ruta del recurso que dispara (para el enlace). */
function rutaFuente(d) {
  if (d.tipo === 'sns') return `sns/temas/${encodeURIComponent(d.nombre)}`;
  if (d.tipo === 'sqs') return `sqs/colas/${encodeURIComponent(d.nombre)}`;
  if (d.tipo === 'eventbridge') return `eventbridge/reglas/${encodeURIComponent(d.nombre)}`;
  if (d.tipo === 's3') return `s3/buckets/${encodeURIComponent(d.nombre)}`;
  return null;
}

function resumenFuncion(cx, nombre) {
  return cx.vivo(() => {
    const fn = funcionLambda(cx.estado, nombre);
    if (!fn) return null;
    const disp = disparadoresLambda(cx.estado, fn.nombre);
    const irDisparadores = () => {
      memoriaFn(cx, fn.nombre).pestana = 'config';
      cx.memoria.lambdaConfig = 'disparadores';
      cx.ir(rutaFn(fn));
    };
    return ui.contenedor({
      titulo: 'Function overview',
      info: 'lambda-disparador',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-msj-resumen-fn' },
        h(
          'div',
          { class: 'cx-msj-diagrama' },
          h(
            'div',
            { class: 'cx-msj-diagrama__lado' },
            disp.map((d) =>
              h(
                'button',
                { type: 'button', class: 'cx-msj-disparador', title: d.fuente, onclick: irDisparadores },
                ui.icono('status-positive'),
                h('span', {}, NOMBRE_DISPARADOR[d.tipo], h('small', {}, d.nombre))
              )
            ),
            ui.boton('+ Add trigger', { escribe: true, alClic: () => cx.ir(rutaFn(fn, 'disparador')) })
          ),
          h(
            'div',
            { class: 'cx-msj-diagrama__fn' },
            h('div', { class: 'cx-msj-diagrama__titulo' }, cx.iconoServicio('lambda', 20), h('span', {}, fn.nombre)),
            h('span', { class: 'cx-texto-sec' }, 'Layers (0)')
          ),
          h('div', { class: 'cx-msj-diagrama__lado' }, ui.boton('+ Add destination', { desactivado: true }))
        ),
        ui.pares(
          [
            { etiqueta: 'Description', valor: fn.descripcion || '-' },
            { etiqueta: 'Last modified', valor: hace(fn.modificado) },
            { etiqueta: 'Function ARN', valor: ui.copiable(fn.arn) },
            { etiqueta: 'Function URL', valor: '-', info: 'lambda-url' }
          ],
          { columnas: 1, cx }
        )
      )
    });
  });
}

/* ============================================================ pestaña Code */

/** Formatea el resultado de una invocación como la salida del editor de la consola. */
function textoSalida(r, nombreEvento) {
  const respuesta = JSON.stringify(r.respuesta ?? null, null, 2);
  return [
    `Status: ${r.ok ? 'Succeeded' : 'Failed'}`,
    `Test Event Name: ${nombreEvento ?? '(unsaved) test event'}`,
    '',
    'Response:',
    respuesta,
    '',
    'Function Logs:',
    r.log,
    '',
    `Request ID: ${r.requestId}`
  ].join('\n');
}

/** El aviso en español cuando el intérprete no pudo leer el return. */
function avisoInterpretado(r) {
  if (!r || r.interpretado !== false) return null;
  return ui.alerta({
    tipo: 'aviso',
    titulo: 'Simulador: no se pudo calcular la respuesta',
    contenido: 'El simulador nunca ejecuta tu código: lo lee como texto. Entiende un return con valores fijos (por ejemplo { statusCode: 200, body: … }), return event, variables sencillas y console.log / print. Si antes del return hay condiciones (if) o ciclos (for/while), la respuesta sale null. El log START / END / REPORT sí es real del simulador.'
  });
}

/** Modal «Create new test event» (lo usan Code y el botón Test sin evento). */
function modalEvento(cx, fn, { alGuardar } = {}) {
  const plantillas = plantillasEvento(cx);
  const f = { nombre: '', compartido: false, plantilla: 'hello-world', json: JSON_INICIAL, intento: false };
  const forma = ui.region(() =>
    h(
      'div',
      { class: 'cx-form' },
      ui.campo({
        etiqueta: 'Event Name',
        control: ui.entrada({ valor: f.nombre, placeholder: 'MyEventName', etiquetaAccesible: 'Event Name', alCambiar: (v) => (f.nombre = v) }),
        restriccion: 'Maximum of 25 characters consisting of letters, numbers, dots, hyphens and underscores.',
        error: f.intento && !f.nombre.trim() ? 'Event name is required.' : null
      }),
      ui.campo({
        etiqueta: 'Event sharing settings',
        control: ui.radios({
          valor: f.compartido ? 'si' : 'no',
          opciones: [
            { valor: 'no', etiqueta: 'Private', descripcion: 'This event is only available in the Lambda console and to the event creator.' },
            { valor: 'si', etiqueta: 'Shareable', descripcion: 'This event is available to IAM users within the same account who have permissions to access and use shareable events.' }
          ],
          alCambiar: (v) => (f.compartido = v === 'si')
        })
      }),
      ui.campo({
        etiqueta: 'Template',
        opcional: true,
        control: ui.selector({
          valor: f.plantilla,
          filtrar: true,
          opciones: plantillas.map((p) => ({ valor: p.valor, etiqueta: p.etiqueta })),
          alCambiar: (v) => {
            f.plantilla = v;
            f.json = JSON.stringify(plantillas.find((p) => p.valor === v).json, null, 2);
            forma.repintar();
          }
        })
      }),
      ui.campo({ etiqueta: 'Event JSON', control: ui.area({ valor: f.json, filas: 12, monoespaciado: true, etiquetaAccesible: 'Event JSON', alCambiar: (v) => (f.json = v) }) })
    )
  );
  const guardar = () => {
    f.intento = true;
    forma.repintar();
    if (!f.nombre.trim()) return;
    const r = cx.hacer({ servicio: 'Lambda', accion: 'SaveTestEvent', error: 'Failed to save the test event' }, (e) => guardarEventoPrueba(e, fn.nombre, { nombreEvento: f.nombre.trim(), json: f.json, compartido: f.compartido }));
    if (!r.ok) return;
    m.cerrar();
    cx.flash({ tipo: 'exito', texto: `The test event ${f.nombre.trim()} was successfully saved.` });
    alGuardar?.(f.nombre.trim());
  };
  const m = cx.modal({
    titulo: 'Create new test event',
    ancho: 'grande',
    contenido: forma,
    pie: [ui.boton('Cancel', { variante: 'texto', alClic: () => m.cerrar() }), ui.boton('Save', { variante: 'primario', alClic: guardar })]
  });
}

function pestanaCodigo(cx, nombre) {
  const fn0 = funcionLambda(cx.estado, nombre);
  const mem = memoriaFn(cx, nombre);
  if (mem.borrador === null) mem.borrador = fn0.codigo;
  const fn = () => funcionLambda(cx.estado, nombre);
  const sinDesplegar = () => mem.borrador !== fn()?.codigo;

  const editor = h('textarea', {
    class: 'cx-msj-codigo',
    spellcheck: 'false',
    'aria-label': 'Code editor',
    value: mem.borrador,
    oninput: (ev) => {
      mem.borrador = ev.target.value;
      lado.repintar();
      pestanaArchivo.repintar();
    },
    onkeydown: (ev) => {
      // Tab mete dos espacios, como en el editor de la consola.
      if (ev.key === 'Tab' && !ev.shiftKey) {
        ev.preventDefault();
        const t = ev.target;
        const ini = t.selectionStart;
        t.setRangeText('  ', ini, t.selectionEnd, 'end');
        mem.borrador = t.value;
        lado.repintar();
        pestanaArchivo.repintar();
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && (ev.key === 'U' || ev.key === 'u')) {
        ev.preventDefault();
        desplegar();
      }
    }
  });
  editor.value = mem.borrador;
  if (cx.soloLectura) editor.readOnly = true;

  const pestanaArchivo = ui.region(() => [ui.icono('file'), h('span', {}, fn()?.archivo ?? ''), sinDesplegar() ? h('em', { title: 'Undeployed changes' }, '●') : null], { clase: 'cx-msj-editor__pestana' });

  function desplegar() {
    const r = cx.hacer({ servicio: 'Lambda', accion: 'UpdateFunctionCode', error: 'Failed to update the function code' }, (e) => desplegarCodigo(e, nombre, mem.borrador));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Successfully updated the function ${nombre}.` });
      lado.repintar();
      pestanaArchivo.repintar();
    }
  }

  function probar() {
    const f = fn();
    const evento = f.eventosPrueba.find((x) => x.nombre === mem.evento);
    if (!evento) {
      modalEvento(cx, f, {
        alGuardar: (n) => {
          mem.evento = n;
          lado.repintar();
        }
      });
      return;
    }
    const r = cx.hacer({ servicio: 'Lambda', accion: 'Invoke', error: 'Failed to invoke the function' }, (e) => probarFuncion(e, nombre, evento.json));
    if (r.ok) {
      mem.resultado = { ...r.valor, evento: evento.nombre, conCambios: sinDesplegar() };
      salida.repintar();
    }
  }

  const lado = ui.region(
    () => {
      const f = fn();
      if (!f) return null;
      const cambios = sinDesplegar();
      return [
        h('div', { class: 'cx-msj-editor__titulo' }, 'EXPLORER'),
        h('div', { class: 'cx-msj-editor__evento' }, h('span', {}, ui.icono('caret-down'), ` ${f.nombre.toUpperCase()}`)),
        h('div', { class: 'cx-msj-editor__evento' }, h('span', { class: 'cx-mono', style: { paddingLeft: '18px' } }, ui.icono('file'), ` ${f.archivo}`)),
        h('div', { class: 'cx-msj-editor__titulo' }, cambios ? 'DEPLOY [UNDEPLOYED CHANGES]' : 'DEPLOY'),
        cambios ? h('p', { class: 'cx-texto-sec', style: { margin: 0 } }, 'You have undeployed changes.') : null,
        ui.boton('Deploy', { variante: cambios ? 'primario' : 'normal', escribe: true, titulo: 'Ctrl+Shift+U', alClic: desplegar }),
        ui.boton('Test', { escribe: true, alClic: probar }),
        h('div', { class: 'cx-msj-editor__titulo' }, `TEST EVENTS [${mem.evento && f.eventosPrueba.some((x) => x.nombre === mem.evento) ? `SELECTED: ${mem.evento}` : 'NONE SELECTED'}]`),
        ui.boton('+ Create new test event', {
          variante: 'texto',
          escribe: true,
          alClic: () =>
            modalEvento(cx, f, {
              alGuardar: (n) => {
                mem.evento = n;
                lado.repintar();
              }
            })
        }),
        f.eventosPrueba.length
          ? h(
              'div',
              { class: 'cx-radios' },
              f.eventosPrueba.map((ev) =>
                h(
                  'div',
                  { class: 'cx-msj-editor__evento' },
                  h(
                    'label',
                    { class: 'cx-radio' },
                    h('input', {
                      type: 'radio',
                      name: `evento-${f.nombre}`,
                      checked: ev.nombre === mem.evento,
                      onchange: () => {
                        mem.evento = ev.nombre;
                        lado.repintar();
                      }
                    }),
                    h('span', { class: 'cx-casilla__etiqueta' }, ev.nombre)
                  ),
                  ui.boton('', {
                    variante: 'icono',
                    icono: 'remove',
                    titulo: `Delete ${ev.nombre}`,
                    escribe: true,
                    alClic: () => {
                      const r = cx.hacer({ servicio: 'Lambda', accion: 'DeleteTestEvent', error: 'Failed to delete the test event' }, (e) => eliminarEventoPrueba(e, f.nombre, ev.nombre));
                      if (r.ok) {
                        if (mem.evento === ev.nombre) mem.evento = null;
                        lado.repintar();
                      }
                    }
                  })
                )
              )
            )
          : null
      ];
    },
    { clase: 'cx-msj-editor__lado' }
  );

  const salida = ui.region(() => {
    const r = mem.resultado;
    if (!r) return h('div', { class: 'cx-msj-salida' }, h('div', { class: 'cx-msj-salida__titulo' }, 'OUTPUT'), h('span', { class: 'cx-texto-sec' }, 'Choose Test to invoke your function. The execution results appear here.'));
    return [
      r.conCambios ? ui.alerta({ tipo: 'aviso', contenido: 'Test usó el código DESPLEGADO. Tienes cambios sin desplegar: pulsa Deploy y vuelve a probar para ver tus cambios.' }) : null,
      avisoInterpretado(r),
      h('div', { class: 'cx-msj-salida' }, h('div', { class: 'cx-msj-salida__titulo' }, 'OUTPUT · Execution results'), h('span', { class: r.ok ? 'cx-msj-salida__ok' : 'cx-msj-salida__mal' }, textoSalida(r, r.evento)))
    ];
  });

  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({
      titulo: 'Code source',
      info: 'lambda-codigo',
      cx,
      acciones: [ui.boton('Open in Visual Studio Code', { desactivado: true }), ui.menuBoton('Upload from', () => [{ texto: '.zip file', desactivado: true }, { texto: 'Amazon S3 location', desactivado: true }])],
      cuerpo: [h('div', { class: 'cx-msj-editor' }, lado, h('div', { class: 'cx-msj-editor__principal' }, pestanaArchivo, editor, salida))]
    }),
    cx.vivo(() => {
      const f = fn();
      if (!f) return null;
      return [
        ui.contenedor({
          titulo: 'Code properties',
          cuerpo: ui.pares(
            [
              { etiqueta: 'Package size', valor: `${(new TextEncoder().encode(f.codigo).length / 1024).toFixed(1)} kB` },
              { etiqueta: 'SHA256 hash', valor: ui.copiable(f.sha) },
              { etiqueta: 'Last modified', valor: ui.fechaLarga(f.modificado) },
              { etiqueta: 'Encryption with AWS KMS customer managed KMS key', valor: '-' }
            ],
            { columnas: 4 }
          )
        }),
        ui.contenedor({
          titulo: 'Runtime settings',
          info: 'lambda-runtime',
          cx,
          cuerpo: ui.pares(
            [
              { etiqueta: 'Runtime', valor: nombreRuntime(f.runtime) },
              { etiqueta: 'Handler', valor: f.handler, info: 'lambda-handler' },
              { etiqueta: 'Architecture', valor: f.arquitectura }
            ],
            { columnas: 3, cx }
          )
        }),
        ui.contenedor({ titulo: 'Layers', contador: 0, cuerpo: h('p', { class: 'cx-texto-sec' }, 'There is no data to display.') })
      ];
    })
  );
}

/* ============================================================ pestaña Test */

function resultadoTest(cx, r) {
  if (!r) return null;
  const titulo = `Executing function: ${r.ok ? 'succeeded' : 'failed'}`;
  return h(
    'div',
    { class: 'cx-msj-resultado' },
    ui.alerta({
      tipo: r.ok ? 'exito' : 'error',
      titulo,
      contenido: ui.expandible({
        titulo: 'Details',
        abierto: true,
        contenido: h(
          'div',
          { class: 'cx-form' },
          h('p', { class: 'cx-texto-sec' }, 'The area below shows the last 4 KB of the execution log.'),
          h('pre', { class: 'cx-log' }, JSON.stringify(r.respuesta ?? null, null, 2)),
          h('b', {}, 'Summary'),
          ui.pares(
            [
              { etiqueta: 'Code SHA-256', valor: funcionLambda(cx.estado, r.fn)?.sha ?? '-' },
              { etiqueta: 'Execution time', valor: hace(r.cuando) },
              { etiqueta: 'Request ID', valor: r.requestId },
              { etiqueta: 'Function version', valor: '$LATEST' },
              { etiqueta: 'Init duration', valor: r.inicio ? `${r.inicio.toFixed(2)} ms` : '-' },
              { etiqueta: 'Duration', valor: `${r.duracion.toFixed(2)} ms` },
              { etiqueta: 'Billed duration', valor: `${r.facturada} ms` },
              { etiqueta: 'Resources configured', valor: `${funcionLambda(cx.estado, r.fn)?.memoria ?? 128} MB` },
              { etiqueta: 'Max memory used', valor: `${r.memoriaUsada} MB` }
            ],
            { columnas: 3 }
          ),
          h('b', { style: { marginTop: '8px' } }, 'Log output'),
          h('pre', { class: 'cx-log' }, r.log)
        )
      })
    }),
    avisoInterpretado(r)
  );
}

function pestanaTest(cx, nombre) {
  const mem = memoriaFn(cx, nombre);
  const plantillas = plantillasEvento(cx);
  const fn = () => funcionLambda(cx.estado, nombre);
  const f = mem.formaTest ?? { accion: 'nuevo', nombre: '', guardado: null, compartido: false, plantilla: 'hello-world', json: JSON_INICIAL, error: null };
  mem.formaTest = f;
  const resultado = ui.region(() => (mem.resultadoTest ? resultadoTest(cx, mem.resultadoTest) : null));

  const forma = ui.region(() => {
    const lista = fn()?.eventosPrueba ?? [];
    return ui.contenedor({
      titulo: 'Test event',
      info: 'lambda-test',
      cx,
      descripcion: 'To invoke your function without saving an event, configure the JSON event, then choose Test.',
      acciones: [
        ui.boton('Format JSON', {
          alClic: () => {
            try {
              f.json = JSON.stringify(JSON.parse(f.json), null, 2);
              f.error = null;
            } catch {
              f.error = 'There is an error in your JSON event. Correct it before formatting.';
            }
            forma.repintar();
          }
        }),
        ui.boton('Save', { escribe: true, alClic: guardar }),
        ui.boton('Test', { variante: 'primario', icono: 'caret-right', alClic: probar })
      ],
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Test event action',
          control: ui.radios({
            horizontal: true,
            valor: f.accion,
            opciones: [
              { valor: 'nuevo', etiqueta: 'Create new event' },
              { valor: 'guardado', etiqueta: 'Edit saved event', desactivado: !lista.length }
            ],
            alCambiar: (v) => {
              f.accion = v;
              if (v === 'guardado') {
                const ev = lista.find((x) => x.nombre === f.guardado) ?? lista[0];
                f.guardado = ev?.nombre ?? null;
                if (ev) f.json = JSON.stringify(JSON.parse(ev.json), null, 2);
              }
              forma.repintar();
            }
          })
        }),
        f.accion === 'nuevo'
          ? ui.campo({
              etiqueta: 'Event name',
              control: ui.entrada({ valor: f.nombre, placeholder: 'MyEventName', etiquetaAccesible: 'Event name', alCambiar: (v) => (f.nombre = v) }),
              restriccion: 'Maximum of 25 characters consisting of letters, numbers, dots, hyphens and underscores.'
            })
          : ui.campo({
              etiqueta: 'Event name',
              control: ui.selector({
                valor: f.guardado,
                opciones: lista.map((x) => ({ valor: x.nombre, etiqueta: x.nombre, etiquetaDerecha: x.compartido ? 'Shareable' : 'Private' })),
                alCambiar: (v) => {
                  f.guardado = v;
                  const ev = lista.find((x) => x.nombre === v);
                  if (ev) f.json = JSON.stringify(JSON.parse(ev.json), null, 2);
                  forma.repintar();
                }
              })
            }),
        f.accion === 'nuevo'
          ? ui.campo({
              etiqueta: 'Event sharing settings',
              control: ui.radios({
                valor: f.compartido ? 'si' : 'no',
                opciones: [
                  { valor: 'no', etiqueta: 'Private', descripcion: 'This event is only available in the Lambda console and to the event creator. You can configure a total of 10.' },
                  { valor: 'si', etiqueta: 'Shareable', descripcion: 'This event is available to IAM users within the same account who have permissions to access and use shareable events.' }
                ],
                alCambiar: (v) => (f.compartido = v === 'si')
              })
            })
          : null,
        f.accion === 'nuevo'
          ? ui.campo({
              etiqueta: 'Template',
              opcional: true,
              control: ui.selector({
                valor: f.plantilla,
                filtrar: true,
                opciones: plantillas.map((p) => ({ valor: p.valor, etiqueta: p.etiqueta })),
                alCambiar: (v) => {
                  f.plantilla = v;
                  f.json = JSON.stringify(plantillas.find((p) => p.valor === v).json, null, 2);
                  forma.repintar();
                }
              })
            })
          : null,
        ui.campo({
          etiqueta: 'Event JSON',
          control: ui.area({ valor: f.json, filas: 14, monoespaciado: true, etiquetaAccesible: 'Event JSON', alCambiar: (v) => (f.json = v) }),
          error: f.error
        }),
        f.accion === 'guardado' && f.guardado
          ? h(
              'div',
              { class: 'cx-acciones' },
              ui.boton('Delete', {
                escribe: true,
                alClic: () => {
                  const r = cx.hacer({ servicio: 'Lambda', accion: 'DeleteTestEvent', error: 'Failed to delete the test event' }, (e) => eliminarEventoPrueba(e, nombre, f.guardado));
                  if (r.ok) {
                    cx.flash({ tipo: 'exito', texto: `The test event ${f.guardado} was successfully deleted.` });
                    if (mem.evento === f.guardado) mem.evento = null;
                    f.guardado = null;
                    f.accion = 'nuevo';
                    forma.repintar();
                  }
                }
              })
            )
          : null
      )
    });
  });

  function guardar() {
    const n = f.accion === 'nuevo' ? f.nombre.trim() : f.guardado;
    if (!n) {
      f.error = null;
      forma.repintar();
      cx.flash({ tipo: 'error', titulo: 'Failed to save the test event', texto: 'Event name is required. Enter a name for the event, then choose Save.' });
      return;
    }
    const r = cx.hacer({ servicio: 'Lambda', accion: 'SaveTestEvent', error: 'Failed to save the test event' }, (e) => guardarEventoPrueba(e, nombre, { nombreEvento: n, json: f.json, compartido: f.compartido }));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `The test event ${n} was successfully saved.` });
      mem.evento = n;
      f.accion = 'guardado';
      f.guardado = n;
      forma.repintar();
    }
  }

  function probar() {
    const r = cx.hacer({ servicio: 'Lambda', accion: 'Invoke', error: 'Execution failed' }, (e) => probarFuncion(e, nombre, f.json));
    if (r.ok) {
      mem.resultadoTest = { ...r.valor, fn: nombre, cuando: new Date().toISOString() };
      resultado.repintar();
    }
  }

  return h('div', { class: 'cx-pagina' }, resultado, forma);
}

/* ========================================================= pestaña Monitor */

const ORIGENES = { consola: 'Test (console)', sns: 'Amazon SNS', sqs: 'Amazon SQS', eventbridge: 'Amazon EventBridge', s3: 'Amazon S3', cloudwatch: 'CloudWatch alarm' };

function pestanaMonitor(cx, nombre) {
  const st = { elegida: null };
  const irLogs = () => {
    const grupo = `/aws/lambda/${nombre}`;
    const existe = (cx.estado.cloudwatch?.gruposLogs ?? []).some((g) => g.nombre === grupo);
    if (existe) cx.ir(`cloudwatch/logs/${encodeURIComponent(grupo)}`);
    else cx.flash({ tipo: 'info', titulo: 'No log group yet', texto: `The log group ${grupo} doesn’t exist yet. Lambda creates it the first time the function runs: choose Test first.` });
  };
  const ref = (metrica, estadistica, etiqueta) => ({ namespace: 'AWS/Lambda', metrica, dimensiones: { FunctionName: nombre }, estadistica, etiqueta });
  const graficas = cx.vivo(() =>
    h(
      'div',
      { class: 'cx-msj-graficas' },
      [
        ['Invocations', ref('Invocations', 'Sum', 'Invocations')],
        ['Duration', ref('Duration', 'Average', 'Duration Average')],
        ['Error count and success rate', ref('Errors', 'Sum', 'Errors')],
        ['Throttles', ref('Throttles', 'Sum', 'Throttles')]
      ].map(([titulo, r]) => ui.contenedor({ titulo, nivel: 3, cuerpo: graficaMetricas(cx, [r], { puntos: 30, alto: 200, ancho: 520, leyenda: false }) }))
    )
  );
  const tabla = ui.tabla(cx, {
    titulo: 'Recent invocations',
    info: 'lambda-logs',
    variante: 'contenedor',
    descripcion: 'Las últimas 15 invocaciones de esta función (simulador). Elige una para ver su log.',
    filas: () => [...(funcionLambda(cx.estado, nombre)?.ultimas ?? [])].reverse(),
    clave: (u) => u.requestId,
    seleccion: 'unica',
    filtro: false,
    columnas: [
      { titulo: 'Timestamp', valor: (u) => ui.fecha(new Date(u.t).toISOString()) },
      { titulo: 'Request ID', valor: (u) => h('span', { class: 'cx-mono' }, u.requestId), texto: (u) => u.requestId },
      { titulo: 'Invoked by', valor: (u) => ORIGENES[u.origen] ?? u.origen },
      { titulo: 'Status', valor: (u) => (u.ok ? ui.estado('exito', 'Success') : ui.estado('error', 'Error')) },
      { titulo: 'Duration', valor: (u) => `${u.duracion.toFixed(2)} ms` }
    ],
    alSeleccionar: (ids) => {
      st.elegida = ids[0] ?? null;
      detalle.repintar();
    },
    vacio: { titulo: 'No invocations', texto: 'This function hasn’t been invoked yet. Choose Test, or add a trigger.' }
  });
  const detalle = ui.region(() => {
    const u = funcionLambda(cx.estado, nombre)?.ultimas.find((x) => x.requestId === st.elegida);
    if (!u) return null;
    return ui.contenedor({ titulo: `Log · ${u.requestId}`, cuerpo: [h('b', {}, 'Response'), h('pre', { class: 'cx-log' }, u.respuesta), h('b', {}, 'Log'), h('pre', { class: 'cx-log' }, u.log)] });
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.contenedor({
      titulo: 'CloudWatch metrics',
      info: 'lambda-logs',
      cx,
      descripcion: 'Cada punto es un periodo de 10 s del simulador (1 minuto en AWS).',
      acciones: [ui.boton('View CloudWatch logs', { icono: 'external', alClic: irLogs }), ui.boton('View X-Ray traces', { desactivado: true }), ui.boton('View Lambda Insights', { desactivado: true })],
      cuerpo: graficas
    }),
    tabla,
    detalle
  );
}

/* ===================================================== pestaña Configuration */

const SECCIONES_CONFIG = [
  { id: 'general', texto: 'General configuration' },
  { id: 'disparadores', texto: 'Triggers' },
  { id: 'permisos', texto: 'Permissions' },
  { id: 'destinos', texto: 'Destinations', des: true },
  { id: 'url', texto: 'Function URL', des: true },
  { id: 'variables', texto: 'Environment variables' },
  { id: 'etiquetas', texto: 'Tags' },
  { id: 'vpc', texto: 'VPC', des: true },
  { id: 'rds', texto: 'RDS databases', des: true },
  { id: 'monitoreo', texto: 'Monitoring and operations tools', des: true },
  { id: 'concurrencia', texto: 'Concurrency and recursion detection', des: true },
  { id: 'asincrona', texto: 'Asynchronous invocation', des: true },
  { id: 'firma', texto: 'Code signing', des: true },
  { id: 'archivos', texto: 'File systems', des: true },
  { id: 'maquinas', texto: 'State machines', des: true }
];

function confGeneral(cx, fn) {
  return ui.contenedor({
    titulo: 'General configuration',
    info: 'lambda-config',
    cx,
    acciones: ui.boton('Edit', { escribe: true, alClic: () => cx.ir(rutaFn(fn, 'configuracion/general')) }),
    cuerpo: ui.pares(
      [
        { etiqueta: 'Description', valor: fn.descripcion || '-' },
        { etiqueta: 'Memory', valor: `${fn.memoria} MB`, info: 'lambda-memoria' },
        { etiqueta: 'Ephemeral storage', valor: `${fn.efimero} MB` },
        { etiqueta: 'Timeout', valor: textoTimeout(fn.timeout), info: 'lambda-timeout' },
        { etiqueta: 'SnapStart', valor: 'None' }
      ],
      { columnas: 3, cx }
    )
  });
}

function confDisparadores(cx, nombre) {
  return ui.tabla(cx, {
    titulo: 'Triggers',
    info: 'lambda-disparador',
    variante: 'contenedor',
    filas: () => disparadoresLambda(cx.estado, nombre),
    clave: (d) => `${d.tipo}:${d.id}`,
    seleccion: 'unica',
    filtro: 'Find triggers',
    columnas: [
      {
        titulo: 'Trigger',
        valor: (d) => h('div', {}, h('b', {}, `${NOMBRE_DISPARADOR[d.tipo]}: `), ui.enlace(d.nombre, rutaFuente(d), { cx }), h('div', { class: 'cx-texto-sec cx-mono' }, d.fuente)),
        texto: (d) => `${d.tipo} ${d.nombre}`
      },
      { titulo: 'Details', valor: (d) => detalleDisparador(d) },
      { titulo: 'State', valor: (d) => (d.estado === 'Enabled' ? ui.estado('exito', 'Enabled') : ui.estado('detenido', 'Disabled')) }
    ],
    acciones: (sel) => {
      const d = sel[0];
      return [
        d?.tipo === 'sqs'
          ? ui.boton(d.estado === 'Enabled' ? 'Disable' : 'Enable', {
              escribe: true,
              alClic: () => {
                const r = cx.hacer({ servicio: 'Lambda', accion: 'UpdateEventSourceMapping', error: 'Failed to update the trigger' }, (e) => editarMapeoLambda(e, nombre, d.id, { activo: d.estado !== 'Enabled' }));
                if (r.ok) cx.flash({ tipo: 'exito', texto: `The trigger ${d.nombre} was successfully ${d.estado === 'Enabled' ? 'disabled' : 'enabled'}.` });
              }
            })
          : null,
        ui.boton('Delete', {
          desactivado: !d,
          escribe: true,
          alClic: () =>
            cx.confirmar({
              titulo: 'Delete trigger',
              textoBoton: 'Delete',
              contenido: h('p', {}, `Are you sure you want to delete the ${NOMBRE_DISPARADOR[d.tipo]} trigger ${d.nombre}? The function stops receiving its events.`),
              aceptar: () => {
                const r = cx.hacer({ servicio: 'Lambda', accion: 'DeleteTrigger', error: 'Failed to delete the trigger' }, (e) => quitarDisparador(e, nombre, { tipo: d.tipo, id: d.id }));
                if (!r.ok) return false;
                cx.flash({ tipo: 'exito', texto: `The trigger ${d.nombre} was successfully deleted from function ${nombre}.` });
              }
            })
        }),
        ui.boton('Add trigger', { escribe: true, alClic: () => cx.ir(rutaFn(nombre, 'disparador')) })
      ];
    },
    vacio: { titulo: 'No triggers', texto: 'There are no triggers for this function.', accion: () => ui.boton('Add trigger', { escribe: true, alClic: () => cx.ir(rutaFn(nombre, 'disparador')) }) }
  });
}

/** Las declaraciones de la política basada en recursos (quién puede invocar). */
function declaracionesRecurso(cx, fn) {
  return disparadoresLambda(cx.estado, fn.nombre)
    .filter((d) => d.tipo !== 'sqs')
    .map((d) => ({
      sid: d.tipo === 'sns' ? `sns-${d.nombre}` : d.tipo === 'eventbridge' ? `AWSEvents_${d.nombre}_${d.id.slice(0, 6)}` : `s3-${d.nombre}`,
      principal: { sns: 'sns.amazonaws.com', eventbridge: 'events.amazonaws.com', s3: 's3.amazonaws.com' }[d.tipo],
      condicion: d.fuente
    }));
}

function confPermisos(cx, fn) {
  const rol = (cx.estado.iam?.roles ?? []).find((r) => r.nombre === fn.rol);
  const basica = rol?.politicas.some((p) => ['AWSLambdaBasicExecutionRole', 'AdministratorAccess', 'PowerUserAccess'].includes(p));
  const decl = declaracionesRecurso(cx, fn);
  return [
    ui.contenedor({
      titulo: 'Execution role',
      info: 'lambda-rol',
      cx,
      acciones: ui.boton('Edit', { escribe: true, alClic: () => cx.ir(rutaFn(fn, 'configuracion/general')) }),
      cuerpo: [
        ui.pares([{ etiqueta: 'Role name', valor: rol ? ui.enlace(rol.nombre, `iam/roles/${encodeURIComponent(rol.nombre)}`, { cx }) : fn.rol }], { columnas: 1 }),
        h('b', { style: { display: 'block', margin: '12px 0 4px' } }, 'Resource summary'),
        basica
          ? ui.pares(
              [
                { etiqueta: 'Amazon CloudWatch Logs', valor: '3 actions, 2 resources' },
                { etiqueta: 'By action', valor: 'logs:CreateLogGroup · logs:CreateLogStream · logs:PutLogEvents' }
              ],
              { columnas: 2 }
            )
          : ui.alerta({ tipo: 'aviso', contenido: 'This role doesn’t allow Lambda to write logs to Amazon CloudWatch Logs. Attach AWSLambdaBasicExecutionRole to the role in IAM.' })
      ]
    }),
    ui.contenedor({
      titulo: 'Resource-based policy statements',
      contador: decl.length,
      info: 'lambda-politica',
      cx,
      descripcion: 'Resource-based policies grant other AWS services permission to invoke your function. The console adds them when you add a trigger.',
      cuerpo: decl.length
        ? h(
            'table',
            { class: 'cx-msj-tabla' },
            h('thead', {}, h('tr', {}, ['Statement ID', 'Principal', 'Conditions', 'Action'].map((t) => h('th', {}, t)))),
            h('tbody', {}, decl.map((d) => h('tr', {}, h('td', {}, d.sid), h('td', {}, d.principal), h('td', { class: 'cx-mono' }, `ArnLike AWS:SourceArn ${d.condicion}`), h('td', {}, 'lambda:InvokeFunction'))))
          )
        : h('p', { class: 'cx-texto-sec' }, 'No resource-based policy statements. Las colas de SQS no necesitan una: Lambda lee la cola con su rol de ejecución.')
    })
  ];
}

function confVariables(cx, fn) {
  return ui.contenedor({
    titulo: 'Environment variables',
    contador: fn.variables.length,
    info: 'lambda-variables',
    cx,
    acciones: ui.boton('Edit', { escribe: true, alClic: () => cx.ir(rutaFn(fn, 'configuracion/variables')) }),
    descripcion: 'You can define environment variables as key-value pairs that are accessible from your function code.',
    cuerpo: fn.variables.length
      ? h(
          'table',
          { class: 'cx-msj-tabla' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Key'), h('th', {}, 'Value'))),
          h('tbody', {}, fn.variables.map((v) => h('tr', {}, h('td', { class: 'cx-mono' }, v.llave), h('td', { class: 'cx-mono' }, v.valor))))
        )
      : h('p', { class: 'cx-texto-sec' }, 'No environment variables associated with this function.')
  });
}

function pestanaConfig(cx, nombre) {
  const zona = cx.vivo(() => {
    const fn = funcionLambda(cx.estado, nombre);
    if (!fn) return null;
    const actual = cx.memoria.lambdaConfig ?? 'general';
    let cuerpo;
    if (actual === 'disparadores') cuerpo = confDisparadores(cx, nombre);
    else if (actual === 'permisos') cuerpo = confPermisos(cx, fn);
    else if (actual === 'variables') cuerpo = confVariables(cx, fn);
    else if (actual === 'etiquetas') cuerpo = tablaEtiquetas(cx, fn.etiquetas);
    else cuerpo = confGeneral(cx, fn);
    return h(
      'div',
      { class: 'cx-msj-config' },
      h(
        'nav',
        { class: 'cx-msj-config__menu', 'aria-label': 'Configuration' },
        SECCIONES_CONFIG.map((s) =>
          h(
            'button',
            {
              type: 'button',
              class: s.id === actual ? 'cx-msj-config__activo' : null,
              disabled: s.des,
              title: s.des ? 'No disponible en el simulador' : undefined,
              onclick: () => {
                cx.memoria.lambdaConfig = s.id;
                zona.repintar();
              }
            },
            s.texto
          )
        )
      ),
      h('div', { class: 'cx-pagina' }, cuerpo)
    );
  });
  return zona;
}

/* ========================================================= detalle completo */

function detalleFuncion(cx, { nombre }) {
  cx.migas([migaLambda, migaFunciones, { texto: nombre }]);
  const fn = funcionLambda(cx.estado, nombre);
  if (!fn) return noExiste(cx, 'Function', nombre, 'lambda/funciones');
  const mem = memoriaFn(cx, nombre);
  const cabeza = cx.vivo(() => {
    const f = funcionLambda(cx.estado, nombre);
    if (!f) return noExiste(cx, 'Function', nombre, 'lambda/funciones');
    return ui.encabezado({
      titulo: f.nombre,
      info: 'lambda-funcion',
      cx,
      acciones: [
        ui.boton('Throttle', { desactivado: true }),
        ui.boton('Copy ARN', { icono: 'copy', alClic: () => copiar(cx, f.arn) }),
        ui.menuBoton(
          'Actions',
          () => [
            { texto: 'Publish new version', desactivado: true },
            { texto: 'Create alias', desactivado: true },
            { texto: 'Export function', desactivado: true },
            '-',
            { texto: 'Delete function', escribe: true, alClic: () => borrarFuncion(cx, f, { alTerminar: () => cx.ir('lambda/funciones') }) }
          ],
          { alinear: 'derecha' }
        )
      ]
    });
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    cabeza,
    resumenFuncion(cx, nombre),
    ui.pestanas({
      activa: mem.pestana ?? 'codigo',
      alCambiar: (id) => (mem.pestana = id),
      pestanas: [
        { id: 'codigo', texto: 'Code', contenido: () => (funcionLambda(cx.estado, nombre) ? pestanaCodigo(cx, nombre) : null) },
        { id: 'test', texto: 'Test', contenido: () => (funcionLambda(cx.estado, nombre) ? pestanaTest(cx, nombre) : null) },
        { id: 'monitor', texto: 'Monitor', contenido: () => pestanaMonitor(cx, nombre) },
        { id: 'config', texto: 'Configuration', contenido: () => pestanaConfig(cx, nombre) },
        { id: 'alias', texto: 'Aliases', desactivada: true, contenido: () => null },
        { id: 'versiones', texto: 'Versions', desactivada: true, contenido: () => null }
      ]
    })
  );
}

/* ============================================== Edit basic settings */

function editarGeneral(cx, { nombre }) {
  const fn = funcionLambda(cx.estado, nombre);
  cx.migas([migaLambda, migaFunciones, { texto: nombre, ruta: fn ? rutaFn(fn) : null }, { texto: 'Edit basic settings' }]);
  if (!fn) return noExiste(cx, 'Function', nombre, 'lambda/funciones');
  const roles = (cx.estado.iam?.roles ?? []).filter((r) => r.servicio === 'lambda.amazonaws.com');
  const f = { descripcion: fn.descripcion, memoria: String(fn.memoria), efimero: String(fn.efimero), min: String(Math.floor(fn.timeout / 60)), seg: String(fn.timeout % 60), rol: fn.rol, errores: {} };
  const forma = ui.region(() =>
    ui.contenedor({
      titulo: 'Basic settings',
      info: 'lambda-config',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Description', opcional: true, control: ui.entrada({ valor: f.descripcion, etiquetaAccesible: 'Description', alCambiar: (v) => (f.descripcion = v) }) }),
        ui.campo({
          etiqueta: 'Memory',
          info: 'lambda-memoria',
          cx,
          descripcion: 'Your function is allocated CPU proportional to the memory configured.',
          control: ui.entrada({ tipo: 'number', valor: f.memoria, sufijo: 'MB', etiquetaAccesible: 'Memory', alCambiar: (v) => (f.memoria = v) }),
          restriccion: 'Set memory to between 128 MB and 10240 MB',
          error: f.errores.memoria
        }),
        ui.campo({
          etiqueta: 'Ephemeral storage',
          descripcion: 'You can configure up to 10 GB of ephemeral storage (/tmp) for your function.',
          control: ui.entrada({ tipo: 'number', valor: f.efimero, sufijo: 'MB', etiquetaAccesible: 'Ephemeral storage', alCambiar: (v) => (f.efimero = v) }),
          restriccion: 'Set ephemeral storage (/tmp) to between 512 MB and 10240 MB.',
          error: f.errores.efimero
        }),
        ui.campo({ etiqueta: 'SnapStart', control: ui.selector({ valor: 'None', opciones: [{ valor: 'None', etiqueta: 'None' }, { valor: 'PublishedVersions', etiqueta: 'PublishedVersions', desactivado: true }] }) }),
        ui.campo({
          etiqueta: 'Timeout',
          info: 'lambda-timeout',
          cx,
          control: h(
            'div',
            { class: 'cx-msj-rate' },
            ui.entrada({ tipo: 'number', valor: f.min, sufijo: 'min', etiquetaAccesible: 'Timeout minutes', alCambiar: (v) => (f.min = v) }),
            ui.entrada({ tipo: 'number', valor: f.seg, sufijo: 'sec', etiquetaAccesible: 'Timeout seconds', alCambiar: (v) => (f.seg = v) })
          ),
          restriccion: 'El máximo es 15 min 0 sec (900 segundos).',
          error: f.errores.timeout
        }),
        ui.campo({
          etiqueta: 'Execution role',
          info: 'lambda-rol',
          cx,
          descripcion: 'Choose a role that defines the permissions of your function. To create a custom role, go to the IAM console.',
          control: ui.radios({
            valor: 'existente',
            opciones: [
              { valor: 'existente', etiqueta: 'Use an existing role' },
              { valor: 'nuevo', etiqueta: 'Create a new role from AWS policy templates', desactivado: true }
            ]
          })
        }),
        ui.campo({
          etiqueta: 'Existing role',
          control: ui.selector({ valor: f.rol, filtrar: true, opciones: roles.map((r) => ({ valor: r.nombre, etiqueta: r.nombre })), alCambiar: (v) => (f.rol = v) }),
          descripcion: h('span', {}, 'View the ', ui.enlace(`${f.rol} role`, `iam/roles/${encodeURIComponent(f.rol)}`, { cx }), ' on the IAM console.')
        })
      )
    })
  );
  function guardar() {
    f.errores = {};
    const entero = (v) => /^\d+$/.test(String(v).trim());
    if (!entero(f.memoria)) f.errores.memoria = 'Enter a whole number.';
    if (!entero(f.efimero)) f.errores.efimero = 'Enter a whole number.';
    if (!entero(f.min) || !entero(f.seg)) f.errores.timeout = 'Enter whole numbers.';
    forma.repintar();
    if (Object.keys(f.errores).length) return;
    const timeout = Number(f.min) * 60 + Number(f.seg);
    const r = cx.hacer({ servicio: 'Lambda', accion: 'UpdateFunctionConfiguration', error: `Failed to update the function ${nombre}` }, (e) =>
      editarConfiguracionLambda(e, nombre, { descripcion: f.descripcion, memoria: Number(f.memoria), efimero: Number(f.efimero), timeout, rol: f.rol })
    );
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Successfully updated the function ${nombre}.` });
      memoriaFn(cx, nombre).pestana = 'config';
      cx.memoria.lambdaConfig = 'general';
      cx.ir(rutaFn(fn));
    }
  }
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Edit basic settings', info: 'lambda-config', cx }),
    forma,
    ui.pieFormulario({ cancelar: () => cx.ir(rutaFn(fn)), enviar: guardar, textoEnviar: 'Save' })
  );
}

/* ============================================== Edit environment variables */

function editarVariables(cx, { nombre }) {
  const fn = funcionLambda(cx.estado, nombre);
  cx.migas([migaLambda, migaFunciones, { texto: nombre, ruta: fn ? rutaFn(fn) : null }, { texto: 'Edit environment variables' }]);
  if (!fn) return noExiste(cx, 'Function', nombre, 'lambda/funciones');
  const filas = fn.variables.map((v) => ({ ...v }));
  const forma = ui.region(() =>
    ui.contenedor({
      titulo: 'Environment variables',
      info: 'lambda-variables',
      cx,
      descripcion: 'You can define environment variables as key-value pairs that are accessible from your function code. These are useful to store configuration settings without the need to change function code.',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        filas.length
          ? h(
              'div',
              { class: 'cx-reglas', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto' } },
              h('div', { class: 'cx-reglas__cabeza' }, 'Key'),
              h('div', { class: 'cx-reglas__cabeza' }, 'Value'),
              h('div'),
              filas.map((v, i) => [
                ui.entrada({ valor: v.llave, placeholder: 'Key', etiquetaAccesible: `Key ${i + 1}`, alCambiar: (x) => (v.llave = x) }),
                ui.entrada({ valor: v.valor, placeholder: 'Value', etiquetaAccesible: `Value ${i + 1}`, alCambiar: (x) => (v.valor = x) }),
                ui.boton('Remove', { alClic: () => (filas.splice(i, 1), forma.repintar()) })
              ])
            )
          : h('p', { class: 'cx-texto-sec' }, 'No environment variables.'),
        h('div', {}, ui.boton('Add environment variable', { alClic: () => (filas.push({ llave: '', valor: '' }), forma.repintar()) })),
        ui.expandible({ titulo: 'Encryption configuration', contenido: h('p', { class: 'cx-texto-sec' }, 'Lambda encrypts environment variables at rest with an AWS managed key (aws/lambda). No disponible para cambiar en el simulador.') })
      )
    })
  );
  function guardar() {
    const r = cx.hacer({ servicio: 'Lambda', accion: 'UpdateFunctionConfiguration', error: 'Failed to update the environment variables' }, (e) => editarVariablesLambda(e, nombre, filas));
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `Successfully updated the function ${nombre}.` });
      memoriaFn(cx, nombre).pestana = 'config';
      cx.memoria.lambdaConfig = 'variables';
      cx.ir(rutaFn(fn));
    }
  }
  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Edit environment variables', info: 'lambda-variables', cx }),
    forma,
    ui.pieFormulario({ cancelar: () => cx.ir(rutaFn(fn)), enviar: guardar, textoEnviar: 'Save' })
  );
}

/* ================================================================ Add trigger */

const FUENTES = [
  { valor: 'apigateway', etiqueta: 'API Gateway', desactivado: true },
  { valor: 'alb', etiqueta: 'Application Load Balancer', desactivado: true },
  { valor: 'cloudwatchlogs', etiqueta: 'CloudWatch Logs', desactivado: true },
  { valor: 'dynamodb', etiqueta: 'DynamoDB', desactivado: true },
  { valor: 'eventbridge', etiqueta: 'EventBridge (CloudWatch Events)' },
  { valor: 'kinesis', etiqueta: 'Kinesis', desactivado: true },
  { valor: 's3', etiqueta: 'S3' },
  { valor: 'sns', etiqueta: 'SNS' },
  { valor: 'sqs', etiqueta: 'SQS' }
];

const EVENTOS_S3 = [
  { valor: 's3:ObjectCreated:*', etiqueta: 'All object create events' },
  { valor: 's3:ObjectCreated:Put', etiqueta: 'PUT' },
  { valor: 's3:ObjectCreated:Post', etiqueta: 'POST' },
  { valor: 's3:ObjectCreated:Copy', etiqueta: 'COPY' },
  { valor: 's3:ObjectCreated:CompleteMultipartUpload', etiqueta: 'Multipart upload completed' },
  { valor: 's3:ObjectRemoved:*', etiqueta: 'All object delete events' },
  { valor: 's3:ObjectRemoved:Delete', etiqueta: 'Permanently deleted' },
  { valor: 's3:ObjectRemoved:DeleteMarkerCreated', etiqueta: 'Delete marker created' }
];

function agregarDisparadorPagina(cx, { nombre }) {
  const fn = funcionLambda(cx.estado, nombre);
  cx.migas([migaLambda, migaFunciones, { texto: nombre, ruta: fn ? rutaFn(fn) : null }, { texto: 'Add trigger' }]);
  if (!fn) return noExiste(cx, 'Function', nombre, 'lambda/funciones');
  const e = cx.estado;
  const f = {
    fuente: null,
    tema: null,
    cola: null,
    activo: true,
    lote: '10',
    ventana: '',
    reglaModo: 'nueva',
    reglaExistente: null,
    reglaNombre: '',
    reglaDescripcion: '',
    reglaTipo: 'programada',
    expresion: '',
    patron: '{\n  "source": ["aws.ec2"],\n  "detail-type": ["EC2 Instance State-change Notification"]\n}',
    bucket: null,
    eventosS3: ['s3:ObjectCreated:*'],
    prefijo: '',
    sufijo: '',
    acepto: false,
    intento: false
  };
  const errores = () => {
    if (!f.intento) return {};
    const x = {};
    if (!f.fuente) x.fuente = 'Select a source.';
    if (f.fuente === 'sns' && !f.tema) x.tema = 'Select an SNS topic.';
    if (f.fuente === 'sqs' && !f.cola) x.cola = 'Select an SQS queue.';
    if (f.fuente === 'sqs' && !/^\d+$/.test(f.lote.trim())) x.lote = 'Batch size must be a whole number.';
    if (f.fuente === 'eventbridge' && f.reglaModo === 'existente' && !f.reglaExistente) x.regla = 'Select a rule.';
    if (f.fuente === 'eventbridge' && f.reglaModo === 'nueva' && !f.reglaNombre.trim()) x.reglaNombre = 'Rule name is required.';
    if (f.fuente === 'eventbridge' && f.reglaModo === 'nueva' && f.reglaTipo === 'programada' && !f.expresion.trim()) x.expresion = 'Schedule expression is required.';
    if (f.fuente === 's3' && !f.bucket) x.bucket = 'Select a bucket.';
    if (f.fuente === 's3' && !f.acepto) x.acepto = 'You must acknowledge the recursive invocation warning.';
    return x;
  };

  function formaSns(err) {
    return ui.campo({
      etiqueta: 'SNS topic',
      descripcion: 'Select the SNS topic to subscribe to.',
      control: ui.selector({
        placeholder: 'Choose or enter ARN',
        filtrar: true,
        valor: f.tema,
        opciones: (e.sns?.temas ?? []).map((t) => ({ valor: t.arn, etiqueta: t.nombre, descripcion: t.arn, desactivado: t.tipo === 'FIFO', etiquetaDerecha: t.tipo === 'FIFO' ? 'FIFO topics can’t invoke Lambda' : undefined })),
        vacio: 'No topics. Create one in Amazon SNS first.',
        alCambiar: (v) => (f.tema = v)
      }),
      error: err.tema
    });
  }

  function formaSqs(err) {
    const cola = (e.sqs?.colas ?? []).find((c) => c.arn === f.cola);
    return [
      ui.campo({
        etiqueta: 'SQS queue',
        descripcion: 'Choose or enter the ARN of an SQS queue.',
        control: ui.selector({
          placeholder: 'Choose or enter ARN',
          filtrar: true,
          valor: f.cola,
          opciones: (e.sqs?.colas ?? []).map((c) => ({ valor: c.arn, etiqueta: c.nombre, descripcion: `${c.arn} · visibility timeout ${c.visibilidad} s` })),
          vacio: 'No queues. Create one in Amazon SQS first.',
          alCambiar: (v) => {
            f.cola = v;
            forma.repintar();
          }
        }),
        error: err.cola
      }),
      cola && cola.visibilidad < fn.timeout ? ui.alerta({ tipo: 'aviso', contenido: `La visibilidad de la cola (${cola.visibilidad} s) es menor que el timeout de la función (${fn.timeout} s). AWS no deja crear el disparador: sube la visibilidad de la cola o baja el timeout.` }) : null,
      ui.casilla({ etiqueta: 'Activate trigger', descripcion: 'Select to activate the trigger now. Keep unchecked to create the trigger in a deactivated state for testing (recommended).', marcada: f.activo, alCambiar: (v) => (f.activo = v) }),
      ui.casilla({ etiqueta: 'Enable metrics', descripcion: 'Monitor your event source with metrics.', desactivado: true }),
      ui.campo({
        etiqueta: 'Batch size',
        descripcion: 'The maximum number of records in each batch to send to the function.',
        control: ui.entrada({ tipo: 'number', valor: f.lote, etiquetaAccesible: 'Batch size', alCambiar: (v) => (f.lote = v) }),
        restriccion: 'The maximum is 10,000 for standard queues and 10 for FIFO queues.',
        error: err.lote
      }),
      ui.campo({
        etiqueta: 'Batch window',
        opcional: true,
        descripcion: 'The maximum amount of time to gather records before invoking the function, in seconds.',
        control: ui.entrada({ tipo: 'number', valor: f.ventana, etiquetaAccesible: 'Batch window', alCambiar: (v) => (f.ventana = v) }),
        restriccion: 'Required if batch size is greater than 10. The maximum is 300 seconds.'
      })
    ];
  }

  function formaEventBridge(err) {
    const reglas = e.eventbridge?.reglas ?? [];
    return [
      ui.campo({
        etiqueta: 'Rule',
        descripcion: 'Pick an existing rule, or create a new one.',
        control: ui.radios({
          valor: f.reglaModo,
          opciones: [
            { valor: 'nueva', etiqueta: 'Create a new rule' },
            { valor: 'existente', etiqueta: 'Existing rules', desactivado: !reglas.length }
          ],
          alCambiar: (v) => {
            f.reglaModo = v;
            forma.repintar();
          }
        })
      }),
      f.reglaModo === 'existente'
        ? ui.campo({
            etiqueta: 'Existing rules',
            control: ui.selector({ placeholder: 'Select a rule', filtrar: true, valor: f.reglaExistente, opciones: reglas.map((r) => ({ valor: r.nombre, etiqueta: r.nombre, descripcion: r.expresion ?? 'Event pattern' })), alCambiar: (v) => (f.reglaExistente = v) }),
            error: err.regla
          })
        : [
            ui.campo({
              etiqueta: 'Rule name',
              descripcion: 'Enter a name to uniquely identify your rule.',
              control: ui.entrada({ valor: f.reglaNombre, etiquetaAccesible: 'Rule name', alCambiar: (v) => (f.reglaNombre = v) }),
              restriccion: 'Maximum of 64 characters consisting of numbers, lower/upper case letters, .,-,_.',
              error: err.reglaNombre
            }),
            ui.campo({ etiqueta: 'Rule description', opcional: true, control: ui.entrada({ valor: f.reglaDescripcion, etiquetaAccesible: 'Rule description', alCambiar: (v) => (f.reglaDescripcion = v) }) }),
            ui.campo({
              etiqueta: 'Rule type',
              descripcion: 'Trigger your target based on an event pattern, or based on an automated schedule.',
              control: ui.radios({
                valor: f.reglaTipo,
                opciones: [
                  { valor: 'patron', etiqueta: 'Event pattern' },
                  { valor: 'programada', etiqueta: 'Schedule expression' }
                ],
                alCambiar: (v) => {
                  f.reglaTipo = v;
                  forma.repintar();
                }
              })
            }),
            f.reglaTipo === 'programada'
              ? ui.campo({
                  etiqueta: 'Schedule expression',
                  info: 'eb-programa',
                  cx,
                  descripcion: 'Self-trigger your target on an automated schedule using Cron or rate expressions. Cron expressions are in UTC.',
                  control: ui.entrada({ valor: f.expresion, placeholder: 'rate(1 day)', etiquetaAccesible: 'Schedule expression', alCambiar: (v) => (f.expresion = v) }),
                  restriccion: 'e.g. rate(1 day), cron(0 17 ? * MON-FRI *). Simulador: rate(5 minutes) dispara cada 50 s.',
                  error: err.expresion
                })
              : ui.campo({ etiqueta: 'Event pattern', info: 'eb-patron', cx, control: ui.area({ valor: f.patron, filas: 8, monoespaciado: true, etiquetaAccesible: 'Event pattern', alCambiar: (v) => (f.patron = v) }) })
          ]
    ];
  }

  function formaS3(err) {
    return [
      ui.campo({
        etiqueta: 'Bucket',
        descripcion: 'Choose or enter the ARN of an S3 bucket that serves as the event source. The bucket must be in the same region as the function.',
        control: ui.selector({ placeholder: 'Choose or enter ARN', filtrar: true, valor: f.bucket, opciones: (e.buckets ?? []).map((b) => ({ valor: b.nombre, etiqueta: `s3/${b.nombre}` })), vacio: 'No buckets. Create one in Amazon S3 first.', alCambiar: (v) => (f.bucket = v) }),
        error: err.bucket
      }),
      ui.campo({
        etiqueta: 'Event types',
        control: ui.selector({ multiple: true, valores: f.eventosS3, opciones: EVENTOS_S3, alCambiar: (v) => (f.eventosS3 = v) })
      }),
      ui.campo({ etiqueta: 'Prefix', opcional: true, descripcion: 'Enter a single optional prefix to limit the notifications to objects with keys that start with matching characters.', control: ui.entrada({ valor: f.prefijo, placeholder: 'e.g. images/', etiquetaAccesible: 'Prefix', alCambiar: (v) => (f.prefijo = v) }) }),
      ui.campo({ etiqueta: 'Suffix', opcional: true, descripcion: 'Enter a single optional suffix to limit the notifications to objects with keys that end with matching characters.', control: ui.entrada({ valor: f.sufijo, placeholder: 'e.g. .jpg', etiquetaAccesible: 'Suffix', alCambiar: (v) => (f.sufijo = v) }) }),
      ui.campo({
        etiqueta: 'Recursive invocation',
        control: ui.casilla({
          etiqueta: 'I acknowledge that using the same S3 bucket for both input and output is not recommended and that this configuration can cause recursive invocations, increased Lambda usage, and increased costs.',
          marcada: f.acepto,
          alCambiar: (v) => (f.acepto = v)
        }),
        error: err.acepto
      })
    ];
  }

  const forma = ui.region(() => {
    const err = errores();
    let especifico = null;
    if (f.fuente === 'sns') especifico = formaSns(err);
    else if (f.fuente === 'sqs') especifico = formaSqs(err);
    else if (f.fuente === 'eventbridge') especifico = formaEventBridge(err);
    else if (f.fuente === 's3') especifico = formaS3(err);
    return ui.contenedor({
      titulo: 'Trigger configuration',
      info: 'lambda-disparador',
      cx,
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({
          etiqueta: 'Select a source',
          control: ui.selector({
            placeholder: 'Select a source',
            filtrar: true,
            valor: f.fuente,
            opciones: FUENTES.map((x) => ({ ...x, etiquetaDerecha: x.desactivado ? 'No disponible en el simulador' : undefined })),
            alCambiar: (v) => {
              f.fuente = v;
              f.intento = false;
              forma.repintar();
            }
          }),
          error: err.fuente
        }),
        especifico,
        f.fuente && f.fuente !== 'sqs'
          ? h('p', { class: 'cx-texto-sec' }, `Lambda will add the necessary permissions for ${FUENTES.find((x) => x.valor === f.fuente).etiqueta} to invoke your Lambda function from this trigger.`)
          : null,
        f.fuente === 'sqs' ? h('p', { class: 'cx-texto-sec' }, 'Lambda reads messages from the queue in batches using the function’s execution role, and deletes them when the function succeeds.') : null
      )
    });
  });

  function agregar() {
    f.intento = true;
    forma.repintar();
    if (Object.keys(errores()).length) return;
    let p;
    let nombreFuente;
    if (f.fuente === 'sns') {
      p = { tipo: 'sns', temaArn: f.tema };
      nombreFuente = f.tema.split(':').pop();
    } else if (f.fuente === 'sqs') {
      p = { tipo: 'sqs', colaArn: f.cola, tamanoLote: Number(f.lote), ventana: f.ventana.trim() ? Number(f.ventana) : 0, activo: f.activo };
      nombreFuente = f.cola.split(':').pop();
    } else if (f.fuente === 'eventbridge') {
      if (f.reglaModo === 'existente') {
        p = { tipo: 'eventbridge', reglaNombre: f.reglaExistente };
        nombreFuente = f.reglaExistente;
      } else {
        p = { tipo: 'eventbridge', nuevaRegla: { nombre: f.reglaNombre.trim(), descripcion: f.reglaDescripcion, tipo: f.reglaTipo, expresion: f.expresion.trim(), patron: f.patron } };
        nombreFuente = f.reglaNombre.trim();
      }
    } else {
      p = { tipo: 's3', bucket: f.bucket, eventos: f.eventosS3, prefijo: f.prefijo.trim(), sufijo: f.sufijo.trim() };
      nombreFuente = f.bucket;
    }
    const r = cx.hacer({ servicio: 'Lambda', accion: 'AddTrigger', error: 'An error occurred when creating the trigger' }, (es) => agregarDisparador(es, nombre, p), { atomico: true });
    if (r.ok) {
      cx.flash({ tipo: 'exito', texto: `The trigger ${nombreFuente} was successfully added to function ${nombre}. The function is now receiving events from the trigger.` });
      const mem = memoriaFn(cx, nombre);
      mem.pestana = 'config';
      cx.memoria.lambdaConfig = 'disparadores';
      cx.ir(rutaFn(fn));
    }
  }

  return h(
    'div',
    { class: 'cx-pagina cx-pagina--form' },
    ui.encabezado({ titulo: 'Add trigger', info: 'lambda-disparador', cx }),
    forma,
    ui.pieFormulario({ cancelar: () => cx.ir(rutaFn(fn)), enviar: agregar, textoEnviar: 'Add' })
  );
}

/* ================================================================ ayudas */

const ayudas = {
  'lambda-funcion': {
    titulo: 'Función de Lambda',
    texto: [
      'Una **función Lambda** es un pedazo de código que AWS corre **solo cuando llega un evento**: un mensaje en una cola, un archivo nuevo en S3, una alarma o un horario.',
      'No hay servidores que prender, parchar ni apagar (*serverless*). AWS escala solo: si llegan mil eventos, corre mil copias.',
      'Pagas por **invocación** y por **milisegundo** de ejecución. Una función puede durar como máximo **15 minutos** (900 segundos).',
      'Simulador: tu código **nunca se ejecuta**; se lee como texto. Un `return` sencillo, `return event` y los `console.log` / `print` sí se reflejan en el resultado.'
    ]
  },
  'lambda-runtime': {
    titulo: 'Runtime',
    texto: [
      'El **runtime** es el lenguaje y su versión: Node.js (JavaScript) o Python, por ejemplo.',
      'Con Node.js el archivo es `index.mjs` y el handler es `index.handler`. Con Python el archivo es `lambda_function.py` y el handler `lambda_function.lambda_handler`.',
      'AWS retira los runtimes viejos con el tiempo: conviene usar uno de los «Latest supported».'
    ]
  },
  'lambda-arquitectura': {
    titulo: 'Arquitectura',
    texto: ['**x86_64** es el procesador de siempre (Intel/AMD). **arm64** usa procesadores AWS Graviton: suele salir más barato por milisegundo.', 'Para el código de este curso da lo mismo cuál elijas.']
  },
  'lambda-rol': {
    titulo: 'Rol de ejecución',
    texto: [
      'El **rol de ejecución** es un rol de IAM que la función «se pone» al correr: define a qué servicios puede llamar.',
      'Si eliges «Create a new role with basic Lambda permissions», Lambda crea `<función>-role-xxxxxxxx` con la política **AWSLambdaBasicExecutionRole**, que solo deja escribir logs en CloudWatch Logs.',
      'Si tu función necesita leer DynamoDB o S3, agrégale esa política al rol en IAM (mínimo privilegio).'
    ]
  },
  'lambda-codigo': {
    titulo: 'Code source',
    texto: [
      'Aquí editas el código. Los cambios **no cuentan** hasta que pulsas **Deploy**: si pruebas antes, Test corre la versión desplegada.',
      'El **handler** es la función que AWS llama con dos datos: `event` (lo que pasó: el mensaje, el archivo…) y `context` (datos de la invocación).',
      'Lo que regresa el handler es la **respuesta**. Lo que imprimes con `console.log` o `print` va al **log** de CloudWatch.'
    ]
  },
  'lambda-handler': {
    titulo: 'Handler',
    texto: ['El **handler** dice qué función de qué archivo llama Lambda: `index.handler` = la función `handler` exportada de `index.mjs`.', 'Si cambias el nombre de la función en tu código y no el handler, Lambda responde `Runtime.HandlerNotFound`.']
  },
  'lambda-test': {
    titulo: 'Probar con un evento',
    texto: [
      'Un **evento de prueba** es un JSON que imita lo que mandaría SNS, SQS, S3 o EventBridge. Usa **Template** para partir de uno real.',
      'Puedes guardar hasta **10** eventos por función.',
      'El resultado muestra la **respuesta**, el **resumen** (duración, memoria usada, duración facturada) y el **log** con las líneas **START**, **END** y **REPORT**.',
      'La primera invocación tras un rato sin uso trae **Init Duration**: es el *arranque en frío* (cold start).'
    ]
  },
  'lambda-logs': {
    titulo: 'Logs y métricas',
    texto: [
      'Cada vez que la función corre, Lambda escribe su log en CloudWatch Logs, en el grupo `/aws/lambda/<función>`.',
      'Las métricas **Invocations**, **Duration**, **Errors** y **Throttles** están en CloudWatch → All metrics → AWS/Lambda. Con ellas puedes crear alarmas.'
    ]
  },
  'lambda-config': {
    titulo: 'General configuration',
    texto: [
      '**Memory**: de 128 MB a 10 240 MB. Más memoria también da más CPU (y cuesta más por milisegundo).',
      '**Timeout**: cuánto puede durar una invocación antes de que Lambda la corte. Por omisión 3 segundos; el máximo es **15 minutos (900 s)**.',
      '**Ephemeral storage**: el espacio en `/tmp`, de 512 MB a 10 GB.'
    ]
  },
  'lambda-memoria': { titulo: 'Memoria', texto: ['De **128 MB a 10 240 MB**. La CPU crece junto con la memoria.', 'El costo de Lambda es *memoria × tiempo* (GB-segundo).'] },
  'lambda-timeout': {
    titulo: 'Timeout',
    texto: ['Tiempo máximo de una invocación: por omisión **3 s**, máximo **900 s (15 min)**. Si pones más, AWS responde «Member must have value less than or equal to 900».', 'Si la función la dispara una cola de SQS, la **visibilidad** de la cola debe ser al menos igual al timeout.']
  },
  'lambda-variables': {
    titulo: 'Variables de entorno',
    texto: ['Pares **llave = valor** que tu código lee sin cambiarlo: `process.env.MESA` en Node.js u `os.environ[\'MESA\']` en Python.', 'Sirven para configuración (nombre de una tabla, un modo de prueba). Para contraseñas usa **Secrets Manager**.']
  },
  'lambda-disparador': {
    titulo: 'Disparadores (triggers)',
    texto: [
      'Un **disparador** es lo que hace que la función corra:',
      ['**SNS**: cada mensaje publicado en el tema la invoca (suscripción con protocolo lambda).', '**SQS**: Lambda revisa la cola, lee lotes de mensajes y los borra si la función termina bien.', '**EventBridge**: una regla con horario (`rate(5 minutes)`) o con patrón de eventos.', '**S3**: cuando se sube o borra un objeto del bucket.'],
      'En el simulador los horarios van acelerados: `rate(1 minute)` dispara cada **10 s**.'
    ]
  },
  'lambda-politica': {
    titulo: 'Política basada en recursos',
    texto: ['Dice **quién puede invocar** la función: por ejemplo, `sns.amazonaws.com` desde tu tema o `events.amazonaws.com` desde tu regla.', 'La consola la agrega sola cuando creas el disparador. SQS no la necesita porque Lambda lee la cola con el rol de ejecución.']
  },
  'lambda-url': { titulo: 'Function URL', texto: ['Una dirección HTTPS propia de la función. No está disponible en el simulador; en el curso se invoca con Test y con disparadores.'] }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'lambda',
  nombre: 'Lambda',
  titulo: 'Lambda',
  descripcion: 'Run code without thinking about servers',
  categoria: 'computo',
  claves: 'lambda serverless funciones function codigo sin servidor trigger disparador',
  inicio: 'lambda/funciones',
  menu: [
    { texto: 'Dashboard', ruta: 'lambda/dashboard' },
    { texto: 'Applications', ruta: 'lambda/aplicaciones' },
    { texto: 'Functions', ruta: 'lambda/funciones' },
    { seccion: 'Additional resources', items: [des('Code signing configurations'), des('Event source mappings'), des('Layers'), des('Replicas')] },
    { seccion: 'Related AWS resources', items: [des('Step Functions state machines')] }
  ],
  rutas: {
    '': portada,
    dashboard: panel,
    aplicaciones: (cx) => (cx.migas([migaLambda, { texto: 'Applications' }]), ui.noDisponible('Applications', 'Las aplicaciones de Lambda (AWS SAM / CloudFormation) no están en el simulador. Trabaja con Functions.')),
    funciones: listaFunciones,
    'funciones/crear': crearFuncionPagina,
    'funciones/:nombre': detalleFuncion,
    'funciones/:nombre/disparador': agregarDisparadorPagina,
    'funciones/:nombre/configuracion/general': editarGeneral,
    'funciones/:nombre/configuracion/variables': editarVariables
  },
  busqueda: [
    { texto: 'Functions', ruta: 'lambda/funciones', claves: 'funciones' },
    { texto: 'Create function', ruta: 'lambda/funciones/crear', claves: 'crear funcion' },
    { texto: 'Dashboard', ruta: 'lambda/dashboard' }
  ],
  ayudas
};

