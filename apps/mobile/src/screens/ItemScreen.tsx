import { Linking, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { cardTitle, hostname, savedAgo } from "../cards";
import { colors } from "../colors";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";
import { Thumbnail } from "../ui/Thumbnail";

export function ItemScreen({ route }: ScreenProps<"Item">) {
  const { pairing } = useLibrary();
  const { card } = route.params;
  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      {pairing ? (
        <Thumbnail pairing={pairing} card={card} fit="contain" style={styles.hero} />
      ) : null}
      <Text style={styles.title}>{cardTitle(card)}</Text>
      <Text style={styles.meta}>{`Saved ${savedAgo(card.createdAt)}`}</Text>
      {card.description ? <Text style={styles.body}>{card.description}</Text> : null}
      {card.sourceUrl ? (
        <Pressable onPress={() => Linking.openURL(card.sourceUrl ?? "")}>
          <Text style={styles.link}>{`Open ${hostname(card.sourceUrl)}`}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { padding: 16, gap: 10 },
  hero: { aspectRatio: 4 / 3, backgroundColor: colors.surface },
  title: { color: colors.title, fontSize: 22, fontWeight: "600", marginTop: 6 },
  meta: { color: colors.muted, fontSize: 13 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  link: { color: colors.accent, fontSize: 15, fontWeight: "600" },
});
