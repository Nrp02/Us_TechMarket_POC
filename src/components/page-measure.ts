// What the planet and the sky measure on the page. Both read the same things:
// the panes, and every line of text and every image, chart or control on the
// bare field. A rule about what counts as read is changed here, once.

export const PANES =
  ".panel,.panel-raised,.panel-rail,.panel-overlay,.panel-control,.panel-track,.panel-track-block,.panel-chip";
export const OBJECTS = 'img,svg,button,a,input,select,textarea,summary,[role="img"]';

// Whether React has hydrated the node. A style written onto server markup
// before hydration is a mismatch React reports, so callers leave those alone.
export function hydrated(el: Element) {
  return Object.keys(el).some((key) => key.startsWith("__reactFiber"));
}

/**
 * Calls `visit` with the box of every line of text and every object under
 * `root`, and with the box of each element that is an object. `reject` skips
 * an element and everything in it whole.
 */
export function forEachReadBox(
  root: Element,
  reject: string,
  visit: (box: DOMRect, el: Element | null) => void,
) {
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
      const el = node as Element;
      if (el.matches(reject)) return NodeFilter.FILTER_REJECT;
      return el.matches(OBJECTS) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) visit(r, n.parentElement);
    } else {
      visit((n as Element).getBoundingClientRect(), n as Element);
    }
  }
}
