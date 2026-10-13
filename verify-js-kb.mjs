// 构建产物验证：确认新条目真的内联进 HTML 且可被检索
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dir, 'ctf-web-kb.html'), 'utf8');

const checks = [
  'js-sourcemap-restore', 'js-crypto-reverse', 'js-debug-dynamic',
  'Hook eval', 'unwebpack-sourcemap', '第 12 课', 'js-cheatsheet',
];
let ok = true;
for (const c of checks) {
  const hit = html.includes(c);
  if (!hit) ok = false;
  console.log((hit ? 'OK  ' : 'FAIL'), c);
}

// 数据内联在 <script id="app"> 里：const KB = {...};
const app = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!app) { console.log('FAIL 找不到 <script id="app">'); process.exit(1); }
const body = app[1];
const start = body.indexOf('const KB =') + 'const KB ='.length;
const end = body.indexOf('\n', start);
const data = JSON.parse(body.slice(start, end).trim().replace(/;$/, ''));
const recon = data.categories.find(c => c.id === 'recon');
const g = recon.groups.find(x => x.id === 'g-js-full');
console.log('recon 组数:', recon.groups.length, '总条目:', recon.groups.reduce((a, x) => a + x.entries.length, 0));
console.log('g-js-full 条目数:', g.entries.length);

// 模拟检索：标题/别名/标签/摘要/正文五层命中
const q = 'sourcemap';
const hits = [];
for (const c of data.categories)
  for (const gr of c.groups)
    for (const e of gr.entries) {
      const hay = [e.title, (e.aliases || []).join(' '), (e.tags || []).join(' '), e.summary, e.content].join(' ');
      if (hay.toLowerCase().includes(q)) hits.push(e.id);
    }
console.log(`检索 "${q}" 命中 ${hits.length} 条:`, hits.slice(0, 6).join(', '));

// 必备字段完整性
const bad = [];
for (const e of g.entries) {
  if (!e.id || !e.title || !e.summary || !e.content) bad.push(e.id || '?');
  if (!['easy', 'medium', 'hard'].includes(e.difficulty)) bad.push(e.id + '(difficulty)');
}
console.log(bad.length ? 'FAIL 字段缺失: ' + bad.join(', ') : 'OK  12 条必备字段齐全');

console.log(ok && !bad.length ? '\n✅ 全部验证通过' : '\n❌ 有失败项');
process.exit(ok && !bad.length ? 0 : 1);
