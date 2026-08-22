import { View, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Icon, Avatar, ReviewCard, useAppTheme, spacing, type ReviewCardData } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useGetUserPublicProfileQuery } from '../../src/state/api';

/**
 * Stitch's "Driver Reviews" — deliberately mock content. The backend keeps
 * a rating's free-text comment private to the trip's two parties
 * (docs/roadmap/phase-09-ratings-trust.md, ratings.service.ts's
 * `getUserTrustSummary`: "public-safe {tier, ratingAvg, tripCount,
 * punctualityScore} shape only — never raw comments"). There is no
 * endpoint that publicly lists a driver's individual reviews, and adding
 * one would reverse that documented privacy decision — not a call to make
 * unilaterally while reskinning a screen. The real aggregate (`ratingAvg`)
 * is still shown for real everywhere else (trust.tsx); only this
 * screen's individual review list is illustrative.
 */
const MOCK_REVIEWS: ReviewCardData[] = [
  {
    raterName: 'Emma L.',
    stars: 5,
    when: 'il y a 2 jours',
    comment: 'Trajet impeccable, très ponctuel. La voiture était impeccable et il m’a aidée avec mes bagages.',
  },
  {
    raterName: 'Karim T.',
    stars: 5,
    when: 'il y a 5 jours',
    comment: 'Voiture propre et conduite prudente. A bien géré le trafic. Je reprendrais volontiers ce trajet.',
  },
  {
    raterName: 'Sarah B.',
    stars: 4,
    when: 'il y a 1 semaine',
    comment: 'Bonne expérience dans l’ensemble. Conducteur un peu silencieux, mais trajet fluide et à l’heure.',
  },
];

export default function DriverReviewsScreen(): React.JSX.Element {
  const { driverUserId, driverName } = useLocalSearchParams<{ driverUserId?: string; driverName?: string }>();
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const firstName = (driverName ?? 'ce conducteur').split(' ')[0]!;
  const { data: profile } = useGetUserPublicProfileQuery(driverUserId ?? '', { skip: !driverUserId });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + spacing.sm, backgroundColor: theme.surface, borderBottomColor: theme.outlineVariant },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text variant="h3" color={theme.ink}>
          Vaya
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.titleBlock}>
        {profile ? (
          <Avatar uri={profile.avatarUrl} name={profile.fullName} sizePx={72} />
        ) : (
          <Icon name="chatbubbles-outline" size="lg" color={theme.inkFaint} />
        )}
        <Text variant="h2" color={theme.ink} align="center">
          {firstName}
        </Text>
        {profile?.driver ? (
          <View style={styles.ratingRow}>
            <Icon name="star" size="xs" color={theme.accent} />
            <Text variant="body" color={theme.inkMuted}>
              {profile.driver.ratingAvg.toFixed(1)}
            </Text>
          </View>
        ) : null}
      </View>

      <FlatList
        data={MOCK_REVIEWS}
        keyExtractor={(item, i) => `${item.raterName}-${i}`}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <ReviewCard review={item} theme={theme} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  separator: {
    height: spacing.md,
  },
});
