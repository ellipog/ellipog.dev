"""
Typesets the specimen sheets from the font files directly.

The in-app browser's screenshots tile a ~720px render and cannot represent a 1440px desktop layout,
so the sheets are drawn here instead: exact sizes, exact variable-font axes, the site's own tokens and
copy. Two pixels per CSS pixel, so the 10.5-11.5px chrome is legible at 100%.

  python render.py                 -> every sheet
  python render.py compare axes    -> named sheets only
"""
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
import os, sys

S = 2                      # device pixels per CSS pixel
W = 1440                   # CSS width of every sheet

LIGHT = dict(bg=(255, 255, 255), sunken=(250, 250, 250), fg=(9, 9, 11), muted=(82, 82, 91),
             faint=(161, 161, 170), line=(228, 228, 231), inv=(255, 255, 255))
DARK = dict(bg=(9, 9, 11), sunken=(14, 14, 17), fg=(250, 250, 250), muted=(161, 161, 170),
            faint=(82, 82, 91), line=(38, 38, 42), inv=(9, 9, 11))

AXES = {}
def axis_order(path):
    if path not in AXES:
        AXES[path] = [a.axisTag for a in TTFont(path)['fvar'].axes]
    return AXES[path]

_cache = {}
def font(path, size, axes=None):
    key = (path, size, tuple(sorted((axes or {}).items())))
    if key not in _cache:
        f = ImageFont.truetype(path, int(round(size * S)))
        if axes:
            order = axis_order(path)
            f.set_variation_by_axes([axes.get(t, TTFont(path)['fvar'].axes[i].defaultValue)
                                     for i, t in enumerate(order)])
        _cache[key] = f
    return _cache[key]

def has(path, ch):
    return ord(ch) in TTFont(path).getBestCmap()

FALLBACK = 'C:/Windows/Fonts/arial.ttf'

class Sheet:
    def __init__(self, height, theme=LIGHT):
        self.t = theme
        self.im = Image.new('RGB', (W * S, int(height * S)), theme['bg'])
        self.d = ImageDraw.Draw(self.im)

    def hair(self, y, x1=0, x2=W, color=None, w=1):
        d = self.d
        d.rectangle([x1 * S, int(y * S), x2 * S - 1, int(y * S) + w - 1], fill=color or self.t['line'])

    def vhair(self, x, y1, y2, color=None):
        self.d.rectangle([x * S, y1 * S, x * S + S - 1, y2 * S - 1], fill=color or self.t['line'])

    def fillrect(self, x1, y1, x2, y2, color):
        self.d.rectangle([x1 * S, y1 * S, x2 * S - 1, y2 * S - 1], fill=color)

    def text(self, x, baseline, s, f, color, tracking=0.0, fallback=None):
        """Draw left-to-right on a baseline, with optional tracking in em. Falls back per glyph."""
        d = self.d
        size = f.size / S
        for ch in s:
            if fallback and not has(f.path, ch):
                ff = ImageFont.truetype(fallback, int(round(size * S)))
                d.text((x * S, baseline * S), ch, font=ff, fill=color, anchor='ls')
                x += ff.getlength(ch) / S
            else:
                d.text((x * S, baseline * S), ch, font=f, fill=color, anchor='ls')
                x += f.getlength(ch) / S
            x += size * tracking
        return x

    def text_w(self, s, f, tracking=0.0):
        size = f.size / S
        return sum(f.getlength(ch) / S + size * tracking for ch in s) + (2 * S / S if s else 0)

    def rtext(self, x_right, baseline, s, f, color, tracking=0.0, fallback=None):
        return self.text(x_right - self.text_w(s, f, tracking), baseline, s, f, color, tracking, fallback)

    def save(self, name):
        self.im.save(f'shots/{name}.png')
        print(f'shots/{name}.png  {self.im.size[0]}x{self.im.size[1]}')

# ---------------------------------------------------------------- direction definitions

F = 'ttf/'
D = dict(
    plex=dict(n='01', title='the documentation instrument', register='sober',
              faces='IBM Plex Sans + IBM Plex Mono', licence='OFL 1.1', payload='59 KB latin',
              sans=(F + 'IBMPlexSans[wdth,wght].ttf', dict(wdth=100)), sans_w=400,
              mono=(F + 'IBMPlexMono-Regular.ttf', {}), mono_m=(F + 'IBMPlexMono-Medium.ttf', {}),
              mono_b=(F + 'IBMPlexMono-SemiBold.ttf', {}),
              note='The sans and the mono share a skeleton: prose and identifiers read as one voice in two modes.'),
    quiet=dict(n='02', title='the neutral instrument', register='sober',
               faces='Schibsted Grotesk + Commit Mono', licence='OFL 1.1', payload='92 KB latin',
               sans=(F + 'SchibstedGrotesk[wght].ttf', {}), sans_w=400,
               mono=(F + 'commitmono-400.ttf', {}), mono_m=(F + 'commitmono-500.ttf', {}),
               mono_b=(F + 'commitmono-700.ttf', {}),
               note='A mono whose whole ambition is to disappear, under a newspaper grotesque with an edge in the cuts.'),
    terminal=dict(n='03', title='the machine-readable artifact', register='bold',
                  faces='Departure Mono + Commit Mono + Geist Sans', licence='OFL 1.1', payload='95 KB latin',
                  sans=(F + 'Geist[wght].ttf', {}), sans_w=400,
                  mono=(F + 'departuremono.otf', {}), mono_m=(F + 'departuremono.otf', {}),
                  mono_b=(F + 'departuremono.otf', {}),
                  code=(F + 'commitmono-400.ttf', {}),
                  note='A pixel-grid mono at the 10.5-11.5px sizes the site actually uses: the label face was drawn for this size.'),
    blueprint=dict(n='04', title='the technical drawing', register='bold',
                   faces='Doto + IBM Plex Mono + IBM Plex Sans', licence='OFL 1.1', payload='55 KB latin',
                   sans=(F + 'IBMPlexSans[wdth,wght].ttf', dict(wdth=100)), sans_w=400,
                   mono=(F + 'IBMPlexMono-Regular.ttf', {}), mono_m=(F + 'IBMPlexMono-Medium.ttf', {}),
                   mono_b=(F + 'IBMPlexMono-SemiBold.ttf', {}),
                   display=(F + 'Doto[ROND,wght].ttf', dict(ROND=0, wght=900)), display_w=900,
                   note='The hero already draws a blueprint grid; Doto is the plotter that drafts it. ROND 0 = square dots.'),
    element=dict(n='05', title='the grid made literal', register='exotic',
                 faces='Handjet + IBM Plex Mono + IBM Plex Sans', licence='OFL 1.1', payload='18 KB latin',
                 sans=(F + 'IBMPlexSans[wdth,wght].ttf', dict(wdth=100)), sans_w=400,
                 mono=(F + 'IBMPlexMono-Regular.ttf', {}), mono_m=(F + 'IBMPlexMono-Medium.ttf', {}),
                 mono_b=(F + 'IBMPlexMono-SemiBold.ttf', {}),
                 display=(F + 'Handjet[ELGR,ELSH,wght].ttf', dict(ELGR=1, ELSH=2, wght=700)), display_w=700,
                 note='"The structure of the page IS the decoration", taken literally: every glyph is elements on a grid.'),
    morph=dict(n='06', title='one skeleton, two modes', register='exotic',
               faces='Sono + JetBrains Mono (code)', licence='OFL 1.1', payload='38 KB latin',
               sans=(F + 'Sono[MONO,wght].ttf', dict(MONO=0, wght=400)), sans_w=400,
               mono=(F + 'Sono[MONO,wght].ttf', dict(MONO=1, wght=400)), mono_m=(F + 'Sono[MONO,wght].ttf', dict(MONO=1, wght=500)),
               mono_b=(F + 'Sono[MONO,wght].ttf', dict(MONO=1, wght=600)),
               note='The site\'s one typographic rule -- prose is sans, identifiers are mono -- as a continuous axis on one file.'),
    krypton=dict(n='07', title='rectangles all the way down', register='bold',
                 faces='Monaspace Krypton + Argon + Geist Sans', licence='OFL 1.1', payload='~80 KB latin (subset)',
                 sans=(F + 'Geist[wght].ttf', {}), sans_w=400,
                 mono=(F + 'monaspace-argon.ttf', {}), mono_m=(F + 'monaspace-argon.ttf', {}),
                 mono_b=(F + 'monaspace-argon.ttf', {}),
                 display=(F + 'monaspace-krypton.ttf', {}), display_w=400,
                 display_label=True,
                 note='Krypton\'s glyphs are built from rectangles; so is every surface on this page.'),
)

def faces(d, role, size):
    """The right file+axes for a role: display for headings/labels, mono for identifiers, sans for prose."""
    if role in ('display', 'figure') and d.get('display'):
        return font(d['display'][0], size, d['display'][1])
    if role == 'figure':
        return mono(d, 600, size)
    if role == 'sans':
        return font(d['sans'][0], size, d['sans'][1])
    if role == 'sans_b':
        return font(d['sans'][0], size, {**d['sans'][1], 'wght': 600})
    if role == 'code' and d.get('code'):
        return font(d['code'][0], size, d['code'][1])
    return font(d['mono'][0], size, d['mono'][1])

def mono(m, weight, size):
    if weight >= 600: f = m['mono_b']
    elif weight >= 500: f = m['mono_m']
    else: f = m['mono']
    return font(f[0], size, f[1])

DOT = '\u00b7'
ARROW = '\u2197'

def block(sh, d, x0, x1, y, theme, hero_size=52, fig_size=88, compact=False):
    """One light or dark block: eyebrow, h1, sub, figure, band head, cells, code strip."""
    t = theme
    pad = 16
    x = x0 + pad
    mono_r = lambda size, w=400: mono(d, w, size)
    sansf = lambda size, w=400: faces(d, 'sans' if w < 600 else 'sans_b', size)

    # eyebrow
    sh.text(x, y + 12, 'fabric + neoforge ' + DOT + ' minecraft', mono_r(11.5), t['muted'], tracking=0.14,
            fallback=FALLBACK)
    # headline
    h1 = faces(d, 'display', hero_size)
    sh.text(x, y + 12 + hero_size * 1.02, 'Minecraft mods.', h1, t['fg'], tracking=-0.02)
    y2 = y + 12 + hero_size * 1.02 + (0 if compact else 30)
    if not compact:
        sh.text(x, y2 + 4, 'Some released, some still being built. Everything published is on Modrinth', sansf(15), t['muted'])
        sh.text(x, y2 + 29, 'and CurseForge.', sansf(15), t['muted'])
        y2 += 34
    # figure
    y2 += 24
    sh.hair(y2, x, x1 - pad)
    fig = faces(d, 'figure', fig_size)
    sh.text(x, y2 + 14 + fig_size * 0.78, '2,637,299', fig, t['fg'], tracking=-0.03)
    sh.text(x + fig_size * 5.4, y2 + 14 + fig_size * 0.78, 'downloads ' + DOT + ' modrinth + curseforge',
            mono_r(11, 600 if d.get('code') else 400), t['faint'], tracking=0.1, fallback=FALLBACK)
    y2 += 14 + fig_size + 26
    if compact:
        return y2

    # band head
    sh.hair(y2, x0, x1)
    sh.text(x, y2 + 26, 'IN DEVELOPMENT', faces(d, 'display', 11) if d.get('display_label') else mono_r(11.5), t['faint'], tracking=0.1)
    sh.rtext(x1 - pad, y2 + 26, '1.21.1', mono_r(11), t['faint'], tracking=0.06)
    y2 += 46
    sh.hair(y2, x0, x1)

    # two cells
    cw = (x1 - x0) / 2
    for i, (name, summary) in enumerate([
        ('Tasked', 'A questing engine. JSON files in, a pannable canvas out, and the server decides what counts as done.'),
        ('Armature', 'The library under it. Layout, themes, shapes, a graph canvas, and one seam between the code and the game\u2019s renderer.'),
    ]):
        cx = x0 + i * cw
        if i: sh.vhair(cx, y2, y2 + 168)
        sh.text(cx + pad, y2 + 20, '1.21.1', mono_r(10.5), t['faint'], tracking=0.06)
        sh.text(cx + pad, y2 + 20 + 0, '', mono_r(10.5), t['faint'])
        sh.rtext(cx + cw - pad, y2 + 20, 'FABRIC ' + DOT + ' NEOFORGE', mono_r(10.5), t['faint'], tracking=0.06)
        sh.text(cx + pad, y2 + 46, name, sansf(16, 600), t['fg'], tracking=-0.02)
        for j, line in enumerate(wrap(summary, sansf(13), cw - 2 * pad)):
            sh.text(cx + pad, y2 + 68 + j * 20, line, sansf(13), t['muted'])
        sh.hair(y2 + 116, cx + pad, cx + cw - pad)
        sh.text(cx + pad, y2 + 136, 'in development', mono_r(10.5), t['faint'], tracking=0.04)
        sh.rtext(cx + cw - pad, y2 + 136, 'github ' + ARROW + ' ' + DOT + ' docs ' + ARROW, mono_r(10.5), t['faint'], tracking=0.04, fallback=FALLBACK)
    y2 += 168
    sh.hair(y2, x0, x1)

    # code strip
    sh.fillrect(x0, y2 + 1, x1, y2 + 52, t['sunken'])
    sh.text(x, y2 + 32, '{"id": "tasked", "version": "0.1.0", "environment": "*"}', faces(d, 'code', 12.5), t['muted'], tracking=0.02)
    sh.text(x + 500, y2 + 32, './gradlew runDatagen', faces(d, 'code', 12.5), t['muted'], tracking=0.02)
    y2 += 52
    sh.hair(y2, x0, x1)

    # colophon
    sh.text(x, y2 + 28, 'ENGINEERED & MAINTAINED BY', mono_r(11, 600 if d.get('display_label') else 400), t['faint'], tracking=0.1)
    sh.text(x + 500, y2 + 28, 'AAEN STUDIOS ' + DOT + ' AAENZ.NO', mono_r(11), t['faint'], tracking=0.1, fallback=FALLBACK)
    sh.rtext(x1 - pad, y2 + 28, 'ELLIPOG.DEV', mono_r(11), t['faint'], tracking=0.1)
    y2 += 44
    sh.hair(y2, x0, x1)
    return y2

def wrap(s, f, width_css):
    words, lines, cur = s.split(), [], ''
    for w in words:
        probe = (cur + ' ' + w).strip()
        if f.getlength(probe) / S <= width_css: cur = probe
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

# ---------------------------------------------------------------- sheets

def sheet_direction(key):
    d = D[key]
    sh = Sheet(1090, LIGHT)
    t = LIGHT
    x0, x1 = 120, 1320          # the shell's borders, as on the site
    # masthead
    sh.fillrect(0, 0, W, 56, t['bg'])
    sh.hair(56)
    sh.vhair(x0, 0, 56); sh.vhair(x1 - S / S, 0, 56)
    brand = faces(d, 'display', 15) if d.get('display_label') or key == 'terminal' else faces(d, 'sans_b', 15)
    sh.text(x0 + 44, 36, 'ellipog', brand, t['fg'], tracking=-0.02)
    sh.fillrect(x0 + 16, 14, x0 + 44, 42, t['fg'])
    nav = mono(d, 400, 11.5)
    xr = x1 - 16
    for item in reversed(['DOCS', 'MODRINTH', 'CURSEFORGE']):
        w = sh.text_w(item, nav, 0.04)
        sh.text(xr - w, 36, item, nav, t['muted'], tracking=0.04)
        xr -= w + 28
    # header
    sh.vhair(x0, 56, 1090); sh.vhair(x1, 56, 1090)
    hy = 56
    sh.hair(hy + 44, x0, x1)
    sh.text(x0 + 16, hy + 28, f"{d['n']} {DOT} {d['title'].upper()}", mono(d, 600 if d.get('display_label') else 400, 11.5), t['fg'], tracking=0.1)
    sh.rtext(x1 - 16, hy + 28, f"{d['faces']} {DOT} {d['licence']} {DOT} {d['payload']}",
             mono(d, 400, 11), t['faint'], tracking=0.04, fallback=FALLBACK)
    y = block(sh, d, x0, x1, hy + 44, LIGHT)
    # dark reprise
    dh = 60
    sh.fillrect(x0, y, x1, y + 4, t['fg'])
    sh.fillrect(x0, y + 4, x1, y + 4 + 330, DARK['bg'])
    dark = Sheet(1, DARK)  # dummy, not used
    global LIGHT_SAVED
    sub = Sheet.__new__(Sheet)
    sub.t = DARK; sub.im = sh.im; sub.d = sh.d
    block(sub, d, x0, x1, y + 4, DARK, compact=True)
    sh.vhair(x0, 56, y + 334, t['line']); sh.vhair(x1, 56, y + 334, t['line'])
    sh.text(x0 + 16, y + 4 + 290, f"{d['title'].upper()} {DOT} IN DARK {DOT} THE SAME TOKENS, INVERTED",
            mono(d, 400, 10.5), DARK['faint'], tracking=0.1, fallback=FALLBACK)
    sh.hair(y + 334, 0, W, t['line'], S)
    # note
    sh.text(x0 + 16, y + 334 + 34, d['note'], faces(d, 'sans', 13), t['muted'])
    return sh

def sheet_compare():
    keys = list(D)
    rows = (len(keys) + 1) // 2
    rh = 392
    sh = Sheet(96 + rows * rh + 8, LIGHT)
    t = LIGHT
    sh.hair(96)
    sh.text(16, 60, 'seven directions ' + DOT + ' the same hero, the same copy, the same tokens', mono(D['plex'], 500, 11.5), t['fg'], tracking=0.12)
    sh.text(W - 16 - 420, 60, 'ellipog.dev ' + DOT + ' typeface candidates ' + DOT + ' 2026', mono(D['plex'], 400, 11), t['faint'], tracking=0.1, fallback=FALLBACK)
    for i, k in enumerate(keys):
        d = D[k]
        cx = (i % 2) * (W / 2)
        cy = 96 + (i // 2) * rh
        sh.hair(cy, 0, W)
        sh.vhair(W / 2, cy, cy + rh)
        sh.vhair(0, cy, cy + rh); sh.vhair(W, cy, cy + rh)
        pad = 20
        sh.text(cx + pad, cy + 30, f"{d['n']} {DOT} {d['title'].upper()}", mono(d, 600 if d.get('display_label') else 400, 11), t['fg'], tracking=0.1)
        sh.text(cx + pad, cy + 52, f"{d['faces']} {DOT} {d['licence']} {DOT} {d['payload']}", mono(d, 400, 10.5), t['faint'], tracking=0.04, fallback=FALLBACK)
        sh.text(cx + pad, cy + 92, 'fabric + neoforge ' + DOT + ' minecraft', mono(d, 400, 11), t['muted'], tracking=0.14, fallback=FALLBACK)
        sh.text(cx + pad, cy + 152, 'Minecraft mods.', faces(d, 'display', 46), t['fg'], tracking=-0.02)
        sh.text(cx + pad, cy + 180, 'Some released, some still being built.', faces(d, 'sans', 13.5), t['muted'])
        sh.text(cx + pad, cy + 262, '2,637,299', faces(d, 'figure', 54), t['fg'], tracking=-0.03)
        sh.text(cx + pad + 340, cy + 262, 'downloads ' + DOT + ' 1.21.1 ' + DOT + ' tasked', mono(d, 400, 10.5), t['faint'], tracking=0.06, fallback=FALLBACK)
        sh.hair(cy + 292, cx + pad, cx + W / 2 - pad)
        sh.text(cx + pad, cy + 320, '{"id": "tasked", "version": "0.1.0"}  ./gradlew build', faces(d, 'code', 12), t['muted'])
        for j, note_line in enumerate(wrap(d['note'], faces(d, 'sans', 12), W / 2 - 2 * pad)[:2]):
            sh.text(cx + pad, cy + 352 + j * 17, note_line, faces(d, 'sans', 12), t['faint'])
    sh.hair(96 + rows * rh, 0, W)
    return sh

def sheet_axes():
    sh = Sheet(1420, LIGHT)
    t = LIGHT
    sh.hair(72)
    sh.text(16, 44, 'variable-axis studies ' + DOT + ' doto ' + DOT + ' handjet ' + DOT + ' sono', mono(D['plex'], 500, 11.5), t['fg'], tracking=0.12)

    y = 72
    sh.text(16, y + 30, '04 ' + DOT + ' BLUEPRINT ' + DOT + ' DOTO, THE ROND AXIS', mono(D['plex'], 600, 11), t['fg'], tracking=0.1)
    sh.text(16, y + 50, 'At 84px (the figure size): 0 is a square dot, the one the hairline grid would use; 100 is round. Below ~40px the axis stops being visible.', faces(D['plex'], 'sans', 12.5), t['muted'])
    y += 64
    for v in [0, 25, 50, 75, 100]:
        sh.hair(y, 0, W)
        sh.text(16, y + 60, f'ROND {v}', mono(D['plex'], 400, 10.5), t['faint'], tracking=0.06)
        sh.text(140, y + 96, 'Minecraft mods. 2,637,299', font(F + 'Doto[ROND,wght].ttf', 84, dict(ROND=v, wght=900)), t['fg'], tracking=-0.02)
        y += 118
    sh.hair(y, 0, W)

    sh.text(16, y + 30, '05 ' + DOT + ' ELEMENT ' + DOT + ' HANDJET, THE ELSH AXIS (ELEMENT SHAPE)', mono(D['plex'], 600, 11), t['fg'], tracking=0.1)
    sh.text(16, y + 50, 'Each row is the same headline drawn from a different repeatable element. ELSH 4 outlines them, which is the hairline aesthetic applied to letters.', faces(D['plex'], 'sans', 12.5), t['muted'])
    y += 64
    for v, label in [(0, 'blank'), (2, 'solid'), (4, 'hollow'), (8, 'solid')]:
        sh.hair(y, 0, W)
        sh.text(16, y + 64, f'ELSH {v}', mono(D['plex'], 400, 10.5), t['faint'], tracking=0.06)
        sh.text(16, y + 78, label, mono(D['plex'], 400, 9.5), t['faint'], tracking=0.04)
        sh.text(140, y + 76, 'Minecraft mods. 2,637,299', font(F + 'Handjet[ELGR,ELSH,wght].ttf', 72, dict(ELGR=1, ELSH=v, wght=700)), t['fg'], tracking=0.02)
        y += 100
    sh.hair(y, 0, W)

    sh.text(16, y + 30, '06 ' + DOT + ' MORPH ' + DOT + ' SONO, THE MONO AXIS', mono(D['plex'], 600, 11), t['fg'], tracking=0.1)
    sh.text(16, y + 50, 'The site\'s rule -- prose is sans, identifiers are mono -- as one continuous axis. The boundary is a number.', faces(D['plex'], 'sans', 12.5), t['muted'])
    y += 64
    line = 'Some released, some still being built ' + DOT + ' tasked ' + DOT + ' 1.21.1 ' + DOT + ' fabric + neoforge'
    for v in [0, 0.25, 0.5, 0.75, 1]:
        sh.hair(y, 0, W)
        sh.text(16, y + 44, f'MONO {v:g}', mono(D['plex'], 400, 10.5), t['faint'], tracking=0.06)
        sh.text(140, y + 50, line, font(F + 'Sono[MONO,wght].ttf', 19, dict(MONO=v, wght=400)), t['fg'])
        y += 60
    sh.hair(y, 0, W)
    return sh

if __name__ == '__main__':
    os.makedirs('shots', exist_ok=True)
    want = sys.argv[1:] or ['compare', 'axes'] + list(D)
    for k in want:
        if k == 'compare': sheet_compare().save('compare')
        elif k == 'axes': sheet_axes().save('axes')
        else: sheet_direction(k).save(k)
