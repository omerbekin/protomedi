/**
 * Sanal çözünürlüğü ekrana sığdıracak ölçeği hesaplar.
 * Ekran yeterince büyükse tamsayı ölçek (keskin pikseller); sanal çözünürlükten
 * küçük ekranlarda (ör. dikey telefon) 1'in altına iner ki oyun ekrandan taşmasın.
 */
export function computeZoom(
  screenWidth: number,
  screenHeight: number,
  virtualWidth: number,
  virtualHeight: number,
): number {
  const fit = Math.min(screenWidth / virtualWidth, screenHeight / virtualHeight);
  if (fit >= 1) return Math.floor(fit);
  return Math.max(fit, 0.1);
}
