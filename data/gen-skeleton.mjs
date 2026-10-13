import fs from 'node:fs';
import path from 'node:path';

// 1) 为没有 _raw 骨架的 JSON 分类生成骨架 md
// 2) 打印全库条目清单（分类 -> 组 -> 条目），用于分配细化任务
const dataDir = path.resolve(process.argv[2] || 'data');
const rawDir = path.join(dataDir, '_raw');
fs.mkdirSync(rawDir, { recursive: true });

const jsons = fs.readdirSync(dataDir).filter(f => /^\d\d-.+\.json$/.test(f)).sort();
const manifest = {};

for (const f of jsons) {
  const j = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  const base = f.replace(/\.json$/, '');
  const mdFile = path.join(rawDir, base + '.md');
  if (!fs.existsSync(mdFile)) {
    // 生成骨架 md：真实文本正文
    let md = `# ${j.id}|${j.name}|${j.icon}\n`;
    for (const g of j.groups) {
      md += `## [${g.id}] ${g.name}——${g.intro}\n`;
      for (const e of g.entries) {
        md += `### [${e.id}] ${e.title} | ${e.difficulty} | ${(e.tags || []).join(';')} | ${(e.aliases || []).join(';')}\n`;
        md += `> ${e.summary}\n`;
        md += e.content + '\n';
      }
    }
    fs.writeFileSync(mdFile, md, 'utf8');
    console.log('SKELETON', mdFile);
  }
  // 清单
  manifest[base] = j.groups.map(g => ({
    gid: g.id, gname: g.name,
    entries: g.entries.map(e => ({ id: e.id, title: e.title, lines: e.content.split('\n').length })),
  }));
}

fs.writeFileSync(path.join(dataDir, '_manifest.json'), JSON.stringify(manifest, null, 1), 'utf8');
const total = Object.values(manifest).flatMap(groups => groups.flatMap(g => g.entries)).length;
console.log('分类数:', Object.keys(manifest).length, '条目总数:', total);
console.log('清单已写入 data/_manifest.json');