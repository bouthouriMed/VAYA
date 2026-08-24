import { useMemo, useState } from 'react';
import { SectionList, View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppSelector } from '../../src/state/store';
import { useContextualAuth } from '../../src/features/auth/useContextualAuth';
import { ContextualAuthSheet } from '../../src/features/auth/ContextualAuthSheet';
import {
  Text,
  Avatar,
  Chip,
  Icon,
  Input,
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
 * One page-header treatment shared by every render path (guest, loading,
 * error, inbox) so the screen never changes chrome mid-state. Left-aligned
 * per the sibling-tab idiom (trips.tsx's "Mes trajets"), titled "Vos
 * conversations" rather than "Messages" — the tab bar directly below
 * already says "Messages", and repeating it verbatim was pure redundancy.
 */
function InboxHeader({
  theme,
}: {
  theme: ReturnType<typeof useAppTheme>['colors'];
}): React.JSX.Element {
  return (
    <View style={styles.header}>
      <Text variant="headlineDisplay" color={theme.ink} style={styles.heading}>
        Vos conversations
      </Text>
      <Text variant="bodySmall" color={theme.inkMuted}>
        Retrouvez les échanges liés à vos trajets partagés.
      </Text>
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
      <InboxHeader theme={theme} />

      <View style={styles.searchToggleRow}>
        <TouchableOpacity
          onPress={toggleSearch}
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? 'Fermer la recherche' : 'Rechercher une conversation'}
          style={styles.searchIconBtn}
        >
          <Icon
            name={searchOpen ? 'close-outline' : 'search-outline'}
            size="sm"
            color={theme.inkMuted}
          />
        </TouchableOpacity>
      </View>

      {searchOpen ? (
        <View style={styles.searchWrap}>
          <Input
            theme={theme}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Nom, ville de départ ou d'arrivée…"
            autoFocus
            returnKeyType="search"
          />
        </View>
      ) : null}

      {(conversations?.length ?? 0) > 0 ? (
        <View style={styles.filters}>
          {FILTERS.map(({ key, label }) => (
            <Chip
              key={key}
              label={label}
              onPress={() => setFilter(key)}
              selected={filter === key}
              theme={theme}
            />
          ))}
        </View>
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

              <View style={styles.avatarWrap}>
                <Avatar uri={item.otherParty.avatarUrl} name={item.otherParty.fullName} sizePx={48} />
                {item.isOtherPartyVerified ? (
                  <View
                    style={[
                      styles.verifiedBadge,
                      { backgroundColor: theme.accent, borderColor: theme.surface },
                    ]}
                  >
                    <Icon name="checkmark" size="xs" color={theme.onAccent} />
                  </View>
                ) : null}
              </View>

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
            <EmptyState
              icon={<Icon name="chatbubble-ellipses-outline" size="lg" color={theme.inkFaint} />}
              title="Vos trajets, au même endroit."
              description="Retrouvez ici les conversations liées à vos trajets partagés — avant, pendant et après le départ."
              actionLabel="Trouver un trajet"
              onAction={() => router.navigate('/(tabs)/explore')}
            />
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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 17,
  },
  heading: {
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  searchToggleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  searchIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  avatarWrap: {
    position: 'relative',
  },
  verifiedBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
});
