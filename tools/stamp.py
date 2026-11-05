#!/usr/bin/env python3
"""Cache-busting: give every module a ?v=<content hash> URL in index.html / movies.html, so browsers
(Xbox Edge caches hard) never mix old and new files. Run before committing: python3 tools/stamp.py"""
import hashlib, json, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
mods = sorted((root / 'src').glob('*.js'))
h = {m.name: hashlib.sha1(m.read_bytes()).hexdigest()[:8] for m in mods}
build = hashlib.sha1(''.join(h[k] for k in sorted(h)).encode()).hexdigest()[:7]
for page, entry in (('index.html', 'main.js'), ('movies.html', 'movies.js')):
    p = root / page
    s = p.read_text(encoding='utf-8')
    imports = {'three': './vendor/three/build/three.module.js', 'three/addons/': './vendor/three/addons/'}
    for name in sorted(h):
        imports[f'./src/{name}'] = f'./src/{name}?v={h[name]}'
    block = '<script type="importmap">\n' + json.dumps({'imports': imports}, indent=2) + '\n  </script>'
    s = re.sub(r'<script type="importmap">.*?</script>', lambda _: block, s, count=1, flags=re.S)
    s = re.sub(r'<script type="module" src="src/%s(\?v=[0-9a-f]+)?"></script>' % re.escape(entry),
               f'<script type="module" src="src/{entry}?v={h[entry]}"></script>', s)
    for css in ('style.css', 'movies.css'):
        ch = hashlib.sha1((root / css).read_bytes()).hexdigest()[:8]
        s = re.sub(r'href="%s(\?v=[0-9a-f]+)?"' % re.escape(css), f'href="{css}?v={ch}"', s)
    if '<meta name="build"' in s:
        s = re.sub(r'<meta name="build" content="[^"]*">', f'<meta name="build" content="{build}">', s)
    else:
        s = s.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n  <meta name="build" content="{build}">', 1)
    p.write_text(s, encoding='utf-8')
print('build', build)
