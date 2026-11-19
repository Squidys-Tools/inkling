import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CardTile } from "../cards/CardTile";
import { cardTitle, hostname, kindOf, savedAgo } from "../cards";
import { useAppearance, useThemedStyles } from "../appearance";
import type { Palette } from "../colors";
import { font } from "../fonts";
import type { ScreenProps } from "../routes";
import { useLibrary } from "../state";

export function ItemScreen({ route }: ScreenProps<"Item">) {
  const styles = useThemedStyles(makeStyles);
  const { look } = useAppearance();
  const fieldnotes = look === "fieldnotes";
  const { pairing } = useLibrary();
  const { card } = route.params;
  const kind = kindOf(card);
  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <View style={[styles.stage, fieldnotes && styles.paperStage]}>
        <View style={styles.art}>
          {pairing ? <CardTile pairing={pairing} card={card} detail /> : null}
        </View>
      </View>
      <View style={styles.details}>
        <Text style={styles.kind}>{kind.toUpperCase()}</Text>
        <Text style={[styles.title, fieldnotes && styles.paperTitle]}>{cardTitle(card)}</Text>
        <Text
          style={[styles.meta, fieldnotes && styles.paperMeta]}
        >{`Saved ${savedAgo(card.createdAt)}`}</Text>
        {card.description ? (
          <Text style={[styles.body, fieldnotes && styles.paperBody]}>{card.description}</Text>
        ) : null}
        {card.sourceUrl?.startsWith("http") ? (
          <Pressable
            accessibilityRole="link"
            style={[styles.open, fieldnotes && styles.paperLink]}
            onPress={() => Linking.openURL(card.sourceUrl ?? "")}
          >
            <Text
              style={styles.openText}
            >{`Open ${card.source ?? hostname(card.sourceUrl)} ↗`}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    paperStage: { paddingVertical: 24 },
    paperTitle: {
      fontFamily: "Georgia",
      fontSize: 32,
      lineHeight: 39,
      fontWeight: "400",
      letterSpacing: -0.6,
    },
    paperMeta: {
      paddingBottom: 20,
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    paperBody: { fontFamily: "Georgia", fontSize: 19, lineHeight: 30 },
    paperLink: { borderRadius: 4, paddingVertical: 14, minHeight: 48 },
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
