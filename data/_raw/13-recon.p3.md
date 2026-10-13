## [g-finger] Web 指纹与组件——认出框架版本，CVE 就是现成的弹药

### [finger-default] 框架默认路径与常见面板 | easy | 指纹;默认路径 | -
> 指纹一确认，直接探测该组件自带的默认入口与管理面板。

#### 这个条目的作用
指纹识别只能告诉你"目标用了什么框架"，而默认路径探测是把指纹变成可用入口的关键一步：Adminer、phpMyAdmin、Spring Boot Actuator 这些组件都会在固定路径暴露管理面板、调试接口甚至数据库管理页。一条 curl 就能验证是否有未授权访问，是 CTF 里性价比最高的探测动作之一。

#### 前置条件
- 已确认目标框架指纹（用 whatweb、Wappalyzer、报错页特征、favicon hash 任意一种，参见 g-finger 前几个条目）
- 有目标站点的完整 URL（含协议，如 `http://example.com`），浏览器与 curl 均可访问
- 确认本次测试在授权范围内（CTF 靶场 / 授权 SRC 测试），管理面板弱口令属于攻击行为，切勿在未授权目标上做

#### 第 1 步：确认指纹后再动手
指纹没确认就乱扫默认路径，等于盲猜。先用一行命令确认：
```bash
whatweb http://example.com
# 或看响应头：Server / X-Powered-By / Set-Cookie 都会泄露组件信息
curl -sI http://example.com
```
预期结果：命令行打出框架名（如 `Adminer`、`Spring-Boot`、`Laravel`）。如果指纹不明，先回到指纹识别条目补齐，再继续。

#### 第 2 步：对照默认路径表
指纹确认后，在下表里找到该组件对应的默认路径（本表是 CTF 与 SRC 中最常出现的一批）：

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

ThinkPHP 的默认路径里带反斜杠，在 bash 里必须用单引号包住 URL 防止转义（见第 3 步示例）。

#### 第 3 步：批量探测默认路径
把第 2 步表里该组件相关的路径放进循环，一次批量验证：
```bash
for p in /adminer.php /adminer/ /phpmyadmin/ /pma/ /actuator /actuator/env /swagger-ui.html /phpinfo.php; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://example.com$p")
  echo "$p -> $code"
done
```
ThinkPHP 那一条单测（注意单引号）：
```bash
curl -s -o /dev/null -w "%{http_code}" 'http://example.com/index.php?s=/index/\think\app/invokefunction'
```
预期结果：每个路径打印一个 HTTP 状态码。**200 表示页面存在**，这是最高优先级；302 多半是登录跳转，也值得点开确认；404 则跳过。

#### 第 4 步：区分"存在"与"可未授权访问"
状态码 200 只是第一步，还要看内容：
```bash
# 抓页面标题与关键特征，判断是登录框还是直接暴露的功能
curl -s http://example.com/adminer.php | grep -oiE '<title>[^<]*</title>'
```
- Adminer / phpMyAdmin：出现**登录框** → 记下来，后面弱口令阶段处理；**不需要登录直接可见数据库结构** → 严重未授权，立即停手记录上报
- Spring Boot `/actuator`：返回 JSON 端点列表 → 已是未授权信息泄露；继续看 `/actuator/env` 能否读到环境变量
- Swagger `/swagger-ui.html`：能打开 UI 或 `/v3/api-docs` 返回 JSON → 拿到整套 API 文档

#### 第 5 步：管理面板默认口令（仅授权目标）
Grafana、Zabbix、Webmin 这类面板通常有公开默认口令（Grafana 常见 `admin/admin`）。只在授权测试里尝试，一次失败即放弃，不要爆破。成功登录后记录版本号，去查对应 CVE。

#### 第 6 步：高危泄露点单独记档
遇到 Spring Boot 时把下面这条单独标记出来，这是全条目里最危险的一个点：

> [!danger]
> Spring Boot actuator 的 `/actuator/heapdump` 能直接下载堆内存，含大量环境变量与密钥——这是高危信息泄露点，发现即记录，验证后立即收手并上报。

验证方式：`curl -s -o heapdump.bin -w "%{http_code} %{size_download}" http://example.com/actuator/heapdump`，返回 200 且体积为 MB 级即命中。**不要**对下载的堆做进一步利用，截图记录后上报。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 指纹明确但默认路径全 404 | 组件装在子目录或改了路径 | 换 `/adminer/`、`/vendor/adminer/` 等常见子目录；或看前端 JS / 网页源码里的链接 |
| ThinkPHP 命令报错或 URL 被改写 | 反斜杠被 bash 或代理转义 | 用单引号包 URL；Burp 里发送前检查请求行 |
| `/actuator` 返回 404 但确实有 Spring | Spring Boot 2.x 默认只暴露 health | 试 `/actuator/env`、`/actuator/mappings`、`/actuator/beans`，或加上 `management.endpoints.web.exposure` 特征不看 |
| 状态码 200 但内容是 404 错误页 | 框架自定义了 404 状态码 | 用 `grep` 检查页面标题/正文关键词，不要只信状态码 |

#### 实战要点
- 顺序固定：先指纹、再查表、后探测，探测结果按 200 / 302 / 404 三档归档
- 每发现一个面板记下版本号，版本 = 后续 CVE 检索的输入
- phpMyAdmin / Adminer 的 200 即使只有登录框也价值极高：弱口令、SQL 注入入口、文件包含都可能从这里展开
- Heapdump、未授权 actuator、Swagger 属于"发现即记录、验证即停手"的高危点，CTF 里直接算拿到分，SRC 里走上报流程

## [g-js] JS 与接口提取——前端代码里藏着后端的地图
### [js-extract] 页面 JS 抓取与分析 | medium | JS分析;接口提取 | -
> 把页面引用的 JS 全部拉下来，从源码里搜接口、密钥、硬编码逻辑。

#### 这个条目的作用
现代网站的前端 JS 是攻击面的"藏宝图"：API 路径、加密/签名逻辑、写死的密钥、隐藏路由都编译在脚本里。把页面引用的 JS 全部拉下来并做静态搜索，往往比目录扫描更快找到真实接口——因为 JS 里的地址是前端真正在调用的，几乎不会有假目标。

#### 前置条件
- 能通过 curl 或浏览器访问目标
- 本机有 curl、grep（GNU 版，支持 `-P` 正则）、node/npx（用于美化压缩 JS）
- 授权范围确认（JS 分析属被动信息收集，但后续调用发现的接口要遵守授权边界）

#### 第 1 步：抓页面，提取 JS 引用列表
主页是入口，先把它引用的所有 `.js` 抓出来：
```bash
curl -s http://example.com | grep -oP 'src="\K[^"]+\.js' | sort -u > js-list.txt
cat js-list.txt
```
预期结果：`js-list.txt` 里每行一个 JS 路径，可能是相对路径（`/static/js/app.js`）也可能是完整 URL。如果列表为空，检查目标是否用了 `src='` 单引号或动态加载，改用浏览器开发者工具 Network 面板手工收集。

#### 第 2 步：批量下载全部 JS
用列表逐个下载，相对路径拼上站点根：
```bash
while read -r u; do
  case "$u" in
    http*) url="$u" ;;
    *) url="http://example.com$u" ;;
  esac
  curl -s "$url" -o "$(basename "$u")"
done < js-list.txt
ls -la *.js
```
预期结果：目录里出现所有 JS 文件，体积从几 KB（压缩后）到上百 KB 不等。

#### 第 3 步：美化压缩代码，让它可读
生产 JS 几乎都是压缩成一行的，先 beautify：
```bash
npx js-beautify app.js > app.beauty.js
```
预期结果：生成缩进良好的 `app.beauty.js`。没有 node 环境就用浏览器：开发者工具 → Sources → 点左下角 `{}` 按钮，效果相同。压缩文件很大时只对重点文件做，别浪费带宽。

#### 第 4 步：正则搜接口路径
接口是最先要找的，重点看 `/api/` 前缀：
```bash
grep -rnoE '"/api/[^"]+"' *.js | sort -u
# 更宽泛：所有看起来像路径的字符串
grep -rnoE '"/[a-zA-Z0-9_/-]+"' *.js | sort -u
```
预期结果：一列接口路径，如 `"/api/user/info"`。**所有搜集到的接口都要与第 1 步的页面 URL 交叉**：能在 JS 里出现的接口，大概率真实存在，直接进入后续测试清单。

#### 第 5 步：正则搜密钥与敏感字符串
硬编码密钥是 JS 分析的高价值产出：
```bash
grep -rniE 'api[_-]?key|api[_-]?secret|token|password|access[_-]?key' *.js
grep -rniE 'sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}' *.js
```
预期结果：命中含 `token`、`secret`、形如 `sk-xxx` 的 OpenAI Key、`AIza...` 的 Google Key 之类的行。找到后**核对上下文**：有些只是变量名不是真密钥；真密钥记录为高危发现。

#### 第 6 步：找请求封装层，重建"接口地图"
接口散落各处，先找封装层再顺着逻辑读。定位特征：`axios.create`、`fetch(`、`baseURL`、`$http`、`request(`：
```bash
grep -rnE 'axios\.create|baseURL|fetch\(' *.js | head -20
```
预期结果：看到统一的 API 前缀（如 `baseURL: '/api/v1'`）与请求函数。从封装层出发，逐个函数追它调的路径、参数、方法（GET/POST），做成接口清单。

#### 第 7 步：别漏登录后页面与不同端
只抓首屏 JS 会漏掉大量接口。补一轮：

> [!tip]
> 别只抓首屏 JS：登录后才能看到的页面、子域名下不同端的 JS（管理端、移动端、小程序包）往往藏着更多接口。

- 登录后再次执行第 1-2 步（后台页面的 JS 通常引用管理接口）
- 子域名逐个来一遍：`admin.example.com`、`api.example.com` 的 JS 各自独立
- 遇到混淆的 JS：先 beautify，再按字符串特征与调用链人工分析

#### 常见错误与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `grep -oP` 报错 "invalid option" | macOS 自带的 BSD grep 不支持 `-P` | 装 GNU grep（`brew install grep`）或用 `grep -oE 'src="[^"]+\.js"'` 后自行去引号 |
| js-list.txt 为空 | 页面用单引号、动态 import 或内联脚本 | 改用浏览器 Network 面板看 JS 请求；或直接 `grep -oE "[^\"']+\.js"` |
| 下载的文件是 HTML | 路径 404 或需要登录 | 看文件头是否为 `<html>`；把 URL 拼对、带上 Cookie 重下 |
| 正则搜不到接口 | 接口路径拼接在变量里 | 先看 baseURL/`concat`/模板字符串，再回第 6 步 |
| 找到的 token 是假的 | 前后端各存一份，前端只是占位 | 对比线上请求实际带的 header，再看后端是否校验 |

#### 实战要点
- 接口优先于密钥：JS 里的接口是真实攻击面，密钥是加分项，两者顺序不要反
- 保存原始文件与 beautify 后各一份，方便后续用 `diff` 或 grep 复查
- 把接口清单按"方法+路径+参数"整理成表格，它就是下一阶段越权/注入测试的输入
- 移动端与小程序端的 JS 往往更不设防，接口命名更直白，是隐藏入口的高发区

### [js-burp-api] Burp 被动抓包与接口清单 | medium | 抓包;接口 | -
> 让 Burp 在正常浏览过程中被动收录所有 JS 与 XHR，形成完整接口地图。

#### 这个条目的作用
JS 静态分析能找到"代码里写的"接口，但真实请求里还有静态分析看不到的内容：登录后动态拼接的路径、分页参数、上传接口、验证码接口。Burp 被动抓包不修改任何数据，只是让浏览器流量经过代理，就能把全站实际发生的请求完整收录成接口清单。

#### 前置条件
- Burp Suite Community 或 Professional 已安装并启动
- 浏览器已配置走 Burp 代理（默认 `127.0.0.1:8080`），且已安装 Burp CA 证书（否则 HTTPS 站点抓不到明文）
- 有目标的登录账号（后台页面往往才是接口富矿），授权范围内测试

#### 第 1 步：确认代理与证书生效
Burp 默认监听 `127.0.0.1:8080`（Proxy → Options 可确认）。浏览器访问 `http://burp` 能看到欢迎页即证书链路正常。用 `http://example.com` 打开，切到 Burp 的 HTTP history，确认请求在实时滚动。

#### 第 2 步：正常浏览全站功能
这一步要点是"演一遍真实用户"而非脚本扫描：

```txt
流程：
1. Burp 挂代理，浏览器走代理正常浏览全站功能
2. Target -> Site map 展开目标，看全部请求记录
3. 过滤 js/css/image 后缀，剩下 XHR 即 API 列表
4. 对每个 API 记录：方法、路径、参数、返回结构
5. 重点关注：/api/、/admin/、/internal/、/debug/ 前缀
```

- 从头页开始：注册/登录 → 个人信息页 → 任意详情页 → 搜索 → 上传 → 退出登录
- 每个页面停留几秒，让懒加载与轮询请求发完
- 管理后台（如有权限）单独完整走一遍

#### 第 3 步：在 Site map 里展开目标
切到 `Target → Site map`，左侧树里展开目标域名（可先 Filter 只显示目标 host）。右侧出现该站点的全部请求记录。这一步不用操作，只是把第 2 步的结果结构化。

#### 第 4 步：过滤静态资源，得到纯 API 列表
在 HTTP history 顶部的 Filter 栏勾选 Hide 掉 `js|css|image|font` 等后缀，或直接按 MIME type 过滤：
```txt
只保留 XHR / Fetch 请求（开发者工具里通常标为 XHR 那类），
或按扩展名过滤后剩下 .json、无后缀、/api/ 开头的请求。
```
预期结果：列表里只剩接口请求，每条都有方法、路径、参数、响应状态。

#### 第 5 步：逐个记录接口，形成清单
对每个接口记四列：**方法 / 路径 / 参数 / 返回结构**。返回结构看响应体：`{"code":0,"data":[...]}` 这类 JSON 说明是业务接口，值得进测试清单；401/403 的接口记下来等鉴权绕过阶段处理。重点关注前缀：

```txt
/api/    业务接口主战场
/admin/  管理功能
/internal/ 内部服务
/debug/  调试接口（几乎必有问题）
```

#### 第 6 步：导出 Sitemap 交给命令行加工
Burp 的 Sitemap 可以全量导出，再用正则抠出接口路径：
```bash
# Burp: Site map -> 目标 -> 右键 -> Export items in this branch -> 存为 exported.txt
grep -oP '"/[a-z0-9_/-]+"' exported.txt | sort -u
```
预期结果：一份去重后的路径列表。与 JS 静态分析得到的清单合并、去重，就是最终接口地图。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| HTTPS 页面显示证书错误 | Burp CA 未安装或未信任 | 浏览器访问 `http://burp` → CA Certificate 下载安装，并在系统/浏览器信任列表启用 |
| history 里没有请求 | 浏览器没走代理，或代理端口不对 | 确认浏览器代理为 `127.0.0.1:8080`；Burp Proxy → Options 核对监听端口 |
| 只有 GET 没有 POST | 浏览不够全，表单没提交 | 回到第 2 步补齐登录、搜索、提交类操作 |
| 请求一大堆但分不清接口 | 没有过滤静态资源 | 用 Filter 隐藏 js/css/image，或按 MIME `json` 过滤 |
| 登录后接口 401 | 会话 Cookie 未带上 | 确认 Burp 的 Cookie jar 生效，浏览器保持登录态再抓 |

> [!warn]
> 被动收集阶段只做浏览与记录，不主动改包重放；未授权接口清单整理好后再统一进测试阶段逐条验证。

#### 实战要点
- 被动阶段铁律：只浏览、不重放、不改包，把验证动作全留到测试阶段
- 轮询/心跳接口噪音大，先标出来，别让它淹没真正的高价值接口
- 与 js-extract 的静态清单互相印证：静态有而抓包没有的接口 = 隐藏功能，优先测
- 管理后台的请求即使返回 403 也要记录，它是后续越权测试的靶子
- 每个接口顺手记下它对应的页面，测试阶段可以直接回放

### [js-sourcemap] Source Map 还原与 JSFinder | medium | JS分析;SourceMap | -
> 生产包若残留 source map，可以直接还原近乎完整的原始源码；JSFinder 负责自动化提取域名与接口。

#### 这个条目的作用
webpack 等打包工具会在生产 JS 尾部留一行 `sourceMappingURL` 指向 `.map` 文件。只要这个文件没删，就等于把**原始源码**白送给你：变量名、注释、目录结构全部还原，加密逻辑、鉴权中间件、隐藏路由一览无余。而 JSFinder 是自动化提取 JS 里的域名与 URL 的利器，两者配合，前端就不再有秘密。

#### 前置条件
- 上一轮已拉下目标的部分 JS（js-extract 的产物），或至少知道 JS 的 URL
- node/npx 可用（source-map-explorer 需要）
- Python3 可用（JSFinder 需要，若用其源码版）

#### 第 1 步：探测 JS 尾部是否有 sourceMappingURL
压缩后的 JS 最后一行是给构建工具看的：
```bash
curl -s http://example.com/app.js | tail -5
# 或直接搜
curl -s http://example.com/app.js | grep -i 'sourceMappingURL'
```
预期结果：出现 `//# sourceMappingURL=app.js.map` 或 `/*# sourceMappingURL=... */` 这类标识。没有输出 = 该文件没带 map，换其他 JS 再试（webpack 产物常见 `static/js/main.xxxx.js.map`）。

#### 第 2 步：拼出 map 文件的实际地址
sourceMappingURL 里的路径是相对当前 JS 的：
```bash
# 若 JS 在 http://example.com/static/js/main.ab12cd.js
# map 大概率在：http://example.com/static/js/main.ab12cd.js.map
curl -s -o /dev/null -w "%{http_code}\n" http://example.com/static/js/main.ab12cd.js.map
```
预期结果：返回 200 且 Content-Type 是 JSON → map 存在，继续第 3 步。404 就换文件名变体试（`main.js.map`、去掉 hash 的版本）。

#### 第 3 步：列出 map 里的原始文件清单
map 的 `sources` 数组就是构建前的源码路径：
```bash
curl -s http://example.com/static/js/main.ab12cd.js.map | jq -r '.sources[]' > sources.txt
wc -l sources.txt && head -20 sources.txt
```
预期结果：列出 `./src/App.js`、`webpack://src/api/request.js` 之类的原始路径。数量从几个到几百个不等，越多越值钱。

#### 第 4 步：下载源码文件
sources 里的路径以 map 所在目录为基准（`webpack://` 前缀需手动去掉）：
```bash
mkdir -p src && cd src
while read -r s; do
  f="${s#webpack://}"           # 去掉虚拟协议前缀
  f="${f#./}"                   # 去掉相对路径前缀
  curl -s "http://example.com/static/js/$f" -o "$(basename "$f")"
done < ../sources.txt
ls src/
```
预期结果：目录里出现还原出的源文件。部分路径（`webpack://`）下载不到属正常现象，能拿到 `src/` 下的业务代码就是大头。

#### 第 5 步：用 source-map-explorer 看体积分布
先整体看一次，找出大头文件：
```bash
npx source-map-explorer app.js
```
预期结果：生成一个 HTML 报告，按源码文件显示体积占比。重点不是看体积，而是确认**哪些源文件被还原出来**——业务目录（`src/`）出现即成功。

#### 第 6 步：JSFinder 自动化提取域名与接口
没有 JSFinder 就手动查也行，有它就快得多。先下载工具（`https://github.com/Threezh1/JSFinder`，或直接用自己的脚本）：
```bash
git clone https://github.com/Threezh1/JSFinder.git && cd JSFinder
python JSFinder.py -u http://example.com
python JSFinder.py -u http://example.com -d    # 深度爬取，跟着页面里的链接继续抓
```
预期结果：输出该站点 JS 里出现的子域名、URL、接口路径。收集后与第 4 步的还原源码交叉验证。

#### 第 7 步：优先阅读还原出的"高价值源码"
不是所有源码都值得读，按这个顺序看：

> [!tip]
> source map 还原后优先看：加密/签名逻辑、鉴权中间件、隐藏路由表、写死的内网地址——这些是比接口本身更值钱的情报。

- `src/api/`、`src/utils/request.js`：接口封装与拦截器，含 token 处理逻辑
- `src/router/`：路由表里藏着没在页面出现的隐藏页面
- 任何含 `decrypt`、`sign`、`aes`、`rsa` 关键字的文件：前端加密逻辑，后续改包测试的钥匙
- 含 `10.x.x.x`、`192.168.x.x`、`172.x.x.x` 内网地址的文件：内网拓扑线索

#### 常见错误与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 找不到 sourceMappingURL | 构建时关了 source map，或 map 被单独上传到其他主机 | 换 JS 再探测；部分站点 map 在 `cdn.example.com` 上，源码仓库里也可能残留 `.map` 文件 |
| map 返回 200 但是 HTML | 路径 404 被框架兜底成 200 | 看响应体开头是不是 `{`，是 JSON 才是真 map |
| jq 报错 parse error | 下载的不是合法 JSON | 先 `head -c 200` 看内容；若被 gzip 压缩需 `curl --compressed` |
| sources 里全是 webpack:// 路径 | map 用了默认输出格式 | 去掉 `webpack://` 前缀再拼 URL，或放弃自动下载改用 source-map-explorer 查看源码内容 |
| JSFinder 报 python 依赖错误 | 缺 requests | `pip install requests` 后再跑 |

#### 实战要点
- map 文件通常和 JS 同名同目录，`main.xxx.js` → `main.xxx.js.map`，先试这个组合
- 还原出的源码里，加密/签名函数是最高价值：理解了它就能构造合法请求体
- 隐藏路由表 = 隐藏功能列表，找到后逐个访问，未授权功能常藏在这里
- 前端源码泄漏在 SRC 中通常是低危，但它提供的接口与逻辑能让后续测试命中率翻倍
- 别忘了对比 `.map` 里和线上实际的接口差异：源码里有而线上没有 = 下架接口，历史漏洞高发区

## [g-flow] 资产整理与攻击面——把收集结果变成一份能动手的地图

### [flow-checklist] 信息收集 10 分钟清单 | easy | 流程;checklist | -
> 面对全新目标时按序过一遍，保证不漏大类、不重复劳动。

#### 这个条目的作用
信息收集最容易犯的错是"在单点上死磕"：子域名扫到一半去挖目录，挖到一半又回头搞指纹，10 分钟过去啥都没收全。这条清单把收集过程切成 7 个大类，每个类固定预算时间，按序过完，保证拿到完整骨架，再决定深挖哪里。

#### 前置条件
- 目标域名或 IP 已确认
- 本机已装：subfinder、dnsx、nmap、whatweb/wappalyzer、curl（清单时间小时钟）；没有就先跳过该步，用浏览器手工替代
- 明确授权边界（SRC 测试仅限授权资产）

#### 第 1 步：被动收集（2 分钟）
不碰目标服务器，只看公开数据：Google dork（`site:example.com`）、GitHub 搜索（`example.com password`）、ICP 备案查询、证书透明度（`crt.sh`）。这条的价值是拿到**域名列表与真实 IP 线索**，为第 2 步准备输入。

#### 第 2 步：子域名枚举（2 分钟）
```bash
subfinder -d example.com -silent > subs.txt
# 泛解析识别：随便解析一个不存在的子域，若返回 IP 说明存在泛解析，结果要剔除假子域
dig random-nonexist.example.com +short
# 存活验证
cat subs.txt | dnsx -silent | tee live-subs.txt
```
预期结果：`live-subs.txt` 里是真实存活的子域名列表。有泛解析就用 `dnsx -resp` 对比 IP 过滤。

#### 第 3 步：端口扫描（2 分钟）
```bash
nmap -T4 -sV -p- open ports  # 全端口太慢时退而求其次
```
实际用：先全端口扫高频段，再对开放端口做服务识别：
```bash
nmap -T4 -p- --min-rate 2000 target -oN ports.txt
nmap -sV -p 22,80,443,3306,6379,8080,8888,9200,27017 target
```
预期结果：端口+服务+版本清单。对照常用端口服务表（3306=MySQL、6379=Redis、9200=Elasticsearch、27017=MongoDB）标记高危服务。

#### 第 4 步：目录与备份探测（2 分钟）
```bash
curl -s http://example.com/robots.txt
curl -s http://example.com/sitemap.xml
# 备份与源码泄露探测
for f in /www.zip /backup.zip /web.zip /.git/config /index.php.bak /www.tar.gz; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://example.com$f"); echo "$f -> $code"
done
```
预期结果：robots/sitemap 给出官方认可的入口，备份与 `.git` 是源码泄露的快速探针。`/.git/config` 返回 200 是最严重的发现之一。

#### 第 5 步：指纹识别（1 分钟）
```bash
whatweb http://example.com | head -20
```
预期结果：框架/中间件/版本（如 `nginx` + `PHP 7.4` + `ThinkPHP 5`）。有了版本就回 g-finger 查 CVE 与默认路径。

#### 第 6 步：JS 与接口（1 分钟）
快速跑一遍 js-extract 的核心命令，或直接用浏览器 F12 → Network 看 XHR：
```bash
curl -s http://example.com | grep -oP 'src="\K[^"]+\.js' | sort -u
```
预期结果：一份接口/JS 粗清单。这一步只求"知道有哪些"，精读留给挑选入口之后。

#### 第 7 步：汇总成资产表（1 分钟）
把前面所有结果按子域分组，落成表格：子域 | IP | 端口 | 指纹 | 发现面板/接口 | 候选入口。这份表就是后续所有测试的地图。

```txt
示例资产表（按子域分组）：
| 子域 | IP | 端口 | 指纹 | 候选入口 |
| --- | --- | --- | --- | --- |
| www   | 1.2.3.4 | 80,443 | nginx+PHP+ThinkPHP | /index.php?s=... RCE 链 |
| api    | 1.2.3.4 | 443 | 自研 Node | /api/user/info 越权候选 |
| admin  | 1.2.3.5 | 443 | Spring Boot | /actuator 未授权候选 |
```

> [!tip]
> 前 10 分钟追求"广度优先"，把每个大类都过一遍拿到骨架，再挑最可疑的 2-3 个入口做深度测试；别在单个目标上死磕。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 子域名列表里有大量假目标 | 泛解析 | dig 随机子域确认，加 `-resp` 对比 IP，剔除与主域同 IP 的随机结果 |
| 一个类别超时 | 想把它做到完美 | 设闹钟硬切：每类到点就停，进入下一类 |
| 目录扫描请求过多被 WAF 拦 | 并发太高 | 降速（如 `ffuf -rate 10`），或先做被动收集、扫描放最后 |
| 资产表互相矛盾（同 IP 标了两个指纹） | 端口对应不同服务 | 按域名+端口分开记录，指纹跟着"域名:端口"走 |
| 10 分钟到但汇总没写完 | 前面某类超时 | 先写"发现什么"，细节回填；表格骨架永远优先 |

#### 实战要点
- 每类如果 1 分钟内没产出，记录"未发现"后直接跳过，不恋战
- 候选入口永远列 2-3 个，不要只赌一个方向
- 被动收集永远排最前：不触网就拿到域名与线索，是最安全的起步
- 备份文件与 `.git` 只要状态码可疑就立刻验证内容，这类泄露一次就能定胜负
- 清单是"广撒网"工具，深挖交给 recon-flow 决策树选出的入口

### [recon-flow] 攻击面决策树 | medium | 攻击面;决策 | -
> 从收集结果到选定入口的判断逻辑，按资产类型分流测试路径。

#### 这个条目的作用
信息收集的终点是一堆数据：十几个子域、几十个端口、若干面板与接口。接下来往哪打？决策树把"选入口"变成一套固定的分流逻辑——按资产类型走不同测试路径，并且**永远先打低门槛入口**（默认口令、未授权、源码泄露），把爆破、越权这类高成本路径排在后面。照着树走，就不会拿着情报原地打转。

#### 前置条件
- flow-checklist 的 10 分钟清单已跑完，拥有资产表（子域/IP/端口/指纹）
- 已明确授权范围，决策树选中路径后先确认该资产在授权清单内

#### 第 1 步：先从资产表里挑出"开放 Web 服务"
看资产表中哪些域名/IP 开放了 80/443/8080 等 Web 端口。**绝大多数测试从 Web 入口开始**，因为 Web 攻击面最大、工具最成熟。把非 Web 端口（3306/6379/22 等）单独列一行，等 Web 路径走完再回头处理。

#### 第 2 步：按指纹分流 Web 服务
对每个开放 Web 的目标，用第 1 步的指纹结果走分支：

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

- **指纹明确**（ThinkPHP、Laravel、WordPress）：直接查该版本 CVE，配 finger-default 的默认路径与后台弱口令
- **自研系统**：无现成 CVE 可查，走 js-extract/js-burp-api 提取接口，然后越权与注入
- **管理面板**（phpMyAdmin、actuator、Swagger）：先验证未授权，往往一测一个准
- **备份/源码泄露**（`.git`、www.zip）：别急着打，先拉源码，白盒审计比黑盒快十倍

#### 第 3 步：处理非 Web 端口
Web 路径没收获或想补广度时，看非 Web 端口：
```bash
nmap -sV -p 3306,6379,27017,9200,8888,7001 target
```
- **3306/6379/27017**（MySQL/Redis/MongoDB）：Redis 未授权、MySQL 弱口令是首选
- **9200**（Elasticsearch）：未授权访问可直接拉全库
- **8888**（宝塔）、**7001**（WebLogic）：管理面板/中间件，默认口令与未授权 CVE 高发
- **SSH/RDP**：只在授权前提下做弱口令，且顺序永远排在最后（成本高、动静大）

#### 第 4 步：CDN 后的资产先找真实 IP
目标挂在 CDN 上时，扫到的全是 CDN 节点 IP，无效。先找真实源站 IP：历史 DNS 记录（`securitytrails`、`dnsdumpster`）、证书透明日志（crt.sh 里搜不含 CDN 的证书）、邮件头（`Received` 字段暴露发信服务器 IP）、子域直连（有些子域没上 CDN）。拿到真实 IP 后，绕 CDN 直连测试，同时可以用 `Host` 头重放域名请求。

#### 第 5 步：无直接入口时回到枚举
决策树走到底仍然没有入口的，别在死路上重复：回到信息收集扩面——更多子域、旁站（同 IP 其他站点）、历史页面（`web.archive.org`）、移动端/小程序端 JS。**入口往往不在当前目标上，而在它的"旁边"**。

#### 第 6 步：给每个候选入口写一行"为什么选它"
选好入口后立刻落文档：

```txt
候选入口：
- http://admin.example.com/actuator —— 指纹 Spring Boot，actuator 未授权命中率高（来源：指纹+默认路径表）
- http://api.example.com/api/user/info —— 自研系统 JS 暴露，ID 参数可疑越权（来源：js-extract）
- 端口 6379 —— Redis 未授权特征（来源：nmap 全端口）
```

> [!tip]
> 决策树的核心是"先易后难"：默认口令、未授权、源码泄露这类低门槛入口永远排在前面，爆破与越权这类高成本路径放后面。
> 每个候选入口写一行标注"为什么选它"（指纹/端口/泄露源），方便复盘取证。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 在两个子域之间反复试 | 没有按资产表排序 | 回到资产表按"低门槛优先"排序，一次只测一个入口 |
| 指纹识别失败导致分流不了 | 指纹表没匹配到 | 用响应头、报错页、favicon hash 补指纹；仍不明就按"自研系统"路径走 |
| 扫 CDN IP 全是无效结果 | 目标挂 CDN | 先做第 4 步找真实 IP，别在 CDN 节点上浪费扫描 |
| Redis/数据库端口扫不到 | 云安全组/防火墙只对特定 IP 开放 | 确认本机 IP 是否在放行列表；SRC 里通常这类端口本来就该封闭，记录即可 |
| 深挖一个入口超过 30 分钟无进展 | 路径选错或目标难啃 | 暂停，换决策树另一分支；回头再看"为什么选它"是否站得住 |

#### 实战要点
- 决策树只在**入口选择**阶段用，选定后进入对应技能（指纹→CVE、自研→越权、面板→未授权）执行
- 每条路径的优先级固定：未授权 ≈ 默认口令 > 源码泄露 > 注入/越权 > 爆破
- 自研系统没有 CVE 可查，JS 接口提取就是它的"指纹"，先摸清 API 再动手
- 发现面板/数据库未授权立即记录证据（时间、请求、响应），再决定停手上报或继续
- 复盘时靠第 6 步的"为什么选它"还原测试思路，SRC 提交报告也直接引用