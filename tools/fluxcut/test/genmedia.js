const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const FF='/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux';
const OUT=process.argv[2]||path.join(__dirname,'media'); fs.mkdirSync(OUT,{recursive:true});

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage();
  await p.setContent('<canvas id=c></canvas>');
  const frames = async (w,h,n,col,label)=> p.evaluate(([w,h,n,col,label])=>{
    const c=document.getElementById('c');c.width=w;c.height=h;const g=c.getContext('2d');
    const out=[];
    for(let i=0;i<n;i++){
      g.fillStyle=col;g.fillRect(0,0,w,h);
      g.fillStyle='rgba(0,0,0,.25)';
      for(let y=0;y<h;y+=40)for(let x=0;x<w;x+=40)if(((x/40|0)+(y/40|0))%2)g.fillRect(x,y,40,40);
      g.fillStyle='#fff';g.fillRect((i/n)*(w-80),h/2-40,80,80);
      g.fillStyle='#fff';g.font='bold 34px sans-serif';g.textAlign='center';
      g.fillText(label+' · '+(i+1)+'/'+n,w/2,52);
      out.push(c.toDataURL('image/jpeg',0.85).split(',')[1]);
    }
    return out;
  },[w,h,n,col,label]);

  const specs=[['clip_a',3,'#d23c3c'],['clip_b',5,'#3caa5a'],['clip_c',8,'#3c6edc'],['clip_d',4,'#e69632'],['clip_e',6,'#9650d2'],['clip_f',10,'#28b4b4']];
  for(const [name,dur,col] of specs){
    const K=10, fps=25, total=Math.round(dur*fps);
    const f=(await frames(640,360,K,col,name)).map(s=>Buffer.from(s,'base64'));
    await new Promise((res,rej)=>{
      const ff=spawn(FF,['-y','-f','image2pipe','-c:v','mjpeg','-framerate',String(fps),'-i','pipe:0','-c:v','libvpx','-b:v','700k','-deadline','realtime','-cpu-used','8',path.join(OUT,name+'.webm'),'-loglevel','error'],{stdio:['pipe','inherit','inherit']});
      ff.on('close',c=>c===0?res():rej(new Error('ffmpeg '+c)));
      (async()=>{ for(let i=0;i<total;i++){ if(!ff.stdin.write(f[Math.floor(i/total*K)%K])) await new Promise(r=>ff.stdin.once('drain',r)); } ff.stdin.end(); })();
    });
    console.log('video',name,dur+'s');
  }
  const stills=[['still_1','#f0c850'],['still_2','#78c8f0'],['still_3','#f078c8']];
  for(const [n,c] of stills){
    const d=(await frames(800,600,1,c,n))[0];
    fs.writeFileSync(path.join(OUT,n+'.jpg'),Buffer.from(d,'base64'));
    console.log('image',n);
  }
  await b.close();

  // 24 s click track at 120 BPM (PCM wav — no audio encoder in this ffmpeg build)
  const sr=44100,dur=24,n=sr*dur,data=Buffer.alloc(n*2),beat=0.5;
  for(let i=0;i<n;i++){const t=i/sr,ph=t%beat;
    let v=Math.sin(2*Math.PI*110*t)*0.10;
    if(ph<0.07)v+=Math.sin(2*Math.PI*1400*ph)*Math.exp(-ph*40)*0.7;
    data.writeInt16LE(Math.max(-32767,Math.min(32767,v*32767)),i*2);}
  const hdr=Buffer.alloc(44);hdr.write('RIFF',0);hdr.writeUInt32LE(36+data.length,4);hdr.write('WAVE',8);
  hdr.write('fmt ',12);hdr.writeUInt32LE(16,16);hdr.writeUInt16LE(1,20);hdr.writeUInt16LE(1,22);
  hdr.writeUInt32LE(sr,24);hdr.writeUInt32LE(sr*2,28);hdr.writeUInt16LE(2,32);hdr.writeUInt16LE(16,34);
  hdr.write('data',36);hdr.writeUInt32LE(data.length,40);
  fs.writeFileSync(path.join(OUT,'music.wav'),Buffer.concat([hdr,data]));
  console.log('audio music.wav 24s @120bpm');
})();
