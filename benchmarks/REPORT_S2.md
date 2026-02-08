# Технический отчет S2: Исследование системных интеграций (Tauri 2.x + Rust)

**Дата:** 8 февраля 2026
**Проект:** Toshik Babe Engine
**Задача:** Technical Spike (S2) — Интеграция с ОС (Window Tracking, Selection, Hotkeys, Clipboard)

## 1. Матрица совместимости (Compatibility Matrix)

| Функция | Windows | macOS | Linux (X11) | Linux (Wayland) | Решение (Stack) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Active Window** | ✅ Native (WinAPI) | ✅ Native (Cocoa/AX) | ✅ Native (XLib/Atom) | ⚠️ Сложно (Security*) | Rust Crate (`active-win-pos-rs`) |
| **Selection (Ctrl+C)** | ✅ Simulation | ✅ Simulation | ✅ Simulation | ✅ Simulation | Rust (`enigo` / `rdev`) |
| **Selection (AX API)** | ✅ UI Automation | ✅ AXUIElement | ✅ AT-SPI | ❌ Ограничено | Custom Rust (platform-specific) |
| **Global Hotkeys** | ✅ Stable | ✅ Stable (Carbon) | ✅ Stable | ⚠️ Portal required | Tauri Plugin (`global-shortcut`) |
| **Clipboard Monitor** | ✅ Listener | ✅ Listener (Polling/C) | ✅ Listener (XFixes) | ⚠️ Ограничено | Rust Crate (`clipboard-master`) |

*\*Linux Wayland: Требует использования GNOME Shell Extensions или специфических порталов. Прямой доступ к окнам других приложений заблокирован архитектурой безопасности.*

---

## 2. Детальный анализ и рекомендации

### 2.1. Отслеживание активного окна (Active Window Tracking)

**Задача:** Получить имя процесса и заголовок активного окна.

*   **Рекомендация:** Использовать крейт **`active-win-pos-rs`**.
    *   Это де-факто стандарт в экосистеме Rust для кроссплатформенного получения метаданных окон.
    *   Под капотом использует WinAPI (Windows), Cocoa/CoreGraphics (macOS) и Xlib (Linux).
*   **Альтернатива:** `x-win` (меньше зависимостей, но `active-win-pos-rs` более активен).
*   **Ограничения:**
    *   **macOS:** Требует разрешения "Screen Recording" (Запись экрана) для получения заголовков окон (Window Title). Без этого разрешения вернется только имя приложения.
    *   **Linux (Wayland):** Не будет работать из коробки. Потребуется либо fallback на XWayland, либо использование DBus API конкретного композитора (KDE/GNOME), что ненадежно.

### 2.2. Захват выделенного текста (Selection Capture)

Это самая сложная часть задачи. Существует два пути:

#### А. Эмуляция "Ctrl+C" (Simulate Copy Shortcut)
*   **Метод:** Программно нажать `Ctrl+C` (или `Cmd+C` на Mac), подождать 50-100мс, прочитать буфер обмена, восстановить старый буфер (опционально).
*   **Инструменты:** Крейт **`enigo`** или **`rdev`** для ввода клавиш.
*   **Плюсы:** Работает везде, где работает клавиатура.
*   **Минусы:**
    *   "Мигает" меню "Edit" в некоторых приложениях.
    *   Затирает буфер обмена пользователя (нужно сохранять и восстанавливать, что вызывает Race Conditions).
    *   Медленно (требует `sleep` для обработки события системой).

#### Б. Accessibility APIs (Нативный захват)
*   **Метод:** Использование API для людей с ограниченными возможностями (Screen Readers).
*   **Windows:** **UI Automation (UIA)**. Через крейт `windows` можно запросить паттерн `TextPattern` у активного элемента. Работает надежно в браузерах и Word.
*   **macOS:** **AXUIElement**. Через `core-foundation` и `accessibility-sys`. Можно получить значение атрибута `kAXSelectedTextAttribute`.
*   **Linux:** **AT-SPI**. Через крейт `atspi`.
*   **Рекомендация:** Для MVP использовать **Эмуляцию Ctrl+C** (быстрее в реализации). Для продакшена — гибридный подход (пробовать Accessibility, фоллбек на Ctrl+C).

### 2.3. Глобальные хоткеи (Global Hotkeys)

*   **Рекомендация:** Использовать официальный плагин **`@tauri-apps/plugin-global-shortcut`** (для Tauri v2).
*   **Стабильность:** В Tauri v2 API стабилизировано.
*   **Разрешения:**
    *   **macOS:** Обычно не требует специальных прав для стандартных сочетаний (например, `Cmd+Shift+K`). Если приложение песочится (Sandboxed), могут быть ограничения.
    *   **Linux (Wayland):** Регистрация глобальных шорткатов требует взаимодействия с порталом XDG Desktop Portal.

### 2.4. Мониторинг буфера обмена (Clipboard Monitoring)

*   **Рекомендация:**
    *   Для **чтения/записи**: Официальный плагин `@tauri-apps/plugin-clipboard-manager`.
    *   Для **мониторинга событий** (change listener): Крейт **`clipboard-master`** (запускать в отдельном потоке Rust sidecar).
*   **Реализация:**
    1.  В `src-tauri/src/lib.rs` запускаем поток с `Master::new(handler).run()`.
    2.  При изменении отправляем событие `window.emit("clipboard-changed", text)`.

---

## 3. Заметки по безопасности и правам доступа (Security & Permissions)

### macOS (TCC — Transparency, Consent, and Control)
Для корректной работы на macOS приложению потребуются следующие разрешения:
1.  **Accessibility (Универсальный доступ):** Критично для использования Accessibility API (получение текста) и симуляции нажатий клавиш (`enigo`).
    *   *System Settings -> Privacy & Security -> Accessibility*.
2.  **Screen Recording (Запись экрана):** Необходимо только для получения **заголовков** окон (Window Titles) других приложений. Имя процесса доступно без него.
3.  **Input Monitoring:** Может потребоваться, если мы пытаемся слушать клавиатуру на низком уровне (не через стандартные Hotkey API).

### Windows
*   Обычно работает с правами текущего пользователя.
*   Если целевое приложение запущено от имени Администратора, наше приложение **тоже** должно быть запущено от имени Администратора, чтобы взаимодействовать с ним (отправлять клавиши или читать UI Automation).

### Linux
*   **X11:** Полный доступ, все работает.
*   **Wayland:** Изоляция приложений. Глобальные хоткеи и снимок экрана/буфера требуют явного согласия пользователя через XDG Portals. Рекомендуется предупреждать пользователей Linux использовать X11 для лучшего опыта.

---

## 4. Итоговые рекомендации по стеку (Recommended Stack)

Для реализации "Toshik Babe Engine" на Tauri 2.0 предлагается следующий набор:

1.  **Core Framework:** Tauri 2.0 (RC/Stable).
2.  **Window Tracking:** `active-win-pos-rs` (Rust).
3.  **Global Hotkeys:** `@tauri-apps/plugin-global-shortcut` (JS/Rust).
4.  **Clipboard:** `@tauri-apps/plugin-clipboard-manager` + `clipboard-master` (для ивентов).
5.  **Text Capture (MVP):** `enigo` (Rust) для симуляции `Ctrl+C/Cmd+C`.
6.  **Text Capture (Future):** Кастомная реализация на `windows-rs` (Win) и `accessibility-sys` (Mac).
