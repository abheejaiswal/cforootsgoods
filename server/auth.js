const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
const COOKIE = 'rg_token';
const isProd = process.env.NODE_ENV === 'production';

function issue(res, user) {
  const token = jwt.sign({ username: user.username, role: user.role, name: user.name }, SECRET, { expiresIn: '12h' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,          // requires HTTPS in production
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clear(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: isProd });
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { issue, clear, requireAuth, requireRole, SECRET };
