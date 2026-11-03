// Pruebas del modelo de Aurora and RDS y de ElastiCache (public/consola/modelo/rds.js).
// Reloj fijo: cada paso de tiempo se simula con avanzar(e, t).

import * as m from '../../public/consola/modelo.js';

export const titulo = 'Aurora and RDS · ElastiCache';

export async function probar() {
  const problemas = [];
  const espera = (cond, texto) => {
    if (!cond) problemas.push(texto);
  };
  /** Corre fn y regresa el código del ErrorAws (o null si no falló). */
  const codigo = (fn) => {
    try {
      fn();
      return null;
    } catch (e) {
      if (e?.name !== 'ErrorAws') problemas.push(`Error inesperado (no ErrorAws): ${e?.stack ?? e}`);
      return e.codigo;
    }
  };

  const original = m.reloj.ahora;
  let t = Date.parse('2026-11-10T16:00:00Z');
  m.reloj.ahora = () => t;
  const pasar = (e, ms) => {
    t += ms;
    m.avanzar(e, t);
  };

  try {
    /* ---------- una cuenta vieja (sin colecciones) no truena */
    const vieja = m.cuentaNueva();
    delete vieja.rds;
    delete vieja.elasticache;
    m.avanzar(vieja, t);
    espera(Array.isArray(vieja.rds?.instancias) && Array.isArray(vieja.elasticache?.caches), 'avanzar no creó estado.rds / estado.elasticache en una cuenta vieja');
    delete vieja.rds;
    espera(m.conexionBase(vieja, 'i-x', 'db').ok === false, 'conexionBase con cuenta vieja debe dar ok:false');
    const vieja2 = m.cuentaNueva();
    delete vieja2.rds;
    espera(codigo(() => m.crearGrupoSubredesRds(vieja2, { nombre: 'x', descripcion: 'd', vpcId: vieja2.vpcs[0].id, subredes: vieja2.subredes.slice(0, 2).map((s) => s.id) })) === null, 'crearGrupoSubredesRds falla en una cuenta vieja');

    /* ---------- subnet groups */
    const e = m.cuentaNueva({ cuentaId: '111122223333' });
    const vpc = m.crearVpc(e, { nombre: 'escuela', cidr: '10.0.0.0/16' });
    const s1 = m.crearSubred(e, { vpcId: vpc.id, cidr: '10.0.1.0/24', az: 'us-east-1a' });
    const s2 = m.crearSubred(e, { vpcId: vpc.id, cidr: '10.0.2.0/24', az: 'us-east-1a' });
    const s3 = m.crearSubred(e, { vpcId: vpc.id, cidr: '10.0.3.0/24', az: 'us-east-1b' });
    espera(codigo(() => m.crearGrupoSubredesRds(e, { nombre: 'g1', descripcion: 'x', vpcId: vpc.id, subredes: [s1.id, s2.id] })) === 'DBSubnetGroupDoesNotCoverEnoughAZs', 'un subnet group de una sola zona debe dar DBSubnetGroupDoesNotCoverEnoughAZs');
    espera(codigo(() => m.crearGrupoSubredesRds(e, { nombre: 'g1', descripcion: '', vpcId: vpc.id, subredes: [s1.id, s3.id] })) === 'MissingParameter', 'la descripción del subnet group es obligatoria');
    const g = m.crearGrupoSubredesRds(e, { nombre: 'Escuela-Subnets', descripcion: 'privadas', vpcId: vpc.id, subredes: [s1.id, s3.id] });
    espera(g.nombre === 'escuela-subnets', 'el nombre del subnet group se guarda en minúsculas');
    espera(codigo(() => m.crearGrupoSubredesRds(e, { nombre: 'escuela-subnets', descripcion: 'x', vpcId: vpc.id, subredes: [s1.id, s3.id] })) === 'DBSubnetGroupAlreadyExists', 'subnet group duplicado');
    espera(codigo(() => m.eliminarSubred(e, s3.id)) === 'DependencyViolation', 'no se debe poder borrar una subred que está en un subnet group');

    /* ---------- crear una base Multi-AZ en la VPC propia */
    const app = m.crearGrupoSeguridad(e, { nombre: 'app-sg', descripcion: 'app', vpcId: vpc.id, entrada: [] });
    const dbsg = m.crearGrupoSeguridad(e, { nombre: 'db-sg', descripcion: 'db', vpcId: vpc.id, entrada: [{ protocolo: 'tcp', desde: 3306, hasta: 3306, origen: app.id }] });
    const base = { motor: 'mysql', plantilla: 'devtest', despliegue: 'multiaz', id: 'escuela-db', usuario: 'admin', contrasena: 'Secreta123', clase: 'db.t3.micro', almacenamiento: { tipo: 'gp3', gib: 20 }, vpcId: vpc.id, grupoSubredes: 'escuela-subnets', publica: false, gruposSeguridad: [dbsg.id], retencion: 7, protegida: true };
    espera(codigo(() => m.crearBaseRds(e, { ...base, contrasena: 'corta' })) === 'InvalidParameterValue', 'una contraseña de menos de 8 caracteres debe fallar');
    espera(codigo(() => m.crearBaseRds(e, { ...base, contrasena: 'con@arroba1' })) === 'InvalidParameterValue', 'una contraseña con @ debe fallar');
    espera(codigo(() => m.crearBaseRds(e, { ...base, id: '1db' })) === 'InvalidParameterValue', 'un identificador que empieza con número debe fallar');
    espera(codigo(() => m.crearBaseRds(e, { ...base, id: 'mi--db' })) === 'InvalidParameterValue', 'un identificador con -- debe fallar');
    espera(codigo(() => m.crearBaseRds(e, { ...base, almacenamiento: { tipo: 'gp3', gib: 10 } })) === 'InvalidParameterCombination', '10 GiB de gp3 debe fallar');
    espera(codigo(() => m.crearBaseRds(e, { ...base, publica: true })) === 'InvalidVPCNetworkStateFault', 'una base pública en una VPC sin IGW debe fallar');
    const db = m.crearBaseRds(e, base);
    espera(!JSON.stringify(e).includes('Secreta123'), 'la contraseña NO debe guardarse en el estado');
    espera(db.contrasenaDefinida === true, 'contrasenaDefinida debe ser true');
    espera(db.estado === 'creating' && db.multiAz && db.zona !== db.zonaSecundaria && db.zonaSecundaria, 'la base Multi-AZ debe nacer creating con zona secundaria distinta');
    espera(db.endpoint.endsWith('.us-east-1.rds.amazonaws.com') && db.endpoint.startsWith('escuela-db.'), `endpoint con forma rara: ${db.endpoint}`);
    espera(db.arn === 'arn:aws:rds:us-east-1:111122223333:db:escuela-db', `ARN con forma rara: ${db.arn}`);
    espera(codigo(() => m.crearBaseRds(e, base)) === 'DBInstanceAlreadyExists', 'base duplicada');
    espera(codigo(() => m.eliminarGrupoSeguridad(e, dbsg.id)) === 'DependencyViolation', 'no se debe poder borrar el SG que usa una base');
    espera(codigo(() => m.eliminarVpc(e, vpc.id)) === 'DependencyViolation', 'no se debe poder borrar la VPC con una base');

    pasar(e, m.DURACION_RDS.crear);
    espera(db.estado === 'backing-up', `tras 25 s la base debe ir en backing-up (va en ${db.estado})`);
    pasar(e, m.DURACION_RDS.respaldoInicial);
    espera(db.estado === 'available', `tras 30 s la base debe estar available (va en ${db.estado})`);
    espera(e.rds.snapshots.some((s) => s.tipo === 'automated' && s.instanciaId === 'escuela-db'), 'debe existir el snapshot automático inicial');
    espera(m.ventanaRestauracionRds(e, db) !== null, 'una base con retención debe tener ventana de restauración');

    /* ---------- conexionBase */
    const [web] = m.lanzarInstancias(e, { nombre: 'app', subredId: s1.id, gruposSeguridad: [app.id], ipPublica: false });
    espera(m.conexionBase(e, web.id, 'escuela-db').ok === false, 'una instancia pending no debe conectarse');
    pasar(e, 9000);
    const c1 = m.conexionBase(e, web.id, 'escuela-db');
    espera(c1.ok === true && c1.puerto === 3306, `la app con app-sg debe conectarse a la base: ${c1.motivo}`);
    const [otra] = m.lanzarInstancias(e, { nombre: 'otra', subredId: s1.id, nuevoGrupo: { nombre: 'otro', descripcion: 'x', entrada: [] }, ipPublica: false });
    pasar(e, 9000);
    espera(m.conexionBase(e, otra.id, 'escuela-db').ok === false, 'una instancia sin el SG permitido no debe conectarse');
    const [lejos] = m.lanzarInstancias(e, { nombre: 'lejos', gruposSeguridad: [e.gruposSeguridad.find((x) => x.porDefecto && x.vpcId === e.vpcs[0].id).id] });
    pasar(e, 9000);
    espera(/VPC/.test(m.conexionBase(e, lejos.id, 'escuela-db').motivo), 'una instancia de otra VPC debe explicar que son VPC distintas');
    // Por IP privada (CIDR) también vale.
    m.editarReglasSg(e, dbsg.id, 'entrada', [{ protocolo: 'tcp', desde: 3306, hasta: 3306, origen: '10.0.1.0/24' }]);
    espera(m.conexionBase(e, otra.id, 'escuela-db').ok === true, 'una regla por CIDR de la subred debe dejar conectarse');
    m.editarReglasSg(e, dbsg.id, 'entrada', [{ protocolo: 'tcp', desde: 5432, hasta: 5432, origen: app.id }]);
    espera(m.conexionBase(e, web.id, 'escuela-db').ok === false, 'el puerto equivocado (5432 para MySQL) no debe conectar');
    m.editarReglasSg(e, dbsg.id, 'entrada', [{ protocolo: 'tcp', desde: 3306, hasta: 3306, origen: app.id }]);

    /* ---------- réplica, snapshot, modify, failover */
    const sinRespaldo = m.crearBaseRds(e, { ...base, id: 'sin-respaldo', despliegue: 'single', retencion: 0, protegida: false });
    pasar(e, m.DURACION_RDS.crear);
    espera(sinRespaldo.estado === 'available', 'sin respaldos la base pasa directo a available');
    espera(codigo(() => m.crearReplicaRds(e, 'sin-respaldo', { id: 'r0' })) === 'InvalidDBInstanceState', 'una réplica de una base sin respaldos debe dar InvalidDBInstanceState');
    espera(codigo(() => m.restaurarPuntoRds(e, 'sin-respaldo', { id: 'r0' })) === 'InvalidDBInstanceState', 'restaurar sin respaldos debe fallar');
    const rep = m.crearReplicaRds(e, 'escuela-db', { id: 'escuela-db-replica' });
    espera(rep.rol === 'replica' && rep.fuente === 'escuela-db' && db.rol === 'primary' && db.replicas.includes(rep.id), 'la réplica debe quedar ligada a su fuente');
    pasar(e, m.DURACION_RDS.replica);
    espera(rep.estado === 'available', 'la réplica tarda 25 s');
    espera(codigo(() => m.detenerBaseRds(e, 'escuela-db')) === 'InvalidDBInstanceState', 'no se puede detener una base con réplicas');
    espera(codigo(() => m.tomarSnapshotRds(e, { baseId: 'escuela-db', nombre: 'snap_1' })) === 'InvalidParameterValue', 'snapshot con guion bajo debe fallar');
    const snap = m.tomarSnapshotRds(e, { baseId: 'escuela-db', nombre: 'escuela-snap' });
    espera(snap.estado === 'creating' && db.estado === 'backing-up', 'el snapshot nace creating y la base pasa a backing-up');
    espera(codigo(() => m.tomarSnapshotRds(e, { baseId: 'escuela-db', nombre: 'escuela-snap' })) === 'DBSnapshotAlreadyExists', 'snapshot duplicado');
    pasar(e, m.DURACION_RDS.snapshot);
    espera(snap.estado === 'available' && db.estado === 'available', 'el snapshot manual tarda 10 s');
    espera(codigo(() => m.compartirSnapshotRds(e, 'escuela-snap', { publico: true })) === 'InvalidParameterValue', 'un snapshot cifrado no se puede hacer público');

    m.modificarBaseRds(e, 'escuela-db', { clase: 'db.t3.small', retencion: 14 }, { inmediato: false });
    espera(db.pendientes?.clase === 'db.t3.small' && db.clase === 'db.t3.micro', 'sin Apply immediately, la clase queda pendiente');
    pasar(e, m.DURACION_RDS.modificar);
    espera(db.retencion === 14, 'la retención se aplica de inmediato');
    m.aplicarPendientesRds(e, 'escuela-db');
    pasar(e, m.DURACION_RDS.modificar);
    espera(db.clase === 'db.t3.small' && !db.pendientes, 'Apply now aplica la clase pendiente');
    espera(codigo(() => m.modificarBaseRds(e, 'escuela-db', { gib: 10 }, { inmediato: true })) === 'InvalidParameterCombination', 'no se puede reducir el almacenamiento');

    const zonaAntes = db.zona;
    const secundariaAntes = db.zonaSecundaria;
    m.reiniciarBaseRds(e, 'escuela-db', { failover: true });
    espera(db.estado === 'rebooting', 'reboot pone rebooting');
    pasar(e, m.DURACION_RDS.reiniciar);
    espera(db.zona === secundariaAntes && db.zonaSecundaria === zonaAntes && db.estado === 'available', 'el failover intercambia la zona principal y la standby');
    espera(codigo(() => m.reiniciarBaseRds(e, 'sin-respaldo', { failover: true })) === 'InvalidParameterCombination', 'failover en Single-AZ debe fallar');

    /* ---------- restaurar a un punto en el tiempo */
    const pitr = m.restaurarPuntoRds(e, 'escuela-db', { momento: 'latest', id: 'escuela-db-restaurada', grupoSubredes: 'escuela-subnets', gruposSeguridad: [dbsg.id] });
    espera(pitr.id === 'escuela-db-restaurada' && pitr.motor === 'mysql' && pitr.estado === 'creating', 'restore to point in time crea otra base');
    espera(codigo(() => m.restaurarPuntoRds(e, 'escuela-db', { momento: '2020-01-01T00:00:00Z', id: 'vieja' })) === 'InvalidRestoreFault', 'un momento fuera de la ventana debe fallar');
    const desdeSnap = m.restaurarSnapshotRds(e, 'escuela-snap', { id: 'desde-snap' });
    espera(desdeSnap.estado === 'creating', 'restore snapshot crea otra base');

    /* ---------- borrar */
    espera(codigo(() => m.eliminarBaseRds(e, 'escuela-db')) === 'InvalidParameterCombination', 'una base con Deletion protection no se borra');
    m.modificarBaseRds(e, 'escuela-db', { protegida: false }, { inmediato: true });
    m.eliminarBaseRds(e, 'escuela-db', { snapshotFinal: true, nombreSnapshot: 'escuela-final', retenerRespaldos: false });
    espera(db.estado === 'deleting', 'la base pasa a deleting');
    espera(rep.rol === 'instance' && rep.fuente === null, 'al borrar la fuente la réplica se vuelve independiente');
    pasar(e, m.DURACION_RDS.borrar + m.DURACION_RDS.snapshot);
    espera(!m.instanciaRdsDe(e, 'escuela-db'), 'la base borrada debe desaparecer');
    espera(m.snapshotRdsDe(e, 'escuela-final')?.estado === 'available', 'el snapshot final debe quedar available');
    espera(!e.rds.snapshots.some((s) => s.tipo === 'automated' && s.instanciaId === 'escuela-db'), 'sin «Retain automated backups» se borran los automáticos');
    espera(codigo(() => m.eliminarGrupoSubredesRds(e, 'escuela-subnets')) === 'InvalidDBSubnetGroupStateFault', 'no se borra un subnet group en uso');

    /* ---------- Free tier fuerza Single-AZ */
    const libre = m.crearBaseRds(e, { motor: 'postgres', plantilla: 'freetier', despliegue: 'multiaz', id: 'gratis', contrasena: 'Secreta123', clase: 'db.t4g.micro', retencion: 1 });
    espera(libre.multiAz === false && libre.despliegue === 'single' && libre.puerto === 5432 && libre.usuario === 'postgres', 'Free tier debe forzar Single-AZ (y PostgreSQL usa 5432)');
    espera(libre.grupoSubredes === `default-${e.vpcs[0].id}`, 'sin subnet group se crea el default-vpc-… automático');
    pasar(e, 40000);
    espera(codigo(() => m.modificarBaseRds(e, 'gratis', { multiAz: true }, { inmediato: true })) === 'InvalidParameterCombination', 'Free tier no permite pasar a Multi-AZ');
    m.detenerBaseRds(e, 'gratis');
    pasar(e, m.DURACION_RDS.detener);
    espera(libre.estado === 'stopped', 'Stop temporarily deja la base stopped');
    m.arrancarBaseRds(e, 'gratis');
    pasar(e, m.DURACION_RDS.arrancar);
    espera(libre.estado === 'available', 'Start la regresa a available');

    /* ---------- Aurora y Multi-AZ DB cluster */
    const aur = m.crearBaseRds(e, { motor: 'aurora-mysql', plantilla: 'production', id: 'tienda', contrasena: 'Secreta123', clase: 'db.serverless', serverless: { min: 0.5, max: 8 }, replicaAurora: true, retencion: 1 });
    espera(aur.tipo === 'aurora' && aur.miembros.length === 2, 'Aurora con réplica crea escritora y lectora');
    espera(aur.endpoint.startsWith('tienda.cluster-') && aur.endpointLectura.startsWith('tienda.cluster-ro-'), 'Aurora tiene endpoint del clúster y de lectura');
    pasar(e, 40000);
    espera(aur.estado === 'available' && aur.miembros.every((x) => m.instanciaRdsDe(e, x).estado === 'available'), 'el clúster Aurora y sus instancias llegan a available');
    const lectora = aur.miembros.map((x) => m.instanciaRdsDe(e, x)).find((x) => x.rol === 'reader');
    m.failoverClusterRds(e, 'tienda');
    espera(lectora.rol === 'writer', 'failover del clúster vuelve escritora a la lectora');
    pasar(e, m.DURACION_RDS.reiniciar);
    m.agregarLectorAurora(e, 'tienda', { id: 'tienda-lector-2' });
    pasar(e, m.DURACION_RDS.replica);
    espera(aur.miembros.length === 3, 'Add reader agrega una instancia al clúster');
    const csnap = m.tomarSnapshotRds(e, { baseId: 'tienda', nombre: 'tienda-snap' });
    espera(csnap.clusterId === 'tienda', 'el snapshot de un clúster es DB cluster snapshot');
    pasar(e, m.DURACION_RDS.snapshot);
    const maz = m.crearBaseRds(e, { motor: 'postgres', plantilla: 'production', despliegue: 'cluster', id: 'maz', contrasena: 'Secreta123', clase: 'db.m6gd.large', almacenamiento: { tipo: 'io2', gib: 100, iops: 1000 } });
    espera(maz.tipo === 'multiaz' && maz.miembros.length === 3 && new Set(maz.miembros.map((x) => m.instanciaRdsDe(e, x).zona)).size === 3, 'Multi-AZ DB cluster: 3 instancias en 3 zonas');
    espera(codigo(() => m.crearBaseRds(e, { motor: 'mysql', despliegue: 'cluster', id: 'maz2', contrasena: 'Secreta123', clase: 'db.t3.micro' })) === 'InvalidParameterCombination', 'Multi-AZ DB cluster no acepta clases t');
    pasar(e, 40000);
    espera(codigo(() => m.eliminarBaseRds(e, maz.miembros[1])) === 'InvalidParameterCombination', 'no se borra una instancia suelta de un Multi-AZ DB cluster');
    m.eliminarBaseRds(e, 'tienda', { snapshotFinal: false });
    pasar(e, m.DURACION_RDS.borrar);
    espera(!m.clusterRdsDe(e, 'tienda') && !e.rds.instancias.some((i) => i.clusterId === 'tienda'), 'borrar el clúster borra sus instancias');

    /* ---------- Connect to an EC2 compute resource */
    const conectada = m.crearBaseRds(e, { motor: 'mysql', plantilla: 'devtest', id: 'conectada', contrasena: 'Secreta123', conectarEc2: lejos.id, retencion: 0 });
    espera(e.gruposSeguridad.some((x) => x.nombre === 'rds-ec2-1') && lejos.gruposSeguridad.some((sg) => m.grupoDe(e, sg)?.nombre === 'ec2-rds-1'), 'conectar EC2 crea rds-ec2-1 y ec2-rds-1 y se lo pone a la instancia');
    pasar(e, m.DURACION_RDS.crear);
    const c2 = m.conexionBase(e, lejos.id, 'conectada');
    espera(c2.ok, `con «Connect to an EC2 compute resource» la instancia debe conectarse: ${c2.motivo}`);

    /* ---------- ElastiCache */
    const cache = m.crearCacheElasticache(e, { nombre: 'escuela-cache', motor: 'valkey', despliegue: 'serverless' });
    espera(cache.estado === 'creating' && cache.endpoint.includes('.serverless.use1.cache.amazonaws.com'), 'la caché serverless nace creating con su endpoint');
    espera(codigo(() => m.crearCacheElasticache(e, { nombre: 'escuela-cache' })) === 'ServerlessCacheAlreadyExistsFault', 'caché duplicada');
    espera(codigo(() => m.crearCacheElasticache(e, { nombre: '9mal' })) === 'InvalidParameterValue', 'nombre de caché inválido');
    pasar(e, m.DURACION_RDS.cacheCrear);
    espera(cache.estado === 'available', 'la caché tarda 20 s');
    const mc = m.crearCacheElasticache(e, { nombre: 'sesiones', motor: 'memcached', despliegue: 'propio', tipoNodo: 'cache.t4g.micro', nodos: 2 });
    espera(mc.endpoint.includes('.cfg.use1.cache.amazonaws.com') && mc.puerto === 11211, 'Memcached usa el endpoint de configuración y el 11211');
    pasar(e, m.DURACION_RDS.cacheCrear);
    m.eliminarCacheElasticache(e, 'escuela-cache');
    pasar(e, m.DURACION_RDS.cacheBorrar);
    espera(!m.cacheDe(e, 'escuela-cache'), 'la caché borrada desaparece');

    /* ---------- el estado sigue siendo JSON puro y chico */
    const texto = JSON.stringify(e);
    espera(JSON.stringify(JSON.parse(texto)) === texto, 'el estado debe ser JSON puro');
    espera(texto.length < 200_000, `el estado creció demasiado: ${texto.length} bytes`);
    espera(e.rds.eventos.length <= 60, 'los eventos de RDS deben recortarse');
  } catch (err) {
    problemas.push(`La prueba tronó: ${err?.stack ?? err}`);
  } finally {
    m.reloj.ahora = original;
  }
  return problemas;
}
