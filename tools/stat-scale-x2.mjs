// ×2 stat ölçeği veri dönüşümü (Ömer onayı 2026-10-10; TEK SEFERLİK, docs/design/open-questions.md'deki dönüşüm maddesi).
// STR/DEX/INT/LUCK, zırh, büyü zırhı ve hız x2; her puan başı katsayı /2 (skill gücü `power`, `powerPerStack`, hibrit ölçek `pct`, can/MP/kritik/
// isabet/yenilenme katsayıları, item IP'si), zırh k x2, sıra eşiği x2, kaçınma adımı x2, item adımları ve hız tavanları x2.
// Dosya biçimi korunur: yalnızca değişen sayı metinleri yerinde değiştirilir. ×2 / /2 kayan noktada TAM (üs kaydırma), sonuçlar birebir aynı.
// Kullanım: node tools/stat-scale-x2.mjs [--check]   (--check: yalnızca neyin değişeceğini yazar)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CHECK = process.argv.includes('--check');
const ATTRS = new Set(['str', 'dex', 'int', 'luck']);
const SCALED = new Set(['str', 'dex', 'int', 'luck', 'armor', 'magicArmor', 'spd']);

/** JSON metnindeki her sayının yolu ve konumu (biçimi bozmadan değiştirmek için). */
function scanNumbers(text) {
  const out = [];
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const str = () => { i++; let s = ''; while (text[i] !== '"') { if (text[i] === '\\') { s += text[i] + text[i + 1]; i += 2; } else s += text[i++]; } i++; return JSON.parse(`"${s}"`); };
  const value = (path) => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++; ws();
      if (text[i] === '}') { i++; return; }
      for (;;) { ws(); const k = str(); ws(); i++; value([...path, k]); ws(); if (text[i] === ',') { i++; continue; } i++; return; }
    }
    if (c === '[') {
      i++; ws();
      if (text[i] === ']') { i++; return; }
      for (let n = 0; ; n++) { value([...path, n]); ws(); if (text[i] === ',') { i++; continue; } i++; return; }
    }
    if (c === '"') { str(); return; }
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (m) { out.push({ path, start: i, end: i + m[0].length, value: Number(m[0]) }); i += m[0].length; return; }
    const w = /^(true|false|null)/.exec(text.slice(i));
    i += w[0].length;
  };
  value([]);
  return out;
}

function get(obj, path) {
  return path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Dosyayı kurala göre dönüştürür: rule(path, value, parentObj, json) -> yeni değer ya da undefined (değişmez). */
function transform(file, rule, textEdit) {
  let text = readFileSync(file, 'utf8');
  const json = JSON.parse(text);
  const nums = scanNumbers(text);
  const edits = [];
  for (const n of nums) {
    const parent = get(json, n.path.slice(0, -1));
    const v = rule(n.path, n.value, parent, json);
    if (v !== undefined && v !== n.value) edits.push({ ...n, to: v });
  }
  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) text = text.slice(0, e.start) + String(e.to) + text.slice(e.end);
  if (textEdit) text = textEdit(text);
  const changed = edits.length;
  console.log(`${file}: ${changed} sayı${textEdit ? ' + metin' : ''}`);
  if (CHECK) for (const e of edits.slice().reverse()) console.log(`   ${e.path.join('.')}: ${e.value} -> ${e.to}`);
  else writeFileSync(file, text);
  JSON.parse(text); // geçerli kaldı mı
}

/** Ortak kural: stat ölçekli etkinin (scale = temel stat) gücü /2; hibrit ölçek pct /2. */
function powerRule(path, v, parent) {
  const k = path[path.length - 1];
  if (parent && typeof parent === 'object' && !Array.isArray(parent) && ATTRS.has(parent.scale) && (k === 'power' || k === 'powerPerStack')) return v / 2;
  if (k === 'pct' && path.includes('bonusScale')) return v / 2;
  return undefined;
}

/** Birim verisi (class / çağrı / boss): temel statlar, zırhlar, sabit hız ve boss bağı ekleri x2; ölçekli etki gücü /2. */
function unitRule(path, v, parent) {
  const k = path[path.length - 1];
  const p0 = path[0];
  if (p0 === 'attributes' && ATTRS.has(k)) return v * 2;
  if (path.length === 1 && (k === 'armor' || k === 'magicArmor')) return v * 2;
  if (p0 === 'overrides' && SCALED.has(k)) return v * 2;
  if ((k === 'armorAdd' || k === 'magicArmorAdd') && path.includes('boss')) return v * 2;
  return powerRule(path, v, parent);
}

const D = 'data';
const dir = (d) => readdirSync(join(D, d)).filter((f) => f.endsWith('.json')).map((f) => join(D, d, f));

// formulas: katsayılar
transform(join(D, 'formulas.json'), (path, v) => {
  const [a, b] = path;
  if (a === 'attributes') {
    if (['hpPerStr', 'mpPerInt', 'critChancePerLuck', 'hpRegenPerStr', 'mpRegenPerInt', 'accuracyPerLuck'].includes(b)) return v / 2;
    if (b === 'spdBase' || b === 'dexPerEvasionStep') return v * 2;
    return undefined; // spdPerDex aynı: hız da x2
  }
  if (a === 'armor' && b === 'k') return v * 2;
  if (a === 'turn' && b === 'threshold') return v * 2;
  return undefined;
}, (t) => t.replace('  "attributes": {', '  "statScale": 2,\n  "_statScale": "x2 stat ölçeği (Ömer 2026-10-10): STR/DEX/INT/LUCK, zırh, büyü zırhı ve hız eski değerlerin 2 katı, puan başı katsayılar yarısı. Tam sayıya yuvarlanan ölçekli değerler (hız, güçlendirilmiş statlar, çağrı varyantı STR/INT, zırh çarpanı, hazır tur payı) statScale katlarına yuvarlanır: oyun eskisiyle birebir aynı.",\n  "attributes": {'));

for (const f of [...dir('classes'), ...dir('summons'), ...dir('bosses')]) transform(f, unitRule);
transform(join(D, 'skills.json'), powerRule);
transform(join(D, 'statuses.json'), powerRule);

// item'ler: ölçekli statlar x2; IP /2, adım x2; hız tavanları x2
transform(join(D, 'items.json'), (path, v) => {
  const k = path[path.length - 1];
  if (path[0] === 'stats' && path.length === 3 && SCALED.has(path[1])) {
    if (k === 'ip') return v / 2;
    if (k === 'step') return v * 2;
  }
  if (path[0] === 'caps' && (k === 'spd' || k === 'spdPerItem')) return v * 2;
  if (path[0] === 'items' && path[2] === 'stats' && SCALED.has(k)) return v * 2;
  return undefined;
});

// Endless kalıntıları: düz zırh ekleri x2 (Iron Oath +2 -> +4)
transform(join(D, 'endless.json'), (path, v) => {
  const k = path[path.length - 1];
  if (path.includes('effect') && (k === 'armorAdd' || k === 'magicArmorAdd' || k === 'spdAdd')) return v * 2;
  return undefined;
}, (t) => t.replace('Every hero has +2 armor and +2 magic armor.', 'Every hero has +4 armor and +4 magic armor.'));
