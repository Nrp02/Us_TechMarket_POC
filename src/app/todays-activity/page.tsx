import { redirect } from "next/navigation";

import { TOP_20_SYMBOLS } from "@/lib/symbols";

// Today's Activity is always a page about one stock. The "Stocks" nav item
// forwards here and lands on the first Top-20 symbol (NVDA) rather than
// showing a picker the header switcher already provides — restoring the
// pre-ticket-03 default after the owner clarified that "Stocks" in nav
// means "go to Today's Activity," not a separate full-table page.
export default function TodaysActivity() {
  redirect(`/todays-activity/${TOP_20_SYMBOLS[0]}`);
}
