const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3010;
const adminCode = process.env.ADMIN_CODE || 'dan';
const publicDir = path.join(__dirname, 'public');
const uploadsDir = path.join(publicDir, 'uploads');
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'neighbors.json');
const bucketName = process.env.GCS_BUCKET_NAME || '';
const dataObjectName = process.env.GCS_DATA_OBJECT || 'neighbors.json';
const uploadPrefix = 'uploads';
const useGcs = Boolean(bucketName);
const storageClient = useGcs ? new Storage() : null;
const bucket = useGcs ? storageClient.bucket(bucketName) : null;

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function mapNeighbor(neighbor) {
  return {
    ...neighbor,
    description: neighbor.description || neighbor.intro || '',
    status: neighbor.status || 'approved'
  };
}

async function ensureDataStoreInitialized() {
  if (!useGcs) {
    if (!fs.existsSync(dataFile)) {
      fs.writeFileSync(dataFile, '[]\n');
    }

    return;
  }

  const dataObject = bucket.file(dataObjectName);
  const [exists] = await dataObject.exists();

  if (!exists) {
    await dataObject.save('[]\n', {
      contentType: 'application/json'
    });
  }
}

async function loadNeighbors() {
  if (!useGcs) {
    const fileContents = fs.readFileSync(dataFile, 'utf8');
    return JSON.parse(fileContents).map(mapNeighbor);
  }

  const [fileContents] = await bucket.file(dataObjectName).download();
  return JSON.parse(fileContents.toString('utf8')).map(mapNeighbor);
}

async function saveNeighbors(neighbors) {
  const serializedNeighbors = `${JSON.stringify(neighbors, null, 2)}\n`;

  if (!useGcs) {
    fs.writeFileSync(dataFile, serializedNeighbors);
    return;
  }

  await bucket.file(dataObjectName).save(serializedNeighbors, {
    contentType: 'application/json'
  });
}

function sanitizeFilenamePart(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function buildUploadFilename(name, originalName) {
  const extension = path.extname(originalName).toLowerCase() || '.jpg';
  const namePart = sanitizeFilenamePart(name || 'neighbor');
  return `${namePart || 'neighbor'}-${crypto.randomUUID()}${extension}`;
}

function getPhotoStorageKey(photoUrl) {
  if (!photoUrl) {
    return null;
  }

  const normalizedUrl = new URL(photoUrl, 'http://localhost');

  if (!normalizedUrl.pathname.startsWith('/uploads/')) {
    throw createHttpError(400, 'Invalid uploaded photo path.');
  }

  const filename = path.posix.basename(normalizedUrl.pathname);
  return `${uploadPrefix}/${filename}`;
}

async function saveUploadedPhoto(file, name) {
  if (!file) {
    return null;
  }

  const filename = buildUploadFilename(name, file.originalname);
  const photoUrl = `/uploads/${filename}`;

  if (!useGcs) {
    fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
    return photoUrl;
  }

  await bucket.file(`${uploadPrefix}/${filename}`).save(file.buffer, {
    contentType: file.mimetype,
    resumable: false,
    metadata: {
      cacheControl: 'public, max-age=3600'
    }
  });

  return photoUrl;
}

async function deleteUploadedPhoto(photoUrl) {
  const photoStorageKey = getPhotoStorageKey(photoUrl);

  if (!photoStorageKey) {
    return;
  }

  if (!useGcs) {
    const localPhotoPath = path.resolve(publicDir, `.${photoUrl}`);
    const resolvedUploadsDir = path.resolve(uploadsDir);

    if (!localPhotoPath.startsWith(`${resolvedUploadsDir}${path.sep}`)) {
      throw createHttpError(400, 'Invalid uploaded photo path.');
    }

    fs.rmSync(localPhotoPath, { force: true });
    return;
  }

  await bucket.file(photoStorageKey).delete({ ignoreNotFound: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Only image uploads are allowed.'));
      return;
    }

    callback(null, true);
  }
});

function parseInterests(rawValue) {
  return (rawValue || '')
    .split(',')
    .map((interest) => interest.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function readTextField(value, fieldName, maxLength) {
  const normalizedValue = (value || '').trim();

  if (normalizedValue.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }

  return normalizedValue;
}

function requireAdmin(req, res, next) {
  const suppliedCode = req.get('x-admin-code');

  if (suppliedCode !== adminCode) {
    next(createHttpError(401, 'Invalid admin code.'));
    return;
  }

  next();
}

app.use(express.json());
app.use(express.static(publicDir));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/admin/', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/uploads/:filename', async (req, res, next) => {
  try {
    if (!useGcs) {
      res.sendFile(path.join(uploadsDir, path.basename(req.params.filename)));
      return;
    }

    const objectName = `${uploadPrefix}/${path.basename(req.params.filename)}`;
    const file = bucket.file(objectName);
    const [exists] = await file.exists();

    if (!exists) {
      throw createHttpError(404, 'Photo not found.');
    }

    res.set('Cache-Control', 'public, max-age=3600');
    file.createReadStream()
      .on('error', next)
      .pipe(res);
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    storage: useGcs ? 'gcs' : 'local'
  });
});

app.get('/api/neighbors', async (req, res) => {
  const neighbors = (await loadNeighbors())
    .filter((neighbor) => neighbor.status === 'approved')
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  res.json({ neighbors });
});

app.get('/api/admin/neighbors', requireAdmin, async (req, res) => {
  const neighbors = (await loadNeighbors())
    .slice()
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  res.json({ neighbors });
});

app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

app.post('/api/neighbors', upload.single('photo'), async (req, res) => {
  const name = readTextField(req.body.name, 'Name', 60);
  const description = readTextField(req.body.description || req.body.intro, 'Description', 100);
  const address = readTextField(req.body.address, 'House or address', 100);
  const interests = parseInterests(req.body.interests);
  const phone = readTextField(req.body.phone, 'Phone number', 30);
  const email = readTextField(req.body.email, 'Email address', 120);
  const petNames = readTextField(req.body.petNames, 'Pet names', 120);

  if (!name) {
    throw new Error('Name is required.');
  }

  const photoUrl = await saveUploadedPhoto(req.file, name);
  const neighbor = {
    id: crypto.randomUUID(),
    name,
    description,
    address,
    interests,
    phone,
    email,
    petNames,
    photoUrl,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  const neighbors = await loadNeighbors();
  neighbors.unshift(neighbor);
  await saveNeighbors(neighbors);

  res.status(201).json({ neighbor });
});

app.post('/api/admin/neighbors/:id/approve', requireAdmin, async (req, res) => {
  const neighbors = await loadNeighbors();
  const neighbor = neighbors.find((entry) => entry.id === req.params.id);

  if (!neighbor) {
    throw createHttpError(404, 'Neighbor not found.');
  }

  neighbor.status = 'approved';
  await saveNeighbors(neighbors);

  res.json({ neighbor });
});

app.post('/api/admin/neighbors/:id/reject', requireAdmin, async (req, res) => {
  const neighbors = await loadNeighbors();
  const neighbor = neighbors.find((entry) => entry.id === req.params.id);

  if (!neighbor) {
    throw createHttpError(404, 'Neighbor not found.');
  }

  neighbor.status = 'rejected';
  await saveNeighbors(neighbors);

  res.json({ neighbor });
});

app.delete('/api/admin/neighbors/:id/photo', requireAdmin, async (req, res) => {
  const neighbors = await loadNeighbors();
  const neighbor = neighbors.find((entry) => entry.id === req.params.id);

  if (!neighbor) {
    throw createHttpError(404, 'Neighbor not found.');
  }

  if (!neighbor.photoUrl) {
    res.json({ neighbor });
    return;
  }

  if (!neighbor.description) {
    throw createHttpError(400, 'Cannot remove the photo unless this profile has a description. Delete the profile instead.');
  }

  await deleteUploadedPhoto(neighbor.photoUrl);
  neighbor.photoUrl = null;
  await saveNeighbors(neighbors);

  res.json({ neighbor });
});

app.delete('/api/admin/neighbors/:id/name', requireAdmin, async (req, res) => {
  const neighbors = await loadNeighbors();
  const neighbor = neighbors.find((entry) => entry.id === req.params.id);

  if (!neighbor) {
    throw createHttpError(404, 'Neighbor not found.');
  }

  neighbor.name = 'Neighbor';
  await saveNeighbors(neighbors);

  res.json({ neighbor });
});

app.delete('/api/admin/neighbors/:id', requireAdmin, async (req, res) => {
  const neighbors = await loadNeighbors();
  const index = neighbors.findIndex((entry) => entry.id === req.params.id);

  if (index === -1) {
    throw createHttpError(404, 'Neighbor not found.');
  }

  const [deletedNeighbor] = neighbors.splice(index, 1);
  await deleteUploadedPhoto(deletedNeighbor.photoUrl);
  await saveNeighbors(neighbors);

  res.json({ deletedId: deletedNeighbor.id });
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'Photo must be 25 MB or smaller.' });
    return;
  }

  res.status(error.statusCode || 400).json({ error: error.message });
});

async function start() {
  await ensureDataStoreInitialized();
  app.listen(port, () => {
    console.log(`Neighborhood Who's Who app running at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
