// ---------------------------------------------------------------------------
// EL REGISTRO DE SERVICIOS
//
// La consola pinta su barra de favoritos, el buscador, el menú de servicios y
// el enrutador a partir de esta lista. Para agregar un servicio: crea
// servicios/<id>.js con el formato de ec2.js (ver NUCLEO.md), impórtalo aquí y
// ponlo en SERVICIOS en lugar de su marcador «próximamente».
// ---------------------------------------------------------------------------

import { h } from '../ui.js';
import * as ui from '../ui.js';
import inicio from './inicio.js';
import ec2 from './ec2.js';
import vpc from './vpc.js';
import s3 from './s3.js';
import iam from './iam.js';

/**
 * Un servicio que todavía no existe en el simulador: aparece en el buscador,
 * en favoritos y en el menú de servicios, y todas sus rutas muestran el aviso.
 */
function proximamente({ id, nombre, titulo, descripcion, categoria, busqueda = [] }) {
  const vista = (cx) => {
    cx.migas([{ texto: titulo ?? nombre, ruta: id }]);
    return h(
      'div',
      { class: 'cx-no-disponible' },
      h('h1', { class: 'cx-h1' }, titulo ?? nombre),
      ui.alerta({ tipo: 'info', titulo: 'Próximamente', contenido: `${nombre} todavía no está listo en este simulador.` })
    );
  };
  return { id, nombre, titulo, descripcion, categoria, proximamente: true, busqueda, menu: [], rutas: { '': vista, ':a': vista, ':a/:b': vista, ':a/:b/:c': vista } };
}

export const SERVICIOS = [
  inicio,
  ec2,
  vpc,
  s3,
  iam
];
