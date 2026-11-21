// Close open spaces with a fuzzy filter. Enter (or click) arms the row,
// Enter again closes it; the popup stays open so several can be closed.
// Tab (or ctrl-click) marks rows and alt-a marks every visible row; with marks,
// Enter arms them all and Enter again closes them all.
// Keeps no state beyond the popup (marks live on the view).

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

export default class CloseSpace extends View {
  init(_props, cx) {
    this.query = "";
    this.at = Math.max(0, spaces().findIndex((space) => space.active));
    this.lastAt = -1;
    /** Id of the space waiting for a second Enter, "batch" for the marked ones, or null. */
    this.armed = null;
    /** @type {Set<string>} Ids of the marked spaces. */
    this.marked = new Set();

    this.input = InputState.new({ placeholder: "Type to filter spaces…" });
    this.input.on("change", (_e, cx) => {
      this.query = this.input.value();
      this.at = 0;
      this.lastAt = -1;
      this.armed = null;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.choose(this.matches()[this.at], cx));
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

  toggleMark(space, cx) {
    if (!space) return;
    if (this.marked.has(space.id)) this.marked.delete(space.id);
    else this.marked.add(space.id);
    this.armed = null;
    cx?.notify();
  }

  /** Marks every row in `list`, or unmarks them all when they already are. */
  markAll(list, cx) {
    if (!list.length) return;
    if (list.every((space) => this.marked.has(space.id))) {
      for (const space of list) this.marked.delete(space.id);
    } else {
      for (const space of list) this.marked.add(space.id);
    }
    this.armed = null;
    cx?.notify();
  }

  closeMarked() {
    // Active space last, so focus doesn't jump around while closing the rest.
    const open = spaces()
      .filter((space) => this.marked.has(space.id))
      .sort((a, b) => Number(a.active) - Number(b.active));
    this.marked.clear();
    this.armed = null;
    // The double Enter is the confirmation: don't let Herdr ask once per space.
    for (const space of open) run("space.close", { id: space.id, confirmed: true });
  }

  choose(space, cx) {
    if (this.marked.size > 0) {
      if (this.armed !== "batch") this.armed = "batch";
      else this.closeMarked();
      cx?.notify();
      return;
    }
    if (!space) return;
    if (this.armed !== space.id) {
      this.armed = space.id;
    } else {
      this.armed = null;
      run("space.close", { id: space.id });
    }
    cx?.notify();
  }

  key(event, cx) {
    if (event.key === "escape") {
      cx.stop_propagation();
      this.close();
      return;
    }
    const list = this.matches();
    if (event.keystroke === "tab") {
      cx.stop_propagation();
      this.toggleMark(list[this.at], cx);
      if (list.length) this.at = Math.min(this.at + 1, list.length - 1);
      return;
    }
    if (event.keystroke === "alt-a") {
      cx.stop_propagation();
      this.markAll(list, cx);
      return;
    }
    if (event.key === "down") {
      if (list.length) this.at = (this.at + 1) % list.length;
    } else if (event.key === "up") {
      if (list.length) this.at = (this.at + list.length - 1) % list.length;
    } else {
      // Enter is handled by the input's "submit" only: handling it here too could
      // arm and close the row on a single press.
      return;
    }
    cx.stop_propagation();
    this.armed = null;
    this.lastAt = -1;
    if (list.length) this.scroll.scroll_to_item(this.at);
    cx.notify();
  }

  render(cx) {
    const t = theme();
    const danger = t.blocked || t.accent;
    const list = this.matches();
    if (this.at >= list.length) this.at = Math.max(0, list.length - 1);
    if (this.at !== this.lastAt) {
      this.lastAt = this.at;
      if (list.length) this.scroll.scroll_to_item(this.at);
    }
    const open = new Set(spaces().map((space) => space.id));
    for (const id of this.marked) if (!open.has(id)) this.marked.delete(id);
    if (this.armed === "batch" && this.marked.size === 0) this.armed = null;
    if (this.armed && this.armed !== "batch" && !list.some((space) => space.id === this.armed)) this.armed = null;
    const selected = list[this.at];
    const batch = this.armed === "batch";
    const count = this.marked.size;

    const row = (space, index) => {
      const on = index === this.at;
      const marked = this.marked.has(space.id);
      const armed = space.id === this.armed || (batch && marked);
      const tabs = `${space.tabs.length} tab${space.tabs.length === 1 ? "" : "s"}`;
      return h_flex()
        .id(`cs-${index}`)
        .mx(4)
        .h(34)
        .px(10)
        .gap(10)
        .items_center()
        .rounded(7)
        .cursor_pointer()
        .when(on, (el) => el.bg(t.selected))
        .hover((style) => style.bg(t.hover))
        .when(armed, (el) => el.border(1).border_color(danger))
        .on_click((e, cx) => {
          this.at = index;
          if (e.modifiers.control) this.toggleMark(space, cx);
          else this.choose(space, cx);
        })
        .child(
          div()
            .w(14)
            .text_color(armed ? danger : marked || space.active ? t.accent : t.dim)
            .child(armed ? "✕" : marked ? "◆" : space.active ? "●" : "▸"),
        )
        .child(
          div()
            .flex_1()
            .truncate()
            .text_color(armed ? danger : t.foreground)
            .when(on || armed, (el) => el.font_semibold())
            .child(space.name),
        )
        .child(div().flex_none().text_size(11).text_color(t.dim).child(tabs))
        .when(armed && !batch, (el) => el.child(div().text_size(11).text_color(danger).child("↵ again to close")))
        .when(on && !armed, (el) => el.child(div().text_size(11).text_color(t.dim).child("↵")));
    };

    const body = v_flex()
      .id("cs-list")
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
      .id("close-space")
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
          .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Close space"))
          .child(
            div()
              .id("cs-esc")
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
          .child(
            div()
              .flex_1()
              .truncate()
              .when(batch, (el) => el.text_color(danger).font_semibold())
              .when(count > 0 && !batch, (el) => el.text_color(t.accent))
              .child(
                batch
                  ? `↵ again to close ${count} space${count === 1 ? "" : "s"}`
                  : count > 0
                    ? `${count} marked  ↵ close them`
                    : selected?.folder || "",
              ),
          )
          .child(div().flex_none().child("↑↓ move  ⇥ mark  alt-a all  ↵ close  Esc exit")),
      );
  }
}
