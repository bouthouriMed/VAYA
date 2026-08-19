import React from 'react';
import { I18nManager, Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { typography, colors } from '../tokens/index';

type TextVariant = 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'caption' | 'label';

interface TextComponentProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  children: React.ReactNode;
}

const variantStyles: Record<TextVariant, TextStyle> = {
  h1: {
    fontSize: typography.fontSize['4xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.fontSize['4xl'] * 1.2,
  },
  h2: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.fontSize['3xl'] * 1.2,
  },
  h3: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.fontSize['2xl'] * 1.2,
  },
  body: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.fontSize.md * 1.5,
  },
  bodySmall: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.fontSize.sm * 1.5,
  },
  caption: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.fontSize.xs * 1.5,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.fontSize.sm * 1.5,
  },
};

export function Text({
  variant = 'body',
  color = colors.gray900,
  align,
  style,
  children,
  ...props
}: TextComponentProps): React.JSX.Element {
  return (
    <RNText
      style={[
        variantStyles[variant],
        { color, textAlign: align, writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr' },
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
}
