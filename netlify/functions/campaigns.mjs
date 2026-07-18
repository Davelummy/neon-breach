const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, accept',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8'
};

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      available: false,
      error: 'Campaign cloud is optional — progress is saved on this device.'
    }),
    { status: 200, headers: corsHeaders }
  );
};

export const config = { path: '/api/campaigns' };
