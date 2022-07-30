/* global browser */

var table = document.querySelector('table');

var sendMessage = function(type, data) {
    return browser.runtime.sendMessage({type: type, data: data});
};

sendMessage('get').then(requests => {
    for (const hostname in requests) {
        for (const type in requests[hostname]) {
            const tr = document.createElement('tr');

            let td = document.createElement('td');
            td.textContent = hostname;
            tr.append(td);

            td = document.createElement('td');
            td.textContent = type;
            tr.append(td);

            td = document.createElement('td');
            td.textContent = requests[hostname][type];
            tr.append(td);

            td = document.createElement('td');
            tr.append(td);

            let label = document.createElement('label');
            let input = document.createElement('input');
            input.type = 'radio';
            input.name = `${hostname}:${type}`;
            input.onchange = () => sendMessage('setRule', [hostname, type, true]);
            label.append(input);
            label.append(' allowed');
            td.append(label);

            label = document.createElement('label');
            input = document.createElement('input');
            input.type = 'radio';
            input.name = `${hostname}:${type}`;
            input.checked = true;
            input.onchange = () => sendMessage('setRule', [hostname, type, null]);
            label.append(input);
            label.append(' unset');
            td.append(label);

            label = document.createElement('label');
            input = document.createElement('input');
            input.type = 'radio';
            input.name = `${hostname}:${type}`;
            input.onchange = () => sendMessage('setRule', [hostname, type, false]);
            label.append(input);
            label.append(' blocked');
            td.append(label);

            table.append(tr);
        }
    }
});
