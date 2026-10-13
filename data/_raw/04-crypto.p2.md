## [g-modern] 现代密码基础——分组密码模式与 XOR 是 CTF 必考地基

### [modern-mode] 分组模式 ECB/CBC 与重排/翻转 | medium | ECB;CBC;分组模式 | 字节翻转
> ECB 相同明文块密文相同可重排，CBC 密文块翻转可定向改明文。

#### 这个条目的作用
认出题目用的是 ECB 还是 CBC 分组模式，然后分别用「重排/逐字节爆破」或「字节翻转」拿到 flag 或绕过校验。

#### 前置条件
- Python 3.8+，装有 pycryptodome：`pip install pycryptodome`
- 知道块大小：AES=16 字节、DES=8 字节（看题目提示的是哪个算法）
- 能运行 Python 脚本做加解密验证（本条目不改 key/iv，只操作密文）

#### 第 1 步：判断是不是分组密码题
看题面特征：
- 密文长度是块大小（16 或 8）的整数倍
- 题目提供「加密函数 + 可控输入」，或「提交密文返回解密结果」
- 密文按 16 字节分组后能看到重复块（ECB 的强特征）

```bash
# 把密文按 16 字节切块，肉眼找重复块
python -c "c=bytes.fromhex('$C'); print([c[i:i+16].hex() for i in range(0,len(c),16)])"
```
预期结果：ECB 下出现重复块；CBC 下所有块基本互不相同。
如果不行：密文不是 hex，先确认是 base64 还是原始 bytes 再切。

#### 第 2 步：用脚本复现 ECB/CBC 加解密验证
```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

key = b'0123456789abcdef'      # 16 字节
iv  = b'abcdef0123456789'      # 16 字节，CBC 用
msg = pad(b'hello hello ctf', 16)

c1 = AES.new(key, AES.MODE_ECB).encrypt(msg)          # ECB
c2 = AES.new(key, AES.MODE_CBC, iv).encrypt(msg)      # CBC
print('ECB:', c1.hex())
print('CBC:', c2.hex())
```
预期结果：ECB 密文中 `hello hello` 重复明文对应两块相同密文；CBC 里相同明文在不同位置密文不同。
如果不行：确认 key/iv 长度是 16/24/32 字节；msg 必须先 `pad` 到 16 的倍数，否则报错。

#### 第 3 步：ECB 重排攻击
原理：ECB 每块独立加密，`Enc(P[i])` 与位置无关；两块密文相同 ⇔ 两块明文相同。
利用：把密文块任意交换、删除、复制后提交，解密出的明文块也跟着换位。

```python
c = bytes.fromhex("...")                       # 题目密文
bs = 16
blocks = [c[i:i+bs] for i in range(0, len(c), bs)]
new_c = b''.join([blocks[2], blocks[0], blocks[1]])   # 举例：交换块顺序
print(new_c.hex())
```
预期结果：服务器解出的明文块顺序与 `new_c` 中块顺序一致，可把「合法块」拼成任意顺序的合法明文。
如果不行：块数太少看不出效果，先数 `len(c) // 块数` 确定块大小再切。

#### 第 4 步：ECB 逐字节爆破（偷 flag）
场景：服务器返回 `encrypt(flag + 你的输入)`（或反过来），且用 ECB。原理：调整输入长度，让目标字符恰好落在某个块的最后一字节，然后爆 256 个候选，谁的密文块和真实块相同谁就是目标字符。

```python
import string

flag = ''
charset = string.printable
for i in range(1, 200):                      # 第 i 个 flag 字符
    pad_len = 15 - (i - 1) % 16              # 让目标字符落在块尾
    for ch in charset:
        payload = 'A' * pad_len + flag + ch
        c = enc(payload)                     # 题目给的加密函数
        if c[:16] == c[16:32]:               # 第一块=第二块 ⇒ 猜中
            flag += ch
            print(flag)
            break
    if flag.endswith('}'):
        break
print('FLAG:', flag)
```
预期结果：逐字节吐出完整 flag。
如果不行：flag 在输入后面而不是前面时，把 payload 改成 `flag + ch + 'A'*pad_len`；连接方式用 pwntools `remote(...)` 或题目 HTTP 接口，按题面替换 `enc`。

#### 第 5 步：CBC 字节翻转
原理：CBC 解密 `P[i] = Dec(C[i]) XOR C[i-1]`。篡改密文块 `C[i-1]` 的第 j 字节，只会翻转明文块 `P[i]` 的第 j 字节（值完全可控），代价是 `P[i-1]` 被随机破坏。
公式：`C'[i-1][j] = C[i-1][j] XOR P[i][j] XOR 目标值`

```python
c = bytearray(ciphertext)                    # 原始密文
j = 7                                        # 目标字节下标
P_ij = ord('0')                              # 当前明文该字节
target = ord('1')                            # 想改成的值
c[j] ^= P_ij ^ target                        # 异或掉旧值，再异或新值
print(bytes(c).hex())
```
预期结果：重新提交后 `P[i]` 对应字节变成目标值；若该字节在 P[0]，改的是 IV（`IV'[j] = IV[j] XOR P[0][j] XOR 目标值`）。
如果不行：目标字节所在块的「前一块」才是要改的密文，改错块会整块乱码。

> [!warn] 翻转发生在密文上，解密过程本身没被破坏；被破坏的上一块若也被服务器校验，需用同一公式把上一块（或 IV）一起修补。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| ECB 爆破永远不命中 | flag 在输入前面而不是后面 | 调换 payload 拼接方向再试 |
| 块重复对不上 | 块大小不是 16（DES=8） | 按 8 字节分组重算 |
| 翻转后目标块整块乱码 | 改错了块 | 目标字节在 P[i]，改 C[i-1] 对应字节 |
| 改了 IV 后第一块全乱 | 只改密文没改 IV | 第一块用 IV 翻转公式处理 |

#### 实战要点
1. 看到「返回加密结果 + 可控输入」优先想 ECB 逐字节爆破。
2. ECB 判据：相同明文块 → 相同密文块；密文里出现重复 16 字节块。
3. CBC 翻转前先确定目标字节在哪一块，永远改「目标块的前一块密文」。
4. 翻转公式本质是一次 XOR：`新值 = 旧值 XOR 原明文 XOR 目标明文`。
5. 提交前把 bytearray 转回 bytes：`bytes(c)`；保持与题目相同的编码（hex/base64）。

### [modern-padding] PKCS7 填充与填充预言机 | medium | PKCS7;填充;填充预言机 | Padding Oracle
> 分组密码要求明文是块大小整数倍，PKCS7 填充规则简单，但校验点可被当预言机用。

#### 这个条目的作用
看懂 PKCS7 填充规则，并在「解密只有成功/失败反馈」时用填充预言机逐字节还原明文，甚至无密钥伪造任意密文。

#### 前置条件
- 算法是 CBC 模式（填充预言机只对 CBC 生效）
- 有一个「提交密文 → 返回填充是否合法」的接口（HTTP 状态码、报错文本、时间差都算反馈）
- 知道块大小（一般 16），且能控制/获得完整密文

#### 第 1 步：理解 PKCS7 填充规则
规则：缺 n 字节就补 n 个 `0x0n`；明文恰好是块整数倍时补一整块（16 字节块补 16 个 `0x10`）。例：AES 块 16 字节，明文 10 字节 → 末尾补 6 个 `0x06`。

```python
def pkcs7_pad(data: bytes, bs: int = 16) -> bytes:
    n = bs - len(data) % bs
    return data + bytes([n]) * n

def pkcs7_unpad(data: bytes, bs: int = 16) -> bytes:
    n = data[-1]
    assert 1 <= n <= bs and data[-n:] == bytes([n]) * n
    return data[:-n]

print(pkcs7_pad(b'hello' * 2).hex())   # 10 字节 → 末尾 6 个 0x06
```
预期结果：`68656c6c6f68656c6c6f060606060606`，末尾 6 个 `0x06`。
如果不行：Python 版本低于 3.8 也能跑（没用到新语法）；assert 失败说明你传入的数据本身不是合法填充。

#### 第 2 步：确认预言机存在
把密文最后一字节改成任意值再提交，观察反馈是否与正常解密不同。

```bash
# 例子：把 hex 密文最后一字节从 3f 改成 00 再 POST
curl -X POST http://target/decrypt -d "c=<改过最后一字节的密文>"
```
预期结果：返回「padding error / decrypt failed / 500」等，与正常解密的「200 / ok」不同 → 有预言机。
如果不行：差异可能藏在响应时间里，多测几次取平均；或者直接用第 4 步的 padbuster 让它自动探测。

#### 第 3 步：手写恢复脚本（理解原理）
CBC 解密 `P[i] = I[i] XOR C[i-1]`，其中中间值 `I[i] = Dec(C[i])` 固定不变。我们从最后一字节往前，把 `C[i-1]` 当可控变量：猜 `I[j]`，使解密后填充恰好合法。

```python
def oracle(c: bytes) -> bool:        # 替换成题目接口：返回填充是否合法
    return decrypt_ok(c)

def recover_block(c_prev: bytes, c_cur: bytes) -> bytes:
    I = bytearray(16)
    for j in range(15, -1, -1):          # 从最后一字节往前猜
        pad_val = 16 - j                 # 想让末尾成为几
        for g in range(256):
            c2 = bytearray(c_prev)
            for k in range(j + 1, 16):   # 已恢复的字节固定成合法填充
                c2[k] = I[k] ^ pad_val
            c2[j] = g
            if oracle(bytes(c2) + c_cur):
                I[j] = g ^ pad_val
                break
    return bytes(I)

I = recover_block(c_prev, c_cur)         # 对每个密文块调用
P = bytes(a ^ b for a, b in zip(I, c_prev))   # 明文 = I XOR 前一块（第一块前一块是 IV）
print(P)
```
预期结果：逐块输出可读明文。
如果不行：256 次里有时多个 g 都通过（0x01 与 0x02 候选冲突），收集全部候选逐个验证；第一块的前一块是 IV，别漏。

> [!tip] 实战不用手写：`padbuster`（Kali 自带）一行跑完。`padbuster <url> <hex密文> 16 -encoding 0` 直接输出明文。

#### 第 4 步：用 padbuster 直接出明文
```bash
padbuster "http://target/decrypt.php?c=%s" 00112233445566778899aabbccddeeff 16 -encoding 0
# %s 是密文占位符；-encoding 0 表示密文是 hex
```
预期结果：输出完整明文（末尾可能带填充字节，去掉即可）。
如果不行：URL 里密文占位符必须是 `%s`；接口要带 cookie 就加 `-cookie "session=xxx"`；块大小不是 16 就换成 8。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 所有 g 都返回 False | 接口反馈与填充无关（内容校验） | 找其他差异反馈；或题目根本不是 CBC |
| 恢复出来乱码 | 块顺序/IV 用错 | 第一块的前一块是 IV，不是 C[0] 前面的数据 |
| padbuster 卡死 | 缺 cookie / URL 编码错误 | 补 `-cookie`，确认 `%s` 占位符 |
| 明文末尾是 0x01-0x10 | 那是填充本身 | 去掉末尾 pad 值个字节再提交 |

#### 实战要点
1. 核心思想：把「填充是否合法」当 256 选一的判定器，每次拿到中间值 1 字节。
2. 从后往前逐字节恢复，每字节平均 128 次尝试，16 字节块约 2048 次请求。
3. 第一块的「前一块」是 IV，题目不给 IV 时先恢复 IV 再恢复密文。
4. 只要反馈有「合法/非法」差异就能打：报错文本、状态码、响应时间都算。
5. 拿到明文记得去填充，别把 `\x10\x10...` 当 flag 内容。
6. 进阶（加密方向）：恢复全部 I 后，可任选新明文反推 `C'[i-1] = I[i] XOR 新明文`，无密钥伪造任意密文。

### [modern-xor] 单字节 XOR 与多字节密钥 XOR | easy | XOR;异或;频率分析 | 单字节异或
> XOR 是对称运算，单字节密钥用频次评分即可秒解，多字节密钥先求密钥长度。

#### 这个条目的作用
拿到一段被 XOR 加密的文本时，用「256 次穷举 + 英文频次评分」秒解单字节密钥；用「汉明距离求长度 + 分组单字节爆破」解多字节重复密钥。

#### 前置条件
- Python 3.8+，只用标准库，无需装包
- 知道密文是 hex 字符串还是 bytes：hex 先 `bytes.fromhex()` 再操作
- 明文是英文/可打印文本（中文明文的频次评分不适用）

#### 第 1 步：确认是单字节 XOR
题面特征：
- 密文是一串 hex 或可打印字符
- 与一字节密钥逐字节异或：`明文[i] = 密文[i] XOR key`
- 特征词：「single byte XOR」「xor key is 1 byte」

#### 第 2 步：穷举 256 个密钥 + 频次评分
key 只有 256 种可能，全部试一遍，对解密结果按「常见英文字母/空格占比」打分，最高分即明文。

```python
data = bytes.fromhex("1b37373331363f78151b7f2b783431333d78397828372d363c78373e783a393b3736")

def score(s: bytes) -> float:
    freq = " etaoinshrdlu"                    # 空格优先，再常见字母
    return sum(1 for b in s if chr(b).lower() in freq)

best = max(((bytes(b ^ k for b in data), k) for k in range(256)),
           key=lambda t: score(t[0]))
print("key =", best[1], repr(chr(best[1])))
print(best[0].decode())
```
预期结果：key=88（'X'），明文 "Cooking MC's like a pound of bacon"。
如果不行：评分太弱就加过滤——只对 `32 <= b < 127` 的可打印字符计分，空格权重乘 2。

#### 第 3 步：识别多字节密钥 XOR（重复密钥 XOR）
特征：单字节爆破全乱码；题目说「repeating-key XOR」「key length > 1」；密文里周期性出现可读片段。

#### 第 4 步：汉明距离求密钥长度
原理：真实密钥长度下，按长度切成的相邻两组的汉明距离（归一化后）最小——因为正确分组时每组对应位置被同一密钥字节异或，差异只来自明文本身。

```python
def hamming(a: bytes, b: bytes) -> int:
    return sum(bin(x ^ y).count('1') for x, y in zip(a, b))

data = open('cipher.bin', 'rb').read()        # 或 bytes.fromhex(...)

best_k = min(range(2, 40), key=lambda k: sum(
    hamming(data[i*k:(i+1)*k], data[(i+1)*k:(i+2)*k]) / k
    for i in range(4)))
print("key length =", best_k)
```
预期结果：打印 3 或 5 之类的小数字，即密钥长度。
如果不行：密文太短时汉明距离法失灵，把 `range(4)` 改成 `range(8)` 取更多组平均，或直接枚举 2-20 手看哪个人类可读。

#### 第 5 步：按长度分组做单字节爆破
把密文按 `key_len` 分成若干列，每列都是「单字节 XOR」密文，逐列跑第 2 步的评分。

```python
def score(s: bytes) -> float:
    freq = " etaoinshrdlu"
    return sum(1 for b in s if chr(b).lower() in freq)

key_len = best_k
groups = [data[i::key_len] for i in range(key_len)]
key = bytes(
    max(((bytes(b ^ k for b in g), k) for k in range(256)),
        key=lambda t: score(t[0]))[1]
    for g in groups)
plain = bytes(data[i] ^ key[i % key_len] for i in range(len(data)))
print("key =", key)
print(plain.decode())
```
预期结果：打印密钥和完整明文。
如果不行：个别列的评分选错密钥字节，打印该列 top3 候选人工挑；换更强语料评分（完整字母表 + 常见词）。

> [!warn] 先 `bytes.fromhex(...)` 再异或；直接把 hex 字符串当 bytes 异或会得到双倍长度的垃圾。解密结果不可读时第一件事检查这一步。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 解出来全是乱码 | 密文是 hex 字符串没转 bytes | `bytes.fromhex(...)` 再异或 |
| key 正确但含非打印字符 | 评分把乱码字节也算分了 | 只对 `32<=b<127` 计分 |
| 单字节解出中文乱码 | 明文不是英文 | 换中文语料评分，或用已知明文段 |
| 密钥长度求错 | 密文太短/分组太少 | 增加平均分组数或枚举 2-20 手看 |

#### 实战要点
1. 单字节 XOR：256 次穷举 + 英文频次评分，两行代码的事，秒解。
2. 评分优先级：空格 > e t a o i n > 常见标点 > 可打印字符。
3. 多字节 XOR 一定先求密钥长度再分组，别直接瞎爆。
4. 汉明距离 = 对应位不同的数量，`bin(x ^ y).count('1')` 一行实现。
5. 解出一层后看可读性，不可读就继续解下一层（hex→XOR→base64 嵌套常见）。
6. 实战偷懒：`xortool cipher.bin` 自动求长度+密钥，评分结果拿来做交叉验证。

## [g-rsa] RSA 专项——CTF 最高频的公钥密码，攻击面集中在参数弱点

### [rsa-params] openssl 提取 n/e 与基础脚本 | easy | RSA;openssl;公钥解析 | 提取n和e
> 题目给 pem 公钥文件，第一步永远是提取 n、e，再判断有没有现成因数。

#### 这个条目的作用
把「pem 公钥文件 / n/e/c 数字」变成可计算的 Python 大整数，查 factordb 分解，并跑通标准 RSA 解密流程拿到明文。

#### 前置条件
- 装有 openssl（`openssl version` 能跑）
- Python 3.8+，`pip install gmpy2 pycryptodome`（装不上 gmpy2 也能用内置 `pow(e, -1, phi)`）
- 知道 RSA 关系：`c = m^e mod n`，`m = c^d mod n`，`d = e^-1 mod φ(n)`，`φ(n) = (p-1)(q-1)`

#### 第 1 步：从 pem 公钥提取 n、e
```bash
openssl rsa -pubin -in pub.pem -text -noout
# 输出里 modulus: 后面是 n 的十六进制（可能换行、带冒号），exponent: 是 e
```
预期结果：看到 modulus（几百位的大数）和 exponent（常见 65537、3、17）。
如果不行：备选命令 `openssl pkey -pubin -in pub.pem -text -noout`；题目给 der 格式就加 `-inform DER`。

#### 第 2 步：把 n/e/c 统一成 Python 大整数
```python
n_hex = """00:af:3c:..."""            # 从 openssl 复制 modulus（含冒号换行）
n = int(n_hex.replace(':', '').replace('\n', '').replace(' ', ''), 16)
e = 65537                             # 从 exponent 读
c = int("...", 16)                    # 密文：hex 就 int(x,16)，十进制直接 int(x)
print(n.bit_length(), e)
```
预期结果：`n.bit_length()` 输出 1024/2048 之类，n/e/c 都是 Python int。
如果不行：openssl 的 modulus 开头可能有 `00` 补位字节，`int(..., 16)` 会自动忽略，不用手动删。

#### 第 3 步：先查 factordb（白捡分）
```bash
# 浏览器打开，粘贴 n 的十进制
https://factordb.com
```
预期结果：页面直接给出 p、q 因子，或有「Fully factored」标记。
如果不行：n 是 512 位及以下可用 `yafu` / `msieve` 本地分解；分不出来说明不是简单分解题，转 rsa-weak / rsa-wiener。

#### 第 4 步：标准解密脚本（从 n/e/c 到明文）
```python
import gmpy2
from Crypto.Util.number import long_to_bytes

n = 0x...      # 公钥模数
e = 65537      # 加密指数
c = 0x...      # 密文
p = 0x...      # factordb 给的因子
q = 0x...

phi = (p - 1) * (q - 1)
d = gmpy2.invert(e, phi)          # 模逆：d*e ≡ 1 mod phi
m = pow(c, d, n)                  # 解密：m = c^d mod n
print(long_to_bytes(m))
```
预期结果：打印明文，通常是 `flag{...}`。
如果不行：`long_to_bytes` 结果开头有 `b'\x00'` 就 `.lstrip(b'\x00')`；gmpy2 装不上改用 `d = pow(e, -1, phi)`（Python 3.8+ 内置模逆）。

> [!tip] `int(hex串, 16)` 是万能进制转换；拿到 n 先丢 factordb，很多入门题到这一步就结束了。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| int() 报错 | 复制时带了冒号/换行/空格 | 先 `.replace(':','').replace('\n','').replace(' ','')` |
| 解密出乱码 | e/d/phi 关系错 | 确认 e 从 exponent 读，phi=(p-1)(q-1) |
| 密文比 n 还长 | c 的进制看错 | 确认 c 是 hex 还是十进制再 int |
| 明文前面多 00 | long_to_bytes 保留前导零 | `.lstrip(b'\x00')` |

#### 实战要点
1. 拿到 n 第一件事：丢 factordb，入门题到这里就结束了。
2. `openssl rsa -pubin -in pub.pem -text -noout` 是提取参数的万能命令。
3. Python 3.8+ 自带 `pow(e, -1, phi)` 模逆，没有 gmpy2 也能解。
4. 把 n/e/c 统一转 int 后先 print 确认数值再往下算，别拿字符串硬算。
5. 十六进制/十进制看花眼是 RSA 题第一坑，脚本里统一 `int(x, 16)`。

### [rsa-weak] 低指数/共模/公约数 | medium | 低加密指数;共模攻击;公约数;gmpy2 | 小e攻击
> 参数之间的代数关系是 RSA 攻击主战场：小明文开方、同一 n 两组 e、多个 n 共享素数。

#### 这个条目的作用
拿到 n/e/c 后按「e 小 / 同 n 多 e / 多 n」三个分支判断攻击类型，并跑对应脚本把密文解成明文。

#### 前置条件
- `pip install gmpy2 pycryptodome`
- 能区分三种题面：一份 (n,e,c)；同一 n 的两份 (e1,c1),(e2,c2)；多份 (n,e)
- 公钥参数已按 rsa-params 提取成 Python int

#### 第 1 步：按特征对号入座
| 题面特征 | 攻击 | 判定要点 |
| --- | --- | --- |
| e=3（或 5/17）且 flag 短 | 低加密指数 | `m^e < n` 大概率成立 |
| 同一 n，两个不同 e 和两份密文 | 共模攻击 | 题目明说 same n / different e |
| 多份 n 各自带 e/c | 公约数攻击 | 批量生成的 n 常共享素数 |
| e 巨大（位数接近 n） | Wiener | 转 rsa-wiener 条目 |

#### 第 2 步：低加密指数直接开方
条件 `m^e < n`：此时 `c = m^e` 本身没取模，对 c 开 e 次方根就是 m。

```python
import gmpy2
from Crypto.Util.number import long_to_bytes

n = 0x...
e = 3
c = 0x...

m, exact = gmpy2.iroot(c, e)          # 精确开 e 次方
if exact:
    print(long_to_bytes(int(m)))
else:
    print("m^e >= n，需要广播攻击（多份同 e 密文）或低指数+CRT")
```
预期结果：`exact=True` 直接打印 flag；`False` 说明 `m^e` 超过 n 被取模了。
如果不行：e 不是 3 就把 `iroot` 的第二个参数换成实际 e；题面给了 e 份同 e 密文 → 用中国剩余定理（广播攻击）重建 `m^e` 再开方。

#### 第 3 步：共模攻击
条件：同一个 n、`gcd(e1,e2)=1`、同一明文的两份密文 `c1,c2`。
原理：存在整数 s,t 使 `e1·s + e2·t = 1`，则 `m = c1^s · c2^t mod n`。

```python
import gmpy2
from Crypto.Util.number import long_to_bytes

n = 0x...
e1, c1 = 0x..., 0x...
e2, c2 = 0x..., 0x...

s, t = gmpy2.gcdext(e1, e2)[:2]       # s*e1 + t*e2 = gcd = 1
if s < 0:                             # 负指数 → 模逆 + 取正
    c1, s = gmpy2.invert(c1, n), -s
if t < 0:
    c2, t = gmpy2.invert(c2, n), -t
m = (pow(c1, s, n) * pow(c2, t, n)) % n
print(long_to_bytes(m))
```
预期结果：打印同一明文（flag）。
如果不行：两份密文必须是同一明文，否则解出垃圾；c1↔e1、c2↔e2 的对应关系别调换。

#### 第 4 步：多组公钥公约数攻击
条件：多份 n 中至少两份共享同一个素数因子。
原理：`gcd(ni, nj)` 非 1 就是共享的 p，随后 `q = n // p` 正常解密。

```python
from math import gcd
import gmpy2
from Crypto.Util.number import long_to_bytes

ns = [0x..., 0x..., 0x...]            # 所有 n
es = [65537, 65537, 65537]
cs = [0x..., 0x..., 0x...]

for i in range(len(ns)):
    for j in range(i + 1, len(ns)):
        p = gcd(ns[i], ns[j])
        if p > 1:
            print(f"shared p between {i} and {j}: {p}")
            for idx in (i, j):
                q = ns[idx] // p
                phi = (p - 1) * (q - 1)
                d = gmpy2.invert(es[idx], phi)
                print(idx, long_to_bytes(pow(cs[idx], d, ns[idx])))
```
预期结果：至少两组解出可读明文。
如果不行：n 很多时两两 gcd 是 O(n²)，先 `gmpy2.is_prime` 排除小素数 n，再只对合数两两比较。

> [!warn] 共模攻击要求两份密文是「同一明文」，题目通常说明；公约数攻击对同批生成的 n 极常见，先跑一轮两两 gcd。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| iroot 显示 False | flag 太长，m^e > n | 改广播攻击；或密文其实加了随机填充 |
| 共模解出乱码 | 两份密文不是同一明文 | 确认题面；c1/e1、c2/e2 别调换 |
| gcdext 返回负数 s/t | 正常现象 | 按脚本把负指数换成模逆+正指数 |
| 公约数攻击无输出 | 没有共享素数 | 检查 n 进制是否读对；试单 n 分解 |

#### 实战要点
1. 先看 e：e=3/5/17 → 先 iroot；e 巨大 → Wiener；否则按同 n / 多 n 分支。
2. 共模攻击三要素缺一不可：同 n、互素 e、同明文。
3. 负指数处理是共模脚本唯一的坑：`invert(c, n)` 后指数取正。
4. 公约数攻击对「同一环境批量生成的 n」几乎必中，先跑一轮两两 gcd。
5. 全部失败时把 n 丢 factordb + 复查进制，八成是参数读错。

### [rsa-wiener] 小私钥 d 与 Wiener 攻击 | hard | Wiener;连分数;低解密指数 | 低d攻击
> d 小于 n 的 1/4 次方时可通过连分数逼近 e/n 恢复 d，属于纯数学脚本题。

#### 这个条目的作用
识别「私钥 d 很小」的 RSA 题（题面指纹：e 特别大），用连分数逼近恢复 d，不分解 n 直接解密拿明文。

#### 前置条件
- `pip install gmpy2 pycryptodome`（保底可用 `pip install owiener`）
- 知道连分数/渐近分数概念（不理解也能跑脚本）
- 一份 (n, e, c)，e 位数接近 n（典型：1024 位 n 配 1023 位 e）

#### 第 1 步：判断是不是 Wiener
判定条件：`d < n^0.25 / 3`（约 n 的 1/4 位数）。
题面特征：
- e 特别大，位数和 n 几乎一样
- 题目提示「small d」「private exponent is small」「wiener」
- n/e/c 齐全且无其他线索（不是 factordb 能分解的小 n）

> [!tip] 快速判断：`len(bin(e))` 与 `len(bin(n))` 接近（e 和 n 位数相近）时先试 Wiener。

#### 第 2 步：理解原理（30 秒版）
`e·d ≡ 1 (mod φ(n))` → 存在 k 使 `e·d - 1 = k·φ(n)`，即 `e/φ(n) ≈ k/d`。因为 `φ(n) ≈ n`，对 `e/n` 做连分数展开，渐近分数里会出现 `k/d` 候选。逐个验证：`(e·d-1)/k` 是否为整数、对应二次方程判别式能否开平方，命中即得 p、q → d → 明文。

#### 第 3 步：完整解密脚本（从 n/e/c 到明文）
```python
import gmpy2
from Crypto.Util.number import long_to_bytes

n = 0x...      # 公钥模数
e = 0x...      # 注意：这里是那个巨大的加密指数
c = 0x...      # 密文

def wiener(e, n):
    # 1) 生成 e/n 的连分数
    cf = []
    a, b = e, n
    while b:
        cf.append(a // b)
        a, b = b, a - (a // b) * b
    # 2) 由连分数生成渐近分数 (k, d)
    hs, ks = [0, 1], [1, 0]
    for q in cf:
        hs.append(q * hs[-1] + hs[-2])
        ks.append(q * ks[-1] + ks[-2])
        k, d = hs[-1], ks[-1]
        if k == 0 or d == 0:
            continue
        if (e * d - 1) % k != 0:        # (e*d-1)/k 必须整除
            continue
        phi = (e * d - 1) // k
        s = n - phi + 1                 # p + q = n - phi + 1
        disc = s * s - 4 * n            # (p - q)^2
        if disc > 0 and gmpy2.is_square(disc):
            p = (s + gmpy2.isqrt(disc)) // 2
            if n % p == 0:              # 验证 p 真的是因子
                return d
    return None

d = wiener(e, n)
if d:
    m = pow(c, d, n)
    print(long_to_bytes(m))
else:
    print("Wiener 未命中：d 可能不够小，或不是 Wiener 题")
```
预期结果：打印 flag。
如果不行：确认 e 是从 openssl 提取的 exponent 字段；e 巨大但脚本无输出 → 可能是 Boneh-Durfee（更大 d 的攻击），超出本条目范围。

#### 第 4 步：用 owiener 一行验证
```python
import owiener
from Crypto.Util.number import long_to_bytes

d = owiener.attack(e, n)
if d:
    print(long_to_bytes(pow(c, d, n)))
```
预期结果：与第 3 步手写脚本结果一致，互相印证。
如果不行：两个脚本结果一致但明文乱码 → 检查 c 进制，或密文是 PKCS1 填充（剥掉 `\x00\x02 ... \x00` 后的部分才是消息）。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 脚本无输出 | d 不够小，不满足 d < n^0.25/3 | 不是 Wiener，试 Boneh-Durfee 或其他攻击 |
| 解出乱码 | c 是 hex 没转 int，或 PKCS1 填充 | `int(c, 16)`；剥填充字节 |
| e 和 n 位数相同但失败 | exponent 看错（其实是 65537） | 回 openssl 重新确认 exponent 字段 |
| 连分数循环卡死 | e/n 互质但 e 巨大时 cf 很长 | 给循环加最大迭代次数（如 200 项） |

#### 实战要点
1. Wiener 的题面指纹：e 巨大（和 n 同数量级）+ 无其他线索。
2. 判断式 `d < n^0.25 / 3` 记不住没关系，e 巨大就试。
3. 验证 `(e*d-1) % k == 0` + 判别式开方，能同时防止误报。
4. `owiener.attack(e, n)` 是保底方案，手写脚本用来理解原理与应对魔改题。
5. 解密结果 `long_to_bytes` 后记得去掉填充/前导字节再提交。
6. Wiener 是纯数学题：不需要分解 n，连分数展开 + 渐近分数验证即可，脚本模板直接复用。
