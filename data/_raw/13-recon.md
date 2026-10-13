# recon|信息收集与侦察|🔍

## [g-passive] 被动收集——不接触目标，从公开渠道把资产底细摸清

### [passive-google-dork] Google Dork 语法速查 | easy | 被动收集;搜索引擎 | -
> 用搜索引擎索引直接定位暴露的敏感文件、后台入口与泄露信息，全程零流量接触目标。

#### 常用操作符

```txt
site:example.com        限定域名
intitle:"admin"         标题包含
inurl:phpmyadmin        URL 包含
intext:"password"       页面正文包含
filetype:sql            指定文件类型
inurl:.git/config       定位 git 泄露
```

#### 组合示例

```txt
site:example.com filetype:env
site:example.com inurl:admin login
site:example.com intitle:"index of"       目录列表
site:example.com filetype:bak|sql|zip
site:example.com intext:"api_key"
-inurl:php -inurl:html site:example.com  排除噪音
```

> [!tip]
> 顺手测目标是否被别家爬虫与泄露库索引：`site:pastebin.com 域名`、`site:github.com 域名`。

> [!warn]
> Dork 结果受搜索引擎反爬与地理位置影响，同一 dork 换 Google/Bing/本地站内搜索各跑一遍再下结论。

### [passive-github] GitHub 搜索与令牌泄露 | medium | 被动收集;代码搜索 | -
> 在公开代码、提交历史与 Gist 中捞组织名、域名、邮箱对应的硬编码密钥与内部路径。

#### 检索语法

```txt
"example.com" password
"example.com" api_key
"example.com" "BEGIN RSA PRIVATE KEY"
filename:.env example
org:目标组织名 token
```

```bash
# 配合 gh CLI 走 API 搜索（需 token，用量受限）
gh search code "example.com secret" --limit 50
```

> [!tip]
> 提交历史里删掉的密钥不会消失：直接看 `commits` 页与 blame，或克隆仓库后 `git log -p --all` 全量翻。
> 泄露的云密钥（AK/SK、GitHub token）需立即评估权限、通知目标方轮换，切勿自行调用验证。

### [passive-icp-crt] 备案查询与证书透明度 | easy | 被动收集;证书 | -
> 通过 ICP 备案与 crt.sh 证书日志，把子域名、历史域名和旁站一次性摊开。

#### 备案查询

- 工信部备案系统（beian.miit.gov.cn）：按域名倒查备案主体
- 站长工具类站点：按主体查名下全部域名，常能挖出未公开的站群
- 备案主体一致 = 资产归属同一公司，可并入同一测试范围

#### 证书透明度

```bash
# crt.sh 域名查询（无需 curl 也行，直接浏览器打开 https://crt.sh/?q=example.com）
curl -s "https://crt.sh/?q=%25.example.com&output=json" | jq -r '.[].name_value' | sort -u
```

```bash
# certspotter 更稳，限速更友好
curl -s "https://api.certspotter.com/v1/issuances?domain=example.com&include_subdomains=true&expand=dns_names" | jq -r '.[].dns_names[]' | sort -u
```

> [!warn]
> certspotter 免费 API 有速率限制，批量跑记得加 `sleep`；crt.sh 结果含大量垃圾子域，需手工去噪。

## [g-sub] 子域名与 DNS——把边界画出来，才知道从哪下手

### [sub-enum-tools] subfinder 与 amass 枚举 | easy | 子域名;DNS | -
> 聚合证书日志、被动 DNS、搜索索引等多个数据源，快速得出目标子域名全集。

```bash
# subfinder：被动为主，快且稳
subfinder -d example.com -all -o subs.txt

# amass：社区版做被动枚举 + 简单爆破
amass enum -passive -d example.com -o amass.txt

# 合并去重
cat subs.txt amass.txt | sort -u > all-subs.txt
```

> [!tip]
> subfinder 会在首次运行时提示配置各平台 API key；不配置也能用内置公共源，配置后命中率翻倍。
> 枚举结果先解析 IP 再按 CDN 与否分类，CDN 后的子域通常不是直接突破口。

### [sub-bruteforce] 子域爆破与泛解析识别 | medium | 子域名;DNS | -
> 对被动枚举不到的深层/冷门子域，用字典主动爆破，并先排除泛解析噪音。

```bash
# dnsx：从字典读取并验证存活子域
dnsx -d example.com -w subdomains.txt -o live.txt

# massdns：大规模爆破，速度极快，需 root 且注意限速
massdns -r resolvers.txt -t A -o S -w mass.txt subdomains.txt
```

#### 泛解析识别

```bash
# 随机不存在的名字，若解析出 A 记录则存在泛解析
dig random-string-abc123.example.com +short
# 命中泛解析后，需过滤：只保留与泛解析 IP 不同的结果才算真实子域
dnsx -d example.com -w subs.txt --filter-resp -resp-only | awk '{print $1}' | sort -u
```

> [!warn]
> 泛解析会让爆破结果全是"活"的假子域，务必先做泛解析探测再下结论；dnslog 类随机子域同理。

### [sub-dnslog] dnslog 平台与带外验证 | medium | DNS;带外 | -
> 在无回显场景下，用 DNS 请求回传验证注入、SSRF、命令执行等漏洞是否命中。

| 平台 | 地址 | 用途 |
| --- | --- | --- |
| dnslog.cn | https://dnslog.cn | 申请子域，看 DNS/HTTP 回传 |
| ceye.io | https://ceye.io | 域名+标识，支持 HTTP 探针 |
| interactsh | https://app.interactsh.com | 开源，本机自建更可控 |

```bash
# 拿到平台子域后，payload 里拼上唯一标识即可区分来源
whoami.example.ceye.io
curl http://xxx.xxx.xxx.xxx/flag.ceye.io
```

> [!tip]
> 自建 interactsh 时把回传域名拼进自己的域名，可避免第三方平台 IP 被目标流量日志标记。
> 带外请求务必加随机标识（时间戳/随机串），方便在日志里定位是哪一次请求触发。

## [g-port] 端口与服务——目标开放了什么，决定你能走哪条路

### [port-nmap] nmap 参数速查 | easy | 端口;扫描 | -
> 一次扫描覆盖开放端口、服务版本与常见漏洞指纹，是打点前的标准动作。

```bash
# 常规存活探测 + 常用端口
nmap -sV -sC -T4 目标IP

# 全端口快速扫描（速度快，适合大范围）
nmap -p- -T4 目标IP

# 全端口 + 版本 + 脚本 + 系统指纹，最全但慢
nmap -p- -sV -sC -O -T4 目标IP

# 输出三种格式便于后续处理
nmap -p- -sV -oA scan 目标IP

# 指定端口精确扫描
nmap -sV -p 22,80,443,8080,8443 目标IP
```

| 参数 | 含义 |
| --- | --- |
| -sV | 服务版本探测 |
| -sC | 默认 NSE 脚本 |
| -O | 操作系统指纹 |
| -p- | 全端口 1-65535 |
| -A | -sV -sC -O 的组合 |
| -T4 | 激进时间模板（内网常用 T4/T5，公网慎用） |
| --top-ports 1000 | 只扫最常见端口 |

> [!warn]
> 公网目标全端口 + 高 T 值会触发 IDS/封禁；先 `-sn` 探活，再分层扫，避免一次扫爆。

### [recon-porttable] 常见端口与默认服务对照 | easy | 端口;服务识别 | -
> 看到端口号先对表猜服务，再决定用哪种方式进一步探测。

| 端口 | 常见服务 | 默认凭据/路径 |
| --- | --- | --- |
| 21 | FTP | 匿名登录尝试 |
| 22 | SSH | 弱口令/密钥 |
| 23 | Telnet | 弱口令 |
| 25/465/587 | SMTP | 用户枚举/开放中继 |
| 80/443 | HTTP/HTTPS | Web 应用 |
| 3306 | MySQL | root 空口令 |
| 3389 | RDP | 弱口令 |
| 5432 | PostgreSQL | postgres/postgres |
| 6379 | Redis | 未授权访问 |
| 8080/8443 | Tomcat/管理后台 | admin/admin、manager |
| 8888 | 宝塔面板 | 常见弱口令 |
| 9200 | Elasticsearch | 未授权访问 |
| 27017 | MongoDB | 未授权访问 |
| 11211 | Memcached | 未授权访问 |

> [!tip]
> 看到 8000/8081/9090/7001 等非常规端口别急着跳过——很多框架与中间件的管理口就长在这些端口上。

### [port-banner] Banner 抓取与协议识别 | easy | 端口;banner | -
> nmap 版本探测不可靠时，手工发包读 banner，确认真实服务与版本。

```bash
# 直接读 banner（很多服务连上就自报家门）
nc -vz 目标IP 80
nc 目标IP 80 < /dev/null

# 发个 HTTP 请求看 Server 头
curl -sI http://目标IP:8080/

# 手动填协议，服务不回 banner 时主动问
printf "GET / HTTP/1.0\r\n\r\n" | nc 目标IP 80
printf "\r\n" | nc 目标IP 6379    # Redis 空连接测试
```

> [!tip]
> 拿到的版本号直接去 vulners/Exploit-DB 对家族 CVE，很多老版本中间件一查一个准。

## [g-dir] 目录与源码泄露——Web 根目录下藏着多少不该公开的东西

### [dir-scan] 目录扫描与工具对比 | easy | 目录扫描;爆破 | -
> 遍历常见路径，找出后台、备份、上传目录等未在首页暴露的入口。

```bash
# ffuf：速度最快，配合字典与速率控制
ffuf -u http://example.com/FUZZ -w dict.txt -mc 200,301,302,403 -t 50

# dirsearch：开箱即用，内置字典丰富
dirsearch -u http://example.com -e php,bak,txt

# gobuster：经典稳定
gobuster dir -u http://example.com -w dict.txt -t 50
```

> [!tip]
> 目录扫描字典的优先级远高于工具：先跑 top 几千的常用路径，再跑子目录递归（-r），最后补扩展名爆破。
> 接口型站点优先扫 API 路径：`/api/`、`/v1/`、`/swagger/`。

> [!warn]
> 爆破频率过高会被 WAF 拦截或封 IP；配合 `-rate` 限速、换 UA、开代理轮换。

### [dir-backup] 备份文件与版本控制泄露 | medium | 源码泄露;备份 | -
> 找备份压缩包、编辑器残留、版本控制目录与隐藏系统文件，直接拿到源码或配置。

| 文件/目录 | 特征 | 价值 |
| --- | --- | --- |
| .git/ | 目录可达即源码全量泄露 | 极高，可还原全部历史 |
| .svn/ | SVN 版本库 | 高 |
| .env | 环境变量配置 | 高，常含密钥 |
| .DS_Store | macOS 目录指纹 | 中，泄露文件清单 |
| .bak/.swp/.php~ | 编辑器/备份残留 | 中，常是源码 |
| backup.zip/sql | 压缩包/数据库备份 | 高 |
| robots.txt | 搜索引擎指引 | 低，常暴露路径线索 |
| sitemap.xml | 站点地图 | 低，常暴露隐藏页面 |

```bash
# 常规探测
curl -s http://example.com/.git/config
curl -s http://example.com/.env
curl -s http://example.com/robots.txt
curl -s http://example.com/sitemap.xml
```

> [!tip]
> `.git/config` 返回 200 后可直接用 GitTools 的 dump 脚本把整个仓库拉下来离线分析，比逐文件猜 URL 高效得多。
> 备份文件命名常见组合：`域名.zip`、`wwwroot.zip`、`网站名.bak`、`1.sql`，配合目录扫描字典挨个试。

> [!danger]
> 拿到 .env / 备份 SQL 后先看数据库账号、云密钥、内部地址，这是最值钱的一手情报；但涉密数据只记位置与类型，不落盘扩散。

### [dir-robots] robots.txt 与 sitemap 解析 | easy | 信息泄露;配置 | -
> 从搜索引擎写给爬虫的说明书里反推隐藏目录与页面优先级。

```bash
curl -s http://example.com/robots.txt
curl -s http://example.com/sitemap.xml | xmllint --format -
curl -s http://example.com/sitemap.xml | grep -oP '<loc>\K[^<]+' | sort -u
```

```txt
# robots.txt 常见可疑行
Disallow: /admin/
Disallow: /backup/
Disallow: /uploads/
Disallow: /.git/
```

> [!tip]
> 很多站点的 sitemap 不止一个：`sitemap.xml` 里常嵌套 `sitemap-index.xml` 或按栏目拆分的子地图，全部展开取 URL 列表再批量探活。
> robots 是"建议"不是"强制"，Disallow 的路径恰恰是最值得手测的目标。

## [g-finger] Web 指纹与组件——认出框架版本，CVE 就是现成的弹药

### [finger-identify] 框架与 CMS 指纹识别 | easy | 指纹识别;CMS | -
> 用指纹库判定后端框架、CMS、中间件版本，为后续 CVE 检索圈定范围。

```bash
# whatweb：命令行全量指纹
whatweb -a 3 http://example.com

# wappalyzer：浏览器插件，被动嗅探前端技术栈
# 手动看特征：
curl -sI http://example.com | grep -iE 'server|x-powered-by|set-cookie'
```

| 特征来源 | 例子 |
| --- | --- |
| 响应头 | `X-Powered-By: PHP/7.4`、`Server: nginx/1.18` |
| Cookie | `PHPSESSID`、`JSESSIONID`、`laravel_session` |
| 页面源码 | 生成器 meta、js/css 路径、版权字符串 |
| 独特 URL | `/wp-content/`、`/index.php?m=admin` |

> [!tip]
> 指纹结果按"框架 + 版本"归档，再去某一处版本库批量查 CVE；版本号缺失时用手法差异（报错页面、JS 特征）缩小范围。

### [finger-cve] 指纹到 CVE 的检索链路 | medium | CVE;指纹 | -
> 拿到组件与版本号后，把公开漏洞情报翻译成可执行的利用候选。

```txt
检索源优先级：
1. NVD / CVE 官网：cve.mitre.org 按 CPE 精确匹配
2. Exploit-DB：exploit-db.com 按组件名搜索，看现成 PoC
3. GitHub：搜 "组件名 CVE 版本" 找 POC 仓库
4. 搜索引擎：组件名 + 版本 + 漏洞/遍历/未授权
5. 厂商公告页：官方安全通告最权威，先看这个
```

```txt
检索套路：
"组件 版本 CVE"
"组件 版本 漏洞"
"组件 版本 未授权"
"组件 版本 RCE POC"
site:github.com 组件 版本 exploit
```

> [!warn]
> 版本号对不上就缩小范围当"同类家族"查，别硬套不同版本的利用链；下载他人 PoC 先读代码确认无恶意载荷，再在自己的隔离环境复现。

### [finger-default] 框架默认路径与常见面板 | easy | 指纹;默认路径 | -
> 指纹一确认，直接探测该组件自带的默认入口与管理面板。

| 组件 | 默认路径 |
| --- | --- |
| Adminer | /adminer.php、/adminer/ |
| phpMyAdmin | /phpmyadmin/、/pma/ |
| Spring Boot | /actuator、/actuator/env、/actuator/heapdump |
| Swagger | /swagger-ui.html、/v3/api-docs、/swagger/index.html |
| ThinkPHP | /index.php?s=/index/\think\app/invokefunction |
| Laravel | /_ignition/execute-solution |
| phpinfo | /phpinfo.php、/info.php、/test.php |
| Webmin | :10000 |
| Zabbix | /zabbix/ |
| Grafana | /login（常见默认口令 admin/admin） |

```bash
# 指纹确认后批量探测默认路径
for p in /adminer.php /phpmyadmin/ /actuator /swagger-ui.html; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://example.com$p")
  echo "$p -> $code"
done
```

> [!danger]
> Spring Boot actuator 的 `/actuator/heapdump` 能直接下载堆内存，含大量环境变量与密钥——这是高危信息泄露点，发现即记录，验证后立即收手并上报。

## [g-js] JS 与接口提取——前端代码里藏着后端的地图

### [js-extract] 页面 JS 抓取与分析 | medium | JS分析;接口提取 | -
> 把页面引用的 JS 全部拉下来，从源码里搜接口、密钥、硬编码逻辑。

```bash
# 抓取页面并提取 JS 引用
curl -s http://example.com | grep -oP 'src="\K[^"]+\.js' | sort -u > js-list.txt

# 批量下载
while read -r u; do curl -s "http://example.com$u" -o "$(basename $u)"; done < js-list.txt

# 解混淆
npx js-beautify app.js > app.beauty.js
```

```bash
# 正则搜敏感信息
grep -rniE 'api[_-]?key|api[_-]?secret|token|password|access[_-]?key' *.js
grep -rniE 'sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}' *.js
grep -rnoE '"/api/[^"]+"' *.js | sort -u
```

> [!tip]
> 别只抓首屏 JS：登录后才能看到的页面、子域名下不同端的 JS（管理端、移动端、小程序包）往往藏着更多接口。
> 遇到压缩/混淆的 JS 优先做 beautify，再按字符串与调用链人工或工具解混淆。

### [js-burp-api] Burp 被动抓包与接口清单 | medium | 抓包;接口 | -
> 让 Burp 在正常浏览过程中被动收录所有 JS 与 XHR，形成完整接口地图。

```txt
流程：
1. Burp 挂代理，浏览器走代理正常浏览全站功能
2. Target -> Site map 展开目标，看全部请求记录
3. 过滤 js/css/image 后缀，剩下 XHR 即 API 列表
4. 对每个 API 记录：方法、路径、参数、返回结构
5. 重点关注：/api/、/admin/、/internal/、/debug/ 前缀
```

```bash
# 把 Burp 导出的需求直接交给命令行工具
# 导出 Sitemap -> 正则抠接口
grep -oP '"/[a-z0-9_/-]+"' exported.txt | sort -u
```

> [!warn]
> 被动收集阶段只做浏览与记录，不主动改包重放；未授权接口清单整理好后再统一进测试阶段逐条验证。

### [js-sourcemap] Source Map 还原与 JSFinder | medium | JS分析;SourceMap | -
> 生产包若残留 source map，可以直接还原近乎完整的原始源码；JSFinder 负责自动化提取域名与接口。

```bash
# 探测 source map（webpack 打包产物常见）
curl -s http://example.com/app.js | grep -i 'sourceMappingURL'
# 常见路径：
#   app.js.map  / static/js/main.xxxx.js.map

# 用工具批量还原
npx source-map-explorer app.js
# 或直接解析 map 文件：{"sources":[...]} 里就是原始文件列表
```

```bash
# JSFinder：爬取目标页面与关联 JS，提取子域名与 URL
python JSFinder.py -u http://example.com
python JSFinder.py -u http://example.com -d    # 深度爬取
```

> [!tip]
> source map 还原后优先看：加密/签名逻辑、鉴权中间件、隐藏路由表、写死的内网地址——这些是比接口本身更值钱的情报。

## [g-flow] 资产整理与攻击面——把收集结果变成一份能动手的地图

### [flow-checklist] 信息收集 10 分钟清单 | easy | 流程;checklist | -
> 面对全新目标时按序过一遍，保证不漏大类、不重复劳动。

- [ ] 被动收集：Google dork、GitHub、备案、证书透明度（2 分钟）
- [ ] 子域名：subfinder + 泛解析识别 + dnsx 存活验证（2 分钟）
- [ ] 端口：全端口 nmap + 常用端口服务对照（2 分钟）
- [ ] 目录：robots/sitemap + 目录扫描 + 备份与 .git 探测（2 分钟）
- [ ] 指纹：whatweb/wappalyzer + 默认路径探测（1 分钟）
- [ ] JS 与接口：页面 JS 抓取 + 接口清单 + source map（1 分钟）
- [ ] 汇总：按子域分组的资产表 + 候选入口清单

> [!tip]
> 前 10 分钟追求"广度优先"，把每个大类都过一遍拿到骨架，再挑最可疑的 2-3 个入口做深度测试；别在单个目标上死磕。

### [recon-flow] 攻击面决策树 | medium | 攻击面;决策 | -
> 从收集结果到选定入口的判断逻辑，按资产类型分流测试路径。

```txt
目标资产
├── 开放 Web 服务（80/443/8080）
│   ├── CMS/框架指纹明确 ──> 查版本 CVE + 默认路径 + 后台弱口令
│   ├── 自研业务系统 ──> JS 提取 API + 越权/注入测试
│   ├── 管理面板（phpmyadmin/actuator/swagger）──> 直接验证未授权
│   └── 备份/源码泄露 ──> 拉源码做白盒审计
├── 只开放非 Web 端口
│   ├── 数据库(3306/6379/27017) ──> 未授权/弱口令探测
│   ├── SSH/RDP ──> 弱口令（有授权前提下）
│   └── 中间件管理口(9200/8888/7001) ──> 未授权/默认口令
├── CDN 后资产 ──> 找真实 IP：历史 DNS、证书日志、邮件头、子域直连
└── 无直接入口 ──> 回到枚举：更多子域/旁站/历史页面/移动端 JS
```

> [!tip]
> 决策树的核心是"先易后难"：默认口令、未授权、源码泄露这类低门槛入口永远排在前面，爆破与越权这类高成本路径放后面。
> 每个候选入口写一行标注"为什么选它"（指纹/端口/泄露源），方便复盘取证。