import fs from 'node:fs';
import path from 'node:path';

// 用法：node data/build.mjs [data目录]
// 把 data/_raw/*.md 合并为 data/<NN-cat>.json
//   NN-cat.md         = 主骨架（分类元数据 + 全部组/条目基线）
//   NN-cat.pN.md      = 分片（对指定条目做保姆级覆盖；同条目以靠后的分片为准）
const dataDir = path.resolve(process.argv[2] || 'data');
const rawDir = path.join(dataDir, '_raw');
const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.md'));

function parseMd(text) {
  const lines = text.split(/\r?\n/);
  const first = lines[0].match(/^#\s*([^|]+)\|([^|]+)\|(.+)$/);
  const groups = [];
  let curg = null, cure = null, inFence = false;
  for (let i = first ? 1 : 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; if (cure) cure.body.push(line); continue; }
    if (!inFence) {
      const gm = line.match(/^##\s*\[([^\]]+)\]\s*(.*)$/);
      if (gm) {
        const raw = gm[2] || ''; const sep = raw.indexOf('——');
        curg = { id: gm[1].trim(), name: (sep >= 0 ? raw.slice(0, sep) : raw).trim(), intro: (sep >= 0 ? raw.slice(sep + 2) : '').trim(), entries: [] };
        groups.push(curg); cure = null; continue;
      }
      const em = line.match(/^###\s*\[([^\]]+)\]\s*(.*)$/);
      if (em) {
        if (!curg) throw new Error(`ENTRY BEFORE GROUP: ${line}`);
        const parts = (em[2] || '').split(' | ').map(s => s.trim());
        const diff = parts[1] || 'medium';
        cure = { id: em[1].trim(), title: parts[0] || '', difficulty: /^(easy|medium|hard)$/.test(diff) ? diff : 'medium', summary: '', body: [] };
        cure.tags = (parts[2] && parts[2] !== '-' ? parts[2].split(';').map(s => s.trim()).filter(Boolean) : []);
        cure.aliases = (parts[3] && parts[3] !== '-' ? parts[3].split(';').map(s => s.trim()).filter(Boolean) : []);
        curg.entries.push(cure); continue;
      }
      if (cure && !cure.summary && /^>\s+/.test(line) && !/^>\s*\[!/.test(line)) {
        cure.summary = line.replace(/^>\s+/, '').trim(); continue;
      }
    }
    if (cure) cure.body.push(line);
  }
  return { header: first ? { id: first[1].trim(), name: first[2].trim(), icon: first[3].trim() } : null, groups };
}

const cats = new Map(); // key -> {filename, base, order, meta, groups: []}
for (const f of files) {
  const m = f.match(/^(\d\d-[a-z]+)(\.p(\d+))?\.md$/);
  if (!m) { console.error(`SKIP (命名不符): ${f}`); continue; }
  const base = m[1], isPart = !!m[3], partNo = m[3] ? parseInt(m[3]) : 0;
  if (!cats.has(base)) cats.set(base, { base, groups: [], meta: null, order: [] });
  const cat = cats.get(base);
  const tree = parseMd(fs.readFileSync(path.join(rawDir, f), 'utf8'));
  if (!isPart) {
    if (!tree.header) { console.error(`BAD HEADER: ${f}`); process.exit(1); }
    cat.meta = tree.header; cat.groups = tree.groups; cat.order = [0];
  } else {
    cat.order.push(partNo);
  }
}

let totalEntries = 0; const stats = {};
const catList = [...cats.values()].sort((a, b) => a.base.localeCompare(b.base));

for (const cat of catList) {
  if (!cat.meta) { console.error(`缺失主文件: ${cat.base}`); process.exit(1); }
  if (cat.order.length < 2) { /* 无分片，直接用主骨架 */ }
  // 应用所有分片（p1..pN 升序，后者覆盖前者）
  for (const p of cat.order.slice(1).sort((a, b) => a - b)) {
    const pf = `${cat.base}.p${p}.md`;
    const tree = parseMd(fs.readFileSync(path.join(rawDir, pf), 'utf8'));
    for (const g of tree.groups) {
      let tg = cat.groups.find(x => x.id === g.id);
      if (!tg) { tg = { id: g.id, name: g.name, intro: g.intro, entries: [] }; cat.groups.push(tg); }
      for (const e of g.entries) {
        const te = tg.entries.find(x => x.id === e.id);
        if (te) Object.assign(te, { title: e.title, difficulty: e.difficulty, tags: e.tags, aliases: e.aliases, summary: e.summary, body: e.body });
        else tg.entries.push(e);
      }
    }
  }
  // 序列化
  const out = {
    id: cat.meta.id, name: cat.meta.name, icon: cat.meta.icon,
    groups: cat.groups.map((g, gi) => ({
      id: g.id, name: g.name, intro: g.intro,
      entries: g.entries.map((e, ei) => ({
        id: e.id || 'e' + (ei + 1), title: e.title, tags: e.tags, aliases: e.aliases,
        difficulty: e.difficulty, summary: e.summary,
        content: e.body.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd(),
      })),
    })),
  };
  const outPath = path.join(dataDir, cat.base + '.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const n = out.groups.reduce((a, g) => a + g.entries.length, 0);
  totalEntries += n;
  stats[cat.base] = `${out.groups.length}组/${n}条`;
  console.log(`OK ${cat.base}.json (${cat.order.join('+')}分片)`);
}
console.log('---'); console.log(JSON.stringify(stats)); console.log('total entries:', totalEntries);