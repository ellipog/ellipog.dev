/**
 * Canvas: chapter pictures and quest links into Tenet elements and links.
 *
 * <h2>Centers become corners</h2>
 *
 * FTB draws movables centered on their positions (`alignWidgets` subtracts half the
 * size unconditionally — there is no corner branch, so `corner` moves only the rotation
 * pivot, exactly like Tenet's), while every Tenet box starts at its top-left corner.
 * Converted positions shift by half the drawn size — per axis, with each object's own
 * dimensions — or every node would sit half itself down-right of its pack. The plan's
 * geometry section never named the shift; the renderers on both sides do.
 *
 * <h2>Clicks</h2>
 *
 * All seven FTB click names run in Tenet under the same names. `open_quest` targets resolve
 * quest-only (a task target or a dangling id warns and the press stays home); `/page`
 * suffixes strip with a note, because Tenet cards scroll rather than page. Unknown click
 * names degrade to no press with a note — FTB reads nothing there either. Legacy `click`
 * values and the editor's split `click_action_type`/`click_action_data` pair read through
 * the same rules; the string form wins when several are present, mirroring FTB's own
 * precedence.
 *
 * <h2>Pictures without ids</h2>
 *
 * FTB draws images that name no id; Tenet elements require one. The slug planner
 * claims `img_<chapter>_<n>` stand-ins in authored order from the shared taken-set,
 * so a synthesis can never steal an author's name, and each one is a report note
 * naming the image's line — never a silent rename.
 *
 * <h2>Gates and mirrors that resolve to nothing</h2>
 *
 * An image gate (`dependency`) naming nothing shows its picture in FTB (`null` gates open),
 * so the converter omits it with a note rather than failing a decoration. A link whose
 * target resolves to nothing warns and drops: a mirror of nothing draws nothing on both
 * sides. A link id shadowing any quest, chapter or group id fails outright — Tenet opens
 * whichever the lookup finds first, so keeping it could open the wrong quest.
 */

import { IdMap, resolveQuestSlug } from "./ids";
import { LangPool } from "./lang";
import { Report } from "./report";
import { GeomOptions, centerToCorner } from "./geometry";
import { SnbtNode, snbtGet } from "./snbt";
import { ChapterDefaults, FileDefaults, mapShapeName } from "./resolve";
import { rewriteCommand } from "./commands";
import { SlugMaps } from "./slugs";

export interface CanvasContext {
  readonly chapterPath: string;
  readonly ids: IdMap;
  readonly slugs: SlugMaps;
  readonly lang: LangPool;
  readonly chapter: ChapterDefaults;
  readonly file: FileDefaults;
  readonly geom: GeomOptions;
  readonly report: Report;
}

const ALIGN_WORDS: ReadonlySet<string> = new Set(["start", "middle", "end"]);

export function mapImage(node: SnbtNode, sourceHex: string, ctx: CanvasContext): Record<string, unknown> | null {
  if (node.kind !== "compound") {
    return null;
  }
  const id = imageId(node, ctx);
  if (id === null) {
    return null;
  }
  const dims = imageDims(node, ctx, id);
  if (dims === null) {
    return null;
  }
  const position = imagePosition(node, dims, ctx, id);
  if (position === null) {
    return null;
  }
  const source = textField(node, "image");
  if (source === null || source === "") {
    fail(ctx, node, "image", `the image ${id} names no picture`);
    return null;
  }
  const out: Record<string, unknown> = {
    type: "image",
    id,
    x: position.x,
    y: position.y,
    width: dims.widthPx,
    height: dims.heightPx,
  };
  const rotation = optRotation(node, ctx, id);
  if (rotation === null) {
    return null;
  }
  if (rotation !== 0) {
    out["rotation"] = rotation;
  }
  if (readFlag(node, "corner")) {
    out["corner"] = true;
  }
  if (readFlag(node, "position_locked")) {
    out["locked"] = true;
  }
  out["image"] = /\.png$/i.test(source) ? { texture: source } : { sprite: source };
  const tint = imageTint(node, ctx, id);
  if (tint === null) {
    return null;
  }
  if (tint !== "#FFFFFFFF") {
    out["tint"] = tint;
  }
  const alpha = imageAlpha(node, ctx, id);
  if (alpha === null) {
    return null;
  }
  if (alpha !== 255) {
    out["alpha"] = alpha;
  }
  const title = imageTitle(node, sourceHex, ctx, id);
  if (title === null) {
    return null;
  }
  if (title !== "") {
    out["title"] = title;
  }
  const label = imageLabel(node, ctx, id);
  if (label === null) {
    return null;
  }
  if (label !== undefined) {
    out["label"] = label;
  }
  const click = mapClick(node, ctx, id);
  if (click === null && ctx.report.failed) {
    return null;
  }
  if (click !== null) {
    out["click"] = click;
  }
  const order = snbtGet(node, "order");
  if (order !== undefined) {
    const value = wholeNumber(order);
    if (value === null) {
      fail(ctx, order, "order", `the image ${id} orders by something that is not a whole number`);
      return null;
    }
    if (value !== 0) {
      out["order"] = value;
    }
  }
  const requires = imageRequires(node, ctx, id);
  if (requires === null) {
    return null;
  }
  if (requires !== "") {
    out["requires"] = requires;
  }
  if (readFlag(node, "dev")) {
    out["dev"] = true;
  }
  return out;
}

function imageId(node: SnbtNode, ctx: CanvasContext): string | null {
  const id = snbtGet(node, "id");
  if (id === undefined || (id.kind === "string" && id.value === "")) {
    // FTB draws images with no id; Tenet elements require one, so the slug planner
    // claimed a stand-in in authored order. Named in the report: a synthesis, never
    // silent. A direct mapImage caller bypassing the planner has nothing to stand in.
    const slug = ctx.slugs.imageNodes.get(node);
    if (slug === undefined) {
      ctx.report.error({
        code: "malformed-image",
        message: `an image in ${ctx.chapterPath} names no id`,
        path: ctx.chapterPath,
        line: node.line,
        key: "id",
      });
      return null;
    }
    ctx.report.note({
      code: "synthesised-image-id",
      message: `an image in ${ctx.chapterPath} names no id; it reads ${slug}`,
      path: ctx.chapterPath,
      line: node.line,
      key: "id",
      value: slug,
    });
    return slug;
  }
  if (id.kind !== "string") {
    ctx.report.error({
      code: "malformed-image",
      message: `an image in ${ctx.chapterPath} names no id`,
      path: ctx.chapterPath,
      line: node.line,
      key: "id",
    });
    return null;
  }
  return ctx.slugs.images.get(id.value.toLowerCase()) ?? id.value.toLowerCase();
}

function imageDims(
  node: SnbtNode,
  ctx: CanvasContext,
  id: string,
): { widthPx: number; heightPx: number } | null {
  // FTB defaults both to 1.0; imageScale grows the picture around its visual center
  // (positions below already recenter on these dimensions). Tenet clamps edges silently
  // at load, so values pass through.
  const width = numField(node, "width", 1.0);
  const height = numField(node, "height", 1.0);
  if (width === null || height === null) {
    fail(ctx, node, width === null ? "width" : "height", `the image ${id} measures something that is not a number`);
    return null;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    fail(ctx, node, "width", `the image ${id} measures nothing finite`);
    return null;
  }
  const widthPx = Math.round(width * ctx.geom.sizeScale * ctx.geom.imageScale);
  const heightPx = Math.round(height * ctx.geom.sizeScale * ctx.geom.imageScale);
  if (widthPx <= 0 || heightPx <= 0) {
    // A picture with no pixels draws nothing on either side: FTB draws an empty box,
    // Tenet refuses the file. Dropping it changes no pixels, only the error count.
    ctx.report.warn({
      code: "invisible-image",
      message: `the image ${id} measures ${widthPx}x${heightPx}px; it draws nothing and stays home`,
      path: ctx.chapterPath,
      line: node.line,
      key: "width",
    });
    return null;
  }
  return { widthPx, heightPx };
}

function imagePosition(
  node: SnbtNode,
  dims: { widthPx: number; heightPx: number },
  ctx: CanvasContext,
  id: string,
): { x: number; y: number } | null {
  const rawX = numField(node, "x", 0);
  const rawY = numField(node, "y", 0);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    fail(ctx, node, "x", `the image ${id} sits nowhere finite`);
    return null;
  }
  // Center-based on both sides even with `corner` set: FTB's layout subtracts half the
  // size unconditionally (`alignWidgets` has no corner branch; the flag only moves the
  // rotation pivot, exactly like Tenet's). The flag still emits for the pivot.
  const cornerX = centerToCorner(rawX, dims.widthPx, ctx.geom.coordinateScale);
  const cornerY = centerToCorner(rawY, dims.heightPx, ctx.geom.coordinateScale);
  if (!cornerX.exact || !cornerY.exact) {
    ctx.report.note({
      code: "rounded-coordinate",
      message: `the image ${id} centers at ${rawX * ctx.geom.coordinateScale},${rawY * ctx.geom.coordinateScale}px; its top-left corner sits at ${cornerX.px},${cornerY.px}`,
      path: ctx.chapterPath,
      line: node.line,
      key: "x",
    });
  }
  return { x: cornerX.px, y: cornerY.px };
}

function imageTint(node: SnbtNode, ctx: CanvasContext, id: string): string | null {
  const color = snbtGet(node, "color");
  if (color === undefined) {
    return "#FFFFFFFF";
  }
  const rgb =
    color.kind === "byte" || color.kind === "short" || color.kind === "int" || color.kind === "long"
      ? Number(color.value)
      : color.kind === "float" || color.kind === "double"
        ? Math.floor(color.value)
        : null;
  if (rgb === null || !Number.isFinite(rgb)) {
    fail(ctx, color, "color", `the image ${id} tints with something that is not a number`);
    return null;
  }
  // An opaque tint: Tenet multiplies tint-alpha by alpha, FTB replaces, so the alpha travels
  // in its own field and both readings agree exactly.
  const masked = Math.floor(rgb) & 0xffffff;
  return `#FF${masked.toString(16).padStart(6, "0").toUpperCase()}`;
}

function imageAlpha(node: SnbtNode, ctx: CanvasContext, id: string): number | null {
  const alpha = snbtGet(node, "alpha");
  if (alpha === undefined) {
    return 255;
  }
  const value =
    alpha.kind === "byte" || alpha.kind === "short" || alpha.kind === "int" || alpha.kind === "long"
      ? Number(alpha.value)
      : null;
  if (value === null || !Number.isInteger(value)) {
    fail(ctx, alpha, "alpha", `the image ${id} fades by something that is not a whole number`);
    return null;
  }
  return value;
}

function imageTitle(node: SnbtNode, sourceHex: string, ctx: CanvasContext, id: string): string | null {
  const lang = ctx.lang.imageTitle(sourceHex);
  if (lang !== null) {
    return lang;
  }
  const hover = snbtGet(node, "hover");
  if (hover === undefined) {
    return "";
  }
  if (hover.kind !== "list") {
    fail(ctx, hover, "hover", `the image ${id} hovers something that is not a list of lines`);
    return null;
  }
  const lines: Array<string> = [];
  for (const line of hover.items) {
    if (line.kind !== "string") {
      fail(ctx, line, "hover", `the image ${id} hovers something that is not text`);
      return null;
    }
    lines.push(line.value);
  }
  return lines.join("\n");
}

function imageLabel(
  node: SnbtNode,
  ctx: CanvasContext,
  id: string,
): Record<string, unknown> | undefined | null {
  const onImage = readFlag(node, "text_on_image");
  const alignH = snbtGet(node, "text_h_align");
  const alignV = snbtGet(node, "text_v_align");
  const inset = snbtGet(node, "text_inset");
  const shadow = snbtGet(node, "text_shadow");
  if (!onImage && alignH === undefined && alignV === undefined && inset === undefined && shadow === undefined) {
    return undefined;
  }
  if (!onImage) {
    ctx.report.note({
      code: "inert-label-keys",
      message: `the image ${id} carries label keys without text_on_image; they draw nothing on either side`,
      path: ctx.chapterPath,
      line: node.line,
    });
    return undefined;
  }
  const label: Record<string, unknown> = { onImage: true };
  for (const [key, axis] of [["text_h_align", "hAlign"], ["text_v_align", "vAlign"]] as const) {
    const raw = snbtGet(node, key);
    if (raw === undefined) {
      continue;
    }
    if (raw.kind !== "string" || (raw.value !== "start" && raw.value !== "middle" && raw.value !== "end")) {
      fail(ctx, raw, key, `the image ${id} aligns to no edge`);
      return null;
    }
    if (raw.value !== "middle") {
      label[axis] = raw.value;
    }
  }
  if (inset === undefined) {
    label["inset"] = 0;
  } else {
    const value =
      inset.kind === "byte" || inset.kind === "short" || inset.kind === "int" || inset.kind === "long"
        ? Number(inset.value)
        : null;
    if (value === null || !Number.isInteger(value) || value < 0) {
      fail(ctx, inset, "text_inset", `the image ${id} insets by something that is not a whole number`);
      return null;
    }
    label["inset"] = value;
  }
  if (readFlag(node, "text_shadow")) {
    label["shadow"] = true;
  }
  return label;
}

function imageRequires(node: SnbtNode, ctx: CanvasContext, id: string): string | "" | null {
  const dependency = snbtGet(node, "dependency");
  if (dependency === undefined) {
    return "";
  }
  if (dependency.kind !== "string" || dependency.value === "") {
    return "";
  }
  const target = resolveQuestSlug(ctx.ids, ctx.slugs, dependency.value);
  if (target !== null) {
    return target;
  }
  const lowered = dependency.value.toLowerCase();
  const kind = ctx.ids.tasks.has(lowered) || ctx.ids.rewards.has(lowered) ? "a task or reward" : "nothing";
  // A dangling gate shows its picture in FTB (null gates open), so it omits with a note
  // rather than failing a decoration.
  ctx.report.note({
    code: "requires-dangling",
    message: `the image ${id} waits on ${dependency.value}, which is ${kind}; it shows regardless`,
    path: ctx.chapterPath,
    line: dependency.line,
    key: "dependency",
    value: dependency.value,
  });
  return "";
}

export interface ClickJson {
  readonly type: string;
  readonly data: string;
}

function mapClick(node: SnbtNode, ctx: CanvasContext, id: string): ClickJson | null {
  const legacy = snbtGet(node, "click");
  if (legacy !== undefined) {
    return legacyClick(legacy, ctx, id, node);
  }
  const action = snbtGet(node, "click_action");
  if (action !== undefined) {
    if (action.kind !== "string") {
      fail(ctx, action, "click_action", `the image ${id} clicks something that is not text`);
      return null;
    }
    return stringClick(action.value, ctx, id, action.line);
  }
  const splitType = snbtGet(node, "click_action_type");
  const splitData = snbtGet(node, "click_action_data");
  if (splitType === undefined && splitData === undefined) {
    return null;
  }
  const type = splitType !== undefined && splitType.kind === "string" ? splitType.value : "";
  const data = splitData !== undefined && splitData.kind === "string" ? splitData.value : "";
  return typedClick(type, data, ctx, id, splitType?.line ?? node.line);
}

function legacyClick(legacy: SnbtNode, ctx: CanvasContext, id: string, scope: SnbtNode): ClickJson | null {
  if (legacy.kind !== "string") {
    fail(ctx, legacy, "click", `the image ${id} clicks something that is not text`);
    return null;
  }
  void scope;
  const value = legacy.value;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("file://")) {
    return { type: "open_uri", data: value };
  }
  if (value.startsWith("#")) {
    return questClick(value.slice(1), ctx, id, legacy.line);
  }
  if (value.startsWith("custom:")) {
    return { type: "custom_event", data: value.slice("custom:".length) };
  }
  if (value.startsWith("command:")) {
    return {
      type: "run_command",
      data: rewriteCommand(value.slice("command:".length), ctx.ids, ctx.slugs, ctx.report, ctx.chapterPath, legacy.line, `a click on image ${id}`),
    };
  }
  return null;
}

function stringClick(value: string, ctx: CanvasContext, id: string, line: number): ClickJson | null {
  const cut = value.indexOf(":");
  if (cut < 0) {
    ctx.report.note({
      code: "click-unknown-type",
      message: `the image ${id} clicks ${JSON.stringify(value)}, which names no press; it draws unpressed`,
      path: ctx.chapterPath,
      line,
      key: "click_action",
      value,
    });
    return null;
  }
  return typedClick(value.slice(0, cut), value.slice(cut + 1), ctx, id, line);
}

function typedClick(
  type: string,
  data: string,
  ctx: CanvasContext,
  id: string,
  line: number,
): ClickJson | null {
  if (type === "none" || type === "") {
    return null;
  }
  if (type === "open_uri" || type === "show_recipe" || type === "show_docs") {
    return { type, data };
  }
  if (type === "run_command" || type === "custom_event") {
    return {
      type,
      data:
        type === "run_command"
          ? rewriteCommand(data, ctx.ids, ctx.slugs, ctx.report, ctx.chapterPath, line, `a click on image ${id}`)
          : data,
    };
  }
  if (type !== "open_quest") {
    ctx.report.note({
      code: "click-unknown-type",
      message: `the image ${id} clicks ${JSON.stringify(type)}, which names no press; it draws unpressed`,
      path: ctx.chapterPath,
      line,
      key: "click_action",
      value: type,
    });
    return null;
  }
  return questClick(data, ctx, id, line);
}

function questClick(data: string, ctx: CanvasContext, id: string, line: number): ClickJson | null {
  const quest = data.includes("/") ? data.slice(0, data.indexOf("/")) : data;
  if (quest !== data) {
    ctx.report.note({
      code: "click-page-suffix",
      message: `the image ${id} opens ${data}; Tenet cards scroll rather than page, so it opens the quest`,
      path: ctx.chapterPath,
      line,
      key: "click_action",
      value: data,
    });
  }
  const target = resolveQuestSlug(ctx.ids, ctx.slugs, quest);
  if (target === null) {
    ctx.report.warn({
      code: "click-target-dangling",
      message: `the image ${id} opens ${JSON.stringify(data)}, which resolves to no quest; the press stays home`,
      path: ctx.chapterPath,
      line,
      key: "click_action",
      value: data,
    });
    return null;
  }
  return { type: "open_quest", data: target };
}

export function mapLink(node: SnbtNode, ctx: CanvasContext): Record<string, unknown> | null {  if (node.kind !== "compound") {
    return null;
  }
  const rawId = snbtGet(node, "id");
  if (rawId === undefined || rawId.kind !== "string" || rawId.value === "") {
    ctx.report.error({
      code: "malformed-link",
      message: `a quest link in ${ctx.chapterPath} names no id`,
      path: ctx.chapterPath,
      line: node.line,
      key: "id",
    });
    return null;
  }
  const id = ctx.slugs.links.get(rawId.value.toLowerCase()) ?? rawId.value.toLowerCase();
  if (slugShadows(ctx, id)) {
    ctx.report.error({
      code: "link-id-shadow",
      message: `the quest link ${id} shares its name with a quest, chapter or group; a press could open the wrong one`,
      path: ctx.chapterPath,
      line: rawId.line,
      key: "id",
      value: rawId.value,
    });
    return null;
  }
  const rawTarget = snbtGet(node, "linked_quest");
  if (rawTarget === undefined || rawTarget.kind !== "string" || rawTarget.value === "") {
    ctx.report.error({
      code: "malformed-link",
      message: `the quest link ${id} mirrors nothing`,
      path: ctx.chapterPath,
      line: node.line,
      key: "linked_quest",
    });
    return null;
  }
  const target = resolveQuestSlug(ctx.ids, ctx.slugs, rawTarget.value);
  if (target === null) {
    ctx.report.warn({
      code: "link-target-dangling",
      message: `the quest link ${id} mirrors ${rawTarget.value}, which resolves to no quest; the link stays home`,
      path: ctx.chapterPath,
      line: rawTarget.line,
      key: "linked_quest",
      value: rawTarget.value,
    });
    return null;
  }
  const size = linkSize(node, ctx, id);
  if (size === null) {
    return null;
  }
  const position = linkPosition(node, size, ctx, id);
  if (position === null) {
    return null;
  }
  const shape = linkShape(node, ctx, id);
  if (shape === null) {
    return null;
  }
  return { id, quest: target, x: position.x, y: position.y, shape, size };
}

function linkSize(node: SnbtNode, ctx: CanvasContext, id: string): number | null {
  const size = snbtGet(node, "size");
  const value = size === undefined ? 1.0 : toFinite(size);
  if (value === null || !Number.isFinite(value)) {
    ctx.report.error({
      code: "malformed-link",
      message: `the quest link ${id} sizes by something that is not a number`,
      path: ctx.chapterPath,
      line: size?.line ?? node.line,
      key: "size",
    });
    return null;
  }
  const px = Math.round(value * ctx.geom.sizeScale);
  if (px < 16 || px > 512) {
    ctx.report.warn({
      code: "clamped-size",
      message: `the quest link ${id} sizes at ${px}px, outside Tenet's 16–512`,
      path: ctx.chapterPath,
      line: size?.line ?? node.line,
      key: "size",
      value,
    });
    return Math.min(512, Math.max(16, px));
  }
  return px;
}

function linkPosition(
  node: SnbtNode,
  sizePx: number,
  ctx: CanvasContext,
  id: string,
): { x: number; y: number } | null {
  const rawX = numField(node, "x", 0);
  const rawY = numField(node, "y", 0);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    ctx.report.error({
      code: "malformed-link",
      message: `the quest link ${id} sits nowhere finite`,
      path: ctx.chapterPath,
      line: node.line,
    });
    return null;
  }
  const cornerX = centerToCorner(rawX, sizePx, ctx.geom.coordinateScale);
  const cornerY = centerToCorner(rawY, sizePx, ctx.geom.coordinateScale);
  if (!cornerX.exact || !cornerY.exact) {
    ctx.report.note({
      code: "rounded-coordinate",
      message: `the quest link ${id} centers at ${rawX * ctx.geom.coordinateScale},${rawY * ctx.geom.coordinateScale}px; its top-left corner sits at ${cornerX.px},${cornerY.px}`,
      path: ctx.chapterPath,
      line: node.line,
      key: "x",
    });
  }
  return { x: cornerX.px, y: cornerY.px };
}

function linkShape(node: SnbtNode, ctx: CanvasContext, id: string): string | null {
  void id;
  const shape = linkShapeRaw(node) ?? (ctx.chapter.shape !== "" ? ctx.chapter.shape : null) ?? (ctx.file.shape !== "" ? ctx.file.shape : null) ?? "circle";
  return mapShapeName(shape, ctx.report, ctx.chapterPath, node.line);
}

function linkShapeRaw(node: SnbtNode): string | null {
  const shape = snbtGet(node, "shape");
  if (shape === undefined || shape.kind !== "string") {
    return null;
  }
  if (shape.value === "" || shape.value === "default") {
    return null;
  }
  return shape.value;
}

/** A text field's words: null when absent; non-text reads as absent here only where the caller fails on it. */
function textField(node: SnbtNode, key: string): string | null {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return null;
  }
  return child.kind === "string" ? child.value : null;
}

function optRotation(node: SnbtNode, ctx: CanvasContext, id: string): number | null {
  const child = snbtGet(node, "rotation");
  if (child === undefined) {
    return 0;
  }
  const value = toFinite(child);
  if (value === null) {
    fail(ctx, child, "rotation", `the image ${id} turns by something that is not a number`);
    return null;
  }
  // Tenet turns by whole degrees; FTB's editor saves whatever the drag left (22.5, 89.99…).
  const whole = Math.round(value);
  if (whole !== value) {
    ctx.report.note({
      code: "rounded-rotation",
      message: `the image ${id} turns by ${value}°; Tenet turns by whole degrees, so it turns by ${whole}°`,
      path: ctx.chapterPath,
      line: child.line,
      key: "rotation",
      value,
    });
  }
  return whole;
}

/** An integral field value, or null when it is not a whole number. */
function wholeNumber(child: SnbtNode): number | null {
  if (child.kind === "byte" || child.kind === "short" || child.kind === "int" || child.kind === "long") {
    return Number(child.value);
  }
  return null;
}

/** A node's finite numeric value, or null when it is not a number. */
function toFinite(child: SnbtNode): number | null {
  if (child.kind === "float" || child.kind === "double") {
    return Number.isFinite(child.value) ? child.value : null;
  }
  if (child.kind === "byte" || child.kind === "short" || child.kind === "int" || child.kind === "long") {
    return Number(child.value);
  }
  return null;
}

/**
 * A numeric field: the fallback when absent, NaN when malformed. Callers default presence
 * with the fallback and reject garbage with `isFinite` — absence has a default everywhere
 * here, garbage never does.
 */
function numField(node: SnbtNode, key: string, fallback: number): number {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return fallback;
  }
  const value = toFinite(child);
  return value === null ? Number.NaN : value;
}

function readFlag(node: SnbtNode, key: string): boolean {
  const child = snbtGet(node, key);
  if (child === undefined) {
    return false;
  }
  if (child.kind === "boolean") {
    return child.value;
  }
  if (child.kind === "byte" && (child.value === 0n || child.value === 1n)) {
    return child.value === 1n;
  }
  return false;
}

function slugShadows(ctx: CanvasContext, id: string): boolean {
  for (const map of [ctx.slugs.quests, ctx.slugs.chapters, ctx.slugs.groups]) {
    for (const slug of map.values()) {
      if (slug === id) {
        return true;
      }
    }
  }
  return false;
}

function fail(ctx: CanvasContext, node: SnbtNode, key: string, message: string): void {
  ctx.report.error({ code: "malformed-image", message, path: ctx.chapterPath, line: node.line, key });
}

export interface ChapterCanvas {
  readonly elements: Array<Record<string, unknown>>;
  readonly links: Array<Record<string, unknown>>;
}

/** A chapter's images and links mapped in authored order, cosmetic drops reported. */
export function emitChapterCanvas(
  chapter: { node: SnbtNode; path: string },
  ctx: CanvasContext,
): ChapterCanvas {
  const elements: Array<Record<string, unknown>> = [];
  const links: Array<Record<string, unknown>> = [];
  const images = snbtGet(chapter.node, "images");
  if (images !== undefined && images.kind === "list") {
    for (const image of images.items) {
      const id = image.kind === "compound" ? snbtGet(image, "id") : undefined;
      const source = id !== undefined && id.kind === "string" ? id.value : "";
      const mark = ctx.report.mark();
      const mapped = mapImage(image, source, ctx);
      if (mapped !== null) {
        elements.push(mapped);
      } else if (ctx.report.lossy) {
        // A picture is decoration nothing points at: with loss allowed, it alone goes.
        ctx.report.soften(mark, `with loss allowed, this image in ${ctx.chapterPath} is left out`);
      }
    }
  }
  const seenLinks = new Set<string>();
  const rawLinks = snbtGet(chapter.node, "quest_links");
  if (rawLinks !== undefined && rawLinks.kind === "list") {
    for (const link of rawLinks.items) {
      const mapped = mapLink(link, ctx);
      if (mapped === null) {
        continue;
      }
      const id = mapped["id"] as string;
      if (seenLinks.has(id)) {
        ctx.report.warn({
          code: "link-id-duplicate",
          message: `two quest links in ${ctx.chapterPath} share the id ${id}; the second stays home`,
          path: ctx.chapterPath,
          line: link.line,
          key: "id",
          value: id,
        });
        continue;
      }
      seenLinks.add(id);
      links.push(mapped);
    }
  }
  return { elements, links };
}
