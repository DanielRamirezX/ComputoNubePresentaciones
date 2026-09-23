const $ = (id) => document.getElementById(id);

let urlActual = null;

async function pintarQr(destino) {
  if (destino === urlActual) return;
  urlActual = destino;

  $('url').textContent = destino;
  try {
    const r = await fetch('qr.svg?u=' + encodeURIComponent(destino));
    $('qr').innerHTML = await r.text();
  } catch {
    $('qr').textContent = 'No pude dibujar el código';
  }
}

async function refrescar() {
  try {
    const datos = await (await fetch('api/red')).json();
    await pintarQr(datos.principal);

    const n = datos.conectados;
    $('contador').innerHTML = n > 0
      ? `<b>${n}</b> ${n === 1 ? 'dispositivo conectado' : 'dispositivos conectados'}`
      : 'Esperando al primero…';
    // Desplegado en la nube no hay direcciones alternas y el Wi-Fi del salón
    // deja de ser un requisito: el servidor ya no vive en esta laptop.
    if (datos.publica) {
      $('paso').textContent = 'Abre esta dirección desde donde sea';
      $('nota').textContent = 'Funciona con datos del celular: ya no depende del Wi-Fi del salón.';
      $('alterna').textContent = '';
      return;
    }

    const otras = datos.direcciones.slice(1);
    $('alterna').textContent = otras.length
      ? 'Si no abre, prueba: ' + otras.map((d) => d.url).join('  ·  ')
      : '';
  } catch {
    $('contador').textContent = 'Se perdió la conexión con el servidor.';
  }
}

// La cuenta de conectados es lo único que cambia seguido; 4 s basta.
refrescar();
setInterval(refrescar, 4000);

// Misma tecla que en la presentación, para no cambiar de costumbre.
addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }
});
