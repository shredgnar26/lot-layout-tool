import React, { useEffect, useState, useCallback } from 'react';

export interface Road { id: string; start: [number,number]; end: [number,number]; width: number; }
export interface Lot { corners: [number,number][]; roadId: string; side: 'left'|'right'; }

interface Props {
  imageData: string;
  boundary: [number,number][] | null;
  roadWidthPx: number;
  lotDepthPx: number;
  lotWidthPx: number;
  onRoadsChange: (roads: Road[], lots: Lot[]) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

type Mode = 'draw' | 'drag';

const HANDLE = 16;
const SNAP = 24;

function pip(point: [number,number], poly: [number,number][]): boolean {
  const [x,y] = point; let inside = false;
  for (let i=0,j=poly.length-1; i<poly.length; j=i++) {
    const [xi,yi]=poly[i],[xj,yj]=poly[j];
    if ((yi>y)!==(yj>y) && x<((xj-xi)*(y-yi))/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

function dst(a:[number,number],b:[number,number]){ return Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2); }

function makeLots(road: Road, boundary: [number,number][], depth: number, width: number): Lot[] {
  const {start:s, end:e, width:rw} = road;
  const dx=e[0]-s[0], dy=e[1]-s[1], len=Math.sqrt(dx*dx+dy*dy);
  if (len<1) return [];
  const ux=dx/len, uy=dy/len;
  const lots: Lot[] = [];
  for (const {nx,ny,side} of [{nx:-uy,ny:ux,side:'left' as const},{nx:uy,ny:-ux,side:'right' as const}]) {
    const ox=s[0]+nx*(rw/2), oy=s[1]+ny*(rw/2);
    const n=Math.floor(len/width);
    for (let i=0;i<n;i++) {
      const t0=i*width, t1=t0+width;
      const c1:[number,number]=[ox+ux*t0,oy+uy*t0];
      const c2:[number,number]=[ox+ux*t1,oy+uy*t1];
      const c3:[number,number]=[c2[0]+nx*depth,c2[1]+ny*depth];
      const c4:[number,number]=[c1[0]+nx*depth,c1[1]+ny*depth];
      const cx=(c1[0]+c2[0]+c3[0]+c4[0])/4, cy=(c1[1]+c2[1]+c3[1]+c4[1])/4;
      if (boundary && pip([cx,cy],boundary)) lots.push({corners:[c1,c2,c3,c4],roadId:road.id,side});
    }
  }
  return lots;
}

const RoadDrawer: React.FC<Props> = ({ imageData, boundary, roadWidthPx, lotDepthPx, lotWidthPx, onRoadsChange, canvasRef }) => {
  const [image, setImage] = useState<HTMLImageElement|null>(null);
  const [roads, setRoads] = useState<Road[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [mode, setMode] = useState<Mode>('draw');
  const [drawStart, setDrawStart] = useState<[number,number]|null>(null);
  const [mouse, setMouse] = useState<[number,number]|null>(null);
  const [drag, setDrag] = useState<{roadId:string;point:'start'|'end'}|null>(null);

  useEffect(() => { const img=new Image(); img.onload=()=>setImage(img); img.src=imageData; }, [imageData]);

  useEffect(() => {
    if (!boundary) return;
    const all: Lot[] = [];
    roads.forEach(r => all.push(...makeLots(r, boundary, lotDepthPx, lotWidthPx)));
    setLots(all);
    onRoadsChange(roads, all);
  }, [roads, boundary, lotDepthPx, lotWidthPx]); // eslint-disable-line

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width=image.width; canvas.height=image.height;
    ctx.drawImage(image,0,0);

    if (boundary?.length && boundary.length>2) {
      ctx.strokeStyle='rgba(255,200,0,0.8)'; ctx.lineWidth=2; ctx.setLineDash([8,4]);
      ctx.beginPath(); ctx.moveTo(boundary[0][0],boundary[0][1]);
      boundary.forEach(p=>ctx.lineTo(p[0],p[1])); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    }

    lots.forEach(lot => {
      ctx.fillStyle='rgba(255,80,80,0.22)'; ctx.strokeStyle='rgba(200,40,40,0.85)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(lot.corners[0][0],lot.corners[0][1]);
      lot.corners.forEach(c=>ctx.lineTo(c[0],c[1])); ctx.closePath(); ctx.fill(); ctx.stroke();
    });

    roads.forEach(road => {
      const {start:s,end:e,width:w}=road;
      const dx=e[0]-s[0],dy=e[1]-s[1],len=Math.sqrt(dx*dx+dy*dy);
      if (len<1) return;
      const nx=(-dy/len)*(w/2), ny=(dx/len)*(w/2);
      ctx.fillStyle='rgba(50,50,50,0.55)'; ctx.strokeStyle='#ffcc00'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(s[0]+nx,s[1]+ny); ctx.lineTo(e[0]+nx,e[1]+ny);
      ctx.lineTo(e[0]-nx,e[1]-ny); ctx.lineTo(s[0]-nx,s[1]-ny); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='rgba(255,220,0,0.6)'; ctx.lineWidth=1; ctx.setLineDash([10,6]);
      ctx.beginPath(); ctx.moveTo(s[0],s[1]); ctx.lineTo(e[0],e[1]); ctx.stroke(); ctx.setLineDash([]);
      [s,e].forEach(pt => {
        ctx.fillStyle=mode==='drag'?'#00e5ff':'#ffcc00'; ctx.strokeStyle='#fff'; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.arc(pt[0],pt[1],HANDLE,0,Math.PI*2); ctx.fill(); ctx.stroke();
      });
    });

    if (drawStart && mouse) {
      ctx.strokeStyle='rgba(255,220,0,0.8)'; ctx.lineWidth=2; ctx.setLineDash([6,4]);
      ctx.beginPath(); ctx.moveTo(drawStart[0],drawStart[1]); ctx.lineTo(mouse[0],mouse[1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='#ffcc00'; ctx.beginPath(); ctx.arc(drawStart[0],drawStart[1],6,0,Math.PI*2); ctx.fill();
    }

    ctx.fillStyle='rgba(0,0,0,0.72)'; ctx.fillRect(10,10,360,72);
    ctx.fillStyle='#fff'; ctx.font='bold 22px Arial';
    ctx.fillText(mode==='draw'?(drawStart?'Tap to place road end':'Tap to start a road'):'Drag handles to adjust',18,40);
    ctx.font='18px Arial'; ctx.fillText('Roads: '+roads.length+'   Lots: '+lots.length,18,66);
  }, [image,roads,lots,boundary,drawStart,mouse,mode,canvasRef]);

  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>|React.TouchEvent<HTMLCanvasElement>):[number,number] => {
    const canvas=canvasRef.current!; const rect=canvas.getBoundingClientRect();
    const sx=canvas.width/rect.width, sy=canvas.height/rect.height;
    if ('touches' in e) { const t=e.changedTouches[0]||e.touches[0]; return [(t.clientX-rect.left)*sx,(t.clientY-rect.top)*sy]; }
    return [(e.clientX-rect.left)*sx,(e.clientY-rect.top)*sy];
  }, [canvasRef]);

  const findHandle = useCallback((pos:[number,number]) => {
    for (const r of roads) {
      if (dst(pos,r.start)<HANDLE+SNAP) return {roadId:r.id,point:'start' as const};
      if (dst(pos,r.end)<HANDLE+SNAP) return {roadId:r.id,point:'end' as const};
    }
    return null;
  }, [roads]);

  const onDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>|React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pos=getPos(e);
    if (mode==='drag') { setDrag(findHandle(pos)); return; }
    if (!drawStart) { setDrawStart(pos); }
    else { setRoads(p=>[...p,{id:'r'+Date.now(),start:drawStart,end:pos,width:roadWidthPx}]); setDrawStart(null); }
  }, [mode,drawStart,getPos,findHandle,roadWidthPx]);

  const onMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>|React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pos=getPos(e); setMouse(pos);
    if (drag) setRoads(p=>p.map(r=>r.id!==drag.roadId?r:{...r,[drag.point]:pos}));
  }, [getPos,drag]);

  const onUp = useCallback(()=>setDrag(null),[]);

  return (
    <div className="road-drawer">
      <div className="drawer-controls">
        <h3>Step 2: Draw Roads</h3>
        <p>{mode==='draw'?(drawStart?'Tap to place road end':'Tap to start a road'):'Drag the yellow handles to reposition roads'}</p>
        <div className="mode-toggle">
          <button className={mode==='draw'?'btn-primary':'btn-secondary'} onClick={()=>{setMode('draw');setDrawStart(null);}}>✏️ Draw Road</button>
          <button className={mode==='drag'?'btn-primary':'btn-secondary'} onClick={()=>{setMode('drag');setDrawStart(null);}}>↔️ Adjust</button>
        </div>
        <div className="control-buttons" style={{marginTop:'0.6rem'}}>
          {drawStart && <button onClick={()=>setDrawStart(null)} className="btn-secondary">✕ Cancel</button>}
          <button onClick={()=>setRoads(p=>p.slice(0,-1))} disabled={roads.length===0} className="btn-secondary">↶ Undo</button>
          <button onClick={()=>{setRoads([]);setLots([]);setDrawStart(null);}} disabled={roads.length===0} className="btn-secondary">🗑️ Clear</button>
        </div>
      </div>
      <div className="canvas-container">
        <canvas ref={canvasRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onDown}
          style={{cursor:mode==='drag'?'grab':'crosshair',touchAction:'none'}} />
      </div>
      <div className="road-stats">
        <span>🛣️ Roads: <strong>{roads.length}</strong></span>
        <span>📦 Lots: <strong>{lots.length}</strong></span>
      </div>
    </div>
  );
};

export default RoadDrawer;
