// Rúbrica del examen final · parte práctica · Envíos Huasteca rastrea sus paquetes.
//
// Revisa la cuenta como la dejó el alumno, por RESULTADOS: ¿hay una red propia
// con públicas y privadas en dos zonas y salida por NAT?, ¿solo el balanceador
// llega a los servidores?, ¿la página abre por el balanceador con dos
// servidores sanos en dos zonas y en subredes privadas?, ¿la tabla de guías
// cobra por petición, tiene PITR, protección y la guía de prueba?, ¿los
// servidores usan un rol solo de DynamoDB?, ¿el bucket de las fotos está
// bloqueado, versionado, cifrado con KMS y con su ciclo de vida?, ¿la alarma
// de servidores enfermos avisa por correo?, ¿la etiqueta del proyecto está
// puesta y activada, y hay presupuesto con alerta? Y el bono: target tracking
// por peticiones.
//
// Elige «el recurso del alumno» con tolerancia (por lo que hace, no por cómo
// se llama): el grupo de Auto Scaling con más servidores en servicio, el
// balanceador que le manda tráfico, la alarma o el presupuesto que mejor
// cumple… Solo la tabla y el bucket, que llevan el sufijo del alumno, se piden
// con su nombre exacto. Da puntos parciales: cada punto se revisa solo, y si
// el nombre de la tabla o del bucket no es exacto, lo demás se revisa en el
// que más se parece. Solo servidor: el navegador nunca recibe este archivo.

import {
  activarEtiquetasCosto,
  avanzar,
  confirmarSuscripcion,
  crearAlarma,
  crearBalanceador,
  crearBucket,
  crearGrupoAutoScaling,
  crearGrupoDestino,
  crearGrupoSeguridad,
  crearPlantillaLanzamiento,
  crearPresupuesto,
  crearReglaCiclo,
  crearRol,
  crearSuscripcion,
  crearTablaDynamo,
  crearTema,
  crearVpcCompleta,
  dimensionBalanceador,
  dimensionGrupoDestino,
  editarPitrDynamo,
  grupoDestinoDe,
  gruposDeOyente,
  instanciaDe,
  itemDynamoPlano,
  plantillaLanzamientoDe,
  politicaIam,
  ponerItemDynamo,
  reloj,
  subredDe,
  tablaDynamoDe,
  textoPuertos,
  tipoDeRegla
} from '../../public/consola/modelo.js';
import { esSubredPublica, gruposPermitenDesde, probarPagina, salePorNat } from '../../public/consola/red.js';
import { LAB, datosLab } from '../../public/labs/final.js';
import { armar, check, checkBloqueo, checkVersionado, contiene, describirCiclo, elegirBucket, elegirVpc, explicarRuta, lista, mejorPor, normal, preparar, retroIgw, retroNombreBucket, retroWebPorIp, sinVpc, sshServidoresPrivados } from './comun.js';

/**
 * Dónde repasar cada punto en la Ruta AWS (ver src/repaso.js). La clave
 * 'tarea/check' gana sobre la de la tarea.
 */
export const REPASO = {
  red: ['s3-vpc/1', 's3-vpc/3'],
  'red/vpc': ['s3-vpc/1', 's3-vpc/2', 's3-lab-vpc/7'],
  'red/publicas': ['s3-vpc/3', 's3-lab-vpc/5', 's1-global/1'],
  'red/privadas': ['s3-vpc/3', 's3-lab-vpc/9', 's9-caso/2'],

  puertas: ['s2-lab-seguridad/13', 's2-servicios/3'],
  'puertas/alb-abierto': ['s2-lab-seguridad/14', 's2-servicios/3'],
  'puertas/web-solo-alb': ['s2-lab-seguridad/14', 's6-balanceadores/1', 's9-caso/2'],
  'puertas/sin-ssh': ['s2-lab-seguridad/14', 's2-identidades/3'],

  rastreo: ['s6-balanceadores/1', 's6-elasticidad/2', 's9-caso/2'],
  'rastreo/alb': ['s6-balanceadores/1', 's3-vpc/3'],
  'rastreo/asg': ['s6-elasticidad/2', 's6-lab-escalar/7', 's1-global/1'],
  'rastreo/privadas': ['s3-vpc/3', 's9-caso/2'],
  'rastreo/sanos': ['s6-balanceadores/1', 's6-lab-escalar/8'],
  'rastreo/chequeo-elb': ['s6-lab-escalar/8', 's6-lab-escalar/12'],
  'rastreo/pagina': ['s6-lab-escalar/11', 's1-lab-ec2/9'],

  guias: ['s5-nosql/1', 's5-nosql/2'],
  'guias/existe': ['s5-nosql/1', 's5-lab-bases/6'],
  'guias/ondemand': ['s5-nosql/2', 's7-precios/1'],
  'guias/pitr': ['s5-disponibilidad/1', 's5-nosql/2'],
  'guias/proteccion': ['s5-lab-bases/7', 's5-disponibilidad/1'],
  'guias/item': ['s5-lab-bases/8', 's5-lab-bases/10'],

  acceso: ['s2-identidades/1', 's2-politicas/1'],
  'acceso/rol': ['s2-identidades/1', 's2-identidades/3'],
  'acceso/minimo': ['s2-politicas/1', 's2-politicas/2'],

  evidencias: ['s4-s3/2', 's4-seguridad/1'],
  'evidencias/existe': ['s4-s3/1', 's4-lab-almacenamiento/3'],
  'evidencias/bloqueo': ['s4-seguridad/1', 's4-lab-almacenamiento/4'],
  'evidencias/versionado': ['s4-seguridad/1', 's4-lab-almacenamiento/5'],
  'evidencias/cifrado': ['s4-lab-almacenamiento/5', 's2-servicios/1', 's2-responsabilidad/1'],
  'evidencias/archivo': ['s4-s3/2', 's4-s3/3', 's4-lab-almacenamiento/8'],
  'evidencias/borrado': ['s4-s3/3', 's4-lab-almacenamiento/7'],

  alertas: ['s6-monitorear/1', 's6-lab-escalar/15'],
  'alertas/tema': ['s6-serverless/2', 's6-lab-escalar/15'],
  'alertas/alarma': ['s6-monitorear/1', 's6-lab-escalar/14', 's6-balanceadores/1'],
  'alertas/aviso': ['s6-lab-escalar/15', 's6-monitorear/1'],

  costos: ['s7-herramientas/1', 's12-examen/2'],
  'costos/etiquetas-servidores': ['s7-herramientas/1', 's12-examen/2'],
  'costos/etiquetas-datos': ['s7-herramientas/1', 's12-examen/2'],
  'costos/activa': ['s7-herramientas/1', 's12-examen/2'],
  'costos/monto': ['s7-herramientas/1', 's7-lab-costos/8'],
  'costos/alerta': ['s7-herramientas/1', 's7-precios/1'],

  escala: ['s6-elasticidad/1', 's6-elasticidad/2'],
  'escala/politica': ['s6-elasticidad/2', 's6-lab-escalar/9', 's6-lab-escalar/13'],
  'escala/maximo': ['s6-lab-escalar/9', 's7-precios/1']
};

/* ============================================================ ayudas */

const fmtGrupo = (g) => `${g.nombre} (${g.id})`;
const grupoPorId = (estado, id) => estado.gruposSeguridad.find((g) => g.id === id) ?? null;
const cubre = (r, puerto) => r.protocolo === '-1' || (r.protocolo === 'tcp' && r.desde <= puerto && puerto <= r.hasta);
const esCidr = (origen) => !String(origen).startsWith('sg-');
const zonasDe = (estado, subredIds) => [...new Set(subredIds.map((id) => subredDe(estado, id)?.az).filter(Boolean))];
const fmtSub = (estado, id) => {
  const s = subredDe(estado, id);
  return s ? `${s.nombre ? `«${s.nombre}» ` : ''}${s.id} (${s.az})` : id;
};
/** Las reglas de entrada de una lista de grupos que cubren un puerto: [{ g, r }]. */
const reglasPuerto = (estado, grupoIds, puerto) =>
  grupoIds.flatMap((id) => {
    const g = grupoPorId(estado, id);
    return g ? g.entrada.filter((r) => cubre(r, puerto)).map((r) => ({ g, r })) : [];
  });
const describirReglas = (xs) => xs.map(({ g, r }) => `${tipoDeRegla(r)} ${textoPuertos(r)} desde ${r.origen} (${g.nombre})`).join('; ');

/* ====================================================== el contexto */

/** Las instancias vivas (running) que el grupo tiene en servicio. */
function servidoresDe(estado, g) {
  if (!g) return [];
  return g.instancias
    .filter((m) => m.ciclo === 'InService')
    .map((m) => instanciaDe(estado, m.id))
    .filter((i) => i && i.estado === 'running');
}

/**
 * Lo que la rúbrica usa en varias tareas: la VPC de la empresa, «el grupo de
 * Auto Scaling del sitio de rastreo», sus servidores, el balanceador que le
 * manda tráfico y el grupo de destino que comparten.
 *
 * Si no existe la VPC con el bloque pedido, solo falla ese punto: la red se
 * revisa en la VPC propia que más cosas tiene (`vpcRed`) y el sitio, en la VPC
 * donde de verdad vive su grupo de Auto Scaling (`vpc`).
 */
function contexto(estado, x) {
  const exacta = elegirVpc(estado, x.vpcCidr);
  const grupos = (estado.autoscaling?.grupos ?? []).filter((g) => g.estado === 'activo');
  const vpcDeGrupo = (g) => subredDe(estado, g.subredes[0])?.vpcId ?? null;
  const asg =
    [...grupos].sort(
      (a, b) =>
        (vpcDeGrupo(b) === exacta?.id) - (vpcDeGrupo(a) === exacta?.id) ||
        servidoresDe(estado, b).length - servidoresDe(estado, a).length ||
        b.gruposDestino.length - a.gruposDestino.length
    )[0] ?? null;
  const servidores = servidoresDe(estado, asg);

  // La VPC propia «más armada» (subredes, gateway, instancias), por si el bloque no es el pedido.
  const peso = (v) => estado.subredes.filter((s) => s.vpcId === v.id).length + (estado.igws.some((g) => g.vpcId === v.id) ? 3 : 0) + estado.instancias.filter((i) => i.vpcId === v.id && i.estado !== 'terminated').length * 2;
  const propias = estado.vpcs.filter((v) => !v.porDefecto);
  const deAsg = asg ? estado.vpcs.find((v) => v.id === vpcDeGrupo(asg)) ?? null : null;
  const alterna = (deAsg && !deAsg.porDefecto ? deAsg : null) ?? [...propias].sort((a, b) => peso(b) - peso(a))[0] ?? null;
  const vpcRed = exacta ?? alterna;
  const vpc = exacta ?? deAsg ?? alterna;

  const albs = (estado.elb?.balanceadores ?? []).filter((b) => b.tipo === 'application');
  const tgsDe = (b) => b.oyentes.flatMap(gruposDeOyente);
  const conAsg = albs.filter((b) => asg && tgsDe(b).some((arn) => asg.gruposDestino.includes(arn)));
  const alb = conAsg.find((b) => b.esquema === 'internet-facing') ?? conAsg[0] ?? albs.find((b) => b.vpcId === vpc?.id && b.esquema === 'internet-facing') ?? albs.find((b) => b.vpcId === vpc?.id) ?? albs[0] ?? null;
  const tgArn = alb ? (tgsDe(alb).find((arn) => asg?.gruposDestino.includes(arn)) ?? tgsDe(alb)[0] ?? null) : (asg?.gruposDestino[0] ?? null);
  const tg = tgArn ? grupoDestinoDe(estado, tgArn) : null;
  return { vpc, vpcRed, exacta: Boolean(exacta), asg, servidores, alb, tg };
}

const sinGrupo = () => 'Todavía no hay un grupo de Auto Scaling activo. Primero crea la launch template y luego el grupo en EC2 → Auto Scaling Groups, en las subredes privadas de tu VPC.';
const sinServidores = (ctx) =>
  ctx.asg
    ? `Tu grupo «${ctx.asg.nombre}» todavía no tiene servidores en servicio (InService). Revisa su pestaña Activity: ahí sale por qué no lanza o si los está reemplazando.`
    : sinGrupo();

/* ================================================================ red */

function checksRed(estado, x, ctx) {
  const tVpc = `Una VPC propia con el bloque ${x.vpcCidr}`;
  const tPub = 'Dos subredes públicas en dos zonas, con salida por un Internet Gateway';
  const tPriv = 'Dos subredes privadas en esas zonas, sin entrada desde internet y con salida por un NAT gateway';
  const vpc = ctx.vpcRed;
  if (!vpc) {
    const r = sinVpc(estado, x.vpcCidr);
    return [check('vpc', tVpc, 3, false, r), check('publicas', tPub, 3, false, r), check('privadas', tPriv, 4, false, r)];
  }
  const rVpc = ctx.exacta
    ? `Tu VPC ${vpc.nombre ? `«${vpc.nombre}» ` : ''}${vpc.id} usa ${x.vpcCidr}: una red aislada solo de la empresa, con 65,536 direcciones privadas para crecer. Nada de la VPC por omisión, que comparten todos los experimentos de la cuenta.`
    : `${sinVpc(estado, x.vpcCidr)} (Las subredes se revisaron en tu VPC ${vpc.id}, ${vpc.cidr}.)`;

  const subredes = estado.subredes.filter((s) => s.vpcId === vpc.id);
  const publicas = subredes.filter((s) => esSubredPublica(estado, s.id));
  const privadas = subredes.filter((s) => !esSubredPublica(estado, s.id));
  const zonasPub = [...new Set(publicas.map((s) => s.az))];

  let okPub = false;
  let rPub;
  if (zonasPub.length >= 2) {
    okPub = true;
    rPub = `Tienes subredes públicas en ${zonasPub.join(' y ')} (${publicas.map((s) => fmtSub(estado, s.id)).join(', ')}): su tabla de rutas manda 0.0.0.0/0 al Internet Gateway. Ahí vive el balanceador, la única cara pública del sitio.`;
  } else if (!subredes.length) rPub = `Tu VPC ${vpc.id} no tiene subredes. Lo más rápido es «VPC and more» en VPC → Create VPC: arma las subredes, el Internet Gateway, el NAT y las tablas de rutas de un jalón.`;
  else if (publicas.length) rPub = `Solo tienes subredes públicas en ${zonasPub.join(', ')}. Con una sola zona, si esa zona falla el sitio se cae: agrega otra subred pública en una segunda zona (asociada a la tabla de rutas con el Internet Gateway).`;
  else {
    const igw = retroIgw(estado, vpc);
    rPub = `Ninguna subred de tu VPC es pública. ${igw} ${explicarRuta(estado, subredes[0])}`;
  }

  // Privadas: sin ruta al IGW y con salida por un NAT disponible.
  const conNat = privadas.filter((s) => salePorNat(estado, s.id));
  const zonasNat = [...new Set(conNat.map((s) => s.az))];
  const natPendiente = estado.nats.some((n) => n.estado === 'pending' && subredDe(estado, n.subredId)?.vpcId === vpc.id);
  let okPriv = false;
  let rPriv;
  if (zonasNat.length >= 2) {
    okPriv = true;
    rPriv = `Tus subredes privadas ${conNat.map((s) => fmtSub(estado, s.id)).join(', ')} no tienen ruta al Internet Gateway, así que nadie de internet les llega; y salen por el NAT gateway para descargar paquetes (el «dnf install» del script). El NAT deja salir, pero no entrar.`;
  } else if (!privadas.length) rPriv = `Tu VPC no tiene subredes privadas: todas mandan 0.0.0.0/0 al Internet Gateway. Los servidores deben vivir donde internet no les llegue: crea dos subredes privadas (una por zona) con su propia tabla de rutas.`;
  else if (natPendiente) rPriv = 'Tu NAT gateway todavía está en Pending. Tarda unos segundos en quedar Available: espera y vuelve a revisar.';
  else if (conNat.length) rPriv = `Solo ${conNat.map((s) => fmtSub(estado, s.id)).join(', ')} sale por NAT, en una sola zona. Se pidieron privadas en las dos zonas de las públicas, cada una con salida por NAT.`;
  else {
    rPriv = `Tus subredes privadas (${privadas.map((s) => fmtSub(estado, s.id)).join(', ')}) no tienen ruta 0.0.0.0/0 a un NAT gateway: los servidores no podrían descargar Apache. Crea un NAT gateway en una subred pública (VPC → NAT gateways) y en la tabla de rutas de las privadas agrega 0.0.0.0/0 → ese NAT. Con «VPC and more», elige NAT gateways: In 1 AZ.`;
  }
  return [check('vpc', tVpc, 3, ctx.exacta, rVpc), check('publicas', tPub, 3, okPub, rPub), check('privadas', tPriv, 4, okPriv, rPriv)];
}

/* ============================================================ puertas */

/** Los grupos de seguridad de los servidores: los de las instancias en servicio, los de la plantilla o el sugerido. */
function gruposServidores(estado, x, ctx) {
  const { asg, servidores } = ctx;
  const plantilla = asg ? plantillaLanzamientoDe(estado, asg.plantilla.id) : null;
  const deServidores = [...new Set(servidores.flatMap((i) => i.gruposSeguridad))];
  if (deServidores.length) return deServidores;
  const numero = plantilla ? (asg.plantilla.version === '$Latest' ? plantilla.ultimaVersion : asg.plantilla.version === '$Default' ? plantilla.versionDefault : Number(asg.plantilla.version)) : null;
  const deVersion = plantilla?.versiones.find((v) => v.numero === numero)?.datos.gruposSeguridad ?? [];
  if (deVersion.length) return deVersion;
  return estado.gruposSeguridad.filter((g) => g.nombre === x.sgWeb).map((g) => g.id);
}

function checksPuertas(estado, x, ctx) {
  const { alb } = ctx;
  const tAlb = 'El balanceador recibe HTTP (80) desde cualquier lugar';
  const tWeb = 'A los servidores solo les llega HTTP (80) desde el grupo del balanceador, no desde una IP';
  const tSsh = 'Nadie de internet puede intentar SSH (22) a los servidores';
  const grupos = gruposServidores(estado, x, ctx);
  const sgsAlb = alb?.gruposSeguridad ?? estado.gruposSeguridad.filter((g) => g.nombre === x.sgAlb).map((g) => g.id);
  const nombresAlb = lista(sgsAlb.map((id) => grupoPorId(estado, id)).filter(Boolean).map(fmtGrupo));

  let okAlb = false;
  let rAlb;
  if (!sgsAlb.length) rAlb = `Todavía no hay balanceador ni un grupo «${x.sgAlb}». Crea el grupo del balanceador con HTTP (80) desde 0.0.0.0/0 y pónselo al balanceador.`;
  else {
    const ips = ['8.8.8.8', '201.141.33.10', x.ipCasa];
    okAlb = ips.every((ip) => gruposPermitenDesde(estado, sgsAlb, 'tcp', 80, { ip }).permite);
    rAlb = okAlb
      ? `El grupo del balanceador (${nombresAlb}) deja entrar el 80 desde cualquier IP: los clientes rastrean desde su casa o el celular, sin una dirección fija.`
      : `${alb ? `Los grupos de «${alb.nombre}»` : 'El grupo del balanceador'} (${nombresAlb}) no dejan entrar HTTP desde cualquier lugar. El balanceador es la puerta pública: necesita una regla HTTP (80) con origen 0.0.0.0/0.`;
  }

  let okWeb = false;
  let rWeb;
  if (!grupos.length) rWeb = ctx.asg ? sinServidores(ctx) : `${sinGrupo()} Sus servidores deben llevar un grupo propio (sugerido: ${x.sgWeb}).`;
  else {
    const r80 = reglasPuerto(estado, grupos, 80);
    const porIp = r80.filter(({ r }) => esCidr(r.origen));
    const desdeAlb = r80.filter(({ r }) => sgsAlb.includes(r.origen));
    const nombres = grupos.map((id) => grupoPorId(estado, id)).filter(Boolean).map(fmtGrupo).join(', ');
    if (porIp.length) rWeb = retroWebPorIp(nombres, porIp, 'el grupo del balanceador (sg-…)');
    else if (!sgsAlb.length) rWeb = 'Sin balanceador no hay de quién recibir el tráfico. Crea el balanceador con su propio grupo y deja que solo ese grupo llegue al 80 de los servidores.';
    else if (!desdeAlb.length) rWeb = `Ninguna regla de ${nombres} deja entrar el 80 desde el grupo del balanceador (${nombresAlb}). Sin ella, el balanceador no llega a los servidores y los marca unhealthy. Agrega HTTP con Source = el grupo del balanceador (el sg-…).`;
    else {
      okWeb = true;
      rWeb = `${nombres} solo deja entrar el 80 desde el grupo del balanceador: grupos de seguridad encadenados. Aunque alguien conozca la IP privada de un servidor, no puede entrar sin pasar por el balanceador.`;
    }
  }

  let okSsh = false;
  let rSsh;
  if (!grupos.length) rSsh = ctx.asg ? sinServidores(ctx) : sinGrupo();
  else {
    ({ ok: okSsh, retro: rSsh } = sshServidoresPrivados(reglasPuerto(estado, grupos, 22), describirReglas));
  }
  return [check('alb-abierto', tAlb, 2, okAlb, rAlb), check('web-solo-alb', tWeb, 5, okWeb, rWeb), check('sin-ssh', tSsh, 3, okSsh, rSsh)];
}

/* ============================================================ rastreo */

function checksRastreo(estado, x, ctx) {
  const { vpc, asg, alb, tg } = ctx;
  const tAlb = 'Un Application Load Balancer internet-facing, activo, en las dos subredes públicas, con un listener HTTP:80';
  const tAsg = 'Un grupo de Auto Scaling con launch template, en 2 zonas, con mínimo y deseado de al menos 2';
  const tPriv = 'Los servidores viven en subredes privadas y no tienen IP pública';
  const tSanos = 'Al menos 2 servidores del grupo están healthy en el balanceador, en 2 zonas distintas';
  const tElb = 'El grupo usa las revisiones de salud del balanceador (ELB health checks)';
  const tPag = `El DNS del balanceador abre la página y dice «${x.textoPagina}»`;

  if (!vpc) {
    const r = `${sinVpc(estado, x.vpcCidr)} El sitio de rastreo se monta en esa red (tarea 1).`;
    return [check('alb', tAlb, 5, false, r), check('asg', tAsg, 5, false, r), check('privadas', tPriv, 4, false, r), check('sanos', tSanos, 5, false, r), check('chequeo-elb', tElb, 2, false, r), check('pagina', tPag, 4, false, r)];
  }

  // El balanceador.
  let okAlb = false;
  let rAlb;
  if (!alb) rAlb = `No hay ningún Application Load Balancer. Créalo en EC2 → Load Balancers → Create load balancer → Application Load Balancer, internet-facing, en tu VPC ${x.vpcCidr}, con las dos subredes públicas y su grupo de seguridad.`;
  else {
    const zonas = zonasDe(estado, alb.subredes);
    const privadas = alb.subredes.filter((id) => !esSubredPublica(estado, id));
    const oyente80 = alb.oyentes.find((o) => o.protocolo === 'HTTP' && o.puerto === 80 && gruposDeOyente(o).length);
    if (alb.vpcId !== vpc.id) rAlb = `Tu balanceador «${alb.nombre}» está en ${alb.vpcId}, no en tu VPC ${x.vpcCidr} (${vpc.id}). Un balanceador solo reparte a servidores de su propia VPC: créalo ahí.`;
    else if (alb.esquema !== 'internet-facing') rAlb = `Tu balanceador «${alb.nombre}» es internal: su DNS solo se alcanza desde dentro de la VPC y los clientes no podrían rastrear. El esquema no se cambia después: crea otro internet-facing.`;
    else if (privadas.length) rAlb = `Tu balanceador «${alb.nombre}» está en subredes privadas (${privadas.map((id) => fmtSub(estado, id)).join(', ')}): sin ruta al Internet Gateway, nadie de internet le llega. Ponlo en las dos subredes públicas (Network mapping → Edit subnets).`;
    else if (zonas.length < 2) rAlb = `Tu balanceador «${alb.nombre}» solo está en ${lista(zonas)}. Un ALB necesita dos zonas para seguir atendiendo si una falla.`;
    else if (!oyente80) rAlb = `Tu balanceador «${alb.nombre}» no tiene un listener HTTP:80 que mande a un grupo de destino (tiene: ${lista(alb.oyentes.map((o) => `${o.protocolo}:${o.puerto}`))}). Agrégalo en la pestaña Listeners and rules.`;
    else if (alb.estado !== 'active') rAlb = `Tu balanceador «${alb.nombre}» todavía está en ${alb.estado}. Tarda unos 20 segundos en quedar Active: espera y vuelve a revisar.`;
    else {
      okAlb = true;
      rAlb = `«${alb.nombre}» es internet-facing y vive en ${zonas.join(' y ')}: es la única puerta pública del sitio y reparte a los servidores sanos. Si una zona falla, sigue atendiendo desde la otra.`;
    }
  }

  // El grupo de Auto Scaling.
  let okAsg = false;
  let rAsg;
  if (!asg) rAsg = sinGrupo();
  else {
    const zonas = zonasDe(estado, asg.subredes);
    const plantilla = plantillaLanzamientoDe(estado, asg.plantilla.id);
    if (!plantilla) rAsg = `La launch template de tu grupo «${asg.nombre}» ya no existe: el grupo no puede lanzar servidores. Crea una plantilla y edita el grupo para usarla.`;
    else if (zonas.length < 2) rAsg = `Tu grupo «${asg.nombre}» solo tiene subredes en ${lista(zonas)}. Si esa zona se cae, el sitio se cae con ella. Edita el grupo (Network) y agrega la subred privada de la otra zona.`;
    else if (asg.min < 2 || asg.deseado < 2) rAsg = `Tu grupo «${asg.nombre}» tiene mínimo ${asg.min} y deseado ${asg.deseado}. Con menos de 2 servidores, si uno falla no queda nadie atendiendo mientras llega el reemplazo. Sube los dos a 2 en el detalle del grupo → Capacity overview → Edit.`;
    else {
      okAsg = true;
      rAsg = `«${asg.nombre}» usa la plantilla «${plantilla.nombre}» y reparte sus servidores en ${zonas.join(' y ')}, con mínimo ${asg.min}. Si un servidor o una zona falla, el grupo lanza otro solo: alta disponibilidad y elasticidad.`;
    }
  }

  // Privadas y sin IP pública.
  let okPriv = false;
  let rPriv;
  if (!asg) rPriv = sinGrupo();
  else {
    const publicas = asg.subredes.filter((id) => esSubredPublica(estado, id));
    const vivos = asg.instancias.map((m) => instanciaDe(estado, m.id)).filter((i) => i && !['terminated', 'shutting-down'].includes(i.estado));
    const conIp = vivos.filter((i) => i.ipPublica);
    if (publicas.length) rPriv = `Tu grupo «${asg.nombre}» usa subredes públicas (${publicas.map((id) => fmtSub(estado, id)).join(', ')}). Los servidores no necesitan que internet les llegue: el balanceador les lleva el tráfico. Edita el grupo (Network) y deja solo las dos subredes privadas.`;
    else if (!vivos.length) rPriv = sinServidores(ctx);
    else if (conIp.length) rPriv = `Tus servidores ${conIp.map((i) => `${i.id} (${i.ipPublica})`).join(', ')} tienen IP pública. Quita «Auto-assign public IP» en la plantilla (Network settings → Advanced) y reemplaza los servidores.`;
    else {
      okPriv = true;
      rPriv = `Tus servidores viven en ${zonasDe(estado, asg.subredes).length} subredes privadas y no tienen IP pública: desde internet no existen. Para instalar paquetes salen por el NAT gateway, que no deja entrar a nadie.`;
    }
  }

  // Sanos en el balanceador.
  let okSanos = false;
  let rSanos;
  if (!asg) rSanos = sinGrupo();
  else if (!asg.gruposDestino.length) rSanos = `Tu grupo «${asg.nombre}» no está conectado a ningún grupo de destino, así que el balanceador no conoce a sus servidores. En el detalle del grupo, pestaña Integrations → Load balancing → Edit → «Application, Network or Gateway Load Balancer target groups» y elige el del balanceador.`;
  else if (!tg) rSanos = `El grupo de destino de «${asg.nombre}» ya no existe. Conéctalo a uno que reciba el tráfico del balanceador.`;
  else if (alb && !alb.oyentes.some((o) => gruposDeOyente(o).includes(tg.arn))) rSanos = `El balanceador «${alb.nombre}» no manda tráfico al grupo de destino «${tg.nombre}» de tu grupo de Auto Scaling. Revisa el listener HTTP:80 (Listeners and rules).`;
  else {
    const ids = new Set(asg.instancias.map((m) => m.id));
    const propios = tg.destinos.filter((d) => ids.has(d.id));
    const sanos = propios.filter((d) => d.salud === 'healthy');
    const zonas = [...new Set(sanos.map((d) => instanciaDe(estado, d.id)?.az).filter(Boolean))];
    if (sanos.length >= 2 && zonas.length >= 2) {
      okSanos = true;
      rSanos = `${sanos.length} servidores healthy en «${tg.nombre}», en ${zonas.join(' y ')}. El balanceador solo manda clientes a los sanos.`;
    } else if (!propios.length) rSanos = sinServidores(ctx);
    else {
      const estados = propios.map((d) => `${d.id}: ${d.salud}${d.motivo ? ` (${d.motivo.codigo})` : ''}`).join(', ');
      const timeout = propios.some((d) => d.motivo?.codigo === 'Target.Timeout');
      const consejo = timeout
        ? ' Target.Timeout quiere decir que el balanceador no logra llegar al puerto 80: revisa que el grupo de seguridad de los servidores deje entrar HTTP desde el grupo del balanceador.'
        : propios.some((d) => d.motivo?.codigo === 'Target.FailedHealthChecks' || d.motivo?.codigo === 'Target.ResponseCodeMismatch')
          ? ' El servidor contesta mal: revisa que el user data de la plantilla sea el script de la tarea, tal cual (solo corre en el primer arranque).'
          : propios.some((d) => d.salud === 'initial')
            ? ' Los que dicen initial todavía están pasando sus primeras revisiones: espera unos segundos.'
            : '';
      rSanos = `En «${tg.nombre}» tus servidores están así: ${estados}. Se necesitan al menos 2 healthy, en 2 zonas.${consejo}`;
    }
  }

  // ELB health checks.
  let okElb = false;
  let rElb;
  if (!asg) rElb = sinGrupo();
  else if (asg.tipoSalud === 'ELB' && asg.gruposDestino.length) {
    okElb = true;
    rElb = `«${asg.nombre}» usa ELB health checks: si Apache se cae pero la instancia sigue encendida, el balanceador la marca unhealthy y el grupo la reemplaza. Con solo EC2 health checks, el grupo no se daría cuenta.`;
  } else if (asg.tipoSalud === 'ELB') rElb = `«${asg.nombre}» tiene ELB health checks, pero sin grupo de destino no hay balanceador que revise. Conéctalo al grupo de destino.`;
  else rElb = `«${asg.nombre}» solo usa EC2 health checks: revisa que la máquina esté encendida, no que la página conteste. Actívalos en Details → Health checks → Edit → «Turn on Elastic Load Balancing health checks».`;

  // La página por el balanceador.
  let okPag = false;
  let rPag;
  if (!alb) rPag = 'Sin balanceador no hay DNS que abrir. Cuando lo tengas, usa «Open in browser» en su detalle.';
  else {
    const r = probarPagina(estado, `http://${alb.dns}`, { turno: 0 });
    const pagina = r.resultado === 'ok' && r.codigoHttp === 200;
    if (pagina && contiene(r.html, x.textoPagina)) {
      okPag = true;
      rPag = `http://${alb.dns} abre la página de rastreo y dice «${x.textoPagina}». Los clientes entran siempre por ese nombre; detrás, el balanceador elige un servidor sano.`;
    } else if (pagina) rPag = `El DNS del balanceador abre una página, pero no dice «${x.textoPagina}». Copia el script de la tarea tal cual en el User data de la plantilla y reemplaza los servidores (el user data solo corre en el primer arranque).`;
    else {
      const fallo = (r.diagnostico ?? []).find((p) => !p.ok);
      const codigo = r.codigoHttp ? `HTTP ${r.codigoHttp}` : r.error?.codigo ?? r.resultado;
      rPag = `Al abrir http://${alb.dns} desde tu casa sale ${codigo}.${fallo ? ` Se atoró en «${fallo.paso}»: ${fallo.detalle}` : ''}`;
    }
  }

  return [check('alb', tAlb, 5, okAlb, rAlb), check('asg', tAsg, 5, okAsg, rAsg), check('privadas', tPriv, 4, okPriv, rPriv), check('sanos', tSanos, 5, okSanos, rSanos), check('chequeo-elb', tElb, 2, okElb, rElb), check('pagina', tPag, 4, okPag, rPag)];
}

/* ============================================================== guías */

const sinGuion = (t) => normal(t).replace(/[^a-z0-9]/g, '');

/** La tabla pedida o, si no está, la que más se parece (para revisar lo demás y avisar del nombre). */
function elegirTabla(estado, x) {
  const vivas = (estado.dynamodb?.tablas ?? []).filter((t) => t.estado !== 'DELETING');
  const exacta = vivas.find((t) => t.nombre === x.tabla);
  if (exacta) return { tabla: exacta, exacta: true };
  const parecida = vivas.find((t) => sinGuion(t.nombre) === sinGuion(x.tabla)) ?? vivas.find((t) => normal(t.nombre).startsWith('guia')) ?? (vivas.length === 1 ? vivas[0] : null);
  return { tabla: parecida, exacta: false };
}

function checksGuias(estado, x) {
  const tExiste = `La tabla «${x.tabla}» existe, está Active y su llave de partición es ${x.pk} (String)`;
  const tOnDemand = 'La tabla cobra por petición (capacidad on-demand)';
  const tPitr = 'Point-in-time recovery (PITR) activado';
  const tProt = 'Deletion protection activada';
  const tItem = `La guía de prueba ${x.guia} con estado «${x.estadoGuia}» y destino «${x.destino}»`;
  const { tabla: t, exacta } = elegirTabla(estado, x);
  if (!t) {
    const otras = (estado.dynamodb?.tablas ?? []).map((y) => y.nombre);
    const r = `No existe la tabla ${x.tabla}${otras.length ? ` (tienes: ${otras.join(', ')})` : ''}. Créala en DynamoDB → Tables → Create table.`;
    return [check('existe', tExiste, 4, false, r), check('ondemand', tOnDemand, 3, false, r), check('pitr', tPitr, 3, false, r), check('proteccion', tProt, 2, false, r), check('item', tItem, 3, false, r)];
  }
  const nota = exacta ? '' : ` (Revisé «${t.nombre}», que se parece a ${x.tabla}.)`;
  const activa = t.estado === 'ACTIVE' || t.estado === 'UPDATING';
  const pkBien = t.pk?.nombre === x.pk && t.pk?.tipo === 'S';
  let okExiste = false;
  let rExiste;
  if (!exacta) rExiste = `Tu tabla se llama «${t.nombre}», pero se pidió exactamente «${x.tabla}». El nombre de una tabla no se puede cambiar: crea una con el nombre exacto (los demás puntos se revisaron en «${t.nombre}»).`;
  else if (!pkBien) {
    rExiste = t.pk?.nombre !== x.pk
      ? `La llave de partición de ${t.nombre} es «${t.pk?.nombre}», no «${x.pk}». En DynamoDB los nombres de atributo distinguen mayúsculas, y la llave no se cambia después: crea la tabla de nuevo con ${x.pk}.`
      : `La llave ${x.pk} es de tipo ${t.pk.tipo}; un número de guía como ${x.guia} lleva letras y guiones, así que va como String.`;
  } else if (!activa) rExiste = `La tabla ${t.nombre} está ${t.estado}. Espera unos segundos a que quede Active.`;
  else {
    okExiste = true;
    rExiste = `${t.nombre} está ${t.estado} con la llave de partición ${x.pk} (String): cada guía se encuentra directo por su número, en milisegundos, sin importar cuántas haya. Y no hay servidor de base que cuidar.`;
  }

  const okOnDemand = t.modo === 'PAY_PER_REQUEST';
  const rOnDemand = okOnDemand
    ? `${t.nombre} está en on-demand: paga cada lectura y escritura, y aguanta el pico de diciembre sin que nadie calcule capacidad. Cuando el tráfico ya es estable y predecible, el modo provisioned sale más barato.${nota}`
    : `${t.nombre} está en provisioned (${t.capacidad?.lectura ?? 0} RCU / ${t.capacidad?.escritura ?? 0} WCU): con un pico que nadie sabe medir, se puede quedar corta (peticiones rechazadas) o pagarse de más. Cámbiala en Additional settings → Read/write capacity settings → Edit → On-demand.${nota}`;

  const okPitr = Boolean(t.pitr);
  const rPitr = okPitr
    ? `${t.nombre} tiene PITR con ${t.pitr.dias} días: puedes restaurar la tabla a cualquier segundo de ese periodo (en una tabla nueva). Es lo que salva a la empresa si un error borra o daña guías.${nota}`
    : `${t.nombre} no tiene point-in-time recovery: si un error borra guías, no hay a qué segundo regresar. Actívalo en la pestaña Backups → Point-in-time recovery (PITR) → Edit.${nota}`;

  const okProt = Boolean(t.proteccion);
  const rProt = okProt
    ? `${t.nombre} tiene deletion protection: nadie la borra por accidente; primero habría que apagar la protección a propósito.${nota}`
    : `${t.nombre} no tiene deletion protection: un clic equivocado en Delete y se pierden todas las guías. Actívala en Additional settings → Deletion protection → Turn on.${nota}`;

  // La guía de prueba.
  const items = (t.items ?? []).map(itemDynamoPlano);
  const llave = t.pk?.nombre ?? x.pk;
  const conGuia = items.find((i) => String(i[llave] ?? '').trim() === x.guia) ?? items.find((i) => sinGuion(i[llave]) === sinGuion(x.guia));
  let okItem = false;
  let rItem;
  if (!conGuia) {
    rItem = items.length
      ? `${t.nombre} tiene ${items.length} ítem${items.length === 1 ? '' : 's'}, pero ninguno con ${llave} = ${x.guia}. Créalo en Explore items → Create item.${nota}`
      : `${t.nombre} todavía no tiene ítems. Registra la guía de prueba en Explore items → Create item: ${x.pk} = ${x.guia}, y agrega los atributos estado y destino (Add new attribute → String).${nota}`;
  } else {
    const exactaGuia = String(conGuia[llave]).trim() === x.guia;
    const estadoBien = normal(conGuia.estado) === normal(x.estadoGuia);
    const destinoBien = normal(conGuia.destino) === normal(x.destino);
    const faltan = [];
    if (!exactaGuia) faltan.push(`el número de guía está escrito «${conGuia[llave]}» y se pidió «${x.guia}» (un número de guía se busca tal cual)`);
    if (!estadoBien) faltan.push(conGuia.estado === undefined ? `le falta el atributo «estado»${Object.keys(conGuia).some((k) => normal(k) === 'estado') ? ' (en minúsculas: DynamoDB distingue mayúsculas en los nombres)' : ''}` : `estado dice «${conGuia.estado}» y se pidió «${x.estadoGuia}»`);
    if (!destinoBien) faltan.push(conGuia.destino === undefined ? `le falta el atributo «destino»${Object.keys(conGuia).some((k) => normal(k) === 'destino') ? ' (en minúsculas: DynamoDB distingue mayúsculas en los nombres)' : ''}` : `destino dice «${conGuia.destino}» y se pidió «${x.destino}»`);
    if (!faltan.length) {
      okItem = true;
      rItem = `La guía ${x.guia} está en ${t.nombre} con estado «${conGuia.estado}» y destino «${conGuia.destino}». En DynamoDB cada ítem puede traer los atributos que necesite; solo la llave es obligatoria.${nota}`;
    } else rItem = `Encontré la guía, pero ${faltan.join('; ')}. Edítala en Explore items.${nota}`;
  }
  return [check('existe', tExiste, 4, okExiste, rExiste), check('ondemand', tOnDemand, 3, okOnDemand, rOnDemand), check('pitr', tPitr, 3, okPitr, rPitr), check('proteccion', tProt, 2, okProt, rProt), check('item', tItem, 3, okItem, rItem)];
}

/* ============================================================= acceso */

/** Políticas que un rol de estos servidores puede tener además de la de DynamoDB sin romper el mínimo privilegio. */
const EXTRA_ACEPTABLE = ['AmazonSSMManagedInstanceCore'];

function checksAcceso(estado, x, ctx) {
  const { asg, servidores } = ctx;
  const tRol = 'Todos los servidores del sitio usan un rol de IAM (sin llaves de acceso)';
  const tMin = 'El rol solo tiene permisos de DynamoDB (mínimo privilegio)';
  const roles = estado.iam.roles;
  const rolDe = (nombre) => roles.find((r) => r.nombre.toLowerCase() === String(nombre ?? '').toLowerCase()) ?? null;
  if (!asg || !servidores.length) {
    const r = `${sinServidores(ctx)} El rol se revisa en los servidores del sitio de rastreo.`;
    return [check('rol', tRol, 3, false, r), check('minimo', tMin, 2, false, r)];
  }
  const sinRol = servidores.filter((i) => !rolDe(i.rolIam));
  const usados = [...new Set(servidores.map((i) => i.rolIam).filter(Boolean))].map(rolDe).filter(Boolean);
  const okRol = !sinRol.length && usados.length > 0;
  let rRol;
  if (okRol) rRol = `Tus ${servidores.length} servidores usan el rol «${usados.map((r) => r.nombre).join('», «')}». AWS les da credenciales temporales que rotan solas: nadie guarda llaves en el código.`;
  else if (usados.length || roles.length) {
    rRol = `Los servidores ${sinRol.map((i) => i.id).join(', ')} no tienen rol. Ponlo en la launch template (Advanced details → IAM instance profile), haz esa versión la predeterminada (Default) y reemplaza los servidores: termina uno a la vez y el grupo lanza otro con la plantilla nueva. Un servidor ya lanzado no cambia solo.`;
  } else rRol = 'No hay ningún rol de IAM. Créalo en IAM → Roles → Create role (trusted entity: AWS service → EC2) y ponlo en la launch template (Advanced details → IAM instance profile).';

  let okMin = false;
  let rMin;
  if (!usados.length) rMin = 'Sin rol en los servidores no hay permisos que revisar.';
  else {
    const malos = usados.flatMap((r) => r.politicas.filter((p) => p !== x.politica && !EXTRA_ACEPTABLE.includes(p)).map((p) => ({ r, p })));
    const sinDynamo = usados.filter((r) => !r.politicas.includes(x.politica));
    const noEc2 = usados.filter((r) => r.servicio !== 'ec2.amazonaws.com');
    if (noEc2.length) rMin = `El rol «${noEc2[0].nombre}» confía en ${noEc2[0].servicio}, no en EC2: los servidores no pueden asumirlo.`;
    else if (malos.length) {
      const { r, p } = malos[0];
      const info = politicaIam(p);
      rMin = `El rol «${r.nombre}» tiene ${p}${info?.servicio === '*' ? ', que da permisos sobre TODA la cuenta' : `, que da permisos de ${info?.servicio ?? 'otro servicio'}`}. Si alguien se mete a un servidor, tendría esos permisos. Deja solo ${x.politica}.`;
    } else if (sinDynamo.length) rMin = `El rol «${sinDynamo[0].nombre}» no tiene permisos de DynamoDB: la página no podría registrar los movimientos de las guías. Agrega ${x.politica}.`;
    else {
      okMin = true;
      rMin = `El rol solo tiene ${x.politica}${usados.some((r) => r.politicas.some((p) => EXTRA_ACEPTABLE.includes(p))) ? ' (y AmazonSSMManagedInstanceCore, que sirve para administrar sin SSH)' : ''}: los servidores no pueden tocar nada fuera de DynamoDB. En una empresa real se iría un paso más allá, con una política propia que solo permita esa tabla.`;
    }
  }
  return [check('rol', tRol, 3, okRol, rRol), check('minimo', tMin, 2, okMin, rMin)];
}

/* ========================================================= evidencias */

function checksEvidencias(estado, x) {
  const tExiste = `El bucket «${x.bucket}» existe`;
  const tCif = 'Cifrado por omisión con una llave de KMS (SSE-KMS)';
  const tArch = `Todos los objetos pasan a Glacier Instant Retrieval a los ${x.diasArchivo} días`;
  const tBorr = `Los objetos se borran a los ${x.diasBorrar} días (5 años), y ninguna regla los borra antes`;
  const eleccion = elegirBucket(estado, x.bucket, 'huasteca-evidencias');
  const b = eleccion.bucket;
  const rNombre = retroNombreBucket(estado, x.bucket, eleccion);
  if (!b) {
    return [
      check('existe', tExiste, 2, false, rNombre),
      checkBloqueo(eleccion, { id: 'bloqueo', puntos: 3 }),
      checkVersionado(eleccion, { id: 'versionado', puntos: 2 }),
      check('cifrado', tCif, 3, false, 'Sin el bucket no hay cifrado que revisar.'),
      check('archivo', tArch, 3, false, 'Sin el bucket no hay ciclo de vida que revisar.'),
      check('borrado', tBorr, 2, false, 'Sin el bucket no hay ciclo de vida que revisar.')
    ];
  }
  const nota = eleccion.exacto ? '' : ` (Revisé «${b.nombre}».)`;

  const okCif = ['SSE-KMS', 'DSSE-KMS'].includes(b.cifrado?.tipo);
  const rCif = okCif
    ? `${b.nombre} cifra cada foto nueva con ${b.cifrado.tipo}: la llave vive en KMS, puedes quitarle el permiso a quien no deba ver las fotos y cada uso de la llave queda en CloudTrail. Cifrar los datos personales es TU parte de la responsabilidad compartida.${nota}`
    : `${b.nombre} usa ${b.cifrado?.tipo ?? 'SSE-S3'}: las fotos sí están cifradas, pero con llaves que S3 maneja por dentro y cuyo uso no ves. Para datos personales se pidió KMS: Properties → Default encryption → Edit → SSE-KMS.${nota}`;

  const activas = (b.ciclo ?? []).filter((r) => r.estado === 'Enabled');
  const todo = activas.filter((r) => !r.prefijo);
  const conGir = todo.find((r) => r.transiciones.some((t) => t.clase === 'GLACIER_IR' && t.dias === x.diasArchivo));
  let okArch = false;
  let rArch;
  if (conGir) {
    okArch = true;
    rArch = `«${conGir.nombre}» manda todas las fotos a Glacier Instant Retrieval a los ${x.diasArchivo} días: cuesta mucho menos que Standard y, cuando hay una queja, la foto se abre en milisegundos. Deep Archive sería más barato, pero tarda horas en devolverla.${nota}`;
  } else {
    const gir = todo.find((r) => r.transiciones.some((t) => t.clase === 'GLACIER_IR'));
    const otraFria = todo.find((r) => r.transiciones.some((t) => ['GLACIER', 'DEEP_ARCHIVE'].includes(t.clase)));
    const ia = todo.find((r) => r.transiciones.some((t) => ['STANDARD_IA', 'ONEZONE_IA', 'INTELLIGENT_TIERING'].includes(t.clase)));
    const prefijo = activas.find((r) => r.prefijo);
    if (gir) rArch = `«${gir.nombre}» manda a Glacier Instant Retrieval el día ${gir.transiciones.find((t) => t.clase === 'GLACIER_IR').dias}; se pidió el día ${x.diasArchivo}. Edítala.${nota}`;
    else if (otraFria) rArch = `«${otraFria.nombre}» usa ${otraFria.transiciones.map((t) => t.clase).join(', ')}: Glacier Flexible Retrieval y Deep Archive tardan de minutos a horas en devolver un objeto, y la empresa necesita ver la foto al instante cuando hay una queja. La clase indicada es Glacier Instant Retrieval.${nota}`;
    else if (ia) rArch = `«${ia.nombre}» usa una clase de acceso poco frecuente (Standard-IA, One Zone-IA o Intelligent-Tiering). Funciona, pero para fotos que casi nunca se ven y deben abrirse al instante, Glacier Instant Retrieval es más barata. Se pidió esa clase el día ${x.diasArchivo}.${nota}`;
    else if (prefijo && !todo.length) rArch = `«${prefijo.nombre}» solo aplica al prefijo ${prefijo.prefijo}; se pidió para todas las fotos (Apply to all objects in the bucket).${nota}`;
    else rArch = `Tu bucket ${describirCiclo(b)}. Crea una regla en Management → Lifecycle rules para todo el bucket, con la transición a Glacier Instant Retrieval el día ${x.diasArchivo}.${nota}`;
  }

  const borranAntes = activas.filter((r) => r.expiracionDias !== null && r.expiracionDias !== undefined && r.expiracionDias < x.diasBorrar);
  const borraBien = todo.find((r) => r.expiracionDias === x.diasBorrar);
  let okBorr = false;
  let rBorr;
  if (borranAntes.length) rBorr = `La regla «${borranAntes[0].nombre}» borra las fotos el día ${borranAntes[0].expiracionDias}, antes de los 5 años que pide el SAT: la empresa se quedaría sin evidencias en una revisión. Cámbiala a ${x.diasBorrar} días.${nota}`;
  else if (borraBien) {
    okBorr = true;
    rBorr = `«${borraBien.nombre}» borra las fotos a los ${x.diasBorrar} días: se cumplen los 5 años del SAT y después no se paga por guardar datos personales que ya no hacen falta (y que, guardados de más, son un riesgo).${nota}`;
  } else {
    const otra = activas.find((r) => r.expiracionDias);
    rBorr = otra
      ? `«${otra.nombre}» borra a los ${otra.expiracionDias} días${otra.prefijo ? ` y solo en el prefijo ${otra.prefijo}` : ''}; se pidió todo el bucket a los ${x.diasBorrar} días (5 años).${nota}`
      : `Ninguna regla borra las fotos: se quedarían para siempre, pagando y con datos personales que ya no hacen falta. En la regla de ciclo de vida marca «Expire current versions of objects» con ${x.diasBorrar} días.${nota}`;
  }

  return [
    check('existe', tExiste, 2, eleccion.exacto, rNombre),
    checkBloqueo(eleccion, { id: 'bloqueo', puntos: 3 }),
    checkVersionado(eleccion, { id: 'versionado', puntos: 2 }),
    check('cifrado', tCif, 3, okCif, rCif),
    check('archivo', tArch, 3, okArch, rArch),
    check('borrado', tBorr, 2, okBorr, rBorr)
  ];
}

/* ============================================================ alertas */

const temas = (estado) => estado.sns?.temas ?? [];
const temaPorArn = (estado, arn) => temas(estado).find((t) => t.arn === arn) ?? null;
const esCorreo = (s) => s.protocolo === 'email' || s.protocolo === 'email-json';
const correoConfirmado = (t, correo) => (t?.suscripciones ?? []).some((s) => esCorreo(s) && s.estado === 'Confirmed' && normal(s.endpoint) === normal(correo));

function checksAlertas(estado, x, ctx) {
  const { tg } = ctx;
  const tTema = `Un tema de SNS con el correo ${x.correo} confirmado`;
  const tAlarma = 'Una alarma de UnHealthyHostCount del grupo de destino del sitio, que se activa con al menos un servidor enfermo';
  const tAviso = 'La alarma avisa por correo a través de ese tema (acción en In alarm)';

  // El tema
  const buenos = temas(estado).filter((t) => correoConfirmado(t, x.correo));
  let rTema;
  if (buenos.length) rTema = `«${buenos[0].nombre}» tiene el correo ${x.correo} confirmado: todo lo que se publique en el tema le llega a TI. SNS reparte un mensaje a todos los suscriptores (correo, SMS, colas, funciones).`;
  else {
    const pendiente = temas(estado).flatMap((t) => t.suscripciones.map((s) => ({ t, s }))).find(({ s }) => esCorreo(s) && normal(s.endpoint) === normal(x.correo));
    const otro = temas(estado).flatMap((t) => t.suscripciones.map((s) => ({ t, s }))).find(({ s }) => esCorreo(s));
    if (pendiente) rTema = `En «${pendiente.t.nombre}» el correo ${x.correo} sigue en ${pendiente.s.estado === 'Confirmed' ? 'Confirmed' : 'Pending confirmation'}: AWS no manda nada hasta que el dueño confirma. Ábrelo en la «Bandeja de correo (simulada)» de SNS y pulsa «Confirm subscription».`;
    else if (otro) rTema = `Tu tema «${otro.t.nombre}» avisa a ${otro.s.endpoint}, no a ${x.correo}. Agrega una suscripción Email con ${x.correo} y confírmala en la «Bandeja de correo (simulada)».`;
    else if (temas(estado).length) rTema = `Tienes el tema «${temas(estado)[0].nombre}», pero sin ningún correo suscrito. Crea una suscripción (Protocol: Email, Endpoint: ${x.correo}) y confírmala en la «Bandeja de correo (simulada)».`;
    else rTema = `No hay ningún tema de SNS. Créalo en SNS → Topics → Create topic (Standard), suscribe ${x.correo} con el protocolo Email y confírmalo en la «Bandeja de correo (simulada)».`;
  }

  // La alarma: la del alumno (no las TargetTracking-… que crea Auto Scaling) que mejor cumple.
  const dimTg = tg ? dimensionGrupoDestino(tg) : null;
  const alarmas = (estado.cloudwatch?.alarmas ?? []).filter((a) => !a.creadaPor);
  const evaluar = (a) => {
    const dim = a.metrica.dimensiones ?? {};
    const esElb = a.metrica.namespace === 'AWS/ApplicationELB';
    const esEnfermos = esElb && a.metrica.nombre === 'UnHealthyHostCount';
    const delTg = Boolean(dimTg && dim.TargetGroup === dimTg);
    const u = Number(a.umbral);
    const condicion = (a.comparacion === 'GreaterThanThreshold' && u >= 0 && u < 1) || (a.comparacion === 'GreaterThanOrEqualToThreshold' && u > 0 && u <= 1);
    const okAlarma = esEnfermos && delTg && condicion && a.estadistica !== 'SampleCount';
    let rAlarma;
    if (okAlarma) rAlarma = `«${a.nombre}» vigila UnHealthyHostCount de «${tg.nombre}» y se activa en cuanto el balanceador ve un servidor enfermo (${a.comparacion === 'GreaterThanThreshold' ? '>' : '>='} ${a.umbral}). Auto Scaling lo reemplaza solo, pero TI se entera y puede ver por qué falló.`;
    else if (esElb && a.metrica.nombre === 'HealthyHostCount') rAlarma = `«${a.nombre}» vigila HealthyHostCount, que cuenta los servidores SANOS. Se pidió avisar de los enfermos: usa UnHealthyHostCount (ApplicationELB → Per AppELB, per TG Metrics) y que se active con > 0.`;
    else if (!esEnfermos) rAlarma = `«${a.nombre}» vigila ${a.metrica.namespace} ${a.metrica.nombre}. Eso mide otra cosa: un servidor puede estar enfermo con la CPU tranquila. Se pidió la salud de los destinos: ApplicationELB → Per AppELB, per TG Metrics → UnHealthyHostCount del grupo del sitio.`;
    else if (!tg) rAlarma = `«${a.nombre}» vigila UnHealthyHostCount, pero todavía no hay un grupo de destino del sitio de rastreo que revisar (tarea 3).`;
    else if (!delTg) rAlarma = `«${a.nombre}» vigila UnHealthyHostCount de otro grupo de destino (${dim.TargetGroup ?? 'sin TargetGroup'}); el del sitio es «${tg.nombre}». Elige la métrica de ese grupo.`;
    else if (a.estadistica === 'SampleCount') rAlarma = `«${a.nombre}» usa SampleCount, que cuenta cuántos datos llegaron, no cuántos servidores están enfermos. Usa Maximum (o Average).`;
    else rAlarma = `«${a.nombre}» se activa cuando UnHealthyHostCount es ${a.comparacion} ${a.umbral}. Se pidió que avise con al menos un servidor enfermo: Greater > 0 (o Greater/Equal >= 1).`;

    const arnsSns = (a.acciones?.ALARM ?? []).filter((arn) => arn.startsWith('arn:aws:sns:'));
    const conAviso = arnsSns.map((arn) => temaPorArn(estado, arn)).filter((t) => correoConfirmado(t, x.correo));
    const okAviso = Boolean(a.accionesActivas !== false && conAviso.length);
    let rAviso;
    if (okAviso) rAviso = `Cuando «${a.nombre}» pase a In alarm, publica en «${conAviso[0].nombre}» y le llega el correo a ${x.correo}. CloudWatch vigila; SNS avisa.`;
    else if (a.accionesActivas === false) rAviso = `Las acciones de «${a.nombre}» están desactivadas: aunque se active, no avisa. Actívalas con Actions → Enable actions.`;
    else if (!arnsSns.length) rAviso = `«${a.nombre}» no tiene ninguna notificación en el estado In alarm: se pondría roja y nadie se enteraría. Edítala: en «Configure actions» agrega una notificación (In alarm) a tu tema.`;
    else rAviso = `«${a.nombre}» avisa al tema ${arnsSns.map((arn) => temaPorArn(estado, arn)?.nombre ?? arn).join(', ')}, que no tiene el correo ${x.correo} confirmado: el aviso no le llega a TI.`;
    return [check('alarma', tAlarma, 4, okAlarma, rAlarma), check('aviso', tAviso, 3, okAviso, rAviso)];
  };
  let checksAlarma;
  if (alarmas.length) checksAlarma = mejorPor(alarmas, evaluar).checks;
  else {
    const internas = (estado.cloudwatch?.alarmas ?? []).filter((a) => a.creadaPor);
    const r = internas.length
      ? 'Las únicas alarmas son las TargetTracking-… que crea Auto Scaling para su política: esas no se tocan y no avisan a nadie. Crea tu propia alarma en CloudWatch → Alarms → Create alarm.'
      : 'No hay ninguna alarma: si un servidor se enferma, TI se entera por las quejas. Créala en CloudWatch → Alarms → Create alarm, con ApplicationELB → Per AppELB, per TG Metrics → UnHealthyHostCount del grupo del sitio, y que notifique a tu tema.';
    checksAlarma = [check('alarma', tAlarma, 4, false, r), check('aviso', tAviso, 3, false, r)];
  }
  return [check('tema', tTema, 3, buenos.length > 0, rTema), ...checksAlarma];
}

/* ============================================================= costos */

/** Las etiquetas que de verdad lleva una instancia: las suyas, las de su plantilla y las que propaga su grupo. */
function etiquetasServidor(estado, inst, g) {
  const salida = {};
  for (const e of inst.etiquetas ?? []) salida[e.llave] = e.valor;
  const lt = g ? plantillaLanzamientoDe(estado, g.plantilla.id) : null;
  const n = g?.plantilla.version === '$Latest' ? lt?.ultimaVersion : g?.plantilla.version === '$Default' ? lt?.versionDefault : Number(g?.plantilla.version);
  for (const e of lt?.versiones.find((v) => v.numero === n)?.datos.etiquetas ?? []) if (salida[e.llave] === undefined) salida[e.llave] = e.valor;
  for (const e of g?.etiquetas ?? []) if (e.propagar !== false) salida[e.llave] = e.valor;
  return salida;
}
const deLista = (etiquetas) => Object.fromEntries((etiquetas ?? []).map((e) => [e.llave, e.valor]));

function checksCostos(estado, x, ctx) {
  const { llave, valor } = x.etiqueta;
  const par = `${llave} = ${valor}`;
  const tServ = `Los servidores del sitio llevan la etiqueta ${par}`;
  const tDatos = `La tabla y el bucket llevan la etiqueta ${par}`;
  const tActiva = `La etiqueta ${llave} está activada como etiqueta de asignación de costos`;
  const tMonto = `Un presupuesto de costo mensual de ${x.monto} USD`;
  const tAlerta = `Una alerta por correo cuando el gasto REAL llegue al ${x.porcentaje} %`;
  const tiene = (tags) => tags[llave] !== undefined && normal(tags[llave]) === normal(valor);
  const describir = (tags) => {
    if (tiene(tags)) return `${llave}=${tags[llave]}`;
    const casi = Object.keys(tags).find((k) => normal(k) === normal(llave));
    if (casi) return `${casi}=${tags[casi]} (la llave debe ser exactamente «${llave}»: las etiquetas distinguen mayúsculas)`;
    if (tags[llave] !== undefined) return `${llave}=${tags[llave]} (el valor debe ser «${valor}»)`;
    return 'sin la etiqueta';
  };

  // Los servidores
  const { asg, servidores } = ctx;
  let okServ = false;
  let rServ;
  if (!asg || !servidores.length) rServ = `${sinServidores(ctx)} La etiqueta se revisa en los servidores.`;
  else {
    const sin = servidores.filter((i) => !tiene(etiquetasServidor(estado, i, asg)));
    if (!sin.length) {
      okServ = true;
      rServ = `Los ${servidores.length} servidores llevan ${par}${asg.etiquetas.some((e) => e.llave === llave && e.propagar !== false) ? ` (el grupo «${asg.nombre}» se la pone a cada servidor que lanza, también a los reemplazos)` : ''}: su costo de EC2 se puede separar en la factura.`;
    } else rServ = `Los servidores ${sin.map((i) => `${i.id} (${describir(etiquetasServidor(estado, i, asg))})`).join(', ')} no llevan ${par}. Lo más seguro: ponla en la plantilla de lanzamiento (Resource tags, en una versión nueva) o en el grupo de Auto Scaling al crearlo (paso Add tags, con «Tag new instances»). Ojo: un servidor ya lanzado no cambia solo; reemplázalo o etiquétalo en EC2 → Instances → Tags.`;
  }

  // La tabla y el bucket
  const { tabla } = elegirTabla(estado, x);
  const { bucket } = elegirBucket(estado, x.bucket, 'huasteca-evidencias');
  const faltan = [];
  if (!tabla) faltan.push('no hay tabla de guías');
  else if (!tiene(deLista(tabla.etiquetas))) faltan.push(`la tabla ${tabla.nombre} está ${describir(deLista(tabla.etiquetas))} (DynamoDB → la tabla → Additional settings → Tags)`);
  if (!bucket) faltan.push('no hay bucket de evidencias');
  else if (!tiene(deLista(bucket.etiquetas))) faltan.push(`el bucket ${bucket.nombre} está ${describir(deLista(bucket.etiquetas))} (S3 → el bucket → Properties → Tags → Edit)`);
  const okDatos = !faltan.length;
  const rDatos = okDatos
    ? `La tabla ${tabla.nombre} y el bucket ${bucket.nombre} llevan ${par}. Con todo etiquetado igual, Cost Explorer agrupa el costo del proyecto sin importar el servicio.`
    : `Falta la etiqueta ${par}: ${faltan.join('; ')}.`;

  // La etiqueta activada
  const activas = estado.costos?.etiquetasActivas ?? [];
  const okActiva = activas.includes(llave);
  let rActiva;
  if (okActiva) rActiva = `${llave} está activa en Cost allocation tags: desde ahora la factura y Cost Explorer pueden agrupar por ella (AWS solo la aplica al gasto que llega después de activarla).`;
  else {
    const casi = activas.find((k) => normal(k) === normal(llave));
    rActiva = casi
      ? `Activaste «${casi}», no «${llave}». Para AWS son etiquetas distintas: activa la que pusiste en los recursos.`
      : `La etiqueta ${llave} no está activada como etiqueta de asignación de costos: aunque esté en los recursos, no aparece en la factura ni en Cost Explorer. Actívala en Billing and Cost Management → Cost allocation tags → User-defined → ${llave} → Activate (primero debe existir en algún recurso).`;
  }

  // El presupuesto
  const todos = estado.costos?.presupuestos ?? [];
  let checksPres;
  if (!todos.length) {
    const r = 'No hay ningún presupuesto. Créalo en Billing and Cost Management → Budgets → Create budget → Customize (advanced) → Cost budget.';
    checksPres = [check('monto', tMonto, 2, false, r), check('alerta', tAlerta, 2, false, r)];
  } else {
    const alertaBuena = (b, a) =>
      a.disparador === 'ACTUAL' &&
      (a.correos?.length || a.temaSns) &&
      ((a.tipoUmbral === 'PERCENTAGE' && a.umbral === x.porcentaje) || (a.tipoUmbral === 'ABSOLUTE_VALUE' && Math.abs(a.umbral - (b.monto * x.porcentaje) / 100) < 0.01));
    const evaluar = (b) => {
      const okMonto = b.tipo === 'COST' && b.periodo === 'MONTHLY' && b.monto === x.monto;
      const filtro = b.filtros?.etiquetas?.length ? ` Lo filtraste por ${b.filtros.etiquetas.map((e) => `${e.llave}=${e.valor}`).join(', ')}: así vigila solo el proyecto.` : '';
      let rMonto;
      if (okMonto) rMonto = `«${b.nombre}» vigila el costo de cada mes contra ${x.monto} USD.${filtro} Un presupuesto no detiene nada: avisa, para que alguien decida a tiempo.`;
      else if (b.tipo !== 'COST') rMonto = `«${b.nombre}» es de tipo ${b.tipo}; se pidió un presupuesto de costo (Cost budget).`;
      else if (b.periodo !== 'MONTHLY') rMonto = `«${b.nombre}» es ${b.periodo}; se pidió un monto por mes (Monthly).`;
      else rMonto = `«${b.nombre}» tiene ${b.monto} USD; se pidieron ${x.monto} USD al mes. Edítalo.`;
      const ok = b.alertas.find((a) => alertaBuena(b, a));
      let rAlerta;
      if (ok) rAlerta = `Cuando el gasto real llegue al ${x.porcentaje} % (${((b.monto * x.porcentaje) / 100).toFixed(2)} USD), llega el correo: todavía hay margen para reaccionar antes de pasarse.`;
      else if (!b.alertas.length) rAlerta = `«${b.nombre}» no tiene alertas: nadie se enteraría. Edítalo y agrega una alerta Actual al ${x.porcentaje} % con un correo.`;
      else if (b.alertas.every((a) => a.disparador === 'FORECASTED')) rAlerta = `Tus alertas son Forecasted (avisan si el pronóstico va a pasar el umbral). Se pidió una sobre el gasto real (Actual) al ${x.porcentaje} %.`;
      else rAlerta = `Tus alertas son: ${b.alertas.map((a) => `${a.disparador} ${a.umbral}${a.tipoUmbral === 'PERCENTAGE' ? ' %' : ' USD'}`).join(', ')}. Se pidió Actual al ${x.porcentaje} % del presupuesto, con un correo.`;
      return [check('monto', tMonto, 2, okMonto, rMonto), check('alerta', tAlerta, 2, Boolean(ok), rAlerta)];
    };
    checksPres = mejorPor(todos, evaluar).checks;
  }
  return [check('etiquetas-servidores', tServ, 2, okServ, rServ), check('etiquetas-datos', tDatos, 2, okDatos, rDatos), check('activa', tActiva, 2, okActiva, rActiva), ...checksPres];
}

/* =============================================================== bono */

function checksEscala(estado, x, ctx) {
  const { asg } = ctx;
  const tPol = `Una política de target tracking de peticiones por servidor (ALBRequestCountPerTarget) cerca de ${x.peticiones}`;
  const tMax = `Capacidad máxima de ${x.maximo} a 10 servidores`;
  if (!asg) {
    const r = 'Es el bono opcional: necesita primero el grupo de Auto Scaling del sitio. No hacerlo no te quita puntos.';
    return [check('politica', tPol, 5, false, r), check('maximo', tMax, 3, false, r)];
  }
  const tt = asg.politicas.filter((p) => p.tipo === 'TargetTrackingScaling' && p.habilitada !== false);
  const buena = tt.find((p) => p.metrica === 'ALBRequestCountPerTarget' && p.objetivo >= x.peticiones / 2 && p.objetivo <= x.peticiones * 2);
  let rPol;
  if (buena) rPol = `«${buena.nombre}» mantiene unas ${buena.objetivo} peticiones por servidor: si llegan más visitas, Auto Scaling agrega servidores; si bajan, los quita. Para una página web, las peticiones reflejan la demanda mejor que la CPU.`;
  else if (tt.some((p) => p.metrica === 'ALBRequestCountPerTarget')) {
    const p = tt.find((q) => q.metrica === 'ALBRequestCountPerTarget');
    rPol = `Tu política «${p.nombre}» sigue las peticiones por servidor, pero con objetivo ${p.objetivo}; se pidió cerca de ${x.peticiones} (entre ${x.peticiones / 2} y ${x.peticiones * 2}).`;
  } else if (tt.length) rPol = `Tu política «${tt[0].nombre}» sigue ${tt[0].metrica}; se pidió «Application Load Balancer request count per target» (las peticiones que recibe cada servidor), cerca de ${x.peticiones}.`;
  else if (asg.politicas.length) rPol = `Tu grupo tiene políticas de tipo ${asg.politicas.map((p) => p.tipo).join(', ')}; se pidió target tracking, que calcula sola cuántos servidores hacen falta.`;
  else rPol = 'Es el bono opcional: si agregas una política de target tracking con las peticiones por servidor (Automatic scaling → Create dynamic scaling policy), suma puntos extra. No hacerla no te quita puntos.';
  const okMax = asg.max >= x.maximo && asg.max <= 10;
  const rMax = okMax
    ? `Máximo ${asg.max}: espacio para crecer en diciembre, con un tope para que un pico raro (o un ataque) no dispare la factura.`
    : asg.max > 10
      ? `Máximo ${asg.max}: sin un tope razonable, un pico raro (o un ataque) puede lanzar muchos servidores y disparar la factura. Déjalo entre ${x.maximo} y 10.`
      : `Máximo ${asg.max}: con eso el grupo no tiene espacio para crecer (la política no puede pasar del máximo). Súbelo a entre ${x.maximo} y 10 en el detalle del grupo → Capacity overview → Edit.`;
  return [check('politica', tPol, 5, Boolean(buena), rPol), check('maximo', tMax, 3, okMax, rMax)];
}

/* ============================================================== revisar */

export function revisar(estadoOriginal, datos) {
  const estado = preparar(estadoOriginal);
  const x = datosLab(datos);
  const ctx = contexto(estado, x);
  return armar(LAB.tareas(datos), {
    red: checksRed(estado, x, ctx),
    puertas: checksPuertas(estado, x, ctx),
    rastreo: checksRastreo(estado, x, ctx),
    guias: checksGuias(estado, x),
    acceso: checksAcceso(estado, x, ctx),
    evidencias: checksEvidencias(estado, x),
    alertas: checksAlertas(estado, x, ctx),
    costos: checksCostos(estado, x, ctx),
    escala: checksEscala(estado, x, ctx)
  });
}

/* ============================================================= solución */

const SEGUNDO = 1000;
const MINUTO = 60 * SEGUNDO;

/**
 * Un reloj de la cuenta que avanza a pasos de 5 s (Auto Scaling y los health
 * checks van paso a paso, como en la consola, que llama avanzar cada segundo).
 */
function relojDe(e) {
  let t = reloj.ahora();
  return (ms) => {
    for (const fin = t + ms; t < fin; ) {
      t = Math.min(fin, t + 5 * SEGUNDO);
      avanzar(e, t);
    }
  };
}

/** La cuenta resuelta, hecha solo con acciones del modelo (como en la consola). */
export function solucion(datos) {
  const x = datosLab(datos);
  const e = LAB.estadoInicial(datos);
  const pasar = relojDe(e);
  const tag = { llave: x.etiqueta.llave, valor: x.etiqueta.valor };

  // red: VPC and more, 2 zonas, 2 públicas, 2 privadas y un NAT
  const { vpc, publicas, privadas } = crearVpcCompleta(e, { prefijo: x.prefijo, cidr: x.vpcCidr, zonas: 2, publicas: 2, privadas: 2, nat: 'una' });

  // puertas: el balanceador abierto al 80 y los servidores solo desde él
  const sgAlb = crearGrupoSeguridad(e, { nombre: x.sgAlb, descripcion: 'Balanceador del rastreo: HTTP desde internet', vpcId: vpc.id, entrada: [{ protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' }] });
  const sgWeb = crearGrupoSeguridad(e, { nombre: x.sgWeb, descripcion: 'Servidores del rastreo: HTTP solo desde el balanceador', vpcId: vpc.id, entrada: [{ protocolo: 'tcp', desde: 80, hasta: 80, origen: sgAlb.id }] });

  // acceso: el rol solo de DynamoDB
  crearRol(e, { nombre: x.rol, servicio: 'ec2.amazonaws.com', politicas: [x.politica] });

  // rastreo: plantilla, grupo de destino, balanceador y Auto Scaling (con la etiqueta y el bono)
  const plantilla = crearPlantillaLanzamiento(e, {
    nombre: x.plantilla,
    datos: { ami: 'al2023', tipo: 't3.micro', gruposSeguridad: [sgWeb.id], userData: x.userData, perfilIam: x.rol }
  });
  const tg = crearGrupoDestino(e, { nombre: x.tg, tipoDestino: 'instance', protocolo: 'HTTP', puerto: 80, vpcId: vpc.id, chequeo: { ruta: '/' } });
  const alb = crearBalanceador(e, {
    nombre: x.alb,
    tipo: 'application',
    esquema: 'internet-facing',
    vpcId: vpc.id,
    subredes: publicas.map((s) => s.id),
    gruposSeguridad: [sgAlb.id],
    oyentes: [{ protocolo: 'HTTP', puerto: 80, tgArn: tg.arn }]
  });
  crearGrupoAutoScaling(e, {
    nombre: x.asg,
    plantillaId: plantilla.id,
    version: '$Default',
    subredes: privadas.map((s) => s.id),
    gruposDestino: [tg.arn],
    tipoSalud: 'ELB',
    gracia: 300,
    min: 2,
    deseado: 2,
    max: x.maximo,
    politica: { nombre: 'peticiones-100', metrica: 'ALBRequestCountPerTarget', objetivo: x.peticiones, grupoDestino: tg.arn },
    etiquetas: [{ ...tag, propagar: true }]
  });

  // guías: on-demand, protegida, con PITR y la guía de prueba
  crearTablaDynamo(e, { nombre: x.tabla, pk: { nombre: x.pk, tipo: 'S' }, modo: 'PAY_PER_REQUEST', proteccion: true, etiquetas: [tag] });

  // evidencias: bucket bloqueado (por omisión), versionado, SSE-KMS, etiqueta y ciclo de vida
  crearBucket(e, { nombre: x.bucket, versionado: true, cifrado: 'SSE-KMS', etiquetas: [tag] });
  crearReglaCiclo(e, x.bucket, { nombre: 'fotos-a-glacier-ir-y-5-anios', prefijo: null, transiciones: [{ dias: x.diasArchivo, clase: 'GLACIER_IR' }], expiracionDias: x.diasBorrar });

  // alertas: el tema con el correo confirmado y la alarma de servidores enfermos
  const tema = crearTema(e, { nombre: x.tema, nombreMostrar: 'TI Huasteca' });
  const sub = crearSuscripcion(e, { temaArn: tema.arn, protocolo: 'email', endpoint: x.correo });
  confirmarSuscripcion(e, sub.arn);
  crearAlarma(e, {
    nombre: 'rastreo-servidor-enfermo',
    metrica: { namespace: 'AWS/ApplicationELB', nombre: 'UnHealthyHostCount', dimensiones: { LoadBalancer: dimensionBalanceador(alb), TargetGroup: dimensionGrupoDestino(tg) } },
    estadistica: 'Maximum',
    periodo: 60,
    comparacion: 'GreaterThanThreshold',
    umbral: 0,
    evaluaciones: 1,
    acciones: { ALARM: [tema.arn] }
  });

  // costos: la etiqueta activada y el presupuesto con su alerta real
  activarEtiquetasCosto(e, [x.etiqueta.llave]);
  crearPresupuesto(e, {
    nombre: x.presupuesto,
    tipo: 'COST',
    periodo: 'MONTHLY',
    monto: x.monto,
    alertas: [{ umbral: x.porcentaje, tipoUmbral: 'PERCENTAGE', disparador: 'ACTUAL', correos: [x.correo] }]
  });

  // Que todo arranque: el NAT, la tabla, los servidores y los health checks.
  pasar(30 * SEGUNDO);
  editarPitrDynamo(e, x.tabla, true, 35);
  ponerItemDynamo(e, x.tabla, { [x.pk]: { S: x.guia }, estado: { S: x.estadoGuia }, destino: { S: x.destino } });
  pasar(2 * MINUTO);
  return e;
}
