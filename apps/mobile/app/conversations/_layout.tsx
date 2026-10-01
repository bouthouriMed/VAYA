import { Stack } from 'expo-router';
import { useAppTheme } from '@vaya/design-system';

/** The chat screen renders its own header (avatar, verified badge, live
 *  trip context bar) — the native header stays off so the two never stack. */
export default function ConversationsLayout(): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }} />;
}
