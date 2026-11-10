/** The owner's words for the VIP conditions, used in every place that shows or edits them (owner, 2026-11-10: one vocabulary). */
export type VipConditionKind = 'role' | 'same_color' | 'different_color';
export const VIP_CONDITION_PHRASE: Record<VipConditionKind, string> = {
  role: 'Мне нравится играть на',
  same_color: 'Люблю играть в одноцвете с',
  different_color: 'Не хочу играть в одноцвете с',
};
export const VIP_ROLES: Array<[string, string]> = [['citizen', 'Мирный'], ['sheriff', 'Шериф'], ['mafia', 'Мафия'], ['don', 'Дон']];
export const VIP_QUOTA_LABEL = 'Игр со сработавшей подкруткой за вечер';

/** What a slider value means (owner, 2026-11-03): 50 % is an ordinary deal, 100 % always, 0 % never. */
export const vipChanceCaption = (percent: number) => (percent >= 100 ? 'всегда' : percent <= 0 ? 'никогда' : percent === 50 ? 'как обычно' : percent > 50 ? 'чаще обычного' : 'реже обычного');
