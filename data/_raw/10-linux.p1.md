## [g-files] 文件与目录——最常用的列举、查找、查看与权限管理

### [ls-find-view] 文件列举、查找与查看 | easy | 目录;查找;查看 | ls;find;cat;less
> 掌握 ls/find 的常用参数与 cat/less/head/tail/stat 的查看方式，是任何 Linux 操作的第一步。

#### 这个条目的作用
ls 是"看一眼这个目录里有什么"、find 是"在整个磁盘里找某个文件"、cat/less/head/tail/stat 是"把文件内容或元数据打开来看"。CTF 里 80% 的信息收集都是从这三个动作开始的：判断 web 目录结构、找上传点、看可疑文件、确认文件被改动过。

#### 前置条件
- 已通过任意方式拿到目标机器的 shell（命令执行、反弹 shell、容器 exec）。
- 知道当前目录：先敲 `pwd` 看自己在哪，`id` 看自己是哪个用户、有没有权限。
- 不确定某命令是否存在时，用 `command -v ls` 检查；精简容器镜像可能缺命令。

#### 第 1 步：用 ls 快速摸清目录
（操作：在 shell 里执行）
```bash
pwd              # 我在哪
ls -la           # 列出当前目录全部文件（含隐藏文件 .env 之类）
ls -lah          # 同上，但大小显示为 K/M/G 人类可读
ls -lt           # 按修改时间倒序，最新改动的文件在最上面
ls -ld /var/www  # 只看目录本身的信息而不是目录内容
```
预期结果：第一列形如 `-rw-r--r--`（权限位），第二列是链接数，后面是属主、属组、大小、时间、文件名。以 `.` 开头的隐藏文件也会显示。
怎么理解输出：`d` 开头是目录，`-` 是普通文件，`l` 是软链接；时间最近的文件往往就是题目刚写入的 flag 或 webshell。
如果不行：提示 `ls: cannot open directory` 说明没有该目录读权限，加 `sudo`（如果能用）或换目录；提示 command not found 说明镜像精简，用 `busybox ls` 或 `find / -maxdepth 1` 兜底。

#### 第 2 步：用 find 全盘/定点找文件
（操作：shell）
```bash
find / -name 'flag*' 2>/dev/null            # 全盘按文件名找
find / -iname '*flag*' 2>/dev/null          # -i 忽略大小写，能命中 FLAG/Flag
find / -type f -size +1M 2>/dev/null        # 找大于 1M 的普通文件
find / -mtime -7 2>/dev/null                # 最近 7 天内被修改的文件
find / -user root -type f 2>/dev/null       # root 拥有的文件
```
预期结果：输出一列绝对路径；`2>/dev/null` 把无权限目录的报错全部丢弃，只留能访问的结果。
怎么理解输出：路径里的 `/var/www/html/xxx.php`、`/flag`、`/root/flag.txt` 都是直接目标。
如果不行：全盘扫很慢，先缩小范围——`find /var/www /home /tmp /opt -name '*flag*' 2>/dev/null`，几秒内出结果。

#### 第 3 步：cat/less/head/tail 看文件内容
（操作：shell）
```bash
cat flag.txt            # 一次性输出全部内容，小文件首选
cat -n flag.txt         # 带行号输出
less flag.txt           # 大文件分页看：q 退出，/搜索，n 下一个匹配，G 跳到底部
head -n 20 file.log     # 只看前 20 行
tail -n 20 file.log     # 只看最后 20 行
tail -f /var/log/access.log   # 实时跟踪：新的追加行会持续刷出来
```
预期结果：终端直接打印内容；`tail -f` 会一直挂着不退出，按 Ctrl+C 结束。
怎么理解输出：cat 输出里如果直接出现 `flag{...}` 就拿到了；tail -f 常用于"等 root 的定时任务往日志里写 flag"这种题。
如果不行：文件是二进制时终端会乱码——改用 `strings`（第 5 步）。

#### 第 4 步：stat 与 file 看元数据和真实类型
（操作：shell）
```bash
stat suspicious.bin     # 大小、权限、属主、mtime/ctime/atime 三个时间戳、inode
file suspicious.bin     # 用文件头识别真实类型，不信扩展名
xxd suspicious.bin | head   # 16 进制看文件头（png 是 8950..., zip 是 504b...）
```
预期结果：stat 输出多行键值对；file 输出如 `PNG image data`、`gzip compressed data`、`ELF 64-bit`。
怎么理解输出：mtime 是"最后一次修改时间"——某个配置文件 mtime 是几分钟前，说明被人动过；file 说它是 gzip 但扩展名是 .txt，说明这是个需要解压的压缩包。
如果不行：`xxd` 缺失时用 `od -A x -t x1z suspicious.bin | head`。

#### 第 5 步：strings 翻二进制
（操作：shell）
```bash
strings app.bin                 # 提取所有可打印字符串
strings app.bin | grep -iE 'flag|key|pass'   # 直接过滤关键字
strings -n 6 app.bin            # 只输出长度 ≥6 的字符串，减少噪音
```
预期结果：一屏可读文本，包含程序里的路径、URL、密钥、甚至 flag。
怎么理解输出：二进制/加密文件里的明文信息全在这里——很多题把 flag 藏进 ELF 或图片，strings 一遍就漏出来。
如果不行：字符串是 UTF-16 编码时用 `strings -e l app.bin` 试试。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|------|------|------|
| find 刷屏 permission denied | 无权限目录太多 | 加 `2>/dev/null`，或先缩小到 /var/www /home /tmp |
| find 特别慢 | 全盘扫 + 挂了网络盘 | 用 `-xdev` 不跨文件系统，或指定目录范围 |
| cat 二进制文件乱码 | 文件不是文本 | 用 strings / xxd / file |
| ls 看不到文件但题目说有 | 隐藏文件 | 用 `ls -la`（-a 显示 . 开头文件） |
| less 打开后不知道怎么退出 | 忘了快捷键 | 按 `q`；`/` 搜索后按 `n` 下一个 |
| tail -f 卡住不返回 | 它在实时跟踪 | Ctrl+C 退出，或改用 `tail -n 50` |

#### 实战要点
1. 拿到 shell 第一件事不是 cat /flag，而是 `ls -la` 当前目录 + `find / -name '*flag*' 2>/dev/null`，先建立目录地图。
2. `ls -lt` 看最近修改的文件——flag 通常是题目刚生成的，最新文件优先级最高。
3. `stat` 的 mtime 是排查"哪个文件被改过"的利器，日志题和取证题必用。
4. 容器镜像精简时命令可能缺失：`ls`→`busybox ls`，`less`→`cat`，`xxd`→`od`，`find` 一般都有。
5. 文件内容搜索慢，文件名搜索快：先 `find -name`，再对候选文件 `cat`/`strings`，最后才 `grep -r` 内容。

### [file-perm] 文件权限：chmod/chown/umask | easy | 权限;chmod;chown | permission
> 权限用 3 组 rwx 表示属主/属组/其他，数字法（4+2+1）与符号法（u/g/o/a+-rwx）是两种标准写法。

#### 这个条目的作用
Linux 一切皆文件，而每个文件都有"谁能读、谁能写、谁能执行"的权限。CTF 里权限考法密集：题目故意给 777 的敏感文件让你读、给可写的定时脚本让你提权、用 SUID 位让你以 root 执行程序。看懂权限位、会改权限，才能判断"这个东西我能不能动"。

#### 前置条件
- 有 shell，能执行 `ls -la`、`id`。
- 理解 3 组 rwx 的含义：`rwx` 读/写/执行，`-` 表示没有该权限。
- 改文件权限通常需要文件属主或 root；普通用户只能改自己拥有的文件。

#### 第 1 步：读懂权限字符串
（操作：shell）
```bash
ls -la /etc/passwd
```
预期结果：第一列 `-rw-r--r--` 或 `-rw-r--r-- 1 root root 2.3K ...`。
怎么理解输出：第一位是类型（`-`文件/`d`目录/`l`软链），后面 9 位分 3 组：`rw-`属主、`r--`属组、`r--`其他用户。所以 `/etc/passwd` 是"属主可读写，属组和其他只读"。
如果不行：没有任何输出说明路径错或没权限，`ls -la` 当前目录先看有没有这文件。

#### 第 2 步：数字法改权限
（操作：shell）
```bash
chmod 755 script.sh        # 属主 rwx，属组/其他 rx
chmod 644 flag.txt         # 属主 rw，属组/其他 r
chmod 777 upload.sh        # 所有人可读写执行（CTF 常用，但生产禁止）
chmod -R 755 webroot/      # 递归改整个目录树
```
预期结果：无输出即成功，再 `ls -l` 看到权限位已变化。
怎么理解输出：数字 = 4(读)+2(写)+1(执行) 相加。755 = 7+5+5 = rwx+r-x+r-x。改完 `ls -l` 第一列应显示 `-rwxr-xr-x`。
如果不行：`chmod: changing permissions of 'x': Operation not permitted` 说明不是属主也没 root——先 `id` 确认身份，属主或 sudo 才能改别人的文件。

#### 第 3 步：符号法改权限
（操作：shell）
```bash
chmod u+x script.sh        # 给属主加执行位
chmod g-w,o-r script.sh    # 属组去掉写，其他去掉读
chmod a+x script.sh        # a 所有人加执行
chmod o+w /var/www/html/   # 给"其他"加写——让低权用户能写 web 目录
```
预期结果：无输出，`ls -l` 对应位变化。u=属主 g=属组 o=其他 a=全部，`+`加 `-`减 `=`设定。
怎么理解输出：`u+x` 只影响第一组；`g-w,o-r` 逗号分隔多个操作一次完成。
如果不行：同第 2 步——权限不足时先确认属主/身份。

#### 第 4 步：chown 改属主属组
（操作：shell）
```bash
chown www-data:www-data uploads/    # 属主:属组一起改
chown -R root:root /opt/app/        # 递归
chown nobody file                   # 只改属主不改组
```
预期结果：无输出，`ls -l` 第 3、4 列变化。
怎么理解输出：`chown user:group` 里冒号前是属主后是属组；改完才能让 nginx（www-data）读写这个文件。
如果不行：普通用户只能把文件改给自己，改给别人/组需要 root；报 Operation not permitted 就换思路。

#### 第 5 步：umask 理解默认权限
（操作：shell）
```bash
umask                 # 查看，常见输出 0022
umask 077             # 临时改成 077（新建文件更安全）
touch newfile; ls -l newfile    # 看新建文件的实际权限
```
预期结果：`umask` 打印 4 位八进制；新建文件权限 = 666 & ~umask（文件）、777 & ~umask（目录）。umask 022 ⇒ 文件 644、目录 755。
怎么理解输出：umask 是"要减掉的权限位"。umask 000 ⇒ 文件 666，任何用户可写——看到这种配置就该警惕。
如果不行：umask 只在当前 shell 生效；要永久改写到 `~/.bashrc` 或 `/etc/profile`（重启 shell 生效）。

#### 第 6 步：特殊权限位 SUID/SGID/Sticky
（操作：shell）
```bash
chmod 4755 /tmp/helper      # 加 SUID：执行时以属主身份运行
chmod +s /tmp/helper        # 符号法加 SUID（等价 4xxx）
chmod 1777 /tmp             # Sticky：/tmp 标准配置，只能删自己的文件
find / -perm -4000 -type f 2>/dev/null   # 找出所有 SUID 文件（提权侦察）
ls -l /usr/bin/passwd       # 看到 -rwsr-xr-x，s 就是 SUID 位
```
预期结果：`ls -l` 里执行位显示 `s`（小写 s=有执行位，大写 S=没有执行位但设了 SUID）。
怎么理解输出：`rws` 的 s 表示这个程序运行时 euid 变成属主（通常是 root）——passwd 需要写 /etc/shadow 就靠它。攻击者找 `find/vim/python3` 等带 SUID 的二进制就能提权。
如果不行：chmod 设置 SUID 报错通常是文件系统挂载了 nosuid（如某些 /tmp），换目录或放弃该路径。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|------|------|------|
| chmod: Operation not permitted | 不是属主也没 root | `id` 确认身份；找属主或提权 |
| chmod 数字写反（644 vs 755） | 忘了 7=rwx | 背：4读 2写 1执行，7=全，6=读写，5=读执行 |
| ls 显示大写 S/s 混乱 | s 小写=有 x 位，S 大写=无 x 位 | SUID 无执行位时是大写 S，通常不可用 |
| 目录改 777 还是进不去 | 缺目录的 x（执行=进入）权限 | 目录需要 x 才能 cd 进入，`chmod 755 dir` 而不是 644 |
| 新文件权限"不对" | umask 在起作用 | `umask 022` 看当前值，用 077 收紧 |
| 能读文件但 web 访问 403 | 属主/属组不对 | `chown www-data:www-data` 对齐运行用户 |

#### 实战要点
1. "能写文件"不等于"能执行文件"：脚本要跑起来必须 x 位；webshell 要被执行必须 php 文件可读 + 目录可执行。
2. 目录权限看组合：目录 w 决定能否在里面增删文件，目录 x 决定能否进入——只有 w 没有 x 会"看着能写但进不去"。
3. SUID 侦察是提权标准动作：`find / -perm -4000 -type f 2>/dev/null`，命中 find/vim/python3 等直接查 GTFOBins 提权。
4. 读到权限异常（敏感文件 777、配置文件属主是普通用户）本身就是漏洞信号，别放过。
5. `/tmp` 的 1777 意味着"大家都能写但删不了别人的"——有些题靠它放脚本等 root 来执行。

### [hard-soft-link] 软链接与硬链接 ln | medium | 链接;ln;inode | symlink
> 软链接（symlink）是"快捷方式"，可跨文件系统、可指向目录；硬链接是同一 inode 的另一个名字，不能跨文件系统、不能指目录。

#### 这个条目的作用
ln 用来给文件建"第二个入口"。软链接是快捷方式（指向路径），硬链接是同一份数据的另一个名字（指向 inode）。CTF 里链接是高频考点：web 目录里一个指向 /flag 的软链接直接读穿；`/proc/self/fd/N` 这类伪软链在写文件、绕过限制时反复出现；硬链接还能绕过"按路径校验"的读取限制。

#### 前置条件
- 有 shell，会 `ls -la`、`cat`。
- 明白 inode 概念：每个文件有唯一 inode 号，里面存着元数据和数据块位置；文件名只是 inode 的"门牌"。

#### 第 1 步：建软链接
（操作：shell）
```bash
cd /tmp && echo "hello" > target.txt
ln -s target.txt link.txt       # 建软链接 link.txt -> target.txt
ls -l link.txt                  # 看到 lrwxrwxrwx ... link.txt -> target.txt
cat link.txt                    # 输出 hello
```
预期结果：`ls -l` 第一列是 `l`，且行尾显示 `link.txt -> target.txt`；cat 能读到内容。
怎么理解输出：`lrwxrwxrwx` 的 l 就是 link；权限位全是 rwx 但真正生效的是目标文件的权限。link.txt 里不存数据，只存"目标路径"。
如果不行：`ln: failed to create symbolic link` 通常是目标路径不存在（会建出悬空链接）或目录无写权限。

#### 第 2 步：建硬链接
（操作：shell）
```bash
ln target.txt hard.txt          # 硬链接：hard.txt 与 target.txt 指向同一 inode
ls -li target.txt hard.txt      # -i 显示 inode：两行 inode 号完全相同
stat target.txt                 # 看 Links: 2，表示有两个名字指向它
cat hard.txt                    # 输出 hello
```
预期结果：`ls -li` 两文件 inode 号一模一样，stat 显示 Links: 2。
怎么理解输出：硬链接不占新数据，只是给同一 inode 加了个名字。删掉 target.txt 后 hard.txt 照样能读（数据还在，因为引用计数没归零）。
如果不行：`ln: failed to create hard link: Invalid cross-device link` 说明跨了文件系统——硬链接不能跨设备（/ 和 /home 可能是两个分区）。

#### 第 3 步：软链 vs 硬链的区别实验
（操作：shell）
```bash
rm target.txt                   # 删掉原文件
cat link.txt                    # 报错 No such file：软链接悬空失效
cat hard.txt                    # 正常输出 hello：硬链接不受影响
```
预期结果：软链接报错，硬链接正常。
怎么理解输出：软链接存的是路径，路径没了就断；硬链接存的是 inode，只要还有一个名字活着数据就在。这就是"删原文件后软链失效、硬链仍可访问"。
如果不行：没输出？确认没有其他同名文件干扰，用 `ls -li` 再对比一次 inode。

#### 第 4 步：软链接指向目录与 readlink
（操作：shell）
```bash
ln -s /var/www/html webroot     # 软链可以指向目录，硬链接不行
readlink webroot                # 输出 /var/www/html：只看链接指向哪
ls -l webroot                   # 等价于 ls -l /var/www/html/
```
预期结果：readlink 打印目标绝对路径；通过 webroot 访问目录内容。
怎么理解输出：软链接是万能"快捷方式"，目录、文件、跨分区都能指；readlink 用来反查链接的真实目标——取证时看一个可疑软链指到哪。
如果不行：`ln: hard link not allowed for directory`——硬链接不能指目录，这是内核限制。

#### 第 5 步：CTF 实战姿势：/proc/self/fd 与覆盖
（操作：shell）
```bash
ls -l /proc/self/fd/            # 当前进程打开的文件描述符，都是软链接
ls -l /proc/self/fd/0           # 0=stdin 1=stdout 2=stderr
# 写 webshell 的经典变体：链接到敏感位置再写
ln -sf /var/www/html/shell.php /tmp/x   # 之后对 /tmp/x 的写操作落到 shell.php
# 或利用软链绕过"只允许读指定目录"的限制
ln -s /flag /tmp/readme.txt
cat /tmp/readme.txt             # 若校验只看 /tmp 下文件名，这里就穿帮了
```
预期结果：`/proc/self/fd/` 下列出 0/1/2/... 的软链接；ln -sf 覆盖式建链。
怎么理解输出：`ln -sf` 的 -f 是"先删旧的再建新的"，覆盖已有链接；/proc/self/fd 是内核提供的伪文件系统，很多文件读取/写入绕过都借它。
如果不行：/proc 被 hidepid 挂载或容器限制时 fd 目录可能为空——换用 `readlink /proc/self/fd/0` 逐个试。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|------|------|------|
| Invalid cross-device link | 硬链接跨了文件系统 | 软链接代替，或在同一分区内建 |
| Hard link not allowed for directory | 硬链接不能指目录 | 目录用 `ln -s` |
| 软链接 cat 报 No such file | 目标被删/路径写错，悬空链接 | readlink 检查指向，重建 |
| ls -l 不显示箭头 | 用了不支持 -l 的别名/环境 | 直接 `ls -la` 或 `ls -l` 完整命令 |
| ln -s 后链接"不存在" | 相对路径基准错了 | 相对路径以链接所在目录为基准，改用绝对路径最稳 |
| 覆盖已有链接失败 | 已存在同名文件 | 加 `-f`：`ln -sf 新目标 旧链接` |

#### 实战要点
1. 软链接是"路径替身"：web 目录里发现 `xxx.php -> /flag` 这类链接，直接 curl/cat 就穿。
2. 硬链接绕过"路径黑名单"读取：有些过滤只看请求路径，用 `ln /flag /tmp/a.txt` 建硬链后读 /tmp/a.txt 可能绕过。
3. `ln -sf` 覆盖是写文件攻击的惯用伎俩：先把链接指到目标（如 .bashrc、webshell 路径），再往链接写。
4. `/proc/self/fd/N` 是伪软链：删了原文件后通过已打开的 fd 仍能读写内容，日志轮转/文件锁场景常见。
5. 判断链接类型：`ls -l` 第一位 l = 软链；硬链看不出来，必须 `ls -li` 比 inode 或 stat 看 Links 数。
6. 备份还原场景：`ln -s` 建链接后原路径被覆盖（如 tar 解压会替换符号链接本身），注意别把自己链断了。

## [g-findgrep] 查找与过滤——找 flag、搜敏感词、啃日志配置

### [find-flag] 全盘搜索 flag | easy | flag;find;搜索 | 找flag
> CTF 第一件事：拿到 shell 或任意文件读取后，用 find 全盘扫文件名与文件内容中的 flag 关键字。

#### 这个条目的作用
CTF 拿到 shell 或任意文件读取后，第一目标永远是 flag 文件。find-flag 就是一套"从拿到 shell 到找到 flag 文件"的完整命令链：先按文件名快扫，再按内容慢扫，最后把 flag 抽出来。会这一条，等于题目已经完成一半。

#### 前置条件
- 已获得 shell（命令执行/反弹/容器 exec）或任意文件读取能力。
- 知道常见 flag 格式：`flag{...}`、`ctf{...}`、`FLAG{...}`、`NSSCTF{...}`、`BUUCTF{...}`。
- 思路顺序：文件名搜索（快）→ 目录限定内容搜索（中）→ 全盘内容搜索（慢，最后用）。

#### 第 1 步：文件名快扫（首选）
（操作：shell）
```bash
pwd && id                       # 先确认位置和身份
find / -name '*flag*' 2>/dev/null
find / -iname '*flag*' 2>/dev/null          # 忽略大小写
find / -name '*flag*' -o -name '*key*' -o -name '*ctf*' 2>/dev/null
```
预期结果：输出含 flag 字样的文件路径列表。
怎么理解输出：路径就是答案——`/flag`、`/flag.txt`、`/root/flag.txt`、`/var/www/html/flag.php` 直接 `cat`。
如果不行：先缩小范围加速：`find /var/www /home /tmp /opt /root -name '*flag*' 2>/dev/null`。没结果就进第 2 步内容搜索——flag 文件名可能不含 flag 字样。

#### 第 2 步：常见藏匿点手工翻
（操作：shell）
```bash
ls -la / /root /home /tmp /var/www/html 2>/dev/null   # 顶层和家目录
cat /flag /flag.txt /root/flag* 2>/dev/null           # 直接 cat 试试
ls -la /var/www/html/                    # web 根目录
env | grep -i flag                       # 环境变量里可能藏
```
预期结果：某个 cat 直接吐出 flag 文本。
怎么理解输出：很多入门题 flag 就放在 `/flag`、`/root/flag.txt` 或 web 根目录，名字叫 flag 或 readme；环境变量里也常塞 FLAG=xxx。
如果不行：什么都是空的？进第 3 步，用内容匹配兜底。

#### 第 3 步：目录限定内容搜索
（操作：shell）
```bash
grep -r 'flag{' /var/www /home /tmp /opt /root 2>/dev/null
grep -rli 'flag' /var/www /home /tmp 2>/dev/null      # -l 只列文件名
grep -rhoE 'flag\{[^}]+\}' /var/www /home /tmp 2>/dev/null   # 直接抽出 flag
```
预期结果：命中文件的行内容，或直接抽出符合 `flag{...}` 的字符串。
怎么理解输出：`-r` 递归、`-o` 只输出匹配部分、`-h` 不打印文件名、`-E` 扩展正则。第三条直接打印 flag 本身，不用再翻文件。
如果不行：`grep: binary file matches` 说明命中二进制文件——加 `-a` 强制当文本处理；若还是空，说明 flag 格式不是 flag{，试 `ctf{`、`NSSCTF{`。

#### 第 4 步：全盘内容搜索（慢，慎用）
（操作：shell）
```bash
grep -rhoE 'flag\{[^}]+\}|ctf\{[^}]+\}' / 2>/dev/null
grep -rla 'flag' / 2>/dev/null | head -20
find / -type f -exec grep -l 'flag{' {} \; 2>/dev/null
```
预期结果：全盘抽出所有 flag 格式字符串，或列出命中文件。
怎么理解输出：这是最后手段，可能跑几分钟；先 `timeout 60 grep ...` 限时，或分目录并行跑。命中 `/proc` 的注意那是运行时数据。
如果不行：超时/太慢就回第 3 步加目录；还找不到，flag 可能在压缩包、图片、内存或数据库里——`find / -name '*.zip' -o -name '*.db'` 捡出来逐个翻。

#### 第 5 步：进程与内存环境
（操作：shell）
```bash
strings /proc/*/environ 2>/dev/null | grep -iE 'flag|key|secret'
grep -a 'flag' /proc/*/cmdline 2>/dev/null     # -a 二进制当文本
ls -la /proc/*/cwd 2>/dev/null | grep flag     # 进程工作目录
ps aux | grep -v grep | grep -i flag           # flag 相关进程
```
预期结果：某进程的环境变量/命令行里出现 flag 相关内容。
怎么理解输出：flag 常被作为参数或环境变量传给启动的进程；`/proc/*/environ` 是"所有进程的环境变量"聚合。`tr '\0' '\n' < /proc/PID/environ` 可以把 NUL 分隔转成可读行。
如果不行：hidepid 限制下 /proc 读不到别的进程——回到文件系统搜索。

#### 第 6 步：抽不出/截断的 flag 兜底
（操作：shell）
```bash
# flag 被换行/标签截断：去掉换行再抽
tr -d '\n' < file.txt | grep -oE 'flag\{[^}]+\}'
cat file | tr -d ' \t\r\n' | grep -oE 'flag\{.*\}'
# 编码过的 flag
echo "ZmxhZ3t0ZXN0fQ==" | base64 -d          # base64
echo "666c61677b746573747d" | xxd -r -p      # hex
# 压缩/二进制里翻
strings dump.bin | grep -iE 'flag|\{[a-zA-Z0-9_]+\}'
grep -a 'flag' dump.bin
```
预期结果：拼接后抽出完整 flag，或解码出明文。
怎么理解输出：回显里 flag 被 `<>` 标签、换行截断是常见考点，`tr -d '\n'` 先拼成一行再正则抽取；搜出 `ZmxhZ3...` 这种就是 base64，`666c6167` 是 hex。
如果不行：正则太严格就放宽：`grep -oE 'flag\{.{6,120}\}'`（flag 内允许特殊字符）。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|------|------|------|
| find 全盘扫了几分钟没结果 | 范围太大 | 先 /var/www /home /tmp /opt，加 2>/dev/null |
| grep 报 binary file matches | 命中二进制文件 | 加 `-a` 强制按文本处理 |
| 抽出的是 `flag{abc` 不完整 | flag 含特殊字符或正则太严 | 用 `flag\{.{6,120}\}` 放宽 |
| 搜出 ZmxhZ3t0ZXN0fQ== 看不懂 | base64 编码 | `base64 -d` 解码 |
| /proc 里一堆乱码 | NUL 分隔的环境变量 | `tr '\0' '\n' < /proc/PID/environ` |
| grep -r / 卡死 | 全盘内容搜索 | `timeout 60` 限时或分目录并发 |
| 文件名搜索无果 | flag 文件名不含 flag | 用内容搜索 grep -r |

#### 实战要点
1. 顺序固定：文件名快扫 → 常见藏匿点 → 目录内容搜 → 全盘内容搜（最后）→ 进程环境。别上来就 `grep -r /` 浪费几分钟。
2. `find / -iname '*flag*'` 不区分大小写，能命中 FLAG、Flag、flag。
3. 一条命令直接拿 flag 的通用版：`grep -rhoE 'flag\{[^}]+\}|ctf\{[^}]+\}' /var/www /home /tmp /opt /root 2>/dev/null`。
4. flag 常见藏身处：环境变量、进程参数、日志文件、数据库、压缩包、图片（binwalk）、隐藏文件（.flag）。
5. 抽到 `ZmxhZ3t0ZXN0fQ==`（base64）或 `666c6167`（hex）记得先解码再提交。
6. 找不到时退一步想"这题是什么类型"：Web 题 flag 在数据库/配置文件，取证题 flag 在磁盘/内存，pwn 题 flag 在 /flag。

### [grep-secrets] grep 搜敏感信息 | medium | grep;正则;密钥;token | 搜key
> 用正则匹配 key/token/password/secret/api 等敏感词，常用于部署文件、源码、环境变量与回显抓取。

#### 这个条目的作用
grep 是 CTF 第二神器（第一是 find）。搜密钥、token、密码、API Key、私钥——一条正则下去，把目标机器/源码里的敏感信息全部翻出来。拿到的凭据常常就是下一步：登录后台、连数据库、调内部 API、甚至直接提权。

#### 前置条件
- 有 shell 或源码副本（题目给了源码/附件也能本地 grep）。
- 会正则基础：`|` 或、`[a-z]` 字符类、`{n}` 重复次数、`^` 行首、`.*` 任意。
- 记住 grep 常用参数：`-r` 递归 `-i` 忽略大小写 `-n` 行号 `-l` 只列文件名 `-h` 不打印文件名 `-o` 只输出匹配部分 `-E` 扩展正则。

#### 第 1 步：通用敏感词扫一遍
（操作：shell）
```bash
grep -rniE '(api[_-]?key|secret|token|password|passwd|pwd|private[_-]?key|access[_-]?key)' /var/www /opt /home 2>/dev/null
grep -rn 'password\s*=\s*' /etc /var/www 2>/dev/null
```
预期结果：一列 `文件:行号:内容` 的命中记录。
怎么理解输出：每行是 `路径:行号:匹配内容`，`-n` 给的行号让你直接 `sed -n '12p' file` 精读上下文。`\s*=\s*` 匹配 `password = xxx` 中间任意空格。
如果不行：报错刷屏加 `2>/dev/null`；命中太多就先限定扩展名（第 3 步）。

#### 第 2 步：按云厂商/常见 key 格式搜
（操作：shell）
```bash
grep -rE 'AKIA[0-9A-Z]{16}' / 2>/dev/null            # AWS Access Key
grep -rE 'sk-[A-Za-z0-9]{20,}' / 2>/dev/null         # OpenAI 系 key
grep -rE 'AIza[0-9A-Za-z_-]{35}' / 2>/dev/null       # Google API key
grep -rE 'ghp_[A-Za-z0-9]{36}' / 2>/dev/null         # GitHub PAT
grep -rE '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' / 2>/dev/null
```
预期结果：命中具体格式的密钥字符串。
怎么理解输出：这些是各家密钥的固定前缀+长度特征，正则可以精确命中。私钥特征行是 `-----BEGIN PRIVATE KEY-----`，命中即高价值。
如果不行：云 key 特征版本更新快，搜索无果时用通用敏感词兜底（第 1 步）。

#### 第 3 步：限定文件类型搜源码/配置
（操作：shell）
```bash
grep -rni 'user.*pass' --include='*.php' --include='*.py' --include='*.js' --include='*.env' . 2>/dev/null
ls -la .env config.php wp-config.php settings.py application.yml docker-compose.yml 2>/dev/null
cat .env 2>/dev/null
```
预期结果：源码里所有涉及账号密码的行；或 .env 等配置文件直接列出。
怎么理解输出：`--include` 限定只搜这些扩展名，速度更快噪音更小。wp-config.php、.env、settings.py 是 PHP/Python 项目的标准配置位置，数据库密码基本都在这几个文件。
如果不行：文件不存在就 `find / -name '.env' -o -name 'wp-config.php' 2>/dev/null` 全盘找；`ls` 报错是因为文件不存在，属正常。

#### 第 4 步：环境变量与运行时信息
（操作：shell）
```bash
env | grep -iE 'key|secret|token|pass|flag'
printenv 2>/dev/null | grep -iE 'key|secret|pass'
cat /proc/self/environ | tr '\0' '\n' | grep -iE 'key|secret|pass|flag'
strings /proc/*/environ 2>/dev/null | grep -iE 'KEY|SECRET|TOKEN'
```
预期结果：环境变量里带 key/secret/token 的行。
怎么理解输出：部署时把 DB 密码、API key 塞环境变量是常态（尤其 docker-compose 的 environment 段）。`/proc/self/environ` 是 NUL 分隔，`tr '\0' '\n'` 换成一行一个变量才能 grep。
如果不行：环境变量搜不到就查进程启动参数：`grep -a 'pass' /proc/*/cmdline 2>/dev/null`。

#### 第 5 步：回显截断与隐藏字段
（操作：shell）
```bash
# 题目回显把长 key 截断：只抽匹配段
curl -s http://target/api/config | grep -oE '(key|token|secret)["\x27:= ]+[A-Za-z0-9_\-\.]{8,}'
# JSON 里搜
curl -s http://target/api/info | grep -oiE '"(api[_-]?key|token|secret|password)"\s*:\s*"[^"]+"'
# 或从返回的 JS 里找
curl -s http://target/app.js | grep -oE 'sk-[A-Za-z0-9]{20,}'
```
预期结果：从接口回显或 JS 文件里抽出密钥片段。
怎么理解输出：前端 JS、接口返回的 JSON 里常硬编码测试密钥/调试凭据；`-o` 只输出匹配部分，专治"回显太长被截断"。
如果不行：接口要带 Cookie/Header 才返回完整内容：`curl -s -H 'Cookie: ...'` 再 grep。

#### 第 6 步：命中后的利用闭环
（操作：shell）
```bash
# 1) 拿到 DB 密码 -> 连库翻表
mysql -u root -p'PASS' -e 'SHOW DATABASES;' 2>/dev/null
# 2) 拿到后台密码 -> 登录找 flag
curl -s -d 'user=admin&pass=PASS' http://target/login
# 3) 拿到云 key -> 试试云 API（对应厂商控制台/CLI）
# 4) 拿到私钥 -> 尝试 SSH
chmod 600 id_rsa && ssh -i id_rsa user@target
```
预期结果：凭据被用于下一步动作（连库、登录、SSH）。
怎么理解输出：grep 出来的值要立刻用起来——数据库密码对应 mysql 连接，私钥对应 SSH 登录，这就是"信息收集驱动攻击链"。
如果不行：登录失败先确认目标端口/协议没猜错：`ss -tlnp` 看开了什么服务再对症下药。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|------|------|------|
| grep 输出被截断 | 一行太长 | 加 `-o` 只输出匹配部分 |
| 搜不到但题目说有 key | 大小写/命名变体 | `-i` 忽略大小写，关键词加 `_|-|\.` 变体 |
| /proc 环境变量乱码 | NUL 分隔 | `tr '\0' '\n'` 转换后再 grep |
| --include 写法报错 | 语法顺序错 | `--include='*.php'` 放在路径前：`grep -r --include='*.php' 'kw' /dir` |
| 密码里有正则特殊字符 | 正则在转义 | 用 `grep -F` 固定字符串匹配，或 `grep -- 'password=abc$'` |
| 结果太多刷屏 | 范围太大 | 加 `--include` 限定类型，或先 `-l` 列文件名再精读 |
| 私钥权限报错 | 私钥必须 600 | `chmod 600 id_rsa` 再 ssh -i |

#### 实战要点
1. 优先级：配置文件（.env/wp-config/application.yml）→ 环境变量 → 源码硬编码 → 前端 JS/接口回显。
2. 一条万能开头命令：`grep -rniE '(api[_-]?key|secret|token|password|passwd)' /var/www /opt /home 2>/dev/null`。
3. 拿到密码先想清楚用途：MySQL 口/SSH 口/后台登录口，`ss -tlnp` 看监听端口对号入座。
4. 云 key 特征可扩展：AKIA（AWS）、sk-（OpenAI）、AIza（Google）、ghp_（GitHub）、Bearer 头。
5. 回显被截断永远先想 `-o` 只抽匹配段，别手抄长字符串。
6. 搜完记得删敏感文件副本，别把凭据留在自己机器上（尤其上传过的题目环境）。

### [log-config-search] 日志与配置定位 | medium | 日志;配置;搜索;路径 | log
> 拿到 RCE 后快速定位日志、配置、源码路径，Web 日志里的请求参数、源码路径与数据库密码是高频信息源。

#### 这个条目的作用
拿到 RCE/shell 后，接下来就是"机器上有哪些日志、配置、源码值得读"。Web 日志里有每个请求的参数（包括被过滤掉的 payload、管理员的登录记录）、报错日志泄露绝对路径、配置文件里有数据库密码和内部服务地址——这三样是信息收集的富矿。

#### 前置条件
- 已获得 shell（命令执行/反弹 shell）。
- 知道目标大概率是 Web 应用：nginx/apache 是常见 Web 服务器，日志在 /var/log。
- 记得路径三件套：/var/log（日志）、/etc 与 /opt 与 /usr/local（配置）、/var/www 与 /var/www/html（Web 根）。

#### 第 1 步：找日志文件
（操作：shell）
```bash
ls /var/log/ 2>/dev/null                    # 常见日志目录
find / -name '*.log' -type f 2>/dev/null | head -50
find /var/log -type f 2>/dev/null | head -30
```
预期结果：一列日志文件路径：access.log、error.log、syslog、messages、auth.log 等。
怎么理解输出：access.log 是访问日志（每个 HTTP 请求一行），error.log 是错误日志（泄露路径），auth.log 是登录日志。文件名本身告诉你它的用途。
如果不行：容器里 /var/log 可能是空的（日志打到 stdout）——docker logs 场景下日志在控制台，或看 `/proc/1/fd/1`。

#### 第 2 步：看 Web 访问日志
（操作：shell）
```bash
tail -n 100 /var/log/nginx/access.log 2>/dev/null
tail -n 100 /var/log/apache2/access.log 2>/dev/null
tail -n 100 /var/log/httpd/access_log 2>/dev/null    # RHEL 系 Apache
tail -f /var/log/nginx/access.log 2>/dev/null        # 实时盯新请求
```
预期结果：每行一个请求：`IP - - [时间] "GET /路径 HTTP/1.1" 状态码 大小 "UA"`。
怎么理解输出：第 7 段是请求行——能看到别人（包括出题人/管理员）访问过哪些路径，管理后台路径、flag 页面都在里面；状态码 200/302/403/500 说明请求结果。
如果不行：nginx 和 apache 的日志都空？可能 Web 服务是别的（caddy/tomcat），`find / -name '*.log'` 全盘找；或用 `ss -tlnp` 看 Web 服务是什么再定日志位置。

#### 第 3 步：翻报错日志找绝对路径
（操作：shell）
```bash
tail -n 100 /var/log/nginx/error.log 2>/dev/null
grep -iE 'fatal|error|warning|failed' /var/log/nginx/error.log 2>/dev/null | tail -20
grep -E '/var/www|/opt|/usr/local' /var/log/*.log 2>/dev/null | head
```
预期结果：含 `/var/www/html/...`、`include_path`、`open_basedir` 等绝对路径的行。
怎么理解输出：PHP/Nginx 报错日志会打印"文件不存在的完整路径"和"include 失败路径"——这些路径直接告诉你源码在哪、写 webshell 该往哪写。
如果不行：error.log 不存在就先看 access.log 里 404 的路径，同样能反推目录结构。

#### 第 4 步：找配置文件
（操作：shell）
```bash
find /etc /opt /usr/local /var/www \( -name '*.conf' -o -name '*.ini' -o -name '*.yml' \) 2>/dev/null
ls /etc/nginx/nginx.conf /etc/httpd/conf/httpd.conf /etc/php.ini 2>/dev/null
find / -name 'wp-config.php' -o -name '.env' -o -name 'settings.py' -o -name 'config.php' 2>/dev/null | head
```
预期结果：配置文件路径列表。
怎么理解输出：nginx.conf 里有 server 块（站点根目录、反代目标、location 规则），php.ini 里有 disable_functions/open_basedir（决定你能执行什么），wp-config.php/.env 里有数据库密码。
如果不行：`find` 的 `-o` 优先级坑：多个 `-name` 用 `-o` 连接时要加括号 `\( ... \)`，否则 `-type` 之类条件只作用于后半段。

#### 第 5 步：从配置里挖数据库密码
（操作：shell）
```bash
grep -rE '(mysql|db|database|DB_|MYSQL_)' /var/www /opt 2>/dev/null | grep -iE 'pass|pwd|user' | head
cat /var/www/html/wp-config.php 2>/dev/null | grep -E "DB_(NAME|USER|PASSWORD|HOST)"
grep -rE 'DB_PASSWORD|MYSQL_PASSWORD|POSTGRES_PASSWORD' /var/www /opt /etc 2>/dev/null
```
预期结果：`DB_PASSWORD = 'xxx'` 之类的行。
怎么理解输出：PHP 项目配置在 wp-config.php / config.php / database.php，Python 在 settings.py / .env，Java 在 application.yml / application.properties——搜 DB_PASSWORD 这类环境变量名最通用。
如果不行：`grep -E` 没命中就放宽 `grep -riE 'pass|pwd' /var/www`，配置可能用了自定义变量名。

#### 第 6 步：locate/updatedb 加速与杂项清单
（操作：shell）
```bash
locate wp-config.php 2>/dev/null            # 基于索引秒出
updatedb 2>/dev/null                        # 索引不存在时先建（root 或 sudo）
# 杂项信息源检查清单
ls -la ~/.bash_history /root/.ssh/known_hosts /etc/shadow /etc/passwd 2>/dev/null
tail -n 50 ~/.bash_history 2>/dev/null      # 历史命令里常有密码/路径
cat /root/.ssh/known_hosts 2>/dev/null      # 连过哪些内网主机
```
预期结果：locate 秒出文件路径；bash_history 里可能有一整条攻击/运维命令历史。
怎么理解输出：locate 依赖 updatedb 的索引（可能过期/未装），find 永远兜底。bash_history 泄露管理员敲过的命令——数据库密码、内网 IP、备份命令全在里面。
如果不行：history 为空说明 shell 无交互或 HISTFILE 被清；known_hosts 没有就跳过，别在这耗时间。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|------|------|------|
| access.log 不存在 | Web 服务不是 nginx/apache | `ss -tlnp` 看服务，或 `find / -name '*.log'` |
| find -name 组合条件失效 | -o 优先级问题 | 加括号：`find /etc \( -name '*.conf' -o -name '*.ini' \)` |
| 日志是空的 | 容器日志打到 stdout | 从控制台/`/proc/1/fd/1` 看 |
| locate: command not found | 未装 mlocate | 用 find 代替，或 `updatedb` |
| wp-config.php 读不了 | 权限不足 | `ls -l` 确认属主；换更高权限 shell |
| grep 配置文件报 binary | 文件被识别为二进制 | 加 `-a` 强制文本 |
| 日志时间戳全是 UTC 对不上 | 时区设置 | 只关注路径和请求内容，时间换算 `date -d @epoch` |

#### 实战要点
1. 信息源优先级：access.log（路径+参数）→ error.log（绝对路径）→ 配置文件（密码）→ bash_history（历史命令）。
2. 拿到绝对路径立刻用：写 webshell、读源码、确认 open_basedir 绕过目标。
3. nginx 反代场景：access.log 里的 Host 头/反代路径泄露内网服务拓扑，配合 `grep -iE 'proxy_pass|upstream' /etc/nginx/nginx.conf`。
4. bash_history 是金矿：`tail -n 100 ~/.bash_history` 常直接给出数据库密码、备份路径、之前攻击者（或出题人）的命令。
5. 容器环境日志可能不在 /var/log：`ls /proc/1/fd/`、`cat /proc/1/environ` 是备选信息源。
6. 看完日志记得：access.log 里的请求参数就是你的攻击面清单——每个 4xx/5xx 路径都值得手动 curl 复测。
