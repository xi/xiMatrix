export const TYPES = ['cookie', 'font', 'css', 'media', 'script', 'xhr', 'frame', 'other'];
export const TYPE_MAP = {
    'stylesheet': 'css',
    'font': 'font',
    'image': 'media',
    'imageset': 'media',
    'media': 'media',
    'script': 'script',
    'beacon': 'xhr',
    'xmlhttprequest': 'xhr',
    'websocket': 'xhr',
    'sub_frame': 'frame',
};

export var shouldAllow = function(rules, context, hostname, type) {
    var hostnames = ['*', hostname];
    var parts = hostname.split('.');
    while (parts.length > 2) {
        parts.shift();
        hostnames.push(parts.join('.'));
    }
    if (context !== '*' && hostnames.some(h => h === context)) {
        hostnames.push('first-party');
    }

    return [context, '*'].some(c => {
        return rules[c] && hostnames.some(h => {
            return rules[c][h] && [type, '*'].some(t => {
                return !!rules[c][h][t];
            });
        });
    });
};
