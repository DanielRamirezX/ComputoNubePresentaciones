// Pruebas del núcleo del modelo (modelo.js) en lo que pidieron los demás
// servicios: disparadores S3 → Lambda, etiquetas de instancias y de buckets,
// puertos vacíos en las reglas, snapshots públicos y la llave de KMS de S3.
// Usa solo modelo.js con el reloj fijo.

import * as m from '../../public/consola/modelo.js';

export const titulo = 'Núcleo (EC2, VPC y S3)';

export async function probar() {
  const fallas = [];
  const ok = (cond, texto) => {
    if (!cond) fallas.push(texto);
  };
  const errorDe = (fn) => {
    try {
      fn();
      return null;
    } catch (e) {
      return e;
    }
  };
  const falla = (fn, codigo, texto) => {
    const e = errorDe(fn);
    if (!e) fallas.push(`${texto}: no falló`);
    else if (e.name !== 'ErrorAws' || e.codigo !== codigo) fallas.push(`${texto}: esperaba ${codigo} y salió ${e.codigo ?? e.message}`);
    return e;
  };
  const relojOriginal = m.reloj.ahora;
  try {
    let t = Date.UTC(2026, 10, 2, 15, 0, 0);
    m.reloj.ahora = () => t;
    const pasa = (seg) => {
      t += seg * 1000;
      m.avanzar(e, t);
    };
    const e = m.cuentaNueva({ cuentaId: '111122223333', nombre: 'Ana' });
    const sg = e.gruposSeguridad[0];

    /* ------------------------------------------------ 1. S3 → Lambda */
    const fn = m.crearFuncion(e, { nombre: 'procesa-fotos', runtime: 'nodejs22.x' });
    m.crearBucket(e, { nombre: 'fotos-nucleo-111122223333' });
    m.agregarDisparador(e, fn.nombre, { tipo: 's3', bucket: 'fotos-nucleo-111122223333', sufijo: '.jpg', eventos: ['s3:ObjectCreated:*', 's3:ObjectRemoved:*'] });
    const antes = fn.invocaciones ?? 0;
    m.subirObjetos(e, 'fotos-nucleo-111122223333', [{ llave: 'a.jpg', tamano: 100 }, { llave: 'b.png', tamano: 50 }]);
    ok((fn.invocaciones ?? 0) === antes + 1, `subirObjetos no avisó a Lambda (invocaciones: ${fn.invocaciones - antes}, esperaba 1 por el sufijo .jpg)`);
    m.eliminarObjetos(e, 'fotos-nucleo-111122223333', ['a.jpg']);
    ok((fn.invocaciones ?? 0) === antes + 2, 'eliminarObjetos no avisó ObjectRemoved:Delete a Lambda');
    // Sin funciones ni la extensión de Lambda en uso, subir sigue funcionando igual.
    m.crearBucket(e, { nombre: 'sin-disparador-111122223333', versionado: true });
    const sub = m.subirObjetos(e, 'sin-disparador-111122223333', [{ llave: 'x.txt', tamano: 3 }]);
    ok(sub.length === 1 && sub[0].versionId !== 'null', 'subirObjetos en un bucket con versionado');
    m.eliminarObjetos(e, 'sin-disparador-111122223333', ['x.txt']);
    ok(m.bucketDe(e, 'sin-disparador-111122223333').objetos.some((o) => o.marcadorBorrado), 'el borrado con versionado no dejó marcador');

    /* ------------------------------------------ 2. etiquetas de instancias */
    const [inst] = m.lanzarInstancias(e, {
      nombre: 'web',
      gruposSeguridad: [sg.id],
      etiquetas: [{ llave: 'Name', valor: 'ignorada' }, { llave: 'Proyecto', valor: 'tienda' }, { llave: 'Ambiente' }, { llave: '', valor: 'sin llave' }]
    });
    ok(inst.nombre === 'web', 'la etiqueta Name de etiquetas pisó el nombre');
    ok(JSON.stringify(inst.etiquetas) === JSON.stringify([{ llave: 'Proyecto', valor: 'tienda' }, { llave: 'Ambiente', valor: '' }]), `inst.etiquetas quedó ${JSON.stringify(inst.etiquetas)}`);
    const [sinTags] = m.lanzarInstancias(e, { nombre: 'otra', gruposSeguridad: [sg.id] });
    ok(Array.isArray(sinTags.etiquetas) && sinTags.etiquetas.length === 0, 'una instancia sin etiquetas no trae etiquetas: []');
    m.editarInstancia(e, inst.id, { nombre: 'web-1', etiquetas: [{ llave: 'Proyecto', valor: 'tienda' }, { llave: 'CentroCosto', valor: 'ventas' }] });
    ok(inst.nombre === 'web-1' && inst.etiquetas.length === 2 && inst.etiquetas[1].llave === 'CentroCosto', 'Manage tags no guardó Name y las demás etiquetas');
    m.editarInstancia(e, inst.id, { nombre: 'web-2' });
    ok(inst.etiquetas.length === 2, 'editar solo el Name borró las demás etiquetas');
    falla(() => m.editarInstancia(e, inst.id, { etiquetas: [{ llave: 'A', valor: '1' }, { llave: 'A', valor: '2' }] }), 'InvalidParameterValue', 'etiquetas repetidas');
    falla(() => m.editarInstancia(e, inst.id, { etiquetas: [{ llave: 'aws:algo', valor: '1' }] }), 'InvalidParameterValue', 'etiqueta aws: reservada');
    const tagsCosto = m.etiquetasDe(inst);
    ok(tagsCosto.Proyecto === 'tienda' && tagsCosto.CentroCosto === 'ventas' && tagsCosto.Name === 'web-2', `costos (etiquetasDe) no lee inst.etiquetas: ${JSON.stringify(tagsCosto)}`);

    /* ------------------------------------------------- 3. puertos vacíos */
    const pedir = (desde, protocolo = 'tcp') => () => m.editarReglasSg(e, sg.id, 'entrada', [{ protocolo, desde, hasta: desde, origen: '0.0.0.0/0' }]);
    for (const v of ['', '  ', null, undefined]) {
      const err = falla(pedir(v), 'InvalidParameterValue', `puerto ${JSON.stringify(v)} en Custom TCP`);
      ok(!err || err.message === 'Invalid port range: . Port must be a number between 0 and 65535.', `mensaje del puerto vacío: ${err?.message}`);
    }
    ok(!errorDe(() => m.editarReglasSg(e, sg.id, 'entrada', [{ protocolo: '-1', origen: '10.0.0.0/16' }, { protocolo: 'icmp', origen: '10.0.0.0/16' }])), 'All traffic / All ICMP sin puertos dejaron de funcionar');
    ok(!errorDe(() => m.editarReglasSg(e, sg.id, 'entrada', [{ protocolo: 'tcp', desde: 0, hasta: 0, origen: '10.0.0.0/16' }, { protocolo: 'tcp', desde: '80', hasta: '', origen: '0.0.0.0/0' }])), 'el puerto 0 escrito o el 80 sin «hasta» dejaron de funcionar');
    ok(sg.entrada.some((r) => r.desde === 80 && r.hasta === 80), 'el 80 sin «hasta» no quedó 80-80');
    const nacl = e.nacls[0];
    falla(() => m.editarReglasNacl(e, nacl.id, 'entrada', [{ numero: 100, protocolo: 'tcp', desde: '', cidr: '0.0.0.0/0', accion: 'allow' }]), 'InvalidParameterValue', 'puerto vacío en una NACL');

    /* ------------------------------------------------ 5. snapshots públicos */
    const vol = m.crearVolumen(e, { tipo: 'gp3', tamano: 8, az: 'us-east-1a' });
    pasa(10);
    const snap = m.crearSnapshot(e, { volumenId: vol.id });
    ok(snap.publico === false, 'un snapshot nuevo no nace con publico: false');
    falla(() => m.cambiarPermisosSnapshot(e, snap.id, { publico: true }), 'IncorrectState', 'hacer público un snapshot pending');
    pasa(30);
    m.cambiarPermisosSnapshot(e, snap.id, { publico: true });
    ok(snap.publico === true, 'Modify permissions → Public no marcó el snapshot');
    ok(e.bitacora.at(-1).accion === 'ModifySnapshotAttribute' && e.bitacora.at(-1).detalle.includes(snap.id), 'ModifySnapshotAttribute no quedó en la bitácora');
    const evento = m.eventosCloudTrail(e)[0];
    ok(evento?.nombre === 'ModifySnapshotAttribute' && evento.recursos.some((r) => r.tipo === 'AWS::EC2::Snapshot' && r.nombre === snap.id), 'CloudTrail no muestra ModifySnapshotAttribute con el snapshot');
    m.cambiarPermisosSnapshot(e, snap.id, { publico: false });
    ok(snap.publico === false, 'Modify permissions → Private no lo regresó');
    const volCifrado = m.crearVolumen(e, { tipo: 'gp3', tamano: 8, az: 'us-east-1a', cifrado: true });
    pasa(10);
    const snapCifrado = m.crearSnapshot(e, { volumenId: volCifrado.id });
    pasa(30);
    falla(() => m.cambiarPermisosSnapshot(e, snapCifrado.id, { publico: true }), 'OperationNotPermitted', 'hacer público un snapshot cifrado');
    falla(() => m.cambiarPermisosSnapshot(e, 'snap-0000000000000000', { publico: true }), 'InvalidSnapshot.NotFound', 'snapshot que no existe');

    /* ------------------------------------------------ 6. etiquetas de bucket */
    m.crearBucket(e, { nombre: 'etiquetas-nucleo-111122223333', etiquetas: [{ llave: 'Proyecto', valor: 'tienda' }] });
    const bEt = m.editarEtiquetasBucket(e, 'etiquetas-nucleo-111122223333', [{ llave: 'Proyecto', valor: 'clinica' }, { llave: ' Ambiente ', valor: 'prod' }, { llave: '', valor: 'x' }]);
    ok(JSON.stringify(bEt.etiquetas) === JSON.stringify([{ llave: 'Proyecto', valor: 'clinica' }, { llave: 'Ambiente', valor: 'prod' }]), `editarEtiquetasBucket guardó ${JSON.stringify(bEt.etiquetas)}`);
    ok(e.bitacora.at(-1).accion === 'PutBucketTagging', 'PutBucketTagging no quedó en la bitácora');
    falla(() => m.editarEtiquetasBucket(e, 'etiquetas-nucleo-111122223333', [{ llave: 'A' }, { llave: 'A' }]), 'InvalidTag', 'etiquetas de bucket repetidas');
    falla(() => m.editarEtiquetasBucket(e, 'no-existe-nucleo', []), 'NoSuchBucket', 'etiquetas de un bucket que no existe');
    m.editarEtiquetasBucket(e, 'etiquetas-nucleo-111122223333', []);
    ok(bEt.etiquetas.length === 0 && e.bitacora.at(-1).accion === 'DeleteBucketTagging', 'quitar todas las etiquetas no anotó DeleteBucketTagging');

    /* -------------------------------------------- 7. llave de KMS en S3 */
    const llave = m.crearLlaveKms(e, { alias: 'clinica-expedientes', descripcion: 'Expedientes' });
    const b1 = m.crearBucket(e, { nombre: 'kms-propia-111122223333', cifrado: 'SSE-KMS', llaveKms: 'alias/clinica-expedientes' });
    ok(b1.cifrado.tipo === 'SSE-KMS' && b1.cifrado.llaveKms === llave.id, `crearBucket con alias guardó ${JSON.stringify(b1.cifrado)}`);
    const b2 = m.crearBucket(e, { nombre: 'kms-aws-111122223333', cifrado: 'SSE-KMS' });
    ok(b2.cifrado.llaveKms === null, 'SSE-KMS sin llave no quedó con aws/s3 (llaveKms: null)');
    const b3 = m.crearBucket(e, { nombre: 'sse-s3-111122223333', cifrado: 'SSE-S3', llaveKms: llave.id });
    ok(b3.cifrado.llaveKms === null, 'SSE-S3 guardó una llave de KMS');
    m.editarCifrado(e, 'kms-aws-111122223333', { tipo: 'SSE-KMS', bucketKey: true, llaveKms: llave.arn });
    ok(b2.cifrado.llaveKms === llave.id && b2.cifrado.bucketKey === true, 'editarCifrado con el ARN no guardó la llave');
    ok(e.bitacora.at(-1).detalle.includes(llave.arn), 'PutBucketEncryption no anota el ARN de la llave');
    m.editarCifrado(e, 'kms-aws-111122223333', { tipo: 'SSE-KMS', llaveKms: 'aws/s3' });
    ok(b2.cifrado.llaveKms === null, 'volver a aws/s3 no dejó llaveKms: null');
    falla(() => m.editarCifrado(e, 'kms-aws-111122223333', { tipo: 'SSE-KMS', llaveKms: 'arn:aws:kms:us-east-1:111122223333:key/no-existe' }), 'KMS.NotFoundException', 'una llave que no existe');
    const asim = m.crearLlaveKms(e, { alias: 'firma', tipo: 'asimetrica', uso: 'SIGN_VERIFY', spec: 'RSA_2048' });
    falla(() => m.editarCifrado(e, 'kms-aws-111122223333', { tipo: 'SSE-KMS', llaveKms: asim.id }), 'InvalidArgument', 'una llave asimétrica');
    m.subirObjetos(e, 'kms-propia-111122223333', [{ llave: 'exp-1.pdf', tamano: 10 }]);
    m.deshabilitarLlaveKms(e, llave.id);
    falla(() => m.subirObjetos(e, 'kms-propia-111122223333', [{ llave: 'exp-2.pdf', tamano: 10 }]), 'KMS.DisabledException', 'subir con la llave deshabilitada');
    falla(() => m.editarCifrado(e, 'kms-aws-111122223333', { tipo: 'SSE-KMS', llaveKms: llave.id }), 'KMS.DisabledException', 'elegir una llave deshabilitada');
    m.habilitarLlaveKms(e, llave.id);
    ok(!errorDe(() => m.subirObjetos(e, 'kms-propia-111122223333', [{ llave: 'exp-2.pdf', tamano: 10 }])), 'subir con la llave otra vez habilitada');
    // Un bucket de antes (sin llaveKms) sigue funcionando.
    const viejo = m.crearBucket(e, { nombre: 'viejo-nucleo-111122223333' });
    viejo.cifrado = { tipo: 'SSE-KMS', bucketKey: true };
    ok(!errorDe(() => m.subirObjetos(e, 'viejo-nucleo-111122223333', [{ llave: 'a.txt', tamano: 1 }])), 'un bucket sin cifrado.llaveKms ya no acepta objetos');
  } catch (err) {
    fallas.push(`la prueba se cayó: ${err?.stack ?? err}`);
  } finally {
    m.reloj.ahora = relojOriginal;
  }
  return fallas;
}
