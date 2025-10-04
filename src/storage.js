/* global browser */

const STORAGE_DEFAULTS = {
    'rules': {},
    'savedRules': {},
    'requests': {},
    'totals': {},
};
const STORAGE_AREAS = {
    'rules': browser.storage.local,
    'savedRules': browser.storage.local,
    'requests': browser.storage.session,
    'totals': browser.storage.session,
};
var lock = Promise.resolve();
const cache = {};

const _get = async function(key) {
    var data = await STORAGE_AREAS[key].get(key);
    return data[key] ?? STORAGE_DEFAULTS[key];
};

export const get = function(key) {
    if (!cache[key]) {
        cache[key] = _get(key);
    }
    return cache[key];
};

const _change = async function(key, fn) {
    var oldValue = await get(key);
    var data = {};
    data[key] = fn(oldValue);
    cache[key] = data[key];
    await STORAGE_AREAS[key].set(data);
};

export const change = async function(key, fn) {
    lock = lock.then(() => _change(key, fn));
    await lock;
};
