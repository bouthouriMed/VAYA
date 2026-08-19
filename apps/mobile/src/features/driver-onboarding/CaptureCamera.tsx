import { useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Animated } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  Button,
  StepProgress,
  colors,
  spacing,
  radii,
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

function CornerBrackets(): React.JSX.Element {
  return (
    <>
      <View style={[styles.bracketH, styles.bracketTL_H]} />
      <View style={[styles.bracketV, styles.bracketTL_V]} />
      <View style={[styles.bracketH, styles.bracketTR_H]} />
      <View style={[styles.bracketV, styles.bracketTR_V]} />
      <View style={[styles.bracketH, styles.bracketBL_H]} />
      <View style={[styles.bracketV, styles.bracketBL_V]} />
      <View style={[styles.bracketH, styles.bracketBR_H]} />
      <View style={[styles.bracketV, styles.bracketBR_V]} />
    </>
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
        <View style={styles.permissionIcon}>
          <Ionicons name="camera-outline" size={32} color={colors.white} />
        </View>
        <Text variant="h3" color={colors.white} align="center">
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
        <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.permissionBack}>
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
        <View style={[styles.reviewFooter, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text variant="body" color={colors.white} align="center" style={styles.reviewLabel}>
            Photo nette et bien cadrée ?
          </Text>
          <View style={styles.reviewActions}>
            <TouchableOpacity style={styles.retakeBtn} onPress={() => setCapturedUri(null)}>
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
          {guideShape === 'document' ? <CornerBrackets /> : null}
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
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text variant="label" color={colors.white}>
            {title}
          </Text>
          <View style={styles.backBtn} />
        </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.white,
  },
  reviewFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.md,
    backgroundColor: 'rgba(28,36,41,0.75)',
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
  permissionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.navySurfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  permissionBody: {
    maxWidth: 300,
  },
  permissionCta: {
    width: '100%',
    marginTop: spacing.md,
  },
  permissionBack: {
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
});
