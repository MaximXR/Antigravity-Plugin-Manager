# Changelog

## 1.0.0-dev

### Русский
* Первоначальный релиз расширения **Antigravity Plugin Manager**.
* Управление глобальными плагинами с помощью механизма **физического перемещения папок** (для 100% совместимости со встроенными сканерами Antigravity IDE, которые игнорируют символические ссылки и Junctions).
* Папка хранилища по умолчанию перенесена в `~/.gemini/config/plugins_storage/` (на одном диске с активной папкой), что обеспечивает мгновенное (sub-millisecond) перемещение папок без копирования данных.
* Возможность смены папки хранилища через стандартный диалог в Webview.
* Анализ контекста ИИ (подсчет активных Skills, Rules, Workflows во всем окружении и внутри плагинов).
* Премиальный дизайн панели (Glassmorphism, микро-анимации, мультиязычность RU/EN).
* Кнопка мониторинга и всплывающий список плагинов в статус-баре.

### English
* Initial release of the **Antigravity Plugin Manager** extension.
* Management of global plugins using a **physical folder movement** mechanism (for 100% compatibility with built-in Antigravity IDE scanners that ignore symbolic links and Junctions).
* Default storage directory located at `~/.gemini/config/plugins_storage/` (on the same drive as active plugins) to guarantee instantaneous (sub-millisecond) folder movement without copying.
* Ability to select a custom storage directory from the Webview storage row.
* AI Context analysis (counting active Skills, Rules, Workflows across the environment and inside plugins).
* Premium panel design (featuring Glassmorphism, micro-animations, and full RU/EN bilingual support).
* Status bar button showing active counts and detailed markdown tooltip of plugin states.
