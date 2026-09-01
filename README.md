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

`modes.html` contains six personal workspace modes: Morning, Climate, Learning, Investments, Funds, and Mentorship. Morning is connected to the native `PIURA Modes` macOS launcher. It arranges the current three-display setup by display name:

- **LG UltraFine (left):** Yandex Browser with Yandex Music;
- **Studio Display (center):** Safari with the Admin Scale folder in Google Drive;
- **H27P27 (right):** PIURA ERP opened directly in Morning with the light theme.

Build the launcher with `npm run build:modes`. The full Morning action also switches macOS to the light appearance, applies the Sonoma wallpaper, gracefully asks other regular apps to quit, enables Do Not Disturb when Accessibility access is available, and starts Yandex Music when browser automation is allowed. The preview button only arranges the three windows.
