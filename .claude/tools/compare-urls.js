#!/usr/bin/env node
// compare-urls.js — сверка списков страниц (sitemap) DEV и эталона ORIGINAL без браузера.
// Использование:
//   node .claude/tools/compare-urls.js <dev-sitemap> <orig-sitemap> [--dev-user login:pass] [--orig-user login:pass] [--check-dev]
// <sitemap> — https://…/sitemap.xml, sitemap_index.xml, либо file:///…, либо путь к локальному файлу (относительно текущей папки; вложенные sitemap в индексе обходятся).
// Относительные <loc> (бывают в локальных фикстурах) разрешаются относительно расположения самого sitemap.
// Выводит JSON: сколько URL на каждой стороне, какие пути есть ТОЛЬКО на эталоне (кандидаты на «страница не перенесена»),
// какие ТОЛЬКО на DEV, сколько общих. С --check-dev для каждого пути «только на эталоне» делается HEAD-запрос на DEV
// (нужен https-адрес DEV): 200 — страница есть, просто не в sitemap; 301/302 — редирект; 404 — страницы нет.
// Ничего не оценивает: равные числа URL не означают равные наборы страниц — сравнивай списки, а не числа.
const fs = require('fs');
const { fileURLToPath, pathToFileURL } = require('url');
const nodePath = require('path');
const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !['--dev-user', '--orig-user'].includes(argv[i - 1]));
if (pos.length < 2) { console.error('usage: compare-urls.js <dev-sitemap> <orig-sitemap> [--dev-user u:p] [--orig-user u:p] [--check-dev]'); process.exit(2); }

// путь без схемы (и Windows-путь вида C:\...) считается локальным файлом
const asUrl = a => (/^[a-z][a-z0-9+.-]+:/i.test(a) ? a : pathToFileURL(nodePath.resolve(a)).href);
const load = async (loc, user) => {
  if (loc.startsWith('file:')) return fs.readFileSync(fileURLToPath(loc), 'utf8');
  const headers = user ? { Authorization: 'Basic ' + Buffer.from(user).toString('base64') } : {};
  const r = await fetch(loc, { headers, redirect: 'follow' });
  if (!r.ok) throw new Error(loc + ' → HTTP ' + r.status);
  return r.text();
};
const locs = xml => [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));

async function collect(root, user) {
  const seen = new Set(), urls = [], errors = [];
  const queue = [root];
  while (queue.length && seen.size < 40) {
    const s = queue.shift(); if (seen.has(s)) continue; seen.add(s);
    let xml; try { xml = await load(s, user); } catch (e) { errors.push(String(e.message || e)); continue; }
    const l = locs(xml).map(u => { try { return new URL(u, s).href; } catch (e) { return u; } });
    if (/<sitemapindex/i.test(xml)) queue.push(...l); else urls.push(...l);
  }
  return { urls, errors, sitemaps: seen.size };
}
// путь страницы: для file:// — относительно папки sitemap, для http(s) — pathname; без слэша на конце, без index.html, query и hash
const toPath = (u, root) => {
  try {
    let p;
    if (u.startsWith('file:')) { const base = root.replace(/[^/]*$/, ''); p = decodeURIComponent(u.startsWith(base) ? u.slice(base.length - 1) : new URL(u).pathname); }
    else p = decodeURIComponent(new URL(u).pathname);
    p = p.toLowerCase().replace(/\/index\.html?$/, '/').replace(/\/+$/, '');
    return p || '/';
  } catch (e) { return u; }
};

(async () => {
  const devRoot = asUrl(pos[0]), origRoot = asUrl(pos[1]);
  const dev = await collect(devRoot, opt('--dev-user')), orig = await collect(origRoot, opt('--orig-user'));
  const dp = [...new Set(dev.urls.map(u => toPath(u, devRoot)))].sort(), op = [...new Set(orig.urls.map(u => toPath(u, origRoot)))].sort();
  const ds = new Set(dp), os = new Set(op);
  const onlyOrig = op.filter(p => !ds.has(p)), onlyDev = dp.filter(p => !os.has(p));
  const out = {
    counts: { dev: dp.length, orig: op.length, common: dp.filter(p => os.has(p)).length, devSitemaps: dev.sitemaps, origSitemaps: orig.sitemaps },
    only_on_orig: onlyOrig, only_on_dev: onlyDev,
    note: 'Пути «только на эталоне» — кандидаты на непереносённую страницу; пути «только на DEV» — либо новые страницы, либо сменившийся адрес (ищи парный путь: /blog/x ↔ /blogs/x). Равные числа не значат равные наборы.',
  };
  if (dev.errors.length || orig.errors.length) out.errors = { dev: dev.errors, orig: orig.errors };
  if (argv.includes('--check-dev') && devRoot.startsWith('http')) {
    const base = new URL(devRoot).origin, user = opt('--dev-user'); const headers = user ? { Authorization: 'Basic ' + Buffer.from(user).toString('base64') } : {};
    out.dev_status_of_orig_only = {};
    for (const p of onlyOrig.slice(0, 60)) { try { const r = await fetch(base + p, { method: 'HEAD', redirect: 'manual', headers }); out.dev_status_of_orig_only[p] = r.status + (r.headers.get('location') ? ' → ' + r.headers.get('location') : ''); } catch (e) { out.dev_status_of_orig_only[p] = 'error'; } }
  }
  console.log(JSON.stringify(out, null, 1));
})();
