// Sefer verisi: data/campaign/*.json dosyalarını sefer tiplerine bağlar ("_not" açıklama alanları atılır).
import valdoriaJson from '../../data/campaign/valdoria.json';
import campaignJson from '../../data/campaign/campaign.json';
import encountersJson from '../../data/campaign/encounters.json';
import eventsJson from '../../data/campaign/events.json';
import type { CampaignConfig, CampaignMap, EncounterDef } from './types';

const strip = <T>(o: unknown): Record<string, T> =>
  Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([k]) => !k.startsWith('_'))) as Record<string, T>;

export const MAPS: Record<string, CampaignMap> = {
  valdoria: valdoriaJson as unknown as CampaignMap,
};

export const CONFIG: CampaignConfig = campaignJson as unknown as CampaignConfig;

export const ENCOUNTERS: Record<string, EncounterDef> = strip<EncounterDef>(encountersJson);

export interface EventText {
  title: string;
  text: string;
  reward?: string;
}

export const EVENTS: Record<string, EventText> = (eventsJson as unknown as { events: Record<string, EventText> }).events;
export const TREASURES: Record<string, EventText> = (eventsJson as unknown as { treasures: Record<string, EventText> }).treasures;

export function getMap(id: string): CampaignMap {
  const m = MAPS[id];
  if (!m) throw new Error(`Campaign map not found: ${id}`);
  return m;
}
