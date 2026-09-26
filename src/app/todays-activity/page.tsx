import { redirect } from "next/navigation";

import { TOP_20_SYMBOLS } from "@/lib/symbols";

// Today's Activity is always a page about one stock. Forwards to the first
// Top-20 symbol rather than showing a picker the header switcher already
// provides. This route has no nav entry once ticket 03 renames the shell nav
// to Market/Stocks/News — it exists only as a fallback for a bare
// /todays-activity link.
export default function TodaysActivity() {
  redirect(`/todays-activity/${TOP_20_SYMBOLS[0]}`);
}
