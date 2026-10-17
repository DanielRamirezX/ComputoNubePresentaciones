// ---------------------------------------------------------------------------
// CONSOLE HOME
//
// La pantalla de inicio: «Recently visited», la bienvenida, «Build a solution»
// con atajos a lo que se hace en los laboratorios y todos los servicios del
// simulador por categoría.
// ---------------------------------------------------------------------------

import * as ui from '../ui.js';
import { SERVICIOS } from './index.js';

const { h, icono, CATEGORIAS } = ui;

function tarjeta(titulo, cuerpo, { acciones, info, cx } = {}) {
  return h(
    'section',
    { class: 'cx-contenedor cx-widget' },
    h(
      'div',
      { class: 'cx-contenedor__cabeza' },
      h('div', { class: 'cx-contenedor__titulos' }, h('h2', { class: 'cx-h2' }, h('span', { class: 'cx-widget__asa', 'aria-hidden': 'true' }, '⠿'), ' ', titulo, info ? ui.info(cx, info) : null)),
      h('div', { class: 'cx-contenedor__acciones' }, acciones ?? null, h('span', { class: 'cx-widget__puntos', 'aria-hidden': 'true' }, '⋮'))
    ),
    h('div', { class: 'cx-contenedor__cuerpo' }, cuerpo)
  );
}

function inicio(cx) {
  cx.migas([]);
  const servicios = SERVICIOS.filter((s) => s.id !== 'inicio');
  const ir = (s) => cx.ir(s.inicio ?? s.id);

  const recientes = tarjeta(
    'Recently visited',
    h(
      'div',
      { class: 'cx-inicio__recientes' },
      servicios.map((s) => h('a', { href: '#', class: 'cx-inicio__servicio', onclick: (e) => (e.preventDefault(), ir(s)) }, cx.iconoServicio(s, 20), h('span', {}, s.nombre)))
    ),
    { acciones: ui.boton('All services', { alClic: () => cx.ir('inicio/servicios') }), info: 'simulador', cx }
  );

  const bienvenida = tarjeta(
    'Welcome to AWS',
    h(
      'div',
      { class: 'cx-inicio__bienvenida' },
      [
        ['Getting started with AWS', 'Learn the fundamentals and find valuable information to get the most out of AWS.'],
        ['Training and certification', 'Learn from AWS experts and advance your skills and knowledge.'],
        ["What's new with AWS?", 'Discover new AWS services, features, and Regions.']
      ].map(([t, d]) => h('div', { class: 'cx-inicio__item' }, h('span', { class: 'cx-enlace cx-enlace--apagado' }, t, icono('external', 'cx-icono--chico')), h('p', {}, d)))
    )
  );

  const salud = tarjeta(
    'AWS Health',
    h(
      'div',
      { class: 'cx-inicio__salud' },
      [['Open issues', '0'], ['Scheduled changes', '0'], ['Other notifications', '0']].map(([t, n]) => h('div', {}, h('div', { class: 'cx-texto-sec' }, t), h('div', { class: 'cx-inicio__numero' }, n))),
      h('p', { class: 'cx-texto-sec' }, 'Past 7 days')
    )
  );

  const atajo = (titulo, texto, minutos, ruta) =>
    h(
      'a',
      { href: '#', class: 'cx-inicio__atajo', onclick: (e) => (e.preventDefault(), cx.ir(ruta)) },
      h('b', {}, titulo),
      h('span', { class: 'cx-texto-sec' }, texto),
      h('small', {}, `${minutos} mins`)
    );
  const solucion = tarjeta(
    'Build a solution',
    h(
      'div',
      { class: 'cx-inicio__atajos' },
      atajo('Launch a virtual machine', 'With EC2', 2, 'ec2/instancias/lanzar'),
      atajo('Create a VPC', 'With Amazon VPC', 3, 'vpc/vpcs/crear'),
      atajo('Set up a firewall', 'With security groups', 2, 'ec2/grupos/crear'),
      atajo('Create a block storage volume', 'With Amazon EBS', 2, 'ec2/volumenes/crear')
    )
  );

  const costo = tarjeta(
    'Cost and usage',
    h('div', { class: 'cx-inicio__salud' }, h('div', {}, h('div', { class: 'cx-texto-sec' }, 'Current month costs'), h('div', { class: 'cx-inicio__numero' }, '$0.00')), h('p', { class: 'cx-texto-sec' }, 'Simulador: aquí nada cuesta dinero.'))
  );

  return h(
    'div',
    { class: 'cx-inicio' },
    h(
      'div',
      { class: 'cx-encabezado' },
      h('div', { class: 'cx-encabezado__texto' }, h('h1', { class: 'cx-h1' }, 'Console Home', ui.info(cx, 'simulador'))),
      h('div', { class: 'cx-encabezado__acciones' }, ui.boton('Reset to default layout', { desactivado: true }), ui.boton('Add widgets', { variante: 'primario', icono: 'add', desactivado: true, escribe: false }))
    ),
    h('div', { class: 'cx-inicio__rejilla' }, recientes, bienvenida, salud, solucion, costo)
  );
}

function todos(cx) {
  cx.migas([{ texto: 'Console Home', ruta: 'inicio' }, { texto: 'All services' }]);
  const porCat = {};
  for (const s of SERVICIOS) if (s.id !== 'inicio') (porCat[s.categoria] ??= []).push(s);
  return h(
    'div',
    { class: 'cx-inicio' },
    ui.encabezado({ titulo: 'All services', descripcion: 'Los servicios que existen en este simulador, por categoría.' }),
    h(
      'div',
      { class: 'cx-inicio__categorias' },
      Object.entries(porCat).map(([cat, lista]) =>
        ui.contenedor({
          titulo: CATEGORIAS[cat]?.nombre ?? cat,
          cuerpo: lista.map((s) =>
            h(
              'a',
              { href: '#', class: 'cx-inicio__servicio cx-inicio__servicio--grande', onclick: (e) => (e.preventDefault(), cx.ir(s.inicio ?? s.id)) },
              cx.iconoServicio(s, 32),
              h('span', {}, h('b', {}, s.nombre), h('small', { class: 'cx-texto-sec' }, s.proximamente ? 'Próximamente en el simulador' : s.descripcion ?? ''))
            )
          )
        })
      )
    )
  );
}

export default {
  id: 'inicio',
  nombre: 'Console Home',
  categoria: 'general',
  menu: [],
  rutas: { '': inicio, servicios: todos }
};
