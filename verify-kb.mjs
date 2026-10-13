// 知识库通用回归检查：结构完整性 + 新条目存在性 + 检索命中
// 用法: node verify-kb.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dir, 'ctf-web-kb.html'), 'utf8');

// 数据内联在 <script id="app"> 里的 const KB = {...}
const app = html.match(/<script id="app">([\s\S]*?)<\/script>/);
if (!app) { console.log('FAIL 找不到 <script id="app">'); process.exit(1); }
const body = app[1];
const start = body.indexOf('const KB =') + 'const KB ='.length;
const data = JSON.parse(body.slice(start, body.indexOf('\n', start)).trim().replace(/;$/, ''));

let fail = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK  ' : 'FAIL') + ' ' + msg); if (!cond) fail++; };

// 1. 结构完整性
const ids = new Set();
let entries = 0, missingSummary = 0, badDiff = 0;
for (const c of data.categories) {
  for (const g of c.groups) {
    for (const e of g.entries) {
      entries++;
      if (ids.has(e.id)) { console.log('FAIL 重复 id: ' + e.id); fail++; }
      ids.add(e.id);
      if (!e.summary) missingSummary++;
      if (!['easy', 'medium', 'hard'].includes(e.difficulty)) badDiff++;
    }
  }
}
ok(entries === 364, `条目总数 ${entries}（期望 364）`);
ok(missingSummary === 0, `缺 summary 的条目 ${missingSummary} 条`);
ok(badDiff === 0, `difficulty 非法的条目 ${badDiff} 条`);

// 2. 本次新增条目必须存在
const NEW = [
  'upload-filter-probe', 'upload-mime-bypass', 'upload-exec-diag',
  'upload-userini-polyglot', 'upload-image-shell-pit', 'webshell-payload-pitfall',
];
const byId = new Map();
for (const c of data.categories) for (const g of c.groups) for (const e of g.entries) byId.set(e.id, e);
for (const id of NEW) ok(byId.has(id), `新条目存在: ${id}`);

// 3. 每条新条目必须把本次踩到的关键点写进去
const MUST = {
  'upload-filter-probe': ['trace-ascii', 'uploads', 'MIME'],
  'upload-mime-bypass': ['$_FILES', 'octet-stream', '浏览器'],
  'upload-exec-diag': ['Access denied', 'File not found', 'limit_extensions', '405'],
  'upload-userini-polyglot': ['cache_ttl', '300', 'auto_prepend_file', 'GIF89a'],
  'upload-image-shell-pit': ['xpacket', 'Parse error', 'begin', 'short_open_tag'],
  'webshell-payload-pitfall': ['2>&1', 'stderr', 'system("id")'],
};
for (const [id, keys] of Object.entries(MUST)) {
  const e = byId.get(id);
  for (const k of keys) ok(e && e.content.includes(k), `${id} 含关键字「${k}」`);
}

// 4. 检索命中（模拟模板的五层命中）
const search = (q) => {
  const t = q.toLowerCase();
  const hit = [];
  for (const c of data.categories) for (const g of c.groups) for (const e of g.entries) {
    const hay = [e.title, (e.aliases || []).join(' '), (e.tags || []).join(' '), e.summary, e.content].join(' ').toLowerCase();
    if (hay.includes(t)) hit.push(e.id);
  }
  return hit;
};
for (const q of ['limit_extensions', 'cache_ttl', 'Access denied', 'Content-Type', '2>&1', 'xpacket']) {
  const h = search(q);
  ok(h.length > 0, `检索「${q}」命中 ${h.length} 条`);
}

console.log(fail === 0 ? `\n✅ 全部通过（${entries} 条 / ${data.categories.length} 大类）` : `\n❌ ${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
