import { useState } from "react";
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../colors";
import { isPairing, type Pairing } from "../pairing-link";
import type { ScreenProps } from "../routes";
import { pair } from "../state/actions";
import { useRegistry } from "../state/hooks";

export function PairScreen({ navigation, route }: ScreenProps<"Pair">) {
  const link = route.params?.link;
  // A link opened while the sheet is up remounts the form with its fields.
  return (
    <PairForm
      key={link ? `${link.url} ${link.token}` : "manual"}
      link={link}
      onPaired={() => navigation.goBack()}
    />
  );
}

function PairForm({ link, onPaired }: { link?: Pairing; onPaired: () => void }) {
  const registry = useRegistry();
  const [url, setUrl] = useState(link?.url ?? "");
  const [token, setToken] = useState(link?.token ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = { url: url.trim(), token: token.trim() };
  const submit = async () => {
    if (!isPairing(next))
      return setError("The address starts with https:// and ends with the port, such as :8443.");
    setBusy(true);
    setError("");
    try {
      await pair(registry, next);
      onPaired();
    } catch {
      setError(
        "Couldn't reach a desktop with that address and token. Check both, and that Tailscale is on.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.detail}>
        {link
          ? `Pair with the desktop at ${link.url}? Saves from this phone will go to it.`
          : "Open the pairing link your desktop shows, or enter its Tailscale address and the token from its phone_token file."}
      </Text>
      <View style={styles.group}>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://your-mac.tailnet.ts.net:8443"
          keyboardType="url"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="none"
          autoComplete="off"
        />
        <TextInput
          style={[styles.input, styles.last]}
          value={token}
          onChangeText={setToken}
          placeholder="Token"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="none"
          autoComplete="off"
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        title={busy ? "Pairing…" : "Pair"}
        disabled={busy || !url || !token}
        onPress={submit}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { padding: 16, gap: 14 },
  detail: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  group: { backgroundColor: colors.surface, borderRadius: 14, overflow: "hidden" },
  input: {
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  last: { borderBottomWidth: 0 },
  error: { color: colors.danger, fontSize: 13 },
});
