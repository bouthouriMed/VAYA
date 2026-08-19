import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radii, typography } from '../tokens/index';
import { Avatar } from './Avatar';

export interface ReviewCardData {
  raterName: string;
  stars: number;
  comment: string;
  when: string;
}

interface ReviewCardProps {
  review: ReviewCardData;
}

export function ReviewCard({ review }: ReviewCardProps): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar name={review.raterName} size="sm" />
        <View style={styles.headerText}>
          <Text style={styles.name}>{review.raterName}</Text>
          <Text style={styles.when}>{review.when}</Text>
        </View>
        <View style={styles.stars}>
          {Array.from({ length: 5 }, (_, i) => (
            <Text key={i} style={[styles.star, i < review.stars && styles.starFilled]}>
              ★
            </Text>
          ))}
        </View>
      </View>
      <Text style={styles.comment}>{review.comment}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.xs,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
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
    color: colors.gray900,
  },
  when: {
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
  },
  stars: {
    flexDirection: 'row',
  },
  star: {
    fontSize: 12,
    color: colors.gray300,
  },
  starFilled: {
    color: colors.secondary,
  },
  comment: {
    fontSize: typography.fontSize.sm,
    color: colors.gray700,
    lineHeight: 19,
  },
});
