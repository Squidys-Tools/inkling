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
  return uri ? (
    <Image source={{ uri }} style={styles.thumbnail} />
  ) : (
    <View style={[styles.thumbnail, styles.placeholder]}>
      <Text style={styles.kind}>{card.kind}</Text>
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
      />
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="phone token"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        secureTextEntry
        textContentType="oneTimeCode"
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
      try {
        const sent = await sendOutbox(pairing);
        setPending(readOutbox());
        const found = text.trim() ? await searchCards(pairing, text) : await recentCards(pairing);
        setCards(found);
        setStatus(sent ? `Sent ${sent} saved item${sent === 1 ? "" : "s"} to desktop` : "");
      } catch (reason) {
        setPending(readOutbox());
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
            initialNumToRender={18}
            windowSize={5}
            renderItem={({ item: row }) =>
              "entry" in row ? (
                <View style={styles.card}>
                  <View style={[styles.thumbnail, styles.placeholder]}>
                    <Text style={styles.kind}>{row.entry.kind}</Text>
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {row.entry.kind === "image" ? "Image" : row.entry.text}
                  </Text>
                  <Text style={styles.muted}>Waiting for desktop</Text>
                </View>
              ) : (
                <Pressable style={styles.card} onPress={() => setOpen(row.card)}>
                  <Thumbnail pairing={pairing} card={row.card} />
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {row.card.title ?? row.card.sourceUrl ?? row.card.kind}
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
            <Button title="Close" onPress={() => setOpen(null)} />
            <Thumbnail pairing={pairing} card={open} />
            <Text style={styles.title}>{open.title ?? open.kind}</Text>
            {open.description ? <Text style={styles.body}>{open.description}</Text> : null}
            {open.sourceUrl ? (
              <Pressable onPress={() => Linking.openURL(open.sourceUrl!)}>
                <Text style={styles.link}>{open.sourceUrl}</Text>
              </Pressable>
            ) : null}
          </SafeAreaView>
        ) : null}
      </Modal>
      <Modal visible={settings} animationType="slide" onRequestClose={() => setSettings(false)}>
        <SafeAreaView style={styles.screen}>
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
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
  kind: { color: colors.muted, fontSize: 12 },
  cardTitle: { color: colors.text, fontSize: 12, marginTop: 4 },
});
