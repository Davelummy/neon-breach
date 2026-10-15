import {existsSync,globSync} from 'node:fs';
import {homedir} from 'node:os';
export function qaBrowserPath(){
 const candidates=[process.env.CHROME_PATH,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser',...globSync(`${homedir()}/.cache/puppeteer/chrome-headless-shell/*/*/chrome-headless-shell`)];
 const found=candidates.find(p=>p&&existsSync(p));if(!found)throw Error('Chrome not found. Set CHROME_PATH to an installed Chrome executable.');return found;
}
