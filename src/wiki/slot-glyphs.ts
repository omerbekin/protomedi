/**
 * Codex "Items and gear" makalesi için yuva siluetleri (24x24 çizgi, nadirlik rengiyle boyanır). Çizgiler Gear ekranındaki
 * (src/ui/gear-screen.ts > SLOT_SVG) siluetlerle AYNIDIR; o dosya sefer arayüzü olduğu için burada kopya tutulur. Gear ekranı
 * ileride bunu kullanırsa kopya kalkar.
 */
export const SLOT_GLYPH: Readonly<Record<string, string>> = {
  weapon: 'M5 19 L15 9 M13 7 L17 3 L21 3 L21 7 L17 11 M4 16 L8 20 M3 21 L5 19',
  helm: 'M4 15 C4 8 8 4 12 4 C16 4 20 8 20 15 L20 19 L15 19 L15 14 L9 14 L9 19 L4 19 Z',
  armor: 'M7 3 L10 5 L14 5 L17 3 L21 7 L18 10 L18 21 L6 21 L6 10 L3 7 Z',
  gloves: 'M7 21 L7 11 L5 7 L7 6 L9 9 L9 4 L11 4 L11 9 L12 3 L14 3 L14 9 L15 4 L17 4 L17 13 L15 21 Z',
  boots: 'M7 3 L13 3 L13 14 L20 16 L21 20 L5 20 L5 14 Z',
  trinket: 'M12 3 L12 8 M8 6 C8 4 16 4 16 6 M12 9 A6 6 0 1 0 12.01 9 Z M12 12 L12 18 M9 15 L15 15',
};

/** Yuva siluetinin SVG öğesi (bilinmeyen yuva: boş daire). */
export function slotGlyph(slot: string, color: string, cls = 'cx-slot-svg'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', SLOT_GLYPH[slot] ?? 'M12 4 A8 8 0 1 0 12.01 4 Z');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', color);
  p.setAttribute('stroke-width', '1.6');
  p.setAttribute('stroke-linejoin', 'round');
  p.setAttribute('stroke-linecap', 'round');
  svg.append(p);
  return svg;
}
