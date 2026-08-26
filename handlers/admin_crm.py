from aiogram import F, Router
from aiogram.filters import Command
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

import bot_menu
import config
from handlers.registration import router as registration_router

router = Router()
# admin_crm is mounted before the legacy start_profile router in main.py, so nesting
# onboarding here lets canonical /start registration run before the legacy /start handler.
router.include_router(registration_router)


def _is_admin(user_id: int) -> bool:
    return user_id in config.ADMIN_IDS


def _crm_url() -> str:
    return f"{str(config.BOT_API_BASE_URL or '').rstrip('/')}/admin"


async def _send_crm_entry(message: Message) -> None:
    if not message.from_user or not _is_admin(message.from_user.id):
        await message.answer("⛔ Панель организатора доступна только администраторам.")
        return

    base_url = str(config.BOT_API_BASE_URL or '').rstrip('/')
    if not base_url or base_url.startswith('http://127.0.0.1'):
        await message.answer("Не настроен адрес CRM (BOT_API_BASE_URL).")
        return

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🗂 Открыть CRM",
                    web_app=WebAppInfo(url=_crm_url()),
                )
            ]
        ]
    )
    await message.answer(
        "Панель организатора 2LA noire. Откроется внутри Telegram.",
        reply_markup=keyboard,
    )


@router.message(Command("cabinet"), F.chat.type == "private")
async def open_cabinet_command(message: Message):
    keyboard = bot_menu.cabinet_inline_keyboard()
    if not keyboard:
        await message.answer("⚠️ Адрес личного кабинета пока не настроен в боте.")
        return
    await message.answer(
        "Личный кабинет 2LA Noire. Откроется внутри Telegram.",
        reply_markup=keyboard,
    )


@router.message(Command("crm"), F.chat.type == "private")
async def open_crm_command(message: Message):
    await _send_crm_entry(message)


@router.message(F.text.in_(["🛠 Админ-панель", "🛠 Перейти в админ-панель"]), F.chat.type == "private")
async def open_crm_button(message: Message):
    await _send_crm_entry(message)
