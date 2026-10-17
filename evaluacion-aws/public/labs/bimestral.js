// Examen bimestral (parte práctica) · martes 27 de octubre de 2026 · sin pistas.
// Ferretería Don Beto: construir sobre lo poco que dejó el técnico anterior,
// incluida una NACL que hay que diagnosticar.

import { anotar, crearNacl, crearVpc, cuentaNueva, editarReglasNacl } from '../consola/modelo.js';
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
    nacl: 'donbeto-nacl',
    redAtacante: '203.0.113.0/24',
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
    usuarios: ['caja-maria', 'caja-pedro'],
    textoPagina: 'Don Beto',
    textoMostrador: `mostrador ${d.sufijo}`,
    userData: scriptApache('Ferreteria Don Beto', `Catalogo en linea - mostrador ${d.sufijo}`)
  };
}

export const LAB = {
  id: 'bimestral',
  titulo: 'Ferretería Don Beto sube su catálogo a la nube',
  minutos: 60,
  pistas: false,
  historia: `
    <p><strong>Don Beto</strong> tiene una ferretería en Puebla y quiere su catálogo en línea. Un técnico empezó el trabajo y se fue: solo alcanzó a crear la VPC <code>donbeto-vpc</code> y una NACL, <code>donbeto-nacl</code>, que bloquea a una red que atacó su página anterior.</p>
    <p>Te toca terminar: la red con una subred pública y una privada, el servidor con la página funcionando, un disco extra con su respaldo, un bucket para las facturas y el acceso de los cajeros.</p>
    <p>Todo va en <strong>N. Virginia (us-east-1)</strong>. Es la parte práctica del examen: <strong>no hay pistas</strong>, pero puedes hacer las tareas en el orden que quieras. Lo que se califica es cómo queda tu cuenta al final.</p>`,

  estadoInicial(datos) {
    const x = datosLab(datos);
    const e = cuentaNueva(datos);
    const vpc = crearVpc(e, { nombre: x.vpcNombre, cidr: x.vpcCidr });
    const nacl = crearNacl(e, { vpcId: vpc.id, nombre: x.nacl });
    // La trampa: la regla 90 niega el puerto 80 a todo el mundo, antes de la que permite todo.
    editarReglasNacl(e, nacl.id, 'entrada', [
      { numero: 50, protocolo: '-1', cidr: x.redAtacante, accion: 'deny' },
      { numero: 90, protocolo: 'tcp', desde: 80, hasta: 80, cidr: '0.0.0.0/0', accion: 'deny' },
      { numero: 100, protocolo: '-1', cidr: '0.0.0.0/0', accion: 'allow' }
    ]);
    editarReglasNacl(e, nacl.id, 'salida', [{ numero: 100, protocolo: '-1', cidr: '0.0.0.0/0', accion: 'allow' }]);
    e.bitacora = [];
    anotar(e, 'Laboratorio', 'Inicio', 'La cuenta empieza con donbeto-vpc y donbeto-nacl (sin subredes).');
    return e;
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'red',
        titulo: 'Dos subredes: una pública y una privada',
        puntos: 22,
        html: `
          <p>Todo dentro de la VPC ${c(x.vpcNombre)} (${c(x.vpcCidr)}), que ya existe.</p>
          ${vinetas([
            `Un Internet Gateway conectado a ${c(x.vpcNombre)}.`,
            `Una subred <strong>pública</strong> ${c(x.publicaCidr)} en ${c(x.azPublica)} (puedes llamarla ${c(x.publicaNombre)}): su tabla de rutas manda ${c('0.0.0.0/0')} al Internet Gateway.`,
            `Una subred <strong>privada</strong> ${c(x.privadaCidr)} en ${c(x.azPrivada)} (puedes llamarla ${c(x.privadaNombre)}): su tabla de rutas <strong>no</strong> tiene ninguna ruta ${c('0.0.0.0/0')}.`
          ])}`,
        pista: ''
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
        pista: ''
      },
      {
        id: 'nacl',
        titulo: 'La NACL de la ferretería',
        puntos: 8,
        html: `
          ${vinetas([
            `Tu subred pública debe usar la NACL ${c(x.nacl)} que dejó el técnico.`,
            `Debe seguir bloqueando la red atacante ${c(x.redAtacante)}.`,
            'Y la página tiene que abrir para todos los demás. Si con esta NACL no abre, averigua por qué y corrígelo sin quitar el bloqueo a la red atacante.'
          ])}`,
        pista: ''
      },
      {
        id: 'discos',
        titulo: 'Un disco para el inventario y su respaldo',
        puntos: 15,
        html: `
          ${vinetas([
            `Un volumen EBS ${c(x.volumenTipo)} de ${c(`${x.volumenTamano} GiB`)} (puedes llamarlo ${c(x.volumenNombre)}), además del disco raíz.`,
            `Ese volumen conectado (<em>attached</em>) a ${c(x.instancia)}.`,
            'Un snapshot de ese volumen.'
          ])}`,
        pista: ''
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
        pista: ''
      },
      {
        id: 'iam',
        titulo: 'El acceso de los cajeros',
        puntos: 10,
        html: `
          <p>Los cajeros solo necesitan <strong>ver</strong> si el servidor está encendido, sin poder apagarlo ni cambiar nada.</p>
          ${vinetas([
            `Un grupo ${c(x.grupo)} con la política ${c(x.politica)} y nada que deje escribir o leer toda la cuenta.`,
            `Dos usuarios, ${c(x.usuarios[0])} y ${c(x.usuarios[1])}, dentro del grupo ${c(x.grupo)}.`,
            'Ninguno de los dos con políticas puestas directo.'
          ])}`,
        pista: ''
      }
    ];
  }
};
