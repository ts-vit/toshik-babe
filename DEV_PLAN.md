# План разработки Toshik Babe Engine

## Phase -1: Spike & Validation (1 неделя)

### День 1-2: Spike — Векторная БД
- **Задача S1:** Бенчмарк SQLite-vss, LanceDB, hnswlib
  - Тест на 10K, 100K, 500K векторов
  - Скорость поиска, RAM, размер индекса
  - Тест на VPS 1 vCPU / 1 GB RAM
  - Отчёт с рекомендацией

### День 3-4: Spike — Интеграция с ОС
- **Задача S2:** Исследовать Tauri API
  - Активное окно (macOS/Windows/Linux)
  - Выделенный текст (accessibility API)
  - Глобальные hotkeys
  - Clipboard events
  - Таблица: функция × платформа × статус

### День 5: Spike — Bun на VPS
- **Задача S3:** Валидация производительности
  - Развернуть WebSocket сервер на VPS
  - 10 соединений, 100 сообщений/сек
  - Стресс-тест 1 час
  - Замерить latency (RTT)

### Go/No-Go Gate #1
- ✅ Векторная БД выбрана
- ✅ Интеграция с ОС возможна
- ✅ Bun работает на VPS

---

## Phase 0: Foundation (3 недели)

### Sprint 0.1: Скелет проекта (Неделя 1)

**Задача 1:** Инициализация монорепозитория
- Tauri + Bun monorepo
- Package.json workspaces
- GitHub Actions (macOS/Windows/Linux)
- ESLint + Prettier + TypeScript

**Задача 2:** WebSocket туннель
- Bun WebSocket сервер
- React useWebSocket hook
- Connection status indicator
- Типизированные сообщения

**Задача 3:** Lifecycle бэкенда
- Tauri команда для запуска Bun subprocess
- Автопоиск свободного порта
- Graceful shutdown
- Логирование

**Метрики:**
- ✅ WebSocket соединение работает
- ✅ Сообщения отправляются/получаются
- ✅ Бэкенд автозапуск/остановка

### Sprint 0.2: Первый вертикальный слайс (Неделя 2)

**Задача 4:** ModelProvider + Google AI (Gemini)
- Интерфейс ModelProvider
- GeminiProvider с stream()
- Конфигурация API key
- Unit-тесты

**Задача 5:** Базовый UI чата
- shadcn/ui setup
- ChatInput, MessageList, ChatMessage
- Markdown рендеринг
- Тёмная тема

**Задача 6:** Связка через WebSocket
- Бэкенд обработчик 'chat.send'
- Стриминг токенов
- UI отображение в реальном времени
- Обработка ошибок

**Метрики:**
- ✅ Сообщение → стриминговый ответ
- ✅ Время до первого токена < 200ms
- ✅ RAM бэкенда < 100 MB

### Sprint 0.3: Персистентность (Неделя 3)

**Задача 7:** SQLite + миграции
- better-sqlite3
- Таблицы: conversations, messages
- DAO слой
- Unit-тесты

**Задача 8:** Сохранение/загрузка
- Автосохранение сообщений
- Загрузка последней беседы
- WebSocket event 'conversation.history'

**Задача 9:** UI бесед
- Sidebar с списком
- Кнопка "New conversation"
- Переключение между беседами

**Метрики:**
- ✅ Беседы сохраняются
- ✅ История восстанавливается
- ✅ Переключение работает

### Go/No-Go Gate #2
- ✅ Базовый чат работает end-to-end
- ✅ Данные персистентны
- ✅ Производительность OK

---

## Phase 1: MVP Features (8 недель)

### Sprint 1.1: Мультипровайдер (Неделя 4)

**Задача 10:** Расширение провайдеров
- AnthropicProvider (Claude)
- GoogleAIProvider (Gemini)
- OllamaProvider (локальные)
- Тесты для каждого

**Задача 11:** Безопасное хранение
- Tauri Stronghold интеграция
- save_secret(), get_secret()
- Миграция из ENV

**Задача 12:** UI переключения
- Settings панель
- Форма для API keys
- Dropdown выбора модели
- Сохранение в settings

**Метрики:**
- ✅ 3+ провайдера работают
- ✅ API ключи в Stronghold

### Sprint 1.2: Vision & Files (Неделя 5)

**Задача 13:** Загрузка изображений
- ImageUpload (drag-and-drop)
- Paste из буфера
- Preview в чате
- Vision API support

**Задача 14:** Парсинг документов
- DocumentParser (PDF, DOCX, TXT, MD, CSV)
- Библиотеки: pdf-parse, mammoth
- Таблица documents
- Прогресс индикатор

**Задача 15:** Скриншоты
- Глобальная hotkey (где доступно)
- Захват экрана
- Автовставка в чат
- Graceful degradation

**Метрики:**
- ✅ Изображения загружаются и анализируются
- ✅ PDF парсится
- ✅ Скриншоты работают (мин. 1 платформа)

### Sprint 1.3: Двухзонный UI (Неделя 6)

**Задача 16:** Layout reorg
- react-resizable-panels
- Левая зона: чат
- Правая зона: панель виджетов
- Hotkey сворачивания
- Сохранение размеров

**Задача 17:** Widget System
- WidgetRegistry
- Интерфейс Widget с shouldRender()
- Автоматический рендеринг
- Priority ordering

**Задача 18:** Первые виджеты
- FilePreviewWidget
- CodeBlockWidget
- ModelInfoWidget

**Метрики:**
- ✅ Виджеты появляются автоматически
- ✅ Правая панель адаптивная
- ✅ UI resizable/collapsible

### Sprint 1.4: Templates (Неделя 7)

**Задача 19:** Template Engine
- Таблица templates
- Парсер переменных {{variable}}
- CRUD API
- 20+ seed templates

**Задача 20:** Slash-команды UI
- "/" → dropdown с шаблонами
- Fuzzy search
- Keyboard navigation
- Форма заполнения переменных

**Задача 21:** Системные переменные
- Tauri команды: clipboard, active_window, selection
- Автозаполнение
- Fallback для недоступных

**Метрики:**
- ✅ Slash-команды работают
- ✅ Переменные заполняются
- ✅ Системные переменные подтягиваются

### Sprint 1.5: RAG Foundation (Неделя 8)

**Задача 22:** Векторная БД
- Интеграция выбранной БД
- Таблица/коллекция для векторов
- CRUD для эмбеддингов

**Задача 23:** Embedding Service
- OpenAI text-embedding-3-small
- Опционально: transformers.js
- Батчинг
- Кэширование

**Задача 24:** Автоматическая индексация
- Эмбеддинги при сохранении
- Чанкинг документов
- Фоновая обработка

**Метрики:**
- ✅ Автоиндексация работает
- ✅ Поиск < 300ms на VPS
- ✅ RAM < 400 MB при индексации

### Sprint 1.6: RAG Search & UI (Неделя 9)

**Задача 25:** Семантический поиск
- Генерация эмбеддинга запроса
- Top-5 поиск (similarity > 0.7)
- Возврат чанков с метаданными

**Задача 26:** RAG-инжекция
- Форматирование контекста
- Инжекция в промпт
- Логирование

**Задача 27:** Memory UI
- MemorySourcesWidget
- Settings/Memory панель
- Удаление записей
- Slider порога релевантности

**Метрики:**
- ✅ Система находит контекст
- ✅ Контекст виден в UI
- ✅ Управление памятью работает

### Sprint 1.7: Personas (Неделя 10)

**Задача 28:** Persona Engine
- Таблица personas
- CRUD API
- 3 seed personas
- JSON export/import

**Задача 29:** Persona Switching
- Dropdown в header
- Hotkey (Cmd+Shift+P)
- Обновление промпта/модели
- Индикатор активной

**Задача 30:** Persona Editor
- Settings/Personas страница
- Форма создания/редактирования
- Preview персоны

**Метрики:**
- ✅ Персоны создаются и переключаются
- ✅ Поведение меняется
- ✅ Экспорт/импорт работает

### Sprint 1.8: OS Integration (Неделя 11)

**Задача 31:** Global Hotkeys
- Quick Input hotkey
- Selection capture hotkey
- Settings для hotkeys
- Feature flags по платформе

**Задача 32:** Quick Input Window
- Отдельное Tauri окно
- Compact UI (always-on-top)
- Отправка в активную беседу
- Auto-hide

**Задача 33:** Context-aware Suggestions
- Детект VS Code → "Analyze code"
- Детект URL в clipboard → "Summarize"
- SuggestionsWidget

**Метрики:**
- ✅ Quick Input работает
- ✅ Hotkeys работают (где доступно)
- ✅ Suggestions появляются

### Sprint 1.9: Рефакторинг & Tech Debt (Неделя 12)

**Задача 34:** Code Quality Pass
- Рефакторинг дублей
- TypeScript strict mode
- Error handling
- Unit-тесты

**Задача 35:** Performance Optimization
- Профилирование бэкенда
- Оптимизация SQL
- React.lazy
- react-virtuoso для списков

**Задача 36:** Documentation
- README.md
- ARCHITECTURE.md
- CONTRIBUTING.md
- Комментарии в коде

**Метрики:**
- ✅ RAM < 150 MB (idle), < 400 MB (active)
- ✅ Нет критических TODO
- ✅ Документация актуальна

### Sprint 1.10: VPS Mode & Security (Неделя 13)

**Задача 37:** Remote Backend Config
- Settings: Local vs Remote
- Форма URL + порт
- WSS подключение
- Health check

**Задача 38:** SQLite Encryption
- SQLCipher интеграция
- Мастер-пароль
- Шифрование БД

**Задача 39:** VPS Deployment Guide
- deploy.sh скрипт
- Docker образ (опционально)
- README для VPS
- Systemd service

**Метрики:**
- ✅ Remote подключение работает
- ✅ БД зашифрована
- ✅ Стабильность на VPS 1GB

### Sprint 1.11: UX Polish & Final Testing (Неделя 14)

**Задача 40:** UX Improvements
- Focus Mode (Cmd+Shift+F)
- Command Palette (Cmd+K)
- Onboarding wizard
- Tooltips

**Задача 41:** E2E Tests
- Playwright tests:
  - Отправка сообщения
  - Создание беседы
  - Загрузка файла
  - Переключение провайдера
- CI integration

**Задача 42:** MVP Acceptance Testing
- Проверка 14 критериев из PRD
- Checklist
- Demo-видео
- Cross-platform тестирование

**Задача 43:** Release Preparation
- Версионирование (semver)
- Changelog
- Подписание билдов
- GitHub Release
- Инструкции по установке

**Метрики:**
- ✅ Все 14 критериев выполнены
- ✅ E2E тесты проходят
- ✅ Билды готовы

### Go/No-Go Gate #3 — Launch Decision
- ✅ Критические баги исправлены
- ✅ Performance метрики достигнуты
- ✅ Документация завершена
- ✅ Cross-platform тесты пройдены

---

## Итого

**Phase -1:** 1 неделя (Spike & Validation)
**Phase 0:** 3 недели (Foundation)
**Phase 1:** 11 недель (MVP Features)

**Всего: 15 недель (~3.5 месяца)**

**Ключевые метрики успеха:**
- Время до первого токена < 200ms
- RAM бэкенда < 150 MB (idle)
- Работа на VPS 1 vCPU / 1 GB RAM
- Все 14 критериев приёмки PRD выполнены