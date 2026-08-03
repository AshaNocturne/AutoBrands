// ============================================================
// search.js — фільтрація підказок і пошук бренду за ключем
// ============================================================

const SEARCH_REASONS = {
    FULL_NAME: "Gomer",
    ENTERPRISE: "Enterprise",
    PREFIX: "Приставка",
    SYNONYM: "Синонім",
    KEY: "Ключ / код",
    FUZZY: "Нечіткий збіг",
};

// Transliteration map: Ukrainian/Russian Cyrillic → Latin
const CYRILLIC_TO_LATIN = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'ж': 'zh', 'з': 'z', 'и': 'y',
    'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
    'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ь': '', 'ю': 'yu', 'я': 'ya',
    'і': 'i', 'ї': 'yi', 'є': 'ye',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'H', 'Ґ': 'G', 'Д': 'D', 'Е': 'E', 'Ж': 'ZH', 'З': 'Z', 'И': 'Y',
    'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T',
    'У': 'U', 'Ф': 'F', 'Х': 'H', 'Ц': 'TS', 'Ч': 'CH', 'Ш': 'SH', 'Щ': 'SCH', 'Ь': '', 'Ю': 'YU', 'Я': 'YA',
    'І': 'I', 'Ї': 'YI', 'Є': 'YE',
};

// ЙЦУКЕН keyboard layout (Ukrainian) - maps position character (Cyrillic) to QWERTY position
// When typing on QWERTY layout but keyboard is set to Ukrainian, these are the characters produced:
// q w e r t y u i o p -> Й Ц У К Е Н Г Ш Щ З
// a s d f g h j k l    -> Ф И В А П Р О Л Д
// z x c v b n m        -> Я Ч С М И Т Ь
const QWERTY_POSITION_TO_CYRILLIC = {
    'q': 'й', 'w': 'ц', 'e': 'у', 'r': 'к', 't': 'е', 'y': 'н', 'u': 'г', 'i': 'ш', 'o': 'щ', 'p': 'з',
    'a': 'ф', 's': 'і', 'd': 'в', 'f': 'а', 'g': 'п', 'h': 'р', 'j': 'о', 'k': 'л', 'l': 'д',
    'z': 'я', 'x': 'ч', 'c': 'с', 'v': 'м', 'b': 'и', 'n': 'т', 'm': 'ь',
    'Q': 'Й', 'W': 'Ц', 'E': 'У', 'R': 'К', 'T': 'Е', 'Y': 'Н', 'U': 'Г', 'I': 'Ш', 'O': 'Щ', 'P': 'З',
    'A': 'Ф', 'S': 'І', 'D': 'В', 'F': 'А', 'G': 'П', 'H': 'Р', 'J': 'О', 'K': 'Л', 'L': 'Д',
    'Z': 'Я', 'X': 'Ч', 'C': 'С', 'V': 'М', 'B': 'И', 'N': 'Т', 'M': 'Ь',
};

// Reverse map: QWERTY position to actual QWERTY letter (for transliterating ЙЦУКЕН back to English)
const CYRILLIC_POSITION_TO_QWERTY = (() => {
    const reversed = {};
    for (const [pos, cyr] of Object.entries(QWERTY_POSITION_TO_CYRILLIC)) {
        if (cyr) {
            const isUpper = cyr === cyr.toUpperCase() && cyr !== cyr.toLowerCase();
            reversed[cyr] = isUpper ? pos.toUpperCase() : pos.toLowerCase();
        }
    }
    return reversed;
})();

// Reverse map: Latin → Cyrillic (for when keyboard is on wrong layout)
// Used to detect when user types English text but keyboard is set to Ukrainian/Russian
const LATIN_TO_CYRILLIC = (() => {
    const reversed = {};
    for (const [cyr, lat] of Object.entries(CYRILLIC_TO_LATIN)) {
        if (lat) {
            const latLower = lat.toLowerCase();
            const latUpper = lat.toUpperCase();
            reversed[latLower] = cyr.toLowerCase();
            reversed[latUpper] = cyr.toUpperCase();
        }
    }
    return reversed;
})();

// Transliterate Cyrillic characters to Latin
function transliterate(s) {
    if (!s) return "";
    let result = '';
    for (const char of String(s)) {
        result += CYRILLIC_TO_LATIN[char] || char;
    }
    return result;
}

// Reverse transliterate: Latin → Cyrillic (for wrong keyboard layout detection)
// E.g., if user types "Bosch" but keyboard is on Ukrainian, they get "Уфыр" (Russian-like)
// We detect this and try to convert back
function reverseTransliterate(s) {
    if (!s) return "";
    let result = '';
    for (const char of String(s)) {
        result += LATIN_TO_CYRILLIC[char] || char;
    }
    return result;
}

// Keyboard position conversion: ЙЦУКЕН → QWERTY
// E.g., if user types "Bosch" but keyboard sends ЙЦУКЕН characters at those positions
// "ищіср" (И-Щ-І-С-Р at positions s-o-i-c-h) should convert to "Bosch"
// This detects when the user's text is already in Cyrillic but at QWERTY positions
function convertYcukenToQwerty(s) {
    if (!s) return "";
    let result = '';
    for (const char of String(s)) {
        // Try position-based conversion first
        const qwertyChar = CYRILLIC_POSITION_TO_QWERTY[char];
        if (qwertyChar) {
            result += qwertyChar;
        } else {
            // Fall back to transliteration
            result += CYRILLIC_TO_LATIN[char] || char;
        }
    }
    return result;
}

// Normalization helper: trim, uppercase, remove punctuation
function normalizeKey(s) {
    if (!s) return "";
    try {
        // First transliterate Cyrillic to Latin
        let t = transliterate(String(s).trim());
        // Normalize common symbols and spaces before comparison
        t = t
            .replace(/[’`´]/g, "'")
            .replace(/[‐‑‒–—]/g, "-")
            .replace(/\s+/g, " ");
        // Then normalize Unicode (decompose accents), remove combining marks
        try {
            t = t.normalize('NFKD').replace(/\p{M}/gu, '');
        } catch (e) {
            // if normalize not supported, continue with transliterated string
        }
        return t.toUpperCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
    } catch (e) {
        // fallback (older engines) — transliterate then remove common punctuation
        let t = transliterate(String(s).trim()).replace(/[’`´]/g, "'").replace(/[‐‑‒–—]/g, "-").replace(/\s+/g, " ");
        return t.toUpperCase().replace(/[^A-Z0-9\s]/gi, "").replace(/\s+/g, " ").trim();
    }
}

function getActiveSearchFilter() {
    return (State && State.searchFilter) || "all";
}

function matchesReasonForFilter(reason, filter) {
    const reasonText = String(reason || "");
    if (filter === "all") return true;
    if (filter === "fullName") return reasonText.startsWith(SEARCH_REASONS.FULL_NAME);
    if (filter === "enterpriseName") return reasonText.startsWith(SEARCH_REASONS.ENTERPRISE);
    if (filter === "prefix") return reasonText.startsWith(SEARCH_REASONS.PREFIX);
    if (filter === "synonyms") return reasonText.startsWith(SEARCH_REASONS.SYNONYM);
    return true;
}

// Exact lookup map: normalizedKey -> [{ id, reason }]
const exactLookupMap = new Map();
// id -> index in searchIndex
const searchIdMap = new Map();
// compact search index: array of { id, brandIndex, displayName, _normFullName, _normPrefix, _normKey, _normSynonyms }
const searchIndex = [];

// compute a simple signature for a brands array (djb2 over joined ids)
function computeBrandsSignature(brands) {
    try {
        if (!Array.isArray(brands)) return null;
        let str = '';
        for (const b of brands) {
            const id = (b && (b._searchId || b.key || b.fullName)) || '';
            const fullName = normalizeKey((b && b.fullName) || '');
            const enterprise = normalizeKey((b && b.enterpriseName) || '');
            const prefix = normalizeKey((b && b.prefix) || '');
            const key = normalizeKey((b && b.key) || '');
            const synonyms = normalizeKey((b && b.synonyms) || '');
            str += `${String(id).trim()}|${key}|${fullName}|${enterprise}|${prefix}|${synonyms};`;
        }
        // djb2
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash = hash & 0xFFFFFFFF; // keep 32-bit
        }
        return String(hash >>> 0);
    } catch (e) {
        return null;
    }
}

function buildSearchIndex() {
    exactLookupMap.clear();
    searchIdMap.clear();
    if (!Array.isArray(State.uniqueBrandsList)) return;

    searchIndex.length = 0;
    State.uniqueBrandsList.forEach((b, idx) => {
        b._normFullName = normalizeKey(b.fullName || "");
        b._normEnterpriseName = normalizeKey(b.enterpriseName || "");
        b._normPrefix = normalizeKey(b.prefix || "");
        b._normKey = normalizeKey(b.key || "");
        b._normSynonyms = Array.isArray(b._normSynonyms) ? b._normSynonyms : [];

        // stable search id used for de-duplication and ranking
        b._searchId = b._normKey || b._normFullName || (`BRAND_${idx}`);

        // prepare synonyms array normalized
        if (b.synonyms) {
            b._normSynonyms = b.synonyms.split(",").map(s => normalizeKey(s)).filter(Boolean);
        } else {
            b._normSynonyms = [];
        }

        // register compact index entry and id -> index map
        const entry = {
            id: b._searchId,
            brandIndex: idx,
            displayName: b.fullName || b.key || "",
            _normFullName: b._normFullName,
            _normEnterpriseName: b._normEnterpriseName,
            _normPrefix: b._normPrefix,
            _normKey: b._normKey,
            _normSynonyms: b._normSynonyms || [],
        };
        const si = searchIndex.push(entry) - 1;
        searchIdMap.set(b._searchId, si);

        const pushExact = (k, reason) => {
            if (!k) return;
            const list = exactLookupMap.get(k) || [];
            list.push({ id: b._searchId, reason });
            exactLookupMap.set(k, list);
        };

        pushExact(b._normFullName, SEARCH_REASONS.FULL_NAME);
        pushExact(b._normEnterpriseName, SEARCH_REASONS.ENTERPRISE);
        pushExact(b._normPrefix, SEARCH_REASONS.PREFIX);
        pushExact(b._normKey, SEARCH_REASONS.KEY);
        (b._normSynonyms || []).forEach(s => pushExact(s, SEARCH_REASONS.SYNONYM));
    });

    // persist compact index and signature (best-effort)
    try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const sig = computeBrandsSignature(State.uniqueBrandsList);
            chrome.storage.local.set({ searchIndexCompact: searchIndex, searchIndexSignature: sig }, () => {
                if (chrome.runtime?.lastError) {
                    // If quota is tight, keep runtime index only and drop persistent cache.
                    chrome.storage.local.remove(["searchIndexCompact", "searchIndexSignature"]);
                    console.warn("search index cache skipped:", chrome.runtime.lastError.message);
                }
            });
        }
    } catch (e) {
        // ignore storage errors
    }

    // expose for manual rebuilds
    if (typeof window !== "undefined") {
        window.buildSearchIndex = buildSearchIndex;
        window.searchIdMap = searchIdMap;
        window.searchIndex = searchIndex;
    }
}

// Try to restore compact index from chrome.storage.local. Returns a Promise<boolean>.
function restoreSearchIndexFromStorage() {
    return new Promise(resolve => {
        try {
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return resolve(false);
            chrome.storage.local.get(['searchIndexCompact'], result => {
                const data = result && result.searchIndexCompact;
                const storedSig = result && result.searchIndexSignature;
                if (!Array.isArray(data)) return resolve(false);
                if (!Array.isArray(State.uniqueBrandsList) || State.uniqueBrandsList.length !== data.length) return resolve(false);
                // compute signature from current brands and compare
                const currentSig = computeBrandsSignature(State.uniqueBrandsList);
                if (!storedSig || !currentSig || String(storedSig) !== String(currentSig)) return resolve(false);
                // rebuild in-memory structures from stored compact index
                exactLookupMap.clear();
                searchIdMap.clear();
                searchIndex.length = 0;
                data.forEach((entry, i) => {
                    // ensure _normSynonyms is always an array
                    entry._normSynonyms = Array.isArray(entry._normSynonyms) ? entry._normSynonyms : [];
                    searchIndex.push(entry);
                    searchIdMap.set(entry.id, i);
                    const pushExact = (k, reason) => {
                        if (!k) return;
                        const list = exactLookupMap.get(k) || [];
                        list.push({ id: entry.id, reason });
                        exactLookupMap.set(k, list);
                    };
                    pushExact(entry._normFullName, SEARCH_REASONS.FULL_NAME);
                    pushExact(entry._normEnterpriseName, SEARCH_REASONS.ENTERPRISE);
                    pushExact(entry._normPrefix, SEARCH_REASONS.PREFIX);
                    pushExact(entry._normKey, SEARCH_REASONS.KEY);
                    (entry._normSynonyms || []).forEach(s => pushExact(s, SEARCH_REASONS.SYNONYM));
                });
                if (typeof window !== 'undefined') {
                    window.searchIndex = searchIndex;
                    window.searchIdMap = searchIdMap;
                }
                resolve(true);
            });
        } catch (e) {
            resolve(false);
        }
    });
}

if (typeof window !== 'undefined') window.restoreSearchIndexFromStorage = restoreSearchIndexFromStorage;

function rankAndSliceCandidates(candidates, limit = 5) {
    // candidates: { brand, reason, score }
    const unique = new Map();
    candidates.forEach(c => {
        const id = c && (c.id || (c.brand && (c.brand._searchId || c.brand.key || c.brand.fullName)));
        if (!id) return; // skip invalid entries
        const existing = unique.get(id);
        if (!existing || (c.score || 0) > (existing.score || 0)) unique.set(id, c);
    });
    return Array.from(unique.values()).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit).map(c => {
        const idx = searchIdMap.get(c.id);
        const brand = (typeof idx === 'number' && State.uniqueBrandsList[idx]) ? State.uniqueBrandsList[idx] : (c.brand || null);
        return { brand, displayName: c.displayName || (brand && (brand.fullName || brand.key)) || "", reason: c.reason };
    });
}

// simple Levenshtein distance implementation
function levenshtein(a, b) {
    const sa = String(a || "");
    const sb = String(b || "");
    const lena = sa.length;
    const lenb = sb.length;
    if (lena === 0) return lenb;
    if (lenb === 0) return lena;
    const v0 = new Array(lenb + 1);
    const v1 = new Array(lenb + 1);
    for (let j = 0; j <= lenb; j++) v0[j] = j;
    for (let i = 0; i < lena; i++) {
        v1[0] = i + 1;
        const ai = sa.charAt(i);
        for (let j = 0; j < lenb; j++) {
            const cost = ai === sb.charAt(j) ? 0 : 1;
            v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
        }
        for (let j = 0; j <= lenb; j++) v0[j] = v1[j];
    }
    return v1[lenb];
}

function getFilteredSuggestions(query) {
    if (!query) return [];
    if ((!Array.isArray(searchIndex) || searchIndex.length === 0) && Array.isArray(State.uniqueBrandsList) && State.uniqueBrandsList.length > 0) {
        try { buildSearchIndex(); } catch (e) { /* best-effort */ }
    }
    const qNorm = normalizeKey(query);
    if (!qNorm) return []; // if normalization produces empty string, no results
    
    // Also try reverse transliterate: if user typed with wrong keyboard layout
    // E.g., typed "Уфыр" when they meant "Bosch"
    let qNormReverse = "";
    try {
        const reversed = reverseTransliterate(query);
        if (reversed && reversed !== query) {
            qNormReverse = normalizeKey(reversed);
        }
    } catch (e) {
        // ignore reverse transliteration errors
    }
    
    // Also try ЙЦУКЕН position conversion: if user typed on QWERTY but keyboard sent Cyrillic
    // E.g., typed positions for "Bosch" but got "ищіср" (И-Щ-І-С-Р)
    let qNormYcuken = "";
    try {
        const ycukenConverted = convertYcukenToQwerty(query);
        if (ycukenConverted && ycukenConverted !== query) {
            qNormYcuken = normalizeKey(ycukenConverted);
        }
    } catch (e) {
        // ignore conversion errors
    }
    
    const results = [];
    const seen = new Set(); // to avoid duplicates from both qNorm and qNormReverse
    const filter = getActiveSearchFilter();
    const normalizedQueries = Array.from(new Set([qNorm, qNormReverse, qNormYcuken].filter(Boolean)));
    const runFuzzyGlobal = normalizedQueries.some(v => v.length >= 3);
    let fuzzyEvaluationsGlobal = 0;

    // Helper to add result if not seen and matches filter
    function addResult(entry, reason, score, displayName) {
        if (seen.has(entry.id)) return;
        if (!matchesReasonForFilter(reason, filter)) return;
        seen.add(entry.id);
        const b = State.uniqueBrandsList[entry.brandIndex];
        if (!b) return;
        const boostedScore = filter === "all"
            ? score
            : (matchesReasonForFilter(reason, filter) ? score + 15 : score - 10);
        results.push({ id: entry.id, brand: b, displayName: displayName || entry.displayName, reason, score: boostedScore });
    }

    // Search with all query normalizations
    for (const normQuery of normalizedQueries) {

        // 1) exact matches
        const exact = exactLookupMap.get(normQuery) || [];
        exact.forEach(e => {
            if (!matchesReasonForFilter(e.reason, filter)) return;
            const idx = searchIdMap.get(e.id);
            const b = (typeof idx === 'number' && State.uniqueBrandsList[idx]) ? State.uniqueBrandsList[idx] : null;
            if (b && !seen.has(e.id)) {
                seen.add(e.id);
                results.push({ id: e.id, brand: b, displayName: b.fullName || b.key, reason: e.reason, score: 100 });
            }
        });

        // 2) prefix / startsWith matches (iterate compact searchIndex)
        for (const entry of searchIndex) {
            const b = State.uniqueBrandsList[entry.brandIndex];
            if (!b || seen.has(entry.id)) continue;
            
            // skip if already exact
            if (entry._normFullName === normQuery || entry._normEnterpriseName === normQuery || entry._normPrefix === normQuery || entry._normKey === normQuery) continue;

            if (filter === "enterpriseName") {
                if (entry._normEnterpriseName && entry._normEnterpriseName.startsWith(normQuery)) addResult(entry, SEARCH_REASONS.ENTERPRISE, 90);
                else if (entry._normEnterpriseName && entry._normEnterpriseName.includes(normQuery)) addResult(entry, `${SEARCH_REASONS.ENTERPRISE} (включення)`, 70);
                continue;
            }

            if (filter === "prefix") {
                if (entry._normPrefix && entry._normPrefix.startsWith(normQuery)) addResult(entry, SEARCH_REASONS.PREFIX, 92);
                else if (entry._normPrefix && entry._normPrefix.includes(normQuery)) addResult(entry, `${SEARCH_REASONS.PREFIX} (включення)`, 68);
                continue;
            }

            if (filter === "synonyms") {
                if (entry._normSynonyms && Array.isArray(entry._normSynonyms) && entry._normSynonyms.some(s => s.startsWith(normQuery))) {
                    addResult(entry, SEARCH_REASONS.SYNONYM, 88);
                } else if (entry._normSynonyms && Array.isArray(entry._normSynonyms) && entry._normSynonyms.some(s => s.includes(normQuery))) {
                    addResult(entry, `${SEARCH_REASONS.SYNONYM} (включення)`, 66);
                }
                continue;
            }

            if (entry._normKey && entry._normKey.startsWith(normQuery)) addResult(entry, SEARCH_REASONS.KEY, 95);
            else if (entry._normFullName && entry._normFullName.startsWith(normQuery)) addResult(entry, SEARCH_REASONS.FULL_NAME, 85);
            else if (entry._normEnterpriseName && entry._normEnterpriseName.startsWith(normQuery)) addResult(entry, SEARCH_REASONS.ENTERPRISE, 80);
            else if (entry._normPrefix && entry._normPrefix.startsWith(normQuery)) addResult(entry, SEARCH_REASONS.PREFIX, 75);
            else if (entry._normSynonyms && Array.isArray(entry._normSynonyms) && entry._normSynonyms.some(s => s.startsWith(normQuery))) addResult(entry, SEARCH_REASONS.SYNONYM, 72);
            else if (entry._normFullName && entry._normFullName.includes(normQuery)) addResult(entry, `${SEARCH_REASONS.FULL_NAME} (включення)`, 55);
            else if (entry._normEnterpriseName && entry._normEnterpriseName.includes(normQuery)) addResult(entry, `${SEARCH_REASONS.ENTERPRISE} (включення)`, 50);
            else if (entry._normKey && entry._normKey.includes(normQuery)) addResult(entry, "Частковий збіг (key)", 48);
            else if (runFuzzyGlobal && fuzzyEvaluationsGlobal < 120 && filter !== "prefix" && filter !== "synonyms") {
                // fuzzy fallback using Levenshtein distance
                const candidate = entry._normFullName || "";
                const maxLen = Math.max(normQuery.length, candidate.length, 1);
                if (Math.abs(normQuery.length - candidate.length) > 8) continue;
                fuzzyEvaluationsGlobal += 1;
                const dist = levenshtein(normQuery, candidate);
                const similarity = (maxLen - dist) / maxLen; // 0..1
                const fscore = Math.round(similarity * 60); // scale to 0..60
                if (fscore >= 34) addResult(entry, SEARCH_REASONS.FUZZY, fscore);
            }
        }
    }

    const sliced = rankAndSliceCandidates(results, 6);
    if (sliced.length === 0) {
        return [{ brand: null, displayName: "Бренд не знайдено. Спробуйте іншу назву або префікс.", reason: "none" }];
    }
    return sliced;
}

function findBrandWithReason(searchKey) {
    const q = normalizeKey(searchKey);
    
    // Also try reverse transliterate for wrong keyboard layout
    let qReverse = "";
    try {
        const reversed = reverseTransliterate(searchKey);
        if (reversed && reversed !== searchKey) {
            qReverse = normalizeKey(reversed);
        }
    } catch (e) {
        // ignore reverse transliteration errors
    }

    // Also try ЙЦУКЕН position conversion
    let qYcuken = "";
    try {
        const ycukenConverted = convertYcukenToQwerty(searchKey);
        if (ycukenConverted && ycukenConverted !== searchKey) {
            qYcuken = normalizeKey(ycukenConverted);
        }
    } catch (e) {
        // ignore conversion errors
    }

    // Helper to check if reason matches current search filter
    function matchesSearchFilter(reason) {
        return matchesReasonForFilter(reason, getActiveSearchFilter());
    }

    // Try exact match with all normalizations
    for (const normKey of [q, qReverse, qYcuken]) {
        if (!normKey) continue;

        const exact = exactLookupMap.get(normKey);
        if (exact && exact.length > 0) {
            // Find first match that passes filter
            for (const entry of exact) {
                if (matchesSearchFilter(entry.reason)) {
                    const idx = searchIdMap.get(entry.id);
                    const b = (typeof idx === 'number' && State.uniqueBrandsList[idx]) ? State.uniqueBrandsList[idx] : null;
                    if (b) return { brand: b, reason: entry.reason };
                }
            }
        }

        // fallback: scan for prefix/fullname/key/synonyms (with filter)
        for (const b of State.uniqueBrandsList) {
            if (b._normFullName === normKey && matchesSearchFilter(SEARCH_REASONS.FULL_NAME)) {
                return { brand: b, reason: SEARCH_REASONS.FULL_NAME };
            }
            if (b._normPrefix === normKey && matchesSearchFilter(SEARCH_REASONS.PREFIX)) {
                return { brand: b, reason: SEARCH_REASONS.PREFIX };
            }
            if (b._normKey === normKey && matchesSearchFilter(SEARCH_REASONS.KEY)) {
                return { brand: b, reason: SEARCH_REASONS.KEY };
            }
            if (b._normSynonyms && b._normSynonyms.includes(normKey) && matchesSearchFilter(SEARCH_REASONS.SYNONYM)) {
                return { brand: b, reason: SEARCH_REASONS.SYNONYM };
            }
        }
    }
    
    return null;
}
