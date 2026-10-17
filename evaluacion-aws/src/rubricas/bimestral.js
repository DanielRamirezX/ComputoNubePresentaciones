// Rúbrica del examen bimestral (parte práctica) · Ferretería Don Beto.

import {
  adjuntarIgw,
  adjuntarVolumen,
  ami,
  asociarNacl,
  asociarSubredes,
  avanzar,
  claseS3,
  crearBucket,
  crearGrupoIam,
  crearIgw,
  crearReglaCiclo,
  crearSnapshot,
  crearSubred,
  crearTablaRutas,
  crearUsuario,
  crearVolumen,
  editarReglasNacl,
  editarRutas,
  igwDeVpc,
  lanzarInstancias,
  reloj,
  subredDe,
  textoProtocolo,
  textoPuertos
} from '../../public/consola/modelo.js';
import { esSubredPublica } from '../../public/consola/red.js';
import { LAB, datosLab } from '../../public/labs/bimestral.js';
import {
  amplias,
  armar,
  check,
  checkBloqueo,
  checkHttp,
  checkIpPublica,
  checkSsh,
  checkVersionado,
  contiene,
  deEscritura,
  describirCiclo,
  elegirBucket,
  elegirVpc,
  estaEn,
  esPrivadaSinSalida,
  explicarPagina,
  explicarRuta,
  faltaGrupo,
  faltaUsuario,
  fmtInst,
  fmtSubred,
  grupoIam,
  lista,
  mejorPor,
  naclDeSubred,
  naclPermite,
  preparar,
  probar,
  reglasTodoElBucket,
  retroIgw,
  retroNombreBucket,
  sinInstancia,
  sinInstanciaCorta,
  sinVpc,
  usuario,
  vivas
} from './comun.js';

const MICROS = ['t2.micro', 't3.micro'];
const IP_ATACANTE = '203.0.113.77';

/* ================================================================== red */

function elegirSubredes(estado, vpc, x) {
  const enVpc = estado.subredes.filter((s) => s.vpcId === vpc.id);
  const pesoPub = (s) => (esSubredPublica(estado, s.id) ? 4 : 0) + (s.cidr === x.publicaCidr ? 2 : 0) + (vivas(estado).some((i) => i.subredId === s.id) ? 1 : 0);
  const pesoPriv = (s) => (esPrivadaSinSalida(estado, s.id) ? 4 : 0) + (s.cidr === x.privadaCidr ? 2 : 0);
  const publica = enVpc.filter((s) => s.az === x.azPublica).sort((a, b) => pesoPub(b) - pesoPub(a))[0] ?? null;
  const privada = enVpc.filter((s) => s.az === x.azPrivada).sort((a, b) => pesoPriv(b) - pesoPriv(a))[0] ?? null;
  return { enVpc, publica, privada };
}

function revisarRed(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  if (!vpc) {
    const r = `${sinVpc(estado, x.vpcCidr)} La VPC ${x.vpcNombre} venía hecha: todo lo de red va dentro de ella.`;
    return [
      check('igw', `Un Internet Gateway conectado a ${x.vpcNombre}`, 5, false, r),
      check('publica', `Una subred pública en ${x.azPublica}`, 8, false, r),
      check('publica-cidr', `La subred pública usa ${x.publicaCidr}`, 2, false, r),
      check('privada', `Una subred privada (sin 0.0.0.0/0) en ${x.azPrivada}`, 5, false, r),
      check('privada-cidr', `La subred privada usa ${x.privadaCidr}`, 2, false, r)
    ];
  }
  const { enVpc, publica, privada } = elegirSubredes(estado, vpc, x);
  const igw = igwDeVpc(estado, vpc.id);
  const checks = [check('igw', `Un Internet Gateway conectado a ${x.vpcNombre}`, 5, igw, retroIgw(estado, vpc))];

  const esPub = publica && esSubredPublica(estado, publica.id);
  let retroPub;
  if (esPub) retroPub = `Tu subred ${fmtSubred(publica)} manda 0.0.0.0/0 a ${igw.id}: eso, y no su nombre, es lo que la hace pública.`;
  else if (publica) retroPub = explicarRuta(estado, publica);
  else if (enVpc.length) retroPub = `Ninguna de tus subredes (${enVpc.map(fmtSubred).join('; ')}) está en ${x.azPublica}. La zona no se cambia: crea la subred pública en ${x.azPublica}.`;
  else retroPub = `Tu VPC ${vpc.id} no tiene subredes todavía. Crea la pública ${x.publicaCidr} en ${x.azPublica}.`;
  checks.push(check('publica', `Una subred pública en ${x.azPublica} (0.0.0.0/0 → Internet Gateway)`, 8, esPub, retroPub));

  const pubExacta = enVpc.find((s) => s.cidr === x.publicaCidr);
  const okPubCidr = pubExacta && pubExacta.az === x.azPublica;
  checks.push(
    check(
      'publica-cidr',
      `La subred pública usa ${x.publicaCidr}`,
      2,
      okPubCidr,
      okPubCidr
        ? `${x.publicaCidr} cabe dentro de ${x.vpcCidr} y deja 251 direcciones útiles.`
        : pubExacta
          ? `Tu subred ${fmtSubred(pubExacta)} tiene el bloque correcto, pero está en ${pubExacta.az} y no en ${x.azPublica}.`
          : `Ninguna subred de tu VPC usa ${x.publicaCidr}${publica ? ` (la de ${x.azPublica} usa ${publica.cidr})` : ''}.`
    )
  );

  const okPriv = privada && esPrivadaSinSalida(estado, privada.id);
  let retroPriv;
  if (okPriv) retroPriv = `Tu subred ${fmtSubred(privada)} no tiene ninguna ruta 0.0.0.0/0: lo que pongas ahí (una base de datos, por ejemplo) no se puede alcanzar desde internet.`;
  else if (privada) {
    retroPriv = `Tu subred ${fmtSubred(privada)} sí tiene ruta 0.0.0.0/0 en su tabla, así que no es privada. Si pusiste la ruta a internet en la tabla principal, todas las subredes sin tabla propia la heredan: ponla en una tabla aparte asociada solo a la pública.`;
  } else retroPriv = enVpc.length ? `No tienes ninguna subred en ${x.azPrivada}. Crea la privada ${x.privadaCidr} ahí.` : `Crea la subred privada ${x.privadaCidr} en ${x.azPrivada}.`;
  checks.push(check('privada', `Una subred privada (sin 0.0.0.0/0) en ${x.azPrivada}`, 5, okPriv, retroPriv));

  const privExacta = enVpc.find((s) => s.cidr === x.privadaCidr);
  const okPrivCidr = privExacta && privExacta.az === x.azPrivada;
  checks.push(
    check(
      'privada-cidr',
      `La subred privada usa ${x.privadaCidr}`,
      2,
      okPrivCidr,
      okPrivCidr
        ? 'Dos subredes en zonas distintas: si una zona falla, la otra sigue. Así se piensa la alta disponibilidad.'
        : privExacta
          ? `Tu subred ${fmtSubred(privExacta)} tiene el bloque correcto, pero está en ${privExacta.az} y no en ${x.azPrivada}.`
          : `Ninguna subred de tu VPC usa ${x.privadaCidr}${privada ? ` (la de ${x.azPrivada} usa ${privada.cidr})` : ''}.`
    )
  );
  return checks;
}

/* ============================================================= servidor */

function checksInstancia(estado, inst, x, vpc) {
  const imagen = inst && ami(inst.ami);
  const tipoOk = inst && imagen?.clave === 'al2023' && MICROS.includes(inst.tipo);
  const r = probar(estado, inst);
  const abre = r.resultado === 'ok' && r.codigoHttp === 200;
  const conTexto = abre && contiene(r.html, x.textoPagina) && contiene(r.html, x.textoMostrador);
  const encendida = inst && (inst.estado === 'running' || inst.estado === 'pending');
  return [
    check(
      'instancia',
      `Una instancia encendida dentro de ${x.vpcNombre}`,
      5,
      encendida,
      encendida
        ? `Tu instancia ${fmtInst(inst)} está en tu VPC, en la subred ${inst.subredId}.`
        : inst
          ? `Tu instancia ${fmtInst(inst)} está ${inst.estado}. Enciéndela (Instance state → Start).`
          : sinInstancia(estado, vpc, x.vpcCidr)
    ),
    check(
      'tipo',
      'Amazon Linux 2023 en t2.micro o t3.micro',
      3,
      tipoOk,
      tipoOk
        ? `${inst.tipo} con Amazon Linux 2023: capa gratuita, suficiente para un catálogo.`
        : inst
          ? `Tu instancia usa ${imagen?.nombre ?? inst.ami} en ${inst.tipo}; se pidió Amazon Linux 2023 en t2.micro o t3.micro.`
          : 'Todavía no hay una instancia en tu VPC.'
    ),
    checkIpPublica(estado, inst, { puntos: 3 }),
    checkHttp(estado, inst, x.ipCasa, 'http', 4),
    checkSsh(estado, inst, x.ipCasa, { puntos: 5 }),
    check(
      'pagina',
      'La página del catálogo abre desde internet',
      6,
      abre,
      abre ? `http://${inst.ipPublica} abre desde tu casa: gateway, ruta, NACL, grupo de seguridad y Apache están en orden.` : explicarPagina(estado, inst, r)
    ),
    check(
      'texto',
      `La página dice «${x.textoPagina}» y «${x.textoMostrador}»`,
      4,
      conTexto,
      conTexto
        ? 'Es la página que escribió tu user data en el primer arranque.'
        : abre
          ? `La página abre, pero no dice «${x.textoPagina}» y «${x.textoMostrador}». Usa el script de la tarea tal cual; el user data solo corre en el primer arranque.`
          : 'Primero tiene que abrir la página; después se revisa su texto.'
    )
  ];
}

function instanciaWeb(estado, x, vpc) {
  const candidatas = vpc ? vivas(estado).filter((i) => i.vpcId === vpc.id) : [];
  return mejorPor(candidatas, (i) => checksInstancia(estado, i, x, vpc));
}

function revisarServidor(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  const mejor = instanciaWeb(estado, x, vpc);
  if (mejor) return mejor.checks;
  const corta = sinInstanciaCorta(estado, vpc, x.vpcCidr);
  return checksInstancia(estado, null, x, vpc).map((c) => (c.id === 'instancia' ? c : { ...c, retro: corta }));
}

/* ================================================================= NACL */

function revisarNacl(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  const inst = instanciaWeb(estado, x, vpc)?.candidata ?? null;
  const subred = (inst && subredDe(estado, inst.subredId)) ?? (vpc ? elegirSubredes(estado, vpc, x).publica : null);
  const t1 = `La subred pública usa una NACL que bloquea ${x.redAtacante}`;
  const t2 = 'Esa NACL deja pasar HTTP (80) de los demás y sus respuestas';
  if (!subred) {
    const r = vpc ? `Todavía no hay subred pública en ${x.azPublica} para revisarle la NACL.` : sinVpc(estado, x.vpcCidr);
    return [check('nacl-bloqueo', t1, 4, false, r), check('nacl-http', t2, 4, false, r)];
  }
  const nacl = naclDeSubred(estado, subred.id);
  const propia = nacl && !nacl.porDefecto;
  const deTecnico = estado.nacls.find((n) => n.nombre === x.nacl && n.vpcId === subred.vpcId);
  const bloquea = propia && !naclPermite(nacl, 'entrada', 'tcp', 80, IP_ATACANTE).permite;
  const usaDefecto = `Tu subred ${fmtSubred(subred)} usa la NACL por omisión (${nacl?.id}), que deja pasar todo. Se pidió que use ${x.nacl}${deTecnico ? ` (${deTecnico.id})` : ''}: VPC → Network ACLs → ${x.nacl} → Subnet associations → Edit subnet associations.`;

  let r1;
  if (bloquea) r1 = `La NACL ${nacl.id} de tu subred pública sigue negando a ${x.redAtacante}. Una NACL sí puede negar (un grupo de seguridad no): por eso se usa para bloquear a una red completa.`;
  else if (!propia) r1 = usaDefecto;
  else r1 = `La NACL ${nacl.id} de tu subred ya no niega a ${x.redAtacante}: una IP de esa red entra por la regla ${naclPermite(nacl, 'entrada', 'tcp', 80, IP_ATACANTE).regla?.numero}. Agrega (o deja) una regla deny para ${x.redAtacante} con un número menor que el de cualquier allow que la cubra.`;

  const entraCasa = propia && naclPermite(nacl, 'entrada', 'tcp', 80, x.ipCasa);
  const entraOtro = propia && naclPermite(nacl, 'entrada', 'tcp', 80, '8.8.8.8');
  const saleCasa = propia && naclPermite(nacl, 'salida', 'tcp', 50000, x.ipCasa);
  const okHttp = propia && entraCasa.permite && entraOtro.permite && saleCasa.permite;
  let r2;
  if (okHttp) r2 = 'La NACL deja entrar el 80 y salir las respuestas por los puertos efímeros. Las reglas se leen de menor a mayor número y gana la primera que coincide.';
  else if (!propia) r2 = usaDefecto;
  else if (!entraCasa.permite || !entraOtro.permite) {
    const regla = !entraCasa.permite ? entraCasa.regla : entraOtro.regla;
    r2 = `La NACL ${nacl.id} niega el puerto 80 por la regla ${regla === '*' ? '* (ninguna regla lo permite)' : `${regla.numero} (${regla.accion === 'deny' ? 'Deny' : 'Allow'} ${textoProtocolo(regla.protocolo)} ${textoPuertos(regla)} desde ${regla.cidr})`}. Como gana la primera regla que coincide, esa regla tapa a las demás: bórrala o cámbiala a allow (sin tocar el bloqueo a ${x.redAtacante}).`;
  } else r2 = `La NACL ${nacl.id} deja entrar el 80 pero no deja salir las respuestas: la NACL no recuerda conexiones, así que necesita una regla de salida que permita los puertos efímeros (1024-65535).`;
  return [check('nacl-bloqueo', t1, 4, bloquea, r1), check('nacl-http', t2, 4, okHttp, r2)];
}

/* =============================================================== discos */

function revisarDiscos(estado, x) {
  const vpc = elegirVpc(estado, x.vpcCidr);
  const inst = instanciaWeb(estado, x, vpc)?.candidata ?? null;
  const datos = estado.volumenes.filter((v) => !v.raiz);
  const justo = (v) => v.tipo === x.volumenTipo && v.tamano === x.volumenTamano;
  const correctos = datos.filter(justo);
  const pedido = `${x.volumenTipo} de ${x.volumenTamano} GiB`;

  const okVol = correctos.length > 0;
  const retroVol = okVol
    ? `Tu volumen ${correctos[0].id} es ${pedido}. gp3 es el SSD de uso general: buen precio y 3000 IOPS de base.`
    : datos.length
      ? `Tus volúmenes extra son: ${datos.map((v) => `${v.id} (${v.tipo}, ${v.tamano} GiB, ${v.az})`).join('; ')}. Se pidió uno ${pedido}.`
      : `No hay ningún volumen además del disco raíz. Créalo en EC2 → Volumes → Create volume: ${pedido}, en la zona de tu instancia.`;

  const adjuntos = inst ? datos.filter((v) => v.instanciaId === inst.id && v.estado === 'in-use') : [];
  const okAdj = adjuntos.length > 0;
  let retroAdj;
  if (okAdj) retroAdj = `${adjuntos[0].id} está conectado a ${fmtInst(inst)} como ${adjuntos[0].dispositivo}. Un EBS es como un disco duro externo: se conecta a una instancia de su misma zona.`;
  else if (!inst) retroAdj = 'Todavía no hay una instancia en tu VPC a la cual conectarle el disco.';
  else {
    const otraZona = datos.find((v) => v.az !== inst.az && v.estado === 'available');
    const suelto = datos.find((v) => v.estado === 'available');
    if (otraZona) retroAdj = `Tu volumen ${otraZona.id} está en ${otraZona.az} y tu instancia en ${inst.az}: un EBS solo se conecta a instancias de su misma zona. Crea otro en ${inst.az} (o un snapshot y, de él, un volumen en ${inst.az}).`;
    else if (suelto) retroAdj = `Tu volumen ${suelto.id} está «available»: existe, pero no está conectado. Actions → Attach volume y elige ${fmtInst(inst)}.`;
    else retroAdj = `La instancia ${fmtInst(inst)} solo tiene su disco raíz. Conecta el volumen de ${x.volumenTamano} GiB con Actions → Attach volume.`;
  }

  const idsDatos = new Set((correctos.length ? correctos : adjuntos).map((v) => v.id));
  const buenos = estado.snapshots.filter((s) => idsDatos.has(s.volumenId));
  const okSnap = buenos.length > 0;
  let retroSnap;
  if (okSnap) retroSnap = `El snapshot ${buenos[0].id} respalda ${buenos[0].volumenId}. Los snapshots se guardan en S3 y son incrementales: el siguiente solo copia lo que cambió.`;
  else if (estado.snapshots.length) {
    const s = estado.snapshots[0];
    const v = estado.volumenes.find((y) => y.id === s.volumenId);
    retroSnap = `Tu snapshot ${s.id} es del volumen ${s.volumenId}${v?.raiz ? ' (el disco raíz)' : ''}, no del disco de inventario ${pedido}. Selecciona ese volumen y haz Actions → Create snapshot.`;
  } else retroSnap = `No hay snapshots. Selecciona tu volumen ${pedido} en EC2 → Volumes → Actions → Create snapshot.`;

  return [
    check('volumen', `Un volumen EBS ${pedido} además del raíz`, 5, okVol, retroVol),
    check('adjunto', `Un volumen extra conectado a ${x.instancia}`, 5, okAdj, retroAdj),
    check('snapshot', `Un snapshot del volumen de ${x.volumenTamano} GiB`, 5, okSnap, retroSnap)
  ];
}

/* =================================================================== S3 */

function revisarS3(estado, x) {
  const el = elegirBucket(estado, x.bucket, 'donbeto');
  const b = el.bucket;
  const reglas = reglasTodoElBucket(b);
  const ok = reglas.some((r) => r.transiciones.some((t) => t.dias === x.diasArchivo && t.clase === 'DEEP_ARCHIVE'));
  let retro;
  if (ok) retro = `A los ${x.diasArchivo} días las facturas pasan a Glacier Deep Archive, la clase más barata de S3: tarda hasta 12 horas en devolverlas, y para algo que casi nunca se pide está bien.`;
  else if (!b) retro = 'Sin el bucket no hay regla que revisar.';
  else {
    const todas = (b.ciclo ?? []).flatMap((r) => r.transiciones.map((t) => ({ r, t })));
    const otraClase = todas.find(({ t }) => t.dias === x.diasArchivo && t.clase !== 'DEEP_ARCHIVE');
    const conPrefijo = (b.ciclo ?? []).find((r) => r.prefijo && r.transiciones.some((t) => t.clase === 'DEEP_ARCHIVE'));
    const apagada = (b.ciclo ?? []).find((r) => r.estado !== 'Enabled' && r.transiciones.some((t) => t.clase === 'DEEP_ARCHIVE'));
    let falta = `Falta una regla activa, para todo el bucket, que pase los objetos a Glacier Deep Archive a los ${x.diasArchivo} días.`;
    if (otraClase) falta = `A los ${x.diasArchivo} días los mandas a ${claseS3(otraClase.t.clase)?.nombre}; se pidió Glacier Deep Archive.`;
    else if (conPrefijo) falta = `Tu regla «${conPrefijo.r?.nombre ?? conPrefijo.nombre}» solo aplica al prefijo ${conPrefijo.prefijo}; se pidió para todos los objetos («Apply to all objects in the bucket»).`;
    else if (apagada) falta = `Tu regla «${apagada.nombre}» está Disabled: actívala.`;
    retro = `${falta} Tu bucket ${b.nombre} ${describirCiclo(b)}. Se hace en Management → Create lifecycle rule.`;
  }
  return [
    check('bucket', `Existe el bucket «${x.bucket}»`, 3, el.exacto, retroNombreBucket(estado, x.bucket, el)),
    checkBloqueo(el, { puntos: 3 }),
    checkVersionado(el, { puntos: 3 }),
    check('ciclo', `Regla activa para todo el bucket: Glacier Deep Archive a los ${x.diasArchivo} días`, 6, ok, retro)
  ];
}

/* ================================================================== IAM */

function revisarIam(estado, x) {
  const g = grupoIam(estado, x.grupo);
  const pols = g?.politicas ?? [];
  const okG = g && pols.includes(x.politica) && !deEscritura(pols).length && !amplias(pols).length;
  let retroG;
  if (okG) retroG = `El grupo ${x.grupo} solo puede ver EC2: los cajeros revisan si el servidor está encendido, pero no pueden apagarlo por accidente.`;
  else if (!g) retroG = faltaGrupo(estado, x.grupo);
  else if (deEscritura(pols).length) retroG = `El grupo ${x.grupo} tiene ${lista(deEscritura(pols))}, que deja cambiar cosas. Déjale solo ${x.politica}.`;
  else if (amplias(pols).length) retroG = `El grupo ${x.grupo} tiene ${lista(amplias(pols))}, que deja leer TODA la cuenta. Mínimo privilegio: usa ${x.politica}.`;
  else retroG = `El grupo ${x.grupo} tiene: ${lista(pols)}. Le falta ${x.politica}.`;

  const checks = [check('grupo', `El grupo «${x.grupo}» con ${x.politica} y nada más amplio`, 4, okG, retroG)];
  x.usuarios.forEach((nombre, i) => {
    const u = usuario(estado, nombre);
    const ok = estaEn(u, x.grupo);
    checks.push(
      check(
        `usuario-${i + 1}`,
        `El usuario «${nombre}» está en el grupo «${x.grupo}»`,
        2,
        ok,
        ok ? `${nombre} hereda los permisos de ${x.grupo}.` : !u ? faltaUsuario(estado, nombre) : `${nombre} existe, pero está en: ${lista(u.grupos, 'ningún grupo')}. Agrégalo a ${x.grupo}.`
      )
    );
  });
  const us = x.usuarios.map((n) => usuario(estado, n));
  const okD = us.every((u) => u && u.politicas.length === 0);
  const conDirectas = us.filter((u) => u?.politicas.length);
  checks.push(
    check(
      'directo',
      'Ningún cajero tiene políticas puestas directo',
      2,
      okD,
      okD
        ? 'Todos los permisos de los cajeros están en el grupo: un solo lugar que revisar cuando alguien entra o se va.'
        : conDirectas.length
          ? `${conDirectas.map((u) => `${u.nombre} tiene directo ${lista(u.politicas)}`).join('; ')}. Quítalas: el permiso ya les llega por el grupo.`
          : `Faltan usuarios por crear (${x.usuarios.filter((n, i) => !us[i]).join(', ')}); sus permisos deben llegarles solo por el grupo.`
    )
  );
  return checks;
}

/* ============================================================== revisar */

export function revisar(estadoOriginal, datos) {
  const estado = preparar(estadoOriginal);
  const x = datosLab(datos);
  return armar(LAB.tareas(datos), {
    red: revisarRed(estado, x),
    servidor: revisarServidor(estado, x),
    nacl: revisarNacl(estado, x),
    discos: revisarDiscos(estado, x),
    s3: revisarS3(estado, x),
    iam: revisarIam(estado, x)
  });
}

/* ============================================================= solución */

export function solucion(datos) {
  const x = datosLab(datos);
  const estado = LAB.estadoInicial(datos);
  const vpc = estado.vpcs.find((v) => v.cidr === x.vpcCidr);
  const nacl = estado.nacls.find((n) => n.nombre === x.nacl);

  // red
  const pub = crearSubred(estado, { vpcId: vpc.id, nombre: x.publicaNombre, az: x.azPublica, cidr: x.publicaCidr });
  crearSubred(estado, { vpcId: vpc.id, nombre: x.privadaNombre, az: x.azPrivada, cidr: x.privadaCidr });
  const igw = crearIgw(estado, { nombre: 'donbeto-igw' });
  adjuntarIgw(estado, igw.id, vpc.id);
  const rt = crearTablaRutas(estado, { vpcId: vpc.id, nombre: 'donbeto-rt-publica' });
  editarRutas(estado, rt.id, [{ destino: '0.0.0.0/0', objetivo: igw.id }]);
  asociarSubredes(estado, rt.id, [pub.id]);

  // nacl: se asocia y se quita la regla 90 (la que negaba el 80 a todos)
  asociarNacl(estado, nacl.id, [pub.id]);
  editarReglasNacl(
    estado,
    nacl.id,
    'entrada',
    nacl.entrada.filter((r) => r.numero !== 90)
  );

  // servidor
  const [inst] = lanzarInstancias(estado, {
    nombre: x.instancia,
    ami: 'al2023',
    tipo: 't2.micro',
    subredId: pub.id,
    ipPublica: true,
    nuevoGrupo: {
      nombre: x.sg,
      descripcion: 'Web abierta y SSH desde casa',
      entrada: [
        { protocolo: 'tcp', desde: 80, hasta: 80, origen: '0.0.0.0/0' },
        { protocolo: 'tcp', desde: 22, hasta: 22, origen: `${x.ipCasa}/32` }
      ]
    },
    userData: x.userData
  });

  // discos
  const vol = crearVolumen(estado, { nombre: x.volumenNombre, tipo: x.volumenTipo, tamano: x.volumenTamano, az: inst.az });
  avanzar(estado, reloj.ahora() + 60_000);
  adjuntarVolumen(estado, vol.id, inst.id, '/dev/sdf');
  crearSnapshot(estado, { volumenId: vol.id, descripcion: 'Respaldo del inventario' });

  // s3
  crearBucket(estado, { nombre: x.bucket, versionado: true });
  crearReglaCiclo(estado, x.bucket, { nombre: 'facturas-a-deep-archive', transiciones: [{ dias: x.diasArchivo, clase: 'DEEP_ARCHIVE' }] });

  // iam
  crearGrupoIam(estado, { nombre: x.grupo, politicas: [x.politica] });
  for (const u of x.usuarios) crearUsuario(estado, { nombre: u, consola: true, grupos: [x.grupo] });

  avanzar(estado, reloj.ahora() + 3600_000);
  return estado;
}
