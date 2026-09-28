"""Render a post's featured image (1600x900 WebP, plus 800 wide) and share card (1200x630 PNG) from the HTML templates.

Usage: python render_images.py <post_img_dir>
  <post_img_dir>/image.json holds: eyebrow, title, big, big_label, diagram (HTML), headshot (path relative to post_img_dir)
Card #361, 2026-09-27. BLOG-DESIGN.md section 6. No image generation, no credits.
"""
import json, os, sys, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image

HERE = pathlib.Path(__file__).parent

def fill(tpl, data):
    s = (HERE / 'templates' / tpl).read_text(encoding='utf-8')
    for k, v in data.items():
        s = s.replace('{{' + k + '}}', v)
    return s

def main():
    out = pathlib.Path(sys.argv[1]).resolve()
    data = json.loads((out / 'image.json').read_text(encoding='utf-8'))
    data['headshot'] = (out / data.get('headshot', '')).resolve().as_uri()
    # No headline number -> the featured image sets the title in type; no diagram -> one column.
    data['mode'] = ' '.join(m for m, empty in (('nobig', not data.get('big')), ('nodiagram', not data.get('diagram'))) if empty)
    jobs = [('featured.html', 1600, 900, 'featured'), ('og.html', 1200, 630, 'og')]
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for tpl, w, h, name in jobs:
            tmp = out / f'_{name}.html'
            tmp.write_text(fill(tpl, data), encoding='utf-8')
            pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2)
            pg.goto(tmp.as_uri(), wait_until='networkidle', timeout=30000)
            pg.evaluate('document.fonts.ready')
            pg.wait_for_timeout(400)
            png = out / f'_{name}@2x.png'
            pg.screenshot(path=str(png))
            pg.close(); tmp.unlink()
            im = Image.open(png).convert('RGB')
            if name == 'featured':
                im.resize((1600, 900), Image.LANCZOS).save(out / 'featured-1600.webp', 'WEBP', quality=80, method=6)
                im.resize((800, 450), Image.LANCZOS).save(out / 'featured-800.webp', 'WEBP', quality=80, method=6)
            else:
                im.resize((1200, 630), Image.LANCZOS).save(out / 'og.png', 'PNG', optimize=True)
            png.unlink()
        b.close()
    for f in ('featured-1600.webp', 'featured-800.webp', 'og.png'):
        print(f, os.path.getsize(out / f) // 1024, 'KB')

if __name__ == '__main__':
    main()
