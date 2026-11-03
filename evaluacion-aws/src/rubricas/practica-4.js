// Rúbrica de la práctica integradora 4 · Café del Bajío ordena sus cuentas
// (gobierno y costos, sesión 12 de la Ruta AWS).
//
// Revisa la cuenta como la dejó el alumno: los riesgos que marca Trusted
// Advisor (snapshot público, SSH abierto, raíz sin MFA) y si ya lo refrescó;
// el ahorro (IP elástica suelta, right-sizing de la misma instancia); la
// organización con sus OU, sus cuentas y la SCP de regiones (con
// accionPermitidaPorScp, la misma cuenta que hace AWS); la etiqueta de costos,
// el reporte de Cost Explorer, el presupuesto con sus alertas, la estimación de
// la Pricing Calculator, el plan de soporte y la revisión Well-Architected.
//
// Elige «el recurso del alumno» con tolerancia (por lo que hace, no solo por
// cómo se llama) y la retro le dice qué se esperaba. Solo servidor: el
// navegador nunca recibe este archivo.

import {
  CHEQUEOS_ADVISOR,
  accionPermitidaPorScp,
  activarEtiquetasCosto,
  adjuntarPoliticaScp,
  asignarMfaRaiz,
  avanzar,
  cambiarPlanSoporte,
  cambiarTipoInstancia,
  compartirSnapshotRds,
  crearCargaWa,
  crearCuentaOrganizacion,
  crearEstimacion,
  crearOrganizacion,
  crearPoliticaScp,
  crearPresupuesto,
  crearUnidadOrganizativa,
  detenerInstancia,
  dinero,
  editarEtiquetasDynamo,
  editarReglasSg,
  guardarHitoWa,
  guardarReporteCostos,
  guardarServicioEstimacion,
  habilitarScp,
  iniciarInstancia,
  liberarEip,
  moverCuentaOrganizacion,
  objetivoOrganizacion,
  planSoporte,
  precioCalculadora,
  preguntaWa,
  refrescarAdvisor,
  reloj,
  responderPreguntaWa,
  rutaOrganizacion,
  tipoInstancia
} from '../../public/consola/modelo.js';
import { LAB, datosLab } from '../../public/labs/practica-4.js';
import { armar, check, lista, mejorPor, normal, preparar } from './comun.js';

/**
 * Dónde repasar cada punto en la Ruta AWS (ver src/repaso.js). La clave
 * 'tarea/check' gana sobre la de la tarea.
 */
export const REPASO = {
  seguridad: ['s7-soporte/2', 's2-identidades/2'],
  'seguridad/snapshot': ['s7-soporte/2', 's5-disponibilidad/1'],
  'seguridad/ssh': ['s2-lab-seguridad/14', 's7-soporte/2'],
  'seguridad/mfa': ['s2-identidades/2', 's2-identidades/3'],
  'seguridad/advisor': ['s7-soporte/2', 's7-lab-costos/9'],

  ahorro: ['s7-precios/1', 's7-precios/2'],
  'ahorro/eip': ['s7-precios/1', 's7-soporte/2'],
  'ahorro/tipo': ['s1-ec2/2', 's7-precios/2'],
  'ahorro/encendida': ['s1-ec2/3', 's7-precios/2'],

  cuentas: ['s7-herramientas/2', 's2-politicas/3'],
  'cuentas/org': 's7-herramientas/2',
  'cuentas/ous': ['s2-politicas/3', 's7-herramientas/2'],

  scp: ['s2-politicas/3', 's2-politicas/2'],
  'scp/dentro': ['s2-politicas/3', 's2-politicas/2'],

  etiquetas: ['s7-herramientas/1', 's7-lab-costos/7'],
  presupuesto: ['s7-herramientas/1', 's7-lab-costos/8'],
  calculadora: ['s7-precios/2', 's1-precios/1', 's7-lab-costos/4'],
  'calculadora/estimacion': ['s7-herramientas/1', 's7-lab-costos/2'],
  soporte: ['s7-soporte/1', 's7-lab-costos/10'],
  wa: ['s7-buenas-practicas/1', 's7-lab-costos/11'],
  bono: ['s7-herramientas/1', 's7-lab-costos/8']
};

/* ================================================================ ayudas */

const sinAcentos = (t) => normal(t).replace(/[^a-z0-9]/g, '');
const abiertoAlMundo = (r) => r.origen === '0.0.0.0/0' || r.origen === '::/0';
const cubre = (r, puerto) => r.protocolo === '-1' || (r.protocolo === 'tcp' && r.desde <= puerto && puerto <= r.hasta);
const correoIgual = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** La instancia de las cajas que venía en la cuenta: la más antigua con ese nombre. */
function instanciaOriginal(e, x) {
  const mismas = e.instancias.filter((i) => i.nombre === x.instancia).sort((a, b) => String(a.lanzada).localeCompare(String(b.lanzada)));
  return mismas[0] ?? null;
}

/* ============================================================ seguridad */

const ADVISOR = [
  ['rds-snapshots-publicos', 'Amazon RDS Public Snapshots'],
  ['sg-puertos', 'Security Groups - Specific Ports Unrestricted'],
  ['mfa-raiz', 'MFA on Root Account']
];

function revisarSeguridad(e, x) {
  const checks = [];

  // El snapshot de la base de clientes: privado, y que siga existiendo.
  {
    const t = `El snapshot ${x.snapshot} existe y es privado (ningún snapshot de RDS es público)`;
    const snaps = e.rds?.snapshots ?? [];
    const snap = snaps.find((s) => s.id === x.snapshot);
    const publicos = snaps.filter((s) => s.publico);
    if (snap && !snap.publico && !publicos.length) {
      checks.push(check('snapshot', t, 4, true, `${x.snapshot} ya es Private: solo tu cuenta (y las que agregues por número de cuenta) lo puede restaurar. Un snapshot público lo puede copiar cualquier cuenta de AWS del mundo y con eso ver toda la base de clientes. Ojo: un snapshot cifrado ni siquiera se puede hacer público; cifrar es otra capa de protección.`));
    } else if (!snap) {
      checks.push(check('snapshot', t, 4, false, `Ya no existe el snapshot ${x.snapshot}: lo borraste. Así desapareció el riesgo, pero también el único respaldo manual de la base de clientes (los automáticos se borran solos al pasar su retención). Se pedía hacerlo privado con Aurora and RDS → Snapshots → Actions → Share snapshot → Private. Si quieres reponerlo, toma otro snapshot manual de ${x.base}.`));
    } else if (snap.publico) {
      checks.push(check('snapshot', t, 4, false, `${x.snapshot} sigue siendo Public: cualquier cuenta de AWS puede restaurarlo y leer los datos de los clientes. En Aurora and RDS → Snapshots → pestaña Manual, selecciónalo → Actions → Share snapshot y elige Private.`));
    } else {
      checks.push(check('snapshot', t, 4, false, `${x.snapshot} ya es privado, pero estos snapshots siguen públicos: ${publicos.map((s) => s.id).join(', ')}. Trusted Advisor marca cualquier snapshot público: hazlos privados también (Share snapshot → Private).`));
    }
  }

  // SSH cerrado al mundo y el 80 abierto para las cajas.
  {
    const t = `Ningún grupo de seguridad deja SSH (22) abierto a 0.0.0.0/0, y ${x.instancia} sigue recibiendo HTTP (80) de cualquier lugar`;
    const malas = e.gruposSeguridad.flatMap((g) => (g.entrada ?? []).filter((r) => abiertoAlMundo(r) && cubre(r, 22)).map((r) => ({ g, r })));
    const inst = instanciaOriginal(e, x);
    const grupos = inst ? inst.gruposSeguridad : e.gruposSeguridad.filter((g) => g.nombre === x.sg).map((g) => g.id);
    const http = grupos.some((id) => (e.gruposSeguridad.find((g) => g.id === id)?.entrada ?? []).some((r) => abiertoAlMundo(r) && cubre(r, 80)));
    const sshCasa = grupos.some((id) => (e.gruposSeguridad.find((g) => g.id === id)?.entrada ?? []).some((r) => r.origen === `${x.ipCasa}/32` && cubre(r, 22)));
    if (!malas.length && http) {
      checks.push(
        check('ssh', t, 3, true, `${sshCasa ? `SSH solo entra desde tu IP ${x.ipCasa}/32` : 'Ya nadie puede entrar por SSH desde internet'} y las cajas siguen entrando por el 80. El puerto 22 abierto al mundo es de lo primero que buscan los robots que escanean internet: es mínimo privilegio aplicado a la red.`)
      );
    } else if (malas.length) {
      const { g, r } = malas[0];
      checks.push(check('ssh', t, 3, false, `El grupo ${g.nombre} (${g.id}) todavía deja entrar ${r.protocolo === '-1' ? 'todo el tráfico' : `el puerto ${r.desde === r.hasta ? r.desde : `${r.desde}-${r.hasta}`}`} desde ${r.origen}: cualquier computadora del mundo puede intentar entrar por SSH. En EC2 → Security Groups → ${g.nombre} → Edit inbound rules, borra esa regla o cambia su origen a ${x.ipCasa}/32 (My IP).`));
    } else {
      checks.push(check('ssh', t, 3, false, `SSH ya no está abierto al mundo, pero ${x.instancia} ya no recibe HTTP (80) desde 0.0.0.0/0: las cajas de las 14 sucursales no podrían cobrar. Al cerrar el riesgo no hay que tumbar el servicio: vuelve a agregar la regla HTTP con origen Anywhere-IPv4 en Edit inbound rules.`));
    }
  }

  // MFA en la raíz.
  {
    const t = 'La cuenta raíz (root user) tiene MFA';
    if (e.iam?.raizMfa) {
      checks.push(check('mfa', t, 3, true, 'La raíz ya tiene MFA. Es la llave maestra de la cuenta (puede cerrarla, cambiar el plan de soporte y ver la facturación) y sus permisos no se pueden limitar: con MFA, una contraseña robada no basta para entrar.'));
    } else {
      checks.push(check('mfa', t, 3, false, 'La cuenta raíz sigue sin MFA. Es la llave maestra de la cuenta y sus permisos no se pueden limitar ni con políticas. En IAM → Dashboard → Add MFA (o el menú de la cuenta → Security credentials → Assign MFA device) agrega un dispositivo virtual.'));
    }
  }

  // Trusted Advisor refrescado después de arreglar.
  {
    const t = 'La última revisión de Trusted Advisor muestra en verde los tres chequeos de seguridad';
    const res = e.costos?.advisor?.resultados ?? {};
    const enRojo = ADVISOR.filter(([id]) => res[id]?.estado !== 'ok');
    const ahora = ADVISOR.filter(([id]) => {
      const ch = CHEQUEOS_ADVISOR.find((c) => c.id === id);
      try {
        return ch && ch.evaluar(e, reloj.ahora()).marcados.length > 0;
      } catch {
        return false;
      }
    });
    if (!enRojo.length) {
      checks.push(check('advisor', t, 3, true, 'Trusted Advisor ya muestra en verde RDS Public Snapshots, los puertos sin restricción y el MFA de la raíz. Recuerda que Trusted Advisor enseña el resultado de su última revisión: después de corregir algo hay que darle «Refresh all checks» para que el tablero (y quien lo lea) lo vea.'));
    } else if (!ahora.length) {
      checks.push(check('advisor', t, 3, false, `Ya corregiste todo, pero Trusted Advisor todavía muestra en rojo ${lista(enRojo.map(([, n]) => n))}: enseña lo que encontró en su última revisión (columna «Last refreshed»), no lo de este momento. En Trusted Advisor → Recommendations pulsa «Refresh all checks».`));
    } else {
      checks.push(check('advisor', t, 3, false, `Trusted Advisor no puede salir en verde todavía: en tu cuenta sigue mal ${lista(ahora.map(([, n]) => n))}. Corrige los puntos de arriba y luego pulsa «Refresh all checks» en Trusted Advisor.`));
    }
  }
  return checks;
}

/* ================================================================ ahorro */

function revisarAhorro(e, x) {
  const checks = [];
  const vieja = tipoInstancia(x.tipoViejo);

  // La IP elástica de la sucursal que cerró.
  {
    const t = `La IP elástica ${x.eip} ya no existe y no queda ninguna IP elástica sin usar`;
    const laVieja = e.eips.find((p) => p.nombre === x.eip);
    const corriendo = (id) => e.instancias.some((i) => i.id === id && i.estado === 'running');
    const sueltas = e.eips.filter((p) => !p.natId && !(p.instanciaId && corriendo(p.instanciaId)));
    const mensual = dinero(0.005 * 730);
    if (!laVieja && !sueltas.length) {
      checks.push(check('eip', t, 3, true, `Liberaste la IP de la sucursal que cerró. Desde 2024 AWS cobra cada IPv4 pública por hora (unos ${mensual} al mes cada una), esté en uso o no: pagar por lo que no usas es el desperdicio más fácil de quitar. Trusted Advisor la marca en «Unassociated Elastic IP Addresses» (con Business Support+ o mayor).`));
    } else if (laVieja?.instanciaId) {
      checks.push(check('eip', t, 3, false, `Asociaste ${x.eip} (${laVieja.ip}) a una instancia en vez de liberarla. Las cajas están configuradas con la IP que ya tenía la API; la de Celaya ya no tiene ningún uso. Desasóciala y libérala en EC2 → Elastic IPs → Actions → Release Elastic IP addresses.`));
    } else if (laVieja) {
      checks.push(check('eip', t, 3, false, `${x.eip} (${laVieja.ip}) sigue reservada y sin usar: se cobra cada hora (unos ${mensual} al mes) aunque nadie la use. Libérala en EC2 → Network & Security → Elastic IPs → Actions → Release Elastic IP addresses.`));
    } else {
      checks.push(check('eip', t, 3, false, `Liberaste ${x.eip}, pero quedan IP elásticas sin usar: ${sueltas.map((p) => `${p.ip} (${p.id})`).join(', ')}. Cada una se cobra por hora; libéralas si no las necesitas.`));
    }
  }

  // Right-sizing de la misma instancia.
  const inst = instanciaOriginal(e, x);
  const tipo = inst ? tipoInstancia(inst.tipo) : null;
  const bienTipo = Boolean(inst && !['terminated', 'shutting-down'].includes(inst.estado) && tipo && tipo.vcpu >= 2 && tipo.memoria >= 2 && tipo.precio <= vieja.precio / 2);
  {
    const t = `${x.instancia} es la misma instancia con un tipo de al menos 2 vCPU y 2 GiB que cuesta menos de la mitad que ${x.tipoViejo}`;
    if (bienTipo) {
      const ahorro = (vieja.precio - tipo.precio) * 730;
      checks.push(check('tipo', t, 5, true, `${x.instancia} pasó de ${x.tipoViejo} (${dinero(vieja.precio * 730)} al mes) a ${tipo.tipo} (${dinero(tipo.precio * 730)} al mes): unos ${dinero(ahorro)} menos cada mes con el mismo trabajo. Eso es right-sizing: elegir el tamaño con datos (la CPU no pasaba de 15 %), una de las prácticas de Cost Optimization. En la nube cambiar de tamaño es detener, cambiar el tipo y volver a encender.`));
    } else if (!inst) {
      checks.push(check('tipo', t, 5, false, `No encontré ninguna instancia llamada ${x.instancia}. Se pedía cambiarle el tamaño a la que ya existía, sin borrarla.`));
    } else if (['terminated', 'shutting-down'].includes(inst.estado)) {
      checks.push(check('tipo', t, 5, false, `Terminaste la instancia original ${inst.id}: tenía la configuración de las cajas y una instancia terminada ya no se recupera. Para cambiar el tamaño no hace falta borrarla: se detiene (Stop), Actions → Instance settings → Change instance type, y se vuelve a encender.`));
    } else if (inst.tipo === x.tipoViejo) {
      checks.push(check('tipo', t, 5, false, `${x.instancia} sigue siendo ${x.tipoViejo} (${dinero(vieja.precio * 730)} al mes) con la CPU casi sin usar. Detenla, cámbiale el tipo (Actions → Instance settings → Change instance type) a uno de 2 vCPU y 2 o 4 GiB como t3.small o t3.medium, y enciéndela otra vez.`));
    } else if (tipo && (tipo.vcpu < 2 || tipo.memoria < 2)) {
      checks.push(check('tipo', t, 5, false, `Cambiaste ${x.instancia} a ${tipo.tipo} (${tipo.vcpu} vCPU, ${tipo.memoria} GiB): es barato, pero se queda corto, la API necesita al menos 2 vCPU y 2 GiB. Ahorrar no es elegir lo más chico, es elegir lo justo: prueba t3.small o t3.medium.`));
    } else {
      checks.push(check('tipo', t, 5, false, `Cambiaste ${x.instancia} a ${inst.tipo} (${dinero((tipo?.precio ?? 0) * 730)} al mes), pero no cuesta menos de la mitad que ${x.tipoViejo} (${dinero(vieja.precio * 730)} al mes). Busca en EC2 → Instance types uno de 2 vCPU y 2 o 4 GiB más barato, como t3.small o t3.medium.`));
    }
  }

  // Que la API quede encendida.
  {
    const t = `${x.instancia} quedó encendida (running) con su tipo nuevo`;
    if (bienTipo && inst.estado === 'running') {
      checks.push(check('encendida', t, 3, true, `${x.instancia} está running con ${inst.tipo}: las cajas ya pueden cobrar. Detener una instancia para cambiarle el tipo deja de cobrar el cómputo mientras está apagada, pero el disco EBS se sigue cobrando.`));
    } else if (bienTipo) {
      checks.push(check('encendida', t, 3, false, `${x.instancia} ya tiene el tipo nuevo, pero está ${inst.estado}: mientras esté apagada las 14 cafeterías no pueden cobrar con tarjeta. Enciéndela en EC2 → Instances → Instance state → Start instance.`));
    } else {
      checks.push(check('encendida', t, 3, false, `Este punto se revisa cuando ${x.instancia} ya tiene un tipo más chico (mira el punto anterior) y está encendida.`));
    }
  }
  return checks;
}

/* ============================================================ las cuentas */

function ouDe(org, nombre) {
  if (!org) return null;
  return org.ous.find((o) => o.padre === org.raiz.id && sinAcentos(o.nombre) === sinAcentos(nombre)) ?? org.ous.find((o) => sinAcentos(o.nombre) === sinAcentos(nombre)) ?? null;
}

function cuentaDe(org, nombre, correo, palabra) {
  if (!org) return null;
  const miembros = org.cuentas.filter((c) => !c.admin && c.estado !== 'SUSPENDED');
  return (
    miembros.find((c) => sinAcentos(c.nombre) === sinAcentos(nombre)) ??
    miembros.find((c) => correoIgual(c.correo, correo)) ??
    miembros.find((c) => sinAcentos(c.nombre).includes(palabra) || normal(c.correo).includes(palabra)) ??
    null
  );
}

function piezasOrg(e, x) {
  const org = e.organizations ?? null;
  return {
    org,
    ouProd: ouDe(org, x.ouProduccion),
    ouPru: ouDe(org, x.ouPruebas),
    prod: cuentaDe(org, x.cuentaProduccion, x.correoProduccion, 'produc'),
    pru: cuentaDe(org, x.cuentaPruebas, x.correoPruebas, 'prueba')
  };
}

function revisarCuentas(e, x, p) {
  const checks = [];
  const { org, ouProd, ouPru, prod, pru } = p;
  const sinOrg = 'Todavía no creaste la organización: en AWS Organizations pulsa «Create an organization». Tu cuenta queda como cuenta de administración.';

  checks.push(
    org
      ? check('org', 'Existe una organización de AWS Organizations', 2, true, `Tu cuenta es la cuenta de administración de la organización ${org.id}. Con eso tienes facturación consolidada (una sola factura, y el uso de todas las cuentas se suma para los descuentos por volumen) y puedes poner reglas a las demás cuentas.`)
      : check('org', 'Existe una organización de AWS Organizations', 2, false, sinOrg)
  );

  {
    const t = `Las OU ${x.ouProduccion} y ${x.ouPruebas} existen directamente bajo Root`;
    const bajoRoot = (ou) => ou && ou.padre === org.raiz.id;
    if (!org) checks.push(check('ous', t, 3, false, sinOrg));
    else if (bajoRoot(ouProd) && bajoRoot(ouPru)) checks.push(check('ous', t, 3, true, `Tienes las OU «${ouProd.nombre}» y «${ouPru.nombre}» bajo Root. Una OU es una carpeta de cuentas: lo que le adjuntas (como una SCP) lo heredan todas las cuentas que tenga adentro, hoy y en el futuro.`));
    else {
      const faltan = [!ouProd && x.ouProduccion, !ouPru && x.ouPruebas].filter(Boolean);
      const mal = [ouProd && !bajoRoot(ouProd) && ouProd.nombre, ouPru && !bajoRoot(ouPru) && ouPru.nombre].filter(Boolean);
      const tus = org.ous.length ? ` Tus OU son: ${org.ous.map((o) => `«${o.nombre}»`).join(', ')}.` : ' No tienes ninguna OU.';
      checks.push(check('ous', t, 3, false, `${faltan.length ? `Falta la OU ${faltan.join(' y ')}.` : ''}${mal.length ? ` La OU ${mal.join(' y ')} quedó dentro de otra OU, no directamente bajo Root.` : ''}${tus} Se crean en AWS accounts: selecciona Root → Actions → Organizational unit → Create new.`.trim()));
    }
  }

  const revisarCuenta = (id, cuenta, ou, nombre, correo, ouNombre, puntos, rol) => {
    const t = `La cuenta ${nombre} existe y está en la OU ${ouNombre}`;
    if (!org) return check(id, t, puntos, false, sinOrg);
    if (!cuenta) {
      const otras = org.cuentas.filter((c) => !c.admin);
      return check(id, t, puntos, false, `No encontré la cuenta ${nombre}${otras.length ? ` (tus cuentas miembro son: ${otras.map((c) => `«${c.nombre}» ${c.estado}`).join(', ')})` : ''}. Créala en AWS accounts → Add an AWS account → Create an AWS account, con el correo ${correo}.`);
    }
    const donde = objetivoOrganizacion(e, cuenta.padre);
    if (!ou || cuenta.padre !== ou.id) {
      return check(id, t, puntos, false, `La cuenta «${cuenta.nombre}» (${cuenta.id}) existe, pero está en ${donde?.tipo === 'ROOT' ? 'Root' : `«${donde?.nombre ?? cuenta.padre}»`}, no en la OU ${ouNombre}${ou ? '' : ' (que todavía no existe)'}. Una cuenta nueva nace en Root: selecciónala en AWS accounts → Actions → Move y elige ${ouNombre}.`);
    }
    if (cuenta.estado !== 'ACTIVE') return check(id, t, puntos, false, `La cuenta «${cuenta.nombre}» está ${cuenta.estado}. Espera unos segundos a que quede ACTIVE y vuelve a revisar.`);
    const aviso = sinAcentos(cuenta.nombre) === sinAcentos(nombre) ? '' : ` (se pidió el nombre ${nombre}; la tomé por su nombre o su correo)`;
    return check(id, t, puntos, true, `La cuenta «${cuenta.nombre}» (${cuenta.id})${aviso} está en la OU ${ouNombre}. ${rol}`);
  };
  checks.push(revisarCuenta('pruebas', pru, ouPru, x.cuentaPruebas, x.correoPruebas, x.ouPruebas, 4, 'Si un programador rompe o borra algo ahí, las cajas de Producción ni se enteran: una cuenta es el límite de aislamiento más fuerte de AWS.'));
  checks.push(revisarCuenta('produccion', prod, ouProd, x.cuentaProduccion, x.correoProduccion, x.ouProduccion, 3, 'Producción vive aparte, con sus propias reglas, y su gasto sale en la misma factura consolidada de tu cuenta de administración.'));
  return checks;
}

/* ================================================================== SCP */

const propias = (org) => (org?.politicas ?? []).filter((p) => !p.administradaPorAws);
const tieneDeny = (p) => {
  try {
    const st = JSON.parse(p.documento).Statement;
    return (Array.isArray(st) ? st : [st]).some((d) => d?.Effect === 'Deny');
  } catch {
    return false;
  }
};

function explicarDecision(r, accion, region) {
  if (r.motivo === 'deny-explicito') return `${accion} en ${region} sale Denied por un Deny explícito de «${r.politica}»`;
  if (r.motivo === 'deny-implicito') return `${accion} en ${region} sale Denied porque en el nivel ${r.nivel} ninguna SCP dice Allow (deny implícito)`;
  return `${accion} en ${region} sale Allowed`;
}

function revisarScp(e, x, p) {
  const checks = [];
  const { org, ouPru, pru, prod } = p;
  const sinOrg = 'Primero necesitas la organización, la OU Pruebas y la cuenta de pruebas (tarea anterior).';

  // La SCP propia, con un Deny, adjunta a la OU Pruebas.
  {
    const t = `Las SCP están habilitadas y una SCP propia con un Deny está adjunta a la OU ${x.ouPruebas}`;
    const mias = propias(org);
    const enOu = ouPru ? mias.filter((q) => q.objetivos.includes(ouPru.id) && tieneDeny(q)) : [];
    if (!org) checks.push(check('adjunta', t, 4, false, sinOrg));
    else if (!org.scpHabilitadas) checks.push(check('adjunta', t, 4, false, 'Las SCP siguen deshabilitadas en tu organización. En AWS Organizations → Policies → Service control policies pulsa «Enable service control policies»; después crea tu política y adjúntala.'));
    else if (enOu.length) checks.push(check('adjunta', t, 4, true, `La SCP «${enOu[0].nombre}» está adjunta a la OU ${ouPru.nombre}: la heredan ${x.cuentaPruebas} y cualquier cuenta que metan ahí después, sin que nadie tenga que acordarse de ponérsela.`));
    else if (!mias.length) checks.push(check('adjunta', t, 4, false, 'Ya habilitaste las SCP, pero no hay ninguna política tuya (solo FullAWSAccess, que lo permite todo). En Service control policies → Create policy escribe la que niega las regiones (el editor tiene el ejemplo «Solo permitir us-east-1»).'));
    else {
      const dondes = mias.flatMap((q) => q.objetivos.map((id) => `«${q.nombre}» en ${objetivoOrganizacion(e, id)?.nombre ?? id}`));
      const extra = !ouPru ? ` Además falta la OU ${x.ouPruebas}.` : mias.some((q) => q.objetivos.includes(ouPru.id)) ? ' La que está en la OU no tiene ningún Deny: una SCP nunca da permisos, solo pone el techo; para limitar hay que negar.' : '';
      checks.push(check('adjunta', t, 4, false, `Tus SCP propias están ${dondes.length ? `así: ${dondes.join('; ')}` : 'creadas pero sin adjuntar a nada'}.${extra} Se pedía adjuntarla a la OU ${x.ouPruebas} (en la política → Targets → Attach): si la pones en la cuenta, las cuentas de prueba que se agreguen después no la heredan; si la pones en Root, también limitas a Producción.`));
    }
  }

  const hayPropiaEnRuta = (cuenta) => cuenta && rutaOrganizacion(e, cuenta.id).some((id) => propias(org).some((q) => q.objetivos.includes(id)));

  // Fuera de us-east-1, Pruebas no puede.
  {
    const t = `${x.cuentaPruebas} no puede crear servidores ni bases fuera de us-east-1`;
    if (!org || !pru) checks.push(check('fuera', t, 4, false, sinOrg));
    else {
      const a = accionPermitidaPorScp(e, pru.id, 'ec2:RunInstances', { region: 'eu-west-1' });
      const b = accionPermitidaPorScp(e, pru.id, 'rds:CreateDBInstance', { region: 'sa-east-1' });
      if (!a.permitida && !b.permitida) {
        checks.push(check('fuera', t, 4, true, `Probé desde ${pru.nombre}: ${explicarDecision(a, 'ec2:RunInstances', 'eu-west-1')} y ${explicarDecision(b, 'rds:CreateDBInstance', 'sa-east-1')}. Un Deny explícito de una SCP gana siempre, aunque el usuario sea administrador de esa cuenta: es un techo que nadie adentro puede saltarse.`));
      } else {
        const mal = [a.permitida && 'ec2:RunInstances en eu-west-1', b.permitida && 'rds:CreateDBInstance en sa-east-1'].filter(Boolean);
        const motivo = !org.scpHabilitadas ? 'las SCP no están habilitadas' : !hayPropiaEnRuta(pru) ? `ninguna SCP tuya está adjunta a ${pru.nombre} ni a sus OU` : 'la SCP que tiene encima no niega esas acciones fuera de us-east-1 (revisa que tenga "Effect": "Deny" y la condición aws:RequestedRegion distinta de us-east-1)';
        checks.push(check('fuera', t, 4, false, `Desde ${pru.nombre} todavía se permite ${mal.join(' y ')}: ${motivo}.`));
      }
    }
  }

  // Dentro de us-east-1, Pruebas sí puede trabajar.
  {
    const t = `${x.cuentaPruebas} sí puede crear servidores en us-east-1`;
    if (!org || !pru) checks.push(check('dentro', t, 3, false, sinOrg));
    else if (!org.scpHabilitadas || !hayPropiaEnRuta(pru)) checks.push(check('dentro', t, 3, false, `Este punto revisa que tu SCP no se pase de estricta, y todavía no hay ninguna SCP tuya encima de ${pru.nombre}.`));
    else {
      const r = accionPermitidaPorScp(e, pru.id, 'ec2:RunInstances', { region: 'us-east-1' });
      if (r.permitida) checks.push(check('dentro', t, 3, true, `En us-east-1 ${pru.nombre} sigue pudiendo lanzar servidores: FullAWSAccess lo permite en cada nivel y tu Deny solo aplica fuera de la región. Una SCP no da permisos: pone el techo; adentro, cada usuario necesita además su política de IAM.`));
      else if (r.motivo === 'deny-implicito') checks.push(check('dentro', t, 3, false, `En us-east-1 ${pru.nombre} tampoco puede: en el nivel ${objetivoOrganizacion(e, r.nivel)?.nombre ?? r.nivel} ninguna SCP dice Allow (¿quitaste FullAWSAccess?). Con SCP, cada nivel (Root, la OU y la cuenta) necesita algo que permita; vuelve a adjuntar FullAWSAccess ahí.`));
      else checks.push(check('dentro', t, 3, false, `En us-east-1 ${pru.nombre} tampoco puede: «${r.politica}» niega ec2:RunInstances también dentro de la región. La regla debe negar solo cuando aws:RequestedRegion es distinta de us-east-1 (StringNotEquals).`));
    }
  }

  // Producción no queda limitada.
  {
    const t = `${x.cuentaProduccion} no queda limitada por la regla de Pruebas`;
    if (!org || !prod) checks.push(check('produccion', t, 3, false, 'Primero necesitas la cuenta de producción dentro de su OU (tarea anterior).'));
    else if (!org.scpHabilitadas || !propias(org).some((q) => q.objetivos.length)) checks.push(check('produccion', t, 3, false, 'Este punto revisa dónde quedó tu SCP de regiones, y todavía no tienes ninguna SCP tuya adjunta.'));
    else {
      const r = accionPermitidaPorScp(e, prod.id, 'ec2:RunInstances', { region: 'sa-east-1' });
      if (r.permitida) checks.push(check('produccion', t, 3, true, `${prod.nombre} puede lanzar servidores en otra región (probé sa-east-1): la regla de Pruebas no la toca porque la SCP está en la OU de Pruebas, no en Root. Así cada OU tiene sus propias reglas.`));
      else checks.push(check('produccion', t, 3, false, `${prod.nombre} también quedó limitada: ${explicarDecision(r, 'ec2:RunInstances', 'sa-east-1')}. Lo que adjuntas a Root (o a la OU de Producción) lo heredan todas sus cuentas: deja la SCP solo en la OU ${x.ouPruebas} (Targets → Detach de los demás).`));
    }
  }
  return checks;
}

/* ============================================================ etiquetas */

function revisarEtiquetas(e, x) {
  const checks = [];
  const llave = x.etiqueta;
  {
    const t = `La tabla ${x.tablaPruebas} lleva la etiqueta ${llave} = ${x.valorPruebas}`;
    const tabla = (e.dynamodb?.tablas ?? []).find((tb) => tb.nombre === x.tablaPruebas);
    const tags = tabla?.etiquetas ?? [];
    const exacta = tags.find((g) => g.llave === llave);
    const parecida = tags.find((g) => g.llave !== llave && sinAcentos(g.llave) === sinAcentos(llave));
    if (!tabla) checks.push(check('tabla', t, 4, false, `Ya no existe la tabla ${x.tablaPruebas}: no había que borrarla, solo etiquetarla (es de los programadores).`));
    else if (exacta && sinAcentos(exacta.valor) === sinAcentos(x.valorPruebas)) checks.push(check('tabla', t, 4, true, `La tabla ${x.tablaPruebas} ya dice ${llave} = ${exacta.valor}. Con la etiqueta, su costo se puede separar del de Producción en Cost Explorer y en Budgets.`));
    else if (exacta) checks.push(check('tabla', t, 4, false, `La tabla ${x.tablaPruebas} tiene ${llave} = «${exacta.valor}», no ${x.valorPruebas}: es de los programadores, es gasto de Pruebas. Corrígelo en DynamoDB → la tabla → Additional settings → Tags.`));
    else if (parecida) checks.push(check('tabla', t, 4, false, `La tabla tiene la llave «${parecida.llave}», pero la que usa la cuenta es exactamente «${llave}». Las etiquetas distinguen mayúsculas: para la facturación «${parecida.llave}» y «${llave}» son dos llaves distintas y el gasto saldría repartido en dos.`));
    else checks.push(check('tabla', t, 4, false, `La tabla ${x.tablaPruebas} ${tags.length ? `tiene ${tags.map((g) => `${g.llave}=${g.valor}`).join(', ')}, pero no` : 'no tiene'} la etiqueta ${llave} = ${x.valorPruebas}. Agrégala en DynamoDB → Tables → ${x.tablaPruebas} → Additional settings → Tags → Manage tags.`));
  }
  {
    const t = `La llave ${llave} está activada como etiqueta de asignación de costos`;
    const activas = e.costos?.etiquetasActivas ?? [];
    if (activas.includes(llave)) checks.push(check('activa', t, 4, true, `${llave} está activa en Cost allocation tags. Una etiqueta en los recursos no basta: hasta que la activas, la facturación no la usa para repartir el gasto (y en AWS real tarda hasta 24 horas en aparecer).`));
    else checks.push(check('activa', t, 4, false, `${llave} no está activada${activas.length ? ` (tienes activas: ${activas.join(', ')})` : ''}. Los recursos ya la tienen, pero la facturación solo reparte por las llaves que actives en Billing and Cost Management → Cost allocation tags → selecciona ${llave} → Activate.`));
  }
  {
    const t = `Hay un reporte guardado de Cost Explorer agrupado por la etiqueta ${llave}`;
    const reportes = e.costos?.reportes ?? [];
    const bueno = reportes.find((r) => r.parametros?.agrupar === 'TAG' && r.parametros?.llave === llave);
    if (bueno) checks.push(check('reporte', t, 4, true, `El reporte «${bueno.nombre}» agrupa el gasto por ${llave}: Lupita lo abre en Cost Explorer → Reports y ve cuánto cuesta Producción, cuánto Pruebas y cuánto «No tag key» (lo que falta etiquetar).`));
    else if (reportes.length) checks.push(check('reporte', t, 4, false, `Tienes ${reportes.length === 1 ? 'el reporte' : 'los reportes'} ${reportes.map((r) => `«${r.nombre}» (agrupado por ${r.parametros?.agrupar === 'TAG' ? `la etiqueta ${r.parametros?.llave}` : String(r.parametros?.agrupar ?? 'nada').toLowerCase()})`).join(', ')}, pero ninguno agrupa por la etiqueta ${llave}. En Cost Explorer → Group by → Dimension: Tag → ${llave}, y luego Save to report library.`));
    else checks.push(check('reporte', t, 4, false, `No hay ningún reporte guardado. En Cost Explorer, en el panel derecho, Group by → Dimension: Tag → ${llave} (solo aparece si ya la activaste) y luego «Save to report library».`));
  }
  return checks;
}

/* ============================================================ presupuesto */

const esPorciento = (a, valor) => a.tipoUmbral === 'PERCENTAGE' && Number(a.umbral) === valor;

function checksPresupuesto(b, x) {
  const t1 = `Un presupuesto de costo mensual de $${x.monto} para toda la cuenta`;
  const t2 = `Una alerta Actual al ${x.umbralReal}%`;
  const t3 = `Una alerta Forecasted al ${x.umbralPronostico}%`;
  const t4 = `Las alertas le llegan a ${x.correo}`;
  if (!b) {
    const no = 'No hay ningún presupuesto de costo. Créalo en Billing and Cost Management → Budgets → Create budget.';
    return [check('monto', t1, 4, false, no), check('real', t2, 3, false, no), check('pronostico', t3, 3, false, no), check('correo', t4, 2, false, no)];
  }
  const checks = [];
  const filtrado = b.filtros?.servicios?.length || b.filtros?.etiquetas?.length;
  const monto = Number(b.monto) === x.monto;
  if (b.tipo === 'COST' && b.periodo === 'MONTHLY' && monto && !filtrado) {
    checks.push(check('monto', t1, 4, true, `«${b.nombre}» vigila todo el gasto de la cuenta cada mes contra $${x.monto}. Un presupuesto no apaga nada por sí solo: avisa (y con Budget actions podría aplicar una política), por eso importan sus alertas.`));
  } else {
    const fallas = [b.periodo !== 'MONTHLY' && `es ${String(b.periodo).toLowerCase()} y no mensual`, !monto && `es de $${b.monto} y no de $${x.monto}`, filtrado && 'solo cuenta algunos servicios o etiquetas, no toda la cuenta'].filter(Boolean);
    checks.push(check('monto', t1, 4, false, `Tu presupuesto «${b.nombre}» ${lista(fallas, 'no coincide')}. Edítalo (Budgets → el presupuesto → Edit) para que sea mensual, de $${x.monto} y con el alcance «All AWS services».`));
  }
  const alertas = b.alertas ?? [];
  const real = alertas.find((a) => a.disparador === 'ACTUAL' && (esPorciento(a, x.umbralReal) || (a.tipoUmbral === 'ABSOLUTE_VALUE' && Number(a.umbral) === (x.monto * x.umbralReal) / 100)));
  const pron = alertas.find((a) => a.disparador === 'FORECASTED' && (esPorciento(a, x.umbralPronostico) || (a.tipoUmbral === 'ABSOLUTE_VALUE' && Number(a.umbral) === x.monto)));
  const describir = () => (alertas.length ? `Tus alertas: ${alertas.map((a) => `${a.disparador === 'ACTUAL' ? 'Actual' : 'Forecasted'} > ${a.tipoUmbral === 'PERCENTAGE' ? `${a.umbral}%` : dinero(a.umbral)}`).join('; ')}.` : 'El presupuesto no tiene alertas.');
  checks.push(
    real
      ? check('real', t2, 3, true, `Cuando lo gastado de verdad llegue al ${x.umbralReal}% ($${(x.monto * x.umbralReal) / 100}), llega el aviso: todavía queda margen para reaccionar antes del 100 %.`)
      : check('real', t2, 3, false, `${describir()} Falta una alerta con «Trigger: Actual» al ${x.umbralReal}% del presupuesto${alertas.some((a) => a.disparador === 'ACTUAL' && esPorciento(a, 85)) ? ' (la plantilla Monthly cost budget pone 85 %; cámbialo a 80)' : ''}. Se agrega en el paso «Configure alerts» del presupuesto (Edit).`)
  );
  checks.push(
    pron
      ? check('pronostico', t3, 3, true, `La alerta Forecasted al ${x.umbralPronostico}% avisa cuando AWS calcula que, a este ritmo, el mes cerrará arriba del presupuesto: Lupita se entera días antes de que pase, no cuando ya pasó.`)
      : check('pronostico', t3, 3, false, `${describir()} Falta una alerta con «Trigger: Forecasted» al ${x.umbralPronostico}%. La diferencia: Actual avisa cuando ya se gastó; Forecasted avisa cuando el pronóstico dice que se va a gastar.`)
  );
  const ambas = [real, pron].filter(Boolean);
  if (ambas.length === 2 && ambas.every((a) => (a.correos ?? []).some((c) => correoIgual(c, x.correo)))) {
    checks.push(check('correo', t4, 2, true, `Las dos alertas le llegan a ${x.correo}. Un aviso que no le llega a quien decide no sirve de nada.`));
  } else if (ambas.length < 2) {
    checks.push(check('correo', t4, 2, false, `Este punto se revisa en las dos alertas pedidas (Actual ${x.umbralReal}% y Forecasted ${x.umbralPronostico}%), y todavía falta${ambas.length ? ' una' : 'n las dos'}.`));
  } else {
    const sin = ambas.filter((a) => !(a.correos ?? []).some((c) => correoIgual(c, x.correo)));
    checks.push(check('correo', t4, 2, false, `${sin.length === 2 ? 'Ninguna de las dos alertas' : `La alerta ${sin[0].disparador === 'ACTUAL' ? 'Actual' : 'Forecasted'}`} le llega a ${x.correo}${sin[0].correos?.length ? ` (va a ${sin[0].correos.join(', ')})` : ''}. Agrega el correo en «Email recipients» de cada alerta.`));
  }
  return checks;
}

function revisarPresupuesto(e, x) {
  const todos = (e.costos?.presupuestos ?? []).filter((b) => b.tipo === 'COST');
  const sinFiltro = todos.filter((b) => !(b.filtros?.servicios?.length || b.filtros?.etiquetas?.length));
  const candidatos = sinFiltro.length ? sinFiltro : todos;
  if (!candidatos.length) return checksPresupuesto(null, x);
  return mejorPor(candidatos, (b) => checksPresupuesto(b, x)).checks;
}

/* ============================================================ calculadora */

const lineaEc2 = (s, x) => s.servicio === 'ec2' && s.config?.tipo === x.tipoCalc && Number(s.config?.cantidad) === x.servidores && (s.config?.sistema ?? 'linux') === 'linux';
const esOnDemand = (s) => (s.config?.pago ?? 'ondemand') === 'ondemand' && Number(s.config?.utilizacion ?? 100) === 100;
const esCompute1 = (s) => s.config?.pago === 'compute-sp' && Number(s.config?.plazo) === 1 && (s.config?.opcionPago ?? 'none') === 'none';

function describirLinea(s) {
  const c = s.config ?? {};
  if (s.servicio !== 'ec2') return `${s.servicio.toUpperCase()} (${dinero(s.mensual)}/mes)`;
  const pago = { ondemand: `On-Demand al ${c.utilizacion ?? 100}%`, 'compute-sp': `Compute Savings Plans ${c.plazo} año(s) ${c.opcionPago}`, 'ec2-sp': `EC2 Instance Savings Plans ${c.plazo} año(s) ${c.opcionPago}`, spot: 'Spot' }[c.pago ?? 'ondemand'] ?? c.pago;
  return `${c.cantidad} × ${c.tipo} ${c.sistema ?? 'linux'}, ${pago} (${dinero(s.mensual)}/mes)`;
}

function checksEstimacion(est, x) {
  const t1 = `La estimación se llama ${x.estimacion}`;
  const t2 = `Una línea EC2 con ${x.servidores} × ${x.tipoCalc} Linux On-Demand al 100%`;
  const t3 = `Una línea EC2 con ${x.servidores} × ${x.tipoCalc} Linux con Compute Savings Plan, 1 año, No upfront`;
  if (!est) {
    const no = 'No hay ninguna estimación guardada. Créala en Billing and Cost Management → Pricing Calculator → Create estimate.';
    return [check('estimacion', t1, 2, false, no), check('ondemand', t2, 4, false, no), check('sp', t3, 4, false, no)];
  }
  const base = { sistema: 'linux', cantidad: x.servidores, tipo: x.tipoCalc, ebsGb: 0 };
  const od = precioCalculadora('ec2', { ...base, pago: 'ondemand', utilizacion: 100 }).mensual;
  const sp = precioCalculadora('ec2', { ...base, pago: 'compute-sp', plazo: 1, opcionPago: 'none' }).mensual;
  const ec2 = est.servicios.filter((s) => s.servicio === 'ec2');
  const lineas = ec2.length ? `Tus líneas de EC2: ${ec2.map(describirLinea).join('; ')}.` : 'La estimación no tiene ninguna línea de Amazon EC2.';
  const checks = [];
  checks.push(
    sinAcentos(est.nombre) === sinAcentos(x.estimacion)
      ? check('estimacion', t1, 2, true, `La estimación «${est.nombre}» queda guardada para compartirla (Share) o exportarla: estimar antes de crear es la primera práctica de Cost Optimization (cost modeling).`)
      : check('estimacion', t1, 2, false, `Tu estimación se llama «${est.nombre}», no ${x.estimacion}. El nombre se cambia arriba, junto a «My Estimate» (Edit).`)
  );
  const lineaOd = ec2.find((s) => lineaEc2(s, x) && esOnDemand(s));
  checks.push(
    lineaOd
      ? check('ondemand', t2, 4, true, `On-Demand: ${x.servidores} × ${x.tipoCalc} todo el mes cuestan unos ${dinero(lineaOd.mensual)} al mes, sin compromiso: lo pagas por hora y lo apagas cuando quieras.`)
      : check('ondemand', t2, 4, false, `${lineas} Falta la de ${x.servidores} × ${x.tipoCalc} Linux pagando On-Demand con utilización 100% (unos ${dinero(od)} al mes). Revisa el tipo, el número de instancias y «Payment options».`)
  );
  const lineaSp = ec2.find((s) => lineaEc2(s, x) && esCompute1(s));
  const ec2sp = ec2.find((s) => lineaEc2(s, x) && s.config?.pago === 'ec2-sp');
  checks.push(
    lineaSp
      ? check('sp', t3, 4, true, `Con un Compute Savings Plan a 1 año sin pago adelantado pagarías unos ${dinero(lineaSp.mensual)} al mes contra ${dinero(lineaOd?.mensual ?? od)} On-Demand: unos ${dinero((lineaOd?.mensual ?? od) - lineaSp.mensual)} menos cada mes a cambio de comprometerte a un gasto por hora durante un año. El de tipo Compute aplica a cualquier familia y región de EC2, y también a Fargate y Lambda; para servidores que siempre están prendidos conviene.`)
      : check('sp', t3, 4, false, `${lineas} Falta la de ${x.servidores} × ${x.tipoCalc} con Compute Savings Plans, plazo 1 año y No upfront (unos ${dinero(sp)} al mes).${ec2sp ? ' Elegiste EC2 Instance Savings Plans: descuenta un poco más, pero te amarra a una familia de instancias en una región; se pidió Compute, que se mueve contigo si cambias de tipo.' : ''}`)
  );
  return checks;
}

function revisarCalculadora(e, x) {
  const ests = e.costos?.estimaciones ?? [];
  if (!ests.length) return checksEstimacion(null, x);
  return mejorPor(ests, (est) => checksEstimacion(est, x)).checks;
}

/* ================================================================ soporte */

function revisarSoporte(e, x) {
  const t = 'El plan de soporte es Business Support+';
  const plan = e.costos?.planSoporte ?? 'basic';
  if (plan === x.plan) {
    return [check('plan', t, 6, true, 'Business Support+ es el plan más barato con casos técnicos 24/7 y respuesta en menos de 1 hora cuando producción está caída (menos de 30 minutos si es crítico para el negocio). Además desbloquea todos los chequeos de Trusted Advisor. Enterprise (desde $5,000 al mes) agrega un TAM y respuesta de 15 minutos: demasiado para una cadena de cafeterías.')];
  }
  const nombre = planSoporte(plan).nombre;
  const porque = {
    basic: 'con Basic solo puedes abrir casos de cuenta y facturación, no técnicos: si la API se cae un sábado, nadie de AWS te ayuda a levantarla.',
    enterprise: 'Enterprise cumple, pero empieza en $5,000 al mes e incluye un TAM que una cadena de 14 cafeterías no necesita. Se pidió el más barato que cumpla.',
    'unified-operations': 'Unified Operations empieza en $50,000 al mes: es para empresas con sistemas críticos enormes. Se pidió el más barato que cumpla.'
  }[plan] ?? 'no es el más barato que cumple.';
  return [check('plan', t, 6, false, `Tu cuenta tiene ${nombre}: ${porque} Cámbialo en Support → Support plans (Manage Support Plan) a Business Support+.`)];
}

/* ===================================================== Well-Architected */

const PREGUNTAS = ['SEC1', 'COST2', 'COST3', 'COST6'];
const PRACTICAS = ['SEC01-BP01', 'SEC01-BP02', 'COST02-BP03', 'COST02-BP05', 'COST03-BP02', 'COST03-BP05', 'COST06-BP01', 'COST06-BP02'];
const contestada = (r) => Boolean(r && !r.noAplica && (r.elegidas?.length || r.ninguna));

function checksCarga(c, x) {
  const t1 = `La carga ${x.carga} existe en Production y us-east-1`;
  const t2 = 'Las preguntas SEC 1, COST 2, COST 3 y COST 6 están contestadas';
  const t3 = 'Las respuestas marcan las prácticas que hiciste hoy';
  const t4 = 'Hay un milestone guardado después de contestar';
  if (!c) {
    const no = 'No hay ninguna carga de trabajo. Defínela en AWS Well-Architected Tool → Workloads → Define workload.';
    return [check('carga', t1, 3, false, no), check('respuestas', t2, 3, false, no), check('practicas', t3, 2, false, no), check('hito', t4, 2, false, no)];
  }
  const checks = [];
  const nombreOk = sinAcentos(c.nombre) === sinAcentos(x.carga);
  const fallas = [!nombreOk && `se llama «${c.nombre}» y no ${x.carga}`, c.entorno !== 'PRODUCTION' && 'su ambiente es Pre-production', !(c.regiones ?? []).includes('us-east-1') && 'no tiene la región us-east-1'].filter(Boolean);
  checks.push(
    fallas.length
      ? check('carga', t1, 3, false, `Revisé tu carga «${c.nombre}»: ${lista(fallas)}. Corrígelo en la carga → pestaña Properties → Edit.`)
      : check('carga', t1, 3, true, `La carga «${c.nombre}» (Production, us-east-1) queda registrada: la revisión se hace sobre una carga concreta, no sobre «la cuenta» en general.`)
  );
  const faltan = PREGUNTAS.filter((id) => !contestada(c.respuestas?.[id]));
  const clave = (id) => preguntaWa(id)?.clave ?? id;
  checks.push(
    faltan.length
      ? check('respuestas', t2, 3, false, `Te falta contestar ${lista(faltan.map(clave))}${faltan.some((id) => c.respuestas?.[id]?.noAplica) ? ' (marcar «Question does not apply» no cuenta: sí aplican)' : ''}. En el detalle de la carga pulsa Start reviewing (o Continue reviewing) y elige cada pregunta en la lista de la izquierda.`)
      : check('respuestas', t2, 3, true, 'Contestaste SEC 1, COST 2, COST 3 y COST 6. Cada práctica que no marcas se vuelve un riesgo (alto o medio) en el Improvement plan: la revisión no es un examen, es una lista de pendientes.')
  );
  const marcadas = new Set(PREGUNTAS.flatMap((id) => c.respuestas?.[id]?.elegidas ?? []));
  const sinMarcar = PRACTICAS.filter((b) => !marcadas.has(b));
  const titulo = (b) => {
    const p = PREGUNTAS.flatMap((id) => preguntaWa(id)?.practicas ?? []).find((y) => y.id === b);
    return p ? `${b} «${p.titulo}»` : b;
  };
  checks.push(
    sinMarcar.length
      ? check('practicas', t3, 2, false, `Hoy sí hiciste cosas que la revisión no refleja; falta marcar ${sinMarcar.map(titulo).join(', ')}. Separaste cuentas, protegiste la raíz, pusiste controles (SCP y Budgets), etiquetas, Cost Explorer, estimaste y elegiste el tamaño con datos: contesta con la verdad.`)
      : check('practicas', t3, 2, true, 'Tus respuestas reflejan lo que hiciste: cuentas separadas con Organizations, raíz con MFA, controles de gasto (SCP y Budgets), etiquetas con Cost Explorer, estimación previa y right-sizing. Lo que no marcaste queda en el Improvement plan como siguiente paso.')
  );
  const hito = (c.hitos ?? []).find((h) => PREGUNTAS.every((id) => contestada(h.respuestas?.[id])));
  checks.push(
    hito
      ? check('hito', t4, 2, true, `El milestone «${hito.nombre}» guarda la foto de la revisión: en la siguiente podrás comparar cuántos riesgos altos y medios bajaron.`)
      : check('hito', t4, 2, false, (c.hitos ?? []).length ? `Tienes ${c.hitos.length === 1 ? 'el milestone' : 'los milestones'} ${c.hitos.map((h) => `«${h.nombre}»`).join(', ')}, pero se guardó antes de contestar las cuatro preguntas: un milestone es una foto y no se actualiza. Guarda otro ahora (Save milestone).` : 'No hay ningún milestone. Cuando termines de contestar, en el detalle de la carga pulsa «Save milestone».')
  );
  return checks;
}

function revisarWa(e, x) {
  const cargas = e.wellarchitected?.cargas ?? [];
  if (!cargas.length) return checksCarga(null, x);
  return mejorPor(cargas, (c) => checksCarga(c, x)).checks;
}

/* ================================================================== bono */

function checksBono(b, x) {
  const t1 = `Un presupuesto mensual de $${x.montoPruebas} filtrado por ${x.etiqueta} = ${x.valorPruebas}`;
  const t2 = `Con al menos una alerta para ${x.correo}`;
  if (!b) {
    const no = `Opcional: no hay ningún presupuesto filtrado por la etiqueta ${x.etiqueta}. Si te sobra tiempo, créalo con Budget scope → Filter specific AWS cost dimensions → Tag.`;
    return [check('filtro', t1, 5, false, no), check('alerta', t2, 3, false, no)];
  }
  const filtro = (b.filtros?.etiquetas ?? []).some((g) => g.llave === x.etiqueta && sinAcentos(g.valor) === sinAcentos(x.valorPruebas));
  const bien = b.tipo === 'COST' && b.periodo === 'MONTHLY' && Number(b.monto) === x.montoPruebas && filtro;
  const alerta = (b.alertas ?? []).some((a) => (a.correos ?? []).some((c) => correoIgual(c, x.correo)));
  return [
    bien
      ? check('filtro', t1, 5, true, `«${b.nombre}» solo cuenta lo etiquetado ${x.etiqueta} = ${x.valorPruebas}: los programadores tienen su propio tope de $${x.montoPruebas} sin mezclarse con el gasto de las cajas. Por eso importa etiquetar todo lo que se crea.`)
      : check('filtro', t1, 5, false, `Tu presupuesto «${b.nombre}» ${!filtro ? `no está filtrado por ${x.etiqueta} = ${x.valorPruebas}` : `es de $${b.monto} ${String(b.periodo).toLowerCase()}, no de $${x.montoPruebas} mensual`}. Edítalo: en Budget scope elige Tag → ${x.etiqueta} → ${x.valorPruebas}.`),
    alerta
      ? check('alerta', t2, 3, true, `El tope de Pruebas avisa a ${x.correo}.`)
      : check('alerta', t2, 3, false, `«${b.nombre}» no tiene ninguna alerta para ${x.correo}: un presupuesto sin alertas solo se ve si alguien entra a la consola a buscarlo.`)
  ];
}

function revisarBono(e, x) {
  const filtrados = (e.costos?.presupuestos ?? []).filter((b) => (b.filtros?.etiquetas ?? []).some((g) => sinAcentos(g.llave) === sinAcentos(x.etiqueta)));
  if (!filtrados.length) return checksBono(null, x);
  return mejorPor(filtrados, (b) => checksBono(b, x)).checks;
}

/* =============================================================== revisar */

export function revisar(estadoOriginal, datos) {
  const e = preparar(estadoOriginal);
  const x = datosLab(datos);
  const p = piezasOrg(e, x);
  return armar(LAB.tareas(datos), {
    seguridad: revisarSeguridad(e, x),
    ahorro: revisarAhorro(e, x),
    cuentas: revisarCuentas(e, x, p),
    scp: revisarScp(e, x, p),
    etiquetas: revisarEtiquetas(e, x),
    presupuesto: revisarPresupuesto(e, x),
    calculadora: revisarCalculadora(e, x),
    soporte: revisarSoporte(e, x),
    wa: revisarWa(e, x),
    bono: revisarBono(e, x)
  });
}

/* ============================================================== solución */

const MINUTO = 60_000;
const pasar = (e, ms) => avanzar(e, reloj.ahora() + ms);

/** La SCP de regiones que recomienda AWS (la misma del ejemplo del editor). */
export const SCP_REGIONES = JSON.stringify(
  {
    Version: '2012-10-17',
    Statement: [{ Sid: 'DenyOutsideUsEast1', Effect: 'Deny', NotAction: ['iam:*', 'organizations:*', 'support:*', 'cloudfront:*', 'route53:*'], Resource: '*', Condition: { StringNotEquals: { 'aws:RequestedRegion': ['us-east-1'] } } }]
  },
  null,
  2
);

/** La cuenta resuelta, hecha solo con acciones del modelo (como en la consola). */
export function solucion(datos) {
  const x = datosLab(datos);
  const e = LAB.estadoInicial(datos);
  const tcp = (puerto, origen) => ({ protocolo: 'tcp', desde: puerto, hasta: puerto, origen });

  // seguridad: snapshot privado, SSH solo desde casa, MFA en la raíz
  compartirSnapshotRds(e, x.snapshot, { publico: false });
  const sg = e.gruposSeguridad.find((g) => g.nombre === x.sg);
  editarReglasSg(e, sg.id, 'entrada', [tcp(80, '0.0.0.0/0'), tcp(22, `${x.ipCasa}/32`)]);
  asignarMfaRaiz(e);

  // ahorro: liberar la IP y cambiar el tamaño de la misma instancia
  liberarEip(e, e.eips.find((p) => p.nombre === x.eip).id);
  const inst = e.instancias.find((i) => i.nombre === x.instancia);
  detenerInstancia(e, inst.id);
  pasar(e, MINUTO);
  cambiarTipoInstancia(e, inst.id, 't3.small');
  iniciarInstancia(e, inst.id);

  // cuentas: la organización, las OU y las cuentas (nacen en Root y se mueven)
  crearOrganizacion(e);
  const ouProd = crearUnidadOrganizativa(e, { nombre: x.ouProduccion });
  const ouPru = crearUnidadOrganizativa(e, { nombre: x.ouPruebas });
  const prod = crearCuentaOrganizacion(e, { nombre: x.cuentaProduccion, correo: x.correoProduccion });
  const pru = crearCuentaOrganizacion(e, { nombre: x.cuentaPruebas, correo: x.correoPruebas });
  pasar(e, MINUTO);
  moverCuentaOrganizacion(e, prod.id, ouProd.id);
  moverCuentaOrganizacion(e, pru.id, ouPru.id);

  // scp: habilitar, crear y adjuntar a la OU Pruebas
  habilitarScp(e);
  const pol = crearPoliticaScp(e, { nombre: x.scp, descripcion: 'Pruebas solo en N. Virginia', documento: SCP_REGIONES });
  adjuntarPoliticaScp(e, pol.id, ouPru.id);

  // etiquetas: la tabla, la activación y el reporte agrupado por la etiqueta
  editarEtiquetasDynamo(e, x.tablaPruebas, [{ llave: x.etiqueta, valor: x.valorPruebas }]);
  activarEtiquetasCosto(e, [x.etiqueta]);
  guardarReporteCostos(e, { nombre: x.reporte, parametros: { rango: '6m', granularidad: 'MONTHLY', agrupar: 'TAG', llave: x.etiqueta, servicios: [], etiquetaLlave: null, etiquetaValores: [], tipos: [], pronostico: false } });

  // presupuesto (y el bono: el tope de Pruebas)
  crearPresupuesto(e, {
    nombre: x.presupuesto,
    tipo: 'COST',
    periodo: 'MONTHLY',
    monto: x.monto,
    alertas: [
      { umbral: x.umbralReal, tipoUmbral: 'PERCENTAGE', disparador: 'ACTUAL', correos: [x.correo] },
      { umbral: x.umbralPronostico, tipoUmbral: 'PERCENTAGE', disparador: 'FORECASTED', correos: [x.correo] }
    ]
  });
  crearPresupuesto(e, {
    nombre: x.presupuestoPruebas,
    tipo: 'COST',
    periodo: 'MONTHLY',
    monto: x.montoPruebas,
    filtros: { servicios: [], etiquetas: [{ llave: x.etiqueta, valor: x.valorPruebas }] },
    alertas: [{ umbral: 100, tipoUmbral: 'PERCENTAGE', disparador: 'ACTUAL', correos: [x.correo] }]
  });

  // calculadora: On-Demand contra Compute Savings Plan
  const est = crearEstimacion(e, { nombre: x.estimacion });
  const base = { sistema: 'linux', tenencia: 'shared', carga: 'constante', cantidad: x.servidores, tipo: x.tipoCalc, ebsTipo: 'gp3', ebsGb: 0 };
  guardarServicioEstimacion(e, est.id, { servicio: 'ec2', descripcion: 'On-Demand', config: { ...base, pago: 'ondemand', utilizacion: 100 } });
  guardarServicioEstimacion(e, est.id, { servicio: 'ec2', descripcion: 'Compute Savings Plan', config: { ...base, pago: 'compute-sp', plazo: 1, opcionPago: 'none' } });

  // soporte
  cambiarPlanSoporte(e, x.plan);

  // Trusted Advisor: revisar otra vez después de arreglar
  refrescarAdvisor(e);

  // wa: la carga, las respuestas y el milestone
  const carga = crearCargaWa(e, { nombre: x.carga, descripcion: 'API de las cajas de las 14 cafeterias', responsable: 'Lupita Ramirez', entorno: 'PRODUCTION', regiones: ['us-east-1'] });
  responderPreguntaWa(e, carga.id, 'SEC1', { elegidas: ['SEC01-BP01', 'SEC01-BP02'] });
  responderPreguntaWa(e, carga.id, 'COST2', { elegidas: ['COST02-BP03', 'COST02-BP05'] });
  responderPreguntaWa(e, carga.id, 'COST3', { elegidas: ['COST03-BP02', 'COST03-BP05'] });
  responderPreguntaWa(e, carga.id, 'COST6', { elegidas: ['COST06-BP01', 'COST06-BP02'] });
  guardarHitoWa(e, carga.id, x.hito);

  pasar(e, 5 * MINUTO);
  return e;
}
