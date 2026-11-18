// Switch between open spaces with a fuzzy filter. On Enter: show that space.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { props, closeOverlay, run, spaces, theme } from "herdr";

// Subsequence match, ranked: word starts and runs of adjacent letters win.
function fuzzy(query, name) {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  let j = 0;
  let last = -2;
  let streak = 0;
  let score = 0;
  for (let i = 0; i < n.length && j < q.length; i++) {
    if (n[i] !== q[j]) continue;
    const boundary = i === 0 || !/[a-z0-9]/.test(n[i - 1]);
    streak = i === last + 1 ? streak + 1 : 0;
    score += 12 + (boundary ? 10 : 0) + Math.min(streak, 4) * 4 - Math.min(i, 60) * 0.1;
    last = i;
    j++;
  }
  if (j < q.length) return null;
  return score - (name.length - q.length) * 0.1;
}

export default class SwitchSpace extends View {
  init(_props, cx) {
    this.query = "";
    this.at = Math.max(0, spaces().findIndex((space) => space.active));
    this.lastAt = -1;

    this.input = InputState.new({ placeholder: "Type to filter spaces…" });
    this.input.on("change", (_e, cx) => {
      this.query = this.input.value();
      this.at = 0;
      this.lastAt = -1;
      cx.notify();
    });
    this.input.on("submit", () => this.choose(this.matches()[this.at]));

    this.handle = cx.focus_handle();
    this.handle.focus();
    this.input.focus();
    cx.timer.after(100, () => this.input.focus());

    this.scroll = ScrollHandle.new();
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  matches() {
    const all = spaces();
    const query = this.query.trim();
    if (!query) return all;
    return all
      .map((space) => {
        const score = fuzzy(query, space.name);
        return score === null ? null : { space, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.space.index - b.space.index)
      .map((match) => match.space);
  }

  choose(space) {
    if (!space) return;
    run("space.select", { id: space.id });
    this.close();
  }

  key(event, cx) {
    if (event.key === "escape") {
      cx.stop_propagation();
      this.close();
      return;
    }
    const list = this.matches();
    if (event.key === "down") {
      if (list.length) this.at = (this.at + 1) % list.length;
    } else if (event.key === "up") {
      if (list.length) this.at = (this.at + list.length - 1) % list.length;
    } else if (event.key === "enter") {
      cx.stop_propagation();
      this.choose(list[this.at]);
      return;
    } else {
      return;
    }
    cx.stop_propagation();
    this.lastAt = -1;
    if (list.length) this.scroll.scroll_to_item(this.at);
    cx.notify();
  }

  render(cx) {
    const t = theme();
    const list = this.matches();
    if (this.at >= list.length) this.at = Math.max(0, list.length - 1);
    if (this.at !== this.lastAt) {
      this.lastAt = this.at;
      if (list.length) this.scroll.scroll_to_item(this.at);
    }
    const selected = list[this.at];

    const row = (space, index) => {
      const on = index === this.at;
      const tabs = `${space.tabs.length} tab${space.tabs.length === 1 ? "" : "s"}`;
      return h_flex()
        .id(`ss-${index}`)
        .mx(4)
        .h(34)
        .px(10)
        .gap(10)
        .items_center()
        .rounded(7)
        .cursor_pointer()
        .when(on, (el) => el.bg(t.selected))
        .hover((style) => style.bg(t.hover))
        .on_click(() => this.choose(space))
        .child(div().w(14).text_color(space.active ? t.accent : t.dim).child(space.active ? "●" : "▸"))
        .child(div().flex_1().truncate().text_color(t.foreground).when(on, (el) => el.font_semibold()).child(space.name))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(tabs))
        .when(on, (el) => el.child(div().text_size(11).text_color(t.dim).child("↵")));
    };

    const body = v_flex()
      .id("ss-list")
      .h(400)
      .min_h(0)
      .overflow_y_scrollbar()
      .track_scroll(this.scroll)
      .when(list.length === 0, (el) =>
        el.items_center().justify_center().child(
          div().text_color(t.dim).child(this.query ? "No matching spaces" : "No spaces open"),
        ),
      )
      .children(list.map(row));

    return v_flex()
      .id("switch-space")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(18)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .on_key_down((event, cx) => this.key(event, cx))
      .child(
        h_flex()
          .flex_none()
          .items_center()
          .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Switch space"))
          .child(
            div()
              .id("ss-esc")
              .px(6)
              .py(2)
              .rounded(5)
              .text_size(11)
              .text_color(t.dim)
              .cursor_pointer()
              .hover((style) => style.bg(t.hover).text_color(t.foreground))
              .on_click(() => this.close())
              .child("Esc"),
          ),
      )
      .child(
        h_flex()
          .h(36)
          .flex_none()
          .px(10)
          .gap(8)
          .items_center()
          .rounded(9)
          .border(1)
          .border_color(t.accent)
          .bg(t.background)
          .child(div().text_color(t.dim).child("⌕"))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(body)
      .child(
        h_flex()
          .flex_none()
          .items_center()
          .justify_between()
          .gap(12)
          .text_size(11)
          .text_color(t.dim)
          .child(div().flex_1().truncate().child(selected?.folder || ""))
          .child(div().flex_none().child("↑↓ move  ↵ switch  Esc close")),
      );
  }
}
