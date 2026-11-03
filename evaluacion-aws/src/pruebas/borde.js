// Pruebas del modelo de CloudFront y Route 53 (modelo/borde.js) y de cómo el
// navegador simulado (red.js) abre un dominio propio: sitio estático en S3 →
// distribución de CloudFront → registro Alias en Route 53 → http://www.<dominio>.
// También: errores de AWS, despliegue e invalidaciones con el reloj fijo,
// políticas weighted y failover con health checks, y cuentas viejas.

import {
  avanzar,
  cambiarEstadoDistribucion,
  crearBucket,
  crearChequeoSalud,
  crearComportamientoCache,
  crearDistribucion,
  crearGrupoSeguridad,
  crearInvalidacion,
  crearRegistroDns,
  crearRegistrosDns,
  crearVpc,
  crearZonaHospedada,
  cuentaNueva,
  detenerInstancia,
  editarBloqueoPublico,
  editarDistribucion,
  editarPolitica,
  editarRegistroDns,
  editarSitioWeb,
  eliminarChequeoSalud,
  eliminarDistribucion,
  eliminarRegistrosDns,
  eliminarVpc,
  eliminarZonaHospedada,
  existeFuncion,
  lanzarInstancias,
  llamar,
  probarRegistroDns,
  reloj,
  resolverNombre,
  subirObjetos
} from '../../public/consola/modelo.js';
import { probarPagina } from '../../public/consola/red.js';

export const titulo = 'CloudFront y Route 53';

const SCRIPT = `#!/bin/bash
dnf install -y httpd
echo "<h1>API del festival</h1>" > /var/www/html/index.html
systemctl enable --now httpd`;

const POLITICA_PUBLICA = (b) => JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: `arn:aws:s3:::${b}/*` }] });
const SIN_BLOQUEO = { aclsNuevas: false, aclsCualquiera: false, politicasNuevas: false, politicasCualquiera: false };

export async function probar() {
  const fallas = [];
  const espera = (cond, texto) => {
    if (!cond) fallas.push(texto);
  };
  const lanza = (fn, codigo, texto) => {
    try {
      fn();
      fallas.push(`${texto}: no lanzó ${codigo}`);
    } catch (e) {
      if (e.codigo !== codigo) fallas.push(`${texto}: lanzó ${e.codigo ?? e.message} en lugar de ${codigo}`);
      return e;
    }
  };

  const reloj0 = reloj.ahora;
  let t = Date.UTC(2026, 10, 19, 16, 0, 0);
  reloj.ahora = () => t;
  let e;
  const pasa = (ms) => {
    t += ms;
    avanzar(e, t);
  };
  try {
    // ---- Una cuenta vieja (sin estado.cloudfront ni estado.route53) no truena.
    const vieja = cuentaNueva({ cuentaId: '111122223333' });
    delete vieja.cloudfront;
    delete vieja.route53;
    espera(llamar('distribucionPorDominio', vieja, 'd1abc.cloudfront.net') === null, 'distribucionPorDominio en cuenta vieja no da null');
    delete vieja.route53;
    espera(llamar('resolverNombre', vieja, 'www.ejemplo.mx') === null, 'resolverNombre en cuenta vieja no da null');
    delete vieja.cloudfront;
    delete vieja.route53;
    avanzar(vieja, t);
    espera(Array.isArray(vieja.cloudfront?.distribuciones) && Array.isArray(vieja.route53?.zonas), 'avanzar no crea las colecciones en una cuenta vieja');
    espera(probarPagina(vieja, 'http://www.ejemplo.mx').resultado === 'dns', 'un dominio sin zona no da error de DNS');
    for (const f of ['distribucionPorDominio', 'resolverNombre']) espera(existeFuncion(f), `llamar no ofrece ${f}`);

    e = cuentaNueva({ cuentaId: '111122223333', ipCasa: '187.190.20.30' });

    // ---- El sitio estático privado (para CloudFront con OAC).
    crearBucket(e, { nombre: 'festival-sitio-111' });
    lanza(() => crearDistribucion(e, { nombre: 'festival', origen: { tipo: 's3', recurso: 'no-existe-111' } }), 'InvalidArgument', 'origen de un bucket que no existe');
    lanza(() => crearDistribucion(e, { nombre: '', origen: { tipo: 's3', recurso: 'festival-sitio-111' } }), 'InvalidArgument', 'distribución sin nombre');
    lanza(() => crearDistribucion(e, { nombre: 'festival', origen: { tipo: 's3', recurso: 'festival-sitio-111' }, objetoRaiz: '/index.html' }), 'InvalidDefaultRootObject', 'default root object con diagonal');
    lanza(() => crearDistribucion(e, { nombre: 'festival', origen: { tipo: 's3-website', recurso: 'festival-sitio-111' } }), 'InvalidArgument', 'origen de sitio web sin website hosting');
    lanza(() => crearDistribucion(e, { nombre: 'festival', origen: { tipo: 'custom', dominio: 'api.ejemplo.mx', puertoHttp: 500 } }), 'InvalidArgument', 'puerto de origen 500');
    espera(e.cloudfront.distribuciones.length === 0, 'una distribución fallida quedó guardada');

    const dist = crearDistribucion(e, { nombre: 'festival', origen: { tipo: 's3', recurso: 'festival-sitio-111', acceso: 'oac' }, objetoRaiz: 'index.html' });
    espera(/^E[A-Z0-9]{13}$/.test(dist.id), `id raro: ${dist.id}`);
    espera(/^d[a-z0-9]{13}\.cloudfront\.net$/.test(dist.dominio), `dominio raro: ${dist.dominio}`);
    espera(dist.arn === `arn:aws:cloudfront::111122223333:distribution/${dist.id}`, `ARN raro: ${dist.arn}`);
    espera(dist.estado === 'Deploying' && !dist.desplegada, 'no empieza en Deploying');
    espera(/cloudfront\.amazonaws\.com/.test(e.buckets.find((b) => b.nombre === 'festival-sitio-111').politica ?? ''), 'OAC no actualizó la política del bucket');
    espera(e.cloudfront.oacs.length === 1 && dist.origenes[0].oacId === e.cloudfront.oacs[0].id, 'no se creó el OAC');
    espera(probarPagina(e, `https://${dist.dominio}`).resultado === 'dns', 'el dominio de CloudFront resuelve antes de desplegar');
    pasa(29000);
    espera(dist.estado === 'Deploying', 'terminó de desplegar antes de 30 s');
    pasa(2000);
    espera(dist.estado === 'Deployed' && dist.desplegada, 'no pasó a Deployed en 30 s');
    const sinIndice = probarPagina(e, `https://${dist.dominio}`);
    espera(sinIndice.resultado === 'ok' && sinIndice.codigoHttp === 403, `sin index.html no da 403 de S3: ${sinIndice.resultado} ${sinIndice.codigoHttp}`);
    subirObjetos(e, 'festival-sitio-111', [{ llave: 'index.html', tamano: 900, tipo: 'text/html' }]);
    const conIndice = probarPagina(e, `https://${dist.dominio}`);
    espera(conIndice.codigoHttp === 200 && conIndice.distribucion === dist.id, `CloudFront no sirve index.html: ${conIndice.codigoHttp} ${JSON.stringify(conIndice.diagnostico.at(-1))}`);
    const forma = llamar('distribucionPorDominio', e, dist.dominio.toUpperCase());
    espera(forma?.origen?.dominio === 'festival-sitio-111.s3.us-east-1.amazonaws.com' && forma.origen.protocolo === 'https' && forma.estado === 'Enabled', `forma de distribucionPorDominio: ${JSON.stringify(forma)}`);

    // ---- Comportamientos e invalidaciones.
    lanza(() => crearComportamientoCache(e, dist.id, { patron: '*' }), 'InvalidArgument', 'otro comportamiento *');
    crearComportamientoCache(e, dist.id, { patron: '/img/*', politicaCache: 'CachingDisabled' });
    espera(dist.comportamientos.length === 2 && dist.comportamientos.at(-1).patron === '*', 'el Default no quedó al final');
    lanza(() => crearInvalidacion(e, dist.id, ['index.html']), 'InvalidArgument', 'invalidación sin diagonal');
    lanza(() => crearInvalidacion(e, dist.id, []), 'MissingBody', 'invalidación vacía');
    const inv = crearInvalidacion(e, dist.id, ['/*']);
    espera(inv.estado === 'InProgress', 'la invalidación no empieza InProgress');
    pasa(11000);
    espera(inv.estado === 'Completed', 'la invalidación no terminó en 10 s');
    pasa(20000);
    espera(dist.estado === 'Deployed', 'el comportamiento no terminó de desplegar');
    for (let k = 0; k < 30; k++) crearInvalidacion(e, dist.id, [`/a${k}`]);
    espera(dist.invalidaciones.length === 20, 'las invalidaciones no se recortan a 20');

    // ---- Route 53: zona y errores de registros.
    lanza(() => crearZonaHospedada(e, { nombre: 'cloudfront.net' }), 'InvalidDomainName', 'zona reservada');
    lanza(() => crearZonaHospedada(e, { nombre: 'sinpunto' }), 'InvalidDomainName', 'zona sin punto');
    lanza(() => crearZonaHospedada(e, { nombre: 'interna.local', tipo: 'privada' }), 'InvalidVPCId', 'zona privada sin VPC');
    const zona = crearZonaHospedada(e, { nombre: 'Festival-Oax.com.' });
    espera(zona.nombre === 'festival-oax.com' && /^Z0[A-Z0-9]{19}$/.test(zona.id), `zona rara: ${zona.nombre} ${zona.id}`);
    espera(zona.registros.length === 2 && zona.registros.some((r) => r.tipo === 'NS' && r.valores.length === 4) && zona.registros.some((r) => r.tipo === 'SOA'), 'la zona no trae NS y SOA');
    lanza(() => crearRegistroDns(e, zona.id, { nombre: 'x.festival-oax.com', tipo: 'A', valores: ['999.1.1.1'] }), 'InvalidChangeBatch', 'A con IP mala');
    lanza(() => crearRegistroDns(e, zona.id, { nombre: 'festival-oax.com', tipo: 'CNAME', valores: ['otro.com'] }), 'InvalidChangeBatch', 'CNAME en el apex');
    lanza(() => crearRegistroDns(e, zona.id, { nombre: 'txt.festival-oax.com', tipo: 'TXT', valores: ['sin comillas'] }), 'InvalidChangeBatch', 'TXT sin comillas');
    lanza(() => crearRegistroDns(e, zona.id, { nombre: 'www.otra.com', tipo: 'A', valores: ['3.3.3.3'] }), 'InvalidChangeBatch', 'registro fuera de la zona');
    lanza(() => crearRegistroDns(e, zona.id, { nombre: 'mx.festival-oax.com', tipo: 'MX', valores: ['mail.festival-oax.com'] }), 'InvalidChangeBatch', 'MX sin prioridad');
    lanza(() => crearRegistroDns(e, zona.id, { nombre: 'www.festival-oax.com', tipo: 'A', alias: { tipoDestino: 'cloudfront', destino: 'd0000000000000.cloudfront.net' } }), 'InvalidChangeBatch', 'Alias a una distribución que no existe');
    lanza(() => crearRegistrosDns(e, zona.id, [{ nombre: 'ok.festival-oax.com', tipo: 'A', valores: ['3.3.3.3'] }, { nombre: 'mal.festival-oax.com', tipo: 'A', valores: ['x'] }]), 'InvalidChangeBatch', 'lote con un registro malo');
    espera(!zona.registros.some((r) => r.nombre === 'ok.festival-oax.com'), 'un lote fallido dejó registros a medias');

    // ---- Alias www → CloudFront. Sin el CNAME en la distribución, CloudFront contesta 403.
    const www = crearRegistroDns(e, zona.id, { nombre: 'www.festival-oax.com', tipo: 'A', alias: { tipoDestino: 'cloudfront', destino: dist.dominio, evaluarSalud: true } });
    espera(www.alias.zonaDestino === 'Z2FDTNDATAQYW2' && www.alias.evaluarSalud === false && www.ttl === null, `Alias a CloudFront raro: ${JSON.stringify(www.alias)}`);
    lanza(() => crearRegistroDns(e, zona.id, { nombre: 'www.festival-oax.com', tipo: 'CNAME', valores: [dist.dominio] }), 'InvalidChangeBatch', 'CNAME junto a un A con el mismo nombre');
    lanza(() => crearRegistroDns(e, zona.id, { nombre: 'www.festival-oax.com', tipo: 'A', valores: ['3.3.3.3'] }), 'InvalidChangeBatch', 'registro repetido');
    const r1 = resolverNombre(e, 'WWW.festival-oax.com.');
    espera(r1?.destino === dist.dominio && r1.alias === true, `resolverNombre www: ${JSON.stringify(r1)}`);
    const sinCname = probarPagina(e, 'http://www.festival-oax.com');
    espera(sinCname.codigoHttp === 403 && /could not be satisfied/.test(sinCname.html ?? ''), `sin alternate domain name no da 403 de CloudFront: ${sinCname.codigoHttp}`);
    editarDistribucion(e, dist.id, { alias: ['www.festival-oax.com'] });
    lanza(() => editarDistribucion(e, dist.id, { alias: ['www.cloudfront.net'] }), 'InvalidArgument', 'CNAME reservado');
    const sitio = probarPagina(e, 'http://www.festival-oax.com/');
    espera(sitio.resultado === 'ok' && sitio.codigoHttp === 200 && sitio.dominio === 'www.festival-oax.com', `www no abre el sitio: ${sitio.resultado} ${sitio.codigoHttp} ${JSON.stringify(sitio.diagnostico)}`);
    espera(sitio.diagnostico[0]?.paso === 'DNS (Route 53)', 'el diagnóstico no empieza con Route 53');
    const prueba = probarRegistroDns(e, zona.id, 'www.festival-oax.com', 'A');
    espera(prueba.codigo === 'NOERROR' && prueba.respuestas.length === 2 && prueba.respuestas.every((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)), `Test record raro: ${JSON.stringify(prueba)}`);
    espera(probarRegistroDns(e, zona.id, 'nada.festival-oax.com', 'A').codigo === 'NXDOMAIN', 'un nombre sin registros no da NXDOMAIN');
    espera(probarPagina(e, 'http://nada.festival-oax.com').resultado === 'dns', 'un nombre sin registro abre algo');

    // ---- Alias del apex al sitio web de S3 (el bucket se llama igual que el registro).
    lanza(() => crearRegistroDns(e, zona.id, { nombre: 'festival-oax.com', tipo: 'A', alias: { tipoDestino: 's3', destino: 's3-website-us-east-1.amazonaws.com' } }), 'InvalidChangeBatch', 'Alias a S3 sin bucket con ese nombre');
    crearBucket(e, { nombre: 'festival-oax.com' });
    editarSitioWeb(e, 'festival-oax.com', { habilitado: true, indice: 'index.html' });
    editarBloqueoPublico(e, 'festival-oax.com', SIN_BLOQUEO);
    editarPolitica(e, 'festival-oax.com', POLITICA_PUBLICA('festival-oax.com'));
    subirObjetos(e, 'festival-oax.com', [{ llave: 'index.html', tamano: 300, tipo: 'text/html' }]);
    crearRegistroDns(e, zona.id, { nombre: 'festival-oax.com', tipo: 'A', alias: { tipoDestino: 's3', destino: 's3-website-us-east-1.amazonaws.com' } });
    const apex = probarPagina(e, 'http://festival-oax.com');
    espera(apex.codigoHttp === 200 && apex.bucket === 'festival-oax.com', `el apex no abre el sitio de S3: ${apex.resultado} ${apex.codigoHttp}`);

    // ---- A con la IP de una instancia, weighted y failover con health check.
    const vpc = e.vpcs[0];
    const sg = crearGrupoSeguridad(e, { nombre: 'web-sg', descripcion: 'web', vpcId: vpc.id, entrada: [{ protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' }] });
    const [a, b] = lanzarInstancias(e, { nombre: 'api', subredId: e.subredes[0].id, gruposSeguridad: [sg.id], userData: SCRIPT, cantidad: 2 }).concat(lanzarInstancias(e, { nombre: 'api-2', subredId: e.subredes[1].id, gruposSeguridad: [sg.id], userData: SCRIPT }));
    pasa(60000);
    crearRegistroDns(e, zona.id, { nombre: 'api.festival-oax.com', tipo: 'A', valores: [a.ipPublica], ttl: 60 });
    const api = probarPagina(e, 'http://api.festival-oax.com');
    espera(api.codigoHttp === 200 && api.instancia === a.id, `el registro A no abre la instancia: ${api.resultado} ${JSON.stringify(api.diagnostico.at(-1))}`);
    crearRegistrosDns(e, zona.id, [
      { nombre: 'pesos.festival-oax.com', tipo: 'A', valores: [a.ipPublica], politica: 'weighted', identificador: 'azul', peso: 1 },
      { nombre: 'pesos.festival-oax.com', tipo: 'A', valores: [b.ipPublica], politica: 'weighted', identificador: 'verde', peso: 1 }
    ]);
    lanza(() => crearRegistroDns(e, zona.id, { nombre: 'pesos.festival-oax.com', tipo: 'A', valores: ['3.3.3.3'] }), 'InvalidChangeBatch', 'simple junto a un conjunto weighted');
    lanza(() => crearRegistroDns(e, zona.id, { nombre: 'pesos.festival-oax.com', tipo: 'A', valores: ['3.3.3.3'], politica: 'weighted', identificador: 'rojo', peso: 300 }), 'InvalidInput', 'peso de 300');
    const vistos = new Set([0, 1, 2, 3].map((turno) => resolverNombre(e, 'pesos.festival-oax.com', { turno })?.destino));
    espera(vistos.has(a.ipPublica) && vistos.has(b.ipPublica), `weighted no reparte: ${[...vistos].join(', ')}`);

    lanza(() => crearChequeoSalud(e, { nombre: 'priv', ip: '10.0.0.5' }), 'InvalidInput', 'health check a una IP privada');
    const ch = crearChequeoSalud(e, { nombre: 'api-a', protocolo: 'HTTP', ip: a.ipPublica, puerto: 80, ruta: '/' });
    espera(ch.estado === 'Unknown', 'el health check no empieza en Unknown');
    pasa(6000);
    espera(ch.estado === 'Healthy', `el health check no pasó a Healthy: ${ch.estado} ${ch.observacion}`);
    crearRegistrosDns(e, zona.id, [
      { nombre: 'app.festival-oax.com', tipo: 'A', valores: [a.ipPublica], politica: 'failover', identificador: 'primario', failover: 'PRIMARY', chequeoId: ch.id },
      { nombre: 'app.festival-oax.com', tipo: 'A', valores: [b.ipPublica], politica: 'failover', identificador: 'secundario', failover: 'SECONDARY' }
    ]);
    lanza(() => crearRegistroDns(e, zona.id, { nombre: 'app.festival-oax.com', tipo: 'A', valores: ['3.3.3.3'], politica: 'failover', identificador: 'otro', failover: 'PRIMARY' }), 'InvalidChangeBatch', 'dos PRIMARY');
    espera(resolverNombre(e, 'app.festival-oax.com')?.destino === a.ipPublica, 'failover no usa el primario sano');
    detenerInstancia(e, a.id);
    pasa(6000);
    espera(ch.estado === 'Healthy', 'un solo chequeo malo ya lo marcó Unhealthy');
    pasa(12000);
    espera(ch.estado === 'Unhealthy' && /Failure/.test(ch.observacion), `no quedó Unhealthy tras el umbral: ${ch.estado} ${ch.observacion}`);
    espera(resolverNombre(e, 'app.festival-oax.com')?.destino === b.ipPublica, 'failover no pasó al secundario');
    espera(probarPagina(e, 'http://app.festival-oax.com').instancia === b.id, 'el navegador no llega al secundario');
    lanza(() => eliminarChequeoSalud(e, ch.id), 'HealthCheckInUse', 'borrar un health check en uso');
    const ttl = zona.registros.find((r) => r.nombre === 'api.festival-oax.com');
    editarRegistroDns(e, zona.id, ttl.id, { valores: [b.ipPublica], ttl: 120 });
    espera(ttl.valores[0] === b.ipPublica && ttl.ttl === 120, 'Edit record no cambió el valor ni el TTL');

    // ---- Borrar: la zona con registros no; el NS y el SOA no; la distribución habilitada no.
    lanza(() => eliminarZonaHospedada(e, zona.id), 'HostedZoneNotEmpty', 'borrar una zona con registros');
    lanza(() => eliminarRegistrosDns(e, zona.id, [zona.registros.find((r) => r.tipo === 'NS').id]), 'InvalidChangeBatch', 'borrar el NS');
    lanza(() => eliminarDistribucion(e, dist.id), 'DistributionNotDisabled', 'borrar una distribución habilitada');
    cambiarEstadoDistribucion(e, dist.id, false);
    lanza(() => eliminarDistribucion(e, dist.id), 'DistributionNotDisabled', 'borrar mientras se despliega');
    pasa(31000);
    espera(probarPagina(e, `https://${dist.dominio}`).codigoHttp === 403, 'una distribución deshabilitada sigue sirviendo');
    eliminarDistribucion(e, dist.id);
    espera(probarPagina(e, 'http://www.festival-oax.com').resultado === 'dns', 'el Alias a una distribución borrada sigue abriendo');
    eliminarRegistrosDns(e, zona.id, zona.registros.filter((r) => !r.sistema).map((r) => r.id));
    eliminarChequeoSalud(e, ch.id);
    eliminarZonaHospedada(e, zona.id);
    espera(e.route53.zonas.length === 0 && e.route53.chequeos.length === 0, 'no se borró la zona o el health check');

    // ---- Zona privada: no deja borrar su VPC.
    const vpc2 = crearVpc(e, { nombre: 'interna', cidr: '10.50.0.0/16' });
    const privada = crearZonaHospedada(e, { nombre: 'interna.local', tipo: 'privada', vpcs: [vpc2.id] });
    crearRegistroDns(e, privada.id, { nombre: 'db.interna.local', tipo: 'A', valores: ['10.50.1.10'] });
    espera(resolverNombre(e, 'db.interna.local') === null, 'una zona privada responde desde internet');
    espera(resolverNombre(e, 'db.interna.local', { vpcId: vpc2.id })?.destino === '10.50.1.10', 'una zona privada no responde dentro de su VPC');
    lanza(() => eliminarVpc(e, vpc2.id), 'DependencyViolation', 'borrar la VPC de una zona privada');

    // ---- El tamaño del estado no crece solo.
    crearChequeoSalud(e, { nombre: 'caido', ip: '54.1.2.3' });
    pasa(60000);
    const antes = JSON.stringify(e);
    for (let k = 0; k < 600; k++) pasa(1000);
    const despues = JSON.stringify(e);
    espera(despues.length <= antes.length + 200, `el estado crece solo con el tiempo: ${antes.length} → ${despues.length}`);
  } catch (x) {
    fallas.push(`tronó: ${x.stack ?? x}`);
  } finally {
    reloj.ahora = reloj0;
  }
  return fallas;
}
