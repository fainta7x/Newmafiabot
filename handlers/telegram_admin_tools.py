from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import Message

import config

router = Router()


def _forwarded_chat(message: Message):
    replied = message.reply_to_message
    if not replied:
        return None
    origin = getattr(replied, "forward_origin", None)
    if not origin:
        return None
    return getattr(origin, "chat", None) or getattr(origin, "sender_chat", None)


@router.message(Command("telegramid"))
async def telegram_destination_id(message: Message):
    if not message.from_user or message.from_user.id not in config.ADMIN_IDS:
        return

    forwarded_chat = _forwarded_chat(message)
    if forwarded_chat is not None:
        await message.answer(
            "📡 <b>Telegram ID пересланного канала/чата</b>\n\n"
            f"Chat ID: <code>{forwarded_chat.id}</code>\n"
            f"Название: {getattr(forwarded_chat, 'title', None) or '—'}",
            parse_mode="HTML",
        )
        return

    if message.chat.type == "private":
        await message.answer(
            "Чтобы узнать ID закрытого канала, перешли сюда любой пост из него, ответь на пересланное сообщение командой /telegramid.\n\n"
            "Для форум-группы отправь /telegramid прямо в нужной теме — я покажу и Chat ID, и Topic ID."
        )
        return

    topic_id = getattr(message, "message_thread_id", None)
    lines = [
        "📡 <b>Telegram-направление</b>",
        "",
        f"Chat ID: <code>{message.chat.id}</code>",
        f"Название: {message.chat.title or '—'}",
    ]
    if topic_id:
        lines.append(f"Topic ID: <code>{topic_id}</code>")
    else:
        lines.append("Topic ID: —")
    await message.answer("\n".join(lines), parse_mode="HTML")
