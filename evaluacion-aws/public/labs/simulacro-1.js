// Simulacro 1 · martes 20 de octubre de 2026 · con pistas.
// La cafetería El Grano de Oro: construir todo desde una cuenta vacía.

import { anotar, cuentaNueva } from '../consola/modelo.js';
import { bloque, c, scriptApache, vinetas } from './util.js';

/** Los nombres, rangos y textos de este alumno (los usan las tareas y la rúbrica). */
export function datosLab(d) {
  const red = `10.${d.octeto}`;
  return {
    vpcCidr: d.vpcCidr,
    vpcNombre: 'elgrano-vpc',
    subredCidr: `${red}.1.0/24`,
    subredNombre: 'elgrano-publica',
    az: 'us-east-1a',
    igwNombre: 'elgrano-igw',
    grupo: 'baristas',
    usuario: 'lupita',
    politica: 'AmazonS3ReadOnlyAccess',
    instancia: 'elgrano-web',
    sg: 'elgrano-web-sg',
    ipCasa: d.ipCasa,
    bucket: `elgrano-menu-${d.sufijo}`,
    textoPagina: 'El Grano de Oro',
    textoSucursal: `sucursal ${d.sufijo}`,
    userData: scriptApache('Cafeteria El Grano de Oro', `Tienda en linea - sucursal ${d.sufijo}`)
  };
}

export const LAB = {
  id: 'simulacro-1',
  titulo: 'La cafetería El Grano de Oro abre su tienda en línea',
  minutos: 60,
  pistas: true,
  historia: `
    <p><strong>Doña Carmen</strong> tiene la cafetería <strong>El Grano de Oro</strong> en Xalapa. Quiere vender café en grano por internet y te contrató para montarlo en AWS. Su cuenta está recién abierta: <strong>no hay nada</strong>, solo la VPC por omisión que trae toda cuenta.</p>
    <p>Necesita cuatro cosas: un acceso de solo lectura para su barista Lupita, una red propia, el servidor de la tienda con la página funcionando y un bucket seguro para guardar el menú y las fotos.</p>
    <p>Todo va en la región <strong>N. Virginia (us-east-1)</strong>. Lo que importa es cómo queda tu cuenta al final: puedes hacerlo en el orden que quieras.</p>`,

  estadoInicial(datos) {
    const estado = cuentaNueva(datos);
    anotar(estado, 'Laboratorio', 'Inicio', 'Cuenta nueva: solo la VPC por omisión.');
    return estado;
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'iam',
        titulo: 'Acceso de solo lectura para la barista',
        puntos: 15,
        html: `
          <p>Lupita, la barista, necesita <strong>ver</strong> los archivos del menú en S3, sin poder cambiar nada.</p>
          ${vinetas([
            `Un grupo de IAM llamado ${c(x.grupo)} con la política administrada ${c(x.politica)}.`,
            `Un usuario de IAM llamado ${c(x.usuario)} que pertenezca al grupo ${c(x.grupo)}.`,
            `El usuario ${c(x.usuario)} <strong>no</strong> debe tener políticas puestas directo: sus permisos le llegan por el grupo.`
          ])}`,
        pista: 'IAM → User groups → Create group (ahí eliges la política). Luego IAM → Users → Create user: <strong>no marques</strong> «Provide user access to the AWS Management Console»; no hace falta. En «Set permissions» elige «Add user to group». Recuerda: los permisos se dan al grupo y cada usuario los hereda; así, cuando llegue otro barista, basta con meterlo al grupo.'
      },
      {
        id: 'red',
        titulo: 'La red de la tienda',
        puntos: 30,
        html: `
          ${vinetas([
            `Una VPC con el bloque IPv4 ${c(x.vpcCidr)}, llamada ${c(x.vpcNombre)}.`,
            `Dentro de ella, una subred ${c(x.subredCidr)} en la zona ${c(x.az)} (puedes llamarla ${c(x.subredNombre)}).`,
            `Un Internet Gateway conectado (<em>attached</em>) a tu VPC.`,
            `La subred debe ser <strong>pública</strong>: su tabla de rutas manda ${c('0.0.0.0/0')} a tu Internet Gateway.`
          ])}`,
        pista: 'VPC → Your VPCs → Create VPC («VPC only»); VPC → Subnets → Create subnet; VPC → Internet gateways → Create internet gateway y luego Actions → Attach to VPC. Para la ruta <strong>basta con editar la tabla de rutas que AWS creó junto con tu VPC</strong>: VPC → Route tables → la tabla de tu VPC → Routes → Edit routes → Add route con destino 0.0.0.0/0 y, en Target, «Internet Gateway» y el tuyo. Como tu subred no tiene otra tabla, usa esa. Una subred es pública solo si su tabla manda 0.0.0.0/0 al Internet Gateway: el nombre no la hace pública.'
      },
      {
        id: 'servidor',
        titulo: 'El servidor de la tienda',
        puntos: 35,
        html: `
          ${vinetas([
            `Una instancia EC2 ${c('t2.micro')} (o ${c('t3.micro')}) con <strong>Amazon Linux 2023</strong>, llamada ${c(x.instancia)}.`,
            `Debe estar <strong>en tu subred pública</strong> de la VPC ${c(x.vpcCidr)} (no en la VPC por omisión) y tener <strong>IP pública</strong>.`,
            `<span class="tarea__ojo"><strong>¡Ojo, esto cambia respecto a la sesión 1!</strong> En tu propia VPC, «Auto-assign public IP» viene en ${c('Disable')}: <strong>cámbialo a ${c('Enable')}</strong> al lanzar la instancia. En la sesión 1 venía en Enable porque usaste la VPC por omisión; en una VPC tuya, si lo dejas así, la instancia queda sin IP pública y nadie puede abrir su página.</span>`,
            `Un grupo de seguridad (puedes llamarlo ${c(x.sg)}) que deje entrar:
              <ul>
                <li>HTTP (puerto 80) desde cualquier lugar: ${c('0.0.0.0/0')}.</li>
                <li>SSH (puerto 22) <strong>solo desde tu casa</strong>: ${c(`${x.ipCasa}/32`)}. En «Allow SSH traffic from» elige <strong>My IP</strong>, no Anywhere (en la sesión 1 lo dejaste en Anywhere; aquí eso pierde puntos).</li>
              </ul>`,
            'No necesitas par de llaves: puedes elegir «Proceed without a key pair».',
            'En <strong>User data</strong> pega este script tal cual (instala Apache y escribe la página):'
          ])}
          ${bloque(x.userData)}
          <p>Al final, <strong>la página debe abrir</strong> en el navegador escribiendo ${c('http://')} y la IP pública de tu instancia, y debe decir «${x.textoPagina}» y «${x.textoSucursal}».</p>`,
        pista: 'EC2 → Instances → Launch instances. En «Network settings» pulsa Edit para elegir tu VPC y tu subred, y <strong>cambia «Auto-assign public IP» de Disable a Enable</strong> (en tu VPC viene apagado). Ahí mismo creas el grupo de seguridad: marca Allow HTTP y, en «Allow SSH traffic from», elige <strong>My IP</strong> en lugar de Anywhere. User data está hasta abajo, en «Advanced details». El grupo de seguridad es el guardia de la instancia: solo deja entrar lo que anotas en sus reglas.'
      },
      {
        id: 's3',
        titulo: 'El bucket del menú',
        puntos: 20,
        html: `
          ${vinetas([
            `Un bucket llamado exactamente ${c(x.bucket)}.`,
            '<strong>Todo</strong> el acceso público bloqueado (las cuatro casillas de «Block Public Access»).',
            'Versionado activado (<em>Bucket Versioning: Enable</em>).',
            `Cifrado por omisión con llaves administradas por S3 (${c('SSE-S3')}).`
          ])}`,
        pista: 'S3 → Create bucket: en el mismo formulario están «Block Public Access settings», «Bucket Versioning» y «Default encryption». Si ya lo creaste, cámbialo en sus pestañas Properties (versionado y cifrado) y Permissions (bloqueo). El versionado es tu red de seguridad: un archivo borrado se puede recuperar.'
      }
    ];
  }
};
