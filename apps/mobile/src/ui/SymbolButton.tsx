import { SymbolView, type SFSymbol } from "expo-symbols";
import { Pressable } from "react-native";
import { useAppearance } from "../appearance";

export function SymbolButton(props: { name: SFSymbol; label: string; onPress: () => void }) {
  const { colors } = useAppearance();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      hitSlop={12}
      onPress={props.onPress}
    >
      <SymbolView name={props.name} tintColor={colors.accent} size={22} />
    </Pressable>
  );
}
