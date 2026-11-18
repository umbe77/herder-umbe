// Create a new project in the projects folder (~/develop unless config.json
// says otherwise, see config.js). Asks for a name, creates the folder, then
// opens it like choose-projects: a space named after the folder, with an "IDE"
// tab running `nvim .`, a "Terminal" tab with a shell and a "Claude" tab
// running `claude`. The IDE tab stays active.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, run, spaces, theme, notify, exec } from "herdr";

import { loadConfig, pathExists, tildify, DEFAULT_PROJECTS_DIR } from "./config.js";

// Returns an error message, or "" when the name can be used as a folder.
function validate(name) {
  if (!name) return "Type a project name";
  if (/\s/.test(name)) return "Project name cannot contain spaces";
  if (/[\/\\]/.test(name)) return "Project name cannot contain / or \\";
  if (name.startsWith(".")) return "Project name cannot start with a dot";
  return "";
}

export default class NewProject extends View {
  init(_props, cx) {
    this.root = DEFAULT_PROJECTS_DIR;
    this.configReady = new Promise((resolve) => {
      cx.spawn(async (cx) => {
        const config = await loadConfig();
        this.root = config.projectsDir;
        if (config.warning) notify({ title: "New project", body: config.warning, level: "warning" });
        cx.notify();
        resolve();
      });
    });
    this.name = "";
    this.error = "";
    this.busy = false;
    this.pending = null;

    this.input = InputState.new({ placeholder: "Project name…" });
    this.input.on("change", (_e, cx) => {
      this.name = this.input.value().trim();
      this.error = "";
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.create(cx));

    this.handle = cx.focus_handle();
    this.handle.focus();
    this.input.focus();
    cx.timer.after(100, () => this.input.focus());
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  create(cx) {
    if (this.busy) return;
    const name = this.name;
    const invalid = validate(name);
    if (invalid) {
      this.error = invalid;
      cx.notify();
      return;
    }
    this.busy = true;
    this.error = "";
    this.pending = { name, folder: "", before: null, tries: 0 };
    cx.notify();

    cx.spawn(async (cx) => {
      // A fast Enter must not create the project in the default folder.
      await this.configReady;
      const folder = `${this.root}/${name}`;
      this.pending.folder = folder;
      try {
        if (await pathExists(folder)) {
          this.fail(`${name} already exists in ${tildify(this.root)} (open it with alt-o)`, cx);
          return;
        }
        // A mod's fs is sandboxed to ~/.config/herdr-app, so let mkdir do it.
        const result = await exec("mkdir", ["--", folder], { timeout: 10000 });
        if (result.code !== 0) {
          const reason = result.stderr.trim() || `mkdir exited with ${result.code}`;
          this.fail(`Could not create ${folder}: ${reason}`, cx, true);
          return;
        }
      } catch (error) {
        this.fail(`Could not create ${folder}: ${error?.message ?? error}`, cx, true);
        return;
      }
      this.pending.before = new Set(spaces().map((space) => space.id));
      run("space.new", {
        name,
        folder,
        tab: "IDE",
        argv: ["nvim", "."],
      });
      this.waitForSpace(cx);
    });
  }

  // `toast` also shows the message as an error notification, for real failures
  // (not for "already exists", which the footer explains well enough).
  fail(message, cx, toast = false) {
    this.pending = null;
    this.busy = false;
    this.error = message;
    if (toast) notify({ title: "New project", body: message, level: "error" });
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
      this.fail(`Created ${pending.folder}, but Herdr did not create a space for it.`, cx, true);
      return;
    }
    cx.timer.after(100, (cx) => this.waitForSpace(cx));
  }

  key(event, cx) {
    if (event.key === "escape") {
      cx.stop_propagation();
      this.close();
    }
  }

  render(cx) {
    const t = theme();
    const invalid = this.name ? validate(this.name) : "";
    const message = this.error || invalid;
    const showError = !!message && !this.busy;

    let status;
    if (this.busy) {
      status = `Creating ${this.pending?.name ?? "project"}…`;
    } else if (message) {
      status = message;
    } else {
      status = this.name ? `${this.root}/${this.name}` : tildify(this.root);
    }

    return v_flex()
      .id("new-project")
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
          .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("New project"))
          .child(
            div()
              .id("np-esc")
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
          .child(div().text_color(t.dim).child("+"))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(
        h_flex()
          .flex_none()
          .items_start()
          .justify_between()
          .gap(12)
          .text_size(11)
          .text_color(t.dim)
          // Errors wrap so the whole message can be read; paths stay on one line.
          .child(
            div()
              .flex_1()
              .min_w(0)
              .when(!showError, (el) => el.truncate())
              .when(showError, (el) => el.text_color(t.foreground))
              .child(status),
          )
          .child(div().flex_none().child("↵ create  Esc close")),
      );
  }
}
