## [encode] 编码转换一行命令——离线环境下最快的编码解码方式。
### [enc-base64] Base64 编解码 | easy | 编码;base64;命令 | base64解码;base64 命令
> base64 编码/解码的每平台速查

#### 这个条目的作用
拿到一段「看着像乱码、其实全是字母数字和 +/」的字符串时，10 秒内确认是不是 base64 并解出来；反过来需要把一句话/一个文件编码成 base64 时也有现成命令。CTF 里 base64 是最常见的编码层，经常嵌套在其他编码外面。

#### 前置条件
- Linux：自带 `base64`（GNU coreutils），无需安装。
- Windows：没有 `base64` 命令，用 `python3` 或 PowerShell。
- 至少会用 `echo` 管道。

#### 第 1 步：识别特征
先肉眼看字符集，全部满足才是 base64：
1. 只含 `A-Z a-z 0-9 + /`，可能出现结尾的 `=` 或 `==`（填充符）。
2. 长度通常是 4 的倍数（去掉 `=` 后也可能不是，但带填充时一定是）。
3. 常见前缀线索：`eyJ`（JWT 头）、`PD9waHA`（`<?php` 的 base64）、`TVqQ`（Windows EXE 开头）。

> [!warn] 像 `aGVsbG8gd29ybGQ=` 这种全是可读字母但读不懂的，大概率就是 base64，别当乱码丢掉。

#### 第 2 步：解码字符串（Linux）
```bash
# 注意：echo 默认带换行，base64 解码时会忽略换行，但保险起见先去掉空白
echo 'aGVsbG8=' | base64 -d
echo 'aGVsbG8=' | base64 -d; echo    # 输出后补一个换行，方便看结果

# 密文里可能混了换行/空格（比如从文件粘出来的），先清理再解
echo 'aGVs bG8=' | tr -d ' \n' | base64 -d
```
预期结果：输出 `hello`。如果报错 `invalid input`，说明字符集不对或混入了非法字符，回到第 1 步检查。

#### 第 3 步：编码字符串
```bash
# 一定要加 -n，否则会把换行也编码进去
echo -n 'hello' | base64        # 输出 aGVsbG8=
echo 'hello' | base64           # 输出 aGVsbG8K（多了一个换行，比赛里会被判错）
```
> [!danger] 编码结果末尾多出 `Cg==`（即一个 `\n`）是最常见的失误。需要精确结果时一律 `echo -n`。

#### 第 4 步：文件级编解码
```bash
# 文件 -> base64（常用于把二进制/图片塞进 payload）
base64 flag.php > flag.b64

# base64 -> 文件（从题目拿到的 b64 文件还原）
base64 -d flag.b64 > flag.php
file flag.php    # 确认还原出来的类型
```

#### 第 5 步：Windows / 无 base64 命令时
```bash
# Python（最通用）
python3 -c "import base64;print(base64.b64decode('aGVsbG8=').decode())"
python3 -c "import base64;print(base64.b64encode(b'hello').decode())"
```
```powershell
# PowerShell 原生
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('aGVsbG8='))
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('hello'))
```

#### 第 6 步：URL 安全版（JWT / 文件名场景）
标准 base64 里的 `+` `/` 在 URL 里是特殊字符，此时用 `-` `_` 替代，且常去掉 `=`：
```bash
# 编码成 URL 安全版
echo -n 'hello' | base64 | tr '+/' '-_' | tr -d '='

# 解码 URL 安全版（JWT 的 Payload 段）
echo 'aGVsbG8' | tr '_-' '+/' | base64 -d 2>/dev/null
```

#### 第 7 步：多层 base64（嵌套）
题目常见「加密了 N 次」。手动解太慢，用循环：
```bash
s='Vm0wd2QyVXl...'   # 替换成你的整段密文
while echo "$s" | base64 -d > /dev/null 2>&1; do
  s=$(echo "$s" | base64 -d); echo "$s" | head -c 60; echo
done
```
解开到哪一层不再像 base64，就停在那层换别的编码继续。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `invalid input` 报错 | 混入空格/换行/非法字符 | `tr -d ' \n'` 清理后再解；`=` 只能出现在结尾 |
| 解出来是乱码 | 内容本身是二进制/图片，或还有第二层编码 | 用 `xxd` 看十六进制；继续解第二层 |
| 编码结果比预期长 | `echo` 没加 `-n`，把换行编进去了 | 改用 `echo -n` 或 `printf %s 'text' \| base64` |
| 解码后是 `b'...'` 带引号 | 在 Python 里直接 print bytes | 加 `.decode()` |
| 末尾 `=` 数量不对 | 截断过或复制丢失 | 按长度补 `=`：长度 mod 4 为 2 补 `==`，为 3 补 `=` |

#### 实战要点
- 识别口诀：**结尾 `=`/`==` + 只含 A-Za-z0-9+/ = base64**，直接 `base64 -d`。
- PHP 一句话马的 base64 前缀是 `PD9waHA`，在题目里搜到这个基本就是 webshell。
- 嵌套解码时从最外层开始：`while` 循环解码比手动快一个数量级。
- `tr '+/' '-_'` 是 base64 ↔ base64url 互转的唯一区别，JWT 场景必用。
- 解完发现是 `\x` 十六进制转义，用 enc-hex 的命令继续。

### [enc-hex] Hex / 二进制编解码 | easy | 编码;hex;二进制 | hex解码;xxd;二进制转字符串
> 十六进制与二进制文本互转

#### 这个条目的作用
把一串 `6861636b` 还原成 `hack`，或把文本转成十六进制观察原始字节。hex 是 CTF 里第二常见的编码（仅次于 base64），也常用于看二进制文件内容、找 flag 的隐藏字节。

#### 前置条件
- Linux：`xxd`（vim 自带，绝大多数发行版都有）、`od`（coreutils 自带）。
- 任意系统有 `python3` 即可；Windows 没 `xxd` 时用 Python。
- 无需 root。

#### 第 1 步：识别特征
1. 只含 `0-9 a-f`（大小写均可），且**字符数为偶数**（一个字节 = 两个 hex 字符）。
2. 可能出现 `0x` 前缀（`0x6861636b`）或每字节空格分隔（`68 61 63 6b`）。
3. 全是 `0/1` 且长度为 8 的倍数 → 是二进制，不是 hex。

> [!tip] 偶数字符是硬指标：`616263`（3 字节）像 hex；`abc`（3 字符且含非 hex 字母）不是。

#### 第 2 步：字符串转 hex
```bash
echo -n 'hack' | xxd -p          # 输出 6861636b
echo -n 'hack' | od -A n -t x1 | tr -d ' \n'   # xxd 不可用时
```

#### 第 3 步：hex 转字符串（核心）
```bash
# 密文 -> 原文
printf '6861636b' | xxd -r -p    # 输出 hack
echo '6861636b' | xxd -r -p      # echo 的换行不影响结果

# 带空格分隔的版本也能直接还原
echo '68 61 63 6b' | xxd -r -p
```
预期结果：输出 `hack`。若输出乱码，说明它不是纯文本（可能是图片/压缩包开头），用 `xxd` 直接看字节更合适。

#### 第 4 步：处理 0x 前缀 / 混入的杂质
```bash
# 去掉 0x 前缀和空格后再还原（别用 tr -d '0x'，会把真正的 0 和 x 也删掉）
echo '0x68 0x61 0x63 0x6b' | sed 's/0x//g; s/ //g' | xxd -r -p
```

#### 第 5 步：二进制（0/1）互转
```bash
# 二进制 -> 文本
printf '01101000 01100001 01100011 01101011' | tr -d ' ' | perl -pe 's/([01]{8})/chr(oct("0b$1"))/ge'

# 二进制 -> 文本（python 一条龙）
python3 -c "print(int('0110100001100001',2).to_bytes(4,'big'))"   # b'ha'（2 字节）
```

#### 第 6 步：Python 通用法（Windows / 复杂场景）
```bash
# hex -> 文本
python3 -c "print(bytes.fromhex('6861636b').decode())"

# 文本 -> hex
python3 -c "print('hack'.encode().hex())"

# 二进制 -> 文本（字节数按 len(s)//8 算）
python3 -c "s='01101000011000010110001101101011';print(int(s,2).to_bytes(len(s)//8,'big').decode())"
```

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `xxd -r` 报错或输出错乱 | 奇数个字符 / 混入非 hex 字符 | 先 `tr -d ' \n'` 清理，确认长度是偶数 |
| 输出是一堆乱码 | 内容不是文本（图片/压缩包/ELF） | `xxd -r -p x.b64 > f; file f` 看真实类型 |
| 结果前后颠倒 | 数据是小端序存储 | 按 2 字节一组翻转，或换 `int(...,16)` 思路 |
| `0x` 没删干净导致还原失败 | `tr -d '0x'` 误删了数据里的 0/x | 用 `sed 's/0x//g'` |
| 全是 0/1 但解不出来 | 没按 8 位一组拆 | 先确认 `len%8==0`，再按第 5 步解 |

#### 实战要点
- 口诀：**纯 0-9a-f + 偶数长度 = hex**，`xxd -r -p` 一行还原。
- 十六进制字符串肉眼难读，先 `xxd -r -p > out` 再用 `file out` 判断类型，比盲猜快。
- hex 后常跟 base64 或反过来嵌套，解完一层看结果字符集再决定下一层。
- 遇到 `0x` 前缀统一先 `sed 's/0x//g'` 清洗，别用会误删数据的 `tr -d`。
- `od -A n -t x1` 是 `xxd -p` 的等价替代，脚本环境两个都备着。

### [enc-url] URL 编解码 | easy | 编码;URL编码;urlencode | url解码;percent编码
> URL 百分号编码互转

#### 这个条目的作用
把 URL 里不能直接出现的字符（空格、引号、`<>`、中文、`#` 等）转成 `%xx` 形式，或反过来还原。打 SQL 注入、XSS、路径穿越时 payload 都要经过 URL 编码，且经常需要「双重编码」绕过服务端的一次解码。

#### 前置条件
- 任意系统有 `python3`（标准库 `urllib.parse`，无需 pip）。
- 或者用 Burp Suite 的 Decoder / 浏览器 DevTools（见第 5 步）。

#### 第 1 步：识别特征
1. 出现 `%` 后跟**两位十六进制**（如 `%20` = 空格、`%3c` = `<`、`%00` = 空字节）。
2. 中文/emoji 会变成 `%E4%BD%A0` 这种 3 字节一组的长串（UTF-8）。
3. 注意区分：`+` 在表单提交里也代表空格（application/x-www-form-urlencoded）。

> [!tip] 一眼确认：字符串里只有 `%xx` 一种「乱码」形态且字母数字完好 → URL 编码。

#### 第 2 步：解码（最常用）
```bash
python3 -c "import urllib.parse;print(urllib.parse.unquote('a%20b%3cc'))"
# 输出：a b<c
```
预期结果：`%20` 变空格、`%3c` 变 `<`。如果有 `+` 也想当空格解，改用 `unquote_plus`。

#### 第 3 步：编码
```bash
# 全部编码（连字母数字也编，适合构造参数）
python3 -c "import urllib.parse;print(urllib.parse.quote('a b<c', safe=''))"

# 只编码特殊字符（保留字母数字和 /，日常最常用）
python3 -c "import urllib.parse;print(urllib.parse.quote('a b<c'))"
# 输出：a%20b%3Cc
```

#### 第 4 步：双重编码（绕过一层解码）
服务端先 `urldecode` 一次再拼接时，payload 要编两次，让服务端解完还剩一层编码：
```bash
python3 -c "import urllib.parse;print(urllib.parse.quote(urllib.parse.quote('../../etc/passwd', safe=''), safe=''))"
# 输出：..%252F..%252Fetc%252Fpasswd   （%25 就是 % 再编码一次的结果）
```
> [!warn] 双重编码后每个 `%` 都变成 `%25`。如果目标还会再解一次，就用三层，原理相同。

#### 第 5 步：+ 号版本（表单数据）
POST 表单和 `?a=x+y` 查询串里 `+` 表示空格：
```bash
# 编码成 + 形式
python3 -c "import urllib.parse;print(urllib.parse.quote_plus('a b<c'))"   # a+b%3Cc

# 解码 + 形式
python3 -c "import urllib.parse;print(urllib.parse.unquote_plus('a+b%3Cc'))"  # a b<c
```

#### 第 6 步：浏览器 / Burp 快速操作
- Burp Suite → Decoder 面板：粘贴密文，选 URL → Decode；要编码选 Encode。支持一次全选批量解。
- Chrome DevTools Console：`decodeURIComponent('a%20b')` / `encodeURIComponent('a b')`。
- 嵌套编码在 Console 里循环解，直到不再出现 `%`。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 中文解出来是乱码 | 编码/解码时没按 UTF-8 | 确认终端 UTF-8；`quote` 默认就是 UTF-8 |
| 解一层后还有 `%xx` | 双重/多层编码 | 循环解：`while '%' in s: s=urllib.parse.unquote(s)` |
| `+` 没变成空格 | 用了 `unquote` 而不是 `unquote_plus` | 表单场景改用 `unquote_plus` |
| 编码结果 `%` 不见了 | 粘贴进浏览器时被自动解码了一次 | 抓包确认实际发送内容，必要时再编码一次 |
| `%00` 截断无效 | 目标语言/中间件不认空字节 | 换 `%0a`（换行）或先测服务端是否过滤 |

#### 实战要点
- 识别口诀：**`%` + 两位 hex = URL 编码**，`unquote` 一行还原。
- 路径穿越用双重编码 `%252e%252e%252f`，比单层通过率高（服务端常解一次）。
- Burp Decoder 支持全选一键解码，嵌套 payload 用它比命令行快。
- 打 POST 表单时注意空格是 `+` 不是 `%20`，两种编码混用会被判错。
- SQL 注入里 `'` 的 URL 编码是 `%27`、空格 `%20`，构造请求时先编码再发包。

### [enc-rot] ROT / 凯撒编解码 | easy | 编码;ro13;凯撒 | rot13;凯撒密码;caesar
> ROT13 与凯撒位移的一行命令

#### 这个条目的作用
处理「字母被平移了 N 位」的密文：ROT13（位移 13，最常用）和任意位移的凯撒密码。这类密文肉眼特征是**字母形态完整、像英文但读不懂**，数字和符号原样保留。

#### 前置条件
- Linux：`tr`（coreutils 自带）。
- 任意系统有 `python3`（`codecs` 标准库支持 rot13）。
- 会判断「字母是否可读」。

#### 第 1 步：识别特征
1. 密文几乎全是字母，大小写形态正常，但拼不出单词 → 凯撒/ROT。
2. 数字、标点、空格位置看起来没变（凯撒只动字母）。
3. 试一下 ROT13：**`rot13(rot13(x)) == x`**，解一次不解再解一次，两次互相还原是 ROT13 的铁证。

> [!tip] 常用语料特征：`uryyb` = hello、`synt` = flag（ROT13 后的 flag）。看到 `synt` 直接 rot13 就是 `flag`。

#### 第 2 步：ROT13 解码（Linux 一行）
```bash
echo 'uryyb' | tr 'A-Za-z' 'N-ZA-Mn-za-m'     # 输出 hello
printf 'synt{abc}' | tr 'A-Za-z' 'N-ZA-Mn-za-m'   # 输出 flag{nop}
```
`tr` 表规则：第一组 `A-Za-z` 是输入范围，第二组 `N-ZA-Mn-za-m` 是把字母整体平移 13 位后的对应表。ROT13 编码和解码是**同一条命令**。

#### 第 3 步：任意位移（凯撒）
构造平移 N 位的 tr 表：第二组 = 字母表从第 N 位开始绕回。位移 3（ROT3）就是把 `A-Z` 映射到 `D-ZA-C`：
```bash
# ROT3 解码：khoor -> hello
printf 'khoor' | tr 'A-Za-z' 'D-ZA-Cd-za-c'

# ROT7 解码：表换成 H-ZA-G 开头
printf 'olssv' | tr 'A-Za-z' 'H-ZA-Gh-za-g'   # 输出 hello
```
规律：`tr 'A-Za-z' '<第N个字母到Z><A到第N-1个字母><小写同理>'`。N=3 就是 `D-ZA-C`，N=7 就是 `H-ZA-G`。

#### 第 4 步：Python 版 ROT13
```bash
python3 -c "import codecs;print(codecs.encode('uryyb','rot13'))"   # hello
python3 -c "import codecs;print(codecs.decode('uryyb','rot13'))"   # hello（等同）
```

#### 第 5 步：不知道位移几时（暴力猜 26 种）
```bash
python3 -c "
s='khoor'
for i in range(26):
    out=''.join(chr((ord(c)-97+i)%26+97) if c.islower() else chr((ord(c)-65+i)%26+65) if c.isupper() else c for c in s)
    print(f'{i:2d}: {out}')
"
```
输出里第 3 行（i=3）就是 `hello`。看到哪一行拼出可读英文，那行的 i 就是位移量。

#### 第 6 步：带数字/符号的混合轮转（进阶）
标准凯撒不动数字，个别题目用全字符集轮转，用 Python 处理任意可打印字符：
```bash
python3 -c "
s='khoor123'
for i in range(95):
    out=''.join(chr(32+(ord(c)-32+i)%95) if 32<=ord(c)<=126 else c for c in s)
    if 'hello' in out: print(i, out)
"
```

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `tr` 没输出/输出原样 | tr 表写错（字母顺序没绕） | 对照：N=13 是 `N-ZA-Mn-za-m`，从第 N 个字母开始 |
| 解出来一半对一半错 | 大小写表分开写错了 | 确认 `A-Za-z` 与 `N-ZA-Mn-za-m` 长度一致（52 对 52） |
| 全解一遍没有可读英文 | 不是凯撒，可能是其他编码 | 用 ROT13 两次还原法确认；不行转 enc-other 特征表 |
| ROT13 解完还是乱码 | 外层还有 base64/hex | 先解外层编码，或继续解第二层 |
| 数字被当成字母处理 | tr 表只写字母时数字原样 | 属正常；数字参与位移才用第 6 步脚本 |

#### 实战要点
- 口诀：**字母形态完整但读不懂 = 凯撒**；`tr 'A-Za-z' 'N-ZA-Mn-za-m'` 秒解 ROT13。
- 看到 `synt`（flag 的 ROT13）、`uryyb`（hello）直接确认。
- ROT13 两次互相还原，用来验证「是不是 ROT13」比试 26 次快。
- 不知道位移量就上第 5 步暴力脚本，3 秒出结果。
- 凯撒经常包在 base64/hex 外层：先解外层编码，解完再判断是否凯撒。

### [enc-other] 其他编码与特征速查 | easy | 编码;html实体;unicode;识别 | html实体解码;unicode编码;常见编码识别
> HTML 实体、Unicode、易混淆编码的识别表

#### 这个条目的作用
base64 / hex / URL / 凯撒都试过还解不出来时，用这张特征表定位剩下的编码：HTML 实体、Unicode、八进制、二进制、JWT，以及「万能解码脚本」一键盲解。CTF 里**识别比解码更重要**——知道是什么编码，解码就是一行的事。

#### 前置条件
- 任意系统有 `python3`（`html`、`binascii` 均为标准库）。
- 拿到密文时保留原始格式（别在编辑器里被自动转义）。

#### 第 1 步：HTML 实体编解码
特征：`&#数字;`（十进制）或 `&#x十六进制;`（十六进制），也可能 `&amp;` `&lt;` 等命名实体。
```bash
# 解码 &#104;&#101;&#108;&#108;&#111; -> hello
python3 -c "import html;print(html.unescape('&#104;&#101;&#108;&#108;&#111;'))"
python3 -c "import html;print(html.unescape('&lt;script&gt;'))"     # <script>

# 编码（把字符转成 &#数字;）
python3 -c "import html;print(''.join('&#%d;'%ord(c) for c in 'hello'))"
```
> [!tip] HTML 实体常出现在：页面源码里被转义的 flag、XSS 题目里被实体化的 payload。看到 `&#` 就是它。

#### 第 2 步：Unicode / 不可见字符排查
怀疑 flag 里藏了零宽字符（`\u200b` 等）或同形异义字时，打印每个字符的码点：
```bash
# 打印文件里所有字符的码点（找不可见字符）
python3 -c "print([hex(ord(c)) for c in open('x.txt',encoding='utf-8').read()])"

# 或直接交互输入
python3 -c "print([hex(ord(c)) for c in input()])"
```
码点里出现 `0x200b`（零宽空格）、`0x200c`、`0xfeff`（BOM）就是藏了不可见内容。

#### 第 3 步：八进制 / 二进制解码
特征：密文由 `0-7` 组成 → 八进制；只见 `0`/`1` → 二进制。
```bash
# 八进制 -> 字符（150 八进制 = 104 十进制 = 'h'）
python3 -c "print(''.join(chr(int(x,8)) for x in '150 145 154 154 157'.split()))"   # hello

# 二进制 -> 字符
python3 -c "s='01101000 01100001 01100011 01101011';print(''.join(chr(int(x,2)) for x in s.split()))"   # hack
```

#### 第 4 步：JWT 识别与解码
特征：三段的 `xxxxx.yyyyy.zzzzz`，第一段以 `eyJ` 开头（`{"` 的 base64url）。
```bash
# 解 Payload 段（第二段），注意 base64url 的 -_ 要还原成 +/
echo 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' | tr '_-' '+/' | base64 -d 2>/dev/null
# 输出：{"alg":"HS256","typ":"JWT"}
```
> [!warn] 缺 `=` 填充时解码会报错，`2>/dev/null` 忽略即可；只要字符集正确，缺填充也能解出内容。

#### 第 5 步：特征识别总表
| 特征 | 编码 | 一行解码 |
|---|---|---|
| `A-Za-z0-9+/` 且 `=` 结尾 | base64 | `base64 -d` |
| 纯 0-9a-f 偶数字符 | hex | `xxd -r -p` |
| `%xx` | URL 编码 | `urllib.parse.unquote` |
| `&#数字;` / `&#x..;` | HTML 实体 | `html.unescape` |
| 只含 `0-7` | 八进制 | `chr(int(x,8))` |
| 只见 `0`/`1` | 二进制 | `chr(int(x,2))` |
| `0x` 前缀 | hex | `sed 's/0x//g' \| xxd -r -p` |
| `eyJ...` 三段式 | JWT（base64url） | `tr '_-' '+/' \| base64 -d` |
| 字母可读但无意义 | ROT13/凯撒 | `tr 'A-Za-z' 'N-ZA-Mn-za-m'` |
| 全角/异体字符混入 | Unicode 混淆 | 第 2 步码点检查 |

#### 第 6 步：万能解码脚本（盲解）
不确定是什么编码时，一键全试：
```bash
python3 - <<'EOF'
import base64, binascii, urllib.parse, html, codecs
s = input("输入待解码串: ")
try: print("base64:", base64.b64decode(s).decode(errors="ignore"))
except: pass
try: print("hex:", bytes.fromhex(s).decode(errors="ignore"))
except: pass
try: print("url:", urllib.parse.unquote(s))
except: pass
try: print("html:", html.unescape(s))
except: pass
try: print("rot13:", codecs.decode(s, "rot13"))
except: pass
EOF
```
哪一行输出可读文本，就用那一种编码继续深入。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 所有解码都失败 | 密文被截断/粘贴时丢了字符 | 回题目复制原始内容，注意隐藏字符 |
| HTML 实体解出来还是乱码 | 实体里嵌了多层编码 | 解完实体再套特征表解下一层 |
| JWT 解码报 invalid input | 缺 `=` 填充或含 `-_` | 先 `tr '_-' '+/'`，报错可忽略（内容已解出） |
| 八进制串带空格解错 | 按整体 int 而不是按字节拆 | 先 `split()` 按空格分组再逐组 `chr(int(x,8))` |
| 表面像 base64 但解不出 | 是 base64url（`-_` 替换了 `+/`） | 先 `tr '_-' '+/'` 再解 |

#### 实战要点
- 解码顺序建议：**base64 → hex → URL → HTML 实体 → 凯撒**，先按特征表对号入座。
- 特征表是第一生产力：`&#` = HTML 实体、`eyJ` = JWT、`0-7` = 八进制，对上了直接解。
- 遇到「解不出来」先怀疑两层嵌套：解一层、看一层、再对特征表。
- 零宽字符/不可见字符用码点检查（第 2 步）是唯一可靠手段，肉眼永远看不出来。
- 万能解码脚本把五种常见编码一次跑完，比赛里省五分钟。
