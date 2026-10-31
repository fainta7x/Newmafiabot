import { SEAT_ACTION_LABELS } from './hotkeyModel.js';
import '../crm/liveGameHotkeys.css';

type Props = {
  cursor: number | null;
  cursorName: string;
  split: number[] | null;
  helpOpen: boolean;
  onCloseHelp: () => void;
};

const HELP_ROWS: Array<[string, string]> = [
  ['1–9, 0', 'Выбрать игрока (0 — десятое место). В голосовании и ночью цифра — это сам клик; меню — Shift + цифра'],
  ['← ↑ ↓ →', 'Подсветка двигается по столу, как на экране'],
  ['Действие', 'Любой рукой: В/Л выставить · А/О фол · Ы/Д малый тех · Ф/Ж большой тех · П/Р снять фол · У/Ш вскрытие. Или цифры 1–6, 0 — панель'],
  ['Tab', 'Следующий шаг (главная кнопка)'],
  ['Enter', 'Выбор: открыть меню выделенного игрока'],
  ['Пробел', 'Пауза и старт таймера; в голосовании и ночью — клик по подсвеченному игроку'],
  ['Backspace', 'Назад'],
  ['Cmd/Ctrl + Z', 'Отменить последнее действие'],
  ['Q, затем два места', '«Попил» в нулевом круге'],
  ['V', '«Вскрытие»: кто назвал себя шерифом и какие проверки объявил (для выбранного игрока — цифра 6 или У/Ш)'],
  ['[  ·  +  ·  M', 'Таймер −10 с · +30 с за 2 фола · звук'],
  ['A', 'Авторежим вкл/выкл'],
  ['Esc', '«Стоп» автошага, закрыть меню'],
];

/** The seat action menu, the «Попил» prompt and the key cheat sheet. Only ever visible after a key was pressed. */
export default function LiveGameHotkeyLayer({ cursor, cursorName, split, helpOpen, onCloseHelp }: Props) {
  return (
    <>
      {cursor !== null && (
        <div className="live-hotkey-bar" data-testid="live-hotkey-menu" role="status">
          <div className="live-hotkey-bar__title">#{cursor}{cursorName ? ` · ${cursorName}` : ''}</div>
          <div className="live-hotkey-bar__actions">
            {SEAT_ACTION_LABELS.map((item) => (
              <span key={item.action} className="live-hotkey-bar__action"><kbd>{item.digit}</kbd><span>{item.label}</span><small>{item.keys}</small></span>
            ))}
          </div>
          <div className="live-hotkey-bar__hint">← ↑ ↓ → другой игрок · Esc отмена</div>
        </div>
      )}
      {split !== null && (
        <div className="live-hotkey-bar" data-testid="live-hotkey-split" role="status">
          <div className="live-hotkey-bar__title">Попил: выберите двоих{split.length ? ` · #${split[0]} и…` : ''}</div>
          <div className="live-hotkey-bar__hint">цифры мест · Esc отмена</div>
        </div>
      )}
      {helpOpen && (
        <div className="live-hotkey-help" data-testid="live-hotkey-help" role="dialog" aria-label="Клавиши управления" onClick={onCloseHelp}>
          <div className="live-hotkey-help__card" onClick={(event) => event.stopPropagation()}>
            <div className="live-hotkey-help__title">Клавиши управления</div>
            {HELP_ROWS.map(([keys, text]) => (
              <div key={keys} className="live-hotkey-help__row"><kbd>{keys}</kbd><span>{text}</span></div>
            ))}
            <button type="button" className="live-judge-action" onClick={onCloseHelp}>Закрыть (Esc)</button>
          </div>
        </div>
      )}
    </>
  );
}
