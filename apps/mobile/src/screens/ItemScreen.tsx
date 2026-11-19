import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CardTile } from "../cards/CardTile";
import { cardTitle, hostname, kindOf, savedAgo } from "../cards";
import { colors } from "../colors";
import { font } from "../fonts";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";

export function ItemScreen({ route }: ScreenProps<"Item">) {
  const { pairing } = useLibrary();
  const { card } = route.params;
  const kind = kindOf(card);
  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <View style={styles.stage}>
        <View style={styles.art}>
          {pairing ? <CardTile pairing={pairing} card={card} /> : null}
        </View>
      </View>
      <View style={styles.details}>
        <Text style={styles.kind}>{kind.toUpperCase()}</Text>
        <Text style={styles.title}>{cardTitle(card)}</Text>
        <Text style={styles.meta}>{`Saved ${savedAgo(card.createdAt)}`}</Text>
        {card.description ? <Text style={styles.body}>{card.description}</Text> : null}
        {card.sourceUrl?.startsWith("http") ? (
          <Pressable style={styles.open} onPress={() => Linking.openURL(card.sourceUrl ?? "")}>
            <Text
              style={styles.openText}
            >{`Open ${card.source ?? hostname(card.sourceUrl)} ↗`}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  stage: {
    backgroundColor: colors.stage,
    paddingVertical: 28,
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  art: { width: "72%" },
  details: { padding: 20, gap: 8 },
  kind: { fontFamily: font.mono, fontSize: 10, letterSpacing: 1.4, color: colors.muted },
  title: {
    fontFamily: font.display,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.5,
    color: colors.title,
  },
  meta: { fontFamily: font.mono, fontSize: 11, color: colors.muted },
  body: { color: colors.text, fontSize: 15, lineHeight: 22, marginTop: 6 },
  open: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  openText: { color: colors.text, fontSize: 13, fontWeight: "500" },
});
