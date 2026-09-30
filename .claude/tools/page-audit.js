// page-audit.js — один вызов вместо 30–70 отдельных `eval`.
// Запуск (на десктопе и мобилке; на планшете и в альбомной ориентации не запускается; в уже открытой именованной сессии, после ожидания ≥3 с после загрузки):
//   playwright-cli --raw -s=<имя> run-code --filename=.claude/tools/page-audit.js
// Внутренними считаются ссылки на тот же хост, включая www./apex-вариант (сравнение без ведущего «www.»); ссылки на LIVE-домен со страницы DEV остаются внешними.
// Возвращает компактный JSON с ФАКТАМИ о DOM. Решения (баг/не баг, серьёзность, «своя ли это ссылка клиента»)
// принимает агент по правилам skills — скрипт только собирает данные и ничего не оценивает.
async page => {
  return await page.evaluate(() => {
    const T = (s, n = 80) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
    const cap = (a, n) => a.slice(0, n);
    const isVis = el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    };
    const desc = el => {
      const c = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/)[0] : '';
      return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + c + (T(el.textContent, 20) ? ' «' + T(el.textContent, 20) + '»' : '');
    };
    const absUrl = h => { try { return new URL(h, location.href); } catch (e) { return null; } };
    const isInternal = u => u && u.protocol === location.protocol && u.host.replace(/^www\./i, '') === location.host.replace(/^www\./i, '');
    const out = {};
    const de = document.documentElement;

    // --- страница и <head> ---
    out.page = { url: location.href, lang: de.lang || '', innerWidth, innerHeight, scrollWidth: de.scrollWidth };
    const meta = (sel, attr = 'content') => { const m = document.querySelector(sel); return m ? (m.getAttribute(attr) || '') : null; };
    out.head = {
      title: T(document.title, 120), titleLen: document.title.length,
      description: meta('meta[name="description"]'), descriptionLen: (meta('meta[name="description"]') || '').length,
      robots: meta('meta[name="robots"]'), canonical: meta('link[rel="canonical"]', 'href'),
      viewportMeta: meta('meta[name="viewport"]'),
      og: [...document.querySelectorAll('meta[property^="og:"]')].map(m => m.getAttribute('property')),
      twitter: [...document.querySelectorAll('meta[name^="twitter:"]')].map(m => m.getAttribute('name')),
      icons: cap([...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]')].map(l => ({ rel: l.rel, href: T(l.getAttribute('href'), 70), type: l.type || '', sizes: l.getAttribute('sizes') || '' })), 10),
      hreflang: cap([...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(l => l.hreflang + ' → ' + T(l.getAttribute('href'), 120)), 20),
    };

    // --- заголовки ---
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    const lv = hs.map(h => +h.tagName[1]);
    out.headings = {
      h1Count: lv.filter(x => x === 1).length,
      h1: cap(hs.filter(h => h.tagName === 'H1').map(h => T(h.textContent, 90)), 3),
      seq: lv.join(''),
      skips: cap(lv.map((x, i) => (i && x - lv[i - 1] > 1 ? 'h' + lv[i - 1] + '→h' + x : null)).filter(Boolean), 8),
    };

    // --- JSON-LD ---
    const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')];
    const seen = {}; const typeCount = {}; const items = [];
    blocks.forEach((s, i) => {
      let data;
      try { data = JSON.parse(s.textContent); } catch (e) { items.push({ block: i, error: 'invalid JSON' }); return; }
      const key = JSON.stringify(data); seen[key] = (seen[key] || 0) + 1;
      const nodes = Array.isArray(data) ? data : (data['@graph'] || [data]);
      nodes.forEach(n => {
        const t = [].concat(n['@type'] || '?').join('/');
        typeCount[t] = (typeCount[t] || 0) + 1;
        items.push({
          block: i, type: t, keys: cap(Object.keys(n).filter(k => k[0] !== '@'), 25),
          inLanguage: n.inLanguage || null, knowsLanguage: n.knowsLanguage || null,
          sameAs: Array.isArray(n.sameAs) ? n.sameAs.length : (n.sameAs ? 1 : 0),
          telephone: n.telephone || null, url: T(n.url || n['@id'] || '', 60),
          hasAddress: !!n.address, hasReview: !!(n.review || n.aggregateRating),
        });
      });
    });
    out.jsonld = { blocks: blocks.length, types: typeCount, identicalDuplicateBlocks: Object.values(seen).filter(c => c > 1).length, items: cap(items, 12) };

    // --- ссылки ---
    const anchors = [...document.querySelectorAll('a')];
    const links = anchors.filter(a => a.hasAttribute('href')).map(a => {
      const raw = a.getAttribute('href'); const u = absUrl(raw);
      return { a, raw, u, internal: isInternal(u), text: T(a.textContent || a.getAttribute('aria-label'), 40), rel: a.getAttribute('rel') || '', target: a.getAttribute('target') || '' };
    });
    const tag = l => ({ text: l.text, href: T(l.raw, 80), rel: l.rel, internal: l.internal });
    out.links = {
      total: anchors.length, withoutHref: anchors.length - links.length,
      empty: cap(links.filter(l => l.raw.trim() === '' || l.raw.trim() === '#' || /^javascript:/i.test(l.raw)).map(tag), 12),
      targetBlank: cap(links.filter(l => l.target === '_blank').map(tag), 25),
      externalWithoutNofollow: cap(links.filter(l => l.u && /^https?:$/.test(l.u.protocol) && !l.internal && !/nofollow/i.test(l.rel)).map(tag), 15),
      externalWithNofollow: cap(links.filter(l => l.u && /^https?:$/.test(l.u.protocol) && !l.internal && /nofollow/i.test(l.rel)).map(tag), 15),
      tel: cap(links.filter(l => /^tel:/i.test(l.raw)).map(l => ({ href: l.raw, aria: l.a.getAttribute('aria-label'), text: l.text })), 10),
      mailto: cap(links.filter(l => /^mailto:/i.test(l.raw)).map(l => l.raw), 5),
    };

    // --- картинки ---
    const imgs = [...document.images];
    const res = performance.getEntriesByType('resource').filter(r => r.initiatorType === 'img' || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(r.name));
    const ext = {}; imgs.forEach(i => { const m = (i.currentSrc || i.src || '').split('?')[0].match(/\.([a-z0-9]+)$/i); const e = m ? m[1].toLowerCase() : '?'; ext[e] = (ext[e] || 0) + 1; });
    out.images = {
      total: imgs.length, formats: ext, lazy: imgs.filter(i => i.loading === 'lazy').length,
      altMissing: cap(imgs.filter(i => i.getAttribute('alt') === null).map(i => T((i.currentSrc || i.src).split('/').pop(), 50)), 10),
      altEmpty: imgs.filter(i => i.getAttribute('alt') === '').length,
      broken: cap(imgs.filter(i => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src)).map(i => T((i.currentSrc || i.src).split('/').pop(), 50)), 10),
      oversized: cap(imgs.filter(i => i.clientWidth > 0 && i.naturalWidth > 2 * i.clientWidth).map(i => ({ src: T((i.currentSrc || i.src).split('/').pop(), 40), natural: i.naturalWidth, shown: i.clientWidth })), 8),
      heavyOver150KB: cap(res.filter(r => r.encodedBodySize > 150 * 1024).map(r => ({ src: T(r.name.split('/').pop(), 40), kb: Math.round(r.encodedBodySize / 1024) })), 10),
    };

    // --- видимый текст ---
    const text = document.body ? document.body.innerText : '';
    const phones = [...new Set((text.match(/(?:\+?1[\s.-]*)?\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/g) || []).map(p => p.trim()))];
    const cyr = text.match(/[А-Яа-яЁё]{2,}/g) || [];
    const lorem = text.match(/lorem ipsum|dolor sit amet/i);
    out.text = {
      lorem: lorem ? T(text.slice(Math.max(0, lorem.index - 20), lorem.index + 60), 90) : null,
      cyrillicWords: cyr.length, cyrillicSample: cap(cyr, 5),
      placeholders: cap(text.match(/\b(TODO|TBD|XXXX+|placeholder text|your (text|title) here|sample text)\b/gi) || [], 5),
      phonesVisible: cap(phones.map(p => ({ raw: p, usFormat: /^\(\d{3}\) \d{3}-\d{4}$/.test(p), plus1: /^\+1/.test(p) })), 10),
      emailsVisible: cap([...new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])], 5),
    };

    // --- раскладка ---
    const all = [...document.querySelectorAll('body *')].filter(el => !/^(SCRIPT|STYLE|NOSCRIPT|META|LINK|BR|HEAD)$/.test(el.tagName));
    const scrollableAnc = el => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    const off = all.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && isVis(el); })
      .map(el => ({ el, scrollable: scrollableAnc(el) }));
    out.layout = {
      docOverflowX: de.scrollWidth > innerWidth + 1,
      offViewport: cap(off.map(o => ({ el: desc(o.el), right: Math.round(o.el.getBoundingClientRect().right), insideScrollableContainer: o.scrollable })), 10),
      scrollableContainers: cap(all.filter(el => { const o = getComputedStyle(el).overflowX; return (o === 'auto' || o === 'scroll') && el.scrollWidth > el.clientWidth + 1; }).map(el => ({ el: desc(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })), 8),
      smallFontElements: cap(all.filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && isVis(el) && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => ({ el: desc(el), px: parseFloat(getComputedStyle(el).fontSize) })), 6),
      bodyFontPx: document.body ? parseFloat(getComputedStyle(document.body).fontSize) : null,
      fixedOrSticky: cap(all.filter(el => /^(fixed|sticky)$/.test(getComputedStyle(el).position) && isVis(el)).map(el => { const r = el.getBoundingClientRect(); return { el: desc(el), pos: getComputedStyle(el).position, top: Math.round(r.top), height: Math.round(r.height), z: getComputedStyle(el).zIndex }; }), 8),
    };
    // наложения внутри шапки (геометрия бокса; ложные срабатывания возможны — агент проверяет глазами/скриншотом)
    const firstNav = document.querySelector('nav');
    const header = document.querySelector('header') || document.querySelector('[role="banner"]') || (firstNav && firstNav.parentElement);
    const pairs = [];
    if (header) {
      const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      const leaf = [...header.querySelectorAll('*')].filter(el => (/^(IMG|SVG|INPUT|BUTTON)$/i.test(el.tagName) || ownText(el)) && isVis(el));
      for (let i = 0; i < leaf.length && pairs.length < 5; i++) for (let j = i + 1; j < leaf.length && pairs.length < 5; j++) {
        const a = leaf[i], b = leaf[j]; if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 0 && h > 0 && (w * h) / Math.min(ra.width * ra.height, rb.width * rb.height) > 0.2) pairs.push({ a: desc(a), b: desc(b) });
      }
    }
    out.layout.headerOverlaps = pairs;
    const navs = [...document.querySelectorAll('nav')];
    const sets = navs.map(n => [...n.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).join('|'));
    out.layout.nav = { count: navs.length, visible: navs.filter(isVis).length, duplicateLinkSets: sets.filter((s, i) => s && sets.indexOf(s) !== i).length };

    // --- интерактив (инвентарь для Шага 3.2) ---
    out.interactive = {
      details: document.querySelectorAll('details').length,
      ariaExpanded: document.querySelectorAll('[aria-expanded]').length,
      tabs: document.querySelectorAll('[role="tab"]').length,
      dialogs: document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog').length,
      carousels: document.querySelectorAll('.swiper, .slick-slider, [class*="carousel"], [class*="slider"]').length,
      selects: document.querySelectorAll('select').length,
      onclick: cap([...document.querySelectorAll('[onclick]')].map(el => ({ el: desc(el), onclick: T(el.getAttribute('onclick'), 60) })), 10),
      iframes: cap([...document.querySelectorAll('iframe')].map(f => ({ src: T(f.getAttribute('src') || '', 70), w: f.clientWidth, h: f.clientHeight })), 8),
      videos: document.querySelectorAll('video').length,
    };

    // --- формы ---
    const fieldOf = el => {
      const label = el.labels && el.labels[0];
      let star = false;
      if (label) { try { star = /\*/.test(label.textContent) || /\*/.test(getComputedStyle(label, '::after').content) || /required/i.test(label.className); } catch (e) {} }
      return {
        name: el.name || el.id || '', nameAttr: el.getAttribute('name') || '', type: el.type || el.tagName.toLowerCase(), required: el.required, ariaRequired: el.getAttribute('aria-required'),
        pattern: el.getAttribute('pattern'), maxlength: el.getAttribute('maxlength'), inputmode: el.getAttribute('inputmode'),
        autocomplete: el.getAttribute('autocomplete'), label: T(label ? label.textContent : el.getAttribute('placeholder') || el.getAttribute('aria-label'), 40), labelStar: star,
      };
    };
    out.forms = {
      count: document.forms.length,
      inputsOutsideForms: [...document.querySelectorAll('input, textarea, select')].filter(i => !i.form && i.type !== 'hidden').length,
      list: cap([...document.forms].map(f => ({
        id: f.id || '', name: f.getAttribute('name') || '', cls: T(f.className, 50), action: T(f.getAttribute('action') || '', 60), method: f.method, dataFormId: T(f.getAttribute('data-form-id') || (f.closest('[data-form-id]') ? f.closest('[data-form-id]').getAttribute('data-form-id') : ''), 40),
        hidden: cap([...f.querySelectorAll('input[type="hidden"]')].filter(h => /form|wpcf7|wpforms|gform|nf-|template|hs/i.test(h.name)).map(h => h.name + '=' + T(h.value, 30)), 6),
        fields: cap([...f.querySelectorAll('input:not([type="hidden"]), textarea, select')].filter(isVis).map(fieldOf), 25),
        submit: cap([...f.querySelectorAll('button, input[type="submit"]')].filter(isVis).map(b => T(b.textContent || b.value, 30)), 3),
        visible: isVis(f),
      })), 8),
    };
    out.note = 'JSON-LD, виджеты отзывов и свопы номеров могут дорисовываться позже: если результат снят раньше 3 с после загрузки — повтори запуск.';
    return out;
  });
}
