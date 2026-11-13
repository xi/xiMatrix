/* global browser */

import * as storage from './storage.js';

const form = document.querySelector('form');
const textarea1 = document.querySelector('textarea.rules');
const textarea2 = document.querySelector('textarea.savedRules');

textarea1.value = JSON.stringify(storage.get('rules'), null, 2);
textarea2.value = JSON.stringify(storage.get('savedRules'), null, 2);

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
        type: 'replaceRules',
        data: {
            rules: JSON.parse(textarea1.value),
            savedRules: JSON.parse(textarea2.value),
        },
    });
});
