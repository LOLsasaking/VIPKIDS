/**
 * Design tokens for VIP KIDS TRANSPORTATION — premium dark luxury theme.
 */
export const C = {
  bg: '#09090B',
  bgSecondary: '#18181B',
  bgTertiary: '#27272A',
  bgElevated: '#1C1C22',
  text: '#FAFAFA',
  textSecondary: '#A19C93',
  textMuted: '#71717A',
  gold: '#D4AF37',
  goldMuted: '#B5952F',
  accent: '#E5E4E2',
  danger: '#EF4444',
  success: '#10B981',
  border: '#27272A',
  borderLight: '#3F3F46',
};

export const S = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const Fonts = {
  display: 'PlayfairDisplay_600SemiBold',
  displayMedium: 'PlayfairDisplay_500Medium',
  body: 'Outfit_400Regular',
  bodyMedium: 'Outfit_500Medium',
  bodySemiBold: 'Outfit_600SemiBold',
};

export const T = {
  h1: { fontSize: 32, fontFamily: Fonts.display, lineHeight: 40, color: C.text, letterSpacing: 0.5 },
  h2: { fontSize: 26, fontFamily: Fonts.display, lineHeight: 34, color: C.text, letterSpacing: 0.4 },
  h3: { fontSize: 20, fontFamily: Fonts.displayMedium, lineHeight: 28, color: C.text, letterSpacing: 0.25 },
  bodyLg: { fontSize: 17, fontFamily: Fonts.body, lineHeight: 25, color: C.text },
  body: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 22, color: C.text },
  bodySm: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 18, color: C.textSecondary },
  caption: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    lineHeight: 16,
    color: C.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
};
