// Reference solutions for jobs 13-24.
import { D } from './run.mjs';

// A braced frame: standards at xs, lifts at ys, a ledger at every lift, a brace in every bay of every lift.
export function frame(d, xs, ys, { type = 'tube', braceType = 'tube', skipBrace = () => false, ties = [] } = {}) {
  // one lift at a time, the way the crew would: standards, ledgers, then braces
  for (let j = 0; j < ys.length - 1; j++) {
    d.t([xs[0], ys[j]], [xs[0], ys[j + 1]], type);
    for (let i = 0; i < xs.length - 1; i++) { d.t([xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], type); d.t([xs[i], ys[j + 1]], [xs[i + 1], ys[j + 1]], type); }
    for (const [tx, ty] of ties) if (ty > ys[j] && ty <= ys[j + 1]) d.tie(tx, ty);
    for (let i = 0; i < xs.length - 1; i++) {
      if (skipBrace(i, j)) continue;
      const up = (i + j) % 2 === 0;
      const a = [xs[i], ys[j]], b = [xs[i + 1], ys[j + 1]];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 3.2) continue;
      d.t(up ? a : [xs[i], ys[j + 1]], up ? b : [xs[i + 1], ys[j]], braceType);
    }
  }
  return d;
}

export const RAW2 = {
  13: () => {
    const d = frame(D(), [3, 5, 6, 8], [0, 2, 4, 6], { type: 'tube' });
    d.t([8, 6], [9, 6], 'heavy').t([8, 4], [9, 6], 'heavy');
    d.tie(3, 6).tie(6, 6).tie(8, 6).tie(8, 3).tie(3, 3);
    d.bd(3, 8, 6).bd(3, 5, 4).lad(3, 0, 4).lad(3, 4, 6);
    d.ps.push({ type: 'wheel', a: [9, 6] });
    return d.ps;
  },
  14: () => frame(D(), [2, 4, 6, 8], [0, 1, 3]).bd(2, 8, 3).lad(8, 0, 3).lock(8).ps,
  15: () => frame(D(), [3, 4, 6, 8], [0, 2, 4]).tie(3, 4).tie(8, 4).bd(3, 8, 4).bd(6, 8, 2).lad(8, 0, 2).lad(8, 2, 4).ps,
  '15weak': () => D().std(3, 0, 4).std(6, 0, 4).std(8, 0, 4).led(3, 8, 2).led(3, 8, 4).br(6, 2, 8, 4).bd(3, 8, 4).bd(6, 8, 2).lad(8, 0, 2).lad(8, 2, 4).ps,
  '15nolad': () => frame(D(), [3, 4, 6, 8], [0, 2, 4]).bd(3, 8, 4).ps,
  16: () => {
    const d = frame(D(), [2, 4, 6, 8, 10, 11], [0, 2, 4, 6]);
    d.tie(2, 6).tie(6, 6).tie(10, 6).bd(2, 11, 6).bd(8, 11, 4).lad(9, 0, 4).lad(9, 4, 6);
    d.ps.push({ type: 'chute', a: [11, 6] });
    return d.ps;
  },
  '16nochute': () => { const d = frame(D(), [2, 4, 6, 8, 10], [0, 2, 4, 6]); d.bd(2, 10, 6).bd(8, 10, 4).lad(9, 0, 4).lad(9, 4, 6); return d.ps; },
  17: () => {
    const d = frame(D(), [3, 5, 7, 9], [0, 2, 4, 5]);
    d.bd(5, 9, 5).bd(7, 9, 4).lad(9, 0, 4).lad(9, 4, 5).lock(9);
    d.ps.push({ type: 'zip', a: [9, 5] });
    return d.ps;
  },
  '17noties': () => { const d = frame(D(), [3, 5, 7, 9], [0, 2, 4, 5]); d.bd(5, 9, 5).bd(7, 9, 4).lad(9, 0, 4).lad(9, 4, 5).lock(9); d.ps.push({ type: 'zip', a: [9, 5] }); return d.ps; },
  '17thin': () => { const d = frame(D(), [5, 7, 9], [0, 2, 4, 5], { skipBrace: (i, j) => j > 0 }); d.bd(5, 9, 5).bd(7, 9, 4).lad(9, 0, 4).lad(9, 4, 5).lock(9); d.ps.push({ type: 'zip', a: [9, 5] }); return d.ps; },
  '17one': () => { const d = frame(D(), [5, 7, 9], [0, 2, 4, 5], { skipBrace: (i, j) => i === 1 }); d.bd(5, 9, 5).bd(7, 9, 4).lad(9, 0, 4).lad(9, 4, 5).lock(9); d.ps.push({ type: 'zip', a: [9, 5] }); return d.ps; },
  '17top': () => { const d = frame(D(), [5, 7, 9], [0, 2, 4, 5], { skipBrace: (i, j) => j === 2 }); d.bd(5, 9, 5).bd(7, 9, 4).lad(9, 0, 4).lad(9, 4, 5).lock(9); d.ps.push({ type: 'zip', a: [9, 5] }); return d.ps; },
  18: () => frame(D(), [2, 4, 6, 8, 10, 11], [0, 1, 3]).bd(2, 11, 3).lad(11, 0, 3).lock(11).ps,
  '18short': () => frame(D(), [2, 4, 6, 8, 10], [0, 1, 3]).bd(2, 10, 3).lad(10, 0, 3).lock(10).ps,
  '18gap': () => frame(D(), [2, 4, 6, 8, 10, 11], [0, 1, 3]).bd(2, 6, 3).bd(7, 11, 3).lad(11, 0, 3).lock(11).ps,
  19: () => frame(D(), [4, 6, 8], [0, 2, 4, 6, 7]).tie(4, 6).tie(8, 6).bd(4, 8, 7).bd(6, 8, 4).lad(8, 0, 4).lad(8, 4, 7).lock(8).ps,
  20: () => frame(D(), [1, 3, 5, 7], [0, 2, 4, 5]).bd(1, 7, 5).bd(5, 7, 4).lad(7, 0, 4).lad(7, 4, 5).lock(7).ps,
  '20short': () => frame(D(), [1, 3, 5], [0, 2, 4, 5]).tie(1, 5).tie(3, 5).bd(1, 5, 5).bd(3, 5, 4).lad(5, 0, 4).lad(5, 4, 5).lock(5).ps,
  '20noties': () => frame(D(), [1, 3, 5, 7], [0, 2, 4, 5]).bd(1, 7, 5).bd(5, 7, 4).lad(7, 0, 4).lad(7, 4, 5).lock(7).ps,
  '20thin': () => frame(D(), [1, 3, 5, 7], [0, 2, 4, 5], { skipBrace: (i, j) => j === 2 || i === 1 }).bd(1, 7, 5).bd(5, 7, 4).lad(7, 0, 4).lad(7, 4, 5).lock(7).ps,
  21: () => frame(D(), [3, 5, 7], [0, 2, 4, 6, 8], { type: 'heavy' }).tie(3, 8).tie(7, 8).tie(3, 4).bd(3, 7, 8, 'deck').bd(3, 5, 4).lad(3, 0, 4).lad(3, 4, 8).lock(3).ps,
  22: () => frame(D(), [2, 4, 6, 7], [0, 2, 3, 4, 6, 8, 9, 10, 12], { ties: [[2, 3], [7, 3], [2, 6], [4, 6], [7, 6], [2, 9], [4, 9], [7, 9], [2, 12], [4, 12], [7, 12]] })
    .bd(2, 7, 12).bd(6, 7, 4).bd(6, 7, 8).lad(7, 0, 4).lad(7, 4, 8).lad(7, 8, 12).lock(7).ps,
  23: () => frame(D(), [2, 4, 6, 8], [0, 2, 3, 4, 6, 8, 9], { ties: [[2, 3], [8, 3], [2, 6], [8, 6], [2, 9], [5, 9], [8, 9]] })
    .bd(2, 8, 9).bd(6, 8, 4).bd(6, 8, 8).lad(8, 0, 4).lad(8, 4, 8).lad(8, 8, 9).lock(8).ps,
  24: () => frame(D(), [3, 5, 7, 9], [0, 2, 4, 6, 8, 10, 12], { type: 'heavy' })
    .bd(3, 6, 12, 'deck').bd(6, 9, 12).bd(7, 9, 4).bd(7, 9, 8).lad(9, 0, 4).lad(9, 4, 8).lad(9, 8, 12).lock(9).ps,
  '24thin': () => frame(D(), [3, 5, 6], [0, 2, 4, 6, 8, 10, 12], { type: 'heavy' })
    .bd(3, 6, 12, 'deck').bd(5, 6, 4).bd(5, 6, 8).lad(6, 0, 4).lad(6, 4, 8).lad(6, 8, 12).lock(6).ps,
  '14noties': () => frame(D(), [2, 4, 6, 8], [0, 1, 3]).bd(2, 8, 3).lad(8, 0, 3).lock(8).ps,
  '14half': () => frame(D(), [2, 4, 6, 8], [0, 1, 3], { skipBrace: (i, j) => j === 1 || i === 1 }).bd(2, 8, 3).lad(8, 0, 3).lock(8).ps,
  '14one': () => frame(D(), [2, 5, 8], [0, 3], { skipBrace: (i, j) => i === 1 }).bd(2, 8, 3).lad(8, 0, 3).lock(8).ps,
  '14flop': () => D().std(2, 0, 3, 'tube', 3).std(5, 0, 3, 'tube', 3).std(8, 0, 3, 'tube', 3).led(2, 8, 3).bd(2, 8, 3).lad(8, 0, 3).ps,
};
