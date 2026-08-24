import { useMemo, useState } from 'react';
import { SectionList, View, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppSelector } from '../../src/state/store';
import { useContextualAuth } from '../../src/features/auth/useContextualAuth';
import { ContextualAuthSheet } from '../../src/features/auth/ContextualAuthSheet';
import {
  Text,
  Avatar,
  Button,
  Chip,
  Icon,
  EmptyState,
  SkeletonBlock,
  useAppTheme,
  spacing,
  radii,
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

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'upcoming', label: 'À venir' },
  { key: 'active', label: 'En cours' },
  { key: 'past', label: 'Passés' },
];

/**
 * Top app bar shared by every render path (guest, loading, error, inbox).
 * Left-aligned title (matching the sibling tabs' own idiom, e.g. trips.tsx's
 * "Mes trajets") with a trailing search toggle — deliberately no leading
 * own-profile avatar here (a tap-to-profile shortcut duplicating the
 * Profile tab already in the bottom bar); a real avatar belongs identifying
 * *who you're talking to* in the individual conversation screen instead,
 * not as a generic self-shortcut in the inbox list. The search slot only
 * renders when `onToggleSearch` is given (the populated, authenticated
 * view) — a guest has nothing to search.
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
  return (
    <View style={styles.header}>
      <Text variant="h3" color={theme.ink} style={styles.headerTitle}>
        Messages
      </Text>

      {onToggleSearch ? (
        <TouchableOpacity
          onPress={onToggleSearch}
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? 'Fermer la recherche' : 'Rechercher une conversation'}
          style={styles.headerSlot}
        >
          <Icon
            name={searchOpen ? 'close-outline' : 'search-outline'}
            size="sm"
            color={theme.inkMuted}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Stitch's "Inbox / trip-centric overview" — one thread per booking, the
 *  other party + trip context enriched server-side (GET /conversations), so
 *  the inbox is a real index over real conversations and never guesses
 *  read state or message counts that don't exist yet. */
export default function MessagesScreen(): React.JSX.Element {
  const theme = useAppTheme().colors;
  const accessToken = useAppSelector((s) => s.auth.accessToken);
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
    return groupConversationsByDay(filtered).map((section) => ({
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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <InboxHeader theme={theme} />
        <EmptyState
          icon={<Icon name="chatbubble-ellipses-outline" size="lg" color={theme.inkFaint} />}
          title="Vos trajets, au même endroit."
          description="Connectez-vous pour retrouver les conversations liées à vos trajets partagés — avant, pendant et après le départ."
          actionLabel="Se connecter"
          onAction={() => requireAuth(() => {}, 'messages')}
        />

        <ContextualAuthSheet
          visible={isAuthSheetVisible}
          trigger={authTrigger}
          onClose={cancelAuth}
          onAuthenticated={handleAuthenticated}
        />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <InboxHeader theme={theme} />
        <View style={styles.skeletonWrap}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} height={92} radius="xl" />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <InboxHeader theme={theme} />
        <EmptyState
          icon={<Icon name="cloud-offline-outline" size="lg" color={theme.inkFaint} />}
          title="Impossible de charger vos messages"
          description="Vérifiez votre connexion puis réessayez."
          actionLabel="Réessayer"
          onAction={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <InboxHeader theme={theme} searchOpen={searchOpen} onToggleSearch={toggleSearch} />

      {searchOpen ? (
        <View style={styles.searchWrap}>
          <View
            style={[
              styles.searchField,
              { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
            ]}
          >
            <Icon name="search" size="sm" color={theme.inkMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Nom, ville de départ ou d'arrivée…"
              placeholderTextColor={theme.inkFaint}
              style={[styles.searchInput, { color: theme.ink }]}
              autoFocus
              returnKeyType="search"
              accessibilityLabel="Rechercher une conversation"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Effacer la recherche"
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
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map(({ key, label }) => (
            <Chip
              key={key}
              label={label}
              onPress={() => setFilter(key)}
              selected={filter === key}
              theme={theme}
            />
          ))}
        </ScrollView>
      ) : null}

      <SectionList
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
          const timestamp = formatInboxTimestamp(item.lastMessage?.createdAt ?? item.updatedAt);
          const preview =
            item.lastMessage?.body ??
            (item.status === 'closed' ? 'Conversation terminée.' : 'Aucun message pour le moment.');
          const state = getConversationState(item);
          const isActive = state === 'active';
          const isClosed = state === 'past';
          const departureLabel = isClosed ? null : formatDepartureLabel(item.departureAt);
          return (
            <TouchableOpacity
              style={[
                styles.card,
                { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
                isClosed && styles.cardClosed,
              ]}
              onPress={() => openConversation(item)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Conversation avec ${item.otherParty.fullName}, ${item.originLabel} vers ${item.destinationLabel}${isActive ? ', trajet en cours' : ''}`}
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
                        En cours
                      </Text>
                    </>
                  ) : null}
                  <View style={[styles.rolePill, { backgroundColor: theme.surfaceMuted }]}>
                    <Text variant="caption" color={theme.inkMuted} style={styles.rolePillText}>
                      {roleLabel(item.otherPartyRole)}
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
                Vos trajets, au même endroit.
              </Text>
              <Text variant="body" color={theme.inkMuted} style={styles.emptyDescription}>
                Les conversations avec vos conducteurs et passagers apparaîtront ici.
              </Text>
              <Button
                label="Trouver un trajet"
                variant="primary"
                theme={theme}
                onPress={() => router.navigate('/(tabs)/explore')}
                style={styles.emptyAction}
              />
            </View>
          ) : (
            <EmptyState
              icon={<Icon name="funnel-outline" size="lg" color={theme.inkFaint} />}
              title="Rien dans ce filtre"
              description="Essayez un autre filtre pour retrouver une conversation."
            />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerSlot: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
