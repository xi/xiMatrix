var shared = {};

shared.TYPES = ['font', 'css', 'media', 'script', 'xhr', 'frame', 'other'];
shared.TYPE_MAP = {
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

shared.shouldAllow = function(rules, context, hostname, type) {
    var hostnames = ['*', hostname];
    if (context === hostname) {
        hostnames.push('first-party');
    }
    var parts = hostname.split('.');
    while (parts.length > 2) {
        parts.shift();
        hostnames.push(parts.join('.'));
    }

    return [context, '*'].some(c => {
        return rules[c] && hostnames.some(h => {
            return rules[c][h] && [type, '*'].some(t => {
                return !!rules[c][h][t];
            });
        });
    });
};
