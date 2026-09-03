const state = {
  neighbors: [],
  searchTerm: '',
  selectedPhotoFile: null,
  previewObjectUrl: null,
  cameraStream: null
};

const cards = document.getElementById('cards');
const emptyState = document.getElementById('empty-state');
const resultCount = document.getElementById('result-count');
const searchInput = document.getElementById('search');
const joinForm = document.getElementById('join-form');
const formStatus = document.getElementById('form-status');
const submitButton = document.getElementById('submit-button');
const photoInput = document.getElementById('photo');
const uploadPhotoButton = document.getElementById('upload-photo');
const startCameraButton = document.getElementById('start-camera');
const capturePhotoButton = document.getElementById('capture-photo');
const retakePhotoButton = document.getElementById('retake-photo');
const cameraPanel = document.getElementById('camera-panel');
const cameraPreview = document.getElementById('camera-preview');
const previewContainer = document.getElementById('photo-preview');
const previewImage = document.getElementById('preview-image');
const qrCode = document.getElementById('qr-code');
const shareUrl = document.getElementById('share-url');
const eventBanner = document.getElementById('event-banner');
const eventCountdown = document.getElementById('event-countdown');
const EVENT_START = new Date('2026-09-23T16:00:00');
const EVENT_HIDE_AFTER = new Date('2026-09-24T00:00:00');
let countdownIntervalId = null;
const copyLinkButton = document.getElementById('copy-link');
const shareLinkButton = document.getElementById('share-link');
const confirmationDialog = document.getElementById('profile-confirmation');
const confirmationPreview = document.getElementById('confirmation-preview');
const saveErrorDialog = document.getElementById('save-error-dialog');
const saveErrorMessage = document.getElementById('save-error-message');
const saveSuccessDialog = document.getElementById('save-success-dialog');
const saveSuccessMessage = document.getElementById('save-success-message');

function revokePreviewUrl() {
  if (state.previewObjectUrl) {
    URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = null;
  }
}

function stopCameraStream() {
  if (!state.cameraStream) {
    return;
  }

  state.cameraStream.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
  cameraPreview.srcObject = null;
}

function updatePhotoControls() {
  const hasSelectedPhoto = Boolean(state.selectedPhotoFile);
  const cameraIsRunning = Boolean(state.cameraStream);

  capturePhotoButton.hidden = !cameraIsRunning;
  retakePhotoButton.hidden = !cameraIsRunning && !hasSelectedPhoto;
  retakePhotoButton.textContent = 'Retake photo';
}

function formatCount(count) {
  return `${count} ${count === 1 ? 'neighbor' : 'neighbors'}`;
}

function updateShareSection() {
  const currentUrl = window.location.origin;
  shareUrl.textContent = currentUrl;
  qrCode.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(currentUrl)}`;
}

function updateEventBanner() {
  if (!eventBanner) {
    return;
  }
  eventBanner.hidden = Date.now() >= EVENT_HIDE_AFTER.getTime();

  if (eventBanner.hidden) {
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
    return;
  }

  updateCountdownText();
  if (!countdownIntervalId) {
    countdownIntervalId = setInterval(updateCountdownText, 1000);
  }
}

function updateCountdownText() {
  if (!eventCountdown) {
    return;
  }

  const remainingMs = EVENT_START.getTime() - Date.now();

  if (remainingMs <= 0) {
    eventCountdown.textContent = "It's happening now!";
    return;
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  parts.push(`${hours}h`, `${minutes}m`, `${seconds}s`);

  eventCountdown.textContent = `Countdown: ${parts.join(' ')}`;
}

function schedulePartyAutoRefresh() {
  const now = Date.now();

  if (now < EVENT_START.getTime() || now >= EVENT_HIDE_AFTER.getTime()) {
    return;
  }

  setInterval(() => {
    window.location.reload();
  }, 15000);
}

function setSelectedPhoto(file) {
  state.selectedPhotoFile = file;
  revokePreviewUrl();

  if (!file) {
    previewContainer.hidden = true;
    previewImage.removeAttribute('src');
    cameraPreview.hidden = false;
    updatePhotoControls();
    return;
  }

  state.previewObjectUrl = URL.createObjectURL(file);
  previewImage.src = state.previewObjectUrl;
  previewContainer.hidden = false;
  cameraPreview.hidden = true;
  cameraPanel.hidden = false;
  updatePhotoControls();
}

function matchesSearch(neighbor, term) {
  const haystack = [
    neighbor.name,
    neighbor.description || neighbor.intro,
    neighbor.address || '',
    neighbor.phone || '',
    neighbor.email || '',
    neighbor.petNames || '',
    ...(neighbor.interests || [])
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(term);
}

function renderNeighbors() {
  const searchTerm = state.searchTerm.trim().toLowerCase();
  const visibleNeighbors = searchTerm
    ? state.neighbors.filter((neighbor) => matchesSearch(neighbor, searchTerm))
    : state.neighbors;

  resultCount.textContent = formatCount(visibleNeighbors.length);
  emptyState.hidden = visibleNeighbors.length > 0;
  if (visibleNeighbors.length === 0) {
    emptyState.textContent = searchTerm
      ? `No neighbors match "${state.searchTerm.trim()}". Try a different name, address, or interest.`
      : 'Nobody has joined yet. Be the first neighbor in the directory.';
  }
  cards.replaceChildren(...visibleNeighbors.map(createNeighborCard));
}

function getDisplayDescription(neighbor) {
  return neighbor.description || neighbor.intro || '';
}

function getInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || '?';
}

function createNeighborCard(neighbor) {
  const card = document.createElement('article');
  card.className = 'card';

  let photo;

  if (neighbor.photoUrl) {
    photo = document.createElement('img');
    photo.className = 'card__photo';
    photo.src = neighbor.photoUrl;
    photo.alt = neighbor.name;
  } else {
    photo = document.createElement('div');
    photo.className = 'card__photo card__photo--placeholder';
    photo.setAttribute('aria-label', `No photo for ${neighbor.name}`);
    photo.textContent = getInitials(neighbor.name);
  }

  const body = document.createElement('div');
  body.className = 'card__body';

  const title = document.createElement('h3');
  title.textContent = neighbor.name;

  body.appendChild(title);

  const displayDescription = getDisplayDescription(neighbor);
  if (displayDescription) {
    const description = document.createElement('p');
    description.className = 'card__description';
    description.textContent = displayDescription;
    body.appendChild(description);
  }

  if (neighbor.address) {
    const address = document.createElement('p');
    address.className = 'card__address';
    address.textContent = neighbor.address;
    body.appendChild(address);
  }

  [
    ['Phone', neighbor.phone, `tel:${neighbor.phone || ''}`],
    ['Email', neighbor.email, `mailto:${neighbor.email || ''}`],
    ['Pets', neighbor.petNames, null]
  ].forEach(([label, value, href]) => {
    if (!value) {
      return;
    }
    const detail = document.createElement('p');
    detail.className = 'card__address';
    if (href) {
      detail.append(`${label}: `);
      const link = document.createElement('a');
      link.className = 'card__link';
      link.href = href;
      link.textContent = value;
      detail.appendChild(link);
    } else {
      detail.textContent = `${label}: ${value}`;
    }
    body.appendChild(detail);
  });

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

  card.append(photo, body);
  return card;
}

async function loadNeighbors() {
  const response = await fetch('/api/neighbors');

  if (!response.ok) {
    throw new Error('Unable to load neighbors right now.');
  }

  const payload = await response.json();
  state.neighbors = payload.neighbors;
  renderNeighbors();
}

function resetForm() {
  joinForm.reset();
  setSelectedPhoto(null);
  stopCameraStream();
  cameraPanel.hidden = true;
}

async function submitProfile(event) {
  event.preventDefault();
  const formData = new FormData(joinForm);
  if (state.selectedPhotoFile) {
    formData.set('photo', state.selectedPhotoFile, state.selectedPhotoFile.name);
  }

  const confirmed = await confirmProfile(formData);
  if (!confirmed) {
    return;
  }

  formStatus.textContent = 'Saving your profile...';
  submitButton.disabled = true;

  try {
    const response = await fetch('/api/neighbors', {
      method: 'POST',
      body: formData
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Unable to save your profile.');
    }

    const successMessage = `Thanks! ${payload.neighbor.name}'s profile was submitted and is awaiting admin approval.`;
    formStatus.textContent = successMessage;
    saveSuccessMessage.textContent = successMessage;
    saveSuccessDialog.showModal();
    resetForm();
  } catch (error) {
    formStatus.textContent = error.message;
    saveErrorMessage.textContent = error.message;
    saveErrorDialog.showModal();
  } finally {
    submitButton.disabled = false;
  }
}

function confirmProfile(formData) {
  const previewNeighbor = {
    name: (formData.get('name') || '').toString().trim(),
    description: (formData.get('description') || '').toString().trim(),
    address: (formData.get('address') || '').toString().trim(),
    interests: (formData.get('interests') || '').toString().split(',').map((item) => item.trim()).filter(Boolean),
    phone: (formData.get('phone') || '').toString().trim(),
    email: (formData.get('email') || '').toString().trim(),
    petNames: (formData.get('petNames') || '').toString().trim(),
    photoUrl: null
  };
  confirmationPreview.replaceChildren(createNeighborCard(previewNeighbor));
  const photoEntry = formData.get('photo');
  if (photoEntry && typeof photoEntry === 'object' && photoEntry.size > 0) {
    const previewPhoto = document.createElement('img');
    previewPhoto.className = 'card__photo';
    previewPhoto.src = state.previewObjectUrl || URL.createObjectURL(photoEntry);
    previewPhoto.alt = previewNeighbor.name;
    confirmationPreview.querySelector('.card__photo')?.replaceWith(previewPhoto);
  }

  confirmationDialog.showModal();
  return new Promise((resolve) => {
    confirmationDialog.addEventListener('close', () => resolve(confirmationDialog.returnValue === 'confirm'), { once: true });
  });
}

function previewPhoto() {
  const [file] = photoInput.files;

  if (!file) {
    setSelectedPhoto(null);
    return;
  }

  stopCameraStream();
  cameraPanel.hidden = true;
  setSelectedPhoto(file);
}

function openPhotoPicker() {
  photoInput.click();
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera access is not supported on this device.');
  }

  photoInput.value = '';
  stopCameraStream();
  state.cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user'
    },
    audio: false
  });

  cameraPreview.srcObject = state.cameraStream;
  cameraPreview.hidden = false;
  cameraPanel.hidden = false;
  setSelectedPhoto(null);
}

async function capturePhoto() {
  if (!state.cameraStream) {
    throw new Error('Start the camera first.');
  }

  const canvas = document.createElement('canvas');
  const width = cameraPreview.videoWidth;
  const height = cameraPreview.videoHeight;

  if (!width || !height) {
    throw new Error('Camera is still warming up. Please try again.');
  }

  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(cameraPreview, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92);
  });

  if (!blob) {
    throw new Error('Unable to capture a photo right now.');
  }

  const file = new File([blob], `camera-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
  setSelectedPhoto(file);
  stopCameraStream();
  cameraPanel.hidden = true;
}

async function retakePhoto() {
  if (state.cameraStream || state.selectedPhotoFile) {
    await startCamera();
    return;
  }

  photoInput.value = '';
}

async function copyLink() {
  await navigator.clipboard.writeText(window.location.origin);
  formStatus.textContent = 'Link copied. Add it to your printed QR sign if you want a backup.';
}

async function shareLink() {
  if (!navigator.share) {
    formStatus.textContent = 'Sharing is not supported on this device. Try copying the link instead.';
    return;
  }

  await navigator.share({
    title: "Neighborhood Who's Who",
    text: "Scan in and see who's who in the neighborhood.",
    url: window.location.origin
  });
}

searchInput.addEventListener('input', (event) => {
  state.searchTerm = event.target.value;
  renderNeighbors();
});

photoInput.addEventListener('change', previewPhoto);
uploadPhotoButton.addEventListener('click', openPhotoPicker);
joinForm.addEventListener('submit', submitProfile);
startCameraButton.addEventListener('click', () => {
  startCamera().catch((error) => {
    formStatus.textContent = error.message;
  });
});
capturePhotoButton.addEventListener('click', () => {
  capturePhoto().catch((error) => {
    formStatus.textContent = error.message;
  });
});
retakePhotoButton.addEventListener('click', () => {
  retakePhoto().catch((error) => {
    formStatus.textContent = error.message;
  });
});
copyLinkButton.addEventListener('click', () => {
  copyLink().catch((error) => {
    formStatus.textContent = error.message;
  });
});
shareLinkButton.addEventListener('click', () => {
  shareLink().catch((error) => {
    formStatus.textContent = error.message;
  });
});

updateShareSection();
updateEventBanner();
schedulePartyAutoRefresh();
updatePhotoControls();
loadNeighbors().catch((error) => {
  formStatus.textContent = error.message;
});
window.addEventListener('beforeunload', stopCameraStream);
