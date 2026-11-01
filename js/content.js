// Loads the content files and turns them into data StudioOS can render.
// Format: see CLAUDE.md. Only plain text is supported (no HTML, no markdown
// beyond the front matter and blank-line paragraphs).

export async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export async function loadText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// Returns { meta, images, paragraphs }.
// meta: "key: value" pairs from the front matter. A key with no value followed
// by "  - item" lines becomes a list (used for `images`: "file | alt | caption",
// where the caption is optional).
// paragraphs: array of paragraphs, each an array of lines.
export function parseDoc(source) {
  const text = source.replace(/\r\n?/g, '\n');
  const meta = {};
  let body = text;

  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---', 4);
    if (end !== -1) {
      body = text.slice(end + 4);
      let listKey = null;
      for (const raw of text.slice(4, end).split('\n')) {
        if (!raw.trim()) continue;
        const item = raw.match(/^\s*-\s+(.*)$/);
        if (item && listKey) {
          const [file, alt = '', caption = ''] = item[1].split('|').map((part) => part.trim());
          meta[listKey].push({ file, alt, caption });
          continue;
        }
        const kv = raw.match(/^([\w-]+):\s*(.*)$/);
        if (!kv) continue;
        if (kv[2] === '') {
          listKey = kv[1];
          meta[listKey] = [];
        } else {
          listKey = null;
          meta[kv[1]] = kv[2].trim();
        }
      }
    }
  }

  const paragraphs = body
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length);

  return { meta, images: meta.images || [], paragraphs };
}

const LINK = /https?:\/\/[^\s]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

// Writes text into `parent`, turning web addresses and e-mail addresses into links.
function appendText(parent, text) {
  let rest = text;
  let m;
  while ((m = rest.match(LINK))) {
    parent.append(rest.slice(0, m.index));
    const a = document.createElement('a');
    if (m[0].startsWith('http')) {
      a.href = m[0];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } else {
      a.href = `mailto:${m[0]}`;
    }
    a.textContent = m[0];
    parent.append(a);
    rest = rest.slice(m.index + m[0].length);
  }
  parent.append(rest);
}

// Renders parsed paragraphs into a container as <p> elements. A block whose
// first line starts with "## " begins with a heading.
export function renderParagraphs(container, paragraphs) {
  for (let lines of paragraphs) {
    if (lines[0].startsWith('## ')) {
      const h = document.createElement('h3');
      h.textContent = lines[0].slice(3);
      container.append(h);
      lines = lines.slice(1);
      if (!lines.length) continue;
    }
    const p = document.createElement('p');
    lines.forEach((line, i) => {
      if (i) p.append(document.createElement('br'));
      appendText(p, line);
    });
    container.append(p);
  }
  return container;
}
