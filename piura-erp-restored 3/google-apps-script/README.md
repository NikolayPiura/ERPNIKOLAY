# Admin Scale ↔ Google Docs

Этот мост нужен потому, что статическая страница GitHub Pages не может сама безопасно редактировать Google Docs.

1. Откройте [script.google.com](https://script.google.com/) и создайте проект.
2. Вставьте содержимое `AdminScaleSync.gs` в файл `Code.gs`.
3. Нажмите **Deploy → New deployment → Web app**.
4. Выберите **Execute as: Me** и доступ для пользователя, который открывает ERP.
5. Скопируйте адрес `/exec` в Admin Scale: **Настройки → Google Docs → Адрес Apps Script**.

По желанию добавьте в **Project settings → Script properties** свойство `SYNC_TOKEN`. Такой же ключ укажите в настройках Admin Scale. В ERP ключ сохраняется только в `localStorage` текущего браузера.

ERP сразу показывает локальный снимок и обновляет его в фоне. Галочка делает строку зелёной в Google Docs, редактирование меняет текст, удаление удаляет строку. Изменения и зелёные строки в Docs подхватываются при открытии сервиса или по кнопке синхронизации.
