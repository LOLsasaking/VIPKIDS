/**
 * Photo picker — wraps expo-image-picker with permission handling and base64 output.
 * Returns a data: URL ready to send to backend.
 */
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking, Platform } from 'react-native';

export async function pickPhoto(): Promise<string | null> {
  // Web doesn't need explicit permission
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        Alert.alert(
          'Photo Access Needed',
          'Please enable photo library access in Settings to choose a profile picture.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
      } else {
        Alert.alert('Permission required', 'Photo library access is required to choose a picture.');
      }
      return null;
    }
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.6,
    base64: true,
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (result.canceled || !result.assets || !result.assets[0]) return null;
  const a = result.assets[0];
  if (a.base64) return `data:image/jpeg;base64,${a.base64}`;
  return a.uri;
}
