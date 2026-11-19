// Breach Protocol tab bar: a clone of Herdr's shipped `tabs` (0.1.16) with the HUD look.
// Behaviour is the shipped one: wheel switches tabs, drag reorders, double-click renames,
// right-click opens the tab menu, + opens the new-tab menu, Files/Changes remember per space.
// Drawing: a SECTOR crumb for the shown space, flat tabs numbered 01, 02 (Ctrl+1, Ctrl+2),
// the active one marked by a yellow underline and a corner tick; status as climbing bars
// (working), an ICE chip (blocked) or a green rhombus (done), with a notch in the corner.

import { View, div, svg } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings } from "herdr";
import { HEAD, MONO, LABEL, chip, plate, rhombus, notch, bars, nn, tail } from "./breach.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Same as the agents mod: drops a status glyph, keeps a leading bracket or quote.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

// A tab Herdr named (unnamed, or after its program) follows its agent's live
// title, as the agents list does; a name the person gave stays.
function label(tab, lead) {
  const prog = lead?.program?.name;
  const base = tab.named ? tab.name : prog ?? "Terminal";
  if (!lead?.program?.agent) return base;
  const live = clean(lead.title);
  const path = /^[~/]|^[A-Za-z]:\\/.test((lead.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== lead.terminal && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== lead.program.key;
  return (tab.name === prog || !tab.named) && telling ? live : base;
}

export default class Tabs extends View {
  init() {
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    try { this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}"); } catch { this.panels = {}; }
    if (!this.panels || typeof this.panels !== "object" || Array.isArray(this.panels)) this.panels = {};
    this.swipe = { acc: 0, steps: 0, at: 0, last: 0 };
  }

  // One tab per wheel notch; a smooth swipe switches one tab per 60 px, at most every 100 ms.
  wheel(e) {
    if (e.delta_lines) {
      if (e.delta_lines.y) run(e.delta_lines.y > 0 ? "tab.prev" : "tab.next");
      return;
    }
    const s = this.swipe, now = Date.now();
    if (e.touch_phase === "started" || now - s.at > 250 || e.delta.y * s.acc < 0) Object.assign(s, { acc: 0, steps: 0 });
    s.at = now;
    s.acc += e.delta.y;
    const need = s.steps ? 60 : 20;
    if (Math.abs(s.acc) < need || now - s.last < 100) return;
    s.acc -= Math.sign(s.acc) * need;
    s.steps++;
    s.last = now;
    run(e.delta.y > 0 ? "tab.prev" : "tab.next");
  }

  // The side panel is remembered per space (unchanged from the shipped tabs).
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, content, action, danger = false) => div().id(id).w(46).h_full().flex_none().flex().items_center().justify_center()
      .text_color(t.muted).hover(s => s.bg(danger ? t.blocked : t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(content);

    // A tab's status is only its most urgent one (blocked > done > working), so a tab with one
    // agent done and another still working would hide the work. working_since tells it apart:
    // the bars show whenever anything in the tab works, beside the ICE chip or the rhombus.
    const status = (c) => {
      const marks = [];
      if (c.status === "working" || c.working_since != null) marks.push(bars(`tab-bars-${c.id}`, "working", t, 10));
      if (c.status === "blocked") marks.push(chip(`tab-ice-${c.id}`, LABEL.blocked, t.blocked, t.background, { h: 14, size: 9.5, pl: 5 }));
      if (c.status === "done") marks.push(rhombus(`tab-done-${c.id}`, t.done));
      return marks.length ? h_flex().gap(5).items_center().flex_none().children(marks) : null;
    };

    const item = (c, i) => {
      const lead = panes().find(p => p.tab === c.id && p.program?.agent) ?? panes().find(p => p.tab === c.id);
      const name = label(c, lead);
      const mark = status(c);
      return h_flex().id(`tab-${c.id}`).relative().h_full().pl(12).pr(20).gap(7).items_center().flex_none()
        .border_r(1).border_color(t.border)
        .when(i <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
        .when(c.active, el => el.bg(t.accent + "0f"))
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .child(div().font_family(MONO).text_size(10.5).text_color(t.dim).child(nn(c.index)))
        .child(div().max_w(170).truncate().font_family(HEAD).font_weight(700).text_size(13.5)
          .text_color(c.active ? t.foreground : t.muted).child((c.zoomed ? `${name} Z` : name).toUpperCase()))
        .when(Boolean(mark), el => el.child(mark))
        .when(c.status === "blocked" || c.status === "done", el => el.child(notch(t[c.status], "tr", 8)))
        .when(c.active, el => el
          .child(div().id(`close-${c.id}`).text_color(t.accent).hover(s => s.text_color(t.foreground)).on_mouse_down("left", stop)
            .on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/breach-protocol-tabs/close.svg").size(12)))
          // the active tab: a yellow underline and a corner tick, as around the site's hero
          .child(div().absolute().left(0).right(9).bottom(0).h(2).bg(t.accent))
          .child(div().absolute().left(4).top(6).w(6).h(6).border_t(1.5).border_l(1.5).border_color(t.accent)));
    };

    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, text) => {
      const on = panel && !panel.hidden && body?.active === id;
      return div().id(`panel-${id}`).flex_none().cursor_pointer().on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        })
        .child(chip(`panel-chip-${id}`, text, on ? t.working : t.raised, on ? t.background : t.muted, { h: 24, size: 11, pl: 9 }));
    };
    // SECTOR 01 · FIRMA-WWW: the shown space's number (Alt+1) and name.
    const crumb = space && h_flex().h(24).flex_none().gap(8).pr(12).mr(2).items_center().border_r(1).border_color(t.border)
      .font_family(MONO).text_size(11).text_color(t.muted)
      .child("SECTOR").child(div().text_color(t.working).child(nn(space.index)))
      .child(div().max_w(160).truncate().child(`· ${space.name.toUpperCase()}`));

    return h_flex().size_full().min_w(0).pl(lightsPadding).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => this.wheel(e))
      .when(Boolean(crumb), el => el.child(crumb))
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map(item)))
      .child(div().id("tab-new").mx(8).flex_none().cursor_pointer().on_mouse_down("left", stop)
        .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }))
        .child(plate("tab-new-plate", 30, 28, { br: 7 }, t.border, div().font_family(MONO).text_size(16).text_color(t.working).child("+"))))
      .when(enabled.includes("files"), el => el.child(div().mr(4).child(panelButton("files", "FILES"))))
      .when(enabled.includes("changes"), el => el.child(div().mr(4).child(panelButton("changes", "CHANGES"))))
      .when(w?.buttons, el => el.child(h_flex().h_full().ml(6)
        .child(button("minimize", svg("mods/breach-protocol-tabs/win-min.svg").size(16), () => run("window.minimize")))
        .child(button("maximize", svg(`mods/breach-protocol-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16), () => run("window.maximize")))
        .child(button("close-window", svg("mods/breach-protocol-tabs/win-close.svg").size(16), () => run("window.close"), true))));
  }
}
