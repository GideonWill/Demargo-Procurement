import { Router } from 'express';
import { register, login, refresh, getProfile } from './auth.controller';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

// Route configuration
// Note: register internally checks if it is the first user (open) or subsequent users (admin required)
router.post('/register', (req, res, next) => {
  // If the request contains auth headers, authenticate them first
  if (req.headers.authorization) {
    authenticateJWT(req, res, () => register(req, res));
  } else {
    register(req, res);
  }
});

router.post('/login', login);
router.post('/refresh', refresh);
router.get('/profile', authenticateJWT, getProfile);

export default router;
