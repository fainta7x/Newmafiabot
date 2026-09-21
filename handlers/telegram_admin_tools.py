from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message

import config
from status_check import check_application_status, format_status_message

router = Router()


@router.message(Command("telegramid"))
async def telegram_destination_id(message: Message):
    if not message.from_user or message.from_user.id not in config.ADMIN_IDS:
        return

    replied = message.reply_to_message
    origin = getattr(replied, "forward_origin", None) if replied else None
    forwarded_chat = getattr(origin, "chat", None) or getattr(origin, "sender_chat", None)

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
            "Чтобы узнать ID закрытого канала, перешли сюда пост из него и ответь /telegramid."
        )
        return

    topic_id = getattr(message, "message_thread_id", None)
    await message.answer(
        "📡 <b>Telegram-направление</b>\n\n"
        f"Chat ID: <code>{message.chat.id}</code>\n"
        f"Название: {message.chat.title or '—'}\n"
        f"Topic ID: <code>{topic_id}</code>" if topic_id else
        "📡 <b>Telegram-направление</b>\n\n"
        f"Chat ID: <code>{message.chat.id}</code>\n"
        f"Название: {message.chat.title or '—'}\n"
        "Topic ID: —",
        parse_mode="HTML",
    )


@router.message(Command("status"))
async def application_status(message: Message):
    if not message.from_user or message.from_user.id not in config.ADMIN_IDS:
        return
    status = await check_application_status()
    await message.answer(format_status_message(status), parse_mode="HTML")


@router.message(lambda message: message.text == "🩺 Проверить состояние приложения")
async def application_status_button(message: Message):
    if not message.from_user or message.from_user.id not in config.ADMIN_IDS:
        return
    status = await check_application_status()
    await message.answer(format_status_message(status), parse_mode="HTML")
