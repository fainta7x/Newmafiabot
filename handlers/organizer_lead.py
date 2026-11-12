"""«Новый лид» in the organizer's bot (owner, 2026-11-11): /lead Иван @ivan_tg — the lead is created and the ready message comes back."""
import re
from html import escape

from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message

import bot_api
import config

router = Router()

_CONTACT = re.compile(r"(@\w{4,}|(?:https?://)?(?:vk\.com|vk\.ru|t\.me|telegram\.me)/\S+|\+?\d[\d\s\-()]{8,}\d)", re.IGNORECASE)

HELP = (
    "<b>Новый лид</b>\n"
    "Пришлите имя и контакт:\n"
    "<code>/lead Иван @ivan_tg</code>\n"
    "Подойдёт ник Telegram, ссылка на ВК или телефон."
)


def parse_lead(text: str) -> tuple[str, str] | None:
    """The contact is the first Telegram nick, link or phone in the text; what stays is the name."""
    match = _CONTACT.search(text or "")
    if not match:
        return None
    contact = match.group(1).strip()
    name = (text[: match.start()] + " " + text[match.end():]).strip(" ,;:-–—")
    name = re.sub(r"\s+", " ", name)
    return (name, contact) if name else None


def _is_admin(user_id: int) -> bool:
    return user_id in config.ADMIN_IDS


@router.message(Command("lead"), F.chat.type == "private")
async def new_lead(message: Message, command: CommandObject) -> None:
    if not message.from_user or not _is_admin(message.from_user.id):
        return
    parsed = parse_lead(command.args or "")
    if not parsed:
        await message.answer(HELP, parse_mode="HTML")
        return
    name, contact = parsed
    result = await bot_api.add_lead(message.from_user.id, name, contact, "friend")
    if not result.get("success"):
        await message.answer(f"⚠️ {escape(str(result.get('message') or 'Не удалось добавить лида. Попробуйте позже.'))}")
        return
    data = result["data"]
    lines = [
        f"Добавил: <b>{escape(str(data.get('nickname') or name))}</b> · {escape(str(data.get('contact') or contact))}" if data.get("created")
        else f"Этот контакт уже есть: <b>{escape(str(data.get('nickname') or name))}</b>",
        "",
        "Текст для ответа:",
        f"<code>{escape(str(data.get('message') or ''))}</code>",
        "",
        f"Ссылка для самостоятельной записи: {escape(str(data.get('welcome_url') or ''))}",
        "Ответили — нажмите «Написал» в «Делах».",
    ]
    contact_value = str(data.get("contact") or "")
    url = (f"https://t.me/{contact_value.lstrip('@')}" if data.get("contact_kind") == "telegram"
           else contact_value if data.get("contact_kind") == "vk" else None)
    markup = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Открыть чат", url=url)]]) if url else None
    await message.answer("\n".join(lines), parse_mode="HTML", reply_markup=markup, disable_web_page_preview=True)
