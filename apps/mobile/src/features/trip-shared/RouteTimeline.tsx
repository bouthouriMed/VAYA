import { View, StyleSheet } from 'react-native';
import { Text, useAppTheme, spacing } from '@vaya/design-system';

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

export interface RouteTimelineEntry {
  key: string;
  roleLabel: string;
  placeLabel: string;
  isEndpoint: boolean;
}

/**
 * The origin -> stops -> destination timeline, shared verbatim between the
 * passenger's booking hub (bookings/[bookingId].tsx) and the driver's ride
 * hub (driver/rides/[rideId].tsx) — originally two hand-rolled copies that
 * could (and did) drift: the passenger side showed only a flat pickup label
 * with no role terminology, while the driver side already said "Point de
 * rendez-vous"/"Point de dépose". One implementation now guarantees both
 * sides use the same labels and the same visual language for the same real
 * concept, instead of relying on two edits staying in sync by convention.
 */
export function RouteTimeline({
  entries,
  theme,
}: {
  entries: RouteTimelineEntry[];
  theme: ThemeColors;
}): React.JSX.Element {
  return (
    <View style={styles.timeline}>
      {entries.map((entry, index) => {
        const isFirst = index === 0;
        const isLast = index === entries.length - 1;
        return (
          <View
            key={entry.key}
            style={!isLast && [styles.stopRow, { borderBottomColor: theme.outlineVariant }]}
          >
            <View style={styles.stopRowHeader}>
              <View
                style={[
                  styles.stopDot,
                  entry.isEndpoint
                    ? { backgroundColor: isFirst ? theme.accent : theme.ink, borderColor: theme.surface }
                    : { backgroundColor: theme.surfaceMuted, borderColor: theme.ink },
                ]}
              />
              <Text variant="caption" color={theme.inkFaint}>
                {entry.roleLabel}
              </Text>
            </View>
            <Text variant="bodySmall" color={theme.ink} style={styles.stopLabel} numberOfLines={2}>
              {entry.placeLabel}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  stopRow: {
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  stopRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  stopLabel: {
    marginLeft: spacing.md + spacing.xs,
  },
});
