# Pruebas del modelo de la consola

`npm run verificar` corre cada archivo `*.js` de esta carpeta. Cada uno exporta:

```js
export const titulo = 'Auto Scaling';          // cómo sale en el reporte
export async function probar() { return []; }  // lista de problemas (texto); vacía = todo bien
```

Las pruebas usan solo `../../public/consola/modelo.js` (puro, sin DOM) y fijan
el reloj con `reloj.ahora = () => t` para no esperar de verdad.
