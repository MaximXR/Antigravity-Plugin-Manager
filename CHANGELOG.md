# История изменений / Changelog

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
