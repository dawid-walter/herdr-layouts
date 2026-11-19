// Breach Protocol "Go to": a clone of Herdr 0.1.16's shipped `picker` with the HUD look.
// Opened by the sidebar's search button and ctrl-shift-k on this layout. Behaviour is the shipped one:
// spaces with something that needs you first, quiet spaces fold into "earlier", type to filter,
// ↑/↓ and Enter to go, ctrl+d to close a tab, Esc to leave; last rows open new work.
// Drawing: a cut-corner frame and input, space tokens as in the spaces list, the layout's status
// marks (climbing bars, ICE chip, green rhombus), the selected row with a yellow edge.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, spaces, terminals, run, hc, theme, settings, props, closeOverlay, shared, setShared } from "herdr";
import { HEAD, MONO, LABEL, cut, fill, stroke, plate, chip, rhombus, notch, bars, unzoom } from "./breach.js";

// Space colours, kept by space id in shared "space.colors", assigned the way every mod does
// (the theme colour fewest spaces use). Breach shows yellow and red as blue and magenta:
// yellow and red mean "here" and ICE.
const PROJECT_COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
const REMAP = { ansi3: "ansi12", ansi1: "ansi13" };
function spaceColors() {
  const ids = new Set(spaces().map((p) => p.id));
  const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
  for (const p of spaces()) {
    if (kept[p.id] || p.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[p.id] = PROJECT_COLORS.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  return kept;
}
function spaceColor(t, p) {
  const c = spaceColors()[p.id] ?? "ansi6";
  return c.startsWith("#") ? c : (t[REMAP[c] ?? c] ?? t.working);
}

const ROW = 30;

export default class Picker extends View {
  init(_props, cx) {
    this.filter = "";
    this.input = InputState.new({ placeholder: "Go to a tab, space or agent…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = this.filter ? Math.max(0, this.rows().filter(r => r.kind !== "head").findIndex(r => r.kind === "ctx")) : 0;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.go(this.rows().filter(r => r.kind !== "head")[this.at], cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.at = null;
    this.scroll = 0;
    this.showEarlier = false;
    this.machines = [];
    this.inputW = 0;
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => m.state === "connected" && !m.temporary).map((m) => m.name);
      } catch {}
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  rows() {
    const f = this.filter.toLowerCase();
    const all = agents();
    const live = terminals().filter((x) => x.state === "live");
    const teamOf = (addrs) => {
      let n = 0;
      const walk = (a) => live.filter((x) => x.parent === a).forEach((k) => (n++, walk(k.address)));
      addrs.forEach(walk);
      return n;
    };
    const groups = spaces().map((w) => {
      const ctxs = w.tabs
        .map((ctx) => {
          const mine = all.filter((a) => a.tab === ctx.id);
          return { w, ctx, mine, team: teamOf(mine.map((a) => a.address)) };
        })
        .filter((c) => !f || [w.name, c.ctx.name, ...c.mine.map((a) => `${a.program?.name ?? ""} ${a.title ?? ""}`)].join(" ").toLowerCase().includes(f));
      return { w, ctxs };
    });
    const busy = groups.filter((p) => p.w.status && p.ctxs.length);
    const quiet = groups.filter((p) => !p.w.status && p.ctxs.length);
    busy.sort((a, b) => (b.w.status === "blocked") - (a.w.status === "blocked"));
    const out = [];
    const add = (p) => {
      out.push({ kind: "head", w: p.w });
      for (const c of p.ctxs) out.push({ kind: "ctx", ...c });
    };
    busy.forEach(add);
    if (quiet.length) {
      out.push({ kind: "earlier", count: quiet.length });
      if (this.showEarlier || f) quiet.forEach(add);
    }
    out.push({ kind: "new" });
    out.push({ kind: "space", machine: null });
    for (const m of this.machines) out.push({ kind: "space", machine: m });
    return out;
  }

  go(r, cx) {
    if (!r) return;
    if (r.kind === "earlier") {
      this.at = this.rows().filter(r => r.kind !== "head").findIndex(r => r.kind === "earlier");
      this.showEarlier = !this.showEarlier;
      this.input.focus();
      cx?.notify();
      return;
    }
    this.close();
    if (r.kind === "ctx") run("tab.select", { id: r.ctx.id });
    else if (r.kind === "new") run("tab.new");
    else if (r.kind === "space") run("space.new", { machine: r.machine ?? "" });
  }

  // The layout's status marks; working also counts a tab whose most urgent state is something else.
  marks(t, ctx) {
    const out = [];
    if (ctx.status === "working" || ctx.working_since != null) out.push(bars(`pk-bars-${ctx.id}`, "working", t));
    if (ctx.status === "blocked") out.push(chip(`pk-ice-${ctx.id}`, LABEL.blocked, t.blocked, t.background, { h: 14, size: 9.5, pl: 5 }));
    if (ctx.status === "done") out.push(rhombus(`pk-done-${ctx.id}`, t.done));
    return h_flex().w(34).flex_none().gap(5).items_center().children(out);
  }

  render() {
    const t = theme();
    const rows = this.rows();
    const pickable = rows.filter((r) => r.kind !== "head");
    if (this.at === null) this.at = Math.max(0, pickable.findIndex((r) => r.kind === "ctx" && r.w.active && r.ctx.active));
    this.at = Math.min(this.at, pickable.length - 1);
    const sel = pickable[this.at];
    // One continuous strip with each row at a fixed y; scrolling keeps the selected row in view.
    const H = { head: 34, earlier: 34, new: 34, ctx: ROW, space: ROW };
    const tops = [];
    let y = 0;
    rows.forEach((r) => { tops.push(y); y += H[r.kind] ?? ROW; });
    const total = y;
    const height = Math.min(340, this.listHeight ?? 340);
    const fixed = total > height;
    const maxScroll = Math.max(0, total - height);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    const si = rows.indexOf(sel);
    if (si >= 0) {
      if (tops[si] < this.scroll) this.scroll = tops[si];
      if (tops[si] + (H[sel.kind] ?? ROW) > this.scroll + height) this.scroll = tops[si] + (H[sel.kind] ?? ROW) - height;
    }
    const place = (el, i) =>
      fixed
        ? el.absolute().left(0).right(0).top(tops[i] - this.scroll).bottom(height - (tops[i] + (H[rows[i].kind] ?? ROW) - this.scroll))
        : el;
    const visible = (i) => !fixed || (tops[i] + (H[rows[i].kind] ?? ROW) > this.scroll && tops[i] < this.scroll + height);

    // A selectable row: the selected one gets the selected colour and a 2 px yellow edge.
    const pickRow = (id, on) => h_flex().id(id).relative().h(ROW).px(10).gap(10).items_center().cursor_pointer()
      .when(on, (el) => el.bg(t.selected).child(div().absolute().left(0).top(0).bottom(0).w(2).bg(t.accent)))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)));

    const row = (r) => {
      if (r.kind === "head") {
        const mark = spaceColor(t, r.w);
        const letter = r.w.name === "~" ? "~" : ([...r.w.name][0]?.toUpperCase() ?? "?");
        return h_flex().h(34).px(8).pt(8).gap(9).items_center()
          .child(plate(`pk-tok-${r.w.id}`, 20, 20, { br: 6 }, t.chrome,
            div().pr(1).font_family(HEAD).font_weight(700).italic().text_size(13).text_color(mark).child(letter), mark))
          .child(div().text_size(13).text_color(t.foreground).child(r.w.name))
          .when(Boolean(r.w.machine), (el) => el.child(div().font_family(MONO).text_size(10.5).text_color(t.dim).child(r.w.machine)))
          .child(div().flex_1().h(1).bg(t.border));
      }
      const on = r === sel;
      if (r.kind === "earlier") {
        return pickRow("pk-earlier", on).h(34).mt(0).font_family(MONO).text_size(11).text_color(on ? t.foreground : t.dim)
          .on_click((_e, cx) => this.go(r, cx))
          .child(svg(`mods/breach-protocol-picker/chevron-${this.showEarlier ? "down" : "right"}.svg`).size(11).flex_none())
          .child(`EARLIER · ${r.count} quiet space${r.count > 1 ? "s" : ""}`);
      }
      if (r.kind === "new" || r.kind === "space") {
        const label = r.kind === "new" ? "New tab" : r.machine ? `New space on ${r.machine}` : "New space";
        return pickRow(r.kind === "new" ? "pk-new" : `pk-space-${r.machine ?? "here"}`, on)
          .when(r.kind === "new", (el) => el.h(34).border_t(1).border_color(t.border))
          .text_color(on ? t.foreground : t.muted)
          .on_click(() => this.go(r))
          .child(div().w(34).flex_none().font_family(HEAD).font_weight(700).text_size(15).text_color(t.accent).child("+"))
          .child(label);
      }
      // Tab row: marks, the tab's name, then who works there: session titles, else program names.
      const who = r.mine.map((a) => (a.title ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").trim() || a.program?.name || "agent").join(" · ");
      const here = r.w.active && r.ctx.active;
      return pickRow(`pk-${r.ctx.id}`, on)
        .on_click(() => this.go(r))
        .child(this.marks(t, r.ctx))
        .child(div().flex_none().max_w(220).truncate().font_family(HEAD).font_weight(700).text_size(13.5)
          .text_color(on || here ? t.foreground : t.muted).child((/^\d+$/.test(r.ctx.name) ? `Tab ${r.ctx.name}` : r.ctx.name).toUpperCase()))
        .when(here, (el) => el.child(div().flex_none().font_family(MONO).text_size(10).text_color(t.accent).child("HERE")))
        .child(div().flex_1().min_w(0).truncate().text_right().font_family(MONO).text_size(10.5).text_color(on ? t.muted : t.dim)
          .child(who + (r.team ? `  +${r.team}` : "")));
    };

    const w = this.inputW, ih = 36;
    return v_flex()
      .id("picker")
      .track_focus(this.handle)
      .relative()
      .w_full()
      .min_h(0)
      .px(16)
      .pt(14)
      .pb(10)
      .gap(10)
      .bg(t.popover)
      .border_t(2)
      .border_color(t.accent)
      .text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down") this.at = (this.at + 1) % pickable.length;
        else if (k === "up") this.at = (this.at + pickable.length - 1) % pickable.length;
        else if (k === "d" && e.modifiers.control) {
          if (sel?.kind === "ctx") {
            this.close();
            run("tab.close", { id: sel.ctx.id });
          }
        } else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center().gap(8)
        .child(div().size(6).bg(t.accent))
        .child(div().font_family(HEAD).font_weight(700).text_size(17).text_color(t.foreground).child("GO TO"))
        .child(div().text_size(12).text_color(t.dim).child("移動"))
        .child(div().flex_1())
        .child(div().id("picker-esc").cursor_pointer().on_click(() => this.close())
          .child(chip("picker-esc-chip", "ESC", t.raised, t.muted, { h: 18, size: 10, pl: 6 }))))
      // The input: a frame with its bottom-right corner cut, like the site's fields.
      .child(div().id("pk-input").relative().h(ih).flex_none()
        .on_size_change((size, cx) => { const nw = Math.round(unzoom(size.width)); if (nw !== this.inputW) { this.inputW = nw; cx.notify(); } })
        .when(w > 0, (el) => el
          .child(fill(cut(w, ih, { br: 9 }), t.background))
          .child(stroke(cut(w - 1, ih - 1, { br: 9 }).map(([x, yy]) => [x + 0.5, yy + 0.5]), t.accent, 1)))
        .child(h_flex().absolute().inset_0().px(10).gap(8).items_center()
          .child(svg("mods/breach-protocol-picker/search.svg").size(15).flex_none().text_color(t.accent))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground))))
      .child(
        v_flex()
          .id("pk-list")
          .relative()
          .on_size_change((size, cx) => {
            this.listHeight = unzoom(size.height);
            cx.notify();
          })
          .h(Math.min(340, total))
          .min_h(0)
          .when(fixed, (el) =>
            el.overflow_hidden().on_scroll_wheel((e, cx) => {
              this.scroll = Math.max(0, Math.min(this.scroll - e.delta.y, maxScroll));
              while (this.at < pickable.length - 1 && tops[rows.indexOf(pickable[this.at])] < this.scroll) this.at++;
              while (this.at > 0 && tops[rows.indexOf(pickable[this.at])] + (H[pickable[this.at].kind] ?? ROW) > this.scroll + height) this.at--;
              cx.notify();
            }))
          .children(rows.map((r, i) => (visible(i) ? place(row(r), i) : null)).filter(Boolean)),
      )
      .child(h_flex().gap(14).items_center().pt(2).font_family(MONO).text_size(10).text_color(t.dim)
        .child("↑↓ MOVE").child("ENTER GO").child("CTRL+D CLOSE TAB").child(div().flex_1()))
      .child(notch(t.chrome, "br", 12));
  }
}
