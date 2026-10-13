## [g-port] 端口与服务——目标开放了什么，决定你能走哪条路

### [recon-porttable] 常见端口与默认服务对照 | easy | 端口;服务识别 | -
> 看到端口号先对表猜服务，再决定用哪种方式进一步探测。

#### 这个条目的作用
nmap 扫完会给你一串端口号，但数字本身不告诉你后面跑着什么服务。这张对照表把「端口 → 常见服务 → 默认试探方式」串起来：看到 3306 你该想 MySQL，看到 6379 你该想 Redis 未授权。端口是攻击面的目录，这张表就是目录的索引。

#### 前置条件
- 已用 nmap 拿到目标端口列表（如 `nmap -sV -T4 目标IP`）
- 知道 TCP/UDP 端口号的含义：1-1023 是系统常用端口，1024 以上多为用户程序自选

#### 第 1 步：拿到端口列表后，先对照常用端口表做第一轮分类
操作：把扫描结果里的每个端口，对照上表（21 FTP、22 SSH、23 Telnet、25/465/587 SMTP、80/443 Web、3306 MySQL、3389 RDP、5432 PostgreSQL、6379 Redis、8080/8443 Tomcat、8888 宝塔、9200 ES、27017 MongoDB、11211 Memcached）写下「端口 + 猜的服务 + 优先级」三列。
预期结果：一份待探测清单，比如 `6379 → Redis → 优先试未授权`。
如果不行：端口不在表里，说明是自定义/非常规服务，交给第 2 步。

#### 第 2 步：对非常规端口，用 nmap 版本探测确认真实服务
操作：对可疑端口单独跑版本探测：
```bash
nmap -sV -p 7001,8000,8081,9090 目标IP
```
预期结果：nmap 报出 `open` 且给出服务名与版本，如 `Oracle WebLogic Server`。
如果不行：nmap 只报 `open` 不给版本，说明服务不回标准 banner，转到 port-banner 条目手工发包。

#### 第 3 步：按服务类型选择默认试探动作
操作：对照表里「默认凭据/路径」列逐项试：
```bash
# MySQL root 空口令 / 弱口令
mysql -h 目标IP -u root -p
# Redis 未授权访问
redis-cli -h 目标IP ping
# MongoDB 未授权
mongosh "mongodb://目标IP:27017"
# Tomcat 管理后台
curl -s http://目标IP:8080/manager/html
```
预期结果：至少一类服务能连通——能连上就说明存在默认凭据或未授权，直接进入打点阶段。
如果不行：全部拒绝，说明有认证或访问控制，把端口记入「后续爆破/漏洞」清单。

#### 第 4 步：把结果整理成服务清单
操作：按「开放端口 → 服务与版本 → 可用的默认入口 → 下一步动作」整理成清单，作为整个渗透过程的路线图。
预期结果：一份随时能查的清单，例如：`8080/Tomcat 8.5 → /manager 存在 → 爆破 admin 口令`。
如果不行：发现某端口不开放了，复查 nmap 输出是否被防火墙干扰（见排查表）。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| nmap 显示 filtered | 防火墙屏蔽了该端口探测 | 换 `-sS` 半开扫描或换源 IP 再试 |
| 端口开着但服务识别为 unknown | 服务不回标准 banner | 用 port-banner 手工发包，或按端口+协议猜测后验证 |
| 对表猜错服务 | 端口被自定义服务占用 | 永远以 nmap -sV / banner 结果为准，表格只是第一猜测 |
| 全端口扫描太慢 | 用了 `-p-` 且无加速 | 先 `--top-ports 1000`，命中后再对高危端口 `-p-` 补扫 |

#### 实战要点
- 80/443 之外的高位端口（8000/8081/9090/7001）往往是框架管理口，优先级最高，别按端口号大小排序跳过。
- 同一端口可能绑多个虚拟主机，扫描后记得对每个 HTTP 端口做 host 头/域名枚举。
- 对照表不是终点：Redis 未授权、ES 未授权这类「连上即洞」的服务，看到端口就要第一时间测。
- 把服务版本精确到小版本号（如 8.5.61 而非 8.5），版本号是后面 finger-cve 检索的输入。

### [port-banner] Banner 抓取与协议识别 | easy | 端口;banner | -
> nmap 版本探测不可靠时，手工发包读 banner，确认真实服务与版本。

#### 这个条目的作用
很多服务在客户端连上来的一瞬间会主动「自报家门」：FTP 会说 `220 ProFTPD 1.3.5e`，SSH 会说 `SSH-2.0-OpenSSH_7.4`。这段开场白叫 banner。当 nmap 的版本探测失灵（报 unknown、报错版本、被防火墙干扰）时，手工发包读 banner 是最直接的确认方式，拿到精确版本号才能去对 CVE。

#### 前置条件
- 已确认目标端口是 open 状态（先用 `nmap -sV 目标IP` 或上一轮扫描）
- 本机装有 netcat（Windows 可用 `ncat`，Kali 自带 `nc`）

#### 第 1 步：直接连端口，看它是否主动报 banner
操作：用 nc 连接并退出，观察返回的欢迎信息：
```bash
nc -vz 目标IP 80
nc 目标IP 22
```
预期结果：连接 22 端口返回 `SSH-2.0-OpenSSH_7.4`，连接 80 返回 HTTP 应答头——版本号一目了然。
如果不行：连接后立即断开没有输出，说明该服务不主动发 banner，进入第 2 步主动询问。

#### 第 2 步：发一个 HTTP 请求，读响应头里的服务标识
操作：对 HTTP 服务用 curl 只取响应头：
```bash
curl -sI http://目标IP:8080/
```
预期结果：响应头里出现 `Server: nginx/1.18.0`、`X-Powered-By: PHP/7.4.3` 等指纹行。
如果不行：服务不回标准 HTTP 头，或端口是纯 TCP 协议，进入第 3 步手工发包。

#### 第 3 步：手动构造协议报文，主动「问」服务
操作：用 printf 构造裸协议请求喂给 nc（HTTP 和 Redis 最常用）：
```bash
# HTTP：发一个 GET 请求，服务必须回应
printf "GET / HTTP/1.0\r\n\r\n" | nc 目标IP 80
# Redis：空连接测试未授权
printf "\r\n" | nc 目标IP 6379
# FTP：发 NOOP 或 USER 触发响应
printf "USER anonymous\r\n" | nc 目标IP 21
```
预期结果：HTTP 返回状态行与 Server 头；Redis 返回 `-ERR unknown command`（说明协议通了，可进一步测未授权）；FTP 返回 `331 Please specify the password.`。
如果不行：发了标准请求仍无响应，多半是私有二进制协议，交给 nmap -sV 兜底。

#### 第 4 步：用 nmap 脚本兜底探测
操作：让 nmap 的协议脚本替你发包解析：
```bash
nmap -sV --script banner -p 端口 目标IP
```
预期结果：输出 `banner: 具体服务欢迎语`，把前几步没读到的版本补全。
如果不行：nmap 脚本也没结果，记录端口为「服务未知」，等后续流量分析或漏洞阶段再回看。

#### 第 5 步：把 banner 里的版本号归档
操作：把每条 banner 记录成 `服务 + 精确版本`，如 `ProFTPD 1.3.5e`、`nginx 1.18.0`，存入目标笔记。
预期结果：一份可直接拿去 finger-cve 检索的版本清单。
如果不行：banner 里只有大版本没有小版本（如 `Apache/2`），标注「版本不全」，检索时按家族查。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| nc 连上秒断无输出 | 服务需要先发指令才回话 | 用 printf 主动发包触发，别干等 |
| banner 显示旧版本 | 服务做了版本伪装（改 banner） | 以行为特征（报错文案、JS 特征）二次确认 |
| printf 请求被 WAF 拦 | 裸 HTTP 请求触发检测 | 换 `nc -l` 先看回包，再带全 Host 头重发 |
| curl -sI 只有 404 无 Server 头 | 目标虚拟主机未匹配 | 加 `-H "Host: 目标域名"` 重试 |

#### 实战要点
- banner 里的版本号直接决定后续 CVE 检索范围，宁可多记一位小版本号也不要只记大版本。
- 读到的版本先去 Exploit-DB 搜家族（如 `ProFTPD 1.3.5` 的 mod_copy 任意文件读取），很多老版本一查一个准。
- nc 无回显不一定是服务不报 banner：先发标准请求，再考虑超时与防火墙因素。
- 用 `-vz` 只是探测端口，真正读 banner 要完整连接（去掉 `-z`）并发送数据。

## [g-dir] 目录与源码泄露——Web 根目录下藏着多少不该公开的东西

### [dir-scan] 目录扫描与工具对比 | easy | 目录扫描;爆破 | -
> 遍历常见路径，找出后台、备份、上传目录等未在首页暴露的入口。

#### 这个条目的作用
首页只是 Web 应用的冰山一角：后台登录页、上传目录、API 文档、备份文件夹往往藏在没链接的路径里。目录扫描就是拿字典里的路径名一个个去请求，凡返回 200/301/403 的都是入口线索。工具有很多，但核心思路一致：字典质量决定上限，工具只是执行者。

#### 前置条件
- 目标 HTTP 服务可访问（`curl -sI http://目标` 能通）
- 装好至少一个扫描器（ffuf / dirsearch / gobuster，Kali 自带后两个）

#### 第 1 步：准备一份好字典
操作：先用手头的字典（如 `/usr/share/wordlists/dirb/common.txt`），再去 GitHub 找一份更新更全的（如 SecLists 的 `Discovery/Web-Content/` 系列）：
```bash
ls /usr/share/wordlists/dirb/common.txt
```
预期结果：字典文件存在且能读到，行行都是路径名。
如果不行：没有现成字典，先用手敲的十几个常见路径（admin/、backup/、upload/、.git/）应急。

#### 第 2 步：用 ffuf 快速扫一遍
操作：ffuf 用 FUZZ 占位符注入字典词，注意带上状态码过滤：
```bash
ffuf -u http://example.com/FUZZ -w dict.txt -mc 200,301,302,403 -t 50
```
预期结果：屏幕列出命中的路径和状态码，如 `admin [Status: 200]`。
如果不行：全是 404，先确认 `-mc` 过滤没把 404 放进来，再确认目标 URL 没写错。

#### 第 3 步：用 dirsearch 做第二轮补充
操作：dirsearch 自带丰富字典，直接指定扩展名和排除常见噪音：
```bash
dirsearch -u http://example.com -e php,bak,txt --exclude-status=404
```
预期结果：输出一批 ffuf 没扫到的路径，尤其是 `index.php.bak`、`config.txt` 这类带扩展名的文件。
如果不行：无新结果，说明目标路径命名不常规，换大字典或进入第 4 步换工具交叉验证。

#### 第 4 步：用 gobuster 交叉验证关键结果
操作：对 ffuf/dirsearch 的差异结果，用 gobuster 再扫一遍确认：
```bash
gobuster dir -u http://example.com -w dict.txt -t 50 -x php,bak
```
预期结果：重复出现的路径基本可信；只在一个工具里出现的路径要手工 curl 复核。
如果不行：三工具结果一致为空，考虑目标用了路由型框架（如前端 SPA），改用 JS 分析找接口。

#### 第 5 步：验证结果并递归深入
操作：对命中的目录加 `-r` 递归再扫，同时手工 curl 复核每个命中项的真实内容：
```bash
ffuf -u http://example.com/admin/FUZZ -w dict.txt -mc 200,301,403 -t 50
curl -s http://example.com/admin/
```
预期结果：`/admin/` 下再扫出 `login`、`upload` 等二级路径，形成完整的目录树。
如果不行：目录下全是 404，可能开启了目录列表保护或路径做了哈希，停止深挖该目录。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 扫描全是 404，但浏览器能打开首页 | 工具请求头被拒/未带 Host | 加 `-H "Host: 目标域名"` 和真实 UA |
| 扫出大量 403 | 存在但禁止访问，也可能是 WAF 拦截 | 403 也是线索：单独手测绕过（见 waf 技能），别当噪音忽略 |
| 扫到一半被断连 | 频率太高触发封 IP | 加 `-rate 10` 限速或 `-t 10` 降并发 |
| 结果和浏览器不一致 | CDN/缓存干扰 | 直接解析出源站 IP 后对源站扫 |

#### 实战要点
- 字典优先级远高于工具：先跑 top 几千常用路径，再递归子目录（-r），最后补扩展名爆破。
- 接口型站点优先扫 API 路径：`/api/`、`/v1/`、`/swagger/`、`/v2/`，比扫静态路径值钱。
- 命中 403 不要略过：目录存在但被限制，往往比 200 更有价值（见 WAF 绕过链路）。
- 扫描结果要手工复核：工具报 200 的可能只是统一 404 页面伪装，用 `curl -s 路径 | head` 看内容区分。

### [dir-backup] 备份文件与版本控制泄露 | medium | 源码泄露;备份 | -
> 找备份压缩包、编辑器残留、版本控制目录与隐藏系统文件，直接拿到源码或配置。

#### 这个条目的作用
开发者最常见的失误是把备份、源码仓库、配置文件落在 Web 根目录：`.git/` 目录可达等于源码全量泄露，`.env` 里可能躺着数据库密码和云密钥，`backup.zip` 解出来就是整个站点。这类泄露是「一击致命」型漏洞——不需要任何利用技巧，只需知道该猜什么文件名。

#### 前置条件
- 目标可访问，且已做过一轮基础目录扫描（dir-scan）
- 准备 curl（探测）与 GitTools（.git 拉取）工具

#### 第 1 步：探测版本控制目录
操作：直接请求版本库的关键文件，200 即泄露：
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://example.com/.git/config
curl -s http://example.com/.git/config
curl -s -o /dev/null -w "%{http_code}\n" http://example.com/.svn/entries
```
预期结果：`.git/config` 返回 200 且内容形如 `[core] repositoryformatversion = 0`，说明整个仓库可下载。
如果不行：返回 404/403，说明目录被禁，跳过本步试第 2 步。

#### 第 2 步：用 GitTools 把整个仓库拉下来离线分析
操作：`.git/config` 确认可达后，用 dump 脚本整仓克隆：
```bash
git clone https://github.com/internetwache/GitTools
cd GitTools/Dumper
./gitdumper.sh http://example.com/.git/ /tmp/target-git
cd ../Extractor
./extractor.sh /tmp/target-git /tmp/target-src
```
预期结果：`/tmp/target-src` 里出现完整源码树，用 `git log --all --oneline` 能看到历史提交。
如果不行：gitdumper 中途报 404，说明只泄露了 config 没泄露对象文件，退化为逐文件猜备份。

#### 第 3 步：探测配置与系统文件
操作：请求最常见的敏感单文件：
```bash
curl -s http://example.com/.env
curl -s http://example.com/.DS_Store
curl -s http://example.com/.htaccess
curl -s http://example.com/web.config
```
预期结果：`.env` 返回 `DB_PASSWORD=` 之类键值即高价值泄露；`.DS_Store` 返回二进制文件头 `\x00\x00\x00\x01Bud1`，可用工具解析出文件清单。
如果不行：全 404，进入第 4 步猜备份压缩包。

#### 第 4 步：按命名规律猜备份文件
操作：备份命名常用「域名/目录名 + 扩展名」组合，配合目录扫描字典批量试：
```bash
for f in backup.zip wwwroot.zip site.zip 1.sql db.sql config.bak; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://example.com/$f")
  echo "$f -> $code"
done
```
预期结果：某个文件返回 200，下载后用 `file` 确认类型、`unzip`/`tar` 解开查看内容。
如果不行：常见名全 404，用 dirsearch 带 `-e zip,rar,tar.gz,sql,bak` 跑扩展名爆破补一轮。

#### 第 5 步：探测编辑器残留文件
操作：源码编辑器会在目录留下临时文件，`.swp`、`.php~`、`index.php.bak` 都是经典目标：
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://example.com/index.php~
curl -s -o /dev/null -w "%{http_code}\n" http://example.com/.index.php.swp
curl -s -o /dev/null -w "%{http_code}\n" http://example.com/config.php.bak
```
预期结果：某个返回 200，下载后通常能拿到可读的源码片段（`.swp` 用 `vim -r` 或 `strings` 提取）。
如果不行：全 404，结束文件枚举，把已发现的泄露整理成清单。

#### 第 6 步：整理泄露资产，提取高价值信息
操作：把拿到的源码/配置按价值排序：数据库账号 → 云密钥（AK/SK）→ 内部 API 地址 → 业务逻辑源码，只记录位置与类型。
预期结果：一份泄露清单，例如 `.git 全量源码 + .env 含 DB_PASSWORD`，作为后续漏洞挖掘的输入。
如果不行：只拿到无关紧要的静态资源，标注低价值，继续其他信息收集。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `.git/config` 200 但 gitdumper 拉不全 | 服务器禁止了部分对象请求 | 逐个请求 `objects/` 下的散列文件，或用 GitHack 类工具重试 |
| 下载的 backup.zip 解压失败 | 传输被截断或非真实压缩包 | 用 `curl -C -` 断点续传，`file` 先验类型 |
| `.DS_Store` 无法解析 | 本地缺解析工具 | 用 `ds_store_exp.py` 或在线解析器提取文件清单 |
| robots 里没有备份线索 | 备份路径从不公开声明 | 依赖第 4 步命名规律 + 字典爆破，别指望 robots |

#### 实战要点
- `.git/config` 返回 200 后不要逐文件猜 URL，直接用 GitTools dump 整仓，效率高一个量级。
- 备份文件命名常见组合：`域名.zip`、`wwwroot.zip`、`网站名.bak`、`1.sql`，配合目录扫描字典挨个试。
- `.env`/备份 SQL 里最值钱的是数据库账号、云密钥、内部地址——发现即记录位置与类型，涉密数据不落盘扩散。
- 拿到源码后优先看：数据库连接配置、鉴权逻辑、上传校验、硬编码密钥，这些直接导向下一个洞。

### [dir-robots] robots.txt 与 sitemap 解析 | easy | 信息泄露;配置 | -
> 从搜索引擎写给爬虫的说明书里反推隐藏目录与页面优先级。

#### 这个条目的作用
robots.txt 是站长写给搜索引擎爬虫的「允许/禁止抓取」说明，sitemap.xml 是站点地图。它们不是安全机制，却常常把最不想公开的路径（`/admin/`、`/backup/`、`/.git/`）白纸黑字写出来。读这两份文件是零成本的信息收集，几秒钟就能收获手动枚举半天才找得到的路径线索。

#### 前置条件
- 目标 HTTP 服务可访问
- 有 curl；解析 XML 可选装 xmllint

#### 第 1 步：抓取 robots.txt 并逐行读
操作：直接下载全文：
```bash
curl -s http://example.com/robots.txt
```
预期结果：看到 `User-agent:` 与 `Disallow:` 行；没有 robots.txt 时返回 404 或空内容。
如果不行：返回 404，说明没配 robots，跳过本步直接看 sitemap。

#### 第 2 步：标记 Disallow 里的可疑路径
操作：把 `Disallow:` 后面的路径全部抄出来，重点标记：含 admin/backup/upload/.git/db 等敏感词的路径。
预期结果：得到候选清单，例如 `Disallow: /admin/`、`Disallow: /backup/`。
如果不行：Disallow 全是不敏感路径（如 `/search`），说明 robots 没泄露，别硬挖。

#### 第 3 步：手工验证每条 Disallow 路径
操作：robots 只是「建议」不是「强制」，对每条候选路径逐个请求：
```bash
for p in /admin/ /backup/ /uploads/ /.git/; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://example.com$p")
  echo "$p -> $code"
done
```
预期结果：至少一条路径返回 200/301/403——200 直接进入，403 说明存在但被限，记入后续绕过清单。
如果不行：全部 404，说明这些路径不存在或已迁移，确认 robots 是否指向旧路径。

#### 第 4 步：抓取并解析 sitemap
操作：下载 sitemap 并格式化查看，再提取全部 URL：
```bash
curl -s http://example.com/sitemap.xml | xmllint --format -
curl -s http://example.com/sitemap.xml | grep -oP '<loc>\K[^<]+' | sort -u > sitemap-urls.txt
```
预期结果：`xmllint` 输出可读的 XML 树；`sitemap-urls.txt` 里是一行一个的真实 URL。
如果不行：没有 xmllint 就用 `grep -oP` 那步直接提取，或 `python3 -c "import sys,xml.etree.ElementTree as E; ..."` 解析。

#### 第 5 步：展开嵌套子地图，批量探活全部 URL
操作：sitemap 常常不止一个，先查是否嵌套子地图，再对全部 URL 批量探活：
```bash
grep -oP '<loc>\K[^<]+' sitemap-urls.txt | grep -i 'sitemap'   # 找嵌套索引
while read -r u; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$u")
  echo "$code $u"
done < sitemap-urls.txt | sort
```
预期结果：发现 `sitemap-index.xml` 或按栏目拆分的子地图；探活结果里出现 200 的隐藏页面。
如果不行：sitemap 只有首页等公开 URL，价值有限，标注后继续其他信息收集。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| robots.txt 404 | 站点根本没配 | 正常现象，跳过直接看 sitemap |
| Disallow 路径请求全是 404 | 路径已下线或本就不存在 | 用 dir-scan 字典补扫，别只信 robots |
| sitemap.xml 报 XML 解析错误 | 文件被压缩或非标准格式 | 先 `curl -s | head -c 200` 看原始内容 |
| grep 提取的 URL 带尾部斜杠/参数 | 正则没匹配干净 | 用 `sort -u` 去重，手工抽查前 10 条 |

#### 实战要点
- 很多站点的 sitemap 不止一个：`sitemap.xml` 里常嵌套 `sitemap-index.xml` 或按栏目拆分的子地图，全部展开取 URL 列表再批量探活。
- robots 是「建议」不是「强制」，Disallow 的路径恰恰是最值得手测的目标——站长以为藏住了，其实等于公告。
- 拿到的 URL 列表顺手丢给后续扫描器当种子字典，比通用字典命中率高得多。
- robots/sitemap 没收获很正常，它们是信息收集的甜点不是正餐，别在这上面耗太久。

## [g-finger] Web 指纹与组件——认出框架版本，CVE 就是现成的弹药

### [finger-identify] 框架与 CMS 指纹识别 | easy | 指纹识别;CMS | -
> 用指纹库判定后端框架、CMS、中间件版本，为后续 CVE 检索圈定范围。

#### 这个条目的作用
Web 应用大多基于现成框架与 CMS 搭建：ThinkPHP、Laravel、WordPress、Discuz……每个组件都有标志性的响应头、Cookie、页面特征。指纹识别就是把这些特征收集起来，判定「目标是什么框架 + 什么版本」。认出版本的那一刻，攻击就从「瞎猜」变成「查表」——直接去漏洞库找该版本的已知漏洞。

#### 前置条件
- 目标可访问，能打开首页
- 装了 whatweb（Kali 自带）或浏览器装了 Wappalyzer 插件

#### 第 1 步：用 whatweb 做全量指纹扫描
操作：命令行直接扫，`-a 3` 是激进模式（多请求、多特征）：
```bash
whatweb -a 3 http://example.com
```
预期结果：输出一串指纹，如 `[200 OK] Nginx[1.18.0], PHP[7.4.3], Laravel, Cookies[laravel_session]`。
如果不行：whatweb 没识别出东西，说明站点特征弱或做了隐藏，进入第 2 步手工看响应头。

#### 第 2 步：手工读响应头找指纹
操作：curl 取响应头，盯住几个关键字段：
```bash
curl -sI http://example.com
curl -sI http://example.com | grep -iE 'server|x-powered-by|set-cookie|via'
```
预期结果：看到 `Server: nginx/1.18.0`、`X-Powered-By: PHP/7.4.3`、`Set-Cookie: PHPSESSID=...` 等。
如果不行：响应头很干净（可能套了 CDN），进入第 3 步看页面源码特征。

#### 第 3 步：从页面源码找特征
操作：抓首页源码，搜生成器 meta、版权字符串、框架专属路径：
```bash
curl -s http://example.com | grep -ioE '<meta[^>]*generator[^>]*>|wp-content|thinkphp|laravel|drupal|joomla'
curl -s http://example.com | grep -oP 'src="\K[^"]+\.(js|css)' | head -20
```
预期结果：出现 `<meta name="generator" content="WordPress 6.0" />`、`/wp-content/` 路径等标志。
如果不行：源码也被混淆或最小化，进入第 4 步用 Cookie 与报错页判定。

#### 第 4 步：用 Cookie 名与报错特征交叉判定
操作：查看 Set-Cookie 的会话名，并故意触发一个错误页观察风格：
```bash
curl -sI http://example.com | grep -i set-cookie
# PHP 站点常见 PHPSESSID / laravel_session / JSESSIONID / csrftoken
curl -s "http://example.com/index.php?id=1'" | head -30
```
预期结果：Cookie 名直接暴露语言栈（`JSESSIONID`=Java、`laravel_session`=Laravel/PHP）；报错页里可能出现 `ThinkPHP`、`Django` 等框架名与版本号。
如果不行：错误页是统一 500 页面，无特征可挖，如实记录「指纹不明」。

#### 第 5 步：用 Wappalyzer 被动嗅探前端技术栈
操作：浏览器装 Wappalyzer 扩展，打开目标页面，查看其识别的技术栈（框架、JS 库、CDN）。
预期结果：补充 whatweb 漏掉的前端信息，如 `Vue.js`、`jQuery`、`Element UI`、`React`。
如果不行：Wappalyzer 识别为空，以 whatweb + 手工特征的结果为准。

#### 第 6 步：归档指纹结果
操作：按「组件 + 版本」格式整理，如 `nginx 1.18.0 / PHP 7.4.3 / Laravel 8.x / Vue 2`。
预期结果：一份可直接交给 finger-cve 检索的清单。
如果不行：版本号缺失，标注「版本未知」，按家族特征缩小范围（见实战要点）。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| whatweb 什么也没识别 | 站点特征弱或套了 CDN | 对源站 IP 扫，配合 -a 3 激进模式 |
| 识别出多个冲突框架 | 用了聚合框架或前后端分离 | 区分「后端框架」与「前端库」，各记各的 |
| 版本号对不上 | 指纹库滞后或版本伪装 | 用手工特征（报错文案、JS 版本注释）二次确认 |
| 报错页有框架名但被统一拦截 | 开启了 debug=false | 试 `?debug=1`、`/index.php?s=/` 等入口触发调试模式 |

#### 实战要点
- 指纹结果按「框架 + 版本」归档，再去版本库批量查 CVE；版本号缺失时用手法差异（报错页面、JS 特征）缩小范围。
- Cookie 名是最快的语言栈判据：`PHPSESSID`/`laravel_session`=PHP，`JSESSIONID`=Java，`csrftoken`=Django。
- 前后端分离的站点别只盯后端：前端框架（Vue/React）的版本同样关联公开漏洞（如 Vue 旧版 XSS 链）。
- 指纹识别要覆盖多个页面：后台登录页、报错页、静态资源路径往往比首页暴露更多特征。

### [finger-cve] 指纹到 CVE 的检索链路 | medium | CVE;指纹 | -
> 拿到组件与版本号后，把公开漏洞情报翻译成可执行的利用候选。

#### 这个条目的作用
指纹识别的产出是「组件 + 版本」，但版本号本身不值钱——值钱的是它对应的已知漏洞。这一条讲清楚检索链路：从哪里查、按什么套路查、怎么把 CVE 情报变成可验证的利用候选。目标是让每个识别出的组件都能回答三个问题：有没有公开漏洞？漏洞能不能打到这个版本？有没有现成 PoC？

#### 前置条件
- 已完成指纹识别，拿到至少一个「组件 + 版本」组合（如 `nginx 1.18.0`、`ThinkPHP 5.0.23`）
- 有网络访问漏洞库的能力（浏览器或 curl）

#### 第 1 步：先看厂商官方安全公告
操作：去组件的官网安全页/发布页查该版本是否有安全更新：
```bash
# 例：搜索目标组件官方公告
curl -s "https://www.google.com/search?q=ThinkPHP+5.0.23+security+advisory" | grep -oP 'href="\Khttp[^"]+' | head
```
预期结果：官方公告给出受影响版本范围与修复版本，直接确认「我们的版本是否命中」。
如果不行：官网没公告或目标组件已停止维护，进入第 2 步用 NVD 精确匹配。

#### 第 2 步：用 NVD/CVE 官网按 CPE 精确匹配
操作：在 NVD（nvd.nist.gov）搜索组件名，找到对应的 CPE 字符串后按版本过滤：
```txt
# 检索源优先级：
# 1. NVD / CVE 官网：nvd.nist.gov 按 CPE 精确匹配
# 2. Exploit-DB：exploit-db.com 按组件名搜索，看现成 PoC
# 3. GitHub：搜 "组件名 CVE 版本" 找 POC 仓库
# 4. 搜索引擎：组件名 + 版本 + 漏洞/遍历/未授权
# 5. 厂商公告页：官方安全通告最权威，先看这个
```
预期结果：得到该组件的 CVE 列表，每条含受影响的版本区间，标注出「命中我们的版本」的 CVE。
如果不行：NVD 查不到，说明组件太冷门或版本太新，进入第 3 步用 Exploit-DB 兜底。

#### 第 3 步：去 Exploit-DB 找现成 PoC
操作：在 exploit-db.com 搜索「组件名 版本」，或用 searchsploit 本地查：
```bash
searchsploit thinkphp 5.0
searchsploit "nginx 1.18"
```
预期结果：输出匹配的漏洞条目与 PoC 编号，如 `ThinkPHP 5.0.x - Remote Code Execution | php/webapps/XXXXX`。
如果不行：Exploit-DB 无记录，进入第 4 步去 GitHub 找 POC 仓库。

#### 第 4 步：去 GitHub 找 POC 仓库
操作：按检索套路在 GitHub 搜索，优先找 star 高、更新近的仓库：
```txt
检索套路：
"组件 版本 CVE"
"组件 版本 漏洞"
"组件 版本 未授权"
"组件 版本 RCE POC"
site:github.com 组件 版本 exploit
```
预期结果：找到若干 PoC 仓库，README 里通常写着适用版本与用法。
如果不行：GitHub 也搜不到，说明该版本大概率无公开利用，把组件标为「无已知公开漏洞」。

#### 第 5 步：核对版本号与利用条件
操作：把 CVE 描述里的受影响版本区间与自己的指纹逐位对比（如 `ThinkPHP < 5.0.24`，而目标是 5.0.23 → 命中），并确认前置条件（是否需登录、是否需特定配置）。
预期结果：筛选出 1-3 个「版本命中 + 前置条件满足」的候选漏洞，形成利用清单。
如果不行：版本号差一位（如目标是 5.1.x 而漏洞只影响 5.0.x），按家族缩小范围当「同类」参考，别硬套。

#### 第 6 步：在隔离环境验证 PoC
操作：下载 PoC 后先读源码确认无恶意载荷，在自己的隔离环境（Docker/虚拟机）搭同版本组件复现，再决定是否对目标使用：
```bash
git clone https://github.com/xxx/yyy-poc
# 先读代码：grep -nE 'curl|wget|base64|exec' 确认无后门
docker run --rm -p 8080:80 同版本组件镜像   # 本地复现
```
预期结果：PoC 在本机复现成功，确认利用链真实可用，再对目标最小化验证。
如果不行：PoC 在本机就失败，说明环境差异或 PoC 有误，放弃该候选换下一个。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 搜到的 CVE 版本区间不含目标版本 | 版本号看错或指纹不准 | 回到 finger-identify 重新确认版本，别拿错误输入检索 |
| PoC 一跑就报错 | PoC 依赖特定环境/参数 | 读 README 检查依赖，在 Docker 里补齐环境 |
| 下载的 PoC 里有可疑命令 | 恶意作者植入后门 | 先 grep 审计再运行，陌生 PoC 一律隔离环境执行 |
| 目标打了补丁仍报漏洞 | CVE 被修复但指纹没更新 | 用实际行为验证（发探测请求看响应），别只信版本号 |

#### 实战要点
- 检索优先级：官方公告 > NVD/Exploit-DB > GitHub PoC > 搜索引擎；版本号对不上就缩小范围当「同类家族」查。
- 下载他人 PoC 先读代码确认无恶意载荷，再在自己的隔离环境复现——陌生脚本直接跑是大忌。
- 多个 CVE 命中时按「利用难度 × 影响面」排序：未授权 RCE > 需登录 RCE > 信息泄露，先打影响最大的。
- 版本号缺失时用行为验证兜底：发探测请求（如 ThinkPHP 报错页、Spring 的 actuator 路径）确认真实版本后再检索。

