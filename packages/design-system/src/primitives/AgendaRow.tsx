import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { spacing, radii } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import type { AppPalette } from '../theme/palette';

export type AgendaTone = 'default' | 'success' | 'warning' | 'error' | 'info';

interface AgendaRowProps {
  /** Left column, read first: a 24-hour clock time ("08:00"). */
  time?: string;
  /** Under the time: arrival ("→ 10:05") or the day ("sam. 18"). */
  timeDetail?: string;
  /** Instead of a time: a tinted icon tile (a to-do row). */
  icon?: IconName;
  title: string;
  /** One status line, with a dot in the status tone. */
  status?: string;
  statusTone?: AgendaTone;
  /** "Conducteur" / "Passager" — only for people who do both. */
  roleLabel?: string;
  /** Solid chip for driving, soft for riding. */
  roleSolid?: boolean;
  /** Right-aligned value (a price). Ignored when there is an action. */
  trailing?: string;
  /** Under the value ("/ place"). */
  trailingDetail?: string;
  /** An action inside the row — only for something that really waits on
   *  this person. */
  actionLabel?: string;
  onAction?: () => void;
  /** Tints the row: something needs this person. */
  highlighted?: boolean;
  /** A finished trip. */
  dimmed?: boolean;
  /** Hairline above the row (rows stacked inside an AgendaGroup). */
  divider?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
  theme?: AppPalette;
}

function dotColor(tone: AgendaTone, theme: AppPalette): string {
  switch (tone) {
    case 'success':
      return theme.accent;
    case 'warning':
      return theme.warning;
    case 'error':
      return theme.error;
    case 'info':
      return theme.info;
    default:
      return theme.inkFaint;
  }
}

/** Rows that belong together (one day, one month) on one surface. */
export function AgendaGroup({
  children,
  theme: themeOverride,
}: {
  children: React.ReactNode;
  theme?: AppPalette;
}): React.JSX.Element {
  const { colors } = useAppTheme();
  const theme = themeOverride ?? colors;
  return (
    <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>{children}</View>
  );
}

/**
 * One trip, read left to right: when, where, as who, and what state it's
 * in — time in a fixed column so a list scans like a calendar, one status
 * line with a dot instead of a separate badge so every row keeps one
 * height. The highlighted variant carries its action inline.
 */
export function AgendaRow({
  time,
  timeDetail,
  icon,
  title,
  status,
  statusTone = 'default',
  roleLabel,
  roleSolid = false,
  trailing,
  trailingDetail,
  actionLabel,
  onAction,
  highlighted = false,
  dimmed = false,
  divider = false,
  onPress,
  accessibilityLabel,
  theme: themeOverride,
}: AgendaRowProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const theme = themeOverride ?? colors;
  const hasAction = Boolean(actionLabel && onAction);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.6}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      testID="agenda-row"
      style={[
        styles.row,
        highlighted && { backgroundColor: theme.warningMuted },
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.outline },
      ]}
    >
      <View style={[styles.inner, dimmed && styles.dimmed]}>
        {icon ? (
          <View
            style={[styles.iconTile, { backgroundColor: highlighted ? theme.surface : theme.warningMuted }]}
          >
            <Icon name={icon} size="sm" color={theme.warning} />
          </View>
        ) : (
          <View style={styles.timeCol}>
            {time ? (
              <Text variant="label" color={theme.ink} style={styles.time}>
                {time}
              </Text>
            ) : null}
            {timeDetail ? (
              <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
                {timeDetail}
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.body}>
          <Text variant="label" color={theme.ink} numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {status || roleLabel ? (
            <View style={styles.statusLine}>
              {roleLabel ? (
                <View
                  style={[styles.role, { backgroundColor: roleSolid ? theme.ink : theme.surfaceMuted }]}
                  testID="agenda-role"
                >
                  <Text variant="caption" color={roleSolid ? theme.onInk : theme.ink} style={styles.roleText}>
                    {roleLabel}
                  </Text>
                </View>
              ) : null}
              {status ? (
                <>
                  <View testID="agenda-status-dot" style={[styles.dot, { backgroundColor: dotColor(statusTone, theme) }]} />
                  <Text variant="caption" color={theme.inkMuted} numberOfLines={2} style={styles.statusText}>
                    {status}
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        {hasAction ? (
          <TouchableOpacity
            onPress={onAction}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel} — ${title}`}
            style={[styles.action, { backgroundColor: theme.ink }]}
          >
            <Text variant="caption" color={theme.onInk} style={styles.actionText}>
              {actionLabel}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.end}>
            {trailing ? (
              <View style={styles.trailing}>
                <Text variant="label" color={theme.ink} numberOfLines={1}>
                  {trailing}
                </Text>
                {trailingDetail ? (
                  <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
                    {trailingDetail}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {onPress ? <Icon name="chevron-forward" size="xs" color={theme.inkFaint} /> : null}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dimmed: {
    opacity: 0.6,
  },
  timeCol: {
    width: 52,
  },
  time: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontWeight: '600',
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    minWidth: 0,
  },
  role: {
    marginTop: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  roleText: {
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  statusText: {
    flexShrink: 1,
  },
  trailing: {
    alignItems: 'flex-end',
  },
  end: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  action: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  actionText: {
    fontWeight: '700',
  },
});
