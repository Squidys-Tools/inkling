import { useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { colors } from "../colors";
import { desktopName } from "../desktop";
import { embedQuery, modelInstalled } from "../embedQuery";
import { font } from "../fonts";
import { forget } from "../state/actions";
import { useRegistry } from "../state/hooks";
import { connectionAtom, pairingAtom } from "../state/library";
import { AppText } from "../ui/AppText";
import { EmptyState } from "../ui/EmptyState";
import { ListRow, ListSection } from "../ui/List";
import { StatusPill, tones } from "../ui/StatusPill";
import { SymbolButton } from "../ui/SymbolButton";

type SettingsRoutes = { Home: undefined; Desktop: undefined; Search: undefined };
type PageProps<Name extends keyof SettingsRoutes> = NativeStackScreenProps<SettingsRoutes, Name>;

const Settings = createNativeStackNavigator<SettingsRoutes>();

const Page = ({ children }: { children: React.ReactNode }) => (
  <ScrollView
    style={styles.page}
    contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={styles.content}
  >
    {children}
  </ScrollView>
);

function Home({ navigation }: PageProps<"Home">) {
  const pairing = useAtomValue(pairingAtom);
  const connection = useAtomValue(connectionAtom);
  return (
    <Page>
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <SymbolView name="desktopcomputer" tintColor={colors.title} size={22} />
        </View>
        <View style={styles.identityText}>
          <AppText variant="headline" style={styles.title}>
            {pairing ? "Paired desktop" : "No desktop yet"}
          </AppText>
          <AppText variant="caption" style={styles.mono}>
            {pairing ? desktopName(pairing) : "Pair to browse your library"}
          </AppText>
        </View>
        <StatusPill connection={connection} />
      </View>
      <ListSection title="Library">
        <ListRow
          icon="desktopcomputer"
          label="Desktop"
          navigates
          onPress={() => navigation.navigate("Desktop")}
        />
        {__DEV__ ? (
          <ListRow
            icon="sparkle.magnifyingglass"
            label="On-device search"
            navigates
            onPress={() => navigation.navigate("Search")}
          />
        ) : null}
      </ListSection>
    </Page>
  );
}

function Desktop({ navigation }: PageProps<"Desktop">) {
  const registry = useRegistry();
  const pairing = useAtomValue(pairingAtom);
  const connection = useAtomValue(connectionAtom);
  // The Pair sheet lives on the root stack, above this modal.
  const openPair = () => navigation.getParent()?.navigate("Pair");
  if (!pairing)
    return (
      <Page>
        <EmptyState
          title="No desktop paired yet"
          detail="Open the pairing link your desktop shows, or enter its address and token."
          actionLabel="Pair"
          onAction={openPair}
        />
      </Page>
    );
  const confirmForget = () =>
    Alert.alert(
      "Forget this desktop?",
      "Saves waiting on this phone stay here until you pair again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Forget",
          style: "destructive",
          onPress: () => void forget(registry).then(() => navigation.popToTop()),
        },
      ],
    );
  return (
    <Page>
      <ListSection
        title="This phone saves to"
        footer="Saves from this phone go to this desktop through Tailscale, and browsing and search read its library."
      >
        <ListRow
          leading={<View style={[styles.dot, { backgroundColor: tones[connection].color }]} />}
          label={desktopName(pairing)}
          description={tones[connection].label}
        />
      </ListSection>
      <ListSection>
        <ListRow icon="arrow.triangle.2.circlepath" label="Pair again" onPress={openPair} />
        <ListRow
          icon="xmark.circle"
          label="Forget this desktop"
          tone="danger"
          onPress={confirmForget}
        />
      </ListSection>
    </Page>
  );
}

/** A developer check that the bundled search model loads and embeds on this phone. */
function Search() {
  const [result, setResult] = useState("");
  const check = async () => {
    if (!modelInstalled()) return setResult("Not installed");
    const started = Date.now();
    const vector = await embedQuery("sunset over the ocean");
    setResult(`${vector.length} dims, ${Date.now() - started} ms`);
  };
  return (
    <Page>
      <ListSection footer={result || undefined}>
        <ListRow icon="checkmark.circle" label="Check the search model" onPress={check} />
      </ListSection>
    </Page>
  );
}

function CloseButton() {
  // This header belongs to the settings stack; closing dismisses the modal on the stack above it.
  const navigation = useNavigation();
  return (
    <SymbolButton name="xmark" label="Close" onPress={() => navigation.getParent()?.goBack()} />
  );
}

const closeButton = () => <CloseButton />;

/** Settings as its own stack in a modal, so each group is a real page with a native back. */
export function SettingsScreen() {
  return (
    <Settings.Navigator
      screenOptions={{
        headerTintColor: colors.accent,
        headerTitleStyle: { fontFamily: font.display, color: colors.title },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.surface },
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      <Settings.Screen
        name="Home"
        component={Home}
        options={{
          title: "Settings",
          headerLeft: closeButton,
        }}
      />
      <Settings.Screen name="Desktop" component={Desktop} />
      {__DEV__ ? (
        <Settings.Screen name="Search" component={Search} options={{ title: "On-device search" }} />
      ) : null}
    </Settings.Navigator>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.surface },
  content: { padding: 16, paddingBottom: 40, gap: 24 },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.raised,
    borderRadius: 24,
    borderCurve: "continuous",
    padding: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  identityText: { flex: 1, gap: 2 },
  title: { color: colors.title },
  mono: { color: colors.muted, fontFamily: font.mono },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
