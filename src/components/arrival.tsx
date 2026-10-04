import { Fragment, type CSSProperties } from "react";

// The page's line arriving (globals.css, "The page's line"). Server
// components: the motion is CSS, so a page that never runs a script still
// shows the finished line.

/**
 * A short lede that comes up a word at a time. The words are drawn for the
 * eye only; assistive technology reads the sentence once, whole.
 */
export function WordReveal({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <>
      <span aria-hidden>
        {words.map((word, i) => (
          <Fragment key={i}>
            <span className="word" style={{ "--w": i } as CSSProperties}>
              {word}
            </span>
            {i < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}

/**
 * A count that runs up from zero to `value` once, as the page arrives.
 * `order` puts a second figure one short beat behind the first.
 */
export function CountUp({ value, order = 0 }: { value: number; order?: number }) {
  return (
    <span className="figure-count" style={{ "--to": value, "--figure-order": order } as CSSProperties}>
      <span>{value}</span>
    </span>
  );
}
