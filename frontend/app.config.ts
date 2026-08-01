import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY || '';
  return {
    ...config,
    name: config.name || 'VIP Kids Transportation',
    slug: config.slug || 'vipkids-transportation',
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: { apiKey: googleMapsKey },
      },
    },
    plugins: [
      ...(config.plugins || []),
      ['react-native-maps', { androidGoogleMapsApiKey: googleMapsKey }],
    ],
  };
};
