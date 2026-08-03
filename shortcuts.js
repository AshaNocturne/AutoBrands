let isShortcutsEnabled = false;
let pageInterval = null;

// 1. Отримуємо стан функції при завантаженні сторінки
chrome.storage.local.get(['shortcutsEnabled'], function(result) {
    isShortcutsEnabled = result.shortcutsEnabled || false;
    if (isShortcutsEnabled) {
        initShortcuts();
    }
});

// 2. Стежимо за увімкненням/вимкненням функції "на льоту" через попап
chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === 'local' && changes.shortcutsEnabled) {
        isShortcutsEnabled = changes.shortcutsEnabled.newValue;
        if (isShortcutsEnabled) {
            initShortcuts();
        } else {
            removeShortcuts();
        }
    }
});

// 3. Ініціалізація та розподіл логіки по 3-х типах сторінок
function initShortcuts() {
    const url = window.location.href;

    // СТОРІНКА 1: Таблиця категорій (Autopart)
    if (url.includes('autopart.rozetka.company/admin/goods/categories/')) {
        applyCategoryShortcuts();
    }
    // СТОРІНКА 2: Редагування товару (Autopart)
    else if (url.includes('autopart.rozetka.company/admin/goods/edit/')) {
        applyEditPageShortcuts();
        startInterval(applyEditPageShortcuts);
    }
    // СТОРІНКА 3: Оновлення товару (Gomer)
    else if (url.includes('gomer.rozetka.company/goods/item/update')) {
        applyGomerPageShortcuts();
        startInterval(applyGomerPageShortcuts);
    }
}

// Універсальний таймер «розумного очікування» для динамічних елементів
function startInterval(callback) {
    if (!pageInterval) {
        let attempts = 0;
        pageInterval = setInterval(() => {
            attempts++;
            callback();
            if (attempts > 10) {
                clearInterval(pageInterval);
                pageInterval = null;
            }
        }, 500);
    }
}

// --- ЛОГІКА ДЛЯ СТОРІНКИ КАТЕГОРІЙ ---
function applyCategoryShortcuts() {
    const rows = document.querySelectorAll('table tr');

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 8) return;

        if (row.hasAttribute('data-shortcuts-applied')) return;
        row.setAttribute('data-shortcuts-applied', 'true');

        // Колонка 1: Goods ID -> Gomer
        const goodsTd = cells[0];
        const goodsId = goodsTd.textContent.replace(/\D/g, '');
        if (goodsId) {
            const gomerUrl = `https://gomer.rozetka.company/goods/item/update?id=${goodsId}`;
            const containerGomer = document.createElement('div');
            containerGomer.className = 'custom-shortcut-wrapper';
            containerGomer.style.marginTop = '5px';
            containerGomer.appendChild(createLinkButton(gomerUrl, 'Gomer ↗', '#28a745'));
            goodsTd.appendChild(containerGomer);
        }

        // Колонка 8: Product ID -> Edit Product
        const productTd = cells[7];
        const productId = productTd.textContent.replace(/\D/g, '');
        if (productId) {
            const productUrl = `https://autopart.rozetka.company/admin/product/edit/${productId}`;
            const containerProduct = document.createElement('div');
            containerProduct.className = 'custom-shortcut-wrapper';
            containerProduct.style.marginTop = '5px';
            containerProduct.appendChild(createLinkButton(productUrl, 'Product ↗', '#17a2b8'));
            productTd.appendChild(containerProduct);
        }
    });
}

// --- ЛОГІКА ДЛЯ СТОРІНКИ РЕДАГУВАННЯ ТОВАРУ (Autopart) ---
function applyEditPageShortcuts() {
    if (!isShortcutsEnabled) return;

    // 1. Шорткат для Goods_id
    const goodsInput = document.getElementById('goods_id');
    if (goodsInput && !goodsInput.hasAttribute('data-shortcut-added')) {
        const goodsId = goodsInput.value.trim();
        if (goodsId) {
            goodsInput.setAttribute('data-shortcut-added', 'true');
            const gomerUrl = `https://gomer.rozetka.company/goods/item/update?id=${goodsId}`;

            const container = document.createElement('div');
            container.className = 'custom-shortcut-wrapper';
            container.style.marginTop = '5px';
            container.style.marginBottom = '12px';
            container.appendChild(createLinkButton(gomerUrl, 'Відкрити в Gomer ↗', '#28a745'));
            goodsInput.after(container);
        }
    }

    // 2. Шорткат для Еталонного товару (Product ID)
    const productContainer = document.getElementById('select2-product_id-container');
    if (productContainer && !productContainer.hasAttribute('data-shortcut-added')) {
        const text = productContainer.getAttribute('title') || productContainer.textContent;

        if (text) {
            const matches = text.match(/\((\d+)\)[^()]*$/);

            if (matches && matches[1]) {
                productContainer.setAttribute('data-shortcut-added', 'true');
                const productId = matches[1];
                const productUrl = `https://autopart.rozetka.company/admin/product/edit/${productId}`;

                const container = document.createElement('div');
                container.className = 'custom-shortcut-wrapper';

                // Стилі для гарантованого переносу на новий рядок
                container.style.display = 'block';
                container.style.width = '100%';
                container.style.clear = 'both';
                container.style.marginTop = '6px';
                container.style.marginBottom = '12px';

                container.appendChild(createLinkButton(productUrl, 'Редагувати еталонний товар ↗', '#17a2b8'));

                container.addEventListener('click', function(e) {
                    e.stopPropagation();
                });

                const mainSelect2 = productContainer.closest('.select2-container');
                if (mainSelect2) {
                    // Дозволяємо батьківському контейнеру переносити блоки
                    if (mainSelect2.parentNode) {
                        mainSelect2.parentNode.style.flexWrap = 'wrap';
                    }
                    mainSelect2.after(container);
                } else {
                    productContainer.after(container);
                }
            }
        }
    }
}

// --- ЛОГІКА ДЛЯ СТОРІНКИ ОНОВЛЕННЯ ТОВАРУ (Gomer) ---
function applyGomerPageShortcuts() {
    if (!isShortcutsEnabled) return;

    const gomerInput = document.getElementById('goodscommonformmodel-options-254541-value');
    if (gomerInput && !gomerInput.hasAttribute('data-shortcut-added')) {
        const productId = gomerInput.value.trim();

        if (productId) {
            gomerInput.setAttribute('data-shortcut-added', 'true');
            const autopartUrl = `https://autopart.rozetka.company/admin/product/edit/${productId}`;

            const container = document.createElement('div');
            container.className = 'custom-shortcut-wrapper';
            container.style.display = 'block';
            container.style.marginTop = '5px';
            container.style.marginBottom = '12px';
            container.appendChild(createLinkButton(autopartUrl, 'Редагувати еталонний товар (Autopart) ↗', '#17a2b8'));

            gomerInput.after(container);
        }
    }
}

// Допоміжна функція створення кнопок
function createLinkButton(url, text, bgColor) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = text;
    a.style.display = 'inline-block';
    a.style.padding = '4px 10px';
    a.style.fontSize = '11px';
    a.style.fontWeight = 'bold';
    a.style.color = '#ffffff';
    a.style.backgroundColor = bgColor;
    a.style.borderRadius = '4px';
    a.style.textDecoration = 'none';
    a.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    a.style.transition = 'opacity 0.2s ease';

    a.addEventListener('mouseenter', () => a.style.opacity = '0.85');
    a.addEventListener('mouseleave', () => a.style.opacity = '1');
    return a;
}

// Функція повного очищення сторінки від шорткатів
function removeShortcuts() {
    if (pageInterval) {
        clearInterval(pageInterval);
        pageInterval = null;
    }
    document.querySelectorAll('.custom-shortcut-wrapper').forEach(wrapper => wrapper.remove());
    document.querySelectorAll('[data-shortcuts-applied]').forEach(row => row.removeAttribute('data-shortcuts-applied'));
    document.querySelectorAll('[data-shortcut-added]').forEach(el => el.removeAttribute('data-shortcut-added'));
}
