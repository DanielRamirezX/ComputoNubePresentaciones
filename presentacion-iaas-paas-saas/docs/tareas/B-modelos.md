# TAREA B — Sección 1: “Los tres modelos” (IaaS, PaaS y SaaS)

Lee primero `docs/tareas/_comun-secciones.md` y sigue sus reglas.

**Tus archivos (solo estos):**
- `src/slides/10-modelos.html`
- `src/css/sections/s1-modelos.css`
- `src/js/sections/s1-modelos.js`
- capturas: `docs/capturas/s1-*.png`

**Contenido:** las 9 diapositivas de la SECCIÓN 1 del `docs/GUION.md`, en este orden y con estos ids:
`s1-vivienda`, `s1-stack`, `s1-iaas`, `s1-paas`, `s1-saas`, `s1-ejemplos-saas`, `s1-ejemplos-paas`,
`s1-comparativa`, `s1-quiz`. `data-section="Los tres modelos"`.

**Puntos donde se juega la calidad:**
- `s1-stack` es la diapositiva estrella de toda la clase. La torre de 9 capas usa los mismos nombres y
  orden que `s0-antes`. Las capas cambian de amarillo (“tú”) al color del modelo con una cascada
  animada; el contador “Tú administras N de 9 capas” se anima; la línea divisoria tú/proveedor se
  desliza. Debe funcionar igual con clic en las pestañas y con los pasos del teclado
  (al entrar: On-premises; paso 1 = IaaS; paso 2 = PaaS; paso 3 = SaaS; retroceder deshace).
  Si el docente da clic en una pestaña y luego usa el teclado, el estado debe seguir siendo coherente.
- `s1-vivienda`: ilustraciones SVG sencillas hechas por ti para casa en obra, departamento vacío,
  departamento amueblado y hotel.
- `s1-iaas`, `s1-paas`, `s1-saas`: cada una con su animación explicativa (servidor que se divide en
  VM; código que cae en la plataforma y sale una app publicada; navegador que abre una app lista).
  Diseño consistente entre las tres (misma estructura, cambia el color del modelo).
- `s1-quiz`: tarjetas volteables (reutiliza el componente de la base). Clic voltea una; cada paso
  del teclado voltea la siguiente en orden; retroceder la regresa.

**Aceptación observable:** build sin errores; capturas 1280×720 y 390×844 de las 9 diapositivas
revisadas; `s1-stack` y `s1-quiz` probadas con teclado y clic; sin errores de consola.
En tu `worker_done` lista los archivos y cualquier necesidad de cambio en archivos compartidos.
