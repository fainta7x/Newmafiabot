import { Field, FieldLabel } from '../ui/Field.tsx';
import { Input } from '../ui/Input.tsx';

export type PlayerIdentityDraft = {
  nickname: string;
  fullName: string;
  phone: string;
};

export default function PlayerIdentityFields({
  value,
  onChange,
}: {
  value: PlayerIdentityDraft;
  onChange: (value: PlayerIdentityDraft) => void;
}) {
  return (
    <div className="space-y-3" data-testid="player-identity-fields">
      <Field>
        <FieldLabel htmlFor="player-identity-nickname">Игровой ник</FieldLabel>
        <Input id="player-identity-nickname" value={value.nickname} onChange={(event) => onChange({ ...value, nickname: event.target.value })} maxLength={60} autoComplete="nickname" />
      </Field>
      <Field>
        <FieldLabel htmlFor="player-identity-full-name">Имя</FieldLabel>
        <Input id="player-identity-full-name" value={value.fullName} onChange={(event) => onChange({ ...value, fullName: event.target.value })} maxLength={120} placeholder="Можно не указывать" autoComplete="name" />
      </Field>
      <Field>
        <FieldLabel htmlFor="player-identity-phone">Телефон</FieldLabel>
        <Input id="player-identity-phone" value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} maxLength={40} inputMode="tel" type="tel" placeholder="Можно не указывать" autoComplete="tel" />
      </Field>
    </div>
  );
}
