// Un generador de PDF mínimo, sin dependencias (ver src/servidor.js: el módulo
// no instala nada). Alcanza para reportes: texto en Helvetica, rectángulos,
// líneas, imágenes JPEG y varias páginas tamaño carta.
//
// Corre igual en el servidor (el reporte del examen, vía src/pdf.js) y en el
// navegador (el PDF de evidencias del laboratorio, que se arma sin subir las
// capturas a ningún lado). Por eso no usa Buffer: todo son Uint8Array.
//
// Las fuentes son las 14 estándar del formato PDF, así que no se incrusta
// ningún archivo. Con la codificación WinAnsi cubren el español completo
// (á, ñ, ü, ¿, ¡, comillas tipográficas); lo que no cabe se cambia por "?".
//
// Las coordenadas se dan desde la esquina superior izquierda, en puntos
// (72 = una pulgada), que es como se piensa un diseño; el PDF las cuenta desde
// abajo y aquí se voltean.

export const ANCHO = 612;
export const ALTO = 792;

// Anchos de Helvetica y Helvetica-Bold (en milésimas del tamaño) para los
// caracteres 32 a 126. Sirven para partir renglones sin salirse del margen.
const ANCHOS = {
  normal: [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
    556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
    556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
  ],
  negrita: [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
    556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
    611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
  ]
};

// Lo que WinAnsi guarda fuera del rango latin-1.
const WIN_ANSI = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

function byteDe(c) {
  if (WIN_ANSI[c]) return WIN_ANSI[c];
  const codigo = c.codePointAt(0);
  return codigo < 256 ? codigo : 0x3f; // "?"
}

/** Ancho de un texto en puntos. Las letras acentuadas miden lo que su letra base. */
export function anchoTexto(texto, tamano, negrita = false) {
  const tabla = negrita ? ANCHOS.negrita : ANCHOS.normal;
  let total = 0;
  for (const c of String(texto)) {
    const base = c.normalize('NFD')[0].codePointAt(0);
    total += base >= 32 && base <= 126 ? tabla[base - 32] : 556;
  }
  return (total * tamano) / 1000;
}

/** Parte un texto en renglones que caben en `ancho`. */
export function partir(texto, ancho, tamano, negrita = false) {
  const renglones = [];
  let actual = '';
  for (const palabra of String(texto).split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && anchoTexto(prueba, tamano, negrita) > ancho) {
      renglones.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) renglones.push(actual);
  return renglones;
}

const cadena = (texto) =>
  '(' +
  Array.from(String(texto), (c) => {
    if (c === '(' || c === ')' || c === '\\') return '\\' + c;
    return String.fromCharCode(byteDe(c));
  }).join('') +
  ')';

const num = (n) => Number(n.toFixed(2)).toString();
const colorRelleno = ([r, g, b]) => `${num(r / 255)} ${num(g / 255)} ${num(b / 255)} rg`;
const colorTrazo = ([r, g, b]) => `${num(r / 255)} ${num(g / 255)} ${num(b / 255)} RG`;

// Todo lo que va al archivo es texto de un byte por letra (latin-1) o bytes
// crudos; `cadena` ya dejó cada letra en ese rango.
const bytesDe = (texto) => Uint8Array.from(texto, (c) => c.charCodeAt(0) & 0xff);

function unir(partes) {
  const total = partes.reduce((suma, p) => suma + p.length, 0);
  const salida = new Uint8Array(total);
  let posicion = 0;
  for (const parte of partes) {
    salida.set(parte, posicion);
    posicion += parte.length;
  }
  return salida;
}

export function crearPdf({ titulo = '' } = {}) {
  const paginas = [];
  // Qué imágenes usa cada página, en paralelo a `paginas`.
  const usos = [];
  const imagenes = [];
  let ops = null;
  let uso = null;

  const pdf = {
    nuevaPagina() {
      ops = [];
      uso = new Set();
      paginas.push(ops);
      usos.push(uso);
    },

    get totalPaginas() {
      return paginas.length;
    },

    /** Regresa a una página ya creada (base 0), por ejemplo para ponerle pie. */
    irA(indice) {
      ops = paginas[indice];
      uso = usos[indice];
    },

    texto(x, y, texto, { tamano = 11, negrita = false, color = [22, 24, 29], alinear = 'izquierda' } = {}) {
      let xReal = x;
      if (alinear === 'derecha') xReal = x - anchoTexto(texto, tamano, negrita);
      if (alinear === 'centro') xReal = x - anchoTexto(texto, tamano, negrita) / 2;
      ops.push(`BT ${colorRelleno(color)} /${negrita ? 'F2' : 'F1'} ${tamano} Tf ${num(xReal)} ${num(ALTO - y)} Td ${cadena(texto)} Tj ET`);
    },

    rect(x, y, ancho, alto, { relleno, borde, grosor = 1 } = {}) {
      const partes = [];
      if (relleno) partes.push(colorRelleno(relleno));
      if (borde) partes.push(colorTrazo(borde), `${num(grosor)} w`);
      partes.push(`${num(x)} ${num(ALTO - y - alto)} ${num(ancho)} ${num(alto)} re`);
      partes.push(relleno && borde ? 'B' : relleno ? 'f' : 'S');
      ops.push(partes.join(' '));
    },

    linea(x1, y1, x2, y2, { color = [22, 24, 29], grosor = 1 } = {}) {
      ops.push(`${colorTrazo(color)} ${num(grosor)} w ${num(x1)} ${num(ALTO - y1)} m ${num(x2)} ${num(ALTO - y2)} l S`);
    },

    /**
     * Dibuja un JPEG en RGB (el que sale de canvas.toBlob('image/jpeg')) en la
     * caja x, y, ancho, alto. El JPEG entra tal cual: el PDF lo sabe leer.
     * @param {{bytes: Uint8Array, ancho: number, alto: number}} jpeg  ancho y alto en pixeles
     */
    imagen(x, y, ancho, alto, jpeg) {
      let indice = imagenes.indexOf(jpeg);
      if (indice < 0) indice = imagenes.push(jpeg) - 1;
      uso.add(indice);
      ops.push(`q ${num(ancho)} 0 0 ${num(alto)} ${num(x)} ${num(ALTO - y - alto)} cm /Im${indice + 1} Do Q`);
    },

    /** Arma el archivo: catálogo, páginas, dos fuentes, las imágenes y un flujo por página. */
    bytes() {
      const objetos = [];
      const agregar = (contenido) => {
        objetos.push(contenido);
        return objetos.length;
      };
      const flujo = (diccionario, datos) =>
        unir([bytesDe(`<< ${diccionario}/Length ${datos.length} >>\nstream\n`), datos, bytesDe('\nendstream')]);

      const catalogo = agregar(null);
      const arbol = agregar(null);
      const f1 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      const f2 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const info = agregar(`<< /Title ${cadena(titulo)} /Producer (Cómputo en la Nube) >>`);
      const objetosImagen = imagenes.map((img) =>
        agregar(flujo(
          `/Type /XObject /Subtype /Image /Width ${img.ancho} /Height ${img.alto} ` +
            '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ',
          img.bytes
        ))
      );

      const hojas = paginas.map((lista, p) => {
        const contenido = agregar(flujo('', bytesDe(lista.join('\n'))));
        const propias = [...usos[p]].map((k) => `/Im${k + 1} ${objetosImagen[k]} 0 R`).join(' ');
        return agregar(
          `<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] ` +
            `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> ${propias ? `/XObject << ${propias} >> ` : ''}>> /Contents ${contenido} 0 R >>`
        );
      });

      objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${arbol} 0 R >>`;
      objetos[arbol - 1] = `<< /Type /Pages /Kids [${hojas.map((h) => `${h} 0 R`).join(' ')}] /Count ${hojas.length} >>`;

      const partes = [bytesDe('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
      let posicion = partes[0].length;
      const inicios = [];
      objetos.forEach((contenido, i) => {
        const cuerpo = typeof contenido === 'string' ? bytesDe(contenido) : contenido;
        const bloque = unir([bytesDe(`${i + 1} 0 obj\n`), cuerpo, bytesDe('\nendobj\n')]);
        inicios.push(posicion);
        partes.push(bloque);
        posicion += bloque.length;
      });

      const xref = [
        'xref',
        `0 ${objetos.length + 1}`,
        '0000000000 65535 f ',
        ...inicios.map((p) => `${String(p).padStart(10, '0')} 00000 n `),
        'trailer',
        `<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>`,
        'startxref',
        String(posicion),
        '%%EOF'
      ].join('\n');
      partes.push(bytesDe(xref + '\n'));
      return unir(partes);
    }
  };

  pdf.nuevaPagina();
  return pdf;
}
