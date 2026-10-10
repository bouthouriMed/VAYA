import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  BottomSheet,
  Button,
  PhoneInput,
  Text,
  spacing,
  toTunisianE164,
  useAppTheme,
  useToast,
  haptics,
} from '@vaya/design-system';
import { useUpdateMeMutation } from '../../state/api';
import type { ContactPhoneContext } from './useContactPhonePrompt';

interface ContactPhoneSheetProps {
  visible: boolean;
  context: ContactPhoneContext;
  /** Pre-fills the field (editing an existing contact number from profile). */
  initialPhone?: string | null;
  /** Runs after a successful save and after "Plus tard" — the flow that
   *  opened the sheet always continues. */
  onDone: () => void;
}

/**
 * One field, two buttons: the frictionless "how can they reach you?" step
 * shown before publishing a ride or requesting a seat. No OTP (no SMS
 * provider is live yet) — the number is saved as the user's self-declared
 * contact phone and only ever revealed to an accepted counterpart.
 */
export function ContactPhoneSheet({
  visible,
  context,
  initialPhone,
  onDone,
}: ContactPhoneSheetProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const { t } = useTranslation('common');
  const toast = useToast();
  const [updateMe, { isLoading }] = useUpdateMeMutation();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (visible) {
      setValue(initialPhone ? initialPhone.replace(/^\+216/, '') : '');
      setError(undefined);
    }
  }, [visible, initialPhone]);

  const phone = toTunisianE164(value);

  async function save(): Promise<void> {
    if (!phone) {
      setError(t('contactPhone.invalid'));
      return;
    }
    setError(undefined);
    try {
      await updateMe({ contactPhone: phone }).unwrap();
      haptics.success();
      toast({ message: t('contactPhone.saved'), tone: 'success' });
      onDone();
    } catch {
      haptics.error();
      setError(t('contactPhone.saveFailed'));
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onDone}
      title={
        context === 'publishing'
          ? t('contactPhone.publishingTitle')
          : context === 'booking'
            ? t('contactPhone.bookingTitle')
            : t('contactPhone.profileTitle')
      }
      heightRatio={0.46}
      theme={theme}
    >
      <View style={styles.body}>
        <Text variant="bodySmall" color={theme.inkMuted}>
          {t('contactPhone.description')}
        </Text>
        <PhoneInput
          value={value}
          onChangeText={(next) => {
            setValue(next);
            if (error) setError(undefined);
          }}
          error={error}
          placeholder={t('contactPhone.placeholder')}
          accessibilityLabel={t('contactPhone.label')}
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          autoFocus
        />
        <Button
          size="lg"
          label={context === 'profile' ? t('actions.save') : t('contactPhone.saveAndContinue')}
          onPress={() => void save()}
          disabled={!phone || isLoading}
          loading={isLoading}
        />
        <Button
          variant="ghost"
          label={context === 'profile' ? t('actions.cancel') : t('actions.later')}
          onPress={onDone}
          disabled={isLoading}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
});
