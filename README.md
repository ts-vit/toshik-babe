# Toshik Babe Engine

**Суверенная система ИИ-ассистента** — local-first, быстрая и приватная альтернатива облачным решениям.

## Архитектура

Монорепозиторий на **Bun workspaces**:

```
toshik-babe/
├── packages/
│   ├── backend/          # Bun сервер (WebSocket API)
│   └── frontend/         # Tauri 2.x + React (десктопное приложение)
├── benchmarks/           # Отчёты по бенчмаркам
├── PRD.md                # Документ требований к продукту
├── ROADMAP.md            # Дорожная карта
├── DEV_PLAN.md           # План разработки
├── tsconfig.base.json    # Базовый TypeScript (strict mode)
├── eslint.config.js      # Общий ESLint
└── .prettierrc           # Общий Prettier
```

## Стек

| Слой     | Технология                      |
|----------|---------------------------------|
| Runtime  | Bun                             |
| Backend  | Bun.serve() + WebSocket         |
| Frontend | Tauri 2.x + React + TypeScript  |
| БД       | SQLite + векторная БД           |
| CI/CD    | GitHub Actions (Win/Linux/macOS)|

## Быстрый старт

### Требования

- [Bun](https://bun.sh) >= 1.2
- [Rust](https://rustup.rs) (для Tauri)
- Системные зависимости Tauri (см. [документацию](https://v2.tauri.app/start/prerequisites/))

### Установка

```bash
bun install
```

### Разработка

```bash
# Все пакеты
bun run dev

# Только backend
bun run dev:backend

# Только frontend (web-режим, без Tauri)
bun run dev:frontend
```

### Сборка

```bash
bun run build
```

### Линтинг и форматирование

```bash
bun run lint          # Проверка ESLint
bun run lint:fix      # Автоисправление
bun run format        # Форматирование Prettier
bun run format:check  # Проверка формата
bun run typecheck     # Проверка типов
```

## Режимы работы

- **Локальный** — backend и Tauri-клиент на одной машине
- **Клиент-серверный** — backend на VPS, клиент подключается по WebSocket

## Документация

- [PRD.md](./PRD.md) — требования к продукту
- [ROADMAP.md](./ROADMAP.md) — дорожная карта
- [DEV_PLAN.md](./DEV_PLAN.md) — план разработки

## Лицензия

Private — все права защищены.
