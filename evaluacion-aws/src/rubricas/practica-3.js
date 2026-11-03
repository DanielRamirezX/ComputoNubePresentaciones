// Rúbrica de la práctica integradora 3 · El Festival Jacaranda vende boletos en
// hora pico (sin servidores y desacoplado). Revisa RESULTADOS en la cuenta: que
// la página abra por CloudFront y por www, que el bucket no se pueda leer
// directo, que un boleto se encuentre por correo con el índice, que un pedido
// de la cola de verdad lo procese la Lambda, que SNS pueda entregar a la cola…
//
// Solo servidor: el navegador nunca recibe este archivo.

import {
  adjuntarPoliticasRol,
  agregarDisparador,
  avanzar,
  bucketDe,
  colaPermiteServicio,
  colaPorRef,
  confirmarSuscripcion,
  consultarTabla,
  crearAlarma,
  crearCola,
  crearDistribucion,
  crearFuncion,
  crearRegistroDns,
  crearRegla,
  crearSuscripcion,
  crearTablaDynamo,
  crearTema,
  crearZonaHospedada,
  editarBloqueoPublico,
  editarConfiguracionLambda,
  editarPolitica,
  ENDPOINT_S3_WEB,
  enviarMensaje,
  funcionLambda,
  itemDynamoPlano,
  periodoRegla,
  politicaEsPublica,
  politicaIam,
  ponerItemDynamo,
  reloj,
  runtimeLambda,
  suscribirColaATema,
  tablaDynamoDe,
  temaSns
} from '../../public/consola/modelo.js';
import { probarPagina } from '../../public/consola/red.js';
import { LAB, datosLab } from '../../public/labs/practica-3.js';
import { armar, check, lista, normal, preparar } from './comun.js';

/**
 * Dónde repasar cada punto en la Ruta AWS (ver src/repaso.js). La clave
 * 'tarea/check' gana sobre la de la tarea.
 */
export const REPASO = {
  sitio: 's3-borde/2',
  'sitio/privado': ['s4-seguridad/1', 's4-lab-almacenamiento/4'],
  'sitio/politica': ['s4-seguridad/1', 's2-politicas/1'],
  'sitio/cdn': ['s3-borde/2', 's3-lab-vpc/13'],
  'sitio/raiz': ['s3-borde/2', 's4-s3/1'],
  'sitio/abre': ['s3-borde/2', 's4-seguridad/1'],

  dominio: 's3-borde/1',
  'dominio/zona': ['s3-borde/1', 's3-lab-vpc/13'],
  'dominio/alias': 's3-borde/1',
  'dominio/abre': ['s3-borde/1', 's3-borde/2'],

  boletos: 's5-nosql/1',
  'boletos/tabla': ['s5-lab-bases/6', 's5-nosql/1'],
  'boletos/llave': ['s5-nosql/1', 's5-lab-bases/7'],
  'boletos/demanda': ['s5-nosql/2', 's7-precios/1'],
  'boletos/indice': ['s5-nosql/1', 's5-lab-bases/10'],
  'boletos/prueba': ['s5-lab-bases/8', 's5-lab-bases/10'],

  pedidos: 's6-serverless/2',
  'pedidos/cola': 's6-serverless/2',
  'pedidos/cifrado': ['s2-servicios/1', 's2-responsabilidad/1'],
  'pedidos/retencion': 's6-serverless/2',

  procesar: 's6-serverless/1',
  'procesar/funcion': ['s6-serverless/1', 's6-lab-escalar/16'],
  'procesar/timeout': 's6-serverless/1',
  'procesar/disparador': ['s6-serverless/2', 's6-serverless/1'],
  'procesar/rol': ['s2-identidades/1', 's2-politicas/1'],
  'procesar/prueba': ['s6-serverless/2', 's6-serverless/1'],

  avisos: 's6-serverless/2',
  'avisos/correo': ['s6-serverless/2', 's6-lab-escalar/15'],
  'avisos/permiso': ['s2-politicas/1', 's6-serverless/2'],

  programado: ['s6-serverless/1', 's8-extras/2'],

  alarma: 's6-monitorear/1',
  'alarma/metrica': ['s6-monitorear/1', 's6-lab-escalar/14'],
  'alarma/umbral': ['s6-lab-escalar/15', 's6-monitorear/1'],
  'alarma/accion': ['s6-lab-escalar/15', 's6-serverless/2'],
  'alarma/llega': ['s6-serverless/2', 's6-lab-escalar/15'],

  dlq: 's6-serverless/2'
};

/* ============================================================== ayudas */

const parecido = (a, b) => normal(a).replace(/[^a-z0-9]/g, '') === normal(b).replace(/[^a-z0-9]/g, '');
const abre = (r) => r?.resultado === 'ok' && r.codigoHttp === 200;
const primerFallo = (r) => (r?.diagnostico ?? []).find((p) => !p.ok) ?? null;
const ADMIN = (p) => politicaIam(p)?.servicio === '*' && politicaIam(p)?.acceso !== 'lectura';

/** Elige el candidato con más checks bien (como mejorPor de comun.js, pero con la lista de checks). */
function mejor(candidatos, evaluar) {
  let elegido = null;
  for (const c of candidatos) {
    const checks = evaluar(c);
    const puntos = checks.reduce((s, k) => s + (k.ok ? k.puntos : 0), 0);
    if (!elegido || puntos > elegido.puntos) elegido = { c, checks, puntos };
  }
  return elegido;
}

/** Lo que se ve al pedir una dirección: «200», o el error y el paso donde se quedó. */
function textoPrueba(r) {
  if (abre(r)) return 'contesta 200 con la página';
  if (r?.resultado === 'ok') return `contesta ${r.codigoHttp} (${r.titulo ?? 'error'})`;
  const f = primerFallo(r);
  return f ? `no abre: ${f.detalle}` : 'no abre';
}

/* ========================================================== el sitio */

const bloqueoCompleto = (b) => Boolean(b?.bloqueoPublico && Object.values(b.bloqueoPublico).every(Boolean));

/** Las distribuciones que usan el bucket del sitio como origen. */
const origenDelBucket = (d, bucket) => d.origenes.find((o) => o.recurso === bucket || o.dominio.startsWith(`${bucket}.`)) ?? null;

function elegirDistribucion(estado, x) {
  const todas = estado.cloudfront?.distribuciones ?? [];
  const peso = (d) => {
    const o = origenDelBucket(d, x.bucket);
    return (o ? 8 : 0) + (o?.tipo === 's3' && o.oacId ? 4 : 0) + (d.desplegada ? 2 : 0) + (d.alias.includes(x.www) ? 1 : 0) + (d.objetoRaiz === 'index.html' ? 1 : 0);
  };
  return [...todas].sort((a, b) => peso(b) - peso(a))[0] ?? null;
}

function retroDistribucionAbre(estado, d, r, x) {
  if (!d.desplegada) return `Tu distribución ${d.id} todavía está en «Deploying»: tarda unos 30 segundos en llegar a las ubicaciones de borde. Espera y vuelve a revisar.`;
  if (!d.habilitada) return `Tu distribución ${d.id} está deshabilitada (Disabled). Actívala con Enable.`;
  const f = primerFallo(r);
  const o = origenDelBucket(d, x.bucket);
  if (f?.paso?.includes('Permisos')) {
    const b = bucketDe(estado, x.bucket);
    return `https://${d.dominio} contesta 403 Access Denied: la política del bucket no deja leer a CloudFront${b?.politica ? '' : ' (el bucket ya no tiene política)'}. Con OAC, la política debe tener el permiso «AllowCloudFrontServicePrincipal» para tu distribución: en CloudFront → tu distribución → Origins → Edit → Save, o copia la política que te propone y pégala en S3 → Permissions → Bucket policy.`;
  }
  if (f?.paso?.includes('Objeto')) {
    return d.objetoRaiz
      ? `https://${d.dominio} no encuentra ${d.objetoRaiz} en el bucket. Revisa que el Default root object se llame exactamente index.html y que el archivo siga en ${x.bucket}.`
      : `https://${d.dominio} pide «/» y el bucket no tiene un objeto con ese nombre: sin Default root object, CloudFront no sabe que debe servir index.html.`;
  }
  if (!o) return `Tu distribución ${d.id} no usa el bucket ${x.bucket} como origen, así que no sirve la página del festival.`;
  return `https://${d.dominio} ${textoPrueba(r)}.`;
}

function revisarSitio(estado, x) {
  const b = bucketDe(estado, x.bucket);
  const sinBucket = `El bucket ${x.bucket} ya no existe: era el que tenía el sitio de la agencia. No hace falta borrarlo, solo volverlo privado.`;

  // 1. Block Public Access completo.
  const okPriv = bloqueoCompleto(b);
  let retroPriv;
  if (okPriv) retroPriv = `${x.bucket} tiene las cuatro casillas de Block public access: aunque alguien pegue una política pública por error, S3 no la deja pasar. Es la primera defensa de un bucket.`;
  else if (!b) retroPriv = sinBucket;
  else {
    const apagadas = Object.entries(b.bloqueoPublico ?? {}).filter(([, v]) => !v).length;
    retroPriv = `${x.bucket} tiene apagadas ${apagadas} de las 4 casillas de Block public access. Enciéndelas todas en S3 → tu bucket → Permissions → Block public access → Edit.`;
  }

  // 2. La política ya no es pública.
  const okPol = Boolean(b) && !politicaEsPublica(b.politica);
  let retroPol;
  if (okPol) {
    retroPol = b.politica
      ? 'La política del bucket ya no deja leer a todo el mundo: solo le da s3:GetObject a CloudFront, con la condición de que venga de TU distribución (AWS:SourceArn). Mínimo privilegio.'
      : 'El bucket ya no tiene la política pública de la agencia. Ojo: para que CloudFront pueda leerlo con OAC, la política debe tener su permiso (la consola lo agrega al crear la distribución).';
  } else if (!b) retroPol = sinBucket;
  else
    retroPol = `La política de ${x.bucket} todavía tiene una declaración con "Principal": "*" (la «PublicReadGetObject» de la agencia), que deja leer a cualquiera. Bórrala en Permissions → Bucket policy: con OAC, CloudFront tiene su propio permiso.`;

  // 3. La distribución con el bucket (REST) y OAC.
  const d = elegirDistribucion(estado, x);
  const o = d ? origenDelBucket(d, x.bucket) : null;
  const okCdn = Boolean(o && o.tipo === 's3' && o.oacId);
  const todas = estado.cloudfront?.distribuciones ?? [];
  let retroCdn;
  if (okCdn) retroCdn = `Tu distribución ${d.id} lee el bucket con Origin access control: el bucket puede quedarse privado y los visitantes reciben el sitio desde la ubicación de borde más cercana, no desde N. Virginia.`;
  else if (!todas.length) retroCdn = 'Todavía no hay ninguna distribución de CloudFront. Créala en CloudFront → Distributions → Create distribution con tu bucket como origen.';
  else if (!o) retroCdn = `Tus distribuciones usan otros orígenes (${todas.flatMap((x2) => x2.origenes.map((y) => y.dominio)).join(', ')}), no el bucket ${x.bucket}.`;
  else if (o.tipo === 's3-website') {
    retroCdn = `Tu distribución ${d.id} usa el website endpoint (${o.dominio}). Ese endpoint solo funciona si el bucket es público, justo lo que no queremos. Usa el bucket (${x.bucket}.s3.us-east-1.amazonaws.com) con «Origin access control settings».`;
  } else retroCdn = `Tu distribución ${d.id} usa el bucket, pero con Origin access «Public»: así el bucket tendría que ser público. Cambia el origen a «Origin access control settings» (Origins → Edit).`;

  // 4. El objeto raíz.
  const okRaiz = Boolean(d && o && d.objetoRaiz === 'index.html');
  let retroRaiz;
  if (okRaiz) retroRaiz = 'Con Default root object = index.html, quien abre el dominio «pelón» (sin /index.html) recibe la página de inicio.';
  else if (!d || !o) retroRaiz = 'Primero crea la distribución con tu bucket como origen; en sus ajustes va el Default root object.';
  else retroRaiz = `Tu distribución ${d.id} tiene Default root object = «${d.objetoRaiz || '(vacío)'}». Ponle index.html (General → Settings → Edit): si no, abrir el dominio pelón da 403.`;

  // 5. La página abre por CloudFront.
  const r = d && o ? probarPagina(estado, `https://${d.dominio}/`) : null;
  const okAbre = abre(r);
  let retroAbre;
  if (okAbre) {
    // ¿Y directo al bucket? (el website endpoint y el endpoint normal)
    const directo = [probarPagina(estado, `http://${x.bucket}.${ENDPOINT_S3_WEB}/`), probarPagina(estado, `https://${x.bucket}.s3.us-east-1.amazonaws.com/index.html`)].some(abre);
    retroAbre = directo
      ? `https://${d.dominio} abre la página del festival. Pero el bucket TODAVÍA se puede abrir directo (sin pasar por CloudFront): revisa Block public access y la política.`
      : `https://${d.dominio} abre la página del festival, y entrar directo al bucket da Access Denied. Así debe ser: una sola puerta, la de CloudFront.`;
  }
  else if (!d || !o) retroAbre = 'Todavía no hay una distribución que sirva el bucket del sitio.';
  else retroAbre = retroDistribucionAbre(estado, d, r, x);

  return [
    check('privado', `${x.bucket} con Block all public access (las 4 casillas)`, 4, okPriv, retroPriv),
    check('politica', 'La política del bucket ya no deja leer a todo el mundo', 3, okPol, retroPol),
    check('cdn', 'Una distribución de CloudFront con el bucket como origen y Origin access control', 4, okCdn, retroCdn),
    check('raiz', 'Default root object: index.html', 2, okRaiz, retroRaiz),
    check('abre', 'La página del festival abre por el dominio de CloudFront', 3, okAbre, retroAbre)
  ];
}

/* ========================================================== el dominio */

function revisarDominio(estado, x) {
  const zonas = estado.route53?.zonas ?? [];
  const zona = zonas.find((z) => z.nombre === x.dominio && z.tipo === 'publica') ?? null;
  const privada = zonas.find((z) => z.nombre === x.dominio && z.tipo === 'privada');
  let retroZona;
  if (zona) retroZona = `La zona pública ${x.dominio} existe: sus 4 servidores de nombres (NS) son los que contestan por tu dominio en todo internet.`;
  else if (privada) retroZona = `${x.dominio} es una zona PRIVADA: solo contesta dentro de una VPC, y la gente navega desde internet. Crea la zona como «Public hosted zone».`;
  else if (zonas.length) retroZona = `Tus zonas son ${zonas.map((z) => `${z.nombre} (${z.tipo === 'publica' ? 'public' : 'private'})`).join(', ')}; falta la pública ${x.dominio}.`;
  else retroZona = `No hay zonas hospedadas. Crea la zona pública ${x.dominio} en Route 53 → Hosted zones → Create hosted zone.`;

  const dist = elegirDistribucion(estado, x);
  const dominiosCf = new Set((estado.cloudfront?.distribuciones ?? []).map((d) => d.dominio));
  const registros = zona ? zona.registros.filter((r) => r.nombre === x.www) : [];
  const bueno = registros.find((r) => r.tipo === 'A' && r.alias?.tipoDestino === 'cloudfront' && dominiosCf.has(r.alias.destino));
  const okAlias = Boolean(bueno);
  let retroAlias;
  if (okAlias) {
    retroAlias = `${x.www} es un Alias A hacia ${bueno.alias.destino}. Un Alias es cosa de Route 53: no cobra las consultas a recursos de AWS y sigue a la distribución aunque cambien sus IP.`;
    if (dist && bueno.alias.destino !== dist.dominio) retroAlias += ` Ojo: apunta a otra distribución, no a ${dist.dominio}.`;
  } else if (!zona) retroAlias = `Primero crea la zona pública ${x.dominio}; el registro ${x.www} va dentro de ella.`;
  else if (!registros.length) {
    const otros = zona.registros.filter((r) => !r.sistema);
    retroAlias = `La zona no tiene ningún registro ${x.www}${otros.length ? ` (tiene: ${otros.map((r) => `${r.nombre} ${r.tipo}`).join(', ')})` : ''}. Create record → Record name «www», tipo A, Alias → «Alias to CloudFront distribution».`;
  } else {
    const r = registros[0];
    if (r.tipo === 'CNAME') retroAlias = `${x.www} es un CNAME a ${r.valores[0]}. Funcionaría, pero se pidió un Alias: no cobra por consulta y también sirve en el dominio raíz (un CNAME ahí no se permite). Bórralo y crea un A con Alias.`;
    else if (r.alias) retroAlias = `${x.www} es un Alias, pero hacia ${r.alias.tipoDestino === 's3' ? 'un bucket de S3' : r.alias.tipoDestino === 'elb' ? 'un balanceador' : r.alias.destino}. Debe apuntar a tu distribución de CloudFront.`;
    else retroAlias = `${x.www} es un registro ${r.tipo} con valor ${lista(r.valores)}. Las IP de CloudFront cambian todo el tiempo: usa Alias → «Alias to CloudFront distribution».`;
  }

  const r = zona ? probarPagina(estado, `https://${x.www}/`) : null;
  const okAbre = abre(r);
  let retroAbre;
  if (okAbre) retroAbre = `https://${x.www} abre la página del festival: Route 53 traduce el nombre a tu distribución y CloudFront la sirve.`;
  else if (!zona) retroAbre = `Sin la zona ${x.dominio}, nadie sabe a dónde mandar ${x.www}.`;
  else if (!okAlias) retroAbre = `Falta el registro Alias de ${x.www}; sin él, el nombre no lleva a CloudFront.`;
  else {
    const f = primerFallo(r);
    const destino = (estado.cloudfront?.distribuciones ?? []).find((d) => d.dominio === bueno.alias.destino);
    if (f?.paso === 'CloudFront' || (destino && !destino.alias.includes(x.www))) {
      retroAbre = `https://${x.www} contesta 403 de CloudFront: la distribución no tiene ${x.www} en «Alternate domain names (CNAMEs)», y CloudFront rechaza los nombres que no conoce. Agrégalo en tu distribución → General → Settings → Edit.`;
    } else if (destino && !destino.desplegada) retroAbre = `Tu distribución todavía está en Deploying; espera unos segundos y vuelve a revisar.`;
    else retroAbre = `https://${x.www} ${textoPrueba(r)}. Primero haz que abra el dominio d….cloudfront.net (tarea anterior).`;
  }

  return [
    check('zona', `Una zona hospedada pública ${x.dominio}`, 3, Boolean(zona), retroZona),
    check('alias', `${x.www}: registro A con Alias a tu distribución de CloudFront`, 4, okAlias, retroAlias),
    check('abre', `https://${x.www} abre la página del festival`, 3, okAbre, retroAbre)
  ];
}

/* ========================================================== los boletos */

function revisarBoletos(estado, x) {
  const tablas = estado.dynamodb?.tablas ?? [];
  const t = tablaDynamoDe(estado, x.tabla) ?? tablas.find((y) => parecido(y.nombre, x.tabla)) ?? null;
  const exacta = t?.nombre === x.tabla;
  const activa = t && t.estado !== 'CREATING' && t.estado !== 'DELETING';
  let retroT;
  if (exacta && activa) retroT = `La tabla ${x.tabla} está ${t.estado}. DynamoDB es una base NoSQL administrada: no hay servidor que parchar ni disco que crecer.`;
  else if (t && !exacta) retroT = `Tu tabla se llama «${t.nombre}»; se pidió exactamente ${x.tabla}. El nombre no se cambia: crea otra con el nombre correcto.`;
  else if (t) retroT = `La tabla ${x.tabla} está ${t.estado}. Espera unos segundos a que quede ACTIVE.`;
  else retroT = `No existe la tabla ${x.tabla}${tablas.length ? ` (tienes: ${tablas.map((y) => y.nombre).join(', ')})` : ''}. Créala en DynamoDB → Tables → Create table.`;

  const okLlave = Boolean(t && t.pk.nombre === x.pk && t.pk.tipo === 'S' && t.sk?.nombre === x.sk && t.sk.tipo === 'S');
  let retroLlave;
  if (okLlave) retroLlave = `Llave compuesta ${x.pk} + ${x.sk}: cada evento tiene muchos asientos y cada asiento solo puede venderse una vez (la llave no se repite).`;
  else if (!t) retroLlave = 'Primero crea la tabla; la llave se elige al crearla y ya no se puede cambiar.';
  else if (!t.sk) retroLlave = `La tabla solo tiene partition key (${t.pk.nombre}). Sin sort key, cada evento podría guardar UN solo boleto. La llave no se cambia después: crea la tabla de nuevo con ${x.pk} + ${x.sk}.`;
  else retroLlave = `Tu llave es ${t.pk.nombre} (${t.pk.tipo}) + ${t.sk.nombre} (${t.sk.tipo}); se pidió ${x.pk} (String) + ${x.sk} (String). La llave no se puede cambiar: crea la tabla de nuevo.`;

  const okDemanda = Boolean(t && t.modo === 'PAY_PER_REQUEST');
  const retroDemanda = okDemanda
    ? 'On-demand: pagas por cada lectura y escritura, y aguanta el pico del viernes sin que calcules capacidad. Fuera de temporada casi no cuesta.'
    : t
      ? `La tabla está en Provisioned (${t.capacidad.lectura} RCU / ${t.capacidad.escritura} WCU): en la hora pico se quedaría corta y el resto del año pagarías capacidad sin usar. Cámbiala a On-demand (Additional settings → Read/write capacity → Edit).`
      : 'Primero crea la tabla.';

  const indice = t?.indices.find((i) => i.pk.nombre === x.gsiPk && i.pk.tipo === 'S') ?? null;
  const okIndice = Boolean(indice && indice.estado === 'ACTIVE');
  let retroIndice;
  if (okIndice) retroIndice = `El índice ${indice.nombre} usa ${x.gsiPk} como llave: «mis boletos» se contesta con un Query directo, sin leer toda la tabla con Scan.`;
  else if (indice) retroIndice = `El índice ${indice.nombre} todavía se está creando (${indice.estado}). Espera unos segundos.`;
  else if (!t) retroIndice = 'Primero crea la tabla.';
  else if (t.indices.length) retroIndice = `Tus índices (${t.indices.map((i) => `${i.nombre}: ${i.pk.nombre} ${i.pk.tipo}`).join(', ')}) no usan ${x.gsiPk} (String) como partition key.`;
  else retroIndice = `La tabla no tiene índices. Sin un GSI por ${x.gsiPk}, buscar los boletos de alguien obliga a un Scan de toda la tabla. Créalo en la pestaña Indexes → Create index.`;

  // El boleto de prueba y su búsqueda por correo.
  const items = (t?.items ?? []).map(itemDynamoPlano);
  const conCorreo = items.filter((i) => typeof i[x.gsiPk] === 'string');
  let encontrado = null;
  if (okIndice) {
    for (const it of conCorreo) {
      try {
        const q = consultarTabla(estado, t.nombre, { indice: indice.nombre, pk: it[x.gsiPk] });
        if (q.devueltos > 0) {
          encontrado = it;
          break;
        }
      } catch {
        // Un índice a medio crear o un tipo distinto: se explica abajo.
      }
    }
  }
  const okPrueba = Boolean(encontrado);
  let retroPrueba;
  if (okPrueba) retroPrueba = `El boleto ${encontrado[x.pk]} / ${encontrado[x.sk]} se encuentra con un Query al índice por ${x.gsiPk} = ${encontrado[x.gsiPk]}.`;
  else if (!t) retroPrueba = 'Primero crea la tabla.';
  else if (!okIndice) retroPrueba = `Sin un índice ACTIVE por ${x.gsiPk}, no hay forma de buscar el boleto por correo con Query. Primero el índice; luego el boleto de prueba.`;
  else if (!items.length) retroPrueba = `La tabla está vacía. Agrega el boleto de prueba (${x.pk} ${x.evento}, ${x.sk} ${x.asiento}, ${x.gsiPk} ${x.correoPrueba}) en Explore items → Create item.`;
  else if (!conCorreo.length) retroPrueba = `Tus boletos no tienen el atributo ${x.gsiPk} de tipo String (cuidado con mayúsculas: ${x.gsiPk} en minúsculas). Sin él, el índice no los ve.`;
  else retroPrueba = `Tu boleto tiene ${x.gsiPk}, pero el índice todavía no lo puede consultar. Revisa que el índice use ${x.gsiPk} (String) y esté ACTIVE.`;

  return [
    check('tabla', `Existe la tabla ${x.tabla}`, 3, exacta && activa, retroT),
    check('llave', `Llave compuesta: ${x.pk} (String) + ${x.sk} (String)`, 4, okLlave, retroLlave),
    check('demanda', 'Capacidad On-demand', 2, okDemanda, retroDemanda),
    check('indice', `Un índice global (GSI) por ${x.gsiPk}`, 3, okIndice, retroIndice),
    check('prueba', 'Un boleto de prueba que se encuentra por correo con el índice', 2, okPrueba, retroPrueba)
  ];
}

/* =========================================================== los pedidos */

/** La cola de pedidos del alumno: la pedida o, si la hizo FIFO, la .fifo (así un error no arrastra a las demás tareas). */
function colaPedidos(estado, x) {
  return colaPorRef(estado, x.cola) ?? colaPorRef(estado, `${x.cola}.fifo`);
}

function revisarPedidos(estado, x) {
  const colas = estado.sqs?.colas ?? [];
  const exacta = colaPorRef(estado, x.cola);
  const cola = colaPedidos(estado, x);
  const fifo = colas.find((c) => c.nombre === `${x.cola}.fifo`);
  let retroCola;
  if (exacta) retroCola = `La cola ${x.cola} es Standard: aguanta casi cualquier cantidad de pedidos por segundo. La compra se «forma» y nadie pierde su lugar aunque el procesador vaya más lento.`;
  else if (fifo) retroCola = `Creaste ${fifo.nombre}, una cola FIFO: respeta el orden exacto pero tiene un tope de mensajes por segundo, y en la hora pico eso estorba. Se pidió una Standard llamada ${x.cola}.`;
  else retroCola = `No existe la cola ${x.cola}${colas.length ? ` (tienes: ${colas.map((c) => c.nombre).join(', ')})` : ''}. Créala en SQS → Queues → Create queue.`;

  const okCif = Boolean(cola?.cifrado);
  const retroCif = okCif
    ? `La cola cifra los mensajes en reposo con ${cola.cifrado}. Cifrar tus datos es TU parte de la responsabilidad compartida; AWS te da el botón.`
    : cola
      ? 'La cola tiene el cifrado apagado y los pedidos traen nombres y correos. Enciéndelo en Edit → Encryption → Server-side encryption: Enabled.'
      : 'Primero crea la cola.';

  const segundos = x.retencionDias * 86400;
  const okRet = Boolean(cola && cola.retencion === segundos);
  let retroRet;
  if (okRet) retroRet = `Un pedido puede esperar ${x.retencionDias} días en la cola (el máximo de SQS es 14; el de omisión, 4). Si el procesador se cae, los pedidos no se pierden.`;
  else if (!cola) retroRet = 'Primero crea la cola.';
  else {
    const dias = cola.retencion / 86400;
    retroRet = `La retención de tu cola es ${Number.isInteger(dias) ? `${dias} días` : `${cola.retencion} segundos`}; se pidió ${x.retencionDias} días. Cámbiala en Edit → Message retention period.`;
  }

  return [
    check('cola', `Una cola Standard ${x.cola}`, 3, Boolean(exacta), retroCola),
    check('cifrado', 'La cola cifra los mensajes en reposo', 2, okCif, retroCif),
    check('retencion', `Retención de ${x.retencionDias} días`, 3, okRet, retroRet)
  ];
}

/* ===================================================== el procesador */

// Los runtimes vigentes desde los que pidió el equipo: el más nuevo que ofrece la consola también vale.
const RUNTIMES = ['nodejs24.x', 'nodejs22.x', 'python3.14', 'python3.13'];

function revisarProcesar(estado, x) {
  const funciones = estado.lambda?.funciones ?? [];
  const cola = colaPedidos(estado, x);
  const fn = funcionLambda(estado, x.funcion) ?? (cola ? funciones.find((f) => f.mapeos.some((m) => m.fuente === cola.arn)) : null) ?? null;
  const exacta = fn?.nombre === x.funcion;

  const okFn = Boolean(exacta && RUNTIMES.includes(fn.runtime));
  let retroFn;
  if (okFn) retroFn = `${x.funcion} corre en ${runtimeLambda(fn.runtime)?.nombre ?? fn.runtime}. Sin servidores: no hay instancia que prender ni parchar, y solo pagas los milisegundos que corre.`;
  else if (exacta) retroFn = `${x.funcion} usa ${runtimeLambda(fn.runtime)?.nombre ?? fn.runtime}; se pidió Node.js 22.x o Python 3.13 (o uno más nuevo). Los runtimes viejos dejan de recibir parches de seguridad.`;
  else if (fn) retroFn = `Tu función se llama «${fn.nombre}»; se pidió ${x.funcion}. Crea otra con ese nombre (el nombre de una función no se cambia).`;
  else retroFn = `No existe la función ${x.funcion}${funciones.length ? ` (tienes: ${funciones.map((f) => f.nombre).join(', ')})` : ''}. Créala en Lambda → Create function.`;

  const okTimeout = Boolean(fn && fn.timeout >= x.timeout);
  const retroTimeout = okTimeout
    ? `Timeout de ${fn.timeout} s: le da tiempo al banco de contestar (el máximo de Lambda es 15 minutos; si lo subes, sube también el Visibility timeout de la cola, que debe ser igual o mayor).${cola && cola.visibilidad < fn.timeout ? ` Ojo: tu cola tiene Visibility timeout de ${cola.visibilidad} s, menos que la función: Lambda no deja crear el disparador así, y si ya existe, un pedido lento reaparecería en la cola y se cobraría dos veces. Súbelo en SQS → la cola → Edit.` : ''}`
    : fn
      ? `El timeout de ${fn.nombre} es ${fn.timeout} s; se pidieron ${x.timeout}. Con 3 s, un cobro lento se corta a la mitad. Cámbialo en Configuration → General configuration → Edit.`
      : 'Primero crea la función.';

  const mapeo = fn && cola ? fn.mapeos.find((m) => m.fuente === cola.arn) : null;
  const okDisp = Boolean(mapeo?.activo);
  let retroDisp;
  if (okDisp) retroDisp = `Lambda lee ${x.cola} en lotes de hasta ${mapeo.tamanoLote} y borra cada pedido cuando lo procesa bien. Si la función falla, el pedido vuelve a la cola: así se desacopla.`;
  else if (mapeo) retroDisp = `El disparador de ${x.cola} existe pero está deshabilitado (Disabled): los pedidos se quedan en la cola. Habilítalo en Configuration → Triggers.`;
  else if (!fn) retroDisp = 'Primero crea la función.';
  else if (!cola) retroDisp = `Primero crea la cola ${x.cola}; luego agrégala como disparador.`;
  else if (fn.timeout > cola.visibilidad) {
    retroDisp = `${fn.nombre} no tiene un disparador de SQS desde ${x.cola}. Ojo: su timeout (${fn.timeout} s) es mayor que el Visibility timeout de la cola (${cola.visibilidad} s), y así Lambda no te deja conectarlas (el pedido reaparecería en la cola mientras la función lo cobra). Iguala los tiempos y luego «+ Add trigger» → SQS → tu cola.`;
  } else retroDisp = `${fn.nombre} no tiene un disparador de SQS desde ${x.cola}: nadie toma los pedidos. «+ Add trigger» → SQS → tu cola.`;

  const rol = fn ? estado.iam.roles.find((r) => r.nombre === fn.rol) : null;
  const admin = rol ? rol.politicas.filter(ADMIN) : [];
  const okRol = Boolean(rol && !admin.length);
  let retroRol;
  if (okRol) retroRol = `El rol ${rol.nombre} trae solo ${lista(rol.politicas)}: sin permisos de administrador. Si alguien encontrara un error en el código, no podría tocar el resto de la cuenta.`;
  else if (!fn) retroRol = 'Primero crea la función.';
  else if (!rol) retroRol = `El rol de ejecución de ${fn.nombre} (${fn.rol}) ya no existe: la función no puede ni escribir sus logs. Asígnale uno en Configuration → Permissions.`;
  else retroRol = `El rol ${rol.nombre} tiene ${lista(admin)}: la función podría borrar cualquier cosa de la cuenta. Mínimo privilegio: quítala en IAM → Roles → ${rol.nombre} → Permissions.`;

  // ¿Un pedido de la cola sí llegó a la función?
  const porSqs = Boolean(fn?.ultimas?.some((u) => u.origen === 'sqs' && u.ok));
  const okPrueba = Boolean(okDisp && (porSqs || (cola.borrados > 0 && fn.invocaciones > 0)));
  let retroPrueba;
  if (okPrueba) retroPrueba = 'Un pedido de prueba entró a la cola y la función lo procesó y lo borró: la tubería funciona de punta a punta.';
  else if (!okDisp) retroPrueba = 'Primero conecta la cola con la función (el disparador); después manda un pedido de prueba.';
  else if (cola.mensajes.length && (fn.errores ?? 0) > 0) retroPrueba = `Hay ${cola.mensajes.length} pedido(s) en la cola y la función falla al procesarlos (${fn.errores} error(es)): revisa su código en la pestaña Code y su log en Monitor → View CloudWatch logs.`;
  else retroPrueba = `No hay rastro de un pedido procesado. Manda uno en SQS → ${x.cola} → Send and receive messages → Send message y, a los pocos segundos, revisa la pestaña Monitor de ${fn.nombre}.`;

  return [
    check('funcion', `La función ${x.funcion} (Node.js 22.x o Python 3.13, o más nuevos)`, 3, okFn, retroFn),
    check('timeout', `Timeout de ${x.timeout} segundos (o más, si la cola lo aguanta)`, 2, okTimeout, retroTimeout),
    check('disparador', `Un disparador de SQS desde ${x.cola}, habilitado`, 4, okDisp, retroDisp),
    check('rol', 'Su rol no tiene permisos de administrador', 2, okRol, retroRol),
    check('prueba', 'Un pedido de prueba pasó de la cola a la función', 3, okPrueba, retroPrueba)
  ];
}

/* =========================================================== los avisos */

function revisarAvisos(estado, x) {
  const temas = estado.sns?.temas ?? [];
  const tema = temaSns(estado, x.tema) ?? temas.find((t) => parecido(t.nombre, x.tema)) ?? null;
  const okTema = Boolean(tema && tema.nombre === x.tema && tema.tipo === 'Standard');
  let retroTema;
  if (okTema) retroTema = `El tema ${x.tema} reparte cada aviso a todos sus suscriptores a la vez (fan-out): quien publica no necesita saber quién escucha.`;
  else if (tema && tema.tipo !== 'Standard') retroTema = `${tema.nombre} es un tema FIFO: no acepta suscripciones de correo. Crea uno Standard llamado ${x.tema}.`;
  else if (tema) retroTema = `Tu tema se llama «${tema.nombre}»; se pidió exactamente ${x.tema}.`;
  else retroTema = `No existe el tema ${x.tema}${temas.length ? ` (tienes: ${temas.map((t) => t.nombre).join(', ')})` : ''}. Créalo en SNS → Topics → Create topic (Standard).`;

  const subs = tema?.suscripciones ?? [];
  const email = subs.find((s) => s.protocolo === 'email' && normal(s.endpoint) === normal(x.correo));
  const okCorreo = email?.estado === 'Confirmed';
  let retroCorreo;
  if (okCorreo) retroCorreo = `${x.correo} confirmó su suscripción: SNS pide confirmar para que nadie te inscriba a avisos que no pediste.`;
  else if (email) retroCorreo = `La suscripción de ${x.correo} sigue en «Pending confirmation»: SNS no le manda nada hasta que confirme. Abre SNS → Bandeja de correo (simulada), en el menú izquierdo, y dale «Confirm subscription».`;
  else if (!tema) retroCorreo = 'Primero crea el tema.';
  else {
    const otros = subs.filter((s) => s.protocolo === 'email');
    retroCorreo = otros.length
      ? `Tu tema manda correo a ${otros.map((s) => s.endpoint).join(', ')}; se pidió ${x.correo} (revisa que esté bien escrito).`
      : `El tema no tiene suscripción de correo. Create subscription → Protocol: Email → Endpoint: ${x.correo}.`;
  }

  const colaInc = colaPorRef(estado, x.colaIncidentes);
  const subCola = colaInc ? subs.find((s) => s.protocolo === 'sqs' && s.endpoint === colaInc.arn) : null;
  let retroCola;
  if (subCola) retroCola = `${x.colaIncidentes} está suscrita al tema: cada aviso queda en la cola hasta que el sistema de tickets lo lea, aunque esté apagado un rato.`;
  else if (!tema) retroCola = 'Primero crea el tema.';
  else if (!colaInc) retroCola = `No existe la cola ${x.colaIncidentes}. Créala (Standard) y suscríbela al tema.`;
  else retroCola = `${x.colaIncidentes} existe pero no está suscrita a ${tema.nombre}. En SQS → ${x.colaIncidentes} → Subscribe to Amazon SNS topic.`;

  const okPermiso = Boolean(tema && colaInc && colaPermiteServicio(estado, colaInc, { servicio: 'sns.amazonaws.com', fuenteArn: tema.arn }));
  let retroPermiso;
  if (okPermiso) retroPermiso = `La política de ${x.colaIncidentes} deja que ${x.tema} le mande mensajes (sqs:SendMessage con la condición aws:SourceArn del tema). Sin ese permiso, la suscripción existe pero los avisos nunca llegan.`;
  else if (!tema || !colaInc) retroPermiso = `Faltan el tema o la cola ${x.colaIncidentes}.`;
  else retroPermiso = `La política de acceso de ${x.colaIncidentes} no deja que ${tema.nombre} le mande mensajes: SNS lo intentará y fallará. Lo más fácil: SQS → ${x.colaIncidentes} → Subscribe to Amazon SNS topic (agrega el permiso solo), o edita su Access policy.`;

  return [
    check('tema', `Un tema Standard ${x.tema}`, 2, okTema, retroTema),
    check('correo', `Suscripción Email a ${x.correo}, confirmada`, 4, okCorreo, retroCorreo),
    check('cola', `La cola ${x.colaIncidentes} suscrita al tema`, 3, Boolean(subCola), retroCola),
    check('permiso', `La política de ${x.colaIncidentes} deja entrar los mensajes del tema`, 3, okPermiso, retroPermiso)
  ];
}

/* ===================================================== la regla programada */

function revisarProgramado(estado, x) {
  const reglas = estado.eventbridge?.reglas ?? [];
  const cada5 = periodoRegla(x.expresion);
  const evaluar = (r) => {
    const programada = r?.tipo === 'programada';
    const okRegla = Boolean(programada && r.estado === 'ENABLED');
    const okCada = Boolean(programada && periodoRegla(r.expresion) === cada5);
    const lambdas = (r?.destinos ?? []).filter((d) => d.tipo === 'lambda');
    const viva = lambdas.find((d) => funcionLambda(estado, d.arn));
    let retroRegla;
    if (okRegla) retroRegla = `La regla ${r.nombre} es programada y está habilitada: nadie tiene que acordarse de correr la limpieza.`;
    else if (!r) retroRegla = `No hay reglas en EventBridge. Crea ${x.regla} en EventBridge → Rules → Create rule (Rule type: Schedule).`;
    else if (!programada) retroRegla = `${r.nombre} es una regla con patrón de eventos (reacciona a algo que pasa); se pidió una de tipo Schedule (corre sola cada cierto tiempo).`;
    else retroRegla = `${r.nombre} está deshabilitada (DISABLED): no corre. Actívala con Enable.`;
    let retroCada;
    if (okCada) retroCada = `${r.expresion}: cada 5 minutos (en el simulador, cada 50 segundos reales).`;
    else if (!r || !programada) retroCada = `Se pidió una regla programada con ${x.expresion}.`;
    else retroCada = `Tu regla corre con «${r.expresion}»; se pidió cada 5 minutos (${x.expresion}).`;
    let retroDestino;
    if (viva) retroDestino = `Su destino es la función ${funcionLambda(estado, viva.arn).nombre}: cada disparo la invoca con un evento «Scheduled Event».`;
    else if (!r) retroDestino = 'Primero crea la regla.';
    else if (lambdas.length) retroDestino = `Tu regla apunta a ${lambdas.map((d) => d.arn.split(':').pop()).join(', ')}, que ya no existe. Elige una función que exista.`;
    else retroDestino = `${r.nombre} no tiene una función Lambda como destino${r.destinos.length ? ` (apunta a ${r.destinos.map((d) => d.tipo.toUpperCase()).join(', ')})` : ''}. Agrégala en Edit → Select target(s) → Lambda function.`;
    return [
      check('regla', 'Una regla de EventBridge tipo Schedule, habilitada', 3, okRegla, retroRegla),
      check('cada', `Corre ${x.expresion}`, 3, okCada, retroCada),
      check('destino', 'Su destino es una función Lambda', 4, Boolean(viva), retroDestino)
    ];
  };
  const elegida = mejor(
    [...reglas].sort((a, b) => (b.nombre === x.regla) - (a.nombre === x.regla)),
    evaluar
  );
  return elegida ? elegida.checks : evaluar(null);
}

/* ============================================================ la alarma */

/** Cómo escribe la consola cada comparación (Conditions → Whenever … is…). */
const COMPARACION = {
  GreaterThanThreshold: 'Greater >',
  GreaterThanOrEqualToThreshold: 'Greater/Equal >=',
  LessThanThreshold: 'Lower <',
  LessThanOrEqualToThreshold: 'Lower/Equal <='
};

function revisarAlarma(estado, x) {
  const alarmas = (estado.cloudwatch?.alarmas ?? []).filter((a) => !a.creadaPor);
  const nombreCola = colaPedidos(estado, x)?.nombre ?? x.cola;
  const evaluar = (a) => {
    const m = a?.metrica;
    const okMetrica = Boolean(m && m.namespace === 'AWS/SQS' && m.nombre === x.metrica && m.dimensiones?.QueueName === nombreCola);
    let retroMetrica;
    if (okMetrica) retroMetrica = `${a.nombre} vigila ${x.metrica} de ${nombreCola}: cuántos pedidos esperan su turno.`;
    else if (!a) retroMetrica = `No hay alarmas en CloudWatch. Crea ${x.alarma} sobre ${x.metrica} de ${x.cola}.`;
    else if (m.namespace !== 'AWS/SQS') retroMetrica = `${a.nombre} vigila ${m.namespace} ${m.nombre}; se pidió la métrica de la cola (AWS/SQS ${x.metrica}).`;
    else if (m.dimensiones?.QueueName !== nombreCola) retroMetrica = `${a.nombre} vigila la cola ${m.dimensiones?.QueueName ?? '(ninguna)'}; se pidió ${nombreCola}.`;
    else retroMetrica = `${a.nombre} vigila ${m.nombre}; se pidió ${x.metrica} (los mensajes visibles, es decir, los que esperan).`;

    const okUmbral = Boolean(a && ((a.comparacion === 'GreaterThanThreshold' && a.umbral === x.umbral) || (a.comparacion === 'GreaterThanOrEqualToThreshold' && (a.umbral === x.umbral || a.umbral === x.umbral + 1))));
    let retroUmbral;
    if (okUmbral) retroUmbral = `Se dispara con más de ${x.umbral} pedidos esperando: suficiente para no despertar al equipo por un rato normal, y a tiempo para actuar.`;
    else if (!a) retroUmbral = 'Primero crea la alarma.';
    else retroUmbral = `Tu condición es ${COMPARACION[a.comparacion] ?? a.comparacion} ${a.umbral}; se pidió Greater > ${x.umbral}. Cámbiala en Actions → Edit.`;

    const temasAlarma = (a?.acciones?.ALARM ?? []).filter((arn) => /^arn:aws:sns:/.test(arn)).map((arn) => temaSns(estado, arn)).filter(Boolean);
    const okAccion = temasAlarma.length > 0;
    let retroAccion;
    if (okAccion) retroAccion = `En «In alarm», la alarma publica en ${temasAlarma.map((t) => t.nombre).join(', ')}: CloudWatch detecta y SNS avisa.`;
    else if (!a) retroAccion = 'Primero crea la alarma.';
    else if ((a.acciones?.ALARM ?? []).length) retroAccion = `La acción de «In alarm» apunta a ${a.acciones.ALARM.join(', ')}, que no es un tema de SNS que exista.`;
    else retroAccion = `${a.nombre} no tiene acción en «In alarm»: se pondría roja y nadie se enteraría. Actions → Edit → Configure actions → Notification → ${x.tema}.`;

    const conCorreo = temasAlarma.find((t) => t.suscripciones.some((s) => s.protocolo === 'email' && s.estado === 'Confirmed'));
    const okLlega = Boolean(conCorreo && a.accionesActivas !== false);
    let retroLlega;
    if (okLlega) retroLlega = `${conCorreo.nombre} tiene un correo confirmado: el aviso sí le llega a una persona.`;
    else if (!okAccion) retroLlega = 'Primero conecta la alarma a un tema de SNS.';
    else if (a.accionesActivas === false) retroLlega = `Las acciones de ${a.nombre} están desactivadas (Actions → Enable actions): no avisaría a nadie.`;
    else retroLlega = `${temasAlarma.map((t) => t.nombre).join(', ')} no tiene ningún correo confirmado: el aviso no le llegaría a nadie. Confirma la suscripción en SNS → Bandeja de correo (simulada).`;

    return [
      check('metrica', `Una alarma sobre los mensajes que esperan en ${x.cola}`, 5, okMetrica, retroMetrica),
      check('umbral', `Se dispara con más de ${x.umbral} mensajes`, 4, okUmbral, retroUmbral),
      check('accion', 'En In alarm avisa a un tema de SNS', 4, okAccion, retroAccion),
      check('llega', 'Ese tema tiene un correo confirmado', 3, okLlega, retroLlega)
    ];
  };
  const elegida = mejor(
    [...alarmas].sort((a, b) => (b.nombre === x.alarma) - (a.nombre === x.alarma)),
    evaluar
  );
  return elegida ? elegida.checks : evaluar(null);
}

/* ==================================================== bono: la DLQ */

function revisarDlq(estado, x) {
  const cola = colaPedidos(estado, x);
  const dlq = cola?.dlq ? colaPorRef(estado, cola.dlq.arn) : null;
  const okDlq = Boolean(dlq);
  let retroDlq;
  if (okDlq) retroDlq = `${x.cola} manda a ${dlq.nombre} los pedidos que fallan una y otra vez: no se pierden ni atoran a los demás, y alguien los revisa a mano.`;
  else if (!cola) retroDlq = `Es el bono opcional: primero necesitas la cola ${x.cola}. No hacerlo no te quita puntos.`;
  else if (cola.dlq) retroDlq = `La Dead-letter queue de ${x.cola} apunta a una cola que ya no existe.`;
  else retroDlq = `Es el bono opcional: ${x.cola} no tiene Dead-letter queue. Si la configuras (${x.dlq}), suma puntos extra sin pasar de 100.`;

  const n = cola?.dlq?.maxRecepciones;
  const okN = Boolean(okDlq && n >= 1 && n <= 5);
  let retroN;
  if (okN) retroN = `Maximum receives = ${n}: tras ${n} intento(s) fallido(s), el pedido se aparta.`;
  else if (!okDlq) retroN = `Parte del bono opcional: Maximum receives = ${x.intentos}.`;
  else retroN = `Maximum receives = ${n}: un pedido malo se reintentaría demasiadas veces antes de apartarse. Se pidió ${x.intentos}.`;

  return [check('dlq', `${x.cola} con Dead-letter queue`, 4, okDlq, retroDlq), check('intentos', `Maximum receives = ${x.intentos}`, 2, okN, retroN)];
}

/* ============================================================== revisar */

export function revisar(estadoOriginal, datos) {
  const estado = preparar(estadoOriginal);
  const x = datosLab(datos);
  return armar(LAB.tareas(datos), {
    sitio: revisarSitio(estado, x),
    dominio: revisarDominio(estado, x),
    boletos: revisarBoletos(estado, x),
    pedidos: revisarPedidos(estado, x),
    procesar: revisarProcesar(estado, x),
    avisos: revisarAvisos(estado, x),
    programado: revisarProgramado(estado, x),
    alarma: revisarAlarma(estado, x),
    dlq: revisarDlq(estado, x)
  });
}

/* ============================================================= solución */

export function solucion(datos) {
  const x = datosLab(datos);
  const e = LAB.estadoInicial(datos);
  const t0 = reloj.ahora();

  // El sitio: la política de la agencia fuera, el bucket privado y CloudFront con OAC.
  editarPolitica(e, x.bucket, '');
  editarBloqueoPublico(e, x.bucket, { aclsNuevas: true, aclsCualquiera: true, politicasNuevas: true, politicasCualquiera: true });
  const dist = crearDistribucion(e, { nombre: x.distribucion, origen: { tipo: 's3', recurso: x.bucket, acceso: 'oac' }, objetoRaiz: 'index.html', alias: [x.www] });

  // El dominio.
  const zona = crearZonaHospedada(e, { nombre: x.dominio, tipo: 'publica' });
  crearRegistroDns(e, zona.id, { nombre: x.www, tipo: 'A', alias: { tipoDestino: 'cloudfront', destino: dist.dominio } });

  // Los boletos.
  crearTablaDynamo(e, {
    nombre: x.tabla,
    pk: { nombre: x.pk, tipo: 'S' },
    sk: { nombre: x.sk, tipo: 'S' },
    modo: 'PAY_PER_REQUEST',
    indices: [{ nombre: x.gsi, pk: { nombre: x.gsiPk, tipo: 'S' }, proyeccion: 'ALL' }]
  });
  avanzar(e, t0 + 5000);
  ponerItemDynamo(e, x.tabla, { [x.pk]: { S: x.evento }, [x.sk]: { S: x.asiento }, [x.gsiPk]: { S: x.correoPrueba } });

  // Los pedidos (con la DLQ del bono).
  const dlq = crearCola(e, { nombre: x.dlq });
  const cola = crearCola(e, { nombre: x.cola, retencion: x.retencionDias * 86400, dlq: { arn: dlq.arn, maxRecepciones: x.intentos } });

  // El procesador.
  crearFuncion(e, { nombre: x.funcion, runtime: 'nodejs22.x' });
  editarConfiguracionLambda(e, x.funcion, { timeout: x.timeout });
  adjuntarPoliticasRol(e, funcionLambda(e, x.funcion).rol, ['AWSLambdaSQSQueueExecutionRole']);
  agregarDisparador(e, x.funcion, { tipo: 'sqs', colaArn: cola.arn });
  enviarMensaje(e, cola.arn, { cuerpo: JSON.stringify({ evento: x.evento, asiento: x.asiento }) });

  // Los avisos.
  const tema = crearTema(e, { nombre: x.tema });
  const sub = crearSuscripcion(e, { temaArn: tema.arn, protocolo: 'email', endpoint: x.correo });
  confirmarSuscripcion(e, sub.arn);
  const incidentes = crearCola(e, { nombre: x.colaIncidentes });
  suscribirColaATema(e, incidentes.arn, tema.arn);

  // La regla programada.
  const limpia = crearFuncion(e, { nombre: x.funcionApartados, runtime: 'python3.13' });
  crearRegla(e, { nombre: x.regla, tipo: 'programada', expresion: x.expresion, destinos: [{ arn: limpia.arn }] });

  // La alarma.
  crearAlarma(e, {
    nombre: x.alarma,
    metrica: { namespace: 'AWS/SQS', metrica: x.metrica, dimensiones: { QueueName: x.cola } },
    estadistica: 'Maximum',
    periodo: 60,
    comparacion: 'GreaterThanThreshold',
    umbral: x.umbral,
    acciones: { ALARM: [tema.arn] }
  });

  // CloudFront termina de desplegarse y la Lambda toma el pedido de la cola.
  avanzar(e, t0 + 60_000);
  return e;
}
