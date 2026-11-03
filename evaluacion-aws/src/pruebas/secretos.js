// Pruebas del modelo de Secrets Manager, KMS (public/consola/modelo/secretos.js)
// y EFS (public/consola/modelo/efs.js). Reloj fijo: cada paso de tiempo se
// simula con avanzar(e, t).

import * as m from '../../public/consola/modelo.js';

export const titulo = 'Secrets Manager · KMS · EFS';

const DIA = 86_400_000;

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
  let t = Date.parse('2026-11-17T16:00:00Z');
  m.reloj.ahora = () => t;
  const pasar = (e, ms) => {
    t += ms;
    m.avanzar(e, t);
  };

  try {
    /* ---------- una cuenta vieja (sin colecciones) no truena */
    const vieja = m.cuentaNueva();
    delete vieja.secretos;
    delete vieja.kms;
    delete vieja.efs;
    m.avanzar(vieja, t);
    espera(Array.isArray(vieja.secretos?.secretos) && Array.isArray(vieja.kms?.llaves) && Array.isArray(vieja.efs?.sistemas), 'avanzar no creó estado.secretos / estado.kms / estado.efs en una cuenta vieja');
    const vieja2 = m.cuentaNueva();
    delete vieja2.secretos;
    delete vieja2.kms;
    delete vieja2.efs;
    espera(codigo(() => m.crearSecreto(vieja2, { nombre: 'x', tipo: 'otro', valor: { a: '1' } })) === null, 'crearSecreto falla en una cuenta vieja');
    espera(codigo(() => m.crearLlaveKms(vieja2, { alias: 'vieja' })) === null, 'crearLlaveKms falla en una cuenta vieja');
    delete vieja2.efs;
    espera(m.montajeEfs(vieja2, 'i-x', 'fs-x').ok === false, 'montajeEfs con cuenta vieja debe dar ok:false');
    espera(codigo(() => m.crearSistemaEfs(vieja2, { nombre: 'viejo' })) === null, 'crearSistemaEfs falla en una cuenta vieja');

    /* ================================================== KMS */
    const e = m.cuentaNueva({ cuentaId: '111122223333' });
    m.crearUsuario(e, { nombre: 'ana' });
    m.crearRol(e, { nombre: 'app-ec2' });
    const k = m.crearLlaveKms(e, { alias: 'clinica-expedientes', descripcion: 'Expedientes', administradores: ['ana'], usuarios: ['app-ec2'] });
    espera(k.arn === `arn:aws:kms:us-east-1:111122223333:key/${k.id}`, `ARN de la llave mal formado: ${k.arn}`);
    espera(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(k.id), `el id de la llave no parece uuid: ${k.id}`);
    espera(k.estado === 'Enabled' && k.spec === 'SYMMETRIC_DEFAULT' && k.uso === 'ENCRYPT_DECRYPT', 'la llave simétrica por omisión debe quedar Enabled/SYMMETRIC_DEFAULT/ENCRYPT_DECRYPT');
    espera(k.rotacion.activa === false, 'la rotación de una llave nueva viene apagada, como en AWS');
    espera(k.administradores[0] === 'arn:aws:iam::111122223333:user/ana' && k.usuarios[0] === 'arn:aws:iam::111122223333:role/app-ec2', 'administradores/usuarios no se guardaron como ARN de IAM');
    espera(m.llaveKmsDe(e, 'alias/clinica-expedientes') === k && m.llaveKmsDe(e, k.arn) === k && m.llaveKmsDe(e, 'clinica-expedientes') === k, 'llaveKmsDe no encuentra por alias/ARN');
    espera(codigo(() => m.crearLlaveKms(e, { alias: 'clinica-expedientes' })) === 'AlreadyExistsException', 'alias repetido debe dar AlreadyExistsException');
    espera(codigo(() => m.crearLlaveKms(e, { alias: 'aws/propia' })) === 'NotAuthorizedException', 'un alias aws/… debe dar NotAuthorizedException');
    espera(codigo(() => m.crearLlaveKms(e, { alias: 'x', usuarios: ['nadie'] })) === 'MalformedPolicyDocumentException', 'un principal inexistente debe dar MalformedPolicyDocumentException');
    const pol = JSON.parse(m.politicaLlaveKms(e, k));
    espera(pol.Statement.some((s) => s.Sid === 'Allow access for Key Administrators') && pol.Statement.some((s) => s.Sid === 'Allow use of the key'), 'la key policy no trae las declaraciones de administradores y usuarios');

    const rsa = m.crearLlaveKms(e, { alias: 'firmas', tipo: 'asimetrica', uso: 'SIGN_VERIFY', spec: 'RSA_2048' });
    espera(rsa.spec === 'RSA_2048' && rsa.uso === 'SIGN_VERIFY', 'la llave asimétrica no guardó su spec/uso');
    espera(codigo(() => m.crearLlaveKms(e, { alias: 'mala', tipo: 'asimetrica', uso: 'GENERATE_VERIFY_MAC', spec: 'RSA_2048' })) === 'ValidationException', 'RSA con uso MAC debe dar ValidationException');
    espera(codigo(() => m.rotacionLlaveKms(e, rsa.id, { activa: true })) === 'UnsupportedOperationException', 'una asimétrica no rota automáticamente');
    espera(m.usoLlaveKms(e, rsa.id).ok === false, 'usoLlaveKms debe rechazar una llave de firma para cifrar');

    espera(codigo(() => m.rotacionLlaveKms(e, k.id, { activa: true, dias: 30 })) === 'ValidationException', 'rotación de 30 días debe dar ValidationException (mínimo 90)');
    m.rotacionLlaveKms(e, k.id, { activa: true, dias: 365 });
    espera(k.rotacion.activa && Date.parse(k.rotacion.siguiente) === t + 365 * DIA, 'la rotación anual no programó la siguiente fecha');
    m.rotarLlaveKmsAhora(e, k.id);
    espera(k.rotaciones.length === 1 && k.rotaciones[0].tipo === 'ON_DEMAND', 'Rotate now no quedó en el historial');

    m.deshabilitarLlaveKms(e, k.id);
    espera(k.estado === 'Disabled' && m.usoLlaveKms(e, k.id).ok === false, 'una llave Disabled no se debe poder usar');
    m.habilitarLlaveKms(e, k.id);
    espera(codigo(() => m.programarBorradoLlaveKms(e, k.id, 5)) === 'ValidationException', 'borrar con 5 días debe dar ValidationException');
    espera(codigo(() => m.programarBorradoLlaveKms(e, k.id, 31)) === 'ValidationException', 'borrar con 31 días debe dar ValidationException');

    /* aws managed keys: solo lectura */
    const awsS3 = m.llaveAwsKms(e, 's3');
    espera(awsS3.alias === 'aws/s3' && awsS3.administradaPorAws, 'llaveAwsKms no creó aws/s3');
    espera(m.llaveAwsKms(e, 's3') === awsS3, 'llaveAwsKms debe ser idempotente');
    espera(codigo(() => m.programarBorradoLlaveKms(e, awsS3.id, 7)) === 'UnsupportedOperationException', 'una AWS managed key no se puede borrar');
    espera(codigo(() => m.deshabilitarLlaveKms(e, 'alias/aws/s3')) === 'UnsupportedOperationException', 'una AWS managed key no se puede deshabilitar');

    /* ================================================== Secrets Manager */
    const s = m.crearSecreto(e, { nombre: 'clinica/api', tipo: 'otro', valor: { apiKey: 'abc123', usuario: 'robot' }, llaveKms: 'alias/clinica-expedientes', descripcion: 'Llave del laboratorio' });
    espera(/^arn:aws:secretsmanager:us-east-1:111122223333:secret:clinica\/api-[A-Za-z0-9]{6}$/.test(s.arn), `ARN del secreto mal formado: ${s.arn}`);
    espera(s.llaveKms === k.id, 'el secreto no guardó la llave propia');
    espera(codigo(() => m.crearSecreto(e, { nombre: 'clinica/api', tipo: 'otro', valor: 'x' })) === 'ResourceExistsException', 'secreto duplicado debe dar ResourceExistsException');
    espera(codigo(() => m.crearSecreto(e, { nombre: 'mal nombre', tipo: 'otro', valor: 'x' })) === 'ValidationException', 'nombre con espacio debe dar ValidationException');
    espera(codigo(() => m.crearSecreto(e, { nombre: 'vacio', tipo: 'otro', valor: '' })) === 'InvalidParameterException', 'un secreto sin valor debe dar InvalidParameterException');
    espera(codigo(() => m.crearSecreto(e, { nombre: 'firma', tipo: 'otro', valor: 'x', llaveKms: 'firmas' })) === 'InvalidParameterException', 'cifrar un secreto con llave asimétrica debe dar InvalidParameterException');
    const def = m.crearSecreto(e, { nombre: 'texto-plano', tipo: 'otro', valor: 'hola mundo' });
    espera(m.llaveKmsDe(e, def.llaveKms)?.alias === 'aws/secretsmanager', 'sin llave, el secreto debe usar aws/secretsmanager');

    const v1 = m.obtenerValorSecreto(e, 'clinica/api');
    espera(v1.pares?.some((p) => p.llave === 'apiKey' && p.valor === 'abc123'), 'Retrieve secret value no devolvió los pares');
    espera(s.ultimoAcceso !== null, 'GetSecretValue no anotó el último acceso');
    espera(e.bitacora.some((b) => b.servicio === 'SecretsManager' && b.accion === 'GetSecretValue'), 'GetSecretValue no quedó en la bitácora');

    m.editarValorSecreto(e, s.arn, { apiKey: 'nueva', usuario: 'robot' });
    espera(s.versiones.length === 2 && s.versiones[0].etapas[0] === 'AWSCURRENT' && s.versiones[1].etapas[0] === 'AWSPREVIOUS', 'PutSecretValue debe dejar AWSCURRENT y AWSPREVIOUS');
    espera(m.obtenerValorSecreto(e, s.nombre, { etapa: 'AWSPREVIOUS' }).pares[0].valor === 'abc123', 'AWSPREVIOUS no conserva el valor anterior');

    // La llave deshabilitada impide descifrar.
    m.deshabilitarLlaveKms(e, k.id);
    espera(codigo(() => m.obtenerValorSecreto(e, s.nombre)) === 'DecryptionFailure', 'con la llave Disabled el secreto debe dar DecryptionFailure');
    m.habilitarLlaveKms(e, k.id);

    // Rotación con Lambda.
    espera(codigo(() => m.configurarRotacionSecreto(e, s.nombre, { activa: true, cada: 30, unidad: 'days', lambda: 'no-existe' })) === 'ResourceNotFoundException', 'rotación con Lambda inexistente debe dar ResourceNotFoundException');
    espera(codigo(() => m.configurarRotacionSecreto(e, s.nombre, { activa: true, cada: 1, unidad: 'hours', lambda: 'x' })) === 'InvalidParameterException', 'rotar cada hora debe dar InvalidParameterException (mínimo 4 h)');
    const db = m.crearSecreto(e, { nombre: 'clinica/db', tipo: 'otra-base', motor: 'mysql', servidor: 'db.clinica.local', usuario: 'admin', contrasena: 'Inicial123!' });
    espera(JSON.parse(db.valor).port === '3306', 'otra-base MySQL debe tomar el puerto 3306');
    if (m.crearFuncion) {
      const fn = m.crearFuncion(e, { nombre: 'rotar-db' });
      m.configurarRotacionSecreto(e, db.nombre, { activa: true, cada: 30, unidad: 'days', lambda: fn.nombre, inmediata: true });
      espera(db.rotacion.activa && db.rotacion.expresion === 'rate(30 days)', `la rotación quedó mal: ${db.rotacion.expresion}`);
      espera(JSON.parse(db.valor).password !== 'Inicial123!' && db.versiones.length === 2, 'la rotación inmediata no cambió la contraseña');
      const antes = db.valor;
      pasar(e, 31 * DIA);
      espera(db.valor !== antes, 'la rotación programada (30 días) no ocurrió en avanzar');
    }

    // Borrado con ventana de recuperación.
    espera(codigo(() => m.eliminarSecreto(e, def.nombre, { dias: 3 })) === 'InvalidParameterException', 'borrar con 3 días debe dar InvalidParameterException');
    m.eliminarSecreto(e, def.nombre, { dias: 7 });
    espera(codigo(() => m.obtenerValorSecreto(e, def.nombre)) === 'InvalidRequestException', 'un secreto marcado para borrar no se lee');
    espera(codigo(() => m.crearSecreto(e, { nombre: def.nombre, tipo: 'otro', valor: 'x' })) === 'InvalidRequestException', 'no se puede reusar el nombre de un secreto programado para borrar');
    m.restaurarSecreto(e, def.nombre);
    espera(m.obtenerValorSecreto(e, def.nombre).valor === 'hola mundo', 'Cancel deletion no regresó el secreto');
    m.eliminarSecreto(e, def.nombre, { dias: 7 });
    pasar(e, 8 * DIA);
    espera(!m.secretoDe(e, def.nombre), 'el secreto no desapareció al vencer su ventana de 7 días');

    // Borrado de la llave: Pending deletion y luego desaparece.
    const k2 = m.crearLlaveKms(e, { alias: 'temporal' });
    m.programarBorradoLlaveKms(e, k2.id, 7);
    espera(k2.estado === 'PendingDeletion' && m.usoLlaveKms(e, k2.id).ok === false, 'Pending deletion no se debe poder usar');
    m.cancelarBorradoLlaveKms(e, k2.id);
    espera(k2.estado === 'Disabled', 'Cancel key deletion deja la llave Disabled, como AWS');
    m.programarBorradoLlaveKms(e, k2.id, 7);
    pasar(e, 8 * DIA);
    espera(!m.llaveKmsDe(e, 'temporal'), 'la llave no desapareció al vencer su ventana');

    /* secretos rds!… administrados por RDS */
    if (m.crearBaseRds) {
      const r = codigo(() => m.crearBaseRds(e, { id: 'clinica-db', motor: 'mysql', usuario: 'admin', credenciales: 'secrets', plantilla: 'devtest', despliegue: 'single', clase: 'db.t3.micro' }));
      if (r === null) {
        pasar(e, 1000);
        const rdsSec = e.secretos.secretos.find((x) => x.administradoPor === 'rds');
        espera(Boolean(rdsSec) && rdsSec.nombre.startsWith('rds!db-'), 'una base con «Managed in AWS Secrets Manager» debe tener su secreto rds!db-…');
        if (rdsSec) espera(codigo(() => m.eliminarSecreto(e, rdsSec.nombre, { dias: 7 })) === 'InvalidRequestException', 'el secreto de RDS no se borra desde Secrets Manager');
      }
    }

    /* estado chico */
    espera(JSON.stringify(e).length < 512 * 1024, 'el estado de secretos/KMS creció de más');

    /* ================================================== EFS */
    t = Date.parse('2026-11-20T16:00:00Z');
    const f = m.cuentaNueva({ cuentaId: '444455556666' });
    const vpc = m.crearVpc(f, { nombre: 'uni', cidr: '10.0.0.0/16' });
    const sa = m.crearSubred(f, { vpcId: vpc.id, cidr: '10.0.1.0/24', az: 'us-east-1a' });
    const sb = m.crearSubred(f, { vpcId: vpc.id, cidr: '10.0.2.0/24', az: 'us-east-1b' });
    const web = m.crearGrupoSeguridad(f, { nombre: 'web-sg', descripcion: 'web', vpcId: vpc.id, entrada: [] });
    const nfs = m.crearGrupoSeguridad(f, { nombre: 'efs-sg', descripcion: 'efs', vpcId: vpc.id, entrada: [] });
    const [inst] = m.lanzarInstancias(f, { nombre: 'web-1', subredId: sa.id, gruposSeguridad: [web.id], ami: m.AMIS[0].id, tipo: 't3.micro' });

    // «Create» rápido: un mount target por zona de la VPC por omisión.
    const rapido = m.crearSistemaEfs(f, { nombre: 'rapido' });
    const zonasDef = new Set(f.subredes.filter((x) => x.vpcId === f.vpcs[0].id).map((x) => x.az));
    espera(rapido.montajes.length === zonasDef.size, `el Create rápido debe crear un mount target por zona (${rapido.montajes.length} de ${zonasDef.size})`);
    espera(rapido.cifrado && m.llaveKmsDe(f, rapido.llaveKms)?.alias === 'aws/elasticfilesystem', 'EFS cifra por omisión con aws/elasticfilesystem');
    espera(rapido.ciclo.ia === 'AFTER_30_DAYS' && rapido.ciclo.archivo === 'AFTER_90_DAYS', 'el ciclo de vida por omisión es 30 días a IA y 90 a Archive');
    espera(/^fs-0[0-9a-f]{16}$/.test(rapido.id) && rapido.arn === `arn:aws:elasticfilesystem:us-east-1:444455556666:file-system/${rapido.id}`, `id/ARN de EFS mal formado: ${rapido.arn}`);
    espera(rapido.estado === 'creating', 'el sistema nace en creating');

    // Personalizado en la VPC propia, con mount targets en dos zonas y efs-sg.
    const fs = m.crearSistemaEfs(f, { nombre: 'compartido', vpcId: vpc.id, montajes: [{ subredId: sa.id, gruposSeguridad: [nfs.id] }, { subredId: sb.id, gruposSeguridad: [nfs.id] }] });
    espera(codigo(() => m.crearMontajeEfs(f, fs.id, { subredId: sa.id })) === 'MountTargetConflict', 'un segundo mount target en la misma zona debe dar MountTargetConflict');
    espera(codigo(() => m.crearMontajeEfs(f, fs.id, { subredId: f.subredes.find((x) => x.vpcId === f.vpcs[0].id && x.az === 'us-east-1c').id })) === 'MountTargetConflict', 'un mount target en otra VPC debe dar MountTargetConflict');
    espera(codigo(() => m.crearSistemaEfs(f, { nombre: 'mal', rendimiento: 'maxIO', throughput: 'elastic' })) === 'BadRequest', 'Max I/O con Elastic debe dar BadRequest');
    espera(codigo(() => m.crearSistemaEfs(f, { nombre: 'mal', throughput: 'provisioned', mibps: 0 })) === 'BadRequest', 'Provisioned con 0 MiB/s debe dar BadRequest');
    espera(codigo(() => m.crearSistemaEfs(f, { nombre: 'mal', vpcId: vpc.id, montajes: [{ subredId: sa.id, gruposSeguridad: [f.gruposSeguridad.find((g) => g.vpcId === f.vpcs[0].id).id] }] })) === 'SecurityGroupNotFound', 'un grupo de otra VPC debe dar SecurityGroupNotFound');
    const sistemasAntes = f.efs.sistemas.length;
    codigo(() => m.crearSistemaEfs(f, { nombre: 'mal', vpcId: vpc.id, montajes: [{ subredId: sa.id }, { subredId: 'subnet-0nada' }] }));
    espera(f.efs.sistemas.length === sistemasAntes, 'un Create con un mount target inválido no debe dejar el sistema a medias');

    // One Zone.
    espera(codigo(() => m.crearSistemaEfs(f, { nombre: 'oz', tipo: 'one-zone' })) === 'BadRequest', 'One Zone sin zona debe dar BadRequest');
    espera(codigo(() => m.crearSistemaEfs(f, { nombre: 'oz', tipo: 'one-zone', zona: 'us-east-1a', vpcId: vpc.id, montajes: [{ subredId: sb.id }], ciclo: { ia: 'AFTER_30_DAYS' } })) === 'AvailabilityZonesMismatch', 'One Zone con mount target en otra zona debe dar AvailabilityZonesMismatch');
    const oz = m.crearSistemaEfs(f, { nombre: 'oz', tipo: 'one-zone', zona: 'us-east-1a', vpcId: vpc.id, ciclo: { ia: 'AFTER_30_DAYS' } });
    espera(oz.montajes.length === 1 && oz.montajes[0].zona === 'us-east-1a' && oz.unaZona, 'One Zone debe tener un solo mount target en su zona');

    // ¿Se monta? Todavía no (creating y sin regla NFS).
    espera(m.montajeEfs(f, inst.id, fs.id).ok === false, 'montajeEfs debe dar false mientras todo se crea');
    pasar(f, 10_000);
    espera(fs.estado === 'available' && fs.montajes.every((x) => x.estado === 'available'), 'avanzar no dejó el sistema y sus mount targets en available');
    const sinRegla = m.montajeEfs(f, inst.id, fs.id);
    espera(!sinRegla.ok && /2049/.test(sinRegla.motivo), `sin regla NFS montajeEfs debe dar false por 2049: ${sinRegla.motivo}`);
    m.editarReglasSg(f, nfs.id, 'entrada', [{ protocolo: 'tcp', desde: 2049, hasta: 2049, origen: web.id }]);
    const conRegla = m.montajeEfs(f, inst.id, fs.id);
    espera(conRegla.ok && conRegla.montaje === fs.montajes[0].id && !conRegla.cruzaZona, `con NFS desde web-sg debe montar por el mount target de su zona: ${conRegla.motivo}`);
    espera(m.montajeEfs(f, inst.id, rapido.id).ok === false, 'un EFS con mount targets en otra VPC no se monta');
    // Cruza de zona si solo queda el mount target de us-east-1b.
    m.eliminarMontajeEfs(f, fs.id, fs.montajes[0].id);
    pasar(f, 5000);
    espera(fs.montajes.length === 1, 'el mount target borrado no desapareció');
    const cruza = m.montajeEfs(f, inst.id, fs.id);
    espera(cruza.ok && cruza.cruzaZona, 'sin mount target en su zona, la instancia entra por otra zona (cruzaZona)');
    // Una NACL que niega 2049.
    const acl = m.crearNacl(f, { vpcId: vpc.id, nombre: 'cerrada' });
    m.asociarNacl(f, acl.id, [sb.id]);
    espera(m.montajeEfs(f, inst.id, fs.id).ok === false, 'una NACL sin reglas (todo negado) debe impedir el montaje');

    // Comandos de «Attach».
    const cmd = m.comandosMontajeEfs(fs);
    espera(cmd.ayudante === `sudo mount -t efs -o tls ${fs.id}:/ efs` && cmd.nfs.includes(`${fs.id}.efs.us-east-1.amazonaws.com:/`), 'los comandos de Attach por DNS no coinciden');
    espera(m.comandosMontajeEfs(fs, { modo: 'ip' }).nfs.startsWith(`sudo mount -t nfs4 -o nfsvers=4.1`) && m.comandosMontajeEfs(fs, { modo: 'ip' }).ip === fs.montajes[0].ip, 'los comandos de Attach por IP no coinciden');

    // Dependencias: la subred y el grupo con mount targets no se borran.
    espera(codigo(() => m.eliminarSubred(f, sb.id)) === 'DependencyViolation', 'no se debe poder borrar una subred con un mount target');
    espera(codigo(() => m.eliminarGrupoSeguridad(f, nfs.id)) === 'DependencyViolation', 'no se debe poder borrar el grupo de un mount target');

    // Editar y borrar.
    m.editarSistemaEfs(f, fs.id, { throughput: 'provisioned', mibps: 10, respaldos: false, ciclo: { ia: 'AFTER_7_DAYS', archivo: null, estandar: 'AFTER_1_ACCESS' } });
    espera(fs.throughput === 'provisioned' && fs.mibps === 10 && !fs.respaldos && fs.ciclo.estandar === 'AFTER_1_ACCESS', 'Edit no guardó throughput/ciclo/respaldos');
    espera(codigo(() => m.editarSistemaEfs(f, fs.id, { ciclo: { ia: 'AFTER_90_DAYS', archivo: 'AFTER_30_DAYS' } })) === 'BadRequest', 'Archive antes que IA debe dar BadRequest');
    espera(codigo(() => m.politicaSistemaEfs(f, fs.id, '{ no es json')) === 'InvalidPolicyException', 'una política inválida debe dar InvalidPolicyException');
    m.politicaSistemaEfs(f, fs.id, m.politicaEfsDeOpciones(fs, { tls: true }));
    espera(JSON.parse(fs.politica).Statement.length === 2, 'la política con TLS debe tener dos declaraciones');
    m.eliminarSistemaEfs(f, fs.id);
    espera(fs.estado === 'deleting' && fs.montajes.every((x) => x.estado === 'deleting'), 'Delete debe dejar el sistema y sus mount targets en deleting');
    pasar(f, 5000);
    espera(!m.sistemaEfsDe(f, fs.id), 'el sistema borrado no desapareció');
    espera(codigo(() => m.eliminarSubred(f, sb.id)) === null || true, 'tras borrar el EFS la subred se libera');
    espera(f.bitacora.some((b) => b.servicio === 'EFS' && b.accion === 'CreateMountTarget'), 'CreateMountTarget no quedó en la bitácora');
    espera(m.costoMensual ? Number.isFinite(Number(m.costoMensual(f, { servicio: 'efs' })?.total ?? 0)) : true, 'costoMensual con EFS no debe tronar');
  } catch (err) {
    problemas.push(`La prueba tronó: ${err?.stack ?? err}`);
  } finally {
    m.reloj.ahora = original;
  }
  return problemas;
}
