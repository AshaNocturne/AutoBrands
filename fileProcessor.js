// ============================================================
// fileProcessor.js — завантаження файлів, парсинг txt/xlsx,
//                    вибір колонок, формування Excel-звіту
// ============================================================

function parseTxtFileData(text) {
    return text.split(/\r?\n/).reduce((acc, line) => {
        const trimmed = line.trim();
        if (!trimmed) return acc;
        const found = findBrandWithReason(trimmed);
        acc.push(found
            ? { source: trimmed, found: true, brand: found.brand, reason: found.reason }
            : { source: trimmed, found: false, brand: _notFoundBrand(), reason: "Не знайдено" }
        );
        return acc;
    }, []);
}

function parseExcelFileData(rows) {
    return rows.reduce((acc, row, rIdx) => {
        let foundInfo = null, searchKey = "", matchReason = "Не знайдено";

        for (let c = 0; c < row.length; c++) {
            const cellVal = String(row[c] || "").trim();
            if (cellVal.length > 1) {
                const found = findBrandWithReason(cellVal);
                if (found) { foundInfo = found.brand; searchKey = cellVal; matchReason = found.reason; break; }
            }
        }

        if (rIdx === 0 && !foundInfo) return acc; // skip header row if unrecognised

        if (foundInfo) {
            acc.push({ source: searchKey, found: true, brand: foundInfo, reason: matchReason });
        } else {
            const repText = row.find(c => String(c || "").trim().length > 0) || `Рядок ${rIdx + 1}`;
            acc.push({ source: String(repText).trim(), found: false, brand: _notFoundBrand(), reason: "Не знайдено" });
        }
        return acc;
    }, []);
}

function _notFoundBrand() {
    return { fullName: "НЕ ЗНАЙДЕНО", status: "Не знайдено", prefix: "-", country: "-", typeofsparepart: "-", site: "-", catalog: "-" };
}

function getColumnDraftSelectedKeys() {
    return Array.from(document.querySelectorAll(".column-rule-select")).map(el => el.value || "");
}

function estimateJsonBytes(value) {
    try {
        const json = JSON.stringify(value);
        if (!json) return 0;
        if (typeof TextEncoder !== "undefined") {
            return new TextEncoder().encode(json).length;
        }
        return json.length;
    } catch (e) {
        return Number.MAX_SAFE_INTEGER;
    }
}

function persistColumnSelectorSession() {
    if (!chrome?.storage?.local) return;

    const MAX_SESSION_BYTES = 350 * 1024;
    const pendingFileData = Array.isArray(State.pendingFileData) ? State.pendingFileData : null;
    const pendingSize = pendingFileData ? estimateJsonBytes(pendingFileData) : 0;
    const canPersistPendingData = pendingFileData && pendingSize <= MAX_SESSION_BYTES;

    const session = {
        pendingFileData: canPersistPendingData ? pendingFileData : null,
        pendingFileName: State.pendingFileName,
        visible: canPersistPendingData && Dom.columnSelectorBlock ? Dom.columnSelectorBlock.style.display === "block" : false,
        expanded: Dom.columnSelectorBody ? Dom.columnSelectorBody.style.display !== "none" : false,
        selectedKeys: getColumnDraftSelectedKeys(),
        oversizeSkipped: !!pendingFileData && !canPersistPendingData,
    };

    chrome.storage.local.set({ columnSelectorSession: session }, () => {
        if (chrome.runtime?.lastError) {
            console.warn("column selector session save skipped:", chrome.runtime.lastError.message);
        }
    });
}

function clearColumnSelectorSession() {
    if (!chrome?.storage?.local) return;
    chrome.storage.local.remove("columnSelectorSession");
}

function syncColumnRuleOptions() {
    const selects = Array.from(document.querySelectorAll(".column-rule-select"));
    const selectedValues = selects.map(select => select.value).filter(Boolean);

    selects.forEach(select => {
        Array.from(select.options).forEach(option => {
            if (!option.value) {
                option.disabled = false;
                return;
            }
            option.disabled = selectedValues.includes(option.value) && option.value !== select.value;
        });
    });
}

function setColumnSelectorExpanded(expanded) {
    if (Dom.columnSelectorBody) {
        Dom.columnSelectorBody.style.display = expanded ? "block" : "none";
    }
    if (Dom.columnCollapseText) {
        Dom.columnCollapseText.classList.toggle("expanded", expanded);
    }
    if (Dom.columnSelectorBlock) {
        Dom.columnSelectorBlock.classList.toggle("is-collapsed", !expanded);
    }
}

function refreshAddFirstButtonVisibility() {
    if (!Dom.addColumnRuleBtn || !Dom.columnSelectorList) return;
    const isEmpty = Dom.columnSelectorList.children.length === 0;
    Dom.addColumnRuleBtn.style.display = isEmpty ? "inline-flex" : "none";
    if (Dom.columnSelectorBlock) {
        Dom.columnSelectorBlock.classList.toggle("is-empty", isEmpty);
    }
    if (isEmpty) {
        setColumnSelectorExpanded(false);
    }
}

function createColumnRuleRow(selectedKey) {
    const row = document.createElement("div");
    row.className = "column-rule-row";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "column-rule-add";
    addBtn.textContent = "+";
    addBtn.title = "Додати параметр";
    addBtn.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        addEmptyColumnRule(row);
    });

    const select = document.createElement("select");
    select.className = "column-rule-select";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Оберіть параметр...";
    placeholder.selected = !selectedKey;
    select.appendChild(placeholder);

    COLUMN_OPTIONS.forEach(option => {
        const item = document.createElement("option");
        item.value = option.key;
        item.textContent = option.label;
        if (selectedKey === option.key) item.selected = true;
        select.appendChild(item);
    });

    select.addEventListener("change", () => syncColumnRuleOptions());
    select.addEventListener("change", () => persistColumnSelectorSession());

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "column-rule-remove";
    removeBtn.textContent = "−";
    removeBtn.title = "Прибрати параметр";
    removeBtn.addEventListener("click", () => {
        row.remove();
        syncColumnRuleOptions();
        refreshAddFirstButtonVisibility();
        persistColumnSelectorSession();
    });

    row.appendChild(addBtn);
    row.appendChild(select);
    row.appendChild(removeBtn);

    syncColumnRuleOptions();
    return row;
}

function addEmptyColumnRule(afterRow) {
    if (!Dom.columnSelectorList) return;
    const newRow = createColumnRuleRow("");
    if (afterRow && afterRow.parentElement === Dom.columnSelectorList) {
        afterRow.insertAdjacentElement("afterend", newRow);
    } else {
        Dom.columnSelectorList.appendChild(newRow);
    }
    refreshAddFirstButtonVisibility();
    persistColumnSelectorSession();
}

function restoreColumnSelectorSession(session) {
    if (!session || !Array.isArray(session.pendingFileData) || session.pendingFileData.length === 0) return;

    State.pendingFileData = session.pendingFileData;
    State.pendingFileName = session.pendingFileName || null;

    if (Dom.columnSelectorBlock) {
        Dom.columnSelectorBlock.style.display = session.visible === false ? "none" : "block";
    }
    if (Dom.columnSelectorList) {
        Dom.columnSelectorList.textContent = "";
    }

    const selectedKeys = Array.isArray(session.selectedKeys) ? session.selectedKeys : [];
    if (selectedKeys.length > 0) {
        selectedKeys.forEach(key => {
            const normalized = typeof key === "string" ? key : "";
            Dom.columnSelectorList.appendChild(createColumnRuleRow(normalized));
        });
        refreshAddFirstButtonVisibility();
    } else {
        addEmptyColumnRule();
    }

    const expanded = session.expanded !== false;
    setColumnSelectorExpanded(expanded);
    syncColumnRuleOptions();
}

function showColumnSelector() {
    if (Dom.columnSelectorBlock) {
        Dom.columnSelectorBlock.style.display = "block";
    }
    if (Dom.columnSelectorList) {
        Dom.columnSelectorList.textContent = "";
    }
    if (Dom.columnSelectorBody) {
        Dom.columnSelectorBody.style.display = "block";
    }
    if (Dom.columnCollapseText) Dom.columnCollapseText.classList.add("expanded");
    addEmptyColumnRule();
    refreshAddFirstButtonVisibility();
    persistColumnSelectorSession();
}

function hideColumnSelector() {
    if (Dom.columnSelectorBlock) Dom.columnSelectorBlock.style.display = "none";
    clearColumnSelectorSession();
}

function finalizeFileProcessing() {
    if (!State.pendingFileData) return;

    const uiRows = State.pendingFileData.map(item => ({
        source:   item.source,
        fullName: item.found ? item.brand.fullName : "НЕ ЗНАЙДЕНО",
        status:   item.found ? item.brand.status   : "Не знайдено",
        found:    item.found,
        reason:   item.reason,
        ...item.brand,
    }));

    // For "all" filter export includes reason column; for other filters it does not.
    const includeReasonColumn = (State && State.searchFilter === "all") || !State;

    // Always keep all mapped extra columns selected by the user.
    const filteredColumns = State && State.currentSelectedColumns ? [...State.currentSelectedColumns] : [];
    
    const excelHeader = ["Запит", "Найменування в Gomer", "Статус бренду"];
    if (includeReasonColumn) {
        excelHeader.push("Збіг за");
    }
    filteredColumns.forEach(key => {
        const col = COLUMN_OPTIONS.find(o => o.key === key);
        if (col) excelHeader.push(col.label);
    });

    const excelRows = [excelHeader];
    State.pendingFileData.forEach(item => {
        const row = [
            item.source,
            item.found ? item.brand.fullName : "НЕ ЗНАЙДЕНО",
            item.found ? item.brand.status   : "Не знайдено",
        ];
        if (includeReasonColumn) {
            row.push(item.reason);
        }
        filteredColumns.forEach(key => row.push(item.brand[key] || "-"));
        excelRows.push(row);
    });

    State.currentReportData    = uiRows;
    State.exportDataArray      = excelRows;
    State.isExcelArrayExport   = true;

    Dom.CampResultsContainer.style.display = "none";
    State.currentlySelectedBrand = "";
    syncFeedbackBrandField();
    saveExtensionState();

    Dom.fileUploadInput.value = "";
    State.pendingFileData  = null;
    State.pendingFileName  = null;

    downloadCurrentExcel();
}

function initFileUpload() {
    if (!Dom.uploadFileBtn || !Dom.fileUploadInput) return;

    Dom.uploadFileBtn.addEventListener("click", () => Dom.fileUploadInput.click());

    Dom.fileUploadInput.addEventListener("change", e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();

        if (file.name.endsWith(".txt")) {
            reader.onload = ev => {
                State.pendingFileData = parseTxtFileData(ev.target.result);
                State.pendingFileName = file.name;
                showColumnSelector();
            };
            reader.readAsText(file);
        } else {
            reader.onload = ev => {
                try {
                    const workbook = XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
                    const rows     = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
                    State.pendingFileData = parseExcelFileData(rows);
                    State.pendingFileName = file.name;
                    showColumnSelector();
                } catch {
                    alert("Помилка читання файлу.");
                    Dom.fileUploadInput.value = "";
                }
            };
            reader.readAsArrayBuffer(file);
        }
    });
}

function initColumnSelector() {
    if (Dom.addColumnRuleBtn) {
        Dom.addColumnRuleBtn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            setColumnSelectorExpanded(true);
            addEmptyColumnRule();
        });
    }

    if (Dom.columnSelectorHeader && Dom.columnSelectorBody) {
        Dom.columnSelectorHeader.addEventListener("click", () => {
            const expanded = Dom.columnSelectorBody.style.display !== "none";
            setColumnSelectorExpanded(!expanded);
            persistColumnSelectorSession();
        });
    }

    if (Dom.confirmColumnsBtn) {
        Dom.confirmColumnsBtn.addEventListener("click", () => {
            const selected = Array.from(document.querySelectorAll(".column-rule-select"))
                .map(el => el.value)
                .filter(Boolean);

            if (selected.length === 0) {
                alert("Додайте хоча б один параметр для звіту.");
                return;
            }

            State.currentSelectedColumns = Array.from(new Set(selected));
            hideColumnSelector();
            finalizeFileProcessing();
        });
    }
    if (Dom.cancelColumnsBtn) {
        Dom.cancelColumnsBtn.addEventListener("click", () => {
            hideColumnSelector();
            Dom.fileUploadInput.value = "";
            State.pendingFileData     = null;
            State.pendingFileName     = null;
            clearColumnSelectorSession();
        });
    }
}

if (typeof window !== "undefined") {
    window.restoreColumnSelectorSession = restoreColumnSelectorSession;
    window.clearColumnSelectorSession = clearColumnSelectorSession;
}
