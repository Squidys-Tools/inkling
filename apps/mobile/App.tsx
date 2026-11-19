import {
  createNavigationContainerRef,
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useNavigation,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppearanceProvider, useAppearance } from "./src/appearance";
import { parsePairingLink } from "./src/pairing-link";
import type { Routes } from "./src/routes";
import { ItemScreen } from "./src/screens/ItemScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { PairScreen } from "./src/screens/PairScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { LibraryProvider, useLibrary } from "./src/state";
import { SymbolButton } from "./src/ui/SymbolButton";

const Stack = createNativeStackNavigator<Routes>();
const navigation = createNavigationContainerRef<Routes>();

// A pairing link only fills in the Pair sheet: the user confirms the desktop before any save goes to it.
function openPairingLink(link: string | null | undefined) {
  const pairing = link ? parsePairingLink(link) : null;
  if (pairing && navigation.isReady()) navigation.navigate("Pair", { link: pairing });
}

function SettingsButton() {
  const navigation = useNavigation<NativeStackNavigationProp<Routes>>();
  return (
    <SymbolButton
      name="gearshape"
      label="Settings"
      onPress={() => navigation.navigate("Settings")}
    />
  );
}

// Settings sits on the left: dev builds float Expo's tools button over the top right.
const settingsButton = () => <SettingsButton />;

function Screens() {
  const library = useLibrary();
  const { colors, look } = useAppearance();
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.accent,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
        statusBarStyle: look === "fieldnotes" ? "dark" : "light",
      }}
    >
      <Stack.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          title: look === "fieldnotes" ? "inkling." : "inkling",
          headerTitleStyle:
            look === "fieldnotes" ? { fontFamily: "Georgia", fontWeight: "400" } : undefined,
          headerLargeTitle: look !== "fieldnotes",
          headerLargeTitleShadowVisible: false,
          headerShadowVisible: false,
          headerLeft: settingsButton,
          headerSearchBarOptions: library.pairing
            ? {
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
        options={{ presentation: "modal", title: "Settings" }}
      />
      <Stack.Screen
        name="Pair"
        component={PairScreen}
        options={{ presentation: "modal", title: "Pair with your desktop" }}
      />
    </Stack.Navigator>
  );
}

function MobileApp() {
  const { colors, look } = useAppearance();
  const base = look === "fieldnotes" ? DefaultTheme : DarkTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.background,
      text: colors.title,
      border: colors.border,
    },
  };
  useEffect(() => {
    const subscription = Linking.addEventListener("url", (event) => openPairingLink(event.url));
    return () => subscription.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <LibraryProvider>
        <NavigationContainer
          ref={navigation}
          theme={theme}
          onReady={() => Linking.getInitialURL().then(openPairingLink, () => {})}
        >
          <StatusBar style={look === "fieldnotes" ? "dark" : "light"} />
          <Screens />
        </NavigationContainer>
      </LibraryProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <AppearanceProvider>
      <MobileApp />
    </AppearanceProvider>
  );
}
