// ---------------------------------------------------------------------------
// ¿ABRE LA PÁGINA?
//
// El navegador simulado de la consola pregunta aquí si una dirección carga.
// Se recorre el mismo camino que haría un paquete de verdad desde la casa del
// alumno hasta la instancia y de regreso:
//
//   DNS → ¿hay una instancia con esa IP pública? → ¿está running? →
//   ¿su VPC tiene Internet Gateway? → ¿la tabla de rutas de su subred manda
//   0.0.0.0/0 a ese gateway? → ¿la NACL deja entrar y salir? → ¿el grupo de
//   seguridad deja entrar el puerto? → ¿hay un servidor web escuchando?
//
// Si algo falla, la página no carga, igual que en AWS: un error de tiempo de
// espera (algo en la red tira el paquete) o una conexión rechazada (el paquete
// llegó, pero nadie escucha ese puerto). Cada paso queda en `diagnostico` para
// la rúbrica y para el panel del docente; el alumno solo ve el error del
// navegador y tiene que averiguar qué le faltó.
//
// Con un balanceador (ALB) el camino es otro (SIMULADOR.md §4.1):
//
//   DNS del ALB → ¿active e internet-facing? → ¿su subred sale por el Internet
//   Gateway? → ¿NACL y grupo de seguridad del ALB dejan entrar? → ¿hay
//   listener en ese puerto? → regla por ruta → grupo de destino → un destino
//   healthy por turnos → ¿el grupo de seguridad de la instancia deja entrar
//   desde el grupo del ALB? → la página de la instancia (o 502/503/504).
//
// El mismo camino ALB → instancia decide la salud de los destinos
// (revisarDestino), que modelo/elb.js usa en cada avanzar. Los dominios de
// CloudFront se piden a su origen (llamar('distribucionPorDominio')), y los
// sitios web de S3 responden según su bucket. Un nombre propio
// (www.tudominio.com) lo traduce Route 53 (llamar('resolverNombre')).
//
// También genera el «System log» de una instancia (Actions → Monitor and
// troubleshoot → Get system log), donde se ve si el user data funcionó.
//
// Puro (sin window ni document): el servidor lo importa para calificar.
// ---------------------------------------------------------------------------

import {
  ami as amiDe,
  bucketDe,
  dnsPrivado,
  enteroAIp,
  instanciaDe,
  ipAEntero,
  ipEnCidr,
  naclDeSubred,
  parsearCidr,
  politicaEsPublica,
  subredDe,
  tablaDeSubred,
  vpcDe
} from './modelo.js';
import { llamar } from './modelo/registro.js';

/* ======================================================= reglas y caminos */

const cubrePuerto = (regla, protocolo, puerto) =>
  regla.protocolo === '-1' || (regla.protocolo === protocolo && regla.desde <= puerto && puerto <= regla.hasta);

/** La NACL evalúa sus reglas en orden de número; la primera que coincide decide. Sin coincidencia: negado. */
export function naclPermite(nacl, sentido, protocolo, puerto, ip) {
  if (!nacl) return { permite: true, regla: null };
  const reglas = [...nacl[sentido]].sort((a, b) => a.numero - b.numero);
  for (const r of reglas) {
    if (cubrePuerto(r, protocolo, puerto) && ipEnCidr(ip, r.cidr)) return { permite: r.accion === 'allow', regla: r };
  }
  return { permite: false, regla: '*' };
}

/** ¿Algún grupo de la instancia deja entrar ese puerto desde esa IP? (los grupos solo permiten; no niegan) */
export function gruposPermiten(estado, grupoIds, protocolo, puerto, ip) {
  return gruposPermitenDesde(estado, grupoIds, protocolo, puerto, { ip });
}

/**
 * Igual que gruposPermiten, pero el origen puede ser también uno o varios
 * grupos de seguridad (`grupos`): una regla «HTTP desde sg-0alb…» deja entrar
 * lo que viene de cualquier recurso que tenga ese grupo (por ejemplo el ALB).
 */
export function gruposPermitenDesde(estado, grupoIds, protocolo, puerto, { ip = null, grupos = [] } = {}) {
  for (const id of grupoIds ?? []) {
    const g = estado.gruposSeguridad.find((x) => x.id === id);
    const regla = g?.entrada.find(
      (r) => cubrePuerto(r, protocolo, puerto) && (r.origen.startsWith('sg-') ? grupos.includes(r.origen) : ip !== null && ipEnCidr(ip, r.origen))
    );
    if (regla) return { permite: true, grupo: g, regla };
  }
  return { permite: false, grupo: null, regla: null };
}

/** ¿Algún grupo deja SALIR ese puerto hacia esa IP o hacia esos grupos? (reglas de salida) */
export function gruposDejanSalir(estado, grupoIds, protocolo, puerto, { ip = null, grupos = [] } = {}) {
  for (const id of grupoIds ?? []) {
    const g = estado.gruposSeguridad.find((x) => x.id === id);
    const regla = g?.salida.find(
      (r) => cubrePuerto(r, protocolo, puerto) && (r.origen.startsWith('sg-') ? grupos.includes(r.origen) : ip !== null && ipEnCidr(ip, r.origen))
    );
    if (regla) return { permite: true, grupo: g, regla };
  }
  return { permite: false, grupo: null, regla: null };
}

/** La ruta más específica de una tabla para llegar a una IP. */
export function rutaHacia(tabla, ip) {
  if (!tabla) return null;
  let mejor = null;
  for (const r of tabla.rutas) {
    if (!ipEnCidr(ip, r.destino)) continue;
    const prefijo = Number(r.destino.split('/')[1]);
    if (!mejor || prefijo > mejor.prefijo) mejor = { ...r, prefijo };
  }
  return mejor;
}

/**
 * ¿Es pública esta subred? Lo es si su tabla de rutas manda 0.0.0.0/0 a un
 * Internet Gateway conectado a su VPC. El nombre de la subred no importa.
 */
export function esSubredPublica(estado, subredId) {
  const subred = subredDe(estado, subredId);
  const tabla = tablaDeSubred(estado, subredId);
  if (!subred || !tabla) return false;
  return tabla.rutas.some(
    (r) => r.destino === '0.0.0.0/0' && r.objetivo.startsWith('igw-') && estado.igws.some((g) => g.id === r.objetivo && g.vpcId === subred.vpcId)
  );
}

/** ¿La subred sale a internet por un NAT (privada con salida)? */
export function salePorNat(estado, subredId) {
  const tabla = tablaDeSubred(estado, subredId);
  return Boolean(
    tabla?.rutas.some((r) => r.destino === '0.0.0.0/0' && r.objetivo.startsWith('nat-') && estado.nats.some((n) => n.id === r.objetivo && n.estado === 'available'))
  );
}

/* ================================================================ user data */

const SERVIDORES = {
  httpd: { puerto: 80, raices: ['/var/www/html'], prueba: 'apache-al' },
  apache2: { puerto: 80, raices: ['/var/www/html'], prueba: 'apache-ubuntu' },
  nginx: { puerto: 80, raices: ['/usr/share/nginx/html', '/var/www/html'], prueba: 'nginx' }
};

/** Quita comentarios y une las líneas cortadas con «\». */
function lineasDe(texto) {
  return String(texto ?? '')
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map((l) => l.trim());
}

/** Parte una línea en comandos por «&&», «||» y «;», sin cortar lo que va entre comillas. */
function partirComandos(linea) {
  const partes = [];
  let actual = '';
  let comilla = null;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comilla) {
      if (c === '\\' && comilla === '"' && i + 1 < linea.length) {
        actual += c + linea[++i];
        continue;
      }
      if (c === comilla) comilla = null;
      actual += c;
      continue;
    }
    if (c === '"' || c === "'") comilla = c;
    const doble = linea.slice(i, i + 2);
    if (c === ';' || doble === '&&' || doble === '||') {
      partes.push(actual.trim());
      actual = '';
      if (c !== ';') i++;
      continue;
    }
    actual += c;
  }
  partes.push(actual.trim());
  return partes.filter(Boolean);
}

function sustituir(texto, inst) {
  const dns = dnsPrivado(inst.ipPrivada);
  const meta = {
    'instance-id': inst.id,
    'local-ipv4': inst.ipPrivada,
    'public-ipv4': inst.ipPublica ?? '',
    'placement/availability-zone': inst.az,
    'instance-type': inst.tipo,
    hostname: dns,
    'local-hostname': dns,
    'ami-id': inst.ami
  };
  // ec2-metadata (Amazon Linux) imprime «llave: valor»: -i → «instance-id: i-…», -z → «placement: us-east-1a».
  const ec2meta = {
    i: ['instance-id', inst.id],
    'instance-id': ['instance-id', inst.id],
    z: ['placement', inst.az],
    'availability-zone': ['placement', inst.az],
    t: ['instance-type', inst.tipo],
    'instance-type': ['instance-type', inst.tipo],
    o: ['local-ipv4', inst.ipPrivada],
    'local-ipv4': ['local-ipv4', inst.ipPrivada],
    v: ['public-ipv4', inst.ipPublica ?? ''],
    'public-ipv4': ['public-ipv4', inst.ipPublica ?? ''],
    h: ['local-hostname', dns],
    'local-hostname': ['local-hostname', dns],
    a: ['ami-id', inst.ami],
    'ami-id': ['ami-id', inst.ami]
  };
  const metadato = (opcion, recorte) => {
    const par = ec2meta[opcion];
    if (!par) return '';
    // «| cut -d ' ' -f 2» o «| awk '{print $2}'» dejan solo el valor.
    return recorte ? par[1] : `${par[0]}: ${par[1]}`;
  };
  const corte = String.raw`(\s*\|\s*(?:cut\s+-d\s*'\s'\s+-f\s*2|awk\s+'\{\s*print\s+\$2\s*\}'))?`;
  return texto
    .replace(new RegExp(String.raw`\$\(\s*ec2-metadata\s+--?([\w-]+)${corte}\s*\)`, 'g'), (_, op, recorte) => metadato(op, recorte))
    .replace(new RegExp(String.raw`\x60\s*ec2-metadata\s+--?([\w-]+)${corte}\s*\x60`, 'g'), (_, op, recorte) => metadato(op, recorte))
    .replace(/\$\((?:hostname -f|hostname)\)/g, dns)
    .replace(/`(?:hostname -f|hostname)`/g, dns)
    .replace(/\$\((?:[^()]*\s)?curl\s+(?:-\w+\s+)*(?:-H\s+"[^"]*"\s+)*http:\/\/169\.254\.169\.254\/latest\/meta-data\/([\w/-]+)\)/g, (_, ruta) => meta[ruta] ?? '')
    .replace(/\$\(date[^)]*\)/g, new Date().toUTCString());
}

/**
 * Lo que «hace» el script de user data cuando arranca la instancia: qué
 * paquetes instala, qué servicio queda corriendo y qué página escribe. Devuelve
 * también las líneas que salen en el System log.
 */
export function analizarUserData(inst) {
  const imagen = amiDe(inst.ami);
  const texto = inst.userDataArranque ?? inst.userData ?? '';
  const resultado = { corrio: false, instalados: [], corriendo: [], paginas: {}, log: [], problemas: [] };

  if (!texto.trim()) return resultado;
  if (imagen?.so === 'windows') {
    resultado.problemas.push('Windows no ejecuta scripts de bash; usa <powershell>.');
    resultado.log.push('EC2Launch: User data is not in a recognized format; skipping.');
    return resultado;
  }
  if (!/^#!\s*\/bin\/(ba)?sh/.test(texto.trimStart())) {
    resultado.problemas.push('El script no empieza con #!/bin/bash: cloud-init no lo ejecuta.');
    resultado.log.push('cloud-init[1543]: Unhandled non-multipart (text/x-not-multipart) userdata: \'b\'' + texto.trim().slice(0, 30) + '...\'');
    return resultado;
  }

  resultado.corrio = true;
  const gestor = imagen?.gestor;
  for (const original of lineasDe(texto)) {
    if (!original || original.startsWith('#')) continue;
    for (const linea of partirComandos(original)) {
      const l = linea.replace(/^sudo\s+/, '');

      // Instalar paquetes
      const inst1 = /^(yum|dnf|apt|apt-get)\s+(.*)$/.exec(l);
      if (inst1) {
        const [, comando, resto] = inst1;
        const esDeRed = comando.startsWith('apt') ? 'apt' : 'yum';
        const disponible = gestor === 'apt' ? esDeRed === 'apt' : esDeRed === 'yum';
        if (!disponible) {
          resultado.problemas.push(`${comando} no existe en ${imagen?.nombre ?? 'esta AMI'}.`);
          resultado.log.push(`/var/lib/cloud/instance/scripts/part-001: line 2: ${comando}: command not found`);
          continue;
        }
        if (/\b(update|upgrade)\b/.test(resto) && !/\binstall\b/.test(resto)) {
          resultado.log.push(comando.startsWith('apt') ? 'Reading package lists... Done' : 'Dependencies resolved. Nothing to do. Complete!');
          continue;
        }
        if (!/\binstall\b/.test(resto)) continue;
        const paquetes = resto.replace(/(^|\s)-\S+/g, ' ').replace(/\binstall\b/, ' ').trim().split(/\s+/).filter(Boolean);
        if (!/(^|\s)(-y|--yes|-qy|-yq|--assume-yes)(\s|$)/.test(resto)) {
          resultado.problemas.push(`«${comando} install» sin -y se queda esperando un «sí» que nadie escribe.`);
          resultado.log.push(comando.startsWith('apt') ? 'Do you want to continue? [Y/n] Abort.' : 'Is this ok [y/N]: Operation aborted.');
          continue;
        }
        for (const p of paquetes) {
          const nombre = p === 'apache2' && gestor !== 'apt' ? null : p === 'httpd' && gestor === 'apt' ? null : p;
          if (!nombre) {
            resultado.problemas.push(`El paquete ${p} no existe con ${comando}.`);
            resultado.log.push(comando.startsWith('apt') ? `E: Unable to locate package ${p}` : `Error: Unable to find a match: ${p}`);
            continue;
          }
          resultado.instalados.push(nombre);
          resultado.log.push(comando.startsWith('apt') ? `Setting up ${nombre} ...` : `Installed: ${nombre}-2.4.62-1.amzn2023.x86_64  Complete!`);
          // En Ubuntu y Debian, apt deja el servicio web corriendo solo.
          if (gestor === 'apt' && SERVIDORES[nombre]) resultado.corriendo.push(nombre);
        }
        continue;
      }

      // Arrancar servicios
      const servicio = /^systemctl\s+(?:--now\s+)?(start|enable|restart)\s+(?:--now\s+)?([\w.-]+)/.exec(l) ?? /^service\s+([\w.-]+)\s+(start|restart)/.exec(l);
      if (servicio) {
        const [accion, nombre] = l.startsWith('service') ? [servicio[2], servicio[1]] : [servicio[1], servicio[2]];
        const limpio = nombre.replace(/\.service$/, '');
        const arranca = accion !== 'enable' || /--now/.test(l);
        if (!resultado.instalados.includes(limpio)) {
          resultado.problemas.push(`Se intentó arrancar ${limpio} sin haberlo instalado.`);
          resultado.log.push(`Failed to start ${limpio}.service: Unit ${limpio}.service not found.`);
        } else if (arranca && !resultado.corriendo.includes(limpio)) {
          resultado.corriendo.push(limpio);
          resultado.log.push(`Started ${limpio}.service - The ${limpio === 'nginx' ? 'nginx HTTP and reverse proxy server' : 'Apache HTTP Server'}.`);
        } else if (!arranca) {
          resultado.log.push(`Created symlink /etc/systemd/system/multi-user.target.wants/${limpio}.service.`);
        }
        continue;
      }

      // Escribir la página
      const escribe =
        /^echo\s+(-e\s+)?(["'])([\s\S]*)\2\s*(>>?)\s*(\S+)$/.exec(l) ?? /^echo\s+(-e\s+)?()([^>]*?)\s*(>>?)\s*(\S+)$/.exec(l);
      if (escribe) {
        const [, , , contenido, flecha, archivo] = escribe;
        const anterior = flecha === '>>' ? resultado.paginas[archivo] ?? '' : '';
        resultado.paginas[archivo] = anterior + sustituir(contenido, inst) + '\n';
        continue;
      }
    }
  }

  // cat > archivo <<EOF … EOF
  const heredoc = /cat\s*>\s*(\S+)\s*<<\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\2/g;
  for (const m of texto.matchAll(heredoc)) resultado.paginas[m[1]] = sustituir(m[3], inst) + '\n';

  resultado.log.push(`Cloud-init v. 22.2.2 finished at ${new Date().toUTCString()}. Datasource DataSourceEc2.  Up 18.41 seconds`);
  return resultado;
}

const PAGINAS_DE_PRUEBA = {
  'apache-al': { titulo: 'Test Page for the HTTP Server on Amazon Linux', html: '<html><body><h1>It works!</h1></body></html>' },
  'apache-ubuntu': { titulo: 'Apache2 Ubuntu Default Page: It works', html: '<html><body><h1>Apache2 Default Page</h1><p>It works!</p></body></html>' },
  nginx: { titulo: 'Welcome to nginx!', html: '<html><body><h1>Welcome to nginx!</h1><p>If you see this page, the nginx web server is successfully installed and working.</p></body></html>' }
};

/**
 * Lo que contesta el servidor web de una instancia en `puerto` y `ruta`, sin
 * mirar la red: { escucha, servidor, codigoHttp, titulo, html, propia, detalle }.
 * `propia`: la página la escribió el user data (si no, es la de prueba del servidor).
 */
export function respuestaInstancia(inst, { puerto = 80, ruta = '/' } = {}) {
  const ud = analizarUserData(inst);
  const servidor = ud.corriendo.find((s) => SERVIDORES[s]) ?? null;
  if (!servidor || SERVIDORES[servidor].puerto !== puerto) {
    return {
      escucha: false,
      servidor,
      detalle: servidor
        ? `${servidor} escucha el puerto ${SERVIDORES[servidor].puerto}, no el ${puerto}.`
        : `No hay un servidor web corriendo. ${ud.problemas.join(' ') || 'El user data no instaló ni arrancó ninguno.'}`
    };
  }
  const limpia = ruta.split('?')[0];
  const archivo = limpia === '/' ? 'index.html' : limpia.replace(/^\//, '').replace(/\/$/, '/index.html');
  const pagina = SERVIDORES[servidor].raices.map((r) => ud.paginas[`${r}/${archivo}`]).find((p) => p !== undefined);
  if (pagina === undefined && limpia !== '/') {
    return {
      escucha: true,
      servidor,
      codigoHttp: 404,
      titulo: '404 Not Found',
      html: '<h1>Not Found</h1><p>The requested URL was not found on this server.</p>',
      propia: false,
      detalle: `No existe ${archivo} en el servidor.`
    };
  }
  const prueba = PAGINAS_DE_PRUEBA[SERVIDORES[servidor].prueba];
  return {
    escucha: true,
    servidor,
    codigoHttp: 200,
    titulo: pagina !== undefined ? /<title>([^<]*)<\/title>/i.exec(pagina)?.[1] ?? null : prueba.titulo,
    html: pagina ?? prueba.html,
    propia: pagina !== undefined,
    detalle: pagina !== undefined ? 'Responde la página que escribió el user data.' : 'Responde la página de prueba del servidor.'
  };
}

/* ================================================== del balanceador al destino */

/** ¿El código HTTP entra en los «Success codes» de un health check? («200», «200,202», «200-299») */
export function codigoAceptado(codigos, codigo) {
  return String(codigos ?? '200')
    .split(',')
    .some((parte) => {
      const [a, b] = parte.split('-').map(Number);
      return codigo >= a && codigo <= (b || a);
    });
}

/** ¿Una ruta coincide con un «path pattern» del ALB? (distingue mayúsculas; admite * y ?) */
export function rutaCoincide(patron, ruta) {
  const re = new RegExp(`^${String(patron).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  return re.test(String(ruta ?? '/').split('?')[0]);
}

/** La regla de un listener que atiende una ruta: la de menor prioridad que coincide o la Default. → { tgArn, regla } */
export function reglaParaRuta(oyente, ruta) {
  const r = (oyente.reglas ?? []).find((x) => x.rutas.some((p) => rutaCoincide(p, ruta)));
  if (r) return { tgArn: r.tgArn, regla: r };
  return { tgArn: oyente.accion?.tipo === 'forward' ? oyente.accion.tgArn : null, regla: null };
}

/** La IP con la que sale un nodo del balanceador desde su subred (para las NACL y las reglas por CIDR). */
function ipNodo(estado, subredId) {
  const c = parsearCidr(subredDe(estado, subredId)?.cidr);
  return c ? enteroAIp(c.inicio + 10) : null;
}

/** El nodo del balanceador que atiende a una instancia: el de su misma zona o, si no hay, el primero. */
const nodoPara = (estado, lb, inst) => lb.subredes.find((s) => subredDe(estado, s)?.az === inst.az) ?? lb.subredes[0];

/**
 * ¿Llega un paquete del balanceador a la instancia y regresa? Es tráfico dentro
 * de la VPC (basta la ruta local): revisa la salida del grupo del balanceador,
 * las NACL de las dos subredes y la entrada del grupo de la instancia, cuyo
 * origen puede ser el grupo del balanceador (sg-…) o un CIDR. → { ok, detalle }
 */
export function caminoBalanceadorInstancia(estado, lb, inst, puerto) {
  if (lb.vpcId !== inst.vpcId) return { ok: false, detalle: `La instancia ${inst.id} está en otra VPC que el balanceador.` };
  const subNodo = nodoPara(estado, lb, inst);
  const ip = ipNodo(estado, subNodo);
  if (lb.gruposSeguridad?.length) {
    const sale = gruposDejanSalir(estado, lb.gruposSeguridad, 'tcp', puerto, { ip: inst.ipPrivada, grupos: inst.gruposSeguridad });
    if (!sale.permite) return { ok: false, detalle: `Las reglas de salida del grupo del balanceador no dejan salir el puerto ${puerto} hacia ${inst.ipPrivada}.` };
  }
  // Las NACL solo revisan lo que cruza de una subred a otra.
  if (subNodo !== inst.subredId) {
    const naclNodo = naclDeSubred(estado, subNodo);
    if (!naclPermite(naclNodo, 'salida', 'tcp', puerto, inst.ipPrivada).permite || !naclPermite(naclNodo, 'entrada', 'tcp', 50000, inst.ipPrivada).permite) {
      return { ok: false, detalle: `La NACL ${naclNodo?.id} de la subred del balanceador no deja pasar el puerto ${puerto} hacia ${inst.ipPrivada} o su respuesta.` };
    }
    const naclInst = naclDeSubred(estado, inst.subredId);
    if (!naclPermite(naclInst, 'entrada', 'tcp', puerto, ip).permite || !naclPermite(naclInst, 'salida', 'tcp', 50000, ip).permite) {
      return { ok: false, detalle: `La NACL ${naclInst?.id} de la subred de ${inst.id} no deja entrar el puerto ${puerto} desde ${ip} o no deja salir la respuesta.` };
    }
  }
  const sg = gruposPermitenDesde(estado, inst.gruposSeguridad, 'tcp', puerto, { ip, grupos: lb.gruposSeguridad ?? [] });
  if (!sg.permite) {
    return { ok: false, detalle: `Ningún grupo de seguridad de ${inst.id} deja entrar el puerto ${puerto} desde el grupo del balanceador (${(lb.gruposSeguridad ?? []).join(', ') || 'sin grupo'}) ni desde ${ip}.` };
  }
  return { ok: true, detalle: `${sg.grupo.nombre} (${sg.grupo.id}) deja entrar el puerto ${puerto} desde ${sg.regla.origen}.` };
}

/**
 * Un health check del balanceador a una instancia ya running.
 * → { ok, codigo, descripcion, detalle } con los códigos de motivo de AWS
 *   (Target.Timeout, Target.FailedHealthChecks, Target.ResponseCodeMismatch).
 */
export function revisarDestino(estado, lb, tg, inst, puertoDestino = tg.puerto) {
  const ch = tg.chequeo;
  const puerto = ch.puerto === 'traffic-port' ? puertoDestino : ch.puerto;
  const camino = caminoBalanceadorInstancia(estado, lb, inst, puerto);
  if (!camino.ok) return { ok: false, codigo: 'Target.Timeout', descripcion: 'Request timed out', detalle: camino.detalle };
  const r = respuestaInstancia(inst, { puerto, ruta: ch.ruta ?? '/' });
  if (!r.escucha) return { ok: false, codigo: 'Target.FailedHealthChecks', descripcion: 'Health checks failed', detalle: r.detalle };
  if (ch.protocolo === 'HTTPS') return { ok: false, codigo: 'Target.FailedHealthChecks', descripcion: 'Health checks failed', detalle: `${r.servidor} no habla HTTPS en el puerto ${puerto}.` };
  if (ch.protocolo === 'TCP') return { ok: true, codigo: null, descripcion: null, detalle: `${r.servidor} acepta conexiones en el puerto ${puerto}.` };
  if (!codigoAceptado(ch.codigos, r.codigoHttp)) {
    return { ok: false, codigo: 'Target.ResponseCodeMismatch', descripcion: `Health checks failed with these codes: [${r.codigoHttp}]`, detalle: r.detalle };
  }
  return { ok: true, codigo: null, descripcion: null, detalle: `${ch.ruta} responde ${r.codigoHttp}.` };
}

/* =========================================================== el navegador */

/** 'http://1.2.3.4:8080/x' → { protocolo, host, puerto, ruta }. null si no se entiende. */
export function parsearDireccion(texto) {
  let t = String(texto ?? '').trim();
  if (!t) return null;
  if (!/^[a-z]+:\/\//i.test(t)) t = `http://${t}`;
  const m = /^(https?):\/\/([^/:?#]+)(?::(\d+))?([^?#]*)/i.exec(t);
  if (!m) return null;
  const protocolo = m[1].toLowerCase();
  return { protocolo, host: m[2].toLowerCase(), puerto: m[3] ? Number(m[3]) : protocolo === 'https' ? 443 : 80, ruta: m[4] || '/', url: `${protocolo}://${m[2].toLowerCase()}${m[3] ? `:${m[3]}` : ''}${m[4] || '/'}` };
}

const ERRORES = {
  dns: { codigo: 'DNS_PROBE_FINISHED_NXDOMAIN', titulo: 'This site can’t be reached', detalle: (h) => `Check if there is a typo in ${h}.` },
  timeout: { codigo: 'ERR_CONNECTION_TIMED_OUT', titulo: 'This site can’t be reached', detalle: (h) => `${h} took too long to respond.` },
  rechazada: { codigo: 'ERR_CONNECTION_REFUSED', titulo: 'This site can’t be reached', detalle: (h) => `${h} refused to connect.` },
  invalida: { codigo: 'ERR_INVALID_URL', titulo: 'This site can’t be reached', detalle: () => 'The webpage address is not valid.' },
  ssl: { codigo: 'ERR_SSL_PROTOCOL_ERROR', titulo: 'This site can’t provide a secure connection', detalle: (h) => `${h} sent an invalid response.` }
};

const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** La página de error que devuelve el propio ALB (502, 503, 504). */
const paginaAlb = (codigo, texto) => ({
  codigoHttp: codigo,
  titulo: `${codigo} ${texto}`,
  html: `<html>\n<head><title>${codigo} ${texto}</title></head>\n<body>\n<center><h1>${codigo} ${texto}</h1></center>\n</body>\n</html>`
});

// Para repartir «por turnos» sin guardar nada en el estado: cada petición al ALB
// avanza este contador (el navegador abre una petición por cada carga).
let turnoGlobal = 0;

// Una IP de los servidores de CloudFront que piden al origen (rango 130.176.0.0/16).
const IP_CLOUDFRONT = '130.176.10.20';

/**
 * Intenta abrir `direccion` desde la casa del alumno (estado.cuenta.ipCasa).
 * Devuelve { resultado: 'ok' | 'dns' | 'timeout' | 'rechazada' | 'invalida' | 'ssl',
 *            url, titulo, html, codigoHttp, error: { codigo, titulo, detalle }, instancia, balanceador?,
 *            diagnostico: [{ paso, ok, detalle }] }
 * Opciones: ipCliente (por omisión la casa del alumno) y turno (qué destino sano elige el ALB).
 */
export function probarPagina(estado, direccion, { ipCliente = estado.cuenta?.ipCasa ?? '187.190.20.30', turno, viaCloudFront = null } = {}) {
  const diagnostico = [];
  const paso = (nombre, ok, detalle) => (diagnostico.push({ paso: nombre, ok, detalle }), ok);
  const falla = (resultado, url, host, extra = {}) => ({
    resultado,
    url,
    error: { ...ERRORES[resultado], detalle: ERRORES[resultado].detalle(host) },
    diagnostico,
    ...extra
  });

  const d = parsearDireccion(direccion);
  if (!d) return falla('invalida', String(direccion ?? ''), '');

  // Los nombres de AWS que no son de una instancia: balanceadores, CloudFront y S3.
  if (/\.elb\.amazonaws\.com$|\.elb\.us-east-1\.amazonaws\.com$/.test(d.host)) {
    const lb = llamar('balanceadorPorDns', estado, d.host) ?? null;
    if (!paso('DNS', Boolean(lb), lb ? `${d.host} es el balanceador ${lb.nombre}.` : `Ningún balanceador tiene el DNS ${d.host}.`)) return falla('dns', d.url, d.host);
    return probarBalanceador(estado, lb, d, ipCliente, { paso, falla, diagnostico, turno });
  }
  if (/\.cloudfront\.net$/.test(d.host)) return probarCloudFront(estado, d, { paso, falla, diagnostico, turno });
  if (/\.s3(?:-website[.-]us-east-1|\.us-east-1)?\.amazonaws\.com$/.test(d.host)) return probarS3(estado, d, { paso, falla, diagnostico, viaCloudFront });

  // 1. DNS: una IP se usa tal cual; el nombre público de EC2 se traduce a su IP.
  let ip = ipAEntero(d.host) !== null ? d.host : null;
  const dns = /^ec2-(\d+)-(\d+)-(\d+)-(\d+)\.compute-1\.amazonaws\.com$/.exec(d.host);
  if (dns) ip = dns.slice(1, 5).join('.');
  // Un nombre propio (www.tudominio.com) lo traduce Route 53 si una zona pública responde por él.
  if (!ip && !saltosDns.has(d.host)) {
    const r = llamar('resolverNombre', estado, d.host) ?? null;
    if (r?.destino) {
      paso('DNS (Route 53)', true, `${d.host} → ${r.destino} (registro ${r.tipo}${r.alias ? ' Alias' : ''} de la zona ${r.nombreZona ?? ''}).`);
      if (ipAEntero(r.destino) !== null) ip = r.destino;
      else return siguePorRoute53(estado, d, r.destino, { ipCliente, turno, viaCloudFront, diagnostico, paso });
    }
  }
  if (!ip) {
    paso('DNS', false, `Nadie registró el nombre ${d.host}.`);
    return falla('dns', d.url, d.host);
  }
  if (dns) paso('DNS', true, `${d.host} es ${ip}.`);

  // 2. ¿Quién tiene esa IP pública?
  const inst = estado.instancias.find((i) => i.ipPublica === ip && i.estado !== 'terminated');
  if (!paso('IP pública', Boolean(inst), inst ? `${ip} es la IP pública de ${inst.id}.` : `Ninguna instancia tiene la IP pública ${ip}.`)) {
    return falla('timeout', d.url, d.host);
  }
  const base = { instancia: inst.id };

  // 3. ¿Está prendida?
  if (!paso('Estado', inst.estado === 'running', `La instancia está ${inst.estado}.`)) return falla('timeout', d.url, d.host, base);

  // 4. ¿Su VPC tiene puerta a internet?
  const vpc = vpcDe(estado, inst.vpcId);
  const igw = estado.igws.find((g) => g.vpcId === inst.vpcId);
  if (!paso('Internet Gateway', Boolean(igw), igw ? `${vpc.id} tiene conectado ${igw.id}.` : `${vpc?.id ?? 'La VPC'} no tiene un Internet Gateway conectado.`)) {
    return falla('timeout', d.url, d.host, base);
  }

  // 5. ¿El letrero de la calle manda el tráfico de regreso por esa puerta?
  const tabla = tablaDeSubred(estado, inst.subredId);
  const ruta = rutaHacia(tabla, ipCliente);
  const rutaOk = Boolean(ruta && ruta.objetivo === igw.id);
  if (
    !paso(
      'Tabla de rutas',
      rutaOk,
      rutaOk
        ? `La tabla ${tabla.id} manda ${ruta.destino} a ${igw.id}.`
        : ruta
          ? `La tabla ${tabla?.id} manda ${ruta.destino} a ${ruta.objetivo}, no al Internet Gateway.`
          : `La tabla ${tabla?.id ?? '(ninguna)'} de la subred ${inst.subredId} no tiene ruta hacia internet (0.0.0.0/0 → igw).`
    )
  ) {
    return falla('timeout', d.url, d.host, base);
  }

  // 6. La caseta de la calle: la NACL revisa la entrada y la salida (no recuerda conexiones).
  const nacl = naclDeSubred(estado, inst.subredId);
  const entra = naclPermite(nacl, 'entrada', 'tcp', d.puerto, ipCliente);
  if (!paso('NACL (entrada)', entra.permite, entra.permite ? `La regla ${entra.regla?.numero ?? ''} de ${nacl?.id} deja entrar el puerto ${d.puerto}.` : `La NACL ${nacl?.id} no deja entrar el puerto ${d.puerto} (regla ${entra.regla === '*' ? '*' : entra.regla?.numero}).`)) {
    return falla('timeout', d.url, d.host, base);
  }
  const sale = naclPermite(nacl, 'salida', 'tcp', 50000, ipCliente);
  if (!paso('NACL (salida)', sale.permite, sale.permite ? `La NACL deja salir la respuesta (puertos efímeros).` : `La NACL ${nacl?.id} no deja salir la respuesta por los puertos efímeros 1024-65535.`)) {
    return falla('timeout', d.url, d.host, base);
  }

  // 7. El guardia de la casa: el grupo de seguridad (sí recuerda: la respuesta sale sola).
  const sg = gruposPermiten(estado, inst.gruposSeguridad, 'tcp', d.puerto, ipCliente);
  if (!paso('Grupo de seguridad', sg.permite, sg.permite ? `${sg.grupo.nombre} (${sg.grupo.id}) deja entrar el puerto ${d.puerto} desde ${sg.regla.origen}.` : `Ningún grupo de seguridad de la instancia deja entrar el puerto ${d.puerto} desde ${ipCliente}.`)) {
    return falla('timeout', d.url, d.host, base);
  }

  // 8. ¿Hay alguien escuchando?
  const ud = analizarUserData(inst);
  const servidor = ud.corriendo.find((s) => SERVIDORES[s]);
  if (d.protocolo === 'https' || d.puerto === 443) {
    paso('Servidor web', false, servidor ? `${servidor} escucha el 80 (HTTP), no el 443 (HTTPS).` : 'No hay un servidor web escuchando el puerto 443.');
    return falla('rechazada', d.url, d.host, base);
  }
  if (!paso('Servidor web', Boolean(servidor && SERVIDORES[servidor].puerto === d.puerto), servidor ? `${servidor} está corriendo en el puerto 80.` : `No hay un servidor web corriendo. ${ud.problemas.join(' ') || 'El user data no instaló ni arrancó ninguno.'}`)) {
    return falla('rechazada', d.url, d.host, base);
  }

  const r = respuestaInstancia(inst, { puerto: d.puerto, ruta: d.ruta });
  paso('Página', r.codigoHttp === 200, r.detalle);
  return { resultado: 'ok', url: d.url, codigoHttp: r.codigoHttp, titulo: r.titulo ?? d.host, html: r.html, diagnostico, ...base };
}

// Los nombres que se están traduciendo ahora (evita vueltas infinitas entre registros).
const saltosDns = new Set();

/** ¿CloudFront atiende `host`? Debe estar en sus «Alternate domain names» (acepta *.tudominio.com). */
const aliasCubre = (alias, host) => alias.some((a) => a === host || (a.startsWith('*.') && host.endsWith(a.slice(1)) && !host.slice(0, -a.length + 1).includes('.')));

/**
 * Route 53 tradujo `d.host` a otro nombre (d123.cloudfront.net, el DNS de un ALB, el
 * endpoint de sitio web de S3…): se pide ese nombre con la misma ruta y el error se
 * muestra con el nombre que escribió el alumno.
 */
function siguePorRoute53(estado, d, destino, { ipCliente, turno, viaCloudFront, diagnostico, paso }) {
  // CloudFront contesta 403 a un nombre que no tiene como «Alternate domain name (CNAME)».
  if (/\.cloudfront\.net$/.test(destino)) {
    const dist = llamar('distribucionPorDominio', estado, destino) ?? null;
    if (dist && Array.isArray(dist.alias) && !aliasCubre(dist.alias, d.host)) {
      paso('CloudFront', false, `La distribución ${dist.id} no tiene ${d.host} en «Alternate domain names (CNAMEs)», así que lo rechaza.`);
      return { resultado: 'ok', url: d.url, ...paginaCloudFront(403, 'Bad request. We can’t connect to the server for this app or website at this time. There might be too much traffic or a configuration error.'), diagnostico, distribucion: dist.id };
    }
  }
  const normal = d.puerto === (d.protocolo === 'https' ? 443 : 80);
  saltosDns.add(d.host);
  let r;
  try {
    r = probarPagina(estado, `${d.protocolo}://${destino}${normal ? '' : `:${d.puerto}`}${d.ruta}`, { ipCliente, turno, viaCloudFront });
  } finally {
    saltosDns.delete(d.host);
  }
  const fuera = { ...r, url: d.url, diagnostico: [...diagnostico, ...r.diagnostico], dominio: d.host };
  if (r.titulo === destino || !r.titulo) fuera.titulo = d.host;
  if (r.error && ERRORES[r.resultado]) fuera.error = { ...ERRORES[r.resultado], detalle: ERRORES[r.resultado].detalle(d.host) };
  return fuera;
}

/** El camino casa → ALB → destino sano → instancia (SIMULADOR.md §4.1). */
function probarBalanceador(estado, lb, d, ipCliente, { paso, falla, diagnostico, turno }) {
  const base = { balanceador: lb.arn };
  const responde = (pagina, extra = {}) => ({ resultado: 'ok', url: d.url, ...pagina, diagnostico, ...base, ...extra });

  // 1. Mientras está en provisioning, su DNS todavía no existe.
  if (!paso('Balanceador', lb.estado === 'active', `El balanceador está ${lb.estado}.`)) return falla('dns', d.url, d.host, base);
  if (!paso('Esquema', lb.esquema === 'internet-facing', lb.esquema === 'internet-facing' ? 'Es internet-facing.' : 'Es internal: su DNS da IP privadas que no se alcanzan desde internet.')) {
    return falla('timeout', d.url, d.host, base);
  }
  if (!paso('Tipo', lb.tipo === 'application', lb.tipo === 'application' ? 'Es un Application Load Balancer.' : 'El simulador no manda tráfico por Network ni Gateway Load Balancers.')) {
    return falla('timeout', d.url, d.host, base);
  }

  // 2. Entra por una subred pública del balanceador.
  const igw = estado.igws.find((g) => g.vpcId === lb.vpcId);
  const publicas = igw ? lb.subredes.filter((s) => rutaHacia(tablaDeSubred(estado, s), ipCliente)?.objetivo === igw.id) : [];
  if (!paso('Internet Gateway', publicas.length > 0, publicas.length ? `${publicas.join(', ')} salen a internet por ${igw.id}.` : `Ninguna subred del balanceador tiene ruta 0.0.0.0/0 a un Internet Gateway.`)) {
    return falla('timeout', d.url, d.host, base);
  }
  const nacl = naclDeSubred(estado, publicas[0]);
  const entra = naclPermite(nacl, 'entrada', 'tcp', d.puerto, ipCliente);
  const sale = naclPermite(nacl, 'salida', 'tcp', 50000, ipCliente);
  if (!paso('NACL', entra.permite && sale.permite, entra.permite && sale.permite ? `La NACL ${nacl?.id} deja pasar el puerto ${d.puerto} y la respuesta.` : `La NACL ${nacl?.id} de la subred del balanceador no deja pasar el puerto ${d.puerto} o la respuesta.`)) {
    return falla('timeout', d.url, d.host, base);
  }

  // 3. El grupo de seguridad del ALB.
  const sg = gruposPermiten(estado, lb.gruposSeguridad, 'tcp', d.puerto, ipCliente);
  if (!paso('Grupo de seguridad del balanceador', sg.permite, sg.permite ? `${sg.grupo.nombre} (${sg.grupo.id}) deja entrar el puerto ${d.puerto} desde ${sg.regla.origen}.` : `Ningún grupo de seguridad del balanceador deja entrar el puerto ${d.puerto} desde ${ipCliente}.`)) {
    return falla('timeout', d.url, d.host, base);
  }

  // 4. ¿Hay listener en ese puerto? Sin él, nadie contesta.
  const oyente = lb.oyentes.find((o) => o.puerto === d.puerto && (d.protocolo === 'https') === (o.protocolo === 'HTTPS'));
  if (!paso('Listener', Boolean(oyente), oyente ? `El listener ${oyente.protocolo}:${oyente.puerto} atiende la petición.` : `El balanceador no tiene un listener ${d.protocolo.toUpperCase()}:${d.puerto}.`)) {
    return falla(d.protocolo === 'https' ? 'ssl' : 'rechazada', d.url, d.host, base);
  }
  if (oyente.accion?.tipo === 'fixed-response') {
    paso('Regla', true, 'La acción por omisión es una respuesta fija.');
    return responde({ codigoHttp: oyente.accion.codigo ?? 503, titulo: d.host, html: escapar(oyente.accion.cuerpo ?? '') });
  }

  // 5. La regla que toca y su grupo de destino.
  const { tgArn, regla } = reglaParaRuta(oyente, d.ruta);
  const tg = tgArn ? llamar('grupoDestinoDe', estado, tgArn) : null;
  paso('Regla', Boolean(tg), regla ? `La regla ${regla.prioridad} (${regla.rutas.join(', ')}) manda a ${tg?.nombre ?? tgArn}.` : `La regla Default manda a ${tg?.nombre ?? tgArn ?? '(nada)'}.`);
  if (!tg) return responde(paginaAlb(503, 'Service Temporarily Unavailable'));

  // 6. Un destino sano por turnos. Si todos están unhealthy, el ALB «falla abierto»
  //    y reparte entre todos (así lo hace AWS); sin destinos listos: 503.
  let candidatos = tg.destinos.filter((x) => x.salud === 'healthy');
  let modo = 'healthy';
  if (!candidatos.length) {
    candidatos = tg.destinos.filter((x) => x.salud === 'unhealthy');
    modo = 'fail-open';
  }
  if (!paso('Destinos', candidatos.length > 0, candidatos.length ? `${candidatos.length} destino(s) ${modo === 'healthy' ? 'healthy' : 'unhealthy (falla abierto)'} en ${tg.nombre}.` : `${tg.nombre} no tiene destinos healthy (${tg.destinos.map((x) => `${x.id}: ${x.salud}`).join(', ') || 'ninguno registrado'}).`)) {
    return responde(paginaAlb(503, 'Service Temporarily Unavailable'));
  }
  const n = turno ?? turnoGlobal++;
  const elegido = candidatos[((n % candidatos.length) + candidatos.length) % candidatos.length];
  const inst = instanciaDe(estado, elegido.id);
  if (!inst || inst.estado !== 'running') {
    paso('Instancia', false, `${elegido.id} no está running.`);
    return responde(paginaAlb(502, 'Bad Gateway'), { instancia: elegido.id });
  }

  // 7. Del ALB a la instancia: con origen en el grupo del ALB.
  const camino = caminoBalanceadorInstancia(estado, lb, inst, elegido.puerto);
  if (!paso('Grupo de seguridad de la instancia', camino.ok, camino.detalle)) return responde(paginaAlb(504, 'Gateway Time-out'), { instancia: inst.id });
  const r = respuestaInstancia(inst, { puerto: elegido.puerto, ruta: d.ruta });
  if (!paso('Servidor web', r.escucha, r.escucha ? `${r.servidor} contesta en ${inst.id}.` : r.detalle)) return responde(paginaAlb(502, 'Bad Gateway'), { instancia: inst.id });
  paso('Página', r.codigoHttp === 200, r.detalle);
  return responde({ codigoHttp: r.codigoHttp, titulo: r.titulo ?? d.host, html: r.html }, { instancia: inst.id });
}

/* ============================================================ CloudFront y S3 */

/** La página de error de CloudFront («ERROR: The request could not be satisfied»). */
function paginaCloudFront(codigo, motivo) {
  return {
    codigoHttp: codigo,
    titulo: 'ERROR: The request could not be satisfied',
    html: `<html><head><title>ERROR: The request could not be satisfied</title></head><body><h1>${codigo} ERROR</h1><h2>The request could not be satisfied.</h2><hr noshade size="1px">${escapar(motivo)}<br clear="all"><hr noshade size="1px"><pre>Generated by cloudfront (CloudFront)\nRequest ID: ${'x'.repeat(8)}</pre></body></html>`
  };
}

/** Un dominio d1234abcd.cloudfront.net: CloudFront pide el objeto a su origen (S3 o un ALB). */
function probarCloudFront(estado, d, { paso, falla, diagnostico, turno }) {
  const dist = llamar('distribucionPorDominio', estado, d.host, d.ruta) ?? null;
  if (!paso('DNS', Boolean(dist), dist ? `${d.host} es una distribución de CloudFront.` : `Ninguna distribución tiene el dominio ${d.host}.`)) return falla('dns', d.url, d.host);
  const base = { distribucion: dist.id ?? dist.arn ?? d.host };
  const responde = (pagina) => ({ resultado: 'ok', url: d.url, ...pagina, diagnostico, ...base });
  if (dist.habilitada === false || dist.estado === 'Disabled') {
    paso('Distribución', false, 'La distribución está deshabilitada.');
    return responde(paginaCloudFront(403, 'Bad request. We can’t connect to the server for this app or website at this time.'));
  }
  // El origen: acepta { origen: { dominio } }, { origenDominio } o { origenes: [{ dominio }] }.
  const origen = String(dist.origen?.dominio ?? dist.origenDominio ?? (typeof dist.origen === 'string' ? dist.origen : null) ?? dist.origenes?.[0]?.dominio ?? '').toLowerCase();
  const raiz = dist.objetoRaiz ?? dist.raiz ?? '';
  const ruta = d.ruta === '/' && raiz ? `/${raiz.replace(/^\//, '')}` : d.ruta;
  if (!paso('Origen', Boolean(origen), origen ? `El origen es ${origen}.` : 'La distribución no tiene origen.')) return responde(paginaCloudFront(502, 'CloudFront wasn’t able to connect to the origin.'));
  const protocolo = dist.origen?.protocolo === 'https' ? 'https' : 'http';
  const r = probarPagina(estado, `${protocolo}://${origen}${ruta}`, { ipCliente: IP_CLOUDFRONT, turno, viaCloudFront: dist });
  diagnostico.push(...r.diagnostico.map((x) => ({ ...x, paso: `Origen · ${x.paso}` })));
  if (r.resultado !== 'ok') return responde(paginaCloudFront(r.resultado === 'dns' ? 502 : 504, r.resultado === 'dns' ? 'CloudFront wasn’t able to resolve the origin domain name.' : 'CloudFront attempted to establish a connection with the origin, but either the attempt failed or the origin closed the connection.'));
  return responde({ codigoHttp: r.codigoHttp, titulo: r.titulo === origen ? d.host : r.titulo, html: r.html, instancia: r.instancia });
}

/** Errores de S3 como los muestra el navegador: HTML en el endpoint de sitio web, XML en el REST. */
function errorS3(web, codigoHttp, codigo, mensaje, extra = '') {
  if (web) {
    const titulo = `${codigoHttp} ${codigoHttp === 404 ? 'Not Found' : 'Forbidden'}`;
    return { codigoHttp, titulo, html: `<html><head><title>${titulo}</title></head><body><h1>${titulo}</h1><ul><li>Code: ${codigo}</li><li>Message: ${escapar(mensaje)}</li>${extra}<li>RequestId: 8RTF0AHVQ2X1JX6B</li></ul><hr/></body></html>` };
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>${codigo}</Code><Message>${escapar(mensaje)}</Message><RequestId>8RTF0AHVQ2X1JX6B</RequestId></Error>`;
  return { codigoHttp, titulo: codigo, html: `<pre style="white-space:pre-wrap">${escapar(xml)}</pre>` };
}

/** ¿La política del bucket deja leer a CloudFront (OAC)? */
const politicaDejaCloudFront = (texto) => /cloudfront\.amazonaws\.com/.test(String(texto ?? '')) && /s3:GetObject/.test(String(texto ?? ''));

/** El endpoint de sitio web de S3 (bucket.s3-website-us-east-1…) o el REST (bucket.s3.amazonaws.com). */
function probarS3(estado, d, { paso, falla, diagnostico, viaCloudFront }) {
  const m = /^(.+?)\.s3(-website[.-]us-east-1|\.us-east-1)?\.amazonaws\.com$/.exec(d.host);
  const web = Boolean(m?.[2]?.startsWith('-website'));
  const nombre = m?.[1] ?? '';
  const b = bucketDe(estado, nombre);
  const responde = (pagina) => ({ resultado: 'ok', url: d.url, ...pagina, diagnostico, bucket: nombre });
  if (!paso('Bucket', Boolean(b), b ? `El bucket ${nombre} existe.` : `No existe el bucket ${nombre}.`)) {
    if (web) return falla('dns', d.url, d.host);
    return responde(errorS3(false, 404, 'NoSuchBucket', 'The specified bucket does not exist'));
  }
  if (web && d.puerto !== 80) return falla('timeout', d.url, d.host);
  if (web && !paso('Sitio web', Boolean(b.sitioWeb), b.sitioWeb ? 'El alojamiento de sitio web está habilitado.' : 'El bucket no tiene habilitado el alojamiento de sitio web.')) {
    return responde(errorS3(true, 404, 'NoSuchWebsiteConfiguration', 'The specified bucket does not have a website configuration', `<li>BucketName: ${escapar(nombre)}</li>`));
  }
  const publico = !b.bloqueoPublico?.politicasCualquiera && politicaEsPublica(b.politica);
  const oac = Boolean(viaCloudFront) && politicaDejaCloudFront(b.politica);
  if (!paso('Permisos', publico || oac, publico ? 'La política del bucket deja leer a todo el mundo.' : oac ? 'La política del bucket deja leer a CloudFront (OAC).' : 'El bucket no es público ni deja leer a CloudFront: Access Denied.')) {
    return responde(errorS3(web, 403, 'AccessDenied', 'Access Denied'));
  }
  let llave = decodeURIComponent(d.ruta.split('?')[0]).replace(/^\//, '');
  if (web && (!llave || llave.endsWith('/'))) llave += b.sitioWeb?.indice || 'index.html';
  const objeto = b.objetos.find((o) => o.llave === llave && o.actual && !o.marcadorBorrado);
  if (!paso('Objeto', Boolean(objeto), objeto ? `Existe ${llave}.` : `No existe ${llave} en el bucket.`)) {
    const docError = web && b.sitioWeb?.error ? b.objetos.find((o) => o.llave === b.sitioWeb.error && o.actual && !o.marcadorBorrado) : null;
    if (docError) return responde({ codigoHttp: 404, ...paginaDeObjeto(nombre, docError) });
    return responde(errorS3(web, web ? 404 : 403, web ? 'NoSuchKey' : 'AccessDenied', web ? 'The specified key does not exist.' : 'Access Denied', `<li>Key: ${escapar(llave)}</li>`));
  }
  return responde({ codigoHttp: 200, ...paginaDeObjeto(nombre, objeto) });
}

/** Los objetos de S3 del simulador no guardan su contenido: se muestra una página que lo representa. */
function paginaDeObjeto(bucket, o) {
  if (typeof o.contenido === 'string') return { titulo: /<title>([^<]*)<\/title>/i.exec(o.contenido)?.[1] ?? o.llave, html: o.contenido };
  const esImagen = /\.(png|jpe?g|gif|webp|svg)$/i.test(o.llave) || String(o.tipo).startsWith('image/');
  return {
    titulo: o.llave,
    html: esImagen
      ? `<html><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0e0e0e;color:#ccc;font-family:sans-serif"><div style="text-align:center"><div style="font-size:64px">🖼️</div><p>${escapar(o.llave)}</p><small>${o.tamano} bytes · s3://${escapar(bucket)}</small></div></body></html>`
      : `<html><head><title>${escapar(o.llave)}</title></head><body style="font-family:sans-serif;padding:24px"><h1>${escapar(bucket)}</h1><p>Este es tu archivo <b>${escapar(o.llave)}</b> (${o.tamano} bytes), servido desde Amazon S3.</p></body></html>`
  };
}

/* ============================================================ System log */

/** Las líneas de «Get system log». Vacío mientras la instancia no ha arrancado nunca. */
export function registroSistema(inst) {
  if (!inst.arranques) return [];
  const imagen = amiDe(inst.ami);
  if (imagen?.so === 'windows') {
    return ['2026/10/20 15:02:11Z: Windows sysprep configuration complete.', '2026/10/20 15:02:12Z: Message: Windows is Ready to use', ...analizarUserData(inst).log];
  }
  const ud = analizarUserData(inst);
  return [
    `[    0.000000] Linux version 6.1.112-122.189.amzn2023.x86_64 (mockbuild@ip-10-0-36-155) (gcc (GCC) 11.4.1)`,
    `[    0.000000] Command line: BOOT_IMAGE=(hd0,gpt1)/boot/vmlinuz root=UUID=ae3c0a2a console=tty0 console=ttyS0,115200n8`,
    `[    1.104772] systemd[1]: Detected virtualization xen.`,
    `[    2.551930] systemd[1]: Hostname set to <${dnsPrivado(inst.ipPrivada)}>.`,
    `[  OK  ] Reached target network-online.target - Network is Online.`,
    `cloud-init[1543]: Cloud-init v. 22.2.2 running 'modules:config' at ${new Date(inst.lanzada).toUTCString()}.`,
    `ci-info: +++++++++++++++++++++++++++Net device info++++++++++++++++++++++++++++`,
    `ci-info: | ens5 | True | ${inst.ipPrivada} | ${inst.subredId} |`,
    ...(ud.corrio || ud.log.length ? ud.log.map((l) => `cloud-init[1543]: ${l}`) : ['cloud-init[1543]: No user data provided.']),
    `${imagen?.familia ?? 'Linux'} ${dnsPrivado(inst.ipPrivada)} login:`
  ];
}
