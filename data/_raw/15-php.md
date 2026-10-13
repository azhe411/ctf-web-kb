# php|PHP 专项|🐘
## [g-php-basic] PHP 运行与语法——先搞懂环境与函数，后面所有洞都建立在这上面
### [php-env] PHP 运行环境与版本差异 | easy | PHP;环境;版本 | php -S;FPM;CLI
> PHP 四种运行方式与 5.x/7.x/8.x 关键差异，先判断靶机怎么跑 PHP
#### 这个条目的作用
PHP 代码在 CLI、php -S 内置服务器、Apache mod_php、PHP-FPM 下行为不同；版本差异（尤其 7.2/8.0）决定哪些旧姿势失效。看响应头与探测参数判定环境，是后续所有 PHP 题的第一步。
#### 前置条件
- 一个可访问的 PHP 页面 URL
#### 第 1 步：判断 PHP 版本
访问 `?phpinfo=1` 或看响应头 `X-Powered-By: PHP/7.4.3`；无头则看报错页泄露。
预期结果：拿到版本号。版本 <7.2 可用 assert 字符串调用，7.4 起 strpos 等变化，8.0 移除 assert 字符串执行。
如果不行：尝试提交 `<?php phpinfo();?>` 创建探针文件或利用 LFI 读 phpinfo 输出。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 版本信息被隐藏 | 配置了 expose_php=Off | 用报错页/phpinfo 文件/特性差异探测版本 |
#### 实战要点
- 版本决定 assert/each/create_function 等是否可用
- php -S（内置服务器）不解析 .htaccess，且单线程
- FPM 目录可能解析差异（Nginx 配置决定哪些后缀走 PHP）
### [php-syntax] 超全局变量与高频函数速查 | easy | PHP;语法;速查 | 超全局;$_GET
> 审计与写 payload 时最常用的 PHP 语法要素表
#### 这个条目的作用
`$_GET/$_POST/$_REQUEST/$_SERVER/$_COOKIE` 各自由谁赋值、同名 key 优先级、`$_REQUEST` 顺序（GET>POST>C）、`$_FILES`/`$_SESSION` 结构；高频字符串/数组/文件函数速查。
#### 前置条件
- 基本读懂 PHP 代码
#### 第 1 步：记住超全局变量
$_GET 来自查询串、$_POST 来自请求体（键值或 JSON 取决于 php://input 解析）、$_REQUEST 合并顺序（默认 GPC 取 POST 优先，取决于 variables_order）、$_SERVER 里 REMOTE_ADDR/HTTP_HOST/REQUEST_URI/HTTP_USER_AGENT。
预期结果：审计参数入口时能说出"这个变量数据来自哪里"。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| $_REQUEST 拿不到预期值 | 同名参数覆盖顺序 | 看 variables_order；GET 与 POST 同名时后者覆盖 |
#### 实战要点
- 参数名大小写敏感，但函数名不敏感
- $_SERVER['HTTP_*'] 全部可被请求头伪造
- $_FILES 上传字段结构 files['x']['name'/'tmp_name'/'size']
### [php-rce-fns] 命令执行与代码执行函数全集 | medium | PHP;RCE;危险函数 | system;exec;eval
> system/exec/eval 全家桶：写法、回显、区别一次讲清
#### 这个条目的作用
命令执行（system/exec/shell_exec/passthru/popen/proc_open/反引号）与代码执行（eval/assert/create_function/preg_replace /e/call_user_func）两组函数的精确用法、回显差异、能否拿输出，审计时一眼定位。
#### 前置条件
- 能看懂 PHP 函数调用
#### 第 1 步：命令执行五兄弟
system(回显输出)、exec(只拿最后一行)、shell_exec/反引号(完整输出字符串)、passthru(原始二进制)、popen/proc_open(管道异步)。哪个能拿到 output 直接决定你能不能读 flag。
预期结果：遇到 system($_GET['c']) 能立刻判断"命令有回显"。
#### 第 2 步：代码执行
eval(无返回值，语句)、assert(PHP7.2 前可字符串代码执行，后废弃，8.0 移除)、create_function(7.2 废弃但部分环境仍可)、preg_replace /e 修饰符(7.0 起弃用)、call_user_func/call_user_func_array(动态调用)。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| exec 无输出 | exec 只返最后一行 | 换 system/shell_exec 或用 exec($c,$out) 数组参数 |
#### 实战要点
- eval 里写 `echo` 会直接输出
- create_function 的代码字符串可含引号，注意参数转义
### [php-file-ops] 文件操作危险函数与利用点 | medium | PHP;文件;危险函数 | include;file_get_contents
> include/unlink/file_put_contents 等在 CTF 里的利用姿势
#### 这个条目的作用
include/require（LFI 入口）、file_get_contents/file（读文件）、file_put_contents/fwrite（写马）、unlink/rename（删改）、readfile（输出）——每个函数在"参数不可控时怎么绕"、在"可控时怎么打"。
#### 前置条件
- 了解 PHP 基本文件函数
#### 第 1 步：include 系
include/require/include_once：文件不存在给警告继续执行（include）或致命错误（require）；配合 php:// 伪协议与 LFI 利用见 php-wrappers-adv。
#### 第 2 步：写文件函数
file_put_contents($f,$c)：$c 可控可以写马；配合 php://filter/write= 组合可绕过内容过滤（写 base64 解码内容）。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| include 文件内容不执行 | 非 PHP 后缀但内容被当文本 | 需要解析漏洞/伪协议配合 |
#### 实战要点
- rename/unlink 在"上传临时文件"场景常用于触发 phar 或文件竞争
### [php-eval-vs-system] eval / assert / preg_replace /e 区别与 PHP8 变化 | easy | PHP;eval;assert | 代码执行;PHP8
> 三兄弟的归属、弃用时间线与替代方案
#### 这个条目的作用
分清"代码执行"（eval/assert）与"命令执行"（system）的边界；assert 字符串执行在 7.2 废弃、8.0 移除；preg_replace 的 /e 修饰符 7.0 移除；create_function 7.2 废弃——老靶场 payload 在新版必挂，要会换。
#### 前置条件
- 上一条 php-rce-fns 的基础
#### 第 1 步：写 payload 前的版本自查
确认 PHP >= 8.0：assert("code") 不再执行、"create_function" 不存在；preg_replace 无 /e；$GLOBALS 行为有变动。
预期结果：老 exp 失效时知道是版本问题，改 eval 或换 CVE 打法。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| assert 的 payload 不执行 | PHP>=7.2 | 换 eval / call_user_func 或利用其它入口 |
#### 实战要点
- PHP8 里 eval 仍可用，只是更易被 disable_functions 拦
## [g-php-bypass] 绕过与进阶——disable_functions、过滤器、伪协议组合
### [php-disable-functions] disable_functions 绕过 | hard | PHP;disable_functions;RCE | LD_PRELOAD;FFI
> 禁了 system/eval 之后怎么继续执行：四条主流路线
#### 这个条目的作用
拿到 shell 但命令全被 disable_functions 禁用时，用 LD_PRELOAD+mail/error_log、FFI 调用 C 库、iconv 写文件、pcntl_exec、imap 扩展等路线绕过，或直接打 PHP-FPM 未授权（Fastcgi 协议）。
#### 前置条件
- 已有一个能执行 php 代码的 webshell（蚁剑）
#### 第 1 步：确认禁用列表
蚁剑终端或 phpinfo 看 disable_functions 内容；`mail`/`error_log`/`FFI`/`pcntl` 哪个在名单外就能走哪条。
#### 第 2 步：LD_PRELOAD 路线
上传 .so（如 bypass.so 编译版本）+ 上传 PHP 调用 `putenv("LD_PRELOAD=/tmp/bypass.so");mail("a@b.c","","","");` 触发 mail 调起子进程执行 .so 里的构造函数（system("id")）。
预期结果：命令执行成功。
#### 第 3 步：FFI 路线（PHP>=7.4 且开了 FFI）
`$ffi=FFI::cdef("int system(const char*);","libc.so.6");$ffi->system("id");`
#### 第 4 步：PHP-FPM 未授权
直接打 9000 端口的 FPM 未授权（Fastcgi 协议 + PHP_VALUE auto_prepend_file），绕 disable_functions 全家。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| LD_PRELOAD 不生效 | mail 不存在/被禁 | 换 error_log 触发、或 FFI 路线 |
#### 实战要点
- 蚁剑插件市场有现成 bypass 插件，优先用
- 每个靶场禁用集不同，先看名单再选路线
### [php-filter-chains] php://filter 高级读法 | medium | PHP;过滤器;LFI | filter链;convert.base64
> 多过滤器链：组合编码绕过滤、读二进制、读带特殊字符文件
#### 这个条目的作用
单个 convert.base64-encode 不够用时，用过滤器链（convert.iconv 系列、dechunk、string.rot13、zlib 等）组合出能读任意文件的 payload；经典目的：绕过内容里有 `<` `<?` 被过滤的包含点。
#### 前置条件
- 理解 php://filter/resource= 基本用法
#### 第 1 步：基本链
php://filter/convert.base64-encode/resource=flag.php 读源码防解析。
#### 第 2 步：iconv 链（读不到内容时）
构造 convert.iconv.utf-8.utf-16 等长链把任意字节编码成可见字符再 base64（技术细节较深，直接抄公开 filter chain 生成器/工具的输出）。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| base64 内容仍被过滤 | 过滤了 base64 关键字 | 用 iconv 链或 rot13 再组合 |
#### 实战要点
- 网上有 filter chain 生成器，别手写长链
### [php-wrappers-adv] 伪协议实战组合 | medium | PHP;伪协议;包含 | php://input;data://
> 从包含点到 RCE：input/data/expect + filter 的完整衔接
#### 这个条目的作用
有 include($x) 且 $x 可控时，php://input 直接 POST 代码、data:// 文本流带 base64 代码、expect:// 命令执行（需扩展）、phar:// 触发反序列化——按环境选路。
#### 前置条件
- 一个 include/require 参数
#### 第 1 步：php://input
POST body 直接写 `<?php system($_GET['c']);?>`，参数 file=php://input，配合 ?c=id。
#### 第 2 步：data://
file=data://text/plain;base64,PD9waHAgc3lzdGVtKC9jZF9jcik7Pz4= （内容为 <?php system('/bin/sh -c id');?>）
#### 第 3 步：expect://
file=expect://id（需 expect 扩展，少见）
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| php://input 不执行 | allow_url_include=Off | 换 filter 读源码 / 日志包含路线 |
#### 实战要点
- allow_url_include 默认 Off，多数靶场会开
## [g-php-deser] 反序列化——格式、魔术方法、POP 链、phar 与 session
### [php-serialize-format] 序列化格式逐字节解析 | medium | PHP;反序列化;序列化 | serialize;类型标记
> serialize() 输出结构：类型标记与长度怎么数，手写 payload 的前提
#### 这个条目的作用
php 序列化串（a:2:{s:4:"name";s:5:"admin";i:0;s:3:"abc";}）的类型标记表：a 数组、s 字符串、i 整数、b 布尔、N null、O 对象、C 自定义——长度必须精确，多了少了都报错或属性丢失。写对象 payload 时 O:4:"User":1:{s:4:"name";s:5:"admin";}。
#### 前置条件
- 知道每次请求参数如何进入 unserialize
#### 第 1 步：手写对象序列化
O:<类名长度>:<类名>:<属性数>:{<属性>}，属性名带可见性前缀（private 加 \0ClassName\0、protected 加 \0*\0），长度含前缀与 \0。
预期结果：能把手写 payload 与 serialize() 输出对上。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 属性丢失/不触发 | 属性名长度数错 | private/protected 前缀长度重新数 |
#### 实战要点
- PHP7.1 起 __wakeup 绕过（属性数>实际）已修复，别用老 trick
### [php-magic-methods] 魔术方法触发时机表 | easy | PHP;魔术方法;反序列化 | __wakeup;__destruct
> 哪个函数调用触发哪个魔术方法，POP 链的起点
#### 这个条目的作用
__construct/__destruct/__wakeup/__sleep/__toString/__get/__set/__call/__invoke/__isset 的触发场景表：unserialize 触发 __wakeup（存在时）与 __destruct（结束时）；echo 对象触发 __toString；访问不存在属性触发 __get——审计时按入口找可用魔术方法。
#### 前置条件
- 反序列化基本概念
#### 第 1 步：记两张表
入口表（unserialize→wakeup+destruct；文件末尾→destruct）与触发表（拼接→toString；调用不存在方法→call；函数方式调用对象→invoke）。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| __destruct 没触发 | 对象没被销毁/脚本提前 exit | 控制流程让对象出作用域或脚本自然结束 |
#### 实战要点
- __destruct 比 __wakeup 更常用作 POP 链起点
### [php-pop-chain] POP 链构造从零到实战 | hard | PHP;POP链;反序列化 | gadget;RCE
> 有入口无魔术方法直接 RCE 时，串普通类方法直到危险 sink
#### 这个条目的作用
POP（Property-Oriented Programming）：入口代码反序列化后，通过一系列类的魔术方法与普通方法（__call/__get/__toString 中间的 method 调用）把可控属性带到危险函数（eval/system/file_put_contents）。从源码里找 sink → 往前找谁调它 → 找可控属性 → 拼 payload 的完整方法。
#### 前置条件
- 反序列化格式与魔术方法表（前面两条）
#### 第 1 步：找 sink
grep eval/system/preg_replace/unserialize/file_put_contents 等危险调用。
#### 第 2 步：反向找调用链
对每个 sink，找存在可控属性的类中调用它的方法，再找哪个魔术方法会触发那个"中间方法"（常见：__call 转发、__toString 拼接后进 eval、__destruct 里调用方法）。
#### 第 3 步：构造与验证
手写序列化 payload 或 phpggc 直接生成已知 gadget；本地 php 运行验证再打靶。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| payload 本地能用靶场不行 | 版本/类名/命名空间差异 | 对照源码重新数属性与命名空间前缀 |
#### 实战要点
- phpggc 覆盖主流框架（Laravel/ThinkPHP/WordPress 等）现成链
### [php-phar-deser] phar 反序列化 | medium | PHP;phar;反序列化 | phar://;触发点
> 不需要 unserialize() 的任何文件操作都可能触发：phar:// 元数据反序列化
#### 这个条目的作用
phar 文件的 metadata 会在任何文件函数（file_exists/is_file/file_get_contents/include 等）以 phar:// 协议访问时被反序列化——即使代码里没有 unserialize 也能打。配合可写文件（上传）与文件包含/删除点。
#### 前置条件
- 一个能写文件的位置 + 一个能触发文件操作且路径可控的位置
#### 第 1 步：生成 phar
用 php 脚本生成带恶意 metadata 的 phar（设置 Phar::setMetadata 为 POP 载荷），重命名绕过 phar 后缀检查（如 .jpg）上传。
#### 第 2 步：触发
payload: phar://uploads/shell.jpg/test.txt 作为 file_exists/include 等参数。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 不触发 | PHP>=8.0 phar 元数据默认不反序列化（需枚举） | 用 8.0 前版本 / 配合 phar 反序列化绕过 Trick |
#### 实战要点
- file_exists/is_file 是低可疑触发点（不输出内容不报错）
### [php-session-deser] Session 反序列化 | medium | PHP;Session;反序列化 | session.serialize_handler
> 处理引擎不一致导致的 session 文件解析错位利用
#### 这个条目的作用
php.ini session.serialize_handler 有 php / php_serialize / php_binary 三种格式；若"写入用 php 格式、读取用 php_serialize"（或反之），session 文件内容解析错位，可伪造可控键值甚至触发对象反序列化实现 RCE。
#### 前置条件
- 可控 session 值的入口（如用户名写进 session）与可触发反序列化点
#### 第 1 步：确认处理器
phpinfo 查 session.serialize_handler（默认 php）；找代码里 session_start 前的 ini_set 或 .htaccess 是否改了 handler。
#### 第 2 步：构造错位 payload
用不同格式的差异（php 格式 `键|值` 竖线分隔 vs php_serialize 的 a:1:{...}）让解析器把可控字符串读成对象序列化数据。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 构造不出错位 | 处理器没被改 | 确认两处 handler 不一致才有戏 |
#### 实战要点
- session 文件路径 /tmp/sess_<PHPSESSID> 可读时可手动改文件内容
## [g-php-audit] 代码审计——grep 清单、漏洞模式与框架速查
### [php-audit-checklist] PHP 代码审计 grep 清单 | medium | PHP;审计;checklist | grep;危险函数
> 拿到源码 5 分钟内该搜什么：危险函数、参数入口、过滤缺失
#### 这个条目的作用
以参数入口为主线（$_GET/$_POST/$_REQUEST/$_SERVER/$_FILES/解档），grep 危险 sink：命令（system exec shell_exec passthru popen proc_open `）、代码（eval assert call_user_func preg_replace create_function）、文件（include require file_get_contents file_put_contents unlink rename）、SQL（$db->query mysqli_query 拼接）、反序列化（unserialize unserialize 入口）。每条记下"入口→过滤→sink"链条。
#### 前置条件
- 有源码或反编译/备份泄露的源码
#### 第 1 步：入口清单
grep 全部超全局变量出现位置，得到候选输入点。
#### 第 2 步：sink 清单
grep 危险函数，标注是否被过滤（addslashes/htmlspecialchars/黑名单/白名单）。
#### 第 3 步：连链
对每个"入口可达且无过滤"的 sink 写 PoC。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 直连链找不到 | 漏洞在文件包含/二次传递 | 追踪 include 与全局变量污染 |
#### 实战要点
- 先找过滤函数列表，缩小"未过滤"范围
### [php-cms-framework] ThinkPHP/Laravel 常见洞速查 | medium | PHP;框架;CVE | ThinkPHP;Laravel
> 主流 PHP 框架与 CMS 的经典 RCE/文件泄漏位
#### 这个条目的作用
ThinkPHP 5.x RCE（?s=/index/\think\app/invokefunction&function=call_user_func_array&vars[0]=system&vars[1][]=id 及 TP5.0.x 多版本）、Laravel（debug 模式 .env 泄露、CVE-2018-15133 反序列化）、WordPress（插件漏洞 + 主题文件包含）、DedeCMS/帝国 CMS 后台 getshell 等高频考点速查。
#### 前置条件
- 能确认目标框架（指纹：/index.php?s=、/.env、报错模板）
#### 第 1 步：指纹确认
ThinkPHP 报错信息、Laravel 的 /_ignition/health-check 或 .env、WordPress wp-login.php 等。
#### 第 2 步：对照速查表打
按版本打对应 CVE/公开 payload，命中即停。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| payload 无效 | 版本修补 | 细分版本，找该版本对应链 |
#### 实战要点
- 先指纹后打，别乱试 payload