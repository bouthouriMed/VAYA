import { useMemo, useState } from 'react';
import { SectionList, View, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useAppSelector } from '../../src/state/store';
import { useContextualAuth } from '../../src/features/auth/useContextualAuth';
import { ContextualAuthSheet } from '../../src/features/auth/ContextualAuthSheet';
import {
  Text,
  Avatar,
  Icon,
  EmptyState,
  useAppTheme,
  haptics,
  spacing,
  radii,
  elevation,
  type AppPalette,
  LargeTitleHeader,
  HeaderIconButton,
  Chip,
  StateView,
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
import { shortenPlaceLabel } from '../../src/utils/placeLabel';

/** Screen wrapper shared by every render path (guest, loading, error,
 *  populated): the theme background under a top safe area. */
function ScreenBackground({
  theme,
  children,
}: {
  theme: AppPalette;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

/** Tab-root header shared by every render path (guest, loading, error, inbox). */
function InboxHeader({
  searchOpen,
  onToggleSearch,
}: {
  searchOpen?: boolean;
  onToggleSearch?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <LargeTitleHeader
      title={t('messages:title')}
      right={
        onToggleSearch ? (
          <HeaderIconButton
            icon={searchOpen ? 'close' : 'search'}
            onPress={onToggleSearch}
            accessibilityLabel={searchOpen ? t('messages:searchClose') : t('messages:searchAria')}
          />
        ) : null
      }
    />
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
        <InboxHeader />
        <EmptyState
          iconName="chatbubble-ellipses-outline"
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
        <InboxHeader />
        <StateView status="loading" skeleton="list" />
      </ScreenBackground>
    );
  }

  if (isError) {
    return (
      <ScreenBackground theme={theme}>
        <InboxHeader />
        <StateView
          status="error"
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
      <InboxHeader searchOpen={searchOpen} onToggleSearch={toggleSearch} />

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
            <Chip
              key={key}
              label={label}
              onPress={() => setFilter(key)}
              selected={filter === key}
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
          const timestamp = formatInboxTimestamp(item.lastMessage?.createdAt ?? item.updatedAt, t, new Date(), locale);
          const preview =
            item.lastMessage?.body ??
            (item.status === 'closed' ? t('messages:conversationClosed') : t('messages:noMessages'));
          const state = getConversationState(item);
          const isActive = state === 'active';
          const isClosed = state === 'past';
          const departureLabel = isClosed ? null : formatDepartureLabel(item.departureAt, t);
          // Shortened for the same reason trips.tsx's hero card already
          // shortens its own route line: pickupLabel/dropoffLabel are this
          // booking's real, accurate stop labels (not swapped for the
          // ride's endpoints — still correct for a route_passthrough
          // booking), but can be a full street-level address that overruns
          // this compact row's single line — shortenPlaceLabel keeps the
          // same real text, just "locality, area" instead of the whole
          // string.
          const pickupShort = shortenPlaceLabel(item.pickupLabel);
          const dropoffShort = shortenPlaceLabel(item.dropoffLabel);
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
              accessibilityLabel={`${t('messages:conversationWith')} ${item.otherParty.fullName}, ${pickupShort} → ${dropoffShort}${isActive ? `, ${t('messages:tripInProgress')}` : ''}`}
            >
              <View style={styles.unreadDotSlot}>
                {item.hasUnread ? (
                  <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />
                ) : null}
              </View>

              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/search/trust',
                    params: { driverUserId: item.otherParty.id, bookingId: item.bookingId },
                  })
                }
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.viewProfile', { name: item.otherParty.fullName })}
              >
                <Avatar
                  uri={item.otherParty.avatarUrl}
                  name={item.otherParty.fullName}
                  sizePx={48}
                />
              </TouchableOpacity>

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
                      ? `${pickupShort} → ${dropoffShort} (${departureLabel})`
                      : `${pickupShort} → ${dropoffShort}`}
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
            <EmptyState
              iconName="chatbubbles-outline"
              title={t('messages:emptyHero.title')}
              description={t('messages:emptyHero.description')}
              actionLabel={t('messages:emptyHero.cta')}
              onAction={() => router.navigate('/(tabs)/explore')}
            />
          ) : (
            <EmptyState
              iconName="funnel-outline"
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
  container: {
    flex: 1,
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
  // Wraps just the icon ring (not the title/description below it) so the
  // decorative glow — sized a little larger than the ring on purpose, to
  // bleed softly past its edges — has a bounded box to center within
  // instead of the whole emptyHero column. Previously the glow was a
  // sibling of the ring with only `top: 0` and no horizontal centering: at
  // 180×180 (nearly double the 96px ring) with no `alignSelf`, it rendered
  // pinned to the container's left edge and tall enough to bleed down over
  // the title text below — the reported "icon overlapping text" bug.
});
