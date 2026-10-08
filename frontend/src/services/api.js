const API_BASE = 'http://localhost:5000';

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

export function createPart(part) {
  return request('/api/parts', {
    method: 'POST',
    body: JSON.stringify(part)
  });
}
