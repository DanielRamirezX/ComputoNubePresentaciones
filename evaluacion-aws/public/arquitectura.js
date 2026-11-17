// El diagrama de arquitectura de un laboratorio (SIMULADOR.md §6.6).
//
// Cada laboratorio que lo tiene exporta `LAB.arquitectura(datos)`: piezas
// (contenedores y nodos) colocadas en una cuadrícula y flechas entre ellas.
// Algunas piezas y flechas traen `hecho(cuenta)`, que dice si eso ya se ve en
// la cuenta del alumno. Este archivo:
//
//   validarArquitectura(arq)               → [problemas]   (vacía si está bien)
//   estadosDe(arq, cuenta, revision)       → { id: 'falta' | 'creado' | 'pendiente' | 'listo' | null }
//   resumenDe(arq, estados)                → { total, hechas, listas }   (sin las de bono)
//   piezasDe(arq)                          → la lista plana de lo que tiene estado (para la lista en texto)
//   svgArquitectura(arq, estados, opciones) → el SVG como texto, autosuficiente
//
// Además: TIPOS (el catálogo de contenedores y nodos), CATEGORIAS, ESTADOS (sus
// textos), CELDA (el tamaño de la celda en px) y marcaSvg(estado) (la marca de
// cada estado, para la leyenda).
//
// PURO: nada de window ni document, y no importa nada (ni la consola). Lo
// importan el navegador (el modal) y Node (la vista previa y `npm run
// verificar`). La medida del texto es una estimación determinista, la misma en
// los dos lados: así lo que valida Node es lo que se dibuja.

/* ============================================================ medidas */

/** Una celda de la cuadrícula, en px del viewBox. El SVG escala al ancho disponible. */
export const CELDA = Object.freeze({ ancho: 120, alto: 104 });

const ICONO = 40; // el cuadro de color de un nodo
const ICONO_ARRIBA = 8; // del borde de la celda al ícono
const ETQ_PX = 12; // etiqueta de nodo y de contenedor (negritas)
const DET_PX = 10.5; // detalle (monoespaciada)
const FLECHA_PX = 11; // texto de una flecha
const MAX_ETQ = CELDA.ancho - 8; // ancho máximo de un renglón de la etiqueta de un nodo
const MAX_DET = CELDA.ancho - 4; // ancho máximo del detalle de un nodo
const MAX_TEXTO_FLECHA = 130; // ancho máximo del texto de una flecha
const FRANJA = 0.3; // celdas libres arriba de un contenedor para su etiqueta (se recomienda 0.35)
const MARGEN_HIJO = 0.12; // un contenedor hijo va al menos así de adentro de su padre
const ESCALA_MINIMA = 0.8; // el SVG no se encoge a menos de 80 % (min-width); por debajo, el modal lo desplaza de lado

/* ========================================================= catálogo */

/** Las categorías: el color del cuadro de cada nodo (los de la consola, `CATEGORIAS` de consola/ui.js). */
export const CATEGORIAS = Object.freeze({
  externo: { nombre: 'Fuera de AWS', color: '#5f6b7a' },
  redes: { nombre: 'Redes', color: '#8c4fff' },
  computo: { nombre: 'Cómputo', color: '#ed7100' },
  almacenamiento: { nombre: 'Almacenamiento', color: '#7aa116' },
  bases: { nombre: 'Bases de datos', color: '#c925d1' },
  integracion: { nombre: 'Integración', color: '#e7157b' },
  gestion: { nombre: 'Gestión y gobierno', color: '#e7157b' },
  seguridad: { nombre: 'Seguridad', color: '#dd344c' },
  costos: { nombre: 'Costos', color: '#3f8624' },
  general: { nombre: 'General', color: '#5f6b7a' }
});

// Glifos propios (sin logotipos de AWS), en un cuadro de 24 × 24, trazo blanco.
const DOC = '<path d="M6 3.5h8.5l4 4v13H6z"/><path d="M14.5 3.5v4h4"/>';
const CILINDRO = '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/>';
const PERSONA = '<circle cx="12" cy="8" r="3.5"/><path d="M5 20.5c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>';
const DOS_PERSONAS = '<circle cx="9" cy="8.5" r="3"/><path d="M3 19.5c0-3.3 2.6-5.6 6-5.6s6 2.3 6 5.6"/><circle cx="16.5" cy="7.5" r="2.5"/><path d="M16 12.4c3 .1 5 2.3 5 5.4"/>';
const CARPETA = '<path d="M3.5 6.5h6l2 2h9v11h-17z"/>';

const GLIFOS = {
  // fuera de AWS
  usuarios: DOS_PERSONAS,
  persona: PERSONA,
  internet: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.6 3.6 5.4 3.6 8.5s-1.2 5.9-3.6 8.5c-2.4-2.6-3.6-5.4-3.6-8.5s1.2-5.9 3.6-8.5z"/>',
  correo: '<rect x="3" y="6" width="18" height="12.5" rx="1.5"/><path d="M3.5 7l8.5 6.5L20.5 7"/>',
  oficina: '<path d="M5 20.5v-16h9v16M14 9.5h5v11M3 20.5h18M8 8h3M8 11.5h3M8 15h3M16.5 13h0M16.5 16h0"/>',
  // redes
  igw: '<path d="M4 20.5V10l8-6 8 6v10.5"/><path d="M8.5 20.5v-6.5h7v6.5M12 7.5v3"/>',
  nat: '<path d="M3.5 7H10l3.5 5-3.5 5H3.5M13.5 12h7M18 9.5l2.5 2.5-2.5 2.5"/>',
  alb: '<circle cx="5.5" cy="12" r="2.5"/><path d="M8 12h3.5M11.5 12l6.5-6M11.5 12h7M11.5 12l6.5 6"/><circle cx="19.5" cy="5" r="1.2"/><circle cx="20.3" cy="12" r="1.2"/><circle cx="19.5" cy="19" r="1.2"/>',
  'grupo-destino': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  rutas: '<path d="M12 3v18M12 5h6.5l2 2.2-2 2.3H12M12 11.5H5.5l-2 2.2 2 2.3H12M8.5 21h7"/>',
  sg: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 9.7h17M3.5 14.3h17M9 5v4.7M15 5v4.7M12 9.7v4.6M7 14.3V19M17 14.3V19"/>',
  eip: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><path d="M9.5 7v5.5M12.5 12.5V7h1.5a1.6 1.6 0 0 1 0 3.2h-1.5"/>',
  cloudfront: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.8"/><path d="M12 3.5v5.7M12 14.8v5.7M3.5 12h5.7M14.8 12h5.7"/>',
  route53: '<circle cx="12" cy="12" r="8.5"/><path d="M15.8 8.2 13.5 13.5 8.2 15.8 10.5 10.5z"/>',
  // cómputo
  ec2: '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9h3.5M2.5 15h3.5M18 9h3.5M18 15h3.5"/>',
  plantilla: `${DOC}<path d="M9 11.5h6.5M9 14.5h6.5M9 17.5h4"/>`,
  asg: '<rect x="8" y="8" width="8" height="8" rx="1"/><path d="M3.5 8V3.5H8M16 3.5h4.5V8M20.5 16v4.5H16M8 20.5H3.5V16"/>',
  lambda: '<path d="M5.5 20.5 11.5 9.5M7.5 3.5h3.5l7.5 17h-1.5"/>',
  // almacenamiento
  s3: '<path d="M4 6.5h16l-2 13.3c-.2 1.1-2.7 1.7-6 1.7s-5.8-.6-6-1.7z"/><ellipse cx="12" cy="6.5" rx="8" ry="2.6"/>',
  ebs: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1"/>',
  snapshot: '<path d="M3.5 8.5h4L9 6h6l1.5 2.5h4v11h-17z"/><circle cx="12" cy="13.5" r="3.5"/>',
  efs: `${CARPETA}<path d="M8 14h8M12 11.5v5"/>`,
  glacier: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
  // bases
  rds: `${CILINDRO}<path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>`,
  'rds-espera': `<g stroke-dasharray="2.6 2.2">${CILINDRO}</g><path d="M10 10.5v5M14 10.5v5"/>`,
  dynamodb: `${CILINDRO}<path d="M13 9.5 10 14h4l-3 4.5"/>`,
  elasticache: '<rect x="3.5" y="7" width="17" height="10" rx="1.5"/><path d="M7.5 7v10M12 7v10M16.5 7v10M6 4.5V7M18 4.5V7M6 17v2.5M18 17v2.5"/>',
  // integración
  sns: '<path d="M4 9.5v5h3l8.5 4.5V5L7 9.5z"/><path d="M18.5 9a4 4 0 0 1 0 6"/>',
  sqs: '<rect x="3" y="7.5" width="18" height="9" rx="1.5"/><path d="M8 7.5v9M12 7.5v9M16 7.5v9"/>',
  eventbridge: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  // gestión
  cloudwatch: '<path d="M3.5 16.5a8.5 8.5 0 0 1 17 0M12 16.5l4-5M3.5 20h17"/>',
  cloudtrail: '<path d="M4 18c3 0 4-3 6-6s3-6 6-6h4"/><circle cx="4" cy="18" r="1.6"/><circle cx="20" cy="6" r="1.6"/><path d="M8 20.5h0M12 19h0M16 15.5h0"/>',
  organizations: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
  ou: `${CARPETA}<path d="M3.5 10.5h17"/>`,
  cuenta: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.6 1.6-2.5 3-2.5s2.5.9 3 2.5M14.5 10h3.5M14.5 13h3.5"/>',
  scp: `${DOC}<circle cx="12" cy="14" r="3.5"/><path d="M9.6 16.4l4.8-4.8"/>`,
  'trusted-advisor': '<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
  'well-architected': '<path d="M3.5 8 12 3.5 20.5 8zM5.5 10.5v7.5M9.8 10.5v7.5M14.2 10.5v7.5M18.5 10.5v7.5M3.5 20.5h17"/>',
  soporte: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M6 6l3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5"/>',
  // seguridad
  'iam-usuario': PERSONA,
  'iam-grupo': DOS_PERSONAS,
  'iam-rol': '<path d="M4 16.5h16M5.5 16.5a6.5 6.5 0 0 1 13 0M12 6v4M8 20h8"/>',
  politica: `${DOC}<path d="M9 14l2 2 4-4"/>`,
  mfa: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 10h4M10 13.5h4M11.5 18h1"/>',
  kms: '<circle cx="8" cy="12" r="4"/><path d="M12 12h8.5M17 12v3M20 12v2.5"/>',
  secreto: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5"/>',
  // costos
  presupuesto: '<rect x="3.5" y="7" width="17" height="12" rx="2"/><path d="M15 11h5.5v4H15a2 2 0 0 1 0-4zM6 7l8.5-3 1.2 3"/>',
  etiqueta: '<path d="M3.5 12V4.5H11l9.5 9.5-7 7z"/><circle cx="8" cy="9" r="1.5"/>',
  calculadora: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8.5 11.5h0M12 11.5h0M15.5 11.5h0M8.5 15h0M12 15h0M15.5 15h0M8.5 18h0M12 18h0M15.5 18h0"/>',
  'cost-explorer': '<path d="M4 20.5h16M7 17v-5M11 17V9M15 17v-4"/><circle cx="17.5" cy="6.5" r="2.5"/><path d="M19.3 8.3l1.5 1.5"/>',
  // general
  generico: '<path d="M12 3.5 20 8v8l-8 4.5L4 16V8z"/><path d="M4 8l8 4.5L20 8M12 12.5v8"/>'
};

const CONTENEDORES = {
  nube: 'Región de AWS',
  vpc: 'VPC',
  az: 'Zona de disponibilidad',
  'subred-publica': 'Subred pública',
  'subred-privada': 'Subred privada',
  grupo: 'Agrupación'
};

const NODOS = {
  externo: { usuarios: 'Usuarios', internet: 'Internet', correo: 'Correo', oficina: 'Oficina', persona: 'Persona' },
  redes: {
    igw: 'Internet Gateway',
    nat: 'NAT Gateway',
    alb: 'Balanceador (ALB)',
    'grupo-destino': 'Grupo de destino',
    rutas: 'Tabla de rutas',
    sg: 'Grupo de seguridad',
    eip: 'IP elástica',
    cloudfront: 'CloudFront',
    route53: 'Route 53'
  },
  computo: { ec2: 'Instancia EC2', plantilla: 'Plantilla de lanzamiento', asg: 'Auto Scaling', lambda: 'Lambda' },
  almacenamiento: { s3: 'Bucket de S3', ebs: 'Volumen EBS', snapshot: 'Snapshot', efs: 'EFS', glacier: 'Glacier' },
  bases: { rds: 'RDS', 'rds-espera': 'RDS en espera (Multi-AZ)', dynamodb: 'DynamoDB', elasticache: 'ElastiCache' },
  integracion: { sns: 'SNS', sqs: 'SQS', eventbridge: 'EventBridge' },
  gestion: {
    cloudwatch: 'CloudWatch',
    cloudtrail: 'CloudTrail',
    organizations: 'Organizations',
    ou: 'Unidad organizativa',
    cuenta: 'Cuenta de AWS',
    scp: 'SCP',
    'trusted-advisor': 'Trusted Advisor',
    'well-architected': 'Well-Architected',
    soporte: 'Plan de soporte'
  },
  seguridad: { 'iam-usuario': 'Usuario de IAM', 'iam-grupo': 'Grupo de IAM', 'iam-rol': 'Rol de IAM', politica: 'Política', mfa: 'MFA', kms: 'Llave de KMS', secreto: 'Secreto' },
  costos: { presupuesto: 'Presupuesto', etiqueta: 'Etiqueta de costos', calculadora: 'Calculadora de precios', 'cost-explorer': 'Cost Explorer' },
  general: { generico: 'Recurso' }
};

/**
 * El catálogo: TIPOS[tipo] = { clase: 'contenedor' | 'nodo', nombre, categoria?, color?, glifo? }.
 * Un tipo que no está aquí es un error de validación.
 */
export const TIPOS = Object.freeze(
  Object.fromEntries([
    ...Object.entries(CONTENEDORES).map(([tipo, nombre]) => [tipo, Object.freeze({ clase: 'contenedor', nombre })]),
    ...Object.entries(NODOS).flatMap(([categoria, tipos]) =>
      Object.entries(tipos).map(([tipo, nombre]) => [tipo, Object.freeze({ clase: 'nodo', nombre, categoria, color: CATEGORIAS[categoria].color, glifo: GLIFOS[tipo] })])
    )
  ])
);

/** Los estados y cómo se le dicen al alumno. */
export const ESTADOS = Object.freeze({
  falta: { nombre: 'Falta', ayuda: 'Todavía no se ve en tu cuenta.' },
  creado: { nombre: 'Hecho, sin revisar', ayuda: 'Ya está en tu cuenta. Que exista no quiere decir que esté bien: revisa tu avance.' },
  pendiente: { nombre: 'Le falta algo', ayuda: 'Ya está en tu cuenta, pero la revisión encontró algo por corregir.' },
  listo: { nombre: 'Listo', ayuda: 'Está en tu cuenta y la revisión dice que está bien.' }
});

/* =========================================================== textos */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// eslint-disable-next-line no-control-regex
const esc = (t) => String(t ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
const n = (v) => String(Math.round(v * 10) / 10);

/** Ancho estimado de un texto en px (la misma estimación en Node y en el navegador). */
export function anchoTexto(texto, px, { negrita = false, mono = false } = {}) {
  const t = String(texto ?? '');
  if (mono) return [...t].length * px * 0.56;
  let em = 0;
  for (const c of t) {
    if (c === ' ') em += 0.28;
    else if ("iljtfrI.,:;|!'`()[]·".includes(c)) em += 0.31;
    else if ('mwMW@%'.includes(c)) em += 0.86;
    else if (c >= '0' && c <= '9') em += 0.56;
    else if (c !== c.toLowerCase()) em += 0.66;
    else em += 0.54;
  }
  return em * px * (negrita ? 1.07 : 1);
}

/** Recorta un texto con «…» para que quepa en `max` px. */
function recortar(texto, max, opciones) {
  const t = String(texto ?? '');
  if (anchoTexto(t, opciones.px, opciones) <= max) return { texto: t, cortado: false };
  const letras = [...t];
  while (letras.length && anchoTexto(`${letras.join('')}…`, opciones.px, opciones) > max) letras.pop();
  return { texto: `${letras.join('').trimEnd()}…`, cortado: true };
}

/** Parte una etiqueta por palabras en dos renglones como máximo. */
function partir(texto, max, px) {
  const op = { px, negrita: true };
  const palabras = String(texto ?? '').trim().split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  let cortada = false;
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (anchoTexto(prueba, px, op) <= max) actual = prueba;
    else {
      if (actual) lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  const salida = lineas.slice(0, 2).map((l) => {
    const r = recortar(l, max, op);
    if (r.cortado) cortada = true;
    return r.texto;
  });
  if (lineas.length > 2) {
    cortada = true;
    salida[1] = recortar(`${lineas.slice(1).join(' ')}`, max, op).texto;
  }
  return { lineas: salida.length ? salida : [''], cortada };
}

/* ========================================================== piezas */

const idFlecha = (f) => (f.id ? String(f.id) : `${f.de}>${f.a}`);
const esContenedor = (p) => TIPOS[p?.tipo]?.clase === 'contenedor';
const listaPiezas = (arq) => (Array.isArray(arq?.piezas) ? arq.piezas.filter((p) => p && typeof p === 'object') : []);
const listaFlechas = (arq) => (Array.isArray(arq?.flechas) ? arq.flechas.filter((f) => f && typeof f === 'object') : []);

/** Todo lo que tiene estado posible (piezas y flechas con `hecho`), en el orden en que se declaró. */
export function piezasDe(arq) {
  const piezas = listaPiezas(arq);
  const porId = new Map(piezas.map((p) => [p.id, p]));
  const nombre = (id) => porId.get(id)?.etiqueta ?? id;
  return [
    ...piezas.filter((p) => typeof p.hecho === 'function').map((p) => ({
      id: String(p.id),
      clase: 'pieza',
      tipo: p.tipo,
      etiqueta: String(p.etiqueta ?? ''),
      detalle: p.detalle == null ? '' : String(p.detalle),
      tarea: p.tarea,
      checks: Array.isArray(p.checks) ? [...p.checks] : [],
      bono: p.bono === true
    })),
    ...listaFlechas(arq)
      .filter((f) => typeof f.hecho === 'function')
      .map((f) => ({
        id: idFlecha(f),
        clase: 'flecha',
        tipo: f.tipo === 'apoyo' ? 'apoyo' : 'flujo',
        etiqueta: `${nombre(f.de)} → ${nombre(f.a)}`,
        detalle: f.texto == null ? '' : String(f.texto),
        tarea: f.tarea,
        checks: Array.isArray(f.checks) ? [...f.checks] : [],
        bono: f.bono === true
      }))
  ];
}

/* ========================================================== estados */

/** ¿Ya se ve en la cuenta? `hecho` nunca truena el diagrama: si lanza, cuenta como falso. */
function seVe(pieza, cuenta) {
  try {
    return Boolean(pieza.hecho(cuenta));
  } catch {
    return false;
  }
}

/**
 * El estado de cada pieza y flecha (SIMULADOR.md §6.6, «Los estados»):
 *
 * |                | sin revisión | con la revisión de la rúbrica                               |
 * | hecho es falso | falta        | falta (o listo si la tarea completa ya está bien)           |
 * | hecho es cierto| creado       | listo si sus checks están bien; si no, pendiente            |
 *
 * Una pieza o flecha sin `hecho` da null (decorativa; el dibujo resuelve si la
 * flecha se enciende). `revision` es lo que responde api/practica/revisar:
 * { tareas: [{ id, checks: [{ id, ok }] }] }. Una tarea que no venga en la
 * revisión se trata como sin revisión.
 */
export function estadosDe(arq, cuenta, revision = null) {
  const tareas = revision?.tareas ?? revision?.resultado?.tareas ?? null;
  const porTarea = new Map((Array.isArray(tareas) ? tareas : []).map((t) => [t?.id, t]));
  const estados = {};
  const decidir = (p) => {
    if (typeof p.hecho !== 'function') return null;
    const hecho = seVe(p, cuenta);
    const t = porTarea.get(p.tarea);
    if (!t) return hecho ? 'creado' : 'falta';
    const checks = Array.isArray(t.checks) ? t.checks : [];
    if (!hecho) return checks.length && checks.every((c) => c?.ok === true) ? 'listo' : 'falta';
    const propios = Array.isArray(p.checks) && p.checks.length ? checks.filter((c) => p.checks.includes(c?.id)) : checks;
    return propios.length && propios.every((c) => c?.ok === true) ? 'listo' : 'pendiente';
  };
  for (const p of listaPiezas(arq)) estados[p.id] = decidir(p);
  for (const f of listaFlechas(arq)) estados[idFlecha(f)] = decidir(f);
  return estados;
}

/** { total, hechas, listas } de las piezas y flechas con `hecho` que no son bono. */
export function resumenDe(arq, estados = {}) {
  const cuentan = piezasDe(arq).filter((p) => !p.bono);
  return {
    total: cuentan.length,
    hechas: cuentan.filter((p) => estados[p.id] && estados[p.id] !== 'falta').length,
    listas: cuentan.filter((p) => estados[p.id] === 'listo').length
  };
}

/* ========================================================= geometría */

const W = CELDA.ancho;
const H = CELDA.alto;

/** La etiqueta de un contenedor: negritas + detalle monoespaciado, en un renglón. */
function etiquetaContenedor(p, x, y, w, conMarca) {
  const izq = x + 10 + (conMarca ? 17 : 0);
  const disponible = Math.max(10, x + w - 10 - izq);
  const etq = recortar(p.etiqueta, disponible, { px: ETQ_PX, negrita: true });
  const anchoEtq = anchoTexto(etq.texto, ETQ_PX, { negrita: true });
  let det = null;
  if (p.detalle != null && String(p.detalle) !== '' && !etq.cortado) {
    const resto = disponible - anchoEtq - 8;
    if (resto > 30) det = recortar(p.detalle, resto, { px: DET_PX, mono: true });
  }
  const ancho = anchoEtq + (det ? 8 + anchoTexto(det.texto, DET_PX, { mono: true }) : 0);
  return { izq, base: y + 19, etq: etq.texto, cortada: etq.cortado, det: det?.texto ?? null, caja: { x1: x + 4, y1: y + 3, x2: izq + ancho + 4, y2: y + 27 } };
}

/** Lo que ocupa cada pieza en px. */
function geometria(arq) {
  const g = new Map();
  for (const p of listaPiezas(arq)) {
    if (!TIPOS[p.tipo] || typeof p.id !== 'string') continue;
    if (esContenedor(p)) {
      const x = Number(p.col) * W;
      const y = Number(p.fila) * H;
      const w = Number(p.ancho) * W;
      const h = Number(p.alto) * H;
      g.set(p.id, { p, clase: 'contenedor', x, y, w, h, rect: { x1: x, y1: y, x2: x + w, y2: y + h } });
    } else {
      const cx = (Number(p.col) + 0.5) * W;
      const y0 = Number(p.fila) * H;
      const iy = y0 + ICONO_ARRIBA;
      const { lineas, cortada } = partir(p.etiqueta, MAX_ETQ, ETQ_PX);
      const det = p.detalle != null && String(p.detalle) !== '' ? recortar(p.detalle, MAX_DET, { px: DET_PX, mono: true }) : null;
      const bases = lineas.map((_, i) => iy + ICONO + 15 + i * 14);
      const baseDet = det ? bases.at(-1) + 13.5 : null;
      const abajo = (baseDet ?? bases.at(-1)) + 4;
      const anchoT = Math.max(...lineas.map((l) => anchoTexto(l, ETQ_PX, { negrita: true })), det ? anchoTexto(det.texto, DET_PX, { mono: true }) : 0);
      const icono = { x1: cx - ICONO / 2 - 4, y1: iy - 4, x2: cx + ICONO / 2 + 4, y2: iy + ICONO + 3 };
      const texto = { x1: cx - anchoT / 2 - 2, y1: iy + ICONO + 3, x2: cx + anchoT / 2 + 2, y2: abajo };
      g.set(p.id, { p, clase: 'nodo', cx, cy: iy + ICONO / 2, y0, iy, lineas, cortada, bases, det: det?.texto ?? null, baseDet, abajo, icono, texto, forma: [icono, texto] });
    }
  }
  return g;
}

const centro = (r) => ({ x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 });
const dentro = (v, a, b) => v >= a && v <= b;
const unitario = (dx, dy) => {
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
};

/** El intervalo [entrada, salida] de un rayo a + t·d en un rectángulo (slab), o null. */
function intervalo(r, a, d) {
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const [o, v, lo, hi] of [
    [a.x, d.x, r.x1, r.x2],
    [a.y, d.y, r.y1, r.y2]
  ]) {
    if (Math.abs(v) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      const ta = (lo - o) / v;
      const tb = (hi - o) / v;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

/** Dónde sale de su forma (uno o varios rectángulos pegados) un rayo que nace adentro. */
function salida(forma, a, d) {
  let t = 0;
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    let crecio = false;
    for (const r of forma) {
      const i = intervalo(r, a, d);
      if (i && i[0] <= t + 0.5 && i[1] > t + 1e-6) {
        t = i[1];
        crecio = true;
      }
    }
    if (!crecio) break;
  }
  return { x: a.x + d.x * t, y: a.y + d.y * t };
}

const formaDe = (e) => (e.clase === 'nodo' ? e.forma : [e.rect]);

/** El punto de referencia de un extremo: el centro del ícono, o en un contenedor el punto que mira de frente al otro extremo. */
function referencia(e, otro) {
  if (e.clase === 'nodo') return { x: e.cx, y: e.cy };
  const c = centro(e.rect);
  if (dentro(otro.x, e.rect.x1 + 8, e.rect.x2 - 8)) return { x: otro.x, y: c.y };
  if (dentro(otro.y, e.rect.y1 + 8, e.rect.y2 - 8)) return { x: c.x, y: otro.y };
  return c;
}

/** Los puntos de una flecha (2 si es recta, 3 si va en escuadra), o null si no se puede trazar. */
function trazo(f, g) {
  const A = g.get(f.de);
  const B = g.get(f.a);
  if (!A || !B) return null;
  if (f.codo === 'hv' || f.codo === 'vh') {
    const a = A.clase === 'nodo' ? { x: A.cx, y: A.cy } : centro(A.rect);
    const b = B.clase === 'nodo' ? { x: B.cx, y: B.cy } : centro(B.rect);
    const esquina = f.codo === 'hv' ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    const da = unitario(esquina.x - a.x, esquina.y - a.y);
    const db = unitario(esquina.x - b.x, esquina.y - b.y);
    return [salida(formaDe(A), a, da), esquina, salida(formaDe(B), b, db)];
  }
  // Recta: los contenedores miran de frente al otro extremo.
  let a;
  let b;
  if (A.clase === 'nodo') {
    a = { x: A.cx, y: A.cy };
    b = referencia(B, a);
  } else if (B.clase === 'nodo') {
    b = { x: B.cx, y: B.cy };
    a = referencia(A, b);
  } else {
    const x1 = Math.max(A.rect.x1, B.rect.x1);
    const x2 = Math.min(A.rect.x2, B.rect.x2);
    const y1 = Math.max(A.rect.y1, B.rect.y1);
    const y2 = Math.min(A.rect.y2, B.rect.y2);
    if (x2 - x1 > 16) {
      const x = (x1 + x2) / 2;
      a = { x, y: centro(A.rect).y };
      b = { x, y: centro(B.rect).y };
    } else if (y2 - y1 > 16) {
      const y = (y1 + y2) / 2;
      a = { x: centro(A.rect).x, y };
      b = { x: centro(B.rect).x, y };
    } else {
      a = centro(A.rect);
      b = centro(B.rect);
    }
  }
  return [salida(formaDe(A), a, unitario(b.x - a.x, b.y - a.y)), salida(formaDe(B), b, unitario(a.x - b.x, a.y - b.y))];
}

const largo = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

/** El punto a la mitad del recorrido. */
function mitad(pts) {
  let falta = largo(pts) / 2;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (falta <= l || i === pts.length - 1) {
      const t = l ? Math.min(1, falta / l) : 0;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    falta -= l;
  }
  return pts[0];
}

/** La caja del texto de una flecha (y de su marca, si tiene estado). */
function cajaTextoFlecha(f, m, conMarca) {
  const texto = f.texto == null || f.texto === '' ? '' : String(f.texto);
  const w = texto ? anchoTexto(texto, FLECHA_PX, { negrita: true }) : 0;
  const marca = conMarca ? 16 : 0;
  const total = w + marca;
  const x1 = m.x - total / 2;
  return { texto, w, x1, xTexto: x1 + marca + w / 2, xMarca: x1 + 7, caja: { x1: x1 - 2, y1: m.y - 9, x2: x1 + total + 2, y2: m.y + 7 } };
}

/** ¿Algún borde de estos contenedores pasa por la caja? (Entonces su texto lleva una placa blanca detrás.) */
function bordeEn(caja, conts) {
  return conts.some(({ rect: r }) => {
    const enY = r.y1 < caja.y2 && caja.y1 < r.y2;
    const enX = r.x1 < caja.x2 && caja.x1 < r.x2;
    return (enY && (dentro(r.x1, caja.x1, caja.x2) || dentro(r.x2, caja.x1, caja.x2))) || (enX && (dentro(r.y1, caja.y1, caja.y2) || dentro(r.y2, caja.y1, caja.y2)));
  });
}

const seTocan = (a, b, holgura = 0) => a.x1 < b.x2 - holgura && b.x1 < a.x2 - holgura && a.y1 < b.y2 - holgura && b.y1 < a.y2 - holgura;

/** ¿El segmento p→q cruza el rectángulo r (encogido `holgura` px)? */
function cruza(p, q, r, holgura = 2) {
  const rr = { x1: r.x1 + holgura, y1: r.y1 + holgura, x2: r.x2 - holgura, y2: r.y2 - holgura };
  if (rr.x1 >= rr.x2 || rr.y1 >= rr.y2) return false;
  const i = intervalo(rr, p, { x: q.x - p.x, y: q.y - p.y });
  return Boolean(i && i[1] >= 0 && i[0] <= 1 && Math.min(i[1], 1) - Math.max(i[0], 0) > 1e-3);
}

/* ======================================================== validación */

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Revisa un diagrama. Devuelve la lista de problemas (vacía si está bien):
 * forma de cada pieza, ids únicos, tipos que existen, todo dentro de la
 * cuadrícula y de su padre, nodos sin encimarse, etiquetas que caben, flechas
 * entre ids que existen y que no atraviesan otros nodos ni etiquetas, y toda
 * pieza con `hecho` con su `tarea`.
 */
export function validarArquitectura(arq) {
  const problemas = [];
  const mal = (m) => problemas.push(m);
  if (!arq || typeof arq !== 'object') return ['la arquitectura no es un objeto'];
  if (typeof arq.titulo !== 'string' || !arq.titulo.trim()) mal('falta el título');
  if (typeof arq.objetivo !== 'string' || !arq.objetivo.trim()) mal('falta el objetivo (texto plano, 1 o 2 oraciones)');
  else if (/[<>]/.test(arq.objetivo)) mal('el objetivo es texto plano: sin etiquetas HTML');
  if (!(esNumero(arq.columnas) && arq.columnas > 0 && esNumero(arq.filas) && arq.filas > 0)) mal('columnas y filas deben ser números mayores que 0');
  if (!Array.isArray(arq.piezas) || !arq.piezas.length) return [...problemas, 'no hay piezas'];
  if (arq.flechas != null && !Array.isArray(arq.flechas)) mal('flechas debe ser una lista');

  const piezas = listaPiezas(arq);
  const flechas = listaFlechas(arq);
  if (piezas.length !== arq.piezas.length) mal('hay piezas que no son objetos');
  const ids = new Set();
  const usar = (id, que) => {
    if (ids.has(id)) mal(`el id «${id}» está repetido (${que})`);
    ids.add(id);
  };
  const porId = new Map();
  for (const p of piezas) {
    const quien = `la pieza «${p.id}»`;
    if (typeof p.id !== 'string' || !p.id) {
      mal(`hay una pieza sin id (tipo ${p.tipo})`);
      continue;
    }
    if (/[>\s"'<&]/.test(p.id)) mal(`${quien}: el id solo lleva letras, números y guiones`);
    usar(p.id, 'pieza');
    porId.set(p.id, p);
    const t = TIPOS[p.tipo];
    if (!t) mal(`${quien}: el tipo «${p.tipo}» no existe`);
    if (typeof p.etiqueta !== 'string' || !p.etiqueta.trim()) mal(`${quien}: falta la etiqueta`);
    if (p.detalle != null && typeof p.detalle !== 'string' && typeof p.detalle !== 'number') mal(`${quien}: el detalle debe ser texto`);
    if (!esNumero(p.col) || !esNumero(p.fila)) mal(`${quien}: col y fila deben ser números`);
    if (t?.clase === 'contenedor' && !(esNumero(p.ancho) && p.ancho > 0 && esNumero(p.alto) && p.alto > 0)) mal(`${quien}: un contenedor necesita ancho y alto`);
    if (t?.clase === 'nodo' && (p.ancho != null || p.alto != null)) mal(`${quien}: un nodo no lleva ancho ni alto (ocupa una celda)`);
    revisarPendiente(p, quien, mal);
  }
  for (const f of flechas) {
    const id = idFlecha(f);
    const quien = `la flecha «${id}»`;
    usar(id, 'flecha');
    if (!porId.has(f.de)) mal(`${quien}: «de» apunta a «${f.de}», que no existe`);
    if (!porId.has(f.a)) mal(`${quien}: «a» apunta a «${f.a}», que no existe`);
    if (f.de === f.a) mal(`${quien}: va de una pieza a sí misma`);
    if (f.tipo != null && f.tipo !== 'flujo' && f.tipo !== 'apoyo') mal(`${quien}: el tipo debe ser 'flujo' o 'apoyo'`);
    if (f.codo != null && f.codo !== 'hv' && f.codo !== 'vh') mal(`${quien}: codo debe ser 'hv' o 'vh'`);
    if (f.texto != null && typeof f.texto !== 'string') mal(`${quien}: el texto debe ser texto`);
    else if (f.texto && anchoTexto(f.texto, FLECHA_PX, { negrita: true }) > MAX_TEXTO_FLECHA) mal(`${quien}: el texto «${f.texto}» es muy largo (unos 20 caracteres como máximo)`);
    revisarPendiente(f, quien, mal);
  }
  if (problemas.length) return problemas; // la geometría necesita piezas bien formadas

  // Padres: existen, son contenedores y no hay ciclos.
  const padre = (p) => (p.en != null ? porId.get(p.en) : null);
  for (const p of piezas) {
    if (p.en == null) continue;
    const q = porId.get(p.en);
    if (!q) mal(`la pieza «${p.id}»: «en» apunta a «${p.en}», que no existe`);
    else if (!esContenedor(q)) mal(`la pieza «${p.id}»: «en» apunta a «${p.en}», que es un nodo (solo un contenedor puede tener piezas adentro)`);
  }
  for (const p of piezas) {
    const vistos = new Set([p.id]);
    for (let q = padre(p); q; q = padre(q)) {
      if (vistos.has(q.id)) {
        mal(`la pieza «${p.id}»: sus contenedores forman un ciclo`);
        break;
      }
      vistos.add(q.id);
    }
  }
  if (problemas.length) return problemas;
  const ancestros = (p) => {
    const lista = [];
    for (let q = padre(p); q; q = padre(q)) lista.push(q.id);
    return lista;
  };

  // Dentro de la cuadrícula y de su padre.
  const caja = (p) => (esContenedor(p) ? { c1: p.col, f1: p.fila, c2: p.col + p.ancho, f2: p.fila + p.alto } : { c1: p.col, f1: p.fila, c2: p.col + 1, f2: p.fila + 1 });
  const eps = 1e-6;
  for (const p of piezas) {
    const b = caja(p);
    if (b.c1 < -eps || b.f1 < -eps || b.c2 > arq.columnas + eps || b.f2 > arq.filas + eps) mal(`la pieza «${p.id}» se sale de la cuadrícula (${arq.columnas} × ${arq.filas})`);
    const q = padre(p);
    if (!q) continue;
    const c = caja(q);
    const m = esContenedor(p) ? MARGEN_HIJO : 0;
    const arriba = esContenedor(p) ? FRANJA : 0;
    if (b.c1 < c.c1 + m - eps || b.c2 > c.c2 - m + eps || b.f1 < c.f1 + arriba - eps || b.f2 > c.f2 - m + eps) {
      mal(
        esContenedor(p)
          ? `el contenedor «${p.id}» no cabe en «${q.id}»: déjale ${MARGEN_HIJO} de celda a los lados y abajo, y ${FRANJA} arriba para la etiqueta`
          : `el nodo «${p.id}» (su celda de 1 × 1) no cabe dentro de «${q.id}»`
      );
    }
  }

  // Contenedores hermanos que se enciman (los de tipo «grupo» sí pueden cruzar a otros).
  const conts = piezas.filter(esContenedor);
  for (let i = 0; i < conts.length; i++) {
    for (let j = i + 1; j < conts.length; j++) {
      const [p, q] = [conts[i], conts[j]];
      if (p.tipo === 'grupo' || q.tipo === 'grupo' || (p.en ?? null) !== (q.en ?? null)) continue;
      const a = caja(p);
      const b = caja(q);
      if (a.c1 < b.c2 - eps && b.c1 < a.c2 - eps && a.f1 < b.f2 - eps && b.f1 < a.f2 - eps) mal(`los contenedores «${p.id}» y «${q.id}» se enciman`);
    }
  }

  // Nodos: nunca a menos de una celda uno del otro.
  const nodos = piezas.filter((p) => !esContenedor(p));
  for (let i = 0; i < nodos.length; i++) {
    for (let j = i + 1; j < nodos.length; j++) {
      const [p, q] = [nodos[i], nodos[j]];
      if (Math.abs(p.col - q.col) < 1 - eps && Math.abs(p.fila - q.fila) < 1 - eps) mal(`los nodos «${p.id}» y «${q.id}» se enciman (deben quedar a una celda o más)`);
    }
  }

  // Lo que se dibuja: etiquetas que caben, etiquetas que no tapan a nadie, flechas limpias.
  const g = geometria(arq);
  const etiquetas = new Map();
  for (const e of g.values()) {
    if (e.clase === 'nodo') {
      if (e.cortada) mal(`la etiqueta «${e.p.etiqueta}» de «${e.p.id}» no cabe en dos renglones: acórtala (unos 15 caracteres por renglón)`);
    } else {
      const l = etiquetaContenedor(e.p, e.x, e.y, e.w, true);
      if (l.cortada) mal(`la etiqueta «${e.p.etiqueta}» del contenedor «${e.p.id}» no cabe en su ancho`);
      etiquetas.set(e.p.id, l.caja);
    }
  }
  for (const e of g.values()) {
    if (e.clase !== 'nodo') continue;
    for (const [id, c] of etiquetas) if (e.forma.some((r) => seTocan(r, c))) mal(`el nodo «${e.p.id}» tapa la etiqueta del contenedor «${id}»`);
  }
  const textos = [];
  for (const f of flechas) {
    const id = idFlecha(f);
    const A = porId.get(f.de);
    const B = porId.get(f.a);
    if (ancestros(A).includes(B.id) || ancestros(B).includes(A.id)) {
      mal(`la flecha «${id}» une una pieza con el contenedor que la contiene`);
      continue;
    }
    const pts = trazo(f, g);
    if (!pts) continue;
    const tramos = pts.slice(1).map((q, i) => [pts[i], q]);
    const ultimo = tramos.at(-1);
    if (largo(pts) < 30 || Math.hypot(ultimo[1].x - ultimo[0].x, ultimo[1].y - ultimo[0].y) < 16) {
      mal(`la flecha «${id}» queda muy corta: separa más sus extremos`);
      continue;
    }
    if (f.codo && tramos.some(([p, q]) => Math.hypot(q.x - p.x, q.y - p.y) < 1)) mal(`la flecha «${id}» no necesita codo: sus extremos ya están alineados`);
    for (const e of g.values()) {
      if (e.p.id === f.de || e.p.id === f.a) continue;
      if (e.clase === 'nodo' && tramos.some(([p, q]) => e.forma.some((r) => cruza(p, q, r)))) mal(`la flecha «${id}» pasa por encima del nodo «${e.p.id}»`);
    }
    for (const [cid, c] of etiquetas) if (tramos.some(([p, q]) => cruza(p, q, c, 0))) mal(`la flecha «${id}» atraviesa la etiqueta del contenedor «${cid}»`);
    const t = cajaTextoFlecha(f, mitad(pts), typeof f.hecho === 'function');
    if (t.texto || typeof f.hecho === 'function') {
      for (const e of g.values()) if (e.clase === 'nodo' && e.forma.some((r) => seTocan(r, t.caja, 1))) mal(`el texto de la flecha «${id}» queda encima del nodo «${e.p.id}»`);
      for (const [cid, c] of etiquetas) if (seTocan(c, t.caja, 1)) mal(`el texto de la flecha «${id}» queda encima de la etiqueta del contenedor «${cid}»`);
      for (const [otra, c] of textos) if (seTocan(c, t.caja, 1)) mal(`los textos de las flechas «${otra}» y «${id}» se enciman`);
      textos.push([id, t.caja]);
    }
  }
  return problemas;
}

/** La parte de «algo por hacer» de una pieza o flecha. */
function revisarPendiente(p, quien, mal) {
  if (p.hecho != null && typeof p.hecho !== 'function') mal(`${quien}: hecho debe ser una función`);
  if (typeof p.hecho === 'function' && (typeof p.tarea !== 'string' || !p.tarea)) mal(`${quien}: tiene hecho, pero no dice su tarea`);
  if (p.tarea != null && typeof p.hecho !== 'function') mal(`${quien}: dice su tarea, pero no tiene hecho`);
  if (p.checks != null && !(Array.isArray(p.checks) && p.checks.length && p.checks.every((c) => typeof c === 'string' && c))) mal(`${quien}: checks debe ser una lista de ids`);
  if (p.bono != null && typeof p.bono !== 'boolean') mal(`${quien}: bono es true o false`);
  if (p.bono === true && typeof p.hecho !== 'function') mal(`${quien}: es de bono, pero no tiene hecho`);
}

/* ============================================================ dibujo */

const COLOR = {
  tinta: '#16191f',
  texto: '#414d5c',
  tenue: '#8d99a8',
  falta: '#9aa3ad',
  linea: '#5f6b7a',
  foco: '#0972d3',
  creado: '#0972d3',
  pendiente: '#f2a40c',
  listo: '#1d8102'
};

const ESTILO_CONTENEDOR = {
  nube: { borde: '#00a4a6', relleno: 'none', guion: '7 5', ancho: 1.5, rx: 4 },
  vpc: { borde: '#8c4fff', relleno: '#fdfcff', guion: null, ancho: 2, rx: 6 },
  az: { borde: '#147eba', relleno: 'none', guion: '6 5', ancho: 1.3, rx: 6 },
  'subred-publica': { borde: '#7aa116', relleno: '#f1f7e4', guion: null, ancho: 1.5, rx: 6 },
  'subred-privada': { borde: '#147eba', relleno: '#e8f2f9', guion: null, ancho: 1.5, rx: 6 },
  grupo: { borde: '#5f6b7a', relleno: 'none', guion: '5 4', ancho: 1.6, rx: 8 }
};

const CSS = `
.arq-svg{font-family:var(--sans,"Segoe UI",Arial,sans-serif)}
.arq-svg .arq-fondo{fill:#fff}
.arq-svg text{fill:${COLOR.tinta};font-size:${ETQ_PX}px}
.arq-svg .arq-etq{font-weight:700}
.arq-svg .arq-etq,.arq-svg .arq-det{paint-order:stroke;stroke:rgba(255,255,255,.92);stroke-width:3px;stroke-linejoin:round}
.arq-svg .arq-det{font-family:var(--mono,Consolas,monospace);font-size:${DET_PX}px;font-weight:400;fill:${COLOR.texto}}
.arq-svg .arq-falta text,.arq-svg .arq-falta .arq-det{fill:${COLOR.tenue}}
.arq-svg .arq-flecha-texto{font-size:${FLECHA_PX}px;font-weight:700;fill:${COLOR.texto};paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}
.arq-svg .arq-linea{fill:none;stroke:${COLOR.linea};stroke-width:1.6}
.arq-svg .arq-apoyo .arq-linea{stroke-dasharray:5 4}
.arq-svg .arq-tenue{opacity:.38}
.arq-svg .arq-falta .arq-linea{stroke:${COLOR.falta}}
.arq-svg .arq-falta .arq-flecha-texto{fill:${COLOR.tenue}}
.arq-svg .arq-punta path{fill:${COLOR.linea}}
.arq-svg .arq-punta-tenue path{fill:${COLOR.falta}}
.arq-svg .arq-placa{fill:#fff;fill-opacity:.9}
.arq-svg .arq-bono rect{fill:#fff;stroke:#8c4fff;stroke-width:1.2}
.arq-svg .arq-bono text{font-size:9.5px;font-weight:700;fill:#6b35d9}
.arq-svg [data-pieza]{cursor:pointer}
.arq-svg [data-pieza]:focus{outline:none}
.arq-svg .arq-foco{fill:none;stroke:none}
.arq-svg .arq-golpe{fill:none;stroke:transparent;stroke-width:12;pointer-events:stroke}
.arq-svg [data-pieza]:hover .arq-foco{stroke:#9cc3ec;stroke-width:1.5}
.arq-svg [data-pieza]:focus-visible .arq-foco,.arq-svg .arq-elegida .arq-foco{stroke:${COLOR.foco};stroke-width:2.5;fill:rgba(9,114,211,.07)}
.arq-svg .arq-flecha:hover .arq-foco{stroke:rgba(9,114,211,.25);stroke-width:9;fill:none}
.arq-svg .arq-flecha:focus-visible .arq-foco,.arq-svg .arq-flecha.arq-elegida .arq-foco{stroke:rgba(9,114,211,.35);stroke-width:10;fill:none}
@media (prefers-reduced-motion:no-preference){.arq-svg .arq-foco{transition:stroke .12s,fill .12s}}
`
  .trim()
  .replace(/\n/g, '');

/** La marca de un estado, centrada en (x, y). El estado nunca se dice solo con color. */
function marca(estado, x, y, r = 8) {
  const t = (s) => `<g transform="translate(${n(x)} ${n(y)})" aria-hidden="true">${s}</g>`;
  if (estado === 'listo') return t(`<circle r="${r}" fill="${COLOR.listo}" stroke="#fff" stroke-width="1.5"/><path d="M${-r * 0.45} 0l${r * 0.3} ${r * 0.32} ${r * 0.55}-${r * 0.62}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`);
  if (estado === 'pendiente') return t(`<circle r="${r}" fill="${COLOR.pendiente}" stroke="#fff" stroke-width="1.5"/><path d="M0 ${-r * 0.5}v${r * 0.55}" stroke="${COLOR.tinta}" stroke-width="1.9" stroke-linecap="round"/><circle cy="${r * 0.48}" r="1.05" fill="${COLOR.tinta}"/>`);
  if (estado === 'creado') return t(`<circle r="${r}" fill="${COLOR.creado}" stroke="#fff" stroke-width="1.5"/><circle r="${r * 0.3}" fill="#fff"/>`);
  if (estado === 'falta') return t(`<circle r="${r - 1}" fill="#fff" stroke="${COLOR.falta}" stroke-width="1.5" stroke-dasharray="2.4 2"/>`);
  return '';
}

/** La marca de un estado como un SVG suelto (para la leyenda del modal y de la vista previa). */
export function marcaSvg(estado, tamano = 16) {
  if (!ESTADOS[estado]) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-9 -9 18 18" width="${tamano}" height="${tamano}" aria-hidden="true" focusable="false">${marca(estado, 0, 0, 8)}</svg>`;
}

const textoEstado = (estado) => (estado ? ESTADOS[estado]?.nombre.toLowerCase() ?? '' : '');

/** Los atributos de una pieza que el modal escucha. */
function atributosPieza(id, estado, etiqueta, bono, elegida, clases) {
  const aria = `${etiqueta}: ${textoEstado(estado)}${bono ? ' (bono)' : ''}`;
  return `class="${clases}${elegida ? ' arq-elegida' : ''}" data-pieza="${esc(id)}" data-estado="${estado}" tabindex="0" role="button" aria-label="${esc(aria)}"${elegida ? ' aria-pressed="true"' : ''}`;
}

const pill = (x, y) =>
  `<g class="arq-bono" aria-hidden="true"><rect x="${n(x)}" y="${n(y)}" width="34" height="15" rx="7.5"/><text x="${n(x + 17)}" y="${n(y + 11)}" text-anchor="middle">Bono</text></g>`;

const placa = (c) => `<rect class="arq-placa" x="${n(c.x1)}" y="${n(c.y1)}" width="${n(c.x2 - c.x1)}" height="${n(c.y2 - c.y1)}" rx="4"/>`;

function dibujarContenedor(e, estado, elegida, conts) {
  const { p, x, y, w, h } = e;
  const est = ESTILO_CONTENEDOR[p.tipo];
  const falta = estado === 'falta';
  const conMarca = Boolean(estado) && !falta;
  const l = etiquetaContenedor(p, x, y, w, conMarca);
  const borde = falta ? COLOR.falta : est.borde;
  const guion = falta ? '6 4' : est.guion;
  const relleno = falta ? (est.relleno === 'none' ? 'none' : '#f7f8f9') : est.relleno;
  const titulo = `${p.etiqueta}${p.detalle ? ` · ${p.detalle}` : ''}${estado ? ` · ${ESTADOS[estado].nombre}` : ''}${p.bono ? ' · bono' : ''}`;
  const partes = [
    `<title>${esc(titulo)}</title>`,
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${est.rx}" fill="${relleno}" stroke="${borde}" stroke-width="${est.ancho}"${guion ? ` stroke-dasharray="${guion}"` : ''}/>`
  ];
  if (estado && relleno === 'none') partes.push(`<rect class="arq-golpe" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${est.rx}"/>`);
  if (estado) partes.unshift(`<rect class="arq-foco" x="${n(x - 3)}" y="${n(y - 3)}" width="${n(w + 6)}" height="${n(h + 6)}" rx="${est.rx + 3}"/>`);
  const cajaTexto = { x1: l.izq - 3, y1: l.base - 13, x2: l.caja.x2, y2: l.base + 5 };
  if (bordeEn(cajaTexto, conts.filter((c) => c !== e))) partes.push(placa(cajaTexto));
  if (conMarca) partes.push(marca(estado, x + 17, l.base - 4.5, 7));
  partes.push(
    `<text x="${n(l.izq)}" y="${n(l.base)}" class="arq-etq"${falta ? '' : ` style="fill:${p.tipo === 'grupo' || p.tipo === 'nube' ? COLOR.tinta : borde}"`}>${esc(l.etq)}${
      l.det ? `<tspan class="arq-det" dx="8">${esc(l.det)}</tspan>` : ''
    }</text>`
  );
  if (p.bono) partes.push(pill(l.caja.x2 + 6, y + 6));
  const etq = `${p.etiqueta}${p.detalle ? ` ${p.detalle}` : ''}`;
  const clases = `arq-contenedor${falta ? ' arq-falta' : ''}`;
  return estado ? `<g ${atributosPieza(p.id, estado, etq, p.bono, elegida, clases)}>${partes.join('')}</g>` : `<g class="arq-contenedor">${partes.join('')}</g>`;
}

function dibujarNodo(e, estado, elegida, conts) {
  const { p, cx, iy, y0 } = e;
  const tipo = TIPOS[p.tipo];
  const falta = estado === 'falta';
  const x1 = cx - ICONO / 2;
  const partes = [];
  const titulo = `${p.etiqueta}${p.detalle ? ` · ${p.detalle}` : ''} (${tipo.nombre})${estado ? ` · ${ESTADOS[estado].nombre}` : ''}${p.bono ? ' · bono' : ''}`;
  partes.push(`<title>${esc(titulo)}</title>`);
  if (estado) {
    const fx1 = Math.min(e.texto.x1, e.icono.x1) - 4;
    const fx2 = Math.max(e.texto.x2, e.icono.x2) + 4;
    partes.push(`<rect class="arq-foco" x="${n(fx1)}" y="${n(y0 + 2)}" width="${n(fx2 - fx1)}" height="${n(e.abajo - y0 + 2)}" rx="8"/>`);
  }
  if (falta) {
    partes.push(`<rect x="${n(x1)}" y="${n(iy)}" width="${ICONO}" height="${ICONO}" rx="7" fill="#f4f5f7" stroke="${COLOR.falta}" stroke-width="1.5" stroke-dasharray="4 3"/>`);
  } else {
    partes.push(`<rect x="${n(x1)}" y="${n(iy)}" width="${ICONO}" height="${ICONO}" rx="7" fill="${tipo.color}"/>`);
  }
  const cajaTexto = { x1: e.texto.x1 - 2, y1: e.texto.y1 + 1, x2: e.texto.x2 + 2, y2: e.texto.y2 };
  if (bordeEn(cajaTexto, conts)) partes.push(placa(cajaTexto));
  const trazoGlifo = falta ? COLOR.falta : '#fff';
  partes.push(
    `<g transform="translate(${n(x1 + 6)} ${n(iy + 6)}) scale(${n((ICONO - 12) / 24 * 100) / 100})" fill="none" stroke="${trazoGlifo}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${tipo.glifo}</g>`
  );
  e.lineas.forEach((l, i) => partes.push(`<text x="${n(cx)}" y="${n(e.bases[i])}" text-anchor="middle" class="arq-etq">${esc(l)}</text>`));
  if (e.det) partes.push(`<text x="${n(cx)}" y="${n(e.baseDet)}" text-anchor="middle" class="arq-det">${esc(e.det)}</text>`);
  if (estado && !falta) partes.push(marca(estado, x1 + ICONO, iy, 8.5));
  if (p.bono) partes.push(pill(x1 - 38, iy + 2));
  const etq = `${p.etiqueta}${p.detalle ? ` ${p.detalle}` : ''}`;
  const clases = `arq-nodo${falta ? ' arq-falta' : ''}`;
  return estado ? `<g ${atributosPieza(p.id, estado, etq, p.bono, elegida, clases)}>${partes.join('')}</g>` : `<g class="arq-nodo">${partes.join('')}</g>`;
}

function dibujarFlecha(f, g, estados, elegida) {
  const pts = trazo(f, g);
  if (!pts) return '';
  const id = idFlecha(f);
  const estado = estados[id] ?? null;
  const conEstado = typeof f.hecho === 'function';
  // Una flecha sin estado se enciende cuando sus dos extremos ya no faltan.
  const tenue = !conEstado && (estados[f.de] === 'falta' || estados[f.a] === 'falta');
  const falta = conEstado && (estado === 'falta' || !estado);
  const d = `M${pts.map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}`;
  const m = mitad(pts);
  const t = cajaTextoFlecha(f, m, conEstado);
  const partes = [];
  const nombre = (pid) => g.get(pid)?.p.etiqueta ?? pid;
  const etq = `Conexión ${nombre(f.de)} → ${nombre(f.a)}${t.texto ? ` (${t.texto})` : ''}`;
  if (conEstado) partes.push(`<title>${esc(`${etq} · ${ESTADOS[estado ?? 'falta'].nombre}${f.bono ? ' · bono' : ''}`)}</title>`, `<path class="arq-foco" d="${d}"/>`, `<path class="arq-golpe" d="${d}"/>`);
  partes.push(`<path class="arq-linea" d="${d}" marker-end="url(#${falta || tenue ? 'arq-punta-tenue' : 'arq-punta'})"/>`);
  if (t.texto) partes.push(`<text class="arq-flecha-texto" x="${n(t.xTexto)}" y="${n(m.y + 4)}" text-anchor="middle">${esc(t.texto)}</text>`);
  if (conEstado) partes.push(marca(estado ?? 'falta', t.texto ? t.xMarca : m.x, m.y, 7));
  if (f.bono) partes.push(pill(t.caja.x2 + 4, m.y - 8));
  const clases = `arq-flecha${f.tipo === 'apoyo' ? ' arq-apoyo' : ''}${falta ? ' arq-falta' : ''}${tenue ? ' arq-tenue' : ''}`;
  return conEstado ? `<g ${atributosPieza(id, estado ?? 'falta', etq, f.bono, elegida, clases)}>${partes.join('')}</g>` : `<g class="${clases}">${partes.join('')}</g>`;
}

/**
 * El SVG del diagrama, como texto. Autosuficiente: sus estilos van dentro (bajo
 * `.arq-svg`) y los ids llevan el prefijo `arq-`. Escala al ancho disponible.
 * Todo texto va escapado: las etiquetas traen datos del alumno.
 *
 * opciones.elegida: el id de la pieza o flecha que se resalta.
 * opciones.etiqueta: el aria-label del SVG (por omisión, «Diagrama: <título>»).
 */
export function svgArquitectura(arq, estados = {}, opciones = {}) {
  const g = geometria(arq);
  const ancho = Number(arq?.columnas) * W || W;
  const alto = Number(arq?.filas) * H || H;
  const est = (id) => (Object.hasOwn(estados ?? {}, id) ? estados[id] : null);
  const valido = (e) => (e && ESTADOS[e] ? e : null);
  const piezas = listaPiezas(arq);
  const conHecho = (p) => typeof p.hecho === 'function';
  const estadoDe = (p) => (conHecho(p) ? valido(est(p.id)) ?? 'falta' : null);
  const todos = Object.fromEntries([...piezas.map((p) => [p.id, estadoDe(p)]), ...listaFlechas(arq).map((f) => [idFlecha(f), typeof f.hecho === 'function' ? valido(est(idFlecha(f))) ?? 'falta' : null])]);

  // Detrás los contenedores con relleno, del más grande al más chico; luego los
  // «grupo» (sin relleno: su borde punteado cruza a los demás); luego las
  // flechas y al final los nodos.
  const area = (e) => e.w * e.h;
  const conts = [...g.values()].filter((e) => e.clase === 'contenedor');
  const orden = [...conts.filter((e) => e.p.tipo !== 'grupo').sort((a, b) => area(b) - area(a)), ...conts.filter((e) => e.p.tipo === 'grupo').sort((a, b) => area(b) - area(a))];
  const nodos = [...g.values()].filter((e) => e.clase === 'nodo');
  const elegida = opciones.elegida ?? null;

  const etiqueta = opciones.etiqueta ?? `Diagrama: ${arq?.titulo ?? 'arquitectura'}`;
  // Más angosto que esto, el texto ya no se lee: el contenedor del SVG se desplaza de lado.
  const minimo = Math.round(ancho * (opciones.escalaMinima ?? ESCALA_MINIMA));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="arq-svg" viewBox="0 0 ${n(ancho)} ${n(alto)}" width="100%" style="min-width:${minimo}px;display:block" preserveAspectRatio="xMidYMin meet" role="group" aria-label="${esc(etiqueta)}">`,
    `<title>${esc(arq?.titulo ?? '')}</title>`,
    `<desc>${esc(arq?.objetivo ?? '')}</desc>`,
    `<style>${CSS}</style>`,
    '<defs>',
    '<marker id="arq-punta" class="arq-punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0.5L10 5L0 9.5z"/></marker>',
    '<marker id="arq-punta-tenue" class="arq-punta-tenue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0.5L10 5L0 9.5z"/></marker>',
    '</defs>',
    `<rect class="arq-fondo" x="0" y="0" width="${n(ancho)}" height="${n(alto)}"/>`,
    ...orden.map((e) => dibujarContenedor(e, todos[e.p.id], elegida === e.p.id, conts)),
    ...listaFlechas(arq).map((f) => dibujarFlecha(f, g, todos, elegida === idFlecha(f))),
    ...nodos.map((e) => dibujarNodo(e, todos[e.p.id], elegida === e.p.id, conts)),
    '</svg>'
  ].join('');
}
