from handlers.telegram_evening_copy import event_base_text


def test_novice_announcement_shows_briefing_and_free_first_evenings():
    text = event_base_text({"format": "NOVICE", "title": "Школа", "starts_at": "2026-09-25T16:00:00.000Z", "default_price": 200})
    assert "🎓 Рассказываем правила — 18:30, первая игра — 19:00" in text
    assert "Первые 2 вечера — бесплатно, дальше 200 ₽ за игру" in text


def test_casual_announcement_has_no_briefing():
    text = event_base_text({"format": "CASUAL", "title": "Пятница", "starts_at": "2026-09-25T16:00:00.000Z"})
    assert "Рассказываем правила" not in text
    assert "100 ₽ за игру · максимум 400 ₽ за вечер" in text


def test_group_post_lists_players_who_answered_but_have_no_games():
    from handlers.telegram_evening_copy import thematic_event_text

    # The slot plan counts «иду/позже» without a plan in every game (Вика, Даня); they must be listed separately.
    slots = [{"slot_number": 1, "starts_at": "2026-09-25T16:00:00Z", "registered_count": 4,
              "participants": [{"id": "a", "nickname": "Аня"}, {"id": "b", "nickname": "Борис"},
                               {"id": "c", "nickname": "Вика"}, {"id": "e", "nickname": "Даня"}]}]
    participants = [
        {"player_id": "a", "nickname": "Аня", "response_status": "going", "selected_games": 1},
        {"player_id": "b", "nickname": "Борис", "response_status": "late", "selected_games": 1},
        {"player_id": "c", "nickname": "Вика", "response_status": "going", "selected_games": 0},
        {"player_id": "d", "nickname": "Гоша", "response_status": "thinking", "selected_games": 0},
        {"player_id": "e", "nickname": "Даня", "response_status": "late", "selected_games": 0},
        {"player_id": "f", "nickname": "Ева", "response_status": "declined", "selected_games": 0},
    ]
    text = thematic_event_text({"format": "CASUAL", "title": "Пятница", "starts_at": "2026-09-25T16:00:00Z"}, slots, participants)
    assert "игра 1 — <b>4</b> игрока" in text
    assert text.startswith("🌙 <b>Город засыпает — просыпается мафия</b>")
    assert "Жми «Приду»" in text
    assert "Записались на игры: 2" in text
    assert "Идут на весь вечер, игры не выбрали (1)</b>: Вика" in text
    assert "Придут позже, игры не выбрали (1)</b>: Даня" in text
    assert "Пока думают (1)</b>: Гоша" in text
    assert "Не смогут: 1" in text
    assert text.count("Вика") == 1 and text.count("Даня") == 1


def test_group_post_stays_within_telegram_limit():
    from handlers.telegram_evening_copy import thematic_event_text

    people = [{"player_id": str(i), "nickname": "Очень-длинный-ник-игрока-" + "x" * 30 + str(i),
               "response_status": ("going", "late", "thinking")[i % 3], "selected_games": 0} for i in range(150)]
    slots = [{"slot_number": n, "starts_at": "2026-09-25T16:00:00Z", "registered_count": 11,
              "participants": [{"id": f"s{n}-{k}", "nickname": "Игрок-" + "y" * 40 + str(k)} for k in range(11)]} for n in range(1, 7)]
    text = thematic_event_text({"format": "CASUAL", "title": "Пятница", "starts_at": "2026-09-25T16:00:00Z"}, slots, people)
    assert len(text) <= 4000
    assert "Пока думают (50)" in text


def test_announcement_shows_venue_address_and_map_link():
    text = event_base_text({"format": "CASUAL", "title": "Пятница", "venue": "Суп с Котом", "starts_at": "2026-09-25T16:00:00.000Z"})
    assert "📍 Суп с Котом, Пушкинский проезд, 4А · <a href=\"https://yandex.ru/maps/?text=" in text
    other = event_base_text({"format": "CASUAL", "title": "Пятница", "venue": "Антикафе <Лофт>", "starts_at": "2026-09-25T16:00:00.000Z"})
    assert "📍 Антикафе &lt;Лофт&gt;" in other and "<a href" not in other


def test_novice_invitation_is_the_promo_with_when_where_and_links():
    from handlers.telegram_evening_copy import novice_invitation_text, novice_promo_html, thematic_event_text

    evening = {"id": "ev-1", "format": "NOVICE", "title": "Школа", "venue": "Суп с Котом", "starts_at": "2026-10-02T16:00:00Z"}
    text = novice_invitation_text(
        evening, [], signup_url="https://t.me/club_bot?start=event_ev-1", novice_chat_url="https://t.me/+novice",
    )
    assert text.startswith(novice_promo_html())
    assert "🎓 Рассказываем правила — 18:30, первая игра — 19:00" in text
    assert '<a href="https://t.me/club_bot?start=event_ev-1">Записаться в приложении</a>' in text
    assert '👥 Наши группы: <a href="https://t.me/+novice">Telegram</a> · <a href="https://vk.com/2lanoiremafia">VK</a>' in text
    assert '✉️ Остались вопросы? Пишите: <a href="https://t.me/Chagina7x">Telegram</a>' in text
    # The novice chat itself gets the ordinary announcement.
    assert "Почему затягивает" not in thematic_event_text(evening, [], [])


def test_novice_invitation_fits_one_telegram_message():
    from handlers.telegram_evening_copy import novice_invitation_text

    evening = {"id": "ev-1", "format": "NOVICE", "title": "Т" * 5000, "venue": "В" * 5000, "notes": "Н" * 5000,
               "starts_at": "2026-10-02T16:00:00Z"}
    text = novice_invitation_text(evening, [], signup_url="https://t.me/club_bot?start=event_ev-1")
    assert len(text) <= 4096
    assert "Почему затягивает" in text


def test_announcements_open_with_a_friendly_line_for_their_kind():
    from handlers.telegram_evening_copy import private_event_text, thematic_event_text

    novice = {"format": "NOVICE", "title": "Школа", "starts_at": "2026-09-25T16:00:00Z"}
    assert thematic_event_text(novice, [], []).startswith("🎓 <b>Первый раз? Самое время начать!</b>")
    assert "стань первым" in thematic_event_text(novice, [], [])
    invitation = private_event_text({"format": "RATING", "title": "Рейтинг", "starts_at": "2026-09-25T16:00:00Z"})
    assert invitation.startswith("Привет! 👋\n\n🏆 <b>Рейтинговый вечер")
    assert private_event_text(novice, reminder=True).startswith("🔔 <b>Напоминание")


def test_cover_follows_the_evening_kind(monkeypatch):
    import config
    from handlers.announcement_cover import cover_preview, evening_cover_url

    monkeypatch.setattr(config, "PLAYER_APP_URL", "https://club.example")
    assert evening_cover_url({"format": "NOVICE"}) == "https://club.example/announce/novice.jpg?v=1"
    assert evening_cover_url({"canonical_format": "CASUAL"}) == "https://club.example/announce/club.jpg?v=1"
    assert evening_cover_url({"format": "TOURNAMENT"}) == "https://club.example/announce/rating.jpg?v=1"
    preview = cover_preview({"format": "RATING"})
    assert preview.show_above_text and preview.prefer_large_media
    monkeypatch.setattr(config, "PLAYER_APP_URL", "")
    assert cover_preview({"format": "RATING"}).is_disabled
