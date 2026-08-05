import { useSyncExternalStore } from 'react';
import { assistantManager } from '../AssistantManager';
import type { AssistantUiState } from '../types';

/**
 * React binding for the assistant's observable UI state.
 *
 * Usage in a component:
 *
 *   const ui = useAssistant();
 *   if (ui.speaking) { ... }
 *
 * The component re-renders whenever the assistant state changes.
 */
export function useAssistant(): AssistantUiState {
  return useSyncExternalStore(
    (onStoreChange) => assistantManager.subscribe(() => onStoreChange()),
    () => assistantManager.getSnapshot(),
  );
}
