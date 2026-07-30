# Mafia Club CRM & Live Game Engine

CRM-система и игровой пульт проведения партий спортивной (классической) мафии для организатора клуба.

> 🚨 **ВНИМАНИЕ ПО БЕЗОПАСНОСТИ!**
> Если какие-либо Telegram бот-токены или секреты ранее были скомпонованы или сохранены в Git, **ОБЯЗАТЕЛЬНО вручную отозовите и перевыпустите их через BotFather** (`/revoke` -> `/token`).
> Все токены и ключи приложения теперь хранятся исключительно в файле `.env` и никогда не попадают в репозиторий.

---

## 🛠 Технологический стек

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Motion (Framer).
- **Backend**: Node.js, Express, REST API, Zod Validation, JWT Cookie Authentication.
- **Database**: SQLite3 + Drizzle ORM (поддержка перехода на PostgreSQL).
- **Telegram Bot**: Python Telegram Bot (сохраняемый клиент общей системы, планируемый к интеграции по REST API). Подробный план интеграции зафиксирован в [Аудите интеграции Telegram-бота и Webapp](docs/telegram-webapp-integration.md).

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
Для автоматического создания SQLite базы `mafia_club.db` и импорта исходных данных из `mafia_db.json`:
```bash
npx tsx src/db/migrateLegacyData.ts
```

### 4. Проверка типов и тестов
```bash
npm run typecheck
npm run lint
npm test
```

### 5. Запуск сервера разработки
```bash
npm run dev
```
Приложение будет доступно на `http://localhost:3000`.

---

## 🔐 Аутентификация Организатора

Режим **Игрок** (`PLAYER`) доступен всем участникам в режиме "Только чтение" для просмотра результатов партий, личного кабинета и протоколов.
Режим **Ведущий / Организатор** (`ORGANIZER`) защищен паролем (по умолчанию задается в `.env` как `ORGANIZER_PASSWORD=admin`). Все изменяющие API проверяют авторизационный токен организатора.

---

## 📂 Структура проекта

- `src/db/` — Схема базы данных SQLite (Drizzle), миграции, репозитории.
- `src/server/` — Модульный Express сервер (маршруты, контроллеры, Zod-валидация, auth).
- `src/components/` — React UI компоненты (CRM Организатора, Пульт Ведущего, Игровой Движок LiveGameEngine).
- `tests/` — Интеграционные тесты (Vitest + Supertest).
