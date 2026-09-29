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
    # Club posts are short now; the detailed lists stay on rating evenings.
    text = thematic_event_text({"format": "RATING", "title": "Пятница", "starts_at": "2026-09-25T16:00:00Z"}, slots, participants)
    assert "игра 1 — <b>4</b> игрока" in text
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
    text = thematic_event_text({"format": "RATING", "title": "Пятница", "starts_at": "2026-09-25T16:00:00Z"}, slots, people)
    assert len(text) <= 4000
    assert "Пока думают (50)" in text


def test_announcement_shows_venue_address_and_map_link():
    text = event_base_text({"format": "CASUAL", "title": "Пятница", "venue": "Суп с Котом", "starts_at": "2026-09-25T16:00:00.000Z"})
    assert "📍 Суп с Котом, Пушкинский проезд, 4А · <a href=\"https://yandex.ru/maps/?text=" in text
    other = event_base_text({"format": "CASUAL", "title": "Пятница", "venue": "Антикафе <Лофт>", "starts_at": "2026-09-25T16:00:00.000Z"})
    assert "📍 Антикафе &lt;Лофт&gt;" in other and "<a href" not in other


def test_novice_invitation_is_the_promo_with_when_where_and_links():
    from handlers.telegram_evening_copy import novice_about_html, novice_headline_html, novice_invitation_text, thematic_event_text

    evening = {"id": "ev-1", "format": "NOVICE", "title": "Школа", "venue": "Суп с Котом", "starts_at": "2026-10-02T16:00:00Z"}
    text = novice_invitation_text(
        evening, [], signup_url="https://t.me/club_bot?start=event_ev-1", novice_chat_url="https://t.me/+novice",
    )
    assert text.startswith(novice_headline_html())
    assert text.startswith("🎓 <b>Вечер для новичков")
    assert text.endswith(novice_about_html())
    assert text.index("Записаться в приложении") < text.index("Почему") if "Почему" in text else True
    assert "🎓 Рассказываем правила — 18:30, первая игра — 19:00" in text
    assert '<a href="https://t.me/club_bot?start=event_ev-1">Записаться в приложении</a>' in text
    assert '👥 Группа для новичков: <a href="https://t.me/+novice">Telegram</a> · <a href="https://vk.com/2lanoiremafia">VK</a>' in text
    assert '✉️ Остались вопросы? Пишите: <a href="https://t.me/Chagina7x">Telegram</a>' in text
    # The novice chat itself gets the ordinary announcement.
    assert "Почему затягивает" not in thematic_event_text(evening, [], [])


def test_novice_invitation_fits_one_telegram_message():
    from handlers.telegram_evening_copy import novice_invitation_text

    evening = {"id": "ev-1", "format": "NOVICE", "title": "Т" * 5000, "venue": "В" * 5000, "notes": "Н" * 5000,
               "starts_at": "2026-10-02T16:00:00Z"}
    text = novice_invitation_text(evening, [], signup_url="https://t.me/club_bot?start=event_ev-1")
    assert len(text) <= 4096
    assert text.startswith("🎓 <b>Вечер для новичков")


def test_cover_comes_from_the_club_photo_the_server_picked():
    from handlers.announcement_cover import cover_preview

    preview = cover_preview({"cover_url": "https://club.example/announce-photo/abc.jpg"})
    assert preview.url == "https://club.example/announce-photo/abc.jpg"
    assert preview.show_above_text and preview.prefer_large_media
    assert cover_preview({}).is_disabled
    assert cover_preview({"cover_url": "http://insecure.example/x.jpg"}).is_disabled


def test_club_post_is_the_owners_short_text():
    from handlers.telegram_evening_copy import private_event_text, thematic_event_text

    evening = {"format": "CASUAL", "title": "Пятница", "venue": "Суп с Котом", "starts_at": "2026-10-02T18:00:00Z", "price_per_game": 100}
    expected = (
        "Привет! В пятницу, 2 октября, играем в мафию — ждём тебя 🎭\n"
        "📍 Суп с Котом, 21:00 · 100 ₽ за игру, не больше 400 ₽ за вечер\n"
        "Отметь кнопкой ниже, придёшь ли, и выбери игры"
    )
    post = thematic_event_text(evening, [], [
        {"player_id": "a", "nickname": "Аня", "response_status": "going", "selected_games": 0},
        {"player_id": "b", "nickname": "Боря", "response_status": "thinking", "selected_games": 0},
    ])
    # The group post starts with the owner's text, keeps who is coming and ends with what to press.
    assert post.startswith(expected.rsplit("\n", 1)[0])
    assert "Аня" in post and "Пока думают (1)</b>: Боря" in post
    assert post.endswith("Отметь кнопкой ниже, придёшь ли, и выбери игры")
    assert private_event_text(evening) == expected
    assert private_event_text(evening, reminder=True).startswith("🔔")


def test_novice_group_post_invites_to_play_and_keeps_who_is_coming():
    from handlers.telegram_evening_copy import private_event_text, thematic_event_text

    evening = {"format": "NOVICE", "title": "Школа", "venue": "Суп с Котом", "starts_at": "2026-10-02T16:00:00Z"}
    post = thematic_event_text(evening, [], [{"player_id": "a", "nickname": "Лёша", "response_status": "thinking", "selected_games": 0}])
    assert post.startswith("Привет! В пятницу, 2 октября, играем в мафию с новичками — приходи 🎭\n"
                           "Никогда не играл — не страшно: в 18:30 объясним правила, потом сыграем вместе. Можно прийти одному.")
    assert "Пока думают (1)</b>: Лёша" in post
    assert post.endswith("Отметь кнопкой ниже, придёшь ли, и выбери игры")
    assert private_event_text(evening).startswith("Привет! В пятницу, 2 октября, играем в мафию с новичками")
