// Rúbrica del simulacro 2 · Veterinaria Patitas (diagnosticar y reparar).

import {
  adjuntarIgw,
  adjuntarVolumen,
  agregarUsuariosAGrupo,
  asociarNacl,
  asociarSubredes,
  avanzar,
  cambiarRolInstancia,
  claseS3,
  crearGrupoIam,
  crearReglaCiclo,
  crearRol,
  crearSnapshot,
  crearTablaRutas,
  crearVolumen,
  editarBloqueoPublico,
  editarReglasNacl,
  editarReglasSg,
  editarRutas,
  editarVersionado,
  igwDeVpc,
  quitarPoliticaUsuario,
  reloj,
  tablaDeSubred,
  textoProtocolo,
  textoPuertos
} from '../../public/consola/modelo.js';
import { esSubredPublica } from '../../public/consola/red.js';
import { LAB, datosLab } from '../../public/labs/simulacro-2.js';
import {
  amplias,
  armar,
  check,
  checkBloqueo,
  checkHttp,
  checkSsh,
  checkVersionado,
  contiene,
  deEscritura,
  describirCiclo,
  elegirBucket,
  elegirVpc,
  estaEn,
  esPrivadaSinSalida,
  explicarPagina,
  explicarRuta,
  faltaGrupo,
  fmtInst,
  fmtSubred,
  grupoIam,
  lista,
  mejorPor,
  naclDeSubred,
  naclPermite,
  normal,
  preparar,
  probar,
  reglasTodoElBucket,
  retroIgw,
  sinInstancia,
  sinVpc,
  usuario,
  vivas
} from './comun.js';

// Las políticas con las que un rol sí puede leer S3 (para «¿está asignado?»).
const LEEN_S3 = ['AmazonS3ReadOnlyAccess', 'AmazonS3FullAccess', 'ReadOnlyAccess', 'PowerUserAccess', 'AdministratorAccess'];

// Desde dónde se prueba la NACL: la casa del alumno y otras IP de internet.
const IPS_PRUEBA = ['8.8.8.8', '201.141.33.10'];
// Los puertos efímeros a los que regresan las respuestas (los extremos y uno de en medio).
const EFIMEROS = [1024, 50000, 65535];

/** ¿Esta instancia trae el script de la veterinaria? (aunque luego le hayan editado el user data) */
const conScript = (i, x) => i.userDataArranque === x.userData || i.userData === x.userData;

/** La instancia que dejó el sobrino: la primera con su script. */
const original = (estado, x) => estado.instancias.find((i) => conScript(i, x)) ?? null;
const sigueViva = (i) => i && i.estado !== 'terminated' && i.estado !== 'shutting-down';

const nombreTabla = (t) => `${t.id}${t.nombre ? ` («${t.nombre}»)` : ''}`;
const nombreNacl = (n) => `${n.nombre ? `«${n.nombre}» ` : ''}${n.id}`;
const fmtReglaNacl = (r) => `${r.numero} ${r.accion === 'deny' ? 'Deny' : 'Allow'} ${textoProtocolo(r.protocolo)} ${textoPuertos(r)} ${r.cidr}`;
const reglasNacl = (n, sentido) => (n[sentido].length ? n[sentido].map(fmtReglaNacl).join('; ') : 'ninguna (solo la * que niega todo)');

/* ================================================================== web */

function paginaDe(estado, inst, x) {
  const r = probar(estado, inst);
  const abre = r.resultado === 'ok' && r.codigoHttp === 200;
  return { r, abre, conTexto: abre && contiene(r.html, x.textoPagina) && contiene(r.html, x.textoClinica) };
}

function checksServidor(estado, inst, x) {
  const p = inst ? paginaDe(estado, inst, x) : { r: { resultado: 'sin-ip', diagnostico: [] }, abre: false, conTexto: false };
  let retroPagina;
  if (p.conTexto) retroPagina = `http://${inst.ipPublica} abre y muestra la página de la veterinaria. Arreglaste la red sin tocar el servidor: el problema casi nunca es la instancia, sino el camino para llegar a ella.`;
  else if (p.abre) retroPagina = `La página abre, pero no dice «${x.textoPagina}» y «${x.textoClinica}». Se pedía la página que ya tenía ${x.instancia}: no la reemplaces.`;
  else retroPagina = explicarPagina(estado, inst, p.r);
  return [
    checkHttp(estado, inst, x.ipCasa, 'http', 5),
    checkSsh(estado, inst, x.ipCasa, { puntos: 4, exigirCasa: false, texto: 'Nadie del mundo puede intentar SSH (sin SSH desde 0.0.0.0/0)' }),
    check('pagina', `La página de citas abre y dice «${x.textoPagina}»`, 4, p.conTexto, retroPagina)
  ];
}

/** La instancia web que se revisa: la que mejor quedó (la original gana los empates). */
function instanciaWeb(estado, x, vpc) {
  if (!vpc) return null;
  const orig = original(estado, x);
  const candidatas = vivas(estado).filter((i) => i.vpcId === vpc.id);
  candidatas.sort((a, b) => (b === orig) - (a === orig));
  return mejorPor(candidatas, (i) => checksServidor(estado, i, x))?.candidata ?? null;
}

/** La instancia de la veterinaria para las tareas que no son de red: la original si sigue viva. */
function laInstancia(estado, x) {
  const orig = original(estado, x);
  return (sigueViva(orig) ? orig : null) ?? instanciaWeb(estado, x, elegirVpc(estado, x.vpcCidr));
}

/** La subred pública: la de la instancia o, si no hay instancia, la del CIDR pedido. */
function subredPublica(estado, x, vpc, inst) {
  const porCidr = vpc ? estado.subredes.find((s) => s.vpcId === vpc.id && s.cidr === x.publicaCidr) ?? null : null;
  return (inst && estado.subredes.find((s) => s.id === inst.subredId)) ?? porCidr;
}

const tablaPrincipal = (estado, vpc) => estado.tablasRutas.find((t) => t.vpcId === vpc.id && t.principal) ?? null;
const conInternet = (t) => Boolean(t?.rutas.some((r) => r.destino === '0.0.0.0/0'));

function revisarWeb(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  if (!vpc) {
    const r = `${sinVpc(estado, x.vpcCidr)} Ojo: la VPC ${x.vpcNombre} ya venía hecha; si la borraste, ya no se puede reparar lo que pedía la tarea.`;
    return [
      check('igw', `El Internet Gateway conectado a ${x.vpcNombre}`, 4, false, r),
      check('ruta', `${x.publicaNombre} es pública (0.0.0.0/0 → Internet Gateway)`, 5, false, r),
      check('propia', `${x.publicaNombre} usa una tabla de rutas propia, no la principal`, 3, false, r),
      check('privada', `${x.privadaNombre} y la tabla principal siguen sin salida a internet`, 3, false, r),
      check('http', 'HTTP (80) desde 0.0.0.0/0', 5, false, r),
      check('ssh', 'Sin SSH desde 0.0.0.0/0', 4, false, r),
      check('pagina', 'La página de citas abre', 4, false, r),
      check('original', `La página abre desde la instancia original ${x.instancia}`, 2, false, r)
    ];
  }
  const inst = instanciaWeb(estado, x, vpc);
  const orig = original(estado, x);
  const privada = estado.subredes.find((s) => s.vpcId === vpc.id && s.cidr === x.privadaCidr) ?? null;
  const subredWeb = subredPublica(estado, x, vpc, inst);
  const principal = tablaPrincipal(estado, vpc);

  const igw = igwDeVpc(estado, vpc.id);
  const checks = [check('igw', `El Internet Gateway conectado a ${x.vpcNombre}`, 4, igw, retroIgw(estado, vpc))];

  // ruta: que la subred de la página sea pública, con la tabla que sea.
  const esPub = Boolean(subredWeb && esSubredPublica(estado, subredWeb.id));
  checks.push(
    check(
      'ruta',
      `${x.publicaNombre} es pública (su tabla manda 0.0.0.0/0 al Internet Gateway)`,
      5,
      esPub,
      esPub
        ? `La tabla de ${fmtSubred(subredWeb)} manda 0.0.0.0/0 a ${igw.id}. Un gateway conectado no basta: cada subred necesita su «letrero» que mande el tráfico de internet a esa puerta.`
        : subredWeb
          ? explicarRuta(estado, subredWeb)
          : `Ya no existe la subred ${x.publicaNombre} (${x.publicaCidr}).`
    )
  );

  // propia: que esa ruta venga de una tabla asociada a mano, no de la principal.
  const tablaWeb = subredWeb ? tablaDeSubred(estado, subredWeb.id) : null;
  const okPropia = esPub && tablaWeb && !tablaWeb.principal;
  const propiasConRuta = estado.tablasRutas.filter((t) => t.vpcId === vpc.id && !t.principal && t.rutas.some((r) => r.destino === '0.0.0.0/0' && r.objetivo === igw?.id));
  const propias = estado.tablasRutas.filter((t) => t.vpcId === vpc.id && !t.principal);
  let retroPropia;
  if (okPropia) retroPropia = `${x.publicaNombre} usa tu tabla ${nombreTabla(tablaWeb)}, asociada a mano y con 0.0.0.0/0 → ${igw.id}. Así solo se vuelve pública la subred que tú eliges.`;
  else if (!subredWeb) retroPropia = `Ya no existe la subred ${x.publicaNombre} (${x.publicaCidr}) para asociarle una tabla.`;
  else if (esPub) retroPropia = `${fmtSubred(subredWeb)} sí sale a internet, pero porque heredó la tabla principal ${nombreTabla(tablaWeb)}, a la que le pusiste 0.0.0.0/0. Se pidió una tabla propia: VPC → Route tables → Create route table, ponle la ruta, asóciala a ${x.publicaNombre} y quita la ruta de la principal.`;
  else if (propiasConRuta.length) retroPropia = `Tu tabla ${nombreTabla(propiasConRuta[0])} ya tiene 0.0.0.0/0 → ${igw.id}, pero ${x.publicaNombre} no está asociada a ella: sin asociación, la subred sigue usando la tabla principal. Ábrela → Subnet associations → Edit subnet associations → marca ${x.publicaNombre}.`;
  else if (propias.length) retroPropia = `Tu tabla ${nombreTabla(propias[0])} todavía no tiene la ruta 0.0.0.0/0 → ${igw ? igw.id : 'tu Internet Gateway'}${propias[0].asociaciones.includes(subredWeb.id) ? '' : ` ni está asociada a ${x.publicaNombre}`}. Routes → Edit routes → Add route, y luego Subnet associations → Edit subnet associations.`;
  else retroPropia = `En ${x.vpcNombre} solo existe la tabla principal ${principal ? principal.id : ''}. Crea una propia en VPC → Route tables → Create route table (elige ${x.vpcNombre}), ponle 0.0.0.0/0 → ${igw ? igw.id : 'el Internet Gateway'} y asóciala a ${x.publicaNombre}.`;
  checks.push(check('propia', `${x.publicaNombre} usa una tabla de rutas propia (asociada a mano), no la principal`, 3, okPropia, retroPropia));

  // privada: la de la base de datos y la principal, sin salida; y la pública sí sale.
  const privSin = privada && esPrivadaSinSalida(estado, privada.id);
  const okPriv = privSin && !conInternet(principal) && esPub;
  let retroPriv;
  if (okPriv) retroPriv = `${x.privadaNombre} usa una tabla sin 0.0.0.0/0, y la principal tampoco la tiene, mientras la pública sí sale. Toda subred sin tabla propia hereda la principal: por eso la ruta a internet va en una tabla aparte, y una subred nueva nace privada.`;
  else if (!privada) retroPriv = `Ya no existe la subred ${x.privadaNombre} (${x.privadaCidr}): se pedía conservarla, sin salida a internet, para la futura base de datos.`;
  else if (!privSin) {
    const t = tablaDeSubred(estado, privada.id);
    retroPriv = t?.principal
      ? `Tu subred ${fmtSubred(privada)} hereda la tabla principal ${nombreTabla(t)}, que ahora tiene 0.0.0.0/0, así que la base de datos quedaría expuesta. Toda subred sin tabla propia usa la principal: quita esa ruta de la principal (Routes → Edit routes → Remove) y déjala solo en tu tabla propia asociada a ${x.publicaNombre}.`
      : `Tu subred ${fmtSubred(privada)} está asociada a la tabla ${nombreTabla(t)}, que tiene 0.0.0.0/0, así que la base de datos quedaría expuesta. En esa tabla → Subnet associations → Edit subnet associations, desmarca ${x.privadaNombre}: regresará a la principal, sin salida.`;
  } else if (conInternet(principal)) retroPriv = `${x.privadaNombre} no sale, pero la tabla principal ${nombreTabla(principal)} tiene 0.0.0.0/0: cualquier subred nueva de ${x.vpcNombre} nacería pública sin que nadie se dé cuenta. Quita esa ruta de la principal.`;
  else retroPriv = `${x.privadaNombre} sigue privada, pero este punto se gana cuando, además, la subred pública ya sale a internet: el chiste es separar una de otra con tablas distintas.`;
  checks.push(check('privada', `${x.privadaNombre} y la tabla principal siguen sin salida a internet (y la pública sí sale)`, 3, okPriv, retroPriv));

  const porQue = inst ? null : sinInstancia(estado, vpc, x.vpcCidr);
  const deServidor = checksServidor(estado, inst, x).map((c) => (porQue ? { ...c, retro: porQue } : c));
  checks.push(...deServidor);

  const okOrig = sigueViva(orig) && paginaDe(estado, orig, x).conTexto;
  let retroOrig;
  if (okOrig) retroOrig = `La página sale de ${fmtInst(orig)}, la misma instancia de siempre. Relanzar habría escondido el problema y cambiado la IP que ya conocían los clientes.`;
  else if (!sigueViva(orig)) retroOrig = `Tu instancia original ${orig ? fmtInst(orig) : x.instancia} ya no existe (terminated). Se pedía repararla sin relanzar: en la vida real, terminar un servidor puede perder datos que no estaban en otro lado.`;
  else retroOrig = `La instancia original ${fmtInst(orig)} todavía no muestra la página desde internet. ${explicarPagina(estado, orig, paginaDe(estado, orig, x).r)}`;
  checks.push(check('original', `La página abre desde la instancia original ${x.instancia}`, 2, okOrig, retroOrig));
  return checks;
}

/* ================================================================= NACL */

function revisarNacl(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  const t1 = `${x.publicaNombre} usa la NACL «${x.nacl}»`;
  const t2 = `«${x.nacl}» deja entrar HTTP (80) y salir las respuestas (puertos 1024-65535)`;
  if (!vpc) {
    const r = sinVpc(estado, x.vpcCidr);
    return [check('asociada', t1, 6, false, r), check('salida', t2, 6, false, r)];
  }
  const subred = subredPublica(estado, x, vpc, instanciaWeb(estado, x, vpc));
  const buena = estado.nacls.find((n) => n.vpcId === vpc.id && n.nombre === x.nacl) ?? null;
  const actual = subred ? naclDeSubred(estado, subred.id) : null;

  // asociada
  const okAsoc = Boolean(buena && actual === buena);
  let r1;
  if (okAsoc) r1 = `${x.publicaNombre} usa ${nombreNacl(buena)}. Cada subred tiene exactamente una NACL: al asociarle esta, salió de la de pruebas.`;
  else if (!subred) r1 = `Ya no existe la subred ${x.publicaNombre} (${x.publicaCidr}) para revisarle la NACL.`;
  else if (!buena) r1 = `Ya no existe la NACL ${x.nacl} en ${x.vpcNombre}: se pedía usar esa. Créala otra vez con ese nombre (VPC → Network ACLs → Create network ACL), con HTTP de entrada y la salida de las respuestas, y asóciala a ${x.publicaNombre}.`;
  else if (actual?.nombre === x.naclPruebas) {
    const bloquea = !naclPermite(actual, 'entrada', 'tcp', 80, x.ipCasa).permite;
    r1 = `${fmtSubred(subred)} sigue usando ${nombreNacl(actual)}, la de pruebas.${bloquea ? ` Su regla ${naclPermite(actual, 'entrada', 'tcp', 80, x.ipCasa).regla?.numero ?? '*'} niega todo, y como las reglas se leen de menor a mayor y la primera que coincide decide, la 100 que permite todo nunca llega a aplicarse.` : ' Aunque ya la hayas abierto, se pidió la NACL buena.'} Ve a VPC → Network ACLs → ${x.nacl} → Subnet associations → Edit subnet associations y marca ${x.publicaNombre}.`;
  } else if (actual?.porDefecto) r1 = `${fmtSubred(subred)} usa la NACL por omisión (${actual.id}), que deja pasar todo. Se pidió ${nombreNacl(buena)}: VPC → Network ACLs → ${x.nacl} → Subnet associations → Edit subnet associations.`;
  else r1 = `${fmtSubred(subred)} usa la NACL ${actual ? nombreNacl(actual) : '(ninguna)'}; se pidió ${nombreNacl(buena)}. Asóciala en VPC → Network ACLs → ${x.nacl} → Subnet associations → Edit subnet associations.`;

  // salida (y entrada): se revisa en patitas-nacl, aunque todavía no esté asociada.
  let okSal = false;
  let r2;
  if (!buena) r2 = `Ya no existe la NACL ${x.nacl}: no hay reglas que revisar.`;
  else {
    const ips = [x.ipCasa, ...IPS_PRUEBA];
    const noEntra = ips.map((ip) => naclPermite(buena, 'entrada', 'tcp', 80, ip)).find((p) => !p.permite);
    const noSale = ips.flatMap((ip) => EFIMEROS.map((puerto) => ({ puerto, ...naclPermite(buena, 'salida', 'tcp', puerto, ip) }))).find((p) => !p.permite);
    okSal = !noEntra && !noSale;
    if (okSal) r2 = `${x.nacl} deja entrar el 80 y salir las respuestas hacia los puertos 1024-65535. La NACL es stateless: no recuerda que la visita entró, así que la respuesta necesita su propia regla de salida. El grupo de seguridad, en cambio, es stateful: la respuesta sale sola.`;
    else if (noEntra) {
      r2 = `${x.nacl} ya no deja entrar el puerto 80: ${noEntra.regla === '*' ? 'ninguna regla de entrada lo permite y gana la * que niega todo' : `lo niega la regla ${fmtReglaNacl(noEntra.regla)}, y la primera que coincide decide`}. Sus reglas de entrada: ${reglasNacl(buena, 'entrada')}. Deja una Allow HTTP (80) desde 0.0.0.0/0.`;
    } else {
      r2 = `Las reglas de salida de ${x.nacl} son: ${reglasNacl(buena, 'salida')}. ${noSale.regla === '*' ? `Ninguna deja salir al puerto ${noSale.puerto}` : `La regla ${noSale.regla.numero} niega el puerto ${noSale.puerto}`}: la respuesta de Apache no sale hacia el puerto 80, sino hacia el puerto alto que abrió el navegador del cliente (1024-65535). Como la NACL no recuerda conexiones, agrégala aparte: Outbound rules → Edit outbound rules → Add new rule, por ejemplo 110, Custom TCP, 1024-65535, 0.0.0.0/0, Allow.`;
    }
  }
  return [check('asociada', t1, 6, okAsoc, r1), check('salida', t2, 6, okSal, r2)];
}

/* ================================================================== IAM */

function revisarIam(estado, x) {
  const u = usuario(estado, x.sobrino);
  const g = grupoIam(estado, x.grupo);
  const sinU = `Ya no existe el usuario ${x.sobrino}. Se pedía arreglar sus permisos, no borrarlo: créalo otra vez con ese nombre.`;

  const okDirecto = u && u.politicas.length === 0;
  const directo = check(
    'sin-admin',
    `${x.sobrino} no tiene políticas puestas directo (ni AdministratorAccess)`,
    5,
    okDirecto,
    okDirecto
      ? `${x.sobrino} ya no tiene AdministratorAccess. Con ella podía borrar toda la cuenta, ver facturas y crear usuarios: lo opuesto al mínimo privilegio.`
      : !u
        ? sinU
        : `${x.sobrino} todavía tiene puestas directo: ${lista(u.politicas)}. Quítalas en IAM → Users → ${x.sobrino} → Permissions → Remove; sus permisos deben llegarle por el grupo.`
  );

  const pols = g?.politicas ?? [];
  const faltan = x.politicasGrupo.filter((p) => !pols.includes(p));
  const escritura = deEscritura(pols);
  const anchas = amplias(pols);
  const okG = g && !faltan.length && !escritura.length && !anchas.length;
  let retroG;
  if (okG) retroG = `El grupo ${x.grupo} puede ver los expedientes en S3 y el servidor en EC2, y nada más. Si mañana llega otra recepcionista, solo la metes al grupo.`;
  else if (!g) retroG = faltaGrupo(estado, x.grupo);
  else if (escritura.length) retroG = `El grupo ${x.grupo} tiene ${lista(escritura)}, que deja cambiar o borrar cosas. La recepción solo ve: quítala y deja ${x.politicasGrupo.join(' y ')}.`;
  else if (anchas.length) retroG = `El grupo ${x.grupo} tiene ${lista(anchas)}: funciona, pero deja leer TODA la cuenta (usuarios, facturas, redes…). Mínimo privilegio: cámbiala por ${x.politicasGrupo.join(' y ')}.`;
  else retroG = `El grupo ${x.grupo} tiene: ${lista(pols)}. Le falta ${lista(faltan)} (Permissions → Add permissions → Attach policies).`;
  const grupo = check('grupo', `El grupo «${x.grupo}» con ${x.politicasGrupo.join(' y ')} y nada más amplio`, 5, okG, retroG);

  const okM = estaEn(u, x.grupo);
  const miembro = check(
    'miembro',
    `${x.sobrino} está en el grupo «${x.grupo}»`,
    4,
    okM,
    okM ? `${x.sobrino} hereda los permisos del grupo. Así sus permisos se revisan en un solo lugar.` : !u ? sinU : `${x.sobrino} está en: ${lista(u.grupos, 'ningún grupo')}. Agrégalo a ${x.grupo} (User groups → ${x.grupo} → Add users).`
  );
  return [directo, grupo, miembro];
}

/* ================================================================== rol */

function revisarRol(estado, x) {
  const inst = laInstancia(estado, x);
  const roles = estado.iam.roles;
  const deEc2 = roles.filter((r) => r.servicio === 'ec2.amazonaws.com');
  const justo = (r) => r.politicas.includes(x.politicaRol) && !deEscritura(r.politicas).length && !amplias(r.politicas).length;
  const asignado = inst?.rolIam ? roles.find((r) => r.nombre === inst.rolIam) : null;
  const elegido = (asignado && asignado.servicio === 'ec2.amazonaws.com' ? asignado : null) ?? deEc2.find(justo) ?? deEc2[0] ?? null;

  const okRol = elegido && justo(elegido);
  let retroRol;
  if (okRol) retroRol = `El rol ${elegido.nombre} confía en EC2 y solo deja leer S3. Es la forma correcta de dar permisos a un servidor: credenciales temporales y mínimo privilegio, sin llaves de acceso escritas en ningún archivo.`;
  else if (!elegido) retroRol = roles.length ? `Tus roles (${roles.map((r) => r.nombre).join(', ')}) no son para EC2. Crea uno en IAM → Roles → Create role → AWS service → EC2.` : 'No hay ningún rol. Créalo en IAM → Roles → Create role → AWS service → EC2, con la política AmazonS3ReadOnlyAccess.';
  else if (deEscritura(elegido.politicas).length || amplias(elegido.politicas).length) {
    retroRol = `Tu rol ${elegido.nombre} tiene ${lista([...new Set([...deEscritura(elegido.politicas), ...amplias(elegido.politicas)])])}: más de lo que el servidor necesita. Si alguien toma el servidor, se lleva esos permisos. Déjale solo ${x.politicaRol}.`;
  } else retroRol = `Tu rol ${elegido.nombre} tiene: ${lista(elegido.politicas)}. Le falta ${x.politicaRol} (Permissions → Add permissions).`;
  const rol = check('rol', `Un rol para EC2 con ${x.politicaRol} y nada más`, 5, okRol, retroRol);

  const okAsig = inst && asignado && asignado.politicas.some((p) => LEEN_S3.includes(p));
  let retroAsig;
  if (okAsig) retroAsig = `${fmtInst(inst)} usa el rol ${asignado.nombre}: el código del servidor obtiene credenciales temporales solas, que se renuevan sin que nadie las copie.`;
  else if (!inst) retroAsig = `No encontré la instancia ${x.instancia} viva en tu VPC para revisarle el rol.`;
  else if (!inst.rolIam) retroAsig = `La instancia ${fmtInst(inst)} no tiene rol (IAM role: vacío). Asígnalo en EC2 → Instances → Actions → Security → Modify IAM role; no hace falta relanzarla.`;
  else retroAsig = `La instancia ${fmtInst(inst)} usa el rol ${inst.rolIam}, que no deja leer S3 (${lista(asignado?.politicas ?? [])}). Asígnale el rol con ${x.politicaRol}.`;
  const asig = check('asignado', `El rol está asignado a la instancia ${x.instancia}`, 7, okAsig, retroAsig);
  return [rol, asig];
}

/* =================================================================== S3 */

function revisarS3(estado, x) {
  const el = elegirBucket(estado, x.bucket, 'patitas');
  const b = el.bucket;
  const reglas = reglasTodoElBucket(b);
  const conTransicion = (dias, clase) => reglas.some((r) => r.transiciones.some((t) => t.dias === dias && t.clase === clase));
  const sinBucket = `No encontré el bucket ${x.bucket}: venía con los expedientes. Si lo borraste, créalo otra vez con ese nombre.`;
  const retroCiclo = (ok, aprendizaje, falta) => (ok ? aprendizaje : !b ? sinBucket : `${falta} Tu bucket ${describirCiclo(b)}. Se crea en la pestaña Management → Create lifecycle rule, con «Apply to all objects in the bucket».`);

  const ia = conTransicion(30, 'STANDARD_IA');
  const gl = conTransicion(180, 'GLACIER');
  const otraClase180 = reglas.flatMap((r) => r.transiciones).find((t) => t.dias === 180 && t.clase !== 'GLACIER');
  const exp = reglas.some((r) => r.expiracionDias === 1825);
  const conVersiones = b?.versionado === 'Enabled';
  const borraAnteriores = reglas.some((r) => r.borrarNoActualesDias !== null && r.borrarNoActualesDias !== undefined);
  const aprendizajeExp = `A los 1825 días S3 los expira solo: guardar datos para siempre cuesta, y la clínica decidió conservarlos 5 años.${
    conVersiones && !borraAnteriores
      ? ' Ojo: con el versionado activado, «Expire current versions» no borra de verdad: pone un marcador de borrado y la versión anterior sigue ocupando espacio (y cobrando). Para borrarla también se agrega «Permanently delete noncurrent versions of objects».'
      : conVersiones
        ? ' Como el bucket tiene versionado, también borras las versiones anteriores: si no, «Expire current versions» solo pondría un marcador de borrado y la versión vieja seguiría ocupando espacio.'
        : ''
  }`;
  return [
    { ...checkBloqueo(el, { puntos: 4 }), ...(b ? {} : { retro: sinBucket }) },
    { ...checkVersionado(el, { puntos: 3 }), ...(b ? {} : { retro: sinBucket }) },
    check('ia-30', 'Regla activa para todo el bucket: Standard-IA a los 30 días', 3, ia, retroCiclo(ia, 'A los 30 días los expedientes pasan a Standard-IA: cuesta menos guardar y un poco más leer, justo para lo que ya casi no se consulta.', 'Falta la transición a Standard-IA a los 30 días en una regla activa para todo el bucket.')),
    check(
      'glacier-180',
      'Regla activa para todo el bucket: Glacier Flexible Retrieval a los 180 días',
      3,
      gl,
      retroCiclo(
        gl,
        'A los 180 días pasan a Glacier Flexible Retrieval: archivo barato que tarda de minutos a horas en devolverlos, suficiente para un expediente viejo que casi nadie pide.',
        otraClase180 ? `A los 180 días los mandas a ${claseS3(otraClase180.clase)?.nombre}, pero se pidió Glacier Flexible Retrieval.` : 'Falta la transición a Glacier Flexible Retrieval a los 180 días.'
      )
    ),
    check('expira', 'Regla activa para todo el bucket: expiran a los 1825 días (5 años)', 2, exp, retroCiclo(exp, aprendizajeExp, 'Falta la expiración («Expire current versions of objects») a los 1825 días.'))
  ];
}

/* =============================================================== discos */

function revisarDiscos(estado, x) {
  const inst = laInstancia(estado, x);
  const datos = estado.volumenes.filter((v) => !v.raiz);
  const justo = (v) => v.tipo === x.volumenTipo && v.tamano === x.volumenTamano;
  const correctos = datos.filter(justo);
  const pedido = `${x.volumenTipo} de ${x.volumenTamano} GiB`;
  const describir = (v) => `${v.id} (${v.tipo}, ${v.tamano} GiB, ${v.az}, ${v.estado})`;

  const okVol = correctos.length > 0;
  const retroVol = okVol
    ? `Tu volumen ${correctos[0].id} es ${pedido}. Un volumen EBS es un disco de red: vive aparte de la instancia y sobrevive aunque la apagues.`
    : datos.length
      ? `Tus volúmenes además del raíz son: ${datos.map(describir).join('; ')}. Se pidió uno ${pedido}. El tipo y el tamaño se eligen en EC2 → Volumes → Create volume.`
      : `No hay ningún volumen además del disco raíz. Créalo en EC2 → Volumes → Create volume: ${pedido}, en la zona de ${x.instancia}${inst ? ` (${inst.az})` : ''}.`;

  const adjuntos = inst ? datos.filter((v) => v.instanciaId === inst.id && v.estado === 'in-use') : [];
  const okAdj = adjuntos.length > 0;
  let retroAdj;
  if (okAdj) retroAdj = `${adjuntos[0].id} está conectado a ${fmtInst(inst)} como ${adjuntos[0].dispositivo}. Lo lograste porque está en ${adjuntos[0].az}, la misma zona que la instancia: un volumen EBS solo se conecta a instancias de su misma zona.`;
  else if (!inst) retroAdj = `Ya no encontré la instancia ${x.instancia} viva para conectarle el disco.`;
  else {
    const otraZona = datos.find((v) => v.az !== inst.az && v.estado !== 'in-use');
    const suelto = datos.find((v) => v.az === inst.az && v.estado === 'available');
    const enOtra = datos.find((v) => v.estado === 'in-use' && v.instanciaId !== inst.id);
    if (otraZona) retroAdj = `Tu volumen ${otraZona.id} está en ${otraZona.az} y ${fmtInst(inst)} en ${inst.az}: un volumen EBS solo se conecta a instancias de su misma zona, por eso Attach volume no te ofrece la instancia. Crea otro en ${inst.az} (o un snapshot de ese y, de él, un volumen en ${inst.az}).`;
    else if (suelto) retroAdj = `Tu volumen ${suelto.id} está «available»: existe, pero no está conectado. Selecciónalo → Actions → Attach volume y elige ${fmtInst(inst)}.`;
    else if (enOtra) retroAdj = `Tu volumen ${enOtra.id} está conectado a ${enOtra.instanciaId}, no a ${fmtInst(inst)}.`;
    else retroAdj = `${fmtInst(inst)} solo tiene su disco raíz. Crea el volumen en ${inst.az} y conéctalo con Actions → Attach volume.`;
  }

  const idsDatos = new Set((correctos.length ? correctos : adjuntos).map((v) => v.id));
  const buenos = estado.snapshots.filter((s) => idsDatos.has(s.volumenId));
  const okSnap = buenos.length > 0;
  let retroSnap;
  if (okSnap) retroSnap = `El snapshot ${buenos[0].id} respalda ${buenos[0].volumenId}. Es una foto del disco que se guarda en S3: con ella puedes crear un disco idéntico, incluso en otra zona.`;
  else if (estado.snapshots.length) {
    const s = estado.snapshots[0];
    const v = estado.volumenes.find((y) => y.id === s.volumenId);
    retroSnap = `Tu snapshot ${s.id} es del volumen ${s.volumenId}${v?.raiz ? ' (el disco raíz de la instancia)' : ''}, no del disco de radiografías ${pedido}. Selecciona ese volumen en EC2 → Volumes → Actions → Create snapshot.`;
  } else retroSnap = `No hay snapshots. Selecciona tu volumen ${pedido} en EC2 → Volumes → Actions → Create snapshot.`;

  const limpio = (t) => normal(t).replace(/[^a-z0-9]+/g, ' ').trim();
  const conDesc = estado.snapshots.filter((s) => limpio(s.descripcion) === limpio(x.descSnap));
  const okDesc = conDesc.length > 0;
  const retroDesc = okDesc
    ? 'La descripción dice qué es y para qué se hizo. Dentro de seis meses nadie se acuerda de qué era «snap-0a1b2c…».'
    : estado.snapshots.length
      ? `Tus snapshots tienen la descripción: ${estado.snapshots.map((s) => `«${s.descripcion || '(vacía)'}»`).join(', ')}. Se pidió «${x.descSnap}». La descripción no se puede editar: crea otro snapshot con ella.`
      : `Al crear el snapshot escribe en Description: «${x.descSnap}».`;

  return [
    check('volumen', `Un volumen EBS ${pedido} además del raíz`, 4, okVol, retroVol),
    check('adjunto', `Un volumen extra conectado a ${x.instancia}`, 6, okAdj, retroAdj),
    check('snapshot', `Un snapshot del volumen de ${x.volumenTamano} GiB`, 4, okSnap, retroSnap),
    check('descripcion', `El snapshot tiene la descripción «${x.descSnap}»`, 3, okDesc, retroDesc)
  ];
}

/* ============================================================== revisar */

export function revisar(estadoOriginal, datos) {
  const estado = preparar(estadoOriginal);
  const x = datosLab(datos);
  return armar(LAB.tareas(datos), {
    web: revisarWeb(estado, x),
    nacl: revisarNacl(estado, x),
    iam: revisarIam(estado, x),
    rol: revisarRol(estado, x),
    s3: revisarS3(estado, x),
    discos: revisarDiscos(estado, x)
  });
}

/* ================================================================ repaso */

// Dónde repasar cada punto (ver src/repaso.js): 'tarea' vale para todos sus
// checks; 'tarea/check' gana sobre la de la tarea.
export const REPASO = {
  'web/igw': ['s3-vpc/1', 's3-lab-vpc/10'],
  'web/ruta': ['s3-vpc/3', 's3-lab-vpc/11'],
  'web/propia': ['s3-lab-vpc/7', 's3-vpc/3'],
  'web/privada': ['s3-vpc/3', 's3-lab-vpc/7'],
  'web/http': ['s2-lab-seguridad/14', 's1-lab-ec2/8'],
  'web/ssh': 's2-lab-seguridad/14',
  'web/pagina': ['s1-lab-ec2/11', 's3-vpc/3'],
  'web/original': 's1-ec2/3',
  'nacl/asociada': ['s2-lab-seguridad/15', 's2-servicios/3'],
  'nacl/salida': ['s2-servicios/3', 's2-lab-seguridad/15'],
  'iam/sin-admin': 's2-identidades/3',
  'iam/grupo': ['s2-identidades/1', 's2-identidades/3'],
  'iam/miembro': 's2-identidades/1',
  rol: ['s2-identidades/3', 's2-identidades/1'],
  's3/bloqueo': ['s4-lab-almacenamiento/4', 's4-seguridad/1'],
  's3/versionado': ['s4-lab-almacenamiento/5', 's4-seguridad/1'],
  's3/ia-30': ['s4-s3/3', 's4-lab-almacenamiento/7'],
  's3/glacier-180': ['s4-s3/2', 's4-lab-almacenamiento/7'],
  's3/expira': ['s4-s3/3', 's4-seguridad/1'],
  'discos/volumen': ['s4-lab-almacenamiento/9', 's4-discos/2'],
  'discos/adjunto': ['s4-lab-almacenamiento/10', 's4-lab-almacenamiento/12'],
  'discos/snapshot': ['s4-lab-almacenamiento/11', 's4-discos/2'],
  'discos/descripcion': 's4-lab-almacenamiento/11'
};

/* ============================================================= solución */

export function solucion(datos) {
  const x = datosLab(datos);
  const estado = LAB.estadoInicial(datos);
  const vpc = estado.vpcs.find((v) => v.cidr === x.vpcCidr);
  const igw = estado.igws.find((g) => g.nombre === x.igwNombre);
  const publica = estado.subredes.find((s) => s.cidr === x.publicaCidr);
  const nacl = estado.nacls.find((n) => n.nombre === x.nacl);
  const inst = original(estado, x);
  const sg = estado.gruposSeguridad.find((g) => g.nombre === x.sg);

  // web: puerta, tabla propia con su letrero y guardia
  adjuntarIgw(estado, igw.id, vpc.id);
  const tabla = crearTablaRutas(estado, { vpcId: vpc.id, nombre: x.tablaNombre });
  editarRutas(estado, tabla.id, [{ destino: '0.0.0.0/0', objetivo: igw.id }]);
  asociarSubredes(estado, tabla.id, [publica.id]);
  editarReglasSg(estado, sg.id, 'entrada', [
    { protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' },
    { protocolo: 'tcp', desde: 22, hasta: 22, origen: `${x.ipCasa}/32` }
  ]);

  // nacl: la buena en la subred pública y con la salida de las respuestas
  asociarNacl(estado, nacl.id, [publica.id]);
  editarReglasNacl(estado, nacl.id, 'salida', [
    ...nacl.salida,
    { numero: 110, protocolo: 'tcp', desde: 1024, hasta: 65535, cidr: '0.0.0.0/0', accion: 'allow' }
  ]);

  // iam
  quitarPoliticaUsuario(estado, x.sobrino, 'AdministratorAccess');
  crearGrupoIam(estado, { nombre: x.grupo, politicas: x.politicasGrupo });
  agregarUsuariosAGrupo(estado, x.grupo, [x.sobrino]);

  // rol
  crearRol(estado, { nombre: x.rol, politicas: [x.politicaRol], descripcion: 'El servidor lee los expedientes' });
  cambiarRolInstancia(estado, inst.id, x.rol);

  // s3
  editarBloqueoPublico(estado, x.bucket, { aclsNuevas: true, aclsCualquiera: true, politicasNuevas: true, politicasCualquiera: true });
  editarVersionado(estado, x.bucket, true);
  crearReglaCiclo(estado, x.bucket, {
    nombre: 'expedientes-viejos',
    transiciones: [
      { dias: 30, clase: 'STANDARD_IA' },
      { dias: 180, clase: 'GLACIER' }
    ],
    expiracionDias: 1825
  });

  // discos: en la zona de la instancia, conectado y respaldado
  const vol = crearVolumen(estado, { nombre: x.volumenNombre, tipo: x.volumenTipo, tamano: x.volumenTamano, az: inst.az });
  avanzar(estado, reloj.ahora() + 60_000);
  adjuntarVolumen(estado, vol.id, inst.id, '/dev/sdf');
  crearSnapshot(estado, { volumenId: vol.id, descripcion: x.descSnap });

  avanzar(estado, reloj.ahora() + 3600_000);
  return estado;
}
