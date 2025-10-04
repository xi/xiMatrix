import * as storage from './storage.js';

const form = document.querySelector('form');
const textarea1 = document.querySelector('textarea.rules');
const textarea2 = document.querySelector('textarea.savedRules');

Promise.all([
    storage.get('rules'),
    storage.get('savedRules'),
]).then(([rules, savedRules]) => {
    textarea1.value = JSON.stringify(rules, null, 2);
    textarea2.value = JSON.stringify(savedRules, null, 2);
});

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
    await storage.change('rules', () => {
        return JSON.parse(textarea1.value);
    });
    await storage.change('savedRules', () => {
        return JSON.parse(textarea2.value);
    });
});
