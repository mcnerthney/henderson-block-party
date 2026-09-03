const storageKey = 'neighborhood-whos-who-admin-code';

const state = {
  adminCode: localStorage.getItem(storageKey) || '',
  neighbors: []
};

const adminForm = document.getElementById('admin-form');
const adminCodeInput = document.getElementById('admin-code');
const adminStatus = document.getElementById('admin-status');
const adminList = document.getElementById('admin-list');
const adminEmpty = document.getElementById('admin-empty');
const adminCount = document.getElementById('admin-count');
const logoutButton = document.getElementById('logout-button');

adminCodeInput.value = state.adminCode;

function setStatus(message) {
  adminStatus.textContent = message;
}

function formatCount(count) {
  return `${count} ${count === 1 ? 'profile' : 'profiles'}`;
}

function getDisplayDescription(neighbor) {
  return neighbor.description || neighbor.intro || '';
}

function getInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || '?';
}

async function adminFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-admin-code': state.adminCode
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'Admin request failed.');
  }

  return payload;
}

async function verifyAdminCode() {
  await adminFetch('/api/admin/session');
}

function createPhoto(neighbor) {
  if (neighbor.photoUrl) {
    const image = document.createElement('img');
    image.className = 'card__photo';
    image.src = `${neighbor.photoUrl}?adminCode=${encodeURIComponent(state.adminCode)}`;
    image.alt = neighbor.name;
    return image;
  }

  const placeholder = document.createElement('div');
  placeholder.className = 'card__photo card__photo--placeholder';
  placeholder.setAttribute('aria-label', `No photo for ${neighbor.name}`);
  placeholder.textContent = getInitials(neighbor.name);
  return placeholder;
}

function createActionButton(label, variant, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = variant === 'danger' ? 'button button--danger' : 'button button--ghost';
  button.textContent = label;
  button.addEventListener('click', () => {
    onClick().catch((error) => {
      setStatus(error.message);
    });
  });
  return button;
}

function renderNeighbors() {
  adminCount.textContent = formatCount(state.neighbors.length);
  adminEmpty.hidden = state.neighbors.length > 0;
  adminList.replaceChildren(...state.neighbors.map(createAdminCard));
}

function createAdminCard(neighbor) {
  const card = document.createElement('article');
  card.className = 'admin-card';

  const photo = createPhoto(neighbor);

  const body = document.createElement('div');
  body.className = 'card__body';

  const title = document.createElement('h3');
  title.textContent = neighbor.name;

  const address = document.createElement('p');
  address.className = 'card__address';
  address.textContent = neighbor.address;

  body.append(title);

  const displayDescription = getDisplayDescription(neighbor);
  if (displayDescription) {
    const description = document.createElement('p');
    description.className = 'card__description';
    description.textContent = displayDescription;
    body.appendChild(description);
  }

  body.appendChild(address);

  if (neighbor.interests && neighbor.interests.length > 0) {
    const tags = document.createElement('div');
    tags.className = 'tags';

    neighbor.interests.forEach((interest) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = interest;
      tags.appendChild(tag);
    });

    body.appendChild(tags);
  }

  const actions = document.createElement('div');
  actions.className = 'admin-actions';

  const removePhotoButton = createActionButton('Remove photo', 'ghost', async () => {
    const confirmed = window.confirm(`Remove the photo for ${neighbor.name}?`);

    if (!confirmed) {
      return;
    }

    setStatus('Removing photo...');
    await adminFetch(`/api/admin/neighbors/${neighbor.id}/photo`, { method: 'DELETE' });
    setStatus('Photo removed.');
    await loadNeighbors();
  });

  if (!neighbor.photoUrl || !getDisplayDescription(neighbor)) {
    removePhotoButton.disabled = true;
  }

  const removeNameButton = createActionButton('Remove name', 'ghost', async () => {
    const confirmed = window.confirm(`Replace the name for ${neighbor.name} with "Neighbor"?`);

    if (!confirmed) {
      return;
    }

    setStatus('Removing name...');
    await adminFetch(`/api/admin/neighbors/${neighbor.id}/name`, { method: 'DELETE' });
    setStatus('Name removed.');
    await loadNeighbors();
  });

  const deleteProfileButton = createActionButton('Delete profile', 'danger', async () => {
    const confirmed = window.confirm(`Delete the entire profile for ${neighbor.name}?`);

    if (!confirmed) {
      return;
    }

    setStatus('Deleting profile...');
    await adminFetch(`/api/admin/neighbors/${neighbor.id}`, { method: 'DELETE' });
    setStatus('Profile deleted.');
    await loadNeighbors();
  });

  actions.append(removePhotoButton, removeNameButton, deleteProfileButton);
  body.appendChild(actions);
  card.append(photo, body);
  return card;
}

async function loadNeighbors() {
  const payload = await adminFetch('/api/neighbors');
  state.neighbors = payload.neighbors;
  renderNeighbors();
}

async function handleUnlock(event) {
  event.preventDefault();
  state.adminCode = adminCodeInput.value.trim();

  if (!state.adminCode) {
    setStatus('Enter the admin code first.');
    return;
  }

  setStatus('Unlocking admin...');

  try {
    await verifyAdminCode();
    localStorage.setItem(storageKey, state.adminCode);
    setStatus('Admin unlocked.');
    await loadNeighbors();
  } catch (error) {
    localStorage.removeItem(storageKey);
    setStatus(error.message);
  }
}

function handleLogout() {
  state.adminCode = '';
  state.neighbors = [];
  adminCodeInput.value = '';
  localStorage.removeItem(storageKey);
  renderNeighbors();
  adminEmpty.hidden = false;
  adminEmpty.textContent = 'Enter the admin code to load profiles.';
  setStatus('Logged out.');
}

adminForm.addEventListener('submit', (event) => {
  handleUnlock(event).catch((error) => {
    setStatus(error.message);
  });
});

logoutButton.addEventListener('click', handleLogout);

if (state.adminCode) {
  verifyAdminCode()
    .then(loadNeighbors)
    .then(() => setStatus('Admin unlocked.'))
    .catch((error) => {
      handleLogout();
      setStatus(error.message);
    });
}
