// Breach Protocol status bar and ICE alarm. One mod, two places (like workspace-chrome's footer):
//   { "mod": "breach-protocol-status" }                  the HUD bar at the bottom
//   { "mod": "breach-protocol-status", "props": { "ice": true } }   the ICE alarm block above the panes
// The bar shows SECTOR <space> // <spaces>, SIG (how many agents work), an ICE count, the branch,
// a clock and, bottom right, the MOTION FULL / MIN switch (shared "motion", key ctrl-shift-.).
// It also shows the "ice" block while an agent needs you and hides it otherwise.
// The alarm: hazard stripes, every blocked agent across spaces, RESPOND focuses the first.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, props, layout, nextCommand } from "herdr";
import { UI, HEAD, MONO, LABEL, chip, hazard, nn, motion, toggleMotion, unzoom, plate } from "./breach.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// HH:MM, 24-hour unless the block's props say { "clock": "12h" } (then 9:05 PM).
function clock() {
  const d = new Date(), h = d.getHours(), m = String(d.getMinutes()).padStart(2, "0");
  if (props()?.clock === "12h") return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
  return `${String(h).padStart(2, "0")}:${m}`;
}

export default class Status extends View {
  init(_props, cx) {
    this.width = 0;
    if (props()?.ice) return;
    // Key commands for this mod: "ctrl-shift-.": "breach-protocol-status.motion" (keys.json).
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "motion") toggleMotion();
        cx.notify();
      }
    });
    // The clock shows minutes, so a redraw every 15 s is enough, in FULL and MIN.
    cx.timer.every(15000, (cx) => cx.notify());
  }

  // Show the ICE block only while someone is blocked. A hidden block never starts its mod,
  // so the bar (always shown) does it. layout() reports the layout file, not what was shown or
  // hidden since, so keep track of what this copy asked for and ask again only on a change
  // (and once on start, which also fixes a block left shown by an earlier run).
  syncIce(blocked) {
    if (!find(layout(), "ice")) return;
    const want = blocked > 0;
    if (this.iceShown === want) return;
    this.iceShown = want;
    run(want ? "layout.show" : "layout.hide", { id: "ice" });
  }

  ice(t) {
    const list = agents().filter(a => a.status === "blocked");
    if (!list.length) return div().size_full().bg(t.chrome); // only seen for a moment while the block hides
    const w = this.width, h = 34;
    const text = list.map(a => `${(a.program?.name ?? a.app ?? "agent").toLowerCase()} · ${a.space_name}${a.tab_name && !/^\d+$/.test(a.tab_name) ? " · " + a.tab_name : ""}`).join("   //   ");
    return div().id("ice-bar").relative().size_full()
      .on_size_change((size, cx) => { const nw = Math.round(unzoom(size.width)); if (nw !== this.width) { this.width = nw; cx.notify(); } })
      .when(w > 0, el => el.child(hazard([[0, 0], [w, 0], [w, h], [0, h]], t.blocked)))
      .child(div().absolute().top(3).left(3).right(3).bottom(3).bg(t.background))
      .child(h_flex().absolute().inset_0().px(14).gap(12).items_center()
        .child(div().flex_none().font_family(HEAD).font_weight(700).text_size(13).text_color(t.blocked).child(`ICE DETECTED · ${list.length}`))
        .child(div().flex_1().min_w(0).truncate().font_family(MONO).text_size(12).text_color(t.foreground).child(text))
        .when(list.length > 0, el => el.child(div().id("respond").flex_none().cursor_pointer()
          .on_click(() => run("pane.focus", { pane: list[0].pane }))
          .child(plate("respond-plate", 96, 24, { br: 6 }, t.accent,
            h_flex().gap(5).items_center().font_family(HEAD).font_weight(700).text_size(11.5).text_color(t.accent_foreground)
              .child("RESPOND").child(svg(`${UI}/art/play.svg`).w(6).h(8).text_color(t.accent_foreground)))))));
  }

  render() {
    const t = theme();
    if (props()?.ice) return this.ice(t);
    const all = spaces();
    const space = all.find(s => s.active);
    const list = agents();
    const working = list.filter(a => a.status === "working").length;
    const blocked = list.filter(a => a.status === "blocked").length;
    this.syncIce(blocked);
    const on = motion();
    return h_flex().size_full().items_center().gap(12).bg(t.chrome).border_t(1).border_color(t.border)
      .font_family(MONO).text_size(11).text_color(t.muted)
      .child(chip("sector", `SECTOR ${nn(space?.index ?? 0)} // ${nn(all.length)}`, t.accent, t.accent_foreground, { h: 27, size: 11, pl: 10 }))
      .child(h_flex().gap(6).items_center().child("SIG")
        // one small cell per agent, lit while it works (drawn, not glyphs)
        .child(h_flex().gap(2).items_center().children(Array.from({ length: Math.min(Math.max(list.length, 1), 12) },
          (_, i) => div().w(4).h(9).bg(i < working ? t.working : t.idle))))
        .child(`${working}/${list.length}`))
      .when(blocked > 0, el => el.child(chip("ice-count", `${LABEL.blocked} ${blocked}`, t.blocked, t.background, { h: 27, size: 11, pl: 10 })))
      .when(Boolean(space?.machine), el => el.child(div().child(space.machine)))
      .when(Boolean(space?.branch), el => el.child(div().max_w(220).truncate().child(space.branch)))
      .child(div().flex_1())
      .child(div().text_color(t.working).child(`${clock()} LOCAL`))
      // MOTION FULL / MIN, bottom right: the same switch and key in both layouts of this family.
      // The plate carries a play mark while it moves (FULL), a pause mark while it stands still (MIN).
      .child(div().id("motion").cursor_pointer().tooltip("Motion: ctrl-shift-.")
        .on_click((_e, cx) => { toggleMotion(); cx.notify(); })
        .child(chip("motion-chip", h_flex().gap(6).items_center()
          .child(svg(`${UI}/art/${on ? "play" : "pause"}.svg`).w(7).h(9).flex_none().text_color(on ? t.background : t.working))
          .child(on ? "MOTION FULL" : "MOTION MIN"),
          on ? t.working : t.raised, on ? t.background : t.working, { h: 27, size: 11, pl: 10 })));
  }
}
