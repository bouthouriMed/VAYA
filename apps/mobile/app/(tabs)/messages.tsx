import { useMemo, useState } from 'react';
import { SectionList, View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Redirect } from 'expo-router';
import { useAppSelector } from '../../src/state/store';
import {
  Text,
  Avatar,
  Chip,
  Icon,
  EmptyState,
  SkeletonCircle,
  SkeletonText,
  useAppTheme,
  spacing,
} from '@vaya/design-system';
import { useListConversationsQuery } from '../../src/state/api';
import {
  filterConversations,
  formatInboxTimestamp,
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

/** Stitch's "Inbox / trip-centric overview" — one thread per booking, the
 *  other party + trip context enriched server-side (GET /conversations), so
 *  the inbox is a real index over real conversations and never guesses
 *  read state or message counts that don't exist yet. */
export default function MessagesScreen(): React.JSX.Element {
  const theme = useAppTheme().colors;
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const { data: conversations, isLoading, isError, refetch } = useListConversationsQuery(undefined, {
    skip: !accessToken,
  });

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

  // Messaging is booking-scoped and identity-scoped end to end — nothing
  // here exists for a guest. Sent to sign-in.tsx explicitly.
  if (!accessToken) {
    return <Redirect href="/sign-in" />;
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={[styles.header, { paddingTop: spacing.md }]}>
          <View style={styles.headerSlot} />
          <Text variant="headlineDisplay" color={theme.ink}>
            Messages
          </Text>
          <View style={styles.headerSlot} />
        </View>
        <View style={styles.skeletonWrap}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <SkeletonCircle size={48} />
              <View style={styles.skeletonLines}>
                <SkeletonText variant="bodySmall" width="55%" />
                <SkeletonText variant="caption" width="80%" />
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
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
      <View style={styles.header}>
        <View style={styles.headerSlot} />
        <Text variant="headlineDisplay" color={theme.ink}>
          Messages
        </Text>
        <View style={styles.headerSlot} />
      </View>

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
        onRefresh={() => void refetch()}
        refreshing={false}
        contentContainerStyle={sections.length === 0 ? styles.listEmpty : styles.listContent}
        stickySectionHeadersEnabled={false}
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
          const isClosed = item.status === 'closed';
          return (
            <TouchableOpacity
              style={[styles.row, isClosed && styles.rowClosed]}
              onPress={() => openConversation(item)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Conversation avec ${item.otherParty.fullName}, ${item.originLabel} vers ${item.destinationLabel}`}
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
                <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
                  {`${roleLabel(item.otherPartyRole)} · ${item.originLabel} → ${item.destinationLabel}`}
                </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerSlot: {
    width: 24,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowClosed: {
    opacity: 0.6,
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
  skeletonWrap: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  skeletonLines: {
    flex: 1,
    gap: spacing.xs,
  },
});
