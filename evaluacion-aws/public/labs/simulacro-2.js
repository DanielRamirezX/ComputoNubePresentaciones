// Simulacro 2 · viernes 23 de octubre de 2026 · con pistas.
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
          'VPC → Internet gateways: patitas-igw dice «Detached» (suelto); Actions → Attach to VPC. VPC → Route tables → Create route table (elige patitas-vpc); ábrela, pestaña Routes → Edit routes → Add route (0.0.0.0/0, Target: Internet Gateway), y luego pestaña Subnet associations → Edit subnet associations → marca solo patitas-publica. EC2 → Security Groups → patitas-web-sg → Edit inbound rules. Piensa en el camino del paquete: puerta (Internet Gateway) → letrero (ruta) → caseta (NACL) → guardia (grupo de seguridad) → Apache.'
      },
      {
        id: 'nacl',
        titulo: 'La caseta de la calle: la NACL correcta',
        puntos: 12,
        html: `
          <p>El sobrino hizo dos NACL en ${c(x.vpcNombre)}: la buena, ${c(x.nacl)}, y una de pruebas, ${c(x.naclPruebas)}, que se le olvidó quitar.</p>
          ${vinetas([
            `La subred ${c(x.publicaNombre)} debe usar la NACL ${c(x.nacl)} (no ${c(x.naclPruebas)} ni la de omisión).`,
            `${c(x.nacl)} debe dejar <strong>entrar</strong> HTTP (80) desde ${c('0.0.0.0/0')} y dejar <strong>salir</strong> las respuestas. Ojo: la respuesta de Apache no regresa al puerto 80, sino al puerto que abrió el navegador del cliente, un número alto entre ${c('1024')} y ${c('65535')}. Una NACL no recuerda conexiones: la salida se permite aparte.`
          ])}`,
        pista:
          'VPC → Network ACLs. Primero mira las Inbound rules de patitas-pruebas: se leen de menor a mayor número y la primera que coincide decide. Luego selecciona patitas-nacl → pestaña Subnet associations → Edit subnet associations → marca patitas-publica → Save changes. Después, en patitas-nacl → pestaña Outbound rules → Edit outbound rules → Add new rule: número 110, tipo Custom TCP, puertos 1024-65535, destino 0.0.0.0/0, Allow.'
      },
      {
        id: 'iam',
        titulo: 'Quitarle al sobrino las llaves de la casa',
        puntos: 14,
        html: `
          <p>El sobrino ahora atiende la recepción: solo necesita <strong>ver</strong> los expedientes en S3 y si el servidor está encendido en EC2.</p>
          ${vinetas([
            `El usuario ${c(x.sobrino)} sin políticas puestas directo (hoy tiene ${c('AdministratorAccess')}).`,
            `Un grupo ${c(x.grupo)} con ${c(x.politicasGrupo[0])} y ${c(x.politicasGrupo[1])}, y nada que deje escribir o leer toda la cuenta.`,
            `El usuario ${c(x.sobrino)} dentro del grupo ${c(x.grupo)}.`
          ])}`,
        pista: 'IAM → Users → sobrino → pestaña Permissions → selecciona AdministratorAccess → Remove; IAM → User groups → Create group (ahí mismo agregas al usuario y eliges las dos políticas). Los permisos se dan a grupos, no a personas.'
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
        pista: 'IAM → Roles → Create role → AWS service → EC2 → elige la política; luego EC2 → Instances → patitas-web → Actions → Security → Modify IAM role. Un rol da credenciales temporales que se renuevan solas: no hay nada que robar del disco.'
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
        pista:
          'S3 → el bucket → Permissions → Block public access → Edit; Properties → Bucket Versioning → Edit; Management → Create lifecycle rule, con «Apply to all objects in the bucket». Marca «Transition current versions of objects between storage classes» y también «Expire current versions of objects». A los 180 días elige Glacier Flexible Retrieval, no Deep Archive como en la sesión 4.'
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
          'Primero mira la zona: EC2 → Instances → patitas-web → pestaña Details → Availability Zone. Luego EC2 → Volumes → Create volume: gp3, 5 GiB y esa misma zona (no dejes la que viene). Cuando diga Available: selecciónalo → Actions → Attach volume → elige patitas-web. Al final, con el volumen seleccionado: Actions → Create snapshot y escribe la descripción.'
      }
    ];
  }
};
