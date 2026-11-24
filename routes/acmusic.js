'use strict';

const express = require('express');
const ensureAuth = require('../middleware/auth');
const { searchMusic } = require('../services/music');

const router = express.Router();
router.use(ensureAuth);

router.get('/search', async (req, res, next) => {
  try {
    const result = await searchMusic(req.query.q);
    res.set('Cache-Control', 'private, max-age=30');
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
