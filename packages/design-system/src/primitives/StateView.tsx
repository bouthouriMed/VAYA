import React from 'react';
import { View, StyleSheet } from 'react-native';
import { EmptyState } from './EmptyState';
import { SkeletonBlock, SkeletonCircle, SkeletonText } from './Skeleton';
import { type IconName } from './Icon';
import { spacing, radii } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';

export type StateViewStatus = 'loading' | 'empty' | 'error';

/** What the loading skeleton should look like — match the content that will replace it. */
export type StateViewSkeleton = 'list' | 'cards' | 'detail';

interface StateViewProps {
  status: StateViewStatus;
  skeleton?: StateViewSkeleton;
  /** Empty: what's missing. Error: what failed ("Impossible de charger vos trajets"). */
  title?: string;
  description?: string;
  iconName?: IconName;
  /** Error: "Réessayer". Empty: the next useful action. */
  actionLabel?: string;
  onAction?: () => void;
}

function ListSkeleton(): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  return (
    <View style={styles.stack}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
          <SkeletonCircle size={44} />
          <View style={styles.rowText}>
            <SkeletonText variant="label" width="55%" />
            <SkeletonText variant="bodySmall" width="85%" />
          </View>
        </View>
      ))}
    </View>
  );
}

function CardsSkeleton(): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  return (
    <View style={styles.stack}>
      {[0, 1].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
          <SkeletonBlock height={120} radius="lg" />
          <SkeletonText variant="h3" width="60%" />
          <SkeletonText variant="bodySmall" width="40%" />
        </View>
      ))}
    </View>
  );
}

function DetailSkeleton(): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  return (
    <View style={styles.stack}>
      <SkeletonBlock height={180} radius="xl" />
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
        <SkeletonText variant="h3" width="70%" />
        <SkeletonText variant="bodySmall" width="35%" />
        <SkeletonText variant="body" width="90%" />
        <SkeletonText variant="body" width="80%" />
      </View>
      <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
        <SkeletonCircle size={48} />
        <View style={styles.rowText}>
          <SkeletonText variant="label" width="45%" />
          <SkeletonText variant="bodySmall" width="30%" />
        </View>
      </View>
    </View>
  );
}

/**
 * The one way a screen shows "not ready yet", "nothing here" or "that
 * failed". Loading renders a skeleton shaped like the content it stands in
 * for; error always says so and always offers a retry — an error must never
 * be rendered as an empty state, which would tell the user something false.
 */
export function StateView({
  status,
  skeleton = 'list',
  title,
  description,
  iconName,
  actionLabel,
  onAction,
}: StateViewProps): React.JSX.Element {
  if (status === 'loading') {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel={title} style={styles.loading}>
        {skeleton === 'cards' ? <CardsSkeleton /> : skeleton === 'detail' ? <DetailSkeleton /> : <ListSkeleton />}
      </View>
    );
  }
  return (
    <EmptyState
      tone={status === 'error' ? 'error' : 'neutral'}
      iconName={iconName ?? (status === 'error' ? 'cloud-offline-outline' : 'file-tray-outline')}
      title={title ?? ''}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    padding: spacing.lg,
  },
  stack: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  rowText: {
    flex: 1,
    gap: spacing.sm,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
  },
});
