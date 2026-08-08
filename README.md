# PIURA ERP

Единая персональная ERP без iframe, дублирующих `index.html` и отдельных визуальных систем.

## Структура

- `index.html` — единственная HTML-точка входа.
- `src/main.js` — оболочка, маршрутизация и переключение темы.
- `src/pages` — пять бизнес-разделов и системные настройки.
- `src/core` — хранение, форматирование, API и общие UI-компоненты.
- `src/data` — совместимые модели существующих данных ERP.
- `src/integrations` — браузерные адаптеры интеграций.
- `integrations/google-apps-script` — защищённый мост Google Docs и Govee.

Существующие ключи `localStorage` сохранены, поэтому данные старой ERP подхватываются автоматически.

## Локальный запуск

```bash
npm run dev
```

Откройте `http://127.0.0.1:4184`.

## Проверка

```bash
npm test
npm run check
```

## Govee Life

В Google Apps Script добавьте Script Properties:

- `GOVEE_API_KEY` — обязательный ключ Govee;
- `GOVEE_SENSOR_DEVICE` и `GOVEE_SENSOR_SKU` — при нескольких датчиках;
- `GOVEE_LIGHT_DEVICE` и `GOVEE_LIGHT_SKU` — при нескольких лампах;
- `SYNC_TOKEN` — необязательная защита общего endpoint.

Затем разверните `integrations/google-apps-script/PiuraBridge.gs` как Web App и вставьте полный адрес `/exec` в **Настройки → Govee Life**. Ключ Govee в браузер не передаётся.
