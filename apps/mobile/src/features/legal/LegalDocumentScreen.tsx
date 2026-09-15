import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, spacing, useAppTheme } from '@vaya/design-system';
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
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + spacing.sm, borderBottomColor: theme.outlineVariant },
        ]}
      >
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.back')}
        >
          <Ionicons name="chevron-back" size={24} color={theme.ink} />
        </TouchableOpacity>
        <Text variant="headlineDisplay" color={theme.ink} numberOfLines={1} style={styles.headerTitle}>
          {screenTitle}
        </Text>
        <View style={styles.backBtn} />
      </View>

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
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
  },
  paragraph: {
    marginBottom: spacing.sm,
    lineHeight: 21,
  },
});
