// Choose a project from the projects folder (~/develop unless config.json says
// otherwise, see config.js). On Enter: a space named after the folder,
// with an "IDE" tab running `nvim .`, a "Terminal" tab with a shell and a
// "Claude" tab running `claude`. The IDE tab stays active.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { props, closeOverlay, run, spaces, theme, notify } from "herdr";

import { loadConfig, listDirs, tildify, DEFAULT_PROJECTS_DIR } from "./config.js";

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

export default class ChooseProjects extends View {
  init(_props, cx) {
    this.root = DEFAULT_PROJECTS_DIR;
    this.dirs = [];
    this.query = "";
    this.at = 0;
    this.lastAt = -1;
    this.loading = true;
    this.error = "";
    this.busy = false;
    this.pending = null;

    this.input = InputState.new({ placeholder: "Type to filter projects…" });
    this.input.on("change", (_e, cx) => {
      this.query = this.input.value();
      this.at = 0;
      this.lastAt = -1;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.choose(this.matches()[this.at], cx));

    this.handle = cx.focus_handle();
    this.handle.focus();
    this.input.focus();
    cx.timer.after(100, () => this.input.focus());

    this.scroll = ScrollHandle.new();
    cx.spawn(async (cx) => {
      const config = await loadConfig();
      this.root = config.projectsDir;
      if (config.warning) notify({ title: "Choose project", body: config.warning, level: "warning" });
      try {
        this.dirs = await listDirs(this.root);
      } catch (error) {
        this.error = `Could not read ${this.root}: ${error?.message ?? error}`;
      }
      this.loading = false;
      cx.notify();
    });
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  matches() {
    const query = this.query.trim();
    if (!query) return this.dirs.map((name) => ({ name }));
    return this.dirs
      .map((name) => {
        const score = fuzzy(query, name);
        return score === null ? null : { name, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  choose(match, cx) {
    if (!match || this.busy) return;
    this.busy = true;
    this.error = "";
    this.pending = {
      name: match.name,
      folder: `${this.root}/${match.name}`,
      before: new Set(spaces().map((space) => space.id)),
      tries: 0,
    };
    run("space.new", {
      name: match.name,
      folder: this.pending.folder,
      tab: "IDE",
      argv: ["nvim", "."],
    });
    this.waitForSpace(cx);
    this.lastAt = -1;
    cx.notify();
  }

  // space.new returns no id, so find the new space before adding the other tabs.
  waitForSpace(cx) {
    const pending = this.pending;
    if (!pending) return;
    const space = spaces().find((candidate) => !pending.before.has(candidate.id));
    if (space) {
      run("tab.new", {
        space: space.id,
        name: "Terminal",
        folder: pending.folder,
        focus: false,
      });
      run("tab.new", {
        space: space.id,
        name: "Claude",
        folder: pending.folder,
        argv: ["claude"],
        focus: false,
      });
      this.pending = null;
      this.close();
      return;
    }
    if (++pending.tries > 30) {
      this.pending = null;
      this.busy = false;
      this.error = `Herdr did not create a space for ${pending.name}.`;
      notify({ title: "Choose project", body: this.error, level: "error" });
      cx.notify();
      return;
    }
    cx.timer.after(100, (cx) => this.waitForSpace(cx));
  }

  key(event, cx) {
    if (event.key === "escape") {
      cx.stop_propagation();
      this.close();
      return;
    }
    if (this.busy) return;
    const list = this.matches();
    if (event.key === "down") {
      if (list.length) this.at = (this.at + 1) % list.length;
    } else if (event.key === "up") {
      if (list.length) this.at = (this.at + list.length - 1) % list.length;
    } else if (event.key === "enter") {
      this.choose(list[this.at], cx);
      cx.stop_propagation();
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

    const row = (item, index) => {
      const on = index === this.at;
      return h_flex()
        .id(`cp-${index}`)
        .mx(4)
        .h(34)
        .px(10)
        .gap(10)
        .items_center()
        .rounded(7)
        .cursor_pointer()
        .when(on, (el) => el.bg(t.selected))
        .hover((style) => style.bg(t.hover))
        .on_click((_e, cx) => this.choose(item, cx))
        .child(div().w(14).text_color(on ? t.accent : t.dim).child("▸"))
        .child(div().flex_1().truncate().text_color(t.foreground).when(on, (el) => el.font_semibold()).child(item.name))
        .when(on, (el) => el.child(div().text_size(11).text_color(t.dim).child("↵")));
    };

    let body;
    if (this.busy) {
      body = v_flex()
        .h(400)
        .min_h(0)
        .items_center()
        .justify_center()
        .gap(6)
        .child(div().font_semibold().text_color(t.foreground).child(`Opening ${this.pending?.name ?? "project"}…`))
        .child(div().text_size(11).text_color(t.dim).child(this.pending?.folder ?? ""));
    } else {
      body = v_flex()
        .id("cp-list")
        .h(400)
        .min_h(0)
        .overflow_y_scrollbar()
        .track_scroll(this.scroll)
        .when(this.loading, (el) => el.items_center().justify_center().child(div().text_color(t.dim).child("Loading…")))
        .when(!this.loading && list.length === 0, (el) =>
          el.items_center().justify_center().child(
            div().text_color(t.dim).child(this.error || (this.query ? "No matching folders" : `No folders in ${tildify(this.root)}`)),
          ),
        )
        .children(list.map(row));
    }

    return v_flex()
      .id("choose-projects")
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
          .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Open project"))
          .child(
            div()
              .id("cp-esc")
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
              .child(this.error && !this.busy ? this.error : selected ? `${this.root}/${selected.name}` : tildify(this.root)),
          )
          .child(div().flex_none().child("↑↓ move  ↵ open  Esc close")),
      );
  }
}
