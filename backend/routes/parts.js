const express = require('express');
const database = require('../database');

const router = express.Router();

function isMissing(value) {
  return value === undefined || value === null;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

router.get('/', (req, res) => {
  const parts = database.prepare(`
    SELECT id, name, category, total_quantity, available_quantity, created_at
    FROM parts
    ORDER BY id ASC
  `).all();

  res.json({ parts });
});

router.post('/', (req, res) => {
  const { name, category, total_quantity } = req.body || {};

  if (isMissing(name) || !isNonEmptyString(name)) {
    return res.status(400).json({ error: 'name is required' });
  }

  if (isMissing(category) || !isNonEmptyString(category)) {
    return res.status(400).json({ error: 'category is required' });
  }

  if (isMissing(total_quantity)) {
    return res.status(400).json({ error: 'total_quantity is required' });
  }

  if (!isNonNegativeInteger(total_quantity)) {
    return res.status(400).json({ error: 'total_quantity must be a non-negative integer' });
  }

  const createdAt = new Date().toISOString();
  const result = database.prepare(`
    INSERT INTO parts (name, category, total_quantity, available_quantity, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(name.trim(), category.trim(), total_quantity, total_quantity, createdAt);

  const part = database.prepare(`
    SELECT id, name, category, total_quantity, available_quantity, created_at
    FROM parts
    WHERE id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ part });
});

module.exports = router;
