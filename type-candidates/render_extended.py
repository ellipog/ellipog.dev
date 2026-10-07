"""
Direction 04, pushed further: where can Doto actually go?

Doto has a hard floor -- it is dots on a lattice, so below roughly 40px the dots merge and the ROND axis
stops being visible. This renders every role at the size the site actually uses it, ROND 0 against
ROND 100, so the extendable set is decided from the drawing rather than from taste.

  python render_extended.py            -> placement + the two extended variants
"""
import render as R
from render import Sheet, D, LIGHT, DARK, font, mono, wrap, W, S, FALLBACK, DOT, ARROW, F

DOTO = F + 'Doto[ROND,wght].ttf'
DOTOF = lambda size, rond=0, wght=900: font(DOTO, size, dict(ROND=rond, wght=wght))  # noqa: E731

d = D['blueprint']

# ------------------------------------------------------------------ where it fits

ROLES = [
    ('figure', 88, '2,637,299', 0, False, 'works - where it should live'),
    ('hero h1', 52, 'Minecraft mods.', -0.02, False, 'works'),
    ('docs h1', 28, 'Tenet', -0.02, False, 'works - short words'),
    ('docs h2', 21, 'Where to start', -0.02, False, 'marginal - only if headings grow'),
    ('cell name', 16, 'Armature', -0.02, False, 'marginal - one word, and it is texture'),
    ('wordmark', 15, 'ellipog', -0.02, False, 'marginal - works, but 18px would be honest'),
    ('eyebrow', 11.5, 'FABRIC + NEOFORGE ' + DOT + ' MINECRAFT', 0.14, True, 'works - as a bitmap label'),
    ('band label', 11, 'IN DEVELOPMENT', 0.1, True, 'works - as a bitmap label'),
    ('meta', 10.5, '1.21.1 ' + DOT + ' FABRIC ' + DOT + ' NEOFORGE', 0.06, True, 'works - as a bitmap label'),
]


def sheet_placement():
    rh = 96
    sh = Sheet(96 + len(ROLES) * rh + 74, LIGHT)
    t = LIGHT
    sh.hair(96)
    sh.text(16, 44, '04 ' + DOT + ' where doto survives ' + DOT + ' every role at the size the site uses it', mono(d, 500, 11.5), t['fg'], tracking=0.12)
    sh.text(W - 16 - 520, 44, 'left: ROND 0 (square dots)   right: ROND 100 (round dots)   both: wght 900', mono(d, 400, 11), t['faint'], tracking=0.06, fallback=FALLBACK)
    sh.text(W / 2, 84, 'ROND 0', mono(d, 400, 10.5), t['faint'], tracking=0.08)
    sh.rtext(W - 16, 84, 'ROND 100', mono(d, 400, 10.5), t['faint'], tracking=0.08)
    y = 96
    for role, size, text, track, caps, verdict in ROLES:
        sh.hair(y, 0, W)
        sh.vhair(W / 2, y, y + rh)
        sh.text(20, y + 34, role, mono(d, 400, 10.5), t['muted'], tracking=0.06)
        sh.text(20, y + 50, f'{size} px' + ('  uppercase' if caps else ''), mono(d, 400, 10), t['faint'], tracking=0.04)
        col = t['fg'] if verdict.startswith('works') else (t['muted'] if verdict.startswith('marginal') else t['faint'])
        sh.text(20, y + 74, verdict, R.faces(d, 'sans', 11), col)
        mid = y + rh * 0.66
        sh.text(180, mid, text, DOTOF(size, 0), t['fg'], tracking=track)
        sh.text(W / 2 + 60, mid, text, DOTOF(size, 100), t['fg'], tracking=track)
        y += rh
    sh.hair(y, 0, W)
    sh.text(16, y + 30, 'The rule is case, not size. Uppercase with tracking survives down to 10.5px -- at wght 900 the dots merge into a crisp',
            R.faces(d, 'sans', 12.5), t['muted'])
    sh.text(16, y + 50, "bitmap label face, which is most of this site's small type. Mixed case falls apart below ~28px. Prose and code never take it.", 
            R.faces(d, 'sans', 12.5), t['muted'])
    return sh

# ------------------------------------------------------------------ the extended variants

def block_wide(sh, x0, x1, y, theme, wide):
    """The home-page block, with Doto assigned to the roles named in `wide`."""
    t = theme
    pad = 16
    x = x0 + pad
    m = lambda size, w=400: mono(d, w, size)                                   # noqa: E731
    sa = lambda size, w=400: R.faces(d, 'sans' if w < 600 else 'sans_b', size)  # noqa: E731
    pick = lambda role, f, size, w=900: DOTOF(size, 0, w) if role in wide else f  # noqa: E731

    sh.text(x, y + 12, 'fabric + neoforge ' + DOT + ' minecraft', pick('eyebrow', m(11.5), 11.5), t['muted'], tracking=0.14, fallback=FALLBACK)
    sh.text(x, y + 12 + 53, 'Minecraft mods.', DOTOF(52, 0, 900), t['fg'], tracking=-0.02)
    sh.text(x, y + 99, 'Some released, some still being built. Everything published is on Modrinth', sa(15), t['muted'])
    sh.text(x, y + 124, 'and CurseForge.', sa(15), t['muted'])
    y2 = y + 158
    sh.hair(y2, x, x1 - pad)
    sh.text(x, y2 + 14 + 69, '2,637,299', DOTOF(88, 0, 900), t['fg'], tracking=-0.03)
    sh.text(x + 475, y2 + 14 + 69, 'downloads ' + DOT + ' modrinth + curseforge',
            pick('figure-label', m(11), 11, 900), t['faint'], tracking=0.1, fallback=FALLBACK)
    y2 += 14 + 88 + 26

    sh.hair(y2, x0, x1)
    sh.text(x, y2 + 26, 'IN DEVELOPMENT', pick('label', m(11.5), 11.5), t['faint'], tracking=0.1)
    sh.rtext(x1 - pad, y2 + 26, '1.21.1', pick('meta', m(11), 11), t['faint'], tracking=0.06)
    y2 += 46
    sh.hair(y2, x0, x1)

    cw = (x1 - x0) / 2
    for i, (name, summary) in enumerate([
        ('Tenet', 'A questing engine. JSON files in, a pannable canvas out, and the server decides what counts as done.'),
        ('Armature', 'The library under it. Layout, themes, shapes, a graph canvas, and one seam between the code and the game\u2019s renderer.'),
    ]):
        cx = x0 + i * cw
        if i: sh.vhair(cx, y2, y2 + 168)
        sh.text(cx + pad, y2 + 20, '1.21.1', pick('meta', m(10.5), 10.5), t['faint'], tracking=0.06)
        sh.rtext(cx + cw - pad, y2 + 20, 'FABRIC ' + DOT + ' NEOFORGE', pick('meta', m(10.5), 10.5), t['faint'], tracking=0.06)
        sh.text(cx + pad, y2 + 46, name, pick('name', sa(16, 600), 16), t['fg'], tracking=-0.02)
        for j, line in enumerate(wrap(summary, sa(13), cw - 2 * pad)):
            sh.text(cx + pad, y2 + 68 + j * 20, line, sa(13), t['muted'])
        sh.hair(y2 + 116, cx + pad, cx + cw - pad)
        sh.text(cx + pad, y2 + 136, 'in development', pick('meta', m(10.5), 10.5), t['faint'], tracking=0.04)
        sh.rtext(cx + cw - pad, y2 + 136, 'github ' + ARROW + ' ' + DOT + ' docs ' + ARROW, m(10.5), t['faint'], tracking=0.04, fallback=FALLBACK)
    y2 += 168
    sh.hair(y2, x0, x1)

    sh.fillrect(x0, y2 + 1, x1, y2 + 52, t['sunken'])
    sh.text(x, y2 + 32, '{"id": "tenet", "version": "0.1.0", "environment": "*"}', R.faces(d, 'code', 12.5), t['muted'], tracking=0.02)
    sh.text(x + 500, y2 + 32, './gradlew runDatagen', R.faces(d, 'code', 12.5), t['muted'], tracking=0.02)
    y2 += 52
    sh.hair(y2, x0, x1)

    col = pick('colophon', m(11, 600), 11, 900)
    sh.text(x, y2 + 28, 'ENGINEERED & MAINTAINED BY', col, t['faint'], tracking=0.1)
    sh.rtext(x1 - pad, y2 + 28, 'ELLIPOG.DEV', col, t['faint'], tracking=0.1)
    y2 += 44
    sh.hair(y2, x0, x1)
    return y2


def sheet_wide(level, wide, note):
    x0, x1 = 120, 1320
    sh = Sheet(1400, LIGHT)
    t = LIGHT
    sh.hair(56)
    sh.vhair(x0, 0, 56); sh.vhair(x1, 0, 56)
    brand = DOTOF(15, 0, 900) if 'brand' in wide else R.faces(d, 'sans_b', 15)
    sh.text(x0 + 44, 36, 'ellipog', brand, t['fg'], tracking=-0.02)
    sh.fillrect(x0 + 16, 14, x0 + 44, 42, t['fg'])
    nav = DOTOF(11.5, 0, 900) if 'nav' in wide else mono(d, 400, 11.5)
    xr = x1 - 16
    for item in reversed(['DOCS', 'MODRINTH', 'CURSEFORGE']):
        w = sh.text_w(item, nav, 0.04)
        sh.text(xr - w, 36, item, nav, t['muted'], tracking=0.04)
        xr -= w + 28
    sh.hair(100, x0, x1)
    sh.text(x0 + 16, 84, f"04 {DOT} THE TECHNICAL DRAWING {DOT} {level.upper()}", mono(d, 600, 11.5), t['fg'], tracking=0.1)
    sh.rtext(x1 - 16, 84, 'Doto + IBM Plex Mono + IBM Plex Sans ' + DOT + ' OFL 1.1', mono(d, 400, 11), t['faint'], tracking=0.04, fallback=FALLBACK)
    y = block_wide(sh, x0, x1, 100, LIGHT, wide)

    # dark reprise, same assignments
    sh.fillrect(x0, y, x1, y + 4, t['fg'])
    sh.fillrect(x0, y + 4, x1, y + 4 + 600, DARK['bg'])
    sh.vhair(x0, 56, y + 604); sh.vhair(x1, 56, y + 604)
    sub = Sheet.__new__(Sheet); sub.t = DARK; sub.im = sh.im; sub.d = sh.d
    block_wide(sub, x0, x1, y + 4, DARK, wide)
    sh.vhair(x0, 56, y + 304, t['line']); sh.vhair(x1, 56, y + 304, t['line'])
    sh.hair(y + 604, 0, W, t['line'], S)
    sh.text(x0 + 16, y + 638, note, R.faces(d, 'sans', 13), t['muted'])
    sh.im = sh.im.crop((0, 0, W * S, int((y + 660) * S)))
    return sh


if __name__ == '__main__':
    sheet_placement().save('doto-placement')
    sheet_wide('tight', {'brand', 'colophon', 'figure-label'},
               "Tight: the display voice extended to the wordmark, the figure's label and the colophon -- the rows that are already uppercase and already ink-only."
               ).save('doto-tight')
    sheet_wide('broad', {'brand', 'colophon', 'figure-label', 'eyebrow', 'label', 'meta', 'name', 'nav'},
               'Broad: everything uppercase and tracked takes Doto -- case is the rule, not size. Uppercase survives at 10.5px; mixed case does not go below ~28px.'
               ).save('doto-broad')
