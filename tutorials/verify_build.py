# -*- coding: utf-8 -*-
import re, sys

c = open(r'<仓库根目录>/ctf-web-kb.html', encoding='utf-8').read()
checks = [
    ("分类名出现次数", c.count('ReDoS 与时间侧信道')),
    ("flag 串", 'nsilab{22f8fbd8-****-****-****-************}' in c),
    ("redos 条目数", len(re.findall(r'"id":"redos-[a-z]+"', c))),
    ("三件套 payload", '(?=猜的前缀)([\\s\\S]+)+(?!)' in c),
    ("(?!) 构造", '(?!)' in c),
    ("实战 flag 条目", 'redos-case' in c),
    ("举一反三条目", 'redos-variant' in c and 'redos-extend' in c),
]
for name, ok in checks:
    print(f"{'OK ' if ok else 'BAD'}  {name}: {ok}")
print("HTML 大小:", len(c), "字节")
print("全部通过" if all(ok for _, ok in checks) else "有未通过项")