const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
  } catch {
    const error = new Error('Unable to connect to the PartsPal server.');
    error.code = 'NETWORK';
    throw error;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.error || 'Unable to complete the request.');
    error.code = 'HTTP';
    error.status = response.status;
    throw error;
  }

  return data;
}

export function getParts() {
  return request('/api/parts');
}

export function getKits() {
  return request('/api/kits');
}

export function createKit(kit) {
  return request('/api/kits', {
    method: 'POST',
    body: JSON.stringify(kit)
  });
}

export function getIssues(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/api/issues${query}`);
}

export function createPart(part) {
  return request('/api/parts', {
    method: 'POST',
    body: JSON.stringify(part)
  });
}

export function createIssue(issue) {
  return request('/api/issues', {
    method: 'POST',
    body: JSON.stringify(issue)
  });
}

export function createKitIssue(issue) {
  return request('/api/issues/kit', {
    method: 'POST',
    body: JSON.stringify(issue)
  });
}

export function returnIssue(issueId) {
  return request(`/api/issues/${encodeURIComponent(issueId)}/return`, {
    method: 'PATCH'
  });
}
