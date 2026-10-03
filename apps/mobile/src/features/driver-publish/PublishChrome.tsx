import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ScreenHeader, type Icon } from '@vaya/design-system';
import { publishStyles } from './publishStyles';

export function StepHeader({ title, onBack }: { title: string; onBack: () => void }): React.JSX.Element {
  const { t } = useTranslation('common');
  return (
    <ScreenHeader
      transparent
      bordered={false}
      onBack={onBack}
      backLabel={t('actions.back')}
      title={title}
      style={publishStyles.stepHeader}
    />
  );
}

/** Thin adapters over the design-system Button so every wizard CTA shares
 *  the app's one primary/ghost look and one disabled style. */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Icon>['name'];
}): React.JSX.Element {
  return (
    <Button
      size="lg"
      label={label}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      trailingIcon={icon}
      style={publishStyles.fullWidth}
    />
  );
}

export function GhostButton({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  return <Button variant="ghost" label={label} onPress={onPress} style={publishStyles.fullWidth} />;
}
