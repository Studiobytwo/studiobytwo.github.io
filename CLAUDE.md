# CLAUDE.md: Studio by Two website

Working notes for the portfolio of **Studio by Two** (Arian Bayati and Paniz Nikkhah).
Live at https://studiobytwo.github.io. GitHub Pages serves the `main` branch root.
There is **no build step**: every file is served as-is. Keep it that way.

## Layout

```
index.html              entry page: boot screen, 3D stage, fallback host, HUD, noscript content
styles/base.css         fonts, colour tokens (light and dark), shared rules
styles/room.css         boot screen, stages, HUD, fallback rules
styles/os.css           StudioOS (the retro desktop)
styles/legal.css        standalone legal pages
js/main.js              entry: picks room or fallback, boot steps, HUD wiring, Escape
js/room.js              the 3D studio desk (Three.js primitives, lamp, camera, CSS3D screen)
js/os.js                StudioOS: icons, windows, projects, legal windows
js/content.js           loads content files, parses project.md and about/contact text
js/sound.js             synthesized UI sounds (off by default)
vendor/three/           Three.js r169 (MIT). Do not load from a CDN.
vendor/fonts/           self-hosted IBM Plex Mono and Silkscreen (SIL OFL)
content/projects.json   index of projects, read by StudioOS
content/<slug>/         one folder per project: project.md + WebP images
content/about.md        text for the About window
content/contact.md      text for the Contact window
content/legal/          reserved (legal text lives in impressum/ and datenschutz/)
impressum/index.html    Impressum (German). Also shown inside StudioOS.
datenschutz/index.html  Datenschutz (German). Also shown inside StudioOS.
assets/                 favicon.svg and og-image.webp
```

Keep the site fully usable without JavaScript or WebGL. The fallback path shows StudioOS full screen.

## Content: projects

Each project is a folder under `content/` plus one line in `content/projects.json`.

### Add a project

1. Create `content/<slug>/`, where `<slug>` is lowercase with dashes (e.g. `lamp-no-2`).
2. Add images named `01.webp`, `02.webp`, ... Keep them in the order you want them shown.
   - Convert to WebP, longest edge at most 2400 px, about 300 KB each at most.
   - Keep the originals out of the repo.
3. Create `content/<slug>/project.md`:

   ```
   ---
   title: Lamp No. 2
   year: 2026
   category: Lighting
   team: Arian Bayati, Paniz Nikkhah
   images:
     - 01.webp | Alt text for the first image
     - 02.webp | Alt text for the second image
   ---
   First paragraph of the project text.

   Second paragraph. Separate paragraphs with an empty line.
   Lines inside one paragraph are kept as line breaks.
   ```

   Alt text goes after `|`. Every image needs one. Plain text only: no HTML, no markdown.
4. Add an entry to `content/projects.json`:

   ```json
   { "slug": "lamp-no-2", "title": "Lamp No. 2", "year": "2026", "category": "Lighting", "cover": "01.webp" }
   ```

   `cover` is the file shown in the Projects list. Keep `title`, `year` and `category` identical to `project.md`.
5. Add the project to the `<noscript>` list in `index.html`, so visitors without JavaScript see it too.

### Edit a project
Change `project.md` (text, metadata, alt text). If the title, year or category changes, change `projects.json` too.
To change images, add or rename files and update the `images:` list.

### Remove a project
Delete the entry from `content/projects.json`, delete the folder `content/<slug>/`, and remove the line from the `<noscript>` list.

### Reorder projects
Change the order of the entries in `content/projects.json`. The Projects window lists them in that order.
The order of images is the order of the `images:` list in `project.md`.

### Placeholders
The four projects that ship with the repo are named "(Placeholder)" and use generated images.
Replace them, or delete them, when real material is ready.

## Content: text and contact

- `content/about.md` and `content/contact.md`: paragraphs separated by an empty line. Any e-mail address is turned into a `mailto:` link automatically.
- The contact address is still a placeholder. Replace `[PLACEHOLDER: studio e-mail]` and `[PLACEHOLDER: city]`.
- **Legal:** the Impressum and Datenschutz texts in `impressum/index.html` and `datenschutz/index.html` are the single source. StudioOS loads those pages and shows their `<main>`. Every `<span class="ph">[PLATZHALTER ...]</span>` is a placeholder for real details. Fill them in and have the text checked before launch.

## Changing the 3D objects

Each object in `js/room.js` is built from primitives and procedural materials, and grouped by role:

- `room` holds the walls, floor, desk and objects on the desk and shelf.
- `monitor` is the retro computer. Its front is the `hit` plane, which is the click target for the screen.
- `lamp` is the desk lamp. Its group has `userData.action = 'lamp'`, which makes it clickable.

### Swap an object for a .glb

1. Export the object as `.glb` (Y-up, metres, origin at the base or the surface it sits on). Keep it small: under 300 KB where possible, with textures compressed (KTX2 or WebP) and no more than 2048 px per texture.
2. Put the file in `models/`, e.g. `models/vessel.glb`.
3. Vendor the loader once: copy `GLTFLoader.js` from the Three.js r169 `examples/jsm/loaders/` folder into `vendor/three/`. It imports `three`, which the import map already resolves.
4. In `js/room.js`, import it and replace the primitive group:

   ```js
   import { GLTFLoader } from '/vendor/three/GLTFLoader.js';
   // ...
   const gltf = await new GLTFLoader().loadAsync('/models/vessel.glb');
   const vessel = gltf.scene;
   vessel.position.set(0.5, 1.465, -0.52);
   vessel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
   room.add(vessel);
   ```

   `createRoom` is synchronous today. If you load a model, make it async and await it in `js/main.js` inside a boot step, so the progress bar counts the download.
5. Remove the old primitive from the scene. For the lamp or the monitor, keep the `userData.action` on the group that should respond to clicks.
6. Check the boot time and the request size in the network tab.

## Changing the OS: icons and windows

- **Icons:** the list `ICONS` at the top of `js/os.js` defines label, id and the function that opens it. Add an SVG for the id in `ICON_SVG`. Add a window with a `openXyz()` function that calls `createWindow({ id, title, width })` and fills `rec.body`. Then add it to `ICONS`.
- **Windows:** `createWindow` returns `[rec, isNew]`. An open window is focused, not duplicated. Give every window a stable `id`.
- **Look:** colours are `--os-*` custom properties on `.os` in `styles/os.css`. Typography: Silkscreen for titles, IBM Plex Mono for text.
- **Sound:** `sound.play('open' | 'close' | 'click' | 'lamp' | 'confirm')` in `js/sound.js`. The default is off and the visitor switches it on.
- **Room and fallback:** the same `.os` element sits on the monitor (CSS 3D) in the room and fills the screen in fallback. Its size is 1280 x 800 px in the room. Keep the layout working at both sizes.

## Behaviour that must not regress

- Sound is off by default. There is no cookie, no `localStorage`, no tracker. Do not add any.
- Fonts are self-hosted. No Google Fonts, no CDN scripts.
- Phones (max width 767 px, or coarse pointer up to 1024 px), no WebGL, or `prefers-reduced-motion` show StudioOS full screen with no 3D.
- `devicePixelRatio` is capped at 2.
- Initial load stays under about 5 MB. The bulk is Three.js (about 0.7 MB). Images load only when a project is opened or the list is shown.

## Deploy and test loop

Run this after every change.

1. **Check locally.** Serve the folder and open it:

   ```bash
   python3 -m http.server 8000
   ```

   Then open http://localhost:8000. Open the console and watch for errors.
2. **Commit and push to `main`:**

   ```bash
   git add -A
   git commit -m "Describe the change"
   git push origin main
   ```

3. **Wait about one minute** for GitHub Pages to deploy. Check the Pages status in the repository if the page looks old.
4. **Test on https://studiobytwo.github.io** in Chrome:
   - Loading screen: progress moves, "Skip" works.
   - Camera: the room starts wide. Click the monitor: the camera glides in until the screen fills the view. "Back to room" and Escape return.
   - Lamp: click the lamp, or use "Switch lamp", to turn the light off and on.
   - StudioOS: every icon opens its window. Windows drag, close, and stack. Each project opens with its gallery and text. Next and Previous work, and so does the arrow-key gallery.
   - Impressum and Datenschutz open as windows and as `/impressum/` and `/datenschutz/`.
   - Sound: "Sound: off" becomes "Sound: on".
   - Console: no errors. Network tab: no failed requests, nothing over budget.
5. **Mobile:** test at 390 px wide. StudioOS should fill the screen with no horizontal scroll.
6. **Reduced motion:** with `prefers-reduced-motion: reduce`, the page should show StudioOS directly.
7. Fix whatever failed, push again, and repeat until it is clean.

## Things to know

- GitHub Pages caches files for about 10 minutes. A hard reload (Cmd+Shift+R) helps while you test.
- `.nojekyll` is in the repo root. Keep it. Without it, Pages runs Jekyll and skips folders that start with an underscore.
- Keep `index.html`'s `<noscript>` list in sync with `projects.json`.
