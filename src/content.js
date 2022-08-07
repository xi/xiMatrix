/* global browser */

const TYPE_MAP = {
    'style-src': 'css',
    'script-src': 'script',
    'img-src': 'media',
};

document.addEventListener('securitypolicyviolation', event => {
    var type = TYPE_MAP[event.violatedDirective];
    if (type) {
        browser.runtime.sendMessage({
            type: 'securitypolicyviolation',
            data: type,
        });
    }
});
