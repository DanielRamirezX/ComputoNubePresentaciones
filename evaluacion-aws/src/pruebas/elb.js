// Pruebas del modelo de Elastic Load Balancing (modelo/elb.js) y del camino
// del tráfico por el balanceador (red.js): salud de los destinos con el reloj
// fijo, reparto por turnos, 502/503/504, errores de AWS y cuentas viejas.

import {
  agregarOyente,
  agregarReglaOyente,
  avanzar,
  crearBalanceador,
  crearBucket,
  crearGrupoDestino,
  crearGrupoSeguridad,
  cuentaNueva,
  editarBloqueoPublico,
  editarChequeoGrupoDestino,
  editarPolitica,
  editarReglasSg,
  editarSitioWeb,
  eliminarBalanceador,
  eliminarGrupoDestino,
  eliminarGrupoSeguridad,
  eliminarSubred,
  existeFuncion,
  lanzarInstancias,
  llamar,
  quitarDestinos,
  registrarDestinos,
  reloj,
  saludDestino,
  subirObjetos,
  detenerInstancia,
  terminarInstancia
} from '../../public/consola/modelo.js';
import { probarPagina } from '../../public/consola/red.js';

export const titulo = 'ELB (balanceadores y grupos de destino)';

const SCRIPT = `#!/bin/bash
dnf install -y httpd
echo "<h1>Hola desde el grupo de Auto Scaling</h1><p>Te atiende $(ec2-metadata -i) en $(ec2-metadata -z)</p>" > /var/www/html/index.html
systemctl enable --now httpd`;

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
  let t = Date.UTC(2026, 10, 9, 15, 0, 0);
  reloj.ahora = () => t;
  const pasa = (ms) => {
    t += ms;
    avanzar(e, t);
  };
  let e;
  try {
    // ---- Una cuenta vieja (sin estado.elb) no truena.
    const vieja = cuentaNueva({ cuentaId: '111122223333' });
    delete vieja.elb;
    avanzar(vieja, t);
    espera(Array.isArray(vieja.elb?.balanceadores), 'avanzar no crea estado.elb en una cuenta vieja');
    delete vieja.elb;
    espera(llamar('grupoDestinoDe', vieja, 'x') === null, 'grupoDestinoDe en cuenta vieja no da null');
    espera(llamar('balanceadorPorDns', vieja, 'x.us-east-1.elb.amazonaws.com') === null, 'balanceadorPorDns en cuenta vieja no da null');
    for (const f of ['registrarDestinos', 'quitarDestinos', 'saludDestino', 'grupoDestinoDe', 'balanceadorPorDns', 'crearBalanceador', 'crearGrupoDestino']) {
      espera(existeFuncion(f), `llamar no ofrece ${f}`);
    }

    // ---- La red de la sesión 6.
    e = cuentaNueva({ cuentaId: '111122223333', ipCasa: '187.190.20.30' });
    const vpc = e.vpcs[0];
    const [s1a, s1b, s1c] = e.subredes;
    const albSg = crearGrupoSeguridad(e, { nombre: 'alb-sg', descripcion: 'ALB', vpcId: vpc.id, entrada: [{ protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' }] });
    const webSg = crearGrupoSeguridad(e, { nombre: 'web-sg', descripcion: 'web', vpcId: vpc.id, entrada: [{ protocolo: 'tcp', desde: 80, hasta: 80, origen: albSg.id }] });
    const [i1] = lanzarInstancias(e, { nombre: 'web-1', subredId: s1a.id, gruposSeguridad: [webSg.id], userData: SCRIPT });
    const [i2] = lanzarInstancias(e, { nombre: 'web-2', subredId: s1b.id, gruposSeguridad: [webSg.id], userData: SCRIPT });

    // ---- Errores de AWS.
    lanza(() => crearGrupoDestino(e, { nombre: '-malo', vpcId: vpc.id }), 'ValidationError', 'nombre de TG con guion al inicio');
    lanza(() => crearGrupoDestino(e, { nombre: 'x'.repeat(33), vpcId: vpc.id }), 'ValidationError', 'nombre de TG de 33 caracteres');
    lanza(() => crearGrupoDestino(e, { nombre: 'tg', vpcId: vpc.id, chequeo: { espera: 30, intervalo: 30 } }), 'ValidationError', 'timeout igual al intervalo');
    const tg = crearGrupoDestino(e, { nombre: 'tg-web', vpcId: vpc.id, destinos: [i1.id, i2.id] });
    lanza(() => crearGrupoDestino(e, { nombre: 'TG-WEB', vpcId: vpc.id }), 'DuplicateTargetGroupName', 'TG duplicado');
    espera(tg.destinos.every((d) => d.salud === 'initial'), 'los destinos recién registrados no están en initial');
    const err = lanza(() => crearBalanceador(e, { nombre: 'alb-web', subredes: [s1a.id], gruposSeguridad: [albSg.id], oyentes: [{ protocolo: 'HTTP', puerto: 80, tgArn: tg.arn }] }), 'ValidationError', 'ALB con una sola subred');
    espera(err?.message === 'At least two subnets in two different Availability Zones must be specified', `mensaje de una sola subred: «${err?.message}»`);
    lanza(() => crearBalanceador(e, { nombre: 'internal-x', subredes: [s1a.id, s1b.id] }), 'ValidationError', 'nombre que empieza con internal-');
    lanza(() => crearBalanceador(e, { nombre: 'alb-x', subredes: [s1a.id, s1b.id], oyentes: [{ protocolo: 'HTTPS', puerto: 443, tgArn: tg.arn }] }), 'CertificateNotFound', 'listener HTTPS sin certificado');
    espera(e.elb.balanceadores.length === 0, 'un ALB fallido quedó guardado');

    const alb = crearBalanceador(e, { nombre: 'alb-web', subredes: [s1a.id, s1b.id], gruposSeguridad: [albSg.id], oyentes: [{ protocolo: 'HTTP', puerto: 80, tgArn: tg.arn }] });
    lanza(() => crearBalanceador(e, { nombre: 'alb-web', subredes: [s1a.id, s1b.id] }), 'DuplicateLoadBalancerName', 'ALB duplicado');
    espera(/^alb-web-\d{10}\.us-east-1\.elb\.amazonaws\.com$/.test(alb.dns), `DNS del ALB raro: ${alb.dns}`);
    espera(alb.estado === 'provisioning', 'el ALB no empieza en provisioning');
    espera(llamar('balanceadorPorDns', e, alb.dns.toUpperCase())?.arn === alb.arn, 'balanceadorPorDns no encuentra el ALB');
    espera(probarPagina(e, `http://${alb.dns}`).resultado === 'dns', 'un ALB en provisioning ya resuelve su DNS');

    // ---- 25 s después (un solo salto, como al calificar): activo y con destinos healthy.
    pasa(25000);
    espera(alb.estado === 'active', 'el ALB no pasó a active en 20 s');
    espera(saludDestino(e, tg.arn, i1.id) === 'healthy' && saludDestino(e, 'tg-web', i2.id) === 'healthy', `destinos no healthy: ${tg.destinos.map((d) => `${d.salud} ${d.motivo?.descripcion ?? ''}`).join(' / ')}`);
    const p1 = probarPagina(e, `http://${alb.dns}`, { turno: 0 });
    const p2 = probarPagina(e, `http://${alb.dns}/`, { turno: 1 });
    espera(p1.resultado === 'ok' && p1.codigoHttp === 200, `el ALB no responde 200: ${p1.resultado} ${p1.codigoHttp} ${JSON.stringify(p1.diagnostico.at(-1))}`);
    espera(/instance-id: i-0[0-9a-f]{16}/.test(p1.html ?? '') && /placement: us-east-1[ab]/.test(p1.html ?? ''), `ec2-metadata no se sustituyó: ${p1.html}`);
    espera(p1.instancia !== p2.instancia, 'el ALB no reparte por turnos');
    espera(probarPagina(e, `http://${alb.dns}/nada.html`).codigoHttp === 404, 'una ruta inexistente no da 404');
    // La instancia NO se abre directo desde casa (su grupo solo deja entrar al ALB).
    espera(probarPagina(e, `http://${i1.ipPublica}`).resultado === 'timeout', 'la instancia se abre directo aunque su grupo solo deja al ALB');

    // ---- Reglas por ruta: /api/* a un grupo sin destinos → 503.
    const tgApi = crearGrupoDestino(e, { nombre: 'tg-api', vpcId: vpc.id });
    agregarReglaOyente(e, alb.oyentes[0].arn, { prioridad: 10, rutas: ['/api/*'], tgArn: tgApi.arn });
    lanza(() => agregarReglaOyente(e, alb.oyentes[0].arn, { prioridad: 10, rutas: ['/x'], tgArn: tgApi.arn }), 'PriorityInUse', 'prioridad repetida');
    espera(probarPagina(e, `http://${alb.dns}/api/x`).codigoHttp === 503, 'una regla hacia un grupo vacío no da 503');
    espera(probarPagina(e, `http://${alb.dns}/`).codigoHttp === 200, 'la regla Default dejó de funcionar');
    lanza(() => eliminarGrupoDestino(e, tgApi.arn), 'ResourceInUse', 'borrar un TG usado por una regla');
    lanza(() => agregarOyente(e, alb.arn, { protocolo: 'HTTP', puerto: 80, tgArn: tg.arn }), 'DuplicateListener', 'listener repetido');

    // ---- Se rompe el grupo de la instancia: 5 s sigue healthy, 10 s unhealthy (Target.Timeout); el ALB falla abierto → 504.
    editarReglasSg(e, webSg.id, 'entrada', []);
    pasa(5000);
    espera(saludDestino(e, tg.arn, i1.id) === 'healthy', 'un solo chequeo malo ya lo marcó unhealthy');
    pasa(5000);
    const d1 = tg.destinos.find((d) => d.id === i1.id);
    espera(d1.salud === 'unhealthy' && d1.motivo?.codigo === 'Target.Timeout', `sin regla del ALB no queda unhealthy por timeout: ${d1.salud} ${d1.motivo?.codigo}`);
    espera(probarPagina(e, `http://${alb.dns}`).codigoHttp === 504, 'con todos unhealthy por red no da 504');
    // Se arregla: necesita 5 chequeos buenos (Healthy threshold) para volver.
    editarReglasSg(e, webSg.id, 'entrada', [{ protocolo: 'tcp', desde: 80, hasta: 80, origen: albSg.id }]);
    pasa(10000);
    espera(saludDestino(e, tg.arn, i1.id) === 'unhealthy', 'volvió a healthy antes del Healthy threshold');
    pasa(20000);
    espera(saludDestino(e, tg.arn, i1.id) === 'healthy', 'no volvió a healthy tras 5 chequeos buenos');

    // ---- Health check a una ruta que no existe → ResponseCodeMismatch [404].
    editarChequeoGrupoDestino(e, tg.arn, { ruta: '/salud' });
    pasa(10000);
    espera(tg.destinos.every((d) => d.salud === 'unhealthy' && d.motivo?.descripcion === 'Health checks failed with these codes: [404]'), `ruta inexistente: ${tg.destinos.map((d) => d.motivo?.descripcion).join(' / ')}`);
    editarChequeoGrupoDestino(e, tg.arn, { ruta: '/', sanos: 2 });
    pasa(10000);
    espera(tg.destinos.every((d) => d.salud === 'healthy'), 'con Healthy threshold 2 no volvió en 10 s');

    // ---- Detenida → unused; terminada → sale sola; Deregister → draining y fuera.
    detenerInstancia(e, i2.id);
    pasa(7000);
    espera(saludDestino(e, tg.arn, i2.id) === 'unused', `una instancia detenida no queda unused: ${saludDestino(e, tg.arn, i2.id)}`);
    lanza(() => registrarDestinos(e, tgApi.arn, [i2.id]), 'InvalidTarget', 'registrar una instancia detenida');
    quitarDestinos(e, tg.arn, [i1.id]);
    espera(saludDestino(e, tg.arn, i1.id) === 'draining', 'Deregister no pone draining');
    pasa(11000);
    espera(saludDestino(e, tg.arn, i1.id) === null, 'el destino draining no salió');
    const [i3] = lanzarInstancias(e, { nombre: 'web-3', subredId: s1c.id, gruposSeguridad: [webSg.id], userData: SCRIPT });
    registrarDestinos(e, tg.arn, [i3.id]);
    pasa(60000);
    const d3 = tg.destinos.find((d) => d.id === i3.id);
    espera(d3?.salud === 'unused' && d3.motivo?.descripcion === 'Target is in an Availability Zone that is not enabled for the load balancer', `instancia en zona no habilitada: ${d3?.salud} ${d3?.motivo?.descripcion}`);
    terminarInstancia(e, i3.id);
    pasa(20000);
    espera(saludDestino(e, tg.arn, i3.id) === null, 'una instancia terminada no salió del grupo');

    // ---- Dependencias: el grupo y las subredes del ALB no se borran.
    lanza(() => eliminarGrupoSeguridad(e, albSg.id), 'DependencyViolation', 'borrar el grupo del ALB');
    lanza(() => eliminarSubred(e, s1a.id), 'DependencyViolation', 'borrar una subred del ALB');
    lanza(() => eliminarGrupoDestino(e, tg.arn), 'ResourceInUse', 'borrar un TG en uso');
    eliminarBalanceador(e, alb.arn);
    eliminarGrupoDestino(e, tg.arn);
    espera(!e.elb.gruposDestino.some((g) => g.nombre === 'tg-web'), 'no se borró el TG');

    // ---- NLB: se crea con una subred, pero no lleva tráfico.
    const tgTcp = crearGrupoDestino(e, { nombre: 'tg-tcp', protocolo: 'TCP', puerto: 80, vpcId: vpc.id });
    lanza(() => crearBalanceador(e, { nombre: 'nlb-x', tipo: 'network', subredes: [s1a.id], oyentes: [{ protocolo: 'TCP', puerto: 80, tgArn: tgApi.arn }] }), 'InvalidConfigurationRequest', 'NLB con un TG HTTP');
    const nlb = crearBalanceador(e, { nombre: 'nlb-x', tipo: 'network', subredes: [s1a.id], oyentes: [{ protocolo: 'TCP', puerto: 80, tgArn: tgTcp.arn }] });
    espera(/\.elb\.us-east-1\.amazonaws\.com$/.test(nlb.dns), `DNS del NLB raro: ${nlb.dns}`);
    pasa(25000);
    espera(probarPagina(e, `http://${nlb.dns}`).resultado === 'timeout', 'el NLB lleva tráfico');

    // ---- Sitio web de S3 (lo usa CloudFront como origen).
    crearBucket(e, { nombre: 'sitio-prueba-elb-111' });
    editarSitioWeb(e, 'sitio-prueba-elb-111', { habilitado: true, indice: 'index.html' });
    const web = 'http://sitio-prueba-elb-111.s3-website-us-east-1.amazonaws.com';
    espera(probarPagina(e, web).codigoHttp === 403, 'un bucket privado no da 403');
    editarBloqueoPublico(e, 'sitio-prueba-elb-111', { aclsNuevas: false, aclsCualquiera: false, politicasNuevas: false, politicasCualquiera: false });
    editarPolitica(e, 'sitio-prueba-elb-111', JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: 'arn:aws:s3:::sitio-prueba-elb-111/*' }] }));
    espera(probarPagina(e, web).codigoHttp === 404, 'sin index.html no da 404');
    subirObjetos(e, 'sitio-prueba-elb-111', [{ llave: 'index.html', tamano: 120, tipo: 'text/html' }]);
    espera(probarPagina(e, web).codigoHttp === 200, 'el sitio web de S3 no responde 200');

    // ---- El tamaño del estado no crece solo.
    const antes = JSON.stringify(e).length;
    for (let k = 0; k < 600; k++) pasa(1000);
    espera(JSON.stringify(e).length <= antes + 200, 'el estado crece solo con el tiempo');
  } catch (x) {
    fallas.push(`tronó: ${x.stack ?? x}`);
  } finally {
    reloj.ahora = reloj0;
  }
  return fallas;
}
