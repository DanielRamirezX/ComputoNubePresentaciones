// Rúbrica de la práctica integradora 1 (sesión 9) · La tienda de artesanías de Oaxaca.
//
// Revisa la cuenta como la dejó el alumno, por RESULTADOS: la red en dos zonas
// con su parte pública y privada, los grupos de seguridad encadenados
// (internet → balanceador → web → base), el grupo de Auto Scaling repartido en
// dos zonas con su política de seguimiento, el balanceador que de verdad abre la
// página (red.js recorre casa → ALB → destino sano → Apache), la base MySQL
// Multi-AZ privada y cifrada (conexionBase, del modelo de RDS, dice si los
// servidores llegan a ella), el bucket de las fotos y la alarma que avisa por
// SNS. El bono revisa que la «prueba del Buen Fin» sí ocurrió: la alarma sonó,
// llegó el correo y el grupo creció por su política.
//
// Elige «el recurso del alumno» con tolerancia (por lo que hace, no por cómo se
// llama): los nombres son sugerencias, salvo el del bucket. Solo servidor: el
// navegador nunca recibe este archivo.

import {
  avanzar,
  ami,
  conexionBase,
  confirmarSuscripcion,
  crearAlarma,
  crearBalanceador,
  crearBaseRds,
  crearBucket,
  crearGrupoAutoScaling,
  crearGrupoDestino,
  crearGrupoSeguridad,
  crearGrupoSubredesRds,
  crearPlantillaLanzamiento,
  crearSuscripcion,
  crearTema,
  crearVpcCompleta,
  grupoDe,
  grupoDestinoDe,
  igwDeVpc,
  instanciaDe,
  plantillaLanzamientoDe,
  reloj,
  simularCargaAsg,
  subredDe,
  tablaDeSubred,
  temaSns,
  textoPuertos,
  tipoDeRegla,
  versionDePlantilla
} from '../../public/consola/modelo.js';
import { esSubredPublica, probarPagina } from '../../public/consola/red.js';
import { LAB, datosLab } from '../../public/labs/practica-1.js';
import {
  armar,
  check,
  checkBloqueo,
  checkVersionado,
  contiene,
  elegirBucket,
  elegirVpc,
  explicarRuta,
  fmtSubred,
  httpAbierto,
  mejorPor,
  preparar,
  retroIgw,
  retroNombreBucket,
  sinVpc,
  sshDemasiado
} from './comun.js';

/**
 * Dónde repasar cada punto en la Ruta AWS (ver src/repaso.js). La clave
 * 'tarea/check' gana sobre la de la tarea.
 */
export const REPASO = {
  red: ['s3-vpc/3', 's3-lab-vpc/6'],
  'red/igw': ['s3-vpc/1', 's3-lab-vpc/10'],
  'red/publicas': ['s3-vpc/3', 's1-global/1'],
  'red/privadas': ['s3-lab-vpc/9', 's3-vpc/3'],

  seguridad: ['s2-lab-seguridad/13', 's2-servicios/3'],
  'seguridad/alb': ['s6-balanceadores/1', 's2-lab-seguridad/14'],
  'seguridad/web': ['s2-lab-seguridad/14', 's6-balanceadores/1'],
  'seguridad/ssh': ['s2-lab-seguridad/14', 's2-servicios/3'],
  'seguridad/db': ['s2-lab-seguridad/14', 's5-relacionales/2'],

  servidores: ['s6-elasticidad/2', 's6-lab-escalar/6'],
  'servidores/plantilla': ['s6-lab-escalar/3', 's6-lab-escalar/5'],
  'servidores/zonas': ['s6-lab-escalar/7', 's1-global/1'],
  'servidores/capacidad': ['s6-lab-escalar/9', 's6-elasticidad/2'],
  'servidores/instancias': ['s6-lab-escalar/11', 's6-lab-escalar/12'],
  'servidores/escalado': ['s6-lab-escalar/9', 's6-elasticidad/1'],

  balanceador: 's6-balanceadores/1',
  'balanceador/alb': ['s6-balanceadores/1', 's3-vpc/3'],
  'balanceador/listener': 's6-balanceadores/1',
  'balanceador/conectado': ['s6-lab-escalar/8', 's6-balanceadores/1'],
  'balanceador/pagina': ['s6-balanceadores/1', 's6-lab-escalar/11'],

  base: ['s5-disponibilidad/1', 's5-relacionales/2'],
  'base/existe': ['s5-relacionales/2', 's5-relacionales/3'],
  'base/multiaz': ['s5-disponibilidad/1', 's1-global/1'],
  'base/privada': ['s3-vpc/3', 's5-relacionales/2'],
  'base/cifrado': ['s2-servicios/1', 's2-responsabilidad/1'],
  'base/respaldos': ['s5-disponibilidad/1', 's5-repaso/1'],

  fotos: 's4-seguridad/1',
  'fotos/bucket': ['s4-lab-almacenamiento/3', 's4-s3/1'],
  'fotos/bloqueo': ['s4-lab-almacenamiento/4', 's4-seguridad/1'],
  'fotos/versionado': ['s4-lab-almacenamiento/5', 's4-seguridad/1'],

  alarma: 's6-monitorear/1',
  'alarma/tema': ['s6-serverless/2', 's6-monitorear/1'],
  'alarma/alarma': ['s6-monitorear/1', 's6-lab-escalar/15'],
  'alarma/accion': ['s6-lab-escalar/15', 's6-serverless/2'],

  prueba: ['s6-elasticidad/1', 's6-lab-escalar/13'],
  'prueba/sono': ['s6-monitorear/1', 's6-lab-escalar/15'],
  'prueba/correo': ['s6-serverless/2', 's6-monitorear/1'],
  'prueba/crecio': ['s6-lab-escalar/13', 's6-elasticidad/1']
};

/* ============================================================== ayudas */

const nombre = (r) => (r?.nombre ? `«${r.nombre}»` : '');
const fmtSg = (g) => `${g.nombre} (${g.id})`;
const zonasDe = (subredes) => [...new Set(subredes.map((s) => s.az))].sort();
const cubre = (r, puerto) => r.protocolo === '-1' || (r.protocolo === 'tcp' && r.desde <= puerto && puerto <= r.hasta);
const esGrupo = (origen) => String(origen ?? '').startsWith('sg-');
const reglasA = (estado, ids, puerto) =>
  ids.flatMap((id) => (grupoDe(estado, id)?.entrada ?? []).filter((r) => cubre(r, puerto)).map((r) => ({ grupo: grupoDe(estado, id), regla: r })));
const fmtRegla = ({ grupo, regla }) => `${tipoDeRegla(regla)} ${textoPuertos(regla)} desde ${regla.origen} (en ${grupo.nombre})`;
const nombresSg = (estado, ids) => ids.map((id) => grupoDe(estado, id)).filter(Boolean).map(fmtSg).join(', ') || 'ninguno';

/** Un grupo de seguridad de la VPC por nombre (para revisar el grupo aunque todavía no lo use nadie). */
const sgPorNombre = (estado, vpc, n) => (vpc ? estado.gruposSeguridad.find((g) => g.vpcId === vpc.id && g.nombre.toLowerCase() === n.toLowerCase()) ?? null : null);

/** Las subredes de la VPC del alumno, separadas en públicas y privadas. */
function subredesVpc(estado, vpc) {
  const todas = vpc ? estado.subredes.filter((s) => s.vpcId === vpc.id) : [];
  return {
    todas,
    publicas: todas.filter((s) => esSubredPublica(estado, s.id)),
    privadas: todas.filter((s) => !esSubredPublica(estado, s.id))
  };
}

/* ======================================================= elegir recursos */

/** Las instancias del grupo que están en servicio y encendidas. */
function enServicio(estado, g) {
  return (g?.instancias ?? [])
    .filter((m) => m.ciclo === 'InService')
    .map((m) => instanciaDe(estado, m.id))
    .filter((i) => i && i.estado === 'running');
}

/** El grupo de Auto Scaling del alumno: el de su VPC con el nombre sugerido o el que más servidores tiene. */
function elegirAsg(estado, x, vpc) {
  const grupos = (estado.autoscaling?.grupos ?? []).filter((g) => g.estado === 'activo');
  const enVpc = vpc ? grupos.filter((g) => g.subredes.some((id) => subredDe(estado, id)?.vpcId === vpc.id)) : [];
  const peso = (g) => (g.nombre === x.asg ? 100 : 0) + enServicio(estado, g).length * 10 + (g.gruposDestino.length ? 5 : 0) + g.politicas.length;
  return [...enVpc].sort((a, b) => peso(b) - peso(a))[0] ?? null;
}

/** Los grupos de Auto Scaling que quedaron fuera de la VPC del alumno (para la retro). */
const asgFuera = (estado, vpc) => (estado.autoscaling?.grupos ?? []).filter((g) => g.estado === 'activo' && !g.subredes.some((id) => subredDe(estado, id)?.vpcId === vpc?.id));

/** La plantilla (y su versión) que usa el grupo; si no hay grupo, la del nombre sugerido o la última. */
function elegirPlantilla(estado, x, g) {
  if (g) {
    const p = plantillaLanzamientoDe(estado, g.plantilla.id);
    if (p) return { plantilla: p, version: versionDePlantilla(p, g.plantilla.version) ?? null };
  }
  const plantillas = estado.autoscaling?.plantillas ?? [];
  const p = plantillas.find((t) => t.nombre === x.plantilla) ?? plantillas.at(-1) ?? null;
  return p ? { plantilla: p, version: versionDePlantilla(p, '$Default') ?? null } : { plantilla: null, version: null };
}

/** Los grupos de seguridad de los servidores web: los de sus instancias o, si no hay, los de la plantilla. */
function gruposWeb(estado, x, vpc, g, version) {
  const deInstancias = [...new Set(enServicio(estado, g).flatMap((i) => i.gruposSeguridad))];
  if (deInstancias.length) return deInstancias;
  if (version?.datos.gruposSeguridad.length) return [...version.datos.gruposSeguridad];
  const porNombre = sgPorNombre(estado, vpc, x.sgWeb);
  return porNombre ? [porNombre.id] : [];
}

/** Los Application Load Balancers de la VPC. */
const albsVpc = (estado, vpc) => (estado.elb?.balanceadores ?? []).filter((b) => b.tipo === 'application' && vpc && b.vpcId === vpc.id);

/** El oyente HTTP:80 de un balanceador y su grupo de destino. */
function oyente80(estado, lb) {
  const o = lb?.oyentes.find((y) => y.protocolo === 'HTTP' && y.puerto === 80) ?? null;
  const tg = o?.accion?.tipo === 'forward' ? grupoDestinoDe(estado, o.accion.tgArn) : null;
  return { oyente: o, tg };
}

/** El balanceador del alumno: el que manda tráfico a un grupo de destino de su ASG, o el del nombre sugerido. */
function elegirAlb(estado, x, vpc, g) {
  const albs = albsVpc(estado, vpc);
  const peso = (b) => {
    const { tg } = oyente80(estado, b);
    return (tg && g?.gruposDestino.includes(tg.arn) ? 100 : 0) + (b.nombre === x.alb ? 20 : 0) + (tg ? 10 : 0) + (b.estado === 'active' ? 5 : 0) + (b.esquema === 'internet-facing' ? 2 : 0);
  };
  return [...albs].sort((a, b) => peso(b) - peso(a))[0] ?? null;
}

/** Las bases MySQL principales (no réplicas ni miembros de clúster) que no se están borrando. */
const basesCandidatas = (estado) => (estado.rds?.instancias ?? []).filter((i) => i.rol !== 'replica' && !i.clusterId && !['deleting', 'deleted'].includes(i.estado));

const LISTA = ['available', 'backing-up', 'modifying', 'storage-optimization', 'configuring-enhanced-monitoring', 'rebooting'];

/** La base del alumno: en su VPC, MySQL, con el nombre sugerido o la que más cumple. */
function elegirBase(estado, x, vpc) {
  const peso = (b) => (vpc && b.vpcId === vpc.id ? 100 : 0) + (b.motor === 'mysql' ? 30 : 0) + (b.id === x.db ? 10 : 0) + (b.multiAz ? 5 : 0) + (LISTA.includes(b.estado) ? 3 : 0) + (b.publica ? 0 : 1);
  return [...basesCandidatas(estado)].sort((a, b) => peso(b) - peso(a))[0] ?? null;
}

/** Las alarmas que creó el alumno (no las de target tracking que crea Auto Scaling). */
const alarmasAlumno = (estado) => (estado.cloudwatch?.alarmas ?? []).filter((a) => a.creadaPor !== 'autoscaling' && !a.nombre.startsWith('TargetTracking-'));

/** Los temas de SNS de las acciones «In alarm» de una alarma. */
const temasDeAlarma = (estado, a) => (a?.acciones?.ALARM ?? []).filter((arn) => /^arn:aws:sns:/.test(arn)).map((arn) => temaSns(estado, arn)).filter(Boolean);
const emailConfirmado = (t) => (t?.suscripciones ?? []).some((s) => (s.protocolo === 'email' || s.protocolo === 'email-json') && s.estado === 'Confirmed');

/* ================================================================= red */

function revisarRed(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  const tIgw = 'Un Internet Gateway conectado a la VPC de la tienda';
  const tPub = 'Dos subredes públicas en dos zonas distintas (0.0.0.0/0 → Internet Gateway)';
  const tPriv = 'Dos subredes privadas en dos zonas distintas (sin ruta al Internet Gateway)';
  if (!vpc) {
    const r = sinVpc(estado, x.vpcCidr);
    return [check('igw', tIgw, 3, false, r), check('publicas', tPub, 6, false, r), check('privadas', tPriv, 6, false, r)];
  }
  const { todas, publicas, privadas } = subredesVpc(estado, vpc);
  const igw = igwDeVpc(estado, vpc.id);

  const zPub = zonasDe(publicas);
  const okPub = zPub.length >= 2;
  let rPub;
  if (okPub) rPub = `Tus subredes públicas ${publicas.map(fmtSubred).join('; ')} salen a internet por ${igw.id} y están en ${zPub.join(' y ')}. Ahí vivirá el balanceador: si una zona se cae, el balanceador sigue atendiendo desde la otra.`;
  else if (!todas.length) rPub = `Tu VPC ${vpc.id} (${vpc.cidr}) todavía no tiene subredes. Lo más rápido: borra la VPC y créala con «VPC and more» (2 zonas, 2 públicas y 2 privadas), o crea las subredes a mano en VPC → Subnets.`;
  else if (publicas.length) rPub = `Solo tienes subredes públicas en ${zPub.join(', ')}: ${publicas.map(fmtSubred).join('; ')}. Se piden dos zonas distintas; un balanceador de aplicación no se puede crear con una sola zona. Crea otra subred pública en otra zona y asóciala a la tabla de rutas que va al Internet Gateway.`;
  else {
    const candidata = todas.find((s) => /pub/i.test(s.nombre)) ?? todas[0];
    rPub = `Ninguna de tus subredes es pública todavía. ${explicarRuta(estado, candidata)}${igw ? '' : ` ${retroIgw(estado, vpc)}`}`;
  }

  const zPriv = zonasDe(privadas);
  const okPriv = zPriv.length >= 2;
  let rPriv;
  if (okPriv) rPriv = `Tus subredes privadas ${privadas.map(fmtSubred).join('; ')} no tienen ruta al Internet Gateway: nadie de internet puede llegar a lo que pongas ahí (la base de datos). Y están en dos zonas, que es lo que pide una base Multi-AZ.`;
  else if (privadas.length) rPriv = `Solo tienes subredes privadas en ${zPriv.join(', ')} (${privadas.map(fmtSubred).join('; ')}). Para una base Multi-AZ, RDS necesita subredes en al menos dos zonas: crea otra privada en otra zona.`;
  else if (todas.length) {
    rPriv = `Todas tus subredes salen a internet por el Internet Gateway, así que ninguna es privada. ${
      tablaDeSubred(estado, todas[0].id)?.principal ? 'Si pusiste la ruta 0.0.0.0/0 en la tabla principal, todas las subredes sin tabla propia la heredan: déjala solo en una tabla asociada a las públicas.' : 'Las privadas deben usar una tabla de rutas sin 0.0.0.0/0 → igw.'
    }`;
  } else rPriv = `Tu VPC ${vpc.id} todavía no tiene subredes. Faltan dos privadas en dos zonas distintas.`;

  return [check('igw', tIgw, 3, igw, retroIgw(estado, vpc)), check('publicas', tPub, 6, okPub, rPub), check('privadas', tPriv, 6, okPriv, rPriv)];
}

/* ========================================================== seguridad */

function revisarSeguridad(estado, x, c) {
  const { vpc, alb, web, base, asg } = c;
  const tAlb = 'Los clientes entran al balanceador por HTTP (80) desde cualquier lugar';
  const tWeb = 'Los servidores web aceptan HTTP (80) solo desde el grupo del balanceador';
  const tSsh = 'Nadie de internet puede entrar por SSH a los servidores web';
  const tDb = `La base acepta MySQL (${x.puertoDb}) solo desde el grupo de los servidores web`;
  if (!vpc) {
    const r = `${sinVpc(estado, x.vpcCidr)} Los grupos de seguridad viven dentro de esa VPC.`;
    const corta = 'Primero hace falta la VPC de la tienda: los grupos de seguridad se crean dentro de ella (mira el primer punto de esta tarea).';
    return [check('alb', tAlb, 3, false, r), check('web', tWeb, 5, false, corta), check('ssh', tSsh, 2, false, corta), check('db', tDb, 5, false, corta)];
  }

  // El balanceador: su grupo (o, si todavía no hay balanceador, el grupo con el nombre sugerido).
  const sgAlbNombre = sgPorNombre(estado, vpc, x.sgAlb);
  const idsAlb = alb ? alb.gruposSeguridad : sgAlbNombre ? [sgAlbNombre.id] : [];
  const okAlb = idsAlb.length > 0 && httpAbierto(estado, idsAlb, x.ipCasa);
  let rAlb;
  if (okAlb) {
    // Solo se nombran los grupos que de verdad abren el 80 a internet (el balanceador puede traer también el default).
    const conRegla = reglasA(estado, idsAlb, 80).filter(({ regla }) => !esGrupo(regla.origen));
    const abiertas = conRegla.filter(({ regla }) => regla.origen === '0.0.0.0/0');
    const abren = [...new Set((abiertas.length ? abiertas : conRegla).map(({ grupo }) => fmtSg(grupo)))];
    const origen = abiertas.length ? '0.0.0.0/0' : 'cualquier lugar';
    const otros = idsAlb.map((id) => grupoDe(estado, id)).filter((g) => g && !abren.includes(fmtSg(g)));
    rAlb = `${abren.join(', ')} deja${abren.length > 1 ? 'n' : ''} entrar HTTP (80) desde ${origen}. La puerta de la tienda tiene que abrirse para cualquier cliente, venga de donde venga.${otros.length ? ` El balanceador también trae ${otros.map(fmtSg).join(', ')}; no estorba, pero puedes quitar${otros.length > 1 ? 'los' : 'lo'} en el balanceador → Security → Edit.` : ''}${alb ? '' : ' (Todavía no hay balanceador que lo use: pónselo al crearlo.)'}`;
  }
  else if (!idsAlb.length) rAlb = `Todavía no hay balanceador ni un grupo «${x.sgAlb}» en tu VPC. Créalo en EC2 → Security Groups con la regla HTTP (80) desde Anywhere-IPv4 (0.0.0.0/0).`;
  else {
    const reglas = reglasA(estado, idsAlb, 80);
    rAlb = `El balanceador usa ${nombresSg(estado, idsAlb)}, que ${reglas.length ? `solo deja entrar el 80 así: ${reglas.map(fmtRegla).join('; ')}` : 'no tiene ninguna regla para el puerto 80'}. Los clientes no tienen IP fija: la regla HTTP (80) debe tener origen 0.0.0.0/0.${alb && alb.gruposSeguridad.some((id) => grupoDe(estado, id)?.porDefecto) ? ' El grupo «default» de la VPC solo deja entrar a quien trae ese mismo grupo: cámbialo por el tuyo en el balanceador → Security → Edit.' : ''}`;
  }

  // Los servidores web: todo lo que abre el 80 debe venir de un grupo, y uno de ellos debe ser el del balanceador.
  const permitidosWeb = new Set(idsAlb);
  const r80 = reglasA(estado, web, 80);
  const porIp80 = r80.filter(({ regla }) => !esGrupo(regla.origen));
  const desdeAlb = r80.filter(({ regla }) => permitidosWeb.has(regla.origen));
  const okWeb = web.length > 0 && porIp80.length === 0 && desdeAlb.length > 0;
  let rWeb;
  if (okWeb) rWeb = `${nombresSg(estado, web)} solo deja entrar el 80 desde el grupo del balanceador (${desdeAlb[0].regla.origen}). Aunque alguien encuentre la IP de un servidor, no puede saltarse al balanceador.`;
  else if (!web.length) rWeb = `Todavía no hay servidores web ni plantilla con grupo de seguridad que revisar. Crea ${x.sgWeb} con HTTP (80) cuyo origen sea el grupo ${x.sgAlb}, y úsalo en tu plantilla de lanzamiento.`;
  else if (porIp80.length) {
    rWeb = `Los servidores web usan ${nombresSg(estado, web)}, que deja entrar el 80 por IP: ${porIp80.map(fmtRegla).join('; ')}. Así cualquiera ${porIp80.some(({ regla }) => regla.origen === '0.0.0.0/0') ? 'en internet' : 'en ese bloque'} puede llegarles sin pasar por el balanceador. Cambia esa regla: origen «Custom» y el grupo ${x.sgAlb} (sg-…).`;
  } else if (!idsAlb.length) rWeb = `Los servidores web usan ${nombresSg(estado, web)}, pero todavía no hay balanceador (ni grupo ${x.sgAlb}) del cual aceptar tráfico.`;
  else if (r80.length) rWeb = `Los servidores web usan ${nombresSg(estado, web)} y su regla del 80 viene de ${r80.map(({ regla }) => regla.origen).join(', ')}, que no es el grupo del balanceador (${idsAlb.join(', ')}). Pon como origen el grupo que usa tu balanceador; si no, los health checks fallan y la página no abre.`;
  else rWeb = `Los servidores web usan ${nombresSg(estado, web)}, que no deja entrar el puerto 80 desde ningún lado: el balanceador no puede hablarles. Agrega HTTP (80) con origen el grupo ${x.sgAlb}.${web.some((id) => grupoDe(estado, id)?.porDefecto) ? ' Ojo: la plantilla quedó con el grupo «default» de la VPC; elige tu grupo web en la plantilla.' : ''}`;

  // SSH
  const malasSsh = web.length ? sshDemasiado(estado, web, x.ipCasa) : [];
  const okSsh = web.length > 0 && malasSsh.length === 0;
  const rSsh = okSsh
    ? 'Ningún grupo de los servidores deja entrar SSH desde internet. En un grupo de Auto Scaling los servidores se reemplazan solos: no hace falta entrar a mano, y cada puerto cerrado es un ataque menos.'
    : !web.length
      ? 'Todavía no hay servidores web cuyos grupos revisar.'
      : `${fmtRegla(malasSsh[0])} deja que ${malasSsh[0].regla.origen === '0.0.0.0/0' ? 'cualquier computadora del mundo' : `todo el bloque ${malasSsh[0].regla.origen}`} intente entrar por SSH. Bórrala (EC2 → Security Groups → ${malasSsh[0].grupo.nombre} → Edit inbound rules): estos servidores no necesitan SSH.`;

  // La base: su grupo (o, si todavía no hay base, el grupo con el nombre sugerido).
  const sgDbNombre = sgPorNombre(estado, vpc, x.sgDb);
  const idsDb = base && base.vpcId === vpc.id ? base.gruposSeguridad : sgDbNombre ? [sgDbNombre.id] : [];
  const permitidosDb = new Set(web.length ? web : [sgPorNombre(estado, vpc, x.sgWeb)?.id].filter(Boolean));
  const r3306 = reglasA(estado, idsDb, x.puertoDb);
  const porIpDb = r3306.filter(({ regla }) => !esGrupo(regla.origen));
  const desdeWeb = r3306.filter(({ regla }) => permitidosDb.has(regla.origen));
  const servidor = enServicio(estado, asg)[0] ?? null;
  const conexion = servidor && base && base.vpcId === vpc.id ? conexionBase(estado, servidor.id, base.id) : null;
  const okDb = idsDb.length > 0 && porIpDb.length === 0 && desdeWeb.length > 0 && (!conexion || conexion.ok);
  let rDb;
  if (okDb) rDb = `${nombresSg(estado, idsDb)} solo deja entrar el ${x.puertoDb} desde el grupo de los servidores web (${desdeWeb[0].regla.origen}).${conexion ? ` Lo comprobé: ${servidor.id} sí llega a la base.` : ''} Es la defensa en capas: la base ni siquiera contesta a quien no es un servidor de la tienda.`;
  else if (!idsDb.length) rDb = base && base.vpcId !== vpc.id ? 'Tu base está fuera de la VPC de la tienda (mira la tarea de la base), así que no tiene sentido revisar quién le llega.' : `Todavía no hay base ni un grupo «${x.sgDb}» en tu VPC. Créalo con MYSQL/Aurora (${x.puertoDb}) cuyo origen sea el grupo ${x.sgWeb}.`;
  else if (porIpDb.length) rDb = `El grupo de la base deja entrar el ${x.puertoDb} por IP: ${porIpDb.map(fmtRegla).join('; ')}. Mínimo privilegio: solo los servidores web hablan con la base. Cambia el origen por el grupo ${x.sgWeb} (sg-…).`;
  else if (!r3306.length) rDb = `La base usa ${nombresSg(estado, idsDb)}, que no deja entrar el puerto ${x.puertoDb} desde ningún lado: la tienda no podría guardar pedidos. Agrega MYSQL/Aurora con origen el grupo ${x.sgWeb}.${idsDb.some((id) => grupoDe(estado, id)?.porDefecto) ? ' Además usa el grupo «default»: cámbialo por el tuyo con Modify → Connectivity.' : ''}`;
  else if (!desdeWeb.length) rDb = `La regla del ${x.puertoDb} de la base viene de ${r3306.map(({ regla }) => regla.origen).join(', ')}, que no es el grupo de tus servidores web (${[...permitidosDb].join(', ') || 'todavía no hay'}). Pon como origen el grupo que usan los servidores.`;
  else rDb = `Las reglas se ven bien, pero ${servidor.id} no llega a la base: ${conexion.motivo}`;

  return [check('alb', tAlb, 3, okAlb, rAlb), check('web', tWeb, 5, okWeb, rWeb), check('ssh', tSsh, 2, okSsh, rSsh), check('db', tDb, 5, okDb, rDb)];
}

/* ========================================================= servidores */

function revisarServidores(estado, x, c) {
  const { vpc, asg, plantilla, version } = c;
  const tPlantilla = 'Una plantilla de lanzamiento con Amazon Linux 2023 en t2.micro o t3.micro';
  const tZonas = 'El grupo de Auto Scaling reparte sus servidores en dos zonas de tu VPC';
  const tCap = `Capacidad: mínimo ${x.min} y máximo ${x.max}`;
  const tInst = `Al menos ${x.min} servidores del grupo en servicio, en zonas distintas`;
  const tEsc = `Política Target tracking: CPU promedio al ${x.objetivoCpu} %`;

  // La plantilla
  const imagen = version ? ami(version.datos.ami) : null;
  const okPlantilla = Boolean(version && imagen?.clave === 'al2023' && x.tipos.includes(version.datos.tipo));
  let rPlantilla;
  if (okPlantilla) rPlantilla = `Tu plantilla ${nombre(plantilla)} (${plantilla.id}, versión ${version.numero}) es la receta de cada servidor: Amazon Linux 2023 en ${version.datos.tipo}. Auto Scaling la usa cada vez que necesita uno nuevo, así que todos salen iguales.`;
  else if (!plantilla) rPlantilla = 'No hay ninguna plantilla de lanzamiento. Créala en EC2 → Launch Templates → Create launch template.';
  else rPlantilla = `Tu plantilla ${nombre(plantilla)} usa ${imagen?.nombre ?? version?.datos.ami ?? '¿?'} en ${version?.datos.tipo ?? '¿?'}; se pidió Amazon Linux 2023 en t2.micro o t3.micro. Crea una versión nueva (Actions → Modify template), hazla Default y el grupo la usará para los servidores nuevos.`;

  if (!asg) {
    const fuera = vpc ? asgFuera(estado, vpc) : [];
    const r = !vpc
      ? `${sinVpc(estado, x.vpcCidr)} El grupo de Auto Scaling va dentro de esa VPC.`
      : fuera.length
        ? `Tu grupo «${fuera[0].nombre}» usa subredes que no son de tu VPC ${vpc.cidr}. Los servidores de la tienda deben vivir en su red: crea el grupo eligiendo tu VPC y dos de sus subredes.`
        : 'Todavía no hay un grupo de Auto Scaling en tu VPC. Créalo en EC2 → Auto Scaling Groups → Create Auto Scaling group.';
    const corta = 'Este punto se revisa en el grupo de Auto Scaling, que todavía no existe en tu VPC (mira el punto de las zonas).';
    return [check('plantilla', tPlantilla, 3, okPlantilla, rPlantilla), check('zonas', tZonas, 5, false, r), check('capacidad', tCap, 4, false, corta), check('instancias', tInst, 5, false, corta), check('escalado', tEsc, 3, false, corta)];
  }

  const subredes = asg.subredes.map((id) => subredDe(estado, id)).filter(Boolean);
  const zonas = zonasDe(subredes);
  const okZonas = zonas.length >= 2;
  const rZonas = okZonas
    ? `«${asg.nombre}» lanza servidores en ${zonas.join(' y ')}. Si una zona completa falla, los servidores de la otra siguen vendiendo y el grupo lanza reemplazos donde sí se puede.`
    : `«${asg.nombre}» solo usa ${subredes.map(fmtSubred).join('; ')}, todo en ${zonas.join(', ') || 'ninguna zona'}. Si esa zona falla, la tienda se cae completa. Edita el grupo (Details → Network → Edit) y agrega una subred de otra zona.`;

  const okCap = asg.min === x.min && asg.max === x.max;
  const rCap = okCap
    ? `Mínimo ${asg.min}: nunca baja de un servidor por zona. Máximo ${asg.max}: en hora pico crece, pero el gasto tiene un tope. Ahora la capacidad deseada es ${asg.deseado}.`
    : `Tu grupo tiene mínimo ${asg.min}, deseada ${asg.deseado} y máximo ${asg.max}; se pidió mínimo ${x.min} y máximo ${x.max}. ${asg.min < x.min ? 'Con menos de dos, una zona se queda sin servidor. ' : ''}${asg.max <= asg.min ? 'Si el máximo es igual al mínimo, el grupo no puede crecer en la hora pico. ' : asg.max > x.max ? 'Un máximo alto deja crecer el gasto sin control. ' : ''}Cámbialo en el detalle del grupo → Capacity overview → Edit.`;

  const vivos = enServicio(estado, asg);
  const zonasVivos = [...new Set(vivos.map((i) => i.az))];
  const okInst = vivos.length >= x.min && zonasVivos.length >= 2;
  let rInst;
  if (okInst) rInst = `${vivos.length} servidores en servicio (${vivos.map((i) => `${i.id} en ${i.az}`).join(', ')}). Si uno se apaga o deja de contestar, el grupo lo nota y lanza otro solo: eso es la autocuración.`;
  else {
    const pendientes = asg.instancias.filter((m) => m.ciclo === 'Pending').length;
    const fallo = asg.actividad.find((a) => a.estado === 'Failed');
    // Si el balanceador los marca unhealthy, el grupo los termina y lanza otros: nunca se quedan.
    const porSalud = asg.actividad.filter((a) => /ELB system health check failure/.test(a.causa ?? '')).length;
    let porQue = '';
    if (porSalud) {
      porQue = ` El grupo ya reemplazó ${porSalud} servidor(es) porque el balanceador los marcó unhealthy: nacen, no contestan el health check y salen. Revisa que el grupo web deje entrar el 80 desde el grupo del balanceador (tarea de seguridad) y que la plantilla use Amazon Linux 2023 con el User data tal cual (instala Apache).`;
    } else if (fallo) porQue = ` La última actividad fallida dice: «${fallo.descripcion}». Revísala en la pestaña Activity.`;
    else if (pendientes) porQue = ' Espera unos segundos y vuelve a revisar.';
    else if (asg.deseado < x.min) porQue = ` La capacidad deseada es ${asg.deseado}: súbela a ${x.min}.`;
    else if (zonasVivos.length < 2) porQue = ' Un grupo en una sola zona no aguanta que esa zona falle (mira el punto de las zonas).';
    rInst = `Ahora hay ${vivos.length} servidor(es) en servicio${zonasVivos.length ? ` (en ${zonasVivos.join(', ')})` : ''}${pendientes ? ` y ${pendientes} arrancando (Pending)` : ''}.${porQue}`;
  }

  const politicas = asg.politicas.filter((p) => p.tipo === 'TargetTrackingScaling' && p.habilitada);
  const buena = politicas.find((p) => p.metrica === 'ASGAverageCPUUtilization' && Number(p.objetivo) === x.objetivoCpu);
  let rEsc;
  if (buena) rEsc = `La política «${buena.nombre}» mantiene la CPU promedio cerca del ${x.objetivoCpu} %: si sube, Auto Scaling agrega servidores; si baja, los quita. Pagas solo por lo que la tienda necesita en cada momento (elasticidad).`;
  else if (politicas.length) {
    const p = politicas[0];
    rEsc = `Tu política «${p.nombre}» sigue ${p.metrica === 'ASGAverageCPUUtilization' ? 'la CPU promedio' : p.metrica} con objetivo ${p.objetivo}; se pidió CPU promedio (Average CPU utilization) al ${x.objetivoCpu} %. Edítala en la pestaña Automatic scaling.`;
  } else if (asg.politicas.length) rEsc = `Tu grupo tiene la política «${asg.politicas[0].nombre}» de tipo ${asg.politicas[0].tipo}${asg.politicas[0].habilitada ? '' : ' (deshabilitada)'}; se pidió una de seguimiento de objetivo (Target tracking), que crea y ajusta sus alarmas sola.`;
  else rEsc = 'Tu grupo no tiene política de escalado: tendría siempre los mismos servidores, aunque llegue el Buen Fin. Agrégala en la pestaña Automatic scaling → Create dynamic scaling policy → Target tracking scaling.';

  return [
    check('plantilla', tPlantilla, 3, okPlantilla, rPlantilla),
    check('zonas', tZonas, 5, okZonas, rZonas),
    check('capacidad', tCap, 4, okCap, rCap),
    check('instancias', tInst, 5, okInst, rInst),
    check('escalado', tEsc, 3, Boolean(buena), rEsc)
  ];
}

/* ======================================================== balanceador */

function revisarBalanceador(estado, x, c) {
  const { vpc, asg, alb } = c;
  const tAlb = 'Un Application Load Balancer internet-facing y activo en dos subredes públicas';
  const tOyente = 'Un listener HTTP:80 que manda a un grupo de destino HTTP:80 de tipo instancia';
  const tConectado = 'El grupo de Auto Scaling está conectado al grupo de destino, con revisiones de salud ELB';
  const tPagina = `La tienda abre desde internet por el DNS del balanceador y dice «${x.textoPagina}» y «${x.textoTaller}»`;
  if (!alb) {
    const otros = (estado.elb?.balanceadores ?? []).filter((b) => !vpc || b.vpcId !== vpc.id || b.tipo !== 'application');
    const r = !vpc
      ? `${sinVpc(estado, x.vpcCidr)} El balanceador va dentro de esa VPC.`
      : otros.length
        ? `Tu balanceador «${otros[0].nombre}» ${otros[0].tipo !== 'application' ? `es de tipo ${otros[0].tipo}; se pidió un Application Load Balancer (el que entiende HTTP).` : 'está en otra VPC, no en la de la tienda.'}`
        : 'Todavía no hay balanceador en tu VPC. Créalo en EC2 → Load Balancers → Create load balancer → Application Load Balancer.';
    const corta = 'Este punto se revisa en el balanceador, que todavía no existe en tu VPC (mira el primer punto de esta tarea).';
    return [check('alb', tAlb, 4, false, r), check('listener', tOyente, 3, false, corta), check('conectado', tConectado, 3, false, corta), check('pagina', tPagina, 5, false, corta)];
  }

  const subredes = alb.subredes.map((id) => subredDe(estado, id)).filter(Boolean);
  const privadas = subredes.filter((s) => !esSubredPublica(estado, s.id));
  const zonas = zonasDe(subredes);
  const okAlb = alb.esquema === 'internet-facing' && alb.estado === 'active' && zonas.length >= 2 && privadas.length === 0;
  let rAlb;
  if (okAlb) rAlb = `«${alb.nombre}» está Active, es internet-facing y vive en ${zonas.join(' y ')}, en subredes públicas. Es la única puerta de entrada de la tienda: reparte a los clientes entre los servidores sanos.`;
  else if (alb.esquema !== 'internet-facing') rAlb = `«${alb.nombre}» es internal: su DNS da IP privadas que nadie de internet alcanza. El esquema no se cambia; crea otro con «Internet-facing».`;
  else if (privadas.length) rAlb = `«${alb.nombre}» está en ${privadas.map(fmtSubred).join('; ')}, que no ${privadas.length === 1 ? 'es pública' : 'son públicas'}: los clientes no llegan por ahí. Cámbialo a tus subredes públicas en la pestaña Network mapping → Edit subnets.`;
  else if (alb.estado !== 'active') rAlb = `«${alb.nombre}» todavía está ${alb.estado}. Tarda unos 20 segundos en quedar Active: vuelve a revisar.`;
  else rAlb = `«${alb.nombre}» solo está en ${zonas.join(', ')}.`;

  const { oyente, tg } = oyente80(estado, alb);
  const okOyente = Boolean(tg && tg.protocolo === 'HTTP' && tg.puerto === 80 && tg.tipoDestino === 'instance' && tg.vpcId === alb.vpcId);
  let rOyente;
  if (okOyente) rOyente = `El listener HTTP:80 manda (forward) al grupo de destino «${tg.nombre}» (HTTP:80, instancias). El balanceador escucha en un puerto y entrega a los servidores que estén en ese grupo.`;
  else if (!oyente) rOyente = `«${alb.nombre}» no tiene un listener HTTP:80${alb.oyentes.length ? ` (tiene ${alb.oyentes.map((o) => `${o.protocolo}:${o.puerto}`).join(', ')})` : ''}. Agrégalo en la pestaña Listeners and rules → Add listener, con Forward to tu grupo de destino.`;
  else if (!tg) rOyente = 'El listener HTTP:80 no manda a ningún grupo de destino (su acción no es Forward). Edítalo para que haga Forward to tu grupo de destino.';
  else rOyente = `El listener manda a «${tg.nombre}», que es ${tg.protocolo}:${tg.puerto}. Apache contesta por HTTP en el 80: crea un grupo de destino HTTP:80 de tipo Instances.`;

  const conectado = Boolean(asg && tg && asg.gruposDestino.includes(tg.arn));
  const okConectado = conectado && asg.tipoSalud === 'ELB';
  let rConectado;
  if (okConectado) rConectado = `«${asg.nombre}» registra solo a sus servidores en «${tg.nombre}» y usa los health checks del balanceador: si Apache deja de contestar, el servidor sale y llega uno nuevo, aunque la instancia siga «running».`;
  else if (!asg) rConectado = 'Todavía no hay un grupo de Auto Scaling en tu VPC que conectar al balanceador.';
  else if (!tg) rConectado = 'Primero el balanceador necesita su listener con un grupo de destino; luego conectas el grupo de Auto Scaling a ese grupo de destino.';
  else if (!conectado) rConectado = `«${asg.nombre}» ${asg.gruposDestino.length ? 'está conectado a otro grupo de destino' : 'no está conectado a ningún grupo de destino'}, así que el balanceador no tiene a quién mandar clientes. En el detalle del grupo: pestaña Integrations → Load balancing → Edit, y elige «${tg.nombre}».`;
  else rConectado = `«${asg.nombre}» ya está en «${tg.nombre}», pero sus revisiones de salud son de tipo ${asg.tipoSalud}: solo ve si la instancia está encendida, no si la tienda contesta. Prende «Elastic Load Balancing health checks» en Details → Health checks → Edit.`;

  const r = probarPagina(estado, `http://${alb.dns}`);
  const abre = r.resultado === 'ok' && r.codigoHttp === 200;
  const conTexto = abre && contiene(r.html, x.textoPagina) && contiene(r.html, x.textoTaller);
  let rPagina;
  if (conTexto) rPagina = `http://${alb.dns} abre la tienda desde internet: balanceador, listener, destinos sanos y Apache están en orden. Comparte el DNS del balanceador, nunca la IP de un servidor: los servidores cambian, el balanceador se queda.`;
  else if (abre) rPagina = `http://${alb.dns} abre, pero no dice «${x.textoPagina}» y «${x.textoTaller}». Copia el User data de la tarea tal cual en tu plantilla (crea una versión nueva y hazla Default); los servidores nuevos ya saldrán con la página correcta.`;
  else if (r.resultado === 'ok') {
    const destinos = tg?.destinos ?? [];
    const malo = destinos.find((dd) => dd.salud === 'unhealthy');
    let porQue = '';
    if (r.codigoHttp === 503 && !destinos.length) porQue = 'Un 503 del balanceador significa que su grupo de destino no tiene servidores registrados: conecta tu grupo de Auto Scaling al grupo de destino.';
    else if (r.codigoHttp === 503 && destinos.every((dd) => dd.salud === 'initial')) porQue = `Los ${destinos.length} servidores registrados todavía están en «initial» (el balanceador apenas los está revisando): espera unos segundos.`;
    else if (destinos.length) {
      porQue = `El grupo de destino tiene ${destinos.length} servidor(es) registrados, pero ninguno sano${malo?.motivo ? ` (${malo.motivo.codigo}: ${malo.motivo.descripcion})` : ''}. Revisa que el grupo web deje entrar el 80 desde el grupo del balanceador y que la plantilla use Amazon Linux 2023 con el User data tal cual (instala Apache).`;
    }
    rPagina = `http://${alb.dns} contesta ${r.codigoHttp}. ${porQue}`;
  }
  else {
    const fallo = r.diagnostico.find((p) => !p.ok);
    rPagina = `Al abrir http://${alb.dns} sale ${r.error?.codigo ?? 'un error'}.${fallo ? ` Se atoró en «${fallo.paso}»: ${fallo.detalle}` : ''}`;
  }
  return [check('alb', tAlb, 4, okAlb, rAlb), check('listener', tOyente, 3, okOyente, rOyente), check('conectado', tConectado, 3, okConectado, rConectado), check('pagina', tPagina, 5, conTexto, rPagina)];
}

/* =============================================================== base */

function revisarBase(estado, x, c) {
  const { vpc, base } = c;
  const tExiste = 'Una base MySQL de RDS en la VPC de la tienda, disponible';
  const tMulti = 'Multi-AZ DB instance: una copia en espera en otra zona';
  const tPriv = 'Privada: Public access No y en las subredes privadas';
  const tCifra = 'La base está cifrada';
  const tResp = `Respaldos automáticos de ${x.retencion} días`;
  if (!base) {
    const cluster = (estado.rds?.clusteres ?? []).find((k) => !['deleting', 'deleted'].includes(k.estado));
    const r = cluster
      ? `Creaste un clúster (${cluster.id}, ${cluster.tipo === 'aurora' ? 'Aurora' : 'Multi-AZ DB cluster'}), no una DB instance. Se pidió MySQL con «Multi-AZ DB instance deployment».`
      : 'Todavía no hay ninguna base en RDS. Créala en Aurora and RDS → Databases → Create database (primero el DB subnet group con tus subredes privadas).';
    const corta = 'Este punto se revisa en la base de datos, que todavía no existe (mira el primer punto de esta tarea).';
    return [check('existe', tExiste, 3, false, r), check('multiaz', tMulti, 4, false, corta), check('privada', tPriv, 4, false, corta), check('cifrado', tCifra, 2, false, corta), check('respaldos', tResp, 2, false, corta)];
  }

  const enVpc = Boolean(vpc && base.vpcId === vpc.id);
  const lista_ = LISTA.includes(base.estado);
  const okExiste = enVpc && base.motor === 'mysql' && lista_;
  let rExiste;
  if (okExiste) rExiste = `Tu base «${base.id}» (MySQL ${base.version}) está ${base.estado === 'available' ? 'Available' : `funcionando (${base.estado})`} en la VPC de la tienda. AWS la instala, la parcha y la respalda; tú solo guardas pedidos.`;
  else if (!enVpc) rExiste = `Tu base «${base.id}» está en ${base.vpcId}${vpc ? `, no en la VPC de la tienda (${vpc.cidr})` : ''}: los servidores de la tienda no la verían. La VPC de una base no se cambia fácil: créala de nuevo eligiendo tu VPC y tu DB subnet group de subredes privadas (y borra la que sobra para no pagar doble).`;
  else if (base.motor !== 'mysql') rExiste = `Tu base «${base.id}» usa ${base.motor}; la tienda está escrita para MySQL.`;
  else if (base.estado === 'creating') rExiste = `Tu base «${base.id}» todavía se está creando (Creating). Espera unos segundos y vuelve a revisar.`;
  else rExiste = `Tu base «${base.id}» está en estado ${base.estado}${base.estado === 'stopped' ? ': enciéndela con Actions → Start' : ''}.`;

  const okMulti = Boolean(base.multiAz && base.zonaSecundaria);
  const rMulti = okMulti
    ? `La principal está en ${base.zona} y la copia en espera en ${base.zonaSecundaria}. RDS copia cada cambio a la espera; si la principal falla, cambia sola en uno o dos minutos y la tienda sigue con el mismo endpoint.`
    : `Tu base es Single-AZ (solo en ${base.zona}): si esa zona falla, la tienda se queda sin pedidos. Cámbiala con Modify → Availability and durability → «Create a standby instance», con Apply immediately (la plantilla Free tier no lo permite).`;

  const subredesBase = [base.subredId, base.subredSecundaria].filter(Boolean).map((id) => subredDe(estado, id)).filter(Boolean);
  const enPublica = subredesBase.filter((s) => esSubredPublica(estado, s.id));
  const okPriv = enVpc && !base.publica && enPublica.length === 0;
  let rPriv;
  if (okPriv) rPriv = `La base no tiene IP pública y vive en ${subredesBase.map(fmtSubred).join(' y ')}, sin ruta a internet. Aunque alguien conozca su endpoint, desde afuera no hay camino.`;
  else if (!enVpc) rPriv = 'La base no está en la VPC de la tienda (mira el primer punto de esta tarea).';
  else if (base.publica) rPriv = `Tu base tiene Public access: Yes (IP pública ${base.ipPublica ?? ''}). Los datos de los clientes no deben estar a un paso de internet. Cámbialo con Modify → Connectivity → Public access: No.`;
  else {
    const automatico = String(base.grupoSubredes).startsWith('default-');
    rPriv = `Tu base quedó en ${enPublica.map(fmtSubred).join(' y ')}, que ${enPublica.length === 1 ? 'es una subred pública' : 'son subredes públicas'} (tienen ruta 0.0.0.0/0 al Internet Gateway). ${
      automatico
        ? `Su DB subnet group «${base.grupoSubredes}» lo armó la consola con todas las subredes de la VPC. Crea uno con solo tus dos privadas y crea la base de nuevo con él.`
        : `Su DB subnet group «${base.grupoSubredes}» usa esas subredes: si son tus «privadas», revisa sus tablas de rutas (tarea de la red); si no, crea un subnet group con solo las privadas y crea la base de nuevo con él.`
    }`;
  }

  const rCifra = base.cifrada
    ? `La base y sus respaldos están cifrados con KMS${base.llaveKms ? ` (${base.llaveKms})` : ' (aws/rds)'}. Si alguien se llevara los discos, solo vería basura. En el modelo de responsabilidad compartida, activar el cifrado te toca a ti.`
    : 'Tu base no está cifrada. El cifrado solo se elige al crearla: crea la base de nuevo con «Enable encryption» (o restaura una copia cifrada de un snapshot).';

  const okResp = base.retencion === x.retencion;
  const rResp = okResp
    ? `RDS respalda la base cada día y guarda ${base.retencion} días: puedes regresarla a cualquier segundo de esos días (point-in-time recovery).`
    : base.retencion === 0
      ? `Los respaldos automáticos están apagados (0 días): un borrado por error sería para siempre. Pon ${x.retencion} días con Modify → Backup retention period y Apply immediately.`
      : `Tu base guarda los respaldos ${base.retencion} días; la cooperativa pidió ${x.retencion}. Cámbialo con Modify → Backup retention period y Apply immediately.`;

  return [check('existe', tExiste, 3, okExiste, rExiste), check('multiaz', tMulti, 4, okMulti, rMulti), check('privada', tPriv, 4, okPriv, rPriv), check('cifrado', tCifra, 2, base.cifrada, rCifra), check('respaldos', tResp, 2, okResp, rResp)];
}

/* ============================================================== fotos */

function revisarFotos(estado, x) {
  const el = elegirBucket(estado, x.bucket, 'barroytelar');
  return [check('bucket', `Existe el bucket «${x.bucket}»`, 3, el.exacto, retroNombreBucket(estado, x.bucket, el)), checkBloqueo(el, { puntos: 4 }), checkVersionado(el, { puntos: 3 })];
}

/* ============================================================= alarma */

/** Los checks de una alarma candidata (también sirven para elegir la mejor). */
function checksAlarma(estado, x, asg, a) {
  const tTema = 'Un tema de SNS con una suscripción Email confirmada';
  const tAlarma = `Una alarma sobre la CPU promedio del grupo de Auto Scaling, mayor a ${x.umbral} %`;
  const tAccion = 'La alarma avisa al tema cuando entra en alarma (In alarm)';

  // El tema: el de la alarma si tiene; si no, el del nombre sugerido o cualquiera con correo confirmado.
  const temas = estado.sns?.temas ?? [];
  const deAlarma = temasDeAlarma(estado, a);
  const tema = deAlarma.find(emailConfirmado) ?? deAlarma[0] ?? temas.find((t) => t.nombre === x.tema) ?? temas.find(emailConfirmado) ?? temas[0] ?? null;
  const okTema = emailConfirmado(tema);
  let rTema;
  if (okTema) rTema = `El tema «${tema.nombre}» tiene una suscripción de correo confirmada. SNS es el altavoz: quien publique ahí (la alarma) llega a todos los suscritos a la vez.`;
  else if (!tema) rTema = 'No hay ningún tema de SNS. Créalo en Simple Notification Service → Topics → Create topic (Standard) y suscribe tu correo.';
  else {
    const pendiente = tema.suscripciones.find((s) => s.protocolo.startsWith('email') && s.estado !== 'Confirmed');
    rTema = pendiente
      ? `Tu suscripción ${pendiente.endpoint} al tema «${tema.nombre}» sigue en «Pending confirmation». Abre la Bandeja de correo (simulada) en SNS y pulsa «Confirm subscription»: sin confirmar, SNS no te manda nada.`
      : `El tema «${tema.nombre}» no tiene ninguna suscripción de correo (Email). Agrégala con Create subscription → Protocol: Email.`;
  }

  // La alarma: CPU del grupo, condición «mayor que» el umbral.
  const m = a?.metrica;
  const dim = m?.dimensiones ?? {};
  const delGrupo = Boolean(m && m.namespace === 'AWS/EC2' && m.nombre === 'CPUUtilization' && dim.AutoScalingGroupName && (!asg || dim.AutoScalingGroupName === asg.nombre));
  const mayor = a && ['GreaterThanThreshold', 'GreaterThanOrEqualToThreshold'].includes(a.comparacion);
  const okAlarma = delGrupo && mayor && Number(a.umbral) === x.umbral;
  let rAlarma;
  if (okAlarma) rAlarma = `«${a.nombre}» vigila la CPU promedio de todo el grupo «${dim.AutoScalingGroupName}» y se dispara arriba de ${x.umbral} %. Como vigila al grupo y no a una instancia, sigue sirviendo aunque los servidores se reemplacen.`;
  else if (!a) rAlarma = 'No hay ninguna alarma tuya en CloudWatch. Créala en CloudWatch → Alarms → Create alarm → Select metric → EC2 → By Auto Scaling Group → CPUUtilization.';
  else if (m?.nombre === 'CPUUtilization' && dim.InstanceId) rAlarma = `«${a.nombre}» vigila una sola instancia (${dim.InstanceId}). Las instancias de un grupo de Auto Scaling se reemplazan: cuando esa se vaya, la alarma vigilará a nadie. Créala con la métrica por grupo: EC2 → By Auto Scaling Group.`;
  else if (!delGrupo) rAlarma = `«${a.nombre}» vigila ${m?.namespace ?? '¿?'} ${m?.nombre ?? '¿?'} (${Object.entries(dim).map(([k, v]) => `${k}=${v}`).join(', ') || 'sin dimensiones'}). Se pidió CPUUtilization de AWS/EC2 por AutoScalingGroupName${asg ? ` = ${asg.nombre}` : ''}.`;
  else if (!mayor) rAlarma = `«${a.nombre}» se dispara cuando la CPU es ${a.comparacion.replace('Threshold', '')} ${a.umbral}; se pidió que avise cuando sea mayor (Greater) a ${x.umbral} %.`;
  else rAlarma = `«${a.nombre}» se dispara arriba de ${a.umbral} %; la cooperativa pidió ${x.umbral} %. Cámbialo con Actions → Edit.`;

  const temaAccion = deAlarma.find(emailConfirmado) ?? deAlarma[0] ?? null;
  const okAccion = Boolean(a && a.accionesActivas && temaAccion);
  let rAccion;
  if (okAccion) rAccion = `Cuando «${a.nombre}» pasa a In alarm, publica en «${temaAccion.nombre}»${emailConfirmado(temaAccion) ? ' y te llega el correo' : ' (confirma tu suscripción para que te llegue el correo)'}. CloudWatch mide y decide; SNS reparte el aviso.`;
  else if (!a) rAccion = 'Sin alarma no hay a quién avisar. Al crearla, en «Configure actions» elige «In alarm» y tu tema de SNS.';
  else if (!a.accionesActivas) rAccion = `Las acciones de «${a.nombre}» están deshabilitadas: aunque suene, no avisa. Actívalas con Actions → Enable actions.`;
  else rAccion = `«${a.nombre}» no avisa a ningún tema de SNS cuando entra en alarma${(a.acciones?.ALARM ?? []).length ? ` (sus acciones: ${a.acciones.ALARM.join(', ')})` : ''}. Edítala y en «Notification» elige «In alarm» → tu tema.`;

  return [check('tema', tTema, 4, okTema, rTema), check('alarma', tAlarma, 4, okAlarma, rAlarma), check('accion', tAccion, 2, okAccion, rAccion)];
}

/** La alarma del alumno: la que más cumple (a igualdad, la del nombre sugerido). */
function elegirAlarma(estado, x, asg) {
  const candidatas = alarmasAlumno(estado).sort((a, b) => (b.nombre === x.alarma) - (a.nombre === x.alarma));
  return mejorPor(candidatas, (a) => checksAlarma(estado, x, asg, a))?.candidata ?? null;
}

/* ============================================================== bono */

function revisarPrueba(estado, x, c) {
  const { asg, alarma: a } = c;
  const tSono = 'Tu alarma de CPU pasó a In alarm durante la prueba';
  const tCorreo = 'El correo de la alarma llegó a la Bandeja (simulada)';
  const tCrecio = 'El grupo creció solo por su política de seguimiento';
  const opcional = 'Es el bono opcional: no hacerlo no te quita puntos.';

  const sono = Boolean(a && (a.estado === 'ALARM' || a.historial.some((h) => h.tipo === 'StateUpdate' && /to In alarm$/.test(h.resumen))));
  const rSono = sono
    ? `«${a.nombre}» pasó a In alarm cuando la CPU superó ${a.umbral} %: la vigilancia funciona sin que nadie esté mirando la pantalla.`
    : !a
      ? `Primero crea la alarma de la tarea anterior. ${opcional}`
      : `«${a.nombre}» no ha pasado a In alarm (está ${a.estado}). Usa «Simular hora pico» en tu grupo y espera unos periodos (10 s cada uno en el simulador). ${opcional}`;

  const asunto = a ? `ALARM: "${a.nombre}"` : null;
  const correo = Boolean(asunto && (estado.sns?.buzon ?? []).some((m) => String(m.asunto).startsWith(asunto)));
  const rCorreo = correo
    ? 'Llegó el correo «ALARM: …» de AWS Notifications: en la vida real le llegaría al encargado de la tienda, aunque esté en el mercado.'
    : sono
      ? `La alarma sonó, pero su correo no llegó a la Bandeja: revisa que la alarma avise a tu tema y que tu suscripción esté Confirmed. ${opcional}`
      : `Todavía no hay un correo de alarma en la Bandeja. ${opcional}`;

  const crecio = Boolean(asg && asg.actividad.some((act) => act.tipo === 'lanzar' && /triggered policy/.test(act.causa ?? '')));
  const rCrecio = crecio
    ? `«${asg.nombre}» lanzó servidores extra porque su política de seguimiento lo pidió («a monitor alarm … triggered policy …» en Activity). Cuando baje la carga, los quitará solo: eso es la elasticidad.`
    : !asg
      ? `Primero crea el grupo de Auto Scaling con su política de seguimiento. ${opcional}`
      : `En la pestaña Activity de «${asg.nombre}» no hay lanzamientos por política. ${asg.politicas.some((p) => p.tipo === 'TargetTrackingScaling') ? 'Simula la hora pico y espera unos 30 segundos (3 periodos arriba del objetivo).' : 'Necesita su política Target tracking.'} ${opcional}`;

  return [check('sono', tSono, 4, sono, rSono), check('correo', tCorreo, 3, correo, rCorreo), check('crecio', tCrecio, 3, crecio, rCrecio)];
}

/* ============================================================ revisar */

/** Lo que eligen varias tareas a la vez, para que todas califiquen los mismos recursos. */
function contexto(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  const asg = elegirAsg(estado, x, vpc);
  const { plantilla, version } = elegirPlantilla(estado, x, asg);
  const web = vpc ? gruposWeb(estado, x, vpc, asg, version).filter((id) => grupoDe(estado, id)?.vpcId === vpc.id) : [];
  const alb = elegirAlb(estado, x, vpc, asg);
  const base = elegirBase(estado, x, vpc);
  const alarma = elegirAlarma(estado, x, asg);
  return { vpc, asg, plantilla, version, web, alb, base, alarma };
}

export function revisar(estadoOriginal, datos) {
  const estado = preparar(estadoOriginal);
  const x = datosLab(datos);
  const c = contexto(estado, x);
  return armar(LAB.tareas(datos), {
    red: revisarRed(estado, x),
    seguridad: revisarSeguridad(estado, x, c),
    servidores: revisarServidores(estado, x, c),
    balanceador: revisarBalanceador(estado, x, c),
    base: revisarBase(estado, x, c),
    fotos: revisarFotos(estado, x),
    alarma: checksAlarma(estado, x, c.asg, c.alarma),
    prueba: revisarPrueba(estado, x, c)
  });
}

/* =========================================================== solución */

const tcp = (puerto, origen) => ({ protocolo: 'tcp', desde: puerto, hasta: puerto, origen });

/**
 * La cuenta resuelta, hecha solo con acciones del modelo (como en la consola).
 * El tiempo corre como en clase: el reloj del modelo avanza de 2 en 2 segundos
 * mientras «el alumno» espera (así el balanceador, el grupo y las alarmas ven
 * pasar sus periodos) y al final vuelve a ser el de verdad.
 */
export function solucion(datos) {
  const x = datosLab(datos);
  const e = LAB.estadoInicial(datos);
  const original = reloj.ahora;
  let t = original();
  reloj.ahora = () => t;
  const esperar = (ms) => {
    const fin = t + ms;
    while (t < fin) {
      t = Math.min(fin, t + 2000);
      avanzar(e, t);
    }
  };
  try {
    // red: «VPC and more» con 2 zonas, 2 públicas y 2 privadas, sin NAT
    const red = crearVpcCompleta(e, { prefijo: 'tienda', cidr: x.vpcCidr, zonas: 2, publicas: 2, privadas: 2, nat: 'none' });
    const vpcId = red.vpc.id;

    // seguridad: internet → balanceador → web → base
    const sgAlb = crearGrupoSeguridad(e, { nombre: x.sgAlb, descripcion: 'Clientes de la tienda por HTTP', vpcId, entrada: [tcp(80, '0.0.0.0/0')] });
    const sgWeb = crearGrupoSeguridad(e, { nombre: x.sgWeb, descripcion: 'Solo el balanceador', vpcId, entrada: [tcp(80, sgAlb.id)] });
    const sgDb = crearGrupoSeguridad(e, { nombre: x.sgDb, descripcion: 'Solo los servidores web', vpcId, entrada: [tcp(x.puertoDb, sgWeb.id)] });

    // balanceador: grupo de destino y ALB en las dos públicas
    const tg = crearGrupoDestino(e, { nombre: x.tg, tipoDestino: 'instance', protocolo: 'HTTP', puerto: 80, vpcId });
    crearBalanceador(e, {
      nombre: x.alb,
      tipo: 'application',
      esquema: 'internet-facing',
      subredes: red.publicas.map((s) => s.id),
      gruposSeguridad: [sgAlb.id],
      oyentes: [{ protocolo: 'HTTP', puerto: 80, tgArn: tg.arn }]
    });

    // servidores: plantilla y grupo de Auto Scaling conectado al grupo de destino
    const plantilla = crearPlantillaLanzamiento(e, { nombre: x.plantilla, descripcion: 'Servidor web de la tienda', datos: { ami: 'al2023', tipo: 't3.micro', gruposSeguridad: [sgWeb.id], userData: x.userData } });
    crearGrupoAutoScaling(e, {
      nombre: x.asg,
      plantillaId: plantilla.id,
      subredes: red.publicas.map((s) => s.id),
      gruposDestino: [tg.arn],
      tipoSalud: 'ELB',
      gracia: 300,
      min: x.min,
      deseado: x.deseado,
      max: x.max,
      politica: { nombre: 'cpu-objetivo', metrica: 'ASGAverageCPUUtilization', objetivo: x.objetivoCpu }
    });

    // base: subnet group con las privadas y MySQL Multi-AZ privada y cifrada
    crearGrupoSubredesRds(e, { nombre: x.subnetGroup, descripcion: 'Subredes privadas de la tienda', vpcId, subredes: red.privadas.map((s) => s.id) });
    crearBaseRds(e, {
      metodo: 'standard',
      motor: 'mysql',
      plantilla: 'devtest',
      despliegue: 'multiaz',
      id: x.db,
      usuario: 'admin',
      contrasena: 'BarroNegro2026',
      clase: 'db.t3.micro',
      almacenamiento: { tipo: 'gp3', gib: 20, autoescalado: true, maximo: 100 },
      vpcId,
      grupoSubredes: x.subnetGroup,
      publica: false,
      gruposSeguridad: [sgDb.id],
      cifrada: true,
      retencion: x.retencion
    });

    // fotos
    crearBucket(e, { nombre: x.bucket, versionado: true });

    // alertas: tema con correo confirmado y alarma de la CPU del grupo
    const tema = crearTema(e, { nombre: x.tema });
    const sub = crearSuscripcion(e, { temaArn: tema.arn, protocolo: 'email', endpoint: `ventas+${x.sufijo}@barroytelar.mx` });
    confirmarSuscripcion(e, sub.arn);
    crearAlarma(e, {
      nombre: x.alarma,
      descripcion: 'La CPU promedio de la tienda está alta',
      metrica: { namespace: 'AWS/EC2', metrica: 'CPUUtilization', dimensiones: { AutoScalingGroupName: x.asg } },
      estadistica: 'Average',
      periodo: 60,
      comparacion: 'GreaterThanThreshold',
      umbral: x.umbral,
      evaluaciones: 1,
      acciones: { ALARM: [tema.arn] }
    });

    // Todo arranca: el balanceador queda Active, los servidores healthy y la base Available.
    esperar(2 * 60_000);

    // bono: la prueba del Buen Fin
    simularCargaAsg(e, x.asg, { cpu: 90, minutos: 12 });
    esperar(3 * 60_000);
    return e;
  } finally {
    reloj.ahora = original;
  }
}

