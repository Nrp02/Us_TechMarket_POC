// When to measure the page, for the two things drawn from where its panes and
// text are: the planet's shade mask (`saturn-webgl.ts`) and the planet's light
// on the glass (`saturn-stage.tsx`).
//
// Neither may read the layout on every frame while the page moves. A route
// change arrives as an entrance, a chart drawing and the camera travelling,
// all at once, and measuring every pane and line of text on each of those
// frames is what made the move stutter. So both are told twice per change:
//
//   onChange  the first frame after it, once, so the mask is never left
//             describing the page that has gone;
//   onRest    once everything moving the page has finished, so what is
//             measured is where things come to rest.
//
// A change is content in <main> being added, removed or resized, the window
// resizing, or the planet's view changing (`data-view`, the camera's move).
// "Moving" is every finite animation or transition on something in <main> or
// on the view itself. Infinite ones (the stars breathing) never finish, so
// they are not waited for.

type PageRestOptions = {
  scene: HTMLElement;
  onChange?: () => void;
  onRest: () => void;
};
type Listener = Omit<PageRestOptions, "scene">;

// Both callers watch the same scene for the same moment, so they share one
// watcher: one set of observers, and one scan of the running animations per
// change rather than one each.
const watchers = new Map<HTMLElement, { listeners: Set<Listener>; change: () => void; stop: () => void }>();

export function watchPageRest({ scene, onChange, onRest }: PageRestOptions) {
  let watcher = watchers.get(scene);
  if (!watcher) {
    const listeners = new Set<Listener>();
    watcher = { listeners, ...watch(scene, listeners) };
    watchers.set(scene, watcher);
  }
  const listener = { onChange, onRest };
  watcher.listeners.add(listener);
  // A newcomer is told about the page as it is now, like the first was.
  watcher.change();

  const own = watcher;
  return () => {
    own.listeners.delete(listener);
    if (own.listeners.size) return;
    own.stop();
    watchers.delete(scene);
  };
}

function watch(scene: HTMLElement, listeners: Set<Listener>) {
  const main = document.querySelector("main");
  const view = scene.firstElementChild;
  let frame = 0;
  let generation = 0;

  const moving = () =>
    document.getAnimations().filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      if (!target || a.playState !== "running") return false;
      if (!(target === view || main?.contains(target))) return false;
      return Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity);
    });

  const settle = () => {
    frame = 0;
    for (const l of listeners) l.onChange?.();
    const mine = ++generation;
    void Promise.allSettled(moving().map((a) => a.finished)).then(() => {
      // A later change has its own wait.
      if (mine === generation)
        requestAnimationFrame(() => {
          if (mine === generation) for (const l of listeners) l.onRest();
        });
    });
  };
  const change = () => {
    if (!frame) frame = requestAnimationFrame(settle);
  };

  const content = new MutationObserver(change);
  const resize = new ResizeObserver(change);
  const views = new MutationObserver(change);
  if (main) {
    content.observe(main, { childList: true, subtree: true });
    resize.observe(main);
  }
  views.observe(scene, { attributes: true, attributeFilter: ["data-view"] });
  window.addEventListener("resize", change);

  const stop = () => {
    content.disconnect();
    resize.disconnect();
    views.disconnect();
    window.removeEventListener("resize", change);
    if (frame) cancelAnimationFrame(frame);
    generation++;
  };
  return { change, stop };
}
