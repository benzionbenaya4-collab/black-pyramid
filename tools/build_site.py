"""Builds site.html — the web version of the game for publishing (CSS inlined, no document skeleton)."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'style.css').read_text(encoding='utf-8')
head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
head = re.sub(r'\s*<meta charset[^>]*>|\s*<meta name="viewport"[^>]*>', '', head)
head = head.replace('<link rel="stylesheet" href="style.css">',
                    '<style>\n:root { color-scheme: dark; background: #000; }\n' + css + '\n</style>')
head += "\n<script>document.documentElement.dir = 'rtl'; document.documentElement.lang = 'he';</script>"
out = head.strip() + '\n' + body.strip() + '\n'
(root / 'site.html').write_text(out, encoding='utf-8')
print('site.html', len(out), 'bytes')
