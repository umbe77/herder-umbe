// Zen mode: hide every bar of the shown layout (sidebar, tab bar, status bar,
// side panel) so only the terminals remain; run again to bring back exactly
// what zen mode hid. Opened with `mod.open:zen-mode`: it acts once in init and
// closes its (1x1) overlay right away.
//
// State lives in shared("zen-mode") as { [layoutName]: [hidden node ids] }, so
// each layout keeps its own zen state and nodes already hidden stay hidden.

import { View, div } from "gpui-kit";
import { props, closeOverlay, run, layout, shared, setShared, checking } from "herdr";

const BARS = ["sidebar", "tabs", "status", "panel"];
const KEY = "zen-mode";

// Every node in the layout tree, by id.
function nodesById(node, out = {}) {
  if (!node || typeof node !== "object") return out;
  if (node.id) out[node.id] = node;
  for (const child of node.children ?? []) nodesById(child, out);
  return out;
}

export default class ZenMode extends View {
  init(_props, _cx) {
    if (checking()) return;
    try {
      this.toggle();
    } finally {
      const overlay = props()?.overlay;
      if (overlay) closeOverlay(overlay);
    }
  }

  toggle() {
    const name = shared("layout") ?? "main";
    const state = { ...(shared(KEY) ?? {}) };
    const hiddenByZen = state[name];

    if (Array.isArray(hiddenByZen)) {
      for (const id of hiddenByZen) run("layout.show", { id });
      delete state[name];
    } else {
      const nodes = nodesById(layout());
      const ids = BARS.filter((id) => nodes[id] && !nodes[id].hidden);
      for (const id of ids) run("layout.hide", { id });
      state[name] = ids;
    }
    setShared(KEY, state);
  }

  render() {
    return div();
  }
}
