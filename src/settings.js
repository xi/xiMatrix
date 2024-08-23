/* global browser */

var form = document.querySelector('form');
var textarea1 = document.querySelector('textarea.rules');
var textarea2 = document.querySelector('textarea.savedRules');

browser.storage.local.get(['rules', 'savedRules']).then(data => {
    var rules = data.rules || {};
    var savedRules = data.savedRules || {};
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

form.addEventListener('submit', event => {
    event.preventDefault();
    var rules = JSON.parse(textarea1.value);
    var savedRules = JSON.parse(textarea2.value);
    browser.storage.local.set({
        'rules': rules,
        'savedRules': savedRules,
    }).then(() => {
        location.reload();
    });
});
