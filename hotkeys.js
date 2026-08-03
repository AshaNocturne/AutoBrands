let isHotkeysEnabled = false;

// 1. Отримуємо стан функції при завантаженні сторінки
chrome.storage.local.get(['hotkeysEnabled'], function(result) {
    isHotkeysEnabled = result.hotkeysEnabled || false;
});

// 2. Оновлюємо стан "на льоту" при змінах у попапі
chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === 'local' && changes.hotkeysEnabled) {
        isHotkeysEnabled = changes.hotkeysEnabled.newValue;
    }
});

// 3. Обробка натискання клавіш через e.code (незалежно від розкладки)
document.addEventListener('keydown', function(e) {
    if (!isHotkeysEnabled) return;

    // Перевіряємо, чи користувач зараз не пише текст в полях введення
    const activeEl = document.activeElement;
    const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable
    );

    // --- КОМБІНАЦІЯ: Ctrl + S / Cmd + S (Зберегти) ---
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        let saveButton = Array.from(document.querySelectorAll('button[type="submit"].btn.btn-primary'))
            .find(btn => btn.textContent.trim() === 'Зберегти');
        
        if (!saveButton) {
            saveButton = Array.from(document.querySelectorAll('button[type="submit"][form="product-form"].btn.btn-primary'))
                .find(btn => btn.textContent.trim() === 'Зберегти');
        }

        if (saveButton) {
            e.preventDefault(); // Скасовуємо стандартне збереження сторінки браузером тільки якщо є цільова кнопка
            saveButton.click();
        }
        return;
    }

    // --- КОМБІНАЦІЯ: Ctrl + G / Cmd + G (Оновити в Гомер) ---
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyG') {
        const gomerButton = Array.from(document.querySelectorAll('a.btn.btn-primary'))
            .find(link => link.textContent.trim() === 'Оновити в Гомер');

        if (gomerButton) {
            e.preventDefault(); // Скасовуємо стандартну дію браузера тільки якщо є цільова кнопка
            gomerButton.click();
        }
        return;
    }

    // --- КОМБІНАЦІЯ: Ctrl + R / Cmd + R (Зчитати заново) ---
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyR') {
        // Шукаємо посилання з потрібним текстом
        const reloadButton = Array.from(document.querySelectorAll('a.btn.btn-danger'))
            .find(link => link.textContent.trim() === 'Зчитати заново');

        if (reloadButton) {
            e.preventDefault(); // Скасовуємо перезавантаження тільки якщо є цільова кнопка
            reloadButton.click();
        }
        return;
    }

    // Якщо користувач просто друкує текст, ігноруємо поодинокі клавіші навігації
    if (isTyping) return;

    // --- КЛАВІША: "Б" / "," / "<" (Попередній) ---
    if (e.code === 'Comma') {
        const prevButton = document.querySelector('[title="Попередній"]');
        if (prevButton) {
            e.preventDefault();
            prevButton.click();
        }
    }

    // --- КЛАВІША: "Ю" / "." / ">" (Наступний) ---
    if (e.code === 'Period') {
        const nextButton = document.querySelector('[title="Наступний"]');
        if (nextButton) {
            e.preventDefault();
            nextButton.click();
        }
    }
});