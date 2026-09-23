# Plataforma de la materia — Cómputo en la Nube

Un solo servidor que corre en tu laptop y reúne todo el material del curso.
Los alumnos se conectan al Wi-Fi del salón, escanean un QR y les abre el índice
de la materia. **Una sola dirección para todo el semestre.**

No necesita internet: todo se sirve desde tu máquina.

## La primera vez

Instala las dependencias de la plataforma **y las de cada módulo que sea un
servidor** (el examen lo es; las presentaciones no necesitan nada):

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

## Cómo se acomoda

```
Computo en la nube/
├─ plataforma/                  ← esto
├─ presentacion-iaas-paas-saas/ ← carpeta hermana
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
| `CLAVE_DOCENTE` | La lee el examen para su panel | `cambiame` |

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
- **Panel docente unificado:** hoy cada módulo trae el suyo.
- **Entregas y asistencia:** que el alumno suba su captura desde aquí.
