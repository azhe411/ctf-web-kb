# tools|工具与速查手册|🧰

## [g-dir] 目录与资源枚举——找后台、找备份、找接口
### [dirsearch-guide] dirsearch 完整教程——从安装到扫穿靶机（零基础 7 步） | easy | dirsearch;目录扫描;枚举;字典;安装;排错 | dirsearch教程;dirsearch安装;dirsearch参数;dirsearch 用法;dirsearch windows;目录扫描工具;dirsearch怎么用;dirsearch全参数
> 零基础 7 步：dirsearch 是什么、Windows/Linux 怎么装（含国内镜像）、第一个扫描长什么样、每个参数逐个讲、怎么看懂结果、真实题目完整实战、踩坑排错表。照着抄就能扫穿大多数靶机。

#### 这个条目的作用
一句话：dirsearch 是一个「自动替你猜网站里藏着什么文件/目录」的命令行工具。你把网址给它，它拿着一个**字典**（几千上万条常见路径名），一条一条地问服务器「这个路径存在吗？」，然后把**存在的**都列给你看。

为什么要用它？因为网站的隐藏文件你**没法用鼠标点出来**——`shell.php`、`backup.zip`、`.git/config`、`admin/login.php` 这些不会出现在首页上，但服务器上就是有。手工一个个试网址 = 大海捞针；dirsearch = 拿吸铁石过一遍，几秒到几分钟把整个沙滩的针都吸出来。

> [!info] 类比：浏览器是「逛商场」，你只能看到店铺挂出来的招牌；dirsearch 是「拿着商场物业的钥匙挨个开房间」，把每个门后面藏着什么全翻出来。

#### 前置条件
- 一台电脑，能打开终端（黑窗口）。
- 一个**你被授权测试**的目标地址（自己搭的靶机、CTF 比赛靶机、授权的渗透测试目标）。**不要拿它扫你没权限的网站**，目录扫描会留下大量访问日志。
- dirsearch 本身（第 1 步教你装）。

#### 第 1 步：安装（Windows 看这里，别去 GitHub 硬刚）
dirsearch 是一个 Python 工具，装它最省事的方式是 pip（Python 的软件管家）。**先确认有 Python**，终端里输入：
```bash
python --version
```
看到 `Python 3.x.x` 就继续。然后**直接装**（这是关键：很多人卡在 GitHub clone 被墙，pip 国内源又快又稳）：
```bash
python -m pip install dirsearch -i https://pypi.tuna.tsinghua.edu.cn/simple
```
- `-i https://pypi.tuna.tsinghua.edu.cn/simple`：指定清华镜像源。**国内网络直连官方源大概率超时，这一句别省**。
- 装完验证：
```bash
dirsearch --version
```
能看到版本号（如 `0.5.0`）就装好了，直接跳到第 2 步。

其他安装方式（备选）：
| 方式 | 命令 | 什么时候用 |
|---|---|---|
| pip 清华源（推荐） | `python -m pip install dirsearch -i https://pypi.tuna.tsinghua.edu.cn/simple` | Windows / Linux 通用，最快最稳 |
| GitHub clone | `git clone https://github.com/maurosoria/dirsearch.git && cd dirsearch && python dirsearch.py -u http://x` | 网络能直连 GitHub 时；被墙/被重置就别挣扎了，用 pip |
| Kali / Debian / Ubuntu | `sudo apt install dirsearch` | Linux 上 apt 源里有就直接装 |

> [!warn] GitHub clone 报 `Recv failure: Connection was reset` = 直连被墙，换 pip 清华源，别再重试 clone。
> [!tip] 装了新版（0.5.x+）后命令名就是 `dirsearch`；老教程里的 `python dirsearch.py` 只在 clone 源码方式下用。

#### 第 2 步：发出第一个扫描，看懂输出
终端里输入（`http://target.com` 换成你的目标）：
```bash
dirsearch -u http://target.com -e php
```
输出长这样（以 0.5.0 为例）：
```txt
Extensions: php | HTTP method: GET | Threads: 25 | Wordlist size: 9611

Target: http://target.com

[12:00:01] 200 -    0B  - /index.php
[12:00:02] 301 -  178B  - /admin  ->  /admin/
[12:00:02] 403 -  199B  - /server-status
[12:00:05] 200 - 1.2KB  - /shell.php

Task Completed
```
每一行的意思是：
| 部分 | 含义 |
|---|---|
| `[12:00:02]` | 发现时间（不必关心） |
| `200 / 301 / 403...` | **状态码**，这是重点（第 4 步细讲） |
| `0B / 178B / 1.2KB` | 响应大小，越大越可能是真东西 |
| `/shell.php` | 发现的路径 |
| `-> /admin/` | 301 跳转到哪 |

> [!info] 屏幕第一行 `Wordlist size: 9611` = 这次要猜 9611 个路径；`Threads: 25` = 默认同时发 25 个请求。Target 下面的空行之后，**每扫到一个存在的东西就打印一行**。
> [!tip] 新手最常见的困惑「怎么扫完什么都没显示？」——要么目标真没东西（不太可能），要么 404 刷屏把有用的淹了，见第 3 步的 `-x 404`。

#### 第 3 步：参数逐个讲（背这张表就够）
dirsearch 的万能句式：
```txt
dirsearch -u 目标 [其他参数们]
```
`-u` 是唯一必填参数，其他都是可选的开关，顺序无所谓：

| 参数 | 作用 | 最常用例子 | 说明 |
|---|---|---|---|
| `-u 网址` | 目标（必填） | `-u http://target.com` | 打靶机记得带端口：`-u http://1.2.3.4:8080` |
| `-e 扩展名` | 要追加探测哪些后缀 | `-e php,html,txt,zip,bak` | 不加它只扫无后缀路径。PHP 靶机优先 `-e php`，再加 `bak,zip,txt` 找备份 |
| `-w 字典文件` | 自定义字典 | `-w my_dict.txt` | 默认字典 9000+ 条；按场景换字典（后台/备份/接口词表），见知识库「字典要点」条目 |
| `-t 数字` | 线程数（同时发多少请求） | `-t 5` | 默认 25。**小靶机请降到 5-10**，25 线程可能把靶机扫崩（第 6 步有真实案例） |
| `-x 状态码` | 排除（不显示）这些状态码 | `-x 404,403` | 最常用的净化参数，把无意义的 404 刷屏过滤掉 |
| `-i 状态码` | 只显示这些状态码 | `-i 200,301,302` | 和 `-x` 反着来，只看「存在」的 |
| `-r` | 递归：扫到目录后自动扫它的子目录 | `-r` | 扫到 `/admin` 会继续扫 `/admin/xxx`；目录深的站很费时 |
| `--random-agent` | 每个请求随机 UA | `--random-agent` | 伪装成浏览器，防被 WAF/日志按 UA 拦截 |
| `-k` | 跳过 HTTPS 证书检查 | `-k` | 靶机自签名证书必备，不加会 SSL 报错中断 |
| `-o 文件` | 结果存文件 | `-o result.txt` | **强烈建议加上**：终端输出会被进度条刷乱，存文件最稳 |
| `--timeout 秒` | 单请求超时 | `--timeout 10` | 目标慢时防止卡死 |
| `-m 秒` | 每个请求间隔（限速） | `-m 2` | 对敏感目标降速，别把服务器打挂 |

一个组合好的「打靶标准命令」：
```bash
dirsearch -u http://target.com -e php,html,txt,zip,bak -t 10 -x 404 -k --random-agent -o result.txt
```
拆解：扫 PHP 靶机常见后缀 → 10 线程（不欺负小服务器）→ 过滤掉 404 → 跳过证书检查 → 随机 UA → 结果落盘。

> [!warn] 版本差异：`--format`（输出格式）、`--min-response-size`（过滤过小响应）等参数是**较新版本**才有的。pip 装的 0.5.0 没有 `--format`，用了会直接报 `no such option`。拿不准就先 `dirsearch --help` 看当前版本支持哪些参数，比记网上的旧教程靠谱。
> [!tip] 扫描前先看一眼目标用什么语言/框架（见知识库「指纹识别」条目），再定 `-e`：PHP 站扫 `php`，Java 站扫 `jsp,do`，Node 站扫 `js,json`。

#### 第 4 步：看懂结果——状态码速查表
扫描结果里最重要的就是状态码，看到就照表行动：

| 状态码 | 含义 | 下一步 |
|---|---|---|
| `200` | 存在且可直接访问 | **逐个打开看内容**，大概率有料（flag、备份、后台） |
| `301 / 302` | 存在，会跳转到别处 | 记下 `->` 箭头指的地址，跟着去 |
| `401` | 存在，要登录认证 | 记下来，试试弱口令/默认密码 |
| `403` | 存在，但禁止访问 | 别急着放弃：可能是目录（试试 `-r` 递归扫里面），也可能是配置错误 |
| `500` | 存在，服务器处理报错 | 访问一下看报错信息，可能泄露路径/技术栈 |
| `404` | 不存在 | 正常噪音，扫的时候用 `-x 404` 过滤掉 |

判断口诀：**状态码 < 400 的都值得点开看一眼**；`200` 的 `php/bak/zip` 文件优先看——`shell.php`、`backup.zip`、`index.php.bak` 这类名字本身就是在告诉你答案。

> [!info] 响应大小也有用：`1.2KB` 的 `shell.php` 和 `0B` 的 `index.php` 比，前者更像真内容。同样状态码下，体积反常的文件优先检查。

#### 第 5 步：完整实战流程（真实题目演示）
下面是一个真实发生过的流程（NEFU CTF 靶机，题目「flag 藏在 HTML 源码里」）：
```bash
# 1) 起手扫描：PHP 靶机，低线程防打崩，过滤 404，结果存文件
dirsearch -u http://contest.ctf.nefu.edu.cn:31179/ -e php -t 5 -x 404 -o result.txt
```
结果里出现：
```txt
[12:00:05] 200 - 190B - /shell.php
```
```bash
# 2) 直接打开发现的文件
curl http://contest.ctf.nefu.edu.cn:31179/shell.php
```
拿到：
```html
flag{8f5bf8ba-****-****-****-************}
```
**就这么简单**：题目的设计是让你手动点 201 层连环页面（每页藏一个字符拼出下一个文件名），但一个目录扫描 30 秒就把作者藏起来的 `shell.php` 直接扫出来了。**目录扫描永远排在手动探索前面。**

标准打靶姿势：
```bash
# 第一遍：快速摸底（常见后缀）
dirsearch -u http://target -e php,html,txt -t 10 -x 404 -o pass1.txt
# 第二遍：按第一遍发现的线索换字典/递归（比如发现 /admin/ 就钻进去）
dirsearch -u http://target/admin/ -e php -t 10 -x 404 -r -o pass2.txt
# 第三遍：针对备份文件（很多题目备份文件名很随意，换备份词表）
dirsearch -u http://target -w backup_words.txt -e zip,bak,txt -t 10 -x 404 -o pass3.txt
```

#### 第 6 步：踩坑与排错表
| 现象 | 原因 | 解决 |
|---|---|---|
| 扫到一半服务器开始拒绝连接/超时，之后整个站都访问不了 | **线程太高把靶机打崩了**（25 线程 × 近万请求对本地小靶机是暴击） | 降到 `-t 5`；等靶机恢复再扫；以后默认 `-t 5~10` |
| 结果文件是空的，但明明有文件 | 服务器中途挂掉/限流；或 404 之外的噪音把输出刷没 | 重扫；用 `-o` 存文件；降线程；加 `--timeout` |
| GitHub clone 报 `Connection was reset` | 直连 GitHub 被墙 | 用 `pip install dirsearch -i https://pypi.tuna.tsinghua.edu.cn/simple` |
| Windows PowerShell 里输出乱码/滚动条刷屏 | PowerShell 对管道输出处理不同 | 用 `-o 结果.txt` 存文件再 `Get-Content 结果.txt`；别盯着终端看 |
| 报 `no such option: --format` | 版本太老，没这参数 | `dirsearch --help` 看当前版本支持什么；别抄网上新教程的冷门参数 |
| 扫了很久一条都没扫到 | 字典不匹配 / 目标要求特定 UA / 目标挂了 | 换场景字典（后台/备份词表）；加 `--random-agent`；确认目标活着 |
| HTTPS 目标报证书错误中断 | 自签名证书 | 加 `-k` |
| 结果一堆 403 | 存在但禁止访问，不是没有 | 403 的目录试试 `-r` 递归；403 的文件换 UA/Referer 再访问 |
| 找到文件但打开是 404 页面 | 服务器把未知路径全回 404 页面内容 | 看 `-x 404` 前原始状态码；以状态码为准，别信内容 |

> [!warn] 最重要的一条：**别拿默认 25 线程扫你没把握的小靶机**。目录扫描的本质是高速发请求，靶机（尤其 CTF 本地环境）带宽和处理能力有限，扫崩了靶机，题也没了。`-t 5` 慢不了几分钟，但稳。
> [!warn] 权限红线：目录扫描会留下大量访问日志，只对你有权限的目标用；大范围/公网扫描注意节奏（`--random-agent`、限速）。

#### 实战要点
- **起手式**：拿到靶机第一件事不是看页面，是 `dirsearch -u 目标 -e 对应后缀 -t 5 -x 404 -o 结果`。30 秒可能省下 1 小时的手工探索。
- **字典 > 工具**：dirsearch、ffuf、gobuster 用同一字典结果差不多，选一个熟练即可；真正拉开差距的是按场景换字典（后台词表、备份词表、API 词表）。
- **扫到目录别停**：`-r` 递归钻进去；把新发现的路径名加进字典继续扫。
- **结果永远存文件**：`-o result.txt`，扫描完慢慢看，比被进度条刷乱的终端靠谱一百倍。
- **和别的工具组合**：先 `nmap` 摸端口 → `dirsearch` 扫目录 → 发现线索后用 curl/Burp 验证（见 curl 教程）。四步下来，一道 Web 题的攻击面基本就出来了。
