import React, { useState } from "react";
import { motion } from "motion/react";
import { X, Copy, Check, Send, Sparkles, AlertCircle } from "lucide-react";
import { GameEvening, Booking, Player } from "../../types.js";

interface TelegramExportModalProps {
  type: "announcement" | "report" | "debts";
  evening?: GameEvening;
  bookings?: Booking[];
  debtors?: Player[];
  onClose: () => void;
}

export const TelegramExportModal: React.FC<TelegramExportModalProps> = ({
  type,
  evening,
  bookings = [],
  debtors = [],
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  // Generate text based on type
  const generateText = () => {
    if (type === "announcement" && evening) {
      const regCount = bookings.length;
      const playerList = bookings
        .map((b, i) => `${i + 1}. ${b.nickname} (${b.status})`)
        .join("\n");

      return `🔥 *АНОНС МАФИЯ-ВЕЧЕРА (${evening.date})* 🔥

📅 *Дата:* ${evening.date}
📍 *Локация:* ${evening.location || "Зал #1"}
⏰ *Старт:* 19:00
🏆 *Статус:* ${evening.status}

👥 *Записалось игроков:* ${regCount}/12
${playerList || "— Список пуст, будь первым!"}

💬 Запись открыта! Напишите в комментарии или админу для регистрации.`;
    }

    if (type === "report" && evening) {
      const totalPlayers = bookings.length;
      return `📊 *ИТОГИ ИГРОВОГО ВЕЧЕРА (${evening.date})* 📊

🎉 Вечер «${evening.title}» успешно завершен!

👥 Всего участников: *${totalPlayers}*
🕹 Проведено мафия-сессий: *2+*
📍 Локация: *${evening.location || "Главный зал"}*

Спасибо всем участникам за отличную атмосферу и интеллектуальные баталии! 🥂
Актуальный рейтинг ELO обновлен на портале клуба.`;
    }

    if (type === "debts") {
      const list = debtors
        .map((d, i) => `${i + 1}. *${d.nickname}* (${d.username ? `@${d.username}` : "no tag"}) — *${Math.abs(d.debt)} ₽*`)
        .join("\n");

      const totalDebt = debtors.reduce((acc, d) => acc + Math.abs(d.debt), 0);

      return `💳 *СПИСОК ДОЛЖНИКОВ КЛУБА* 💳

Уважаемые игроки! Напоминаем о необходимости закрыть задолженность за предыдущие игровыми вечера:

${list || "Все долги погашены! Клуб благодарит за пунктуальность."}

💰 *Общая сумма задолженности:* ${totalDebt} ₽
По всем вопросам и реквизитам перевода обращайтесь к организаторам.`;
    }

    return "";
  };

  const text = generateText();

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-neu-flat flex flex-col"
      >
        <div className="p-6 border-b border-slate-800 bg-slate-950/20 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-sky-400" />
            <h3 className="font-display font-extrabold text-white text-md uppercase">
              {type === "announcement" && "Telegram-Анонс Вечера"}
              {type === "report" && "Telegram-Отчет Вечера"}
              {type === "debts" && "Telegram-Список Должников"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-400 font-mono">
            Готовый отформатированный текст с эмодзи для публикации в Telegram-канал или чат клуба:
          </p>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-neu-inset font-mono text-xs text-slate-200 whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed border-sky-500/20">
            {text}
          </div>
        </div>

        <div className="p-6 border-t border-slate-800 flex justify-between items-center bg-slate-950/10">
          <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Markdown разметка
          </span>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold px-4 py-2.5 rounded-2xl cursor-pointer"
            >
              Закрыть
            </button>
            <button
              onClick={handleCopy}
              className="bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold px-5 py-2.5 rounded-2xl shadow-neu-flat cursor-pointer flex items-center gap-2 transition-all"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-950" /> Скопировано!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Скопировать текст
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
