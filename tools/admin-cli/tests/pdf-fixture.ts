// Generador de PDF valido minimo para pruebas: fixture propio, pequeno y
// redistribuible (bloque 06 t.12). Construye la tabla xref con offsets
// reales para que PDF.js lo acepte como cualquier PDF de verdad.

function escaparPdf(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Crea un PDF con una pagina por cada cadena de `paginas`. */
export function crearPdfConTexto(paginas: string[], titulo?: string): Buffer {
  const objetos: string[] = [];
  const numPaginas = paginas.length;

  // 1: Catalog, 2: Pages, 3: Font, luego por pagina: Page y Contents.
  const idsPagina = paginas.map((_p, i) => 4 + i * 2);
  const idsContenido = paginas.map((_p, i) => 5 + i * 2);

  objetos.push('<< /Type /Catalog /Pages 2 0 R >>');
  objetos.push(
    `<< /Type /Pages /Count ${String(numPaginas)} /Kids [${idsPagina.map((id) => `${String(id)} 0 R`).join(' ')}] >>`,
  );
  // WinAnsiEncoding: lo que declaran los PDF reales para que la ñ y las
  // tildes se extraigan como tales y no como simbolos de la tabla estandar.
  objetos.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  for (const [i, texto] of paginas.entries()) {
    const flujo = `BT /F1 12 Tf 72 720 Td (${escaparPdf(texto)}) Tj ET`;
    objetos.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(idsContenido[i])} 0 R >>`,
    );
    objetos.push(`<< /Length ${String(flujo.length)} >>\nstream\n${flujo}\nendstream`);
  }

  let idInfo = 0;
  if (titulo !== undefined) {
    objetos.push(`<< /Title (${escaparPdf(titulo)}) >>`);
    idInfo = objetos.length;
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [i, cuerpo] of objetos.entries()) {
    offsets.push(pdf.length);
    pdf += `${String(i + 1)} 0 obj\n${cuerpo}\nendobj\n`;
  }

  const inicioXref = pdf.length;
  pdf += `xref\n0 ${String(objetos.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${String(objetos.length + 1)} /Root 1 0 R${idInfo > 0 ? ` /Info ${String(idInfo)} 0 R` : ''} >>\nstartxref\n${String(inicioXref)}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/** PDF sin capa de texto: paginas validas pero vacias (simula escaneo). */
export function crearPdfSinTexto(): Buffer {
  return crearPdfConTexto(['']);
}
