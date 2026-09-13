# Архитектурная спецификация десктопной версии (Desktop Spec)
## Antigravity Plugin Manager Desktop (Standalone)

> **Назначение документа:** Руководство и архитектурный мост для разработки автономного настольного приложения (Desktop App) для пользователей десктопного приложения **Antigravity 2.0** и консольного интерфейса **Antigravity CLI (agy)**, где нет возможности устанавливать расширения VS Code.

---

## 1. Контекст и целевая аудитория

1. **Проблема:**  
   Пользователи Antigravity делятся на две группы:
   * Пользователи **Antigravity IDE** (VS Code fork) — используют плагин `.vsix`.
   * Пользователи **Antigravity 2.0 (Desktop app)** и **Antigravity CLI (`agy`)** — работают вне VS Code, у них **нет возможности установить расширение**, но они страдают от той же проблемы: все навыки и плагины из `~/.gemini` сваливаются в системный промпт без возможности визуального управления.
2. **Цель:**  
   Автономное приложение для Windows (с иконкой в трее или окном), которое запускается в один клик и предоставляет 100% функционала управления контекстом ИИ.

---

## 2. Архитектура ядра и источники истины (Engine Truth)

Ядро Antigravity 2.0 (Desktop / CLI) управляется через те же нативные конфигурационные файлы, что и IDE:

| Ресурс | Путь на диске (Windows) | Механизм управления |
| :--- | :--- | :--- |
| **Плагины (Глобально)** | `%USERPROFILE%\.gemini\config\plugins\` | Манифест `plugin.json` (`"disabled": true/false`) + реестр десктопа `%USERPROFILE%\.gemini\config\config.json` (`"plugins": { "<name>": { "enabled": true/false } }`) + корневой `exclude` в `plugins.json`. |
| **Плагины (Проект)** | `<project_root>\.agents\plugins.json` | Массив `entries` (включение) и `exclude` (отключение). |
| **Навыки (Глобально)** | `%USERPROFILE%\.gemini\antigravity\skills\` и `%USERPROFILE%\.gemini\config\skills\` | Двухуровневый `exclude` в `skills.json`: для дефолтных — корневой `exclude`, для подключенных библиотек — `entry.exclude`. |
| **Навыки (Проект)** | `<project_root>\.agents\skills.json` | Массив `entries` и `exclude`. |
| **Правила** | `%USERPROFILE%\.gemini\GEMINI.md`, `AGENTS.md` и `<project_root>\.agents\rules\*.md` | Прямое редактирование и чтение. Системные файлы `GEMINI.md` и `AGENTS.md` защищены от удаления. |
| **MCP Серверы** | `%USERPROFILE%\.gemini\antigravity-ide\mcp_config.json` или `<project_root>\.agents\mcp_config.json` | Поле `"disabled": true/false` в конфигурации сервера. |
| **Хуки** | `%USERPROFILE%\.gemini\config\hooks.json` или `<project_root>\.agents\hooks.json` | Поле `"enabled": true/false` для каждого хука. |

> ⚠️ **КРИТИЧЕСКИ ВАЖНО:** Никакого физического перемещения каталогов плагинов в хранилище и создания NTFS Junctions! Все каталоги остаются на исходных местах. Управление производится строго через изменение JSON-файлов.

---

## 3. Стратегия повторного использования кода (85% уже готово)

В репозитории расширения `Antigravity Plugin Manager` код уже строго разделен на слои:

### 1. Фронтенд (`/webview/` + `/locales/`)
* **`webview/index.html`** — готовая верстка (дашборд «Активное», вкладки правил, навыков, плагинов, воркфлоу, MCP, хуков, модальные окна переноса, создания и обновления).
* **`webview/style.css`** — готовый темный стиль Glassmorphism с анимациями, адаптивной сеткой и индикаторами.
* **`webview/main.js`** — готовая реактивная клиентская логика рендеринга и фильтрации.
* **`locales/translations.js`** — полный словарь русской и английской локализации.

**Что изменить во фронтенде:**
В `main.js` заменить вызовы `vscode.postMessage(msg)` на универсальный мост:
```javascript
// Universal IPC Bridge
const bridge = window.desktopApi || {
  postMessage: (msg) => window.vscode ? window.vscode.postMessage(msg) : window.electronAPI.postMessage(msg)
};
```

### 2. Бэкенд (`/services/`)
Все 4 сервисных модуля написаны на чистом Node.js и **не зависят от VS Code API**:
* **`services/fsUtils.js`** — разрешение путей `%USERPROFILE%\.gemini`, чтение и запись JSON конфигураций, парсинг frontmatter `SKILL.md`.
* **`services/scanners.js`** — сканирование установленных плагинов, навыков, правил, MCP и хуков.
* **`services/actions.js`** — включение/выключение, перенос, создание, удаление компонентов.
* **`services/updater.js`** — проверка версий на GitHub и скачивание обновлений через `git`.

---

## 4. Рекомендуемый технологический стек десктопной версии

### Electron (Быстрый запуск за 1 вечер — 100% повторное использование Node.js)
* **Плюсы:**
  - Модули `services/*.js` копируются **вообще без изменений**.
  - Нативный доступ к файловой системе Windows, `child_process.exec` (`explorer.exe`), системному трею.
  - Сборка в один файл `Antigravity-Plugin-Manager-Setup.exe` или Portable `.exe` через `electron-builder`.
* **Структура проекта:**
  ```
  /
  ├── main.js             # Electron main process (инициализация окна, tray, IPC-роутер)
  ├── preload.js          # contextBridge: window.desktopApi = { postMessage, onMessage }
  ├── package.json        # electron, electron-builder
  ├── services/           # Готовые модули fsUtils.js, scanners.js, actions.js, updater.js
  ├── locales/            # translations.js
  └── webview/            # index.html, style.css, main.js
  ```

---

## 5. Карта IPC-команд (Интерфейс «Фронтенд ⟷ Бэкенд»)

Все команды, которые фронтенд (`main.js`) отправляет в бэкенд:

| Команда | Аргументы | Описание |
| :--- | :--- | :--- |
| `init` | — | Запрос первичных данных: бэкенд вызывает `collectAllData()` и отправляет `{ command: 'init', ... }`. |
| `refresh` | — | Принудительное пересканирование директорий. |
| `togglePluginGlobal` | `{ id, enable, physicalPath }` | Переключение плагина в `plugin.json` + `config.json`. |
| `togglePluginProject`| `{ wsRoot, physicalPath, id, action }` | Переопределение плагина (`enabled`, `disabled`, `none`). |
| `toggleSkillGlobal`  | `{ name, enable, physicalPath }` | Переключение глобального навыка (`skills.json`). |
| `toggleSkillProject` | `{ wsRoot, physicalPath, name, action }`| Переопределение навыка для проекта. |
| `toggleMcpServer`    | `{ physicalPath, serverName, enabled }` | Переключение `disabled` в `mcp_config.json`. |
| `toggleHook`         | `{ physicalPath, hookName, enabled }` | Переключение `enabled` в `hooks.json`. |
| `openItemFolder`     | `{ physicalPath, category, id }` | Открытие папки в Проводнике Windows (`explorer.exe <path>`). |
| `moveItem`           | `{ category, id, targetDir, ... }` | Физическое перемещение ресурса с обновлением ссылок. |
| `deleteItem`         | `{ category, id, physicalPath }` | Безопасное удаление ресурса (с блокировкой системных). |
| `checkUpdates`       | — | Запуск проверки новых версий плагинов на GitHub. |
| `updatePlugin`       | `{ pluginId, repo, targetDir }` | Скачивание и применение обновления плагина. |
| `addCustomFolder`    | `{ targetType, folderPath, scope, wsRoot }` | Подключение внешней библиотеки папок. |
| `removeCustomFolder` | `{ sourceFile, folderPath }` | Отключение внешней библиотеки папок. |

---

## 6. Чек-лист для запуска в новой сессии ИИ

1. Открыть каталог `E:\Antigravity\Antigravity Plugin Manager program`.
2. Скопировать папки:
   * `/webview/` ➔ в новый проект.
   * `/locales/` ➔ в новый проект.
   * `/services/` ➔ в новый проект.
3. Создать `package.json` с зависимостями `electron` и `electron-builder`.
4. Создать `preload.js` с мостом `contextBridge`.
5. Создать `main.js` (Electron), объединив IPC-обработчики из `extension.js` (секция `setupWebviewMessagingShared`).
6. Настроить запуск: `npm start` (запуск окна) и `npm run build` (`electron-builder` для сборки `.exe`).
