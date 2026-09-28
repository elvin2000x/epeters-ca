# thumbs.py: screenshot every live exhibit in content/exhibits.json into img/ex/<id>.webp (card #356).
# Run from the repo root: python scripts/thumbs.py [id ...]   (no ids = all with a thumb)
# Needs Playwright (python -m playwright install chromium) and Pillow with WebP.
# On-site hrefs are shot from the live site, so run it after they're pushed.
import io, json, sys, pathlib
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / 'content' / 'exhibits.json').read_text(encoding='utf-8'))
W, H = 480, 300  # 16:10, the Scan card and sheet size

def url(href):
    return 'https://epeters.ca' + href if href.startswith('/') else href

want = set(sys.argv[1:])
todo = [e for e in DATA['exhibits'] if e.get('thumb') and e.get('checked') and (not want or e['id'] in want)]
(ROOT / 'img' / 'ex').mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=1, color_scheme='dark')
    for e in todo:
        pg = ctx.new_page()
        try:
            pg.goto(url(e['href']), wait_until='domcontentloaded', timeout=45000)
        except Exception as err:
            print('WARN load', e['id'], err)
        pg.wait_for_timeout(3500)
        img = Image.open(io.BytesIO(pg.screenshot())).convert('RGB').resize((W, H), Image.LANCZOS)
        out = ROOT / e['thumb'].lstrip('/')
        img.save(out, 'WEBP', quality=74, method=6)
        print(f"{e['id']:10} {out.stat().st_size // 1024:3} KB  {url(e['href'])}")
        pg.close()
    b.close()
