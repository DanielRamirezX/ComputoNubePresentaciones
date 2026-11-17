// Práctica integradora 2 (sesión 10 de la Ruta AWS) · Seguridad y cumplimiento.
// «La clínica guarda expedientes»: la Clínica San Rafael (Querétaro) ya tiene
// su portal de citas en AWS, pero lo montó un sobrino «que sabía de compus»:
// una cuenta compartida con AdministratorAccess, nadie usa MFA, el bucket de
// expedientes con el bloqueo público apagado, el servidor usando llaves de
// acceso de un usuario y SSH abierto al mundo. El alumno lo deja listo para
// una auditoría: IAM con mínimo privilegio y MFA, una llave propia de KMS con
// rotación, S3 cifrado con KMS, versionado y ciclo de vida a Glacier sin
// borrar antes de 5 años, una base RDS cifrada y privada con su contraseña en
// Secrets Manager, un rol para la instancia, un disco EBS cifrado y un trail
// de CloudTrail. El bono es la rotación automática del secreto.
//
// Datos distintos por alumno: el bucket, la base, el alias de la llave y el
// secreto llevan su sufijo; la VPC es la suya (10.<octeto>.0.0/16); los días
// para pasar a Glacier y el tamaño del disco salen de su octeto.

import { anotar, avanzar, crearGrupoSeguridad, crearBucket, crearLlaveAcceso, crearUsuario, crearVpcCompleta, cuentaNueva, lanzarInstancias, reloj, subirObjetos } from '../consola/modelo.js';
import { esSubredPublica } from '../consola/red.js';
import { c, scriptApache, vinetas } from './util.js';

export function datosLab(d) {
  return {
    sufijo: d.sufijo,
    ipCasa: d.ipCasa,
    // La red que ya existe
    vpcCidr: d.vpcCidr,
    vpcNombre: 'clinica-vpc',
    prefijoVpc: 'clinica',
    app: 'clinica-app',
    sgApp: 'clinica-app-sg',
    userData: scriptApache('Clinica San Rafael', `Portal de citas - consultorio ${d.sufijo}`),
    // IAM
    grupoAuditoria: 'auditoria',
    politicaAuditoria: 'AWSCloudTrail_ReadOnlyAccess',
    auditora: 'paola-auditoria',
    admin: 'luis-sistemas',
    compartido: 'recepcion',
    usuarioApp: 'app-servidor',
    rol: 'clinica-app-rol',
    // KMS
    alias: `expedientes-${d.sufijo}`,
    // S3
    bucket: `clinica-expedientes-${d.sufijo}`,
    diasGlacier: [90, 120, 180, 365][d.octeto % 4],
    diasRetencion: 1825, // 5 años: la NOM-004-SSA3-2012 pide conservar el expediente al menos 5 años
    // RDS
    db: `clinica-db-${d.sufijo}`,
    grupoSubredes: 'clinica-db-privadas',
    sgDb: 'clinica-db-sg',
    secreto: `clinica/db-${d.sufijo}`,
    // EBS
    volumen: 'clinica-estudios',
    volumenGib: 40 + (d.octeto % 5) * 10,
    // CloudTrail
    trail: 'clinica-auditoria'
  };
}

/** Unos expedientes de ejemplo (solo nombres y tamaños: el simulador no guarda el contenido). */
const EXPEDIENTES = [
  { llave: '2023/paciente-0412-garcia.pdf', tamano: 1_845_220 },
  { llave: '2023/paciente-0413-hernandez.pdf', tamano: 2_310_904 },
  { llave: '2024/paciente-0977-martinez.pdf', tamano: 987_112 },
  { llave: '2024/paciente-1021-lopez.pdf', tamano: 3_402_551 },
  { llave: '2025/paciente-1388-ramirez.pdf', tamano: 1_120_448 },
  { llave: '2026/paciente-1702-torres.pdf', tamano: 2_004_316 }
];

export const LAB = {
  id: 'practica-2',
  titulo: 'La clínica guarda expedientes',
  minutos: 85,
  pistas: true,
  // La VPC ya existe: el rango es el suyo, no uno para crear otra.
  etiquetasDatos: { vpcCidr: ['Rango de clinica-vpc', 'Ya existe: no crees otra.'] },
  historia: `
    <p>La <strong>Clínica San Rafael</strong>, en Querétaro, tiene su portal de citas en AWS y guarda ahí los <strong>expedientes clínicos</strong> de sus pacientes (estudios, recetas, notas médicas). Lo montó hace dos años el sobrino de la directora, «que sabía de compus»… y se nota:</p>
    <ul>
      <li>Las cuatro recepcionistas entran con <strong>un mismo usuario</strong> (<code>recepcion</code>) que tiene <strong>AdministratorAccess</strong>.</li>
      <li>Nadie usa <strong>MFA</strong>, ni siquiera la cuenta raíz.</li>
      <li>El bucket de los expedientes tiene el <strong>bloqueo de acceso público apagado</strong> («para mandarle un PDF a un paciente»).</li>
      <li>El servidor <code>clinica-app</code> usa las <strong>llaves de acceso</strong> del usuario <code>app-servidor</code>, copiadas en un archivo, y deja entrar <strong>SSH desde todo internet</strong>.</li>
    </ul>
    <p>En un mes llega una <strong>auditoría</strong>: la ley de protección de datos personales trata los datos de salud como <strong>datos sensibles</strong>, y la <strong>NOM-004-SSA3-2012</strong> pide conservar cada expediente <strong>al menos 5 años</strong>. Te contrataron para dejar la cuenta lista: que cada quien entre con lo justo, que todo lo que guarda datos de pacientes vaya <strong>cifrado</strong>, que nada privado quede expuesto a internet y que quede registro de <strong>quién hizo qué</strong>.</p>
    <p>En tu cuenta ya existen la VPC <code>clinica-vpc</code> (dos subredes públicas y dos privadas, en dos zonas), el servidor <code>clinica-app</code> con su grupo <code>clinica-app-sg</code>, el bucket de expedientes y los usuarios <code>recepcion</code>, <code>luis-sistemas</code> (el encargado de sistemas) y <code>app-servidor</code>. <strong>No borres</strong> el servidor ni el bucket.</p>
    <p>Todo va en <strong>N. Virginia (us-east-1)</strong> y puedes hacer las tareas en el orden que quieras (te conviene crear el rol de la tarea 7 antes de dar permisos a la llave de la tarea 3). Cada tarea pide un <strong>resultado</strong>, no una lista de clics: la pista te dice en qué servicio y pantalla se hace. Crear la base tarda unos 30 segundos: mientras, avanza con otra tarea. La última tarea es un <strong>bono opcional</strong> que suma encima, sin pasar de 100.</p>`,

  estadoInicial(datos) {
    const x = datosLab(datos);
    const e = cuentaNueva(datos);

    // La red que dejó el sobrino: «VPC and more» con dos públicas y dos privadas.
    const red = crearVpcCompleta(e, { prefijo: x.prefijoVpc, cidr: x.vpcCidr, zonas: 2, publicas: 2, privadas: 2, nat: 'none' });

    // El servidor del portal: web abierta (bien) y SSH abierto al mundo (mal).
    const sg = crearGrupoSeguridad(e, {
      nombre: x.sgApp,
      descripcion: 'Portal de citas de la clinica',
      vpcId: red.vpc.id,
      entrada: [
        { protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' },
        { protocolo: 'tcp', desde: 443, hasta: 443, origen: '0.0.0.0/0' },
        { protocolo: 'tcp', desde: 22, hasta: 22, origen: '0.0.0.0/0' }
      ]
    });
    lanzarInstancias(e, { nombre: x.app, ami: 'al2023', tipo: 't3.small', subredId: red.publicas[0].id, ipPublica: true, gruposSeguridad: [sg.id], userData: x.userData });

    // El bucket de expedientes: sin bloqueo público, sin versionado y con SSE-S3.
    crearBucket(e, {
      nombre: x.bucket,
      bloqueoPublico: { aclsNuevas: false, aclsCualquiera: false, politicasNuevas: false, politicasCualquiera: false },
      versionado: false,
      cifrado: 'SSE-S3'
    });
    subirObjetos(e, x.bucket, EXPEDIENTES.map((o) => ({ ...o, tipo: 'application/pdf' })), { prefijo: 'expedientes/' });

    // Los usuarios: la cuenta compartida, el de sistemas y el de la app (con llave de acceso).
    crearUsuario(e, { nombre: x.compartido, consola: true, cambiarContrasena: false, politicas: ['AdministratorAccess'] });
    crearLlaveAcceso(e, x.compartido);
    crearUsuario(e, { nombre: x.admin, consola: true, cambiarContrasena: false, politicas: ['AdministratorAccess'] });
    crearUsuario(e, { nombre: x.usuarioApp, consola: false, politicas: ['AmazonS3FullAccess'] });
    crearLlaveAcceso(e, x.usuarioApp);

    avanzar(e, reloj.ahora() + 60_000);
    e.bitacora = [];
    anotar(e, 'Laboratorio', 'Inicio', 'La cuenta empieza con clinica-vpc, el servidor clinica-app, el bucket de expedientes y los usuarios recepcion, luis-sistemas y app-servidor.');
    return e;
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'personas',
        titulo: 'Cada quien entra con lo justo',
        puntos: 15,
        html: `
          <p>La auditora interna, Paola, necesita revisar <strong>quién hizo qué</strong> en la cuenta, pero <strong>no</strong> debe poder cambiar nada ni abrir los expedientes de los pacientes. Y la cuenta compartida de recepción tiene que desaparecer: las recepcionistas usan el portal de citas, no la consola de AWS.</p>
          ${vinetas([
            `Un grupo ${c(x.grupoAuditoria)} con la política ${c(x.politicaAuditoria)}. Puede tener además ${c('SecurityAudit')}, pero <strong>ninguna</strong> política que cambie cosas ni que lea los datos de los buckets (ni ${c('ReadOnlyAccess')} ni ${c('AmazonS3ReadOnlyAccess')}).`,
            `Una usuaria ${c(x.auditora)} con acceso a la consola, dentro del grupo ${c(x.grupoAuditoria)} y <strong>sin</strong> políticas puestas directo.`,
            `El usuario compartido ${c(x.compartido)} ya no debe poder hacer nada: bórralo (es lo mejor) o déjalo sin políticas, sin grupos, sin contraseña de consola y sin llaves de acceso activas.`
          ])}`,
        pista:
          'Todo está en IAM: User groups → Create group y Users → Create user (marca «Provide user access to the AWS Management Console»). Los permisos se le dan al grupo y la persona los hereda. Para quitar al usuario compartido: Users → selecciónalo → Delete. Piensa en mínimo privilegio: ReadOnlyAccess deja leer TODO, incluidos los PDF de los pacientes.'
      },
      {
        id: 'mfa',
        titulo: 'Una segunda llave para entrar',
        puntos: 10,
        html: `
          <p>Una contraseña robada no debe bastar para entrar a una cuenta con datos de salud.</p>
          ${vinetas([
            `La <strong>cuenta raíz</strong> tiene MFA.`,
            `${c(x.admin)} y ${c(x.auditora)} tienen MFA (y cualquier otro usuario que entre a la consola).`
          ])}`,
        pista:
          'La de la raíz está en el IAM Dashboard → Security recommendations → «Add MFA for root user». La de cada usuario está en IAM → Users → el usuario → pestaña Security credentials → Multi-factor authentication (MFA) → Assign MFA device (elige Authenticator app).'
      },
      {
        id: 'llave',
        titulo: 'La llave de la clínica',
        puntos: 10,
        html: `
          <p>La clínica quiere <strong>su propia llave</strong> de cifrado para los datos de pacientes: decidir quién puede usarla y que se renueve sola.</p>
          ${vinetas([
            `Una llave <strong>customer managed</strong> de KMS, simétrica (<em>Encrypt and decrypt</em>), con el alias ${c(x.alias)}.`,
            '<strong>Rotación automática</strong> activada.',
            `${c(x.admin)} es su <em>key administrator</em>. El rol del servidor (${c(x.rol)}, de la tarea 7) es <em>key user</em> para poder descifrar. La auditora ${c(x.auditora)} <strong>no</strong> es key user: revisa, pero no descifra.`
          ])}`,
        pista:
          'Se hace en Key Management Service (KMS) → Customer managed keys → Create key: Symmetric, Encrypt and decrypt. En los pasos siguientes escribes el alias y eliges los Key administrators y los Key users (los roles aparecen en la misma lista que los usuarios). La rotación se activa después, en la llave → pestaña Key rotation → Edit. Si ya creaste la llave sin el rol, agrégalo en la pestaña Key policy → Key users → Add.'
      },
      {
        id: 'expedientes',
        titulo: 'Los expedientes, a salvo en S3',
        puntos: 15,
        html: `
          <p>El bucket ${c(x.bucket)} guarda los PDF de los expedientes. Debe quedar así:</p>
          ${vinetas([
            'Nadie de internet puede verlos: <strong>todo</strong> el acceso público bloqueado.',
            'Cifrado por omisión con <strong>KMS</strong> (SSE-KMS), para que cada uso de la llave quede registrado.',
            'Si alguien borra o sobrescribe un expediente, se puede recuperar: <strong>versionado</strong> activado.',
            `Los expedientes viejos casi no se consultan: una regla de ciclo de vida activa, para todos los objetos, que los pase a una clase <strong>Glacier</strong> a los ${c(`${x.diasGlacier} días`)}. Y como la NOM-004 pide conservarlos al menos 5 años, <strong>ninguna</strong> regla puede borrarlos (expirarlos) antes de ${c(`${x.diasRetencion} días`)}.`
          ])}`,
        pista:
          'Todo está en S3, dentro del bucket: el bloqueo público en Permissions → Block public access (bucket settings); el versionado y el cifrado (Default encryption) en Properties; el ciclo de vida en Management → Create lifecycle rule (elige «Apply to all objects in the bucket» y «Transition current versions of objects between storage classes»). Glacier Deep Archive es lo más barato, pero tarda horas en devolver un archivo.'
      },
      {
        id: 'base',
        titulo: 'La base de citas, cifrada y privada',
        puntos: 20,
        html: `
          <p>El portal necesita una base de datos para las citas y los datos de contacto de los pacientes. Debe vivir en las <strong>subredes privadas</strong> de ${c(x.vpcNombre)} (${c(x.vpcCidr)}), donde internet no llega.</p>
          ${vinetas([
            `Una base de RDS con motor ${c('MySQL')} o ${c('PostgreSQL')} llamada ${c(x.db)}, en estado <em>Available</em>.`,
            '<strong>Cifrada</strong> en reposo (con KMS).',
            '<strong>Public access: No</strong>.',
            `Un <em>DB subnet group</em> (puedes llamarlo ${c(x.grupoSubredes)}) con <strong>solo</strong> las dos subredes privadas de ${c(x.vpcNombre)}, y la base usándolo.`,
            `Solo el servidor ${c(x.app)} llega al puerto de la base: un grupo de seguridad para la base (puedes llamarlo ${c(x.sgDb)}) con una regla cuyo origen sea el <strong>grupo</strong> ${c(x.sgApp)}, y ninguna regla del puerto de la base abierta a una IP o red.`,
            '<strong>Deletion protection</strong> activada: nadie la borra por accidente.'
          ])}`,
        pista:
          'Primero, en Aurora and RDS → Subnet groups → Create DB subnet group: la VPC clinica-vpc, sus dos zonas y solo las subredes «private» (fíjate en sus nombres o en su tabla de rutas en VPC → Subnets). El grupo de seguridad se crea en EC2 → Security Groups, en clinica-vpc. Luego Databases → Create database (Standard create): en Connectivity eliges la VPC, el subnet group, Public access: No y tu grupo; el cifrado y la protección contra borrado están en Additional configuration. El cifrado solo se elige al crear la base: después ya no se puede cambiar.'
      },
      {
        id: 'secreto',
        titulo: 'La contraseña de la base, fuera del código',
        puntos: 10,
        html: `
          <p>El sobrino tenía la contraseña de la base escrita en un archivo del servidor. Ahora vivirá en un lugar cifrado del que la app la pide cuando la necesita.</p>
          ${vinetas([
            `Un secreto de Secrets Manager de tipo <strong>Credentials for Amazon RDS database</strong> con el usuario y la contraseña de ${c(x.db)} (puedes llamarlo ${c(x.secreto)}).`,
            `Cifrado con <strong>tu llave</strong> ${c(x.alias)}, no con la que trae Secrets Manager por omisión.`
          ])}`,
        pista:
          'Se hace en Secrets Manager → Store a new secret: elige «Credentials for Amazon RDS database», escribe el usuario y la contraseña que pusiste al crear la base, elige tu llave en «Encryption key» y luego tu base en la lista Database. Otra forma: al crear la base con «Managed in AWS Secrets Manager», elige tu llave en «Select the encryption key» y RDS crea el secreto ya cifrado con ella. Usa una contraseña inventada para el simulador, nunca una real.'
      },
      {
        id: 'servidor',
        titulo: 'El servidor, sin llaves a la vista',
        puntos: 12,
        html: `
          <p>Unas llaves de acceso copiadas en un archivo son un regalo para quien entre al servidor. En AWS, un servidor obtiene permisos con un <strong>rol</strong>, que da credenciales temporales que se renuevan solas.</p>
          ${vinetas([
            `Un rol de IAM para <strong>EC2</strong> (puedes llamarlo ${c(x.rol)}) con permiso de S3 (${c('AmazonS3FullAccess')} o ${c('AmazonS3ReadOnlyAccess')}) y <strong>sin</strong> políticas de toda la cuenta (ni ${c('AdministratorAccess')} ni ${c('PowerUserAccess')}), puesto a la instancia ${c(x.app)}.`,
            `El usuario ${c(x.usuarioApp)} ya no tiene llaves de acceso <strong>activas</strong> (desactívalas o bórralas; o borra el usuario).`,
            `Los estudios de laboratorio escaneados irán en un disco aparte: un volumen EBS ${c('gp3')} de ${c(`${x.volumenGib} GiB`)} <strong>cifrado</strong> (puedes llamarlo ${c(x.volumen)}), conectado a ${c(x.app)}.`,
            `Nadie de internet puede intentar entrar por SSH a ${c(x.app)}: quita la regla del puerto 22 abierta a ${c('0.0.0.0/0')} (si quieres conservar SSH, ábrelo solo a tu IP ${c(`${x.ipCasa}/32`)}).`
          ])}`,
        pista:
          'El rol se crea en IAM → Roles → Create role → AWS service → EC2, y se pone en EC2 → Instances → clinica-app → Actions → Security → Modify IAM role. Las llaves de acceso están en IAM → Users → app-servidor → Security credentials → Access keys → Actions. El volumen se crea en EC2 → Elastic Block Store → Volumes → Create volume, en la MISMA zona que clinica-app y con «Encrypt this volume»; luego Actions → Attach volume. El SSH se corrige en EC2 → Security Groups → clinica-app-sg → Edit inbound rules.'
      },
      {
        id: 'auditoria',
        titulo: 'Quién hizo qué',
        puntos: 8,
        html: `
          <p>El <em>Event history</em> de CloudTrail solo guarda 90 días. La auditoría pide conservar el registro de actividad más tiempo y poder demostrar que nadie lo alteró.</p>
          ${vinetas([
            `Un <strong>trail</strong> de CloudTrail (puedes llamarlo ${c(x.trail)}) que esté registrando (<em>Logging</em>).`,
            'Con <strong>Log file validation</strong> activada.',
            `Que guarde los registros en su <strong>propio</strong> bucket, distinto del de los expedientes y con todo el acceso público bloqueado.`
          ])}`,
        pista:
          'Se hace en CloudTrail → Trails → Create trail. Deja que cree un bucket nuevo para los logs (Create new S3 bucket) y revisa que «Log file validation» quede en Enabled. Después, en Event history puedes ver todo lo que hiciste hoy: es justo lo que revisará Paola.'
      },
      {
        id: 'rotacion',
        titulo: 'Que la contraseña cambie sola',
        puntos: 8,
        bono: true,
        html: `
          <p><strong>Opcional.</strong> Una contraseña que nunca cambia es una contraseña que algún día se filtra. Si te sobra tiempo, haz que el secreto de la tarea 6 rote solo: suma hasta <strong>8 puntos extra</strong>, que compensan errores de las otras tareas, pero tu calificación nunca pasa de 100.</p>
          ${vinetas([
            'La <strong>rotación automática</strong> del secreto de la base activada.',
            `Que rote cada ${c('30 días')} o menos.`
          ])}`,
        pista:
          'La rotación usa una función de Lambda que cambia la contraseña. En Secrets Manager → tu secreto → pestaña Rotation → Edit rotation: activa «Automatic rotation», pon el calendario (por ejemplo cada 30 días) y en «Rotation function» elige «Create a new Lambda function» (o una que ya hayas creado en Lambda).'
      }
    ];
  },

  // El diagrama del modal «Arquitectura» (SIMULADOR.md §6.6). Aquí no se
  // construye una red: la cuenta ya trae la VPC, el servidor, el bucket y los
  // usuarios. Lo que se marca es lo que el alumno agrega o arregla: personas y
  // MFA (izquierda), la base en la red (en medio), los datos y su llave
  // (derecha) y el registro de auditoría (abajo). Las flechas «cifra» salen de
  // la llave de la clínica hacia todo lo que guarda datos de pacientes.
  arquitectura(datos) {
    const x = datosLab(datos);
    const igual = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

    // IAM (la cuenta inicial trae recepcion, luis-sistemas y app-servidor; ningún grupo ni rol).
    const usuarios = (e) => e.iam?.usuarios ?? [];
    const usuario = (e, nombre) => usuarios(e).find((u) => igual(u.nombre, nombre)) ?? null;
    const activas = (u) => (u?.llavesAcceso ?? []).filter((k) => k.estado === 'Active');
    const gruposAuditoria = (e) => (e.iam?.grupos ?? []).filter((g) => igual(g.nombre, x.grupoAuditoria) || (g.politicas ?? []).includes(x.politicaAuditoria));
    const iniciales = [x.compartido, x.admin, x.usuarioApp];
    const auditora = (e) => {
      const grupos = gruposAuditoria(e).map((g) => g.nombre);
      return usuarios(e).some((u) => !iniciales.some((n) => igual(n, u.nombre)) && (igual(u.nombre, x.auditora) || (u.grupos ?? []).some((g) => grupos.includes(g))));
    };

    // El servidor y la red que ya existen.
    const app = (e) => (e.instancias ?? []).find((i) => i.nombre === x.app && !['shutting-down', 'terminated'].includes(i.estado)) ?? null;
    const vpcs = (e) => new Set((e.vpcs ?? []).filter((v) => !v.porDefecto && v.cidr === x.vpcCidr).map((v) => v.id));
    const cubre = (r, puerto) => r.protocolo === '-1' || (r.protocolo === 'tcp' && r.desde <= puerto && puerto <= r.hasta);
    const sshAlMundo = (e, i) =>
      (e.gruposSeguridad ?? []).some((g) => (i.gruposSeguridad ?? []).includes(g.id) && (g.entrada ?? []).some((r) => cubre(r, 22) && ['0.0.0.0/0', '::/0'].includes(r.origen)));

    // KMS: las llaves propias (las aws/… las crea AWS sola).
    const propias = (e) => (e.kms?.llaves ?? []).filter((k) => !k.administradaPorAws && k.estado !== 'PendingDeletion');

    // S3: el bucket de expedientes ya existe; se mira lo que el alumno le arregla.
    const expedientes = (e) => (e.buckets ?? []).find((b) => b.nombre === x.bucket) ?? null;
    const bloqueado = (b) => Boolean(b) && Object.values(b.bloqueoPublico ?? {}).length > 0 && Object.values(b.bloqueoPublico ?? {}).every(Boolean);
    const GLACIER = ['GLACIER_IR', 'GLACIER', 'DEEP_ARCHIVE'];

    // RDS: cualquier base (instancia o clúster) que no sea réplica ni se esté borrando.
    const fuera = (o) => ['deleting', 'deleted'].includes(o.estado);
    const bases = (e) => [
      ...(e.rds?.instancias ?? []).filter((b) => b.rol !== 'replica' && !b.clusterId && !fuera(b)),
      ...(e.rds?.clusteres ?? []).filter((b) => !fuera(b) && !b.expres)
    ];

    // Secrets Manager: un secreto con credenciales de base.
    const secretos = (e) => (e.secretos?.secretos ?? []).filter((s) => !s.borradoEn && (s.tipo === 'rds' || s.tipo === 'otra-base' || s.base || s.administradoPor === 'rds'));

    // CloudTrail.
    const trails = (e) => e.cloudtrail?.trails ?? [];

    return {
      titulo: 'La Clínica San Rafael en AWS',
      objetivo: 'Una cuenta lista para la auditoría: cada quien entra con lo justo y con MFA, todo lo que guarda datos de pacientes va cifrado con la llave de la clínica, nada privado queda abierto a internet y queda registro de quién hizo qué.',
      columnas: 10,
      filas: 7.35,
      piezas: [
        // Contenedores: la cuenta, las personas (IAM es de toda la cuenta), la red y la auditoría.
        { id: 'cuenta', tipo: 'nube', etiqueta: 'Cuenta de la clínica', detalle: 'N. Virginia · us-east-1', col: 0.05, fila: 1, ancho: 9.85, alto: 6.25 },
        { id: 'iam', tipo: 'grupo', etiqueta: 'Personas y permisos', detalle: 'IAM', en: 'cuenta', col: 0.2, fila: 1.35, ancho: 2.6, alto: 5.75 },
        { id: 'vpc', tipo: 'vpc', etiqueta: x.vpcNombre, detalle: x.vpcCidr, en: 'cuenta', col: 3.15, fila: 1.35, ancho: 4.05, alto: 3.9 },
        { id: 'publica', tipo: 'subred-publica', etiqueta: 'Subred pública', en: 'vpc', col: 3.3, fila: 1.7, ancho: 3.75, alto: 1.5 },
        { id: 'privadas', tipo: 'subred-privada', etiqueta: 'Subredes privadas', en: 'vpc', col: 3.3, fila: 3.6, ancho: 3.75, alto: 1.5,
          tarea: 'base', checks: ['subredes'],
          hecho: (e) => {
            const ids = vpcs(e);
            return (e.rds?.gruposSubredes ?? []).some((g) => ids.has(g.vpcId) && (g.subredes ?? []).length > 0 && (g.subredes ?? []).every((id) => !esSubredPublica(e, id)));
          } },
        { id: 'registro', tipo: 'grupo', etiqueta: 'Registro de auditoría', en: 'cuenta', col: 3.15, fila: 5.6, ancho: 4.05, alto: 1.5 },

        // Afuera: los pacientes usan el portal.
        { id: 'pacientes', tipo: 'usuarios', etiqueta: 'Pacientes', detalle: 'portal de citas', col: 4.75, fila: 0 },

        // Personas y permisos.
        { id: 'llaves', tipo: 'iam-usuario', etiqueta: 'Sin llaves de acceso', detalle: x.usuarioApp, en: 'iam', col: 0.35, fila: 2.05,
          tarea: 'servidor', checks: ['llaves'],
          hecho: (e) => Boolean(e.iam) && !activas(usuario(e, x.usuarioApp)).length },
        { id: 'rol', tipo: 'iam-rol', etiqueta: 'Rol del servidor', detalle: x.rol, en: 'iam', col: 1.6, fila: 2.05,
          tarea: 'servidor', checks: ['rol'],
          hecho: (e) => (e.iam?.roles ?? []).some((r) => String(r.servicio ?? '').includes('ec2') || igual(r.nombre, x.rol)) },
        { id: 'recepcion', tipo: 'iam-usuario', etiqueta: 'Sin cuenta compartida', detalle: `${x.compartido}: fuera`, en: 'iam', col: 0.35, fila: 3.35,
          tarea: 'personas', checks: ['recepcion'],
          hecho: (e) => {
            if (!e.iam) return false;
            const r = usuario(e, x.compartido);
            return !r || (!(r.politicas ?? []).length && !(r.grupos ?? []).length);
          } },
        { id: 'luis', tipo: 'iam-usuario', etiqueta: 'Encargado de sistemas', detalle: x.admin, en: 'iam', col: 1.6, fila: 3.35 },
        { id: 'mfa-raiz', tipo: 'mfa', etiqueta: 'MFA de la raíz', detalle: 'cuenta raíz', en: 'iam', col: 0.35, fila: 4.65,
          tarea: 'mfa', checks: ['raiz'], hecho: (e) => Boolean(e.iam?.raizMfa) },
        { id: 'mfa-personas', tipo: 'mfa', etiqueta: 'MFA de cada persona', detalle: 'luis y paola', en: 'iam', col: 1.6, fila: 4.65,
          tarea: 'mfa', checks: ['usuarios'], hecho: (e) => usuarios(e).some((u) => u.consola && (u.mfa ?? []).length > 0) },
        { id: 'grupo-auditoria', tipo: 'iam-grupo', etiqueta: 'Grupo auditoría', detalle: x.grupoAuditoria, en: 'iam', col: 0.35, fila: 5.95,
          tarea: 'personas', checks: ['grupo'], hecho: (e) => gruposAuditoria(e).length > 0 },
        { id: 'auditora', tipo: 'iam-usuario', etiqueta: 'Auditora', detalle: x.auditora, en: 'iam', col: 1.6, fila: 5.95,
          tarea: 'personas', checks: ['paola'], hecho: auditora },

        // La red: el portal (ya existe), su disco nuevo y la base privada.
        { id: 'app', tipo: 'ec2', etiqueta: 'Portal de citas', detalle: x.app, en: 'publica', col: 4.75, fila: 2.05 },
        { id: 'disco', tipo: 'ebs', etiqueta: 'Disco de estudios', detalle: `${x.volumenGib} GiB, cifrado`, en: 'publica', col: 5.95, fila: 2.05,
          tarea: 'servidor', checks: ['disco'],
          hecho: (e) => { const i = app(e); return Boolean(i) && (e.volumenes ?? []).some((v) => !v.raiz && v.instanciaId === i.id && v.estado === 'in-use'); } },
        { id: 'base', tipo: 'rds', etiqueta: 'Base de citas', detalle: x.db, en: 'privadas', col: 4.75, fila: 3.95,
          tarea: 'base', checks: ['existe', 'privada', 'proteccion'], hecho: (e) => bases(e).length > 0 },

        // La auditoría.
        { id: 'trail', tipo: 'cloudtrail', etiqueta: 'Trail de auditoría', detalle: x.trail, en: 'registro', col: 4.75, fila: 5.95,
          tarea: 'auditoria', checks: ['trail', 'validacion'], hecho: (e) => trails(e).length > 0 },
        { id: 'logs', tipo: 's3', etiqueta: 'Bucket de registros', detalle: 'aparte y privado', en: 'registro', col: 5.95, fila: 5.95,
          tarea: 'auditoria', checks: ['bucket'],
          hecho: (e) => trails(e).some((t) => t.bucket && t.bucket !== x.bucket && (e.buckets ?? []).some((b) => b.nombre === t.bucket)) },

        // Los datos y su llave.
        { id: 'expedientes', tipo: 's3', etiqueta: 'Expedientes privados', detalle: x.bucket, en: 'cuenta', col: 7.45, fila: 2.05,
          tarea: 'expedientes', checks: ['bloqueo', 'versionado'],
          hecho: (e) => { const b = expedientes(e); return bloqueado(b) || b?.versionado === 'Enabled'; } },
        { id: 'glacier', tipo: 'glacier', etiqueta: 'Archivo Glacier', detalle: `a los ${x.diasGlacier} días`, en: 'cuenta', col: 8.75, fila: 2.05,
          tarea: 'expedientes', checks: ['ciclo'],
          hecho: (e) => (expedientes(e)?.ciclo ?? []).some((r) => r.estado === 'Enabled' && (r.transiciones ?? []).some((t) => GLACIER.includes(t.clase))) },
        { id: 'llave', tipo: 'kms', etiqueta: 'Llave de la clínica', detalle: `alias/${x.alias}`, en: 'cuenta', col: 7.45, fila: 3.95,
          tarea: 'llave', checks: ['existe', 'rotacion'], hecho: (e) => propias(e).length > 0 },
        { id: 'permisos', tipo: 'politica', etiqueta: 'Quién la usa', detalle: 'luis administra', en: 'cuenta', col: 8.75, fila: 3.95,
          tarea: 'llave', checks: ['permisos'],
          hecho: (e) => propias(e).some((k) => (k.administradores ?? []).some((a) => String(a).endsWith(`:user/${x.admin}`)) || (k.usuarios ?? []).some((a) => String(a).includes(':role/'))) },
        { id: 'secreto', tipo: 'secreto', etiqueta: 'Contraseña de la base', detalle: x.secreto, en: 'cuenta', col: 7.45, fila: 5.95,
          tarea: 'secreto', checks: ['existe'], hecho: (e) => secretos(e).length > 0 },
        { id: 'rotacion', tipo: 'lambda', etiqueta: 'Rotación automática', detalle: 'cada 30 días', en: 'cuenta', col: 8.75, fila: 5.95,
          tarea: 'rotacion', bono: true, checks: ['activa', 'cada'], hecho: (e) => secretos(e).some((s) => s.rotacion?.activa) }
      ],
      flechas: [
        // Los pacientes entran al portal por la web; SSH ya no está abierto al mundo.
        { de: 'pacientes', a: 'app', texto: '80/443, sin SSH',
          tarea: 'servidor', checks: ['ssh'], hecho: (e) => { const i = app(e); return Boolean(i) && !sshAlMundo(e, i); } },
        { de: 'rol', a: 'app', texto: 'le da permisos',
          tarea: 'servidor', checks: ['rol'], hecho: (e) => Boolean(app(e)?.rolIam) },
        { de: 'app', a: 'disco', tipo: 'apoyo', texto: 'conectado' },
        // Solo el grupo del portal llega al puerto de la base.
        { de: 'app', a: 'base', texto: 'solo desde la app',
          tarea: 'base', checks: ['acceso'],
          // Una regla de otro grupo cuyo origen es el grupo del portal (el grupo
          // «default» de la VPC ya se deja entrar a sí mismo: eso no cuenta).
          hecho: (e) => {
            const delPortal = new Set(app(e)?.gruposSeguridad ?? []);
            const puertos = [3306, 5432, ...bases(e).map((b) => b.puerto).filter(Boolean)];
            return (e.gruposSeguridad ?? []).some((g) => (g.entrada ?? []).some((r) => r.origen !== g.id && delPortal.has(r.origen) && puertos.some((p) => cubre(r, p))));
          } },
        // La llave de la clínica cifra todo lo que guarda datos de pacientes.
        { de: 'llave', a: 'expedientes', tipo: 'apoyo', texto: 'cifra (SSE-KMS)',
          tarea: 'expedientes', checks: ['cifrado'], hecho: (e) => ['SSE-KMS', 'DSSE-KMS'].includes(expedientes(e)?.cifrado?.tipo) },
        { de: 'llave', a: 'base', tipo: 'apoyo', texto: 'cifra',
          tarea: 'base', checks: ['cifrada'], hecho: (e) => bases(e).some((b) => b.cifrada) },
        { de: 'llave', a: 'secreto', tipo: 'apoyo', texto: 'cifra',
          tarea: 'secreto', checks: ['llave'], hecho: (e) => { const ids = new Set(propias(e).map((k) => k.id)); return secretos(e).some((s) => ids.has(s.llaveKms)); } },
        { de: 'permisos', a: 'llave', tipo: 'apoyo' },
        { de: 'expedientes', a: 'glacier', tipo: 'apoyo', texto: 'ciclo de vida' },
        { de: 'rotacion', a: 'secreto', tipo: 'apoyo', texto: 'rota' },
        // La auditoría: Paola revisa lo que el trail guarda.
        { de: 'grupo-auditoria', a: 'auditora', tipo: 'apoyo', texto: 'hereda' },
        { de: 'auditora', a: 'trail', tipo: 'apoyo', texto: 'revisa' },
        { de: 'trail', a: 'logs', tipo: 'apoyo', texto: 'guarda' }
      ]
    };
  }
};
