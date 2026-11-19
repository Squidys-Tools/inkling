import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { MascotPlayer } from "../../../renderer/src/mascot/player";
import { colors } from "../colors";
import { font } from "../fonts";
import { Mascot, nativeMotion } from "./Mascot";

const MASCOT = 120;
const FLIP_MS = 1100;
const SPILL_MS = 1250;
const SPILL_FOR = 550;
const FADE_MS = SPILL_MS + SPILL_FOR;
const FADE_FOR = 250;
const DROPS = [-150, -95, -35, 30, 90, 145, 200];

function Drop({ angle, spill }: { angle: number; spill: SharedValue<number> }) {
  const radians = (angle * Math.PI) / 180;
  const style = useAnimatedStyle(() => ({
    opacity: spill.value === 0 ? 0 : 1 - spill.value,
    transform: [
      { translateX: Math.cos(radians) * 170 * spill.value },
      { translateY: Math.sin(radians) * 170 * spill.value },
      { scale: 1 - spill.value * 0.6 },
    ],
  }));
  return <Animated.View style={[styles.drop, style]} />;
}

/**
 * The cold-start opening: the mascot drops in on warm paper, turns to ink, and
 * spills over the screen into the library. A tap skips it; reduced motion only fades.
 */
export function LaunchOverlay({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const [player] = useState(
    () => new MascotPlayer(nativeMotion, { state: "inkling-drift", expression: "heureux" }),
  );
  const [inked, setInked] = useState(false);
  const pop = useSharedValue(0);
  const word = useSharedValue(0);
  const spill = useSharedValue(0);
  const fade = useSharedValue(1);
  const reach = Math.hypot(width, height) * 2;

  useEffect(() => {
    if (nativeMotion.reducedMotion()) {
      pop.value = 1;
      fade.value = withDelay(600, withTiming(0, { duration: FADE_FOR }));
      const done = setTimeout(onDone, 600 + FADE_FOR);
      return () => clearTimeout(done);
    }
    pop.value = withSpring(1, { damping: 9, stiffness: 140 });
    word.value = withDelay(450, withTiming(1, { duration: 350 }));
    spill.value = withDelay(
      SPILL_MS,
      withTiming(1, { duration: SPILL_FOR, easing: Easing.inOut(Easing.cubic) }),
    );
    fade.value = withDelay(FADE_MS, withTiming(0, { duration: FADE_FOR }));
    const timers = [
      setTimeout(() => {
        setInked(true);
        player.setPose({ state: "inkling-drift", expression: "excite" });
      }, FLIP_MS),
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), FADE_MS),
      setTimeout(onDone, FADE_MS + FADE_FOR),
    ];
    return () => timers.forEach(clearTimeout);
  }, [player, pop, word, spill, fade, onDone]);

  const overlay = useAnimatedStyle(() => ({ opacity: fade.value }));
  const mascot = useAnimatedStyle(() => ({
    transform: [{ scale: 0.4 + pop.value * 0.6 }, { translateY: (1 - pop.value) * -40 }],
    opacity: Math.min(1, pop.value * 2),
  }));
  const wordmark = useAnimatedStyle(() => ({
    opacity: word.value * (1 - spill.value * 2),
    transform: [{ translateY: (1 - word.value) * 8 }],
  }));
  const blot = useAnimatedStyle(() => ({ transform: [{ scale: spill.value }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, overlay]}>
      <Pressable accessibilityLabel="Skip" style={StyleSheet.absoluteFill} onPress={onDone}>
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.mascot} />
              <Stop offset="0.55" stopColor={colors.accent} />
              <Stop offset="1" stopColor={colors.accentDeep} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#paper)" />
        </Svg>
        <View style={styles.center}>
          <Animated.View
            style={[
              styles.blot,
              {
                width: reach,
                height: reach,
                borderRadius: reach / 2,
                marginLeft: -reach / 2,
                marginTop: -reach / 2,
              },
              blot,
            ]}
          />
          {DROPS.map((angle) => (
            <Drop key={angle} angle={angle} spill={spill} />
          ))}
          <Animated.View style={mascot}>
            <Mascot
              size={MASCOT}
              visible
              live
              player={player}
              ink={inked ? colors.background : colors.mascot}
            />
          </Animated.View>
          <Animated.Text style={[styles.wordmark, wordmark]}>inkling</Animated.Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  blot: { position: "absolute", left: "50%", top: "50%", backgroundColor: colors.background },
  drop: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.background,
  },
  wordmark: {
    position: "absolute",
    top: "50%",
    marginTop: MASCOT / 2 + 18,
    fontFamily: font.display,
    fontSize: 30,
    letterSpacing: -0.8,
    paddingRight: 4,
    color: colors.window,
  },
});
