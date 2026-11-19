import * as Haptics from "expo-haptics";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import InklingNative, {
  type TailscaleStatus,
} from "../modules/inkling-native/src/InklingNativeModule";
import {
  DesktopError,
  desktopStatus,
  listSpaces,
  recentCards,
  searchCards,
  type PhoneCard,
  type Scope,
  type Space,
} from "./desktop";
import { readOutbox, sendOutbox, type OutboxEntry } from "./outbox";
import { forgetPairing, loadPairing, savePairing, type Pairing } from "./pairing";
import type { Connection } from "./ui/StatusPill";

const nodeName = "inkling-iphone-sim";
const settleDelay = 5000;

const fetchCards = (pairing: Pairing, text: string, scope: Scope) =>
  text.trim() ? searchCards(pairing, text) : recentCards(pairing, scope);

const success = () =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

function useLibraryState() {
  const [tailscale, setTailscale] = useState<TailscaleStatus>({ state: "Starting" });
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined);
  const [reached, setReached] = useState<Connection | null>(null);
  const [cards, setCards] = useState<PhoneCard[]>([]);
  const [shownQuery, setShownQuery] = useState("");
  const [pending, setPending] = useState<OutboxEntry[]>(readOutbox);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>({ kind: "everything" });
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const queryRef = useRef(query);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    loadPairing().then(setPairing, () => setPairing(null));
    InklingNative.startTailscale(nodeName).catch(() => {});
    const timer = setInterval(() => {
      InklingNative.tailscaleStatus().then(setTailscale, () => {});
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const online = tailscale.state === "Running";
  const refresh = useCallback(
    async (text: string) => {
      if (!pairing || !online) return;
      let sentNotice = "";
      try {
        const { sent, refused } = await sendOutbox(pairing);
        sentNotice = [
          sent ? `Sent ${sent} saved item${sent === 1 ? "" : "s"} to desktop` : "",
          refused ? `Desktop couldn't save ${refused}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        if (sent) {
          success();
          // Desktop fills in titles and thumbnails in background jobs after the save.
          setTimeout(() => fetchCards(pairing, text, scope).then(setCards, () => {}), settleDelay);
        }
      } catch {}
      setPending(readOutbox());
      try {
        setCards(await fetchCards(pairing, text, scope));
        listSpaces(pairing).then(setSpaces, () => {});
        desktopStatus(pairing).then(
          (status) => setTotal(status.items),
          () => {},
        );
        setShownQuery(text);
        setReached("connected");
        setNotice(sentNotice);
      } catch (error) {
        setReached(error instanceof DesktopError && error.status === 401 ? "repair" : "offline");
      }
    },
    [pairing, online, scope],
  );

  const pair = useCallback(async (next: Pairing) => {
    await desktopStatus(next);
    await savePairing(next);
    setReached(null);
    setPairing(next);
    success();
  }, []);

  const forget = useCallback(async () => {
    await forgetPairing();
    setPairing(null);
    setCards([]);
    setReached(null);
  }, []);

  useEffect(() => {
    if (!pairing || !online) return;
    const timer = setTimeout(() => refresh(queryRef.current), 0);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh(queryRef.current);
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [pairing, online, refresh]);

  const connection: Connection = online ? (reached ?? "connecting") : "connecting";
  return {
    tailscale,
    pairing,
    connection,
    cards,
    shownQuery,
    pending,
    notice,
    query,
    setQuery,
    scope,
    setScope,
    spaces,
    total,
    refresh,
    pair,
    forget,
  };
}

const LibraryContext = createContext<ReturnType<typeof useLibraryState> | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  return <LibraryContext.Provider value={useLibraryState()}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const library = useContext(LibraryContext);
  if (!library) throw new Error("useLibrary needs a LibraryProvider");
  return library;
}
