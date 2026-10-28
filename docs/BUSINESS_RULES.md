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

The protocol window names its circles this way (`circleTitle` in `protocolReview.ts`; an old game without a chronology keeps «Круг N»). Protocol corrections, owner 2026-10-26: a check's answer is not chosen — it follows the checked player's real role; a missing don check is not an error; a black killed by his own team needs no death protocol; once the sheriff or the don has left (by day or killed that night) the night shows «Шерифа нет за столом» / «Дона нет за столом», and after the don found the sheriff «Шериф уже найден»; exits read as plain lines «⚖️ Ушёл №4 Перец», «💀 Ночью убили №9 Дина», «💀 Ночью промах». A split in the zero day that ends with everybody staying is the standard course of the game, so the next circle is simply «девятка» (owner). Examples: «восьмёрка после промаха», «семёрка после попила с подъёмом».

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

- **Achievement for the trainer** (user-approved 2026-09-26): one achievement, «Нулевой пациент» (renamed from «Спасатель попила» 2026-09-26: later trainers will rescue splits at other stages of the game; epic, category «🎓 Обучение»), for passing the expert exam. The other levels give no achievement. The curator (organizer) sees who passed which exam and when: «Ещё → Обучение» and the «Тренажёр попила» block on the player card.

**Three-way split with nine at the table** (user-approved 2026-09-26), a separate trainer «Попил на троих»:

- One player (any seat) is killed, nine remain; three nominees split the vote 3 : 3 : 3.
- The three split players vote first: all three for the first of them in nomination order.
- Everyone else votes in seat order: the first three for the second split player, the next three for the third. Other nominees get no votes. Whoever votes for nobody goes to the last nominee.
- Examples: 10 killed, nominated 5, 2, 8 → 258 in 5, 134 in 2, 679 in 8. 10 killed, nominated 7, 2, 5, 9, 4, split 2, 9, 4 → 249 in 2, 135 in 9, 678 in 4, nobody in 7 and 5.
- Five levels, in this order (user-approved 2026-09-28): easy (three nominees, pick your own vote), medium (4–6 nominees, three split, distribute the whole table), «Сложный» (a broken split, below), «Кого пилить» (below), «Экспертный» (two sheriffs, below). Each opens by the previous level's exam of 5 correct answers; a level once passed stays open; this chain does not depend on the zero-round trainer.
- **«Сложный» — a broken split, 15 seconds** (user-approved 2026-09-28). Only a split player breaks the split: the split players vote first, for the first split player, and one of them does not raise his hand. Everyone who has not voted yet then votes for the breaker: the breaker wants someone else out, so nobody votes along with him (his own hand is not part of the task); the hands already raised for the first split player cannot vote again. Tasks come with and without sheriff claims (with claims, the planned votes are those of the two-sheriffs level). The learner distributes the remaining players; running out of time is a wrong answer. Examples: split 1, 2, 3 and 1 does not vote for himself → 2 and 3 are up for 1, everyone else votes for 1; split 1, 2, 3 and 3 does not vote for 1 → 1 and 2 are up for 1, everyone else votes for 3.
- **«Кого пилить»** (user-approved 2026-09-28): the task gives the sheriff claims and the nominees; the learner picks the three split players by the two-sheriffs rules below. When the third split player is free, any nominee outside the claims is correct.
- **«Экспертный» level (was «Сложный» until 2026-09-28) — two sheriffs** (user-approved 2026-09-26). Two players claim the sheriff; nobody knows which is real, so there are two versions: if one sheriff is real, the other sheriff and everyone that sheriff checked black are mafia. The task states which sheriff the town trusts less and each sheriff's check; at least one check is black.
  - Who is split, three kinds: (1) only the less trusted sheriff has a black check — that sheriff, his black check and one more player; (2) both sheriffs have a black check — both black checks and the less trusted sheriff (both black checks never go to a split without that sheriff); (3) only the trusted sheriff has a black check — the less trusted sheriff, the trusted sheriff's black check and one more player, so by the trusted version two black players leave (example: sheriff 1 checked 2 black, 3 claims the sheriff against him, the town believes 1 → 2 and 3 are split).
  - Black players with no split player black by the other version (kind 3: the two black players of the trusted version) vote as usual.
  - Who votes where: everyone black by one version votes for a split player who is black by the other version (as mafia they vote against a red player and have no spare hand to break it). Order: first such hands with only one such split player; then the other split players as usual — for the first split player with a free vote (a split player votes for himself if needed); then such hands with a choice of two split players — where a vote is still free, in nomination order; then everyone else fills the nominees in seat order. The whole table is distributed; there is one correct answer.
  - Example (user, 2026-09-26): sheriff 9 checked 1 black, 2 claims the sheriff against him, split 1, 2, 3 → 1, 2, 3 vote for 1 as usual, and 9 votes for 2 so he cannot add a fourth hand to 2.
  - Example: 10 killed, sheriffs 1 and 4, the town trusts 4 less, 4 checked 2 black, 1 checked 6 red; nominated 4, 2, 7. By 4's version 1 and 2 are mafia → both vote for 4; by 1's version 4 is mafia → he votes for 2; split player 7 votes for 4 → 127 in 4, 345 in 2, 689 in 7.
  - Example (kind 3): 10 killed, sheriffs 1 and 3, the town trusts 3 less, 1 checked 2 black, 3 checked 5 red; nominated 2, 3, 7. 2, 3 and 7 vote as split players for 2; by 3's version 1 is mafia → he votes where a vote is free, for 3 → 237 in 2, 145 in 3, 689 in 7.

The table picture in the trainers (user-approved 2026-09-26): a round table with eleven places — the host at the bottom, players 1–10 starting at the host's left hand and going round the table (1 bottom-left, 10 bottom-right next to the host). The trainers show on it who was killed, who is nominated and split, the learner's seat, the sheriff claims with their checks and, while distributing or after the answer, whom every seat votes for. The hard level also shows a short summary «если прав шериф N: мафия — …» for both versions (a restatement of the task, not the answer).

Seats in the trainers are written the club way (user-approved 2026-09-26): no «№»; who votes for whom is written seat after seat with 10 as «0» («в 2 проголосовали 3460»); a list of nominees keeps commas; a single seat keeps «10».

## Table conduct (user-approved 2026-09-24)

Forbidden at the table, with the usual penalty:

- swearing and near-swearing («хер», «хрен» and similar): accidental — technical foul; deliberate — removal;
- oaths and appeals to religion («клянусь», «богом клянусь») — PPK;
- bets («спорим на тысячу, что я мирный») — depends on the context, usually PPK;
- threats and personal (not in-game) insults — usually PPK, sometimes removal;
- remarks about intelligence, one's own included («я же не тупой так играть») — depends on severity, usually a technical foul.
- interfering with the first-killed player's protocol or best move (naming three black players) — technical foul;
- excessive emotion and aggression — technical foul;
- any action during the night that the player's role does not call for — removal.
- touching other players, knocking on the table, excessive gesturing — foul;
- addressing the judge outside one's own minute, unless the judge gives the word — foul.

Nomination and voting basics the guide teaches (user-approved 2026-09-24): one nomination per speech, and an already nominated player cannot be nominated again; on the first day a single nominee means no vote (none — no vote either), then night; a speech may end early with «спасибо» or «пас»; each player votes once, by placing a fist on the table with the thumb pointing up when the judge names the candidate, and cannot change the vote; a day removal cancels that day's vote. Phones are banned only at tournaments, so the guide does not list them.

The novice guide (`/guide`) shows this list first in its «Правила» tab.

## Broadcast overlay visibility

The OBS/Twitch overlay is a spectator surface linked to the conducted Live Game, not a second judge protocol.

- The secret OBS overlay may show all assigned roles and alive/out status; the ordinary public `/live` page must remain role-safe.
- The current game number must be visible. When available, show both the game’s global club number and its order within the current evening.
- **Game order within an evening (owner, 2026-10-10).** The evening number counts only games that were actually kept, in creation order. A game that is deleted (archived) — e.g. a test game made to try the screen — never takes a number: if the first game is deleted, the next one is «Игра 1». This holds wherever the game is shown as part of its evening (CRM evening list, Telegram result blank, personal evening results, the player's evening pages and live view). Player history, profile and single-game screens, which list games across evenings, keep showing the club-wide number (`global_game_number`) as the game's identifier; that is a separate running counter and may have gaps.
- Nominations must preserve their actual order of выставление. A nomination remains distinct from a vote.
- While the judge is collecting/correcting ballots, the overlay may show the candidate set but must not show partial counts or individual choices.
- Only after the judge fixes the round result may the overlay show totals and the exact voter-to-candidate mapping.
- Each revote is shown as the active round with its own candidate set and fixed result; do not merge several revotes into one invented vote.
- Loss of broadcast connectivity must not block Live Game on the phone. The overlay may freeze on the last confirmed frame and catch up after reconnection.
- The secret OBS overlay shows the night as it happens (owner, 2026-10-01): the shot seat, the Don's and the Sheriff's checked seats with their results, the first killed player's best move and protocol, and by whose hands a player left a fixed vote. Viewers see all roles there anyway; the ordinary public `/live` page stays role-safe and shows none of this.
- Judge-only notes, Undo history and other closed workflow state are not part of the audience payload.

## Corrections and completed games

- Organizer/judge correction workflows may edit completed game/tournament protocol data where the application explicitly supports correction mode.
- Corrections must preserve auditability/business invariants and must not reset unrelated data.
- A failed/pending final game save must be recoverable without silently changing the canonical server roster.
- If a stale local protocol references outdated player identities, recovery may rebind gameplay results to the **current canonical server roster by seat**; it must not use the stale local save to replace server player/participant identities.
- A pending game must remain openable in correction mode rather than trapping the organizer behind only a retry button.

## Club evening awards (user-approved 2026-10-04, two titles from 2026-10-05)

- A completed club evening has **two titles**:
  - **«MVP вечера»** — the audience vote. One question for the evening's attendees: «Кто сыграл лучше всех?». The earlier role votes («Симпатия», best red / black / sheriff) are retired; their stored votes stay in the database but are neither offered nor counted.
  - **«Игрок вечера»** (owner, 2026-10-05) — by results: the player with the most game wins of the evening; on a tie the higher win rate (wins per game played), then the player with more games; players still equal share it. A player with no won game does not get it. It is the same rule as «Игрок вечера · по результатам» in the stories and on the big screen.
- Voting stays open for **3 days** after the evening is closed (owner, 2026-10-04: a Friday evening is voted on until Monday, before the next one is announced). «MVP вечера» goes to the nominee with the most votes; a tie shares it. An evening with no votes has no MVP. «Игрок вечера» does not wait for the vote: it exists once the evening is completed.
- Both titles are **trophies** in the player's showcase, one automatic award per evening (`club-evening-mvp:` / `club-evening-wins:` keys), kept in line with the data: a recounted vote or a corrected game adds or takes the trophy back.
- Titles are counted **per calendar year** (Moscow time); the counters start from zero every January and are shown in the player's showcase as «Игрок вечера · год: N» and «MVP вечера · год: N».
- When a year is over (owner, 2026-10-05: two yearly titles), the three best players get an automatic award, on two separate podiums: **«Игрок года <год>»** by the evening titles «Игрок вечера» (wins) and **«MVP года <год>»** by the evening titles «MVP вечера» (vote). Only players with at least one title of that kind can be on a podium. The places are ranked by a **weighted rating** (the formula behind IMDb-style charts, chosen by the assistant on the owner's request for «a coefficient people have already invented»): `(titles + 5 × club rate) / (evenings attended + 5)`, where the club rate is all titles of that kind in the year divided by all attendances in the year. So a player with two evenings and two titles does not beat a regular with ten evenings and seven titles, and a newcomer who wins a lot still gets a place. Ties go to more titles, then more evenings; equal ratings share a place; at most three places; past years stay in the showcase. The current year has no award yet, only the counters.
- **Voting in the bot (owner, 2026-10-05).** Besides the app (Клуб → Истории), the vote is a message with buttons in the Telegram bot: right after an evening's personal card every attendee reached through Telegram gets «Кто сыграл лучше всех?» with one button per other attendee. A tap is the vote, a tap on another player changes it, the chosen player is marked ✅. The same rules as in the app: attendees only, never yourself, only while the 3 days are open; the app and the bot share one vote. Players reached through VK vote in the app. Evenings closed before this shipped get no such message.
- Tournament awards are separate and unchanged.

## Tournaments for players (owner, 2026-10-06)

Any player can open any tournament that is published (registration), running or finished, whether he plays it or not («Рейтинг → Турниры» now; «Сообщество → Турниры» after the navigation rework): registration (places taken, own status, a button to answer and pay while registration is open), the roster, the games and the table with the nominations. Games show seats for everybody and **roles of a game only after it is finished** (a running game keeps them hidden). The table and the nominations are live: they show the results of finished games while the tournament is played and are marked «промежуточная» until it is completed — players do not wait for a publication. **«Закрыть таблицу для игроков»** (organizer button on the «Игры» and «Итоги» steps, usually for the last three games) hides the table and the nominations from players (roster and games stay visible) until the organizer opens them again. The earlier list of «published results» pages is not what players see any more.

## One tournament format (owner, 2026-10-06)

Every tournament uses the same screen in four steps («Настройки», «Игроки», «Игры», «Итоги») and the same registration model. Tournaments made the old way (participants only, no registrations) were moved to it once: each participant became a confirmed registration, the format flag was set and registration was marked closed; games, protocols, results and places did not change. A tournament is never created the old way any more. In every tournament of Bogdan (a title containing «Богдан») the judge is «Чагин» and the organizer «Богданчик» (also on each game of those tournaments, so judge tokens and «Отсудил игр» follow); the token and achievement reconciliation at start recalculates the effects. Both changes keep their previous values in `migration_history` and a file snapshot of the whole database (`pre-tournament-unify-<time>.sqlite` next to the database, `/data/backups` in production) is taken before they run (see `docs/RUNBOOK.md` → «Tournament format migration: snapshot and revert»).

## Evening payment reminders and gifts (user-approved 2026-10-05)

- A **debtor** of a club evening is a player who attended, is not exempt and has paid less than the amount due (the same people «Дела» lists as «Не оплатили»).
- **«Напомнить должникам»** (organizer button in the evening's payments) writes a personal message through the player's Telegram or VK route to every debtor; **automatic reminders** do the same a day and three days after the evening is closed, for evenings closed within the last 14 days. A person gets **at most one reminder a day** for an evening. The message says how much is owed (and how much is already paid), for which evening, and how to pay: by transfer to the owner's number, +7 967 431-71-19, Sberbank (`CLUB_PAYMENT_DETAILS` overrides the text); the app cannot take payments yet, so the message never promises that.
- Who pays on a regular (CASUAL) evening (owner, 2026-10-12, replaces the 2026-10-06 rule): the **club owner** and the **organizer assigned to that evening** play without a fee, also when they sit at a table; everybody else — the judge included — is charged for the games played, and a player who should not pay is given a gift evening by hand (the waiver below). The rule has no date limit: a recalculation of an earlier evening (opening its payments, closing) also zeroes the organizer's accrual, with an ordinary ledger adjustment (the history is not rewritten).
- **«Продлить вечер» — extension of the evening (owner, 2026-10-12).** When the club pays the venue extra for time, the organizer presses «Продлить вечер» in the evening's «Оплата» and enters two numbers: **how many games were in the extension** and **the amount** (any whole number of rubles). The amount is split equally between the **players who sat in those last games**, not counting the organizer of the evening, the judge of the evening and the club owner, and **rounded down to a whole ruble** per player. It is **charged at once when it is entered** (owner, 2026-10-19: tied to the games, not to closing the evening; before that it waited for the closing) and **tied to the games played at that moment** (`evening_extensions.games_total_at_entry`): games played afterwards do not move it, and the share never counts as a prepayment, so it never blocks a game and is **one more line inside the player's single payment** for the evening («вечер N ₽ + продление M ₽»): the player pays everything at once, the organizer marks it in the same place. It works on **every evening format**: on regular evenings it is part of the played-games amount outside the 400 ₽ ceiling, on other formats it is added on top of the price of the evening. A gifted evening (waiver) frees the player from it. Several extensions of one evening are taken from the end: the newest covers the last games, the older one the games before them. An extension can be removed (the charge is corrected by an ordinary ledger adjustment). It is only the organizer's input that is stored (`evening_extensions`); the shares are always recalculated from the games. The player sees the extension share as a note on their own payment card («В стоимость входит продление вечера: M ₽») and the debt reminder in the bot names it; creating an extension sends **no** message by itself.
- **After closing**, the summary tiles «Пришли», «Собрано» and «Долги» of the evening open the roster or the payments list (paid / unpaid). Payment buttons: «Принять оплату» is green, «Снять оплату» is quiet, the reminder is amber.
- **A part of the sum by hand (owner, 2026-10-22).** In «Оплата вечера» the organizer can enter how much a player has already paid (pencil next to «Принять оплату» / «Снять оплату»), from 0 up to the evening's price. A part keeps the status «partial»: the row reads «Оплачено X из Y · долг Z», the player stays in «Не оплатили» with only the rest as the debt. On a closed evening the ledger follows: a rise is a `debt_paid`, a fall returns the money to the debt; the amount can be corrected again any time.
- **Evening route** (owner, 2026-10-06): five stages — «Подготовка», «Сбор», «День вечера», «Вечер идёт», «Закрытие»; a closed evening ends at «Закрытие» (there is no stage after it, and the route does not offer to create the next evening). «Закрытие» has two steps: «Оплаты» and «Закрыть вечер», which names what still blocks closing.
- **Before closing an evening** (owner, 2026-10-05) the organizer goes through the debtors in the closing step «Оплаты»: «Оплачено» if the player has paid, «🎁» if the player played with a gift; everybody left is charged when the evening closes and is reminded. The manual «Напомнить должникам» is offered only after the evening is closed.
- **«🎁 Подарить вечер»** (owner, 2026-10-05) is the ordinary evening-specific waiver (`evening_fee_waivers`) with the reason «Подарочный вечер», set by the organizer with a confirmation and taken back with «Вернуть оплату»; in the books it is shown as an ordinary waiver, with no separate mark. Only for regular (CASUAL) evenings.

## Evening registration

### Current club focus

The current operating default is the established main club and its regular CASUAL evenings. Existing players belong to the club path, not the novice path. NOVICE and TOURNAMENT remain supported, separate product contours; do not expose their extra workflow in the default regular-evening workspace.

### First visit and novice funnel

- Being new to **2LA Noire** is independent from playing skill: `club_stage` owns the club relationship, while `game_level` owns sports-Mafia level/access.
- The external first-visit choice has exactly two routes: **«Я новичок / почти не играл»** and **«Я уже умею играть»**.
- A first-time novice chooses the novice route independently and immediately receives `NOVICE_ACTIVE` and, if previously unassessed, `game_level=novice`. No organizer approval is required. Choosing the route alone does not book an evening; the player then answers «Иду» and chooses games. A legacy pending novice application can be continued by the player without organizer intervention.
- An experienced visitor's first application is reviewed manually by an organizer; until confirmation, they may see eligible events but cannot self-register. If their application selected a specific available evening, confirmation also records «Иду» for that evening.
- Every new player starts with `game_level=novice` («Новичок»); there is no «unknown» level (owner decision 2026-09-28, replaces the former `unrated`). The organizer's confirmation of «Я уже умею играть» is the assessment: it moves the player to `CLUB_PLAYER` and `game_level=club` («Играет в клубе»). Experience must never be fabricated from club tenure alone.
- One-time migration `2026-09-retire-unrated-level`: players still `unrated` become `club` when they are `CLUB_PLAYER` or attended a non-NOVICE evening, otherwise `novice`. The legacy value `unrated`, if it ever appears, is treated as `novice`.
- Promotion from the novice route to the main club is manual; attendance never auto-promotes or auto-removes a player. The organizer's «Перевести в основной клуб» also raises `game_level` from `novice`/`unrated` to `club`, so CASUAL booking opens at once; a higher level already set by the organizer is kept (user-approved 2026-09-24).
- Automatic free visits are retired (owner, 2026-10-23). Pricing and explicit CRM gifts follow «Domain model decisions», item 6. Historical closed accounts are not repriced.
- The standard Friday operation is briefing at 18:30, rules-aware arrival at 19:00 and CASUAL continuation at 21:00. A NOVICE evening's start time is its first game (default 19:00); the briefing is shown 30 minutes earlier and has no game slot (user-approved 2026-09-24). Organizers check the group on Thursday at 20:00 and decide by Friday at 15:00; the system must not cancel automatically.
- A novice is invited only to NOVICE evenings until the organizer raises the level. Telegram and VK use the same canonical player/application state.

Approved response model for an announced evening includes:

- **Иду**
- **Не иду**
- **Приду позже**
- **Пока думаю**

Personal evening messages follow the player's answer (user-approved 2026-09-24):

- no answer — an invitation with the answer buttons (skipped when the bot announcement already reached the player); **48 hours before** the start (owner, 2026-10-01) the organizer's «Напомнить неответившим» goes out by itself once, to everyone who got the bot's invitation and has not answered — only between 10:00 and 21:00 Moscow time (at night it waits for the morning while the evening is still more than a day away), not for tournaments, not while publishing is paused, and not when the organizer already reminded by hand in the last 24 hours; and one more nudge within 24 hours of the start;
- **Иду** — only a reminder 24 hours before;
- **Не иду** — nothing until the next announcement;
- **Пока думаю** — from 24 hours before, «Что решил?» with the answer buttons and a choice of when to ask again («утром в день игры» or «за 3 часа»);
- **Приду позже** — asked to pick the games they will make, until they do.

Club (CASUAL) evening posts — the Telegram group post, the personal invitation and the VK post — are the owner's short text (owner decision 2026-09-29): «Привет! В пятницу, 2 октября, играем в мафию — ждём тебя 🎭», then place, start time and price on one line, then «Отметь кнопкой ниже, придёшь ли, и выбери игры» (in VK, the sign-up link). In the Telegram group post the lists of who is coming sit between those lines and the call to action (owner, 2026-09-29: the group must see who comes, who thinks, who comes later); the personal invitation stays short. Novice evening posts in the novice group and the novice personal invitation use the same friendly style (owner, 2026-09-29): «Привет! В пятницу, 2 октября, играем в мафию с новичками — приходи 🎭», «Никогда не играл — не страшно: в 18:30 объясним правила, потом сыграем вместе. Можно прийти одному.», then place, time and price. Every group post lists, besides players by game, those who answered but picked no games («Идут, игры ещё не выбрали», «Придут позже», «Пока думают») and, by name, those who cannot come («Не смогут») — a summary of every player who answered (owner, 2026-09-29).

Signing up on the public evening page (`/join/<id>`, from VK) goes step by step (owner decision 2026-09-29): sign in through VK, pick games, confirm with «Записаться»; the choice can be changed later and saved again. Picking a game alone does not register the player.

The event/announcement model is centered on an evening with linked player contacts/statuses. Avoid introducing a CRM model that requires a separate sales “deal” for every player/evening unless explicitly requested.

Evening restrictions are product-level event restrictions (for example newcomer/rating/tournament type), not an invitation-reservation system by default.

### RSVP and exact game-slot plan

Planned evening response and exact game-slot commitment are related but separate facts.

Approved Telegram/player behavior:

- **Иду / Буду** -> automatically select all current game slots for that evening;
- **Приду позже** -> record late intent, but do not invent an exact game-slot plan automatically;
- **Пока думаю** -> record thinking, with no automatic exact game-slot plan;
- **Не иду / Не буду** -> clear selected game slots;
- changing away from an automatic “all games” answer must not leave stale automatic slot commitments behind;
- manual exact game selection must persist through the canonical slot-plan save route.

### Walk-ins

An existing player from the player database may be added to a current in-progress, not-yet-closed evening even if they did not register beforehand.

- A walk-in must not be given a fabricated historical **«Иду»** response.
- Preserve any real prior response if it exists.
- Factual attendance and played games may be recorded independently from the planned response.
- Explicitly placing a participant into one of the ten seats while creating a game is an organizer check-in: the selected participant becomes factually attended inside the same transaction, while their planned response remains unchanged.

## Recurring Friday evenings

The regular club cadence is automatic rather than organizer-maintained by hand.

- The player calendar should continuously expose regular **Friday 21:00 Moscow** club evenings roughly **35 days ahead**, so players can register several weeks in advance. Club evenings start at 21:00, after the novice evening (rules 18:30, games from 19:00) — owner decision 2026-09-28, replacing the earlier 20:00.
- Calendar visibility and external announcement are separate states: making a future evening available for registration must **not** immediately publish a Telegram/VK post.
- For the upcoming Friday, the weekly external announcement becomes due on **Monday at 19:00 Moscow**, whatever time that Friday starts (e.g. a club evening moved to 21:00 after a novice evening, user-approved 2026-09-28).
- That weekly announcement should use the existing connected flow: Telegram channel/group publication, VK publication, and the initial eligible personal Telegram invitations.
- The automation must be idempotent: refreshes, retries, restarts or delayed wake-ups must not create duplicate posts or duplicate personal invitations.
- If the service was asleep at the exact due time, the next safe reconciliation should catch up the still-upcoming Friday instead of silently skipping the week.
- Existing manually created Friday drafts inside the rolling window may be promoted to registration-open/published state rather than duplicated.
- A cancelled Friday remains cancelled; rolling calendar reconciliation must not create another evening for that date.
- **First-game time is asked before the announcement** (owner, 2026-10-23): ordinary evenings are created at 21:00, but without a novice evening the club may start at 20:00. From Monday 12:00 Moscow (and again each day from 12:00) the bot asks the organizer «Во сколько первая игра?» with 19:00 / 20:00 / 21:00. The weekly announcement of an ordinary evening **waits for the answer**; at 19:00 the bot says it is waiting, and it goes out as soon as the time is chosen. Choosing the time before the announcement sends no «перенос» notice. Novice and rating evenings are not asked. After the announcement the time changes only in the CRM, as a real move with its notice.
- A weekly announcement that has started delivery must not retry automatically after an uncertain delivery result; investigate the publication and resume manually to avoid duplicate posts.
- Periodic VK refresh only updates existing posts; a missing or uncertain VK publication requires explicit reconciliation before another creation attempt.

## Announcement history

A completed/closed evening is historical club information.

- Closing registration or finishing an evening must **not** destroy the old Telegram announcement/history by replacing the whole previous message with only “registration closed”.
- Historical announcement content should remain visible in chat after the evening closes.
- Future UI/automation may add archival status, but it must preserve the useful old message/history.

## Evening close-out

Closing a club evening should be **fast, flexible and fact-based**, not a rigid admin checklist.

- Every regular Friday evening gets a high-priority organizer task due **Saturday at 19:00 Moscow** to finish the evening.
- Before final close, the organizer must resolve the factual attendance of players who answered **«Иду»** or **«Приду позже»**: attended or no-show.
- The close-out UI should support bulk attendance actions as well as per-player correction so the organizer is not forced through every row one by one.
- A player who arrived without registration can be added or found quickly during close-out and marked as attended without fabricating a prior «Иду» response. Planned response and factual attendance remain separate facts.
- **Whom the club waits for a payment** (`isPaymentExpected` in `src/lib/eveningPaymentScope.ts`): on a **novice evening** only the players the organizer confirmed and marked as arrived (owner, 2026-10-01); on other evenings also those who answered «Иду» / «Приду позже».
- Payment does **not** block closing. For an attended player, the recorded paid amount is income and any remaining amount becomes debt at settlement.
- Before final close/settlement, a manually confirmed payment must remain correctable: an accidental full-payment mark can be removed and returned to unpaid so the organizer is never trapped by one mistaken tap.
- Quick attendance/payment actions should update the affected row/state in place; a routine single-row mark must not force a full workspace reload that resets filters/scroll/selection.
- Repeated payment/reconciliation calls must be idempotent with respect to the unique financial transaction source key; retrying a valid action must not fail because an adjustment row already exists.
- If all game protocols are present and completed, close normally.
- If games were not entered or unfinished drafts remain, the organizer may explicitly choose **«закрыть без полной игровой статистики»**. Unfinished drafts must be excluded from active statistics rather than silently treated as completed games.
- Closing the evening completes its organizer close-out task.
- The UI should optimize for a short flow: **attendance → walk-ins → payment/debt → games → close**.

## Announcements

**Evening host and rescheduling (owner-approved 2026-10-09):** Club/novice/rating announcements name the specifically assigned «Судья вечера» as «Ведущий вечера»; this is a staffing fact, not an ordinary player/role grant. After a published evening's date/time changes before it starts, tell players who answered «Иду», «Приду позже» or «Думаю» via their chosen personal notification channel, and issue a separate correction in the evening's main Telegram destination and VK public wall. Keep existing posts synchronized; do not duplicate the original announcement. An unchanged start sends nothing. Cancelling remains pre-start-only even though its control is grouped with closing tasks.

The intended flow is:

`organizer creates/publishes evening -> connected channels/bot notify players -> players respond -> statuses appear in the application`

Runtime smoke tests should prefer:

1. read-only integration health checks;
2. a single targeted/test recipient;
3. only then a real limited announcement when explicitly intended.

Do not use a club-wide production announcement as a generic health check.

### Where announcements go (user-confirmed 2026-09-28)

- **Telegram entry channel «Мафия в Туле 2LA Noire»** is what people find in Telegram search. Its job is to route incoming people through the bot: a novice goes to the novice group, someone who can already play goes to the club group. The channel holds one pinned router message (the nearest novice and club evenings with buttons), edited in place. The only evening posts there are the **invitation posts of novice evenings**; club evening posts never appear there and are removed if found. Between announcements the channel stays alive automatically (owner, 2026-10-01): the «Мы собрались» photo once it reached the evening's group, the «Итоги вечера» picture after an evening of any format (rating included) is closed, and on Monday afternoon the tables of the running seasons in one message; each carries a link to the bot. These are results, not evening announcements, so the cleanup of club evening posts does not touch them.
- **Telegram novice group «Игры для новичков»** gets the ordinary novice evening announcement, not the invitation.
- **Telegram club group «2LA Noire мафия в Туле»** gets the club (CASUAL) evening announcement.
- **Telegram closed rating/tournament channel** is for the narrow circle of tournament players: RATING and TOURNAMENT evenings, later other posts for them.
- **VK group** gets the invitation post for novice evenings and the ordinary announcement for the others.
- The invitation post starts by saying it is a novice evening (`headline` and `firstTimeText` in `src/shared/novicePromo.json`), then date, venue, schedule and price, a sign-up link, the novice group links and the organizer contacts, and ends with the approved promo text (owner decision 2026-09-29: the essentials first, the promo last). The Telegram sign-up link goes through the bot so the Mini App gets the player's Telegram login, and it lets a novice sign up straight from the post without going through the groups first.

### Game results in the club chat (owner, 2026-10-01)

- After each completed game of an in-app evening the bot posts **the game blank** as a picture to that evening's Telegram group (novice / club / rating, the same place as «Мы собрались»): game number, evening, date, which team won, the judge with avatar, every seat with avatar, nickname and role, the game's events (first killed, best move with the named seats, fouls, technical fouls, removal) and each player's Elo change with the new Elo (novice evenings do not move Elo).
- **Points appear only on rating evenings.** Ordinary and novice games have no points; their blank marks the winners instead. Tournaments are not part of this: they have their own result export.
- **Organizer reminders in Telegram (owner, 2026-10-22).** The owner gets, in personal Telegram (recipients as for the other organizer alerts), each message once: (1) what is still open on the evening's route — on the morning of the evening day (from 09:00 Moscow) and 3 hours before the start; (2) every day from 10:00, an evening that began more than 4 hours ago and is not closed (until it is closed or cancelled); (3) from 12:00, once a day, the debts of evenings closed in the last 60 days (people and sum); (4) from 10:00, once a day, overdue organizer tasks. Code: `organizerReminderService.ts`, run by the minute scan of `personalTelegramNotificationService.ts`.
- **Quick answers in organizer notifications (owner «да», 2026-10-23).** Under the overdue-tasks reminder and under the organizer digest every listed task has two buttons: «✅ <task>» closes it and «⏰ Завтра» moves its deadline to tomorrow 10:00 Moscow time. The pressed task's row disappears from the message. Only the organizers who receive these notifications may press them; the server checks it. The digest also has «📋 Открыть CRM». Code: `organizerTaskQuickActions.ts`, bot `handlers/organizer_quick_actions.py`.
- When the organizer closes the evening, the bot posts **the evening summary**: number of games, red : black, number of players, most wins, the biggest Elo gain of the evening, and the best sheriff, don, mafia and citizen.
- **Evening summary — leaders (owner, 2026-10-19).** «Больше всех побед» lists only players with **two or more wins**. On rating evenings the evening leaders are decided by the **average points per game** (sum of points / number of games), not by the sum.
- **Evening summary — best by role by effectiveness (owner, 2026-10-19).** Each role's nomination is the **average effectiveness per game played in that role**; ties go to the one with more games in the role; a role nobody played is the only empty nomination. Effectiveness of one game:
  - **Citizen and Sheriff:** +1 for a red win; +1 for each black named in his best move (ЛХ — both the first-killed player's and the zero-circle voted player's); +1 for each black he marked «black» in his colour protocol; −1 for each black he marked «red»; +1 for each vote against a black and −1 for each vote against a red (**the zero circle never counts**); the Sheriff also +1 for each check that found a black. A red named in the ЛХ is not penalised.
  - **Mafia and Don:** +1 for a black win; +1 for each red who marked him «red» in the colour protocol; +1 for each ЛХ that did not name him.
  - Owner's term: «ошибки красных» = reds marking a black «red» and reds leaving a black out of the ЛХ. Code: `seatEffectiveness` in `clubResultData.ts`. The season table (below) shows **two** best-by-role lists (owner, 2026-10-19): by wins (most wins in the role, fewer games first) and by these indicators (same effectiveness rule, average per game).
- **The season so far** (the rating period from the app that counts this evening: its format and dates, or an organizer override) rides as the **second picture of the same message** as the evening summary, to keep the chat quiet: top 10 of the period (ordinary — by wins; rating — by average points per game) and the best sheriff, don, mafia and citizen of the season. No period — no season picture.
- On rating seasons only players with **at least 40% of the most active player's games** are in the top (owner, 2026-10-01; the share is `SEASON_MIN_SHARE` in `clubResultData.ts`). The players below the minimum are named on a line under the top («Близко к зачёту», games played / games needed); the best by role also counts only players in the top. Ordinary seasons have no minimum.
- **Personal message:** the bot sends each player **one message per evening** after it is closed (not one after each game): their games with role and result, points on rating evenings (sum and average), the evening's Elo change and new Elo, and buttons «Мои игры» and «Позвать друга». Club games no longer send a separate Elo message.
- Each picture is posted once. Evenings that started before the feature was switched on are never posted. Walk-in guests without a profile count in the evening summary under their seat name.

## Tournament publication

Approved high-level publication format for tournament summary graphics is three logical outputs:

1. winners;
2. table/results;
3. nominations.

Historical UI/visual requirements may evolve, so inspect current publication components before changing visuals. The three-part information model should not be collapsed without an explicit redesign decision.

## Tournament seating

- The generated seating of a tournament distance is balanced (owner, 2026-10-03): in every block of ten games each player takes each of the ten seats exactly once, so nobody sits on one seat a second time before all seats were used (a 10-game tournament: every player on every seat once). Within that rule the generator avoids putting the same two players next to each other (seats are a circle, 10 next to 1) game after game. Games are no longer shuffled independently: independent shuffles gave someone three or more games on one seat in every tournament.
- **Editing a tournament game (owner, 2026-10-22: «чем гибче и быстрее всё правится, тем лучше»; «почему в игре нельзя что-то изменить, если мисскликнул»).** One rule for the judge, the roles and the seats of a game: a game that has not started — everything; a running game — everything until its protocol is completed (a seat fixed in the CRM gives that seat's result to the player who sits there now; the judge's live window shows which seats changed); a completed game — the judge at once, roles and seats after «Исправить» on the game, which reopens it; a game of a completed tournament — «Исправить» first returns the tournament to correction (public results hidden, draws and manual awards reset, as the existing reopening does). Another game running at the same time never blocks an edit. Every edit is written to the tournament history (who, what, when). Starting a planned game and regenerating the whole seating keep their own rules below.
- An organizer may regenerate the seating while the tournament is a draft and no game was played; seating is locked after the start. For a tournament made through «Турнирный вечер» the button «Перегенерировать рассадку» really draws the whole seating again (before 2026-10-03 it kept an already prepared seating); the one-time «prepare» at set-up still keeps an existing seating. Replacing a confirmed player keeps the prepared seats.

## Tournament evening registration and entry fee

- `TOURNAMENT` is a distinct event format. Regular `CASUAL` price-per-game, 400 ₽ cap, historical debt reconciliation, wallet-token logic and betting must not rewrite tournament entry-fee truth.
- A tournament evening is only a registration/preparation front door into the canonical `tournaments` domain. Confirmed registrations synchronize into `tournament_participants` before seating; conducting, protocols, standings, compensation scoring, awards, three-part result publication, Elo and token settlement remain owned by the existing tournament engine.
- Player capacity is **exactly 10**, excluding the assigned canonical judge. The assigned judge cannot register as a player in the same tournament.
- Places, waiting and payment deadlines follow «Tournament registration» (answers «Играю» / «Готов подменить» / «Пока думаю» / «Не смогу»). A freed place is filled atomically by exactly one waiting player; retries must not create an eleventh confirmed player.
- Organizer add/remove/manual-promotion/queue-reorder actions require an explicit reason and must remain auditable.
- Draft creation is not publication. A stable player link uses `/player/events/<tournamentId>` only after explicit publication. Tournament publication uses the canonical personal notification router and sends at most one external personal notification channel per eligible canonical player; the assigned judge is excluded from the player audience.
- Tournament money is stored in rubles. Prize-allocation total must equal the configured prize fund before publication.
- Online acquiring is not part of this workflow. Player action **«Я оплатил взнос»** records only a `pending` payment claim. Only organizer `confirmed` status counts as received money. `rejected`, `waived`, `refunded` and return-to-`unpaid` remain explicit, correctable audit states; `waived` removes the unpaid obligation but is not revenue.
- Historical tournaments must not be rewritten, reseated or recalculated merely to add registration metadata. `Турнир Богдана 1.08` remains a read-only regression reference for the pre-existing tournament engine and publication/results path.

## Player economy / payments

### Rubles, club tokens and shop purchases (owner-approved 2026-10-07)

- The economy is designed for one organizer and a small club. Prefer automation and obvious status over enterprise-style finance dashboards.
- **Rubles are real payments.** Evening fees, tournament entry fees, direct shop purchases and tournament prizes are recorded in rubles and remain separate from virtual balances.
- **Club tokens are earned, not sold.** A player receives them from approved Mafia/club activity; additionally every real player gets one **1,000-token starter grant** so the club poker table is available immediately. The starter grant is additive, recorded in the token ledger and issued once per canonical player (merged duplicate profiles do not get a second grant). Rubles must not be converted into club tokens and the existing `token_packages` schema is not approval to sell tokens.
- Earned club tokens may be spent on shop perks/services. The same shop item may also offer a direct ruble/SBP purchase so a player can either earn it through club activity or pay for the service directly.
- A separate paid premium currency is **not required now** and is deferred unless the owner explicitly revives it.
- **Club tokens are the one earned game currency.** The owner explicitly approved using the same tokens for the existing club betting pool and for real poker between people: they may be won or lost there, while rubles and any future paid currency must never become the wager balance.
- **Human poker uses the club-token wallet, not a second bankroll (owner-approved 2026-10-07).** Blinds are **10/20 tokens**. A player chooses the amount moved from the wallet into the table stack: **minimum 10 BB = 200 tokens**, with **1,000 tokens = 50 BB** kept as the convenient default; any larger whole-token buy-in is allowed while the wallet can cover it. A busted player chooses a new buy-in under the same minimum. Leaving, being removed by the owner or being removed for AFK returns the remaining table stack to the canonical token ledger. Poker wins/losses therefore change the same earned-token balance used by the shop.
- **Bots are training only, and training is private (owner-approved 2026-10-07).** A training session contains exactly one human plus bots, uses free internal poker stacks and never changes the club-token balance. Other humans cannot discover or join somebody else's training session.
- **Human-vs-human poker is always on club tokens.** A live token table never accepts bots and cannot be switched into training; to practice, leave/cash out and start a separate private bot session. Old persisted poker tables from the former separate-bankroll implementation remain training so historical test chips can never become real club tokens.
- Poker chip graphics and the engine's `chips`/stack fields remain a table representation, not another player currency.
- **Poker invitations (owner-approved 2026-10-07).** A seated player at a live token table may invite another club player. The UI prioritizes people active in the app, then best-effort VK `online/last_seen`; Telegram online status is not available to the bot and must never be fabricated. The invite itself goes through the player's personal-notification routing (owner-approved 2026-10-13): to the linked Telegram account, and for a player who has only VK linked, as a message from the club's VK community (VK allows a community to write only to people who allowed its messages; if refused, the existing fallback applies). It deep-links to that exact live lobby. A player with neither channel cannot be invited. One sender may invite the same recipient at most once every **2 minutes**. Opening an invite never spends tokens automatically: the recipient still explicitly chooses a buy-in of at least 10 BB and joins the table.
- **Tournament prizes are real money.** Track the player's real entry payments and real prize payouts separately from virtual balances. The player may see his own aggregate «Заработано призовыми» and tournament money history; this is private to that player and organizers, not a public profile statistic.

### Online payment target for a self-employed organizer (owner-approved 2026-10-07)

- Final UX target: a player pays the exact obligation or shop item inside the app through SBP, and the app reconciles it automatically.
- The server must bind every external payment to one canonical purpose/obligation with an idempotent payment intent and authenticated provider callback; a successful callback must not be double-counted on retries.
- The chosen provider/bank integration should support a self-employed NPD flow with automated receipt creation/delivery or a reliable receipt callback, so the organizer does not manually match transfers and issue every receipt.
- Provider credentials and vendor-specific fields stay outside product/business rules. Keep a provider adapter so the payment service can be replaced without rewriting evenings, tournaments or the shop.
- Until online acquiring is actually configured and runtime-verified, current manual payment confirmation remains the truth; UI and messages must not claim that an online payment was accepted when it was not.

- Wallet/tokens, shop, betting, manual evening accounting and free-evening credits are active product areas.
- For every regular **CASUAL** evening, the canonical charge is **100 ₽ per actually played completed game**, capped at **400 ₽**: 0/1/2/3/4/5+ completed games produce 0/100/200/300/400/400 ₽.
- RSVP and selected/planned game slots are planning facts only. They may expose an estimate, but must not persist planned CASUAL debt into `amount_due`.
- CASUAL `default_price` / per-slot estimate is **100 ₽**; a regular-evening API or UI must never newly create or display a legacy fixed **600 ₽** cost.
- The canonical CASUAL amount is durably reconciled from completed protocols after game save/correction and again before closeout. Reconciliation is idempotent and must not duplicate ledger effects.
- Historical CASUAL 600 ₽ rows are repaired by an application-level, idempotent migration/reconciliation; production data must not be manually edited, reset or replaced for this correction.
- Recorded money remains factual even if later protocol correction lowers the amount due; reconciliation must not silently erase a payment or synthesize a refund.
- NOVICE, TOURNAMENT and other non-CASUAL formats retain independent pricing policy.
- A historical game-evening debt exists only for a completed/settled evening that the player factually attended, is not waived and still has `amount_due > amount_paid`. An old RSVP alone must never create debt after settlement; planned payment for an active/upcoming evening is displayed separately from historical debt.
- External online acquiring/SBP is **intentionally paused/disabled** in the current implementation.
- `online_payment_available: false` is a product state, not automatically a bug.
- Do not fabricate or enable a payment provider without an explicit provider/setup decision.

## Organizer flow and payment targets (user-approved 2026-09-24)

Target design; `docs/PROJECT_STATE.md` tracks what is built.

- **Evening route.** An evening is run as one ordered route instead of unrelated tabs:
  - preparation;
  - gathering answers;
  - the day of the evening;
  - the evening in progress;
  - closeout;
  - after.

  Each stage lists its steps, shows what is done, and offers one main action. Organizer to-dos such as photos and announcements live inside their stage.
- **«Сегодня играем» post (owner, 2026-10-02).** On the evening day a bright invitation goes to the evening's Telegram group and to VK: «Всем привет! Сегодня играем», the time of the game everyone is expected at, the venue, the roster (late arrivals and players who start from a later game are marked), the fill of each game and a call to join with the bot link. At 17:00 Moscow time it goes out by itself when the evening is gathered (at least 4 games with a full table). If fewer games are full, nothing is posted: the organizer gets a Telegram message and a highlighted task «Играем сегодня?» and decides — publish (the text can be edited and the game chosen) or «Не публикуем». The organizer may also publish it earlier by hand.
- **Tournament announcement (owner, 2026-10-02).** 36 hours before a tournament starts the bot posts one picture with a caption to the rating Telegram group (the tournament has no separate group): the title, date, start time and venue, the chief judge, the confirmed participants with their photos, and the live broadcast on the club's Twitch channel (twitch.tv/chagintv; `TWITCH_CHANNEL_URL` overrides it) from the start of the games. It is posted once; with no confirmed participants nothing is posted yet. The secret OBS link is never shown.
- **Tournament game result and seat messages (owner, 2026-10-03).** When the judge completes a tournament game, its blank (the same picture as a club game: seats, roles, winner, fouls, first killed, best move, the game's points from the tournament table) goes once to the rating Telegram group. Once the result was posted (or could not be posted, or five minutes passed), every player of the next game gets a personal Telegram/VK message «следующая игра №N из M — ты сидишь на месте №S». The first game's messages go out 30 minutes before the nominal start (and, if the seating is regenerated or a player replaced later, the people whose seat changed get a new message while the start is within three hours). These messages exist for tournament games only (club and novice evenings are unchanged), go through the personal-notification router (one linked channel per player, players who switched personal messages off get none), and are sent once per game and player. Before the first game the common seating still goes to the group chat by the organizer's seating export.
- **Cancelling an evening (owner, 2026-10-02).** The organizer can cancel any evening that has not started from «Сбор» («Отменить вечер»), for example a novice evening that did not gather while the club one did. Cancelling touches only that evening: everyone who was coming or deciding gets a personal message, and a **new** short post about the cancellation goes to that evening's own Telegram group (novice / club / rating, in the same topic as the announcements) and to VK. The earlier announcement posts stay exactly as they were (they are not edited into «отменено»). The text is shown first and can be edited. The automatic cancellation for a shortfall one hour before the start posts the same message. At 17:00 on the evening day: with 4 full games the «Сегодня играем» post goes out by itself; with no full game at all and fewer players than the minimum the evening is cancelled by itself (with the post); anything in between (for example 3 of 4 games) is borderline and goes to the organizer, who publishes the post, skips it, or cancels. Once the organizer has decided to play (the post went out or «Не публикуем»), the «Сбор» steps turn green.
- **Cancelling a tournament (owner, 2026-10-05).** The same rule as for an evening: the earlier announcement post stays exactly as it was (it is not edited into «отменён» and no new announcement is made), and one **new** short «Турнир отменён» message goes to the group where it was announced. Everyone registered (main list and reserve) gets a personal message. The cancellation and its personal messages are saved together, so a failed cancellation can be pressed again.
- **«Мы собрались» post (owner, 2026-10-12: moved from before the first game to the running evening).** Once the evening runs, the organizer takes a photo in the app and the post with the photo is published automatically to Telegram and VK. **The games do not wait for it any more**: it is a step of the evening route, shown as information before the first game («лучше перед 2–3-й игрой») and as a task that is due once the first game is created. «Пропустить» is still possible; a skipped post stays as a reminder in «Порядок в клубе».
- **«Порядок в клубе».** The home screen shows an automatic list of things that need the organizer's action. Each item has one button that opens the place where it is fixed, and the item disappears once it is fixed. It covers:
  - evenings and gathering;
  - player statuses and novices;
  - profiles;
  - games and money.

  The home counter is the number of these items.
- **Organizer and judge on everything (user-approved 2026-09-24):**
  - An evening cannot start (via «Начать вечер» or by creating its first game) without an assigned organizer with the «Организатор» club role. A signed-in organizer whose CRM login is linked to such a profile is assigned automatically.
  - **A mistaken «Начать вечер» can be taken back (owner, 2026-10-22).** While an «Идёт» evening has no game (archived ones do not count), the route step «Вечер начат» offers «Вернуть запись», which puts it back to «Запись открыта» (`PATCH` status `published`). With a game on the evening the server refuses (409 `evening_has_games`).
  - **«Начать вечер» asks first (owner, 2026-10-22).** A confirmation window appears before the status changes (route step and the overview button); in the route it repeats the shortfall («Недобор: набрано X из Y игр») and, more than 3 hours before the start, how long is left.
  - **«Подарить вечер» on a novice evening too (owner, 2026-10-22).** An experienced player or a guest at a novice evening can be gifted the evening in «Оплата вечера» (explicit waiver, zero due, can be taken back); the novice-charge recount leaves a waived participant alone.
  - Every game needs a judge: a club player, or a named guest explicitly marked as a guest. Guest judging counts for nobody.
  - The judge gets 200 tokens per completed game (2 × the 100-token player participation reward) for games from 2026-09-24; older games keep the former 100.
  - The evening's organizer gets 1000 tokens once per closed evening, for evenings from 2026-09-24.
- **Tokens for coming to an evening (user-approved 2026-09-26).** A registered player gets 500 tokens for arriving at the start after signing up («Иду» or «Приду позже»), and 400 for arriving late or without signing up. The reward follows the organizer's attendance mark: marking pays, unmarking takes it back, switching between «вовремя» and «опоздал» settles the difference, and closing the evening re-checks everyone. Guests without a profile get nothing. Evenings before 2026-09-26 are not paid. The old bot's «+500 вовремя, +400 позже» text was never credited.
  - Organizer achievements count closed evenings run as the assigned organizer: 1, 5, 10, 25 and 50 evenings.
  - Money payouts (salary) to organizers and judges belong to the planned club finance module.
  - On profiles, «Отсудил игр» is shown openly but only for players who judged at least one game. «Провёл вечеров» is shown only on profiles of players with the «Организатор» club role. Both are split by kind: club, novice, rating and tournament.
- **Club bookkeeping is internal (user-approved 2026-09-24).** Only the club owner and people with organizer rights see:
  - money payouts to organizers and judges (including the judge's share of a rating evening);
  - club expenses;
  - the club-needs fund set aside from evenings.

  The season prize fund (and prizes) may be shown to players.
- **«Мы собрались» publication rules.** The post does not gate any game (2026-10-12). A channel that failed can be retried with the stored photo; a channel that already has the photo is never posted to again.
- **One person — one profile.** Sign-in goes through the linked Telegram or VK account, so a person should never have two profiles. There is no profile-merge tool (user decision 2026-09-24); «Порядок в клубе» only flags namesakes so the organizer can check them.
- **Novices stay novices** until the organizer decides to transfer them. The app never suggests a transfer based on a number of visits. A novice rating or tournament may later become a path into the club.
- **Payment by evening type (target):**
  - **Prepayment at the table (NOVICE and RATING, user-approved 2026-09-24).** A game cannot start while a player seated at its table owes a prepayment for the evening. The organizer sees who owes right at the table and marks the payment with one tap. Players who owe nothing (paid, exempt or free) never block the game.
  - **NOVICE:** prepayment before the player's first game for players who owe. Free participation requires an explicit organizer gift (Domain model decisions 6).
  - **CASUAL:** postpayment by played games (current rule above).
  - **RATING:** a 500 ₽ entry fee before the games. The collected money is split (user-approved 2026-09-24):
    - 50 % to the evening's winner;
    - 40 % to the judge for the work;
    - 10 % to the season prize fund.

    A rating game always has a full table of 10 players, so the evening collects 5000 ₽: 2500 ₽ to the winner, 2000 ₽ to the judge and 500 ₽ to the fund.
  - **TOURNAMENT:** prepayment of a flexible entry fee (typically 1500–3000 ₽) set per tournament. Registration works as below.
- **Tournament registration (user-approved 2026-09-24).** There is no separate reserve queue. Each player answers the tournament like an evening:

  | Answer | Meaning | Payment |
  |---|---|---|
  | «Играю» | wants to play and claims a place | pays the entry fee |
  | «Готов подменить» | not keen, but will play if needed | pays only after being called in |
  | «Пока думаю» | undecided | nothing yet |
  | «Не смогу» | will not come | nothing |

  «Пока думаю» gets the «Что решил?» follow-up, as on evenings.

  How the table of 10 is filled:
  1. Places go to «Играю» answers in the order they were given. The 11th and later «Играю» wait for a place first, and they do not pay until they get one.
  2. Every «Играю» holding a place must pay by **3 days before** the tournament. They get a reminder at 4 days.
  3. At the 3-day deadline, an unpaid player loses the place and their answer becomes «Готов подменить». Each free place goes first to waiting «Играю», then to «Готов подменить», in answer order. The called player gets a message: «место ваше, оплатите до …».
  4. A player called in must pay by **24 hours before** the tournament, otherwise the place goes to the next one.
  5. A player called in after that pays on site before the first game (prepayment at the table).

  The organizer can always mark a payment or move a player by hand.
- **Does the evening's organizer pay? (user-approved 2026-09-24)** On novice evenings the organizer never pays. On club (CASUAL) evenings the club owner and the organizer assigned to that evening are free (owner decision 2026-10-12; the 2026-10-06 rule «only the club owner» is withdrawn), the judge pays for the games he plays. On rating evenings and tournaments the entry fee is paid only by those who sit at a table as players: an organizer or judge who plays pays like everyone else (so the prize and fund shares stay whole), while organizing or judging alone is never charged.
- **Table size (user-approved 2026-09-24).** An evening and each game take place only with 10 players and a judge (11 people). Exception: novice evenings and games may run from 8 players and a judge.

  Roles by table size:

  | Players | Roles |
  |---|---|
  | 10 | Дон, 2 мафии, Шериф, 6 мирных (classic) |
  | 9 | Дон, 2 мафии, Шериф, 5 мирных |
  | 8 | Дон, 1 мафия, Шериф, 5 мирных |

  Tables of 8 and 9 are for novice evenings only.
- **Shortfall (user-approved 2026-09-24).**
  - **3 hours before:** if the evening is short of players, the app itself posts a call to come in the group of the main announcement. The call goes out once; if it fails, the organizer is told to call by hand instead of the app repeating it.
  - **1 hour before:** if fewer than 10 players (novice: 8) have confirmed, the published evening is cancelled automatically, provided no game was started and the recorded attendance does not already meet the minimum. Registered players are notified. If automatic cancellation is blocked by actual games or attendance, the organizer reviews the evening.
  - A past evening with no games and fewer than the minimum recorded attendees can be marked «Отменить из-за недобора» from closeout instead of being closed as played.
  - After the start, the app cancels automatically for low actual attendance only once every expected player has an attendance mark; unknown attendance does not count as absence.
- **Online checkout** is planned once the organizer is registered as self-employed; until then payments stay manual.
- CRM wording should use plain club words, not technical terms (user-approved 2026-09-24).
  - On screens the organizer area is «кабинет организатора», never «CRM» or «Organizer CRM».
  - An unfinished game protocol is «Не завершена», and reopening one is «Открыть для правки». A tournament or an evening that is not yet published stays «Черновик».
  - Mafia and broadcast terms (Elo, ПУ, ЛХ, Ci, ППК, OBS) stay as they are and get explanations in the glossary.

## Game formats and ratings (user-approved 2026-09-23)

The club runs four evening formats, and each has its own competition:

- **NOVICE** — school of mafia. No Elo. A novice leaderboard, when used, is an organizer-created `NOVICE` rating period (to promote the best novices to casual play).
- **CASUAL** — play for fun, no extra points. Counts toward Elo.
- **RATING** — season play with extra points. Counts toward Elo and toward organizer-created `RATING` periods (the rating season).
- **TOURNAMENT** — a fixed distance of games (for example 10) with extra points and its own standings. Counts toward Elo.

Elo is one shared player-strength measure across CASUAL, RATING and TOURNAMENT games; seasons and tournaments keep their own points separately.

Registration eligibility (user-approved 2026-09-23):

- Only players with `game_level=tournament` («Турнирный игрок») may register for **RATING** games.
- Tournament places go to «Играю» answers in answer order; see «Tournament registration».

The Player Cabinet «Рейтинг» tab therefore has exactly three views: «Elo» (the club table; the personal Elo dynamics are the «Elo» tab of the profile), «Сезон» (rating/novice periods) and «Турниры» (published tournament standings). The club statistics alongside the selected «Рейтинг → Сезон» and the «Текущий сезон» card in the career profile use the organizer's RATING periods as seasons (user-approved 2026-10-04; `clubSeasonService.ts`); they count wins in the period's date range and are club statistics, not a rating. Calendar quarters are only a fallback while no RATING period exists.

Community structure (owner approval, 2026-10-28): Players holds the directory, player metrics and Form; Rating holds the three competitions; Connections holds teammates/opponents/table encounters; History holds shared evening/game results and the single all-time Hall of Fame; Mini-games remains separate. Sporting standings and club win statistics share a selected RATING period ID but retain their own game eligibility/distance. NOVICE never displays another RATING period’s statistics. Existing calendar statistics/archives remain available when no sporting period is opened. Personal profile history is labelled as the player’s own story.

Community content (owner approves complete CN01–CN08 plan, 2026-10-28): player metrics share one category table and comparison of two arbitrary visible players. Existing calculations/eligibility stay; missing observations remain absent, sample denominators and external federation scope remain explicit. Percent differences use percentage points. Minimum-games filtering is optional, default off; it never implies a minimum number of actions. No combined skill score/winner is inferred.

New connection stories: shared winning streaks count only a pair’s common games for the same colour; an eligible common loss resets the current series, other games are neutral. Current/best series are over the selected scope. New pairings are the first recorded common game for a colour across the full available history, displayed only if that first game belongs to the selected scope. Frequent rivals and table pairs require at least two relevant games; existing story thresholds are unchanged. All wins are whole-team results. Pair history, role combinations and canonical protocol links use the same selected scope; privacy is applied before aggregation/ranking.

Form points are retained (owner: «просто нужно пояснить понятно как оно считается и что значит»). They describe weighted recent team outcomes plus the existing winning-series bonus; they do not change Elo, sporting points or awards. The single formula is `src/shared/playerForm.ts`; the player UI explains its weights, series, rounding and absence of calendar decay. Existing minimum samples and all other rating rules remain unchanged.

## Elo / rating principles

### Approved corrections — owner, 2026-10-26 (supersedes earlier overlapping prices and caps)

- One red player earns at most8 base Elo per black across eligible votes, checks, LH and wills. A half-find4 can be topped up by4; a full find8 cannot be paid again by a later check. LH keeps4/12/24; its credits per correctly named black are4/6/8, so the same1/2/3 targets in LH and will total8/16/24. Existing source eligibility stays: the sheriff's own later vote/will for a checked black remains neutral. An ordinary will with any wrong colour earns no positive top-ups; PU keeps the colour exception.
- Positive streaks count new independent finds. Repeating or topping up the same found target supplies no further positive streak step or repeat-find multiplier. One will remains one decision; PU has no series.
- A correct red will colour costs0.05 point (+2 Elo), a wrong colour−0.1 (−4), a correctly named black0.2 (+8, subject to remaining target credit). Thus a red PU calling all other nine players red earns6×2−3×4=0.
- Separate gross positive and negative personal points. Apply the automatic base-positive pool24 (series outside it; LH separate), cap all positive personal rewards at35, then deduct game errors, with a final personal floor−35. Do not clip the net automatic component before this calculation. An explicitly attributed miss costs6 Elo per night after all personal limits; therefore personal−35 plus a miss can be−41. This is a game-responsibility penalty, not discipline; the black-loss gate, judge attribution and tactical/legacy neutrality stay. Discipline keeps its own deductions outside these limits.
- Owner rejects the proposed restriction on manual judge bonuses. Keep their existing influence and do not add a new reason requirement or forbid awarding already recognised play. Manual judge points still convert at40. Protocol sporting bonuses (`protocol_bonus`) never supply an additional Elo term, positive or negative; they stay in sporting/tournament totals and nominations. The same exclusion applies to the club counterpart of that field.
- Owner additionally confirms automatic will-colour Elo in tournaments. Use recorded player colours, explicit PU, LH and exit chronology once; do not guess missing colours from the old sporting bonus. This adds will scoring only: tournament votes/checks/zero breaks are not newly converted to club automatic action points. Both Elo rebuild and history use the same loader and personal calculation. Tournament sporting scoring is unchanged.
- Baseline30/70, bounded team expectation, approved strong-player protection/positive carry drift, manual judge weight and the absence of a lifetime ceiling stay. Rebuild policy key is `2026-10-elo-find-credit-v4`.


The rating model is intended to account for table/team strength rather than act as a naive win/loss counter.

Approved behaviour (confirmed by the owner 2026-10-01 against the current formula, which already does this):

- the team result is weighed by the expected win chance from the team averages; red and black are asymmetric (the prior is red 30% / black 70% at an equal table), so at an equal table a red win gives +35 / a red loss −15 and a black win +15 / a black loss −35;
- **a weak player carried by a strong team gains little**: a weak mafia with two strong mafias against weak citizens gets a small win;
- **a weak player in an average or weak team against a strong table gains a lot**: a weak black with average blacks against strong citizens gets much more than at an equal table;
- **a strong player is protected in a weak team**: a stronger player loses less on a loss and gains a little more on a win than the weaker teammates; the protection depends on the gap between the player and the teammates, so the closer the table's levels are, the smaller the protection (none at an equal table);
- **Owner corrections 2026-10-26:** in club Elo a removal costs −30 (0.75 × 40), PPK −40 (not stacked with its removal), technical −12, gross technical −24; the sporting points keep their own scale and tournament Elo keeps removal −40 until the tournament results carry the breakdown. The don who finds the sheriff with his first-night check earns +0.2; later don checks stay neutral.
- **A vote for oneself, owner 2026-10-26:** never punished, except when that very vote decided it against a black: the player left with exactly one vote more than a black candidate, and that one vote was his own (at nine: four for him, four for a black, his fifth for himself — «либо своей рукой выводишь мафию, либо себя»). Then it costs like voting out a red: −8 Elo, ×2 on the critical circle (−16).
- **«Без оценок» and double pay, owner 2026-10-26:** the judge may tag a voting «без оценок» in the protocol (a split, «попил», usually a broken one: players voted where they were told). In such a voting individual votes earn and cost nothing; only the colour of whoever left counts (one player or several «с подъёмом»), the same for every red who voted: a black left +4 Elo, a red left −2 Elo. Balance: half of a found black (+8), because the result is shared and agreed; the red side makes a split that hits a random candidate worth about zero at a восьмёрка or шестёрка after a miss, where about one player in three is black (owner asked to balance the first +2 / −1, 2026-10-26). Automatically (owner, 2026-10-26): at a восьмёрка or шестёрка, a voting that ends in a revote is a split, and so is the rest of that day (the revote and the table decision). Other splits, e.g. a broken one with one player leaving at once, need the judge's tag. When a revote is recorded by its totals only, the split result goes to the day's known voters. A previously found black can only earn the remaining base credit up to8 when later named in the will; a fully paid find earns nothing again.
- **Real finds, owner 2026-10-26:** («первая мысль» ±0.2 was replaced the same day by the pool and the ×2 will error below). A red's vote for a black the table never voted out earns half (+0.1), because it may be random; voting for a black who was voted out earns in full whoever was voted out first. A vote for a red who left in that very voting costs twice (−0.2, −0.4 on the critical circle).
- **Sheriff's checked black, owner 2026-10-26:** +4 for the black check and +4 more when the table votes that black out (+8 in all, the price of one found black); from the next day the sheriff's own vote for him and naming him in the will earn nothing more (shown as «Голосовал в уже известных чёрных №… — без баллов» / «уже засчитан»).
- **A black's minuses, owner 2026-10-26:** named black in a will −4 (was −8); a black voted out at the девятка (a voting with nine players at the table, after the zero circle) −8. The worst a black loses to good red play is about −24 (four wills and the early exit), the mirror of the red pool.
- **A broken zero-round split, owner 2026-10-26** — only under the tournament setting (tournament and rating games), where the player really leaves; under the club setting he stays at the table, so the break gives and takes nothing. Needs the judge's mark «Кто сломал попил?» (never guessed from the votes); «the one it was broken into» is the player voted in the zero round. Breaker / the one broken into: black → red 0 / 0; black → black −24 / +8; red → red −24 / +8; red → black +8 / −16; black → sheriff +16 / 0; red → sheriff −24 / +8 (the sheriff's +8 confirmed by the owner 2026-10-26).
- **Pool of +24, owner 2026-10-26:** there are three blacks, +8 each, so all the pluses of one game together (votes, will, checks, splits) are worth at most +24 Elo; the series may go over it («в этом его смысл», owner 2026-10-26); minuses count in full; the ЛХ of the first killed is separate. A black in the will is paid in full unless the red already found him by a vote; a red named black in a will whom the table then voted out costs ×2 (−8) — «стол сыграл по завещанию». The blank shows «Больше +24 за игру не набрать: −N».
- **Will colours equal to votes, owner 2026-10-26:** wills at +12 per right black made one will outweigh a whole game of voting. Now a black named right in a will = a found black (+8 Elo), any wrong colour (black called red, red called black, a black called sheriff) = a vote for a red (−4), a right red +2 (owner's choice; farming is stopped by the +24 pool and by an error taking away all pluses of the will). For a black: named red +8, named black −4, not named +4.
- **First killed (ПУ), owner 2026-10-26:** rated by his best move (ЛХ, +4 / +12 / +24 Elo for 1 / 2 / 3 blacks) and by his will colours like any red (an error does not cancel his right colours), **without** the series bonus.
- **Personal balance, owner2026-10-26, current correction:** manual judge/LH/Ci and eligible automatic action points convert at40. Protocol sporting bonuses are excluded from Elo. Positive personal rewards are capped at35 before game errors; the personal floor is−35, with fixed misses and discipline deducted afterwards. This supersedes earlier net automatic±35/net personal±35 ordering. Manual judging retains its existing influence as explicitly requested. Sporting points stay unchanged; positive drift/no lifetime ceiling remain accepted.
- **the ×5 scale (owner, 2026-10-01), table level corrected 2026-10-24:** the game weight stays 50 and manual start Elo was stretched once on the switch. Personal and manual judge weights are40; protocol sporting bonuses are excluded from Elo; discipline stays40 (`src/shared/eloWeights.ts`). The table level is **not** stretched and works in three steps (owner: «в пределах 150 уровень одинаковый, 150–250 сильно различается, от 250 огромная разница»; `levelGap`): a gap between the team averages (and between a player and his allies, for the protection) up to 150 Elo counts as zero; from 150 to 250 it counts one-for-one (0…100); above 250 it counts twice (up to 300), then expectedRedTeamResult converts it to a win expectation independently of the protection. Owner correction 2026-10-25: the red expectation for stronger reds is 0.30 + 0.30 × tanh(effective gap / 200), with a 60% upper bound. It is 0.30 at ≤150, 0.373 at 200, 0.439 at 250, 0.528 at 300 and 0.572 at 350+. These intermediate values are an implementation curve, not measured club win rates. For stronger blacks, red expectation is 0.30 − (0.30 − 0.10) × tanh(abs(effective gap) / 200) / tanh(300 / 200), reaching 0.10 at a gap of −350 and beyond: black expectation is capped at 90% (owner answer, 2026-10-25). The prior red 30 % / black 70 % stays;
- no calibration multiplier for new players (owner decision 2026-10-01).
- **Owner clarification and implementation approval, 2026-10-25:** no separate absolute strong-table bonus. The goal is to make weaker lineups acceptable to stronger players; preserve the protection against weaker teammates. A player weaker than teammates retains a reduced win reward (down to ×0.8) but gets no extra loss multiplier: loss modifier is 1. A stronger player retains up to ×1.3 on a win and ×0.6 on a loss. Zero discipline applies only to the illustrative scenario tables; actual Elo keeps every disciplinary deduction.
- **Owner answers after the independent audit (2026-10-25):** keep the small bonus when a dead red did not name a still-living black (+0.1 point / +1 Elo, versus +0.2 / +2 for explicitly calling him red). Keep the strong-player carry modifiers and their positive expected drift as an intentional reward for playing with weaker teammates; do not neutralize this drift or subtract a role mean. These are accepted model policies, not unresolved bugs.
- **Expected probability range (owner clarification, 2026-10-25):** normal club balance is described by the owner as black 60–70% / red 30–40%; even the extreme strongest-red/weakest-black lineup should give reds only about 55–60%, intended upper limit 60%. This is a model constraint, not a universal measured win-rate bound. Preserve the equal prior 30/70. The owner also approved about 90% as the maximum black expectation for the opposite extreme; red expectation is therefore at least 10%, and the two expectations always sum to one.
- **individual contribution (owner, 2026-10-25), club games only:** an addition to the result, never a replacement (result, the 30/70 prior, table level and team strength all stay). Points per game (`src/lib/playerContribution.ts`): a red gets **+0.2 once for each different black he voted for** («нашёл чёрного», Polemica-style: finding the three blacks is the job, voting again for the same black adds nothing; the same +0.2 on the critical circle, owner 2026-10-25) and −0.1 for every vote for a red (×2 on the critical circle); the zero circle and days when two or more players left at once are not counted, and only a voting after which exactly one player left the table counts — a voting that ends in a revote, with nobody leaving or with several leaving may be an agreed split, so a vote there is not the voter's own read (owner, 2026-10-25); the red's own will (colour protocol): right black +0.2 (= a found black), any wrong colour −0.1 (= a vote for a red), right red +0.05 (+2 Elo) (owner, 2026-10-26: «приравнять к обычным значениям нахождения/голосования»); an error still takes away every plus of that will; a red named black whom the table then voted out costs twice (−8); the sheriff +0.1 per check that found a black. **A black the voter did not find himself (owner, 2026-10-25):** if a red voted for a red in the voting at nine players and later (that night or after) a false sheriff — a black who claimed sheriff — gave him a black check, then from the next day the false sheriff and every black the real sheriff had already checked are obvious to him: a vote for them earns nothing (shown as «Голосовал в уже известных чёрных №… — без баллов»), only blacks nobody has checked still earn. A false black check before the circle at nine changes nothing. It needs the judge to record the announced checks in the protocol (no production game has them yet). A black is judged **only by the wills of the dead reds while that black was still in play** (votes against him change nothing). Use actual exit chronology, or recorded exit order for old games; an alive-at-finish black was in play, while an unknown exit chronology supplies no points. A later will cannot earn or cost him points. Own-seat marks and opposite colours for one seat are invalid; historical invalid marks are excluded from contribution rather than rewarded. The remaining will weights stay: named black −0.2, named red +0.2, not named +0.1 per will. **No role adjustment** (owner: every found black is praised — «это и нужно хвалить»); the Elo price is ×40 per point, positive personal rewards capped at35 before errors, with personal floor−35 and fixed misses outside those limits (owner, 2026-10-26; see «Personal balance»); the pluses of a game except the series are limited by the +24 pool. **no ceiling over time** (owner: «Эло отражает уровень игры на дистанции»). The game blank also shows the team strength under the title: «Красные 1051 · Чёрные 1136 · команды одного уровня · шанс красных 30%» (same three steps as the table level). It shows «За действия в игре: +6 Эло» and one short line per kind, in Elo («Голосовал в чёрных №10, №1: +16», «Голосовал в красных №2: −4», «В завещании угадал №1, №4: +16», «В завещании ошибся в №5: −4», «Проверкой нашёл чёрного №10: +4»; for a black «Записан красным у №5: +8», «Записан чёрным у №7: −4», «Не записан у №3: +4», «Ушёл на девятке: −8»), not only the sum.

### Missed shots, decision streaks and mistaken wills — owner clarification, 2026-10-26

- A missed-shot personal penalty applies only when blacks lose. The judge records `miss_reason: error` and explicitly selects the responsible black seat(s), including the whole black team if chosen; reviewed implementation price is −6 Elo for each responsible player per marked night. An intentional tactical no-shot is marked `intentional` and is never penalized. Historical unclassified misses never establish guilt. Selection, reason and round are saved in the canonical shot, validated on both club and tournament routes and replayed by both Elo/history loaders. This is a separate fixed game-responsibility deduction after personal limits, not a disciplinary deduction.
- Streaks reset for each game. The existing automatic club contribution uses confirmed own red decisions: eligible votes, black sheriff checks and wills; a red sheriff check is neutral and neither extends nor resets a streak. Same-sign decision multipliers are 1 / 1.25 / 1.5, capped thereafter. Opposite decisions start a new series at 1. Already rewarded repeat black votes, repeat checks, technical/excluded phases and self-votes do not extend the series; the existing base self-vote rule is unchanged. Black testimony awards are evidence from opponents, not the black player's own decision streak. Do not invent cross-action streaks where full chronology is missing.
- **Owner: «Любая ошибка в завещаниях (кроме ПУ) даёт только минусы».** If an ordinary will has at least one wrong colour, all correct-colour bonuses from that will are suppressed; every wrong colour still costs, with a negative-series adjustment. Other actions and the team result are unaffected. PU means the explicitly marked first player killed: its will retains both correct and wrong base marks. An unknown PU is not guessed. A sheriff label on a black is a wrong red colour; compatible red+sheriff marks are not duplicated.
- **A series is right decisions at different moments of the game (owner, 2026-10-26):** a vote, a sheriff check and a will are each one decision; all colours of one will are a single decision with one factor (×1 for the first step, ×1.25 for the second, ×1.5 from the third), so a will alone never builds a series. The first killed has no series.
- Current action prices follow the approved corrections above; series and errors retain separate explanation lines. Positive personal awards are capped at35 before errors, the personal floor is−35, and fixed misses are deducted afterwards. The game blank shows every source in whole Elo: «Лучший ход», «Бонус судьи», «Компенсация первому убитому», the actions, «Серия верных решений подряд», and what the caps cut off. Discipline remains ×40 outside these caps. Tournament sporting points remain unchanged; tournament Elo evaluates recorded will colours once and retains the explicit miss penalty; it does not gain the club vote/check scoring.


Do not replace the current Elo implementation with a standard off-the-shelf formula merely because it is simpler. Any formula change needs explicit product review and comparison against known tournament/player outcomes.

## Data preservation is a business rule

Past accidental data reversions are treated as a product-critical failure mode.

Therefore:

- player/tournament/runtime data must not be reset as a side effect of code work;
- a non-empty runtime DB wins over repository bootstrap data;
- old backup snapshots must not overwrite newer verified state;
- avatar/tournament/result corrections must not be lost through imports or deploys;
- destructive migration/restore operations require explicit, verified intent.

See `AGENTS.md` and `docs/RUNBOOK.md` for the operational safeguards.

## Completed-game lineup corrections

- Only an organizer may replace the identity attached to a seat in a completed, non-archived club game.
- The correction moves identity references; role, fouls, voting, exit and other gameplay facts remain attached to the seat.
- Payments, token settlement, rating and achievements must be reconciled for both the previous and replacement player.
- A seat may be handed either to another registered player of the evening or (owner, 2026-10-03) to a new guest without a profile: a guest placeholder of the same evening is created and marked as attended; it gets no profile, Elo, tokens or contacts, and the previous player's statistics are recounted. A game with a guest seat still counts for Elo (owner, 2026-10-05): it is rated from the remaining registered players (9 of 10 with one guest); the guest's seat is simply left out, the team averages use the players who are there (`eloRatingService.ts`, `playerEloHistoryService.ts`).
- Historical games must never be rewritten automatically from a date or nickname guess. Every correction is an explicit, confirmed action.

## Organizer player profile roles and CRM entitlement

- **«MVP вечера» is not hidden (owner, 2026-10-13).** While voting is open (3 days after the evening is closed) the player's home page shows the card «MVP вечера» first, with the deadline, how many attendees have voted and, once voted, who the vote was for; the vote opens in place. When the results are out, a post of its own goes once to the evening's Telegram group and the VK wall (the deadline and where to vote), and a day after the closing every attendee who has not voted gets one reminder (buttons in Telegram, a message with the app link in VK). Nobody who voted is reminded.
- **«MVP вечера» has exactly one winner and an announced result (owner, 2026-10-14).** When the 3 days of voting are over the winner is: the player with the most votes; on a tie the one with more game wins of that evening; then more wins as Дон/Шериф; if it is still equal the bot asks the **club owner** (a button per tied player) and the owner's pick is final. A tie that nothing has resolved yet has no title (no trophy, no «MVP года» count) until the owner answers. The result goes once to the evening's Telegram group, the VK wall and personally to everyone who attended the evening (Telegram first, VK as fallback). The group and VK posts of the vote («голосуем!») and of the result carry a picture in the club's noir style (owner, 2026-10-14: «только текст» was poor): the vote card shows the photo of every candidate, the result card the winner's photo in a gold ring, the votes and the others who got votes; the personal Telegram messages (the vote buttons, the reminder and the result) carry the same cards as the photo with the text as its caption (the VK fallback stays text); if a picture cannot be made or sent the text goes out. It is not posted if nobody voted. `eveningMvpService.ts`, `postMvpResult` in `clubResultPostService.ts`.
- **VK post text and photo (owner, 2026-10-13).** The text of the club-evening VK post is the owner's own: «Ещё → Публикации и каналы → Текст постов» (placeholders {когда} {время} {место} {где_и_когда} {цена} {ссылка} {название}; the sign-up {ссылка} is required). Until he saves a text, the default is his words of 2026-09-29. The evening's VK card shows the photo that goes with the post (taken from «Фото для анонсов», any photo if none fits the format) with a download button, because the VK channel is posted by hand; when the community post goes out without a photo the card says why (no photo in the pool, no personal VK key on the server, or VK refused the upload).
- **«Иду» selects every game (owner, 2026-10-13).** Whoever sets «Иду» — the player or the organizer for them — is registered in all open games of the evening at once, so there is no separate state «идёт на весь вечер, игры не выбраны» in the CRM, the app or the Telegram lineup. Exact games the player picked are never overwritten; «Приду позже» stays an intent without games until a starting game is chosen. Old «Иду» answers without games are brought in line by the automatic sweep. A game added later is not added to players already registered (they can add it themselves).
- **Who is a novice (owner, 2026-10-13).** One rule everywhere: a player is a novice while the organizer's level is «Новичок» (new players start there). Once the organizer sets «Клубный» or «Турнирный» in «Уровни и роли», no novice task («Определить игровой уровень», «Спросить впечатления после первой игры»), queue («Новые игроки ждут решения»), filter («Игроки → Новички») or reminder may pick the player up, however few visits they have in the app; the relationship stage becomes «club player». The «Вовлечённость» stages (first visit, returning, regular, inactive) only describe visit counts and never decide who is a novice.
- **Invitation settings of a player (owner-approved 2026-10-13).** In «Настройки → Приглашения» a player switches off the kinds of invitations they do not want: novice evenings, club evenings, rating evenings, tournaments, poker at the table (all on by default). A switched-off kind means: no announcement/reminder/RSVP-nudge messages about evenings of that format, no friend invitation to such an evening (`unavailable_format`), and no poker invitations — the player is not even listed in «Кого позвать». A second switch, «Друзья могут написать мне лично» (off by default), lets other players see a link to the person's VK / Telegram next to «Позвать»; the button copies the invitation text and opens the dialog in the sender's own account. Without that switch no contact link is ever shown to other players. The organizer sees contacts regardless (CRM).
- **Guest as a lead (owner, 2026-10-13).** The organizer can sign a guest up in advance (CRM → evening → «Участники» → «+» → «Гость»): a name, how to reach them (ВКонтакте, Telegram or phone) and «+N» — people the guest brings («Добрый день, запишите меня +1»). The default answer is «Иду». The guest has no club profile; the roster marks them «Гость-лид». Every «+1» is a roster row of its own (owner, 2026-10-13: «+1 создаётся как строка участника вечера, с привязкой к тому, с кем он идёт»): «Иван +1», marked «Идёт с гостем: Иван», with the guest's answer, table and price; the organizer can rename it when the name is known and mark its arrival separately. Changing «+N» on the guest adds or removes these rows (a person who already arrived or plays is not removed). All counts (registered, shortfall, Telegram lineup, «сегодня играем») simply count rows. A guest and their «+N» are also **sign-ups** (owner, 2026-10-14: «записи», not only the roster): while the answer is «Иду» or «Приду позже» they count in every game of the evening, appear by name in the games' lists, in the «Ответы» tab and in the announcement / VK posts (changing a guest refreshes the published announcement); they have no personal games choice. The guest's contact is for the organizer only (a tap opens the chat) and is never shown to players.
- **Evening colours (owner, 2026-10-13).** Evenings are coloured by format everywhere in the organizer app: novice — blue, club — green, rating — amber, tournament — violet (`src/lib/eventKind.ts`); the «На этой неделе» list on «Сегодня» uses the same colours as the calendar.
Visit counts (user-approved 2026-09-23): a visit counts as soon as the organizer marks the player as attended, including on the evening that is still running; no-shows count only once the evening is completed. The CRM shows the player's four statuses as plain blocks — «Игра» (`game_level`), «В клубе» (membership from `club_role` guest/member plus the automatic visit count and novice-path stage), «Организация» (`club_role` team/organizer plus `judge_level`) and «Доступы» (`organizer_player_access`) — without changing the stored fields.

Organizer CRM player profiles keep four independent concepts separate:

- `game_level` = the player's playing skill/access level;
- `club_role` = the player's relationship/status inside the club;
- «Может вести» (`host_formats`, owner decision 2026-09-28) = which evenings the player may host, as independent marks: «Вечера для новичков», «Клубные вечера», «Рейтинг и турниры». Hosting novices is not easier than club games, so there is no ladder. When no marks are stored they come from the old `judge_level` (trainee → novices; host → novices + club; judge → all), so nothing changes for existing players. Saving marks also writes `judge_level` as a summary (rating → judge, club → host, novices only → trainee): the tournament chief judge still needs the «Рейтинг и турниры» mark, and the closed-evening fee exemption stays for club or rating hosts, exactly as before;
- `organizer_player_access` = the separate, actual entitlement to Organizer CRM.

«Как часто ходит» (owner-approved 2026-09-28): «Ходит постоянно» / «Ходит иногда» only describe the player; «Ходит иногда» is kept in `players.attends_sometimes` (owner 2026-09-30), so a helper or an organizer can have it too (the old `club_role` guest still reads as «иногда»). «Перестал ходить» sets `contact_status=paused` with `pause_reason='Перестал ходить'`, so the bot stops personal announcements, evening invitations and nudges, invitations from other players and tournament announcements (reminders for an evening the player answered «иду»/«позже» themselves still go out); choosing «постоянно» or «иногда» again lifts only that pause. Blocked players and pauses set for other reasons are never changed by this choice, but «Перестал ходить» is still saved for them (`players.stopped_attending`, owner 2026-09-30); lifting the other pause later keeps the bot quiet with the «Перестал ходить» pause. Labels in the CRM are plain words with a one-line hint of what each choice changes: «Уровень игры», «Как часто ходит», «Роль в клубе» (Просто игрок / Помогает клубу / Организатор), «Может вести» (checkboxes per evening type).

«Из другого города» (owner-approved 2026-09-30) is the fourth «Как часто ходит» answer (`players.from_other_city = 1`). Only the game level is set for such a player; they may judge rating games and tournaments («Может вести: рейтинг и турниры»), but get no club role and no «Может проводить» marks — the server drops them with a warning, and a club organizer cannot be marked «Из другого города». Personal bot announcements go to them only for rating evenings and tournaments (not novice or club evenings, not «Свои ивенты» mailed to the whole club); they may still sign up for any evening their level allows, and they are not listed in «Порядок в клубе» as absent for 90+ days. A new player chooses «Я гость из другого города» at the first application (next to «Я новичок» and «Я уже умею играть»); it waits for the organizer like «уже умею играть», and confirming it gives «Играет в клубе» and the mark. The organizer can also admit a new registration with «Гость из другого города» on «Сегодня».

Club roles (owner decision 2026-09-28, replaces «the role does not grant access»):
- «Организатор клуба» (`club_role=organizer`) and Organizer CRM access (`organizer_player_access`) are one setting: giving the role opens the cabinet, closing the cabinet ends the role (back to «Ходит постоянно»). `game_level` and «Может вести» never change with it.
- «Владелец» = the owner's own player account (`PRIMARY_ORGANIZER_PLAYER_ID`) or the root password session. Only the owner gives or takes the organizer role / cabinet, deletes (archives) players and sees club money (the finance block of analytics). Every other cabinet action is open to club organizers. Merging players does not exist yet; when it is built it is owner-only too.
- **Player base tabs and what counts as a visit (owner decision 2026-09-30).** «Игроки → База» is split by the organizer's own statuses, not by visit counting: «Постоянные» («Ходит постоянно»), «Иногда» («Ходит иногда»), «Другие города» («Из другого города», a status of its own, owner 2026-09-30), «Новички» (game level «Новичок»), «Перестали» («Перестал ходить», which wins over everything else), then «Вся база» (every record, including archived and merged guests). A visit is an evening (not cancelled or a draft, already started) where the player is marked «пришёл» **or** sat at a table in one of its games; the visit count and the last visit next to the name and in «Дела» use this rule, because evenings are often closed without attendance marks.
- **«Дела» (owner decisions 2026-09-30).** Three parts: «Срочно» (the nearest evening, payment, what is already late), «На этой неделе», «Гигиена клуба». «Добор» starts 3 days before a published evening when fewer than the minimum (10, novices 8) said «Иду»: it lists club players who have not answered and whose level fits the evening, regular players first (not «Перестал ходить», not paused or blocked, «Из другого города» only for rating evenings). «Думают» lists who answered «Думаю» for an evening in the next 3 days. Unpaid debts and unfinished protocols are urgent. Profiles are asked of every club player except «Перестал ходить» (not only those who came), regular players first. «Написал» hides the person for the item's quiet period: 3 days for «Добор», 2 for «Думают», 14 for a profile or a curator. Moving a novice to the main club is the owner's own manual decision; «Дела» does not remind about it. Answer work (добор, «Думают») happens inside the evening (owner, 2026-10-01): the task only highlights it and opens the evening's «Личные приглашения» (filters «Ждём ответа», «Думают»); it no longer lists people itself. «Сегодня» and «События» show all events of the week evenly; only an evening that is running now gets the big card. Non-mafia events are the third tab «Свои события» next to «Вечера» and «Турниры».
- **«Куратор направления» (owner decisions 2026-09-28 and 2026-09-30).** Independent marks: Новички, Обучение, Ивенты и активности, Турниры, Дисциплина, СММ. Any organizer sets them; they give no rights in the app, and a player from another city is not a curator. «Дела» lists a curator whose direction was quiet for 14 days and who was not talked to in that time. The app sees for «Новички» a novice evening run or judged by the curator, for «Турниры» a tournament organized, for «Ивенты» an own event organized; «Обучение», «Дисциплина» and «СММ» leave no trace in the app yet, so only the organizer's last talk («Написал») counts for them. Curator tasks (owner, 2026-10-01): an organizer gives a curator a task in one of his directions (optionally with a due date) under «Ещё → Дела → Задачи кураторов»; the curator is told in the bot, sees «Мои задачи куратора» on the app's home screen and marks it «Сделано» with an optional note; a task marked done counts as that direction's activity in «Дела». Bonuses for tasks come later.
- In the player list each player shows «TG» and «VK» marks: green when the player signed in through the Telegram bot or VK (owner, 2026-09-30).
- «Организатор вечера» (owner decision 2026-09-28): any player (not blocked) can be assigned to one evening; the picker lists club organizers first, then the players of that evening. The assigned player does not pay for games on a regular club evening and gets the organizer reward, as before. On their own evening (owner, 2026-10-01) they run it from the limited cabinet «Мои вечера» even without «Может проводить» marks: mark arrivals and payment, build tables and games, start and close the evening; the evening itself (title, time, price, publication, organizer) stays with the owner and club organizers, and they create no evenings. The access lasts while they are the organizer of an evening that is not cancelled or closed.
- «Может проводить» (`organize_formats`, owner decision 2026-09-29): independent marks — «Вечера для новичков», «Клубные вечера», «Рейтинговые вечера», «Турниры», «Свои ивенты». Only the owner gives them. The first three marks grant the limited evening cabinet (create and run such evenings). «Турниры» is separate from rating evenings (tournaments are separate events): it lets the player be chosen as a tournament organizer; the old «Рейтинг и турниры» mark became both marks once. Rating seasons (create, change, delete, which evenings and games count) are changed only by the owner and club organizers, never through these marks. «Свои ивенты» grants separate non-Mafia events: they have no games and never affect Mafia attendance, Elo or game statistics. The event organizer controls its details, visibility, sign-up and invitations.
- «Судья вечера» (owner decisions 2026-09-30 and 2026-10-08): every evening has an organizer and an evening judge (`evening_staff_assignments.judge_player_id`). A draft may be incomplete; publishing a draft needs an organizer (the owner, a club organizer or a «Может проводить» mark for that kind) and an evening judge with the «Может вести» mark for that kind. Novice and club evenings start with the owner as organizer and judge; both can be changed at any time, and the evening host may change the judge of their own evening. «Может вести» is qualification only: it does not by itself let a player create games on every evening of that format. In the personal «Ведение» workspace a qualified judge sees only published/active evenings where they are currently assigned as the evening judge, and only there may they create a new game. An already-created game remains conductable by its own linked `judge_player_id` so changing the evening judge does not strand an in-progress game. Each new game suggests the evening judge, and it can be changed before the game. A tournament also needs its organizer before publishing.
- An organizer sends a custom-event announcement manually after publishing it in the app. Every selected destination is recorded separately; a sent or uncertain external call is never repeated automatically. Bot DMs follow event visibility and each player's existing Telegram/VK notification route.
- The owner's own cabinet and the last cabinet holder cannot be closed; a bulk change that would do so keeps the role and says why.
- Password login with a verified player identity must never recreate a revoked entitlement. A deliberately supported password-only root organizer session is separate from player-bound entitlement.

A registered external/occasional player is still a canonical player account, even when the historical stored `club_role` value is `guest`; the UI must not present that account as a guest placeholder. A true guest placeholder has no player account/profile, Elo, tokens, Telegram/VK identity, or editable registered-player profile.

CASUAL payment exemptions remain evening-specific. Editing `game_level`, `club_role`, `judge_level`, or Organizer CRM entitlement must not retroactively create or remove a regular-evening waiver.

Repository tests and GitHub checks verify code only. They do not prove the deployed Amvera revision or real Telegram/VK runtime behavior; deployment and runtime verification remain separate steps.

## Analytics definitions (owner-approved 2026-10-05)

Canonical implementation: `MEMBER_SQL` and `playerVisitsService.ts`; half-open period boundaries in `analyticsPeriod.ts` (Moscow calendar months; active RATING season containing now, otherwise latest active; missing season explicitly falls back to all time). No changes to CRM 14/28-day cut-offs, game/pricing/award rules or data collection.

The help wording below is mirrored verbatim in `src/lib/analyticsHelp.ts` and checked by a regression test. All counts are period-based unless the text explicitly says today/all time.

- **members:** Участники клуба: без архивных, объединённых, заблокированных и гостевых профилей. Число на сегодня.
- **newPlayers:** Новый игрок — участник клуба, чей первый визит попал в выбранный период.
- **activePlayers:** Активный игрок — участник клуба хотя бы с одним визитом в выбранном периоде.
- **visits:** Визит — отметка «пришёл» или место в неархивной игре начавшегося вечера, который не отменён и не является черновиком. Один игрок за вечер считается один раз.
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



## Virtual role dealing (owner, 2026-10-28)

The approved fair virtual deck is an alternative to manual physical-role entry in all game formats. It follows the existing10/9/8-player composition in tableComposition; horizontal cards are renumbered after removal, the judge reveals and confirms separately, may choose another unassigned seat, undo the last assignment or explicitly redeal before starting. Synthetic training keeps its fixed task roles. Tournament assignments remain subject to the existing server role permissions and composition checks.

VIP is a separate unfinished scope: [current owner decisions](ROLE_DEAL_SPEC_2026-10-28.md). Persistent toggleable personal preferences do not authorize any deployed probabilistic effect. No default global2-swap cap is approved; the personal limit is manually configured. Effects may influence only the owner's own still-closed card and must never alter an already shown role or operate in rating/tournament games. Strength/frequency/conflicts/global caps require modelling and owner agreement before implementation.
