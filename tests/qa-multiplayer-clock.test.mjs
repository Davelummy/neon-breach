import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('short-round preload refuses production and standalone server invocation',()=>{
  for(const NODE_ENV of ['production','test']){
    const result=spawnSync(process.execPath,['--import','./scripts/qa-multiplayer-clock.mjs','--eval',''],{env:{NODE_ENV,HOST:'127.0.0.1'},encoding:'utf8',timeout:5000});
    assert.notEqual(result.status,0);assert.match(result.stderr,/QA clock requires an isolated loopback test child with IPC/);
  }
});
