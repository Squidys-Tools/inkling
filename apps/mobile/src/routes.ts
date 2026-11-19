import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { PhoneCard } from "./desktop";

export type Routes = {
  Library: undefined;
  Item: { card: PhoneCard };
  Settings: undefined;
  Pair: undefined;
};

export type ScreenProps<Name extends keyof Routes> = NativeStackScreenProps<Routes, Name>;
