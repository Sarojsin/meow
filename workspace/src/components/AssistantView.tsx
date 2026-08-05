import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { assistantManager } from '../assistant/AssistantManager';
import { useAssistant } from '../assistant/hooks/useAssistant';
import { TalkingCat } from './TalkingCat';
import { SpeechBubble } from './SpeechBubble';

/**
 * AssistantView
 * --------------------------------------------------------------------------
 * The floating assistant entry point. Behaviours (per spec):
 *  - Floating: circular 3D cat, bottom-right, soft shadow.
 *  - Tap        → expand to a larger panel with the speech bubble.
 *  - Tap again  → collapse back to floating.
 *  - Long-press → hide the assistant (interrupts speech, pauses animation).
 *
 * The 3D renderer stays mounted for the lifetime of the app so the model and
 * Filament context are never recreated (hide only uses `display: none`).
 */

interface AssistantViewProps {
  /** Floating cat diameter in points. */
  size?: number;
  /** Expanded panel cat diameter in points. */
  expandedSize?: number;
  /** Bottom-right offset from screen edges. */
  margin?: number;
}

export function AssistantView({
  size = 96,
  expandedSize = 240,
  margin = 16,
}: AssistantViewProps): React.ReactElement | null {
  const ui = useAssistant();
  const { visible, expanded, speaking, currentText } = ui;

  const catSize = expanded ? expandedSize : size;

  const handleTap = useCallback(() => {
    if (expanded) {
      assistantManager.collapse();
    } else {
      assistantManager.expand();
    }
  }, [expanded]);

  const handleLongPress = useCallback(() => {
    assistantManager.hide();
  }, []);

  const showBubble = speaking || currentText != null;

  return (
    <View style={styles.wrapper} pointerEvents={visible ? 'box-none' : 'none'}>
      <View
        style={[
          styles.container,
          expanded ? styles.containerExpanded : styles.containerFloating,
          { marginBottom: margin, marginRight: margin },
          !visible && styles.hidden,
        ]}
      >
        <View style={[styles.catCircle, expanded ? styles.catCircleExpanded : styles.catCircleFloating]}>
          <TalkingCat size={catSize} />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleTap}
            onLongPress={handleLongPress}
            delayLongPress={600}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse the assistant' : 'Expand the assistant'}
            accessibilityHint="Tap toggles the panel. Long-press hides the assistant."
          />
        </View>

        {showBubble && (
          <SpeechBubble text={currentText} speaking={speaking} expanded={expanded} position="above" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  container: {
    alignItems: 'center',
  },
  containerFloating: {
    width: 128,
  },
  containerExpanded: {
    width: 320,
    minHeight: 340,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 20,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 252, 246, 0.95)',
    borderColor: '#F3DCCB',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  hidden: {
    display: 'none',
  },
  catCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  catCircleFloating: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#FFF7EE',
    borderColor: '#F3DCCB',
    borderWidth: 1,
  },
  catCircleExpanded: {
    width: 264,
    height: 264,
    borderRadius: 132,
    backgroundColor: '#FFF7EE',
    borderColor: '#F3DCCB',
    borderWidth: 1,
  },
});
