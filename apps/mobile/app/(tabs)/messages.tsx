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
  EmptyState,
  SkeletonBlock,
  useAppTheme,
  spacing,
  radii,
} from '@vaya/design-system';
import { useListConversationsQuery } from '../../src/state/api';
import {
  filterConversations,
  formatInboxTimestamp,
  getConversationState,
  groupConversationsByDay,
  roleLabel,
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
  const { data: conversations, isLoading, isError, refetch } = useListConversationsQuery(undefined, {
    skip: !accessToken,
  });
  const { requireAuth, isAuthSheetVisible, authTrigger, handleAuthenticated, cancelAuth } =
    useContextualAuth();

  const sections = useMemo(() => {
    const filtered = filterConversations(conversations ?? [], filter);
    return groupConversationsByDay(filtered).map((section) => ({
      title: section.label,
      data: section.conversations,
    }));
  }, [conversations, filter]);

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
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section }) => (
          <Text variant="label" color={theme.inkFaint} style={styles.sectionHeader}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => {
          const timestamp = formatInboxTimestamp(item.lastMessage?.createdAt ?? item.updatedAt);
          const preview =
            item.lastMessage?.body ??
            (item.status === 'closed' ? 'Conversation terminée.' : 'Aucun message pour le moment.');
          const state = getConversationState(item);
          const isActive = state === 'active';
          const isClosed = state === 'past';
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
                  <Text variant="body" color={theme.ink} numberOfLines={1} style={styles.name}>
                    {item.otherParty.fullName}
                  </Text>
                  <Text variant="caption" color={theme.inkFaint}>
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
                  <Text variant="caption" color={theme.inkMuted} numberOfLines={1} style={styles.metaRoute}>
                    {`${roleLabel(item.otherPartyRole)} · ${item.originLabel} → ${item.destinationLabel}`}
                  </Text>
                </View>
                <Text
                  variant="bodySmall"
                  color={isClosed ? theme.inkFaint : theme.inkMuted}
                  numberOfLines={1}
                >
                  {preview}
                </Text>
              </View>

              {isClosed ? (
                <Icon name="checkmark-circle" size="sm" color={theme.accent} />
              ) : null}
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
    marginTop: spacing.xl
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
  sectionHeader: {
    paddingTop: spacing.md,
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
  metaRoute: {
    flexShrink: 1,
  },
  skeletonWrap: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
