/**
 * Read a PNG's geometry, its ink colour and whether it has a ground, without an image library.
 *
 * WHY THIS EXISTS
 *
 * The site's mark is two hand-supplied PNGs from the studio repository — one drawn in dark ink for a
 * light ground, one in light ink for a dark ground — and the tab names both with a `media` query each.
 * The portrait beside the wordmark is read by the same decoder for its own invisible properties, its
 * transparent ground and its footprint. Three of the properties that matter are **invisible when they are
 * wrong**:
 *
 *   1. **A swap.** The dark-ink file rendering on the dark ground is a mark the same colour as the page
 *      behind it. It does not look broken; it looks *absent*, and the natural response is to add a
 *      fallback for a mark that is already there.
 *   2. **A plate.** A file exported with its background baked in puts a rectangle of a second paper
 *      colour in the masthead — which reads as the page behind being slightly the wrong colour, not as
 *      a mistake. The two SVG marks here have a transform that strips exactly this.
 *   3. **A size change in one file only.** Half of a two-file theme switch resizing shifts the wordmark
 *      sideways, and only for readers in one theme.
 *
 * All three are readable from the bytes, so `check.mjs` asserts them instead of trusting the filenames.
 *
 * WHY NOT A RECORDED HASH
 *
 * A SHA in the check would catch the swap too, in two lines. It would also fail on a harmless re-encode
 * with different compression settings, and it would report "changed" rather than *what* changed. The
 * assertions built on this are about the drawing — "this ink is the dark one", "there is no ground" —
 * which is the same choice the rest of `check.mjs` makes: it asserts "the glyph is monochrome", never
 * "the glyph is these bytes".
 *
 * A READER, NOT A TRANSFORM
 *
 * Nothing here writes an image. The files are used exactly as the studio exports them, which is what
 * keeps the copies under `public/` diffable against that repository by eye — the same argument the rest of
 * the studio's files here rest on. So the crop that the 90px inset invites (see `.colophon-mark`) is
 * deliberately not taken: it would buy a tidier box size at the price of a file that is no longer theirs.
 * (The portrait *is* a derived export — `scripts/portrait.mjs` is its transform, and its source is
 * committed — and it is read here for the same class of invisible properties, not for byte fidelity.)
 *
 * WHAT IT SUPPORTS, AND WHAT IT REFUSES
 *
 * 8-bit, non-interlaced, truecolour with or without an alpha channel — which is what the two files are
 * and what an ordinary export from any editor produces. Anything else **throws**, naming what it got,
 * rather than quietly reporting nothing: these files are hand-supplied, so a different colour model means
 * a human has just replaced the artwork and should be told that the check has stopped watching it.
 *
 * It unfilters every row, which is 3MB of buffer for an 879x879 mark — the corners cannot be read
 * otherwise, because each scanline's filter is defined in terms of the row above it. `MAX_PIXELS`
 * refuses a file big enough for that to be worth worrying about.
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// The sRGB relative luminance the rest of this repository already uses, rather than a second copy of the
// gamma expansion. `monochrome.mjs` warns about exactly that duplication in its own header.
import { luminance } from './monochrome.mjs';

/** 2048x2048 is 4.2M pixels, or 17MB as RGBA. Far above any mark, far below anything alarming. */
const MAX_PIXELS = 2048 * 2048;

const CHANNELS = { 2: 3, 6: 4 };
const FORMAT_NAMES = { 0: 'greyscale', 2: 'truecolour', 3: 'indexed', 4: 'grey+alpha', 6: 'truecolour+alpha' };

/**
 * The PNG spec's fourth filter — the one predictor that looks up-left as well as left and up.
 *
 * `a` is the byte to the left, `b` the one above, `c` the one above-left, as the spec names them.
 */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * @param {string} path
 * @returns {{
 *   width: number,
 *   height: number,
 *   ink: string | null,        the colour of the first solid pixel, as `#rrggbb`
 *   luminance: number | null,  its sRGB relative luminance: 0 is black, 1 is white
 *   cornerAlphas: number[],    alpha at the four corners — all zero means no ground was exported into it
 *   bbox: { minX: number, minY: number, maxX: number, maxY: number } | null,  everything not fully transparent
 * }}
 */
export function readInk(path) {
  const buf = readFileSync(path);
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`);

  let at = 8;
  let header = null;
  const data = [];

  while (at + 8 <= buf.length) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + length);

    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colour: body[9],
        interlace: body[12],
      };
    } else if (type === 'IDAT') {
      data.push(Buffer.from(body));
    } else if (type === 'IEND') {
      break;
    }

    // length + type + data + CRC. The CRC is not checked: this reads files from a checkout, not files
    // from the network, and a corrupt one would fail on the inflate or the filter long before it lied.
    at += 12 + length;
  }

  if (!header) throw new Error(`${path}: no IHDR chunk`);
  const { width, height, depth, colour, interlace } = header;

  const channels = CHANNELS[colour];
  if (!channels) {
    throw new Error(
      `${path}: ${FORMAT_NAMES[colour] ?? `colour type ${colour}`} — this reader handles truecolour, with or without alpha`,
    );
  }
  if (depth !== 8) throw new Error(`${path}: ${depth}-bit — this reader handles 8-bit`);
  if (interlace !== 0) throw new Error(`${path}: interlaced — this reader handles progressive only`);
  if (width * height > MAX_PIXELS) {
    throw new Error(`${path}: ${width}x${height} — too large to be a mark; see MAX_PIXELS`);
  }
  if (data.length === 0) throw new Error(`${path}: no IDAT data`);

  /*
   * Unfilter, row by row, into the channels as they came.
   *
   * Every scanline is prefixed by its filter type, and all five filters are defined in terms of the byte
   * to the left, the byte above and (for Paeth) the byte up-left — so this has to run in order from the
   * top. `above` starts as zeros, which is what the spec says is above the first row.
   */
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  const blank = Buffer.alloc(stride);

  let cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    if (filter > 4) throw new Error(`${path}: unknown filter type ${filter} on row ${y}`);

    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : blank;

    for (let i = 0; i < stride; i++) {
      const x = raw[cursor + i];
      const left = i >= channels ? row[i - channels] : 0;
      const up = above[i];
      const upLeft = i >= channels ? above[i - channels] : 0;

      row[i] =
        (filter === 0
          ? x
          : filter === 1
            ? x + left
            : filter === 2
              ? x + up
              : filter === 3
                ? x + ((left + up) >> 1)
                : x + paeth(left, up, upLeft)) & 0xff;
    }

    cursor += stride;
  }

  /*
   * One pass for all three answers.
   *
   * `alpha >= 250` rather than `=== 255` for the ink, so a file whose edges are slightly soft still has
   * its colour read from the body rather than from an antialiased rim — the two marks happen to be flat
   * 255 in the interior, but a re-export might not be.
   */
  const corner = (x, y) => {
    const o = (y * width + x) * channels;
    return channels === 4 ? pixels[o + 3] : 255;
  };

  let ink = null;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * channels;
      const alpha = channels === 4 ? pixels[o + 3] : 255;
      if (alpha === 0) continue;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      if (ink === null && alpha >= 250) ink = hex(pixels[o], pixels[o + 1], pixels[o + 2]);
    }
  }

  return {
    width,
    height,
    ink,
    luminance: ink === null ? null : luminance(ink),
    cornerAlphas: [corner(0, 0), corner(width - 1, 0), corner(0, height - 1), corner(width - 1, height - 1)],
    bbox: maxX === -1 ? null : { minX, minY, maxX, maxY },
  };
}
