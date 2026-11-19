// Breach Protocol pane header: a clone of Herdr's shipped `pane` (0.1.16) with the HUD look.
// A skewed plate with the program's name (yellow on the focused pane, teal on the others),
// the folder and branch, the agent's status, and on hover the split / zoom / close buttons.
// Props from the app: { pane, terminal }. Click: focus the pane.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home, layout } from "herdr";
import { HEAD, MONO, LABEL, chip, rhombus, bars } from "./breach.js";

function paneFrame(node) {
  if (!node || node.hidden) return null;
  if (node.content?.tab && node.content.pane) return node.content.pane;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter(child => !child.hidden);
    children = [visible.find(child => child.id === node.active) ?? visible[0]];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return null;
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export default class Pane extends View {
  init() { this.hovered = false; }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args) {
    return div().id(id).p(3).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); run(command, args); })
      .child(svg(`mods/breach-protocol-pane/${icon}.svg`).size(14));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const st = p.status;
    const pane = p.pane;
    const bottom = paneFrame(layout())?.header?.position === "bottom";
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .pr(8)
      .gap(8)
      .items_center()
      .bg(t.chrome + "d9")
      .when(bottom, el => el.border_t(1))
      .when(!bottom, el => el.border_b(1))
      .border_color(t.border)
      .font_family(MONO)
      .text_size(11)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      // The program plate fills the header's height: yellow when this pane has the keyboard.
      .child(chip(`pane-plate-${pane}`, name.toUpperCase(), p.focused ? t.accent : t.selected, p.focused ? t.accent_foreground : t.working,
        { h: 25, size: 12, pl: 10 }))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(folder(p.cwd)))
      .when(Boolean(p.branch), el => el.child(div().flex_none().max_w(160).truncate().text_color(t.working).child(p.branch)))
      .when(st === "working", el => el.child(bars(`pane-bars-${pane}`, "working", t, 10)))
      .when(st === "blocked", el => el.child(chip(`pane-ice-${pane}`, LABEL.blocked, t.blocked, t.background, { h: 16, size: 10, pl: 6 })))
      .when(st === "done", el => el.child(rhombus(`pane-done-${pane}`, t.done)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
