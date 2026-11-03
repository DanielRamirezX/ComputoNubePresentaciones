// Práctica integradora 4 (sesión 12 de la Ruta AWS) · Gobierno y costos.
// «Café del Bajío ordena sus cuentas»: una cadena de cafeterías de Guanajuato
// heredó una cuenta de AWS desordenada (el técnico anterior se fue). El alumno
// atiende lo que Trusted Advisor marca en rojo (snapshot público, SSH abierto,
// raíz sin MFA), ahorra (IP elástica suelta, servidor sobrado de tamaño),
// separa Producción y Pruebas con AWS Organizations y una SCP de regiones,
// reparte el gasto con etiquetas y Cost Explorer, pone un presupuesto con
// alertas, estima con la Pricing Calculator (On-Demand contra Savings Plans),
// elige el plan de soporte y hace una revisión Well-Architected. El bono es un
// presupuesto solo para lo de Pruebas (filtrado por etiqueta).
//
// Datos distintos por alumno: los nombres de las cuentas, la estimación y la
// carga de trabajo llevan su sufijo; el monto del presupuesto y el número de
// servidores de la estimación salen de su octeto.

import {
  anotar,
  asignarEip,
  avanzar,
  compartirSnapshotRds,
  crearBaseRds,
  crearBucket,
  crearGrupoSeguridad,
  crearTablaDynamo,
  cuentaNueva,
  lanzarInstancias,
  refrescarAdvisor,
  reloj,
  tomarSnapshotRds
} from '../consola/modelo.js';
import { bloque, c, scriptApache, vinetas } from './util.js';

export function datosLab(d) {
  const o = d.octeto;
  return {
    sufijo: d.sufijo,
    ipCasa: d.ipCasa,
    // Lo que ya existe en la cuenta
    instancia: 'cafe-pos-api',
    tipoViejo: 'm5.large',
    sg: 'cafe-pos-sg',
    eip: 'ip-sucursal-cerrada',
    base: 'cafe-lealtad',
    snapshot: 'cafe-lealtad-respaldo',
    bucket: `cafe-tickets-${d.sufijo}`,
    tablaPruebas: 'cafe-pedidos-pruebas',
    userData: scriptApache('Cafe del Bajio', `API de las cajas - ${d.sufijo}`),
    // Organizations
    ouProduccion: 'Produccion',
    ouPruebas: 'Pruebas',
    cuentaProduccion: `cafe-produccion-${d.sufijo}`,
    correoProduccion: `aws-produccion+${d.sufijo}@cafedelbajio.mx`,
    cuentaPruebas: `cafe-pruebas-${d.sufijo}`,
    correoPruebas: `aws-pruebas+${d.sufijo}@cafedelbajio.mx`,
    scp: 'solo-us-east-1',
    // Etiquetas y Cost Explorer
    etiqueta: 'Ambiente',
    valorProduccion: 'Produccion',
    valorPruebas: 'Pruebas',
    reporte: 'gasto-por-ambiente',
    // Budgets
    presupuesto: 'cafe-mensual',
    monto: [300, 350, 400, 450][o % 4],
    correo: 'finanzas@cafedelbajio.mx',
    umbralReal: 80,
    umbralPronostico: 100,
    // Pricing Calculator
    estimacion: `pedidos-en-linea-${d.sufijo}`,
    tipoCalc: 't3.medium',
    servidores: 3 + (o % 4),
    // Support y Well-Architected
    plan: 'business-plus',
    carga: `cafe-pos-${d.sufijo}`,
    hito: 'despues-de-ordenar',
    // Bono
    presupuestoPruebas: 'cafe-pruebas',
    montoPruebas: [20, 25, 30, 40][o % 4]
  };
}

export const LAB = {
  id: 'practica-4',
  titulo: 'Café del Bajío ordena sus cuentas',
  minutos: 85,
  pistas: true,
  // En «Tus datos» solo va lo que usa esta práctica: no se crea ninguna VPC.
  datosVisibles: ['sufijo', 'ipCasa', 'cuentaId'],
  historia: `
    <p><strong>Café del Bajío</strong> tiene 14 cafeterías en León, Silao, Irapuato y Guanajuato capital. Las cajas de todas las sucursales cobran a través de una API en AWS (<code>cafe-pos-api</code>) y el programa de lealtad «Bajío Puntos» guarda a sus clientes en una base RDS (<code>cafe-lealtad</code>).</p>
    <p>Toño, el técnico que montó todo, se fue a otra empresa. Desde entonces la factura de AWS subió y nadie sabe por qué. La contadora, <strong>Lupita Ramírez</strong>, te contrató para poner orden: que nada quede expuesto, dejar de pagar lo que no se usa, separar lo de <strong>Producción</strong> de lo de <strong>Pruebas</strong> (el mes que viene arrancan los pedidos en línea y los programadores quieren su propia cuenta), saber en qué se va el dinero y enterarse <em>antes</em> de pasarse del presupuesto.</p>
    <p>En tu cuenta ya existen <code>cafe-pos-api</code> con su grupo <code>cafe-pos-sg</code>, la base <code>cafe-lealtad</code> con su respaldo manual, un bucket de tickets, una tabla de DynamoDB de pruebas y una IP elástica de una sucursal que ya cerró. <strong>No borres</strong> la API, la base ni el respaldo: el negocio los usa.</p>
    <p>Todo va en <strong>N. Virginia (us-east-1)</strong> y puedes hacer las tareas en el orden que quieras (te sugerimos el de la lista: primero lo urgente). Cada tarea tiene una pista general y puedes revisar tu avance antes de entregar. Lo que se califica es cómo queda tu cuenta al final.</p>
    <p>Las nueve primeras tareas valen 100 puntos. La última es un <strong>bono opcional</strong>: suma puntos extra que compensan errores, pero tu calificación <strong>nunca pasa de 100</strong>.</p>`,

  estadoInicial(datos) {
    const x = datosLab(datos);
    const e = cuentaNueva(datos);
    const vpc = e.vpcs.find((v) => v.porDefecto);
    const sgDefault = e.gruposSeguridad.find((g) => g.vpcId === vpc.id && g.nombre === 'default');

    // La API de las cajas: sobrada de tamaño y con SSH abierto al mundo.
    const sg = crearGrupoSeguridad(e, {
      nombre: x.sg,
      descripcion: 'API de las cajas de las sucursales',
      vpcId: vpc.id,
      entrada: [
        { protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' },
        { protocolo: 'tcp', desde: 22, hasta: 22, origen: '0.0.0.0/0' }
      ]
    });
    lanzarInstancias(e, { nombre: x.instancia, ami: 'al2023', tipo: x.tipoViejo, gruposSeguridad: [sg.id], userData: x.userData });

    // La IP de la sucursal que cerró: reservada y sin usar.
    asignarEip(e, { nombre: x.eip });

    // La base del programa de lealtad, con sus etiquetas.
    crearBaseRds(e, {
      metodo: 'standard',
      motor: 'mysql',
      plantilla: 'devtest',
      despliegue: 'single',
      id: x.base,
      usuario: 'admin',
      contrasena: 'BajioPuntos2026',
      clase: 'db.t3.micro',
      almacenamiento: { tipo: 'gp3', gib: 20 },
      vpcId: vpc.id,
      publica: false,
      gruposSeguridad: sgDefault ? [sgDefault.id] : undefined,
      retencion: 7,
      cifrada: false,
      etiquetas: [
        { llave: x.etiqueta, valor: x.valorProduccion },
        { llave: 'Area', valor: 'Lealtad' }
      ]
    });

    // Los tickets de las cajas y la tabla que dejaron los programadores.
    crearBucket(e, { nombre: x.bucket, etiquetas: [{ llave: x.etiqueta, valor: x.valorProduccion }, { llave: 'Area', valor: 'Cajas' }] });
    crearTablaDynamo(e, { nombre: x.tablaPruebas, pk: { nombre: 'pedido', tipo: 'S' }, modo: 'PROVISIONED', lectura: 5, escritura: 5 });

    // El respaldo manual de la base que Toño hizo público «para pasárselo a un proveedor».
    avanzar(e, reloj.ahora() + 60_000);
    tomarSnapshotRds(e, { baseId: x.base, nombre: x.snapshot });
    avanzar(e, reloj.ahora() + 120_000);
    compartirSnapshotRds(e, x.snapshot, { publico: true });

    // Trusted Advisor ya revisó la cuenta tal como la dejó Toño.
    refrescarAdvisor(e, null, { anotar: false }, reloj.ahora() + 120_000);

    e.bitacora = [];
    anotar(e, 'Laboratorio', 'Inicio', `La cuenta empieza con ${x.instancia} (${x.tipoViejo}, grupo ${x.sg}), la IP elástica ${x.eip}, la base ${x.base} con su snapshot público ${x.snapshot}, el bucket ${x.bucket} y la tabla ${x.tablaPruebas}.`);
    return e;
  },

  tareas(datos) {
    const x = datosLab(datos);
    const scpEjemplo = JSON.stringify(
      {
        Version: '2012-10-17',
        Statement: [{ Sid: 'DenyOutsideUsEast1', Effect: 'Deny', NotAction: ['iam:*', 'organizations:*', 'support:*', 'cloudfront:*', 'route53:*'], Resource: '*', Condition: { StringNotEquals: { 'aws:RequestedRegion': ['us-east-1'] } } }]
      },
      null,
      2
    );
    return [
      {
        id: 'seguridad',
        titulo: 'Lo urgente: Trusted Advisor está en rojo',
        puntos: 13,
        html: `
          <p>Trusted Advisor (incluso con el plan de soporte gratuito) ya marcó tres riesgos de seguridad. Lupita quiere verlos en verde hoy:</p>
          ${vinetas([
            `El respaldo ${c(x.snapshot)} de la base de clientes está <strong>público</strong>: cualquier cuenta de AWS del mundo podría restaurarlo y ver los datos de los clientes. Que <strong>nadie fuera de tu cuenta</strong> lo pueda usar, pero <strong>no lo borres</strong>: es el único respaldo manual.`,
            `Nadie en internet debe poder ni intentar entrar por SSH (22) a ${c(x.instancia)}. Si quieres conservar SSH, que sea solo desde tu IP ${c(`${x.ipCasa}/32`)}. Las cajas sí deben seguir entrando por HTTP (80) desde cualquier lugar.`,
            'La cuenta raíz (root user) debe tener <strong>MFA</strong>.',
            'Trusted Advisor no se actualiza solo: cuando termines, haz que vuelva a revisar la cuenta y que <em>Amazon RDS Public Snapshots</em>, <em>Security Groups - Specific Ports Unrestricted</em> y <em>MFA on Root Account</em> salgan en verde.'
          ])}`,
        pista:
          'Los avisos se ven en Trusted Advisor → Recommendations. El snapshot se arregla en Aurora and RDS → Snapshots (pestaña Manual) → Actions → Share snapshot, eligiendo Private. La regla de SSH está en EC2 → Security Groups → tu grupo → Edit inbound rules. El MFA de la raíz se agrega desde IAM → Dashboard (Add MFA) o My security credentials. Al final, «Refresh all checks» en Trusted Advisor.'
      },
      {
        id: 'ahorro',
        titulo: 'Deja de pagar lo que no se usa',
        puntos: 11,
        html: `
          ${vinetas([
            `La IP elástica ${c(x.eip)} era de la sucursal de Celaya, que cerró en septiembre. Una IP pública se cobra cada hora aunque nadie la use: que la cuenta ya <strong>no la tenga</strong>.`,
            `${c(x.instancia)} es un ${c(x.tipoViejo)} (2 vCPU y 8 GiB) y su CPU no pasa de 15 %. Cámbiale el tamaño (<em>right-sizing</em>): la <strong>misma instancia</strong> (no la borres ni lances otra: tiene la configuración de las cajas) con un tipo de <strong>al menos 2 vCPU y 2 GiB</strong> que cueste <strong>menos de la mitad</strong> por hora.`,
            'Al terminar, la API debe quedar <strong>encendida</strong> (running): las cajas la necesitan.'
          ])}`,
        pista:
          'Las IP elásticas están en EC2 → Network & Security → Elastic IPs (Actions → Release Elastic IP addresses). Para cambiar el tipo, la instancia tiene que estar detenida: EC2 → Instances → Instance state → Stop, luego Actions → Instance settings → Change instance type, y otra vez Start. Los precios por hora se ven en EC2 → Instance types.'
      },
      {
        id: 'cuentas',
        titulo: 'Una cuenta para Producción y otra para Pruebas',
        puntos: 12,
        html: `
          <p>Los programadores de los pedidos en línea no deben poder tocar (ni por error) lo que usan las cajas. La solución es tener cuentas separadas bajo una sola organización, con <strong>tu cuenta como cuenta de administración</strong> (y una sola factura).</p>
          ${vinetas([
            'Una organización de AWS Organizations.',
            `Dos unidades organizativas (OU) directamente bajo <em>Root</em>: ${c(x.ouProduccion)} y ${c(x.ouPruebas)}.`,
            `Una cuenta nueva ${c(x.cuentaProduccion)} (correo ${c(x.correoProduccion)}) dentro de la OU ${c(x.ouProduccion)}.`,
            `Una cuenta nueva ${c(x.cuentaPruebas)} (correo ${c(x.correoPruebas)}) dentro de la OU ${c(x.ouPruebas)}.`
          ])}`,
        pista:
          'Todo está en AWS Organizations: «Create an organization»; luego, en AWS accounts, marca Root → Actions → Organizational unit → Create new. Las cuentas se crean con Add an AWS account → Create an AWS account. Una cuenta nueva nace en Root: márcala y muévela a su OU con Actions → Move.'
      },
      {
        id: 'scp',
        titulo: 'Pruebas no sale de N. Virginia',
        puntos: 14,
        html: `
          <p>Lupita leyó que a una empresa le minaron criptomonedas con servidores en regiones que nadie vigilaba. Quiere un <strong>límite que nadie de Pruebas pueda saltarse</strong>, ni siquiera un administrador de esa cuenta:</p>
          ${vinetas([
            `Ninguna cuenta de la OU ${c(x.ouPruebas)} (ni las que se agreguen después) puede crear recursos <strong>fuera de us-east-1</strong>: ni servidores ni bases.`,
            `Dentro de us-east-1, ${c(x.cuentaPruebas)} sigue pudiendo trabajar normalmente.`,
            `Producción <strong>no</strong> debe quedar limitada por esa regla (el próximo año quizá abran una región en otro país).`
          ])}
          <p>La regla es una <strong>SCP</strong> (puedes llamarla ${c(x.scp)}). Esta es la que recomienda AWS; deja fuera los servicios globales (IAM, Organizations, Support, CloudFront, Route 53):</p>
          ${bloque(scpEjemplo)}`,
        pista:
          'Primero se habilitan las SCP en AWS Organizations → Policies → Service control policies → Enable service control policies. Luego Create policy (el editor tiene el ejemplo «Solo permitir us-east-1») y, en la política, Targets → Attach. Piensa en qué nivel la pones: lo que se adjunta a una OU lo heredan todas sus cuentas. No quites FullAWSAccess: una SCP no da permisos, solo pone el techo, y cada nivel necesita algo que permita.'
      },
      {
        id: 'etiquetas',
        titulo: '¿Cuánto cuesta Producción y cuánto Pruebas?',
        puntos: 12,
        html: `
          <p>La base y el bucket ya traen la etiqueta ${c(x.etiqueta)} = ${c(x.valorProduccion)}. Lupita quiere ver el gasto separado por ambiente:</p>
          ${vinetas([
            `La tabla de DynamoDB ${c(x.tablaPruebas)} lleva la etiqueta ${c(x.etiqueta)} = ${c(x.valorPruebas)} (es de los programadores).`,
            `La facturación puede repartir el gasto por la llave ${c(x.etiqueta)}: actívala como etiqueta de asignación de costos.`,
            `Un reporte guardado de Cost Explorer (puedes llamarlo ${c(x.reporte)}) que <strong>agrupe por la etiqueta</strong> ${c(x.etiqueta)}.`
          ])}`,
        pista:
          'Las etiquetas de la tabla se editan en DynamoDB → Tables → tu tabla → pestaña Additional settings (Tags → Manage tags). La activación está en Billing and Cost Management → Cost allocation tags (Activate). En Cost Explorer, en el panel derecho, Group by → Dimension: Tag → elige la llave, y luego «Save to report library».'
      },
      {
        id: 'presupuesto',
        titulo: 'Que avise antes de pasarse',
        puntos: 12,
        html: `
          ${vinetas([
            `Un presupuesto de <strong>costo</strong>, <strong>mensual</strong> y para <strong>toda</strong> la cuenta (todos los servicios) de ${c(`$${x.monto}`)} USD (puedes llamarlo ${c(x.presupuesto)}).`,
            `Una alerta cuando lo <strong>gastado de verdad</strong> (Actual) llegue al ${c(`${x.umbralReal}%`)} del presupuesto.`,
            `Otra alerta cuando el <strong>pronóstico</strong> (Forecasted) diga que se va a llegar al ${c(`${x.umbralPronostico}%`)}: así Lupita se entera a mitad de mes, antes de que pase.`,
            `Las alertas le llegan a ${c(x.correo)}.`
          ])}`,
        pista:
          'Se hace en Billing and Cost Management → Budgets → Create budget. La plantilla «Monthly cost budget» pone sus propios porcentajes; con «Customize (advanced)» → Cost budget eliges el monto y en el paso de alertas agregas cada umbral con su tipo de disparo (Actual o Forecasted).'
      },
      {
        id: 'calculadora',
        titulo: 'Cuánto costarán los pedidos en línea',
        puntos: 10,
        html: `
          <p>Los pedidos en línea van a necesitar <strong>${x.servidores} servidores ${c(x.tipoCalc)} con Linux encendidos todo el mes</strong>, por lo menos un año. Antes de crear nada, Lupita quiere comparar dos formas de pago:</p>
          ${vinetas([
            `Una estimación de la Pricing Calculator llamada ${c(x.estimacion)}.`,
            `Una línea de Amazon EC2 con los ${x.servidores} servidores ${c(x.tipoCalc)} pagando <strong>On-Demand</strong> el 100 % del tiempo.`,
            `Otra línea con los mismos ${x.servidores} servidores pagando con un <strong>Compute Savings Plan</strong> a <strong>1 año</strong> y <strong>sin pago adelantado</strong> (No upfront).`
          ])}
          <p>Fíjate en cuánto se ahorra al mes: lo vas a necesitar en la revisión Well-Architected.</p>`,
        pista:
          'Está en Billing and Cost Management → Pricing Calculator → Create estimate → Add service → Amazon EC2 → Configure. Elige el tipo, cuántas instancias y en «Payment options» la forma de pago. «Save and add service» guarda la línea y te deja agregar la segunda; «Save and view summary» te lleva al resumen. El nombre se cambia con el lápiz que está junto al nombre de la estimación.'
      },
      {
        id: 'soporte',
        titulo: 'Quién contesta a las 3 de la mañana',
        puntos: 6,
        html: `
          <p>Si la API de las cajas se cae un sábado, las 14 cafeterías no pueden cobrar con tarjeta. Lupita necesita poder abrir casos <strong>técnicos</strong> con AWS las 24 horas y que contesten en <strong>menos de 1 hora</strong> cuando producción está caída. Pero es una cadena de cafeterías: no le alcanza para un plan que cuesta miles de dólares al mes ni necesita un TAM (Technical Account Manager).</p>
          ${vinetas([
            'Contrata el plan de AWS Support <strong>más barato que cumpla</strong> con eso, y déjalo contratado aunque el simulador te avise que se cobra.'
          ])}`,
        pista:
          'Los planes y sus tiempos de respuesta están en Support → Support plans (Manage Support Plan). Compara qué plan permite casos técnicos y con qué tiempo de respuesta para «Production system down».'
      },
      {
        id: 'wa',
        titulo: 'La revisión Well-Architected',
        puntos: 10,
        html: `
          ${vinetas([
            `Una carga de trabajo (workload) ${c(x.carga)} en el ambiente <strong>Production</strong> y en la región us-east-1.`,
            `Contesta con la verdad, según lo que hiciste hoy, las preguntas ${c('SEC 1')} (Security) y ${c('COST 2')}, ${c('COST 3')} y ${c('COST 6')} (Cost Optimization). Marca las prácticas que ya cumples: separar cuentas, proteger la raíz, controles de gasto, etiquetas, Budgets y Cost Explorer, estimar antes de crear y elegir el tamaño con datos.`,
            `Guarda un milestone (puedes llamarlo ${c(x.hito)}) <strong>después</strong> de contestar, para comparar en la siguiente revisión.`
          ])}`,
        pista:
          'Está en AWS Well-Architected Tool → Workloads → Define workload. Con la carga creada, en su detalle pulsa Start reviewing, elige cada pregunta en la lista de la izquierda y marca las casillas; «Save and exit» guarda. El milestone se guarda desde el detalle de la carga (Save milestone).'
      },
      {
        id: 'bono',
        titulo: 'Un tope solo para Pruebas',
        puntos: 8,
        bono: true,
        html: `
          <p><strong>Opcional.</strong> Los programadores tienen permiso de experimentar, pero con un tope. Si te sobra tiempo, suma hasta <strong>8 puntos extra</strong>, que compensan errores de las otras tareas (tu calificación nunca pasa de 100).</p>
          ${vinetas([
            `Un segundo presupuesto de costo mensual de ${c(`$${x.montoPruebas}`)} USD (puedes llamarlo ${c(x.presupuestoPruebas)}) que solo cuente lo que tiene la etiqueta ${c(x.etiqueta)} = ${c(x.valorPruebas)}.`,
            `Con al menos una alerta que le llegue a ${c(x.correo)}.`
          ])}`,
        pista:
          'En Budgets → Create budget → Customize (advanced) → Cost budget, en Budget scope elige «Filter specific AWS cost dimensions» → Tag. La llave solo aparece ahí si ya la activaste en Cost allocation tags.'
      }
    ];
  }
};
