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
// También genera el «System log» de una instancia (Actions → Monitor and
// troubleshoot → Get system log), donde se ve si el user data funcionó.
//
// Puro (sin window ni document): el servidor lo importa para calificar.
// ---------------------------------------------------------------------------

import { ami as amiDe, dnsPrivado, ipAEntero, ipEnCidr, naclDeSubred, subredDe, tablaDeSubred, vpcDe } from './modelo.js';

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
  for (const id of grupoIds) {
    const g = estado.gruposSeguridad.find((x) => x.id === id);
    const regla = g?.entrada.find((r) => cubrePuerto(r, protocolo, puerto) && !r.origen.startsWith('sg-') && ipEnCidr(ip, r.origen));
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
  return texto
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

/**
 * Intenta abrir `direccion` desde la casa del alumno (estado.cuenta.ipCasa).
 * Devuelve { resultado: 'ok' | 'dns' | 'timeout' | 'rechazada' | 'invalida' | 'ssl',
 *            url, titulo, html, error: { codigo, titulo, detalle }, instancia, diagnostico: [{ paso, ok, detalle }] }
 */
export function probarPagina(estado, direccion, { ipCliente = estado.cuenta?.ipCasa ?? '187.190.20.30' } = {}) {
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

  // 1. DNS: una IP se usa tal cual; el nombre público de EC2 se traduce a su IP.
  let ip = ipAEntero(d.host) !== null ? d.host : null;
  const dns = /^ec2-(\d+)-(\d+)-(\d+)-(\d+)\.compute-1\.amazonaws\.com$/.exec(d.host);
  if (dns) ip = dns.slice(1, 5).join('.');
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

  const archivo = d.ruta === '/' ? 'index.html' : d.ruta.replace(/^\//, '');
  const pagina = SERVIDORES[servidor].raices.map((r) => ud.paginas[`${r}/${archivo}`]).find((p) => p !== undefined);
  const prueba = PAGINAS_DE_PRUEBA[SERVIDORES[servidor].prueba];
  if (pagina === undefined && d.ruta !== '/') {
    paso('Página', false, `No existe ${archivo} en el servidor.`);
    return {
      resultado: 'ok',
      url: d.url,
      codigoHttp: 404,
      titulo: '404 Not Found',
      html: '<h1>Not Found</h1><p>The requested URL was not found on this server.</p>',
      diagnostico,
      ...base
    };
  }
  paso('Página', true, pagina !== undefined ? `Responde la página que escribió el user data.` : 'Responde la página de prueba del servidor.');
  return {
    resultado: 'ok',
    url: d.url,
    codigoHttp: 200,
    titulo: pagina !== undefined ? (/<title>([^<]*)<\/title>/i.exec(pagina)?.[1] ?? d.host) : prueba.titulo,
    html: pagina ?? prueba.html,
    diagnostico,
    ...base
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
