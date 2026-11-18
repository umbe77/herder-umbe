// tmux-style copy mode with vi keys for the focused terminal.
//
// The terminal's selection is the cursor: a one-cell selection in normal mode,
// a range in visual mode. Motions move the selection's moving end with
// terminal.adjust_selection (the view scrolls to follow). In normal mode the
// selection is collapsed back to one cell at its end whenever it changes.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, focused, terminals, notify, theme, checking } from "herdr";

// Motion keys -> adjust_selection directions.
const MOTIONS = {
  h: "left",
  left: "left",
  backspace: "left",
  l: "right",
  right: "right",
  j: "down",
  down: "down",
  k: "up",
  up: "up",
  "0": "line_start",
  "^": "line_start",
  home: "line_start",
  $: "line_end",
  end: "line_end",
  g: "home",
  G: "end",
  pageup: "page_up",
  pagedown: "page_down",
};

// ctrl-<key> motions.
const CTRL_MOTIONS = {
  u: "page_up",
  b: "page_up",
  d: "page_down",
  f: "page_down",
  y: "up",
  e: "down",
};

const LABEL = { normal: "COPY", visual: "VISUAL", line: "V-LINE" };

export default class CopyMode extends View {
  init(_props, cx) {
    this.mode = "normal"; // normal | visual | line
    this.count = "";
    this.done = false;
    this.term = focused()?.terminal ?? null;

    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(100, () => this.handle.focus());

    if (checking()) return;
    if (!this.term) {
      notify({ title: "Copy mode", body: "Focus a terminal first.", level: "warning", timeout: 3000 });
      this.quit();
      return;
    }
    this.cmd("terminal.select", { at: "cursor" });
  }

  async close() {
    // Esc and clicks beside the popup close it from outside: leave nothing selected.
    if (this.term && !this.done) run("terminal.clear_selection", { terminal: this.term });
  }

  cmd(name, args = {}) {
    run(name, { terminal: this.term, ...args });
  }

  selection() {
    const t = terminals().find((x) => x.address === this.term);
    return t?.selection ?? focused()?.selection ?? null;
  }

  quit() {
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
  }

  cancel() {
    this.done = true;
    if (this.term) this.cmd("terminal.clear_selection");
    this.quit();
  }

  yank() {
    this.done = true;
    // terminal.copy copies the focused terminal's selection; the popup holds the
    // keyboard, so that falls back to the focused pane, the one we started on.
    run("terminal.copy");
    this.cmd("terminal.clear_selection");
    this.quit();
  }

  // Start (or leave) a visual mode at the cursor.
  setMode(mode) {
    const sel = this.selection();
    const at = sel ? sel.end : "cursor";
    if (this.mode === mode) {
      this.mode = "normal";
      this.cmd("terminal.select", { at });
    } else {
      this.mode = mode;
      this.cmd("terminal.select", { at, mode: mode === "line" ? "line" : "cell" });
    }
  }

  move(direction, times) {
    for (let i = 0; i < times; i++) this.cmd("terminal.adjust_selection", { direction });
  }

  key(event, cx) {
    cx.stop_propagation();
    const m = event.modifiers;
    const ch = event.key_char;
    const key = event.key;

    if (key === "escape" || (m.control && key === "c")) return this.cancel();

    if (m.control) {
      const direction = CTRL_MOTIONS[key];
      if (direction) this.move(direction, this.takeCount());
      cx.notify();
      return;
    }

    // Count prefix: 1-9 start it, 0 continues it (a lone 0 is line start).
    if (ch && /^[0-9]$/.test(ch) && (ch !== "0" || this.count)) {
      this.count = (this.count + ch).slice(0, 4);
      cx.notify();
      return;
    }

    const name = ch && ch.trim() ? ch : key;
    if (name === "q") return this.cancel();
    if (name === "y" || key === "enter") return this.yank();
    if (name === "v") this.setMode("visual");
    else if (name === "V") this.setMode("line");
    else if (key === "space") {
      if (this.mode === "normal") this.setMode("visual");
    } else if (MOTIONS[name]) {
      const times = /^(g|G|0|\^|\$|home|end)$/.test(name) ? 1 : this.takeCount();
      this.move(MOTIONS[name], times);
    }
    this.count = "";
    cx.notify();
  }

  takeCount() {
    const n = parseInt(this.count, 10);
    this.count = "";
    return n > 0 ? n : 1;
  }

  render(cx) {
    const t = theme();

    // Normal mode: keep the selection one cell wide, at its moving end.
    const sel = this.term && !this.done ? this.selection() : null;
    if (this.mode === "normal" && sel) {
      const { start, end } = sel;
      if (start.row !== end.row || start.col !== end.col) {
        this.cmd("terminal.select", { at: end });
      }
    }

    const where = sel ? `${sel.end.row + 1}:${sel.end.col + 1}` : "";
    const hint =
      this.mode === "normal"
        ? "hjkl move  v/V select  y copy  q quit"
        : "hjkl move  y/↵ copy  v/V toggle  Esc quit";

    return v_flex()
      .id("copy-mode")
      .track_focus(this.handle)
      .on_key_down((event, cx) => this.key(event, cx))
      .size_full()
      .px(14)
      .py(8)
      .gap(4)
      .bg(t.popover)
      .text_size(12)
      .child(
        h_flex()
          .items_center()
          .gap(10)
          .child(
            div()
              .px(8)
              .py(1)
              .rounded(5)
              .bg(this.mode === "normal" ? t.accent : t.done)
              .text_color(t.accent_foreground)
              .font_semibold()
              .child(`-- ${LABEL[this.mode]} --`),
          )
          .child(div().flex_1().text_color(t.muted).child(this.count ? `count ${this.count}` : ""))
          .child(div().text_color(t.dim).child(where)),
      )
      .child(div().text_size(11).text_color(t.dim).truncate().child(hint));
  }
}
