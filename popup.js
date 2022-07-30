/* global browser */

browser.runtime.sendMessage({type: 'get'}).then(requests => {
    console.log(requests);
});
