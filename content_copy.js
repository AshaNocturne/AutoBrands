// Змінна для зберігання стану ввімкнення функції (за замовчуванням вимкнено)
let isEnterpriseCopyEnabled = false;

// 1. Отримуємо початковий стан функції відразу при завантаженні сторінки
chrome.storage.local.get(['enterpriseCopyEnabled'], function(result) {
    isEnterpriseCopyEnabled = result.enterpriseCopyEnabled || false;
});

// 2. Стежимо за змінами у сховищі (якщо користувач увімкне чи вимкне чекбокс у попапі)
chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === 'local' && changes.enterpriseCopyEnabled) {
        isEnterpriseCopyEnabled = changes.enterpriseCopyEnabled.newValue;
    }
});

// 3. Обробляємо подію копіювання (тепер синхронно і миттєво)
document.addEventListener('copy', function(e) {
    if (isEnterpriseCopyEnabled) {
        // Отримуємо виділений користувачем текст
        const selectedText = document.getSelection().toString();
        
        if (selectedText) {
            // Очищаємо текст за допомогою регулярних виразів
            let cleanedText = selectedText
                .replace(/[а-яА-ЯёЁіІїЇєЄґҐ]/g, '') // Видаляємо кирилицю
                .replace(/[\s\-\.,_\\\/|!?@#\$%\^&\*\(\)\[\]\{\};:'"<>`~+=]/g, ''); // Видаляємо пробіли та знаки

            // Записуємо очищений текст в буфер обміну
            e.clipboardData.setData('text/plain', cleanedText);
            
            // Скасовуємо стандартне копіювання оригінального тексту
            e.preventDefault();
        }
    }
});