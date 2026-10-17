// Rúbrica del simulacro 2 · Veterinaria Patitas (diagnosticar y reparar).

import {
  adjuntarIgw,
  agregarUsuariosAGrupo,
  asignarMfa,
  asociarSubredes,
  avanzar,
  cambiarLlaveAcceso,
  cambiarRolInstancia,
  claseS3,
  crearGrupoIam,
  crearReglaCiclo,
  crearRol,
  crearSnapshot,
  editarBloqueoPublico,
  editarReglasSg,
  editarRutas,
  editarVersionado,
  igwDeVpc,
  quitarPoliticaUsuario,
  reloj
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

/** ¿Esta instancia trae el script de la veterinaria? (aunque luego le hayan editado el user data) */
const conScript = (i, x) => i.userDataArranque === x.userData || i.userData === x.userData;

/** La instancia que dejó el sobrino: la primera con su script. */
const original = (estado, x) => estado.instancias.find((i) => conScript(i, x)) ?? null;

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
    checkHttp(estado, inst, x.ipCasa, 'http', 6),
    checkSsh(estado, inst, x.ipCasa, { puntos: 5, exigirCasa: false, texto: 'Nadie del mundo puede intentar SSH (sin SSH desde 0.0.0.0/0)' }),
    check('pagina', `La página de citas abre y dice «${x.textoPagina}»`, 3, p.conTexto, retroPagina)
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

function revisarWeb(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  if (!vpc) {
    const r = `${sinVpc(estado, x.vpcCidr)} Ojo: la VPC ${x.vpcNombre} ya venía hecha; si la borraste, ya no se puede reparar lo que pedía la tarea.`;
    return [
      check('igw', `El Internet Gateway conectado a ${x.vpcNombre}`, 6, false, r),
      check('ruta', `La subred de la instancia es pública (0.0.0.0/0 → Internet Gateway)`, 8, false, r),
      check('privada', `${x.privadaNombre} sigue sin salida a internet`, 3, false, r),
      check('http', 'HTTP (80) desde 0.0.0.0/0', 6, false, r),
      check('ssh', 'Sin SSH desde 0.0.0.0/0', 5, false, r),
      check('pagina', 'La página de citas abre', 3, false, r),
      check('original', `La página abre desde la instancia original ${x.instancia}`, 4, false, r)
    ];
  }
  const inst = instanciaWeb(estado, x, vpc);
  const orig = original(estado, x);
  const publica = estado.subredes.find((s) => s.vpcId === vpc.id && s.cidr === x.publicaCidr) ?? null;
  const privada = estado.subredes.find((s) => s.vpcId === vpc.id && s.cidr === x.privadaCidr) ?? null;
  const subredWeb = (inst && estado.subredes.find((s) => s.id === inst.subredId)) ?? publica;

  const igw = igwDeVpc(estado, vpc.id);
  const checks = [check('igw', `El Internet Gateway conectado a ${x.vpcNombre}`, 6, igw, retroIgw(estado, vpc))];

  const esPub = subredWeb && esSubredPublica(estado, subredWeb.id);
  checks.push(
    check(
      'ruta',
      'La subred de la instancia es pública (0.0.0.0/0 → Internet Gateway)',
      8,
      esPub,
      esPub
        ? `La tabla de ${fmtSubred(subredWeb)} manda 0.0.0.0/0 a ${igw.id}. Un gateway conectado no basta: cada subred necesita su «letrero» que mande el tráfico de internet a esa puerta.`
        : subredWeb
          ? explicarRuta(estado, subredWeb)
          : `Ya no existe la subred ${x.publicaNombre} (${x.publicaCidr}).`
    )
  );

  const privOk = privada && esPrivadaSinSalida(estado, privada.id) && esPub;
  let retroPriv;
  if (privOk) retroPriv = `${x.privadaNombre} sigue usando una tabla sin 0.0.0.0/0, mientras la pública sí sale. Por eso conviene una tabla de rutas propia para las subredes públicas: si pones la ruta en la tabla principal, todas las subredes que la usan se vuelven públicas.`;
  else if (!privada) retroPriv = `Ya no existe la subred ${x.privadaNombre} (${x.privadaCidr}): se pedía conservarla, sin salida a internet, para la futura base de datos.`;
  else if (!esPrivadaSinSalida(estado, privada.id)) {
    retroPriv = `Tu subred ${fmtSubred(privada)} ahora tiene ruta 0.0.0.0/0 en su tabla, así que la base de datos quedaría expuesta. Seguramente pusiste la ruta en la tabla principal: quítala de ahí, ponla en ${x.tablaNombre} y asocia esa tabla solo a ${x.publicaNombre}.`;
  } else retroPriv = `${x.privadaNombre} sigue privada, pero este punto se gana cuando, además, la subred pública ya sale a internet: el chiste es separar una de otra con tablas distintas.`;
  checks.push(check('privada', `${x.privadaNombre} sigue sin salida a internet (y la pública sí sale)`, 3, privOk, retroPriv));

  const porQue = inst ? null : sinInstancia(estado, vpc, x.vpcCidr);
  const deServidor = checksServidor(estado, inst, x).map((c) => (porQue ? { ...c, retro: porQue } : c));
  checks.push(...deServidor);

  const vivaOrig = orig && orig.estado !== 'terminated' && orig.estado !== 'shutting-down';
  const okOrig = vivaOrig && paginaDe(estado, orig, x).conTexto;
  let retroOrig;
  if (okOrig) retroOrig = `La página sale de ${fmtInst(orig)}, la misma instancia de siempre. Relanzar habría escondido el problema y cambiado la IP que ya conocían los clientes.`;
  else if (!vivaOrig) retroOrig = `Tu instancia original ${orig ? fmtInst(orig) : x.instancia} ya no existe (terminated). Se pedía repararla sin relanzar: en la vida real, terminar un servidor puede perder datos que no estaban en otro lado.`;
  else retroOrig = `La instancia original ${fmtInst(orig)} todavía no muestra la página desde internet. ${explicarPagina(estado, orig, paginaDe(estado, orig, x).r)}`;
  checks.push(check('original', `La página abre desde la instancia original ${x.instancia}`, 4, okOrig, retroOrig));
  return checks;
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
  const grupo = check('grupo', `El grupo «${x.grupo}» con ${x.politicasGrupo.join(' y ')} y nada más amplio`, 6, okG, retroG);

  const okM = estaEn(u, x.grupo);
  const miembro = check(
    'miembro',
    `${x.sobrino} está en el grupo «${x.grupo}»`,
    5,
    okM,
    okM ? `${x.sobrino} hereda los permisos del grupo. Así sus permisos se revisan en un solo lugar.` : !u ? sinU : `${x.sobrino} está en: ${lista(u.grupos, 'ningún grupo')}. Agrégalo a ${x.grupo} (User groups → ${x.grupo} → Add users).`
  );

  const okMfa = u && u.mfa.length > 0;
  const mfa = check(
    'mfa',
    `${x.sobrino} tiene un dispositivo MFA`,
    4,
    okMfa,
    okMfa
      ? `${x.sobrino} tiene MFA (${u.mfa[0].nombre}). Si alguien roba su contraseña, todavía le falta el código del celular para entrar.`
      : !u
        ? sinU
        : `${x.sobrino} no tiene MFA. Asígnalo en IAM → Users → ${x.sobrino} → Security credentials → Assign MFA device (Authenticator app).`
  );
  return [directo, grupo, miembro, mfa];
}

/* ================================================================== rol */

function revisarRol(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  const orig = original(estado, x);
  const inst = (orig && orig.estado !== 'terminated' && orig.estado !== 'shutting-down' ? orig : null) ?? instanciaWeb(estado, x, vpc);
  const roles = estado.iam.roles;
  const deEc2 = roles.filter((r) => r.servicio === 'ec2.amazonaws.com');
  const justo = (r) => r.politicas.includes(x.politicaRol) && !deEscritura(r.politicas).length && !amplias(r.politicas).length;
  const asignado = inst?.rolIam ? roles.find((r) => r.nombre === inst.rolIam) : null;
  const elegido = (asignado && asignado.servicio === 'ec2.amazonaws.com' ? asignado : null) ?? deEc2.find(justo) ?? deEc2[0] ?? null;

  const okRol = elegido && justo(elegido);
  let retroRol;
  if (okRol) retroRol = `El rol ${elegido.nombre} confía en EC2 y solo deja leer S3. Es la forma correcta de dar permisos a un servidor: credenciales temporales y mínimo privilegio.`;
  else if (!elegido) retroRol = roles.length ? `Tus roles (${roles.map((r) => r.nombre).join(', ')}) no son para EC2. Crea uno en IAM → Roles → Create role → AWS service → EC2.` : 'No hay ningún rol. Créalo en IAM → Roles → Create role → AWS service → EC2, con la política AmazonS3ReadOnlyAccess.';
  else if (deEscritura(elegido.politicas).length || amplias(elegido.politicas).length) {
    retroRol = `Tu rol ${elegido.nombre} tiene ${lista([...new Set([...deEscritura(elegido.politicas), ...amplias(elegido.politicas)])])}: más de lo que el servidor necesita. Si alguien toma el servidor, se lleva esos permisos. Déjale solo ${x.politicaRol}.`;
  } else retroRol = `Tu rol ${elegido.nombre} tiene: ${lista(elegido.politicas)}. Le falta ${x.politicaRol} (Permissions → Add permissions).`;
  const rol = check('rol', `Un rol para EC2 con ${x.politicaRol} y nada más`, 6, okRol, retroRol);

  const okAsig = inst && asignado && asignado.politicas.some((p) => LEEN_S3.includes(p));
  let retroAsig;
  if (okAsig) retroAsig = `${fmtInst(inst)} usa el rol ${asignado.nombre}: el código del servidor obtiene credenciales temporales solas, sin llaves escritas en ningún archivo.`;
  else if (!inst) retroAsig = `No encontré la instancia ${x.instancia} viva en tu VPC para revisarle el rol.`;
  else if (!inst.rolIam) retroAsig = `La instancia ${fmtInst(inst)} no tiene rol (IAM role: vacío). Asígnalo en EC2 → Instances → Actions → Security → Modify IAM role; no hace falta relanzarla.`;
  else retroAsig = `La instancia ${fmtInst(inst)} usa el rol ${inst.rolIam}, que no deja leer S3 (${lista(asignado?.politicas ?? [])}). Asígnale el rol con ${x.politicaRol}.`;
  const asig = check('asignado', `El rol está asignado a la instancia ${x.instancia}`, 8, okAsig, retroAsig);

  const u = usuario(estado, x.sobrino);
  const activas = (u?.llavesAcceso ?? []).filter((k) => k.estado === 'Active');
  const okLlave = !activas.length;
  const llave = check(
    'llave',
    `La llave de acceso de ${x.sobrino} ya no está activa`,
    6,
    okLlave,
    okLlave
      ? 'La llave del sobrino ya no sirve. Una llave de acceso es una contraseña que no caduca sola: si no se usa, se desactiva o se borra.'
      : `${x.sobrino} todavía tiene activa la llave ${activas[0].id}. Desactívala o bórrala en IAM → Users → ${x.sobrino} → Security credentials → Access keys → Actions.`
  );
  return [rol, asig, llave];
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
        'A los 180 días pasan a Glacier Flexible Retrieval: archivo barato que tarda horas en devolverlos, suficiente para un expediente viejo.',
        otraClase180 ? `A los 180 días los mandas a ${claseS3(otraClase180.clase)?.nombre}, pero se pidió Glacier Flexible Retrieval.` : 'Falta la transición a Glacier Flexible Retrieval a los 180 días.'
      )
    ),
    check('expira', 'Regla activa para todo el bucket: expiran a los 1825 días (5 años)', 2, exp, retroCiclo(exp, 'A los 1825 días S3 los borra solo: guardar datos para siempre cuesta, y la clínica decidió conservarlos 5 años.', 'Falta la expiración («Expire current versions of objects») a los 1825 días.'))
  ];
}

/* ============================================================= respaldo */

function revisarRespaldo(estado, x) {
  const web = estado.instancias.filter((i) => conScript(i, x));
  const raices = estado.volumenes.filter((v) => v.raiz && web.some((i) => i.id === v.instanciaId));
  const ids = new Set(raices.map((v) => v.id));
  const buenos = estado.snapshots.filter((s) => ids.has(s.volumenId));
  const okSnap = buenos.length > 0;
  let retroSnap;
  if (okSnap) retroSnap = `El snapshot ${buenos[0].id} es del disco raíz de ${x.instancia} (${buenos[0].volumenId}). Antes de mover algo importante, primero el respaldo: con él puedes crear un disco idéntico.`;
  else if (estado.snapshots.length) retroSnap = `Tu snapshot ${estado.snapshots[0].id} es del volumen ${estado.snapshots[0].volumenId}, que no es el disco raíz de ${x.instancia}${raices[0] ? ` (ese es ${raices[0].id})` : ''}. Mira la pestaña Storage de la instancia para ver cuál es.`;
  else retroSnap = `No hay ningún snapshot. ${raices[0] ? `El disco raíz de ${x.instancia} es ${raices[0].id}: ` : ''}selecciónalo en EC2 → Volumes → Actions → Create snapshot.`;

  const limpio = (t) => normal(t).replace(/[^a-z0-9]+/g, ' ').trim();
  const conDesc = estado.snapshots.filter((s) => limpio(s.descripcion) === limpio(x.descSnap));
  const okDesc = conDesc.length > 0;
  const retroDesc = okDesc
    ? 'La descripción dice qué es y por qué se hizo. Dentro de seis meses nadie se acuerda de qué era «snap-0a1b2c…».'
    : estado.snapshots.length
      ? `Tus snapshots tienen la descripción: ${estado.snapshots.map((s) => `«${s.descripcion || '(vacía)'}»`).join(', ')}. Se pidió «${x.descSnap}». La descripción no se puede editar: crea otro snapshot con ella.`
      : `Al crear el snapshot escribe en Description: «${x.descSnap}».`;
  return [check('snapshot', `Un snapshot del volumen raíz de ${x.instancia}`, 6, okSnap, retroSnap), check('descripcion', `El snapshot tiene la descripción «${x.descSnap}»`, 4, okDesc, retroDesc)];
}

/* ============================================================== revisar */

export function revisar(estadoOriginal, datos) {
  const estado = preparar(estadoOriginal);
  const x = datosLab(datos);
  return armar(LAB.tareas(datos), {
    web: revisarWeb(estado, x),
    iam: revisarIam(estado, x),
    rol: revisarRol(estado, x),
    s3: revisarS3(estado, x),
    respaldo: revisarRespaldo(estado, x)
  });
}

/* ============================================================= solución */

export function solucion(datos) {
  const x = datosLab(datos);
  const estado = LAB.estadoInicial(datos);
  const vpc = estado.vpcs.find((v) => v.cidr === x.vpcCidr);
  const igw = estado.igws.find((g) => g.nombre === x.igwNombre);
  const tabla = estado.tablasRutas.find((t) => t.nombre === x.tablaNombre);
  const publica = estado.subredes.find((s) => s.cidr === x.publicaCidr);
  const inst = original(estado, x);
  const sg = estado.gruposSeguridad.find((g) => g.nombre === x.sg);

  // web
  adjuntarIgw(estado, igw.id, vpc.id);
  editarRutas(estado, tabla.id, [{ destino: '0.0.0.0/0', objetivo: igw.id }]);
  asociarSubredes(estado, tabla.id, [publica.id]);
  editarReglasSg(estado, sg.id, 'entrada', [
    { protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' },
    { protocolo: 'tcp', desde: 22, hasta: 22, origen: `${x.ipCasa}/32` }
  ]);

  // iam
  quitarPoliticaUsuario(estado, x.sobrino, 'AdministratorAccess');
  crearGrupoIam(estado, { nombre: x.grupo, politicas: x.politicasGrupo });
  agregarUsuariosAGrupo(estado, x.grupo, [x.sobrino]);
  asignarMfa(estado, x.sobrino, { nombreDispositivo: x.mfa });

  // rol
  crearRol(estado, { nombre: x.rol, politicas: [x.politicaRol], descripcion: 'El servidor lee los expedientes' });
  cambiarRolInstancia(estado, inst.id, x.rol);
  const llave = usuario(estado, x.sobrino).llavesAcceso[0];
  cambiarLlaveAcceso(estado, x.sobrino, llave.id, false);

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

  // respaldo
  const raiz = estado.volumenes.find((v) => v.instanciaId === inst.id && v.raiz);
  crearSnapshot(estado, { volumenId: raiz.id, descripcion: x.descSnap });

  avanzar(estado, reloj.ahora() + 3600_000);
  return estado;
}
