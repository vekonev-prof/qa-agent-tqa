// phones-audit.js — телефоны страницы ДО подмены номера (исходный HTML без выполнения JS).
// Запуск (в уже открытой именованной сессии, любое разрешение; ~1–2 с):
//   playwright-cli --raw -s=<имя> run-code --filename=.claude/tools/phones-audit.js
// Скрипт открывает ту же страницу в отдельном контексте браузера с ОТКЛЮЧЁННЫМ JavaScript: скрипты колл-трекинга (CallRail, Invoca,
// WhatConverts…) не выполняются, поэтому виден оригинальный (несвопнутый) номер из исходного кода. Работает и для file://-страниц.
// Если страница закрыта окном Basic-авторизации браузера, контекст получит 401 — тогда ответ содержит `error`; в этом случае возьми номера
// через `curl -u` (сырой HTML) либо из DOM (`page-audit.js`) и отметь это в «Технических деталях».
// Ничего не оценивает — только факты:
//   tel — ссылки `tel:` (href, цифры, текст, aria-label, зона, nonUsCode: код страны не США);
//   text — номера США в видимом тексте (raw, нормализованные 10 цифр `n`, зона, strict: запись ровно `(XXX) XXX-XXXX`, plus1: есть `+1`);
//   nonUs — номера с кодом страны не США в видимом тексте (+7, +44, 00…);
//   schemaTel — значения `telephone` из JSON-LD;
//   distinct — сводка по нормализованным номерам: сколько раз в `tel:` и в тексте и в каких зонах.
// Зоны: header (тег или класс header|topbar) / footer (тег или класс footer) / nav / form / cta (класс cta|btn|button) / form-area (в 4 уровнях предков есть форма) / body.
async page => {
  const browser = page.context().browser();
  if (!browser) return JSON.stringify({ error: 'browser недоступен: используй curl и page-audit.js' });
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  try {
    const p = await ctx.newPage();
    const resp = await p.goto(page.url(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (resp && resp.status() >= 400) return JSON.stringify({ error: 'HTTP ' + resp.status() + ' для JS-отключённого контекста (пароль/антибот?)' });
    const out = await p.evaluate(() => {
      const T = (s, n = 80) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
      const norm = d => (d.length === 11 && d[0] === '1') ? d.slice(1) : d;
      const zoneOf = el => {
        if (el.closest('header,[class*="header" i],[class*="topbar" i],[class*="top-bar" i]')) return 'header';
        if (el.closest('footer,[class*="footer" i]')) return 'footer';
        if (el.closest('nav')) return 'nav';
        if (el.closest('form')) return 'form';
        if (el.closest('[class*="cta" i],[class*="btn" i],[class*="button" i]')) return 'cta';
        let a = el.parentElement;
        for (let i = 0; i < 4 && a && a !== document.body; i++, a = a.parentElement) if (a.querySelector('form')) return 'form-area';
        return 'body';
      };
      const tel = [...document.querySelectorAll('a[href^="tel:" i]')].map(a => {
        const raw = a.getAttribute('href'), d = raw.replace(/\D/g, '');
        const nonUsCode = /^tel:\s*(\+|00)/i.test(raw) ? !/^tel:\s*(\+|00)1\D*\d/i.test(raw) : (d.length > 10 && d[0] !== '1');
        return { href: raw, digits: d, n: norm(d), text: T(a.textContent, 40), aria: a.getAttribute('aria-label'), zone: zoneOf(a), nonUsCode };
      });
      const text = [], nonUs = [];
      const US = /(?:\+?1[\s.\-]*)?\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}/g;
      const INTL = /(?:\+|\b00)(?!1[\s.\-()\d])\d{1,3}[\s.\-()]*\d[\d\s.\-()]{6,16}\d/g;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const par = n.parentElement;
        if (!par || par.closest('script,style,noscript,template')) continue;
        let s = n.textContent;
        if (!/\d{4}/.test(s)) continue;
        const z = zoneOf(par);
        s = s.replace(INTL, m => { nonUs.push({ raw: T(m, 40), zone: z }); return ' '; });
        (s.match(US) || []).forEach(m => {
          const raw = m.trim(), d = raw.replace(/\D/g, '');
          text.push({ raw, n: norm(d), zone: z, strict: /^\(\d{3}\) \d{3}-\d{4}$/.test(raw), plus1: /^\+1/.test(raw) });
        });
      }
      const schemaTel = [];
      document.querySelectorAll('script[type="application/ld+json"]').forEach(sc => {
        const t = sc.textContent;
        (t.match(/["']telephone["']\s*:\s*["']([^"']+)["']/g) || []).forEach(m => schemaTel.push(m.replace(/^["']telephone["']\s*:\s*["']|["']$/g, '')));
      });
      const distinct = {};
      const bump = (k, kind, zone) => { const o = distinct[k] || (distinct[k] = { tel: 0, text: 0, zones: [] }); o[kind]++; if (!o.zones.includes(zone)) o.zones.push(zone); };
      tel.forEach(t => bump(t.n, 'tel', t.zone));
      text.forEach(t => bump(t.n, 'text', t.zone));
      const cap = (a, n = 40) => a.length > n ? a.slice(0, n).concat([{ more: a.length - n }]) : a;
      return { mode: 'source-no-js', tel: cap(tel), text: cap(text), nonUs: cap(nonUs), schemaTel: [...new Set(schemaTel)], distinct };
    });
    out.url = page.url();
    return JSON.stringify(out);
  } finally {
    await ctx.close();
  }
}
