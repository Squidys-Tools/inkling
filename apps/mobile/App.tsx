import { createDrawerNavigator, type DrawerContentComponentProps } from "@react-navigation/drawer";
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
import { useEffect, useRef } from "react";
import { Linking, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "./src/colors";
import { font, fontFiles } from "./src/fonts";
import { parsePairingLink } from "./src/pairing-link";
import type { DrawerRoutes, Routes } from "./src/routes";
import { ItemScreen } from "./src/screens/ItemScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { PairScreen } from "./src/screens/PairScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { LibraryProvider, useLibrary } from "./src/state";
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
      name="line.3.horizontal"
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
    scope.kind === "archived" ? "Archive" : scope.kind === "space" ? scope.space.name : "inkling";
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.accent,
        headerTitleStyle: { fontFamily: font.display, color: colors.title },
        headerLargeTitleStyle: { fontFamily: font.display, color: colors.title },
      }}
    >
      <Stack.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          title,
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
          headerShadowVisible: false,
          // The sidebar button sits on the left: dev builds float Expo's tools button over the top right.
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
          presentation: "formSheet",
          sheetAllowedDetents: [0.62, 1],
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
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
                // The library slides aside to show the sidebar, as Claude's and ChatGPT's apps do.
                drawerType: "slide",
                overlayColor: "transparent",
                swipeEdgeWidth: 48,
                drawerStyle: styles.drawer,
              }}
            >
              <Drawer.Screen name="Main" component={Screens} />
            </Drawer.Navigator>
          </NavigationContainer>
        </LibraryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.window },
  drawer: {
    width: "78%",
    backgroundColor: colors.window,
    borderRightColor: colors.border,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
});
