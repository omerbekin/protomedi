import { content } from '../engine';

/** Hücre listesi (dizin = yuva): verilen sınıfları sırayla ilk hücrelere koyar. */
const cellsOf = (ids: string[]): string[] => {
  const cells: string[] = Array.from({ length: content.CELL_COUNT }, () => '');
  ids.slice(0, cells.length).forEach((id, i) => (cells[i] = id));
  return cells;
};

/** Önizleme sahnesinin takımları (Phaser'sız): oyuncu tarafında tüm class'lar (her skill'in sahibi sahnede), düşman tarafında 6 class. */
export function stageTeams(): { party: string[]; enemies: string[] } {
  const all = content.arrangeTeam(Object.keys(content.classes));
  return { party: cellsOf(all), enemies: cellsOf(all.slice(0, 6)) };
}
