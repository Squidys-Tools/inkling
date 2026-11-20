import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Button,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { File, Paths } from "expo-file-system";
import InklingNative, {
  type TailscaleStatus,
} from "./modules/inkling-native/src/InklingNativeModule";
import { embedQuery, modelInstalled } from "./src/embedQuery";
import { colors } from "./src/colors";
import { readOutbox, type OutboxEntry } from "./src/outbox";

type PhoneCard = {
  id: string;
  kind: string;
  title: string | null;
  sourceUrl: string | null;
  hasThumbnail: boolean;
};

const PARITY_QUERIES = ["sunset over the ocean", "recipe for sourdough bread", "how does TLS work"];

export default function App() {
  const [outbox, setOutbox] = useState<OutboxEntry[]>(readOutbox);
  const [tailscale, setTailscale] = useState<TailscaleStatus>({ state: "Stopped" });
  const [query, setQuery] = useState(PARITY_QUERIES[0]);
  const [embedding, setEmbedding] = useState("");
  const [desktop, setDesktop] = useState("");
  const [token, setToken] = useState("");
  const [search, setSearch] = useState("");
  const [libraryStatus, setLibraryStatus] = useState("");
  const [cards, setCards] = useState<PhoneCard[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const desktopGet = async (path: string) => {
    const response = await InklingNative.tailnetGet(desktop.trim(), path, token.trim());
    if (response.status !== 200)
      throw new Error(`HTTP ${response.status} ${response.text.slice(0, 120)}`);
    return response;
  };
  const loadCards = async (path: string) => {
    try {
      const status = JSON.parse((await desktopGet("/v1/status")).text);
      const page: { cards: PhoneCard[] } = JSON.parse((await desktopGet(path)).text);
      setLibraryStatus(`${status.device}: ${status.items} items, showing ${page.cards.length}`);
      setCards(page.cards);
      const loaded: Record<string, string> = {};
      for (const card of page.cards.slice(0, 12)) {
        if (card.hasThumbnail)
          loaded[card.id] =
            `data:image/webp;base64,${(await desktopGet(`/v1/thumbnails/${card.id}`)).base64}`;
      }
      setThumbnails(loaded);
    } catch (error) {
      setLibraryStatus(`error: ${String(error)}`);
    }
  };

  const refreshOutbox = useCallback(() => setOutbox(readOutbox()), []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshOutbox();
    });
    return () => subscription.remove();
  }, [refreshOutbox]);

  useEffect(() => {
    const timer = setInterval(() => {
      InklingNative.tailscaleStatus().then(setTailscale, (error) =>
        setTailscale({ state: "Error", error: String(error) }),
      );
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const runEmbedding = async () => {
    if (!modelInstalled()) return setEmbedding("model not installed in Documents/models");
    try {
      const started = Date.now();
      const vector = await embedQuery(query);
      const elapsed = Date.now() - started;
      const parity: Record<string, number[]> = {};
      for (const text of PARITY_QUERIES) parity[text] = Array.from(await embedQuery(text));
      new File(Paths.document, "phone-vectors.json").write(JSON.stringify(parity));
      setEmbedding(
        `${elapsed} ms, dims ${vector.length}: [${Array.from(vector.slice(0, 4))
          .map((v) => v.toFixed(4))
          .join(", ")}]`,
      );
    } catch (error) {
      setEmbedding(`error: ${String(error)}`);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* oxlint-disable-next-line react/style-prop-object -- expo-status-bar takes the style as a string */}
      <StatusBar style="light" />
      <Text style={styles.title}>inkling native spike</Text>

      <Section title="Share Extension outbox">
        <Text style={styles.body}>{outbox.length} queued</Text>
        {outbox.map((entry) => (
          <Text key={entry.id} style={styles.mono} numberOfLines={2}>
            {entry.kind}: {entry.text}
            {entry.file ? ` (+${entry.file})` : ""}
          </Text>
        ))}
        <Button title="Refresh" onPress={refreshOutbox} />
      </Section>

      <Section title="Tailscale (embedded node)">
        <Text style={styles.body}>state: {tailscale.state}</Text>
        {tailscale.authURL ? (
          <Text style={styles.mono} selectable>
            login: {tailscale.authURL}
          </Text>
        ) : null}
        {tailscale.ips?.length ? (
          <Text style={styles.mono}>ips: {tailscale.ips.join(", ")}</Text>
        ) : null}
        {tailscale.error ? <Text style={styles.mono}>error: {tailscale.error}</Text> : null}
        <Button
          title="Start node"
          onPress={() => InklingNative.startTailscale("inkling-iphone-sim")}
        />
      </Section>

      <Section title="Desktop library">
        <TextInput
          style={styles.input}
          value={desktop}
          onChangeText={setDesktop}
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
        />
        <Button title="Load recent cards" onPress={() => loadCards("/v1/cards?limit=24")} />
        <TextInput
          style={styles.input}
          value={search}
          onChangeText={setSearch}
          placeholder="search"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
        />
        <Button
          title="Search desktop"
          onPress={() => loadCards(`/v1/search?q=${encodeURIComponent(search)}&limit=24`)}
        />
        {libraryStatus ? <Text style={styles.body}>{libraryStatus}</Text> : null}
        <View style={styles.grid}>
          {cards.map((card) => (
            <View key={card.id} style={styles.card}>
              {thumbnails[card.id] ? (
                <Image source={{ uri: thumbnails[card.id] }} style={styles.thumbnail} />
              ) : (
                <View style={styles.thumbnail} />
              )}
              <Text style={styles.mono} numberOfLines={2}>
                {card.title ?? card.sourceUrl ?? card.kind}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Nomic query embedding">
        <TextInput style={styles.input} value={query} onChangeText={setQuery} />
        <Button title="Embed" onPress={runEmbedding} />
        <Text style={styles.mono}>{embedding}</Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 70, gap: 16 },
  title: { color: colors.title, fontSize: 24, fontWeight: "600" },
  section: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 8 },
  heading: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  body: { color: colors.text, fontSize: 14 },
  mono: { color: colors.muted, fontSize: 12, fontFamily: "Menlo" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { width: "31%", gap: 4 },
  thumbnail: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 6,
    backgroundColor: colors.placeholderSurface,
  },
  input: {
    color: colors.text,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
});
