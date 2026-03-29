import * as kaspa from '../../kaspa/kaspa.js';
const $=id=>document.getElementById(id);
const LOG=$('log');
function log(msg){const safe=String(msg).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));console.log('[KP]',msg);LOG.style.display='block';LOG.innerHTML+=`<div>${new Date().toLocaleTimeString()} · ${safe}</div>`;LOG.scrollTop=LOG.scrollHeight;}
function setStatus(t,c){$('status').textContent=t;$('status').className='net-badge '+c;}
let rpc=null,privateKey=null,address=null,currentNet='mainnet';
const EXPECTED_NET='mainnet'; /* HARD GUARD — this file ONLY works on mainnet */
const MAKER_WALLET='kaspa:qru9y27vkh9g9326sfn3gt085t36fplnnlxdq30xug3vnnpujjt2g0xx4zmg6';
const MAKER_FEE=100000000n; /* 1 KAS */
const PROOF_AMOUNT=20000000n; /* 0.2 KAS */

function deriveProofAddress(fileHash){const proofKey=new kaspa.PrivateKey(fileHash);return proofKey.toKeypair().toAddress(currentNet);}

/* ═══ KPP-1 PROTOCOL — payload builder ═══ */
function buildKpp1Payload(hash){
  const json=JSON.stringify({"p":"kpp-1","op":"stamp","hash":hash,"algo":"sha256"});
  return Array.from(new TextEncoder().encode(json)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function stampWithPayload(entries,proofAddr,changeAddr,pFee,payloadHex,signerKeys){
  /* Outputs: 0.2 KAS → proof, 1 KAS → maker. Priority fee (2 KAS) → miners */
  const outputs=[{address:proofAddr,amount:PROOF_AMOUNT},{address:MAKER_WALLET,amount:MAKER_FEE}];
  const result=await kaspa.createTransactions({networkId:currentNet,entries:entries,outputs:outputs,priorityFee:pFee,changeAddress:changeAddr});
  let txId='';
  for(const pending of result.transactions){
    /* Path A: set payload directly on inner Transaction */
    try{
      const tx=pending.transaction;tx.payload=payloadHex;
      kaspa.signTransaction(tx,signerKeys,true);
      tx.finalize();
      await rpc.submitTransaction({transaction:tx,allowOrphan:false});
      txId=tx.id;log('TX LIVE (KPP-1 direct): '+txId);return{txId,inscribed:true};
    }catch(ea){log('KPP-1 path A: '+String(ea));}
    /* Path B: serialize → inject payload → rebuild → sign → submit */
    try{
      const txObj=pending.transaction.serializeToObject();txObj.payload=payloadHex;
      const modTx=kaspa.Transaction.deserializeFromObject(txObj);
      kaspa.signTransaction(modTx,signerKeys,true);
      modTx.finalize();
      await rpc.submitTransaction({transaction:modTx.serializeToObject(),allowOrphan:false});
      txId=modTx.id;log('TX LIVE (KPP-1 serialize): '+txId);return{txId,inscribed:true};
    }catch(eb){log('KPP-1 path B: '+String(eb));}
    /* Path C: fallback — original method, no payload */
    await pending.sign(signerKeys);txId=await pending.submit(rpc);
    log('TX LIVE (no payload): '+txId);return{txId,inscribed:false};
  }
  throw new Error('No pending transactions generated');
}

const MAX_FILE_SIZE=500*1024*1024;
async function hashFile(file){
  if(file.size>MAX_FILE_SIZE)throw new Error('File too large ('+fz(file.size)+'). Maximum is 500 MB.');
  if(file.size===0)throw new Error('File is empty (0 bytes). Cannot stamp an empty file.');
  const buf=await file.arrayBuffer();const h=await crypto.subtle.digest('SHA-256',buf);
  return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function initWallet(){
  let saved=localStorage.getItem('kasproof_pk');
  if(!saved){const kb=crypto.getRandomValues(new Uint8Array(32));saved=Array.from(kb).map(b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('kasproof_pk',saved);log('New wallet generated');}else{log('Wallet loaded from storage');}
  privateKey=new kaspa.PrivateKey(saved);address=privateKey.toKeypair().toAddress(currentNet);
  $('w-addr').textContent=address.toString();$('w-net').textContent=currentNet;$('wk-val').textContent=saved;$('wallet-bar').style.display='block';log('Wallet: '+address.toString());
}
window.toggleKey=function(w){const exp=$('wk-export'),imp=$('wk-import');if(w==='export'){exp.style.display=exp.style.display==='none'?'block':'none';imp.style.display='none'}if(w==='import'){imp.style.display=imp.style.display==='none'?'block':'none';exp.style.display='none'}};
window.importKey=function(){const val=$('wk-input').value.trim();if(val.length!==64||!/^[0-9a-fA-F]+$/.test(val)){alert('Invalid — need 64 hex characters');return}if(!confirm('Replace current wallet? Make sure you backed up your current key first.')){return}localStorage.setItem('kasproof_pk',val);location.reload();};
window.refreshBalance=async function(){if(!rpc||!address)return;try{const{entries}=await rpc.getUtxosByAddresses([address.toString()]);let total=0n;for(const e of entries)total+=e.amount;const kas=Number(total)/100000000;$('w-bal').textContent=kas.toFixed(8)+' KAS';$('w-bal').className='v'+(kas===0?' warn':'');if(kas===0)log('Balance: 0 — fund this address');}catch(e){$('w-bal').textContent='error';log('Balance: '+String(e))}};

try{log('Loading WASM SDK...');await kaspa.default('./kaspa/kaspa_bg.wasm');log('SDK: '+kaspa.version());initWallet();}catch(e){log('SDK error: '+String(e));setStatus('SDK FAILED','err');}

async function connect(){
  const attempts=[{label:'public mainnet',method:'resolver',net:'mainnet'},{label:'public mainnet (retry)',method:'resolver',net:'mainnet'},{label:'public mainnet (retry 2)',method:'resolver',net:'mainnet'}];
  for(const a of attempts){try{log('Trying '+a.label+'...');setStatus('CONNECTING...','off');let client;
    if(a.method==='direct'){client=new kaspa.RpcClient({url:a.url,networkId:a.net});await Promise.race([client.connect(),new Promise((_,r)=>setTimeout(()=>r(new Error('Timeout')),5000))]);}
    else{const resolver=new kaspa.Resolver();client=await Promise.race([resolver.connect(a.net),new Promise((_,r)=>setTimeout(()=>r(new Error('Timeout')),12000))]);}
    const info=await client.getServerInfo();if(a.net!==EXPECTED_NET){log('BLOCKED: connected to '+a.net+' but expected '+EXPECTED_NET);client.disconnect();continue;}log('Connected! synced='+info.isSynced);rpc=client;currentNet=a.net;address=privateKey.toKeypair().toAddress(a.net);
    $('w-addr').textContent=address.toString();$('w-net').textContent=a.net+(a.method==='direct'?' (local)':'');setStatus(a.net.toUpperCase()+' LIVE','on');await refreshBalance();return;
  }catch(e){log(a.label+': '+String(e))}}setStatus('OFFLINE','err');log('No connection — try again later');
}
connect();

function getApiBase(){if(currentNet==='mainnet')return'https://api.kaspa.org';if(currentNet==='testnet-10')return'https://api-tn10.kaspa.org';if(currentNet==='testnet-11')return'https://api-tn11.kaspa.org';return null;}

async function checkProofHistory(proofAddr){
  const api=getApiBase();if(!api)return null;
  try{
    const c1=new AbortController();const t1=setTimeout(()=>c1.abort(),10000);
    const cR=await fetch(`${api}/addresses/${proofAddr}/transactions-count`,{signal:c1.signal});clearTimeout(t1);
    if(!cR.ok)throw new Error('API '+cR.status);const cD=await cR.json();const count=(typeof cD.total==='number')?cD.total:0;
    if(count===0)return{found:false,count:0};
    /* Fetch OLDEST transaction (the actual stamp, not reclaim) */
    const oldestOffset=Math.max(0,count-1);
    const c2=new AbortController();const t2=setTimeout(()=>c2.abort(),10000);
    const tR=await fetch(`${api}/addresses/${proofAddr}/full-transactions?limit=1&offset=${oldestOffset}&resolve_previous_outpoints=light`,{signal:c2.signal});clearTimeout(t2);
    if(!tR.ok)throw new Error('TX API '+tR.status);const txs=await tR.json();let stampTime=null,txId=null,blockHash=null;
    if(Array.isArray(txs)&&txs.length>0&&txs[0]){if(typeof txs[0].transaction_id==='string')txId=txs[0].transaction_id;if(txs[0].block_time)stampTime=new Date(Number(txs[0].block_time)).toISOString();if(txs[0].accepting_block_hash)blockHash=txs[0].accepting_block_hash;}
    return{found:true,count,txId,stampTime,blockHash};
  }catch(e){log('REST API check failed: '+String(e));return null;}
}
function explorerUrl(txId){if(currentNet==='mainnet')return'https://kaspa.stream/transactions/'+txId;if(currentNet==='testnet-10')return'https://tn10.kaspa.stream/transactions/'+txId;return null;}

function fz(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(2)+' MB'}
function sanitize(s){return s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))}
window.sw=function(t){document.querySelectorAll('.tab').forEach((el,i)=>el.classList.toggle('on',['stamp','verify'][i]===t));document.querySelectorAll('.pnl').forEach(el=>el.classList.toggle('on',el.id==='tp-'+t))};
function setupDZ(dz,fi,fn){['dragenter','dragover'].forEach(e=>dz.addEventListener(e,ev=>{ev.preventDefault();dz.classList.add('over')}));['dragleave','drop'].forEach(e=>dz.addEventListener(e,ev=>{ev.preventDefault();dz.classList.remove('over')}));dz.addEventListener('drop',ev=>{if(ev.dataTransfer.files.length)fn(ev.dataTransfer.files[0])});fi.addEventListener('change',()=>{if(fi.files.length)fn(fi.files[0])});}

let sFile,sHash,sProofAddr;
async function onStampFile(file){
  sFile=file;try{sHash=await hashFile(file);}catch(e){$('s-info').innerHTML=`<div class="info e"><strong>Error:</strong> ${sanitize(String(e))}</div>`;return;}
  $('dz-s').classList.add('has');const ext=sanitize(file.name.includes('.')?file.name.split('.').pop().toUpperCase():'FILE');
  $('dz-sc').innerHTML=`<div class="dz-f">📄 ${ext} · ${fz(file.size)}<span class="x" onclick="event.stopPropagation();window.clrS()">✕</span></div>`;
  sProofAddr=deriveProofAddress(sHash);
  $('s-info').innerHTML=`<div class="hb"><div class="l">SHA-256 Fingerprint</div><button class="cp" onclick="navigator.clipboard.writeText('${sHash}')">copy</button>${sHash}</div><div class="hb" style="margin-top:8px"><div class="l">Proof Address (derived from hash)</div><button class="cp" onclick="navigator.clipboard.writeText('${sProofAddr.toString()}')">copy</button>${sProofAddr.toString()}</div><div class="info" style="margin-top:8px">This address IS your file, mathematically derived from its hash. Stamping costs <strong>3 KAS</strong>: 2 KAS to miners, 1 KAS protocol fee, 0.2 KAS proof dust (reclaimable). Anyone can verify by re-hashing the file.</div>`;
  $('s-acts').style.display='flex';$('s-res').innerHTML='';
}
window.clrS=function(){sFile=sHash=sProofAddr=null;$('dz-s').classList.remove('has');$('dz-sc').innerHTML='<div class="dz-i">📄</div><div class="dz-t"><strong>Drop any file to stamp</strong><br/>image, document, contract, anything</div>';$('s-info').innerHTML='';$('s-acts').style.display='none';$('s-res').innerHTML='';$('fi-s').value='';};
setupDZ($('dz-s'),$('fi-s'),onStampFile);

window.doStamp=async function(){
  if(!sFile||!sHash||!sProofAddr)return;if(!rpc){$('s-res').innerHTML='<div class="info e"><strong>Not connected.</strong> Waiting for network...</div>';return;}
  const btn=$('btn-stamp');btn.disabled=true;btn.textContent='⛏ Stamping...';log('Stamping: '+sHash.slice(0,16)+'...');log('Proof address: '+sProofAddr.toString());
  try{const addr=address.toString();const proofAddr=sProofAddr.toString();
    const history=await checkProofHistory(proofAddr);
    if(history&&history.found){const when=history.stampTime?' on '+new Date(history.stampTime).toLocaleDateString():'';$('s-res').innerHTML=`<div class="info w"><strong>Already stamped${when}!</strong> This file already has ${history.count} transaction(s) on the Kaspa DAG.</div>`;btn.disabled=false;btn.textContent='⛏ Stamp on Kaspa';return;}
    if(history===null){const existing=await rpc.getUtxosByAddresses([proofAddr]);if(existing.entries&&existing.entries.length>0){$('s-res').innerHTML=`<div class="info w"><strong>Already stamped!</strong> This file already has a proof on the Kaspa DAG.</div>`;btn.disabled=false;btn.textContent='⛏ Stamp on Kaspa';return;}}
    const{entries}=await rpc.getUtxosByAddresses([addr]);if(!entries.length)throw new Error('No funds — send some KAS to your wallet address first');
    entries.sort((a,b)=>a.amount>b.amount?1:-1);log(entries.length+' UTXOs, creating tx...');
    const amount=20000000n;let txId='';let lastErr=null;let inscribed=false;const feeLevels=[200000000n,250000000n,300000000n];
    const payloadHex=buildKpp1Payload(sHash);log('KPP-1 payload: '+payloadHex.length/2+' bytes');log('Stamp: 0.2 proof + 1 KAS maker + 2 KAS miners = 3.2 KAS');
    for(const pFee of feeLevels){try{if(pFee>200000000n)log('Retrying with priority fee '+(Number(pFee)/100000000)+' KAS...');
      const res=await stampWithPayload(entries,proofAddr,addr,pFee,payloadHex,[privateKey]);
      txId=res.txId;inscribed=res.inscribed;lastErr=null;break;
    }catch(e){lastErr=e;log('TX attempt failed: '+String(e));const msg=String(e).toLowerCase();if(msg.includes('no funds')||msg.includes('insufficient')||msg.includes('not connected')||msg.includes('no entries'))throw e;}}
    if(lastErr)throw lastErr;await refreshBalance();
    const receipt={kasproof:'v7',protocol:'kpp-1',fileHash:sHash,algo:'sha256',proofAddress:proofAddr,transactionId:txId,timestamp:new Date().toISOString(),network:currentNet,inscribed:inscribed};
    const blob=new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);
    const kppBadge=inscribed?'<div class="cr"><span class="k">Protocol</span><span class="v" style="color:var(--kas)">KPP-1 (inscribed on-chain)</span></div>':'<div class="cr"><span class="k">Protocol</span><span class="v" style="color:var(--amb)">KPP-1 (address-verified only)</span></div>';
    $('s-res').innerHTML=`<div class="vd pass"><div class="vd-i">✓</div><div><div class="vd-title">STAMPED ON KASPA</div><div class="vd-b">Real transaction. Immutable. Unforgeable. 2 KAS to miners.</div></div></div><div class="cert"><div class="cr"><span class="k">File Hash</span><span class="v" style="font-size:10px">${sHash}</span></div><div class="cr"><span class="k">Proof Address</span><span class="v" style="font-size:10px">${proofAddr}</span></div><div class="cr"><span class="k">Transaction</span><span class="v" style="font-size:10px"><a href="${explorerUrl(txId)}" target="_blank" style="color:var(--kas)">${txId}</a></span></div>${kppBadge}<div class="cr"><span class="k">Network</span><span class="v" style="color:var(--kas)">${currentNet} (ON-CHAIN)</span></div></div><div class="acts" style="margin-top:12px"><a href="${url}" download="kasproof-${sHash.slice(0,8)}.kasproof" class="btn bp" style="text-decoration:none">⬇ Download receipt</a><button class="btn bs" onclick="reclaimDust('${sHash}',this)">↩ Reclaim 0.2 KAS dust</button><a href="${explorerUrl(txId)}" target="_blank" class="btn bs" style="text-decoration:none">🔗 View on explorer</a></div><div class="info" style="margin-top:12px"><strong>Anyone can verify this file</strong> by dropping it in the Verify tab. No receipt needed. The Kaspa DAG is the proof.</div>`;
  }catch(e){log('STAMP ERROR: '+String(e));$('s-res').innerHTML=`<div class="info e"><strong>Error:</strong> ${sanitize(String(e))}</div>`;}
  btn.disabled=false;btn.textContent='⛏ Stamp on Kaspa';
};

/* ═══ RECLAIM DUST — sweep proof address back to user wallet ═══ */
window.reclaimDust=async function(fileHash,btnEl){
  if(!rpc){log('Not connected');return;}
  if(btnEl){btnEl.disabled=true;btnEl.textContent='Reclaiming...';}
  try{
    const proofKey=new kaspa.PrivateKey(fileHash);
    const proofAddr=proofKey.toKeypair().toAddress(currentNet).toString();
    const userAddr=address.toString();
    const proofUtxos=await rpc.getUtxosByAddresses([proofAddr]);
    if(!proofUtxos.entries||!proofUtxos.entries.length){log('Already empty');if(btnEl){btnEl.textContent='Already empty';btnEl.disabled=true;}return;}
    let dust=0n;for(const e of proofUtxos.entries)dust+=e.amount;
    log('Reclaiming '+(Number(dust)/100000000)+' KAS...');
    const userUtxos=await rpc.getUtxosByAddresses([userAddr]);
    const allEntries=[...proofUtxos.entries,...(userUtxos.entries||[])];
    const result=await kaspa.createTransactions({networkId:currentNet,entries:allEntries,outputs:[{address:userAddr,amount:dust}],priorityFee:0n,changeAddress:userAddr});
    for(const pending of result.transactions){await pending.sign([proofKey,privateKey]);const txId=await pending.submit(rpc);log('Reclaimed! TX: '+txId);}
    await refreshBalance();if(btnEl){btnEl.textContent='✓ Reclaimed!';btnEl.disabled=true;}
  }catch(e){log('Reclaim: '+String(e));if(btnEl){btnEl.textContent='Failed';btnEl.disabled=false;}}
};

async function onVerifyFile(file){
  $('dz-v').classList.add('has');const ext=sanitize(file.name.includes('.')?file.name.split('.').pop().toUpperCase():'FILE');
  $('dz-vc').innerHTML=`<div class="dz-f">🔍 ${ext} · ${fz(file.size)}<span class="x" onclick="event.stopPropagation();window.clrV()">✕</span></div>`;
  const res=$('v-res');res.innerHTML='<div class="info">Hashing file and checking Kaspa DAG...</div>';
  try{const fileHash=await hashFile(file);const proofAddr=deriveProofAddress(fileHash);log('Verify: '+fileHash.slice(0,16)+'... → '+proofAddr.toString().slice(0,24)+'...');
    if(!rpc&&!getApiBase()){res.innerHTML=`<div class="cert"><div class="cr"><span class="k">File Hash</span><span class="v" style="font-size:10px">${fileHash}</span></div><div class="cr"><span class="k">Proof Address</span><span class="v" style="font-size:10px">${proofAddr.toString()}</span></div></div><div class="info w" style="margin-top:10px"><strong>Offline.</strong> Connect to Kaspa to check.</div>`;return;}
    const history=await checkProofHistory(proofAddr.toString());let verified=false,txCount=0,stampTime=null,firstTxId=null,blockHash=null,utxoBalance=null;
    if(history&&history.found){verified=true;txCount=history.count;stampTime=history.stampTime;firstTxId=history.txId;blockHash=history.blockHash;log('VERIFIED via REST API — '+txCount+' transaction(s)');}
    else if(history===null&&rpc){log('REST API unavailable, UTXO fallback...');const{entries}=await rpc.getUtxosByAddresses([proofAddr.toString()]);if(entries&&entries.length>0){verified=true;txCount=entries.length;let total=0n;for(const e of entries)total+=e.amount;utxoBalance=(Number(total)/100000000).toFixed(8);log('VERIFIED via UTXO — '+entries.length);}}
    if(verified){
      const timeInfo=stampTime?`<div class="cr"><span class="k">First Stamped</span><span class="v" style="color:var(--kas)">${new Date(stampTime).toLocaleString()}</span></div>`:'';
      const txInfo=firstTxId?`<div class="cr"><span class="k">Transaction</span><span class="v" style="font-size:10px"><a href="${explorerUrl(firstTxId)}" target="_blank" style="color:var(--kas)">${firstTxId}</a></span></div>`:'';
      const blockInfo=blockHash?`<div class=\"cr\"><span class=\"k\">Block</span><span class=\"v\" style=\"font-size:10px\">${blockHash.slice(0,16)}...</span></div>`:'';
      const balInfo=utxoBalance?`<div class="cr"><span class="k">On-chain Balance</span><span class="v" style="color:var(--kas)">${utxoBalance} KAS</span></div>`:'';
      const methodNote=history&&history.found?'Transaction history is permanent — this proof survives even if the dust is spent.':'Verified via UTXO. History API was unavailable.';
      res.innerHTML=`<div class="vd pass"><div class="vd-i">✓</div><div><div class="vd-title">VERIFIED: FILE IS STAMPED ON KASPA</div><div class="vd-b">This exact file has been timestamped on the Kaspa BlockDAG. The proof is mathematically unforgeable.</div></div></div><div class="chks"><div class="ck p"><div class="ci">✓</div><span>File hashed (SHA-256)</span></div><div class="ck p"><div class="ci">✓</div><span>Proof address derived from hash</span></div><div class="ck p"><div class="ci">✓</div><span>${txCount} transaction(s) found in DAG history</span></div><div class="ck p"><div class="ci">✓</div><span>Proof is immutable on Kaspa DAG</span></div></div><div class="cert" style="margin-top:12px"><div class="cr"><span class="k">File Hash</span><span class="v" style="font-size:10px">${fileHash}</span></div><div class="cr"><span class="k">Proof Address</span><span class="v" style="font-size:10px">${proofAddr.toString()}</span></div>${timeInfo}${txInfo}${balInfo}${blockInfo}</div><div class="info" style="margin-top:12px"><strong>This proof is permanent.</strong> ${methodNote}</div><div class="acts" style="margin-top:12px"><button class="btn bs" onclick="reclaimDust('${fileHash}',this)">↩ Reclaim dust from proof address</button><a href="${firstTxId?explorerUrl(firstTxId):'#'}" target="_blank" class="btn bs" style="text-decoration:none">🔗 View on explorer</a></div>`;
    }else{
      log('Not found — no transactions');
      res.innerHTML=`<div class="vd warn"><div class="vd-i">⚠</div><div><div class="vd-title">NOT STAMPED</div><div class="vd-b">This file has no proof on the Kaspa DAG.</div></div></div><div class="chks"><div class="ck p"><div class="ci">✓</div><span>File hashed (SHA-256)</span></div><div class="ck p"><div class="ci">✓</div><span>Proof address derived</span></div><div class="ck f"><div class="ci">✕</div><span>No transactions found in history</span></div></div><div class="cert" style="margin-top:12px"><div class="cr"><span class="k">File Hash</span><span class="v" style="font-size:10px">${fileHash}</span></div><div class="cr"><span class="k">Proof Address</span><span class="v" style="font-size:10px">${proofAddr.toString()}</span></div></div><div class="info" style="margin-top:12px"><strong>No proof exists for this file.</strong> If you expected this file to be stamped, it may have been modified — even a single byte change produces a completely different hash and proof address.</div>`;
    }
  }catch(e){log('Verify error: '+String(e));res.innerHTML=`<div class="info e"><strong>Error:</strong> ${sanitize(String(e))}</div>`;}
}
window.clrV=function(){$('dz-v').classList.remove('has');$('dz-vc').innerHTML='<div class="dz-i">🔍</div><div class="dz-t"><strong>Drop any file to verify</strong><br/>no certificate needed. The chain is the proof</div>';$('v-res').innerHTML='';$('fi-v').value='';};
setupDZ($('dz-v'),$('fi-v'),onVerifyFile);
