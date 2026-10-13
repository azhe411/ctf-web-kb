# recon|信息收集与侦察|🔍

## [g-js-full] JS 提取与分析知识体系——从零基础到能独立做题

> [!info]
> **阅读前必看：先建立三个直觉，后面每一步都会变简单**
> 1. **现代网站是"空壳 + 数据"**。你按 `Ctrl+U` 看到的 HTML 里往往没有真实内容——真正的页面是浏览器下载 JS、由 JS 往后端要数据、再把数据画到屏幕上的。所以 **API 接口地址、参数名、加密方式，全部在 JS 里**。
> 2. **JS 运行在别人的浏览器上，天生藏不住秘密**。你能看到的代码，任何人都能看到。所以写在 JS 里的密钥、判断逻辑、隐藏页面，等于公开。
> 3. **CTF 里 JS 通常只考三件事**：① 找接口（通向下一关的门）② 找密钥/隐藏信息（直接给 flag 或给登录凭据）③ 逆逻辑（弹窗校验、加密签名，需要还原才能伪造请求）。
>
> 下面 12 条按学习顺序排列：前 3 条解决"**JS 在哪、怎么拿下来**"，中间 5 条解决"**拿到后怎么读**"，最后 4 条解决"**读不懂怎么硬啃**"。零基础请从第 1 条顺序读到第 12 条。

### [js-url-basics] 第 1 课：URL 与相对路径——搞清 `/static/js/app.js` 到底是什么 | easy | 零基础;JS提取 | js url;相对路径;绝对路径;JS在哪
> 零基础第一步：搞清浏览器地址栏、网页源码里的路径、你 curl 的地址三者关系，否则后面每一步都会卡在"文件到底下载到哪"。

#### 这条要解决什么
你现在只会"打开网站"。但在 JS 分析里，你必须能一眼看出 `/static/js/app.js` 的**完整真实地址**是什么。这事看着幼稚，却是 90% 新手第一步就翻车的地方——下载下来一堆写着 404 的 HTML 文件，还以为是目标做了防护。学完这条，你能把页面上任何一个 JS 变成电脑上的一个文件。

#### 需要准备什么
- 一台电脑 + 一个浏览器（Chrome / Edge 都行）
- Windows 自带 PowerShell，或比赛用的 Kali 里的 bash
- **完全零基础替代方案**：用浏览器 F12 就能做完这条全部步骤，不需要装任何东西

#### 第 0 步：先在脑子里装好"三种写法"的概念
假设目标网站首页是 `http://example.com/`。网页 HTML 里可能出现四种写法，它们指向的文件位置规则不同：

| HTML 里看到的写法 | 类型 | 拼出来的真实地址 | 规则 |
| --- | --- | --- | --- |
| `src="/static/js/app.js"` | 绝对路径 | `http://example.com/static/js/app.js` | 以 `/` 开头：从**域名根**接 |
| `src="static/js/app.js"` | 相对路径 | `http://example.com/static/js/app.js` | 不以 `/` 开头：从**当前页面所在目录**接 |
| `src="../js/app.js"` | 相对路径 | `http://example.com/js/app.js` | `..` 表示退一级目录 |
| `src="https://cdn.x.com/a.js"` | 完整 URL | `https://cdn.x.com/a.js` | 已经是全的，直接用 |

> [!tip]
> 记不住就用**作弊招**：F12 → Network → 刷新页面 → 找到那个 JS → 右键 `Copy` → `Copy URL`。浏览器已经帮你拼好了，100% 不会错。新手完全可以用这招做完前几道题，熟练了再回来看原理。

#### 第 1 步：用浏览器把 JS 找出来
打开目标首页 → 按 `F12` → 点 `Network`（网络）标签 → 按 `F5` 刷新页面 → 在过滤器框里输入 `.js`。

你会看到一列 JS 文件。逐个点开，看 `Headers` 里的 `Request URL`，那就是完整地址。

> [!warn]
> 新手最常见的错误是**用「查看网页源代码」找 JS**。`Ctrl+U` 看到的源代码里可能一个 `<script>` 都没有——因为页面是 JS 动态生成的。**必须用 F12 的 Network 面板**，或者 Elements 面板（它显示的是 JS 执行后的最终 DOM）。

#### 第 2 步：用命令行批量抓地址（进阶但更省力）
打开终端（Windows 用 PowerShell），执行：

```bash
curl -s http://example.com | grep -oP 'src="\K[^"]+\.js'
```

命令逐字解释（零基础请对照着看）：
- `curl -s http://example.com` —— 把首页 HTML 下载下来打印到屏幕，`-s` 表示不显示进度条
- `|` —— 管道，把左边命令的输出**交给**右边命令处理
- `grep -oP` —— 在文本里搜索，`-o` 只输出匹配到的部分，`-P` 用高级正则
- `'src="\K[^"]+\.js'` —— 找 `src="` 开头、跟着一串非引号字符、以 `.js` 结尾的内容；`\K` 表示"丢弃前面已匹配的部分"，所以只打印文件名

**预期结果**：

```txt
/static/js/chunk-vendors.js
/static/js/app.js
/js/config.js
```

**如果不行**：
- 输出为空 → 目标可能用单引号，把 `"` 换成 `'` 再试；或页面是框架渲染的，回第 1 步用浏览器
- 报错 `grep: 无法识别的选项 --P` → 你在 cmd 里而不是 PowerShell；或换 `grep -oE`（简化正则）

#### 第 3 步：把 JS 下载到本地
按第 0 步的表把路径拼成完整 URL，然后下载：

```bash
# 显式写完整 URL 下载
curl -s http://example.com/static/js/app.js -o app.js

# 立刻检查下到的是不是 JS
head -c 200 app.js
```

**预期结果**：`head -c 200` 打印出 `!function(e){var t={}...` 这种没格式的代码，说明下载成功了。这就是**压缩后的 JS**。

**如果不行**：
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 内容是 `<!DOCTYPE html>` | 下到了 404 错误页 | 路径拼错了，回第 0 步重看相对/绝对路径 |
| 文件 0 字节 | 需要特定 Referer/Cookie | 先用浏览器打开一次，`curl -H 'Cookie: xxx'` 带上 |
| 提示 403 | 有防盗链或 WAF | 加 `-H 'User-Agent: Mozilla/5.0'` 伪装浏览器 |
| 首页能开但下不到 JS | 用了 SPA 动态加载 | 回第 1 步用 Network 面板抓真实请求 |

#### 第 4 步：一次下载全部 JS（批量）
```bash
# 1) 提取清单
curl -s http://example.com | grep -oP 'src="\K[^"]+\.js' | sort -u > js-list.txt

# 2) 建目录
mkdir -p js && cd js

# 3) 逐个下载（自动处理"带域名"和"不带域名"两种路径）
while read -r u; do
  case "$u" in
    http*) url="$u" ;;
    *)     url="http://example.com$u" ;;
  esac
  curl -s "$url" -o "$(basename "$u")"
done < ../js-list.txt

ls -la
```

**预期结果**：`js/` 目录里出现一堆 `.js` 文件，体积从几 KB 到几 MB 不等。

#### 第 5 步：保留目录结构（避免同名文件互相覆盖）
`basename` 会丢掉目录信息，`/admin/app.js` 和 `/user/app.js` 会都存成 `app.js` 互相覆盖。稳妥写法：

```bash
while read -r u; do
  case "$u" in
    http*) url="$u"; f="${u#*://*/}" ;;
    *)     url="http://example.com$u"; f="${u#/}" ;;
  esac
  mkdir -p "$(dirname "$f")" 2>/dev/null
  curl -s "$url" -o "$f"
done < js-list.txt
find . -name '*.js' -type f | head -20
```

**预期结果**：`static/js/app.js` 这类目录结构被保留。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 满屏 404 | 路径拼接方式搞错 | 一律优先用浏览器 `Copy URL` 拿完整地址 |
| 下载的 JS 只有几行 | 是入口文件，真正的代码在它 `import` 的子文件里 | 看第 7 课的 webpack chunk |
| 中文乱码 | 编码问题 | `curl --compressed`，或下载后另存为 UTF-8 |
| 下到的文件都一样大 | 被同名覆盖了 | 用第 5 步的保留目录结构写法 |

#### 实战要点
- **先开 F12 再刷新**，养成习惯；Network 面板是你 90% 时间的落脚点
- **`Copy as cURL` 是神器**：Network 里右键任意请求 → Copy → Copy as cURL，得到一条包含所有请求头的命令
- **下载完先 `head -c 200`**，确认是 JS 不是错误页，别拿错误页分析半小时
- 遇到 `app.8f3a2b.js` 这种带 hash 的文件名**要完整保留**——hash 变了说明版本变了

### [js-via-devtools] 第 2 课：浏览器开发者工具——零基础的第一把武器 | easy | 零基础;工具 | devtools;F12;sources;断点;Network
> 不装任何工具，只用 F12 就能完成提取、美化、搜索、断点调试全过程。

#### 这条要解决什么
很多人以为挖 JS 必须装一堆工具。实际上浏览器自带的 DevTools 就是最强的 JS 分析器——它能美化代码、全局搜索、下断点、改返回值、监控网络。**新手完全可以用 F12 做完前三道题**。这条把 F12 里跟 JS 有关的五个面板讲透。

#### 需要准备什么
- Chrome / Edge / Firefox 任意现代浏览器
- 一个能打开的目标（本地靶场、比赛环境，或你自己的测试站）

#### 第 1 步：认识五个会用到的面板
按 `F12`（或右键 → 检查），顶部一排标签，跟 JS 分析有关的只有五个：

| 面板 | 中文 | 什么时候用 |
| --- | --- | --- |
| **Sources** | 源代码 | ⭐ 最重要。看 JS 源码、搜索字符串、下断点 |
| **Network** | 网络 | 看页面加载了哪些 JS、哪些接口被调用 |
| **Console** | 控制台 | 直接执行 JS 代码、看报错、打印变量 |
| **Application** | 应用 | 看 Cookie、localStorage、sessionStorage |
| **Elements** | 元素 | 看渲染后的 HTML，找隐藏表单与注释 |

> [!tip]
> 面板显示不全时，点标签栏最右边的 `»` 展开。

#### 第 2 步：在 Sources 面板里找到目标 JS
点 `Sources`，左侧是三级结构：

```txt
Sources
├── Page            ← 当前页面加载的所有资源（JS 在这里！）
│   └── example.com
│       └── static/js/
│           ├── chunk-vendors.js     ← 第三方库
│           └── app.js               ← 业务代码 ⭐ 重点看这个
├── Filesystem      ← 可以在这里加载你本地的 JS 文件来读
├── Overrides       ← 本地覆盖线上文件（改代码持久生效）
└── Content scripts ← 浏览器插件的脚本（无关，跳过）
```

点开 `Page` → 域名 → 目录 → 找到 JS 点开，右侧显示代码。

**如果不行**：`Page` 是空的 → 刷新页面；或 JS 从 CDN 加载，找 `https://cdn...` 节点。

#### 第 3 步：一键美化压缩代码（必须掌握）
压缩后的 JS 是一整行几十万字符，没法读。点开 JS 后，看编辑器**左下角有一个 `{}` 图标**，点它。

```txt
（美化前）
!function(e){var t={};function n(r){if(t[r])return t[r].exports;...}

（点 {} 后）
!function(e) {
    var t = {};
    function n(r) {
        if (t[r]) return t[r].exports;
        ...
    }
}
```

> [!warn]
> **美化只在浏览器里生效，不会修改服务器上的文件**。而且美化后的行号跟原始行号不一样，做笔记时两个都记一下。

#### 第 4 步：全局搜索关键词（最高频动作）
在 Sources 面板按 `Ctrl+Shift+F`（Mac 是 `Cmd+Option+F`），输入关键词：

```txt
flag
admin
password
token
/api/
secret
```

**预期结果**：左侧列出所有匹配位置，点一条跳到对应文件与行，右侧高亮显示。

**如果不行**：
- 搜不到 → 试大小写变体（`Flag`/`FLAG`）、下划线变体（`apiKey`/`api_key`/`API_KEY`）
- 全是压缩代码碎片 → 先做第 3 步美化再搜
- 完全没结果 → 关键词可能被混淆了，看第 8 课

#### 第 5 步：在 Console 里直接跑代码
点 `Console`，光标处直接输入 JavaScript 回车执行：

```javascript
// 打印页面标题
document.title

// 找出页面上所有链接
[...document.querySelectorAll('a')].map(a => a.href)

// 查看所有 Cookie
document.cookie

// 查看 localStorage 里存了什么（常藏 token）
JSON.stringify(localStorage)

// 直接调用页面里的函数（假设源码里有 checkPassword）
checkPassword("test")
```

**预期结果**：立刻返回值。这是**验证你从源码里读到的逻辑是否正确**的最快方式。

> [!danger]
> Console 里执行的是**目标网站上下文**的代码，会影响页面状态甚至**向服务器发请求**。比赛环境里没问题；真实 SRC 环境里只做**读取类**操作（打印变量），不要执行修改数据的函数。

#### 第 6 步：下断点看变量实际值（核心技能）
断点 = "让代码跑到这一行就暂停，让我看看现在变量是什么"。

**方法一：行断点**
```txt
1. Sources 面板打开目标 JS
2. 点某一行左边的行号区域 → 出现蓝色标记 = 断点已下
3. 触发该代码（比如点页面上的登录按钮）
4. 页面暂停，右侧 Scope（作用域）面板显示当前所有变量的值
5. 顶部控制按钮：
   ▷  继续执行      F8
   ⤵  单步跳过      F10（不进入函数内部）
   ↓  单步进入      F11（进入函数内部）
   ↑  跳出当前函数  Shift+F11
```

**方法二：事件断点（新手最好用）**
右侧栏找 `Event Listener Breakpoints` → 展开 `Mouse` → 勾选 `click`。这样**任何点击**都会让代码暂停，不用知道该在哪行下断点。

**方法三：XHR/fetch 断点（逆向加密参数的必备招）**
勾选 `XHR/fetch` → 任何网络请求发送前都会暂停。在请求发出前拦下来，看参数是怎么算出来的。

```txt
三个断点场景速查：
- 不知道按钮点了执行什么代码  → Event Listener Breakpoints → Mouse → click
- 想知道加密参数怎么生成      → XHR/fetch 断点 + 单步进入
- 想看某个变量的值            → 搜变量名 → 行断点 → 看 Scope 面板
```

#### 第 7 步：用 Network 面板看接口
点 `Network` → 刷新 → 点 `Fetch/XHR` 过滤按钮。这里每条都是前端往后端要数据的请求。

点开任意一条：
- `Headers` → `Request URL` 是接口地址，`Request Method` 是方法
- `Payload` / `Request` 是**发出去的参数**
- `Response` / `Preview` 是**后端返回的数据**

**预期结果**：看到一堆 `/api/user/info`、`/api/login` 这样的接口，参数名清清楚楚。

> [!tip]
> 右键任意请求 → `Copy` → `Copy as cURL`，得到一条包含所有请求头的完整命令。拿它去命令行重放改参数，比手工拼 URL 靠谱一万倍。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `{}` 美化按钮是灰的 | 该文件已经是可读格式 | 不用美化，直接看 |
| 搜不到中文 | 中文常被转义成 `\uXXXX` | 搜转义形式，或用 `decodeURIComponent` 还原 |
| 断点打不上（灰点） | 代码没加载到 | 刷新页面；或关掉 source map 看真实代码 |
| 单步跳进一堆库代码 | 进入了 jQuery/Vue 内部 | `Shift+F11` 跳出，或对库文件右键 `Blackbox script` |
| 刷新后断点全没了 | 页面重载的正常现象 | 用事件断点，或 Snippets 保存脚本 |

#### 实战要点
- **Blackbox script 是效率神器**：对 `chunk-vendors.js`、`jquery.min.js` 右键 `Blackbox`，单步时会直接跳过
- **Sources → Overrides** 可以本地改写线上 JS 并持久生效，适合反复测试"改了这段逻辑会怎样"
- **`Ctrl+Shift+F` 全局搜索**搜的是所有已加载资源，包括内联在 HTML 里的 `<script>`
- 断点看到的**变量实际值永远比读代码猜的准**；读不懂就去下断点

### [js-static-scan] 第 3 课：静态搜索——用命令行批量捞情报 | easy | 核心;关键词 | grep;敏感信息;接口提取;正则
> 把 JS 下载到本地后，用一组固定命令把所有接口、密钥、隐藏路径一次性捞出来。

#### 这条要解决什么
这是整组里**性价比最高的一条**：不需要懂 JS 语法，只要会复制粘贴命令，就能从几十个 JS 文件里捞出接口清单和泄露的密钥。很多 CTF 题目和真实 SRC 的突破口就在这一步。学完这条，你手上会有一份"这个网站所有后端接口 + 所有可能的凭据"的清单。

#### 需要准备什么
- 已经用第 1 课把 JS 下载到本地某个目录（比如 `js/`）
- 终端支持 `grep -P`：Linux / macOS / WSL / Git Bash 都支持；**Windows 的 cmd 和 PowerShell 不支持**，请用 Git Bash 或 WSL
- （可选）装了 ripgrep（`rg`），速度快很多，语法基本兼容

#### 第 1 步：先确认目录里有东西
```bash
cd js
find . -name '*.js' -type f | wc -l
du -sh .
```
**预期结果**：打印文件数量和总大小，比如 `17` 和 `2.3M`。如果是 0，先回去下载。

#### 第 2 步：捞接口路径（最核心的一步）
```bash
# ① 抓以 / 开头的路径字符串（接口通常长这样）
grep -rhoE '"/[a-zA-Z0-9_./?=&-]{3,}"' . | tr -d '"' | sort -u > api-paths.txt

# ② 抓完整 http(s) 地址（可能暴露内网/测试域名）
grep -rhoE 'https?://[a-zA-Z0-9._:/-]+' . | sort -u > urls.txt

# ③ 抓常见接口前缀
grep -rhoE '/(api|admin|internal|debug|manage|user|v[0-9]+)/[a-zA-Z0-9_/-]*' . | sort -u >> api-paths.txt

wc -l api-paths.txt urls.txt
```

命令解释：
- `-r` 递归整个目录，`-h` 不显示文件名（输出更干净），`-o` 只输出匹配部分，`-E` 用扩展正则
- `tr -d '"'` 删掉引号
- `sort -u` 排序去重
- `> 文件` 把结果写入文件而不是打印到屏幕

**预期结果**：`api-paths.txt` 里出现：

```txt
/api/user/info
/api/login
/api/upload
/admin/list
/internal/debug
```

**如果不行**：
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 结果全是 `.js`、`.css` | 正则太宽 | 加 `\| grep -v '\.\(js\|css\|png\|jpg\|svg\|woff\)'` 过滤 |
| 结果为空 | grep 版本不支持 | 换 Git Bash / WSL，或用 `rg '"/[a-z]+' -o` |
| 一行超长吃不下 | 文件没美化 | 先 `npx js-beautify` 美化再搜 |

#### 第 3 步：捞敏感信息（密钥、口令、Token）
```bash
grep -rniE '(api[_-]?key|apikey|secret|token|password|passwd|pwd|access[_-]?key|private[_-]?key|auth)' . \
  | grep -v node_modules | head -50
```

**预期结果**：

```txt
config.js:12:  const API_KEY = "ak_live_9f3a2b8c...";
app.js:340:     headers: { 'X-Auth-Token': 'eyJhbGciOi...' }
```

> [!danger]
> 拿到密钥不等于可以随便用。判断顺序：**① 这个 key 是干什么的（看变量名和上下文）→ ② 有没有可能在 CTF 里直接给 flag → ③ 在授权环境里最小化验证**。真实 SRC 环境里调用他人密钥可能违法，发现后应记录证据并上报，不要自行使用。

#### 第 4 步：按已知格式精确匹配高价值凭据
不同云厂商的密钥有固定前缀，可以精确匹配：

```bash
grep -rnoE 'AKIA[0-9A-Z]{16}' .                    # AWS Access Key
grep -rnoE 'AIza[0-9A-Za-z_-]{35}' .               # Google API Key
grep -rnoE 'gh[pousr]_[A-Za-z0-9]{36,}' .          # GitHub Token
grep -rnoE 'xox[baprs]-[0-9A-Za-z-]{10,}' .        # Slack Token
grep -rnoE 'sk-[A-Za-z0-9]{20,}' .                 # OpenAI 等私有 key
grep -rnoE 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' .   # JWT
```

**预期结果**：命中就是高价值发现。JWT 拿去 `jwt.io` 或本地 base64 解第二段（payload），常能直接读到用户名、角色、过期时间。

#### 第 5 步：捞隐藏路径与隐藏功能
```bash
# 前端路由（Vue Router / React Router 里的路由表）
grep -rnoE "path:\s*['\"][^'\"]+['\"]" . | head -40

# 拼接出来的路径（常藏隐藏接口）
grep -rnoE "['\"]/[a-z0-9_/-]+['\"]\s*\+" . | head -40

# 带 flag 字样的任何东西（CTF 特供）
grep -rniE 'flag|ctf|secret|hidden|backdoor' . | head -40
```

**预期结果**：`path: '/admin/secret'` 这类路由定义会暴露**页面上没有入口但真实存在**的页面。这是 CTF 最常见的拿 flag 方式之一。

#### 第 6 步：整理成一份可读报告
```bash
{
  echo "=== 接口路径 ==="; cat api-paths.txt
  echo; echo "=== 完整 URL ==="; cat urls.txt
  echo; echo "=== 敏感关键词命中 ==="
  grep -rniE '(api[_-]?key|secret|token|password)' . | head -50
} > js-recon-report.txt

wc -l js-recon-report.txt
```

**预期结果**：一份 `js-recon-report.txt`，这就是你后续测试的**入口清单**。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `grep: -P: 不支持` | macOS 或旧版 grep | 改用 `-E`，或 `brew install grep` 后用 `ggrep` |
| 输出爆屏几万行 | 正则太宽 | 先加 `head -50` 看样本，再收紧正则 |
| 结果里全是第三方库 | 没排除 vendor | 加 `--exclude=*vendor* --exclude=*chunk*` |
| 明明有却搜不到 | 字符串被拼接成多段 | 搜片段而不是整串，如搜 `api` 而不是 `/api/user/info` |

#### 实战要点
- **接口路径 + 密钥 + 路由表**这三样捞完，JS 静态分析就算及格
- **越不像接口的路径越要试**：`/api/debug/backup`、`/api/v1/internal/export` 这类往往是出题点
- 很多题目把 flag 直接写在 JS 注释里：`grep -rniE '//.*flag|/\*.*flag' .`
- **把命令存成 `scan.sh`**，下次直接 `bash scan.sh js/`，一次投入长期复用
- 找不到接口时回头检查：**登录后的页面 JS 下载了吗**？管理端和后端常不是同一份

### [js-sourcemap-restore] 第 4 课：Source Map 还原原始源码——最省力的白盒 | easy | 核心;SourceMap | sourcemap;源码还原;webpack;unwebpack
> 只要生产环境忘了删 `.map` 文件，你就能把整个前端工程还原成可读的原始源码。

#### 这条要解决什么
webpack / Vite 打包后会生成一个 `.map` 文件，用来把压缩代码映射回原始源码。它的设计目的是"线上报错时能定位到源码第几行"，所以**里面通常内嵌了完整原始代码**。如果开发忘了在生产环境删掉它，你等于拿到了整个前端工程——变量名有意义、注释还在、目录结构清晰。这是 JS 分析里投入产出比最高的一击。

#### 需要准备什么
- 至少一个 JS 的完整 URL（见第 1 课）
- `node` / `npx` 可用（用于调用还原工具）
- 一个终端

#### 第 1 步：检查 JS 末尾有没有 sourceMappingURL
打包工具会在文件最后一行留一个注释指向 map：

```bash
curl -s http://example.com/static/js/app.js | tail -3
# 或直接搜
curl -s http://example.com/static/js/app.js | grep -i 'sourceMappingURL'
```

**预期结果**：输出里出现下面之一：

```javascript
//# sourceMappingURL=app.js.map
/*# sourceMappingURL=app.8f3a2b.js.map */
```

**如果不行**：没有任何输出 → 这个文件没带 map，换其他 JS 试（体积大的主包通常带），或试第 2 步的猜路径。

> [!tip]
> 有些站点 JS 里没有 `sourceMappingURL`，但 map 文件**仍然存在于服务器上**——只是没人引用它。直接猜路径就能下到。

#### 第 2 步：拼出 map 的真实地址
`sourceMappingURL` 的值是**相对于当前 JS 文件**的路径：

```bash
# 假设 JS 在 http://example.com/static/js/app.8f3a2b.js
# 注释是 //# sourceMappingURL=app.8f3a2b.js.map
# 则 map 在：http://example.com/static/js/app.8f3a2b.js.map

curl -s -o /dev/null -w "%{http_code} %{content_type}\n" \
  http://example.com/static/js/app.8f3a2b.js.map
```

**预期结果**：`200 application/json` —— map 存在，继续。

**如果不行，按顺序试这些路径变体**：

```bash
for p in \
  "static/js/app.8f3a2b.js.map" \
  "static/js/app.js.map" \
  "static/js/main.js.map" \
  "js/app.js.map" \
  "app.js.map" \
  "static/js/chunk-vendors.js.map" ; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://example.com/$p")
  echo "$code  $p"
done
```

> [!warn]
> 返回 200 但内容是 HTML 是常见坑——框架把所有 404 都兜底成 200 页面了。**必须看内容开头是不是 `{`**：
> ```bash
> curl -s http://example.com/x.js.map | head -c 100
> ```

#### 第 3 步：看 map 里有哪些原始文件
map 是 JSON，`sources` 字段就是原始文件路径列表：

```bash
curl -s http://example.com/static/js/app.8f3a2b.js.map -o app.js.map
node -e "
const m = require('./app.js.map');
console.log('原始文件数:', m.sources.length);
console.log('是否内嵌源码:', !!m.sourcesContent);
m.sources.slice(0, 30).forEach(s => console.log('  ' + s));
"
```

**预期结果**：

```txt
原始文件数: 42
是否内嵌源码: true
  webpack:///./src/main.js
  webpack:///./src/App.vue
  webpack:///./src/api/request.js
  webpack:///./src/utils/crypto.js
```

**如果不行**：
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `require` 报 JSON 解析错误 | 文件不是合法 JSON（被 gzip 压过） | `curl --compressed` 重新下载；或 `head -c 100` 看真实内容 |
| `sourcesContent` 是 null | 打包时配置了不内嵌源码 | 只能拿文件名列表，源码按路径回源下载（第 4 步情况 B） |

#### 第 4 步：还原源码（两种情况）
**情况 A：`sourcesContent` 有内容（最好）** —— 源码就内嵌在 map 里，直接导出：

```bash
node -e "
const fs = require('fs'), path = require('path');
const m = require('./app.js.map');
m.sources.forEach((s, i) => {
  const code = m.sourcesContent[i];
  if (!code) return;
  // webpack:///./src/api/request.js  ->  src/api/request.js
  const clean = s.replace(/^webpack:\/\/\/?\.?\/?/, '').replace(/^\.\//, '');
  const out = path.join('src', clean);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, code);
});
console.log('还原完成');
"
find src -type f | head -30
```

**预期结果**：`src/` 目录里出现完整的前端工程源码，目录结构清晰。

**情况 B：`sourcesContent` 为空** —— 只能按文件路径逐个回源下载（成功率低，很多路径服务器上并没有）：

```bash
node -e "console.log(require('./app.js.map').sources.join('\n'))" > sources.txt
mkdir -p src && cd src
while read -r s; do
  f="${s#webpack:///}"; f="${f#./}"
  mkdir -p "$(dirname "$f")"
  curl -s "http://example.com/$f" -o "$f"
done < ../sources.txt
grep -rl 'DOCTYPE html' . | head   # 检查哪些其实是错误页
```

#### 第 5 步：用现成工具一键还原（推荐）
手写脚本方便理解，实际比赛用工具更快：

```bash
# 方案一：unwebpack-sourcemap（最省事，直接产出源码目录）
npx unwebpack-sourcemap -o recovered ./app.js.map

# 方案二：restore-source-tree
npx restore-source-tree -o recovered ./app.js.map

# 方案三：source-map-explorer（可视化各文件体积占比，快速定位主逻辑）
npx source-map-explorer ./app.js
```

**预期结果**：`recovered/` 目录直接就是可读的源码树。

**如果不行**：npx 下载慢/失败 → 赛前提前 `npx xxx --help` 跑一次把包缓存好；或直接从浏览器打开 map 文件复制 `sourcesContent` 手工粘贴。

#### 第 6 步：还原后先看这五个地方（按优先级）
不要从头读到尾，定点看：

```bash
cd recovered/src 2>/dev/null || cd src

# ① 加密 / 签名逻辑（改包测试的钥匙）
grep -rniE 'encrypt|decrypt|sign|aes|rsa|md5|hmac|crypto' . | head -30

# ② 鉴权与路由守卫（找越权与前端鉴权绕过）
grep -rniE 'auth|token|guard|permission|role|isAdmin' . | head -30

# ③ 路由表（找隐藏页面）
grep -rniE "path:\s*['\"]" . | head -40

# ④ 接口封装（一次看清所有 API 和参数）
find . -path '*api*' -o -name 'request*' | head
head -60 api/request.js 2>/dev/null

# ⑤ 硬编码的内网地址与凭据
grep -rniE '10\.[0-9]+\.[0-9]+\.[0-9]+|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.' .
grep -rniE 'password|secret|apikey|api_key' .
```

**预期结果**：五个方向至少有一个能出东西。最高价值通常是 **① 加密签名逻辑** 和 **③ 路由表**。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| map 下载后是乱码 | gzip 未解 | `curl --compressed` |
| `sources` 全是 `webpack://` 路径 | webpack 默认输出格式 | 剥离前缀即可，脚本已处理 |
| 还原出的是编译后 Vue/React 产物 | 项目没配 `devtool: source-map` | 只能读压缩代码逻辑，走第 8 课 |
| 工具报错 | 版本或 map 格式不兼容 | 换别的工具，或用第 4 步手写脚本 |
| map 有几百 MB | 全量内嵌源码 | 用 `node -e` 只导出 `.js`/`.ts`，跳过 node_modules |

#### 实战要点
- **先试 `.map` 再谈反混淆**：花 30 秒探测，可能省掉 3 小时手工解混淆
- `sourcesContent` **就是原始工程**，包括被摇树优化掉、线上根本没执行的代码分支
- 对比"源码里有而线上接口没有"的接口 = **下架接口/历史漏洞高发区**
- 线上 JS 与 map 版本必须对应（文件名 hash 一致），否则映射错位
- 有站点把 map 放在 CDN 或另一域名上：看 `sources` 里的路径有没有带域名前缀

### [js-api-extract] 第 5 课：从 JS 到接口清单——把后端全挖出来 | easy | 核心;接口提取 | API;接口;参数;JSFinder
> 把 JS 里出现的接口路径变成一份带方法、参数、用途的可测试清单，这是 JS 分析的最终交付物。

#### 这条要解决什么
前面是"原材料处理"，这条是"成品交付"。JS 分析的终点不是读完代码，而是产出一份**能直接拿去测试的接口清单**。这条教三件事：怎么从 JS 里挖接口、怎么确定接口的方法和参数、怎么把清单整理成后续测试能用的格式。

#### 需要准备什么
- 已完成第 3 课（本地有 JS 和一个初版 `api-paths.txt`）
- 目标站点可访问，浏览器 F12 可用
- （可选）Burp Suite Community 版或浏览器代理插件

#### 第 1 步：从多个来源收集候选接口
单一来源一定会漏，把四路结果合并：

```bash
mkdir -p out

# 来源 1：静态搜索 JS 里的路径字符串
grep -rhoE '"/[a-zA-Z0-9_./?=&-]{4,}"' js/ | tr -d '"' \
  | grep -vE '\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|ico|map)$' \
  | sort -u > out/candidates.txt

# 来源 2：source map 还原出的源码（如果有）
[ -d src ] && grep -rhoE "['\"]/[a-zA-Z0-9_./?=&-]{4,}['\"]" src/ | tr -d "\"'" \
  | sort -u >> out/candidates.txt

# 来源 3：页面 HTML 的内联脚本
curl -s http://example.com | grep -oE '<script>.*</script>' \
  | grep -oE '"/[a-zA-Z0-9_./?=&-]{4,}"' | tr -d '"' >> out/candidates.txt

# 来源 4：robots / sitemap 给的路径
curl -s http://example.com/robots.txt | grep -iE '^(allow|disallow)' | awk '{print $2}' >> out/candidates.txt

sort -u out/candidates.txt -o out/candidates.txt
wc -l out/candidates.txt
```

**预期结果**：`out/candidates.txt` 里有几十到几百条候选路径。

#### 第 2 步：关键一步——前缀归并还原出接口模板
静态抓到的往往是 `/api/user/1`、`/api/user/2` 这种带具体 ID 的实例。要把它们归并成模板 `/api/user/{id}`，才看得出接口全貌：

```bash
sed -E 's#/[0-9]+#/{id}#g; s#/[a-f0-9]{16,}#/{hash}#g' out/candidates.txt \
  | sort -u > out/templates.txt
head -50 out/templates.txt
```

**预期结果**：

```txt
/api/user/{id}
/api/user/{id}/profile
/api/order/{id}/detail
/api/admin/list
/api/upload
```

> [!tip]
> **`/api/admin/list` 这种带 admin 的路径优先测**——前端普通用户界面里出现的 admin 接口，八成是没做权限校验（前端藏了但后端没收）。

#### 第 3 步：给每个接口补上"方法"和"参数"
静态搜索只能拿到路径，**方法和参数必须看实际请求**。两招：

**招数 A：手动触发 + Network 抓包**
F12 → Network → 勾选 `Fetch/XHR` → 把网站**每个功能都用一遍**（登录、搜索、翻页、提交、上传、导出）。每个操作产生一条请求，点开看 `Request Method` 和 `Payload`。

**招数 B：从源码里读调用代码（更快）**
```bash
grep -rnE "(axios|fetch|\\\$\.(ajax|post|get))\s*\(" src/ 2>/dev/null | head -40
grep -rnoE "(get|post|put|delete)\s*\(\s*['\"]/[^'\"]+" src/ 2>/dev/null | head -40
```

**预期结果**：看到 `axios.post('/api/login', {username, password})` 这样的代码——**方法、路径、参数名一次全拿到**。

#### 第 4 步：用自动化工具批量提取（JSFinder）
```bash
git clone https://github.com/Threezh1/JSFinder.git
cd JSFinder && pip install requests
python3 JSFinder.py -u http://example.com            # 基础扫描
python3 JSFinder.py -u http://example.com -d         # 深度爬取（跟着页面链接递归）
python3 JSFinder.py -f urls.txt -ou out.txt          # 批量目标
```

**如果不行**：`pip install requests` 失败 → 用虚拟环境 `python3 -m venv v && ./v/bin/pip install requests`。工具跑不通就用第 1、3 步的手工方案，**手工和工具产出一致，别卡在工具上**。

#### 第 5 步：整理成可测试的清单（交付物）
用固定格式落表，后续测试直接照着填：

```txt
| 接口 | 方法 | 参数 | 来源 | 状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| /api/login | POST | username, password | app.js:120 | 200 | 登录入口，可测爆破/注入 |
| /api/user/{id} | GET | - | request.js:44 | 200 | ⭐ ID 可替换，测水平越权 |
| /api/admin/list | GET | page, size | app.js:310 | 403 | ⭐ 有权限校验，测绕过 |
| /api/upload | POST | file | upload.js:8 | 200 | 测任意文件上传 |
| /api/internal/debug | GET | - | sourcemap | 404 | 前端有后端可能下架，对比测试 |
```

> [!danger]
> **测试阶段必须先确认授权范围**。CTF 比赛环境随便打；真实 SRC 只有授权资产能测，且**越权测试要用自己的两个账号互测，不要拿真实用户数据**。发现漏洞立即停止扩大影响并上报。

#### 第 6 步：用清单反查——找"前端有后端无"和"前端无后端有"
这是最容易被忽略的高价值步骤：

```bash
while read -r p; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://example.com$p")
  [ "$code" != "404" ] && echo "$code  $p"
done < out/templates.txt
```

```txt
三类结果的含义：
200      —— 可直接访问，看返回内容判断是否泄露数据
401/403  —— 存在但需要权限 ⭐ 越权绕过的主要目标
405      —— 存在但方法不对，换 GET↔POST 再试
400      —— 存在但参数缺失，说明接口有效，补参数试 ⭐
404      —— 前端残留、后端已下架（历史接口，可能有旧版漏洞）
```

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 候选几百条，实际接口没几条 | 正则混入静态资源路径 | 用后缀过滤 + 前缀归并收紧 |
| 路径对但一直 404 | 少了统一前缀（`/api/v1`）或需要特定 Header | 用 Copy as cURL 对比真实请求 |
| 点了功能但 Network 看不到请求 | 走了 WebSocket 或已缓存 | 勾选 `WS` 过滤；或无痕模式禁用缓存 |
| 接口返回加密数据看不懂 | 前端有解密逻辑 | 回第 4 课找 decrypt 函数，或下断点看解密后值 |
| JSFinder 跑出一堆外站域名 | 它把 CDN/统计域名也算进去了 | 按域名过滤，只留目标域及子域 |

#### 实战要点
- **接口清单的"来源"列一定要写**：来自哪个文件哪一行，复盘和写报告时能直接引用
- **参数名比路径更值钱**：知道 `/api/order` 不如知道它收 `orderId`，因为后者能构造越权
- 前后端分离站点，**JS 就是最完整的接口文档**——比 Swagger 还全，因为它是线上真实在跑的
- 把清单交给后续测试：`ID 可替换 → 越权`、`有 file 参数 → 上传`、`有 url 参数 → SSRF`、`有 query 参数 → 注入`
- **登录前后各抓一遍**：登录后才加载的 JS（管理端、个人中心）藏着权限更高的接口

### [js-beautify-deobf] 第 6 课：代码美化与混淆识别——把天书变回代码 | medium | 核心;解混淆 | beautify;混淆;obfuscator;eval
> 认识六种常见混淆形态，并知道每种该用什么工具和方法还原可读性。

#### 这条要解决什么
压缩（minify）和混淆（obfuscate）是两件事：压缩只是删空格改短名，**逻辑还在**；混淆则故意把逻辑藏起来（字符串加密、控制流打乱、`eval` 动态执行）。这条教你**先判断手上是哪种**，再选对方法，避免拿着一份加密字符串数组硬猜三小时。

#### 需要准备什么
- 已下载下来可疑的 JS 文件
- `node` / `npx` 可用
- 一个能打开大文件的编辑器（VS Code 最佳）

#### 第 1 步：先判断是"压缩"还是"混淆"
看文件开头和整体形态：

```bash
head -c 300 target.js; echo; echo "---"; wc -c target.js; wc -l target.js
```

| 观察到的形态 | 类型 | 难度 | 对应打法 |
| --- | --- | --- | --- |
| 一整行、变量名是 `e,t,n,r` | **压缩** | ⭐ | js-beautify 一键搞定 |
| 开头是 `!function(e,t){...}(this,function(){...})` | **UMD 打包** | ⭐ | beautify 后读 |
| 有 `eval(function(p,a,c,k,e,d){...})` | **packer 打包** | ⭐⭐ | 替换 eval 后执行 |
| 有 `_0x4f2a` 变量 + 一个大字符串数组 | **obfuscator 混淆** | ⭐⭐⭐ | 专用工具 + 手工 |
| 全是 `\x68\x65\x6c\x6c\x6f` 十六进制 | **十六进制转义** | ⭐ | node 一行还原 |
| 只看得到 `atob(` 或 Base64 长串 | **Base64 编码** | ⭐ | node 一行还原 |
| 大量 `while(true){switch(...)}` | **控制流平坦化** | ⭐⭐⭐⭐ | 动态调试最快 |

#### 第 2 步：压缩代码 —— js-beautify 一键美化
```bash
# 单文件
npx js-beautify target.js -o target.beauty.js

# 批量整个目录
for f in js/*.js; do npx js-beautify "$f" -o "${f%.js}.beauty.js"; done

# 带缩进和换行配置（-s 两空格缩进，-w 每行最多 120 字符）
npx js-beautify -s 2 -w 120 target.js -o target.beauty.js
```

**如果不行**：npx 慢/无网 → VS Code 打开文件按 `Shift+Alt+F` 格式化；或浏览器 F12 Sources 的 `{}` 按钮。

#### 第 3 步：Base64 / 十六进制 / URL 编码 —— node 一行还原
```bash
node -e "console.log(Buffer.from('aGVsbG8=', 'base64').toString())"    # Base64
node -e "console.log(String.fromCharCode(104,101,108,108,111))"       # 十进制字符码
node -e "console.log('\u0068\u0065\u006c\u006c\u006f')"               # Unicode 转义
node -e "console.log(decodeURIComponent('%68%65%6c%6c%6f'))"          # URL 编码
```

**实战简化版**：把整个 JS 里的 `\xNN` 和 `\uNNNN` 全部还原：

```bash
node -e "
const fs=require('fs');
let s=fs.readFileSync('target.js','utf8');
s=s.replace(/\\\\x([0-9a-fA-F]{2})/g,(m,h)=>String.fromCharCode(parseInt(h,16)));
s=s.replace(/\\\\u([0-9a-fA-F]{4})/g,(m,h)=>String.fromCharCode(parseInt(h,16)));
fs.writeFileSync('target.decoded.js',s);
console.log('还原完成');
"
grep -oE '[a-zA-Z0-9_]{6,}' target.decoded.js | sort -u | head -30
```

**预期结果**：原本看不懂的转义串变成可读字符串，**往往直接出现 flag 或接口路径**。

#### 第 4 步：Packer（`eval(function(p,a,c,k,e,d)`）—— 经典壳
这种是 Dean Edwards Packer 打的包，特征是开头有 `eval(function(p,a,c,k,e,d)`。**它自带解密函数**，最省力的解法是让 JS 引擎自己跑：

```bash
# 把 eval 换成 console.log，让 node 执行并打印明文
node -e "
const fs=require('fs');
let s=fs.readFileSync('packed.js','utf8');
s=s.replace(/eval\(function\(p,a,c,k,e,[dr]\)/, 'console.log(function(p,a,c,k,e,d)');
fs.writeFileSync('unpacked.js',s);
"
node unpacked.js > unpacked.out.js 2>/dev/null
head -c 500 unpacked.out.js
```

```bash
# 或者用现成工具
npx deobfuscator target.js -o clean.js
```

**如果不行**：正则匹配不上 → 用编辑器手工把 `eval(` 改成 `console.log(`，注意**括号要配平**（在 `eval(` 前加 `console.log`，不删原括号）。

> [!warn]
> **绝对不要在本地直接 `node packed.js`**。混淆代码常见反调试和恶意载荷（挖矿、反弹 shell）。一律先在**虚拟机/容器**里跑，且优先用"静态替换 eval"的方式而不是执行原文件。

#### 第 5 步：obfuscator.io 字符串数组型 —— 用专用工具
特征是文件头部有一个巨大字符串数组 + 一堆 `_0x` 开头的函数，代码里到处是 `_0x1a2b(0x3c)` 这种调用。

```bash
npx webcrack target.js -o ./out --unpack --deobfuscate   # 现代打包+混淆通吃，推荐
npx synchrony target.js -o clean.js                      # 专治 obfuscator.io 字符串数组
npx deobfuscator target.js -o clean.js                   # 通用，先试这个
```

**预期结果**：`_0x1a2b(0x3c)` 变成可读字符串或函数调用，逻辑浮出水面。

**如果不行**：工具报错 → 退回**动态方案**：这种混淆**运行时**一定会在内存里解密成明文。用 F12 下断点，在解密函数末尾断下，把 Scope 里的变量值抄出来（详见第 7 课）。

#### 第 6 步：控制流平坦化 —— 动态调试比静态更快
`while(true){switch(state){case 0: ...; state=3; break; ...}}` 这种把线性逻辑打散成状态机的混淆，静态还原非常痛苦，**直接放弃静态、改用动态**：

```javascript
// 在 Console 里对关键函数做包装，打印每次调用的参数与返回值
const _orig = window.checkPassword;
window.checkPassword = function(...args) {
  console.log('[调用] 参数 =', args);
  const r = _orig.apply(this, args);
  console.log('[返回] =', r);
  return r;
};
// 然后照常操作页面，控制台会打印出真实输入输出
```

**预期结果**：不用读懂混淆代码，直接看到**输入 → 输出**，反推出逻辑。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| beautify 后还是一团乱 | 是混淆不是压缩 | 走第 4、5 步的专用工具 |
| `npx` 报包不存在 | 包名记错 | `npm search deobfuscator` 确认，或换 webcrack |
| 工具输出还是 `_0x` 变量 | 该混淆变体工具不支持 | 用动态调试法（第 6 步） |
| 替换 eval 后 node 报语法错 | 括号没配平，或代码里有多个 eval | 用编辑器核对括号，逐个处理 |
| 解密后的字符串是乱码 | 加了 XOR/自定义加密 | 找到解密函数用 node 复现（见第 8 课） |

#### 实战要点
- **先分类再动手**（第 1 步的表），分类错了会浪费大量时间
- **优先级：有 source map > 直接读 > beautify > 专用工具 > 动态调试**
- 混淆再狠也拦不住动态调试：**代码总要算出一个结果**，下断点看结果就行
- **把解密后的代码存一份**（`target.clean.js`），后续搜关键词都在解密版上搜
- 混淆代码里的 `\x` 转义最省力：一条 node 命令全文还原，常常直接出 flag

### [js-crypto-reverse] 第 7 课：JS 逆向加密与签名——看懂前端怎么算参数 | medium | 核心;加密逆向 | 加密;签名;sign;AES;RSA;MD5
> 定位前端的加密/签名函数，理解其输入输出，从而构造出后端认可的合法请求。

#### 这条要解决什么
很多题目（和很多真实系统）会给请求加一道"签名"：参数不是明文发出去的，而是经过 `sign = md5(参数+时间戳+密钥)` 之类的计算。**你直接改包重放会被服务器拒绝**，因为签名对不上。这条教你：怎么找到加密函数、怎么搞清它的输入输出、怎么在本地用 Python/Node 复现同样的算法，从而能随意伪造合法请求。

#### 需要准备什么
- 已能用 F12 和静态搜索定位代码（第 2、3 课）
- Python3 或 Node 环境（用于本地复现算法）

#### 第 1 步：先确认"确实有签名"——观察现象
不要一上来就找算法，先确认它存在：

```txt
现象一：请求参数里有可疑字段
  {"username":"admin","password":"123","timestamp":1712345678,"sign":"a1b2c3..."}
  → sign / _sign / signature / token / nonce 这类字段就是签名

现象二：改一个参数值，服务器报"签名错误 / 非法请求"
  → 确认无疑

现象三：参数整体是一串 Base64 或十六进制乱码
  → 请求体整体加密
```

用 F12 Network 面板点开任意 POST 请求，看 `Payload` 里有没有上述字段。

#### 第 2 步：静态搜索加密相关关键词
```bash
grep -rniE 'md5|sha1|sha256|hmac|aes|des|rsa|crypto|encrypt|decrypt|sign|base64' js/ | head -40
```

**预期结果**：定位到几个可疑文件，如 `utils/crypto.js`、`static/js/app.js:1203`。

#### 第 3 步：从请求参数名反查调用点（最直接）
知道参数名 `sign`，就在 JS 里搜：

```bash
grep -rn 'sign' js/ | grep -iE 'md5|sha|hmac|encrypt' | head -20
grep -rnE 'sign\s*[:=]' js/ | head -20
```

**预期结果**：找到类似

```javascript
var sign = md5(username + password + timestamp + "s3cr3t_k3y");
```

或者更复杂的按 key 排序拼接：

```javascript
function makeSign(params) {
  var keys = Object.keys(params).sort();
  var str = keys.map(k => k + '=' + params[k]).join('&');
  return md5(str + '&key=' + SECRET);
}
```

#### 第 4 步：动态断点确认（静态读不懂就用这招）
在 Network 面板用 **XHR/fetch 断点**，或直接在加密函数名上打行断点，然后触发请求：

```txt
操作流程：
1. F12 → Sources → 搜 md5 或 encrypt → 在函数第一行打断点
2. 回页面点"登录"或触发请求
3. 代码暂停，右侧面板：
   - Scope 里看当前所有变量的值
   - Call Stack 从下往上是调用链，能看出谁调用了加密函数
4. 在 Console 里直接调用：md5("test") 立刻看到输出
5. F10 单步执行，看每一步变量怎么变
```

**预期结果**：你手上有了**一组真实的输入输出对**，比如 `md5("admin1231712345678s3cr3t_k3y") = "a1b2c3..."`。这是后面复现算法的**验证基准**。

#### 第 5 步：在本地复现算法（关键一步）
用 Python 写脚本复现，并用第 4 步的真实值验证：

```python
# verify_sign.py —— 复现并验证
import hashlib

SECRET = "s3cr3t_k3y"          # 从 JS 里抄来的硬编码密钥
username, password, ts = "admin", "123", 1712345678

# 按 JS 里的拼接顺序照抄（顺序错了结果就全错）
s = f"{username}{password}{ts}{SECRET}"
local = hashlib.md5(s.encode()).hexdigest()

browser = "a1b2c3..."          # 第 4 步从断点里抄到的真实值
print("本地计算:", local)
print("浏览器值:", browser)
assert local == browser, "❌ 算法没复现对，检查拼接顺序/编码/大小写"
print("✅ 复现成功，可以随意构造合法请求了")
```

```javascript
// 或者用 Node 复现（如果原代码用了 crypto-js 等库）
const CryptoJS = require('crypto-js');
const SECRET = "s3cr3t_k3y";
const s = "admin" + "123" + 1712345678 + SECRET;
console.log(CryptoJS.MD5(s).toString());
```

> [!tip]
> **必须让 `assert` 通过再往下走**。签名算法里任何一个细节（拼接顺序、是否大写、编码方式、有没有加盐）不同，结果就完全不同。用真实值验证是唯一可靠的办法。

#### 第 6 步：把复现好的算法接到请求里
```python
import requests, hashlib, time

SECRET = "s3cr3t_k3y"
BASE = "http://example.com"

def make_sign(params):
    keys = sorted(params.keys())
    s = "&".join(f"{k}={params[k]}" for k in keys) + "&key=" + SECRET
    return hashlib.md5(s.encode()).hexdigest()

def call(path, params):
    params["timestamp"] = int(time.time())
    params["sign"] = make_sign({k: v for k, v in params.items() if k != "sign"})
    r = requests.post(BASE + path, json=params)
    print(r.status_code, r.text[:300])
    return r

# 现在可以随意改参数了，签名会自动算对
call("/api/user/info", {"userId": 1})
call("/api/user/info", {"userId": 2})   # 改 ID 测越权
```

**预期结果**：请求返回正常数据，说明签名算法完全复现。

#### 第 7 步：常见加密类型速查
| 类型 | JS 里的特征 | 能否解密 | 处理方式 |
| --- | --- | --- | --- |
| MD5/SHA | `md5(`、`sha256(`、`hexdigest` | 不可逆 | 只需**照抄计算** |
| Base64 | `btoa(`、`atob(`、`Buffer.from(x,'base64')` | 可逆 | 直接解码看内容 |
| AES（对称） | `CryptoJS.AES.encrypt`、`mode.CBC`、`padding` | 可逆（需密钥+IV） | 抄出 key 和 IV，本地解密 |
| RSA（非对称） | `JSEncrypt`、`setPublicKey` | 私钥才能解 | 只需用公钥加密，能复现即可 |
| 自定义 XOR | `^` 运算符、循环异或 | 可逆 | 抄出密钥字节，node/python 复现 |
| HMAC | `HmacSHA256(`、`CryptoJS.Hmac` | 不可逆 | 照抄计算 |

#### 第 8 步：抄 AES 密钥与 IV 的正确姿势
AES 在 JS 里长这样：

```javascript
var key = CryptoJS.enc.Utf8.parse("1234567890abcdef");   // 16 字节 = AES-128
var iv  = CryptoJS.enc.Utf8.parse("abcdef1234567890");
var enc = CryptoJS.AES.encrypt(plaintext, key, {
    iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7
});
```

本地复现（Python）：

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
import base64

key = b"1234567890abcdef"
iv  = b"abcdef1234567890"
ct  = base64.b64decode("密文Base64字符串")
pt  = unpad(AES.new(key, AES.MODE_CBC, iv).decrypt(ct), 16)
print(pt.decode())
```

> [!warn]
> 抄 AES 参数时四个东西一个都不能错：**密钥、IV、模式（CBC/ECB/GCM）、填充（Pkcs7/ZeroPadding）**。任何一个错都会解出乱码。ECB 模式不需要 IV；CBC 必须有 IV 且长度为 16 字节。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 本地结果和浏览器不一样 | 拼接顺序错 / 编码错 / 大小写 | 用断点抄下**中间每一步**的值逐步比对 |
| 加密函数里 key 是动态的 | 密钥从接口下发 | 在获取密钥处打断点，先抓到密钥再算 |
| Python 的 Crypto 装不上 | 包名是 `pycryptodome` 不是 `crypto` | `pip install pycryptodome` |
| 解密出来前几个字节乱码 | IV 错了，或用了 ECB | 确认模式；ECB 时不要传 IV |
| 时间戳校验失败 | 服务器和本地时间不同步 | 用服务器返回的时间戳，或校准本地时间 |

#### 实战要点
- **签名类题目 90% 是"照抄算法"，不是"破解算法"**——找到函数、抄参数、本地复现、验证通过，就结束了
- **硬编码密钥是最常见的出题点**：搜 `key`、`secret`、`iv`、`salt` 往往一击必中
- 遇到 RSA 先判断方向：**前端只用公钥加密**（能复现就行），还是要**解密后端返回**（需私钥，去找泄露）
- 复现成功的标志是 **`assert` 通过**，不是"看起来差不多"
- 时间戳/nonce 这类防重放参数：复现时**动态生成**，别把抓包时的旧值写死

### [js-debug-dynamic] 第 8 课：动态调试与 Hook——读不懂就跑起来看 | medium | 核心;动态调试 | 断点;hook;console;反调试
> 当静态分析陷入僵局，用断点、Hook 和 Console 改写在运行时直接观察和篡改程序行为。

#### 这条要解决什么
混淆、加密、控制流平坦化让静态阅读变成苦差事。但**代码无论多难读，运行时总要有明确的输入和输出**。动态调试就是绕过"读懂"这一步，直接观察"做了什么"。这条覆盖三件事：怎么下断点看关键值、怎么用 Hook 拦截函数、怎么对付常见反调试。

#### 需要准备什么
- 浏览器 F12（第 2 课已讲基础操作）
- 目标页面可复现（能反复刷新、反复触发同一操作）

#### 第 1 步：三类断点，按场景选
| 场景 | 断点类型 | 下断点方法 |
| --- | --- | --- |
| 不知道按钮触发什么代码 | **Event Listener** | Sources → Event Listener Breakpoints → Mouse → click |
| 想知道请求参数怎么来的 | **XHR/fetch** | Sources → XHR/fetch Breakpoints → 勾选 |
| 知道函数名/变量名 | **行断点** | 搜到代码行，点行号 |
| 想在 DOM 变化时暂停 | **DOM 变更断点** | Elements → 右键节点 → Break on → subtree modifications |
| 想在异常时暂停 | **异常断点** | Sources → 右上角暂停图标 → Pause on exceptions |

**推荐新手从 Event Listener 起步**：勾选 `click` 后，点页面上任何地方都会暂停，`Call Stack` 面板从下往上看就是完整调用链，一眼看出"点击 → 哪个函数 → 做了什么"。

#### 第 2 步：看懂暂停时右侧三个面板
```txt
Scope（作用域）—— ⭐ 最重要
  Local     当前函数内的变量（你要找的值通常在这）
  Closure   闭包变量（外层函数留下的变量）
  Global    window 上的全局变量

Call Stack（调用栈）—— 从下往上是调用顺序
  越靠下越外层；点任意一帧可跳到对应代码

Watch（监视）—— 添加表达式实时求值
  点 + 输入变量名或表达式，如 obj.user.role
```

#### 第 3 步：Hook 函数——拦截任意调用的输入输出
Hook = 把原函数包一层，先打印参数、再调用原函数、再打印返回值。**这是逆向最实用的技巧**。

在 Console 面板里贴：

```javascript
// 通用 Hook 模板
(function hook(name) {
  const orig = window[name];
  if (typeof orig !== 'function') { console.log('❌ 不是函数:', name); return; }
  window[name] = function(...args) {
    console.log('%c[调用] ' + name, 'color:#0a0', '参数 =', args);
    const result = orig.apply(this, args);
    console.log('%c[返回] ' + name, 'color:#08f', '结果 =', result);
    return result;
  };
  console.log('✅ 已 Hook:', name);
})('checkPassword');
```

实用的 Hook 清单：

```javascript
// ① Hook eval —— 抓所有动态执行的代码（解混淆神器）
(function(){
  const orig = window.eval;
  window.eval = function(code) {
    console.log('%c[eval 执行的代码]', 'color:red;font-weight:bold');
    console.log(code);
    return orig.call(this, code);
  };
})();

// ② Hook atob / btoa —— 抓 Base64 编解码的明文
(function(){
  const a = window.atob, b = window.btoa;
  window.atob = function(s){ const r = a.call(this, s); console.log('[atob]', s, '->', r); return r; };
  window.btoa = function(s){ const r = b.call(this, s); console.log('[btoa]', s, '->', r); return r; };
})();

// ③ Hook JSON.parse —— 看接口返回的原始结构
(function(){
  const orig = JSON.parse;
  JSON.parse = function(...args) {
    const r = orig.apply(this, args);
    console.log('[JSON.parse]', r);
    return r;
  };
})();

// ④ Hook XMLHttpRequest —— 看所有请求与响应
(function(){
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u) { this.__u = u; this.__m = m; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(body) {
    console.log('[请求]', this.__m, this.__u, '参数:', body);
    this.addEventListener('load', () => console.log('[响应]', this.__u, this.responseText.slice(0, 500)));
    return send.apply(this, arguments);
  };
})();

// ⑤ Hook fetch —— 同上，但用于 fetch API
(function(){
  const orig = window.fetch;
  window.fetch = async function(...args) {
    console.log('[fetch]', args[0], args[1]);
    const r = await orig.apply(this, args);
    console.log('[fetch 响应]', r.status, r.clone().text());
    return r;
  };
})();
```

> [!tip]
> **Hook `eval` 是解开大部分混淆的捷径**：混淆代码最终都要 `eval` 一段明文，Hook 之后明文直接打在 Console 里，连解混淆工具都不用。

#### 第 4 步：篡改运行时状态——让程序按你的意愿走
```javascript
// 场景：前端有个 isAdmin 变量挡着，直接改成 true
isAdmin = true;

// 场景：某个函数总是返回 false，让它永远返回 true
window.checkPermission = () => true;

// 场景：修改 DOM 让隐藏元素显示（前端隐藏 ≠ 后端保护）
document.querySelector('#adminPanel').style.display = 'block';
document.querySelector('#hiddenBtn').removeAttribute('disabled');

// 场景：删除输入框的只读限制
document.querySelectorAll('input[readonly]').forEach(i => i.removeAttribute('readonly'));
```

> [!danger]
> **前端验证永远不是安全边界**。改前端只能让你看到界面，**真正的数据仍然由后端决定**。如果改完前端能看到数据，说明后端没做校验（真漏洞）；如果看不到，说明后端做了校验（前端绕过无意义）。**别把"前端改出来了"当成漏洞**，必须验证后端是否也放行。

#### 第 5 步：对付常见反调试
| 反调试手段 | 特征 | 绕过方法 |
| --- | --- | --- |
| `debugger` 死循环 | 一开 F12 就卡死、不断暂停 | Sources → `Deactivate breakpoints`（或 `Ctrl+F8`）禁用所有断点 |
| 检测窗口尺寸 | `outerHeight - innerHeight > 160` 判开发者工具 | DevTools 拖出来成独立窗口，或改写检测函数 |
| `console.log` 检测 | 重写 console 判断是否被调用 | `window.console = {log(){}, warn(){}, error(){}}` |
| 检测 `toString` | 检查函数是否被 Hook 过 | Hook 时用 `Object.defineProperty` 伪装 `toString` |
| 定时检测 | `setInterval` 检测调试状态 | Hook `setInterval` 让它不执行 |
| 代码格式化检测 | 检查函数源码字符串 | 直接下断点跳过检测函数 |

```javascript
// 禁用 console 检测
Object.defineProperty(window, 'console', { value: { log(){}, warn(){}, error(){}, info(){} } });
```

**最实用的一招**：Sources 面板右上角点 `Deactivate breakpoints`（`Ctrl+F8`）禁用所有断点，然后单步时手动用 `F10`/`F11`，遇到 `debugger` 直接跳过。

#### 第 6 步：把动态观察结果落成结论
动态调试必须产出可复用的结论，否则等于白看：

```txt
记录模板：
函数：checkPassword(input)
观察方式：Hook 打印
输入 → 输出：
  "123"     -> false
  "admin"   -> false
  "s3cr3t"  -> true      ⭐ 找到正确值
  "s3cr3t1" -> false
结论：密码硬编码为 "s3cr3t"（源码位置 app.js:1203）
后续：直接用于登录，或查看后端是否二次校验
```

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| Hook 函数没生效 | 函数定义在模块作用域里，不在 window 上 | 改用行断点；或在模块定义处断下，从 Scope 拿到引用再 Hook |
| 刷新页面 Hook 就丢了 | 页面重载清空运行时改动 | 用 Sources → Snippets 保存脚本，刷新后手动跑一遍 |
| 断点停不下来 | 代码已经执行过了 | 刷新页面重来，断点要在执行前下好 |
| Console 里访问不到变量 | 变量在闭包/模块作用域 | 在断点暂停时访问（此时 Scope 里可见） |
| `debugger` 卡到没法操作 | 反调试 | `Ctrl+F8` 禁用断点；或 DevTools 命令面板 `Disable JavaScript` |

#### 实战要点
- **Hook `eval` / `atob` / `JSON.parse` 三个就够了**，能覆盖大部分"看不懂"的场景
- **Scope 面板比读代码靠谱**：变量实际是什么值，看就完了，不用推理
- **Call Stack 是你的导航**：不知道代码从哪来的，顺着栈往下点，一层层就找到入口
- 反调试优先用官方功能 `Ctrl+F8` 和 Sources 的 `Deactivate breakpoints`，比手写绕过代码又快又稳
- **Snippets 保存常用 Hook 脚本**：Sources → Snippets → 新建 → 写好后右键 Run，刷新后一键重跑

### [js-burp-passive] 第 9 课：Burp 被动抓包与接口清单 | medium | 抓包;接口 | Burp;代理;被动收集
> 让 Burp 在正常浏览过程中被动收录所有 JS 与 XHR，形成完整接口地图。

#### 这条要解决什么
手工复制粘贴接口太慢，而且会漏。Burp 挂上代理后，你正常操作网站，它把所有流量默默记下来，最后一次性导出成接口清单。这是**最完整**的接口收集方式——因为它记录的是"真实发生过的请求"，一个不漏。

#### 需要准备什么
- Burp Suite Community 版（免费够用）或 Pro
- 浏览器代理插件（FoxyProxy）或系统代理设置
- 目标环境的访问权限

#### 第 1 步：配置代理
```txt
1. 启动 Burp → Proxy → Options → 确认监听 127.0.0.1:8080
2. 浏览器装 FoxyProxy → 新建代理：类型 HTTP，Host 127.0.0.1，Port 8080
3. 访问 http://burp → 下载 CA 证书 → 导入浏览器信任
   （不装证书只能抓 HTTP，抓不到 HTTPS）
4. 打开目标网站，确认 Burp 的 HTTP history 里开始出现记录
```

**如果不行**：浏览器打不开网页 → 检查代理是否只对特定域名生效（FoxyProxy 的模式设置）；HTTPS 报证书错误 → CA 证书没装好，重新导入。

#### 第 2 步：正常浏览，把功能全点一遍
流量是"点"出来的。按功能模块系统地过：

```txt
清单（每项都要做一遍）：
□ 首页 / 各栏目页
□ 注册流程（含验证码获取）
□ 登录 / 退出
□ 个人中心 / 资料修改 / 头像上传
□ 搜索框（随便搜个词）
□ 列表翻页 / 排序 / 筛选
□ 详情页（点开具体条目）
□ 提交类表单（留言、评论、工单）
□ 导出 / 下载功能
□ 后台入口尝试访问
□ 所有可见的按钮都点一次
```

#### 第 3 步：过滤出接口清单
Burp → `Target` → `Site map`，选中目标域名右键 → `Filter`。或在 `HTTP history` 里直接加过滤器：

```txt
Filter by request type:
  ☑ Show only in-scope items
  ☑ Show only parameterized requests    ← 有参数的才是接口
  Show only: JSON / XML
Hide:
  ☑ Hide js/css/image responses
```

**预期结果**：只剩接口请求，路径、方法、参数一览。

#### 第 4 步：导出并二次加工
```txt
导出：HTTP history → 全选 → 右键 → Save items → 存成 XML
或直接复制 URL：Target → Site map → 右键目标 → Copy URLs in this host
```

```bash
# 从 Burp 导出的 XML 里抠出所有 URL
grep -oP 'url="\K[^"]+' burp-export.xml | sort -u > all-urls.txt

# 只留 XHR / API 类
grep -iE '/(api|ajax|json|rest|graphql|v[0-9]+)/' all-urls.txt | sort -u > api-list.txt

# 归并成模板
sed -E 's#/[0-9]+#/{id}#g; s#\?.*##' api-list.txt | sort -u > api-templates.txt
wc -l api-templates.txt
```

#### 第 5 步：重点关注四类前缀
```bash
grep -iE '/(admin|manage|internal|debug|test|dev|api/v[0-9])/' api-list.txt
```

| 前缀 | 为什么值得看 |
| --- | --- |
| `/admin/`、`/manage/` | 管理接口，普通用户界面调用了说明可能缺权限校验 |
| `/internal/`、`/debug/` | 内部调试接口，常未授权 |
| `/api/v1/` vs `/api/v2/` | **旧版本 API 常常漏洞还在**，两个版本都测 |
| `/test/`、`/dev/` | 测试环境残留 |

#### 第 6 步：对比"静态清单"和"动态清单"
```bash
sort -u out/templates.txt > static.txt     # 静态挖到的（第 5 课产出）
sort -u api-templates.txt > dynamic.txt    # 动态抓到的

echo "=== 只有静态有（后端已下架，历史接口）==="
comm -23 static.txt dynamic.txt | head -30
echo "=== 只有动态有（需登录/动态生成，静态漏了）==="
comm -13 static.txt dynamic.txt | head -30
echo "=== 两边都有（最可靠，优先测）==="
comm -12 static.txt dynamic.txt | head -30
```

**预期结果**：三份差异清单。**"只有静态有"的经常是已下架但未删除的历史接口，是漏洞高发区**。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 抓不到 HTTPS | CA 证书未安装/未信任 | 重装 Burp CA 到系统信任区 |
| 网站打不开但别的网站正常 | 目标有证书固定（pinning） | 部分场景无解，改用浏览器 F12 手抓 |
| 流量里全是重复请求 | 页面有轮询 | 加过滤器或按 URL 去重 |
| Burp 卡顿 | HTTP history 存了几万条 | 定期 `Clear`，或只保留 in-scope |
| 导出 XML 太大处理慢 | 全量导出 | 只导出 in-scope，或分批导出 |

#### 实战要点
- **浏览的完整度决定清单的完整度**：功能没点到的接口，Burp 也抓不到
- **登录前后各刷一遍**：登录后才有的接口（管理端、个人中心）权限更高
- **Burp 的 `Repeater` 顺手用**：右键请求 → Send to Repeater，改参数重放，最快验证越权/注入
- 被动阶段**只浏览不改包**；把改动集中到测试阶段，避免污染记录
- 导出清单后**立刻去重归并**，否则几百条原始 URL 没法用

### [js-antidebug-misc] 第 10 课：常见坑与排错手册 | medium | 进阶;排错 | 反调试;坑;排错;FAQ
> 汇总新手在 JS 分析里最常卡住的十种情况与对应解法。

#### 这条要解决什么
前面每条都假设"顺利跑通"。实际比赛你会遇到各种见鬼的情况：代码一开 F12 就卡死、下载的 JS 是空壳、搜索关键词一个都不中、flag 明明在但读不出来。这条是**排错手册**，卡住了就来这里查。

#### 坑 1：一打开 F12 页面就卡死 / 无限暂停
**原因**：反调试——代码里写了 `debugger` 语句并循环执行。

**解决**（按推荐顺序）：
```txt
① 最快：Sources 面板右上角点 "Deactivate breakpoints"（或 Ctrl+F8）
   —— 禁用所有断点，debugger 语句就失效了
② 彻底：Chrome 设置 → 隐私和安全 → 网站设置 → JavaScript → 把目标站点加入"不允许"
   —— 但这样 JS 也不跑了，只适合纯静态看代码
③ 治本：在 Sources → Overrides 里把反调试代码注释掉，本地覆盖生效
④ 兜底：用无痕窗口不打开 DevTools，先把 JS 全部 curl 下载下来离线分析
```

#### 坑 2：下载的 JS 是 HTML
```bash
curl -s http://example.com/static/js/app.js | head -c 100

# 带上完整请求头（从浏览器 Copy as cURL 拿）
curl -s 'http://example.com/static/js/app.js' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)' \
  -H 'Referer: http://example.com/' \
  -H 'Cookie: session=xxxxx' \
  -o app.js
```

#### 坑 3：搜关键词一个都不中
**排查顺序**：
```bash
# ① 大小写和变体
grep -rniE 'flag|FLAG|Flag|f1a9|ctf|CTF' .

# ② 被转义了（\x66\x6c\x61\x67 就是 flag）
node -e "
const fs=require('fs');
for (const f of fs.readdirSync('.').filter(x=>x.endsWith('.js'))) {
  let s=fs.readFileSync(f,'utf8');
  s=s.replace(/\\\\x([0-9a-fA-F]{2})/g,(m,h)=>String.fromCharCode(parseInt(h,16)));
  s=s.replace(/\\\\u([0-9a-fA-F]{4})/g,(m,h)=>String.fromCharCode(parseInt(h,16)));
  fs.writeFileSync(f+'.decoded',s);
}"
grep -rniE 'flag|ctf' *.decoded

# ③ 被 Base64 编码了
grep -rnoE '[A-Za-z0-9+/]{24,}={0,2}' . | head -20
node -e "console.log(Buffer.from('粘贴字符串','base64').toString())"

# ④ 在 source map 里（JS 看不到但 map 里有）
curl -s http://example.com/static/js/app.js.map | grep -io 'flag[^"]*'

# ⑤ 在接口返回里，不在 JS 里（换个方向，去看 Network）

# ⑥ 需要触发某个分支才写入 DOM
grep -rniE 'innerHTML|textContent|document.write' . | grep -i flag
```

#### 坑 4：代码是加密的，改了参数服务器不认
**解决**：回第 7 课——找签名函数 → 断点抄输入输出 → 本地复现 → `assert` 验证通过 → 批量构造请求。

#### 坑 5：变量名全是 `_0x4f2a`，完全读不懂
```bash
npx webcrack target.js -o ./out --unpack --deobfuscate
npx deobfuscator target.js -o clean.js
# 工具不行就 Hook eval（最有效，见第 8 课）
```

#### 坑 6：JS 只有几行，看起来什么都没做
**原因**：这是**入口文件**，真正的代码在它动态加载的 chunk 里。
```bash
# 从入口文件里抠出 chunk 文件名映射
curl -s http://example.com/static/js/app.js | grep -oE '"[a-z-]+":"[a-f0-9]{8}"' | head -30
# 或在 F12 → Network 里过滤 .js，刷新页面，看实际加载了哪些
```

#### 坑 7：前端逻辑对了，但请求还是失败
```txt
□ Cookie / Token 带了没
□ Content-Type 对不对（application/json vs form-urlencoded）
□ 参数放在 body 还是 query 里
□ 有没有 CSRF token（从页面里抓，会过期）
□ 有没有 Referer 校验
□ 有没有时间戳有效期（用当前时间）
□ 是不是 HTTPS 但用了 HTTP（或被强制跳转）
□ 有没有被 WAF 拦（看返回是不是 403 + 拦截页面）
```
最快的办法：**F12 → Network → 右键失败请求 → Copy as cURL**，逐字复制到终端跑，和你手拼的一定有差异，对比就找到问题了。

#### 坑 8：`console.log` 被重写了，打印不出东西
```javascript
const iframe = document.createElement('iframe');
iframe.style.display = 'none';
document.body.appendChild(iframe);
window.console = iframe.contentWindow.console;
console.log('测试', 123);   // 恢复了
```

#### 坑 9：改完前端页面刷新就丢失
```txt
① 用 Sources → Snippets 保存 Hook 脚本，刷新后 Run 一次
② 用 Sources → Overrides 本地覆盖 JS 文件（持久生效）
③ 断点调试时不要刷新，用单步和 Console 改值
```

#### 坑 10：不知道从哪下手
**固定排查顺序，照着走**：
```txt
1. F12 → Network → 刷新 → 看加载了哪些 JS           （5 秒）
2. 挑最大的那个 JS → Sources 点 {} 美化              （10 秒）
3. Ctrl+Shift+F 搜 flag / ctf / admin / password    （20 秒）
4. 搜不到 → 探 source map                           （30 秒）
5. 还没有 → 把所有 JS 下载到本地，跑静态扫描脚本      （2 分钟）
6. 还没有 → Hook eval / atob / JSON.parse 看动态     （3 分钟）
7. 还没有 → 换方向：看接口返回、看 Cookie、看隐藏路由
```

#### 实战要点
- **遇到卡壳先做这个判断**：我是"没找到代码"还是"找到了读不懂"？前者去收集（Network / 下载 / source map），后者去动态调试（断点 / Hook）
- **别在单个文件上死磕超过 10 分钟**，换个文件、换个方向往往更快
- **所有下载的 JS 都留着**，后面复盘和写报告都需要引用具体文件行号
- **记录每一步的现象**，写报告时这就是完整的方法论证据链

### [js-walkthrough] 第 11 课：完整示范——从零到 flag 走一遍 | easy | 实战;示范 | 全流程;walkthrough;案例
> 用一道典型题目把前 10 课串起来，展示每一步的决策与产出。

#### 这道题长什么样
一个登录页，随便输密码都提示错误，页面上没有注册入口，没有任何明显提示。

#### 第 1 步：看页面加载了什么（第 1、2 课）
```txt
F12 → Network → 刷新 → 过滤 .js
观察到：/static/js/login.js
```
**决策**：只有一个业务 JS，先把它拿下来。

#### 第 2 步：下载并搜索（第 1、3 课）
```bash
curl -s http://target/static/js/login.js -o login.js
grep -rniE 'flag|password|admin|check' login.js
# 输出：login.js:14: var _0x1a2b = "..."
```
**决策**：代码是混淆的，不硬读。**先走最省力的路**——探 source map。

#### 第 3 步：探 source map（第 4 课）
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://target/static/js/login.js.map
# 输出：200   ← 命中！
```
**决策**：map 存在，直接还原源码，不用解混淆。

```bash
curl -s http://target/static/js/login.js.map -o login.js.map
node -e "
const m=require('./login.js.map');
console.log('文件:', m.sources);
console.log(m.sourcesContent && m.sourcesContent[0]);
" | head -60
```

#### 第 4 步：读还原出的源码
源码里直接看到验证逻辑：

```javascript
function check(pwd) {
  if (pwd === 'S3cr3t_P@ss') { location.href = '/flag.php'; }
}
```

**决策**：拿到密码 `S3cr3t_P@ss`，并且知道登录成功会跳到 `/flag.php`。两条路都可以试。

#### 第 5 步：验证
```bash
curl -s http://target/flag.php
# 或者到页面输入密码登录
```

#### 复盘：这道题教了什么
```txt
✅ 固定顺序的价值：Network 看加载 → 美化 → 搜关键词 → 探 map
✅ source map 优先：30 秒探一次，省掉可能 1 小时的解混淆
✅ 不会解混淆也能做题：只要 map 在，混淆就等于不存在
✅ 两步验证：密码直接给 /flag.php，两条路都走一遍更稳
```

> [!tip]
> 核心原则：**每一步都先试最省力的方案**。source map → 直接读源码 → 5 分钟解决；如果一开始就去解混淆，可能要 1 小时。**顺序比技巧重要**。

### [js-cheatsheet] 第 12 课：一页速查表——打题时贴屏幕边上 | easy | 速查;cheatsheet | 速查;命令;清单
> 把整组知识压缩成一张速查表，做题时不用来回翻条目。

#### 一、提取 JS
```bash
# 从页面提取 JS 列表
curl -s http://TARGET | grep -oP 'src="\K[^"]+\.js' | sort -u

# 批量下载（保留目录结构）
while read -r u; do
  case "$u" in http*) url="$u"; f="${u#*://*/}" ;; *) url="http://TARGET$u"; f="${u#/}" ;; esac
  mkdir -p "$(dirname "$f")" 2>/dev/null
  curl -s "$url" -o "$f"
done < js-list.txt
```

#### 二、静态搜索
```bash
grep -rhoE '"/[a-zA-Z0-9_./?=&-]{3,}"' . | tr -d '"' | sort -u > paths.txt
grep -rniE 'api[_-]?key|secret|token|password|access[_-]?key' .
grep -rnoE 'AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}' .
grep -rnoE 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' .     # JWT
grep -rnoE "path:\s*['\"][^'\"]+['\"]" .                                 # 路由表
grep -rniE 'flag|ctf|admin|internal|debug|hidden' .
```

#### 三、Source Map
```bash
curl -s http://TARGET/app.js | grep -i sourceMappingURL          # 探测
curl -s -o /dev/null -w "%{http_code}\n" http://TARGET/app.js.map # 验证
npx unwebpack-sourcemap -o recovered ./app.js.map                 # 一键还原
```

#### 四、解混淆
```bash
npx js-beautify target.js -o target.beauty.js                     # 压缩
npx webcrack target.js -o ./out --unpack --deobfuscate            # 混淆通吃
npx synchrony target.js -o clean.js                               # obfuscator.io
npx deobfuscator target.js -o clean.js                            # 通用
```

#### 五、DevTools 快捷键
```txt
F12              打开开发者工具
Ctrl+Shift+F     全局搜索所有已加载资源        ⭐ 最高频
Ctrl+F8          禁用/启用所有断点（破 debugger 死循环）
F8               继续执行
F10              单步跳过
F11              单步进入
Shift+F11        跳出当前函数
Ctrl+Shift+P     命令面板（可搜 Disable JavaScript）
{} 按钮          美化压缩代码（编辑器左下角）
```

#### 六、Hook 速贴（Console 直接贴）
```javascript
// eval —— 解混淆神器
(function(){const o=window.eval;window.eval=function(c){console.log('[eval]',c);return o.call(this,c)};})();
// atob/btoa —— 抓 Base64 明文
(function(){const a=window.atob,b=window.btoa;window.atob=function(s){const r=a.call(this,s);console.log('[atob]',s,'->',r);return r};window.btoa=function(s){const r=b.call(this,s);console.log('[btoa]',s,'->',r);return r};})();
// JSON.parse —— 看接口返回结构
(function(){const o=JSON.parse;JSON.parse=function(...a){const r=o.apply(this,a);console.log('[JSON.parse]',r);return r};})();
// XHR —— 看所有请求响应
(function(){const o=XMLHttpRequest.prototype.open,s=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this.__u=u;this.__m=m;return o.apply(this,arguments)};XMLHttpRequest.prototype.send=function(b){console.log('[req]',this.__m,this.__u,b);this.addEventListener('load',()=>console.log('[res]',this.__u,this.responseText.slice(0,500)));return s.apply(this,arguments)};})();
```

#### 七、破解谜题的固定顺序
```txt
1. F12 → Network → 刷新 → 看加载了哪些 JS           （5 秒）
2. 挑最大那个 → Sources 点 {} 美化                   （10 秒）
3. Ctrl+Shift+F 搜 flag / ctf / admin / password    （20 秒）
4. 搜不到 → 探 source map                           （30 秒）
5. 还没有 → 下载全部 JS 跑静态扫描                   （2 分钟）
6. 还没有 → Hook eval / atob / JSON.parse 看动态     （3 分钟）
7. 还没有 → 换方向：接口返回 / Cookie / 隐藏路由
```

#### 八、十秒判断表
| 你的情况 | 去哪条 |
| --- | --- |
| 不知道 JS 在哪 | 第 1 课 js-url-basics |
| 不会用 F12 | 第 2 课 js-via-devtools |
| 想批量捞接口密钥 | 第 3 课 js-static-scan |
| 看到 sourceMappingURL | 第 4 课 js-sourcemap-restore |
| 拿到一堆路径不会整理 | 第 5 课 js-api-extract |
| 代码看不懂 | 第 6 课 js-beautify-deobf |
| 有 sign/加密参数 | 第 7 课 js-crypto-reverse |
| 断点调试/hook | 第 8 课 js-debug-dynamic |
| 要完整接口地图 | 第 9 课 js-burp-api |
| 卡住了 | 第 10 课 js-antidebug-misc |
| 想看完整案例 | 第 11 课 js-walkthrough |

#### 九、三条铁律
```txt
① 顺序比技巧重要：永远先试最省力的方案（Network → 搜 → map → 扫描 → 动态）
② 动态比静态快：读不懂就下断点、就 Hook，别硬啃
③ 前端不是边界：改前端看到的不算漏洞，必须验证后端是否放行
```
