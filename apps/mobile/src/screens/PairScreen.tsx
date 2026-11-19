import { useState } from "react";
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "../colors";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";

export function PairScreen({ navigation }: ScreenProps<"Pair">) {
  const library = useLibrary();
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pair = async () => {
    setBusy(true);
    setError("");
    try {
      await library.pair({ address: address.trim(), token: token.trim() });
      navigation.goBack();
    } catch {
      setError("Couldn't reach a desktop with that address and token. Check both and try again.");
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
        Open the pairing link your desktop shows, or enter its tailnet address and the token from
        its phone_token file.
      </Text>
      <View style={styles.group}>
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
        disabled={busy || !address || !token}
        onPress={pair}
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
