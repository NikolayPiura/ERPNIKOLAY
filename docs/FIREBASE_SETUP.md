# Firebase для PIURA ERP

Firebase используется как основная облачная база пользовательских данных.
`localStorage` остаётся быстрым офлайн-кэшем, а Google Drive — независимой
резервной копией.

## Текущий проект

- Project ID: `erp-design-checklist`
- Web App: `PIURA ERP Web`
- Firestore: Standard / Native mode, регион `nam5`, free tier
- Google Sign-In: включён
- Authentication: автоматический вход, постоянная локальная сессия
- Authorized domains: `nikolaypiura.github.io`, `localhost`, `127.0.0.1`
- Delete protection: включена

## Повторная настройка проекта

1. Создать Firebase-проект на бесплатном тарифе Spark.
2. Создать Cloud Firestore в Standard edition / Native mode.
3. В Authentication включить провайдер Google.
4. Добавить домен GitHub Pages в Authentication → Settings → Authorized domains.
5. Зарегистрировать Web app и перенести его config object в `firebase-config.js`.
6. Развернуть `firestore.rules` командой `firebase deploy --only firestore:rules`.

Конфигурация Web app не является секретом. Доступ к документам ограничивается
Firebase Authentication и правилами: только подтверждённый Google-аккаунт
владельца может читать и изменять путь `users/{свой uid}/erpState`.

При первом входе существующие локальные данные загружаются в пустую базу. Если
в базе уже есть данные, система объединяет их с локальными записями и выбирает
более свежую версию каждого ключа. Дальше изменения синхронизируются
автоматически.

В ERP нет ручных кнопок Firebase. Модуль сам восстанавливает постоянную сессию,
а при её отсутствии запускает Google-вход с подсказкой аккаунта владельца. Если
браузер блокирует автоматическое окно, вход повторяется при первом действии
пользователя. Служебные ключи и пароли в клиентский код не добавляются.
