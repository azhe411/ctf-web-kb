// 验证分类卡片点击行为：模拟 DOM 环境跑真实的应用脚本，断言 openCat 正确切视图
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dir, 'ctf-web-kb.html'), 'utf8');
const app = html.match(/<script id="app">([\s\S]*?)<\/script>/)[1];

// 极简 DOM 桩：只实现被测路径需要的接口
const noop = () => {};
const mkEl = (id) => ({
  id, innerHTML: '', textContent: '', value: '', scrollTop: 0,
  _h: {}, style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener(t, f) { (this._h[t] ||= []).push(f); },
  querySelector: () => null, querySelectorAll: () => [],
  closest: () => null, appendChild: noop, removeChild: noop,
  setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
  scrollIntoView: noop, select: noop, focus: noop, open: false,
  parentElement: { querySelectorAll: () => [] },
});
const els = {};
const get = (sel) => (els[sel] ||= mkEl(sel));
globalThis.document = {
  querySelector: get,
  querySelectorAll: () => [],
  createElement: () => mkEl('tmp'),
  addEventListener: noop,
  body: mkEl('body'),
};
globalThis.window = { addEventListener: noop, location: { hash: '' } };
globalThis.location = globalThis.window.location;
globalThis.localStorage = { getItem: () => null, setItem: noop };
globalThis.setTimeout = setTimeout;
// Node 24 已把 navigator 定义为只读 getter，需用 defineProperty 覆盖
try { globalThis.navigator = {}; } catch (_) {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
}
globalThis.__hooks = {};

// 用函数包一层，把内部函数暴露到 __hooks 以便断言
const sandbox = app + '\n;__hooks.openCat=openCat;__hooks.render=render;__hooks.getState=()=>state;__hooks.CATS=CATS;__hooks.view=view;__hooks.search=search;';
const run = new Function('__hooks', 'document', 'window', 'location', 'navigator', 'localStorage', sandbox);
run(globalThis.__hooks, globalThis.document, globalThis.window, globalThis.location, globalThis.navigator, globalThis.localStorage);

const H = globalThis.__hooks;
const CATS = H.CATS;
console.log('大类数:', CATS.length);

// 断言 1：从首页点分类卡片，应切到 list 模式并锁定该大类
const target = CATS.find(c => c.id === 'recon') || CATS[0];
H.getState().mode = 'home';
H.openCat(target.id);
const st = H.getState();
const gset = new Set();
target.groups.forEach(g => g.entries.forEach(e => gset.add(e.id)));

console.log('mode =', st.mode, st.mode === 'list' ? 'OK' : 'FAIL');
console.log('catFilter =', st.catFilter, st.catFilter === target.id ? 'OK' : 'FAIL');

// 断言 2：列表内容只含该大类条目
const inner = H.view().innerHTML;
const listed = [...inner.matchAll(/data-open="([^"]+)"/g)].map(m => m[1]);
const outside = listed.filter(id => !gset.has(id));
console.log('渲染条目数 =', listed.length, '/ 该大类应有 =', gset.size);
console.log('越界条目 =', outside.length, outside.length === 0 ? 'OK' : 'FAIL ' + outside.slice(0, 5));

// 断言 3：标题显示大类名，不是"全部条目"
const titleOk = inner.includes(target.name) && !inner.includes('全部条目');
console.log('标题正确 =', titleOk ? 'OK' : 'FAIL');

// 断言 4：切到另一个大类应换成另一批条目（不粘滞）
const other = CATS.find(c => c.id !== target.id);
H.openCat(other.id);
const listed2 = [...H.view().innerHTML.matchAll(/data-open="([^"]+)"/g)].map(m => m[1]);
const gset2 = new Set();
other.groups.forEach(g => g.entries.forEach(e => gset2.add(e.id)));
const ok4 = listed2.length > 0 && listed2.every(id => gset2.has(id));
console.log('切换大类 =', other.name, listed2.length, '条', ok4 ? 'OK' : 'FAIL');

// 断言 5：未知大类不应崩，也不应改变状态
const before = H.getState().catFilter;
H.openCat('__不存在__');
console.log('未知 id 安全 =', H.getState().catFilter === before ? 'OK' : 'FAIL');

// 断言 6：搜索时应自动解除大类过滤（否则搜不到全库）
H.openCat(target.id);
H.getState().q = 'sourcemap'; H.getState().mode = 'list';
H.getState().catFilter = null;
const sr = H.search('sourcemap', null, 'all');
console.log('解除过滤后搜索 =', sr.length, '条', sr.length > 0 ? 'OK' : 'FAIL');

const modeOk = st.mode === 'list';
const catOk = listed.length === gset.size && listed.length > 0;

const allOk = modeOk && catOk && outside.length === 0 && titleOk && ok4 && sr.length > 0;
console.log('\n小结: mode=' + modeOk, 'cat条目=' + catOk, '越界=' + (outside.length === 0),
  '标题=' + titleOk, '切换=' + ok4, '搜索=' + (sr.length > 0));
console.log(allOk ? '✅ 分类跳转全部通过' : '❌ 有失败断言');
process.exit(allOk ? 0 : 1);
