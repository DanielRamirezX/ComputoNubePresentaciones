// Rúbrica del laboratorio de la sesión 5 (simulador) · Control escolar en la nube.
//
// Revisa la cuenta como la dejó el alumno: la base RDS (Multi-AZ, privada, la
// clase y el disco pedidos), quién puede entrar a ella (conexionBase, del
// modelo de RDS), sus respaldos, la réplica de lectura, la tabla de DynamoDB
// con sus ítems y la búsqueda con Query, y el bono de ElastiCache.
//
// Elige «la base del alumno» con tolerancia: si no usó el identificador
// exacto, califica la que más se parece a lo pedido y la retro le dice qué
// nombre se esperaba. Solo servidor: el navegador nunca recibe este archivo.

import {
  avanzar,
  cacheDe,
  clusterRdsDe,
  conexionBase,
  consultarTabla,
  crearBaseRds,
  crearCacheElasticache,
  crearGrupoSeguridad,
  crearReplicaRds,
  crearTablaDynamo,
  grupoSubredesRdsDe,
  instanciaRdsDe,
  itemDynamoPlano,
  ponerItemDynamo,
  reloj,
  tablaDynamoDe,
  tomarSnapshotRds,
  zonasDeGrupoRds
} from '../../public/consola/modelo.js';
import { LAB, datosLab } from '../../public/labs/lab-s5.js';
import { armar, check, fmtInst, lista, mejorPor, preparar, vivas } from './comun.js';

/**
 * Dónde repasar cada punto en la Ruta AWS (ver src/repaso.js). La clave
 * 'tarea/check' gana sobre la de la tarea.
 */
export const REPASO = {
  rds: ['s5-relacionales/2', 's5-disponibilidad/1'],
  'rds/existe': ['s5-relacionales/2', 's5-lab-bases/4'],
  'rds/motor': 's5-relacionales/3',
  'rds/multiaz': ['s5-disponibilidad/1', 's1-global/1'],
  'rds/clase': ['s1-ec2/2', 's5-relacionales/2'],
  'rds/almacenamiento': 's4-discos/2',
  'rds/privada': ['s3-vpc/3', 's5-relacionales/2'],

  seguridad: ['s2-lab-seguridad/13', 's2-servicios/3'],
  'seguridad/desde-app': ['s2-lab-seguridad/14', 's2-servicios/3'],
  'seguridad/sin-internet': ['s2-lab-seguridad/14', 's2-servicios/3'],
  'seguridad/grupo-propio': ['s2-lab-seguridad/13', 's2-lab-seguridad/15'],

  respaldos: 's5-disponibilidad/1',
  'respaldos/retencion': ['s5-disponibilidad/1', 's5-repaso/1'],
  'respaldos/snapshot': ['s5-disponibilidad/1', 's4-discos/2'],
  'respaldos/snap-nombre': 's5-disponibilidad/1',

  replica: 's5-disponibilidad/1',
  'replica/existe': ['s5-disponibilidad/1', 's5-repaso/1'],
  'replica/nombre': 's5-disponibilidad/1',
  'replica/zona': ['s5-disponibilidad/1', 's1-global/1'],

  dynamo: ['s5-nosql/1', 's5-lab-bases/6'],
  'dynamo/tabla': ['s5-nosql/1', 's5-lab-bases/6'],
  'dynamo/ondemand': ['s5-nosql/2', 's5-lab-bases/7'],
  'dynamo/ana': ['s5-lab-bases/8', 's5-nosql/1'],
  'dynamo/luis': ['s5-lab-bases/9', 's5-nosql/1'],
  'dynamo/consulta': ['s5-lab-bases/10', 's5-nosql/1'],

  cache: ['s5-otras/1', 's5-lab-bases/12'],
  'cache/existe': ['s5-otras/1', 's5-lab-bases/12'],
  'cache/motor': 's5-lab-bases/12',
  'cache/vpc': ['s5-otras/1', 's3-vpc/1']
};

/** Estados en los que una base ya «funciona» (un snapshot o un Modify la pasan un rato a backing-up o modifying). */
const LISTA = ['available', 'backing-up', 'modifying', 'storage-optimization', 'configuring-enhanced-monitoring', 'rebooting'];
const NOMBRE_MOTOR = { mysql: 'MySQL', postgres: 'PostgreSQL', mariadb: 'MariaDB', 'aurora-mysql': 'Aurora MySQL', 'aurora-postgresql': 'Aurora PostgreSQL' };
const motorTexto = (m) => NOMBRE_MOTOR[m] ?? m;
const fmtBase = (b) => `«${b.id}»`;

/** Si la base todavía no está lista, por qué (para la retro). */
function estadoTexto(b) {
  if (b.estado === 'creating') return `Tu base ${fmtBase(b)} todavía se está creando (Status: Creating). Espera unos segundos y vuelve a revisar.`;
  if (b.estado === 'stopped' || b.estado === 'stopping') return `Tu base ${fmtBase(b)} está detenida (${b.estado}). Enciéndela con Actions → Start.`;
  if (b.estado === 'deleting' || b.estado === 'deleted') return `Tu base ${fmtBase(b)} se está borrando.`;
  return `Tu base ${fmtBase(b)} está en estado ${b.estado}.`;
}

/* ===================================================== elegir la base */

/** Las instancias de RDS que pueden ser «la base del alumno»: principales, no réplicas ni miembros de un clúster. */
const candidatasBase = (estado) => (estado.rds?.instancias ?? []).filter((i) => i.rol !== 'replica' && !i.clusterId && !['deleting', 'deleted'].includes(i.estado));

/** La app del laboratorio (la que ya venía hecha), si sigue viva. */
const appDe = (estado, x) => vivas(estado).find((i) => i.nombre === x.app) ?? null;

/** La base del alumno: la del identificador exacto o, si no, la que mejor cumple. */
function elegirBase(estado, x) {
  const exacta = instanciaRdsDe(estado, x.db);
  if (exacta && exacta.rol !== 'replica' && !exacta.clusterId && !['deleting', 'deleted'].includes(exacta.estado)) return exacta;
  return mejorPor(candidatasBase(estado), (b) => checksRds(estado, x, b))?.candidata ?? null;
}

/** Qué hay en RDS cuando no encontré una base que calificar. */
function sinBase(estado, x) {
  const cluster = clusterRdsDe(estado, x.db) ?? (estado.rds?.clusteres ?? []).find((c) => !['deleting', 'deleted'].includes(c.estado));
  if (cluster) {
    return `Creaste un clúster (${cluster.id}, ${cluster.tipo === 'aurora' ? 'Aurora' : 'Multi-AZ DB cluster'}), no una DB instance. Se pidió MySQL con «Multi-AZ DB instance deployment (2 instances)». Crea la base ${x.db} con ese despliegue.`;
  }
  const replicas = (estado.rds?.instancias ?? []).filter((i) => i.rol === 'replica');
  if (replicas.length) return `Solo encontré réplicas (${replicas.map((r) => r.id).join(', ')}), no la base principal ${x.db}.`;
  return `Todavía no hay ninguna base en RDS. Créala en Aurora and RDS → Databases → Create database, con el identificador ${x.db}.`;
}

/* ================================================================= RDS */

function checksRds(estado, x, b) {
  const tExiste = `Existe la base «${x.db}» y está Available`;
  const tMotor = 'El motor es MySQL';
  const tMulti = 'Multi-AZ DB instance: una copia en espera en otra zona';
  const tClase = `Clase pequeña Burstable (${x.clases.slice(0, 3).join(', ')}…)`;
  const tDisco = `Almacenamiento ${x.almacenamientoTipo} de ${x.almacenamientoGib} GiB`;
  const tPriv = 'Public access: No (la base no tiene IP pública)';
  if (!b) {
    const r = sinBase(estado, x);
    return [check('existe', tExiste, 6, false, r), check('motor', tMotor, 4, false, r), check('multiaz', tMulti, 8, false, r), check('clase', tClase, 4, false, r), check('almacenamiento', tDisco, 4, false, r), check('privada', tPriv, 4, false, r)];
  }
  const lista_ = LISTA.includes(b.estado);
  const exacta = b.id === x.db;
  let rExiste;
  if (exacta && lista_) rExiste = `Tu base ${fmtBase(b)} está ${b.estado === 'available' ? 'Available' : `funcionando (${b.estado})`}. AWS se encarga de instalarla, parcharla y respaldarla: tú solo la usas.`;
  else if (exacta) rExiste = estadoTexto(b);
  else rExiste = `Tu base se llama ${fmtBase(b)}, pero se pidió exactamente «${x.db}». El identificador es el nombre con el que la ubicas y forma parte de su endpoint: crea la base con el nombre correcto (y borra la que sobra para no pagar doble).`;

  const okMotor = b.motor === 'mysql';
  const okMulti = Boolean(b.multiAz && b.zonaSecundaria);
  const okClase = x.clases.includes(b.clase);
  const okDisco = b.almacenamiento?.tipo === x.almacenamientoTipo && b.almacenamiento?.gib === x.almacenamientoGib;
  const okPriv = !b.publica;
  const pendiente = (campo) => (b.pendientes && b.pendientes[campo] !== undefined ? ' Tienes ese cambio pendiente para la siguiente ventana de mantenimiento: aplícalo con «Apply immediately» (o Actions → Apply now).' : '');

  return [
    check('existe', tExiste, 6, exacta && lista_, rExiste),
    check(
      'motor',
      tMotor,
      4,
      okMotor,
      okMotor
        ? `MySQL ${b.version}: uno de los motores de RDS (junto con PostgreSQL, MariaDB, Oracle, SQL Server, Db2 y Aurora). Es el mismo que la escuela tenía instalado a mano.`
        : `Tu base usa ${motorTexto(b.motor)}; se pidió MySQL, el motor que la escuela ya conoce. El motor no se puede cambiar con Modify: hay que crear otra base.`
    ),
    check(
      'multiaz',
      tMulti,
      8,
      okMulti,
      okMulti
        ? `Tu base vive en ${b.zona} y su copia en espera en ${b.zonaSecundaria}. Si se cae ${b.zona}, RDS cambia sola a la otra zona (failover) y el endpoint no cambia. Ojo: la copia en espera no atiende consultas, solo da disponibilidad.`
        : `Tu base es Single-AZ: vive solo en ${b.zona}. Si esa zona falla, la escuela se queda sin calificaciones. ${b.plantilla === 'freetier' ? 'La creaste con la plantilla Free tier, que no permite Multi-AZ ni con Modify: crea la base otra vez con la plantilla Dev/Test y «Multi-AZ DB instance deployment (2 instances)».' : `Cámbiala con Modify → Availability and durability → «Multi-AZ DB instance deployment (2 instances)» y «Apply immediately».${pendiente('multiAz')}`}`
    ),
    check(
      'clase',
      tClase,
      4,
      okClase,
      okClase
        ? `${b.clase} es de la familia «t» (burstable): barata, con créditos de CPU para picos cortos. Suficiente para el control escolar.`
        : `Tu base usa ${b.clase}. Para una escuela pequeña basta una clase burstable (${x.clases.join(', ')}); una más grande cuesta varias veces más. Se cambia con Modify → Instance configuration.${pendiente('clase')}`
    ),
    check(
      'almacenamiento',
      tDisco,
      4,
      okDisco,
      okDisco
        ? `gp3 de ${x.almacenamientoGib} GiB: el SSD de uso general, el mismo tipo que usan los discos EBS. Con autoescalado, crece solo si se llena.`
        : `Tu base tiene ${b.almacenamiento?.tipo ?? '?'} de ${b.almacenamiento?.gib ?? '?'} GiB; se pidió ${x.almacenamientoTipo} de ${x.almacenamientoGib} GiB. ${b.almacenamiento?.tipo === 'io2' ? 'io2 (lo que pone la plantilla Production) es para bases enormes y cuesta mucho más. ' : b.almacenamiento?.tipo === 'gp2' ? 'gp2 (lo que pone Free tier) es la generación anterior: gp3 da más rendimiento por menos. ' : ''}El tipo se cambia con Modify → Storage; el tamaño puede crecer, pero nunca hacerse más chico (si te pasaste de ${x.almacenamientoGib} GiB, hay que crear la base otra vez).${pendiente('almacenamiento')}`
    ),
    check(
      'privada',
      tPriv,
      4,
      okPriv,
      okPriv
        ? 'Tu base no tiene IP pública: desde internet no existe. Solo la alcanzan los recursos dentro de la VPC que su grupo de seguridad deje pasar.'
        : 'Tu base tiene «Public access: Yes» y una IP pública. Una base de calificaciones nunca debe estar expuesta a internet: cámbialo con Modify → Connectivity → Public access: No.'
    )
  ];
}

/* ========================================================= seguridad */

const cubrePuerto = (r, puerto) => r.protocolo === '-1' || (r.protocolo === 'tcp' && r.desde <= puerto && puerto <= r.hasta);
const grupoPorId = (estado, id) => estado.gruposSeguridad.find((g) => g.id === id) ?? null;
const fmtGrupo = (g) => `${g.nombre} (${g.id})`;

function checksSeguridad(estado, x, b) {
  const tDesde = `escuela-app llega a la base por TCP ${x.puerto} gracias a una regla con origen en su grupo`;
  const tSin = `Ningún grupo de la base abre el puerto ${x.puerto} a una IP o red`;
  const tPropio = 'La base usa un grupo de seguridad propio (no el default ni app-sg)';
  if (!b) {
    const r = `${sinBase(estado, x)} Sin base no hay a quién protegerle la puerta.`;
    return [check('desde-app', tDesde, 7, false, r), check('sin-internet', tSin, 5, false, r), check('grupo-propio', tPropio, 3, false, r)];
  }
  const app = appDe(estado, x);
  const grupos = b.gruposSeguridad.map((id) => grupoPorId(estado, id)).filter(Boolean);
  const sgApp = estado.gruposSeguridad.find((g) => g.nombre === x.sgApp && g.vpcId === b.vpcId) ?? null;
  const reglasPuerto = grupos.flatMap((g) => g.entrada.filter((r) => cubrePuerto(r, b.puerto)).map((r) => ({ g, r })));
  const porIp = reglasPuerto.filter(({ r }) => !String(r.origen).startsWith('sg-'));

  // ¿Entra la app? Y, si entra, que sea por una regla con origen en un grupo (no por IP).
  const con = app ? conexionBase(estado, app.id, b.id) : { ok: false, motivo: `La instancia ${x.app} ya no existe: la borraste o la terminaste.` };
  const porGrupo = app && reglasPuerto.some(({ r }) => String(r.origen).startsWith('sg-') && app.gruposSeguridad.includes(r.origen));
  const okDesde = con.ok && porGrupo;
  let rDesde;
  if (okDesde) {
    const regla = reglasPuerto.find(({ r }) => String(r.origen).startsWith('sg-') && app.gruposSeguridad.includes(r.origen));
    const origen = grupoPorId(estado, regla.r.origen);
    rDesde = `El grupo ${fmtGrupo(regla.g)} deja entrar TCP ${b.puerto} desde el grupo ${origen ? origen.nombre : regla.r.origen}, que tiene ${fmtInst(app)}. Así la regla sigue sirviendo aunque la app cambie de IP o lances otro servidor con ese grupo.`;
  } else if (con.ok) {
    rDesde = `${fmtInst(app)} sí llega a la base, pero por una regla con origen en una IP o red (${porIp.map(({ r }) => r.origen).join(', ')}). Se pidió que el origen sea el grupo ${x.sgApp}: en Source elige «Custom» y escribe ${x.sgApp}.`;
  } else if (!app) {
    rDesde = con.motivo;
  } else if (!LISTA.includes(b.estado)) {
    rDesde = `${estadoTexto(b)} Cuando esté lista, la app podrá conectarse si el grupo de la base la deja pasar.`;
  } else {
    const tipoRegla = b.puerto === 5432 ? 'PostgreSQL' : 'MYSQL/Aurora';
    const motivo = /^Ningún grupo de seguridad de la base/.test(con.motivo) ? `Ningún grupo de tu base deja entrar TCP ${b.puerto} desde ${x.app}.` : con.motivo;
    rDesde = `${motivo} Los grupos de tu base son: ${lista(grupos.map(fmtGrupo))}. En EC2 → Security Groups → Edit inbound rules, la regla va con Type ${tipoRegla} (TCP ${b.puerto}) y Source ${x.sgApp}${sgApp ? ` (${sgApp.id})` : ''}.`;
  }

  const okSin = porIp.length === 0;
  let rSin;
  if (okSin) rSin = `Ninguna regla abre el puerto ${b.puerto} a una dirección IP o red: desde internet, y desde cualquier otro servidor que no tenga el grupo correcto, la base es invisible.`;
  else {
    const abiertas = porIp.map(({ g, r }) => `${r.origen} en ${g.nombre}`).join('; ');
    const todo = porIp.some(({ r }) => r.origen === '0.0.0.0/0' || r.origen === '::/0');
    const casa = porIp.some(({ r }) => r.origen === `${x.ipCasa}/32`);
    rSin = `Tu base acepta el puerto ${b.puerto} desde: ${abiertas}. ${
      todo ? 'Con 0.0.0.0/0 cualquiera en internet puede intentar entrar a la base de calificaciones.' : casa ? 'Esa es la IP de tu casa: «Create new» en Create database la agrega sola, y hay que quitarla.' : 'Con una IP o red de origen entra cualquier equipo con esa dirección, no solo la app.'
    } Bórrala en EC2 → Security Groups → Edit inbound rules y deja solo la regla con origen ${x.sgApp}.`;
  }

  const propios = grupos.filter((g) => !g.porDefecto && g.nombre !== x.sgApp);
  const okPropio = propios.length > 0;
  let rPropio;
  if (okPropio) rPropio = `La base tiene su propio grupo (${propios.map(fmtGrupo).join(', ')}). Así sus reglas no se mezclan con las del servidor web: cada capa con su puerta.`;
  else if (grupos.some((g) => g.nombre === x.sgApp)) rPropio = `Le pusiste a la base el grupo ${x.sgApp}, el mismo del servidor web: entonces la base hereda la regla del puerto 80 abierto al mundo. Crea un grupo aparte (por ejemplo ${x.sgDb}) y pónselo a la base con Modify.`;
  else rPropio = `Tu base solo usa el grupo default de la VPC (${lista(grupos.map(fmtGrupo))}), que comparten todos los recursos que no eligen otro. Crea un grupo para la base (por ejemplo ${x.sgDb}) y pónselo con Modify → Connectivity.`;

  return [check('desde-app', tDesde, 7, okDesde, rDesde), check('sin-internet', tSin, 5, okSin, rSin), check('grupo-propio', tPropio, 3, okPropio, rPropio)];
}

/* ========================================================== respaldos */

function checksRespaldos(estado, x, b) {
  const tRet = `Respaldos automáticos guardados ${x.retencion} días`;
  const tSnap = 'Un snapshot manual de tu base, Available';
  const tNombre = `El snapshot se llama «${x.snap}»`;
  if (!b) {
    const r = `${sinBase(estado, x)} Sin base no hay qué respaldar.`;
    return [check('retencion', tRet, 8, false, r), check('snapshot', tSnap, 5, false, r), check('snap-nombre', tNombre, 2, false, r)];
  }
  const okRet = b.retencion === x.retencion;
  let rRet;
  if (okRet) rRet = `${fmtBase(b)} guarda respaldos automáticos ${x.retencion} días: puedes regresarla a cualquier segundo de ese periodo (Restore to point in time). El máximo en RDS es 35 días.`;
  else if (b.estado === 'modifying' && b.cambiosEnCurso?.retencion === x.retencion) rRet = `Tu cambio a ${x.retencion} días se está aplicando (Status: Modifying). Espera unos segundos y vuelve a revisar.`;
  else if (b.retencion === 0) rRet = `${fmtBase(b)} tiene los respaldos automáticos apagados (0 días): si alguien borra calificaciones, no hay a dónde regresar. Ponlos en ${x.retencion} días con Modify → Backup retention period y «Apply immediately».`;
  else rRet = `${fmtBase(b)} guarda respaldos ${b.retencion} día${b.retencion === 1 ? '' : 's'}; el reglamento pide ${x.retencion}. Se cambia con Modify → Additional configuration → Backup retention period y «Apply immediately».`;

  const manuales = (estado.rds?.snapshots ?? []).filter((s) => s.tipo === 'manual' && s.instanciaId === b.id);
  const listos = manuales.filter((s) => s.estado === 'available');
  const okSnap = listos.length > 0;
  let rSnap;
  if (okSnap) rSnap = `El snapshot ${listos[0].id} es una foto completa de ${fmtBase(b)}. A diferencia de los automáticos, se queda aunque borres la base, hasta que tú lo borres.`;
  else if (manuales.length) rSnap = `Tu snapshot ${manuales[0].id} todavía se está creando (${manuales[0].estado}). Espera unos segundos.`;
  else {
    const otros = (estado.rds?.snapshots ?? []).filter((s) => s.tipo === 'manual' && s.instanciaId !== b.id);
    rSnap = otros.length
      ? `Tus snapshots manuales (${otros.map((s) => `${s.id} de ${s.instanciaId ?? s.clusterId}`).join(', ')}) no son de ${fmtBase(b)}. Tómalo de tu base: Databases → ${b.id} → Actions → Take snapshot.`
      : `No hay snapshots manuales de ${fmtBase(b)} (los de la pestaña System son los automáticos). Tómalo en Databases → ${b.id} → Actions → Take snapshot.`;
  }

  const exacto = manuales.find((s) => s.id === x.snap);
  const okNombre = Boolean(exacto && exacto.estado === 'available');
  const rNombre = okNombre
    ? `${x.snap}: con un nombre claro, cualquiera en la escuela sabe de qué base y para qué es la foto.`
    : exacto
      ? `Tu snapshot ${x.snap} todavía se está creando.`
      : manuales.length
        ? `Tu snapshot se llama ${manuales.map((s) => s.id).join(', ')}; se pidió «${x.snap}». El nombre no se cambia: toma otro con el nombre correcto.`
        : `Falta el snapshot manual «${x.snap}».`;

  return [check('retencion', tRet, 8, okRet, rRet), check('snapshot', tSnap, 5, okSnap, rSnap), check('snap-nombre', tNombre, 2, okNombre, rNombre)];
}

/* ============================================================= réplica */

function checksReplica(estado, x, b) {
  const tExiste = 'Una réplica de lectura de tu base, Available';
  const tNombre = `La réplica se llama «${x.replica}»`;
  const tZona = 'La réplica está en otra zona que la base principal';
  if (!b) {
    const r = `${sinBase(estado, x)} La réplica se crea a partir de la base principal.`;
    return [check('existe', tExiste, 7, false, r), check('nombre', tNombre, 3, false, r), check('zona', tZona, 5, false, r)];
  }
  const suyas = (estado.rds?.instancias ?? []).filter((i) => i.rol === 'replica' && i.fuente === b.id && !['deleting', 'deleted'].includes(i.estado));
  const r = suyas.find((i) => i.id === x.replica) ?? suyas.find((i) => LISTA.includes(i.estado)) ?? suyas[0] ?? null;
  const okExiste = Boolean(r && LISTA.includes(r.estado));
  let rExiste;
  if (okExiste) rExiste = `${r.id} es una réplica de ${fmtBase(b)}: recibe una copia asíncrona de los datos y atiende consultas, así la base principal queda libre para guardar calificaciones.`;
  else if (r) rExiste = `Tu réplica ${r.id} todavía se está creando (${r.estado}). Tarda unos 25 segundos.`;
  else if (b.retencion === 0) rExiste = `${fmtBase(b)} no tiene réplica, y además sus respaldos automáticos están apagados: RDS no deja crear réplicas sin ellos. Primero sube la retención con Modify y luego Actions → Create read replica.`;
  else {
    const otra = (estado.rds?.instancias ?? []).find((i) => i.rol === 'replica' && i.fuente !== b.id);
    rExiste = otra
      ? `La réplica ${otra.id} es de ${otra.fuente}, no de ${fmtBase(b)}.`
      : `${fmtBase(b)} no tiene réplicas de lectura. Créala con Databases → ${b.id} → Actions → Create read replica. Ojo: Multi-AZ no es una réplica; su copia en espera no atiende consultas.`;
  }

  const okNombre = Boolean(r && r.id === x.replica);
  const rNombre = okNombre
    ? `${x.replica}: su nombre dice de qué base es y para qué sirve.`
    : r
      ? `Tu réplica se llama «${r.id}»; se pidió «${x.replica}». Crea otra con el nombre correcto (y borra la que sobra).`
      : `Falta la réplica «${x.replica}».`;

  const okZona = Boolean(r && r.zona && r.zona !== b.zona);
  let rZona;
  if (okZona) rZona = `La principal está en ${b.zona} y la réplica en ${r.zona}: si una zona tiene problemas, las consultas pueden seguir en la otra.`;
  else if (r) {
    const zonas = zonasDeGrupoRds(estado, grupoSubredesRdsDe(estado, b.grupoSubredes)).filter((z) => z !== b.zona);
    rZona = `Tu réplica quedó en ${r.zona}, la misma zona que la base principal. Al crearla, en Connectivity → Availability Zone elige otra (por ejemplo ${zonas.slice(0, 2).join(' o ') || 'us-east-1b'}). La zona no se cambia después: crea otra réplica.`;
  } else rZona = 'Sin réplica no hay zona que revisar.';

  return [check('existe', tExiste, 7, okExiste, rExiste), check('nombre', tNombre, 3, okNombre, rNombre), check('zona', tZona, 5, okZona, rZona)];
}

/* ============================================================ DynamoDB */

/** El valor plano de un atributo (o undefined): { N: '950' } → 950. */
const valor = (item, nombre) => (item && item[nombre] ? itemDynamoPlano({ [nombre]: item[nombre] })[nombre] : undefined);
const tipo = (item, nombre) => (item && item[nombre] ? Object.keys(item[nombre])[0] : null);
const NOMBRE_TIPO = { S: 'String', N: 'Number', B: 'Binary', BOOL: 'Boolean', NULL: 'Null', SS: 'String set', NS: 'Number set', BS: 'Binary set', L: 'List', M: 'Map' };
const fmtTipo = (t) => NOMBRE_TIPO[t] ?? t;

/** La tabla de puntajes del alumno: la del nombre exacto o, si no, otra suya (no la de la escuela). */
function elegirTabla(estado, x) {
  const exacta = tablaDynamoDe(estado, x.tabla);
  if (exacta && exacta.estado !== 'DELETING') return exacta;
  const otras = (estado.dynamodb?.tablas ?? []).filter((t) => t.nombre !== x.tablaEscuela && t.estado !== 'DELETING');
  return otras.find((t) => t.pk?.nombre === x.pk) ?? otras[0] ?? null;
}

/** El ítem con esa partición (como texto), sin importar el tipo de la llave. */
const itemDe = (t, pk) => (t?.items ?? []).find((i) => String(valor(i, t.pk.nombre)) === pk) ?? null;

function checksDynamo(estado, x) {
  const t = elegirTabla(estado, x);
  const tTabla = `La tabla «${x.tabla}» con partition key «${x.pk}» (String), Active`;
  const tOnd = 'Capacidad On-demand';
  const tAna = 'El ítem ana con puntaje (Number) 950';
  const tLuis = 'El ítem luis con puntaje 720 y nivel «experto»: otra forma';
  const tCons = `Tu ítem «${x.sufijo}» con la calificación que encontraste con Query`;
  if (!t) {
    const r = `Todavía no hay una tabla de puntajes en DynamoDB (la tabla ${x.tablaEscuela} es de la escuela). Créala en DynamoDB → Tables → Create table con el nombre ${x.tabla}.`;
    return [check('tabla', tTabla, 6, false, r), check('ondemand', tOnd, 3, false, r), check('ana', tAna, 4, false, r), check('luis', tLuis, 5, false, r), check('consulta', tCons, 7, false, r)];
  }
  const exacta = t.nombre === x.tabla;
  const llaveOk = t.pk?.nombre === x.pk && t.pk?.tipo === 'S' && !t.sk;
  const activa = t.estado === 'ACTIVE' || t.estado === 'UPDATING';
  const okTabla = exacta && llaveOk && activa;
  let rTabla;
  if (okTabla) rTabla = `Tu tabla ${x.tabla} usa «${x.pk}» como partition key: DynamoDB reparte y encuentra cada ítem por esa llave, sin un esquema fijo para lo demás.`;
  else if (!exacta) rTabla = `Tu tabla se llama «${t.nombre}», pero se pidió exactamente «${x.tabla}». El nombre no se puede cambiar: crea otra con el nombre correcto.`;
  else if (!llaveOk) {
    const tiene = `${t.pk?.nombre} (${fmtTipo(t.pk?.tipo)})${t.sk ? ` + sort key ${t.sk.nombre}` : ''}`;
    rTabla = `Tu tabla usa como llave ${tiene}; se pidió solo la partition key «${x.pk}» de tipo String, sin sort key. La llave no se cambia después de crear la tabla: bórrala y créala de nuevo.`;
  } else rTabla = `Tu tabla está en estado ${t.estado}. Espera a que quede Active.`;

  const okOnd = t.modo === 'PAY_PER_REQUEST';
  const rOnd = okOnd
    ? 'On-demand: no reservas capacidad, pagas cada lectura y escritura. Ideal para un concurso que solo tiene tráfico unos días.'
    : `Tu tabla está en Provisioned (${t.capacidad?.lectura ?? 0} RCU / ${t.capacidad?.escritura ?? 0} WCU): pagas esa capacidad aunque nadie la use. Cámbiala en la pestaña Additional settings → Read/write capacity → Edit → On-demand.`;

  const ana = itemDe(t, 'ana');
  const okAna = Boolean(ana && tipo(ana, 'puntaje') === 'N' && Number(valor(ana, 'puntaje')) === 950);
  let rAna;
  if (okAna) rAna = 'ana tiene puntaje 950 como Number: así DynamoDB puede compararlo y ordenarlo como número, no como texto.';
  else if (!ana) rAna = `No encontré el ítem con ${x.pk} = ana en ${t.nombre}. Créalo en Explore items → ${t.nombre} → Create item.`;
  else if (!ana.puntaje) rAna = `El ítem ana no tiene el atributo «puntaje» (tiene: ${Object.keys(ana).join(', ')}). Agrégalo con Add new attribute → Number.`;
  else if (tipo(ana, 'puntaje') !== 'N') rAna = `El puntaje de ana es de tipo ${fmtTipo(tipo(ana, 'puntaje'))}; debe ser Number. Edita el ítem y cambia el tipo del atributo.`;
  else rAna = `El puntaje de ana es ${valor(ana, 'puntaje')}; se pidió 950.`;

  const luis = itemDe(t, 'luis');
  const okLuisPuntaje = luis && tipo(luis, 'puntaje') === 'N' && Number(valor(luis, 'puntaje')) === 720;
  const okLuisNivel = luis && tipo(luis, 'nivel') === 'S' && String(valor(luis, 'nivel')).trim().toLowerCase() === 'experto';
  const okLuis = Boolean(okLuisPuntaje && okLuisNivel);
  let rLuis;
  if (okLuis) rLuis = `luis tiene un atributo que ana no tiene (nivel). En una base relacional tendrías que agregar una columna a toda la tabla; en DynamoDB cada ítem lleva solo lo que necesita.${ana && ana.nivel ? ' (Aunque a ana también le pusiste nivel: no hacía falta.)' : ''}`;
  else if (!luis) rLuis = `No encontré el ítem con ${x.pk} = luis en ${t.nombre}.`;
  else {
    const falta = [];
    if (!okLuisPuntaje) falta.push(luis.puntaje ? `su puntaje es ${valor(luis, 'puntaje')} (${fmtTipo(tipo(luis, 'puntaje'))}); debe ser 720 como Number` : 'le falta el atributo puntaje (Number) = 720');
    if (!okLuisNivel) falta.push(luis.nivel ? `su nivel es «${valor(luis, 'nivel')}» (${fmtTipo(tipo(luis, 'nivel'))}); debe ser «experto» como String` : 'le falta el atributo nivel (String) = experto');
    rLuis = `En el ítem luis, ${falta.join(' y ')}. Edítalo desde Explore items.`;
  }

  const tuyo = itemDe(t, x.sufijo);
  const okCons = Boolean(tuyo && tipo(tuyo, 'puntaje') === 'N' && Number(valor(tuyo, 'puntaje')) === x.calificacion);
  let rCons;
  if (okCons) rCons = `${x.calificacion} es la calificación de ${x.materia} de ${x.matricula}. Si la buscaste con Query, DynamoDB fue directo a la partición ${x.matricula} y leyó 5 ítems (o 1, con la materia en la sort key); un Scan lee los 40 de la tabla. Con millones de ítems, esa diferencia es tu factura.`;
  else if (!tuyo) rCons = `Falta tu ítem con ${x.pk} = ${x.sufijo} en ${t.nombre}. Su puntaje es la calificación de ${x.materia} del alumno ${x.matricula}: en Explore items abre la tabla ${x.tablaEscuela}, cambia a Query y escribe ${x.matricula} en la partition key.`;
  else if (tipo(tuyo, 'puntaje') !== 'N') rCons = `El puntaje de tu ítem ${x.sufijo} es ${tuyo.puntaje ? `de tipo ${fmtTipo(tipo(tuyo, 'puntaje'))}` : 'inexistente'}; debe ser un Number.`;
  else rCons = `Tu ítem ${x.sufijo} tiene puntaje ${valor(tuyo, 'puntaje')}, pero esa no es la calificación de ${x.materia} de ${x.matricula}. Repite la Query en ${x.tablaEscuela} con matricula = ${x.matricula} y fíjate en la fila de ${x.materia}.`;

  return [check('tabla', tTabla, 6, okTabla, rTabla), check('ondemand', tOnd, 3, okOnd, rOnd), check('ana', tAna, 4, okAna, rAna), check('luis', tLuis, 5, okLuis, rLuis), check('consulta', tCons, 7, okCons, rCons)];
}

/* ===================================================== bono: la caché */

function checksCache(estado, x) {
  const tExiste = `La caché «${x.cache}» está Available`;
  const tMotor = 'Serverless con Valkey o Redis OSS';
  const tVpc = 'En la misma VPC que escuela-app';
  const todas = (estado.elasticache?.caches ?? []).filter((c) => !['deleting', 'deleted'].includes(c.estado));
  const cache = cacheDe(estado, x.cache) ?? todas[0] ?? null;
  if (!cache || ['deleting', 'deleted'].includes(cache.estado)) {
    const r = 'Es el bono opcional: si creas la caché en ElastiCache, suma puntos extra (sin pasar de 100). No hacerla no te quita puntos.';
    return [check('existe', tExiste, 6, false, r), check('motor', tMotor, 2, false, r), check('vpc', tVpc, 2, false, r)];
  }
  const exacta = cache.nombre === x.cache;
  const lista_ = cache.estado === 'available';
  const okExiste = exacta && lista_;
  const rExiste = okExiste
    ? `Tu caché ${x.cache} guarda en memoria lo que más se pide: responde en microsegundos y la base descansa.`
    : !exacta
      ? `Tu caché se llama «${cache.nombre}»; se pidió «${x.cache}». Crea otra con el nombre correcto.`
      : `Tu caché está en estado ${cache.estado}. Tarda unos 20 segundos en quedar Available.`;
  const okMotor = cache.despliegue === 'serverless' && ['valkey', 'redis'].includes(cache.motor);
  const rMotor = okMotor
    ? `Serverless con ${cache.motor === 'valkey' ? 'Valkey' : 'Redis OSS'}: no eliges servidores, crece y se reparte en varias zonas sola.`
    : cache.motor === 'memcached'
      ? 'Tu caché usa Memcached; se pidió Valkey o Redis OSS, que además guardan estructuras como listas ordenadas (perfectas para un ranking de puntajes).'
      : 'Tu caché es «Design your own cache» (eliges nodos a mano); se pidió Serverless, que escala sola.';
  const app = appDe(estado, x);
  const okVpc = Boolean(app && cache.vpcId === app.vpcId);
  const rVpc = okVpc
    ? `La caché vive en ${cache.vpcId}, la VPC de ${x.app}: la app la alcanza por la red privada.`
    : app
      ? `Tu caché está en ${cache.vpcId} y ${x.app} en ${app.vpcId}: la app no la alcanzaría. Créala en la VPC por omisión.`
      : `La instancia ${x.app} ya no existe, así que no hay app que use la caché.`;
  return [check('existe', tExiste, 6, okExiste, rExiste), check('motor', tMotor, 2, okMotor, rMotor), check('vpc', tVpc, 2, okVpc, rVpc)];
}

/* ============================================================== revisar */

export function revisar(estadoOriginal, datos) {
  const estado = preparar(estadoOriginal);
  const x = datosLab(datos);
  const b = elegirBase(estado, x);
  return armar(LAB.tareas(datos), {
    rds: checksRds(estado, x, b),
    seguridad: checksSeguridad(estado, x, b),
    respaldos: checksRespaldos(estado, x, b),
    replica: checksReplica(estado, x, b),
    dynamo: checksDynamo(estado, x),
    cache: checksCache(estado, x)
  });
}

/* ============================================================= solución */

const MINUTO = 60_000;
const pasar = (e, ms) => avanzar(e, reloj.ahora() + ms);

/** La cuenta resuelta, hecha solo con acciones del modelo (como en la consola). */
export function solucion(datos) {
  const x = datosLab(datos);
  const e = LAB.estadoInicial(datos);
  const vpc = e.vpcs.find((v) => v.porDefecto);
  const sgApp = e.gruposSeguridad.find((g) => g.nombre === x.sgApp);

  // seguridad: el grupo de la base, con MySQL solo desde app-sg
  const sgDb = crearGrupoSeguridad(e, {
    nombre: x.sgDb,
    descripcion: 'MySQL solo desde la app',
    vpcId: vpc.id,
    entrada: [{ protocolo: 'tcp', desde: x.puerto, hasta: x.puerto, origen: sgApp.id }]
  });

  // rds: MySQL Multi-AZ, privada, con la retención pedida
  crearBaseRds(e, {
    metodo: 'standard',
    motor: 'mysql',
    plantilla: 'devtest',
    despliegue: 'multiaz',
    id: x.db,
    usuario: 'admin',
    contrasena: 'EscuelaNube2026',
    clase: 'db.t3.micro',
    almacenamiento: { tipo: 'gp3', gib: 20, autoescalado: true, maximo: 1000 },
    vpcId: vpc.id,
    publica: false,
    gruposSeguridad: [sgDb.id],
    retencion: x.retencion
  });
  pasar(e, MINUTO);

  // respaldos: el snapshot manual
  tomarSnapshotRds(e, { baseId: x.db, nombre: x.snap });
  pasar(e, 2 * MINUTO);

  // réplica en otra zona
  const base = instanciaRdsDe(e, x.db);
  const otra = zonasDeGrupoRds(e, grupoSubredesRdsDe(e, base.grupoSubredes)).find((z) => z !== base.zona);
  crearReplicaRds(e, x.db, { id: x.replica, zona: otra });

  // dynamo: la tabla, los ítems y la Query en la tabla de la escuela
  crearTablaDynamo(e, { nombre: x.tabla, pk: { nombre: x.pk, tipo: 'S' }, modo: 'PAY_PER_REQUEST' });
  pasar(e, 3 * MINUTO);
  ponerItemDynamo(e, x.tabla, { jugador: { S: 'ana' }, puntaje: { N: '950' } });
  ponerItemDynamo(e, x.tabla, { jugador: { S: 'luis' }, puntaje: { N: '720' }, nivel: { S: 'experto' } });
  const q = consultarTabla(e, x.tablaEscuela, { pk: x.matricula, sk: { condicion: 'EQ', valor: x.materia } });
  const encontrada = q.items[0].calificacion.N;
  ponerItemDynamo(e, x.tabla, { jugador: { S: x.sufijo }, puntaje: { N: encontrada } });

  // bono: la caché serverless
  crearCacheElasticache(e, { nombre: x.cache, motor: 'valkey', despliegue: 'serverless', vpcId: vpc.id });

  pasar(e, 60 * MINUTO);
  return e;
}
