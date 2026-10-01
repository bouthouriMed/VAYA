import { View, StyleSheet, ScrollView } from 'react-native';
import MapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Text,
  MapRoute,
  GlassSurface,
  RouteOptionCard,
  useAppTheme,
  spacing,
  regionForPoints,
  lightMapStyle,
  darkMapStyle,
} from '@vaya/design-system';
import type { RouteOption } from '../../state/api';
import { decodePolyline } from '../../utils/polyline';
import { publishStyles as styles } from './publishStyles';
import { PrimaryButton, StepHeader } from './PublishChrome';

const TUNIS_REGION = { latitude: 36.8065, longitude: 10.1815, latitudeDelta: 0.045, longitudeDelta: 0.045 };

interface RouteStepProps {
  title: string;
  onBack: () => void;
  routeOptions: RouteOption[];
  selectedRouteToken: string | null;
  onSelectRoute: (token: string) => void;
  errorMessage?: string | null;
  isCreating: boolean;
  onContinue: () => void;
}

/** Publish wizard — choose between the real route alternatives the server computed. */
export function RouteStep({
  title,
  onBack,
  routeOptions,
  selectedRouteToken,
  onSelectRoute,
  errorMessage,
  isCreating,
  onContinue,
}: RouteStepProps): React.JSX.Element {
  const { t } = useTranslation(['driver', 'common']);
  const insets = useSafeAreaInsets();
  const { colors: theme, scheme } = useAppTheme();
    const decodedByToken = new Map(
      routeOptions.map((o) => [o.token, decodePolyline(o.polyline)] as const),
    );
    const allPoints = routeOptions.flatMap(
      (o) => decodedByToken.get(o.token)?.map((c) => ({ lat: c.latitude, lng: c.longitude })) ?? [],
    );
    const routeOptionsRegion = regionForPoints(allPoints) ?? TUNIS_REGION;

    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <StepHeader title={title} onBack={onBack} />
        </View>

        <View style={styles.routeMapSection}>
          <MapView
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_DEFAULT}
            customMapStyle={scheme === 'dark' ? darkMapStyle : lightMapStyle}
            userInterfaceStyle={scheme}
            initialRegion={routeOptionsRegion}
          >
            {/* A single stable-order pass, never two filtered/reordered
                lists — on iOS, react-native-maps crashes when a MapView's
                overlay children change POSITION between renders (not just
                count), which is exactly what splitting into "unselected"/
                "selected" arrays did every time selectedRouteToken changed.
                Selection is now expressed purely via color/width/corridor
                props on an unmoving set of nodes. */}
            {routeOptions.map((option) => {
              const isSelected = option.token === selectedRouteToken;
              return (
                <MapRoute
                  key={option.token}
                  coordinates={decodedByToken.get(option.token) ?? []}
                  color={isSelected ? theme.accent : theme.inkFaint}
                  width={isSelected ? 5 : 3}
                  showCorridor={isSelected}
                />
              );
            })}
          </MapView>
        </View>

        <GlassSurface theme={theme} scheme={scheme} radius="2xl" style={styles.routeSheet}>
          <ScrollView contentContainerStyle={styles.routeList} showsVerticalScrollIndicator={false}>
            <Text variant="label" color={theme.inkFaint} style={styles.eyebrow}>
              {t('driver:publish.routeStep.availableCount', { count: routeOptions.length })}
            </Text>
            {routeOptions.map((option) => (
              <RouteOptionCard
                key={option.token}
                option={option}
                selected={option.token === selectedRouteToken}
                onPress={() => onSelectRoute(option.token)}
                theme={theme}
                tollsLabel={t('driver:publish.routeStep.tollsLabel')}
                noTollsLabel={t('driver:publish.routeStep.noTollsLabel')}
                estimateLabel={t('driver:publish.routeStep.estimateLabel')}
                recommendedLabel={t('driver:publish.routeStep.recommendedLabel')}
              />
            ))}
          </ScrollView>
        </GlassSurface>

        {errorMessage ? (
          <Text variant="bodySmall" color={theme.error} align="center">
            {errorMessage}
          </Text>
        ) : null}

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <PrimaryButton
            label={t('common:actions.continue')}
            loading={isCreating}
            disabled={!selectedRouteToken}
            onPress={onContinue}
          />
        </View>
      </View>
    );
}
