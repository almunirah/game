const audioLibrary = new Map();
const AUDIO_UPLOAD_ENDPOINT = `${SUPABASE_URL}/functions/v1/iqra-admin-audio-upload`;

function letterAudioKey(letter){
  return `u${letter[0].codePointAt(0).toString(16)}`;
}

async function loadRealAudioLibrary(){
  const {data,error}=await db.from('iqra_audio').select('*');
  if(error){console.warn('Audio library load failed',error);return;}
  audioLibrary.clear();
  (data||[]).forEach(row=>audioLibrary.set(row.letter_key,row));
  renderAudioAdmin();
}

function updateAudioSourceBadge(letter){
  const badge=document.getElementById('audioSourceBadge');
  if(!badge)return;
  const row=audioLibrary.get(letterAudioKey(letter));
  badge.textContent=row?.audio_url?`🎙️ Rakaman ${row.speaker_name||'ustazah'}`:'🔊 Suara sementara';
}

function playAudioUrl(url,repeat=1){
  return new Promise(resolve=>{
    let count=0;
    const run=()=>{
      const a=new Audio(url);
      a.preload='auto';
      a.onended=()=>{count++; if(count<repeat)setTimeout(run,360); else resolve();};
      a.onerror=()=>resolve();
      a.play().catch(()=>resolve());
    };
    run();
  });
}

const originalSpeakLetter=window.speakLetter;
window.speakLetter=function(letter,repeat=1){
  updateAudioSourceBadge(letter);
  const row=audioLibrary.get(letterAudioKey(letter));
  if(row?.audio_url){
    if('speechSynthesis' in window) speechSynthesis.cancel();
    playAudioUrl(row.audio_url,repeat);
    return;
  }
  originalSpeakLetter(letter,repeat);
};

window.playSequence=async function(){
  const set=pageSets[currentPage-1];
  if('speechSynthesis' in window) speechSynthesis.cancel();
  for(const letter of set){
    const row=audioLibrary.get(letterAudioKey(letter));
    updateAudioSourceBadge(letter);
    if(row?.audio_url) await playAudioUrl(row.audio_url,1);
    else {
      await new Promise(resolve=>{
        const u=new SpeechSynthesisUtterance(letter[2]);
        u.lang='ms-MY';u.rate=.55;u.onend=resolve;u.onerror=resolve;
        speechSynthesis.speak(u);
      });
    }
    await new Promise(r=>setTimeout(r,260));
  }
};

function buildAudioLetterOptions(){
  const select=document.getElementById('audioLetter');
  if(!select)return;
  const seen=new Set();
  select.innerHTML='';
  letters.forEach(letter=>{
    const key=letterAudioKey(letter);
    if(seen.has(key))return;
    seen.add(key);
    const o=document.createElement('option');
    o.value=key;
    o.dataset.arabic=letter[0];
    o.dataset.label=letter[1];
    o.textContent=`${letter[0]} — ${letter[1]}`;
    select.appendChild(o);
  });
}

function renderAudioAdmin(){
  const grid=document.getElementById('audioLibraryGrid');
  if(!grid)return;
  const seen=new Set();
  grid.innerHTML='';
  letters.forEach(letter=>{
    const key=letterAudioKey(letter);
    if(seen.has(key))return;
    seen.add(key);
    const row=audioLibrary.get(key);
    const item=document.createElement('div');
    item.className='audio-status-card';
    item.innerHTML=`<div class="audio-status-letter">${letter[0]}</div><b>${letter[1]}</b><small>${row?.audio_url?`✅ ${escapeHtml(row.speaker_name||'Rakaman tersedia')}`:'⚠️ Belum ada rakaman'}</small>${row?.audio_url?`<button class="ghost" type="button">▶ Dengar</button>`:''}`;
    if(row?.audio_url)item.querySelector('button').onclick=()=>playAudioUrl(row.audio_url,1);
    grid.appendChild(item);
  });
}

async function uploadAdminAudio(e){
  e.preventDefault();
  const msg=document.getElementById('audioUploadMsg');
  const select=document.getElementById('audioLetter');
  const option=select.options[select.selectedIndex];
  const file=document.getElementById('audioFile').files[0];
  if(!adminToken){msg.textContent='Sesi admin tidak sah.';return;}
  if(!file){msg.textContent='Pilih fail audio.';return;}
  msg.textContent='Mengupload rakaman...';
  const form=new FormData();
  form.append('file',file);
  form.append('letter_key',select.value);
  form.append('arabic',option.dataset.arabic);
  form.append('label',option.dataset.label);
  form.append('speaker_name',document.getElementById('audioSpeaker').value.trim());
  form.append('source_note',document.getElementById('audioSource').value.trim());
  try{
    const res=await fetch(AUDIO_UPLOAD_ENDPOINT,{method:'POST',headers:{'x-admin-token':adminToken,'apikey':SUPABASE_KEY},body:form});
    const out=await res.json();
    if(!res.ok)throw new Error(out.error||'Upload gagal');
    msg.textContent='✅ Rakaman berjaya disimpan.';
    msg.style.color='#15803d';
    document.getElementById('audioFile').value='';
    await loadRealAudioLibrary();
  }catch(err){
    msg.textContent=`❌ ${err.message}`;
    msg.style.color='#b91c1c';
  }
}

buildAudioLetterOptions();
document.getElementById('audioUploadForm')?.addEventListener('submit',uploadAdminAudio);
loadRealAudioLibrary();
