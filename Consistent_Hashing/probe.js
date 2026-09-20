function distributeRange(start, end, n) {
  if (n <= 1) return [[start, end]];
  let gap = parseInt((end - start) / n);
  let ranges = [];
  for (let i = start; i < end; i += gap) ranges.push([i, i + gap]);
  return ranges;
}
console.log('n=3 over 0..10 ->', JSON.stringify(distributeRange(0,10,3)));
console.log('n=3 over 0..1024 ->', JSON.stringify(distributeRange(0,1024,3)));
console.log('gap when n > span:', parseInt((10-0)/20), '<- 0 means infinite loop');

// splice probe
const a = [1,2,3,4];
const newServer = {range:[0,1]};
a.splice(2, newServer);
console.log('after splice(2, obj):', JSON.stringify(a), 'len', a.length);

// map key probe
const m = new Map();
function hashKey(){return 1;}
m.set(hashKey, 'v1'); m.set(hashKey, 'v2');
console.log('map size after two sets with fn as key:', m.size, '| get(hashvalue=1):', m.get(1));
