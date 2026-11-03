// ---------------------------------------------------------------------------
// AWS SUPPORT
//
// Support Center (tu plan y tus casos), Create case (Account and billing y
// Technical; este último solo con un plan de pago), el detalle de un caso con
// su correspondencia (AWS Support contesta solo a los pocos segundos) y Manage
// Support Plan con los cuatro planes de 2026: Basic, Business Support+,
// Enterprise Support y Unified Operations, con sus precios y tiempos de
// respuesta. Cambiar de plan SÍ cobra: el mínimo mensual se suma a la factura
// por hora (modelo/costos.js).
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import { CATEGORIAS_CUENTA, cambiarPlanSoporte, crearCasoSoporte, dinero, PLANES_SOPORTE, planSoporte, resolverCasoSoporte, responderCasoSoporte, SEVERIDADES } from '../modelo.js';

const { h } = ui;

const BASE = 'support';
const migasSoporte = (cx, ...resto) => cx.migas([{ texto: 'Support', ruta: BASE }, ...resto]);
const ESTADOS_CASO = {
  unassigned: ['info', 'Unassigned'],
  'pending-customer-action': ['aviso', 'Pending Customer Action'],
  'customer-action-completed': ['info', 'Customer Action Completed'],
  resolved: ['exito', 'Resolved']
};
const estadoCaso = (c) => ui.estado(...(ESTADOS_CASO[c.estado] ?? ['info', c.estado]));
const SERVICIOS_TECNICOS = ['Elastic Compute Cloud (EC2 - Linux)', 'Virtual Private Cloud (VPC)', 'Simple Storage Service (S3)', 'Relational Database Service (RDS)', 'Elastic Load Balancing (ELB)', 'EC2 Auto Scaling', 'CloudWatch', 'Identity and Access Management (IAM)', 'Lambda', 'DynamoDB'];
const casoDe = (cx, id) => (cx.estado.costos?.casos ?? []).find((c) => c.id === id || c.numero === id);

function tablaCasos(cx, { soloAbiertos = false, titulo, variante = 'contenedor' }) {
  return ui.tabla(cx, {
    titulo,
    variante,
    filas: () => (cx.estado.costos?.casos ?? []).filter((c) => !soloAbiertos || c.estado !== 'resolved'),
    clave: (c) => c.id,
    seleccion: null,
    filtro: 'Search cases',
    columnas: [
      { titulo: 'Subject', valor: (c) => ui.enlace(c.asunto, `${BASE}/casos/${c.numero}`, { cx }), texto: (c) => c.asunto },
      { titulo: 'Case ID', valor: (c) => c.numero },
      { titulo: 'Created', valor: (c) => ui.fecha(c.creado) },
      { titulo: 'Type', valor: (c) => (c.tipo === 'technical' ? 'Technical' : 'Account and billing') },
      { titulo: 'Severity', valor: (c) => SEVERIDADES[c.severidad] },
      { titulo: 'Status', valor: (c) => estadoCaso(c) }
    ],
    acciones: () => [ui.boton('Create case', { variante: 'primario', alClic: () => cx.ir(`${BASE}/casos/crear`) })],
    vacio: { titulo: 'No cases', texto: soloAbiertos ? 'You don’t have any open support cases.' : 'You haven’t created any support cases.' }
  });
}

function centro(cx) {
  migasSoporte(cx, { texto: 'Support Center' });
  const plan = cx.vivo(() => {
    const p = planSoporte(cx.estado.costos?.planSoporte);
    return ui.contenedor({
      titulo: 'Your support plan',
      info: 'soporte-planes',
      cx,
      acciones: ui.boton('Manage support plan', { alClic: () => cx.ir(`${BASE}/planes`) }),
      cuerpo: h(
        'div',
        { class: 'cx-pagina' },
        h('div', { class: 'cx-costos-cifra__valor' }, p.nombre),
        p.id === 'basic'
          ? ui.alerta({ tipo: 'aviso', contenido: 'Your support plan doesn’t include technical support. You can create Account and billing cases. To get help from engineers on technical issues, upgrade your plan.' })
          : h('p', { class: 'cx-texto-sec' }, `Business-critical response: ${p.respuestas[0]?.[1] ?? '–'}. ${p.tam ? 'Includes a designated Technical Account Manager (TAM).' : ''}`)
      )
    });
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Support Center', info: 'soporte-casos', cx, descripcion: 'Get help from AWS Support, review your cases and manage your support plan.', acciones: [ui.boton('Create case', { variante: 'primario', alClic: () => cx.ir(`${BASE}/casos/crear`) })] }),
    h(
      'div',
      { class: 'cx-dos-columnas' },
      h('div', { class: 'cx-pagina' }, tablaCasos(cx, { soloAbiertos: true, titulo: 'Open support cases' })),
      h(
        'div',
        { class: 'cx-lado' },
        plan,
        ui.contenedor({
          titulo: 'Other resources',
          cuerpo: h(
            'ul',
            { class: 'cx-costos-ol' },
            h('li', {}, ui.enlace('Trusted Advisor', 'trustedadvisor', { cx })),
            h('li', {}, ui.enlace('Billing and Cost Management', 'billing', { cx })),
            h('li', {}, h('span', { class: 'cx-texto-sec' }, 'AWS re:Post (community Q&A)')),
            h('li', {}, h('span', { class: 'cx-texto-sec' }, 'AWS Health Dashboard'))
          )
        })
      )
    )
  );
}

function casos(cx) {
  migasSoporte(cx, { texto: 'Your support cases' });
  return h('div', { class: 'cx-pagina' }, tablaCasos(cx, { titulo: 'Your support cases', variante: 'pagina' }));
}

function crearCaso(cx) {
  migasSoporte(cx, { texto: 'Your support cases', ruta: `${BASE}/casos` }, { texto: 'Create case' });
  const p = planSoporte(cx.estado.costos?.planSoporte);
  const f = { tipo: 'account', servicio: 'Billing', categoria: CATEGORIAS_CUENTA[1], severidad: 'low', asunto: '', descripcion: '', correos: '', errores: {} };
  const forma = ui.region(() => {
    const tecnico = f.tipo === 'technical';
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.contenedor({
        titulo: 'How can we help?',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.tarjetas({
            columnas: 2,
            valor: f.tipo,
            alCambiar: (v) => {
              f.tipo = v;
              f.servicio = v === 'technical' ? SERVICIOS_TECNICOS[0] : 'Billing';
              f.categoria = v === 'technical' ? 'General guidance' : CATEGORIAS_CUENTA[1];
              f.severidad = 'low';
              forma.repintar();
            },
            opciones: [
              { valor: 'account', etiqueta: 'Account and billing', descripcion: 'Get help with your bill, payments, charges, Free Tier or your account.' },
              { valor: 'technical', etiqueta: 'Technical', descripcion: p.casosTecnicos ? 'Get help from engineers with services and resources.' : 'Not available with Basic Support. Upgrade your support plan.', desactivado: !p.casosTecnicos }
            ]
          }),
          !p.casosTecnicos ? ui.alerta({ tipo: 'info', contenido: 'Con Basic Support solo puedes abrir casos de cuenta y facturación. Para dudas técnicas usa la documentación, AWS re:Post o mejora tu plan en Manage support plan.' }) : null,
          ui.alerta({ tipo: 'info', titulo: 'Looking for service quota increases?', contenido: 'Request quota increases from the Service Quotas console.' })
        )
      }),
      ui.contenedor({
        titulo: 'Problem',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({
            etiqueta: 'Service',
            error: f.errores.servicio,
            control: ui.selector({ opciones: (tecnico ? SERVICIOS_TECNICOS : ['Account', 'Billing', 'Free Tier', 'Payments']).map((x) => ({ valor: x, etiqueta: x })), valor: f.servicio, filtrar: tecnico, alCambiar: (v) => (f.servicio = v) })
          }),
          ui.campo({
            etiqueta: 'Category',
            control: ui.selector({ opciones: (tecnico ? ['General guidance', 'Connectivity', 'Performance', 'Instance issue', 'Other'] : CATEGORIAS_CUENTA).map((x) => ({ valor: x, etiqueta: x })), valor: f.categoria, alCambiar: (v) => (f.categoria = v) })
          }),
          ui.campo({
            etiqueta: 'Severity',
            info: 'soporte-planes',
            cx,
            descripcion: tecnico ? 'Response times depend on your support plan.' : 'Account and billing cases are General guidance.',
            control: ui.selector({
              opciones: Object.entries(SEVERIDADES).map(([valor, etiqueta]) => ({ valor, etiqueta, etiquetaDerecha: p.respuestas.find((r) => r[0].replace('Mission', 'Business') === etiqueta)?.[1] ?? '', desactivado: !tecnico && valor !== 'low' })),
              valor: f.severidad,
              desactivado: !tecnico,
              alCambiar: (v) => (f.severidad = v)
            })
          })
        )
      }),
      ui.contenedor({
        titulo: 'Description',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Subject', error: f.errores.asunto, restriccion: 'Maximum 250 characters.', control: ui.entrada({ valor: f.asunto, placeholder: 'For example: Unexpected charges for Amazon EC2', alCambiar: (v) => (f.asunto = v) }) }),
          ui.campo({ etiqueta: 'Description', error: f.errores.descripcion, descripcion: 'Describe your issue, the resources involved (IDs) and what you already tried.', control: ui.area({ valor: f.descripcion, filas: 7, alCambiar: (v) => (f.descripcion = v) }) })
        )
      }),
      ui.contenedor({
        titulo: 'Contact options',
        cuerpo: h(
          'div',
          { class: 'cx-form' },
          ui.campo({ etiqueta: 'Additional contacts', opcional: true, descripcion: 'Email addresses to notify about this case, separated by commas.', control: ui.entrada({ valor: f.correos, placeholder: 'name@example.com', alCambiar: (v) => (f.correos = v) }) }),
          ui.campo({ etiqueta: 'Contact method', control: ui.radios({ valor: 'web', opciones: [{ valor: 'web', etiqueta: 'Web' }, { valor: 'chat', etiqueta: 'Chat', desactivado: !p.casosTecnicos }, { valor: 'phone', etiqueta: 'Phone', desactivado: !p.casosTecnicos }] }) })
        )
      }),
      ui.pieFormulario({
        cancelar: () => cx.ir(`${BASE}/casos`),
        textoEnviar: 'Submit',
        enviar: () => {
          f.errores = {};
          if (!f.asunto.trim()) f.errores.asunto = 'Subject is required.';
          if (!f.descripcion.trim()) f.errores.descripcion = 'Description is required.';
          if (Object.keys(f.errores).length) return forma.repintar();
          const r = cx.hacer({ servicio: 'Support', accion: 'CreateCase', error: 'Unable to create case' }, (e) =>
            crearCasoSoporte(e, { tipo: f.tipo, servicio: f.servicio, categoria: f.categoria, severidad: f.severidad, asunto: f.asunto, descripcion: f.descripcion, correos: f.correos.split(/[,;\s]+/).filter(Boolean) })
          );
          if (r.ok) {
            cx.flash({ tipo: 'exito', texto: `Case ${r.valor.numero} created. AWS Support will respond by email and in the Support Center.` });
            cx.ir(`${BASE}/casos/${r.valor.numero}`);
          }
        }
      })
    );
  });
  return h('div', { class: 'cx-pagina cx-pagina--form' }, ui.encabezado({ titulo: 'Create case', info: 'soporte-casos', cx }), forma);
}

function detalleCaso(cx, { id }) {
  migasSoporte(cx, { texto: 'Your support cases', ruta: `${BASE}/casos` }, { texto: id });
  if (!casoDe(cx, id)) return ui.noDisponible('Case not found', 'Ese caso no existe.');
  const f = { texto: '' };
  const respuesta = ui.region(() =>
    ui.contenedor({
      titulo: 'Reply',
      cuerpo: h(
        'div',
        { class: 'cx-form' },
        ui.campo({ etiqueta: 'Correspondence', control: ui.area({ valor: f.texto, filas: 5, alCambiar: (v) => (f.texto = v) }) }),
        h(
          'div',
          { class: 'cx-acciones' },
          ui.boton('Submit', {
            variante: 'primario',
            alClic: () => {
              const r = cx.hacer({ servicio: 'Support', accion: 'AddCommunicationToCase', error: 'Unable to reply' }, (e) => responderCasoSoporte(e, id, f.texto));
              if (r.ok) {
                f.texto = '';
                respuesta.repintar();
                cx.flash({ tipo: 'exito', texto: 'Your reply was added to the case.' });
              }
            }
          })
        )
      )
    })
  );
  const datos = cx.vivo(() => {
    const c = casoDe(cx, id);
    if (!c) return ui.noDisponible('Case not found');
    return h(
      'div',
      { class: 'cx-pagina' },
      ui.encabezado({
        titulo: c.asunto,
        info: 'soporte-casos',
        cx,
        acciones: [
          ui.boton('Resolve case', {
            escribe: true,
            desactivado: c.estado === 'resolved',
            alClic: () =>
              cx.confirmar({
                titulo: 'Resolve case',
                textoBoton: 'Resolve case',
                contenido: h('p', {}, 'Are you sure you want to resolve this case? You can reopen it later by replying.'),
                aceptar: () => cx.hacer({ servicio: 'Support', accion: 'ResolveCase', error: 'Unable to resolve case' }, (e) => resolverCasoSoporte(e, c.id))
              })
          })
        ]
      }),
      ui.contenedor({
        titulo: 'Case details',
        cuerpo: ui.pares(
          [
            { etiqueta: 'Subject', valor: c.asunto },
            { etiqueta: 'Case ID', valor: ui.copiable(c.numero) },
            { etiqueta: 'Created', valor: ui.fecha(c.creado) },
            { etiqueta: 'Case type', valor: c.tipo === 'technical' ? 'Technical' : 'Account and billing' },
            { etiqueta: 'Severity', valor: SEVERIDADES[c.severidad] },
            { etiqueta: 'Status', valor: estadoCaso(c) },
            { etiqueta: 'Service', valor: c.servicio },
            { etiqueta: 'Category', valor: c.categoria },
            { etiqueta: 'Additional contacts', valor: c.correos.join(', ') || '–' }
          ],
          { columnas: 3 }
        )
      }),
      ui.contenedor({
        titulo: 'Correspondence',
        contador: c.mensajes.length,
        cuerpo: h(
          'div',
          { class: 'cx-soporte-mensajes' },
          [...c.mensajes].reverse().map((m) =>
            h('div', { class: ['cx-soporte-mensaje', m.de === 'aws' && 'cx-soporte-mensaje--aws'] }, h('div', { class: 'cx-soporte-mensaje__cabeza' }, h('b', {}, m.de === 'aws' ? 'Amazon Web Services' : cx.estado.cuenta.usuario ?? 'You'), h('span', { class: 'cx-texto-sec' }, ui.fecha(m.t))), h('div', { class: 'cx-soporte-mensaje__texto' }, m.texto))
          ),
          c.estado === 'unassigned' || c.estado === 'customer-action-completed' ? h('p', { class: 'cx-texto-sec' }, ui.estado('pendiente', 'An AWS Support agent is reviewing your case…')) : null
        )
      })
    );
  });
  return h('div', { class: 'cx-pagina' }, datos, respuesta);
}

function planes(cx) {
  migasSoporte(cx, { texto: 'Manage support plan' });
  const cambiar = (p) => {
    cx.confirmar({
      titulo: `Change to ${p.nombre}?`,
      textoBoton: 'Change plan',
      contenido: [
        h('p', {}, p.precio ? `${p.nombre} costs the greater of ${dinero(p.precio)} per month or a percentage of your monthly AWS charges.` : 'Basic Support is included at no additional charge.'),
        p.precio ? ui.alerta({ tipo: 'aviso', contenido: `Ojo: en el simulador el plan sí se cobra. El mínimo de ${dinero(p.precio)} al mes se suma a tu factura hora por hora (recuerda: 1 minuto real = 1 hora). Si solo estás explorando, vuelve a Basic al terminar.` }) : null
      ],
      aceptar: () => {
        const r = cx.hacer({ servicio: 'Support', accion: 'UpdateSupportPlan', error: 'Unable to change support plan' }, (e) => cambiarPlanSoporte(e, p.id));
        if (r.ok) cx.flash({ tipo: 'exito', texto: `Your support plan is now ${p.nombre}.` });
      }
    });
  };
  const tarjetas = cx.vivo(() => {
    const actual = planSoporte(cx.estado.costos?.planSoporte).id;
    return h(
      'div',
      { class: 'cx-soporte-planes' },
      PLANES_SOPORTE.map((p) =>
        h(
          'section',
          { class: ['cx-soporte-plan', p.id === actual && 'cx-soporte-plan--actual'] },
          h('div', { class: 'cx-soporte-plan__cabeza' }, h('h2', { class: 'cx-h2' }, p.nombre), p.id === actual ? h('span', { class: 'cx-insignia cx-insignia--verde' }, 'Current plan') : null),
          h('div', { class: 'cx-soporte-plan__precio' }, p.textoPrecio),
          p.porcentajes ? h('ul', { class: 'cx-costos-ol cx-texto-sec' }, p.porcentajes.map((x) => h('li', {}, x))) : h('p', { class: 'cx-texto-sec' }, 'Included for all AWS customers.'),
          h('div', { class: 'cx-par__etiqueta' }, 'Response times'),
          p.respuestas.length
            ? h('table', { class: 'cx-soporte-tiempos' }, h('tbody', {}, p.respuestas.map(([sev, t]) => h('tr', {}, h('td', {}, sev), h('td', {}, h('b', {}, t))))))
            : h('p', { class: 'cx-texto-sec' }, 'No technical support cases. Customer service for account and billing questions, documentation, whitepapers and AWS re:Post.'),
          h('div', { class: 'cx-par__etiqueta' }, 'Trusted Advisor'),
          h('p', {}, p.advisor),
          h('div', { class: 'cx-par__etiqueta' }, 'Technical Account Manager (TAM)'),
          h('p', {}, p.tam ? 'Designated TAM' : 'Not included'),
          h('div', { class: 'cx-soporte-plan__pie' }, p.id === actual ? ui.boton('Current plan', { desactivado: true }) : ui.boton('Change plan', { escribe: true, alClic: () => cambiar(p) }))
        )
      )
    );
  });
  return h(
    'div',
    { class: 'cx-pagina' },
    ui.encabezado({ titulo: 'Manage support plan', info: 'soporte-planes', cx, descripcion: 'Compare the AWS Support plans and choose the one that fits your workloads.' }),
    tarjetas,
    h('p', { class: 'cx-texto-sec' }, 'Prices from aws.amazon.com/premiumsupport/pricing (2026). Response times are AWS Support targets for the first response by severity.')
  );
}

export default {
  id: 'support',
  nombre: 'Support',
  titulo: 'Support',
  descripcion: 'AWS Support Center',
  categoria: 'gestion',
  claves: 'support soporte casos planes basic business enterprise tam',
  inicio: BASE,
  menu: [
    { texto: 'Support Center', ruta: BASE },
    { texto: 'Your support cases', ruta: `${BASE}/casos` },
    { texto: 'Create case', ruta: `${BASE}/casos/crear` },
    { texto: 'Manage support plan', ruta: `${BASE}/planes` },
    { seccion: 'Resources', items: [{ texto: 'AWS re:Post', externo: true, desactivado: true }, { texto: 'AWS Health Dashboard', desactivado: true }, { texto: 'Trusted Advisor', ruta: 'trustedadvisor' }] }
  ],
  rutas: {
    '': centro,
    casos,
    'casos/crear': crearCaso,
    'casos/:id': detalleCaso,
    planes
  },
  busqueda: [
    { texto: 'Create case', ruta: `${BASE}/casos/crear`, claves: 'caso ayuda' },
    { texto: 'Support plans', ruta: `${BASE}/planes`, claves: 'planes soporte business enterprise' }
  ],
  ayudas: {
    'soporte-planes': {
      titulo: 'Planes de AWS Support (2026)',
      texto: [
        [
          '**Basic**: gratis para todos. Atención de cuenta y facturación, documentación, re:Post y los chequeos básicos de Trusted Advisor. **No** incluye casos técnicos.',
          '**Business Support+**: desde $29 al mes. Casos técnicos 24/7, respuesta en menos de 30 min si un sistema crítico se cae, y todos los chequeos de Trusted Advisor.',
          '**Enterprise Support**: desde $5,000 al mes. Menos de 15 min para sistemas críticos y un **TAM** (Technical Account Manager) designado.',
          '**Unified Operations**: desde $50,000 al mes. Respuesta en 5 min para incidentes críticos y equipo dedicado.'
        ],
        'El precio real es lo mayor entre el mínimo y un porcentaje de tu gasto mensual en AWS.',
        'Para el examen: los planes anteriores (**Developer**, **Business** y **Enterprise On-Ramp**) aún aparecen en preguntas del CLF-C02, pero AWS los retira el 1 de enero de 2027. La idea se mantiene: a más precio, respuesta más rápida y más acompañamiento (el TAM solo viene en los planes Enterprise).'
      ]
    },
    'soporte-casos': {
      titulo: 'Casos de soporte',
      texto: [
        'Un **caso** es una solicitud de ayuda a AWS. Los de **Account and billing** (cobros, pagos, cuenta) los puede abrir cualquiera, también con Basic.',
        'Los **Technical** necesitan un plan de pago. La **severidad** (General guidance, System impaired… Business-critical system down) define qué tan rápido te contestan.',
        'En el simulador, AWS Support contesta a los pocos segundos.'
      ]
    }
  }
};
