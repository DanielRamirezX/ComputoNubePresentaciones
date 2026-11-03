# Evaluación AWS · simulacros, simulador y examen final

Módulo de la plataforma (secciones **Simulador AWS** y **Evaluación**, montado
en `/m/evaluacion/`) con las evaluaciones de la Ruta AWS y el simulador donde
los alumnos practican. Las evaluaciones de octubre cubren las sesiones 1 a 4:
fundamentos y EC2, identidad y seguridad, redes y almacenamiento.

| Evaluación | Fecha | Parte teórica | Parte práctica |
|---|---|---|---|
| Simulacro 1 | martes 20 de octubre de 2026 | 5 casos de negocio, 25 preguntas, 45 min | «La cafetería El Grano de Oro»: construir desde cero |
| Simulacro 2 | viernes 23 de octubre de 2026 | 5 casos **distintos**, 25 preguntas, 45 min; más sencilla que la del simulacro 1 | «Veterinaria Patitas»: diagnosticar y reparar, con pistas generales (sin la ruta de clics) |
| Examen bimestral | martes 27 de octubre de 2026 | — (la aplica el docente) | «Ferretería Don Beto»: red, servidor, disco, S3 e IAM (sin NACL), con pistas generales; la subred privada es bono opcional (máx. 100) |

- Cada laboratorio está pensado para durar **máximo 60 minutos**.
- **Toda pregunta y todo punto de la rúbrica tienen retroalimentación**, tanto
  si se acierta como si se falla.
- En el simulacro, la calificación combinada pesa 60 % la teórica y 40 % la práctica.
- Los laboratorios se hacen en una **consola de AWS simulada**: modo oscuro,
  con EC2, VPC, S3 e IAM. Funciona sin cuenta de AWS y sin internet.
  - Los mensajes de error son los de AWS, en inglés.
  - La prueba «¿abre la página?» sigue el camino real del paquete: DNS, IP
    pública, Internet Gateway, ruta, NACL, security group y el servidor que
    instaló el user data.
- Cada alumno recibe datos propios a partir de su matrícula: su red
  `10.X.0.0/16`, el sufijo de su bucket y «la IP de su casa». Copiar la
  configuración del vecino no sirve.

## El simulador AWS (noviembre de 2026)

En la plataforma, la tarjeta **Simulador AWS** abre `#/simulador`, una página
con cuatro bloques (el diseño completo está en `SIMULADOR.md`):

1. **Consola libre.** Una cuenta nueva de la consola simulada, sin tareas ni
   calificación, para practicar lo que quieran. Vive solo en el navegador del
   alumno (`localStorage`, clave `evaluacion-aws:libre-<perfil>`): el servidor
   no la recibe y el panel no la ve. Trae «Reiniciar mi cuenta» y «Descargar /
   Cargar mi cuenta» (un JSON) para seguir en otro equipo, y un panel de
   **Ideas para practicar**: 21 retos cortos por servicio (EC2, VPC, S3, IAM,
   RDS, DynamoDB, Auto Scaling, CloudWatch, SQS, Lambda, Billing…), con los
   datos del alumno y una palomita cuando parece que ya lo hizo. Funciona aunque
   el servidor no conteste.
2. **Laboratorios de sesión** (`lab-s5`, `lab-s6`, `lab-s7`): la versión de
   simulador del laboratorio de cada sesión. El alumno elige si lo hace en
   DataCamp o aquí; aquí se califica solo.
3. **Prácticas integradoras** (`practica-1` … `practica-5`, sesiones 9 a 13).
4. **Examen final** (`final`): solo aparece cuando lo abres.

Cada entrada de `src/evaluaciones.js` tiene un **`tipo`** que decide cómo se
comporta:

| tipo | ids | Arranca abierto | Minutos (máx.) | Tareas | Entrega |
|---|---|---|---|---|---|
| `evaluacion` | `simulacro-1`, `simulacro-2`, `bimestral` | como en octubre | 60 | 4 a 6 | como en octubre |
| `laboratorio` | `lab-s5`, `lab-s6`, `lab-s7` | **sí** (solo práctica) | 55 | 4 a 7 + bono | queda como evidencia; después, «Intentar de nuevo» |
| `practica` | `practica-1` … `practica-5` | no: la abres en clase | 100 | 5 a 9 + bono | una entrega y luego intentos; asistente opcional (10 preguntas) |
| `final` | `final` | no | teórica 50 (8 casos × 5), práctica 60 | 5 a 8 + bono | una sola, sin intentos, sin «Revisar mi avance» y con solo la calificación al entregar (cámbialo a completa cuando todos terminen) |

Mientras un laboratorio, una práctica o el banco del final no existan, su
tarjeta dice **«En preparación»**: nadie lo puede abrir por accidente y nada
truena. En las tarjetas de los laboratorios de sesión y las prácticas, el
alumno ve «vas en X de Y tareas» (solo si «Revisar mi avance» está prendido);
la Ruta lo lee de `api/estado` (`partes.practica.avance`).

En el panel, el selector agrupa por tipo y trae **«Resumen del simulador»**:
todos los laboratorios, prácticas y el final en una tabla (abierto o cerrado,
cuántos trabajan ahora, empezaron · en curso · entregaron y el promedio). «Ver»
abre ese laboratorio con la tabla en vivo de siempre.

## Cómo se usa en clase

1. Abre el **panel docente**: `…/m/evaluacion/docente`. También hay un botón en
   el panel de la Ruta AWS. La clave es la misma `CLAVE_DOCENTE` de los otros paneles.
2. Elige la evaluación y activa los interruptores **Parte teórica** y **Parte
   práctica**. Mientras estén cerrados, los alumnos ven la tarjeta con candado.
3. Opciones de cada evaluación:
   - **Retroalimentación al entregar:** completa, que muestra qué hicieron
     bien y qué no con su explicación, o solo la calificación. Por omisión es
     completa en las tres evaluaciones.
   - **«Revisar mi avance»:** deja que el alumno califique su laboratorio a
     medio camino. Viene activado en las tres evaluaciones.
   - **Asistente de IA:** un compañero con experiencia al que el alumno le
     pregunta cuando se atora. Ve cómo va su cuenta y lo orienta (dónde buscar,
     qué concepto le falta), pero no le da la respuesta. Hasta 15 preguntas por
     alumno (5 en el bimestral, con `preguntasAsistente` en
     `src/evaluaciones.js`). Viene prendido en el Simulacro 2 y en el
     bimestral. En el
     panel, «Ver» → «Asistente» muestra la conversación completa, y el CSV
     trae cuántas preguntas hizo cada quien.
4. Los alumnos entran desde la tarjeta de la sección Evaluación de la
   plataforma (los simulacros) o desde **Simulador AWS** (laboratorios de
   sesión, prácticas y el final).
5. En el panel ves en vivo:
   - quién empezó y quién entregó;
   - cuántas tareas lleva cada alumno;
   - su consola en modo de solo lectura, con su bitácora.

   Puedes borrar una entrega para que el alumno repita.

   En los **simulacros**, quien ya entregó una parte puede **repetirla para
   practicar** («Intentar de nuevo»), las veces que quiera y aunque la parte
   ya esté cerrada. Solo cuenta la primera entrega: los intentos se califican
   con la misma retroalimentación, pero no se guardan ni aparecen en el panel
   ni en el CSV. El bimestral no se puede repetir.
6. **Al terminar cada clase, descarga el CSV.** Render borra el disco cada vez
   que reinicia el servidor. Cada alumno guarda en su navegador un comprobante
   firmado de su entrega, y la vuelve a subir sola si el servidor la perdió.
   Aun así, el CSV es tu respaldo. Descarga también el **reporte de evidencia**
   (o, desde «Ver», el de un solo alumno): un HTML para imprimir o guardar en
   PDF con cada punto que revisó la rúbrica, cumplido o no, con su
   explicación, y la conversación con el asistente (`src/reporte.js`).

> En Render hay que definir `CLAVE_DOCENTE`. Con la clave por defecto
> (`cambiame`), cualquiera podría entrar al panel y falsificar comprobantes.
>
> Para el asistente, define también `ANTHROPIC_API_KEY` (una llave de
> console.anthropic.com con saldo). Sin ella el asistente no aparece aunque
> esté prendido, y el panel lo avisa. Cada pregunta cuesta alrededor de
> 0.015 USD.

## Correr y verificar

```bash
npm start            # suelto, en http://localhost:3000
npm run verificar    # bancos, rúbricas y laboratorios
```

El módulo no tiene dependencias de npm, así que Render lo monta sin instalar
nada. Los datos se guardan en `data/` o en `DATA_DIR`.

`npm run verificar` comprueba que:
- los bancos de los simulacros tienen 5 casos y 25 preguntas; un banco con
  `export const REGLAS` usa las suyas (el del final debe declararlas: 8 casos ×
  5 preguntas, 50 minutos);
- la clave está balanceada y no se filtra;
- cada opción tiene su retro;
- en cada laboratorio, la solución da 100 y la cuenta inicial da casi 0, con
  los minutos y el número de tareas que pide su tipo;
- la rúbrica califica bien unos 30 escenarios de errores típicos para cinco alumnos distintos;
- el catálogo de repaso (`src/repaso.js`) sale solo de la Ruta
  (`curso-aws-practitioner/public/contenido.js`) y las láminas que usan las
  referencias de octubre siguen ahí;
- las pruebas del modelo de la consola (`src/pruebas/`);
- una prueba de humo del servidor: todas las rutas del alumno y del panel en
  todas las evaluaciones, también las que siguen en preparación (avisos, no fallas).

## Estructura

```
src/
  servidor.js, almacen.js, firma.js   API, almacén JSON y comprobantes firmados (HMAC)
  evaluaciones.js                     las evaluaciones, su tipo y su configuración por omisión
  repaso.js                           dónde repasar cada punto (derivado de la Ruta AWS)
  calificar.js, estadisticas.js       rúbrica + avance del reloj; resúmenes del panel
  teoria/                             bancos teóricos (casos, preguntas, retro por opción)
  rubricas/                           una rúbrica por laboratorio (solo vive en el servidor)
public/
  index.html, app.js, estilos.css     lado del alumno
  docente.html, docente.js            panel docente
  labs/                               definición pública de cada laboratorio (sin rúbrica)
  consola/                            la consola simulada
    modelo.js                         estado de la cuenta y acciones (puro: lo usa el servidor)
    red.js                            ¿abre la página? y el System log (puro)
    consola.js, ui.js, consola.css    marco y componentes (ver NUCLEO.md)
    modelo/                           un archivo por servicio nuevo (RDS, ELB, CloudWatch…)
    servicios/                        las pantallas de cada servicio
```

- `DISENO.md` tiene los contratos entre las piezas: estado, consola,
  laboratorios, bancos y API. `SIMULADOR.md`, los del simulador de noviembre.
- `public/consola/NUCLEO.md` explica cómo agregar un servicio a la consola.
