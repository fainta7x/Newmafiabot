const frame = document.querySelector('#app');
const screen = document.querySelector('#screen');
const size = document.querySelector('#size');
const allowedScreens = new Set([...screen.options].map((item) => item.value));
const params = new URLSearchParams(location.search);
if (allowedScreens.has(params.get('screen'))) screen.value = params.get('screen');
function openScreen() {
  switch (screen.value) {
    case 'live-voting': frame.src = '../e2e/live-game.html?mode=audit'; break;
    case 'live-game': frame.src = '../e2e/live-game.html'; break;
    case 'player-cabinet': frame.src = '../e2e/player-cabinet.html'; break;
    case 'crm-overview': frame.src = '../e2e/crm-overview.html'; break;
    case 'crm-evenings': frame.src = '../e2e/crm-evenings.html'; break;
    case 'crm-players': frame.src = '../e2e/crm-players.html'; break;
    case 'crm-more': frame.src = '../e2e/crm-more.html'; break;
    case 'crm-closeout': frame.src = '../e2e/crm-closeout.html'; break;
    case 'player-shell': frame.src = '../e2e/player-shell.html'; break;
    default: frame.src = '../e2e/crm-evening-roster.html';
  }
  const url = new URL(location.href);
  url.searchParams.set('screen', screen.value);
  history.replaceState(null, '', url);
}
function resize() {
  const [width, height] = size.value.split(',').map(Number);
  frame.style.width = width + 'px';
  frame.style.height = height + 'px';
}
screen.addEventListener('change', openScreen);
size.addEventListener('change', resize);
document.querySelector('#reload').addEventListener('click', openScreen);
openScreen();
fetch('../revision.json').then((response) => response.json()).then((data) => {
  document.querySelector('#revision').textContent = 'Код: ' + data.commit.slice(0, 8) + (data.dirty ? ' · рабочие изменения' : '');
}).catch(() => {});
