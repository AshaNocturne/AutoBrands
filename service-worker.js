// ============================================================
// service-worker.js — фоновий sync для MV3
// ============================================================

const GOOGLE_SHEET_TSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRDA6BgUApGBZPz1idXpmYvuKF_4pPWacVI-Ir4KsgWCPoWwQzfNNhX8qmzcqLR2UCPOxOEB9h0q858/pub?gid=0&single=true&output=tsv";

const GOOGLE_SHEET_CATEGORY_TSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRDA6BgUApGBZPz1idXpmYvuKF_4pPWacVI-Ir4KsgWCPoWwQzfNNhX8qmzcqLR2UCPOxOEB9h0q858/pub?gid=1600142994&single=true&output=tsv";

const SYNC_FETCH_TIMEOUT = 10000;
const MAX_SYNC_RETRIES = 1;
const SYNC_RETRY_DELAY = 1200;
const AUTO_SYNC_ALARM = "autohub-auto-sync";
const AUTO_SYNC_PERIOD_MINUTES = 30;

let brandSyncInFlight = null;
let parametersSyncInFlight = null;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function storageSet(obj) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(obj, () => {
            if (chrome.runtime?.lastError) return reject(new Error(chrome.runtime.lastError.message));
            resolve();
        });
    });
}

function normalizeKey(value) {
    return String(value || "").trim().toUpperCase();
}

async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_FETCH_TIMEOUT);
    try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const trimmed = String(text || "").trim().toLowerCase();
        if (!text || trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) {
            throw new Error("Sheet response is not TSV");
        }
        return text;
    } finally {
        clearTimeout(timeout);
    }
}

function parseBrandTSV(text) {
    const lines = String(text || "").split(/\r?\n/);
    if (lines.length < 2) return {};

    const headers = lines[0].split("\t").map(h => h.trim());
    const newDb = {};

    const map = {
        key: "key",
        fullName: "fullName",
        logo: "logo",
        enterpriseName: "enterpriseName",
        prefix: "prefix",
        country: "country",
        typeofsparepart: "typeofsparepart",
        synonyms: "synonyms",
        series: "series",
        site: "site",
        catalog: "catalog",
        status: "status",
        "Посилання для Gomer": "gomerLink",
        "Посилання для Enterprise": "enterpriseLink",
        "Посилання для Префікса": "prefixLink",
        "Додаткова інформація": "additionalInfo",
        "Опис (ua)": "descriptionUa",
    };

    for (let i = 1; i < lines.length; i += 1) {
        if (!lines[i].trim()) continue;
        const cols = lines[i].split("\t");
        const rowData = {};

        headers.forEach((h, idx) => {
            if (!map[h]) return;
            rowData[map[h]] = (cols[idx] || "").trim();
        });

        if (!rowData.fullName) continue;

        const fullNameKey = normalizeKey(rowData.fullName);
        if (!fullNameKey) continue;
        newDb[fullNameKey] = rowData;

        const shortKey = normalizeKey(rowData.key);
        if (shortKey && !newDb[shortKey]) newDb[shortKey] = rowData;

        const prefixKey = normalizeKey(rowData.prefix);
        if (prefixKey && !newDb[prefixKey]) newDb[prefixKey] = rowData;

        if (rowData.synonyms) {
            rowData.synonyms.split(",").forEach(s => {
                const synonymKey = normalizeKey(s);
                if (synonymKey && !newDb[synonymKey]) newDb[synonymKey] = rowData;
            });
        }
    }

    return newDb;
}

function parseCategoryTSV(text) {
    const lines = String(text || "").split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split("\t").map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i += 1) {
        const cols = lines[i].split("\t");
        const row = {};

        headers.forEach((h, idx) => {
            if (!h) return;
            row[h] = (cols[idx] || "").trim();
        });

        const firstValue = headers.map(h => row[h]).find(value => String(value || "").trim() !== "") || "";
        if (!String(firstValue).trim()) continue;

        row._title = firstValue;
        rows.push(row);
    }

    return rows;
}

function getCategoryRowKey(row) {
    const categoryTitle = String(
        row["category_title"] ||
        row["Категорія назва"] ||
        row["category"] ||
        row["Категорія (загальна)"] ||
        ""
    ).trim();

    const subcategoryTitle = String(
        row["subcategory_title"] ||
        row["Підкатегорія назва"] ||
        row["subcategory"] ||
        row["Підкатегорія"] ||
        ""
    ).trim();

    if (categoryTitle || subcategoryTitle) {
        return `${categoryTitle}::${subcategoryTitle}`.toUpperCase();
    }

    const main = String(row["mainparameter_1"] || row["Основний параметр"] || "").trim();
    const fallback = String(row._title || "").trim();
    return String(main || fallback).toUpperCase();
}

function getCategoryChangeName(row) {
    const categoryTitle = String(
        row["category_title"] ||
        row["Категорія назва"] ||
        row["category"] ||
        row["Категорія (загальна)"] ||
        ""
    ).trim();

    const subcategoryTitle = String(
        row["subcategory_title"] ||
        row["Підкатегорія назва"] ||
        row["subcategory"] ||
        row["Підкатегорія"] ||
        ""
    ).trim();

    if (categoryTitle && subcategoryTitle) return `${categoryTitle} / ${subcategoryTitle}`;
    return String(subcategoryTitle || categoryTitle || row._title || "").trim();
}

function getCategoryEntityType(row) {
    const categoryTitle = String(
        row["category_title"] ||
        row["Категорія назва"] ||
        row["category"] ||
        row["Категорія (загальна)"] ||
        ""
    ).trim();

    const subcategoryTitle = String(
        row["subcategory_title"] ||
        row["Підкатегорія назва"] ||
        row["subcategory"] ||
        row["Підкатегорія"] ||
        ""
    ).trim();

    if (subcategoryTitle) return "subcategory";
    if (categoryTitle) return "category";
    return "record";
}

function diffCategoryRows(oldRows, newRows) {
    const oldMap = new Map();
    const newMap = new Map();

    (Array.isArray(oldRows) ? oldRows : []).forEach(row => {
        const key = getCategoryRowKey(row);
        if (key) oldMap.set(key, row);
    });

    (Array.isArray(newRows) ? newRows : []).forEach(row => {
        const key = getCategoryRowKey(row);
        if (key) newMap.set(key, row);
    });

    const fields = [
        "category_title",
        "subcategory_title",
        "category",
        "subcategory",
        "mainparameter_1",
        "idmainparameter_1",
        "typemainparameter_1",
        "additionalparameter_1",
        "idadditionalparameter_1",
        "typeadditionalparameter_1",
        "ifpossibleput",
        "instruction",
        "uktzed",
        "Width",
        "Depth",
        "Height",
        "Weight",
        "category_generallink",
        "subcategory_generallink",
        "enterprise_generallink",
        "gomer_generallink",
        "logotype_category",
        "status_category",
        "Категорія (загальна)",
        "Підкатегорія",
        "Основний параметр",
        "Додатковий параметр",
        "За змоги проставити",
        "Інструкція",
        "Категорія (загальна) (посилання)",
        "Підкатегорія (посилання)",
    ];

    const now = Date.now();
    const changes = [];

    newMap.forEach((row, key) => {
        if (!oldMap.has(key)) {
            changes.push({
                type: "added",
                name: getCategoryChangeName(row),
                entityType: getCategoryEntityType(row),
                timestamp: now,
                details: [],
            });
            return;
        }

        const oldRow = oldMap.get(key);
        const details = [];
        fields.forEach(field => {
            const oldVal = String(oldRow[field] || "").trim();
            const newVal = String(row[field] || "").trim();
            if (oldVal !== newVal) {
                details.push({ field, old: oldVal || "-", new: newVal || "-" });
            }
        });

        if (details.length > 0) {
            changes.push({
                type: "modified",
                name: getCategoryChangeName(row),
                entityType: getCategoryEntityType(row),
                timestamp: now,
                details,
            });
        }
    });

    oldMap.forEach((row, key) => {
        if (!newMap.has(key)) {
            changes.push({
                type: "removed",
                name: getCategoryChangeName(row),
                entityType: getCategoryEntityType(row),
                timestamp: now,
                details: [],
            });
        }
    });

    return changes;
}

async function refreshBrandsInBackground() {
    if (brandSyncInFlight) return brandSyncInFlight;

    brandSyncInFlight = (async () => {
        let lastError = null;

        for (let attempt = 0; attempt <= MAX_SYNC_RETRIES; attempt += 1) {
            try {
                const text = await fetchWithTimeout(GOOGLE_SHEET_TSV_URL);
                const newDb = parseBrandTSV(text);
                const now = Date.now();

                await storageSet({
                    hubDb: newDb,
                    hubDbTime: now,
                    hubDbLastAttempt: now,
                    hubDbLastError: null,
                });

                return { ok: true, updatedAt: now };
            } catch (error) {
                lastError = error;
                if (attempt < MAX_SYNC_RETRIES) await delay(SYNC_RETRY_DELAY);
            }
        }

        const now = Date.now();
        await storageSet({
            hubDbLastAttempt: now,
            hubDbLastError: lastError?.message || "Unknown error",
        });
        throw lastError || new Error("Unknown error");
    })();

    try {
        return await brandSyncInFlight;
    } finally {
        brandSyncInFlight = null;
    }
}

async function refreshParametersInBackground() {
    if (parametersSyncInFlight) return parametersSyncInFlight;

    parametersSyncInFlight = (async () => {
        let lastError = null;
        const cached = await storageGet(["categorySheetRows", "parametersChangesHistory"]);

        for (let attempt = 0; attempt <= MAX_SYNC_RETRIES; attempt += 1) {
            try {
                const text = await fetchWithTimeout(GOOGLE_SHEET_CATEGORY_TSV_URL);
                const rows = parseCategoryTSV(text);
                const now = Date.now();

                const oldRows = Array.isArray(cached.categorySheetRows) ? cached.categorySheetRows : [];
                const oldHistory = Array.isArray(cached.parametersChangesHistory) ? cached.parametersChangesHistory : [];
                const detectedChanges = diffCategoryRows(oldRows, rows);
                const history = detectedChanges.length > 0
                    ? [...detectedChanges, ...oldHistory].slice(0, 1000)
                    : oldHistory;

                await storageSet({
                    categorySheetRows: rows,
                    categorySheetUpdatedAt: now,
                    categorySheetError: "",
                    parametersChangesHistory: history,
                    parametersLastAttempt: now,
                    parametersLastError: null,
                });

                return { ok: true, updatedAt: now, changes: detectedChanges.length };
            } catch (error) {
                lastError = error;
                if (attempt < MAX_SYNC_RETRIES) await delay(SYNC_RETRY_DELAY);
            }
        }

        const now = Date.now();
        await storageSet({
            categorySheetError: lastError?.message || "Unknown error",
            parametersLastAttempt: now,
            parametersLastError: lastError?.message || "Unknown error",
        });
        throw lastError || new Error("Unknown error");
    })();

    try {
        return await parametersSyncInFlight;
    } finally {
        parametersSyncInFlight = null;
    }
}

async function runBackgroundSync(target) {
    if (target === "brands") return refreshBrandsInBackground();
    if (target === "parameters") return refreshParametersInBackground();

    const [brands, parameters] = await Promise.allSettled([
        refreshBrandsInBackground(),
        refreshParametersInBackground(),
    ]);

    return {
        brands,
        parameters,
    };
}

function ensureAutoSyncAlarm() {
    if (!chrome?.alarms?.create) return;
    chrome.alarms.create(AUTO_SYNC_ALARM, {
        periodInMinutes: AUTO_SYNC_PERIOD_MINUTES,
    });
}

if (chrome?.runtime?.onInstalled?.addListener) {
    chrome.runtime.onInstalled.addListener(() => {
        ensureAutoSyncAlarm();
        runBackgroundSync("all").catch(err => {
            console.warn("Initial background sync failed:", err?.message || err);
        });
    });
}

if (chrome?.runtime?.onStartup?.addListener) {
    chrome.runtime.onStartup.addListener(() => {
        ensureAutoSyncAlarm();
    });
}

if (chrome?.alarms?.onAlarm?.addListener) {
    chrome.alarms.onAlarm.addListener(alarm => {
        if (!alarm || alarm.name !== AUTO_SYNC_ALARM) return;
        runBackgroundSync("all").catch(err => {
            console.warn("Scheduled background sync failed:", err?.message || err);
        });
    });
}

if (chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || message.type !== "SYNC_NOW") return;

        runBackgroundSync(message.target || "all")
            .then(result => sendResponse({ ok: true, result }))
            .catch(error => sendResponse({ ok: false, error: error?.message || "Unknown error" }));

        return true;
    });
}
