import React from 'react';
import { View, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import { spacing } from '../tokens/index';

type GapToken = keyof typeof spacing;

interface StackProps {
  children: React.ReactNode;
  gap?: GapToken;
  align?: ViewStyle['alignItems'];
  style?: ViewStyle;
}

export function Stack({
  children,
  gap = 'md',
  align = 'stretch',
  style,
}: StackProps): React.JSX.Element {
  return (
    <View style={[styles.stack, { gap: spacing[gap], alignItems: align }, style]}>{children}</View>
  );
}

interface RowProps {
  children: React.ReactNode;
  gap?: GapToken;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  style?: ViewStyle;
}

export function Row({
  children,
  gap = 'md',
  align = 'center',
  justify = 'flex-start',
  style,
}: RowProps): React.JSX.Element {
  return (
    <View
      style={[styles.row, { gap: spacing[gap], alignItems: align, justifyContent: justify }, style]}
    >
      {children}
    </View>
  );
}

interface ScreenProps {
  children: React.ReactNode;
  padding?: GapToken;
  style?: ViewStyle;
}

export function Screen({ children, padding = 'lg', style }: ScreenProps): React.JSX.Element {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[{ padding: spacing[padding], flexGrow: 1 }, style]}
    >
      {children}
    </ScrollView>
  );
}

interface ContainerProps {
  children: React.ReactNode;
  maxWidth?: number;
  style?: ViewStyle;
}

export function Container({ children, maxWidth = 480, style }: ContainerProps): React.JSX.Element {
  return <View style={[styles.container, { maxWidth }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  stack: {
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
  },
  screen: {
    flex: 1,
  },
  container: {
    alignSelf: 'center',
    width: '100%',
  },
});
