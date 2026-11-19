import {
  createNavigationContainerRef,
  DarkTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { SearchBarCommands } from "react-native-screens";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "./src/colors";
import { font, fontFiles } from "./src/fonts";
import { parsePairingLink } from "./src/pairing-link";
import type { Routes } from "./src/routes";
import { ItemScreen } from "./src/screens/ItemScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { PairScreen } from "./src/screens/PairScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { LibraryProvider, useLibrary } from "./src/state";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LaunchOverlay } from "./src/ui/LaunchOverlay";

const Stack = createNativeStackNavigator<Routes>();
const navigation = createNavigationContainerRef<Routes>();

// A pairing link only fills in the Pair sheet: the user confirms the desktop before any save goes to it.
function openPairingLink(link: string | null | undefined) {
  const pairing = link ? parsePairingLink(link) : null;
  if (pairing && navigation.isReady()) navigation.navigate("Pair", { link: pairing });
}

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.background,
    text: colors.title,
    border: colors.border,
  },
};

function Screens() {
  const library = useLibrary();
  const { scope } = library;
  const searchBar = useRef<SearchBarCommands>(null);
  // A new collection replaces the search, so the bar's leftover text goes too.
  useEffect(() => {
    if (scope.kind) searchBar.current?.clearText();
  }, [scope]);
  const title =
    scope.kind === "archived"
      ? "Archive"
      : scope.kind === "space"
        ? scope.space.name
        : "Everything";
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.accent,
        headerTitleStyle: { fontFamily: font.display, fontSize: 16, color: colors.title },
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}
      />
      <Stack.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          title,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          headerSearchBarOptions: library.pairing
            ? {
                ref: searchBar,
                placeholder: "Search your library",
                autoCapitalize: "none",
                hideWhenScrolling: false,
                onChangeText: (event) => library.setQuery(event.nativeEvent.text),
                onSearchButtonPress: (event) => library.refresh(event.nativeEvent.text),
                onCancelButtonPress: () => {
                  library.setQuery("");
                  library.refresh("");
                },
              }
            : undefined,
        }}
      />
      <Stack.Screen name="Item" component={ItemScreen} options={{ title: "" }} />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          // A full page over the library, closed with its own button, like Claude's settings.
          presentation: "modal",
          headerShown: false,
          contentStyle: { backgroundColor: colors.surface },
        }}
      />
      <Stack.Screen
        name="Pair"
        component={PairScreen}
        options={{ presentation: "modal", title: "Pair with your desktop" }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const [launching, setLaunching] = useState(true);
  const finishLaunch = useCallback(() => setLaunching(false), []);
  useFonts(fontFiles);
  useEffect(() => {
    const subscription = Linking.addEventListener("url", (event) => openPairingLink(event.url));
    return () => subscription.remove();
  }, []);
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <LibraryProvider>
          <NavigationContainer
            ref={navigation}
            theme={theme}
            onReady={() => Linking.getInitialURL().then(openPairingLink, () => {})}
          >
            {/* oxlint-disable-next-line react/style-prop-object -- expo-status-bar takes the style as a string */}
            <StatusBar style="light" />
            <Screens />
          </NavigationContainer>
        </LibraryProvider>
      </SafeAreaProvider>
      {launching ? <LaunchOverlay onDone={finishLaunch} /> : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
});
