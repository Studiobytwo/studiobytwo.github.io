// StudioOS: a small retro desktop rendered as real HTML, so text stays crisp,
// selectable and reachable by screen readers. It is the same element whether
// it sits on the monitor in the 3D room or fills the screen in fallback mode.
import { loadJSON, loadText, parseDoc, renderParagraphs } from './content.js';

const ICON_SVG = {
  projects:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 7h9l3 3h14v17H3z" fill="#e9c46a" stroke="#1d1b18" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 13h26" stroke="#1d1b18" stroke-width="1.5"/></svg>',
  about:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 3.5h12.5L25 9v19.5H7z" fill="#f4efe4" stroke="#1d1b18" stroke-width="1.5" stroke-linejoin="round"/><path d="M11 16h10M11 20h10M11 24h7" stroke="#1d1b18" stroke-width="1.5"/></svg>',
  contact:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="7.5" width="26" height="17" fill="#f4efe4" stroke="#1d1b18" stroke-width="1.5"/><path d="M3.5 8.5 16 18.5l12.5-10" fill="none" stroke="#1d1b18" stroke-width="1.5"/></svg>',
  impressum:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 3.5h12.5L25 9v19.5H7z" fill="#f4efe4" stroke="#1d1b18" stroke-width="1.5" stroke-linejoin="round"/><text x="16" y="25" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="17" font-weight="600" fill="#1d1b18">§</text></svg>',
  datenschutz:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="14" width="18" height="13" fill="#8fb3e6" stroke="#1d1b18" stroke-width="1.5"/><path d="M11 14v-4a5 5 0 0 1 10 0v4" fill="none" stroke="#1d1b18" stroke-width="1.5"/><circle cx="16" cy="20" r="1.8" fill="#1d1b18"/></svg>',
};

const ICONS = [
  { id: 'projects', label: 'Projects', open: (os) => os.openProjects() },
  { id: 'about', label: 'About', open: (os) => os.openAbout() },
  { id: 'contact', label: 'Contact', open: (os) => os.openContact() },
  { id: 'impressum', label: 'Impressum', open: (os) => os.openLegal('impressum') },
  { id: 'datenschutz', label: 'Datenschutz', open: (os) => os.openLegal('datenschutz') },
];

const NARROW = '(max-width: 767px)';
const CASCADE_STEP = 26;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function status(text) {
  return el('p', 'os-status', text);
}

export function createOS({ sound }) {
  const root = el('div', 'os');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'StudioOS, a retro desktop with Projects, About, Contact and legal pages');
  root.innerHTML = `
    <header class="os-menubar">
      <span class="os-brand">StudioOS</span>
      <time class="os-clock"></time>
    </header>
    <div class="os-desktop">
      <nav class="os-icons" aria-label="Desktop icons"></nav>
    </div>`;
  const desktop = root.querySelector('.os-desktop');
  const iconNav = root.querySelector('.os-icons');
  const clock = root.querySelector('.os-clock');

  const state = {
    projects: [],
    about: null,
    contact: null,
    windows: [], // stacking order: last is on top
    cascade: 0,
    lastPointer: 'mouse',
  };

  function tick() {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    clock.dateTime = now.toISOString();
  }
  tick();
  setInterval(tick, 15000);

  // ---- icons ---------------------------------------------------------------
  function selectIcon(button) {
    iconNav.querySelectorAll('.os-icon.is-selected').forEach((b) => b.classList.remove('is-selected'));
    button.classList.add('is-selected');
  }

  for (const def of ICONS) {
    const button = el('button', 'os-icon');
    button.type = 'button';
    button.dataset.id = def.id;
    button.innerHTML = `<span class="os-icon-art">${ICON_SVG[def.id]}</span><span class="os-icon-label"></span>`;
    button.querySelector('.os-icon-label').textContent = def.label;
    button.setAttribute('aria-label', `Open ${def.label}`);
    button.addEventListener('pointerdown', (e) => {
      state.lastPointer = e.pointerType;
    });
    button.addEventListener('click', (e) => {
      // A single mouse click selects; a double click (or a tap, or Enter) opens.
      if (e.detail === 1 && state.lastPointer !== 'touch') {
        selectIcon(button);
        return;
      }
      selectIcon(button);
      def.open(api);
    });
    iconNav.append(button);
  }

  desktop.addEventListener('pointerdown', (e) => {
    if (e.target === desktop) {
      iconNav.querySelectorAll('.os-icon.is-selected').forEach((b) => b.classList.remove('is-selected'));
    }
  });

  // ---- windows -------------------------------------------------------------
  function focusWindow(rec) {
    state.windows = state.windows.filter((w) => w !== rec);
    state.windows.push(rec);
    state.windows.forEach((w, i) => {
      w.el.style.zIndex = String(10 + i);
      w.el.classList.toggle('is-active', w === rec);
    });
    rec.el.focus({ preventScroll: true });
  }

  function isNarrow() {
    return window.matchMedia(NARROW).matches;
  }

  function bindDrag(handle, rec) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      focusWindow(rec);
      if (isNarrow()) return;
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY, left: rec.el.offsetLeft, top: rec.el.offsetTop };
      handle.setPointerCapture(e.pointerId);
      rec.el.classList.add('is-dragging');

      const move = (ev) => {
        const maxLeft = desktop.clientWidth - 80;
        const maxTop = desktop.clientHeight - 40;
        const left = Math.min(maxLeft, Math.max(-rec.el.offsetWidth + 120, start.left + ev.clientX - start.x));
        const top = Math.min(maxTop, Math.max(0, start.top + ev.clientY - start.y));
        rec.el.style.left = `${left}px`;
        rec.el.style.top = `${top}px`;
      };
      const end = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        rec.el.classList.remove('is-dragging');
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
  }

  // Returns [record, isNew]. An already open window is focused instead.
  function createWindow({ id, title, width, className = '' }) {
    const existing = state.windows.find((w) => w.id === id);
    if (existing) {
      focusWindow(existing);
      return [existing, false];
    }

    const safe = id.replace(/[^\w-]/g, '-');
    const win = el('section', `os-window ${className}`.trim());
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-labelledby', `${safe}-title`);
    win.tabIndex = -1;

    const bar = el('header', 'os-titlebar');
    const close = el('button', 'os-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', `Close ${title}`);
    const heading = el('h2', 'os-title', title);
    heading.id = `${safe}-title`;
    bar.append(close, heading);

    const body = el('div', 'os-body');
    win.append(bar, body);

    const offset = (state.cascade % 8) * CASCADE_STEP;
    state.cascade += 1;
    win.style.left = `${150 + offset}px`;
    win.style.top = `${36 + offset}px`;
    win.style.maxHeight = `calc(100% - ${52 + offset}px)`;
    if (width) win.style.width = width;

    const rec = { id, el: win, body, opener: document.activeElement };
    desktop.append(win);
    bindDrag(bar, rec);
    close.addEventListener('click', () => closeWindow(rec));
    focusWindow(rec);
    sound.play('open');
    return [rec, true];
  }

  function closeWindow(rec) {
    const index = state.windows.indexOf(rec);
    if (index === -1) return;
    state.windows.splice(index, 1);
    rec.el.remove();
    sound.play('close');
    const top = state.windows[state.windows.length - 1];
    if (top) {
      focusWindow(top);
    } else if (rec.opener && root.contains(rec.opener)) {
      rec.opener.focus({ preventScroll: true });
    }
  }

  function closeTopWindow() {
    const top = state.windows[state.windows.length - 1];
    if (!top) return false;
    closeWindow(top);
    return true;
  }

  // ---- window contents -----------------------------------------------------
  function openProjects() {
    const [rec, isNew] = createWindow({ id: 'projects', title: 'Projects', width: 'min(560px, 92%)' });
    if (!isNew) return;
    if (!state.projects.length) {
      rec.body.append(status('No projects yet.'));
      return;
    }
    const list = el('ul', 'os-list');
    let group = null;
    for (const p of state.projects) {
      if (p.group && p.group !== group) {
        group = p.group;
        const heading = el('li', 'os-group');
        heading.append(el('h3', '', group));
        list.append(heading);
      }
      const item = el('li');
      const button = el('button', 'os-row');
      button.type = 'button';
      const thumb = el('img', 'os-thumb-img');
      thumb.src = `/content/${p.slug}/${p.cover || '01.webp'}`;
      thumb.alt = '';
      thumb.width = 160;
      thumb.height = 120;
      thumb.loading = 'lazy';
      thumb.decoding = 'async';
      const text = el('span', 'os-row-text');
      text.append(el('strong', '', p.title), el('span', 'os-meta', [p.year, p.category].filter(Boolean).join(' · ')));
      button.append(thumb, text);
      button.addEventListener('click', () => openProject(p));
      item.append(button);
      list.append(item);
    }
    rec.body.append(list);
  }

  async function openProject(p) {
    const [rec, isNew] = createWindow({ id: `project-${p.slug}`, title: p.title, width: 'min(680px, 92%)', className: 'os-project' });
    if (!isNew) return;
    rec.body.append(status('Loading…'));
    try {
      const doc = parseDoc(await loadText(`/content/${p.slug}/project.md`));
      rec.body.replaceChildren(buildProject(p, doc));
    } catch (err) {
      console.error(err);
      rec.body.replaceChildren(status('This project could not be loaded. Reload the page to try again.'));
    }
  }

  function buildProject(p, doc) {
    const article = el('article', 'os-article');
    const facts = [doc.meta.year || p.year, doc.meta.category || p.category, doc.meta.team].filter(Boolean);
    article.append(el('p', 'os-meta', facts.join(' · ')));
    if (doc.images.length) article.append(buildGallery(p.slug, doc.images));
    article.append(renderParagraphs(el('div', 'os-text'), doc.paragraphs));
    return article;
  }

  function buildGallery(slug, images) {
    const figure = el('figure', 'os-gallery');
    figure.tabIndex = 0;
    figure.setAttribute('aria-label', 'Image gallery. Use the left and right arrow keys to browse.');

    const stage = el('div', 'os-stage');
    const photo = el('img', 'os-photo');
    photo.decoding = 'async';
    stage.append(photo);

    const bar = el('div', 'os-gallery-bar');
    const prev = el('button', 'os-btn', '‹ Prev');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous image');
    const next = el('button', 'os-btn', 'Next ›');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next image');
    const count = el('span', 'os-count');
    count.setAttribute('aria-live', 'polite');
    bar.append(prev, count, next);

    const thumbs = el('div', 'os-thumbs');
    let index = 0;

    function show(i) {
      index = (i + images.length) % images.length;
      const image = images[index];
      photo.src = `/content/${slug}/${image.file}`;
      photo.alt = image.alt;
      count.textContent = `${index + 1} / ${images.length}`;
      thumbs.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-current', j === index ? 'true' : 'false'));
      const upcoming = images[(index + 1) % images.length];
      new Image().src = `/content/${slug}/${upcoming.file}`;
    }

    images.forEach((image, i) => {
      const b = el('button', 'os-thumb');
      b.type = 'button';
      b.setAttribute('aria-label', `Show image ${i + 1} of ${images.length}`);
      const t = el('img');
      t.src = `/content/${slug}/${image.file}`;
      t.alt = '';
      t.loading = 'lazy';
      t.decoding = 'async';
      b.append(t);
      b.addEventListener('click', () => show(i));
      thumbs.append(b);
    });

    prev.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => show(index + 1));
    figure.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        show(index - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        show(index + 1);
      }
    });

    figure.append(stage, bar, thumbs);
    show(0);
    return figure;
  }

  function openAbout() {
    const [rec, isNew] = createWindow({ id: 'about', title: 'About', width: 'min(520px, 92%)' });
    if (!isNew) return;
    if (state.about) rec.body.append(renderParagraphs(el('article', 'os-article os-text'), state.about.paragraphs));
    else rec.body.append(status('About could not be loaded.'));
  }

  function openContact() {
    const [rec, isNew] = createWindow({ id: 'contact', title: 'Contact', width: 'min(520px, 92%)' });
    if (!isNew) return;
    if (state.contact) rec.body.append(renderParagraphs(el('article', 'os-article os-text'), state.contact.paragraphs));
    else rec.body.append(status('Contact details could not be loaded.'));
  }

  async function openLegal(kind) {
    const title = kind === 'impressum' ? 'Impressum' : 'Datenschutz';
    const [rec, isNew] = createWindow({ id: kind, title, width: 'min(620px, 92%)', className: 'os-doc-window' });
    if (!isNew) return;
    rec.body.append(status('Loading…'));
    try {
      const res = await fetch(`/${kind}/`);
      if (!res.ok) throw new Error(`${res.status}`);
      const parsed = new DOMParser().parseFromString(await res.text(), 'text/html');
      const main = parsed.querySelector('main');
      const doc = el('div', 'os-doc');
      doc.innerHTML = main.innerHTML;
      doc.querySelector('h1')?.remove();
      // Links to the other legal page open as windows inside StudioOS.
      doc.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        const href = a && a.getAttribute('href');
        if (href === '/impressum/' || href === '/datenschutz/') {
          e.preventDefault();
          openLegal(href.slice(1, -1));
        }
      });
      rec.body.replaceChildren(doc);
    } catch (err) {
      console.error(err);
      const msg = status(`${title} could not be loaded. Open the page directly: `);
      const link = el('a', '', `/${kind}/`);
      link.href = `/${kind}/`;
      msg.append(link);
      rec.body.replaceChildren(msg);
    }
  }

  // ---- public API ----------------------------------------------------------
  const api = {
    get root() {
      return root;
    },
    async load() {
      const [projects, about, contact] = await Promise.all([
        loadJSON('/content/projects.json'),
        loadText('/content/about.md'),
        loadText('/content/contact.md'),
      ]);
      state.projects = projects;
      state.about = parseDoc(about);
      state.contact = parseDoc(contact);
    },
    mount(parent, { fullscreen }) {
      root.classList.toggle('os-fullscreen', fullscreen);
      parent.append(root);
    },
    openProjects,
    openAbout,
    openContact,
    openLegal,
    closeTopWindow,
    get hasWindows() {
      return state.windows.length > 0;
    },
  };
  return api;
}
