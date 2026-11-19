// Toggle git graph: show the side panel on its git graph, or hide the panel
// when the graph is already what it shows. Opened with
// `mod.open:git-graph-toggle`: it acts once in init and closes its (1x1)
// overlay right away.
//
// Expects the layout to have a `panel` node holding a `panel-body` stack with
// a `graph` child (as main and catppuccin do).

import { View, div } from "gpui-kit";
import { props, closeOverlay, run, layout, notify, checking } from "herdr";

const PANEL = "panel";
const STACK = "panel-body";
const GRAPH = "graph";

// Every node in the layout tree, by id.
function nodesById(node, out = {}) {
  if (!node || typeof node !== "object") return out;
  if (node.id) out[node.id] = node;
  for (const child of node.children ?? []) nodesById(child, out);
  return out;
}

export default class GitGraphToggle extends View {
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
    const nodes = nodesById(layout());
    const panel = nodes[PANEL];
    const stack = nodes[STACK];
    const hasGraph = (stack?.children ?? []).some((c) => c?.id === GRAPH);
    if (!panel || !hasGraph) {
      notify({ title: "No git graph in this layout", level: "warning", timeout: 3000 });
      return;
    }
    if (!panel.hidden && stack.active === GRAPH) {
      run("layout.hide", { id: PANEL });
    } else {
      run("layout.select", { stack: STACK, child: GRAPH });
      run("layout.show", { id: PANEL });
    }
  }

  render() {
    return div();
  }
}
