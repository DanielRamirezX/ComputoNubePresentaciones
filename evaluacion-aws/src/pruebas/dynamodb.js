// Pruebas del modelo de DynamoDB (public/consola/modelo/dynamodb.js): crear
// tablas, PutItem que sobrescribe, Scan contra Query (banner de eficiencia y
// RCU), índices globales, respaldos, réplicas, borrado con protección y una
// cuenta vieja sin la colección.

import {
  avanzar,
  consultarTabla,
  crearIndiceDynamo,
  crearReplicaDynamo,
  crearRespaldoDynamo,
  crearTablaDynamo,
  cuentaNueva,
  editarCapacidadDynamo,
  editarItemDynamo,
  editarPitrDynamo,
  editarProteccionDynamo,
  eliminarItemsDynamo,
  eliminarRespaldoDynamo,
  eliminarTablaDynamo,
  escanearTabla,
  itemDynamoPlano,
  itemDynamoTipado,
  leerItemDynamo,
  llamar,
  ponerItemDynamo,
  reloj,
  restaurarPitrDynamo,
  restaurarRespaldoDynamo,
  tablaDynamoDe
} from '../../public/consola/modelo.js';

export const titulo = 'DynamoDB';

export async function probar() {
  const fallas = [];
  const relojOriginal = reloj.ahora;
  let t = Date.UTC(2026, 10, 2, 18, 0, 0);
  reloj.ahora = () => t;
  const pasar = (e, ms) => {
    t += ms;
    avanzar(e, t);
  };
  const espera = (cond, texto) => {
    if (!cond) fallas.push(texto);
  };
  const lanza = (fn, codigo, texto) => {
    try {
      fn();
      fallas.push(`${texto}: no lanzó ${codigo}`);
    } catch (e) {
      if (e.codigo !== codigo) fallas.push(`${texto}: lanzó ${e.codigo} (${e.message}) en lugar de ${codigo}`);
    }
  };

  try {
    const e = cuentaNueva({ nombre: 'ana' });
    espera(Array.isArray(e.dynamodb?.tablas), 'cuentaNueva no trae estado.dynamodb.tablas');

    /* ---------- crear la tabla del laboratorio (Default settings) */
    const tabla = crearTablaDynamo(e, { nombre: 'puntajes-ana', pk: { nombre: 'jugador', tipo: 'S' } });
    espera(tabla.estado === 'CREATING' && tabla.modo === 'PAY_PER_REQUEST', 'la tabla nueva no está CREATING en on-demand');
    espera(tabla.arn === `arn:aws:dynamodb:us-east-1:${e.cuenta.id}:table/puntajes-ana`, `ARN raro: ${tabla.arn}`);
    lanza(() => ponerItemDynamo(e, 'puntajes-ana', { jugador: { S: 'x' } }), 'ResourceNotFoundException', 'escribir en una tabla CREATING');
    pasar(e, 3000);
    espera(tabla.estado === 'ACTIVE', 'la tabla no pasó a ACTIVE en 3 s');

    lanza(() => crearTablaDynamo(e, { nombre: 'puntajes-ana', pk: { nombre: 'jugador', tipo: 'S' } }), 'ResourceInUseException', 'tabla duplicada');
    lanza(() => crearTablaDynamo(e, { nombre: 'ab', pk: { nombre: 'id', tipo: 'S' } }), 'ValidationException', 'nombre de 2 letras');
    lanza(() => crearTablaDynamo(e, { nombre: 'mi tabla', pk: { nombre: 'id', tipo: 'S' } }), 'ValidationException', 'nombre con espacio');
    lanza(() => crearTablaDynamo(e, { nombre: 'sin-llave', pk: { nombre: '', tipo: 'S' } }), 'ValidationException', 'sin partition key');

    /* ---------- ítems: PutItem, sobrescribir, sin esquema fijo */
    ponerItemDynamo(e, 'puntajes-ana', { jugador: { S: 'ana' }, puntaje: { N: '950' } });
    ponerItemDynamo(e, 'puntajes-ana', itemDynamoTipado({ jugador: 'luis', puntaje: 720, nivel: 'experto' }));
    const r = ponerItemDynamo(e, 'puntajes-ana', { jugador: { S: 'ana' }, puntaje: { N: '951.0' } });
    espera(r.reemplazado, 'PutItem con la misma llave no avisó que reemplazó');
    espera(tabla.items.length === 2, `PutItem duplicó el ítem: ${tabla.items.length} ítems`);
    espera(leerItemDynamo(e, 'puntajes-ana', { jugador: 'ana' })?.puntaje?.N === '951', 'el número no se normalizó (951.0 → 951)');
    espera(!leerItemDynamo(e, 'puntajes-ana', { jugador: 'ana' }).nivel && leerItemDynamo(e, 'puntajes-ana', { jugador: 'luis' }).nivel?.S === 'experto', 'el atributo nivel debería existir solo en luis');
    lanza(() => ponerItemDynamo(e, 'puntajes-ana', { puntaje: { N: '1' } }), 'ValidationException', 'ítem sin la partition key');
    lanza(() => ponerItemDynamo(e, 'puntajes-ana', { jugador: { N: '1' } }), 'ValidationException', 'ítem con la llave de otro tipo');
    lanza(() => ponerItemDynamo(e, 'puntajes-ana', { jugador: { S: '' } }), 'ValidationException', 'llave vacía');
    lanza(() => ponerItemDynamo(e, 'puntajes-ana', { jugador: { S: 'z' }, n: { N: 'abc' } }), 'ValidationException', 'número inválido');
    lanza(() => ponerItemDynamo(e, 'puntajes-ana', { jugador: { S: 'z' }, s: { SS: [] } }), 'ValidationException', 'set vacío');
    lanza(() => ponerItemDynamo(e, 'puntajes-ana', { jugador: { S: 'z' }, s: { SS: ['a', 'a'] } }), 'ValidationException', 'set con duplicados');
    lanza(() => ponerItemDynamo(e, 'puntajes-ana', { jugador: { S: 'z' }, s: { S: 'a', N: '1' } }), 'ValidationException', 'valor con dos tipos');
    ponerItemDynamo(e, 'puntajes-ana', {
      jugador: { S: 'mariana' },
      puntaje: { N: '880' },
      activa: { BOOL: true },
      nada: { NULL: true },
      foto: { B: 'aGVsbG8=' },
      etiquetas: { SS: ['a', 'b'] },
      notas: { NS: ['1', '2.5'] },
      lista: { L: [{ S: 'x' }, { N: '2' }] },
      mapa: { M: { ciudad: { S: 'Oaxaca' } } }
    });
    espera(itemDynamoPlano(leerItemDynamo(e, 'puntajes-ana', { jugador: 'mariana' })).mapa.ciudad === 'Oaxaca', 'itemDynamoPlano no convierte mapas');

    /* ---------- Scan contra Query */
    const s = escanearTabla(e, 'puntajes-ana');
    espera(s.devueltos === 3 && s.revisados === 3 && s.eficiencia === 100 && s.rcu === 0.5, `Scan: ${JSON.stringify({ ...s, items: undefined })}`);
    const q = consultarTabla(e, 'puntajes-ana', { pk: 'ana' });
    espera(q.devueltos === 1 && q.revisados === 1 && q.eficiencia === 100, `Query ana: ${JSON.stringify({ ...q, items: undefined })}`);
    const sf = escanearTabla(e, 'puntajes-ana', { filtros: [{ atributo: 'puntaje', condicion: 'GT', valor: '800', tipo: 'N' }] });
    espera(sf.devueltos === 2 && sf.revisados === 3 && sf.eficiencia === 67, `Scan con filtro: ${sf.devueltos}/${sf.revisados} ${sf.eficiencia}%`);
    espera(escanearTabla(e, 'puntajes-ana', { filtros: [{ atributo: 'nivel', condicion: 'NOT_NULL' }] }).devueltos === 1, 'filtro Exists');
    espera(escanearTabla(e, 'puntajes-ana', { filtros: [{ atributo: 'etiquetas', condicion: 'CONTAINS', valor: 'b', tipo: 'S' }] }).devueltos === 1, 'filtro Contains sobre un set');
    lanza(() => consultarTabla(e, 'puntajes-ana', {}), 'ValidationException', 'Query sin partition key');
    lanza(() => escanearTabla(e, 'no-existe'), 'ResourceNotFoundException', 'Scan de una tabla que no existe');

    /* ---------- llave compuesta: condiciones de sort key */
    crearTablaDynamo(e, { nombre: 'boletos', pk: { nombre: 'evento', tipo: 'S' }, sk: { nombre: 'asiento', tipo: 'N' }, modo: 'PROVISIONED', lectura: 5, escritura: 5 });
    pasar(e, 3000);
    for (const n of [1, 2, 10, 20]) ponerItemDynamo(e, 'boletos', { evento: { S: 'festival' }, asiento: { N: String(n) }, zona: { S: n < 10 ? 'vip' : 'general' } });
    ponerItemDynamo(e, 'boletos', { evento: { S: 'otro' }, asiento: { N: '1' } });
    const entre = consultarTabla(e, 'boletos', { pk: 'festival', sk: { condicion: 'BETWEEN', valor: '2', valor2: '10' } });
    espera(entre.devueltos === 2 && entre.items.map((i) => i.asiento.N).join() === '2,10', `Between ordena por número: ${entre.items.map((i) => i.asiento.N)}`);
    espera(consultarTabla(e, 'boletos', { pk: 'festival', descendente: true }).items[0].asiento.N === '20', 'Query descendente');
    lanza(() => consultarTabla(e, 'boletos', { pk: 'festival', sk: { condicion: 'BEGINS_WITH', valor: '1' } }), 'ValidationException', 'begins_with sobre una sort key numérica');
    const qf = consultarTabla(e, 'boletos', { pk: 'festival', filtros: [{ atributo: 'zona', condicion: 'EQ', valor: 'vip', tipo: 'S' }] });
    espera(qf.revisados === 4 && qf.devueltos === 2 && qf.eficiencia === 50, 'Query con filtro: el filtro no reduce lo revisado');

    /* ---------- GSI */
    const gsi = crearIndiceDynamo(e, 'boletos', { nombre: 'zona-index', pk: { nombre: 'zona', tipo: 'S' }, proyeccion: 'KEYS_ONLY' });
    lanza(() => consultarTabla(e, 'boletos', { indice: 'zona-index', pk: 'vip' }), 'ValidationException', 'leer un índice que todavía se crea');
    pasar(e, 3000);
    espera(gsi.estado === 'ACTIVE', 'el índice no pasó a ACTIVE');
    const qi = consultarTabla(e, 'boletos', { indice: 'zona-index', pk: 'general' });
    espera(qi.devueltos === 2 && qi.revisados === 2, `Query sobre el índice: ${qi.devueltos}`);
    espera(escanearTabla(e, 'boletos', { indice: 'zona-index' }).revisados === 4, 'Scan del índice disperso debería ver solo los ítems con zona');
    lanza(() => ponerItemDynamo(e, 'boletos', { evento: { S: 'x' }, asiento: { N: '1' }, zona: { N: '3' } }), 'ValidationException', 'llave del índice con otro tipo');

    /* ---------- editar y borrar ítems */
    editarItemDynamo(e, 'puntajes-ana', { jugador: 'luis' }, { jugador: { S: 'luis2' }, puntaje: { N: '1' } });
    espera(!leerItemDynamo(e, 'puntajes-ana', { jugador: 'luis' }) && leerItemDynamo(e, 'puntajes-ana', { jugador: 'luis2' }), 'editar con llave nueva debe mover el ítem');
    espera(eliminarItemsDynamo(e, 'puntajes-ana', [{ jugador: { S: 'luis2' } }]) === 1, 'DeleteItem');

    /* ---------- capacidad, PITR, respaldos y réplicas */
    lanza(() => crearReplicaDynamo(e, 'boletos', 'us-west-2'), 'ValidationException', 'réplica en provisioned sin autoescalado');
    editarCapacidadDynamo(e, 'boletos', { modo: 'PROVISIONED', autoescalado: { lectura: { min: 1, max: 10, objetivo: 70 }, escritura: { min: 2, max: 10, objetivo: 70 } } });
    espera(tablaDynamoDe(e, 'boletos').capacidad.escritura === 2 && tablaDynamoDe(e, 'boletos').estado === 'UPDATING', 'autoescalado: la capacidad empieza en el mínimo');
    lanza(() => editarCapacidadDynamo(e, 'boletos', { modo: 'PAY_PER_REQUEST' }), 'ResourceInUseException', 'editar mientras está UPDATING');
    pasar(e, 3000);
    lanza(() => editarCapacidadDynamo(e, 'boletos', { modo: 'PROVISIONED', autoescalado: { lectura: { min: 5, max: 2, objetivo: 70 } } }), 'ValidationException', 'máximo menor que el mínimo');
    lanza(() => editarCapacidadDynamo(e, 'boletos', { modo: 'PROVISIONED', autoescalado: { lectura: { min: 1, max: 2, objetivo: 95 } } }), 'ValidationException', 'objetivo de 95 %');
    const rep = crearReplicaDynamo(e, 'boletos', 'us-west-2');
    espera(tablaDynamoDe(e, 'boletos').stream === 'NEW_AND_OLD_IMAGES', 'crear réplica enciende Streams');
    pasar(e, 8000);
    espera(rep.estado === 'ACTIVE', 'la réplica no pasó a ACTIVE');

    lanza(() => restaurarPitrDynamo(e, 'puntajes-ana', 'puntajes-pitr'), 'PointInTimeRecoveryUnavailableException', 'restaurar sin PITR');
    editarPitrDynamo(e, 'puntajes-ana', true, 7);
    espera(tablaDynamoDe(e, 'puntajes-ana').pitr?.dias === 7, 'PITR con 7 días');
    const restaurada = restaurarPitrDynamo(e, 'puntajes-ana', 'puntajes-pitr');
    espera(restaurada.items.length === 2, 'la restauración PITR no copió los ítems');
    pasar(e, 5000);
    espera(restaurada.estado === 'ACTIVE', 'la tabla restaurada no quedó ACTIVE');

    const resp = crearRespaldoDynamo(e, 'puntajes-ana', 'puntajes-respaldo');
    lanza(() => restaurarRespaldoDynamo(e, resp.arn, 'otra'), 'BackupInUseException', 'restaurar un respaldo que se crea');
    pasar(e, 3000);
    espera(resp.estado === 'AVAILABLE', 'el respaldo no quedó AVAILABLE');
    ponerItemDynamo(e, 'puntajes-ana', { jugador: { S: 'nuevo' } });
    const desdeResp = restaurarRespaldoDynamo(e, resp.arn, 'puntajes-copia');
    espera(desdeResp.items.length === 2, 'el respaldo debe guardar los ítems de ese momento');
    lanza(() => restaurarRespaldoDynamo(e, resp.arn, 'puntajes-ana'), 'TableAlreadyExistsException', 'restaurar sobre una tabla que existe');

    /* ---------- borrar */
    editarProteccionDynamo(e, 'puntajes-ana', true);
    lanza(() => eliminarTablaDynamo(e, 'puntajes-ana'), 'ValidationException', 'borrar una tabla protegida');
    editarProteccionDynamo(e, 'puntajes-ana', false);
    lanza(() => eliminarTablaDynamo(e, 'boletos'), 'ValidationException', 'borrar una tabla con réplicas');
    eliminarTablaDynamo(e, 'puntajes-ana', { respaldo: true, nombreRespaldo: 'ultimo-respaldo' });
    espera(tablaDynamoDe(e, 'puntajes-ana').estado === 'DELETING', 'la tabla debe quedar DELETING');
    espera(e.dynamodb.respaldos.some((x) => x.nombre === 'ultimo-respaldo'), 'el respaldo antes de borrar no se creó');
    pasar(e, 3000);
    espera(!tablaDynamoDe(e, 'puntajes-ana'), 'la tabla no desapareció');
    eliminarRespaldoDynamo(e, resp.arn);
    espera(e.dynamodb.respaldos.length === 1, 'DeleteBackup');

    /* ---------- límites del simulador y llamar() */
    const grande = { jugador: { S: 'g' }, texto: { S: 'x'.repeat(9000) } };
    lanza(() => ponerItemDynamo(e, 'boletos', { ...grande, evento: { S: 'g' }, asiento: { N: '1' } }), 'ValidationException', 'ítem de más de 8 KB');
    espera(llamar('consultarTabla', e, 'boletos', { pk: 'festival' })?.devueltos === 4, 'llamar(consultarTabla) no responde');
    espera(JSON.stringify(e).length < 512 * 1024, 'el estado pasa de 512 KB');
    espera(JSON.parse(JSON.stringify(e)).dynamodb.tablas.length === e.dynamodb.tablas.length, 'el estado no es JSON puro');

    /* ---------- cuenta vieja */
    const vieja = cuentaNueva({});
    delete vieja.dynamodb;
    avanzar(vieja, t);
    espera(Array.isArray(vieja.dynamodb?.tablas), 'avanzar no migró una cuenta vieja');
    delete vieja.dynamodb;
    crearTablaDynamo(vieja, { nombre: 'vieja', pk: { nombre: 'id', tipo: 'N' } });
    espera(vieja.dynamodb.tablas.length === 1, 'crear tabla en una cuenta vieja');
  } catch (err) {
    fallas.push(`tronó: ${err.stack ?? err}`);
  } finally {
    reloj.ahora = relojOriginal;
  }
  return fallas;
}
