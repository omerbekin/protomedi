/**
 * v2 SES KAYDI: her sürüm anahtarı için TEK satır (şimdiden tümü dolu; content-designer ajanları bu dosyaya DOKUNMAZ, yalnızca
 * kendi data/audio-v2/<classId>.json dosyasını doldurur). Şema data/audio.json > sfx ile aynı. Cutthroat kapsam dışı.
 */
import type { AudioFileV2 } from './types';
import antimage from '../../../data/audio-v2/antimage.json';
import aoe_tester from '../../../data/audio-v2/aoe_tester.json';
import archer from '../../../data/audio-v2/archer.json';
import defender from '../../../data/audio-v2/defender.json';
import druid from '../../../data/audio-v2/druid.json';
import gambler from '../../../data/audio-v2/gambler.json';
import hexer from '../../../data/audio-v2/hexer.json';
import mage from '../../../data/audio-v2/mage.json';
import paladin from '../../../data/audio-v2/paladin.json';
import shared from '../../../data/audio-v2/shared.json';
import undead from '../../../data/audio-v2/undead.json';
import warrior from '../../../data/audio-v2/warrior.json';

export const AUDIO_V2 = { antimage, aoe_tester, archer, defender, druid, gambler, hexer, mage, paladin, shared, undead, warrior } as unknown as Readonly<Record<string, AudioFileV2>>;
