import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, Input, colors, spacing, radii } from '@vaya/design-system';
import { router } from 'expo-router';
import { useCreateDriverOnboardingMutation, useUploadFileMutation } from '../../src/state/api';

function fileFromUri(uri: string): FormData {
  const formData = new FormData();
  const filename = uri.split('/').pop() ?? 'upload.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const ext = match?.[1] ?? 'jpg';
  // React Native's fetch polyfill accepts this {uri,name,type} shape in
  // place of a real Blob/File — there is no File API on-device.
  formData.append('file', { uri, name: filename, type: `image/${ext}` } as unknown as Blob);
  return formData;
}

export default function DriverOnboardingScreen(): React.JSX.Element {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [seatCount, setSeatCount] = useState('4');
  const [licenseUri, setLicenseUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const [uploadFile, { isLoading: isUploading }] = useUploadFileMutation();
  const [createOnboarding, { isLoading: isSubmitting }] = useCreateDriverOnboardingMutation();

  async function pickLicensePhoto(): Promise<void> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setLicenseUri(result.assets[0].uri);
    }
  }

  const canSubmit =
    make.trim() &&
    model.trim() &&
    color.trim() &&
    plateNumber.trim() &&
    Number(seatCount) >= 1 &&
    licenseUri &&
    !isUploading &&
    !isSubmitting;

  async function submit(): Promise<void> {
    if (!canSubmit || !licenseUri) return;
    setErrorMessage(undefined);
    try {
      const { url } = await uploadFile(fileFromUri(licenseUri)).unwrap();
      await createOnboarding({
        vehicle: {
          make: make.trim(),
          model: model.trim(),
          color: color.trim(),
          plateNumber: plateNumber.trim(),
          seatCount: Number(seatCount),
        },
        documents: [{ type: 'license', fileUrl: url }],
      }).unwrap();
      router.replace('/driver/publish');
    } catch {
      setErrorMessage("Impossible d'enregistrer votre profil conducteur. Réessayez.");
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="body" color={colors.gray600}>
        Ajoutez votre véhicule et un justificatif — votre profil est activé immédiatement.
      </Text>

      <Input label="Marque" value={make} onChangeText={setMake} placeholder="Peugeot" />
      <Input label="Modèle" value={model} onChangeText={setModel} placeholder="208" />
      <Input label="Couleur" value={color} onChangeText={setColor} placeholder="Grise" />
      <Input
        label="Plaque d'immatriculation"
        value={plateNumber}
        onChangeText={setPlateNumber}
        placeholder="208TU1234"
        autoCapitalize="characters"
      />
      <Input
        label="Nombre de places"
        value={seatCount}
        onChangeText={(v) => setSeatCount(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
      />

      <View style={styles.docSection}>
        <Text variant="label" color={colors.gray700}>
          Permis de conduire
        </Text>
        <TouchableOpacity style={styles.docPicker} onPress={() => void pickLicensePhoto()}>
          {licenseUri ? (
            <Image source={{ uri: licenseUri }} style={styles.docPreview} />
          ) : (
            <View style={styles.docPlaceholder}>
              <Ionicons name="camera-outline" size={28} color={colors.gray500} />
              <Text variant="bodySmall" color={colors.gray500}>
                Ajouter une photo
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {errorMessage ? (
        <Text variant="bodySmall" color={colors.error}>
          {errorMessage}
        </Text>
      ) : null}

      <Button
        label="Activer mon profil conducteur"
        size="lg"
        loading={isUploading || isSubmitting}
        disabled={!canSubmit}
        onPress={() => void submit()}
        style={styles.cta}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['4xl'],
  },
  docSection: {
    gap: spacing.xs,
  },
  docPicker: {
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  docPreview: {
    width: '100%',
    height: 160,
    borderRadius: radii.lg,
  },
  docPlaceholder: {
    height: 120,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.gray300,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
  },
  cta: {
    width: '100%',
    marginTop: spacing.md,
  },
});
