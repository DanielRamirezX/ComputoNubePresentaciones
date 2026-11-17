// Audita los laboratorios y sus rúbricas.
//
//   node src/rubricas/verificar-labs.js     (imprime y sale con 1 si hay problemas)
//   import { verificarLabs } from './rubricas/verificar-labs.js'   → [problemas]
//
// Los topes de minutos y de tareas requeridas dependen del tipo de la
// evaluación que usa el laboratorio (TIPOS en src/evaluaciones.js): un
// simulacro, 4 a 6 tareas en 60 min; una práctica integradora, 5 a 9 en 100…
//
// Para 5 alumnos de ejemplo (uno sin matrícula) comprueba que:
//  - la solución da 100 y la cuenta inicial menos de 20;
//  - las tareas públicas y las de la rúbrica tienen los mismos ids y puntos y suman 100;
//  - todo check trae texto y retro (de acierto en la solución, de fallo en la inicial);
//  - revisar() no muta la cuenta que recibe y sobrevive a JSON;
//  - las soluciones alternativas razonables dan 100 o casi;
//  - los errores comunes bajan los puntos correctos y su retro dice algo útil;
//  - el diagrama de arquitectura (si el laboratorio tiene `arquitectura`,
//    SIMULADOR.md §6.6): valida, cubre cada tarea con checks que existen, nada
//    hecho en la cuenta inicial y todo «listo» en la solución revisada, y sus
//    `hecho` no mutan ni lanzan, ni siquiera con una cuenta sin las colecciones
//    de las extensiones. Antes, una prueba corta del motor (public/arquitectura.js).

import { pathToFileURL } from 'node:url';

import { estadosDe, piezasDe, resumenDe, svgArquitectura, validarArquitectura } from '../../public/arquitectura.js';
import { EXTENSIONES } from '../../public/consola/modelo/registro.js';

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
import { EVALUACIONES, TIPOS, tipoDe } from '../evaluaciones.js';
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
  { nombre: 'VPC and more nueva con el mismo CIDR (trae su propia privada)', o: { vpcAndMore: true }, minimo: 100, maximo: 100, fallan: ['red/publica-cidr', 'privada/cidr'], pasan: ['privada/subred'] },
  { nombre: 'BONO hecho: todo bien y la subred privada', o: { bono: true }, minimo: 100, maximo: 100, pasan: BONO },
  { nombre: 'BONO sin hacer: todo lo requerido bien sigue dando 100', o: {}, minimo: 100, maximo: 100, fallan: BONO, retro: { 'privada/subred': 'opcional' } },
  { nombre: 'BONO compensa un error sin pasar de 100 (snapshot del raíz: 94 + 6)', o: { bono: true, snapshotRaiz: true }, minimo: 100, maximo: 100, fallan: ['discos/snapshot'], pasan: BONO },
  { nombre: 'BONO compensa solo en parte (volumen en otra zona: 93 + 6)', o: { bono: true, volumenOtraZona: true }, minimo: 99, maximo: 99, fallan: ['discos/adjunto'], pasan: BONO },
  { nombre: 'ERROR volumen en otra zona', o: { volumenOtraZona: true }, minimo: 93, maximo: 93, fallan: ['discos/adjunto'], retro: { 'discos/adjunto': 'misma zona' } },
  { nombre: 'ERROR snapshot del disco raíz', o: { snapshotRaiz: true }, minimo: 94, maximo: 94, fallan: ['discos/snapshot'], retro: { 'discos/snapshot': 'disco raíz' } },
  { nombre: 'ERROR ruta en la tabla principal (con el bono: la privada se vuelve pública)', o: { rutaPrincipal: true, bono: true }, minimo: 100, maximo: 100, fallan: ['privada/subred'], pasan: ['red/publica', 'privada/cidr'], retro: { 'privada/subred': 'tabla principal' } },
  { nombre: 'ERROR ciclo de vida solo para un prefijo', o: { cicloPrefijo: true }, minimo: 94, maximo: 94, fallan: ['s3/ciclo'], retro: { 's3/ciclo': 'prefijo' } },
  { nombre: 'ERROR ReadOnlyAccess para la cajera', o: { readOnlyTodo: true }, minimo: 93, maximo: 93, fallan: ['iam/grupo'], retro: { 'iam/grupo': 'TODA la cuenta' } },
  { nombre: 'ERROR grupo con una política extra de solo lectura (AmazonS3ReadOnlyAccess)', o: { politicaExtra: 'AmazonS3ReadOnlyAccess' }, minimo: 93, maximo: 93, fallan: ['iam/grupo'], retro: { 'iam/grupo': 'ninguna otra' } },
  { nombre: 'ERROR grupo con AdministratorAccess además', o: { politicaExtra: 'AdministratorAccess' }, minimo: 93, maximo: 93, fallan: ['iam/grupo'], retro: { 'iam/grupo': 'AdministratorAccess' } }
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

/* ================================================ el diagrama (§6.6) */

/** Las colecciones que agregan las extensiones del modelo: una cuenta de octubre no las tiene. */
function coleccionesDeExtensiones() {
  const nombres = new Set();
  for (const ext of EXTENSIONES) {
    const o = {};
    try {
      ext.iniciar?.(o);
    } catch {
      // una extensión que necesita más que un objeto vacío: sus colecciones salen igual en las demás pruebas
    }
    Object.keys(o).forEach((k) => nombres.add(k));
  }
  return [...nombres];
}

/** Prueba corta del motor: que valide de verdad, que escape y que la tabla de estados sea la del contrato. */
function probarMotorArquitectura() {
  const problemas = [];
  const mal = (m) => problemas.push(`motor del diagrama: ${m}`);
  const nodo = (id, col, fila, extra = {}) => ({ id, tipo: 'ec2', etiqueta: 'Servidor', col, fila, ...extra });

  // Un diagrama con errores a propósito: validarArquitectura debe reportar cada uno.
  const roto = {
    titulo: 'Roto',
    objetivo: 'Probar.',
    columnas: 4,
    filas: 3,
    piezas: [
      { id: 'vpc', tipo: 'vpc', etiqueta: 'VPC', col: 0, fila: 0, ancho: 3, alto: 2 },
      nodo('a', 0.5, 0.5, { en: 'vpc' }),
      nodo('a', 2, 0.5),
      nodo('b', 0.9, 0.6),
      nodo('fuera', 3.5, 1),
      { id: 'raro', tipo: 'no-existe', etiqueta: 'X', col: 0, fila: 2 },
      nodo('sin-tarea', 2, 2, { hecho: () => true }),
      nodo('larga', 3, 2, { etiqueta: 'Una etiqueta larguísima que no cabe en dos renglones de ninguna manera' })
    ],
    flechas: [{ de: 'a', a: 'nadie' }]
  };
  const esperados = ['repetido', 'no existe', 'no dice su tarea', 'nadie'];
  const r1 = validarArquitectura(roto).join(' | ');
  for (const e of esperados) if (!r1.includes(e)) mal(`validarArquitectura no reportó «${e}» en un diagrama roto: ${r1 || '(nada)'}`);
  const r2 = validarArquitectura({ ...roto, piezas: roto.piezas.filter((p) => !['raro', 'sin-tarea'].includes(p.id) && p.col !== 2), flechas: [] }).join(' | ');
  for (const e of ['se enciman', 'se sale de la cuadrícula', 'no cabe en dos renglones']) if (!r2.includes(e)) mal(`validarArquitectura no reportó «${e}»: ${r2 || '(nada)'}`);

  // Un diagrama bien hecho: sin problemas, estados como en la tabla y texto escapado.
  const bien = {
    titulo: 'Prueba <b>',
    objetivo: 'Probar el motor.',
    columnas: 6,
    filas: 2,
    piezas: [
      nodo('si', 0, 0, { etiqueta: '<script>x</script>', detalle: '"&\'<>', tarea: 't', checks: ['uno'], hecho: () => true }),
      nodo('no', 2, 0, { tarea: 't', hecho: () => false }),
      nodo('truena', 4, 0, { tarea: 't', hecho: () => { throw new Error('x'); } }),
      nodo('mal', 0, 1, { tarea: 't', checks: ['dos'], hecho: () => true }),
      nodo('bono', 2, 1, { tarea: 'b', bono: true, hecho: () => true }),
      { id: 'deco', tipo: 'usuarios', etiqueta: 'Clientes', col: 4, fila: 1 }
    ],
    flechas: [{ de: 'si', a: 'no', texto: 'HTTP' }]
  };
  const r3 = validarArquitectura(bien);
  if (r3.length) mal(`un diagrama bien hecho da problemas: ${r3.join(' | ')}`);
  const sinRev = estadosDe(bien, {});
  const esperadoSin = { si: 'creado', no: 'falta', truena: 'falta', mal: 'creado', bono: 'creado', deco: null, 'si>no': null };
  for (const [id, e] of Object.entries(esperadoSin)) if (sinRev[id] !== e) mal(`sin revisión, «${id}» debía quedar ${e} y quedó ${sinRev[id]}`);
  const revision = { tareas: [{ id: 't', checks: [{ id: 'uno', ok: true }, { id: 'dos', ok: false }] }, { id: 'b', checks: [{ id: 'x', ok: true }] }] };
  const conRev = estadosDe(bien, {}, revision);
  const esperadoCon = { si: 'listo', no: 'falta', mal: 'pendiente', bono: 'listo' };
  for (const [id, e] of Object.entries(esperadoCon)) if (conRev[id] !== e) mal(`con revisión, «${id}» debía quedar ${e} y quedó ${conRev[id]}`);
  const todoBien = estadosDe(bien, {}, { tareas: [{ id: 't', checks: [{ id: 'uno', ok: true }, { id: 'dos', ok: true }] }] });
  if (todoBien.no !== 'listo') mal('con la tarea completa bien, una pieza que no se reconoce debía quedar «listo»');
  const res = resumenDe(bien, conRev);
  if (res.total !== 4 || res.hechas !== 2 || res.listas !== 1) mal(`resumenDe dio ${JSON.stringify(res)} (se esperaba total 4, hechas 2, listas 1: sin el bono)`);
  const svg = svgArquitectura(bien, conRev, { elegida: 'mal' });
  if (svg.includes('<script>') || svg.includes('<b>') || /"&'/.test(svg)) mal('el SVG no escapa el texto');
  if (!svg.includes('data-pieza="mal" data-estado="pendiente"') || !svg.includes('arq-elegida')) mal('el SVG no marca data-pieza / data-estado / la pieza elegida');
  // Todos los selectores del <style> van bajo .arq-svg: el SVG se incrusta en la página.
  const css = svg.match(/<style>([^<]*)<\/style>/)?.[1] ?? '';
  const selectores = css.replace(/@media[^{]*\{([^{}]*\{[^}]*\})*\}/g, (m) => m.replace(/@media[^{]*\{/, '').slice(0, -1)).match(/[^{}]+(?=\{)/g) ?? [];
  for (const s of selectores) for (const parte of s.split(',')) if (!parte.trim().startsWith('.arq-svg')) mal(`el selector «${parte.trim()}» del SVG no va bajo .arq-svg`);
  return problemas;
}

/**
 * El diagrama de un laboratorio con un alumno: valida, cubre las tareas, nada
 * hecho al inicio, todo listo en la solución revisada, y `hecho` puro.
 */
function verificarDiagrama(id, LAB, d, quien, { sol, rSol, ini, rIni }, problemas) {
  const donde = `${id}/${quien} (diagrama)`;
  let arq;
  try {
    arq = LAB.arquitectura(d);
  } catch (err) {
    problemas.push(`${donde}: arquitectura() lanzó: ${err.message}`);
    return;
  }
  for (const p of validarArquitectura(arq)) problemas.push(`${donde}: ${p}`);

  // Las tareas y los checks a los que apunta cada pieza.
  const tareas = LAB.tareas(d);
  const deRubrica = new Map(rSol.tareas.map((t) => [t.id, t]));
  const piezas = piezasDe(arq);
  for (const p of piezas) {
    const t = tareas.find((x) => x.id === p.tarea);
    if (!t) {
      problemas.push(`${donde}: «${p.id}» dice la tarea «${p.tarea}», que no existe (${tareas.map((x) => x.id).join(', ')})`);
      continue;
    }
    if (Boolean(t.bono) !== p.bono) problemas.push(`${donde}: «${p.id}» es de la tarea ${t.bono ? 'bono' : 'requerida'} «${t.id}»: ${t.bono ? 'debe llevar' : 'no lleva'} bono: true`);
    const ids = (deRubrica.get(t.id)?.checks ?? []).map((c) => c.id);
    for (const c of p.checks) if (!ids.includes(c)) problemas.push(`${donde}: «${p.id}» usa el check «${c}», que no existe en la tarea «${t.id}» (${ids.join(', ')})`);
  }
  for (const t of tareas) if (!t.bono && !piezas.some((p) => p.tarea === t.id)) problemas.push(`${donde}: la tarea «${t.id}» no tiene ninguna pieza ni flecha en el diagrama`);

  // `hecho` no muta ni lanza, tampoco con una cuenta sin las colecciones de las extensiones.
  const conHecho = [...(arq.piezas ?? []), ...(arq.flechas ?? [])].filter((p) => typeof p?.hecho === 'function');
  const nombre = (p) => p.id ?? `${p.de}>${p.a}`;
  const extensiones = coleccionesDeExtensiones();
  const sinExtensiones = (c) => {
    const v = porJson(c);
    for (const k of extensiones) delete v[k];
    return v;
  };
  const cuentas = [
    ['inicial', porJson(ini)],
    ['resuelta', porJson(sol)],
    ['inicial sin las colecciones de las extensiones', sinExtensiones(ini)],
    ['resuelta sin las colecciones de las extensiones', sinExtensiones(sol)]
  ];
  for (const [cual, cuenta] of cuentas) {
    const antes = JSON.stringify(cuenta);
    for (const p of conHecho) {
      try {
        p.hecho(cuenta);
      } catch (err) {
        problemas.push(`${donde}: el hecho de «${nombre(p)}» lanzó con la cuenta ${cual}: ${err.message}`);
      }
    }
    if (JSON.stringify(cuenta) !== antes) problemas.push(`${donde}: algún hecho mutó la cuenta ${cual}`);
  }

  // La cuenta inicial: nada hecho y, con su revisión, nada listo.
  const eIni = estadosDe(arq, ini);
  const eIniR = estadosDe(arq, ini, rIni);
  for (const p of piezas) {
    if (eIni[p.id] !== 'falta') problemas.push(`${donde}: «${p.id}» ya se ve hecha en la cuenta inicial`);
    if (eIniR[p.id] === 'listo') problemas.push(`${donde}: «${p.id}» sale «listo» con la revisión de la cuenta inicial`);
  }

  // Solo la red («VPC and more» con el rango del alumno): no enciende nada que
  // no sea red. El grupo «default» de toda VPC nueva se deja entrar a sí mismo:
  // un detector de «solo desde otro grupo» que lo cuente se enciende sin que el
  // alumno haya tocado un grupo de seguridad (pasó en practica-1 y en final).
  const soloRed = porJson(ini);
  let conRed = true;
  try {
    crearVpcCompleta(soloRed, { prefijo: 'solo-red', cidr: d.vpcCidr, zonas: 2, publicas: 2, privadas: 2 });
  } catch {
    conRed = false; // el laboratorio ya trae esa red: no hay nada que probar
  }
  if (conRed) {
    const DE_RED = new Set(['vpc', 'az', 'subred-publica', 'subred-privada', 'igw', 'nat', 'rutas']);
    const eRed = estadosDe(arq, soloRed);
    for (const p of piezas) {
      if (eRed[p.id] !== 'falta' && !(p.clase === 'pieza' && DE_RED.has(p.tipo))) problemas.push(`${donde}: «${p.id}» se ve hecha con solo crear la VPC (¿cuenta el grupo «default», que se deja entrar a sí mismo?)`);
    }
  }

  // La solución: todo hecho y, con su revisión, todo listo (el bono, si la solución lo gana).
  const eSol = estadosDe(arq, sol);
  const eSolR = estadosDe(arq, sol, rSol);
  for (const p of piezas) {
    const t = deRubrica.get(p.tarea);
    if (p.bono && !(t && t.checks.every((c) => c.ok))) continue;
    if (eSol[p.id] === 'falta') problemas.push(`${donde}: «${p.id}» no se reconoce en la cuenta resuelta (su hecho da falso)`);
    else if (eSolR[p.id] !== 'listo') problemas.push(`${donde}: «${p.id}» queda «${eSolR[p.id]}» con la revisión de la solución`);
  }

  try {
    const svg = svgArquitectura(arq, eSolR);
    if (SOSPECHOSO.test(svg.replace(/<style>[^<]*<\/style>/, ''))) problemas.push(`${donde}: el SVG trae undefined, null o NaN`);
  } catch (err) {
    problemas.push(`${donde}: svgArquitectura lanzó: ${err.message}`);
  }
}

/**
 * Corre todas las pruebas. Devuelve la lista de problemas (vacía si todo
 * está bien). `registrar` recibe líneas informativas (opcional).
 */
export function verificarLabs({ registrar = () => {} } = {}) {
  const problemas = probarMotorArquitectura();
  for (const [id, rubrica] of RUBRICAS) {
    const LAB = LABS.get(id);
    if (!LAB) {
      problemas.push(`${id}: hay rúbrica pero no laboratorio público`);
      continue;
    }
    const tipo = TIPOS[tipoDe(EVALUACIONES.find((ev) => ev.lab === id))];
    const [minTareas, maxTareas] = tipo.tareas;
    if (!(LAB.minutos > 0 && LAB.minutos <= tipo.minutos)) problemas.push(`${id}: dura ${LAB.minutos} minutos (máximo ${tipo.minutos})`);
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
        if (requeridas.length < minTareas || requeridas.length > maxTareas) problemas.push(`${id}: tiene ${requeridas.length} tareas requeridas (se piden ${minTareas} a ${maxTareas})`);
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

        // El diagrama de arquitectura (solo los laboratorios que lo tienen)
        if (typeof LAB.arquitectura === 'function') verificarDiagrama(id, LAB, d, quien, { sol, rSol, ini, rIni }, problemas);

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
    if (typeof LAB.arquitectura === 'function') {
      try {
        registrar(`  ${id} · diagrama: ${piezasDe(LAB.arquitectura(datosAlumno(ALUMNOS[0]))).length} piezas y flechas con estado`);
      } catch {
        // el error ya quedó en problemas (verificarDiagrama)
      }
    }
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

