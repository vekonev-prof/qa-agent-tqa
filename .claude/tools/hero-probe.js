// hero-probe.js — замер первого экрана (Hero) на нескольких ширинах окна за один вызов.
// Запуск (десктопная Chromium-сессия, страница уже открыта; ~15–30 с — скрипт сам меняет ширину и перезагружает страницу на каждой ширине):
//   playwright-cli --raw -s=<имя> run-code --filename=.claude/tools/hero-probe.js
// После прогона вернёт окно к исходной ширине. Ничего не оценивает — только собирает факты:
//   heroH — высота Hero; title — самый крупный текст в Hero (шрифт, число строк, левый/правый край); overlaps — картинки Hero, на которые
//   заходит заголовок (пересечение ≥8×8 px); overflowX — элементы Hero с текстом, выходящие за окно; ctas — кнопки/ссылки-кнопки Hero (число, x-края).
// Hero = секция (или контейнер), в которой лежит первый H1; на страницах без H1 — первая секция. Ширины подобраны так, чтобы ловить проблемы
// МЕЖДУ брейкпоинтами, которые не видны на стандартных 1920 / 768 / 390.
async page => {
  const widths = [1920, 1440, 1280, 1200, 1100, 1024, 900, 768, 600, 390, 360];
  const orig = page.viewportSize() || { width: 1920, height: 1080 };
  const out = [];
  const probe = () => {
    const T = (s, n = 60) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
    const isVis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
    const h1 = document.querySelector('h1');
    const hero = (h1 && (h1.closest('section, header, [class*="hero" i]') || h1.parentElement)) || document.querySelector('section');
    if (!hero) return { noHero: true };
    const hr = hero.getBoundingClientRect(), vw = innerWidth;
    // самый крупный видимый текст в Hero
    let best = null;
    hero.querySelectorAll('h1,h2,h3,p,div,span,a').forEach(el => {
      if (!isVis(el)) return;
      const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent).join(' ');
      if (!own.trim()) return;
      const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize), r = el.getBoundingClientRect();
      if (!best || fs > best.fs || (fs === best.fs && r.width * r.height > best.area)) best = { el, fs, area: r.width * r.height, cs, r };
    });
    const title = best ? (() => {
      const range = document.createRange(); range.selectNodeContents(best.el);
      const rects = [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1);
      const box = rects.length ? rects.reduce((a, r) => ({ l: Math.min(a.l, r.left), r: Math.max(a.r, r.right), t: Math.min(a.t, r.top), b: Math.max(a.b, r.bottom) }), { l: 1e9, r: -1e9, t: 1e9, b: -1e9 }) : { l: best.r.left, r: best.r.right, t: best.r.top, b: best.r.bottom };
      const lh = parseFloat(best.cs.lineHeight) || best.fs * 1.2;
      return { text: T(best.el.textContent, 40), fs: Math.round(best.fs), lh: Math.round(lh), lines: Math.max(1, Math.round((box.b - box.t) / lh)), l: Math.round(box.l), r: Math.round(box.r), t: Math.round(box.t), b: Math.round(box.b) };
    })() : null;
    const imgs = [...hero.querySelectorAll('img, video, picture, svg')].filter(isVis).map(el => ({ r: el.getBoundingClientRect(), name: T((el.currentSrc || el.getAttribute('src') || el.tagName), 200).split('/').pop().slice(0, 30) })).filter(x => x.r.width * x.r.height > 10000);
    const overlaps = title ? imgs.filter(x => Math.min(title.r, x.r.right) - Math.max(title.l, x.r.left) >= 8 && Math.min(title.b, x.r.bottom) - Math.max(title.t, x.r.top) >= 8).map(x => x.name) : [];
    const overflowX = [...hero.querySelectorAll('*')].filter(el => isVis(el) && (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) && (el.getBoundingClientRect().right > vw + 1 || el.getBoundingClientRect().left < -1)).slice(0, 3).map(el => T(el.textContent, 25));
    const ctas = [...hero.querySelectorAll('a,button')].filter(el => isVis(el) && (el.tagName === 'BUTTON' || /btn|button|cta/i.test(el.className || ''))).map(el => { const r = el.getBoundingClientRect(); return T(el.textContent, 20) + '@' + Math.round(r.left) + '-' + Math.round(r.right); });
    return { vw, heroH: Math.round(hr.height), heroTop: Math.round(hr.top), title, imgs: imgs.length, overlaps, overflowX, ctas };
  };
  try {
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: Math.min(orig.height, 900) });
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(700);
      out.push(await page.evaluate(probe));
    }
  } finally {
    await page.setViewportSize(orig);
    await page.reload({ waitUntil: 'load' });
  }
  return out.map(r => r.noHero ? 'no hero' : `w${r.vw} heroH=${r.heroH} title[fs${r.title && r.title.fs} lh${r.title && r.title.lh} lines=${r.title && r.title.lines} x${r.title && r.title.l}-${r.title && r.title.r}] imgs=${r.imgs} overlaps=${JSON.stringify(r.overlaps)} overflowX=${JSON.stringify(r.overflowX)} ctas=${JSON.stringify(r.ctas)}`);
}
