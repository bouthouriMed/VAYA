import { useMemo, useRef, useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, PanResponder, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, colors, spacing, radii, typography } from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { confirmPickupPoint } from '../../src/state/searchSlice';
import { PLACES } from '../../src/mocks/seed-data';

// Arbitrary demo projection: not geographically accurate, just consistent
// enough that "drag toward a known place" and "the map snaps to it" agree.
const PX_PER_DEGREE = 9000;
const SNAP_THRESHOLD_PX = 46;
const GRID_STEP = 70;
const GRID_EXTENT = 700;

interface Poi {
  id: string;
  label: string;
  subLabel: string;
  dx: number;
  dy: number;
}

function buildGridLines(): number[] {
  const lines: number[] = [];
  for (let v = -GRID_EXTENT; v <= GRID_EXTENT; v += GRID_STEP) lines.push(v);
  return lines;
}
const GRID_LINES = buildGridLines();

export default function PickupPointScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const origin = useAppSelector((s) => s.search.origin);
  const fallbackOrigin = PLACES[0]!;
  const originLat = origin?.lat ?? fallbackOrigin.lat;
  const originLng = origin?.lng ?? fallbackOrigin.lng;

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const offsetRef = useRef({ x: 0, y: 0 });
  const [liveOffset, setLiveOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const id = pan.addListener(setLiveOffset);
    return () => pan.removeListener(id);
  }, [pan]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        pan.setOffset(offsetRef.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gesture) => {
        offsetRef.current = {
          x: offsetRef.current.x + gesture.dx,
          y: offsetRef.current.y + gesture.dy,
        };
        pan.flattenOffset();
      },
    }),
  ).current;

  const pois = useMemo<Poi[]>(
    () =>
      PLACES.map((p) => ({
        id: p.id,
        label: p.label,
        subLabel: p.subLabel,
        dx: (p.lng - originLng) * PX_PER_DEGREE,
        dy: (originLat - p.lat) * PX_PER_DEGREE,
      })),
    [originLat, originLng],
  );

  const nearest = useMemo(() => {
    let best: Poi | null = null;
    let bestDist = Infinity;
    for (const poi of pois) {
      const sx = poi.dx + liveOffset.x;
      const sy = poi.dy + liveOffset.y;
      const dist = Math.hypot(sx, sy);
      if (dist < bestDist) {
        best = poi;
        bestDist = dist;
      }
    }
    return { poi: best, dist: bestDist };
  }, [pois, liveOffset]);

  const snapped = nearest.dist < SNAP_THRESHOLD_PX;
  const label = snapped && nearest.poi ? nearest.poi.label : 'Point personnalisé';
  const subLabel =
    snapped && nearest.poi ? nearest.poi.subLabel : 'Faites glisser la carte pour ajuster';

  function confirm(): void {
    const finalLng = originLng - liveOffset.x / PX_PER_DEGREE;
    const finalLat = originLat + liveOffset.y / PX_PER_DEGREE;
    dispatch(
      confirmPickupPoint({
        label,
        subLabel: snapped && nearest.poi ? nearest.poi.subLabel : undefined,
        lat: finalLat,
        lng: finalLng,
        isCurrentPosition: !snapped && origin?.isCurrentPosition,
      }),
    );
    router.back();
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapWrap} {...panResponder.panHandlers}>
        <Animated.View
          style={[
            styles.world,
            {
              transform: [{ translateX: pan.x }, { translateY: pan.y }],
            },
          ]}
        >
          <View style={styles.blockA} />
          <View style={styles.blockB} />
          {GRID_LINES.map((v) => (
            <View key={`h${v}`} style={[styles.gridLineH, { top: GRID_EXTENT + v }]} />
          ))}
          {GRID_LINES.map((v) => (
            <View key={`v${v}`} style={[styles.gridLineV, { left: GRID_EXTENT + v }]} />
          ))}
          {pois.map((poi) => (
            <View
              key={poi.id}
              style={[
                styles.poiDot,
                { left: GRID_EXTENT + poi.dx - 5, top: GRID_EXTENT + poi.dy - 5 },
              ]}
            />
          ))}
        </Animated.View>

        <View style={styles.centerPinWrap} pointerEvents="none">
          <Ionicons name="location" size={40} color={colors.primary} />
          <View style={styles.pinShadow} />
        </View>

        <View
          style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.gray900} />
          </TouchableOpacity>
          <View style={styles.hint}>
            <Text variant="bodySmall" color={colors.gray700}>
              Faites glisser pour ajuster
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.footerRow}>
          <View style={styles.footerIcon}>
            <Ionicons name="pin" size={16} color={colors.white} />
          </View>
          <View style={styles.footerTextCol}>
            <Text style={styles.footerLabel}>{label}</Text>
            <Text variant="bodySmall" color={colors.gray500} numberOfLines={1}>
              {subLabel}
            </Text>
          </View>
        </View>
        <Button
          label="Confirmer ce point de rendez-vous"
          size="lg"
          onPress={confirm}
          style={styles.cta}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  mapWrap: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.mapTileTint,
  },
  world: {
    position: 'absolute',
    width: GRID_EXTENT * 2,
    height: GRID_EXTENT * 2,
    left: '50%',
    top: '50%',
    marginLeft: -GRID_EXTENT,
    marginTop: -GRID_EXTENT,
  },
  blockA: {
    position: 'absolute',
    left: GRID_EXTENT - 260,
    top: GRID_EXTENT - 180,
    width: 150,
    height: 110,
    borderRadius: radii.xl,
    backgroundColor: colors.mapCorridorFill,
  },
  blockB: {
    position: 'absolute',
    left: GRID_EXTENT + 90,
    top: GRID_EXTENT + 140,
    width: 190,
    height: 130,
    borderRadius: radii.xl,
    backgroundColor: colors.mapCorridorFill,
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.gray300,
    opacity: 0.5,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.gray300,
    opacity: 0.5,
  },
  poiDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.gray400,
  },
  centerPinWrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -20,
    marginTop: -40,
    alignItems: 'center',
  },
  pinShadow: {
    width: 14,
    height: 6,
    borderRadius: 7,
    backgroundColor: colors.gray900,
    opacity: 0.18,
    marginTop: -2,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  hint: {
    backgroundColor: colors.white,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  footer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerTextCol: {
    flex: 1,
  },
  footerLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray900,
  },
  cta: {
    width: '100%',
  },
});
