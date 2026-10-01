import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, radii, typography } from '../tokens/index';
import { Avatar } from './Avatar';
import type { AppPalette } from '../theme/palette';
import { useAppTheme } from '../theme/AppThemeProvider';

export interface ReviewCardData {
  raterName: string;
  stars: number;
  comment: string;
  when: string;
}

interface ReviewCardProps {
  review: ReviewCardData;
  /** Optional `useAppTheme()` colors — unused (and defaulting to the
   *  legacy static tokens) anywhere this card hasn't been migrated yet. */
  theme?: AppPalette;
}

export function ReviewCard({ review, theme: themeOverride }: ReviewCardProps): React.JSX.Element {
  const { colors: contextTheme } = useAppTheme();
  const theme = themeOverride ?? contextTheme;
  const cardBg = theme.surface;
  const nameColor = theme.ink;
  const whenColor = theme.inkFaint;
  const starEmpty = theme.inkFaint;
  const starFilled = theme.accent;
  const commentColor = theme.inkMuted;
  const borderColor = theme.outlineVariant;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: cardBg, borderWidth: 1, borderColor },
      ]}
      accessible
      accessibilityLabel={`${review.raterName}, ${review.stars} sur 5 étoiles, ${review.when}. ${review.comment}`}
    >
      <View style={styles.header}>
        <Avatar name={review.raterName} size="sm" />
        <View style={styles.headerText}>
          <Text style={[styles.name, { color: nameColor }]}>{review.raterName}</Text>
          <Text style={[styles.when, { color: whenColor }]}>{review.when}</Text>
        </View>
        <View
          style={styles.stars}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Text key={i} style={[styles.star, { color: i < review.stars ? starFilled : starEmpty }]}>
              ★
            </Text>
          ))}
        </View>
      </View>
      <Text style={[styles.comment, { color: commentColor }]}>{review.comment}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  when: {
    fontSize: typography.fontSize.xs,
  },
  stars: {
    flexDirection: 'row',
  },
  star: {
    fontSize: 12,
  },
  comment: {
    fontSize: typography.fontSize.sm,
    lineHeight: 19,
  },
});
