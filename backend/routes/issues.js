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

function mapIssue(row) {
  return {
    id: row.id,
    part_id: row.part_id,
    kit_id: row.kit_id,
    part_name: row.part_name,
    member_name: row.member_name,
    registration_number: row.registration_number,
    due_date: row.due_date,
    issued_at: row.issued_at,
    returned_at: row.returned_at,
    status: row.status,
    quantity: row.quantity
  };
}

const selectIssueById = database.prepare(`
  SELECT
    issues.id,
    issues.part_id,
    issues.kit_id,
    parts.name AS part_name,
    issues.member_name,
    issues.registration_number,
    issues.due_date,
    issues.issued_at,
    issues.returned_at,
    issues.status,
    issues.quantity
  FROM issues
  LEFT JOIN parts ON parts.id = issues.part_id
  WHERE issues.id = ?
`);

const selectPartById = database.prepare(`
  SELECT id, available_quantity
  FROM parts
  WHERE id = ?
`);

const insertIssue = database.prepare(`
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
  WHERE id = ? AND status = 'issued' AND kit_id IS NULL AND part_id IS NOT NULL AND returned_at IS NULL
`);

const createPartIssue = database.transaction((partId, memberName, registrationNumber, dueDate, quantity, issuedAt) => {
  const part = selectPartById.get(partId);
  if (!part) {
    const error = new Error('part_id does not exist');
    error.statusCode = 400;
    throw error;
  }

  if (part.available_quantity < quantity) {
    const error = new Error('requested quantity exceeds available stock');
    error.statusCode = 400;
    throw error;
  }

  const inserted = insertIssue.run(
    partId,
    memberName,
    registrationNumber,
    dueDate,
    issuedAt,
    quantity
  );

  const stockUpdate = decreaseAvailableQuantity.run(quantity, partId, quantity);
  if (stockUpdate.changes !== 1) {
    const error = new Error('requested quantity exceeds available stock');
    error.statusCode = 400;
    throw error;
  }

  return inserted.lastInsertRowid;
});

const returnPartIssue = database.transaction((issueId, returnedAt) => {
  const issue = selectIssueById.get(issueId);
  if (!issue) {
    const error = new Error('issue not found');
    error.statusCode = 404;
    throw error;
  }

  if (issue.kit_id !== null || issue.part_id === null) {
    const error = new Error('issue is not an individual part issue');
    error.statusCode = 400;
    throw error;
  }

  if (issue.status !== 'issued' || issue.returned_at !== null) {
    const error = new Error('issue has already been returned');
    error.statusCode = 400;
    throw error;
  }

  const issueUpdate = markIssueReturned.run(returnedAt, issueId);
  if (issueUpdate.changes !== 1) {
    const error = new Error('issue has already been returned');
    error.statusCode = 400;
    throw error;
  }

  const stockUpdate = restoreAvailableQuantity.run(issue.quantity, issue.part_id);
  if (stockUpdate.changes !== 1) {
    const error = new Error('unable to restore part stock');
    error.statusCode = 400;
    throw error;
  }
});

router.get('/', (req, res) => {
  const { status } = req.query;

  if (!isMissing(status) && !ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({ error: 'status must be issued or returned' });
  }

  let sql = `
    SELECT
      issues.id,
      issues.part_id,
      issues.kit_id,
      parts.name AS part_name,
      issues.member_name,
      issues.registration_number,
      issues.due_date,
      issues.issued_at,
      issues.returned_at,
      issues.status,
      issues.quantity
    FROM issues
    LEFT JOIN parts ON parts.id = issues.part_id
  `;

  const params = [];
  if (!isMissing(status)) {
    sql += ' WHERE issues.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY issues.id DESC';

  const issues = database.prepare(sql).all(...params).map(mapIssue);
  res.json({ issues });
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
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'unable to create issue'
    });
  }
});

router.patch('/:id/return', (req, res) => {
  const issueId = parsePositiveIntegerParam(req.params.id);
  if (!issueId) {
    return res.status(400).json({ error: 'issue id must be a positive integer' });
  }

  try {
    returnPartIssue(issueId, new Date().toISOString());
    res.json({ issue: mapIssue(selectIssueById.get(issueId)) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'unable to return issue'
    });
  }
});

module.exports = router;
