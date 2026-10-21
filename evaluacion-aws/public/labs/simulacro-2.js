// Simulacro 2 · viernes 23 de octubre de 2026 · con pistas generales.
// En el simulacro 1 todos los que entregaron sacaron 100 siguiendo pistas con
// la ruta exacta de clics. Aquí la pista dice a qué servicio y sección ir y
// en qué pensar, pero ya no los clics ni qué está mal: eso lo encuentra el
// alumno, como en el bimestral (que no trae pistas).
// Veterinaria Patitas: el sobrino dejó la cuenta a medias. Diagnosticar y reparar.
// Es la última práctica antes del bimestral: aquí se ensayan una tabla de rutas
// propia, asociar y editar una NACL y conectar un volumen EBS a una instancia.

import {
  anotar,
  asociarNacl,
  avanzar,
  crearBucket,
  crearIgw,
  crearNacl,
  crearSubred,
  crearUsuario,
  crearVpc,
  cuentaNueva,
  editarReglasNacl,
  editarSubred,
  lanzarInstancias,
  reloj,
  subirObjetos
} from '../consola/modelo.js';
import { c, scriptApache, vinetas } from './util.js';

export function datosLab(d) {
  const red = `10.${d.octeto}`;
  return {
    vpcCidr: d.vpcCidr,
    vpcNombre: 'patitas-vpc',
    publicaCidr: `${red}.1.0/24`,
    publicaNombre: 'patitas-publica',
    privadaCidr: `${red}.2.0/24`,
    privadaNombre: 'patitas-privada',
    // La pública NO va en us-east-1a (la zona que trae por omisión «Create volume»): hay que fijarse.
    azPublica: 'us-east-1b',
    azPrivada: 'us-east-1c',
    igwNombre: 'patitas-igw',
    tablaNombre: 'patitas-rt-publica',
    nacl: 'patitas-nacl',
    naclPruebas: 'patitas-pruebas',
    instancia: 'patitas-web',
    sg: 'patitas-web-sg',
    ipCasa: d.ipCasa,
    sobrino: 'sobrino',
    grupo: 'recepcion',
    politicasGrupo: ['AmazonS3ReadOnlyAccess', 'AmazonEC2ReadOnlyAccess'],
    rol: 'patitas-ec2-s3',
    politicaRol: 'AmazonS3ReadOnlyAccess',
    bucket: `patitas-expedientes-${d.sufijo}`,
    volumenTipo: 'gp3',
    volumenTamano: 5,
    volumenNombre: 'patitas-radiografias',
    descSnap: 'Respaldo de las radiografias',
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
    <p>La <strong>Veterinaria Patitas</strong> de Querétaro le pidió al sobrino de la dueña que subiera su página de citas a AWS. El sobrino se fue de vacaciones y dejó todo a medias: <strong>la página no abre</strong>, él tiene permisos de administrador sobre toda la cuenta, los expedientes de las mascotas están en un bucket sin protección y las radiografías ya no caben en el disco del servidor.</p>
    <p>Tu trabajo es <strong>diagnosticar y reparar</strong> lo que ya existe (la VPC <code>patitas-vpc</code> con sus subredes y sus NACL, la instancia <code>patitas-web</code>, el usuario <code>sobrino</code> y el bucket de expedientes). La instancia ya tiene Apache y la página: <strong>no lances otra</strong>.</p>
    <p>Todo está en <strong>N. Virginia (us-east-1)</strong>. Puedes hacer las tareas en el orden que quieras.</p>`,

  estadoInicial(datos) {
    const x = datosLab(datos);
    const e = cuentaNueva(datos);

    // La red: subredes creadas y gateway creado pero sin conectar. No hay tabla de
    // rutas propia: las dos subredes usan la principal, que solo tiene la ruta local.
    const vpc = crearVpc(e, { nombre: x.vpcNombre, cidr: x.vpcCidr });
    const publica = crearSubred(e, { vpcId: vpc.id, nombre: x.publicaNombre, az: x.azPublica, cidr: x.publicaCidr });
    editarSubred(e, publica.id, { ipPublicaAuto: true });
    crearSubred(e, { vpcId: vpc.id, nombre: x.privadaNombre, az: x.azPrivada, cidr: x.privadaCidr });
    crearIgw(e, { nombre: x.igwNombre });

    // Las NACL. La buena (patitas-nacl) quedó sin asociar y le falta la salida de
    // las respuestas: el sobrino pensó que la respuesta sale por el 80, como si la
    // NACL recordara la conexión. La de pruebas sí está en la subred pública y
    // niega todo con la regla 10, antes de la 100 que permite todo.
    const buena = crearNacl(e, { vpcId: vpc.id, nombre: x.nacl });
    editarReglasNacl(e, buena.id, 'entrada', [{ numero: 100, protocolo: 'tcp', desde: 80, hasta: 80, cidr: '0.0.0.0/0', accion: 'allow' }]);
    editarReglasNacl(e, buena.id, 'salida', [{ numero: 100, protocolo: 'tcp', desde: 80, hasta: 80, cidr: '0.0.0.0/0', accion: 'allow' }]);
    const pruebas = crearNacl(e, { vpcId: vpc.id, nombre: x.naclPruebas });
    editarReglasNacl(e, pruebas.id, 'entrada', [
      { numero: 10, protocolo: '-1', cidr: '0.0.0.0/0', accion: 'deny' },
      { numero: 100, protocolo: '-1', cidr: '0.0.0.0/0', accion: 'allow' }
    ]);
    editarReglasNacl(e, pruebas.id, 'salida', [{ numero: 100, protocolo: '-1', cidr: '0.0.0.0/0', accion: 'allow' }]);
    asociarNacl(e, pruebas.id, [publica.id]);

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

    // IAM: el sobrino con AdministratorAccess puesto directo.
    crearUsuario(e, { nombre: x.sobrino, consola: true, politicas: ['AdministratorAccess'] });

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
    anotar(e, 'Laboratorio', 'Inicio', 'La cuenta empieza como la dejó el sobrino: VPC con dos NACL, instancia, usuario y bucket a medias.');
    return e;
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'web',
        titulo: 'Que la página de citas abra (sin relanzar)',
        puntos: 30,
        html: `
          <p>La instancia ${c(x.instancia)} ya tiene Apache y la página, pero desde internet no abre. Arréglalo <strong>sin lanzar otra instancia</strong>. Al final debe quedar:</p>
          ${vinetas([
            `La página abre en ${c('http://')} + la IP pública de ${c(x.instancia)} y dice «${x.textoPagina}» y «${x.textoClinica}» (para eso también tienes que arreglar la NACL de la siguiente tarea).`,
            `El Internet Gateway ${c(x.igwNombre)} conectado a ${c(x.vpcNombre)}.`,
            `Una <strong>tabla de rutas propia</strong> (no la principal; puedes llamarla ${c(x.tablaNombre)}) con la ruta ${c('0.0.0.0/0')} → ${c(x.igwNombre)}, asociada a la subred ${c(x.publicaNombre)} (${c(x.publicaCidr)}).`,
            `La subred ${c(x.privadaNombre)} (${c(x.privadaCidr)}) es para la futura base de datos: debe seguir <strong>sin</strong> salida a internet, y la tabla principal, sin ruta ${c('0.0.0.0/0')}.`,
            `El grupo ${c(x.sg)} deja entrar HTTP (puerto 80) desde ${c('0.0.0.0/0')}.`,
            `Nadie del mundo puede intentar SSH: quita la regla SSH abierta a ${c('0.0.0.0/0')} o deja SSH solo desde tu IP ${c(`${x.ipCasa}/32`)}.`
          ])}`,
        pista:
          'Sigue el camino del paquete, en orden: puerta (Internet Gateway) → letrero (tabla de rutas) → caseta (NACL) → guardia (grupo de seguridad) → Apache. Revisa cada pieza en VPC (Internet gateways, Route tables) y en EC2 (Security Groups). Una tabla de rutas sirve a las subredes que tiene asociadas.'
      },
      {
        id: 'nacl',
        titulo: 'La caseta de la calle: la NACL correcta',
        puntos: 12,
        html: `
          <p>El sobrino hizo dos NACL en ${c(x.vpcNombre)}: la buena, ${c(x.nacl)}, y una de pruebas, ${c(x.naclPruebas)}.</p>
          ${vinetas([
            `La subred ${c(x.publicaNombre)} debe usar la NACL ${c(x.nacl)} (no ${c(x.naclPruebas)} ni la de omisión).`,
            `${c(x.nacl)} debe dejar <strong>entrar</strong> HTTP (80) desde ${c('0.0.0.0/0')} y dejar <strong>salir</strong> las respuestas de Apache hacia los visitantes.`
          ])}`,
        pista:
          'Todo está en VPC → Network ACLs. Las reglas se leen de menor a mayor número y la primera que coincide decide. Una NACL no recuerda conexiones: la respuesta de Apache no regresa al puerto 80, sino a un puerto alto que abrió el navegador del visitante (1024-65535).'
      },
      {
        id: 'iam',
        titulo: 'Quitarle al sobrino las llaves de la casa',
        puntos: 14,
        html: `
          <p>El sobrino ahora atiende la recepción: solo necesita <strong>ver</strong> los expedientes en S3 y si el servidor está encendido en EC2.</p>
          ${vinetas([
            `El usuario ${c(x.sobrino)} sin políticas puestas directo.`,
            `Un grupo ${c(x.grupo)} con ${c(x.politicasGrupo[0])} y ${c(x.politicasGrupo[1])}, y nada que deje escribir o leer toda la cuenta.`,
            `El usuario ${c(x.sobrino)} dentro del grupo ${c(x.grupo)}.`
          ])}`,
        pista: 'Todo está en IAM (Users y User groups). Revisa qué permisos tiene hoy el sobrino. Los permisos se dan a grupos, no a personas: la persona hereda los de su grupo.'
      },
      {
        id: 'rol',
        titulo: 'Credenciales para el servidor sin llaves pegadas',
        puntos: 12,
        html: `
          <p>La página va a leer los expedientes desde S3. El sobrino pensaba crear una llave de acceso y copiarla dentro del servidor. Hazlo bien:</p>
          ${vinetas([
            `Un rol de IAM para EC2 (trusted entity: <em>AWS service → EC2</em>), por ejemplo ${c(x.rol)}, con ${c(x.politicaRol)} y nada más.`,
            `Ese rol asignado a la instancia ${c(x.instancia)} (sin relanzarla).`
          ])}`,
        pista: 'El rol se crea en IAM → Roles y se le asigna a la instancia desde EC2 (busca en Actions de la instancia). Un rol da credenciales temporales que se renuevan solas: no hay nada que robar del disco.'
      },
      {
        id: 's3',
        titulo: 'Proteger y ordenar los expedientes',
        puntos: 15,
        html: `
          <p>El bucket ${c(x.bucket)} ya existe y tiene expedientes.</p>
          ${vinetas([
            '<strong>Todo</strong> el acceso público bloqueado.',
            'Versionado activado.',
            `Una regla de ciclo de vida <strong>activa</strong> para <strong>todos</strong> los objetos del bucket que:
              <ul>
                <li>los pase a ${c('Standard-IA')} a los ${c('30')} días,</li>
                <li>los pase a ${c('Glacier Flexible Retrieval')} a los ${c('180')} días,</li>
                <li>y los borre (expiración) a los ${c('1825')} días, que son 5 años.</li>
              </ul>`
          ])}`,
        pista:
          'Todo está en S3, dentro del bucket: el bloqueo público en Permissions, el versionado en Properties y el ciclo de vida en Management. Una sola regla puede mover y también borrar. Fíjate en la clase de los 180 días: no es la misma que en el laboratorio de la sesión 4.'
      },
      {
        id: 'discos',
        titulo: 'Un disco aparte para las radiografías',
        puntos: 17,
        html: `
          <p>Las radiografías ya no caben en el disco raíz de ${c(x.instancia)}. Agrégale un disco y respáldalo:</p>
          ${vinetas([
            `Un volumen EBS ${c(x.volumenTipo)} de ${c(`${x.volumenTamano} GiB`)} (puedes llamarlo ${c(x.volumenNombre)}), en la <strong>misma zona de disponibilidad</strong> que ${c(x.instancia)}.`,
            `Ese volumen conectado (<em>attached</em>) a ${c(x.instancia)}.`,
            `Un snapshot de ese volumen con la descripción ${c(x.descSnap)}.`
          ])}`,
        pista:
          'Todo está en EC2, en la sección Elastic Block Store (Volumes y Snapshots). Un volumen EBS solo se puede conectar a una instancia de su misma zona de disponibilidad: averigua primero en qué zona está patitas-web.'
      }
    ];
  }
};
