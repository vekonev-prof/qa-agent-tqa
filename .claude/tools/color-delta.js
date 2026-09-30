#!/usr/bin/env node
// color-delta.js — расстояние между цветами (CIEDE2000) и название цветового семейства. Ничего не оценивает «баг/не баг»:
// вердикт same/shade/different — только подсказка по стартовым допускам (см. константы ниже, подбираются пилотом).
// Использование (модель не считает цвета «в уме» — только через этот скрипт):
//   node .claude/tools/color-delta.js "#0A0A0A" "rgb(10, 10, 10)"                      # пара цветов
//   node .claude/tools/color-delta.js --palette "#0A0A0A,#C2BE7C,#FFFFFF" "#1E90FF" "rgb(194,190,124)" ...
//                                                                                     # каждый цвет — против палитры (ближайший цвет палитры)
// Поддерживаются #rgb, #rrggbb, rgb(...), rgba(...) (альфа игнорируется). Вывод — JSON, одна строка на цвет.

const SAME = 10;   // ΔE00 ≤ 10 — тот же цвет / едва отличимый оттенок: игнорировать
const DIFF = 25;   // ΔE00 > 25 — другой цвет: находка; между SAME и DIFF — заметный оттенок того же цвета

function parse(s) {
  s = String(s).trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return [...m[1]].map(c => parseInt(c + c, 16));
  m = s.match(/^#([0-9a-f]{6})/);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
  if (m) return [m[1], m[2], m[3]].map(Number);
  if (s === 'white') return [255, 255, 255];
  if (s === 'black') return [0, 0, 0];
  return null;
}

function toLab([r, g, b]) {
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;
  const h = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [h(X), h(Y), h(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function de2000(l1, l2) {
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, a) => (b === 0 && a === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360);
  const hp1 = hp(b1, ap1), hp2 = hp(b2, ap2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(rad(dh / 2));
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) { if (Math.abs(hp1 - hp2) > 180) hb += hp1 + hp2 < 360 ? 360 : -360; hb /= 2; }
  const T = 1 - 0.17 * Math.cos(rad(hb - 30)) + 0.24 * Math.cos(rad(2 * hb)) + 0.32 * Math.cos(rad(3 * hb + 6)) - 0.20 * Math.cos(rad(4 * hb - 63));
  const dTh = 30 * Math.exp(-Math.pow((hb - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cpb, 7) / (Math.pow(Cpb, 7) + Math.pow(25, 7)));
  const Sl = 1 + 0.015 * Math.pow(Lb - 50, 2) / Math.sqrt(20 + Math.pow(Lb - 50, 2));
  const Sc = 1 + 0.045 * Cpb, Sh = 1 + 0.015 * Cpb * T;
  const Rt = -Math.sin(rad(2 * dTh)) * Rc;
  return Math.sqrt(Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2) + Rt * (dC / Sc) * (dH / Sh));
}

function family(rgb) {
  const [r, g, b] = rgb.map(v => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (d < 0.08 || mx === 0) return l < 0.25 ? 'black' : l > 0.85 ? 'white' : 'gray';
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const names = [[15, 'red'], [45, 'orange'], [70, 'yellow'], [165, 'green'], [200, 'cyan'], [255, 'blue'], [290, 'purple'], [345, 'pink'], [361, 'red']];
  return names.find(([lim]) => h < lim)[1];
}

function compare(a, b) {
  const pa = parse(a), pb = parse(b);
  if (!pa || !pb) return { a, b, error: 'не удалось разобрать цвет' };
  const de = +de2000(toLab(pa), toLab(pb)).toFixed(1);
  const fa = family(pa), fb = family(pb);
  // «другой цвет»: расстояние велико ИЛИ разные хроматические семейства при заметном расстоянии; серые/чёрный/белый между собой — только по расстоянию
  const chromaticDiff = fa !== fb && !['black', 'white', 'gray'].includes(fa) && !['black', 'white', 'gray'].includes(fb);
  const verdict = de <= SAME ? 'same' : (de > DIFF || (chromaticDiff && de > SAME * 1.5)) ? 'different' : 'shade';
  return { a, b, deltaE: de, familyA: fa, familyB: fb, verdict };
}

const args = process.argv.slice(2);
if (args[0] === '--palette') {
  const palette = args[1].split(',').map(s => s.trim()).filter(Boolean);
  for (const c of args.slice(2)) {
    const best = palette.map(p => compare(c, p)).filter(r => !r.error).sort((x, y) => x.deltaE - y.deltaE)[0];
    console.log(JSON.stringify(best ? { color: c, nearest: best.b, deltaE: best.deltaE, familyColor: best.familyA, familyNearest: best.familyB, verdict: best.verdict } : { color: c, error: 'не удалось разобрать цвет' }));
  }
} else if (args.length === 2) {
  console.log(JSON.stringify(compare(args[0], args[1])));
} else {
  console.log('usage: color-delta.js A B | --palette "#a,#b,..." C1 C2 ...');
  process.exit(1);
}
