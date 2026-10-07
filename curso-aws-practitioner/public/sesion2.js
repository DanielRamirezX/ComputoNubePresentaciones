// ---------------------------------------------------------------------------
// RUTA AWS CLOUD PRACTITIONER · SESIÓN 2 · IDENTIDAD Y SEGURIDAD
//
// El dominio que más pesa después de tecnología: seguridad y cumplimiento
// (30 % del CLF-C02). Lecciones de IAM, políticas, responsabilidad compartida
// y el catálogo de servicios de seguridad; luego un laboratorio en el sandbox.
//
// El sandbox de DataCamp no deja usar IAM (todo sale "Access denied"), así que
// el laboratorio convierte esa limitación en la clase: el alumno lee los
// mensajes de acceso denegado y descubre la denegación implícita y la explícita
// de una SCP. Luego guarda un secreto cifrado con KMS en Secrets Manager, arma
// un grupo de seguridad con mínimo privilegio, compara con una NACL y limpia.
// Todo verificado en el sandbox el 30 de septiembre de 2026.
// ---------------------------------------------------------------------------

import { boton, capturasDe, codigo, icono, lista, nubi, recuadro } from './piezas.js';

const captura = capturasDe('s2');
const capturaS1 = capturasDe('s1');

export const SESION_2 = {
  numero: 2,
  titulo: 'Identidad y seguridad',
  subtitulo: 'Sesión 2 · Identidad y seguridad',
  resumen:
    'Quién puede entrar a tu cuenta de AWS y qué puede hacer: usuarios, grupos, roles y políticas de IAM, la responsabilidad compartida y los servicios que protegen y vigilan la nube. En el sandbox guardas un secreto cifrado, armas un firewall con mínimo privilegio y aprendes a leer un “Access denied”.',
  duracion: '2 horas',
  minutosSandbox: 30,

  practica: {
    titulo: 'Examen acumulativo · Sesión 2',
    corto: 'Examen acumulativo',
    sobre: 'la sesión 2 y las clases anteriores',
    resumen: '25 preguntas al estilo del examen de certificación: 15 de identidad y seguridad (lo de hoy) y 10 de repaso de las clases anteriores. Unos 20 minutos, una sola entrega.',
    plegable: 'Ver cómo es el examen real'
  },

  capitulos: [
    /* ================================================================ 1 */
    {
      numero: 1,
      titulo: 'Antes de encender el sandbox',
      descripcion:
        'Quién entra a una cuenta de AWS, cómo se le dan permisos, de qué se encarga AWS y de qué te encargas tú, y qué servicio de seguridad usar para cada problema. Este capítulo se hace con el sandbox apagado.',
      actividades: [
        {
          id: 's2-identidades',
          tipo: 'leccion',
          titulo: 'Quién puede entrar a tu cuenta',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Las piezas de IAM',
              html: `
                <p class="entrada"><strong>IAM</strong> (Identity and Access Management) decide <em>quién</em> entra a tu cuenta de AWS y <em>qué</em> puede hacer. Es gratis y es global: no depende de la región.</p>
                <div class="rejilla rejilla--3 roles">
                  <article class="rol">${icono('llave')}<h3>Usuario raíz</h3><p>El correo con el que se abrió la cuenta. Puede <strong>todo</strong> y nadie lo puede limitar.</p></article>
                  <article class="rol">${icono('usuario')}<h3>Usuario IAM</h3><p>Una persona o una aplicación, con su contraseña o sus llaves de acceso. Empieza sin ningún permiso.</p></article>
                  <article class="rol">${icono('edificio')}<h3>Grupo</h3><p>Un conjunto de usuarios con los mismos permisos, por ejemplo “Desarrolladores”. Un grupo no contiene otros grupos.</p></article>
                  <article class="rol">${icono('insignia')}<h3>Rol</h3><p>Permisos que alguien “se pone” por un rato, con credenciales temporales. Lo usan servicios como EC2 y personas de otras cuentas.</p></article>
                  <article class="rol">${icono('libro')}<h3>Política</h3><p>Un documento JSON que dice qué acciones se permiten o se niegan, y sobre qué recursos.</p></article>
                  <article class="rol">${icono('nube')}<h3>IAM Identity Center</h3><p>Un solo inicio de sesión (SSO) para que los empleados entren a varias cuentas de AWS.</p></article>
                </div>
                ${recuadro('recuerda', 'Las políticas se “pegan” a usuarios, grupos o roles. Así es como reciben permisos. Un usuario nuevo, sin políticas, no puede hacer nada.')}`,
              notas: 'Es la lámina base de la sesión. Si alguien pregunta por Cognito: es para los usuarios de TUS aplicaciones (los clientes de tu tienda), no para quienes administran la cuenta.'
            },
            {
              titulo: 'El usuario raíz: guárdalo bajo llave',
              html: `
                <p class="entrada">El usuario raíz es como la escritura de tu casa: la necesitas pocas veces, y si alguien te la roba se queda con todo.</p>
                <div class="carrera">
                  <div class="carrera__fila carrera__fila--propio"><span class="carrera__quien">Solo el usuario raíz puede…</span><ol><li>Cerrar la cuenta</li><li>Cambiar el plan de soporte</li><li>Cambiar el correo y los datos de la cuenta</li></ol><span class="carrera__tiempo">pocas veces al año</span></div>
                  <div class="carrera__fila carrera__fila--nube"><span class="carrera__quien">Buenas prácticas</span><ol><li>Actívale MFA</li><li>No le crees llaves de acceso</li><li>Crea un usuario administrador y usa ese diario</li></ol><span class="carrera__tiempo">desde el día uno</span></div>
                </div>
                ${recuadro('examen', 'Si una pregunta dice <em>“¿qué hacer primero con una cuenta nueva?”</em>, la respuesta es <strong>activar MFA en el usuario raíz</strong> y dejar de usarlo para el trabajo diario.')}`,
              notas: 'En el sandbox no eres el usuario raíz: eres un usuario IAM llamado datacamp-learner-user. Lo verán en el laboratorio.'
            },
            {
              titulo: 'Cómo se entra: contraseña, llaves y MFA',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Credencial</th><th scope="col">Para qué</th><th scope="col">Cuidado con</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Contraseña</th><td>Entrar a la consola web</td><td>Política de contraseñas: largo mínimo, caducidad</td></tr>
                      <tr><th scope="row">Llaves de acceso</th><td>La línea de comandos (CLI) y los programas (SDK)</td><td>Nunca subirlas a GitHub; cambiarlas seguido</td></tr>
                      <tr><th scope="row">MFA</th><td>Un segundo factor: una app en el celular, una llave física o una passkey</td><td>Actívalo, sobre todo en el usuario raíz</td></tr>
                      <tr><th scope="row">Rol</th><td>Credenciales <strong>temporales</strong> que se renuevan solas</td><td>Es la forma correcta de dar permisos a una instancia EC2</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('cuidado', 'Una aplicación en EC2 que necesita leer S3 <strong>no</strong> lleva llaves de acceso escritas en su código: se le asigna un <strong>rol</strong>. Si alguien roba el código, no se lleva credenciales.')}
                ${nubi('Mínimo privilegio: cada quien con los permisos justos para su trabajo, ni uno más.', 'nubi-pensando')}`,
              notas: 'El principio de mínimo privilegio sale en varias preguntas del examen con palabras como “least privilege” o “solo los permisos necesarios”.'
            }
          ]
        },
        {
          id: 's2-ex-identidades',
          tipo: 'clasificar',
          titulo: '¿Usuario, grupo, rol o política?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Tu empresa acaba de abrir su cuenta de AWS y te toca organizar los accesos.</p>',
          pregunta: 'Relaciona cada necesidad con la pieza de IAM que la resuelve.',
          grupos: [
            { id: 'usuario', nombre: 'Usuario', color: 'blue' },
            { id: 'grupo', nombre: 'Grupo', color: 'purple' },
            { id: 'rol', nombre: 'Rol', color: 'green' },
            { id: 'politica', nombre: 'Política', color: 'yellow' }
          ],
          fichas: [
            { texto: 'Ana entra a la consola con su propio nombre y contraseña', grupo: 'usuario', retro: 'Una persona con credenciales propias es un usuario IAM.' },
            { texto: 'Los 12 desarrolladores deben tener los mismos permisos', grupo: 'grupo', retro: 'Se da el permiso una vez al grupo y todos lo heredan.' },
            { texto: 'Una instancia EC2 necesita leer archivos de S3', grupo: 'rol', retro: 'A los servicios se les da un rol: credenciales temporales, sin llaves en el código.' },
            { texto: 'Un documento que dice “permitir s3:GetObject en este bucket”', grupo: 'politica', retro: 'Eso es una política: el JSON con efecto, acciones y recursos.' },
            { texto: 'Un auditor de otra cuenta necesita entrar por unas horas', grupo: 'rol', retro: 'Asumir un rol da acceso temporal entre cuentas, sin crearle usuario.' },
            { texto: 'Un script de respaldo usa la CLI desde un servidor de la oficina', grupo: 'usuario', retro: 'Fuera de AWS, un programa puede usar un usuario con llaves de acceso (bien guardadas).' },
            { texto: 'Cuando alguien entra al equipo de finanzas, recibe sus permisos', grupo: 'grupo', retro: 'Basta con meterlo al grupo de finanzas.' },
            { texto: 'Negar a todos el borrado de los respaldos', grupo: 'politica', retro: 'Una política con "Effect": "Deny" sobre la acción de borrar.' }
          ],
          cierre: 'Usuario: una identidad con credenciales propias. Grupo: permisos para muchos usuarios a la vez. Rol: permisos temporales que se asumen. Política: el documento que dice qué se permite o se niega.',
          pista: '¿Es alguien, un conjunto de alguienes, un permiso prestado o el documento con las reglas?'
        },
        {
          id: 's2-politicas',
          tipo: 'leccion',
          titulo: 'Las políticas y quién gana',
          xp: 50,
          minutos: 6,
          laminas: [
            {
              titulo: 'Cómo se lee una política',
              html: `
                <p class="entrada">Toda política tiene enunciados (<em>Statement</em>) con tres partes: <strong>Effect</strong> (permitir o negar), <strong>Action</strong> (qué se puede hacer) y <strong>Resource</strong> (sobre qué).</p>
                ${codigo(`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::fotos-tienda", "arn:aws:s3:::fotos-tienda/*"]
    }
  ]
}`)}
                <p>Se lee así: <em>“Se permite ver la lista y descargar los archivos del bucket fotos-tienda”</em>. Nada más: ni subir, ni borrar, ni tocar otro bucket.</p>
                ${recuadro('tecnico', 'El <strong>ARN</strong> (Amazon Resource Name) es el nombre completo y único de un recurso: <em>arn:aws:servicio:región:cuenta:recurso</em>. En el laboratorio verás muchos.')}`,
              notas: 'No hay que memorizar la sintaxis para el examen; sí entender Effect, Action y Resource.'
            },
            {
              titulo: 'Quién gana cuando las reglas chocan',
              html: `
                <p class="entrada">AWS revisa todas las políticas que aplican a una petición. El orden para decidir es siempre el mismo:</p>
                <div class="carrera">
                  <div class="carrera__fila carrera__fila--propio"><span class="carrera__quien">1. Denegación explícita</span><ol><li>Algún “Deny” menciona la acción</li></ol><span class="carrera__tiempo">siempre gana</span></div>
                  <div class="carrera__fila carrera__fila--nube"><span class="carrera__quien">2. Permiso explícito</span><ol><li>Algún “Allow” la permite</li><li>…y ningún “Deny” la niega</li></ol><span class="carrera__tiempo">se permite</span></div>
                  <div class="carrera__fila"><span class="carrera__quien">3. Denegación implícita</span><ol><li>Nadie dijo nada</li></ol><span class="carrera__tiempo">se niega</span></div>
                </div>
                ${recuadro('examen', 'Por omisión, <strong>todo está negado</strong>. Un “Allow” abre una puerta; un “Deny” la cierra aunque otra política la abra.')}`,
              notas: 'En el laboratorio verán las dos negaciones en mensajes reales: “no identity-based policy allows” (implícita) y “explicit deny in a service control policy” (explícita).'
            },
            {
              titulo: 'Las SCP: el techo de una organización',
              html: `
                <p class="entrada">Con <strong>AWS Organizations</strong> una empresa agrupa muchas cuentas. Una <strong>SCP</strong> (Service Control Policy) pone el techo de lo que se puede hacer en cada cuenta.</p>
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('edificio')}<strong>Organizations</strong><p>Varias cuentas bajo una sola facturación, en unidades organizativas (OU).</p></div>
                  <div>${icono('escudo')}<strong>SCP</strong><p>Limita lo máximo que una cuenta puede hacer. <em>No da permisos</em>: solo quita.</p></div>
                  <div>${icono('llave')}<strong>Afecta a todos</strong><p>Incluso al administrador y al usuario raíz de las cuentas miembro.</p></div>
                </div>
                ${recuadro('sabias', 'Tu sandbox de DataCamp es una cuenta dentro de una organización. Por eso hay servicios que nadie puede usar ahí, aunque tuvieras permisos de administrador: una SCP los niega.')}`,
              notas: 'Conecta con la sesión 7 (Organizations y facturación consolidada).'
            }
          ]
        },
        {
          id: 's2-ex-evaluacion',
          tipo: 'opcion',
          titulo: '¿Puede o no puede?',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Luis está en el grupo <em>Admins</em>, que tiene una política con <strong>"Allow" para todas las acciones de S3</strong>. Su cuenta está en una organización con una SCP que tiene <strong>"Deny" para s3:DeleteBucket</strong>.</p>',
          pregunta: '¿Qué pasa si Luis intenta borrar un bucket?',
          opciones: [
            { texto: 'Lo borra, porque su grupo le permite todo en S3.', retro: 'El “Allow” existe, pero una denegación explícita siempre gana.' },
            { texto: 'Lo borra, porque las SCP no aplican a los administradores.', retro: 'Las SCP limitan a todos en las cuentas miembro, administradores incluidos.' },
            { texto: 'No puede: la denegación explícita de la SCP gana sobre el permiso.', correcta: true, retro: '¡Correcto! Primero se revisan los “Deny”. Si alguno aplica, no importa cuántos “Allow” haya.' },
            { texto: 'Depende de en qué región esté el bucket.', retro: 'La evaluación de permisos no depende de la región.' }
          ],
          pista: 'Recuerda el orden: denegación explícita, permiso explícito, denegación implícita.'
        },
        {
          id: 's2-responsabilidad',
          tipo: 'leccion',
          titulo: 'Responsabilidad compartida y cumplimiento',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'De la nube y en la nube',
              html: `
                <p class="entrada">AWS se encarga de la seguridad <strong>de</strong> la nube; tú, de la seguridad <strong>en</strong> la nube. La línea se mueve según el servicio.</p>
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Quién se encarga de…</th><th scope="col">EC2 (IaaS)</th><th scope="col">RDS (base administrada)</th><th scope="col">S3 y Lambda</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Edificios, hardware y red física</th><td>AWS</td><td>AWS</td><td>AWS</td></tr>
                      <tr><th scope="row">Parches del sistema operativo</th><td><strong>Tú</strong></td><td>AWS</td><td>AWS</td></tr>
                      <tr><th scope="row">Firewall (grupos de seguridad)</th><td><strong>Tú</strong></td><td><strong>Tú</strong></td><td>No aplica</td></tr>
                      <tr><th scope="row">Quién tiene acceso (IAM)</th><td><strong>Tú</strong></td><td><strong>Tú</strong></td><td><strong>Tú</strong></td></tr>
                      <tr><th scope="row">Tus datos y si van cifrados</th><td><strong>Tú</strong></td><td><strong>Tú</strong></td><td><strong>Tú</strong></td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', 'Hay cosas que <strong>siempre</strong> son tuyas, en cualquier servicio: tus datos, quién tiene acceso y la configuración que eliges. Hay cosas que <strong>siempre</strong> son de AWS: la seguridad física y la infraestructura global.')}`,
              notas: 'Pregunta clave del examen. La “configuración compartida” incluye parches (AWS parcha la infraestructura; tú, tus sistemas operativos y aplicaciones) y la capacitación de cada lado.'
            },
            {
              titulo: 'Cumplimiento: AWS Artifact',
              html: `
                <p class="entrada">Un banco o un hospital necesita demostrar que su proveedor cumple normas como ISO 27001, SOC 2 o PCI DSS. Esos reportes se descargan, gratis, de <strong>AWS Artifact</strong>.</p>
                <div class="rejilla rejilla--3 valores">
                  <div>${icono('libro')}<strong>Artifact Reports</strong><p>Auditorías y certificaciones de AWS hechas por terceros.</p></div>
                  <div>${icono('insignia')}<strong>Artifact Agreements</strong><p>Acuerdos legales, por ejemplo el de datos de salud (BAA).</p></div>
                  <div>${icono('mapa')}<strong>Tú eliges la región</strong><p>Si la ley pide que los datos no salgan del país, guárdalos en una región de ese país.</p></div>
                </div>
                ${recuadro('recuerda', 'Que AWS cumpla una norma <strong>no</strong> hace que tu aplicación cumpla sola: tú tienes que configurarla bien.')}`,
              notas: 'Palabra clave del examen: “reportes de cumplimiento” o “auditoría de AWS” = AWS Artifact.'
            }
          ]
        },
        {
          id: 's2-ex-responsabilidad',
          tipo: 'clasificar',
          titulo: '¿De AWS o tuya?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Tu tienda en línea usa EC2, una base de datos en RDS y guarda fotos en S3.</p>',
          pregunta: 'Clasifica cada tarea según quién es responsable.',
          grupos: [
            { id: 'aws', nombre: 'AWS', color: 'yellow' },
            { id: 'cliente', nombre: 'Tú, el cliente', color: 'blue' }
          ],
          fichas: [
            { texto: 'Vigilar la entrada a los centros de datos', grupo: 'aws', retro: 'La seguridad física siempre es de AWS.' },
            { texto: 'Instalar parches en el Linux de tus instancias EC2', grupo: 'cliente', retro: 'En EC2, el sistema operativo invitado es tuyo.' },
            { texto: 'Parchar el motor de base de datos de RDS', grupo: 'aws', retro: 'RDS es administrado: AWS parcha el motor y el sistema operativo.' },
            { texto: 'Decidir quién puede borrar las fotos de S3', grupo: 'cliente', retro: 'Los permisos (IAM y políticas del bucket) siempre son tuyos.' },
            { texto: 'Reemplazar un disco duro que falló', grupo: 'aws', retro: 'El hardware es de AWS.' },
            { texto: 'Activar el cifrado de tus datos', grupo: 'cliente', retro: 'AWS te da las herramientas; activarlas y elegir llaves es tu decisión.' },
            { texto: 'Abrir solo los puertos necesarios en el grupo de seguridad', grupo: 'cliente', retro: 'La configuración del firewall de tus recursos es tuya.' },
            { texto: 'Mantener el hipervisor que separa a los clientes', grupo: 'aws', retro: 'La capa de virtualización es parte de la nube, no de lo que pones en ella.' }
          ],
          cierre: 'AWS: lo físico y lo que corre debajo de tus servicios. Tú: tus datos, tus accesos y todo lo que configuras. En servicios administrados, AWS toma más tareas (como los parches de RDS).',
          pista: '¿Lo puedes configurar desde tu consola? Entonces probablemente es tuyo.'
        },
        {
          id: 's2-servicios',
          tipo: 'leccion',
          titulo: 'Los servicios de seguridad',
          xp: 50,
          minutos: 7,
          laminas: [
            {
              titulo: 'Proteger: cifrado y secretos',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Qué hace</th><th scope="col">Palabra clave del examen</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">AWS KMS</th><td>Crea y guarda las llaves con que se cifran tus datos</td><td>“llaves de cifrado”</td></tr>
                      <tr><th scope="row">Secrets Manager</th><td>Guarda contraseñas y llaves de API, y puede <strong>rotarlas</strong> solo</td><td>“rotación automática de credenciales”</td></tr>
                      <tr><th scope="row">Parameter Store</th><td>Guarda configuración y secretos sencillos (parte de Systems Manager)</td><td>“configuración” sin rotación</td></tr>
                      <tr><th scope="row">AWS Certificate Manager</th><td>Certificados SSL/TLS gratis para HTTPS</td><td>“certificados”, “HTTPS”</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('consejo', 'Hoy en el laboratorio guardas un secreto en <strong>Secrets Manager</strong>, cifrado con una llave de <strong>KMS</strong>. Así nunca escribes una contraseña dentro de tu código.')}`,
              notas: 'Cifrado “en reposo” (guardado) y “en tránsito” (viajando por la red, con TLS): las dos frases salen en el examen.'
            },
            {
              titulo: 'Vigilar y detectar',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Servicio</th><th scope="col">Responde a la pregunta</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">AWS CloudTrail</th><td>¿<strong>Quién</strong> hizo <strong>qué</strong> y cuándo? Registra cada llamada a la API.</td></tr>
                      <tr><th scope="row">AWS Config</th><td>¿Cómo estaba configurado este recurso antes, y cumple mis reglas?</td></tr>
                      <tr><th scope="row">Amazon GuardDuty</th><td>¿Hay actividad sospechosa? Detecta amenazas analizando registros.</td></tr>
                      <tr><th scope="row">Amazon Inspector</th><td>¿Mis instancias o contenedores tienen vulnerabilidades conocidas?</td></tr>
                      <tr><th scope="row">Amazon Macie</th><td>¿Hay datos personales o sensibles en mis buckets de S3?</td></tr>
                      <tr><th scope="row">AWS Security Hub</th><td>¿Cómo voy en seguridad? Junta los hallazgos de todos en un tablero.</td></tr>
                      <tr><th scope="row">Amazon Detective</th><td>¿Qué pasó exactamente en este incidente? Ayuda a investigar.</td></tr>
                    </tbody>
                  </table>
                </div>
                ${recuadro('examen', 'Las dos más confundidas: <strong>CloudTrail</strong> = quién hizo qué (auditoría de acciones). <strong>Config</strong> = cómo está configurado y si cumple (historial de configuración).')}`,
              notas: 'Truco: Inspector inspecciona servidores; Macie busca datos personales; GuardDuty es el guardia que detecta amenazas.'
            },
            {
              titulo: 'Defender la red',
              html: `
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">Defensa</th><th scope="col">Dónde actúa</th><th scope="col">Detalle</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Grupo de seguridad</th><td>Cada instancia</td><td>Solo reglas para permitir; <em>stateful</em> (la respuesta sale sola)</td></tr>
                      <tr><th scope="row">Network ACL</th><td>Toda una subred</td><td>Reglas para permitir <strong>y negar</strong>, con número de orden; <em>stateless</em></td></tr>
                      <tr><th scope="row">AWS Shield</th><td>Contra ataques DDoS</td><td><strong>Standard</strong> es gratis y automático; <strong>Advanced</strong> es de pago, con equipo de respuesta</td></tr>
                      <tr><th scope="row">AWS WAF</th><td>Aplicaciones web</td><td>Bloquea ataques como inyección SQL o XSS</td></tr>
                      <tr><th scope="row">Firewall Manager</th><td>Toda la organización</td><td>Aplica las mismas reglas de WAF y Shield en muchas cuentas</td></tr>
                    </tbody>
                  </table>
                </div>
                ${nubi('En el laboratorio vas a crear un grupo de seguridad y luego vas a mirar una NACL de verdad: verás la regla que niega todo.', 'nubi-feliz')}`,
              notas: 'Stateful contra stateless es pregunta segura. Shield Standard viene incluido para todos los clientes sin costo.'
            }
          ]
        },
        {
          id: 's2-ex-servicios',
          tipo: 'opcion',
          titulo: '¿Qué servicio usarías?',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>El jefe de seguridad quiere saber <strong>qué usuario eliminó una instancia EC2</strong> el martes en la noche, y desde qué dirección IP lo hizo.</p>',
          pregunta: '¿Dónde lo busca?',
          opciones: [
            { texto: 'En Amazon Inspector.', retro: 'Inspector busca vulnerabilidades en instancias; no registra quién hizo qué.' },
            { texto: 'En AWS CloudTrail.', correcta: true, retro: '¡Correcto! CloudTrail registra cada llamada a la API: quién, qué, cuándo y desde dónde.' },
            { texto: 'En AWS Shield.', retro: 'Shield protege contra ataques DDoS; no lleva un registro de acciones.' },
            { texto: 'En AWS Artifact.', retro: 'Artifact entrega reportes de cumplimiento de AWS, no la actividad de tu cuenta.' }
          ],
          pista: 'Busca el servicio que responde “¿quién hizo qué?”.'
        }
      ]
    },

    /* ================================================================ 2 */
    {
      numero: 2,
      titulo: 'Laboratorio guiado en AWS',
      descripcion:
        'Enciendes el sandbox y pones la seguridad en práctica: lees mensajes reales de acceso denegado, guardas un secreto cifrado, armas un firewall que solo abre lo necesario, comparas con una NACL y dejas todo limpio. Cada paso dice dónde hacer clic y qué deberías ver.',
      actividades: [
        {
          id: 's2-lab-seguridad',
          tipo: 'laboratorio',
          titulo: 'Laboratorio: seguridad en la consola',
          xp: 300,
          minutos: 45,
          objetivo:
            'Leer los mensajes de acceso denegado de IAM, guardar una contraseña cifrada en Secrets Manager, crear un grupo de seguridad con mínimo privilegio, revisar una NACL y borrar lo que creaste.',
          necesitas: [
            'Tu sesión de DataCamp abierta (el sandbox todavía apagado).',
            'Esta guía abierta en otra pestaña o en tu celular.',
            'Unos 30 minutos de sandbox.',
            'Una forma de tomar capturas de pantalla.'
          ],
          pasos: [
            {
              titulo: 'Prepárate antes de encender',
              html: `
                <p>Todavía <strong>no</strong> enciendas el sandbox. Lee el plan del laboratorio:</p>
                <ol class="pasos-consola">
                  <li><strong>Visitar IAM</strong> y leer por qué te dice “Access denied”.</li>
                  <li><strong>Guardar un secreto</strong>: el usuario y la contraseña de una base de datos, cifrados.</li>
                  <li><strong>Crear un grupo de seguridad</strong> que deja entrar la web a todos y SSH solo a ti.</li>
                  <li><strong>Mirar una NACL</strong> y encontrar su regla que niega todo.</li>
                  <li><strong>Borrar</strong> lo que creaste y cerrar el sandbox.</li>
                </ol>
                ${recuadro('cuidado', 'Hoy vas a ver <strong>muchos mensajes rojos</strong>. No son errores tuyos: el sandbox tiene permisos limitados a propósito. Aprender a leerlos es parte de la clase.')}
                ${recuadro('consejo', 'Las imágenes son capturas reales del sandbox. Tócalas para verlas en grande: los círculos numerados marcan dónde hacer clic.')}`,
              ver: 'Tienes claro el plan y el sandbox sigue apagado.',
              sandbox: false
            },
            {
              titulo: 'Enciende el sandbox de AWS en DataCamp',
              html: `
                <ol class="pasos-consola">
                  <li>En DataCamp abre la sección <strong>Sandbox</strong> y, en la tarjeta de <strong>AWS</strong>, pulsa ${boton('Open Sandbox', 'abrir sandbox')}.</li>
                </ol>
                ${capturaS1('01-sandbox-datacamp', 'Página Sandbox de DataCamp con las tarjetas de Power BI, Tableau y AWS', [
                  [93.7, 63.1, '<strong>Open Sandbox</strong> en la tarjeta de AWS'],
                  [6.7, 87.1, 'Tus tokens y cuándo se renuevan']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Espera a que cargue el escritorio remoto con la consola de AWS en <strong>Console Home</strong>.</li>
                  <li>Revisa la región, arriba a la derecha: <strong>United States (N. Virginia)</strong>. No la cambies.</li>
                </ol>
                ${captura('01-consola-inicio', 'La consola de AWS en Console Home dentro del escritorio remoto', [
                  [49.4, 4.7, 'Tokens que te quedan'],
                  [95.8, 4.7, '<strong>Exit Session</strong>: lo usarás al final'],
                  [21.9, 27.2, 'Barra de búsqueda'],
                  [80.8, 27.2, 'Región: N. Virginia']
                ])}
                ${recuadro('cuidado', 'Deja la pestaña del sandbox <strong>al frente</strong>. Si la ocultas mucho tiempo, la sesión puede caerse y te aparece “Oops, something went wrong”: pulsa <em>Restart Session</em>.')}`,
              ver: 'La consola de AWS en Console Home, en la región N. Virginia, con tus tokens arriba.',
              problemas: [
                ['Sale “Oops, something went wrong”', 'Pulsa el botón verde Restart Session y espera unos segundos. La sesión se recupera.'],
                ['Ya tenías otra sesión abierta', 'Solo corre una a la vez: ciérrala con Exit Session y vuelve a abrir.']
              ],
              sandbox: true
            },
            {
              titulo: 'Visita IAM y lee el “Access denied”',
              html: `
                <ol class="pasos-consola">
                  <li>En la barra de búsqueda escribe <kbd>IAM</kbd> y elige <strong>IAM</strong> (Manage access to AWS resources).</li>
                </ol>
                ${captura('02-buscar-iam', 'Resultados de búsqueda de IAM en la consola', [
                  [17.1, 3.1, 'Escribe IAM'],
                  [33.6, 18.7, 'El servicio <strong>IAM</strong>']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Se abre el <strong>IAM Dashboard</strong> lleno de recuadros rojos. Lee el primero con calma.</li>
                </ol>
                ${captura('03-iam-denegado', 'IAM Dashboard con varios mensajes de Access denied', [
                  [87.0, 2.6, 'La región dice <strong>Global</strong>: IAM no depende de la región'],
                  [26.2, 31.3, '<strong>Access denied</strong> a la acción iam:GetAccountSummary'],
                  [30.3, 41.1, '<strong>User</strong>: quién lo intentó (tú: datacamp-learner-user)'],
                  [26.2, 43.8, '<strong>Action</strong>: qué se intentó'],
                  [29.3, 49.0, '<strong>Context</strong>: por qué se negó']
                ])}
                <p>Ese <em>Context</em> dice <strong>“no identity-based policy allows the action”</strong>: ninguna política le da ese permiso a tu usuario. Es la <strong>denegación implícita</strong>: lo que nadie permitió, está negado.</p>
                ${recuadro('examen', 'Fíjate que el selector de región dice <strong>Global</strong>. IAM es un servicio global: los usuarios y las políticas valen en todas las regiones.')}`,
              ver: 'El IAM Dashboard con mensajes “Access denied” y, en cada uno, User, Action y Context. Tómale captura: es tu primera evidencia.',
              evidencia: {
                id: 'iam-denegado',
                titulo: 'El “Access denied” de IAM',
                pide: 'El IAM Dashboard con al menos un mensaje “Access denied” donde se lean User, Action y Context.'
              },
              sandbox: true
            },
            {
              titulo: '¿Quién eres en esta cuenta?',
              html: `
                <ol class="pasos-consola">
                  <li>En el menú de la izquierda pulsa <strong>Policies</strong> (políticas). También sale denegado: tampoco puedes ver la lista de políticas.</li>
                </ol>
                ${captura('04-politicas-denegado', 'La página Policies con el mensaje Access denied to iam:ListPolicies', [
                  [2.8, 67.1, '<strong>Policies</strong> en el menú'],
                  [24.1, 63.2, 'Access denied a <em>iam:ListPolicies</em>'],
                  [28.9, 89.0, 'Otra vez: ninguna política lo permite']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Arriba a la derecha pulsa tu nombre de usuario, <strong>datacamp-learner-user</strong>. Se abre el menú de tu cuenta.</li>
                </ol>
                ${captura('05-identidad', 'Menú de la cuenta con IAM user: datacamp-learner-user', [
                  [58.8, 25.8, 'Hasta el nombre de la cuenta sale denegado'],
                  [65.5, 42.9, '<strong>IAM user</strong>: eres un usuario IAM, no el raíz']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Cierra el menú con la tecla <kbd>Esc</kbd>.</li>
                </ol>
                ${nubi('DataCamp aplicó el mínimo privilegio contigo: tienes justo los permisos para practicar, y nada que pueda dañar la cuenta.', 'nubi-pensando')}`,
              ver: 'El menú de tu cuenta dice “IAM user: datacamp-learner-user”.',
              sandbox: true
            },
            {
              titulo: 'Empieza a guardar un secreto',
              html: `
                <p>Imagina que tu tienda en línea necesita la contraseña de su base de datos. En lugar de escribirla en el código, la guardas cifrada en <strong>Secrets Manager</strong>.</p>
                <ol class="pasos-consola">
                  <li>En la barra de búsqueda escribe <kbd>Secrets Manager</kbd> y elige <strong>Secrets Manager</strong>.</li>
                  <li>Pulsa ${boton('Store a new secret', 'guardar un secreto nuevo')}.</li>
                </ol>
                ${captura('06-secrets-inicio', 'Página de inicio de AWS Secrets Manager', [
                  [70.0, 56.7, '<strong>Store a new secret</strong>'],
                  [69.6, 81.5, 'Precio: US$0.40 por secreto al mes']
                ])}
                ${recuadro('sabias', 'En el sandbox no pagas nada, pero fíjate en el precio: cada secreto cuesta 40 centavos de dólar al mes. Por eso al final lo borrarás.')}`,
              ver: 'La página “Choose secret type”, paso 1 de 4 del asistente.',
              sandbox: true
            },
            {
              titulo: 'El tipo de secreto y sus datos',
              html: `
                <ol class="pasos-consola">
                  <li>Arriba aparece un aviso rojo, <em>Failed to fetch a list of Amazon RDS databases</em>. Ignóralo por ahora: lo leerás en el paso 10.</li>
                  <li>En <strong>Secret type</strong> elige <strong>Other type of secret</strong> (otro tipo de secreto).</li>
                  <li>En <strong>Key/value pairs</strong> escribe la primera pareja: llave <kbd>usuario</kbd>, valor <kbd>app_tienda</kbd>.</li>
                  <li>Pulsa ${boton('+ Add row', 'agregar renglón')} y escribe la segunda: llave <kbd>contrasena</kbd>, valor <kbd>Clave-Segura-2026</kbd>.</li>
                </ol>
                ${captura('07-secreto-tipo', 'Choose secret type con Other type of secret y dos parejas de llave y valor', [
                  [73.6, 38.5, '<strong>Other type of secret</strong>'],
                  [35.0, 76.9, 'Llave: usuario'],
                  [68.6, 76.9, 'Valor: app_tienda'],
                  [35.0, 85.6, 'Segunda pareja: contrasena']
                ])}
                ${recuadro('cuidado', 'Es una contraseña inventada para la práctica. Nunca escribas una contraseña real en un laboratorio.')}`,
              ver: 'Other type of secret seleccionado y dos parejas: usuario / app_tienda y contrasena / Clave-Segura-2026.',
              problemas: [['Al pulsar Add row aparece “You must enter a key” en rojo', 'Es normal: te pide llenar el renglón nuevo. Escribe la llave y el aviso desaparece.']],
              sandbox: true
            },
            {
              titulo: 'La llave de cifrado (KMS)',
              html: `
                <ol class="pasos-consola">
                  <li>Baja hasta <strong>Encryption key</strong>. Deja la que viene: <strong>aws/secretsmanager</strong>, una llave de KMS que AWS administra por ti.</li>
                  <li>Arriba de esa sección hay otro aviso: no puedes <em>listar</em> las llaves (kms:ListAliases). No importa: <em>usarla</em> sí está permitido.</li>
                  <li>Pulsa ${boton('Next', 'siguiente')}.</li>
                </ol>
                ${captura('08-llave', 'La sección Encryption key con aws/secretsmanager', [
                  [49.8, 50.7, 'No puedes listar las llaves de KMS…'],
                  [25.1, 76.4, '…pero sí cifrar con <strong>aws/secretsmanager</strong>'],
                  [97.2, 94.5, '<strong>Next</strong>']
                ])}
                ${recuadro('examen', 'Así funciona el mínimo privilegio: un permiso por acción. Listar llaves (<em>ListAliases</em>) y cifrar con una llave son acciones distintas; puedes tener una sin la otra.')}`,
              ver: 'Encryption key: aws/secretsmanager, y el asistente avanza a “Configure secret”.',
              sandbox: true
            },
            {
              titulo: 'Nombre y permisos del secreto',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Secret name</strong> escribe <kbd>practica/tu-nombre/tienda-db</kbd> (por ejemplo, <em>practica/mariana/tienda-db</em>).</li>
                  <li>En <strong>Description</strong> escribe <kbd>Usuario y contrasena de la base de datos de la tienda</kbd>.</li>
                </ol>
                ${captura('09-nombre', 'Configure secret con el nombre y la descripción escritos', [
                  [24.7, 52.2, 'Secret name'],
                  [29.7, 77.0, 'Description']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Baja y mira <strong>Resource permissions</strong>: no la toques, pero lee qué es.</li>
                  <li>Pulsa ${boton('Next', 'siguiente')}.</li>
                </ol>
                ${captura('10-permisos-recurso', 'Las secciones Tags, Resource permissions y Replicate secret', [
                  [24.7, 67.0, '<strong>Resource permissions</strong>: una política basada en recursos'],
                  [97.2, 95.6, '<strong>Next</strong>']
                ])}
                ${recuadro('tecnico', 'Hasta ahora viste políticas pegadas a una identidad (<em>identity-based</em>). Una política <strong>basada en recursos</strong> se pega al recurso mismo, al secreto o al bucket, y dice quién puede usarlo, incluso desde otra cuenta.')}`,
              ver: 'El nombre practica/tu-nombre/tienda-db y la descripción escritos, y el asistente en “Configure rotation”.',
              sandbox: true
            },
            {
              titulo: 'Rotación, revisión y guardar',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Configure rotation</strong> deja <strong>Automatic rotation</strong> apagado. Pulsa ${boton('Next', 'siguiente')}.</li>
                </ol>
                ${captura('11-rotacion', 'Configure rotation con Automatic rotation apagado', [[19.5, 30.0, '<strong>Automatic rotation</strong>: apagado']])}
                ${recuadro('sabias', 'La rotación automática cambia la contraseña cada cierto tiempo usando una función de <strong>AWS Lambda</strong>. El sandbox no permite Lambda, pero es justo lo que distingue a Secrets Manager de Parameter Store.')}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>En <strong>Review</strong> revisa el tipo, la llave y el nombre.</li>
                  <li>Baja hasta el final y pulsa ${boton('Store', 'guardar')}.</li>
                </ol>
                ${captura('12-revisar', 'La página Review con el resumen del secreto', [
                  [22.2, 38.7, 'Encryption key: aws/secretsmanager'],
                  [23.4, 64.7, 'El nombre de tu secreto']
                ])}
                ${captura('13-guardar', 'El final de Review con el código de ejemplo y el botón Store', [[96.7, 94.5, '<strong>Store</strong>']])}`,
              ver: 'La lista Secrets con tu secreto practica/tu-nombre/tienda-db.',
              sandbox: true
            },
            {
              titulo: 'Tu secreto y los dos tipos de “no”',
              html: `
                <ol class="pasos-consola">
                  <li>En la lista <strong>Secrets</strong> aparece tu secreto. Si no, pulsa la flecha circular de refrescar.</li>
                </ol>
                ${captura('14-lista-secretos', 'La lista de secretos con practica/mariana/tienda-db', [
                  [12.3, 80.0, 'Tu secreto'],
                  [81.9, 80.0, 'Cuándo lo creaste']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Abre tu secreto con un clic en su nombre. Arriba se juntan varios avisos rojos: despliégalos con la flecha <strong>^</strong> de la barrita de contadores.</li>
                  <li>Compara el final de los dos primeros mensajes.</li>
                </ol>
                ${captura('16-negaciones', 'Varios avisos rojos de acceso denegado y el aviso verde de secreto guardado', [
                  [69.9, 9.1, '<strong>explicit deny in a service control policy</strong>'],
                  [79.9, 26.2, '<strong>because no identity-based policy allows</strong>'],
                  [21.3, 91.2, 'Tu secreto sí se guardó']
                ])}
                <div class="tabla-envoltura">
                  <table class="tabla">
                    <thead><tr><th scope="col">El mensaje dice…</th><th scope="col">Significa</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">because no identity-based policy allows</th><td><strong>Denegación implícita</strong>: nadie te dio ese permiso.</td></tr>
                      <tr><th scope="row">with an explicit deny in a service control policy</th><td><strong>Denegación explícita</strong> de una SCP de la organización: aunque te dieran el permiso, seguiría negado.</td></tr>
                    </tbody>
                  </table>
                </div>`,
              ver: 'Tu secreto en la lista y, en los avisos, un “explicit deny in a service control policy” y un “no identity-based policy allows”. Tómale captura a los avisos: es tu segunda evidencia.',
              evidencia: {
                id: 'dos-negaciones',
                titulo: 'Los dos tipos de “no”',
                pide: 'Los avisos rojos desplegados, donde se lean “explicit deny in a service control policy” y “no identity-based policy allows”.'
              },
              problemas: [['No veo los avisos rojos', 'Están plegados en una barrita con contadores (una equis y un número). Pulsa la flecha de esa barrita para desplegarlos.']],
              sandbox: true
            },
            {
              titulo: 'Intenta leer el secreto',
              html: `
                <ol class="pasos-consola">
                  <li>En la página de tu secreto, en <strong>Secret value</strong>, pulsa ${boton('Retrieve secret value', 'obtener el valor')}.</li>
                  <li>Sale <strong>Failed to get the secret value</strong>: pudiste guardarlo, pero no leerlo.</li>
                </ol>
                ${captura('15-leer-fallo', 'Detalles del secreto con el aviso Failed to get the secret value', [
                  [6.9, 26.2, 'Cifrado con aws/secretsmanager'],
                  [93.8, 77.0, 'Aquí estaba <strong>Retrieve secret value</strong>'],
                  [9.1, 91.2, '<strong>Failed to get the secret value</strong>']
                ])}
                ${recuadro('examen', 'Guardar (<em>CreateSecret</em>) y leer (<em>GetSecretValue</em>) son permisos separados. En una empresa, quien carga la contraseña no tiene por qué poder leerla: solo la aplicación que la usa. Eso es mínimo privilegio.')}`,
              ver: 'El aviso “Failed to get the secret value” en la sección Secret value.',
              sandbox: true
            },
            {
              titulo: 'CloudTrail: quién hizo qué',
              html: `
                <ol class="pasos-consola">
                  <li>En la barra de búsqueda escribe <kbd>CloudTrail</kbd> y elige <strong>CloudTrail</strong>.</li>
                  <li>En el menú izquierdo pulsa <strong>Event history</strong>. Sale <strong>AccessDeniedException</strong>: el sandbox no te deja ver el historial.</li>
                </ol>
                ${captura('17-cloudtrail-denegado', 'La página de AWS CloudTrail con el aviso AccessDeniedException', [
                  [6.9, 14.1, '<strong>AccessDeniedException</strong>'],
                  [32.4, 62.3, 'CloudTrail: registra la actividad de tu cuenta']
                ])}
                <p>Aunque no lo puedas abrir, CloudTrail <strong>sí</strong> registró lo que hiciste: que creaste un secreto y cada intento denegado, con tu usuario, la hora y la IP. Lo vería el administrador de la cuenta.</p>
                ${recuadro('recuerda', '<strong>CloudTrail</strong> responde “¿quién hizo qué, cuándo y desde dónde?”. Viene encendido en toda cuenta y guarda 90 días del historial de administración sin costo.')}`,
              ver: 'La página de CloudTrail con el aviso amarillo AccessDeniedException.',
              sandbox: true
            },
            {
              titulo: 'Crea un grupo de seguridad con mínimo privilegio',
              html: `
                <ol class="pasos-consola">
                  <li>Busca <kbd>EC2</kbd> y ábrelo. En el menú izquierdo, en <strong>Network &amp; Security</strong>, pulsa <strong>Security Groups</strong>.</li>
                  <li>Pulsa ${boton('Create security group', 'crear grupo de seguridad')}.</li>
                </ol>
                ${captura('18-security-groups', 'La lista de Security Groups con solo el grupo default', [
                  [3.9, 96.4, '<strong>Security Groups</strong>'],
                  [94.6, 8.2, '<strong>Create security group</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>En <strong>Security group name</strong> escribe <kbd>web-tu-nombre-sg</kbd>. <strong>No</strong> lo empieces con “sg-”: AWS lo rechaza.</li>
                  <li>En <strong>Description</strong> escribe <kbd>Web para todos y SSH solo desde mi IP</kbd>. Es obligatoria.</li>
                </ol>
                ${captura('19-sg-nombre-error', 'Los errores al dejar un nombre que empieza con sg- y la descripción vacía', [
                  [10.0, 49.4, '“cannot begin with sg-”: cambia el nombre'],
                  [9.0, 79.2, '“description is required”: escríbela']
                ])}`,
              ver: 'El formulario “Create security group” con tu nombre (sin “sg-” al principio) y la descripción escrita.',
              problemas: [['El nombre no cambia al escribir', 'Haz clic dentro del cuadro, selecciona todo con Ctrl+A y escribe el nombre de nuevo.']],
              sandbox: true
            },
            {
              titulo: 'Las reglas de entrada',
              html: `
                <ol class="pasos-consola">
                  <li>En <strong>Inbound rules</strong> pulsa ${boton('Add rule', 'agregar regla')}. En <strong>Type</strong> escribe <kbd>HTTP</kbd> y elígelo; en <strong>Source</strong> elige <strong>Anywhere-IPv4</strong>.</li>
                  <li>Pulsa ${boton('Add rule', 'agregar regla')} otra vez. En <strong>Type</strong> elige <strong>SSH</strong>; en <strong>Source</strong> elige <strong>My IP</strong>.</li>
                </ol>
                ${captura('20-sg-origen', 'La lista Source abierta con Custom, Anywhere-IPv4, Anywhere-IPv6 y My IP', [
                  [9.0, 49.2, 'Type: SSH, puerto 22'],
                  [46.0, 68.8, '<strong>Anywhere-IPv4</strong>: todo internet'],
                  [44.4, 87.1, '<strong>My IP</strong>: solo tu computadora']
                ])}
                ${captura('21-sg-reglas', 'El formulario con las reglas HTTP desde 0.0.0.0/0 y SSH desde una IP /32', [
                  [18.2, 21.7, 'Tu nombre, sin “sg-”'],
                  [9.0, 63.5, 'HTTP (80)…'],
                  [53.1, 68.7, '…desde 0.0.0.0/0, todo el mundo'],
                  [9.0, 73.4, 'SSH (22)…'],
                  [55.6, 78.6, '…solo desde una IP terminada en /32']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Deja <strong>Outbound rules</strong> como viene (todo el tráfico de salida). Baja y pulsa ${boton('Create security group', 'crear grupo de seguridad')}.</li>
                </ol>
                ${recuadro('sabias', '<strong>My IP</strong> pone la IP de la computadora donde corre la consola. Aquí es la del escritorio remoto de DataCamp, no la de tu casa. El <em>/32</em> significa “exactamente esta dirección, ninguna más”.')}`,
              ver: 'Dos reglas de entrada: HTTP desde 0.0.0.0/0 y SSH desde una IP que termina en /32.',
              sandbox: true
            },
            {
              titulo: 'Revisa tu grupo y compáralo con una NACL',
              html: `
                <ol class="pasos-consola">
                  <li>Aparece el aviso verde <em>was created successfully</em> y la pestaña <strong>Inbound rules</strong> con tus 2 reglas.</li>
                </ol>
                ${captura('22-sg-creado', 'El grupo de seguridad creado con sus dos reglas de entrada', [
                  [20.7, 4.5, 'Creado con éxito'],
                  [78.9, 91.5, 'HTTP abierto a todos'],
                  [81.0, 97.2, 'SSH solo para una IP'],
                  [93.1, 73.5, '<strong>Edit inbound rules</strong>: aquí se cambian']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Ahora busca <kbd>VPC</kbd> y ábrelo. En el panel, pulsa <strong>Network ACLs</strong>.</li>
                </ol>
                ${captura('23-vpc-panel', 'El VPC dashboard con sus recursos', [
                  [4.8, 75.6, 'Network ACLs en el menú, dentro de Security'],
                  [63.6, 60.9, 'O la tarjeta <strong>Network ACLs</strong>']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Marca la casilla de la única NACL y abre la pestaña <strong>Inbound rules</strong> de abajo.</li>
                </ol>
                ${captura('24-nacl-reglas', 'Las reglas de entrada de la NACL: 100 Allow y asterisco Deny', [
                  [3.9, 89.4, 'Regla <strong>100</strong>…'],
                  [3.3, 94.8, 'Regla <strong>*</strong>, la última…'],
                  [86.5, 89.4, '…permite todo'],
                  [86.5, 94.8, '…<strong>niega</strong> todo lo demás']
                ])}
                ${recuadro('examen', 'La NACL tiene reglas que <strong>niegan</strong> y se leen por número, de menor a mayor; la primera que coincide decide. Tu grupo de seguridad no tiene ni puede tener una regla “Deny”.')}`,
              ver: 'Tu grupo de seguridad con 2 reglas y, en la NACL, la regla 100 Allow y la regla * Deny. Tómale captura a tu grupo de seguridad: es tu tercera evidencia.',
              evidencia: {
                id: 'grupo-seguridad',
                titulo: 'Tu grupo de seguridad',
                pide: 'Tu grupo de seguridad recién creado, con sus dos reglas de entrada: HTTP desde 0.0.0.0/0 y SSH desde una IP /32.'
              },
              sandbox: true
            },
            {
              titulo: 'Limpia: borra el secreto y el grupo',
              html: `
                <ol class="pasos-consola">
                  <li>Vuelve a <strong>Secrets Manager</strong> y abre tu secreto. Pulsa ${boton('Actions', 'acciones')} y elige <strong>Delete secret</strong>.</li>
                </ol>
                ${captura('25-borrar-secreto-menu', 'El menú Actions del secreto con Delete secret', [
                  [95.1, 34.7, '<strong>Actions</strong>'],
                  [95.3, 72.1, '<strong>Delete secret</strong>']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>En <strong>Waiting period</strong> escribe <kbd>7</kbd> (el mínimo) y pulsa ${boton('Schedule deletion', 'programar borrado')}.</li>
                </ol>
                ${captura('26-borrar-secreto', 'La ventana Disable secret and schedule deletion', [
                  [9.7, 69.2, 'Waiting period: de 7 a 30 días'],
                  [82.8, 92.0, '<strong>Schedule deletion</strong>']
                ])}
                ${captura('27-secreto-programado', 'El secreto con el aviso This secret has been scheduled for deletion', [
                  [10.8, 22.1, 'Programado para borrarse'],
                  [93.5, 40.0, 'Todavía podrías arrepentirte: <strong>Cancel deletion</strong>'],
                  [52.7, 85.2, 'Deleted on: cuándo lo programaste']
                ])}
                <ol class="pasos-consola" start="3" style="counter-reset: paso 2">
                  <li>Vuelve a <strong>EC2 › Security Groups</strong>. Marca tu grupo, abre ${boton('Actions', 'acciones')} y elige <strong>Delete security groups</strong>.</li>
                  <li>Confirma con ${boton('Delete', 'borrar')}.</li>
                </ol>
                ${captura('28-borrar-sg-menu', 'El menú Actions de Security Groups con Delete security groups', [
                  [41.5, 42.3, 'Tu grupo marcado'],
                  [82.9, 8.2, '<strong>Actions</strong>'],
                  [85.8, 90.0, '<strong>Delete security groups</strong>']
                ])}
                ${captura('29-borrar-sg', 'La confirmación Delete security groups', [[92.4, 87.2, '<strong>Delete</strong>']])}
                ${captura('30-sg-borrado', 'El aviso verde successfully deleted', [[21.7, 11.2, '<em>successfully deleted</em>']])}
                ${recuadro('sabias', 'Secrets Manager no borra al instante: espera al menos 7 días por si te equivocaste. El grupo de seguridad, en cambio, se borra de inmediato (y nunca se puede borrar el grupo <em>default</em>).')}`,
              ver: 'El secreto “scheduled for deletion” y el aviso verde de tu grupo de seguridad “successfully deleted”.',
              problemas: [['Mi grupo sigue apareciendo en la lista', 'La lista tarda un momento en actualizarse. Pulsa la flecha circular de refrescar.']],
              sandbox: true
            },
            {
              titulo: 'Apaga el sandbox y entrega tus evidencias',
              html: `
                <ol class="pasos-consola">
                  <li>En la barra de DataCamp pulsa <strong>Exit Session</strong> y confirma con ${boton('End Session', 'terminar sesión')}.</li>
                </ol>
                ${capturaS1('24-salir', 'Aviso de DataCamp antes de terminar la sesión del sandbox', [
                  [93.1, 4.6, '<strong>Exit Session</strong>'],
                  [23.9, 92.7, '<strong>End Session</strong>']
                ])}
                <ol class="pasos-consola" start="2" style="counter-reset: paso 1">
                  <li>Al pulsar <strong>Terminar laboratorio</strong>, el contador de este curso se detiene.</li>
                  <li>Abajo están tus tres capturas. Descarga tu <strong>PDF de evidencias</strong>: ese archivo es el que subes a Blackboard.</li>
                </ol>
                ${nubi('¡Listo! Leíste permisos como un auditor, guardaste un secreto cifrado y armaste un firewall con mínimo privilegio.', 'nubi-feliz')}`,
              ver: 'La página Sandbox de DataCamp otra vez, y el contador de este curso detenido.',
              sandbox: false
            }
          ],
          cierre:
            'Leíste la denegación implícita y la explícita de una SCP, guardaste un secreto cifrado con KMS, creaste un grupo de seguridad con mínimo privilegio, lo comparaste con una NACL y limpiaste todo.'
        },
        {
          id: 's2-ex-sg-nacl',
          tipo: 'clasificar',
          titulo: '¿Grupo de seguridad o NACL?',
          xp: 50,
          minutos: 3,
          contexto: '<p>Acabas de ver los dos firewalls de AWS en la consola.</p>',
          pregunta: 'Clasifica cada característica según a cuál pertenece.',
          grupos: [
            { id: 'sg', nombre: 'Grupo de seguridad', color: 'blue' },
            { id: 'nacl', nombre: 'Network ACL', color: 'purple' }
          ],
          fichas: [
            { texto: 'Protege una instancia', grupo: 'sg', retro: 'El grupo de seguridad se asigna a cada instancia.' },
            { texto: 'Protege toda una subred', grupo: 'nacl', retro: 'La NACL se asocia a subredes.' },
            { texto: 'Solo tiene reglas para permitir', grupo: 'sg', retro: 'No existe una regla “Deny” en un grupo de seguridad.' },
            { texto: 'Tiene una regla * que niega todo', grupo: 'nacl', retro: 'La viste en el laboratorio: la regla * Deny.' },
            { texto: 'Recuerda las conexiones: la respuesta sale sola (stateful)', grupo: 'sg', retro: 'Si una petición entra, su respuesta sale sin otra regla.' },
            { texto: 'Hay que permitir la entrada y la salida por separado (stateless)', grupo: 'nacl', retro: 'La NACL no recuerda conexiones.' },
            { texto: 'Sus reglas se leen por número, de menor a mayor', grupo: 'nacl', retro: 'La primera regla que coincide decide.' },
            { texto: 'Su nombre no puede empezar con “sg-”', grupo: 'sg', retro: 'Lo comprobaste al crear el tuyo.' }
          ],
          cierre: 'Grupo de seguridad: por instancia, solo permite, stateful. NACL: por subred, permite y niega por número, stateless.',
          pista: '¿Actúa sobre una máquina o sobre una subred completa?'
        },
        {
          id: 's2-ex-negacion',
          tipo: 'opcion',
          titulo: 'Lee el mensaje',
          xp: 50,
          minutos: 2,
          contexto:
            '<p>Una compañera intenta ver las bases de datos de RDS y le sale: <em>“is not authorized to perform: rds:DescribeDBInstances … with an explicit deny in a service control policy”</em>. Su jefe le agrega una política con <strong>"Allow" para rds:*</strong>.</p>',
          pregunta: '¿Qué pasa cuando lo vuelve a intentar?',
          opciones: [
            { texto: 'Ya puede: el nuevo Allow le da el permiso.', retro: 'El Allow existe, pero la SCP niega de forma explícita, y eso siempre gana.' },
            { texto: 'Ya puede, pero solo en la región de N. Virginia.', retro: 'La región no cambia la evaluación de permisos.' },
            { texto: 'Le sale otro mensaje: “no identity-based policy allows”.', retro: 'Ese mensaje es de la denegación implícita; aquí la negación viene de la SCP.' },
            { texto: 'Sigue negado: hay que quitar o cambiar la SCP de la organización.', correcta: true, retro: '¡Correcto! Contra una denegación explícita de una SCP, ningún Allow de la cuenta sirve: se cambia desde Organizations.' }
          ],
          pista: '¿Qué dice el mensaje: que nadie lo permitió, o que alguien lo negó?'
        }
      ]
    },

    /* ================================================================ 3 */
    {
      numero: 3,
      titulo: 'Repaso para el examen',
      descripcion: 'Lo que la certificación pregunta de seguridad, en una sola página, y un verdadero o falso para calentar antes del examen acumulativo.',
      actividades: [
        {
          id: 's2-repaso',
          tipo: 'leccion',
          titulo: 'Lo que el examen te va a preguntar',
          xp: 50,
          minutos: 5,
          laminas: [
            {
              titulo: 'La sesión 2 en una hoja',
              html: `
                <div class="repaso">
                  <div class="repaso__capitulo"><span class="repaso__numero">1</span>${lista([
                    '<strong>Usuario raíz</strong>: MFA y no usarlo a diario. <strong>Usuario</strong>: una identidad. <strong>Grupo</strong>: permisos para muchos. <strong>Rol</strong>: credenciales temporales (EC2, otras cuentas).',
                    '<strong>Política</strong>: Effect, Action, Resource. Denegación explícita &gt; permiso &gt; denegación implícita. <strong>SCP</strong>: el techo de una cuenta.',
                    '<strong>Mínimo privilegio</strong>: solo los permisos necesarios.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">2</span>${lista([
                    '<strong>De la nube</strong> (AWS): lo físico. <strong>En la nube</strong> (tú): datos, accesos y configuración. <strong>Artifact</strong>: reportes de cumplimiento.',
                    '<strong>KMS</strong>: llaves. <strong>Secrets Manager</strong>: secretos con rotación. <strong>CloudTrail</strong>: quién hizo qué. <strong>Config</strong>: configuración.',
                    '<strong>GuardDuty</strong>: amenazas. <strong>Inspector</strong>: vulnerabilidades. <strong>Macie</strong>: datos sensibles en S3.'
                  ])}</div>
                  <div class="repaso__capitulo"><span class="repaso__numero">3</span>${lista([
                    '<strong>Grupo de seguridad</strong>: instancia, solo permite, stateful. <strong>NACL</strong>: subred, permite y niega, stateless.',
                    '<strong>Shield Standard</strong>: DDoS, gratis. <strong>Shield Advanced</strong>: de pago. <strong>WAF</strong>: inyección SQL y XSS.',
                    '<strong>IAM Identity Center</strong>: un solo inicio de sesión para varias cuentas.'
                  ])}</div>
                </div>`,
              notas: 'Pide que alguien explique en voz alta la diferencia entre CloudTrail y Config antes de abrir el examen.'
            }
          ]
        },
        {
          id: 's2-vf',
          tipo: 'clasificar',
          titulo: '¿Verdadero o falso?',
          xp: 100,
          minutos: 3,
          contexto: '<p>Calentamiento antes del examen acumulativo.</p>',
          pregunta: 'Decide si cada afirmación es verdadera o falsa.',
          grupos: [
            { id: 'v', nombre: 'Verdadero', color: 'green' },
            { id: 'f', nombre: 'Falso', color: 'red' }
          ],
          fichas: [
            { texto: 'IAM es un servicio global, no de una región.', grupo: 'v', retro: 'Verdadero: en la consola de IAM la región dice Global.' },
            { texto: 'Un usuario IAM nuevo puede usar todos los servicios hasta que se le quiten permisos.', grupo: 'f', retro: 'Falso: empieza sin permisos; todo está negado por omisión.' },
            { texto: 'Una denegación explícita gana aunque otra política lo permita.', grupo: 'v', retro: 'Verdadero: el Deny siempre gana.' },
            { texto: 'Para que una instancia EC2 lea S3, lo correcto es asignarle un rol.', grupo: 'v', retro: 'Verdadero: credenciales temporales, sin llaves en el código.' },
            { texto: 'AWS Shield Standard tiene un costo mensual.', grupo: 'f', retro: 'Falso: viene incluido y gratis para todos.' },
            { texto: 'CloudTrail detecta vulnerabilidades en tus instancias.', grupo: 'f', retro: 'Falso: eso es Inspector. CloudTrail registra quién hizo qué.' },
            { texto: 'Los reportes de cumplimiento de AWS se descargan de AWS Artifact.', grupo: 'v', retro: 'Verdadero: reportes como SOC o ISO.' },
            { texto: 'Una SCP le da permisos a los usuarios de una cuenta.', grupo: 'f', retro: 'Falso: una SCP solo limita; nunca da permisos.' }
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
      hasta: 4,
      titulo: 'Arranque',
      pasos: [
        'Proyecta el QR de la plataforma y que abran “Ruta AWS Cloud Practitioner”, sesión 2.',
        'Pregunta rápida: ¿quién recuerda qué hace un grupo de seguridad? Hoy lo crean desde cero.'
      ],
      vigila: 'Que nadie encienda el sandbox todavía.'
    },
    {
      desde: 4,
      hasta: 39,
      titulo: 'Capítulo 1 · Antes de encender el sandbox',
      capitulo: 1,
      pasos: [
        'Proyecta las lecciones: IAM, políticas y SCP, responsabilidad compartida y servicios de seguridad.',
        'Detente en la lámina “Quién gana cuando las reglas chocan”: el laboratorio la pone a prueba con mensajes reales.',
        'Los ejercicios los resuelven solos, dos o tres minutos cada uno.'
      ],
      vigila: 'La tabla de servicios es larga: no la lean palabra por palabra, quédense con la columna de palabras clave.'
    },
    {
      desde: 39,
      hasta: 90,
      titulo: 'Capítulo 2 · Laboratorio guiado',
      capitulo: 2,
      pasos: [
        'Avisa antes de empezar: van a ver muchos mensajes rojos y es a propósito.',
        'Proyecta el laboratorio y avanza paso a paso; que cada quien marque “Ya lo hice”.',
        'En el paso 10, pide que alguien lea en voz alta los dos tipos de “no”.',
        'Antes de terminar, asegúrate de que TODOS borraron su secreto y su grupo, y cerraron el sandbox.'
      ],
      vigila: 'En “Avance en vivo” se ve en qué paso va cada quien. El paso 13 (nombre que empieza con “sg-”) es donde más se atoran.'
    },
    {
      desde: 90,
      hasta: 98,
      titulo: 'Capítulo 3 · Repaso',
      capitulo: 3,
      pasos: ['Proyecta la hoja de repaso.', 'El verdadero o falso es el termómetro antes del examen.'],
      vigila: 'Cuando casi todos terminen, abre el examen acumulativo de la sesión 2.'
    },
    {
      desde: 98,
      hasta: 118,
      titulo: 'Examen acumulativo',
      pasos: [
        'En el panel elige la sesión 2 y abre el examen en la pestaña “Práctica final”.',
        '25 preguntas, una sola entrega: 15 de seguridad (lo de hoy) y 10 de repaso de fundamentos de la nube y de la sesión 1.',
        'Al entregar, cada alumno puede descargar su reporte en PDF.'
      ],
      vigila: 'No proyectes el panel mientras contestan: muestra nombres y calificaciones.'
    },
    {
      desde: 118,
      hasta: 120,
      titulo: 'Cierre',
      pasos: ['Cierra el examen y mira en el panel el acierto por tema: los dos temas de “Repaso” dicen qué se olvidó de las clases anteriores.', 'Descarga el CSV antes de apagar.'],
      vigila: 'Recuérdales subir su PDF de evidencias a Blackboard.'
    }
  ]
};
