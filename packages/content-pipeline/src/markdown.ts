// Markdown -> HTML (subconjunto documental). Se convierte en construccion y
// el resultado pasa por sanearHtml: ningun HTML crudo incrustado en el
// Markdown sobrevive sin pasar la lista blanca.

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Marcas en linea: enfasis, codigo y enlaces. */
function enLinea(texto: string): string {
  let salida = escapar(texto);
  salida = salida.replace(/`([^`]+)`/g, (_t, codigo: string) => `<code>${codigo}</code>`);
  salida = salida.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_t, alt: string, url: string) => {
    return `<img src="${url}" alt="${alt}">`;
  });
  salida = salida.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_t, txt: string, url: string) => {
    return `<a href="${url}">${txt}</a>`;
  });
  salida = salida.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  salida = salida.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  salida = salida.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return salida;
}

export function markdownAHtml(markdown: string): string {
  const lineas = markdown.normalize('NFC').replace(/\r\n/g, '\n').split('\n');
  const salida: string[] = [];
  let enCodigo = false;
  let listaAbierta: 'ul' | 'ol' | null = null;
  let parrafo: string[] = [];

  const cerrarParrafo = (): void => {
    if (parrafo.length > 0) {
      salida.push(`<p>${enLinea(parrafo.join(' '))}</p>`);
      parrafo = [];
    }
  };
  const cerrarLista = (): void => {
    if (listaAbierta !== null) {
      salida.push(`</${listaAbierta}>`);
      listaAbierta = null;
    }
  };

  for (const linea of lineas) {
    if (/^\s*```/.test(linea)) {
      cerrarParrafo();
      cerrarLista();
      salida.push(enCodigo ? '</code></pre>' : '<pre><code>');
      enCodigo = !enCodigo;
      continue;
    }
    if (enCodigo) {
      salida.push(`${escapar(linea)}\n`);
      continue;
    }

    const encabezado = /^(#{1,6})\s+(.*)$/.exec(linea);
    if (encabezado !== null) {
      cerrarParrafo();
      cerrarLista();
      const nivel = (encabezado[1] ?? '#').length;
      salida.push(
        `<h${String(nivel)}>${enLinea((encabezado[2] ?? '').trim())}</h${String(nivel)}>`,
      );
      continue;
    }

    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(linea)) {
      cerrarParrafo();
      cerrarLista();
      salida.push('<hr>');
      continue;
    }

    const itemDesordenado = /^\s*[-*+]\s+(.*)$/.exec(linea);
    const itemOrdenado = /^\s*\d+[.)]\s+(.*)$/.exec(linea);
    if (itemDesordenado !== null || itemOrdenado !== null) {
      cerrarParrafo();
      const tipo = itemDesordenado !== null ? 'ul' : 'ol';
      if (listaAbierta !== tipo) {
        cerrarLista();
        salida.push(`<${tipo}>`);
        listaAbierta = tipo;
      }
      salida.push(`<li>${enLinea((itemDesordenado?.[1] ?? itemOrdenado?.[1] ?? '').trim())}</li>`);
      continue;
    }

    const cita = /^\s*>\s?(.*)$/.exec(linea);
    if (cita !== null) {
      cerrarParrafo();
      cerrarLista();
      salida.push(`<blockquote><p>${enLinea(cita[1] ?? '')}</p></blockquote>`);
      continue;
    }

    if (linea.trim().length === 0) {
      cerrarParrafo();
      cerrarLista();
      continue;
    }
    parrafo.push(linea.trim());
  }

  cerrarParrafo();
  cerrarLista();
  if (enCodigo) salida.push('</code></pre>');
  return salida.join('');
}

/** TXT -> HTML respetando parrafos, con escape total. */
export function textoAHtml(texto: string): string {
  return texto
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapar(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
