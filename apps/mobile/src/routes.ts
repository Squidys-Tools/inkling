import type { NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { PhoneCard } from "./desktop";
import type { Pairing } from "./pairing";

export type Routes = {
  Library: undefined;
  Item: { card: PhoneCard };
  Settings: undefined;
  Pair: { link?: Pairing } | undefined;
};

export type ScreenProps<Name extends keyof Routes> = NativeStackScreenProps<Routes, Name>;

/** The sidebar drawer holds the whole stack, the way desktop's sidebar holds the library. */
export type DrawerRoutes = { Main: NavigatorScreenParams<Routes> };
