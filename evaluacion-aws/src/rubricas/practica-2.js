// Rúbrica de la práctica integradora 2 (sesión 10) · La clínica guarda expedientes.
//
// Revisa la cuenta como la dejó el alumno, con lo que importa del CLF-C02 en
// seguridad: mínimo privilegio en IAM (grupos, sin cuentas compartidas, roles
// en lugar de llaves de acceso), MFA, una llave propia de KMS con rotación y
// permisos separados (administrar ≠ usar), S3 cifrado con KMS, privado, con
// versionado y retención, una base RDS cifrada, privada y en subredes
// privadas, el secreto de la base en Secrets Manager con la llave propia, un
// disco EBS cifrado, SSH cerrado y un trail de CloudTrail con validación.
//
// Elige «el recurso del alumno» con tolerancia (por lo que hace, no solo por
// cómo se llama) y la retro dice qué nombre se esperaba. Solo servidor: el
// navegador nunca recibe este archivo.

import {
  adjuntarVolumen,
  asignarMfa,
  asignarMfaRaiz,
  avanzar,
  cambiarLlaveAcceso,
  cambiarRolInstancia,
  claseS3,
  clusterRdsDe,
  conexionBase,
  configurarRotacionSecreto,
  crearBaseRds,
  crearFuncion,
  crearGrupoIam,
  crearGrupoSeguridad,
  crearGrupoSubredesRds,
  crearLlaveKms,
  crearReglaCiclo,
  crearRol,
  crearSecreto,
  crearTrail,
  crearUsuario,
  crearVolumen,
  editarBloqueoPublico,
  editarCifrado,
  editarReglasSg,
  editarVersionado,
  eliminarUsuario,
  grupoSubredesRdsDe,
  instanciaRdsDe,
  llaveKmsDe,
  politicaIam,
  reloj,
  rotacionLlaveKms,
  subredDe,
  trailDe
} from '../../public/consola/modelo.js';
import { esSubredPublica } from '../../public/consola/red.js';
import { LAB, datosLab } from '../../public/labs/practica-2.js';
import { armar, check, checkBloqueo, checkSsh, checkVersionado, describirCiclo, describirEntrada, elegirVpc, estaEn, fmtInst, grupoIam, lista, mejorPor, preparar, usuario, vivas } from './comun.js';

/**
 * Dónde repasar cada punto en la Ruta AWS (ver src/repaso.js). La clave
 * 'tarea/check' gana sobre la de la tarea.
 */
export const REPASO = {
  personas: ['s2-identidades/1', 's2-politicas/1'],
  'personas/grupo': ['s2-politicas/1', 's2-identidades/1'],
  'personas/paola': ['s2-identidades/1', 's2-identidades/3'],
  'personas/recepcion': ['s2-identidades/1', 's2-identidades/3'],

  mfa: 's2-identidades/3',
  'mfa/raiz': ['s2-identidades/2', 's2-identidades/3'],
  'mfa/usuarios': ['s2-identidades/3', 's2-repaso/1'],

  llave: ['s2-servicios/1', 's2-lab-seguridad/7'],
  'llave/existe': ['s2-lab-seguridad/7', 's2-servicios/1'],
  'llave/rotacion': ['s2-servicios/1', 's2-lab-seguridad/7'],
  'llave/permisos': ['s2-lab-seguridad/7', 's2-politicas/1'],

  expedientes: ['s4-seguridad/1', 's4-lab-almacenamiento/5'],
  'expedientes/bloqueo': ['s4-seguridad/1', 's4-lab-almacenamiento/4'],
  'expedientes/cifrado': ['s4-lab-almacenamiento/5', 's2-servicios/1', 's2-responsabilidad/1'],
  'expedientes/versionado': ['s4-seguridad/1', 's4-lab-almacenamiento/5'],
  'expedientes/ciclo': ['s4-s3/3', 's4-s3/2', 's4-lab-almacenamiento/8'],

  base: ['s5-relacionales/2', 's3-vpc/3'],
  'base/existe': ['s5-relacionales/2', 's5-relacionales/3'],
  'base/cifrada': ['s2-servicios/1', 's5-relacionales/2'],
  'base/privada': ['s3-vpc/3', 's5-relacionales/2'],
  'base/subredes': ['s3-vpc/3', 's3-lab-vpc/9'],
  'base/acceso': ['s2-lab-seguridad/14', 's2-servicios/3'],
  'base/proteccion': ['s5-disponibilidad/1', 's2-responsabilidad/1'],

  secreto: ['s2-lab-seguridad/5', 's2-lab-seguridad/6'],
  'secreto/existe': ['s2-lab-seguridad/6', 's2-servicios/1'],
  'secreto/llave': ['s2-lab-seguridad/7', 's2-servicios/1'],

  servidor: ['s2-identidades/1', 's2-identidades/3'],
  'servidor/rol': ['s2-identidades/1', 's2-politicas/1'],
  'servidor/llaves': ['s2-identidades/3', 's2-identidades/1'],
  'servidor/disco': ['s4-discos/2', 's2-servicios/1'],
  'servidor/ssh': ['s2-lab-seguridad/14', 's2-servicios/3'],

  auditoria: ['s6-monitorear/1', 's2-lab-seguridad/12'],
  'auditoria/trail': ['s6-monitorear/1', 's2-lab-seguridad/12'],
  'auditoria/validacion': ['s2-servicios/2', 's6-monitorear/1'],
  'auditoria/bucket': ['s4-seguridad/1', 's6-monitorear/1'],

  rotacion: ['s2-lab-seguridad/9', 's2-servicios/1'],
  'rotacion/activa': ['s2-lab-seguridad/9', 's2-servicios/1'],
  'rotacion/cada': 's2-lab-seguridad/9'
};

const DIA = 86_400_000;
const igual = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
const arnDe = (estado, tipo, nombre) => `arn:aws:iam::${estado.cuenta?.id ?? '123456789012'}:${tipo}/${nombre}`;
const llavesActivas = (u) => (u?.llavesAcceso ?? []).filter((k) => k.estado === 'Active');

/* ================================================================ IAM */

// Lo que no puede tener el grupo de la auditora: escribir, o leer el contenido de los buckets.
const LEEN_DATOS = ['ReadOnlyAccess', 'AmazonS3ReadOnlyAccess'];
const escribe = (p) => !['lectura', 'propio'].includes(politicaIam(p)?.acceso);

function checksPersonas(estado, x) {
  const tGrupo = `El grupo «${x.grupoAuditoria}» tiene ${x.politicaAuditoria} y nada que cambie cosas o lea los expedientes`;
  const tPaola = `La usuaria «${x.auditora}» entra a la consola y recibe sus permisos solo por el grupo`;
  const tRecep = `El usuario compartido «${x.compartido}» ya no puede hacer nada`;

  // grupo
  const g = grupoIam(estado, x.grupoAuditoria);
  let okGrupo = false;
  let rGrupo;
  if (!g) {
    rGrupo = `No existe el grupo «${x.grupoAuditoria}». Créalo en IAM → User groups → Create group y adjúntale ${x.politicaAuditoria}.`;
  } else {
    const malas = g.politicas.filter((p) => escribe(p));
    const datos = g.politicas.filter((p) => LEEN_DATOS.includes(p));
    const tiene = g.politicas.includes(x.politicaAuditoria);
    okGrupo = tiene && !malas.length && !datos.length;
    if (okGrupo) {
      rGrupo = `El grupo ${g.nombre} tiene ${lista(g.politicas)}: Paola puede ver el historial de CloudTrail${g.politicas.includes('SecurityAudit') ? ' y la configuración de seguridad' : ''}, pero no cambiar nada ni abrir un solo PDF. Eso es mínimo privilegio: solo lo que su trabajo necesita.`;
    } else if (malas.length) {
      rGrupo = `El grupo ${g.nombre} tiene ${malas.join(', ')}, que deja ${malas.some((p) => politicaIam(p)?.servicio === '*') ? 'cambiar cualquier cosa de la cuenta' : 'cambiar recursos'}. Una auditora revisa, no modifica: quítala en el grupo → Permissions → Remove.`;
    } else if (datos.length) {
      rGrupo = `El grupo ${g.nombre} tiene ${datos.join(', ')}. Parece inofensiva por ser «de solo lectura», pero deja descargar los objetos de S3: Paola podría abrir los expedientes de los pacientes, y eso no lo necesita para auditar. Quítala y deja ${x.politicaAuditoria}${g.politicas.includes('SecurityAudit') ? ' y SecurityAudit' : ''}.`;
    } else {
      rGrupo = `El grupo ${g.nombre} tiene ${lista(g.politicas)}, pero le falta ${x.politicaAuditoria}: sin ella Paola no puede revisar el historial de CloudTrail, que es justo su trabajo. Agrégala en el grupo → Permissions → Add permissions.`;
    }
  }

  // paola
  const p = usuario(estado, x.auditora);
  let okPaola = false;
  let rPaola;
  if (!p) rPaola = `No existe la usuaria «${x.auditora}». Créala en IAM → Users → Create user, con acceso a la consola, y agrégala al grupo ${x.grupoAuditoria}.`;
  else {
    const enGrupo = estaEn(p, x.grupoAuditoria);
    // IAMUserChangePassword (acceso «propio») la pone IAM sola cuando se exige cambiar la contraseña al primer inicio: no cuenta.
    const directas = p.politicas.filter((n) => politicaIam(n)?.acceso !== 'propio');
    okPaola = p.consola && enGrupo && !directas.length;
    if (okPaola) rPaola = `${p.nombre} entra a la consola con su propio usuario y hereda los permisos del grupo ${x.grupoAuditoria}. Si mañana llega otro auditor, basta con meterlo al grupo.`;
    else {
      const falta = [];
      if (!p.consola) falta.push('no tiene contraseña de consola (en Security credentials → Console sign-in → Enable console access)');
      if (!enGrupo) falta.push(`no está en el grupo ${x.grupoAuditoria} (pestaña Groups → Add user to groups)`);
      if (directas.length) falta.push(`tiene políticas puestas directo (${directas.join(', ')}): quítalas, sus permisos deben llegarle por el grupo`);
      rPaola = `La usuaria ${p.nombre} ${falta.join('; ')}.`;
    }
  }

  // recepcion
  const r = usuario(estado, x.compartido);
  let okRecep;
  let rRecep;
  if (!r) {
    okRecep = true;
    rRecep = `Ya no existe «${x.compartido}». Una cuenta compartida por cuatro personas no deja saber quién hizo qué (CloudTrail solo vería «recepcion») y, con AdministratorAccess, cualquiera de ellas podía borrar la clínica entera.`;
  } else {
    const pol = [...r.politicas];
    const activas = llavesActivas(r);
    okRecep = !pol.length && !r.grupos.length && !r.consola && !activas.length;
    if (okRecep) rRecep = `«${x.compartido}» sigue existiendo, pero sin permisos, sin contraseña y sin llaves: ya no puede hacer nada. Lo más limpio es borrarlo (Users → Delete).`;
    else {
      const queda = [];
      if (pol.length) queda.push(`políticas ${pol.join(', ')}`);
      if (r.grupos.length) queda.push(`los grupos ${r.grupos.join(', ')}`);
      if (r.consola) queda.push('contraseña de consola');
      if (activas.length) queda.push(`la llave de acceso activa ${activas.map((k) => k.id).join(', ')}`);
      rRecep = `«${x.compartido}» todavía tiene ${queda.join(', ')}. Es una cuenta compartida: nadie sabe quién de las cuatro recepcionistas hizo cada cosa${pol.includes('AdministratorAccess') ? ', y con AdministratorAccess cualquiera puede borrar toda la cuenta' : ''}. Bórrala en IAM → Users → ${x.compartido} → Delete.`;
    }
  }

  return [check('grupo', tGrupo, 5, okGrupo, rGrupo), check('paola', tPaola, 4, okPaola, rPaola), check('recepcion', tRecep, 6, okRecep, rRecep)];
}

function checksMfa(estado, x) {
  const tRaiz = 'La cuenta raíz tiene MFA';
  const tUsuarios = `${x.admin}, ${x.auditora} y todo usuario con consola tienen MFA`;
  const okRaiz = Boolean(estado.iam.raizMfa);
  const rRaiz = okRaiz
    ? 'La raíz ya pide un segundo factor. Es la cuenta que puede todo (hasta cerrar la cuenta de AWS) y sus permisos no se pueden limitar: es lo primero que se protege.'
    : 'La cuenta raíz no tiene MFA: con solo robar su contraseña, alguien sería dueño de todo, expedientes incluidos. Actívalo en el IAM Dashboard → Security recommendations → «Add MFA for root user».';

  const necesarios = [x.admin, x.auditora];
  const faltan = [];
  for (const n of necesarios) {
    const u = usuario(estado, n);
    if (!u) faltan.push(`${n} (no existe)`);
    else if (!u.mfa.length) faltan.push(n);
  }
  const otros = estado.iam.usuarios.filter((u) => u.consola && !u.mfa.length && !necesarios.some((n) => igual(n, u.nombre)));
  faltan.push(...otros.map((u) => `${u.nombre} (entra a la consola)`));
  const okUsuarios = faltan.length === 0;
  const rUsuarios = okUsuarios
    ? `Todos los que entran a la consola tienen MFA. Aunque alguien adivine o robe una contraseña, sin el código del celular no entra.`
    : `Falta MFA en: ${faltan.join(', ')}. Se asigna en IAM → Users → el usuario → Security credentials → Assign MFA device.${otros.some((u) => igual(u.nombre, x.compartido)) ? ` (Si borras a ${x.compartido}, ya no hace falta para él.)` : ''}`;
  return [check('raiz', tRaiz, 5, okRaiz, rRaiz), check('usuarios', tUsuarios, 5, okUsuarios, rUsuarios)];
}

/* ================================================================ KMS */

const propias = (estado) => (estado.kms?.llaves ?? []).filter((k) => !k.administradaPorAws && k.estado !== 'PendingDeletion');
const simetrica = (k) => k.spec === 'SYMMETRIC_DEFAULT' && k.uso === 'ENCRYPT_DECRYPT';

/** La llave del alumno: la del alias exacto o, si no, la llave propia que más se parece. */
function elegirLlave(estado, x) {
  const exacta = llaveKmsDe(estado, x.alias);
  if (exacta && !exacta.administradaPorAws && exacta.estado !== 'PendingDeletion') return exacta;
  const cands = propias(estado);
  const peso = (k) => (simetrica(k) ? 4 : 0) + (k.estado === 'Enabled' ? 2 : 0) + (k.rotacion?.activa ? 1 : 0);
  return cands.sort((a, b) => peso(b) - peso(a))[0] ?? null;
}

const nombreLlave = (k) => (k.alias ? `alias/${k.alias}` : k.id);

/** El rol que el servidor usa (o el que se pidió), para revisar los permisos de la llave. */
function rolDelServidor(estado, x, app) {
  const puesto = app?.rolIam ? estado.iam.roles.find((r) => r.nombre === app.rolIam) : null;
  return puesto ?? estado.iam.roles.find((r) => igual(r.nombre, x.rol)) ?? null;
}

function checksLlave(estado, x, k, app) {
  const tExiste = `Una llave propia simétrica con el alias «${x.alias}», Enabled`;
  const tRot = 'Rotación automática activada';
  const tPerm = `${x.admin} la administra, el rol del servidor la usa y ${x.auditora} no la usa`;
  if (!k) {
    const pend = (estado.kms?.llaves ?? []).find((l) => !l.administradaPorAws && l.estado === 'PendingDeletion');
    const r = pend
      ? `Tu llave ${nombreLlave(pend)} está programada para borrarse (Pending deletion): nadie la puede usar. Cancélala con Key actions → Cancel key deletion y vuelve a habilitarla, o crea otra.`
      : `No hay ninguna llave propia (customer managed) en KMS. Las aws/… las crea AWS y no puedes decidir quién las usa. Crea la tuya en KMS → Customer managed keys → Create key, con el alias ${x.alias}.`;
    return [check('existe', tExiste, 3, false, r), check('rotacion', tRot, 3, false, r), check('permisos', tPerm, 4, false, r)];
  }
  const exacta = (k.aliases ?? []).includes(x.alias);
  const okExiste = exacta && simetrica(k) && k.estado === 'Enabled';
  let rExiste;
  if (okExiste) rExiste = `Tu llave alias/${x.alias} es simétrica y está habilitada. Al ser tuya (customer managed), tú decides quién la administra y quién la usa, y cada uso queda en CloudTrail.`;
  else if (!exacta) rExiste = `Tu llave se llama ${nombreLlave(k)}, pero se pidió el alias «${x.alias}». Puedes agregarle ese alias en la llave → pestaña Aliases → Create alias (los demás puntos se revisaron en esta llave).`;
  else if (!simetrica(k)) rExiste = `Tu llave es ${k.spec} para ${k.uso}: se pidió simétrica para cifrar y descifrar (Symmetric → Encrypt and decrypt), que es la que usan S3, RDS, EBS y Secrets Manager. El tipo no se cambia: crea otra.`;
  else rExiste = `Tu llave ${nombreLlave(k)} está ${k.estado}: así nadie puede cifrar ni descifrar con ella. Habilítala con Key actions → Enable.`;

  const okRot = Boolean(k.rotacion?.activa);
  const rRot = okRot
    ? `La llave rota sola cada ${k.rotacion.dias} días: AWS crea material criptográfico nuevo y conserva el viejo para descifrar lo que ya estaba cifrado. No tienes que volver a cifrar nada.`
    : `La rotación automática de ${nombreLlave(k)} está apagada. Actívala en la llave → pestaña Key rotation → Edit → Enable (365 días por omisión): si una versión de la llave se compromete, lo nuevo ya no depende de ella.`;

  const admins = k.administradores ?? [];
  const usuarios = k.usuarios ?? [];
  const rol = rolDelServidor(estado, x, app);
  const okAdmin = admins.includes(arnDe(estado, 'user', x.admin));
  const okRol = Boolean(rol && usuarios.includes(arnDe(estado, 'role', rol.nombre)));
  const paolaUsa = usuarios.includes(arnDe(estado, 'user', x.auditora)) || usuarios.includes(arnDe(estado, 'user', x.compartido));
  const okPerm = okAdmin && okRol && !paolaUsa;
  let rPerm;
  if (okPerm) rPerm = `${x.admin} la administra (habilitar, rotar, programar el borrado) y el rol ${rol.nombre} la usa para cifrar y descifrar. Paola no la usa: puede auditar sin poder leer los datos. Separar «quién administra» de «quién usa» es mínimo privilegio aplicado a las llaves.`;
  else {
    const falta = [];
    if (!okAdmin) falta.push(`${x.admin} no es Key administrator`);
    if (!rol) falta.push(`todavía no existe el rol del servidor (${x.rol}, tarea 7) para ponerlo como Key user`);
    else if (!okRol) falta.push(`el rol ${rol.nombre} no es Key user (sin eso la app no puede descifrar)`);
    if (paolaUsa) falta.push(`${usuarios.includes(arnDe(estado, 'user', x.auditora)) ? x.auditora : x.compartido} es Key user y no debe poder descifrar expedientes`);
    rPerm = `En la política de la llave: ${falta.join('; ')}. Se cambia en la llave → pestaña Key policy → Key administrators / Key users → Add o Remove.`;
  }
  return [check('existe', tExiste, 3, okExiste, rExiste), check('rotacion', tRot, 3, okRot, rRot), check('permisos', tPerm, 4, okPerm, rPerm)];
}

/* ================================================================= S3 */

const GLACIER = ['GLACIER_IR', 'GLACIER', 'DEEP_ARCHIVE'];
/** ¿La regla aplica a los expedientes? (todo el bucket o el prefijo expedientes/). */
const cubreExpedientes = (r) => !r.prefijo || 'expedientes/'.startsWith(r.prefijo) || r.prefijo.replace(/\/$/, '') === 'expedientes';

function checksExpedientes(estado, x, kmsLlave) {
  const b = estado.buckets.find((y) => y.nombre === x.bucket) ?? null;
  const eleccion = { bucket: b, exacto: Boolean(b) };
  const tCifrado = 'Cifrado por omisión con KMS (SSE-KMS)';
  const tCiclo = `Ciclo de vida: a Glacier a los ${x.diasGlacier} días y sin borrar antes de 5 años`;
  if (!b) {
    const r = `El bucket ${x.bucket} ya no existe: era el de los expedientes y no se debía borrar. Un bucket borrado no se recupera; créalo de nuevo con el mismo nombre y configúralo.`;
    return [check('bloqueo', 'El bucket tiene bloqueado todo el acceso público (Block all public access)', 4, false, r), check('cifrado', tCifrado, 4, false, r), check('versionado', 'El bucket tiene el versionado activado (Bucket Versioning: Enabled)', 3, false, r), check('ciclo', tCiclo, 4, false, r)];
  }

  const okCifrado = ['SSE-KMS', 'DSSE-KMS'].includes(b.cifrado?.tipo);
  const rCifrado = okCifrado
    ? `${b.nombre} cifra cada objeto nuevo con ${b.cifrado.tipo}: la llave vive en KMS, puedes quitarle el permiso a quien no deba descifrar y cada uso queda en CloudTrail.${b.cifrado.tipo === 'SSE-KMS' && b.cifrado.bucketKey ? ' Con Bucket Key, además, pagas muchas menos llamadas a KMS.' : ''}${kmsLlave && b.cifrado.llaveKms === kmsLlave.id ? ` Además usa tu llave ${nombreLlave(kmsLlave)}: tú decides quién puede descifrar los expedientes.` : kmsLlave ? ` Usa la llave aws/s3, que administra AWS; lo ideal es elegir tu llave ${nombreLlave(kmsLlave)} en Default encryption → «Choose from your AWS KMS keys».` : ''}`
    : `${b.nombre} usa ${b.cifrado?.tipo ?? 'SSE-S3'}: los datos sí están cifrados, pero con llaves que S3 maneja por dentro y que tú no controlas ni ves usarse. Para datos de salud se pide KMS: Properties → Default encryption → Edit → SSE-KMS. Recuerda: cifrar tus datos es TU parte de la responsabilidad compartida.`;

  const reglas = (b.ciclo ?? []).filter((r) => r.estado === 'Enabled' && cubreExpedientes(r));
  const buena = reglas.find((r) => r.transiciones.some((t) => GLACIER.includes(t.clase) && t.dias === x.diasGlacier));
  const borranAntes = reglas.filter((r) => r.expiracionDias !== null && r.expiracionDias < x.diasRetencion);
  const okCiclo = Boolean(buena) && !borranAntes.length;
  let rCiclo;
  if (okCiclo) {
    const t = buena.transiciones.find((y) => GLACIER.includes(y.clase) && y.dias === x.diasGlacier);
    rCiclo = `La regla «${buena.nombre}» pasa los expedientes a ${claseS3(t.clase).nombre} el día ${x.diasGlacier} y ninguna regla los borra antes de 5 años. Guardarlos cuesta mucho menos y siguen ahí para la auditoría.${t.clase === 'DEEP_ARCHIVE' ? ' Ojo: de Deep Archive un archivo tarda hasta 12 horas en regresar.' : ''}`;
  } else if (borranAntes.length) {
    const r = borranAntes[0];
    rCiclo = `La regla «${r.nombre}» borra (Expiration) los objetos el día ${r.expiracionDias}, antes de los ${x.diasRetencion} días (5 años) que pide la NOM-004. Borrar un expediente antes de tiempo es un incumplimiento: quita la expiración o súbela a ${x.diasRetencion} días o más (Management → la regla → Edit).`;
  } else {
    const desactivadas = (b.ciclo ?? []).filter((r) => r.estado !== 'Enabled');
    const prefijo = (b.ciclo ?? []).filter((r) => r.estado === 'Enabled' && !cubreExpedientes(r));
    let extra = '';
    if (desactivadas.length) extra = ` La regla «${desactivadas[0].nombre}» está Disabled.`;
    else if (prefijo.length) extra = ` La regla «${prefijo[0].nombre}» solo aplica al prefijo ${prefijo[0].prefijo}, donde no están los expedientes.`;
    rCiclo = `Tu bucket ${describirCiclo(b)}.${extra} Se pidió una regla activa para todos los objetos que los pase a Glacier (Instant Retrieval, Flexible Retrieval o Deep Archive) el día ${x.diasGlacier}. Créala en Management → Create lifecycle rule.`;
  }

  return [checkBloqueo(eleccion, { puntos: 4 }), check('cifrado', tCifrado, 4, okCifrado, rCifrado), checkVersionado(eleccion, { puntos: 3 }), check('ciclo', tCiclo, 4, okCiclo, rCiclo)];
}

/* ================================================================ RDS */

/** Estados en los que una base ya «funciona». */
const LISTA = ['available', 'backing-up', 'modifying', 'storage-optimization', 'configuring-enhanced-monitoring', 'rebooting'];

/** Una base (instancia o clúster) con los campos que importan aquí. */
function normalizarBase(estado, obj, tipo) {
  if (tipo === 'cluster') {
    const miembros = obj.miembros.map((id) => instanciaRdsDe(estado, id)).filter(Boolean);
    const escritora = miembros.find((m) => m.rol === 'writer') ?? miembros[0] ?? null;
    return { id: obj.id, arn: obj.arn, tipo, estado: obj.estado, cifrada: obj.cifrada, publica: obj.publica, protegida: obj.protegida, grupoSubredes: obj.grupoSubredes, gruposSeguridad: obj.gruposSeguridad, vpcId: obj.vpcId, puerto: obj.puerto, subredes: miembros.map((m) => m.subredId), escritora };
  }
  return { id: obj.id, arn: obj.arn, tipo, estado: obj.estado, cifrada: obj.cifrada, publica: obj.publica, protegida: obj.protegida, grupoSubredes: obj.grupoSubredes, gruposSeguridad: obj.gruposSeguridad, vpcId: obj.vpcId, puerto: obj.puerto, subredes: [obj.subredId, obj.subredSecundaria].filter(Boolean), escritora: obj };
}

const fuera = (o) => ['deleting', 'deleted'].includes(o.estado);

function candidatasBase(estado) {
  const inst = (estado.rds?.instancias ?? []).filter((i) => i.rol !== 'replica' && !i.clusterId && !fuera(i)).map((i) => normalizarBase(estado, i, 'instancia'));
  const clus = (estado.rds?.clusteres ?? []).filter((c) => !fuera(c) && !c.expres).map((c) => normalizarBase(estado, c, 'cluster'));
  return [...inst, ...clus];
}

function elegirBase(estado, x, ctx) {
  const i = instanciaRdsDe(estado, x.db);
  if (i && i.rol !== 'replica' && !i.clusterId && !fuera(i)) return normalizarBase(estado, i, 'instancia');
  const cl = clusterRdsDe(estado, x.db);
  if (cl && !fuera(cl)) return normalizarBase(estado, cl, 'cluster');
  return mejorPor(candidatasBase(estado), (b) => checksBase(estado, x, b, ctx))?.candidata ?? null;
}

const cubrePuerto = (r, puerto) => r.protocolo === '-1' || (r.protocolo === 'tcp' && r.desde <= puerto && puerto <= r.hasta);
const grupoPorId = (estado, id) => estado.gruposSeguridad.find((g) => g.id === id) ?? null;
const fmtSubredes = (estado, ids) => ids.map((id) => subredDe(estado, id)).filter(Boolean).map((s) => `${s.nombre || s.id} (${s.az})`).join(', ');

function checksBase(estado, x, b, { app, vpc }) {
  const tExiste = `Existe la base «${x.db}» y está Available`;
  const tCif = 'Cifrada en reposo con KMS';
  const tPriv = 'Public access: No (sin IP pública)';
  const tSub = 'Su DB subnet group tiene solo subredes privadas de clinica-vpc';
  const tAcc = `Solo ${x.app} llega al puerto de la base (regla con origen en ${x.sgApp}, ninguna por IP)`;
  const tProt = 'Deletion protection activada';
  if (!b) {
    const r = `Todavía no hay ninguna base en RDS. Créala en Aurora and RDS → Databases → Create database con el identificador ${x.db}, en clinica-vpc.`;
    return [check('existe', tExiste, 3, false, r), check('cifrada', tCif, 4, false, r), check('privada', tPriv, 3, false, r), check('subredes', tSub, 4, false, r), check('acceso', tAcc, 4, false, r), check('proteccion', tProt, 2, false, r)];
  }
  const lista_ = LISTA.includes(b.estado);
  const exacta = b.id === x.db;
  let rExiste;
  if (exacta && lista_) rExiste = `Tu base ${b.id} está ${b.estado === 'available' ? 'Available' : `funcionando (${b.estado})`}. AWS la instala, la parcha y la respalda; tú decides quién entra y cómo se protege.`;
  else if (exacta) rExiste = b.estado === 'creating' ? `Tu base ${b.id} todavía se está creando (Creating). Espera unos segundos y vuelve a revisar.` : `Tu base ${b.id} está en estado ${b.estado}.`;
  else rExiste = `Tu base se llama «${b.id}», pero se pidió exactamente «${x.db}». El identificador no se cambia fácilmente: crea la base con el nombre correcto (y borra la que sobra para no pagar doble).`;

  const rCif = b.cifrada
    ? `${b.id} está cifrada con KMS: el disco, sus respaldos, sus snapshots y sus réplicas. Si alguien se llevara el disco, solo vería basura.`
    : `${b.id} NO está cifrada. En RDS el cifrado solo se elige al crear la base: no se puede activar después. Para arreglarlo: toma un snapshot, cópialo marcando el cifrado (Actions → Copy snapshot) y restaura una base nueva desde la copia; o, más fácil aquí, crea la base de nuevo con «Enable encryption».`;

  const rPriv = !b.publica
    ? `${b.id} no tiene IP pública: desde internet no existe, aunque alguien conociera su endpoint.`
    : `${b.id} tiene «Public access: Yes»: le dieron una IP pública. Una base con datos de pacientes nunca debe estar expuesta. Cámbialo con Modify → Connectivity → Public access: No → Apply immediately.`;

  // Subredes: la base en clinica-vpc y su subnet group solo con subredes privadas.
  const grupo = grupoSubredesRdsDe(estado, b.grupoSubredes);
  const subredesGrupo = grupo?.subredes ?? b.subredes;
  const publicas = subredesGrupo.filter((id) => esSubredPublica(estado, id));
  const enVpc = Boolean(vpc && b.vpcId === vpc.id);
  const okSub = enVpc && Boolean(grupo) && publicas.length === 0;
  let rSub;
  if (okSub) rSub = `El subnet group ${grupo.nombre} solo tiene subredes privadas (${fmtSubredes(estado, subredesGrupo)}): sus tablas de rutas no llevan a internet. Aunque RDS cambie de zona en un failover, la base nunca caerá en una subred pública.`;
  else if (!enVpc) rSub = `Tu base está en la VPC ${b.vpcId}${vpc ? `, no en clinica-vpc (${vpc.id})` : ''}. Así el servidor ${x.app} ni siquiera la ve. La VPC de una base no se cambia: créala de nuevo eligiendo clinica-vpc en Connectivity.`;
  else rSub = `El subnet group ${grupo?.nombre ?? b.grupoSubredes} incluye subredes públicas (${fmtSubredes(estado, publicas)}): si la base cae ahí, queda a un paso de internet. Crea en Subnet groups uno con solo las dos subredes «private» de clinica-vpc y úsalo al crear la base (el de una base existente se cambia con Modify).`;

  // Acceso: el servidor llega por una regla con origen en su grupo; nada abierto a IP.
  const grupos = b.gruposSeguridad.map((id) => grupoPorId(estado, id)).filter(Boolean);
  const reglas = grupos.flatMap((g) => g.entrada.filter((r) => cubrePuerto(r, b.puerto)).map((r) => ({ g, r })));
  const porIp = reglas.filter(({ r }) => !String(r.origen).startsWith('sg-'));
  const con = app ? conexionBase(estado, app.id, b.id) : { ok: false, motivo: `La instancia ${x.app} ya no existe.` };
  const porGrupo = Boolean(app && reglas.some(({ r }) => String(r.origen).startsWith('sg-') && app.gruposSeguridad.includes(r.origen)));
  const okAcc = con.ok && porGrupo && porIp.length === 0;
  let rAcc;
  if (okAcc) rAcc = `Solo entran a TCP ${b.puerto} los servidores con el grupo ${x.sgApp}. Ninguna regla abre la base a una IP: aunque cambie la IP de ${x.app}, la regla sigue sirviendo, y nadie más la alcanza.`;
  else if (porIp.length) {
    const abiertas = porIp.map(({ g, r }) => `${r.origen} en ${g.nombre}`).join('; ');
    const casa = porIp.some(({ r }) => r.origen === `${x.ipCasa}/32`);
    rAcc = `El puerto ${b.puerto} de tu base está abierto a: ${abiertas}. ${casa ? '«Create new» en Create database agrega sola la IP de tu casa; hay que quitarla.' : 'Con una IP o red de origen entra cualquier equipo con esa dirección.'} Borra esa regla en EC2 → Security Groups → Edit inbound rules y deja solo la que tiene origen ${x.sgApp}.`;
  } else if (!app) rAcc = con.motivo;
  else if (con.ok) rAcc = `${fmtInst(app)} llega a la base, pero no por una regla con origen en su grupo ${x.sgApp}. Pon como Source el grupo, no una IP.`;
  else if (!lista_) rAcc = `Cuando la base esté lista se podrá revisar la conexión. ${con.motivo}`;
  else if (String(con.motivo).startsWith('Ningún grupo de seguridad')) {
    const tipoRegla = b.puerto === 5432 ? 'PostgreSQL' : 'MYSQL/Aurora';
    rAcc = `Ningún grupo de tu base deja entrar TCP ${b.puerto} desde ${x.app}. Los grupos de la base son ${lista(grupos.map((g) => `${g.nombre} (${g.id})`))} y hoy dejan entrar: ${describirEntrada(estado, b.gruposSeguridad)}. Agrega (o corrige) en EC2 → Security Groups → Edit inbound rules una regla con Type ${tipoRegla} (TCP ${b.puerto}) y Source = el grupo ${x.sgApp}.`;
  } else rAcc = `${con.motivo} Los grupos de tu base son: ${lista(grupos.map((g) => `${g.nombre} (${g.id})`))}. La regla de entrada va con el puerto del motor (${b.puerto}) y Source = ${x.sgApp}.`;

  const rProt = b.protegida
    ? `Deletion protection está activa: para borrar ${b.id} primero hay que quitarla a propósito con Modify. Un clic equivocado ya no se lleva las citas de la clínica.`
    : `${b.id} no tiene Deletion protection. Actívala con Modify → Additional configuration → Enable deletion protection → Apply immediately.`;

  return [check('existe', tExiste, 3, exacta && lista_, rExiste), check('cifrada', tCif, 4, Boolean(b.cifrada), rCif), check('privada', tPriv, 3, !b.publica, rPriv), check('subredes', tSub, 4, okSub, rSub), check('acceso', tAcc, 4, okAcc, rAcc), check('proteccion', tProt, 2, Boolean(b.protegida), rProt)];
}

/* ============================================================ secreto */

const vivos = (estado) => (estado.secretos?.secretos ?? []).filter((s) => !s.borradoEn);
const esDeLaBase = (s, b) => Boolean(b && ((s.base?.id && s.base.id === b.id) || (s.administradoPor === 'rds' && s.recurso === b.arn)));

/** El secreto del alumno: el de su base (primero el que él guardó con su llave), o cualquiera de base. */
function elegirSecreto(estado, x, b, k) {
  const todos = vivos(estado);
  const peso = (s) => (esDeLaBase(s, b) ? 8 : 0) + (k && s.llaveKms === k.id ? 4 : 0) + (s.nombre === x.secreto ? 2 : 0) + (s.administradoPor ? 0 : 1) + (s.tipo === 'rds' ? 1 : 0);
  return todos.filter((s) => s.tipo === 'rds' || s.tipo === 'otra-base' || esDeLaBase(s, b)).sort((a, c) => peso(c) - peso(a))[0] ?? null;
}

function checksSecreto(estado, x, b, k, s) {
  const tExiste = `Las credenciales de ${x.db} están en Secrets Manager`;
  const tLlave = `El secreto está cifrado con tu llave ${x.alias}`;
  if (!s) {
    const borrado = (estado.secretos?.secretos ?? []).find((y) => y.borradoEn);
    const r = borrado
      ? `Tu secreto ${borrado.nombre} está programado para borrarse: así no sirve. Cancélalo en el secreto → Actions → Cancel deletion.`
      : `No hay ningún secreto con las credenciales de la base. Créalo en Secrets Manager → Store a new secret → Credentials for Amazon RDS database${b ? ` y elige la base ${b.id}` : ' (primero crea la base)'}.`;
    return [check('existe', tExiste, 5, false, r), check('llave', tLlave, 5, false, r)];
  }
  const okExiste = esDeLaBase(s, b);
  let rExiste;
  if (okExiste) rExiste = `${s.nombre} guarda el usuario y la contraseña de ${b.id}${s.administradoPor === 'rds' ? ' (RDS lo administra por ti)' : ''}. La app los pide a Secrets Manager con su rol cuando los necesita: la contraseña ya no vive en un archivo del servidor.`;
  else if (!b) rExiste = `Tu secreto ${s.nombre} existe, pero todavía no hay una base ${x.db} a la que corresponda. Crea la base y luego un secreto que la elija en «Database».`;
  else rExiste = `Tu secreto ${s.nombre} no es de la base ${b.id}${s.base?.id ? ` (es de ${s.base.id})` : s.tipo === 'otra-base' ? ' (lo guardaste como «other database»)' : ''}. Créalo con «Credentials for Amazon RDS database» y elige ${b.id} en la lista Database.`;

  const llave = (estado.kms?.llaves ?? []).find((y) => y.id === s.llaveKms) ?? null;
  const okLlave = Boolean(llave && !llave.administradaPorAws && (k ? llave.id === k.id : true) && llave.estado === 'Enabled');
  let rLlave;
  if (okLlave) rLlave = `${s.nombre} está cifrado con ${nombreLlave(llave)}: para leerlo hace falta permiso en el secreto Y en la llave. Si algún día deshabilitas la llave, nadie podrá leerlo.`;
  else if (s.administradoPor === 'rds') rLlave = `${s.nombre} lo creó RDS («Managed in AWS Secrets Manager») y quedó con la llave aws/secretsmanager. Para usar la llave de la clínica, elígela al crear la base en «Select the encryption key» (debajo de «Managed in AWS Secrets Manager») o guarda tus credenciales con Secrets Manager → Store a new secret y elige ${x.alias} en «Encryption key».`;
  else if (!llave || llave.administradaPorAws) rLlave = `${s.nombre} está cifrado con aws/secretsmanager, la llave que AWS administra. Se pidió tu llave ${x.alias}: cámbiala en el secreto → Actions → Edit encryption key.`;
  else if (llave.estado !== 'Enabled') rLlave = `${s.nombre} usa ${nombreLlave(llave)}, que está ${llave.estado}: así nadie puede leerlo. Habilita la llave o cambia la del secreto.`;
  else rLlave = `${s.nombre} usa la llave ${nombreLlave(llave)}; se pidió ${x.alias}. Cámbiala en el secreto → Actions → Edit encryption key.`;
  return [check('existe', tExiste, 5, okExiste, rExiste), check('llave', tLlave, 5, okLlave, rLlave)];
}

function checksRotacion(s) {
  const tAct = 'El secreto de la base rota solo';
  const tCada = 'Rota cada 30 días o menos';
  if (!s) {
    const r = 'Es el bono opcional: si activas la rotación del secreto de la base, suma puntos extra (sin pasar de 100). No hacerlo no te quita puntos.';
    return [check('activa', tAct, 5, false, r), check('cada', tCada, 3, false, r)];
  }
  const okAct = Boolean(s.rotacion?.activa);
  const rAct = okAct
    ? `${s.nombre} rota solo${s.administradoPor === 'rds' ? ' (RDS lo hace por ti)' : ` con la función ${String(s.rotacion.lambdaArn ?? '').split(':').pop()}`}: cada vez se crea una contraseña nueva (AWSCURRENT) y la anterior queda como AWSPREVIOUS un rato. Si alguien copió la vieja, deja de servirle.`
    : `La rotación de ${s.nombre} está apagada. Crea una función en Lambda y luego, en el secreto → Rotation → Edit rotation, activa «Automatic rotation» y elige la función.`;
  const dias = s.rotacion?.cadaMs ? s.rotacion.cadaMs / DIA : null;
  const okCada = okAct && dias !== null && dias <= 30;
  const rCada = okCada
    ? `Rota con ${s.rotacion.expresion}: una contraseña que dura ${dias < 1 ? 'horas' : `${Math.round(dias)} días`} como mucho le sirve poco a un ladrón.`
    : okAct
      ? `Rota con ${s.rotacion.expresion}: más de 30 días. Bájalo en Rotation → Edit rotation (por ejemplo, rate(30 days)).`
      : 'Sin rotación no hay calendario que revisar.';
  return [check('activa', tAct, 5, okAct, rAct), check('cada', tCada, 3, okCada, rCada)];
}

/* ============================================================ servidor */

const S3_APP = ['AmazonS3FullAccess', 'AmazonS3ReadOnlyAccess'];

function checksServidor(estado, x, app) {
  const tRol = `${x.app} tiene un rol de EC2 con permiso de S3 y sin políticas de toda la cuenta`;
  const tLlaves = `${x.usuarioApp} ya no tiene llaves de acceso activas`;
  const tDisco = `Un volumen gp3 de ${x.volumenGib} GiB cifrado, conectado a ${x.app}`;
  const tSsh = 'Nadie de internet puede intentar SSH (22 cerrado o solo desde tu IP)';

  // llaves de acceso
  const ua = usuario(estado, x.usuarioApp);
  const activas = llavesActivas(ua);
  const okLlaves = !activas.length;
  const rLlaves = !ua
    ? `Borraste a ${x.usuarioApp}: sus llaves desaparecieron con él. Unas llaves de larga duración en un archivo son lo primero que busca quien entra a un servidor.`
    : okLlaves
      ? `${x.usuarioApp} ya no tiene llaves activas: aunque alguien haya copiado el archivo, ya no le sirven. El servidor ahora usa credenciales temporales de su rol, que se renuevan solas.`
      : `${x.usuarioApp} todavía tiene la llave ${activas.map((k) => k.id).join(', ')} en Active. Desactívala o bórrala en IAM → Users → ${x.usuarioApp} → Security credentials → Access keys → Actions.`;

  if (!app) {
    const terminada = estado.instancias.find((i) => i.nombre === x.app);
    const r = terminada ? `La instancia ${x.app} está ${terminada.estado}: era el servidor de la clínica y no se debía terminar.` : `No encontré la instancia ${x.app}.`;
    return [check('rol', tRol, 4, false, r), check('llaves', tLlaves, 3, okLlaves, rLlaves), check('disco', tDisco, 3, false, r), check('ssh', tSsh, 2, false, r)];
  }

  // rol
  const rol = app.rolIam ? estado.iam.roles.find((r) => r.nombre === app.rolIam) : null;
  let okRol = false;
  let rRol;
  if (!app.rolIam) {
    const hecho = estado.iam.roles.find((r) => igual(r.nombre, x.rol));
    rRol = hecho
      ? `Ya creaste el rol ${hecho.nombre}, pero ${x.app} no lo tiene puesto. Pónselo en EC2 → Instances → ${x.app} → Actions → Security → Modify IAM role.`
      : `${x.app} no tiene rol. Crea uno en IAM → Roles → Create role → AWS service → EC2 y pónselo con Actions → Security → Modify IAM role.`;
  } else if (!rol) rRol = `${x.app} tiene el rol ${app.rolIam}, que ya no existe.`;
  else {
    const anchas = rol.politicas.filter((p) => politicaIam(p)?.servicio === '*');
    const s3 = rol.politicas.filter((p) => S3_APP.includes(p));
    okRol = s3.length > 0 && anchas.length === 0;
    if (okRol) rRol = `${x.app} usa el rol ${rol.nombre} (${lista(rol.politicas)}). AWS le da credenciales temporales que rotan solas: ya no hay llaves que robar. En una clínica real, la política se limitaría además a un solo bucket.`;
    else if (anchas.length) rRol = `El rol ${rol.nombre} tiene ${anchas.join(', ')}: si alguien se mete al servidor, podría hacer de todo en la cuenta. Quita esa política y deja solo la de S3.`;
    else rRol = `El rol ${rol.nombre} tiene ${lista(rol.politicas)}, pero la app necesita leer y guardar expedientes en S3: agrégale ${S3_APP.join(' o ')}.`;
  }

  // disco cifrado
  const discos = estado.volumenes.filter((v) => !v.raiz && v.instanciaId === app.id && v.estado === 'in-use');
  const evaluar = (v) => [v.cifrado, v.tamano === x.volumenGib, v.tipo === 'gp3'];
  const mejor = discos.sort((a, b) => evaluar(b).filter(Boolean).length - evaluar(a).filter(Boolean).length)[0] ?? null;
  const okDisco = Boolean(mejor && evaluar(mejor).every(Boolean));
  let rDisco;
  if (okDisco) rDisco = `El volumen ${mejor.id} (${mejor.tipo}, ${mejor.tamano} GiB) está cifrado y conectado a ${x.app}. Con EBS cifrado, también sus snapshots y lo que viaja entre la instancia y el disco quedan cifrados.`;
  else if (mejor) {
    const falta = [];
    if (!mejor.cifrado) falta.push('no está cifrado (un volumen no se cifra después: crea otro con «Encrypt this volume», o uno nuevo desde un snapshot marcando el cifrado)');
    if (mejor.tamano !== x.volumenGib) falta.push(`mide ${mejor.tamano} GiB y se pidieron ${x.volumenGib}`);
    if (mejor.tipo !== 'gp3') falta.push(`es ${mejor.tipo} y se pidió gp3`);
    rDisco = `El volumen ${mejor.id} conectado a ${x.app} ${falta.join('; ')}.`;
  } else {
    const sueltos = estado.volumenes.filter((v) => !v.raiz && v.estado === 'available');
    const otraZona = sueltos.find((v) => v.az !== app.az);
    rDisco = sueltos.length
      ? `Tienes el volumen ${sueltos[0].id}, pero no está conectado a ${x.app}.${otraZona ? ` Ojo: ${otraZona.id} está en ${otraZona.az} y ${x.app} en ${app.az}; un volumen solo se conecta a una instancia de su misma zona.` : ' Conéctalo con Volumes → Actions → Attach volume.'}`
      : `${x.app} no tiene ningún disco extra conectado. Crea el volumen en EC2 → Volumes → Create volume (zona ${app.az}, «Encrypt this volume») y luego Attach volume.`;
  }

  const ssh = checkSsh(estado, app, x.ipCasa, { id: 'ssh', puntos: 2, exigirCasa: false, texto: tSsh, redPropia: x.vpcCidr });
  return [check('rol', tRol, 4, okRol, rRol), check('llaves', tLlaves, 3, okLlaves, rLlaves), check('disco', tDisco, 3, okDisco, rDisco), ssh];
}

/* =========================================================== CloudTrail */

function checksAuditoria(estado, x) {
  const tTrail = 'Un trail de CloudTrail registrando (Logging)';
  const tVal = 'Log file validation activada';
  const tBucket = 'Los registros van a su propio bucket privado (no al de expedientes)';
  const trails = estado.cloudtrail?.trails ?? [];
  const t = trailDe(estado, x.trail) ?? [...trails].sort((a, b) => Number(b.registrando) + Number(b.validacion) - Number(a.registrando) - Number(a.validacion))[0] ?? null;
  if (!t) {
    const r = 'No hay ningún trail. El Event history guarda solo 90 días y no se puede exportar como evidencia; un trail guarda todo en S3 el tiempo que quieras. Créalo en CloudTrail → Trails → Create trail.';
    return [check('trail', tTrail, 4, false, r), check('validacion', tVal, 2, false, r), check('bucket', tBucket, 2, false, r)];
  }
  const okTrail = t.registrando;
  const rTrail = okTrail
    ? `El trail ${t.nombre} registra la actividad de todas las regiones y la guarda en s3://${t.bucket}: quién hizo qué, cuándo y desde dónde, por el tiempo que la clínica decida.`
    : `El trail ${t.nombre} existe, pero está detenido (Stopped logging): no está guardando nada. Enciéndelo en el trail → Start logging.`;
  const rVal = t.validacion
    ? 'Con Log file validation, CloudTrail firma cada archivo: si alguien borra o cambia un registro para tapar lo que hizo, se nota.'
    : `${t.nombre} no tiene Log file validation: un registro alterado no se notaría. En el simulador no se edita después: borra el trail (Delete) y créalo otra vez con «Log file validation» en Enabled.`;
  const b = estado.buckets.find((y) => y.nombre === t.bucket) ?? null;
  const bloq = b && Object.values(b.bloqueoPublico ?? {}).every(Boolean);
  const okBucket = Boolean(b && t.bucket !== x.bucket && bloq);
  let rBucket;
  if (okBucket) rBucket = `Los registros van a ${t.bucket}, separado de los expedientes y sin acceso público: la evidencia de auditoría no se mezcla con los datos de pacientes.`;
  else if (t.bucket === x.bucket) rBucket = `El trail guarda los registros en el bucket de los expedientes. Mejor separarlos: crea el trail con «Create new S3 bucket».`;
  else if (!b) rBucket = `El bucket ${t.bucket} del trail ya no existe: CloudTrail no tiene dónde dejar los registros.`;
  else rBucket = `El bucket ${t.bucket} de los registros no tiene bloqueado todo el acceso público. Los registros dicen mucho de tu cuenta: actívalo en Permissions → Block public access.`;
  return [check('trail', tTrail, 4, okTrail, rTrail), check('validacion', tVal, 2, Boolean(t.validacion), rVal), check('bucket', tBucket, 2, okBucket, rBucket)];
}

/* ============================================================== revisar */

export function revisar(estadoOriginal, datos) {
  const estado = preparar(estadoOriginal);
  const x = datosLab(datos);
  const app = vivas(estado).find((i) => i.nombre === x.app) ?? null;
  const vpc = elegirVpc(estado, x.vpcCidr);
  const k = elegirLlave(estado, x);
  const b = elegirBase(estado, x, { app, vpc });
  const s = elegirSecreto(estado, x, b, k);
  return armar(LAB.tareas(datos), {
    personas: checksPersonas(estado, x),
    mfa: checksMfa(estado, x),
    llave: checksLlave(estado, x, k, app),
    expedientes: checksExpedientes(estado, x, k),
    base: checksBase(estado, x, b, { app, vpc }),
    secreto: checksSecreto(estado, x, b, k, s),
    servidor: checksServidor(estado, x, app),
    auditoria: checksAuditoria(estado, x),
    rotacion: checksRotacion(s && esDeLaBase(s, b) ? s : null)
  });
}

/* ============================================================= solución */

const MINUTO = 60_000;
const pasar = (e, ms) => avanzar(e, reloj.ahora() + ms);

/** La cuenta resuelta, hecha solo con acciones del modelo (como en la consola). */
export function solucion(datos) {
  const x = datosLab(datos);
  const e = LAB.estadoInicial(datos);
  const vpc = e.vpcs.find((v) => v.cidr === x.vpcCidr);
  const app = e.instancias.find((i) => i.nombre === x.app);
  const sgApp = e.gruposSeguridad.find((g) => g.nombre === x.sgApp);

  // personas y mfa
  crearGrupoIam(e, { nombre: x.grupoAuditoria, politicas: [x.politicaAuditoria, 'SecurityAudit'] });
  crearUsuario(e, { nombre: x.auditora, consola: true, grupos: [x.grupoAuditoria] });
  eliminarUsuario(e, x.compartido);
  asignarMfaRaiz(e);
  asignarMfa(e, x.admin, { nombreDispositivo: 'luis-celular' });
  asignarMfa(e, x.auditora, { nombreDispositivo: 'paola-celular' });

  // servidor: rol, sin llaves de acceso, disco cifrado y SSH cerrado
  crearRol(e, { nombre: x.rol, servicio: 'ec2.amazonaws.com', politicas: ['AmazonS3FullAccess'] });
  cambiarRolInstancia(e, app.id, x.rol);
  const ua = e.iam.usuarios.find((u) => u.nombre === x.usuarioApp);
  for (const k of ua.llavesAcceso) cambiarLlaveAcceso(e, x.usuarioApp, k.id, false);
  const vol = crearVolumen(e, { nombre: x.volumen, tipo: 'gp3', tamano: x.volumenGib, az: app.az, cifrado: true });
  pasar(e, MINUTO);
  adjuntarVolumen(e, vol.id, app.id);
  editarReglasSg(e, sgApp.id, 'entrada', [
    { protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' },
    { protocolo: 'tcp', desde: 443, hasta: 443, origen: '0.0.0.0/0' }
  ]);

  // llave de KMS: luis la administra, el rol la usa, con rotación
  const llave = crearLlaveKms(e, { alias: x.alias, descripcion: 'Expedientes de la clinica', administradores: [x.admin], usuarios: [x.rol] });
  rotacionLlaveKms(e, llave.id, { activa: true, dias: 365 });

  // expedientes
  editarBloqueoPublico(e, x.bucket, { aclsNuevas: true, aclsCualquiera: true, politicasNuevas: true, politicasCualquiera: true });
  editarCifrado(e, x.bucket, { tipo: 'SSE-KMS', bucketKey: true });
  editarVersionado(e, x.bucket, true);
  crearReglaCiclo(e, x.bucket, { nombre: 'expedientes-a-glacier', prefijo: null, transiciones: [{ dias: x.diasGlacier, clase: 'GLACIER' }] });

  // base: subnet group privado, grupo propio, cifrada, privada y protegida
  const privadas = e.subredes.filter((s) => s.vpcId === vpc.id && s.nombre.includes('private')).map((s) => s.id);
  crearGrupoSubredesRds(e, { nombre: x.grupoSubredes, descripcion: 'Solo subredes privadas', vpcId: vpc.id, subredes: privadas });
  const sgDb = crearGrupoSeguridad(e, { nombre: x.sgDb, descripcion: 'MySQL solo desde el portal', vpcId: vpc.id, entrada: [{ protocolo: 'tcp', desde: 3306, hasta: 3306, origen: sgApp.id }] });
  crearBaseRds(e, {
    metodo: 'standard',
    motor: 'mysql',
    plantilla: 'devtest',
    despliegue: 'single',
    id: x.db,
    usuario: 'admin',
    contrasena: 'ClinicaSimulada2026',
    clase: 'db.t3.micro',
    almacenamiento: { tipo: 'gp3', gib: 20, autoescalado: true, maximo: 100 },
    vpcId: vpc.id,
    grupoSubredes: x.grupoSubredes,
    publica: false,
    gruposSeguridad: [sgDb.id],
    retencion: 7,
    cifrada: true,
    protegida: true
  });
  pasar(e, MINUTO);

  // secreto con la llave de la clínica, y el bono: rotación cada 30 días
  crearSecreto(e, { nombre: x.secreto, tipo: 'rds', usuario: 'admin', contrasena: 'ClinicaSimulada2026', baseId: x.db, llaveKms: llave.id });
  crearFuncion(e, { nombre: 'clinica-rotar-db', runtime: 'nodejs22.x' });
  configurarRotacionSecreto(e, x.secreto, { activa: true, unidad: 'days', cada: 30, lambda: 'clinica-rotar-db' });

  // auditoría
  crearTrail(e, { nombre: x.trail, bucketNuevo: true, validacion: true });

  pasar(e, 60 * MINUTO);
  return e;
}
