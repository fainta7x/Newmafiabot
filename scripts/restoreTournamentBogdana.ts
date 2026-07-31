import { restoreTournamentBogdana } from '../src/db/restoreTournamentBogdana.ts';

async function main() {
  try {
    const result = await restoreTournamentBogdana();
    console.log('--------------------------------------------------');
    console.log('🏆 Восстановление "Турнир Богдана 1.08" завершено:');
    console.log(`📁 База данных: ${result.dbPath}`);
    console.log(`📌 Статус: ${result.action}`);
    console.log(`💬 Сообщение: ${result.message}`);
    console.log(`👤 Создано новых игроков (${result.createdPlayers.length}): ${result.createdPlayers.join(', ') || 'нет'}`);
    console.log(`♻️ Использовано существующий игроков (${result.reusedPlayers.length}): ${result.reusedPlayers.join(', ')}`);
    console.log(`📊 Участников: ${result.participantCount}, Игр: ${result.gameCount}, Мест: ${result.seatCount}`);
    console.log('--------------------------------------------------');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Ошибка при восстановлении турнира Богдана 1.08:');
    console.error(err.message || err);
    process.exit(1);
  }
}

main();
