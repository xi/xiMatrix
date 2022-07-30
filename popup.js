/* global browser */

var table = document.querySelector('table');

var sendMessage = function(type, data) {
    return browser.runtime.sendMessage({type: type, data: data});
};

var createRadios = function(hostname, type, rule) {
    var div = document.createElement('div');
    div.className = 'radios';

    var label = document.createElement('label');
    var input = document.createElement('input');
    input.type = 'radio';
    input.name = `${hostname}:${type}`;
    input.checked = rule === true;
    input.onchange = () => sendMessage('setRule', [hostname, type, true]);
    label.append(input);
    label.append(' allowed');
    div.append(label);

    label = document.createElement('label');
    input = document.createElement('input');
    input.type = 'radio';
    input.name = `${hostname}:${type}`;
    input.checked = rule == null;  // but undefined == null
    input.onchange = () => sendMessage('setRule', [hostname, type, null]);
    label.append(input);
    label.append(' unset');
    div.append(label);

    label = document.createElement('label');
    input = document.createElement('input');
    input.type = 'radio';
    input.name = `${hostname}:${type}`;
    input.checked = rule === false;
    input.onchange = () => sendMessage('setRule', [hostname, type, false]);
    label.append(input);
    label.append(' blocked');
    div.append(label);

    return div;
};

sendMessage('get').then(data => {
    var createRow = function(hostname, type, count) {
        var tr = document.createElement('tr');
        var rule = data.rules[hostname] ? data.rules[hostname][type] : null;

        let td = document.createElement('td');
        td.textContent = hostname;
        tr.append(td);

        td = document.createElement('td');
        td.textContent = type;
        tr.append(td);

        td = document.createElement('td');
        td.textContent = count;
        tr.append(td);

        td = document.createElement('td');
        td.append(createRadios(hostname, type, rule));
        tr.append(td);

        table.append(tr);
    };

    createRow('inline', 'css', '');
    createRow('inline', 'script', '');
    createRow('inline', 'media', '');

    for (const hostname in data.requests) {
        for (const type in data.requests[hostname]) {
            createRow(hostname, type, data.requests[hostname][type]);
        }
    }
});
