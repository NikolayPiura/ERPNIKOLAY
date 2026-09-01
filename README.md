# PIURA ERP

Личная ERP для утренней работы, эффективности, динамик, административной шкалы и благотворительных направлений. Визуальный слой поддерживает два общих режима: **Тёмная · Premium** и **Светлая · Air**.

Фонд PFF, фонд Москва, SAFE, Solid, доходы, личный доход, «Ментор», FP, инвестиционный PFF и «Друг» вынесены из основной навигации. В этой ERP остаются только рабочие утренние и управленческие разделы: «Главная», «Утро», «Эффективность», «Учёт времени», «ПС №1», «Админ-шкала», структура фондов и благотворительные цели.

Сайт публикуется бесплатно через GitHub Pages прямо из ветки `main`. Рабочие данные синхронизируются через Firebase Authentication и Cloud Firestore на бесплатном тарифе; локальное хранилище обеспечивает офлайн-работу, а Google Drive остаётся независимой резервной копией.

## Данные и Firebase

- Google-вход запускается автоматически при открытии ERP и не настраивается вручную.
- Сессия хранится локально и автоматически восстанавливается после закрытия браузера.
- Только подтверждённый Google-аккаунт владельца читает и изменяет `users/{свой uid}/erpState`.
- При первом входе существующие записи из `localStorage` переносятся в Firestore.
- После этого изменения автоматически синхронизируются между устройствами и сессиями.
- Обновление из облака перерисовывает открытый сервис без возврата на его первую вкладку.
- Кэши внешних таблиц, служебные ключи и локальные резервные копии в Firestore не отправляются.

Учёт времени сохраняет изменение локально мгновенно и отправляет накопленные
изменения в Google Sheets через 30 секунд. Неудачная отправка остаётся в очереди
и повторяется автоматически; очередь очищается только после контрольного чтения
той же записи из Google Sheets.

«Админ-шкала» использует тот же Firebase-вход владельца для защищённого
двустороннего моста с Google Docs. Адреса и ключи синхронизации не запрашиваются
в пользовательских настройках.

Firebase Web config находится в `firebase-config.js`. Он не является секретом: доступ к данным закрыт Firebase Authentication и правилами из `firestore.rules`.
При первом использовании конкретного браузера Google может один раз показать
стандартное подтверждение владельца; пароль или служебный ключ в код не
встраиваются.

## Govee Life

ERP не хранит API-ключ лампы в открытом коде. Управление питанием, яркостью и цветом проходит через `integrations/google-apps-script/PiuraBridge.gs`; ключ задаётся один раз в Script Properties как `GOVEE_API_KEY`.

## Smart Life на этом Mac

«Главная» обращается только к локальному мосту `http://127.0.0.1:8765`: розетка вентилятора закреплена за `192.168.4.23`, а подсветка карты — за `TY-02-3CH.V5.1`. Аккаунт целиком не сканируется, поэтому другие розетки не появляются и не переключаются.

Цвет и яркость из общего блока света одновременно отправляются на подсветку карты. Мост остаётся локальным и не публикует ключи Smart Life в GitHub; при его отсутствии остальные части ERP продолжают работать.

```bash
npm run dev
npm test
npm run check
```

## PIURA Modes for macOS

`modes.html` contains five turbine-style buttons connected to the native `PIURA Modes` launcher. macOS stays **dark in every mode**; only the ERP theme changes.

| Mode | Left | Center | Right |
| --- | --- | --- | --- |
| Morning | Yandex Music | Safari: Admin Scale | ERP Morning, light |
| Climate | ChatGPT above Yandex Music | Safari Working Table with native full-screen Telegram Split View above it | ERP Overview, dark |
| Investments | ChatGPT above Yandex Music | Safari workspace containing the five fund spreadsheets with native full-screen Telegram Split View | ERP Fund Structure, dark |
| Learning | Wallpaper only | Safari Extension course | Wallpaper only |
| Mentorship | Communication Policy | Blank Safari tab | ERP Overview, dark |

The Telegram pair is a native macOS full-screen Split View in one Space: normal Telegram on the left and Telegram Lite on the right, equal halves, no desktop gaps. The launcher verifies both windows are full screen, touch at the centre divider, cover the Studio Display, and have equal widths. Safari remains on the underlying centre-display desktop.

Build with `npm run build:modes`. Open the installed **PIURA Modes.app** for the same HTML panel without Safari's external-app confirmation. The hosted/standalone HTML still uses `piura-modes://morning` or `piura-modes://climate`; Safari controls its own permission prompt. Local builds keep a consistent designated signing identity, but the first launch after replacing an older build can still require macOS permissions.

Every mode copies its own bundled wallpaper to a permanent Application Support directory and sets the actual macOS desktop image on all displays, including System Events desktops. It never changes a browser background. The full action closes apps outside the selected recipe; Morning enables Do Not Disturb, while the other modes disable it. Music runs only in Morning, Climate, and Investments. The launcher hides while it works and exits when the recipe finishes, including after a partial failure.

Diagnostic URLs add `?preview=1`. Preview arranges the selected windows without quitting applications, changing appearance/wallpaper/Focus, playing music, or operating ChatGPT. Last result: `~/Library/Application Support/PIURA Modes/last-run.json`.
