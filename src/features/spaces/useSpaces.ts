import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createSpace,
  deleteSpace,
  listSpaces,
  type SmartSpaceQuery,
  type SpaceColor,
  type SpaceKind,
  type StoredSpace,
  swapSpacePositions,
  updateSpace,
} from "../../lib/libraryApi";
import { shouldUseSeedLibrary } from "../../lib/previewMode";
import { seedSpaces } from "../library/seed";
import type { SpaceDraft } from "../shell/SpaceDraftForm";
import { errorMessage } from "../errorMessage";
import { useSpaceMembership } from "./useSpaceMembership";

const SPACE_COLORS: SpaceColor[] = ["blue", "orange", "green", "pink", "purple", "yellow"];

// Swaps a Space's position with its neighbor in display order, or returns null
// when it is already at that end.
function swapWithNeighbor(spaces: StoredSpace[], id: string, direction: -1 | 1) {
  const ordered = [...spaces].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((candidate) => candidate.id === id);
  const neighbor = ordered[index + direction];
  if (index < 0 || !neighbor) return null;
  const position = ordered[index].position;
  return {
    neighborId: neighbor.id,
    spaces: ordered
      .map((candidate) =>
        candidate.id === id
          ? { ...candidate, position: neighbor.position }
          : candidate.id === neighbor.id
            ? { ...candidate, position }
            : candidate,
      )
      .sort((a, b) => a.position - b.position),
  };
}

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
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceKind, setNewSpaceKind] = useState<SpaceKind>("smart");
  const [renamingSpaceId, setRenamingSpaceId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [sidebarActionError, setSidebarActionError] = useState<string | null>(null);
  const spaceRenameInputRef = useRef<HTMLInputElement>(null);
  const newSpaceNameInputRef = useRef<HTMLInputElement>(null);
  // Generation counter for space moves: only the latest move may apply its
  // backend result; older ones resync, so rapid clicks cannot overwrite newer state.
  const spaceMoveSeqRef = useRef(0);
  const membership = useSpaceMembership({
    canUseDesktopBackend,
    spaces,
    activeSpaceId,
    selectedItemId,
    reload,
    setCaptureError,
    setSidebarActionError,
  });

  function openSpaceDraft() {
    setIsCreatingSpace(true);
    setNewSpaceName("");
    setNewSpaceKind("smart");
  }

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

  async function handleDeleteSpace(space: StoredSpace) {
    try {
      if (canUseDesktopBackend) await deleteSpace(space.id);
      setSpaces((current) => current.filter((candidate) => candidate.id !== space.id));
      membership.forgetSpace(space.id);
      if (activeSpaceId === space.id) clearToDefaultView();
    } catch {
      setSidebarActionError("Couldn’t delete this Space.");
    }
  }

  async function saveSpace(space: StoredSpace, patch: { name: string } | { color: SpaceColor }) {
    const updated = canUseDesktopBackend
      ? await updateSpace({ id: space.id, ...patch })
      : { ...space, ...patch, updatedAt: Date.now() };
    setSpaces((current) =>
      current.map((candidate) => (candidate.id === space.id ? updated : candidate)),
    );
    return updated;
  }

  async function handleRenameSpace(space: StoredSpace, name: string) {
    const trimmed = name.trim().slice(0, 80);
    setRenamingSpaceId(null);
    if (!trimmed || trimmed === space.name) return;
    try {
      const updated = await saveSpace(space, { name: trimmed });
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
      await saveSpace(space, { color: next });
    } catch {
      setSidebarActionError("Couldn’t change this Space’s color.");
    }
  }

  async function handleMoveSpace(space: StoredSpace, direction: -1 | 1) {
    const swap = swapWithNeighbor(spaces, space.id, direction);
    if (!swap) return;
    if (canUseDesktopBackend) {
      // Optimistic swap so rapid clicks chain off fresh rendered state instead
      // of recomputing the same neighbor pair from a stale render.
      const seq = ++spaceMoveSeqRef.current;
      setSpaces(swap.spaces);
      try {
        const confirmed = await swapSpacePositions(space.id, swap.neighborId);
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
    setSpaces((current) => swapWithNeighbor(current, space.id, direction)?.spaces ?? current);
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
        if (!cancelled) setCaptureError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [setCaptureError]);

  const activeSpace = useMemo(
    () => spaces.find((space) => space.id === activeSpaceId) ?? null,
    [spaces, activeSpaceId],
  );

  const draft: SpaceDraft = {
    isOpen: isCreatingSpace,
    name: newSpaceName,
    kind: newSpaceKind,
    query,
    toggle: () => {
      setIsCreatingSpace((current) => !current);
      setNewSpaceName("");
      setNewSpaceKind("smart");
    },
    setName: setNewSpaceName,
    setKind: setNewSpaceKind,
    cancel: () => {
      setIsCreatingSpace(false);
      setNewSpaceName("");
    },
    submit: handleCreateSpace,
  };
  const renaming = {
    id: renamingSpaceId,
    draft: renameDraft,
    setDraft: setRenameDraft,
    inputRef: spaceRenameInputRef,
  };

  function startRename(space: StoredSpace) {
    setRenamingSpaceId(space.id);
    setRenameDraft(space.name);
  }

  return {
    spaces,
    setSpaces,
    activeSpace,
    selectedItemSpaces: membership.selectedItemSpaces,
    localSpaceItems: membership.localSpaceItems,
    draft,
    draftNameInputRef: newSpaceNameInputRef,
    openSpaceDraft,
    renaming,
    startRename,
    cancelRename: () => setRenamingSpaceId(null),
    sidebarActionError,
    setSidebarActionError,
    beginSaveSearch,
    handleToggleItemInSpace: membership.toggleItemInSpace,
    handleDeleteSpace,
    handleRenameSpace,
    handleCycleSpaceColor,
    handleMoveSpace,
  };
}
