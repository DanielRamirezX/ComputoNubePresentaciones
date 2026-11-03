// ---------------------------------------------------------------------------
// EC2 · LAUNCH TEMPLATES Y AUTO SCALING GROUPS
//
// Las plantillas de lanzamiento (la «receta» de una instancia, con versiones)
// y los grupos de Auto Scaling que las usan para mantener vivas N instancias:
// reemplazan las que se mueren (autocuración), crecen y se encogen con sus
// políticas (target tracking, step, simple y acciones programadas) y se borran
// en dos fases (Deleting con deseado 0 y luego desaparecen).
//
// Las instancias del grupo son instancias normales de estado.instancias,
// lanzadas con lanzarInstancias() de modelo.js; llevan inst.autoscaling = <nombre
// del grupo> y la etiqueta Name que el grupo propaga.
//
// La forma de las colecciones:
//
// estado.autoscaling = {
//   plantillas: [{ id: 'lt-…', nombre, creado, creadoPor, guia, versionDefault, ultimaVersion,
//                  etiquetas: [{ llave, valor }],                 // Template tags (de la plantilla, no de las instancias)
//                  versiones: [{ numero, descripcion, creado, datos }] }],
//       // datos: { ami: 'al2023', tipo, llave | null, subredId | null, gruposSeguridad: [sgId],
//       //          volumenes: [{ tamano, tipo, eliminarAlTerminar }], userData, perfilIam | null,
//       //          etiquetas: [{ llave, valor }] }               // Resource tags: van a las instancias
//       // null = «Don't include in launch template».
//   grupos: [{ nombre, arn, creado, plantilla: { id, version: '$Default' | '$Latest' | '3' },
//              subredes: [subnetId], distribucion: 'balanced-best-effort' | 'balanced-only',
//              min, deseado, max, gruposDestino: [tgArn], tipoSalud: 'EC2' | 'ELB', saludEbs,
//              gracia: 300,                                       // segundos como en AWS (aquí valen 15 s, ver DURACION_AUTOSCALING)
//              estado: 'activo' | 'borrando', proteccionReduccion, monitoreo, mantenimiento,
//              etiquetas: [{ llave, valor, propagar }], notificaciones: [{ temaArn, eventos: ['launch'|'terminate'|'launch_error'|'terminate_error'] }],
//              instancias: [{ id, az, ciclo: 'Pending' | 'InService' | 'Standby' | 'Terminating', salud: 'Healthy' | 'Unhealthy',
//                             protegida, plantillaId, version, lanzada (ms) }],
//              politicas: [{ nombre, arn, tipo: 'TargetTrackingScaling' | 'StepScaling' | 'SimpleScaling', habilitada,
//                            // target tracking:
//                            metrica: 'ASGAverageCPUUtilization' | 'ASGAverageNetworkIn' | 'ASGAverageNetworkOut' | 'ALBRequestCountPerTarget',
//                            grupoDestino: tgArn | null, objetivo, calentamiento (s), sinReducir, alarmas: [nombre],
//                            // step y simple:
//                            alarma: nombre | null, ajuste: 'ChangeInCapacity' | 'ExactCapacity' | 'PercentChangeInCapacity',
//                            valor, pasos: [{ inferior, superior, valor }], enfriamiento (s), enfriaHasta (ms) }],
//              programadas: [{ nombre, arn, deseado | null, min | null, max | null, recurrencia: 'once' | '30m' | '1h' | '1d' | '1w' | cron,
//                              inicio (iso), fin (iso | null), proxima (ms | null) }],
//              actividad: [{ id, estado: 'InProgress' | 'Successful' | 'Failed', descripcion, causa, inicio, fin, instanciaId, tipo }],
//                          // lo más nuevo primero, máximo 60
//              horaPico: null | { cpu, desde, hasta },             // «Simular hora pico» (lo que se ve en la pantalla)
//              causa: null | texto,                               // la causa que llevarán las siguientes actividades
//              reemplazos, ajusteHasta, reintento }]              // contadores internos (ms)
// }
//
// El tiempo va acelerado (SIMULADOR.md §3): la gracia del health check (300 s en
// AWS) dura 15 s, un cooldown o warmup de 300 s dura 20 s y un periodo de
// métrica dura 10 s.
//
// Regla del ciclo de módulos: nada de lo importado de modelo.js se usa en el
// nivel superior de este archivo, solo dentro de funciones.
// ---------------------------------------------------------------------------

import { registrarExtension, llamar, existeFuncion } from './registro.js';
import {
  ami as amiDe,
  anotar,
  buscar,
  crearGrupoSeguridad,
  errorAws,
  hexAzar,
  instanciaDe,
  iso,
  lanzarInstancias,
  nombreLimpio,
  nuevoId,
  reloj,
  subredDe,
  terminarInstancia,
  tipoInstancia
} from '../modelo.js';

/** Los tiempos de Auto Scaling, en milisegundos reales del simulador. */
export const DURACION_AUTOSCALING = {
  periodo: 10000, // un periodo de métrica de CloudWatch (1 min en AWS)
  graciaPor300: 15000, // 300 s de gracia del health check = 15 s
  enfriamientoPor300: 20000, // 300 s de cooldown o de warmup = 20 s
  reintento: 10000, // tras un lanzamiento fallido, el grupo espera esto antes de reintentar
  puntosAlto: 3, // la alarma AlarmHigh de target tracking: 3 de 3 puntos arriba del objetivo
  puntosBajo: 15 // AlarmLow: 15 de 15 puntos debajo del 90 % del objetivo
};

/** Las métricas de las políticas de seguimiento (Metric type de la consola). */
export const METRICAS_SEGUIMIENTO = [
  { valor: 'ASGAverageCPUUtilization', etiqueta: 'Average CPU utilization', namespace: 'AWS/EC2', metrica: 'CPUUtilization', unidad: '%' },
  { valor: 'ASGAverageNetworkIn', etiqueta: 'Average network in (bytes)', namespace: 'AWS/EC2', metrica: 'NetworkIn', unidad: 'bytes' },
  { valor: 'ASGAverageNetworkOut', etiqueta: 'Average network out (bytes)', namespace: 'AWS/EC2', metrica: 'NetworkOut', unidad: 'bytes' },
  { valor: 'ALBRequestCountPerTarget', etiqueta: 'Application Load Balancer request count per target', namespace: 'AWS/ApplicationELB', metrica: 'RequestCountPerTarget', unidad: 'requests' }
];

export const metricaSeguimiento = (valor) => METRICAS_SEGUIMIENTO.find((m) => m.valor === valor) ?? null;

const MAX_ACTIVIDAD = 60;
const NOMBRE_PLANTILLA = /^[a-zA-Z0-9()./_-]{3,128}$/;

/* ================================================================ ayudas */

function iniciar(estado) {
  estado.autoscaling ??= { plantillas: [], grupos: [] };
  estado.autoscaling.plantillas ??= [];
  estado.autoscaling.grupos ??= [];
}

/** La hora como la escribe Auto Scaling en sus causas: 2026-10-15T02:07:05Z. */
const isoCorto = (ms) => iso(ms).replace(/\.\d{3}Z$/, 'Z');

const uuid = () => {
  const v = '89ab'[Math.floor(Number.parseInt(hexAzar(1), 16) / 4)];
  return `${hexAzar(8)}-${hexAzar(4)}-4${hexAzar(3)}-${v}${hexAzar(3)}-${hexAzar(12)}`;
};

const entero = (v, campo) => {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isInteger(n) || n < 0) {
    throw errorAws('ValidationError', `Value '${v ?? ''}' at '${campo}' failed to satisfy constraint: Member must have value greater than or equal to 0`);
  }
  return n;
};

/**
 * Las llamadas que no deben detener a Auto Scaling: registrar o quitar destinos de un
 * grupo de destino que ya se borró, avisar a un tema de SNS que ya no existe…
 */
function sinFallar(nombre, ...args) {
  try {
    return llamar(nombre, ...args);
  } catch (e) {
    if (e?.name !== 'ErrorAws') throw e;
    return null;
  }
}

const msGracia = (s) => (Number(s) || 0) * (DURACION_AUTOSCALING.graciaPor300 / 300);
const msEnfriamiento = (s) => (Number(s) || 0) * (DURACION_AUTOSCALING.enfriamientoPor300 / 300);

export function plantillaLanzamientoDe(estado, idONombre) {
  iniciar(estado);
  return estado.autoscaling.plantillas.find((p) => p.id === idONombre || p.nombre === idONombre) ?? null;
}

export function grupoAutoScalingDe(estado, nombre) {
  iniciar(estado);
  return estado.autoscaling.grupos.find((g) => g.nombre === nombre) ?? null;
}

const grupoOError = (estado, nombre) => {
  const g = grupoAutoScalingDe(estado, nombre);
  if (!g) throw errorAws('ValidationError', `AutoScalingGroup name not found - AutoScalingGroup '${nombre}' not found`);
  return g;
};

const plantillaOError = (estado, id) => {
  const p = plantillaLanzamientoDe(estado, id);
  if (!p) throw errorAws('InvalidLaunchTemplateId.NotFound', `The specified launch template, with template ID ${id}, does not exist.`);
  return p;
};

/** '$Default', '$Latest' o un número → la versión, o null. */
export function versionDePlantilla(plantilla, version = '$Default') {
  if (!plantilla) return null;
  const n = version === '$Latest' ? plantilla.ultimaVersion : version === '$Default' || version === undefined || version === null ? plantilla.versionDefault : Number(version);
  return plantilla.versiones.find((v) => v.numero === n) ?? null;
}

/** «Version Default», «Version Latest» o «Version 3», como en la lista de grupos. */
export const textoVersionPlantilla = (version) => (version === '$Default' ? 'Default' : version === '$Latest' ? 'Latest' : String(version));

/** Valida y limpia los datos de una versión de plantilla (lo que la instancia llevará). */
function normalizarDatos(estado, d = {}) {
  const imagen = amiDe(d.ami ?? 'al2023');
  if (!imagen) throw errorAws('InvalidAMIID.NotFound', `The image id '[${d.ami}]' does not exist`);
  const tipo = tipoInstancia(d.tipo ?? 't2.micro');
  if (!tipo) throw errorAws('InvalidParameterValue', `Invalid value '${d.tipo}' for InstanceType.`);
  const llave = d.llave || null;
  if (llave && !estado.llaves.some((k) => k.nombre === llave)) throw errorAws('InvalidKeyPair.NotFound', `The key pair '${llave}' does not exist`);
  const subred = d.subredId ? buscar(estado.subredes, d.subredId, 'subnet', 'InvalidSubnetID.NotFound') : null;
  const grupos = [...new Set(d.gruposSeguridad ?? [])];
  const vpcs = new Set();
  for (const id of grupos) vpcs.add(buscar(estado.gruposSeguridad, id, 'security group', 'InvalidGroup.NotFound').vpcId);
  if (vpcs.size > 1) throw errorAws('InvalidParameterCombination', 'The security groups must all belong to the same VPC.');
  if (subred && vpcs.size && !vpcs.has(subred.vpcId)) {
    throw errorAws('InvalidParameter', `Security group ${grupos[0]} and subnet ${subred.id} belong to different networks.`);
  }
  if (d.perfilIam && !estado.iam.roles.some((r) => r.nombre === d.perfilIam)) {
    throw errorAws('InvalidParameterValue', `Value (${d.perfilIam}) for parameter iamInstanceProfile.name is invalid. Invalid IAM Instance Profile name`);
  }
  const volumenes = (d.volumenes?.length ? d.volumenes : [{ tamano: imagen.discoMinimo, tipo: 'gp3', eliminarAlTerminar: true }]).map((v, i) => ({
    tamano: Number(v.tamano),
    tipo: v.tipo ?? 'gp3',
    eliminarAlTerminar: v.eliminarAlTerminar ?? i === 0
  }));
  if (!(volumenes[0].tamano >= imagen.discoMinimo)) {
    throw errorAws('InvalidBlockDeviceMapping', `Volume of size ${volumenes[0].tamano}GB is smaller than snapshot '${imagen.id.replace('ami', 'snap')}', expect size >= ${imagen.discoMinimo}GB`);
  }
  const etiquetas = (d.etiquetas ?? []).map((e) => ({ llave: nombreLimpio(e.llave, 128), valor: nombreLimpio(e.valor, 256) })).filter((e) => e.llave);
  return {
    ami: imagen.clave,
    tipo: tipo.tipo,
    llave,
    subredId: subred?.id ?? null,
    gruposSeguridad: grupos,
    volumenes,
    userData: String(d.userData ?? ''),
    perfilIam: d.perfilIam || null,
    etiquetas
  };
}

function validarDescripcion(texto) {
  const d = nombreLimpio(texto, 1000);
  if (d.length > 255) throw errorAws('InvalidParameterValue', 'The version description must be 255 characters or fewer.');
  return d;
}

/** Crea el grupo de seguridad que pidió el asistente («Create security group») y lo agrega a los datos. */
function grupoNuevoParaPlantilla(estado, datos, nuevoGrupo) {
  if (!nuevoGrupo) return;
  const vpcId = nuevoGrupo.vpcId ?? (datos.subredId ? subredDe(estado, datos.subredId)?.vpcId : estado.vpcs.find((v) => v.porDefecto)?.id);
  const g = crearGrupoSeguridad(estado, { nombre: nuevoGrupo.nombre, descripcion: nuevoGrupo.descripcion, vpcId, entrada: nuevoGrupo.entrada ?? [] });
  datos.gruposSeguridad = [...datos.gruposSeguridad, g.id];
}

/* ============================================================= plantillas */

/**
 * «Create launch template». p: { nombre, descripcion, guia, datos, nuevoGrupo: { nombre, descripcion, vpcId, entrada }, etiquetas }
 * Devuelve la plantilla con su versión 1.
 */
export function crearPlantillaLanzamiento(estado, p = {}) {
  iniciar(estado);
  const nombre = String(p.nombre ?? '').trim();
  if (!nombre) throw errorAws('MissingParameter', 'The request must contain the parameter LaunchTemplateName.');
  if (!NOMBRE_PLANTILLA.test(nombre)) {
    throw errorAws('InvalidLaunchTemplateName.MalformedException', 'A launch template name must be between 3 and 128 characters, and may contain letters, numbers, and the following characters: - ( ) . / _.');
  }
  if (estado.autoscaling.plantillas.some((x) => x.nombre === nombre)) throw errorAws('InvalidLaunchTemplateName.AlreadyExistsException', 'Launch template name already in use.');
  const descripcion = validarDescripcion(p.descripcion);
  const datos = normalizarDatos(estado, p.datos);
  // Las etiquetas de la plantilla se validan antes de crear nada.
  const etiquetas = (p.etiquetas ?? []).map((e) => ({ llave: nombreLimpio(e.llave, 128), valor: nombreLimpio(e.valor, 256) })).filter((e) => e.llave);
  grupoNuevoParaPlantilla(estado, datos, p.nuevoGrupo);
  const ahora = iso();
  const plantilla = {
    id: nuevoId('lt'),
    nombre,
    creado: ahora,
    creadoPor: `arn:aws:iam::${estado.cuenta.id}:user/${estado.cuenta.usuario}`,
    guia: Boolean(p.guia),
    versionDefault: 1,
    ultimaVersion: 1,
    etiquetas,
    versiones: [{ numero: 1, descripcion, creado: ahora, datos }]
  };
  estado.autoscaling.plantillas.push(plantilla);
  anotar(estado, 'EC2', 'CreateLaunchTemplate', `${plantilla.id} ${nombre}: ${datos.ami} ${datos.tipo}, grupos: ${datos.gruposSeguridad.join(', ') || 'ninguno'}, subred: ${datos.subredId ?? 'no incluida'}`);
  return plantilla;
}

/** «Modify template (Create new version)». La nueva versión no se vuelve la predeterminada sola. */
export function crearVersionPlantilla(estado, plantillaId, p = {}) {
  iniciar(estado);
  const plantilla = plantillaOError(estado, plantillaId);
  const descripcion = validarDescripcion(p.descripcion);
  const datos = normalizarDatos(estado, p.datos);
  if (plantilla.versiones.length >= 10000) throw errorAws('LaunchTemplateVersionLimitExceeded', 'You have reached the maximum number of versions for this launch template.');
  grupoNuevoParaPlantilla(estado, datos, p.nuevoGrupo);
  const numero = plantilla.ultimaVersion + 1;
  const version = { numero, descripcion, creado: iso(), datos };
  plantilla.versiones.push(version);
  plantilla.ultimaVersion = numero;
  if (p.guia !== undefined) plantilla.guia = Boolean(p.guia);
  if (p.predeterminada) plantilla.versionDefault = numero;
  anotar(estado, 'EC2', 'CreateLaunchTemplateVersion', `${plantilla.id} ${plantilla.nombre} versión ${numero}`);
  return version;
}

/** «Set default version». */
export function definirVersionPredeterminada(estado, plantillaId, numero) {
  iniciar(estado);
  const plantilla = plantillaOError(estado, plantillaId);
  const n = Number(numero);
  if (!plantilla.versiones.some((v) => v.numero === n)) throw errorAws('InvalidLaunchTemplateId.VersionNotFound', `Could not find launch template version ${numero} for template ${plantilla.id}.`);
  plantilla.versionDefault = n;
  anotar(estado, 'EC2', 'ModifyLaunchTemplate', `${plantilla.id} ${plantilla.nombre}: versión predeterminada ${n}`);
  return plantilla;
}

/** «Delete template version». La versión predeterminada no se puede borrar. */
export function eliminarVersionPlantilla(estado, plantillaId, numero) {
  iniciar(estado);
  const plantilla = plantillaOError(estado, plantillaId);
  const n = Number(numero);
  if (!plantilla.versiones.some((v) => v.numero === n)) throw errorAws('InvalidLaunchTemplateId.VersionNotFound', `Could not find launch template version ${numero} for template ${plantilla.id}.`);
  if (plantilla.versionDefault === n) {
    throw errorAws('InvalidLaunchTemplateVersion.DefaultVersionDeletion', 'You cannot delete the default version of a launch template. Set another version as the default, or delete the launch template.');
  }
  plantilla.versiones = plantilla.versiones.filter((v) => v.numero !== n);
  anotar(estado, 'EC2', 'DeleteLaunchTemplateVersions', `${plantilla.id} ${plantilla.nombre} versión ${n}`);
}

/** «Delete template». Como en AWS, se borra aunque un grupo la use (el grupo fallará al lanzar). */
export function eliminarPlantillaLanzamiento(estado, plantillaId) {
  iniciar(estado);
  const plantilla = plantillaOError(estado, plantillaId);
  estado.autoscaling.plantillas = estado.autoscaling.plantillas.filter((p) => p !== plantilla);
  anotar(estado, 'EC2', 'DeleteLaunchTemplate', `${plantilla.id} ${plantilla.nombre}`);
  return plantilla;
}

/** Lo que lanzarInstancias necesita para una instancia de una plantilla en una subred. */
function parametrosLanzamiento(estado, datos, subredId, nombre) {
  const subred = buscar(estado.subredes, subredId, 'subnet', 'InvalidSubnetID.NotFound');
  // Sin grupos en la plantilla, AWS usa el grupo por omisión de la VPC.
  const grupos = datos.gruposSeguridad.length ? datos.gruposSeguridad : estado.gruposSeguridad.filter((g) => g.vpcId === subred.vpcId && g.porDefecto).map((g) => g.id);
  return {
    nombre,
    ami: datos.ami,
    tipo: datos.tipo,
    llave: datos.llave,
    subredId: subred.id,
    gruposSeguridad: grupos,
    volumenes: datos.volumenes,
    userData: datos.userData,
    perfilIam: datos.perfilIam,
    cantidad: 1
  };
}

/* ================================================================ grupos */

function validarCapacidad(min, max, deseado) {
  if (max < min) throw errorAws('ValidationError', `Max bound, ${max}, must be greater than or equal to min bound, ${min}`);
  if (deseado < min || deseado > max) throw errorAws('ValidationError', `Desired capacity:${deseado} must be between the specified min size:${min} and max size:${max}`);
}

function validarSubredes(estado, subredes) {
  const ids = [...new Set(subredes ?? [])];
  if (!ids.length) throw errorAws('ValidationError', 'At least one Availability Zone or VPC Subnet is required.');
  const lista = ids.map((id) => {
    const s = subredDe(estado, id);
    if (!s) throw errorAws('ValidationError', `The subnet ID '${id}' does not exist`);
    return s;
  });
  if (new Set(lista.map((s) => s.vpcId)).size > 1) throw errorAws('ValidationError', 'The specified subnets must all belong to the same VPC.');
  return ids;
}

function validarGruposDestino(estado, arns, vpcId) {
  const lista = [...new Set(arns ?? [])];
  for (const arn of lista) {
    const tg = llamar('grupoDestinoDe', estado, arn);
    // Sin el módulo de balanceadores no hay cómo revisar: se acepta.
    if (tg === undefined) continue;
    if (!tg) throw errorAws('ValidationError', 'Provided Target Groups may not be valid. Please ensure they exist and try again.');
    if (tg.vpcId && vpcId && tg.vpcId !== vpcId) throw errorAws('ValidationError', `The target group ${tg.nombre ?? arn} is in a different VPC than the Auto Scaling group.`);
    const tipo = tg.tipoDestino ?? tg.tipo;
    if (tipo && tipo !== 'instance') throw errorAws('ValidationError', `The target group ${tg.nombre ?? arn} has a target type of ${tipo}. Auto Scaling groups only support target groups with a target type of instance.`);
  }
  return lista.map((arn) => llamar('grupoDestinoDe', estado, arn)?.arn ?? arn);
}

function validarEtiquetasGrupo(etiquetas = []) {
  const limpias = etiquetas.map((e) => ({ llave: nombreLimpio(e.llave, 128), valor: nombreLimpio(e.valor, 256), propagar: e.propagar !== false })).filter((e) => e.llave || e.valor);
  for (const e of limpias) if (!e.llave) throw errorAws('ValidationError', 'Tag key cannot be empty.');
  const llaves = limpias.map((e) => e.llave);
  if (new Set(llaves).size !== llaves.length) throw errorAws('ValidationError', 'Duplicate tag keys are not allowed.');
  if (limpias.length > 50) throw errorAws('ValidationError', 'You can add up to 50 tags.');
  return limpias;
}

function agregarActividad(estado, g, a) {
  const act = { id: uuid(), estado: 'InProgress', fin: null, instanciaId: null, tipo: 'otro', ...a, inicio: a.inicio ?? iso() };
  g.actividad.unshift(act);
  if (g.actividad.length > MAX_ACTIVIDAD) g.actividad.length = MAX_ACTIVIDAD;
  // Las notificaciones del grupo (paso «Add notifications»): por SNS.
  const evento = { lanzar: 'launch', terminar: 'terminate', 'lanzar-error': 'launch_error' }[act.tipo];
  if (evento) {
    for (const n of g.notificaciones ?? []) {
      if (!n.eventos?.includes(evento)) continue;
      sinFallar('publicarEnTema', estado, n.temaArn, {
        asunto: `Auto Scaling: ${evento === 'launch' ? 'launch' : evento === 'terminate' ? 'termination' : 'failed launch'} for group "${g.nombre}"`,
        mensaje: `Service: AWS Auto Scaling\nAutoScalingGroupName: ${g.nombre}\nDescription: ${act.descripcion}\nCause: ${act.causa}`,
        origen: 'autoscaling'
      });
    }
  }
  return act;
}

/**
 * «Create Auto Scaling group». p: { nombre, plantillaId, version, subredes, distribucion, gruposDestino, tipoSalud,
 * saludEbs, gracia, min, deseado, max, politica: { nombre, metrica, objetivo, grupoDestino, calentamiento, sinReducir } | null,
 * etiquetas: [{ llave, valor, propagar }], notificaciones, proteccionReduccion, monitoreo, mantenimiento }
 * Las instancias se lanzan en el siguiente avanzar(), como en AWS (unos segundos después).
 */
export function crearGrupoAutoScaling(estado, p = {}) {
  iniciar(estado);
  const nombre = String(p.nombre ?? '').trim();
  if (!nombre) throw errorAws('ValidationError', 'AutoScalingGroupName is required.');
  if (nombre.length > 255) throw errorAws('ValidationError', "1 validation error detected: Value at 'autoScalingGroupName' failed to satisfy constraint: Member must have length less than or equal to 255");
  if (/[:]/.test(nombre)) throw errorAws('ValidationError', 'The Auto Scaling group name must not contain a colon (:).');
  if (grupoAutoScalingDe(estado, nombre)) throw errorAws('AlreadyExists', `AutoScalingGroup by this name already exists - A group with the name ${nombre} already exists`);
  const plantilla = plantillaLanzamientoDe(estado, p.plantillaId);
  if (!plantilla) throw errorAws('ValidationError', `You must use a valid fully-formed launch template. The specified launch template, with template ID ${p.plantillaId ?? ''}, does not exist.`);
  const version = p.version === undefined || p.version === null || p.version === '' ? '$Default' : String(p.version);
  if (!versionDePlantilla(plantilla, version)) throw errorAws('ValidationError', `You must use a valid fully-formed launch template. The launch template version ${version} does not exist.`);
  const subredes = validarSubredes(estado, p.subredes);
  const vpcId = subredDe(estado, subredes[0]).vpcId;
  const min = entero(p.min ?? 0, 'minSize');
  const max = entero(p.max ?? 0, 'maxSize');
  const deseado = entero(p.deseado ?? min, 'desiredCapacity');
  validarCapacidad(min, max, deseado);
  const gruposDestino = validarGruposDestino(estado, p.gruposDestino, vpcId);
  const gracia = entero(p.gracia ?? 300, 'healthCheckGracePeriod');
  const etiquetas = validarEtiquetasGrupo(p.etiquetas);
  const ahora = reloj.ahora();
  const g = {
    nombre,
    arn: `arn:aws:autoscaling:us-east-1:${estado.cuenta.id}:autoScalingGroup:${uuid()}:autoScalingGroupName/${nombre}`,
    creado: iso(ahora),
    plantilla: { id: plantilla.id, version },
    subredes,
    distribucion: p.distribucion === 'balanced-only' ? 'balanced-only' : 'balanced-best-effort',
    min,
    deseado,
    max,
    gruposDestino,
    tipoSalud: p.tipoSalud === 'ELB' ? 'ELB' : 'EC2',
    saludEbs: Boolean(p.saludEbs),
    gracia,
    estado: 'activo',
    proteccionReduccion: Boolean(p.proteccionReduccion),
    monitoreo: Boolean(p.monitoreo),
    mantenimiento: p.mantenimiento ?? 'none',
    etiquetas,
    notificaciones: (p.notificaciones ?? []).filter((n) => n?.temaArn).map((n) => ({ temaArn: n.temaArn, eventos: [...(n.eventos ?? ['launch', 'terminate', 'launch_error', 'terminate_error'])] })),
    instancias: [],
    politicas: [],
    programadas: [],
    actividad: [],
    horaPico: null,
    causa: `At ${isoCorto(ahora)} a user request created an AutoScalingGroup changing the desired capacity from 0 to ${deseado}.`,
    reemplazos: 0,
    ajusteHasta: 0,
    reintento: 0
  };
  // La política se revisa antes de guardar el grupo: si está mal, no queda nada a medias.
  if (p.politica) validarPolitica(estado, g, { tipo: 'TargetTrackingScaling', ...p.politica });
  estado.autoscaling.grupos.push(g);
  anotar(estado, 'AutoScaling', 'CreateAutoScalingGroup', `${nombre}: ${plantilla.nombre} (${textoVersionPlantilla(version)}), min ${min}, deseado ${deseado}, máx ${max}, subredes ${subredes.join(', ')}, salud ${g.tipoSalud}${gruposDestino.length ? `, grupos de destino ${gruposDestino.length}` : ''}`);
  if (p.politica) crearPoliticaEscalado(estado, nombre, { tipo: 'TargetTrackingScaling', ...p.politica });
  return g;
}

/**
 * «Edit» del grupo (UpdateAutoScalingGroup). cambios: { min, deseado, max, plantillaId, version, subredes,
 * distribucion, gruposDestino, tipoSalud, saludEbs, gracia, proteccionReduccion, monitoreo }
 */
export function editarGrupoAutoScaling(estado, nombre, cambios = {}) {
  iniciar(estado);
  const g = grupoOError(estado, nombre);
  if (g.estado === 'borrando') throw errorAws('ScalingActivityInProgress', `AutoScalingGroup ${nombre} is pending delete.`);
  const min = cambios.min !== undefined ? entero(cambios.min, 'minSize') : g.min;
  const max = cambios.max !== undefined ? entero(cambios.max, 'maxSize') : g.max;
  const deseado = cambios.deseado !== undefined ? entero(cambios.deseado, 'desiredCapacity') : g.deseado;
  validarCapacidad(min, max, deseado);
  let plantilla = null;
  let version = g.plantilla.version;
  if (cambios.plantillaId !== undefined || cambios.version !== undefined) {
    plantilla = plantillaLanzamientoDe(estado, cambios.plantillaId ?? g.plantilla.id);
    if (!plantilla) throw errorAws('ValidationError', `You must use a valid fully-formed launch template. The specified launch template, with template ID ${cambios.plantillaId ?? g.plantilla.id}, does not exist.`);
    version = cambios.version === undefined || cambios.version === '' ? '$Default' : String(cambios.version);
    if (!versionDePlantilla(plantilla, version)) throw errorAws('ValidationError', `You must use a valid fully-formed launch template. The launch template version ${version} does not exist.`);
  }
  const subredes = cambios.subredes !== undefined ? validarSubredes(estado, cambios.subredes) : g.subredes;
  const vpcId = subredDe(estado, subredes[0])?.vpcId;
  const gruposDestino = cambios.gruposDestino !== undefined ? validarGruposDestino(estado, cambios.gruposDestino, vpcId) : g.gruposDestino;
  const gracia = cambios.gracia !== undefined ? entero(cambios.gracia, 'healthCheckGracePeriod') : g.gracia;

  const ahora = reloj.ahora();
  if (deseado !== g.deseado || min !== g.min || max !== g.max) {
    if (deseado !== g.deseado) {
      g.causa = `At ${isoCorto(ahora)} a user request update of AutoScalingGroup constraints to min: ${min}, max: ${max}, desired: ${deseado} changing the desired capacity from ${g.deseado} to ${deseado}.`;
    }
    Object.assign(g, { min, max, deseado });
  }
  if (plantilla) g.plantilla = { id: plantilla.id, version };
  g.subredes = subredes;
  // Los grupos de destino nuevos reciben a las instancias actuales; los quitados las sueltan.
  const vivos = g.instancias.filter((m) => m.ciclo !== 'Terminating').map((m) => m.id);
  for (const tg of gruposDestino.filter((x) => !g.gruposDestino.includes(x))) if (vivos.length) sinFallar('registrarDestinos', estado, tg, vivos);
  for (const tg of g.gruposDestino.filter((x) => !gruposDestino.includes(x))) if (vivos.length) sinFallar('quitarDestinos', estado, tg, vivos);
  g.gruposDestino = gruposDestino;
  g.gracia = gracia;
  if (cambios.distribucion !== undefined) g.distribucion = cambios.distribucion === 'balanced-only' ? 'balanced-only' : 'balanced-best-effort';
  if (cambios.tipoSalud !== undefined) g.tipoSalud = cambios.tipoSalud === 'ELB' ? 'ELB' : 'EC2';
  if (cambios.saludEbs !== undefined) g.saludEbs = Boolean(cambios.saludEbs);
  if (cambios.proteccionReduccion !== undefined) g.proteccionReduccion = Boolean(cambios.proteccionReduccion);
  if (cambios.monitoreo !== undefined) g.monitoreo = Boolean(cambios.monitoreo);
  g.reintento = 0;
  anotar(estado, 'AutoScaling', 'UpdateAutoScalingGroup', `${nombre}: min ${g.min}, deseado ${g.deseado}, máx ${g.max}, salud ${g.tipoSalud}, gracia ${g.gracia} s`);
  return g;
}

/** «Delete»: el grupo pasa a Deleting con deseado 0, termina sus instancias y luego desaparece. */
export function eliminarGrupoAutoScaling(estado, nombre) {
  iniciar(estado);
  const g = grupoOError(estado, nombre);
  if (g.estado === 'borrando') return g;
  const ahora = reloj.ahora();
  g.causa = `At ${isoCorto(ahora)} a user request update of AutoScalingGroup constraints to min: 0, max: 0, desired: 0 changing the desired capacity from ${g.deseado} to 0.`;
  Object.assign(g, { estado: 'borrando', min: 0, max: 0, deseado: 0 });
  const alarmas = g.politicas.flatMap((p) => p.alarmas ?? []);
  if (alarmas.length) llamar('eliminarAlarmasInternas', estado, alarmas);
  g.politicas = [];
  g.programadas = [];
  anotar(estado, 'AutoScaling', 'DeleteAutoScalingGroup', `${nombre} (ForceDelete)`);
  return g;
}

/* ============================================================== políticas */

const politicaArn = (estado, g, nombre) => `arn:aws:autoscaling:us-east-1:${estado.cuenta.id}:scalingPolicy:${uuid()}:autoScalingGroupName/${g.nombre}:policyName/${nombre}`;

/** El TargetGroup de CloudWatch: «targetgroup/tg-web/0123456789abcdef» (la cola del ARN). */
const dimensionTg = (arn) => String(arn ?? '').replace(/^.*:(targetgroup\/)/, '$1');

/** La consulta de CloudWatch que vigila una política de seguimiento. */
export function consultaPoliticaEscalado(g, p) {
  const m = metricaSeguimiento(p.metrica) ?? METRICAS_SEGUIMIENTO[0];
  if (m.valor === 'ALBRequestCountPerTarget') return { namespace: m.namespace, metrica: m.metrica, dimensiones: { TargetGroup: dimensionTg(p.grupoDestino) }, estadistica: 'Sum' };
  return { namespace: m.namespace, metrica: m.metrica, dimensiones: { AutoScalingGroupName: g.nombre }, estadistica: 'Average' };
}

function alarmasDeSeguimiento(estado, g, p) {
  const consulta = consultaPoliticaEscalado(g, p);
  const comun = {
    namespace: consulta.namespace,
    metrica: consulta.metrica,
    dimensiones: consulta.dimensiones,
    estadistica: consulta.estadistica,
    periodo: 60,
    acciones: { alarma: [p.arn], ok: [], datos: [] },
    creadaPor: 'autoscaling',
    asg: g.nombre,
    politica: p.nombre
  };
  const alta = `TargetTracking-${g.nombre}-AlarmHigh-${uuid()}`;
  const baja = `TargetTracking-${g.nombre}-AlarmLow-${uuid()}`;
  llamar('crearAlarmaInterna', estado, {
    ...comun,
    nombre: alta,
    descripcion: `DO NOT EDIT OR DELETE. For TargetTrackingScaling policy ${p.arn}.`,
    comparacion: 'GreaterThanThreshold',
    umbral: p.objetivo,
    evaluaciones: DURACION_AUTOSCALING.puntosAlto,
    puntos: DURACION_AUTOSCALING.puntosAlto
  });
  const alarmas = [alta];
  if (!p.sinReducir) {
    llamar('crearAlarmaInterna', estado, {
      ...comun,
      nombre: baja,
      descripcion: `DO NOT EDIT OR DELETE. For TargetTrackingScaling policy ${p.arn}.`,
      comparacion: 'LessThanThreshold',
      umbral: Math.round(p.objetivo * 0.9 * 100) / 100,
      evaluaciones: DURACION_AUTOSCALING.puntosBajo,
      puntos: DURACION_AUTOSCALING.puntosBajo
    });
    alarmas.push(baja);
  }
  return alarmas;
}

function validarPolitica(estado, g, p, anterior = null) {
  const nombre = String(p.nombre ?? '').trim();
  if (!nombre) throw errorAws('ValidationError', 'Scaling policy name is required.');
  if (nombre.length > 255 || /:/.test(nombre)) throw errorAws('ValidationError', 'Scaling policy name must be 1-255 characters and must not contain a colon (:).');
  if (g.politicas.some((x) => x !== anterior && x.nombre === nombre)) throw errorAws('ValidationError', `A scaling policy with the name ${nombre} already exists for this Auto Scaling group.`);
  const tipo = ['TargetTrackingScaling', 'StepScaling', 'SimpleScaling'].includes(p.tipo) ? p.tipo : 'TargetTrackingScaling';
  const base = { nombre, tipo, habilitada: p.habilitada !== false };
  if (tipo === 'TargetTrackingScaling') {
    const m = metricaSeguimiento(p.metrica ?? 'ASGAverageCPUUtilization');
    if (!m) throw errorAws('ValidationError', `Invalid predefined metric type: ${p.metrica}`);
    const objetivo = Number(p.objetivo);
    if (!Number.isFinite(objetivo) || objetivo <= 0) throw errorAws('ValidationError', 'Target value must be greater than 0.');
    if (m.valor === 'ASGAverageCPUUtilization' && objetivo > 100) throw errorAws('ValidationError', 'Target value for Average CPU utilization must be between 0 and 100.');
    let grupoDestino = null;
    if (m.valor === 'ALBRequestCountPerTarget') {
      grupoDestino = p.grupoDestino ?? g.gruposDestino[0] ?? null;
      if (!grupoDestino || !g.gruposDestino.includes(grupoDestino)) {
        throw errorAws('ValidationError', 'The target group for ALBRequestCountPerTarget must be attached to the Auto Scaling group.');
      }
    }
    return { ...base, metrica: m.valor, grupoDestino, objetivo, calentamiento: entero(p.calentamiento ?? 300, 'estimatedInstanceWarmup'), sinReducir: Boolean(p.sinReducir), alarmas: [] };
  }
  const ajuste = ['ChangeInCapacity', 'ExactCapacity', 'PercentChangeInCapacity'].includes(p.ajuste) ? p.ajuste : 'ChangeInCapacity';
  const alarma = p.alarma ? String(p.alarma) : null;
  if (tipo === 'SimpleScaling') {
    const valor = Number(p.valor);
    if (!Number.isInteger(valor)) throw errorAws('ValidationError', 'ScalingAdjustment must be an integer.');
    return { ...base, alarma, ajuste, valor, enfriamiento: entero(p.enfriamiento ?? 300, 'cooldown'), enfriaHasta: 0 };
  }
  const pasos = (p.pasos ?? []).map((s) => ({
    inferior: s.inferior === '' || s.inferior === null || s.inferior === undefined ? null : Number(s.inferior),
    superior: s.superior === '' || s.superior === null || s.superior === undefined ? null : Number(s.superior),
    valor: Number(s.valor)
  }));
  if (!pasos.length) throw errorAws('ValidationError', 'StepAdjustments are required for a StepScaling policy.');
  if (pasos.some((s) => !Number.isInteger(s.valor))) throw errorAws('ValidationError', 'ScalingAdjustment must be an integer.');
  if (pasos.some((s) => s.inferior !== null && s.superior !== null && s.superior <= s.inferior)) {
    throw errorAws('ValidationError', 'The upper bound of a step adjustment must be greater than its lower bound.');
  }
  return { ...base, alarma, ajuste, pasos, calentamiento: entero(p.calentamiento ?? 300, 'estimatedInstanceWarmup'), enfriaHasta: 0 };
}

/**
 * «Create dynamic scaling policy» (PutScalingPolicy). p: { nombre, tipo, metrica, objetivo, grupoDestino,
 * calentamiento, sinReducir, alarma, ajuste, valor, pasos: [{ inferior, superior, valor }], enfriamiento }
 * Una de seguimiento crea sus dos alarmas TargetTracking-…-AlarmHigh/AlarmLow en CloudWatch.
 */
export function crearPoliticaEscalado(estado, asgNombre, p = {}) {
  iniciar(estado);
  const g = grupoOError(estado, asgNombre);
  if (g.estado === 'borrando') throw errorAws('ScalingActivityInProgress', `AutoScalingGroup ${asgNombre} is pending delete.`);
  const pol = validarPolitica(estado, g, p);
  pol.arn = politicaArn(estado, g, pol.nombre);
  if (pol.tipo === 'TargetTrackingScaling') pol.alarmas = alarmasDeSeguimiento(estado, g, pol);
  if (pol.alarma) sinFallar('agregarAccionAlarma', estado, pol.alarma, pol.arn);
  g.politicas.push(pol);
  anotar(estado, 'AutoScaling', 'PutScalingPolicy', `${g.nombre}: ${pol.nombre} (${pol.tipo}${pol.tipo === 'TargetTrackingScaling' ? `, ${pol.metrica} = ${pol.objetivo}` : ''})`);
  return pol;
}

/** «Edit» de una política: se reemplaza conservando su ARN (y sus alarmas se rehacen). */
export function editarPoliticaEscalado(estado, asgNombre, nombrePolitica, p = {}) {
  iniciar(estado);
  const g = grupoOError(estado, asgNombre);
  const anterior = g.politicas.find((x) => x.nombre === nombrePolitica);
  if (!anterior) throw errorAws('ValidationError', `Scaling policy ${nombrePolitica} not found.`);
  const pol = validarPolitica(estado, g, { tipo: anterior.tipo, ...p }, anterior);
  pol.arn = anterior.nombre === pol.nombre ? anterior.arn : politicaArn(estado, g, pol.nombre);
  if (anterior.alarmas?.length) llamar('eliminarAlarmasInternas', estado, anterior.alarmas);
  if (pol.tipo === 'TargetTrackingScaling') pol.alarmas = alarmasDeSeguimiento(estado, g, pol);
  if (pol.alarma && (pol.alarma !== anterior.alarma || pol.arn !== anterior.arn)) sinFallar('agregarAccionAlarma', estado, pol.alarma, pol.arn);
  g.politicas[g.politicas.indexOf(anterior)] = pol;
  anotar(estado, 'AutoScaling', 'PutScalingPolicy', `${g.nombre}: ${pol.nombre} (editada)`);
  return pol;
}

export function eliminarPoliticaEscalado(estado, asgNombre, nombrePolitica) {
  iniciar(estado);
  const g = grupoOError(estado, asgNombre);
  const pol = g.politicas.find((x) => x.nombre === nombrePolitica);
  if (!pol) throw errorAws('ValidationError', `Scaling policy ${nombrePolitica} not found.`);
  if (pol.alarmas?.length) llamar('eliminarAlarmasInternas', estado, pol.alarmas);
  g.politicas = g.politicas.filter((x) => x !== pol);
  anotar(estado, 'AutoScaling', 'DeletePolicy', `${g.nombre}: ${pol.nombre}`);
}

/** Casilla «Enabled» de una política (la deshabilitada no escala, pero se conserva). */
export function habilitarPoliticaEscalado(estado, asgNombre, nombrePolitica, habilitada) {
  iniciar(estado);
  const g = grupoOError(estado, asgNombre);
  const pol = g.politicas.find((x) => x.nombre === nombrePolitica);
  if (!pol) throw errorAws('ValidationError', `Scaling policy ${nombrePolitica} not found.`);
  pol.habilitada = Boolean(habilitada);
  anotar(estado, 'AutoScaling', 'PutScalingPolicy', `${g.nombre}: ${pol.nombre} ${pol.habilitada ? 'habilitada' : 'deshabilitada'}`);
  return pol;
}

/** Cambia el deseado por una alarma o una acción programada y deja la causa para las actividades. */
function cambiarDeseado(g, nuevo, causa) {
  const limitado = Math.max(g.min, Math.min(g.max, nuevo));
  if (limitado === g.deseado) return false;
  g.causa = `${causa} changing the desired capacity from ${g.deseado} to ${limitado}.`;
  g.deseado = limitado;
  return true;
}

/** El valor de una métrica: el de CloudWatch si existe; si no, una CPU sintética local (solo por grupo). */
export function metricaAsg(estado, consulta, ahora = reloj.ahora()) {
  if (existeFuncion('valorMetrica')) return llamar('valorMetrica', estado, consulta, ahora) ?? null;
  const nombre = consulta?.dimensiones?.AutoScalingGroupName;
  if (consulta?.metrica !== 'CPUUtilization' || !nombre) return null;
  const g = grupoAutoScalingDe(estado, nombre);
  if (!g) return null;
  // Solo cuentan las que ya estaban prendidas en ese momento.
  const insts = g.instancias.map((m) => instanciaDe(estado, m.id)).filter((i) => i && i.estado === 'running' && (i.desde ?? 0) <= ahora);
  if (!insts.length) return null;
  const carga = g.horaPico && g.horaPico.desde <= ahora && ahora < g.horaPico.hasta ? g.horaPico.cpu : 0;
  const cpu = insts.map((i) => Math.min(100, cpuBase(i.id) + carga));
  return Math.round((cpu.reduce((a, b) => a + b, 0) / cpu.length) * 100) / 100;
}

/** La CPU base de una instancia: un número estable de 3 a 15 que sale de su id. */
function cpuBase(id) {
  let n = 0;
  for (const c of String(id)) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return 3 + (n % 1300) / 100;
}

/**
 * Target tracking: la cuenta que hacen las alarmas TargetTracking-…-AlarmHigh (3 puntos
 * arriba del objetivo → crece) y AlarmLow (15 puntos debajo del 90 % → se encoge).
 * La nueva capacidad es ceil(capacidad × métrica / objetivo), como AWS. Se puede llamar
 * de más (lo hace avanzar y CloudWatch): el warmup evita dobles ajustes.
 */
export function ajusteSeguimiento(estado, asgNombre, cuando) {
  iniciar(estado);
  // CloudWatch puede llamarla con ({ alarma }) en lugar de la hora.
  const ahora = typeof cuando === 'number' ? cuando : reloj.ahora();
  const g = grupoAutoScalingDe(estado, asgNombre);
  if (!g || g.estado !== 'activo' || ahora < (g.ajusteHasta ?? 0)) return false;
  const politicas = g.politicas.filter((p) => p.tipo === 'TargetTrackingScaling' && p.habilitada);
  if (!politicas.length) return false;
  const enServicio = g.instancias.filter((m) => m.ciclo === 'InService').length;
  const capacidad = Math.max(enServicio, 1);
  let crecer = null;
  let encoger = null;
  let todasEncogen = true;
  for (const p of politicas) {
    const consulta = consultaPoliticaEscalado(g, p);
    const serie = (n) => Array.from({ length: n }, (_, k) => metricaAsg(estado, consulta, ahora - k * DURACION_AUTOSCALING.periodo));
    const altos = serie(DURACION_AUTOSCALING.puntosAlto);
    const actual = altos[0];
    if (actual === null || actual === undefined) {
      todasEncogen = false;
      continue;
    }
    const propuesta = Math.ceil((capacidad * actual) / p.objetivo);
    if (altos.every((v) => v !== null && v > p.objetivo) && propuesta > g.deseado) {
      if (!crecer || propuesta > crecer.n) crecer = { n: propuesta, p };
    }
    const bajos = p.sinReducir ? [] : serie(DURACION_AUTOSCALING.puntosBajo);
    if (bajos.length && bajos.every((v) => v !== null && v < p.objetivo * 0.9) && enServicio >= g.deseado) {
      const n = Math.max(propuesta, g.min);
      if (!encoger || n > encoger.n) encoger = { n, p };
    } else todasEncogen = false;
  }
  const elegido = crecer ?? (todasEncogen && encoger && encoger.n < g.deseado ? encoger : null);
  if (!elegido) return false;
  const alarma = elegido.p.alarmas?.[crecer ? 0 : 1] ?? `TargetTracking-${g.nombre}-${crecer ? 'AlarmHigh' : 'AlarmLow'}`;
  const cambio = cambiarDeseado(g, elegido.n, `At ${isoCorto(ahora)} a monitor alarm ${alarma} in state ALARM triggered policy ${elegido.p.nombre}`);
  if (cambio) {
    g.ajusteHasta = ahora + msEnfriamiento(elegido.p.calentamiento ?? 300);
    anotar(estado, 'AutoScaling', 'ExecutePolicy', `${g.nombre}: ${elegido.p.nombre} → deseado ${g.deseado}`);
  }
  return cambio;
}

/**
 * Una alarma de CloudWatch en ALARM dispara una política (su acción es el ARN de la política).
 * opciones.alarma: el nombre de la alarma, o la alarma completa ({ nombre, umbral, … }) para elegir el paso.
 * Devuelve true si cambió la capacidad deseada.
 */
export function ejecutarPolitica(estado, arn, { alarma } = {}, cuando) {
  iniciar(estado);
  const ahora = typeof cuando === 'number' ? cuando : reloj.ahora();
  for (const g of estado.autoscaling.grupos) {
    const p = g.politicas.find((x) => x.arn === arn);
    if (!p) continue;
    if (!p.habilitada || g.estado !== 'activo') return false;
    if (p.tipo === 'TargetTrackingScaling') return ajusteSeguimiento(estado, g.nombre, ahora);
    if (ahora < (p.enfriaHasta ?? 0)) return false;
    const nombreAlarma = typeof alarma === 'string' ? alarma : alarma?.nombre ?? p.alarma ?? 'unknown';
    let valor = p.valor;
    if (p.tipo === 'StepScaling') {
      // El paso depende de cuánto se pasó la métrica del umbral; si no se sabe, el primero.
      let exceso = null;
      if (alarma && typeof alarma === 'object' && Number.isFinite(Number(alarma.umbral))) {
        const v = metricaAsg(estado, { namespace: alarma.namespace, metrica: alarma.metrica, dimensiones: alarma.dimensiones, estadistica: alarma.estadistica }, ahora);
        if (v !== null && v !== undefined) exceso = v - Number(alarma.umbral);
      }
      const paso = (exceso === null ? null : p.pasos.find((s) => (s.inferior === null || exceso >= s.inferior) && (s.superior === null || exceso < s.superior))) ?? p.pasos[0];
      valor = paso.valor;
    }
    const nuevo =
      p.ajuste === 'ExactCapacity' ? valor : p.ajuste === 'PercentChangeInCapacity' ? g.deseado + Math.sign(valor) * Math.max(1, Math.round((g.deseado * Math.abs(valor)) / 100)) : g.deseado + valor;
    const cambio = cambiarDeseado(g, nuevo, `At ${isoCorto(ahora)} a monitor alarm ${nombreAlarma} in state ALARM triggered policy ${p.nombre}`);
    if (cambio) {
      p.enfriaHasta = ahora + msEnfriamiento(p.tipo === 'SimpleScaling' ? p.enfriamiento : p.calentamiento);
      anotar(estado, 'AutoScaling', 'ExecutePolicy', `${g.nombre}: ${p.nombre} → deseado ${g.deseado}`);
    }
    return cambio;
  }
  return false;
}

/* ===================================================== acciones programadas */

const PERIODOS = { '30m': 30 * 60000, '1h': 3600000, '1d': 86400000, '1w': 7 * 86400000 };

/**
 * «Create scheduled action». p: { nombre, deseado, min, max, recurrencia: 'once' | '30m' | '1h' | '1d' | '1w' | 'cron …', inicio (iso), fin }
 * Las que usan una expresión cron se guardan, pero el simulador no las ejecuta.
 */
export function crearAccionProgramada(estado, asgNombre, p = {}) {
  iniciar(estado);
  const g = grupoOError(estado, asgNombre);
  const nombre = String(p.nombre ?? '').trim();
  if (!nombre) throw errorAws('ValidationError', 'Scheduled action name is required.');
  if (g.programadas.some((x) => x.nombre === nombre)) throw errorAws('AlreadyExists', `Scheduled action ${nombre} already exists.`);
  const num = (v, campo) => (v === '' || v === null || v === undefined ? null : entero(v, campo));
  const deseado = num(p.deseado, 'desiredCapacity');
  const min = num(p.min, 'minSize');
  const max = num(p.max, 'maxSize');
  if (deseado === null && min === null && max === null) throw errorAws('ValidationError', 'At least one of MinSize, MaxSize, or DesiredCapacity must be specified.');
  if (min !== null && max !== null && max < min) throw errorAws('ValidationError', `Max bound, ${max}, must be greater than or equal to min bound, ${min}`);
  const recurrencia = String(p.recurrencia ?? 'once').trim() || 'once';
  const inicioMs = p.inicio ? Date.parse(p.inicio) : reloj.ahora();
  if (!Number.isFinite(inicioMs)) throw errorAws('ValidationError', 'Given start time is not a valid date.');
  if (recurrencia === 'once' && inicioMs < reloj.ahora() - 60000) throw errorAws('ValidationError', 'Given start time is in the past');
  const finMs = p.fin ? Date.parse(p.fin) : null;
  if (finMs !== null && (!Number.isFinite(finMs) || finMs <= inicioMs)) throw errorAws('ValidationError', 'End time must be after the start time.');
  const prog = {
    nombre,
    arn: `arn:aws:autoscaling:us-east-1:${estado.cuenta.id}:scheduledUpdateGroupAction:${uuid()}:autoScalingGroupName/${g.nombre}:scheduledActionName/${nombre}`,
    deseado,
    min,
    max,
    recurrencia,
    inicio: iso(inicioMs),
    fin: finMs === null ? null : iso(finMs),
    proxima: recurrencia === 'once' || PERIODOS[recurrencia] ? inicioMs : null
  };
  g.programadas.push(prog);
  anotar(estado, 'AutoScaling', 'PutScheduledUpdateGroupAction', `${g.nombre}: ${nombre} (${recurrencia})`);
  return prog;
}

export function eliminarAccionProgramada(estado, asgNombre, nombre) {
  iniciar(estado);
  const g = grupoOError(estado, asgNombre);
  if (!g.programadas.some((x) => x.nombre === nombre)) throw errorAws('ValidationError', `Scheduled action ${nombre} not found.`);
  g.programadas = g.programadas.filter((x) => x.nombre !== nombre);
  anotar(estado, 'AutoScaling', 'DeleteScheduledAction', `${g.nombre}: ${nombre}`);
}

function correrProgramadas(estado, g, ahora) {
  let cambio = false;
  for (const prog of [...g.programadas]) {
    if (prog.proxima === null || prog.proxima > ahora) continue;
    const min = prog.min ?? g.min;
    const max = prog.max ?? g.max;
    // Como AWS: si solo cambia el mínimo o el máximo, el deseado se acomoda dentro.
    const deseado = prog.deseado ?? Math.max(min, Math.min(max, g.deseado));
    if (max >= min && deseado >= min && deseado <= max) {
      const antes = g.deseado;
      Object.assign(g, { min, max });
      if (deseado !== antes) {
        g.causa = `At ${isoCorto(ahora)} a scheduled action update of AutoScalingGroup constraints to min: ${min}, max: ${max}, desired: ${deseado} changing the desired capacity from ${antes} to ${deseado}.`;
        g.deseado = deseado;
      }
    } else {
      agregarActividad(estado, g, {
        estado: 'Failed',
        descripcion: `Executing scheduled action ${prog.nombre}`,
        causa: `At ${isoCorto(ahora)} the scheduled action ${prog.nombre} failed: Desired capacity:${deseado} must be between the specified min size:${min} and max size:${max}`,
        fin: iso(ahora)
      });
    }
    const periodo = PERIODOS[prog.recurrencia];
    if (!periodo) g.programadas = g.programadas.filter((x) => x !== prog);
    else {
      prog.proxima += periodo * Math.max(1, Math.ceil((ahora - prog.proxima + 1) / periodo));
      if (prog.fin && prog.proxima > Date.parse(prog.fin)) g.programadas = g.programadas.filter((x) => x !== prog);
    }
    cambio = true;
  }
  return cambio;
}

/* ===================================================== Instance management */

function miembrosOError(g, ids) {
  return ids.map((id) => {
    const m = g.instancias.find((x) => x.id === id);
    if (!m) throw errorAws('ValidationError', `The instance ${id} is not part of Auto Scaling group ${g.nombre}.`);
    return m;
  });
}

/** «Detach»: la instancia sigue viva pero sale del grupo. Sin reemplazo, el deseado baja. */
export function separarInstanciasAsg(estado, asgNombre, ids = [], { reemplazar = false } = {}) {
  iniciar(estado);
  const g = grupoOError(estado, asgNombre);
  const miembros = miembrosOError(g, ids);
  if (miembros.some((m) => m.ciclo !== 'InService' && m.ciclo !== 'Standby')) throw errorAws('ValidationError', 'The instance is not in a valid state for this operation (it must be InService or Standby).');
  const enServicio = miembros.filter((m) => m.ciclo === 'InService').length;
  if (!reemplazar && g.deseado - enServicio < g.min) {
    throw errorAws('ValidationError', `Detaching ${ids.length} instance(s) with ShouldDecrementDesiredCapacity flag set to true would violate the min size constraint of the group (min: ${g.min}, desired: ${g.deseado}).`);
  }
  const ahora = reloj.ahora();
  const antes = g.deseado;
  if (!reemplazar) g.deseado -= enServicio;
  for (const m of miembros) {
    g.instancias = g.instancias.filter((x) => x !== m);
    const inst = instanciaDe(estado, m.id);
    if (inst) delete inst.autoscaling;
    if (g.gruposDestino.length) for (const tg of g.gruposDestino) sinFallar('quitarDestinos', estado, tg, [m.id]);
    agregarActividad(estado, g, {
      estado: 'Successful',
      descripcion: `Detaching EC2 instance: ${m.id}`,
      causa: `At ${isoCorto(ahora)} instance ${m.id} was detached in response to a user request${!reemplazar && m.ciclo === 'InService' ? `, shrinking the capacity from ${antes} to ${g.deseado}` : ''}.`,
      instanciaId: m.id,
      fin: iso(ahora)
    });
  }
  anotar(estado, 'AutoScaling', 'DetachInstances', `${g.nombre}: ${ids.join(', ')}${reemplazar ? ' (con reemplazo)' : ''}`);
}

/** «Set scale-in protection» / «Remove scale-in protection». */
export function protegerInstanciasAsg(estado, asgNombre, ids = [], proteger = true) {
  iniciar(estado);
  const g = grupoOError(estado, asgNombre);
  for (const m of miembrosOError(g, ids)) m.protegida = Boolean(proteger);
  anotar(estado, 'AutoScaling', 'SetInstanceProtection', `${g.nombre}: ${ids.join(', ')} ${proteger ? 'protegidas' : 'sin protección'}`);
}

/** «Set to Standby» (entrar = true) y «Set to InService» (entrar = false). En Standby no cuenta para el deseado. */
export function esperaInstanciasAsg(estado, asgNombre, ids = [], entrar = true) {
  iniciar(estado);
  const g = grupoOError(estado, asgNombre);
  const miembros = miembrosOError(g, ids);
  const ahora = reloj.ahora();
  if (entrar) {
    if (miembros.some((m) => m.ciclo !== 'InService')) throw errorAws('ValidationError', 'The instance is not in InService.');
    if (g.deseado - miembros.length < g.min) throw errorAws('ValidationError', `Moving ${miembros.length} instance(s) to Standby would violate the min size constraint of the group (min: ${g.min}, desired: ${g.deseado}).`);
  } else {
    if (miembros.some((m) => m.ciclo !== 'Standby')) throw errorAws('ValidationError', 'The instance is not in Standby.');
    if (g.deseado + miembros.length > g.max) throw errorAws('ValidationError', `Moving ${miembros.length} instance(s) out of Standby would exceed the max size of the group (max: ${g.max}).`);
  }
  for (const m of miembros) {
    const antes = g.deseado;
    g.deseado += entrar ? -1 : 1;
    m.ciclo = entrar ? 'Standby' : 'InService';
    agregarActividad(estado, g, {
      estado: 'Successful',
      descripcion: `${entrar ? 'Moving EC2 instance to Standby' : 'Moving EC2 instance out of Standby'}: ${m.id}`,
      causa: `At ${isoCorto(ahora)} instance ${m.id} was moved ${entrar ? 'to' : 'out of'} standby in response to a user request, ${entrar ? 'shrinking' : 'increasing'} the capacity from ${antes} to ${g.deseado}.`,
      instanciaId: m.id,
      fin: iso(ahora)
    });
    for (const tg of g.gruposDestino) sinFallar(entrar ? 'quitarDestinos' : 'registrarDestinos', estado, tg, [m.id]);
  }
  anotar(estado, 'AutoScaling', entrar ? 'EnterStandby' : 'ExitStandby', `${g.nombre}: ${ids.join(', ')}`);
}

/**
 * «Simular hora pico» (propio del simulador): sube la CPU de las instancias del grupo.
 * minutos = minutos del simulador (cada uno dura un periodo, 10 s reales).
 */
export function simularCargaAsg(estado, asgNombre, { cpu = 90, minutos = 10 } = {}) {
  iniciar(estado);
  const g = grupoOError(estado, asgNombre);
  if (g.estado !== 'activo') throw errorAws('ScalingActivityInProgress', `AutoScalingGroup ${asgNombre} is pending delete.`);
  const c = Math.max(0, Math.min(100, Number(cpu) || 0));
  const m = Math.max(1, Math.min(60, Number(minutos) || 10));
  const ahora = reloj.ahora();
  g.horaPico = { cpu: c, desde: ahora, hasta: ahora + m * DURACION_AUTOSCALING.periodo };
  llamar('simularCarga', estado, { asg: g.nombre, cpu: c, minutos: m });
  anotar(estado, 'AutoScaling', 'SimularHoraPico', `${g.nombre}: CPU +${c} % durante ${m} min simulados`);
  return g.horaPico;
}

/* ========================================================= la reconciliación */

/** La subred para la siguiente instancia: la de la zona con menos instancias del grupo. */
function elegirSubred(estado, g) {
  const cuenta = new Map();
  for (const m of g.instancias) if (m.ciclo !== 'Terminating') cuenta.set(m.az, (cuenta.get(m.az) ?? 0) + 1);
  const opciones = g.subredes.map((id) => subredDe(estado, id)).filter(Boolean);
  if (!opciones.length) throw errorAws('ValidationError', `The subnet ID '${g.subredes[0] ?? ''}' does not exist`);
  return opciones.reduce((mejor, s) => ((cuenta.get(s.az) ?? 0) < (cuenta.get(mejor.az) ?? 0) ? s : mejor), opciones[0]);
}

/** La causa EC2 / ELB cuando el health check saca una instancia. */
const causaSalud = (ahora, tipo) =>
  tipo === 'ELB'
    ? `At ${isoCorto(ahora)} an instance was taken out of service in response to an ELB system health check failure.`
    : `At ${isoCorto(ahora)} an instance was taken out of service in response to an EC2 health check indicating it has been terminated or stopped.`;

function cerrarActividades(g, instanciaId, tipo, ahora) {
  for (const a of g.actividad) {
    if (a.instanciaId === instanciaId && a.tipo === tipo && a.estado === 'InProgress') Object.assign(a, { estado: 'Successful', fin: iso(ahora) });
  }
}

function sacarPorSalud(estado, g, m, inst, tipo, ahora) {
  m.salud = 'Unhealthy';
  m.ciclo = 'Terminating';
  g.reemplazos = (g.reemplazos ?? 0) + 1;
  for (const tg of g.gruposDestino) sinFallar('quitarDestinos', estado, tg, [m.id]);
  agregarActividad(estado, g, { descripcion: `Terminating EC2 instance: ${m.id}`, causa: causaSalud(ahora, tipo), instanciaId: m.id, tipo: 'terminar', inicio: iso(ahora) });
  if (inst && inst.estado !== 'shutting-down' && inst.estado !== 'terminated') terminarInstancia(estado, inst.id);
}

function reconciliar(estado, g, ahora) {
  let cambio = false;

  // 1. Lo que pasó con cada instancia del grupo.
  for (const m of [...g.instancias]) {
    const inst = instanciaDe(estado, m.id);
    if (!inst || inst.estado === 'terminated') {
      if (m.ciclo !== 'Terminating') {
        // La terminaron por fuera (Instance state → Terminate): el health check lo descubre.
        g.reemplazos = (g.reemplazos ?? 0) + 1;
        for (const tg of g.gruposDestino) sinFallar('quitarDestinos', estado, tg, [m.id]);
        agregarActividad(estado, g, { descripcion: `Terminating EC2 instance: ${m.id}`, causa: causaSalud(ahora, 'EC2'), instanciaId: m.id, tipo: 'terminar', inicio: iso(ahora) });
      }
      cerrarActividades(g, m.id, 'lanzar', ahora);
      cerrarActividades(g, m.id, 'terminar', ahora);
      g.instancias = g.instancias.filter((x) => x !== m);
      cambio = true;
      continue;
    }
    if (m.ciclo === 'Terminating' || m.ciclo === 'Standby') continue;
    if (['shutting-down', 'stopping', 'stopped'].includes(inst.estado)) {
      // Fuera de running = Unhealthy aunque esté en su gracia (así lo dice la consola).
      sacarPorSalud(estado, g, m, inst, 'EC2', ahora);
      cambio = true;
      continue;
    }
    if (m.ciclo === 'Pending' && inst.estado === 'running') {
      m.ciclo = 'InService';
      cerrarActividades(g, m.id, 'lanzar', ahora);
      cambio = true;
    }
    // El health check del balanceador cuenta solo después de la gracia.
    if (g.tipoSalud === 'ELB' && m.ciclo === 'InService' && g.gruposDestino.length && ahora - m.lanzada >= msGracia(g.gracia)) {
      const enferma = g.gruposDestino.some((tg) => sinFallar('saludDestino', estado, tg, m.id) === 'unhealthy');
      if (enferma) {
        sacarPorSalud(estado, g, m, inst, 'ELB', ahora);
        cambio = true;
      }
    }
  }

  // 2. La capacidad: lanzar o terminar hasta llegar al deseado.
  // Al borrar el grupo también salen las que estaban en Standby.
  const activos = g.instancias.filter((m) => m.ciclo === 'Pending' || m.ciclo === 'InService' || (g.estado === 'borrando' && m.ciclo === 'Standby'));
  const deseado = g.estado === 'borrando' ? 0 : g.deseado;
  if (activos.length < deseado && ahora >= (g.reintento ?? 0)) {
    const desde = activos.length;
    for (let k = 0; k < deseado - desde; k++) {
      const reemplazo = (g.reemplazos ?? 0) > 0;
      try {
        const plantilla = plantillaLanzamientoDe(estado, g.plantilla.id);
        if (!plantilla) throw errorAws('InvalidLaunchTemplateId.NotFound', `The specified launch template, with template ID ${g.plantilla.id}, does not exist`);
        const version = versionDePlantilla(plantilla, g.plantilla.version);
        if (!version) throw errorAws('InvalidLaunchTemplateId.VersionNotFound', `The specified launch template version ${g.plantilla.version} of template ${plantilla.id} does not exist`);
        const subred = elegirSubred(estado, g);
        // La etiqueta Name del grupo (si se propaga) gana a la de la plantilla.
        const nombre = g.etiquetas.find((e) => e.llave === 'Name' && e.propagar)?.valor ?? version.datos.etiquetas.find((e) => e.llave === 'Name')?.valor ?? '';
        const [inst] = lanzarInstancias(estado, parametrosLanzamiento(estado, version.datos, subred.id, nombre));
        inst.autoscaling = g.nombre;
        g.instancias.push({ id: inst.id, az: inst.az, ciclo: 'Pending', salud: 'Healthy', protegida: Boolean(g.proteccionReduccion), plantillaId: plantilla.id, version: version.numero, lanzada: ahora });
        for (const tg of g.gruposDestino) sinFallar('registrarDestinos', estado, tg, [inst.id]);
        const causa = reemplazo
          ? `At ${isoCorto(ahora)} an instance was launched in response to an unhealthy instance needing to be replaced.`
          : `${g.causa ? `${g.causa} ` : ''}At ${isoCorto(ahora)} an instance was started in response to a difference between desired and actual capacity, increasing the capacity from ${desde} to ${deseado}.`;
        if (reemplazo) g.reemplazos -= 1;
        agregarActividad(estado, g, { descripcion: `Launching a new EC2 instance: ${inst.id}`, causa, instanciaId: inst.id, tipo: 'lanzar', inicio: iso(ahora) });
      } catch (e) {
        if (e?.name !== 'ErrorAws') throw e;
        // Como AWS: la actividad falla, el grupo espera y lo vuelve a intentar.
        agregarActividad(estado, g, {
          estado: 'Failed',
          descripcion: `Launching a new EC2 instance. Status Reason: ${e.message}. Launching EC2 instance failed.`,
          causa: reemplazo
            ? `At ${isoCorto(ahora)} an instance was launched in response to an unhealthy instance needing to be replaced.`
            : `${g.causa ? `${g.causa} ` : ''}At ${isoCorto(ahora)} an instance was started in response to a difference between desired and actual capacity, increasing the capacity from ${desde} to ${deseado}.`,
          tipo: 'lanzar-error',
          inicio: iso(ahora),
          fin: iso(ahora)
        });
        g.reintento = ahora + DURACION_AUTOSCALING.reintento;
        break;
      }
    }
    g.causa = null;
    cambio = true;
  } else if (activos.length > deseado) {
    // Las que salen: primero de la zona con más instancias y, entre ellas, la más vieja.
    const porZona = new Map();
    for (const m of activos) porZona.set(m.az, (porZona.get(m.az) ?? 0) + 1);
    const candidatas = activos.filter((m) => g.estado === 'borrando' || !m.protegida);
    const sobran = Math.min(activos.length - deseado, candidatas.length);
    const desde = activos.length;
    for (let k = 0; k < sobran; k++) {
      candidatas.sort((a, b) => (porZona.get(b.az) ?? 0) - (porZona.get(a.az) ?? 0) || (a.ciclo === 'Pending' ? -1 : 0) - (b.ciclo === 'Pending' ? -1 : 0) || a.lanzada - b.lanzada);
      const m = candidatas.shift();
      porZona.set(m.az, porZona.get(m.az) - 1);
      m.ciclo = 'Terminating';
      for (const tg of g.gruposDestino) sinFallar('quitarDestinos', estado, tg, [m.id]);
      const inst = instanciaDe(estado, m.id);
      if (inst) terminarInstancia(estado, m.id);
      agregarActividad(estado, g, {
        descripcion: `Terminating EC2 instance: ${m.id}`,
        causa: `${g.causa ? `${g.causa} ` : ''}At ${isoCorto(ahora)} an instance was taken out of service in response to a difference between desired and actual capacity, shrinking the capacity from ${desde} to ${deseado}. At ${isoCorto(ahora)} instance ${m.id} was selected for termination.`,
        instanciaId: m.id,
        tipo: 'terminar',
        inicio: iso(ahora)
      });
    }
    if (sobran) cambio = true;
    g.causa = null;
  } else if (g.causa && activos.length === deseado) {
    g.causa = null;
  }
  return cambio;
}

function avanzarAutoScaling(estado, ahora) {
  let cambio = false;
  for (const g of [...estado.autoscaling.grupos]) {
    if (g.estado === 'activo') {
      if (correrProgramadas(estado, g, ahora)) cambio = true;
      if (ajusteSeguimiento(estado, g.nombre, ahora)) cambio = true;
    }
    if (reconciliar(estado, g, ahora)) cambio = true;
    if (g.horaPico && g.horaPico.hasta <= ahora) {
      g.horaPico = null;
      cambio = true;
    }
    // Borrado en dos fases: cuando ya no queda ninguna instancia, el grupo desaparece.
    if (g.estado === 'borrando' && !g.instancias.length) {
      estado.autoscaling.grupos = estado.autoscaling.grupos.filter((x) => x !== g);
      cambio = true;
    }
  }
  return cambio;
}

registrarExtension({
  id: 'autoscaling',
  orden: 20,
  iniciar,
  avanzar(estado, ahora) {
    iniciar(estado);
    return avanzarAutoScaling(estado, ahora);
  },
  funciones: { ejecutarPolitica, ajusteSeguimiento, grupoAutoScalingDe }
});
