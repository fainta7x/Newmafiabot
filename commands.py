from aiogram.types import BotCommand


async def setup_bot_commands(bot):
    """Keep Telegram's command menu focused on the unified player product."""
    commands = [
        BotCommand(command="start", description="Главное меню 2LA Noire"),
        BotCommand(command="events", description="Ближайшие вечера и запись"),
        BotCommand(command="faq", description="Частые вопросы"),
        BotCommand(command="app", description="Открыть приложение клуба"),
        BotCommand(command="cabinet", description="Личный кабинет"),
        BotCommand(command="crm", description="Кабинет организатора"),
    ]
    await bot.set_my_commands(commands)
    print(f"✅ Установлено команд: {len(commands)}")
    # What a newcomer sees before pressing «Start» and in the bot's profile.
    try:
        await bot.set_my_description(
            "🎭 2LA Noire — клуб классической мафии в Туле.\n\n"
            "Здесь можно записаться на вечер, узнать, где и во сколько играем, сколько стоит, "
            "и получить ответы на частые вопросы. Новичкам рады — правила объясним с нуля.\n\n"
            "Нажми «Старт» 👇"
        )
        await bot.set_my_short_description("Клуб классической мафии в Туле: запись на вечера, правила и тренажёры.")
    except Exception as exc:  # the description is cosmetic; startup must not fail on it
        print(f"⚠️ Не удалось обновить описание бота: {exc}")
