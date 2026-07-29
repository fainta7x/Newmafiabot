export type ThemeId = 'noir-cherry' | 'noir-cyan' | 'noir-violet' | 'noir-emerald';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  tagline: string;
  bgHex: string;
  surfaceHex: string;
  accentHex: string;
  textHex: string;
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'noir-cherry',
    name: 'Noir Cherry',
    tagline: 'Клубный нуар, мафия и вишнёвый акцент',
    bgHex: '#111113',
    surfaceHex: '#18181B',
    accentHex: '#C94F67',
    textHex: '#F5F1EA',
  },
  {
    id: 'noir-cyan',
    name: 'Noir Cyan',
    tagline: 'Технологичный и чистый digital-нуар',
    bgHex: '#0B1317',
    surfaceHex: '#111B21',
    accentHex: '#00B4D8',
    textHex: '#E6F3F5',
  },
  {
    id: 'noir-violet',
    name: 'Noir Violet',
    tagline: 'Глубокий ночной стиль с фиолетовым неоном',
    bgHex: '#120E17',
    surfaceHex: '#1A1522',
    accentHex: '#A855F7',
    textHex: '#F3EEF8',
  },
  {
    id: 'noir-emerald',
    name: 'Noir Emerald',
    tagline: 'Спокойная роскошь с изумрудным акцентом',
    bgHex: '#0E1412',
    surfaceHex: '#151E1B',
    accentHex: '#2A9D8F',
    textHex: '#F7F4EB',
  },
];

const STORAGE_KEY = 'newmafia_crm_theme';

export function getStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return 'noir-cherry';
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
  if (saved && THEMES.some((t) => t.id === saved)) {
    return saved;
  }
  return 'noir-cherry';
}

export function applyTheme(themeId: ThemeId) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', themeId);
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, themeId);
  }
}

export function initTheme(): ThemeId {
  const current = getStoredTheme();
  applyTheme(current);
  return current;
}
