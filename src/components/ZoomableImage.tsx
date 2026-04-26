import React, { RefObject } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Image } from 'expo-image';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ZoomableImageProps {
  uri: string;
  style?: any;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  simultaneousGesture?: RefObject<any>;
}

const ZoomableImage = ({ uri, style, onInteractionStart, onInteractionEnd, simultaneousGesture }: ZoomableImageProps) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      if (onInteractionStart) runOnJS(onInteractionStart)();
    })
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
      
      // Focal point zoom logic
      translateX.value = savedTranslateX.value + (1 - event.scale) * (event.focalX - SCREEN_WIDTH / 2);
      translateY.value = savedTranslateY.value + (1 - event.scale) * (event.focalY - SCREEN_HEIGHT / 2);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
      if (scale.value <= 1 && onInteractionEnd) {
        runOnJS(onInteractionEnd)();
      }
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .activeOffsetX([-15, 15])
    .activeOffsetY([-15, 15])
    .onStart(() => {
      if (scale.value > 1 && onInteractionStart) {
        runOnJS(onInteractionStart)();
      }
    })
    .onUpdate((event) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + event.translationX;
        translateY.value = savedTranslateY.value + event.translationY;
      }
    })
    .onEnd(() => {
      if (scale.value > 1) {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
      if (scale.value <= 1 && onInteractionEnd) {
        runOnJS(onInteractionEnd)();
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onStart(() => {
      if (scale.value !== 1) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        if (onInteractionEnd) runOnJS(onInteractionEnd)();
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
        if (onInteractionStart) runOnJS(onInteractionStart)();
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const pinch = simultaneousGesture ? pinchGesture.simultaneousWithExternalGesture(simultaneousGesture) : pinchGesture;
  const pan = simultaneousGesture ? panGesture.simultaneousWithExternalGesture(simultaneousGesture) : panGesture;

  const composed = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinch, pan)
  );

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
