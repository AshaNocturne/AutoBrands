// ============================================================
// app.js — точка входу: підключення подій і ініціалізація
// ============================================================

// ---------- Текстові константи для фільтрів (placeholder) ----------
const FILTER_PLACEHOLDERS = {
    "all":              "Введіть назву бренду...",
    "fullName":         "Пошук за Gomer...",
    "enterpriseName":   "Пошук за Enterprise...",
    "prefix":           "Пошук за приставкою...",
    "synonyms":         "Пошук за синонімом...",
};

const PARAMETERS_TAB_DISABLED = false;

// Функція для оновлення placeholder'у при зміні фільтру
function updateSearchPlaceholder(filterValue) {
    if (!Dom.brandSearch) return;
    const placeholder = FILTER_PLACEHOLDERS[filterValue] || FILTER_PLACEHOLDERS["all"];
    Dom.brandSearch.placeholder = placeholder;
}

let isSettingsInlineOpen = false;
let settingsSaveToastTimer = null;
const settingsPersistTimers = Object.create(null);

function getSettingsBindings() {
    return [
        { key: "enterpriseCopyEnabled", toggle: Dom.enterpriseCopyToggle, stateEl: Dom.enterpriseCopyState },
        { key: "hotkeysEnabled", toggle: Dom.hotkeysToggle, stateEl: Dom.hotkeysState },
        { key: "shortcutsEnabled", toggle: Dom.shortcutsToggle, stateEl: Dom.shortcutsState },
        { key: "verificationEnabled", toggle: Dom.verificationToggle, stateEl: Dom.verificationState },
    ];
}

function setSingleSettingStatus(stateEl, enabled) {
    if (!stateEl) return;
    const on = !!enabled;
    stateEl.textContent = on ? "Увімкнено" : "Вимкнено";
    stateEl.classList.toggle("is-on", on);
}

function syncSettingsStatusLabels() {
    getSettingsBindings().forEach(item => {
        if (!item.toggle) return;
        setSingleSettingStatus(item.stateEl, item.toggle.checked);
    });
}

function showSettingsSavedToast(message = "Збережено") {
    if (!Dom.settingsInlinePanel) return;

    let toast = Dom.settingsInlinePanel.querySelector(".settings-save-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "settings-save-toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        Dom.settingsInlinePanel.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("is-visible");

    if (settingsSaveToastTimer) {
        clearTimeout(settingsSaveToastTimer);
    }
    settingsSaveToastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 1000);
}

function persistSettingFlag(key, value, options = {}) {
    const { showToast = true } = options;
    if (settingsPersistTimers[key]) {
        clearTimeout(settingsPersistTimers[key]);
    }

    settingsPersistTimers[key] = setTimeout(() => {
        chrome.storage.local.set({ [key]: !!value }, () => {
            if (chrome.runtime?.lastError) {
                const errMessage = chrome.runtime.lastError.message || "Unknown storage error";
                console.warn(`[settings] save failed: ${key} -> ${String(!!value)} (${errMessage})`);
                if (showToast) showSettingsSavedToast("Помилка збереження");
                return;
            }
            if (showToast) showSettingsSavedToast("Збережено");
        });
    }, 140);
}

function applySettingsValues(values, options = {}) {
    const { save = true, showToast = true } = options;
    getSettingsBindings().forEach(item => {
        if (!item.toggle) return;
        item.toggle.checked = !!values[item.key];
    });
    syncSettingsStatusLabels();

    if (!save) return;

    const payload = {
        enterpriseCopyEnabled: !!values.enterpriseCopyEnabled,
        hotkeysEnabled: !!values.hotkeysEnabled,
        shortcutsEnabled: !!values.shortcutsEnabled,
        verificationEnabled: !!values.verificationEnabled,
    };

    chrome.storage.local.set(payload, () => {
        if (chrome.runtime?.lastError) {
            const errMessage = chrome.runtime.lastError.message || "Unknown storage error";
            console.warn(`[settings] bulk save failed (${errMessage})`);
            if (showToast) showSettingsSavedToast("Помилка збереження");
            return;
        }
        if (showToast) showSettingsSavedToast("Збережено");
    });
}

function syncSettingsGearState() {
    if (!Dom.openSettingsBtn) return;
    Dom.openSettingsBtn.classList.toggle("is-active", isSettingsInlineOpen);
    Dom.openSettingsBtn.setAttribute("aria-expanded", isSettingsInlineOpen ? "true" : "false");
    Dom.openSettingsBtn.setAttribute("aria-pressed", isSettingsInlineOpen ? "true" : "false");
    Dom.openSettingsBtn.setAttribute("aria-label", isSettingsInlineOpen ? "Закрити налаштування" : "Відкрити налаштування");
    Dom.openSettingsBtn.setAttribute("title", isSettingsInlineOpen ? "Закрити налаштування" : "Відкрити налаштування");
}

function setSettingsInlineVisible(visible, options = {}) {
    const { persist = true, focusFirstControl = true, restoreFocus = false } = options;
    if (!Dom.settingsInlinePanel) return;

    isSettingsInlineOpen = !!visible;
    State.isSettingsInlineOpen = isSettingsInlineOpen;
    Dom.settingsInlinePanel.setAttribute("aria-hidden", isSettingsInlineOpen ? "false" : "true");
    syncSettingsGearState();

    if (persist && typeof saveExtensionState === "function") {
        saveExtensionState();
    }

    if (!isSettingsInlineOpen) {
        Dom.settingsInlinePanel.classList.remove("is-open");
        Dom.settingsInlinePanel.hidden = true;
        Dom.settingsInlinePanel.style.display = "none";

        if (restoreFocus && Dom.openSettingsBtn) {
            Dom.openSettingsBtn.focus();
        }
        return;
    }

    Dom.settingsInlinePanel.hidden = false;
    Dom.settingsInlinePanel.style.display = "block";
    requestAnimationFrame(() => {
        Dom.settingsInlinePanel.classList.add("is-open");
    });

    const tabButtons = [Dom.mainTabBrand, Dom.mainTabLogistics, Dom.mainTabParameters];
    tabButtons.forEach(btn => {
        if (!btn) return;
        btn.classList.remove("is-active");
        btn.setAttribute("aria-selected", "false");
    });

    const tabPanels = [Dom.tabPanelBrand, Dom.tabPanelLogistics, Dom.tabPanelParameters];
    tabPanels.forEach(panel => {
        if (!panel) return;
        panel.style.display = "none";
        panel.classList.remove("is-active");
        panel.hidden = true;
        panel.setAttribute("aria-hidden", "true");
        panel.setAttribute("inert", "");
    });

    if (focusFirstControl) {
        const firstControl = Dom.settingsInlinePanel.querySelector("input, button, select, textarea, a[href]");
        if (firstControl && typeof firstControl.focus === "function") {
            firstControl.focus();
        }
    }
}

function initGearSettingsToggles() {
    if (!Dom.enterpriseCopyToggle && !Dom.hotkeysToggle && !Dom.shortcutsToggle && !Dom.verificationToggle) return;

    chrome.storage.local.get(["enterpriseCopyEnabled", "hotkeysEnabled", "shortcutsEnabled", "verificationEnabled"], result => {
        applySettingsValues({
            enterpriseCopyEnabled: !!result.enterpriseCopyEnabled,
            hotkeysEnabled: !!result.hotkeysEnabled,
            shortcutsEnabled: !!result.shortcutsEnabled,
            verificationEnabled: !!result.verificationEnabled,
        }, { save: false });
    });

    if (Dom.enterpriseCopyToggle) {
        Dom.enterpriseCopyToggle.addEventListener("change", () => {
            syncSettingsStatusLabels();
            persistSettingFlag("enterpriseCopyEnabled", Dom.enterpriseCopyToggle.checked);
        });
    }

    if (Dom.hotkeysToggle) {
        Dom.hotkeysToggle.addEventListener("change", () => {
            syncSettingsStatusLabels();
            persistSettingFlag("hotkeysEnabled", Dom.hotkeysToggle.checked);
        });
    }

    if (Dom.shortcutsToggle) {
        Dom.shortcutsToggle.addEventListener("change", () => {
            syncSettingsStatusLabels();
            persistSettingFlag("shortcutsEnabled", Dom.shortcutsToggle.checked);
        });
    }

    if (Dom.verificationToggle) {
        Dom.verificationToggle.addEventListener("change", () => {
            syncSettingsStatusLabels();
            persistSettingFlag("verificationEnabled", Dom.verificationToggle.checked);
        });
    }

    if (Dom.settingsEnableAllBtn) {
        Dom.settingsEnableAllBtn.addEventListener("click", () => {
            applySettingsValues({
                enterpriseCopyEnabled: true,
                hotkeysEnabled: true,
                shortcutsEnabled: true,
                verificationEnabled: true,
            });
        });
    }

    if (Dom.settingsDisableAllBtn) {
        Dom.settingsDisableAllBtn.addEventListener("click", () => {
            applySettingsValues({
                enterpriseCopyEnabled: false,
                hotkeysEnabled: false,
                shortcutsEnabled: false,
                verificationEnabled: false,
            });
        });
    }
}

function collapseAllTabSections() {
    State.isSyncBlockCollapsed = true;
    State.isRequestBlockCollapsed = true;
    State.isParametersBlockCollapsed = true;

    if (Dom.dbChangesLog) Dom.dbChangesLog.style.display = "none";
    if (Dom.requestChangesLog) Dom.requestChangesLog.style.display = "none";
    if (Dom.parametersChangesLog) Dom.parametersChangesLog.style.display = "none";

    if (Dom.changeLogFilters) Dom.changeLogFilters.style.display = "none";
    if (Dom.changeFilterCount) Dom.changeFilterCount.style.display = "none";
    if (Dom.changeLogPagination) Dom.changeLogPagination.style.display = "none";

    if (Dom.parametersChangeLogFilters) Dom.parametersChangeLogFilters.style.display = "none";
    if (Dom.parametersFilterCount) Dom.parametersFilterCount.style.display = "none";
    if (Dom.parametersChangeLogPagination) Dom.parametersChangeLogPagination.style.display = "none";

    if (Dom.syncCollapseText) Dom.syncCollapseText.classList.remove("expanded");
    if (Dom.requestCollapseText) Dom.requestCollapseText.classList.remove("expanded");
    if (Dom.parametersCollapseText) Dom.parametersCollapseText.classList.remove("expanded");

    if (Dom.requestToggleHeader) Dom.requestToggleHeader.classList.add("is-collapsed");
    const requestContainerEl = document.getElementById("requestContainer");
    if (requestContainerEl) requestContainerEl.classList.add("is-collapsed");
}

function setMainTab(tabName, options = {}) {
    const { persist = true } = options;
    const allowedTabs = ["brand", "logistics", "parameters"];
    let normalizedTab = allowedTabs.includes(tabName) ? tabName : "brand";
    if (PARAMETERS_TAB_DISABLED && normalizedTab === "parameters") {
        normalizedTab = "brand";
    }
    State.activeMainTab = normalizedTab;

    const tabButtons = [
        { key: "brand", el: Dom.mainTabBrand },
        { key: "logistics", el: Dom.mainTabLogistics },
        { key: "parameters", el: Dom.mainTabParameters },
    ];
    const tabPanels = [
        { key: "brand", el: Dom.tabPanelBrand },
        { key: "logistics", el: Dom.tabPanelLogistics },
        { key: "parameters", el: Dom.tabPanelParameters },
    ];

    tabButtons.forEach(({ key, el }) => {
        if (!el) return;
        const active = key === normalizedTab;
        el.classList.toggle("is-active", active);
        el.setAttribute("aria-selected", active ? "true" : "false");
    });

    tabPanels.forEach(({ key, el }) => {
        if (!el) return;
        const active = key === normalizedTab;
        el.style.display = active ? "block" : "none";
        el.classList.toggle("is-active", active);
        el.hidden = !active;
        el.setAttribute("aria-hidden", active ? "false" : "true");

        // Keep only selected tab interactive.
        if (active) {
            el.removeAttribute("inert");
        } else {
            el.setAttribute("inert", "");
        }
    });

    if (document && document.body) {
        document.body.classList.remove("theme-brand", "theme-logistics", "theme-parameters");
        document.body.classList.add(`theme-${normalizedTab}`);
    }

    if (persist && typeof saveExtensionState === "function") {
        saveExtensionState();
    }
}

function readVendorNameFromActiveAutopartTab() {
    return new Promise(resolve => {
        try {
            if (!chrome?.tabs || !chrome?.scripting) return resolve("");

            chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                if (chrome.runtime.lastError || !Array.isArray(tabs) || tabs.length === 0) {
                    return resolve("");
                }

                const activeTab = tabs[0];
                if (!activeTab || typeof activeTab.id !== "number") return resolve("");

                const tabUrl = String(activeTab.url || "");
                if (!/^https:\/\/autopart\.rozetka\.company\//i.test(tabUrl)) return resolve("");

                chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    func: () => {
                        const input = document.querySelector('input#vendor_name[name="vendor_name"], input[name="vendor_name"]');
                        if (!input) return "";
                        const value = typeof input.value === "string" ? input.value.trim() : "";
                        return value;
                    },
                }, results => {
                    if (chrome.runtime.lastError || !Array.isArray(results) || results.length === 0) {
                        return resolve("");
                    }
                    const extracted = String(results[0]?.result || "").trim();
                    resolve(extracted);
                });
            });
        } catch (e) {
            resolve("");
        }
    });
}

function applyVendorNameFromPage(vendorName) {
    const value = String(vendorName || "").trim();
    if (!value || !Dom.brandSearch) return false;

    const currentInput = String(Dom.brandSearch.value || "").trim();
    const currentSelected = String(State.currentlySelectedBrand || "").trim();
    const norm = typeof normalizeKey === "function" ? normalizeKey(value) : value.toUpperCase();
    const normCurrentInput = typeof normalizeKey === "function" ? normalizeKey(currentInput) : currentInput.toUpperCase();
    const normCurrentSelected = typeof normalizeKey === "function" ? normalizeKey(currentSelected) : currentSelected.toUpperCase();

    // Avoid extra re-render and storage writes when page value is already shown.
    if (norm && (norm === normCurrentInput || norm === normCurrentSelected)) {
        return true;
    }

    Dom.brandSearch.value = value;
    if (Dom.clearSearch) Dom.clearSearch.style.display = "flex";
    if (Dom.searchSuggestions) Dom.searchSuggestions.style.display = "none";
    if (Dom.searchHint) Dom.searchHint.style.display = "none";

    if (typeof findBrandWithReason === "function") {
        const prevFilter = State.searchFilter;
        State.searchFilter = "all";
        const found = findBrandWithReason(value);
        State.searchFilter = prevFilter;

        if (found?.brand && typeof showBrandInfo === "function") {
            Dom.brandSearch.value = found.brand.fullName || value;
            showBrandInfo(found.brand);
            return true;
        }
    }

    window._searchRequestToken += 1;
    const token = window._searchRequestToken;
    processBrandSearchInput(value, token);
    saveExtensionState();
    return true;
}

// ---------- Логотип / повернення на головну ----------

if (Dom.logoHomeBtn) {
    Dom.logoHomeBtn.addEventListener("click", () => {
        setSettingsInlineVisible(false);
        setMainTab("brand", { persist: false });
        Dom.brandSearch.value                  = "";
        Dom.clearSearch.style.display          = "none";
        Dom.infoCard.style.display             = "none";
        Dom.searchSuggestions.style.display    = "none";
        Dom.CampResultsContainer.style.display = "none";
        State.currentlySelectedBrand           = "";
        State.currentReportData                = [];
        State.exportDataArray                  = null;
        State.searchFilter                     = "all";
        if (Dom.searchFilterSelect) Dom.searchFilterSelect.value = "all";
        updateSearchPlaceholder("all");
        if (Dom.feedbackFormBlock) {
            Dom.feedbackFormBlock.style.display = "none";
            syncFeedbackBrandField();
        }
        if (Dom.columnSelectorBlock) Dom.columnSelectorBlock.style.display = "none";
        if (Dom.columnSelectorList) Dom.columnSelectorList.textContent = "";
        if (Dom.columnSelectorBody) Dom.columnSelectorBody.style.display = "none";
        if (Dom.columnCollapseText) Dom.columnCollapseText.classList.remove("expanded");
        State.pendingFileData = null;
        State.pendingFileName = null;
        if (Dom.fileUploadInput) Dom.fileUploadInput.value = "";
        if (typeof window.clearColumnSelectorSession === "function") {
            window.clearColumnSelectorSession();
        }
        if (Dom.historyContainer) Dom.historyContainer.style.display = "block";
        if (Dom.dbChangesLog) {
            Dom.dbChangesLog.style.display = "none";
        }
        if (Dom.changeLogFilters) {
            Dom.changeLogFilters.style.display = "none";
        }
        if (Dom.changeFilterCount) {
            Dom.changeFilterCount.style.display = "none";
        }
        if (Dom.changeLogPagination) {
            Dom.changeLogPagination.style.display = "none";
        }
        if (Dom.syncCollapseText) {
            Dom.syncCollapseText.classList.remove("expanded");
        }
        if (Dom.requestChangesLog) {
            Dom.requestChangesLog.style.display = "none";
        }
        if (Dom.requestCollapseText) {
            Dom.requestCollapseText.classList.remove("expanded");
        }
        if (Dom.requestToggleHeader) {
            Dom.requestToggleHeader.classList.add("is-collapsed");
        }
        const requestContainerEl = document.getElementById("requestContainer");
        if (requestContainerEl) {
            requestContainerEl.classList.add("is-collapsed");
        }
        State.isSyncBlockCollapsed = true;
        State.isRequestBlockCollapsed = true;
        State.changeLogFilter = "all";
        State.currentChangeLogPage = 1;
        State.changeLogPageByFilter = { all: 1 };
        updateChangeFilterButtons();
        if (Dom.searchHint) Dom.searchHint.style.display = "none";
        saveExtensionState();
    });
}

if (Dom.openSettingsBtn) {
    Dom.openSettingsBtn.addEventListener("click", () => {
        if (isSettingsInlineOpen) {
            setSettingsInlineVisible(false);
            setMainTab(State.activeMainTab || "brand", { persist: false });
        } else {
            setSettingsInlineVisible(true, { focusFirstControl: true });
        }
    });
}

function isSameCalendarMonth(timestampA, timestampB) {
    if (!timestampA || !timestampB) return false;
    const a = new Date(timestampA);
    const b = new Date(timestampB);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function clearSavedFilterFields() {
    if (Dom.brandSearch) Dom.brandSearch.value = "";
    if (Dom.clearSearch) Dom.clearSearch.style.display = "none";
    if (Dom.searchSuggestions) Dom.searchSuggestions.style.display = "none";
    if (Dom.searchHint) Dom.searchHint.style.display = "none";
    if (Dom.infoCard) Dom.infoCard.style.display = "none";
    if (Dom.historyContainer) Dom.historyContainer.style.display = "block";
    if (Dom.dbChangesLog) Dom.dbChangesLog.style.display = "none";
    State.currentlySelectedBrand = "";
    State.currentReportData = [];
    State.exportDataArray = null;
    State.isExcelArrayExport = false;
    State.searchFilter = "all";
    if (Dom.searchFilterSelect) Dom.searchFilterSelect.value = "all";
    updateSearchPlaceholder("all");
    if (Dom.resultsTitle) Dom.resultsTitle.innerText = "";
    State.changeLogFilter = "all";
    updateChangeFilterButtons();
    syncFeedbackBrandField();
}

function maybeResetSavedFiltersMonthly() {
    return new Promise(resolve => {
        chrome.storage.local.get(["filtersLastResetTimestamp", "extensionState"], result => {
            const now = Date.now();
            if (!isSameCalendarMonth(result.filtersLastResetTimestamp, now)) {
                chrome.storage.local.set({
                    extensionState: {
                        searchValue:            "",
                        infoCardVisible:        false,
                        resultsVisible:         false,
                        reportData:             [],
                        exportDataArray:        null,
                        isExcelArrayExport:     false,
                        currentlySelectedBrand: "",
                        resultsTitleText:       "",
                    },
                    filtersLastResetTimestamp: now,
                }, () => {
                    clearSavedFilterFields();
                    resolve(true);
                });
            } else {
                resolve(false);
            }
        });
    });
}

// ---------- Згортання блоків ----------

if (Dom.syncToggleHeader && Dom.dbChangesLog) {
    Dom.syncToggleHeader.addEventListener("click", () => {
        const expanded = Dom.dbChangesLog.style.display !== "flex" && Dom.dbChangesLog.style.display !== "block";
        State.isSyncBlockCollapsed = !expanded;
        if (expanded) {
            renderChangesLog(State.currentChangesHistory || []);
        }
        Dom.dbChangesLog.style.display = expanded ? "flex" : "none";
        if (Dom.syncCollapseText) Dom.syncCollapseText.classList.toggle("expanded", expanded);
        syncChangeLogFiltersVisibility();
        saveExtensionState();
    });
}

// Обробник для параметрів
if (Dom.parametersToggleHeader && Dom.parametersChangesLog) {
    Dom.parametersToggleHeader.addEventListener("click", () => {
        const expanded = Dom.parametersChangesLog.style.display !== "flex" && Dom.parametersChangesLog.style.display !== "block";
        State.isParametersBlockCollapsed = !expanded;
        if (expanded) {
            renderParametersChangesLog(State.parametersChangesHistory || []);
        }
        Dom.parametersChangesLog.style.display = expanded ? "flex" : "none";
        if (Dom.parametersCollapseText) Dom.parametersCollapseText.classList.toggle("expanded", expanded);
        syncParametersChangeLogFiltersVisibility();
        saveExtensionState();
    });
}

if (Dom.requestToggleHeader && Dom.requestChangesLog) {
    const requestContainerEl = document.getElementById("requestContainer");
    Dom.requestToggleHeader.addEventListener("click", () => {
        const expanded = Dom.requestChangesLog.style.display !== "flex" && Dom.requestChangesLog.style.display !== "block";
        Dom.requestChangesLog.style.display = expanded ? "flex" : "none";
        State.isRequestBlockCollapsed = !expanded;
        if (Dom.requestCollapseText) Dom.requestCollapseText.classList.toggle("expanded", expanded);
        Dom.requestToggleHeader.classList.toggle("is-collapsed", !expanded);
        if (requestContainerEl) requestContainerEl.classList.toggle("is-collapsed", !expanded);
        saveExtensionState();
    });
}

// ---------- Скачати лог ----------

if (Dom.downloadLogBtn) {
    Dom.downloadLogBtn.addEventListener("click", e => {
        e.stopPropagation();
        downloadChangesHistory();
    });
}

if (Dom.syncRefreshBtn) {
    Dom.syncRefreshBtn.addEventListener("click", async e => {
        e.stopPropagation();
        await refreshDatabaseRemote();
    });
}

// Обробник оновлення параметрів
if (Dom.parametersRefreshBtn) {
    Dom.parametersRefreshBtn.addEventListener("click", async e => {
        e.stopPropagation();
        await refreshParametersSheetRemote();
    });
}

// ---------- Пошук ----------
// debounce helper to reduce frequency of search computations
// initial debounce value (ms) — may be overridden from storage
let DEBOUNCE_MS = 150;

// request token to avoid rendering stale results
window._searchRequestToken = 1;

// create a DocumentFragment with highlighted matches (safe, no innerHTML)
function createHighlightedFragment(text, query) {
    const frag = document.createDocumentFragment();
    if (!query) { frag.appendChild(document.createTextNode(text)); return frag; }
    try {
        const q = String(query).trim();
        if (!q) { frag.appendChild(document.createTextNode(text)); return frag; }
        const re = new RegExp(q.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'ig');
        let lastIndex = 0;
        let match;
        while ((match = re.exec(text)) !== null) {
            if (match.index > lastIndex) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }
            const mark = document.createElement('mark');
            mark.className = 'search-hl';
            mark.textContent = match[0];
            frag.appendChild(mark);
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        return frag;
    } catch (e) {
        frag.appendChild(document.createTextNode(text));
        return frag;
    }
}

function shouldHighlightSearchMatches() {
    const filter = (State && State.searchFilter) || "all";
    return filter === "all" || filter === "fullName" || filter === "enterpriseName";
}

function processBrandSearchInput(val, token) {
    if (!val) {
        if (Dom.infoCard) Dom.infoCard.style.display = "none";
        if (Dom.searchSuggestions) Dom.searchSuggestions.style.display = "none";
        if (Dom.searchHint) Dom.searchHint.style.display = "none";
        State.currentlySelectedBrand = "";
        if (Dom.historyContainer) Dom.historyContainer.style.display = "block";
        if (Dom.CampResultsContainer) Dom.CampResultsContainer.style.display = "none";
        syncFeedbackBrandField();
        saveExtensionState();
        return;
    }

    // stale guard: ensure token matches current request
    if (typeof token === 'number' && token !== window._searchRequestToken) return;

    const sug = getFilteredSuggestions(val);
    if (Dom.searchSuggestions) Dom.searchSuggestions.textContent = '';

    if (sug.length === 1 && (!sug[0].brand)) {
        if (Dom.searchHint) {
            Dom.searchHint.innerText = sug[0].displayName || "Бренд не знайдено. Спробуйте іншу назву або префікс.";
            Dom.searchHint.style.display = "block";
        }
        if (Dom.searchSuggestions) Dom.searchSuggestions.style.display = "none";
        if (Dom.infoCard) Dom.infoCard.style.display = "none";
        return;
    } else if (sug.length > 0) {
        if (Dom.searchHint) Dom.searchHint.style.display = "none";
        // render suggestions with highlight and keyboard navigation
        let idx = 0;
        sug.forEach(item => {
            if (!item || !item.brand) return;
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            // accessibility
            div.setAttribute('role', 'option');
            div.id = `search-sugg-${token || 't'}-${idx}`;
            const label = document.createElement('span');
            label.className = 'label';
            label.style.fontWeight = 600;
            if (shouldHighlightSearchMatches()) {
                const frag = createHighlightedFragment(item.displayName || item.brand.fullName || '', val);
                label.appendChild(frag);
            } else {
                label.appendChild(document.createTextNode(item.displayName || item.brand.fullName || ''));
            }
            const badge = document.createElement('span');
            badge.className = 'search-reason-badge';
            badge.textContent = item.reason || '';
            div.appendChild(label);
            div.appendChild(badge);
            div.setAttribute('data-index', String(idx));
            div.addEventListener('click', () => {
                Dom.brandSearch.value = item.brand.fullName;
                if (Dom.searchSuggestions) Dom.searchSuggestions.style.display = 'none';
                if (Dom.searchHint) Dom.searchHint.style.display = 'none';
                showBrandInfo(item.brand);
            });
            if (Dom.searchSuggestions) Dom.searchSuggestions.appendChild(div);
            idx += 1;
        });
        if (Dom.searchSuggestions) {
            Dom.searchSuggestions.setAttribute('role', 'listbox');
            Dom.searchSuggestions.setAttribute('aria-label', 'Підказки брендів');
            Dom.searchSuggestions.querySelectorAll('.suggestion-item').forEach(el => el.classList.remove('active'));
            Dom.searchSuggestions.dataset.activeIndex = "-1";
            Dom.searchSuggestions.style.display = "block";
            updateAriaActive(Dom.searchSuggestions, Dom.brandSearch);
        }
    } else {
        if (Dom.searchSuggestions) Dom.searchSuggestions.style.display = "none";
        if (Dom.searchHint) Dom.searchHint.style.display = "none";
        if (Dom.infoCard) Dom.infoCard.style.display = "none";
    }
}

// keyboard navigation for suggestions
if (Dom.brandSearch) {
    Dom.brandSearch.addEventListener('keydown', e => {
        const list = Dom.searchSuggestions;
        if (!list || list.style.display === 'none') return;
        const items = Array.from(list.querySelectorAll('.suggestion-item'));
        if (items.length === 0) return;
        let active = parseInt(list.dataset.activeIndex || "-1", 10);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            active = Math.min(items.length - 1, active + 1);
            setActive(items, active, list);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            active = Math.max(-1, active - 1);
            setActive(items, active, list);
        } else if (e.key === 'Enter') {
            if (active >= 0 && items[active]) {
                e.preventDefault();
                items[active].click();
            }
        } else if (e.key === 'Escape') {
            list.style.display = 'none';
        }
    });
}

function setActive(items, index, list) {
    items.forEach((it, i) => it.classList.toggle('active', i === index));
    list.dataset.activeIndex = String(index);
    if (index >= 0 && items[index]) {
        // move visually into view
        const el = items[index];
        if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    }
    // update aria-activedescendant for accessibility
    try { updateAriaActive(list, Dom.brandSearch); } catch (e) {}
}

// set ARIA activedescendant on the input when active suggestion changes
function updateAriaActive(list, input) {
    if (!list || !input) return;
    const idx = parseInt(list.dataset.activeIndex || '-1', 10);
    const items = Array.from(list.querySelectorAll('.suggestion-item'));
    if (idx >= 0 && items[idx]) input.setAttribute('aria-activedescendant', items[idx].id || '');
    else input.removeAttribute('aria-activedescendant');
}

let _brandSearchTimer = null;

if (Dom.brandSearch) {
    Dom.brandSearch.addEventListener("input", () => {
        const val = Dom.brandSearch.value.trim();
        if (Dom.clearSearch) Dom.clearSearch.style.display = val ? "flex" : "none";

        // increment token for new search request
        window._searchRequestToken += 1;
        const myToken = window._searchRequestToken;
        
        if (!val) {
            processBrandSearchInput("", myToken);
            return;
        }

        // dynamic debounce using timer so DEBOUNCE_MS can be changed at runtime
        if (_brandSearchTimer) clearTimeout(_brandSearchTimer);
        _brandSearchTimer = setTimeout(() => processBrandSearchInput(val, myToken), DEBOUNCE_MS);
    });
}

if (Dom.brandSearch) {
    Dom.brandSearch.addEventListener("keydown", e => {
        // if suggestion dropdown is open, let keyboard navigation handler manage Enter
        if (Dom.searchSuggestions && Dom.searchSuggestions.style.display && Dom.searchSuggestions.style.display !== 'none') return;
        if (e.key !== "Enter") return;
        const val = Dom.brandSearch.value.trim();
        if (!val) return;
        const matches = getFilteredSuggestions(val);
        if (matches.length > 0 && matches[0].brand) {
            if (Dom.searchSuggestions) Dom.searchSuggestions.style.display = "none";
            Dom.brandSearch.value = matches[0].brand.fullName;
            if (Dom.searchHint) Dom.searchHint.style.display = "none";
            showBrandInfo(matches[0].brand);
        }
    });
}

// Handle search filter changes
if (Dom.searchFilterSelect) {
    Dom.searchFilterSelect.addEventListener("change", () => {
        State.searchFilter = Dom.searchFilterSelect.value || "all";
        updateSearchPlaceholder(State.searchFilter);
        // Retrigger search with new filter if there's text in input
        const val = Dom.brandSearch ? Dom.brandSearch.value.trim() : "";
        if (val) {
            window._searchRequestToken += 1;
            const myToken = window._searchRequestToken;
            if (_brandSearchTimer) clearTimeout(_brandSearchTimer);
            _brandSearchTimer = setTimeout(() => processBrandSearchInput(val, myToken), 50);
        }
        saveExtensionState();
    });
}

if (Dom.clearSearch && Dom.brandSearch) {
    Dom.clearSearch.addEventListener("click", () => {
        Dom.brandSearch.value                  = "";
        Dom.clearSearch.style.display          = "none";
        if (Dom.infoCard) Dom.infoCard.style.display = "none";
        if (Dom.searchSuggestions) Dom.searchSuggestions.style.display = "none";
        if (Dom.searchHint) Dom.searchHint.style.display = "none";
        if (Dom.CampResultsContainer) Dom.CampResultsContainer.style.display = "none";
        State.currentlySelectedBrand           = "";
        State.currentReportData                = [];
        State.exportDataArray                  = null;
        if (Dom.feedbackFormBlock) Dom.feedbackFormBlock.style.display = "none";
        if (Dom.historyContainer)  Dom.historyContainer.style.display  = "block";
        syncFeedbackBrandField();
        saveExtensionState();
    });
}

if (Dom.mainTabBrand) {
    Dom.mainTabBrand.addEventListener("click", () => {
        setSettingsInlineVisible(false);
        collapseAllTabSections();
        setMainTab("brand");
    });
}
if (Dom.mainTabLogistics) {
    Dom.mainTabLogistics.addEventListener("click", () => {
        setSettingsInlineVisible(false);
        collapseAllTabSections();
        setMainTab("logistics");
    });
}
if (Dom.mainTabParameters) {
    if (PARAMETERS_TAB_DISABLED) {
        Dom.mainTabParameters.disabled = true;
        Dom.mainTabParameters.classList.add("is-disabled");
        Dom.mainTabParameters.setAttribute("aria-disabled", "true");
        Dom.mainTabParameters.setAttribute("title", "Розділ тимчасово недоступний");
    } else {
        Dom.mainTabParameters.addEventListener("click", () => {
            setSettingsInlineVisible(false);
            collapseAllTabSections();
            setMainTab("parameters");
            loadParametersSheet();
        });
    }
}


document.addEventListener("click", e => {
    if (!e.target.closest(".search-container") && Dom.searchSuggestions) Dom.searchSuggestions.style.display = "none";
    if (!e.target.closest(".search-container") && Dom.searchHint) Dom.searchHint.style.display = "none";
    if (Dom.feedbackBrandSuggestions && !e.target.closest("#feedbackBrandInput"))
        Dom.feedbackBrandSuggestions.style.display = "none";

    if (isSettingsInlineOpen && Dom.settingsInlinePanel && Dom.openSettingsBtn) {
        const clickedInsidePanel = Dom.settingsInlinePanel.contains(e.target);
        const clickedGear = Dom.openSettingsBtn.contains(e.target);
        if (!clickedInsidePanel && !clickedGear) {
            setSettingsInlineVisible(false);
            setMainTab(State.activeMainTab || "brand", { persist: false });
        }
    }
});

document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!isSettingsInlineOpen) return;
    setSettingsInlineVisible(false, { restoreFocus: true });
    setMainTab(State.activeMainTab || "brand", { persist: false });
});

// ---------- Кнопка експорту ----------

if (Dom.exportBtn) {
    Dom.exportBtn.addEventListener("click", () => {
        if (State.isExcelArrayExport && State.exportDataArray) {
            downloadCurrentExcel();
        } else {
            if (!State.currentReportData || State.currentReportData.length === 0)
                return alert("Немає даних.");
            downloadReportFromJson(State.currentReportData);
        }
    });
}

// ---------- Ініціалізація підмодулів ----------

if (typeof initFileUpload === "function") {
    try { initFileUpload(); } catch (e) { console.error("initFileUpload failed", e); }
}
if (typeof initColumnSelector === "function") {
    try { initColumnSelector(); } catch (e) { console.error("initColumnSelector failed", e); }
}
if (typeof initFeedbackForm === "function") {
    try { initFeedbackForm(); } catch (e) { console.error("initFeedbackForm failed", e); }
}
if (typeof window !== "undefined" && typeof window.initChangeLogFilters === "function") {
    window.initChangeLogFilters();
}
if (typeof window !== "undefined" && typeof window.initParametersChangeLogFilters === "function") {
    window.initParametersChangeLogFilters();
}

// Кнопка скачати лог параметрів
if (Dom.parametersDownloadLogBtn) {
    Dom.parametersDownloadLogBtn.addEventListener("click", e => {
        e.stopPropagation();
        downloadParametersChangesHistory();
    });
}

// ---------- DOMContentLoaded ----------

document.addEventListener("DOMContentLoaded", async () => {
    if (Dom.mainContent) Dom.mainContent.style.display = "block";
    setSettingsInlineVisible(false, { persist: false });
    initGearSettingsToggles();

    const pageVendorNamePromise = readVendorNameFromActiveAutopartTab();

    let shouldRestoreInfoCard = false;
    let restoreBrandName = "";
    let hasVisibleColumnSession = false;
    let restoreSettingsInlineOpen = false;

    // Ensure change-log filter defaults to 'all' on each popup open until we restore saved state
    State.changeLogFilter = "all";
    State.currentChangeLogPage = 1;
    State.isSyncBlockCollapsed = true;
    updateChangeFilterButtons();

    // Keep user state persistent across days; do not auto-reset on popup open.

    await new Promise(resolve => {
        chrome.storage.local.get(["savedManagerText", "authState", "extensionState", "columnSelectorSession"], result => {
            const savedManager = typeof result?.savedManagerText === "string" ? result.savedManagerText.trim() : "";
            const authManager = typeof result?.authState?.currentUser?.name === "string" ? result.authState.currentUser.name.trim() : "";
            const manager = savedManager && !/^(анонімно|анонимно|anonymous|anon)$/i.test(savedManager)
                ? savedManager
                : authManager;

            if (manager && Dom.feedbackManager) {
                Dom.feedbackManager.value = manager;
                chrome.storage.local.set({ savedManagerText: manager });
                fetchUserRequests();
            }

            if (result?.extensionState) {
                const state = result.extensionState;
                Dom.brandSearch.value = state.searchValue || "";
                if (Dom.brandSearch.value) Dom.clearSearch.style.display = "flex";
                State.currentlySelectedBrand = state.currentlySelectedBrand || "";
                State.exportDataArray        = state.exportDataArray        || null;
                State.isExcelArrayExport     = state.isExcelArrayExport     || false;
                State.currentReportData      = state.currentReportData      || [];
                State.changeLogFilter        = state.changeLogFilter || "all";
                State.currentChangeLogPage   = state.currentChangeLogPage || 1;
                State.changeLogPageByFilter  = state.changeLogPageByFilter || { all: 1 };
                State.isSyncBlockCollapsed   = typeof state.isSyncBlockCollapsed === "boolean" ? state.isSyncBlockCollapsed : true;
                State.isRequestBlockCollapsed = typeof state.isRequestBlockCollapsed === "boolean" ? state.isRequestBlockCollapsed : true;
                State.searchFilter           = state.searchFilter || "all";
                State.activeMainTab          = state.activeMainTab || "brand";
                restoreSettingsInlineOpen    = !!state.isSettingsInlineOpen;
                State.isSettingsInlineOpen   = restoreSettingsInlineOpen;
                State.isParametersBlockCollapsed = typeof state.isParametersBlockCollapsed === "boolean" ? state.isParametersBlockCollapsed : true;
                State.parametersChangeLogFilter = state.parametersChangeLogFilter || "all";
                State.parametersCurrentChangeLogPage = state.parametersCurrentChangeLogPage || 1;
                State.parametersChangeLogPageByFilter = state.parametersChangeLogPageByFilter || { all: 1 };
                if (Dom.searchFilterSelect) Dom.searchFilterSelect.value = State.searchFilter;
                updateSearchPlaceholder(State.searchFilter);
                if (state.resultsTitleText && Dom.resultsTitle)
                    Dom.resultsTitle.innerText = state.resultsTitleText;

                shouldRestoreInfoCard = !!state.infoCardVisible && !!state.currentlySelectedBrand;
                restoreBrandName = state.currentlySelectedBrand || "";
            } else {
                // First time: set default placeholder
                updateSearchPlaceholder("all");
                State.activeMainTab = "brand";
            }

            if (result?.columnSelectorSession && typeof window.restoreColumnSelectorSession === "function") {
                hasVisibleColumnSession = result.columnSelectorSession.visible !== false;
                window.restoreColumnSelectorSession(result.columnSelectorSession);
            }
            syncFeedbackBrandField();
            resolve();
        });
    });

    // load optional settings (debounce ms)
    try {
        chrome.storage.local.get(['debounceMs'], res => {
            if (res && typeof res.debounceMs === 'number' && !Number.isNaN(res.debounceMs)) {
                DEBOUNCE_MS = Math.max(30, Math.min(1000, Math.round(res.debounceMs)));
                window.DEBOUNCE_MS = DEBOUNCE_MS;
            } else {
                window.DEBOUNCE_MS = DEBOUNCE_MS;
            }
        });
    } catch (e) {
        window.DEBOUNCE_MS = DEBOUNCE_MS;
    }

    await loadDatabase();
    await loadParametersSheet();

    // try restore compact search index; if not available or invalid, build fresh index
    let restoredIndex = false;
    try {
        if (typeof window !== 'undefined' && typeof window.restoreSearchIndexFromStorage === 'function') {
            restoredIndex = await window.restoreSearchIndexFromStorage();
        }
    } catch (e) {
        restoredIndex = false;
    }
    if (!restoredIndex && typeof window.buildSearchIndex === 'function') {
        window.buildSearchIndex();
    }

    setMainTab(State.activeMainTab || "brand", { persist: false });
    if (restoreSettingsInlineOpen) {
        setSettingsInlineVisible(true, { persist: false, focusFirstControl: false });
    }

    const pageVendorName = await pageVendorNamePromise;
    const pageVendorTrimmed = String(pageVendorName || "").trim();
    const restoredBrandTrimmed = String(restoreBrandName || "").trim();
    const normPageVendor = typeof normalizeKey === "function"
        ? normalizeKey(pageVendorTrimmed)
        : pageVendorTrimmed.toUpperCase();
    const normRestoredBrand = typeof normalizeKey === "function"
        ? normalizeKey(restoredBrandTrimmed)
        : restoredBrandTrimmed.toUpperCase();

    // Keep restored UI state if brand is the same; re-search only when active page brand differs.
    const isDifferentFromRestored = !!normPageVendor && normPageVendor !== normRestoredBrand;
    const shouldApplyVendorFromPage = !hasVisibleColumnSession && (!shouldRestoreInfoCard || isDifferentFromRestored);
    const appliedVendorFromPage = shouldApplyVendorFromPage
        ? applyVendorNameFromPage(pageVendorName)
        : false;

    if (!appliedVendorFromPage && shouldRestoreInfoCard && !hasVisibleColumnSession && typeof showBrandInfo === "function") {
        const target = String(restoreBrandName || "").trim();
        if (target) {
            let brandToShow = null;

            const normTarget = typeof normalizeKey === "function"
                ? normalizeKey(target)
                : target.toUpperCase();

            if (Array.isArray(State.uniqueBrandsList)) {
                brandToShow = State.uniqueBrandsList.find(b => {
                    const full = typeof normalizeKey === "function" ? normalizeKey(b.fullName || "") : String(b.fullName || "").toUpperCase();
                    const enterprise = typeof normalizeKey === "function" ? normalizeKey(b.enterpriseName || "") : String(b.enterpriseName || "").toUpperCase();
                    const key = typeof normalizeKey === "function" ? normalizeKey(b.key || "") : String(b.key || "").toUpperCase();
                    return full === normTarget || enterprise === normTarget || key === normTarget;
                }) || null;
            }

            if (!brandToShow && typeof findBrandWithReason === "function") {
                const prevFilter = State.searchFilter;
                State.searchFilter = "all";
                const found = findBrandWithReason(target);
                State.searchFilter = prevFilter;
                if (found && found.brand) brandToShow = found.brand;
            }

            if (brandToShow) {
                if (Dom.brandSearch) Dom.brandSearch.value = brandToShow.fullName || target;
                if (Dom.clearSearch) Dom.clearSearch.style.display = Dom.brandSearch && Dom.brandSearch.value ? "flex" : "none";
                showBrandInfo(brandToShow);
            }
        }
    }

    if (Dom.syncCollapseText) {
        Dom.syncCollapseText.classList.toggle("expanded", !State.isSyncBlockCollapsed);
    }
    if (Dom.requestChangesLog) {
        const requestExpanded = !State.isRequestBlockCollapsed;
        Dom.requestChangesLog.style.display = requestExpanded ? "flex" : "none";
        if (Dom.requestCollapseText) Dom.requestCollapseText.classList.toggle("expanded", requestExpanded);
        if (Dom.requestToggleHeader) Dom.requestToggleHeader.classList.toggle("is-collapsed", !requestExpanded);
        const requestContainerEl = document.getElementById("requestContainer");
        if (requestContainerEl) requestContainerEl.classList.toggle("is-collapsed", !requestExpanded);
    }
    syncChangeLogFiltersVisibility();
});
