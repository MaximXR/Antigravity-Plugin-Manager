# Antigravity Plugin Manager

[Русский](#русский) | [English](#english)

> ⚠️ **Эксклюзивно для Antigravity IDE**: Данное расширение разработано специально для Antigravity IDE и не совместимо со стандартным VS Code.
> 
> **Exclusive for Antigravity IDE**: This extension is designed specifically for Antigravity IDE and is not compatible with standard VS Code.

---

## Русский

**Antigravity Plugin Manager** — это визуальный менеджер плагинов и анализатор активного контекста для **Antigravity IDE**. Он обеспечивает удобное переключение глобальных инструментов ИИ и мониторинг потребления контекста в реальном времени.

### Какие проблемы решает расширение?

1. **Несовместимость Antigravity IDE с символическими ссылками**:
   Встроенный сканер Antigravity IDE не считывает плагины, подключенные через Symlinks или Junctions. Расширение решает это, физически перемещая папки между активной директорией и локальным хранилищем (Storage). За счет размещения хранилища на том же диске перемещение происходит мгновенно (на уровне MFT) без копирования данных.
2. **Переполнение контекстного окна ИИ**:
   Агенты ИИ считывают все активные правила, навыки и воркфлоу. Пользователям сложно контролировать размер загружаемого контекста. Расширение сканирует все активные ресурсы во всей системе и локальных рабочих областях и выводит наглядную статистику.
3. **Удаление файлов при случайном повторном перемещении**:
   При попытке переместить файл в папку, где он уже находится, стандартная перезапись могла удалить исходный файл. Расширение предотвращает самоперемещение (self-move), защищая файлы от удаления.

### Установка и скачивание

Готовый пакет расширения `.vsix` можно скачать со страницы релизов:
👉 **[Последние релизы (VSIX)](https://github.com/MaximXR/Antigravity-Plugin-Manager/releases)**

После скачивания файла установите его в Antigravity IDE (меню *Extensions* -> кнопка *... (Views and More Actions)* -> *Install from VSIX...*).

> 💡 **Собственная сборка из исходников:**
> Вместо скачивания готового релиза вы можете скомпилировать расширение самостоятельно. Для этого запустите файл `build.bat` в корневом каталоге проекта — он автоматически проверит и установит необходимые зависимости, выполнит сборку и создаст актуальный `.vsix` файл в папке `dist/`.

### Основные возможности

- **Физическое включение/выключение плагинов**: Перемещение папок плагинов в хранилище для полного отключения их влияния на контекст ИИ.
- **Подсчет активного контекста**: Мониторинг плагинов, навыков (Skills), локальных правил (Rules) и воркфлоу (Workflows).
- **Перемещение ресурсов**: Удобный перенос файлов навыков, правил и воркфлоу между глобальными папками, плагинами и локальными папками открытых рабочих областей (`.agents/`).
- **Защита от перезаписи и дублирования**: Проверка путей при переносе, исключение текущего расположения из списка назначения и защита от перезаписи файла самим собой.
- **Интеграция со статус-баром**: Кнопка в статус-баре с быстрым счетчиком активных плагинов и подробным всплывающим Markdown-списком.
- **Премиальный UI**: Современный интерфейс с эффектом Glassmorphism, микро-анимациями и автоматическим выбором языка (RU/EN).

### Системные требования и Совместимость

- Совместимость: Antigravity IDE (Windows, macOS, Linux).
- Требования для сборки: Node.js версии 18 или выше.

---

## English

**Antigravity Plugin Manager** is a visual plugin controller and active context analyzer for **Antigravity IDE**. It provides a single-click interface to toggle global AI tools and monitor total active context parameters.

### What Problems Does It Solve?

1. **Antigravity IDE Incompatibility with Symlinks/Junctions**:
   Built-in scan modules in Antigravity IDE do not recognize plugins linked via symlinks. The extension resolves this by physically moving folders between the active directory and a local offline storage. By placing storage on the same drive, this directory swap occurs instantly (via MFT record updates) without any disk writes or copies.
2. **AI Context Window Overload**:
   AI agents read all active rules, skills, and workflows in the workspace. The extension scans all system-wide active directories and local workspaces, outputting a real-time tally of context elements.
3. **Accidental File Deletion during Self-Move**:
   Attempting to relocate an item to its current path formerly triggered overwrite logic that deleted the source. The extension blocks self-move calls entirely to keep files safe.

### Installation & Download

You can download the compiled `.vsix` extension file from the GitHub releases page:
👉 **[Download Latest Releases (VSIX)](https://github.com/MaximXR/Antigravity-Plugin-Manager/releases)**

After downloading, install it in Antigravity IDE (via *Extensions* menu -> click *... (Views and More Actions)* -> *Install from VSIX...*).

> 💡 **Building from Source:**
> Instead of downloading a pre-built release, you can compile the extension yourself. Simply run the `build.bat` script in the project root directory — it will verify dependencies, package the extension, and place the output `.vsix` file in the `dist/` folder.

### Key Features

- **Physical Plugin Toggling**: Relocate plugin directories to offline storage to exclude them from the active AI context.
- **Context Element Tallies**: Track active count totals for plugins, skills, local rules, and workflows.
- **Resource Relocation**: Relocate skills, rules, and workflows between global folders, plugins, and local workspaces (`.agents/` folder).
- **Protection & Safeguards**: Conflict resolution warnings, dynamic source location filtering in the target pick menu, and self-move safeguards.
- **Status Bar Indicator**: Quick active/total count button with a rich markdown hover tooltip.
- **Premium UI**: Sleek glassmorphism layout, micro-animations, and automatic bilingual detection (RU/EN).

### Prerequisites & Compatibility

- Compatibility: Antigravity IDE (Windows, macOS, Linux).
- Build Requirements: Node.js v18 or newer.
