/** Optional campaign cloud — client uses localStorage when unavailable. */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, accept',
  'Cache-Control': 'no-store'
};

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
    body: JSON.stringify({
      available: false,
      error: 'Campaign cloud is optional — progress is saved on this device.'
    })
  };
}
