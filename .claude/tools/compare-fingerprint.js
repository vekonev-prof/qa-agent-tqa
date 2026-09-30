// compare-fingerprint.js — «отпечаток» страницы для сверки двух версий (DEV и эталон ORIGINAL, либо десктоп и мобилка одного DEV).
// Запуск (в уже открытой именованной сессии, после ожидания ≥3 с после загрузки; прокрути страницу вниз, если есть lazy-картинки):
//   playwright-cli --raw -s=<имя> run-code --filename=.claude/tools/compare-fingerprint.js > "$TMPDIR/fp-dev.json"
// Второй запуск — в сессии эталона (> "$TMPDIR/fp-orig.json"); затем: node .claude/tools/compare-diff.js "$TMPDIR/fp-dev.json" "$TMPDIR/fp-orig.json".
// Скрипт ничего не оценивает — только собирает факты. Видимый текст берётся из innerText: скрытое (display:none) в отпечаток не попадает.
async page => {
  return await page.evaluate(() => {
    const T = (s, n = 100) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
    const norm = s => T(s, 300).toLowerCase().replace(/[^\p{L}\p{N}$%.\s-]/gu, '').replace(/\s+/g, ' ').trim();
    const isVis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
    const uniq = (a, n) => [...new Set(a)].slice(0, n);
    const meta = (sel, attr = 'content') => { const m = document.querySelector(sel); return m ? (m.getAttribute(attr) || '') : null; };
    const out = {};

    // --- <head> ---
    out.head = {
      url: location.href, viewport: innerWidth + 'x' + innerHeight, lang: document.documentElement.lang || '',
      title: T(document.title, 160), description: meta('meta[name="description"]'), robots: meta('meta[name="robots"]'),
      canonical: meta('link[rel="canonical"]', 'href') ? 'yes' : null, ogTitle: meta('meta[property="og:title"]'), ogDescription: meta('meta[property="og:description"]') ? 'yes' : null,
      ogImage: meta('meta[property="og:image"]') ? 'yes' : null, twitterCard: meta('meta[name="twitter:card"]'), hreflang: document.querySelectorAll('link[rel="alternate"][hreflang]').length,
    };

    // --- заголовки h1–h4 ---
    out.headings = [...document.querySelectorAll('h1,h2,h3,h4')].filter(isVis).slice(0, 80).map(h => ({ l: +h.tagName[1], t: T(h.textContent, 90) }));

    // --- видимый текст ---
    const text = document.body ? document.body.innerText : '';
    const phoneRe = /(?:\+?1[\s.-]*)?\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/g;
    const digits10 = s => { const d = String(s).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; };
    const phonesVisible = (text.match(phoneRe) || []).map(digits10);
    const phonesTel = [...document.querySelectorAll('a[href^="tel:"]')].map(a => digits10(a.getAttribute('href')));
    out.phones = { visible: uniq(phonesVisible, 20), tel: uniq(phonesTel, 20) };
    const mailVisible = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const mailto = [...document.querySelectorAll('a[href^="mailto:"]')].map(a => a.getAttribute('href').replace(/^mailto:/i, '').split('?')[0]);
    out.emails = uniq([...mailVisible, ...mailto].map(s => s.toLowerCase()), 20);
    // Числа, суммы, проценты, годы: телефоны вырезаем, одиночные цифры без $/% не берём (шум нумерации).
    const noPhones = text.replace(phoneRe, ' ');
    out.numbers = uniq((noPhones.match(/\$\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?%|\b\d{2,}[\d,]*(?:\.\d+)?\b/g) || []).map(s => s.replace(/\s+/g, '').replace(/[.,]+$/, '')), 120);
    out.words = (text.match(/\S+/g) || []).length;

    // --- секции по порядку (внешние контейнеры) ---
    let cands = [...document.querySelectorAll('header,footer,section,article,[role="region"]')];
    cands = cands.filter(el => !cands.some(o => o !== el && o.contains(el)));
    if (cands.length < 2) cands = [...document.body.children].filter(el => !/^(SCRIPT|STYLE|NOSCRIPT|LINK|META)$/.test(el.tagName));
    out.sections = cands.slice(0, 40).map(el => {
      const h = el.querySelector('h1,h2,h3'); const vis = isVis(el);
      const words = vis ? ((el.innerText || '').match(/\S+/g) || []).length : 0;
      const hidden = !vis ? ((el.textContent || '').match(/\S+/g) || []).length : 0;
      return { tag: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''), heading: T(h ? h.textContent : '', 60), words, visible: vis, hiddenWords: hidden };
    });

    // --- CTA-кнопки ---
    const ctaEls = [...document.querySelectorAll('a,button,[role="button"]')].filter(el => isVis(el) && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || /btn|button|cta/i.test(el.className || '')));
    out.ctas = uniq(ctaEls.map(el => norm(el.textContent)).filter(t => t && t.length <= 40), 40);

    // --- изображения (по смыслу: alt; имена файлов при переносе могут меняться) ---
    const imgs = [...document.images];
    out.images = { total: imgs.length, visible: imgs.filter(isVis).length, altMissing: imgs.filter(i => i.getAttribute('alt') === null).length, alts: uniq(imgs.map(i => norm(i.getAttribute('alt') || '')).filter(Boolean), 60), broken: imgs.filter(i => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src)).length };

    // --- ссылки ---
    const here = location.href;
    const pathOf = h => { try { const u = new URL(h, here); if (u.host.replace(/^www\./i, '') !== location.host.replace(/^www\./i, '') || !/^(https?|file):$/.test(u.protocol)) return null; let p = decodeURIComponent(u.pathname).toLowerCase().replace(/\/index\.html?$/, '/').replace(/\/+$/, ''); return p || '/'; } catch (e) { return null; } };
    const anchors = [...document.querySelectorAll('a[href]')].filter(a => !/^(tel|mailto|javascript|#)/i.test(a.getAttribute('href')));
    out.links = {
      internal: uniq(anchors.map(a => pathOf(a.getAttribute('href'))).filter(Boolean), 150),
      external: uniq(anchors.filter(a => { try { const u = new URL(a.href, here); return /^https?:$/.test(u.protocol) && !pathOf(a.href); } catch (e) { return false; } }).map(a => new URL(a.href, here).host.replace(/^www\./, '')), 40),
    };

    // --- трекинг-скрипты ---
    const srcs = [...document.scripts].map(s => (s.src || '') + ' ' + (s.textContent || '').slice(0, 4000)).join('\n');
    const ids = (srcs.match(/GTM-[A-Z0-9]{4,}|G-[A-Z0-9]{6,}|UA-\d{4,}-\d+|AW-\d{6,}/g) || []);
    const vendors = ['callrail', 'fbevents', 'hotjar', 'clarity.ms', 'plausible', 'googletagmanager', 'gtag/js', 'invoca', 'whatconverts'].filter(v => srcs.toLowerCase().includes(v));
    out.tracking = uniq([...ids, ...vendors], 20);

    // --- JSON-LD ---
    const types = {}; const keys = {}; const problems = [];
    [...document.querySelectorAll('script[type="application/ld+json"]')].forEach((s, i) => {
      let data; try { data = JSON.parse(s.textContent); } catch (e) { problems.push('invalid JSON in block ' + i); return; }
      (Array.isArray(data) ? data : (data['@graph'] || [data])).forEach(n => {
        const t = [].concat(n['@type'] || '?').join('/'); types[t] = (types[t] || 0) + 1;
        keys[t] = uniq([...(keys[t] || []), ...Object.keys(n).filter(k => !k.startsWith('@'))], 60);
      });
    });
    out.jsonld = { types, keys, problems };

    // --- формы: набор полей и обязательность ---
    out.forms = [...document.forms].slice(0, 8).map(f => ({
      id: f.id || f.getAttribute('name') || '',
      fields: [...f.elements].filter(e => e.name && !/^(hidden|submit|button|reset|image)$/.test(e.type)).map(e => ({ name: e.name, type: e.type || e.tagName.toLowerCase(), required: !!e.required, options: e.tagName === 'SELECT' ? e.options.length : undefined })),
    }));
    return out;
  });
}
