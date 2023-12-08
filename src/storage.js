/* global browser */

var STORAGE_DEFAULTS = {
    'rules': {},
    'savedRules': {},
    'requests': {},
    'recording': true,
};
var STORAGE_AREAS = {
    'rules': browser.storage.local,
    'savedRules': browser.storage.local,
    'requests': browser.storage.session,
    'recording': browser.storage.local,
};

var lock = Promise.resolve();

export var get = async function(key) {
    var data = await STORAGE_AREAS[key].get(key);
    return data[key] ?? STORAGE_DEFAULTS[key];
};

var _change = async function(key, fn) {
    var oldValue = await get(key);
    var data = {};
    data[key] = fn(oldValue);
    await STORAGE_AREAS[key].set(data);
};

export var change = async function(key, fn) {
    lock = lock.then(() => _change(key, fn));
    await lock;
};

// migrations
browser.runtime.onInstalled.addListener(() => {
    // 0.8.0: store requests to session storage
    lock = lock.then(() => browser.storage.local.remove('requests'));
});
