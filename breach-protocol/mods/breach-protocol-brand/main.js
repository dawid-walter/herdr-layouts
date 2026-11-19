// Breach Protocol sidebar header (role "brand"): the chip-city loop recorded from the site's hero,
// HUD corner ticks, a SECTOR plate (shown space // spaces) with the agent count, and the search
// and sidebar buttons of Herdr's shipped workspace-chrome. The block is a window drag area.
// MOTION MIN shows a still frame. Narrower than 160 px (the rail) it draws only the buttons.

import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, window, shared, setShared, layout, spaces, agents } from "herdr";
import { UI, MONO, chip, nn, motion, unzoom } from "./breach.js";

// The city loop is 270 x 119. Herdr fits an image inside its box, so at other sidebar widths it
// would leave bands or squeeze; draw it covering the header instead (like CSS cover), centered.
const CITY_W = 270, CITY_H = 119;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, as in the shipped mods.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

export default class Brand extends View {
  button(t, id, icon, action) {
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().bg(t.chrome + "cc").text_color(t.muted)
      .hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action)
      .child(svg(`mods/breach-protocol-brand/${icon}.svg`).size(15));
  }

  render() {
    const t = theme();
    const toggle = this.button(t, "sidebar-toggle", "sidebar", toggleSidebar);
    if (narrow()) {
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      return v_flex().size_full().bg(t.chrome).items_center().pt(window()?.platform === "macos" ? 40 : 10)
        .when(window()?.platform !== "macos", el => el.child(toggle));
    }
    const all = spaces();
    const space = all.find(s => s.active);
    const count = agents().length;
    const tick = (pos) => div().absolute().w(12).h(12).border_color(t.accent)
      .map(el => pos === "tl" ? el.left(6).top(6).border_t(1.5).border_l(1.5) : el.right(6).top(6).border_t(1.5).border_r(1.5));
    const w = this.w ?? 268, h = this.h ?? 118;
    const k = Math.max(w / CITY_W, h / CITY_H);
    const cw = Math.ceil(CITY_W * k), ch = Math.ceil(CITY_H * k);
    return div().id("brand").relative().size_full().overflow_hidden().bg(t.background).border_b(1).border_color(t.border)
      .on_size_change((size, cx) => {
        const nw = Math.round(unzoom(size.width)), nh = Math.round(unzoom(size.height));
        if (nw !== this.w || nh !== this.h) { this.w = nw; this.h = nh; cx.notify(); }
      })
      .child(image(`${UI}/art/${motion() ? "city-head.gif" : "city-head.png"}`).absolute()
        .left(Math.floor((w - cw) / 2)).top(Math.floor((h - ch) / 2)).w(cw).h(ch))
      .when(!(window()?.platform === "macos" && !window()?.fullscreen), el => el.child(tick("tl")))
      .child(tick("tr"))
      .child(h_flex().absolute().top(8).right(24).gap(4)
        .child(this.button(t, "search", "search", () => run("mod.open", { name: "breach-protocol-picker" })))
        .child(toggle))
      .child(h_flex().absolute().left(0).bottom(8).gap(8).items_center()
        .child(chip("brand-sector", `SECTOR ${nn(space?.index ?? 0)} // ${nn(all.length)}`, t.accent, t.accent_foreground, { h: 20, size: 11, pl: 8 }))
        .child(div().font_family(MONO).text_size(10.5).text_color(t.working).child(`${count} AGENT${count === 1 ? "" : "S"}`)));
  }
}
