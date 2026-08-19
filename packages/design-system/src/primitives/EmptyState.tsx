import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { colors, spacing } from '../tokens/index';

interface EmptyStateProps {
  /** Usually an <Icon/> or a small illustration — decorative, so it's
   *  hidden from screen readers; the title/description carry the meaning. */
  icon?: React.ReactNode;
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
 * A dead end should turn into a next action, not a shrug. Generalizes the
 * pattern first proven in search/results.tsx (fallback corridor search +
 * "notify me" CTA) so every future empty state gets the same discipline
 * instead of improvising a plain text string.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled,
  children,
}: EmptyStateProps): React.JSX.Element {
  return (
    <View style={styles.container} accessible accessibilityRole="text">
      {icon ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {icon}
        </View>
      ) : null}
      <Text variant="h3" align="center" style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text variant="body" color={colors.gray600} align="center" style={styles.description}>
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
    padding: spacing.xl,
  },
  title: {
    marginTop: spacing.xs,
  },
  description: {
    marginBottom: spacing.xs,
  },
  action: {
    marginTop: spacing.md,
    width: '100%',
  },
});
