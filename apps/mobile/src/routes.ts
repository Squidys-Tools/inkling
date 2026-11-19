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
