import { Router } from 'express';
import {
  authenticateUser,
  clearSession,
  issueSession,
  requireAuth,
  setPermanentPassword,
  updateLastLogin,
} from '../auth.js';
import { clubDisplayName } from '../lib/bookings-domain.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await authenticateUser(username, password);
    if (!result) return res.status(401).json({ error: 'Invalid username or password' });

    const { user, mustChangePassword } = result;
    issueSession(res, user);
    if (!mustChangePassword) await updateLastLogin(user.id);

    res.json({ user: publicUser(user), mustChangePassword });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  const { newPassword } = req.body ?? {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    await setPermanentPassword(Number(req.user.sub), newPassword);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: Number(req.user.sub),
      username: req.user.username,
      fullName: req.user.fullName,
      customerId: req.user.customerId,
      clubName: clubDisplayName(req.user.customerId),
    },
  });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    customerId: user.customer_id,
    clubName: clubDisplayName(user.customer_id),
  };
}

export default router;
