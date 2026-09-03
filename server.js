const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3010;
const adminCode = process.env.ADMIN_CODE || 'dan';
const publicDir = path.join(__dirname, 'public');
const uploadsDir = path.join(publicDir, 'uploads');
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'neighbors.json');

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, '[]\n');
}

function loadNeighbors() {
  const fileContents = fs.readFileSync(dataFile, 'utf8');
  return JSON.parse(fileContents).map((neighbor) => ({
    ...neighbor,
    description: neighbor.description || neighbor.intro || ''
  }));
}

function saveNeighbors(neighbors) {
  fs.writeFileSync(dataFile, `${JSON.stringify(neighbors, null, 2)}\n`);
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function deleteUploadedPhoto(photoUrl) {
  if (!photoUrl) {
    return;
  }

  const resolvedUploadsDir = path.resolve(uploadsDir);
  const resolvedPhotoPath = path.resolve(publicDir, `.${photoUrl}`);

  if (!resolvedPhotoPath.startsWith(`${resolvedUploadsDir}${path.sep}`)) {
    throw createHttpError(400, 'Invalid uploaded photo path.');
  }

  fs.rmSync(resolvedPhotoPath, { force: true });
}

function sanitizeFilenamePart(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase() || '.jpg';
    const namePart = sanitizeFilenamePart(req.body.name || 'neighbor');
    callback(null, `${namePart || 'neighbor'}-${crypto.randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
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

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/neighbors', (req, res) => {
  const neighbors = loadNeighbors()
    .slice()
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  res.json({ neighbors });
});

app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

app.post('/api/neighbors', upload.single('photo'), (req, res, next) => {
  try {
    const name = readTextField(req.body.name, 'Name', 60);
    const description = readTextField(req.body.description || req.body.intro, 'Description', 100);
    const address = readTextField(req.body.address, 'House or address', 100);
    const interests = parseInterests(req.body.interests);

    if (!name) {
      throw new Error('Name is required.');
    }

    if (!address) {
      throw new Error('House or address is required.');
    }

    if (!req.file && !description) {
      throw new Error('Either a photo or a description is required.');
    }

    const neighbor = {
      id: crypto.randomUUID(),
      name,
      description,
      address,
      interests,
      photoUrl: req.file ? `/uploads/${req.file.filename}` : null,
      createdAt: new Date().toISOString()
    };

    const neighbors = loadNeighbors();
    neighbors.unshift(neighbor);
    saveNeighbors(neighbors);

    res.status(201).json({ neighbor });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/neighbors/:id/photo', requireAdmin, (req, res, next) => {
  try {
    const neighbors = loadNeighbors();
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

    deleteUploadedPhoto(neighbor.photoUrl);
    neighbor.photoUrl = null;
    saveNeighbors(neighbors);

    res.json({ neighbor });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/neighbors/:id/name', requireAdmin, (req, res, next) => {
  try {
    const neighbors = loadNeighbors();
    const neighbor = neighbors.find((entry) => entry.id === req.params.id);

    if (!neighbor) {
      throw createHttpError(404, 'Neighbor not found.');
    }

    neighbor.name = 'Neighbor';
    saveNeighbors(neighbors);

    res.json({ neighbor });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/neighbors/:id', requireAdmin, (req, res, next) => {
  try {
    const neighbors = loadNeighbors();
    const index = neighbors.findIndex((entry) => entry.id === req.params.id);

    if (index === -1) {
      throw createHttpError(404, 'Neighbor not found.');
    }

    const [deletedNeighbor] = neighbors.splice(index, 1);
    deleteUploadedPhoto(deletedNeighbor.photoUrl);
    saveNeighbors(neighbors);

    res.json({ deletedId: deletedNeighbor.id });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (req.file) {
    fs.rmSync(req.file.path, { force: true });
  }

  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'Photo must be 5 MB or smaller.' });
    return;
  }

  res.status(error.statusCode || 400).json({ error: error.message });
});

app.listen(port, () => {
  console.log(`Neighborhood Who's Who app running at http://localhost:${port}`);
});
