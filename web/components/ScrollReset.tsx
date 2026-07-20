"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// The desktop app-shell scrolls inside `.app-scroll`, not the window. That element
// lives in the root layout, so it survives client-side navigation and keeps its
// scroll offset — meaning a route change from a scrolled-down long page would land
// on the next page already scrolled. Next's built-in scroll restoration only resets
// the window, so we reset the container ourselves on every pathname change.
export default function ScrollReset() {
  const pathname = usePathname();
  useEffect(() => {
    document.querySelector(".app-scroll")?.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
