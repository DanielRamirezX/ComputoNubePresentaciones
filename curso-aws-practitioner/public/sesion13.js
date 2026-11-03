// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 13 · PRÁCTICA 5: LA UNIVERSIDAD MIGRA
//
// Quinta y última práctica integradora: el ensayo del examen final. La
// Universidad del Altiplano (San Luis Potosí) muda su portal de servicios
// escolares de un servidor en la rectoría a AWS con la estrategia «rehost».
// En el simulador AWS (evaluacion-aws, práctica practica-5, que se califica
// sola) el alumno monta en 60 minutos y sin pistas paso a paso todo lo que vio
// en la Ruta: ALB y Auto Scaling en dos zonas con los servidores en subredes
// privadas, grupos de seguridad encadenados, RDS MySQL Multi-AZ con respaldos y
// snapshot, EFS compartido, S3 con ciclo de vida a Deep Archive, una alarma con
// SNS, el rol mínimo de IAM y el presupuesto. La red, el NAT, el tema de SNS y
// el bucket ya vienen hechos.
//
// La lección agrega los temas del CLF-C02 que faltaban: migración (las 7 R,
// el CAF, Application Migration Service, DMS y SCT, Migration Hub, la familia
// Snow, DataSync, Storage Gateway y Transfer Family), híbrido y borde (Direct
// Connect, VPN, Outposts, Local Zones y Wavelength) e IA/ML (SageMaker AI,
// Rekognition, Comprehend, Polly, Lex, Transcribe, Translate, Textract,
// Kendra, Bedrock y Amazon Q), cada uno con su palabra clave para el examen.
//
// Datos revisados en la documentación oficial de AWS en noviembre de 2026:
// - Las 7 R de AWS Prescriptive Guidance: retire, retain, rehost, relocate,
//   repurchase, replatform y refactor. El CAF tiene seis perspectivas: tres de
//   negocio (Business, People, Governance) y tres técnicas (Platform,
//   Security, Operations).
// - Migration Hub y Application Discovery Service no aceptan clientes nuevos
//   desde el 7 de noviembre de 2025 (AWS recomienda AWS Transform). Snowcone
//   y Snowmobile se retiraron en 2024 y Snowball Edge solo se vende a quien ya
//   lo usaba desde noviembre de 2025. Los servidores Outposts de 1U y 2U ya no
//   se venden; los racks siguen. Amazon Kendra y Amazon Q Business no aceptan
//   clientes nuevos desde julio de 2026, y Amazon Q Developer se reemplaza por
//   Kiro (soporte hasta abril de 2027). La guía CLF-C02 v1.3 (29 de octubre
//   de 2026) ya no lista a Kendra, la familia Snow ni DataSync, y pone
//   Transfer Family y Wavelength fuera del alcance; Migration Hub, Application
//   Discovery Service, Outposts y Amazon Q sí siguen. La lección los enseña
//   porque aún salen en bancos de preguntas, y las notas del docente dicen
//   cómo están hoy y cuáles ya no entran al examen.
// - Glacier Deep Archive: recuperación estándar en hasta 12 horas y masiva en
//   hasta 48. RDS: respaldos automáticos de hasta 35 días; un snapshot manual
//   se queda hasta que lo borras.
// ---------------------------------------------------------------------------

import { icono, lista, nubi, recuadro } from './piezas.js';

/* ----------------------------------------------------- la arquitectura */

// Una caja del diagrama: título en negritas y renglones chicos debajo.
const caja = (x, y, w, h, relleno, titulo, renglones = []) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="trazo ${relleno}"/>
  <text x="${x + 12}" y="${y + 24}">${titulo}</text>
  ${renglones.map((r, i) => `<text x="${x + 12}" y="${y + 44 + i * 18}" class="etq-chica">${r}</text>`).join('')}`;

const flecha = (x1, y1, x2, y2, punteada = false) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="trazo" marker-end="url(#s13-punta)"${punteada ? ' stroke-dasharray="7 6" style="stroke-width:2"' : ''}/>`;

// Una zona o subred: rectángulo con su etiqueta chica arriba a la izquierda.
const area = (x, y, w, h, relleno, etiqueta, extra = '') => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="trazo ${relleno}" ${extra}/>
  <text x="${x + 12}" y="${y + 20}" class="etq-chica">${etiqueta}</text>`;

// El mismo diagrama sale en la lección del caso y en la práctica. En el
// celular se desplaza de lado dentro de su caja para que se pueda leer.
const ARQUITECTURA = `
  <figure class="diagrama">
    <div style="overflow-x:auto">
      <svg class="diagrama__svg" style="min-width:660px;max-height:none" viewBox="0 0 880 620" role="img" aria-labelledby="s13-arq-titulo s13-arq-desc">
        <title id="s13-arq-titulo">El portal de la Universidad del Altiplano en AWS, en dos zonas</title>
        <desc id="s13-arq-desc">Los alumnos entran desde internet por el Internet Gateway de la VPC campus-vpc al Application Load Balancer, que está en las subredes públicas de dos zonas. En una subred pública está el NAT gateway. El balanceador reparte a los servidores del portal, que viven en las subredes privadas dentro de un grupo de Auto Scaling, uno por zona, y usan el rol portal-ec2-rol. Cada servidor monta el EFS compartido por un mount target de su zona y se conecta por el puerto 3306 a la base RDS MySQL principal; en la otra zona está la copia en espera de Multi-AZ. Fuera de la VPC están el bucket S3 de las actas, que pasan a Glacier Deep Archive, la alarma de CloudWatch que vigila la CPU del grupo, el tema de SNS que manda el correo a TI y el presupuesto de AWS Budgets.</desc>
        <defs>
          <marker id="s13-punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="relleno-tinta"/></marker>
        </defs>

        ${caja(330, 12, 220, 44, 'relleno-amarillo', 'Alumnos en internet')}

        <rect x="24" y="100" width="600" height="508" rx="12" class="trazo relleno-blanco" stroke-dasharray="9 6"/>
        <text x="38" y="128">campus-vpc</text>
        <text x="146" y="128" class="etq-chica">ya existe · N. Virginia</text>
        <rect x="370" y="86" width="140" height="30" rx="8" class="trazo relleno-blanco" style="stroke-width:2"/>
        <text x="384" y="106" class="etq-chica">Internet Gateway</text>
        ${flecha(440, 56, 440, 84)}
        ${flecha(440, 116, 440, 184)}

        ${area(36, 140, 290, 460, 'relleno-blanco', 'Zona us-east-1a', 'style="stroke-width:1.5" stroke-dasharray="4 5"')}
        ${area(334, 140, 280, 460, 'relleno-blanco', 'Zona us-east-1b', 'style="stroke-width:1.5" stroke-dasharray="4 5"')}

        ${area(48, 164, 266, 112, 'relleno-verde', 'Subred pública', 'style="stroke-width:2"')}
        ${area(346, 164, 256, 112, 'relleno-verde', 'Subred pública', 'style="stroke-width:2"')}
        ${caja(90, 186, 470, 50, 'relleno-amarillo', 'Application Load Balancer · portal-alb')}
        <text x="102" y="229" class="etq-chica">campus-alb-sg: entra el 80 desde internet</text>
        <rect x="200" y="244" width="110" height="26" rx="8" class="trazo relleno-blanco" style="stroke-width:2"/>
        <text x="212" y="262" class="etq-chica">NAT gateway</text>

        ${area(48, 290, 266, 300, 'relleno-azul', 'Subred privada', 'style="stroke-width:2"')}
        ${area(346, 290, 256, 300, 'relleno-azul', 'Subred privada', 'style="stroke-width:2"')}

        <rect x="58" y="318" width="536" height="94" rx="12" class="trazo" stroke-dasharray="6 5" style="stroke-width:2"/>
        <text x="70" y="335" class="etq-chica">Auto Scaling</text>
        <text x="196" y="335" class="etq-chica">mín. 2, uno por zona</text>
        <text x="352" y="335" class="etq-chica">rol portal-ec2-rol</text>
        ${caja(70, 342, 228, 60, 'relleno-blanco', 'EC2 portal', ['portal-web-sg: 80 solo del ALB'])}
        ${caja(364, 342, 220, 60, 'relleno-blanco', 'EC2 portal', ['portal-web-sg: 80 solo del ALB'])}
        ${flecha(184, 236, 184, 340)}
        ${flecha(548, 236, 548, 340)}

        ${caja(190, 424, 108, 50, 'relleno-blanco', 'EFS', ['mount target'])}
        ${caja(476, 424, 108, 50, 'relleno-blanco', 'EFS', ['mount target'])}
        ${flecha(244, 402, 244, 422)}
        ${flecha(530, 402, 530, 422)}

        ${caja(70, 494, 228, 84, 'relleno-blanco', 'RDS MySQL · principal', ['kardex-…: Multi-AZ, cifrada', '3306 solo de los servidores'])}
        ${caja(364, 494, 220, 84, 'relleno-blanco', 'RDS · en espera', ['toma el lugar si falla', 'la principal'])}
        <line x1="298" y1="548" x2="362" y2="548" class="trazo" stroke-dasharray="7 6" style="stroke-width:2"/>
        ${flecha(110, 402, 110, 492)}
        ${flecha(400, 402, 300, 492)}
        <text x="118" y="456" class="etq-chica">3306</text>

        ${caja(648, 100, 212, 128, 'relleno-amarillo', 'S3 · actas', ['ya existe: arréglalo', 'bloqueo público: todo', 'versionado: on', '→ Deep Archive, sin borrar'])}
        ${flecha(584, 352, 646, 210, true)}
        <text x="660" y="250" class="etq-chica">el portal solo lee</text>

        ${caja(648, 262, 212, 84, 'relleno-blanco', 'CloudWatch', ['alarma: CPU promedio', 'del grupo > umbral'])}
        ${flecha(594, 380, 646, 316, true)}

        ${caja(648, 380, 212, 84, 'relleno-blanco', 'SNS · alertas-portal', ['ya existe', '→ correo de TI'])}
        ${flecha(754, 346, 754, 378, true)}

        ${caja(648, 498, 212, 70, 'relleno-blanco', 'AWS Budgets', ['mensual · aviso al 80 %'])}
      </svg>
    </div>
    <figcaption class="sutil">Línea continua: el camino de un alumno (internet → balanceador → servidor → carpeta compartida y base). Punteada: las actas, la vigilancia, el aviso y la copia de la base en la otra zona. «Ya existe» lo dejó el área de redes; lo demás lo montas tú.</figcaption>
  </figure>`;

export const SESION_13 = {
  numero: 13,
  titulo: 'Práctica 5 · La universidad migra (ensayo del final)',
  subtitulo: 'Sesión 13 · Práctica 5: la universidad migra a la nube',
  resumen:
    'Una universidad de San Luis Potosí muda a AWS el portal de inscripciones que se le cae cada semestre. Es el ensayo del examen final: en 60 minutos y sin pistas paso a paso montas en el simulador AWS todo lo que viste en la Ruta, desde el balanceador y la base Multi-AZ hasta la alarma, el rol y el presupuesto. Además repasas lo que el examen pregunta y aún no veías: las 7 R de la migración, el CAF, cómo mover los datos, Outposts, Local Zones, Wavelength y los servicios de inteligencia artificial.',
  duracion: '2 horas',
  minutosSandbox: 0,

  practica: {
    titulo: 'Examen de práctica · Sesión 13',
    corto: 'Examen de práctica',
    resumen: '20 preguntas de la migración de la universidad, la nube híbrida y la inteligencia artificial al estilo del examen de certificación, dos de respuesta múltiple, en unos 15 minutos y una sola entrega.',
    plegable: 'Ver cómo es el examen real',
    sobre: 'la migración de la universidad, la nube híbrida y los servicios de inteligencia artificial'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'El caso y lo que pide el examen',
      descripcion:
        'Por qué se cae el portal de la universidad, qué pieza de AWS resuelve cada problema y cómo administrar los 60 minutos del ensayo. Después, los temas del examen que faltaban: migrar, mover datos, nube híbrida y borde, e inteligencia artificial, con la palabra clave de cada servicio.',
      actividades: [
        {
          id: 's13-caso',
          tipo: 'leccion',
          titulo: 'El portal que se cae en inscripciones',
          xp: 50,
          minutos: 4,
          laminas: [
            {
              titulo: 'Un solo servidor para 9,000 alumnos',
              html: `
                <p class="entrada">La <strong>Universidad del Altiplano</strong>, en San Luis Potosí, tiene su portal de inscripciones y kardex en <strong>un solo servidor</strong> en un cuarto de la rectoría. La rectoría aprobó mudarlo a AWS <strong>tal cual</strong>, sin reescribirlo: la estrategia <em>rehost</em>.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Lo que pasa hoy</th><th scope="col">Por qué duele</th><th scope="col">Cómo queda en AWS</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Un servidor atiende todo y en inscripciones llega 5 veces más tráfico</th><td>Se satura y se cae justo cuando más se necesita.</td><td>Un <strong>balanceador</strong> y un grupo de <strong>Auto Scaling</strong> en dos zonas.</td></tr>
                      <tr><th scope="row">Un apagón dejó el portal tres días fuera</th><td>Todo está en un solo edificio.</td><td>Servidores y base en <strong>dos zonas de disponibilidad</strong>.</td></tr>
                      <tr><th scope="row">El kardex vive en un MySQL instalado a mano</th><td>Nadie lo parcha y los respaldos dependen de que alguien se acuerde.</td><td><strong>RDS Multi-AZ</strong> con respaldos automáticos y un snapshot antes de mudar.</td></tr>
                      <tr><th scope="row">Las constancias se guardan en el disco del servidor</th><td>Con varios servidores, cada uno vería una carpeta distinta.</td><td>Una carpeta compartida en <strong>EFS</strong>.</td></tr>
                      <tr><th scope="row">Las actas históricas, en un bucket sin bloqueo público</th><td>Cualquiera con la liga podría verlas.</td><td>Bloqueo público, versionado y ciclo de vida a <strong>Glacier Deep Archive</strong>.</td></tr>
                      <tr><th scope="row">TI se entera de las caídas por las quejas</th><td>Reaccionan tarde y nadie sabe cuánto se gasta.</td><td>Una <strong>alarma</strong> con SNS y un <strong>presupuesto</strong> en Budgets.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('sabias', 'Muchas organizaciones empiezan con <strong>rehost</strong> («lift and shift») porque es lo más rápido: primero se mudan y después modernizan con calma. Hoy haces una mezcla: el portal va tal cual a EC2, pero el MySQL pasa a RDS, que AWS administra (eso ya es <em>replatform</em>).')}`,
              notas: 'Pregunta al grupo cuál de los seis problemas les parece el más grave. Casi siempre dicen la caída en inscripciones; remarca que el apagón de tres días es igual de serio y se resuelve con las dos zonas. Para la práctica todo va en N. Virginia; en la vida real también se pensaría en la región México (Central), abierta en enero de 2025, por cercanía y por las leyes de datos.'
            },
            {
              titulo: 'La arquitectura que vas a dejar',
              html: `
                ${ARQUITECTURA}
                ${recuadro('recuerda', 'Es la arquitectura de la Práctica 1, ahora completa: <strong>alta disponibilidad</strong> (dos zonas en todo), <strong>nada privado expuesto</strong> (servidores y base en subredes privadas, grupos encadenados), <strong>datos a salvo</strong> (Multi-AZ, snapshot, versionado) y <strong>control</strong> (alarma, rol mínimo y presupuesto).')}`,
              notas: 'Recorre el diagrama siguiendo a un alumno que se inscribe: entra por el balanceador, cae en cualquiera de los dos servidores, la constancia queda en EFS y su calificación en RDS. Pregunta: si se apaga la zona 1a, ¿qué sigue funcionando? (Todo: el balanceador manda a la 1b y RDS cambia a la copia en espera.) Ojo: el NAT está en una sola zona, como lo dejó el área de redes; en producción se pondría uno por zona.'
            },
            {
              titulo: 'Así se juega el ensayo',
              html: `
                <p class="entrada">El examen final tiene una parte práctica igual a esta: <strong>60 minutos</strong>, un caso nuevo y pistas que solo dicen en qué servicio y pantalla se hace cada cosa. Hoy ensayas cómo repartir el tiempo.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Minuto</th><th scope="col">Qué conviene hacer</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">0 a 5</th><td>Lee todas las tareas y mira lo que ya existe: VPC → Subnets y EC2 → Security Groups.</td></tr>
                      <tr><th scope="row">5 a 15</th><td>Lanza la base de RDS (tarda) y, mientras, arregla las puertas y el bucket de las actas.</td></tr>
                      <tr><th scope="row">15 a 35</th><td>El rol de IAM, la launch template, el grupo de destino, el balanceador y el grupo de Auto Scaling, en ese orden.</td></tr>
                      <tr><th scope="row">35 a 50</th><td>EFS, la alarma y el presupuesto; el snapshot de la base cuando ya esté <em>Available</em>.</td></tr>
                      <tr><th scope="row">50 a 60</th><td>«Revisar mi avance», corrige lo que falte y entrega. El bono, solo si te sobra tiempo.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${nubi('Crea el <strong>rol antes que la launch template</strong>: si se lo agregas a la plantilla después, los servidores que ya estaban siguen sin él y tendrías que reemplazarlos.', 'nubi-feliz')}`,
              notas: 'Las ocho tareas valen 100 puntos y el bono suma hasta 8 extra que compensan errores, sin pasar de 100. La que más pesa es el portal (25) junto con la base (25): si alguien se atora en una tarea chica, que la deje y regrese al final.'
            }
          ]
        },
        {
          id: 's13-examen',
          tipo: 'leccion',
          titulo: 'Lo que el examen también pregunta',
          xp: 50,
          minutos: 8,
          laminas: [
            {
              titulo: 'Migrar: las 7 R',
              html: `
                <p class="entrada">Para cada aplicación se elige <strong>una</strong> estrategia. El examen te describe el plan y tú le pones nombre.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Estrategia</th><th scope="col">Qué significa</th><th scope="col">En la universidad</th><th scope="col">Palabra clave</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Retire (retirar)</th><td>Apagar lo que ya no sirve.</td><td>El sistema de encuestas que nadie abre.</td><td>“ya nadie lo usa”</td></tr>
                      <tr><th scope="row">Retain (retener)</th><td>Dejarlo donde está, por ahora.</td><td>El control de acceso atado a un aparato del laboratorio.</td><td>“todavía no se puede mover”</td></tr>
                      <tr><th scope="row">Rehost (realojar)</th><td>Moverlo tal cual a EC2: «lift and shift».</td><td>El portal de hoy.</td><td>“tal cual”, “lo más rápido”</td></tr>
                      <tr><th scope="row">Relocate (reubicar)</th><td>Mover una plataforma completa, como VMware, a su versión en AWS sin tocar sus máquinas.</td><td>Las máquinas virtuales de VMware del centro de datos.</td><td>“VMware”, “sin cambiar las VM”</td></tr>
                      <tr><th scope="row">Replatform</th><td>Moverlo con ajustes mínimos para usar algo administrado.</td><td>El MySQL del kardex a RDS.</td><td>“ajustes mínimos”</td></tr>
                      <tr><th scope="row">Repurchase (recomprar)</th><td>Cambiarlo por otro producto, casi siempre SaaS.</td><td>El correo propio por un correo en la nube.</td><td>“SaaS”, “suscripción”</td></tr>
                      <tr><th scope="row">Refactor (rediseñar)</th><td>Reescribirlo para aprovechar la nube.</td><td>La app de credenciales con Lambda y DynamoDB.</td><td>“reescribir”, “sin servidores”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', 'Los pares que se confunden: <strong>rehost</strong> (tal cual) contra <strong>replatform</strong> (con ajustes), <strong>repurchase</strong> (comprar otro) contra <strong>refactor</strong> (reescribir) y <strong>retire</strong> (apagar) contra <strong>retain</strong> (esperar).')}`,
              notas: 'Las 7 R son las de AWS Prescriptive Guidance. Refactor también aparece como «re-architect». Pide ejemplos del propio salón: ¿qué app de la escuela retirarían?'
            },
            {
              titulo: 'Planear la mudanza: el CAF y las herramientas',
              html: `
                <p class="entrada">El <strong>AWS Cloud Adoption Framework (CAF)</strong> es la guía de AWS para adoptar la nube. La ordena en <strong>seis perspectivas</strong>:</p>
                <div class="rejilla rejilla--2 roles">
                  <article class="rol">${icono('edificio')}<h3>De negocio</h3><p><strong>Business</strong>: que la nube sirva a la estrategia. <strong>People</strong>: cultura, capacitación y organización de la gente. <strong>Governance</strong>: costos, riesgos y seguimiento del programa.</p></article>
                  <article class="rol">${icono('servidor')}<h3>Técnicas</h3><p><strong>Platform</strong>: la arquitectura y la infraestructura. <strong>Security</strong>: proteger datos y accesos. <strong>Operations</strong>: que los servicios funcionen bien día con día.</p></article>
                </div>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Herramienta</th><th scope="col">Para qué</th><th scope="col">Palabra clave</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">AWS Application Migration Service</th><td>Replica tus servidores a AWS sin detenerlos, te deja probar y haces el corte en minutos.</td><td>“rehost”, “replicar servidores”</td></tr>
                      <tr><th scope="row">AWS DMS</th><td>Copia una base de datos mientras la original sigue funcionando.</td><td>“migrar la base sin detenerla”</td></tr>
                      <tr><th scope="row">AWS SCT · DMS Schema Conversion</th><td>Convierte el esquema y el código de la base cuando cambias de motor (de Oracle a PostgreSQL, por ejemplo).</td><td>“cambiar de motor”, “convertir el esquema”</td></tr>
                      <tr><th scope="row">AWS Migration Hub · Application Discovery Service</th><td>Un solo lugar para seguir el avance de la migración · inventario de lo que corre en tus servidores.</td><td>“seguimiento”, “inventario”</td></tr>
                    </tbody>
                  </table>
                </div>`,
              notas: 'Desde el 7 de noviembre de 2025, Migration Hub y Application Discovery Service ya no aceptan clientes nuevos: AWS recomienda AWS Transform, que usa IA para descubrir, planear y modernizar. Siguen en la guía del CLF-C02, así que se estudian igual. Los cuatro beneficios del CAF (menos riesgo, mejor ESG, más ingresos y más eficiencia) ya salieron en la sesión 8.'
            },
            {
              titulo: 'Mover los datos',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Si el caso dice…</th><th scope="col">Servicio</th><th scope="col">Palabra clave</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Copiar muchos TB de un servidor de archivos del campus a S3 o EFS por la red, programado y verificado</th><td><strong>AWS DataSync</strong></td><td>“copiar por la red”, “en línea”</td></tr>
                      <tr><th scope="row">Socios que mandan archivos por SFTP, FTPS, FTP o AS2 y deben llegar directo a S3 o EFS</th><td><strong>AWS Transfer Family</strong></td><td>“SFTP”</td></tr>
                      <tr><th scope="row">Servidores locales que siguen viendo una unidad de red, pero los datos se guardan en la nube</th><td><strong>AWS Storage Gateway</strong></td><td>“almacenamiento híbrido”</td></tr>
                      <tr><th scope="row">Decenas de TB con una conexión lenta, o procesar datos en un lugar sin internet</th><td><strong>Familia Snow</strong> (Snowball Edge)</td><td>“aparato físico”, “sin buena conexión”</td></tr>
                      <tr><th scope="row">Mientras migras, levantar tus servidores en AWS en minutos si tu centro de datos falla, con datos de hace segundos</th><td><strong>AWS Elastic Disaster Recovery</strong></td><td>“recuperación ante desastres”, “RPO de segundos”</td></tr>
                      <tr><th scope="row">Una base que sigue en uso mientras se muda</th><td><strong>AWS DMS</strong> (+ SCT si cambia de motor)</td><td>“sin detener la base”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('cuidado', 'En la práctica de hoy, TI ya copió las actas al bucket con <strong>DataSync</strong>. No lo confundas con <strong>Storage Gateway</strong>: DataSync <em>muda</em> los datos; Storage Gateway los deja <em>conectados</em> todos los días entre el campus y la nube.')}`,
              notas: 'La familia Snow cambió: Snowcone y Snowmobile se retiraron en 2024, y desde noviembre de 2025 Snowball Edge solo se vende a quien ya lo usaba; a los nuevos, AWS les sugiere DataSync o AWS Data Transfer Terminal (un lugar físico donde llevas tus discos). La guía CLF-C02 v1.3 ya no lista la familia Snow ni DataSync, y pone Transfer Family fuera del alcance; si aparecen en un banco viejo, «aparato físico para muchos TB con red lenta» es Snow. Elastic Disaster Recovery y Storage Gateway sí están en la guía.'
            },
            {
              titulo: 'La nube híbrida y el borde',
              html: `
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('edificio')}<h3>AWS Outposts</h3><p>Racks de AWS <strong>dentro de tu centro de datos</strong>, con los mismos servicios, API y consola. Para datos que no pueden salir del edificio o que necesitan respuesta local.</p></article>
                  <article class="rol">${icono('mapa')}<h3>Local Zones</h3><p>Una extensión de una región <strong>en una gran ciudad</strong>: cómputo y almacenamiento cerca de los usuarios, con latencia de milisegundos de un dígito.</p></article>
                  <article class="rol">${icono('red')}<h3>Wavelength</h3><p>Cómputo de AWS <strong>dentro de la red 5G</strong> de un operador de telefonía, para apps de celular que necesitan latencia ultrabaja. <em>Ojo: la guía actual del CLF-C02 lo deja fuera del examen.</em></p></article>
                </div>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Conectar el campus con AWS</th><th scope="col">Cómo es</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">AWS Site-to-Site VPN</th><td>Túnel <strong>cifrado por internet</strong> entre tu red y tu VPC. Se crea en minutos y cuesta poco.</td></tr>
                      <tr><th scope="row">AWS Client VPN</th><td>Cada persona se conecta <strong>desde su laptop</strong> a la VPC, cifrado.</td></tr>
                      <tr><th scope="row">AWS Direct Connect</th><td>Una <strong>línea privada dedicada</strong> que no pasa por internet: ancho de banda estable. Tarda semanas en instalarse.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“En mi propio edificio”</em> → <strong>Outposts</strong>. <em>“Cerca de una gran ciudad”</em> → <strong>Local Zones</strong>. <em>“5G”</em> → <strong>Wavelength</strong>. <em>“Línea dedicada, sin internet”</em> → <strong>Direct Connect</strong>. <em>“Cifrado por internet, rápido y barato”</em> → <strong>VPN</strong>.')}`,
              notas: 'Outposts ya no vende sus servidores de 1U y 2U; los racks siguen: los de segunda generación salieron en abril de 2025 y en septiembre de 2026 llegó su versión de un solo rack. Para el examen basta «AWS en tu centro de datos». Direct Connect y la VPN ya se vieron en la sesión 3; aquí solo se recuerdan. Wavelength está en la lista de servicios fuera del temario de la guía CLF-C02 v1.3: menciónalo solo como cultura general.'
            },
            {
              titulo: 'Inteligencia artificial lista para usar',
              html: `
                <p class="entrada">No tienes que saber entrenar modelos: estos servicios ya vienen entrenados. Fíjate en el <strong>verbo</strong>.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Si el caso dice…</th><th scope="col">Servicio</th><th scope="col">Su verbo</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Reconocer caras, objetos o texto en fotos y video</th><td>Amazon Rekognition</td><td>ve</td></tr>
                      <tr><th scope="row">Pasar a texto lo que se dice en un audio</th><td>Amazon Transcribe</td><td>escribe lo que oye</td></tr>
                      <tr><th scope="row">Leer un texto en voz alta</th><td>Amazon Polly</td><td>habla</td></tr>
                      <tr><th scope="row">Saber si un texto es positivo o negativo, o de qué trata</th><td>Amazon Comprehend</td><td>entiende</td></tr>
                      <tr><th scope="row">Traducir a otro idioma</th><td>Amazon Translate</td><td>traduce</td></tr>
                      <tr><th scope="row">Sacar texto, tablas y campos de documentos escaneados</th><td>Amazon Textract</td><td>lee papeles</td></tr>
                      <tr><th scope="row">Un chatbot de voz o de texto</th><td>Amazon Lex</td><td>conversa</td></tr>
                      <tr><th scope="row">Buscar respuestas dentro de los documentos de la organización</th><td>Amazon Kendra</td><td>busca</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('consejo', 'Truco: Polly es un <strong>perico</strong> que habla; Transcribe es un <strong>taquígrafo</strong> que escribe lo que oye. Textract lee <strong>papeles</strong>; Rekognition mira <strong>imágenes</strong>.')}`,
              notas: 'Amazon Kendra ya no acepta clientes nuevos desde julio de 2026 (AWS recomienda las Knowledge Bases de Bedrock), y la guía CLF-C02 v1.3 ya no lo lista; si sale en un banco viejo, es «búsqueda inteligente». Ejemplo de la universidad: Textract para las actas escaneadas, Polly y Translate para que el portal sea accesible.'
            },
            {
              titulo: 'IA generativa y modelos propios',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Qué hace</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Amazon Bedrock</th><td>Usa <strong>modelos fundacionales</strong> de Amazon y de otras empresas (Anthropic, Meta, Mistral…) con una sola API y sin administrar servidores. Los puedes personalizar con tus datos.</td><td>“IA generativa en tu aplicación”, “modelos fundacionales”</td></tr>
                      <tr><th scope="row">Amazon Q</th><td>Un <strong>asistente</strong> de IA generativa ya hecho: responde con la información de la empresa o ayuda a programar y a operar AWS.</td><td>“asistente para el trabajo”</td></tr>
                      <tr><th scope="row">Amazon SageMaker AI</th><td>Construir, entrenar y desplegar <strong>tus propios modelos</strong> de aprendizaje automático.</td><td>“entrenar mi modelo”, “científicos de datos”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', 'Ordénalos de menos a más trabajo: un servicio <strong>listo</strong> (Rekognition, Polly…) → un <strong>asistente</strong> ya hecho (Amazon Q) → un modelo ajeno dentro de <strong>tu</strong> app (Bedrock) → <strong>tu propio</strong> modelo (SageMaker AI).')}`,
              notas: 'Estado en 2026: Amazon Q Developer en el IDE se reemplaza por Kiro (sin altas nuevas desde mayo de 2026 y con soporte hasta abril de 2027), y Amazon Q Business no acepta clientes nuevos desde julio de 2026 (su sucesor es Amazon Quick). Q sigue dentro de la consola de AWS y en la guía del examen. SageMaker se llama «SageMaker AI» desde diciembre de 2024.'
            }
          ]
        },
        {
          id: 's13-ex-7r',
          tipo: 'clasificar',
          titulo: '¿Qué R le toca?',
          xp: 50,
          minutos: 3,
          contexto: '<p>La universidad hizo su inventario y ya decidió qué hará con cada sistema.</p>',
          pregunta: 'Manda cada plan a la estrategia de migración que le corresponde.',
          grupos: [
            { id: 'rehost', nombre: 'Rehost', color: 'blue' },
            { id: 'replatform', nombre: 'Replatform', color: 'green' },
            { id: 'repurchase', nombre: 'Repurchase', color: 'yellow' },
            { id: 'refactor', nombre: 'Refactor', color: 'purple' }
          ],
          fichas: [
            { texto: 'El MySQL del kardex pasa a Amazon RDS y el portal no se reescribe', grupo: 'replatform', retro: 'Un ajuste para usar algo administrado, sin cambiar la app: replatform.' },
            { texto: 'El servidor de la biblioteca digital se copia tal cual a EC2 con Application Migration Service', grupo: 'rehost', retro: 'Tal cual, sin cambios: rehost («lift and shift»).' },
            { texto: 'La app de credenciales se reescribe con AWS Lambda, API Gateway y DynamoDB', grupo: 'refactor', retro: 'Reescribir para usar servicios sin servidores: refactor.' },
            { texto: 'La bolsa de trabajo hecha en casa se cambia por una plataforma de empleo en la nube que se paga por suscripción', grupo: 'repurchase', retro: 'Cambiar por otro producto, un SaaS: repurchase.' },
            { texto: 'Las 40 máquinas virtuales del centro de cómputo se replican a EC2 sin tocar sus aplicaciones', grupo: 'rehost', retro: 'Mover servidores sin cambiar nada: rehost.' },
            { texto: 'El servidor de correo propio se apaga y se contrata un correo institucional en la nube', grupo: 'repurchase', retro: 'Comprar el servicio hecho en lugar de mantener el propio: repurchase.' },
            { texto: 'Los sitios PHP de las facultades pasan a Elastic Beanstalk con ajustes mínimos', grupo: 'replatform', retro: 'Ajustes mínimos para dejar de administrar servidores: replatform.' },
            { texto: 'El generador de constancias se rediseña en microservicios para que cada parte escale sola', grupo: 'refactor', retro: 'Cambiar la arquitectura de la app: refactor.' }
          ],
          cierre: 'Rehost: tal cual. Replatform: con ajustes para usar algo administrado. Repurchase: cambiar por un SaaS. Refactor: reescribir. Las otras tres R: retire (apagar), retain (esperar) y relocate (mover VMware completo).',
          pista: '¿Se mueve tal cual, con un ajuste, se compra otro producto o se reescribe?'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Práctica en el simulador AWS',
      descripcion:
        'El ensayo del examen final en el simulador AWS: 60 minutos para montar el portal de la universidad, con pistas que solo dicen en qué servicio se hace cada cosa. Se califica sola mientras avanzas, y después tu docente repasa en vivo lo que más costó.',
      actividades: [
        {
          id: 's13-practica',
          tipo: 'simulador',
          titulo: 'Práctica 5: la universidad migra a la nube',
          xp: 400,
          minutos: 60,
          lab: 'practica-5',
          objetivo:
            'Montar en 60 minutos, sin pistas paso a paso, el portal de la universidad en AWS: que aguante las inscripciones y la caída de una zona, que nada privado quede expuesto, que los datos estén a salvo y que TI se entere de los problemas y del gasto.',
          necesitas: [
            'Tu perfil de la Ruta: el simulador lo reconoce y le muestra tu avance a tu docente.',
            'Que tu docente abra la Práctica 5 en su panel.',
            'Una computadora o tableta: la consola en el celular es incómoda.',
            '60 minutos seguidos y lo que viste de la sesión 3 a la 7. No necesitas DataCamp ni tarjeta: todo es simulado.'
          ],
          caso: `
            <p>La <strong>Universidad del Altiplano</strong> muda su portal de servicios escolares a AWS. En tu cuenta del simulador, el área de redes ya dejó la VPC <code>campus-vpc</code> (dos subredes públicas y dos privadas en <code>us-east-1a</code> y <code>us-east-1b</code>, Internet Gateway y un NAT gateway), el DB subnet group <code>campus-db-subnets</code>, los grupos <code>campus-alb-sg</code> y <code>portal-web-sg</code> (este lo dejó el proveedor anterior: revísalo), el tema de SNS <code>alertas-portal</code> con el correo de TI confirmado y el bucket de las actas, que TI copió con AWS DataSync.</p>
            <p>Te toca montar lo demás. Es el <strong>ensayo del examen final</strong>: cada tarea pide un <strong>resultado</strong>, no clics, y su pista solo dice en qué servicio y pantalla se hace. Todo va en <strong>N. Virginia (us-east-1)</strong>. Algunos datos cambian por alumno (los días de respaldo y de archivo, el umbral de la alarma y el monto del presupuesto): el simulador te dice los tuyos en cada tarea.</p>
            ${recuadro('consejo', 'Un orden que funciona: lanza primero la base (tarda unos 30 segundos) → las puertas y el bucket mientras tanto → el rol → la launch template con el rol → grupo de destino, balanceador y Auto Scaling → EFS → la alarma → el snapshot y el presupuesto → «Revisar mi avance» y entrega.')}
            ${recuadro('recuerda', 'Las ocho tareas suman 100 puntos y el bono hasta 8 extra que compensan errores; la calificación no pasa de 100. Entrega aunque te falte algo: después puedes reintentar, pero el examen final solo tendrá una entrega.')}`,
          arquitectura: ARQUITECTURA,
          tareas: [
            '<strong>El portal aguanta las inscripciones (25 puntos).</strong> Un Application Load Balancer <em>internet-facing</em> en las dos subredes públicas que reciba HTTP (80), y un grupo de Auto Scaling con una launch template (Amazon Linux 2023, <code>t3.micro</code> o <code>t2.micro</code>, con el script de <em>User data</em> que te da la tarea) en las dos subredes privadas, sin IP pública, con al menos 2 servidores sanos, uno por zona, y <em>ELB health checks</em>.',
            '<strong>Nadie se salta al balanceador (10 puntos).</strong> A los servidores solo les llega el 80 desde <code>campus-alb-sg</code>, nadie de internet puede intentar SSH (22) y el balanceador sí recibe el 80 de cualquier lugar.',
            '<strong>El kardex en una base administrada (25 puntos).</strong> RDS MySQL <code>kardex-</code> y tu sufijo, Multi-AZ, cifrada, sin acceso público y en las subredes privadas; su grupo solo deja entrar el 3306 desde los servidores del portal, sin abrirlo a ninguna IP o red; los respaldos automáticos los días que pide tu tarea, y un snapshot manual.',
            '<strong>Una carpeta que comparten todos los servidores (10 puntos).</strong> Un EFS <em>Regional</em> y cifrado con un mount target en cada zona del portal, que todos los servidores puedan montar por NFS (2049) sin abrir ese puerto a <code>0.0.0.0/0</code>.',
            '<strong>Las actas, seguras y baratas (10 puntos).</strong> Todo el acceso público bloqueado, versionado, y que todos los objetos pasen a Glacier Deep Archive a los días que pide tu tarea, sin ninguna regla que los borre.',
            '<strong>TI se entera antes que los alumnos (10 puntos).</strong> Una alarma de CloudWatch sobre la CPU promedio de <em>todo</em> el grupo de Auto Scaling, arriba del umbral de tu tarea, que avise por el tema <code>alertas-portal</code>.',
            '<strong>Los servidores leen las actas sin llaves (5 puntos).</strong> Un rol de IAM para EC2 con <code>AmazonS3ReadOnlyAccess</code> y nada más, que usen todos los servidores del portal.',
            '<strong>Que la nube no se coma el presupuesto (5 puntos).</strong> Un presupuesto de costo mensual con el monto de tu tarea que avise por correo cuando el gasto real llegue al 80 %.',
            '<strong>Bono opcional (hasta 8 puntos):</strong> que el portal crezca solo, con una política de <em>target tracking</em> que mantenga la CPU cerca del 50 % y una capacidad máxima de 4 a 10 servidores.'
          ]
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Repaso para el examen',
      descripcion: 'La migración, la nube híbrida y la inteligencia artificial en una hoja, y un verdadero o falso para calentar antes del examen de práctica.',
      actividades: [
        {
          id: 's13-repaso',
          tipo: 'leccion',
          titulo: 'La migración en una hoja',
          xp: 50,
          minutos: 3,
          laminas: [
            {
              titulo: 'La sesión 13 en una hoja',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    '<strong>Alta disponibilidad</strong>: balanceador y Auto Scaling en dos zonas con <em>ELB health checks</em>; RDS <strong>Multi-AZ</strong> cambia sola a la copia en espera.',
                    '<strong>EFS</strong>: una carpeta que comparten muchos servidores. <strong>Deep Archive</strong>: lo más barato, pero tarda hasta 12 horas en devolver un archivo.',
                    'Un <strong>rol</strong> con lo justo, una <strong>alarma</strong> del grupo con SNS y un <strong>presupuesto</strong>; el snapshot manual se queda hasta que lo borras.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    '<strong>7 R</strong>: retire, retain, rehost (tal cual), relocate (VMware), replatform (ajustes), repurchase (SaaS) y refactor (reescribir).',
                    '<strong>CAF</strong>: Business, People y Governance (negocio); Platform, Security y Operations (técnicas).',
                    '<strong>Application Migration Service</strong>: servidores. <strong>DMS</strong> + <strong>SCT</strong>: bases. <strong>DataSync</strong>: archivos por la red. <strong>Transfer Family</strong>: SFTP. <strong>Snow</strong>: aparato físico. <strong>Elastic Disaster Recovery</strong>: levantar servidores en AWS si tu sitio cae.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    '<strong>Outposts</strong>: AWS en tu edificio. <strong>Local Zones</strong>: cerca de una gran ciudad. <strong>Wavelength</strong>: dentro del 5G.',
                    'Rekognition ve, Transcribe escribe, Polly habla, Comprehend entiende, Translate traduce, Textract lee papeles, Lex conversa, Kendra busca.',
                    '<strong>Bedrock</strong>: modelos fundacionales en tu app. <strong>Amazon Q</strong>: asistente. <strong>SageMaker AI</strong>: tu propio modelo.'
                  ])}</div>
                </div>`,
              notas: 'Pide que alguien diga en voz alta la diferencia entre rehost y replatform, y entre Outposts y Local Zones.'
            }
          ]
        },
        {
          id: 's13-vf',
          tipo: 'clasificar',
          titulo: '¿Verdadero o falso?',
          xp: 100,
          minutos: 5,
          contexto: '<p>Calentamiento antes del examen de práctica.</p>',
          pregunta: 'Decide si cada afirmación es verdadera o falsa.',
          grupos: [
            { id: 'v', nombre: 'Verdadero', color: 'green' },
            { id: 'f', nombre: 'Falso', color: 'red' }
          ],
          fichas: [
            { texto: 'Amazon SageMaker AI sirve para construir, entrenar y desplegar tus propios modelos de aprendizaje automático.', grupo: 'v', retro: 'Verdadero: es el servicio para quien hace sus propios modelos.' },
            { texto: 'AWS Outposts es una línea de red privada entre tu oficina y AWS.', grupo: 'f', retro: 'Falso: eso es Direct Connect. Outposts son racks de AWS dentro de tu centro de datos.' },
            { texto: 'Una Local Zone acerca cómputo y almacenamiento a una gran ciudad para bajar la latencia.', grupo: 'v', retro: 'Verdadero: es una extensión de una región cerca de muchos usuarios.' },
            { texto: 'En la estrategia rehost se reescribe la aplicación para usar Lambda y DynamoDB.', grupo: 'f', retro: 'Falso: eso es refactor. Rehost mueve la aplicación tal cual.' },
            { texto: 'AWS DataSync copia archivos de un servidor NFS o SMB del campus a S3 o EFS por la red.', grupo: 'v', retro: 'Verdadero: es la mudanza de archivos en línea, programada y verificada.' },
            { texto: 'Amazon Polly convierte en texto las grabaciones de voz.', grupo: 'f', retro: 'Falso: eso es Transcribe. Polly hace lo contrario: lee un texto en voz alta.' },
            { texto: 'Con RDS Multi-AZ, si falla la zona de la base principal, AWS cambia sola a la copia en espera.', grupo: 'v', retro: 'Verdadero: y el endpoint sigue siendo el mismo, así que la aplicación no cambia.' },
            { texto: 'Un archivo en S3 Glacier Deep Archive se puede leer al instante, en milisegundos.', grupo: 'f', retro: 'Falso: hay que restaurarlo y tarda hasta 12 horas (48 en la recuperación masiva).' }
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
      hasta: 15,
      titulo: 'Arranque y capítulo 1 · El caso y lo que pide el examen',
      capitulo: 1,
      pasos: [
        'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”, sesión 13. Hoy no hay sandbox de DataCamp.',
        'Proyecta “El portal que se cae en inscripciones” y la tabla de tiempos del ensayo: es lo mismo que vivirán en el final.',
        'Pasa rápido por “Lo que el examen también pregunta”: las 7 R, el CAF, mover datos, híbrido y borde, e IA. Remarca rehost contra replatform y Outposts contra Local Zones.',
        'Mientras resuelven “¿Qué R le toca?”, abre la Práctica 5 en el panel de Evaluación.'
      ],
      vigila: 'No te alargues en las tablas de servicios: el examen de práctica las vuelve a preguntar y el ensayo necesita sus 60 minutos completos.'
    },
    {
      desde: 15,
      hasta: 97,
      titulo: 'Capítulo 2 · El ensayo en el simulador',
      capitulo: 2,
      pasos: [
        'En el panel de Evaluación abre la Práctica 5 (la universidad). Que cada quien entre desde la actividad con «Abrir la práctica en el simulador».',
        'Da 5 minutos para leer el caso y todas las tareas; luego arranca el reloj de 60 minutos en voz alta.',
        'A los 15 minutos pregunta quién ya lanzó la base; a los 40, quién ya tiene el balanceador mostrando la página.',
        'Recorre el salón con el panel abierto: no des clics, solo pregunta «¿qué te pide el resultado?». En el final no habrá ayuda.',
        'A los 50 minutos avisa que revisen su avance y entreguen. En los últimos 15 minutos proyecta la tarea más fallada del panel y resuélvela en vivo en el simulador.'
      ],
      vigila: 'Que nadie use una contraseña real en el simulador. Anota las dudas que se repiten: son las que hay que repasar antes del final.'
    },
    {
      desde: 97,
      hasta: 105,
      titulo: 'Capítulo 3 · Repaso',
      capitulo: 3,
      pasos: ['Proyecta la hoja de repaso.', 'El verdadero o falso es el termómetro antes del examen.'],
      vigila: 'Cuando casi todos terminen, abre el examen de práctica de la sesión 13.'
    },
    {
      desde: 105,
      hasta: 120,
      titulo: 'Examen de práctica y cierre',
      pasos: [
        'En el panel elige la sesión 13 y abre el examen en la pestaña “Práctica final”.',
        '20 preguntas en 15 minutos; dos son de respuesta múltiple («Elige DOS»). Una sola entrega.',
        'Al final, cierra el examen, proyecta las preguntas más falladas y descarga el CSV.',
        'Cierra la Ruta: recuerda cómo será el examen final (parte teórica de casos y parte práctica de 60 minutos) y que el simulador libre sigue abierto para practicar.'
      ],
      vigila: 'No proyectes el panel mientras contestan: muestra nombres y calificaciones.'
    }
  ]
};
