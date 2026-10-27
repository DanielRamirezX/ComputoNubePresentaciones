// Examen bimestral (parte práctica) · martes 27 de octubre de 2026.
// Ferretería Don Beto: construir sobre la VPC que dejó el técnico anterior. Sin
// NACL (en el simulacro 2 fue donde más se atoraron). Lleva pistas generales,
// como el simulacro 2: dónde buscar y qué recordar, sin la ruta de clics. La
// subred privada es un bono opcional (suma encima de los 100, sin pasar de 100).

import { anotar, crearVpc, cuentaNueva } from '../consola/modelo.js';
import { bloque, c, scriptApache, vinetas } from './util.js';

export function datosLab(d) {
  const red = `10.${d.octeto}`;
  return {
    vpcCidr: d.vpcCidr,
    vpcNombre: 'donbeto-vpc',
    publicaCidr: `${red}.10.0/24`,
    publicaNombre: 'donbeto-publica',
    privadaCidr: `${red}.20.0/24`,
    privadaNombre: 'donbeto-privada',
    azPublica: 'us-east-1a',
    azPrivada: 'us-east-1b',
    instancia: 'donbeto-web',
    sg: 'donbeto-web-sg',
    ipCasa: d.ipCasa,
    volumenTipo: 'gp3',
    volumenTamano: 20,
    volumenNombre: 'donbeto-inventario',
    bucket: `donbeto-facturas-${d.sufijo}`,
    diasArchivo: 180,
    grupo: 'cajeros',
    politica: 'AmazonEC2ReadOnlyAccess',
    usuario: 'caja-maria',
    textoPagina: 'Don Beto',
    textoMostrador: `mostrador ${d.sufijo}`,
    userData: scriptApache('Ferreteria Don Beto', `Catalogo en linea - mostrador ${d.sufijo}`)
  };
}

export const LAB = {
  id: 'bimestral',
  titulo: 'Ferretería Don Beto sube su catálogo a la nube',
  minutos: 60,
  pistas: true,
  historia: `
    <p><strong>Don Beto</strong> tiene una ferretería en Puebla y quiere su catálogo en línea. Un técnico empezó el trabajo y se fue: solo alcanzó a crear la VPC <code>donbeto-vpc</code>, todavía sin subredes.</p>
    <p>Te toca terminar: la red con su subred pública, el servidor con la página funcionando, un disco extra con su respaldo, un bucket para las facturas y el acceso de la cajera.</p>
    <p>Todo va en <strong>N. Virginia (us-east-1)</strong>. Es la parte práctica del examen y puedes hacer las tareas en el orden que quieras. Cada tarea tiene una pista general y puedes revisar tu avance antes de entregar. Lo que se califica es cómo queda tu cuenta al final.</p>
    <p>Las cinco primeras tareas valen 100 puntos. La última, la subred privada, es un <strong>bono opcional</strong>: si te sobra tiempo, suma puntos extra que compensan errores, pero tu calificación <strong>nunca pasa de 100</strong>. Hazla al final.</p>`,

  estadoInicial(datos) {
    const x = datosLab(datos);
    const e = cuentaNueva(datos);
    crearVpc(e, { nombre: x.vpcNombre, cidr: x.vpcCidr });
    e.bitacora = [];
    anotar(e, 'Laboratorio', 'Inicio', 'La cuenta empieza con donbeto-vpc (sin subredes).');
    return e;
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'red',
        titulo: 'La red: el gateway y la subred pública',
        puntos: 20,
        html: `
          <p>Todo dentro de la VPC ${c(x.vpcNombre)} (${c(x.vpcCidr)}), que ya existe.</p>
          ${vinetas([
            `Un Internet Gateway conectado a ${c(x.vpcNombre)}.`,
            `Una subred <strong>pública</strong> ${c(x.publicaCidr)} en ${c(x.azPublica)} (puedes llamarla ${c(x.publicaNombre)}): su tabla de rutas manda ${c('0.0.0.0/0')} al Internet Gateway.`
          ])}`,
        pista:
          'Todo está en el servicio VPC (Subnets, Internet gateways y Route tables). Un Internet Gateway recién creado no sirve hasta que lo conectas a la VPC. Lo que hace pública a una subred no es su nombre, sino que su tabla de rutas mande 0.0.0.0/0 al gateway: revisa qué tabla tiene asociada tu subred.'
      },
      {
        id: 'servidor',
        titulo: 'El servidor del catálogo',
        puntos: 30,
        html: `
          ${vinetas([
            `Una instancia ${c('t2.micro')} (o ${c('t3.micro')}) con <strong>Amazon Linux 2023</strong>, llamada ${c(x.instancia)}, en tu subred pública y con <strong>IP pública</strong>.`,
            `Su grupo de seguridad (puedes llamarlo ${c(x.sg)}) deja entrar HTTP (80) desde ${c('0.0.0.0/0')} y SSH (22) <strong>solo</strong> desde tu IP ${c(`${x.ipCasa}/32`)}.`,
            'En <strong>User data</strong>, este script tal cual:'
          ])}
          ${bloque(x.userData)}
          <p>Al final <strong>la página debe abrir</strong> en ${c('http://')} + la IP pública de la instancia y decir «${x.textoPagina}» y «${x.textoMostrador}».</p>`,
        pista:
          'Se lanza desde EC2 → Instances. En la sección de red del asistente de lanzamiento eliges la VPC, la subred y si lleva IP pública; ahí mismo creas el grupo de seguridad. El User data está casi al final, en Advanced details, y solo corre en el primer arranque. Si la página no abre, sigue el camino del paquete: gateway → tabla de rutas → grupo de seguridad → Apache.'
      },
      {
        id: 'discos',
        titulo: 'Un disco para el inventario y su respaldo',
        puntos: 20,
        html: `
          ${vinetas([
            `Un volumen EBS ${c(x.volumenTipo)} de ${c(`${x.volumenTamano} GiB`)} (puedes llamarlo ${c(x.volumenNombre)}), además del disco raíz.`,
            `Ese volumen conectado (<em>attached</em>) a ${c(x.instancia)}.`,
            'Un snapshot de ese volumen.'
          ])}`,
        pista: `Todo está en EC2, en la sección Elastic Block Store (Volumes y Snapshots). Un volumen EBS solo se conecta a una instancia de su misma zona de disponibilidad: averigua primero en qué zona está ${x.instancia}. El snapshot se saca del volumen nuevo, no del disco raíz.`
      },
      {
        id: 's3',
        titulo: 'El bucket de las facturas',
        puntos: 15,
        html: `
          ${vinetas([
            `Un bucket llamado exactamente ${c(x.bucket)}.`,
            '<strong>Todo</strong> el acceso público bloqueado.',
            'Versionado activado.',
            `Una regla de ciclo de vida activa, para <strong>todos</strong> los objetos del bucket, que los pase a ${c('Glacier Deep Archive')} a los ${c(String(x.diasArchivo))} días (el SAT puede pedirlas, pero casi nunca).`
          ])}`,
        pista:
          'Todo está en S3, dentro del bucket: el bloqueo público en Permissions, el versionado en Properties y el ciclo de vida en Management. El nombre del bucket tiene que ser exacto. La regla debe aplicar a todo el bucket, no solo a un prefijo.'
      },
      {
        id: 'iam',
        titulo: 'El acceso de la cajera',
        puntos: 15,
        html: `
          <p>María, la cajera, solo necesita <strong>ver</strong> si el servidor está encendido, sin poder apagarlo ni cambiar nada.</p>
          ${vinetas([
            `Un grupo ${c(x.grupo)} con la política ${c(x.politica)} y <strong>ninguna otra política</strong> (ni ${c('AdministratorAccess')} ni ${c('ReadOnlyAccess')}).`,
            `Un usuario ${c(x.usuario)} dentro del grupo ${c(x.grupo)}.`,
            `El usuario ${c(x.usuario)} <strong>sin</strong> políticas puestas directo: sus permisos le llegan por el grupo.`
          ])}`,
        pista:
          'Todo está en IAM (User groups y Users). Los permisos se dan al grupo y la persona los hereda al entrar en él. Mínimo privilegio: solo lo que la cajera necesita, que es ver EC2; una política que lee toda la cuenta es demasiado.'
      },
      {
        id: 'privada',
        titulo: 'Una subred privada para el futuro',
        puntos: 6,
        bono: true,
        html: `
          <p><strong>Opcional.</strong> Don Beto piensa poner después una base de datos que nadie de internet pueda alcanzar. Si te sobra tiempo, déjale lista su subred: suma hasta <strong>6 puntos extra</strong>, que compensan errores de las otras tareas, pero tu calificación nunca pasa de 100.</p>
          ${vinetas([
            `Una subred <strong>privada</strong> ${c(x.privadaCidr)} en ${c(x.azPrivada)}, dentro de ${c(x.vpcNombre)} (puedes llamarla ${c(x.privadaNombre)}).`,
            `Su tabla de rutas <strong>no</strong> tiene ninguna ruta ${c('0.0.0.0/0')}.`
          ])}`,
        pista:
          'Se crea igual que la pública, en VPC → Subnets. Una subred sin tabla propia usa la tabla principal de la VPC: si ahí pusiste la ruta a internet, la privada también saldría a internet.'
      }
    ];
  }
};
