// ============================================================
// db.js — синхронізація з Google Таблицею, парсинг TSV,
//          побудова індексу брендів, відстеження змін
// ============================================================

function buildUniqueBrandsList() {
    const seen = new Set();
    State.uniqueBrandsList = [];
    for (const key in State.hubDatabase) {
        const item = State.hubDatabase[key];
        if (item.fullName && !seen.has(item.fullName.trim().toUpperCase())) {
            seen.add(item.fullName.trim().toUpperCase());
            State.uniqueBrandsList.push(item);
        }
    }
    // rebuild search index if available
    if (typeof window !== 'undefined' && typeof window.buildSearchIndex === 'function') {
        try { window.buildSearchIndex(); } catch (e) { console.warn('buildSearchIndex failed', e); }
    }
}

function formatSyncTimestamp(timestamp) {
    if (!timestamp) return "n/a";
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function setSyncStatus(statusLabel, timestamp, statusClass = "status-ok", statusTitle = "") {
    if (!Dom.syncStatusBlock) return;
    Dom.syncStatusBlock.textContent = statusLabel;
    Dom.syncStatusBlock.title = statusTitle;
    Dom.syncStatusBlock.classList.remove("status-ok", "status-warn", "status-error", "is-updating");
    Dom.syncStatusBlock.classList.add(statusClass);
    if (Dom.syncTimeBlock) {
        Dom.syncTimeBlock.textContent = timestamp ? formatSyncTimestamp(timestamp) : "";
    }
}

function updateSyncReason(reasonMessage) {
    if (!Dom.syncReasonBlock) return;
    if (reasonMessage) {
        Dom.syncReasonBlock.textContent = reasonMessage;
        Dom.syncReasonBlock.style.display = "block";
    } else {
        Dom.syncReasonBlock.textContent = "";
        Dom.syncReasonBlock.style.display = "none";
    }
}

function clearSyncReason() {
    updateSyncReason("");
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function requestBackgroundSync(target) {
    return new Promise(resolve => {
        try {
            if (!chrome?.runtime?.sendMessage) return resolve(false);
            chrome.runtime.sendMessage({ type: "SYNC_NOW", target }, response => {
                if (chrome.runtime?.lastError) return resolve(false);
                if (!response || response.ok !== true) return resolve(false);
                resolve(true);
            });
        } catch (e) {
            resolve(false);
        }
    });
}

let brandSyncInFlight = null;
let parametersSyncInFlight = null;

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

    // Primary sync identity for Parameters tab:
    // category_title + subcategory_title.
    if (categoryTitle || subcategoryTitle) {
        return `${categoryTitle}::${subcategoryTitle}`.toUpperCase();
    }

    // Backward-compatible fallback for legacy sheets.
    const main = String(row["mainparameter_1"] || row["Основний параметр"] || "").trim();
    const fallback = String(row._title || "").trim();
    const key = main || fallback;
    return key.toUpperCase();
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

    if (categoryTitle && subcategoryTitle) {
        return `${categoryTitle} / ${subcategoryTitle}`;
    }

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

function getCategoryContext(row) {
    const categoryName = String(
        row["category_title"] ||
        row["Категорія назва"] ||
        row["category"] ||
        row["Категорія (загальна)"] ||
        ""
    ).trim();
    const subcategoryName = String(
        row["subcategory_title"] ||
        row["Підкатегорія назва"] ||
        row["subcategory"] ||
        row["Підкатегорія"] ||
        ""
    ).trim();

    return { categoryName, subcategoryName };
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

    const changes = [];
    const now = Date.now();

    newMap.forEach((row, key) => {
        const { categoryName, subcategoryName } = getCategoryContext(row);

        if (!oldMap.has(key)) {
            changes.push({
                type: "added",
                name: getCategoryChangeName(row),
                entityType: getCategoryEntityType(row),
                categoryName,
                subcategoryName,
                timestamp: now,
                details: [],
            });
            return;
        }

        const oldRow = oldMap.get(key);
        const details = [];
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
                categoryName,
                subcategoryName,
                timestamp: now,
                details,
            });
        }
    });

    oldMap.forEach((row, key) => {
        if (!newMap.has(key)) {
            const { categoryName, subcategoryName } = getCategoryContext(row);
            changes.push({
                type: "removed",
                name: getCategoryChangeName(row),
                entityType: getCategoryEntityType(row),
                categoryName,
                subcategoryName,
                timestamp: now,
                details: [],
            });
        }
    });

    return changes;
}

async function fetchCategorySheetTsv() {
    const categoryUrl = String(GOOGLE_SHEET_CATEGORY_TSV_URL || "").trim();
    if (!categoryUrl) {
        throw new Error("Не налаштовано GOOGLE_SHEET_CATEGORY_TSV_URL у config.js");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_FETCH_TIMEOUT);
    try {
        const response = await fetch(categoryUrl, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const trimmed = String(text || "").trim().toLowerCase();
        if (!text || trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) {
            throw new Error("Лист Категорія недоступний у публічному TSV");
        }
        return text;
    } finally {
        clearTimeout(timeout);
    }
}

function getParametersCachedState() {
    return new Promise(resolve => {
        chrome.storage.local.get([
            "categorySheetRows",
            "categorySheetUpdatedAt",
            "categorySheetError",
            "parametersChangesHistory",
        ], resolve);
    });
}

function buildParametersHistory(detectedChanges, cached) {
    const baseHistory = Array.isArray(cached.parametersChangesHistory)
        ? cached.parametersChangesHistory
        : [];

    if (!Array.isArray(detectedChanges) || detectedChanges.length === 0) {
        return baseHistory;
    }

    return [...detectedChanges, ...baseHistory].slice(0, 1000);
}

async function updateCategorySheetFromRemote() {
    if (parametersSyncInFlight) return parametersSyncInFlight;

    parametersSyncInFlight = (async () => {
        const cached = await getParametersCachedState();
        let lastError = null;

        for (let attempt = 0; attempt <= MAX_SYNC_RETRIES; attempt += 1) {
            try {
                const tsv = await fetchCategorySheetTsv();
                const parsedRows = parseCategoryTSV(tsv);
                const now = Date.now();

                const previousRows = Array.isArray(cached.categorySheetRows) ? cached.categorySheetRows : [];
                const detected = diffCategoryRows(previousRows, parsedRows);
                const history = buildParametersHistory(detected, cached);

                State.categoryRows = parsedRows;
                State.categoryLastSync = now;
                State.categoryLastError = "";

                chrome.storage.local.set({
                    categorySheetRows: parsedRows,
                    categorySheetUpdatedAt: now,
                    categorySheetError: "",
                    parametersChangesHistory: history,
                    parametersLastAttempt: now,
                    parametersLastError: null,
                });

                return { rows: parsedRows, updatedAt: now, error: "", history };
            } catch (err) {
                lastError = err;
                if (attempt < MAX_SYNC_RETRIES) await delay(SYNC_RETRY_DELAY);
            }
        }

        const now = Date.now();
        const message = lastError?.message || "Unknown error";
        State.categoryLastError = message;
        chrome.storage.local.set({
            categorySheetError: message,
            parametersLastAttempt: now,
            parametersLastError: message,
        });
        throw lastError || new Error(message);
    })();

    try {
        return await parametersSyncInFlight;
    } finally {
        parametersSyncInFlight = null;
    }
}

async function loadCategorySheet(force = false) {
    const cached = await getParametersCachedState();
    const cachedHistory = Array.isArray(cached.parametersChangesHistory)
        ? cached.parametersChangesHistory
        : [];

    if (!force && Array.isArray(cached.categorySheetRows) && cached.categorySheetRows.length > 0) {
        State.categoryRows = cached.categorySheetRows;
        State.categoryLastSync = cached.categorySheetUpdatedAt || null;
        State.categoryLastError = String(cached.categorySheetError || "");
        return {
            rows: State.categoryRows,
            updatedAt: State.categoryLastSync,
            error: State.categoryLastError,
            history: cachedHistory,
        };
    }

    try {
        return await updateCategorySheetFromRemote();
    } catch (error) {
        const message = error?.message || "Unknown error";
        State.categoryLastError = message;
        chrome.storage.local.set({ categorySheetError: message });
        return {
            rows: Array.isArray(State.categoryRows) ? State.categoryRows : [],
            updatedAt: State.categoryLastSync,
            error: message,
            history: cachedHistory,
        };
    }
}

if (typeof window !== "undefined") {
    window.loadCategorySheet = loadCategorySheet;
}

async function fetchGoogleSheetTsv() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_FETCH_TIMEOUT);
    try {
        const response = await fetch(GOOGLE_SHEET_TSV_URL, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const trimmed = String(text || "").trim().toLowerCase();
        if (!text || trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) {
            throw new Error("Google Sheets повертає сторінку входу замість TSV. Перевірте публічний доступ таблиці.");
        }
        return text;
    } finally {
        clearTimeout(timeout);
    }
}

async function updateDatabaseFromRemote() {
    if (brandSyncInFlight) return brandSyncInFlight;

    brandSyncInFlight = (async () => {
        let lastError = null;
        for (let attempt = 0; attempt <= MAX_SYNC_RETRIES; attempt += 1) {
            try {
                const text = await fetchGoogleSheetTsv();
                parseTSV(text);
                const now = Date.now();
                chrome.storage.local.set({ hubDbLastAttempt: now, hubDbLastError: null });
                return;
            } catch (err) {
                lastError = err;
                if (attempt < MAX_SYNC_RETRIES) await delay(SYNC_RETRY_DELAY);
            }
        }
        const now = Date.now();
        chrome.storage.local.set({ hubDbLastAttempt: now, hubDbLastError: lastError?.message || "Unknown error" });
        throw lastError;
    })();

    try {
        return await brandSyncInFlight;
    } finally {
        brandSyncInFlight = null;
    }
}

function parseTSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return;

    const newDb  = {};
    const headers = lines[0].split("\t").map(h => h.trim());

    const map = {
        key:                    "key",
        fullName:               "fullName",
        logo:                   "logo",
        enterpriseName:         "enterpriseName",
        prefix:                 "prefix",
        country:                "country",
        typeofsparepart:        "typeofsparepart",
        synonyms:               "synonyms",
        series:                 "series",
        site:                   "site",
        catalog:                "catalog",
        parser_article:         "parserArticle",
        parser_tradenumber:     "parserTradenumber",
        status:                 "status",
        "Посилання для Gomer":       "gomerLink",
        "Посилання для Enterprise":  "enterpriseLink",
        "Посилання для Префікса":    "prefixLink",
        "Додаткова інформація":      "additionalInfo",
        "Опис (ua)":                 "descriptionUa",
    };

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cols    = lines[i].split("\t");
        const rowData = {};
        headers.forEach((h, idx) => { if (map[h]) rowData[map[h]] = (cols[idx] || "").trim(); });

        if (rowData.fullName) {
            const mainKey = rowData.fullName.trim().toUpperCase();
            newDb[mainKey] = rowData;

            if (rowData.key) {
                const kKey = rowData.key.trim().toUpperCase();
                if (!newDb[kKey]) newDb[kKey] = rowData;
            }
            if (rowData.synonyms) {
                rowData.synonyms.split(",").forEach(s => {
                    const sk = s.trim().toUpperCase();
                    if (sk && !newDb[sk]) newDb[sk] = rowData;
                });
            }
            if (rowData.prefix) {
                const pk = rowData.prefix.trim().toUpperCase();
                if (!newDb[pk]) newDb[pk] = rowData;
            }
        }
    }

    State.hubDatabase = newDb;
    const now = Date.now();
    State.hubDbTime   = now;
    buildUniqueBrandsList();

    setSyncStatus("☑️", now, "status-ok", "Готово");
    clearSyncReason();
    trackDatabaseChanges(State.uniqueBrandsList);
    chrome.storage.local.set({ hubDb: newDb, hubDbTime: now }, () => {
        if (chrome.runtime?.lastError) {
            console.warn("hubDb cache save skipped:", chrome.runtime.lastError.message);
        }
    });
}

async function loadDatabase() {
    try {
        const cached = await new Promise(r =>
            chrome.storage.local.get(["hubDb", "hubDbTime", "savedChangesHistory", "archivedChangesHistory", "lastHistoryClearTimestamp"], r)
        );
        State.isSyncBlockCollapsed = typeof State.isSyncBlockCollapsed === "boolean" ? State.isSyncBlockCollapsed : true;

        const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
        const lastClear = cached.lastHistoryClearTimestamp || Date.now();

        if (!cached.lastHistoryClearTimestamp) {
            chrome.storage.local.set({ lastHistoryClearTimestamp: Date.now() });
        } else if (Date.now() - lastClear > ninetyDaysMs) {
            chrome.storage.local.set({ savedChangesHistory: [], lastHistoryClearTimestamp: Date.now() });
            cached.savedChangesHistory = [];
        }

        State.archivedChangesHistory = cached.archivedChangesHistory || [];
        if (cached.savedChangesHistory) renderChangesLog(cached.savedChangesHistory);

        if (cached.hubDb && cached.hubDbTime) {
            const timeDiff = Date.now() - cached.hubDbTime;
            State.hubDatabase = cached.hubDb;
            State.hubDbTime   = cached.hubDbTime;
            buildUniqueBrandsList();

            if (timeDiff < REFRESH_INTERVAL) {
                setSyncStatus("☑️", cached.hubDbTime, "status-ok", "Готово");
            } else {
                setSyncStatus("⚠️", cached.hubDbTime, "status-warn", "Застаріло");
            }

            trackDatabaseChanges(State.uniqueBrandsList);

            if (timeDiff >= REFRESH_INTERVAL) {
                updateDatabaseFromRemote().catch(err => {
                    setSyncStatus("❌", cached.hubDbTime, "status-error", "Офлайн");
                    updateSyncReason(`Не вдалося оновити з сервера: ${err?.message || "Unknown error"}`);
                    console.warn("Database sync failed, using cached data:", err);
                });
            } else {
                clearSyncReason();
            }
            return;
        }

        try {
            await updateDatabaseFromRemote();
        } catch (e) {
            setSyncStatus("❌", null, "status-error", "Офлайн");
            updateSyncReason(`Не вдалося завантажити дані: ${e?.message || "Unknown error"}`);
            const cachedHub = await new Promise(r => chrome.storage.local.get(["hubDb", "hubDbTime"], r));
            if (cachedHub && cachedHub.hubDb) {
                State.hubDatabase = cachedHub.hubDb;
                State.hubDbTime   = cachedHub.hubDbTime || null;
                buildUniqueBrandsList();
                trackDatabaseChanges(State.uniqueBrandsList);
            }
        }

    } catch (e) {
        setSyncStatus("❌", null, "status-error", "Помилка синхронізації");
        updateSyncReason(`Не вдалося загруити кешовані дані: ${e?.message || "Unknown error"}`);

        const cached = await new Promise(r =>
            chrome.storage ? chrome.storage.local.get(["hubDb"], r) : r({})
        );
        if (cached && cached.hubDb) {
            State.hubDatabase = cached.hubDb;
            buildUniqueBrandsList();
            trackDatabaseChanges(State.uniqueBrandsList);
        }
    }
}

async function refreshDatabaseRemote() {
    const wasExpanded = !State.isSyncBlockCollapsed;
    if (Dom.syncRefreshBtn) Dom.syncRefreshBtn.disabled = true;
    if (Dom.syncTimeBlock) Dom.syncTimeBlock.textContent = "";
    if (Dom.dbChangesLog) Dom.dbChangesLog.style.display = "none";
    if (Dom.changeLogFilters) Dom.changeLogFilters.style.display = "none";
    if (Dom.changeLogPagination) Dom.changeLogPagination.style.display = "none";
    if (Dom.changeFilterCount) {
        Dom.changeFilterCount.style.display = "none";
        Dom.changeFilterCount.innerText = "";
    }
    updateSyncReason("");

    try {
        const workerSynced = await requestBackgroundSync("brands");
        if (workerSynced) {
            const cached = await new Promise(resolve => {
                chrome.storage.local.get(["hubDb", "hubDbTime"], resolve);
            });
            if (cached?.hubDb) {
                State.hubDatabase = cached.hubDb;
                State.hubDbTime = cached.hubDbTime || Date.now();
                buildUniqueBrandsList();
                trackDatabaseChanges(State.uniqueBrandsList);
            } else {
                await updateDatabaseFromRemote();
            }
        } else {
            await updateDatabaseFromRemote();
        }

        if (State.hubDbTime) {
            setSyncStatus("☑️", State.hubDbTime, "status-ok", "Оновлено");
        }
        clearSyncReason();
    } catch (err) {
        const errorMessage = err?.message || "Unknown error";
        if (State.hubDbTime) {
            setSyncStatus("❌", State.hubDbTime, "status-error", "Офлайн");
        } else {
            setSyncStatus("❌", null, "status-error", "Офлайн");
        }
        updateSyncReason(`Не вдалося оновити дані: ${errorMessage}`);
        console.warn("Manual refresh failed:", err);
    } finally {
        if (wasExpanded) {
            if (Dom.dbChangesLog) Dom.dbChangesLog.style.display = "flex";
            if (Dom.changeLogFilters) Dom.changeLogFilters.style.display = "flex";
        }
        if (typeof syncChangeLogFiltersVisibility === "function") {
            syncChangeLogFiltersVisibility();
        }
        if (Dom.syncRefreshBtn) Dom.syncRefreshBtn.disabled = false;
    }
}

function trackDatabaseChanges(newUniqueBrands) {
    chrome.storage.local.get(["previousUniqueBrandsRaw", "savedChangesHistory", "lastHistoryClearTimestamp"], result => {
        const oldBrandsRaw   = result.previousUniqueBrandsRaw || [];
        let   currentHistory = result.savedChangesHistory || [];

        const oldMap = {};
        oldBrandsRaw.forEach(b => { if (b.fullName) oldMap[b.fullName.trim()] = b; });
        const newMap = {};
        newUniqueBrands.forEach(b => { if (b.fullName) newMap[b.fullName.trim()] = b; });

        const oldNames = Object.keys(oldMap);
        const newNames = Object.keys(newMap);
        const detectedChanges = [];

        newNames.forEach(name => {
            if (!oldNames.includes(name))
                detectedChanges.push({ type: "added", name, timestamp: Date.now(), brandObj: newMap[name], details: [] });
        });

        newNames.forEach(name => {
            if (oldMap[name]) {
                const diffs = [];
                Object.keys(FIELD_LABELS).forEach(field => {
                    const oldVal = (oldMap[name][field] || "").trim();
                    const newVal = (newMap[name][field] || "").trim();
                    if (oldVal !== newVal)
                        diffs.push({ field: FIELD_LABELS[field], old: oldVal || "-", new: newVal || "-" });
                });
                if (diffs.length > 0)
                    detectedChanges.push({ type: "modified", name, timestamp: Date.now(), brandObj: newMap[name], details: diffs });
            }
        });

        oldNames.forEach(name => {
            if (!newNames.includes(name))
                detectedChanges.push({ type: "removed", name, timestamp: Date.now(), brandObj: null, details: [] });
        });

        if (detectedChanges.length > 0) {
            currentHistory = [...detectedChanges, ...currentHistory];
            if (currentHistory.length > 1000) currentHistory = currentHistory.slice(0, 1000);
            chrome.storage.local.set({ savedChangesHistory: currentHistory });
        }

        renderChangesLog(currentHistory);
        chrome.storage.local.set({ previousUniqueBrandsRaw: newUniqueBrands });
    });
}

function setParametersStatus(statusLabel, timestamp, statusClass = "status-ok", statusTitle = "") {
    if (!Dom.parametersStatusBlock) return;
    Dom.parametersStatusBlock.textContent = statusLabel;
    Dom.parametersStatusBlock.title = statusTitle;
    Dom.parametersStatusBlock.classList.remove("status-ok", "status-warn", "status-error", "is-updating");
    Dom.parametersStatusBlock.classList.add(statusClass);
    if (Dom.parametersTimeBlock) {
        Dom.parametersTimeBlock.textContent = timestamp ? formatSyncTimestamp(timestamp) : "";
    }
}

function updateParametersSyncReason(reasonMessage) {
    if (!Dom.parametersReasonBlock) return;
    if (reasonMessage) {
        Dom.parametersReasonBlock.textContent = reasonMessage;
        Dom.parametersReasonBlock.style.display = "block";
    } else {
        Dom.parametersReasonBlock.textContent = "";
        Dom.parametersReasonBlock.style.display = "none";
    }
}

async function refreshParametersSheetRemote() {
    const wasExpanded = !State.isParametersBlockCollapsed;
    if (Dom.parametersRefreshBtn) Dom.parametersRefreshBtn.disabled = true;
    if (Dom.parametersTimeBlock) Dom.parametersTimeBlock.textContent = "";
    if (Dom.parametersChangesLog) Dom.parametersChangesLog.style.display = "none";
    if (Dom.parametersChangeLogFilters) Dom.parametersChangeLogFilters.style.display = "none";
    if (Dom.parametersFilterCount) {
        Dom.parametersFilterCount.style.display = "none";
        Dom.parametersFilterCount.innerText = "";
    }
    if (Dom.parametersChangeLogPagination) Dom.parametersChangeLogPagination.style.display = "none";
    updateParametersSyncReason("");

    try {
        let result = null;
        const workerSynced = await requestBackgroundSync("parameters");

        if (workerSynced) {
            const cached = await new Promise(resolve => {
                chrome.storage.local.get([
                    "categorySheetRows",
                    "categorySheetUpdatedAt",
                    "categorySheetError",
                    "parametersChangesHistory",
                ], resolve);
            });

            result = {
                rows: Array.isArray(cached.categorySheetRows) ? cached.categorySheetRows : [],
                updatedAt: cached.categorySheetUpdatedAt || null,
                error: String(cached.categorySheetError || ""),
                history: Array.isArray(cached.parametersChangesHistory) ? cached.parametersChangesHistory : [],
            };

            State.categoryRows = result.rows;
            State.categoryLastSync = result.updatedAt;
            State.categoryLastError = result.error;

            if (result.error) {
                throw new Error(result.error);
            }
        } else {
            result = await updateCategorySheetFromRemote();
        }

        State.parametersChangesHistory = result.history || [];
        State.parametersCurrentChangeLogPage = 1;
        State.parametersChangeLogPageByFilter = { all: 1 };
        renderParametersChangesLog(State.parametersChangesHistory);

        if (result.updatedAt) {
            setParametersStatus("☑️", result.updatedAt, "status-ok", "Оновлено");
        }
        updateParametersSyncReason("");
    } catch (err) {
        const errorMessage = err?.message || "Unknown error";
        if (State.categoryLastSync) {
            setParametersStatus("❌", State.categoryLastSync, "status-error", "Офлайн");
        } else {
            setParametersStatus("❌", null, "status-error", "Офлайн");
        }
        updateParametersSyncReason(`Не вдалося оновити дані: ${errorMessage}`);
        console.warn("Parameters refresh failed:", err);
    } finally {
        if (wasExpanded) {
            if (Dom.parametersChangesLog) Dom.parametersChangesLog.style.display = "flex";
            if (Dom.parametersChangeLogFilters) Dom.parametersChangeLogFilters.style.display = "flex";
        }
        if (typeof syncParametersChangeLogFiltersVisibility === "function") {
            syncParametersChangeLogFiltersVisibility();
        }
        if (Dom.parametersRefreshBtn) Dom.parametersRefreshBtn.disabled = false;
    }
}

async function loadParametersSheet() {
    try {
        const cached = await new Promise(resolve => {
            chrome.storage.local.get([
                "parametersChangesHistory",
                "parametersArchivedChangesHistory",
                "parametersLastHistoryClearTimestamp",
            ], resolve);
        });

        const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
        const lastClear = cached.parametersLastHistoryClearTimestamp || Date.now();

        if (!cached.parametersLastHistoryClearTimestamp) {
            chrome.storage.local.set({ parametersLastHistoryClearTimestamp: Date.now() });
        } else if (Date.now() - lastClear > ninetyDaysMs) {
            chrome.storage.local.set({
                parametersChangesHistory: [],
                parametersArchivedChangesHistory: [],
                parametersLastHistoryClearTimestamp: Date.now(),
            });
            cached.parametersChangesHistory = [];
            cached.parametersArchivedChangesHistory = [];
        }

        State.parametersArchivedChangesHistory = cached.parametersArchivedChangesHistory || [];

        const result = await loadCategorySheet(false);
        State.parametersChangesHistory = Array.isArray(cached.parametersChangesHistory)
            ? cached.parametersChangesHistory
            : (result.history || []);
        State.categoryRows = result.rows || [];
        State.categoryLastSync = result.updatedAt || null;
        State.categoryLastError = result.error || "";

        if (result.error) {
            setParametersStatus("❌", result.updatedAt, "status-error", "Помилка");
            updateParametersSyncReason(`Помилка: ${result.error}`);
        } else if (result.updatedAt) {
            const timeDiff = Date.now() - result.updatedAt;
            if (timeDiff < REFRESH_INTERVAL) {
                setParametersStatus("☑️", result.updatedAt, "status-ok", "Готово");
            } else {
                setParametersStatus("⚠️", result.updatedAt, "status-warn", "Застаріло");
            }
            updateParametersSyncReason("");
        }

        renderParametersChangesLog(State.parametersChangesHistory);

        if (result.updatedAt) {
            const timeDiff = Date.now() - result.updatedAt;
            if (timeDiff >= REFRESH_INTERVAL) {
                updateCategorySheetFromRemote().then(freshResult => {
                    State.parametersChangesHistory = freshResult.history || [];
                    State.categoryRows = freshResult.rows || [];
                    State.categoryLastSync = freshResult.updatedAt || null;
                    State.categoryLastError = freshResult.error || "";
                    if (freshResult.updatedAt) {
                        setParametersStatus("☑️", freshResult.updatedAt, "status-ok", "Готово");
                    }
                    updateParametersSyncReason("");
                    renderParametersChangesLog(State.parametersChangesHistory);
                }).catch(err => {
                    setParametersStatus("❌", result.updatedAt, "status-error", "Офлайн");
                    updateParametersSyncReason(`Не вдалося оновити з сервера: ${err?.message || "Unknown error"}`);
                    console.warn("Parameters sync failed, using cached data:", err);
                });
            }
            return;
        }

        const freshResult = await updateCategorySheetFromRemote();
        State.parametersChangesHistory = freshResult.history || [];
        State.categoryRows = freshResult.rows || [];
        State.categoryLastSync = freshResult.updatedAt || null;
        State.categoryLastError = freshResult.error || "";
        if (freshResult.updatedAt) {
            setParametersStatus("☑️", freshResult.updatedAt, "status-ok", "Готово");
            updateParametersSyncReason("");
        }
        renderParametersChangesLog(State.parametersChangesHistory);
    } catch (err) {
        setParametersStatus("❌", null, "status-error", "Помилка завантаження");
        updateParametersSyncReason(`Не вдалося завантажити параметри: ${err?.message || "Unknown error"}`);
    }
}
