import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import readline from 'node:readline';

export class Stockfish {
  constructor(entry, budget) {
    this.budget = {mode:'wall',watchdogMs:30000,stopGraceMs:1000,...budget};
    searchCommand(15, [], false, this.budget); // Validate before starting a process.
    this.searches = [];
    this.process = spawn(process.execPath, [entry], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.lines = readline.createInterface({ input: this.process.stdout });
    this.waiters = [];
    this.stderr = '';
    this.failure = null;
    this.lines.on('line', line => this.receive(line.trim()));
    this.process.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-4000); });
    this.process.on('error', error => this.fail(error));
    this.process.on('exit', code => {clearTimeout(this.killTimer);this.fail(new Error(`Stockfish exited ${code}: ${this.stderr}`));});
    this.process.stdin.on('error', error => this.fail(error));
  }
  fail(error) {
    this.failure ??= error;
    for (const waiter of this.waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(this.failure); }
  }
  receive(line) {
    if (this.failure && line.startsWith('bestmove ')) { this.send('quit'); return; }
    for (const waiter of [...this.waiters]) {
      waiter.lines.push(line);
      if (!waiter.accept(line)) continue;
      clearTimeout(waiter.timer);
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      waiter.resolve({ line, lines: waiter.lines });
      break;
    }
  }
  send(command) { if (this.process.exitCode === null && !this.process.killed) this.process.stdin.write(`${command}\n`); }
  wait(accept, lines = []) {
    return new Promise((resolve, reject) => {
      if (this.failure) { reject(this.failure); return; }
      const waiter = { accept, resolve, reject, lines, timer: null };
      waiter.timer = setTimeout(() => {
        this.send('stop');
        this.fail(new Error('Stockfish watchdog expired; engine discarded'));
        this.killTimer = setTimeout(() => this.process.kill('SIGKILL'), this.budget.stopGraceMs);
        this.killTimer.unref();
      }, this.budget.watchdogMs);
      this.waiters.push(waiter);
    });
  }
  async init() {
    this.send('uci');
    const uci = await this.wait(line => line === 'uciok');
    this.engineName = uci.lines.find(line => line.startsWith('id name '))?.slice(8) || 'unknown';
    this.send(`setoption name Threads value ${this.budget.threads}`);
    this.send(`setoption name Hash value ${this.budget.hashMb}`);
    this.send('isready'); await this.wait(line => line === 'readyok');
  }
  async newGame() {
    this.send('ucinewgame');
    this.send('setoption name Clear Hash');
    this.send('isready'); await this.wait(line => line === 'readyok');
  }
  async analyze(fen, requestedDepth, roots = [], restricted = false) {
    if(this.failure) throw this.failure;
    const started = performance.now();
    this.send(`setoption name MultiPV value ${roots.length || 3}`);
    this.send(`position fen ${fen}`);
    const command = searchCommand(requestedDepth, roots, restricted, this.budget);
    this.send(command);
    const searchLines = [];
    const received = await this.wait(line => line.startsWith('bestmove '), searchLines).catch(error => {
      this.searches.push({fixture:this.fixtureName,failed:true,reason:error.message,restricted,requestedDepth,elapsedMs:Math.round(performance.now()-started),fen,roots,command,
        nodes:Math.max(0,...searchLines.map(line=>Number(/\bnodes (\d+)/.exec(line)?.[1] || 0))),
        transcript:searchLines.map(line=>line.replace(/\b(?:time|nps|hashfull) \d+\s*/g,'').trim())});
      throw new Error(`Stockfish search failed for ${command}, FEN ${fen}, roots ${roots.join(' ')}: ${error.message}`, { cause: error });
    });
    const found = new Map();
    for (const line of received.lines) {
      if (!line.startsWith('info ') || !line.includes(' pv ')) continue;
      const match = /\bdepth (\d+).*\bmultipv (\d+).*\bscore (cp|mate) (-?\d+).*\bpv (.+)/.exec(line);
      if (!match) continue;
      const [, actualDepth, rank, kind, score, pv] = match;
      if (Number(actualDepth) > requestedDepth) continue;
      const prior = found.get(Number(rank));
      if (!prior || Number(actualDepth) >= prior.depth)
        found.set(Number(rank), { multipv: Number(rank), depth: Number(actualDepth), scoreCp: kind === 'cp' ? Number(score) : null, mate: kind === 'mate' ? Number(score) : null, pv: pv.trim().split(/\s+/) });
    }
    const candidates = [...found.values()].sort((a, b) => a.multipv - b.multipv);
    assert.ok(candidates.length, `Stockfish returned no scored line by depth ${requestedDepth} for ${command} for ${fen}`);
    const achievedDepth = Math.min(...candidates.map(line => line.depth));
    this.searches.push({ fixture:this.fixtureName, restricted, requestedDepth, achievedDepth, elapsedMs: Math.round(performance.now() - started),
      rootCount: roots.length, roots, fen, command,
      nodes: Math.max(0,...received.lines.map(line=>Number(/\bnodes (\d+)/.exec(line)?.[1] || 0))),
      capLimited: this.budget.mode.startsWith('nodes') && achievedDepth < requestedDepth,
      bestmove:received.line.split(/\s+/)[1], candidates,
      transcript:received.lines.map(line=>line.replace(/\b(?:time|nps|hashfull) \d+\s*/g,'').trim()) });
    if (this.budget.mode === 'nodes' && achievedDepth < requestedDepth) {
      const error=new Error(`Fixed node budget stopped at depth ${achievedDepth}, requested ${requestedDepth}; evidence not admitted`);
      Object.assign(this.searches.at(-1),{failed:true,reason:error.message});
      this.fail(error); this.close(); throw error;
    }
    return { ...candidates[0], depth: achievedDepth, requestedDepth,
      bestmove: received.line.split(/\s+/)[1], candidates };
  }
  close() { this.send('quit'); if (!this.killTimer) {this.killTimer=setTimeout(()=>this.process.kill('SIGKILL'),this.budget.stopGraceMs);this.killTimer.unref();} }
}


export function searchCommand(depth, roots, restricted, budget) {
  assert.ok(['wall','depth','nodes','nodes-admit'].includes(budget.mode), 'Unknown corpus budget mode');
  assert.ok(Number.isSafeInteger(depth) && depth > 0, 'Invalid search depth');
  let limit='';
  if (budget.mode==='wall') {
    const time=restricted?budget.restrictedMovetimeMs:budget.positionMovetimeMs;
    assert.ok(Number.isSafeInteger(time) && time>0,'Invalid movetime');
    limit=` movetime ${time}`;
  }
  if (budget.mode.startsWith('nodes')) {
    assert.ok(Number.isSafeInteger(budget.nodeLimit) && budget.nodeLimit>0,'Invalid fixed node limit');
    limit=` nodes ${budget.nodeLimit}`;
  }
  return `go depth ${depth}${limit}${roots.length?` searchmoves ${roots.join(' ')}`:''}`;
}
