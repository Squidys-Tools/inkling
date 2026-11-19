import {
  createNavigationContainerRef,
  DarkTheme,
  NavigationContainer,
  useNavigation,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Linking } from "react-native";
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
import { SymbolButton } from "./src/ui/SymbolButton";

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
          title: "inkling",
          headerLargeTitle: true,
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

export default function App() {
  useFonts(fontFiles);
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
          {/* oxlint-disable-next-line react/style-prop-object -- expo-status-bar takes the style as a string */}
          <StatusBar style="light" />
          <Screens />
        </NavigationContainer>
      </LibraryProvider>
    </SafeAreaProvider>
  );
}
