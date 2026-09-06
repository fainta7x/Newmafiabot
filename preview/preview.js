const frame = document.querySelector('#app');
const screen = document.querySelector('#screen');
const size = document.querySelector('#size');
const allowedScreens = new Set([...screen.options].map((item) => item.value));
const params = new URLSearchParams(location.search);
if (allowedScreens.has(params.get('screen'))) screen.value = params.get('screen');
function openScreen() {
  frame.src = '../e2e/' + screen.value + '.html';
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
