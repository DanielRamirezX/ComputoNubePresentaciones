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

import { cuentaNueva, itemDynamoPlano } from '../consola/modelo.js';
import { esSubredPublica, salePorNat } from '../consola/red.js';
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
  },

  // El diagrama del modal «Arquitectura» (SIMULADOR.md §6.6). Es un EXAMEN:
  // el diagrama solo dibuja lo que las tareas ya nombran y con sus palabras
  // (el resultado, no el cómo). No dice qué opción de DynamoDB o de S3 da cada
  // resultado, ni dónde va el NAT, ni cómo llega el rol a los servidores, ni
  // qué métrica vigila la alarma. Los detectores son presencia pura («ya hay
  // algo así en tu cuenta»): la calificación vive solo en el servidor.
  arquitectura(datos) {
    const x = datosLab(datos);
    const { llave } = x.etiqueta;

    // Lo que se reconoce en la cuenta (todo tolera una cuenta de octubre).
    // La red se busca en las VPC propias: la VPC por omisión nunca cuenta.
    const propias = (e) => new Set((e.vpcs ?? []).filter((v) => !v.porDefecto).map((v) => v.id));
    const subredes = (e) => {
      const ids = propias(e);
      return (e.subredes ?? []).filter((s) => ids.has(s.vpcId));
    };
    const publicas = (e) => subredes(e).filter((s) => esSubredPublica(e, s.id));
    const privadas = (e) => subredes(e).filter((s) => !esSubredPublica(e, s.id) && salePorNat(e, s.id));
    const zonas = (lista) => new Set(lista.map((s) => s.az)).size;
    const cubre = (r, puerto) => r.protocolo === '-1' || (r.protocolo === 'tcp' && r.desde <= puerto && puerto <= r.hasta);
    /** ¿Algún grupo de seguridad de una VPC propia abre ese puerto desde ese origen? */
    const abre = (e, puerto, origen) => {
      const ids = propias(e);
      return (e.gruposSeguridad ?? []).some((g) => ids.has(g.vpcId) && (g.entrada ?? []).some((r) => cubre(r, puerto) && origen(String(r.origen ?? ''), g)));
    };
    // Desde OTRO grupo: el grupo «default» de toda VPC nueva se deja entrar a sí
    // mismo (sin esto, crear la VPC ya encendía «80 solo del ALB»).
    const deOtroGrupo = (o, g) => o.startsWith('sg-') && o !== g.id;
    const albs = (e) => {
      const ids = propias(e);
      return (e.elb?.balanceadores ?? []).filter((b) => b.tipo === 'application' && ids.has(b.vpcId));
    };
    const asgs = (e) => {
      const ids = new Set(subredes(e).map((s) => s.id));
      return (e.autoscaling?.grupos ?? []).filter((g) => g.estado === 'activo' && (g.subredes ?? []).some((id) => ids.has(id)));
    };
    const enServicio = (e) => asgs(e).flatMap((g) => (g.instancias ?? []).filter((m) => m.ciclo === 'InService'));
    const tabla = (e) => (e.dynamodb?.tablas ?? []).find((t) => t.nombre === x.tabla && t.estado !== 'DELETING') ?? null;
    const bucket = (e) => (e.buckets ?? []).find((b) => b.nombre === x.bucket) ?? null;
    const alarmas = (e) => (e.cloudwatch?.alarmas ?? []).filter((a) => !a.creadaPor && !String(a.nombre).startsWith('TargetTracking-'));
    const conLlave = (lista) => (lista ?? []).some((t) => t?.llave === llave);
    const etiquetado = (e) =>
      (e.instancias ?? []).some((i) => i.estado !== 'terminated' && conLlave(i.etiquetas)) ||
      (e.autoscaling?.grupos ?? []).some((g) => conLlave(g.etiquetas)) ||
      (e.autoscaling?.plantillas ?? []).some((p) => (p.versiones ?? []).some((v) => conLlave(v.datos?.etiquetas))) ||
      (e.dynamodb?.tablas ?? []).some((t) => conLlave(t.etiquetas)) ||
      (e.buckets ?? []).some((b) => conLlave(b.etiquetas));

    return {
      titulo: 'Envíos Huasteca en AWS',
      objetivo: 'La página de rastreo sigue en línea aunque falle un servidor o una zona; las guías y las fotos de entrega quedan protegidas, TI se entera de los problemas y el gasto está a la vista.',
      columnas: 10.5,
      filas: 8.65,
      piezas: [
        // La región, la VPC, las dos zonas (el alumno elige cuáles) y sus cuatro subredes.
        { id: 'region', tipo: 'nube', etiqueta: 'Región N. Virginia', detalle: 'us-east-1', col: 0.1, fila: 1, ancho: 10.3, alto: 5.78 },
        { id: 'vpc', tipo: 'vpc', etiqueta: 'VPC de la empresa', detalle: x.vpcCidr, en: 'region', col: 0.25, fila: 1.4, ancho: 6.2, alto: 5.26,
          tarea: 'red', checks: ['vpc'], hecho: (e) => (e.vpcs ?? []).some((v) => !v.porDefecto && v.cidr === x.vpcCidr) },
        { id: 'zona-a', tipo: 'az', etiqueta: 'Zona A', detalle: 'p. ej. us-east-1a', en: 'vpc', col: 0.4, fila: 2.5, ancho: 2.9, alto: 4.04 },
        { id: 'zona-b', tipo: 'az', etiqueta: 'Zona B', detalle: 'p. ej. us-east-1b', en: 'vpc', col: 3.4, fila: 2.5, ancho: 2.9, alto: 4.04 },
        // «A» se cumple con una subred de ese tipo; «B», con subredes en dos zonas distintas.
        // Pública: sale a internet por un Internet Gateway. Privada: no, pero sale por un NAT.
        { id: 'publica-a', tipo: 'subred-publica', etiqueta: 'Subred pública', en: 'zona-a', col: 0.55, fila: 2.9, ancho: 2.6, alto: 1.45,
          tarea: 'red', checks: ['publicas'], hecho: (e) => publicas(e).length >= 1 },
        { id: 'publica-b', tipo: 'subred-publica', etiqueta: 'Subred pública', en: 'zona-b', col: 3.55, fila: 2.9, ancho: 2.6, alto: 1.45,
          tarea: 'red', checks: ['publicas'], hecho: (e) => zonas(publicas(e)) >= 2 },
        { id: 'privada-a', tipo: 'subred-privada', etiqueta: 'Subred privada', en: 'zona-a', col: 0.55, fila: 4.5, ancho: 2.6, alto: 1.92,
          tarea: 'red', checks: ['privadas'], hecho: (e) => privadas(e).length >= 1 },
        { id: 'privada-b', tipo: 'subred-privada', etiqueta: 'Subred privada', en: 'zona-b', col: 3.55, fila: 4.5, ancho: 2.6, alto: 1.92,
          tarea: 'red', checks: ['privadas'], hecho: (e) => zonas(privadas(e)) >= 2 },
        // El grupo de Auto Scaling cruza las dos zonas (punteado, sin relleno).
        { id: 'asg', tipo: 'grupo', etiqueta: 'Grupo de Auto Scaling', detalle: `${x.asg} · 2 o más`, en: 'vpc', col: 0.65, fila: 4.85, ancho: 5.45, alto: 1.45,
          tarea: 'rastreo', checks: ['asg', 'chequeo-elb'], hecho: (e) => asgs(e).length > 0 },
        // Lo que vive en la cuenta, no en una región.
        { id: 'global', tipo: 'grupo', etiqueta: 'Toda la cuenta (global)', col: 0.1, fila: 7.1, ancho: 10.3, alto: 1.45 },

        // Fuera de AWS.
        { id: 'clientes', tipo: 'usuarios', etiqueta: 'Clientes', detalle: 'casa o celular', col: 2.85, fila: 0 },
        { id: 'correo', tipo: 'correo', etiqueta: 'Correo de TI', detalle: x.correo, col: 6.65, fila: 0 },

        // La entrada. El Internet Gateway y el NAT son de la tarea 1, pero los
        // marcan las subredes (pública = sale por el IGW; privada = sale por el NAT).
        // El NAT va a nivel de VPC a propósito: dónde vive es parte del examen.
        { id: 'igw', tipo: 'igw', etiqueta: 'Internet Gateway', en: 'vpc', col: 2.85, fila: 1.5 },
        { id: 'nat', tipo: 'nat', etiqueta: 'NAT gateway', detalle: 'salida a internet', en: 'vpc', col: 4.5, fila: 1.5 },
        { id: 'alb', tipo: 'alb', etiqueta: 'Balanceador', detalle: x.alb, en: 'vpc', col: 2.85, fila: 3.25,
          tarea: 'rastreo', checks: ['alb', 'pagina'], hecho: (e) => albs(e).length > 0 },
        { id: 'tg', tipo: 'grupo-destino', etiqueta: 'Grupo de destino', detalle: x.tg, en: 'publica-b', col: 4.5, fila: 3.25,
          tarea: 'rastreo', checks: ['sanos'], hecho: (e) => { const ids = propias(e); return (e.elb?.gruposDestino ?? []).some((t) => ids.has(t.vpcId)); } },

        // Los servidores (en el grupo) y el bono.
        { id: 'plantilla', tipo: 'plantilla', etiqueta: 'Launch template', detalle: x.plantilla, en: 'asg', col: 0.8, fila: 5.2,
          tarea: 'rastreo', checks: ['asg'], hecho: (e) => (e.autoscaling?.plantillas ?? []).length > 0 },
        { id: 'web-a', tipo: 'ec2', etiqueta: 'Servidor', detalle: 'zona A', en: 'asg', col: 2, fila: 5.2,
          tarea: 'rastreo', checks: ['privadas', 'sanos'], hecho: (e) => enServicio(e).length >= 1 },
        { id: 'web-b', tipo: 'ec2', etiqueta: 'Servidor', detalle: 'zona B', en: 'asg', col: 3.65, fila: 5.2,
          tarea: 'rastreo', checks: ['privadas', 'sanos'], hecho: (e) => zonas(enServicio(e)) >= 2 },
        { id: 'escala', tipo: 'asg', etiqueta: 'Crece con las visitas', detalle: `~${x.peticiones} pet./servidor`, en: 'asg', col: 4.95, fila: 5.2,
          tarea: 'escala', bono: true, checks: ['politica', 'maximo'],
          hecho: (e) => asgs(e).some((g) => (g.politicas ?? []).some((p) => p.tipo === 'TargetTrackingScaling')) },

        // Los servicios de la región, fuera de la VPC.
        { id: 'tema', tipo: 'sns', etiqueta: 'Tema de avisos', detalle: x.tema, en: 'region', col: 6.65, fila: 1.5,
          tarea: 'alertas', checks: ['tema'],
          hecho: (e) => (e.sns?.temas ?? []).some((t) => (t.suscripciones ?? []).some((s) => String(s.protocolo).startsWith('email') && s.estado === 'Confirmed')) },
        { id: 'alarma', tipo: 'cloudwatch', etiqueta: 'Alarma', detalle: 'servidor enfermo', en: 'region', col: 6.65, fila: 3.25,
          tarea: 'alertas', checks: ['alarma'], hecho: (e) => alarmas(e).length > 0 },
        { id: 'tabla', tipo: 'dynamodb', etiqueta: 'Tabla de guías', detalle: x.tabla, en: 'region', col: 6.65, fila: 5.2,
          tarea: 'guias', checks: ['existe', 'ondemand', 'pitr', 'proteccion'], hecho: (e) => Boolean(tabla(e)) },
        { id: 'guia', tipo: 'generico', etiqueta: 'Guía de prueba', detalle: x.guia, en: 'region', col: 7.95, fila: 5.2,
          tarea: 'guias', checks: ['item'],
          hecho: (e) => (tabla(e)?.items ?? []).some((i) => String(itemDynamoPlano(i)?.[x.pk] ?? '').trim() === x.guia) },
        { id: 'kms', tipo: 'kms', etiqueta: 'Llave de KMS', en: 'region', col: 9.25, fila: 1.5,
          tarea: 'evidencias', checks: ['cifrado'], hecho: (e) => String(bucket(e)?.cifrado?.tipo ?? '').includes('KMS') },
        { id: 'fotos', tipo: 's3', etiqueta: 'Fotos de entrega', detalle: x.bucket, en: 'region', col: 9.25, fila: 3.25,
          tarea: 'evidencias', checks: ['existe', 'bloqueo', 'versionado'], hecho: (e) => Boolean(bucket(e)) },
        { id: 'glacier', tipo: 'glacier', etiqueta: 'Glacier Instant Retrieval', detalle: 'se borran a 5 años', en: 'region', col: 9.25, fila: 5.2,
          tarea: 'evidencias', checks: ['archivo', 'borrado'], hecho: (e) => (bucket(e)?.ciclo ?? []).length > 0 },

        // Lo global: el rol de los servidores y el control del gasto.
        { id: 'rol', tipo: 'iam-rol', etiqueta: 'Rol de los servidores', detalle: x.rol, en: 'global', col: 2, fila: 7.45,
          tarea: 'acceso', checks: ['minimo'], hecho: (e) => (e.iam?.roles ?? []).some((r) => r.servicio === 'ec2.amazonaws.com') },
        { id: 'etiqueta', tipo: 'etiqueta', etiqueta: 'Etiqueta del proyecto', detalle: `${llave} = ${x.etiqueta.valor}`, en: 'global', col: 5.7, fila: 7.45,
          tarea: 'costos', checks: ['etiquetas-servidores', 'etiquetas-datos'], hecho: etiquetado },
        { id: 'factura', tipo: 'cost-explorer', etiqueta: 'Factura y Cost Explorer', en: 'global', col: 7.2, fila: 7.45,
          tarea: 'costos', checks: ['activa'], hecho: (e) => (e.costos?.etiquetasActivas ?? []).includes(llave) },
        { id: 'presupuesto', tipo: 'presupuesto', etiqueta: 'Presupuesto mensual', detalle: `${x.monto} USD · al ${x.porcentaje} %`, en: 'global', col: 8.9, fila: 7.45,
          tarea: 'costos', checks: ['monto', 'alerta'], hecho: (e) => (e.costos?.presupuestos ?? []).length > 0 }
      ],
      flechas: [
        // El camino de un cliente. Las dos puertas (grupos de seguridad) son las flechas con puerto.
        { de: 'clientes', a: 'igw', texto: 'HTTP 80',
          tarea: 'puertas', checks: ['alb-abierto'], hecho: (e) => abre(e, 80, (o) => o === '0.0.0.0/0') },
        { de: 'igw', a: 'alb' },
        { de: 'alb', a: 'tg', texto: 'reparte' },
        { de: 'tg', a: 'asg', texto: '80 solo del ALB',
          tarea: 'puertas', checks: ['web-solo-alb', 'sin-ssh'], hecho: (e) => abre(e, 80, deOtroGrupo) },
        { de: 'asg', a: 'tabla' },
        // Apoyo (punteadas): el permiso, la vigilancia, el aviso, la llave y el archivo.
        { de: 'rol', a: 'asg', tipo: 'apoyo', texto: 'lo usan todos',
          tarea: 'acceso', checks: ['rol'],
          hecho: (e) => { const ids = new Set(enServicio(e).map((m) => m.id)); return (e.instancias ?? []).some((i) => ids.has(i.id) && i.rolIam); } },
        { de: 'tg', a: 'alarma', tipo: 'apoyo' },
        { de: 'alarma', a: 'tema', tipo: 'apoyo', texto: 'avisa',
          tarea: 'alertas', checks: ['aviso'], hecho: (e) => alarmas(e).some((a) => (a.acciones?.ALARM ?? []).some((arn) => String(arn).startsWith('arn:aws:sns:'))) },
        { de: 'tema', a: 'correo', tipo: 'apoyo', texto: 'correo' },
        { de: 'kms', a: 'fotos', tipo: 'apoyo', texto: 'cifra' },
        { de: 'fotos', a: 'glacier', tipo: 'apoyo', texto: `a los ${x.diasArchivo} días` },
        { de: 'etiqueta', a: 'factura', tipo: 'apoyo', texto: 'activada' }
      ]
    };
  }
};
