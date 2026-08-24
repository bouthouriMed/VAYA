import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Text,
  Avatar,
  Chip,
  Icon,
  EmptyState,
  MessageBubble,
  Input,
  useAppTheme,
  spacing,
  radii,
} from '@vaya/design-system';
import {
  useGetMeQuery,
  useGetConversationByBookingQuery,
  useListConversationMessagesQuery,
  useSendConversationMessageMutation,
} from '../../src/state/api';
import {
  isOwnMessage,
  canSendMessage,
  formatMessageTimestamp,
  getTripContext,
  groupMessagesByDay,
  submitMessage,
} from '../../src/features/conversations/conversationHelpers';
import { trackEvent } from '../../src/services/analytics/analytics';

// Polling-based delivery only (docs/roadmap/phase-08-messaging.md — no
// WebSockets/real-time infra for v1). 4s keeps a trip-coordination
// conversation feeling responsive without hammering the API.
const POLL_INTERVAL_MS = 4000;

const ICEBREAKERS = [
  "On se retrouve à l'arrêt indiqué ?",
  'Je suis en route, à tout de suite !',
];

function formatDeparture(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return time;
  return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${time}`;
}

/** Stitch's "Conversation / active trip coordination" — the other party's
 *  identity, verification, and the trip context are all read straight off
 *  GET /conversations/:bookingId's enriched summary (same shape the inbox
 *  list uses), so nothing on this screen is guessed client-side. */
export default function ConversationScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ bookingId: string }>();
  const bookingId = params.bookingId;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const hasTrackedStart = useRef(false);
  const hasTrackedCount = useRef(false);
  const insets = useSafeAreaInsets();
  const theme = useAppTheme().colors;

  const { data: me } = useGetMeQuery();
  const {
    data: conversation,
    isLoading: isConversationLoading,
    error: conversationError,
  } = useGetConversationByBookingQuery(bookingId, { skip: !bookingId });

  const { data: messages } = useListConversationMessagesQuery(
    { conversationId: conversation?.id ?? '' },
    { skip: !conversation, pollingInterval: POLL_INTERVAL_MS },
  );

  const [sendConversationMessage, { isLoading: isSending }] = useSendConversationMessageMutation();

  const sendAllowed = canSendMessage(conversation);
  const tripContext = conversation ? getTripContext(conversation) : null;
  const dayGroups = useMemo(
    () => (messages && messages.length > 0 ? groupMessagesByDay(messages) : []),
    [messages],
  );

  useEffect(() => {
    if (!messages) return;
    if (messages.length === 0 && conversation?.status === 'open' && !hasTrackedStart.current) {
      hasTrackedStart.current = true;
      trackEvent('conversation_started', { bookingId });
    }
    if (messages.length > 0 && !hasTrackedCount.current) {
      hasTrackedCount.current = true;
      trackEvent('conversation_message_count', { bookingId, count: messages.length });
    }
  }, [messages, conversation?.status, bookingId]);

  async function handleSend(bodyOverride?: string): Promise<void> {
    if (!conversation) return;
    const body = bodyOverride ?? draft;
    try {
      const sent = await submitMessage(body, {
        sendMessage: (text) =>
          sendConversationMessage({ conversationId: conversation.id, body: text }).unwrap(),
        trackEvent,
        role: conversation.viewerRole,
      });
      if (sent) {
        setDraft('');
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      }
    } catch {
      // sendConversationMessage's own error (e.g. 409 once closed) is
      // surfaced by RTK Query's isSending/error state; nothing fabricated
      // here — the composer just stays populated so the user can retry.
    }
  }

  if (isConversationLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </SafeAreaView>
    );
  }

  if (conversationError || !conversation) {
    return (
      <SafeAreaView style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <EmptyState
          icon={<Icon name="chatbubble-outline" size="lg" color={theme.inkFaint} />}
          title="Conversation indisponible"
          description="Cette conversation n'existe pas ou n'est pas encore ouverte — elle s'ouvre dès que la réservation est confirmée."
          actionLabel="Retour"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Icon name="chevron-back" size="md" color={theme.ink} />
        </TouchableOpacity>

        <View style={styles.headerIdentity}>
          <View style={styles.avatarWrap}>
            <Avatar
              uri={conversation.otherParty.avatarUrl}
              name={conversation.otherParty.fullName}
              sizePx={40}
              fallbackBackgroundColor={theme.surfaceMuted}
              fallbackTextColor={theme.ink}
            />
            {conversation.isOtherPartyVerified ? (
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
          <View style={styles.headerNameCol}>
            <Text variant="body" color={theme.ink} numberOfLines={1} style={styles.headerName}>
              {conversation.otherParty.fullName}
            </Text>
            <Text variant="caption" color={theme.inkMuted}>
              {conversation.otherPartyRole === 'driver' ? 'Conducteur' : 'Passager'}
            </Text>
          </View>
        </View>
      </View>

      {/* Persistent trip-context bar */}
      {tripContext ? (
        <View
          style={[
            styles.tripBar,
            { backgroundColor: theme.surface, borderBottomColor: theme.outlineVariant },
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: tripContext.isLive ? theme.accent : theme.outlineVariant }]} />
          <View style={styles.tripBarTextCol}>
            <Text variant="caption" color={tripContext.isLive ? theme.accent : theme.inkMuted} style={styles.tripBarLabel}>
              {tripContext.label.toUpperCase()}
            </Text>
            <Text variant="bodySmall" color={theme.ink} numberOfLines={1}>
              {`${conversation.originLabel} → ${conversation.destinationLabel} · ${formatDeparture(conversation.departureAt)}`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() =>
              conversation.viewerRole === 'driver'
                ? router.push(`/driver/rides/${conversation.rideId}`)
                : router.push(`/bookings/${conversation.bookingId}`)
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Voir le trajet"
          >
            <Text variant="caption" color={theme.accent}>
              Voir le trajet
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!sendAllowed ? (
        <View
          style={[styles.closedBanner, { backgroundColor: theme.surfaceMuted }]}
        >
          <Icon name="lock-closed-outline" size="xs" color={theme.inkMuted} />
          <Text variant="bodySmall" color={theme.inkMuted} style={styles.closedBannerText}>
            Ce trajet est terminé — la conversation est en lecture seule.
          </Text>
        </View>
      ) : null}

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {dayGroups.length === 0 ? (
          <View style={styles.icebreakersWrap}>
            <EmptyState
              icon={<Icon name="chatbubble-ellipses-outline" size="lg" color={theme.inkFaint} />}
              title="Dites bonjour"
              description={`Coordonnez votre point de rendez-vous avec votre ${
                conversation.otherPartyRole === 'driver' ? 'conducteur' : 'passager'
              }.`}
            >
              {sendAllowed ? (
                <View style={styles.icebreakers}>
                  {ICEBREAKERS.map((icebreaker) => (
                    <Chip
                      key={icebreaker}
                      label={icebreaker}
                      theme={theme}
                      tone="dim"
                      onPress={() => void handleSend(icebreaker)}
                      style={{ backgroundColor: theme.surface }}
                    />
                  ))}
                </View>
              ) : null}
            </EmptyState>
          </View>
        ) : (
          dayGroups.map((group) => (
            <View key={group.label}>
              <View style={[styles.dayPill, { backgroundColor: theme.surfaceMuted }]}>
                <Text variant="caption" color={theme.inkMuted}>
                  {group.label}
                </Text>
              </View>
              {group.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  body={message.body}
                  isOwn={Boolean(me && isOwnMessage(message, me.id))}
                  timestamp={formatMessageTimestamp(message.createdAt)}
                  theme={theme}
                  avatarUrl={conversation.otherParty.avatarUrl}
                  avatarName={conversation.otherParty.fullName}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Composer — bottom padding clears the device's own home
       *  indicator/gesture bar (iOS) or 3-button nav bar (Android) instead
       *  of sitting flush against it; KeyboardAvoidingView's iOS `padding`
       *  behavior already shifts this whole view above the keyboard when
       *  focused, so this is purely the at-rest safe-area clearance. */}
      <View
        style={[
          styles.composer,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.outlineVariant,
            paddingBottom: Math.max(insets.bottom, spacing.md),
          },
        ]}
      >
        <View style={styles.inputWrap}>
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder={sendAllowed ? 'Écrivez un message…' : 'Conversation fermée'}
            editable={sendAllowed && !isSending}
            multiline
            maxLength={1000}
            accessibilityLabel="Message"
            theme={theme}
            style={styles.composerInput}
          />
        </View>
        <TouchableOpacity
          onPress={() => void handleSend()}
          disabled={!sendAllowed || isSending || draft.trim().length === 0}
          style={[
            styles.sendButton,
            {
              backgroundColor:
                sendAllowed && draft.trim().length > 0 ? theme.accent : theme.surfaceMuted,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Envoyer le message"
          accessibilityState={{ disabled: !sendAllowed || isSending || draft.trim().length === 0 }}
        >
          <Icon
            name="send"
            size="sm"
            color={sendAllowed && draft.trim().length > 0 ? theme.onAccent : theme.inkFaint}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarWrap: {
    position: 'relative',
  },
  verifiedBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerNameCol: {
    flexShrink: 1,
  },
  headerName: {
    fontWeight: '600',
  },
  tripBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tripBarTextCol: {
    flex: 1,
    gap: 1,
  },
  tripBarLabel: {
    fontWeight: '600',
  },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  closedBannerText: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  icebreakersWrap: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  icebreakers: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  dayPill: {
    alignSelf: 'center',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginVertical: spacing.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flex: 1,
  },
  composerInput: {
    borderRadius: radii.full,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
