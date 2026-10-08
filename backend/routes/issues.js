const express = require('express');
const database = require('../database');

const router = express.Router();

const ALLOWED_STATUSES = new Set(['issued', 'returned']);

function isMissing(value) {
  return value === undefined || value === null;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function parsePositiveIntegerParam(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return isPositiveInteger(parsed) ? parsed : null;
}

function httpError(statusCode, message, extra) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (extra) {
    Object.assign(error, extra);
  }
  return error;
}

function sendError(res, error, fallbackMessage) {
  const status = error.statusCode || 500;
  const body = {
    error: error.statusCode ? error.message : fallbackMessage
  };

  if (error.unavailable_parts) {
    body.unavailable_parts = error.unavailable_parts;
  }

  return res.status(status).json(body);
}

function mapIssue(row) {
  return {
    id: row.id,
    part_id: row.part_id,
    kit_id: row.kit_id,
    part_name: row.part_name,
    kit_name: row.kit_name,
    member_name: row.member_name,
    registration_number: row.registration_number,
    due_date: row.due_date,
    issued_at: row.issued_at,
    returned_at: row.returned_at,
    status: row.status,
    quantity: row.quantity
  };
}

const issueSelectSql = `
  SELECT
    issues.id,
    issues.part_id,
    issues.kit_id,
    parts.name AS part_name,
    kits.name AS kit_name,
    issues.member_name,
    issues.registration_number,
    issues.due_date,
    issues.issued_at,
    issues.returned_at,
    issues.status,
    issues.quantity
  FROM issues
  LEFT JOIN parts ON parts.id = issues.part_id
  LEFT JOIN kits ON kits.id = issues.kit_id
`;

const selectIssueById = database.prepare(`${issueSelectSql} WHERE issues.id = ?`);

const selectPartById = database.prepare(`
  SELECT id, available_quantity
  FROM parts
  WHERE id = ?
`);

const selectKitById = database.prepare(`
  SELECT id, name
  FROM kits
  WHERE id = ?
`);

const selectKitComponents = database.prepare(`
  SELECT
    kit_parts.part_id,
    kit_parts.quantity,
    parts.id AS existing_part_id,
    parts.name AS part_name,
    parts.available_quantity
  FROM kit_parts
  LEFT JOIN parts ON parts.id = kit_parts.part_id
  WHERE kit_parts.kit_id = ?
  ORDER BY kit_parts.part_id ASC
`);

const insertPartIssue = database.prepare(`
  INSERT INTO issues (
    part_id,
    kit_id,
    member_name,
    registration_number,
    due_date,
    issued_at,
    returned_at,
    status,
    quantity
  )
  VALUES (?, NULL, ?, ?, ?, ?, NULL, 'issued', ?)
`);

const insertKitIssue = database.prepare(`
  INSERT INTO issues (
    part_id,
    kit_id,
    member_name,
    registration_number,
    due_date,
    issued_at,
    returned_at,
    status,
    quantity
  )
  VALUES (NULL, ?, ?, ?, ?, ?, NULL, 'issued', 1)
`);

const decreaseAvailableQuantity = database.prepare(`
  UPDATE parts
  SET available_quantity = available_quantity - ?
  WHERE id = ? AND available_quantity >= ?
`);

const restoreAvailableQuantity = database.prepare(`
  UPDATE parts
  SET available_quantity = available_quantity + ?
  WHERE id = ?
`);

const markIssueReturned = database.prepare(`
  UPDATE issues
  SET returned_at = ?, status = 'returned'
  WHERE id = ? AND status = 'issued' AND returned_at IS NULL
`);

function loadKitComponentsOrThrow(kitId) {
  const kit = selectKitById.get(kitId);
  if (!kit) {
    throw httpError(400, 'kit does not exist');
  }

  const components = selectKitComponents.all(kitId);
  if (components.length === 0) {
    throw httpError(400, 'kit has no components');
  }

  const missingParts = components.filter((component) => component.existing_part_id === null);
  if (missingParts.length > 0) {
    throw httpError(400, 'kit cannot be issued because one or more components refer to a missing part');
  }

  return { kit, components };
}

function findUnavailableComponents(components) {
  return components
    .filter((component) => component.available_quantity < component.quantity)
    .map((component) => ({
      id: component.part_id,
      name: component.part_name,
      required: component.quantity,
      available: component.available_quantity
    }));
}

const createPartIssue = database.transaction((partId, memberName, registrationNumber, dueDate, quantity, issuedAt) => {
  const part = selectPartById.get(partId);
  if (!part) {
    throw httpError(400, 'part_id does not exist');
  }

  if (part.available_quantity < quantity) {
    throw httpError(400, 'requested quantity exceeds available stock');
  }

  const inserted = insertPartIssue.run(
    partId,
    memberName,
    registrationNumber,
    dueDate,
    issuedAt,
    quantity
  );

  const stockUpdate = decreaseAvailableQuantity.run(quantity, partId, quantity);
  if (stockUpdate.changes !== 1) {
    throw httpError(400, 'requested quantity exceeds available stock');
  }

  return inserted.lastInsertRowid;
});

const createKitIssue = database.transaction((kitId, memberName, registrationNumber, dueDate, issuedAt) => {
  const { components } = loadKitComponentsOrThrow(kitId);
  const unavailableParts = findUnavailableComponents(components);

  if (unavailableParts.length > 0) {
    throw httpError(
      400,
      'kit cannot be issued because one or more parts are unavailable',
      { unavailable_parts: unavailableParts }
    );
  }

  for (const component of components) {
    const stockUpdate = decreaseAvailableQuantity.run(
      component.quantity,
      component.part_id,
      component.quantity
    );

    if (stockUpdate.changes !== 1) {
      throw httpError(
        400,
        'kit cannot be issued because one or more parts are unavailable'
      );
    }
  }

  const inserted = insertKitIssue.run(
    kitId,
    memberName,
    registrationNumber,
    dueDate,
    issuedAt
  );

  return inserted.lastInsertRowid;
});

const returnIssue = database.transaction((issueId, returnedAt) => {
  const issue = selectIssueById.get(issueId);
  if (!issue) {
    throw httpError(404, 'issue not found');
  }

  if (issue.status !== 'issued' || issue.returned_at !== null) {
    throw httpError(400, 'issue has already been returned');
  }

  const isPartIssue = issue.part_id !== null && issue.kit_id === null;
  const isKitIssue = issue.kit_id !== null && issue.part_id === null;

  if (!isPartIssue && !isKitIssue) {
    throw httpError(400, 'issue is not a valid part or kit issue');
  }

  if (isPartIssue) {
    const stockUpdate = restoreAvailableQuantity.run(issue.quantity, issue.part_id);
    if (stockUpdate.changes !== 1) {
      throw httpError(400, 'unable to restore part stock');
    }
  } else {
    const { components } = loadKitComponentsOrThrow(issue.kit_id);

    for (const component of components) {
      const stockUpdate = restoreAvailableQuantity.run(component.quantity, component.part_id);
      if (stockUpdate.changes !== 1) {
        throw httpError(400, 'unable to restore kit component stock');
      }
    }
  }

  const issueUpdate = markIssueReturned.run(returnedAt, issueId);
  if (issueUpdate.changes !== 1) {
    throw httpError(400, 'issue has already been returned');
  }
});

router.get('/', (req, res) => {
  const { status } = req.query;

  if (!isMissing(status) && !ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({ error: 'status must be issued or returned' });
  }

  let sql = issueSelectSql;
  const params = [];
  if (!isMissing(status)) {
    sql += ' WHERE issues.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY issues.id DESC';

  const issues = database.prepare(sql).all(...params).map(mapIssue);
  res.json({ issues });
});

router.post('/kit', (req, res) => {
  const { kit_id, member_name, registration_number, due_date } = req.body || {};

  if (isMissing(kit_id) || !isPositiveInteger(kit_id)) {
    return res.status(400).json({ error: 'kit_id is required and must be a positive integer' });
  }

  if (isMissing(member_name) || !isNonEmptyString(member_name)) {
    return res.status(400).json({ error: 'member_name is required' });
  }

  if (isMissing(registration_number) || !isNonEmptyString(registration_number)) {
    return res.status(400).json({ error: 'registration_number is required' });
  }

  if (isMissing(due_date) || !isNonEmptyString(due_date)) {
    return res.status(400).json({ error: 'due_date is required' });
  }

  try {
    const issueId = createKitIssue(
      kit_id,
      member_name.trim(),
      registration_number.trim(),
      due_date.trim(),
      new Date().toISOString()
    );

    res.status(201).json({ issue: mapIssue(selectIssueById.get(issueId)) });
  } catch (error) {
    return sendError(res, error, 'unable to create kit issue');
  }
});

router.post('/', (req, res) => {
  const { part_id, member_name, registration_number, due_date, quantity, kit_id } = req.body || {};

  if (isMissing(part_id) || !isPositiveInteger(part_id)) {
    return res.status(400).json({ error: 'part_id is required and must be a positive integer' });
  }

  if (isMissing(member_name) || !isNonEmptyString(member_name)) {
    return res.status(400).json({ error: 'member_name is required' });
  }

  if (isMissing(registration_number) || !isNonEmptyString(registration_number)) {
    return res.status(400).json({ error: 'registration_number is required' });
  }

  if (isMissing(due_date) || !isNonEmptyString(due_date)) {
    return res.status(400).json({ error: 'due_date is required' });
  }

  if (isMissing(quantity) || !isPositiveInteger(quantity)) {
    return res.status(400).json({ error: 'quantity is required and must be a positive integer' });
  }

  if (!isMissing(kit_id)) {
    return res.status(400).json({ error: 'kit_id is not allowed for individual part issues' });
  }

  try {
    const issueId = createPartIssue(
      part_id,
      member_name.trim(),
      registration_number.trim(),
      due_date.trim(),
      quantity,
      new Date().toISOString()
    );

    res.status(201).json({ issue: mapIssue(selectIssueById.get(issueId)) });
  } catch (error) {
    return sendError(res, error, 'unable to create issue');
  }
});

router.patch('/:id/return', (req, res) => {
  const issueId = parsePositiveIntegerParam(req.params.id);
  if (!issueId) {
    return res.status(400).json({ error: 'issue id must be a positive integer' });
  }

  try {
    returnIssue(issueId, new Date().toISOString());
    res.json({ issue: mapIssue(selectIssueById.get(issueId)) });
  } catch (error) {
    return sendError(res, error, 'unable to return issue');
  }
});

module.exports = router;
