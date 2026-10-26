import { useEffect, useRef, useState } from "react";

export function useSidebarOpen() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  // Each sidebar button goes away when pressed, so focus passes to the other one.
  const sidebarOpenedRef = useRef(isSidebarOpen);
  useEffect(() => {
    if (sidebarOpenedRef.current === isSidebarOpen) return;
    sidebarOpenedRef.current = isSidebarOpen;
    const active = document.activeElement;
    if (active !== document.body && !active?.matches(".sidebar-close, .sidebar-toggle")) return;
    document
      .querySelector<HTMLElement>(isSidebarOpen ? ".sidebar-close" : ".sidebar-toggle")
      ?.focus({ preventScroll: true });
  }, [isSidebarOpen]);

  return [isSidebarOpen, setIsSidebarOpen] as const;
}
