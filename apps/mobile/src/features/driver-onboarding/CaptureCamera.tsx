import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Animated, Easing, AccessibilityInfo } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text, Icon, StepProgress, useAppTheme, spacing, radii, type IconName } from '@vaya/design-system';

export type CaptureGuideShape = 'document' | 'face';

export interface CaptureTip {
  icon: IconName;
  label: string;
}

interface CaptureCameraProps {
  facing: CameraType;
  guideShape: CaptureGuideShape;
  title: string;
  eyebrow: string;
  instruction: string;
  tips: CaptureTip[];
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onCapture: (uri: string) => void;
}

const FACE_FRAME_SIZE = 260;
const DOC_FRAME_WIDTH = 280;
const DOC_FRAME_HEIGHT = 180;

/**
 * stitch/verification/verification-identity-selfie.html +
 * verification-license-upload.html / verification-insurance-proof-b.html.
 * Stitch's document screens are actually a *fake gallery-upload* form (a
 * dashed drop-zone, no camera at all) — that's a real regression from what
 * this app already does (CLAUDE.md: "Documents en direct — jamais depuis la
 * galerie", a genuine, protected differentiator), so it's not copied. What
 * *is* adopted from Stitch: the light background, the framed (not
 * full-bleed) viewfinder, and the bento-style guidance-tip list under it —
 * applied around a still-real live `CameraView`, for both the circular
 * face guide and the rectangular document guide.
 */
export function CaptureCamera({
  facing,
  guideShape,
  title,
  eyebrow,
  instruction,
  tips,
  currentStep,
  totalSteps,
  onBack,
  onCapture,
}: CaptureCameraProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const flash = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.95)).current;
  const ringOpacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(ringScale, { toValue: 1.05, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0.4, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(ringScale, { toValue: 0.95, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0.8, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ]),
        ]),
      ).start();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isFace = guideShape === 'face';
  const frameWidth = isFace ? FACE_FRAME_SIZE : DOC_FRAME_WIDTH;
  const frameHeight = isFace ? FACE_FRAME_SIZE : DOC_FRAME_HEIGHT;

  async function capture(): Promise<void> {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo) {
        Animated.sequence([
          Animated.timing(flash, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start();
        setCapturedUri(photo.uri);
      }
    } finally {
      setIsCapturing(false);
    }
  }

  if (!permission) {
    return <View style={[styles.container, { backgroundColor: theme.background }]} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionWrap, { backgroundColor: theme.background }]}>
        <View style={[styles.permissionBadge, { backgroundColor: theme.surfaceMuted }]}>
          <Icon name="camera" size="lg" color={theme.ink} />
        </View>
        <Text variant="h3" color={theme.ink} align="center" style={styles.permissionTitle}>
          Accès à la caméra requis
        </Text>
        <Text variant="body" color={theme.inkMuted} align="center" style={styles.permissionBody}>
          VAYA a besoin de la caméra pour vérifier votre permis, votre assurance et votre identité
          en direct — jamais depuis votre galerie.
        </Text>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: theme.ink }]}
          onPress={() => void requestPermission()}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Autoriser la caméra"
        >
          <Text variant="label" color={theme.onInk}>
            Autoriser la caméra
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={12}
          style={styles.permissionBack}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Text variant="bodySmall" color={theme.inkFaint}>
            Retour
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (capturedUri) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.headerRow}>
            <View style={styles.headerSpacer} />
            <Text variant="h3" color={theme.ink} numberOfLines={1} style={styles.headerTitle}>
              {title}
            </Text>
            <View style={styles.headerSpacer} />
          </View>
        </View>

        <View style={styles.body}>
          <Text variant="body" color={theme.inkMuted} align="center" style={styles.reviewPrompt}>
            Photo nette et bien cadrée ?
          </Text>
          <View
            style={[
              isFace ? styles.faceFrameWrap : styles.docFrameWrap,
              { width: frameWidth, height: frameHeight, borderColor: theme.outline },
            ]}
          >
            <Image source={{ uri: capturedUri }} style={styles.reviewImage} resizeMode="cover" />
          </View>
        </View>

        <View style={[styles.reviewActions, { paddingBottom: insets.bottom + spacing.lg }]}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: theme.ink }]}
            onPress={() => onCapture(capturedUri)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Utiliser cette photo"
          >
            <Text variant="label" color={theme.onInk}>
              Utiliser cette photo
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.retakeBtn}
            onPress={() => setCapturedUri(null)}
            accessibilityRole="button"
            accessibilityLabel="Reprendre la photo"
          >
            <Ionicons name="refresh" size={16} color={theme.inkMuted} />
            <Text variant="label" color={theme.inkMuted}>
              Reprendre
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Icon name="arrow-back" size="sm" color={theme.ink} />
          </TouchableOpacity>
          <Text variant="h3" color={theme.ink} numberOfLines={1} style={styles.headerTitle}>
            {title}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <StepProgress currentStep={currentStep} totalSteps={totalSteps} theme={theme} />
      </View>

      <View style={styles.body}>
        <Text variant="caption" color={theme.accent} style={styles.eyebrow}>
          {eyebrow}
        </Text>
        <Text variant="body" color={theme.inkMuted} align="center" style={styles.instruction}>
          {instruction}
        </Text>

        <View style={styles.frameOuter}>
          {isFace ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.faceRing,
                { borderColor: theme.ink, transform: [{ scale: ringScale }], opacity: ringOpacity },
              ]}
            />
          ) : null}
          <View
            style={[
              isFace ? styles.faceFrameWrap : styles.docFrameWrap,
              { width: frameWidth, height: frameHeight, borderColor: theme.surface },
            ]}
          >
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing={facing} />
            <Animated.View pointerEvents="none" style={[styles.flashOverlay, { opacity: flash }]} />
            {isFace ? (
              <Svg
                pointerEvents="none"
                style={StyleSheet.absoluteFillObject}
                viewBox="0 0 100 100"
              >
                <Circle
                  cx={50}
                  cy={50}
                  r={48}
                  stroke="white"
                  strokeOpacity={0.7}
                  strokeDasharray="2,4"
                  strokeWidth={0.6}
                  fill="none"
                />
                <Path
                  d="M 30,45 C 30,25 70,25 70,45 C 70,65 65,80 50,85 C 35,80 30,65 30,45 Z"
                  stroke="white"
                  strokeOpacity={0.6}
                  strokeDasharray="4,4"
                  strokeWidth={1}
                  fill="none"
                />
              </Svg>
            ) : (
              <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                <View style={[styles.docBracket, styles.docBracketTL]} />
                <View style={[styles.docBracket, styles.docBracketTR]} />
                <View style={[styles.docBracket, styles.docBracketBL]} />
                <View style={[styles.docBracket, styles.docBracketBR]} />
              </View>
            )}
          </View>
        </View>

        <View style={styles.tipsList}>
          {tips.map((tip) => (
            <View
              key={tip.label}
              style={[styles.tipRow, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
            >
              <View style={[styles.tipIcon, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name={tip.icon} size="sm" color={theme.ink} />
              </View>
              <Text variant="body" color={theme.ink}>
                {tip.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.shutterWrap, { paddingBottom: insets.bottom + spacing.xl }]}>
        <TouchableOpacity
          style={[
            styles.shutterOuter,
            { borderColor: theme.ink, backgroundColor: theme.surface },
          ]}
          onPress={() => void capture()}
          disabled={isCapturing}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Prendre la photo"
        >
          <View style={[styles.shutterInner, { backgroundColor: theme.ink }]}>
            <Icon name="camera" size="sm" color={theme.onInk} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: spacing.xl,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  eyebrow: {
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  instruction: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    maxWidth: 300,
  },
  frameOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  faceRing: {
    position: 'absolute',
    width: FACE_FRAME_SIZE + 16,
    height: FACE_FRAME_SIZE + 16,
    borderRadius: (FACE_FRAME_SIZE + 16) / 2,
    borderWidth: 2,
  },
  faceFrameWrap: {
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 5,
  },
  docFrameWrap: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 5,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  docBracket: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: '#FFFFFF',
  },
  docBracketTL: { top: 6, left: 6, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  docBracketTR: { top: 6, right: 6, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  docBracketBL: { bottom: 6, left: 6, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  docBracketBR: { bottom: 6, right: 6, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  tipsList: {
    width: '100%',
    gap: spacing.sm,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterWrap: {
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewPrompt: {
    marginBottom: spacing.xl,
  },
  reviewImage: {
    width: '100%',
    height: '100%',
  },
  reviewActions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  cta: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  permissionBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionTitle: {
    marginTop: spacing.sm,
  },
  permissionBody: {
    maxWidth: 300,
  },
  permissionBack: {
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
});
