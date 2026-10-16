import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from './Text';
import { spacing } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import { haptics } from '../utils/haptics';
import type { AppPalette } from '../theme/palette';

export interface SegmentedTab<K extends string> {
  key: K;
  label: string;
  /** Shown after the label ("À venir · 3"). */
  count?: number;
}

interface SegmentedTabsProps<K extends string> {
  tabs: SegmentedTab<K>[];
  value: K;
  onChange: (key: K) => void;
  theme?: AppPalette;
}

/** Underlined text tabs that switch what a list below shows. */
export function SegmentedTabs<K extends string>({
  tabs,
  value,
  onChange,
  theme: themeOverride,
}: SegmentedTabsProps<K>): React.JSX.Element {
  const { colors } = useAppTheme();
  const theme = themeOverride ?? colors;

  return (
    <View accessibilityRole="tablist" style={[styles.bar, { borderBottomColor: theme.outlineVariant }]}>
      {tabs.map((tab) => {
        const selected = tab.key === value;
        const label = tab.count != null ? `${tab.label} · ${tab.count}` : tab.label;
        return (
          <TouchableOpacity
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            testID={`tab-${tab.key}`}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(tab.key);
            }}
            style={[styles.tab, selected && { borderBottomColor: theme.ink }]}
          >
            <Text
              variant="body"
              color={selected ? theme.ink : theme.inkMuted}
              style={selected ? styles.selectedLabel : undefined}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -StyleSheet.hairlineWidth,
  },
  selectedLabel: {
    fontWeight: '700',
  },
});
