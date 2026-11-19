import {
  createDrawerNavigator,
  type DrawerContentComponentProps,
  useDrawerProgress,
} from "@react-navigation/drawer";
import {
  createNavigationContainerRef,
  DarkTheme,
  DrawerActions,
  NavigationContainer,
  useNavigation,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { SearchBarCommands } from "react-native-screens";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated";
import { colors } from "./src/colors";
import { font, fontFiles } from "./src/fonts";
import { parsePairingLink } from "./src/pairing-link";
import type { DrawerRoutes, Routes } from "./src/routes";
import { ItemScreen } from "./src/screens/ItemScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { PairScreen } from "./src/screens/PairScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { LibraryProvider, useLibrary } from "./src/state";
import { LaunchOverlay } from "./src/ui/LaunchOverlay";
import { Sidebar } from "./src/ui/Sidebar";
import { SymbolButton } from "./src/ui/SymbolButton";

const Stack = createNativeStackNavigator<Routes>();
const Drawer = createDrawerNavigator<DrawerRoutes>();
const navigation = createNavigationContainerRef<DrawerRoutes>();

// A pairing link only fills in the Pair sheet: the user confirms the desktop before any save goes to it.
function openPairingLink(link: string | null | undefined) {
  const pairing = link ? parsePairingLink(link) : null;
  if (pairing && navigation.isReady())
    navigation.navigate("Main", { screen: "Pair", params: { link: pairing } });
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

function SidebarButton() {
  const stack = useNavigation();
  return (
    <SymbolButton
      name="sidebar.left"
      label="Open sidebar"
      onPress={() => stack.dispatch(DrawerActions.openDrawer())}
    />
  );
}

const sidebarButton = () => <SidebarButton />;
const sidebar = (props: DrawerContentComponentProps) => <Sidebar {...props} />;

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
        name="Library"
        component={LibraryScreen}
        options={{
          title,
          headerShadowVisible: false,
          headerLeft: sidebarButton,
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

/** The library slides aside as a rounded page that stays in view, like Obsidian's. */
function MainCard() {
  const progress = useDrawerProgress();
  const card = useAnimatedStyle(() => ({
    borderRadius: interpolate(progress.value, [0, 1], [0, 44]),
    borderWidth: interpolate(progress.value, [0, 1], [0, 1]),
  }));
  return (
    <Animated.View style={[styles.card, card]}>
      <Screens />
    </Animated.View>
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
            <Drawer.Navigator
              drawerContent={sidebar}
              screenOptions={{
                headerShown: false,
                drawerType: "slide",
                overlayColor: "transparent",
                sceneStyle: { backgroundColor: colors.surface },
                swipeEdgeWidth: 48,
                drawerStyle: styles.drawer,
              }}
            >
              <Drawer.Screen name="Main" component={MainCard} />
            </Drawer.Navigator>
          </NavigationContainer>
        </LibraryProvider>
      </SafeAreaProvider>
      {launching ? <LaunchOverlay onDone={finishLaunch} /> : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  card: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: colors.background,
    borderColor: colors.borderStrong,
  },
  drawer: {
    width: "84%",
    backgroundColor: colors.surface,
  },
});
