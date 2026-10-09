/**
 * Ana menü görünüm stili (Ömer 2026-10-09): 'classic' = bugünkü menü, 'elegant' = ilk taslaktaki zarif stil (Cinzel + EB Garamond,
 * ince satırlar, kor parıltısı). Önizleme: adreste `?menu=new` (elegant) / `?menu=old` (classic); parametre yoksa VARSAYILAN.
 * Ömer onaylayınca TEK DEĞİŞİKLİK: `DEFAULT_MENU_STYLE = 'elegant'` (görünüm önizlemeyle birebir aynı kalır; aynı kod yolu).
 * Etkilediği yerler: MainMenuScene (menü, Play kartları, Settings / Multiplayer sütunları) ve oyun içi Settings sütunu (`html.menu-elegant`).
 * Fontlar yerel dosyalardır (`assets/fonts`, @font-face `src/style.css`); yükleme `src/ui/menu-fonts.ts`.
 */
export type MenuStyle = 'classic' | 'elegant';

/** Varsayılan stil: onaydan sonra 'elegant' yapılır. */
export const DEFAULT_MENU_STYLE: MenuStyle = 'elegant'; // Ömer onayladı (2026-10-09); eski görünüm ?menu=old

/** Adres parametresinden stil: ?menu=new|elegant -> elegant, ?menu=old|classic -> classic; yoksa / tanınmazsa varsayılan. */
export function menuStyleFromSearch(search: string, fallback: MenuStyle = DEFAULT_MENU_STYLE): MenuStyle {
  const v = new URLSearchParams(search).get('menu')?.trim().toLowerCase();
  if (v === 'new' || v === 'elegant') return 'elegant';
  if (v === 'old' || v === 'classic') return 'classic';
  return fallback;
}

/** Bu sayfa açılışının stili (adres parametresi bir kez okunur). */
export const menuStyle: MenuStyle = typeof window === 'undefined' ? DEFAULT_MENU_STYLE : menuStyleFromSearch(window.location.search);

/** Başlık / menü satırı yazısı (Cinzel; yüklenmezse serif yedek). */
export const DISPLAY_FONT = "Cinzel, Georgia, 'Palatino Linotype', serif";
/** Açıklama / alt yazı (EB Garamond). */
export const BODY_FONT = "'EB Garamond', Georgia, 'Palatino Linotype', serif";
