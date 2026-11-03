// Rúbrica de la práctica integradora 5 · La universidad migra a la nube.
//
// Revisa la cuenta como la dejó el alumno, por RESULTADOS: ¿el portal abre por
// el balanceador con dos servidores sanos en dos zonas y en subredes privadas?,
// ¿solo el balanceador les llega?, ¿la base es Multi-AZ, privada, cifrada, con
// respaldos y solo la alcanzan los servidores?, ¿todos montan el EFS?, ¿las
// actas están protegidas y archivadas?, ¿la alarma avisa por correo?, ¿los
// servidores leen S3 con un rol mínimo?, ¿hay presupuesto con alerta? Y el
// bono: la política de target tracking.
//
// Elige «el recurso del alumno» con tolerancia (por lo que hace, no por cómo se
// llama): el grupo de Auto Scaling con más servidores en servicio, el
// balanceador que le manda tráfico, la alarma que mejor cumple… Los nombres
// sugeridos no se califican; solo el identificador de la base, que la tarea
// pide exacto. Solo servidor: el navegador nunca recibe este archivo.

import {
  avanzar,
  crearAlarma,
  crearBalanceador,
  crearBaseRds,
  crearGrupoAutoScaling,
  crearGrupoDestino,
  crearGrupoSeguridad,
  crearPlantillaLanzamiento,
  crearPresupuesto,
  crearReglaCiclo,
  crearRol,
  crearSistemaEfs,
  editarBloqueoPublico,
  editarReglasSg,
  editarVersionado,
  grupoDestinoDe,
  gruposDeOyente,
  instanciaDe,
  instanciaRdsDe,
  montajeEfs,
  conexionBase,
  plantillaLanzamientoDe,
  politicaIam,
  reloj,
  subredDe,
  textoPuertos,
  tipoDeRegla,
  tomarSnapshotRds
} from '../../public/consola/modelo.js';
import { esSubredPublica, gruposPermitenDesde, probarPagina } from '../../public/consola/red.js';
import { LAB, datosLab } from '../../public/labs/practica-5.js';
import { armar, check, checkBloqueo, checkVersionado, contiene, describirCiclo, elegirBucket, elegirVpc, lista, mejorPor, preparar, retroNombreBucket, retroWebPorIp, sinVpc, sshServidoresPrivados } from './comun.js';

/**
 * Dónde repasar cada punto en la Ruta AWS (ver src/repaso.js). La clave
 * 'tarea/check' gana sobre la de la tarea.
 */
export const REPASO = {
  portal: ['s6-balanceadores/1', 's6-elasticidad/2'],
  'portal/alb': ['s6-balanceadores/1', 's3-vpc/3'],
  'portal/asg': ['s6-elasticidad/2', 's6-lab-escalar/7', 's1-global/1'],
  'portal/privadas': ['s3-vpc/3', 's3-lab-vpc/9'],
  'portal/sanos': ['s6-balanceadores/1', 's6-lab-escalar/8'],
  'portal/chequeo-elb': ['s6-lab-escalar/8', 's6-lab-escalar/12'],
  'portal/pagina': ['s6-lab-escalar/11', 's1-lab-ec2/9'],

  puertas: ['s2-lab-seguridad/13', 's2-servicios/3'],
  'puertas/web-solo-alb': ['s2-lab-seguridad/14', 's6-balanceadores/1'],
  'puertas/sin-ssh': ['s2-lab-seguridad/14', 's2-identidades/3'],
  'puertas/alb-abierto': ['s2-lab-seguridad/14', 's2-servicios/3'],

  base: ['s5-relacionales/2', 's5-disponibilidad/1'],
  'base/existe': ['s5-relacionales/2', 's5-relacionales/3', 's5-otras/2'],
  'base/multiaz': ['s5-disponibilidad/1', 's1-global/1'],
  'base/privada': ['s3-vpc/3', 's5-relacionales/2'],
  'base/cifrada': ['s2-servicios/1', 's2-responsabilidad/1'],
  'base/solo-web': ['s2-lab-seguridad/14', 's2-servicios/3'],
  'base/retencion': ['s5-disponibilidad/1', 's5-repaso/1'],
  'base/snapshot': ['s5-disponibilidad/1', 's4-discos/2'],

  archivos: ['s4-discos/1', 's4-lab-almacenamiento/12'],
  'archivos/efs': ['s4-discos/1', 's2-servicios/1'],
  'archivos/zonas': ['s4-discos/1', 's1-global/1'],
  'archivos/montan': ['s4-lab-almacenamiento/12', 's2-lab-seguridad/14'],

  actas: ['s4-s3/2', 's4-seguridad/1'],
  'actas/bloqueo': ['s4-seguridad/1', 's4-lab-almacenamiento/4'],
  'actas/versionado': ['s4-seguridad/1', 's4-lab-almacenamiento/5'],
  'actas/ciclo': ['s4-s3/3', 's4-s3/2', 's4-lab-almacenamiento/8'],

  alertas: ['s6-monitorear/1', 's6-lab-escalar/15'],
  'alertas/alarma': ['s6-monitorear/1', 's6-lab-escalar/14'],
  'alertas/aviso': ['s6-lab-escalar/15', 's6-serverless/2'],

  accesos: ['s2-identidades/1', 's2-politicas/1'],
  'accesos/rol': ['s2-identidades/1', 's2-identidades/3'],
  'accesos/minimo': ['s2-politicas/1', 's2-politicas/2'],

  presupuesto: ['s7-herramientas/1', 's7-lab-costos/8'],
  'presupuesto/monto': ['s7-herramientas/1', 's7-lab-costos/8'],
  'presupuesto/alerta': ['s7-herramientas/1', 's7-precios/1'],

  escala: ['s6-elasticidad/1', 's6-elasticidad/2'],
  'escala/politica': ['s6-elasticidad/2', 's6-lab-escalar/9', 's6-lab-escalar/13'],
  'escala/maximo': ['s6-lab-escalar/9', 's7-precios/1']
};

/* ============================================================ ayudas */

const fmtGrupo = (g) => `${g.nombre} (${g.id})`;
const grupoPorId = (estado, id) => estado.gruposSeguridad.find((g) => g.id === id) ?? null;
const cubre = (r, puerto) => r.protocolo === '-1' || (r.protocolo === 'tcp' && r.desde <= puerto && puerto <= r.hasta);
const esCidr = (origen) => !String(origen).startsWith('sg-');
const MUNDO = ['0.0.0.0/0', '::/0'];
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

/** Estados en los que una base ya «funciona». */
const BASE_LISTA = ['available', 'backing-up', 'modifying', 'storage-optimization', 'configuring-enhanced-monitoring', 'rebooting'];

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
 * Lo que la rúbrica usa en varias tareas: la VPC del campus, «el grupo de Auto
 * Scaling del portal», sus servidores, el balanceador que le manda tráfico y
 * el grupo de destino que comparten.
 */
function contexto(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  const grupos = (estado.autoscaling?.grupos ?? []).filter((g) => g.estado === 'activo');
  const enVpc = (g) => g.subredes.some((id) => subredDe(estado, id)?.vpcId === vpc?.id);
  const asg =
    grupos
      .filter(enVpc)
      .sort((a, b) => servidoresDe(estado, b).length - servidoresDe(estado, a).length || b.gruposDestino.length - a.gruposDestino.length)[0] ??
    grupos[0] ??
    null;
  const servidores = servidoresDe(estado, asg);

  const albs = (estado.elb?.balanceadores ?? []).filter((b) => b.tipo === 'application');
  const tgsDe = (b) => b.oyentes.flatMap(gruposDeOyente);
  const conAsg = albs.filter((b) => asg && tgsDe(b).some((arn) => asg.gruposDestino.includes(arn)));
  const alb = conAsg.find((b) => b.esquema === 'internet-facing') ?? conAsg[0] ?? albs.find((b) => b.vpcId === vpc?.id && b.esquema === 'internet-facing') ?? albs.find((b) => b.vpcId === vpc?.id) ?? albs[0] ?? null;
  const tgArn = alb ? (tgsDe(alb).find((arn) => asg?.gruposDestino.includes(arn)) ?? tgsDe(alb)[0] ?? null) : (asg?.gruposDestino[0] ?? null);
  const tg = tgArn ? grupoDestinoDe(estado, tgArn) : null;
  return { vpc, asg, servidores, alb, tg };
}

const sinGrupo = (x) =>
  `Todavía no hay un grupo de Auto Scaling activo. Primero crea la launch template y luego el grupo en EC2 → Auto Scaling Groups, en las subredes privadas de ${x.vpcNombre}.`;
const sinServidores = (ctx, x) =>
  ctx.asg
    ? `Tu grupo «${ctx.asg.nombre}» todavía no tiene servidores en servicio (InService). Revisa su pestaña Activity: ahí sale por qué no lanza o si los está reemplazando.`
    : sinGrupo(x);

/* ============================================================ portal */

function checksPortal(estado, x, ctx) {
  const { vpc, asg, servidores, alb, tg } = ctx;
  const tAlb = 'Un Application Load Balancer internet-facing, activo, en las dos subredes públicas, con un listener HTTP:80';
  const tAsg = 'Un grupo de Auto Scaling con launch template, en 2 zonas, con mínimo y deseado de al menos 2';
  const tPriv = 'Los servidores viven en subredes privadas y no tienen IP pública';
  const tSanos = 'Al menos 2 servidores del grupo están healthy en el balanceador, en 2 zonas distintas';
  const tElb = 'El grupo usa las revisiones de salud del balanceador (ELB health checks)';
  const tPag = `El DNS del balanceador abre el portal y dice «${x.textoPagina}»`;

  if (!vpc) {
    const r = `${sinVpc(estado, x.vpcCidr)} El portal se monta en la red que dejó el área de redes (${x.vpcNombre}).`;
    return [check('alb', tAlb, 5, false, r), check('asg', tAsg, 5, false, r), check('privadas', tPriv, 4, false, r), check('sanos', tSanos, 5, false, r), check('chequeo-elb', tElb, 2, false, r), check('pagina', tPag, 4, false, r)];
  }

  // El balanceador.
  let okAlb = false;
  let rAlb;
  if (!alb) rAlb = `No hay ningún Application Load Balancer. Créalo en EC2 → Load Balancers → Create load balancer → Application Load Balancer, internet-facing, en ${x.vpcNombre}, con las dos subredes públicas y el grupo ${x.sgAlb}.`;
  else {
    const zonas = zonasDe(estado, alb.subredes);
    const privadas = alb.subredes.filter((id) => !esSubredPublica(estado, id));
    const oyente80 = alb.oyentes.find((o) => o.protocolo === 'HTTP' && o.puerto === 80 && gruposDeOyente(o).length);
    if (alb.vpcId !== vpc.id) rAlb = `Tu balanceador «${alb.nombre}» está en ${alb.vpcId}, no en ${x.vpcNombre} (${vpc.id}). Un balanceador solo reparte a servidores de su propia VPC: créalo en ${x.vpcNombre}.`;
    else if (alb.esquema !== 'internet-facing') rAlb = `Tu balanceador «${alb.nombre}» es internal: su DNS solo se alcanza desde dentro de la VPC y los alumnos no podrían entrar. El esquema no se cambia después: crea otro internet-facing.`;
    else if (privadas.length) rAlb = `Tu balanceador «${alb.nombre}» está en subredes privadas (${privadas.map((id) => fmtSub(estado, id)).join(', ')}): sin ruta al Internet Gateway, nadie de internet le llega. Ponlo en las dos subredes públicas (Network mapping → Edit subnets).`;
    else if (zonas.length < 2) rAlb = `Tu balanceador «${alb.nombre}» solo está en ${lista(zonas)}. Un ALB necesita dos zonas para seguir atendiendo si una falla.`;
    else if (!oyente80) rAlb = `Tu balanceador «${alb.nombre}» no tiene un listener HTTP:80 que mande a un grupo de destino (tiene: ${lista(alb.oyentes.map((o) => `${o.protocolo}:${o.puerto}`))}). Agrégalo en la pestaña Listeners and rules.`;
    else if (alb.estado !== 'active') rAlb = `Tu balanceador «${alb.nombre}» todavía está en ${alb.estado}. Tarda unos 20 segundos en quedar Active: espera y vuelve a revisar.`;
    else {
      okAlb = true;
      rAlb = `«${alb.nombre}» es internet-facing y vive en ${zonas.join(' y ')}: es la única puerta pública del portal y reparte a los servidores sanos. Si una zona falla, sigue atendiendo desde la otra.`;
    }
  }

  // El grupo de Auto Scaling.
  let okAsg = false;
  let rAsg;
  if (!asg) rAsg = sinGrupo(x);
  else {
    const zonas = zonasDe(estado, asg.subredes);
    const plantilla = plantillaLanzamientoDe(estado, asg.plantilla.id);
    if (!plantilla) rAsg = `La launch template de tu grupo «${asg.nombre}» ya no existe: el grupo no puede lanzar servidores. Crea una plantilla y edita el grupo para usarla.`;
    else if (zonas.length < 2) rAsg = `Tu grupo «${asg.nombre}» solo tiene subredes en ${lista(zonas)}. Si esa zona se cae, el portal se cae con ella. Edita el grupo (Network) y agrega la subred privada de la otra zona.`;
    else if (asg.min < 2 || asg.deseado < 2) rAsg = `Tu grupo «${asg.nombre}» tiene mínimo ${asg.min} y deseado ${asg.deseado}. Con menos de 2 servidores, si uno falla no queda nadie atendiendo mientras llega el reemplazo. Sube los dos a 2 en el detalle del grupo → Capacity overview → Edit.`;
    else {
      okAsg = true;
      rAsg = `«${asg.nombre}» usa la plantilla «${plantilla.nombre}» y reparte sus servidores en ${zonas.join(' y ')}, con mínimo ${asg.min}. Si un servidor o una zona falla, el grupo lanza otro solo: eso es alta disponibilidad y elasticidad.`;
    }
  }

  // Privadas y sin IP pública.
  let okPriv = false;
  let rPriv;
  if (!asg) rPriv = sinGrupo(x);
  else {
    const publicas = asg.subredes.filter((id) => esSubredPublica(estado, id));
    const vivos = asg.instancias.map((m) => instanciaDe(estado, m.id)).filter((i) => i && !['terminated', 'shutting-down'].includes(i.estado));
    const conIp = vivos.filter((i) => i.ipPublica);
    if (publicas.length) rPriv = `Tu grupo «${asg.nombre}» usa subredes públicas (${publicas.map((id) => fmtSub(estado, id)).join(', ')}). Los servidores no necesitan internet de entrada: el balanceador les lleva el tráfico. Edita el grupo (Network) y deja solo las dos subredes privadas.`;
    else if (!vivos.length) rPriv = sinServidores(ctx, x);
    else if (conIp.length) rPriv = `Tus servidores ${conIp.map((i) => `${i.id} (${i.ipPublica})`).join(', ')} tienen IP pública. Quita «Auto-assign public IP» en la plantilla (Network settings → Advanced) y reemplaza los servidores.`;
    else {
      okPriv = true;
      rPriv = `Tus servidores viven en ${zonasDe(estado, asg.subredes).length} subredes privadas y no tienen IP pública: desde internet no existen. Para instalar paquetes salen por el NAT gateway, que no deja entrar a nadie.`;
    }
  }

  // Sanos en el balanceador.
  let okSanos = false;
  let rSanos;
  if (!asg) rSanos = sinGrupo(x);
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
      rSanos = `${sanos.length} servidores healthy en «${tg.nombre}», en ${zonas.join(' y ')}. El balanceador solo manda alumnos a los sanos.`;
    } else if (!propios.length) rSanos = sinServidores(ctx, x);
    else {
      const estados = propios.map((d) => `${d.id}: ${d.salud}${d.motivo ? ` (${d.motivo.codigo})` : ''}`).join(', ');
      const timeout = propios.some((d) => d.motivo?.codigo === 'Target.Timeout');
      const consejo = timeout
        ? ` Target.Timeout quiere decir que el balanceador no logra llegar al puerto 80: revisa que el grupo de seguridad de los servidores deje entrar HTTP desde el grupo del balanceador (${x.sgAlb}).`
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
  if (!asg) rElb = sinGrupo(x);
  else if (asg.tipoSalud === 'ELB' && asg.gruposDestino.length) {
    okElb = true;
    rElb = `«${asg.nombre}» usa ELB health checks: si Apache se cae pero la instancia sigue encendida, el balanceador la marca unhealthy y el grupo la reemplaza. Con solo EC2 health checks, el grupo no se daría cuenta.`;
  } else if (asg.tipoSalud === 'ELB') rElb = `«${asg.nombre}» tiene ELB health checks, pero sin grupo de destino no hay balanceador que revise. Conéctalo al grupo de destino.`;
  else rElb = `«${asg.nombre}» solo usa EC2 health checks: revisa que la máquina esté encendida, no que el portal conteste. Actívalos en Details → Health checks → Edit → «Turn on Elastic Load Balancing health checks».`;

  // La página por el balanceador.
  let okPag = false;
  let rPag;
  if (!alb) rPag = 'Sin balanceador no hay DNS que abrir. Cuando lo tengas, usa «Open in browser» en su detalle.';
  else {
    const r = probarPagina(estado, `http://${alb.dns}`, { turno: 0 });
    const pagina = r.resultado === 'ok' && r.codigoHttp === 200;
    if (pagina && contiene(r.html, x.textoPagina)) {
      okPag = true;
      rPag = `http://${alb.dns} abre el portal y dice «${x.textoPagina}». Los alumnos entran siempre por ese nombre; detrás, el balanceador elige un servidor sano.`;
    } else if (pagina) rPag = `El DNS del balanceador abre una página, pero no dice «${x.textoPagina}». Copia el script de la tarea tal cual en el User data de la plantilla y reemplaza los servidores (el user data solo corre en el primer arranque).`;
    else {
      const fallo = (r.diagnostico ?? []).find((p) => !p.ok);
      const codigo = r.codigoHttp ? `HTTP ${r.codigoHttp}` : r.error?.codigo ?? r.resultado;
      rPag = `Al abrir http://${alb.dns} desde tu casa sale ${codigo}.${fallo ? ` Se atoró en «${fallo.paso}»: ${fallo.detalle}` : ''}`;
    }
  }

  return [check('alb', tAlb, 5, okAlb, rAlb), check('asg', tAsg, 5, okAsg, rAsg), check('privadas', tPriv, 4, okPriv, rPriv), check('sanos', tSanos, 5, okSanos, rSanos), check('chequeo-elb', tElb, 2, okElb, rElb), check('pagina', tPag, 4, okPag, rPag)];
}

/* ============================================================ puertas */

function checksPuertas(estado, x, ctx) {
  const { asg, servidores, alb } = ctx;
  const tWeb = `A los servidores solo les llega HTTP (80) desde el grupo del balanceador, no desde una IP`;
  const tSsh = 'Nadie de internet puede intentar SSH (22) a los servidores';
  const tAlb = 'El balanceador recibe HTTP (80) desde cualquier lugar';

  // Los grupos de los servidores: los de las instancias en servicio o, si aún no hay, los de la plantilla.
  const plantilla = asg ? plantillaLanzamientoDe(estado, asg.plantilla.id) : null;
  const deServidores = [...new Set(servidores.flatMap((i) => i.gruposSeguridad))];
  const deVersion = plantilla ? (plantilla.versiones.find((v) => v.numero === (asg.plantilla.version === '$Latest' ? plantilla.ultimaVersion : asg.plantilla.version === '$Default' ? plantilla.versionDefault : Number(asg.plantilla.version)))?.datos.gruposSeguridad ?? []) : [];
  // Sin grupo todavía se revisa el grupo que dejó el proveedor anterior: ahí está lo que hay que arreglar.
  const heredado = estado.gruposSeguridad.filter((g) => g.nombre === x.sgWeb && g.vpcId === ctx.vpc?.id).map((g) => g.id);
  const grupos = deServidores.length ? deServidores : deVersion.length ? deVersion : heredado;
  const sgsAlb = alb?.gruposSeguridad ?? [];

  let okWeb = false;
  let rWeb;
  if (!grupos.length) rWeb = asg ? sinServidores(ctx, x) : sinGrupo(x);
  else {
    const r80 = reglasPuerto(estado, grupos, 80);
    const porIp = r80.filter(({ r }) => esCidr(r.origen));
    const desdeAlb = r80.filter(({ r }) => sgsAlb.includes(r.origen));
    const nombres = grupos.map((id) => grupoPorId(estado, id)).filter(Boolean).map(fmtGrupo).join(', ');
    if (porIp.length) {
      rWeb = retroWebPorIp(nombres, porIp, `el grupo ${x.sgAlb}`);
    } else if (!alb) rWeb = 'Sin balanceador no hay de quién recibir el tráfico. Crea el balanceador con el grupo campus-alb-sg y deja que solo ese grupo llegue al 80 de los servidores.';
    else if (!desdeAlb.length) {
      rWeb = `Ninguna regla de ${nombres} deja entrar el 80 desde el grupo del balanceador (${lista(sgsAlb.map((id) => grupoPorId(estado, id)).filter(Boolean).map(fmtGrupo))}). Sin ella, el balanceador no llega a los servidores y los marca unhealthy. Agrega HTTP con Source = ${x.sgAlb}.`;
    } else {
      okWeb = true;
      rWeb = `${nombres} solo deja entrar el 80 desde el grupo del balanceador: grupos de seguridad encadenados. Aunque alguien conozca la IP privada de un servidor, no puede entrar sin pasar por el balanceador.`;
    }
  }

  let okSsh = false;
  let rSsh;
  if (!grupos.length) rSsh = asg ? sinServidores(ctx, x) : sinGrupo(x);
  else {
    ({ ok: okSsh, retro: rSsh } = sshServidoresPrivados(reglasPuerto(estado, grupos, 22), describirReglas));
  }

  let okAlb = false;
  let rAlb;
  if (!alb) rAlb = `Todavía no hay balanceador. Ponle el grupo ${x.sgAlb}, que ya deja entrar HTTP desde 0.0.0.0/0.`;
  else {
    const ips = ['8.8.8.8', '201.141.33.10', x.ipCasa];
    okAlb = ips.every((ip) => gruposPermitenDesde(estado, sgsAlb, 'tcp', 80, { ip }).permite);
    rAlb = okAlb
      ? `El grupo del balanceador deja entrar el 80 desde cualquier IP: los alumnos se conectan desde su casa, la escuela o el celular, sin una dirección fija.`
      : `Los grupos de «${alb.nombre}» (${lista(sgsAlb.map((id) => grupoPorId(estado, id)).filter(Boolean).map(fmtGrupo))}) no dejan entrar HTTP desde cualquier lugar. El balanceador es la puerta pública: necesita HTTP (80) desde 0.0.0.0/0, como ${x.sgAlb}.`;
  }

  return [check('web-solo-alb', tWeb, 5, okWeb, rWeb), check('sin-ssh', tSsh, 3, okSsh, rSsh), check('alb-abierto', tAlb, 2, okAlb, rAlb)];
}

/* ============================================================== base */

const candidatasBase = (estado) => (estado.rds?.instancias ?? []).filter((i) => i.rol !== 'replica' && !i.clusterId && !['deleting', 'deleted'].includes(i.estado));

function elegirBase(estado, x, ctx) {
  const exacta = instanciaRdsDe(estado, x.db);
  if (exacta && exacta.rol !== 'replica' && !exacta.clusterId && !['deleting', 'deleted'].includes(exacta.estado)) return exacta;
  return mejorPor(candidatasBase(estado), (b) => checksBase(estado, x, ctx, b))?.candidata ?? null;
}

function sinBase(estado, x) {
  const cluster = (estado.rds?.clusteres ?? []).find((c) => !['deleting', 'deleted'].includes(c.estado));
  if (cluster) return `Creaste un clúster (${cluster.id}), no una DB instance. Se pidió MySQL con «Multi-AZ DB instance deployment (2 instances)»: crea la base ${x.db} con ese despliegue. Un «Multi-AZ DB cluster» necesita subredes en 3 zonas, y las privadas del campus (${x.grupoDb}) solo cubren 2: por eso ese clúster no puede vivir en ${x.vpcNombre}.`;
  return `Todavía no hay ninguna base en RDS. Créala en Aurora and RDS → Databases → Create database, con el identificador ${x.db}.`;
}

function checksBase(estado, x, ctx, b) {
  const tExiste = `La base MySQL «${x.db}» existe y está Available`;
  const tMulti = 'Multi-AZ: una copia en espera en otra zona';
  const tPriv = 'Sin acceso público y en subredes privadas';
  const tCif = 'Los datos de la base van cifrados';
  const tSolo = `Solo los servidores del portal llegan al puerto ${x.puerto}, por una regla con origen en su grupo`;
  const tRet = `Respaldos automáticos guardados ${x.retencion} días`;
  const tSnap = 'Un snapshot manual de la base, Available';
  if (!b) {
    const r = sinBase(estado, x);
    return [check('existe', tExiste, 5, false, r), check('multiaz', tMulti, 5, false, r), check('privada', tPriv, 3, false, r), check('cifrada', tCif, 1, false, r), check('solo-web', tSolo, 5, false, r), check('retencion', tRet, 3, false, r), check('snapshot', tSnap, 3, false, r)];
  }
  const lista_ = BASE_LISTA.includes(b.estado);
  const exacta = b.id === x.db;
  const esMysql = b.motor === 'mysql';
  let rExiste;
  const okExiste = exacta && lista_ && esMysql;
  if (okExiste) rExiste = `«${b.id}» es un MySQL administrado: AWS instala, parcha y respalda; la universidad solo usa sus datos. Es un «replatform» pequeño dentro de la migración: misma base, sin servidor que cuidar.`;
  else if (!exacta) rExiste = `Tu base se llama «${b.id}», pero se pidió exactamente «${x.db}». El identificador forma parte del endpoint que usa el portal: crea la base con el nombre correcto.`;
  else if (!esMysql) rExiste = `Tu base usa ${b.motor}; el kardex está en MySQL. El motor no se cambia con Modify: crea la base con MySQL.`;
  else if (b.estado === 'creating') rExiste = `Tu base «${b.id}» todavía se está creando (Creating). Espera unos segundos y vuelve a revisar.`;
  else rExiste = `Tu base «${b.id}» está en estado ${b.estado}.`;

  const okMulti = Boolean(b.multiAz && b.zonaSecundaria);
  const pendiente = b.pendientes && b.pendientes.multiAz !== undefined ? ' Tienes ese cambio pendiente: aplícalo con «Apply immediately».' : '';
  const rMulti = okMulti
    ? `Principal en ${b.zona} y copia en espera en ${b.zonaSecundaria}. Si se cae ${b.zona}, RDS cambia sola a la otra (failover) y el endpoint no cambia.`
    : `«${b.id}» es Single-AZ: vive solo en ${b.zona}. Si esa zona falla, nadie consulta su kardex. Cámbiala con Modify → «Multi-AZ DB instance deployment (2 instances)» y «Apply immediately».${pendiente}${b.plantilla === 'freetier' ? ' La plantilla Free tier no deja Multi-AZ: usa Dev/Test o Production.' : ''}`;

  const subredes = [b.subredId, b.subredSecundaria].filter(Boolean);
  const publicas = subredes.filter((id) => esSubredPublica(estado, id));
  const okPriv = !b.publica && !publicas.length;
  let rPriv;
  if (okPriv) rPriv = `«${b.id}» no tiene IP pública y vive en subredes privadas (${subredes.map((id) => fmtSub(estado, id)).join(', ')}): desde internet no existe.`;
  else if (b.publica) rPriv = `«${b.id}» tiene «Public access: Yes». Un kardex jamás debe estar expuesto a internet: Modify → Connectivity → Public access: No.`;
  else rPriv = `«${b.id}» no tiene IP pública, pero cayó en una subred pública (${publicas.map((id) => fmtSub(estado, id)).join(', ')}) porque su DB subnet group (${b.grupoSubredes}) incluye subredes públicas. Usa el grupo ${x.grupoDb}, que solo tiene las privadas: el subnet group no se cambia fácil, así que lo más sencillo es crear la base de nuevo con ${x.grupoDb}.`;

  const okCif = Boolean(b.cifrada);
  const rCif = okCif
    ? `«${b.id}» está cifrada con KMS: los discos, los respaldos y los snapshots. Cifrar los datos es responsabilidad tuya en el modelo de responsabilidad compartida.`
    : `«${b.id}» no está cifrada. El cifrado solo se elige al crear la base («Enable encryption» en Additional configuration); para cifrar una ya creada hay que copiar un snapshot cifrado y restaurarlo.`;

  // ¿Llegan los servidores, y solo ellos?
  const { servidores } = ctx;
  const grupos = b.gruposSeguridad;
  const reglas = reglasPuerto(estado, grupos, b.puerto);
  const porIp = reglas.filter(({ r }) => esCidr(r.origen));
  const deServidores = new Set(servidores.flatMap((i) => i.gruposSeguridad));
  const porGrupo = reglas.some(({ r }) => deServidores.has(r.origen));
  const fallas = servidores.map((i) => ({ i, c: conexionBase(estado, i.id, b.id) })).filter(({ c }) => !c.ok);
  let okSolo = false;
  let rSolo;
  if (porIp.length) {
    const casa = porIp.some(({ r }) => r.origen === `${x.ipCasa}/32`);
    rSolo = `El grupo de la base deja entrar el ${b.puerto} desde ${porIp.map(({ r, g }) => `${r.origen} (${g.nombre})`).join(', ')}. ${casa ? 'Esa es la IP de tu casa: la opción «Create new» de RDS la agrega sola, y hay que quitarla. ' : ''}Deja solo la regla MYSQL/Aurora con origen en el grupo de los servidores del portal.`;
  } else if (!servidores.length) rSolo = `Este punto se revisa con los servidores del portal, y todavía no hay ninguno en servicio. ${sinServidores(ctx, x)}`;
  else if (!BASE_LISTA.includes(b.estado)) rSolo = `«${b.id}» todavía no está lista (${b.estado}). Cuando quede Available, los servidores podrán conectarse si su grupo los deja pasar.`;
  else if (fallas.length) rSolo = `El servidor ${fallas[0].i.id} no llega a la base: ${fallas[0].c.motivo} En EC2 → Security Groups, la regla de la base va con Type MYSQL/Aurora y Source = el grupo de los servidores (${lista([...deServidores].map((id) => grupoPorId(estado, id)).filter(Boolean).map((g) => g.nombre))}).`;
  else if (!porGrupo) rSolo = `Los servidores llegan a la base, pero no por una regla con origen en su grupo. Usa como Source el grupo de los servidores: así la regla sirve aunque Auto Scaling cambie los servidores y sus IP.`;
  else {
    okSolo = true;
    rSolo = `Los ${servidores.length} servidores del portal llegan a «${b.id}» por el ${b.puerto} gracias a una regla con origen en su grupo, y ninguna regla lo abre a una IP. Cuando Auto Scaling lance un servidor nuevo, entrará solo porque trae el mismo grupo.`;
  }

  const okRet = b.retencion === x.retencion;
  let rRet;
  if (okRet) rRet = `«${b.id}» guarda respaldos automáticos ${x.retencion} días: puedes regresarla a cualquier segundo de ese periodo (point-in-time recovery). El máximo en RDS es 35 días.`;
  else if (b.estado === 'modifying' && b.cambiosEnCurso?.retencion === x.retencion) rRet = `Tu cambio a ${x.retencion} días se está aplicando (Modifying). Espera unos segundos.`;
  else if (b.retencion === 0) rRet = `«${b.id}» tiene los respaldos automáticos apagados (0 días). Ponlos en ${x.retencion} con Modify → Backup retention period y «Apply immediately».`;
  else rRet = `«${b.id}» guarda respaldos ${b.retencion} día${b.retencion === 1 ? '' : 's'}; el reglamento pide ${x.retencion}. Cámbialo con Modify → Backup retention period y «Apply immediately».`;

  const manuales = (estado.rds?.snapshots ?? []).filter((s) => s.tipo === 'manual' && s.instanciaId === b.id);
  const listos = manuales.filter((s) => s.estado === 'available');
  let rSnap;
  if (listos.length) rSnap = `El snapshot ${listos[0].id} es una foto completa de «${b.id}» antes de la mudanza. A diferencia de los respaldos automáticos, se queda aunque borres la base, hasta que tú lo borres.`;
  else if (manuales.length) rSnap = `Tu snapshot ${manuales[0].id} todavía se está creando (${manuales[0].estado}). Espera unos segundos.`;
  else rSnap = `No hay snapshots manuales de «${b.id}» (los de la pestaña System son los automáticos). Tómalo en Databases → ${b.id} → Actions → Take snapshot.`;

  return [
    check('existe', tExiste, 5, okExiste, rExiste),
    check('multiaz', tMulti, 5, okMulti, rMulti),
    check('privada', tPriv, 3, okPriv, rPriv),
    check('cifrada', tCif, 1, okCif, rCif),
    check('solo-web', tSolo, 5, okSolo, rSolo),
    check('retencion', tRet, 3, okRet, rRet),
    check('snapshot', tSnap, 3, listos.length > 0, rSnap)
  ];
}

/* ========================================================== archivos */

function checksArchivos(estado, x, ctx) {
  const { vpc, asg, servidores } = ctx;
  const tEfs = 'Un EFS Regional, cifrado y disponible en la VPC del campus';
  const tZonas = 'Un mount target disponible en cada zona donde viven los servidores';
  const tMontan = 'Todos los servidores montan el EFS por NFS (2049) y ese puerto no está abierto a internet';
  const sistemas = (estado.efs?.sistemas ?? []).filter((f) => f.estado !== 'deleting');
  if (!sistemas.length) {
    const r = 'Todavía no hay ningún sistema de archivos en EFS. Créalo en EFS → File systems → Create file system (Customize), en la VPC del campus.';
    return [check('efs', tEfs, 3, false, r), check('zonas', tZonas, 3, false, r), check('montan', tMontan, 4, false, r)];
  }
  const zonasAsg = asg ? zonasDe(estado, asg.subredes) : [];
  const evaluar = (fs) => {
    const okEfs = fs.estado === 'available' && !fs.unaZona && fs.cifrado && fs.vpcId === vpc?.id;
    let rEfs;
    if (okEfs) rEfs = `${fs.id}${fs.nombre ? ` («${fs.nombre}»)` : ''} es Regional: guarda los archivos en varias zonas, así que sobrevive si una falla. Y está cifrado en reposo.`;
    else if (fs.unaZona) rEfs = `${fs.id} es One Zone (${fs.zona}): más barato, pero si esa zona falla las constancias no se pueden leer. El portal vive en dos zonas: crea uno Regional.`;
    else if (!fs.cifrado) rEfs = `${fs.id} no está cifrado. El cifrado en reposo solo se elige al crearlo: crea otro con «Enable encryption of data at rest».`;
    else if (fs.estado !== 'available') rEfs = `${fs.id} está en ${fs.estado}. Espera unos segundos.`;
    else rEfs = `Los mount targets de ${fs.id} no están en ${x.vpcNombre}${fs.vpcId ? ` (están en ${fs.vpcId})` : ' (no tiene ninguno)'}. Un EFS solo se monta desde la VPC de sus mount targets: en la pestaña Network, ponlos en la VPC del campus.`;

    const listos = fs.montajes.filter((m) => m.estado === 'available');
    const zonasMt = [...new Set(listos.map((m) => m.zona))];
    const faltan = zonasAsg.filter((z) => !zonasMt.includes(z));
    let okZonas = false;
    let rZonas;
    if (!asg) rZonas = `${sinGrupo(x)} Los mount targets deben quedar en las zonas de los servidores.`;
    else if (zonasAsg.length >= 2 && !faltan.length && fs.vpcId === vpc?.id) {
      okZonas = true;
      rZonas = `${fs.id} tiene mount target en ${zonasAsg.join(' y ')}: cada servidor monta por su propia zona, sin cruzar (más rápido y sin cobro de transferencia), y si una zona falla la otra sigue.`;
    } else if (fs.montajes.some((m) => m.estado === 'creating')) rZonas = `Los mount targets de ${fs.id} todavía se están creando. Espera unos segundos.`;
    else if (zonasAsg.length < 2) rZonas = `Tu grupo «${asg.nombre}» solo está en ${lista(zonasAsg)}; el portal debe vivir en dos zonas (tarea 1) y el EFS debe tener mount target en ambas.`;
    else rZonas = `${fs.id} tiene mount targets en ${lista(zonasMt)}, pero tus servidores viven en ${zonasAsg.join(' y ')}. Falta ${faltan.join(' y ')}: agrégalo en la pestaña Network → Manage mount targets.`;

    const abiertos = fs.montajes.flatMap((m) => reglasPuerto(estado, m.gruposSeguridad, 2049)).filter(({ r }) => MUNDO.includes(r.origen));
    const fallas = servidores.map((i) => ({ i, m: montajeEfs(estado, i.id, fs.id) })).filter(({ m }) => !m.ok);
    let okMontan = false;
    let rMontan;
    if (abiertos.length) rMontan = `El grupo de los mount targets deja entrar NFS desde 0.0.0.0/0 (${describirReglas(abiertos.slice(0, 1))}). Las constancias de los alumnos no deben estar abiertas: deja como origen solo el grupo de los servidores.`;
    else if (!servidores.length) rMontan = `Este punto se revisa con los servidores del portal en servicio. ${sinServidores(ctx, x)}`;
    else if (fallas.length) rMontan = `El servidor ${fallas[0].i.id} no puede montar ${fs.id}: ${fallas[0].m.motivo} Los mount targets usan por omisión el grupo default de la VPC; crea un grupo con NFS (2049) desde el grupo de los servidores y pónselo en la pestaña Network.`;
    else {
      okMontan = true;
      rMontan = `Los ${servidores.length} servidores montan ${fs.id} por NFS: la constancia que genera uno la ven todos. Un disco EBS no sirve para esto, porque se conecta a una sola instancia y vive en una sola zona.`;
    }
    return [check('efs', tEfs, 3, okEfs, rEfs), check('zonas', tZonas, 3, okZonas, rZonas), check('montan', tMontan, 4, okMontan, rMontan)];
  };
  return mejorPor(sistemas, evaluar).checks;
}

/* ============================================================== actas */

function checksActas(estado, x) {
  const tCiclo = `Todo el bucket pasa a Glacier Deep Archive a los ${x.diasArchivo} días y ninguna regla borra las actas`;
  const eleccion = elegirBucket(estado, x.bucket, 'altiplano-actas-');
  if (!eleccion.bucket) {
    const r = retroNombreBucket(estado, x.bucket, eleccion);
    return [checkBloqueo(eleccion, { id: 'bloqueo', puntos: 3 }), checkVersionado(eleccion, { id: 'versionado', puntos: 3 }), check('ciclo', tCiclo, 4, false, r)];
  }
  const b = eleccion.bucket;
  const nota = eleccion.exacto ? '' : ` (Revisé «${b.nombre}»; las actas están en ${x.bucket}.)`;
  const activas = (b.ciclo ?? []).filter((r) => r.estado === 'Enabled');
  const todo = activas.filter((r) => !r.prefijo);
  const borra = activas.filter((r) => r.expiracionDias !== null && r.expiracionDias !== undefined);
  const buena = todo.find((r) => r.transiciones.some((t) => t.clase === 'DEEP_ARCHIVE' && t.dias === x.diasArchivo));
  let okCiclo = false;
  let rCiclo;
  if (borra.length) rCiclo = `La regla «${borra[0].nombre}» hace que los objetos expiren el día ${borra[0].expiracionDias}: ¡borraría las actas, que se guardan para siempre! Quita la acción «Expire current versions of objects».${nota}`;
  else if (buena && eleccion.exacto) {
    okCiclo = true;
    rCiclo = `«${buena.nombre}» manda todo el bucket a Glacier Deep Archive a los ${x.diasArchivo} días: la clase más barata de S3, para datos que casi nunca se leen y pueden esperar unas horas (hasta 12) para recuperarse. Y nada las borra.`;
  } else {
    const deep = todo.find((r) => r.transiciones.some((t) => t.clase === 'DEEP_ARCHIVE'));
    const glacier = todo.find((r) => r.transiciones.some((t) => t.clase === 'GLACIER' || t.clase === 'GLACIER_IR'));
    const prefijo = activas.find((r) => r.prefijo);
    let detalle;
    if (deep) detalle = `«${deep.nombre}» manda a Deep Archive el día ${deep.transiciones.find((t) => t.clase === 'DEEP_ARCHIVE').dias}; se pidió el día ${x.diasArchivo}. Edítala.`;
    else if (glacier) detalle = `«${glacier.nombre}» usa otra clase de Glacier. Las actas pueden esperar un día, así que la más barata (Glacier Deep Archive) es la indicada.`;
    else if (prefijo && !todo.length) detalle = `«${prefijo.nombre}» solo aplica al prefijo ${prefijo.prefijo}; se pidió para todos los objetos del bucket (Apply to all objects in the bucket).`;
    else detalle = `Tu bucket ${describirCiclo(b)}. Crea una regla en Management → Lifecycle rules para todo el bucket, con la transición a Glacier Deep Archive el día ${x.diasArchivo}.`;
    rCiclo = `${detalle}${nota}`;
  }
  return [checkBloqueo(eleccion, { id: 'bloqueo', puntos: 3 }), checkVersionado(eleccion, { id: 'versionado', puntos: 3 }), check('ciclo', tCiclo, 4, okCiclo, rCiclo)];
}

/* ============================================================ alertas */

const temas = (estado) => estado.sns?.temas ?? [];
const correoConfirmado = (t) => (t?.suscripciones ?? []).some((s) => (s.protocolo === 'email' || s.protocolo === 'email-json') && s.estado === 'Confirmed');
const temaPorArn = (estado, arn) => temas(estado).find((t) => t.arn === arn) ?? null;

function checksAlertas(estado, x, ctx) {
  const { asg } = ctx;
  const tAlarma = `Una alarma de la CPU promedio del grupo de Auto Scaling, mayor a ${x.umbral} %`;
  const tAviso = `La alarma avisa por correo a través del tema ${x.tema} (acción en ALARM)`;

  // La alarma: la del alumno (no las TargetTracking-… que crea Auto Scaling) que mejor cumple.
  const alarmas = (estado.cloudwatch?.alarmas ?? []).filter((a) => !a.creadaPor);
  const evaluar = (a) => {
    const dim = a.metrica.dimensiones ?? {};
    const esCpu = a.metrica.namespace === 'AWS/EC2' && a.metrica.nombre === 'CPUUtilization';
    const delGrupo = asg && dim.AutoScalingGroupName === asg.nombre && Object.keys(dim).length === 1;
    const mayor = a.comparacion === 'GreaterThanThreshold' || a.comparacion === 'GreaterThanOrEqualToThreshold';
    const okAlarma = Boolean(esCpu && delGrupo && mayor && a.estadistica === 'Average' && a.umbral === x.umbral);
    let rAlarma;
    if (okAlarma) rAlarma = `«${a.nombre}» vigila la CPU promedio de todos los servidores de «${asg.nombre}» (dimensión AutoScalingGroupName), así que sirve aunque Auto Scaling cambie los servidores. Se activa arriba de ${x.umbral} %.`;
    else if (!esCpu) rAlarma = `«${a.nombre}» vigila ${a.metrica.namespace} ${a.metrica.nombre}; se pidió la CPU (AWS/EC2 CPUUtilization) del grupo del portal.`;
    else if (!asg) rAlarma = `${sinGrupo(x)} La alarma vigila la CPU de ese grupo.`;
    else if (!delGrupo) {
      rAlarma = dim.InstanceId
        ? `«${a.nombre}» vigila un solo servidor (${dim.InstanceId}). Auto Scaling reemplaza servidores y esa alarma se quedaría vigilando uno que ya no existe. Elige la métrica en EC2 → By Auto Scaling Group → ${asg.nombre}.`
        : `«${a.nombre}» no vigila el grupo «${asg.nombre}» (dimensiones: ${lista(Object.entries(dim).map(([k, v]) => `${k}=${v}`))}). Elige la métrica en EC2 → By Auto Scaling Group.`;
    } else if (a.estadistica !== 'Average') rAlarma = `«${a.nombre}» usa la estadística ${a.estadistica}; se pidió el promedio (Average) del grupo.`;
    else if (!mayor) rAlarma = `«${a.nombre}» se activa cuando la CPU es menor al umbral; se pidió que avise cuando pase de ${x.umbral} % (Greater).`;
    else rAlarma = `«${a.nombre}» se activa con ${a.umbral} %; se pidió ${x.umbral} %. Edítala (Actions → Edit).`;

    const arnsSns = (a.acciones?.ALARM ?? []).filter((arn) => arn.startsWith('arn:aws:sns:'));
    const conAviso = arnsSns.map((arn) => temaPorArn(estado, arn)).filter((t) => correoConfirmado(t));
    const okAviso = Boolean(a.accionesActivas !== false && conAviso.length);
    let rAviso;
    if (okAviso) rAviso = `Cuando «${a.nombre}» pase a In alarm, publica en «${conAviso[0].nombre}» y TI recibe el correo antes de que los alumnos se quejen. CloudWatch vigila; SNS avisa a todos los suscriptores del tema.`;
    else if (a.accionesActivas === false) rAviso = `Las acciones de «${a.nombre}» están desactivadas: aunque se active, no avisa. Actívalas con Actions → Enable actions.`;
    else if (!arnsSns.length) rAviso = `«${a.nombre}» no tiene ninguna notificación en estado In alarm: se pondría roja y nadie se enteraría. Edítala: en «Configure actions» agrega una notificación (In alarm) al tema ${x.tema}.`;
    else {
      const sinCorreo = arnsSns.map((arn) => temaPorArn(estado, arn)?.nombre ?? arn).join(', ');
      const pendiente = arnsSns.map((arn) => temaPorArn(estado, arn)).find((t) => t?.suscripciones.some((s) => s.protocolo === 'email' && s.estado !== 'Confirmed'));
      rAviso = pendiente
        ? `«${a.nombre}» avisa al tema ${pendiente.nombre}, pero su correo sigue en Pending confirmation: AWS no manda nada hasta que el dueño confirma. Confírmalo en la «Bandeja de correo (simulada)»${pendiente.nombre === x.tema ? '' : ` o usa el tema ${x.tema}, que ya tiene el correo de TI confirmado`}.`
        : `«${a.nombre}» avisa al tema ${sinCorreo}, que no tiene ningún correo confirmado: el aviso no le llega a nadie. Usa el tema ${x.tema}, que ya tiene el correo de TI.`;
    }
    return [check('alarma', tAlarma, 6, okAlarma, rAlarma), check('aviso', tAviso, 4, okAviso, rAviso)];
  };
  if (alarmas.length) return mejorPor(alarmas, evaluar).checks;
  const internas = (estado.cloudwatch?.alarmas ?? []).filter((a) => a.creadaPor);
  const r = internas.length
    ? `Las únicas alarmas son las TargetTracking-… que crea Auto Scaling para su política: esas no se tocan y no avisan a nadie. Crea tu propia alarma en CloudWatch → Alarms → Create alarm.`
    : `No hay ninguna alarma: si el portal se satura, TI se entera por las quejas. Créala en CloudWatch → Alarms → Create alarm, con la métrica EC2 → By Auto Scaling Group → CPUUtilization del grupo del portal, y que notifique al tema ${x.tema}.`;
  return [check('alarma', tAlarma, 6, false, r), check('aviso', tAviso, 4, false, r)];
}

/* ============================================================ accesos */

/** Políticas que un rol de servidores de este portal puede tener sin romper el mínimo privilegio. */
const EXTRA_ACEPTABLE = ['AmazonSSMManagedInstanceCore'];

function checksAccesos(estado, x, ctx) {
  const { asg, servidores } = ctx;
  const tRol = 'Todos los servidores del portal usan un rol de IAM (sin llaves de acceso)';
  const tMin = 'El rol solo puede leer S3 (mínimo privilegio)';
  const roles = estado.iam.roles;
  const rolDe = (nombre) => roles.find((r) => r.nombre.toLowerCase() === String(nombre ?? '').toLowerCase()) ?? null;
  if (!asg || !servidores.length) {
    const r = `${sinServidores(ctx, x)} El rol se revisa en los servidores del portal.`;
    return [check('rol', tRol, 3, false, r), check('minimo', tMin, 2, false, r)];
  }
  const sinRol = servidores.filter((i) => !rolDe(i.rolIam));
  const usados = [...new Set(servidores.map((i) => i.rolIam).filter(Boolean))].map(rolDe).filter(Boolean);
  let rRol;
  const okRol = !sinRol.length && usados.length > 0;
  if (okRol) rRol = `Tus ${servidores.length} servidores usan el rol «${usados.map((r) => r.nombre).join('», «')}». AWS les da credenciales temporales que rotan solas: nadie tiene que guardar llaves en el código.`;
  else if (usados.length || roles.length) {
    rRol = `Los servidores ${sinRol.map((i) => i.id).join(', ')} no tienen rol. Ponlo en la launch template (Advanced details → IAM instance profile), haz esa versión la predeterminada (Default) y reemplaza los servidores: termina uno a la vez y el grupo lanza otro con la plantilla nueva. Un servidor ya lanzado no cambia solo.`;
  } else rRol = `No hay ningún rol de IAM. Créalo en IAM → Roles → Create role (trusted entity: AWS service → EC2) y ponlo en la launch template.`;

  let okMin = false;
  let rMin;
  if (!usados.length) rMin = 'Sin rol en los servidores no hay permisos que revisar.';
  else {
    const malos = usados.flatMap((r) => r.politicas.filter((p) => p !== x.politica && !EXTRA_ACEPTABLE.includes(p)).map((p) => ({ r, p })));
    const sinS3 = usados.filter((r) => !r.politicas.includes(x.politica) && !r.politicas.some((p) => politicaIam(p)?.servicio === '*' || p === 'AmazonS3FullAccess'));
    const noEc2 = usados.filter((r) => r.servicio !== 'ec2.amazonaws.com');
    if (noEc2.length) rMin = `El rol «${noEc2[0].nombre}» confía en ${noEc2[0].servicio}, no en EC2: los servidores no pueden asumirlo.`;
    else if (malos.length) {
      const { r, p } = malos[0];
      const info = politicaIam(p);
      rMin = `El rol «${r.nombre}» tiene ${p}${info?.servicio === '*' ? ', que da permisos sobre TODA la cuenta' : info?.acceso !== 'lectura' ? ', que deja cambiar o borrar' : ', que da más de lo que el portal necesita'}. Si alguien se mete a un servidor, tendría esos permisos. Deja solo ${x.politica}.`;
    } else if (sinS3.length) rMin = `El rol «${sinS3[0].nombre}» no tiene ${x.politica}: el portal no podría leer las actas.`;
    else {
      okMin = true;
      rMin = `El rol solo tiene ${x.politica}${usados.some((r) => r.politicas.some((p) => EXTRA_ACEPTABLE.includes(p))) ? ' (y AmazonSSMManagedInstanceCore, que sirve para administrar sin SSH)' : ''}: el portal lee las actas, pero no puede borrarlas ni tocar nada más. Eso es mínimo privilegio.`;
    }
  }
  return [check('rol', tRol, 3, okRol, rRol), check('minimo', tMin, 2, okMin, rMin)];
}

/* ========================================================= presupuesto */

function checksPresupuesto(estado, x) {
  const tMonto = `Un presupuesto de costo mensual de ${x.monto} USD`;
  const tAlerta = `Una alerta por correo cuando el gasto REAL llegue al ${x.porcentaje} %`;
  const todos = estado.costos?.presupuestos ?? [];
  if (!todos.length) {
    const r = 'No hay ningún presupuesto. Créalo en Billing and Cost Management → Budgets → Create budget → Customize (advanced) → Cost budget.';
    return [check('monto', tMonto, 2, false, r), check('alerta', tAlerta, 3, false, r)];
  }
  const alertaBuena = (b, a) =>
    a.disparador === 'ACTUAL' &&
    (a.correos?.length || a.temaSns) &&
    ((a.tipoUmbral === 'PERCENTAGE' && a.umbral === x.porcentaje) || (a.tipoUmbral === 'ABSOLUTE_VALUE' && Math.abs(a.umbral - (b.monto * x.porcentaje) / 100) < 0.01));
  const evaluar = (b) => {
    const okMonto = b.tipo === 'COST' && b.periodo === 'MONTHLY' && b.monto === x.monto;
    let rMonto;
    if (okMonto) rMonto = `«${b.nombre}» vigila el costo de cada mes contra ${x.monto} USD. Un presupuesto no detiene nada: avisa, para que alguien decida a tiempo.`;
    else if (b.tipo !== 'COST') rMonto = `«${b.nombre}» es de tipo ${b.tipo}; se pidió un presupuesto de costo (Cost budget).`;
    else if (b.periodo !== 'MONTHLY') rMonto = `«${b.nombre}» es ${b.periodo}; la rectoría autorizó un monto por mes (Monthly).`;
    else rMonto = `«${b.nombre}» tiene ${b.monto} USD; la rectoría autorizó ${x.monto} USD al mes. Edítalo.`;
    const ok = b.alertas.find((a) => alertaBuena(b, a));
    let rAlerta;
    if (ok) rAlerta = `Cuando el gasto real llegue al ${x.porcentaje} % (${((x.monto * x.porcentaje) / 100).toFixed(2)} USD), llega el correo: todavía queda margen para reaccionar antes de pasarse.`;
    else if (!b.alertas.length) rAlerta = `«${b.nombre}» no tiene alertas: nadie se enteraría. Edítalo y agrega una alerta (Actual) al ${x.porcentaje} % con un correo.`;
    else {
      const fc = b.alertas.find((a) => a.disparador === 'FORECASTED');
      rAlerta = fc && b.alertas.every((a) => a.disparador === 'FORECASTED')
        ? `Tus alertas son Forecasted (avisan si el pronóstico va a pasar el umbral). Se pidió una sobre el gasto real (Actual) al ${x.porcentaje} %.`
        : `Tus alertas son: ${b.alertas.map((a) => `${a.disparador} ${a.umbral}${a.tipoUmbral === 'PERCENTAGE' ? ' %' : ' USD'}`).join(', ')}. Se pidió Actual al ${x.porcentaje} % del presupuesto, con un correo.`;
    }
    return [check('monto', tMonto, 2, okMonto, rMonto), check('alerta', tAlerta, 3, Boolean(ok), rAlerta)];
  };
  return mejorPor(todos, evaluar).checks;
}

/* =============================================================== bono */

function checksEscala(estado, x, ctx) {
  const { asg } = ctx;
  const tPol = `Una política de target tracking de CPU promedio cerca del ${x.objetivoCpu} %`;
  const tMax = `Capacidad máxima de ${x.maximo} a 10 servidores`;
  if (!asg) {
    const r = 'Es el bono opcional: necesita primero el grupo de Auto Scaling del portal. No hacerlo no te quita puntos.';
    return [check('politica', tPol, 5, false, r), check('maximo', tMax, 3, false, r)];
  }
  const tt = asg.politicas.filter((p) => p.tipo === 'TargetTrackingScaling' && p.habilitada !== false);
  const buena = tt.find((p) => p.metrica === 'ASGAverageCPUUtilization' && p.objetivo >= 40 && p.objetivo <= 60);
  let rPol;
  if (buena) rPol = `«${buena.nombre}» mantiene la CPU promedio en ${buena.objetivo} %: si sube, Auto Scaling agrega servidores; si baja, los quita. Pagas solo lo que el tráfico necesita (elasticidad).`;
  else if (tt.length) rPol = `Tu política «${tt[0].nombre}» sigue ${tt[0].metrica} con objetivo ${tt[0].objetivo}; se pidió Average CPU utilization cerca del ${x.objetivoCpu} % (entre 40 y 60).`;
  else if (asg.politicas.length) rPol = `Tu grupo tiene políticas de tipo ${asg.politicas.map((p) => p.tipo).join(', ')}; se pidió target tracking, que calcula sola cuántos servidores hacen falta.`;
  else rPol = 'Es el bono opcional: si agregas una política de target tracking (Automatic scaling → Create dynamic scaling policy), suma puntos extra. No hacerla no te quita puntos.';
  const okMax = asg.max >= x.maximo && asg.max <= 10;
  const rMax = okMax
    ? `Máximo ${asg.max}: espacio para crecer en inscripciones, con un tope para que una carga rara no dispare la factura.`
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
    portal: checksPortal(estado, x, ctx),
    puertas: checksPuertas(estado, x, ctx),
    base: checksBase(estado, x, ctx, elegirBase(estado, x, ctx)),
    archivos: checksArchivos(estado, x, ctx),
    actas: checksActas(estado, x),
    alertas: checksAlertas(estado, x, ctx),
    accesos: checksAccesos(estado, x, ctx),
    presupuesto: checksPresupuesto(estado, x),
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
  const vpc = e.vpcs.find((v) => v.cidr === x.vpcCidr);
  const sub = (cidr) => e.subredes.find((s) => s.cidr === cidr).id;
  const publicas = x.publicas.map(sub);
  const privadas = x.privadas.map(sub);
  const sgAlb = e.gruposSeguridad.find((g) => g.nombre === x.sgAlb);
  const sgWeb = e.gruposSeguridad.find((g) => g.nombre === x.sgWeb);

  // accesos: el rol de solo lectura de S3
  crearRol(e, { nombre: x.rol, servicio: 'ec2.amazonaws.com', politicas: [x.politica] });

  // puertas: el 80 solo desde el balanceador y sin SSH
  editarReglasSg(e, sgWeb.id, 'entrada', [{ protocolo: 'tcp', desde: 80, hasta: 80, origen: sgAlb.id }]);

  // portal: plantilla, grupo de destino, balanceador y Auto Scaling
  const plantilla = crearPlantillaLanzamiento(e, {
    nombre: x.plantilla,
    datos: { ami: 'al2023', tipo: 't3.micro', gruposSeguridad: [sgWeb.id], userData: x.userData, perfilIam: x.rol }
  });
  const tg = crearGrupoDestino(e, { nombre: x.tg, tipoDestino: 'instance', protocolo: 'HTTP', puerto: 80, vpcId: vpc.id, chequeo: { ruta: '/' } });
  crearBalanceador(e, { nombre: x.alb, tipo: 'application', esquema: 'internet-facing', vpcId: vpc.id, subredes: publicas, gruposSeguridad: [sgAlb.id], oyentes: [{ protocolo: 'HTTP', puerto: 80, tgArn: tg.arn }] });
  crearGrupoAutoScaling(e, {
    nombre: x.asg,
    plantillaId: plantilla.id,
    version: '$Default',
    subredes: privadas,
    gruposDestino: [tg.arn],
    tipoSalud: 'ELB',
    gracia: 300,
    min: 2,
    deseado: 2,
    max: x.maximo,
    politica: { nombre: 'cpu-50', metrica: 'ASGAverageCPUUtilization', objetivo: x.objetivoCpu }
  });

  // base: grupo propio, MySQL Multi-AZ privada en las subredes privadas
  const sgDb = crearGrupoSeguridad(e, { nombre: x.sgDb, descripcion: 'MySQL solo desde el portal', vpcId: vpc.id, entrada: [{ protocolo: 'tcp', desde: x.puerto, hasta: x.puerto, origen: sgWeb.id }] });
  crearBaseRds(e, {
    metodo: 'standard',
    motor: 'mysql',
    plantilla: 'production',
    despliegue: 'multiaz',
    id: x.db,
    usuario: 'admin',
    contrasena: 'AltiplanoNube2026',
    clase: 'db.t3.small',
    almacenamiento: { tipo: 'gp3', gib: 20, autoescalado: true, maximo: 200 },
    vpcId: vpc.id,
    grupoSubredes: x.grupoDb,
    publica: false,
    gruposSeguridad: [sgDb.id],
    retencion: x.retencion,
    cifrada: true
  });

  // archivos: EFS Regional con un mount target por zona privada y NFS solo desde el portal
  const sgEfs = crearGrupoSeguridad(e, { nombre: x.sgEfs, descripcion: 'NFS solo desde el portal', vpcId: vpc.id, entrada: [{ protocolo: 'tcp', desde: 2049, hasta: 2049, origen: sgWeb.id }] });
  crearSistemaEfs(e, { nombre: x.efs, tipo: 'regional', cifrado: true, vpcId: vpc.id, montajes: privadas.map((subredId) => ({ subredId, gruposSeguridad: [sgEfs.id] })) });

  // actas: bloqueo, versionado y ciclo de vida a Deep Archive
  editarBloqueoPublico(e, x.bucket, { aclsNuevas: true, aclsCualquiera: true, politicasNuevas: true, politicasCualquiera: true });
  editarVersionado(e, x.bucket, true);
  crearReglaCiclo(e, x.bucket, { nombre: 'actas-a-deep-archive', prefijo: null, transiciones: [{ dias: x.diasArchivo, clase: 'DEEP_ARCHIVE' }] });

  // alertas: la alarma de CPU del grupo, que avisa por el tema que TI ya tiene
  const tema = e.sns.temas.find((t) => t.nombre === x.tema);
  crearAlarma(e, {
    nombre: 'portal-cpu-alta',
    metrica: { namespace: 'AWS/EC2', nombre: 'CPUUtilization', dimensiones: { AutoScalingGroupName: x.asg } },
    estadistica: 'Average',
    periodo: 300,
    comparacion: 'GreaterThanThreshold',
    umbral: x.umbral,
    evaluaciones: 1,
    acciones: { ALARM: [tema.arn] }
  });

  // presupuesto: mensual con alerta real al 80 %
  crearPresupuesto(e, {
    nombre: x.presupuesto,
    tipo: 'COST',
    periodo: 'MONTHLY',
    monto: x.monto,
    alertas: [{ umbral: x.porcentaje, tipoUmbral: 'PERCENTAGE', disparador: 'ACTUAL', correos: [x.correo] }]
  });

  // Que todo arranque: servidores, health checks, la base y el EFS.
  const pasar = relojDe(e);
  pasar(2 * MINUTO);
  tomarSnapshotRds(e, { baseId: x.db, nombre: x.snap });
  pasar(2 * MINUTO);
  return e;
}

