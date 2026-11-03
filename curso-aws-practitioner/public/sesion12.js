// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 12 · PRÁCTICA 4: CUENTAS Y FACTURA BAJO CONTROL
//
// Cuarta práctica integradora: gobierno y costos. Café del Bajío, una cadena
// de 14 cafeterías de Guanajuato, heredó una cuenta de AWS desordenada. El
// alumno la ordena en el simulador AWS (evaluacion-aws, laboratorio
// practica-4, que se califica solo): atiende lo que Trusted Advisor marca en
// rojo, deja de pagar lo que no se usa (IP elástica suelta, servidor sobrado),
// separa Producción y Pruebas con AWS Organizations y una SCP de regiones,
// reparte el gasto con etiquetas y Cost Explorer, pone un presupuesto con
// alertas, estima con la Pricing Calculator, elige el plan de soporte y hace
// una revisión Well-Architected.
//
// La lección agrega lo que el CLF-C02 pregunta del dominio de facturación y
// soporte que la Ruta no vio: Control Tower, Service Catalog, License Manager,
// Compute Optimizer, Service Quotas, Resource Access Manager, Marketplace, el
// TAM, Professional Services, la Partner Network, re:Post y el Health
// Dashboard. Billing Conductor no va: la guía CLF-C02 v1.3 lo pone fuera del
// alcance del examen.
//
// Datos revisados en la documentación oficial de AWS en noviembre de 2026:
// las SCP nunca limitan a la cuenta de administración; los planes de soporte
// vigentes son Basic, Business Support+, Enterprise y Unified Operations (los
// de antes se retiran el 1 de enero de 2027); AWS IQ cerró el 28 de mayo de
// 2026 (AWS manda a Marketplace, a sus servicios profesionales); desde 2024
// cada IPv4 pública se cobra por hora, se use o no; el Health Dashboard junta
// «Service health» y «Your account health» (antes Personal Health Dashboard).
// ---------------------------------------------------------------------------

import { icono, lista, nubi, recuadro } from './piezas.js';

/* ----------------------------------------------------- la arquitectura */

// Una caja del diagrama: título en negritas y renglones chicos debajo.
const caja = (x, y, w, h, relleno, titulo, renglones = []) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="trazo ${relleno}"/>
  <text x="${x + 12}" y="${y + 24}">${titulo}</text>
  ${renglones.map((r, i) => `<text x="${x + 12}" y="${y + 46 + i * 19}" class="etq-chica">${r}</text>`).join('')}`;

const flecha = (x1, y1, x2, y2, punteada = false) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="trazo" marker-end="url(#s12-punta)"${punteada ? ' stroke-dasharray="7 6" style="stroke-width:2"' : ''}/>`;

// El mismo diagrama sale en la lección del caso y en la práctica. En el
// celular se desplaza de lado dentro de su caja para que se pueda leer.
const ARQUITECTURA = `
  <figure class="diagrama">
    <div style="overflow-x:auto">
      <svg class="diagrama__svg" style="min-width:660px;max-height:none" viewBox="0 0 880 530" role="img" aria-labelledby="s12-arq-titulo s12-arq-desc">
        <title id="s12-arq-titulo">Las cuentas de Café del Bajío después de la práctica</title>
        <desc id="s12-arq-desc">A la izquierda, la organización: de Root cuelgan tu cuenta (la de administración, que paga una sola factura y donde viven la API de las cajas y la base de lealtad), la OU Produccion con su cuenta y la OU Pruebas con su cuenta y la SCP que no deja salir de us-east-1. Abajo, la etiqueta Ambiente que separa el gasto. A la derecha, Billing con el presupuesto, Cost Explorer y la calculadora; Trusted Advisor en verde; el plan de soporte y la revisión Well-Architected.</desc>
        <defs>
          <marker id="s12-punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="relleno-tinta"/></marker>
        </defs>
        <text x="24" y="34">AWS Organizations · Café del Bajío</text>

        ${caja(214, 52, 200, 76, 'relleno-blanco', 'Root', ['FullAWSAccess (no la quites)'])}
        ${flecha(260, 128, 116, 176)}
        ${flecha(314, 128, 314, 176)}
        ${flecha(368, 128, 512, 176)}

        ${caja(24, 178, 184, 182, 'relleno-blanco', 'Tu cuenta', ['la de administración', 'paga una sola factura', 'cafe-pos-api: más chica', 'cafe-lealtad + respaldo', 'privado', 'ninguna SCP la limita'])}
        ${caja(222, 178, 184, 182, 'relleno-verde', 'OU Produccion', ['cuenta', 'cafe-produccion-…', 'sin límite de región', '(quizá abran en', 'otro país)'])}
        ${caja(420, 178, 196, 182, 'relleno-azul', 'OU Pruebas', ['cuenta cafe-pruebas-…', 'SCP solo-us-east-1:', 'Deny fuera de', 'N. Virginia', 'tope propio (bono)'])}

        <rect x="24" y="414" width="592" height="94" rx="10" class="trazo relleno-amarillo"/>
        <text x="38" y="440">Etiqueta Ambiente = Produccion | Pruebas</text>
        <text x="38" y="464" class="etq-chica">La base, el bucket y la tabla de pruebas la llevan. Activada en</text>
        <text x="38" y="483" class="etq-chica">Cost allocation tags, Cost Explorer reparte el gasto por ambiente.</text>

        ${caja(640, 52, 216, 184, 'relleno-blanco', 'Billing', ['Budgets: cafe-mensual', 'alerta 80 % del real', 'alerta 100 % del pronóstico', 'Cost Explorer por Ambiente', 'Pricing Calculator:', 'On-Demand vs Savings Plan'])}
        ${caja(640, 252, 216, 128, 'relleno-verde', 'Trusted Advisor', ['snapshot: privado', 'SSH al mundo: cerrado', 'MFA en la raíz', 'IP elástica: liberada'])}
        ${caja(640, 396, 216, 112, 'relleno-blanco', 'Soporte y revisión', ['plan de soporte elegido', 'Well-Architected', '+ milestone'])}

        <path d="M116 360 V378 H628 V150 H636" class="trazo" marker-end="url(#s12-punta)" stroke-dasharray="7 6" style="stroke-width:2"/>
        <text x="236" y="400" class="etq-chica">una sola factura para las tres cuentas: la paga tu cuenta</text>
      </svg>
    </div>
    <figcaption class="sutil">Línea continua: lo que cuelga de cada nivel (y hereda sus SCP). Punteada: todas las cuentas se pagan en una sola factura, desde tu cuenta.</figcaption>
  </figure>`;

export const SESION_12 = {
  numero: 12,
  titulo: 'Práctica 4 · Cuentas y factura bajo control',
  subtitulo: 'Sesión 12 · Práctica 4: cuentas y factura bajo control',
  resumen:
    'Una cadena de cafeterías de Guanajuato heredó una cuenta de AWS desordenada y su factura no deja de subir. En el simulador AWS la pones en orden: cierras lo que Trusted Advisor marca en rojo, dejas de pagar lo que no se usa, separas Producción y Pruebas con AWS Organizations y una SCP, repartes el gasto con etiquetas, pones un presupuesto que avise a tiempo, estimas antes de crear y eliges el plan de soporte. Además repasas lo que el examen pregunta de gobierno, costos y soporte: Control Tower, Compute Optimizer, Service Quotas, Service Catalog, Marketplace, re:Post y más.',
  duracion: '2 horas',
  minutosSandbox: 0,

  practica: {
    titulo: 'Examen de práctica · Sesión 12',
    corto: 'Examen de práctica',
    resumen: '20 preguntas de gobierno de cuentas, costos y soporte al estilo del examen de certificación, dos de respuesta múltiple, en unos 15 minutos y una sola entrega.',
    plegable: 'Ver cómo es el examen real',
    sobre: 'el gobierno de cuentas, los costos y el soporte de AWS'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'El caso y lo que pide el examen',
      descripcion:
        'Qué está mal en la cuenta de Café del Bajío, cómo queda cuando termines y por qué una SCP es un techo y no un permiso. Después, lo que el examen pregunta de gobierno, costos y soporte aunque hoy no lo toques, con la palabra clave para reconocer cada servicio.',
      actividades: [
        {
          id: 's12-caso',
          tipo: 'leccion',
          titulo: 'Café del Bajío y su factura',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Lo que dejó Toño',
              html: `
                <p class="entrada"><strong>Café del Bajío</strong> tiene 14 cafeterías en León, Silao, Irapuato y Guanajuato capital. Las cajas cobran a través de una API en AWS. Toño, el técnico que montó todo, se fue, y desde entonces <strong>la factura sube y nadie sabe por qué</strong>. La contadora, Lupita, te pide poner orden.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Lo que hay hoy</th><th scope="col">Por qué es un problema</th><th scope="col">Cómo lo dejas</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">El respaldo de la base de clientes es <strong>público</strong>, el SSH está abierto a <kbd>0.0.0.0/0</kbd> y la raíz no tiene MFA</th><td>Trusted Advisor lo marca en rojo: cualquiera podría restaurar los datos de los clientes o intentar entrar.</td><td>Respaldo privado, SSH cerrado al mundo, <strong>MFA</strong> en la raíz.</td></tr>
                      <tr><th scope="row">Una IP elástica de una sucursal que cerró y un <kbd>m5.large</kbd> que no pasa de 15 % de CPU</th><td>Se paga cada hora por algo que no se usa o que sobra.</td><td>Liberar la IP y <strong>ajustar el tamaño</strong> (<em>right-sizing</em>).</td></tr>
                      <tr><th scope="row">Las cajas y los experimentos de los programadores en la misma cuenta</th><td>Un error en pruebas puede tumbar las cajas, y nadie pone límites.</td><td><strong>Organizations</strong>: una cuenta por ambiente y una <strong>SCP</strong>.</td></tr>
                      <tr><th scope="row">Nadie sabe cuánto cuesta cada cosa ni se entera a tiempo</th><td>La sorpresa llega a fin de mes, cuando ya no hay nada que hacer.</td><td><strong>Etiquetas</strong>, <strong>Cost Explorer</strong>, <strong>Budgets</strong> y estimar antes con la <strong>Pricing Calculator</strong>.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('sabias', 'Desde febrero de 2024 AWS cobra <strong>cada dirección IPv4 pública</strong> por hora, esté en uso o no. Una IP elástica apartada «por si acaso» cuesta aunque no esté conectada a nada.')}`,
              notas: 'Pregunta al grupo antes de mostrar la tercera columna: ¿qué arreglarían primero? (Lo que expone datos: el respaldo público y el SSH abierto. Ahorrar puede esperar una hora; una fuga de datos no.)'
            },
            {
              titulo: 'La arquitectura que vas a dejar',
              html: `
                ${ARQUITECTURA}
                ${recuadro('recuerda', '<strong>Organizations</strong> ordena las cuentas en carpetas (OU) y junta la factura. Las <strong>SCP</strong> ponen límites que se heredan hacia abajo. Las <strong>etiquetas</strong> dicen de quién es cada gasto, y <strong>Budgets</strong> avisa antes de que el gasto se pase.')}`,
              notas: 'Recorre el diagrama de arriba abajo: Root, las tres ramas y la franja amarilla de etiquetas. Remarca que la API y la base se quedan en tu cuenta: hoy no se mueve nada de lugar, solo se ordena.'
            },
            {
              titulo: 'La SCP pone el techo, no da permisos',
              html: `
                <p class="entrada">Lo que alguien puede hacer en una cuenta miembro es lo que permiten <strong>al mismo tiempo</strong> las SCP (de Root, de su OU y de la cuenta) y sus políticas de IAM.</p>
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('escudo')}<h3>SCP: el techo</h3><p>Dice lo <strong>máximo</strong> que se puede hacer en la cuenta, incluso para su usuario raíz. No le da permiso a nadie.</p></article>
                  <article class="rol">${icono('llave')}<h3>IAM: el permiso</h3><p>Dice qué puede hacer cada usuario o rol, pero <strong>nunca por encima</strong> del techo de la SCP.</p></article>
                  <article class="rol">${icono('check')}<h3>El resultado</h3><p>Solo lo que permiten las dos. Una negación explícita (<em>Deny</em>) en cualquier nivel gana siempre.</p></article>
                </div>
                ${recuadro('cuidado', 'Si pones la SCP de regiones en <strong>Root</strong>, también limitas a Producción. Va en la OU <strong>Pruebas</strong>, y lo que adjuntas a una OU lo heredan todas sus cuentas, incluso las que se agreguen después. Y no quites <code>FullAWSAccess</code>: sin algo que permita, nada se puede hacer.')}
                ${recuadro('examen', 'Las SCP <strong>nunca</strong> limitan a la <strong>cuenta de administración</strong>. Por eso AWS recomienda no correr cargas de trabajo en ella.')}`,
              notas: 'Es la tarea donde más se equivocan. Dibuja en el pizarrón Root → OU Pruebas → cuenta, y pregunta: si la SCP se adjunta a la OU, ¿le afecta a la cuenta de Producción? (No: está en otra rama.)'
            }
          ]
        },
        {
          id: 's12-examen',
          tipo: 'leccion',
          titulo: 'Lo que el examen también pregunta',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Gobernar muchas cuentas',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Qué hace</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">AWS Control Tower</th><td>Monta y gobierna un entorno de varias cuentas (una <em>landing zone</em>) sobre Organizations. Su <strong>Account Factory</strong> crea cuentas ya configuradas, y sus <strong>controles</strong> (antes «guardrails») son preventivos, de detección o proactivos.</td><td>“landing zone”, “cuentas nuevas con buenas prácticas”</td></tr>
                      <tr><th scope="row">AWS Service Catalog</th><td>Un <strong>catálogo de productos aprobados</strong> por TI (plantillas de CloudFormation) que la gente lanza sola, con el tamaño, la red y las etiquetas que TI definió.</td><td>“solo lo aprobado”, “autoservicio”</td></tr>
                      <tr><th scope="row">Service Quotas</th><td>Muestra los <strong>límites</strong> de cada servicio en tu cuenta y región (por ejemplo, cuántas vCPU de EC2 puedes encender) y desde ahí pides que te los suban.</td><td>“cuotas”, “subir un límite”</td></tr>
                      <tr><th scope="row">AWS Resource Access Manager (RAM)</th><td><strong>Comparte recursos</strong> entre cuentas de tu organización, como subredes o reglas de Route 53 Resolver, sin duplicarlos.</td><td>“compartir recursos entre cuentas”</td></tr>
                      <tr><th scope="row">AWS License Manager</th><td>Lleva la cuenta de las <strong>licencias de software</strong> que traes (BYOL) de Microsoft, Oracle o SAP, y puede impedir que se lancen más servidores de los que permite tu contrato.</td><td>“licencias”, “BYOL”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Una sola factura y SCP”</em> → <strong>Organizations</strong>. <em>“Entorno multicuenta listo, con controles”</em> → <strong>Control Tower</strong>. <em>“Que solo lancen lo aprobado”</em> → <strong>Service Catalog</strong>. <em>“No pasarme de mis licencias”</em> → <strong>License Manager</strong>.')}`,
              notas: 'Los controles preventivos de Control Tower se hacen con SCP y los de detección con reglas de AWS Config: une lo que vieron en las sesiones 2, 7 y 10.'
            },
            {
              titulo: 'Pagar lo justo y repartir la factura',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Qué hace</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">AWS Compute Optimizer</th><td>Con aprendizaje automático y las métricas de CloudWatch, recomienda el <strong>tamaño justo</strong> de instancias EC2, grupos de Auto Scaling, volúmenes EBS, funciones Lambda y más.</td><td>“right-sizing”, “sobrado o escaso”</td></tr>
                      <tr><th scope="row">AWS Marketplace</th><td>Tienda de <strong>software y servicios de otras empresas</strong>, listos para AWS y cobrados en tu misma factura. Ahí también se contratan servicios profesionales de terceros. También ayuda a gobernar esas compras: controla quién puede comprar qué, lleva las licencias (<em>entitlements</em>) y muestra cuánto gasta cada área.</td><td>“comprar software de terceros”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('cuidado', '<strong>Trusted Advisor</strong> también avisa de instancias casi sin uso, pero es una revisión general de tu cuenta. <strong>Compute Optimizer</strong> le dice a <em>cada</em> recurso qué tamaño le conviene. Y la <strong>Pricing Calculator</strong> estima antes de crear: no mira lo que ya tienes.')}`,
              notas: 'Hoy hacen el right-sizing a mano (mirando la CPU y los precios); Compute Optimizer es la herramienta que lo recomienda en una cuenta real. Se activa gratis y analiza 14 días de métricas por omisión.'
            },
            {
              titulo: '¿Quién te ayuda?',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Recurso</th><th scope="col">Qué es</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Technical Account Manager (TAM)</th><td>Una persona de AWS asignada que conoce tu arquitectura y te guía de forma proactiva. Viene con <strong>Enterprise Support</strong> o superior.</td><td>“persona asignada”, “proactivo”</td></tr>
                      <tr><th scope="row">AWS Professional Services</th><td>El equipo de <strong>expertos de la propia AWS</strong> que acompaña proyectos grandes, como una migración.</td><td>“expertos de AWS para un proyecto”</td></tr>
                      <tr><th scope="row">AWS Partner Network (APN)</th><td>Empresas <strong>consultoras y de software validadas por AWS</strong> que te ayudan a migrar o construir.</td><td>“consultora”, “socio”</td></tr>
                      <tr><th scope="row">AWS re:Post</th><td>La <strong>comunidad gratuita</strong> de preguntas y respuestas, con el <strong>Knowledge Center</strong> de dudas comunes.</td><td>“preguntarle a la comunidad”</td></tr>
                      <tr><th scope="row">AWS Health Dashboard</th><td><strong>Service health</strong>: el estado público de cada servicio. <strong>Your account health</strong> (antes <em>Personal Health Dashboard</em>): las fallas y mantenimientos que tocan <em>tus</em> recursos.</td><td>“¿me afecta a mí?”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${nubi('Si en un banco de preguntas viejo ves <strong>AWS IQ</strong> (un mercado de expertos independientes): AWS lo cerró en mayo de 2026 y ahora manda a <strong>Marketplace</strong>. Lo que no cambia: <strong>Professional Services</strong> es gente de AWS; la <strong>APN</strong>, empresas de fuera.', 'nubi-feliz')}`,
              notas: 'Pregunta rápida: si la API de las cajas se cae un sábado, ¿re:Post o un caso de soporte? (Un caso técnico: re:Post no tiene tiempos de respuesta, y con Basic no se pueden abrir casos técnicos.)'
            }
          ]
        },
        {
          id: 's12-ex-quien',
          tipo: 'clasificar',
          titulo: '¿Quién lo resuelve?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Café del Bajío crece: abre sucursales, contrata programadores y quiere gastar con cabeza. Cada necesidad tiene un servicio que la resuelve.</p>',
          pregunta: 'Manda cada necesidad al servicio que la resuelve.',
          grupos: [
            { id: 'controltower', nombre: 'Control Tower', color: 'blue' },
            { id: 'catalog', nombre: 'Service Catalog', color: 'green' },
            { id: 'optimizer', nombre: 'Compute Optimizer', color: 'yellow' },
            { id: 'health', nombre: 'Health Dashboard', color: 'purple' }
          ],
          fichas: [
            { texto: 'Abrir en minutos la cuenta de la sucursal de Querétaro, ya con CloudTrail encendido y los controles de la empresa', grupo: 'controltower', retro: 'Cuentas nuevas que nacen configuradas: Account Factory de Control Tower.' },
            { texto: 'Que los programadores solo puedan lanzar el servidor de pruebas aprobado, con su tamaño y sus etiquetas', grupo: 'catalog', retro: 'Un producto aprobado que se lanza en autoservicio: Service Catalog.' },
            { texto: 'Saber si cafe-pos-api está sobrada de tamaño según sus métricas de las últimas semanas', grupo: 'optimizer', retro: 'Right-sizing con datos reales: Compute Optimizer.' },
            { texto: 'Enterarse de que AWS dará mantenimiento al hardware donde corre la base de lealtad el próximo martes', grupo: 'health', retro: 'Eventos de AWS que tocan tus recursos: Your account health, en el Health Dashboard.' },
            { texto: 'Ver en un tablero qué cuentas de la organización no cumplen los controles de la empresa', grupo: 'controltower', retro: 'Control Tower muestra qué cuentas y recursos no cumplen sus controles.' },
            { texto: 'Publicar una plantilla de base de datos que cualquier área pueda lanzar sin pedirle permisos amplios a TI', grupo: 'catalog', retro: 'El catálogo de TI con plantillas aprobadas: Service Catalog.' },
            { texto: 'Saber cuánta memoria le sobra a la función Lambda que manda los tickets por correo', grupo: 'optimizer', retro: 'Compute Optimizer también recomienda la memoria de las funciones Lambda.' },
            { texto: 'Saber si la falla de S3 en N. Virginia que salió en las noticias afecta a sus propios buckets', grupo: 'health', retro: '¿Me afecta a mí? Health Dashboard.' }
          ],
          cierre: 'Control Tower: cuentas nuevas con controles. Service Catalog: solo lo aprobado, en autoservicio. Compute Optimizer: el tamaño justo con datos. Health Dashboard: fallas de AWS que te tocan.',
          pista: '¿Es crear cuentas, lanzar algo aprobado, ajustar el tamaño o una falla de AWS?'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Práctica en el simulador AWS',
      descripcion:
        'La práctica completa en el simulador AWS: entras a la cuenta de Café del Bajío y la pones en orden, de lo urgente a lo importante. Se califica sola mientras avanzas y tu docente ve tu progreso.',
      actividades: [
        {
          id: 's12-practica',
          tipo: 'simulador',
          titulo: 'Práctica 4: Café del Bajío ordena sus cuentas',
          xp: 400,
          minutos: 84,
          lab: 'practica-4',
          objetivo:
            'Poner en orden la cuenta de una cadena de cafeterías: nada expuesto, nada pagado de más, Producción y Pruebas separadas con límites que nadie se salta, el gasto repartido por ambiente, avisos antes de pasarse del presupuesto y el soporte justo para el negocio.',
          necesitas: [
            'Tu perfil de la Ruta: el simulador lo reconoce y le muestra tu avance a tu docente.',
            'Que tu docente abra la Práctica 4 en su panel.',
            'Una computadora o tableta: la consola en el celular es incómoda.',
            'No necesitas DataCamp ni tarjeta: todo es simulado y no cuesta nada.'
          ],
          caso: `
            <p><strong>Café del Bajío</strong> cobra en sus 14 cafeterías con la API <code>cafe-pos-api</code> y guarda a los clientes de «Bajío Puntos» en la base RDS <code>cafe-lealtad</code>. En tu cuenta del simulador ya está todo lo que dejó Toño: la API con su grupo <code>cafe-pos-sg</code>, la base con su respaldo manual, un bucket de tickets, una tabla de DynamoDB de pruebas y una IP elástica de una sucursal que cerró.</p>
            <p>Lupita, la contadora, quiere que nada quede expuesto, dejar de pagar lo que no se usa, separar <strong>Producción</strong> de <strong>Pruebas</strong>, saber en qué se va el dinero y enterarse <em>antes</em> de pasarse. <strong>No borres</strong> la API, la base ni su respaldo: el negocio los usa. Todo va en <strong>N. Virginia (us-east-1)</strong>. Algunos nombres y el monto del presupuesto cambian por alumno: el simulador te dice los tuyos en cada tarea.</p>
            ${recuadro('consejo', 'Un orden que funciona: lo urgente de Trusted Advisor → la IP y el cambio de tamaño (la instancia se detiene un momento: vuelve a encenderla) → Organizations, cuentas y SCP → etiquetas y su activación (el bono las necesita) → el presupuesto → la calculadora → el soporte → Well-Architected al final, porque se contesta según lo que ya hiciste.')}
            ${recuadro('recuerda', 'Cada tarea pide un <strong>resultado</strong>, no una lista de clics. La <strong>pista</strong> de cada tarea te dice en qué servicio y pantalla se hace. Con «Revisar mi avance» ves qué te falta. Trusted Advisor no se actualiza solo: cuando termines lo urgente, pídele que vuelva a revisar.')}`,
          arquitectura: ARQUITECTURA,
          tareas: [
            '<strong>Lo urgente: Trusted Advisor en verde.</strong> El respaldo <code>cafe-lealtad-respaldo</code> deja de ser público (sin borrarlo), nadie de internet puede intentar entrar por SSH a <code>cafe-pos-api</code> (las cajas siguen entrando por HTTP), la cuenta raíz tiene MFA y Trusted Advisor vuelve a revisar la cuenta.',
            '<strong>Deja de pagar lo que no se usa.</strong> La IP elástica de la sucursal cerrada ya no está en la cuenta, y <code>cafe-pos-api</code> (la misma instancia, sin borrarla) pasa a un tipo de al menos 2 vCPU y 2 GiB que cueste menos de la mitad por hora que <code>m5.large</code>, y queda encendida.',
            '<strong>Una cuenta para Producción y otra para Pruebas.</strong> Una organización con las OU <code>Produccion</code> y <code>Pruebas</code> directamente bajo Root, y una cuenta nueva dentro de cada una (los nombres y correos llevan tu sufijo).',
            '<strong>Pruebas no sale de N. Virginia.</strong> Una SCP que niegue crear recursos fuera de us-east-1 a todas las cuentas de la OU <code>Pruebas</code>, sin limitar a Producción y sin quitar <code>FullAWSAccess</code>.',
            '<strong>¿Cuánto cuesta cada ambiente?</strong> La tabla <code>cafe-pedidos-pruebas</code> con la etiqueta <code>Ambiente</code> = <code>Pruebas</code>, la llave <code>Ambiente</code> activada como etiqueta de asignación de costos y un reporte guardado de Cost Explorer que agrupe por ella.',
            '<strong>Que avise antes de pasarse.</strong> Un presupuesto de costo, mensual y para toda la cuenta, con una alerta al 80 % del gasto real y otra al 100 % del pronosticado, que le lleguen a <code>finanzas@cafedelbajio.mx</code>.',
            '<strong>Cuánto costarán los pedidos en línea.</strong> Una estimación de la Pricing Calculator con los servidores <code>t3.medium</code> que te toquen: una línea On-Demand y otra con un Compute Savings Plan a 1 año sin pago adelantado.',
            '<strong>Quién contesta a las 3 de la mañana.</strong> El plan de soporte más barato que permita abrir casos técnicos 24/7 y responda en menos de 1 hora cuando producción se cae.',
            '<strong>La revisión Well-Architected.</strong> Una carga de trabajo en <em>Production</em> y us-east-1, con SEC 1, COST 2, COST 3 y COST 6 contestadas según lo que hiciste hoy, y un milestone guardado después.',
            '<strong>Bono opcional:</strong> un segundo presupuesto que solo cuente lo etiquetado <code>Ambiente</code> = <code>Pruebas</code>, con su alerta. Suma puntos extra, pero tu calificación no pasa de 100.'
          ]
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Repaso para el examen',
      descripcion: 'Lo que hiciste hoy y lo que el examen pregunta de gobierno, costos y soporte, en una hoja, y un verdadero o falso para calentar antes del examen de práctica.',
      actividades: [
        {
          id: 's12-repaso',
          tipo: 'leccion',
          titulo: 'Gobierno y costos en una hoja',
          xp: 50,
          minutos: 3,
          laminas: [
            {
              titulo: 'La sesión 12 en una hoja',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    '<strong>Organizations</strong>: OU, una sola factura (la paga la cuenta de administración) y <strong>SCP</strong>.',
                    'La SCP es el <strong>techo</strong>: no da permisos, se hereda hacia abajo y nunca limita a la cuenta de administración.',
                    '<strong>Control Tower</strong>: landing zone y cuentas con controles. <strong>Service Catalog</strong>: solo lo aprobado. <strong>License Manager</strong>: licencias.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    '<strong>Etiquetas</strong>: se ponen en los recursos y se <strong>activan</strong> en Billing para que Cost Explorer agrupe por ellas.',
                    '<strong>Budgets</strong>: alertas por gasto real o pronosticado, y acciones que frenan el gasto. <strong>Service Quotas</strong>: ver y subir los límites de cada servicio.',
                    '<strong>Ahorrar</strong>: liberar IP elásticas sueltas, right-sizing (detener, cambiar el tipo, encender) con <strong>Compute Optimizer</strong>, y Savings Plans (más adelantado, más descuento).'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    '<strong>Trusted Advisor</strong> con Basic: chequeos de seguridad esenciales y de límites de servicio. Se vuelve a revisar con <em>Refresh</em>.',
                    '<strong>Soporte</strong>: casos técnicos desde Business Support+; el <strong>TAM</strong> desde Enterprise. <strong>re:Post</strong>: comunidad gratis.',
                    '<strong>Professional Services</strong>: expertos de AWS. <strong>APN</strong>: consultoras socias. <strong>Health Dashboard</strong>: ¿me afecta a mí?'
                  ])}</div>
                </div>`,
              notas: 'Pide que alguien explique en voz alta por qué la SCP de regiones va en la OU Pruebas y no en Root, y la diferencia entre Trusted Advisor y Compute Optimizer.'
            }
          ]
        },
        {
          id: 's12-vf',
          tipo: 'clasificar',
          titulo: '¿Verdadero o falso?',
          xp: 100,
          minutos: 4,
          contexto: '<p>Calentamiento antes del examen de práctica.</p>',
          pregunta: 'Decide si cada afirmación es verdadera o falsa.',
          grupos: [
            { id: 'v', nombre: 'Verdadero', color: 'green' },
            { id: 'f', nombre: 'Falso', color: 'red' }
          ],
          fichas: [
            { texto: 'Una SCP no da permisos: solo pone el límite de lo que se puede hacer en las cuentas.', grupo: 'v', retro: 'Verdadero: además hace falta una política de IAM que permita.' },
            { texto: 'Una SCP adjunta a Root también limita a la cuenta de administración.', grupo: 'f', retro: 'Falso: las SCP nunca limitan a la cuenta de administración.' },
            { texto: 'Para agrupar el gasto por una etiqueta en Cost Explorer, primero hay que activarla como etiqueta de asignación de costos.', grupo: 'v', retro: 'Verdadero: se activa en Billing and Cost Management → Cost allocation tags.' },
            { texto: 'Una IP elástica que no está asociada a ninguna instancia no se cobra.', grupo: 'f', retro: 'Falso: toda IPv4 pública se cobra por hora, y más vale liberarla si no se usa.' },
            { texto: 'AWS Budgets puede avisar por el gasto pronosticado, antes de que el gasto real llegue al límite.', grupo: 'v', retro: 'Verdadero: así te enteras a mitad de mes, a tiempo de actuar.' },
            { texto: 'Para cambiarle el tipo a una instancia respaldada por EBS hay que terminarla y lanzar otra.', grupo: 'f', retro: 'Falso: se detiene, se cambia el tipo y se vuelve a encender; conserva su id y sus discos.' },
            { texto: 'AWS Compute Optimizer recomienda el tamaño de instancias, volúmenes EBS y funciones Lambda según su uso real.', grupo: 'v', retro: 'Verdadero: usa las métricas de CloudWatch y aprendizaje automático.' },
            { texto: 'El Technical Account Manager (TAM) viene incluido desde el plan Basic.', grupo: 'f', retro: 'Falso: el TAM es de Enterprise Support o superior.' }
          ],
          cierre: 'Cuatro verdaderas y cuatro falsas. Si fallaste alguna, repasa esa lámina antes del examen.',
          pista: 'Hay cuatro verdaderas y cuatro falsas.'
        }
      ]
    }
  ],

  /* ---------------------------------------------------------- el plan */

  plan: [
    {
      desde: 0,
      hasta: 14,
      titulo: 'Arranque y capítulo 1 · El caso y lo que pide el examen',
      capitulo: 1,
      pasos: [
        'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”, sesión 12. Hoy no hay sandbox de DataCamp.',
        'Proyecta “Café del Bajío y su factura”: que el grupo diga qué arreglaría primero antes de ver la tercera columna.',
        'Detente en “La SCP pone el techo”: es la tarea donde más se equivocan (la ponen en Root o quitan FullAWSAccess).',
        'Pasa rápido por “Lo que el examen también pregunta” y, mientras resuelven “¿Quién lo resuelve?”, abre la Práctica 4 en el panel de Evaluación.'
      ],
      vigila: 'No te alargues en las tablas de servicios: el examen de práctica las vuelve a preguntar y el simulador necesita su tiempo.'
    },
    {
      desde: 14,
      hasta: 98,
      titulo: 'Capítulo 2 · Práctica en el simulador',
      capitulo: 2,
      pasos: [
        'En el panel de Evaluación abre la Práctica 4 (Café del Bajío). Que cada quien entre desde la actividad con «Abrir la práctica en el simulador».',
        'Lee el caso en voz alta y señala el orden sugerido: primero lo que expone datos, al final Well-Architected.',
        'A los 30 minutos pregunta quién ya tiene la organización: crear las cuentas y moverlas a su OU es donde más se tardan.',
        'Recorre el salón con el panel abierto en tu equipo: muestra quién va atorado en qué tarea. La SCP y la activación de la etiqueta son los atorones típicos.',
        'Diez minutos antes del final avisa que entreguen, aunque les falte algo: después pueden reintentar.'
      ],
      vigila: 'Que nadie borre la API, la base ni el respaldo, y que la API quede encendida después del cambio de tamaño.'
    },
    {
      desde: 98,
      hasta: 105,
      titulo: 'Capítulo 3 · Repaso',
      capitulo: 3,
      pasos: ['Proyecta la hoja de repaso.', 'El verdadero o falso es el termómetro antes del examen.'],
      vigila: 'Cuando casi todos terminen, abre el examen de práctica de la sesión 12.'
    },
    {
      desde: 105,
      hasta: 120,
      titulo: 'Examen de práctica y cierre',
      pasos: [
        'En el panel elige la sesión 12 y abre el examen en la pestaña “Práctica final”.',
        '20 preguntas de gobierno, costos y soporte en 15 minutos; dos son de respuesta múltiple («Elige DOS»). Una sola entrega.',
        'Al final, cierra el examen, proyecta las preguntas más falladas y descarga el CSV.',
        'Anuncia la sesión 13: la universidad migra a la nube, el ensayo del examen final, en 60 minutos y sin pistas paso a paso.'
      ],
      vigila: 'No proyectes el panel mientras contestan: muestra nombres y calificaciones.'
    }
  ]
};
