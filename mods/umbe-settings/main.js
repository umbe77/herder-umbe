// Settings for the herdr-umbe mods: the projects folder and the agent command
// that choose-projects (alt-o) and new-project (alt-n) use. Saved to
// $XDG_CONFIG_HOME/herdr-umbe/config.json (~/.config/herdr-umbe/config.json).

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, theme, notify } from "herdr";
import { loadConfig, saveConfig, pathExists, expandHome, tildify, DEFAULT_PROJECTS_DIR_RAW, DEFAULT_AGENT_CMD } from "./config.js";

export default class UmbeSettings extends View {
  init(_props, cx) {
    this.loading = true;
    this.busy = false;
    this.path = "";
    this.raw = {};
    this.value = "";
    this.error = "";
    this.warning = "";
    this.missing = false;
    this.checked = "";

    this.input = InputState.new({ placeholder: DEFAULT_PROJECTS_DIR_RAW });
    this.input.on("change", (_e, cx) => {
      this.value = this.input.value().trim();
      this.error = "";
      this.check(cx);
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.save(cx));

    this.agentInput = InputState.new({ placeholder: DEFAULT_AGENT_CMD });
    this.agentInput.on("change", (_e, cx) => {
      this.error = "";
      cx.notify();
    });
    this.agentInput.on("submit", (_e, cx) => this.save(cx));

    // Which field holds the keyboard, so Tab / Shift-Tab can switch to the other.
    this.focused = this.input;
    this.input.on("focus", () => (this.focused = this.input));
    this.agentInput.on("focus", () => (this.focused = this.agentInput));

    this.handle = cx.focus_handle();
    this.handle.focus();
    this.input.focus();
    cx.timer.after(100, () => this.input.focus());

    cx.spawn(async (cx) => {
      const config = await loadConfig();
      this.path = config.path;
      this.raw = config.raw;
      this.warning = config.warning;
      this.value = config.projectsDirRaw;
      this.input.set_value(this.value);
      this.agentInput.set_value(config.agentCmd);
      this.loading = false;
      this.check(cx);
      cx.notify();
    });
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  // Flags a folder that doesn't exist (saving is still allowed).
  check(cx) {
    const value = this.value;
    if (!value) {
      this.missing = false;
      return;
    }
    cx.spawn(async (cx) => {
      let exists = true;
      try {
        exists = await pathExists(expandHome(value));
      } catch (_error) {
        // can't tell: don't warn
      }
      if (this.value !== value) return;
      this.missing = !exists;
      this.checked = value;
      cx.notify();
    });
  }

  save(cx) {
    if (this.busy || this.loading) return;
    const value = this.value;
    if (!value) {
      this.error = "Type a folder, e.g. ~/develop";
      cx.notify();
      return;
    }
    this.busy = true;
    this.error = "";
    cx.notify();

    cx.spawn(async (cx) => {
      try {
        const agent = this.agentInput.value().trim();
        const next = { ...this.raw, projects_dir: value, agent_cmd: agent };
        // Empty means "use the default", so drop the key.
        if (!agent) delete next.agent_cmd;
        const path = await saveConfig(next);
        notify({ title: "herdr-umbe settings", body: `Saved to ${tildify(path)}`, level: "success" });
        this.close();
      } catch (error) {
        this.busy = false;
        this.error = `Could not save ${tildify(this.path)}: ${error?.message ?? error}`;
        notify({ title: "herdr-umbe settings", body: this.error, level: "error" });
        cx.notify();
      }
    });
  }

  key(event, cx) {
    if (event.key === "escape") {
      cx.stop_propagation();
      this.close();
    } else if (event.key === "tab") {
      // Only two fields, so Tab and Shift-Tab both go to the other one.
      cx.stop_propagation();
      this.focused = this.focused === this.input ? this.agentInput : this.input;
      this.focused.focus();
      cx.notify();
    }
  }

  render(cx) {
    const t = theme();

    let status;
    let strong = false;
    if (this.loading) {
      status = "Loading…";
    } else if (this.busy) {
      status = "Saving…";
    } else if (this.error) {
      status = this.error;
      strong = true;
    } else if (this.warning) {
      status = this.warning;
      strong = true;
    } else if (this.missing && this.checked === this.value) {
      status = `${expandHome(this.value)} does not exist yet`;
      strong = true;
    } else {
      status = this.path ? `Config file: ${tildify(this.path)}` : "";
    }

    return v_flex()
      .id("umbe-settings")
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
          .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("herdr-umbe settings"))
          .child(
            div()
              .id("us-esc")
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
      .child(div().flex_none().text_size(12).text_color(t.dim).child("Projects folder (used by Choose project and New project)"))
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
          .child(div().text_color(t.dim).child("▸"))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(div().flex_none().text_size(12).text_color(t.dim).child("Agent command (third tab of Choose project and New project)"))
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
          .child(div().text_color(t.dim).child("$"))
          .child(Input.new(this.agentInput).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(
        h_flex()
          .flex_none()
          .items_start()
          .justify_between()
          .gap(12)
          .text_size(11)
          .text_color(t.dim)
          .child(
            div()
              .flex_1()
              .min_w(0)
              .when(!strong, (el) => el.truncate())
              .when(strong, (el) => el.text_color(t.foreground))
              .child(status),
          )
          .child(div().flex_none().child("Tab next  ↵ save  Esc close")),
      );
  }
}
