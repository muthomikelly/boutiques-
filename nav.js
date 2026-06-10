/**
 * nav.js — shared navbar logic for all customer pages
 * Include this on every page that has id="navUserGreeting" etc.
 */
(async function initNav() {
  let user = null;
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) user = (await res.json()).user;
  } catch {}

  // Elements (not all pages have all of these — guard each)
  const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };

  if (user) {
    set('navGreeting',   el => { el.textContent = `Hi, ${user.name.split(' ')[0]}`; el.classList.remove('hidden'); });
    set('navLoginLink',  el => el.classList.add('hidden'));
    set('navLogoutBtn',  el => el.classList.remove('hidden'));
    set('navOrdersLink', el => el.classList.remove('hidden'));
    if (user.role === 'admin') {
      set('navAdminLink', el => el.classList.remove('hidden'));
    }
  } else {
    set('navGreeting',   el => el.classList.add('hidden'));
    set('navLogoutBtn',  el => el.classList.add('hidden'));
    set('navOrdersLink', el => el.classList.add('hidden'));
    set('navAdminLink',  el => el.classList.add('hidden'));
    set('navLoginLink',  el => el.classList.remove('hidden'));
  }

  set('navLogoutBtn', el => {
    el.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      location.href = '/login.html';
    });
  });
})();
