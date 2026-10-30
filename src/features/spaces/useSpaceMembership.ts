import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addSpaceItem,
  listItemSpaces,
  removeSpaceItem,
  type StoredSpace,
} from "../../lib/libraryApi";
import { shouldUseSeedLibrary } from "../../lib/previewMode";
import type { LibraryItem } from "../../lib/types";
import { seedSpaceItems } from "../library/seed";
import { errorMessage } from "../errorMessage";

export function useSpaceMembership({
  canUseDesktopBackend,
  spaces,
  activeSpaceId,
  selectedItemId,
  reload,
  setCaptureError,
  setSidebarActionError,
}: {
  canUseDesktopBackend: boolean;
  spaces: StoredSpace[];
  activeSpaceId: string | null;
  selectedItemId: string | null;
  reload: () => void;
  setCaptureError: Dispatch<SetStateAction<string | null>>;
  setSidebarActionError: Dispatch<SetStateAction<string | null>>;
}) {
  // Manual membership, keyed by space id then item id. Only read in preview and
  // seed mode; the desktop backend owns membership through the space item commands.
  const [localSpaceItems, setLocalSpaceItems] = useState<Map<string, Set<string>>>(
    () => new Map(Object.entries(seedSpaceItems).map(([spaceId, ids]) => [spaceId, new Set(ids)])),
  );
  // Which Regular Spaces hold the item open in the overlay, so its chips can
  // render in the right state. Cleared whenever the overlay closes.
  const [fetchedItemSpaceIds, setItemSpaceIds] = useState<string[]>([]);
  const itemSpaceIds = useMemo(
    () =>
      selectedItemId && shouldUseSeedLibrary()
        ? [...localSpaceItems]
            .filter(([, members]) => members.has(selectedItemId))
            .map(([spaceId]) => spaceId)
        : fetchedItemSpaceIds,
    [fetchedItemSpaceIds, localSpaceItems, selectedItemId],
  );
  // Must stay a stable callback: the overlay actions memo closes over it, and a
  // stale membership read would turn "Remove from" into a second add. Writes per
  // Space are chained so a second click reverses the first instead of racing it.
  const spaceWritesRef = useRef<Map<string, Promise<void>>>(new Map());
  // Bumped by every chip toggle. A membership read already in flight carries the
  // value it saw here and drops its result if a toggle has landed since, so an
  // older read cannot roll back the chip the user just changed.
  const spaceMembershipEpochRef = useRef(0);
  const toggleItemInSpace = useCallback(
    async (item: LibraryItem, spaceId: string) => {
      const itemId = String(item.id);
      const wasMember = itemSpaceIds.includes(spaceId);
      const adding = !wasMember;
      const show = (next: boolean) => {
        setItemSpaceIds((current) => {
          if (next) return current.includes(spaceId) ? current : [...current, spaceId];
          return current.filter((id) => id !== spaceId);
        });
      };
      if (!canUseDesktopBackend) {
        // Preview keeps membership in local state and itemSpaceIds is derived from
        // it, so there is no write to make and none to chain.
        setLocalSpaceItems((current) => {
          const next = new Map(current);
          const members = new Set(next.get(spaceId) ?? []);
          if (adding) members.add(itemId);
          else members.delete(itemId);
          next.set(spaceId, members);
          return next;
        });
        return;
      }

      spaceMembershipEpochRef.current += 1;
      show(adding);
      const write = (spaceWritesRef.current.get(spaceId) ?? Promise.resolve())
        .then(async () => {
          if (adding) await addSpaceItem(spaceId, itemId);
          else await removeSpaceItem(spaceId, itemId);
          // The open Space lists its own members, so its grid has to re-read.
          if (activeSpaceId === spaceId) reload();
        })
        .catch(() => {
          // A failed write must not leave the chip claiming a membership the
          // library does not have.
          show(wasMember);
          setSidebarActionError(
            adding
              ? "Couldn’t add this item to the Space."
              : "Couldn’t remove this item from the Space.",
          );
        })
        .finally(() => {
          if (spaceWritesRef.current.get(spaceId) === write) spaceWritesRef.current.delete(spaceId);
        });
      spaceWritesRef.current.set(spaceId, write);
      await write;
    },
    [activeSpaceId, canUseDesktopBackend, itemSpaceIds, reload, setSidebarActionError],
  );

  const [membershipItemId, setMembershipItemId] = useState(selectedItemId);
  if (membershipItemId !== selectedItemId) {
    setMembershipItemId(selectedItemId);
    if (!selectedItemId) setItemSpaceIds([]);
  }

  // Manual membership for the open overlay, read only while an item is open so
  // the grid load stays a single query.
  useEffect(() => {
    const itemId = selectedItemId;
    if (!itemId || shouldUseSeedLibrary()) return;
    let cancelled = false;
    const issuedAt = spaceMembershipEpochRef.current;
    // A read superseded by a chip toggle reports nothing, success or failure: the
    // toggle's own write is authoritative and reports its own errors.
    const superseded = () => cancelled || issuedAt !== spaceMembershipEpochRef.current;
    listItemSpaces(itemId)
      .then((ids) => {
        if (superseded()) return;
        setItemSpaceIds(ids);
      })
      .catch((error: unknown) => {
        if (superseded()) return;
        setCaptureError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedItemId, setCaptureError]);

  // The Regular Spaces an item can be filed into, and whether it already is.
  // Smart Spaces are excluded: their contents come from the query, so a chip
  // for them would be a claim that goes stale on its own.
  const manualSpaces = useMemo(() => spaces.filter((space) => space.kind === "regular"), [spaces]);
  const selectedItemSpaces = useMemo(
    () => manualSpaces.map((space) => ({ ...space, member: itemSpaceIds.includes(space.id) })),
    [itemSpaceIds, manualSpaces],
  );

  function forgetSpace(spaceId: string) {
    setLocalSpaceItems((current) => {
      const next = new Map(current);
      next.delete(spaceId);
      return next;
    });
    setItemSpaceIds((current) => current.filter((id) => id !== spaceId));
  }

  return { localSpaceItems, selectedItemSpaces, toggleItemInSpace, forgetSpace };
}
