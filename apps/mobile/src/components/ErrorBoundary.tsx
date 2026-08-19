import React from 'react';
import { View } from 'react-native';
import { Button, Screen, Stack, Text, colors, spacing } from '@vaya/design-system';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Root-level safety net: without this, an uncaught render error anywhere in
 * the tree crashes to a blank frame. "Try again" just resets local state —
 * for errors caused by stale Redux/RTK Query state rather than a one-off
 * render glitch, the user closing and reopening the app is the real fix,
 * which this can't do on its own.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(
      'Unhandled render error caught by root ErrorBoundary',
      error,
      info.componentStack,
    );
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  override render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: colors.gray50 }}>
        <Screen>
          <Stack gap="lg" align="center" style={{ flex: 1, justifyContent: 'center' }}>
            <Text variant="h2" align="center">
              Un problème est survenu
            </Text>
            <Text variant="body" color={colors.gray600} align="center">
              Quelque chose s&apos;est mal passé. Vous pouvez réessayer, ou fermer et rouvrir
              l&apos;application si le problème persiste.
            </Text>
            <Button
              label="Réessayer"
              onPress={this.handleRetry}
              style={{ marginTop: spacing.md }}
            />
          </Stack>
        </Screen>
      </View>
    );
  }
}
