// Examen final · parte práctica · «Envíos Huasteca rastrea sus paquetes».
//
// Un caso integrador NUEVO (distinto de las prácticas 1 a 5): una paquetería
// de Tampico pone en la nube su página de rastreo de guías, que se cae cada
// diciembre. El alumno arma TODO desde una cuenta vacía, en 60 minutos y sin
// pistas:
//   - la red propia en dos zonas (VPC and more, con NAT para las privadas);
//   - las puertas encadenadas (internet → balanceador → servidores, sin SSH);
//   - el cómputo con alta disponibilidad (ALB + Auto Scaling en las privadas,
//     con ELB health checks);
//   - una base NoSQL administrada (DynamoDB on-demand, con PITR y protección
//     contra borrado) y la guía de prueba;
//   - el rol de IAM con el que los servidores escriben en la tabla sin llaves;
//   - el bucket de las fotos de entrega protegido (bloqueo, versionado,
//     SSE-KMS) y con ciclo de vida (Glacier Instant Retrieval y borrado a los
//     5 años que pide el SAT);
//   - el monitoreo que avisa cuando un servidor se enferma (alarma de
//     UnHealthyHostCount → SNS con el correo confirmado);
//   - el gobierno del gasto: la etiqueta Proyecto activada como etiqueta de
//     asignación de costos y un presupuesto con alerta.
// El bono: que el grupo crezca con las peticiones por servidor (target
// tracking de ALBRequestCountPerTarget).
//
// Las tareas piden RESULTADOS de negocio, no clics, y no hay pistas: es el
// examen. Los nombres sugeridos no se califican; solo la tabla y el bucket,
// que llevan el sufijo del alumno.
//
// Datos distintos por alumno: la red sale de su octeto; la tabla, el bucket,
// la guía de prueba y la página llevan su sufijo; los días de archivo, el
// destino de la guía, el monto del presupuesto y el porcentaje de la alerta
// cambian con su octeto.

import { cuentaNueva } from '../consola/modelo.js';
import { bloque, c, vinetas } from './util.js';

/** El script que instala la página de rastreo: cada servidor dice en qué zona vive. */
const scriptRastreo = (sufijo) =>
  [
    '#!/bin/bash',
    'dnf install -y httpd',
    `echo "<h1>Envios Huasteca</h1><p>Rastrea tu guia - centro ${sufijo}</p><p>Te atiende el servidor de la zona $(ec2-metadata -z | cut -d ' ' -f 2)</p>" > /var/www/html/index.html`,
    'systemctl enable --now httpd'
  ].join('\n');

export function datosLab(d) {
  const v = d.octeto % 4;
  const w = Math.floor(d.octeto / 4) % 4;
  const guia = `EH-${String(d.sufijo).toUpperCase()}-0001`;
  return {
    sufijo: d.sufijo,
    ipCasa: d.ipCasa,
    // La red (nombres sugeridos)
    vpcCidr: d.vpcCidr,
    prefijo: 'huasteca',
    vpcNombre: 'huasteca-vpc',
    sgAlb: 'rastreo-alb-sg',
    sgWeb: 'rastreo-web-sg',
    // El sitio de rastreo (nombres sugeridos: no se califican)
    plantilla: 'rastreo-plantilla',
    tg: 'rastreo-tg',
    alb: 'rastreo-alb',
    asg: 'rastreo-asg',
    textoPagina: `centro ${d.sufijo}`,
    userData: scriptRastreo(d.sufijo),
    // Las guías (la tabla lleva el sufijo: se califica el nombre)
    tabla: `guias-${d.sufijo}`,
    pk: 'numeroGuia',
    guia,
    estadoGuia: 'En camino',
    destino: ['Tampico', 'Ciudad Valles', 'Tuxpan', 'Pánuco'][v],
    // El acceso de los servidores
    rol: 'rastreo-ec2-rol',
    politica: 'AmazonDynamoDBFullAccess',
    // Las fotos de entrega
    bucket: `huasteca-evidencias-${d.sufijo}`,
    diasArchivo: [30, 45, 60, 90][w],
    diasBorrar: 1825,
    // El monitoreo
    tema: 'alertas-rastreo',
    correo: 'ti@envioshuasteca.mx',
    // El gasto
    etiqueta: { llave: 'Proyecto', valor: 'rastreo' },
    presupuesto: 'rastreo-mensual',
    monto: [150, 200, 250, 300][v],
    porcentaje: [70, 75, 80, 85][(v + w) % 4],
    // El bono
    peticiones: 100,
    maximo: 4
  };
}

export const LAB = {
  id: 'final',
  titulo: 'Envíos Huasteca rastrea sus paquetes',
  minutos: 60,
  pistas: false,
  historia: `
    <p><strong>Envíos Huasteca</strong> es una paquetería de Tampico con 40 sucursales en Tamaulipas, San Luis Potosí y Veracruz. Su página para <strong>rastrear guías</strong> vive en <strong>una sola computadora</strong> en la oficina central: cada diciembre se cae con el tráfico de fin de año, las guías están en una hoja de cálculo que se corrompió dos veces, y las fotos de entrega (con la firma y la identificación de quien recibe) se quedaron una vez en una carpeta pública.</p>
    <p>La dirección decidió llevar todo a <strong>AWS</strong> y te lo encargó. La cuenta está <strong>vacía</strong>: tú armas la red, los servidores, los datos, las alertas y el control del gasto. Cada tarea dice el <strong>resultado</strong> que necesita la empresa, no los clics: tú decides cómo llegar ahí. Los nombres que se sugieren no se califican; los que llevan tu sufijo (${c('guias-…')} y ${c('huasteca-evidencias-…')}) sí deben ser exactos.</p>
    <p>Es el <strong>examen final</strong>: 60 minutos, <strong>sin pistas</strong> y <strong>una sola entrega</strong>. Todo va en <strong>N. Virginia (us-east-1)</strong>. Algunas cosas tardan (el balanceador y los servidores, unos 20 segundos): mientras esperas, avanza con otra tarea. Las ocho tareas requeridas suman 100 puntos; la novena es un <strong>bono opcional</strong> que compensa errores, pero tu calificación nunca pasa de 100.</p>`,

  estadoInicial(datos) {
    // La cuenta empieza vacía: solo lo que trae cualquier cuenta nueva (la VPC por omisión).
    return cuentaNueva(datos);
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'red',
        titulo: 'Una red propia en dos zonas',
        puntos: 10,
        html: `
          <p>La empresa no quiere nada en la VPC por omisión. Necesita su propia red:</p>
          ${vinetas([
            `Una VPC con el bloque ${c(x.vpcCidr)} (nombre sugerido: ${c(x.vpcNombre)}).`,
            `Dos subredes <strong>públicas</strong>, una en cada una de dos zonas de disponibilidad, que salgan a internet por un Internet Gateway.`,
            `Dos subredes <strong>privadas</strong>, en esas mismas dos zonas, que <strong>no</strong> se puedan alcanzar desde internet, pero que sí puedan salir a descargar paquetes (por un NAT gateway).`
          ])}`
      },
      {
        id: 'puertas',
        titulo: 'Solo se entra por la puerta principal',
        puntos: 10,
        html: `
          <p>Las puertas de la red (grupos de seguridad):</p>
          ${vinetas([
            `El balanceador recibe HTTP (80) de <strong>cualquier lugar</strong>: los clientes rastrean desde su casa o su celular (nombre sugerido: ${c(x.sgAlb)}).`,
            `A los servidores solo les llega HTTP (80) <strong>desde el balanceador</strong>, nunca directo desde una IP de internet (nombre sugerido: ${c(x.sgWeb)}).`,
            'Nadie de internet puede intentar entrar por SSH (22) a los servidores.'
          ])}`
      },
      {
        id: 'rastreo',
        titulo: 'La página de rastreo no se cae en diciembre',
        puntos: 25,
        html: `
          <p>La página debe seguir en línea aunque se caiga un servidor o una zona completa, y los servidores no deben quedar expuestos a internet.</p>
          ${vinetas([
            `Un <strong>Application Load Balancer</strong> <em>internet-facing</em>, en las dos subredes <strong>públicas</strong>, que reciba HTTP (80) y reparta a un grupo de destino.`,
            `Un <strong>grupo de Auto Scaling</strong> que use una <em>launch template</em> (Amazon Linux 2023, ${c('t3.micro')} o ${c('t2.micro')}) con este script en <em>User data</em>, tal cual:`
          ])}
          ${bloque(x.userData)}
          ${vinetas([
            'Los servidores viven en las dos subredes <strong>privadas</strong> y no tienen IP pública.',
            'Siempre hay <strong>al menos 2</strong> servidores sanos, uno en cada zona.',
            'Si la página de un servidor deja de contestar, el grupo lo reemplaza solo: usa las revisiones de salud del balanceador.'
          ])}
          <p>Al final, el DNS del balanceador debe abrir la página y decir «${x.textoPagina}». Nombres sugeridos: ${c(x.plantilla)}, ${c(x.tg)}, ${c(x.alb)} y ${c(x.asg)}.</p>`
      },
      {
        id: 'guias',
        titulo: 'Las guías en una base que no se corrompe',
        puntos: 15,
        html: `
          <p>Las guías dejan la hoja de cálculo y pasan a <strong>DynamoDB</strong>: cada consulta busca una guía por su número.</p>
          ${vinetas([
            `Una tabla llamada exactamente ${c(x.tabla)}, cuya llave de partición es ${c(x.pk)} (texto, <em>String</em>).`,
            'Nadie sabe cuánto tráfico habrá en diciembre: que la tabla <strong>cobre por petición</strong>, sin capacidad que planear.',
            'Si alguien borra o daña guías por error, se debe poder <strong>regresar la tabla a cualquier segundo</strong> de los últimos días.',
            'Nadie puede <strong>borrar la tabla</strong> por accidente.',
            `Registra la guía de prueba: ${c(x.pk)} = ${c(x.guia)}, con el atributo ${c('estado')} = ${c(x.estadoGuia)} y ${c('destino')} = ${c(x.destino)}.`
          ])}`
      },
      {
        id: 'acceso',
        titulo: 'Los servidores escriben guías sin llaves',
        puntos: 5,
        html: `
          <p>La página registra los movimientos de cada guía en la tabla. Nadie debe guardar llaves de acceso en el código, y los servidores no deben poder tocar nada fuera de DynamoDB.</p>
          ${vinetas([
            `Un rol de IAM para EC2 (nombre sugerido: ${c(x.rol)}) con permisos <strong>solo de DynamoDB</strong>.`,
            '<strong>Todos</strong> los servidores del sitio de rastreo usan ese rol.'
          ])}`
      },
      {
        id: 'evidencias',
        titulo: 'Las fotos de entrega, protegidas y baratas',
        puntos: 15,
        html: `
          <p>Cada entrega deja una foto con la firma y la identificación de quien recibe: son <strong>datos personales</strong>. Las primeras semanas se consultan seguido (aclaraciones); después casi nunca, pero cuando hay una queja se deben ver <strong>al instante</strong>. El SAT pide conservarlas <strong>5 años</strong>.</p>
          ${vinetas([
            `Un bucket llamado exactamente ${c(x.bucket)}.`,
            'Nadie de internet puede ver las fotos: <strong>todo</strong> el acceso público bloqueado.',
            'Si alguien sobrescribe o borra una foto por error, se puede recuperar.',
            'Las fotos se cifran con una llave de <strong>KMS</strong>, para que cada uso de la llave quede registrado.',
            `Todas las fotos pasan a ${c('Glacier Instant Retrieval')} a los <strong>${x.diasArchivo} días</strong>, y se borran a los <strong>${x.diasBorrar} días</strong> (5 años), no antes.`
          ])}`
      },
      {
        id: 'alertas',
        titulo: 'TI se entera cuando un servidor se enferma',
        puntos: 10,
        html: `
          <p>Con la computadora vieja, TI se enteraba de las caídas por las quejas en redes sociales.</p>
          ${vinetas([
            `Un tema de SNS (nombre sugerido: ${c(x.tema)}) con el correo ${c(x.correo)} <strong>confirmado</strong>.`,
            'Una alarma de CloudWatch que se active en cuanto el balanceador vea <strong>al menos un servidor enfermo</strong> (unhealthy) en el grupo de destino del sitio de rastreo.',
            'Cuando la alarma se active, TI recibe el correo a través de ese tema.'
          ])}`
      },
      {
        id: 'costos',
        titulo: 'Cuánto cuesta el rastreo, y que no se pase',
        puntos: 10,
        html: `
          <p>Contabilidad quiere ver en la factura cuánto cuesta el proyecto de rastreo y que nadie se lleve sorpresas.</p>
          ${vinetas([
            `La etiqueta ${c(`${x.etiqueta.llave} = ${x.etiqueta.valor}`)} en los <strong>servidores</strong> del sitio de rastreo, en la <strong>tabla</strong> y en el <strong>bucket</strong>.`,
            `Esa etiqueta activada para que aparezca en la factura y en Cost Explorer (etiqueta de asignación de costos).`,
            `Un presupuesto de costo <strong>mensual</strong> de ${c(String(x.monto))} USD (nombre sugerido: ${c(x.presupuesto)}) que avise por correo cuando el gasto <strong>real</strong> llegue al <strong>${x.porcentaje} %</strong>.`
          ])}`
      },
      {
        id: 'escala',
        titulo: 'Que crezca solo con las visitas',
        puntos: 8,
        bono: true,
        html: `
          <p><strong>Opcional.</strong> En diciembre las visitas se multiplican por diez. Si te sobra tiempo, haz que el sitio crezca y se encoja solo según las <strong>peticiones</strong> que recibe: suma hasta <strong>8 puntos extra</strong>, que compensan errores de las otras tareas, pero tu calificación nunca pasa de 100.</p>
          ${vinetas([
            `Una política de <em>target tracking</em> en el grupo del sitio que mantenga cerca de <strong>${x.peticiones} peticiones por servidor</strong> (la métrica del balanceador, no la CPU).`,
            `Espacio para crecer: capacidad máxima de <strong>${x.maximo} a 10</strong> servidores.`
          ])}`
      }
    ];
  }
};
