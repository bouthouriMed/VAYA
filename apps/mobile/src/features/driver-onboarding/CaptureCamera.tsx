import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Animated, AccessibilityInfo } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  Button,
  StepProgress,
  ScreenHeader,
  RoutePulseBadge,
  colors,
  spacing,
  radii,
  elevation,
  typography,
} from '@vaya/design-system';

export type CaptureGuideShape = 'document' | 'face';

interface CaptureCameraProps {
  facing: CameraType;
  guideShape: CaptureGuideShape;
  title: string;
  instruction: string;
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onCapture: (uri: string) => void;
}

const DOC_FRAME_WIDTH = 300;
const DOC_FRAME_HEIGHT = 190;
const FACE_FRAME_WIDTH = 230;
const FACE_FRAME_HEIGHT = 300;
const BRACKET_LEN = 28;
const BRACKET_THICKNESS = 4;

function CornerBrackets({ pulse }: { pulse: Animated.Value }): React.JSX.Element {
  return (
    <Animated.View style={{ opacity: pulse }}>
      <View style={[styles.bracketH, styles.bracketTL_H]} />
      <View style={[styles.bracketV, styles.bracketTL_V]} />
      <View style={[styles.bracketH, styles.bracketTR_H]} />
      <View style={[styles.bracketV, styles.bracketTR_V]} />
      <View style={[styles.bracketH, styles.bracketBL_H]} />
      <View style={[styles.bracketV, styles.bracketBL_V]} />
      <View style={[styles.bracketH, styles.bracketBR_H]} />
      <View style={[styles.bracketV, styles.bracketBR_V]} />
    </Animated.View>
  );
}

export function CaptureCamera({
  facing,
  guideShape,
  title,
  instruction,
  currentStep,
  totalSteps,
  onBack,
  onCapture,
}: CaptureCameraProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const flash = useRef(new Animated.Value(0)).current;
  const bracketPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      Animated.loop(
        Animated.sequence([
          Animated.timing(bracketPulse, {
            toValue: 0.45,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(bracketPulse, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const frameWidth = guideShape === 'document' ? DOC_FRAME_WIDTH : FACE_FRAME_WIDTH;
  const frameHeight = guideShape === 'document' ? DOC_FRAME_HEIGHT : FACE_FRAME_HEIGHT;

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
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionWrap]}>
        <RoutePulseBadge icon="camera" size="hero" tone="onNavy" />
        <Text variant="h3" color={colors.white} align="center" style={styles.permissionTitle}>
          Accès à la caméra requis
        </Text>
        <Text
          variant="body"
          color={colors.navyTextMuted}
          align="center"
          style={styles.permissionBody}
        >
          VAYA a besoin de la caméra pour vérifier votre permis, votre assurance et votre identité
          en direct — jamais depuis votre galerie.
        </Text>
        <Button
          label="Autoriser la caméra"
          size="lg"
          onPress={() => void requestPermission()}
          style={styles.permissionCta}
        />
        <TouchableOpacity
          onPress={onBack}
          hitSlop={12}
          style={styles.permissionBack}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Text variant="bodySmall" color={colors.navyTextMuted}>
            Retour
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (capturedUri) {
    return (
      <View style={styles.container}>
        <Image
          source={{ uri: capturedUri }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
        <View style={styles.reviewScrim} />
        <View style={[styles.reviewFooter, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text variant="h3" color={colors.white} align="center" style={styles.reviewLabel}>
            Photo nette et bien cadrée ?
          </Text>
          <View style={styles.reviewActions}>
            <TouchableOpacity
              style={styles.retakeBtn}
              onPress={() => setCapturedUri(null)}
              accessibilityRole="button"
              accessibilityLabel="Reprendre la photo"
            >
              <Ionicons name="refresh" size={18} color={colors.white} />
              <Text variant="label" color={colors.white}>
                Reprendre
              </Text>
            </TouchableOpacity>
            <Button
              label="Utiliser cette photo"
              size="lg"
              onPress={() => onCapture(capturedUri)}
              style={styles.useBtn}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing={facing} />
      <Animated.View pointerEvents="none" style={[styles.flashOverlay, { opacity: flash }]} />

      <View style={styles.dimTop} />
      <View style={[styles.dimMiddleRow, { height: frameHeight }]}>
        <View style={styles.dimSide} />
        <View style={{ width: frameWidth, height: frameHeight }}>
          <View
            style={[
              styles.frameWindow,
              guideShape === 'face'
                ? styles.frameWindowOval
                : { borderRadius: radii.xl, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' },
            ]}
          />
          {guideShape === 'document' ? <CornerBrackets pulse={bracketPulse} /> : null}
        </View>
        <View style={styles.dimSide} />
      </View>
      <View style={styles.dimBottom}>
        <Text variant="body" color={colors.white} align="center" style={styles.instruction}>
          {instruction}
        </Text>
      </View>

      <View
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        <ScreenHeader onBack={onBack} title={title} tone="dark" />
        <StepProgress
          currentStep={currentStep}
          totalSteps={totalSteps}
          style={styles.stepProgress}
        />
      </View>

      <View style={[styles.shutterWrap, { paddingBottom: insets.bottom + spacing.xl }]}>
        <TouchableOpacity
          style={styles.shutterOuter}
          onPress={() => void capture()}
          disabled={isCapturing}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Prendre la photo"
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navySurface,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.white,
  },
  dimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '22%',
    backgroundColor: 'rgba(28,36,41,0.55)',
  },
  dimMiddleRow: {
    position: 'absolute',
    top: '22%',
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  dimSide: {
    flex: 1,
    backgroundColor: 'rgba(28,36,41,0.55)',
  },
  dimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '48%',
    backgroundColor: 'rgba(28,36,41,0.55)',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    alignItems: 'center',
  },
  instruction: {
    maxWidth: 280,
  },
  frameWindow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  frameWindowOval: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  bracketH: {
    position: 'absolute',
    width: BRACKET_LEN,
    height: BRACKET_THICKNESS,
    backgroundColor: colors.secondaryLight,
    borderRadius: 2,
  },
  bracketV: {
    position: 'absolute',
    width: BRACKET_THICKNESS,
    height: BRACKET_LEN,
    backgroundColor: colors.secondaryLight,
    borderRadius: 2,
  },
  bracketTL_H: { top: -1, left: -1 },
  bracketTL_V: { top: -1, left: -1 },
  bracketTR_H: { top: -1, right: -1 },
  bracketTR_V: { top: -1, right: -1 },
  bracketBL_H: { bottom: -1, left: -1 },
  bracketBL_V: { bottom: -1, left: -1 },
  bracketBR_H: { bottom: -1, right: -1 },
  bracketBR_V: { bottom: -1, right: -1 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  stepProgress: {
    marginTop: 2,
  },
  shutterWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation?.lg,
    shadowColor: colors.black,
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.white,
  },
  reviewScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,36,41,0.15)',
  },
  reviewFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.md,
    backgroundColor: 'rgba(28,36,41,0.8)',
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
  },
  reviewLabel: {
    fontWeight: typography.fontWeight.semibold,
  },
  reviewActions: {
    gap: spacing.sm,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  useBtn: {
    width: '100%',
  },
  permissionWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  permissionTitle: {
    marginTop: spacing.md,
  },
  permissionBody: {
    maxWidth: 300,
  },
  permissionCta: {
    width: '100%',
    marginTop: spacing.md,
    ...elevation?.lg,
    shadowColor: colors.primary,
  },
  permissionBack: {
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
});
