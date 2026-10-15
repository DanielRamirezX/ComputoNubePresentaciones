// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 7 · COSTOS, SOPORTE Y BUENAS PRÁCTICAS
//
// Cómo cobra AWS y cómo se vigila el gasto (Pricing Calculator, Cost Explorer,
// Budgets), cuentas y gobierno (Organizations), planes de soporte, Trusted
// Advisor y el marco Well-Architected. Dominios "Facturación, precios y
// soporte" y "Conceptos de la nube" del CLF-C02.
//
// El laboratorio tiene dos partes. La A se hace sin sandbox, en la calculadora
// pública (calculator.aws). La B usa el sandbox, que deja VER la facturación,
// Cost Explorer, Trusted Advisor y los planes de soporte, pero no crear
// presupuestos (budgets:ModifyBudget), ni entrar a Organizations, ni pasar del
// primer paso de la Well-Architected Tool (wellarchitected:ListLenses). La
// página Free Tier no carga. Todo verificado en el sandbox el 15 de octubre
// de 2026.
// ---------------------------------------------------------------------------

import { boton, capturasDe, icono, lista, nubi, recuadro } from './piezas.js';

const captura = capturasDe('s7');
const capturaS1 = capturasDe('s1');

export const SESION_7 = {
  numero: 7,
  titulo: 'Costos, soporte y buenas prácticas',
  subtitulo: 'Sesión 7 · Costos, soporte y buenas prácticas',
  resumen:
    'Cuánto cuesta la nube y cómo no llevarse sorpresas: la calculadora de precios para estimar antes de crear, Cost Explorer y Budgets para vigilar el gasto, Organizations para varias cuentas, los planes de soporte, Trusted Advisor y los seis pilares de Well-Architected. Estimas una tienda en la calculadora y recorres la facturación real del sandbox.',
  duracion: '2 horas',
  minutosSandbox: 15,

  practica: {
    titulo: 'Examen de práctica · Sesión 7',
    corto: 'Examen de práctica',
    resumen: '20 preguntas de costos, soporte y buenas prácticas al estilo del examen de certificación, unos 17 minutos, una sola entrega.',
    plegable: 'Ver cómo es el examen real'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'Antes de encender el sandbox',
      descripcion:
        'De qué depende lo que cobra AWS, las herramientas para estimar y vigilar el gasto, cómo se administran muchas cuentas, qué ofrece cada plan de soporte y los seis pilares de una buena arquitectura. Este capítulo se hace con el sandbox apagado.',
      actividades: [
        {
          id: 's7-precios',
          tipo: 'leccion',
          titulo: 'Cómo cobra AWS',
          xp: 50,
          minutos: 7,
          laminas: [
            {
              titulo: 'Pagas lo que usas',
              html: `
                <p class="entrada">En AWS no compras servidores: <strong>pagas por lo que usas</strong>, como la luz. Casi todo lo que cobra sale de tres cosas.</p>
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('cpu')}<h3>Cómputo</h3><p>Por segundo u hora que una instancia está encendida, según su tamaño.</p></article>
                  <article class="rol">${icono('disco')}<h3>Almacenamiento</h3><p>Por gigabyte al mes que guardas: discos EBS, buckets de S3, snapshots.</p></article>
                  <article class="rol">${icono('red')}<h3>Datos que salen</h3><p>Los datos que <strong>entran</strong> a AWS no se cobran; los que <strong>salen</strong> a internet sí.</p></article>
                </div>
                ${recuadro('recuerda', 'Las formas de pagar una instancia ya las viste en la sesión 1: <strong>On-Demand</strong> (sin compromiso), <strong>Savings Plans</strong> e <strong>instancias reservadas</strong> (compromiso de 1 o 3 años), <strong>Spot</strong> (capacidad sobrante, se puede interrumpir) y <strong>Dedicated Hosts</strong> (un servidor físico para ti).')}`,
              notas: 'Pregunta al grupo: ¿por qué AWS no cobra la entrada de datos y sí la salida? (Quiere que lleves tus datos; sacarlos cuesta.)'
            },
            {
              titulo: 'Ahorrar sin dejar de usar',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Idea</th><th scope="col">Qué significa</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Comprometerte</th><td>Savings Plans e instancias reservadas: prometes uso por 1 o 3 años y AWS te descuenta hasta 72&nbsp;%.</td></tr>
                      <tr><th scope="row">Usar lo sobrante</th><td>Spot: hasta 90&nbsp;% más barato, a cambio de que AWS pueda recuperar la máquina.</td></tr>
                      <tr><th scope="row">Volumen</th><td>Mientras más usas de algunos servicios (como S3), más barato sale cada gigabyte.</td></tr>
                      <tr><th scope="row">Ajustar el tamaño</th><td>Apagar lo que no se usa y elegir el tipo de instancia justo (<em>right-sizing</em>).</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('sabias', 'La <strong>capa gratuita</strong> (Free Tier) tiene ofertas que <strong>nunca vencen</strong> hasta cierto límite (por ejemplo, un millón de solicitudes de Lambda al mes), créditos o meses gratis para cuentas nuevas y <strong>pruebas gratuitas</strong> de algunos servicios. Las condiciones exactas cambian: revísalas en la página de AWS Free Tier.')}`,
              notas: 'Desde 2025 las cuentas nuevas reciben créditos en lugar de los clásicos “12 meses gratis”. Los bancos de preguntas viejos todavía hablan de los 12 meses; lo que no cambia es que existen ofertas “siempre gratis”.'
            }
          ]
        },
        {
          id: 's7-ex-precio',
          tipo: 'clasificar',
          titulo: '¿Cómo conviene pagar?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Una tienda en línea quiere pagar lo justo por cada uno de sus servidores. Repaso de la sesión 1, ahora pensando en dinero.</p>',
          pregunta: 'Elige la forma de pago para cada caso.',
          grupos: [
            { id: 'demanda', nombre: 'On-Demand', color: 'blue' },
            { id: 'compromiso', nombre: 'Savings Plans o reservadas', color: 'green' },
            { id: 'spot', nombre: 'Spot', color: 'yellow' },
            { id: 'dedicado', nombre: 'Dedicated Hosts', color: 'purple' }
          ],
          fichas: [
            { texto: 'La base de datos que corre todo el día, todos los días, por los próximos 3 años', grupo: 'compromiso', retro: 'Uso constante y predecible: compromiso de 1 o 3 años.' },
            { texto: 'Un servidor de pruebas para la campaña de Buen Fin, solo dos semanas', grupo: 'demanda', retro: 'Corto y sin compromiso: On-Demand.' },
            { texto: 'Generar miniaturas de fotos; si se interrumpe, se reanuda después', grupo: 'spot', retro: 'Tolera interrupciones: Spot, el más barato.' },
            { texto: 'Un software cuya licencia se cobra por servidor físico', grupo: 'dedicado', retro: 'Licencias ligadas al hardware: Dedicated Hosts.' },
            { texto: 'Los servidores web base, que nunca bajan de dos instancias', grupo: 'compromiso', retro: 'Lo que siempre está encendido conviene con compromiso.' },
            { texto: 'Un experimento de un día cuya duración nadie sabe', grupo: 'demanda', retro: 'Impredecible y corto: On-Demand.' },
            { texto: 'Análisis de datos por lotes que puede esperar si no hay capacidad', grupo: 'spot', retro: 'Puede esperar y reanudarse: Spot.' },
            { texto: 'Una regla de cumplimiento exige que nadie más use el mismo servidor', grupo: 'dedicado', retro: 'Hardware exclusivo: Dedicated Hosts.' }
          ],
          cierre: 'On-Demand: corto o impredecible. Compromiso: constante por años. Spot: puede interrumpirse. Dedicated Hosts: licencias o hardware exclusivo.',
          pista: '¿Cuánto tiempo va a correr, y qué pasa si se interrumpe?'
        },
        {
          id: 's7-herramientas',
          tipo: 'leccion',
          titulo: 'Estimar, vigilar y repartir el gasto',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Antes, durante y después',
              html: `
                <div class="carrera">
                  <div class="carrera__fila carrera__fila--nube"><span class="carrera__quien">Antes</span><ol><li><strong>AWS Pricing Calculator</strong>: estima cuánto costará una arquitectura antes de crearla</li></ol><span class="carrera__tiempo">estimar</span></div>
                  <div class="carrera__fila"><span class="carrera__quien">Durante</span><ol><li><strong>AWS Budgets</strong>: avisa cuando el gasto real o pronosticado pasa de un límite</li></ol><span class="carrera__tiempo">alertar</span></div>
                  <div class="carrera__fila carrera__fila--propio"><span class="carrera__quien">Después</span><ol><li><strong>Cost Explorer</strong>: gráficas de lo que ya gastaste, por servicio, y pronóstico</li></ol><span class="carrera__tiempo">analizar</span></div>
                </div>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Herramienta</th><th scope="col">Para qué</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Billing and Cost Management</th><td>El tablero de facturación: gasto del mes, pronóstico y facturas.</td></tr>
                      <tr><th scope="row">Cost Anomaly Detection</th><td>Detecta solo, con aprendizaje automático, gastos que se salen de lo normal.</td></tr>
                      <tr><th scope="row">Cost and Usage Report</th><td>El informe más detallado, renglón por renglón, para analizarlo con otras herramientas.</td></tr>
                      <tr><th scope="row">Etiquetas de asignación de costos</th><td>Etiquetas como <em>Proyecto=tienda</em> para repartir la factura por proyecto o departamento.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Estimar antes de crear”</em> → <strong>Pricing Calculator</strong>. <em>“Analizar lo que ya gasté”</em> → <strong>Cost Explorer</strong>. <em>“Alerta si paso de X dólares”</em> → <strong>Budgets</strong>. <em>“Saber cuánto gasta cada departamento”</em> → <strong>etiquetas</strong>.')}`,
              notas: 'En el laboratorio harán las tres: estimar en la calculadora, analizar en Cost Explorer e intentar crear un presupuesto.'
            },
            {
              titulo: 'Muchas cuentas, una sola factura',
              html: `
                <p class="entrada">Las empresas no usan una sola cuenta de AWS: tienen una para producción, otra para pruebas, una por área… <strong>AWS Organizations</strong> las junta.</p>
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('edificio')}<h3>Unidades organizativas</h3><p>Agrupa las cuentas en carpetas (OU), como <em>Producción</em> o <em>Pruebas</em>.</p></article>
                  <article class="rol">${icono('escudo')}<h3>Políticas SCP</h3><p>Ponen el límite de lo que pueden hacer las cuentas. Las viste en la sesión 2… y en los “explicit deny” del sandbox.</p></article>
                  <article class="rol">${icono('dinero')}<h3>Facturación consolidada</h3><p>Una sola factura para todas las cuentas, y el uso se suma para alcanzar <strong>descuentos por volumen</strong>.</p></article>
                </div>
                ${recuadro('sabias', '<strong>AWS Control Tower</strong> prepara en unos clics un entorno de varias cuentas con buenas prácticas ya aplicadas (una <em>landing zone</em>). Organizations no tiene costo extra.')}`,
              notas: 'El sandbox de DataCamp es justo una cuenta dentro de una organización: por eso hay SCP que niegan RDS o el Internet Gateway.'
            }
          ]
        },
        {
          id: 's7-ex-herramienta',
          tipo: 'opcion',
          titulo: '¿Qué herramienta?',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>La directora de finanzas de una escuela dice: “Quiero que me llegue un correo <strong>en cuanto el gasto del mes vaya a pasar de 300 dólares</strong>, no cuando ya sea tarde”.</p>',
          pregunta: '¿Qué le configuras?',
          opciones: [
            { texto: 'Un reporte en Cost Explorer que ella revise cada fin de mes.', retro: 'Cost Explorer sirve para analizar, pero no avisa solo.' },
            { texto: 'Un presupuesto en AWS Budgets con alerta por gasto pronosticado.', correcta: true, retro: '¡Correcto! Budgets avisa cuando el gasto real o el pronosticado pasa del límite que tú pones.' },
            { texto: 'Una estimación en AWS Pricing Calculator.', retro: 'La calculadora estima antes de crear; no vigila el gasto real.' },
            { texto: 'Un plan de soporte más caro.', retro: 'El soporte da ayuda técnica; no manda alertas de gasto.' }
          ],
          pista: 'Busca la palabra clave: “que me llegue un correo”.'
        },
        {
          id: 's7-soporte',
          tipo: 'leccion',
          titulo: 'Quién te ayuda: soporte y asesores',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Los planes de soporte',
              html: `
                <p class="entrada">Toda cuenta tiene soporte <strong>Basic</strong> gratis. Si necesitas que un ingeniero de AWS te responda rápido, contratas un plan mayor. Así se ven hoy en la consola:</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Plan</th><th scope="col">Costo</th><th scope="col">Lo que destaca</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Basic Support</th><td>Gratis</td><td>Atención de facturación y cuotas, AWS Health, Trusted Advisor <strong>limitado</strong></td></tr>
                      <tr><th scope="row">Business Support+</th><td>Desde 29 USD al mes</td><td>Expertos 24/7, respuesta en menos de 30 min si tu sistema cae, todos los chequeos de Trusted Advisor</td></tr>
                      <tr><th scope="row">Enterprise Support</th><td>Desde 5,000 USD al mes</td><td>Respuesta en menos de 15 min y un <strong>Technical Account Manager (TAM)</strong></td></tr>
                      <tr><th scope="row">Unified Operations</th><td>Desde 50,000 USD al mes</td><td>Gerentes de incidentes en 5 min y un TAM designado</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', 'Muchos bancos de preguntas usan los nombres anteriores: <em>Developer, Business, Enterprise On-Ramp y Enterprise</em>. Lo que no cambia: <strong>Basic es gratis</strong> y trae Trusted Advisor limitado; mientras más alto el plan, más rápida la respuesta; el <strong>TAM</strong> es de <strong>Enterprise</strong>.')}`,
              notas: 'En el laboratorio verán esta misma tabla en la consola del sandbox, con los precios. El sandbox tiene el plan Basic.'
            },
            {
              titulo: 'Asesores automáticos y ayuda de fuera',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Para qué</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">AWS Trusted Advisor</th><td>Revisa tu cuenta y recomienda en cinco áreas: <strong>costos, rendimiento, seguridad, tolerancia a fallas y límites de servicio</strong> (la consola agrega excelencia operativa).</td></tr>
                      <tr><th scope="row">AWS Health Dashboard</th><td>Te dice si un problema de AWS afecta <strong>tus</strong> recursos, y qué mantenimiento viene.</td></tr>
                      <tr><th scope="row">AWS Marketplace</th><td>Una tienda de software de otras empresas, listo para correr en AWS.</td></tr>
                      <tr><th scope="row">AWS Partner Network</th><td>Empresas consultoras certificadas que ayudan a migrar o construir en AWS.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Recomendaciones para ahorrar y cerrar huecos de seguridad”</em> → <strong>Trusted Advisor</strong>. <em>“¿Esta falla de AWS afecta a mis instancias?”</em> → <strong>Health Dashboard</strong>. <em>“Comprar software de terceros”</em> → <strong>Marketplace</strong>.')}`,
              notas: 'Trusted Advisor “mira” tu cuenta; Health mira a AWS. Es la confusión más común.'
            }
          ]
        },
        {
          id: 's7-ex-soporte',
          tipo: 'opcion',
          titulo: 'Un asesor para la empresa',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Un banco corre sistemas críticos en AWS y quiere una persona de AWS asignada que conozca su arquitectura y le dé <strong>guía técnica de forma proactiva</strong>: un Technical Account Manager.</p>',
          pregunta: '¿Qué necesita?',
          opciones: [
            { texto: 'El plan Basic Support, que ya tiene la cuenta.', retro: 'Basic solo incluye atención de facturación y chequeos limitados.' },
            { texto: 'Activar AWS Trusted Advisor.', retro: 'Trusted Advisor da recomendaciones automáticas, no una persona asignada.' },
            { texto: 'Contratar a una empresa en AWS Marketplace.', retro: 'Marketplace vende software; el TAM es parte de un plan de soporte de AWS.' },
            { texto: 'Un plan Enterprise Support o superior.', correcta: true, retro: '¡Correcto! El Technical Account Manager llega con Enterprise Support.' }
          ],
          pista: 'Busca la palabra clave: “Technical Account Manager”.'
        },
        {
          id: 's7-buenas-practicas',
          tipo: 'leccion',
          titulo: 'Construir bien: Well-Architected',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Los seis pilares',
              html: `
                <p class="entrada">El <strong>AWS Well-Architected Framework</strong> reúne lo que AWS aprendió de miles de arquitecturas en <strong>seis pilares</strong>. La <strong>Well-Architected Tool</strong> te hace preguntas sobre tu sistema y te dice dónde flaquea.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Pilar</th><th scope="col">La pregunta que responde</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Excelencia operativa</th><td>¿Lo operamos y mejoramos bien? Automatizar, cambios pequeños, aprender de las fallas.</td></tr>
                      <tr><th scope="row">Seguridad</th><td>¿Protegemos datos y accesos? Mínimo privilegio, cifrado, registros.</td></tr>
                      <tr><th scope="row">Fiabilidad</th><td>¿Se recupera solo de las fallas? Varias zonas, Auto Scaling, respaldos.</td></tr>
                      <tr><th scope="row">Eficiencia del rendimiento</th><td>¿Usamos el recurso adecuado? El tipo de instancia o base de datos justa.</td></tr>
                      <tr><th scope="row">Optimización de costos</th><td>¿Pagamos solo lo que sirve? Apagar lo ocioso, elegir bien cómo pagar.</td></tr>
                      <tr><th scope="row">Sostenibilidad</th><td>¿Reducimos el impacto ambiental? Usar menos recursos para lo mismo.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Revisar mi arquitectura contra las buenas prácticas de AWS”</em> → <strong>Well-Architected Tool</strong>. <em>“Recuperarse de fallas”</em> → pilar de <strong>fiabilidad</strong>.')}`,
              notas: 'Un truco para recordarlos: “Operar Seguro, Fiable, Eficiente, Barato y Verde”.'
            },
            {
              titulo: 'Mudarse a la nube con plan: el CAF',
              html: `
                <p class="entrada">El <strong>AWS Cloud Adoption Framework (CAF)</strong> ayuda a una organización a <strong>adoptar</strong> la nube. Lo organiza en seis perspectivas: tres de negocio y tres técnicas.</p>
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('dinero')}<strong>Negocio, Personas y Gobernanza</strong><p>Por qué migrar, cómo capacitar a la gente y cómo controlar riesgos y presupuesto.</p></div>
                  <div>${icono('servidor')}<strong>Plataforma, Seguridad y Operaciones</strong><p>Cómo construir, proteger y mantener funcionando lo que se mueve a la nube.</p></div>
                  <div>${icono('mapa')}<strong>Diferencia clave</strong><p>Well-Architected revisa <em>una carga de trabajo</em>; el CAF guía a <em>toda la organización</em>.</p></div>
                </div>`,
              notas: 'En el examen, “capacitar al personal para la nube” es la perspectiva de Personas.'
            }
          ]
        },
        {
          id: 's7-ex-pilares',
          tipo: 'clasificar',
          titulo: '¿Qué pilar?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Un equipo revisa su tienda en línea con la Well-Architected Tool. Cada mejora toca un pilar.</p>',
          pregunta: 'Manda cada mejora a su pilar.',
          grupos: [
            { id: 'operativa', nombre: 'Excelencia operativa', color: 'blue' },
            { id: 'seguridad', nombre: 'Seguridad', color: 'red' },
            { id: 'fiabilidad', nombre: 'Fiabilidad', color: 'green' },
            { id: 'costos', nombre: 'Optimización de costos', color: 'yellow' }
          ],
          fichas: [
            { texto: 'Repartir los servidores en dos zonas para que la tienda siga si una falla', grupo: 'fiabilidad', retro: 'Sobrevivir a fallas: fiabilidad.' },
            { texto: 'Activar MFA y dar solo los permisos necesarios', grupo: 'seguridad', retro: 'Proteger accesos: seguridad.' },
            { texto: 'Apagar de noche los servidores de pruebas', grupo: 'costos', retro: 'No pagar por lo que no se usa: costos.' },
            { texto: 'Automatizar los despliegues y hacer cambios pequeños y frecuentes', grupo: 'operativa', retro: 'Operar y mejorar: excelencia operativa.' },
            { texto: 'Programar respaldos automáticos de la base de datos', grupo: 'fiabilidad', retro: 'Poder recuperarse: fiabilidad.' },
            { texto: 'Cifrar los datos de los clientes', grupo: 'seguridad', retro: 'Proteger datos: seguridad.' },
            { texto: 'Comprar un Savings Plan para los servidores que nunca se apagan', grupo: 'costos', retro: 'Pagar menos por lo mismo: costos.' },
            { texto: 'Escribir qué hacer cuando algo falla y revisarlo después de cada incidente', grupo: 'operativa', retro: 'Aprender de las fallas: excelencia operativa.' }
          ],
          cierre: 'Faltaron dos pilares: eficiencia del rendimiento (usar el recurso adecuado) y sostenibilidad (gastar menos energía para lo mismo).',
          pista: '¿Protege, recupera, ahorra o mejora la forma de operar?'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Laboratorio guiado en AWS',
      descripcion:
        'Primero, sin sandbox, estimas en la calculadora de precios cuánto cuestan dos servidores y comparas formas de pago. Luego enciendes el sandbox y recorres la facturación real: Cost Explorer, un presupuesto, Trusted Advisor, los planes de soporte y Well-Architected.',
      actividades: [
        {
          id: 's7-lab-costos',
          tipo: 'laboratorio',
          titulo: 'Laboratorio: estima, vigila y revisa',
          xp: 300,
          minutos: 42,
          objetivo:
            'Estimar en AWS Pricing Calculator el costo de dos servidores con distintas formas de pago, y revisar en la consola el gasto real con Cost Explorer, los límites de un presupuesto, las recomendaciones de Trusted Advisor y los planes de soporte.',
          necesitas: [
            'Un navegador en tu computadora (la calculadora es pública: no usa el sandbox).',
            'Tu sesión de DataCamp abierta para la segunda parte (el sandbox todavía apagado).',
            'Unos 15 minutos de sandbox.',
            'Una forma de tomar capturas de pantalla.'
          ],
          pasos: [
            {
              titulo: 'Prepárate',
              html: `
                <p>La primera parte del laboratorio <strong>no usa el sandbox</strong>: la calculadora de precios es una página pública. Estos son los datos:</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Qué</th><th scope="col">Valor</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Descripción</th><td><kbd>Servidores web de la tienda</kbd></td></tr>
                      <tr><th scope="row">Región</th><td>Este de EE.&nbsp;UU. (Norte de Virginia), la misma del sandbox</td></tr>
                      <tr><th scope="row">Instancias</th><td>2 de tipo <kbd>t2.micro</kbd>, Linux</td></tr>
                      <tr><th scope="row">Presupuesto (parte 2)</th><td><kbd>presupuesto-tu-nombre</kbd>, 10 dólares al mes</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('consejo', 'Las imágenes son capturas reales. Tócalas para verlas en grande. Si tu navegador está en inglés, la calculadora sale en inglés: los botones están en el mismo lugar.')}`,
              ver: 'Tienes la tabla a la mano y el sandbox sigue apagado.',
              sandbox: false
            },
            {
              titulo: 'Abre la calculadora de precios',
              html: `
                <ol class="pasos-consola">
                  <li>En una pestaña nueva de tu navegador abre <kbd>calculator.aws</kbd>.</li>
                  <li>Pulsa ${boton('Crear una estimación', 'Create estimate')}. No necesitas cuenta ni iniciar sesión.</li>
                </ol>
                ${captura('01-calculadora', 'La portada de la calculadora de precios de AWS', [
                  [72.2, 66.8, '<strong>Crear una estimación</strong>, sin iniciar sesión'],
                  [74.5, 48.8, 'Sign in: no lo necesitas'],
                  [64.2, 4.3, 'Idioma de la página']
                ])}
                ${recuadro('examen', '<em>“Estimar el costo de una arquitectura antes de crearla”</em> → <strong>AWS Pricing Calculator</strong>.')}`,
              ver: 'La página “Añadir servicio” con una lista de servicios de AWS.',
              sandbox: false
            },
            {
              titulo: 'Agrega dos servidores EC2',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Elija una región</strong> elige <strong>Este de EE.&nbsp;UU. (Norte de Virginia)</strong>.</li>
                  <li>En <strong>Buscar servicio</strong> escribe <kbd>Amazon EC2</kbd> y, en su tarjeta, pulsa ${boton('Configurar', 'Configure')}.</li>
                </ol>
                ${captura('02-buscar-ec2', 'La búsqueda de Amazon EC2 en la región Norte de Virginia', [
                  [78.4, 38.2, 'Región: Norte de Virginia'],
                  [58.9, 51.4, 'Busca <em>Amazon EC2</em>'],
                  [40.4, 91.8, '<strong>Configurar</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>En <strong>Descripción</strong> escribe <kbd>Servidores web de la tienda</kbd>. Deja Linux y <strong>Uso constante</strong>.</li>
                  <li>En <strong>Cantidad de instancias</strong> escribe <kbd>2</kbd>.</li>
                  <li>En <strong>Buscar tipo de instancia</strong> escribe <kbd>t2.micro</kbd> y elígela en la tabla.</li>
                </ol>
                ${captura('03-tipo-instancia', 'La tabla de instancias con t2.micro elegida', [
                  [1.7, 92.0, 'Elige <strong>t2.micro</strong>: 1 vCPU, 1 GiB'],
                  [93.9, 92.0, 'Cuesta 0.0116 USD por hora']
                ])}
                ${recuadro('recuerda', 'Es el mismo tipo que usaste en la sesión 1. Un centavo por hora parece nada… hasta que lo multiplicas por 730 horas al mes y por dos servidores.')}`,
              ver: 'La fila t2.micro marcada, con 1 vCPU, 1 GiB y 0.0116 de costo por hora.',
              sandbox: false
            },
            {
              titulo: 'Compara formas de pago',
              html: `
                <ol class="pasos-consola">
                  <li>Baja a <strong>Opciones de pago</strong>. Viene marcado <strong>Compute Savings Plans</strong> a 3 años, sin pago inicial. Mira el <strong>costo total mensual</strong> abajo a la izquierda.</li>
                </ol>
                ${captura('04-opciones-pago', 'Las cuatro opciones de pago con el costo mensual abajo', [
                  [25.7, 33.0, 'Compute Savings Plans: hasta 66&nbsp;%'],
                  [45.8, 33.0, 'EC2 Instance Savings Plans: hasta 72&nbsp;%'],
                  [63.6, 33.0, 'Bajo demanda'],
                  [83.3, 33.0, 'Spot: descuento histórico de 70&nbsp;%'],
                  [7.3, 96.5, 'Con Savings Plan: <strong>8.47 USD</strong> al mes']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Ahora marca <strong>Bajo demanda</strong> (On-Demand) y vuelve a mirar el costo mensual.</li>
                </ol>
                ${captura('05-bajo-demanda', 'Bajo demanda elegido y el costo mensual de 16.94 USD', [
                  [58.1, 10.7, '<strong>Bajo demanda</strong>'],
                  [6.9, 95.3, 'Sin compromiso: <strong>16.94 USD</strong> al mes']
                ])}
                ${recuadro('examen', 'El mismo par de servidores cuesta <strong>casi la mitad</strong> si te comprometes 3 años. A cambio, pierdes flexibilidad. Spot sería aún más barato, pero la tienda no puede apagarse en pleno Buen Fin.')}`,
              ver: 'Con Bajo demanda, el costo total mensual dice 16.94 USD; con el Savings Plan decía 8.47 USD.',
              sandbox: false
            },
            {
              titulo: 'Revisa tu estimación',
              html: `
                <ol class="pasos-consola">
                  <li>Con <strong>Bajo demanda</strong> marcado, pulsa ${boton('Guardar y ver resumen', 'Save and view summary')}.</li>
                  <li>Lee el resumen: costo inicial, costo mensual y el total de 12 meses.</li>
                </ol>
                ${captura('06-estimacion', 'El resumen My Estimate con Amazon EC2', [
                  [26.0, 36.5, 'Costo mensual: 16.94 USD'],
                  [49.7, 37.6, 'Un año: <strong>203.28 USD</strong>'],
                  [89.5, 8.4, 'Exportar (CSV o PDF)'],
                  [95.8, 8.4, 'Compartir']
                ])}
                <p>${boton('Compartir', 'Share')} genera un enlace <strong>público</strong> a tu estimación, útil para mandarla a tu jefe o a un cliente. Hoy no lo necesitas: basta la captura.</p>
                ${recuadro('sabias', 'La estimación no crea nada en AWS ni cobra nada. Si cierras la pestaña sin guardar el enlace, se pierde.')}`,
              ver: 'El resumen “My Estimate” con Amazon EC2, 16.94 USD al mes y 203.28 USD en 12 meses. Tómale captura: es tu primera evidencia.',
              evidencia: {
                id: 'estimacion',
                titulo: 'Tu estimación',
                pide: 'El resumen “My Estimate” de la calculadora con Amazon EC2, el costo mensual y el total de 12 meses.'
              },
              sandbox: false
            },
            {
              titulo: 'Enciende el sandbox y abre la facturación',
              html: `
                <ol class="pasos-consola">
                  <li>En DataCamp abre <strong>Sandbox</strong> y, en la tarjeta de <strong>AWS</strong>, pulsa ${boton('Open Sandbox', 'abrir sandbox')}.</li>
                </ol>
                ${capturaS1('01-sandbox-datacamp', 'Página Sandbox de DataCamp con la tarjeta de AWS', [[93.7, 63.1, '<strong>Open Sandbox</strong> en la tarjeta de AWS']])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>En la consola busca <kbd>Billing and Cost Management</kbd> y ábrelo.</li>
                  <li>Lee el resumen: lo que va del mes, el pronóstico y el estado de los presupuestos.</li>
                </ol>
                ${captura('07-facturacion', 'La página de inicio de Billing and Cost Management', [
                  [20.6, 19.8, 'Lo gastado este mes'],
                  [20.6, 31.7, 'El pronóstico del mes'],
                  [84.9, 19.8, 'Presupuestos: <em>Setup required</em>'],
                  [3.6, 59.5, '<strong>Cost Explorer</strong>: lo usarás ahora']
                ])}
                ${recuadro('recuerda', 'Es la factura real de la cuenta del sandbox, que comparten muchos alumnos a lo largo del tiempo. Por eso hay gasto de meses en los que tú no estabas.')}`,
              ver: 'Billing and Cost Management home con el Cost summary: costo del mes, pronóstico y costo del mes pasado.',
              problemas: [['Sale “You already have an active Sandbox Session running”', 'Una sesión anterior quedó abierta: pulsa Exit Session, espera unos segundos y vuelve a entrar.']],
              sandbox: true
            },
            {
              titulo: 'Analiza el gasto con Cost Explorer',
              html: `
                <ol class="pasos-consola">
                  <li>En el menú izquierdo pulsa <strong>Cost Explorer</strong>.</li>
                  <li>Si sale un aviso azul, ciérralo con la <kbd>X</kbd>. Lee el total, el promedio y la gráfica por mes.</li>
                </ol>
                ${captura('08-cost-explorer', 'Cost Explorer con el costo de seis meses agrupado por servicio', [
                  [18.5, 4.6, 'Total de los últimos 6 meses'],
                  [91.0, 40.8, 'Agrupado por <strong>Service</strong>'],
                  [27.5, 61.4, 'Cada color es un servicio'],
                  [47.9, 97.8, 'La leyenda dice cuál es cuál']
                ])}
                ${recuadro('examen', '<em>“Ver en qué servicios se fue el dinero los últimos meses y pronosticar”</em> → <strong>Cost Explorer</strong>. Mira las barras: ¿qué servicio gastó más?')}`,
              ver: 'La gráfica de barras por mes, de colores por servicio, con el Total cost arriba. Tómale captura: es tu segunda evidencia.',
              evidencia: {
                id: 'cost-explorer',
                titulo: 'El gasto en Cost Explorer',
                pide: 'Cost Explorer con el Total cost y la gráfica de barras por mes agrupada por servicio.'
              },
              sandbox: true
            },
            {
              titulo: 'Intenta crear un presupuesto',
              html: `
                <ol class="pasos-consola">
                  <li>En el menú izquierdo, en <strong>Budgets and Planning</strong>, pulsa <strong>Budgets</strong> y luego ${boton('Create a budget', 'crear presupuesto')}.</li>
                </ol>
                ${captura('09-budgets', 'La portada de AWS Budgets', [
                  [77.4, 39.8, '<strong>Create a budget</strong>'],
                  [76.0, 58.7, 'Usar Budgets no cuesta'],
                  [49.1, 80.8, 'Te avisa cuando te pasas']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Deja <strong>Use a template</strong> y elige la plantilla <strong>Monthly cost budget</strong>.</li>
                  <li>Nombre: <kbd>presupuesto-tu-nombre</kbd>. Monto: <kbd>10</kbd>. Email: el tuyo de la escuela.</li>
                  <li>Lee el aviso azul y pulsa ${boton('Create budget', 'crear presupuesto')}.</li>
                </ol>
                ${captura('10-presupuesto', 'La plantilla Monthly cost budget llena', [
                  [34.1, 21.8, 'Nombre del presupuesto'],
                  [34.1, 36.2, 'El límite: 10 dólares'],
                  [34.1, 47.9, 'A quién avisar'],
                  [34.1, 71.5, 'Avisa al 85&nbsp;%, al 100&nbsp;% y si el pronóstico llega al 100&nbsp;%'],
                  [94.6, 96.0, '<strong>Create budget</strong>']
                ])}
                ${captura('11-presupuesto-negado', 'El aviso de que falta el permiso budgets:ModifyBudget', [
                  [22.0, 8.5, 'Falta <em>budgets:ModifyBudget</em>'],
                  [34.1, 62.3, 'Tu presupuesto no se guardó']
                ])}
                <p>El sandbox deja <strong>ver</strong> la facturación pero no <strong>crear</strong> presupuestos. Es otra vez el mínimo privilegio: leer y modificar son permisos distintos.</p>
                ${recuadro('consejo', 'En tu propia cuenta de AWS, crear un presupuesto como este es <strong>lo primero</strong> que deberías hacer, antes de encender cualquier servidor.')}`,
              ver: 'El aviso rojo “Budget creation failed” que menciona budgets:ModifyBudget.',
              sandbox: true
            },
            {
              titulo: 'Lo que recomienda Trusted Advisor',
              html: `
                <ol class="pasos-consola">
                  <li>Busca <kbd>Trusted Advisor</kbd> y ábrelo. Mira las categorías del menú izquierdo y el aviso azul.</li>
                </ol>
                ${captura('12-trusted-advisor', 'Trusted Advisor Recommendations con sus categorías', [
                  [5.6, 20.0, 'Optimización de costos'],
                  [4.0, 31.1, 'Seguridad'],
                  [4.8, 42.4, 'Límites de servicio'],
                  [30.3, 81.4, 'Más chequeos con un mejor plan de soporte']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Pulsa <strong>Security</strong>. Lee los chequeos que sí revisa el plan Basic.</li>
                </ol>
                ${captura('13-ta-seguridad', 'Los chequeos de seguridad de Trusted Advisor', [
                  [15.0, 24.9, 'Snapshots de EBS públicos: ninguno'],
                  [15.3, 64.9, 'Permisos de buckets de S3'],
                  [13.4, 81.4, 'MFA en la cuenta raíz']
                ])}
                ${recuadro('examen', 'Con el plan <strong>Basic</strong>, Trusted Advisor revisa solo algunos chequeos (de seguridad y límites). Para verlos todos hace falta Business Support+ o superior.')}`,
              ver: 'La categoría Security con los chequeos de snapshots públicos, buckets de S3 y MFA en la raíz. Tómale captura: es tu tercera evidencia.',
              evidencia: {
                id: 'trusted-advisor',
                titulo: 'Los chequeos de Trusted Advisor',
                pide: 'Trusted Advisor en la categoría Security, con los chequeos de snapshots públicos, permisos de S3 y MFA en la cuenta raíz.'
              },
              sandbox: true
            },
            {
              titulo: 'Los planes de soporte, en la consola',
              html: `
                <ol class="pasos-consola">
                  <li>Busca <kbd>Support</kbd> y abre <strong>Support Center</strong>. Arriba a la izquierda dice qué plan tiene la cuenta. Ignora el aviso rojo.</li>
                  <li>En el menú pulsa <strong>Manage Support Plan</strong>.</li>
                </ol>
                ${captura('14-soporte-basic', 'Support Center con el plan Basic', [
                  [4.8, 18.7, 'Plan: <strong>Basic</strong>'],
                  [5.0, 73.0, '<strong>Manage Support Plan</strong>']
                ])}
                ${captura('15-planes', 'Los cuatro planes de soporte con sus precios', [
                  [4.5, 21.7, 'Basic: gratis'],
                  [31.1, 21.1, 'Business Support+'],
                  [56.4, 21.1, 'Enterprise Support'],
                  [81.6, 20.3, 'Unified Operations'],
                  [29.2, 44.8, 'Desde 29 USD al mes']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Baja para ver qué incluye cada plan. No elijas ninguno.</li>
                </ol>
                ${captura('16-planes-detalle', 'Lo que incluye cada plan de soporte', [
                  [12.9, 33.2, 'Basic: Trusted Advisor limitado'],
                  [36.6, 42.4, 'Expertos 24/7 en menos de 30 min'],
                  [36.6, 68.5, 'Más de 500 chequeos de Trusted Advisor'],
                  [62.4, 11.5, 'Enterprise: en menos de 15 min'],
                  [59.8, 24.4, 'Un <strong>Technical Account Manager</strong>']
                ])}`,
              ver: 'La página Manage Support Plan con Basic, Business Support+, Enterprise Support y Unified Operations.',
              sandbox: true
            },
            {
              titulo: 'Organizations y Well-Architected',
              html: `
                <ol class="pasos-consola">
                  <li>Busca <kbd>Organizations</kbd> y ábrelo. Lee la portada: el sandbox no te deja administrar la organización.</li>
                </ol>
                ${captura('17-organizations', 'La portada de AWS Organizations con el aviso de permisos', [
                  [43.7, 23.1, 'Administra muchas cuentas desde un lugar'],
                  [84.8, 17.3, 'Sin permiso en el sandbox'],
                  [81.7, 77.7, 'Organizations no cuesta']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Busca <kbd>Well-Architected</kbd> y pulsa ${boton('Define workload', 'definir carga de trabajo')}.</li>
                </ol>
                ${captura('18-well-architected', 'La portada de AWS Well-Architected', [
                  [80.8, 71.2, '<strong>Define workload</strong>'],
                  [46.1, 74.3, 'La Well-Architected Tool']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Name: <kbd>tienda-tu-nombre</kbd>. Escribe una descripción corta y tu nombre en <strong>Review owner</strong>.</li>
                  <li>Elige <strong>Pre-production</strong>; en <strong>Regions</strong> marca AWS Regions y elige <strong>US East (N. Virginia)</strong>.</li>
                  <li>Baja y pulsa ${boton('Next', 'siguiente')}.</li>
                </ol>
                ${captura('19-wa-carga', 'El formulario para definir la carga de trabajo', [
                  [49.7, 29.9, 'El nombre de tu carga'],
                  [49.7, 70.5, 'Quién responde por la revisión'],
                  [4.1, 87.9, '<strong>Pre-production</strong>']
                ])}
                ${captura('20-wa-denegado', 'El aviso Forbidden al listar los lentes', [[40.0, 11.6, 'Falta <em>wellarchitected:ListLenses</em>']])}
                <p>Hasta aquí llega el sandbox. En una cuenta propia, el siguiente paso elige el <strong>lente</strong> (el conjunto de preguntas, por omisión el de los seis pilares) y la herramienta te pregunta por cada pilar.</p>
                ${recuadro('recuerda', 'No creaste nada que haya que borrar: el presupuesto y la carga de trabajo no se guardaron.')}`,
              ver: 'El aviso rojo “Forbidden” que menciona wellarchitected:ListLenses.',
              sandbox: true
            },
            {
              titulo: 'Apaga el sandbox y entrega tus evidencias',
              html: `
                <ol class="pasos-consola">
                  <li>En la barra de DataCamp pulsa <strong>Exit Session</strong> y confirma con ${boton('End Session', 'terminar sesión')}.</li>
                  <li>Revisa que la tarjeta de AWS vuelva a decir <strong>Open Sandbox</strong>.</li>
                </ol>
                ${capturaS1('24-salir', 'Aviso de DataCamp antes de terminar la sesión del sandbox', [
                  [93.1, 4.6, '<strong>Exit Session</strong>'],
                  [23.9, 92.7, '<strong>End Session</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Al pulsar <strong>Terminar laboratorio</strong>, el contador de este curso se detiene.</li>
                  <li>Abajo están tus tres capturas. Descarga tu <strong>PDF de evidencias</strong> y súbelo a Blackboard.</li>
                </ol>
                ${nubi('¡Listo! Ya sabes estimar antes de gastar, revisar en qué se fue el dinero y a quién pedir ayuda.', 'nubi-feliz')}`,
              ver: 'La tarjeta de AWS en DataCamp dice “Open Sandbox”, y el contador de este curso está detenido.',
              sandbox: false
            }
          ],
          cierre:
            'Estimaste dos servidores en la calculadora y viste que un Savings Plan casi parte el costo a la mitad; revisaste el gasto real en Cost Explorer, comprobaste que crear un presupuesto exige su propio permiso, leíste los chequeos de Trusted Advisor y comparaste los planes de soporte.'
        },
        {
          id: 's7-ex-cual-herramienta',
          tipo: 'clasificar',
          titulo: '¿Qué herramienta usarías?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Ya tocaste cada una en el laboratorio. Ahora junta cada necesidad con su herramienta.</p>',
          pregunta: 'Elige la herramienta para cada caso.',
          grupos: [
            { id: 'calculadora', nombre: 'Pricing Calculator', color: 'blue' },
            { id: 'explorer', nombre: 'Cost Explorer', color: 'green' },
            { id: 'budgets', nombre: 'AWS Budgets', color: 'yellow' },
            { id: 'advisor', nombre: 'Trusted Advisor', color: 'purple' }
          ],
          fichas: [
            { texto: 'Saber cuánto costará una app nueva antes de crearla', grupo: 'calculadora', retro: 'Estimar antes: Pricing Calculator.' },
            { texto: 'Ver qué servicio gastó más en los últimos seis meses', grupo: 'explorer', retro: 'Analizar el gasto pasado: Cost Explorer.' },
            { texto: 'Recibir un correo si el gasto del mes va a pasar de 50 dólares', grupo: 'budgets', retro: 'Alertas por límite: Budgets.' },
            { texto: 'Descubrir instancias casi sin uso y snapshots públicos por error', grupo: 'advisor', retro: 'Recomendaciones de costos y seguridad: Trusted Advisor.' },
            { texto: 'Comparar cuánto ahorra un Savings Plan contra On-Demand para un proyecto nuevo', grupo: 'calculadora', retro: 'Comparar opciones antes de comprar: Pricing Calculator.' },
            { texto: 'Pronosticar cuánto se gastará al cierre del mes, según la tendencia', grupo: 'explorer', retro: 'El pronóstico con base en lo gastado: Cost Explorer.' },
            { texto: 'Avisar al equipo cuando el uso de un Savings Plan baje del 80 %', grupo: 'budgets', retro: 'Budgets también vigila el uso de Savings Plans y reservas.' },
            { texto: 'Saber si alguna cuenta está cerca de un límite de servicio', grupo: 'advisor', retro: 'Service limits es una categoría de Trusted Advisor.' }
          ],
          cierre: 'Calculadora: antes de crear. Cost Explorer: lo que ya pasó y su tendencia. Budgets: avisos cuando te pasas. Trusted Advisor: recomendaciones de AWS sobre tu cuenta.',
          pista: '¿Es antes de gastar, después de gastar, un aviso o una recomendación?'
        },
        {
          id: 's7-ex-organizations',
          tipo: 'opcion',
          titulo: 'Una sola factura',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Una cadena de restaurantes tiene <strong>doce cuentas de AWS</strong>, una por sucursal. Finanzas quiere <strong>una sola factura</strong> y aprovechar que juntas usan mucho S3 para pagar menos por gigabyte.</p>',
          pregunta: '¿Qué le recomiendas?',
          opciones: [
            { texto: 'AWS Organizations con facturación consolidada.', correcta: true, retro: '¡Correcto! La facturación consolidada junta las cuentas en una factura y suma su uso para los descuentos por volumen.' },
            { texto: 'Un presupuesto de AWS Budgets en cada cuenta.', retro: 'Budgets avisa del gasto, pero cada cuenta seguiría con su propia factura.' },
            { texto: 'Etiquetas de asignación de costos en cada bucket.', retro: 'Las etiquetas reparten el costo, pero no juntan facturas ni suman uso entre cuentas.' },
            { texto: 'El plan Enterprise Support.', retro: 'El soporte da ayuda técnica; no consolida facturas.' }
          ],
          pista: 'Busca la palabra clave: “una sola factura”.'
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Repaso para el examen',
      descripcion: 'Lo que la certificación pregunta de costos, soporte y buenas prácticas, en una sola página, y un verdadero o falso para calentar antes del examen de práctica.',
      actividades: [
        {
          id: 's7-repaso',
          tipo: 'leccion',
          titulo: 'Lo que el examen te va a preguntar',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'La sesión 7 en una hoja',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    '<strong>Se paga</strong> cómputo, almacenamiento y datos que <strong>salen</strong>. Entrar datos no se cobra.',
                    '<strong>Ahorro</strong>: Savings Plans y reservadas (compromiso), Spot (interrumpible), volumen y right-sizing.',
                    '<strong>Free Tier</strong>: ofertas siempre gratis, créditos o meses gratis para cuentas nuevas y pruebas.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    '<strong>Pricing Calculator</strong>: estimar antes. <strong>Cost Explorer</strong>: analizar y pronosticar. <strong>Budgets</strong>: alertas.',
                    '<strong>Cost Anomaly Detection</strong>: gastos raros. <strong>Etiquetas</strong>: repartir costos. <strong>CUR</strong>: el detalle.',
                    '<strong>Organizations</strong>: OU, SCP y facturación consolidada. <strong>Control Tower</strong>: entorno multicuenta listo.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    '<strong>Soporte</strong>: Basic es gratis; más plan, respuesta más rápida; el <strong>TAM</strong> es de Enterprise.',
                    '<strong>Trusted Advisor</strong>: costos, rendimiento, seguridad, tolerancia a fallas y límites. <strong>Health</strong>: fallas de AWS que te afectan.',
                    '<strong>Well-Architected</strong>: 6 pilares. <strong>CAF</strong>: 6 perspectivas para adoptar la nube.'
                  ])}</div>
                </div>`,
              notas: 'Pide que alguien diga en voz alta la diferencia entre Cost Explorer y Budgets, y entre Trusted Advisor y Health Dashboard.'
            }
          ]
        },
        {
          id: 's7-vf',
          tipo: 'clasificar',
          titulo: '¿Verdadero o falso?',
          xp: 100,
          minutos: 3,
          contexto: '<p>Calentamiento antes del examen de práctica.</p>',
          pregunta: 'Decide si cada afirmación es verdadera o falsa.',
          grupos: [
            { id: 'v', nombre: 'Verdadero', color: 'green' },
            { id: 'f', nombre: 'Falso', color: 'red' }
          ],
          fichas: [
            { texto: 'AWS Pricing Calculator sirve para estimar costos antes de crear recursos.', grupo: 'v', retro: 'Verdadero: es pública y no crea nada.' },
            { texto: 'Cost Explorer manda alertas cuando el gasto pasa de un límite.', grupo: 'f', retro: 'Falso: las alertas son de AWS Budgets. Cost Explorer analiza.' },
            { texto: 'La facturación consolidada puede bajar el costo al sumar el uso de varias cuentas.', grupo: 'v', retro: 'Verdadero: el uso combinado alcanza descuentos por volumen.' },
            { texto: 'El plan Basic Support incluye un Technical Account Manager.', grupo: 'f', retro: 'Falso: el TAM es de Enterprise Support o superior.' },
            { texto: 'Los datos que entran a AWS desde internet no se cobran.', grupo: 'v', retro: 'Verdadero: se cobra la salida de datos, no la entrada.' },
            { texto: 'Trusted Advisor avisa cuando un servicio de AWS falla en una región.', grupo: 'f', retro: 'Falso: eso es AWS Health Dashboard. Trusted Advisor revisa tu cuenta.' },
            { texto: 'Sostenibilidad es uno de los seis pilares de Well-Architected.', grupo: 'v', retro: 'Verdadero: es el pilar más reciente.' },
            { texto: 'Crear una cuenta en AWS Organizations cuesta una cuota mensual.', grupo: 'f', retro: 'Falso: Organizations no tiene costo extra.' }
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
      hasta: 5,
      titulo: 'Arranque',
      pasos: [
        'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”, sesión 7.',
        'Pregunta rápida: ¿alguien ha recibido un recibo de luz o de celular más caro de lo esperado? En la nube pasa lo mismo si nadie vigila.'
      ],
      vigila: 'Que nadie encienda el sandbox todavía.'
    },
    {
      desde: 5,
      hasta: 40,
      titulo: 'Capítulo 1 · Antes de encender el sandbox',
      capitulo: 1,
      pasos: [
        'Proyecta las lecciones: cómo cobra AWS, herramientas de costos, soporte y Well-Architected.',
        'La línea “antes, durante y después” (calculadora, Budgets, Cost Explorer) es la más preguntada.',
        'Aclara que los planes de soporte cambiaron de nombre: enseña lo que no cambia.',
        'Los ejercicios los resuelven solos, dos o tres minutos cada uno.'
      ],
      vigila: 'Que no confundan Trusted Advisor (revisa tu cuenta) con Health Dashboard (fallas de AWS).'
    },
    {
      desde: 40,
      hasta: 92,
      titulo: 'Capítulo 2 · Laboratorio guiado',
      capitulo: 2,
      pasos: [
        'Los pasos 1 a 5 son en la calculadora pública: que nadie encienda el sandbox hasta el paso 6.',
        'En el paso 4 pide que comparen en voz alta: ¿cuánto ahorra el Savings Plan contra Bajo demanda?',
        'En el paso 8 avisa que el aviso rojo del presupuesto es esperado.',
        'Antes de terminar, revisa que su tarjeta de AWS diga “Open Sandbox”.'
      ],
      vigila: 'La parte con sandbox dura unos 15 minutos. El paso 3 (elegir t2.micro en la tabla) es donde más se atoran.'
    },
    {
      desde: 92,
      hasta: 100,
      titulo: 'Capítulo 3 · Repaso',
      capitulo: 3,
      pasos: ['Proyecta la hoja de repaso.', 'El verdadero o falso es el termómetro antes del examen.'],
      vigila: 'Cuando casi todos terminen, abre el examen de práctica de la sesión 7.'
    },
    {
      desde: 100,
      hasta: 117,
      titulo: 'Examen de práctica',
      pasos: [
        'En el panel elige la sesión 7 y abre el examen en la pestaña “Práctica final”.',
        '20 preguntas de costos, soporte y buenas prácticas, una sola entrega.',
        'Al entregar, cada alumno puede descargar su reporte en PDF.'
      ],
      vigila: 'No proyectes el panel mientras contestan: muestra nombres y calificaciones.'
    },
    {
      desde: 117,
      hasta: 120,
      titulo: 'Cierre',
      pasos: ['Cierra el examen y proyecta el repaso de las preguntas más falladas.', 'Descarga el CSV antes de apagar.', 'Anuncia la sesión 8: el simulacro completo de 65 preguntas.'],
      vigila: 'Recuérdales subir su PDF de evidencias a Blackboard.'
    }
  ]
};
