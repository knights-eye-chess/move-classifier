import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {Stockfish,searchCommand} from './helpers/corpus-engine.mjs';
const base={mode:'wall',positionMovetimeMs:3000,restrictedMovetimeMs:3000,threads:1,hashMb:16};

test('independent search budgets preserve roots and requested depth',()=>{
 assert.equal(searchCommand(15,[],false,base),'go depth 15 movetime 3000');
 assert.equal(searchCommand(10,['e2e4'],true,{...base,mode:'depth'}),'go depth 10 searchmoves e2e4');
 assert.equal(searchCommand(15,[],false,{...base,mode:'nodes',nodeLimit:12345}),'go depth 15 nodes 12345');
 assert.throws(()=>searchCommand(15,[],false,{...base,mode:'nodes'}));
 assert.throws(()=>searchCommand(15,[],false,{...base,mode:'unknown'}));
});

for(const responsive of [true,false]) test(`watchdog rejects late evidence and discards ${responsive?'responsive':'hung'} engine`,{timeout:5000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ke-corpus-fake-'));let engine;
 try {
  const entry=join(dir,'engine.cjs');
  await writeFile(entry,`require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
    if(line==='uci') console.log('id name watchdog fixture\\nuciok');
    if(line==='isready') console.log('readyok');
    if(line==='stop' && ${responsive}) console.log('info depth 15 multipv 1 score cp 10 nodes 100 pv e2e4\\nbestmove e2e4');
    if(line==='quit' && ${responsive}) process.exit(0);
  });`);
  engine=new Stockfish(entry,{...base,watchdogMs:2000,stopGraceMs:100});
  await engine.init();engine.budget.watchdogMs=100;
  const exited=once(engine.process,'exit');
  await assert.rejects(engine.analyze('synthetic',15),/watchdog expired/);
  await assert.rejects(engine.analyze('synthetic',15),/watchdog expired/);
  const [code,signal]=await exited;
  if(!responsive) assert.equal(signal,'SIGKILL');else assert.equal(code,0);
  assert.equal(engine.searches.length,1);assert.equal(engine.searches[0].failed,true);
  assert.equal(engine.searches[0].candidates,undefined,'partial or late results must never be admitted');
 }finally{engine?.close();await rm(dir,{recursive:true,force:true});}
});

test('search receipts retain cumulative nodes, scores, PVs and under-depth status',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ke-corpus-receipt-'));let engine;
 try {
  const entry=join(dir,'engine.cjs');
  await writeFile(entry,`require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
   if(line==='uci')console.log('uciok');if(line==='isready')console.log('readyok');
   if(line.startsWith('go '))console.log('info depth 9 multipv 1 score cp 20 nodes 90 time 15 nps 6000 hashfull 1 pv e2e4 e7e5\\ninfo depth 10 multipv 1 score cp 21 nodes 110 time 20 nps 5500 hashfull 2 pv e2e4 e7e5\\nbestmove e2e4');
   if(line==='quit')process.exit(0);
  });`);
  engine=new Stockfish(entry,{...base,mode:'nodes',nodeLimit:100});await engine.init();
  await assert.rejects(engine.analyze('synthetic',15,['e2e4'],true),/evidence not admitted/);
  const receipt=engine.searches[0];assert.equal(receipt.achievedDepth,10);assert.equal(receipt.candidates[0].scoreCp,21);assert.equal(receipt.failed,true);assert.equal(receipt.nodes,110);assert.equal(receipt.capLimited,true);
  assert.equal(receipt.restricted,true);assert.deepEqual(receipt.roots,['e2e4']);
  assert.equal(receipt.command,'go depth 15 nodes 100 searchmoves e2e4');
  assert.ok(receipt.transcript.every(line=>!/(time|nps|hashfull) /.test(line)));
  assert.ok(receipt.transcript.some(line=>line.includes('nodes 110')));
 }finally{engine?.close();await rm(dir,{recursive:true,force:true});}
});
