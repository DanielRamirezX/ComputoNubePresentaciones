// Simulacro 2 · viernes 23 de octubre de 2026 · con pistas.
// Veterinaria Patitas: el sobrino dejó la cuenta a medias. Diagnosticar y reparar.

import {
  anotar,
  avanzar,
  crearBucket,
  crearIgw,
  crearLlaveAcceso,
  crearSubred,
  crearTablaRutas,
  crearUsuario,
  crearVpc,
  cuentaNueva,
  editarSubred,
  lanzarInstancias,
  reloj,
  subirObjetos
} from '../consola/modelo.js';
import { bloque, c, scriptApache, vinetas } from './util.js';

export function datosLab(d) {
  const red = `10.${d.octeto}`;
  return {
    vpcCidr: d.vpcCidr,
    vpcNombre: 'patitas-vpc',
    publicaCidr: `${red}.1.0/24`,
    publicaNombre: 'patitas-publica',
    privadaCidr: `${red}.2.0/24`,
    privadaNombre: 'patitas-privada',
    igwNombre: 'patitas-igw',
    tablaNombre: 'patitas-rt-publica',
    instancia: 'patitas-web',
    sg: 'patitas-web-sg',
    ipCasa: d.ipCasa,
    sobrino: 'sobrino',
    grupo: 'recepcion',
    politicasGrupo: ['AmazonS3ReadOnlyAccess', 'AmazonEC2ReadOnlyAccess'],
    mfa: 'sobrino-celular',
    rol: 'patitas-ec2-s3',
    politicaRol: 'AmazonS3ReadOnlyAccess',
    bucket: `patitas-expedientes-${d.sufijo}`,
    descSnap: 'Respaldo patitas-web antes de reparar',
    textoPagina: 'Veterinaria Patitas',
    textoClinica: `clinica ${d.sufijo}`,
    userData: scriptApache('Veterinaria Patitas', `Citas en linea - clinica ${d.sufijo}`)
  };
}

export const LAB = {
  id: 'simulacro-2',
  titulo: 'Veterinaria Patitas: el sobrino dejó todo a medias',
  minutos: 60,
  pistas: true,
  historia: `
    <p>La <strong>Veterinaria Patitas</strong> de Querétaro le pidió al sobrino de la dueña que subiera su página de citas a AWS. El sobrino se fue de vacaciones y dejó todo a medias: <strong>la página no abre</strong>, él tiene permisos de administrador sobre toda la cuenta y los expedientes de las mascotas están en un bucket sin protección.</p>
    <p>Tu trabajo es <strong>diagnosticar y reparar</strong> lo que ya existe (la VPC <code>patitas-vpc</code>, la instancia <code>patitas-web</code>, el usuario <code>sobrino</code> y el bucket de expedientes). La instancia ya tiene Apache y la página: <strong>no lances otra</strong>.</p>
    <p>Todo está en <strong>N. Virginia (us-east-1)</strong>. Puedes hacer las tareas en el orden que quieras.</p>`,

  estadoInicial(datos) {
    const x = datosLab(datos);
    const e = cuentaNueva(datos);

    // La red: subredes creadas, gateway creado pero sin conectar, tabla sin ruta.
    const vpc = crearVpc(e, { nombre: x.vpcNombre, cidr: x.vpcCidr });
    const publica = crearSubred(e, { vpcId: vpc.id, nombre: x.publicaNombre, az: 'us-east-1a', cidr: x.publicaCidr });
    editarSubred(e, publica.id, { ipPublicaAuto: true });
    crearSubred(e, { vpcId: vpc.id, nombre: x.privadaNombre, az: 'us-east-1b', cidr: x.privadaCidr });
    crearIgw(e, { nombre: x.igwNombre });
    crearTablaRutas(e, { vpcId: vpc.id, nombre: x.tablaNombre });

    // El servidor: con IP pública y Apache, pero su grupo solo tiene SSH abierto al mundo.
    lanzarInstancias(e, {
      nombre: x.instancia,
      ami: 'al2023',
      tipo: 't2.micro',
      subredId: publica.id,
      nuevoGrupo: {
        nombre: x.sg,
        descripcion: 'launch-wizard-1 created by sobrino',
        entrada: [{ protocolo: 'tcp', desde: 22, hasta: 22, origen: '0.0.0.0/0' }]
      },
      userData: x.userData
    });

    // IAM: el sobrino con AdministratorAccess directo y una llave de acceso activa.
    crearUsuario(e, { nombre: x.sobrino, consola: true, politicas: ['AdministratorAccess'] });
    crearLlaveAcceso(e, x.sobrino);

    // S3: los expedientes, sin bloqueo público ni versionado.
    crearBucket(e, {
      nombre: x.bucket,
      bloqueoPublico: { aclsNuevas: false, aclsCualquiera: false, politicasNuevas: false, politicasCualquiera: false },
      versionado: false
    });
    subirObjetos(e, x.bucket, [
      { llave: 'expedientes/firulais-vacunas.pdf', tamano: 184320, tipo: 'application/pdf' },
      { llave: 'expedientes/michi-cirugia.pdf', tamano: 412672, tipo: 'application/pdf' },
      { llave: 'expedientes/rocky-rayos-x.jpg', tamano: 1835008, tipo: 'image/jpeg' }
    ]);

    avanzar(e, reloj.ahora() + 60_000);
    e.bitacora = [];
    anotar(e, 'Laboratorio', 'Inicio', 'La cuenta empieza como la dejó el sobrino: VPC, instancia, usuario y bucket a medias.');
    return e;
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'web',
        titulo: 'Que la página de citas abra (sin relanzar)',
        puntos: 35,
        html: `
          <p>La instancia ${c(x.instancia)} ya tiene Apache y la página, pero desde internet no abre. Arréglalo <strong>sin lanzar otra instancia</strong>. Al final debe quedar:</p>
          ${vinetas([
            `La página abre en ${c('http://')} + la IP pública de ${c(x.instancia)} y dice «${x.textoPagina}» y «${x.textoClinica}».`,
            `El Internet Gateway ${c(x.igwNombre)} conectado a ${c(x.vpcNombre)}.`,
            `La subred ${c(x.publicaNombre)} (${c(x.publicaCidr)}) es pública: su tabla de rutas manda ${c('0.0.0.0/0')} al gateway. Para eso el sobrino ya creó la tabla ${c(x.tablaNombre)}.`,
            `La subred ${c(x.privadaNombre)} (${c(x.privadaCidr)}) es para la futura base de datos: debe seguir <strong>sin</strong> salida a internet.`,
            `El grupo ${c(x.sg)} deja entrar HTTP (puerto 80) desde ${c('0.0.0.0/0')}.`,
            `Nadie del mundo puede intentar SSH: quita la regla SSH abierta a ${c('0.0.0.0/0')} o deja SSH solo desde tu IP ${c(`${x.ipCasa}/32`)}.`
          ])}`,
        pista: 'VPC → Internet gateways → Actions → Attach to VPC; VPC → Route tables → patitas-rt-publica → Routes → Edit routes, y luego Subnet associations → Edit subnet associations; EC2 → Security Groups → patitas-web-sg → Edit inbound rules. Piensa en el camino del paquete: puerta (Internet Gateway) → letrero (ruta) → caseta (NACL) → guardia (grupo de seguridad) → Apache.'
      },
      {
        id: 'iam',
        titulo: 'Quitarle al sobrino las llaves de la casa',
        puntos: 20,
        html: `
          <p>El sobrino ahora atiende la recepción: solo necesita <strong>ver</strong> los expedientes en S3 y si el servidor está encendido en EC2.</p>
          ${vinetas([
            `El usuario ${c(x.sobrino)} sin políticas puestas directo (hoy tiene ${c('AdministratorAccess')}).`,
            `Un grupo ${c(x.grupo)} con ${c(x.politicasGrupo[0])} y ${c(x.politicasGrupo[1])}, y nada que deje escribir o leer toda la cuenta.`,
            `El usuario ${c(x.sobrino)} dentro del grupo ${c(x.grupo)}.`,
            `Un dispositivo MFA virtual asignado a ${c(x.sobrino)} (puedes llamarlo ${c(x.mfa)}).`
          ])}`,
        pista: 'IAM → Users → sobrino → pestaña Permissions → Remove; IAM → User groups → Create group (ahí mismo agregas al usuario); IAM → Users → sobrino → Security credentials → Assign MFA device. Los permisos se dan a grupos, no a personas, y el MFA es una segunda cerradura por si roban la contraseña.'
      },
      {
        id: 'rol',
        titulo: 'Credenciales para el servidor sin llaves pegadas',
        puntos: 20,
        html: `
          <p>La página va a leer los expedientes desde S3. El sobrino pensaba copiar <strong>su</strong> llave de acceso dentro del servidor. Hazlo bien:</p>
          ${vinetas([
            `Un rol de IAM para EC2 (trusted entity: <em>AWS service → EC2</em>), por ejemplo ${c(x.rol)}, con ${c(x.politicaRol)} y nada más.`,
            `Ese rol asignado a la instancia ${c(x.instancia)} (sin relanzarla).`,
            `La llave de acceso del sobrino desactivada o borrada: ya no la necesita y pudo haberse filtrado.`
          ])}`,
        pista: 'IAM → Roles → Create role → AWS service → EC2 → elige la política; luego EC2 → Instances → patitas-web → Actions → Security → Modify IAM role. La llave: IAM → Users → sobrino → Security credentials → Access keys → Actions → Deactivate o Delete. Un rol da credenciales temporales que se renuevan solas: no hay nada que robar del disco.'
      },
      {
        id: 's3',
        titulo: 'Proteger y ordenar los expedientes',
        puntos: 15,
        html: `
          <p>El bucket ${c(x.bucket)} ya existe y tiene expedientes.</p>
          ${vinetas([
            '<strong>Todo</strong> el acceso público bloqueado (hoy está apagado).',
            'Versionado activado.',
            `Una regla de ciclo de vida <strong>activa</strong> para <strong>todos</strong> los objetos del bucket que:
              <ul>
                <li>los pase a ${c('Standard-IA')} a los ${c('30')} días,</li>
                <li>los pase a ${c('Glacier Flexible Retrieval')} a los ${c('180')} días,</li>
                <li>y los borre (expiración) a los ${c('1825')} días, que son 5 años.</li>
              </ul>`
          ])}`,
        pista: 'S3 → el bucket → Permissions → Block public access → Edit; Properties → Bucket Versioning → Edit; Management → Create lifecycle rule, con «Apply to all objects in the bucket». El ciclo de vida baja solo los archivos viejos a clases más baratas: casi nadie consulta un expediente de hace un año.'
      },
      {
        id: 'respaldo',
        titulo: 'Un respaldo antes de seguir',
        puntos: 10,
        html: `
          ${vinetas([
            `Un snapshot del <strong>volumen raíz</strong> de la instancia ${c(x.instancia)}.`,
            `Con la descripción ${c(x.descSnap)}.`
          ])}`,
        pista: 'EC2 → Instances → patitas-web → pestaña Storage para ver el id de su volumen raíz; luego EC2 → Volumes → selecciónalo → Actions → Create snapshot. Un snapshot es una foto del disco que se guarda en S3: con él puedes crear un disco idéntico si algo sale mal.'
      }
    ];
  }
};
