// Audita los tres laboratorios y sus rúbricas.
//
//   node src/rubricas/verificar-labs.js     (imprime y sale con 1 si hay problemas)
//   import { verificarLabs } from './rubricas/verificar-labs.js'   → [problemas]
//
// Para 5 alumnos de ejemplo (uno sin matrícula) comprueba que:
//  - la solución da 100 y la cuenta inicial menos de 20;
//  - las tareas públicas y las de la rúbrica tienen los mismos ids y puntos y suman 100;
//  - todo check trae texto y retro (de acierto en la solución, de fallo en la inicial);
//  - revisar() no muta la cuenta que recibe y sobrevive a JSON;
//  - las soluciones alternativas razonables dan 100 o casi;
//  - los errores comunes bajan los puntos correctos y su retro dice algo útil.

import { pathToFileURL } from 'node:url';

import {
  adjuntarIgw,
  adjuntarVolumen,
  agregarUsuariosAGrupo,
  asociarNacl,
  asociarSubredes,
  avanzar,
  cambiarRolInstancia,
  crearBucket,
  crearGrupoIam,
  crearGrupoSeguridad,
  crearIgw,
  crearNacl,
  crearReglaCiclo,
  crearRol,
  crearSnapshot,
  crearSubred,
  crearTablaRutas,
  crearUsuario,
  crearVolumen,
  crearVpcCompleta,
  crearVpc,
  editarBloqueoPublico,
  editarReglasNacl,
  editarReglasSg,
  editarRutas,
  editarSubred,
  editarVersionado,
  lanzarInstancias,
  quitarPoliticaUsuario,
  reloj,
  terminarInstancia
} from '../../public/consola/modelo.js';
import { datosAlumno } from '../../public/labs/comun.js';
import { LABS } from '../../public/labs/index.js';
import { datosLab as datos1 } from '../../public/labs/simulacro-1.js';
import { datosLab as datos2 } from '../../public/labs/simulacro-2.js';
import { datosLab as datosB } from '../../public/labs/bimestral.js';
import { RUBRICAS } from './index.js';

export const ALUMNOS = [
  { nombre: 'Ana Sofía Pérez López', matricula: '20231234' },
  { nombre: 'Luis Ángel Ramírez Ortega', matricula: 'A01789456' },
  { nombre: 'María José Hernández Cruz', matricula: '' },
  { nombre: 'Jorge Iván Torres Núñez', matricula: '2024-0077' },
  { nombre: 'Fernanda Ruiz Ibarra', matricula: 'S20999' }
];

const porJson = (x) => JSON.parse(JSON.stringify(x));
const UNA_HORA = 3600_000;
const terminar = (e) => (avanzar(e, reloj.ahora() + UNA_HORA), e);
const todoBloqueado = { aclsNuevas: true, aclsCualquiera: true, politicasNuevas: true, politicasCualquiera: true };
const nadaBloqueado = { aclsNuevas: false, aclsCualquiera: false, politicasNuevas: false, politicasCualquiera: false };
const principal = (e, vpcId) => e.tablasRutas.find((t) => t.vpcId === vpcId && t.principal);
const tcp = (puerto, origen) => ({ protocolo: 'tcp', desde: puerto, hasta: puerto, origen });

/* ======================================================= simulacro 1 */

function construir1(d, o = {}) {
  const x = datos1(d);
  const e = LABS.get('simulacro-1').estadoInicial(d);

  if (o.mayusculas) {
    crearUsuario(e, { nombre: 'Lupita' });
    crearGrupoIam(e, { nombre: 'Baristas', politicas: [x.politica], usuarios: ['Lupita'] });
  } else if (o.iamDirecto) {
    crearGrupoIam(e, { nombre: x.grupo, politicas: [x.politica] });
    crearUsuario(e, { nombre: x.usuario, politicas: [x.politica], grupos: [x.grupo] });
  } else {
    crearUsuario(e, { nombre: x.usuario });
    crearGrupoIam(e, { nombre: x.grupo, politicas: [x.politica], usuarios: [x.usuario] });
  }

  let vpc;
  let subred;
  if (o.vpcAndMore) {
    const r = crearVpcCompleta(e, { prefijo: 'elgrano', cidr: x.vpcCidr, zonas: 1, publicas: 1, privadas: 0 });
    vpc = r.vpc;
    subred = r.publicas[0];
  } else {
    vpc = crearVpc(e, { nombre: x.vpcNombre, cidr: x.vpcCidr });
    subred = crearSubred(e, { vpcId: vpc.id, nombre: x.subredNombre, az: x.az, cidr: x.subredCidr });
    if (!o.sinAutoAssign) editarSubred(e, subred.id, { ipPublicaAuto: true });
    const igw = crearIgw(e, { nombre: x.igwNombre });
    if (!o.igwSuelto) {
      adjuntarIgw(e, igw.id, vpc.id);
      if (o.rutaPrincipal) editarRutas(e, principal(e, vpc.id).id, [{ destino: '0.0.0.0/0', objetivo: igw.id }]);
      else {
        const rt = crearTablaRutas(e, { vpcId: vpc.id, nombre: 'rt-publica' });
        editarRutas(e, rt.id, [{ destino: '0.0.0.0/0', objetivo: igw.id }]);
        if (!o.sinAsociar) asociarSubredes(e, rt.id, [subred.id]);
      }
    }
  }

  if (o.primeroEnDefecto) {
    // Primer intento en la VPC por omisión, luego lo termina y lo hace bien.
    const def = e.vpcs.find((v) => v.porDefecto);
    const sgDef = crearGrupoSeguridad(e, { nombre: 'web-def', descripcion: 'primer intento', vpcId: def.id, entrada: [tcp(80, '0.0.0.0/0')] });
    const [i] = lanzarInstancias(e, { nombre: 'intento', gruposSeguridad: [sgDef.id], userData: x.userData });
    terminarInstancia(e, i.id);
  }

  const enDefecto = o.instanciaEnDefecto;
  const vpcSg = enDefecto ? e.vpcs.find((v) => v.porDefecto).id : vpc.id;
  const sg = crearGrupoSeguridad(e, {
    nombre: x.sg,
    descripcion: 'web',
    vpcId: vpcSg,
    entrada: [tcp(o.https ? 443 : 80, '0.0.0.0/0'), tcp(22, o.sshAbierto ? '0.0.0.0/0' : `${x.ipCasa}/32`)]
  });
  lanzarInstancias(e, {
    nombre: x.instancia,
    ami: 'al2023',
    tipo: o.tipo ?? 't2.micro',
    subredId: enDefecto ? null : subred.id,
    ipPublica: o.vpcAndMore ? true : undefined,
    gruposSeguridad: [sg.id],
    userData: o.sinSufijo ? x.userData.replace(x.textoSucursal, 'sucursal centro') : x.userData
  });

  const b = crearBucket(e, { nombre: x.bucket, bloqueoPublico: o.bucketPublico ? nadaBloqueado : undefined, versionado: !o.versionadoDespues });
  if (o.versionadoDespues) editarVersionado(e, b.nombre, true);
  return terminar(e);
}

const CASOS_1 = [
  { nombre: 'VPC and more en lugar de pieza por pieza, t3.micro, IP pública al lanzar', o: { vpcAndMore: true, tipo: 't3.micro', versionadoDespues: true }, minimo: 98, fallan: ['red/subred-cidr'] },
  { nombre: 'ruta 0.0.0.0/0 en la tabla principal', o: { rutaPrincipal: true }, minimo: 100 },
  { nombre: 'grupo «Baristas» y usuario «Lupita» con mayúscula (IAM no distingue)', o: { mayusculas: true }, minimo: 100 },
  { nombre: 'primer intento en la VPC por omisión (terminado) y luego bien', o: { primeroEnDefecto: true }, minimo: 100 },
  { nombre: 'ERROR instancia en la VPC por omisión', o: { instanciaEnDefecto: true }, maximo: 70, fallan: ['servidor/instancia', 'servidor/pagina'], retro: { 'servidor/instancia': 'VPC por omisión' } },
  { nombre: 'ERROR grupo con HTTPS en lugar de HTTP', o: { https: true }, fallan: ['servidor/http', 'servidor/pagina', 'servidor/texto'], retro: { 'servidor/http': '443' } },
  { nombre: 'ERROR subred sin auto-assign y sin IP pública al lanzar', o: { sinAutoAssign: true }, fallan: ['servidor/ip', 'servidor/pagina'], retro: { 'servidor/ip': 'Auto-assign' } },
  { nombre: 'ERROR bucket con acceso público', o: { bucketPublico: true }, minimo: 96, fallan: ['s3/bloqueo'], retro: { 's3/bloqueo': 'Block all public access' } },
  { nombre: 'ERROR SSH abierto al mundo', o: { sshAbierto: true }, minimo: 94, fallan: ['servidor/ssh'], retro: { 'servidor/ssh': '0.0.0.0/0' } },
  { nombre: 'ERROR Internet Gateway sin conectar', o: { igwSuelto: true }, fallan: ['red/igw', 'red/ruta', 'servidor/pagina'], retro: { 'red/igw': 'Detached' } },
  { nombre: 'ERROR tabla con la ruta pero sin asociar', o: { sinAsociar: true }, fallan: ['red/ruta'], retro: { 'red/ruta': 'Subnet associations' } },
  { nombre: 'ERROR política puesta directo al usuario', o: { iamDirecto: true }, minimo: 98, fallan: ['iam/directo'] },
  { nombre: 'ERROR página sin el sufijo del alumno', o: { sinSufijo: true }, minimo: 96, fallan: ['servidor/texto'] }
];

/* ======================================================= simulacro 2 */

function construir2(d, o = {}) {
  const x = datos2(d);
  const e = LABS.get('simulacro-2').estadoInicial(d);
  const vpc = e.vpcs.find((v) => v.cidr === x.vpcCidr);
  const igw = e.igws.find((g) => g.nombre === x.igwNombre);
  const publica = e.subredes.find((s) => s.cidr === x.publicaCidr);
  const nacl = e.nacls.find((n) => n.nombre === x.nacl);
  const pruebas = e.nacls.find((n) => n.nombre === x.naclPruebas);
  const sg = e.gruposSeguridad.find((g) => g.nombre === x.sg);
  let inst = e.instancias[0];

  // web: la puerta y el letrero
  adjuntarIgw(e, igw.id, vpc.id);
  if (o.rutaPrincipal) editarRutas(e, principal(e, vpc.id).id, [{ destino: '0.0.0.0/0', objetivo: igw.id }]);
  else {
    const rt = crearTablaRutas(e, { vpcId: vpc.id, nombre: o.otroNombreTabla ? 'rutas-internet' : x.tablaNombre });
    editarRutas(e, rt.id, [{ destino: '0.0.0.0/0', objetivo: igw.id }]);
    if (!o.tablaSinAsociar) asociarSubredes(e, rt.id, o.tablaEnLasDos ? [publica.id, e.subredes.find((s) => s.cidr === x.privadaCidr).id] : [publica.id]);
  }
  const reglas = [tcp(o.https ? 443 : 80, '0.0.0.0/0')];
  if (!o.sinSsh) reglas.push(tcp(22, o.sshAbierto ? '0.0.0.0/0' : `${x.ipCasa}/32`));
  editarReglasSg(e, sg.id, 'entrada', reglas);

  // nacl: la caseta
  if (o.arreglarPruebas) editarReglasNacl(e, pruebas.id, 'entrada', pruebas.entrada.filter((r) => r.numero !== 10));
  else if (!o.naclSinAsociar) asociarNacl(e, nacl.id, [publica.id]);
  if (!o.sinSalida && !o.arreglarPruebas) {
    const salida = o.salidaTodo ? { numero: 200, protocolo: '-1', cidr: '0.0.0.0/0', accion: 'allow' } : { numero: 110, protocolo: 'tcp', desde: o.salidaCorta ? 32768 : 1024, hasta: 65535, cidr: '0.0.0.0/0', accion: 'allow' };
    editarReglasNacl(e, nacl.id, 'salida', [...nacl.salida, salida]);
  }

  if (o.relanzar) {
    terminarInstancia(e, inst.id);
    [inst] = lanzarInstancias(e, { nombre: 'patitas-web-2', subredId: publica.id, gruposSeguridad: [sg.id], userData: x.userData });
    avanzar(e, reloj.ahora() + 60_000);
  }

  // iam y rol
  quitarPoliticaUsuario(e, x.sobrino, 'AdministratorAccess');
  crearGrupoIam(e, { nombre: x.grupo, politicas: o.readOnlyTodo ? ['ReadOnlyAccess'] : x.politicasGrupo, usuarios: [x.sobrino] });
  crearRol(e, { nombre: 'rol-servidor', politicas: o.rolCompleto ? ['AmazonS3FullAccess'] : [x.politicaRol] });
  cambiarRolInstancia(e, inst.id, 'rol-servidor');

  // s3
  editarBloqueoPublico(e, x.bucket, todoBloqueado);
  editarVersionado(e, x.bucket, true);
  if (o.dosReglas) {
    crearReglaCiclo(e, x.bucket, { nombre: 'a-ia', transiciones: [{ dias: 30, clase: 'STANDARD_IA' }, { dias: 180, clase: 'GLACIER' }] });
    crearReglaCiclo(e, x.bucket, { nombre: 'borrar-5-anios', expiracionDias: 1825, borrarNoActualesDias: 30 });
  } else {
    crearReglaCiclo(e, x.bucket, {
      nombre: 'expedientes',
      transiciones: [{ dias: 30, clase: 'STANDARD_IA' }, { dias: 180, clase: o.glacierInstant ? 'GLACIER_IR' : o.deepArchive ? 'DEEP_ARCHIVE' : 'GLACIER' }],
      expiracionDias: o.sinExpirar ? null : 1825
    });
  }

  // discos
  const vol = crearVolumen(e, { nombre: x.volumenNombre, tipo: o.volumenGp2 ? 'gp2' : 'gp3', tamano: o.volumenGrande ? 20 : x.volumenTamano, az: o.volumenOtraZona ? 'us-east-1a' : inst.az });
  avanzar(e, reloj.ahora() + 60_000);
  if (!o.volumenOtraZona && !o.volumenSuelto) adjuntarVolumen(e, vol.id, inst.id);
  const raiz = e.volumenes.find((v) => v.instanciaId === inst.id && v.raiz);
  crearSnapshot(e, { volumenId: o.snapshotRaiz ? raiz.id : vol.id, descripcion: o.descMayus ? '  RESPALDO de las radiografías. ' : o.sinDesc ? '' : x.descSnap });
  return terminar(e);
}

const CASOS_2 = [
  { nombre: 'sin SSH (borrado en vez de restringido), salida All traffic, dos reglas de ciclo, descripción con mayúsculas y acento', o: { sinSsh: true, salidaTodo: true, dosReglas: true, descMayus: true, otroNombreTabla: true }, minimo: 100, retro: { 's3/expira': 'versiones anteriores' } },
  { nombre: 'la solución de siempre: la retro de expirar avisa del marcador de borrado', o: {}, minimo: 100, retro: { 's3/expira': 'marcador de borrado', 'discos/adjunto': 'misma zona', 'nacl/salida': 'stateless' } },
  { nombre: 'ERROR ruta en la tabla principal (la privada se vuelve pública)', o: { rutaPrincipal: true }, minimo: 94, maximo: 94, fallan: ['web/propia', 'web/privada'], retro: { 'web/privada': 'tabla principal', 'web/propia': 'heredó la tabla principal' } },
  { nombre: 'ERROR tabla propia con la ruta, pero sin asociar', o: { tablaSinAsociar: true }, fallan: ['web/ruta', 'web/propia', 'web/privada', 'web/pagina', 'web/original'], retro: { 'web/ruta': 'Subnet associations', 'web/propia': 'no está asociada' } },
  { nombre: 'ERROR tabla pública asociada también a la privada', o: { tablaEnLasDos: true }, minimo: 97, fallan: ['web/privada'], retro: { 'web/privada': 'desmarca' } },
  { nombre: 'ERROR NACL buena sin asociar (sigue la de pruebas)', o: { naclSinAsociar: true }, fallan: ['nacl/asociada', 'web/pagina', 'web/original'], retro: { 'nacl/asociada': 'menor a mayor', 'web/pagina': 'NACL' } },
  { nombre: 'ERROR arreglar la NACL de pruebas en vez de usar la buena', o: { arreglarPruebas: true }, minimo: 88, maximo: 88, fallan: ['nacl/asociada', 'nacl/salida'], retro: { 'nacl/asociada': 'NACL buena', 'nacl/salida': '1024-65535' } },
  { nombre: 'ERROR NACL asociada sin la regla de salida', o: { sinSalida: true }, fallan: ['nacl/salida', 'web/pagina', 'web/original'], retro: { 'nacl/salida': '1024-65535', 'web/pagina': 'NACL (salida)' } },
  { nombre: 'ERROR salida solo 32768-65535 (no cubre todos los puertos efímeros)', o: { salidaCorta: true }, minimo: 94, fallan: ['nacl/salida'], retro: { 'nacl/salida': 'puerto 1024' } },
  { nombre: 'ERROR relanzar en vez de reparar', o: { relanzar: true }, minimo: 98, fallan: ['web/original'], retro: { 'web/original': 'terminated' } },
  { nombre: 'ERROR HTTPS en lugar de HTTP', o: { https: true }, fallan: ['web/http', 'web/pagina', 'web/original'], retro: { 'web/http': '443' } },
  { nombre: 'ERROR SSH sigue abierto', o: { sshAbierto: true }, minimo: 96, fallan: ['web/ssh'] },
  { nombre: 'ERROR ReadOnlyAccess para la recepción', o: { readOnlyTodo: true }, minimo: 95, fallan: ['iam/grupo'], retro: { 'iam/grupo': 'TODA la cuenta' } },
  { nombre: 'ERROR rol con S3 Full Access', o: { rolCompleto: true }, minimo: 95, fallan: ['rol/rol'] },
  { nombre: 'ERROR Glacier Instant en vez de Flexible', o: { glacierInstant: true }, minimo: 97, fallan: ['s3/glacier-180'], retro: { 's3/glacier-180': 'Glacier Instant Retrieval' } },
  { nombre: 'ERROR Deep Archive (como en la sesión 4) en vez de Flexible', o: { deepArchive: true }, minimo: 97, fallan: ['s3/glacier-180'], retro: { 's3/glacier-180': 'Deep Archive' } },
  { nombre: 'ERROR regla sin expiración', o: { sinExpirar: true }, minimo: 98, fallan: ['s3/expira'], retro: { 's3/expira': 'Expire current versions' } },
  { nombre: 'ERROR volumen en otra zona (no se pudo conectar)', o: { volumenOtraZona: true }, minimo: 94, maximo: 94, fallan: ['discos/adjunto'], retro: { 'discos/adjunto': 'misma zona' } },
  { nombre: 'ERROR volumen creado pero sin conectar', o: { volumenSuelto: true }, minimo: 94, fallan: ['discos/adjunto'], retro: { 'discos/adjunto': 'Attach volume' } },
  { nombre: 'ERROR volumen gp2 de 20 GiB', o: { volumenGp2: true, volumenGrande: true }, minimo: 96, fallan: ['discos/volumen'], retro: { 'discos/volumen': 'gp3 de 5 GiB' } },
  { nombre: 'ERROR snapshot del disco raíz', o: { snapshotRaiz: true }, minimo: 96, fallan: ['discos/snapshot'], retro: { 'discos/snapshot': 'disco raíz' } },
  { nombre: 'ERROR snapshot sin descripción', o: { sinDesc: true }, minimo: 97, fallan: ['discos/descripcion'], retro: { 'discos/descripcion': '(vacía)' } }
];

/* ========================================================= bimestral */

function construirB(d, o = {}) {
  const x = datosB(d);
  const e = LABS.get('bimestral').estadoInicial(d);
  let vpc = e.vpcs.find((v) => v.cidr === x.vpcCidr);
  let pub;

  if (o.vpcAndMore) {
    const r = crearVpcCompleta(e, { prefijo: 'donbeto', cidr: x.vpcCidr, zonas: 2, publicas: 2, privadas: 2 });
    vpc = r.vpc;
    pub = r.publicas[0];
  } else {
    pub = crearSubred(e, { vpcId: vpc.id, nombre: x.publicaNombre, az: x.azPublica, cidr: x.publicaCidr });
    if (o.autoAssign) editarSubred(e, pub.id, { ipPublicaAuto: true });
    // La subred privada es el bono opcional: solo se hace si el caso lo pide.
    if (o.bono) crearSubred(e, { vpcId: vpc.id, nombre: x.privadaNombre, az: x.azPrivada, cidr: x.privadaCidr });
    const igw = crearIgw(e, { nombre: 'igw' });
    adjuntarIgw(e, igw.id, vpc.id);
    if (o.rutaPrincipal) editarRutas(e, principal(e, vpc.id).id, [{ destino: '0.0.0.0/0', objetivo: igw.id }]);
    else {
      const rt = crearTablaRutas(e, { vpcId: vpc.id, nombre: 'rt-publica' });
      editarRutas(e, rt.id, [{ destino: '0.0.0.0/0', objetivo: igw.id }]);
      asociarSubredes(e, rt.id, [pub.id]);
    }
    const nacl = e.nacls.find((n) => n.nombre === x.nacl);
    if (o.naclPropia) {
      const mia = crearNacl(e, { vpcId: vpc.id, nombre: 'mi-nacl' });
      editarReglasNacl(e, mia.id, 'entrada', [
        { numero: 10, protocolo: '-1', cidr: x.redAtacante, accion: 'deny' },
        { numero: 100, protocolo: '-1', cidr: '0.0.0.0/0', accion: 'allow' }
      ]);
      editarReglasNacl(e, mia.id, 'salida', [{ numero: 100, protocolo: '-1', cidr: '0.0.0.0/0', accion: 'allow' }]);
      asociarNacl(e, mia.id, [pub.id]);
    } else {
      asociarNacl(e, nacl.id, [pub.id]);
      if (o.naclCambiarAAllow) editarReglasNacl(e, nacl.id, 'entrada', nacl.entrada.map((r) => (r.numero === 90 ? { ...r, accion: 'allow' } : r)));
      else if (o.naclQuitarTodo) editarReglasNacl(e, nacl.id, 'entrada', [{ numero: 100, protocolo: '-1', cidr: '0.0.0.0/0', accion: 'allow' }]);
      else if (!o.naclSinArreglar) editarReglasNacl(e, nacl.id, 'entrada', nacl.entrada.filter((r) => r.numero !== 90));
    }
  }

  const sg = crearGrupoSeguridad(e, { nombre: x.sg, descripcion: 'web', vpcId: vpc.id, entrada: [tcp(80, '0.0.0.0/0'), tcp(22, `${x.ipCasa}/32`)] });
  const volumenes = o.volumenAlLanzar ? [{ tamano: 8, tipo: 'gp3' }, { tamano: x.volumenTamano, tipo: 'gp3', eliminarAlTerminar: false }] : undefined;
  const [inst] = lanzarInstancias(e, {
    nombre: x.instancia,
    ami: 'al2023',
    tipo: o.tipo ?? 't2.micro',
    subredId: pub.id,
    ipPublica: o.autoAssign ? undefined : true,
    gruposSeguridad: [sg.id],
    volumenes,
    userData: x.userData
  });
  avanzar(e, reloj.ahora() + 60_000);

  let vol;
  if (o.volumenAlLanzar) vol = e.volumenes.find((v) => v.instanciaId === inst.id && !v.raiz);
  else {
    vol = crearVolumen(e, { nombre: x.volumenNombre, tipo: 'gp3', tamano: x.volumenTamano, az: o.volumenOtraZona ? 'us-east-1b' : inst.az });
    avanzar(e, reloj.ahora() + 60_000);
    if (!o.volumenOtraZona) adjuntarVolumen(e, vol.id, inst.id);
  }
  const deQuien = o.snapshotRaiz ? e.volumenes.find((v) => v.instanciaId === inst.id && v.raiz) : vol;
  crearSnapshot(e, { volumenId: deQuien.id, descripcion: 'respaldo' });

  crearBucket(e, { nombre: x.bucket, versionado: true });
  crearReglaCiclo(e, x.bucket, { nombre: 'archivo', prefijo: o.cicloPrefijo ? 'facturas/' : null, transiciones: [{ dias: x.diasArchivo, clase: 'DEEP_ARCHIVE' }] });

  crearGrupoIam(e, { nombre: x.grupo, politicas: o.readOnlyTodo ? ['ReadOnlyAccess'] : [x.politica, ...(o.politicaExtra ? [o.politicaExtra] : [])] });
  crearUsuario(e, { nombre: x.usuario });
  agregarUsuariosAGrupo(e, x.grupo, [x.usuario]);
  return terminar(e);
}

// Sin `bono: true`, el caso no hace la subred privada (el bono opcional): así
// los puntos miden solo lo requerido. `pasan`: checks que deben salir bien.
const BONO = ['privada/subred', 'privada/cidr'];
const CASOS_B = [
  { nombre: 'disco extra agregado al lanzar, t3.micro, auto-assign en la subred', o: { volumenAlLanzar: true, tipo: 't3.micro', autoAssign: true }, minimo: 100 },
  { nombre: 'NACL arreglada cambiando la regla 90 a allow', o: { naclCambiarAAllow: true }, minimo: 100 },
  { nombre: 'NACL propia que también bloquea a la red atacante', o: { naclPropia: true }, minimo: 100 },
  { nombre: 'VPC and more nueva con el mismo CIDR (ignora la NACL del técnico; trae su propia privada)', o: { vpcAndMore: true }, minimo: 91, maximo: 91, fallan: ['red/publica-cidr', 'privada/cidr', 'nacl/nacl-bloqueo', 'nacl/nacl-http'], pasan: ['privada/subred'] },
  { nombre: 'BONO hecho: todo bien y la subred privada', o: { bono: true }, minimo: 100, maximo: 100, pasan: BONO },
  { nombre: 'BONO sin hacer: todo lo requerido bien sigue dando 100', o: {}, minimo: 100, maximo: 100, fallan: BONO, retro: { 'privada/subred': 'opcional' } },
  { nombre: 'BONO compensa un error sin pasar de 100 (snapshot del raíz: 95 + 6)', o: { bono: true, snapshotRaiz: true }, minimo: 100, maximo: 100, fallan: ['discos/snapshot'], pasan: BONO },
  { nombre: 'BONO compensa solo en parte (NACL sin arreglar: 85 + 6)', o: { bono: true, naclSinArreglar: true }, minimo: 91, maximo: 91, fallan: ['servidor/pagina', 'servidor/texto', 'nacl/nacl-http'], pasan: BONO },
  { nombre: 'ERROR NACL asociada sin arreglar', o: { naclSinArreglar: true }, minimo: 85, maximo: 85, fallan: ['servidor/pagina', 'servidor/texto', 'nacl/nacl-http'], retro: { 'servidor/pagina': 'NACL', 'nacl/nacl-http': 'regla 90' } },
  { nombre: 'ERROR NACL abierta del todo (sin bloqueo al atacante)', o: { naclQuitarTodo: true }, minimo: 95, maximo: 95, fallan: ['nacl/nacl-bloqueo'] },
  { nombre: 'ERROR volumen en otra zona', o: { volumenOtraZona: true }, minimo: 95, maximo: 95, fallan: ['discos/adjunto'], retro: { 'discos/adjunto': 'misma zona' } },
  { nombre: 'ERROR snapshot del disco raíz', o: { snapshotRaiz: true }, minimo: 95, maximo: 95, fallan: ['discos/snapshot'], retro: { 'discos/snapshot': 'disco raíz' } },
  { nombre: 'ERROR ruta en la tabla principal (con el bono: la privada se vuelve pública)', o: { rutaPrincipal: true, bono: true }, minimo: 100, maximo: 100, fallan: ['privada/subred'], pasan: ['red/publica', 'privada/cidr'], retro: { 'privada/subred': 'tabla principal' } },
  { nombre: 'ERROR ciclo de vida solo para un prefijo', o: { cicloPrefijo: true }, minimo: 94, maximo: 94, fallan: ['s3/ciclo'], retro: { 's3/ciclo': 'prefijo' } },
  { nombre: 'ERROR ReadOnlyAccess para la cajera', o: { readOnlyTodo: true }, minimo: 95, maximo: 95, fallan: ['iam/grupo'], retro: { 'iam/grupo': 'TODA la cuenta' } },
  { nombre: 'ERROR grupo con una política extra de solo lectura (AmazonS3ReadOnlyAccess)', o: { politicaExtra: 'AmazonS3ReadOnlyAccess' }, minimo: 95, maximo: 95, fallan: ['iam/grupo'], retro: { 'iam/grupo': 'ninguna otra' } },
  { nombre: 'ERROR grupo con AdministratorAccess además', o: { politicaExtra: 'AdministratorAccess' }, minimo: 95, maximo: 95, fallan: ['iam/grupo'], retro: { 'iam/grupo': 'AdministratorAccess' } }
];

const ESCENARIOS = { 'simulacro-1': [construir1, CASOS_1], 'simulacro-2': [construir2, CASOS_2], bimestral: [construirB, CASOS_B] };

/* =========================================================== revisar */

const SOSPECHOSO = /\bundefined\b|\bnull\b|\[object Object\]|NaN/;

function revisarForma(lab, quien, cuando, r, problemas, { exigirOk } = {}) {
  if (r.total !== 100) problemas.push(`${lab}/${quien}: total ${r.total}, no 100`);
  if (!(r.obtenidos >= 0 && r.obtenidos <= 100)) problemas.push(`${lab}/${quien} (${cuando}): da ${r.obtenidos}; con bono y todo debe quedar entre 0 y 100`);
  for (const t of r.tareas) {
    const suma = t.checks.reduce((s, c) => s + c.puntos, 0);
    if (Math.abs(suma - t.puntos) > 0.001) problemas.push(`${lab}/${quien}: los checks de ${t.id} suman ${suma}, no ${t.puntos}`);
    for (const c of t.checks) {
      const donde = `${lab}/${quien} (${cuando}) ${t.id}/${c.id}`;
      if (!String(c.texto ?? '').trim()) problemas.push(`${donde}: sin texto`);
      if (!String(c.retro ?? '').trim()) problemas.push(`${donde}: sin retro`);
      if (SOSPECHOSO.test(c.retro) || SOSPECHOSO.test(c.texto)) problemas.push(`${donde}: texto sospechoso: ${c.retro}`);
      if (exigirOk === true && !c.ok) problemas.push(`${donde}: falla en la solución: ${c.retro}`);
      if (exigirOk === false && c.ok) problemas.push(`${donde}: ya pasa en la cuenta inicial`);
    }
  }
}

const mapa = (r) => new Map(r.tareas.flatMap((t) => t.checks.map((c) => [`${t.id}/${c.id}`, c])));

/**
 * Corre todas las pruebas. Devuelve la lista de problemas (vacía si todo
 * está bien). `registrar` recibe líneas informativas (opcional).
 */
export function verificarLabs({ registrar = () => {} } = {}) {
  const problemas = [];
  for (const [id, rubrica] of RUBRICAS) {
    const LAB = LABS.get(id);
    if (!LAB) {
      problemas.push(`${id}: hay rúbrica pero no laboratorio público`);
      continue;
    }
    if (!(LAB.minutos > 0 && LAB.minutos <= 60)) problemas.push(`${id}: dura ${LAB.minutos} minutos`);
    if (!LAB.titulo || !LAB.historia) problemas.push(`${id}: falta título o historia`);
    const iniciales = [];

    for (const alumno of ALUMNOS) {
      const quien = alumno.matricula || alumno.nombre;
      const d = datosAlumno(alumno);
      try {
        // Las tareas públicas
        const tareas = LAB.tareas(d);
        // Las tareas bono (opcionales) van aparte: las requeridas suman 100.
        const requeridas = tareas.filter((t) => !t.bono);
        const suma = requeridas.reduce((s, t) => s + t.puntos, 0);
        if (suma !== 100) problemas.push(`${id}/${quien}: las tareas públicas (sin bono) suman ${suma}`);
        if (requeridas.length < 4 || requeridas.length > 6) problemas.push(`${id}: tiene ${requeridas.length} tareas requeridas (se piden 4 a 6)`);
        for (const t of tareas.filter((x) => x.bono)) if (!(t.puntos > 0 && t.puntos <= 10)) problemas.push(`${id}/${t.id}: el bono vale ${t.puntos} (se espera de 1 a 10)`);
        const html = tareas.map((t) => t.html).join(' ');
        if (!html.includes(d.vpcCidr) && !html.includes(d.sufijo)) problemas.push(`${id}/${quien}: las tareas no traen sus datos (VPC o sufijo)`);
        for (const t of tareas) {
          if (!t.titulo || !t.html) problemas.push(`${id}/${t.id}: falta título o html`);
          if (LAB.pistas && !t.pista) problemas.push(`${id}/${t.id}: falta la pista`);
          if (SOSPECHOSO.test(t.html)) problemas.push(`${id}/${t.id}: html sospechoso`);
        }

        // La solución
        const sol = porJson(rubrica.solucion(d));
        const antes = JSON.stringify(sol);
        const rSol = porJson(rubrica.revisar(sol, d));
        if (JSON.stringify(sol) !== antes) problemas.push(`${id}/${quien}: revisar() mutó la cuenta que recibió`);
        if (rSol.obtenidos !== 100) problemas.push(`${id}/${quien}: la solución da ${rSol.obtenidos}`);
        revisarForma(id, quien, 'solución', rSol, problemas, { exigirOk: true });
        const ids = (r) => r.tareas.map((t) => `${t.id}:${t.puntos}`).join(',');
        if (ids(rSol) !== tareas.map((t) => `${t.id}:${t.puntos}`).join(',')) problemas.push(`${id}/${quien}: tareas distintas. Rúbrica ${ids(rSol)} · públicas ${tareas.map((t) => `${t.id}:${t.puntos}`).join(',')}`);
        if (JSON.stringify(sol).length > 512 * 1024) problemas.push(`${id}/${quien}: la solución pesa más de 512 KB`);

        // La cuenta inicial
        const ini = porJson(LAB.estadoInicial(d));
        const rIni = rubrica.revisar(ini, d);
        if (rIni.obtenidos >= 20) problemas.push(`${id}/${quien}: la cuenta inicial ya da ${rIni.obtenidos}`);
        iniciales.push(rIni.obtenidos);
        revisarForma(id, quien, 'inicial', rIni, problemas, { exigirOk: false });

        // Alternativas y errores comunes
        const [construir, casos] = ESCENARIOS[id] ?? [null, []];
        for (const caso of casos) {
          const e = porJson(construir(d, caso.o));
          const r = rubrica.revisar(e, d);
          const m = mapa(r);
          revisarForma(id, quien, caso.nombre, r, problemas);
          const etiqueta = `${id}/${quien} «${caso.nombre}»`;
          if (caso.minimo !== undefined && r.obtenidos < caso.minimo) {
            const fallan = [...m].filter(([, c]) => !c.ok).map(([k, c]) => `${k}: ${c.retro}`);
            problemas.push(`${etiqueta}: da ${r.obtenidos}, se esperaba al menos ${caso.minimo}. Fallan: ${fallan.join(' | ')}`);
          }
          if (caso.maximo !== undefined && r.obtenidos > caso.maximo) problemas.push(`${etiqueta}: da ${r.obtenidos}, se esperaba como mucho ${caso.maximo}`);
          for (const k of caso.fallan ?? []) {
            if (!m.has(k)) problemas.push(`${etiqueta}: no existe el check ${k}`);
            else if (m.get(k).ok) problemas.push(`${etiqueta}: el check ${k} debió fallar`);
          }
          for (const k of caso.pasan ?? []) {
            if (!m.has(k)) problemas.push(`${etiqueta}: no existe el check ${k}`);
            else if (!m.get(k).ok) problemas.push(`${etiqueta}: el check ${k} debió salir bien: ${m.get(k).retro}`);
          }
          for (const [k, texto] of Object.entries(caso.retro ?? {})) {
            const c = m.get(k);
            if (c && !c.retro.includes(texto)) problemas.push(`${etiqueta}: la retro de ${k} no menciona «${texto}»: ${c.retro}`);
          }
          if (alumno === ALUMNOS[0]) registrar(`  ${id} · ${caso.nombre}: ${r.obtenidos}`);
        }
      } catch (err) {
        problemas.push(`${id}/${quien}: error: ${err.stack || err.message}`);
      }
    }
    registrar(`${id}: solución 100 · inicial ${iniciales.join('/')} · ${(ESCENARIOS[id]?.[1] ?? []).length} escenarios × ${ALUMNOS.length} alumnos`);
  }
  return problemas;
}

/* ====================================================== ejecutado directo */

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problemas = verificarLabs({ registrar: (l) => console.log(l) });
  if (problemas.length) {
    console.log(`\n${problemas.length} problema(s):`);
    for (const p of problemas) console.log('  ✗ ' + p);
    process.exit(1);
  }
  console.log('\nLaboratorios: sin problemas.');
}

