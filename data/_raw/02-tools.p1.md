## [g-scan] 扫描与指纹识别——端口、版本与站点指纹，信息收集第一步

### [nmap-basic] Nmap 参数全集 | easy | nmap;scan;port;service | nmap;端口扫描;服务探测
> Nmap 是最常用的端口扫描与主机发现工具，掌握核心参数即可覆盖信息收集阶段九成需求。

#### 这个条目的作用
Nmap（Network Mapper）是信息收集的第一件武器：它告诉你目标开了哪些端口、跑着什么服务、用的什么操作系统。拿到这份清单，才知道后续该测 Web 还是数据库、该打哪个漏洞。本条目把最常用的参数按用途分组讲透，每一条都给完整命令。

#### 前置条件
- 一台装了 Nmap 的机器（Kali 自带；其他系统用 `sudo apt install nmap` 或 `brew install nmap` 安装）。
- 目标授权：扫描是主动探测，务必确认你有权扫这个目标。
- root 权限：`-sS`、`-O` 等参数需要 root；普通用户只能跑 `-sT`。
- 与目标的网络连通性：可以先 `ping 目标IP` 确认在线。

#### 第 1 步：确认 Nmap 可用
```bash
nmap -V
```
预期结果：输出版本号，例如 `Nmap version 7.94`。如果提示 `command not found`，先安装（见前置条件）。

#### 第 2 步：主机发现（先确认目标活着）
```bash
nmap -sn 192.168.1.0/24
```
- `-sn` 只做 ping 扫描，不扫端口，适合先摸清一个网段里有哪些主机在线。
- 预期结果：列出在线主机的 IP 和 MAC。如果目标禁 ping，主机可能不显示，这时直接进第 3 步用 `-Pn` 扫。

#### 第 3 步：快速端口摸底（第一遍扫描）
```bash
nmap -T4 --top-ports 1000 192.168.1.10
```
- `--top-ports 1000` 只扫最常见的 1000 个端口，几十秒完成；`-T4` 是较快的时间模板。
- 预期结果：列出 open 状态的端口。这一步的目的是「先快后慢」：先知道大概开了什么，再决定要不要全端口扫。

#### 第 4 步：全端口扫描（需要时）
```bash
nmap -p- -T4 192.168.1.10
```
- `-p-` 扫全部 65535 个端口，慢（可能十几分钟），但不会漏掉非常规端口上的服务（很多靶机把后台藏在 8080、8888、31337 这种端口）。
- 只想看开放端口、不想看 closed 刷屏：加 `--open`。
- 如果目标禁 ping，加上 `-Pn`：`nmap -p- -Pn 192.168.1.10`。

#### 第 5 步：服务版本与默认脚本探测（第二遍，重点）
```bash
nmap -sV -sC -p 80,443,8080 192.168.1.10
```
- `-sV` 探测服务版本（如 Apache 2.4.49、nginx 1.18.0）。
- `-sC` 加载默认 NSE 安全脚本，自动做目录枚举、HTTP 头检查等轻量探测。
- 只对第 3、4 步发现的开放端口跑，别全端口 `-sV -sC`，会很慢。
- 预期结果：每个端口一行，给出 `STATE`（open）、`SERVICE`（服务名）、`VERSION`（版本号）。

#### 第 6 步：全面探测（偷懒组合拳）
```bash
nmap -A 192.168.1.10
```
- `-A` 等于 `-sV -sC -O --traceroute` 四合一：版本 + 脚本 + 操作系统指纹 + 路由追踪。
- 适合小范围目标一次拿全；公网大网段慎用（慢且易触发告警）。

#### 第 7 步：保存结果，避免返工
```bash
nmap -sV -sC -p- -T4 -oN scan.txt 192.168.1.10
nmap -sV -sC -p- -T4 -oA scan 192.168.1.10
```
- `-oN scan.txt` 输出普通文本，方便后面粘贴到笔记。
- `-oA scan` 同时输出 normal/greppable/xml 三种格式，配合自动化工具用。
- 多个目标：`-iL list.txt` 从文件读目标列表，一行一个。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 提示 `You requested a scan type which requires root privileges` | 用了 `-sS` 但没有 root | 加 `sudo`，或改用 `-sT` 全连接扫描 |
| 扫出来全是 `filtered` | 防火墙拦截 | 换 `-Pn` 跳过主机发现，或换端口范围确认 |
| 目标明明开着 80 却显示 closed | 禁 ping 导致误判 | 加 `-Pn` 强制扫端口 |
| 扫描特别慢 | `-p-` 全端口或 `-T0/-T1` 慢模板 | 先 `--top-ports 1000` 摸底，确认需要再全扫 |
| 提示 `Failed to resolve given hostname` | 域名拼错或 DNS 不通 | 直接用 IP，或确认域名拼写 |

#### 实战要点
- 标准流程是两遍：`--top-ports 1000` 快速摸底 → 对开放端口 `-sV -sC` 精确探测，不要一上来 `-p- -A` 全上。
- 拿到服务版本号后，第一时间对照版本查已知漏洞（如 Apache 2.4.49 路径穿越、nginx 目录穿越）。
- 靶机里「非常规端口 + 常见服务」是出题人的最爱，`-p-` 值得等。
- 记录所有输出文件，用 `-oN` 存一份纯文本，后面写报告直接引用。
- `-sU`（UDP 扫描）极慢且常被防火墙挡，只有明确怀疑 UDP 服务（如 SNMP 161）时才跑，配合 `--top-ports 50` 限定范围。
- 扫描节奏：`-T3` 是默认均衡档，公网敏感目标用 `-T2` 更不易触发告警。

> [!tip] 先快后慢：先用 `-T4 --top-ports 1000` 快速摸底，再对开放端口做 `-sV -sC` 精确探测，避免一上来 `-p-` 全扫浪费时间。

> [!warn] `-A` 与 `-p-` 组合在公网大范围扫描时很慢且易触发告警，注意目标授权与扫描节奏。

### [port-services] 常见端口与服务对照 | easy | port;service;mapping | 端口对照;服务识别
> 端口对应服务是信息收集起点，命中 Redis、Elasticsearch、MongoDB 等往往直接指向未授权访问入口。

#### 这个条目的作用
扫描拿到端口号只是第一步，把端口翻译成「这是什么服务、有什么常见风险」才是信息收集的价值所在。本表覆盖 CTF 与实战中最常出现的端口：命中 Redis、Elasticsearch、MongoDB 这类服务，往往直接指向未授权访问入口，一步就到洞。

#### 前置条件
- 已用 Nmap 拿到目标开放端口列表（`nmap -sV -p-` 最佳，带版本号更好用）。
- 一张能随时翻的对照表（就是本条目）。

#### 第 1 步：整理扫描结果
```bash
nmap -sV --open -T4 192.168.1.10 -oN ports.txt
cat ports.txt
```
预期结果：看到类似 `6379/tcp open redis Redis key-value store` 的行。把每个 open 端口的「端口号 + 服务 + 版本」抄进笔记，作为对照表的输入。

#### 第 2 步：对照常见端口表
| 端口 | 服务 | 常见风险点 |
|---|---|---|
| 21 | FTP | 匿名登录、弱口令、vsftpd 后门 |
| 22 | SSH | 弱口令、用户枚举、SSH 隧道 |
| 23 | Telnet | 明文传输、弱口令 |
| 25 | SMTP | 邮件用户枚举、开放中继 |
| 53 | DNS | 区域传送（AXFR）泄露 |
| 80 | HTTP | 常规 Web 攻击面 |
| 135 | MSRPC | MS17-010 等 RPC 漏洞 |
| 139/445 | NetBIOS/SMB | MS17-010、SMBGhost、共享枚举 |
| 443 | HTTPS | 加密 Web 攻击面 |
| 873 | rsync | 未授权访问、任意文件读取 |
| 1433 | MSSQL | sa 弱口令、xp_cmdshell |
| 1521 | Oracle | 弱口令、TNS 漏洞 |
| 2181 | ZooKeeper | 未授权访问 |
| 3306 | MySQL | root 弱口令、udf 提权 |
| 3389 | RDP | 弱口令、BlueKeep |
| 5432 | PostgreSQL | 弱口令、命令执行 |
| 5601 | Kibana | 未授权访问 |
| 6379 | Redis | 未授权、写公钥/计划任务 getshell |
| 7001 | WebLogic | 反序列化、SSRF |
| 8080 | HTTP 代理/Web | 代理滥用、Web 攻击面 |
| 8443 | HTTPS 备用 | Web 攻击面 |
| 8888 | 宝塔面板 | 弱口令、未授权 |
| 9000 | PHP-FPM/Portainer | FastCGI 未授权执行 |
| 9090 | 管理面板 | 弱口令 |
| 9200 | Elasticsearch | 未授权访问、数据泄露 |
| 11211 | Memcached | 未授权、DRDoS 反射 |
| 27017 | MongoDB | 未授权访问、数据泄露 |

对照方法：把第 1 步抄下来的端口号在表里找。表里没列到的端口，跳到第 3 步。

#### 第 3 步：识别表外端口
表里没有的端口不要慌，先问服务探测要版本：
```bash
nmap -sV -p 31337 192.168.1.10
```
预期结果：输出 `31337/tcp open http` 之类。拿到服务名和版本后，去搜索引擎查「服务名 版本 漏洞」（如 `nginx 1.18.0 CVE`）。很多靶机会用非常规端口跑 Web 服务，`-sV` 能直接识别出 http。

#### 第 4 步：验证未授权访问类服务（重点）
表里标了「未授权访问」的服务，直接动手验证（以 Redis 为例）：
```bash
redis-cli -h 192.168.1.10 -p 6379 info
# 或先探测 banner：
nc -nv 192.168.1.10 6379
```
- 预期结果：`redis-cli` 能连上并返回 server 信息，说明未授权，可直接 `keys *` 看数据、甚至写公钥 getshell。
- 同理可试：Elasticsearch `curl http://IP:9200`、MongoDB `mongosh IP:27017`、ZooKeeper `echo ruok | nc IP 2181`。
- 如果被拒（`DENIED`、`-NOAUTH`），说明有认证，走弱口令路线，别硬来。

#### 第 5 步：按服务类型决定下一步
- Web 类（80/443/8080/8443 等）：交给指纹识别与目录枚举（见 fingerprint、dir-search 条目）。
- 数据库类（3306/1433/5432/27017 等）：先试未授权，再试弱口令（root/root、admin/admin 等），最后才是爆破解密。
- 中间件类（7001/8888/9090 等）：查对应版本已知漏洞（WebLogic 反序列化、宝塔面板等）。
- 文件共享类（21/139/445/873）：试匿名登录 `ftp`、`smbclient -L //IP/`、`rsync IP::`。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 端口服务名显示为 `unknown` | 服务不在 Nmap 指纹库 | 用 `nc -nv IP 端口` 手动连，看 banner 文字 |
| 服务看起来像数据库但连不上 | 端口做了转发或套了隧道 | 再扫一次完整端口确认，或用 `-sV --version-intensity 9` 加深探测 |
| 未授权访问验证失败 | 新版本默认开启认证 | 确认版本，新版 Redis 6+ 默认配置也常要密码，改试弱口令 |
| 对着端口表找漏洞找不到 | 版本信息缺失 | 先 `-sV` 拿准版本号再查 CVE，别拿端口号硬搜 |

#### 实战要点
- 「端口 + 服务 + 版本」三要素缺一不可，版本是查 CVE 的钥匙。
- 未授权访问类服务（Redis/MongoDB/Elasticsearch）一旦验证成功就是独立高危漏洞，优先上报也优先利用。
- 非常规端口上跑着常见服务（如 31337 上的 http、6379 上的 Redis）在靶机里非常常见，别被端口号骗了。
- 看到 7001（WebLogic）、8888（宝塔）、2181（ZooKeeper）这类特征端口，直接查对应专项利用链。
- 验证未授权访问时用只读命令（`info`、`GET`、`ls`）先看，别上来就 `flushall`、`del` 破坏数据——靶机环境也讲基本法。

> [!tip] 不认识的端口先用 `nmap -sV` 拿版本，再查对应版本历史漏洞；未授权类漏洞优先手动验证。

### [fingerprint] Web 指纹识别三件套 | easy | fingerprint;wappalyzer;whatweb;nikto | 指纹识别;whatweb;nikto
> 指纹识别确定站点框架与中间件版本，是选 exploit 的前提，版本对应关系要人工核对。

#### 这个条目的作用
指纹识别回答三个问题：这站用的什么框架、什么中间件、什么版本。答案是选 exploit 的前提——同样的注入点，ThinkPHP 和 Spring 的利用方式完全不同。本条目覆盖浏览器扩展（Wappalyzer）与命令行（WhatWeb、Nikto）三种主流方式，外加 httpx 批量场景。

#### 前置条件
- 目标 URL（如 `http://192.168.1.10`）。
- Wappalyzer：浏览器扩展商店搜索安装（Chrome/Firefox 都有）。
- WhatWeb、Nikto：Kali 自带；其他系统 `sudo apt install whatweb nikto`。
- 授权：Nikto 是主动漏洞扫描，动静大，注意节奏。

#### 第 1 步：Wappalyzer 秒看技术栈（零成本）
1. 浏览器安装 Wappalyzer 扩展，固定到工具栏。
2. 打开目标站点，点击 Wappalyzer 图标。
3. 预期结果：弹出列表显示框架（如 ThinkPHP、Laravel）、服务器（nginx）、JS 库（jQuery 3.6.0）、CDN 等。
4. 把技术栈抄进笔记。注意：Wappalyzer 是纯前端嗅探，只能看到加载的静态特征，改版后的单页应用可能识别不全，需要命令行工具交叉验证。

#### 第 2 步：WhatWeb 命令行指纹（Kali 自带）
```bash
whatweb http://target.com
```
预期结果：一行输出，包含 `Server: nginx/1.18.0`、`X-Powered-By: PHP/7.4.33`、`JQuery` 等技术指纹。比 Wappalyzer 更可靠，因为它会读 HTTP 响应头。

#### 第 3 步：WhatWeb 激进模式与子目录
```bash
whatweb -a 3 http://target.com
whatweb http://target.com/admin/
```
- `-a 3` 激进模式：更积极地请求更多路径、插件探测，命中率更高，也更吵。
- 对怀疑有后台的目录单独扫，能识别目录级技术栈（如 `/admin/` 下是另一套系统）。
- 多目标：`whatweb http://a.com http://b.com` 或 `whatweb -i urls.txt`。

#### 第 4 步：Nikto 漏洞初筛（主动扫描）
```bash
nikto -h http://target.com
nikto -h http://target.com -p 8080
```
- `-h` 指定目标；`-p` 指定端口。
- 预期结果：滚动输出发现项，如 `Server leaks inode via ETag`、`Cookie without HttpOnly flag`、`OSVDB-...` 编号条目。
- 保存报告：`nikto -h http://target.com -o out.html`（或 `-o out.txt`）。
- 注意：Nikto 误报率很高，它的输出是「待验证线索」不是结论。

#### 第 5 步：httpx 批量探活加指纹（资产多时）
```bash
cat urls.txt
# 每行一个域名/IP，然后：
httpx -l urls.txt -title -status-code -tech-detect -web-server
```
- `-title` 抓页面标题、`-status-code` 显示状态码、`-tech-detect` 识别技术栈、`-web-server` 显示服务器软件。
- 预期结果：每行一个目标，输出状态码、标题、技术栈，一眼看出哪个是重点资产。
- 没有 httpx 时：Kali 直接 `sudo apt install httpx`，或按 ProjectDiscovery 官方文档用 go 安装。

#### 第 6 步：人工核对版本
拿到版本号（如 `ThinkPHP 5.0.23`）后：去官方文档或漏洞库查该版本是否存在已知漏洞，确认利用条件（是否需要特定配置、是否需要登录），再决定用哪条 exploit。别拿过期 exp 硬套。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| Wappalyzer 什么都不显示 | 单页应用或纯静态页 | 换 whatweb 看响应头，或看 JS 源码找框架特征 |
| whatweb 只输出 `Server` 没有框架 | 站点隐藏了指纹头 | 加 `-a 3` 激进探测，或查页面源码特征 |
| Nikto 扫出一堆 OSVDB 条目 | 误报或低危噪音 | 按条目标题人工复核，重点关注「vulnerable」「exposed」字样 |
| 指纹显示版本和实际不符 | 响应头被反代隐藏或伪造 | 用 `curl -I` 直连真实后端（跳过 CDN/反代）再看 |
| 拿到版本却找不到对应 exp | 版本太新或记错 | 回官方公告与 NVD 查 CVE，确认版本范围再搜 exp |

#### 实战要点
- 三件套分工：Wappalyzer 秒开秒看，whatweb 命令行精确，Nikto 找已知问题，httpx 管批量。
- 指纹是「选武器」的输入：先知道 ThinkPHP/Spring/Node 哪家，再决定注入、反序列化还是命令执行路线。
- 版本号必须人工核对利用条件，很多公开 exp 有版本范围和配置前提，直接跑大概率失败还留日志。
- 隐藏的框架特征常常在 JS 文件、错误页、`X-Powered-By` 头里，`curl -I` 和查看页面源码是核验指纹的兜底手段。
- 敏感目标用 whatweb/nikto 注意限速（nikto 有 `-Tuning` 和延迟参数），大批量探活用 httpx 单线程排队更低调。

> [!warn] Nikto 误报率高，结果需人工复核；指纹版本号要回官方文档确认漏洞利用条件，别拿过期 exp 硬套。

## [g-dir] 目录与资源枚举——找后台、找备份、找接口

### [dir-search] 目录扫描三件套模板 | easy | dirsearch;ffuf;gobuster;dir | 目录扫描;ffuf;gobuster
> 目录枚举寻找隐藏后台、备份文件与接口，三款工具命令结构相似，选一款熟练即可，重点是字典。

#### 这个条目的作用
端口和服务只是「门面」，后台、备份文件、接口文档这些真正有价值的东西通常藏在没有链接的目录里。目录扫描就是逐个猜路径：把字典里的每一个名字拼到 URL 后面发请求，看哪个返回 200/301/403。三款工具原理相同、命令结构相似，选一款熟练即可，重点是字典选得对不对。

#### 前置条件
- 目标 URL（`http://target.com`）。
- 一款目录扫描工具：Kali 自带 dirsearch/gobuster；ffuf 可用 `sudo apt install ffuf` 安装。
- 字典文件：`/usr/share/wordlists/dirb/common.txt` 等（详见 wordlist-keys 条目）。
- 授权与节奏意识：目录扫描会产生大量请求，敏感目标限速。

#### 第 1 步：dirsearch 基础扫描（功能全面，首选）
```bash
dirsearch -u http://target.com -e php,html,txt -x 403,404 -t 50 --random-agent -o result.txt
```
- `-u` 目标；`-e` 追加常见扩展名（php,html,txt 等）；`-x` 过滤 403/404 噪音；`-t 50` 线程；`--random-agent` 随机 UA；`-o` 保存结果。
- 预期结果：滚动输出 `[200] /admin/`、`[301] /backup/` 之类命中行，最后汇总到 result.txt。
- 如果目标有登录页会跳转，加 `--cookie "session=xxx"` 带上已登录会话再扫。

#### 第 2 步：ffuf 高速扫描（大字典场景）
```bash
ffuf -u http://target.com/FUZZ -w /usr/share/wordlists/dirb/common.txt -mc 200,301,302,401,403 -t 100
```
- `FUZZ` 是占位符，字典里的每个词会替换进去；`-mc` 只显示指定状态码；`-t 100` 并发。
- 预期结果：每个命中一行，格式 `[Status: 200, Size: 1234]  admin`。
- ffuf 是三款里最快的，适合几万行的大字典；但它默认不带扩展名，扫备份文件要自己拼，例如用 `-w dict:EXT` 组合。

#### 第 3 步：gobuster 轻量稳定（简单场景）
```bash
gobuster dir -u http://target.com -w /usr/share/wordlists/dirb/common.txt -x php,bak,txt,zip -t 50
```
- `-x` 指定扩展名后缀列表（自动拼 .php/.bak/.txt/.zip 再扫一遍）；`-k` 忽略自签名证书错误（HTTPS 报证书错时加）。
- 预期结果：命中行格式 `Found: /config.php (Status: 200)`。
- 对比：dirsearch 开箱即用带过滤，ffuf 最快最灵活，gobuster 最轻（单文件、无依赖）。

#### 第 4 步：递归扫描（找到目录后继续往下挖）
```bash
dirsearch -u http://target.com/admin/ -r -e php
```
- `-r` 递归：对发现的目录再跑一遍扫描，一层层往下。
- 也可以手动指定子目录扫：`dirsearch -u http://target.com/backup/`。
- 预期结果：`/admin/` 下又发现 `/admin/upload.php`、`/admin/config.php` 等，攻击面扩大。

#### 第 5 步：结果分析
打开 result.txt，按价值排序：优先看
- 200 且路径可疑的（upload、backup、config、api）；
- 带版本信息的目录（/v1/、/v2/）；
- 源码类（/.git/、/.env、/swagger/）。
先手动用浏览器或 curl 访问确认，再决定下一步利用。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 全 403/404，几乎无命中 | 目标有 WAF 或做了目录白名单 | 换 `--random-agent`、限速，或用 ffuf 换字典再试 |
| 扫出大量 200 但访问都是同一个页面 | 前端路由把一切请求都返回 index.html | 看响应长度（Size）过滤，或用状态码 + 长度双重判断 |
| HTTPS 证书报错中断 | 自签名证书 | gobuster 加 `-k`；dirsearch 加 `-k`（`--insecure`） |
| 有登录页导致误判 | 未认证请求全被重定向到 login | 加 Cookie/Authorization 头再扫 |
| 扫描被目标封 IP | 线程太高或 UA 特征明显 | `-t 10` 限速 + `--random-agent`，必要时换代理 |

#### 实战要点
- 字典 > 工具：三款工具结果差异不大，命中率主要看字典（见 wordlist-keys 条目）。
- 先小字典快扫（common.txt 几分钟出结果），命中目录后再用大字典或自定义组合递归。
- 观察响应 Size：很多站所有不存在的路径都返回同一页面，Size 相同的都是噪音，ffuf 用 `-fs 1234` 直接过滤。
- 备份/源码类路径命中一个就值回票价（/www.zip、/.git/），优先级最高。
- 目录扫描会留大量访问日志，敏感目标注意 `--random-agent`、限速与授权。

> [!tip] ffuf 支持多占位符组合：`ffuf -u http://host/FUZZ?key=KEY -w dict1:FUZZ -w dict2:KEY`。

> [!warn] 目录扫描会留下大量访问日志，敏感目标注意 `--random-agent`、限速与授权。

### [wordlist-keys] 字典要点与词表分类 | easy | wordlist;dictionary;backup;api | 字典;词表
> 字典质量决定枚举效果，通用大字典命中率低，按功能分类的组合词表才有效。

#### 这个条目的作用
目录扫描的本质是「用字典猜路径」，字典质量直接决定枚举效果。通用大字典（几十万词）命中率低又慢；按功能分类的小组合词表（后台词、备份词、接口词）往往几百个词就出结果。本条目讲清楚字典的分类逻辑与组合策略。

#### 前置条件
- 已装目录扫描工具（见 dir-search 条目）。
- 知道系统字典路径：Kali 下 `/usr/share/wordlists/`（含 dirb、dirbuster 子目录），SecLists 通常在 `/usr/share/seclists/`（未装可用 `sudo apt install seclists`）。

#### 第 1 步：认识系统自带字典
```bash
ls /usr/share/wordlists/dirb/            # common.txt、big.txt 等
ls /usr/share/wordlists/dirbuster/       # directory-list-2.3-medium.txt 等
wc -l /usr/share/wordlists/dirb/common.txt
```
- 预期结果：common.txt 约 4600 行（小字典，秒扫）、directory-list-2.3-medium.txt 约 22 万行（大字典，要等）。
- 使用原则：先小后大。common.txt 快扫定位，medium 字典针对重点目录补扫。

#### 第 2 步：按功能分类的词表（自己拼也很快）
| 分类 | 关键词示例 |
|---|---|
| 后台管理 | admin, manage, manager, system, console, backend, dashboard, control |
| 上传下载 | upload, uploads, file, files, download, attachments, static, media |
| 备份 | backup, bak, old, temp, test, www.zip, site.zip, data.zip |
| 接口类 | api, v1, v2, swagger, graphql, openapi, docs, endpoints, json |
| 源码泄露 | .git, .svn, .hg, .env, .DS_Store, config, phpinfo |
| 常见脚本 | index, login, register, user, users, install, setup |
| 运维 | status, health, metrics, monitor, debug, phpmyadmin, jenkins |

用法：把这列词每行一个存成 `my_dict.txt`，直接喂给扫描工具。也可以把同类词和扩展名组合（如备份类 + .zip/.bak/.sql）。

#### 第 3 步：组合策略——按目标类型选词
- 找后台：admin 打头 + 常见后台词表 → `dirsearch -u http://target.com -w admin_dict.txt`。
- 找备份：直接在站点根目录扫常见备份文件名（www.zip、backup.zip、db.sql 等，见 backup-files 条目）。
- 找接口：api + v1/v2 + swagger 文档名组合 → 命中 `/api/v1/`、`/swagger-ui.html` 直接扩大攻击面。

#### 第 4 步：给字典加料（站点定制）
把目标域名、站点目录名、公司/产品名加进字典：
```bash
# 目标域名 target.com，站点目录 /var/www/html/target
echo -e "target\nwww.target.com\ntarget.zip\ntarget.com.zip\nsite\nhtml\nwebroot" >> my_dict.txt
```
- 理由：备份文件常以站点名/域名命名（target.zip、www.target.com.zip），这是通用字典永远猜不到的。
- 预期结果：`/target.zip` 或 `/target.bak` 之类命中，往往直接是整站源码备份。

#### 第 5 步：递归与组合使用
找到目录后不要停：`dirsearch -u http://target.com/admin/ -r -e php` 递归往下扫；同时把新发现的目录名（如 `uploads`）加进字典继续扫它的子路径。接口版本目录（/api/v1/）也要单独扫一遍。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 大字典扫很久没结果 | 字典太大、线程低 | 先用 common.txt 快扫，再针对目录用小组合词表 |
| 词表里没有带扩展名的条目 | 扫描工具默认不拼扩展名 | 用工具 `-e` 参数（dirsearch）或 `-x` 参数（gobuster）自动追加 |
| 备份文件扫不到 | 字典没有站点名 | 把域名、目录名加进字典（第 4 步） |
| 接口路径全 404 | 接口有统一前缀或网关 | 先看 JS/网络请求找真实前缀，再定向扫 |

#### 实战要点
- 字典质量 > 工具选择：三款工具（dirsearch/ffuf/gobuster）用同一字典结果几乎一样。
- 「后台 + 备份 + 接口」是三个最高价值方向，每个方向准备一组 20-50 词的小表就够了。
- 站点定制的词（域名、产品名、目录名）是命中备份文件的关键，通用字典在这方面完全无力。
- 接口词命中 `/api/v1/`、`/swagger` 后，接着用 json/endpoints 词扫子路径，往往能直接翻到未授权接口。
- 扫描是「先快后细」：common 小字典全局扫 → 命中目录用大字典/递归补扫 → 高价值目录用手工组合词表精扫。

> [!tip] 先用小字典（dirb common、SecLists common.txt）快扫，再针对发现的目录做递归与自定义组合扫描。

### [backup-files] 常见备份与敏感文件清单 | easy | backup;leak;source | 备份文件;源码泄露
> 备份与敏感文件是信息收集捷径，命中一个就可能直接拿到源码或配置。

#### 这个条目的作用
备份与敏感文件是信息收集的捷径：一个 `www.zip` 可能就是整站源码，一个 `.env` 可能就是数据库口令，一个 `.git/` 泄露就能还原全部代码。这类文件不需要任何漏洞，只要存在就是独立的信息泄露漏洞，也是后续 getshell 的跳板。

#### 前置条件
- 目标 URL（`http://target.com`）。
- 目录扫描工具或 curl（手工验证用）。
- 明确授权：发现 `.git`、`.env` 属于严重信息泄露，可独立上报。

#### 第 1 步：手工直连最常见的备份文件名
先手工试最经典的几个（浏览器地址栏或 curl 都行）：
```bash
curl -I http://target.com/www.zip
curl -I http://target.com/backup.zip
curl -I http://target.com/.env
curl -I http://target.com/.git/config
```
- 预期结果：`HTTP/1.1 200 OK` 且有 `Content-Length` 就是存在；`404` 则没有。`.git/config` 返回 200 说明存在 git 泄露，直接下载看内容。

#### 第 2 步：用扫描工具批量扫完整清单
把下面清单存成 `backup.txt` 喂给目录扫描工具：
```txt
# 压缩包备份
www.zip  web.zip  site.zip  backup.zip  bak.zip  data.zip  code.zip  html.zip
1.zip  2.zip  test.zip  temp.zip  old.zip  wwwroot.zip  www.rar  site.rar

# 数据库备份
db.sql  database.sql  data.sql  dump.sql  backup.sql  mysql.sql  sql.zip

# 源码与配置泄露
index.php.bak  index.php~  index.php.swp  config.php.bak  .env
web.config  .git/config  .svn/entries  .DS_Store  phpinfo.php  test.php
id_rsa  id_dsa  authorized_keys  .bash_history  .mysql_history

# 编辑器残留
.vscode/  .idea/  *.swp  *.swo  *.~  *~
```
```bash
dirsearch -u http://target.com -w backup.txt -x 403,404 -t 30 --random-agent
```
- 注意：`.git/config`、`.DS_Store` 这类以点开头的路径，部分工具默认忽略隐藏文件，dirsearch 需确认字典里保留了点号开头行。
- 预期结果：命中的敏感文件按第 3 步逐一验证。

#### 第 3 步：下载并验证命中文件
```bash
curl -O http://target.com/www.zip
file www.zip              # 确认是 zip：Zip archive data
unzip -l www.zip | head   # 列出内容，先看结构
```
- 预期结果：`www.zip` 是合法压缩包且包含 PHP 源码 → 直接解压审计源码，找配置里的数据库口令、硬编码密钥、隐藏接口。
- 数据库备份 `db.sql` 同理：`head -50 db.sql` 看表结构，搜 `INSERT INTO` 找明文账号密码。

#### 第 4 步：.git 泄露专项处理
`.git/config` 存在说明整个 `.git` 目录可访问，用专用工具把源码「还原」出来：
```bash
# GitHack（经典工具，克隆下来即可用）
python3 GitHack.py http://target.com/.git/
```
- 预期结果：脚本逐个下载 `.git` 对象并还原出工作区源码，输出源码目录。
- 没有工具时手工验证：`curl http://target.com/.git/HEAD` 返回 `ref: refs/heads/master` 即确认存在。
- 还原出的源码直接做代码审计（见 source-code-audit 技能），找注入、上传、认证缺陷。

#### 第 5 步：其他敏感文件验证
- `phpinfo.php`：存在即泄露 PHP 配置与系统信息，`curl http://target.com/phpinfo.php` 确认。
- `.env`：存在即泄露环境变量（数据库口令、密钥），`curl http://target.com/.env` 直接看。
- `id_rsa`：私钥泄露，下载后 `chmod 600 id_rsa && ssh -i id_rsa user@IP` 尝试 SSH 登录。
- `.bash_history` / `.mysql_history`：泄露历史命令，可能含口令与内网信息。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 手工访问返回 403 | 文件存在但禁止下载 | 换 UA、加 Referer 头，或从别的路径引用（如 ../../ 穿越） |
| 扫描工具跳过 `.git` 这类点开头路径 | 工具默认忽略隐藏文件 | 确认字典行保留点号，或用 gobuster 直接指定路径 |
| 下载的 zip 解压报错 | 伪 200（所有路径都返回同一页） | 对比 Content-Length：真实文件体积大且是二进制，伪 200 通常是 HTML |
| `.git` 存在但 GitHack 还原失败 | 服务器过滤了 `.git` 子路径 | 用 `git` 客户端配 `GIT_DIR` 手工拉取，或换 githacker 等工具 |
| 备份文件里有源码但找不到口令 | 配置用了环境变量 | 搜 `.env`、`config/*.php`、`settings.py`，口令常在配置文件里 |

#### 实战要点
- 优先级：`.git/`、`.env`、`www.zip` 三件套命中任何一个都是「严重信息泄露」级别的发现，独立可报。
- 备份文件命名套路：站点名/域名 + zip/bak/sql（target.zip、www.target.com.zip），把域名加进字典（见 wordlist-keys 条目）。
- 下载任何备份先 `file` 验证类型，伪 200（全是 HTML 的站）会浪费大量时间。
- 拿到源码 = 拿到攻击面全景：代码审计找注入与上传点，配置找口令与内网地址，通常直接通向 getshell。
- 编辑器残留（.swp/.bak/~）常见于开发者未清理的站点，命中概率不低且零成本验证。

> [!tip] 备份文件常以站点名、域名命名，扫描时把目标域名和站点目录名加进字典。

> [!danger] 拿到 `.git` 或 `.env` 属于严重信息泄露，可作为独立漏洞上报，也是后续 getshell 的跳板。

## [g-proxy] 代理与流量——抓包、改包、看流量

### [burp-workflow] Burp Suite 模块用途与流程 | medium | burp;proxy;repeater;intruder | burp;抓包;重放
> Burp 是 Web 测试核心工具，掌握各模块定位即可高效完成拦截改包、重放、爆破与编解码。

#### 这个条目的作用
Burp Suite 是 Web 测试的「总控台」：浏览器把流量交给它，它负责拦截、查看、修改、重放、爆破。绝大多数 Web 漏洞（注入、越权、上传绕过）都要靠它改包才能验证。本条目把核心模块的定位和标准流程讲清楚：装好代理 → 抓包 → 送 Repeater 改包 → 送 Intruder 爆破。

#### 前置条件
- 已安装 Burp Suite Community/Pro（Kali 自带 Community 版）。
- 一个测试浏览器（Chrome/Firefox 均可）。
- 目标授权：Burp 的所有操作都是主动测试，确认你有权测试该目标。

#### 第 1 步：配置浏览器代理
1. 打开 Burp → `Proxy` 标签 → `Proxy settings`，确认监听地址是 `127.0.0.1:8080`（默认）。
2. 浏览器设置代理：Chrome 装 SwitchyOmega 扩展，新建代理 profile，HTTP/HTTPS 都填 `127.0.0.1:8080`；或 Firefox → 设置 → 网络设置 → 手动代理 `127.0.0.1:8080`。
3. 验证：浏览器访问 `http://example.com`，Burp 的 `Proxy -> HTTP history` 里出现该请求即代理生效。

#### 第 2 步：安装 CA 证书（HTTPS 解密必需）
1. 代理已生效时，浏览器访问 `http://burp`（或 `http://127.0.0.1:8080`），页面右上角点 `CA Certificate` 下载 `cacert.der`。
2. 导入证书：Chrome → 设置 → 隐私和安全 → 安全 → 管理证书 → 导入，勾选「信任用于标识网站」；Firefox → 设置 → 隐私与安全 → 证书 → 查看证书 → 导入。
3. 验证：访问任意 HTTPS 站点，Burp history 里能看到解密后的明文请求（不再显示 `CONNECT` 隧道行）。
> 不装证书 HTTPS 流量只能看到 CONNECT 隧道，看不到 URL 和参数，等于白抓。

#### 第 3 步：Proxy 抓包与手动改包
1. `Proxy -> Intercept`，点 `Intercept is on`（变橙色即开启拦截）。
2. 浏览器操作目标站点，请求到达 Burp 会被拦下。
3. 在拦截面板里直接改请求（改参数、改 Cookie、改路径），点 `Forward` 放行；`Drop` 丢弃。
4. 预期结果：改完的参数原样到达服务器，响应回来后可 `Forward` 继续或 `Action -> Do intercept -> Response` 改响应。
> 拦截模式容易忘关导致浏览器卡住，练手时可用 HTTP history 模式：不拦截，全流量进历史记录，右键重放。

#### 第 4 步：Target 设置 Scope 过滤噪音
1. `Target -> Scope`，`Add` 目标域名（如 `target.com`）。
2. `Target -> Site map` 只看 scope 内站点，HTTP history 底部勾 `Filter: Show only in-scope items`。
3. 预期结果：流量列表只剩目标站点的请求，站内页面、JS、API 结构一目了然，攻击面梳理更清晰。

#### 第 5 步：Repeater 手动重放（最常用）
1. 在 HTTP history 里找到目标请求，右键 → `Send to Repeater`。
2. `Repeater` 面板改任意参数（把 `id=1` 改成 `id=2` 测越权、改 SQL 注入 payload），点 `Send`。
3. 预期结果：右侧返回响应，和上一次对比看差异（越权则返回了别的用户数据，注入则出现报错或时间差）。
4. 批量测多个 payload 时配合 Intruder；测两个响应差异用 Comparer。

#### 第 6 步：Intruder 自动化爆破
1. 在请求里选中要爆破的参数（如 `password=admin`），右键 → `Add to Intruder`。
2. `Positions` 页确认攻击位置（`§` 包围即生效）。
3. `Payloads` 页加载字典（`Payload options` 里 Load，如 `rockyou.txt` 或用户名字典）。
4. 点右上角 `Start attack`，结束后按 Response length / Status code 排序找异常项（登录成功通常长度不同）。
> 社区版 Intruder 有速率限制，大字典爆破改用 ffuf 或脚本（见 dir-search、hydra 条目）。

#### 第 7 步：其他模块速查
| 模块 | 用途 |
|---|---|
| Proxy | 拦截与转发请求，抓包和手动改包 |
| Target | 站点地图，梳理攻击面 |
| Repeater | 手动重放与修改单个请求 |
| Intruder | 自动化爆破与 fuzz（四种攻击模式） |
| Decoder | 编解码与哈希（Base64/URL/Hex 等） |
| Comparer | 对比两个响应差异，定位注入点 |
| Sequencer | 分析 Token 随机性 |
| Extender | 加载 BApp 扩展 |
- Decoder：粘贴密文（如 `ZmxhZw==`），`Decode as` 选 Base64 即出明文，也可 Encode 反向操作。
- Comparer：把两次响应 `Send to Comparer`，高亮差异，快速定位注入成功与失败的区别。
- Extender：BApp Store 里装 `Logger++`、`Autorize`（越权检测）等扩展，社区版也能用。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 浏览器打不开任何网站 | 代理挂了但没开 Burp，或拦截没放行 | 确认 Burp 在运行、`Intercept is off`，或检查代理端口 |
| HTTPS 页面显示证书错误 | CA 证书没导入或没信任 | 重新下载 cacert.der 并勾选信任，清浏览器缓存重试 |
| history 里全是 CONNECT 看不到请求 | 证书没装好，HTTPS 未解密 | 回到第 2 步完整走一遍证书流程 |
| 修改参数后响应没变化 | 参数名写错或服务端不读该参数 | 对照页面实际提交的参数名（看 history 原文） |
| Intruder 爆破极慢 | 社区版速率限制 | 换 ffuf/hydra，或减少 payload 数量 |
| 流量列表刷屏看不清 | 没设 Scope | 按第 4 步配置 Scope 并过滤 in-scope |

#### 实战要点
- 标准流程五连：配代理 → 装证书 → 抓包 → Repeater 改包 → Intruder 爆破，这套打满就能覆盖绝大多数 Web 测试需求。
- 越权测试三板斧都在 Repeater：改 `id`、改 `uid`、改 Cookie 里的用户标识，对比响应。
- 上传/注入类绕过大多要手动改包：改 Content-Type、加后缀、改编码，Repeater 是主战场。
- 看到可疑请求就 `Send to Repeater`，改一个参数 Send 一次，比在浏览器里折腾快得多。
- Decoder + Comparer 是 CTF 高频组合：密文直接 Decoder 解，两个响应差异直接 Comparer 看。
- 长时间挂机任务（批量加 header、自动提取 Token）用 mitmproxy 配 Python 脚本更合适（见 mitmproxy 条目）。

> [!tip] HTTPS 站点需先在浏览器导入 Burp CA 证书，否则流量无法解密。

> [!warn] 社区版 Intruder 功能受限，Payload 过大时改用 ffuf 或脚本。
