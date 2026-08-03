const GOOGLE_SHEET_TSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRDA6BgUApGBZPz1idXpmYvuKF_4pPWacVI-Ir4KsgWCPoWwQzfNNhX8qmzcqLR2UCPOxOEB9h0q858/pub?gid=0&single=true&output=tsv";

const GOOGLE_SHEET_CATEGORY_TSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRDA6BgUApGBZPz1idXpmYvuKF_4pPWacVI-Ir4KsgWCPoWwQzfNNhX8qmzcqLR2UCPOxOEB9h0q858/pub?gid=1600142994&single=true&output=tsv";

const REFRESH_INTERVAL = 30 * 60 * 1000;
const SYNC_FETCH_TIMEOUT = 10000;
const MAX_SYNC_RETRIES = 1;
const SYNC_RETRY_DELAY = 1200;

const WEB_APP_URL =
    "https://script.google.com/a/macros/rozetka.ua/s/AKfycbxzKF7WraTPdDO4lXbCcP9FaVDWKifyzzzAJZsiWp1xVgg7YexCD9ZL4v0mukxAj1U/exec";

const FIELD_LABELS = {
    key:            "Ключ / код",
    fullName:       "Найменування в Gomer",
    logo:           "Логотип",
    enterpriseName: "Найменування в Enterprise",
    prefix:         "Префікс в Enterprise",
    country:        "Країна реєстрації",
    typeofsparepart:"Тип запчастини",
    synonyms:       "Синоніми",
    series:         "Серія",
    site:           "Офіційний сайт",
    catalog:        "Офіційний каталог",
    parser:         "Парсинг товарів",
    parserArticle:  "Артикул",
    parserTradenumber: "Торговий номер",
    status:         "Статус",
    gomerLink:      "Посилання для Gomer",
    enterpriseLink: "Посилання для Enterprise",
    prefixLink:     "Посилання для Префікса",
    additionalInfo: "Додаткова інформація",
    descriptionUa:  "Опис (ua)",
};

const COLUMN_OPTIONS = [
    { key: "prefix",         label: "Префікс в Enterprise" },
    { key: "country",        label: "Країна реєстрації" },
    { key: "typeofsparepart",label: "Тип запчастини" },
    { key: "site",           label: "Офіційний сайт" },
    { key: "catalog",        label: "Офіційний каталог" },
    { key: "additionalInfo", label: "Додаткова інформація" },
    { key: "descriptionUa",  label: "Опис (ua)" },
];
