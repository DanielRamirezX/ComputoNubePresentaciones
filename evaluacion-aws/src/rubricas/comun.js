// Piezas que comparten las tres rúbricas: armar el resultado, elegir «el
// recurso del alumno» de forma tolerante (por lo que hace, no por cómo se
// llama) y redactar retroalimentación específica con lo que hay en su cuenta.
//
// Solo servidor: el navegador nunca recibe este archivo.

import { avanzar, claseS3, clonar, igwDeVpc, naclDeSubred, politicaIam, subredDe, tablaDeSubred, tipoDeRegla, textoPuertos, vpcDe } from '../../public/consola/modelo.js';
import { esSubredPublica, gruposPermiten, naclPermite, probarPagina, salePorNat, analizarUserData } from '../../public/consola/red.js';

/* ================================================================ armar */

/** Un punto de la rúbrica. `retro` ya viene elegida según `ok`. */
export const check = (id, texto, puntos, ok, retro) => ({ id, texto, puntos, ok: Boolean(ok), retro: String(retro ?? '') });

/**
 * Junta los checks con las tareas públicas del laboratorio (mismos ids,
 * títulos y puntos que ve el alumno). Si los checks de una tarea no suman lo
 * que vale, lanza: es un error de la rúbrica, no del alumno.
 */
export function armar(tareasPublicas, checksPorTarea) {
  const tareas = tareasPublicas.map((t) => {
    const checks = checksPorTarea[t.id] ?? [];
    const suma = checks.reduce((s, c) => s + c.puntos, 0);
    if (Math.abs(suma - t.puntos) > 0.001) throw new Error(`rúbrica: los checks de ${t.id} suman ${suma}, no ${t.puntos}`);
    const obtenidos = checks.reduce((s, c) => s + (c.ok ? c.puntos : 0), 0);
    return { id: t.id, titulo: t.titulo, puntos: t.puntos, obtenidos, checks };
  });
  return { obtenidos: tareas.reduce((s, t) => s + t.obtenidos, 0), total: 100, tareas };
}

/** Una copia de la cuenta con las transiciones al día (nunca muta la original). */
export function preparar(estado) {
  const e = clonar(estado);
  avanzar(e);
  return e;
}

/* ============================================================== textos */

export const normal = (t) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const contiene = (html, texto) => normal(html).includes(normal(texto));

export const lista = (xs, vacio = 'ninguna') => (xs.length ? xs.join(', ') : vacio);

export const fmtSubred = (s) => `${s.nombre ? `«${s.nombre}» ` : ''}${s.id} (${s.cidr}, ${s.az})`;
export const fmtVpc = (v) => `${v.nombre ? `«${v.nombre}» ` : ''}${v.id} (${v.cidr})`;
export const fmtInst = (i) => `${i.nombre ? `«${i.nombre}» ` : ''}${i.id}`;

/* ================================================================ la red */

export const vpcPorDefecto = (estado) => estado.vpcs.find((v) => v.porDefecto) ?? null;
export const vivas = (estado) => estado.instancias.filter((i) => i.estado !== 'terminated' && i.estado !== 'shutting-down');

/**
 * La VPC «del alumno»: la que tiene exactamente el CIDR pedido. Si hizo dos
 * con el mismo bloque, la que tiene más cosas adentro (instancias, gateway,
 * subredes).
 */
export function elegirVpc(estado, cidr) {
  const candidatas = estado.vpcs.filter((v) => !v.porDefecto && v.cidr === cidr);
  const peso = (v) =>
    vivas(estado).filter((i) => i.vpcId === v.id).length * 10 + (igwDeVpc(estado, v.id) ? 3 : 0) + estado.subredes.filter((s) => s.vpcId === v.id).length;
  return candidatas.sort((a, b) => peso(b) - peso(a))[0] ?? null;
}

/** Retro cuando no existe la VPC con el CIDR pedido. */
export function sinVpc(estado, cidr) {
  const otras = estado.vpcs.filter((v) => !v.porDefecto);
  if (!otras.length) {
    return `No encontré ninguna VPC con el bloque ${cidr}: en tu cuenta solo está la VPC por omisión (172.31.0.0/16). Créala en VPC → Your VPCs → Create VPC con IPv4 CIDR ${cidr}.`;
  }
  return `No encontré una VPC con el bloque ${cidr}. Tus VPC son: ${otras.map(fmtVpc).join('; ')}. El CIDR de una VPC no se puede cambiar después de crearla: crea una nueva con ${cidr} exactamente.`;
}

/** Retro del Internet Gateway de una VPC (o de por qué falta). */
export function retroIgw(estado, vpc) {
  const igw = igwDeVpc(estado, vpc.id);
  if (igw) {
    return `Tu VPC tiene conectado el Internet Gateway ${igw.id}. Es la única puerta entre tu red e internet: sin él, ninguna subred puede ser pública.`;
  }
  const sueltos = estado.igws.filter((g) => !g.vpcId);
  const enOtra = estado.igws.filter((g) => g.vpcId && g.vpcId !== vpc.id && !vpcDe(estado, g.vpcId)?.porDefecto);
  if (sueltos.length) {
    return `Tienes el Internet Gateway ${sueltos.map((g) => g.id).join(', ')}, pero está «Detached»: no está conectado a ninguna VPC. Selecciónalo en VPC → Internet gateways → Actions → Attach to VPC y elige ${vpc.id}.`;
  }
  if (enOtra.length) {
    return `Tu Internet Gateway ${enOtra[0].id} está conectado a otra VPC (${enOtra[0].vpcId}), no a ${vpc.id}. Una VPC solo usa el gateway que tiene conectado: crea otro (o desconecta ese) y conéctalo a tu VPC.`;
  }
  return `Tu VPC ${vpc.id} no tiene Internet Gateway. Créalo en VPC → Internet gateways → Create internet gateway y luego Actions → Attach to VPC.`;
}

/** Por qué una subred NO es pública, con los ids de su cuenta. */
export function explicarRuta(estado, subred) {
  const tabla = tablaDeSubred(estado, subred.id);
  const igw = igwDeVpc(estado, subred.vpcId);
  if (!tabla) return `No encontré la tabla de rutas de tu subred ${fmtSubred(subred)}.`;
  const cual = tabla.asociaciones.includes(subred.id)
    ? `la tabla ${tabla.id}${tabla.nombre ? ` («${tabla.nombre}»)` : ''}`
    : `la tabla principal ${tabla.id} (no le asociaste ninguna otra)`;
  const ruta = tabla.rutas.find((r) => r.destino === '0.0.0.0/0');
  if (!ruta) {
    const otra = estado.tablasRutas.find(
      (t) => t !== tabla && t.vpcId === subred.vpcId && t.rutas.some((r) => r.destino === '0.0.0.0/0' && r.objetivo.startsWith('igw-') && r.objetivo === igw?.id)
    );
    if (otra) {
      return `Tu subred ${fmtSubred(subred)} usa ${cual}, que no tiene la ruta 0.0.0.0/0. La tabla ${otra.id} sí la tiene, pero no está asociada a esta subred: ábrela y en Subnet associations → Edit subnet associations marca tu subred.`;
    }
    return `Tu subred ${fmtSubred(subred)} usa ${cual}, que solo tiene la ruta local. Falta la ruta 0.0.0.0/0 → ${igw ? igw.id : 'tu Internet Gateway'} (Routes → Edit routes → Add route)${igw ? '' : ', y antes necesitas el Internet Gateway conectado a la VPC'}.`;
  }
  if (ruta.objetivo.startsWith('nat-')) {
    return `Tu subred ${fmtSubred(subred)} usa ${cual}, que manda 0.0.0.0/0 a un NAT gateway (${ruta.objetivo}). Con NAT la subred sale a internet, pero nadie puede entrar desde afuera: para que sea pública, 0.0.0.0/0 debe ir al Internet Gateway.`;
  }
  if (!igw || ruta.objetivo !== igw.id) {
    return `Tu subred ${fmtSubred(subred)} usa ${cual}, que manda 0.0.0.0/0 a ${ruta.objetivo}, pero ese Internet Gateway no está conectado a tu VPC${igw ? ` (la tuya tiene ${igw.id})` : ''}. Conéctalo o cambia la ruta.`;
  }
  return `Tu subred ${fmtSubred(subred)} usa ${cual}.`;
}

/** ¿La subred no tiene ninguna salida a internet (ni IGW ni NAT)? */
export const esPrivadaSinSalida = (estado, subredId) => !esSubredPublica(estado, subredId) && !salePorNat(estado, subredId) && !(tablaDeSubred(estado, subredId)?.rutas ?? []).some((r) => r.destino === '0.0.0.0/0');

/* ================================================== grupos de seguridad */

const cubre22 = (r) => r.protocolo === '-1' || (r.protocolo === 'tcp' && r.desde <= 22 && 22 <= r.hasta);

export function reglasEntrada(estado, grupoIds) {
  return grupoIds.flatMap((id) => {
    const g = estado.gruposSeguridad.find((x) => x.id === id);
    return g ? g.entrada.map((r) => ({ grupo: g, regla: r })) : [];
  });
}

export function describirEntrada(estado, grupoIds) {
  const todas = reglasEntrada(estado, grupoIds);
  if (!todas.length) return 'ninguna regla de entrada';
  return todas.map(({ regla: r }) => `${tipoDeRegla(r)} ${textoPuertos(r)} desde ${r.origen}`).join('; ');
}

const nombresGrupos = (estado, grupoIds) =>
  grupoIds.map((id) => estado.gruposSeguridad.find((g) => g.id === id)).filter(Boolean).map((g) => `${g.nombre} (${g.id})`).join(', ');

/** Reglas que dejan entrar SSH desde algo más grande que tu IP. */
export const sshDemasiado = (estado, grupoIds, ipCasa) =>
  reglasEntrada(estado, grupoIds).filter(({ regla: r }) => cubre22(r) && !r.origen.startsWith('sg-') && r.origen !== `${ipCasa}/32`);

export const sshDesdeCasa = (estado, grupoIds, ipCasa) => reglasEntrada(estado, grupoIds).some(({ regla: r }) => cubre22(r) && r.origen === `${ipCasa}/32`);

const IPS_INTERNET = ['8.8.8.8', '201.141.33.10', '45.230.17.4'];

/** ¿Los grupos dejan entrar el puerto 80 desde cualquier lugar? */
export const httpAbierto = (estado, grupoIds, ipCasa) =>
  [ipCasa, ...IPS_INTERNET].every((ip) => gruposPermiten(estado, grupoIds, 'tcp', 80, ip).permite);

export function checkHttp(estado, inst, ipCasa, id = 'http', puntos = 5) {
  const texto = 'El grupo de seguridad deja entrar HTTP (puerto 80) desde cualquier lugar (0.0.0.0/0)';
  if (!inst) return check(id, texto, puntos, false, sinInstanciaRetro);
  const ok = httpAbierto(estado, inst.gruposSeguridad, ipCasa);
  if (ok) {
    return check(id, texto, puntos, true, 'Tu grupo de seguridad deja entrar el puerto 80 desde 0.0.0.0/0. Una página pública tiene que aceptar visitas de cualquier IP, porque tus clientes no tienen una dirección fija.');
  }
  const reglas = reglasEntrada(estado, inst.gruposSeguridad);
  const r443 = reglas.some(({ regla: r }) => r.protocolo === 'tcp' && r.desde <= 443 && 443 <= r.hasta && !(r.desde <= 80 && 80 <= r.hasta));
  const solo80Casa = gruposPermiten(estado, inst.gruposSeguridad, 'tcp', 80, ipCasa).permite;
  let detalle = 'Falta una regla HTTP (puerto 80) con origen 0.0.0.0/0 (Anywhere-IPv4).';
  if (solo80Casa) detalle = 'El puerto 80 solo está abierto para tu IP: tú sí verías la página, pero tus clientes no. Cambia el origen de la regla HTTP a 0.0.0.0/0.';
  else if (r443) detalle = 'Abriste HTTPS (443), pero Apache contesta por HTTP en el puerto 80. Agrega una regla HTTP (80) con origen 0.0.0.0/0.';
  return check(id, texto, puntos, false, `Los grupos de tu instancia ${fmtInst(inst)} [${nombresGrupos(estado, inst.gruposSeguridad)}] dejan entrar: ${describirEntrada(estado, inst.gruposSeguridad)}. ${detalle} Se edita en EC2 → Security Groups → tu grupo → Edit inbound rules.`);
}

/**
 * SSH «solo desde tu IP». `exigirCasa`: además debe existir la regla desde
 * tu IP (si es false, basta con que nadie más pueda entrar).
 */
export function checkSsh(estado, inst, ipCasa, { id = 'ssh', puntos = 6, exigirCasa = true, texto } = {}) {
  const t = texto ?? `SSH (puerto 22) solo desde tu IP ${ipCasa}/32, nunca desde 0.0.0.0/0`;
  if (!inst) return check(id, t, puntos, false, sinInstanciaRetro);
  const malas = sshDemasiado(estado, inst.gruposSeguridad, ipCasa);
  const casa = sshDesdeCasa(estado, inst.gruposSeguridad, ipCasa);
  if (!malas.length && (casa || !exigirCasa)) {
    return check(
      id,
      t,
      puntos,
      true,
      casa
        ? `SSH solo entra desde ${ipCasa}/32. Es mínimo privilegio en la red: aunque alguien adivine o robe tu llave, no puede ni intentar conectarse si no está en tu casa.`
        : 'Ya nadie en internet puede intentar entrar por SSH a tu servidor. Si algún día lo necesitas, ábrelo solo para tu IP (My IP) y por el tiempo justo.'
    );
  }
  if (malas.length) {
    const { grupo, regla } = malas[0];
    return check(
      id,
      t,
      puntos,
      false,
      `La regla ${tipoDeRegla(regla)} ${textoPuertos(regla)} desde ${regla.origen} de ${grupo.nombre} (${grupo.id}) deja que ${regla.origen === '0.0.0.0/0' ? 'cualquier computadora del mundo' : `todo el bloque ${regla.origen}`} intente entrar por SSH. ${exigirCasa ? `Cambia su origen a ${ipCasa}/32 (la opción My IP lo pone solo).` : `Bórrala o cambia su origen a ${ipCasa}/32 (My IP).`}`
    );
  }
  return check(id, t, puntos, false, `No hay ninguna regla SSH desde ${ipCasa}/32: se pidió que tú sí puedas entrar por SSH desde tu casa. Agrega en Edit inbound rules el tipo SSH con origen My IP.`);
}

/* ============================================================ instancias */

export const sinInstanciaRetro = 'Todavía no hay una instancia que revisar aquí: primero lánzala como pide la tarea.';

/**
 * Por qué no hay instancia viva en la VPC: ¿quedó en la VPC por omisión?,
 * ¿está terminada? Devuelve el texto para la retro.
 */
export function sinInstancia(estado, vpc, cidr) {
  const def = vpcPorDefecto(estado);
  const enDef = vivas(estado).filter((i) => i.vpcId === def?.id);
  const terminadas = estado.instancias.filter((i) => (i.estado === 'terminated' || i.estado === 'shutting-down') && (!vpc || i.vpcId === vpc.id));
  if (!vpc) return `${sinVpc(estado, cidr)} La instancia tiene que vivir dentro de esa VPC.`;
  if (enDef.length) {
    return `Tu instancia ${fmtInst(enDef[0])} está en la VPC por omisión (172.31.0.0/16), no en tu VPC ${vpc.cidr}, así que no cuenta. Lanza otra y en Network settings pulsa Edit para elegir tu VPC y tu subred pública.`;
  }
  if (terminadas.length) return `Tu instancia ${fmtInst(terminadas[0])} está terminated: una instancia terminada ya no existe y no cuenta. Lanza una nueva en tu VPC.`;
  return `No hay ninguna instancia en tu VPC ${vpc.cidr}. Lánzala en EC2 → Instances → Launch instances, eligiendo tu VPC y tu subred pública en Network settings.`;
}

/** Lo mismo, corto, para los demás puntos de la tarea (la explicación completa va en el primero). */
export function sinInstanciaCorta(estado, vpc, cidr) {
  const def = vpcPorDefecto(estado);
  const enDef = vivas(estado).find((i) => i.vpcId === def?.id);
  if (vpc && enDef) return `Este punto se revisa en una instancia de tu VPC ${cidr}. La tuya (${fmtInst(enDef)}) está en la VPC por omisión, así que no cuenta (mira el primer punto de esta tarea).`;
  return `Este punto se revisa en una instancia encendida de tu VPC ${cidr}, y todavía no hay ninguna (mira el primer punto de esta tarea).`;
}

/** Abre la página de la instancia desde la casa del alumno. */
export function probar(estado, inst) {
  if (!inst?.ipPublica) return { resultado: 'sin-ip', diagnostico: [] };
  return probarPagina(estado, `http://${inst.ipPublica}`);
}

/** El paso donde se atoró la página, en palabras. */
export function explicarPagina(estado, inst, r) {
  if (!inst) return sinInstanciaRetro;
  if (r.resultado === 'sin-ip') {
    return inst.estado !== 'running'
      ? `Tu instancia ${fmtInst(inst)} está ${inst.estado}: apagada no tiene IP pública ni contesta.`
      : `Tu instancia ${fmtInst(inst)} no tiene IP pública, así que nadie puede abrir su página desde internet.`;
  }
  const fallo = r.diagnostico.find((p) => !p.ok);
  const base = `Al abrir http://${inst.ipPublica} desde tu casa sale ${r.error?.codigo ?? 'un error'}.`;
  if (!fallo) return base;
  let consejo = '';
  if (fallo.paso === 'Servidor web') {
    const ud = analizarUserData(inst);
    if (!(inst.userDataArranque ?? '').trim()) {
      consejo = ' La instancia arrancó por primera vez sin user data. El script solo corre en el primer arranque: aunque lo edites después, no se vuelve a ejecutar. Lanza una instancia nueva con el script en Advanced details → User data.';
    } else if (ud.problemas.length) {
      consejo = ` El script tuvo problemas: ${ud.problemas.join(' ')} Cópialo tal cual de la tarea.`;
    }
  }
  if (fallo.paso === 'NACL (entrada)' || fallo.paso === 'NACL (salida)') {
    consejo = ' Revisa las reglas de la NACL de esa subred en VPC → Network ACLs: se leen en orden de número y la primera que coincide decide.';
  }
  if (fallo.paso === 'Grupo de seguridad') consejo = ' Revisa las reglas de entrada de su grupo de seguridad.';
  return `${base} Se atoró en «${fallo.paso}»: ${fallo.detalle}${consejo}`;
}

/** Elige, de varias candidatas, la que más puntos saca con `evaluar`. */
export function mejorPor(candidatas, evaluar) {
  let mejor = null;
  let max = -1;
  for (const c of candidatas) {
    const checks = evaluar(c);
    const p = checks.reduce((s, x) => s + (x.ok ? x.puntos : 0), 0);
    if (p > max) {
      max = p;
      mejor = { candidata: c, checks };
    }
  }
  return mejor;
}

/** Retro de la IP pública de una instancia. */
export function checkIpPublica(estado, inst, { id = 'ip', puntos = 4 } = {}) {
  const t = 'La instancia tiene IP pública';
  if (!inst) return check(id, t, puntos, false, sinInstanciaRetro);
  if (inst.ipPublica) return check(id, t, puntos, true, `Tu instancia tiene la IP pública ${inst.ipPublica}. Sin ella, aunque la subred sea pública, nadie de afuera puede llegarle: la IP privada solo sirve dentro de la VPC.`);
  if (inst.estado !== 'running') return check(id, t, puntos, false, `Tu instancia ${fmtInst(inst)} está ${inst.estado}: mientras está apagada no tiene IP pública. Enciéndela (Instance state → Start).`);
  const subred = subredDe(estado, inst.subredId);
  return check(
    id,
    t,
    puntos,
    false,
    `Tu instancia ${fmtInst(inst)} no tiene IP pública: ${subred && !subred.ipPublicaAuto ? `la subred ${fmtSubred(subred)} tiene apagado «Auto-assign public IPv4» y ` : ''}al lanzarla no se activó «Auto-assign public IP». A una instancia ya lanzada no se le puede prender esa opción: asóciale una Elastic IP (EC2 → Elastic IPs → Allocate y luego Associate) o lánzala otra vez con Auto-assign public IP en Enable.`
  );
}

/* ================================================================== IAM */

// IAM no distingue mayúsculas en los nombres (no deja crear «Lupita» y «lupita»): aquí tampoco.
const igual = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export const usuario = (estado, nombre) => estado.iam.usuarios.find((u) => igual(u.nombre, nombre)) ?? null;
export const grupoIam = (estado, nombre) => estado.iam.grupos.find((g) => igual(g.nombre, nombre)) ?? null;
/** ¿El usuario está en ese grupo? */
export const estaEn = (u, nombreGrupo) => Boolean(u?.grupos.some((g) => igual(g, nombreGrupo)));
export const soloLectura = (politicas) => politicas.every((p) => politicaIam(p)?.acceso === 'lectura');
export const amplias = (politicas) => politicas.filter((p) => politicaIam(p)?.servicio === '*');
export const deEscritura = (politicas) => politicas.filter((p) => politicaIam(p)?.acceso !== 'lectura');

/** Un grupo con nombre parecido (mayúsculas, espacios), para la retro. */
export const grupoParecido = (estado, nombre) => estado.iam.grupos.find((g) => normal(g.nombre).replace(/[^a-z0-9]/g, '') === normal(nombre).replace(/[^a-z0-9]/g, '')) ?? null;
export const usuarioParecido = (estado, nombre) => estado.iam.usuarios.find((u) => normal(u.nombre).replace(/[^a-z0-9]/g, '') === normal(nombre).replace(/[^a-z0-9]/g, '')) ?? null;

export function faltaGrupo(estado, nombre) {
  const p = grupoParecido(estado, nombre);
  if (p) return `Encontré el grupo «${p.nombre}», pero se pidió exactamente «${nombre}». IAM no deja renombrar grupos desde la consola: crea uno nuevo con el nombre exacto.`;
  return `No existe el grupo «${nombre}». Créalo en IAM → User groups → Create group.`;
}

export function faltaUsuario(estado, nombre) {
  const p = usuarioParecido(estado, nombre);
  if (p) return `Encontré el usuario «${p.nombre}», pero se pidió exactamente «${nombre}». Crea uno con el nombre exacto.`;
  return `No existe el usuario «${nombre}». Créalo en IAM → Users → Create user.`;
}

/* =================================================================== S3 */

const BLOQUEOS = [
  ['aclsNuevas', 'new access control lists (ACLs)'],
  ['aclsCualquiera', 'any access control lists (ACLs)'],
  ['politicasNuevas', 'new public bucket or access point policies'],
  ['politicasCualquiera', 'any public bucket or access point policies']
];

/** El bucket pedido o, si no está, uno que empiece igual (para revisar lo demás y avisar del nombre). */
export function elegirBucket(estado, nombre, raiz) {
  const exacto = estado.buckets.find((b) => b.nombre === nombre);
  if (exacto) return { bucket: exacto, exacto: true };
  const parecido = estado.buckets.find((b) => b.nombre.startsWith(raiz));
  return { bucket: parecido ?? null, exacto: false };
}

export function retroNombreBucket(estado, nombre, eleccion) {
  if (eleccion.exacto) return `Tu bucket se llama ${nombre}. Los nombres de bucket son únicos en todo el mundo: por eso lleva tu sufijo.`;
  if (eleccion.bucket) return `Encontré el bucket «${eleccion.bucket.nombre}», pero se pidió exactamente «${nombre}». El nombre de un bucket no se puede cambiar: crea uno nuevo con el nombre exacto (los demás puntos se revisaron en «${eleccion.bucket.nombre}»).`;
  const otros = estado.buckets.map((b) => b.nombre);
  return `No existe el bucket «${nombre}»${otros.length ? ` (tus buckets: ${otros.join(', ')})` : ''}. Créalo en S3 → Create bucket.`;
}

export function checkBloqueo(eleccion, { id = 'bloqueo', puntos = 4 } = {}) {
  const t = 'El bucket tiene bloqueado todo el acceso público (Block all public access)';
  const b = eleccion.bucket;
  if (!b) return check(id, t, puntos, false, 'Sin el bucket no hay bloqueo que revisar. Al crearlo deja marcado «Block all public access».');
  const apagados = BLOQUEOS.filter(([k]) => !b.bloqueoPublico[k]).map(([, n]) => n);
  if (!apagados.length) return check(id, t, puntos, true, `Las cuatro casillas del bloqueo público de ${b.nombre} están en On. Así, aunque alguien se equivoque con una política o un permiso, S3 no deja que el bucket quede abierto a todo internet.`);
  return check(id, t, puntos, false, `Tu bucket ${b.nombre} tiene apagado el bloqueo de acceso público para: ${apagados.join('; ')}. Con eso, un descuido puede dejar los archivos a la vista de todo internet. Ve a la pestaña Permissions → Block public access → Edit y marca «Block all public access».`);
}

export function checkVersionado(eleccion, { id = 'versionado', puntos = 4 } = {}) {
  const t = 'El bucket tiene el versionado activado (Bucket Versioning: Enabled)';
  const b = eleccion.bucket;
  if (!b) return check(id, t, puntos, false, 'Sin el bucket no hay versionado que revisar.');
  if (b.versionado === 'Enabled') return check(id, t, puntos, true, `El versionado de ${b.nombre} está en Enabled: si alguien sobrescribe o borra un archivo, la versión anterior sigue ahí y se puede recuperar.`);
  return check(id, t, puntos, false, `El versionado de ${b.nombre} está en ${b.versionado}. Sin versionado, un archivo borrado o sobrescrito se pierde para siempre. Actívalo en la pestaña Properties → Bucket Versioning → Edit → Enable.`);
}

/** Las reglas de ciclo de vida activas que aplican a todo el bucket. */
export const reglasTodoElBucket = (b) => (b?.ciclo ?? []).filter((r) => r.estado === 'Enabled' && !r.prefijo);

export function describirCiclo(b) {
  if (!b?.ciclo?.length) return 'no tiene reglas de ciclo de vida';
  return `tiene estas reglas: ${b.ciclo
    .map((r) => `«${r.nombre}» (${r.estado}${r.prefijo ? `, solo el prefijo ${r.prefijo}` : ', todo el bucket'}: ${[
      ...r.transiciones.map((t) => `día ${t.dias} → ${claseS3(t.clase)?.nombre ?? t.clase}`),
      r.expiracionDias ? `expira el día ${r.expiracionDias}` : null
    ]
      .filter(Boolean)
      .join(', ') || 'sin acciones para la versión actual'})`)
    .join('; ')}`;
}

/* ================================================================= NACL */

export { naclDeSubred, naclPermite };
