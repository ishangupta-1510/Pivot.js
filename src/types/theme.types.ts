export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  borderLight: string;
  error: string;
  warning: string;
  success: string;
  info: string;
}

export interface Typography {
  fontFamily: string;
  fontSize: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
  };
  fontWeight: {
    light: number;
    normal: number;
    medium: number;
    bold: number;
  };
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
}

export interface Spacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  xxl: string;
}

export interface BorderRadius {
  none: string;
  sm: string;
  md: string;
  lg: string;
  full: string;
}

export interface Shadows {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

export interface GridTheme {
  cell: {
    backgroundColor: string;
    borderColor: string;
    padding: string;
    fontSize: string;
    color: string;
    hoverBackgroundColor: string;
    selectedBackgroundColor: string;
  };
  header: {
    backgroundColor: string;
    borderColor: string;
    padding: string;
    fontSize: string;
    fontWeight: number;
    color: string;
    height: string;
  };
  subheader: {
    backgroundColor: string;
    borderColor: string;
    fontSize: string;
    fontWeight: number;
    color: string;
  };
  total: {
    backgroundColor: string;
    borderColor: string;
    fontSize: string;
    fontWeight: number;
    color: string;
  };
  subtotal: {
    backgroundColor: string;
    borderColor: string;
    fontSize: string;
    fontWeight: number;
    color: string;
  };
}

export interface Theme {
  name: string;
  colors: ColorPalette;
  typography: Typography;
  spacing: Spacing;
  borderRadius: BorderRadius;
  shadows: Shadows;
  grid: GridTheme;
  isDark: boolean;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeConfig {
  mode: ThemeMode;
  customTheme?: Partial<Theme>;
  allowUserOverrides: boolean;
}