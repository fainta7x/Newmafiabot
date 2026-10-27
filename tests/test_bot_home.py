from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from handlers import bot_home
from handlers.crm_evening_response import _selected_keyboard


def _texts(markup):
    return [[button.text for button in row] for row in markup.inline_keyboard]


EVENINGS = [
    {"id": "n", "format": "NOVICE", "starts_at": "2026-10-02T16:00:00Z", "attending_count": 3},
    {"id": "c", "format": "CASUAL", "starts_at": "2026-10-02T18:00:00Z", "attending_count": 9},
]


def test_newcomer_gets_a_short_friendly_menu():
    assert bot_home.audience_for(None) == "newcomer"
    assert bot_home.audience_for({"player": {"game_level": "novice"}}) == "newcomer"
    text, markup = bot_home.newcomer_home("Аня", EVENINGS)
    assert "Ближайший вечер для новичков: <b>пт, 2 октября · 19:00</b>" in text
    rows = _texts(markup)
    assert rows == [["📅 Записаться на вечер"], ["🎭 Что за игра?", "❓ Вопросы"], ["📚 Правила и тренажёры"]]


def test_newcomer_sees_only_novice_evenings():
    text, markup = bot_home.events_view(EVENINGS, "newcomer")
    assert "Вечера для новичков" in text and "21:00" not in text
    assert _texts(markup)[0] == ["2 октября · 19:00"]


def test_club_player_gets_the_full_menu():
    home = {"player": {"nickname": "Лиса", "game_level": "club"}, "evenings": [{"id": "c", "response_status": "going"}]}
    assert bot_home.audience_for(home) == "club"
    text, markup = bot_home.club_home("Аня", home, EVENINGS)
    assert "Ближайший вечер: <b>пт, 2 октября · 21:00</b>" in text and "ты: ✅ иду" in text
    rows = _texts(markup)
    assert len(rows) <= 4
    flat = [t for row in rows for t in row]
    for section in ("📅 Расписание", "👤 Мои записи", "👥 Составы", "☰ Ещё"):
        assert section in flat
    _, more = bot_home.more_view()
    more_flat = [t for row in _texts(more) for t in row]
    for section in ("📚 Обучение", "💬 Группы", "❓ Вопросы"):
        assert section in more_flat
    assert all(len(row) <= 2 for row in _texts(more))


def test_frequent_questions_fit_two_per_row():
    _, markup = bot_home.faq_view()
    rows = _texts(markup)
    assert rows[0] == ["📝 Как записаться", "💳 Сколько стоит"]
    assert len(rows) <= 6
    text, _ = bot_home.faq_answer_view("friend")
    assert text.startswith("<b>👥 Можно прийти с другом?</b>")


def test_my_signups_no_longer_show_tokens():
    text, _ = bot_home.mine_view({"player": {"nickname": "Лиса", "tokens": 900}, "evenings": []})
    assert "жетон" not in text


def test_evening_card_lets_the_player_answer_and_go_back():
    text, markup = bot_home.evening_view({
        "id": "ev", "format": "NOVICE", "title": "Вечер для новичков", "venue": "Суп с Котом",
        "starts_at": "2026-10-02T16:00:00Z", "attending_count": 3,
    })
    assert "Рассказываем правила — 18:30" in text and "Идут: <b>3</b>" in text
    rows = _texts(markup)
    assert rows[0] == ["✅ Буду", "⏳ Приду позже"] and rows[-1] == ["⬅️ К списку вечеров"]
    assert any("🗺 Как добраться" in row for row in rows) and len(rows) <= 4


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
    assert "🎬 Пример игры" in flat


def test_known_start_payloads_are_recognised_and_old_links_are_not():
    for payload in ("", "players", "club_access", "event_abc", "profile_42"):
        assert bot_home.is_known_start_payload(payload)
    for payload in ("old_promo", "tournament_7", "x"):
        assert not bot_home.is_known_start_payload(payload)


def test_old_link_gets_a_plain_note_and_fresh_buttons(monkeypatch):
    monkeypatch.setattr(bot_home.bot_menu, "player_app_url", lambda path="/player": f"https://app.test{path}")
    text, markup = bot_home.stale_link_view(EVENINGS, event_gone=True)
    assert "больше не работает" in text and "уже прошёл или запись на него закрыта" in text
    assert "Ближайший вечер:" in text
    labels = [t for row in _texts(markup) for t in row]
    assert labels == ["📅 Ближайший вечер", "🎭 Открыть 2LA Noire"]
    assert markup.inline_keyboard[0][0].web_app.url == "https://app.test/player/events?event=n"


def test_old_link_without_open_evenings_still_offers_the_app(monkeypatch):
    monkeypatch.setattr(bot_home.bot_menu, "player_app_url", lambda path="/player": f"https://app.test{path}")
    text, markup = bot_home.stale_link_view([])
    assert "Ближайших вечеров пока нет" in text
    assert [t for row in _texts(markup) for t in row] == ["🎭 Открыть 2LA Noire"]


def test_evening_callback_does_not_claim_booking_closed_on_api_outage(monkeypatch):
    import asyncio
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    monkeypatch.setattr(bot_home, "_open_evenings", AsyncMock(return_value=None))
    callback = SimpleNamespace(
        data="home:ev:123",
        from_user=SimpleNamespace(id=42, first_name="Игрок"),
        answer=AsyncMock(),
    )
    asyncio.run(bot_home.home_callback(callback))
    callback.answer.assert_awaited_once_with(
        "Не удалось проверить вечер. Попробуй чуть позже.", show_alert=True
    )


def test_lineups_callback_does_not_claim_no_evenings_on_api_outage(monkeypatch):
    import asyncio
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    monkeypatch.setattr(bot_home, "_open_evenings", AsyncMock(return_value=None))
    callback = SimpleNamespace(
        data="home:lineups",
        from_user=SimpleNamespace(id=42, first_name="Игрок"),
        answer=AsyncMock(),
    )
    asyncio.run(bot_home.home_callback(callback))
    callback.answer.assert_awaited_once_with(
        "Не удалось загрузить составы. Попробуй чуть позже.", show_alert=True
    )


def test_learning_back_button_respects_entrypoint():
    _, novice = bot_home.learn_view("home")
    _, club = bot_home.learn_view("more")
    assert novice.inline_keyboard[-1][0].callback_data == "home:home"
    assert club.inline_keyboard[-1][0].callback_data == "home:more"


def test_signup_faq_and_evening_card_explain_full_evening_booking():
    answer, _ = bot_home.faq_answer_view("signup")
    assert "записан на все игры вечера" in answer
    card, _ = bot_home.evening_view({"id": "ev", "format": "CASUAL", "starts_at": "2026-10-16T18:00:00Z"})
    assert "«✅ Буду» — на все игры" in card


def test_late_registration_displays_selected_games_in_home_and_mine():
    home = {"player": {"nickname": "Лиса", "game_level": "club"},
            "evenings": [{"id": "c", "response_status": "late", "games": 3}]}
    text, _ = bot_home.club_home("Лиса", home, EVENINGS)
    assert "уточни стартовую игру" in text
    mine, _ = bot_home.mine_view(home)
    assert "⏳ приду позже · игр: 3" in mine


def test_stale_evening_callback_offers_fresh_navigation(monkeypatch):
    import asyncio
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    monkeypatch.setattr(bot_home, "_open_evenings", AsyncMock(return_value=EVENINGS))
    monkeypatch.setattr(bot_home, "_show", AsyncMock())
    callback = SimpleNamespace(data="home:ev:cancelled", from_user=SimpleNamespace(id=12))
    asyncio.run(bot_home.home_callback(callback))
    bot_home._show.assert_awaited_once()
    args = bot_home._show.await_args.args
    assert "больше не работает" in args[1]


def test_late_arrival_slot_time_is_displayed_in_club_timezone():
    from handlers.crm_evening_response import _parse_starts_at
    assert _parse_starts_at("2026-10-16T18:00:00Z").strftime("%H:%M") == "21:00"


def test_late_arrival_callback_fits_telegram_limit_and_resolves_current_slot(monkeypatch):
    import asyncio
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from handlers import crm_evening_response as handler

    slots = [{"id": "slot-uuid-" + "x" * 27, "slot_number": 3, "starts_at": "2026-10-16T19:00:00Z"}]
    monkeypatch.setattr(handler, "get_evening_slots", AsyncMock(return_value={"success": True, "data": {"slots": slots}}))
    submit = AsyncMock(return_value={"success": True})
    monkeypatch.setattr(handler, "submit_evening_response", submit)
    monkeypatch.setattr(handler, "refresh_crm_group_stats", AsyncMock())
    message = SimpleNamespace(chat=SimpleNamespace(type="private"), edit_reply_markup=AsyncMock())
    callback = SimpleNamespace(
        data="evlate:" + "a" * 36 + ":3", from_user=SimpleNamespace(id=42),
        message=message, answer=AsyncMock(),
    )
    assert len(callback.data.encode("utf-8")) <= 64
    asyncio.run(handler.choose_late_start(callback, SimpleNamespace()))
    assert submit.await_args.kwargs["starting_slot_id"] == slots[0]["id"]
    assert submit.await_args.args == ("a" * 36, 42, "late")


def test_home_primary_action_follows_player_response():
    for status, button in (
        ("going", "✏️ Изменить запись"),
        ("late", "⏳ Изменить время прибытия"),
        ("thinking", "🤔 Определиться с вечером"),
        ("unanswered", "✅ Ответить на приглашение"),
    ):
        home = {"player": {"game_level": "club"}, "evenings": (
            [] if status == "unanswered" else [{"id": "c", "response_status": status, "games": 2, "first_game": 3}]
        )}
        text, kb = bot_home.club_home("Игрок", home, EVENINGS)
        assert button in [b.text for row in kb.inline_keyboard for b in row]
        assert any(b.callback_data == "home:ev:c" for row in kb.inline_keyboard for b in row)
        if status == "late":
            assert "с игры №3" in text


def test_missing_mine_data_does_not_replace_card_with_empty_records(monkeypatch):
    import asyncio
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    monkeypatch.setattr(bot_home, "get_player_home", AsyncMock(return_value={"success": False, "error": "unavailable"}))
    callback = SimpleNamespace(
        data="home:mine", from_user=SimpleNamespace(id=42), answer=AsyncMock()
    )
    asyncio.run(bot_home.home_callback(callback))
    callback.answer.assert_awaited_once_with(
        "Не получилось получить записи. Попробуй ещё раз позже.", show_alert=True
    )


def test_stale_lineup_callback_has_new_evening_navigation(monkeypatch):
    import asyncio
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    monkeypatch.setattr(bot_home, "_open_evenings", AsyncMock(return_value=EVENINGS))
    monkeypatch.setattr(bot_home, "_show", AsyncMock())
    callback = SimpleNamespace(data="home:lineup:old", from_user=SimpleNamespace(id=42))
    asyncio.run(bot_home.home_callback(callback))
    assert "больше не работает" in bot_home._show.await_args.args[1]


def test_direct_browser_link_is_in_the_more_menu(monkeypatch):
    import bot_menu
    import config

    monkeypatch.setattr(config, "PLAYER_APP_URL", "https://club.example/player")
    assert bot_menu.direct_app_url() == "https://club.example"
    assert bot_menu.browser_player_url() == "https://club.example/player"
    _, more = bot_home.more_view()
    buttons = [button for row in more.inline_keyboard for button in row]
    browser = next(button for button in buttons if button.text == bot_menu.BROWSER_BUTTON_TEXT)
    # A player must land on the cabinet: the site root is the organizer sign-in in a plain browser.
    assert browser.url == "https://club.example/player" and browser.web_app is None


def _run_link(user_id):
    import asyncio
    from types import SimpleNamespace

    from handlers import registration

    sent = []

    async def answer(text, **kwargs):
        sent.append((text, kwargs))

    message = SimpleNamespace(answer=answer, from_user=SimpleNamespace(id=user_id))
    asyncio.run(registration.send_direct_link(message))
    return sent[0]


def test_link_command_gives_players_the_player_address_and_an_honest_login_note(monkeypatch):
    import config

    monkeypatch.setattr(config, "PLAYER_APP_URL", "https://club.example")
    monkeypatch.setattr(config, "ADMIN_IDS", [1])
    text, kwargs = _run_link(42)
    assert "<code>https://club.example/player</code>" in text
    assert "через ВКонтакте" in text and "только из приложения внутри Telegram" in text
    assert "организатора" not in text
    assert [[b.url for b in row] for row in kwargs["reply_markup"].inline_keyboard] == [["https://club.example/player"]]


def test_link_command_adds_the_organizer_address_for_admins_and_handles_missing_config(monkeypatch):
    import config

    monkeypatch.setattr(config, "PLAYER_APP_URL", "https://club.example")
    monkeypatch.setattr(config, "ADMIN_IDS", [1])
    text, kwargs = _run_link(1)
    assert "<code>https://club.example</code>" in text and "по паролю организатора" in text
    urls = [b.url for row in kwargs["reply_markup"].inline_keyboard for b in row]
    assert urls == ["https://club.example/player", "https://club.example"]

    monkeypatch.setattr(config, "PLAYER_APP_URL", "")
    text, _ = _run_link(42)
    assert "не настроен" in text


def test_faq_comes_from_the_crm_list_when_given():
    entries = [{"id": "x1", "button": "🧩 Своё", "title": "🧩 Свой вопрос?", "answer": "Свой ответ."}]
    _, markup = bot_home.faq_view(entries)
    assert _texts(markup)[0] == ["🧩 Своё"]
    text, _ = bot_home.faq_answer_view("x1", entries)
    assert text.startswith("<b>🧩 Свой вопрос?</b>") and "Свой ответ." in text


def test_builtin_faq_matches_the_seed_of_the_crm_list():
    assert [item["id"] for item in bot_home.builtin_faq()] == ["signup", "price", "place", "novice", "friend", "pay", "tokens", "cancel"]


def test_keyboard_is_one_short_row_for_everyone():
    import bot_menu
    for admin, judge in ((False, False), (True, True), (False, True)):
        kb = bot_menu.main_menu_for_user(is_admin=admin, is_judge=judge)
        assert [[b.text for b in row] for row in kb.keyboard] == [[bot_menu.APP_BUTTON_TEXT, bot_menu.MENU_BUTTON_TEXT]]


def test_staff_view_offers_cabinet_status_and_back(monkeypatch):
    import config
    monkeypatch.setattr(config, "PLAYER_APP_URL", "https://app.example/player")
    _, markup = bot_home.staff_view()
    flat = [t for row in _texts(markup) for t in row]
    assert "🗂 Кабинет организатора" in flat and "🩺 Состояние приложения" in flat and "⬅️ Назад" in flat


def test_legacy_menus_return_the_short_keyboard_too():
    import keyboards
    for build in (keyboards.main_menu, keyboards.main_menu_judge, keyboards.main_menu_admin):
        assert [[b.text for b in row] for row in build().keyboard] == [["🎭 Открыть 2LA Noire", "📋 Меню"]]


def test_retired_buttons_answer_in_plain_words_and_swap_the_old_keyboard():
    import asyncio
    from handlers import legacy_retired_actions as retired

    class FakeMessage:
        def __init__(self):
            self.sent = []

        async def answer(self, text, reply_markup=None, **kwargs):
            self.sent.append((text, reply_markup))

    for send in (retired._send_player_app, retired._send_admin_crm):
        message = FakeMessage()
        asyncio.run(send(message))
        text, markup = message.sent[0]
        assert "legacy" not in text.lower() and "устарела" in text
        assert [[b.text for b in row] for row in markup.keyboard] == [["🎭 Открыть 2LA Noire", "📋 Меню"]]


def test_player_command_list_hides_organizer_commands():
    import asyncio
    import commands

    calls = []

    class FakeBot:
        async def set_my_commands(self, items, scope=None):
            calls.append((sorted(item.command for item in items), scope))

        async def set_my_description(self, *_):
            pass

        async def set_my_short_description(self, *_):
            pass

    asyncio.run(commands.setup_bot_commands(FakeBot()))
    default = calls[0][0]
    assert "crm" not in default and "cabinet" not in default and "start" in default


def test_telegram_lineup_counts_guests_and_their_plus_rows(monkeypatch):
    import asyncio
    from handlers import crm_booking

    async def fake(_evening_id):
        return {"success": True, "data": {
            "evening": {"title": "Вечер", "starts_at": "2026-10-16T18:00:00Z"},
            "participants": [
                {"nickname": "Лиса", "response_status": "going"},
                {"nickname": "Иван", "response_status": "going", "is_guest": True},
                {"nickname": "Иван +1", "response_status": "going", "is_guest": True, "companion_of": "g1"},
            ],
        }}

    monkeypatch.setattr(crm_booking, "get_evening_participants", fake)
    text = asyncio.run(crm_booking.build_crm_evening_stats_text("e1"))
    assert "Иван" in text
    assert "Иван +1" in text
    assert "Идут: <b>3</b> · думают: <b>0</b>" in text


def test_telegram_lineup_keeps_thinking_out_of_going(monkeypatch):
    import asyncio
    from handlers import crm_booking

    async def fake(_evening_id):
        return {"success": True, "data": {
            "evening": {"title": "Вечер", "starts_at": "2026-10-16T18:00:00Z"},
            "participants": [
                {"nickname": "Лиса", "response_status": "going"},
                {"nickname": "Волк", "response_status": "late"},
                {"nickname": "Сова", "response_status": "thinking"},
            ],
        }}

    monkeypatch.setattr(crm_booking, "get_evening_participants", fake)
    text = asyncio.run(crm_booking.build_crm_evening_stats_text("e1"))
    # Owner, 2026-10-23: «Думаю» is not «Идут».
    assert "Идут: <b>2</b> · думают: <b>1</b>" in text


def test_fallback_faq_defers_tariffs_to_the_evening_and_only_promises_explicit_gifts():
    price, _ = bot_home.faq_answer_view("price")
    payment, _ = bot_home.faq_answer_view("pay")
    assert "в карточке вечера" in price
    assert "100 ₽" not in price and "400 ₽" not in price
    assert "бесплатные вечера" not in payment
    assert "организатор не подарил участие" in payment


def test_legacy_profile_reads_are_retired():
    # 2026-10-26: /profile, «Список игроков в записи» and the player search read the bot's legacy file (Elo 1500).
    from handlers import legacy_retired_actions as retired
    assert "🧾 Список игроков в записи" in retired._PLAYER_LEGACY_TEXTS
    assert "search_player" in retired._PLAYER_LEGACY_CALLBACK_PREFIXES
    assert "view_profile:" in retired._PLAYER_LEGACY_CALLBACK_PREFIXES
    assert callable(retired.retire_legacy_profile_command)
