#!/usr/bin/env node
// Download images (and CSS images/fonts) still referenced by remote URL in a saved
// HTML file and inline them as base64 data: URIs. Node's fetch is not subject to
// browser CORS, so this covers assets the in-page script could not read.
// Usage: node inline-remote-assets.mjs <input.html> [output.html] [--force] [--base <url>]
//   output defaults to input (rewritten in place).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CONCURRENCY = 8;
const TIMEOUT_MS = 30000;
const RETRIES = 3;
const MAX_BYTES = 25 * 1024 * 1024;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const ICON_RELS = new Set(['icon', 'shortcut', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'mask-icon']);
const MIME = {
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
};
const GENERIC_TYPE = /^$|^(application|binary)\/octet-stream$|^text\/plain$/;
const IS_IMAGE = /^image\//;
const IS_FONT = /^font\/|^application\/(x-)?font|^application\/vnd\.ms-fontobject$/;

const TOKEN_RE = /<!--[\s\S]*?-->|<(script|style|textarea|title)(?=[\s/>])([^>]*)>([\s\S]*?)<\/\1\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)(\s*\/?>)/gi;
const ATTR_RE = /(\s+)([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const CSS_RE = /@import\s[^;]*;|url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi;
const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: '\u00a0' };

const decodeAttr = (v) => v.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|quot|apos|lt|gt|nbsp));/gi,
  (m, dec, hex, name) => (dec ? String.fromCodePoint(+dec) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name.toLowerCase()]));
const encodeAttr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;');

function parseArgs(argv) {
  const out = { positional: [], force: false, base: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--force') out.force = true;
    else if (argv[i] === '--base') out.base = argv[++i];
    else out.positional.push(argv[i]);
  }
  return out;
}

function isImageAttr(tag, name, attr) {
  if (name === 'background') return true;
  if (tag === 'img' && name === 'src') return true;
  if (tag === 'input' && name === 'src') return (attr('type') || '').toLowerCase() === 'image';
  if (tag === 'video' && name === 'poster') return true;
  if ((tag === 'image' || tag === 'feimage') && (name === 'href' || name === 'xlink:href')) return true;
  if (tag === 'link' && name === 'href') return (attr('rel') || '').toLowerCase().split(/\s+/).some((r) => ICON_RELS.has(r));
  return false;
}

function transformCss(css, resolveUrl) {
  return css.replace(CSS_RE, (whole, a, b, c) => {
    if (whole[0] === '@') return whole;
    const data = resolveUrl(a ?? b ?? c, 'css');
    return data ? `url("${data}")` : whole;
  });
}

function transformTag(whole, name, attrs, tail, resolveUrl) {
  const tag = name.toLowerCase();
  const list = [...attrs.matchAll(ATTR_RE)].map((m) => ({
    raw: m[0], lead: m[1], name: m[2], key: m[2].toLowerCase(),
    value: m[3] ?? m[4] ?? m[5] ?? null,
  }));
  for (const a of list) if (a.value != null) a.value = decodeAttr(a.value);
  const attr = (key) => list.find((a) => a.key === key)?.value;

  let changed = false;
  for (const a of list) {
    if (a.value == null) continue;
    let next = a.value;
    if (a.key === 'style') next = transformCss(a.value, resolveUrl);
    else if (a.key === 'srcdoc' && tag === 'iframe') next = transformHtml(a.value, resolveUrl);
    else if (isImageAttr(tag, a.key, attr)) next = resolveUrl(a.value, 'image') || a.value;
    if (next === a.value) continue;
    a.value = next;
    a.dirty = true;
    changed = true;
    if (tag === 'img' && a.key === 'src') {
      for (const drop of list) if (drop.key === 'srcset' || drop.key === 'sizes') drop.removed = true;
    }
  }
  if (!changed) return whole;
  const rebuilt = list.map((a) => {
    if (a.removed) return '';
    return a.dirty ? `${a.lead}${a.name}="${encodeAttr(a.value)}"` : a.raw;
  }).join('');
  return `<${name}${rebuilt}${tail}`;
}

function transformHtml(html, resolveUrl) {
  return html.replace(TOKEN_RE, (whole, rawTag, rawAttrs, body, name, attrs, tail) => {
    if (rawTag) {
      if (rawTag.toLowerCase() !== 'style') return whole;
      const open = whole.slice(0, whole.indexOf('>') + 1);
      const close = whole.slice(open.length + body.length);
      return open + transformCss(body, resolveUrl) + close;
    }
    return name ? transformTag(whole, name, attrs, tail, resolveUrl) : whole;
  });
}

function sniff(buf) {
  const ascii = buf.subarray(0, 12).toString('latin1');
  const hex = buf.subarray(0, 4).toString('hex');
  if (hex === '89504e47') return 'image/png';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (ascii.startsWith('GIF8')) return 'image/gif';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp';
  if (/^ftypavi[fs]$/.test(ascii.slice(4, 12))) return 'image/avif';
  if (hex === '00000100') return 'image/x-icon';
  if (ascii.startsWith('wOF2')) return 'font/woff2';
  if (ascii.startsWith('wOFF')) return 'font/woff';
  if (ascii.startsWith('OTTO')) return 'font/otf';
  if (hex === '00010000') return 'font/ttf';
  const head = buf.subarray(0, 1024).toString('utf8').toLowerCase();
  if (/<svg[\s>]/.test(head) && !/<html[\s>]/.test(head)) return 'image/svg+xml';
  return null;
}

function detectMime(header, url, buf) {
  const type = (header || '').split(';')[0].trim().toLowerCase();
  if (!GENERIC_TYPE.test(type)) return type;
  let ext = '';
  try { ext = new URL(url).pathname.split('.').pop().toLowerCase(); } catch { }
  return sniff(buf) || MIME[ext] || type || 'application/octet-stream';
}

async function fetchWithRetry(url, init) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok || attempt >= RETRIES || !(res.status === 429 || res.status >= 500)) return res;
    } catch (err) {
      if (attempt >= RETRIES) throw err;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}

async function download(url, referer) {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' };
  if (referer) headers.Referer = referer;
  const res = await fetchWithRetry(url, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('too large');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('too large');
  const mime = detectMime(res.headers.get('content-type'), url, buf);
  return { mime, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
}

async function pool(items, size, worker) {
  let next = 0;
  const run = async () => { while (next < items.length) await worker(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
}

const args = parseArgs(process.argv.slice(2));
const [input, output = input] = args.positional;
if (!input) {
  console.error('Usage: node inline-remote-assets.mjs <input.html> [output.html] [--force] [--base <url>]');
  process.exit(2);
}
const source = resolve(input);
const target = resolve(output);
if (target !== source && existsSync(target) && !args.force) {
  console.error(`Refusing to overwrite existing file: ${target} (pass --force)`);
  process.exit(3);
}

const html = readFileSync(source, 'utf8');
const base = args.base || html.match(/<!-- Saved by save-web-page from (\S+) at /)?.[1] || null;
let referer = null;
try { referer = base && `${new URL(base).origin}/`; } catch { }

const toAbsolute = (raw) => {
  const value = raw.trim();
  if (!value || /^(data|blob|about|javascript):|^#/i.test(value)) return null;
  try {
    const url = new URL(value, base || undefined);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

const wanted = new Map();
transformHtml(html, (raw, kind) => {
  const url = toAbsolute(raw);
  if (url) wanted.set(url, wanted.get(url) === 'image' || kind === 'image' ? 'image' : 'css');
  return null;
});

const results = new Map();
const failed = [];
await pool([...wanted.keys()], CONCURRENCY, async (url) => {
  try {
    const result = await download(url, referer);
    const ok = IS_IMAGE.test(result.mime) || (wanted.get(url) === 'css' && IS_FONT.test(result.mime));
    if (ok) results.set(url, result);
    else failed.push({ url, reason: `unexpected type ${result.mime}` });
  } catch (err) {
    const cause = err.cause?.code || err.cause?.message;
    failed.push({ url, reason: err.name === 'TimeoutError' ? 'timeout' : cause ? `${err.message} (${cause})` : err.message });
  }
});

const inlined = new Set();
const out = transformHtml(html, (raw, kind) => {
  const url = toAbsolute(raw);
  const result = url && results.get(url);
  if (!result || (kind === 'image' && !IS_IMAGE.test(result.mime))) return null;
  inlined.add(url);
  return result.dataUrl;
});

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, out, 'utf8');
console.log(JSON.stringify({
  path: target,
  bytesBefore: Buffer.byteLength(html),
  bytes: Buffer.byteLength(out),
  remoteFound: wanted.size,
  inlined: inlined.size,
  failed,
}, null, 2));
