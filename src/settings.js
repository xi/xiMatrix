/* global browser */

const form = document.querySelector('form');
const textarea1 = document.querySelector('textarea.rules');
const textarea2 = document.querySelector('textarea.savedRules');

const settings = await browser.runtime.sendMessage({type: 'getSettings'});
textarea1.value = JSON.stringify(settings.rules, null, 2);
textarea2.value = JSON.stringify(settings.savedRules, null, 2);

form.addEventListener('change', event => {
    try {
        JSON.parse(event.target.value);
        event.target.setCustomValidity('');
    } catch (e) {
        event.target.setCustomValidity(e);
        event.target.reportValidity();
    }
});

form.addEventListener('submit', async event => {
    event.preventDefault();
    await browser.runtime.sendMessage({
        type: 'setSettings',
        data: {
            rules: JSON.parse(textarea1.value),
            savedRules: JSON.parse(textarea2.value),
        },
    });
});
