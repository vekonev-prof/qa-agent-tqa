#!/usr/bin/env node
// figma-frames.js — локальный разбор БОЛЬШОГО ответа Figma MCP `get_metadata` (его сохраняют в файл, когда он не влезает в контекст;
// у реальных страниц макета он бывает в миллионы символов — в контекст такое целиком не читаем никогда).
// Ничего не оценивает: печатает компактный список того, что найдено в XML-метаданных.
//
//   node .claude/tools/figma-frames.js <файл-ответа.json|.txt>                  # кадры верхнего уровня страницы: тип, id, имя, ширина×высота, «разрешение» по ширине
//   node .claude/tools/figma-frames.js <файл-ответа> --frame <id>               # блоки внутри кадра по порядку сверху вниз: id, имя, высота, заголовки (тексты) блока
//
// «Разрешение» по ширине кадра: 1200–1999 → desktop, 700–1199 → tablet, 300–699 → mobile, иначе — other. Черновики и служебные кадры
// (узкие/широкие мелочи, «refs» и т.п.) не отфильтровываются здесь — выбор основного кадра делает агент по правилам скилла figma-compare.
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('usage: figma-frames.js <file> [--frame <id>]'); process.exit(1); }
const fi = process.argv.indexOf('--frame');
const frameId = fi > 0 ? process.argv[fi + 1] : null;

let raw = fs.readFileSync(file, 'utf8');
try { const j = JSON.parse(raw); if (Array.isArray(j)) raw = j.map(x => x.text || '').join('\n'); } catch (_) { /* уже XML */ }
raw = raw.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

// разбор тегов со стеком (метаданные Figma — плоский XML: <тип id name x y width height> ... </тип>)
const tagRe = /<(\/)?([\w-]+)([^>]*?)(\/)?>/g;
const attr = (s, k) => { const m = s.match(new RegExp('\\b' + k + '="([^"]*)"')); return m ? m[1] : ''; };
const root = { type: 'root', children: [] };
const stack = [root];
let m;
while ((m = tagRe.exec(raw))) {
  const [, closing, type, attrs, selfClose] = m;
  if (closing) { if (stack.length > 1) stack.pop(); continue; }
  const node = { type, id: attr(attrs, 'id'), name: attr(attrs, 'name'), x: +attr(attrs, 'x') || 0, y: +attr(attrs, 'y') || 0, w: +attr(attrs, 'width') || 0, h: +attr(attrs, 'height') || 0, children: [] };
  stack[stack.length - 1].children.push(node);
  if (!selfClose) stack.push(node);
}

const res = w => (w >= 1200 && w < 2000 ? 'desktop' : w >= 700 && w < 1200 ? 'tablet' : w >= 300 && w < 700 ? 'mobile' : 'other');
const find = (n, id) => { if (n.id === id) return n; for (const c of n.children) { const r = find(c, id); if (r) return r; } return null; };
const texts = (n, out = []) => { if (n.type === 'text' && n.name) out.push(n.name); for (const c of n.children) { if (out.length >= 6) break; texts(c, out); } return out; };
const round = v => Math.round(v);

if (!frameId) {
  const canvas = root.children[0] && root.children[0].type === 'canvas' ? root.children[0] : root;
  console.log(`# верхний уровень «${canvas.name || 'страница'}» (${canvas.children.length} узлов; показаны frame/section/instance)`);
  for (const c of canvas.children) {
    if (!['frame', 'section', 'instance', 'component', 'symbol'].includes(c.type)) continue;
    console.log([c.type, c.id, JSON.stringify(c.name), `${round(c.w)}x${round(c.h)}`, res(c.w)].join('\t'));
  }
} else {
  const f = find(root, frameId);
  if (!f) { console.error('кадр ' + frameId + ' не найден в файле'); process.exit(2); }
  console.log(`# блоки кадра ${f.id} «${f.name}» ${round(f.w)}x${round(f.h)} (${res(f.w)}), сверху вниз`);
  const kids = f.children.filter(c => c.h > 0 && c.w > 0).sort((a, b) => a.y - b.y);
  kids.forEach((c, i) => console.log([i + 1, c.type, c.id, JSON.stringify(c.name), `h=${round(c.h)}`, 'заголовки/тексты: ' + JSON.stringify(texts(c))].join('\t')));
}
