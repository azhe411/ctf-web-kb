# CTF·Web 离线知识库

针对 **线下 CTF 比赛** 设计的一站式 Web 安全离线知识库 —— 可视化界面、强大全文检索、**完全无需联网**。

> **364 条 / 17 大类 / 单文件 2.1 MB**，全部内容内嵌在一个 HTML 里 —— 拷到 U 盘就能带进场，断网也能查。
> 纯零依赖：不需要 npm install、不需要构建工具链、不需要起服务，双击就开。

## 快速开始（30 秒）

1. 找到构建产物 **`ctf-web-kb.html`**（本目录下）
2. **双击打开**（用 Chrome / Edge 等任意现代浏览器）
3. 使用：
   - 顶部搜索框输入任意关键词（`/` 快捷键聚焦），结果即时刷新并高亮
   - 左侧分类树逐层展开浏览（大分类 → 子分类 → 条目）
   - 点开条目看完整知识，代码块右上角一键复制
   - 「★ 收藏」与「📝 随文笔记」保存在本机浏览器（localStorage），关掉网页不丢
   - `↑↓` 选择搜索结果，`Enter` 打开，`Esc` 返回/清空

> 💡 把 `ctf-web-kb.html` 这一个文件拷到 U 盘，就是整个知识库。数据全部内嵌，无任何外部依赖。

## 检索能力

| 能力 | 说明 |
|---|---|
| 全文检索 | 标题 / 别名(英文关键词) / 标签 / 摘要 / 正文 五层命中 |
| 优先级排序 | 标题命中 > 别名/标签 > 摘要 > 正文；正文字数加权 |
| 高亮显示 | 结果列表与正文摘要中的关键词高亮 |
| 模糊兜底 | 打错字 / 记不全时自动用「子序列模糊匹配」给出候选 |
| 筛选 | 难度筛选（简单/中等/困难）+ 标签筛选（点任意 #标签 即可） |
| 多词 AND | 空格分隔多个关键词，默认全部命中（无结果自动降级 ANY） |

## 目录结构

```
ctf-web-kb/
├── ctf-web-kb.html    ← 最终产物（可分发，双击即用）
├── template.html      ← 应用框架（界面 + 检索 + 渲染逻辑）
├── build.mjs          ← 构建脚本（把 data/*.json 内联进模板）
└── data/              ← 知识数据（JSON，按大类一个文件）
    ├── 00-quickref.json   极速速查
    ├── 01-basics.json     基础协议
    ├── 02-tools.json      工具与速查手册
    ├── 03-xss.json        XSS 与前端安全
    ├── 04-crypto.json     编码与密码
    ├── 05-sqli.json       SQL 注入
    ├── 06-injection.json  命令/模板注入
    ├── 07-logic.json      逻辑漏洞与越权
    ├── 08-server.json     服务端漏洞
    ├── 09-auth.json       认证与会话
    ├── 10-linux.json      Linux 与命令速查
    ├── 11-lang.json       语言与框架特性
    ├── 12-middleware.json 中间件与运维
    ├── 13-recon.json      信息收集与侦察
    ├── 14-exploit.json    利用与提权
    ├── 15-php.json        PHP 特性与技巧
    ├── 16-redos.json      正则回溯（ReDoS）
    ├── _raw/              ← 各分类的 Markdown 源（改这里再生成）
    └── build.mjs          ← 把 _raw/*.md 合并为 data/*.json 的生成器
```

> 📌 **JS 提取与分析知识体系**（零基础保姆级，12 课约 4.6 万字）在 `data/_raw/13-recon.p1.md` 的 `g-js-full` 组，检索关键词：`JS`、`sourcemap`、`解混淆`、`Hook`、`签名逆向`、`接口提取`。
> 课程顺序：① URL 与相对路径 ② 开发者工具 ③ 静态搜索 ④ Source Map 还原 ⑤ 接口清单 ⑥ 美化与解混淆 ⑦ 加密签名逆向 ⑧ 动态调试与 Hook ⑨ Burp 被动抓包 ⑩ 排错手册 ⑪ 完整示范 ⑫ 一页速查表。

> 🔫 **文件上传实战补充**（`08-server` 的 `g-upload` 组，`data/_raw/08-server.p4.md`）检索关键词：`测绘`、`MIME 绕过`、`Access denied`、`user.ini`、`图片马`。
> 新增 5 条：**过滤测绘方法论** → **MIME/Content-Type 绕过** → **执行诊断（PHP-FPM 判读）** → **`.user.ini` 多语言文件与 300 秒缓存陷阱** → **图片马二进制 `<?` 陷阱**。
> `14-exploit` 的 `g1` 同步新增 `webshell-payload-pitfall`（一句话马参数写法与无回显排查）。

## 验证构建产物

```bash
node verify-kb.mjs      # 全库：结构完整性 + 新条目存在性 + 关键内容 + 检索命中
node verify-js-kb.mjs   # JS 知识体系专项
```

`verify-kb.mjs` 会校验条目总数、id 唯一性、必备字段，确认新增条目的关键内容真的写进去了，并模拟检索验证能被搜到。

## 重新构建（改了数据后）

```bash
cd ctf-web-kb
node build.mjs
```

构建会校验每个 JSON 的合法性、条目 id 唯一性、必备字段，并做应用脚本语法冒烟测试，全部通过才输出 `ctf-web-kb.html`。

## 新增 / 修改知识

在 `data/` 下编辑对应 JSON 或新建 `NN-xxx.json`，格式：

> 更省事的编辑方式：直接改 `data/_raw/NN-xxx.md`（纯 Markdown，无需转义），再运行 `node data/build.mjs` 自动合并生成 JSON。

```json
{
  "id": "分类英文id",
  "name": "分类中文名（侧边栏显示）",
  "icon": "emoji",
  "groups": [
    {
      "id": "子分类id",
      "name": "子分类名",
      "intro": "子分类导语",
      "entries": [
        {
          "id": "全局唯一英文id（kebab-case）",
          "title": "标题",
          "tags": ["标签1", "标签2"],
          "aliases": ["英文别名", "用于搜索"],
          "difficulty": "easy | medium | hard",
          "summary": "一句话概述",
          "content": "Markdown 正文，## 分节，代码块带语言标签，> [!tip]/[!warn]/[!danger]/[!info] 提示"
        }
      ]
    }
  ]
}
```

> 注意：`content` 是 JSON 单行字符串，换行写 `\n`，双引号写 `\"`。
> 建议内容质量标准：`## 原理 / ## 检测 / ## Payload 速查(表格) / ## 绕过 / ## 实战要点`。

## 快捷键

| 按键 | 功能 |
|---|---|
| `/` | 聚焦搜索框 |
| `↑` `↓` | 在结果列表间移动选择 |
| `Enter` | 打开选中的条目 |
| `Esc` | 清空搜索 / 从条目返回上一页 |

## 小技巧

- 记不清英文名时直接搜英文（如 `union select`、`onerror`、`rebinding`）
- 搜不到就换短词；模糊匹配会自动兜底
- 打题时把思路写在「📝 我的笔记」，下次直接翻收藏/最近浏览

## 免责声明

本仓库内容仅用于**授权的安全测试、CTF 比赛与安全学习**，所有 Payload 与技巧请只在你有权限的目标上使用。未授权的渗透测试属于违法行为，后果自负。

## 许可

[MIT](LICENSE) —— 随便用，改完能提个 PR 就更好了