const URL='wss://pi-hai-ai.kuo-butler.workers.dev/room?code=ghost-test-001';
const ORIGIN='https://bme9675010.github.io';
const CHILD='child-X';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function dev(name){return new Promise(res=>{
  const ws=new WebSocket(URL,{headers:{Origin:ORIGIN}}); const d={name,ws,locks:{}};
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.type==='locks')d.locks=m.locks; if(m.type==='welcome')d.sid=m.sid;});
  ws.addEventListener('open',()=>res(d));
});}

// 裝置A 連線、搶鎖，然後「假死」(不送心跳、不關閉)
const A=await dev('A幽靈'); A.ws.send(JSON.stringify({type:'hello',name:'幽靈手機'}));
await sleep(300); A.ws.send(JSON.stringify({type:'acquire',childId:CHILD,name:'幽靈手機'}));
await sleep(500);
// 裝置B 連線，看到被幽靈鎖住
const B=await dev('B'); B.ws.send(JSON.stringify({type:'hello',name:'B手機'}));
await sleep(500); B.ws.send(JSON.stringify({type:'acquire',childId:CHILD,name:'B手機'}));
await sleep(500);
const holderBefore=B.locks[CHILD]?.by;
console.log('1) A搶鎖後 B 看到持有者:', holderBefore, '(應為 幽靈手機)');

// 凍結 A 的心跳：直接讓 A 不再送 ping（本來就沒送）。等 >30 秒讓 A 變 stale，B 持續送 ping 觸發 sweep
console.log('   等待 35 秒讓幽靈鎖過期（B 持續送心跳）...');
for(let i=0;i<7;i++){ await sleep(5000); B.ws.send(JSON.stringify({type:'ping'})); B.ws.send(JSON.stringify({type:'acquire',childId:CHILD,name:'B手機'})); }
await sleep(500);
const holderAfter=B.locks[CHILD]?.by;
console.log('2) 35秒後 B 看到持有者:', holderAfter, '(幽靈過期，應為 B手機)');

// 強制奪回測試：C 連線 steal
const C=await dev('C'); C.ws.send(JSON.stringify({type:'hello',name:'C平板'}));
await sleep(400); C.ws.send(JSON.stringify({type:'steal',childId:CHILD,name:'C平板'}));
await sleep(600);
console.log('3) C 強制奪回後持有者:', C.locks[CHILD]?.by, '(應為 C平板)');

A.ws.close();B.ws.close();C.ws.close();
