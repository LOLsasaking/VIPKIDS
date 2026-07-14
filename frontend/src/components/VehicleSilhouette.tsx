import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

type Props = {
  width?: number;
  color?: string;
  kind?: 'sedan' | 'suv' | 'van';
};

export default function VehicleSilhouette({ width = 104, color = '#111111', kind = 'suv' }: Props) {
  const height = width * 0.46;
  const roof = kind === 'sedan'
    ? 'M31 25 L43 11 H73 L87 25'
    : kind === 'van'
      ? 'M23 25 L30 8 H88 L99 25'
      : 'M25 25 L36 9 H82 L94 25';

  return (
    <Svg width={width} height={height} viewBox="0 0 120 55" accessibilityElementsHidden>
      <Path d={roof} stroke={color} strokeWidth="5" strokeLinejoin="round" fill="none" />
      <Path d="M12 28 C13 23 19 21 26 21 H96 C106 21 111 27 112 35 V42 H8 V35 C8 31 9 29 12 28Z" fill={color} />
      <Rect x="18" y="30" width="17" height="5" rx="2.5" fill="#FFFFFF" opacity={0.78} />
      <Rect x="90" y="30" width="15" height="5" rx="2.5" fill="#FFFFFF" opacity={0.78} />
      <Circle cx="29" cy="43" r="8" fill="#FFFFFF" stroke={color} strokeWidth="5" />
      <Circle cx="91" cy="43" r="8" fill="#FFFFFF" stroke={color} strokeWidth="5" />
    </Svg>
  );
}
