import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Text,
  Input,
  Button,
  Icon,
  EmptyState,
  MessageBubble,
  colors,
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
  submitMessage,
} from '../../src/features/conversations/conversationHelpers';
import { trackEvent } from '../../src/services/analytics/analytics';

// Polling-based delivery only (docs/roadmap/phase-08-messaging.md — no
// WebSockets/real-time infra for v1). 4s keeps a trip-coordination
// conversation feeling responsive without hammering the API.
const POLL_INTERVAL_MS = 4000;

export default function ConversationScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    bookingId: string;
    role?: 'driver' | 'rider';
    otherPartyName?: string;
  }>();
  const bookingId = params.bookingId;
  const role: 'driver' | 'rider' = params.role === 'driver' ? 'driver' : 'rider';
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const hasTrackedStart = useRef(false);
  const hasTrackedCount = useRef(false);

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

  async function handleSend(): Promise<void> {
    if (!conversation) return;
    const body = draft;
    try {
      const sent = await submitMessage(body, {
        sendMessage: (text) =>
          sendConversationMessage({ conversationId: conversation.id, body: text }).unwrap(),
        trackEvent,
        role,
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
      <View style={styles.centered}>
        <ActivityIndicator color={colors.secondary} size="large" />
      </View>
    );
  }

  if (conversationError || !conversation) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon={<Icon name="chatbubble-outline" size="lg" color={colors.gray400} />}
          title="Conversation indisponible"
          description="Cette conversation n'existe pas ou n'est pas encore ouverte — elle s'ouvre dès que la réservation est confirmée."
          actionLabel="Retour"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const sendAllowed = canSendMessage(conversation);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      {!sendAllowed ? (
        <View style={styles.closedBanner}>
          <Icon name="lock-closed-outline" size="sm" color={colors.gray600} />
          <Text variant="bodySmall" color={colors.gray700} style={styles.closedBannerText}>
            Ce trajet est terminé — la conversation est en lecture seule.
          </Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {!messages || messages.length === 0 ? (
          <EmptyState
            icon={<Icon name="chatbubble-outline" size="lg" color={colors.gray400} />}
            title="Dites bonjour"
            description="Coordonnez votre point de rendez-vous avec votre conducteur."
          />
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              body={message.body}
              isOwn={Boolean(me && isOwnMessage(message, me.id))}
              timestamp={formatMessageTimestamp(message.createdAt)}
            />
          ))
        )}
      </ScrollView>

      <View style={styles.composer}>
        <View style={styles.inputWrap}>
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder={sendAllowed ? 'Écrivez un message…' : 'Conversation fermée'}
            editable={sendAllowed && !isSending}
            multiline
            maxLength={1000}
            accessibilityLabel="Message"
          />
        </View>
        <Button
          label="Envoyer"
          size="sm"
          onPress={() => void handleSend()}
          disabled={!sendAllowed || isSending || draft.trim().length === 0}
          loading={isSending}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.gray200,
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
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputWrap: {
    flex: 1,
    maxHeight: 100,
  },
});
