import { useMemo, useState } from 'react';
import { SectionList, View, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAppSelector } from '../../src/state/store';
import { useContextualAuth } from '../../src/features/auth/useContextualAuth';
import { ContextualAuthSheet } from '../../src/features/auth/ContextualAuthSheet';
import {
  Text,
  Avatar,
  Button,
  Icon,
  EmptyState,
  SkeletonBlock,
  useAppTheme,
  haptics,
  spacing,
  radii,
  elevation,
  type AppPalette,
} from '@vaya/design-system';
import { useListConversationsQuery } from '../../src/state/api';
import {
  filterConversations,
  formatDepartureLabel,
  formatInboxTimestamp,
  getConversationState,
  groupConversationsByDay,
  roleLabel,
  searchConversations,
  type InboxConversation,
  type InboxFilter,
} from '../../src/features/conversations/inboxHelpers';

/** Full-screen wash shared by every render path (guest, loading, error,
 *  populated) — a flat theme.background fill read as generic/basic; this
 *  layers the theme's own backgroundGradient (a two-stop vignette, not a
 *  parallel palette) plus one soft ambient accent glow behind the header,
 *  the same depth-through-gradient-and-light treatment the rest of the
 *  Stitch-rebuilt flow already earns on its hero surfaces. */
function ScreenBackground({
  theme,
  children,
}: {
  theme: AppPalette;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={theme.backgroundGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={[styles.ambientGlow, { backgroundColor: theme.accentGlow }]} />
      <SafeAreaView style={styles.container} edges={['top']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

/** Local rounded-full filter pill — deliberately not the shared `Chip`
 *  primitive: Chip's selected state is a fixed solid-accent fill (the
 *  right call for its other callers), while this row's own design
 *  reference (stitch/message/inbox-trip-centric-overview.html) calls for a
 *  solid near-black active pill instead. `theme.inkGradient` gives that
 *  black real depth (a diagonal charcoal wash, not a flat #000) rather
 *  than diluting the brand palette with literal black. */
function FilterPill({
  label,
  selected,
  onPress,
  theme,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: AppPalette;
}): React.JSX.Element {
  if (selected) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: true }}
        style={styles.filterPillWrap}
      >
        <LinearGradient
          colors={theme.inkGradient}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.filterPill, elevation?.sm, { shadowColor: theme.ink }]}
        >
          <Text variant="label" color={theme.onInk} style={styles.filterPillText}>
            {label}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: false }}
      style={[
        styles.filterPill,
        { backgroundColor: theme.surfaceMuted, borderWidth: 1, borderColor: theme.outlineVariant },
      ]}
    >
      <Text variant="label" color={theme.inkMuted} style={styles.filterPillText}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * Top app bar shared by every render path (guest, loading, error, inbox).
 */
function InboxHeader({
  theme,
  searchOpen,
  onToggleSearch,
}: {
  theme: ReturnType<typeof useAppTheme>['colors'];
  searchOpen?: boolean;
  onToggleSearch?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <View style={styles.headerSlot} />
      <Text
        variant="headlineDisplay"
        color={theme.ink}
        numberOfLines={1}
        style={styles.headerTitle}
      >
        {t('messages:title')}
      </Text>
      {onToggleSearch ? (
        <TouchableOpacity
          onPress={onToggleSearch}
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? t('messages:searchClose') : t('messages:searchAria')}
          style={[
            styles.headerSlot,
            styles.headerIconBtn,
            { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
            elevation?.sm,
            { shadowColor: theme.ink },
          ]}
        >
          <Icon
            name={searchOpen ? 'close-outline' : 'search-outline'}
            size="sm"
            color={theme.ink}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.headerSlot} />
      )}
    </View>
  );
}

/** Stitch's "Inbox / trip-centric overview" — one thread per booking, the
 *  other party + trip context enriched server-side (GET /conversations), so
 *  the inbox is a real index over real conversations and never guesses
 *  read state or message counts that don't exist yet. */
export default function MessagesScreen(): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const { t } = useTranslation(['messages', 'booking', 'common']);
  const locale = useAppSelector((s) => s.language.locale) || 'en';
  const accessToken = useAppSelector((s) => s.auth.accessToken);

  const FILTERS: { key: InboxFilter; label: string }[] = [
    { key: 'all', label: t('booking:filters.all') },
    { key: 'upcoming', label: t('booking:filters.upcoming') },
    { key: 'active', label: t('booking:filters.active') },
    { key: 'past', label: t('booking:filters.past') },
  ];

  const [filter, setFilter] = useState<InboxFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: conversations, isLoading, isError, refetch } = useListConversationsQuery(undefined, {
    skip: !accessToken,
  });
  const { requireAuth, isAuthSheetVisible, authTrigger, handleAuthenticated, cancelAuth } =
    useContextualAuth();

  const sections = useMemo(() => {
    const filtered = searchConversations(
      filterConversations(conversations ?? [], filter),
      searchQuery,
    );
    return groupConversationsByDay(filtered, t).map((section) => ({
      title: section.label,
      data: section.conversations,
    }));
  }, [conversations, filter, searchQuery]);

  function toggleSearch(): void {
    setSearchOpen((open) => {
      if (open) setSearchQuery('');
      return !open;
    });
  }

  function openConversation(conversation: InboxConversation): void {
    void router.push(`/conversations/${conversation.bookingId}`);
  }

  async function handleRefresh(): Promise<void> {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }

  // Messaging is booking-scoped and identity-scoped end to end — nothing
  // here exists for a guest, but browsing this tab is still allowed
  // (per the guest-browsing model). A friendly EmptyState replaces the
  // real inbox instead of a hard redirect; its CTA opens the same
  // ContextualAuthSheet search/publish already use, not a separate screen.
  if (!accessToken) {
    return (
      <ScreenBackground theme={theme}>
        <InboxHeader theme={theme} />
        <EmptyState
          icon={<Icon name="chatbubble-ellipses-outline" size="lg" color={theme.inkFaint} />}
          title={t('messages:guestEmpty.title')}
          description={t('messages:guestEmpty.description')}
          actionLabel={t('messages:guestEmpty.cta')}
          onAction={() => requireAuth(() => {}, 'messages')}
        />

        <ContextualAuthSheet
          visible={isAuthSheetVisible}
          trigger={authTrigger}
          onClose={cancelAuth}
          onAuthenticated={handleAuthenticated}
        />
      </ScreenBackground>
    );
  }

  if (isLoading) {
    return (
      <ScreenBackground theme={theme}>
        <InboxHeader theme={theme} />
        <View style={styles.skeletonWrap}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} height={92} radius="xl" />
          ))}
        </View>
      </ScreenBackground>
    );
  }

  if (isError) {
    return (
      <ScreenBackground theme={theme}>
        <InboxHeader theme={theme} />
        <EmptyState
          icon={<Icon name="cloud-offline-outline" size="lg" color={theme.inkFaint} />}
          title={t('messages:error.title')}
          description={t('messages:error.description')}
          actionLabel={t('common:actions.retry')}
          onAction={() => void refetch()}
        />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground theme={theme}>
      <InboxHeader theme={theme} searchOpen={searchOpen} onToggleSearch={toggleSearch} />

      {searchOpen ? (
        <View style={styles.searchWrap}>
          <View
            style={[
              styles.searchField,
              { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
              elevation?.sm,
              { shadowColor: theme.ink },
            ]}
          >
            <Icon name="search" size="sm" color={theme.inkMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('messages:searchPlaceholder')}
              placeholderTextColor={theme.inkFaint}
              style={[styles.searchInput, { color: theme.ink }]}
              autoFocus
              returnKeyType="search"
              accessibilityLabel={t('messages:searchAria')}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('messages:searchClear')}
              >
                <Icon name="close-circle" size="sm" color={theme.inkFaint} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {(conversations?.length ?? 0) > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map(({ key, label }) => (
            <FilterPill
              key={key}
              label={label}
              onPress={() => {
                haptics.selection();
                setFilter(key);
              }}
              selected={filter === key}
              theme={theme}
            />
          ))}
        </ScrollView>
      ) : null}

      <SectionList
        style={styles.list}
        sections={sections}
        keyExtractor={(conversation) => conversation.id}
        onRefresh={() => void handleRefresh()}
        refreshing={isRefreshing}
        contentContainerStyle={sections.length === 0 ? styles.listEmpty : styles.listContent}
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeaderWrap, { backgroundColor: theme.background }]}>
            <Text variant="label" color={theme.inkFaint} style={styles.sectionHeader}>
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const timestamp = formatInboxTimestamp(item.lastMessage?.createdAt ?? item.updatedAt, new Date(), locale);
          const preview =
            item.lastMessage?.body ??
            (item.status === 'closed' ? t('messages:conversationClosed') : t('messages:noMessages'));
          const state = getConversationState(item);
          const isActive = state === 'active';
          const isClosed = state === 'past';
          const departureLabel = isClosed ? null : formatDepartureLabel(item.departureAt, t);
          return (
            <TouchableOpacity
              style={[
                styles.card,
                { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
                elevation?.sm,
                { shadowColor: theme.ink },
                isClosed && styles.cardClosed,
              ]}
              onPress={() => {
                haptics.selection();
                openConversation(item);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t('messages:conversationWith')} ${item.otherParty.fullName}, ${item.originLabel} → ${item.destinationLabel}${isActive ? `, ${t('messages:tripInProgress')}` : ''}`}
            >
              <View style={styles.unreadDotSlot}>
                {item.hasUnread ? (
                  <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />
                ) : null}
              </View>

              <Avatar
                uri={item.otherParty.avatarUrl}
                name={item.otherParty.fullName}
                sizePx={48}
                fallbackBackgroundColor={theme.surfaceMuted}
                fallbackTextColor={theme.ink}
              />

              <View style={styles.rowBody}>
                <View style={styles.nameRow}>
                  <Text
                    variant="body"
                    color={theme.ink}
                    numberOfLines={1}
                    style={[styles.name, item.hasUnread && styles.nameUnread]}
                  >
                    {item.otherParty.fullName}
                  </Text>
                  <Text
                    variant="caption"
                    color={item.hasUnread ? theme.accent : theme.inkFaint}
                    style={item.hasUnread && styles.timestampUnread}
                  >
                    {timestamp}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  {isActive ? (
                    <>
                      <View style={[styles.liveDot, { backgroundColor: theme.accent }]} />
                      <Text variant="caption" color={theme.accent} style={styles.metaState}>
                        {t('messages:inProgress')}
                      </Text>
                    </>
                  ) : null}
                  <View style={[styles.rolePill, { backgroundColor: theme.surfaceMuted }]}>
                    <Text variant="caption" color={theme.inkMuted} style={styles.rolePillText}>
                      {roleLabel(item.otherPartyRole, t)}
                    </Text>
                  </View>
                  <Text variant="caption" color={theme.inkFaint}>
                    •
                  </Text>
                  <Text
                    variant="caption"
                    color={theme.inkMuted}
                    numberOfLines={1}
                    style={styles.routeText}
                  >
                    {departureLabel
                      ? `${item.originLabel} → ${item.destinationLabel} (${departureLabel})`
                      : `${item.originLabel} → ${item.destinationLabel}`}
                  </Text>
                  {isClosed ? (
                    <Icon name="checkmark-circle" size="xs" color={theme.accent} />
                  ) : null}
                </View>
                <Text
                  variant="bodySmall"
                  color={isClosed ? theme.inkFaint : item.hasUnread ? theme.ink : theme.inkMuted}
                  numberOfLines={1}
                  style={item.hasUnread && styles.previewUnread}
                >
                  {preview}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          filter === 'all' ? (
            <View style={styles.emptyHero}>
              <View style={[styles.emptyGlow, { backgroundColor: theme.accentGlow }]} />
              <View style={[styles.emptyIconRing, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name="chatbubbles-outline" size="lg" color={theme.ink} />
              </View>
              <Text variant="h3" color={theme.ink} style={styles.emptyTitle}>
                {t('messages:emptyHero.title')}
              </Text>
              <Text variant="body" color={theme.inkMuted} style={styles.emptyDescription}>
                {t('messages:emptyHero.description')}
              </Text>
              <Button
                label={t('messages:emptyHero.cta')}
                variant="primary"
                theme={theme}
                onPress={() => router.navigate('/(tabs)/explore')}
                style={styles.emptyAction}
              />
            </View>
          ) : (
            <EmptyState
              icon={<Icon name="funnel-outline" size="lg" color={theme.inkFaint} />}
              title={t('messages:filterEmpty.title')}
              description={t('messages:filterEmpty.description')}
            />
          )
        }
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  ambientGlow: {
    position: 'absolute',
    top: -190,
    alignSelf: 'center',
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.14,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerSlot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtn: {
    borderRadius: radii.full,
    borderWidth: 1,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  // RN's ScrollView defaults its own outer box to `flexGrow: 1` internally
  // (baseHorizontal/baseVertical in ScrollView's own styles) regardless of
  // contentContainerStyle — left unset, this row silently claimed most of
  // the screen's remaining flex space, which is what actually produced the
  // dead gap between the pills and the first day section (a second,
  // distinct bug from the pill-stretch one fixed earlier).
  filtersScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  filterPillWrap: {
    alignSelf: 'flex-start',
  },
  filterPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillText: {
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  sectionHeaderWrap: {
    paddingTop: spacing.md,
  },
  sectionHeader: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingBottom: spacing.xs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  cardClosed: {
    opacity: 0.55,
  },
  unreadDotSlot: {
    width: 8,
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    fontWeight: '600',
    flexShrink: 1,
  },
  nameUnread: {
    fontWeight: '800',
  },
  timestampUnread: {
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaState: {
    fontWeight: '600',
  },
  rolePill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  rolePillText: {
    fontSize: 10,
  },
  routeText: {
    flex: 1,
  },
  previewUnread: {
    fontWeight: '600',
  },
  skeletonWrap: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyHero: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
  },
  emptyGlow: {
    position: 'absolute',
    top: 0,
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.5,
  },
  emptyIconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emptyDescription: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  emptyAction: {
    width: '100%',
  },
});
