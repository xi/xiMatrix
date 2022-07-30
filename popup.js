/* global browser */

var table = document.querySelector('table');

browser.runtime.sendMessage({type: 'get'}).then(requests => {
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

            table.append(tr);
        }
    }
});
