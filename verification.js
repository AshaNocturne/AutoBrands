let isVerificationEnabled = false;
let verificationInterval = null;

// 1. Отримуємо стан функції при завантаженні сторінки
chrome.storage.local.get(['verificationEnabled'], function(result) {
    isVerificationEnabled = result.verificationEnabled || false;
    if (isVerificationEnabled) {
        runVerification();
    }
});

// 2. Стежимо за змінами в попапі "на льоту"
chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === 'local' && changes.verificationEnabled) {
        isVerificationEnabled = changes.verificationEnabled.newValue;
        if (isVerificationEnabled) {
            runVerification();
        } else {
            clearVerification();
        }
    }
});

// 3. Ініціалізація перевірки залежно від типу сторінки
function runVerification() {
    const url = window.location.href;

    // Тип 1: Редагування товару
    if (url.includes('/admin/goods/edit/')) {
        checkGoodsData();
        startVerificationInterval(checkGoodsData);
    }
    // Тип 2: Редагування еталонного товару
    else if (url.includes('/admin/product/edit/')) {
        checkProductData();
        startVerificationInterval(checkProductData);
    }
}

// Загальний таймер «розумного очікування» для завантаження полів
function startVerificationInterval(callback) {
    if (!verificationInterval) {
        let attempts = 0;
        verificationInterval = setInterval(() => {
            attempts++;
            callback();
            if (attempts > 12) {
                clearInterval(verificationInterval);
                verificationInterval = null;
            }
        }, 500);
    }
}

// 4. Логіка для сторінки редагування товару (/admin/goods/edit/)
function checkGoodsData() {
    if (!isVerificationEnabled) return;

    // --- 1. ОТРИМУЄМО АРТИКУЛ ТОВАРУ ---
    const articleInput = document.getElementById('article');
    if (!articleInput) return;
    const rawArticle = articleInput.value ? articleInput.value.trim() : '';

    // --- 2. ОТРИМУЄМО БРЕНД ТОВАРУ ---
    const vendorContainer = document.getElementById('select2-vendor_id-container');
    if (!vendorContainer) return;

    let rawBrand = vendorContainer.getAttribute('title') || '';
    if (!rawBrand) {
        const clone = vendorContainer.cloneNode(true);
        const clearBtn = clone.querySelector('.select2-selection__clear');
        if (clearBtn) clearBtn.remove();
        rawBrand = clone.textContent.trim();
    }
    rawBrand = rawBrand.trim();

    // --- 3. ОТРИМУЄМО ІНФОРМАЦІЮ ПРО ЕТАЛОННИЙ ТОВАР ---
    const productContainer = document.getElementById('select2-product_id-container');
    if (!productContainer) return;

    const rawRefText = productContainer.getAttribute('title') || productContainer.textContent.trim();
    if (!rawRefText) return;

    const select2Element = productContainer.closest('.select2-container');
    const selectionElement = productContainer.closest('.select2-selection');
    if (!selectionElement || !select2Element || !select2Element.parentNode) return;

    // --- PARSING ЕТАЛОНКИ ---
    const refIdMatch = rawRefText.match(/\((\d+)\)[^()]*$/);
    if (!refIdMatch) return;

    const textWithoutId = rawRefText.substring(0, refIdMatch.index).trim();
    const firstSpaceIndex = textWithoutId.indexOf(' ');
    if (firstSpaceIndex === -1) return;

    const rawRefCode = textWithoutId.substring(0, firstSpaceIndex).trim();
    const rawRefBrand = textWithoutId.substring(firstSpaceIndex + 1).trim();

    // --- ОБРОБКА ТА НОРМАЛІЗАЦІЯ ДАНИХ ---
    let processedArticle = rawArticle;
    const isBosch = rawBrand.toLowerCase() === 'bosch';
    if (!isBosch && processedArticle.includes(' ')) {
        const spaceIdx = processedArticle.indexOf(' ');
        processedArticle = processedArticle.substring(spaceIdx + 1).trim();
    }

    const cleanArticle = cleanCode(processedArticle);
    const cleanRefCode = cleanCode(rawRefCode);

    const isCodeMatch = (cleanArticle === cleanRefCode);
    const brandStatus = compareBrands(rawBrand, rawRefBrand); // 'EXACT', 'PARTIAL', 'NONE'

    // --- ФОРМУВАННЯ СТАНУ ТА ПОВІДОМЛЕННЯ ---
    let statusType = 'SUCCESS'; // 'SUCCESS', 'WARNING', 'ERROR'
    let message = '';

    if (isCodeMatch) {
        if (brandStatus === 'EXACT') {
            statusType = 'SUCCESS';
        } else if (brandStatus === 'PARTIAL') {
            statusType = 'WARNING';
            message = 'Бренд еталонки/товару збігаються частково';
        } else {
            statusType = 'ERROR';
            message = 'Бренд еталонки/товару не збігається';
        }
    } else {
        statusType = 'ERROR';
        if (brandStatus === 'EXACT') {
            message = 'Артикули еталонки/товару не збігаються';
        } else if (brandStatus === 'PARTIAL') {
            message = 'Артикули еталонки/товару не збігаються (бренд частково не збігається)';
        } else {
            message = 'Артикул та бренд еталонки/товару не збігаються';
        }
    }

    // --- СТИЛІЗАЦІЯ ---
    if (statusType === 'WARNING') {
        // Світло-жовтий колір
        selectionElement.style.backgroundColor = '#fff3cd';
        selectionElement.style.borderColor = '#ffebaa';
        selectionElement.style.color = '#856404';

        const msgBadge = getOrCreateGoodsBadge(select2Element);
        if (msgBadge) {
            msgBadge.style.color = '#856404';
            msgBadge.textContent = `⚠️ ${message}`;
        }
        selectionElement.setAttribute('title', message);
    } else if (statusType === 'ERROR') {
        // Світло-червоний колір
        selectionElement.style.backgroundColor = '#f8d7da';
        selectionElement.style.borderColor = '#f5c6cb';
        selectionElement.style.color = '#721c24';

        const msgBadge = getOrCreateGoodsBadge(select2Element);
        if (msgBadge) {
            msgBadge.style.color = '#dc3545';
            msgBadge.textContent = `⚠️ ${message}`;
        }
        selectionElement.setAttribute('title', message);
    } else {
        // Світло-зелений колір
        selectionElement.style.backgroundColor = '#d4edda';
        selectionElement.style.borderColor = '#c3e6cb';
        selectionElement.style.color = '#155724';

        const msgBadge = select2Element.parentNode.querySelector('.verification-msg-badge');
        if (msgBadge) {
            msgBadge.remove();
        }
        selectionElement.setAttribute('title', 'Дані еталонки та товару збігаються');
    }
}

// Допоміжна функція створення бейджа під Select2
function getOrCreateGoodsBadge(select2Element) {
    if (!select2Element || !select2Element.parentNode) return null;

    let msgBadge = select2Element.parentNode.querySelector('.verification-msg-badge');
    if (!msgBadge) {
        msgBadge = document.createElement('div');
        msgBadge.className = 'verification-msg-badge';
        msgBadge.style.display = 'block';
        msgBadge.style.width = '100%';
        msgBadge.style.clear = 'both';
        msgBadge.style.marginTop = '6px';
        msgBadge.style.marginBottom = '6px';
        msgBadge.style.fontSize = '11px';
        msgBadge.style.fontWeight = 'bold';

        if (select2Element.parentNode) {
            select2Element.parentNode.style.flexWrap = 'wrap';
        }

        select2Element.after(msgBadge);
    }
    return msgBadge;
}

// Порівняння брендів (Повний збіг, Частковий збіг, Невідповідність)
function compareBrands(brand1, brand2) {
    const b1 = brand1.trim().toLowerCase();
    const b2 = brand2.trim().toLowerCase();

    if (b1 === b2) return 'EXACT';

    // Частковий збіг: якщо одна назва входить в іншу (довжина назви не менше 2 символів)
    if ((b1.length >= 2 && b2.includes(b1)) || (b2.length >= 2 && b1.includes(b2))) {
        return 'PARTIAL';
    }

    return 'NONE';
}

// 5. Логіка для сторінки редагування еталона (/admin/product/edit/)
function checkProductData() {
    if (!isVerificationEnabled) return;

    const codeInput = document.getElementById('code');
    const artnoInput = document.getElementById('artno');
    if (!codeInput || !artnoInput) return;

    const rawCode = codeInput.value ? codeInput.value.trim() : '';
    const rawArtno = artnoInput.value ? artnoInput.value.trim() : '';

    if (!rawCode || !rawArtno) {
        resetProductFields(codeInput, artnoInput);
        return;
    }

    const cCode = cleanCode(rawCode);
    const cArtno = cleanCode(rawArtno);

    const isMatch = (cCode === cArtno);
    let msgBadge = codeInput.parentNode.querySelector('.product-verification-msg-badge');

    if (isMatch) {
        applyFieldStyle(codeInput, '#d4edda', '#c3e6cb', '#155724');
        applyFieldStyle(artnoInput, '#d4edda', '#c3e6cb', '#155724');
        if (msgBadge) msgBadge.remove();
    } else {
        applyFieldStyle(codeInput, '#f8d7da', '#f5c6cb', '#721c24');
        applyFieldStyle(artnoInput, '#f8d7da', '#f5c6cb', '#721c24');

        if (!msgBadge) {
            msgBadge = document.createElement('div');
            msgBadge.className = 'product-verification-msg-badge';
            msgBadge.style.display = 'block';
            msgBadge.style.width = '100%';
            msgBadge.style.clear = 'both';
            msgBadge.style.marginTop = '6px';
            msgBadge.style.marginBottom = '4px';
            msgBadge.style.fontSize = '11px';
            msgBadge.style.fontWeight = 'bold';
            msgBadge.style.color = '#dc3545';

            if (codeInput.parentNode) {
                codeInput.parentNode.style.flexWrap = 'wrap';
            }
            codeInput.after(msgBadge);
        }
        msgBadge.textContent = '⚠️ Код товару та Код пошуку не співпадають!';
    }
}

// Загальні допоміжні функції
function cleanCode(str) {
    return str
        .replace(/[\u0400-\u04FF]/g, '')
        .replace(/[\s\W_]/g, '')
        .toUpperCase();
}

function applyFieldStyle(el, bg, border, color) {
    el.style.backgroundColor = bg;
    el.style.borderColor = border;
    el.style.color = color;
}

function resetProductFields(codeInput, artnoInput) {
    [codeInput, artnoInput].forEach(el => {
        if (el) {
            el.style.backgroundColor = '';
            el.style.borderColor = '';
            el.style.color = '';
        }
    });
    let msgBadge = codeInput ? codeInput.parentNode.querySelector('.product-verification-msg-badge') : null;
    if (msgBadge) msgBadge.remove();
}

// 6. Очищення стилів при вимкненні чекбокса в попапі
function clearVerification() {
    if (verificationInterval) {
        clearInterval(verificationInterval);
        verificationInterval = null;
    }

    const productContainer = document.getElementById('select2-product_id-container');
    if (productContainer) {
        const selectionElement = productContainer.closest('.select2-selection');
        if (selectionElement) {
            selectionElement.style.backgroundColor = '';
            selectionElement.style.borderColor = '';
            selectionElement.style.color = '';
            selectionElement.removeAttribute('title');
        }
        const select2Element = productContainer.closest('.select2-container');
        if (select2Element && select2Element.parentNode) {
            const msgBadge = select2Element.parentNode.querySelector('.verification-msg-badge');
            if (msgBadge) msgBadge.remove();
        }
    }

    const codeInput = document.getElementById('code');
    const artnoInput = document.getElementById('artno');
    resetProductFields(codeInput, artnoInput);
}
