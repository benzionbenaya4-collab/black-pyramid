"""Builds site.html — the web version of the game for publishing (CSS inlined, no document skeleton)."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
import sys
src_name, css_name, out_name = (sys.argv[1:4] if len(sys.argv) >= 4 else ('index.html', 'style.css', 'site.html'))
html = (root / src_name).read_text(encoding='utf-8')
css = (root / css_name).read_text(encoding='utf-8')
head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
head = re.sub(r'\s*<meta charset[^>]*>|\s*<meta name="viewport"[^>]*>', '', head)
head = re.sub(r'<link rel="stylesheet" href="%s(\?v=[0-9a-f]+)?">' % re.escape(css_name),
              lambda _: '<style>\n:root { color-scheme: dark; background: #000; }\n' + css + '\n</style>', head)
# the published artifact has its own versioning: drop the ?v= cache stamps (used by GitHub Pages)
head = re.sub(r'\?v=[0-9a-f]+', '', head); body = re.sub(r'\?v=[0-9a-f]+', '', body)
head += "\n<script>document.documentElement.dir = 'rtl'; document.documentElement.lang = 'he';</script>"
out = head.strip() + '\n' + body.strip() + '\n'
(root / out_name).write_text(out, encoding='utf-8')
print(out_name, len(out), 'bytes')
