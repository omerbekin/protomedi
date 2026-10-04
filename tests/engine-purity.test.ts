import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// CLAUDE.md kuralı: motor saf TypeScript; Phaser/DOM/window yok, Math.random yok.
const ENGINE_DIR = join(__dirname, '..', 'src', 'engine');

function engineFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return engineFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/Math\.random/, 'Math.random (seed\'li Rng kullan)'],
  [/from\s+['"]phaser['"]/, 'Phaser importu'],
  [/\bwindow\./, 'window erişimi'],
  [/\bdocument\./, 'document erişimi'],
  [/\blocalStorage\b/, 'localStorage erişimi'],
];

describe('motor saflığı', () => {
  const files = engineFiles(ENGINE_DIR);

  it('motor klasöründe en az bir dosya var', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file.slice(ENGINE_DIR.length + 1)} yasak bağımlılık içermiyor`, () => {
      // Yorumlar sayılmaz ("Math.random yasak" gibi açıklamalar testi bozmasın)
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      const hits = FORBIDDEN.filter(([re]) => re.test(src)).map(([, why]) => why);
      expect(hits).toEqual([]);
    });
  }
});
