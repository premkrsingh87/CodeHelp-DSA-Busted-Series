/* Media that matches the user's screenshot: 21 large vertical stills + a 2-minute track */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'),path=require('path');
const OUT=process.argv[2]||path.join(__dirname,'stills'); fs.mkdirSync(OUT,{recursive:true});
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage(); await p.setContent('<canvas id=c></canvas>');
  // 1080x1920 phone-style stills, ~300-600KB each like real photos
  for(let i=1;i<=21;i++){
    const d=await p.evaluate(i=>{
      const c=document.getElementById('c');c.width=1080;c.height=1920;const g=c.getContext('2d');
      const g1=g.createLinearGradient(0,0,1080,1920);
      g1.addColorStop(0,`hsl(${i*17},60%,45%)`);g1.addColorStop(1,`hsl(${i*17+60},55%,25%)`);
      g.fillStyle=g1;g.fillRect(0,0,1080,1920);
      for(let k=0;k<2600;k++){g.fillStyle=`hsla(${(i*17+k)%360},70%,${30+Math.random()*50}%,.5)`;
        g.beginPath();g.arc(Math.random()*1080,Math.random()*1920,2+Math.random()*26,0,7);g.fill();}
      g.fillStyle='#fff';g.font='bold 150px sans-serif';g.textAlign='center';
      g.fillText('IMG '+i,540,980);
      return c.toDataURL('image/jpeg',0.92).split(',')[1];
    },i);
    fs.writeFileSync(path.join(OUT,`musk (${i}).jpeg`),Buffer.from(d,'base64'));
  }
  await b.close();
  // 2:04 music bed at 128 BPM
  const sr=44100,dur=124,n=sr*dur,data=Buffer.alloc(n*2),beat=60/128;
  for(let i=0;i<n;i++){const t=i/sr,ph=t%beat;
    let v=Math.sin(2*Math.PI*(80+20*Math.sin(t*0.7))*t)*0.13+Math.sin(2*Math.PI*220*t)*0.05;
    if(ph<0.08)v+=Math.sin(2*Math.PI*1500*ph)*Math.exp(-ph*38)*0.6;
    data.writeInt16LE(Math.max(-32767,Math.min(32767,v*32767)),i*2);}
  const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+data.length,4);h.write('WAVE',8);
  h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);
  h.writeUInt32LE(sr,24);h.writeUInt32LE(sr*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);
  h.write('data',36);h.writeUInt32LE(data.length,40);
  fs.writeFileSync(path.join(OUT,'music_128bpm.wav'),Buffer.concat([h,data]));
  const st=fs.readdirSync(OUT).map(f=>fs.statSync(path.join(OUT,f)).size);
  console.log('21 stills 1080x1920, avg',Math.round(st.reduce((a,b)=>a+b,0)/st.length/1024)+'KB, + 2:04 audio');
})();
