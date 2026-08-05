import React, { useEffect } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { assistantManager } from './src/assistant/AssistantManager';
import { AssistantView } from './src/components';

/**
 * Demo host app for the 3D Talking Assistant.
 *
 * The assistant is deliberately *not* shown on every launch; `app_opened` is
 * triggered once so the assistant introduces itself, and the demo buttons let
 * you fire the same events the real app would emit (prediction updated, period
 * logged, achievement unlocked, ...).
 */
export default function App(): React.ReactElement {
  // Introduce the assistant once on launch (not on every render).
  useEffect(() => {
    assistantManager.show();
    assistantManager.trigger('app_opened');
  }, []);

  const fire = (event: Parameters<typeof assistantManager.trigger>[0]) => () =>
    assistantManager.trigger(event);

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.content}>
        <Text style={styles.title}>She Care</Text>
        <Text style={styles.subtitle}>3D Talking Assistant demo</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Events (each speaks a response)</Text>
          <Button title="App opened" onPress={fire('app_opened')} />
          <View style={styles.gap} />
          <Button title="Prediction updated" onPress={fire('prediction_updated')} />
          <View style={styles.gap} />
          <Button title="Period logged" onPress={fire('period_logged')} />
          <View style={styles.gap} />
          <Button title="Medication reminder" onPress={fire('medication_reminder')} />
          <View style={styles.gap} />
          <Button title="Hydration reminder" onPress={fire('hydration_reminder')} />
          <View style={styles.gap} />
          <Button title="Achievement unlocked" onPress={fire('achievement_unlocked')} />
          <View style={styles.gap} />
          <Button title="Cycle completed" onPress={fire('cycle_completed')} />
          <View style={styles.gap} />
          <Button title="Custom speak" onPress={() => assistantManager.speak('I will remember that for you.')} />
        </View>

        <Text style={styles.hint}>
          Tap the cat to expand. Long-press to hide.
        </Text>
      </ScrollView>

      <AssistantView />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FDF6EF',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#5B4636',
    marginTop: 40,
  },
  subtitle: {
    fontSize: 15,
    color: '#9C8672',
    marginBottom: 24,
  },
  section: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderColor: '#F3DCCB',
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7A6450',
    marginBottom: 14,
  },
  gap: {
    height: 10,
  },
  hint: {
    marginTop: 20,
    textAlign: 'center',
    color: '#B39E8A',
    fontSize: 13,
  },
});
