# История изменений / Changelog

## 1.2.17

### Русский
* **Прямой переход внутрь целевых папок при открытии в Проводнике:**
  - Команда открытия папок (`revealOrOpenFolder`) переведена с устаревшего механизма выделения в родительской папке (`revealFileInOS`) на прямой вход в целевую директорию (`vscode.env.openExternal` с fallback на прямой запуск файлового менеджера ОС).
  - Теперь при клике на «Открыть папку» для плагинов, навыков, воркфлоу, правил или подключенных библиотек Проводник Windows сразу открывает содержимое нужной директории, избавляя от лишнего клика и нажатия Enter.

### English
* **Direct Navigation Inside Target Folders in OS File Explorer:**
  - Updated folder navigation (`revealOrOpenFolder`) from parent selection (`revealFileInOS`) to direct target entry (`vscode.env.openExternal` with native OS file manager spawn fallback).
  - Clicking "Open Folder" on plugins, skills, workflows, rules, or connected libraries now immediately opens inside the target folder in Windows Explorer instead of selecting it within the parent directory.

## 1.2.16

### Русский
* **Удалена микро-подпись «Глоб.» над переключателями:**
  - Полностью удалена экспериментальная подпись `глоб.` / `global` над тумблерами на карточках плагинов и навыков, возвращен лаконичный чистый вид контролов без лишнего текста.

### English
* **Removed "Global" Micro-label Above Toggles:**
  - Completely removed the experimental `global` / `глоб.` micro-label above switches on plugin and skill cards, restoring the clean, uncluttered toggle control design.

## 1.2.15

### Русский
* **Исправление диалога обновления плагинов (`openPluginUpdateModal`):**
  - Устранена критическая ошибка `ReferenceError: currentData is not defined` при клике на кнопку «⚡ Обновить» на карточке плагина. Переменная заменена на актуальный массив состояния `pluginsData` с надежным сопоставлением по `id`, `rawId` и `name`.
  - Модальное окно обновления плагина теперь мгновенно открывается с отображением версий (текущая ➔ новая), репозитория, метода доставки и интерактивным логом процесса обновления.
  - Повышена отказоустойчивость обновления файлов на Windows: добавлена обработка read-only атрибутов при копировании файлов `.git` и безопасная очистка временных папок (`safeRemoveDirSync`).

### English
* **Fix Plugin Update Dialog Trigger (`openPluginUpdateModal`):**
  - Resolved critical `ReferenceError: currentData is not defined` when clicking "⚡ Update" on plugin cards. Updated to reference `pluginsData` with robust fallback matching by `id`, `rawId`, and `name`.
  - The plugin update modal now opens immediately, displaying version comparison, repository details, update method, and a live progress log.
  - Hardened file update operations on Windows against read-only `.git` file locks and improved temporary folder cleanup (`safeRemoveDirSync`).

## 1.2.14

### Русский
* **Лаконичный дизайн карточек (акцентная рамка только для активных компонентов):**
  - Оставлена яркая изумрудная полоса слева (`border-left: 3px solid #10b981`) исключительно для активных компонентов (`.card-state-active`).
  - Убрана красная акцентная рамка и темный фон для неактивных карточек — все карточки сохраняют чистый полупрозрачный стеклянный фон.
  - Текст и описания компонентов остаются на 100% четкими и читаемыми без затемнения.
  - Приглушение глобального тумблера сохранено для неактивных в проекте компонентов, исключая ложную иллюзию активности.

### English
* **Clean Card Styling (Left Accent Stripe Exclusively for Active Items):**
  - Preserved the crisp emerald accent stripe (`border-left: 3px solid #10b981`) strictly for active components (`.card-state-active`).
  - Removed the red border stripe and darker background from inactive cards, keeping the consistent clean glassmorphism aesthetic.
  - Text and descriptions maintain 100% contrast and sharpness across all cards.
  - Retained subdued global switch behavior for project-inactive items to prevent deceptive visual signals.

## 1.2.13

### Русский
* **Визуальная дифференциация статуса карточек и исправление проверки обновлений:**
  - **Визуальное разделение активных и неактивных карточек (`.card-state-active`, `.card-state-inactive`, `.card-state-blocked`)**:
    - Активные карточки снабжены изумрудной акцентной полосой слева (`border-left: 3px solid #10b981`).
    - Неактивные в проекте карточки получают приглушенный фон, мягкую красно-серую полосу слева (`border-left: 3px solid rgba(239, 68, 68, 0.45)`) и легкое приглушение описания.
    - **Решение проблемы перетягивания внимания тумблером**: когда карточка не активна в проекте, глобальный переключатель справа приглушается (`opacity: 0.55`, полупрозрачный приглушенный бегунок вместо яркого неона). Тумблер больше не создает ложного ощущения, что карточка активна!
    - Над тумблером добавлена микро-подпись `Глоб.` (`Global`), явно указывающая, что данный переключатель задает глобальный статус, а не локальный статус текущего проекта.
    - Усилен визуальный стиль бейджа неактивности `.card-status-pill.inactive` (мягкий красный фон и контур).
  - **Исправление детекции обновлений плагинов (`readPluginInfo` & `parsePluginRepo`)**:
    - Устранена ошибка, из-за которой поля `repository` и `homepage` не сохранялись в объекте плагина при чтении `plugin.json`.
    - Внедрен прямой fallback в `parsePluginRepo` для надежного считывания репозитория с диска.
    - Теперь проверка обновлений мгновенно находит новые версии (например, `chrome-devtools-plugin` v0.21.0 ➔ v1.9.0 с GitHub).

### English
* **Visual Card State Differentiation & Plugin Update Check Fix:**
  - **Visual Separation of Active and Inactive Cards (`.card-state-active`, `.card-state-inactive`, `.card-state-blocked`)**:
    - Active cards feature an emerald accent stripe on the left (`border-left: 3px solid #10b981`).
    - Inactive cards receive a subdued background, a soft red-gray accent stripe (`border-left: 3px solid rgba(239, 68, 68, 0.45)`), and slightly muted text.
    - **Tamed the Global Switch Visual Dominance**: when a card is inactive in the project, the global toggle switch on the right is subdued and dimmed (`opacity: 0.55`, translucent slider instead of glowing neon), eliminating false visual cues that the card is running.
    - Added a micro-label `Global` (`Глоб.`) above the switch to clearly communicate that it controls the machine-wide default rather than project overrides.
    - Enhanced contrast and styling for `.card-status-pill.inactive`.
  - **Plugin Update Detection Fix (`readPluginInfo` & `parsePluginRepo`)**:
    - Fixed an issue where `repository` and `homepage` fields were omitted during `readPluginInfo` parsing.
    - Added on-disk fallback in `parsePluginRepo` to read `plugin.json` directly from `physicalPath`.
    - Update checks now reliably detect remote versions (e.g. `chrome-devtools-plugin` v0.21.0 ➔ v1.9.0 from GitHub).

## 1.2.12

### Русский
* **Гарды и двухуровневое переключение плагинов (Plugin Dual-Tier Toggles & Override Guardrails):**
  - Полная гармонизация механики плагинов с ядром Antigravity: на основе натурных тестов и анализа архитектуры ядра (`language_server_windows_x64.exe`) реализован двухуровневый алгоритм переключения плагинов (`togglePluginGlobal`).
  - Стандартные плагины (`~/.gemini/config/plugins`) при отключении синхронизируются в `plugin.json` (`disabled`), `config.json` (`enabled`) и корневой `exclude` в `plugins.json`.
  - Плагины из подключенных библиотек (`E:\AI\plugins`) отключаются строго через `entry.exclude` в `plugins.json`, сохраняя `plugin.json` чистым (`disabled: false`) и снимая killswitch из `config.json`. Это позволяет принудительно подключать отключенные глобально библиотечные плагины к выбранным проектам через `.agents/plugins.json` (Кейс C4)!
  - Интерактивный диалог-предупреждение при попытке включить стандартный глобальный плагин для проекта (`✓ Вкл`): система предупреждает о блокировке ядром и предлагает в 1 клик переместить плагин в подключенную библиотеку (`E:\AI\plugins`) с автоматическим включением в проекте.
  - Предупреждающее модальное окно при отключении глобального плагина, принудительно включенного в открытом проекте.
  - Статус-индикатор `🔴 Заблокирован (ядро)` (`Blocked (engine)`) для плагинов в Webview при невозможности переопределения ядром, а также контекстные подсказки к кнопкам.
  - Создана подробная инженерная документация в [/docs/ANTIGRAVITY_CUSTOMIZATION_ENGINE.md](/docs/ANTIGRAVITY_CUSTOMIZATION_ENGINE.md) с полным описанием архитектуры, приоритетов загрузки и матрицы из 16 натурных тестов (для навыков и плагинов).

### English
* **Plugin Dual-Tier Toggles & Project Override Guardrails:**
  - Fully aligned plugin activation mechanics with the Antigravity core engine based on empirical testing and Go binary analysis:
  - Standard global plugins (`~/.gemini/config/plugins`) sync disabled state across `plugin.json`, `config.json`, and root `exclude` in `plugins.json`.
  - Connected library plugins (`E:\AI\plugins`) are disabled strictly via `entry.exclude` in `plugins.json`, preserving a clean `plugin.json` (`disabled: false`) and removing machine-wide killswitches in `config.json`. This enables per-project activation for globally disabled library plugins via `.agents/plugins.json` (Case C4)!
  - Interactive guardrail modal when attempting to enable a standard default plugin per-project (`✓ On`), offering a 1-click move to a connected library with automatic workspace enablement.
  - Confirmation warning modal when disabling a global plugin that is currently force-enabled in the open workspace.
  - Added dedicated `🔴 Blocked (engine)` status pill for plugins in the Webview when engine restrictions block overrides, along with dynamic explanatory tooltips.
  - Added comprehensive technical documentation in [/docs/ANTIGRAVITY_CUSTOMIZATION_ENGINE.md](/docs/ANTIGRAVITY_CUSTOMIZATION_ENGINE.md) detailing architecture, loading priorities, and the complete 16-case empirical test matrix.

## 1.2.11

### Русский
* **Интеллектуальные гарды и подсказки для переопределений навыков (Skill Override Guardrails & Prompts):**
  - Добавлен интерактивный диалог-предупреждение при попытке включить навык для проекта (`✓ Вкл`), если он отключен глобально в стандартной папке (`~/.gemini/config/skills`): расширение информирует об ограничениях ядра Antigravity (корневой `exclude` блокирует Default Discovery во всех проектах) и предлагает в 1 клик переместить навык в подключенную библиотеку (`E:\AI\skills-global`) или рабочую область с автоматической привязкой к проекту.
  - Добавлено модальное предупреждение при попытке глобально отключить навык, который принудительно включен в открытом проекте: разъясняет, что глобальное отключение стандартного навыка заблокирует его и для текущего проекта, с запросом подтверждения.
  - При перемещении навыка в подключенную библиотеку (`connected`) его исключение автоматически мигрирует из корневого universal blacklist в `entry.exclude` целевой библиотеки, а при включенной опции привязки — навык мгновенно прописывается в `.agents/skills.json` текущего проекта.
  - Добавлен статус-индикатор `🔴 Заблокирован (ядро)` (`Blocked (engine)`) в Webview, если проект пытается включить навык, заблокированный в корневом `exclude`.
  - Динамические подсказки (tooltips) для кнопки переопределения проекта `✓ Вкл` и тумблера глобальной активности.

### English
* **Interactive Skill Override Guardrails & Prompts:**
  - Added an interactive warning modal when attempting to enable a skill for a project (`✓ On`) while it is globally disabled in the default folder (`~/.gemini/config/skills`): explains Antigravity engine restrictions (root `exclude` universally blocks default discovery skills across all workspaces) and offers a 1-click action to move the skill to a connected library (`E:\AI\skills-global`) or workspace with automatic project enablement.
  - Added a confirmation modal when disabling a skill globally that is currently force-enabled in the open workspace, preventing unexpected loss of context.
  - When moving a skill into a connected library (`connected`), exclusions cleanly migrate from root `exclude` to `entry.exclude`, automatically enabling selective per-project activation via `.agents/skills.json`.
  - Added a dedicated status indicator `🔴 Blocked (engine)` in the Webview when a project override is blocked by root `exclude`.
  - Dynamic explanatory tooltips for the project `✓ On` button and global toggle switch.

## 1.2.10

### Русский
* **Двухуровневая архитектура исключений навыков (Dual-Tier Skill Exclusion Architecture):**
  - Обнаружена и учтена специфика работы ядра загрузчика Antigravity IDE (`language_server_windows_x64.exe`):
    - Стандартная папка пользователя (`~/.gemini/config/skills/`) сканируется ядром Antigravity через встроенный механизм Default Discovery. В этом режиме ядро игнорирует поле `entry.exclude` и подчиняется исключительно корневому списку `exclude`. Поэтому навыки из стандартной папки (`test_skill3`) при отключении записываются в корневой `exclude` — это единственный способ гарантированно отключить их в ядре Antigravity.
    - Внешние библиотеки навыков (`entries`, например `E:/AI/skills-global`) сканируются через механизм Declared Configurations. Навыки из внешних библиотек (`test_skill2`) при отключении записываются в `entry.exclude` соответствующего хранилища. Это оставляет корневой `exclude` чистым от внешних навыков и сохраняет возможность их избирательного переопределения для конкретных проектов через `.agents/skills.json` (`publish_open_vsx`).
  - Устранена попытка принудительного добавления стандартной папки в `entries`, которая приводила к утечке отключенных стандартных навыков в системный промпт ИИ.

### English
* **Dual-Tier Skill Exclusion Architecture:**
  - Aligned the exclusion engine with internal Antigravity IDE loader semantics:
    - Default user directory (`~/.gemini/config/skills/`) is loaded via Default Global Discovery, which bypasses `entry.exclude` and strictly enforces top-level root `exclude`. Disabling skills in this path (`test_skill3`) is routed to root `exclude`.
    - Declared external skill libraries (`E:/AI/skills-global`) are loaded via Declared Configurations. Disabling skills in external libraries (`test_skill2`) is routed to `entry.exclude`, ensuring the root blacklist remains clean and allowing per-project overrides via `.agents/skills.json`.
  - Removed artificial registration of the default skills path into `entries`, preventing disabled standard skills from leaking into the AI context.

## 1.2.9

### Русский
* **Унификация исключений глобальных навыков (`ensureDefaultSkillsFolderInGlobalConfig`):**
  - Устранена аномалия раздельной записи исключений (`entries.exclude` vs корневой `exclude`): ранее навыки из внешних библиотек (`test_skill2` из `E:/AI/skills-global`) записывались в `entry.exclude`, а навыки из стандартной глобальной папки (`test_skill3` из `~/.gemini/config/skills`) попадали в корневой `exclude` из-за отсутствия стандартной папки в списке `entries`.
  - Внедрена функция `ensureDefaultSkillsFolderInGlobalConfig`: стандартная папка `~/.gemini/config/skills` теперь автоматически регистрируется как первая запись в `entries` файла `skills.json` при наличии внешних библиотек.
  - Метод `addExcludeToJsonConfig` научился автоматически привязывать навыки стандартной папки к её записи, гарантируя, что отключение ЛЮБОГО глобального навыка (`test_skill2`, `test_skill3` и др.) записывается строго и единообразно в `entry.exclude` соответствующего хранилища, оставляя корневой `exclude` чистым.

### English
* **Unified Global Skill Exclusion Engine (`ensureDefaultSkillsFolderInGlobalConfig`):**
  - Resolved the discrepancy where skills from external libraries (`test_skill2`) were written to `entry.exclude`, while default global skills (`test_skill3`) fell back to root `exclude` due to missing default directory registration in `entries`.
  - Added `ensureDefaultSkillsFolderInGlobalConfig` to auto-register `~/.gemini/config/skills` as an explicit entry in `skills.json`.
  - Enhanced `addExcludeToJsonConfig` to route exclusions for all global skills into their respective `entry.exclude`, keeping the root `exclude` clean and allowing per-project overrides for all skills.

## 1.2.8

### Русский
* **Исправление изоляции глобального отключения навыков (Entry-Level Exclude Fix):**
  - Обнаружено и устранено критическое ограничение Antigravity IDE: глобальный список `exclude` на верхнем уровне `~/.gemini/config/skills.json` работает в ядре Antigravity как абсолютный чёрный список (Blacklist), намертво блокирующий навык во всех проектах без возможности локального переопределения (`.agents/skills.json`).
  - Механизм глобального отключения навыков переведён на точечный уровень записей (`entry.exclude`): теперь при отключении глобального тумблера навык исключается только из родительской библиотеки `entries`.
  - Благодаря этому проектные переопределения (`✓ Вкл` в `.agents/skills.json`) работают штатно: навык остаётся неактивным по умолчанию для всех проектов, но гарантированно подгружается в мета-промпт агента для выбранных рабочих областей.

### English
* **Fix Skill Global Exclusion Isolation (Entry-Level Exclude Fix):**
  - Resolved an Antigravity IDE engine limitation where top-level `exclude` in `~/.gemini/config/skills.json` acted as an immutable machine-wide blacklist, preventing projects from enabling the skill via workspace `.agents/skills.json`.
  - Replaced top-level exclusion with entry-level exclusion (`entry.exclude`): disabling a shared library skill globally now suppresses it only within its specific library entry.
  - Workspace selective activation (`✓ Вкл` in `.agents/skills.json`) now reliably delivers the skill to the AI agent prompt without universal blockage.

## 1.2.7

### Русский
* **Приоритет локальных ресурсов проекта над глобальными:**
  - Изменен порядок сортировки и вывода карточек во всех списках менеджера и на дашборде «Активное»: теперь ресурсы текущего рабочего пространства (`📁 Локальные / Workspace`) всегда выводятся первыми на самом верху (начиная с карточки #1), предшествуя глобальным (`🌐 Глобальные`), встроенным (`🔷 Встроенные`) и ресурсам плагинов.
  - Изменение действует как при включенной группировке по секциям, так и в монолитном режиме списка.
* **Символы навыков в статус-баре (`📖` раскрытая книга и `📑` документ с закладками):**
  - По умолчанию установлен яркий символ раскрытой книги `📖`: `$(extensions) 1/7 | 📖 12/57 | 📜 3/5`.
  - Добавлен вариант с символом инструкции/документа с закладками `📑`: `$(extensions) 1/7 | 📑 12/57 | 📜 3/5` (`extensions_tabs`).
  - В настройки `statusBar.iconSet` добавлены опции быстрого переключения между стилями оформления.

### English
* **Workspace / Local Resources Prioritized over Global:**
  - Reordered list and active context dashboard rendering so that workspace-specific components (`📁 Workspace / Local`) are always rendered first at the top (starting from card #1) above global (`🌐 Global`), built-in, and plugin resources.
  - Applies to both grouped header mode and compact continuous stream mode.
* **Skill Status Bar Symbols (`📖` Open Book & `📑` Bookmark Tabs / Docs):**
  - Default status bar format now uses open book `📖`: `$(extensions) 1/7 | 📖 12/57 | 📜 3/5`.
  - Added new icon set option for instructions/documentation `📑` (`extensions_tabs`).
  - Expanded `statusBar.iconSet` settings for seamless customization.

## 1.2.6

### Русский
* **Устранение дублирования статистики активного контекста:**
  - Удалена избыточная нижняя текстовая полоса `.active-context-stats-bar` («Активный контекст ИИ: X правил • Y навыков...»), дублировавшая верхний крупный блок статистики.
  - Оставлен только крупный, информативный и наглядный 6-колоночный дашборд статистики с цветными карточками.

### English
* **Eliminate Duplicate Active Context Summary Strip:**
  - Removed redundant text bar `.active-context-stats-bar` ("Active AI Context: X rules • Y skills...") that duplicated the top statistics block.
  - Retained solely the clean, prominent 6-column stats dashboard card with distinct colorful counters.

## 1.2.5

### Русский
* **Исправление критического сбоя Webview (`liveContext is not defined`):**
  - Устранена фатальная ошибка `ReferenceError: liveContext is not defined` в сборщике данных `collectAllData` в `extension.js`. Ошибка блокировала отправку начальных данных в Webview при запуске расширения и приводила к пустому интерфейсу (0 активных ресурсов и «Плагины не найдены»).
  - Внедрена отказоустойчивость при чтении активного контекста (`scanIdeLiveContext`): гарантированное закрытие файловых дескрипторов в блоке `finally` (предотвращает блокировку файлов в Windows), троттлинг-кэширование повторных запросов и безопасный fallback.
* **Обновление статус-бара (`📓` блокнот и формат `$(extensions) 1/7 | 📓 12/57 | 📜 3/5`):**
  - Иконка навыков изменена на блокнот `📓` по формату: `$(extensions) 1/7 | 📓 12/57 | 📜 3/5`.
  - Подсчет ресурсов в статус-баре полностью переведен на централизованную функцию `collectAllData(context)`, обеспечивая 100% совпадение счетчиков с дашбордом и вкладками расширения (включая навыки и правила из плагинов).
  - Устранено дублирование чтения данных (`precomputedData`), сократив повторные сканирования файловой системы при обновлении интерфейса.
  - Добавлена полная русская локализация всплывающего Markdown-тултипа статус-бара и подробного формата (`detailed`).
  - Устранена неоднозначность одинаковых имен правил (например, `@AGENTS.md (Global)` и `@AGENTS.md (Project)`).
* **Исправление ошибок перемещения хуков и MCP:**
  - Устранена передача строкового пути вместо массива рабочих пространств в обработчиках `moveMcp` и `moveHook`, предотвратив некорректный перебор символов строки в `attachPluginActivationState`.

### English
* **Fix Critical Webview Crash (`liveContext is not defined`):**
  - Resolved fatal `ReferenceError: liveContext is not defined` in `collectAllData` (`extension.js`), which prevented initial data from reaching the Webview and displayed an empty manager with an error toast.
  - Hardened `scanIdeLiveContext` against file descriptor leaks via `finally` block (preventing file lock issues on Windows), added short-term throttle caching and safe fallback.
* **Status Bar Skills Icon & Format (`📓` Notebook & `$(extensions) 1/7 | 📓 12/57 | 📜 3/5`):**
  - Updated skills icon to notebook emoji `📓` matching the requested format: `$(extensions) 1/7 | 📓 12/57 | 📜 3/5`.
  - Status bar item counters now use centralized `collectAllData(context)`, ensuring exact consistency with the dashboard metrics and tab lists.
  - Eliminated redundant filesystem rescanning across webview and status bar via `precomputedData` caching.
  - Added full Russian localization for status bar Markdown tooltips and detailed display mode.
  - Disambiguated duplicate rule names in tooltips (e.g., `@AGENTS.md (Global)` vs `@AGENTS.md (Project)`).
* **Fix Hook and MCP Server Move Handlers:**
  - Fixed argument passing in `moveMcp` and `moveHook` handlers where a string was passed instead of workspace roots array, preventing character-iteration bugs in `attachPluginActivationState`.

## 1.2.4

### Русский
* **Исправление ошибки обновления (`workspaceRoots is not defined`):**
  - Устранена ошибка области видимости при обработке команд `checkUpdates` и `updatePlugin` в `extension.js`.
  - Реализован централизованный хелпер `getWorkspaceRoots()`, предотвращающий сбои поиска плагинов в рабочих пространствах.
* **Нативная иконка расширений и раскрытая книга в статус-баре:**
  - **Плагины**: используется нативная векторная иконка расширений VS Code `$(extensions)` — в точности повторяющая символ со второго скриншота пользователя (квадрат из блоков с отделяющейся плиткой).
  - **Навыки**: используется символ раскрытой книги `📖` (Open Book) — выразительное и интуитивное обозначение знаний и инструкций.
  - **Новая настройка `antigravity-plugin-manager.statusBar.iconSet`**:
    - `extensions_book` (по умолчанию): `$(extensions)` Плагины | `📖` Навыки | `📜` Правила;
    - `codicons`: нативные монохромные кодиконки VS Code `$(extensions)` | `$(book)` | `$(law)`;
    - `plug_book`: возврат классической розетки `🔌` | `📖` | `📜`;
    - `puzzle_lightbulb`: пазл `🧩` | `💡` | `📜`.
  - Тултип статус-бара теперь поддерживает нативные векторные иконки (`supportThemeIcons: true`) и адаптируется под выбранный набор иконок.

### English
* **Fix Update Error (`workspaceRoots is not defined`):**
  - Resolved scope error when executing `checkUpdates` and `updatePlugin` IPC commands in `extension.js`.
  - Added centralized `getWorkspaceRoots()` helper to safely obtain workspace folders across all backend handlers.
* **Native Extensions Icon & Open Book in Status Bar:**
  - **Plugins**: uses native VS Code codicon `$(extensions)` matching the extension puzzle tile icon requested by the user.
  - **Skills**: uses open book `📖` representing knowledge, skills, and documentation.
  - **New setting `antigravity-plugin-manager.statusBar.iconSet`**:
    - `extensions_book` (default): `$(extensions)` Plugins | `📖` Skills | `📜` Rules;
    - `codicons`: native VS Code monochrome codicons `$(extensions)` | `$(book)` | `$(law)`;
    - `plug_book`: socket plug `🔌` | `📖` | `📜`;
    - `puzzle_lightbulb`: puzzle `🧩` | `💡` | `📜`.
  - Status bar Markdown tooltip now enables native theme icons (`supportThemeIcons: true`).

## 1.2.3

### Русский
* **Движок проверки и доставки обновлений плагинов (Plugin Update Engine):**
  - **Раздельный цикл проверки и обновления**: проверка наличия новых версий и их установка разнесены на отдельные независимые действия.
  - **Кнопка проверки на тулбаре**: кнопка «Проверить обновления» со счетчиком-бейджем найденных обновлений и плавной анимацией вращения иконки.
  - **Информативные баннеры**: карточка плагина и шапка деталей плагина (Hero Card) показывают заметный баннер с версией (`v1.0.1`), ссылкой на чейнджлог и кнопкой быстрого обновления `[⚡ Обновить]`.
  - **Модальное окно обновления плагина**: отображает переход версий (`v1.0.0 ➔ v1.0.1`), ссылку на репозиторий GitHub, выбранный метод доставки и live-терминал с логами шагов выполнения.
  - **Гибридный механизм доставки через Git**:
    - Если у плагина уже есть каталог `.git`, выполняется нативный `git pull`.
    - Если плагин был скачан архивом без `.git`, выполняется клонирование `git clone --depth 1` во временную папку, аккуратное копирование файлов и каталога `.git` (превращая все будущие обновления плагина в быстрый нативный `git pull`).
    - **Сохранение локального состояния**: перед заменой файлов локальное состояние `"disabled"` из `plugin.json` сохраняется и восстанавливается, предотвращая случайное включение отключенных плагинов.
  - **Легковесная проверка без лимитов API**: запрос версии манифеста через GitHub Raw `HEAD` без требования токенов и без лимитов `api.github.com`.
  - **Настройка периодичности автопроверки**: параметр `antigravity-plugin-manager.updates.autoCheck` со значениями `startup`, `hourly`, `daily` (по умолчанию), `weekly`, `never`.
* **Редизайн статус-бара: высококонтрастные и интуитивные символы:**
  - Заменены символы статус-бара: вместо темной розетки и розового мозга используются яркие и понятные символы `🧩` (плагины / пазл — общепринятая иконка расширений), `💡` (навыки / лампочка — идеи и скилы), `📜` (правила / свиток).
  - Пример отображения по умолчанию: `🧩 1/7 | 💡 12/57 | 📜 3/5`.
  - Обновлены тултипы и конфигурационные описания.

### English
* **Plugin Update Engine & Delivery:**
  - **Separated Check & Install Flow**: checking for updates and applying them are distinct, user-controlled operations.
  - **Toolbar Check Button**: "Check Updates" button with animated spinning icon and dynamic badge showing count of available updates.
  - **Update Notification Banners**: plugin cards and plugin details hero view show a prominent update banner displaying target version (`v1.0.1`), changelog link, and quick `[⚡ Update]` action.
  - **Plugin Update Modal**: displays version diff (`v1.0.0 ➔ v1.0.1`), repository link, delivery method, and a live step-by-step progress log.
  - **Hybrid Git Delivery Engine**:
    - If plugin directory already contains `.git`, runs native `git pull`.
    - If plugin was downloaded without `.git`, clones with `git clone --depth 1` into a temporary directory, copies files including `.git` (enabling fast native `git pull` for all subsequent updates).
    - **State Preservation**: local `"disabled"` state in `plugin.json` is preserved across updates so disabled plugins remain disabled.
  - **Lightweight Check without API Rate Limits**: fetches remote `plugin.json` via GitHub Raw `HEAD` without requiring API tokens or hitting rate limits.
  - **Configurable Auto-Check Frequency**: `antigravity-plugin-manager.updates.autoCheck` setting (`startup`, `hourly`, `daily` default, `weekly`, `never`).
* **Status Bar Redesign: High-Contrast Intuitive Emojis:**
  - Replaced low-contrast plug and brain emojis with high-contrast, universally accepted symbols: `🧩` (plugins/puzzle - extensions), `💡` (skills/lightbulb - knowledge and ideas), `📜` (rules/scroll).
  - Default status bar format: `🧩 1/7 | 💡 12/57 | 📜 3/5`.

## 1.2.2

### Русский
* **Очистка заголовка карточки плагина от визуального шума:**
  - Удалена избыточная кнопка перехода `[↗]` рядом с названием плагина.
  - Нажатие на само название плагина по-прежнему открывает панель управления плагином, а кнопка копирования имени плагина аккуратно появляется при наведении курсора.
* **Редизайн статус-бара: отказ от аббревиатур и чистые эмодзи:**
  - Упразднены сокращения (`Plg`, `Skl`, `Rul`).
  - Основным форматом отображения по умолчанию стал режим чистых эмодзи (`icons`): `🔌 1/7 | 🧠 12/57 | 📜 3/5` (где 🔌 — плагины, 🧠 — навыки/знания, 📜 — правила).
  - Поддерживается выбор в настройках между `icons` (только эмодзи), `detailed` (полные слова `Plugins: 1/7 | Skills: 12/57 | Rules: 3/5`) и `compact` (только цифры `1/7 | 12/57 | 3/5`).
  - Обновлен Markdown-тултип со списками активных ресурсов под единый стиль эмодзи.

### English
* **Header Clutter Removal in Plugin Cards:**
  - Removed redundant `[↗]` navigation button from the plugin card title row.
  - Clicking the plugin title text continues to open plugin details, while the copy button appears smoothly on hover without visual noise.
* **Status Bar Redesign: No Abbreviations & Clean Emojis:**
  - Deprecated cryptic abbreviations (`Plg`, `Skl`, `Rul`).
  - Default format is now emoji-only (`icons`): `🔌 1/7 | 🧠 12/57 | 📜 3/5` (🔌 plugins, 🧠 skills/knowledge, 📜 rules).
  - Configurable formats in settings: `icons` (pure emojis), `detailed` (`Plugins: 1/7 | Skills: 12/57 | Rules: 3/5`), and `compact` (`1/7 | 12/57 | 3/5`).
  - Updated Markdown tooltip to match the unified emoji set across active context lists.

## 1.2.1

### Русский
* **Открытие файлов во вкладке рядом с менеджером (Editor Tab Adjacent Opening):**
  - При нажатии «Открыть в редакторе» файл теперь открывается в активной группе редактора (`ViewColumn.Active`) обычной соседней вкладкой, без нежелательного вертикального разрезания экрана (`ViewColumn.Beside`).
  - Добавлена пользовательская настройка `antigravity-plugin-manager.editorOpenColumn` со значениями `"active"` (по умолчанию) и `"beside"`.
* **Унификация действий карточек и кнопки копирования (Card Controls & Name/Tag Copy Buttons):**
  - **Карточки плагинов**: верхние кнопки приведены к стандарту навыков — `[📄 Open plugin.json]` и `[📁 Open Folder]`.
  - Кнопка перехода к деталям плагина (`↗`) перемещена в заголовок карточки рядом с именем плагина.
  - В заголовок карточки плагина добавлена кнопка копирования имени плагина: порядок элементов `[#номер] [Название] [↗ Детали] [📋 Копировать]`.
  - **Карточки правил**: добавлена кнопка копирования контекстного тега `@имяфайла` (`@ruleTag`) в карточках правил и в деталях плагина для быстрой вставки правил в Antigravity Chat.
  - Оптимизированы стили `.card-nav-details-btn` и видимость `.copy-name-btn` при наведении курсора на карточку.
* **Расширенный статус-бар со счетчиками навыков и правил (Multi-Resource Status Bar & Markdown Tooltip):**
  - Статус-бар теперь отображает сводку по плагинам, навыкам и правилам на английском языке: например, `Plg: 1/7 | Skl: 12/57 | Rul: 3/5`.
  - Добавлены настройки конфигурации:
    - `antigravity-plugin-manager.statusBar.showSkills`: отображать счетчик навыков (по умолчанию `true`).
    - `antigravity-plugin-manager.statusBar.showRules`: отображать счетчик правил (по умолчанию `true`).
    - `antigravity-plugin-manager.statusBar.format`: формат отображения (`"short"`: `Plg: 1/7 | Skl: 12/57 | Rul: 3/5`, `"detailed"`: `Plugins: 1/7 | Skills: 12/57 | Rules: 3/5`, `"compact"`: `1/7 | 12/57 | 3/5`).
  - Информативный Markdown-тултип при наведении со списками активных плагинов, навыков, правил и быстрой ссылкой на открытие менеджера.

### English
* **Editor Tab Adjacent Opening (`editorOpenColumn`):**
  - Clicking "Open in Editor" now opens files inside the active editor group (`ViewColumn.Active`) alongside the manager tab, preventing unwanted split-screen columns (`ViewColumn.Beside`).
  - Added setting `antigravity-plugin-manager.editorOpenColumn` (`"active"` by default, `"beside"` optional).
* **Card Controls Unification & Name/Tag Copy Buttons:**
  - **Plugin Cards**: unified top-level action buttons with skill cards to `[📄 Open plugin.json]` and `[📁 Open Folder]`.
  - The plugin details navigation icon (`↗`) moved to the card title row.
  - Added copy button to plugin card headers: layout `[#idx] [Title] [↗ Details] [📋 Copy]`.
  - **Rule Cards**: added copy button for context tag `@filename` (`@ruleTag`) in rule cards and plugin details view for direct pasting into Antigravity Chat.
  - Enhanced `.card-nav-details-btn` styling and hover visibility for `.copy-name-btn`.
* **Multi-Resource Status Bar & Rich Tooltip:**
  - Status bar now shows a combined tally for plugins, skills, and rules: e.g. `Plg: 1/7 | Skl: 12/57 | Rul: 3/5`.
  - Added configuration options:
    - `antigravity-plugin-manager.statusBar.showSkills` (default `true`).
    - `antigravity-plugin-manager.statusBar.showRules` (default `true`).
    - `antigravity-plugin-manager.statusBar.format` (`"short"`, `"detailed"`, `"compact"`).
  - Rich interactive Markdown tooltip listing all active plugins, skills, and rules with one-click manager activation.

## 1.2.0

### Русский
* **Тройная синхронизация отключения плагинов (Triple-Layer Plugin Exclusion Engine):**
  - При отключении плагина тумблером в менеджере состояние теперь синхронизируется на всех 3 системных уровнях:
    1. Манифест плагина: `"disabled": true` в `plugin.json` (интерфейс настроек Antigravity IDE).
    2. Конфигурация десктопа: `"enabled": false` в `~/.gemini/config/config.json` (Antigravity Desktop 2.0 и CLI).
    3. Системный список исключений: имя и идентификатор плагина добавляются в массив `"exclude"` в `~/.gemini/config/plugins.json` (Customization System).
  - Это предотвращает любые ситуации рассинхронизации внешних плагинов и гарантирует, что сканер IDE исключает плагины на самом раннем этапе обхода директорий.
* **Исправление параметров сканирования плагинов:**
  - В `scanPlugins` добавлен fallback на `getActivePluginsPath()`, устраняющий предупреждение deprecation в среде Node.js при вызовах без аргументов.
  - Массив глобальных исключений `plugins.json.exclude` теперь пробрасывается в `scanPluginsInDirectory` для внешних каталогов.

### English
* **Triple-Layer Plugin Exclusion Engine:**
  - When disabling a plugin via the manager, status is now synchronized across all 3 system layers:
    1. Plugin manifest: `"disabled": true` in `plugin.json` (Antigravity IDE settings UI).
    2. Desktop configuration: `"enabled": false` in `~/.gemini/config/config.json` (Antigravity Desktop 2.0 & CLI).
    3. System exclusion list: plugin directory name and ID are added to the `"exclude"` array in `~/.gemini/config/plugins.json` (Customization System).
  - Ensures external plugins are cleanly omitted by the scanner at the earliest directory walk stage.
* **Plugin Scanner Parameter Handling:**
  - Added fallback to `getActivePluginsPath()` in `scanPlugins` to prevent deprecation warnings on Node.js when invoked without arguments.
  - Forwarded top-level `plugins.json.exclude` array into `scanPluginsInDirectory` for configured external directories.

## 1.1.9

### Русский
* **Автоматическое сохранение дефолтных плагинов при внешних репозиториях (Default Plugins Preservation):**
  - **Устранено затенение папки `~/.gemini/config/plugins`**: в Antigravity IDE обнаружено фундаментальное поведение сканера — при наличии хотя бы одной записи во внешнем `plugins.json` (например, `E:/AI/plugins`), IDE перестает неявно сканировать стандартную директорию `~/.gemini/config/plugins`. Из-за этого плагины `science`, `google-antigravity-sdk`, `android-cli-plugin`, `biz`, `firebase` становились невидимыми для ИИ.
  - Менеджер плагинов теперь **автоматически гарантирует**, что путь к `~/.gemini/config/plugins` всегда включен в `plugins.json.entries` при подключении внешних папок, обеспечивая одновременную видимость как стандартных, так и внешних плагинов (`securecoder`).
  - В строке подключенных хранилищ дефолтная папка скрыта из списка чипов, исключая случайное удаление пользователем.
* **Сброс таймера обратного отсчета при нажатии «Мягко применить» (Soft Apply Countdown Reset):**
  - При клике на `[⚡ Мягко применить]` интервал посекундного таймера в UI немедленно сбрасывается, а оставшееся время обнуляется.
  - Устранена перезапись статуса старым таймером (например, `~2м 01с`) через 1 секунду после клика.
  - В бэкенде отменяются все отложенные таймеры сканера (`ideFlushTimer`, `ideFlushSettledTimer`), а плашка переходит в статус `✓ IDE синхронизирована`.

### English
* **Default Plugins Preservation in `plugins.json`:**
  - **Fixed `~/.gemini/config/plugins` Shadowing**: when an external plugin repository (e.g. `E:/AI/plugins`) is configured in `plugins.json`, Antigravity IDE's scanner switches strictly to scanning `plugins.json.entries` and stops discovering plugins in `~/.gemini/config/plugins`. This caused `science`, `google-antigravity-sdk`, `android-cli`, `biz`, and `firebase` to become invisible to the AI.
  - The manager now **automatically guarantees** that `~/.gemini/config/plugins` is maintained in `plugins.json.entries` whenever external folders exist, ensuring all plugins are permanently visible.
  - The default global folder is cleanly filtered from the connected repository chips UI to prevent accidental deletion.
* **Soft Apply Countdown Timer Reset:**
  - Clicking `[⚡ Soft Apply]` immediately terminates the UI countdown interval and resets remaining milliseconds to 0.
  - Prevents the countdown from jumping back to the old remaining time (e.g. `~2m 01s`) 1 second later.
  - Background pending flush timers in the extension backend are immediately cancelled, cleanly transitioning status to `✓ IDE Synced`.

## 1.1.8

### Русский
* **Неблокирующее переключение и автовосстановление интерфейса (Non-blocking Toggles & Auto-Recovery):**
  - **Устранена глобальная блокировка чеклиста**: удалена блокировка всех переключателей (`cb.disabled = true`), переключение любого плагина или навыка теперь полностью независимо и не блокирует взаимодействие с остальными карточками.
  - **Автоматический таймер восстановления (Fail-safe Recovery Timer)**: если бэкенд или Language Server задерживают ответ более чем на 2.5 секунды, локальный спиннер загрузки автоматически скрывается, а тумблер возвращается в интерактивное состояние без зависаний.
  - **Кнопки действий (папки, редактор, перенос, удаление)** всегда остаются 100% кликабельными независимо от статуса фоновой синхронизации.
  - **Изоляция ошибок рендеринга**: вызовы отрисовки в `case 'init'` обернуты в индивидуальные блоки перехвата ошибок, предотвращая сбои рендеринга при поврежденных или внешних конфигурациях.
  - **Двойная синхронизация манифестов внешних плагинов**: при переключении плагинов из `plugins.json` статус активности пишется в `config.json` как по имени каталога (`Google.securecoder.securecoder`), так и по внутреннему имени манифеста (`securecoder`).
* **Устранение наложения элементов в шапке (Header Layout Collision Fix):**
  - **Выделенная полоса статуса синхронизации (`.sync-status-strip`)**: бейдж статуса IDE с таймером обратного отсчета, кнопкой `[⚡ Мягко применить]` и инспектором `👁` вынесен в отдельную строку над тулбаром действий, исключая наложение на кнопки управления.
  - **Адаптивный тулбар (`.nav-controls-row`)**: добавлен перенос строк (`flex-wrap: wrap`) и медиа-правила для узких панелей, гарантирующие идеальное отображение на экранах любой ширины.

### English
* **Non-blocking Toggles & Fail-Safe Auto-Recovery:**
  - **Removed Global Checkbox Lockout**: eliminated global `cb.disabled = true` assignment on toggle. Switching one plugin or skill no longer freezes or locks any other cards in the interface.
  - **Fail-safe Recovery Timer**: if the backend or Language Server delays its response beyond 2.5 seconds, the item's local loading spinner automatically disappears and the toggle cleanly recovers without hanging.
  - **Card Action Buttons** (open folder, open in editor, move, delete) remain 100% responsive and clickable at all times.
  - **Render Fault Isolation**: individual render calls inside `case 'init'` are safely guarded to ensure an issue in one block cannot interrupt main tab rendering.
  - **Dual Sync for External Plugin Manifests**: toggling plugins configured in `plugins.json` writes to `config.json` using both the physical directory name and manifest `name` field.
* **Header Layout Collision Fix:**
  - **Dedicated Sync Status Strip (`.sync-status-strip`)**: moved the live countdown sync badge, `[⚡ Soft Apply]` button, and `👁` Live Context Inspector into a dedicated notification bar above toolbar controls, preventing any overlapping.
  - **Responsive Controls Toolbar (`.nav-controls-row`)**: enabled graceful wrapping (`flex-wrap: wrap`) and updated narrow-width media queries for compact sidebars.

## 1.1.7

### Русский
* **Мягкое применение и перезапуск Language Server без закрытия чата (Soft Apply Engine):**
  - Реализована функция «Мягкого применения» через внутреннюю команду `antigravity.restartLanguageServer`.
  - При переключении тяжелых плагинов с десятками навыков (например, `science` с 42 навыками) позволяет мгновенно применить конфигурацию без ожидания 2-минутного низкоприоритетного фонового сканера.
  - **Открытый чат и окно редактора НЕ закрываются и не сбрасываются**: фоновый Go-сервер (`language_server_windows_x64.exe`) тихо перезапускается за 1.5 секунды, сохраняя фокус, историю и контекст диалога.
  - Кнопка **`[⚡ Мягко применить]`** добавлена прямо в бейдж синхронизации в липкой шапке и в тулбар менеджера, а также зарегистрирована как команда палитры `antigravity-plugin-manager.softApply`.
* **Инспектор реального контекста ИИ (Live Context Inspector):**
  - Создан парсер активной базы диалогов IDE `~/.gemini/antigravity-ide/conversations/*.db` (`gen_metadata`).
  - По клику на иконку глаза `👁` на бейдже синхронизации открывается модальное окно **«Контекст ИИ (Live)»**, отображающее:
    - ID активного диалога и точное время последнего запроса;
    - Количество навыков, реально переданных в нейросеть;
    - Список плагинов со статусом: `✓ В контексте` (уже в промпте ИИ) или `⏳ Индексируется...` (ожидает попадания в системный промпт).
* **Динамический бейдж синхронизации с таймером обратного отсчета (Dynamic Indexing ETA):**
  - Расчет точного расчетного времени индексации на основе количества навыков в переключаемых плагинах (`Math.round(2000 + skillsCount * 3000)ms`).
  - Живой посекундный обратный отсчет: `IDE: ~2м 08с (42 навыка)` vs `IDE: ~4с`.
  - По завершении плавно сменяется на зеленый бейдж `✓ IDE синхронизирована`.
* **Защита от спама и пакетная обработка (Debounced Flush Engine):**
  - Дебаунс 600 мс при быстрых переключениях нескольких тумблеров подряд объединяет файловые операции в один чистый батч, исключая спам вотчеров и блокировку сканера.

### English
* **Soft Apply & Language Server Restart Without Closing Active Chat:**
  - Implemented the "Soft Apply" engine leveraging native `antigravity.restartLanguageServer`.
  - When toggling heavy plugins containing dozens of skills (e.g. `science` with 42 skills), allows users to instantly apply changes without waiting through the 2-minute low-priority background scan.
  - **The active chat UI and editor window DO NOT close or reset**: the background Go language server process (`language_server_windows_x64.exe`) softly restarts in ~1.5 seconds, preserving dialog focus, open chats, and active state.
  - Added **`[⚡ Soft Apply]`** button directly into the sticky sync badge, toolbar, and registered as palette command `antigravity-plugin-manager.softApply`.
* **AI Live Context Inspector:**
  - Built a zero-dependency parser reading the active IDE conversation database `~/.gemini/antigravity-ide/conversations/*.db` (`gen_metadata`).
  - Clicking the `👁` icon on the sync badge opens the **"AI Live Context"** modal displaying:
    - Active conversation ID and last prompt timestamp;
    - Count of skills actually committed to the AI system prompt;
    - Chip list of plugins with live status: `✓ In context` or `⏳ Indexing...`.
* **Dynamic Indexing ETA Badge with Live Countdown:**
  - Accurate indexing time calculation based on skill count (`Math.round(2000 + skillsCount * 3000)ms`).
  - Live second-by-second countdown: `IDE: ~2m 08s (42 skills)` vs `IDE: ~4s`.
  - Transitions to emerald `✓ IDE synced` on completion.
* **Debounced Flush Engine & Anti-Spam Protection:**
  - 600ms debounce during rapid toggling groups multiple updates into a single batch, preventing watcher event storms and scanner freeze.

## 1.1.6

### Русский
* **Принудительная синхронизация сканера Antigravity IDE (IDE Scanner Flush & Watcher Sync):**
  - Реализован механизм `triggerIdeScannerFlush()` и вспомогательная функция `touchAntigravityConfigs()`.
  - При любых мутациях (переключение глобального/проектного статуса, перенос папок, создание или удаление компонентов, подключение хранилищ) и при нажатии кнопки `[↻ Обновить]` расширение точечно обновляет `mtime`/`atime` конфигураций `config.json`, `plugins.json`, `skills.json` (а также проектных файлов в `.agents/`).
  - Вызывается встроенная команда `workbench.files.action.refreshFilesExplorer`, синхронизирующая файловый сервис IDE и помогающая фоновому языковому серверу Antigravity мгновенно зафиксировать изменения без длительного ожидания окна дебаунса после массовых файловых операций.

### English
* **Antigravity IDE Scanner Flush & File Watcher Sync:**
  - Implemented `triggerIdeScannerFlush()` mechanism and `touchAntigravityConfigs()` helper.
  - On any mutation (toggling global/project status, moving folders, creating/deleting items, connecting repositories) and on clicking `[↻ Refresh]`, the extension touches `mtime`/`atime` of `config.json`, `plugins.json`, `skills.json` (and project `.agents/*.json` configs).
  - Triggers `workbench.files.action.refreshFilesExplorer` to force VS Code's internal file service to sync, eliminating file watcher debounce lag after folder moves.

## 1.1.5

### Русский
* **Абсолютная фиксация навигационной панели без микродвижений (Zero-Gap Sticky Header):**
  - Добавлен отрицательный отступ `margin-top: -16px;` и сбалансированный `padding: 10px 16px;`, благодаря чему навигационная панель `.sticky-nav-header` плотно прилегает к верхнему краю экрана (`top: 0`) даже в самом начале скролла (`scrollY === 0`).
  - Полностью устранен микросдвиг в 16px при переходе между деталями плагина и верхними вкладками.
* **Сворачиваемый блок «Хранилища и конфигурации» (Collapsible Storage & Repositories Bar):**
  - Верхний блок управления хранилищами (`#config-repos-section`) снабжен интерактивной шапкой и анимированным шевроном (`▼`), позволяющим сворачивать всю секцию в 1 клик.
  - Состояние сворачивания сохраняется при переключении между вкладками.
  - В свернутом виде список активных плагинов и статистика контекста отображаются непосредственно под закрепленной навигационной панелью без необходимости прокрутки.
* **Фильтрация и поиск внутри деталей плагина:**
  - Поисковая строка навигации теперь динамически фильтрует компоненты (навыки, правила, воркфлоу, MCP, хуки) прямо внутри окна деталей выбранного плагина.

### English
* **Zero-Gap Sticky Header & Micro-Shift Elimination:**
  - Added `margin-top: -16px;` and balanced `padding: 10px 16px;` to `.sticky-nav-header`, ensuring it is flush against the top edge of the window (`top: 0`) even at `scrollY === 0`.
  - Completely eliminated the 16px micro-shift when transitioning between plugin details and top-level tabs.
* **Collapsible Storage & Repositories Bar:**
  - Added an interactive header with an animated chevron (`▼`) to `#config-repos-section`, enabling 1-click collapse of the entire storage block.
  - Collapse state is preserved across tab navigation and refreshes.
  - When collapsed, the active plugins list and context stats are immediately visible right below the navigation bar without scrolling.
* **Dynamic Search inside Plugin Details:**
  - The sticky search bar now dynamically filters internal components (skills, rules, workflows, MCP servers, hooks) inside plugin details in real time.

## 1.1.4

### Русский
* **Двухуровневая панель «Хранилища и конфигурации» (Scoped Storage & Configs Bar):**
  - Панель хранилищ разделена на два четких изолированных блока: **Глобальный уровень (`~/.gemini`)** и **Рабочая область проекта (`.agents`)**.
  - Внутри каждого блока кнопки структурированы по отдельным строкам: «Конфиги (JSON)» и «Папки», что полностью устранило хаотичный перенос строк.
  - Добавлены явные кнопки подключения папок в заголовках каждого блока: `+ 🔌 Папка плагинов` и `+ ⚡ Папка навыков` (глобально), а также `+ 🔌 В проект: Плагины` и `+ ⚡ В проект: Навыки` (для рабочего проекта). Целевой скоуп определяется заранее кликом по нужной кнопке, без неожиданных всплывающих модальных окон QuickPick.
  - Добавлена возможность прямого просмотра и редактирования файлов конфигурации открытого проекта (`<wsRoot>/.agents/plugins.json` и `<wsRoot>/.agents/skills.json`) с автоинициализацией пустого шаблона, а также кнопка открытия папки `.agents`.
  - Модернизированы чипсы подключенных внешних хранилищ: они теперь разделены на 2 отдельные независимые секции — глобальные папки выводятся строго внутри глобального блока, а проектные — внутри блока «Рабочая область проекта» (с автофильтрацией по выбранному проекту). Чипсы имеют лаконичный вид, цветные бейджи скоупа (`🌐 Global` / `📁 Project`), иконку типа (`🔌` / `⚡`), имя папки, путь в подсказке и безопасное отключение (`×`).
* **Унифицированная навигационная панель с нулевым сдвигом (Zero-Shift Sticky Nav & Unified 3-Row Layout):**
  - Панель навигации (`.sticky-nav-header`) размещена самым первым элементом страницы и постоянно закреплена вверху (`position: sticky; top: 0; z-index: 150;`) с размытием фона (`backdrop-filter: blur(16px)`).
  - Сформирована строгая 3-рядная компоновка, идентичная как в основном виде, так и внутри деталей плагина:
    - **Ряд 1**: Вкладки разделов слева (`Активное`, `Правила`, `Навыки`, `Плагины`, `Воркфлоу`, `MCP`, `Хуки`) + компактный выбор языка справа.
    - **Ряд 2**: Кнопка возврата `[← Назад]` (в деталях) + заголовок раздела + кнопки управления (`[В 1 колонку]`, `[Подробно]`, `[Группировка]`, `[↻ Обновить]`, `[+ Создать]`).
    - **Ряд 3**: Поисковая строка постоянной высоты, фильтрующая текущую вкладку или ресурсы внутри выбранного плагина.
  - Полностью исключены любые вертикальные сдвиги и прыжки высоты интерфейса при навигации между вкладками и переходе в детали плагинов.
  - Панель хранилищ (`#main-view-top`) размещена под закрепленной шапкой и отображается строго на стартовой вкладке «Активное».
* **Устранение дублирования названия в деталях плагина (Plugin Hero Card & Single Title Standard):**
  - Если отображаемое имя плагина совпадает с его идентификатором (`displayName === id`), дублирующий чип ID скрывается.
  - Кнопка копирования идентификатора аккуратно интегрирована в строку заголовка рядом с именем и плавно проявляется при наведении, обеспечивая быстрое копирование в буфер обмена с мгновенной обратной связью (зеленая галочка).
* **Единый стандартизированный индикатор статуса и 3-уровневый блок кнопок карточек (Zero-Shift Layout & 3-Tier Controls):**
  - Индикатор активности со светящейся точкой (`Включен`, `Отключен`, `Вкл (проект)`, `Выкл (проект)`) и интерактивным знаком вопроса `(?)` вынесен в отдельную строку подзаголовка строго под названием ресурса.
  - Полностью исключены визуальные сдвиги высоты и скачки кнопок под курсором при любых изменениях статуса.
  - Реализован 3-уровневый блок кнопок «сэндвич»: Уровень 1 (Верх — просмотр), Уровень 2 (Центр — широкий тумблер), Уровень 3 (Низ — мутации: переместить и удалить).
* **Физическое перемещение между внешними репозиториями:**
  - Кнопка перемещения `→` теперь поддерживает перенос ресурсов между стандартными папками, всеми подключенными внешними хранилищами (`E:\AI\plugins`, `E:\AI\skills-global`) и рабочими областями.

### English
* **Scoped Storage & Configs Bar Redesign:**
  - Redesigned the top storage bar into two dedicated, clean scope blocks: **Global (`~/.gemini`)** and **Project Workspace (`.agents`)**.
  - Separated action buttons into distinct rows: "Configs (JSON)" and "Folders", eliminating awkward multi-line wrapping.
  - Added explicit connect buttons right in the headers of each block: `+ 🔌 Plugins Folder` and `+ ⚡ Skills Folder` (Global), and `+ 🔌 Plugins to Project` and `+ ⚡ Skills to Project` (Workspace). Target scope is chosen upfront without surprising mid-flow QuickPicks.
  - Added direct inspection and opening of workspace project configs (`<wsRoot>/.agents/plugins.json` and `<wsRoot>/.agents/skills.json`) with automatic scaffold creation, as well as an `.agents` folder explorer button.
  - Separated connected repositories into 2 distinct sections: globally connected folders appear directly inside the Global block, while workspace connected folders appear inside the Project Workspace block (auto-filtered by the active project). Modernized chip design with color-coded scope badges, type icons (`🔌` / `⚡`), folder name, and 1-click disconnect (`×`).
* **Zero-Shift Sticky Navigation Header & Unified 3-Row Layout:**
  - Pinned `.sticky-nav-header` permanently at `top: 0` as the very first child of the interface container (`position: sticky; top: 0; z-index: 150;`) with background blur (`backdrop-filter: blur(16px)`).
  - Unified into an identical 3-row layout in both Main View and Plugin Details View:
    - **Row 1**: Category tabs on left + language selector on right.
    - **Row 2**: Back button `[← Back]` (in details) + section title + controls (`[1 Column]`, `[Detailed]`, `[Grouping]`, `[↻ Refresh]`, `[+ Create]`).
    - **Row 3**: Search box with constant height that filters current tab or resources inside the active plugin.
  - Completely eliminated any vertical layout shifts or jumping when switching tabs or opening/exiting plugin details.
  - Top storage bar (`#main-view-top`) is positioned below the sticky header and shown strictly on the initial "Active" dashboard tab.
* **Plugin Hero Card Single Title & Copy Button:**
  - Eliminated duplicate title printing in the hero card when `displayName === id`.
  - Copy button smoothly appears on hover next to the title with 1-click clipboard copy and emerald checkmark feedback.
* **Unified Status Indicator & 3-Tier Card Controls (Zero-Shift Layout):**
  - Relocated the status indicator pill (`Active`, `Disabled`, `Project: On`, `Project: Off`) with tooltip `(?)` into a dedicated subtitle row directly below the item title.
  - Completely eliminated card height jumps and UI layout shifts when toggling statuses.
  - Re-introduced safe 3-tier button layout: Tier 1 (Top — inspect), Tier 2 (Middle — wide toggle), Tier 3 (Bottom — mutate: move and delete).
* **Cross-Repository Physical Movement:**
  - Move button `→` now supports migrating plugins and skills seamlessly across standard storage, all connected custom folders (e.g. `E:\AI\plugins`, `E:\AI\skills-global`), and workspace projects.

## 1.1.3

### Русский
* **Устранение дубликатов карточек плагинов и синхронного переключения:**
  - Устранена проблема, когда плагин отображался дважды (например, `android-cli-plugin`), из-за чего переключение тумблера влияло сразу на обе карточки.
  - Добавлена сквозная дедупликация путей между глобальными, встроенными и локальными ресурсами: если плагин или навык уже присутствует в глобальных списках и подключен в `.agents/plugins.json` / `skills.json`, он не дублируется в виде отдельной карточки, а корректно отображает статус переопределения для открытого проекта.
* **Очистка описаний навыков от системных HTML-комментариев (`<!-- disableFinding(...) -->`):**
  - Обновлен парсер frontmatter: теперь он корректно находит блок `---`, даже если в начале файла присутствуют директивы линтера в HTML-комментариях.
  - Все HTML-комментарии автоматически удаляются из описаний и заголовков навыков, гарантируя вывод чистого описания.
* **Понятные статусы и переопределения для текущего проекта (Project Overrides):**
  - Вместо неинформативной надписи «В проекте: По умолчанию» теперь отображается интерактивная кнопка с 3 явными состояниями:
    1. `В проекте: По умолчанию (Вкл/Выкл)` — проект наследует общий статус (нажатие задает переопределение для этого проекта).
    2. `✓ В проекте: Включен [↺]` — принудительно включен только для текущего проекта (нажатие `↺` сбрасывает на значение по умолчанию).
    3. `✕ В проекте: Отключен [↺]` — принудительно отключен только для текущего проекта (нажатие `↺` сбрасывает на значение по умолчанию).
  - Исправлены аргументы IPC команд `togglePluginProject` и `toggleSkillProject`, благодаря чему переопределения теперь надежно записываются в `.agents/plugins.json` и `.agents/skills.json`.
* **Явное отображение расположения хранилищ плагинов и навыков:**
  - Карточки ресурсов теперь четко показывают, где именно расположен ресурс: стандартное глобальное хранилище (`Global (~/.gemini)`), подключенная внешняя папка (`📁 <имя_папки>`) или проект рабочей области (`.agents`).
  - Исправлены чипсы подключенных хранилищ на верхней панели: теперь отображаются реальные имена папок (например, `skills-global`, `plugins`), а кнопка `×` корректно отключает выбранное хранилище.

### English
* **Deduplication of Plugin Cards & State Sync Fix:**
  - Fixed issue where plugins appeared duplicated (e.g. `android-cli-plugin`) and toggling one caused both cards to switch.
  - Implemented end-to-end path deduplication: resources declared in workspace `plugins.json` / `skills.json` that point to global items no longer duplicate cards, cleanly displaying the project override status instead.
* **Clean Skill Descriptions (Stripping `<!-- disableFinding(...) -->` Comments):**
  - Updated frontmatter parser to locate `---` even with leading HTML comments or linter directives.
  - Stripped all HTML comments from parsed titles and descriptions, displaying clean text in cards.
* **Intuitive 3-State Project Override Controls:**
  - Replaced ambiguous "Project: Inherit" label with an actionable 3-state control:
    1. `In Project: Default (On/Off)` — inherits global state (click overrides for this workspace).
    2. `✓ In Project: On [↺]` — custom workspace enable (click `↺` resets to default).
    3. `✕ In Project: Off [↺]` — custom workspace disable (click `↺` resets to default).
  - Fixed IPC argument routing for `togglePluginProject` and `toggleSkillProject`.
* **Clear Repository & Location Indicators:**
  - Resource cards now clearly distinguish whether an item is located in standard global storage (`Global (~/.gemini)`), a custom connected external directory (`📁 <folder>`), or workspace `.agents`.
  - Fixed connected folder chips at top to show actual folder names and enable 1-click disconnect (`×`).

## 1.1.2

### Русский
* **Корректное обнаружение и отображение навыков (`test_skill1`, `test_skill2` и др.):**
  - Устранена проблема пропажи навыков из списков при добавлении их в `exclude` конфигураций: теперь отключенные навыки корректно сканируются и отображаются с неактивным тумблером (`isEnabled: false`), а не скрываются из интерфейса.
  - Исправлен алгоритм сопоставления шаблонов `isPatternMatch`: заменено нестрогое регулярное выражение на точное сравнение и якоря границ слова (`^...$`), что исключило ложные срабатывания отключения схожих имен (например, `test_skill` больше не деактивирует `test_skill2` или `test_skill3`).
  - Синхронизировано переключение активности навыков как по имени директории, так и по названию из манифеста `SKILL.md`.
* **Исправление парсинга многострочных описаний YAML (`>-`, `|-`):**
  - Добавлена полноценная поддержка блочных скаляров YAML с модификаторами (`>-`, `>+`, `|-`, `|+`) и отступами в frontmatter `SKILL.md`.
  - Устранена ошибка, из-за которой вместо описания отображалась черточка `>-` или пустое поле.
* **Редизайн активных плагинов во вкладке «Активное»:**
  - Убрана тесная плашка с чипсами и непонятными крестиками.
  - Активные плагины теперь выводятся в виде полноценного сворачиваемого блока карточек (как и остальные категории: навыки, воркфлоу, MCP, хуки) со стандартным тумблером включения/выключения, кнопками открытия папки, переходом в детали и метаданными.
* **Исправление верстки кнопок карточек ресурсов:**
  - Удалена деформированная круглая кнопка с текстом плагина из нижней строки карточки (`card-actions-bottom`), приводившая к наложению элементов.
  - Переход к родительскому плагину осуществляется через аккуратный кликабельный бейдж и кнопку в панели действий.

### English
* **Accurate Discovery & State Resolution for Skills (`test_skill1`, `test_skill2`, etc.):**
  - Fixed an issue where skills placed in `exclude` lists of `skills.json` completely disappeared from UI; they are now scanned properly with `isEnabled: false` and displayed with an inactive toggle.
  - Improved `isPatternMatch` with strict equality and anchored patterns (`^...$`), preventing false-positive disables of similarly named skills (e.g. `test_skill` no longer deactivates `test_skill2` or `test_skill3`).
  - Synchronized toggle logic to remove both folder name and frontmatter name from exclude lists when turning a skill back on.
* **Multi-line YAML Frontmatter Description Support (`>-`, `|-`):**
  - Added support for folded and literal YAML block scalars with chomping indicators (`>-`, `>+`, `|-`, `|+`) and indented lines in `SKILL.md` frontmatter.
  - Fixed bug where descriptions would show literally as `>-` or remain empty.
* **Redesigned Active Plugins in "Active" Tab:**
  - Replaced the cramped chip bar with a full-fledged collapsible card section matching all other categories.
  - Active plugins now have standard cards with toggle switches, folder open buttons, details view, and tags.
* **Fixed Resource Card Action Button Overlaps:**
  - Removed squished text buttons from `.card-actions-bottom` that broke the circular button styling.
  - Navigation to parent plugins is cleanly handled via the metadata badge and action button.

## 1.1.1

### Русский
* **Нативная синхронизация с Antigravity IDE:**
  - Реализована синхронизация статуса плагинов с нативным переключателем Antigravity IDE (Settings -> Customizations -> Plugins).
  - Чтение статуса активности плагинов переведено на манифест `plugin.json` (`"disabled": true/false`), который является источником истины для Antigravity IDE.
  - При переключении тумблера плагина статус записывается одновременно в `plugin.json` (для мгновенного применения в IDE) и в `~/.gemini/config/config.json` (для десктопного приложения Antigravity 2.0).

### English
* **Native Synchronization with Antigravity IDE:**
  - Synchronized plugin states with Antigravity IDE's native Customizations switch (Settings -> Customizations -> Plugins).
  - Plugin activation status is now read directly from `plugin.json` (`"disabled": true/false`), matching Antigravity IDE's engine.
  - When toggling a plugin, the status is written to both `plugin.json` (for instant IDE application) and `config.json` (for Antigravity 2.0 desktop app).

## 1.1.0

### Русский
* **Кек: в Antigravity есть нативный способ включения/выключения плагинов!**
  - Полностью устранены костыли с физическим перемещением каталогов в `plugins_storage` и созданием NTFS Junctions.
  - Теперь управление активностью плагинов происходит через нативный конфигурационный файл Antigravity `~/.gemini/config/config.json` (`"plugins": { "<name>": { "enabled": true/false } }`). Каталоги плагинов всегда остаются на своих местах.
  - Реализована автоматическая миграция: ранее отключенные плагины из `plugins_storage` бережно возвращены в `~/.gemini/config/plugins/` с сохранением статуса выключения в `config.json`.
* **Подключение внешних репозиториев и папок (Custom Repositories):**
  - Поддержка внешних каталогов плагинов через `~/.gemini/config/plugins.json` и `<workspaceRoot>/.agents/plugins.json`.
  - Поддержка внешних каталогов навыков через `~/.gemini/config/skills.json` (например, `E:/AI/skills-global`) и `<workspaceRoot>/.agents/skills.json`.
  - Кнопка «Подключить папку...» (`+ Connect Folder`) в верхней панели интерфейса для быстрого добавления новых директорий плагинов или навыков в один клик.
  - Чипсы всех подключенных хранилищ с возможностью быстрого отключения (`×`).
* **Гибкие переопределения для проектов (Project Overrides):**
  - Возможность включить глобально отключенный плагин для конкретного проекта через `.agents/plugins.json`, либо исключить его для текущего проекта.
  - Переключение активности навыков через декларативные списки `exclude: [...]` в `skills.json` — больше никакого переименования `SKILL.md` ↔ `.disabled`, что исключает поломку навыков в параллельных проектах.
  - Возможность точечно подключить нужный навык к 1–2 проектам через `entries` в `.agents/skills.json`.
* **Расширенное перемещение ресурсов (`→` Move Engine):**
  - Функция физического перемещения сохранена и существенно расширена: теперь можно свободно переносить плагины и навыки между стандартными каталогами, подключенными внешними хранилищами (`skills.json`/`plugins.json`), проектами рабочей области и плагинами (`<plugin>/skills/`).
* **Панель конфигураций и прямого доступа:**
  - Кнопки быстрого открытия `config.json`, `plugins.json`, `skills.json` и системной папки плагинов прямо в редакторе IDE.

### English
* **Native Antigravity Configuration Engine (No more folder-moving hacks!):**
  - Replaced the legacy NTFS junction and storage-moving mechanism with Antigravity's native configuration system in `~/.gemini/config/config.json` (`"plugins": { "<name>": { "enabled": true/false } }`).
  - Automatic migration on startup: disabled plugins are safely restored to `~/.gemini/config/plugins/` with disabled state preserved in `config.json`.
* **Custom Repositories & Connected Folders:**
  - Full discovery and scanning of custom directories defined in `~/.gemini/config/plugins.json` and `.agents/plugins.json`.
  - Full discovery and scanning of custom skill directories in `~/.gemini/config/skills.json` and `.agents/skills.json`.
  - New "Connect Folder..." action to link external repositories globally or per workspace with a single click.
  - Connected repository chips with 1-click disconnect (`×`).
* **Project Overrides & Selective Enablement:**
  - Enable globally disabled plugins specifically for open workspace projects via `.agents/plugins.json`.
  - Declarative skill enabling/disabling via `exclude` lists in `skills.json` without modifying or renaming `SKILL.md` files.
  - Connect specific global/external skills directly to selected projects via `entries` in `.agents/skills.json`.
* **Expanded Move Engine (`→`):**
  - Physically move plugins and skills across standard global directories, connected external repositories, workspace projects, and inside plugins (`<plugin>/skills/`).
* **Configuration Quick-Access Toolbar:**
  - 1-click shortcuts to view and edit `config.json`, `plugins.json`, `skills.json`, and open the active plugins folder.

## 1.0.8

### Русский
* **Кнопка «Обновить / Перепарсить» (Refresh):**
  - Добавлена в заголовок панели VS Code (sidebar view title icon) для быстрого обновления списка в один клик.
  - Добавлена на тулбар основного окна и в шапку деталей плагина (.detail-header) со стильной плавной анимацией вращения иконки (`.refresh-spin-icon.rotating`).
  - При нажатии мгновенно пересканирует все каталоги (плагины, навыки, сценарии, правила, MCP серверы, хуки и конфликты) без необходимости перезагружать окно IDE (`Developer: Reload Window`).
* **Кнопка «Открыть папку» в деталях плагина:** перенесена в постоянную верхнюю шапку (.detail-header), рядом с тумблером включения. Теперь кнопка видна всегда, даже если у плагина нет собственных навыков.
* **Отображение всех ресурсов плагина:**
  - Навыки (Skills)
  - Правила (Rules) с индикаторами активности
  - Воркфлоу (Workflows) — добавлен блок сценариев с командами `/{name}`
  - MCP Серверы (MCP) — исправлен баг отображения внутри плагина, добавлена кнопка открытия папки конфига
  - Хуки (Hooks)
* **Адаптивная заглушка:** при отсутствии вложенных компонентов отображается аккуратное уведомление `noPluginResources`.
* **Исправление версионирования SemVer:** строгое соблюдение спецификации VS Code/Antigravity для пакетов расширений (3 сегмента X.Y.Z).

### English
* **"Refresh / Re-parse" Button:**
  - Added to the sidebar view title bar as a native VS Code header icon for 1-click refresh.
  - Added to the main view toolbar and plugin details header (.detail-header) with a smooth spinning animation (`.refresh-spin-icon.rotating`).
  - Triggers instant full re-scanning of plugins, skills, workflows, rules, MCP servers, hooks, and conflicts without needing `Developer: Reload Window`.
* **"Open Folder" in Plugin Details:** Relocated to the persistent top sticky header (.detail-header) alongside the toggle switch. Now visible regardless of whether the plugin contains skills.
* **Complete Component Visibility in Plugin Details:**
  - Skills
  - Rules with glowing active/disabled status dots
  - Workflows — added dedicated section with `/{name}` slash commands
  - MCP Servers — fixed visibility bug inside plugin view, added "Open Folder" action
  - Hooks
* **Clean Empty State:** Added `noPluginResources` banner when a plugin contains no sub-components.
* **SemVer Compliance:** Strict adherence to 3-segment VS Code/Antigravity extension manifest specifications (X.Y.Z).

## 1.0.7

### Русский
* Новый механизм включения/выключения плагинов (Plugin Toggle Engine): физическое перемещение папки в активную директорию при включении и создание Junction в папке хранилища для сохранения структуры проекта. При выключении папка возвращается в хранилище, а Junction удаляется (решает проблему с игнорированием символических ссылок сканерами Antigravity IDE).
* Добавлены разделы управления для Правил (Rules), MCP Серверов (MCP) и Хуков (Hooks):
  - Правила: поддержка категорий Global, Workspace и Plugin. Защита системных глобальных правил `GEMINI.md` и `AGENTS.md` от удаления и перемещения.
  - MCP Серверы: сканирование и отображение серверов из файлов `mcp_config.json` по всем уровням.
  - Хуки: сканирование `hooks.json` (Global, Workspace, Plugin), поддержка прямого переключения активности (`enabled: true/false`).
* Добавлена поддержка системных встроенных компонентов Antigravity IDE (`~/.gemini/antigravity-ide/builtin`):
  - Сканирование и отображение встроенных навыков, сценариев, правил и конфигураций MCP.
  - Защита встроенных компонентов от модификации (строго Read-Only, блокировка тумблеров, удаления и перемещения) с возможностью быстрого просмотра исходных файлов.
  - Визуальное выделение встроенных ресурсов стильным бирюзовым бейджем «Встроенный» (`res-builtin`).
* Новый пульт управления контекстом ИИ — вкладка «Активное» (Active Context Dashboard):
  - Компактная верхняя плашка включенных плагинов с быстрым отключением в один клик.
  - Сворачиваемые блоки «Действующие правила», «Действующие навыки», «Действующие воркфлоу», «Действующие MCP серверы» и «Действующие хуки».
* Четкие цветовые индикаторы статуса (Status Dots):
  - Зеленая светящаяся точка для всех реально активных компонентов в контексте ИИ.
  - Красная светящаяся точка для отключенных ресурсов (отключенных глобально, тумблером или через отключенный родительский плагин).
* Улучшенная работа со связанными ресурсами плагинов:
  - Полная видимость всех навыков и воркфлоу из плагинов с явным статусом активности.
  - Кнопка прямого перехода «Управление плагином» с сохранением навигации.
  - Разблокировано перемещение вложенных ресурсов плагинов между плагинами, глобальным хранилищем и проектами.
* Настраиваемый режим группировки: переключатель «Группировка: Вкл/Выкл» на верхней панели (по умолчанию выключен для компактного отображения без лишнего скролла).
* Полный модульный рефакторинг архитектуры:
  - Компактный оркестратор `extension.js` сокращен более чем в 5 раз (с 3165 до ~570 строк).
  - Выделен сервисный слой `services/` (`fsUtils.js` для файловой системы и связей, `scanners.js` для поиска компонентов, `actions.js` для мутаций и проверок).
  - Веб-интерфейс полностью изолирован в каталоге `webview/` (`index.html`, `style.css`, `main.js`).
  - Добавлена архитектурная карта проекта `AGENTS.md`.

### English
* New Active AI Context Dashboard:
  - Compact header bar for active plugins with 1-click quick disable chips.
  - Collapsible categories: Active Rules, Active Skills, Active Workflows, Active MCP Servers, and Active Hooks.
* High-contrast status indicators (Status Dots):
  - Glowing green indicator for all active components loaded in AI context.
  - Glowing red indicator for disabled resources (disabled in storage, toggled off, or belonging to disabled plugins).
* Enhanced plugin resource handling:
  - Full visibility of all plugin skills, workflows, rules, and MCP servers with explicit status indicators.
  - Quick 1-click "Manage Plugin" shortcut with navigation memory.
  - Unlocked cross-scope moving for plugin resources between plugins, global storage, and workspaces.
* Flexible grouping mode: toolbar toggle "Grouping: On/Off" (off by default for compact, continuous scrolling).
* Comprehensive modular architecture refactoring:
  - Reduced `extension.js` from 3165 lines to ~570 lines as a clean IPC orchestrator.
  - Modularized backend service layer in `services/` (`fsUtils.js`, `scanners.js`, `actions.js`).
  - Isolated frontend assets in `webview/` (`index.html`, `style.css`, `main.js`).
  - Added architectural guide `AGENTS.md`.

## 1.0.5

### Русский
* Изменен механизм включения/выключения плагинов, скилов и воркфлоу с физического перемещения файлов на использование символических ссылок и Directory Junctions. Это решает проблемы версионирования и конфликтов в Git.
* Добавлено предупреждение для Windows-пользователей при невозможности создать ссылку для файлов воркфлоу (рекомендация включить Режим разработчика или перенести хранилище на один диск).

### English
* Changed the toggle mechanism for plugins, skills, and workflows from physical file movement to symbolic links and Directory Junctions, resolving version control issues and conflicts in Git.
* Added a warning for Windows users when a link cannot be created for workflow files (recommendation to enable Developer Mode or move the storage to the same drive).

## 1.0.4

### Русский
* Реализован Менеджер конфликтов для автоматического обнаружения дубликатов ресурсов с интерфейсом предупреждений и слияния.
* Создан Мастер создания новых ресурсов (плагинов, навыков, воркфлоу):
  - Поле "Отображаемое имя" автоматически скрывается для воркфлоу.
  - Навыки, создаваемые внутри плагина, автоматически наследуют родительский плагин.
  - Описание является необязательным для навыков и воркфлоу (может быть оставлено пустым при создании).
  - Добавлены независимые переключатели для структуры подпапок навыка: `scripts/` (фоновые утилиты), `examples/` (примеры), `docs/` (документация) и `resources/` (ресурсы). По умолчанию все папки отключены.
* Добавлена возможность удаления ресурсов (красная кнопка с иконкой корзины) во все списки (плагины, навыки, воркфлоу, правила и хуки):
  - При удалении плагина со вложенными навыками система предлагает пользователю либо удалить всё, либо предварительно переместить вложенные навыки (в глобальные или локальные навыки рабочей области).
  - При удалении остальных ресурсов (навыков, воркфлоу, правил, хуков) запрашивается подтверждение и производится физическое удаление файлов и папок с диска.
* Реализована компактная трехрядная компоновка кнопок действий в карточках ресурсов (шириной всего до 48px для освобождения места под описание):
  - Для плагинов: верхний ряд содержит тумблер активации, средний — навигационные кнопки (**| Папка | Удалить |**), нижний — кнопку перемещения.
  - Для навыков и воркфлоу: верхний ряд содержит (**| Редактировать | Папка |**), средний — тумблер активации, нижний — кнопки (**| Переместить | Удалить |**).
* Добавлена кнопка переключения вида списков: **Компактно** (по умолчанию, с ограничением высоты и троеточием) / **Подробно** (отображение полных текстов названий и описаний с переносом строк).
* Добавлен переключатель колонок: по умолчанию ресурсы отображаются в двух/нескольких колонках (Сетка), но кнопкой **«В 1 колонку»** можно принудительно перевести список в одноколоночный вид.
* Исправлено извлечение описаний навыков и воркфлоу на бэкенде: теперь они парсятся напрямую из YAML frontmatter (включая многострочные блоки) без обрезания до 150 символов. Это позволяет кнопке **«Подробно»** полностью раскрывать их текст.
* Добавлено сканирование и отображение локальных плагинов из папок `.agents/plugins/` рабочей области с поддержкой перемещения (Global <-> Workspace).
* Для плагинов кнопка **«Переместить»** скрыта и появляется только при наведении непосредственно на саму кнопку в правом нижнем углу.
* Для навыков и воркфлоу кнопка **«Переместить»** отображается постоянно.
* Добавлена кнопка копирования имени/слэш-команды в буфер обмена (`copy-name-btn`) рядом с заголовками слэш-команд (появляется только при наведении на заголовок, при клике временно показывает зеленую галочку на 1.5 секунды).
* Карточки навыков и воркфлоу визуально переработаны: в качестве основного заголовка выводится слэш-команда (например, `/${s.name}`), оформленная в виде контрастного баджа. Человекочитаемое название отображается мелким приглушенным курсивом внизу карточки только в подробном режиме, а в компактном режиме полностью скрывается.
* Добавлено информативное предупреждение при возникновении ошибки блокировки файлов/папок (EPERM/EACCES) на Windows при переключении статуса ресурсов, предотвращающее зависание интерфейса веб-панели.
* Настроено diagnostic-логирование работы расширения в реальном времени.
* Перенесены все кнопки управления плагином (тумблер активации, кнопки перемещения, удаления и открытия папки), а также элементы управления списками (В 1 колонку, Подробно, Обновить, Создать навык) непосредственно в раздел «НАВЫКИ (SKILLS)» на странице детального просмотра плагина.
* Навыки внутри детального просмотра плагина теперь отображаются в виде полноценных карточек-баджей с поддержкой компактного и подробного режимов, а также многоколоночной сетки, устраняя проблему с обрезанием длинных описаний.
* Скрыты статичные описания разделов под кнопками вкладок. Вместо них описания перенесены во всплывающие Glassmorphism-подсказки (tooltips) под значок вопроса `?` внутри кнопок вкладок (значок `?` всегда отображается на активной фиолетовой вкладке и скрыт на неактивных).
* Исправлена критическая ошибка `TypeError` в JavaScript веб-интерфейса при переключении вкладок.
* Добавлен внешний отступ (`margin-top: 12px`) для плашки статистики (`#stats-block`), предотвращающий слипание ее рамок с карточкой «Папка хранения».
* Оптимизирован размер цифр статистики — размер уменьшен со слишком крупных `26px` до сбалансированных `22px` (крупнее изначальных `18px`, но аккуратнее `26px`).
* Добавлено CSS-свойство `align-content: start` для сетки списков ресурсов (`.plugin-list`), что решило проблему растягивания карточек по высоте экрана при `min-height: 100vh` (например, при одном элементе во вкладе). Теперь строки карточек плотно упаковываются сверху с стандартным зазором `12px` между ними.

### English
* Implemented Conflict Manager for automatic detection of duplicate resources with conflict warning and merge interfaces.
* Created Resource Creation Wizard (for plugins, skills, and workflows):
  - "Display Name" field is automatically hidden for workflows.
  - Skills created inside a plugin automatically inherit the parent plugin.
  - Description is optional for skills and workflows (can be left blank during creation).
  - Added independent toggles for skill subfolder structure: `scripts/` (background utilities), `examples/` (examples), `docs/` (documentation), and `resources/` (resources). All folders are disabled by default.
* Added resource deletion support (red trash icon) across all lists (plugins, skills, workflows, rules, and hooks):
  - When deleting a plugin with nested skills, the user is prompted to either delete all content or move the nested skills (to global or local workspace skills) before plugin deletion.
  - When deleting other resources (skills, workflows, rules, hooks), a confirmation modal is shown and files/directories are physically removed.
* Implemented a compact three-row action button layout in resource cards (only up to 48px wide to maximize description text area):
  - For plugins: Row 1 contains the activation toggle, Row 2 contains primary actions (**| Folder | Delete |**), and Row 3 contains the Move button.
  - For skills and workflows: Row 1 contains (**| Edit | Folder |**), Row 2 contains the activation toggle, and Row 3 contains (**| Move | Delete |**).
* Added list view mode toggle button: **Compact** (default, text-truncated with ellipsis) / **Detailed** (full title & description text wrapping).
* Added column layout toggle: by default resources are rendered in a multi-column grid, but the **"1 Column"** button forces a single-column list layout.
* Fixed skill and workflow description extraction on the backend: they are now parsed directly from the YAML frontmatter (supporting multi-line blocks) without 150-character truncation, allowing the **"Detailed" view to fully reveal the text.
* Added scanning and rendering of local workspace plugins from `.agents/plugins/` with relocation support (Global <-> Workspace).
* For plugins, the **"Move"** button is hidden by default and only shows when the user hovers directly over the button in the bottom right corner of the card.
* For skills and workflows, the **"Move"** button is permanently visible.
* Added copy button for slash commands (`copy-name-btn`) next to command headers (shows only on hover, click temporarily shows a green checkmark for 1.5s).
* Visual redesign of skill and workflow cards: the slash command (e.g. `/${s.name}`) is rendered as the main bold badge title. The human-readable display name is rendered as a small, muted italic label at the bottom and is shown only in Detailed mode, being completely hidden in Compact mode.
* Added informative warning when a file/folder lock error (EPERM/EACCES) occurs on Windows during resource toggling, preventing the webview interface from hanging.
* Configured real-time diagnostic logging for the extension.
* Moved all plugin management buttons (activation toggle, move, delete, open folder) and list controls (1 Column, Detailed, Refresh, Create Skill) directly into the "SKILLS" section inside the plugin details view.
* Nested skills inside the plugin details view are now rendered as high-fidelity cards matching the main list view, with support for grid/list toggle and compact/detailed description modes.
* Hidden static tab descriptions below buttons, moving them into smooth Glassmorphism hover tooltips triggered by a `?` help icon nested inside tab buttons (the `?` icon is always visible on the active tab button and completely hidden on inactive ones).
* Fixed a critical webview `TypeError` crash when switching between tabs.
* Added vertical spacing (`margin-top: 12px`) to the stats card (`#stats-block`) to prevent its borders from touching the storage section card above it.
* Tuned the font size of statistics numbers from `26px` to a balanced `22px` (larger than original `18px`, but sleeker than `26px`).
* Added `align-content: start` to resource grid lists (`.plugin-list`), resolving vertical stretching of cards to full viewport height when using `min-height: 100vh` (e.g., when a tab contains only one item). Card rows are now packed tightly at the top with a standard `12px` gap.

## 1.0.0

### Русский
* Первоначальный релиз расширения **Antigravity Plugin & Skill Manager**.
* Управление глобальными плагинами с помощью механизма **физического перемещения папок** (для 100% совместимости со встроенными сканерами Antigravity IDE, которые игнорируют символические ссылки и Junctions).
* Папка хранилища по умолчанию перенесена в `~/.gemini/config/plugins_storage/` (на одном диске с активной папкой), что обеспечивает мгновенное (sub-millisecond) перемещение папок без копирования данных.
* Возможность смены папки хранилища через стандартный диалог в Webview.
* Анализ контекста ИИ (подсчет активных Skills, Rules, Workflows во всем окружении и внутри плагинов).
* Переключатель языка (Auto / English / Русский) прямо в интерфейсе Webview.
* Премиальный дизайн панели (Glassmorphism, микро-анимации, мультиязычность RU/EN) и новая 3D-иконка в стиле Antigravity.
* Кнопка мониторинга и всплывающий список плагинов в статус-баре.

### English
* Initial release of the **Antigravity Plugin & Skill Manager** extension.
* Management of global plugins using a **physical folder movement** mechanism (for 100% compatibility with built-in Antigravity IDE scanners that ignore symbolic links and Junctions).
* Default storage directory located at `~/.gemini/config/plugins_storage/` (on the same drive as active plugins) to guarantee instantaneous (sub-millisecond) folder movement without copying.
* Ability to select a custom storage directory from the Webview storage row.
* AI Context analysis (counting active Skills, Rules, Workflows across the environment and inside plugins).
* Quick language selector dropdown (Auto / English / Русский) integrated into the Webview panel.
* Premium panel design (featuring Glassmorphism, micro-animations, and full RU/EN bilingual support) and custom 3D glassmorphic icon.
* Status bar button showing active counts and detailed markdown tooltip of plugin states.
