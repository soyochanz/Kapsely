import React, { RefObject } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.4;

interface ZoomableImageProps {
  uri: string;
  style?: any;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  simultaneousGesture?: RefObject<any>;
}

const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.max(min, Math.min(max, value));
};

const clampTranslate = (value: number, scale: number, axisSize: number) => {
  'worklet';
  const maxOffset = Math.max(0, ((axisSize * scale) - axisSize) / 2);
  return clamp(value, -maxOffset, maxOffset);
};

const ZoomableImage = ({
  uri,
  style,
  onInteractionStart,
  onInteractionEnd,
  simultaneousGesture,
}: ZoomableImageProps) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const isInteracting = useSharedValue(false);

  const finishInteractionIfNeeded = () => {
    'worklet';
    if (isInteracting.value) {
      isInteracting.value = false;
      if (onInteractionEnd) {
        runOnJS(onInteractionEnd)();
      }
    }
  };

  const startInteractionIfNeeded = () => {
    'worklet';
    if (!isInteracting.value) {
      isInteracting.value = true;
      if (onInteractionStart) {
        runOnJS(onInteractionStart)();
      }
    }
  };

  const animateTo = (nextScale: number, nextX: number, nextY: number) => {
    'worklet';
    scale.value = withTiming(nextScale, { duration: 220 });
    translateX.value = withTiming(nextX, { duration: 220 });
    translateY.value = withTiming(nextY, { duration: 220 });
    savedScale.value = nextScale;
    savedTranslateX.value = nextX;
    savedTranslateY.value = nextY;
  };

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      startInteractionIfNeeded();
    })
    .onUpdate((event) => {
      const nextScale = clamp(savedScale.value * event.scale, MIN_SCALE, MAX_SCALE);
      const relativeScale = nextScale / savedScale.value;

      const nextTranslateX = savedTranslateX.value + (1 - relativeScale) * (event.focalX - SCREEN_WIDTH / 2);
      const nextTranslateY = savedTranslateY.value + (1 - relativeScale) * (event.focalY - SCREEN_HEIGHT / 2);

      scale.value = nextScale;
      translateX.value = clampTranslate(nextTranslateX, nextScale, SCREEN_WIDTH);
      translateY.value = clampTranslate(nextTranslateY, nextScale, SCREEN_HEIGHT);
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        animateTo(1, 0, 0);
        finishInteractionIfNeeded();
      } else {
        savedScale.value = scale.value;
        savedTranslateX.value = clampTranslate(translateX.value, scale.value, SCREEN_WIDTH);
        savedTranslateY.value = clampTranslate(translateY.value, scale.value, SCREEN_HEIGHT);
        translateX.value = savedTranslateX.value;
        translateY.value = savedTranslateY.value;
      }
    });

  const panGesture = Gesture.Pan()
    .minDistance(1)
    .maxPointers(1)
    .onStart(() => {
      if (scale.value > 1) {
        startInteractionIfNeeded();
      }
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      translateX.value = clampTranslate(savedTranslateX.value + event.translationX, scale.value, SCREEN_WIDTH);
      translateY.value = clampTranslate(savedTranslateY.value + event.translationY, scale.value, SCREEN_HEIGHT);
    })
    .onEnd((event) => {
      if (scale.value <= 1) {
        finishInteractionIfNeeded();
        return;
      }
      const maxX = Math.max(0, ((SCREEN_WIDTH * scale.value) - SCREEN_WIDTH) / 2);
      const maxY = Math.max(0, ((SCREEN_HEIGHT * scale.value) - SCREEN_HEIGHT) / 2);
      translateX.value = withDecay({ velocity: event.velocityX, clamp: [-maxX, maxX], deceleration: 0.996 }, () => {
        savedTranslateX.value = translateX.value;
      });
      translateY.value = withDecay({ velocity: event.velocityY, clamp: [-maxY, maxY], deceleration: 0.996 }, () => {
        savedTranslateY.value = translateY.value;
      });
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onStart((event) => {
      if (scale.value > 1.02) {
        animateTo(1, 0, 0);
        finishInteractionIfNeeded();
        return;
      }

      startInteractionIfNeeded();
      const nextScale = DOUBLE_TAP_SCALE;
      const targetX = clampTranslate((SCREEN_WIDTH / 2 - event.x) * (nextScale - 1), nextScale, SCREEN_WIDTH);
      const targetY = clampTranslate((SCREEN_HEIGHT / 2 - event.y) * (nextScale - 1), nextScale, SCREEN_HEIGHT);
      animateTo(nextScale, targetX, targetY);
    });

  const pinch = simultaneousGesture
    ? pinchGesture.simultaneousWithExternalGesture(simultaneousGesture)
    : pinchGesture;
  const pan = simultaneousGesture
    ? panGesture.simultaneousWithExternalGesture(simultaneousGesture)
    : panGesture;

  const composed = Gesture.Exclusive(doubleTapGesture, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.container, animatedStyle]}>
        <Image
          source={{ uri }}
          style={[styles.image, style]}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default ZoomableImage;
