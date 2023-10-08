/* global browser */

const TYPE_MAP = {
    'style-src': 'css',
    'style-src-elem': 'css',
    'style-src-attr': 'css',
    'script-src': 'script',
    'script-src-elem': 'script',
    'script-src-attr': 'script',
    'img-src': 'media',
    'media-src': 'media',
};

document.addEventListener('securitypolicyviolation', event => {
    var type = TYPE_MAP[event.effectiveDirective];
    if (type) {
        browser.runtime.sendMessage({
            type: 'securitypolicyviolation',
            data: type,
        });
    }
});
