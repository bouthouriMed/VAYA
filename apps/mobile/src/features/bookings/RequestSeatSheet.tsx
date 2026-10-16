import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { REQUEST_MESSAGE_MAX_LENGTH } from '@vaya/domain';
import { Avatar, BottomSheet, Button, Chip, Icon, Input, Text, radii, spacing, useAppTheme } from '@vaya/design-system';

interface RequestSeatSheetProps {
  visible: boolean;
  driverName: string;
  driverAvatarUrl: string | null;
  /** "Ariana → Sousse · demain à 08:00" — the passenger's own leg. */
  legLabel: string;
  /** "9 DT" — what this passenger pays. */
  priceLabel: string;
  onClose: () => void;
  /** `message` is undefined when the field was left empty. */
  onSubmit: (message: string | undefined) => void;
}

/** One-tap openers for the questions passengers actually ask a driver. */
const SUGGESTION_KEYS = ['luggage', 'flexible', 'meetingPoint'] as const;

/**
 * The last step before a seat request leaves: who it goes to, the leg and
 * the price, and room for one message ("J'ai une valise, ça passe ?").
 * Writing is optional — the same button sends with or without it. Until the
 * driver accepts, the passenger can write again only after the driver
 * replies (server-enforced, @vaya/domain resolveMessageTurn), so the sheet
 * says so up front instead of letting it be discovered later.
 */
export function RequestSeatSheet({
  visible,
  driverName,
  driverAvatarUrl,
  legLabel,
  priceLabel,
  onClose,
  onSubmit,
}: RequestSeatSheetProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const { t } = useTranslation('search');
  const [message, setMessage] = useState('');
  const firstName = driverName.split(' ')[0] ?? driverName;

  useEffect(() => {
    if (visible) setMessage('');
  }, [visible]);

  function addSuggestion(text: string): void {
    setMessage((current) => {
      const next = current.trim() ? `${current.trim()} ${text}` : text;
      return next.slice(0, REQUEST_MESSAGE_MAX_LENGTH);
    });
  }

  const trimmed = message.trim();
  const nearLimit = message.length > REQUEST_MESSAGE_MAX_LENGTH - 80;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('requestSheet.title')} heightRatio={0.78} theme={theme}>
      <View style={styles.body}>
        <View style={[styles.summary, { backgroundColor: theme.surfaceMuted }]}>
          <Avatar uri={driverAvatarUrl} name={driverName} size="md" />
          <View style={styles.summaryText}>
            <Text variant="label" color={theme.ink} numberOfLines={1}>
              {firstName}
            </Text>
            <Text variant="caption" color={theme.inkMuted} numberOfLines={2}>
              {legLabel}
            </Text>
          </View>
          <Text variant="title" color={theme.ink}>
            {priceLabel}
          </Text>
        </View>

        <View style={styles.messageBlock}>
          <Text variant="label" color={theme.ink}>
            {t('requestSheet.messageLabel', { name: firstName })}
          </Text>
          <View style={styles.chips}>
            {SUGGESTION_KEYS.map((key) => (
              <Chip
                key={key}
                selected={false}
                icon={<Icon name="add" size="xs" color={theme.inkMuted} />}
                label={t(`requestSheet.suggestion.${key}.chip`)}
                onPress={() => addSuggestion(t(`requestSheet.suggestion.${key}.text`))}
              />
            ))}
          </View>
          <Input
            value={message}
            onChangeText={setMessage}
            placeholder={t('requestSheet.messagePlaceholder')}
            accessibilityLabel={t('requestSheet.messageLabel', { name: firstName })}
            multiline
            maxLength={REQUEST_MESSAGE_MAX_LENGTH}
            textAlignVertical="top"
            style={styles.input}
            helperText={nearLimit ? `${message.length}/${REQUEST_MESSAGE_MAX_LENGTH}` : undefined}
          />
          <View style={styles.hint}>
            <Icon name="chatbubbles-outline" size="xs" color={theme.inkFaint} />
            <Text variant="caption" color={theme.inkFaint} style={styles.hintText}>
              {t('requestSheet.turnHint', { name: firstName })}
            </Text>
          </View>
        </View>

        <Button
          size="lg"
          icon="paper-plane-outline"
          label={t('requestSheet.send')}
          onPress={() => onSubmit(trimmed ? trimmed : undefined)}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.lg,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
  messageBlock: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  input: {
    minHeight: 96,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  hintText: {
    flex: 1,
  },
});
