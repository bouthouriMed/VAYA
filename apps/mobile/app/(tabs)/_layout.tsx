import { useEffect } from 'react';
import { Tabs, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppTheme, haptics } from '@vaya/design-system';
import { useAppSelector } from '../../src/state/store';
import { useListConversationsQuery } from '../../src/state/api';

// Matches explore.tsx/trips.tsx's own background-polling cadence — this is
// a tab-bar badge, not an open chat screen, so it doesn't need
// conversations/[bookingId].tsx's tighter POLL_INTERVAL_MS.
const UNREAD_POLL_MS = 30_000;

export default function TabLayout(): React.JSX.Element {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const navigation = useNavigation();
  const { colors: theme } = useAppTheme();
  // 'navigation' namespace (locales/*/navigation.json) already carried
  // correct en/fr/ar tab labels — this screen just never read them, and
  // hardcoded French strings regardless of the user's language setting.
  const { t } = useTranslation('navigation');

  // messages.tsx guards itself for guests (see the comment below), so this
  // query is skipped the same way rather than firing for a signed-out user.
  const { data: conversations } = useListConversationsQuery(undefined, {
    skip: !accessToken,
    pollingInterval: UNREAD_POLL_MS,
  });
  const unreadCount = conversations?.filter((c) => c.hasUnread).length ?? 0;

  // Last-line-of-defense against "swiping right dismisses the entire app":
  // a swipe that starts near the screen edge can be delivered as a system
  // back event (Android gesture nav), which pops this stack below (tabs)
  // and lands the whole app on the landing/auth screen. gestureEnabled:
  // false on the root Stack only disables the navigator's own edge-swipe
  // gesture — it does nothing for back events. Swallow any pop attempt
  // targeting (tabs); programmatic router.replace() calls (e.g. sign-out's
  // replace('/')) dispatch REPLACE actions and stay allowed.
  useEffect(() => {
    if (!accessToken) return;
    return navigation.addListener('beforeRemove', (e) => {
      if (e.data.action.type === 'REPLACE') return;
      e.preventDefault();
    });
  }, [accessToken, navigation]);

  // Not a hard gate anymore: a guest reaches explore/publish freely (guest
  // browsing — see index.tsx's doc comment). trips.tsx/messages.tsx guard
  // themselves individually instead, since only those two specifically
  // require an account.
  //
  // Tab order below is deliberately not file order: Publish sits in the
  // true center of the 5 tabs (3rd of 5) — its primary/create-action
  // position in the Stitch-reviewed design — rather than 4th, where it
  // previously sat crowded next to Profile.
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.inkFaint,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.outlineVariant },
      }}
      // One light tick per tab switch, for every tab — the native iOS/
      // Android tab-bar feel. `screenListeners` (unlike a per-Tabs.Screen
      // `listeners` prop) applies once, to all five tabs, so a sixth tab
      // added later gets it for free too.
      screenListeners={{
        tabPress: () => haptics.selection(),
      }}
    >
      <Tabs.Screen
        name="explore"
        options={{
          title: t('tabs.explore'),
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: t('tabs.trips'),
          // Every tab icon stays the same outline-stroke family — only the
          // active tab's color differs — so "car"/"add-circle"/"person"
          // (their filled glyphs) don't stand out against "search" (which
          // has no separate filled/outline pair).
          tabBarIcon: ({ color, size }) => <Ionicons name="car-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="publish"
        options={{
          title: t('tabs.publish'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.accent },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
