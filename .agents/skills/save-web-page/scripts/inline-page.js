/**
 * save-web-page: serialize the current (post-JavaScript) page into ONE
 * self-contained HTML string — CSS inlined, images/fonts as base64 data: URIs,
 * same-origin iframes as srcdoc, open shadow roots as declarative shadow DOM.
 *
 * Inject in the page context, e.g. CDP:
 *   Runtime.evaluate({ expression: <this file>, awaitPromise: true, returnByValue: true })
 * Optional: set window.__SAVE_WEB_PAGE_OPTIONS__ = { ... } before injecting.
 *
 * Resolves to a small summary. The HTML is stored on
 * window.__SAVE_WEB_PAGE_RESULT__.html (and downloaded when options.download).
 */
(async (userOptions) => {
  const opts = {
    settle: true,
    autoScroll: true,
    quietMs: 1000,
    settleTimeoutMs: 15000,
    stripScripts: true,
    fetchTimeoutMs: 20000,
    maxAssetBytes: 25 * 1024 * 1024,
    download: false,
    filename: '',
    ...(userOptions || {}),
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const unresolved = new Set();
  const cache = new Map();
  const inertDoc = document.implementation.createHTMLDocument('');
  let inlinedAssets = 0;

  const MIME = {
    svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
    bmp: 'image/bmp', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf',
    otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  };
  const DROP_RELS = ['preload', 'prefetch', 'preconnect', 'dns-prefetch', 'modulepreload', 'prerender', 'manifest'];
  const ICON_RELS = ['icon', 'shortcut', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'mask-icon'];
  const URL_ATTRS = ['src', 'href', 'xlink:href', 'poster', 'action', 'formaction', 'background'];
  const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi;
  const CSS_IMPORT_RE = /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^)'"\s;]+))\s*\)?\s*([^;]*);/gi;

  const abs = (url, base) => {
    try { return new URL(url, base).href; } catch { return null; }
  };
  const skip = (url) => !url || url.startsWith('#') || /^(data|about|javascript|mailto|tel):/i.test(url);

  async function settle() {
    const deadline = Date.now() + opts.settleTimeoutMs;
    const left = () => Math.max(0, deadline - Date.now());
    while (document.readyState !== 'complete' && left()) await sleep(100);
    if (opts.autoScroll) {
      const scroller = document.scrollingElement || document.documentElement;
      for (let y = 0, i = 0; i < 60 && left(); i++) {
        y += Math.max(200, innerHeight * 0.8);
        scrollTo(0, y);
        await sleep(200);
        if (y >= scroller.scrollHeight) break;
      }
      scrollTo(0, 0);
    }
    if (document.fonts) await Promise.race([document.fonts.ready, sleep(Math.min(3000, left()))]);
    const pending = [...document.images].filter((img) => !img.complete);
    await Promise.race([
      Promise.all(pending.map((img) => new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      }))),
      sleep(Math.min(5000, left())),
    ]);
    let lastMutation = Date.now();
    const observer = new MutationObserver(() => { lastMutation = Date.now(); });
    observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    while (Date.now() - lastMutation < opts.quietMs && left()) await sleep(100);
    observer.disconnect();
  }

  function guessMime(url) {
    try { return MIME[new URL(url).pathname.split('.').pop().toLowerCase()]; } catch { return undefined; }
  }

  function blobToDataUrl(blob, url) {
    const generic = !blob.type || /^(application|binary)\/octet-stream$|^text\/plain/.test(blob.type);
    const type = generic ? guessMime(url) || blob.type || 'application/octet-stream' : blob.type;
    const typed = type === blob.type ? blob : new Blob([blob], { type });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(typed);
    });
  }

  // Fallback when fetch() is blocked (CSP connect-src): <img> obeys img-src instead.
  function imageViaCanvas(url) {
    return new Promise((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => resolve(null), opts.fetchTimeoutMs);
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          if (!canvas.width || !canvas.height) return resolve(null);
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => { clearTimeout(timer); resolve(null); };
      img.src = url;
    });
  }

  function fetchResource(url, as) {
    const key = `${as} ${url}`;
    if (!cache.has(key)) {
      cache.set(key, (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), opts.fetchTimeoutMs);
        try {
          const res = await fetch(url, { signal: controller.signal, cache: 'force-cache' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          if (as === 'text') return await res.text();
          const blob = await res.blob();
          if (blob.size > opts.maxAssetBytes) throw new Error('asset too large');
          const data = await blobToDataUrl(blob, url);
          inlinedAssets++;
          return data;
        } catch {
          const data = as === 'data' && !/^font\//.test(guessMime(url) || '') ? await imageViaCanvas(url) : null;
          if (data) {
            inlinedAssets++;
            return data;
          }
          unresolved.add(url);
          return null;
        } finally {
          clearTimeout(timer);
        }
      })());
    }
    return cache.get(key);
  }

  const toDataUrl = (url, base) => {
    const u = abs(url, base);
    return u ? fetchResource(u, 'data') : Promise.resolve(null);
  };

  function pruneFontSources(css) {
    return css.replace(/@font-face\s*\{[^}]*\}/gi, (block) =>
      block.replace(/(^|[{;\s])src\s*:\s*([^;}]+)/i, (decl, lead, value) => {
        const parts = value.split(/,(?![^(]*\))/).map((p) => p.trim());
        const woff2 = parts.find((p) => /format\(\s*['"]?woff2/i.test(p) || /\.woff2(?:[?#][^)'"]*)?['"]?\s*\)/i.test(p));
        if (!woff2) return decl;
        const locals = parts.filter((p) => /^local\(/i.test(p));
        return `${lead}src: ${[...locals, woff2].join(', ')}`;
      }));
  }

  async function inlineCssUrls(css, base) {
    if (!css) return css;
    css = pruneFontSources(css);
    const found = new Map();
    for (const m of css.matchAll(CSS_URL_RE)) {
      const raw = m[1] ?? m[2] ?? m[3];
      if (!skip(raw) && !found.has(raw)) found.set(raw, toDataUrl(raw, base));
    }
    const resolved = new Map();
    for (const [raw, promise] of found) resolved.set(raw, await promise);
    return css.replace(CSS_URL_RE, (whole, a, b, c) => {
      const raw = a ?? b ?? c;
      if (skip(raw)) return whole;
      const replacement = resolved.get(raw) || abs(raw, base);
      return replacement ? `url("${replacement.replace(/"/g, '%22')}")` : whole;
    });
  }

  async function flattenImports(css, base, depth) {
    let out = '';
    let last = 0;
    for (const m of css.matchAll(CSS_IMPORT_RE)) {
      out += css.slice(last, m.index);
      last = m.index + m[0].length;
      const url = abs(m[1] ?? m[2] ?? m[3], base);
      const inner = url && depth < 8 ? await cssFromUrl(url, depth + 1) : null;
      if (inner == null) {
        out += url ? `@import url("${url}") ${m[4]};` : m[0];
        continue;
      }
      const media = m[4].trim();
      out += media && !/^(layer|supports)\b/i.test(media) ? `@media ${media} {\n${inner}\n}` : inner;
    }
    return out + css.slice(last);
  }

  async function cssFromUrl(url, depth = 0) {
    const text = await fetchResource(url, 'text');
    return text == null ? null : inlineCssUrls(await flattenImports(text, url, depth), url);
  }

  async function sheetCss(sheet, fallbackBase, depth = 0) {
    const base = sheet.href || sheet.ownerNode?.baseURI || fallbackBase;
    let rules = null;
    try { rules = sheet.cssRules; } catch { /* cross-origin without CORS */ }
    if (!rules) return sheet.href ? cssFromUrl(sheet.href, depth) : null;
    const parts = [];
    for (const rule of rules) {
      if (rule instanceof CSSImportRule) {
        const inner = rule.styleSheet && depth < 8 ? await sheetCss(rule.styleSheet, base, depth + 1) : null;
        const media = rule.media?.mediaText;
        if (inner != null) parts.push(media ? `@media ${media} {\n${inner}\n}` : inner);
        else if (abs(rule.href, base)) unresolved.add(abs(rule.href, base));
      } else {
        parts.push(rule.cssText);
      }
    }
    return inlineCssUrls(parts.join('\n'), base);
  }

  function adoptedStyle(sheets, base, tasks) {
    if (!sheets?.length) return null;
    const style = inertDoc.createElement('style');
    tasks.push(Promise.all(sheets.map((s) => sheetCss(s, base)))
      .then((parts) => { style.textContent = parts.filter(Boolean).join('\n'); }));
    return style;
  }

  function cloneStyle(el, doc, tasks) {
    if (el.sheet?.disabled) return null;
    const copy = inertDoc.importNode(el, false);
    copy.removeAttribute('nonce');
    const pending = el.sheet ? sheetCss(el.sheet, doc.baseURI) : inlineCssUrls(el.textContent, doc.baseURI);
    tasks.push(pending.then((css) => { copy.textContent = css ?? el.textContent; }));
    return copy;
  }

  function cloneLink(el, doc, tasks) {
    const rels = (el.getAttribute('rel') || '').toLowerCase().split(/\s+/).filter(Boolean);
    const href = el.href;
    if (rels.includes('stylesheet')) {
      if (el.sheet?.disabled || (!el.sheet && rels.includes('alternate'))) return null;
      const style = inertDoc.createElement('style');
      const media = el.getAttribute('media');
      if (media) style.setAttribute('media', media);
      const pending = el.sheet ? sheetCss(el.sheet, doc.baseURI) : href ? cssFromUrl(href) : Promise.resolve(null);
      tasks.push(pending.then((css) => {
        if (css != null) style.textContent = css;
        else if (href) { unresolved.add(href); style.textContent = `@import url("${href}");`; }
      }));
      return style;
    }
    if (rels.some((r) => DROP_RELS.includes(r))) return null;
    const copy = inertDoc.importNode(el, false);
    for (const name of ['integrity', 'nonce', 'crossorigin']) copy.removeAttribute(name);
    if (href) copy.setAttribute('href', href);
    if (href && rels.some((r) => ICON_RELS.includes(r))) {
      tasks.push(fetchResource(href, 'data').then((data) => { if (data) copy.setAttribute('href', data); }));
    }
    return copy;
  }

  function canvasToImage(canvas) {
    try {
      const img = inertDoc.createElement('img');
      for (const attr of canvas.attributes) {
        if (!/^on/i.test(attr.name)) img.setAttribute(attr.name, attr.value);
      }
      img.setAttribute('src', canvas.toDataURL());
      return img;
    } catch {
      return null;
    }
  }

  function processElement(el, copy, doc, tasks) {
    const tag = el.localName.toLowerCase();
    const base = doc.baseURI;

    for (const attr of [...copy.attributes]) {
      const name = attr.name.toLowerCase();
      if ((opts.stripScripts && name.startsWith('on')) || ['integrity', 'nonce', 'srcset', 'sizes'].includes(name)
        || (name === 'loading' && (tag === 'img' || tag === 'iframe'))) {
        copy.removeAttributeNode(attr);
      } else if (name === 'style') {
        tasks.push(inlineCssUrls(attr.value, base).then((css) => { attr.value = css; }));
      } else if (URL_ATTRS.includes(name) || (name === 'data' && tag === 'object')) {
        const value = attr.value.trim();
        const u = !skip(value) && abs(value, base);
        if (u) attr.value = u;
      }
    }

    let imageAttr = null;
    if (tag === 'img' || (tag === 'input' && el.type === 'image')) imageAttr = 'src';
    else if (tag === 'video') imageAttr = 'poster';
    else if (tag === 'image' || tag === 'feimage') imageAttr = copy.hasAttribute('href') ? 'href' : 'xlink:href';
    else if (copy.hasAttribute('background')) imageAttr = 'background';

    if (imageAttr) {
      let src = tag === 'img' ? el.currentSrc || el.src : copy.getAttribute(imageAttr);
      if (tag === 'img' && !src) src = abs(el.dataset.src || el.dataset.lazySrc || el.dataset.original || '', base);
      if (src) {
        if (tag === 'img') copy.setAttribute('src', src);
        if (!skip(src)) {
          tasks.push(toDataUrl(src, base).then((data) => {
            if (!data) return;
            const node = copy.getAttributeNode(imageAttr);
            if (node) node.value = data;
            else copy.setAttribute(imageAttr, data);
          }));
        }
      }
    }

    if (tag === 'input') {
      const type = (el.type || '').toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        if (el.checked) copy.setAttribute('checked', '');
        else copy.removeAttribute('checked');
      } else if (type === 'password') {
        copy.removeAttribute('value');
      } else if (type !== 'file') {
        copy.setAttribute('value', el.value);
      }
    } else if (tag === 'option') {
      if (el.selected) copy.setAttribute('selected', '');
      else copy.removeAttribute('selected');
    } else if (tag === 'use') {
      const ref = el.getAttribute('href') || el.getAttribute('xlink:href');
      if (ref && !ref.startsWith('#') && abs(ref, base)) tasks.push(inlineExternalUse(copy, abs(ref, base)));
    } else if (tag === 'iframe') {
      let childDoc = null;
      try { childDoc = el.contentDocument; } catch { /* cross-origin */ }
      if (childDoc?.documentElement) {
        copy.removeAttribute('src');
        tasks.push(captureDocument(childDoc).then((html) => copy.setAttribute('srcdoc', html)));
      } else if (el.src && !skip(el.src)) {
        unresolved.add(el.src);
      }
    }
  }

  // External <use href="file.svg#id"> only resolves same-origin, so inline the referenced content.
  async function inlineExternalUse(use, url) {
    const hash = url.indexOf('#');
    const id = hash >= 0 ? decodeURIComponent(url.slice(hash + 1)) : '';
    const text = await fetchResource(hash >= 0 ? url.slice(0, hash) : url, 'text');
    if (text == null) return;
    const svgDoc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const target = id ? svgDoc.querySelector(`[id="${CSS.escape(id)}"]`) : svgDoc.documentElement;
    if (!target || svgDoc.querySelector('parsererror')) {
      unresolved.add(url);
      return;
    }
    if (opts.stripScripts) {
      target.querySelectorAll('script').forEach((s) => s.remove());
      for (const node of [target, ...target.querySelectorAll('*')]) {
        for (const attr of [...node.attributes]) if (/^on/i.test(attr.name)) node.removeAttributeNode(attr);
      }
    }

    const isViewport = target.localName === 'symbol' || target.localName === 'svg';
    const wrapper = inertDoc.createElementNS('http://www.w3.org/2000/svg', isViewport ? 'svg' : 'g');
    for (const attr of use.attributes) {
      if (!['href', 'xlink:href', 'x', 'y', 'width', 'height'].includes(attr.name)) wrapper.setAttribute(attr.name, attr.value);
    }
    const x = use.getAttribute('x') || '0';
    const y = use.getAttribute('y') || '0';
    if (isViewport) {
      wrapper.setAttribute('x', x);
      wrapper.setAttribute('y', y);
      for (const name of ['viewBox', 'preserveAspectRatio']) {
        if (target.hasAttribute(name)) wrapper.setAttribute(name, target.getAttribute(name));
      }
      wrapper.setAttribute('width', use.getAttribute('width') || target.getAttribute('width') || '100%');
      wrapper.setAttribute('height', use.getAttribute('height') || target.getAttribute('height') || '100%');
      for (const child of target.childNodes) wrapper.append(inertDoc.importNode(child, true));
    } else {
      if (x !== '0' || y !== '0') {
        wrapper.setAttribute('transform', `${wrapper.getAttribute('transform') || ''} translate(${x} ${y})`.trim());
      }
      wrapper.append(inertDoc.importNode(target, true));
    }
    use.replaceWith(wrapper);
    inlinedAssets++;
  }

  function isDroppedMeta(el) {
    const equiv = (el.getAttribute('http-equiv') || '').toLowerCase();
    return el.hasAttribute('charset') || ['content-security-policy', 'refresh', 'content-type'].includes(equiv);
  }

  function cloneShadowRoot(shadow, doc, tasks) {
    const template = inertDoc.createElement('template');
    template.setAttribute('shadowrootmode', shadow.mode);
    if (shadow.delegatesFocus) template.setAttribute('shadowrootdelegatesfocus', '');
    for (const child of shadow.childNodes) {
      const c = cloneTree(child, doc, tasks);
      if (c) template.content.append(c);
    }
    const adopted = adoptedStyle(shadow.adoptedStyleSheets, doc.baseURI, tasks);
    if (adopted) template.content.append(adopted);
    return template;
  }

  function cloneTree(node, doc, tasks) {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      return inertDoc.importNode(node, false);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node;
    const tag = el.localName.toLowerCase();
    if (opts.stripScripts && ((tag === 'script' && el.type !== 'application/ld+json') || tag === 'noscript')) return null;
    if (tag === 'base' || (tag === 'meta' && isDroppedMeta(el))) return null;
    if (tag === 'source' && el.parentElement?.localName === 'picture') return null;
    if (tag === 'link') return cloneLink(el, doc, tasks);
    if (tag === 'style') return cloneStyle(el, doc, tasks);
    if (tag === 'template') return inertDoc.importNode(el, true);
    if (tag === 'canvas') {
      const img = canvasToImage(el);
      if (img) return img;
    }

    const copy = inertDoc.importNode(el, false);
    processElement(el, copy, doc, tasks);
    if (el.shadowRoot) copy.append(cloneShadowRoot(el.shadowRoot, doc, tasks));
    if (tag === 'textarea') {
      copy.textContent = el.value;
      return copy;
    }
    for (const child of el.childNodes) {
      const c = cloneTree(child, doc, tasks);
      if (c) copy.append(c);
    }
    return copy;
  }

  function doctypeOf(doc) {
    const dt = doc.doctype;
    if (!dt) return '';
    const pub = dt.publicId ? ` PUBLIC "${dt.publicId}"` : '';
    const sys = dt.systemId ? `${dt.publicId ? '' : ' SYSTEM'} "${dt.systemId}"` : '';
    return `<!DOCTYPE ${dt.name}${pub}${sys}>\n`;
  }

  async function captureDocument(doc, isTop = false) {
    const tasks = [];
    const root = cloneTree(doc.documentElement, doc, tasks);
    const adopted = adoptedStyle(doc.adoptedStyleSheets, doc.baseURI, tasks);
    await Promise.all(tasks);

    let head = [...root.children].find((c) => c.localName === 'head');
    if (!head) {
      head = inertDoc.createElement('head');
      root.prepend(head);
    }
    const charset = inertDoc.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    head.prepend(charset);
    if (adopted) ([...root.children].find((c) => c.localName === 'body') || head).append(adopted);

    const note = isTop
      ? `<!-- Saved by save-web-page from ${doc.URL.replace(/--/g, '%2D%2D')} at ${new Date().toISOString()} -->\n`
      : '';
    return `${doctypeOf(doc)}${note}${root.outerHTML}`;
  }

  if (opts.settle) await settle();
  const html = await captureDocument(document, true);

  const slug = (document.title || location.hostname)
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80).toLowerCase() || 'page';
  const filename = opts.filename || `${slug}.html`;
  const summary = {
    url: location.href,
    title: document.title,
    suggestedFilename: filename,
    bytes: new Blob([html]).size,
    inlinedAssets,
    unresolvedCount: unresolved.size,
    unresolved: [...unresolved].slice(0, 50),
  };
  window.__SAVE_WEB_PAGE_RESULT__ = { ...summary, html };

  if (opts.download) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  return summary;
})(window.__SAVE_WEB_PAGE_OPTIONS__);
