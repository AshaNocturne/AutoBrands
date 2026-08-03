// ============================================================
// excel.js — генерація та завантаження XLSX-файлів
// ============================================================

function downloadBlob(blob, filename) {
    const reader = new FileReader();
    reader.onloadend = () => chrome.downloads.download({ url: reader.result, filename });
    reader.readAsDataURL(blob);
}

function makeXlsxBlob(sheetData, sheetName, colWidths) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const workbook  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    if (colWidths) worksheet["!cols"] = colWidths;
    const buf = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function downloadCurrentExcel() {
    if (!State.exportDataArray || State.exportDataArray.length === 0) return;
    try {
        const colWidths = State.exportDataArray[0].map(() => ({ wch: 22 }));
        const blob      = makeXlsxBlob(State.exportDataArray, "Звіт", colWidths);
        const ts        = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        downloadBlob(blob, `AutoBrands_Report_${ts}.xlsx`);
    } catch {
        alert("Помилка генерації Excel.");
    }
}

function downloadReportFromJson(reportData) {
    try {
        const rows = reportData.map(b => ({
            "Ключ":                   b.key            || "-",
            "Бренд":                  b.fullName        || "-",
            "Юр. особа (Enterprise)": b.enterpriseName  || "-",
            "Префікс (1С)":           b.prefix          || "-",
            "Країна":                 b.country          || "-",
            "Тип запчастини":         b.typeofsparepart  || "-",
            "Статус бренду":          b.status           || "-",
            "Серія":                  b.series           || "-",
            "Додаткова інформація":   b.additionalInfo   || "-",
            "Опис (ua)":              b.descriptionUa    || "-",
        }));
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook  = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Звіт");
        const buf  = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const ts   = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        downloadBlob(blob, `AutoBrands_Report_${ts}.xlsx`);
    } catch {
        alert("Помилка генерації Excel.");
    }
}

function getSheetLabel(filterKey) {
    switch (filterKey) {
        case "all":      return "Всі";
        case "added":    return "Додано";
        case "modified": return "Змінено";
        case "removed":  return "Видалено";
        case "archived": return "Архів";
        default:          return "Історія";
    }
}

function formatDateTimeForExcel(timestamp) {
    if (!timestamp) return "-";
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}.${month}.${year} (${hours}:${minutes})`;
}

function buildHistorySheetRows(historyEntries, filterKey) {
    const rows = [];
    const allFields = [];
    const itemDetails = [];

    historyEntries.forEach(entry => {
        const item = entry && entry.item ? entry.item : entry;
        const details = Array.isArray(item.details) ? item.details : [];
        const detailFields = details.map(d => d.field || "").filter(Boolean);
        itemDetails.push({ entry, item, details, detailFields });
        detailFields.forEach(field => {
            if (!allFields.includes(field)) allFields.push(field);
        });
    });

    const fieldColumns = allFields.flatMap(field => [`${field} (було)`, `${field} (стало)`]);
    const headerRow = ["Дата (час)", "Тип", "Бренд"];

    if (filterKey === "archived") {
        headerRow.push("Тип зміни");
    }

    headerRow.push(...fieldColumns);
    rows.push(headerRow);

    itemDetails.forEach(({ entry, item, details }) => {
        const typeLabel = item.type === "added" ? "Додано" : (item.type === "modified" ? "Змінено" : (item.type === "removed" ? "Видалено" : "Невідомо"));
        const row = [
            formatDateTimeForExcel(item.timestamp),
            typeLabel,
            item.name || "-",
        ];

        if (filterKey === "archived") {
            row.push(entry.isArchived ? "Архів" : typeLabel);
        }

        const detailMap = {};
        details.forEach(d => {
            if (d && d.field) {
                detailMap[d.field] = {
                    old: d.old || "",
                    new: d.new || "",
                };
            }
        });

        allFields.forEach(field => {
            const values = detailMap[field] || { old: "", new: "" };
            row.push(values.old);
            row.push(values.new);
        });

        rows.push(row);
    });

    return rows;
}

function downloadChangesHistory() {
    chrome.storage.local.get(["savedChangesHistory", "archivedChangesHistory"], result => {
        const activeHistory = Array.isArray(result.savedChangesHistory) ? result.savedChangesHistory : [];
        const archivedHistory = Array.isArray(result.archivedChangesHistory) ? result.archivedChangesHistory : [];
        const activeEntries = activeHistory.map(item => ({ item, isArchived: false }));
        const archivedEntries = archivedHistory.map(item => ({ item, isArchived: true }));
        const allEntries = [...activeEntries, ...archivedEntries];

        if (allEntries.length === 0) {
            return alert("Кеш оновлень порожній.");
        }

        const workbook = XLSX.utils.book_new();
        const sheets = ["all", "added", "modified", "removed", "archived"];

        sheets.forEach(filterKey => {
            let sheetRows = [];
            if (filterKey === "all") {
                sheetRows = buildHistorySheetRows(allEntries, "all");
            } else if (filterKey === "archived") {
                sheetRows = buildHistorySheetRows(archivedEntries, "archived");
            } else {
                const filtered = activeEntries.filter(entry => entry.item && entry.item.type === filterKey);
                sheetRows = buildHistorySheetRows(filtered, filterKey);
            }

            if (sheetRows.length === 1) {
                sheetRows.push(["Немає записів"]);
            }

            const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
            const sheetName = getSheetLabel(filterKey).substring(0, 31);
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        });

        try {
            const now = new Date();
            const formattedDate = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
            const formattedTime = `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
            const filename = `AutoBrands_History_${formattedDate}_${formattedTime}.xlsx`;
            const buf = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
            const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            downloadBlob(blob, filename);
        } catch {
            alert("Помилка генерації Excel.");
        }
    });
}

function downloadParametersChangesHistory() {
    chrome.storage.local.get(["parametersChangesHistory", "parametersArchivedChangesHistory"], result => {
        const activeHistory = Array.isArray(result.parametersChangesHistory) ? result.parametersChangesHistory : [];
        const archivedHistory = Array.isArray(result.parametersArchivedChangesHistory) ? result.parametersArchivedChangesHistory : [];
        const activeEntries = activeHistory.map(item => ({ item, isArchived: false }));
        const archivedEntries = archivedHistory.map(item => ({ item, isArchived: true }));
        const allEntries = [...activeEntries, ...archivedEntries];

        if (allEntries.length === 0) {
            return alert("Кеш оновлень параметрів порожній.");
        }

        const workbook = XLSX.utils.book_new();
        const sheets = ["all", "added", "modified", "removed", "archived"];

        sheets.forEach(filterKey => {
            let sheetRows = [];
            if (filterKey === "all") {
                sheetRows = buildHistorySheetRows(allEntries, "all");
            } else if (filterKey === "archived") {
                sheetRows = buildHistorySheetRows(archivedEntries, "archived");
            } else {
                const filtered = activeEntries.filter(entry => entry.item && entry.item.type === filterKey);
                sheetRows = buildHistorySheetRows(filtered, filterKey);
            }

            if (sheetRows.length === 1) {
                sheetRows.push(["Немає записів"]);
            }

            const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
            const sheetName = getSheetLabel(filterKey).substring(0, 31);
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        });

        try {
            const now = new Date();
            const formattedDate = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
            const formattedTime = `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
            const filename = `AutoBrands_Parameters_History_${formattedDate}_${formattedTime}.xlsx`;
            const buf = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
            const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            downloadBlob(blob, filename);
        } catch {
            alert("Помилка генерації Excel.");
        }
    });
}
