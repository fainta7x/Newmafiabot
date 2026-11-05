Warning: truncated output (original token count: 57164)
Total output lines: 1203

## Темы Telegram для игровых вечеров

У каждого формата свой адрес анонсов и свой адрес общения. Анонсы, запись, переносы и отмены идут в тему записи. Для обычных вечеров это «Запись на игровой вечер». Фото «Мы собрались», итоги игр и вечера, голосование и результаты MVP идут в тему общения. Для обычных вечеров это «Чатик». Адреса общения настраиваются отдельно в CRM, без подстановки темы записи. Если обычный вечер не анонсировали ни в Telegram, ни в ВК, при отмене записавшиеся получают личные уведомления, а публичный пост не отправляется.


## Evening seating and bookings (owner decisions 2026-10-29)

An evening's player may reserve an exact game, table, and seat as soon as they have selected that game, before the evening is confirmed. Self-booking shows its confirmation in the app and does not send a personal message. At the confirmation event associated with «Сегодня играем» (automatic or manual), a fixed advance seating plan is generated without requiring an organizer click, preserving those reservations and balancing participation; future game results never retroactively reshape it. Each player has an independent visited-seat cycle for each table for the duration of the evening: a position is not repeated until the available positions have all been used, at which point the cycle restarts. Positions in future games are tentative; only actual game starts make them part of historical seating. Organizer may change every future assignment and override any rule after a warning; the organizer can remove self-bookings. Planned seats are visible to players in the cabinet and organizers in CRM. Initial assignments and organizer changes before evening start warrant personal notices; changes after the evening starts require only an in-app update. Existing signup/attendance/payment/protocol semantics are preserved. **Random (owner, 2026-11-03):** the generated plan is a full random seating under these conditions — players with fewer games first (random among equals), a random seat that does not repeat the player's current cycle at that table; when no seating without a repeat exists, the seat is still filled with the fewest repeats; no free seat while an eligible player is free. A generated seating sends the players their seats and the evening judge the whole seating in personal messages (before the evening starts). The organizer's «Сформировать» draws the not-yet-started games again (generated seats only; reservations and the organizer's own seat changes stay); the automatic run at «Сегодня играем» only fills free seats. Implementation is in draft #1088, not yet live.

## Evening judge and default portraits (owner, 2026-10-30)

The person assigned as the evening judge («ведущий»/«судья вечера» refer to the same function here) remains visible in the evening roster and may retain their RSVP, but must not occupy a playing seat, be auto-seated, or count toward playable game-slot readiness. All profiles without a stored or repository avatar display the same neutral illustrated fallback; a real avatar takes precedence immediately when available.

# 2LA Noire — Canonical Business Rules

This file contains user-approved product and sports-Mafia rules that must not be silently reinterpreted during refactors.

If implementation/tests conflict with this document, stop and investigate the conflict. Do not “simplify” the rule to make code easier.

### Показатели нулевого круга (владелец, 16.10.2026)

- **«Заголосован в нуле»** — игрок, окончательно выведенный голосованием в нулевом круге.
- **«Сломал в нуле»** — виновник сломанного попила, явно отмеченный ведущим. По итоговым суммам голосов не вычислять; не угадывать участников старых игр.
- **«Подняли в нуле»** — игрок, которого после двойного переголосования в нулевом круге вывели из игры вместе с ещё одним игроком. Это НЕ значит, что игрока оставили за столом. Считать только подтверждённое двойное выбытие.
- Это отдельные факты, не замены «Первым убит» или «Лучший ход».


## Player cabinet continuity (owner, 2026-10-26)

The global review is approved except the proposal to relabel/restructure ratings: existing rating meanings, labels, scoring and grouping stay as they are. Navigation restoration may preserve their selected view without changing those meanings.

Home prioritizes the earliest upcoming evening with the player's going/late response or non-declined waitlist booking; otherwise a thinking response, then the nearest non-declined invitation, then a declined evening whose answer can be changed. Active evenings keep their existing live surface. Show actual RSVP, confirmed/waitlist status and exact selected slot numbers; missing individual choices do not imply fabricated game selections or confirmed admission. The personal evening card precedes general reminders; onboarding remains before it.

An unknown payment summary must be distinguishable from confirmed zero and offer retry. A failed refresh may show only a clearly identified last confirmed amount. Closing a draft protocol requires confirmation that all current edits were saved; failed or superseded saves leave the editor and edits open.


## Owner update 2026-10-28 — debt reminders, birthdays, MVP and award form

Outstanding balances for one player are summed across completed/settled evenings; reminder/task text shows the total and each evening's remainder, including partial payments/extensions and excluding waivers. Existing accounting and automatic trigger/lookback windows remain; one reminder must not be sent once per evening to the same player within the current reminder gap. Birthday tasks describe the actual Moscow calendar distance at display/send time.

An equal highest vote count for evening MVP requires an additional vote restricted to those leaders, rather than automatic tie resolution by game wins. Original votes remain separate. Already finalized historical results remain historical. Working defaults announced after unanswered clarification:24h for one runoff; a repeated tie goes to the existing owner decision. These defaults are not recorded as explicit owner answers and may be steered during implementation.

Only tournament awards and season/rating championships can have cups; ordinary result awards, including evening MVP/player-of-evening and annual ordinary titles, have medals. Preserve award identities, earned history and pins. Achievement progress is not a new sporting award.

## Authority

### Seasonal compendium / cosmetics (owner revision, 2026-10-14)

Paid and seasonal; prices, activity XP, levels and chest probabilities remain undecided. Earned cosmetics persist permanently after the season; future archives may offer unearned old items. Duplicates may be dismantled only into compendium XP, never shards, club tokens or item transfers; the final copy remains. Cosmetics change graphics only, never Mafia rules/results, club balances or Elo. «Cosmetic gifts» means effects, not inventory gifting.

**Новая продуктовая концепция владельца от 14.10.2026 заменяет прежние шесть редкостей, количественную матрицу 13.10 и обязательный универсальный конструктор одежды.** Старые договорённости о пяти сетах/34 условных позициях больше не являются планом выпуска. Идея компендиума не должна зависеть от интереса к отдельной фэнтези-лиге; фэнтези не включена в эту концепцию. Цель — полезные косметические награды и собираемый узнаваемый образ самого игрока, а не необходимость коллекционировать картинки всех остальных игроков.

#### Качества предметов

| Качество | Ключ | Цвет |
| --- | --- | --- |
| Обычное | `common` | Белый |
| Редкое | `rare` | Синий |
| Эпическое | `epic` | Фиолетовый |
| Легендарное | `legendary` | Оранжевый |

`uncommon` и `mythic` не входят в новую шкалу сезона. Это утверждение продуктового плана, а не разрешение удалять существующие записи или молча менять их редкость; совместимость старого каталога нужно решить до изменения runtime.

#### Утверждённый состав направлений «Огненной осени»

| Награда | Качество | Уточнение |
| --- | --- | --- |
| Покерный стол «Огненная осень» | Легендарное | Сезонное оформление стола |
| Покерная колода | Редкое | Рубашка или также лица карт — ещё уточнить |
| Иконки ролей: Красный, Чёрный, Дон, Шериф | Редкое | Четыре ролевых изображения; способ выдачи поштучно/комплектом ещё не выбран |
| Оформление профиля | Эпическое | Фон страницы профиля |
| Фраза в профиль | Эпическое | Отдельная награда; отношение к уже доступной свободной фразе требует решения |
| Титул | Эпическое | Звание рядом с именем по смыслу WoW; формат отображения ещё уточнить |
| Эмодзи для покера | Обычное и редкое | Число, конкретные эмоции и различие качеств пока не выбраны |

Эта таблица задаёт состав и качества, **не** число уровней/сундуков, цены, шансы, квоты эмодзи или количество артов на каждого игрока. Нельзя дополнять её прежними шляпами/пиджаками/рамками и акцентами как автоматически утверждёнными наградами. Сохранённые предметы/черновики не удаляются.

#### Собираемый полный образ вместо аватарки

- Игрок покупает компендиум и развивает его; среди наград — части единого сезонного образа. Обычные и редкие части постепенно улучшают изображение по мере сборки.
- Собранный образ можно выбрать вместо своей аватарки. Это узнаваемый образ самого реального игрока; свободная смена внешности на чужого человека не утверждена.
- Эпический образ — полная цельная статичная композиция. Легендарный — та же полная композиция с анимацией. Анимация не влияет на игровые результаты. Уточнение владельца 14.10: для перехода epic → legendary нужно отдельно получить улучшение, открывающее анимацию; полная сборка статичного образа не включает её автоматически. Способ получения самого улучшения ещё не выбран.
- Владелец предпочёл **четыре отдельных собираемых ролевых сета**: Мирный (`citizen`; прежний косметический ключ `civilian` остаётся только историческим алиасом), Чёрный (`mafia`), Дон (`don`), Шериф (`sheriff`). Только перекрас одного изображения не закреплён как достаточная реализация; сюжеты четырёх сетов ещё не выбраны.
- Основа художественного подхода — индивидуально нарисованная цельная композиция на игрока и её согласованные варианты. Не возвращаться автоматически к универсальной одежде на отдельной голове. Означает ли «часть» отдельно включаемую деталь рисунка или фрагмент прогресса, открывающий заранее цельную стадию, **ещё нужно уточнить**.
- Прежний запрет на сцены физического появления/победные позы в офлайн-мафии сохраняется. Запрошенная теперь анимация касается косметического портрета. Выбор ролевого сета не меняет реальную роль, протокол или видимость скрытых ролей; точный выбор версии аватара на каждой поверхности требует отдельного проектирования. Роль нельзя раскрывать оформлением раньше, чем это позволяет текущий экран.
- Цельный огненный образ Денди от 14.10 положительно оценён владельцем как художественное направление, с замечаниями. Это не принятие всей сезонной коллекции и не разрешение массово генерировать/выдавать арты. Владелец отметил укачивающую пульсацию и попросил больше движения листьев; требования к движению — [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md#seasonal-portrait-motion).

**Открытые решения до реализации:** что является частью и можно ли включать части независимо; сколько частей в каждом ролевом сете; как открывается epic и каким способом получается отдельное улучшение до legendary; роль XP и дубликатов в сборке без введения новой валюты; наборы и доступность индивидуальных артов для новых игроков; поверхности применения/фиксация в истории; детали колоды, фразы и титула. Не придумывать ответы, уровни, количества и цены автоматически. Реализация и текущая очередь: [PROJECT_STATE.md](PROJECT_STATE.md); предыдущая техническая основа: [COSMETICS_COMPENDIUM.md](COSMETICS_COMPENDIUM.md).


For sports-Mafia rules in this project, the user’s explicitly approved rules are authoritative.

When a future conversation introduces a new explicit rule, update this document in the same PR as the implementation when practical.

## Fouls and disciplinary penalties

### Ordinary fouls

- The **3rd foul** gives the player a **30-second speech penalty on the next applicable speech**.
- An applicable speech is the player’s nearest own live speech while they are alive; the penalty is one-shot and is consumed only once.
- A killed player’s last/farewell speech remains the full **60 seconds** and does **not** consume a pending third-foul penalty.
- A player eliminated by voting also keeps the full **60-second** last/farewell speech and does **not** consume a pending third-foul penalty.
- On a guessing day with **3 or 4 alive players**, ordinary day speeches remain **60 seconds**; a pending third-foul penalty is not consumed there.
- A revote/split speech is already fixed at **30 seconds** by the voting rule and **is applicable** to the third-foul penalty: a pending penalty is consumed on that speech even though its visible duration remains 30 seconds.

### Two fouls for +30 seconds of the current speech

After the zero round, the active speaker may exchange **two ordinary fouls for +30 seconds on the current speech**.

Approved constraints:

- the exchange is unavailable on the zero round — the zero night, the zero day and its vote; the first night and the farewell speech of its victim come after the zero round, so the exchange works there (owner, 2026-10-03);
- it is available only during an actual current player speech, including ordinary day speech, revote/split speech and farewell speech;
- the player must start the exchange with **0 or 1 ordinary foul**;
- `0 -> 2` grants +30 seconds to the current speech and does not create a third-foul penalty;
- `1 -> 3` grants +30 seconds to the current speech **and** preserves the normal third-foul 30-second penalty for the next applicable speech;
- at 2+ ordinary fouls the exchange is forbidden, so this action must never be used to trigger a fourth-foul removal;
- the two-foul exchange is an explicit judge action, not an automatic timer extension.

### Technical fouls

- Small technical foul: **−0.3**.
- Big technical foul: **−0.6**.
- **2 technical fouls = removal**.

### Removal

- Removal penalty: **−1**.
- Removal **cancels the nearest voting action** for the removed player as defined by the active game workflow.

### PPK

- PPK penalty: **−1**.
- PPK **immediately ends the game** with victory for the opposite team.

### Nominations / disciplinary penalties

- Disciplinary penalties do **not** affect nominations.
- Tournament nominations (MVP, «Лучший мирный», «Лучший чёрный», «Лучший шериф», «Лучший дон»; owner rule 2026-10-06): nomination points = the judge's extra points + protocol points in the games of that role. Best move (ЛХ), disciplinary minuses (tech fouls, removals), ПУ and CI never count. Ties: role wins (Sheriff/Don only), then head-to-head, then no award. Past results are not recalculated by hand.

### Team victory

- Team victory gives **+1** under the approved scoring model.

## Speech order and timing

### Actual starter rotation

The next daytime speech circle starts clockwise from the **actual previous starter**, not from a nominal round-number formula.

- If the previous actual starter was seat 6, the next circle starts searching from seat 7.
- Dead/absent/unavailable seats are skipped.
- Rotation wraps from 10 back to 1.
- Persisted/restored current-game state should retain the actual starter when available; old snapshots that predate this field may use compatibility fallback behavior.

### Protocol / best-move announcement buffer

The judge needs a short spoken-announcement buffer before the player’s usable protocol time starts to feel consumed.

Current approved timer totals include that buffer:

- best move / ЛХ: **25 seconds total**;
- killed-player protocol: **20 seconds total**.

These totals intentionally include roughly five seconds for the judge to announce that the player has received the right to the best move/protocol.

The first-killed best-move timer is recovery-safe: its absolute deadline is part of the persisted live-game state. Reloading/remounting must continue from the same deadline; an already expired deadline remains expired rather than granting a new 25 seconds.

### Mandatory final-night chain

When a night kill creates mandatory end-of-night actions, the game must complete them in protocol order rather than auto-finishing as soon as the winning team becomes mathematically known:

1. first-killed best move / ЛХ when applicable. Whoever the mafia kills on the first night — a red player or a mafia/Don shooting himself — goes through this step, otherwise a skipped step would give the role away. A black player's ЛХ is worth nothing: it is dropped when the protocol is saved, it gives no points and no Ci, and the judge may simply skip it (owner, 2026-10-10);
2. killed player’s **60-second** last speech;
3. killed-player protocol with the approved **20-second total**;
4. only then either open the next day or explicitly finish the game if a winner has been determined.

- Automatic winner detection must not skip an active best move, voting farewell, night farewell or killed-player protocol.
- Undo/back from a mandatory final action must restore the preceding complete snapshot, including timer/speaker state, rather than only changing a visible phase label.
- Interrupted-session recovery must restore the mandatory final action that was in progress; a reload must not silently bypass it.
- Final game completion is handed off once to the club protocol save path. If the server save fails, the recoverable local final protocol may be retried without replaying the game.

## Voting model

These distinctions are fundamental and must remain explicit in UI/state/tests.

### Nominations are not voting

- A nomination/exposure (“выставление”) is **not a vote**.
- Nominations are a tool that determines which candidates may be voted on.
- Do not infer a player’s final vote from whom they nominated.

### Removal during a voting (owner, 2026-10-04)

- A player removed by the judge or by fouls while a voting is in progress **cancels that voting**, as before.
- **Exception:** if a candidate is already voted out for certain — his votes are so many that nobody else can reach or share them, even if all remaining ballots went elsewhere — the voting is **not** cancelled. It goes on, and that candidate is voted out. The removal only uses up the cancellation of the nearest voting.
- The removed player being that candidate himself does not count as the exception.

### Zero round

- The zero round happens **after the agreement** with **10 alive players**.

#### Game setting: what a broken split does (owner, 2026-10-23)

Owner: «это нужно оставить про слом, только разные механики сделать в настройках игр».

- **Турнирная настройка.** A broken split («слом») works as before: the player voted out in the zero round leaves the table and gives a best move (ЛХ).
- **Клубная настройка.** The player the split was broken into **does not leave the table and gives no best move**. He gets **30 seconds of extra speech**, then the night starts.
- «Подняли в нуле» (a double revote where the table raises both players) works **as in a tournament** under both settings: both leave.
- **Default by evening type:** tournament and rating games use the tournament setting; ordinary and novice games use the club setting. The judge of a club or rating evening may change it on the setup screen before the game. A tournament game always uses the tournament setting (its protocol checks the votes by tournament rules). A game saved before the setting existed continues under the tournament setting.
- The breaker («Сломал в нуле») is recorded under both settings. **Owner «да», 2026-10-23:** the live game asks «Кто сломал попил?» on the zero-round result when one player is voted out (under both settings). The answer is optional («Не знаю» clears it); the judge never gets a guess from the votes. The live game and the protocol form write the same mark, and the latest mark wins, so the judge can correct it in the protocol afterwards.

### First killed player: «Лучший ход» and «Протокол убитого» (owner, 2026-10-18)

The first killed player gives his opinion twice. **Right after his death — «Лучший ход» (ЛХ)**: the three seats he names (never called a «protocol» in the app). **After his last speech — «Протокол убитого»**: a window where he marks who is red, who is black and who is the Sheriff. The window must open after the last speech of a killed player.

### Keyboard control on a desktop (owner, 2026-10-17)

The judge may run the Live Game from the keyboard: a digit picks the seat (0 is the tenth), one key of either hand gives a foul, technical foul, exposure or takes a foul back, arrows move the highlight, Enter is the main step. The keyboard only calls the same actions as the buttons, so every game rule (fouls, removal confirmation, exposure limits, voting) stays in the engine. Removal and PPK have no quick key: they stay in the player panel with their confirmation. Keys are off in the guided training, in input fields and while a window (player panel, confirmation, best move, death protocol) is open.

### Auto mode (owner, 2026-10-17)

An optional switch «Авто» in the Live Game centre panel (off by default, remembered on the device). When on, after a **timer** runs out the app presses the phase's next step by itself after a 3-second countdown that can be cancelled with «Стоп»: end of a speech and the start of the next one, revote speeches, last speeches, zero-night timers. It never decides for the judge: the night music steps, the death protocol, best move, the voting announcement and every voting (which has no timer) stay manual.

### Announcement before a voting (owner, 2026-10-17)

Before **every** voting and revote the judge announces it: the app shows a step with the phrase («Переходим к голосованию» / «…к переголосованию») and the order of the exposed candidates, and only «Начать голосование» opens «Кто против #N?». A seat tap does not vote during this step. A zero round with a single exposed candidate shows the same step, says that one candidate is exposed and that no voting follows, and leads to the night («К ночи»).

### Revotes

- Revotes are **phases of one voting process**, not separate unrelated votes.
- **3, 4 or more revotes are valid** when the game state requires them.
- Never hard-limit the workflow to one or two revotes merely for UI convenience.
- Players in a disputed candidate set receive their **30-second speeches once for that set** before its first revote.
- If the same disputed candidate set remains tied on that revote, do **not** repeat the 30-second speeches.
- If the disputed set changes, the new set receives one 30-second speech cycle before its next revote.

### “Raise / leave” decision

- The special “raise / leave” step is allowed when the **same disputed candidate set remains tied in two consecutive voting rounds**; the exact vote counts do not need to match.
- After that repeated tie, go directly to “raise / leave” without a second 30-second speech cycle.
- It must not appear after only one tied split for a newly formed disputed set.
- It must not allow raising **more than 50% of alive players**.

### Mandatory voting

- Voting is mandatory when the rules require a vote.
- A player who does not vote has their vote assigned to the **last candidate**. Confirmed by the owner 2026-10-11: nobody can abstain; a hand that is not raised for any candidate goes to the last candidate put up.

### Judge correction / vote reassignment

During vote collection the judge must be able to correct a misclick without trapping the voter in an old candidate assignment.

- assigning a voter to the current candidate may move that voter directly from a previously selected candidate;
- pressing the same voter again on the same candidate may remove that assignment;
- going back from a voting result should restore an **editable** vote distribution, not only a visual phase label;
- Undo/back must restore the complete voting state needed to continue editing: candidate order, active round/stage, per-voter assignments and remaining eligibility.

### Decided vote

- Once the result is mathematically **decided**, it cannot be rescued by later votes.
- UI logic must not offer impossible “save” outcomes after the threshold is already fixed.

### Seven alive: all 1–1–1–1–1–1–1

With seven alive players:

1. first `1-1-1-1-1-1-1` -> revote between **all seven**;
2. repeated `1-1-1-1-1-1-1` -> **night**, no elimination from that vote.

## Live Game judge UI semantics

The conducted-game interface is a judge protocol surface, not a generic game UI. Its wording and visual metaphors must match the sports-Mafia mechanics.

- The first daytime cycle after zero night is shown to the judge as **«Нулевой круг»**, not «День 1». After the first night, the next daytime cycle is **«День 1»**; subsequent displayed day numbers follow the protocol day number rather than the engine’s internal round counter.
- Prefer the actual protocol terms **«речь»**, **«выставление / выставлен»**, **«голосование»**, **«переголосование»** and **«поднять / оставить»**. Do not invent substitute stage names such as **«спорные»**, **«спорная речь»** or **«круг обсуждения»**.
- A daytime **выставление** must not use a kill/target/crosshair metaphor. A pistol/shot marker belongs only to the night **отстрел** flow.
- Judge-facing seat numbers `1–10` must remain visually distinct from one another so a number can be identified at a glance; adjacent seats must not collapse to effectively the same color.
- The center of Live Game should prioritize the current protocol step, information required for that step and the next judge action. Do not duplicate the same voting/seat information in multiple miniature panels when the table itself already carries it.
- Fouls, technical fouls, nominations/voting state and the current game step must stay quickly readable during play; rare/dangerous actions may stay behind a player action sheet, but routine judge actions should not require hunting through decorative UI.
- Routine player actions must remain available throughout active play where game context allows them, including during voting/revote speech states; card taps may stay context-sensitive when they are required for a vote/night target, but the judge must still have an explicit player-actions path.
- Leaving the table does not prevent a later disciplinary ruling: an already removed player may still receive PPK, while a player killed or eliminated by voting may still receive either direct removal or PPK. These actions must remain available from the player sheet after the player becomes inactive. A player removed after he already left the game (killed or voted out) is shown as removed, but keeps everything recorded before the removal — first killed (ПУ), his ЛХ and his death protocol (owner, 2026-10-04).
- **Fouls in every phase (owner, 2026-10-17).** The judge can give a player a foul, technical foul, removal or PPK in any started phase, including voting and night. A tap on a seat may be busy (a vote, a night target), so a **long press on the seat** opens the player action sheet; the «Игрок» selector in the centre panel stays as the second path.
- Roles in the canonical club launcher start hidden and are revealed manually by the judge.
- Night shot/Don/Sheriff markers belong only to their active night subphase and must not leak into later best-move/farewell states.
- “Назад” / Undo must not become a dead end behind full-screen protocol or best-move overlays; entering such a state needs a restorable previous snapshot and an accessible way back.
- The game is hosted live at a real table; the app is the judge's assistant and pacing tool. The **«♫ Включите музыку»** and **«♫ Выключите музыку»** steps are mandatory separate judge steps in zero night and every regular night, even when the evening has no playlist and nothing plays: the judge uses them to announce night and to pace the table. Never skip them, merge them into another transition, or make them conditional on music availability (user rule, 2026-09-23).
- **Speech timer sounds (owner, 2026-10-03).** The Live Game speech timer beeps twice: once when 10 seconds are left and once when the speech ends (any speech; a timer of 10 seconds or less beeps only at the end; pausing and resuming at ten seconds does not repeat the warning). The beep is 30% louder than before. The mute switch silences both.
- **Whose music plays (owner, 2026-10-01).** Each game's deal track and night track are drawn at random from the people at that game's table, the judge included, and they are two different people. A player's first slot is the deal track and the second the night track. When nobody at the table has music, the judge's own library plays. A player's saved slot is locked: changing it is a future purchase / VIP / compendium feature; the owner repairs a wrong link or frees a slot in the player card («Данные и фото → Музыка игрока»).
- **Players add tracks only, playlists are the club's (owner, 2026-10-03).** A player's two music slots accept only a link to a track of Yandex Music; a playlist link is refused there. The organizer builds the club's common playlist in the music library, where both tracks and playlists are accepted (links in the current «Поделиться» form `music.yandex.ru/playlists/<id>` and the old `/users/<owner>/playlists/<number>` form both work). Later a playlist in a player's slot may become a paid privilege (compendium, subscription or VIP): not built, not decided. The owner's repair tool for a player's slot is not restricted.

## Live Game betting resilience

- A valid conducted game must never be blocked by betting-pool creation, betting notifications or loss of network connectivity.
- Betting opens one idempotent pool from the canonical game/seat/role snapshot, open for **eight minutes** after the game starts (owner, 2026-10-10: about two minutes of agreement, sheriff call and seating, then the first speeches up to roughly the sixth). Repeating the start request must not reset the deadline or existing bets.
- A pool with stakes on one side only has nobody to pay the winners: when the game ends, **every stake is returned** whichever team wins (owner, 2026-10-10; before, a lone bettor lost a lost bet but only broke even on a won one).
- Seated players and the canonical judge cannot bet on their own game.
- `LIVE_BETTING_ENABLED=false` is an emergency kill switch for betting only; canonical game validation and Live Game progression remain active.
- A betting or notification failure must be recorded as an explicit degraded state. It must not be represented as a healthy betting pool.

## Player status terminology

Automatic final statuses should use the approved semantics:

- PPK / ЛХ / shot -> **«убит»** where that status family is used.
- eliminated by voting -> **«заголосован»**.

Do not collapse these into one generic “out” status when the distinction is visible to players, results or protocol history.

Wording for how a player leaves the game (user-approved 2026-09-24): texts for players and organizers use only **«заголосован»** (voted out in the day) and **«убит»** (killed at night), plus **«удалён»** (removed by the judge) and **ППК**. Vague words that mix these up — «убрали», «выгнали», «покинул стол», «выбыл» — are not used. When the reason is unknown, the neutral label is «Вне игры».

## A player without an account (owner, 2026-10-26)

A person at the table who has no profile in the app is «Гость без профиля» everywhere: the add-person tab, the roster row (was «Гость-лид»), the seat repair, the closeout search, the protocol («Заменить гостя без профиля на игрока клуба») and the name shown when the judge gave none. The seat grid of game creation, where space is tight, marks such a seat «без профиля». Friends a player brings («+1 гость»), the event setting «Разрешить гостя +1» and a judge from outside the club are different things and keep their own words.

## Names of the circles (owner, 2026-10-26)

A player voted out on the zero day is «Заголосован в нулевом круге» on every screen and in every message (owner, 2026-10-26; replaces «в 0 круге», «в нулевой круг», «(0 круг)», «в нуле»). A player voted out later is just «Заголосован».

Circles are named by how many players sit at the table, not by day numbers. Use these words in the app, the game blank, reports and chats.

- **Нулевой круг (0)** — the first circle, all ten at the table. Never «нулевой день» (owner, 2026-10-27).
- **Девятка** — the circle after the first kill (nine at the table).
- **Восьмёрка, семёрка, шестёрка, пятёрка** — by the number at the table; e.g. «семёрка» is the circle after a voting and the second kill.
- **Угадайка при 4** — four at the table; **угадайка** — three at the table.
- Qualifiers when the usual path changed (owner, 2026-10-27): **«после промаха»** (nobody was killed at night), **«после двух промахов»**, «после трёх промахов» … (misses in a row, the number in words); **«после оставления при N»** (nobody left on the previous day — a split with everybody staying or nobody nominated; N players were at the table; replaces «после попила посидеть»); **«после попила с подъёмом»** (the split ended with the split players raised and leaving). Two qualifiers join with «и»: «Восьмёрка после оставления при 8 и двух промахов». The zero round with everybody staying is the standard course and gives no qualifier.

The protocol window names its circles this way (`circleTitle` in `protocolReview.ts`; an old game without a chronology shows «Круг неизвестен»). Protocol corrections, owner 2026-10-26: a check's answer is not chosen — it follows the checked player's real role; a missing don check is not an error; a black killed by his own team needs no death protocol; once the sheriff or the don has left (by day or killed that night) the night shows «Шерифа нет за столом» / «Дона нет за столом», and after the don found the sheriff «Шериф уже найден»; exits read as plain lines «⚖️ Ушёл №4 Перец», «💀 Ночью убили №9 Дина», «💀 Ночью промах». A split in the zero day that ends with everybody staying is the standard course of the game, so the next circle is simply «девятка» (owner). Examples: «восьмёрка после промаха», «семёрка после попила с подъёмом».

## A mistaken fact taken back (owner, 2026-10-31)

A removal, a vote-out or any other manual step made by mistake and then taken back (the player is brought back to the table) is **not an event of the game**: the game has no «left the table and came back». The mistaken fact is erased and the game is counted as if it had never happened; this is a full rollback of everything that followed from it for that player, the move and the stage of the game. A player voted out by mistake and brought back puts the voting back to «идёт голосование» (its result is erased; it can be held or corrected again). Circles are never called «круг 1, 2…»: only the official names (see «Names of the circles»).

## Fixed Elo cuts for a red's mistakes (owner, 2026-11-01)

Besides the miss penalty (−10 Elo for each responsible black on a black loss, see above), two fixed cuts of **−20 Elo** each apply to **reds**, outside the personal limits, in club games:

- **«Сломал попил красным»** — a red the judge tagged as having broken a split on purpose, on **any** circle (the zero circle included; a split of three on the «девятка» counts). It is a separate tag, set in the protocol's circle («Сломал попил красным») and, later, in the live game. The plain «кто сломал попил» mark of the zero circle keeps its own points table.
- **The last raise before a lost game** — when the blacks won and the last daily voting of the game was a raise (`all_tied_eliminated`, two or more players), every red whose hand «поднять» stayed up in that voting gets −20. Blacks are not cut; instead **every black who was at the table during that raise gets +10 Elo** (owner, 2026-11-01; ordinary personal points; paid only when at least one red hand was recorded). Only hands that were recorded count (`table_vote` events); a game without them gets no cut — nothing is guessed.
- **A black who left by a split is one credit** — a red earns for one black at most 8 Elo in all (owner, 2026-10-25), whatever the sources: his vote, the sheriff's check (+4) and the table voting the checked black out (+4), the will, the best move **and the split outcome** («Попил, ушёл чёрный» +4). The split outcome used to be added on top, so a checked black who left by a split paid +12 (owner, 2026-11-02: «максимум 2 начисления»); it now shares the black's slot like the others (a black who left by a split is the voted-out black).
- **A circle in which nobody voted for a black** — every black who was at the table through a day circle (the circles the personal points count: after the zero circle, one player left that day) and received no ballot in any of its votings gets **+2 Elo** for that circle (owner, 2026-11-02). Inside the usual personal-points limit; a black voted for in any voting of the circle gets nothing for it.

The global Elo formulas are not changed (owner decision after the balance simulation in AUDIT_LOG).

## Elo tags of the judge (owner, 2026-11-03/04)

- **«Вскрылся шерифом с шерифом красным»** — −20 Elo: дон/мафия лжевскрылся шерифом и объявил настоящего шерифа красной проверкой. Судья ставит/снимает тег вручную.
- Теги протокола доступны в карточке выбранного игрока с указанием круга; карточка и круг изменяют одни события.
- Like «Сломал попил», the judge puts the tag on a player in the live game (player sheet) and in the protocol (circle card).
- **«Вскрылся чёрному»** — −10 Elo, on any circle. **«Убил шерифа в нуле»** — +10 Elo, the zero circle only (this is the positive tag).
- Fixed amounts after every personal limit (like the split-break cut), club games, any role; a tag taken off is undone. Who may be tagged is the judge's call — the program does not check the role.

## Night, agreement and the first-day split (user explanation 2026-09-24)

- At night everyone wears a mask. The mafia shoots blind, masks on, each showing the number of the target; one number from all — the player is killed, different numbers — a miss.
- **Night shot result (owner, 2026-10-24).** A night has only two results: **killed** or **miss** (different numbers, or no target named). There is no separate «не договорились» result: the live recorder writes a night without a target as a miss, the protocol window offers only «Убит / Промах», and old games that say `agreement_failed` are shown as «Промах» (the stored value is not rewritten).
- The agreement («договорка») happens in the first night: the mafia quietly takes masks off, no talking, only gestures; the Don identifies himself and sets how the mafia will kill and, optionally, a game plan. Two ways: «статика» — the Don shows three numbers for the next nights in order; «динамика» — the Don points to targets during the day by words or gestures. They may be combined freely.
- Role deal (owner clarification, 2026-10-16): the judge wakes players one by one; the player shows the desired card number with fingers; the judge privately shows that card from the deck. Roles are shown once, cards are not handed out.
- Night order: the mafia shoots, then the Don checks, then the Sheriff. Each checker takes the mask off only in their own turn, shows a number and gets the judge's answer (Don: Sheriff or not; Sheriff: red or black).
- The Sheriff may reveal («вскрытие») at any allowed moment: in their speech or by gesture, even at the cost of a foul. If the Sheriff is not killed quickly, the Don usually either kills the Sheriff as soon as possible or claims to be the Sheriff and convinces the town that the real Sheriff is mafia.
- **«Вскрытие» (reveal) and announced checks (owner, 2026-10-12; defined here; recorded in the engine since #858 and reachable in the player panel since 2026-10-18).** A «вскрытие» is when a player openly says he is the Sheriff. Two kinds: the real Sheriff (he always reveals sooner or later, so it is not a mechanic of its own — his checks are already recorded) and a **black player — the Don or a mafia player — who claims to be the Sheriff** to make the town believe he is the real one. Usually two players reveal seriously: one of the mafia team and the real Sheriff; several mafia players may reveal, but rarely. What matters is the announced check: the revealed «Sheriff» names a checked player and the colour he announces (red or black) — for example a Don reveals and announces a red check on a mafia partner, or a black check on a red player. The announced checks of a black player are not derived from the real night checks: the judge records them by hand during the game, and the live broadcast may show who revealed and with which announced check (red / black). Planned use (owner): statistics of a player (how often he revealed as Don and as mafia, with a red or a black announced check, how often he was announced a verified black), statistics of black teams («когда … в чёрной команде»), and game review for training. The design of the record is agreed with the owner before anything is built.
- **Planned figures around reveals (owner, 2026-10-12; wording confirmed by the owner, nothing is built yet).** *Real Sheriff:* how many times he checked the Don, how many times a plain mafia player, how many times a red player (the total of «found black» is only the sum Don + mafia, so it is not a separate figure). *Black player (Don or mafia):* how many times he revealed as the Sheriff, split by Don / mafia; how many times he **covered his own black partner** — as the revealed «Sheriff» he announced a **red** check on his partner from the same black team; how many times he announced a black check on a red player. *Red player (the town):* only in votes where players who revealed as the Sheriff are among the candidates — how many times he voted for the real Sheriff, for a mafia player and for the Don (his other votes stay in the ordinary vote accuracy). These are counted per player, per black team and per game for training; the reveal and the announced checks are recorded by the judge by hand (see above), the real checks and votes already come from the move chronology.
- **Two versions of the table when a black player contests the Sheriff (owner, 2026-10-12; the owner's own example, to be remembered exactly).** Blacks: 1, 2 and the Don 3; the real Sheriff is 4. The Sheriff 4 checked 1 and found him black. Then the Don 3 reveals **against** 4 (a «лжешериф»). From that moment the table has two **competing versions** (each reveal is a version of the whole table): *version of 4* — 4 is the Sheriff and the blacks are **1 and 3** (the announced check 1, plus the rival 3, who is black if 4 is the Sheriff); *version of 3* — 3 is the Sheriff (after announcing, say, a black check on 5) and the blacks are **4 and 5** (the announced check 5, plus the rival 4, who is black if 3 is the Sheriff). Owner confirmed the assumption (2026-10-12): when a Don reveals against the Sheriff, the Sheriff never goes to check him, because for the Sheriff he is obviously black — so the rival is black in each version without any recorded check. Rule: when two players reveal against each other, **each version = «the claimant is the Sheriff»; the blacks of the version = his announced black checks + the rival claimant(s)**, and his announced red checks are his reds. For every player nobody has checked yet exactly one of the two versions is true («3 — Sheriff and 4, 5 black» *or* «4 — Sheriff and 1, 3 black») until one of them announces further checks. This comparison of versions is the training view of a game (game page / game review) and may later be shown on the broadcast.
- **Version = reveal (owner, 2026-10-24).** A «version» of the table is exactly one reveal; the number of versions equals the number of reveals. The Sheriff always reveals sooner or later and is always version 1, so it is never entered by hand. Each black player (Don or mafia) who claims to be the Sheriff is one more version: usually the game has one or two versions, a third (another black) is rare. The game protocol therefore only records the black reveals and the checks each of them announced; versions = 1 + the number of black reveals. A black player who plays the Sheriff «checks» night by night like the real one, so his announced checks are recorded **per night, in the order of the nights** (night 1, night 2, …), each with the named player and the announced colour; the order is needed for analysis and statistics. A black reveal without announced checks is flagged for the judge.
- **Statistics of the Don's reveals (owner, 2026-10-12; asked together with the figures above).** Collect, over the finished games with a chronology: whom the Don most often **announces as black** (per player, and in **bundles** — the pairs/sets he names black together, e.g. 4 and 5), whom he **announces as red** (and how often that is a cover of his own black partner versus a real red), **who the Dons are** (a list/ranking of the players who played the Don and revealed), how many times a player **revealed as the Don himself** and how many times he **handed the reveal to a plain black player** (a mafia player revealed while the Don stayed quiet). These sit next to the per-player figures above, in the profile of a Don and in the rankings.
- «Попил»: on the first day, while all 10 (or 8) are at the table, the town often splits the votes evenly between two players and then leaves both, so nobody is voted out on day one. It applies to tables of 10 or 8; nine votes cannot split evenly between two players. Mafia wins at parity, so a blind first-day vote almost always removes a red; keeping everyone gives the town an extra day and one mistake to spare.

- **Live game: one-button «Попил»** (owner, 2026-10-10). In the zero-round voting of a full table of ten, the judge presses «Попил» and names the two split players; the program raises the hands by the same scheme as the trainers (`splitVoteGroups`: five for each, other nominees none) and the judge finishes the voting as usual. What matters is the fact of the split, not which hands the room actually raised. Only a split of two, only the zero round, only a full table; any other voting is recorded by hand. The two-sheriffs and three-way splits are not part of it.

Training patterns for **ten players in the zero round** (user examples 2026-09-25): a question lists all nominees, the chosen two for the split, and the learner's seat; the answer is which **nominated player receives the learner's vote**. Other nominees get no votes in these exercises. Exactly five voters vote for each split candidate.

- If №1 is split with №2–5, №2–6 vote for №1; №1 and №7–10 vote for the other candidate.
- If №1 is split with №6–10, №6–10 vote for №1; №1–5 vote for the other candidate.
- For a candidate from №2–5 split with one from №6–10, №6–10 vote for the candidate from №2–5; №1–5 vote for the candidate from №6–10.
- If both candidates are in one half (№2–5 or №6–10), the five seats **after the lower numbered candidate** (wrapping after №10) vote for that candidate; the other five vote for the higher numbered candidate. For №3/№5, №4–8 vote for №3 and №9–10, №1–3 for №5. For №7/№9, №8–10 and №1–2 vote for №7, while №3–7 vote for №9. This rule does not replace the №1 special case or the split between different halves.

- **A player who votes for no nominee** votes for the last nominee automatically (user-approved 2026-09-26). Every trainer level counts it this way: in the whole-table level the last nominee takes everyone left.

**Expert level: rescuing a broken split** (user-approved 2026-09-26):

- 3–5 nominees in random order at a table of 10, zero round; the agreed split is two of them.
- The task starts after something already went wrong:
  - 1–3 players voted by mistake for one or several nominees outside the split, before the pair's vote — those votes are spent (example: 2, 1, 4, 3, split №1/№3, №4 voted for №2);
  - the first split candidate got 4 votes instead of 5 (example: 1, 2, 3, 4, split №1/№3, four voted for №1).
- The learner distributes the remaining players within **15 seconds** so the split still happens: both split candidates get the same number of votes, more than anyone else.
- Who insures (throws a vote to a nominee outside the split) does not matter; everyone else votes as the basic split rules say. A player whose own candidate has already passed can only insure.
- Only rescuable tasks are generated. An exam has 5 tasks, all with a break; 4 have №1 in the split. The expert level opens after the whole-table exam.

- **Achievement for the trainer** (user-approved 2026-09-26): one achievement, «Нулевой пациент» (renamed from «Спасатель попила» 2026-09-26: later trainers will rescue splits at other stages of the game; epic, category «🎓 Обучение»), for passing the expert exam. The other levels give no achievement. The curator (organizer) sees who passed which exam and when: «Ещё → Обучение» and the «Тренажёр попила» block…29164 tokens truncated… один раз.
- **fill:** Заполняемость — визиты участников клуба, делённые на число мест игровых слотов (10 мест на слот), в среднем по завершённым вечерам периода. Вечера без слотов пропускаются.
- **retention:** Возвращаются — участники клуба, которые пришли на второй вечер в течение 30 дней после первого. Учитываются первые визиты периода, с которых прошло 30 дней. При группе меньше пяти показываем только долю; остальные ещё считаются.
- **inactive:** На сегодня: 30–59 дней, 60–89 дней и 90+ дней с последнего визита. Группы не пересекаются; игроки без визитов сюда не входят. Пороги CRM 14/28 дней не меняются.
- **registrations:** Записи — участники клуба, ответившие «иду» / «приду позже», добавленные организатором или фактически пришедшие, без текущего отказа. Отказ сам по себе не запись. Отмена — отказ после ранее сохранённого положительного ответа; её доля считается среди записей и этих отмен. Неявки — среди записей.
- **sources:** Источники новых участников клуба, чей первый визит попал в выбранный период. Показываем 30 ведущих источников, остальные объединены в «Другие источники».
- **finance:** По дате вечера: начисления без освобождённых от оплаты, фактическая оплата и текущий неоплаченный остаток пришедших участников завершённых или рассчитанных вечеров периода. Запланированная запись не создаёт долг.
- **receipts:** Поступило в период — платежи income / debt_paid по дате платежа. Это другая база: не прибавляем их к оплате вечеров периода.
- **funnel:** Личные приглашения за период по дате вечера. Каждая доля относится к предыдущему шагу: доставлено → ответили → идут → пришли. Числа сохраняют фактические ответы и посещения, поэтому доля может быть больше 100%.
- **games:** Завершённые игры за период по дате сохранения протокола (турниры — по времени завершения). Игры без журнала ходов входят только в общее число. Не больше 2000 последних игр.
- **zeroRound:** Первое голосование (круг 0) — голосование после нулевой ночи. Показана доля игр, где им заголосовали мафию или дона.
- **bestMove:** Первый убитый — игрок, убитый первой ночью. Лучший ход — названные им три места. Здесь считаем ходы, среди которых есть чёрный игрок.
- **gameDays:** День голосования — игровой круг, в котором было хотя бы одно голосование. Показываем среднее число таких дней на завершённую игру с журналом ходов.
- **revotes:** Доля дней голосования, в которых было больше одного голосования (переголосование после ничьей).
- **tableDecision:** Доля голосований с решением стола поднять или оставить спорных игроков; знаменатель — все голосования в журналах игр периода.
- **sheriff:** Доля проверок шерифа, где проверенное место принадлежало мафии или дону; знаменатель — все записанные проверки шерифа.
- **don:** Доля проверок дона, где проверенное место принадлежало шерифу; знаменатель — все записанные проверки дона.
- **redWins:** Победы красных делим на игры с известным победителем при данной длине игры. Длина — число дней с голосованием; 6+ дней объединены.
- **levels:** На сегодня: игровой уровень и допуски хранятся в профиле. Число посещений не меняет уровень или допуск автоматически.
- **staff:** За период: завершённые или рассчитанные вечера назначенного организатора и завершённые игры клубного судьи. Завершённые турниры тоже считаются вечерами.
- **usage:** Для каждого игрока: сколько раз он заходил в приложение и на какие экраны. Заход — действия без паузы больше 30 минут. Экран, открытый несколько раз за один заход, считается один раз. Не входят ваши собственные заходы и заходы организаторов. История есть только с момента, когда события стали записываться с именем игрока.
- **now:** Онлайн — приложение открывали за последние 90 секунд.

Shares ≥10% show an integer, smaller shares one decimal; zero denominator shows «—» via `formatShare`. Return percentage is suppressed for fewer than five mature first visits. Finance details show the latest 200 evenings, but totals include the entire period. Usage lists at most 30 rows per kind and surface; daily retention cleanup stays on ingestion, never on the summary read. The legacy analytics paths delegate to the same calculations for one release.

## Rule-change workflow

When a requested change touches any rule above:

1. quote/paraphrase the exact rule being changed in the PR description;
2. update focused tests first or alongside the implementation;
3. avoid unrelated cleanup in the same change;
4. run the full CI before merge;
5. update this file if the approved rule itself changed.
# Split-vote training interaction

Generated questions never place the learner at either of the two seats in the split pair. The interactive whole-table level nominates 3–5 players; other level ranges remain as configured in the generator.

The levels unlock in order: basic → advanced → whole-table interactive. Only passing all five questions of the previous level's exam unlocks the next level. Practice does not unlock levels. Exam completion is recorded for the authenticated player's account and survives device changes. Anonymous visitors can use basic practice but cannot record an exam pass. Mixed endless practice opens with advanced's exam; whole-table endless practice opens with the interactive level. No rating, tokens or awards are granted.

In the whole-table level, nominees are processed in their randomized nomination order. Each seat card may be assigned to one nominee only; skipping assigns no votes. The player can revise earlier steps before submitting the complete distribution. A question is correct only if all ten seats are assigned to the two split candidates according to the approved zero-round rules and every other nominee receives no votes. Practice comprises five questions, and the five-question exam fails on the first incorrect complete distribution. Endless practice has no question limit.

## Ci compensation (owner-approved 2026-10-03)

The first-killed red player gets Ci compensation only if their best move (ЛХ) names at least one black player: the full rate when the reds lost, half of it when the reds won. No best move, or no black in it — no compensation. Standings total: Σ = wins + Σдб + Ci.


## Player profile and terminology (owner, 2026-10-05)

- **One place each.** A player's own games and his Elo history are in his profile only; «Игры» holds the club archive of games and the evening summaries (every game has its own page); «Рейтинг» holds the club table, seasons and tournaments.
- **One profile.** A player's statistics, roles, Elo, awards, streaks, season and «Игра в цифрах» live in one place — the player profile («Профиль»; another player's profile opens as an overlay with the same sections). No other screen repeats them; the «Игры» section holds the history of games and the evening summaries only. All its numbers come from one source (`premiumPlayerProfileService.ts`).
- **Overlay menu.** The profile of another player opened over the cabinet always carries the usual bottom menu next to the «←» button.
- **Hidden statistics.** When a player switched «Игровая статистика» off, others see a plain note instead of numbers; his games, roles and Elo are not available to them.
- **Sports terms.** The mafia nomination of tournaments and evening/season results is «Лучший чёрный» (not «Лучшая мафия»); the others stay «Лучший мирный», «Лучший шериф», «Лучший дон».
- **App activity (owner, 2026-10-05).** The club owner and organizers see, per player, when he was last in the app, how often he came, which screens he opened and which controls he pressed (CRM player card, «Активность в приложении»). Players are not told and cannot see it; other players never see it. History starts at the day the feature went live and is kept 180 days. Only tracked controls appear as clicks.

## Evening answer: «Очистить выбор» (owner, 2026-10-13)

- Clearing the selected games does **not** mean «Не иду». The player goes back to **«Нет ответа»** (`unanswered`) and the organizer is told that the player took the sign-up back. A player who has already answered «Не иду» himself stays «Не иду».
- Every change of the answer is still recorded in the answer history with its source (`slot_selection_cleared`).
- **Cancellation UI (owner-approved usability work, 2026-10-27).** «Отменить запись» first asks for confirmation, then immediately saves an empty selection through the same canonical slot PUT. There is no second hidden Save step. A failed request keeps the confirmed booking and allows retry. Ordinary slot edits remain an explicit-save draft; departing with unsaved edits asks whether to discard them. This does not change the response policy above.
- **Price presentation.** Calendar and booking use the existing format policy: per-game price for regular/novice slots, one entry for a rating evening. Public joining shows a preliminary price before confirmation; the server remains authoritative for the saved quote.

## «Что нового» (owner, 2026-10-13)

- Notices for players are written, kept as drafts and published by the organizer in CRM «Ещё → Что нового». Players see published notices on their home screen with a mark for the ones they have not opened. Nothing is published by itself; the first records created with the table are drafts.

## Poker: showing cards after a hand (owner, 2026-10-12)

- After a hand is over, a player who took part may show **one chosen card or both** to everyone at the table. Cards are hidden by default and showing is always the player's own choice.
- Showing is possible only **after** the hand ends (never while it is running — a folded player must not help others), only for the player's own cards, and only until the next hand is dealt. Cards already opened at a showdown cannot be shown again.
- Both cards shown = the same as a showdown (the hand and its name are visible, also in the hand history). One card shown: others see that card and a card back, the seat is marked «показана карта» (nothing is written to the chat), and the hand history keeps that card too while the other one stays hidden. Works at every table type (training, club tokens, tournaments); it changes no chips, results or ratings.

## Poker table seats (owner, 2026-10-05)

- A person who is completely AFK for **more than 5 minutes** — the app closed or the screen left, or «Отойти»/missed turns without coming back — is taken off the table; his cards are folded in a running hand and his chips stay in his bankroll. Bots are never kicked this way.
- Closing the poker screen leaves the table at once. A person whose app is in the background does not count as present; a person with no chips counts as away (he can press «Отойти», a rebuy brings him back).
- Only the club owner can take a person off a table by hand; everybody else cannot.
- Dealing runs at 0.8 of the old time; a bot waits 0.45 s to fold or check, 0.7 s to call and 0.95 s to raise; a player's own cards fade after he folds.
- The table list says «Мест нет» only when eight people sit and there is no bot to replace; the table where you sit offers «Вернуться».

## Poker MTT (owner, 2026-10-10)

A poker multi-table tournament is its own event with its own record; it is not a cash table. Decided with the owner; settings, registration, start, the tables, eliminations and places, the paid re-buy, the prizes, the cup, medals and achievements are built; the calendar listing and the table chat with emotes follow.

- **Entry is free** for everybody and gives a starting stack for nothing. Tournament chips are **nominal**: they exist only inside the tournament and are never cashed out into club tokens. Club tokens move only for re-buys (paid from the player's own tokens) and for prizes.
- **Players:** no hard cap (the owner expects roughly 4 to 20, more is allowed). The organizer sets the minimum (default 2 since 2026-10-11: the owner wants a quick tournament to run even with two or three players; with two players the prize pool is split between first and second place) and an optional maximum; with no maximum registration stays open until the start.
- **Start:** automatic at the set time when at least the minimum registered. With fewer the tournament is **cancelled** and everyone registered gets a personal message. A tournament that is running cannot be cancelled.
- **Format «турбо»:** the first level is the cash-game 10/20, each level raises the blinds by roughly half (10/20, 15/30, 20/40, 30/60, 40/80, 50/100, 75/150, 100/200 …); default level length 6 minutes, default stack 1,000 chips. Every one of these is a setting of the tournament (level length, stack, seats per table, re-buy, prizes).
- **Re-buy:** a player who busted may buy back in with his own tokens (default 200 tokens for 1,000 chips since 2026-10-11, before 500; the price goes into the prize pool) until the end of the chosen level (default level 6, before 4); after that nobody returns and busting is final.
- **Tables:** as few tables as possible, filled evenly (10 players at 6 seats: 5 + 5; 20: four tables of 5; 4: one table). The seat count per table is a setting, 2 to 8 (the table engine seats eight at most). Tables merge as players bust until a final table remains.
- **Prizes (prize pool, owner decision 2026-10-11):** the prize pool is the **club's guarantee** (set per tournament, default 2,000 tokens) **plus every re-buy** of the tournament, with no commission; it is split by percentages for the first places (default **65 / 25 / 10**, which with the default guarantee is 1,300 / 500 / 200; the percentages must add up to 100). Each re-buy raises the pool by its price (default **200 tokens for 1,000 chips**), so the pool grows with the number of re-buys and shows live in the card, the calendar page and the announcement. With fewer players than prize places, the shares of the places that exist are scaled up to 100%; every payout is rounded down and the leftover tokens go to first place, so exactly the pool is paid out. Only the guarantee is new money in the club's token economy; re-buy money is the players' own and goes back to them. Older tournaments keep the fixed token payouts they were created with. Besides tokens the winners get achievements and a cup in the profile.
- **At the tables:** the tables are ordinary poker tables with the blinds of the tournament clock; hands are dealt by themselves, nobody leaves a tournament table (closing the screen only sets «away»; an away player is still dealt in, folded and blinded out, and nobody is removed for being idle). Nobody can be seated or kicked by hand, there are no bots.
- **Bust-outs and places:** a player out of chips is out for good unless the re-buy is open. While it is open he stays seated and waits; when the chosen level ends, everyone still waiting is out, the later bust-out placed higher. After that the first to go out takes place N (N = players still alive), several out in one hand are ordered by the stack they started it with (bigger stack higher). The last player standing is first; the winner is declared a few seconds after the last hand's result.
- **Tables are balanced between hands only:** when the players fit at fewer tables the smallest table is closed and its players move to the emptiest of the others; tables are kept within one seat of each other. A moved player is dealt in from the next hand.
- **Re-buy (built):** a busted player presses «Докупить» (at the table or in the tournament card): the price in club tokens is debited from his own balance (default 200 tokens for 1,000 chips, added to the prize pool), he gets the chips and plays on from the next hand, and he can do it again after each bust until the chosen level ends. Not enough tokens, or the window closed: nothing is taken.
- **Prizes, cup, achievements (built):** when the last player is left, the token prize the organizer set for each place is credited to the wallet (paid once). The winner gets a cup («Победитель покерного турнира») in the profile's trophy cabinet and the achievements «Покерный чемпион» (one win) and «Король стола» (three wins); second and third place get medals. The awards carry no mafia-tournament link.
- **Calendar (built):** a poker tournament that is taking registrations or is running appears in the player calendar («События») with the «Покер» badge, its player count and the player's own registration, under its own filter «Покер». Opening it shows what the tournament is (start, minimum and maximum, free entry and stack, level length, re-buy, prizes) and lets the player register or leave for free; a running one leads to the poker section. Cancelled and finished tournaments leave the calendar.
- **Announcements (built, owner approved 2026-10-11):** when creating a tournament the organizer ticks where it is announced: the club Telegram group, the public Telegram channel, the VK community, and a personal message to every club player (not guests from another city, not blocked players; the group and VK are ticked by default, the personal message is not). The text names the tournament, the start (Moscow time), free entry, prizes and a link to the sign-up. Each channel is sent once; a failed or not yet configured channel is retried by the scheduler every five minutes until the tournament starts. Players on pause («Перестал ходить»), blocked or archived players get no personal announcement. Players who registered, including those who registered inside the last half hour, get one personal reminder 30 minutes before the start, besides the existing «started» and «cancelled» messages.
- **Editing a tournament and the live table (built, owner decision 2026-10-11):** until the tournament starts the organizer may change anything in it (title, start time, stack, length of a level, seats, minimum/maximum, re-buy and late-registration levels, re-buy price and chips, prizes); the maximum cannot go below the number already registered, and an announcement that already went out is not re-sent. After the start nothing can be edited. The create and edit form shows a table of levels that recalculates with every number (clock times in Moscow time, until when a newcomer may enter and re-buy, and a warning when the stack at the end of the re-buy or late registration is under 10 big blinds); the same table is shown to all players in the card and the calendar page.
- **Late registration and the table of levels (built, owner decision 2026-10-11):** a new player may still enter a tournament that has already started until the end of the level the organizer chose (the setting «Поздняя запись до уровня», default 6, 0 = closed once it starts; tournaments created before the setting existed never allow it). He enters free like everybody else, gets the same starting stack, sits down at once at the emptiest table with a free seat (or at a new table when all are full) and plays from the next hand; the maximum number of players still applies, and a player who has gone out cannot come back this way. The organizer sets the late-registration level and the re-buy level separately for each tournament (defaults: both 6; the owner preferred to choose per tournament). The tournament card and the calendar page show the **table of levels**: level, blinds, when it starts (Moscow time), the starting stack in big blinds at that level, and marks for «запись» and «докупка» while they are still open; the announcement in the club group and VK carries the short version (length of a level, until when a newcomer may enter and buy back in). The times of the levels are exact; how long the whole tournament lasts is not promised. For orientation (6-minute levels, 1,000 chips): the starting stack equals 10 big blinds at the end of level 6 (minute 36) and under 1.5 big blinds at level 12 (minutes 66–72), so a late entry or re-buy at a high level is almost an all-in.

## Poker table chat and emotes (owner, 2026-10-10)

- Every human poker table (the permanent «Общий стол», open tables on club tokens, tournament tables) has a chat; the training table with bots has them too (owner, 2026-10-12; bots do not answer). Only people seated at the table write; anybody who looks at the table (an eliminated tournament player, for instance) can read.
- A message is a short plain text (up to 140 characters, one line, links are replaced by «…») or one of the **emotes**: an emoji with its own short animation drawn over the sender's seat, with a phrase under it. A few emotes are friendly (hello, bye, GG, good luck); most are teasing and provocative on purpose (the owner asked for «задиристые»). The phrases do not address a person as «ты»/«вы».
- One message per person every 1.5 seconds; the table keeps the last 100 messages and anything older than a day is swept. Each viewer can switch the chat off for himself («Выключить чат»): then nobody's messages and emotes are shown to him.
- The emote list is in `src/shared/pokerEmotes.ts`; adding one is a code change (an emoji, a phrase, one of the animation names).

## Club connections (owner approved, 2026-10-07)
The club panel leads with pairs for red and black separately. Preserve the existing best-pair score (win percentage + twice the joint-game count capped at ten games), minimum two games; show up to five. «Самые сыгранные» orders by joint games, then team wins. Single-game pairs appear separately as «Первые совместные игры», never as proven strong pairs. All counts use completed canonical club/tournament snapshots. Personal rival wins mean the viewer’s team won, not a personal defeat of the other player. Recent meetings aggregate only games the viewer played in his latest completed event; source and event id together identify an event. A person may appear on both sides after changing teams between games. No changes to Elo, awards or game rules.

The existing «Игровые связи» visibility applies to every relationships list. A player with connections disabled is excluded for other viewers before ranking or slicing; a viewer may see his own hidden connections. The relationships endpoint retains player-only authentication, without granting a new organizer access path.

### Distinct club stories (owner correction approved, 2026-10-07)
These are descriptive completed-game patterns, not friendship, individual contribution or causal synergy scores. Each entry shows game and distinct source/event counts. Full black trios require exactly one don and two mafia in the original snapshot and all three visible; roles may rotate across games. Oriented don–mafia and sheriff–citizen pairs count only their specified roles. These three groups require two games and rank by games, events, wins, stable identity. Balanced opposing-team pairs require four games and each team's win share between 35% and 65%; rank nearest 50%, then sample size. Both-color pairs require two games per color and display separate team results; rank by the smaller color sample, then total games. Shared-table circles count distinct visible co-players, require two games, and rank by people, events, games. Each category shows at most three examples. Thresholds are display rules, not statistical significance. Deduplicate source/game identities; reject snapshots with missing or duplicate player IDs. Apply existing connections visibility to every category and count.

New club stories also reject original protocols with any unidentifiable or unclassified seat: the canonical snapshot preserves a marker when legacy sanitization drops a guest/missing ID or unknown role. This guard applies only to the new stories; existing analytics retains its behavior.

## Achievement stories and action metrics (owner-approved 2026-10-08)

- Achievements gain separate game-story and career paths. The first release contains 16 conditions defined in `src/lib/achievementStories.ts`; rationale and the remaining candidate set live in `docs/ACHIEVEMENTS_REDESIGN_PROPOSAL.md`. Existing 46 definitions, earned dates and organizer edits remain; manual/legacy grants and overrides are not silently discarded. Official tournament trophies and club titles stay distinct. No token reward, Elo change or playing/judging entitlement follows from a new achievement.
- Story achievements use confirmed completed games. A nomination is not a vote; the citizen chain requires the player's own nomination, own final vote, actual elimination of that black and a red win. Last-three and last-black stories require reconstructible live composition and ordinary wins, not PPK/removal finishes. PU best moves are distinct from zero-circle best moves, use three unique valid seats, and may earn accurate-LH stories even on a red loss. Sheriff checks count different actual targets; checking a red is not intrinsically an error. The don's sheriff hit must be a real check of a live sheriff before their exit.
- Voting action counters exclude the whole zero day and all split/revote chains that end in raise/leave, whether players are raised or left. Other days count only one final confirmed candidate ballot per voter, not each re-vote as a separate decision. Cancelled/pending rounds do not count.
- Critical circle is evaluated from the living composition before elimination: at least one black and one or two more reds than blacks. Voting out a red gives parity immediately or after the next successful kill. It is not merely the final three/four. Incomplete/restored-exit chronology yields unknown critical status, never an invented non-critical result.
- Counts separate the actor's red/black role and the target's red/black team; sheriff targets are a subset of red targets. Sheriff and don checks have separate breakdowns. Zero-night sheriff identification is not a check. A target selection without confirmation of the regular-night substep is not a check.
- Evidence and game links are private to the player/organizers; achievements must not bypass existing profile/game privacy. Path and up to three earned-story pins are saved for the canonical player; another player's identity in a request never authorizes writing their preferences.

## Tournament awards: places and nominations (owner, 2026-10-12)

- **Places** in the final standings of a tournament: the **1st place is a cup**, the **2nd and 3rd places are medals**; they are carried into the profiles of the players who took them. The tournaments are the federation's (GoMafia) and the club's own past ones (Cup etc.).
- **Nominations** are exactly these five: **Лучший мирный, Лучший дон, Лучший шериф, Лучший чёрный (GoMafia key `best_mafia`), MVP турнира.** Only the winner of each nomination gets the award. They are the same nominations the club already uses.
- Awards only: nothing is recounted — no games, Elo, ratings or achievements change. Matching is by the exact federation ID (never by nickname).
- **A VK player connects Telegram from the app (owner, 2026-10-14).** A player who signed up through VK and has no Telegram sees «Telegram не связан» in «Настройки → Личные уведомления» with «Связать Telegram»: it opens the bot with a personal one-time link (`/start claim_<code>`, made inside the signed-in session) and the Telegram account is linked to that very profile, no nickname typed, no organizer request. A newcomer who types the nickname of such a VK-only profile in the bot is told to do this instead of «ник занят». A profile with its own Telegram is still simply «ник занят».
- **Connecting Telegram from the bot, without opening VK (owner, 2026-10-14).** When a newcomer types in the bot the nickname of a VK-only profile, the bot offers two ways: «Подтвердить через ВКонтакте» — a one-time link (30 min, `POST /api/bot/telegram-link-request`) that opens the app, VK ID signs the person in, and the Telegram account that asked for the link is attached to that profile (`/player?tglink=<code>`, `POST /api/player/telegram-link/redeem`; both accounts are proven by their owners); or «Запрос организатору» — the organizer approves the link by hand (the request is now allowed for a profile that has VK but no Telegram; a profile with its own Telegram is still «ник занят»).

## Owner clarification — gathering and beginner cards (2026-10-16)

- Gathering readiness counts people, including guests and their separately recorded companions, once each. A separately assigned evening judge counts once even without an RSVP row; if that player already has a response, do not add another person or turn a thinking/declined response into going. Raw signup totals remain separate from judge-inclusive gathering totals. Ordinary evenings require 11 people (10 players + judge); novice evenings require 9 (8 players + judge). These are recruitment thresholds, not a change to playable seat counts, prices or the minimum for cancelling a game already in progress.
- Organizer event worklists show regular club/novice evenings first, ratings/tournaments second, other events last; date orders each group. Historical chronology remains chronological.
- Approved beginner-card copy and the two final PNG assets: [SPORTS_MAFIA_BEGINNER_CARDS.md](SPORTS_MAFIA_BEGINNER_CARDS.md). In the cards the first-killed best move and penalty consequences are intentionally omitted. They remain part of the full rules and game engine. «Убитый или заголосованный говорит прощальную минуту, затем покидает игру». General discussion is absent; players speak in turn. The Don's task is to lead the mafia and find/kill the Sheriff or play the Sheriff himself.

## Domain model decisions (owner, 2026-10-23, answers to the domain-model audit)

These are the owner's answers to the questions where copies in the code disagreed. The code is brought in line with them step by step; see `PROJECT_STATE` (Domain model programme) for status.

1. **Games counted in profile statistics** (total games, win rate, roles): only **completed** games. For a club game the protocol is closed and the evening is not cancelled. For a tournament game both the game and its protocol are completed. Drafts and planned games are not counted.
2. **Best move (ЛХ) sources.** The best move of the player **voted out in the zero round** counts exactly like the best move of the first player killed at night. It counts for Elo **and** for tokens.
   - **Where it applies** (owner, 2026-10-23): the zero-round best move exists only under the tournament game setting; see «Zero round → Game setting» below.
3. **Protocol checks.** The club evening protocol gets the same consistency checks as the tournament protocol. For example, a player with 4 fouls must be marked removed, and the protocol cannot be saved otherwise. Table size stays as it is: 8–10 for novice evenings, 10 otherwise.
4. **Saving a live game.** Unchanged: a live evening game is saved as a completed protocol, and a live tournament game is saved as a draft for review.
5. **«Думаю» is not «Идут».** «Идут» counts only «Иду» and «Приду позже», and so does the shortfall («недобор»). «Думаю» is shown separately.
6. **Evening price.**
   - Novice and ordinary evenings use the existing rules (per-game price with an evening cap). The numbers are **system settings the owner can change in the app**, for example to raise prices.
   - Rating evenings cost **500 ₽** by default.
   - The tournament fee is entered when the tournament is created.
   - **Free first visits are only a gift from the owner:** nobody gets them automatically. The organizer gives a specific person free games or evenings in the CRM.
   - **A new price applies at once** (owner, 2026-10-23: «если я делаю новую цену, нужно её применять сразу»): every evening that is not closed (draft, published or running) uses the current settings, and the amounts due are recounted when the price is saved. A closed evening keeps its price.
7. **Evening posts.** ~~One template for VK and Telegram~~ — **replaced by the owner on 2026-10-23: «у каждого поста свой текст»; «для общего вечера всё было норм».** Every post keeps its own wording: the club evening VK post is the editable template, the novice and rating posts and every Telegram post use their own texts (see «Evening / Telegram» above). Only the prices are shared, from the price settings; a rating post says «Взнос … ₽ за вечер — до начала игр».
8. **Player name in tournaments.** The **club nickname** is shown everywhere. The tournament display name is used only for guests without a profile.
9. **Achievements.** There is **one** set of achievements; the separate list in «Прогресс» is merged into it. There are **no minimum-game cut-offs**: «strongest role» and similar indicators have no 5- or 10-game minimum (owner: «без отсечек и ограничений»).
10. **Open evening** (owner, 2026-10-23). An evening is open when it is **published or in progress and not yet closed**. Players see only open evenings in «Актуальное» and in the bot; drafts are never shown to players. Players can be invited and can sign up **until the evening is closed**, including during it (someone may come later).


## Daily word (owner-approved, 2026-10-28)

- Purpose: a fun daily reason to open the app, independent of Mafia performance. One common Russian noun per Moscow day; the owner explicitly requested variable length. Initial supported range4–8 letters and6 guesses are implementation defaults stated in the conversation. Е and Ё are equivalent.
- Participation is free, including all6 guesses. A win awards **200 club tokens**, once per player/day, regardless of speed or attempts (owner correction supersedes the initially proposed10). No paid extra tries, entry fee, streak multiplier or loss penalty.
- Auto selection uses a curated common-word pool, excluding the previous90 assigned days when available. A broader server noun dictionary validates guesses. The owner can assign/replace a dictionary word for a future day. Today's puzzle cannot be changed. The assigning account earns no reward and is excluded from comparison for that puzzle.
- Attempts and results persist on the server across devices; a retry never consumes another attempt or awards twice. Win persistence and token settlement are one transaction. The canonical token ledger owns the balance. A reward can reduce an existing negative balance.
- New day at00:00 Europe/Moscow. Unfinished yesterday games expire; yesterday attempts cannot be applied to today. Skipping does not remove tokens; streaks are informational.
- Answers stay server-only. A losing player can reveal the answer after finishing. Other players' finished results open only after one's own completion; shared text contains colour squares and attempt counts, never letters. No automatic messages or publication.

## Virtual role dealing (owner, 2026-10-28)

The approved fair virtual deck is an alternative to manual physical-role entry in all game formats. It follows the existing10/9/8-player composition in tableComposition; horizontal cards are renumbered after removal, the judge reveals and confirms separately, may choose another unassigned seat, undo the last assignment or explicitly redeal before starting. Synthetic training keeps its fixed task roles. Tournament assignments remain subject to the existing server role permissions and composition checks.

VIP owner decisions and the current integration are recorded in [ROLE_DEAL_SPEC](ROLE_DEAL_SPEC_2026-10-28.md); later decisions below supersede the initial configuration-only scope. No default global2-swap cap is approved; the personal limit is manually configured. Effects may influence only the owner's own still-closed card and must never alter an already shown role or operate in rating/tournament games. Strength/frequency/conflicts/global caps require modelling and owner agreement before implementation.

## Owner decisions of 2026-11-02 (live game and Elo)

- **Self-vote is allowed.** A player may vote for himself in a vote count (owner: «конечно»). Nothing in the code blocks it; it is not to be blocked.
- **Elo is counted only for a registered player, from his first game.** Owner (verbatim): «ЭЛО считаем только у зареганного гостя с 1 игры». A guest without a profile is not converted into a profile inside an already played game (owner: «нет»); Elo is not counted for him retroactively. Wording to be confirmed back to the owner: a guest who registers gets Elo from the first game he plays as a registered player.
- **No adaptive base win chance in Elo.** The idea of replacing the fixed 30/70 base chance by one built from the club's real win rates is cancelled (owner: «такого не будет»).
- **Telegram: two kinds of places (owner, 2026-11-02).** The entry channel «Анонсы» (destination `public`) gets only announcements of games and the «there is a table / there is none» announcements (the «Мы собрались» photo, evening and tournament announcements). Every other message that used to go there goes to the regular chats instead: the evening summary picture (already goes to the evening's group), the weekly season table (now to the club chat, destination `club`), tournament results (now to the rating group only). A club digest is posted by the organizer to the destinations he chooses.

## «Обучение»: reading colours of specific players (owner, 2026-11-02)

A separate training statistic in the player's **«Обучение»** section — not part of the player's profile. **«Читать цвет»** (owner's term) = to correctly tell a player's colour (red/black). The player sees whose colours he reads correctly and whose completely wrongly, so he understands which players' colours he needs to work on.

What the page shows (owner, 2026-11-02): **top-3 lists, ranked by count; no minimum number of games** — the count itself is what matters. Split votes («попил») are not counted. The lists:
1. top-3 players you vote for **correctly**;
2. top-3 players you vote for **wrongly**;
3. top-3 players who vote for you **correctly**;
4. top-3 players who vote for you **wrongly**;
5. top-3: whom you vote for when he is **the don**;
6. top-3: whom you vote for when he is **the sheriff**.
The earlier six «blocks» and the minimum of 5 games together are replaced by these lists. Names of the lists are the owner's to give.

- **Red player's vote error** = a vote for a red player (a civilian or the sheriff). A vote for **the sheriff** is a much worse error and is shown separately.
- **«Who votes for you correctly / wrongly»** (owner, 2026-11-03): correctly = you are black and he votes for you; wrongly = you are red and he votes for you.
- **The player's own votes while he is black are not counted** (owner, 2026-11-03).
- **Black block stays** (owner, 2026-11-03): when you are **mafia** — top-3 who votes for you (trusts you least) and top-3 who votes together with you; when you are **the don** — the same two top-3 lists (who votes with you, who votes for you).
- **Layout** (owner, 2026-11-03): not one long column — the lists are chosen with a switch, the page should look organic and good.
- **Visibility** (owner, 2026-11-02): only the player himself sees his statistic; the organizer can view the full statistic of every player.

## Judge of a tournament game (owner, 2026-11-03)

- In a tournament with **one table** the tournament's judge conducts **every** game of it.
- With **two tables** a judge is bound to a table. A table is not stored yet: the judge set on the game is the table's judge; a game without its own judge belongs to the tournament's judge.
- One rule for every reader (who may open a game with judge access, the judge's «Мои игры», «судил N игр», achievements): the «Игра» layer (`gameService.ts`).

## Virtual role deal: one tap per player (owner, 2026-11-03)

- On the setup screen the virtual deal is the main button on top («Раздать виртуальные карты»); the physical deal is the second choice below («Физическая раздача»).
- A bought role (150 ₽ into the evening debt) is marked **before** the deal starts: choose the player, then the role; its card leaves the deck.
- After the last player's card («Следующий игрок» of the 10th) the roles are saved and the game opens by itself (owner, 2026-11-03).
- After «Начать раздачу» the judge taps **«Стартуем»** to open the first player's turn (owner, 2026-11-03); later turns open by themselves. «Начать раздачу» opened the turn of the first player without a role by itself before, with 10 seconds to pick a card. A tapped card shows the role to the player at once. When the time is up without a card, the program picks a random card. **«Следующий игрок»** is available only after the 10 seconds and opens the next player's turn.
- **Look (owner-approved mock-up, 2026-11-03):** the live-game material; ten seat tiles with the player's avatar and the table's seat colour (done: dimmed with a tick; choosing: white frame); the choosing player large with the timer in seconds and a shrinking bar; playing cards in real proportions (63 × 88 mm, corners about 5 % of the width) with a matte black back and the club logo; a taken card leaves the row: the cards left are numbered again from 1 and the row narrows, no faded places (owner, 2026-11-03: «не было затемнения карт, они должны перенумеровываться и сужаться»); the opened card is the app's role card in the same proportions.
- **On the stream (owner, 2026-11-03):** the OBS overlay shows the deal at the bottom, just above the players' cards, centred, with «Выбирает карту · №N ник» above the cards (the middle of the picture stays free for the camera): the choosing player's seat and nickname are lit, only the cards left are shown (renumbered, as on the judge's screen), the chosen card turns over and the viewers see its role; a player who got a card shows that role on their player card at once, as the overlay does during the game. No timer box. A training game does not stream the deal.

## VIP: количество игр с успешной подкруткой (решение владельца 2026-11-03)

- Проценты задаются отдельно для роли/одноцвета/разноцвета, но **счётчик один на игрока для всех его условий**, а не на отдельное условие и не на число замен карт.
- Галочка **«На весь вечер»**: вероятности проверяются заново в каждой игре вечера без ограничения числа успешных игр.
- Без галочки организатор выставляет количество **игр, в которых реально сработала VIP-подкрутка**. Если лимит 2, и подкрутка была успешна в играх №2 и №4, на последующие игры этого вечера вероятностные условия отключаются.
- Несколько успешных условий в одной игре считаются одной успешной игрой. Не сработавшие вероятности, невозможная подмена и обычная естественно выбранная подходящая карта лимит не расходуют.
- При новом вечере отсчёт начинается заново. Оплаченная гарантированная роль имеет приоритет и сама по себе VIP-лимит не расходует. Турнир/рейтинг остаются без VIP-подкруток.
- Владелец разрешил подключить эти настройки к реальной виртуальной раздаче (2026-11-03). Учёт подтверждённых успешных игр атомарный, с защитой повторных запросов; отмена/перераздача убирает соответствующие успехи. Незавершённое открытие карты временно резервирует квоту от одновременной другой игры.
- Прежняя гарантия Чагина — обычное редактируемое условие «Красная карта» с 100% и «На весь вечер», без отдельной привязки игрока в алгоритме. Выключение, изменение процента и удаление действуют через те же настройки. Для активного 100% условия сохраняется прежняя защита последней закрытой красной карты; успешный защитный обмен учитывается получателю гарантии. Купленные роли имеют приоритет. Настройки и внутренний учёт видит только владелец клуба; ведущий/судья не получает признаков эффекта.


## VIP в карточке игрока (владелец, 2026-11-03)

- Владелец меняет подкрутку игрока прямо в CRM → карточка игрока, блок «VIP-подкрутка» (видит только владелец клуба). Те же правила и та же квота, что в «Данные и настройки».
- Условия словами владельца: «Мне нравится играть на …» (роль), «Люблю играть в одноцвете с …» (игрок), «Не хочу играть в одноцвете с …» (игрок; это прежний «разноцвет»). Под каждым — ползунок «Шанс срабатывания»; новое условие — **50 %** по умолчанию.
- Одно условие у игрока — один раз. Галочка «На весь вечер» или число игр — общая для всех условий игрока; первое условие само включает «На весь вечер», без неё условия не срабатывают.
- Игроки сами настраивать пока не могут (владелец: «потом будем»). «Усиленная подкрутка вскрывающихся ролей (дон и шериф поровну)» — не построено, ждёт уточнения.
## VIP: смысл ползунка — 50 % это обычная раздача (владелец, 2026-11-03, заменяет «шанс срабатывания на каждом выборе»)

- **50 %** — подкрутки нет, обычная раздача. **100 %** — всегда. **0 %** — никогда. Между ними итоговая доля меняется ровно: 25 % — вдвое реже обычного, 75 % — посередине между обычным и «всегда». Одинаково на любом месте.
- Как: один раз на раздачу для каждого условия бросается жребий — действует ли оно в этой раздаче (выше 50 % — с шансом (p−50)/50, ниже — 1−p/50). Если действует, работает как прежнее 100 %-условие: проверки и замены на каждом выборе карты, защита нужной карты от других, равная жеребьёвка конфликтов. Ниже 50 % действует обратное: «никогда эта роль», «одноцвет» → «разноцвет» и наоборот. Перераздача бросает заново.
- Проверено стресс-тестом (20 000 раздач на случай, AUDIT_LOG): шериф 0/25/50/75/100 % → 0/4,8/9,9/54,4/100 % на первом и последнем месте; одноцвет → 0/26,5/52,4/76,7/100 %.
- Несколько условий «никогда эта роль» одного игрока (ниже 50 %) объединяются в одно обещание: «никогда мафия» + «никогда дон» на 0 % дают 0 % (раньше по отдельности ~4,5 %).

## VIP — окончательное уточнение владельца 2026-11-03 (заменяет прежние трактовки)

- **Карты — термины владельца (2026-11-03):** «красная карта» — карта мирного жителя, «чёрная карта» — карта мафии. Дон и шериф — отдельные «тематические» карты, ни красной, ни чёрной картой не называются. Не путать с цветом команды (красные = мирные + шериф, чёрные = мафия + дон), который используется только в «одноцвет / разноцвет».
- «Красная карта» в настройке — строго `citizen` (мирный житель). Шериф — отдельная роль. Красная команда для одноцвета — мирный или шериф.
- Процент проверяется независимо заново на каждом применимом выборе. Если до владельца условия другой выбирает нужную роль, при 80% в 80 случаях из 100 карта заменяется другой доступной закрытой картой, а в 20 случаях уходит этому игроку. Это не одна предварительная проверка на всю раздачу и не обещание итоговой частоты роли.
- Одноцвет/разноцвет становится определённым после первой открытой карты пары. Второму может подмениться карта с исходным процентом, независимо от того, кто первым открылся. До хода второго тем же процентом проверяются попытки остальных забрать нужный цвет. Не заводить дополнительный микрокоэффициент. Квота/успех учитывается владельцу условия, даже если меняется карта второго игрока.
- Из всех сработавших доступных условий выбирается одно с равными шансами, в том числе если условия совместимы. «Шериф» + «мирный» — разные условия. Одна жеребьёвка и максимум один обмен на выбор; не запускать цепочку новых подмен от карты замены.
- Выполнимые 100% гарантии не допускают иной роли: для 100% мирного одна карта мирного сохраняется до хода игрока, шериф не является заменой. Если несколько гарантий несовместимы или нужной карты уже нет (в том числе из-за покупки), нельзя добавлять роли или отнимать открытую/купленную карту; применим равный выбор между выполнимыми гарантиями.
- Обмен только двух закрытых карт; донор выбирается случайно среди допустимых карт, не между названиями ролей. Купленная роль имеет приоритет. Общая квота разных успешных игр, идемпотентность, отмена и запрет VIP в рейтингах/турнирах сохраняются.
