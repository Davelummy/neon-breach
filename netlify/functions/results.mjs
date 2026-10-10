import { handlePublicCommunity } from './community.mjs';
export default request => handlePublicCommunity(request, '/api/results');
export const config = { path: '/api/results' };
