// Pruebas del modelo de SNS, SQS, el buzón simulado, Lambda y EventBridge.
import * as m from '../../public/consola/modelo.js';

export const titulo = 'SNS, SQS, Lambda y EventBridge';

export async function probar() {
  const fallas = [];
  const relojAntes = m.reloj.ahora;
  let t = Date.parse('2026-11-05T16:00:00Z');
  m.reloj.ahora = () => t;
  const pasa = (seg) => {
    t += seg * 1000;
    m.avanzar(e, t);
  };
  const ok = (cond, texto) => {
    if (!cond) fallas.push(texto);
  };
  const falla = (fn, codigo, texto) => {
    try {
      fn();
      fallas.push(`${texto}: no lanzó error`);
    } catch (err) {
      if (err.codigo !== codigo) fallas.push(`${texto}: lanzó ${err.codigo} (${err.message}) en vez de ${codigo}`);
    }
  };

  let e;
  try {
    e = m.cuentaNueva({ cuentaId: '111122223333' });
    ok(Array.isArray(e.sns?.temas) && Array.isArray(e.sns?.buzon) && Array.isArray(e.sqs?.colas), 'la cuenta nueva no trae sns/sqs');
    ok(Array.isArray(e.lambda?.funciones) && Array.isArray(e.eventbridge?.reglas), 'la cuenta nueva no trae lambda/eventbridge');

    /* ------------------------------------------------ SNS: temas y correo */
    const tema = m.crearTema(e, { nombre: 'alertas-abc', nombreMostrar: 'Alertas' });
    ok(tema.arn === 'arn:aws:sns:us-east-1:111122223333:alertas-abc', `ARN del tema: ${tema.arn}`);
    ok(m.crearTema(e, { nombre: 'alertas-abc' }) === tema, 'crear dos veces el mismo tema debe devolver el mismo');
    falla(() => m.crearTema(e, { nombre: 'alertas-abc', tipo: 'FIFO' }), 'InvalidParameter', 'FIFO sin .fifo');
    falla(() => m.crearTema(e, { nombre: 'con espacio' }), 'InvalidParameter', 'nombre de tema inválido');
    const fifo = m.crearTema(e, { nombre: 'pedidos.fifo', tipo: 'FIFO' });
    falla(() => m.crearSuscripcion(e, { temaArn: fifo.arn, protocolo: 'email', endpoint: 'a@b.mx' }), 'InvalidParameter', 'email a un tema FIFO');
    falla(() => m.crearSuscripcion(e, { temaArn: tema.arn, protocolo: 'email', endpoint: 'no-es-correo' }), 'InvalidParameter', 'email inválido');

    const sub = m.crearSuscripcion(e, { temaArn: tema.arn, protocolo: 'email', endpoint: 'ana@alumno.mx' });
    ok(sub.estado === 'PendingConfirmation', 'el email debe quedar en PendingConfirmation');
    const correo = e.sns.buzon[0];
    ok(correo?.asunto === 'AWS Notification - Subscription Confirmation', 'no llegó el correo de confirmación');
    ok(correo?.enlaces?.[0]?.accion === 'confirmar', 'el correo no trae el enlace Confirm subscription');
    falla(() => m.eliminarSuscripcion(e, sub.arn), 'InvalidParameter', 'borrar una suscripción pendiente');
    m.publicarMensaje(e, tema.arn, { asunto: 'Hola', mensaje: 'antes de confirmar' });
    ok(e.sns.buzon.length === 1, 'una suscripción pendiente no debe recibir mensajes');
    m.confirmarSuscripcion(e, correo.enlaces[0].url);
    ok(sub.estado === 'Confirmed', 'el enlace del correo no confirmó la suscripción');

    const r = m.publicarMensaje(e, tema.arn, { asunto: 'CPU alta', mensaje: 'La CPU pasó de 70 %' });
    ok(r.entregas === 1 && sub.entregados === 1, 'la publicación no llegó al email');
    ok(e.sns.buzon[0].asunto === 'CPU alta' && e.sns.buzon[0].de.startsWith('Alertas'), 'el correo de la notificación no tiene asunto o remitente');
    falla(() => m.publicarMensaje(e, tema.arn, { mensaje: '' }), 'InvalidParameter', 'mensaje vacío');
    falla(() => m.publicarMensaje(e, fifo.arn, { mensaje: 'x' }), 'InvalidParameter', 'FIFO sin MessageGroupId');
    ok(m.publicarEnTema(e, 'arn:aws:sns:us-east-1:111122223333:no-existe', { mensaje: 'x' }) === null, 'publicarEnTema a un tema inexistente debe devolver null');
    ok(m.llamar('publicarEnTema', e, tema.arn, { asunto: 'ALARM: "cpu"', mensaje: 'alarma', origen: 'cloudwatch' })?.entregas === 1, 'llamar(publicarEnTema) no entregó');
    for (let k = 0; k < 70; k++) m.correoAlBuzon(e, { para: 'ana@alumno.mx', asunto: `n${k}`, cuerpo: 'x' });
    ok(e.sns.buzon.length <= 60, 'el buzón no se recorta');
    m.marcarBuzonLeido(e);
    ok(m.correosSinLeer(e) === 0, 'marcarBuzonLeido');

    /* ---------------------------------------------------------- SQS */
    falla(() => m.crearCola(e, { nombre: 'mala.fifo' }), 'InvalidParameterValue', 'cola estándar con .fifo');
    falla(() => m.crearCola(e, { nombre: 'x', visibilidad: 50000 }), 'InvalidAttributeValue', 'visibilidad fuera de rango');
    const cola = m.crearCola(e, { nombre: 'pedidos-abc', visibilidad: 30 });
    ok(cola.url === 'https://sqs.us-east-1.amazonaws.com/111122223333/pedidos-abc', `URL de la cola: ${cola.url}`);
    falla(() => m.crearCola(e, { nombre: 'pedidos-abc' }), 'QueueAlreadyExists', 'cola repetida');

    // Suscrita desde SNS sin permiso: no llega (como en AWS).
    const subSqs = m.crearSuscripcion(e, { temaArn: tema.arn, protocolo: 'sqs', endpoint: cola.arn });
    m.publicarMensaje(e, tema.arn, { mensaje: 'sin permiso' });
    ok(cola.mensajes.length === 0 && subSqs.fallidos === 1, 'SNS no debe entregar a una cola sin política para sns.amazonaws.com');
    // «Subscribe to Amazon SNS topic» desde la cola agrega el permiso.
    m.suscribirColaATema(e, cola.arn, tema.arn);
    ok(m.colaPermiteServicio(e, cola, { servicio: 'sns.amazonaws.com', fuenteArn: tema.arn }), 'la política no permite a SNS tras suscribir');
    m.publicarMensaje(e, tema.arn, { asunto: 'Pedido', mensaje: 'tacos al pastor' });
    ok(cola.mensajes.length === 1 && JSON.parse(cola.mensajes[0].cuerpo).Message === 'tacos al pastor', 'la cola no recibió la envoltura de SNS');

    m.enviarMensaje(e, cola.url, { cuerpo: 'directo' });
    ok(m.mensajesDisponibles(cola, t) === 2, 'debe haber 2 mensajes disponibles');
    const recibidos = m.recibirMensajes(e, cola.url, { maximo: 10 });
    ok(recibidos.length === 2 && m.mensajesEnVuelo(cola, t) === 2, 'los recibidos deben quedar in flight');
    ok(m.recibirMensajes(e, cola.url).length === 0, 'un mensaje in flight no se vuelve a entregar');
    pasa(31);
    ok(m.mensajesDisponibles(cola, t) === 2, 'al vencer la visibilidad los mensajes regresan');
    const otra = m.recibirMensajes(e, cola.url, { maximo: 1 });
    ok(otra[0].recibos === 2, 'el contador de recepciones no sube');
    ok(m.borrarMensajes(e, cola.url, [otra[0].recibo]) === 1, 'no se borró el mensaje por su recibo');
    m.purgarCola(e, cola.url, t);
    ok(cola.mensajes.length === 0, 'purgar');
    falla(() => m.purgarCola(e, cola.url, t + 1000), 'PurgeQueueInProgress', 'purgar dos veces en 60 s');
    falla(() => m.enviarMensaje(e, cola.url, { cuerpo: 'x', retraso: 901 }), 'InvalidParameterValue', 'retraso > 900');
    m.enviarMensaje(e, cola.url, { cuerpo: 'tarde', retraso: 5 });
    ok(m.mensajesRetrasados(cola, t) === 1 && m.mensajesDisponibles(cola, t) === 0, 'el retraso no se respeta');
    pasa(6);
    ok(m.mensajesDisponibles(cola, t) === 1, 'el mensaje retrasado no aparece');

    // DLQ: tras maxReceiveCount recepciones se va a la cola muerta.
    const muerta = m.crearCola(e, { nombre: 'pedidos-dlq' });
    const conDlq = m.crearCola(e, { nombre: 'con-dlq', visibilidad: 1, dlq: { arn: muerta.arn, maxRecepciones: 2 } });
    m.enviarMensaje(e, conDlq.arn, { cuerpo: 'veneno' });
    m.recibirMensajes(e, conDlq.arn);
    pasa(2);
    m.recibirMensajes(e, conDlq.arn);
    pasa(2);
    ok(m.recibirMensajes(e, conDlq.arn).length === 0 && muerta.mensajes.length === 1, 'el mensaje no pasó a la DLQ');
    falla(() => m.crearCola(e, { nombre: 'x.fifo', tipo: 'FIFO', dlq: { arn: muerta.arn, maxRecepciones: 3 } }), 'InvalidParameterValue', 'DLQ de otro tipo');

    // FIFO: grupo obligatorio, deduplicación y orden por grupo.
    const cf = m.crearCola(e, { nombre: 'boletos.fifo', tipo: 'FIFO' });
    falla(() => m.enviarMensaje(e, cf.url, { cuerpo: 'a', dedup: '1' }), 'MissingParameter', 'FIFO sin grupo');
    m.enviarMensaje(e, cf.url, { cuerpo: 'a', grupo: 'g1', dedup: '1' });
    m.enviarMensaje(e, cf.url, { cuerpo: 'a otra vez', grupo: 'g1', dedup: '1' });
    m.enviarMensaje(e, cf.url, { cuerpo: 'b', grupo: 'g1', dedup: '2' });
    ok(cf.mensajes.length === 2, 'la deduplicación FIFO no funciona');
    ok(m.recibirMensajes(e, cf.url).length === 1, 'FIFO: un grupo con un mensaje in flight no entrega el siguiente');
    // Retención: a los 60 s desaparecen.
    const corta = m.crearCola(e, { nombre: 'corta', retencion: 60 });
    m.enviarMensaje(e, corta.url, { cuerpo: 'x' });
    pasa(61);
    ok(corta.mensajes.length === 0, 'la retención no borra los mensajes viejos');

    /* --------------------------------------------------------- Lambda */
    falla(() => m.crearFuncion(e, { nombre: 'con espacio' }), 'InvalidParameterValueException', 'nombre de función inválido');
    const fn = m.crearFuncion(e, { nombre: 'procesa-pedidos', runtime: 'nodejs22.x' });
    ok(fn.arn === 'arn:aws:lambda:us-east-1:111122223333:function:procesa-pedidos', `ARN de la función: ${fn.arn}`);
    const rol = e.iam.roles.find((x) => x.nombre === fn.rol);
    ok(rol?.servicio === 'lambda.amazonaws.com' && /^procesa-pedidos-role-[a-z0-9]{8}$/.test(rol.nombre), 'el rol de ejecución no se creó bien');
    if (m.politicaIam('AWSLambdaBasicExecutionRole')) ok(rol.politicas.includes('AWSLambdaBasicExecutionRole'), 'el rol no lleva AWSLambdaBasicExecutionRole');
    falla(() => m.crearFuncion(e, { nombre: 'procesa-pedidos' }), 'ResourceConflictException', 'función repetida');

    let res = m.probarFuncion(e, fn.nombre, '{"key1":"value1"}');
    ok(res.ok && res.respuesta?.statusCode === 200 && res.respuesta.body === '"Hello from Lambda!"', `el código inicial de Node no responde Hello from Lambda: ${JSON.stringify(res.respuesta)}`);
    ok(/^START RequestId: .* Version: \$LATEST/.test(res.log) && res.log.includes('END RequestId') && res.log.includes('REPORT RequestId') && res.log.includes('Init Duration'), 'el log no trae START/END/REPORT');

    m.desplegarCodigo(e, fn.nombre, [
      "const SALUDO = 'Hola';",
      'export const handler = async (event, context) => {',
      '  const { nombre } = event;',
      "  console.log('Pedido de', nombre, `para ${event.mesa}`);",
      '  console.log(context.logGroupName);',
      '  return { statusCode: 201, body: JSON.stringify({ mensaje: `${SALUDO}, ${nombre}`, total: event.precio * 2 }) };',
      '};'
    ].join('\n'));
    res = m.probarFuncion(e, fn.nombre, '{"nombre":"Ana","mesa":4,"precio":35}');
    ok(res.respuesta?.statusCode === 201 && res.respuesta.body === '{"mensaje":"Hola, Ana","total":70}', `respuesta interpretada: ${JSON.stringify(res.respuesta)}`);
    ok(res.log.includes('INFO\tPedido de Ana para 4') && res.log.includes('/aws/lambda/procesa-pedidos'), 'console.log no salió en el log');
    ok(!res.log.includes('Init Duration'), 'la segunda invocación no debe llevar Init Duration');

    m.desplegarCodigo(e, fn.nombre, 'export const handler = async (event) => {\n  return event;\n};');
    res = m.probarFuncion(e, fn.nombre, '{"a":[1,2]}');
    ok(JSON.stringify(res.respuesta) === '{"a":[1,2]}', 'return event no devuelve el evento');

    m.desplegarCodigo(e, fn.nombre, "export const handler = async (event) => {\n  if (event.x) { return 1; }\n  console.log('nunca');\n  return 2;\n};");
    res = m.probarFuncion(e, fn.nombre, '{}');
    ok(res.respuesta === null && res.interpretado === false, 'con un if la respuesta debe ser null y marcarse como no interpretada');

    m.desplegarCodigo(e, fn.nombre, "export const handler = async (event) => {\n  throw new Error('Sin existencias');\n};");
    res = m.probarFuncion(e, fn.nombre, '{}');
    ok(!res.ok && res.respuesta?.errorType === 'Error' && res.respuesta.errorMessage === 'Sin existencias', 'throw no produce el error de Lambda');

    m.desplegarCodigo(e, fn.nombre, 'export const handler = async (event) => {\n  return { a: 1 ;\n};');
    res = m.probarFuncion(e, fn.nombre, '{}');
    ok(res.error?.tipo === 'Runtime.UserCodeSyntaxError', 'un error de sintaxis no se reporta');

    m.desplegarCodigo(e, fn.nombre, 'const handler = async () => 1;');
    res = m.probarFuncion(e, fn.nombre, '{}');
    ok(res.error?.tipo === 'Runtime.HandlerNotFound', 'un handler no exportado debe dar Runtime.HandlerNotFound');

    // Lo que NUNCA debe pasar: que el código del alumno se ejecute.
    globalThis.__sePrendio = false;
    m.desplegarCodigo(e, fn.nombre, 'export const handler = async (event) => {\n  const x = globalThis.__sePrendio = true;\n  return event.constructor.constructor("return 1")();\n};');
    res = m.probarFuncion(e, fn.nombre, '{}');
    ok(globalThis.__sePrendio === false, '¡el código del alumno se ejecutó!');
    ok(res.respuesta === null || res.respuesta?.errorType === 'TypeError', 'el acceso a constructor no debe dar nada');
    delete globalThis.__sePrendio;

    const py = m.crearFuncion(e, { nombre: 'saluda-py', runtime: 'python3.13', rol: { modo: 'existente', nombre: fn.rol } });
    res = m.probarFuncion(e, py.nombre, '{}');
    ok(res.respuesta?.statusCode === 200 && res.respuesta.body === '"Hello from Lambda!"', `el código inicial de Python no responde: ${JSON.stringify(res.respuesta)}`);
    m.desplegarCodigo(e, py.nombre, [
      'import json',
      '',
      'def lambda_handler(event, context):',
      "    nombre = event['nombre']",
      '    print(f"Hola {nombre}")',
      "    return {'statusCode': 200, 'body': json.dumps({'saludo': 'qué tal ' + nombre, 'ok': True})}"
    ].join('\n'));
    res = m.probarFuncion(e, py.nombre, '{"nombre":"Luis"}');
    ok(res.respuesta?.body === '{"saludo": "qu\\u00e9 tal Luis", "ok": true}', `Python con json.dumps: ${JSON.stringify(res.respuesta)}`);
    ok(res.log.split('\n')[1] === 'Hola Luis', 'print de Python no salió en el log');
    res = m.probarFuncion(e, py.nombre, '{}');
    ok(res.respuesta?.errorType === 'KeyError', "event['nombre'] sin la llave debe dar KeyError");

    falla(() => m.editarConfiguracionLambda(e, fn.nombre, { timeout: 901 }), 'ValidationException', 'timeout > 900');
    falla(() => m.editarConfiguracionLambda(e, fn.nombre, { memoria: 64 }), 'ValidationException', 'memoria < 128');
    falla(() => m.editarVariablesLambda(e, fn.nombre, [{ llave: 'AWS_REGION', valor: 'x' }]), 'InvalidParameterValueException', 'variable reservada');
    m.editarVariablesLambda(e, py.nombre, [{ llave: 'MESA', valor: '7' }]);
    m.desplegarCodigo(e, py.nombre, "import os\ndef lambda_handler(event, context):\n    return os.environ['MESA']\n");
    ok(m.probarFuncion(e, py.nombre, '{}').respuesta === '7', 'os.environ no lee las variables de entorno');
    m.guardarEventoPrueba(e, fn.nombre, { nombreEvento: 'miEvento', json: '{"a":1}' });
    falla(() => m.guardarEventoPrueba(e, fn.nombre, { nombreEvento: 'malo', json: '{a:1}' }), 'InvalidParameterValueException', 'evento con JSON inválido');

    // SNS → Lambda
    m.desplegarCodigo(e, fn.nombre, "export const handler = async (event) => {\n  console.log(event.Records[0].Sns.Message);\n  return 'ok';\n};");
    m.agregarDisparador(e, fn.nombre, { tipo: 'sns', temaArn: tema.arn });
    const antes = fn.invocaciones;
    m.publicarMensaje(e, tema.arn, { mensaje: 'para la lambda' });
    ok(fn.invocaciones === antes + 1 && fn.ultimas.at(-1).log.includes('para la lambda'), 'SNS no invocó la Lambda');
    ok(m.disparadoresLambda(e, fn.nombre).some((d) => d.tipo === 'sns'), 'disparadoresLambda no lista el de SNS');

    // SQS → Lambda (visibilidad >= timeout)
    m.editarConfiguracionLambda(e, fn.nombre, { timeout: 60 });
    falla(() => m.agregarDisparador(e, fn.nombre, { tipo: 'sqs', colaArn: cola.arn }), 'InvalidParameterValueException', 'visibilidad menor que el timeout');
    m.editarConfiguracionLambda(e, fn.nombre, { timeout: 3 });
    if (m.politicaIam('AWSLambdaSQSQueueExecutionRole')) {
      falla(() => m.agregarDisparador(e, fn.nombre, { tipo: 'sqs', colaArn: cola.arn }), 'InvalidParameterValueException', 'rol sin permiso para SQS');
      m.adjuntarPoliticasRol(e, fn.rol, ['AWSLambdaSQSQueueExecutionRole']);
    }
    m.purgarCola(e, cola.url, t + 120_000);
    m.desplegarCodigo(e, fn.nombre, "export const handler = async (event) => {\n  console.log('lote de', event.Records.length);\n  return 'ok';\n};");
    m.agregarDisparador(e, fn.nombre, { tipo: 'sqs', colaArn: cola.arn, tamanoLote: 5 });
    m.enviarMensaje(e, cola.url, { cuerpo: 'uno' });
    m.enviarMensaje(e, cola.url, { cuerpo: 'dos' });
    const inv = fn.invocaciones;
    pasa(1);
    ok(fn.invocaciones === inv + 1 && cola.mensajes.length === 0, 'el disparador de SQS no consumió la cola');
    falla(() => m.agregarDisparador(e, fn.nombre, { tipo: 'sqs', colaArn: cola.arn }), 'ResourceConflictException', 'mapeo repetido');

    /* ----------------------------------------------------- EventBridge */
    falla(() => m.crearRegla(e, { nombre: 'r', expresion: 'rate(1 minutes)' }), 'ValidationException', 'rate(1 minutes) en plural');
    falla(() => m.crearRegla(e, { nombre: 'r', expresion: 'cron(0 12 * * * *)' }), 'ValidationException', 'cron sin ?');
    ok(m.periodoRegla('rate(5 minutes)') === 50_000 && m.periodoRegla('cron(0/2 * * * ? *)') === 20_000, 'periodoRegla');
    const regla = m.crearRegla(e, { nombre: 'cada-minuto', expresion: 'rate(1 minute)', destinos: [{ arn: fn.arn }, { arn: cola.arn }] });
    ok(m.colaPermiteServicio(e, cola, { servicio: 'events.amazonaws.com', fuenteArn: regla.arn }), 'la regla no dio permiso a la cola');
    m.editarMapeoLambda(e, fn.nombre, fn.mapeos[0].uuid, { activo: false });
    const inv2 = fn.invocaciones;
    pasa(9);
    ok(regla.disparos === 0, 'la regla disparó antes de tiempo');
    pasa(2);
    ok(regla.disparos === 1 && fn.invocaciones === inv2 + 1 && cola.mensajes.length === 1, 'la regla rate(1 minute) no disparó a los 10 s');
    ok(JSON.parse(cola.mensajes[0].cuerpo)['detail-type'] === 'Scheduled Event', 'el evento programado no tiene detail-type');
    m.cambiarEstadoRegla(e, regla.nombre, false);
    pasa(30);
    ok(regla.disparos === 1, 'una regla deshabilitada no debe disparar');

    const patron = m.crearRegla(e, { nombre: 'ec2-detenida', tipo: 'patron', patron: '{"source":["aws.ec2"],"detail-type":["EC2 Instance State-change Notification"],"detail":{"state":["stopped"]}}', destinos: [{ arn: tema.arn }] });
    falla(() => m.crearRegla(e, { nombre: 'mala', tipo: 'patron', patron: '{"source":"aws.ec2"}' }), 'InvalidEventPatternException', 'patrón sin arreglo');
    ok(m.probarPatronEventos(patron.patron, '{"source":"aws.ec2","detail-type":"EC2 Instance State-change Notification","detail":{"state":"stopped"}}') === true, 'probarPatronEventos');
    const [inst] = m.lanzarInstancias(e, { ami: 'al2023', tipo: 't2.micro', nombre: 'web', gruposSeguridad: [e.gruposSeguridad[0].id] });
    pasa(10);
    m.detenerInstancia(e, inst.id);
    pasa(10);
    ok(patron.disparos === 1 && e.sns.buzon[0].cuerpo.includes('"stopped"'), 'la regla con patrón no avisó la instancia detenida');

    // Disparador EventBridge creado desde Lambda («Create a new rule») y disparador S3.
    const antesEb = fn.invocaciones;
    m.agregarDisparador(e, fn.nombre, { tipo: 'eventbridge', nuevaRegla: { nombre: 'desde-lambda', tipo: 'programada', expresion: 'rate(2 minutes)' } });
    ok(m.reglaEventBridge(e, 'desde-lambda')?.destinos[0]?.arn === fn.arn, 'Add trigger de EventBridge no creó la regla con la función de destino');
    pasa(21);
    ok(fn.invocaciones > antesEb, 'la regla rate(2 minutes) creada desde Lambda no invocó a los 20 s');
    falla(() => m.agregarDisparador(e, fn.nombre, { tipo: 'eventbridge', nuevaRegla: { nombre: 'mala-expr', tipo: 'programada', expresion: 'rate(5 minute)' } }), 'ValidationException', 'rate(5 minute) en singular');
    m.crearBucket?.(e, { nombre: 'fotos-fin-111122223333' });
    if (e.buckets?.some((b) => b.nombre === 'fotos-fin-111122223333')) {
      m.agregarDisparador(e, fn.nombre, { tipo: 's3', bucket: 'fotos-fin-111122223333', sufijo: '.jpg' });
      falla(() => m.agregarDisparador(e, fn.nombre, { tipo: 's3', bucket: 'fotos-fin-111122223333', sufijo: '.jpg' }), 'InvalidArgument', 'disparador S3 que se encima');
      const antesS3 = fn.invocaciones;
      ok(m.notificarEventoS3(e, 'fotos-fin-111122223333', { llave: 'a.png' }) === 0, 'el sufijo .jpg no filtra');
      ok(m.notificarEventoS3(e, 'fotos-fin-111122223333', { llave: 'b.jpg', tamano: 10 }) === 1 && fn.invocaciones === antesS3 + 1, 'S3 no invocó la función');
      ok(m.disparadoresLambda(e, fn.nombre).some((d) => d.tipo === 's3'), 'disparadoresLambda no lista el de S3');
    }
    m.eliminarRegla(e, 'desde-lambda');

    // Quitar disparadores y borrar.
    m.quitarDisparador(e, fn.nombre, { tipo: 'eventbridge', id: regla.nombre });
    ok(!regla.destinos.some((d) => d.tipo === 'lambda'), 'quitar el disparador de EventBridge');
    m.eliminarRegla(e, regla.nombre);
    m.eliminarFuncion(e, py.nombre);
    ok(!m.funcionLambda(e, py.nombre) && e.iam.roles.some((x) => x.nombre === fn.rol), 'borrar la función (el rol se queda)');
    m.eliminarCola(e, corta.url);
    m.eliminarTema(e, fifo.arn);

    /* --------------------------------------------------------- métricas */
    const visibles = m.mensajesDisponibles(cola, t);
    m.enviarMensaje(e, cola.url, { cuerpo: 'métrica' });
    ok(m.metricaMensajeria(e, { namespace: 'AWS/SQS', metrica: 'ApproximateNumberOfMessagesVisible', dimensiones: { QueueName: cola.nombre } }, t) === visibles + 1, 'métrica de SQS');
    ok(m.metricaMensajeria(e, { namespace: 'AWS/SQS', metrica: 'NumberOfMessagesSent', dimensiones: { QueueName: cola.nombre } }, t) >= 1, 'NumberOfMessagesSent');
    ok(typeof m.metricaLambda(e, { metrica: 'Invocations', dimensiones: { FunctionName: fn.nombre }, periodo: 3_600_000 }, t) === 'number', 'métrica de Lambda');

    /* ---------------------------------------------- cuenta vieja y tamaño */
    const vieja = m.cuentaNueva();
    delete vieja.sns;
    delete vieja.sqs;
    delete vieja.lambda;
    delete vieja.eventbridge;
    m.avanzar(vieja, t);
    ok(vieja.sns && vieja.sqs && vieja.lambda && vieja.eventbridge, 'una cuenta vieja no recibe las colecciones al avanzar');
    delete vieja.sns;
    m.crearTema(vieja, { nombre: 'x' });
    delete vieja.lambda;
    m.crearFuncion(vieja, { nombre: 'f' });
    ok(vieja.sns.temas.length === 1 && vieja.lambda.funciones.length === 1, 'las acciones no inician sus colecciones');

    // Una hora de uso intenso no revienta el estado.
    for (let k = 0; k < 400; k++) {
      m.enviarMensaje(e, cola.url, { cuerpo: `pedido ${k} `.repeat(20) });
      m.publicarMensaje(e, tema.arn, { mensaje: `aviso ${k}` });
    }
    const kb = JSON.stringify(e).length / 1024;
    ok(kb < 512, `el estado pesa ${kb.toFixed(0)} KB tras mucho uso`);
    ok(JSON.stringify(JSON.parse(JSON.stringify(e))) === JSON.stringify(e), 'el estado no es JSON puro');
  } catch (err) {
    fallas.push(`la prueba tronó: ${err.stack ?? err}`);
  } finally {
    m.reloj.ahora = relojAntes;
  }
  return fallas;
}
