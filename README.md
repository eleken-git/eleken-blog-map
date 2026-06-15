# Eleken Blog Map

Інтерактивна D3.js карта статей блогу Eleken. Дані тягнуться з Webflow CMS під
час білду на Vercel і вбиваються у статичний файл — фронт працює без клієнтських
запитів до API.

## Структура (дані відокремлені від коду)

| Файл | Що це | Хто редагує |
|---|---|---|
| `eleken-blog-map.js` | D3-бандл + уся логіка карти. Читає глобальний `NODES`. | вручну |
| `nodes.js` | Лише `const NODES = [...]` — дані статей. | **генерується білдом** |
| `index.html` | Розмітка. Підключає `nodes.js`, потім `eleken-blog-map.js`. | вручну |
| `eleken-blog-map.css` | Стилі. | вручну |
| `scripts/build.mjs` | Fetch Webflow → генерує `nodes.js`. | вручну |
| `scripts/serve.mjs` | Локальний статичний сервер для перегляду. | вручну |

Дані й код у різних файлах — щоб оновлення даних ніколи не зачіпало логіку, а
білд перезаписував **тільки** `nodes.js`. `nodes.js` закомічено як снапшот, тож
карта працює локально без токена; Vercel перезаписує його свіжими даними.

## Локально

```bash
node scripts/serve.mjs        # http://localhost:8765 — карта з останнім снапшотом
```

Оновити дані локально (потрібен токен):

```bash
WEBFLOW_TOKEN=xxx node scripts/build.mjs
```

## Деплой (Vercel)

- `buildCommand`: `node scripts/build.mjs` (див. `vercel.json`)
- Env var `WEBFLOW_TOKEN` додати в Settings → Environment Variables
- Білд падає з кодом 1, якщо токена нема або API віддав помилку — порожня карта
  не задеплоїться.

## Автооновлення при публікації статті

- Vercel: Settings → Git → Deploy Hooks → створити хук на `main`, скопіювати URL.
- Webflow: Site Settings → Apps & integrations → Webhooks → тип `site_publish`
  → вставити URL від Vercel.

Без цього карта оновлюється лише при `git push` або ручному Redeploy.
