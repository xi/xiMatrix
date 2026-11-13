/* global browser */

const STORAGE_AREAS = {
    'rules': browser.storage.local,
    'savedRules': browser.storage.local,
    'requests': browser.storage.session,
    'totals': browser.storage.session,
};
var lock = Promise.resolve();
const cache = {};

await Promise.all(Object.entries(STORAGE_AREAS).map(async ([key, area]) => {
    var data = await area.get(key);
    cache[key] = data[key] ?? {};
}));

export const get = function(key) {
    return cache[key];
};

const _change = async function(key, fn) {
    var newValue = fn(cache[key]);
    cache[key] = newValue;
    await STORAGE_AREAS[key].set({[key]: newValue});
};

export const change = async function(key, fn) {
    lock = lock.then(() => _change(key, fn));
    await lock;
};
