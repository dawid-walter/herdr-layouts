// Breach Protocol notifications: a clone of Herdr's shipped `toast` (0.1.16), set on the layout root
// as "toast": "breach-protocol-toast". Herdr always draws a toast 340 × 72 inside its own rounded
// frame; this mod draws the content. An agent that needs you reads BREACH SEQUENCE with RESPOND,
// one that finished reads BREACH OK. Click anywhere (or RESPOND) to run its action and dismiss it;
// LATER only dismisses. A machine login keeps the shipped Copy button.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme } from "herdr";
import { UI, HEAD, MONO, plate, rhombus } from "./breach.js";

const HEADER = { error: ["BREACH SEQUENCE", "blocked"], success: ["BREACH OK", "done"], warning: ["SIGNAL", "working"], info: ["SIGNAL", "working"] };

export default class Toast extends View {
  render(cx) {
    const t = theme();
    const p = props() ?? {};
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    // Herdr's own agent toasts don't always carry a level: read the title too.
    const said = `${p.title ?? ""} ${p.body ?? ""}`;
    const level = /needs you|waiting|blocked|approval/i.test(said) ? "error" : /finished|done/i.test(said) ? "success" : p.level;
    const [head, state] = HEADER[level] ?? HEADER.info;
    const act = () => { if (p.action?.name) run(p.action.name, p.action.args ?? {}); closeOverlay(p.overlay); };
    return v_flex()
      .id("toast")
      .size_full()
      .px(12)
      .py(7)
      .gap(3)
      .bg(t.popover)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(act)
      .child(h_flex().gap(8).items_center().font_family(MONO).text_size(10.5)
        .when(Boolean(p.icon), el => el.child(image(p.icon).w(14).h(14).flex_none()))
        .child(div().flex_1().text_color(state === "done" ? t.done : t.accent).child(head))
        .child(state === "done" ? rhombus("toast-mark", t.done, 8) : div().size(8).flex_none().bg(t[state])))
      .child(div().truncate().font_family(MONO).text_size(12).text_color(t.foreground)
        .child(login ? `${login[1]} needs a login: run` : [p.title, p.body].filter(Boolean).join(" · ")))
      .child(login
        ? h_flex().gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().tooltip(command).font_family(MONO).text_size(11.5).text_color(t.muted).child(command))
          .child(div().id("toast-login-copy").flex_none().px(8).py(2).bg(t.raised)
            .font_family(HEAD).font_weight(700).text_size(11).text_color(t.foreground).hover(s => s.bg(t.hover))
            .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
            .child(this.copied ? "COPIED" : "COPY"))
        : h_flex().gap(6).items_center()
          .when(Boolean(p.action?.name), el => el.child(div().id("toast-respond")
            .on_click((_e, cx) => { cx.stop_propagation(); act(); })
            .child(plate("toast-respond-plate", 82, 18, { br: 5 }, t.accent,
              h_flex().gap(4).items_center().font_family(HEAD).font_weight(700).text_size(10.5).text_color(t.accent_foreground)
                .child(state === "blocked" ? "RESPOND" : "OPEN").child(svg(`${UI}/art/play.svg`).w(5).h(7).text_color(t.accent_foreground))))))
          .child(div().id("toast-later")
            .on_click((_e, cx) => { cx.stop_propagation(); closeOverlay(p.overlay); })
            .child(plate("toast-later-plate", 60, 18, { br: 5 }, t.border,
              div().font_family(HEAD).font_weight(700).text_size(10.5).text_color(t.working).child("LATER")))));
  }
}
