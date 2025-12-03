import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const LOG_FILE = path.join(DATA_DIR, 'log.json');
const MAX_USER_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 500;

const escapeHtml = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

class FileLogRepository {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, '[]', 'utf-8');
    }
  }

  async getEntries() {
    const content = await fs.readFile(this.filePath, 'utf-8');
    const entries = JSON.parse(content);
    return entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  async addEntry(entry) {
    const entries = await this.getEntries();
    entries.push(entry);
    await fs.writeFile(this.filePath, JSON.stringify(entries, null, 2), 'utf-8');
    return entry;
  }
}

const repository = new FileLogRepository(LOG_FILE);
await repository.init();

const serveStaticFile = async (filePath, res) => {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType =
      ext === '.html'
        ? 'text/html; charset=utf-8'
        : ext === '.css'
          ? 'text/css; charset=utf-8'
          : ext === '.js'
            ? 'application/javascript; charset=utf-8'
            : 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      console.error(err);
      res.writeHead(500);
      res.end('Server Error');
    }
  }
};

const collectRequestBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
};

const validateEntry = ({ user, message }) => {
  if (typeof user !== 'string' || typeof message !== 'string') {
    return { valid: false, error: 'Fields "user" and "message" must be strings.' };
  }

  const trimmedUser = user.trim();
  const trimmedMessage = message.trim();

  if (!trimmedUser || !trimmedMessage) {
    return { valid: false, error: 'Both "user" and "message" are required.' };
  }

  if (trimmedUser.length > MAX_USER_LENGTH) {
    return { valid: false, error: `User is limited to ${MAX_USER_LENGTH} characters.` };
  }

  if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Message is limited to ${MAX_MESSAGE_LENGTH} characters.` };
  }

  return {
    valid: true,
    sanitized: {
      user: escapeHtml(trimmedUser),
      message: escapeHtml(trimmedMessage),
    },
  };
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/entries') {
    try {
      const entries = await repository.getEntries();
      sendJson(res, 200, entries);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: 'Failed to read entries.' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/entries') {
    try {
      const rawBody = await collectRequestBody(req);
      const parsed = JSON.parse(rawBody || '{}');
      const validation = validateEntry(parsed);

      if (!validation.valid) {
        sendJson(res, 400, { error: validation.error });
        return;
      }

      const entry = {
        ...validation.sanitized,
        timestamp: new Date().toISOString(),
      };

      await repository.addEntry(entry);
      sendJson(res, 201, entry);
    } catch (err) {
      console.error(err);
      sendJson(res, 400, { error: 'Invalid request payload.' });
    }
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const filePath = path.join(__dirname, urlPath.slice(1));
    const normalizedPath = path.normalize(filePath);

    if (!normalizedPath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    await serveStaticFile(normalizedPath, res);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
