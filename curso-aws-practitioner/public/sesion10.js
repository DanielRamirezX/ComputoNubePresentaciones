// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 10 · PRÁCTICA 2: LA CLÍNICA Y SUS EXPEDIENTES
//
// Segunda práctica integradora: seguridad y cumplimiento. La Clínica San
// Rafael (Querétaro) guarda expedientes clínicos en AWS y llega una auditoría.
// El alumno deja la cuenta lista en el simulador AWS (evaluacion-aws,
// laboratorio practica-2, que se califica solo): IAM con mínimo privilegio y
// MFA, una llave propia de KMS con rotación, S3 cifrado con KMS, versionado y
// ciclo de vida a Glacier, RDS cifrada y privada, la contraseña en Secrets
// Manager, un rol para EC2, un disco EBS cifrado y un trail de CloudTrail.
//
// La lección agrega los servicios de seguridad del CLF-C02 que la Ruta solo
// nombró en la sesión 2: Shield, WAF, Firewall Manager, CloudHSM, GuardDuty,
// Inspector, Macie, Config, Security Hub, Detective, Cognito, IAM Identity
// Center y Artifact, cada uno con su palabra clave para el examen.
//
// Datos revisados en la documentación oficial de AWS en noviembre de 2026:
// la rotación automática de KMS es cada 365 días por omisión (de 90 a 2560),
// el «Security Hub» original ahora se llama Security Hub CSPM y el nuevo
// Security Hub junta y correlaciona los hallazgos, y AWS Artifact también sirve
// para aceptar acuerdos como el BAA de HIPAA. La NOM-004-SSA3-2012 pide
// conservar el expediente al menos 5 años desde el último acto médico.
// ---------------------------------------------------------------------------

import { icono, lista, nubi, recuadro } from './piezas.js';

/* ----------------------------------------------------- la arquitectura */

// Una caja del diagrama: título en negritas y renglones chicos debajo.
const caja = (x, y, w, h, relleno, titulo, renglones = []) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="trazo ${relleno}"/>
  <text x="${x + 12}" y="${y + 24}">${titulo}</text>
  ${renglones.map((r, i) => `<text x="${x + 12}" y="${y + 46 + i * 19}" class="etq-chica">${r}</text>`).join('')}`;

const flecha = (x1, y1, x2, y2, punteada = false) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="trazo" marker-end="url(#s10-punta)"${punteada ? ' stroke-dasharray="7 6" style="stroke-width:2"' : ''}/>`;

// El mismo diagrama sale en la lección del caso y en la práctica. En el
// celular se desplaza de lado dentro de su caja para que se pueda leer.
const ARQUITECTURA = `
  <figure class="diagrama">
    <div style="overflow-x:auto">
      <svg class="diagrama__svg" style="min-width:660px;max-height:none" viewBox="0 0 880 510" role="img" aria-labelledby="s10-arq-titulo s10-arq-desc">
        <title id="s10-arq-titulo">La cuenta de la clínica después de la práctica</title>
        <desc id="s10-arq-desc">A la izquierda IAM, CloudTrail y Secrets Manager. En medio la VPC clinica-vpc: el servidor clinica-app y su disco EBS cifrado en las subredes públicas, y la base RDS cifrada en las subredes privadas, a la que solo llega el servidor. A la derecha el bucket de expedientes y la llave de KMS que cifra el bucket, la base, el disco y el secreto.</desc>
        <defs>
          <marker id="s10-punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="relleno-tinta"/></marker>
        </defs>
        <text x="24" y="34">Cuenta de la clínica · N. Virginia (us-east-1)</text>

        ${caja(24, 56, 214, 168, 'relleno-blanco', 'IAM', ['grupo auditoria → paola', 'luis-sistemas (admin)', 'MFA: raíz y cada persona', 'rol clinica-app-rol (EC2)', 'recepcion: eliminado', 'app-servidor: sin llaves'])}
        ${caja(24, 240, 214, 104, 'relleno-blanco', 'CloudTrail', ['trail clinica-auditoria', 'Log file validation: on', 'logs en su propio bucket'])}
        ${caja(24, 360, 214, 104, 'relleno-blanco', 'Secrets Manager', ['clinica/db-… (la contraseña)', 'cifrado con tu llave', 'rotación cada 30 días (bono)'])}

        <rect x="258" y="56" width="358" height="440" rx="12" class="trazo relleno-blanco" stroke-dasharray="9 6"/>
        <text x="272" y="80">clinica-vpc</text>
        <text x="380" y="80" class="etq-chica">tu red 10.x.0.0/16</text>

        <rect x="272" y="92" width="330" height="150" rx="10" class="trazo relleno-verde" style="stroke-width:2"/>
        <text x="284" y="114" class="etq-chica">Subredes públicas · 2 zonas</text>
        ${caja(286, 124, 180, 104, 'relleno-blanco', 'EC2 clinica-app', ['usa el rol, sin llaves', 'SG: 80 y 443 abiertos', 'SSH al mundo: cerrado'])}
        ${caja(480, 152, 112, 76, 'relleno-blanco', 'EBS', ['gp3, cifrado'])}
        <line x1="466" y1="196" x2="480" y2="196" class="trazo"/>

        <rect x="272" y="300" width="330" height="182" rx="10" class="trazo relleno-azul" style="stroke-width:2"/>
        <text x="284" y="472" class="etq-chica">Subredes privadas · 2 zonas (sin internet)</text>
        ${caja(300, 326, 274, 116, 'relleno-blanco', 'RDS clinica-db', ['cifrada · Public access: No', 'Deletion protection: on', 'SG: solo desde clinica-app-sg', 'subnet group: solo privadas'])}
        ${flecha(376, 228, 376, 324)}
        <text x="386" y="266" class="etq-chica">3306 / 5432</text>
        <text x="386" y="284" class="etq-chica">solo el servidor</text>

        ${caja(640, 56, 216, 150, 'relleno-amarillo', 'S3 · expedientes', ['bloqueo público: todo', 'SSE-KMS con tu llave', 'versionado: on', 'ciclo de vida → Glacier', 'sin borrar antes de 5 años'])}
        ${flecha(466, 138, 638, 138)}
        <text x="500" y="132" class="etq-chica">con el rol</text>

        ${caja(640, 236, 216, 104, 'relleno-amarillo', 'KMS · tu llave', ['alias expedientes-…', 'customer managed', 'rotación automática'])}
        ${flecha(748, 236, 748, 208, true)}
        ${flecha(640, 262, 594, 222, true)}
        ${flecha(640, 318, 576, 384, true)}
        <text x="640" y="370" class="etq-chica">La llave cifra el bucket, la base,</text>
        <text x="640" y="388" class="etq-chica">el disco y el secreto.</text>

        ${flecha(286, 212, 240, 410, true)}
        <text x="640" y="430" class="etq-chica">CloudTrail anota cada acción:</text>
        <text x="640" y="448" class="etq-chica">quién, qué, cuándo y desde dónde.</text>
      </svg>
    </div>
    <figcaption class="sutil">Línea continua: tráfico o acceso. Punteada: la llave cifra; el servidor pide la contraseña a Secrets Manager.</figcaption>
  </figure>`;

export const SESION_10 = {
  numero: 10,
  titulo: 'Práctica 2 · La clínica y sus expedientes',
  subtitulo: 'Sesión 10 · Práctica 2: la clínica y sus expedientes',
  resumen:
    'Una clínica de Querétaro guarda expedientes de pacientes en AWS y en un mes llega una auditoría. En el simulador AWS dejas su cuenta lista: cada quien con lo justo y con MFA, todo cifrado con una llave propia, nada privado expuesto a internet y un registro de quién hizo qué. Además repasas los servicios de seguridad que el examen pregunta: Shield, WAF, GuardDuty, Inspector, Macie, Config, Cognito, Artifact y más.',
  duracion: '2 horas',
  minutosSandbox: 0,

  practica: {
    titulo: 'Examen de práctica · Sesión 10',
    corto: 'Examen de práctica',
    resumen: '20 preguntas de seguridad y cumplimiento al estilo del examen de certificación, dos de respuesta múltiple, en unos 15 minutos y una sola entrega.',
    plegable: 'Ver cómo es el examen real',
    sobre: 'la seguridad de la clínica y los servicios de seguridad de AWS'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'El caso y lo que pide el examen',
      descripcion:
        'Qué está mal en la cuenta de la clínica, cómo queda cuando termines y quién es responsable de qué. Después, los servicios de seguridad que el examen pregunta aunque hoy no los toques, con la palabra clave para reconocer cada uno.',
      actividades: [
        {
          id: 's10-caso',
          tipo: 'leccion',
          titulo: 'La clínica y su auditoría',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'Lo que dejó el sobrino',
              html: `
                <p class="entrada">La <strong>Clínica San Rafael</strong>, en Querétaro, guarda en AWS los <strong>expedientes</strong> de sus pacientes. Lo montó el sobrino de la directora, «que sabía de compus». En un mes llega una auditoría.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Lo que hay hoy</th><th scope="col">Por qué es un riesgo</th><th scope="col">Cómo lo dejas</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Cuatro recepcionistas entran con un mismo usuario con <em>AdministratorAccess</em></th><td>Nadie sabe quién hizo qué, y un error de cualquiera puede borrar todo.</td><td>Una persona, un usuario; permisos por <strong>grupo</strong> con <strong>mínimo privilegio</strong>.</td></tr>
                      <tr><th scope="row">Nadie usa MFA, ni la raíz</th><td>Una contraseña robada basta para entrar.</td><td><strong>MFA</strong> en la raíz y en cada persona.</td></tr>
                      <tr><th scope="row">El bucket de expedientes sin bloqueo público</th><td>Un PDF de un paciente puede quedar a la vista de todo internet.</td><td>Bloqueo público, cifrado con <strong>KMS</strong>, versionado y ciclo de vida.</td></tr>
                      <tr><th scope="row">El servidor usa llaves de acceso copiadas en un archivo</th><td>Quien entre al servidor se lleva llaves que nunca caducan.</td><td>Un <strong>rol de IAM</strong>: credenciales temporales que se renuevan solas.</td></tr>
                      <tr><th scope="row">SSH abierto a <kbd>0.0.0.0/0</kbd> y la contraseña de la base en un archivo</th><td>Robots prueban contraseñas día y noche; el archivo se copia con cualquier respaldo.</td><td>Cerrar el 22 y guardar la contraseña en <strong>Secrets Manager</strong>.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('sabias', 'La ley mexicana de protección de datos personales trata los datos de salud como <strong>datos sensibles</strong>, y la <strong>NOM-004-SSA3-2012</strong> pide conservar cada expediente clínico <strong>al menos 5 años</strong> desde la última atención. Por eso hoy hay cifrado, retención y bitácora.')}`,
              notas: 'Pregunta al grupo antes de mostrar la tercera columna: ¿cuál de estos problemas arreglarían primero? (La raíz sin MFA y la cuenta compartida con AdministratorAccess: son las llaves de todo lo demás.)'
            },
            {
              titulo: 'La arquitectura que vas a dejar',
              html: `
                ${ARQUITECTURA}
                ${recuadro('recuerda', 'Es <strong>defensa en capas</strong>: si una falla, la siguiente sigue protegiendo. <strong>Identidad</strong> (IAM y MFA), <strong>red</strong> (subredes privadas y grupos de seguridad), <strong>datos</strong> (KMS, S3, RDS, EBS y Secrets Manager) y <strong>registro</strong> (CloudTrail).')}`,
              notas: 'Recorre el diagrama de izquierda a derecha: quién entra, por dónde entra el tráfico, dónde viven los datos y quién anota todo. La base no tiene flecha desde internet: esa es la idea.'
            },
            {
              titulo: '¿A quién le toca?',
              html: `
                <p class="entrada">AWS ofrece el cifrado, el MFA y los registros, pero <strong>no los activa por ti</strong>. Es el <strong>modelo de responsabilidad compartida</strong>, ahora con datos de pacientes.</p>
                <div class="rejilla rejilla--2 roles">
                  <article class="rol">${icono('nube')}<h3>Le toca a AWS</h3><p>La seguridad <strong>de</strong> la nube: los centros de datos, el hardware, la red global y el software que hace funcionar RDS, S3 o KMS.</p></article>
                  <article class="rol">${icono('edificio')}<h3>Le toca a la clínica</h3><p>La seguridad <strong>en</strong> la nube: quién entra y con qué permisos, activar el cifrado, configurar el bucket y los grupos de seguridad, y parchar el sistema operativo de su instancia EC2.</p></article>
                </div>
                ${recuadro('examen', 'Que AWS tenga certificaciones como ISO 27001 o SOC 2 <strong>no</strong> vuelve segura tu cuenta: cubre su parte. La tuya es la configuración. Los reportes de AWS se descargan en <strong>AWS Artifact</strong>.')}`,
              notas: 'Pregunta rápida: si el bucket queda público por un clic de la clínica, ¿de quién es la culpa? (De la clínica: configurar el bucket es su parte.)'
            }
          ]
        },
        {
          id: 's10-examen',
          tipo: 'leccion',
          titulo: 'Lo que el examen también pregunta',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Proteger la red y las llaves',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Qué hace</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">AWS Shield</th><td><strong>Standard</strong>: gratis y automático para todos contra los ataques DDoS más comunes. <strong>Advanced</strong>: de pago, con un equipo de respuesta de AWS 24/7 y protección contra el cobro extra que causa el ataque.</td><td>“DDoS”</td></tr>
                      <tr><th scope="row">AWS WAF</th><td>Firewall de <strong>aplicaciones web</strong>: revisa cada petición HTTP delante de CloudFront, un ALB o API Gateway. Bloquea inyección SQL, XSS, países o IP que mandan demasiadas peticiones.</td><td>“inyección SQL”, “limitar peticiones”</td></tr>
                      <tr><th scope="row">AWS Firewall Manager</th><td>Aplica <strong>las mismas reglas</strong> de WAF, Shield Advanced y grupos de seguridad en <strong>todas las cuentas</strong> de una organización, incluso en las nuevas.</td><td>“todas las cuentas”, “reglas centralizadas”</td></tr>
                      <tr><th scope="row">AWS CloudHSM</th><td>Módulos de seguridad de hardware (HSM) <strong>dedicados a ti</strong>, de un solo inquilino. Tú administras las llaves y AWS no puede usarlas. KMS, en cambio, es compartido y AWS lo administra.</td><td>“HSM dedicado”, “un solo inquilino”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', '<em>“Ataque que satura con tráfico”</em> → <strong>Shield</strong>. <em>“Ataque dentro de las peticiones web”</em> → <strong>WAF</strong>. <em>“Las mismas reglas en todas las cuentas”</em> → <strong>Firewall Manager</strong>. <em>“Llaves en hardware solo mío”</em> → <strong>CloudHSM</strong>.')}`,
              notas: 'Shield Standard ya protege a todos sin hacer nada. Para usar el equipo de respuesta de Shield Advanced (SRT) también hace falta un plan de soporte Business o superior. AWS Network Firewall (un firewall para toda la VPC) existe, pero la guía del CLF-C02 lo pone fuera del alcance del examen.'
            },
            {
              titulo: 'Detectar, revisar e investigar',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Qué hace</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Amazon GuardDuty</th><td>Detecta <strong>amenazas</strong>: analiza CloudTrail, el tráfico de la VPC y las consultas DNS sin instalar nada. Avisa de llaves usadas desde lugares raros o de minería de criptomonedas.</td><td>“actividad sospechosa”</td></tr>
                      <tr><th scope="row">Amazon Inspector</th><td>Busca <strong>vulnerabilidades de software</strong> (CVE) en instancias EC2, imágenes de contenedor y funciones Lambda, y las ordena por gravedad.</td><td>“vulnerabilidades”, “parches”</td></tr>
                      <tr><th scope="row">Amazon Macie</th><td>Encuentra <strong>datos sensibles</strong> (nombres, direcciones, tarjetas) en los buckets de <strong>S3</strong>, con aprendizaje automático.</td><td>“datos personales en S3”</td></tr>
                      <tr><th scope="row">AWS Config</th><td>Inventario e <strong>historial de configuración</strong> de tus recursos, y reglas que dicen si cumplen (por ejemplo, “todo disco EBS cifrado”).</td><td>“¿cumple mis reglas?”, “cómo estaba antes”</td></tr>
                      <tr><th scope="row">AWS Security Hub</th><td>Junta en <strong>un tablero</strong> los hallazgos de GuardDuty, Inspector, Macie y Config, y revisa tus cuentas contra estándares de buenas prácticas.</td><td>“vista central”, “estándares”</td></tr>
                      <tr><th scope="row">Amazon Detective</th><td>Ayuda a <strong>investigar</strong> un hallazgo: qué usuarios, IP y recursos se relacionan y en qué orden pasó.</td><td>“causa de raíz”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('cuidado', '<strong>GuardDuty</strong> detecta, <strong>Detective</strong> investiga. <strong>Inspector</strong> revisa el <em>software</em> de tus servidores; <strong>Macie</strong> revisa los <em>datos</em> de tus buckets. Y <strong>CloudTrail</strong> dice quién hizo qué, mientras <strong>Config</strong> dice cómo está configurado.')}`,
              notas: 'Desde 2025 el Security Hub de siempre se llama «Security Hub CSPM» (el que revisa contra estándares como CIS), y hay un Security Hub nuevo que además correlaciona hallazgos y prioriza riesgos. Para el examen basta la idea: vista central de seguridad.'
            },
            {
              titulo: 'Quién entra y qué firma AWS',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Qué hace</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Amazon Cognito</th><td>Registro e inicio de sesión para los <strong>usuarios de tu app</strong> (pacientes, clientes), con correo o con su cuenta de Google o Facebook. Pueden ser millones.</td><td>“usuarios de la app web o móvil”</td></tr>
                      <tr><th scope="row">AWS IAM Identity Center</th><td>Los <strong>empleados</strong> entran una sola vez y llegan a varias cuentas de AWS y aplicaciones. Puede usar el directorio que ya tienes, como Microsoft Entra ID.</td><td>“inicio de sesión único”, “varias cuentas”</td></tr>
                      <tr><th scope="row">Reporte de credenciales de IAM</th><td>Un archivo con <strong>todos los usuarios de IAM</strong> y el estado de sus credenciales: si tienen MFA, cuándo usaron su contraseña y qué tan viejas son sus llaves de acceso. Se descarga en IAM, gratis.</td><td>“lista de usuarios y sus credenciales”, “auditar accesos”</td></tr>
                      <tr><th scope="row">AWS Artifact</th><td>Descargas los <strong>reportes de cumplimiento de AWS</strong> (SOC, ISO, PCI) y revisas y aceptas <strong>acuerdos</strong> con AWS, como el BAA que pide la ley de salud de EE.&nbsp;UU. (HIPAA).</td><td>“reporte de cumplimiento”, “acuerdo”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${nubi('Truco: <strong>Cognito</strong> es para tus <em>clientes</em>; <strong>Identity Center</strong> es para tu <em>gente</em>; los usuarios de <strong>IAM</strong> quedan para pocos casos, como un administrador de emergencia.')}`,
              notas: 'Artifact entrega documentos de AWS: no revisa tu cuenta ni la vuelve «certificada». En la práctica de hoy, la auditora usa CloudTrail para revisar la cuenta de la clínica.'
            }
          ]
        },
        {
          id: 's10-ex-servicio',
          tipo: 'clasificar',
          titulo: '¿Quién lo detecta?',
          xp: 50,
          minutos: 3,
          contexto: '<p>La clínica activó cuatro servicios de vigilancia. Cada aviso que llega viene de uno de ellos.</p>',
          pregunta: 'Manda cada aviso al servicio que lo da.',
          grupos: [
            { id: 'guardduty', nombre: 'GuardDuty', color: 'red' },
            { id: 'inspector', nombre: 'Inspector', color: 'blue' },
            { id: 'macie', nombre: 'Macie', color: 'green' },
            { id: 'config', nombre: 'Config', color: 'purple' }
          ],
          fichas: [
            { texto: 'Las llaves de acceso de app-servidor se usaron a las 3 a. m. desde un país donde la clínica no opera', grupo: 'guardduty', retro: 'Actividad sospechosa en los registros de la cuenta: GuardDuty.' },
            { texto: 'El servidor clinica-app tiene una versión de OpenSSL con una falla publicada', grupo: 'inspector', retro: 'Software con una vulnerabilidad conocida (CVE): Inspector.' },
            { texto: 'Un bucket de respaldos tiene PDF con nombres y diagnósticos que nadie sabía que estaban ahí', grupo: 'macie', retro: 'Datos sensibles escondidos en S3: Macie.' },
            { texto: 'Un volumen EBS se creó sin cifrar y no cumple la regla de la clínica', grupo: 'config', retro: 'Una regla de cumplimiento sobre la configuración: Config.' },
            { texto: 'Una instancia empezó a hablar con servidores conocidos de minería de criptomonedas', grupo: 'guardduty', retro: 'Tráfico malicioso detectado sin instalar nada: GuardDuty.' },
            { texto: 'Una función Lambda usa una librería con una vulnerabilidad grave', grupo: 'inspector', retro: 'Inspector también revisa funciones Lambda e imágenes de contenedor.' },
            { texto: 'Hay números de tarjeta de crédito en archivos de un bucket de pagos', grupo: 'macie', retro: 'Datos financieros en S3: Macie.' },
            { texto: 'Hace una semana el grupo clinica-app-sg tenía otra regla, y hoy quieren ver cuál era', grupo: 'config', retro: 'El historial de configuración de un recurso: Config.' }
          ],
          cierre: 'GuardDuty: amenazas en la actividad. Inspector: software vulnerable. Macie: datos sensibles en S3. Config: configuración y cumplimiento. Si quieres verlos todos juntos, Security Hub.',
          pista: '¿Es una persona o programa sospechoso, software con fallas, datos personales o una configuración?'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Práctica en el simulador AWS',
      descripcion:
        'La práctica completa en el simulador AWS: entras a la cuenta de la clínica y la dejas lista para la auditoría. Se califica sola mientras avanzas y tu docente ve tu progreso.',
      actividades: [
        {
          id: 's10-practica',
          tipo: 'simulador',
          titulo: 'Práctica 2: la clínica guarda expedientes',
          xp: 400,
          minutos: 84,
          lab: 'practica-2',
          objetivo:
            'Dejar la cuenta de la clínica lista para una auditoría: cada persona con lo justo y con MFA, los datos de los pacientes cifrados con una llave propia, nada privado expuesto a internet y un registro de quién hizo qué.',
          necesitas: [
            'Tu perfil de la Ruta: el simulador lo reconoce y le muestra tu avance a tu docente.',
            'Que tu docente abra la Práctica 2 en su panel.',
            'Una computadora o tableta: la consola en el celular es incómoda.',
            'No necesitas DataCamp ni tarjeta: todo es simulado y no cuesta nada.'
          ],
          caso: `
            <p>La <strong>Clínica San Rafael</strong> tiene su portal de citas en AWS y guarda ahí los expedientes de sus pacientes. En tu cuenta del simulador ya está todo lo que dejó el sobrino: la VPC <code>clinica-vpc</code> (dos subredes públicas y dos privadas), el servidor <code>clinica-app</code> con su grupo <code>clinica-app-sg</code>, el bucket de expedientes y los usuarios <code>recepcion</code>, <code>luis-sistemas</code> y <code>app-servidor</code>.</p>
            <p>Te contrataron para dejarla lista antes de la auditoría. <strong>No borres</strong> el servidor ni el bucket: la clínica los sigue usando. Todo va en <strong>N. Virginia (us-east-1)</strong>. Algunos nombres llevan tu sufijo: el simulador te dice los tuyos en cada tarea.</p>
            ${recuadro('consejo', 'Un orden que funciona: IAM y MFA → el rol de la tarea 7 → la llave de KMS (para poder hacer al rol <em>key user</em>) → la base de RDS, que tarda unos 30 segundos, y mientras tanto el bucket → el secreto → el servidor → CloudTrail → el bono si te sobra tiempo.')}
            ${recuadro('recuerda', 'Cada tarea pide un <strong>resultado</strong>, no una lista de clics. La <strong>pista</strong> de cada tarea te dice en qué servicio y pantalla se hace. Con «Revisar mi avance» ves qué te falta.')}`,
          arquitectura: ARQUITECTURA,
          tareas: [
            '<strong>Cada quien entra con lo justo.</strong> Un grupo <code>auditoria</code> con <code>AWSCloudTrail_ReadOnlyAccess</code> (sin políticas que cambien cosas o lean los buckets), la usuaria <code>paola-auditoria</code> dentro de él, y el usuario compartido <code>recepcion</code> eliminado o sin ningún permiso.',
            '<strong>Una segunda llave para entrar.</strong> MFA en la cuenta raíz, en <code>luis-sistemas</code> y en <code>paola-auditoria</code>.',
            '<strong>La llave de la clínica.</strong> Una llave customer managed de KMS, simétrica, con el alias <code>expedientes-</code> y tu sufijo, rotación automática, <code>luis-sistemas</code> como administrador y el rol del servidor como usuario de la llave (Paola no).',
            '<strong>Los expedientes, a salvo en S3.</strong> Todo el acceso público bloqueado, cifrado por omisión SSE-KMS, versionado, y una regla de ciclo de vida que los pase a Glacier sin borrar nada antes de 5 años (1825 días).',
            '<strong>La base de citas, cifrada y privada.</strong> Una base RDS MySQL o PostgreSQL disponible, cifrada, con <em>Public access: No</em>, un subnet group con solo las subredes privadas, un grupo de seguridad que solo deje entrar a <code>clinica-app-sg</code> y <em>Deletion protection</em>.',
            '<strong>La contraseña, fuera del código.</strong> Un secreto de Secrets Manager de tipo <em>Credentials for Amazon RDS database</em>, cifrado con tu llave.',
            '<strong>El servidor, sin llaves a la vista.</strong> Un rol de IAM para EC2 con permiso de S3 puesto a <code>clinica-app</code>, las llaves de <code>app-servidor</code> desactivadas o borradas, un volumen EBS gp3 cifrado conectado al servidor y sin SSH abierto a <code>0.0.0.0/0</code>.',
            '<strong>Quién hizo qué.</strong> Un trail de CloudTrail registrando, con <em>Log file validation</em> y su propio bucket con el acceso público bloqueado.',
            '<strong>Bono opcional:</strong> la rotación automática del secreto cada 30 días o menos. Suma puntos extra, pero tu calificación no pasa de 100.'
          ]
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Repaso para el examen',
      descripcion: 'Lo que hiciste hoy y los servicios de seguridad del examen, en una hoja, y un verdadero o falso para calentar antes del examen de práctica.',
      actividades: [
        {
          id: 's10-repaso',
          tipo: 'leccion',
          titulo: 'La seguridad en una hoja',
          xp: 50,
          minutos: 3,
          laminas: [
            {
              titulo: 'La sesión 10 en una hoja',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    '<strong>Mínimo privilegio</strong> por grupos, una persona por usuario, <strong>MFA</strong> en la raíz y en todos.',
                    'Un servidor usa un <strong>rol</strong> (credenciales temporales), nunca llaves de acceso guardadas.',
                    '<strong>KMS</strong>: tu llave, con rotación automática (lo cifrado antes se sigue leyendo). <strong>Secrets Manager</strong>: contraseñas fuera del código.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    '<strong>S3</strong>: bloqueo público, SSE-KMS, versionado, ciclo de vida a Glacier; <strong>Object Lock</strong> si nadie debe poder borrar.',
                    '<strong>RDS</strong> en subredes privadas, <em>Public access: No</em> y grupo de seguridad con origen el grupo de la app. El cifrado se elige al crearla.',
                    '<strong>CloudTrail</strong>: quién hizo qué. El historial dura 90 días; un trail guarda más y <em>log file validation</em> prueba que nadie lo alteró.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    '<strong>Shield</strong>: DDoS. <strong>WAF</strong>: ataques web. <strong>Firewall Manager</strong>: reglas en todas las cuentas. <strong>CloudHSM</strong>: HSM solo tuyo.',
                    '<strong>GuardDuty</strong> detecta, <strong>Detective</strong> investiga, <strong>Inspector</strong>: software vulnerable, <strong>Macie</strong>: datos en S3, <strong>Config</strong>: cumplimiento, <strong>Security Hub</strong>: todo junto.',
                    '<strong>Cognito</strong>: usuarios de tu app. <strong>Identity Center</strong>: empleados en varias cuentas. <strong>Artifact</strong>: reportes y acuerdos de AWS.'
                  ])}</div>
                </div>`,
              notas: 'Pide que alguien explique en voz alta la diferencia entre GuardDuty e Inspector, y entre Cognito e Identity Center.'
            }
          ]
        },
        {
          id: 's10-vf',
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
            { texto: 'AWS Shield Standard protege contra los ataques DDoS más comunes sin costo extra.', grupo: 'v', retro: 'Verdadero: viene incluido para todos los clientes. Advanced es el de pago.' },
            { texto: 'Amazon Inspector busca datos personales en los buckets de S3.', grupo: 'f', retro: 'Falso: eso es Macie. Inspector busca vulnerabilidades de software.' },
            { texto: 'Un rol de IAM le da a una instancia credenciales temporales que se renuevan solas.', grupo: 'v', retro: 'Verdadero: por eso es mejor que guardar llaves de acceso en el servidor.' },
            { texto: 'Al activar la rotación automática de una llave de KMS hay que volver a cifrar los datos viejos.', grupo: 'f', retro: 'Falso: KMS guarda el material anterior y sigue descifrando lo viejo sin que hagas nada.' },
            { texto: 'En AWS Artifact puedes revisar y aceptar acuerdos con AWS, como el BAA de HIPAA.', grupo: 'v', retro: 'Verdadero: además de descargar reportes de cumplimiento, maneja acuerdos.' },
            { texto: 'Amazon Cognito sirve para que los empleados entren con un solo inicio de sesión a varias cuentas de AWS.', grupo: 'f', retro: 'Falso: eso es IAM Identity Center. Cognito es para los usuarios de tus apps.' },
            { texto: 'El cifrado de una base de Amazon RDS se elige al crearla.', grupo: 'v', retro: 'Verdadero: para cifrar una que ya existe hay que copiar un snapshot cifrado y restaurarlo.' },
            { texto: 'El Event history de CloudTrail guarda la actividad de la cuenta para siempre.', grupo: 'f', retro: 'Falso: muestra 90 días. Para guardar más se crea un trail que escribe en S3.' }
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
        'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”, sesión 10. Hoy no hay sandbox de DataCamp.',
        'Proyecta “La clínica y su auditoría”: que el grupo diga qué arreglaría primero antes de ver la tercera columna.',
        'Pasa rápido por “Lo que el examen también pregunta”: es el mapa de la sección de seguridad del examen. Remarca GuardDuty contra Inspector y Cognito contra Identity Center.',
        'Mientras resuelven “¿Quién lo detecta?”, abre la Práctica 2 en el panel de Evaluación.'
      ],
      vigila: 'No te alargues en las tablas de servicios: el examen de práctica las vuelve a preguntar y el simulador necesita su tiempo.'
    },
    {
      desde: 14,
      hasta: 98,
      titulo: 'Capítulo 2 · Práctica en el simulador',
      capitulo: 2,
      pasos: [
        'En el panel de Evaluación abre la Práctica 2 (la clínica). Que cada quien entre desde la actividad con «Abrir la práctica en el simulador».',
        'Lee el caso en voz alta y señala el orden sugerido: el rol de la tarea 7 antes de la llave de KMS.',
        'A los 30 minutos pregunta quién ya creó la base: tarda unos 30 segundos y se puede avanzar con otra tarea mientras.',
        'Recorre el salón con el panel abierto en tu equipo: muestra quién va atorado en qué tarea.',
        'Diez minutos antes del final avisa que entreguen, aunque les falte algo: después pueden reintentar.'
      ],
      vigila: 'Que nadie use una contraseña real en el simulador, y que nadie borre el servidor ni el bucket de expedientes.'
    },
    {
      desde: 98,
      hasta: 105,
      titulo: 'Capítulo 3 · Repaso',
      capitulo: 3,
      pasos: ['Proyecta la hoja de repaso.', 'El verdadero o falso es el termómetro antes del examen.'],
      vigila: 'Cuando casi todos terminen, abre el examen de práctica de la sesión 10.'
    },
    {
      desde: 105,
      hasta: 120,
      titulo: 'Examen de práctica y cierre',
      pasos: [
        'En el panel elige la sesión 10 y abre el examen en la pestaña “Práctica final”.',
        '20 preguntas de seguridad en 15 minutos; dos son de respuesta múltiple («Elige DOS»). Una sola entrega.',
        'Al final, cierra el examen, proyecta las preguntas más falladas y descarga el CSV.',
        'Anuncia la sesión 11: el festival que vende boletos sin servidores.'
      ],
      vigila: 'No proyectes el panel mientras contestan: muestra nombres y calificaciones.'
    }
  ]
};
