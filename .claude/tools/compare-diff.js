#!/usr/bin/env node
// compare-diff.js — разница между двумя отпечатками страницы (compare-fingerprint.js).
// Использование:
//   node .claude/tools/compare-diff.js <dev.json> <orig.json>               — DEV против эталона ORIGINAL
//   node .claude/tools/compare-diff.js <mobile.json> <desktop.json> --responsive — мобилка против десктопа одного и того же DEV
// Выводит компактный JSON только с расхождениями. Не оценивает: пересказанный текст, переименованные картинки и т.п. отличаются здесь
// «по форме» — решение «баг / не баг» принимает агент по правилам skill original-site-compare.
const fs = require('fs');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const responsive = process.argv.includes('--responsive');
if (args.length < 2) { console.error('usage: compare-diff.js <a.json> <b.json> [--responsive]'); process.exit(2); }
const read = f => { const raw = fs.readFileSync(f, 'utf8').trim(); let j = JSON.parse(raw); if (typeof j === 'string') j = JSON.parse(j); return j.result !== undefined && !j.head ? j.result : j; };
const A = read(args[0]), B = read(args[1]); // A = DEV (или мобилка), B = эталон (или десктоп)
// file:// (фикстуры): пути ссылок содержат папку сайта — отрезаем общий для стороны префикс, чтобы сравнивать относительные пути
const stripFile = fp => {
  const ps = fp.links.internal; if (!ps.some(p => /^\/[a-z]:\//.test(p))) return;
  const dirs = ps.map(p => (/\.[a-z0-9]+$/.test(p) ? p.replace(/\/[^/]*$/, '') : p));
  let pre = dirs[0]; dirs.forEach(d => { while (pre && !(d + '/').startsWith(pre + '/')) pre = pre.replace(/\/[^/]*$/, ''); });
  fp.links.internal = ps.map(p => p.slice(pre.length) || '/');
};
stripFile(A); stripFile(B);
const la = responsive ? 'mobile' : 'dev', lb = responsive ? 'desktop' : 'orig';
const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{N}$%.\s-]/gu, '').replace(/\s+/g, ' ').trim();
const only = (x, y) => { const s = new Set(y); return [...new Set(x)].filter(v => !s.has(v)); };
const pair = (x, y) => { const a = only(x, y), b = only(y, x); return (a.length || b.length) ? { ['only_' + lb]: b, ['only_' + la]: a } : null; };
const out = { compared: { [la]: A.head.url, [lb]: B.head.url, viewports: { [la]: A.head.viewport, [lb]: B.head.viewport } }, differences: {} };
const d = out.differences;

// <head>
if (!responsive) {
  const head = [];
  for (const k of ['title', 'description', 'ogTitle', 'ogDescription', 'ogImage', 'twitterCard', 'canonical']) {
    const a = A.head[k], b = B.head[k];
    if (norm(a) !== norm(b)) head.push({ field: k, [la]: a, [lb]: b });
  }
  if (A.head.lang !== B.head.lang) head.push({ field: 'lang', [la]: A.head.lang, [lb]: B.head.lang });
  if (A.head.hreflang !== B.head.hreflang) head.push({ field: 'hreflang count', [la]: A.head.hreflang, [lb]: B.head.hreflang });
  // robots: на DEV noindex — норма, поэтому это справка, а не расхождение
  if (norm(A.head.robots) !== norm(B.head.robots)) out.info = { robots: { [la]: A.head.robots, [lb]: B.head.robots, note: 'noindex на DEV обычно ожидаем — не находка' } };
  if (head.length) d.head = head;
}

// заголовки h1–h4 (по тексту)
const hk = h => h.l + ':' + norm(h.t);
const hp = pair(A.headings.map(hk), B.headings.map(hk));
if (hp) d.headings = hp;

// секции: пропавшие по заголовку, «усохшие» по числу слов, порядок
const secA = A.sections, secB = B.sections;
const findA = s => secA.find(x => x.heading && norm(x.heading) === norm(s.heading)) || null;
const missing = [], shrunk = [], hiddenHere = [];
secB.forEach(s => {
  if (!s.heading && !s.words) return;
  const m = s.heading ? findA(s) : null;
  if (s.heading && !m) { missing.push({ heading: s.heading, [lb + '_words']: s.words }); return; }
  if (m) {
    if (s.words >= 30 && m.words < s.words * 0.7 && m.visible) shrunk.push({ heading: s.heading, [la + '_words']: m.words, [lb + '_words']: s.words });
    if (!m.visible && s.visible && m.hiddenWords > 0) hiddenHere.push({ heading: s.heading, note: 'секция есть в DOM, но скрыта на ' + la, hiddenWords: m.hiddenWords });
  }
});
const extra = secA.filter(s => s.heading && !secB.some(x => norm(x.heading) === norm(s.heading))).map(s => ({ heading: s.heading, [la + '_words']: s.words }));
const orderA = secA.filter(s => s.heading && secB.some(x => norm(x.heading) === norm(s.heading))).map(s => norm(s.heading));
const orderB = secB.filter(s => s.heading && secA.some(x => norm(x.heading) === norm(s.heading))).map(s => norm(s.heading));
const s = {};
if (missing.length) s['missing_on_' + la] = missing;
if (hiddenHere.length) s['hidden_on_' + la] = hiddenHere;
if (shrunk.length) s.shorter = shrunk;
if (extra.length) s['only_' + la] = extra;
if (orderA.join('|') !== orderB.join('|')) s.order = { [la]: orderA, [lb]: orderB };
if (Object.keys(s).length) d.sections = s;
d.words = { [la]: A.words, [lb]: B.words };

// числа / суммы / годы — самый дешёвый способ поймать изменённый факт
const np = pair(A.numbers, B.numbers); if (np) d.numbers = np;
// NAP: телефоны (10 цифр), email
const phA = [...A.phones.visible, ...A.phones.tel], phB = [...B.phones.visible, ...B.phones.tel];
const pp = pair(phA, phB); if (pp) d.phones = pp;
const ep = pair(A.emails, B.emails); if (ep) d.emails = ep;
// CTA, картинки (по alt), ссылки, трекинг
const cp = pair(A.ctas, B.ctas); if (cp) d.ctas = cp;
const im = {};
if (A.images.visible !== B.images.visible) im.visible = { [la]: A.images.visible, [lb]: B.images.visible };
if (A.images.broken || B.images.broken) im.broken = { [la]: A.images.broken, [lb]: B.images.broken };
const ia = pair(A.images.alts, B.images.alts); if (ia) im.alts = ia;
if (Object.keys(im).length) d.images = im;
const lp = pair(A.links.internal, B.links.internal); if (lp) d.internalLinks = lp;
if (!responsive) {
  const xp = pair(A.links.external, B.links.external); if (xp) d.externalHosts = xp;
  const tp = pair(A.tracking, B.tracking); if (tp) d.tracking = { ...tp, note: 'на DEV трекинг обычно отключён/другой — это вопрос для «Рекомендаций», не баг' };
  // JSON-LD: типы и поля
  const tA = Object.keys(A.jsonld.types), tB = Object.keys(B.jsonld.types);
  const jl = {};
  const tpair = pair(tA, tB); if (tpair) jl.types = tpair;
  const fields = {};
  tA.filter(t => tB.includes(t)).forEach(t => { const fp = pair(A.jsonld.keys[t] || [], B.jsonld.keys[t] || []); if (fp) fields[t] = fp; const ca = A.jsonld.types[t], cb = B.jsonld.types[t]; if (ca !== cb) (fields[t] = fields[t] || {}).count = { [la]: ca, [lb]: cb }; });
  if (Object.keys(fields).length) jl.fields = fields;
  if (A.jsonld.problems.length || B.jsonld.problems.length) jl.problems = { [la]: A.jsonld.problems, [lb]: B.jsonld.problems };
  if (Object.keys(jl).length) d.jsonld = jl;
}
// формы: набор полей и required
const formsDiff = [];
const sig = f => f.fields.map(x => x.name.toLowerCase()).sort().join(',');
B.forms.forEach((fb, i) => {
  const fa = A.forms.find(f => sig(f) === sig(fb)) || A.forms.find(f => f.id && f.id === fb.id) || A.forms[i];
  if (!fa) { formsDiff.push({ form: fb.id || '#' + i, note: 'формы нет на ' + la }); return; }
  const n = pair(fa.fields.map(x => x.name), fb.fields.map(x => x.name));
  const req = fb.fields.filter(x => { const y = fa.fields.find(z => z.name === x.name); return y && y.required !== x.required; }).map(x => ({ field: x.name, [la + '_required']: fa.fields.find(z => z.name === x.name).required, [lb + '_required']: x.required }));
  const typ = fb.fields.filter(x => { const y = fa.fields.find(z => z.name === x.name); return y && y.type !== x.type; }).map(x => ({ field: x.name, [la + '_type']: fa.fields.find(z => z.name === x.name).type, [lb + '_type']: x.type }));
  if (n || req.length || typ.length) formsDiff.push({ form: fb.id || '#' + i, fields: n || undefined, required: req.length ? req : undefined, types: typ.length ? typ : undefined });
});
A.forms.forEach((fa, i) => { if (!B.forms.some(fb => (fb.id && fb.id === fa.id) || sig(fb) === sig(fa)) && B.forms.length && !formsDiff.some(f => f.form === (fa.id || '#' + i))) { if (B.forms.length < A.forms.length) formsDiff.push({ form: fa.id || '#' + i, note: 'лишняя форма на ' + la }); } });
if (formsDiff.length) d.forms = formsDiff;

out.summary = Object.keys(d).filter(k => k !== 'words');
console.log(JSON.stringify(out, null, 1));
