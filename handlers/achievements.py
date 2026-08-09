import html
from datetime import datetime
from typing import Any

from aiogram import F, Router
from aiogram.enums import ParseMode
from aiogram.types import CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder, InlineKeyboardMarkup

from bot_api import get_achievement_profile_by_telegram

router = Router()

UNAVAILABLE_TEXT = "⚠️ Книга ачивок временно недоступна. Попробуйте ещё раз."
UNMAPPED_TEXT = (
    "⚠️ Ваш Telegram-аккаунт не привязан к профилю игрока. "
    "Обратитесь к организатору."
)


def _esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def _sorted_categories(profile: dict[str, Any]) -> list[dict[str, Any]]:
    categories = profile.get("categories") or []
    return sorted(categories, key=lambda item: int(item.get("order", 0)))


def _format_earned_date(value: Any) -> str:
    if not value:
        return ""
    raw = str(value)
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed.strftime("%d.%m.%Y")
    except ValueError:
        return raw


def get_achievements_kb(profile: dict[str, Any]) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    for category in _sorted_categories(profile):
        builder.button(
            text=str(category.get("name") or category.get("id") or "Категория"),
            callback_data=f"ach_category:{category.get('id')}",
        )
    builder.button(text="❌ Закрыть", callback_data="ach_close")
    builder.adjust(1)
    return builder.as_markup()


def get_category_kb() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text="📖 Все категории", callback_data="ach_menu")
    builder.button(text="❌ Закрыть", callback_data="ach_close")
    builder.adjust(1)
    return builder.as_markup()


def get_retry_kb(callback_data: str) -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text="🔄 Повторить", callback_data=callback_data)
    builder.button(text="❌ Закрыть", callback_data="ach_close")
    builder.adjust(1)
    return builder.as_markup()


def render_summary(profile: dict[str, Any]) -> str:
    earned = int(profile.get("earned", 0))
    total = int(profile.get("total", 0))
    percentage = int(profile.get("percentage", 0))
    return (
        "📖 <b>КНИГА АЧИВОК</b>\n\n"
        f"🏆 Выполнено: {earned} / {total} ачивок\n"
        f"📊 Прогресс: {percentage}%\n\n"
        "Выберите категорию для просмотра:"
    )


def render_category(profile: dict[str, Any], category_id: str) -> str | None:
    category = next(
        (item for item in _sorted_categories(profile) if str(item.get("id")) == category_id),
        None,
    )
    if category is None:
        return None

    lines = [
        f"<b>{_esc(category.get('name') or category_id)}</b>",
        f"Получено: {int(category.get('earned', 0))} / {int(category.get('total', 0))}",
        "",
    ]

    for achievement in category.get("achievements") or []:
        earned = bool(achievement.get("earned"))
        status = "✅ Получено" if earned else "🔒 Закрыто"
        icon = _esc(achievement.get("icon"))
        name = _esc(achievement.get("name"))
        description = _esc(achievement.get("description"))
        rarity_icon = _esc(achievement.get("rarity_icon"))
        rarity_name = _esc(achievement.get("rarity_name"))

        lines.append(f"{status} {icon} <b>{name}</b>")
        lines.append(description)
        lines.append(f"{rarity_icon} {rarity_name}")

        progress = achievement.get("progress")
        if isinstance(progress, dict):
            current = progress.get("current")
            target = progress.get("target")
            if isinstance(current, (int, float)) and isinstance(target, (int, float)) and target > 0:
                lines.append(f"📈 Прогресс: {_esc(current)} / {_esc(target)}")

        if earned and achievement.get("earned_at"):
            lines.append(f"📅 Получено: {_esc(_format_earned_date(achievement.get('earned_at')))}")
        lines.append("")

    return "\n".join(lines).rstrip()


async def _load(callback: CallbackQuery) -> dict[str, Any]:
    return await get_achievement_profile_by_telegram(callback.from_user.id)


async def _answer_callback(callback: CallbackQuery) -> None:
    try:
        await callback.answer()
    except Exception:
        pass


async def _show_failure(
    callback: CallbackQuery,
    result: dict[str, Any],
    *,
    edit: bool,
    retry_callback: str,
) -> None:
    text = UNMAPPED_TEXT if result.get("error") == "not_found" else UNAVAILABLE_TEXT
    markup = None if result.get("error") == "not_found" else get_retry_kb(retry_callback)
    if edit:
        await callback.message.edit_text(text, reply_markup=markup, parse_mode=None)
    else:
        await callback.message.answer(text, reply_markup=markup, parse_mode=None)


@router.callback_query(F.data == "achievements_menu")
async def achievements_menu_from_stats(callback: CallbackQuery):
    try:
        result = await _load(callback)
        if not result.get("success"):
            await _show_failure(
                callback,
                result,
                edit=False,
                retry_callback="achievements_menu",
            )
            return

        profile = result["data"]["achievements"]
        await callback.message.answer(
            render_summary(profile),
            reply_markup=get_achievements_kb(profile),
            parse_mode=ParseMode.HTML,
        )
    finally:
        await _answer_callback(callback)


@router.callback_query(F.data.startswith("ach_category:"))
async def show_achievements_by_category(callback: CallbackQuery):
    try:
        category_id = callback.data.split(":", 1)[1]
        result = await _load(callback)
        if not result.get("success"):
            await _show_failure(
                callback,
                result,
                edit=True,
                retry_callback=callback.data,
            )
            return

        profile = result["data"]["achievements"]
        text = render_category(profile, category_id)
        if text is None:
            await callback.message.edit_text(
                UNAVAILABLE_TEXT,
                reply_markup=get_retry_kb("ach_menu"),
                parse_mode=None,
            )
            return

        await callback.message.edit_text(
            text,
            reply_markup=get_category_kb(),
            parse_mode=ParseMode.HTML,
        )
    finally:
        await _answer_callback(callback)


@router.callback_query(F.data == "ach_menu")
async def back_to_achievements_menu(callback: CallbackQuery):
    try:
        result = await _load(callback)
        if not result.get("success"):
            await _show_failure(
                callback,
                result,
                edit=True,
                retry_callback="ach_menu",
            )
            return

        profile = result["data"]["achievements"]
        await callback.message.edit_text(
            render_summary(profile),
            reply_markup=get_achievements_kb(profile),
            parse_mode=ParseMode.HTML,
        )
    finally:
        await _answer_callback(callback)


@router.callback_query(F.data == "ach_close")
async def close_achievements(callback: CallbackQuery):
    try:
        await callback.message.delete()
    finally:
        await _answer_callback(callback)
