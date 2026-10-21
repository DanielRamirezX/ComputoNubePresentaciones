# Evaluación AWS · simulacros y examen práctico

Módulo de la plataforma (sección **Evaluación**, montado en `/m/evaluacion/`)
con las evaluaciones de la Ruta AWS. Los temas son los de las sesiones 1 a 4:
fundamentos y EC2, identidad y seguridad, redes y almacenamiento.

| Evaluación | Fecha | Parte teórica | Parte práctica |
|---|---|---|---|
| Simulacro 1 | martes 20 de octubre de 2026 | 5 casos de negocio, 25 preguntas, 45 min | «La cafetería El Grano de Oro»: construir desde cero |
| Simulacro 2 | viernes 23 de octubre de 2026 | 5 casos **distintos**, 25 preguntas, 45 min; más sencilla que la del simulacro 1 | «Veterinaria Patitas»: diagnosticar y reparar, con pistas generales (sin la ruta de clics) |
| Examen bimestral | martes 27 de octubre de 2026 | — (la aplica el docente) | «Ferretería Don Beto»: mixto y sin pistas; la subred privada es bono opcional (máx. 100) |

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

## Cómo se usa en clase

1. Abre el **panel docente**: `…/m/evaluacion/docente`. También hay un botón en
   el panel de la Ruta AWS. La clave es la misma `CLAVE_DOCENTE` de los otros paneles.
2. Elige la evaluación y activa los interruptores **Parte teórica** y **Parte
   práctica**. Mientras estén cerrados, los alumnos ven la tarjeta con candado.
3. Opciones de cada evaluación:
   - **Retroalimentación al entregar:** completa, que muestra qué hicieron
     bien y qué no con su explicación, o solo la calificación. Por omisión es
     completa en los simulacros y solo calificación en el bimestral.
   - **«Revisar mi avance»:** deja que el alumno califique su laboratorio a
     medio camino. Viene activado en los simulacros y apagado en el bimestral.
4. Los alumnos entran desde la tarjeta de la sección Evaluación de la plataforma.
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
   Aun así, el CSV es tu respaldo.

> En Render hay que definir `CLAVE_DOCENTE`. Con la clave por defecto
> (`cambiame`), cualquiera podría entrar al panel y falsificar comprobantes.

## Correr y verificar

```bash
npm start            # suelto, en http://localhost:3000
npm run verificar    # bancos, rúbricas y laboratorios
```

El módulo no tiene dependencias de npm, así que Render lo monta sin instalar
nada. Los datos se guardan en `data/` o en `DATA_DIR`.

`npm run verificar` comprueba que:
- los dos bancos tienen 5 casos y 25 preguntas;
- la clave está balanceada y no se filtra;
- cada opción tiene su retro;
- en los tres laboratorios, la solución da 100 y la cuenta inicial da 0;
- la rúbrica califica bien unos 30 escenarios de errores típicos para cinco alumnos distintos.

## Estructura

```
src/
  servidor.js, almacen.js, firma.js   API, almacén JSON y comprobantes firmados (HMAC)
  evaluaciones.js                     las 3 evaluaciones y su configuración por omisión
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
    servicios/                        EC2, VPC, S3 e IAM
```

- `DISENO.md` tiene los contratos entre las piezas: estado, consola,
  laboratorios, bancos y API.
- `public/consola/NUCLEO.md` explica cómo agregar un servicio a la consola.
