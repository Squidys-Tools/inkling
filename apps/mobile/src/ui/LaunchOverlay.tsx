import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { MascotPlayer } from "../../../renderer/src/mascot/player";
import { colors } from "../colors";
import { font } from "../fonts";
import { Mascot, nativeMotion } from "./Mascot";

// Same image and width as the native splash in app.json, so the hand-off doesn't jump.
const icon = require("../../assets/splash-icon.png");
const SIZE = 120;
// The engine draws the blob smaller within its frame than the icon does.
const LIVE_SCALE = 1.6;
const WAKE_MS = 250;
const EXCITE_MS = 1100;
const BURST_MS = 1250;
const BURST_FOR = 550;
const FADE_MS = BURST_MS + BURST_FOR - 150;
const FADE_FOR = 250;
const SKIP_FOR = 160;
const DROPS = [-150, -95, -35, 30, 90, 145, 200];
const always = { reduceMotion: ReduceMotion.Never };

function Drop({ angle, burst }: { angle: number; burst: SharedValue<number> }) {
  const radians = (angle * Math.PI) / 180;
  const style = useAnimatedStyle(() => ({
    opacity: burst.value === 0 ? 0 : 1 - burst.value,
    transform: [
      { translateX: Math.cos(radians) * 190 * burst.value },
      { translateY: Math.sin(radians) * 190 * burst.value },
      { scale: 1 - burst.value * 0.6 },
    ],
  }));
  return <Animated.View style={[styles.drop, style]} />;
}

/**
 * The cold-start opening: the app icon from the native splash comes alive as the
 * mascot, gets excited, and bursts into the library. A tap skips it; reduced motion only fades.
 */
export function LaunchOverlay({ onDone }: { onDone: () => void }) {
  const [player] = useState(
    () => new MascotPlayer(nativeMotion, { state: "inkling-drift", expression: "heureux" }),
  );
  const wake = useSharedValue(0);
  const word = useSharedValue(0);
  const burst = useSharedValue(0);
  const fade = useSharedValue(1);
  // Read synchronously from native: AccessibilityInfo answers only after this first frame has started.
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      word.value = 1;
      fade.value = withDelay(
        600,
        withTiming(0, { duration: FADE_FOR, ...always }),
        always.reduceMotion,
      );
      const done = setTimeout(onDone, 600 + FADE_FOR);
      return () => clearTimeout(done);
    }
    wake.value = withDelay(WAKE_MS, withSpring(1, { damping: 12, stiffness: 160 }));
    word.value = withDelay(450, withTiming(1, { duration: 350 }));
    burst.value = withDelay(
      BURST_MS,
      withTiming(1, { duration: BURST_FOR, easing: Easing.in(Easing.cubic) }),
    );
    fade.value = withDelay(FADE_MS, withTiming(0, { duration: FADE_FOR }));
    const timers = [
      setTimeout(() => player.setPose({ state: "inkling-drift", expression: "excite" }), EXCITE_MS),
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), BURST_MS),
      setTimeout(onDone, FADE_MS + FADE_FOR),
    ];
    return () => timers.forEach(clearTimeout);
  }, [player, wake, word, burst, fade, onDone, reduced]);

  const skip = () => {
    fade.set(withTiming(0, { duration: SKIP_FOR, ...always }));
    setTimeout(onDone, SKIP_FOR);
  };

  const overlay = useAnimatedStyle(() => ({ opacity: fade.value }));
  const still = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, wake.value * 1.5) }));
  const live = useAnimatedStyle(() => ({
    opacity: Math.min(1, wake.value * 1.5) * (1 - burst.value),
    transform: [{ scale: 0.9 + wake.value * 0.1 + burst.value * 7 }],
  }));
  const wordmark = useAnimatedStyle(() => ({
    opacity: word.value * (1 - Math.min(1, burst.value * 3)),
    transform: [{ translateY: (1 - word.value) * 8 }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, overlay]}>
      <Pressable accessibilityLabel="Skip" style={StyleSheet.absoluteFill} onPress={skip}>
        <View style={styles.center}>
          {DROPS.map((angle) => (
            <Drop key={angle} angle={angle} burst={burst} />
          ))}
          <Animated.View style={[styles.figure, live]}>
            <Mascot size={SIZE * LIVE_SCALE} visible live player={player} />
          </Animated.View>
          <Animated.View style={[styles.figure, still]}>
            <Image source={icon} style={styles.icon} />
          </Animated.View>
          <Animated.Text style={[styles.wordmark, wordmark]}>inkling</Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.window },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  figure: { position: "absolute" },
  icon: { width: SIZE, height: SIZE },
  drop: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.mascot,
  },
  wordmark: {
    position: "absolute",
    top: "50%",
    marginTop: SIZE / 2 + 18,
    fontFamily: font.display,
    fontSize: 30,
    letterSpacing: -0.8,
    paddingRight: 4,
    color: colors.title,
  },
});
