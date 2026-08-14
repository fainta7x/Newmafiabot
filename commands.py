from aiogram.types import BotCommand


async def setup_bot_commands(bot):
    """Keep Telegram's command menu focused on the unified player product."""
    commands = [
        BotCommand(command="start", description="Главное меню 2LA Noire"),
        BotCommand(command="app", description="Открыть приложение клуба"),
    ]
    await bot.set_my_commands(commands)
    print(f"✅ Установлено команд: {len(commands)}")
