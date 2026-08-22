// TEMPORARY scratch file to empirically verify the custom ESLint rule.
// Expected violations: exactly TWO errors — one for badHelper() called from
// .onUpdate, one for alsoBad() called from withTiming's completion callback.
// goodWorklet() and the runOnJS-wrapped call must NOT be flagged. Delete
// after verification.
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';

function badHelper(): void {
  return;
}

function alsoBad(): void {
  return;
}

function goodWorklet(): void {
  'worklet';
  return;
}

export function scratchVerifyRule(): void {
  const sv = useSharedValue(0);
  const gesture = Gesture.Pan()
    .onUpdate((event) => {
      sv.value = event.translationX;
      badHelper();
      goodWorklet();
      void runOnJS(badHelper);
    })
    .onEnd((event) => {
      if (event.translationX > 40) {
        sv.value = withTiming(0, undefined, () => {
          alsoBad();
        });
      }
    });
  return gesture as never as void;
}
