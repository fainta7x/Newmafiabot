/**
 * The Snowball stemmer for Russian (public algorithm, snowballstem.org): «кот», «кота», «коты», «котом» → «кот»,
 * while «котлета» stays «котлет». Used so a caption cannot repeat a word of an earlier caption in another form
 * (owner, 2026-11-16: «кот кота коты … должны быть привязаны к 1 слову», «нельзя блокировать … котлета»).
 */
const VOWELS = 'аеиоуыэюя';
const longestSuffix = (word: string, from: number, list: string[], preceded?: string) => {
  let best = '';
  for (const suffix of list) {
    if (suffix.length <= best.length || !word.endsWith(suffix) || word.length - suffix.length < from) continue;
    if (preceded) { const before = word[word.length - suffix.length - 1]; if (!before || !preceded.includes(before) || word.length - suffix.length - 1 < from) continue; }
    best = suffix;
  }
  return best;
};
const removeOne = (word: string, from: number, groups: Array<[string[], string?]>) => {
  let cut = '';
  for (const [list, preceded] of groups) { const found = longestSuffix(word, from, list, preceded); if (found.length > cut.length) cut = found; }
  return cut ? word.slice(0, word.length - cut.length) : null;
};
const PERFECTIVE: Array<[string[], string?]> = [[['в', 'вши', 'вшись'], 'ая'], [['ив', 'ивши', 'ившись', 'ыв', 'ывши', 'ывшись']]];
const REFLEXIVE: Array<[string[], string?]> = [[['ся', 'сь']]];
const ADJECTIVE = ['ее', 'ие', 'ые', 'ое', 'ими', 'ыми', 'ей', 'ий', 'ый', 'ой', 'ем', 'им', 'ым', 'ом', 'его', 'ого', 'ему', 'ому', 'их', 'ых', 'ую', 'юю', 'ая', 'яя', 'ою', 'ею'];
const PARTICIPLE: Array<[string[], string?]> = [[['ем', 'нн', 'вш', 'ющ', 'щ'], 'ая'], [['ивш', 'ывш', 'ующ']]];
const VERB: Array<[string[], string?]> = [[['ла', 'на', 'ете', 'йте', 'ли', 'й', 'л', 'ем', 'н', 'ло', 'но', 'ет', 'ют', 'ны', 'ть', 'ешь', 'нно'], 'ая'], [['ила', 'ыла', 'ена', 'ейте', 'уйте', 'ите', 'или', 'ыли', 'ей', 'уй', 'ил', 'ыл', 'им', 'ым', 'ен', 'ило', 'ыло', 'ено', 'ят', 'ует', 'уют', 'ит', 'ыт', 'ены', 'ить', 'ыть', 'ишь', 'ую', 'ю']]];
const NOUN: Array<[string[], string?]> = [[['а', 'ев', 'ов', 'ие', 'ье', 'е', 'иями', 'ями', 'ами', 'еи', 'ии', 'и', 'ией', 'ей', 'ой', 'ий', 'й', 'иям', 'ям', 'ием', 'ем', 'ам', 'ом', 'о', 'у', 'ах', 'иях', 'ях', 'ы', 'ь', 'ию', 'ью', 'ю', 'ия', 'ья', 'я']]];
export function russianStem(input: string): string {
  let word = input.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const firstVowel = [...word].findIndex((ch) => VOWELS.includes(ch));
  if (firstVowel < 0) return word;
  const rv = firstVowel + 1;
  // R2 per the algorithm: the region after the second vowel-consonant pair.
  const region = (start: number) => { for (let i = start + 1; i < word.length; i++) if (!VOWELS.includes(word[i]) && VOWELS.includes(word[i - 1])) return i + 1; return word.length; };
  const r2 = region(region(0) - 1);
  // Step 1
  const perfective = removeOne(word, rv, PERFECTIVE);
  if (perfective !== null) word = perfective;
  else {
    word = removeOne(word, rv, REFLEXIVE) ?? word;
    const adjective = removeOne(word, rv, [[ADJECTIVE]]);
    if (adjective !== null) word = removeOne(adjective, rv, PARTICIPLE) ?? adjective;
    else word = removeOne(word, rv, VERB) ?? removeOne(word, rv, NOUN) ?? word;
  }
  // Step 2
  if (word.endsWith('и') && word.length - 1 >= rv) word = word.slice(0, -1);
  // Step 3
  word = removeOne(word, r2, [[['ост', 'ость']]]) ?? word;
  // Step 4
  if (word.endsWith('нн') && word.length - 1 >= rv) word = word.slice(0, -1);
  else {
    const superlative = removeOne(word, rv, [[['ейш', 'ейше']]]);
    if (superlative !== null) { word = superlative; if (word.endsWith('нн')) word = word.slice(0, -1); }
    else if (word.endsWith('ь') && word.length - 1 >= rv) word = word.slice(0, -1);
  }
  return word;
}
