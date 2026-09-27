# Ruta AWS Cloud Practitioner

Una ruta de 8 sesiones para que el grupo termine la materia listo para la
certificación **AWS Certified Cloud Practitioner (CLF-C02)**, aprovechando el
sandbox de AWS de DataCamp. Cada sesión combina lecciones cortas, ejercicios con
XP, un **laboratorio guiado paso a paso en la consola de AWS** y un examen de
práctica al estilo de la certificación.

Es el mismo motor, diseño e interacción del curso *Comprender la computación en
la nube* (`../curso-comprender-nube`), con dos piezas nuevas:

- **Laboratorios.** Cada paso dice exactamente dónde hacer clic (con los botones
  de la consola en inglés, como los ve el alumno), trae un recuadro de “Deberías
  ver” y un “¿Algo salió mal?” con las fallas comunes. El alumno marca “Ya lo
  hice” y el docente ve en vivo en qué paso va cada quien.
- **Contador del sandbox.** Arranca solo al llegar al primer paso que necesita el
  sandbox y se detiene al terminar el laboratorio. Lleva los minutos de la semana
  y los traduce a tokens (10 000 tokens ≈ 330 minutos, la cuenta del docente).
  Es una estimación local: la cifra real está en el panel del sandbox de
  DataCamp.

Dentro de la plataforma vive en `/m/aws-practitioner/`; el panel del docente, en
`/m/aws-practitioner/docente` (misma `CLAVE_DOCENTE` que los demás paneles).

## Estado de la ruta

| Sesión | Tema | Sandbox | Estado |
|---|---|---|---|
| 1 | Tu primera máquina en AWS: infraestructura global, EC2 y sus precios | ≈ 45 min | **Lista** |
| 2 | Identidad y seguridad: IAM, MFA, responsabilidad compartida | ≈ 40 min | Pendiente |
| 3 | Redes: VPC, subredes, tablas de rutas, grupos de seguridad y NACL, Route 53, CloudFront | ≈ 60 min | Pendiente |
| 4 | Almacenamiento: S3, sitio estático, EBS, EFS, Glacier | ≈ 45 min | Pendiente |
| 5 | Bases de datos: RDS, Aurora, DynamoDB, ElastiCache, Redshift | ≈ 60 min | Pendiente |
| 6 | Escalar y automatizar: ELB, Auto Scaling, CloudWatch, Lambda, SNS y SQS | ≈ 60 min | Pendiente |
| 7 | Costos, soporte y buenas prácticas: calculadora, Budgets, Organizations, Well-Architected | ≈ 20 min | Pendiente |
| 8 | Simulacro completo de 65 preguntas | — | Pendiente |

Con 330 minutos de sandbox a la semana, cada sesión deja tiempo de sobra para
repetir el laboratorio en casa.

## Sesión 1: Tu primera máquina en AWS (2 horas)

| Minutos | Bloque | Sandbox |
|---|---|---|
| 0:00 – 0:05 | Arranque y registro | Apagado |
| 0:05 – 0:37 | Capítulo 1: el examen, el sandbox, regiones y zonas, las seis piezas de EC2, precios | Apagado |
| 0:37 – 1:32 | Capítulo 2: laboratorio de 15 pasos; servidor web en EC2, terminal con EC2 Instance Connect, Stop y Terminate | **Encendido ≈ 45 min** |
| 1:32 – 1:40 | Capítulo 3: hoja de repaso y verdadero o falso | Apagado |
| 1:40 – 1:57 | Examen de práctica: 20 preguntas estilo CLF-C02, con reporte PDF | Apagado |
| 1:57 – 2:00 | Cierre | — |

## Antes de dar la sesión 1

**Haz el laboratorio una vez en tu sandbox.** No pude verificar desde fuera qué
permite el sandbox de DataCamp (región, tipos de instancia, EC2 Instance
Connect): sus páginas de ayuda no son públicas. La guía está escrita para
adaptarse (“quédate en la región que te abrió”, “elige la que diga Free tier
eligible”, qué hacer si sale *AccessDenied*), pero conviene confirmarlo tú en
unos 30 minutos de sandbox. Si algo difiere, se corrige el paso en
`public/contenido.js`.

## Correr y editar

Como el otro curso, **no tiene dependencias de npm**: se monta en la plataforma
sin `npm install` y sin tocar el build de Render.

```powershell
cd curso-aws-practitioner
$env:CLAVE_DOCENTE = "loquesea"
npm start            # suelto, en http://localhost:3000
npm run verificar    # revisa ejercicios, laboratorios, examen y tiempos
```

- Lecciones, ejercicios, laboratorios, la ruta y el plan: `public/contenido.js`.
  Los números del sandbox están en `SANDBOX`, al principio.
- Examen de práctica: `src/practica.js` (misma estructura del otro curso:
  `correcta`, `explicacion`, `concepto` y el mapa `REPASO`).
- Los datos se guardan en `data/aws-practitioner.json`. En Render el disco es
  efímero: descarga el CSV antes de salir del salón.

## Fuentes

- Guía oficial del examen AWS Certified Cloud Practitioner (CLF-C02): 65
  preguntas (50 con calificación y 15 sin ella), 90 minutos, 700 de 1000 para
  aprobar y los cuatro dominios con sus pesos.
- Sandbox de DataCamp: los tokens se renuevan cada semana, corre una sesión a la
  vez y se reinicia al cerrar la pestaña o tras un rato de inactividad.
