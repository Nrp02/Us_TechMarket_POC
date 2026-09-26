"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

// The page header doubles as the navigation for this section: the ticker
// itself is the button, and it opens a flat list of all 20 tracked symbols.
// There is deliberately no secondary tab bar on Today's Activity — the nav
// card plus this switcher is the whole of it.
//
// No watchlist grouping and no add/remove controls — every visitor sees the
// same 20 symbols, alphabetically. Copies news-date-picker.tsx's lightweight
// disclosure pattern (own open/close + outside-click/Escape state) rather
// than the old shared watchlist-menu hook, since a flat navigation list needs
// no mutation machinery.

export function SymbolSwitcher({ symbol, symbols }: { symbol: string; symbols: string[] }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="flex items-center gap-2 rounded-xl px-2 py-1 text-figure font-semibold tracking-tight text-ink transition-colors hover:bg-surface-strong pointer-coarse:min-h-11"
      >
        {symbol}
        <svg
          viewBox="0 0 20 20"
          className={`size-5 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path
            d="M5 8l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="sr-only">Change stock</span>
      </button>

      {open && (
        <div className="panel-overlay absolute left-0 z-20 mt-2 max-h-96 w-60 overflow-y-auto rounded-2xl p-1">
          <ul id={listId} aria-label="All tracked stocks">
            {symbols.map((option) => (
              <li key={option}>
                <Link
                  href={`/todays-activity/${option}`}
                  onClick={() => close()}
                  aria-current={option === symbol ? "page" : undefined}
                  className={`block rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
                    option === symbol
                      ? "bg-surface-strong text-primary-active"
                      : "text-body hover:bg-surface-soft hover:text-ink"
                  }`}
                >
                  {option}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
