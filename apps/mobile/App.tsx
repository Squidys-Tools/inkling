import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Button,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import InklingNative, {
  type TailscaleStatus,
} from "./modules/inkling-native/src/InklingNativeModule";
import { colors } from "./src/colors";
import {
  desktopStatus,
  recentCards,
  searchCards,
  thumbnailUri,
  type PhoneCard,
} from "./src/desktop";
import { embedQuery, modelInstalled } from "./src/embedQuery";
import { readOutbox, sendOutbox, type OutboxEntry } from "./src/outbox";
import { forgetPairing, loadPairing, savePairing, type Pairing } from "./src/pairing";

const nodeName = "inkling-iphone-sim";
const settleDelay = 5000;

const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
};

const fetchCards = (pairing: Pairing, text: string) =>
  text.trim() ? searchCards(pairing, text) : recentCards(pairing);

const cardTitle = (card: PhoneCard) =>
  card.title ??
  (card.sourceUrl ? hostname(card.sourceUrl) : (card.description?.split("\n")[0] ?? "Note"));

function Thumbnail({ pairing, card }: { pairing: Pairing; card: PhoneCard }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!card.hasThumbnail) return;
    let live = true;
    thumbnailUri(pairing, card.id).then(
      (next) => live && setUri(next),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [pairing, card.id, card.hasThumbnail]);
  if (uri) return <Image source={{ uri }} style={styles.thumbnail} />;
  return (
    <View style={[styles.thumbnail, styles.placeholder]}>
      <Text style={styles.tileText} numberOfLines={5}>
        {card.kind === "note" || card.kind === "quote"
          ? card.description
          : card.sourceUrl
            ? hostname(card.sourceUrl)
            : "Processing…"}
      </Text>
    </View>
  );
}

function PairingForm({ onPaired }: { onPaired: (pairing: Pairing) => void }) {
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const pair = async () => {
    const pairing = { address: address.trim(), token: token.trim() };
    try {
      await desktopStatus(pairing);
      await savePairing(pairing);
      onPaired(pairing);
    } catch (reason) {
      setError(`Couldn't reach that desktop: ${String(reason)}`);
    }
  };
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Pair with your desktop</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="100.x.y.z:47620"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="none"
        autoComplete="off"
      />
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="phone token"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="none"
        autoComplete="off"
      />
      <Button title="Pair" onPress={pair} />
      {error ? <Text style={styles.muted}>{error}</Text> : null}
    </View>
  );
}

export default function App() {
  const [tailscale, setTailscale] = useState<TailscaleStatus>({ state: "Starting" });
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<PhoneCard[]>([]);
  const [pending, setPending] = useState<OutboxEntry[]>(readOutbox);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<PhoneCard | null>(null);
  const [settings, setSettings] = useState(false);
  const [modelCheck, setModelCheck] = useState("");

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
      let upload = "";
      try {
        const { sent, refused } = await sendOutbox(pairing);
        upload = [
          sent ? `Sent ${sent} saved item${sent === 1 ? "" : "s"} to desktop` : "",
          refused ? `Desktop couldn't save ${refused}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        // Desktop fills in titles and thumbnails in background jobs after the save.
        if (sent) setTimeout(() => fetchCards(pairing, text).then(setCards, () => {}), settleDelay);
      } catch {
        upload = "Saves are waiting for desktop";
      }
      setPending(readOutbox());
      try {
        setCards(await fetchCards(pairing, text));
        setStatus(upload);
      } catch (reason) {
        setStatus(`Desktop not reachable: ${String(reason)}`);
      }
    },
    [pairing, online],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh(query);
    });
    return () => subscription.remove();
  }, [refresh, query]);

  useEffect(() => {
    if (!pairing || !online) return;
    const timer = setTimeout(() => refresh(""), 0);
    return () => clearTimeout(timer);
  }, [pairing, online, refresh]);

  const queued = pending.map((entry) => ({ entry, key: `pending-${entry.id}` }));
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        {/* oxlint-disable-next-line react/style-prop-object -- expo-status-bar takes the style as a string */}
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.title}>inkling</Text>
          <Pressable onPress={() => setSettings(true)}>
            <Text style={styles.link}>Settings</Text>
          </Pressable>
        </View>
        {tailscale.authURL ? (
          <Pressable onPress={() => Linking.openURL(tailscale.authURL!)}>
            <Text style={styles.link}>Sign in to Tailscale</Text>
          </Pressable>
        ) : null}
        {pairing === null ? <PairingForm onPaired={setPairing} /> : null}
        {pairing ? (
          <>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => refresh(query)}
              placeholder="Search your library"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              returnKeyType="search"
            />
            <Text style={styles.muted}>{online ? status : "Connecting to your tailnet…"}</Text>
            <FlatList
              data={[...queued, ...cards.map((card) => ({ card, key: card.id }))]}
              keyExtractor={(row) => row.key}
              numColumns={3}
              refreshing={false}
              onRefresh={() => refresh(query)}
              initialNumToRender={18}
              windowSize={5}
              renderItem={({ item: row }) =>
                "entry" in row ? (
                  <View style={styles.card}>
                    <View style={[styles.thumbnail, styles.placeholder]}>
                      <Text style={styles.tileText} numberOfLines={5}>
                        {row.entry.kind === "url" ? hostname(row.entry.text) : row.entry.text}
                      </Text>
                    </View>
                    <Text style={styles.muted}>Waiting for desktop</Text>
                  </View>
                ) : (
                  <Pressable style={styles.card} onPress={() => setOpen(row.card)}>
                    <Thumbnail pairing={pairing} card={row.card} />
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {cardTitle(row.card)}
                    </Text>
                  </Pressable>
                )
              }
            />
          </>
        ) : null}
        <Modal visible={open !== null} animationType="slide" onRequestClose={() => setOpen(null)}>
          {open && pairing ? (
            <SafeAreaView style={styles.screen}>
              <View style={styles.content}>
                <Button title="Close" onPress={() => setOpen(null)} />
                <Thumbnail pairing={pairing} card={open} />
                <Text style={styles.title}>{cardTitle(open)}</Text>
                {open.description ? <Text style={styles.body}>{open.description}</Text> : null}
                {open.sourceUrl ? (
                  <Pressable onPress={() => Linking.openURL(open.sourceUrl!)}>
                    <Text style={styles.link}>{open.sourceUrl}</Text>
                  </Pressable>
                ) : null}
              </View>
            </SafeAreaView>
          ) : null}
        </Modal>
        <Modal visible={settings} animationType="slide" onRequestClose={() => setSettings(false)}>
          <SafeAreaView style={styles.screen}>
            <View style={styles.content}>
              <Button title="Done" onPress={() => setSettings(false)} />
              <Text style={styles.heading}>Tailscale</Text>
              <Text
                style={styles.body}
              >{`${tailscale.state} ${(tailscale.ips ?? []).join(", ")}`}</Text>
              <Text style={styles.heading}>Desktop</Text>
              <Text style={styles.body}>{pairing?.address ?? "Not paired"}</Text>
              {pairing ? (
                <Button
                  title="Forget this desktop"
                  onPress={() => forgetPairing().then(() => setPairing(null))}
                />
              ) : null}
              <Text style={styles.heading}>On-device search model</Text>
              <Button
                title="Check"
                onPress={async () => {
                  if (!modelInstalled()) return setModelCheck("Not installed");
                  const started = Date.now();
                  const vector = await embedQuery("sunset over the ocean");
                  setModelCheck(`${vector.length} dimensions in ${Date.now() - started} ms`);
                }}
              />
              <Text style={styles.body}>{modelCheck}</Text>
            </View>
          </SafeAreaView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  // SafeAreaView ignores padding on iOS, so the inset lives on an inner view.
  content: { flex: 1, padding: 12 },
  // Dev builds float Expo's tools button over the top right corner.
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingRight: __DEV__ ? 64 : 0,
  },
  title: { color: colors.title, fontSize: 22, fontWeight: "600", marginVertical: 8 },
  heading: { color: colors.accent, fontSize: 15, fontWeight: "600", marginTop: 16 },
  body: { color: colors.text, fontSize: 14, marginVertical: 4 },
  muted: { color: colors.muted, fontSize: 12, marginVertical: 4 },
  link: { color: colors.accent, fontSize: 14 },
  section: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginVertical: 8 },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.text,
    padding: 10,
    marginVertical: 6,
  },
  card: { flex: 1 / 3, padding: 4 },
  thumbnail: { width: "100%", aspectRatio: 1, borderRadius: 8 },
  placeholder: {
    backgroundColor: colors.placeholderSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: { color: colors.text, fontSize: 12, padding: 8, textAlign: "center" },
  cardTitle: { color: colors.text, fontSize: 12, marginTop: 4 },
});
