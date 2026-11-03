// Pruebas del modelo de gobierno: AWS Organizations (OU, cuentas, SCP y su
// evaluación) y AWS Well-Architected Tool (workloads, respuestas, riesgos,
// milestones). Reloj fijo: nada espera de verdad.

import * as m from '../../public/consola/modelo.js';

export const titulo = 'Organizations y Well-Architected';

export async function probar() {
  const fallas = [];
  const espera = (cond, texto) => {
    if (!cond) fallas.push(texto);
  };
  /** Corre fn y devuelve el código del ErrorAws (o null si no falló). */
  const codigo = (fn) => {
    try {
      fn();
      return null;
    } catch (e) {
      if (!(e instanceof m.ErrorAws)) throw e;
      return e.codigo;
    }
  };
  const relojAntes = m.reloj.ahora;
  let t = Date.parse('2026-11-10T16:00:00Z');
  m.reloj.ahora = () => t;
  try {
    /* ------------------------------------------------ cuenta vieja */
    const vieja = m.cuentaNueva({ cuentaId: '111122223333' });
    delete vieja.organizations;
    delete vieja.wellarchitected;
    m.avanzar(vieja, t);
    espera(vieja.organizations === null, 'una cuenta vieja debe quedar con organizations = null tras avanzar');
    espera(Array.isArray(vieja.wellarchitected?.cargas), 'una cuenta vieja debe recibir wellarchitected.cargas');
    delete vieja.wellarchitected;
    espera(m.crearCargaWa(vieja, { nombre: 'tienda', descripcion: 'La tienda', responsable: 'Ana', entorno: 'PREPRODUCTION', regiones: ['us-east-1'] }).nombre === 'tienda', 'crearCargaWa debe migrar una cuenta sin wellarchitected');
    espera(m.accionPermitidaPorScp(m.cuentaNueva({}), '123456789012', 'rds:CreateDBInstance').permitida, 'sin organización todo se permite');

    /* ------------------------------------------------ Organizations */
    const e = m.cuentaNueva({ cuentaId: '123456789012', nombre: 'Ana López' });
    espera(e.organizations === null, 'la cuenta nueva no trae organización');
    espera(codigo(() => m.crearUnidadOrganizativa(e, { nombre: 'X' })) === 'AWSOrganizationsNotInUseException', 'sin organización no se crean OU');
    const org = m.crearOrganizacion(e);
    espera(/^o-[a-z0-9]{10}$/.test(org.id) && /^r-[a-z0-9]{4}$/.test(org.raiz.id), `ids de organización y raíz con el formato de AWS (${org.id}, ${org.raiz.id})`);
    espera(org.cuentas.length === 1 && org.cuentas[0].admin && org.cuentas[0].id === '123456789012', 'la cuenta del alumno es la de administración');
    espera(codigo(() => m.crearOrganizacion(e)) === 'AlreadyInOrganizationException', 'no se crea dos veces');

    const prod = m.crearUnidadOrganizativa(e, { nombre: 'Produccion' });
    const pruebas = m.crearUnidadOrganizativa(e, { nombre: 'Pruebas' });
    espera(new RegExp(`^ou-${org.raiz.id.slice(2)}-[a-z0-9]{8}$`).test(prod.id), `id de OU con el formato de AWS (${prod.id})`);
    espera(codigo(() => m.crearUnidadOrganizativa(e, { nombre: 'Pruebas' })) === 'DuplicateOrganizationalUnitException', 'OU duplicada en el mismo padre');
    espera(codigo(() => m.crearUnidadOrganizativa(e, { nombre: '' })) === 'InvalidInputException', 'OU sin nombre');
    const hija = m.crearUnidadOrganizativa(e, { nombre: 'Pruebas', padre: prod.id });
    espera(hija.padre === prod.id, 'una OU con el mismo nombre sí cabe en otro padre');
    let padre = hija.id;
    for (let i = 0; i < 3; i++) padre = m.crearUnidadOrganizativa(e, { nombre: `n${i}`, padre }).id;
    espera(codigo(() => m.crearUnidadOrganizativa(e, { nombre: 'muy-honda', padre })) === 'ConstraintViolationException', 'máximo 5 niveles de OU');

    const dev = m.crearCuentaOrganizacion(e, { nombre: 'dev', correo: 'dev@example.com' });
    espera(/^\d{12}$/.test(dev.id) && dev.estado === 'CREATING' && dev.rol === 'OrganizationAccountAccessRole', 'la cuenta creada nace CREATING con su rol');
    espera(codigo(() => m.crearCuentaOrganizacion(e, { nombre: 'otra', correo: 'DEV@example.com' })) === 'EMAIL_ALREADY_EXISTS', 'correo repetido');
    espera(codigo(() => m.crearCuentaOrganizacion(e, { nombre: 'otra', correo: 'no-es-correo' })) === 'InvalidInputException', 'correo inválido');
    espera(codigo(() => m.moverCuentaOrganizacion(e, dev.id, pruebas.id)) === 'ConcurrentModificationException', 'no se mueve mientras se crea');
    t += m.DURACION_GOBIERNO.cuentaSeCrea;
    espera(m.avanzar(e, t) && dev.estado === 'ACTIVE', 'la cuenta pasa a ACTIVE');
    m.moverCuentaOrganizacion(e, dev.id, pruebas.id);
    espera(dev.padre === pruebas.id, 'Move cambia el padre');
    espera(codigo(() => m.moverCuentaOrganizacion(e, dev.id, pruebas.id)) === 'DuplicateAccountException', 'mover al mismo lugar');
    espera(codigo(() => m.moverCuentaOrganizacion(e, dev.id, 'ou-zzzz-noexiste')) === 'DestinationParentNotFoundException', 'destino que no existe');
    espera(codigo(() => m.eliminarUnidadOrganizativa(e, pruebas.id)) === 'OrganizationalUnitNotEmptyException', 'no se borra una OU con cuentas');

    const inv = m.invitarCuentaOrganizacion(e, { destino: '444455556666' });
    espera(inv.estado === 'OPEN', 'la invitación queda OPEN');
    espera(codigo(() => m.invitarCuentaOrganizacion(e, { destino: '444455556666' })) === 'DuplicateHandshakeException', 'invitación repetida');
    espera(codigo(() => m.invitarCuentaOrganizacion(e, { destino: dev.correo })) === 'HandshakeConstraintViolationException', 'invitar a una cuenta que ya es miembro');
    t += m.DURACION_GOBIERNO.invitacionSeAcepta;
    m.avanzar(e, t);
    const invitada = e.organizations.cuentas.find((c) => c.id === '444455556666');
    espera(inv.estado === 'ACCEPTED' && invitada?.metodo === 'INVITED' && invitada.padre === org.raiz.id, 'la invitación se acepta sola y la cuenta entra a Root');
    const inv2 = m.invitarCuentaOrganizacion(e, { destino: 'socio@example.com' });
    m.cancelarInvitacionOrganizacion(e, inv2.id);
    t += m.DURACION_GOBIERNO.invitacionSeAcepta;
    m.avanzar(e, t);
    espera(inv2.estado === 'CANCELED' && !e.organizations.cuentas.some((c) => c.correo === 'socio@example.com'), 'una invitación cancelada no se acepta');

    /* ------------------------------------------------ SCP */
    const negarRds = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Deny', Action: 'rds:*', Resource: '*' }] });
    espera(codigo(() => m.adjuntarPoliticaScp(e, 'p-FullAWSAccess', pruebas.id)) === 'PolicyNotFoundException', 'antes de habilitar no existe FullAWSAccess');
    const pol = m.crearPoliticaScp(e, { nombre: 'negar-rds', documento: negarRds });
    espera(codigo(() => m.adjuntarPoliticaScp(e, pol.id, pruebas.id)) === 'PolicyTypeNotEnabledException', 'sin habilitar SCP no se adjunta');
    m.habilitarScp(e);
    const full = e.organizations.politicas.find((p) => p.id === m.FULL_AWS_ACCESS);
    const todos = [org.raiz.id, ...e.organizations.ous.map((o) => o.id), ...e.organizations.cuentas.map((c) => c.id)];
    espera(full && todos.every((id) => full.objetivos.includes(id)), 'al habilitar, FullAWSAccess queda en la raíz, cada OU y cada cuenta');
    espera(codigo(() => m.habilitarScp(e)) === 'PolicyTypeAlreadyEnabledException', 'habilitar dos veces');
    espera(m.accionPermitidaPorScp(e, dev.id, 'rds:CreateDBInstance').permitida, 'con solo FullAWSAccess todo pasa');

    m.adjuntarPoliticaScp(e, pol.id, pruebas.id);
    const r1 = m.accionPermitidaPorScp(e, dev.id, 'rds:CreateDBInstance');
    espera(!r1.permitida && r1.politica === 'negar-rds' && r1.motivo === 'deny-explicito' && r1.nivel === pruebas.id, `explicit deny por la SCP de la OU (${JSON.stringify(r1)})`);
    espera(m.accionPermitidaPorScp(e, dev.id, 'RDS:createdbcluster').politica === 'negar-rds', 'las acciones no distinguen mayúsculas');
    espera(m.accionPermitidaPorScp(e, dev.id, 's3:PutObject').permitida, 'lo que la SCP no niega sigue permitido');
    espera(m.accionPermitidaPorScp(e, invitada.id, 'rds:CreateDBInstance').permitida, 'una cuenta fuera de la OU no hereda la SCP');
    espera(m.accionPermitidaPorScp(e, '123456789012', 'rds:CreateDBInstance').motivo === 'cuenta-administracion', 'la cuenta de administración no se ve afectada');
    espera(codigo(() => m.adjuntarPoliticaScp(e, pol.id, pruebas.id)) === 'DuplicatePolicyAttachmentException', 'adjuntar dos veces');
    espera(codigo(() => m.eliminarPoliticaScp(e, pol.id)) === 'PolicyInUseException', 'no se borra una SCP adjunta');
    espera(codigo(() => m.editarPoliticaScp(e, m.FULL_AWS_ACCESS, { descripcion: 'x' })) === 'AccessDeniedException', 'FullAWSAccess no se edita');
    espera(codigo(() => m.desadjuntarPoliticaScp(e, m.FULL_AWS_ACCESS, dev.id)) === 'ConstraintViolationException', 'un objetivo no se queda sin SCP');

    // Deny implícito: la OU solo con una SCP de Allow para S3.
    const soloS3 = m.crearPoliticaScp(e, { nombre: 'solo-s3', documento: JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: 's3:*', Resource: '*' }] }) });
    m.adjuntarPoliticaScp(e, soloS3.id, prod.id);
    m.desadjuntarPoliticaScp(e, m.FULL_AWS_ACCESS, prod.id);
    m.moverCuentaOrganizacion(e, invitada.id, prod.id);
    const r2 = m.accionPermitidaPorScp(e, invitada.id, 'ec2:RunInstances');
    espera(!r2.permitida && r2.motivo === 'deny-implicito' && r2.politica === null && r2.nivel === prod.id, `deny implícito sin Allow en la OU (${JSON.stringify(r2)})`);
    espera(m.accionPermitidaPorScp(e, invitada.id, 's3:GetObject').permitida, 'lo que permite la lista sí pasa');

    // Región con NotAction y Condition (la SCP típica de regiones).
    const regiones = m.crearPoliticaScp(e, {
      nombre: 'solo-us-east-1',
      documento: JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Deny', NotAction: ['iam:*', 'organizations:*'], Resource: '*', Condition: { StringNotEquals: { 'aws:RequestedRegion': ['us-east-1'] } } }] })
    });
    m.adjuntarPoliticaScp(e, regiones.id, org.raiz.id);
    espera(m.accionPermitidaPorScp(e, dev.id, 's3:PutObject', { region: 'us-east-1' }).permitida, 'en us-east-1 se permite');
    espera(m.accionPermitidaPorScp(e, dev.id, 's3:PutObject', { region: 'eu-west-1' }).politica === 'solo-us-east-1', 'fuera de us-east-1 se niega');
    espera(m.accionPermitidaPorScp(e, dev.id, 'iam:CreateUser', { region: 'eu-west-1' }).permitida, 'NotAction excluye IAM');

    // Validación del editor.
    const prob = (txt) => m.revisarDocumentoScp(txt).problemas.map((p) => p.titulo);
    espera(prob(negarRds).length === 0, 'una SCP correcta no tiene problemas');
    espera(prob('{"Version":"2012-10-17", "Statement": [').includes('JSON Syntax'), 'JSON roto');
    espera(prob('{"Statement":{"Effect":"Deny","Action":"rds:*","Resource":"*"}}').includes('Missing Version'), 'falta Version');
    espera(prob('{"Version":"2012-10-17","Statement":{"Effect":"Deny","Principal":"*","Action":"rds:*","Resource":"*"}}').includes('Unsupported element'), 'Principal no se acepta');
    espera(prob('{"Version":"2012-10-17","Statement":{"Effect":"Allow","Action":"s3:*","Resource":"arn:aws:s3:::x"}}').includes('Invalid Resource'), 'Allow solo con Resource "*"');
    espera(prob('{"Version":"2012-10-17","Statement":{"Effect":"Deny","Action":"rds","Resource":"*"}}').includes('Invalid Action'), 'acción sin servicio');
    espera(prob('{"Version":"2012-10-17","Statement":{"Effect":"Deny","Action":[],"Resource":"*"}}').includes('Missing Action'), 'Action vacío');
    espera(codigo(() => m.crearPoliticaScp(e, { nombre: 'mala', documento: '{}' })) === 'MalformedPolicyDocumentException', 'crear con documento malo');
    espera(codigo(() => m.crearPoliticaScp(e, { nombre: 'negar-rds', documento: negarRds })) === 'DuplicatePolicyException', 'nombre de SCP repetido');
    espera(codigo(() => m.crearPoliticaScp(e, { nombre: 'enorme', documento: negarRds + ' '.repeat(5200) })) === 'ConstraintViolationException', 'SCP de más de 5,120 caracteres');

    // Quitar, cerrar y borrar.
    espera(codigo(() => m.quitarCuentaOrganizacion(e, '123456789012')) === 'ConstraintViolationException', 'no se quita la cuenta de administración');
    espera(codigo(() => m.quitarCuentaOrganizacion(e, dev.id)) === 'ConstraintViolationException', 'una cuenta creada no sale sin cerrarse');
    m.cerrarCuentaOrganizacion(e, dev.id);
    espera(dev.estado === 'SUSPENDED', 'Close deja la cuenta SUSPENDED');
    m.quitarCuentaOrganizacion(e, dev.id);
    m.quitarCuentaOrganizacion(e, invitada.id);
    espera(!e.organizations.politicas.some((p) => p.objetivos.includes(dev.id)), 'al quitar la cuenta se van sus adjuntos');
    const fact = m.facturacionConsolidada(e, t);
    espera(fact && fact.cuentas.length === 1 && typeof fact.total === 'number', 'facturación consolidada con la cuenta de administración');
    m.deshabilitarScp(e);
    espera(e.organizations.politicas.every((p) => !p.objetivos.length), 'al deshabilitar SCP se separan todas');
    m.eliminarOrganizacion(e);
    espera(e.organizations === null, 'se borra la organización vacía');

    /* ------------------------------------------------ Well-Architected */
    const w = m.cuentaNueva({ cuentaId: '210987654321' });
    const base = { nombre: 'tienda-abc', descripcion: 'Tienda en línea', responsable: 'Ana López', entorno: 'PREPRODUCTION', regiones: ['us-east-1'] };
    espera(codigo(() => m.crearCargaWa(w, { ...base, nombre: 'ab' })) === 'ValidationException', 'nombre de workload muy corto');
    espera(codigo(() => m.crearCargaWa(w, { ...base, regiones: [] })) === 'ValidationException', 'workload sin regiones');
    espera(codigo(() => m.crearCargaWa(w, { ...base, entorno: 'DEV' })) === 'ValidationException', 'entorno inválido');
    const c = m.crearCargaWa(w, base);
    espera(c.arn === `arn:aws:wellarchitected:us-east-1:210987654321:workload/${c.id}` && c.lentes[0] === 'wellarchitected', 'ARN y lente del workload');
    espera(codigo(() => m.crearCargaWa(w, { ...base, nombre: 'Tienda-ABC' })) === 'ConflictException', 'nombre de workload repetido');

    espera(m.PILARES_WA.every((p) => m.PREGUNTAS_WA.filter((q) => q.pilar === p.id).length >= 1), 'cada pilar tiene preguntas');
    espera(m.PREGUNTAS_WA.filter((q) => q.pilar === 'REL').length >= 3, 'Reliability tiene al menos 3 preguntas');
    for (const q of m.PREGUNTAS_WA) {
      espera(q.practicas.every((b) => b.id.startsWith(`${q.pilar}${q.clave.split(' ')[1].padStart(2, '0')}-BP`)), `prácticas con id de su pregunta (${q.clave})`);
    }

    let r = m.resumenWa(c.respuestas);
    espera(r.contestadas === 0 && r.total === m.PREGUNTAS_WA.length, 'sin respuestas al inicio');
    const rel2 = m.preguntaWa('REL2');
    m.responderPreguntaWa(w, c.id, 'REL2', { elegidas: rel2.practicas.map((b) => b.id) });
    m.responderPreguntaWa(w, c.id, 'REL7', { elegidas: ['REL07-BP02', 'REL07-BP03', 'REL07-BP04'] });
    m.responderPreguntaWa(w, c.id, 'REL9', { elegidas: ['REL09-BP01', 'REL09-BP02'] });
    m.responderPreguntaWa(w, c.id, 'REL10', { noAplica: true, notas: 'Una sola zona' });
    m.responderPreguntaWa(w, c.id, 'SEC1', { ninguna: true });
    espera(m.riesgoPreguntaWa('REL2', c.respuestas.REL2) === 'NONE', 'todas las prácticas → sin riesgo');
    espera(m.riesgoPreguntaWa('REL7', c.respuestas.REL7) === 'HIGH', 'falta una práctica HIGH → riesgo alto');
    espera(m.riesgoPreguntaWa('REL9', c.respuestas.REL9) === 'MEDIUM', 'faltan solo MEDIUM → riesgo medio');
    espera(m.riesgoPreguntaWa('REL10', c.respuestas.REL10) === 'NOT_APPLICABLE', 'no aplica');
    espera(m.riesgoPreguntaWa('SEC1', c.respuestas.SEC1) === 'HIGH', 'None of these → riesgo alto');
    r = m.resumenWa(c.respuestas);
    espera(r.contestadas === 5 && r.alto === 2 && r.medio === 1 && r.porPilar.REL.contestadas === 4, `resumen de riesgos (${JSON.stringify({ c: r.contestadas, a: r.alto, m: r.medio })})`);
    const plan = m.planMejoraWa(c);
    espera(plan.length === 3 && plan[0].riesgo === 'HIGH' && plan.at(-1).riesgo === 'MEDIUM', 'el plan pone primero los riesgos altos');
    espera(plan.find((x) => x.pregunta.id === 'REL7').faltantes.map((b) => b.id).join() === 'REL07-BP01', 'el plan lista la práctica que falta');
    espera(codigo(() => m.responderPreguntaWa(w, c.id, 'REL2', { elegidas: ['SEC01-BP01'] })) === 'ValidationException', 'práctica de otra pregunta');
    espera(codigo(() => m.responderPreguntaWa(w, c.id, 'REL2', { elegidas: ['REL02-BP01'], ninguna: true })) === 'ValidationException', 'None of these junto con otras');
    m.responderPreguntaWa(w, c.id, 'SEC1', {});
    espera(!c.respuestas.SEC1, 'sin nada elegido la pregunta vuelve a quedar sin contestar');

    const hito = m.guardarHitoWa(w, c.id, 'Version 1.0 - initial review');
    espera(hito.numero === 1 && m.resumenWa(hito.respuestas).contestadas === 4, 'el milestone guarda la foto');
    m.responderPreguntaWa(w, c.id, 'REL7', { elegidas: m.preguntaWa('REL7').practicas.map((b) => b.id) });
    espera(m.resumenWa(hito.respuestas).alto === 1 && m.resumenWa(c.respuestas).alto === 0, 'el milestone no cambia al mejorar después');
    espera(codigo(() => m.guardarHitoWa(w, c.id, 'version 1.0 - initial review')) === 'ConflictException', 'milestone repetido');
    m.editarCargaWa(w, c.id, { estadoMejora: 'IN_PROGRESS', responsable: 'Luis' });
    espera(c.estadoMejora === 'IN_PROGRESS' && c.responsable === 'Luis', 'editar propiedades y estado de mejora');
    m.eliminarCargaWa(w, c.id);
    espera(!w.wellarchitected.cargas.length, 'borrar el workload');
    espera(w.bitacora.some((b) => b.servicio === 'WellArchitected' && b.accion === 'CreateMilestone'), 'la bitácora anota CreateMilestone');

    espera(JSON.stringify(e).length < 512 * 1024 && JSON.stringify(w).length < 512 * 1024, 'el estado sigue siendo chico');
    espera(m.llamar('accionPermitidaPorScp', e, '1', 'x:y')?.permitida === true, 'accionPermitidaPorScp se ofrece por llamar()');
  } finally {
    m.reloj.ahora = relojAntes;
  }
  return fallas;
}
