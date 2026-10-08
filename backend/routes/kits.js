const express = require('express');
const database = require('../database');

const router = express.Router();

function isMissing(value) {
  return value === undefined || value === null;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function getKitWithParts(kitId) {
  const kit = database.prepare(`
    SELECT id, name, description, created_at
    FROM kits
    WHERE id = ?
  `).get(kitId);

  if (!kit) {
    return null;
  }

  kit.parts = database.prepare(`
    SELECT parts.id, parts.name, kit_parts.quantity
    FROM kit_parts
    INNER JOIN parts ON parts.id = kit_parts.part_id
    WHERE kit_parts.kit_id = ?
    ORDER BY parts.id ASC
  `).all(kitId);

  return kit;
}

const insertKit = database.prepare(`
  INSERT INTO kits (name, description, created_at)
  VALUES (?, ?, ?)
`);

const insertKitPart = database.prepare(`
  INSERT INTO kit_parts (kit_id, part_id, quantity)
  VALUES (?, ?, ?)
`);

const findPartById = database.prepare(`
  SELECT id FROM parts WHERE id = ?
`);

const createKitTransaction = database.transaction((name, description, parts, createdAt) => {
  const result = insertKit.run(name, description, createdAt);
  const kitId = result.lastInsertRowid;

  for (const part of parts) {
    insertKitPart.run(kitId, part.part_id, part.quantity);
  }

  return kitId;
});

router.get('/', (req, res) => {
  const kits = database.prepare(`
    SELECT id, name, description, created_at
    FROM kits
    ORDER BY id ASC
  `).all();

  const kitParts = database.prepare(`
    SELECT kit_parts.kit_id, parts.id, parts.name, kit_parts.quantity
    FROM kit_parts
    INNER JOIN parts ON parts.id = kit_parts.part_id
    ORDER BY kit_parts.kit_id ASC, parts.id ASC
  `).all();

  const partsByKitId = new Map();
  for (const row of kitParts) {
    if (!partsByKitId.has(row.kit_id)) {
      partsByKitId.set(row.kit_id, []);
    }
    partsByKitId.get(row.kit_id).push({
      id: row.id,
      name: row.name,
      quantity: row.quantity
    });
  }

  const payload = kits.map((kit) => ({
    ...kit,
    parts: partsByKitId.get(kit.id) || []
  }));

  res.json({ kits: payload });
});

router.post('/', (req, res) => {
  const { name, description, parts } = req.body || {};

  if (isMissing(name) || !isNonEmptyString(name)) {
    return res.status(400).json({ error: 'name is required' });
  }

  if (!isMissing(description) && typeof description !== 'string') {
    return res.status(400).json({ error: 'description must be a string' });
  }

  if (isMissing(parts) || !Array.isArray(parts) || parts.length === 0) {
    return res.status(400).json({ error: 'parts must be a non-empty array' });
  }

  const seenPartIds = new Set();

  for (const item of parts) {
    if (!item || isMissing(item.part_id) || !isPositiveInteger(item.part_id)) {
      return res.status(400).json({ error: 'each part_id must be a positive integer' });
    }

    if (isMissing(item.quantity) || !isPositiveInteger(item.quantity)) {
      return res.status(400).json({ error: 'each quantity must be a positive integer' });
    }

    if (seenPartIds.has(item.part_id)) {
      return res.status(400).json({ error: 'duplicate part_id is not allowed' });
    }

    seenPartIds.add(item.part_id);

    const existingPart = findPartById.get(item.part_id);
    if (!existingPart) {
      return res.status(400).json({ error: `part_id ${item.part_id} does not exist` });
    }
  }

  const createdAt = new Date().toISOString();
  const descriptionValue = isMissing(description) || description.trim() === ''
    ? null
    : description.trim();

  const kitId = createKitTransaction(
    name.trim(),
    descriptionValue,
    parts,
    createdAt
  );

  res.status(201).json({ kit: getKitWithParts(kitId) });
});

module.exports = router;
