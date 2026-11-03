// Laboratorio de la sesión 5 de la Ruta AWS (versión simulador) · Bases de datos.
// «Control escolar en la nube»: la Prepa Benito Juárez ya tiene su servidor de
// la aplicación (escuela-app, con su grupo app-sg) en la VPC por omisión y una
// tabla de DynamoDB con calificaciones. El alumno monta lo que en DataCamp sale
// negado: una base RDS MySQL Multi-AZ privada a la que solo entra la app, con
// respaldos, un snapshot manual y una réplica de lectura en otra zona; además
// una tabla de DynamoDB con ítems de forma distinta y una búsqueda con Query.
// El bono es una caché serverless de ElastiCache.
//
// Datos distintos por alumno: los nombres llevan su sufijo, los días de
// retención y la matrícula que busca con Query salen de su octeto.

import { anotar, avanzar, crearGrupoSeguridad, crearTablaDynamo, cuentaNueva, lanzarInstancias, ponerItemDynamo, reloj } from '../consola/modelo.js';
import { c, scriptApache, vinetas } from './util.js';

/** Las materias de la tabla de calificaciones que la escuela ya tiene. */
const MATERIAS = ['Bases de datos', 'Redes', 'Programación', 'Matemáticas', 'Inglés'];

/** Las matrículas de la tabla de calificaciones (8 alumnos × 5 materias = 40 ítems). */
const MATRICULAS = ['BJ-2041', 'BJ-2042', 'BJ-2043', 'BJ-2044', 'BJ-2045', 'BJ-2046', 'BJ-2047', 'BJ-2048'];

/** Una calificación estable entre 60 y 100 que depende del alumno del laboratorio. */
function calificacion(octeto, i, j) {
  let h = 2166136261;
  for (const ch of `${octeto}:${i}:${j}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return 60 + (h % 41);
}

export function datosLab(d) {
  const iMatricula = d.octeto % MATRICULAS.length;
  const iMateria = 0; // «Bases de datos»: el tema de la sesión
  return {
    sufijo: d.sufijo,
    // RDS
    db: `escuela-db-${d.sufijo}`,
    replica: `escuela-db-replica-${d.sufijo}`,
    snap: `escuela-db-snap-${d.sufijo}`,
    sgDb: 'escuela-db-sg',
    motor: 'MySQL',
    puerto: 3306,
    clases: ['db.t3.micro', 'db.t4g.micro', 'db.t3.small', 'db.t4g.small'],
    almacenamientoTipo: 'gp3',
    almacenamientoGib: 20,
    retencion: [10, 14, 21, 30][d.octeto % 4],
    // Lo que ya existe
    app: 'escuela-app',
    sgApp: 'app-sg',
    userData: scriptApache('Control escolar', `Prepa Benito Juarez - plantel ${d.sufijo}`),
    // DynamoDB
    tabla: `puntajes-${d.sufijo}`,
    pk: 'jugador',
    tablaEscuela: 'calificaciones',
    matricula: MATRICULAS[iMatricula],
    materia: MATERIAS[iMateria],
    calificacion: calificacion(d.octeto, iMatricula, iMateria),
    // ElastiCache (bono)
    cache: `escuela-cache-${d.sufijo}`,
    ipCasa: d.ipCasa
  };
}

export const LAB = {
  id: 'lab-s5',
  titulo: 'Control escolar en la nube',
  minutos: 50,
  pistas: true,
  // En «Tus datos» solo va lo que usa este laboratorio: todo va en la VPC por
  // omisión, así que el rango de VPC y el número de red solo confundirían.
  datosVisibles: ['sufijo', 'ipCasa', 'cuentaId'],
  historia: `
    <p>La <strong>Prepa Benito Juárez</strong> guarda las calificaciones en una base MySQL que un profe instaló a mano en una computadora del laboratorio. Cuando se va la luz, nadie puede consultar nada, y los respaldos… «a veces» se hacen.</p>
    <p>Te toca mudar el control escolar a <strong>bases administradas</strong>: una base <strong>RDS</strong> que sobreviva si se cae una zona, que se respalde sola y que solo pueda alcanzar el servidor de la aplicación; y una tabla de <strong>DynamoDB</strong> para los puntajes del concurso de matemáticas.</p>
    <p>En tu cuenta ya existen el servidor <code>escuela-app</code> con su grupo de seguridad <code>app-sg</code> (en la VPC por omisión) y la tabla de DynamoDB <code>calificaciones</code>. <strong>No los borres.</strong></p>
    <p>Todo va en <strong>N. Virginia (us-east-1)</strong>. Aquí, a diferencia del sandbox de DataCamp, RDS sí deja crear bases. Crear una base tarda unos 30 segundos y una réplica unos 25: mientras esperas, avanza con otra tarea. La última tarea es un <strong>bono opcional</strong> que suma encima, sin pasar de 100.</p>`,

  estadoInicial(datos) {
    const x = datosLab(datos);
    const e = cuentaNueva(datos);
    const vpc = e.vpcs.find((v) => v.porDefecto);

    // El servidor de la aplicación, con su grupo: la web abierta y SSH solo desde casa.
    const sg = crearGrupoSeguridad(e, {
      nombre: x.sgApp,
      descripcion: 'Servidor de la aplicacion escolar',
      vpcId: vpc.id,
      entrada: [
        { protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' },
        { protocolo: 'tcp', desde: 22, hasta: 22, origen: `${x.ipCasa}/32` }
      ]
    });
    lanzarInstancias(e, { nombre: x.app, ami: 'al2023', tipo: 't3.micro', gruposSeguridad: [sg.id], userData: x.userData });

    // La tabla que la escuela ya usa: una llave compuesta (matrícula + materia).
    crearTablaDynamo(e, { nombre: x.tablaEscuela, pk: { nombre: 'matricula', tipo: 'S' }, sk: { nombre: 'materia', tipo: 'S' }, modo: 'PAY_PER_REQUEST' });
    avanzar(e, reloj.ahora() + 60_000);
    MATRICULAS.forEach((m, i) => {
      MATERIAS.forEach((materia, j) => {
        ponerItemDynamo(e, x.tablaEscuela, { matricula: { S: m }, materia: { S: materia }, calificacion: { N: String(calificacion(datos.octeto, i, j)) } });
      });
    });

    e.bitacora = [];
    anotar(e, 'Laboratorio', 'Inicio', 'La cuenta empieza con escuela-app (grupo app-sg) en la VPC por omisión y la tabla calificaciones de DynamoDB.');
    return e;
  },

  tareas(datos) {
    const x = datosLab(datos);
    return [
      {
        id: 'rds',
        titulo: 'La base administrada en RDS',
        puntos: 30,
        html: `
          <p>Crea la base del control escolar con <strong>Standard create</strong>:</p>
          ${vinetas([
            `Motor ${c('MySQL')} (la versión que sale por omisión) y plantilla ${c('Dev/Test')}.`,
            `Despliegue <strong>Multi-AZ DB instance deployment (2 instances)</strong>: una copia en espera en otra zona, por si se cae la principal.`,
            `DB instance identifier: ${c(x.db)}. Usuario ${c('admin')} y una contraseña que inventes (el simulador no la guarda).`,
            `Clase pequeña de la familia <em>Burstable</em>: ${c('db.t3.micro')}, ${c('db.t4g.micro')} o ${c('db.t3.small')}.`,
            `Almacenamiento ${c(x.almacenamientoTipo)} de ${c(`${x.almacenamientoGib} GiB`)}.`,
            `En la VPC por omisión (la de ${c(x.app)}) y con <strong>Public access: No</strong>.`
          ])}
          <p>Espera a que su <em>Status</em> diga <strong>Available</strong>.</p>`,
        pista:
          'Se hace en Aurora and RDS → Databases → Create database. La plantilla Free tier no deja elegir Multi-AZ, por eso se pide Dev/Test. La clase está en Instance configuration (cambia a «Burstable classes»), el almacenamiento en Storage y el acceso público en Connectivity. Si eliges «Multi-AZ DB cluster» o Aurora, se crea un clúster, que no es lo que se pide.'
      },
      {
        id: 'seguridad',
        titulo: 'Solo la aplicación entra a la base',
        puntos: 15,
        html: `
          <p>La base no debe aceptar conexiones de cualquiera: solo del servidor ${c(x.app)}.</p>
          ${vinetas([
            `Un grupo de seguridad para la base (puedes llamarlo ${c(x.sgDb)}) con una regla de entrada <strong>MYSQL/Aurora</strong> (TCP ${c(String(x.puerto))}) cuyo origen sea el <strong>grupo</strong> ${c(x.sgApp)}, no una IP.`,
            `Ninguna regla de ese grupo abre el puerto ${c(String(x.puerto))} a una dirección IP o red (ni ${c('0.0.0.0/0')}, ni tu casa).`,
            `Tu base ${c(x.db)} usa ese grupo (puedes elegirlo al crearla o cambiarlo después con <em>Modify</em>).`
          ])}`,
        pista:
          'El grupo de seguridad se crea en EC2 → Security Groups → Create security group, en la VPC por omisión. En la regla de entrada, el tipo es MYSQL/Aurora y en Source eliges «Custom» y escribes app-sg: así entra cualquier servidor que tenga ese grupo, aunque cambie su IP. Para ponérselo a la base: Databases → tu base → Modify → Connectivity → Security group, y al final «Apply immediately».'
      },
      {
        id: 'respaldos',
        titulo: 'Respaldos automáticos y una foto manual',
        puntos: 15,
        html: `
          ${vinetas([
            `El reglamento de la escuela pide guardar los respaldos automáticos <strong>${x.retencion} días</strong>: deja el <em>Backup retention period</em> de ${c(x.db)} en ${c(`${x.retencion} days`)}.`,
            `Antes de las inscripciones, toma un <strong>snapshot manual</strong> de la base llamado ${c(x.snap)} y espera a que quede <em>Available</em>.`
          ])}
          <p>Los respaldos automáticos se borran solos al pasar sus días; el snapshot manual se queda hasta que tú lo borres.</p>`,
        pista:
          'La retención está en Additional configuration → Backup al crear la base, o después en Modify (con «Apply immediately»). El snapshot manual se toma desde Databases → tu base → Actions → Take snapshot; lo ves en el menú Snapshots, pestaña Manual.'
      },
      {
        id: 'replica',
        titulo: 'Una réplica para las consultas',
        puntos: 15,
        html: `
          <p>En inscripciones, cientos de papás consultan calificaciones al mismo tiempo. Para que esas lecturas no frenen a la base principal:</p>
          ${vinetas([
            `Crea una <strong>réplica de lectura</strong> de ${c(x.db)} llamada ${c(x.replica)}.`,
            'Ponla en una <strong>zona de disponibilidad distinta</strong> a la de la base principal (fíjate en qué zona quedó tu base).',
            'Espera a que quede <em>Available</em>.'
          ])}
          <p>Recuerda: la copia en espera de Multi-AZ <strong>no</strong> atiende consultas; la réplica de lectura sí.</p>`,
        pista:
          'Se hace en Databases → tu base → Actions → Create read replica. La zona de la base principal aparece en la columna «Region & AZ» de Databases. En la réplica, en Connectivity, elige una Availability Zone distinta. Si sale el error «Automated backups are not enabled», es que la retención de la base está en 0 días.'
      },
      {
        id: 'dynamo',
        titulo: 'Puntajes sin servidor en DynamoDB',
        puntos: 25,
        html: `
          ${vinetas([
            `Una tabla ${c(x.tabla)} con <em>Partition key</em> ${c(x.pk)} de tipo <strong>String</strong>, sin sort key y con capacidad <strong>On-demand</strong> (la de <em>Default settings</em>).`,
            `Un ítem ${c('ana')} con el atributo ${c('puntaje')} de tipo <strong>Number</strong> = ${c('950')}.`,
            `Un ítem ${c('luis')} con ${c('puntaje')} (Number) = ${c('720')} y además ${c('nivel')} (String) = ${c('experto')}. Ana no lleva nivel: en DynamoDB cada ítem puede tener atributos distintos.`,
            `<strong>Tu ítem:</strong> ${c(x.sufijo)}, con ${c('puntaje')} (Number) igual a la calificación de <strong>${x.materia}</strong> del alumno ${c(x.matricula)}. Búscala con <strong>Query</strong> en la tabla ${c(x.tablaEscuela)} (llave: ${c('matricula')} + ${c('materia')}).`
          ])}`,
        pista:
          'Todo está en DynamoDB. La tabla se crea en Tables → Create table. Los ítems se agregan en Explore items → elige tu tabla → Create item; con «Add new attribute» eliges el tipo (Number o String). Para buscar, en Explore items elige la tabla calificaciones y cambia de Scan a Query: escribe la matrícula en la partition key (y, si quieres, la materia en la sort key) y presiona Run. Query va directo a la llave; Scan lee toda la tabla.'
      },
      {
        id: 'cache',
        titulo: 'Una caché para lo más consultado',
        puntos: 10,
        bono: true,
        html: `
          <p><strong>Opcional.</strong> La tabla de los mejores puntajes se consulta miles de veces el día del concurso. Si te sobra tiempo, déjale lista una caché en memoria: suma hasta <strong>10 puntos extra</strong>, que compensan errores de las otras tareas, pero tu calificación nunca pasa de 100.</p>
          ${vinetas([
            `Una caché <strong>Serverless</strong> de ElastiCache con motor ${c('Valkey')} (o ${c('Redis OSS')}) llamada ${c(x.cache)}.`,
            `En la VPC por omisión, la misma de ${c(x.app)}, y en estado <em>Available</em>.`
          ])}`,
        pista:
          'Se hace en ElastiCache → Valkey caches (o Redis OSS caches) → Create cache, con Deployment option «Serverless». Con «Default settings» usa la VPC por omisión. Tarda unos 20 segundos en quedar Available.'
      }
    ];
  }
};
