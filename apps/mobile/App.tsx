import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { AppState, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { File, Paths } from "expo-file-system";
import InklingNative, { type TailscaleStatus } from "./modules/inkling-native/src/InklingNativeModule";
import { embedQuery, modelInstalled } from "./src/embedQuery";
import { readOutbox, type OutboxEntry } from "./src/outbox";

const PARITY_QUERIES = ["sunset over the ocean", "recipe for sourdough bread", "how does TLS work"];

export default function App() {
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [tailscale, setTailscale] = useState<TailscaleStatus>({ state: "Stopped" });
  const [query, setQuery] = useState(PARITY_QUERIES[0]);
  const [embedding, setEmbedding] = useState("");
  const [peerUrl, setPeerUrl] = useState("");
  const [peerReply, setPeerReply] = useState("");

  const refreshOutbox = useCallback(() => setOutbox(readOutbox()), []);
  useEffect(() => {
    refreshOutbox();
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
      setEmbedding(`${elapsed} ms, dims ${vector.length}: [${Array.from(vector.slice(0, 4)).map((v) => v.toFixed(4)).join(", ")}]`);
    } catch (error) {
      setEmbedding(`error: ${String(error)}`);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
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
        {tailscale.authURL ? <Text style={styles.mono} selectable>login: {tailscale.authURL}</Text> : null}
        {tailscale.ips?.length ? <Text style={styles.mono}>ips: {tailscale.ips.join(", ")}</Text> : null}
        {tailscale.error ? <Text style={styles.mono}>error: {tailscale.error}</Text> : null}
        <Button title="Start node" onPress={() => InklingNative.startTailscale("inkling-iphone-sim")} />
        <TextInput style={styles.input} value={peerUrl} onChangeText={setPeerUrl} autoCapitalize="none" />
        <Button
          title="Fetch from desktop"
          onPress={() =>
            InklingNative.tailnetGet(peerUrl, "/").then(setPeerReply, (error) => setPeerReply(`error: ${String(error)}`))
          }
        />
        {peerReply ? <Text style={styles.mono} selectable>{peerReply}</Text> : null}
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
  root: { flex: 1, backgroundColor: "#0a0a09" },
  content: { padding: 20, paddingTop: 70, gap: 16 },
  title: { color: "#f0e9df", fontSize: 24, fontWeight: "600" },
  section: { backgroundColor: "#161412", borderRadius: 12, padding: 14, gap: 8 },
  heading: { color: "#c27f5b", fontSize: 15, fontWeight: "600" },
  body: { color: "#e5ddd2", fontSize: 14 },
  mono: { color: "#c9c1b6", fontSize: 12, fontFamily: "Menlo" },
  input: { color: "#e5ddd2", borderColor: "#3a3531", borderWidth: 1, borderRadius: 8, padding: 8 },
});
