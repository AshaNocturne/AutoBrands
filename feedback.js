// ============================================================
// feedback.js — форма запиту, відправка, підвантаження запитів
// ============================================================

async function fetchUserRequests() {
    chrome.storage.local.get(["savedManagerText", "cachedRequests"], async res => {
        const manager = res.savedManagerText;
        if (!manager) {
            if (Dom.requestCount) Dom.requestCount.innerText = "0";
            if (Dom.requestChangesLog) {
                while (Dom.requestChangesLog.firstChild) Dom.requestChangesLog.removeChild(Dom.requestChangesLog.firstChild);
            }
            return;
        }
        if (res.cachedRequests) renderRequestsLog(res.cachedRequests);

        try {
            const response = await fetch(`${WEB_APP_URL}?manager=${encodeURIComponent(manager)}`);
            const requests = await response.json();
            const filtered = filterOldDoneRequests(requests);
            chrome.storage.local.set({ cachedRequests: filtered });
            renderRequestsLog(filtered);
        } catch (e) {
            console.error("Помилка завантаження запитів", e);
        }
    });
}

function initFeedbackForm() {
    if (Dom.toggleFeedbackBtn) {
        Dom.toggleFeedbackBtn.addEventListener("click", () => {
            if (Dom.feedbackFormBlock.style.display === "none" || !Dom.feedbackFormBlock.style.display) {
                Dom.feedbackFormBlock.style.display = "flex";
                syncFeedbackBrandField();
            } else {
                Dom.feedbackFormBlock.style.display = "none";
            }
        });
    }

    if (Dom.feedbackBrandInput && Dom.feedbackBrandSuggestions) {
        // debounce helper (use dynamic DEBOUNCE_MS if available)
            let DEBOUNCE_MS_LOCAL = (window.DEBOUNCE_MS || 150);
            window._feedbackSearchRequestToken = 0;
            let _feedbackSearchTimer = null;

            function createHighlightedFragmentLocal(text, query) {
                const frag = document.createDocumentFragment();
                if (!query) { frag.appendChild(document.createTextNode(text)); return frag; }
                try {
                    const q = String(query).trim();
                    if (!q) { frag.appendChild(document.createTextNode(text)); return frag; }
                    const re = new RegExp(q.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'ig');
                    let lastIndex = 0;
                    let match;
                    while ((match = re.exec(text)) !== null) {
                        if (match.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
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

            function processFeedbackBrandInput(val, token) {
                if (!val) { Dom.feedbackBrandSuggestions.style.display = "none"; return; }
                // stale guard
                if (typeof token !== 'undefined' && token !== window._feedbackSearchRequestToken) return;
                const sug = getFilteredSuggestions(val);
                if (sug.length > 0) {
                    // clear suggestions safely
                    while (Dom.feedbackBrandSuggestions && Dom.feedbackBrandSuggestions.firstChild) {
                        Dom.feedbackBrandSuggestions.removeChild(Dom.feedbackBrandSuggestions.firstChild);
                    }
                    let idx = 0;
                    sug.forEach(item => {
                        if (!item || !item.brand) return;
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.setAttribute('role', 'option');
                        div.id = `feedback-sugg-${token || 't'}-${idx}`;
                        const label = document.createElement('span');
                        label.style.fontWeight = 600;
                        const frag = createHighlightedFragmentLocal(item.displayName || item.brand.fullName || '', Dom.feedbackBrandInput.value.trim());
                        label.appendChild(frag);
                        const badge = document.createElement('span');
                        badge.className = 'search-reason-badge';
                        badge.textContent = item.reason || '';
                        div.appendChild(label);
                        div.appendChild(badge);
                        div.setAttribute('data-index', String(idx));
                        div.addEventListener('click', () => {
                            Dom.feedbackBrandInput.value = item.brand.fullName;
                            Dom.feedbackBrandSuggestions.style.display = 'none';
                        });
                        Dom.feedbackBrandSuggestions.appendChild(div);
                        idx += 1;
                    });
                    Dom.feedbackBrandSuggestions.querySelectorAll('.suggestion-item').forEach(el => el.classList.remove('active'));
                    Dom.feedbackBrandSuggestions.dataset.activeIndex = "-1";
                    Dom.feedbackBrandSuggestions.setAttribute('role', 'listbox');
                    Dom.feedbackBrandSuggestions.setAttribute('aria-label', 'Підказки брендів');
                    Dom.feedbackBrandSuggestions.style.display = "block";
                    // update aria-activedescendant if helper exists
                    try { if (typeof updateAriaActive === 'function') updateAriaActive(Dom.feedbackBrandSuggestions, Dom.feedbackBrandInput); } catch (e) {}
                } else {
                    Dom.feedbackBrandSuggestions.style.display = "none";
                }
            }
            Dom.feedbackBrandInput.addEventListener("input", () => {
                const val = Dom.feedbackBrandInput.value.trim();
                if (!val) { Dom.feedbackBrandSuggestions.style.display = "none"; return; }
                window._feedbackSearchRequestToken += 1;
                const myToken = window._feedbackSearchRequestToken;
                if (_feedbackSearchTimer) clearTimeout(_feedbackSearchTimer);
                _feedbackSearchTimer = setTimeout(() => processFeedbackBrandInput(val, myToken), (window.DEBOUNCE_MS || DEBOUNCE_MS_LOCAL));
            });

        Dom.feedbackBrandInput.addEventListener("keydown", e => {
            const list = Dom.feedbackBrandSuggestions;
            if (!list || list.style.display === 'none') return;
            const items = Array.from(list.querySelectorAll('.suggestion-item'));
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                let active = parseInt(list.dataset.activeIndex || '-1', 10);
                if (e.key === 'ArrowDown') active = Math.min(items.length - 1, active + 1);
                else active = Math.max(-1, active - 1);
                items.forEach((it, i) => it.classList.toggle('active', i === active));
                list.dataset.activeIndex = String(active);
                if (active >= 0 && items[active]) items[active].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                const active = parseInt(list.dataset.activeIndex || '-1', 10);
                if (active >= 0 && items[active]) {
                    e.preventDefault();
                    items[active].click();
                } else {
                    const val = Dom.feedbackBrandInput.value.trim();
                    if (!val) return;
                    const matches = getFilteredSuggestions(val);
                    if (matches.length > 0) {
                        Dom.feedbackBrandInput.value = matches[0].brand.fullName;
                        Dom.feedbackBrandSuggestions.style.display = "none";
                    }
                }
            } else if (e.key === 'Escape') {
                list.style.display = 'none';
            }
        });
    }

    if (Dom.feedbackManager) {
        Dom.feedbackManager.addEventListener("input", () => {
            chrome.storage.local.set({ savedManagerText: Dom.feedbackManager.value });
            fetchUserRequests();
        });
    }

    if (Dom.submitFeedbackBtn) {
        Dom.submitFeedbackBtn.addEventListener("click", async () => {
            const brand    = Dom.feedbackBrandInput.value.trim() || "Загальне питання / Інше";
            const category = Dom.feedbackCategory.value;
            const msg      = Dom.feedbackMessage.value.trim();
            const manager  = Dom.feedbackManager.value.trim();

            if (!msg)     return alert("Будь ласка, введіть опис проблеми.");
            if (!manager) return alert("Будь ласка, вкажіть Контент-менеджера.");

            Dom.submitFeedbackBtn.disabled  = true;
            Dom.submitFeedbackBtn.innerText = "Надсилання...";

            const now     = new Date();
            const dateStr = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
            const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

            try {
                const response = await fetch(WEB_APP_URL, {
                    method:  "POST",
                    mode:    "cors",
                    headers: { "Content-Type": "text/plain" },
                    body:    JSON.stringify({ date: dateStr, time: timeStr, brandName: brand, category, message: msg, manager }),
                });
                const r = await response.json();
                if (r && r.success === true) {
                    alert("Запит успішно надіслано!");
                    Dom.feedbackMessage.value         = "";
                    Dom.feedbackBrandInput.value      = "";
                    Dom.feedbackBrandInput.disabled   = false;
                    Dom.feedbackCategory.selectedIndex = 0;
                    Dom.feedbackFormBlock.style.display = "none";
                    fetchUserRequests();
                } else {
                    alert("Помилка: " + (r && r.message ? r.message : "Невідома помилка"));
                }
            } catch {
                alert("Помилка мережі при відправці.");
            } finally {
                Dom.submitFeedbackBtn.disabled  = false;
                Dom.submitFeedbackBtn.innerText = "Надіслати";
            }
        });
    }
}