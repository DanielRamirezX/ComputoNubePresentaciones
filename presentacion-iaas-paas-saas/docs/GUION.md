# Guion — “IaaS, PaaS y SaaS: la nube explicada fácil”

Textos definitivos por diapositiva. Tono: cercano, en segunda persona (“tú”), frases cortas.
Datos verificados en septiembre de 2026. **No cambies cifras, nombres de servicios ni el sentido.**

Formato de cada ficha:
- **Texto**: lo que aparece en pantalla.
- **Visual / animación**: propuesta; el agente puede mejorarla si conserva la idea.
- **Notas**: van en `<aside class="notes">` (solo las ve el docente con la tecla N).

Código de colores fijo: On-premises gris · IaaS azul · PaaS verde · SaaS coral · “Tú” amarillo.

---

# SECCIÓN 0 — Inicio  (archivo `src/slides/00-inicio.html`, prefijo `s0-`)

## 0.1 `s0-portada` — Portada  · data-bg="amarillo" o papel con mucho amarillo
**Texto**
- Etiqueta superior: Cómputo en la Nube
- Título: IaaS, PaaS y SaaS
- Subtítulo: La nube explicada fácil: quién hace qué, quién paga qué y por dónde empezar.
- Pie pequeño: Pulsa → o la barra espaciadora para avanzar

**Visual / animación**: nubes SVG que se desplazan lento al fondo; tres bloques apilados con las
etiquetas IaaS (azul), PaaS (verde) y SaaS (coral) caen uno sobre otro con un pequeño rebote.
Nubi saluda desde una esquina con el globo: “¡Hola! Hoy te explico la nube sin palabras raras.”

**Notas**: Presenta el tema. Pregunta al grupo: “¿Quién ha usado ‘la nube’ esta semana?” y deja que
levanten la mano. Casi todos lo han hecho sin saberlo (Gmail, Drive, Netflix).

## 0.2 `s0-agenda` — Lo que vas a aprender hoy
**Texto**
- Título: Lo que vas a aprender hoy
- Lista (cada punto es un paso, con icono y número):
  1. Qué es la nube, sin tecnicismos.
  2. Los tres modelos de servicio: IaaS, PaaS y SaaS, y cómo distinguirlos.
  3. Los tres proveedores más grandes: AWS, Microsoft Azure y Google Cloud.
  4. Cómo se ve la IaaS en cada uno de ellos.
  5. Actividad práctica: tu cuenta de AWS Educate.
- Recuadro **Recuerda**: No necesitas saber programar para entender esta clase. Si sabes rentar un
  departamento o pedir un cuarto de hotel, ya tienes la mitad del camino.

**Notas**: Aclara que la clase termina con una actividad práctica y una tarea en AWS Educate.

## 0.3 `s0-que-es` — ¿Qué es la nube?
**Texto**
- Título: ¿Qué es la nube?
- Frase grande: La nube son **computadoras de alguien más** que tú rentas por internet.
- Tres ideas (pasos):
  1. Viven en **centros de datos** enormes, repartidos por el mundo.
  2. Las usas **a través de internet**, sin tocarlas nunca.
  3. **Pagas por lo que usas**, como la luz o el agua.
- Recuadro **Consejo**: Piensa en la luz eléctrica: no construyes tu propia planta de energía;
  conectas tu aparato y pagas lo que consumes. La nube hace lo mismo con las computadoras.
- Recuadro **Cosas técnicas**: La definición más citada (NIST, 2011) dice que un servicio de nube
  tiene cinco rasgos: autoservicio bajo demanda, acceso amplio por red, recursos compartidos,
  elasticidad rápida y servicio medido.

**Visual / animación**: una laptop a la izquierda, un centro de datos (racks) a la derecha y en
medio una nube; “paquetes” de datos viajan de ida y vuelta por una línea punteada animada.

**Notas**: Insiste en que “la nube” no es algo etéreo: son edificios reales llenos de servidores,
con electricidad, enfriamiento y seguridad. Lo nuevo es la forma de usarlos: rentados y por internet.

## 0.4 `s0-antes` — Antes de la nube, todo era tuyo
**Texto**
- Título: Antes de la nube, todo era tuyo
- Entrada: Si una empresa quería un sistema o una página web, compraba sus propios servidores y
  se encargaba de **todas** estas capas:
- Torre de 9 capas (de arriba hacia abajo), cada una con nombre y explicación corta:
  1. **Aplicación** — el programa que usan las personas.
  2. **Datos** — la información que guardas.
  3. **Entorno de ejecución** (runtime) — lo que tu código necesita para correr: Node.js, Java, Python…
  4. **Middleware** — programas intermedios: servidor web, conectores, colas de mensajes.
  5. **Sistema operativo** — Windows o Linux.
  6. **Virtualización** — dividir una computadora física en varias “virtuales”.
  7. **Servidores** — las computadoras físicas.
  8. **Almacenamiento** — los discos donde vive la información.
  9. **Red** — cables, switches y la conexión a internet.
- A un lado, “y además…”: el edificio, la luz, el aire acondicionado y la seguridad.
- Problemas (pasos):
  - 💸 Cuesta mucho dinero antes de empezar. (usa icono SVG, no emoji)
  - 🐢 El equipo tarda semanas en llegar e instalarse.
  - 📈 Si llega mucha gente, el sistema se cae.
  - 📉 Si llega poca, pagaste por equipo que no usas.
- Recuadro **Recuerda**: A este modelo se le llama **on-premises** (u “on-prem”): todo vive en tus
  propias instalaciones y todo es tu responsabilidad.

**Visual / animación**: la torre se arma capa por capa desde abajo (estilo Jenga), toda en amarillo
(“tú”). Un personaje pequeño corre de una capa a otra, agobiado.
**Importante**: esta misma torre de 9 capas, con los mismos nombres y el mismo orden, se reutiliza
en la sección 1 (diapositiva interactiva). La sección 1 la redibuja por su cuenta.

**Notas**: Pregunta: “¿Qué pasa con la página de inscripciones de la escuela el primer día?” (se cae
por exceso de visitas). Ese es el problema de dimensionar servidores propios.

---

# SECCIÓN 1 — Los tres modelos  (archivo `src/slides/10-modelos.html`, prefijo `s1-`)

## 1.1 `s1-vivienda` — La nube es como buscar dónde vivir
**Texto**
- Título: La nube es como buscar dónde vivir
- Cuatro tarjetas (una por paso), cada una con “Tú te encargas de” y “Ellos se encargan de”:
  1. **Construir tu casa → On-premises**
     Tú: terreno, obra, luz, agua, muebles, limpieza y reparaciones. Ellos: nada.
     Frase: Control total, pero todo el trabajo y todo el gasto son tuyos.
  2. **Rentar un departamento vacío → IaaS**
     Ellos: el edificio, la estructura, la luz y el agua. Tú: muebles, decoración, limpieza y tus cosas.
     Frase: Te dan el espacio; tú lo equipas a tu gusto.
  3. **Rentar un departamento amueblado → PaaS**
     Ellos: el edificio, los muebles y la cocina equipada. Tú: traes tus cosas y vives.
     Frase: Llegas con tu maleta y listo.
  4. **Hospedarte en un hotel → SaaS**
     Ellos: todo, hasta tender la cama. Tú: solo usas la habitación.
     Frase: Llegas, usas y te vas.
- Al final (paso): una flecha de doble sentido debajo de las tarjetas:
  “Más control ⟵ ⟶ Menos trabajo”.

**Visual / animación**: cada tarjeta con una ilustración SVG simple (casa en obra, departamento vacío,
departamento con sofá, cama de hotel con toallas) y el color de su modelo en el borde.

**Notas**: Esta analogía es la base de toda la clase. Pregunta: “¿Cuál conviene a un estudiante que
se muda por un semestre? ¿Y a una familia que se queda 30 años?” No hay una opción mejor: depende
de cuánto control quieres y cuánto trabajo aceptas.

## 1.2 `s1-stack` — ¿Quién se encarga de qué?  (diapositiva estrella, interactiva)
**Texto**
- Título: ¿Quién se encarga de qué?
- Subtítulo: Las mismas 9 capas, cuatro formas de repartir el trabajo.
- Pestañas: On-premises · IaaS · PaaS · SaaS (clic para cambiar; con el teclado, cada paso avanza
  a la siguiente pestaña).
- Leyenda: ■ amarillo = Tú administras · ■ color del modelo = El proveedor administra
- Contador grande que cambia con animación: “Tú administras **9 de 9** capas” → 5 de 9 → 2 de 9 → 0 de 9.
- Reparto exacto (de arriba hacia abajo: Aplicación, Datos, Runtime, Middleware, Sistema operativo,
  Virtualización, Servidores, Almacenamiento, Red):
  - On-premises: tú las 9.
  - IaaS: tú Aplicación, Datos, Runtime, Middleware, Sistema operativo; el proveedor Virtualización,
    Servidores, Almacenamiento, Red.
  - PaaS: tú Aplicación y Datos; el proveedor las otras 7.
  - SaaS: el proveedor las 9.
- Recuadro **Cuidado** (aparece con SaaS): Aun en SaaS, **tus datos, tus contraseñas y quién tiene
  acceso** siguen siendo tu responsabilidad.

**Visual / animación**: las capas cambian de amarillo al color del modelo con un giro/volteo en
cascada de abajo hacia arriba. Una línea punteada marca la frontera “tú / proveedor” y se desliza.
Debe funcionar con clic en pestañas y con los pasos del teclado (paso 1 = IaaS, 2 = PaaS, 3 = SaaS;
al entrar se muestra On-premises).

**Notas**: Ésta es la diapositiva que más conviene dejar en pantalla. Pide que alguien explique con
sus palabras la diferencia entre IaaS y PaaS usando la línea divisoria.

## 1.3 `s1-iaas` — IaaS: Infraestructura como Servicio
**Texto**
- Etiqueta: IaaS · Infrastructure as a Service
- Título: Te rentan las computadoras; tú instalas todo lo demás
- Qué te dan: máquinas virtuales, discos y redes, listos en minutos.
- Qué haces tú: eliges e instalas el sistema operativo, lo actualizas, instalas tus programas y
  cuidas tus datos.
- Para quién: administradores de sistemas, equipos de infraestructura (DevOps) y cualquiera que
  necesite control total.
- Ejemplos (chips con color de proveedor): Amazon EC2 · Azure Virtual Machines · Google Compute Engine
- Analogía (pequeña, con icono): departamento vacío.
- Recuadro **Cosas técnicas**: Una **máquina virtual (VM)** es una computadora simulada por software
  dentro de una computadora física real. Un solo servidor físico puede alojar muchas VM de clientes
  distintos, aisladas entre sí.

**Visual / animación**: un servidor físico que “se divide” en 3–4 máquinas virtuales de colores
distintos, cada una con su propio mini-logo de sistema operativo genérico (pingüino estilizado no,
usa etiquetas de texto “Linux”, “Windows”).

**Notas**: Resalta que en IaaS el sistema operativo es tuyo: si no instalas actualizaciones de
seguridad, nadie lo hará por ti.

## 1.4 `s1-paas` — PaaS: Plataforma como Servicio
**Texto**
- Etiqueta: PaaS · Platform as a Service
- Título: Tú traes tu código; ellos lo ponen a funcionar
- Qué te dan: un lugar listo para ejecutar aplicaciones: sistema operativo, entorno de ejecución,
  escalado, certificado HTTPS y, muchas veces, base de datos.
- Qué haces tú: escribes tu aplicación y la subes (a veces basta con conectar tu repositorio de GitHub).
- Para quién: desarrolladores que quieren programar, no administrar servidores.
- Ejemplos: Render · Heroku · Google App Engine · AWS Elastic Beanstalk · Azure App Service
- Analogía: departamento amueblado.
- Recuadro **Consejo**: Si alguna vez publicaste una página con “conecta tu repositorio y da clic en
  Deploy”, ya usaste PaaS.

**Visual / animación**: un archivo de código `app.js` cae dentro de una “plataforma” (caja verde) y
del otro lado aparece una ventana de navegador con una URL tipo `mi-app.onrender.com` y un check verde.

**Notas**: Si el grupo usó Render para el examen diagnóstico, menciónalo: es un ejemplo real de PaaS.
Nosotros subimos el código; Render se encargó del servidor, del sistema operativo y del HTTPS.

## 1.5 `s1-saas` — SaaS: Software como Servicio
**Texto**
- Etiqueta: SaaS · Software as a Service
- Título: Solo abres el navegador y lo usas
- Qué te dan: una aplicación completa, lista para usarse, que se actualiza sola.
- Qué haces tú: creas tu cuenta, la configuras y la usas. Nada de instalar ni de mantener.
- Cómo se paga: suscripción mensual o anual, o gratis con límites (modelo *freemium*).
- Para quién: todo el mundo: personas, escuelas y empresas.
- Analogía: hotel.
- Recuadro **Cuidado**: Que sea fácil no significa que no tengas responsabilidades. Una contraseña
  débil o un enlace compartido “con cualquiera” puede exponer tus datos.

**Visual / animación**: una ventana de navegador que se abre con un “login” y un check; alrededor
aparecen iconos de actualización automática (flechas circulares) que giran.

**Notas**: Pregunta: “¿Quién instaló una actualización de Gmail alguna vez?” Nadie: el proveedor
actualiza por todos al mismo tiempo. Eso es SaaS.

## 1.6 `s1-ejemplos-saas` — Seguro ya usas SaaS (aunque no lo sabías)
**Texto**
- Título: Seguro ya usas SaaS (aunque no lo sabías)
- Grupos de chips (aparecen uno a uno):
  - Correo y documentos: Gmail · Google Docs · Microsoft 365 (Outlook, Word y Excel en línea)
  - Videollamadas y chat: Zoom · Microsoft Teams · Google Meet · Slack
  - Crear y organizar: Canva · Figma · Notion
  - Guardar archivos: Google Drive · Dropbox · OneDrive
  - Para empresas: Salesforce (gestión de clientes) · Shopify (tiendas en línea)
  - Entretenimiento: Netflix · Spotify
- Al pasar el cursor o tocar un chip, una línea explica para qué sirve (el agente redacta frases de
  máximo 10 palabras, neutrales y correctas).
- Pregunta al grupo (grande, al final): ¿Cuántos de estos usaste esta semana?

**Notas**: Haz la votación a mano alzada. Netflix y Spotify también son software que se usa por
suscripción desde internet; sirven para que el concepto “aterrice”.

## 1.7 `s1-ejemplos-paas` — Plataformas para publicar tu código
**Texto**
- Título: Plataformas para publicar tu código sin pelearte con servidores
- Tarjetas:
  - **Render** — Publica sitios, APIs y bases de datos conectando tu repositorio de GitHub.
  - **Heroku** — Uno de los pioneros del PaaS (2007). Popularizó el “sube tu código y listo”.
  - **Vercel y Netlify** — Especializadas en sitios y aplicaciones web modernas (React, Next.js…).
  - **Google App Engine** — El PaaS de Google, disponible desde 2008.
  - **AWS Elastic Beanstalk** — Subes tu aplicación y AWS crea y configura los servidores por ti.
  - **Azure App Service** — Aplicaciones web y APIs en .NET, Java, Node.js, Python o PHP, dentro de Azure.
  - **Firebase y Supabase** — “Backend como servicio”: base de datos, usuarios y almacenamiento listos
    para tu app.
- Recuadro **Cosas técnicas**: **Serverless (FaaS)**: AWS Lambda, Azure Functions y Cloud Run
  functions ejecutan una sola función cuando ocurre un evento y cobran solo por el tiempo que se
  ejecuta. Es como un PaaS todavía más pequeño.

**Notas**: No hace falta memorizar la lista. La pregunta clave para reconocer un PaaS es:
“¿Yo administro el servidor o solo subo mi código?”

## 1.8 `s1-comparativa` — Comparativa rápida
**Texto**
- Título: IaaS, PaaS y SaaS lado a lado
- Tabla (columnas con color de su modelo):

| | IaaS | PaaS | SaaS |
|---|---|---|---|
| Qué rentas | Infraestructura: VM, discos y red | Una plataforma para ejecutar tu código | Una aplicación terminada |
| Tú administras | Sistema operativo, programas, aplicación y datos | Tu aplicación y tus datos | Tu cuenta, tu configuración y tus datos |
| Control | Mucho | Medio | Poco |
| Esfuerzo técnico | Alto | Medio | Bajo |
| Quién lo usa | Administradores de sistemas y DevOps | Desarrolladores | Usuarios finales |
| Ejemplo | Amazon EC2 | Render | Gmail |
| Analogía | Departamento vacío | Departamento amueblado | Hotel |

**Visual / animación**: las columnas entran escalonadas; las filas “Control” y “Esfuerzo técnico”
muestran barras/medidores que se llenan (lleno, medio, poco).

**Notas**: Deja que el grupo lea la tabla en silencio 30 segundos antes de explicarla.

## 1.9 `s1-quiz` — Reto: ¿IaaS, PaaS o SaaS?
**Texto**
- Título: Reto: ¿IaaS, PaaS o SaaS?
- Instrucción: Lee cada situación, vota con la mano y luego descubre la respuesta.
- 8 tarjetas volteables (frente: situación; reverso: respuesta con su color + explicación corta):
  1. Rentas una máquina virtual con Ubuntu en Amazon EC2 e instalas todo tú. → **IaaS** — Tú
     administras el sistema operativo.
  2. Escribes tus correos en Gmail. → **SaaS** — Solo usas la aplicación.
  3. Conectas tu repositorio de GitHub a Render y tu API queda publicada. → **PaaS** — Tú pones el
     código; Render, el servidor.
  4. Tu equipo hace videollamadas por Zoom. → **SaaS** — Aplicación lista para usar.
  5. Creas tres máquinas virtuales con Windows en Azure para un laboratorio. → **IaaS** — Rentas
     servidores virtuales completos.
  6. Subes tu aplicación de Python a Google App Engine. → **PaaS** — La plataforma ejecuta tu código.
  7. Diseñas la invitación de la graduación en Canva. → **SaaS** — Solo usas la herramienta.
  8. Rentas discos y una red virtual en Google Cloud para montar tu propio servidor de base de datos.
     → **IaaS** — Tú instalas y administras el servidor.
- Marcador opcional: “Respuestas descubiertas: 3 / 8”.

**Interacción**: clic/tap voltea una tarjeta; con el teclado, cada paso voltea la siguiente en orden.
Al volver atrás se voltean de regreso.

**Notas**: Pide que voten con la mano antes de voltear (1 dedo IaaS, 2 PaaS, 3 SaaS).

---

# SECCIÓN 2 — Los tres grandes  (archivo `src/slides/20-proveedores.html`, prefijo `s2-`)

## 2.1 `s2-tres-grandes` — Conoce a los tres grandes
**Texto**
- Título: Conoce a los tres grandes
- Entrada: Tres empresas concentran cerca del **63 %** del mercado mundial de infraestructura en la nube.
- Tres tarjetas:
  - **AWS (Amazon Web Services)** — Empresa: Amazon · Desde: 2006, con Amazon S3 y Amazon EC2 ·
    Cuota: **28 %** · Conocida por: ser la pionera y tener el catálogo de servicios más amplio.
  - **Microsoft Azure** — Empresa: Microsoft · Desde: 2010 (se lanzó como Windows Azure) ·
    Cuota: **20 %** · Conocida por: integrarse con lo que muchas empresas ya usan: Windows Server,
    Microsoft 365 y Microsoft Entra ID (antes Azure Active Directory).
  - **Google Cloud** — Empresa: Google · Desde: 2008, con Google App Engine · Cuota: **15 %** ·
    Conocida por: datos y analítica (BigQuery), contenedores (Kubernetes nació en Google) e
    inteligencia artificial.
- Fuente (texto pequeño): Synergy Research Group, segundo trimestre de 2026. Mercado mundial de
  infraestructura en la nube: 143 400 millones de dólares en el trimestre, 43 % más que un año antes.

**Visual / animación**: barras horizontales que crecen hasta 28, 20 y 15 con contador numérico
animado; el resto del mercado (37 %) como barra gris “Todos los demás”.

**Notas**: Aclara que “cuota de mercado” mide dinero gastado en servicios de infraestructura en la
nube, no número de usuarios. Los porcentajes cambian cada trimestre.

## 2.2 `s2-caracteristicas` — Cada una tiene su personalidad
**Texto**
- Título: Cada una tiene su personalidad
- Tabla comparativa (encabezados con chip de color de cada proveedor):

| | AWS | Microsoft Azure | Google Cloud |
|---|---|---|---|
| Consola web | AWS Management Console | Azure portal | Google Cloud console |
| Línea de comandos | AWS CLI | Azure CLI (`az`) | Google Cloud CLI (`gcloud`) |
| Cómo organizas tus recursos | Cuentas de AWS | Suscripciones y grupos de recursos | Proyectos |
| Su punto fuerte | La mayor variedad de servicios y una comunidad enorme | Empresas que ya usan Microsoft y nube híbrida | Datos, IA y contenedores |
| Prueba gratis para cuentas nuevas | US$100 en créditos al registrarte y hasta US$100 más al completar actividades; plan gratuito de hasta 6 meses | US$200 en créditos para usar en 30 días, más servicios con uso gratuito | US$300 en créditos para usar en 90 días, más el nivel “Always Free” (por ejemplo, una VM e2-micro al mes) |
| Para estudiantes | AWS Educate (sin tarjeta de crédito) | Azure for Students: US$100 en créditos, sin tarjeta | Google Cloud Skills Boost |
| Región en México | Sí, en Querétaro (desde 2025) | Sí, “Mexico Central”, en Querétaro (desde 2024) | Sí, en Querétaro (desde 2024) |

- Recuadro **Cuidado**: Las promociones cambian seguido. Revisa siempre la página oficial antes de
  registrarte y fíjate si te piden tarjeta de crédito. (Datos vigentes a septiembre de 2026.)

**Visual / animación**: filas que se revelan paso a paso; en pantallas angostas, cambiar a tres
tarjetas apiladas en lugar de tabla (o tabla con scroll horizontal dentro de su contenedor).

**Notas**: Para esta materia usaremos AWS Educate porque no pide tarjeta de crédito. Las ideas son
las mismas en las tres nubes.

## 2.3 `s2-diccionario` — El mismo servicio, tres nombres
**Texto**
- Título: El mismo servicio, tres nombres
- Subtítulo: Tu diccionario de IaaS
- Tabla (columna 1 = idea en palabras simples):

| Lo que necesitas | AWS | Microsoft Azure | Google Cloud |
|---|---|---|---|
| Una computadora rentada (máquina virtual) | Amazon EC2 | Azure Virtual Machines | Compute Engine |
| Un disco para tu VM | Amazon EBS | Azure Managed Disks | Persistent Disk / Hyperdisk |
| Guardar archivos (almacenamiento de objetos) | Amazon S3 | Azure Blob Storage | Cloud Storage |
| Tu red privada | Amazon VPC | Azure Virtual Network (VNet) | VPC |
| El firewall de tu VM | Grupos de seguridad (Security Groups) | Grupos de seguridad de red (NSG) | Reglas de firewall de VPC |
| Repartir visitas entre servidores | Elastic Load Balancing | Azure Load Balancer | Cloud Load Balancing |
| Crecer o encoger solo | Amazon EC2 Auto Scaling | Virtual Machine Scale Sets | Grupos de instancias administrados |
| Plantilla del sistema operativo | AMI (Amazon Machine Image) | Imagen de VM | Imagen de Compute Engine |

- Recuadro **Consejo**: No memorices nombres: memoriza la idea. Si entiendes qué es una VM, la vas a
  encontrar en cualquier nube, se llame como se llame.

**Visual / animación**: fila por fila (pasos); la primera columna tiene un icono SVG por concepto
(computadora, disco, caja de archivos, red, escudo, balanza, flechas de crecer, plantilla).

**Notas**: Pregunta rápida: “¿Cómo se llama la máquina virtual en Google Cloud?” (Compute Engine).

## 2.4 `s2-rasgos-iaas` — Lo que tienen en común
**Texto**
- Título: Lo que la IaaS tiene en común en las tres nubes
- Seis tarjetas con icono y micro-animación:
  1. **Autoservicio** — Creas un servidor en minutos desde una página web, sin hablar con nadie.
  2. **Pago por uso** — Te cobran por el tiempo que tu VM está encendida.
  3. **Elasticidad** — Pasas de 1 a 100 servidores cuando llega mucha gente y regresas a 1 cuando se van.
  4. **Regiones y zonas** — Eliges en qué parte del mundo viven tus servidores. Cada región tiene
     varios centros de datos separados (zonas de disponibilidad) para que una falla no tire todo.
  5. **Tamaños a la medida** — Eliges cuántos procesadores virtuales (vCPU) y cuánta memoria RAM
     necesitas: desde VM pequeñas para practicar hasta máquinas con GPU para inteligencia artificial.
  6. **Responsabilidad compartida** — El proveedor protege los edificios y el hardware; tú proteges
     tu sistema operativo, tus contraseñas y tus datos.
- Recuadro **¿Sabías que?**: AWS, Microsoft y Google ya tienen regiones de nube en **Querétaro, México**.

**Visual / animación**: micro-animaciones en los iconos (el reloj/medidor corre, las barras de
elasticidad suben y bajan, un mapa con puntos que parpadean para regiones).

**Notas**: La elasticidad es la razón por la que las tiendas en línea no se caen en el Buen Fin.

## 2.5 `s2-siete-pasos` — Rentar un servidor en 7 pasos
**Texto**
- Título: Rentar un servidor en 7 pasos
- Subtítulo: Así se crea una máquina virtual en cualquiera de las tres nubes.
- Pasos (se revelan uno por uno mientras una VM se “construye” en una ilustración):
  1. **Elige la región** — dónde vivirá tu servidor (por ejemplo, México).
  2. **Elige la imagen** — el sistema operativo: Ubuntu, Windows Server, Amazon Linux…
  3. **Elige el tamaño** — cuántos vCPU y cuánta RAM. Ejemplos pequeños: `t3.micro` en AWS,
     `B1s` en Azure y `e2-micro` en Google Cloud.
  4. **Agrega el disco** — cuántos GB de almacenamiento.
  5. **Configura la red y el firewall** — qué puertos abres: 22 para SSH, 80 y 443 para web.
  6. **Crea tu llave de acceso** — un par de llaves SSH (Linux) o usuario y contraseña (Windows, por RDP).
  7. **Lanza y conéctate** — en un par de minutos tienes una computadora encendida en la nube.
- Recuadro **Cuidado**: Una VM encendida cobra aunque no la uses. Al terminar una práctica,
  **detenla o elimínala**.

**Visual / animación**: a la derecha, una ilustración de servidor que se va completando con cada
paso (aparece el mapa → el logo del SO como etiqueta → los chips de CPU/RAM → el disco → el escudo
del firewall → la llave → luz verde de “encendida”).

**Notas**: Esto es exactamente lo que harán en el módulo “Getting Started with Compute” de AWS Educate
con Amazon EC2.

## 2.6 `s2-precios` — ¿Cómo te cobran?
**Texto**
- Título: ¿Cómo te cobran? Tres formas de pagar una VM
- Tres tarjetas con analogía de transporte:
  1. **Bajo demanda** — como un taxi: pagas el tiempo que lo usas, sin compromisos. Es la opción más
     flexible y la más cara por hora.
     Nombres: On-Demand (AWS) · Pago por uso (Azure) · Bajo demanda (Google Cloud)
  2. **Compromiso de 1 o 3 años** — como rentar un departamento por contrato: te comprometes y a
     cambio recibes un descuento grande.
     Nombres: Savings Plans e Instancias reservadas (AWS) · Reservas y Savings Plan (Azure) ·
     Descuentos por compromiso de uso (Google Cloud)
  3. **Capacidad sobrante (Spot)** — como un vuelo de última hora en oferta: muy barato (hasta cerca
     de 90 % menos), pero el proveedor puede recuperar la máquina con poco aviso (de 30 segundos a
     2 minutos). Ideal para tareas que pueden interrumpirse.
     Nombres: Spot Instances (AWS) · Spot VMs (Azure) · Spot VMs (Google Cloud)
- Mini calculadora interactiva (etiqueta visible: “Precio ilustrativo, no real”):
  control deslizante “Horas encendida al mes” de 0 a 730, con precio fijo de US$0.02 por hora.
  Muestra el costo con animación. Marcas rápidas: “2 horas de práctica = US$0.04” ·
  “Todo el mes encendida (730 h) = US$14.60”.
  Frase: Encendida todo el mes cuesta 365 veces más que tu práctica de 2 horas.
- Recuadro **Recuerda**: En la nube, apagar lo que no usas es ahorrar dinero.

**Notas**: El precio es inventado a propósito para que las cuentas sean fáciles. La idea es que
vean que el costo depende del tiempo encendido.

---

# SECCIÓN 3 — Manos a la obra  (archivo `src/slides/30-actividad.html`, prefijo `s3-`)

## 3.1 `s3-aws-educate` — AWS Educate: tu laboratorio gratis  · data-bg="amarillo" opcional
**Texto**
- Etiqueta: Actividad práctica
- Título: AWS Educate: aprende nube gratis, sin tarjeta de crédito
- Cuatro bloques:
  - **Qué es**: una plataforma gratuita de Amazon Web Services con cursos a tu ritmo, laboratorios
    e insignias digitales.
  - **Qué necesitas**: tener 13 años o más y un correo electrónico. No necesitas tarjeta de crédito
    ni experiencia previa.
  - **Qué obtienes**: videos, laboratorios con acceso real a la consola de AWS e insignias digitales
    que puedes compartir (por ejemplo, en LinkedIn).
  - **Extra**: una bolsa de trabajo para mayores de 18 años (Job Board).
- Recuadro **Consejo**: Muchos cursos están en inglés. Activa los subtítulos de los videos y usa el
  traductor del navegador si lo necesitas.

**Notas**: AWS Educate no es lo mismo que una cuenta normal de AWS: no pide tarjeta y los
laboratorios no generan cobros para el alumno.

## 3.2 `s3-registro` — Crea tu cuenta en 6 pasos
**Texto**
- Título: Crea tu cuenta en 6 pasos
- Pasos (uno por uno, con una ventana de navegador ilustrada que cambia en cada paso; la ventana es
  un boceto genérico, NO una copia de la interfaz real de AWS):
  1. Entra a **aws.amazon.com/education/awseducate** (enlace real que se puede abrir:
     `https://aws.amazon.com/education/awseducate/`).
  2. Da clic en **Register now** (Regístrate ahora).
  3. Llena el formulario con tus datos reales y un correo que sí revises. Usa tu nombre completo:
     aparecerá en tus insignias.
  4. Abre el correo de verificación de AWS Educate y confirma tu cuenta.
  5. Crea tu contraseña e inicia sesión con **Sign in to AWS Educate**.
  6. Explora el catálogo de cursos y busca los módulos de tu tarea.
- Recuadro **Cuidado**: ¿No llega el correo en unos minutos? Revisa la carpeta de spam o correo no deseado.

**Notas**: Da 10–15 minutos en clase para que todos creen su cuenta. Camina por el salón; el error
más común es escribir mal el correo.

## 3.3 `s3-tarea` — Tu tarea
**Texto**
- Título: Tu tarea: dos módulos de AWS Educate
- Dos tarjetas grandes:
  - **Módulo 1 · Introduction to Cloud 101** — Conceptos básicos de la nube y los servicios
    principales de AWS. Incluye laboratorio y una evaluación final. Al aprobar recibes una insignia.
  - **Módulo 2 · Getting Started with Compute** — Tipos de cómputo y cómo crear una instancia en
    Amazon EC2. ¡Es IaaS en la vida real!
- Qué entregas (lista con casillas que se van marcando con animación):
  1. La captura de pantalla o el enlace de Credly de **cada** insignia.
  2. Un párrafo de 5 a 8 líneas que responda: *¿Qué hiciste en el laboratorio de EC2 y por qué eso es IaaS?*
- Datos de entrega (editables por el docente desde `config.js`):
  - Fecha límite: `[data-config="fechaEntrega"]`
  - Dónde se entrega: `[data-config="medioEntrega"]`
- Recuadro **Recuerda**: La insignia solo se otorga si completas todo el curso y apruebas la
  evaluación final. Te llega por correo, a través de Credly.

**Notas**: Ajusta fecha y medio de entrega en el bloque “EDITA AQUÍ” del archivo index.html.

## 3.4 `s3-problemas` — Si algo sale mal
**Texto**
- Título: Si algo sale mal…
- Lista tipo “problema → solución” (acordeón o tarjetas):
  - **No me llega el correo** → Revisa spam o correo no deseado, espera unos minutos y verifica que
    escribiste bien tu dirección.
  - **Todo está en inglés** → Clic derecho → “Traducir a español”, y activa los subtítulos en los videos.
  - **El laboratorio no carga** → Usa Chrome o Edge actualizados, desactiva bloqueadores de anuncios
    o intenta en otra red.
  - **No me dieron la insignia** → Revisa que completaste todos los componentes y aprobaste la
    evaluación. El correo de Credly puede tardar un poco.
  - **Olvidé mi contraseña** → Usa la opción “Forgot password” en la pantalla de inicio de sesión.

**Notas**: Si algo no se resuelve, que lo reporten con captura de pantalla antes de la fecha límite.

## 3.5 `s3-glosario` — Palabras que ya dominas
**Texto**
- Título: Palabras que ya dominas
- Tarjetas volteables (frente: palabra; reverso: definición). Clic para voltear; con el teclado,
  un paso voltea todas al mismo tiempo.
  - **Nube** — Computadoras de alguien más que rentas por internet.
  - **On-premises** — Todo en tus propias instalaciones: tú compras y cuidas todo.
  - **IaaS** — Rentas infraestructura: VM, discos y red. Tú instalas y administras lo demás.
  - **PaaS** — Traes tu código; la plataforma lo ejecuta.
  - **SaaS** — Usas una aplicación terminada desde el navegador.
  - **Máquina virtual (VM)** — Una computadora simulada por software dentro de un servidor real.
  - **Región** — Un lugar del mundo donde el proveedor tiene centros de datos.
  - **Zona de disponibilidad** — Uno o más centros de datos separados dentro de una región.
  - **Elasticidad** — Crecer o encoger los recursos según la demanda.
  - **Pago por uso** — Pagas solo por lo que consumes, el tiempo que lo consumes.
  - **Responsabilidad compartida** — El proveedor cuida la nube; tú cuidas lo que pones en ella.
  - **Serverless** — Ejecutas funciones sin administrar servidores; pagas solo cuando corren.

**Notas**: Úsalo como repaso rápido: di la palabra y que el grupo responda antes de voltear.

## 3.6 `s3-cierre` — Si solo te llevas tres ideas…  · data-bg="tinta" (fondo oscuro) o amarillo
**Texto**
- Título: Si solo te llevas tres ideas…
  1. **IaaS**: rentas la infraestructura; tú instalas y administras lo demás.
  2. **PaaS**: traes tu código; la plataforma lo ejecuta.
  3. **SaaS**: solo usas la aplicación terminada.
- Frase final: AWS, Azure y Google Cloud ofrecen los tres modelos. **Cambian los nombres, no las ideas.**
- Cierre: ¿Preguntas?
- Recordatorio de tarea (chip): Tarea → Introduction to Cloud 101 + Getting Started with Compute en AWS Educate.

**Visual / animación**: las tres ideas aparecen con sus colores; al final Nubi (feliz) se despide y
las nubes del fondo vuelven a moverse como en la portada.

**Notas**: Cierra recordando la fecha de entrega y abre espacio para preguntas.
