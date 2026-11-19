// tmux-style copy mode with vi keys for the focused terminal.
//
// The terminal's selection is the cursor: a one-cell selection in normal mode,
// a range in visual mode. Motions move the selection's moving end with
// terminal.adjust_selection (the view scrolls to follow). In normal mode the
// selection is collapsed back to one cell at its end whenever it changes.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, focused, terminals, notify, theme, checking, hc } from "herdr";

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

// ---- Word motions ---------------------------------------------------------
// Herdr has no word steps for the selection, so w/e/b work on the terminal's
// text from `hc read` (history + screen) and place the cursor with
// terminal.select. Motions work on {row, i}: a logical line and a code point
// index in it; Layout converts to and from the terminal's {row, col} cells.

// Character class, vim style: 0 blank, 1 keyword, 2 other punctuation.
function cls(ch) {
  if (ch === undefined || /\s/.test(ch)) return 0;
  return /[\p{L}\p{N}_]/u.test(ch) ? 1 : 2;
}

// Terminal cells a code point takes: 2 for wide (CJK, emoji), 0 for combining.
function cellWidth(ch) {
  const c = ch.codePointAt(0);
  if (/\p{M}/u.test(ch) || c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f)) return 0;
  if (
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf && c !== 0x303f) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe4f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x1f300 && c <= 0x1f64f) ||
    (c >= 0x1f900 && c <= 0x1f9ff) ||
    (c >= 0x20000 && c <= 0x3fffd)
  )
    return 2;
  return 1;
}

// The text laid out on the terminal's rows. `hc read` gives logical lines (a
// soft-wrapped line is one line), the selection counts screen rows: wrap each
// line at the terminal's width to map between {line, i} and {row, col}.
class Layout {
  constructor(lines, cols) {
    this.lines = lines;
    this.cols = cols;
    this.rowLine = []; // screen row -> line
    this.firstRow = []; // line -> its first screen row
    this.cells = []; // line -> [{row, col}] per code point
    for (const chars of lines) this.add(chars);
  }

  add(chars) {
    const line = this.firstRow.length;
    const first = this.rowLine.length;
    const at = [];
    let r = 0;
    let c = 0;
    for (const ch of chars) {
      const w = cellWidth(ch);
      if (w && c > 0 && c + w > this.cols) {
        r++;
        c = 0;
      }
      at.push({ row: first + r, col: c });
      c += w;
    }
    this.firstRow.push(first);
    this.cells.push(at);
    for (let k = 0; k <= r; k++) this.rowLine.push(line);
  }

  // Blank rows at the bottom of the screen that the read leaves out.
  padTo(row) {
    while (this.rowLine.length <= row) {
      this.lines.push([]);
      this.add([]);
    }
  }

  // Screen cell -> {row: line, i}; i is the line's length past its text.
  toText({ row, col }) {
    this.padTo(row);
    const line = this.rowLine[row];
    const at = this.cells[line];
    let i = at.length;
    for (let k = 0; k < at.length; k++) {
      if (at[k].row < row) continue;
      if (at[k].row > row || at[k].col > col) break;
      const w = cellWidth(this.lines[line][k]);
      i = col < at[k].col + Math.max(w, 1) ? k : k + 1;
    }
    return { row: line, i };
  }

  // {row: line, i} -> screen cell.
  toCell({ row: line, i }) {
    const at = this.cells[line];
    if (i < at.length) return at[i];
    if (!at.length) return { row: this.firstRow[line], col: 0 };
    const last = at[at.length - 1];
    return { row: last.row, col: Math.min(last.col + 1, this.cols - 1) };
  }
}

// Step through the text one character at a time; a line break reads as a blank.
class Walker {
  constructor(rows, row, i) {
    this.rows = rows;
    this.row = row;
    this.i = i;
  }
  ch() {
    return this.rows[this.row][this.i];
  }
  // An empty row: vim treats it as a word of its own for w and b.
  empty() {
    return this.rows[this.row].length === 0;
  }
  next() {
    if (this.i < this.rows[this.row].length - 1) this.i++;
    else if (this.row < this.rows.length - 1) {
      this.row++;
      this.i = 0;
    } else return false;
    return true;
  }
  prev() {
    if (this.i > 0) this.i--;
    else if (this.row > 0) {
      this.row--;
      this.i = Math.max(0, this.rows[this.row].length - 1);
    } else return false;
    return true;
  }
  get pos() {
    return { row: this.row, i: this.i };
  }
}

function nextWordStart(rows, p) {
  const w = new Walker(rows, p.row, p.i);
  const start = cls(w.ch());
  let row = w.row;
  // Leave the current word (a line break ends it too).
  while (start && cls(w.ch()) === start) {
    if (!w.next()) return p;
    if (w.row !== row) break;
  }
  // Then the blanks, stopping on an empty row.
  while (!cls(w.ch())) {
    if (w.row !== p.row && w.empty()) break;
    if (!w.next()) return p;
  }
  return w.pos;
}

function wordEnd(rows, p) {
  const w = new Walker(rows, p.row, p.i);
  if (!w.next()) return p;
  while (!cls(w.ch())) if (!w.next()) return p;
  const c = cls(w.ch());
  for (;;) {
    const at = w.pos;
    if (!w.next() || w.row !== at.row || cls(w.ch()) !== c) return at;
  }
}

function prevWordStart(rows, p) {
  const w = new Walker(rows, p.row, p.i);
  if (!w.prev()) return p;
  while (!cls(w.ch())) {
    if (w.row !== p.row && w.empty()) return w.pos;
    if (!w.prev()) return w.pos;
  }
  const c = cls(w.ch());
  for (;;) {
    const at = w.pos;
    if (!w.prev() || w.row !== at.row || cls(w.ch()) !== c) return at;
  }
}

const WORD_MOTIONS = { w: nextWordStart, e: wordEnd, b: prevWordStart };

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
    this.layout = null;
    this.reading = this.readRows();
  }

  // The terminal's text, one array of code points per row.
  async readRows() {
    try {
      const [r, g] = await Promise.all([
        hc(["read", this.term, "--lines", "1000000", "--json"]),
        hc(["get", this.term, "--json"]),
      ]);
      if (r.code !== 0) throw new Error(r.stderr.trim() || `hc read exited ${r.code}`);
      const { text } = JSON.parse(r.stdout);
      let cols = Infinity;
      try {
        cols = JSON.parse(g.stdout).cols || Infinity;
      } catch {}
      const lines = text.replace(/\n$/, "").split("\n").map((line) => Array.from(line));
      this.layout = new Layout(lines, cols);
    } catch (e) {
      this.layout = null;
      notify({ title: "Copy mode", body: `Can't read the terminal: ${e.message ?? e}`, level: "warning", timeout: 3000 });
    }
    return this.layout;
  }

  // w / e / b, times over: find the spot in the text, then go there.
  async word(motion, times) {
    let layout = this.layout ?? (await this.reading);
    let sel = this.selection();
    if (!layout || !sel || this.done) return;
    // Output may have added rows since the last read.
    if (sel.end.row >= layout.rowLine.length) layout = (await (this.reading = this.readRows())) ?? layout;
    sel = this.selection();
    if (!sel || this.done) return;
    let p = layout.toText(sel.end);
    for (let k = 0; k < times; k++) p = motion(layout.lines, p);
    this.goto(layout.toCell(p), sel.end);
  }

  // Put the cursor (the selection's moving end) on a cell.
  goto(target, from) {
    if (this.mode === "normal") {
      this.cmd("terminal.select", { at: target });
      return;
    }
    // Keep the anchor: walk the moving end there.
    const dr = target.row - from.row;
    this.move(dr > 0 ? "down" : "up", Math.abs(dr));
    if (this.mode === "line") return;
    this.move("line_start", 1);
    this.move("right", target.col);
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
    else if (WORD_MOTIONS[name]) {
      const times = this.takeCount();
      const motion = WORD_MOTIONS[name];
      // One at a time, in key order: each starts where the last one left the cursor.
      const prev = this.queue ?? Promise.resolve();
      this.queue = prev.then(() => this.word(motion, times)).catch(() => {});
      const mine = this.queue;
      cx.spawn(async (cx) => {
        await mine;
        cx.notify();
      });
    } else if (key === "space") {
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
        ? "hjkl wbe move  v/V select  y copy  q quit"
        : "hjkl wbe move  y/↵ copy  v/V toggle  Esc quit";

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
