import React from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';

const FULL_LOGO = require('../../assets/images/vipkids-logo.png');
const APP_MARK = require('../../assets/images/vipkids-app-icon.png');

type Props = {
  width?: number;
  compact?: boolean;
};

export default function BrandLogo({ width = 150, compact = false }: Props) {
  const height = compact ? width : width * (547 / 402);
  return (
    <Image
      source={compact ? APP_MARK : FULL_LOGO}
      style={[styles.image, { width, height }]}
      contentFit="contain"
      transition={120}
      accessibilityLabel="VIP Kids Transportation logo"
    />
  );
}

const styles = StyleSheet.create({
  image: { alignSelf: 'center' },
});
