# IaaS, PaaS y SaaS · la nube explicada fácil

Presentación web para la materia **Cómputo en la Nube**. No usa frameworks ni dependencias de npm y funciona con doble clic sobre `index.html`.

## Presentar en clase

1. Abre `index.html` en Edge o Chrome (ya viene construido; solo ejecuta `node build.mjs` si cambias algo en `src/`).
2. Pulsa `F` para pantalla completa.
3. Avanza con `→`, la barra espaciadora, `PageDown`, `Enter` o el botón `→`.
4. Retrocede con `←`, `PageUp`, `Retroceso` o el botón `←`.

Atajos disponibles:

- `Inicio` / `Fin`: primera / última diapositiva.
- `F`: pantalla completa.
- `N`: panel de notas del docente.
- `O` o `Esc`: índice agrupado por sección.
- `?`: ayuda de teclas.
- En celular: desliza a la izquierda o derecha.

Cada diapositiva tiene pasos. Pulsa avanzar para revelar el siguiente fragmento; al llegar al final, avanza a la siguiente diapositiva. El hash `#/5` conserva la posición al recargar. Para una vista de captura con todos los pasos usa `?all=1`.

## Contenido (25 diapositivas)

| Sección | Diapositivas |
|---|---|
| Inicio | Portada · Agenda · ¿Qué es la nube? · Antes de la nube (on-premises) |
| Los tres modelos | Analogía de la vivienda · ¿Quién se encarga de qué? (interactiva) · IaaS · PaaS · SaaS · Ejemplos SaaS · Plataformas PaaS · Comparativa · Reto (quiz) |
| Los tres grandes | AWS, Azure y Google Cloud · Características · Diccionario de IaaS · Rasgos comunes · Rentar un servidor en 7 pasos · ¿Cómo te cobran? (calculadora) |
| Manos a la obra | AWS Educate · Crear cuenta · Tarea · Si algo sale mal · Glosario · Cierre |

Los datos (cuotas de mercado, promociones, regiones) están verificados a septiembre de 2026; las promociones de los proveedores cambian seguido.

## Editar datos de entrega

La fecha límite y el medio de entrega salen como “Por definir” hasta que los cambies. Tienes dos opciones:

- **Rápida, sin reconstruir:** abre `index.html` en un editor, busca `EDITA AQUÍ` y cambia los valores.
- **Permanente:** edita `src/config.js` y ejecuta `node build.mjs` (si no lo haces, el siguiente build sobrescribirá el cambio hecho directo en `index.html`).

```js
window.CLASE = {
  materia: "Cómputo en la Nube",
  grupo: "Por definir",
  docente: "Por definir",
  fechaEntrega: "Por definir",   // p. ej. "2 de octubre de 2026, 23:59"
  medioEntrega: "Por definir"    // p. ej. "Classroom, tarea «AWS Educate»"
};
```

## Reconstruir

```powershell
node build.mjs
```

El build concatena los estilos, diapositivas y scripts de `src/` en un único `index.html`, en orden alfabético. Si una carpeta de sección aún no existe, el build continúa. También detecta ids duplicados y avisa si falta el panel de notas de una diapositiva.

Para probar capturas sin servidor:

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --window-size=1280,720 --screenshot="docs/capturas/s0-portada-1280.png" "file:///C:/Users/danie/Repositories/Computo%20en%20la%20nube/presentacion-iaas-paas-saas/index.html?all=1#/1"
```

Si la ruta de Edge cambia en tu equipo, usa la instalación disponible de Edge o Chrome. Las fuentes tienen respaldos del sistema para funcionar aun sin internet.
