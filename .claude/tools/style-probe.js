// style-probe.js — реальные стили страницы + список секций по порядку. Нужен только для сверки с макетом Figma (skill figma-compare).
// Запуск (в уже открытой именованной сессии, после ожидания ≥3 с после загрузки; на десктопе и на мобилке — по одной странице каждого шаблона с макетом):
//   playwright-cli --raw -s=<имя> run-code --filename=.claude/tools/style-probe.js
// Возвращает компактный JSON с ФАКТАМИ (цвета — как есть, «rgb(r, g, b)»). Ничего не оценивает: сравнение с макетом и цвета через
// `node .claude/tools/color-delta.js` делает агент по правилам figma-compare.
async page => {
  return await page.evaluate(() => {
    const T = (s, n = 70) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
    const isVis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
    const alpha = c => { const m = c && c.match(/rgba\(([^)]+)\)/); return m ? parseFloat(m[1].split(',')[3]) : (c && c.startsWith('rgb') ? 1 : 0); };
    const effBg = el => { for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (alpha(c) > 0.05) return c; } return 'rgb(255, 255, 255)'; };
    const fam = el => T(getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, ''), 40);
    const tally = (arr, n) => { const m = new Map(); arr.forEach(([k, w]) => m.set(k, (m.get(k) || 0) + w)); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v)]); };
    const scrollY = window.scrollY;
    const out = { viewport: [innerWidth, innerHeight], title: T(document.title, 60) };

    // ---- секции по порядку (шапка, блоки основного содержимого, подвал) ----
    const header = document.querySelector('header, [role="banner"], nav');
    const footer = document.querySelector('footer, [role="contentinfo"]');
    let holder = document.querySelector('main, [role="main"]') || document.body;
    for (let i = 0; i < 4; i++) { const kids = [...holder.children].filter(c => !/^(SCRIPT|STYLE|LINK|NOSCRIPT|TEMPLATE)$/.test(c.tagName) && isVis(c)); if (kids.length === 1 && kids[0] !== footer) holder = kids[0]; else break; }
    const blocks = [...holder.children].filter(c => !/^(SCRIPT|STYLE|LINK|NOSCRIPT|TEMPLATE)$/.test(c.tagName) && isVis(c) && c !== header && c !== footer && c.getBoundingClientRect().height > 40);
    const sec = (el, tag) => {
      const r = el.getBoundingClientRect();
      const h = el.querySelector('h1, h2, h3');
      const cls = T((typeof el.className === 'string' ? el.className : '').split(/\s+/).slice(0, 2).join('.'), 40);
      return {
        tag: tag || el.tagName.toLowerCase() + (el.id ? '#' + T(el.id, 24) : '') + (cls ? '.' + cls : ''),
        y: Math.round(r.top + scrollY), h: Math.round(r.height),
        heading: h ? h.tagName.toLowerCase() + ': ' + T(h.textContent) : '',
        bg: effBg(el),
        form: !!el.querySelector('form, input, textarea'),
        map: !!el.querySelector('iframe[src*="maps"], .gm-style, [class*="map"]'),
        reviews: /review|testimonial|rating/i.test(el.className + ' ' + el.id) || !!el.querySelector('[class*="review"], [class*="testimonial"], [class*="rating"], iframe[src*="review"]'),
        buttons: el.querySelectorAll('a[class*="btn"], a[class*="button"], button').length,
        images: el.querySelectorAll('img, picture, svg[width]').length,
        cols: (() => { const g = el.querySelector('[class*="grid"], [class*="row"], [class*="cols"], ul'); if (!g) return 0; const ks = [...g.children].filter(isVis); if (ks.length < 2) return 0; const t = ks[0].getBoundingClientRect().top; return ks.filter(k => Math.abs(k.getBoundingClientRect().top - t) < 8).length; })(),
      };
    };
    // первый экран (hero): если блок с H1 не попал ни в один из найденных блоков — добавляем его отдельно
    const h1el = document.querySelector('h1');
    const covered = [header, footer, ...blocks].filter(Boolean);
    let hero = null;
    if (h1el && isVis(h1el) && !covered.some(c => c.contains(h1el))) hero = h1el.closest('section, [class*="hero"], [class*="banner"], [class*="intro"], [class*="jumbotron"]') || h1el.parentElement;
    const list = [];
    if (header) list.push([header, 'HEADER']);
    if (hero) list.push([hero, null]);
    blocks.slice(0, 24).forEach(b => list.push([b, null]));
    if (footer) list.push([footer, 'FOOTER']);
    out.sections = list.map(([el, tag]) => sec(el, tag)).sort((a, b) => (a.tag === 'HEADER' ? -1 : b.tag === 'HEADER' ? 1 : a.tag === 'FOOTER' ? 1 : b.tag === 'FOOTER' ? -1 : a.y - b.y));

    // ---- стили ключевых элементов ----
    const st = el => { const cs = getComputedStyle(el); return { font: fam(el), size: cs.fontSize, weight: cs.fontWeight, color: cs.color }; };
    const h1 = document.querySelector('h1');
    if (h1 && isVis(h1)) out.h1 = { text: T(h1.textContent), ...st(h1), sectionBg: effBg(h1) };
    const p = [...document.querySelectorAll('main p, p')].find(isVis);
    if (p) out.body = { ...st(p), bg: effBg(p) };
    const btnEls = [...document.querySelectorAll('a[class*="btn"], a[class*="button"], a[class*="cta"], button, a[role="button"], input[type="submit"]')].filter(b => isVis(b) && (T(b.textContent || b.value)).length > 1);
    const btnLook = btnEls.filter(b => alpha(getComputedStyle(b).backgroundColor) > 0.05);
    out.buttons = (btnLook.length ? btnLook : btnEls).slice(0, 4).map(b => { const cs = getComputedStyle(b); return { text: T(b.textContent || b.value, 30), bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius, font: fam(b), weight: cs.fontWeight, y: Math.round(b.getBoundingClientRect().top + scrollY) }; });
    if (header) out.header = { bg: effBg(header), color: getComputedStyle(header).color, font: fam(header) };
    if (footer) out.footer = { bg: effBg(footer), color: getComputedStyle(footer).color, font: fam(footer) };

    // ---- палитра и шрифты страницы (для сверки со Style Guide) ----
    const sample = [...document.querySelectorAll('h1, h2, h3, h4, p, li, a, button, span')].filter(isVis).slice(0, 400);
    out.palette = {
      backgrounds: tally(out.sections.map(s => [s.bg, s.h]), 8),
      texts: tally(sample.map(e => [getComputedStyle(e).color, 1]), 8),
      buttonBgs: tally(btnLook.map(b => [getComputedStyle(b).backgroundColor, 1]), 4),
    };
    out.fonts = tally(sample.map(e => [fam(e), 1]), 5);
    out.note = 'Цвета сравнивай только через color-delta.js. Секции — в порядке сверху вниз; heading — первый заголовок секции (якорь для сопоставления с блоком макета).';
    return out;
  });
}
