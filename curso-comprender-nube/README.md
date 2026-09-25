# Comprender la computación en la nube — curso guiado de 2 horas

Un curso en línea al estilo de los de DataCamp, pensado para darse **en vivo en
una clase de dos horas**: el docente proyecta las lecciones y cada alumno
resuelve los ejercicios en su celular, ganando XP. Al final, una **práctica con
un caso** valida que el grupo entendió los conceptos básicos de la nube, y el
docente ve las calificaciones en un panel.

- `/` — el curso del alumno (registro, 3 capítulos, 30 actividades, práctica final)
- `/docente` — panel del docente: plan de la clase con cronómetro, avance en vivo
  y resultados de la práctica
- `/?proyectar=1` — el curso para la computadora del salón: no pide registro, no
  guarda avance y muestra las notas del docente con la tecla `N`

Dentro de la plataforma todo cuelga de `/m/comprender-nube/`.

## Qué trae

| Capítulo | Lecciones | Ejercicios |
|---|---|---|
| 1 · Introducción a la computación en la nube | Qué es la nube (NIST, CapEx contra OpEx) · El poder de la nube (escalar, elasticidad, disponibilidad, velocidad) · Modelos de servicio | Valor de la nube · Soluciones escalables · Velocidad del mercado · Aumento del tráfico · Mejor modelo · Identificar una empresa SaaS |
| 2 · Implementación en la nube | Modelos de despliegue (pública, privada, híbrida, multinube) · Normativa (LFPDPPP 2025, RGPD, datos sensibles, ARCO, plazos de conservación, responsabilidad compartida) · Roles de un equipo de nube | ¿Privado o público? · Elige el mejor modelo · Límites temporales de los datos · Datos personales · ¿De quién es la responsabilidad? · Funciones en la nube |
| 3 · Proveedores y casos prácticos | Panorama y dependencia del proveedor · AWS (caso Netflix) · Azure · Google Cloud (caso Spotify) · ¡Enhorabuena! | Los tres grandes · Riesgo de dependencia · Caso Netflix · ¿Qué servicio elegir? · Caso Spotify · ¿Verdadero o falso? · Los proveedores y sus servicios |

**Práctica final:** “Panaderías Doña Rosca”, una cadena ficticia de Querétaro
que se cae cada Día de Reyes y quiere mudarse a la nube. Son 20 preguntas en
5 temas (4 por tema), unos 20 minutos y una sola entrega. Se califica en el
servidor: las respuestas correctas nunca llegan al navegador del alumno.

Los ejercicios del curso sí se revisan en el navegador, a propósito: son
práctica con retroalimentación inmediata, igual que en DataCamp. Valen 50 o
100 XP; pedir pista quita 30 % y cada intento fallido 20 % (mínimo 10 %). Tras
dos fallos aparece “Ver la respuesta”, para que nadie se atore en clase.

## Plan de la clase (2 horas)

| Minutos | Bloque | Qué pasa |
|---|---|---|
| 0:00 – 0:07 | Arranque | QR de la plataforma, registro, pregunta detonadora |
| 0:07 – 0:36 | Capítulo 1 | Proyectas cada lección; ejercicios individuales de 2–3 min |
| 0:36 – 1:05 | Capítulo 2 | Despliegue, normativa y roles |
| 1:05 – 1:34 | Capítulo 3 | Proveedores, casos Netflix y Spotify |
| 1:34 – 1:55 | Práctica final | La abres desde el panel; cada quien contesta en su celular |
| 1:55 – 2:00 | Cierre | Repaso proyectado de las preguntas más falladas, sin nombres |

El detalle (qué preguntar en cada bloque y qué vigilar) está en la pestaña
**Plan de la clase** del panel, con un cronómetro que resalta el bloque actual.
Las notas de cada lámina salen con la tecla `N` en modo proyector.

## Antes de la clase

1. **Define `CLAVE_DOCENTE`.** Es la misma variable del examen diagnóstico: una
   sola clave para los dos paneles. Sin ella, la clave es `cambiame`.
2. **Abre el panel en tu celular**, no en la laptop que proyectas: muestra nombres
   y calificaciones. Si proyectas en modo duplicado, el grupo lo vería.
3. **Prueba el curso en tu teléfono** con el Wi-Fi del salón (los mismos problemas
   de red que describe el README de la plataforma aplican aquí).
4. **La práctica arranca cerrada.** Los alumnos ven la tarjeta con candado hasta
   que la abres en la pestaña *Práctica final*. Al cerrarla, nadie más puede
   entregar; si alguien tuvo un problema real, “Permitir reintento” borra su
   entrega y lo deja contestar de nuevo.

## En el salón

Con la plataforma (lo normal):

```powershell
cd plataforma
npm start
```

El curso aparece como una tarjeta más del índice. **No hay que correr
`npm install` en esta carpeta:** el módulo no tiene dependencias.

Solo, sin la plataforma:

```powershell
cd curso-comprender-nube
$env:CLAVE_DOCENTE = "loquesea"
npm start
# http://localhost:3000  y  http://localhost:3000/docente
```

Teclas en las lecciones: `→` o `Espacio` siguiente · `←` anterior · `F` pantalla
completa · `N` notas del docente (modo proyector). Con el control de
presentaciones (`PageDown`), si la lámina no cabe en la pantalla, el primer clic
baja a lo que falta y el siguiente avanza.

## Los datos

Todo se guarda en `data/comprender-nube.json` (la carpeta está en el
`.gitignore`): quién se registró, qué actividades completó y su entrega de la
práctica. El avance de cada alumno vive además en su navegador y se vuelve a
mandar con cada movimiento, así que si el servidor se reinicia se reconstruye
solo.

- Si un alumno entra desde dos celulares, el panel lo muestra una sola vez (se
  reconoce por la matrícula o, si no la dio, por su nombre dentro del grupo) y no
  puede entregar la práctica dos veces.
- Al entregar, el alumno ve un **comprobante con folio**. Pídeles captura: si
  algo le pasa al servidor, esa captura es la evidencia.
- **El aviso de privacidad del registro promete que borras los datos al cerrar el
  ciclo escolar.** Hazlo con “Borrar los datos del grupo” en el panel, después
  de descargar el CSV.

**En Render (plan gratis) el disco es efímero:** el archivo se borra en cada
redespliegue y cuando el servicio se duerme tras 15 minutos sin tráfico.
Durante la clase no pasa porque hay tráfico, pero **descarga el CSV antes de
salir del salón** y no dejes la práctica abierta como tarea para otro día.

## Variables de entorno

| Variable | Para qué | Por defecto |
|---|---|---|
| `CLAVE_DOCENTE` | Clave del panel (la misma del examen) | `cambiame`, con aviso en el panel |
| `RETROALIMENTACION` | Qué ve el alumno al entregar: `resumen` (calificación y temas), `completo` (además, cada pregunta con la respuesta correcta y su explicación) o `nada` | `resumen` |
| `DATA_DIR` | Carpeta del archivo de datos | `./data` |
| `ZONA_HORARIA` | Hora de entrega en el CSV | `America/Mexico_City` |
| `PORT` | Puerto, solo al correrlo suelto | `3000` |
| `MATERIA` | Nombre de la materia | Cómputo en la Nube |

`completo` sirve si no vas a aplicar la misma práctica a otro grupo; si sí, deja
`resumen` y usa el repaso proyectado del panel para explicar las respuestas.

## Editar el contenido

- **Lecciones y ejercicios:** `public/contenido.js`. Cada actividad es un objeto
  con `tipo` (`leccion`, `opcion` o `clasificar`), `xp` y `minutos`. Las láminas
  llevan `html` y `notas` para el docente. Los cambios se ven al recargar.
- **Práctica final:** `src/practica.js`. Cada pregunta lleva `correcta` (índice
  desde 0) y `explicacion`, que sale en el repaso del panel. `fijo: true` deja
  las opciones en su orden (sirve cuando son categorías como IaaS, PaaS, SaaS);
  en las demás, cada alumno las ve en otro orden para que copiar la letra no
  sirva.
- **Plan de la clase:** `PLAN`, al final de `public/contenido.js`.

Después de cualquier cambio:

```powershell
npm run verificar
```

Revisa que la clave de la práctica siga balanceada (5 respuestas por letra, sin
rachas y sin que la correcta sea siempre la más larga), que cada ejercicio tenga
solución y retroalimentación, y que los minutos de cada capítulo quepan en su
bloque del plan.

Si cambias `src/practica.js` o `app.js`, reinicia el servidor; los archivos de
`public/` no lo necesitan.

## Por qué no usa Express

La plataforma, desplegada en Render, solo instala las dependencias de
`plataforma/` y de `examen-diagnostico/`. Un módulo sin dependencias se monta
ahí sin tocar la configuración del despliegue. `src/servidor.js` trae lo mínimo
(rutas, JSON y archivos estáticos) con la misma cara que Express, y `crearApp()`
devuelve una función que la plataforma monta con `app.use()` como cualquier otro
módulo.

## Estructura

```
app.js               rutas de la API (exporta crearApp)
server.js            arranque cuando el curso corre solo
src/practica.js      caso y banco de la práctica final, y la calificación
src/almacen.js       datos en un archivo JSON, con escritura segura
src/estadisticas.js  promedio, reparto, temas y opciones más elegidas
src/servidor.js      enrutador y archivos estáticos sin dependencias
src/verificar.js     auditoría del curso y de la práctica
public/contenido.js  capítulos, lecciones, ejercicios y plan de la clase
public/app.js        el curso del alumno
public/docente.*     el panel del docente
```

## Fuentes de los datos (verificados en septiembre de 2026)

- Cuotas de mercado: Synergy Research Group, 2.º trimestre de 2026 (AWS 28 %,
  Microsoft 20 %, Google 15 %; 143 400 millones de dólares en el trimestre).
- Definición de nube: NIST SP 800-145 (2011).
- Ley Federal de Protección de Datos Personales en Posesión de los Particulares,
  DOF 20 de marzo de 2025: artículos 2 (definiciones), 8 (consentimiento para
  datos sensibles), 10 (supresión) y 34 (ARCO gratuito).
- Caso Netflix: “Completing the Netflix Cloud Migration”, blog de Netflix,
  febrero de 2016.
- Caso Spotify: Computerworld, “How Spotify migrated everything from on-premise
  to Google Cloud Platform”, julio de 2018.
- Regiones en Querétaro: AWS (enero de 2025), Azure “Mexico Central” (2024),
  Google Cloud (2024).
- Salida de datos sin costo al cambiar de proveedor: anuncios de Google Cloud,
  AWS y Microsoft de 2024, ligados a la *Data Act* europea.
