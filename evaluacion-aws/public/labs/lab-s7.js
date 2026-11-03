// Laboratorio de la sesión 7 de la Ruta AWS (versión simulador) · Costos,
// soporte y buenas prácticas. «La tienda no se lleva sorpresas»: Bicicletas
// Rodada 29 recibió una factura más alta de lo esperado. La cuenta arranca
// con sus tres servidores funcionando y con tres problemas que Trusted
// Advisor (y la factura) delatan: una IP elástica que nadie usa, un snapshot
// de EBS público y el usuario raíz sin MFA.
//
// El alumno hace las tres etapas del costo (estimar con Pricing Calculator,
// vigilar con Budgets, repartir con etiquetas), atiende a Trusted Advisor,
// separa producción y pruebas con Organizations y una SCP, y hace una
// revisión Well-Architected del pilar de fiabilidad con su milestone. El
// bono es un caso de soporte de facturación (lo único que abre el plan Basic).
//
// Datos distintos por alumno: los nombres llevan su sufijo; el número y tipo
// de servidores de la estimación y el monto del presupuesto salen de su octeto.

import { anotar, asignarEip, avanzar, crearGrupoSeguridad, crearSnapshot, crearVolumen, cuentaNueva, eliminarVolumen, lanzarInstancias, refrescarAdvisor, reloj } from '../consola/modelo.js';
import { c, scriptApache, vinetas } from './util.js';

/** Los tipos que se estiman para la temporada navideña (precio On-Demand Linux, us-east-1). */
const TIPOS_NAVIDAD = ['t3.small', 't3.micro', 't3.medium'];

export function datosLab(d) {
  return {
    sufijo: d.sufijo,
    // Lo que ya existe en la cuenta
    servidores: ['rodada-web-1', 'rodada-web-2', 'rodada-inventario'],
    sg: 'rodada-web-sg',
    eipNombre: 'ip-promo-buen-fin',
    snapDescripcion: 'Catalogo 2025 (copia para el proveedor)',
    userData: scriptApache('Bicicletas Rodada 29', `Tienda en linea - sucursal ${d.sufijo}`),
    ipCasa: d.ipCasa,
    // Pricing Calculator
    cantidad: 2 + (d.octeto % 3),
    tipo: TIPOS_NAVIDAD[Math.floor(d.octeto / 3) % TIPOS_NAVIDAD.length],
    // Budgets
    presupuesto: `presupuesto-${d.sufijo}`,
    monto: 10 + (d.octeto % 5) * 5,
    correo: `finanzas.${d.sufijo}@rodada29.mx`,
    // Etiquetas
    bucket: `rodada-fotos-${d.sufijo}`,
    llave: 'Proyecto',
    valor: `tienda-${d.sufijo}`,
    // Organizations
    ouProduccion: 'Produccion',
    ouPruebas: 'Pruebas',
    cuentaPruebas: `rodada-pruebas-${d.sufijo}`,
    correoPruebas: `pruebas.${d.sufijo}@rodada29.mx`,
    scp: 'negar-rds',
    // Well-Architected
    carga: `tienda-${d.sufijo}`,
    preguntasRel: 3,
    hito: 'revision-inicial'
  };
}

export const LAB = {
  id: 'lab-s7',
  titulo: 'La tienda no se lleva sorpresas',
  minutos: 50,
  pistas: true,
  // En «Tus datos» solo va lo que usa este laboratorio: no se crea ninguna VPC.
  datosVisibles: ['sufijo', 'ipCasa', 'cuentaId'],
  historia: `
    <p><strong>Bicicletas Rodada 29</strong> es una tienda de Guadalajara que vende en línea. En octubre le llegó una factura de AWS más alta de lo que esperaba y nadie supo explicar por qué. La dueña, doña Carmen, te contrata para que <strong>no vuelva a haber sorpresas</strong>.</p>
    <p>En la cuenta ya funcionan sus tres servidores (<code>rodada-web-1</code>, <code>rodada-web-2</code> y <code>rodada-inventario</code>): <strong>no los apagues ni los borres</strong>. Pero el técnico anterior dejó tres pendientes que Trusted Advisor y la factura delatan.</p>
    <p>Te toca hacer lo que se vio en la sesión 7: <strong>estimar</strong> antes de crear (Pricing Calculator), <strong>vigilar</strong> con un presupuesto que avise (Budgets), <strong>repartir</strong> el gasto con etiquetas, atender a <strong>Trusted Advisor</strong>, separar producción y pruebas con <strong>Organizations</strong> y revisar la arquitectura con la <strong>Well-Architected Tool</strong>.</p>
    <p>Todo va en <strong>N. Virginia (us-east-1)</strong>. Aquí, a diferencia del sandbox de DataCamp, sí puedes crear el presupuesto, la organización y la revisión. En el simulador <strong>1 hora de uso se cobra en 1 minuto real</strong>, así que verás el gasto moverse. Puedes hacer las tareas en el orden que quieras; la última es un <strong>bono opcional</strong> que suma encima, sin pasar de 100.</p>`,

  estadoInicial(datos) {
    const x = datosLab(datos);
    const e = cuentaNueva(datos);
    const vpc = e.vpcs.find((v) => v.porDefecto);

    // Los tres servidores de la tienda: la web abierta y SSH solo desde la oficina.
    const sg = crearGrupoSeguridad(e, {
      nombre: x.sg,
      descripcion: 'Servidores de la tienda en linea',
      vpcId: vpc.id,
      entrada: [
        { protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' },
        { protocolo: 'tcp', desde: 22, hasta: 22, origen: `${x.ipCasa}/32` }
      ]
    });
    for (const nombre of x.servidores) lanzarInstancias(e, { nombre, ami: 'al2023', tipo: 't2.micro', gruposSeguridad: [sg.id], userData: x.userData });

    // Pendiente 1: la IP elástica de la promoción del Buen Fin, que ya nadie usa.
    asignarEip(e, { nombre: x.eipNombre });

    // Pendiente 2: un respaldo viejo del catálogo que alguien compartió como público.
    const vol = crearVolumen(e, { nombre: 'catalogo-2025', tipo: 'gp3', tamano: 8, az: 'us-east-1a' });
    avanzar(e, reloj.ahora() + 60_000);
    const snap = crearSnapshot(e, { volumenId: vol.id, descripcion: x.snapDescripcion, nombre: 'catalogo-2025-respaldo' });
    // EC2 → Snapshots → Modify permissions → Public (así lo dejó el técnico).
    snap.publico = true;
    avanzar(e, reloj.ahora() + 120_000);
    eliminarVolumen(e, vol.id);

    // Pendiente 3: el usuario raíz sin MFA (así viene toda cuenta nueva).
    e.iam.raizMfa = false;

    // Trusted Advisor ya revisó la cuenta: los pendientes salen en rojo.
    refrescarAdvisor(e, null, { anotar: false });

    e.bitacora = [];
    anotar(e, 'Laboratorio', 'Inicio', 'La cuenta empieza con los tres servidores de la tienda, una IP elástica sin usar, un snapshot de EBS público y el usuario raíz sin MFA.');
    return e;
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'estimacion',
        titulo: 'Estima antes de crear',
        puntos: 15,
        html: `
          <p>Para diciembre, doña Carmen quiere sumar servidores para la temporada navideña. Antes de crearlos, estima cuánto costarían al mes en la <strong>Pricing Calculator</strong> (dentro de Billing and Cost Management). En una estimación agrega <strong>dos</strong> líneas de Amazon EC2:</p>
          ${vinetas([
            `<strong>Línea 1:</strong> ${c(String(x.cantidad))} instancias ${c(x.tipo)}, sistema <strong>Linux</strong>, uso constante (<em>Constant usage</em>), forma de pago <strong>On-Demand</strong> al 100 %, sin disco EBS.`,
            `<strong>Línea 2:</strong> las mismas ${c(String(x.cantidad))} instancias ${c(x.tipo)} Linux, pero con <strong>Compute Savings Plans</strong> a <strong>3 años</strong> y <strong>No upfront</strong> (sin pago inicial).`
          ])}
          <p>Compara el <em>Monthly cost</em> de las dos: es el ahorro de comprometerte a usar ese cómputo por 3 años.</p>`,
        pista:
          'Se hace en Billing and Cost Management → Pricing Calculator → Create estimate → Add service → Amazon EC2 → Configure. En EC2 specifications pones Linux y Number of instances; en EC2 instances buscas el tipo; en Payment options eliges On-Demand (o Compute Savings Plans con su Reservation term y Payment option). Guarda con «Save and add service» y repite para la segunda línea, o usa Action → Duplicate en My Estimate y edítala.'
      },
      {
        id: 'presupuesto',
        titulo: 'Un presupuesto que avise a tiempo',
        puntos: 20,
        html: `
          <p>Que la próxima factura alta avise <strong>antes</strong> de llegar:</p>
          ${vinetas([
            `Un presupuesto de <strong>costo</strong>, <strong>mensual</strong>, llamado ${c(x.presupuesto)}, de ${c(`${x.monto}.00`)} dólares.`,
            `Una alerta <strong>real</strong> (<em>Actual</em>) al ${c('85%')} del monto que mande correo a ${c(x.correo)}.`,
            `Una alerta <strong>pronosticada</strong> (<em>Forecasted</em>) al ${c('100%')} del monto, al mismo correo.`
          ])}
          <p>La real avisa cuando ya gastaste; la pronosticada, cuando AWS calcula que vas a pasarte antes de que acabe el mes. Revisa la <em>Bandeja de correo (simulada)</em> de SNS: ahí llegan los avisos.</p>`,
        pista:
          'Se hace en Billing and Cost Management → Budgets → Create budget. La plantilla «Monthly cost budget» (Use a template) ya trae alertas al 85 % real, 100 % real y 100 % pronosticado: solo escribes el nombre, el monto y el correo. Si eliges Customize (advanced), las alertas se agregan en «Configure alerts» con su Threshold, su Trigger (Actual o Forecasted) y Email recipients.'
      },
      {
        id: 'etiquetas',
        titulo: 'Reparte el gasto con etiquetas',
        puntos: 15,
        html: `
          <p>Doña Carmen quiere ver en la factura cuánto gasta la tienda en línea. Para eso sirven las <strong>etiquetas de asignación de costos</strong>:</p>
          ${vinetas([
            `Crea el bucket ${c(x.bucket)} para las fotos de las bicis, con la etiqueta (tag) ${c(x.llave)} = ${c(x.valor)}. Ojo: la llave lleva mayúscula inicial; para AWS, ${c('Proyecto')} y ${c('proyecto')} son etiquetas distintas.`,
            `<strong>Activa</strong> la llave ${c(x.llave)} como etiqueta de asignación de costos (<em>user-defined cost allocation tag</em>).`
          ])}
          <p>Una etiqueta que no activas sirve para buscar recursos, pero <strong>no</strong> aparece en Cost Explorer ni en la factura.</p>`,
        pista:
          'El bucket se crea en S3 → Create bucket; la sección Tags está casi al final del formulario («Add new tag»). La activación está en Billing and Cost Management → Cost allocation tags, pestaña «User-defined cost allocation tags»: marca la llave y presiona Activate. La llave aparece en esa lista solo después de usarla en algún recurso.'
      },
      {
        id: 'advisor',
        titulo: 'Atiende a Trusted Advisor',
        puntos: 20,
        html: `
          <p>Abre <strong>Trusted Advisor</strong> y corrige los tres pendientes que dejó el técnico:</p>
          ${vinetas([
            `El snapshot de EBS ${c('catalogo-2025-respaldo')} está <strong>público</strong>: cualquier cuenta de AWS del mundo puede copiarlo. Ya no se necesita: <strong>bórralo</strong> (o, si lo quisieras conservar, hazlo privado).`,
            `La IP elástica ${c(x.eipNombre)} no está asociada a nada y <strong>se cobra cada hora</strong>. Libérala (<em>Release</em>).`,
            'El usuario raíz no tiene <strong>MFA</strong>: asígnale un dispositivo MFA.',
            `Al final, presiona <strong>Refresh all checks</strong> para que Trusted Advisor vuelva a revisar la cuenta y los chequeos ${c('Amazon EBS Public Snapshots')} y ${c('MFA on Root Account')} queden en verde. (${c('IAM Use')} puede seguir en amarillo: solo avisa que no hay usuarios de IAM y no es parte de esta tarea.)`
          ])}
          <p>Con el plan <strong>Basic</strong>, Trusted Advisor solo muestra los chequeos básicos (seguridad y límites de servicio). El chequeo de IP elásticas sin asociar es de optimización de costos y pide Business Support+ o mayor: la IP la encuentras en EC2 o en el detalle de la factura.</p>`,
        pista:
          'Trusted Advisor → Recommendations (o Security) muestra los chequeos en rojo con el ID del recurso. El snapshot se borra en EC2 → Elastic Block Store → Snapshots → Actions → Delete snapshot. La IP está en EC2 → Network & Security → Elastic IPs → Actions → Release Elastic IP addresses. El MFA de la raíz se asigna en IAM → Dashboard → Security recommendations → «Add MFA for root user» → Add MFA. Trusted Advisor muestra lo de su última revisión: después de corregir, vuelve y presiona Refresh all checks.'
      },
      {
        id: 'gobierno',
        titulo: 'Producción y pruebas en cuentas separadas',
        puntos: 18,
        html: `
          <p>El sobrino de doña Carmen quiere experimentar sin riesgo. La regla: <strong>en pruebas nadie puede crear bases de datos de RDS</strong> (son lo más caro que han probado).</p>
          ${vinetas([
            'Crea una <strong>organización</strong> con AWS Organizations (tu cuenta queda como cuenta de administración).',
            `Dos unidades organizativas (OU) dentro de Root: ${c(x.ouProduccion)} y ${c(x.ouPruebas)}.`,
            `Una cuenta nueva ${c(x.cuentaPruebas)} (correo ${c(x.correoPruebas)}) dentro de la OU ${c(x.ouPruebas)}.`,
            `Habilita las <strong>service control policies</strong> y crea una SCP (puedes llamarla ${c(x.scp)}) que <strong>niegue</strong> (${c('"Effect": "Deny"')}) las acciones ${c('rds:*')}. Adjúntala <strong>solo</strong> a la OU ${c(x.ouPruebas)}.`
          ])}
          <p>No le quites ${c('FullAWSAccess')} a nadie: la SCP pone el techo, pero sin un <em>Allow</em> abajo no se podría hacer nada en pruebas.</p>`,
        pista:
          'Todo está en AWS Organizations. «Create an organization» en la portada; en AWS accounts, selecciona Root → Actions → Organizational unit → Create new. La cuenta se crea con «Add an AWS account» y luego se mueve con Actions → Move. Las SCP están en Policies → Service control policies: primero «Enable service control policies», luego Create policy (editor JSON) y, en el detalle de la política, la pestaña Targets → Attach.'
      },
      {
        id: 'revision',
        titulo: 'Revisión Well-Architected',
        puntos: 12,
        html: `
          <p>Antes de la temporada, revisa la tienda contra el <strong>AWS Well-Architected Framework</strong>:</p>
          ${vinetas([
            `Define un workload llamado ${c(x.carga)}, con entorno <strong>Pre-production</strong> y región ${c('US East (N. Virginia)')}, y la lente <em>AWS Well-Architected Framework</em>.`,
            `Contesta al menos <strong>${x.preguntasRel} preguntas</strong> del pilar <strong>Reliability</strong> (fiabilidad): marca las buenas prácticas que la tienda sí sigue (o «None of these» si no sigue ninguna).`,
            `Guarda un <strong>milestone</strong> (puedes llamarlo ${c(x.hito)}) <strong>después</strong> de contestar, para comparar en la próxima revisión.`
          ])}`,
        pista:
          'Se hace en AWS Well-Architected Tool → Workloads → Define workload (Name, Description, Review owner, Environment y Regions). En el workload, «Start reviewing» abre las preguntas: elige el pilar Reliability a la izquierda, marca casillas y avanza con Next; «Save and exit» guarda. El milestone se guarda con el botón «Save milestone» del workload: es una foto de las respuestas de ese momento.'
      },
      {
        id: 'soporte',
        titulo: 'Pregúntale a AWS Support',
        puntos: 5,
        bono: true,
        html: `
          <p><strong>Opcional.</strong> Doña Carmen quiere saber por qué le cobraron una IP que no usaba. Con el plan <strong>Basic</strong> (gratis) no puedes abrir casos técnicos, pero sí de <strong>cuenta y facturación</strong>. Si te sobra tiempo, abre uno: suma hasta <strong>5 puntos extra</strong>, que compensan errores de las otras tareas, pero tu calificación nunca pasa de 100.</p>
          ${vinetas([
            `Un caso de tipo <strong>Account and billing</strong> que pregunte por el cobro de la IP elástica de la cuenta de ${c(x.sufijo)}.`,
            'Lee la respuesta de AWS Support cuando llegue (tarda unos segundos).'
          ])}`,
        pista:
          'Se hace en Support → Support Center → Create case → «Account and billing». Elige el servicio (por ejemplo Billing) y la categoría, escribe el asunto y la descripción y presiona Submit. Si eliges «Technical», verás que el plan Basic no lo permite: para eso hace falta Business Support+ o mayor.'
      }
    ];
  }
};
