// Rúbrica del simulacro 1 · El Grano de Oro (construir desde cero).

import {
  adjuntarIgw,
  agregarUsuariosAGrupo,
  ami,
  asociarSubredes,
  avanzar,
  crearBucket,
  crearGrupoIam,
  crearIgw,
  crearSubred,
  crearTablaRutas,
  crearUsuario,
  crearVpc,
  editarRutas,
  editarSubred,
  igwDeVpc,
  lanzarInstancias,
  reloj
} from '../../public/consola/modelo.js';
import { esSubredPublica } from '../../public/consola/red.js';
import { LAB, datosLab } from '../../public/labs/simulacro-1.js';
import {
  armar,
  check,
  checkBloqueo,
  checkHttp,
  checkIpPublica,
  checkSsh,
  checkVersionado,
  contiene,
  deEscritura,
  elegirBucket,
  elegirVpc,
  estaEn,
  explicarPagina,
  explicarRuta,
  faltaGrupo,
  faltaUsuario,
  fmtInst,
  fmtSubred,
  grupoIam,
  lista,
  mejorPor,
  preparar,
  probar,
  retroIgw,
  retroNombreBucket,
  sinInstancia,
  sinInstanciaCorta,
  sinVpc,
  usuario,
  vivas
} from './comun.js';

const MICROS = ['t2.micro', 't3.micro'];

/**
 * Dónde repasar cada punto en la Ruta AWS (ver src/repaso.js). La clave
 * 'tarea/check' gana sobre la de la tarea. Lo que en la Ruta solo se vio en
 * teoría (IAM) apunta a la lámina de la sesión 2.
 */
export const REPASO = {
  iam: 's2-identidades/1',
  'iam/grupo': 's2-identidades/1',
  'iam/politica': ['s2-identidades/3', 's2-politicas/1'],
  'iam/usuario': 's2-identidades/1',
  'iam/directo': ['s2-identidades/1', 's2-identidades/3'],

  red: 's3-vpc/3',
  'red/vpc': ['s3-vpc/1', 's3-lab-vpc/7'],
  'red/vpc-nombre': 's3-lab-vpc/7',
  'red/subred': ['s3-lab-vpc/8', 's1-global/1'],
  'red/subred-cidr': ['s3-vpc/2', 's3-lab-vpc/8'],
  'red/igw': ['s3-vpc/1', 's3-lab-vpc/10'],
  'red/ruta': ['s3-vpc/3', 's3-lab-vpc/5'],

  servidor: 's1-lab-ec2/8',
  'servidor/instancia': ['s1-lab-ec2/8', 's3-lab-vpc/4'],
  'servidor/tipo': ['s1-lab-ec2/5', 's1-lab-ec2/6'],
  'servidor/ip': 's1-lab-ec2/8',
  'servidor/http': ['s2-lab-seguridad/14', 's1-lab-ec2/8'],
  'servidor/ssh': ['s2-lab-seguridad/14', 's2-identidades/3'],
  'servidor/pagina': ['s1-lab-ec2/11', 's3-vpc/3'],
  'servidor/texto': 's1-lab-ec2/9',

  s3: 's4-seguridad/1',
  's3/bucket': ['s4-lab-almacenamiento/3', 's4-s3/1'],
  's3/bloqueo': ['s4-lab-almacenamiento/4', 's4-seguridad/1'],
  's3/versionado': ['s4-lab-almacenamiento/5', 's4-seguridad/1'],
  's3/cifrado': ['s4-lab-almacenamiento/5', 's4-seguridad/1']
};

/* ================================================================== IAM */

function revisarIam(estado, x) {
  const g = grupoIam(estado, x.grupo);
  const u = usuario(estado, x.usuario);
  const politicasG = g?.politicas ?? [];

  const grupo = check('grupo', `Existe el grupo de IAM «${x.grupo}»`, 4, g, g ? `El grupo ${x.grupo} existe. Un grupo junta a las personas que hacen el mismo trabajo para darles los permisos una sola vez.` : faltaGrupo(estado, x.grupo));

  const okPol = g && politicasG.includes(x.politica) && !deEscritura(politicasG).length;
  let retroPol;
  if (okPol) retroPol = `El grupo tiene ${x.politica}: puede ver los buckets y sus archivos, pero no cambiar ni borrar nada. Es mínimo privilegio: lo justo para su trabajo.`;
  else if (!g) retroPol = `Sin el grupo ${x.grupo} no hay a quién revisarle la política. Al crearlo, en «Attach permissions policies» busca ${x.politica}.`;
  else if (deEscritura(politicasG).length) retroPol = `El grupo ${x.grupo} tiene ${lista(deEscritura(politicasG))}, que deja cambiar o borrar cosas. Lupita solo necesita ver: quita esa política (Permissions → Remove) y deja ${x.politica}.`;
  else retroPol = `El grupo ${x.grupo} tiene: ${lista(politicasG)}. Le falta ${x.politica} (pestaña Permissions → Add permissions → Attach policies).`;
  const politica = check('politica', `El grupo tiene ${x.politica} y ninguna política que deje escribir`, 5, okPol, retroPol);

  const okU = estaEn(u, x.grupo);
  const miembro = check(
    'usuario',
    `Existe el usuario «${x.usuario}» y está en el grupo «${x.grupo}»`,
    4,
    okU,
    okU
      ? `${x.usuario} está en ${x.grupo} y hereda sus permisos. Si mañana Lupita cambia de puesto, basta con sacarla del grupo.`
      : !u
        ? faltaUsuario(estado, x.usuario)
        : `El usuario ${x.usuario} existe, pero está en: ${lista(u.grupos, 'ningún grupo')}. Agrégalo a ${x.grupo} (IAM → User groups → ${x.grupo} → Add users).`
  );

  const okD = u && u.politicas.length === 0;
  const directo = check(
    'directo',
    `El usuario «${x.usuario}» no tiene políticas puestas directo`,
    2,
    okD,
    okD
      ? 'Sin políticas directas, todos los permisos de Lupita se ven y se cambian en un solo lugar: el grupo.'
      : !u
        ? `Primero crea el usuario ${x.usuario}; sus permisos deben llegarle por el grupo, no directo.`
        : `${x.usuario} tiene puestas directo: ${lista(u.politicas)}. Quítalas (Users → ${x.usuario} → Permissions → Remove): el permiso ya le llega por el grupo y así no se te olvida dónde lo diste.`
  );
  return [grupo, politica, miembro, directo];
}

/* ================================================================== red */

function elegirSubred(estado, vpc, x) {
  const enVpc = estado.subredes.filter((s) => s.vpcId === vpc.id);
  const enZona = enVpc.filter((s) => s.az === x.az);
  const peso = (s) => (s.cidr === x.subredCidr ? 4 : 0) + (esSubredPublica(estado, s.id) ? 2 : 0) + (vivas(estado).some((i) => i.subredId === s.id) ? 1 : 0);
  return { enVpc, subred: [...enZona].sort((a, b) => peso(b) - peso(a))[0] ?? null };
}

function revisarRed(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  const checks = [];
  checks.push(check('vpc', `Existe una VPC con el bloque ${x.vpcCidr}`, 6, vpc, vpc ? `Tu VPC ${vpc.id} usa ${x.vpcCidr}: es tu fraccionamiento privado dentro de AWS, con 65,536 direcciones para repartir en subredes.` : sinVpc(estado, x.vpcCidr)));
  const okNombre = vpc && vpc.nombre === x.vpcNombre;
  checks.push(
    check(
      'vpc-nombre',
      `La VPC se llama «${x.vpcNombre}»`,
      2,
      okNombre,
      okNombre ? 'Un buen nombre te ahorra confusiones cuando la cuenta tenga varias redes.' : vpc ? `Tu VPC ${vpc.id} se llama «${vpc.nombre || '(sin nombre)'}». Cámbiale la etiqueta Name a ${x.vpcNombre} (Actions → Manage tags).` : 'Primero crea la VPC; el nombre va en el campo «Name tag».'
    )
  );

  if (!vpc) {
    const r = 'Sin tu VPC no hay dónde revisar esto: la subred, el gateway y la ruta viven dentro de ella.';
    checks.push(check('subred', `Una subred de tu VPC en ${x.az}`, 6, false, r));
    checks.push(check('subred-cidr', `La subred usa el bloque ${x.subredCidr}`, 2, false, r));
    checks.push(check('igw', 'Un Internet Gateway conectado a tu VPC', 6, false, r));
    checks.push(check('ruta', 'La subred es pública: su tabla manda 0.0.0.0/0 al Internet Gateway', 8, false, r));
    return { checks, vpc, subred: null };
  }

  const { enVpc, subred } = elegirSubred(estado, vpc, x);
  let retroSub;
  if (subred) retroSub = `Tu subred ${fmtSubred(subred)} vive en ${x.az}. Una subred está siempre en una sola zona de disponibilidad.`;
  else if (enVpc.length) retroSub = `Tus subredes en la VPC son ${enVpc.map(fmtSubred).join('; ')}, pero ninguna está en ${x.az}. La zona se elige al crear la subred y no se puede cambiar: crea otra en ${x.az}.`;
  else retroSub = `Tu VPC ${vpc.id} todavía no tiene subredes. Créala en VPC → Subnets → Create subnet, eligiendo tu VPC y la zona ${x.az}.`;
  checks.push(check('subred', `Una subred de tu VPC en ${x.az}`, 6, subred, retroSub));

  const exacta = enVpc.find((s) => s.cidr === x.subredCidr);
  const okCidr = exacta && exacta.az === x.az;
  checks.push(
    check(
      'subred-cidr',
      `La subred usa el bloque ${x.subredCidr}`,
      2,
      okCidr,
      okCidr
        ? `${x.subredCidr} te da 251 direcciones útiles (AWS se reserva 5 de cada subred).`
        : exacta
          ? `Tu subred ${fmtSubred(exacta)} tiene el bloque correcto pero está en ${exacta.az}, no en ${x.az}.`
          : `Ninguna subred de tu VPC usa ${x.subredCidr}${subred ? ` (la de ${x.az} usa ${subred.cidr})` : ''}. El bloque de una subred no se cambia: crea una con ${x.subredCidr}.`
    )
  );

  const igw = igwDeVpc(estado, vpc.id);
  checks.push(check('igw', 'Un Internet Gateway conectado a tu VPC', 6, igw, retroIgw(estado, vpc)));

  const publica = subred && esSubredPublica(estado, subred.id);
  checks.push(
    check(
      'ruta',
      'La subred es pública: su tabla manda 0.0.0.0/0 al Internet Gateway',
      8,
      publica,
      publica
        ? `La tabla de tu subred manda 0.0.0.0/0 a ${igw.id}. Esa ruta es lo único que hace pública a una subred: sin ella, aunque se llame «pública», nadie de internet le llega.`
        : subred
          ? explicarRuta(estado, subred)
          : `Primero necesitas una subred en ${x.az}; luego su tabla de rutas debe mandar 0.0.0.0/0 al Internet Gateway.`
    )
  );
  return { checks, vpc, subred };
}

/* ============================================================= servidor */

function checksInstancia(estado, inst, x, vpc) {
  const tipoOk = inst && ami(inst.ami)?.clave === 'al2023' && MICROS.includes(inst.tipo);
  const imagen = inst && ami(inst.ami);
  const r = probar(estado, inst);
  const abre = r.resultado === 'ok' && r.codigoHttp === 200;
  const conTexto = abre && contiene(r.html, x.textoPagina) && contiene(r.html, x.textoSucursal);
  const encendida = inst && (inst.estado === 'running' || inst.estado === 'pending');

  return [
    check(
      'instancia',
      `Una instancia encendida dentro de tu VPC ${x.vpcCidr}`,
      6,
      encendida,
      encendida
        ? `Tu instancia ${fmtInst(inst)} está en tu VPC, en la subred ${inst.subredId}. Así queda en la red que tú controlas y no en la que AWS crea para todos.`
        : inst
          ? `Tu instancia ${fmtInst(inst)} está ${inst.estado}. Enciéndela con Instance state → Start (ojo: al encender cambia su IP pública).`
          : sinInstancia(estado, vpc, x.vpcCidr)
    ),
    check(
      'tipo',
      'Amazon Linux 2023 en una t2.micro o t3.micro',
      4,
      tipoOk,
      tipoOk
        ? `${inst.tipo} con Amazon Linux 2023: entra en la capa gratuita y alcanza de sobra para una tienda que empieza.`
        : inst
          ? `Tu instancia usa ${imagen?.nombre ?? inst.ami} en ${inst.tipo}. Se pidió Amazon Linux 2023 en t2.micro o t3.micro. La AMI no se cambia: lanza otra; el tipo sí se cambia con la instancia detenida (Actions → Instance settings → Change instance type).`
          : sinInstanciaRetro()
    ),
    checkIpPublica(estado, inst, { puntos: 4 }),
    checkHttp(estado, inst, x.ipCasa, 'http', 5),
    checkSsh(estado, inst, x.ipCasa, { puntos: 6 }),
    check(
      'pagina',
      'La página de la tienda abre desde internet',
      6,
      abre,
      abre ? `http://${inst.ipPublica} abre desde tu casa. Para eso tuvieron que coincidir todas las piezas: gateway, ruta, IP pública, grupo de seguridad y Apache corriendo.` : explicarPagina(estado, inst, r)
    ),
    check(
      'texto',
      `La página dice «${x.textoPagina}» y «${x.textoSucursal}»`,
      4,
      conTexto,
      conTexto
        ? 'La página es la que escribió tu user data: el script corrió en el primer arranque, como administrador, sin que tuvieras que entrar al servidor.'
        : abre
          ? `La página abre, pero no dice «${x.textoPagina}» y «${x.textoSucursal}»${/It works/i.test(r.html) ? ': es la página de prueba de Apache, así que tu script no escribió index.html' : ''}. Copia el script de la tarea tal cual, con tu sufijo; recuerda que el user data solo corre en el primer arranque, así que tendrás que lanzar una instancia nueva.`
          : 'Primero tiene que abrir la página (revisa el punto anterior); después se revisa que diga el texto de tu script.'
    )
  ];
}

const sinInstanciaRetro = () => 'Todavía no hay una instancia en tu VPC que revisar aquí.';

function revisarServidor(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  const candidatas = vpc ? vivas(estado).filter((i) => i.vpcId === vpc.id) : [];
  const mejor = mejorPor(candidatas, (i) => checksInstancia(estado, i, x, vpc));
  if (mejor) return mejor.checks;
  // Sin instancia en la VPC: todo falla, y la retro explica por qué (VPC por omisión, terminada…).
  const corta = sinInstanciaCorta(estado, vpc, x.vpcCidr);
  return checksInstancia(estado, null, x, vpc).map((c) => (c.id === 'instancia' ? c : { ...c, retro: corta }));
}

/* =================================================================== S3 */

function revisarS3(estado, x) {
  const el = elegirBucket(estado, x.bucket, 'elgrano');
  const b = el.bucket;
  const cifradoOk = b && b.cifrado?.tipo === 'SSE-S3';
  return [
    check('bucket', `Existe el bucket «${x.bucket}»`, 6, el.exacto, retroNombreBucket(estado, x.bucket, el)),
    checkBloqueo(el, { puntos: 4 }),
    checkVersionado(el, { puntos: 6 }),
    check(
      'cifrado',
      'Cifrado por omisión SSE-S3',
      4,
      cifradoOk,
      cifradoOk
        ? 'Con SSE-S3, S3 cifra cada archivo al guardarlo con llaves que AWS administra, sin costo extra. Proteger los datos «en reposo» es tu parte de la responsabilidad compartida.'
        : b
          ? `Tu bucket ${b.nombre} usa ${b.cifrado?.tipo}. Se pidió SSE-S3 (llaves administradas por S3, sin costo extra). Cámbialo en Properties → Default encryption → Edit.`
          : 'Sin el bucket no hay cifrado que revisar. Al crearlo, en «Default encryption» deja SSE-S3.'
    )
  ];
}

/* ============================================================== revisar */

export function revisar(estadoOriginal, datos) {
  const estado = preparar(estadoOriginal);
  const x = datosLab(datos);
  return armar(LAB.tareas(datos), {
    iam: revisarIam(estado, x),
    red: revisarRed(estado, x).checks,
    servidor: revisarServidor(estado, x),
    s3: revisarS3(estado, x)
  });
}

/* ============================================================= solución */

export function solucion(datos) {
  const x = datosLab(datos);
  const estado = LAB.estadoInicial(datos);

  crearGrupoIam(estado, { nombre: x.grupo, politicas: [x.politica] });
  crearUsuario(estado, { nombre: x.usuario });
  agregarUsuariosAGrupo(estado, x.grupo, [x.usuario]);

  const vpc = crearVpc(estado, { nombre: x.vpcNombre, cidr: x.vpcCidr });
  const subred = crearSubred(estado, { vpcId: vpc.id, nombre: x.subredNombre, az: x.az, cidr: x.subredCidr });
  editarSubred(estado, subred.id, { ipPublicaAuto: true });
  const igw = crearIgw(estado, { nombre: x.igwNombre });
  adjuntarIgw(estado, igw.id, vpc.id);
  const rt = crearTablaRutas(estado, { vpcId: vpc.id, nombre: 'elgrano-rt-publica' });
  editarRutas(estado, rt.id, [{ destino: '0.0.0.0/0', objetivo: igw.id }]);
  asociarSubredes(estado, rt.id, [subred.id]);

  lanzarInstancias(estado, {
    nombre: x.instancia,
    ami: 'al2023',
    tipo: 't2.micro',
    subredId: subred.id,
    nuevoGrupo: {
      nombre: x.sg,
      descripcion: 'Web y SSH de la tienda',
      entrada: [
        { protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' },
        { protocolo: 'tcp', desde: 22, hasta: 22, origen: `${x.ipCasa}/32` }
      ]
    },
    userData: x.userData
  });

  crearBucket(estado, { nombre: x.bucket, versionado: true, cifrado: 'SSE-S3' });

  avanzar(estado, reloj.ahora() + 3600_000);
  return estado;
}
