// CTF-Web 知识库构建脚本：把 data/*.json 内联进 template.html -> ctf-web-kb.html
// 用法: node build.mjs   （要求 Node >= 18）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dir, "data");
const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json") && !f.startsWith("_")).sort();

const categories = [];
const ids = new Set();
const errors = [];

for (const f of files) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8")); }
  catch (e) { errors.push(`[JSON] ${f}: ${e.message}`); continue; }
  if (!j.id || !j.name || !Array.isArray(j.groups)) { errors.push(`[STRUCT] ${f}: 缺少 id/name/groups`); continue; }
  for (const g of j.groups) {
    if (!g.id || !g.name || !Array.isArray(g.entries)) { errors.push(`[GROUP] ${f}: ${g.name || "?"} 结构错误`); continue; }
    for (const en of g.entries) {
      if (!en.id || !en.title || typeof en.content !== "string") { errors.push(`[ENTRY] ${f}/${g.name}/${en.title}: 缺 id/title/content`); continue; }
      if (ids.has(en.id)) errors.push(`[DUP] ${en.id} 重复 (${f})`);
      ids.add(en.id);
      if (!en.summary) errors.push(`[WARN] ${f}/${en.id}: 缺 summary`);
      if (en.difficulty && !["easy", "medium", "hard"].includes(en.difficulty)) errors.push(`[WARN] ${f}/${en.id}: difficulty=${en.difficulty} 非法`);
    }
  }
  categories.push(j);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

const total = categories.reduce((a, c) => a + c.groups.reduce((x, g) => x + g.entries.length, 0), 0);
const tpl = fs.readFileSync(path.join(dir, "template.html"), "utf8");
if (!tpl.includes("/*__DATA__*/")) { console.error("模板缺少 /*__DATA__*/ 占位符"); process.exit(1); }

// 应用脚本语法冒烟测试（只编译不执行）
const m = tpl.match(/<script id="app">([\s\S]*?)<\/script>/);
if (m) {
  const appCode = m[1].replace("/*__DATA__*/", '{"categories":[]}');
  try { new Function(appCode); }
  catch (e) { console.error("❌ 应用脚本语法错误:", e.message); process.exit(1); }
  console.log("✅ 应用脚本语法 OK");
} else {
  console.error("❌ 找不到 <script id=\"app\">");
  process.exit(1);
}

// 内联 JSON 到 <script> 的安全转义：字面 < > & 会让浏览器把数据内容误当 HTML 标签
// （尤其 <script> 开标签会开启新脚本块导致语法炸掉）；\uXXXX 是合法 JSON 转义，解析后还原
const inlineJson = JSON.stringify({ categories })
  .replace(/</g, "\\u003C")
  .replace(/>/g, "\\u003E")
  .replace(/&/g, "\\u0026")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");
// 必须用函数形式替换：replace 的字符串替换参数会把 $&/$'/ 等展开成模板内容，
// JSON payload 里大量 $ 序列会污染数据（经典坑）
const out = tpl.split("/*__DATA__*/").join(inlineJson);
const outPath = path.join(dir, "ctf-web-kb.html");
fs.writeFileSync(outPath, out);
console.log(`✅ 构建成功: ${outPath}  (${(out.length / 1024).toFixed(0)} KB, ${categories.length} 大类, ${total} 条)`);