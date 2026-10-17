// ---------------------------------------------------------------------------
// EC2
//
// El registro del servicio: menú lateral, rutas, búsqueda y las ayudas «Info»
// en español. Las pantallas viven en:
//   ec2-instancias.js  Instances, Launch an instance, Connect, System log…
//   ec2-almacen.js     Volumes y Snapshots
//   ec2-red.js         Security Groups, Elastic IPs y Key Pairs (también en VPC)
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import { ID_ZONA, ZONAS, vivas } from '../modelo.js';
import { paginaEtiquetas } from './comun.js';
import { rutasInstancias } from './ec2-instancias.js';
import { rutasSnapshots, rutasVolumenes } from './ec2-almacen.js';
import { rutasEips, rutasGrupos, rutasLlaves } from './ec2-red.js';

const { h } = ui;

/* ============================================================ dashboard */

function panel(cx) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: 'Dashboard' }]);
  const e = cx.estado;
  const recurso = (texto, cuenta, ruta) =>
    h('div', { class: 'cx-resumen-recursos__item' }, ruta ? ui.enlace(texto, ruta, { cx }) : h('span', { class: 'cx-texto-sec' }, texto), h('span', {}, String(cuenta)));
  const recursos = cx.vivo(() =>
    ui.contenedor({
      titulo: 'Resources',
      descripcion: 'You are using the following Amazon EC2 resources in the United States (N. Virginia) Region:',
      acciones: ui.botonRefrescar(() => cx.refrescar()),
      cuerpo: h(
        'div',
        { class: 'cx-resumen-recursos' },
        recurso('Instances (running)', e.instancias.filter((i) => i.estado === 'running').length, 'ec2/instancias'),
        recurso('Auto Scaling Groups', 0),
        recurso('Capacity Reservations', 0),
        recurso('Dedicated Hosts', 0),
        recurso('Elastic IPs', e.eips.length, 'ec2/eips'),
        recurso('Instances', vivas(e).length, 'ec2/instancias'),
        recurso('Key pairs', e.llaves.length, 'ec2/llaves'),
        recurso('Load balancers', 0),
        recurso('Placement groups', 0),
        recurso('Security groups', e.gruposSeguridad.length, 'ec2/grupos'),
        recurso('Snapshots', e.snapshots.length, 'ec2/snapshots'),
        recurso('Volumes', e.volumenes.length, 'ec2/volumenes')
      )
    })
  );
  return h(
    'div',
    { class: 'cx-pagina' },
    recursos,
    h(
      'div',
      { class: 'cx-dos-columnas' },
      h(
        'div',
        { class: 'cx-pagina' },
        ui.contenedor({
          titulo: 'Launch instance',
          info: 'instancia',
          cx,
          descripcion: 'To get started, launch an Amazon EC2 instance, which is a virtual server in the cloud.',
          cuerpo: h('div', { class: 'cx-form' }, h('div', { class: 'cx-acciones' }, ui.boton('Launch instance', { variante: 'primario', alClic: () => cx.ir('ec2/instancias/lanzar') }), ui.boton('Migrate a server', { icono: 'external', desactivado: true })), h('p', { class: 'cx-texto-sec' }, 'Note: Your instances will launch in the United States (N. Virginia) Region'))
        }),
        ui.contenedor({
          titulo: 'Instance alarms',
          acciones: ui.boton('View in CloudWatch', { icono: 'external', desactivado: true }),
          cuerpo: h('div', { class: 'cx-acciones', style: { gap: '40px' } }, ui.estado('aviso', '0 in alarm'), ui.estado('exito', '0 OK'), ui.estado('detenido', '0 insufficient data'))
        })
      ),
      h(
        'div',
        { class: 'cx-lado' },
        ui.contenedor({ titulo: 'Service health', cuerpo: ui.estado('exito', 'This service is operating normally') }),
        ui.contenedor({
          titulo: 'Zones',
          sinRelleno: true,
          cuerpo: h(
            'table',
            { class: 'cx-tabla__tabla' },
            h('thead', {}, h('tr', {}, h('th', {}, h('span', { class: 'cx-tabla__orden' }, 'Zone name')), h('th', {}, h('span', { class: 'cx-tabla__orden' }, 'Zone ID')))),
            h('tbody', {}, ZONAS.map((z) => h('tr', {}, h('td', { style: { paddingLeft: '20px' } }, z), h('td', {}, ID_ZONA[z]))))
          )
        })
      )
    )
  );
}

function noDisponible(cx, { que }) {
  cx.migas([{ texto: 'EC2', ruta: 'ec2' }, { texto: que }]);
  return ui.noDisponible(que);
}

/* ================================================================ ayudas */

const ayudas = {
  instancia: {
    titulo: 'Instancia EC2',
    texto: [
      'Una **instancia** es una computadora virtual que rentas en la nube. La prendes, la apagas y la borras cuando quieras, y pagas por el tiempo que está prendida.',
      'Para crear una usas **Launch instances**: eliges el sistema operativo (AMI), el tamaño (instance type), la red donde vive y su firewall (security group).',
      'Si eliges varias filas en la lista, las acciones de **Instance state** se aplican a todas.'
    ]
  },
  ami: {
    titulo: 'AMI (imagen)',
    texto: [
      'La **AMI** es la plantilla del disco con el sistema operativo ya instalado: Amazon Linux, Ubuntu, Windows…',
      'Importa para el user data: Amazon Linux instala con `dnf` o `yum` y el servidor web se llama `httpd`; Ubuntu y Debian usan `apt` y `apache2`.',
      'Las que dicen **Free tier eligible** entran en la capa gratuita.'
    ]
  },
  'tipo-instancia': {
    titulo: 'Tipo de instancia',
    texto: [
      'El **instance type** dice cuánta CPU (vCPU) y memoria tiene la máquina. `t2.micro` = 1 vCPU y 1 GiB.',
      'La letra es la familia (t = propósito general, económica), el número la generación y lo último el tamaño (nano, micro, small…).',
      'Para cambiar el tipo de una instancia que ya existe, primero hay que **detenerla** (Stop).'
    ]
  },
  'par-llaves': {
    titulo: 'Par de llaves (key pair)',
    texto: [
      'Un **key pair** es como la llave de tu casa para entrar por SSH: AWS guarda el candado (llave pública) y tú descargas la llave (archivo .pem o .ppk).',
      'Solo se descarga **una vez**: si la pierdes, no hay copia.',
      'Si no vas a entrar por SSH (por ejemplo, solo quieres un servidor web), puedes elegir **Proceed without a key pair**.'
    ]
  },
  'red-instancia': {
    titulo: 'Configuración de red',
    texto: [
      'Aquí decides en qué **VPC** y en qué **subred** vive tu instancia, si recibe **IP pública** y qué **firewall** (security group) la protege.',
      'Pulsa **Edit** para elegir una VPC o subred distinta a la que trae por omisión.',
      'Para que la vean desde internet necesita: subred pública (ruta 0.0.0.0/0 al Internet Gateway), IP pública y una regla de entrada para su puerto.'
    ]
  },
  'ip-publica': {
    titulo: 'IP pública',
    texto: [
      'La **IP pública** es la dirección con la que te encuentran desde internet. Sin ella, nadie de fuera puede abrir tu página.',
      '**Auto-assign public IP**: Enable le da una al arrancar. Las subredes por omisión vienen en Enable; las que tú creas, en Disable.',
      'Ojo: si detienes y vuelves a prender la instancia, **la IP pública cambia**. Para una fija, usa una Elastic IP.',
      'El enlace **open address** abre la dirección con `https://`. Si tu servidor solo habla HTTP (puerto 80), cámbialo a `http://` en el navegador.'
    ]
  },
  'grupo-seguridad': {
    titulo: 'Security group',
    texto: [
      'Un **security group** es el firewall de la instancia: el guardia de la puerta. Por omisión **no deja entrar nada** y deja salir todo.',
      'Cada regla de entrada abre un puerto (22 SSH, 80 HTTP, 443 HTTPS…) desde un origen (una IP, un rango o todo internet).',
      'Recuerda las conexiones: si dejó entrar la petición, la respuesta sale sola (es *stateful*).',
      'El nombre no puede empezar con `sg-` y la descripción es obligatoria.'
    ]
  },
  'reglas-sg': {
    titulo: 'Reglas de entrada',
    texto: [
      '**Type** elige el servicio (SSH, HTTP…) y llena solo el protocolo y el puerto. Con **Custom TCP** escribes el puerto o un rango (`8000-8080`).',
      'Las reglas solo **permiten**: no existe una regla para negar. Lo que no está permitido, está bloqueado.'
    ]
  },
  'reglas-salida': {
    titulo: 'Reglas de salida',
    texto: ['Las reglas de salida dicen a dónde puede conectarse la instancia. Por omisión: **All traffic** a `0.0.0.0/0` (todo).']
  },
  'origen-regla': {
    titulo: 'Origen de la regla (Source)',
    texto: [
      [
        '**Anywhere-IPv4** = `0.0.0.0/0`: cualquier computadora del mundo.',
        '**My IP** = solo tu casa (tu IP pública con `/32`).',
        '**Custom** = escribe un rango CIDR (`10.0.0.0/16`) o elige otro security group (`sg-…`): entonces solo entran las instancias que tengan ese grupo.'
      ],
      'Una página web pública usa Anywhere en el puerto 80; SSH conviene dejarlo solo para My IP.'
    ]
  },
  almacenamiento: {
    titulo: 'Almacenamiento (EBS)',
    texto: [
      'El **root volume** es el disco donde vive el sistema operativo. Es un volumen **EBS**: un disco de red que existe aparte de la máquina.',
      '`gp3` es el disco SSD de uso general. La capa gratuita incluye hasta 30 GiB.',
      'Al terminar (Terminate) la instancia, el disco raíz se borra con ella; los discos extra que agregues pueden quedarse.'
    ]
  },
  'user-data': {
    titulo: 'User data',
    texto: [
      'El **user data** es un script que la instancia corre **sola, la primera vez que arranca**. Sirve para instalar y prender un servidor web sin entrar por SSH.',
      'Debe empezar con `#!/bin/bash`. Ejemplo para Amazon Linux:',
      ['`dnf install -y httpd`', '`echo "<h1>Hola</h1>" > /var/www/html/index.html`', '`systemctl enable --now httpd`'],
      'Si lo editas después (Actions → Instance settings → Edit user data), **ya no vuelve a correr** en los siguientes arranques.',
      'Para saber si funcionó: Actions → Monitor and troubleshoot → **Get system log**.'
    ]
  },
  'perfil-iam': {
    titulo: 'Rol de IAM (instance profile)',
    texto: [
      'Un **rol** le da permisos a la instancia para usar otros servicios de AWS (por ejemplo leer un bucket de S3) **sin guardar contraseñas ni llaves** dentro de ella.',
      'Los roles se crean en IAM y deben confiar en el servicio EC2.'
    ]
  },
  'estado-instancia': {
    titulo: 'Estados de una instancia',
    texto: [
      [
        '**Pending**: arrancando.',
        '**Running**: prendida (se cobra).',
        '**Stopping / Stopped**: apagada; no se cobra la máquina, sí los discos. Al prenderla cambia su IP pública.',
        '**Shutting-down / Terminated**: borrada para siempre.'
      ]
    ]
  },
  chequeos: {
    titulo: 'Status checks',
    texto: ['Al arrancar, AWS revisa el hardware (*system*) y que el sistema operativo responda (*instance*). Mientras dice **Initializing** todavía no termina de arrancar; espera a **2/2 checks passed**.']
  },
  conectar: {
    titulo: 'Conectarse a la instancia',
    texto: [
      'En AWS real puedes abrir una terminal con **EC2 Instance Connect** o con tu cliente SSH y tu archivo `.pem`.',
      'En el simulador no hay terminal: revisa tu servidor abriendo su IP pública con el **Navegador** (arriba) y mira el **System log**.'
    ]
  },
  'system-log': {
    titulo: 'System log',
    texto: [
      'Es lo que la instancia escribió en su pantalla al arrancar. Busca las líneas de `cloud-init`: ahí ves si tu user data instaló el servidor o si falló (por ejemplo `command not found`).',
      'Solo aparece cuando la instancia ya arrancó al menos una vez.'
    ]
  },
  volumen: {
    titulo: 'Volumen EBS',
    texto: [
      'Un **volumen** es un disco duro de red para tus instancias. Vive en **una sola zona de disponibilidad**.',
      'Solo puedes conectarlo (**Attach volume**) a una instancia **de la misma zona**. Si tu instancia está en `us-east-1b`, crea el volumen en `us-east-1b`.',
      'Para borrar un volumen conectado, primero desconéctalo (**Detach**).'
    ]
  },
  zona: {
    titulo: 'Zona de disponibilidad',
    texto: [
      'Una **zona de disponibilidad** (`us-east-1a`, `us-east-1b`…) es un centro de datos separado dentro de la región.',
      'Los volúmenes EBS y las subredes viven en una sola zona: un volumen solo se conecta a instancias de su misma zona.'
    ]
  },
  snapshot: {
    titulo: 'Snapshot',
    texto: [
      'Un **snapshot** es una foto (respaldo) de un volumen en un momento dado. Se guarda aparte y sobrevive aunque borres el volumen.',
      'Tarda un rato: mientras dice **Pending** está copiando. Cuando dice **Completed** ya puedes crear un volumen nuevo a partir de él, incluso en otra zona.'
    ]
  },
  eip: {
    titulo: 'Elastic IP',
    texto: [
      'Una **Elastic IP** es una IP pública **fija** que reservas para tu cuenta. Se la asocias a una instancia y no cambia aunque la detengas y la vuelvas a prender.',
      'Mientras la tengas reservada y sin usar, AWS la cobra: libérala (**Release**) cuando ya no la necesites.',
      'Un NAT gateway público también necesita una Elastic IP.'
    ]
  }
};

/* ================================================================ registro */

const des = (texto) => ({ texto, desactivado: true });

export default {
  id: 'ec2',
  nombre: 'EC2',
  titulo: 'EC2',
  descripcion: 'Virtual Servers in the Cloud',
  categoria: 'computo',
  claves: 'instances servers virtual machines computo servidores',
  inicio: 'ec2',
  menu: [
    { texto: 'Dashboard', ruta: 'ec2' },
    { texto: 'AWS Global View', externo: true, desactivado: true },
    { texto: 'Events', desactivado: true },
    {
      seccion: 'Instances',
      items: [{ texto: 'Instances', ruta: 'ec2/instancias' }, { texto: 'Instance Types', ruta: 'ec2/tipos' }, des('Launch Templates'), des('Spot Requests'), des('Savings Plans'), des('Reserved Instances'), des('Dedicated Hosts'), des('Capacity Reservations')]
    },
    { seccion: 'Images', items: [des('AMIs'), des('AMI Catalog')] },
    { seccion: 'Elastic Block Store', items: [{ texto: 'Volumes', ruta: 'ec2/volumenes' }, { texto: 'Snapshots', ruta: 'ec2/snapshots' }, des('Lifecycle Manager')] },
    {
      seccion: 'Network & Security',
      items: [{ texto: 'Security Groups', ruta: 'ec2/grupos' }, { texto: 'Elastic IPs', ruta: 'ec2/eips' }, des('Placement Groups'), { texto: 'Key Pairs', ruta: 'ec2/llaves' }, des('Network Interfaces')]
    },
    { seccion: 'Load Balancing', items: [des('Load Balancers'), des('Target Groups')] },
    { seccion: 'Auto Scaling', items: [des('Auto Scaling Groups')] }
  ],
  rutas: {
    '': panel,
    ...rutasInstancias,
    ...rutasVolumenes,
    ...rutasSnapshots,
    ...rutasGrupos,
    ...rutasEips,
    ...rutasLlaves,
    'etiquetas/:id': paginaEtiquetas,
    'no-disponible/:que': noDisponible
  },
  busqueda: [
    { texto: 'Instances', ruta: 'ec2/instancias', claves: 'servidores' },
    { texto: 'Launch instance', ruta: 'ec2/instancias/lanzar' },
    { texto: 'Security groups', ruta: 'ec2/grupos', claves: 'firewall' },
    { texto: 'Volumes', ruta: 'ec2/volumenes', claves: 'ebs disk' },
    { texto: 'Snapshots', ruta: 'ec2/snapshots', claves: 'backup' },
    { texto: 'Elastic IPs', ruta: 'ec2/eips' },
    { texto: 'Key pairs', ruta: 'ec2/llaves' },
    { texto: 'Instance types', ruta: 'ec2/tipos' }
  ],
  ayudas
};
