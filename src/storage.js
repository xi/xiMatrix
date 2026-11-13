/* global browser */

const STORAGE_AREAS = {
    'rules': browser.storage.local,
    'savedRules': browser.storage.local,
    'requests': browser.storage.session,
    'totals': browser.storage.session,
};
let lock = Promise.resolve();
const cache = {};

await Promise.all(Object.entries(STORAGE_AREAS).map(async ([key, area]) => {
    const data = await area.get(key);
    cache[key] = data[key] ?? {};
}));

export function get(key) {
    return cache[key];
}

async function _change(key, fn) {
    const newValue = fn(cache[key]);
    cache[key] = newValue;
    await STORAGE_AREAS[key].set({[key]: newValue});
}

export async function change(key, fn) {
    lock = lock.then(() => _change(key, fn));
    await lock;
}
