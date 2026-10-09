/**
 * v2 SKILL ANİMASYONU KAYDI: her class için TEK satır (şimdiden tümü dolu; content-designer ajanları bu dosyaya DOKUNMAZ, yalnızca
 * kendi <classId>/vfx.ts dosyasını doldurur). Shared'in v2 animasyonu yok (kapsam dışı), Cutthroat tamamen kapsam dışı. Defender 2026-10-10'da
 * eklendi (sprite sheet efektleri: assets/vfx/defender).
 * Class dosyaları Phaser'ı çalışma zamanında içe aktarmadığı için bu kayıt node testlerinde de yüklenir.
 */
import type { V2Vfx } from './types';
import { VFX as antimage } from './antimage/vfx';
import { VFX as aoe_tester } from './aoe_tester/vfx';
import { VFX as archer } from './archer/vfx';
import { VFX as defender } from './defender/vfx';
import { VFX as druid } from './druid/vfx';
import { VFX as gambler } from './gambler/vfx';
import { VFX as hexer } from './hexer/vfx';
import { VFX as mage } from './mage/vfx';
import { VFX as paladin } from './paladin/vfx';
import { VFX as undead } from './undead/vfx';
import { VFX as warrior } from './warrior/vfx';

export const VFX_V2: Readonly<Record<string, Record<string, V2Vfx>>> = { antimage, aoe_tester, archer, defender, druid, gambler, hexer, mage, paladin, undead, warrior };
