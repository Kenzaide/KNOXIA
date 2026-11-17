/**
 * Reads PDF, DOCX and PPTX files in the browser: text, page/slide counts and a safe preview.
 * The heavy libraries (pdf.js, mammoth, jszip) are loaded only when a file is opened.
 * `libs` lets tests (or a server) pass their own copies.
 */
const MAX_PDF_PAGES = 100;     // pages read for text; longer PDFs are cut short
const MAX_SLIDES = 200;
const MAX_CHARS = 200000;
const WORDS_PER_MINUTE = 200;

export const countWords = (t) => (String(t).trim().match(/\S+/g) || []).length;
const minutesFor = (words) => (words ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0);
const tidy = (t) => t.replace(/[ \t\u00a0]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const decodeXml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : ''; }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
});

/** Keeps only simple formatting from converted Word HTML. Scripts, images, styles and event handlers are dropped. */
const ALLOWED = new Set('P H1 H2 H3 H4 H5 H6 UL OL LI STRONG EM B I U BR TABLE THEAD TBODY TR TD TH SUP SUB A BLOCKQUOTE'.split(' '));
const DROPPED = new Set('SCRIPT STYLE IFRAME OBJECT EMBED IMG SVG MATH LINK META FORM INPUT BUTTON VIDEO AUDIO CANVAS'.split(' '));
export function sanitizeHtml(html) {
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html'); const out = doc.createElement('div');
  const walk = (from, to) => from.childNodes.forEach((n) => {
    if (n.nodeType === 3) { to.appendChild(doc.createTextNode(n.nodeValue)); return; }
    if (n.nodeType !== 1 || DROPPED.has(n.tagName)) return;
    if (!ALLOWED.has(n.tagName)) { walk(n, to); return; }
    const el = doc.createElement(n.tagName.toLowerCase());
    if (n.tagName === 'A') { const href = n.getAttribute('href') || ''; if (/^(https?:|mailto:)/i.test(href)) { el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); } }
    if (n.tagName === 'TD' || n.tagName === 'TH') ['colspan', 'rowspan'].forEach((a) => { if (/^\d{1,2}$/.test(n.getAttribute(a) || '')) el.setAttribute(a, n.getAttribute(a)); });
    walk(n, el); to.appendChild(el);
  });
  walk(doc.body, out); return out.innerHTML;
}

async function extractPdf(blob, libs) {
  const pdfjs = libs.pdfjs || (await import('./pdfjs-loader.js')).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const meta = await doc.getMetadata().then((m) => m.info || {}).catch(() => ({}));
  const read = Math.min(doc.numPages, MAX_PDF_PAGES); const parts = [];
  for (let p = 1; p <= read; p++) {
    const page = await doc.getPage(p); const content = await page.getTextContent();
    parts.push(tidy(content.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : '') : '')).join('')));
    page.cleanup();
  }
  let text = parts.join('\n\n'); const truncated = doc.numPages > read || text.length > MAX_CHARS; text = text.slice(0, MAX_CHARS);
  const words = countWords(text);
  return { pages: doc.numPages, pdfDoc: doc, text, words, truncated, scanned: words === 0,
    meta: { title: String(meta.Title || '').trim(), author: String(meta.Author || '').trim() } };
}

async function extractDocx(blob, libs) {
  const mammoth = libs.mammoth || (await import('mammoth/mammoth.browser.js')).default;
  const arrayBuffer = await blob.arrayBuffer();
  const [html, raw] = await Promise.all([mammoth.convertToHtml({ arrayBuffer }), mammoth.extractRawText({ arrayBuffer })]);
  const text = tidy(raw.value).slice(0, MAX_CHARS); const words = countWords(text);
  return { html: sanitizeHtml(html.value), text, words, truncated: raw.value.length > MAX_CHARS, scanned: words === 0 };
}

async function extractPptx(blob, libs) {
  const JSZip = libs.JSZip || (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const num = (n) => parseInt(/slide(\d+)\.xml$/.exec(n)[1], 10);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b)).slice(0, MAX_SLIDES);
  const slides = [];
  for (const n of names) {
    const xml = await zip.file(n).async('string');
    const lines = xml.split('</a:p>').map((p) => [...p.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join('').trim()).filter(Boolean);
    slides.push({ n: slides.length + 1, title: lines[0] || '', lines: lines.slice(1) });
  }
  const text = tidy(slides.map((s) => [s.title, ...s.lines].filter(Boolean).join('\n')).join('\n\n')).slice(0, MAX_CHARS); const words = countWords(text);
  return { slides, text, words, truncated: false, scanned: words === 0 };
}

/** Returns { text, words, minutes, ...pages | slides | html }. Throws if the file cannot be read. */
export async function extractMaterial(blob, kind, libs = {}) {
  const run = { PDF: extractPdf, DOCX: extractDocx, PPTX: extractPptx }[kind];
  if (!run) throw new Error(`Unsupported type: ${kind}`);
  const result = await run(blob, libs);
  return { kind, minutes: minutesFor(result.words), ...result };
}
