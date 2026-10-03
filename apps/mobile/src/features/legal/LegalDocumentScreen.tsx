import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, spacing, useAppTheme, ScreenHeader } from '@vaya/design-system';
import { TERMS_CONTENT, PRIVACY_CONTENT } from '@vaya/legal';
import { useAppSelector } from '../../state/store';

interface Props {
  doc: 'terms' | 'privacy';
}

/** Real Terms & Conditions / Privacy Policy content, replacing the
 *  unlinked disclaimer string that used to be the only trace of either
 *  document anywhere in the app. French is the governing text (see
 *  `docs/legal/README.md`); this screen renders whichever locale the
 *  Member has selected. */
export function LegalDocumentScreen({ doc }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const locale = useAppSelector((s) => s.language.locale) || 'fr';

  const content = (doc === 'terms' ? TERMS_CONTENT : PRIVACY_CONTENT)[locale];
  const screenTitle =
    doc === 'terms' ? t('legal:screen.termsTitle') : t('legal:screen.privacyTitle');

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        topInset={insets.top}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
        backLabel={t('common:actions.back')}
        title={screenTitle}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="bodySmall" color={theme.inkFaint} style={styles.version}>
          {content.effectiveDateLabel}
        </Text>
        <Text variant="caption" color={theme.inkFaint} style={styles.languageNote}>
          {content.languageNote}
        </Text>

        {content.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text variant="label" color={theme.ink} style={styles.sectionHeading}>
              {section.heading}
            </Text>
            {section.body.map((paragraph, i) => (
              <Text
                key={i}
                variant="body"
                color={theme.inkMuted}
                style={styles.paragraph}
              >
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
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
  },
  version: {
    marginBottom: spacing.xs,
  },
  languageNote: {
    marginBottom: spacing.lg,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeading: {
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  paragraph: {
    marginBottom: spacing.sm,
    lineHeight: 21,
  },
});
