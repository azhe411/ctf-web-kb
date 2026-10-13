import fs from 'node:fs';
import path from 'node:path';

// 按 manifest 顺序把每个分类的条目切成若干分片，每分片 <= 7 条
const dataDir = path.resolve(process.argv[2] || 'data');
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, '_manifest.json'), 'utf8'));

const plan = {};
for (const [cat, groups] of Object.entries(manifest)) {
  const all = groups.flatMap(g => g.entries.map(e => ({ id: e.id, title: e.title, gid: g.gid, gname: g.gname })));
  const nParts = Math.ceil(all.length / 7);
  const size = Math.ceil(all.length / nParts);
  const parts = [];
  for (let i = 0; i < nParts; i++) {
    parts.push(all.slice(i * size, (i + 1) * size));
  }
  plan[cat] = parts.map((p, i) => ({ part: i + 1, entries: p }));
}
fs.writeFileSync(path.join(dataDir, '_plan.json'), JSON.stringify(plan, null, 1), 'utf8');
let total = 0;
for (const [cat, parts] of Object.entries(plan)) {
  console.log(cat, '->', parts.map(p => `p${p.part}(${p.entries.length}条)`).join(' '));
  total += parts.length;
}
console.log('总分片:', total);