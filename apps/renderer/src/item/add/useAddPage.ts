import type { ItemDetail } from "@inkling/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { showNewItem } from "../../capture/capture.ts";
import { type LibraryClient, libraryClient } from "../../library/connection.ts";
import { errorMessage } from "../../library/errors.ts";
import { useStepBack } from "../navigation.ts";
import { useEscape } from "../useEscape.ts";
import { useMounted } from "../useMounted.ts";

/** Shown after "Couldn’t save this yet:" when a link is not a web address. */
export const notAddress = "enter a web address, such as example.com.";

/**
 * Leaving and saving for an Add page. Back and Escape return without saving;
 * a save puts the new card at the top of the library, selects it and returns.
 */
export function useAddPage() {
  const navigate = useNavigate();
  const stepBack = useStepBack();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A second Enter can land before `saving` re-renders, so a ref keeps one save at a time.
  const busy = useRef(false);
  const mounted = useMounted();
  // Leaving waits for a save in flight, which leaves by itself when it lands.
  const leave = () => {
    if (!busy.current) stepBack(() => void navigate({ to: "/" }));
  };
  useEscape(leave);

  /** Resolves true once saved; a failure is shown as `error` and rethrown for the caller. */
  const save = async (write: (client: LibraryClient) => Promise<ItemDetail>) => {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      showNewItem(await write(await libraryClient()));
    } catch (saveError) {
      setError(errorMessage(saveError));
      throw saveError;
    } finally {
      busy.current = false;
      setSaving(false);
    }
    // Back or a sidebar click may already have taken the user elsewhere.
    if (mounted.current) leave();
    return true;
  };
  return { error, saving, save, leave, reject: setError };
}
