import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { spacing, radii } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';

interface EmptyStateProps {
  /** A standard icon, rendered in the system's round icon well. Prefer this. */
  iconName?: IconName;
  /** Custom decorative node (an illustration) — hidden from screen readers. */
  icon?: React.ReactNode;
  /** 'error' tints the icon well so a failure never reads as "nothing here". */
  tone?: 'neutral' | 'error';
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  /** Extra content between the description and the action — e.g. a
   *  fallback list of nearby results, so a "nothing found" state can still
   *  offer something adjacent rather than being a pure dead end. */
  children?: React.ReactNode;
}

/**
 * A dead end should turn into a next action, not a shrug. Every empty and
 * error state in the app renders through this one layout (icon well,
 * title, description, outline action), top-aligned in its container.
 */
export function EmptyState({
  iconName,
  icon,
  tone = 'neutral',
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled,
  children,
}: EmptyStateProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const isError = tone === 'error';
  return (
    <View style={styles.container} accessible accessibilityRole={isError ? 'alert' : 'text'}>
      {iconName || icon ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.iconWell, { backgroundColor: isError ? theme.errorMuted : theme.surfaceMuted }]}
        >
          {iconName ? <Icon name={iconName} size="md" color={isError ? theme.error : theme.inkMuted} /> : icon}
        </View>
      ) : null}
      <Text variant="title" align="center" color={theme.ink}>
        {title}
      </Text>
      {description ? (
        <Text variant="body" color={theme.inkMuted} align="center" style={styles.description}>
          {description}
        </Text>
      ) : null}
      {children}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          variant="outline"
          disabled={actionDisabled}
          onPress={onAction}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['3xl'],
  },
  iconWell: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  description: {
    maxWidth: 320,
  },
  action: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
});
