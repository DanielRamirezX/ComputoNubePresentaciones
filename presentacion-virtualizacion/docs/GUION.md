# Guion — "La nube por dentro"

28 diapositivas en 5 secciones. **Los datos técnicos de este guion están verificados:
úsalos tal cual.** Puedes reescribir la redacción, partir textos y decidir el diseño;
no cambies cifras, nombres de menús ni el sentido. Si algo te falta, NO lo inventes:
déjalo fuera y menciónalo en tu reporte.

Público: **novatos absolutos**. No saben qué es un hilo. Cada término se define antes
de usarse.

---

## Sección 0 · "Inicio" — prefijo `s0` — archivo `src/slides/00-inicio.html`

### 1. `s0-portada` — La nube por dentro
Fondo amarillo. Título: **La nube por dentro**. Subtítulo: "Hilos, núcleos y máquinas
virtuales: cómo una sola computadora puede ser treinta."
Nubi feliz: "Hoy vamos a abrir la computadora y ver qué hay adentro."

### 2. `s0-agenda` — Lo que vas a aprender hoy
Lista de 5 pasos:
1. Qué es un núcleo y qué es un hilo.
2. Por qué tu laptop dice que tiene más procesadores de los que tiene.
3. Qué significa "virtualizar" y quién le miente a quién.
4. Por qué puedes rentar una computadora por horas.
5. **Práctica: crear tu propia máquina virtual.**

Recuerda: "No necesitas saber programar. Vamos a ir de lo más pequeño (un núcleo) a
lo más grande (un centro de datos), sin saltos."

### 3. `s0-recordatorio` — La clase pasada rentamos una computadora
Recap corto de la presentación anterior: IaaS = rentas la máquina; tú pones el
sistema operativo y el software. En el laboratorio de AWS Educate encendieron una
instancia EC2.

**El giro:** "Le picaron a 'lanzar' y apareció una computadora en dos minutos. Nadie
fue a una bodega a conectar un servidor. ¿Entonces de dónde salió?"

### 4. `s0-pregunta` — La pregunta de hoy
Diapositiva de una sola pregunta, grande, fondo tinta:

**"¿Cómo puede una sola computadora física convertirse en treinta computadoras
para treinta clientes distintos?"**

Nubi pensando. Al final: "La respuesta empieza mucho más abajo de lo que crees:
en un pedacito de tu procesador."

---

## Sección 1 · "El procesador por dentro" — prefijo `s1` — archivo `src/slides/10-procesador.html`

### 5. `s1-nucleo` — El núcleo: una cosa a la vez
Un procesador tiene **núcleos**. Un núcleo es la parte que de verdad ejecuta
instrucciones, y hace **una cosa a la vez**.

**Analogía:** una caja de supermercado. Un núcleo = una cajera. Por rápida que sea,
atiende a un cliente a la vez.

Un procesador moderno trae varios núcleos: es tener varias cajas abiertas.

> **Cosas técnicas:** "una cosa a la vez" es una simplificación útil. Un núcleo real
> es *superescalar*: acomoda varias instrucciones por ciclo cuando no dependen entre
> sí. Para lo de hoy, la idea de "una a la vez" basta.

### 6. `s1-proceso-hilo` — Proceso e hilo
- **Proceso** = un programa en ejecución, con su propia memoria. Chrome abierto es un proceso.
- **Hilo** (thread) = una línea de trabajo **dentro** del proceso. Varios hilos del
  mismo proceso **comparten la memoria**.

**Analogía:** el proceso es el restaurante; los hilos son los meseros. Todos trabajan
en el mismo local y usan la misma cocina.

Ejemplo concreto del navegador: un hilo dibuja la página, otro descarga la imagen,
otro escucha el teclado.

### 7. `s1-concurrencia` — Un núcleo, muchos hilos
El problema: tu laptop tiene **8 núcleos** y Chrome solito trae **decenas de hilos**.
No alcanzan.

La solución: el sistema operativo **alterna** entre hilos tan rápido que parece
simultáneo. Eso es **concurrencia**.

| | Qué es | Necesita |
|---|---|---|
| **Concurrencia** | Alternar muy rápido entre tareas | Un núcleo basta |
| **Paralelismo** | Hacerlas de verdad al mismo tiempo | Varios núcleos |

> **Demo en clase (1 min):** Administrador de tareas → pestaña **Detalles** → clic
> derecho en los encabezados → **Seleccionar columnas** → marcar **Subprocesos**.
> Ahí ven los hilos reales de cada programa.

### 8. `s1-hyperthreading` — El núcleo que finge ser dos
Un núcleo pasa mucho tiempo **esperando**: a la memoria, al disco. Esos huecos se
desperdician.

**Hyperthreading** (Intel) o **SMT** (AMD) es que el núcleo se presenta al sistema
como **dos**, para meter trabajo en esos huecos.

**Analogía:** la cajera que, mientras un cliente busca su tarjeta, empieza a escanear
al siguiente. No son dos cajeras.

> **Cuidado:** dos procesadores lógicos **no rinden como dos núcleos**. La ganancia
> típica ronda el 15–30 %, no el 100 %.

### 9. `s1-logicos` — Núcleos contra procesadores lógicos
Por eso el Administrador de tareas dice dos números distintos:
**Núcleos: 8 · Procesadores lógicos: 16.**

Diseño sugerido: una reproducción del panel de Rendimiento → CPU (dibujada en
HTML/CSS, no captura de pantalla real), destacando ambos renglones y el renglón
**"Virtualización: habilitada"**, que se usará en la sección 2.

> **Demo:** que cada quien lo abra en su laptop y anote sus dos números. Es la
> **captura 1** de la práctica.

### 10. `s1-vcpu` — Un vCPU es un procesador lógico
**El puente con la nube.** Cuando rentas una máquina con **2 vCPU**, no rentas dos
núcleos: rentas **dos procesadores lógicos**, o sea dos hilos de hardware.

Por eso una `t3.micro` dice 2 vCPU y no significa dos procesadores.

> **Cosas técnicas:** en los procesadores Graviton de AWS (ARM) un vCPU **sí** es un
> núcleo físico completo, porque esos núcleos no usan SMT. Por eso comparar
> "vCPU contra vCPU" entre familias distintas es engañoso.

Recuerda: "Núcleo → hilo → procesador lógico → vCPU. Es la misma escalera, con
nombres distintos según quién la mire."

---

## Sección 2 · "Virtualizar" — prefijo `s2` — archivo `src/slides/20-virtualizar.html`

### 11. `s2-que-es` — Virtualizar es mentir (con permiso)
Normalmente: un sistema operativo manda sobre el hardware.

Virtualizar es meter un programa en medio —el **hipervisor**— que le **presenta a otro
sistema operativo un procesador, una memoria y un disco que no existen** como tales.
El sistema invitado nunca se entera.

**Analogía:** subarrendar un cuarto. El inquilino vive con normalidad; no sabe que las
paredes las puso alguien más.

### 12. `s2-hipervisor` — Dos tipos de hipervisor
Diagrama de capas, lado a lado:

**Tipo 2 (alojado):** Hardware → Windows → VirtualBox → VM.
Ejemplos: **VirtualBox, VMware Workstation Player**. Es lo que van a usar hoy.

**Tipo 1 (bare-metal):** Hardware → Hipervisor → VMs.
Ejemplos: **VMware ESXi, KVM, Xen, AWS Nitro**. Es lo que usan las nubes.

La diferencia práctica: el tipo 1 no carga con un sistema operativo de escritorio
debajo, así que desperdicia mucho menos.

### 13. `s2-vtx` — El interruptor que ya traes
Virtualizar por software puro sería lentísimo. Por eso los procesadores traen
extensiones dedicadas: **Intel VT-x** y **AMD-V**.

Se activan en el BIOS/UEFI y casi siempre ya vienen encendidas.

> **Cuidado:** si VirtualBox marca error de VT-x/AMD-V al encender la VM, hay que
> entrar al BIOS/UEFI y activar la virtualización. Es el problema número uno de esta
> práctica.

Cierra el círculo con la diapositiva 9: ese renglón **"Virtualización: habilitada"**
del Administrador de tareas es justo esto.

### 14. `s2-anfitrion-invitado` — Anfitrión e invitado
Vocabulario que van a usar toda la práctica:

- **Anfitrión (host):** tu laptop real, con su Windows.
- **Invitado (guest):** la máquina virtual y su sistema operativo.

El invitado **no puede ver** al anfitrión. Está en su propia burbuja: es la razón por
la que una VM es un lugar seguro para experimentar.

### 15. `s2-que-le-prestas` — Lo que le prestas a una VM
Cuatro tarjetas, con el código de color del brief:

- **Procesador:** cuántos vCPU le cedes de los que tienes.
- **Memoria:** RAM que le quitas a tu laptop mientras esté encendida.
- **Disco:** un archivo en tu disco real que la VM cree que es su disco.
- **Red:** una tarjeta de red virtual, con su propia IP.

> **Cuidado:** nunca le des a una VM más vCPU de los procesadores lógicos que tienes,
> ni más de la mitad de tu RAM. Si lo haces, se frenan las dos.

### 16. `s2-disco` — Por qué un disco de 2 GB no pesa 2 GB
Al crear el disco hay dos opciones:

- **Reservado dinámicamente:** el archivo empieza en casi nada y crece conforme se usa.
- **Tamaño fijo:** aparta los 2 GB desde el primer momento.

**El puente con la nube:** ese "crece conforme se usa" es exactamente el modelo de
cobro del almacenamiento en la nube. Pagas por lo que ocupas, no por lo que pediste.

---

## Sección 3 · "De tu laptop a la nube" — prefijo `s3` — archivo `src/slides/30-nube.html`

### 17. `s3-misma-idea` — Es lo mismo, a otra escala
Comparación lado a lado:

| Tu laptop hoy | Un servidor de AWS |
|---|---|
| VirtualBox (tipo 2) | Nitro (tipo 1) |
| 1 VM con 1 vCPU y 1 GB | Decenas de VMs |
| Tú eres el único inquilino | Decenas de clientes que no se conocen |

**La frase de la clase:** "La máquina virtual que van a crear hoy y una instancia EC2
son la misma idea. Lo único que cambia es quién paga la luz."

### 18. `s3-inquilinos` — Un servidor, muchos inquilinos
Un servidor de centro de datos puede tener más de 100 procesadores lógicos. El
hipervisor lo reparte entre clientes que no se ven entre sí. A eso se le llama
**multi-tenancy** (varios inquilinos).

Y ahí está la respuesta a la pregunta de la diapositiva 4.

> **¿Sabías que?** Por eso la nube es barata: el proveedor compra un servidor
> carísimo una vez y lo renta en rebanadas a mucha gente a la vez.

### 19. `s3-elastico` — Cambiar de tamaño en 30 segundos
Para cambiar el "hardware" de una VM: apagar → cambiar el número → encender.
Sin desarmar nada, sin comprar nada.

Eso es pasar de `t3.micro` a `t3.small`. **Eso es la elasticidad**, la palabra que
usan todos los folletos de nube.

> **Cuidado:** una VM encendida consume tu RAM aunque no la uses. En la nube,
> consume tu dinero.

Y lo van a comprobar con sus manos en el paso 5 de la práctica.

---

## Sección 4 · "Manos a la obra" — prefijo `s4` — archivo `src/slides/40-practica.html`

**Estilo de esta sección: "for dummies" literal.** Cada paso con su número, qué
botón se pulsa, qué se escribe y qué debe verse en pantalla. Nada de "configura la
red": di exactamente qué elegir.

### 20. `s4-practica` — La práctica de hoy
**Crear tu primera máquina virtual.** 1 hora, en 5 pasos.

| Paso | Qué haces | Minutos |
|---|---|---|
| 1 | Instalar VirtualBox | 10 |
| 2 | Descargar el ISO de Linux | 5 |
| 3 | Crear la máquina virtual | 10 |
| 4 | Instalar Alpine Linux | 20 |
| 5 | Comprobar y experimentar | 10 |

Qué necesitas: una laptop con Windows, permisos de administrador y unos 3 GB libres.

> **Consejo:** si algo se atora, no borres nada. Levanta la mano: casi todos los
> errores de esta práctica se arreglan en 30 segundos.

### 21. `s4-paso1` — Paso 1: Instalar VirtualBox
**VirtualBox** es gratis y de código abierto, de Oracle. Sirve en Windows, macOS y Linux.

1. Abre `virtualbox.org` y entra a **Downloads**.
2. Descarga **Windows hosts**.
3. Ejecuta el instalador y pulsa **Next** en todas las pantallas.
4. Te avisa que **la red se va a desconectar un momento**. Es normal: está instalando
   tarjetas de red virtuales. Acepta.
5. Al terminar, abre VirtualBox. Debes ver una ventana con la lista de máquinas vacía.

> **Cuidado:** hace falta **permiso de administrador**. Si estás en una computadora
> del laboratorio y te lo niega, avísale al docente antes de seguir.

### 22. `s4-paso2` — Paso 2: Descargar el Linux
Vamos a usar **Alpine Linux**, una distribución diminuta: el archivo pesa unos
**60 MB**. (Ubuntu pesa varios GB y no cabría en la clase.)

1. Ve a la dirección que te dé el docente (o `alpinelinux.org/downloads`).
2. Descarga la imagen **VIRTUAL** para **x86_64**. El archivo termina en `.iso`.
3. Guárdalo donde lo encuentres: la carpeta Descargas está bien.

> **Recuerda:** un **ISO** es la copia de un disco de instalación, en un solo archivo.
> Es el equivalente moderno al CD de instalación.

### 23. `s4-paso3` — Paso 3: Crear la máquina virtual
En VirtualBox, pulsa **Nueva**:

1. **Nombre:** `alpine-<tu apellido>`.
2. **Tipo:** Linux. **Versión:** Other Linux (64-bit).
3. **Imagen ISO:** selecciona el archivo `.iso` que descargaste.
4. **Memoria:** **1024 MB**. Es la RAM que le quitas a tu laptop.
5. **Procesadores:** **1**.
6. **Disco:** **2 GB**, dejando marcado **Reservado dinámicamente**.
7. **Finalizar.** La VM aparece en la lista, **apagada**.

**Aquí se detiene la clase:** cada número que acabas de escribir es una perilla de las
que viste en la sección 2. Acabas de especificar una computadora.

> **Cuidado:** no le des más memoria de la mitad de la que tiene tu laptop.

### 24. `s4-paso4` — Paso 4: Instalar Alpine
Selecciona la VM y pulsa **Iniciar**. Arranca desde el ISO.

1. Cuando aparezca `localhost login:` escribe **`root`** y pulsa Enter. **No pide contraseña.**
2. Escribe **`setup-alpine`** y Enter.
3. Responde:
   - Teclado: **`us`**, y otra vez **`us`**.
   - Hostname: Enter (acepta el que propone).
   - Interfaz de red: **`eth0`** · Dirección: **`dhcp`** · ¿Configuración manual?: **`n`**.
   - Contraseña de root: escríbela **dos veces**. *No se ve nada al teclear. Es normal.*
   - Zona horaria: **`America/Mexico_City`**.
   - Proxy: **`none`** · Servidor NTP: Enter.
   - Repositorio: **`f`** (busca el más rápido).
   - Usuario: Enter para omitir · SSH: **`openssh`**.
   - Disco: **`sda`** · Uso: **`sys`** · ¿Borrar el disco?: **`y`**.
4. Al terminar escribe **`reboot`**.
5. **Quita el ISO:** menú **Dispositivos → Unidades ópticas → Eliminar disco**. Si no,
   vuelve a arrancar el instalador.

> **Cuidado:** el orden exacto de las preguntas cambia un poco entre versiones de
> Alpine. Si aparece una que no está en la lista, acepta lo que propone con Enter.

> **Consejo:** ese `sda` es el disco virtual, el archivo que creaste en el paso 3. Le
> estás dando formato a un archivo, no a tu laptop.

### 25. `s4-paso5` — Paso 5: Compruébalo con tus manos
Entra como `root` con tu contraseña y escribe, uno por uno:

```sh
nproc          # cuántos vCPU le prestaste
free -m        # la RAM que le quitaste a tu laptop
ip addr        # su propia IP, distinta a la tuya
df -h          # su disco
cat /proc/cpuinfo | grep "model name"
```

**El momento de la clase:** ese último comando muestra **el mismo procesador que tiene
tu laptop**. No es un procesador simulado: es el tuyo, prestado por rebanadas. **Eso
es virtualizar.**

**El experimento del tamaño:**
1. Apaga la VM (`poweroff`).
2. **Configuración → Sistema → Procesador → 2**.
3. Enciende y escribe `nproc` otra vez. Ahora dice **2**.

Le cambiaste el hardware a una computadora en 30 segundos. **Eso es la elasticidad de
la nube**, y acabas de hacerlo con tus manos.

### 26. `s4-entrega` — Tu entrega
Cuatro capturas y un párrafo:

1. El Administrador de tareas con tus núcleos, procesadores lógicos y "Virtualización: habilitada".
2. La configuración de tu VM (memoria, procesadores, disco).
3. Dentro de Alpine: `nproc`, `free -m` e `ip addr`.
4. `nproc` mostrando **2** después del experimento.

Y un párrafo de 3 a 5 líneas: **¿por qué el procesador que ve la máquina virtual es el
mismo que el de tu laptop?**

Fecha límite y medio de entrega salen de `config.js` (`data-config="fechaEntrega"` y
`data-config="medioEntrega"`).

### 27. `s4-problemas` — Si algo sale mal
| Problema | Solución |
|---|---|
| Error de **VT-x / AMD-V** al encender | Entra al BIOS/UEFI y activa la virtualización. Es lo más común. |
| Solo ofrece versiones de **32 bits** | Es el mismo problema de arriba: falta activar VT-x. |
| El instalador **vuelve a arrancar** | No quitaste el ISO. Dispositivos → Unidades ópticas → Eliminar disco. |
| **No se ve nada** al escribir la contraseña | Es normal en Linux. Sigue escribiendo. |
| La VM va **lentísima** | Le diste poca RAM, o demasiada y ahogaste al anfitrión. |
| **No hay internet** dentro de la VM | Revisa que la red esté en **NAT** en la configuración de la VM. |
| El instalador **no me deja instalar** | Faltan permisos de administrador. |

### 28. `s4-cierre` — Si solo te llevas tres ideas
1. **Un vCPU no es un núcleo:** es un procesador lógico, un hilo de hardware.
2. **Virtualizar es repartir:** el hipervisor le presenta a cada invitado una
   computadora que en realidad es una rebanada de otra.
3. **Rentar por horas existe gracias a esto.** Sin virtualización no habría nube.

Nubi feliz: "Ya sabes qué hay dentro de la nube. Son computadoras, repartidas."
