# Архитектурный рефакторинг фронтенда и мульти-сборка Desktop в `dist/`

## 1. Цели
1. **Мульти-сборка в `dist/`**: Обеспечить возможность компиляции Desktop-приложения в общую директорию `dist/` через `build.bat` (`ext`, `desktop`, `all`).
2. **Устранение скрытого рантайм-бага**: Исправить резолвинг модулей в `desktop/main.js`, чтобы упакованный в asar десктоп не падал при запуске.
3. **Zero-Bundler Modularity**: Разбить монолит `webview/main.js` (3514 строк) на 10 чистых модулей в каталоге `webview/js/` (каждый <750 строк) без привлечения тяжелых сторонних сборщиков.
4. **Обновление SSOT ([/AGENTS.md](/AGENTS.md))**: Зафиксировать правила поиска `grep_search` на Windows, карту модулей `webview/js/` и реестр IPC-команд.

---

## 2. Предлагаемые изменения

### ЭТАП 1: Настройка Desktop сборки в `dist/` и устранение рантайм-бага
1. **[MODIFY] `desktop/main.js`**:
   - В функции `resolveService(name)` заменить ненадежный `fs.existsSync(localPath)` (без расширения `.js`) на безопасный `try/catch require()`:
     ```javascript
     function resolveService(name) {
       try {
         return require(path.join(__dirname, 'services', name));
       } catch (_) {
         return require(path.join(__dirname, '..', 'services', name));
       }
     }
     ```
   - Задействовать `fsUtils.getWebviewScript()` при загрузке HTML.
2. **[MODIFY] `desktop/package.json`**:
   - Удалить верхнеуровневый массив `"files"` с ошибочными путями `..`.
   - В секции `"build"` добавить `"directories": { "output": "../dist" }`.
   - В массиве `"build.files"` настроить `FileSet` сопоставление `{ "from": "../...", "to": "..." }` для `services`, `webview`, `locales`, `resources`.
   - Задать путь к иконке: `"icon": "../resources/icon.png"`.
3. **[MODIFY] `build.bat`**:
   - Реализовать диспетчер целей:
     - `build.bat` / `build.bat ext` -> упаковка `.vsix`
     - `build.bat desktop` -> синхронизация версии из корня и запуск `npm run build` в `desktop/`
     - `build.bat all` -> сборка обоих артефактов в `dist/`

### ЭТАП 2: Zero-Bundler Modularity для фронтенда (`webview/js/`)
1. **[NEW] `services/fsUtils.js`**:
   - Добавить функцию `getWebviewScript(webviewDir)`: последовательно считывает и объединяет файлы модулей из `webview/js/` в строгом порядке, с безопасным fallback на `webview/main.js`.
2. **[MODIFY] `extension.js` и `desktop/main.js`**:
   - Заменить прямое чтение `webview/main.js` на вызов `fsUtils.getWebviewScript()`.
3. **[NEW] Создание 10 модулей в `webview/js/`**:
   - `state.js` (~70 строк): `vscode` shim, `window.onerror`, глобальные коллекции данных, `t()`, `copyText()`.
   - `syncEta.js` (~150 строк): расчет времени индексации `calculatePluginSyncEta`, управление таймерами лоадеров `trackItemLoading`, `clearAllItemLoaders`.
   - `ipc.js` (~160 строк): слушатель `message` от бэкенда (`init`, `syncStatus`, `updatesChecked`, `liveContextData`).
   - `controls.js` (~300 строк): селектор проектов Antigravity 2.0, multi-root контролы, подключенные папки, табы навигации `switchTab()`.
   - `actions.js` (~260 строк): обработчики тумблеров и кнопок (`togglePluginGlobal`, `togglePluginProject`, `toggleSkill*`, `toggleMcpServer`, `toggleHook`, `moveItem`, `deleteItem`).
   - `cards.js` (~750 строк): статус-пилюли `getStatusPillHtml`, фабрики 6 типов карточек (`renderPluginCard`, `renderSkillCard`, `renderWorkflowCard`, `renderRuleCard`, `renderMcpCard`, `renderHookCard`).
   - `pluginDetails.js` (~670 строк): экран Hero Card плагина, навигация назад, редактирование метаданных.
   - `activeContext.js` (~200 строк): дашборд «Активное» (сворачиваемые категории действующих компонентов).
   - `modals.js` (~550 строк): визард создания (`openCreateModal`), модалка обновления плагинов Git (`openPluginUpdateModal`), Live Context инспектор.
   - `main.js` (~80 строк): точка входа, DOMContentLoaded, переключатели вида/колонок (`toggleViewMode`, `toggleLayoutMode`).
4. **[MODIFY] `desktop/package.json`**:
   - Обновить скрипт `syntax-check` для проверки всех файлов `../webview/js/*.js`.

### ЭТАП 3: Документация и SSOT ([/AGENTS.md](/AGENTS.md))
1. **[MODIFY] `AGENTS.md`**:
   - Зафиксировать **Правило поиска по кодовой базе (Windows Tool Protocol)**: запрет передачи файла в `SearchPath`, правильный шаблон с `Includes`.
   - Добавить **Карту модулей фронтенда `webview/js/`** с указанием строк и ответственности.
   - Добавить **Реестр команд IPC** (45 команд).

---

## 3. План верификации
1. `npm run syntax-check` в `desktop/` — синтаксис всех 10 модулей JS и бэкенда.
2. `npm run test:smoke` в `desktop/` — проверка headless запуска Electron со сборкой всех модулей фронтенда.
3. `cmd.exe /c build.bat ext` — проверка сборки `.vsix`.
4. `cmd.exe /c build.bat desktop` — проверка сборки Electron NSIS + Portable в `dist/`.
5. Ручная проверка работы открытия окон и переключения табов.
