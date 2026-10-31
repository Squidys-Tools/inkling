import { useEffect, useRef } from "react";

/** Whether the component is still on screen, for work that finishes after the user may have left. */
export function useMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
