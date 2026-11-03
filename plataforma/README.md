# Plataforma de la materia — Cómputo en la Nube

Un solo servidor que corre en tu laptop y reúne todo el material del curso.
Los alumnos se conectan al Wi-Fi del salón, escanean un QR y les abre el índice
de la materia. **Una sola dirección para todo el semestre.**

No necesita internet: todo se sirve desde tu máquina.

## La primera vez

Instala las dependencias de la plataforma **y las de cada módulo que sea un
servidor** (el examen lo es; las presentaciones y los cursos *Comprender la
computación en la nube* y *Ruta AWS Cloud Practitioner* no necesitan nada):

```powershell
cd plataforma
npm install

cd ..\examen-diagnostico
npm install
```

Necesitas **Node 22 o más nuevo** (`node -v` para revisar).

## En el salón

```powershell
cd plataforma
npm start
```

Al arrancar te imprime la dirección que deben abrir los alumnos:

```
──────────────────────────────────────────
  Cómputo en la Nube
──────────────────────────────────────────
  Los alumnos abren:
    → http://192.168.4.254:3000

  Para proyectar el QR:  http://localhost:3000/proyectar
──────────────────────────────────────────
  ✓ Examen diagnóstico
  ✓ IaaS, PaaS y SaaS
──────────────────────────────────────────
```

Abre `/proyectar` en el proyector los primeros dos minutos de clase: sale el QR
en grande, la dirección escrita y **cuántos dispositivos ya se conectaron**, para
que sepas cuándo empezar en lugar de preguntar "¿ya todos?".

La tecla `F` pone la pantalla de proyección en pantalla completa, igual que en la
presentación.

## El tablero del docente

`/docente` (en el pie del índice hay un enlace discreto, «Docente») junta en una
sola página lo que antes estaba repartido en el panel de cada módulo. Se entra
con la misma clave `CLAVE_DOCENTE`; al entrar, los paneles de los módulos ya no
la vuelven a pedir en esa pestaña (ni en las que abras desde el tablero). «Salir»
la borra.

- **Abierto ahora:** todo lo que los alumnos pueden contestar en este momento
  (simulacros, laboratorios, el examen de una sesión de la Ruta, la práctica
  final…), con un botón «Cerrar» en cada cosa. Cerrar pide confirmación, como en
  los paneles.
- **Módulos:** una tarjeta por módulo con sus números y sus interruptores
  (abrir la parte teórica o la práctica, el asistente de IA, la sesión de hoy…).
  Los grupos se pliegan, y «Buscar» encuentra «sesión 6» o «simulacro» sin
  recorrer todo. «Abrir panel completo» lleva al panel detallado del módulo.
- **Lo que ven los alumnos:** cada tarjeta del índice con su interruptor
  «Visible / Oculta», por sección o todo a la vez. Ocultar solo la quita del
  índice: no borra nada y la dirección directa sigue abriendo (así puedes
  probar un módulo antes de enseñarlo). Se guarda en `DATA_DIR/plataforma/indice.json`
  (o en `plataforma/data/` si no hay `DATA_DIR`).

Se actualiza solo cada 20 segundos mientras la pestaña está a la vista.

El tablero no sabe nada de cada módulo: le pide a cada módulo `express` su
`GET /m/<id>/api/docente/tablero` (indicadores y controles ya armados) y le
manda los cambios con `PUT` al mismo lugar, que usa la misma lógica que su
panel. Un módulo que no tenga esa ruta sale como «sin controles», solo con su
enlace al panel.

## Cómo se acomoda

```
Computo en la nube/
├─ plataforma/                  ← esto
├─ presentacion-iaas-paas-saas/ ← carpeta hermana
├─ presentacion-virtualizacion/ ← carpeta hermana
├─ curso-comprender-nube/       ← carpeta hermana
├─ curso-aws-practitioner/      ← carpeta hermana
├─ recurso-viaje-paquete/       ← carpeta hermana (sección «Recursos didácticos»)
├─ recurso-donde-guardo/        ← carpeta hermana (sección «Recursos didácticos»)
├─ recurso-donde-apunto/        ← carpeta hermana (sección «Recursos didácticos»)
├─ recurso-hora-pico/           ← carpeta hermana (sección «Recursos didácticos»)
├─ recurso-cuanto-cuesta/       ← carpeta hermana (sección «Recursos didácticos»)
└─ examen-diagnostico/          ← carpeta hermana
```

La plataforma lee a sus vecinas por ruta relativa. No copia nada: si editas la
presentación, el cambio se ve al recargar.

## Agregar material nuevo

Todo vive en `curso.js`. Pon la carpeta como hermana de `plataforma/` y agrega
un objeto:

```js
{
  id: 'seguridad',                   // se vuelve la dirección /m/seguridad
  titulo: 'Seguridad en la nube',
  resumen: 'Una línea que le dice al alumno qué es esto.',
  etiqueta: 'Presentación',          // la pastilla amarilla de la tarjeta
  tipo: 'estatico',
  ruta: '../presentacion-seguridad'
}
```

Tres tipos:

| `tipo` | Para qué | Qué necesita la carpeta |
|---|---|---|
| `estatico` | Una presentación o cualquier sitio de archivos | Un `index.html` |
| `express` | Un proyecto Node con su propio servidor | Un `app.js` que exporte `crearApp()` |
| `enlace` | Algo que vive fuera (Classroom, un video) | Nada; pon `url: 'https://…'` |

Un módulo con `seccion: 'Recursos didácticos'` sale en el índice bajo ese título,
después de las clases. Ahí van los apoyos sueltos (animaciones, simuladores) que
no son una clase completa.

Un módulo puede verse como **varias tarjetas** con `accesos`: cada una entra a
una parte distinta del módulo (`ruta: '#/simulacro-1'`) y puede ir en su propia
sección. Así la evaluación muestra el **Simulador AWS** en su sección
(«Simulador AWS») y los simulacros en «Evaluación»:

```js
accesos: [
  { titulo: 'Simulador AWS', resumen: '…', ruta: '#/simulador', seccion: 'Simulador AWS' },
  { titulo: 'Simulacro 1', etiqueta: 'Martes 20 de octubre', resumen: '…', ruta: '#/simulacro-1' }  // sin seccion: la del módulo
]
```

Las secciones salen en el orden en que aparecen por primera vez en `curso.js`.

No hay que reiniciar para cambiar contenido de una presentación, pero **sí** para
que `curso.js` se vuelva a leer.

## Si un módulo no carga

La plataforma no se cae: arranca igual, marca el módulo con `✗` en la terminal y
en el índice del alumno sale una tarjeta gris con el motivo. Así en plena clase
sabes qué falta en vez de ver una pantalla en blanco.

El motivo más común es que nunca corriste `npm install` dentro de esa carpeta.

## Lo que puede salir mal en el salón

**1. El Wi-Fi de la escuela aísla a los clientes.** Es el problema más probable.
Muchas redes institucionales prohíben que un dispositivo hable con otro, y
entonces nadie alcanza tu laptop aunque todo esté bien configurado.

Pruébalo **antes** de la clase: conecta tu teléfono al mismo Wi-Fi y abre la
dirección. Si no abre, el plan B es levantar una zona Wi-Fi desde tu laptop
(Configuración → Red → Zona con cobertura inalámbrica móvil) y que los alumnos se
conecten ahí.

**2. El firewall de Windows.** La primera vez que corras `npm start`, Windows
pregunta si permites que Node acepte conexiones. Hay que aceptar **Redes
privadas**. Si le diste "Cancelar" alguna vez, la regla se crea así (PowerShell
como administrador, una sola vez):

```powershell
New-NetFirewallRule -DisplayName "Plataforma Cómputo en la Nube" `
  -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

**3. La IP cambia de un día a otro.** El Wi-Fi de la escuela reparte direcciones
dinámicas, así que la de hoy puede no ser la de mañana. Por eso el QR se genera
al arrancar y nunca se escribe a mano: proyéctalo cada clase y ya.

## Variables de entorno

| Variable | Para qué | Por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `MATERIA` | Título del índice | El de `curso.js` |
| `DOCENTE` · `GRUPO` | Salen bajo el título | Los de `curso.js` |
| `CLAVE_DOCENTE` | La clave del tablero `/docente` y de los paneles de cada módulo | `cambiame` |
| `DATA_DIR` | Dónde guardan sus datos los módulos y la plataforma | La carpeta `data/` de cada uno |

En PowerShell se definen así antes de arrancar:

```powershell
$env:CLAVE_DOCENTE = "loquesea"
npm start
```

## Esta plataforma es el ejemplo de la materia

Vale la pena decírselo a los alumnos en voz alta: **el mismo software, corrido de
cuatro maneras, son los cuatro modelos del curso.**

| Cómo se corre | Qué modelo es | Quién administra qué |
|---|---|---|
| `npm start` en tu laptop | **On-premises** | Tú: la máquina, la red, el respaldo, la luz |
| Dentro de un contenedor | Lo que hay debajo de **IaaS** | Tú el sistema; el proveedor el fierro |
| Subida a Render | **PaaS** | Tú solo el código |
| Comparada con Classroom | **SaaS** | Tú nada; solo la usas |

Cuando se va la luz en el salón y la página deja de abrir, esa es la clase de
on-premises mejor aprendida del semestre.

## Qué NO hace todavía

Esta es la primera etapa. Falta:

- **Sesión en vivo:** que tú cambies de módulo y las pantallas de los alumnos
  salten solas, sin dictar nada.
- **Entregas y asistencia:** que el alumno suba su captura desde aquí.
