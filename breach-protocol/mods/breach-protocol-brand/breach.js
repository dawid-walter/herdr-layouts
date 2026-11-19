// Shared Breach Protocol look. Every breach-protocol-* mod carries its own copy:
// a mod loads modules only from its own folder. Edit one, then copy it to the others
// Colors are theme names only, so the state colors
// live in themes/breach-protocol.json.
import { div, image, svg, PathBuilder, Background } from "gpui-kit";
import { shared, setShared, settings } from "herdr";

export const UI = "mods/breach-protocol-ui";
export const HEAD = "Rajdhani";
export const BODY = "Chakra Petch";
export const MONO = "IBM Plex Mono";

// What each agent status reads as.
export const LABEL = { working: "JACKED IN", blocked: "ICE", done: "BREACH OK", idle: "OFFLINE", unknown: "OFFLINE" };
export const tone = (t, status) => t[status] ?? t.dim;
// Text on a filled status chip.
export const ink = (t, status) => (status === "blocked" ? t.background : status === "idle" || !status ? t.muted : t.background);

// Motion, shared with the Replicant layout: "full" (default) or "min".
export const motion = () => shared("motion") !== "min";
export const toggleMotion = () => setShared("motion", motion() ? "min" : "full");

// A w×h polygon with 45° cuts of the given size at each corner, in px.
export function cut(w, h, { tl = 0, tr = 0, br = 0, bl = 0 } = {}) {
  return [[tl, 0], [w - tr, 0], [w, tr], [w, h - br], [w - br, h], [bl, h], [0, h - bl], [0, tl]];
}

// herdr also exports `window`; the drawing one is gpui-kit's global.
const paint = (path, bg) => globalThis.window.paint_path(path, bg).absolute().inset_0();
export const fill = (points, color) => paint(PathBuilder.fill().add_polygon(points, true).build(), color);
export const stroke = (points, color, width = 1) => paint(PathBuilder.stroke(width).add_polygon(points, true).build(), color);
// Diagonal hazard stripes in `color` clipped to the polygon.
export const hazard = (points, color) => paint(PathBuilder.fill().add_polygon(points, true).build(), Background.pattern_slash(color, 5, 12));

// A fixed-size plate with cut corners, an optional 1 px outline, and content centred on top.
export function plate(id, w, h, cuts, bg, content, line = null) {
  const kids = [fill(cut(w, h, cuts), line ?? bg)];
  if (line) kids.push(div().absolute().top(1).left(1).w(w - 2).h(h - 2).child(fill(cut(w - 2, h - 2, cuts), bg)));
  kids.push(div().absolute().inset_0().flex().items_center().justify_center().child(content));
  return div().id(id).relative().w(w).h(h).flex_none().children(kids);
}

// The slanted right end of a chip: a k×h triangle in the chip's colour, drawn just after it.
export const tail = (h, color, k = 8) => div().relative().w(k).h(h).flex_none().child(fill([[0, 0], [k, 0], [0, h]], color));

// A skewed chip of any width, like "SECTOR 01 // 07" on the site.
export function chip(id, text, bg, fg, { h = 18, size = 11, pl = 8 } = {}) {
  return div().id(id).flex().items_center().flex_none().h(h)
    .child(div().h_full().flex().items_center().pl(pl).pr(3).bg(bg).text_color(fg)
      .font_family(HEAD).font_weight(700).text_size(size).line_height(1).child(text))
    .child(tail(h, bg));
}

// The bottom-right cut of a full-width row of height h: put it as the row's last child,
// with the row itself transparent and its body coloured. Works over translucent backgrounds.
export function corner(h, color, k = 8) {
  return div().w(k).h(h).flex_none().flex().flex_col()
    .child(div().w(k).h(h - k).bg(color))
    .child(div().relative().w(k).h(k).child(fill([[0, 0], [k, 0], [0, k]], color)));
}

// A small rhombus (the "done" mark and the tab status). An SVG, not a drawn polygon: a polygon's
// half-pixel points come out lopsided at fractional zoom, the SVG is rasterised to its box evenly.
export const rhombus = (id, color, s = 8) =>
  div().id(id).w(s).h(s).flex_none().child(svg(`${UI}/art/rhombus.svg`).size(s).text_color(color));

// A triangle in a corner of a relatively positioned parent: the status notch.
export function notch(color, where = "br", s = 7) {
  const pts = { br: [[s, 0], [s, s], [0, s]], tr: [[0, 0], [s, 0], [s, s]] }[where];
  const el = div().absolute().w(s).h(s).right(0);
  return (where === "br" ? el.bottom(0) : el.top(0)).child(fill(pts, color));
}

// Signal bars: three bars 3 px wide, 4 / 7 / 10 px tall, bottom-aligned. A working agent's bars
// climb one step a second: a 3-frame GIF (art/bars-working.gif), which Herdr plays natively, in
// MOTION FULL and MIN alike; in MIN they are what still shows who is working. (Text glyphs
// like ▂▄▆ come from different fallback fonts and don't line up.) Other states are drawn bars.
export function bars(id, status, t) {
  if (status === "working") return div().id(id).flex_none().w(13).h(10).child(image(`${UI}/art/bars-working.gif`).w(13).h(10));
  const lit = status === "blocked" ? 1 : status === "done" ? 3 : 0;
  const on = status === "blocked" ? t.blocked : t.done;
  return div().id(id).flex().items_end().gap(2).flex_none().w(13).h(10)
    .children([4, 7, 10].map((h, i) => div().w(3).h(h).bg(i < lit ? on : t.idle)));
}

// Two-digit numbers for tabs and sectors.
export const nn = (n) => String(n).padStart(2, "0");

// on_size_change reports window px, but a mod draws in zoomed units.
export const unzoom = (px) => px / (Number(settings()?.zoom) > 0 ? Number(settings().zoom) : 1);
