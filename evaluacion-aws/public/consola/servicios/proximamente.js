// Un servicio que todavía no existe en el simulador: aparece en el buscador,
// en favoritos y en el menú de servicios, y todas sus rutas muestran el aviso.
import { h } from '../ui.js';
import * as ui from '../ui.js';

export function vistaProximamente(nombre, titulo) {
  return (cx) => {
    cx.migas([{ texto: titulo ?? nombre }]);
    return h(
      'div',
      { class: 'cx-no-disponible' },
      h('h1', { class: 'cx-h1' }, titulo ?? nombre),
      ui.alerta({ tipo: 'info', titulo: 'Próximamente', contenido: `${nombre} todavía no está listo en este simulador.` })
    );
  };
}

export function proximamente({ id, nombre, titulo, descripcion, categoria, busqueda = [] }) {
  const vista = vistaProximamente(nombre, titulo);
  return { id, nombre, titulo, descripcion, categoria, proximamente: true, busqueda, menu: [], rutas: { '': vista, ':a': vista, ':a/:b': vista, ':a/:b/:c': vista } };
}
