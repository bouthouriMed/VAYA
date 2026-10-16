import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router, useLocalSearchParams } from 'expo-router';
import type { SupportedLocale } from '@vaya/config';
import {
  AgendaGroup,
  AgendaRow,
  Button,
  EmptyState,
  LargeTitleHeader,
  NotificationBell,
  SegmentedTabs,
  StateView,
  Text,
  haptics,
  spacing,
  useAppTheme,
} from '@vaya/design-system';
import { useAppSelector } from '../../src/state/store';
import {
  useCreateTripRatingMutation,
  useGetMyDriverProfileQuery,
  useGetPendingRatingQuery,
  useListMyBookingsQuery,
  useListMyRidesQuery,
  useListNotificationsQuery,
} from '../../src/state/api';
import { isQueryErrorOtherThan404 } from '../../src/state/queryErrors';
import { useFocusAwarePolling } from '../../src/hooks/useFocusAwarePolling';
import { formatShortDate, formatTime, toIntlTag } from '../../src/utils/localeFormat';
import {
  buildAgendaItems,
  buildTodos,
  groupHistoryByMonth,
  groupUpcomingByDay,
  hasBothRoles,
  pollingIntervalFor,
  selectSpotlight,
  type AgendaItem,
  type TodoItem,
} from '../../src/features/trips/agenda';
import {
  dayAndTime,
  dayLabel,
  deadlineLabel,
  monthLabel,
  placesRoute,
  roleLabel,
  routeLabel,
  rowPrice,
  rowStatus,
} from '../../src/features/trips/agendaCopy';
import { TripSpotlight } from '../../src/features/trips/TripSpotlight';
import { useNow } from '../../src/features/trips/useNow';
import { openAgendaItem, openDrive } from '../../src/features/trips/navigation';
import { RatingPromptSheet } from '../../src/features/ratings/RatingPromptSheet';
import { submitRating } from '../../src/features/ratings/ratingHelpers';
import { trackEvent } from '../../src/services/analytics/analytics';

type Tab = 'upcoming' | 'history';

/**
 * "Mes trajets" (direction C, docs/ux): one card on top for the trip that
 * matters right now — as driver or passenger, live, about to leave, or just
 * finished — then only what waits on you ("À traiter"), then every coming
 * trip by day, with finished ones under "Historique". Every status comes
 * from the server's ride/booking/trip state plus the clock
 * (src/features/trips/agenda.ts); the lists refresh on their own, faster
 * while a trip is live or about to start.
 */
export default function TripsScreen(): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const { t } = useTranslation(['trips', 'common']);
  const locale = (useAppSelector((s) => s.language.locale) || 'fr') as SupportedLocale;
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const { openRequestsForRide } = useLocalSearchParams<{ openRequestsForRide?: string }>();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [ratingOpen, setRatingOpen] = useState(false);
  const [pollInterval, setPollInterval] = useState(60_000);
  const polling = useFocusAwarePolling(pollInterval);

  const bookingsQuery = useListMyBookingsQuery(undefined, { ...polling, skip: !accessToken });
  const driverProfileQuery = useGetMyDriverProfileQuery(undefined, { skip: !accessToken });
  const hasDriverProfile = Boolean(driverProfileQuery.data);
  const ridesQuery = useListMyRidesQuery(undefined, { ...polling, skip: !hasDriverProfile });
  const { data: pendingRating } = useGetPendingRatingQuery(undefined, { skip: !accessToken });
  const [createRating] = useCreateTripRatingMutation();

  const notificationsPolling = useFocusAwarePolling(30_000);
  const { data: notifications } = useListNotificationsQuery(undefined, { ...notificationsPolling, skip: !accessToken });
  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  const items = useMemo(
    () => buildAgendaItems(ridesQuery.data ?? [], bookingsQuery.data ?? [], now),
    [ridesQuery.data, bookingsQuery.data, now],
  );
  const spotlight = useMemo(() => selectSpotlight(items, pendingRating, now), [items, pendingRating, now]);
  const todos = useMemo(() => buildTodos(items, pendingRating, spotlight), [items, pendingRating, spotlight]);
  const upcoming = useMemo(() => groupUpcomingByDay(items, spotlight, now), [items, spotlight, now]);
  const history = useMemo(() => groupHistoryByMonth(items), [items]);
  const showRoles = hasBothRoles(items);
  const upcomingCount = upcoming.reduce((sum, section) => sum + section.items.length, 0);
  const historyCount = history.reduce((sum, section) => sum + section.items.length, 0);

  useEffect(() => setPollInterval(pollingIntervalFor(spotlight)), [spotlight]);

  // A "new request" notification opens the ride's hub directly.
  useEffect(() => {
    if (openRequestsForRide) openDrive(openRequestsForRide);
  }, [openRequestsForRide]);

  const isLoading =
    bookingsQuery.isLoading || driverProfileQuery.isLoading || (hasDriverProfile && ridesQuery.isLoading);
  // A 404 on the driver profile means "not a driver" — not an error.
  const isError =
    bookingsQuery.isError || isQueryErrorOtherThan404(driverProfileQuery.error) || ridesQuery.isError;
  const isRefreshing = bookingsQuery.isFetching || ridesQuery.isFetching;

  function refreshAll(): void {
    void bookingsQuery.refetch();
    void driverProfileQuery.refetch();
    if (hasDriverProfile) void ridesQuery.refetch();
  }

  function rowFor(item: AgendaItem, index: number, inHistory: boolean): React.JSX.Element {
    const status = rowStatus(item, now, t, locale);
    const time = formatTime(item.departureAt, locale);
    const timeDetail = inHistory
      ? formatShortDate(item.departureAt, toIntlTag(locale))
      : item.arrivalAt
        ? `→ ${formatTime(item.arrivalAt, locale)}`
        : undefined;
    const role = showRoles ? roleLabel(item, t) : undefined;
    const price = rowPrice(item, t, locale);
    return (
      <AgendaRow
        key={item.key}
        time={time}
        timeDetail={timeDetail}
        title={routeLabel(item)}
        status={status.text}
        statusTone={status.tone}
        roleLabel={role}
        roleSolid={item.role === 'driver'}
        trailing={price.value}
        trailingDetail={price.detail}
        dimmed={inHistory}
        divider={index > 0}
        onPress={() => {
          haptics.selection();
          openAgendaItem(item);
        }}
        accessibilityLabel={[dayAndTime(item.departureAt, now, t, locale), routeLabel(item), role, status.text]
          .filter(Boolean)
          .join(', ')}
      />
    );
  }

  function todoRow(todo: TodoItem, index: number): React.JSX.Element {
    if (todo.kind === 'rate') {
      const name = todo.rating.counterpartName?.split(/\s+/)[0];
      const title = name ? t('trips:todo.rateNamed', { name }) : t('trips:todo.rate');
      const route =
        todo.rating.originLabel && todo.rating.destinationLabel
          ? placesRoute(todo.rating.originLabel, todo.rating.destinationLabel)
          : undefined;
      return (
        <AgendaRow
          key={todo.key}
          icon="star-outline"
          title={title}
          status={route}
          actionLabel={t('trips:todo.actionRate')}
          onAction={() => setRatingOpen(true)}
          onPress={() => setRatingOpen(true)}
          highlighted
          divider={index > 0}
          accessibilityLabel={title}
        />
      );
    }
    const { item } = todo;
    const when = dayAndTime(item.departureAt, now, t, locale);
    const title =
      todo.kind === 'requests' ? t('trips:todo.requests', { count: todo.count }) : t('trips:todo.start');
    const detail =
      todo.kind === 'requests' && todo.expiresAt
        ? t('trips:todo.requestsDetailDeadline', {
            route: routeLabel(item),
            time: deadlineLabel(todo.expiresAt, now, t, locale),
          })
        : t('trips:todo.detail', { route: routeLabel(item), when });
    return (
      <AgendaRow
        key={todo.key}
        icon={todo.kind === 'requests' ? 'people-outline' : 'play-outline'}
        title={title}
        status={detail}
        actionLabel={todo.kind === 'requests' ? t('trips:todo.actionReply') : t('trips:todo.actionStart')}
        onAction={() => openDrive(item.rideId)}
        onPress={() => openDrive(item.rideId)}
        highlighted
        divider={index > 0}
        accessibilityLabel={`${title}, ${detail}`}
      />
    );
  }

  const header = (
    <LargeTitleHeader
      title={t('trips:title')}
      style={styles.pageHeader}
      right={
        <NotificationBell
          theme={theme}
          unreadCount={unreadCount}
          onPress={() => {
            haptics.selection();
            router.push('/notifications');
          }}
          accessibilityLabel={unreadCount > 0 ? t('trips:notificationsUnreadAria') : t('trips:notificationsAria')}
        />
      }
    />
  );

  function body(): React.JSX.Element {
    if (!accessToken) {
      return (
        <View style={styles.emptyWrap}>
          <EmptyState
            iconName="car-sport-outline"
            title={t('trips:guestEmpty.title')}
            description={t('trips:guestEmpty.description')}
            actionLabel={t('trips:guestEmpty.cta')}
            onAction={() => router.navigate('/(tabs)/explore')}
          />
        </View>
      );
    }
    if (isLoading) return <StateView status="loading" skeleton="list" />;
    if (isError) {
      return (
        <StateView
          status="error"
          title={t('trips:loadError.title')}
          description={t('trips:loadError.description')}
          actionLabel={t('common:actions.retry')}
          onAction={refreshAll}
        />
      );
    }
    if (items.length === 0 && !pendingRating) {
      return (
        <View style={styles.emptyWrap}>
          <EmptyState
            iconName="car-outline"
            title={t('trips:agenda.emptyAll.title')}
            description={t('trips:agenda.emptyAll.description')}
          >
            <View style={styles.emptyActions}>
              <Button label={t('trips:agenda.emptyAll.findRide')} onPress={() => router.navigate('/(tabs)/explore')} />
              <Button
                variant="ghost"
                label={t('trips:agenda.emptyAll.publishRide')}
                onPress={() => router.navigate('/(tabs)/publish')}
              />
            </View>
          </EmptyState>
        </View>
      );
    }

    return (
      <>
        {spotlight ? (
          <TripSpotlight spotlight={spotlight} now={now} locale={locale} onRate={() => setRatingOpen(true)} />
        ) : null}

        {todos.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
              {t('trips:agenda.todoHeading')}
            </Text>
            <AgendaGroup>{todos.map(todoRow)}</AgendaGroup>
          </View>
        ) : null}

        <SegmentedTabs<Tab>
          tabs={[
            { key: 'upcoming', label: t('trips:agenda.upcomingTab'), count: upcomingCount },
            { key: 'history', label: t('trips:agenda.historyTab'), count: historyCount > 0 ? historyCount : undefined },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'upcoming' ? (
          upcoming.length === 0 ? (
            <EmptyState
              iconName="calendar-outline"
              title={spotlight?.kind === 'trip' ? t('trips:agenda.emptyUpcoming.onlyNext') : t('trips:agenda.emptyUpcoming.title')}
              description={t('trips:agenda.emptyUpcoming.description')}
              actionLabel={t('trips:agenda.emptyAll.findRide')}
              onAction={() => router.navigate('/(tabs)/explore')}
            />
          ) : (
            upcoming.map((section) => (
              <View key={section.key} style={styles.section}>
                <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
                  {dayLabel(section.day, section.offset, t, locale)}
                </Text>
                <AgendaGroup>{section.items.map((item, index) => rowFor(item, index, false))}</AgendaGroup>
              </View>
            ))
          )
        ) : history.length === 0 ? (
          <EmptyState
            iconName="time-outline"
            title={t('trips:agenda.emptyHistory.title')}
            description={t('trips:agenda.emptyHistory.description')}
          />
        ) : (
          history.map((section) => (
            <View key={section.key} style={styles.section}>
              <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
                {monthLabel(section.month, locale)}
              </Text>
              <AgendaGroup>{section.items.map((item, index) => rowFor(item, index, true))}</AgendaGroup>
            </View>
          ))
        )}
      </>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          accessToken ? (
            <RefreshControl refreshing={isRefreshing && !isLoading} onRefresh={refreshAll} tintColor={theme.inkMuted} />
          ) : undefined
        }
      >
        {header}
        {body()}
      </ScrollView>

      {pendingRating && ratingOpen ? (
        <RatingPromptSheet
          visible
          onClose={() => setRatingOpen(false)}
          role={pendingRating.role}
          counterpartName={pendingRating.counterpartName}
          onSubmit={async ({ stars, punctualityFlag, comment }) => {
            const tripId = pendingRating.tripId;
            await submitRating(
              { stars, punctualityFlag, comment },
              {
                createRating: (input) => createRating({ tripId, input }).unwrap(),
                trackEvent,
                role: pendingRating.role,
              },
            );
            setRatingOpen(false);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  pageHeader: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeading: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  emptyWrap: {
    paddingTop: spacing['3xl'],
  },
  emptyActions: {
    alignSelf: 'stretch',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});
