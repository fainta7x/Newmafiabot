from aiogram import F, Router
from aiogram.types import CallbackQuery

from bot_api import submit_evening_response

router = Router()

_STATUS_LABELS = {
    "going": "Иду",
    "late": "Приду позже",
    "thinking": "Пока думаю",
    "declined": "Не иду",
}


@router.callback_query(F.data.startswith("evr:"))
async def handle_crm_evening_response(callback: CallbackQuery):
    try:
        _, evening_id, response_status = callback.data.split(":", 2)
    except (AttributeError, ValueError):
        await callback.answer("Некорректная кнопка", show_alert=True)
        return

    if response_status not in _STATUS_LABELS or not evening_id:
        await callback.answer("Некорректный статус", show_alert=True)
        return

    result = await submit_evening_response(
        evening_id=evening_id,
        telegram_user_id=callback.from_user.id,
        response_status=response_status,
    )

    if result.get("success"):
        await callback.answer(f"✅ {_STATUS_LABELS[response_status]}", show_alert=False)
        return

    error = result.get("error")
    if error == "not_found":
        message = "Вечер или профиль не найден"
    elif error == "closed":
        message = "Этот вечер уже закрыт"
    elif error == "invalid":
        message = "Ответ не принят"
    else:
        message = "Не удалось сохранить ответ. Попробуйте позже"

    try:
        await callback.answer(message, show_alert=True)
    except Exception:
        pass
