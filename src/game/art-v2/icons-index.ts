/**
 * v2 İKON KAYDI: her class için TEK satır (şimdiden tümü dolu; content-designer ajanları bu dosyaya DOKUNMAZ, yalnızca kendi
 * <classId>/icons.ts dosyasını doldurur). Defender ikonları 2026-10-10'da eklendi (hazır PNG: { image }), Cutthroat tamamen kapsam dışı.
 * tests/asset-versions.test.ts her sürümlü anahtarın burada kaydı olduğunu denetler.
 */
import type { ClassIconsV2 } from './types';
import * as antimage from './antimage/icons';
import * as aoe_tester from './aoe_tester/icons';
import * as archer from './archer/icons';
import * as defender from './defender/icons';
import * as druid from './druid/icons';
import * as gambler from './gambler/icons';
import * as hexer from './hexer/icons';
import * as mage from './mage/icons';
import * as paladin from './paladin/icons';
import * as shared from './shared/icons';
import * as undead from './undead/icons';
import * as warrior from './warrior/icons';

export const ICONS_V2: Readonly<Record<string, ClassIconsV2>> = { antimage, aoe_tester, archer, defender, druid, gambler, hexer, mage, paladin, shared, undead, warrior };
