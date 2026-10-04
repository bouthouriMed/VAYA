import { createContext } from 'react';

/**
 * Stand-in for @react-navigation/native under Vitest (the real package
 * pulls React Native source the Node test environment can't parse). Only
 * what app code imports from it: an empty NavigationContext — "not inside a
 * navigator", which useFocusAwarePolling treats as focused.
 */
export const NavigationContext = createContext<undefined>(undefined);
