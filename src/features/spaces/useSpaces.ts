import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addSpaceItem,
  createSpace,
  deleteSpace,
  listItemSpaces,
  listSpaces,
  removeSpaceItem,
  type SmartSpaceQuery,
  type SpaceColor,
  type SpaceKind,
  type StoredSpace,
  swapSpacePositions,
  updateSpace,
} from "../../lib/libraryApi";
import { shouldUseSeedLibrary } from "../../lib/previewMode";
import type { LibraryItem } from "../../lib/types";
import { seedSpaceItems, seedSpaces } from "../library/seed";

const SPACE_COLORS: SpaceColor[] = ["blue", "orange", "green", "pink", "purple", "yellow"];

type SpacesOptions = {
  canUseDesktopBackend: boolean;
  query: string;
  activeSpaceId: string | null;
  selectedItemId: string | null;
  reload: () => void;
  selectSpace: (space: StoredSpace) => void;
  clearToDefaultView: () => void;
  setActiveView: Dispatch<SetStateAction<string>>;
  setCaptureError: Dispatch<SetStateAction<string | null>>;
};

export function useSpaces({
  canUseDesktopBackend,
  query,
  activeSpaceId,
  selectedItemId,
  reload,
  selectSpace,
  clearToDefaultView,
  setActiveView,
  setCaptureError,
}: SpacesOptions) {
  const [spaces, setSpaces] = useState<StoredSpace[]>(shouldUseSeedLibrary() ? seedSpaces : []);
  const [localSpaceExclusions, setLocalSpaceExclusions] = useState<Map<string, Set<string>>>(
    () => new Map(),
  );
  // Preview keeps membership locally; desktop membership is persisted through IPC.
  const [localSpaceItems, setLocalSpaceItems] = useState<Map<string, Set<string>>>(
    () => new Map(Object.entries(seedSpaceItems).map(([spaceId, ids]) => [spaceId, new Set(ids)])),
  );
  const changeSpaceItem = useCallback(
    async (space: StoredSpace, itemId: string, restore: boolean) => {
      if (canUseDesktopBackend) {
        if (restore) await addSpaceItem(space.id, itemId);
        else await removeSpaceItem(space.id, itemId);
        setSpaces(await listSpaces());
        reload();
        return;
      }
      if (space.kind === "smart")
        setLocalSpaceExclusions((current) => {
          const next = new Map(current),
            excluded = new Set(next.get(space.id) ?? []);
          if (restore) excluded.delete(itemId);
          else excluded.add(itemId);
          next.set(space.id, excluded);
          return next;
        });
      else
        setLocalSpaceItems((current) => {
          const next = new Map(current),
            members = new Set(next.get(space.id) ?? []);
          if (restore) members.add(itemId);
          else members.delete(itemId);
          next.set(space.id, members);
          return next;
        });
    },
    [canUseDesktopBackend, reload],
  );
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceKind, setNewSpaceKind] = useState<SpaceKind>("smart");
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
  const [renamingSpaceId, setRenamingSpaceId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [sidebarActionError, setSidebarActionError] = useState<string | null>(null);
  const spaceRenameInputRef = useRef<HTMLInputElement>(null);
  const newSpaceNameInputRef = useRef<HTMLInputElement>(null);
  // Generation counter for space moves: only the latest move may apply its
  // backend result; older ones resync, so rapid clicks cannot overwrite newer state.
  const spaceMoveSeqRef = useRef(0);

  function beginSaveSearch() {
    setIsCreatingSpace(true);
    setNewSpaceKind("smart");
    setNewSpaceName(query.trim());
  }

  async function handleCreateSpace(event: React.FormEvent) {
    event.preventDefault();
    const name = newSpaceName.trim();
    if (!name) return;

    // A Regular Space is filled by hand, so the search behind the sidebar "+"
    // does not become its query.
    const spaceQuery: SmartSpaceQuery =
      newSpaceKind === "smart" && query.trim() ? { text: query.trim() } : {};
    const color = SPACE_COLORS[spaces.length % SPACE_COLORS.length];
    try {
      const created = canUseDesktopBackend
        ? await createSpace({ name, color, query: spaceQuery, kind: newSpaceKind })
        : {
            id: `local-space-${Date.now()}`,
            name,
            color,
            query: spaceQuery,
            kind: newSpaceKind,
            position: spaces.length + 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
      setSpaces((current) => [...current, created]);
      setIsCreatingSpace(false);
      setNewSpaceName("");
      setNewSpaceKind("smart");
      selectSpace(created);
    } catch {
      setSidebarActionError("Couldn’t create this Space.");
    }
  }

  // Must stay a stable callback: the overlay actions memo closes over it, and a
  // stale membership read would turn "Remove from" into a second add. Writes per
  // Space are chained so a second click reverses the first instead of racing it.
  const spaceWritesRef = useRef<Map<string, Promise<void>>>(new Map());
  // Bumped by every chip toggle. A membership read already in flight carries the
  // value it saw here and drops its result if a toggle has landed since, so an
  // older read cannot roll back the chip the user just changed.
  const spaceMembershipEpochRef = useRef(0);
  const handleToggleItemInSpace = useCallback(
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
    [activeSpaceId, canUseDesktopBackend, itemSpaceIds, reload],
  );

  async function handleDeleteSpace(space: StoredSpace) {
    try {
      if (canUseDesktopBackend) await deleteSpace(space.id);
      setSpaces((current) => current.filter((candidate) => candidate.id !== space.id));
      setLocalSpaceItems((current) => {
        const next = new Map(current);
        next.delete(space.id);
        return next;
      });
      setItemSpaceIds((current) => current.filter((id) => id !== space.id));
      if (activeSpaceId === space.id) clearToDefaultView();
    } catch {
      setSidebarActionError("Couldn’t delete this Space.");
    }
  }

  async function handleRenameSpace(space: StoredSpace, name: string) {
    const trimmed = name.trim().slice(0, 80);
    setRenamingSpaceId(null);
    if (!trimmed || trimmed === space.name) return;
    try {
      const updated = canUseDesktopBackend
        ? await updateSpace({ id: space.id, name: trimmed })
        : { ...space, name: trimmed, updatedAt: Date.now() };
      setSpaces((current) =>
        current.map((candidate) => (candidate.id === space.id ? updated : candidate)),
      );
      if (activeSpaceId === space.id) setActiveView(updated.name);
    } catch {
      // Reopen the rename input with the draft preserved: the name visibly
      // didn't stick, so the user can retry or Escape instead of wondering.
      setRenamingSpaceId(space.id);
      setRenameDraft(trimmed);
      setSidebarActionError("Couldn’t rename this Space.");
    }
  }

  async function handleCycleSpaceColor(space: StoredSpace) {
    const next = SPACE_COLORS[(SPACE_COLORS.indexOf(space.color) + 1) % SPACE_COLORS.length];
    if (next === space.color) return;
    try {
      const updated = canUseDesktopBackend
        ? await updateSpace({ id: space.id, color: next })
        : { ...space, color: next, updatedAt: Date.now() };
      setSpaces((current) =>
        current.map((candidate) => (candidate.id === space.id ? updated : candidate)),
      );
    } catch {
      setSidebarActionError("Couldn’t change this Space’s color.");
    }
  }

  async function handleMoveSpace(space: StoredSpace, direction: -1 | 1) {
    const ordered = [...spaces].sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((candidate) => candidate.id === space.id);
    const other = ordered[index + direction];
    if (index < 0 || !other) return;
    // Optimistic swap so rapid clicks chain off fresh rendered state instead
    // of recomputing the same neighbor pair from a stale render.
    const locallySwapped = ordered
      .map((candidate) =>
        candidate.id === space.id
          ? { ...candidate, position: other.position }
          : candidate.id === other.id
            ? { ...candidate, position: space.position }
            : candidate,
      )
      .sort((a, b) => a.position - b.position);
    if (canUseDesktopBackend) {
      const seq = ++spaceMoveSeqRef.current;
      setSpaces(locallySwapped);
      try {
        const confirmed = await swapSpacePositions(space.id, other.id);
        if (spaceMoveSeqRef.current === seq) {
          setSpaces(confirmed);
        } else {
          setSpaces(await listSpaces());
        }
      } catch {
        let resynced = true;
        try {
          setSpaces(await listSpaces());
        } catch {
          // Keep the optimistic view, but say so: the sidebar may not match
          // the backend until the window reloads.
          resynced = false;
        }
        setSidebarActionError(
          resynced
            ? "Couldn’t move this Space."
            : "Couldn’t confirm the Space order. Reload the window to check it.",
        );
      }
      return;
    }
    // Seed path: derive the swap from fresh state inside the updater so a
    // concurrent space operation cannot leave stale positions behind.
    setSpaces((current) => {
      const fresh = [...current].sort((a, b) => a.position - b.position);
      const at = fresh.findIndex((candidate) => candidate.id === space.id);
      const neighbor = fresh[at + direction];
      if (at < 0 || !neighbor) return current;
      const freshPosition = fresh[at].position;
      return fresh
        .map((candidate) =>
          candidate.id === space.id
            ? { ...candidate, position: neighbor.position }
            : candidate.id === neighbor.id
              ? { ...candidate, position: freshPosition }
              : candidate,
        )
        .sort((a, b) => a.position - b.position);
    });
  }

  useLayoutEffect(() => {
    if (renamingSpaceId !== null) spaceRenameInputRef.current?.focus();
  }, [renamingSpaceId]);
  useLayoutEffect(() => {
    if (isCreatingSpace) newSpaceNameInputRef.current?.focus();
  }, [isCreatingSpace]);

  useEffect(() => {
    if (shouldUseSeedLibrary()) return;
    let cancelled = false;
    listSpaces()
      .then((storedSpaces) => {
        if (!cancelled) setSpaces(storedSpaces);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCaptureError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [setCaptureError]);

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
        setCaptureError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedItemId, setCaptureError]);

  const activeSpace = useMemo(
    () => spaces.find((space) => space.id === activeSpaceId) ?? null,
    [spaces, activeSpaceId],
  );

  // The Regular Spaces an item can be filed into, and whether it already is.
  // Smart Spaces are excluded: their contents come from the query, so a chip
  // for them would be a claim that goes stale on its own.
  const manualSpaces = useMemo(() => spaces.filter((space) => space.kind === "regular"), [spaces]);
  const selectedItemSpaces = useMemo(
    () => manualSpaces.map((space) => ({ ...space, member: itemSpaceIds.includes(space.id) })),
    [itemSpaceIds, manualSpaces],
  );

  return {
    spaces,
    setSpaces,
    activeSpace,
    selectedItemSpaces,
    localSpaceItems,
    localSpaceExclusions,
    changeSpaceItem,
    recordLocalSpaceCapture: (spaceId: string, itemId: string) =>
      setLocalSpaceItems((current) => {
        const next = new Map(current);
        next.set(spaceId, new Set([...(next.get(spaceId) ?? []), itemId]));
        return next;
      }),
    isCreatingSpace,
    setIsCreatingSpace,
    newSpaceName,
    setNewSpaceName,
    newSpaceKind,
    setNewSpaceKind,
    newSpaceNameInputRef,
    renamingSpaceId,
    setRenamingSpaceId,
    renameDraft,
    setRenameDraft,
    spaceRenameInputRef,
    sidebarActionError,
    setSidebarActionError,
    beginSaveSearch,
    handleCreateSpace,
    handleToggleItemInSpace,
    handleDeleteSpace,
    handleRenameSpace,
    handleCycleSpaceColor,
    handleMoveSpace,
  };
}
