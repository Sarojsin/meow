import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

/**
 * SpeechBubble
 * --------------------------------------------------------------------------
 * Displays the currently spoken message with a soft "breathing" pulse while
 * speaking, and a small tail pointing at the assistant.
 */

interface SpeechBubbleProps {
  /** Message to display (empty/null while idle). */
  text: string | null;
  /** True while the message is being spoken (pulses). */
  speaking: boolean;
  /** Layout hint: compact bubble floating over the cat vs. panel bubble. */
  expanded?: boolean;
  /** Placement relative to the assistant. */
  position?: 'above' | 'below';
}

const COLORS = {
  bubble: '#FFF8F2',
  border: '#F3DCCB',
  text: '#5B4636',
};

export function SpeechBubble({
  text,
  speaking,
  expanded = false,
  position = 'above',
}: SpeechBubbleProps): React.ReactElement | null {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!speaking) {
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.035, duration: 420, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [speaking, pulse]);

  if (!text) {
    return null;
  }

  const tailFlipped = position === 'below';

  return (
    <Animated.View
      style={[
        styles.bubble,
        expanded ? styles.bubbleExpanded : styles.bubbleFloating,
        position === 'above' ? styles.above : styles.below,
        { transform: [{ scale: pulse }] },
      ]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.tail,
          tailFlipped ? styles.tailFlipped : styles.tailNormal,
          position === 'above' ? styles.tailAbove : styles.tailBelow,
        ]}
      />
      <Text style={styles.text} numberOfLines={expanded ? 0 : 3}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    backgroundColor: COLORS.bubble,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  bubbleFloating: {
    maxWidth: 220,
  },
  bubbleExpanded: {
    maxWidth: 300,
    alignSelf: 'stretch',
  },
  above: {
    bottom: '110%',
  },
  below: {
    top: '110%',
  },
  text: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
  },
  tail: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderStyle: 'solid',
  },
  tailNormal: {
    borderTopColor: COLORS.bubble,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tailFlipped: {
    borderBottomColor: COLORS.bubble,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tailAbove: {
    bottom: -8,
    left: 24,
    borderTopWidth: 9,
  },
  tailBelow: {
    top: -8,
    left: 24,
    borderBottomWidth: 9,
  },
});
