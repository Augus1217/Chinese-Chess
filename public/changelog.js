const { ipcRenderer } = require('electron');

ipcRenderer.on('changelog-data', (event, changelog) => {
    document.title = changelog.title;
    const contentDiv = document.getElementById('changelog-content');
    let html = `<h1>${changelog.title}</h1>`;
    html += '<ul>';
    changelog.changes.forEach(change => {
        html += `<li>- ${change}</li>`;
    });
    html += '</ul>';
    contentDiv.innerHTML = html;
});