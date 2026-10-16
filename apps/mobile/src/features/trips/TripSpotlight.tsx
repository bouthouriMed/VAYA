import { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { router } from 'expo-router';
import type { SupportedLocale } from '@vaya/config';
import {
  Avatar,
  HeaderIconButton,
  Icon,
  MapPreview,
  SpotlightCard,
  Text,
  spacing,
  radii,
  useAppTheme,
  type IconName,
  type SpotlightTone,
} from '@vaya/design-system';
import { useGetRideQuery } from '../../state/api';
import { formatTime } from '../../utils/localeFormat';
import { decodePolyline, sliceRouteBetween } from '../../utils/polyline';
import { fullPlaceLabel } from '../../utils/placeLabel';
import type { BookingItem, DriveItem, Spotlight } from './agenda';
import { dayAndTime, departsIn, driverFirstName, roleLabel, routeLabel, seatsLabel, walkLabel } from './agendaCopy';
import { openBooking, openDrive, openConversation, openLiveTracking } from './navigation';

interface CardContent {
  eyebrow: string;
  tone: SpotlightTone;
  live: boolean;
  subtitle?: string;
  primary: { label: string; onPress: () => void; icon?: IconName };
  secondary?: { label: string; onPress: () => void; icon?: IconName };
}

function timeRange(item: DriveItem | BookingItem, locale: SupportedLocale, t: TFunction): string {
  const departure = formatTime(item.departureAt, locale);
  return item.arrivalAt
    ? t('trips:spotlight.timeRange', { departure, arrival: formatTime(item.arrivalAt, locale) })
    : departure;
}

/** The moment, in words: a countdown when it's close, else day and time. */
function whenEyebrow(
  spotlight: Extract<Spotlight, { kind: 'trip' }>,
  now: Date,
  t: TFunction,
  locale: SupportedLocale,
): string {
  const when =
    spotlight.moment === 'soon'
      ? departsIn(spotlight.item.departureAt, now, t)
      : dayAndTime(spotlight.item.departureAt, now, t, locale);
  return t('trips:spotlight.momentWithRole', { moment: when, role: roleLabel(spotlight.item, t) });
}

function driveContent(
  spotlight: Extract<Spotlight, { kind: 'trip' }>,
  item: DriveItem,
  now: Date,
  t: TFunction,
  locale: SupportedLocale,
): CardContent {
  const open = { label: t('trips:spotlight.actions.manage'), onPress: () => openDrive(item.rideId) };
  if (spotlight.moment === 'live') {
    return {
      eyebrow: t('trips:spotlight.driving'),
      tone: 'accent',
      live: true,
      subtitle: item.arrivalAt
        ? t('trips:spotlight.arrivalPlanned', { time: formatTime(item.arrivalAt, locale) })
        : undefined,
      primary: { label: t('trips:spotlight.actions.openRide'), onPress: () => openDrive(item.rideId), icon: 'navigate-outline' },
    };
  }
  if (spotlight.moment === 'needs_start') {
    return {
      eyebrow: t('trips:spotlight.needsStart'),
      tone: 'warning',
      live: false,
      subtitle: t('trips:spotlight.passengersWaiting', { count: item.acceptedBookingCount }),
      primary: { label: t('trips:spotlight.actions.start'), onPress: () => openDrive(item.rideId), icon: 'play' },
    };
  }
  if (item.status === 'awaiting_verification') {
    return {
      eyebrow: t('trips:spotlight.awaitingVerification'),
      tone: 'warning',
      live: false,
      subtitle: t('trips:spotlight.publishOnApproval'),
      primary: { label: t('trips:spotlight.actions.viewRide'), onPress: () => openDrive(item.rideId) },
    };
  }
  const seats = item.seatsBooked > 0 ? t('trips:spotlight.seatsBooked', { seats: seatsLabel(item, t) }) : t('trips:spotlight.noBookingsYet');
  return {
    eyebrow: whenEyebrow(spotlight, now, t, locale),
    tone: spotlight.moment === 'soon' ? 'accent' : 'neutral',
    live: false,
    subtitle: `${timeRange(item, locale, t)} · ${seats}`,
    primary:
      item.pendingRequestCount > 0
        ? {
            label: t('trips:spotlight.actions.reply', { count: item.pendingRequestCount }),
            onPress: () => openDrive(item.rideId),
            icon: 'people-outline',
          }
        : open,
  };
}

function bookingContent(
  spotlight: Extract<Spotlight, { kind: 'trip' }>,
  item: BookingItem,
  now: Date,
  t: TFunction,
  locale: SupportedLocale,
): CardContent {
  const message = {
    label: t('trips:spotlight.actions.message'),
    onPress: () => openConversation(item.booking.id),
    icon: 'chatbubble-outline' as IconName,
  };
  const follow = {
    label: t('trips:spotlight.actions.followLive'),
    onPress: () => openLiveTracking(item),
    icon: 'navigate-outline' as IconName,
  };
  const arrival = item.arrivalAt ? t('trips:spotlight.arrivalPlanned', { time: formatTime(item.arrivalAt, locale) }) : undefined;

  switch (item.status) {
    case 'driver_on_the_way':
      return { eyebrow: t('trips:spotlight.driverOnTheWay'), tone: 'accent', live: true, subtitle: arrival, primary: follow };
    case 'driver_at_pickup':
      return { eyebrow: t('trips:spotlight.driverAtPickup'), tone: 'accent', live: true, subtitle: arrival, primary: follow };
    case 'on_board':
      return { eyebrow: t('trips:spotlight.onBoard'), tone: 'info', live: true, subtitle: arrival, primary: follow };
    case 'arriving':
      return { eyebrow: t('trips:spotlight.arriving'), tone: 'info', live: true, subtitle: arrival, primary: follow };
    case 'trip_started':
      return { eyebrow: t('trips:spotlight.tripStarted'), tone: 'accent', live: true, subtitle: arrival, primary: follow };
    case 'departure_passed':
      return {
        eyebrow: t('trips:spotlight.waitingDriver'),
        tone: 'warning',
        live: false,
        subtitle: t('trips:spotlight.plannedDeparture', { time: formatTime(item.departureAt, locale) }),
        primary: { ...message, label: t('trips:spotlight.actions.messageDriver') },
        secondary: { label: t('trips:spotlight.actions.viewBooking'), onPress: () => openBooking(item.booking.id) },
      };
    case 'awaiting_response':
      return {
        eyebrow: t('trips:spotlight.awaitingDriver'),
        tone: 'warning',
        live: false,
        subtitle: item.requestExpiresAt
          ? t('trips:spotlight.replyBefore', { when: dayAndTime(item.requestExpiresAt, now, t, locale) })
          : timeRange(item, locale, t),
        primary: { label: t('trips:spotlight.actions.viewRequest'), onPress: () => openBooking(item.booking.id) },
      };
    case 'confirmed':
    default:
      return {
        eyebrow: whenEyebrow(spotlight, now, t, locale),
        tone: spotlight.moment === 'soon' ? 'accent' : 'neutral',
        live: false,
        subtitle: timeRange(item, locale, t),
        primary: { label: t('trips:spotlight.actions.meetingPoint'), onPress: () => openBooking(item.booking.id), icon: 'location-outline' },
      };
  }
}

function SpotlightMap({ item }: { item: DriveItem | BookingItem }): React.JSX.Element {
  const { colors: theme, scheme } = useAppTheme();
  // A booking's list entry carries no route geometry; the ride does.
  const { data: bookingRide } = useGetRideQuery(item.rideId, { skip: item.role !== 'passenger' });
  const ride = item.role === 'driver' ? item.ride : bookingRide;

  const pickup =
    item.role === 'passenger' ? { latitude: item.booking.pickupLat, longitude: item.booking.pickupLng } : undefined;
  const dropoff =
    item.role === 'passenger'
      ? item.booking.dropoffLat != null && item.booking.dropoffLng != null
        ? { latitude: item.booking.dropoffLat, longitude: item.booking.dropoffLng }
        : ride
          ? { latitude: ride.destinationLat, longitude: ride.destinationLng }
          : undefined
      : undefined;

  const route = useMemo(() => {
    const full = ride?.routePolyline ? decodePolyline(ride.routePolyline) : [];
    if (full.length < 2 || !pickup || !dropoff) return full;
    // The passenger's own leg, not the driver's whole route.
    return sliceRouteBetween(full, pickup, dropoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.routePolyline, pickup?.latitude, pickup?.longitude, dropoff?.latitude, dropoff?.longitude]);

  return item.role === 'driver' ? (
    <MapPreview
      height={120}
      origin={{ latitude: item.ride.originLat, longitude: item.ride.originLng }}
      destination={{ latitude: item.ride.destinationLat, longitude: item.ride.destinationLng }}
      routeCoordinates={route}
      isDark={scheme === 'dark'}
      theme={theme}
    />
  ) : (
    <MapPreview
      height={120}
      pickup={pickup}
      dropoff={dropoff}
      routeCoordinates={route}
      isDark={scheme === 'dark'}
      theme={theme}
    />
  );
}

function MeetingBlock({ item, t, locale }: { item: BookingItem; t: TFunction; locale: SupportedLocale }): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const walk = walkLabel(item.booking.pickupWalkMeters, t);
  return (
    <View style={[styles.meeting, { backgroundColor: theme.background }]}>
      <Icon name={walk ? 'walk-outline' : 'location-outline'} size="sm" color={theme.inkMuted} />
      <View style={styles.meetingText}>
        <Text variant="label" color={theme.ink} numberOfLines={2}>
          {t('trips:spotlight.pickupAt', {
            time: formatTime(item.departureAt, locale),
            place: fullPlaceLabel(item.booking.pickupLabel),
          })}
        </Text>
        {walk ? (
          <Text variant="caption" color={theme.inkMuted}>
            {walk}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function DriverLine({ item, t }: { item: BookingItem; t: TFunction }): React.JSX.Element | null {
  const { colors: theme } = useAppTheme();
  const ride = item.booking.ride;
  if (!ride) return null;
  const name = ride.driverFullName ?? t('common:terms.driver');
  // The conversation opens once the seat is accepted; when the card's own
  // action already is "write to the driver", the icon would repeat it.
  const hasConversation = item.booking.status === 'accepted' && item.status !== 'departure_passed';
  return (
    <View style={styles.person}>
      <TouchableOpacity
        onPress={() => router.push({ pathname: '/search/trust', params: { driverUserId: ride.driverUserId } })}
        accessibilityRole="button"
        accessibilityLabel={t('common:actions.viewProfile', { name })}
        hitSlop={8}
      >
        <Avatar uri={ride.driverAvatarUrl} name={name} sizePx={40} />
      </TouchableOpacity>
      <View style={styles.personText}>
        <Text variant="label" color={theme.ink} numberOfLines={1}>
          {driverFirstName(item, t)}
        </Text>
        <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
          {t('trips:spotlight.yourDriver')}
        </Text>
      </View>
      {hasConversation ? (
        <HeaderIconButton
          icon="chatbubble-outline"
          onPress={() => openConversation(item.booking.id)}
          accessibilityLabel={t('trips:spotlight.actions.messageNamed', { name: driverFirstName(item, t) })}
        />
      ) : null}
    </View>
  );
}

interface TripSpotlightProps {
  spotlight: Spotlight;
  now: Date;
  locale: SupportedLocale;
  onRate: () => void;
}

/** The trips tab's top card, for whichever moment `selectSpotlight` chose. */
export function TripSpotlight({ spotlight, now, locale, onRate }: TripSpotlightProps): React.JSX.Element {
  const { t } = useTranslation(['trips', 'common']);

  if (spotlight.kind === 'rating') {
    const { rating } = spotlight;
    const name = rating.counterpartName?.split(/\s+/)[0] ?? null;
    const title = name ? t('trips:spotlight.ratingTitleNamed', { name }) : t('trips:spotlight.ratingTitle');
    const route =
      rating.originLabel && rating.destinationLabel
        ? `${fullPlaceLabel(rating.originLabel)} → ${fullPlaceLabel(rating.destinationLabel)}`
        : undefined;
    return (
      <SpotlightCard
        eyebrow={t('trips:spotlight.finished')}
        eyebrowTone="neutral"
        title={title}
        subtitle={route}
        primaryAction={{
          label: name ? t('trips:spotlight.actions.rateNamed', { name }) : t('trips:spotlight.actions.rate'),
          onPress: onRate,
          icon: 'star-outline',
        }}
        accessibilityLabel={title}
      />
    );
  }

  const { item } = spotlight;
  const content =
    item.role === 'driver'
      ? driveContent(spotlight, item, now, t, locale)
      : bookingContent(spotlight, item, now, t, locale);
  const title = routeLabel(item);
  const showPassengerDetail =
    item.role === 'passenger' && (item.status === 'confirmed' || item.status === 'awaiting_response' || item.status === 'departure_passed');

  return (
    <SpotlightCard
      media={<SpotlightMap item={item} />}
      eyebrow={content.eyebrow}
      eyebrowTone={content.tone}
      live={content.live}
      title={title}
      subtitle={content.subtitle}
      primaryAction={content.primary}
      secondaryAction={content.secondary}
      onPress={item.role === 'driver' ? () => openDrive(item.rideId) : () => openBooking(item.booking.id)}
      accessibilityLabel={`${content.eyebrow}. ${title}${content.subtitle ? `. ${content.subtitle}` : ''}`}
    >
      {item.role === 'passenger' ? (
        <>
          {showPassengerDetail && item.status !== 'awaiting_response' ? <MeetingBlock item={item} t={t} locale={locale} /> : null}
          <DriverLine item={item} t={t} />
        </>
      ) : null}
    </SpotlightCard>
  );
}

const styles = StyleSheet.create({
  meeting: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  meetingText: {
    flex: 1,
    gap: 2,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  personText: {
    flex: 1,
    minWidth: 0,
  },
});
