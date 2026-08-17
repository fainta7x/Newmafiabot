# Mafia Club CRM & Live Game Engine

CRM-система и игровой пульт проведения партий спортивной (классической) мафии для организатора клуба.

> 🚨 **ВНИМАНИЕ ПО БЕЗОПАСНОСТИ!**
> Если какие-либо Telegram бот-токены или секреты ранее были скомпонованы или сохранены в Git, **ОБЯЗАТЕЛЬНО вручную отозовите и перевыпустите их через BotFather** (`/revoke` -> `/token`).
> Все токены и ключи приложения теперь хранятся исключительно в файле `.env` и никогда не попадают в репозиторий.

---

## 🧭 Продолжение разработки / AI handoff

Чтобы новый чат, разработчик или агент не проводил повторный аудит всего проекта, начинайте с:

1. [`AGENTS.md`](AGENTS.md) — обязательные правила работы и защиты данных.
2. [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — что реально готово, что намеренно выключено и что делать дальше.
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — карта UI/API/интеграций и ключевых файлов.
4. [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) — утверждённые правила спортивной мафии и продуктовые решения.
5. [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — проверка, CI, деплой, runtime smoke-test и безопасная работа с БД.

Быстрый read-only снимок локального контекста:

```bash
npm run project:status
```

Машиночитаемый вариант:

```bash
npm run project:status -- --json
```

Полная стандартная web-проверка перед merge:

```bash
npm run project:verify
```

Старый `docs/live-club-roadmap.md` хранится как исторический план и не является источником истины по текущей готовности.

---

## 🛠 Технологический стек

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Motion (Framer).
- **Backend**: Node.js, Express, REST API, Zod Validation, JWT Cookie Authentication.
- **Database**: SQLite через текущий DB wrapper / `better-sqlite3`, с Drizzle ORM в части модели данных.
- **Telegram Bot**: Python Telegram Bot, связанный с web-приложением через REST/API-интеграцию. Подробная историческая документация: [Telegram bot / Webapp integration](docs/telegram-webapp-integration.md).

---

## 🚀 Быстрый запуск

### 1. Настройка окружения
Скопируйте `.env.example` в `.env` и заполните конфигурацию:
```bash
cp .env.example .env
```

### 2. Установка зависимостей
```bash
npm install
```

### 3. Запуск миграций и импорта старой базы
Для миграционных/legacy-сценариев используйте только актуальные guarded workflow/скрипты и сначала прочитайте `AGENTS.md` + `docs/RUNBOOK.md`. Не импортируйте старую базу поверх непустой runtime-БД.

### 4. Проверка типов и тестов
```bash
npm run typecheck
npm test
```

Полная web-проверка:
```bash
npm run project:verify
```

### 5. Запуск сервера разработки
```bash
npm run dev
```
Приложение будет доступно на локальном адресе Vite/Express, указанном при запуске.

---

## 🔐 Аутентификация Организатора

Режим **Игрок** (`PLAYER`) доступен участникам для личного кабинета, событий, результатов и связанных игровых функций.
Режим **Ведущий / Организатор** (`ORGANIZER`) защищён серверной авторизацией; изменяющие organizer API требуют соответствующую сессию/права.

---

## 📂 Структура проекта

- `src/db/` — SQLite/DB wrapper, schema ensure, миграции и data/recovery logic.
- `src/server/` — Express routes, services, auth и integrations.
- `src/components/` — React UI: CRM, player cabinet, Live Game и связанные интерфейсы.
- `src/tests/` — основная Vitest regression/integration coverage.
- `docs/` — архитектура, правила, runbook и интеграционная документация.

Для актуальной карты модулей используйте [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), а не этот краткий список.

---

## Canonical Preview snapshot

`mafia_crm.checkpoint.sqlite.gz.b64` is the canonical repository snapshot for a clean Preview bootstrap. Its version and purpose are declared in `mafia_crm.checkpoint.meta.json`; current tournament avatar assets are repository-managed in `public/player-avatars/` and mapped to stable player IDs in `src/lib/playerAvatarManifest.ts`.

Normal startup imports the canonical snapshot **only when the configured runtime database is absent or zero-length**. A non-empty runtime database is never replaced on restart or migration. Explicit reset/import remains separate from normal startup and must follow the guarded workflow in `AGENTS.md` and `docs/RUNBOOK.md`.
