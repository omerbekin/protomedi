// Statın yalnızca adı (değersiz): motorun describeStat başlığı değeri de taşır ("Strength 5", "Crit chance 7.5%", "Crit damage x1.5").
// Değeri ayrı sütunda gösteren yerler (savaş HUD'ı karakter sayfası, Codex başlıkları) adı buradan alır (değer iki kez yazılmasın).
export function statName(title: string): string {
  return title.replace(/\s+x?[-+−]?\d[\d.,]*%?(\s*\/\s*t(urn)?)?$/i, '').trim();
}
