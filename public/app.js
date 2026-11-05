const $ = (selector) => document.querySelector(selector);
let currentUser;
const offsets = { friends: 0, incoming: 0, outgoing: 0, search: 0 };
let searchQuery = '';
let generation = 0;
function notice(message = '', error = false) { $('#notice').textContent = message; $('#notice').classList.toggle('error', error); }
async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.endsWith('/login')) showAccount(null);
    const error = new Error(result.error?.message || 'Request failed. Please try again.');
    error.status = response.status; throw error;
  }
  return result.data;
}
function showAccount(user) {
  generation++;
  currentUser = user;
  $('#auth-panel').hidden = Boolean(user); $('#dashboard').hidden = !user;
  for (const list of ['friends-list', 'incoming-list', 'outgoing-list', 'search-results']) $(`#${list}`).replaceChildren();
  if (user) {
    $('#greeting').textContent = `Hello, ${user.display_name}`;
    $('#username').textContent = `@${user.username}`;
    $('#profile-form').elements.display_name.value = user.display_name;
    $('#profile-form').elements.email.value = user.email;
  }
}
async function run(control, task) {
  control.disabled = true; notice();
  try { await task(); } catch (error) { notice(error.message, true); }
  finally { control.disabled = false; }
}
function action(label, task, className = 'secondary') {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.className = className;
  button.addEventListener('click', () => run(button, task)); return button;
}
function entry(user, actions = []) {
  const row = document.createElement('li'); const person = document.createElement('div'); person.className = 'person';
  const name = document.createElement('strong'); name.textContent = user?.display_name || 'Unavailable account';
  const username = document.createElement('small'); username.textContent = user ? `@${user.username}` : '';
  person.append(name, username); const controls = document.createElement('div'); controls.className = 'actions'; controls.append(...actions); row.append(person, controls); return row;
}
const listPaths = { friends: '/api/friends', incoming: '/api/friends/requests?direction=incoming', outgoing: '/api/friends/requests?direction=outgoing' };
async function loadList(type, append = false) {
  if (!currentUser) return;
  const version = generation;
  const offset = append ? offsets[type] + 20 : 0;
  const path = listPaths[type];
  const rows = await api(`${path}${path.includes('?') ? '&' : '?'}offset=${offset}`);
  if (version !== generation) return;
  offsets[type] = offset;
  const target = $(`#${type}-list`); if (!append) target.replaceChildren();
  for (const row of rows) {
    const actions = [];
    if (type === 'friends' && row.user) actions.push(action('Remove', async () => {
      if (!confirm(`Remove ${row.user.display_name} from your friends?`)) return;
      await api(`/api/friends/${row.user._id}`, 'DELETE'); await refresh(); notice('Friend removed.');
    }, 'danger'));
    if (type === 'incoming') for (const [label, status] of [['Accept', 'accepted'], ['Decline', 'declined']]) actions.push(action(label, async () => {
      await api(`/api/friends/requests/${row._id}`, 'PATCH', { status }); await refresh(); notice(status === 'accepted' ? 'You are now friends.' : 'Request declined.');
    }));
    if (type === 'outgoing') { const pending = document.createElement('small'); pending.textContent = 'Pending'; actions.push(pending); }
    target.append(entry(row.user, actions));
  }
  if (!target.children.length) { const empty = document.createElement('li'); empty.className = 'muted'; empty.textContent = type === 'friends' ? 'No friends yet. Find someone above to get started.' : 'No pending requests.'; target.append(empty); }
  $(`#${type}-more`).hidden = rows.length < 20;
}
async function refresh() { await Promise.all(['friends', 'incoming', 'outgoing'].map((type) => loadList(type))); }
for (const type of ['friends', 'incoming', 'outgoing']) $(`#${type}-more`).addEventListener('click', (event) => run(event.currentTarget, () => loadList(type, true)));
for (const mode of ['login', 'register']) {
  $(`#show-${mode}`).addEventListener('click', () => {
    for (const item of ['login', 'register']) { $(`#${item}-form`).hidden = mode !== item; $(`#show-${item}`).setAttribute('aria-pressed', String(item === mode)); }
    notice();
  });
  $(`#${mode}-form`).addEventListener('submit', (event) => {
    event.preventDefault(); const form = event.currentTarget;
    run(form.querySelector('button'), async () => {
      const user = await api(`/api/auth/${mode}`, 'POST', Object.fromEntries(new FormData(form)));
      form.reset(); showAccount(user); await refresh(); notice(mode === 'register' ? 'Account created. Welcome!' : 'Welcome back.');
    });
  });
}
$('#profile-form').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget;
  run(form.querySelector('button'), async () => { const user = await api('/api/users/me', 'PATCH', Object.fromEntries(new FormData(form))); currentUser = user; $('#greeting').textContent = `Hello, ${user.display_name}`; notice('Profile saved.'); });
});
$('#logout').addEventListener('click', (event) => run(event.currentTarget, async () => { await api('/api/auth/logout', 'POST'); showAccount(null); notice('You have logged out.'); }));
$('#refresh').addEventListener('click', (event) => run(event.currentTarget, refresh));
async function search(append = false) {
  const version = generation;
  const offset = append ? offsets.search + 20 : 0;
  const rows = await api(`/api/users?q=${encodeURIComponent(searchQuery)}&offset=${offset}`);
  if (version !== generation) return;
  offsets.search = offset;
  const target = $('#search-results'); if (!append) target.replaceChildren();
  for (const user of rows) target.append(entry(user, [action('Add friend', async () => {
    await api('/api/friends/requests', 'POST', { user_id: user._id }); await loadList('outgoing'); notice(`Friend request sent to ${user.display_name}.`);
  })]));
  if (!target.children.length) { const empty = document.createElement('li'); empty.textContent = 'No matching users.'; target.append(empty); }
  $('#search-more').hidden = rows.length < 20;
}
$('#search-form').addEventListener('submit', (event) => { event.preventDefault(); searchQuery = event.currentTarget.elements.q.value.trim(); run(event.currentTarget.querySelector('button'), () => search()); });
$('#search-more').addEventListener('click', (event) => run(event.currentTarget, () => search(true)));
try { const user = await api('/api/users/me'); showAccount(user); await refresh(); }
catch (error) { if (error.status !== 401) notice(error.message, true); }
