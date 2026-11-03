// Rúbrica del laboratorio de la sesión 6 en el simulador · La taquería en hora pico.
//
// Elige «el recurso del alumno» por su nombre y, si no, por lo que hace (la
// plantilla que usa su grupo, el grupo de destino al que manda su balanceador…):
// así un nombre distinto no tumba en cascada las demás tareas. La retro dice qué
// encontró en su cuenta y por qué cuenta o no cuenta.

import {
  ami,
  avanzar,
  colaPermiteServicio,
  confirmarSuscripcion,
  crearAlarma,
  crearBalanceador,
  crearCola,
  crearGrupoAutoScaling,
  crearGrupoDestino,
  crearGrupoSeguridad,
  crearPlantillaLanzamiento,
  crearSuscripcion,
  crearTema,
  publicarMensaje,
  reloj,
  signoComparacion,
  simularCargaAsg,
  subredDe,
  suscribirColaATema,
  terminarInstancia,
  versionDePlantilla
} from '../../public/consola/modelo.js';
import { analizarUserData, gruposPermitenDesde, probarPagina } from '../../public/consola/red.js';
import { LAB, datosLab } from '../../public/labs/lab-s6.js';
import { armar, check, contiene, describirEntrada, httpAbierto, lista, preparar } from './comun.js';

const MICROS = ['t2.micro', 't3.micro'];

/**
 * Dónde repasar cada punto en la Ruta AWS (ver src/repaso.js). Las lecciones
 * de la sesión 6 y los pasos del laboratorio de DataCamp (s6-lab-escalar), que
 * cuenta lo mismo con el balanceador y la alarma negados.
 */
export const REPASO = {
  plantilla: 's6-lab-escalar/2',
  'plantilla/nombre': 's6-lab-escalar/2',
  'plantilla/imagen': 's6-lab-escalar/3',
  'plantilla/red': 's6-lab-escalar/4',
  'plantilla/sg': ['s6-lab-escalar/4', 's2-lab-seguridad/14'],
  'plantilla/script': ['s6-lab-escalar/5', 's1-lab-ec2/9'],

  balanceador: 's6-balanceadores/1',
  'balanceador/tg': ['s6-balanceadores/1', 's6-lab-escalar/8'],
  'balanceador/alb': ['s6-balanceadores/1', 's6-lab-escalar/16'],
  'balanceador/zonas': ['s6-balanceadores/1', 's1-global/1'],
  'balanceador/oyente': 's6-balanceadores/1',
  'balanceador/sg': ['s2-lab-seguridad/14', 's6-balanceadores/1'],

  grupo: 's6-elasticidad/2',
  'grupo/plantilla': ['s6-lab-escalar/6', 's6-elasticidad/2'],
  'grupo/zonas': ['s6-lab-escalar/7', 's1-global/1'],
  'grupo/destino': ['s6-balanceadores/1', 's6-lab-escalar/8'],
  'grupo/salud': ['s6-lab-escalar/8', 's6-balanceadores/1'],
  'grupo/capacidad': ['s6-lab-escalar/9', 's6-elasticidad/2'],
  'grupo/sanos': ['s6-balanceadores/1', 's6-lab-escalar/10'],
  'grupo/pagina': ['s6-lab-escalar/11', 's6-balanceadores/1'],

  politica: 's6-elasticidad/2',
  'politica/tipo': ['s6-elasticidad/2', 's6-lab-escalar/9'],
  'politica/valor': ['s6-lab-escalar/9', 's6-elasticidad/2'],

  alarma: 's6-monitorear/1',
  'alarma/tema': ['s6-serverless/2', 's6-monitorear/1'],
  'alarma/correo': ['s6-serverless/2', 's6-monitorear/1'],
  'alarma/metrica': ['s6-lab-escalar/14', 's6-monitorear/1'],
  'alarma/condicion': ['s6-lab-escalar/15', 's6-monitorear/1'],
  'alarma/accion': ['s6-monitorear/1', 's6-lab-escalar/15'],

  pruebas: 's6-elasticidad/1',
  'pruebas/escalo': ['s6-elasticidad/2', 's6-lab-escalar/13'],
  'pruebas/aviso': ['s6-monitorear/1', 's6-serverless/2'],
  'pruebas/termino': ['s6-lab-escalar/12', 's6-elasticidad/2'],
  'pruebas/reemplazo': ['s6-lab-escalar/12', 's6-elasticidad/2'],

  cola: 's6-serverless/2',
  'cola/cola': 's6-serverless/2',
  'cola/suscrita': 's6-serverless/2',
  'cola/mensaje': 's6-serverless/2'
};

/* ================================================================ ayudas */

const igual = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
const plantillas = (e) => e.autoscaling?.plantillas ?? [];
const gruposAsg = (e) => (e.autoscaling?.grupos ?? []).filter((g) => g.estado === 'activo');
const gruposDestino = (e) => e.elb?.gruposDestino ?? [];
const balanceadores = (e) => (e.elb?.balanceadores ?? []).filter((b) => b.tipo === 'application');
const alarmasPropias = (e) => (e.cloudwatch?.alarmas ?? []).filter((a) => !a.creadaPor);
const temas = (e) => e.sns?.temas ?? [];
const colas = (e) => e.sqs?.colas ?? [];
const zonasDe = (e, subredes) => [...new Set((subredes ?? []).map((id) => subredDe(e, id)?.az).filter(Boolean))];
const nombreSg = (e, id) => {
  const g = e.gruposSeguridad.find((x) => x.id === id);
  return g ? `${g.nombre} (${g.id})` : id;
};
const arnsOyentes = (b) => b.oyentes.flatMap((o) => [o.accion?.tipo === 'forward' ? o.accion.tgArn : null, ...(o.reglas ?? []).map((r) => r.tgArn)]).filter(Boolean);

/**
 * Los recursos «del alumno», en este orden: plantilla, grupo de destino,
 * balanceador, grupo de Auto Scaling, tema y alarma. Primero por el nombre
 * pedido; si no está, el que cumple la función (el que usa su grupo, al que
 * manda su balanceador…).
 */
function elegir(e, x) {
  const porNombre = (lista, nombre) => lista.find((r) => igual(r.nombre, nombre)) ?? null;

  let asg = porNombre(gruposAsg(e), x.asg);
  let plantilla = porNombre(plantillas(e), x.plantilla);
  let tg = porNombre(gruposDestino(e), x.tg);
  let alb = porNombre(balanceadores(e), x.alb);

  if (!asg) {
    const candidatos = gruposAsg(e);
    asg =
      candidatos.find((g) => plantilla && g.plantilla.id === plantilla.id) ??
      candidatos.find((g) => tg && g.gruposDestino.includes(tg.arn)) ??
      candidatos[0] ??
      null;
  }
  if (!plantilla && asg) plantilla = plantillas(e).find((p) => p.id === asg.plantilla.id) ?? null;
  if (!plantilla) plantilla = plantillas(e)[0] ?? null;
  if (!tg) {
    tg =
      (asg && gruposDestino(e).find((g) => asg.gruposDestino.includes(g.arn))) ??
      (alb && gruposDestino(e).find((g) => arnsOyentes(alb).includes(g.arn))) ??
      gruposDestino(e)[0] ??
      null;
  }
  if (!alb) alb = (tg && balanceadores(e).find((b) => arnsOyentes(b).includes(tg.arn))) ?? balanceadores(e)[0] ?? null;

  // La versión de la plantilla que cuenta: la que usa el grupo (si es esa plantilla); si no, la Default.
  const version = plantilla ? versionDePlantilla(plantilla, asg && asg.plantilla.id === plantilla.id ? asg.plantilla.version : '$Default') : null;

  const alarma =
    porNombre(alarmasPropias(e), x.alarma) ??
    alarmasPropias(e).find((a) => a.metrica.nombre === 'CPUUtilization' && asg && a.metrica.dimensiones.AutoScalingGroupName === asg.nombre) ??
    alarmasPropias(e).find((a) => a.metrica.nombre === 'CPUUtilization') ??
    null;
  const tema =
    porNombre(temas(e), x.tema) ?? (alarma && temas(e).find((t) => (alarma.acciones.ALARM ?? []).includes(t.arn))) ?? temas(e).find((t) => t.suscripciones.some((s) => s.protocolo === 'email')) ?? null;

  return { asg, plantilla, version, tg, alb, alarma, tema };
}

/** «Encontré X, pero se pidió Y» cuando el recurso elegido no tiene el nombre pedido. */
const otroNombre = (r, pedido, que) => (r && !igual(r.nombre, pedido) ? ` (Revisé tu ${que} «${r.nombre}»; se pidió el nombre ${pedido}. No cuenta puntos, pero ayuda a tu docente a encontrarlo.)` : '');

/* ============================================================ plantilla */

function revisarPlantilla(e, x, el) {
  const { plantilla: p, version: v, alb } = el;
  const datos = v?.datos ?? null;
  const t = {
    nombre: `Existe la plantilla de lanzamiento «${x.plantilla}»`,
    imagen: 'Amazon Linux 2023 en t2.micro o t3.micro',
    red: "La subred no va en la plantilla (Don't include in launch template)",
    sg: 'Su grupo de seguridad deja entrar HTTP (80) desde el balanceador',
    script: `El user data instala Apache y escribe la página de la «${x.textoSucursal}»`
  };
  if (!p) {
    const r = 'Todavía no hay ninguna plantilla de lanzamiento. Créala en EC2 → Launch Templates → Create launch template: es la receta que usa Auto Scaling para lanzar cada instancia.';
    return [check('nombre', t.nombre, 2, false, r), check('imagen', t.imagen, 2, false, r), check('red', t.red, 2, false, r), check('sg', t.sg, 2, false, r), check('script', t.script, 4, false, r)];
  }

  const exacta = igual(p.nombre, x.plantilla);
  const nombre = check(
    'nombre',
    t.nombre,
    2,
    exacta,
    exacta
      ? `Tu plantilla ${p.nombre} (${p.id}) va en la versión ${p.ultimaVersion}${p.guia ? ', con Auto Scaling guidance' : ''}. Una plantilla tiene versiones: para cambiar la receta creas una versión nueva, no la editas.`
      : `Encontré la plantilla «${p.nombre}» (${p.id}), pero se pidió exactamente «${x.plantilla}». El nombre de una plantilla no se puede cambiar: crea otra con el nombre exacto (los demás puntos se revisaron en «${p.nombre}», versión ${v?.numero ?? '?'}).`
  );

  const imagen = ami(datos.ami);
  const okImg = imagen?.clave === 'al2023' && MICROS.includes(datos.tipo);
  const cImagen = check(
    'imagen',
    t.imagen,
    2,
    okImg,
    okImg
      ? `La receta usa ${imagen.nombre} en ${datos.tipo}: capa gratuita y suficiente para una página. Para aguantar más no hace falta una instancia más grande: el grupo abre más copias (escalar horizontal).`
      : `La versión ${v.numero} de tu plantilla usa ${imagen?.nombre ?? datos.ami} en ${datos.tipo}; se pidió Amazon Linux 2023 en t2.micro o t3.micro. Crea una versión nueva (Actions → Modify template (Create new version)) y déjala como Default (Actions → Set default version).`
  );

  const okRed = !datos.subredId;
  const cRed = check(
    'red',
    t.red,
    2,
    okRed,
    okRed
      ? 'La plantilla no fija subred: así el grupo de Auto Scaling decide en qué zona lanza cada instancia y puede repartirlas en dos.'
      : `La versión ${v.numero} de tu plantilla fija la subred ${datos.subredId}${subredDe(e, datos.subredId) ? ` (${subredDe(e, datos.subredId).az})` : ''}. Con Auto Scaling guidance la consola te pide no incluirla: la subred la decide el grupo. Crea una versión nueva con Subnet: «Don't include in launch template».`
  );

  const grupos = datos.gruposSeguridad ?? [];
  const desdeAlb = alb ? gruposPermitenDesde(e, grupos, 'tcp', 80, { grupos: alb.gruposSeguridad }) : { permite: false };
  const desdeInternet = gruposPermitenDesde(e, grupos, 'tcp', 80, { ip: '8.8.8.8' });
  const soloSg = grupos.some((id) => (e.gruposSeguridad.find((g) => g.id === id)?.entrada ?? []).some((r) => String(r.origen).startsWith('sg-') && r.protocolo !== 'icmp'));
  const okSg = grupos.length > 0 && (desdeAlb.permite || desdeInternet.permite || (!alb && soloSg));
  let retroSg;
  if (!grupos.length) retroSg = "Tu plantilla no trae grupo de seguridad, así que las instancias quedan con el de omisión de la VPC, que no deja entrar el puerto 80 desde el balanceador: los destinos salen unhealthy. Crea una versión nueva con un grupo (por ejemplo web-sg) que deje entrar HTTP (80).";
  else if (desdeAlb.permite && desdeAlb.regla?.origen?.startsWith('sg-')) retroSg = `${nombreSg(e, desdeAlb.grupo.id)} deja entrar el 80 solo desde el grupo del balanceador (${desdeAlb.regla.origen}). Es lo mejor: nadie se salta la puerta, todo cliente pasa por el balanceador.`;
  else if (okSg) retroSg = `${lista(grupos.map((id) => nombreSg(e, id)))} deja entrar el 80 desde ${desdeInternet.regla?.origen ?? 'el balanceador'}. Funciona. Aún mejor: que el origen sea el grupo ${x.sgAlb}, así nadie puede saltarse el balanceador y entrar directo a una instancia.`;
  else retroSg = `Los grupos de tu plantilla (${lista(grupos.map((id) => nombreSg(e, id)))}) dejan entrar: ${describirEntrada(e, grupos)}. Falta HTTP (80), y sin él el health check del balanceador nunca llega a Apache. Agrega la regla en EC2 → Security Groups → Edit inbound rules (origen: el grupo ${x.sgAlb} o 0.0.0.0/0).`;
  // No quita puntos (la tarea no lo pide), pero la retro no calla el SSH abierto
  // que el asistente de grupos trae por omisión.
  const sshAbierto = gruposPermitenDesde(e, grupos, 'tcp', 22, { ip: '8.8.8.8' });
  if (sshAbierto.permite) {
    retroSg += ` Ojo: ${nombreSg(e, sshAbierto.grupo.id)} además deja entrar SSH (22) desde ${sshAbierto.regla.origen}${sshAbierto.regla.origen === '0.0.0.0/0' ? ', o sea, desde todo internet' : ''}. Aquí nadie entra por SSH: borra esa regla en EC2 → Security Groups → Edit inbound rules.`;
  }
  const cSg = check('sg', t.sg, 2, okSg, retroSg);

  const falsa = { id: 'i-0plantilla000000', ami: datos.ami, tipo: datos.tipo, az: 'us-east-1a', ipPrivada: '172.31.0.10', ipPublica: null, userData: datos.userData };
  const ud = analizarUserData(falsa);
  const pagina = Object.entries(ud.paginas).find(([ruta]) => ruta === '/var/www/html/index.html')?.[1] ?? '';
  const apache = ud.corriendo.includes('httpd');
  const okScript = ud.corrio && apache && contiene(pagina, x.textoSucursal);
  let retroScript;
  if (okScript) retroScript = 'El script empieza con #!/bin/bash, instala httpd, escribe la página de tu sucursal y deja Apache corriendo. Cada instancia nueva del grupo lo corre en su primer arranque: todas salen iguales.';
  else if (!String(datos.userData ?? '').trim()) retroScript = `La versión ${v.numero} de tu plantilla no tiene user data: las instancias arrancan sin Apache y el balanceador las marca unhealthy. Crea una versión nueva con el script de la tarea en Advanced details → User data.`;
  else if (ud.problemas.length) retroScript = `El script de tu plantilla tiene problemas: ${ud.problemas.join(' ')} Cópialo tal cual de la tarea en una versión nueva.`;
  else if (!apache) retroScript = 'El script no deja Apache (httpd) instalado y corriendo. Cópialo tal cual de la tarea en una versión nueva de la plantilla.';
  else retroScript = `Apache sí queda corriendo, pero la página no dice «${x.textoSucursal}». Copia el script de la tarea tal cual (trae tu sufijo) en una versión nueva de la plantilla.`;
  const cScript = check('script', t.script, 4, okScript, retroScript);

  return [nombre, cImagen, cRed, cSg, cScript];
}

/* ========================================================== balanceador */

function revisarBalanceador(e, x, el) {
  const { tg, alb } = el;
  const t = {
    tg: `Un grupo de destino de instancias HTTP:80 con health check en / (${x.tg})`,
    alb: `Un Application Load Balancer internet-facing y activo (${x.alb})`,
    zonas: 'El balanceador está en al menos dos zonas de disponibilidad',
    oyente: `Su listener HTTP:80 hace Forward al grupo de destino`,
    sg: 'El grupo de seguridad del balanceador deja entrar HTTP (80) desde 0.0.0.0/0'
  };
  const checks = [];

  if (!tg) {
    checks.push(check('tg', t.tg, 5, false, 'Todavía no hay ningún grupo de destino. Créalo en EC2 → Target Groups → Create target group (tipo Instances, HTTP 80). Es la lista de instancias entre las que el balanceador reparte.'));
  } else {
    const ok = tg.tipoDestino === 'instance' && tg.protocolo === 'HTTP' && tg.puerto === 80 && tg.chequeo?.protocolo === 'HTTP' && tg.chequeo?.ruta === '/';
    checks.push(
      check(
        'tg',
        t.tg,
        5,
        ok,
        ok
          ? `${tg.nombre} es de tipo instance, HTTP:80, y revisa la salud pidiendo «/» a cada instancia. El grupo de Auto Scaling le agrega y le quita instancias solo.${otroNombre(tg, x.tg, 'grupo de destino')}`
          : `Tu grupo de destino ${tg.nombre} es ${tg.tipoDestino}, ${tg.protocolo}:${tg.puerto}, con health check ${tg.chequeo?.protocolo ?? '?'} ${tg.chequeo?.ruta ?? ''}. Se pidió Instances, HTTP:80 y health check HTTP en «/». El protocolo y el puerto no se cambian: crea otro grupo de destino.`
      )
    );
  }

  if (!alb) {
    const r = 'Todavía no hay ningún Application Load Balancer. Créalo en EC2 → Load Balancers → Create load balancer → Application Load Balancer.';
    checks.push(check('alb', t.alb, 4, false, r), check('zonas', t.zonas, 3, false, r), check('oyente', t.oyente, 4, false, r), check('sg', t.sg, 4, false, r));
    return checks;
  }

  const okAlb = alb.esquema === 'internet-facing' && alb.estado === 'active';
  checks.push(
    check(
      'alb',
      t.alb,
      4,
      okAlb,
      okAlb
        ? `${alb.nombre} está Active y es internet-facing: su DNS (${alb.dns}) es la única dirección que necesitan tus clientes, aunque haya 2 o 4 instancias detrás.${otroNombre(alb, x.alb, 'balanceador')}`
        : alb.esquema !== 'internet-facing'
          ? `${alb.nombre} es internal: su DNS solo se alcanza desde dentro de la VPC. Para una página pública debe ser Internet-facing, y el esquema no se cambia: crea otro.`
          : `${alb.nombre} todavía está ${alb.estado}. Espera unos segundos a que pase a Active.`
    )
  );

  const zonas = zonasDe(e, alb.subredes);
  const okZonas = zonas.length >= 2;
  checks.push(check('zonas', t.zonas, 3, okZonas, okZonas ? `${alb.nombre} está en ${zonas.join(' y ')}: si se cae una zona entera, sigue atendiendo desde la otra.` : `${alb.nombre} solo está en ${lista(zonas)}. Un ALB necesita dos zonas o más; agrégale otra en la pestaña Network mapping → Edit subnets.`));

  const oyente = alb.oyentes.find((o) => o.protocolo === 'HTTP' && o.puerto === 80);
  const okOyente = Boolean(oyente && tg && oyente.accion?.tipo === 'forward' && oyente.accion.tgArn === tg.arn);
  let retroOyente;
  if (okOyente) retroOyente = `El listener HTTP:80 de ${alb.nombre} manda todo a ${tg.nombre}: el balanceador escucha en la puerta y pasa cada cliente a una instancia sana.`;
  else if (!oyente) retroOyente = `${alb.nombre} no tiene listener HTTP:80 (tiene: ${lista(alb.oyentes.map((o) => `${o.protocolo}:${o.puerto}`), 'ninguno')}). Agrégalo en la pestaña Listeners and rules → Add listener, con Forward to tu grupo de destino.`;
  else if (!tg) retroOyente = 'Falta el grupo de destino al cual mandar el tráfico.';
  else retroOyente = `El listener HTTP:80 de ${alb.nombre} no manda a ${tg.nombre}${oyente.accion?.tgArn ? ` (manda a ${gruposDestino(e).find((g) => g.arn === oyente.accion.tgArn)?.nombre ?? oyente.accion.tgArn})` : ''}. Edítalo en Listeners and rules para que haga Forward a ${tg.nombre}, el grupo que llena tu Auto Scaling.`;
  checks.push(check('oyente', t.oyente, 4, okOyente, retroOyente));

  const okSg = alb.gruposSeguridad.length > 0 && httpAbierto(e, alb.gruposSeguridad, x.ipCasa);
  checks.push(
    check(
      'sg',
      t.sg,
      4,
      okSg,
      okSg
        ? `${lista(alb.gruposSeguridad.map((id) => nombreSg(e, id)))} deja entrar el 80 desde cualquier IP: el balanceador es la puerta pública. Las instancias pueden quedarse cerradas al mundo.`
        : `Los grupos de ${alb.nombre} (${lista(alb.gruposSeguridad.map((id) => nombreSg(e, id)))}) dejan entrar: ${describirEntrada(e, alb.gruposSeguridad)}. Falta HTTP (80) desde 0.0.0.0/0: sin eso, nadie de afuera llega al balanceador. Si lo creaste desde el asistente del grupo, quedó con el grupo «default» de la VPC; cámbialo en la pestaña Security → Edit o agrega la regla.`
    )
  );
  return checks;
}

/* ================================================================ grupo */

function explicarPaginaAlb(r, alb) {
  const fallo = r.diagnostico.find((p) => !p.ok);
  const codigo = r.codigoHttp ?? r.error?.codigo ?? 'un error';
  const base = `Al abrir http://${alb.dns} desde tu casa sale ${codigo}.`;
  if (!fallo) return base;
  let consejo = '';
  if (fallo.paso === 'Destinos') consejo = ' Ningún destino está healthy: revisa en Target Groups → Targets por qué (el grupo de seguridad de las instancias, que Apache arranque con el user data).';
  else if (fallo.paso === 'Grupo de seguridad de la instancia') consejo = ' El balanceador no llega a la instancia: su grupo de seguridad debe dejar entrar el 80 desde el grupo del balanceador (o desde 0.0.0.0/0).';
  else if (fallo.paso === 'Servidor web') consejo = ' La instancia no tiene Apache corriendo: revisa el user data de la plantilla.';
  else if (fallo.paso === 'Grupo de seguridad del balanceador') consejo = ' Agrega HTTP (80) desde 0.0.0.0/0 al grupo de seguridad del balanceador.';
  else if (fallo.paso === 'Balanceador') consejo = ' Espera a que el balanceador pase a Active.';
  return `${base} Se atoró en «${fallo.paso}»: ${fallo.detalle}${consejo}`;
}

function revisarGrupo(e, x, el) {
  const { asg, plantilla, tg, alb } = el;
  const t = {
    plantilla: `Un grupo de Auto Scaling (${x.asg}) que lanza con tu plantilla`,
    zonas: 'El grupo reparte sus instancias en dos zonas de disponibilidad',
    destino: 'El grupo está conectado al grupo de destino del balanceador',
    salud: 'El grupo usa también el health check del balanceador (ELB)',
    capacidad: `Mínimo ${x.minimo}, deseado de ${x.deseado} a ${x.maximo} y máximo ${x.maximo}`,
    sanos: 'Al menos dos instancias healthy en el grupo de destino',
    pagina: `El DNS del balanceador abre la página de la «${x.textoSucursal}»`
  };

  const checks = [];
  if (!asg) {
    const r = 'Todavía no hay ningún grupo de Auto Scaling. Créalo en EC2 → Auto Scaling Groups → Create Auto Scaling group, con tu plantilla.';
    checks.push(
      check('plantilla', t.plantilla, 4, false, r),
      check('zonas', t.zonas, 3, false, r),
      check('destino', t.destino, 3, false, r),
      check('salud', t.salud, 2, false, r),
      check('capacidad', t.capacidad, 3, false, r)
    );
  } else {
    const okPl = Boolean(plantilla && asg.plantilla.id === plantilla.id);
    checks.push(
      check(
        'plantilla',
        t.plantilla,
        4,
        okPl,
        okPl
          ? `${asg.nombre} lanza cada instancia con ${plantilla.nombre} (versión ${asg.plantilla.version === '$Default' ? 'Default' : asg.plantilla.version === '$Latest' ? 'Latest' : asg.plantilla.version}): todas salen iguales.${otroNombre(asg, x.asg, 'grupo')}`
          : `${asg.nombre} usa la plantilla ${plantillas(e).find((p) => p.id === asg.plantilla.id)?.nombre ?? asg.plantilla.id}, no ${plantilla?.nombre ?? x.plantilla}. Cámbiala en el detalle del grupo → Launch template → Edit.`
      )
    );

    const zonas = zonasDe(e, asg.subredes);
    const okZonas = zonas.length >= 2;
    checks.push(
      check(
        'zonas',
        t.zonas,
        3,
        okZonas,
        okZonas
          ? `${asg.nombre} usa subredes en ${zonas.join(' y ')}: reparte las instancias y, si una zona se cae, lanza las que falten en la otra.`
          : `${asg.nombre} solo tiene subredes en ${lista(zonas)}. Con una sola zona, si esa zona falla se cae todo. Agrega la otra en el detalle → Network → Edit.`
      )
    );

    const okDestino = Boolean(tg && asg.gruposDestino.includes(tg.arn) && alb && arnsOyentes(alb).includes(tg.arn));
    let retroDestino;
    if (okDestino) retroDestino = `${asg.nombre} registra solas sus instancias en ${tg.nombre}, y ${alb.nombre} reparte entre ellas. Cuando el grupo lanza o termina una, el balanceador se entera sin que hagas nada.`;
    else if (!asg.gruposDestino.length) retroDestino = `${asg.nombre} no está conectado a ningún grupo de destino: el balanceador no sabe que existen sus instancias. En el detalle del grupo, pestaña Integrations → Load balancing → Edit, elige ${tg?.nombre ?? x.tg}.`;
    else if (!tg || !asg.gruposDestino.includes(tg.arn)) retroDestino = `${asg.nombre} está conectado a ${lista(asg.gruposDestino.map((arn) => gruposDestino(e).find((g) => g.arn === arn)?.nombre ?? arn))}, pero tu balanceador manda a ${tg?.nombre ?? 'otro grupo'}. Deben ser el mismo grupo de destino.`;
    else retroDestino = `${asg.nombre} sí registra sus instancias en ${tg.nombre}, pero ningún listener de tu balanceador manda tráfico a ese grupo. Revisa la tarea del balanceador.`;
    checks.push(check('destino', t.destino, 3, okDestino, retroDestino));

    const okSalud = asg.tipoSalud === 'ELB';
    checks.push(
      check(
        'salud',
        t.salud,
        2,
        okSalud,
        okSalud
          ? `${asg.nombre} usa el health check EC2 y también el del balanceador (ELB): si Apache deja de contestar, aunque la instancia siga prendida, el grupo la reemplaza.`
          : `${asg.nombre} solo usa el health check EC2: reemplaza una instancia apagada o terminada, pero no una prendida cuyo Apache no contesta. En el detalle → Health checks → Edit, marca Elastic Load Balancing health checks.`
      )
    );

    const okCap = asg.min === x.minimo && asg.max === x.maximo && asg.deseado >= x.minimo && asg.deseado <= x.maximo;
    checks.push(
      check(
        'capacidad',
        t.capacidad,
        3,
        okCap,
        okCap
          ? `Mínimo ${asg.min}, deseado ${asg.deseado} y máximo ${asg.max}: nunca menos de ${asg.min} cajas abiertas (una por zona) y nunca más de ${asg.max}, que es tu tope de gasto.`
          : `${asg.nombre} tiene mínimo ${asg.min}, deseado ${asg.deseado} y máximo ${asg.max}; se pidió mínimo ${x.minimo}, deseado ${x.deseado} y máximo ${x.maximo}. Cámbialo en el detalle del grupo → Capacity overview → Edit.`
      )
    );
  }

  const sanos = tg ? tg.destinos.filter((d) => d.salud === 'healthy') : [];
  const okSanos = sanos.length >= 2;
  let retroSanos;
  if (okSanos) retroSanos = `${tg.nombre} tiene ${sanos.length} destinos healthy (${sanos.map((d) => d.id).join(', ')}). El balanceador solo manda clientes a esos.`;
  else if (!tg) retroSanos = 'Sin grupo de destino no hay destinos que revisar.';
  else if (!tg.destinos.length) retroSanos = `${tg.nombre} no tiene destinos registrados. Conecta el grupo de Auto Scaling a este grupo de destino y él registrará sus instancias.`;
  else {
    const malo = tg.destinos.find((d) => d.salud === 'unhealthy');
    const cuenta = tg.destinos.map((d) => `${d.id} ${d.salud}`).join(', ');
    // El grupo con chequeo ELB reemplaza una y otra vez las que el balanceador marca unhealthy.
    const ciclando = (asg?.actividad ?? []).filter((y) => /ELB system health check failure/.test(y.causa ?? '')).length >= 2;
    if (malo?.motivo) retroSanos = `${tg.nombre} tiene: ${cuenta}. ${malo.id} falla por ${malo.motivo.codigo} («${malo.motivo.descripcion}»): revisa que el grupo de seguridad de las instancias deje entrar el 80 desde el balanceador y que el user data de la plantilla instale Apache.`;
    else if (ciclando) retroSanos = `${tg.nombre} tiene: ${cuenta}. El grupo está reemplazando instancias una y otra vez porque el balanceador las marca unhealthy (míralo en Activity): ninguna llega a contestar en el puerto 80. Revisa el grupo de seguridad de la plantilla (HTTP 80 desde el balanceador) y su user data; corrige con una versión nueva de la plantilla.`;
    else if (tg.destinos.some((d) => d.salud === 'initial')) retroSanos = `${tg.nombre} tiene: ${cuenta}. Las que dicen initial están pasando sus primeros health checks: espera unos segundos y vuelve a revisar.`;
    else retroSanos = `${tg.nombre} tiene: ${cuenta}. Se piden al menos dos healthy: con mínimo y deseado de ${x.minimo}, el grupo mantiene dos instancias (una por zona).`;
  }
  checks.push(check('sanos', t.sanos, 3, okSanos, retroSanos));

  let okPagina = false;
  let retroPagina;
  if (!alb) retroPagina = 'Sin balanceador no hay dirección que abrir.';
  else {
    const r = probarPagina(e, `http://${alb.dns}`, { turno: 0 });
    const abre = r.resultado === 'ok' && r.codigoHttp === 200;
    okPagina = abre && contiene(r.html, x.textoSucursal);
    if (okPagina) retroPagina = `http://${alb.dns} abre la página de tu sucursal desde tu casa. Atrás hay varias instancias, pero el cliente solo conoce una dirección: la del balanceador.`;
    else if (abre) retroPagina = `http://${alb.dns} abre, pero la página no dice «${x.textoSucursal}». Usa el script de la tarea tal cual en tu plantilla; las instancias que ya existen no cambian solas (termínalas y el grupo lanzará otras con la versión nueva).`;
    else retroPagina = explicarPaginaAlb(r, alb);
  }
  checks.push(check('pagina', t.pagina, 5, okPagina, retroPagina));
  return checks;
}

/* ============================================================== política */

function revisarPolitica(e, x, el) {
  const { asg } = el;
  const t = {
    tipo: 'Una política de seguimiento de objetivo (target tracking) sobre la CPU promedio',
    valor: `La meta de CPU de la política es ${x.objetivoCpu} %`
  };
  if (!asg) {
    const r = 'Primero necesitas el grupo de Auto Scaling: la política vive dentro de él.';
    return [check('tipo', t.tipo, 5, false, r), check('valor', t.valor, 5, false, r)];
  }
  const tt = asg.politicas.filter((p) => p.tipo === 'TargetTrackingScaling' && p.habilitada !== false);
  const cpu = tt.filter((p) => p.metrica === 'ASGAverageCPUUtilization');
  const pol = cpu.find((p) => Number(p.objetivo) === x.objetivoCpu) ?? cpu[0] ?? null;
  let retroTipo;
  if (pol) retroTipo = `${asg.nombre} tiene la política «${pol.nombre}» (Target tracking, Average CPU utilization). Por dentro creó ${pol.alarmas?.length ? `las alarmas ${pol.alarmas.join(' y ')}` : 'sus alarmas de CloudWatch'}: la AlarmHigh agrega instancias y la AlarmLow las quita.`;
  else if (tt.length) retroTipo = `La política «${tt[0].nombre}» sigue la métrica ${tt[0].metrica}, no la CPU promedio. Crea otra con Metric type: Average CPU utilization.`;
  else if (asg.politicas.length) retroTipo = `${asg.nombre} tiene la política «${asg.politicas[0].nombre}» de tipo ${asg.politicas[0].tipo}${asg.politicas[0].habilitada === false ? ' (deshabilitada)' : ''}. Se pidió una de seguimiento de objetivo: el grupo calcula solo cuántas instancias hacen falta, como un termostato.`;
  else retroTipo = `${asg.nombre} no tiene políticas de escalado: nunca crece solo. Crea una en la pestaña Automatic scaling → Create dynamic scaling policy → Target tracking scaling.`;
  const okValor = Boolean(pol && Number(pol.objetivo) === x.objetivoCpu);
  return [
    check('tipo', t.tipo, 5, Boolean(pol), retroTipo),
    check(
      'valor',
      t.valor,
      5,
      okValor,
      okValor
        ? `Target value ${x.objetivoCpu}: cuando la CPU promedio del grupo pasa de ${x.objetivoCpu} %, abre cajas; cuando baja bastante, las cierra (sin bajar del mínimo).`
        : pol
          ? `Tu política busca ${pol.objetivo} %; se pidió ${x.objetivoCpu} %. Edítala en Automatic scaling → selecciona la política → Actions → Edit.`
          : 'Sin la política de CPU no hay meta que revisar.'
    )
  ];
}

/* ================================================================ alarma */

function revisarAlarma(e, x, el) {
  const { asg, alarma: a, tema } = el;
  const t = {
    tema: `Un tema de SNS Standard (${x.tema})`,
    correo: 'Una suscripción Email al tema, ya confirmada',
    metrica: `La alarma vigila CPUUtilization (Average, 5 minutos) del grupo ${asg?.nombre ?? x.asg}`,
    condicion: `Se enciende cuando la CPU es mayor que ${x.umbral}`,
    accion: 'Cuando está In alarm avisa al tema de SNS'
  };
  const checks = [];

  const okTema = Boolean(tema && tema.tipo === 'Standard');
  checks.push(
    check(
      'tema',
      t.tema,
      2,
      okTema,
      okTema
        ? `El tema ${tema.nombre} es el altavoz: lo que se publica en él llega a todos sus suscriptores (un correo, una cola, una función…).${otroNombre(tema, x.tema, 'tema')}`
        : tema
          ? `Tu tema ${tema.nombre} es FIFO; los FIFO no mandan correos. Crea uno Standard.`
          : 'Todavía no hay ningún tema de SNS. Créalo en Simple Notification Service → Topics → Create topic (Type: Standard).'
    )
  );

  const correos = tema ? tema.suscripciones.filter((s) => s.protocolo === 'email') : [];
  const confirmada = correos.find((s) => s.estado === 'Confirmed');
  checks.push(
    check(
      'correo',
      t.correo,
      3,
      Boolean(confirmada),
      confirmada
        ? `${confirmada.endpoint} está Confirmed. SNS exige confirmar para no mandar correos a quien no los pidió.`
        : correos.length
          ? `${correos[0].endpoint} sigue en Pending confirmation: así no le llega ningún aviso. Abre la Bandeja de correo (simulada) y pulsa Confirm subscription en el correo de AWS Notifications.`
          : tema
            ? `${tema.nombre} no tiene suscripciones de correo. Créala en el tema → Create subscription (Protocol: Email).`
            : 'Sin tema no hay suscripción.'
    )
  );

  if (!a) {
    const r = 'Todavía no hay una alarma tuya en CloudWatch (las TargetTracking-… las creó la política, no cuentan). Créala en CloudWatch → Alarms → Create alarm.';
    checks.push(check('metrica', t.metrica, 4, false, r), check('condicion', t.condicion, 3, false, r), check('accion', t.accion, 3, false, r));
    return checks;
  }

  const m = a.metrica;
  const dims = Object.keys(m.dimensiones);
  const okDim = Boolean(asg && dims.length === 1 && m.dimensiones.AutoScalingGroupName === asg.nombre);
  const okMet = m.namespace === 'AWS/EC2' && m.nombre === 'CPUUtilization' && okDim && a.estadistica === 'Average' && a.periodo === 300;
  let retroMet;
  if (okMet) retroMet = `${a.nombre} vigila el promedio de CPU de todas las instancias de ${asg.nombre} cada 5 minutos: aunque el grupo cambie de instancias, la alarma sigue al grupo.${otroNombre(a, x.alarma, 'alarma')}`;
  else if (m.namespace !== 'AWS/EC2' || m.nombre !== 'CPUUtilization') retroMet = `${a.nombre} vigila ${m.namespace} ${m.nombre}; se pidió AWS/EC2 CPUUtilization. Edítala (Actions → Edit) y elige la métrica en EC2 → By Auto Scaling Group.`;
  else if (!okDim) retroMet = `${a.nombre} vigila CPUUtilization con ${dims.length ? dims.map((k) => `${k} = ${m.dimensiones[k]}`).join(', ') : 'todas las instancias juntas'}; se pidió la del grupo (AutoScalingGroupName = ${asg?.nombre ?? x.asg}). Si vigilas una sola instancia, la alarma se queda ciega cuando el grupo la reemplaza.`;
  else retroMet = `${a.nombre} usa ${a.estadistica} cada ${a.periodo / 60 >= 1 ? `${a.periodo / 60} minuto(s)` : `${a.periodo} s`}; se pidió Average cada 5 minutes (el periodo del monitoreo básico de EC2).`;
  checks.push(check('metrica', t.metrica, 4, okMet, retroMet));

  const mayor = a.comparacion === 'GreaterThanThreshold' || a.comparacion === 'GreaterThanOrEqualToThreshold';
  const okCond = mayor && Number(a.umbral) === x.umbral;
  checks.push(
    check(
      'condicion',
      t.condicion,
      3,
      okCond,
      okCond
        ? `Se enciende con CPU ${a.comparacion === 'GreaterThanThreshold' ? '>' : '>='} ${a.umbral} durante ${a.puntos} de ${a.evaluaciones} periodo(s). Nota que es más alto que la meta de la política: primero el grupo intenta resolverlo solo, y si aun así la cocina sigue al rojo, se avisa al gerente.`
        : `${a.nombre} se enciende cuando la CPU es ${signoComparacion(a.comparacion)} ${a.umbral}; se pidió Greater (>) que ${x.umbral}.${mayor ? '' : ' Con «Lower» la alarma se prendería cuando la cocina está tranquila, justo al revés.'}`
    )
  );

  const alarmaArns = a.acciones.ALARM ?? [];
  const okAccion = Boolean(tema && alarmaArns.includes(tema.arn) && a.accionesActivas !== false);
  let retroAccion;
  if (okAccion) retroAccion = `Al pasar a In alarm, ${a.nombre} publica en ${tema.nombre} y SNS reparte el correo. CloudWatch mide y decide; SNS avisa.`;
  else if (!alarmaArns.length) retroAccion = `${a.nombre} no tiene acciones para el estado In alarm: se prende sin avisar a nadie. Edítala y en Configure actions agrega Notification → In alarm → tu tema.`;
  else if (a.accionesActivas === false) retroAccion = `Las acciones de ${a.nombre} están deshabilitadas (Actions → Enable actions).`;
  else retroAccion = `Al pasar a In alarm, ${a.nombre} avisa a ${lista(alarmaArns)}, no al tema ${tema?.nombre ?? x.tema}.`;
  checks.push(check('accion', t.accion, 3, okAccion, retroAccion));
  return checks;
}

/* ================================================================ pruebas */

function revisarPruebas(e, x, el) {
  const { asg, alarma: a, tema } = el;
  const t = {
    escalo: 'En la hora pico el grupo creció solo por su política (alarma AlarmHigh)',
    aviso: 'Te llegó el correo ALARM de tu alarma de CPU',
    termino: 'El grupo detectó una instancia caída por el health check y la sacó',
    reemplazo: 'El grupo lanzó otra instancia para reemplazarla'
  };
  const act = asg?.actividad ?? [];

  const crece = (causa) => {
    const m = /monitor alarm \S*AlarmHigh\S* in state ALARM triggered policy .* changing the desired capacity from (\d+) to (\d+)/.exec(causa ?? '');
    return Boolean(m && Number(m[2]) > Number(m[1]));
  };
  const creciendo = act.find((y) => crece(y.causa));
  // Respaldo: Activity guarda las 60 más nuevas; la bitácora (CloudTrail) guarda más.
  const enBitacora =
    !creciendo &&
    asg &&
    (e.bitacora ?? []).some((b) => b.accion === 'ExecutePolicy' && String(b.detalle).startsWith(`${asg.nombre}:`) && Number(/deseado (\d+)/.exec(b.detalle)?.[1]) > asg.min);
  let retroEscalo;
  if (creciendo) retroEscalo = `En Activity: «${creciendo.descripcion}». La causa dice que la alarma AlarmHigh disparó tu política: eso es elasticidad, crecer solo cuando hace falta.`;
  else if (enBitacora) retroEscalo = 'Tu política subió la capacidad deseada en la hora pico (se ve en CloudTrail, evento ExecutePolicy): eso es elasticidad, crecer solo cuando hace falta.';
  else if (!asg) retroEscalo = 'Primero necesitas el grupo de Auto Scaling con su política.';
  else if (asg.horaPico) retroEscalo = 'La hora pico está corriendo: espera un minuto (la AlarmHigh necesita 3 periodos arriba de la meta, 30 segundos en el simulador) y vuelve a revisar.';
  else if (!asg.politicas.some((p) => p.tipo === 'TargetTrackingScaling')) retroEscalo = `Sin política de seguimiento de objetivo, ${asg.nombre} no crece solo. Haz primero la tarea de la política y luego pulsa «Simular hora pico».`;
  else if (asg.max <= asg.min) retroEscalo = `${asg.nombre} tiene máximo ${asg.max} y mínimo ${asg.min}: no tiene a dónde crecer. Sube el máximo a ${x.maximo}.`;
  else retroEscalo = `No veo en Activity ninguna instancia lanzada por la AlarmHigh. En el detalle de ${asg.nombre} pulsa «Simular hora pico» y espera uno o dos minutos.`;

  // El correo: en la Bandeja simulada o, si lo borró, en el historial de la alarma.
  const correo = a && (e.sns?.buzon ?? []).find((c) => c.origen === 'cloudwatch' && String(c.asunto ?? '').startsWith(`ALARM: "${a.nombre}"`));
  const accionOk = a && tema && (a.historial ?? []).some((h) => h.tipo === 'Action' && h.ok !== false && String(h.resumen).includes(tema.arn));
  const entregado = tema && tema.suscripciones.some((s) => s.protocolo === 'email' && s.estado === 'Confirmed' && s.entregados > 0);
  const okAviso = Boolean(correo || (accionOk && entregado));
  let retroAviso;
  if (okAviso) retroAviso = `${correo ? `Te llegó «${correo.asunto}».` : 'Tu alarma publicó en el tema y SNS entregó el correo.'} Así el gerente se entera aunque esté en su casa.`;
  else if (!a) retroAviso = 'Primero crea la alarma de CPU con aviso al tema.';
  else if (a.estado === 'ALARM') retroAviso = `${a.nombre} está In alarm, pero no encontré el correo: seguramente se prendió antes de que confirmaras tu suscripción. La alarma solo avisa cuando cambia de OK a In alarm: espera a que termine la hora pico (vuelve a OK) y simúlala otra vez.`;
  else if (accionOk && !entregado) retroAviso = `${a.nombre} sí publicó en ${tema.nombre}, pero el correo no se entregó: tu suscripción no estaba confirmada. Confírmala en la Bandeja de correo (simulada) y vuelve a simular la hora pico.`;
  else retroAviso = `${a.nombre} todavía no se ha encendido. Con la alarma y el correo listos, pulsa «Simular hora pico» en tu grupo: en unos 10 segundos la CPU pasa de ${x.umbral} y te llega el correo.`;

  const cayo = act.find((y) => /^Terminating EC2 instance/.test(y.descripcion ?? '') && /health check/.test(y.causa ?? ''));
  const reemplazo = act.find((y) => /^Launching a new EC2 instance: i-/.test(y.descripcion ?? '') && /unhealthy instance needing to be replaced/.test(y.causa ?? ''));
  return [
    check('escalo', t.escalo, 5, Boolean(creciendo || enBitacora), retroEscalo),
    check('aviso', t.aviso, 5, okAviso, retroAviso),
    check(
      'termino',
      t.termino,
      5,
      Boolean(cayo),
      cayo
        ? `En Activity: «${cayo.descripcion}». La causa: «${String(cayo.causa).replace(/^At \S+ /, '').replace(/\.$/, '')}». El grupo revisa la salud de sus instancias todo el tiempo.`
        : asg
          ? `No veo en Activity de ${asg.nombre} ninguna instancia sacada por el health check. Termina una instancia del grupo en EC2 → Instances → Instance state → Terminate (delete) instance y mira la pestaña Activity.`
          : 'Primero necesitas el grupo de Auto Scaling.'
    ),
    check(
      'reemplazo',
      t.reemplazo,
      5,
      Boolean(reemplazo),
      reemplazo
        ? `En Activity: «${reemplazo.descripcion}», porque «an unhealthy instance needing to be replaced». Nadie tuvo que levantarla: el grupo volvió solo a su capacidad deseada.`
        : cayo
          ? 'El grupo ya sacó la instancia caída; espera unos segundos a que lance la de reemplazo y vuelve a revisar.'
          : 'Cuando el grupo saque una instancia caída, lanzará otra para volver a su capacidad deseada. Primero termina una.'
    )
  ];
}

/* ============================================================ bono: cola */

function revisarCola(e, x, el) {
  const { tema } = el;
  const t = {
    cola: `Una cola SQS Standard (${x.cola})`,
    suscrita: `La cola está suscrita al tema y SNS tiene permiso de escribirle`,
    mensaje: 'Al menos un mensaje del tema llegó a la cola'
  };
  const subsSqs = temas(e).flatMap((tm) => tm.suscripciones.filter((s) => s.protocolo === 'sqs').map((s) => ({ s, tm })));
  const cola = colas(e).find((q) => igual(q.nombre, x.cola)) ?? colas(e).find((q) => subsSqs.some(({ s }) => s.endpoint === q.arn)) ?? colas(e)[0] ?? null;
  const nada = 'Es el bono opcional: si no lo haces no pierdes puntos.';
  if (!cola) {
    const r = `Todavía no hay ninguna cola. ${nada} Créala en Simple Queue Service → Queues → Create queue.`;
    return [check('cola', t.cola, 3, false, r), check('suscrita', t.suscrita, 4, false, r), check('mensaje', t.mensaje, 3, false, r)];
  }
  const okCola = cola.tipo === 'Standard';
  const sub = subsSqs.find(({ s, tm }) => s.endpoint === cola.arn && (!tema || tm.arn === tema.arn)) ?? subsSqs.find(({ s }) => s.endpoint === cola.arn) ?? null;
  const permiso = sub && colaPermiteServicio(e, cola, { servicio: 'sns.amazonaws.com', fuenteArn: sub.tm.arn });
  const okSub = Boolean(sub && sub.s.estado === 'Confirmed' && permiso);
  let retroSub;
  if (okSub) retroSub = `${cola.nombre} está suscrita a ${sub.tm.nombre} y su access policy deja que SNS le escriba: cada aviso del tema queda guardado en la cola hasta que alguien lo procese.`;
  else if (!sub) retroSub = `${cola.nombre} no está suscrita a ningún tema. En la cola → SNS subscriptions → Subscribe to Amazon SNS topic, elige ${tema?.nombre ?? x.tema}.`;
  else retroSub = `${cola.nombre} está suscrita a ${sub.tm.nombre}, pero su access policy no deja que SNS le escriba, así que los mensajes se pierden. Suscríbela desde la cola (Subscribe to Amazon SNS topic): así la consola agrega el permiso.`;
  const okMsg = Boolean(sub && sub.s.entregados > 0);
  return [
    check(
      'cola',
      t.cola,
      3,
      okCola,
      okCola ? `La cola ${cola.nombre} es Standard: entrega cada mensaje al menos una vez, en el orden que pueda. Para comandas sirve.${otroNombre(cola, x.cola, 'cola')}` : `${cola.nombre} es FIFO, y un tema Standard no puede escribir en una cola FIFO. Crea una Standard.`
    ),
    check('suscrita', t.suscrita, 4, okSub, retroSub),
    check(
      'mensaje',
      t.mensaje,
      3,
      okMsg,
      okMsg
        ? `SNS ya le entregó ${sub.s.entregados} mensaje(s) a ${cola.nombre}. Si la cocina (quien lee la cola) se atrasa, las comandas esperan ahí: nada se pierde. Eso es desacoplar.`
        : sub
          ? `Todavía no llega ningún mensaje del tema a la cola. Publica uno en SNS → Topics → ${sub.tm.nombre} → Publish message y luego Poll for messages en la cola.`
          : `Primero suscribe la cola al tema. ${nada}`
    )
  ];
}

/* ============================================================== revisar */

export function revisar(estadoOriginal, datos) {
  const e = preparar(estadoOriginal);
  const x = datosLab(datos);
  const el = elegir(e, x);
  return armar(LAB.tareas(datos), {
    plantilla: revisarPlantilla(e, x, el),
    balanceador: revisarBalanceador(e, x, el),
    grupo: revisarGrupo(e, x, el),
    politica: revisarPolitica(e, x, el),
    alarma: revisarAlarma(e, x, el),
    pruebas: revisarPruebas(e, x, el),
    cola: revisarCola(e, x, el)
  });
}

/* ============================================================= solución */

/**
 * La cuenta resuelta, hecha solo con acciones del modelo (como el alumno en la
 * consola). El reloj se fija en el pasado y avanza de a poco hasta «ahora»,
 * como si la consola llamara avanzar() cada par de segundos: así el grupo
 * lanza, el balanceador revisa la salud, la hora pico escala y la alarma avisa.
 */
export function solucion(datos) {
  const x = datosLab(datos);
  const relojOriginal = reloj.ahora;
  const fin = relojOriginal();
  let t = fin - 20 * 60_000;
  reloj.ahora = () => t;
  const pasar = (e, ms, paso = 2000) => {
    for (let r = ms; r > 0; r -= paso) {
      t += Math.min(paso, r);
      avanzar(e, t);
    }
  };

  try {
    const e = LAB.estadoInicial(datos);
    const vpc = e.vpcs.find((v) => v.porDefecto);
    const subredes = x.zonas.map((az) => e.subredes.find((s) => s.vpcId === vpc.id && s.az === az).id);

    // Los grupos de seguridad: el balanceador abierto al mundo, las instancias solo para el balanceador.
    const sgAlb = crearGrupoSeguridad(e, { nombre: x.sgAlb, descripcion: 'HTTP desde internet al balanceador', vpcId: vpc.id, entrada: [{ protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' }] });
    const sgWeb = crearGrupoSeguridad(e, { nombre: x.sgWeb, descripcion: 'HTTP solo desde el balanceador', vpcId: vpc.id, entrada: [{ protocolo: 'tcp', desde: 80, hasta: 80, origen: sgAlb.id }] });

    // La receta.
    const lt = crearPlantillaLanzamiento(e, {
      nombre: x.plantilla,
      descripcion: 'Pagina de pedidos',
      guia: true,
      datos: { ami: 'al2023', tipo: 't2.micro', llave: null, subredId: null, gruposSeguridad: [sgWeb.id], userData: x.userData }
    });

    // El que acomoda a los clientes.
    const tg = crearGrupoDestino(e, { nombre: x.tg, tipoDestino: 'instance', protocolo: 'HTTP', puerto: 80, vpcId: vpc.id, chequeo: { protocolo: 'HTTP', ruta: '/' } });
    crearBalanceador(e, { nombre: x.alb, tipo: 'application', esquema: 'internet-facing', vpcId: vpc.id, subredes, gruposSeguridad: [sgAlb.id], oyentes: [{ protocolo: 'HTTP', puerto: 80, tgArn: tg.arn }] });

    // Las cajas que se abren solas, con su termostato.
    crearGrupoAutoScaling(e, {
      nombre: x.asg,
      plantillaId: lt.id,
      version: '$Default',
      subredes,
      gruposDestino: [tg.arn],
      tipoSalud: 'ELB',
      gracia: 300,
      min: x.minimo,
      deseado: x.deseado,
      max: x.maximo,
      politica: { nombre: x.politica, metrica: 'ASGAverageCPUUtilization', objetivo: x.objetivoCpu, calentamiento: 300 },
      etiquetas: [{ llave: 'Name', valor: x.nombreInstancias, propagar: true }]
    });

    // El aviso al gerente.
    const tema = crearTema(e, { nombre: x.tema });
    const sub = crearSuscripcion(e, { temaArn: tema.arn, protocolo: 'email', endpoint: x.correo });
    confirmarSuscripcion(e, sub.arn);
    crearAlarma(e, {
      nombre: x.alarma,
      descripcion: 'La cocina esta al rojo',
      metrica: { namespace: 'AWS/EC2', metrica: 'CPUUtilization', dimensiones: { AutoScalingGroupName: x.asg } },
      estadistica: 'Average',
      periodo: 300,
      comparacion: 'GreaterThanThreshold',
      umbral: x.umbral,
      puntos: 1,
      evaluaciones: 1,
      acciones: { ALARM: [tema.arn] }
    });

    // Bono: la cola suscrita al tema.
    crearCola(e, { nombre: x.cola });
    suscribirColaATema(e, x.cola, tema.arn);

    // El grupo lanza sus dos instancias y el balanceador las ve sanas.
    pasar(e, 60_000);

    // La hora pico: crece por la AlarmHigh y la alarma de CPU manda el correo.
    simularCargaAsg(e, x.asg, { cpu: 90, minutos: 10 });
    pasar(e, 90_000);

    // Una caja que se cae: el grupo la reemplaza.
    const g = e.autoscaling.grupos.find((y) => y.nombre === x.asg);
    const victima = g.instancias.find((m) => m.ciclo === 'InService');
    terminarInstancia(e, victima.id);
    pasar(e, 60_000);

    // Un mensaje a mano en el tema: llega al correo y a la cola.
    publicarMensaje(e, tema.arn, { asunto: 'Prueba', mensaje: 'Comanda de prueba: 3 de pastor' });

    // Hasta ahora: pasa la hora pico, el grupo se encoge y todo queda sano.
    pasar(e, fin - t, 5000);
    return e;
  } finally {
    reloj.ahora = relojOriginal;
  }
}
