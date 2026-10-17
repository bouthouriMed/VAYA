import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Icon, ScreenHeader, Text, radii, spacing, useAppTheme } from '@vaya/design-system';
import { LEGAL_UPDATE, formatLegalDate } from '@vaya/legal';
import { useAppSelector } from '../../src/state/store';

/**
 * Where the `legal_update` notification lands (Terms, article 20): the
 * current version, when it was published and when it applies, and what
 * changes in plain words — from @vaya/legal LEGAL_UPDATE, the same record
 * the website shows — with links to both full documents.
 */
export default function LegalUpdatesScreen(): React.JSX.Element {
  const { t } = useTranslation(['legal', 'common']);
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const locale = useAppSelector((s) => s.language.locale) || 'fr';
  const published = formatLegalDate(LEGAL_UPDATE.publishedOn, locale);
  const effective = formatLegalDate(LEGAL_UPDATE.effectiveOn, locale);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        topInset={insets.top}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
        backLabel={t('common:actions.back')}
        title={t('legal:updates.title')}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Text variant="h3" color={theme.ink} accessibilityRole="header">
            {t('legal:updates.heading', { version: LEGAL_UPDATE.version })}
          </Text>
          <Text variant="bodySmall" color={theme.inkFaint}>
            {t('legal:updates.dates', { published, effective })}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
          {LEGAL_UPDATE.summary[locale].map((point) => (
            <View key={point} style={styles.point}>
              <Icon name="ellipse" size="xs" color={theme.accent} />
              <Text variant="body" color={theme.ink} style={styles.pointText}>
                {point}
              </Text>
            </View>
          ))}
        </View>

        {LEGAL_UPDATE.important ? (
          <Text variant="bodySmall" color={theme.inkMuted}>
            {t('legal:updates.importantNote', { effective })}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button variant="outline" label={t('legal:updates.readTerms')} onPress={() => router.push('/legal/terms')} />
          <Button variant="outline" label={t('legal:updates.readPrivacy')} onPress={() => router.push('/legal/privacy')} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  head: {
    gap: spacing.xs,
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  pointText: {
    flex: 1,
  },
  actions: {
    gap: spacing.sm,
  },
});
