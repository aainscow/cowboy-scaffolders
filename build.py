import re, pathlib
src = pathlib.Path('src')
THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/'
def strip_local(code):
    code = re.sub(r"^import [^;]*? from '\./[^']+';\n", '', code, flags=re.M | re.S)
    code = re.sub(r"^export (const|function|class|let) ", r"\1 ", code, flags=re.M)
    return code
g1 = (src/'g1_world.js').read_text()
imports = ''.join(l + '\n' for l in g1.splitlines() if l.startswith('import ') and "'./" not in l)
g1_body = '\n'.join(l for l in g1.splitlines() if not l.startswith('import '))
parts = [imports, strip_local((src/'engine.js').read_text()), strip_local((src/'levels.js').read_text()), g1_body,
         (src/'g2_level.js').read_text(), (src/'g3_actors.js').read_text(), (src/'g4_game.js').read_text()]
js = '\n'.join(parts)
importmap = '<script type="importmap">{"imports":{"three":"%sbuild/three.module.js","three/addons/":"%sexamples/jsm/"}}</script>' % (THREE, THREE)
import datetime
BUILD = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
html = (src/'shell.html').read_text().replace('__BUILD__', BUILD) + '\n' + importmap + '\n<script type="module">\n' + js + '\n</script>\n'
pathlib.Path('dist').mkdir(exist_ok=True)
pathlib.Path('dist/index.html').write_text(html)
# local preview wrapper (full document) for headless screenshots
full = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + html + '</body></html>'
pathlib.Path('dist/local.html').write_text(full)
# standalone copy served by GitHub Pages
pathlib.Path('docs').mkdir(exist_ok=True)
pathlib.Path('docs/index.html').write_text(full)
print('ok', len(html)//1024, 'KB')
