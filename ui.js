// ============================================================
// ui.js — рендеринг: картка бренду, логи, таблиця, підказки
// ============================================================

// ---------- Утиліти ----------

function formatDateTime(timestamp) {
    if (!timestamp) return "--.-- --:--";
    const date  = new Date(timestamp);
    const day   = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const hrs   = String(date.getHours()).padStart(2, "0");
    const mins  = String(date.getMinutes()).padStart(2, "0");
    return `${day}.${month} ${hrs}:${mins}`;
}

function renderCategorySheet(result = {}) {
    if (!Dom.categoryStatus || !Dom.categoryList || !Dom.categoryEmpty) return;

    const rows = Array.isArray(result.rows) ? result.rows : [];
    const error = String(result.error || "").trim();
    const updatedAt = result.updatedAt || null;

    Dom.categoryList.textContent = "";
    if (error) {
        Dom.categoryStatus.textContent = `Помилка: ${error}`;
    } else if (updatedAt) {
        Dom.categoryStatus.textContent = `Оновлено: ${formatDateTime(updatedAt)}`;
    } else {
        Dom.categoryStatus.textContent = "Дані не завантажені";
    }

    if (rows.length === 0) {
        Dom.categoryEmpty.style.display = "block";
        return;
    }

    Dom.categoryEmpty.style.display = "none";
    const frag = document.createDocumentFragment();

    rows.forEach(item => {
        const row = document.createElement("div");
        row.className = "category-row";

        const title = document.createElement("div");
        title.className = "category-row-title";
        title.textContent = item._title || "Без назви";
        row.appendChild(title);

        const extras = Object.entries(item).filter(([key, value]) => key !== "_title" && String(value || "").trim() !== "");
        if (extras.length > 0) {
            const meta = document.createElement("div");
            meta.className = "category-row-meta";
            meta.textContent = extras.map(([k, v]) => `${k}: ${v}`).join(" • ");
            row.appendChild(meta);
        }

        frag.appendChild(row);
    });

    Dom.categoryList.appendChild(frag);
}

// ---------- Стан UI ----------

function syncFeedbackBrandField() {
    if (!Dom.feedbackBrandInput) return;
    if (State.currentlySelectedBrand) {
        Dom.feedbackBrandInput.value    = State.currentlySelectedBrand;
        Dom.feedbackBrandInput.disabled = true;
    } else {
        Dom.feedbackBrandInput.value    = "";
        Dom.feedbackBrandInput.disabled = false;
    }
    if (Dom.feedbackBrandSuggestions) Dom.feedbackBrandSuggestions.style.display = "none";
}

function saveExtensionState() {
    const extensionState = {
        searchValue:            Dom.brandSearch.value,
        infoCardVisible:        Dom.infoCard.style.display === "block",
        resultsVisible:         false,
        // Keep persisted popup state lightweight to avoid storage quota growth.
        isExcelArrayExport:     State.isExcelArrayExport,
        currentlySelectedBrand: State.currentlySelectedBrand,
        resultsTitleText:       Dom.resultsTitle ? Dom.resultsTitle.innerText : "",
        changeLogFilter:        State.changeLogFilter,
        currentChangeLogPage:   State.currentChangeLogPage,
        changeLogPageByFilter:  State.changeLogPageByFilter,
        isSyncBlockCollapsed:   State.isSyncBlockCollapsed,
        isRequestBlockCollapsed: State.isRequestBlockCollapsed,
        searchFilter:           State.searchFilter,
        activeMainTab:          State.activeMainTab,
        isSettingsInlineOpen:   !!State.isSettingsInlineOpen,
        isParametersBlockCollapsed: State.isParametersBlockCollapsed,
        parametersChangeLogFilter: State.parametersChangeLogFilter,
        parametersCurrentChangeLogPage: State.parametersCurrentChangeLogPage,
        parametersChangeLogPageByFilter: State.parametersChangeLogPageByFilter,
    };

    chrome.storage.local.set({ extensionState }, () => {
        if (chrome.runtime?.lastError) {
            console.warn("extensionState save skipped:", chrome.runtime.lastError.message);
        }
    });
}

function displayResultsBlock() {
    Dom.infoCard.style.display            = "none";
    Dom.searchSuggestions.style.display   = "none";
    State.currentlySelectedBrand          = "";
    Dom.CampResultsContainer.style.display = "block";
    if (Dom.historyContainer) Dom.historyContainer.style.display = "none";
    syncFeedbackBrandField();
    saveExtensionState();
}

// ---------- Картка бренду ----------

let _brandCardRenderToken = 0;

function isMeaningfulValue(value) {
    const text = String(value || "").trim();
    return text !== "" && text !== "-" && text !== "—" && text !== "–";
}

function toSentenceLabel(text) {
    const value = String(text || "").trim();
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function showCopyToast(message) {
    const prev = document.querySelector(".copy-toast");
    if (prev) prev.remove();

    const toast = document.createElement("div");
    toast.className = "copy-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add("visible"), 10);
    setTimeout(() => {
        toast.classList.remove("visible");
        setTimeout(() => toast.remove(), 180);
    }, 1100);
}

function renderBrandCardContent(brand) {
    Dom.infoCard.innerHTML = "";
    Dom.infoCard.style.display = "block";

    if (!brand || typeof brand !== "object") {
        const emptyState = document.createElement("div");
        emptyState.className = "brand-empty-state";
        emptyState.innerText = "Інформація про бренд недоступна.";
        Dom.infoCard.appendChild(emptyState);
        saveExtensionState();
        return;
    }

    const overviewBlock = document.createElement("section");
    overviewBlock.className = "brand-card-block brand-card-block-overview";

    // Header row (logo + status)
    const headerRow = document.createElement("div");
    headerRow.className = "brand-header-row sync-status-header";

    const logoContainer = document.createElement("div");
    logoContainer.className = "brand-logo-container";

    if (brand.logo && brand.logo !== "-" && brand.logo.trim().startsWith("http")) {
        const img = document.createElement("img");
        img.src = brand.logo.trim();
        img.className = "brand-logo-img";
        img.alt = brand.fullName || "Logo";
        img.onerror = function () {
            this.style.display = "none";
            if (this.nextElementSibling) this.nextElementSibling.style.display = "block";
        };
        const fallbackText = document.createElement("span");
        fallbackText.className = "brand-logo-missing";
        fallbackText.innerText = "Логотип відсутній";
        fallbackText.style.display = "none";
        logoContainer.appendChild(img);
        logoContainer.appendChild(fallbackText);
    } else {
        const noLogo = document.createElement("span");
        noLogo.className = "brand-logo-missing";
        noLogo.innerText = "Логотип відсутній";
        logoContainer.appendChild(noLogo);
    }

    const titleWrap = document.createElement("div");
    titleWrap.className = "brand-title-wrap";

    const titleMain = document.createElement("div");
    titleMain.className = "brand-title-main";
    titleMain.innerText = isMeaningfulValue(brand.fullName) ? brand.fullName.trim() : "Без назви бренду";
    titleWrap.appendChild(titleMain);

    const titleSub = document.createElement("div");
    titleSub.className = "brand-title-sub";
    titleSub.innerText = isMeaningfulValue(brand.enterpriseName) ? brand.enterpriseName.trim() : "Найменування в Enterprise відсутнє";
    titleWrap.appendChild(titleSub);

    const headerLeft = document.createElement("div");
    headerLeft.className = "brand-header-left";
    headerLeft.appendChild(logoContainer);
    headerLeft.appendChild(titleWrap);
    headerRow.appendChild(headerLeft);

    const statusPill = document.createElement("span");
    statusPill.className = "status-pill";
    const normStatus = (brand.status || "").trim().toLowerCase();
    if (normStatus === "готово") {
        statusPill.classList.add("brand-status-done");
        statusPill.innerText = "ГОТОВО";
    } else if (normStatus === "в процесі") {
        statusPill.classList.add("brand-status-progress");
        statusPill.innerText = "В ПРОЦЕСІ";
    } else if (normStatus === "є проблеми") {
        statusPill.classList.add("brand-status-problem");
        statusPill.innerText = "Є ПРОБЛЕМИ";
    } else {
        statusPill.classList.add("brand-status-default");
        statusPill.innerText = "НЕВИЗНАЧЕНО";
    }
    headerRow.appendChild(statusPill);
    overviewBlock.appendChild(headerRow);
    Dom.infoCard.appendChild(overviewBlock);

    // Details rows
    const generalBlock = document.createElement("section");
    generalBlock.className = "brand-card-block brand-card-block-general";

    const detailsContainer = document.createElement("div");
    detailsContainer.className = "brand-details";

    const normalizeHref = rawUrl => {
        const trimmed = String(rawUrl || "").trim();
        if (!trimmed) return "";
        return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    };

    const getLinkSourceLabel = rawUrl => {
        const cleanUrl = normalizeHref(rawUrl);
        if (!cleanUrl) return "";
        try {
            const parsed = new URL(cleanUrl);
            return parsed.hostname.replace(/^www\./i, "").trim();
        } catch {
            return "";
        }
    };

    const createCleanLink = (url, text) => {
        if (!isMeaningfulValue(url)) return null;
        const cleanUrl = normalizeHref(url);
        if (!cleanUrl) return null;
        const a = document.createElement("a");
        a.href = cleanUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "info-link-btn";
        a.innerText = text || "Перейти";
        return a;
    };

    const splitLinkValues = raw => {
        if (!isMeaningfulValue(raw)) return [];
        const looksLikeUrlToken = token => {
            const value = String(token || "").trim();
            if (!value || /\s/.test(value)) return false;
            if (/^https?:\/\//i.test(value)) return true;
            if (/^www\./i.test(value)) return true;
            return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/:?#]|$)/i.test(value);
        };

        return String(raw)
            .split(/[\n,;]+/)
            .map(item => item.trim())
            .filter(item => looksLikeUrlToken(item));
    };

    const createLinksGroup = (raw, text = "Перейти", extraClass = "") => {
        const links = splitLinkValues(raw);
        if (links.length === 0) return null;

        const sourceLabels = links.map(linkValue => getLinkSourceLabel(linkValue));
        const counts = new Map();
        sourceLabels.forEach(label => {
            const key = label || "";
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        const used = new Map();
        const buttonLabels = sourceLabels.map(label => {
            const base = label || text;
            const totalForBase = counts.get(label || "") || 0;
            if (totalForBase <= 1) return base;
            const current = (used.get(base) || 0) + 1;
            used.set(base, current);
            return `${base} (${current})`;
        });

        if (links.length === 1) {
            const single = createCleanLink(links[0], buttonLabels[0]);
            if (single && extraClass) single.classList.add(extraClass);
            return single;
        }

        const wrap = document.createElement("span");
        wrap.className = "info-links-group";
        links.forEach((linkValue, idx) => {
            const linkEl = createCleanLink(linkValue, buttonLabels[idx] || text);
            if (linkEl) {
                if (extraClass) linkEl.classList.add(extraClass);
                wrap.appendChild(linkEl);
            }
        });

        return wrap.childElementCount > 0 ? wrap : null;
    };

    const createRow = (label, valueContent, options = {}) => {
        const row = document.createElement("div");
        row.className = "info-row";

        const lbl = document.createElement("span");
        lbl.className = "info-label";
        lbl.innerText = toSentenceLabel(label) + ":";
        row.appendChild(lbl);

        const val = document.createElement("span");
        val.className = "info-value";

        const rawText = typeof valueContent === "string" ? valueContent.trim() : "";
        const hasTextValue = typeof valueContent === "string" && isMeaningfulValue(rawText);

        if (valueContent instanceof HTMLElement) {
            val.appendChild(valueContent);
        } else if (hasTextValue) {
            val.innerText = rawText;
            if (options.copyable) {
                row.classList.add("copyable");
                row.title = "Натисніть, щоб скопіювати";
                row.tabIndex = 0;
                row.setAttribute("role", "button");
                row.setAttribute("aria-label", `Скопіювати ${toSentenceLabel(label)}`);

                const runCopy = async () => {
                    try {
                        await navigator.clipboard.writeText(rawText);
                        showCopyToast("Скопійовано");
                    } catch {
                        showCopyToast("Не вдалося скопіювати");
                    }
                };

                row.addEventListener("click", runCopy);
                row.addEventListener("keydown", e => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        runCopy();
                    }
                });

                const copyHint = document.createElement("span");
                copyHint.className = "info-copy-hint";
                copyHint.setAttribute("aria-hidden", "true");

                const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                icon.setAttribute("viewBox", "0 0 24 24");
                icon.setAttribute("width", "12");
                icon.setAttribute("height", "12");
                icon.setAttribute("fill", "none");
                icon.setAttribute("stroke", "currentColor");
                icon.setAttribute("stroke-width", "2");
                icon.setAttribute("stroke-linecap", "round");
                icon.setAttribute("stroke-linejoin", "round");

                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                path.setAttribute("d", "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z");
                const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
                poly.setAttribute("points", "14 2 14 8 20 8");

                icon.appendChild(path);
                icon.appendChild(poly);
                copyHint.appendChild(icon);
                val.appendChild(copyHint);
            }
        } else {
            val.innerText = "—";
            val.classList.add("is-empty");
        }

        row.appendChild(val);
        return row;
    };

    const parserArticleValue = String(brand.parserArticle || "").trim();
    const parserTradenumberValue = String(brand.parserTradenumber || "").trim();
    const hasParserArticle = isMeaningfulValue(parserArticleValue);
    const hasParserTradenumber = isMeaningfulValue(parserTradenumberValue);

    const createParserRow = (label, rawValue) => {
        const links = createLinksGroup(rawValue, "Перейти");
        if (links) {
            return createRow(label, links);
        }
        return createRow(label, rawValue, { copyable: true });
    };

    if (hasParserArticle || hasParserTradenumber) {
        const parserBlock = document.createElement("section");
        parserBlock.className = "brand-card-block parser-links-block";

        const parserToggle = document.createElement("button");
        parserToggle.type = "button";
        parserToggle.className = "parser-links-toggle";

        const parserTitleWrap = document.createElement("span");
        parserTitleWrap.className = "parser-links-title-wrap";

        const parserTitle = document.createElement("span");
        parserTitle.className = "brand-block-title parser-links-title";
        parserTitle.innerText = toSentenceLabel(FIELD_LABELS.parser || "Парсинг товарів");

        parserTitleWrap.appendChild(parserTitle);

        const parserChevron = document.createElement("span");
        parserChevron.className = "parser-links-chevron";

        const parserRight = document.createElement("span");
        parserRight.className = "parser-links-right";
        parserRight.appendChild(parserChevron);

        parserToggle.appendChild(parserTitleWrap);
        parserToggle.appendChild(parserRight);

        const parserContent = document.createElement("div");
        parserContent.className = "parser-links-content";

        if (hasParserArticle) {
            parserContent.appendChild(createParserRow(FIELD_LABELS.parserArticle || "Артикул", parserArticleValue));
        }
        if (hasParserTradenumber) {
            parserContent.appendChild(createParserRow(FIELD_LABELS.parserTradenumber || "Торговий номер", parserTradenumberValue));
        }

        parserToggle.addEventListener("click", () => {
            const expanded = parserBlock.classList.toggle("expanded");
            parserToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        });

        parserToggle.setAttribute("aria-expanded", "false");
        parserBlock.appendChild(parserToggle);
        parserBlock.appendChild(parserContent);
        Dom.infoCard.appendChild(parserBlock);
    }

    detailsContainer.appendChild(createRow(FIELD_LABELS.fullName, createCleanLink(brand.gomerLink, brand.fullName) || brand.fullName));
    detailsContainer.appendChild(createRow(FIELD_LABELS.enterpriseName, createCleanLink(brand.enterpriseLink, brand.enterpriseName) || brand.enterpriseName));
    detailsContainer.appendChild(createRow(FIELD_LABELS.prefix, brand.prefix, { copyable: true }));
    detailsContainer.appendChild(createRow(FIELD_LABELS.country, brand.country, { copyable: true }));
    detailsContainer.appendChild(createRow(FIELD_LABELS.typeofsparepart, brand.typeofsparepart, { copyable: true }));

    const seriesRow = document.createElement("div");
    seriesRow.className = "info-row";
    const seriesLbl = document.createElement("span");
    seriesLbl.className = "info-label";
    seriesLbl.innerText = toSentenceLabel(FIELD_LABELS.series) + ":";
    seriesRow.appendChild(seriesLbl);

    const seriesVal = document.createElement("span");
    seriesVal.className = "info-value";
    const rawSeries = (brand.series || "").trim();
    if (isMeaningfulValue(rawSeries)) {
        const seriesText = document.createElement("span");
        seriesText.innerText = rawSeries;
        seriesVal.appendChild(seriesText);
    }

    const devBadge = document.createElement("span");
    devBadge.className = "series-dev-text";
    devBadge.innerText = "Розробка";
    seriesVal.appendChild(devBadge);

    seriesRow.appendChild(seriesVal);
    detailsContainer.appendChild(seriesRow);

    detailsContainer.appendChild(createRow(FIELD_LABELS.site, createLinksGroup(brand.site, "Перейти")));
    detailsContainer.appendChild(createRow(FIELD_LABELS.catalog, createLinksGroup(brand.catalog, "Перейти")));
    generalBlock.appendChild(detailsContainer);
    Dom.infoCard.appendChild(generalBlock);

    // Additional info block with collapse/expand
    const addInfoBlock = document.createElement("section");
    addInfoBlock.className = "brand-card-block additional-info-block";

    const hasInfo = isMeaningfulValue(brand.additionalInfo);
    if (hasInfo) {
        const addInfoToggle = document.createElement("button");
        addInfoToggle.type = "button";
        addInfoToggle.className = "additional-info-toggle";
        addInfoToggle.innerText = toSentenceLabel(FIELD_LABELS.additionalInfo);

        const addInfoChevron = document.createElement("span");
        addInfoChevron.className = "additional-info-chevron";
        addInfoToggle.appendChild(addInfoChevron);

        const addInfoContent = document.createElement("div");
        addInfoContent.className = "additional-info-content";

        const addInfoText = document.createElement("div");
        addInfoText.className = "additional-info-text";
        addInfoText.innerText = brand.additionalInfo;
        addInfoContent.appendChild(addInfoText);

        addInfoToggle.addEventListener("click", () => {
            const expanded = addInfoBlock.classList.toggle("expanded");
            addInfoToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        });

        addInfoToggle.setAttribute("aria-expanded", "false");
        addInfoBlock.appendChild(addInfoToggle);
        addInfoBlock.appendChild(addInfoContent);
    } else {
        const addInfoTitle = document.createElement("div");
        addInfoTitle.className = "brand-block-title";
        addInfoTitle.innerText = toSentenceLabel(FIELD_LABELS.additionalInfo);
        addInfoBlock.appendChild(addInfoTitle);

        const emptyAdditional = document.createElement("div");
        emptyAdditional.className = "additional-info-text additional-info-empty";
        emptyAdditional.innerText = "Додаткова інформація відсутня.";
        addInfoBlock.appendChild(emptyAdditional);
    }

    Dom.infoCard.appendChild(addInfoBlock);

    saveExtensionState();
}

function showBrandInfo(brand) {
    if (!brand) return;
    
    State.currentlySelectedBrand = brand.fullName || "";
    if (Dom.feedbackFormBlock && Dom.feedbackFormBlock.style.display === "flex") {
        syncFeedbackBrandField();
    }

    Dom.infoCard.innerHTML = "";
    Dom.infoCard.style.display = "block";
    if (Dom.historyContainer) {
        Dom.historyContainer.style.display = "none";
        if (Dom.changeLogFilters) Dom.changeLogFilters.style.display = "none";
        if (Dom.changeFilterCount) Dom.changeFilterCount.style.display = "none";
        if (Dom.changeLogPagination) Dom.changeLogPagination.style.display = "none";
        if (Dom.dbChangesLog) Dom.dbChangesLog.style.display = "none";
    }

    Dom.infoCard.innerHTML = `
        <div class="brand-card-skeleton">
            <div class="brand-skel brand-skel-head"></div>
            <div class="brand-skel brand-skel-row"></div>
            <div class="brand-skel brand-skel-row"></div>
            <div class="brand-skel brand-skel-row"></div>
        </div>
    `;

    const renderToken = ++_brandCardRenderToken;
    setTimeout(() => {
        if (renderToken !== _brandCardRenderToken) return;
        renderBrandCardContent(brand);
    }, 140);
}

// ---------- Таблиця результатів ----------

function renderTableRows(brands) {
    if (Dom.campTableHeadRow) {
        while (Dom.campTableHeadRow.firstChild) Dom.campTableHeadRow.removeChild(Dom.campTableHeadRow.firstChild);
    }

    ["Запит", "Найменування в Gomer", "Статус"].forEach(h => {
        const th    = document.createElement("th");
        th.innerText = h;
        if (Dom.campTableHeadRow) Dom.campTableHeadRow.appendChild(th);
    });
    State.currentSelectedColumns.forEach(key => {
        const opt    = COLUMN_OPTIONS.find(o => o.key === key);
        if (!opt) return;
        const th     = document.createElement("th");
        th.innerText = opt.label;
        if (Dom.campTableHeadRow) Dom.campTableHeadRow.appendChild(th);
    });

    // clear table body safely
    while (Dom.campTableBody && Dom.campTableBody.firstChild) Dom.campTableBody.removeChild(Dom.campTableBody.firstChild);
    brands.forEach(b => {
        const tr = document.createElement("tr");
        const nameTd = document.createElement("td");
        const nameStyle = b.found
            ? "font-weight:700; color:#000000; cursor:pointer; text-decoration:underline;"
            : "font-weight:700; color:#666666; cursor:not-allowed;";
        nameTd.className = "clickable-brand";
        nameTd.style.cssText = nameStyle;
        nameTd.innerText = b.source || b.fullName || "";
        tr.appendChild(nameTd);

        const fullNameTd = document.createElement("td");
        fullNameTd.innerText = b.fullName || "-";
        tr.appendChild(fullNameTd);

        const statusTd = document.createElement("td");
        const statusSpan = document.createElement("span");
        const statusClass = b.status === "Офіціал"
            ? "status-official"
            : (b.status === "Не знайдено" ? "status-notfound" : "status-other");
        statusSpan.className = `status-pill ${statusClass}`;
        statusSpan.innerText = b.status || "-";
        statusTd.appendChild(statusSpan);
        tr.appendChild(statusTd);

        State.currentSelectedColumns.forEach(key => {
            const td = document.createElement('td');
            const val = b[key] || "-";
            if ((key === "site" || key === "catalog") && val && val !== "-") {
                const links = String(val)
                    .split(",")
                    .map(item => item.trim())
                    .filter(Boolean);

                if (links.length > 0) {
                    const sourceLabels = links.map(linkValue => {
                        try {
                            const parsed = new URL(linkValue.startsWith("http") ? linkValue : `https://${linkValue}`);
                            return parsed.hostname.replace(/^www\./i, "").trim();
                        } catch {
                            return "";
                        }
                    });
                    const counts = new Map();
                    sourceLabels.forEach(label => counts.set(label, (counts.get(label) || 0) + 1));
                    const used = new Map();

                    links.forEach((linkValue, linkIndex) => {
                        const href = linkValue.startsWith("http") ? linkValue : `https://${linkValue}`;
                        const a = document.createElement('a');
                        a.href = href;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        a.style.color = '#000000';
                        a.style.textDecoration = 'underline';
                        const baseLabel = sourceLabels[linkIndex] || 'Детальніше';
                        const totalForBase = counts.get(sourceLabels[linkIndex]) || 0;
                        let finalLabel = baseLabel;
                        if (totalForBase > 1) {
                            const seq = (used.get(baseLabel) || 0) + 1;
                            used.set(baseLabel, seq);
                            finalLabel = `${baseLabel} (${seq})`;
                        }
                        a.innerText = `${finalLabel} ➔`;
                        td.appendChild(a);
                        if (linkIndex < links.length - 1) {
                            td.appendChild(document.createTextNode(' | '));
                        }
                    });
                } else {
                    td.innerText = val;
                }
            } else {
                td.innerText = val;
            }
            tr.appendChild(td);
        });

        if (b.found) {
            nameTd.addEventListener("click", () => showBrandInfo(b));
            nameTd.style.cursor = 'pointer';
        }
        Dom.campTableBody.appendChild(tr);
    });
}

// ---------- Лог змін бази ----------

function getFilteredChangesHistory(historyList) {
    const filter = State.changeLogFilter || "all";
    if (filter === "all") return historyList;
    if (filter === "archived") return State.archivedChangesHistory || [];
    return historyList.filter(item => item.type === filter);
}

function updateChangeFilterButtons() {
    const buttons = [
        { el: Dom.changeFilterAll, filter: "all", text: "Всі" },
        { el: Dom.changeFilterAdded, filter: "added", text: "Додано" },
        { el: Dom.changeFilterModified, filter: "modified", text: "Змінено" },
        { el: Dom.changeFilterRemoved, filter: "removed", text: "Видалено" },
        { el: Dom.changeFilterArchived, filter: "archived", text: "Архів" },
    ];

    buttons.forEach(({ el, filter, text }) => {
        if (!el) return;
        el.classList.toggle("active", State.changeLogFilter === filter);
        el.textContent = text;
    });
}

function setChangeLogFilter(filter) {
    const previousFilter = State.changeLogFilter || "all";
    State.changeLogPageByFilter = State.changeLogPageByFilter || {};
    State.changeLogPageByFilter[previousFilter] = State.currentChangeLogPage || 1;
    State.changeLogFilter = filter;
    State.currentChangeLogPage = State.changeLogPageByFilter[filter] || 1;
    updateChangeFilterButtons();
    renderChangesLog(State.currentChangesHistory || []);
    saveExtensionState();
}

function setChangeLogPage(page) {
    const filter = State.changeLogFilter || "all";
    const sourceHistory = filter === "archived" ? (State.archivedChangesHistory || []) : State.currentChangesHistory || [];
    const filteredHistory = getFilteredChangesHistory(sourceHistory);
    const totalPages = Math.ceil(filteredHistory.length / State.changeLogPageSize) || 1;
    const nextPage = Math.min(Math.max(1, page), totalPages);
    if (State.currentChangeLogPage === nextPage) return;
    State.currentChangeLogPage = nextPage;
    State.changeLogPageByFilter = State.changeLogPageByFilter || {};
    State.changeLogPageByFilter[filter] = nextPage;
    renderChangesLog(State.currentChangesHistory || []);
    saveExtensionState();
}

function renderChangeLogPagination(totalPages) {
    if (!Dom.changeLogPagination) return;
    while (Dom.changeLogPagination && Dom.changeLogPagination.firstChild) Dom.changeLogPagination.removeChild(Dom.changeLogPagination.firstChild);
    if (totalPages <= 1) {
        Dom.changeLogPagination.style.display = "none";
        return;
    }

    const createButton = (label, page, disabled = false, active = false) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pagination-btn" + (active ? " active" : "") + (disabled ? " disabled" : "");
        btn.innerText = label;
        btn.disabled = disabled;
        if (!disabled && !active) {
            btn.addEventListener("click", () => setChangeLogPage(page));
        }
        return btn;
    };

    const currentPage = State.currentChangeLogPage || 1;
    Dom.changeLogPagination.appendChild(createButton("<", currentPage - 1, currentPage === 1));

    const pageButtons = Math.min(5, totalPages);
    let startPage = 1;
    let endPage = pageButtons;

    if (totalPages > pageButtons) {
        const half = Math.floor(pageButtons / 2);
        if (currentPage <= half + 1) {
            startPage = 1;
            endPage = pageButtons;
        } else if (currentPage >= totalPages - half) {
            startPage = totalPages - pageButtons + 1;
            endPage = totalPages;
        } else {
            startPage = currentPage - half;
            endPage = currentPage + half;
        }
    }

    for (let page = startPage; page <= endPage; page += 1) {
        Dom.changeLogPagination.appendChild(createButton(page, page, false, page === currentPage));
    }

    if (totalPages > pageButtons && endPage < totalPages) {
        const ellipsis = document.createElement("span");
        ellipsis.className = "pagination-ellipsis";
        ellipsis.innerText = "…";
        Dom.changeLogPagination.appendChild(ellipsis);
        Dom.changeLogPagination.appendChild(createButton(String(totalPages), totalPages));
    }

    Dom.changeLogPagination.appendChild(createButton(">", currentPage + 1, currentPage === totalPages));
    Dom.changeLogPagination.style.display = "flex";
}

function initChangeLogFilters() {
    if (!State.changeLogFilter) State.changeLogFilter = "all";
    const handlers = [
        { el: Dom.changeFilterAll, filter: "all" },
        { el: Dom.changeFilterAdded, filter: "added" },
        { el: Dom.changeFilterModified, filter: "modified" },
        { el: Dom.changeFilterRemoved, filter: "removed" },
        { el: Dom.changeFilterArchived, filter: "archived" },
    ];

    handlers.forEach(({ el, filter }) => {
        if (!el) return;
        el.addEventListener("click", () => setChangeLogFilter(filter));
    });

    updateChangeFilterButtons();
}

function initParametersChangeLogFilters() {
    if (!State.parametersChangeLogFilter) State.parametersChangeLogFilter = "all";
    const handlers = [
        { el: Dom.parametersChangeFilterAll, filter: "all" },
        { el: Dom.parametersChangeFilterAdded, filter: "added" },
        { el: Dom.parametersChangeFilterModified, filter: "modified" },
        { el: Dom.parametersChangeFilterRemoved, filter: "removed" },
        { el: Dom.parametersChangeFilterArchived, filter: "archived" },
    ];

    handlers.forEach(({ el, filter }) => {
        if (!el) return;
        el.addEventListener("click", () => setParametersChangeLogFilter(filter));
    });

    updateParametersChangeFilterButtons();
}

if (typeof window !== "undefined") {
    window.initChangeLogFilters = initChangeLogFilters;
    window.initParametersChangeLogFilters = initParametersChangeLogFilters;
}

function archiveChange(item) {
    // remove from active history and push to archive
    const keyMatcher = (it) => it && item && it.timestamp === item.timestamp && it.name === item.name && it.type === item.type;
    const idx = State.currentChangesHistory.findIndex(keyMatcher);
    if (idx >= 0) State.currentChangesHistory.splice(idx, 1);
    State.archivedChangesHistory = State.archivedChangesHistory || [];
    State.archivedChangesHistory.unshift(item);
    chrome.storage.local.set({ savedChangesHistory: State.currentChangesHistory, archivedChangesHistory: State.archivedChangesHistory });
    renderChangesLog(State.currentChangesHistory || []);
    updateChangeFilterButtons();
}

function restoreChange(item) {
    // remove from archive and push back to active
    State.archivedChangesHistory = State.archivedChangesHistory || [];
    const idx = State.archivedChangesHistory.findIndex(it => it && item && it.timestamp === item.timestamp && it.name === item.name && it.type === item.type);
    if (idx >= 0) {
        const moved = State.archivedChangesHistory.splice(idx, 1)[0];
        State.currentChangesHistory = State.currentChangesHistory || [];
        State.currentChangesHistory.unshift(moved);
        chrome.storage.local.set({ savedChangesHistory: State.currentChangesHistory, archivedChangesHistory: State.archivedChangesHistory });
    }
    renderChangesLog(State.currentChangesHistory || []);
    updateChangeFilterButtons();
}

function syncChangeLogFiltersVisibility() {
    if (!Dom.changeLogFilters || !Dom.dbChangesLog) return;
    const shouldShow = !State.isSyncBlockCollapsed;
    Dom.changeLogFilters.style.display = shouldShow ? "flex" : "none";
    if (Dom.changeFilterCount) {
        const hasCount = Dom.changeFilterCount.innerText.trim().length > 0;
        Dom.changeFilterCount.style.display = shouldShow && hasCount ? "block" : "none";
    }
    if (Dom.changeLogPagination) Dom.changeLogPagination.style.display = shouldShow && Dom.changeLogPagination.innerHTML ? "flex" : "none";
}

function renderChangesLog(historyList) {
    if (!Dom.dbChangesLog) return;
    const filter = State.changeLogFilter || "all";
    const sourceHistory = Array.isArray(historyList) ? historyList : [];
    State.currentChangesHistory = sourceHistory;
    const effectiveList = filter === "archived" ? (State.archivedChangesHistory || []) : State.currentChangesHistory;
    const filteredHistory = getFilteredChangesHistory(effectiveList);
    const totalItems = filteredHistory.length;
    const pageSize = State.changeLogPageSize || 20;
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 1;
    State.currentChangeLogPage = Math.min(Math.max(State.currentChangeLogPage || 1, 1), totalPages);
    const start = (State.currentChangeLogPage - 1) * pageSize;
    const pageItems = filteredHistory.slice(start, start + pageSize);
    if (Dom.changeFilterCount) {
        if (totalItems > 0) {
            const fromIndex = start + 1;
            const toIndex = start + pageItems.length;
            Dom.changeFilterCount.innerText = `Відображено ${fromIndex}-${toIndex} з ${totalItems}`;
            Dom.changeFilterCount.style.display = "block";
        } else {
            Dom.changeFilterCount.innerText = "";
            Dom.changeFilterCount.style.display = "none";
        }
    }
    if (Dom.changeLogPagination) {
        renderChangeLogPagination(totalPages);
        Dom.changeLogPagination.style.display = totalPages > 1 && !State.isSyncBlockCollapsed ? "flex" : "none";
    }

    while (Dom.dbChangesLog && Dom.dbChangesLog.firstChild) Dom.dbChangesLog.removeChild(Dom.dbChangesLog.firstChild);

    if (filteredHistory.length === 0) {
        if (!State.isSyncBlockCollapsed) {
            const emptyState = document.createElement("div");
            emptyState.className = "change-empty-state";
            emptyState.innerText = "Немає змін цього типу";
            Dom.dbChangesLog.appendChild(emptyState);
            Dom.dbChangesLog.style.display = "flex";
        } else {
            Dom.dbChangesLog.style.display = "none";
        }
        if (Dom.changeFilterCount) Dom.changeFilterCount.style.display = "none";
        if (Dom.changeLogPagination) Dom.changeLogPagination.style.display = "none";
        updateChangeFilterButtons();
        return;
    }

    pageItems.forEach(item => {
        const rowWrapper    = document.createElement("div");
        rowWrapper.className = "change-row-wrapper";

        const headerLine    = document.createElement("div");
        headerLine.className = "change-header-line";

        const mainContentWrapper    = document.createElement("div");
        mainContentWrapper.className = "change-main-content";

        let typeBadge = "", classColor = "";
        if      (item.type === "added")    { typeBadge = "+ Додано:";  classColor = "change-added"; }
        else if (item.type === "modified") { typeBadge = "~ Змінено:"; classColor = "change-modified"; }
        else if (item.type === "removed")  { typeBadge = "- Видалено:";classColor = "change-removed"; }

        const labelSpan    = document.createElement("span");
        labelSpan.className = classColor;
        labelSpan.style.fontSize = "11px";

        const brandNameLink    = document.createElement("span");
        brandNameLink.className = "change-brand-name";
        brandNameLink.innerText = `«${item.name}»`;
        if (item.brandObj) {
            brandNameLink.addEventListener("click", e => { e.stopPropagation(); showBrandInfo(item.brandObj); });
        } else {
            brandNameLink.style.cursor = "default";
            brandNameLink.style.textDecoration = "none";
        }

        let summaryText = "";
        let suffixText = "";

        if (item.type === "added") {
            summaryText = "Бренд ";
            suffixText = " додано в розширення.";
        } else if (item.type === "modified") {
            summaryText = "До бренду ";
            suffixText = " були внесені зміни.";
        } else if (item.type === "removed") {
            summaryText = "Бренд ";
            suffixText = " видалено з розширення.";
        }

        labelSpan.textContent = "";
        labelSpan.appendChild(document.createTextNode("• " + summaryText));
        labelSpan.appendChild(brandNameLink);
        labelSpan.appendChild(document.createTextNode(suffixText));

        mainContentWrapper.appendChild(labelSpan);
        headerLine.appendChild(mainContentWrapper);

        // right side controls: time + action
        const rightControls = document.createElement("div");
        rightControls.className = "change-right-controls";

        const timeBadge    = document.createElement("span");
        timeBadge.className = "change-datetime-right";
        timeBadge.innerText = formatDateTime(item.timestamp);

        // Action button: archive or restore (icon-only)
        const actionBtn = document.createElement("button");
        actionBtn.className = "change-action-btn";
        actionBtn.style.marginLeft = "8px";
        actionBtn.setAttribute("aria-label", State.changeLogFilter === "archived" ? "Відновити" : "В архів");
        if (State.changeLogFilter === "archived") {
            actionBtn.title = "Повернути в активні зміни";
            actionBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 0-3.53 7.07" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                    <path d="M21 3v6h-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>`;
            actionBtn.addEventListener("click", e => { e.stopPropagation(); restoreChange(item); });
        } else {
            actionBtn.title = "Перемістити запис в архів";
            actionBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" />
                    <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>`;
            actionBtn.addEventListener("click", e => { e.stopPropagation(); archiveChange(item); });
        }
        rightControls.appendChild(timeBadge);
        rightControls.appendChild(actionBtn);
        headerLine.appendChild(rightControls);
        rowWrapper.appendChild(headerLine);

        if (item.type === "modified") {
            const detailsBox    = document.createElement("div");
            detailsBox.className = "change-details-box";
                if (item.details && item.details.length > 0) {
                item.details.forEach(d => {
                    const dDiv = document.createElement("div");
                    const bullet = document.createTextNode('• ');
                    const fieldSpan = document.createElement('span');
                    fieldSpan.style.fontWeight = '600';
                    fieldSpan.innerText = `${d.field}:`;
                    dDiv.appendChild(bullet);
                    dDiv.appendChild(fieldSpan);
                    dDiv.appendChild(document.createTextNode(` "${d.old}" ➔ "${d.new}"`));
                    detailsBox.appendChild(dDiv);
                });
            } else {
                const dDiv = document.createElement("div");
                const em = document.createElement('em');
                em.innerText = 'Деталей немає';
                dDiv.appendChild(em);
                detailsBox.appendChild(dDiv);
            }
            detailsBox.style.display = "none";
            rowWrapper.appendChild(detailsBox);
            headerLine.addEventListener("click", e => {
                if (e.target.closest(".change-action-btn")) return;
                if (e.target.closest(".change-brand-name")) return;
                const box = rowWrapper.querySelector(".change-details-box");
                if (!box) return;
                const isHidden = box.style.display === "none" || !box.style.display;
                box.style.display = isHidden ? "flex" : "none";
            });
        }
        Dom.dbChangesLog.appendChild(rowWrapper);
    });

    Dom.dbChangesLog.style.display = State.isSyncBlockCollapsed ? "none" : "flex";
    Dom.syncCollapseText.innerText = State.isSyncBlockCollapsed ? "▼" : "▲";
    updateChangeFilterButtons();
    syncChangeLogFiltersVisibility();
}

// ---------- Лог запитів ----------

function filterOldDoneRequests(requests) {
    if (!requests || !Array.isArray(requests)) return [];
    const now = new Date();
    return requests.filter(req => {
        const statusLower = (req.status || "").toLowerCase();
        const isDone = statusLower.includes("виконан") || statusLower.includes("готов") || statusLower.includes("done");
        if (isDone) {
            let reqDate = new Date();
            if (req.date) {
                if (req.date.includes("T")) {
                    const d = new Date(req.date);
                    if (!isNaN(d.getTime())) reqDate = d;
                } else {
                    const parts = req.date.split(".");
                    if (parts.length === 3) {
                        const d = new Date(parts[2], parts[1] - 1, parts[0]);
                        if (!isNaN(d.getTime())) reqDate = d;
                    }
                }
            }
            if (reqDate.getMonth() !== now.getMonth() || reqDate.getFullYear() !== now.getFullYear()) return false;
        }
        return true;
    });
}

function renderRequestsLog(requests) {
    const options = arguments[1] || {};
    const status = options.status || "ready";
    const statusMessage = options.message || "";
    const updatedAt = options.updatedAt || null;
    const requestContainerEl = document.getElementById("requestContainer");

    if (!Dom.requestChangesLog) return;
    while (Dom.requestChangesLog && Dom.requestChangesLog.firstChild) Dom.requestChangesLog.removeChild(Dom.requestChangesLog.firstChild);
    const safeRequests = Array.isArray(requests) ? requests : [];

    const metaNotice = document.createElement("div");
    metaNotice.className = "request-meta-notice";
    metaNotice.style.fontSize = "11px";
    metaNotice.style.padding = "6px 8px";
    metaNotice.style.marginBottom = "8px";
    metaNotice.style.borderRadius = "6px";
    metaNotice.style.border = "1px solid var(--border-color)";
    metaNotice.style.background = "var(--bg-accent)";
    metaNotice.style.color = "var(--text-muted)";

    if (status === "loading") {
        metaNotice.innerText = statusMessage || "Завантаження запитів...";
        Dom.requestChangesLog.appendChild(metaNotice);
    } else if (status === "error") {
        metaNotice.innerText = statusMessage || "Не вдалося завантажити запити.";
        metaNotice.style.borderColor = "#f2b8b5";
        metaNotice.style.color = "#b3261e";
        Dom.requestChangesLog.appendChild(metaNotice);
    } else if (status === "stale") {
        let text = statusMessage || "Показано кешовані запити";
        if (updatedAt) text += ` • Оновлено: ${formatDateTime(updatedAt)}`;
        metaNotice.innerText = text;
        Dom.requestChangesLog.appendChild(metaNotice);
    }

    if (safeRequests.length === 0) {
        Dom.requestCount.innerText = "0";
        const emptyState = document.createElement("div");
        emptyState.className = "change-empty-state";
        emptyState.style.padding = "10px 4px";
        emptyState.style.fontSize = "12px";
        emptyState.style.color = "var(--text-muted)";
        if (status === "loading") emptyState.innerText = "Очікуємо дані...";
        else if (status === "error") emptyState.innerText = "Запити тимчасово недоступні.";
        else emptyState.innerText = statusMessage || "Запитів поки немає.";
        Dom.requestChangesLog.appendChild(emptyState);
        Dom.requestChangesLog.style.display = State.isRequestBlockCollapsed ? "none" : "flex";
        if (Dom.requestCollapseText) Dom.requestCollapseText.classList.toggle("expanded", !State.isRequestBlockCollapsed);
        if (Dom.requestToggleHeader) Dom.requestToggleHeader.classList.toggle("is-collapsed", State.isRequestBlockCollapsed);
        if (requestContainerEl) requestContainerEl.classList.toggle("is-collapsed", State.isRequestBlockCollapsed);
        return;
    }

    Dom.requestCount.innerText = safeRequests.length;

    safeRequests.forEach(req => {
        const rowWrapper = document.createElement("div");
        Object.assign(rowWrapper.style, {
            borderBottom: "1px solid var(--border-color)",
            padding: "8px 4px",
            transition: "background-color 0.2s ease",
            borderRadius: "4px",
            marginBottom: "2px",
        });

        const headerLine = document.createElement("div");
        Object.assign(headerLine.style, {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            width: "100%",
        });

        const leftSide = document.createElement("div");
        Object.assign(leftSide.style, { display: "flex", flexDirection: "column", gap: "2px", flex: "1 1 0", minWidth: "0" });

        const brandSpan    = document.createElement("span");
        brandSpan.style.fontSize   = "13px";
        brandSpan.style.fontWeight = "600";
        brandSpan.style.color      = "var(--text-main)";
        brandSpan.style.overflowWrap = "anywhere";
        brandSpan.style.whiteSpace = "normal";
        brandSpan.innerText = req.brandName;

        const categorySpan    = document.createElement("span");
        categorySpan.style.fontSize = "11px";
        categorySpan.style.color    = "var(--text-muted)";
        categorySpan.style.overflowWrap = "anywhere";
        categorySpan.style.whiteSpace = "normal";
        categorySpan.innerText = req.category;

        leftSide.appendChild(brandSpan);
        leftSide.appendChild(categorySpan);

        const rightSide = document.createElement("div");
        Object.assign(rightSide.style, { display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto" });

        const statusPill    = document.createElement("span");
        statusPill.className = "status-pill request-status-chip";
        const statusText = String(req.status || "");
        const statusLower   = statusText.toLowerCase();
        if      (statusLower.includes("виконан") || statusLower.includes("готов") || statusLower.includes("done"))
            statusPill.classList.add("status-official");
        else if (statusLower.includes("новий") || statusLower.includes("new") || statusLower.includes("помилк"))
            statusPill.classList.add("status-notfound");
        else
            statusPill.classList.add("status-other");
        statusPill.innerText = statusText || "Невідомо";

        const arrowSpan = document.createElement("span");
        Object.assign(arrowSpan.style, { fontSize: "10px", color: "var(--text-muted)", transition: "transform 0.2s ease" });
        arrowSpan.innerText = "▸";

        rightSide.appendChild(statusPill);
        rightSide.appendChild(arrowSpan);
        headerLine.appendChild(leftSide);
        headerLine.appendChild(rightSide);
        rowWrapper.appendChild(headerLine);

        // Date cleanup
        let cleanDate = req.date;
        let cleanTime = req.time;
        if (req.date && req.date.includes("T")) {
            const d = new Date(req.date);
            if (!isNaN(d.getTime())) {
                cleanDate = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
            }
        }
        if (req.time && req.time.includes("T")) {
            const parts = req.time.split("T");
            if (parts.length === 2) cleanTime = parts[1].slice(0, 5);
        }

        const detailsBox = document.createElement("div");
        Object.assign(detailsBox.style, { display: "none", flexDirection: "column", gap: "6px", marginTop: "8px", padding: "8px", backgroundColor: "var(--bg-accent)", borderRadius: "4px", border: "1px solid var(--border-color)" });
        const titleDiv = document.createElement('div');
        titleDiv.style.fontSize = '11px';
        titleDiv.style.fontWeight = '600';
        titleDiv.style.color = 'var(--text-main)';
        titleDiv.innerText = 'Опис проблеми:';
        const msgDiv = document.createElement('div');
        msgDiv.style.fontSize = '12px';
        msgDiv.style.color = '#222222';
        msgDiv.style.wordBreak = 'break-word';
        msgDiv.style.lineHeight = '1.3';
        msgDiv.innerText = req.message || '';
        const metaDiv = document.createElement('div');
        metaDiv.style.fontSize = '10px';
        metaDiv.style.color = 'var(--text-muted)';
        metaDiv.style.borderTop = '1px dashed var(--border-color)';
        metaDiv.style.paddingTop = '6px';
        metaDiv.style.marginTop = '2px';
        metaDiv.style.display = 'flex';
        metaDiv.style.justifyContent = 'space-between';
        const metaSpan = document.createElement('span');
        metaSpan.innerText = `Внесено: ${cleanDate} о ${cleanTime}`;
        metaDiv.appendChild(metaSpan);
        detailsBox.appendChild(titleDiv);
        detailsBox.appendChild(msgDiv);
        detailsBox.appendChild(metaDiv);
        rowWrapper.appendChild(detailsBox);

        headerLine.addEventListener("mouseenter", () => {
            if (detailsBox.style.display !== "flex") rowWrapper.style.backgroundColor = "var(--bg-accent)";
        });
        headerLine.addEventListener("mouseleave", () => {
            if (detailsBox.style.display !== "flex") rowWrapper.style.backgroundColor = "transparent";
        });
        headerLine.addEventListener("click", e => {
            if (e.target.closest("button")) return;
            const box = rowWrapper.querySelector("div[style*='border: 1px solid var(--border-color)']");
            if (!box) return;
            const isHidden = box.style.display === "none" || !box.style.display;
            box.style.display  = isHidden ? "flex" : "none";
            arrowSpan.innerText = isHidden ? "▾" : "▸";
            rowWrapper.style.backgroundColor = isHidden ? "var(--bg-accent)" : "transparent";
        });

        Dom.requestChangesLog.appendChild(rowWrapper);
    });

    Dom.requestChangesLog.style.display = State.isRequestBlockCollapsed ? "none" : "flex";
    if (Dom.requestCollapseText) Dom.requestCollapseText.classList.toggle("expanded", !State.isRequestBlockCollapsed);
    if (Dom.requestToggleHeader) Dom.requestToggleHeader.classList.toggle("is-collapsed", State.isRequestBlockCollapsed);
    if (requestContainerEl) requestContainerEl.classList.toggle("is-collapsed", State.isRequestBlockCollapsed);
}

function getFilteredParametersChangesHistory(historyList) {
    const filter = State.parametersChangeLogFilter || "all";
    const sourceList = Array.isArray(historyList) ? historyList : (State.parametersChangesHistory || []);
    if (filter === "all") return sourceList;
    if (filter === "archived") return State.parametersArchivedChangesHistory || [];
    return sourceList.filter(item => item.type === filter);
}

function getParametersEntityWords(entityType) {
    if (entityType === "category") {
        return { accusative: "Категорію", genitive: "категорії" };
    }
    if (entityType === "subcategory") {
        return { accusative: "Підкатегорію", genitive: "підкатегорії" };
    }
    return { accusative: "Запис", genitive: "запису" };
}

function buildParametersChangeSummary(item) {
    const categoryName = String(item?.categoryName || "").trim();
    const subcategoryName = String(item?.subcategoryName || "").trim();
    const fallbackName = String(item?.name || "").trim();

    if (categoryName && subcategoryName) {
        if (item.type === "added") {
            return {
                prefix: `У категорії «${categoryName}» додано підкатегорію `,
                focusName: subcategoryName,
                suffix: ".",
            };
        }
        if (item.type === "modified") {
            return {
                prefix: `У категорії «${categoryName}» у підкатегорії `,
                focusName: subcategoryName,
                suffix: " були внесені зміни.",
            };
        }
        if (item.type === "removed") {
            return {
                prefix: `У категорії «${categoryName}» видалено підкатегорію `,
                focusName: subcategoryName,
                suffix: ".",
            };
        }
    }

    if (categoryName) {
        if (item.type === "added") {
            return { prefix: "Додано категорію ", focusName: categoryName, suffix: "." };
        }
        if (item.type === "modified") {
            return { prefix: "У категорії ", focusName: categoryName, suffix: " були внесені зміни." };
        }
        if (item.type === "removed") {
            return { prefix: "Видалено категорію ", focusName: categoryName, suffix: "." };
        }
    }

    const words = getParametersEntityWords(item?.entityType);
    if (item.type === "added") {
        return { prefix: `${words.accusative} `, focusName: fallbackName, suffix: " додано в розширення." };
    }
    if (item.type === "modified") {
        return { prefix: `Для ${words.genitive} `, focusName: fallbackName, suffix: " були внесені зміни." };
    }
    return { prefix: `${words.accusative} `, focusName: fallbackName, suffix: " видалено з розширення." };
}

function syncParametersChangeLogFiltersVisibility() {
    if (!Dom.parametersChangeLogFilters || !Dom.parametersChangesLog) return;
    const shouldShow = !State.isParametersBlockCollapsed;
    Dom.parametersChangeLogFilters.style.display = shouldShow ? "flex" : "none";
    if (Dom.parametersFilterCount) {
        const hasCount = Dom.parametersFilterCount.innerText.trim().length > 0;
        Dom.parametersFilterCount.style.display = shouldShow && hasCount ? "block" : "none";
    }
    if (Dom.parametersChangeLogPagination) Dom.parametersChangeLogPagination.style.display = shouldShow && Dom.parametersChangeLogPagination.innerHTML ? "flex" : "none";
}

function archiveParametersChange(item) {
    const keyMatcher = (it) => it && item && it.timestamp === item.timestamp && it.name === item.name && it.type === item.type;
    const idx = State.parametersChangesHistory.findIndex(keyMatcher);
    if (idx >= 0) State.parametersChangesHistory.splice(idx, 1);
    State.parametersArchivedChangesHistory = State.parametersArchivedChangesHistory || [];
    State.parametersArchivedChangesHistory.unshift(item);
    chrome.storage.local.set({
        parametersChangesHistory: State.parametersChangesHistory,
        parametersArchivedChangesHistory: State.parametersArchivedChangesHistory,
    });
    renderParametersChangesLog(State.parametersChangesHistory);
}

function restoreParametersChange(item) {
    const keyMatcher = (it) => it && item && it.timestamp === item.timestamp && it.name === item.name && it.type === item.type;
    const idx = State.parametersArchivedChangesHistory.findIndex(keyMatcher);
    if (idx >= 0) State.parametersArchivedChangesHistory.splice(idx, 1);
    State.parametersChangesHistory = State.parametersChangesHistory || [];
    State.parametersChangesHistory.unshift(item);
    chrome.storage.local.set({
        parametersChangesHistory: State.parametersChangesHistory,
        parametersArchivedChangesHistory: State.parametersArchivedChangesHistory,
    });
    renderParametersChangesLog(State.parametersChangesHistory);
}

function renderParametersChangesLog(historyList) {
    if (!Dom.parametersChangesLog) return;
    const filter = State.parametersChangeLogFilter || "all";
    const sourceHistory = Array.isArray(historyList) ? historyList : [];
    State.parametersChangesHistory = sourceHistory;
    const effectiveList = filter === "archived" ? (State.parametersArchivedChangesHistory || []) : State.parametersChangesHistory;
    const filteredHistory = getFilteredParametersChangesHistory(effectiveList);
    const totalItems = filteredHistory.length;
    const pageSize = State.parametersChangeLogPageSize || 20;
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 1;
    State.parametersCurrentChangeLogPage = Math.min(Math.max(State.parametersCurrentChangeLogPage || 1, 1), totalPages);
    const start = (State.parametersCurrentChangeLogPage - 1) * pageSize;
    const pageItems = filteredHistory.slice(start, start + pageSize);

    if (Dom.parametersFilterCount) {
        if (totalItems > 0) {
            const fromIndex = start + 1;
            const toIndex = start + pageItems.length;
            Dom.parametersFilterCount.innerText = `Відображено ${fromIndex}-${toIndex} з ${totalItems}`;
            Dom.parametersFilterCount.style.display = "block";
        } else {
            Dom.parametersFilterCount.innerText = "";
            Dom.parametersFilterCount.style.display = "none";
        }
    }
    if (Dom.parametersChangeLogPagination) {
        renderParametersChangeLogPagination(totalPages);
        Dom.parametersChangeLogPagination.style.display = totalPages > 1 && !State.isParametersBlockCollapsed ? "flex" : "none";
    }

    while (Dom.parametersChangesLog && Dom.parametersChangesLog.firstChild) {
        Dom.parametersChangesLog.removeChild(Dom.parametersChangesLog.firstChild);
    }

    if (filteredHistory.length === 0) {
        if (!State.isParametersBlockCollapsed) {
            const emptyState = document.createElement("div");
            emptyState.className = "change-empty-state";
            emptyState.innerText = "Немає змін цього типу";
            Dom.parametersChangesLog.appendChild(emptyState);
            Dom.parametersChangesLog.style.display = "flex";
        } else {
            Dom.parametersChangesLog.style.display = "none";
        }
        if (Dom.parametersFilterCount) Dom.parametersFilterCount.style.display = "none";
        if (Dom.parametersChangeLogPagination) Dom.parametersChangeLogPagination.style.display = "none";
        updateParametersChangeFilterButtons();
        return;
    }

    pageItems.forEach(item => {
        const rowWrapper = document.createElement("div");
        rowWrapper.className = "change-row-wrapper";

        const headerLine = document.createElement("div");
        headerLine.className = "change-header-line";

        const mainContentWrapper = document.createElement("div");
        mainContentWrapper.className = "change-main-content";

        let typeBadge = "", classColor = "";
        if (item.type === "added") { typeBadge = "+ Додано:"; classColor = "change-added"; }
        else if (item.type === "modified") { typeBadge = "~ Змінено:"; classColor = "change-modified"; }
        else if (item.type === "removed") { typeBadge = "- Видалено:"; classColor = "change-removed"; }

        const labelSpan = document.createElement("span");
        labelSpan.className = classColor;
        labelSpan.style.fontSize = "11px";

        const paramNameLink = document.createElement("span");
        paramNameLink.className = "change-brand-name";
        const summary = buildParametersChangeSummary(item);
        const focusName = String(summary.focusName || item.name || "").trim();
        paramNameLink.innerText = `«${focusName}»`;
        paramNameLink.style.cursor = "default";
        paramNameLink.style.textDecoration = "none";

        labelSpan.textContent = "";
        labelSpan.appendChild(document.createTextNode("• " + String(summary.prefix || "")));
        labelSpan.appendChild(paramNameLink);
        labelSpan.appendChild(document.createTextNode(String(summary.suffix || "")));

        mainContentWrapper.appendChild(labelSpan);
        headerLine.appendChild(mainContentWrapper);

        const rightControls = document.createElement("div");
        rightControls.className = "change-right-controls";

        const timeBadge = document.createElement("span");
        timeBadge.className = "change-datetime-right";
        timeBadge.innerText = formatDateTime(item.timestamp);

        const actionBtn = document.createElement("button");
        actionBtn.className = "change-action-btn";
        actionBtn.style.marginLeft = "8px";
        actionBtn.setAttribute("aria-label", State.parametersChangeLogFilter === "archived" ? "Відновити" : "В архів");
        if (State.parametersChangeLogFilter === "archived") {
            actionBtn.title = "Повернути в активні зміни";
            actionBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 0-3.53 7.07" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                    <path d="M21 3v6h-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>`;
            actionBtn.addEventListener("click", e => { e.stopPropagation(); restoreParametersChange(item); });
        } else {
            actionBtn.title = "Перемістити запис в архів";
            actionBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" />
                    <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>`;
            actionBtn.addEventListener("click", e => { e.stopPropagation(); archiveParametersChange(item); });
        }
        rightControls.appendChild(timeBadge);
        rightControls.appendChild(actionBtn);
        headerLine.appendChild(rightControls);
        rowWrapper.appendChild(headerLine);

        if (item.type === "modified") {
            const detailsBox = document.createElement("div");
            detailsBox.className = "change-details-box";
            if (item.details && item.details.length > 0) {
                item.details.forEach(d => {
                    const dDiv = document.createElement("div");
                    const bullet = document.createTextNode('• ');
                    const fieldSpan = document.createElement('span');
                    fieldSpan.style.fontWeight = '600';
                    fieldSpan.innerText = `${d.field}:`;
                    dDiv.appendChild(bullet);
                    dDiv.appendChild(fieldSpan);
                    dDiv.appendChild(document.createTextNode(` "${d.old}" ➔ "${d.new}"`));
                    detailsBox.appendChild(dDiv);
                });
            } else {
                const dDiv = document.createElement("div");
                const em = document.createElement('em');
                em.innerText = 'Деталей немає';
                dDiv.appendChild(em);
                detailsBox.appendChild(dDiv);
            }
            detailsBox.style.display = "none";
            rowWrapper.appendChild(detailsBox);
            headerLine.addEventListener("click", e => {
                if (e.target.closest(".change-action-btn")) return;
                if (e.target.closest(".change-brand-name")) return;
                const box = rowWrapper.querySelector(".change-details-box");
                if (!box) return;
                const isHidden = box.style.display === "none" || !box.style.display;
                box.style.display = isHidden ? "flex" : "none";
            });
        }
        Dom.parametersChangesLog.appendChild(rowWrapper);
    });

    Dom.parametersChangesLog.style.display = State.isParametersBlockCollapsed ? "none" : "flex";
    if (Dom.parametersCollapseText) Dom.parametersCollapseText.classList.toggle("expanded", !State.isParametersBlockCollapsed);
    updateParametersChangeFilterButtons();
    syncParametersChangeLogFiltersVisibility();
}

function updateParametersChangeFilterButtons() {
    const buttons = [
        { el: Dom.parametersChangeFilterAll, filter: "all", text: "Всі" },
        { el: Dom.parametersChangeFilterAdded, filter: "added", text: "Додано" },
        { el: Dom.parametersChangeFilterModified, filter: "modified", text: "Змінено" },
        { el: Dom.parametersChangeFilterRemoved, filter: "removed", text: "Видалено" },
        { el: Dom.parametersChangeFilterArchived, filter: "archived", text: "Архів" },
    ];

    buttons.forEach(({ el, filter, text }) => {
        if (!el) return;
        el.classList.toggle("active", State.parametersChangeLogFilter === filter);
        el.textContent = text;
    });
}

function setParametersChangeLogFilter(filter) {
    const previousFilter = State.parametersChangeLogFilter || "all";
    State.parametersChangeLogPageByFilter = State.parametersChangeLogPageByFilter || {};
    State.parametersChangeLogPageByFilter[previousFilter] = State.parametersCurrentChangeLogPage || 1;
    State.parametersChangeLogFilter = filter;
    State.parametersCurrentChangeLogPage = State.parametersChangeLogPageByFilter[filter] || 1;
    updateParametersChangeFilterButtons();
    renderParametersChangesLog(State.parametersChangesHistory || []);
    saveExtensionState();
}

function setParametersChangeLogPage(page) {
    const filter = State.parametersChangeLogFilter || "all";
    const sourceHistory = filter === "archived" ? (State.parametersArchivedChangesHistory || []) : State.parametersChangesHistory || [];
    const filteredHistory = getFilteredParametersChangesHistory(sourceHistory);
    const totalPages = Math.ceil(filteredHistory.length / (State.parametersChangeLogPageSize || 20)) || 1;
    const nextPage = Math.min(Math.max(1, page), totalPages);
    if (State.parametersCurrentChangeLogPage === nextPage) return;
    State.parametersCurrentChangeLogPage = nextPage;
    State.parametersChangeLogPageByFilter = State.parametersChangeLogPageByFilter || {};
    State.parametersChangeLogPageByFilter[filter] = nextPage;
    renderParametersChangesLog(State.parametersChangesHistory || []);
    saveExtensionState();
}

function renderParametersChangeLogPagination(totalPages) {
    if (!Dom.parametersChangeLogPagination) return;
    while (Dom.parametersChangeLogPagination && Dom.parametersChangeLogPagination.firstChild) {
        Dom.parametersChangeLogPagination.removeChild(Dom.parametersChangeLogPagination.firstChild);
    }
    if (totalPages <= 1) {
        Dom.parametersChangeLogPagination.style.display = "none";
        return;
    }

    const createButton = (label, page, disabled = false, active = false) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pagination-btn" + (active ? " active" : "") + (disabled ? " disabled" : "");
        btn.innerText = label;
        btn.disabled = disabled;
        if (!disabled && !active) {
            btn.addEventListener("click", () => setParametersChangeLogPage(page));
        }
        return btn;
    };

    const currentPage = State.parametersCurrentChangeLogPage || 1;
    Dom.parametersChangeLogPagination.appendChild(createButton("<", currentPage - 1, currentPage === 1));

    const pageButtons = Math.min(5, totalPages);
    let startPage = 1;
    let endPage = pageButtons;

    if (totalPages > pageButtons) {
        const half = Math.floor(pageButtons / 2);
        if (currentPage <= half + 1) {
            startPage = 1;
            endPage = pageButtons;
        } else if (currentPage >= totalPages - half) {
            startPage = totalPages - pageButtons + 1;
            endPage = totalPages;
        } else {
            startPage = currentPage - half;
            endPage = currentPage + half;
        }
    }

    for (let page = startPage; page <= endPage; page += 1) {
        Dom.parametersChangeLogPagination.appendChild(createButton(page, page, false, page === currentPage));
    }

    if (totalPages > pageButtons && endPage < totalPages) {
        const ellipsis = document.createElement("span");
        ellipsis.className = "pagination-ellipsis";
        ellipsis.innerText = "…";
        Dom.parametersChangeLogPagination.appendChild(ellipsis);
        Dom.parametersChangeLogPagination.appendChild(createButton(String(totalPages), totalPages));
    }

    Dom.parametersChangeLogPagination.appendChild(createButton(">", currentPage + 1, currentPage === totalPages));
    Dom.parametersChangeLogPagination.style.display = "flex";
}
