import { useState } from "react";
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAppearance, useThemedStyles } from "../appearance";
import type { Palette } from "../colors";
import type { Pairing } from "../pairing";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";

export function PairScreen({ navigation, route }: ScreenProps<"Pair">) {
  const link = route.params?.link;
  // A link opened while the sheet is up remounts the form with its fields.
  return (
    <PairForm
      key={link ? `${link.address} ${link.token}` : "manual"}
      link={link}
      onPaired={() => navigation.goBack()}
    />
  );
}

function PairForm({ link, onPaired }: { link?: Pairing; onPaired: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useAppearance();
  const library = useLibrary();
  const [address, setAddress] = useState(link?.address ?? "");
  const [token, setToken] = useState(link?.token ?? "");
  const online = library.tailscale.state === "Running";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pair = async () => {
    setBusy(true);
    setError("");
    try {
      await library.pair({ address: address.trim(), token: token.trim() });
      onPaired();
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
        {link
          ? `Pair with the desktop at ${link.address}? Saves from this phone will go to it.`
          : "Open the pairing link your desktop shows, or enter its tailnet address and the token from its phone_token file."}
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
        color={colors.accent}
        title={online ? (busy ? "Pairing…" : "Pair") : "Waiting for Tailscale…"}
        disabled={!online || busy || !address || !token}
        onPress={pair}
      />
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
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
