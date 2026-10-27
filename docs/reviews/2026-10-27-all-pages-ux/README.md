# Изображения для постраничного UX-разбора

[Полный разбор](../../UX_PAGE_REVIEW_2026-10-27.md).

Исходный код: `da05509705c7476da0048d986f6c6a3925a502f1`. Дата: 27 октября 2026. Chromium 133, viewport 390 × 844, deviceScaleFactor 1. Изображения получены непосредственным открытием существующих статических harness-страниц через Vite; это настоящие компоненты приложения с искусственными API-ответами. Даты/суммы/имена на картинках принадлежат фикстурам. Время не фиксировалось. Изображения не являются снимками production и не сравнивают до/после изменения интерфейса.

Просмотрено 41 состояние; восемь исходных PNG включены как примеры к замечаниям. Остальные изображения были просмотрены локально, но не включены в Git. Первый экран не доказывает полное прохождение сценария. Ошибки отсутствующих API в harness не приняты за ошибки приложения. Отсутствующий в этой среде emoji-глиф не принят за дефект production. Отдельный `crm-more` harness передаёт необязательный callback «Игровой движок»; в обычном `App` он не передаётся, поэтому этот пункт не объявлен отдельной страницей продукта. `player-profile` harness не передаёт вкладку обучения; её наличие проверено по настоящему `PlayerProfileHub`.

Для повторного осмотра: `node scripts/buildUiPreview.mjs`, открыть соответствующий `e2e/*.html` из `temp/ui-preview` статическим сервером. Полные E2E-наборы для этого разбора не запускались.

| Состояние | Harness / действие | Пример |
| --- | --- | --- |
| 01-home | `player-cabinet.html?booking=casual` | Просмотрено |
| 02-calendar | `player-cabinet.html?route=/player/events` | Просмотрено |
| 03-booking | `player-cabinet.html?route=/player/events/preview-evening&booking=rating` | [PNG](03-booking.png) |
| 04-directory | `player-cabinet.html?route=/player/club` | Просмотрено |
| 05-rating | `player-cabinet.html?route=/player/rating` | [PNG](05-rating.png) |
| 06-wallet | `player-cabinet.html?route=/player/wallet` | [PNG](06-wallet.png) |
| 07-settings | `player-cabinet.html?route=/player/settings` | [PNG](07-settings.png) |
| 08-profile | `player-profile.html` | Просмотрено |
| 09-game | `player-game-detail.html` | Просмотрено |
| 10-today | `organizer-crm.html` | Просмотрено |
| 11-events | `crm-evenings.html` | Просмотрено |
| 12-evening | `crm-evening-roster.html` | Просмотрено |
| 13-players | `crm-players.html` | Просмотрено |
| 14-more | `crm-more.html` | Просмотрено |
| 15-closeout | `crm-closeout.html` | Просмотрено |
| 16-analytics | `crm-analytics.html` | Просмотрено |
| 17-live | `live-game.html?mode=audit` | Просмотрено |
| 18-protocol | `protocol-window.html` | [PNG](18-protocol.png) |
| 19-trainer | `split-vote.html` | Просмотрено |
| 20-poker | `poker-harness.html` | Просмотрено |
| guide-home | `split-vote.html?tab=home` | [PNG](guide-home.png) |
| guide-lessons | `split-vote.html?tab=lessons` | Просмотрено |
| guide-trainers | `split-vote.html?tab=trainers` | Просмотрено |
| guide-reference | `split-vote.html?tab=reference` | Просмотрено |
| guide-articles | `split-vote.html?tab=articles` | Просмотрено |
| guide-games | `split-vote.html?tab=games` | Просмотрено |
| guide-evening | `split-vote.html?tab=evening` | Просмотрено |
| guide-roles | `split-vote.html?tab=roles` | Просмотрено |
| guide-rules | `split-vote.html?tab=rules` | Просмотрено |
| guide-glossary | `split-vote.html?tab=glossary` | Просмотрено |
| guide-split-article | `split-vote.html?tab=split-article` | Просмотрено |
| guide-agreement | `split-vote.html?tab=agreement` | Просмотрено |
| guide-clocktower | `split-vote.html?tab=clocktower` | Просмотрено |
| guide-clocktower-rules | `split-vote.html?tab=clocktower-rules` | Просмотрено |
| guide-clocktower-roles | `split-vote.html?tab=clocktower-roles` | Просмотрено |
| guide-split-three | `split-vote.html?tab=split-three` | Просмотрено |
| guide-judge-conduct | `split-vote.html?tab=judge-conduct` | Просмотрено |
| guide-quiz | `split-vote.html?tab=quiz` | Просмотрено |
| live-restored | `live-game.html?mode=audit → «Восстановить»` | [PNG](live-restored.png) |
| trainer-practice | `split-vote.html → первая «Практика · 5 вопросов»` | [PNG](trainer-practice.png) |
| protocol-flow | `protocol-window.html → «Ход игры»` | Просмотрено |
