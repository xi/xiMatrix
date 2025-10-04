/* global browser */

var STORAGE_DEFAULTS = {
    'rules': {},
    'savedRules': {},
    'requests': {},
};
var STORAGE_AREAS = {
    'rules': browser.storage.local,
    'savedRules': browser.storage.local,
    'requests': browser.storage.session,
};

var lock = Promise.resolve();
var cache = {};

var _get = async function(key) {
    var data = await STORAGE_AREAS[key].get(key);
    return data[key] ?? STORAGE_DEFAULTS[key];
};

export var get = function(key) {
    if (!cache[key]) {
        cache[key] = _get(key);
    }
    return cache[key];
};

var _change = async function(key, fn) {
    var oldValue = await get(key);
    var data = {};
    data[key] = fn(oldValue);
    delete cache[key];
    await STORAGE_AREAS[key].set(data);
};

export var change = async function(key, fn) {
    lock = lock.then(() => _change(key, fn));
    await lock;
};

var invalidateCache = function(changes) {
  for (var key in changes) {
    delete cache[key];
  }
};

browser.storage.local.onChanged.addListener(invalidateCache);
