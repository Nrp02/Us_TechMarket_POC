"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { TopStock } from "@/lib/symbols";

// The page header doubles as the navigation for this section: the ticker
// itself is the button, and it opens a flat list of all 20 tracked symbols.
// There is deliberately no secondary tab bar on Today's Activity — the nav
// card plus this switcher is the whole of it.
//
// No watchlist grouping and no add/remove controls — every visitor sees the
// same 20 symbols, alphabetically, each beside its company name so a ticker
// like INTU or NOW need not be recalled. Copies news-date-picker.tsx's
// lightweight disclosure pattern (own open/close + outside-click/Escape state) rather
// than the old shared watchlist-menu hook, since a flat navigation list needs
// no mutation machinery.

export function SymbolSwitcher({ symbol, stocks }: { symbol: string; stocks: TopStock[] }) {
  const [open, setOpen] = useState(false);
  const [triggerWidth, setTriggerWidth] = useState(0);
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
        onClick={() => {
          setTriggerWidth(trigger.current?.offsetWidth ?? 0);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="flex items-center gap-2 rounded-xl px-2 py-1 text-figure font-semibold tracking-tight text-ink press hover:bg-glass-lift aria-expanded:bg-glass-lift pointer-coarse:min-h-11"
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
        {/* The comma keeps the name from running into the ticker: inline
            text joins without a space, so the h1 was read "NVDAChange stock". */}
        <span className="sr-only">, change stock</span>
      </button>

      {open && (
        // Grows from the centre of the ticker above it, so the list is seen
        // to come out of what was pressed. The list scrolls, not the pane: a
        // scrolling pane carries its lit rim away with the rows.
        <div
          className="panel-overlay absolute left-0 z-20 mt-2 w-60 rounded-2xl p-1"
          style={{ "--overlay-origin": `${triggerWidth / 2}px 0` } as CSSProperties}
        >
          <ul id={listId} aria-label="All tracked stocks" className="max-h-96 overflow-y-auto">
            {stocks.map((option) => (
              <li key={option.symbol}>
                <Link
                  href={`/todays-activity/${option.symbol}`}
                  onClick={() => close()}
                  aria-current={option.symbol === symbol ? "page" : undefined}
                  className={`flex items-baseline gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium press ${
                    option.symbol === symbol
                      ? "bg-surface-strong text-primary-active"
                      : "text-body hover:bg-surface-soft hover:text-ink"
                  }`}
                >
                  <span className="w-12 shrink-0">{option.symbol}</span>
                  <span className="min-w-0 truncate text-xs font-normal text-muted">{option.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
