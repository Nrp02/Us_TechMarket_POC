"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Three routes, so three shortcuts, and no more.
//
// The pattern is the two-key `g <letter>` sequence — "go home", "go news",
// "go story" — rather than a single accelerator or a modifier chord. Single
// letters would fire on any stray keystroke, and every useful modifier chord on
// a Mac or Windows is already spoken for by the browser. The sequence is also
// what Gmail, GitHub and Linear use, so a visitor who knows it anywhere knows
// it here.
//
// Deliberately NOT a command palette. That pattern earns its cost at thirty
// commands; this product has three destinations and one editable list, and a
// palette would be a second navigation system competing with a rail that is
// permanently on screen.
export const SHORTCUTS: { key: string; href: string; label: string }[] = [
  { key: "h", href: "/", label: "Home" },
  { key: "n", href: "/news", label: "News" },
  { key: "a", href: "/todays-activity", label: "Today's Story" },
];

/** How long the leading `g` stays armed. */
const SEQUENCE_MS = 900;

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    let armedAt = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      // Any modifier means the visitor is talking to the browser or the OS,
      // not to us.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      // A menu owns its own keys — it runs type-ahead over the same letters,
      // and `g` is the first letter of GOOGL. Without this the two models fight
      // over every keystroke inside an open popover.
      if (
        event.target instanceof Element &&
        event.target.closest('[role="menu"]')
      )
        return;

      const now = Date.now();

      if (event.key === "g") {
        armedAt = now;
        return;
      }

      if (!armedAt || now - armedAt > SEQUENCE_MS) {
        armedAt = 0;
        return;
      }
      armedAt = 0;

      const match = SHORTCUTS.find((s) => s.key === event.key);
      if (!match) return;

      event.preventDefault();
      router.push(match.href);

      // Focus follows the navigation. A keyboard visitor who jumps routes
      // without this keeps focus on whatever they were on before — usually a
      // link in the page that just got replaced — so the next Tab starts from
      // nowhere meaningful. <main> is already tabIndex={-1} for the skip link,
      // which is the same problem solved for the same reason.
      requestAnimationFrame(() => {
        document.getElementById("main-content")?.focus();
      });
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}
