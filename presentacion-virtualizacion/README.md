# La nube por dentro · hilos, núcleos y máquinas virtuales

Segunda presentación de la materia **Cómputo en la Nube**, continuación de
`../presentacion-iaas-paas-saas`. Mismo motor, mismo diseño, cero dependencias de
npm: funciona con doble clic sobre `index.html`.

Termina con una **práctica guiada de una hora**: instalar VirtualBox, descargar un
Linux y correr una máquina virtual.

## Presentar en clase

1. Abre `index.html` en Edge o Chrome (ya viene construido; solo corre
   `node build.mjs` si cambias algo en `src/`).
2. Pulsa `F` para pantalla completa.
3. Avanza con `→`, la barra espaciadora, `PageDown`, `Enter` o el botón `→`.

Atajos: `Inicio`/`Fin` primera y última · `F` pantalla completa · `N` notas del
docente · `O` o `Esc` índice · `?` ayuda de teclas. En celular, desliza.

Cada diapositiva tiene pasos: avanzar revela el siguiente fragmento. El hash `#/7`
conserva la posición al recargar y `?all=1` muestra todos los pasos (útil para
capturas o para imprimir).

## Contenido (28 diapositivas)

| Sección | De qué va |
|---|---|
| Inicio | Portada · Agenda · Recordatorio de la clase pasada · La pregunta de hoy |
| El procesador por dentro | Núcleo · Proceso e hilo · Concurrencia · Hyperthreading · Núcleos contra procesadores lógicos · vCPU |
| Virtualizar | Qué es · Hipervisor tipo 1 y tipo 2 · VT-x/AMD-V · Anfitrión e invitado · Qué le prestas a una VM · Disco dinámico |
| De tu laptop a la nube | La misma idea a otra escala · Un servidor, muchos inquilinos · Elasticidad |
| Manos a la obra | La práctica en 5 pasos · VirtualBox · el ISO · crear la VM · instalar Alpine · comprobar · entrega · problemas · cierre |

El contenido revisado, diapositiva por diapositiva, está en `docs/GUION.md`. El
contrato del motor y la dirección visual, en `docs/BRIEF.md`.

## Antes de dar la práctica

**Dos cosas que hay que resolver con días de anticipación o la práctica se cae:**

1. **Permisos de administrador.** Instalar VirtualBox los necesita y en laboratorios
   universitarios casi nunca los hay. Pídeselos a sistemas con tiempo.
2. **La descarga.** Treinta alumnos bajando el instalador y el ISO por el Wi-Fi de la
   escuela es un desastre. Ponlos en la plataforma del curso (`../plataforma`) y que
   los bajen por la red local: son segundos y no depende del internet del plantel.

Prueba tú la práctica completa una vez antes de darla. Toma 20 minutos y te ahorra
descubrir en vivo que el BIOS del laboratorio tiene la virtualización apagada.

## Editar datos de entrega

La fecha límite y el medio de entrega salen como "Por definir" hasta que los cambies:

- **Rápido, sin reconstruir:** abre `index.html`, busca `EDITA AQUÍ` y cambia los valores.
- **Permanente:** edita `src/config.js` y corre `node build.mjs` (si no lo haces, el
  siguiente build sobrescribe el cambio directo en `index.html`).

```js
window.CLASE = {
  materia: "Cómputo en la Nube",
  grupo: "Por definir",
  docente: "Por definir",
  fechaEntrega: "Por definir",   // p. ej. "6 de octubre de 2026, 23:59"
  medioEntrega: "Por definir"    // p. ej. "Classroom, tarea «Máquina virtual»"
};
```

## Reconstruir

```powershell
node build.mjs
```

El build concatena estilos, diapositivas y scripts de `src/` en un único
`index.html`, en orden alfabético. Detecta ids duplicados y avisa si a una
diapositiva le falta el panel de notas.

Para probar capturas sin servidor:

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --window-size=1280,720 --screenshot="docs/capturas/s1-nucleo.png" "file:///C:/Users/danie/Repositories/Computo%20en%20la%20nube/presentacion-virtualizacion/index.html?all=1#/5"
```

## En la plataforma del curso

Ya está registrada en `../plataforma/curso.js` como el módulo `virtualizacion`, así
que los alumnos la abren desde la misma dirección de siempre. Arranca la plataforma
con `npm start` dentro de `../plataforma`.
