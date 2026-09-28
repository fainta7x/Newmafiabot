from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from handlers import bot_home
from handlers.crm_evening_response import _selected_keyboard


def _texts(markup):
    return [[button.text for button in row] for row in markup.inline_keyboard]


def test_home_card_has_every_section():
    rows = _texts(bot_home.home_keyboard())
    flat = [text for row in rows for text in row]
    for section in ("📅 Ближайшие вечера", "👤 Мои записи", "❓ Частые вопросы", "📚 Обучение", "👥 Наши группы", "✉️ Написать организатору"):
        assert section in flat


def test_evening_card_lets_the_player_answer_and_go_back():
    text, markup = bot_home.evening_view({
        "id": "ev", "format": "NOVICE", "title": "Вечер для новичков", "venue": "Суп с Котом",
        "starts_at": "2026-10-02T16:00:00Z", "attending_count": 3,
    })
    assert "Рассказываем правила — 18:30" in text and "Идут: <b>3</b>" in text
    rows = _texts(markup)
    assert rows[0] == ["✅ Буду", "⏳ Приду позже"] and rows[-1] == ["⬅️ К списку вечеров"]
    assert ["🗺 Как добраться"] in rows


def test_answer_keeps_the_card_buttons():
    _, markup = bot_home.evening_view({"id": "ev", "format": "CASUAL", "starts_at": "2026-10-02T18:00:00Z"})
    updated = _texts(_selected_keyboard(markup, "ev", "late"))
    assert updated[0] == ["✅ Буду", "☑️ ⏳ Приду позже"]
    assert updated[-1] == ["⬅️ К списку вечеров"]


def test_plain_announcement_keyboard_is_rebuilt_as_before():
    plain = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="✅ Буду", callback_data="evr:ev:going")]])
    assert _texts(_selected_keyboard(plain, "ev", "going"))[0][0] == "☑️ ✅ Буду"


def test_every_faq_answer_opens():
    for key, button, _ in bot_home.FAQ:
        text, markup = bot_home.faq_answer_view(key)
        assert text.startswith("<b>") and _texts(markup)[-1] == ["⬅️ К вопросам"]


def test_my_signups_without_a_profile_points_to_registration():
    text, _ = bot_home.mine_view(None, "not_found")
    assert "/start" in text


def test_payment_answer_says_novice_prepayment_is_required():
    text, _ = bot_home.faq_answer_view("pay")
    assert "нужно передать до первой игры" in text


def test_novice_answer_asks_for_a_nickname_and_links_rules_and_an_example_game():
    text, markup = bot_home.faq_answer_view("novice")
    assert "никнейм" in text
    flat = [button.text for row in markup.inline_keyboard for button in row]
    assert "📖 Правила игры" in flat and "🎬 Пример игры — «Мафия с Левшой»" in flat
