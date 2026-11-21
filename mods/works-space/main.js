// Works space: show the space named "works", or create it (in the home folder)
// with two terminal tabs when it isn't open; either way it's moved to the top
// of the spaces list. Opened with `mod.open:works-space`:
// it acts once in init and closes its (1x1) overlay when done. No state.

import { View, div } from "gpui-kit";
import { props, closeOverlay, run, spaces, notify, checking } from "herdr";

const NAME = "works";

export default class WorksSpace extends View {
  init(_props, cx) {
    if (checking()) return;
    const existing = spaces().find((space) => space.name === NAME);
    if (existing) {
      run("space.select", { id: existing.id });
      if (existing.index !== 1) run("space.move", { id: existing.id, index: 1 });
      this.close();
      return;
    }
    this.before = new Set(spaces().map((space) => space.id));
    this.tries = 0;
    run("space.new", { name: NAME, tab: "Terminal" });
    this.waitForSpace(cx);
  }

  close() {
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
  }

  // space.new returns no id, so find the new space before adding the second tab.
  waitForSpace(cx) {
    const space = spaces().find((candidate) => !this.before.has(candidate.id));
    if (space) {
      run("tab.new", { space: space.id, name: "Terminal 2", focus: false });
      run("space.move", { id: space.id, index: 1 });
      this.close();
      return;
    }
    if (++this.tries > 30) {
      notify({ title: "Works space", body: `Herdr did not create the ${NAME} space.`, level: "error" });
      this.close();
      return;
    }
    cx.timer.after(100, (cx) => this.waitForSpace(cx));
  }

  render() {
    return div();
  }
}
