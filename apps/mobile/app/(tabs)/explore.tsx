import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useTranslation } from 'react-i18next';
import {
  Text,
  Icon,
  DateCalendarSheet,
  TimeWheelSheet,
  PassengerSheet,
  PickupPin,
  DropoffPin,
  formatDepartureLabel,
  useAppTheme,
  spacing,
  radii,
  regionForPoints,
  lightMapStyle,
  darkMapStyle,
  StatusBarBlend,
  type MapRegion,
} from '@vaya/design-system';
import { router } from 'expo-router';
import type { SupportedLocale } from '@vaya/config';
import { useAppDispatch, useAppSelector, store } from '../../src/state/store';
import { formatTime, toIntlTag } from '../../src/utils/localeFormat';
import {
  setOrigin,
  swapOriginDestination,
  setDesiredDepartureAt,
  setPassengers,
  startSearch,
  ensureSearchSession,
} from '../../src/state/searchSlice';
import { useCurrentPosition } from '../../src/services/location/useCurrentPosition';
import { useMatchingSearchQuery, useListNotificationsQuery, useLazyGeocodeReverseQuery } from '../../src/state/api';
import { trackEvent } from '../../src/services/analytics/analytics';

// A tight, "you are here" urban crop — not a whole-metro overview. Stitch's
// own reference map is a close-in neighborhood view, not a zoomed-out city;
// 0.35° (~35km) read as a generic wide-area map, nothing like the reference.
const TUNIS_REGION: MapRegion = {
  latitude: 36.8065,
  longitude: 10.1815,
  latitudeDelta: 0.045,
  longitudeDelta: 0.045,
};

// The mobile map block is `h-[35vh]`, matching the Stitch reference.
const MAP_HEIGHT_RATIO = 0.35;
// "Vaya" sits over the map's own bottom edge, inside a precise 4-stop
// gradient fading transparent -> the fully opaque page background (see the
// LinearGradient at its usage site) — that gradient alone is what makes the
// map genuinely dissolve into the page, not a uniform translucent/blurred
// block sitting on top of it.
const BRAND_BAR_HEIGHT = 64;

/** apps/mobile/app/search/composer.tsx is still the real From/To picker
 *  (autocomplete + current position); this screen is Stitch's "Search
 *  Ride" — the always-visible card that opens it. */
export default function HomeSearchScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const dispatch = useAppDispatch();
  const { colors: theme, scheme } = useAppTheme();
  const { t } = useTranslation();
  const locale = useAppSelector((s) => s.language.locale) || 'en';
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  const desiredDepartureAt = useAppSelector((s) => s.search.desiredDepartureAt);
  const passengers = useAppSelector((s) => s.search.passengers);
  const searchId = useAppSelector((s) => s.search.searchId);
  const { status, position } = useCurrentPosition();
  const [triggerReverseGeocode] = useLazyGeocodeReverseQuery();
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const [isDateSheetOpen, setIsDateSheetOpen] = useState(false);
  const [isTimeSheetOpen, setIsTimeSheetOpen] = useState(false);
  const [isPassengerSheetOpen, setIsPassengerSheetOpen] = useState(false);

  // Polls via the same RTK Query cache the notifications inbox itself reads
  // (Phase 7) — no separate unread-count endpoint, just derived from the
  // real list. 30s is a light poll, matching the inbox screen's own cadence
  // expectations without hammering the API from the tab a rider lands on
  // most. Skipped for a guest — explore is now this app's guest-browsable
  // landing tab, and /notifications is identity-scoped.
  const { data: notifications } = useListNotificationsQuery(undefined, {
    pollingInterval: 30_000,
    skip: !accessToken,
  });
  const hasUnreadNotifications = notifications?.some((n) => !n.readAt) ?? false;

  // Silently adopt the device's GPS fix as the default departure point the
  // moment it resolves — mirrors Uber/BlaBlaCar's "we already know where you
  // are" opener. Never overwrites a value the rider already chose. The label
  // shown is the real reverse-geocoded address under that fix, not a generic
  // "Current Location" placeholder — falls back to the placeholder only if
  // the reverse lookup itself fails.
  //
  // This screen stays mounted underneath search/composer.tsx (a pushed
  // route, not a replace), so its own reverse-geocode call and composer's
  // "use my location" tap race independently — a rider can pick a real
  // address in composer and navigate back before this effect's promise
  // settles. `origin` here is the value captured when the effect *started*,
  // not the live one, so both callbacks re-read the store directly right
  // before dispatching — otherwise this stale effect would blindly clobber
  // whatever composer just set (including with this same effect's own
  // fallback string, which is exactly the "current location" regression
  // this guard exists to prevent).
  useEffect(() => {
    if (origin || status !== 'granted' || !position) return;
    let cancelled = false;
    void triggerReverseGeocode(position)
      .unwrap()
      .then((result) => {
        if (cancelled || store.getState().search.origin) return;
        dispatch(
          setOrigin({
            label: result.label,
            lat: position.lat,
            lng: position.lng,
            isCurrentPosition: true,
          }),
        );
      })
      .catch(() => {
        if (cancelled || store.getState().search.origin) return;
        dispatch(
          setOrigin({
            label: t('common:terms.currentPosition'),
            lat: position.lat,
            lng: position.lng,
            isCurrentPosition: true,
          }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [origin, status, position, dispatch, t, triggerReverseGeocode]);

  const canSearch = Boolean(origin && destination);

  // Real data, not a hardcoded placeholder — same query results.tsx will
  // run again once the rider actually taps "Rechercher" (RTK Query caches
  // by args, so this also warms that cache rather than duplicating cost).
  const { data: searchResult } = useMatchingSearchQuery(
    canSearch
      ? {
          originLat: origin!.lat,
          originLng: origin!.lng,
          destinationLat: destination!.lat,
          destinationLng: destination!.lng,
          when: desiredDepartureAt ?? new Date().toISOString(),
        }
      : skipToken,
  );
  const candidates = searchResult?.candidates;

  const region = useMemo(() => {
    const points = [origin, destination]
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ lat: p.lat, lng: p.lng }));
    return regionForPoints(points) ?? TUNIS_REGION;
  }, [origin, destination]);

  function originValue(): string {
    if (origin) return origin.label;
    if (status === 'loading') return t('common:status.loading');
    return t('common:terms.departurePoint');
  }

  function openField(field: 'origin' | 'destination'): void {
    // search_started (docs/domain/admin-platform.md's funnel) fires exactly
    // once per session — a fresh searchId is only ever minted the first
    // time a rider opens either field with a clean slate.
    if (!searchId) trackEvent('search_started', {});
    dispatch(ensureSearchSession());
    router.push({ pathname: '/search/composer', params: { field } });
  }

  const intlTag = toIntlTag(locale as SupportedLocale);
  const departureWords = { today: t('common:time.today'), tomorrow: t('common:time.tomorrow') };
  const dateLabel = desiredDepartureAt
    ? formatDepartureLabel(new Date(desiredDepartureAt), new Date(), intlTag, departureWords).split(', ')[0]
    : t('common:time.today');
  const timeLabel = desiredDepartureAt
    ? formatTime(new Date(desiredDepartureAt), locale as SupportedLocale)
    : t('search:timePicker.now');

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* A normal flex child sized to exactly `35vh` (the reference's
       *  `h-[35vh]`), not an absoluteFill layer behind an overlaid sheet —
       *  its rendered height is genuinely just the space above the card, so
       *  `region`'s centered point actually lands in the visible area
       *  instead of half-hidden behind the sheet. */}
      <View style={[styles.mapSection, { height: windowHeight * MAP_HEIGHT_RATIO }]}>
        <MapView
          provider={PROVIDER_DEFAULT}
          style={StyleSheet.absoluteFillObject}
          region={region}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          pointerEvents="none"
          // Follows the app theme instead of always forcing the light
          // Google style — matches the reference (light map in light mode)
          // while giving dark mode a real dark map instead of a jarring
          // light rectangle inside an otherwise dark screen. Google's style
          // JSON only applies on Android (PROVIDER_DEFAULT is Apple Maps on
          // iOS); `userInterfaceStyle` is what makes iOS follow the same
          // app-driven scheme instead of the device's own OS appearance.
          customMapStyle={scheme === 'dark' ? darkMapStyle : lightMapStyle}
          userInterfaceStyle={scheme}
        >
          {origin && destination ? (
            <Polyline
              coordinates={[
                { latitude: origin.lat, longitude: origin.lng },
                { latitude: destination.lat, longitude: destination.lng },
              ]}
              strokeColor={theme.accent}
              strokeWidth={2}
              lineDashPattern={[6, 6]}
            />
          ) : null}
          {origin ? (
            <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} anchor={{ x: 0.5, y: 0.5 }}>
              <PickupPin theme={theme} />
            </Marker>
          ) : null}
          {destination ? (
            <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} anchor={{ x: 0.5, y: 0.5 }}>
              <DropoffPin theme={theme} />
            </Marker>
          ) : null}
        </MapView>

        {/* Frosted blend under the OS status bar, sized to exactly that
         *  zone (insets.top) plus a hair of dissolve room below it — the
         *  map stays full-bleed behind the clock/battery/signal icons but
         *  melts into a soft frost instead of sitting under a gray band.
         *  Theme-aware: near-white wash + light frost in light mode,
         *  near-black wash + dark frost in dark mode. */}
        <StatusBarBlend theme={theme} scheme={scheme} height={insets.top - spacing.sm} />

        {/* A precise 4-stop fade from transparent to the fully opaque page
         *  background, matching the reference exactly — the map genuinely
         *  dissolves into the page under "Vaya" instead of sitting behind
         *  a uniform translucent block (which read as a hard-edged plate,
         *  not a blend). `LinearGradient` renders `children` on top of its
         *  own gradient, so there's no separate-layer z-order risk either.
         *  No profile icon here: this is a tab root. */}
        <LinearGradient
          colors={[`${theme.background}00`, `${theme.background}8C`, `${theme.background}EB`, theme.background]}
          locations={[0, 0.45, 0.78, 1]}
          style={styles.brandBar}
        />
        <TouchableOpacity
          onPress={() => router.push(accessToken ? '/notifications' : '/sign-in')}
          accessibilityRole="button"
          accessibilityLabel={hasUnreadNotifications ? t('trips:notificationsUnreadAria') : t('trips:notificationsAria')}
          style={[
            styles.notificationButton,
            { top: insets.top + spacing.sm, backgroundColor: theme.surface, shadowColor: theme.ink },
          ]}
        >
          <Ionicons name="notifications-outline" size={20} color={theme.ink} />
          {hasUnreadNotifications ? (
            <View style={[styles.notificationDot, { backgroundColor: theme.accent, borderColor: theme.surface }]} />
          ) : null}
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, shadowColor: theme.ink, paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <View style={styles.handle}>
          <View style={[styles.handleBar, { backgroundColor: theme.outlineVariant }]} />
          </View>

          <Text variant="headlineDisplay" color={theme.ink} style={styles.headline}>
            {t('search:composer.findRide')}
          </Text>

          {/* Raised above the filter cards below it (white, bordered,
           *  soft shadow) rather than flat like them — this is the
           *  primary input, not a secondary filter. */}
          <View
            style={[
              styles.locationBlock,
              { backgroundColor: theme.surface, borderColor: theme.outlineVariant, shadowColor: theme.ink },
            ]}
          >
            <View pointerEvents="none" style={styles.connectorCol}>
              <View style={[styles.connectorLine, { borderColor: theme.outlineVariant }]} />
            </View>

            <TouchableOpacity
              style={styles.locationRow}
              onPress={() => openField('origin')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t('common:terms.departure')}, ${originValue()}`}
            >
              <View style={[styles.locationIconWrap, { backgroundColor: theme.accentGlow + '33' }]}>
                <Icon name="locate" size="sm" color={theme.accent} />
              </View>
              <View style={styles.locationTextCol}>
                <Text variant="caption" color={theme.inkFaint}>
                  {t('common:terms.departure')}
                </Text>
                <Text variant="body" numberOfLines={1} color={origin ? theme.ink : theme.inkFaint}>
                  {originValue()}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.locationRow}
              onPress={() => openField('destination')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t('common:terms.arrival')}, ${destination?.label ?? t('common:terms.whereTo')}`}
            >
              <View style={[styles.locationIconWrap, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name="location" size="sm" color={theme.inkMuted} />
              </View>
              <View style={styles.locationTextCol}>
                <Text variant="caption" color={theme.inkFaint}>
                  {t('common:terms.arrival')}
                </Text>
                <Text variant="body" numberOfLines={1} color={destination ? theme.ink : theme.inkFaint}>
                  {destination?.label ?? t('common:terms.whereTo')}
                </Text>
              </View>
            </TouchableOpacity>

            {origin && destination ? (
              <TouchableOpacity
                style={[styles.swapBtn, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}
                onPress={() => dispatch(swapOriginDestination())}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.swap')}
              >
                <Ionicons name="swap-vertical" size={15} color={theme.inkMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.paramsGrid}>
            <TouchableOpacity
              style={[styles.paramBtn, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
              onPress={() => setIsDateSheetOpen(true)}
              activeOpacity={0.7}
            >
              <Icon name="calendar-outline" size="sm" color={theme.inkFaint} />
              <View>
                <Text variant="caption" color={theme.inkFaint}>
                  {t('common:terms.date')}
                </Text>
                <Text variant="bodySmall" color={theme.ink}>
                  {dateLabel}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.paramBtn, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
              onPress={() => setIsTimeSheetOpen(true)}
              activeOpacity={0.7}
            >
              <Icon name="time-outline" size="sm" color={theme.inkFaint} />
              <View>
                <Text variant="caption" color={theme.inkFaint}>
                  {t('common:terms.time')}
                </Text>
                <Text variant="bodySmall" color={theme.ink}>
                  {timeLabel}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Same tap-to-open sheet grammar as Date/Heure — one consistent
           *  filter row; the count itself is edited in a draggable sheet. */}
          <TouchableOpacity
            style={[styles.paramBtnWide, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
            onPress={() => setIsPassengerSheetOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
              accessibilityLabel={`${t('common:terms.passengers')}, ${t('common:terms.passenger', { count: passengers })}`}
          >
            <View style={[styles.locationIconWrap, styles.filterIconWrap, { backgroundColor: theme.surfaceMuted }]}>
              <Icon name="person-outline" size="sm" color={theme.inkFaint} />
            </View>
            <View>
              <Text variant="caption" color={theme.inkFaint}>
                {t('common:terms.passengers')}
              </Text>
              <Text variant="bodySmall" color={theme.ink}>
                {t('common:terms.passenger', { count: passengers })}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.cta,
              { backgroundColor: theme.ink, shadowColor: theme.ink },
              !canSearch && styles.ctaDisabled,
            ]}
            disabled={!canSearch}
            activeOpacity={0.85}
            onPress={() => {
              dispatch(startSearch());
              if (origin && destination) {
                trackEvent('search_submitted', {
                  searchId,
                  originLabel: origin.label,
                  originLat: origin.lat,
                  originLng: origin.lng,
                  destinationLabel: destination.label,
                  destinationLat: destination.lat,
                  destinationLng: destination.lng,
                  desiredDepartureAt,
                  seats: passengers,
                });
              }
              router.push('/search/results');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('search:composer.findRide')}
          >
            <Text variant="label" color={canSearch ? theme.onInk : theme.inkFaint}>
              {t('common:actions.search')}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={canSearch ? theme.onInk : theme.inkFaint}
            />
          </TouchableOpacity>

          {/* Real data or nothing — never a hardcoded placeholder count. */}
          {canSearch && candidates ? (
            <Text variant="caption" color={theme.inkFaint} style={styles.quickNote}>
              {t('search:results.candidateCount', { count: candidates.length })}
            </Text>
          ) : null}
      </View>

      <DateCalendarSheet
        visible={isDateSheetOpen}
        onClose={() => setIsDateSheetOpen(false)}
        value={desiredDepartureAt ? new Date(desiredDepartureAt) : new Date()}
        onChange={(date) => dispatch(setDesiredDepartureAt(date.toISOString()))}
        title={t('search:datePickerSheet.title')}
        locale={intlTag}
        weekdayLabels={t('search:datePickerSheet.weekdayLabels', { returnObjects: true }) as [string, string, string, string, string, string, string]}
        closeLabel={t('common:actions.close')}
        previousMonthLabel={t('search:datePickerSheet.previousMonth')}
        nextMonthLabel={t('search:datePickerSheet.nextMonth')}
        confirmLabel={t('search:datePickerSheet.confirm')}
        dayLabelWords={{
          today: t('search:datePickerSheet.today'),
          tomorrow: t('search:datePickerSheet.tomorrow'),
        }}
        pickAnotherDateLabel={t('search:datePickerSheet.pickAnotherDate')}
        bottomInset={insets.bottom}
      />
      <TimeWheelSheet
        visible={isTimeSheetOpen}
        onClose={() => setIsTimeSheetOpen(false)}
        value={desiredDepartureAt ? new Date(desiredDepartureAt) : new Date()}
        onChange={(date) => dispatch(setDesiredDepartureAt(date.toISOString()))}
        title={t('search:timeWheelSheet.title')}
        closeLabel={t('common:actions.close')}
        subtitleLabel={t('search:timeWheelSheet.subtitle')}
        summaryLabel={(time) => t('search:timeWheelSheet.summary', { time })}
        confirmLabel={t('common:actions.confirm')}
        quickOptionLabels={{
          now: t('search:timeWheelSheet.quickNow'),
          plus30: t('search:timeWheelSheet.quickPlus30'),
          plus1h: t('search:timeWheelSheet.quickPlus1h'),
          custom: t('search:timeWheelSheet.quickCustom'),
        }}
        bottomInset={insets.bottom}
      />
      <PassengerSheet
        visible={isPassengerSheetOpen}
        onClose={() => setIsPassengerSheetOpen(false)}
        value={passengers}
        onChange={(count) => dispatch(setPassengers(count))}
        title={t('common:terms.passengers')}
        formatCount={(count) => t('common:terms.passenger', { count })}
        hint={t('search:passengerPicker.hint', { count: 8 })}
        closeLabel={t('common:actions.close')}
        incrementLabel={t('search:passengerPicker.increment')}
        decrementLabel={t('search:passengerPicker.decrement')}
        confirmLabel={t('common:actions.confirm')}
        confirmAriaLabel={(countLabel) => `${t('common:actions.confirm')} ${countLabel}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // A normal flex sibling above the card, sized to an explicit height (not
  // flex:1, not an absoluteFill layer behind it) — see the comment at its
  // usage site. `position: relative` so brandBar can anchor to its bottom.
  mapSection: {
    position: 'relative',
    overflow: 'hidden',
  },
  brandBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: BRAND_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationButton: {
    position: 'absolute',
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  card: {
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.lg,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  handle: {
    alignItems: 'center',
    marginBottom: -spacing.sm,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  headline: {
    textAlign: 'center'
  },
  locationBlock: {
    position: 'relative',
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  connectorCol: {
    position: 'absolute',
    left: spacing.md + 15,
    top: spacing.md + 40,
    bottom: spacing.md + 8,
    width: 2,
  },
  // A dashed border, not a filled background — RN can't set a custom
  // dash length, but `borderStyle: 'dashed'` on a hairline-width column
  // renders a real dotted/dashed connector on both platforms.
  connectorLine: {
    flex: 1,
    width: 0,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  locationIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationTextCol: {
    flex: 1,
    gap: 1,
  },
  swapBtn: {
    position: 'absolute',
    right: spacing.md,
    top: '50%',
    marginTop: -19,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paramsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  paramBtn: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  paramBtnWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  // The filter cards' icon circle is smaller (30px) than the route card's
  // (32px) — matches the reference's hierarchy between the primary route
  // input and these secondary filters.
  filterIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
    elevation: 0,
  },
  quickNote: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
