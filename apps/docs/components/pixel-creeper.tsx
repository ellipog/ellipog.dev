import { CREEPER_FACE, soften } from '@/lib/textures';

/**
 * The 404's figure: the creeper's face from the game's own texture, which every few seconds starts to fuse.
 *
 * Eight by eight, the texture's real resolution, one SVG square per pixel with `crispEdges` so it scales
 * to any size without a soft edge. The greys are the texture's own luminance, lifted off pure black like
 * every grey on this site (see `soften`), and they do not follow the theme: it is a picture of a thing,
 * not a line on the page.
 *
 * The fuse is CSS alone (`@keyframes creeper-fuse` in `global.css`): the face swells and flashes white in
 * hard steps the way the mob does, the caption hisses, and nothing explodes, because this page has done
 * enough damage already. No script, so the static HTML is the whole of it; the site-wide reduced-motion
 * rule runs the animation once at a hundredth of a millisecond, which leaves the face still.
 */
const PIXELS = Array.from(CREEPER_FACE, (level, i) => {
  const grey = soften(level).toString(16).padStart(2, '0');
  return { x: i % 8, y: Math.floor(i / 8), fill: `#${grey}${grey}${grey}` };
});

export function PixelCreeper() {
  return (
    <figure className="creeper" aria-hidden="true">
      <svg viewBox="0 0 8 8" width="192" height="192" shapeRendering="crispEdges">
        {PIXELS.map(({ x, y, fill }) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill} />
        ))}
        {/* The fuse's white flash: a sheet over the face, transparent until the keyframes light it. */}
        <rect className="creeper-flash" width="8" height="8" fill="#ffffff" />
      </svg>
      <figcaption>sssss…</figcaption>
    </figure>
  );
}
