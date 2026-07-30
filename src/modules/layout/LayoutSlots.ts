import { Reactive } from 'ivue';
import { ref } from 'vue';

// The LIVE layout slot sizes: the numbers every layout resolve reads for the workspace on screen.
//
// They are SIZES, not preferences. A splitter drag writes here, the resolve reads here, and the
// per-workspace layout contribution swaps the whole set on a workspace switch. Before this class
// existed the same three numbers had no owner: two lived in the settings store beside genuine
// preferences, and the third was a local variable inside the root view. A value with no owner
// cannot be scoped, which is why widening one workspace's dock widened every workspace's dock.
//
// The settings store keeps its `sidebarWidth` and `rightDockWidth` fields. Their meaning narrows
// to what they always were for a fresh session: the size a workspace STARTS at.
// invariant: Layout slot sizes are workspace scoped (src/modules/layout/layout.invariants.md)
class $LayoutSlots {
  /** The primary dock's content width in cells. */
  get primaryDockColumns() {
    return ref(0);
  }

  /** The right dock's content width in cells. */
  get rightDockColumns() {
    return ref(0);
  }

  /** The unexpanded bottom panel's height in rows. */
  get bottomPanelRows() {
    return ref(0);
  }
}

export namespace LayoutSlots {
  export const $Class = $LayoutSlots;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
  export type Model = InstanceType<typeof Class>;
}
