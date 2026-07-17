import { CELL_LABELS, GRID_SIZE, SHIPS, type Coord, type Orientation, type ShipId } from "./constants.ts";
import { Board, harpoonCells, radarCells } from "./engine.ts";

export type RenderOptions = {
  revealShips: boolean; cursor?: Coord; previewShip?: { id: ShipId; orientation: Orientation; valid: boolean };
  weapon?: "fire"|"phantom"|"harpoon"|"sparrow"|"mk45"|"radar"; selected?: Coord[]; active?: Coord[]; waves?: Coord[]; time?: number;
};

export function drawBoard(canvas: HTMLCanvasElement, board: Board, opts: RenderOptions) {
  const dpr=Math.min(2,window.devicePixelRatio||1); const size=Math.floor(canvas.clientWidth*dpr);
  if(canvas.width!==size||canvas.height!==size){canvas.width=size;canvas.height=size;}
  const ctx=canvas.getContext("2d")!; ctx.imageSmoothingEnabled=false;
  const m=size*.075, cell=(size-m*1.18)/GRID_SIZE, t=(opts.time??0)/1000;
  ctx.fillStyle="#082630";ctx.fillRect(0,0,size,size);
  for(let y=0;y<GRID_SIZE;y++) for(let x=0;x<GRID_SIZE;x++){
    const px=m+x*cell,py=m+y*cell; const wave=Math.sin(t*.8+x*.9+y*.6)*.5+.5;
    ctx.fillStyle=wave>.63?"#0d3943":"#0a303a";ctx.fillRect(px,py,cell,cell);
    ctx.strokeStyle="rgba(113,144,155,.27)";ctx.lineWidth=Math.max(1,dpr);ctx.strokeRect(px+.5,py+.5,cell-1,cell-1);
    ctx.strokeStyle="rgba(124,229,223,.06)";ctx.beginPath();ctx.moveTo(px+cell*.08,py+cell*(.62+wave*.08));ctx.lineTo(px+cell*.85,py+cell*(.48-wave*.06));ctx.stroke();
  }
  ctx.fillStyle="#71909b";ctx.font=`bold ${Math.max(9,cell*.2)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";
  for(let i=0;i<GRID_SIZE;i++){ctx.fillText(String(i+1),m+i*cell+cell/2,m*.42);ctx.fillText(CELL_LABELS[i],m*.43,m+i*cell+cell/2);}
  const radarMarks=new Map<string,{coord:Coord;contact:boolean}>();
  for(const scan of board.radarScans){
    const contactResolved=scan.contact&&scan.candidates.some(c=>board.shots[c.y][c.x]==="hit"||board.shots[c.y][c.x]==="sunk");
    if(contactResolved)continue;
    for(const coord of scan.candidates){
      if(board.shots[coord.y][coord.x]!=="unknown")continue;
      const key=`${coord.x},${coord.y}`,seen=radarMarks.get(key);
      radarMarks.set(key,{coord,contact:!!seen?.contact||scan.contact});
    }
  }
  for(const {coord,contact} of radarMarks.values()){
    ctx.fillStyle=contact?"rgba(229,215,138,.18)":"rgba(76,151,133,.105)";
    ctx.strokeStyle=contact?"rgba(229,215,138,.62)":"rgba(96,174,153,.3)";
    ctx.lineWidth=Math.max(1,dpr*1.05);
    const px=m+coord.x*cell,py=m+coord.y*cell;
    ctx.fillRect(px+1,py+1,cell-2,cell-2);
    ctx.strokeRect(px+2,py+2,cell-4,cell-4);
  }
  for(const ship of board.ships) if(opts.revealShips||ship.sunk) drawShip(ctx,ship.id,ship.cells,ship.orientation,m,cell,ship.sunk,ship.hits);
  for(let y=0;y<GRID_SIZE;y++)for(let x=0;x<GRID_SIZE;x++){const mark=board.shots[y][x];if(mark!=="unknown")drawMark(ctx,{x,y},mark,m,cell,t);}
  for(const [index,wave] of (opts.waves??[]).entries())drawWake(ctx,wave,m,cell,t,index);
  if(opts.cursor){
    let cells=[opts.cursor]; if(opts.previewShip){const def=SHIPS.find(s=>s.id===opts.previewShip!.id)!;cells=board.cellsFor(opts.cursor,def.size,opts.previewShip.orientation,opts.previewShip.id);}
    else if(opts.weapon==="harpoon")cells=harpoonCells(opts.cursor); else if(opts.weapon==="radar"||opts.weapon==="sparrow")cells=radarCells(opts.cursor);
    ctx.fillStyle=opts.previewShip&&!opts.previewShip.valid?"rgba(255,80,90,.28)":"rgba(124,229,223,.17)";ctx.strokeStyle=opts.previewShip&&!opts.previewShip.valid?"#ff8585":"#7ce5df";ctx.lineWidth=Math.max(1,dpr*1.4);
    for(const c of cells)if(c.x>=0&&c.y>=0&&c.x<8&&c.y<8){ctx.fillRect(m+c.x*cell,m+c.y*cell,cell,cell);ctx.strokeRect(m+c.x*cell+2,m+c.y*cell+2,cell-4,cell-4);}
    if(opts.previewShip&&cells.every(c=>c.x>=0&&c.y>=0&&c.x<8&&c.y<8))drawShip(ctx,opts.previewShip.id,cells,opts.previewShip.orientation,m,cell,false,new Set(),opts.previewShip.valid?"valid":"invalid");
  }
  for(const c of opts.selected??[]){ctx.strokeStyle="#e5d78a";ctx.lineWidth=Math.max(2,dpr*2);ctx.strokeRect(m+c.x*cell+4,m+c.y*cell+4,cell-8,cell-8);}
  for(const c of opts.active??[]){const p=.5+.5*Math.sin(t*12);ctx.strokeStyle=`rgba(255,240,190,${.5+p*.5})`;ctx.lineWidth=Math.max(2,dpr*2.3);ctx.beginPath();ctx.arc(m+(c.x+.5)*cell,m+(c.y+.5)*cell,cell*(.22+p*.18),0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(m+c.x*cell+cell*.12,m+(c.y+.5)*cell);ctx.lineTo(m+(c.x+.88)*cell,m+(c.y+.5)*cell);ctx.moveTo(m+(c.x+.5)*cell,m+c.y*cell+cell*.12);ctx.lineTo(m+(c.x+.5)*cell,m+(c.y+.88)*cell);ctx.stroke();}
}

function drawShip(ctx:CanvasRenderingContext2D,id:ShipId,cells:Coord[],orientation:Orientation,m:number,cell:number,sunk:boolean,hits:Set<string>,ghost?:"valid"|"invalid"){
  const start=cells.reduce((best,c)=>c.y<best.y||(c.y===best.y&&c.x<best.x)?c:best,cells[0]), horizontal=orientation==="horizontal";ctx.save();
  if(id==="carrier"){
    const minX=Math.min(...cells.map(c=>c.x)),maxX=Math.max(...cells.map(c=>c.x)),minY=Math.min(...cells.map(c=>c.y)),maxY=Math.max(...cells.map(c=>c.y));
    const cx=m+(minX+maxX+1)*cell/2,cy=m+(minY+maxY+1)*cell/2;ctx.translate(cx,cy);if(!horizontal)ctx.rotate(Math.PI/2);
    const len=cell*4,w=cell*1.45;ctx.globalAlpha=ghost?.48:sunk?.55:.9;ctx.fillStyle=ghost?(ghost==="valid"?"#7ce5df":"#ff8585"):sunk?"#584e51":"#71909b";ctx.beginPath();ctx.moveTo(-len*.48,-w*.42);ctx.lineTo(len*.38,-w*.48);ctx.lineTo(len*.5,-w*.22);ctx.lineTo(len*.5,w*.22);ctx.lineTo(len*.38,w*.48);ctx.lineTo(-len*.48,w*.42);ctx.closePath();ctx.fill();
    ctx.fillStyle=ghost?"#143b43":sunk?"#40383a":"#173b45";ctx.fillRect(-len*.36,-cell*.055,len*.72,cell*.11);ctx.fillRect(-cell*.05,-w*.38,cell*.12,w*.76);
    ctx.fillStyle=ghost?"#d8fffb":sunk?"#4a3b3e":"#b0ced0";ctx.fillRect(cell*.72,-w*.37,cell*.38,cell*.32);ctx.fillRect(cell*.82,-w*.52,cell*.1,cell*.18);
    for(const [px,py] of [[-.95,-.28],[-.45,.25],[.25,.22]]){ctx.save();ctx.translate(cell*px,cell*py);ctx.fillRect(-cell*.13,-cell*.025,cell*.26,cell*.05);ctx.fillRect(-cell*.025,-cell*.11,cell*.05,cell*.22);ctx.restore();}ctx.restore();
    for(const c of cells)if(hits.has(`${c.x},${c.y}`)){ctx.fillStyle="#ff8585";ctx.beginPath();ctx.arc(m+(c.x+.5)*cell,m+(c.y+.5)*cell,cell*.12,0,Math.PI*2);ctx.fill();}return;
  }
  const cx=m+(start.x+.5)*cell,cy=m+(start.y+.5)*cell;ctx.translate(cx,cy);if(!horizontal)ctx.rotate(Math.PI/2);
  const len=cells.length*cell,w=cell*.5;ctx.globalAlpha=ghost?.5:sunk?.55:.88;ctx.fillStyle=ghost?(ghost==="valid"?"#7ce5df":"#ff8585"):sunk?"#584e51":"#71909b";
  ctx.beginPath();ctx.moveTo(-cell*.38,-w*.28);ctx.lineTo(len-cell*.58,-w*.44);ctx.lineTo(len-cell*.18,0);ctx.lineTo(len-cell*.58,w*.44);ctx.lineTo(-cell*.38,w*.28);ctx.closePath();ctx.fill();
  ctx.fillStyle=ghost?"#d8fffb":sunk?"#4a3b3e":"#b0ced0";
  if(id==="battleship"){ctx.fillRect(cell*.75,-w*.25,cell*.95,w*.5);ctx.fillRect(cell*2.2,-w*.22,cell*.72,w*.44);for(const x of [0,1.65,3.15]){ctx.fillRect(cell*(x+.22),-w*.13,cell*.42,w*.26);ctx.fillRect(cell*(x+.56),-cell*.045,cell*.34,cell*.09);}}
  if(id==="destroyer"){ctx.fillRect(cell*.75,-w*.19,cell*.7,w*.38);ctx.fillRect(cell*1.52,-w*.11,cell*.45,w*.22);ctx.fillRect(cell*.33,-w*.12,cell*.28,w*.24);}
  if(id==="cruiser"){ctx.fillRect(cell*.72,-w*.22,cell*.88,w*.44);ctx.fillRect(cell*1.82,-w*.19,cell*.62,w*.38);for(const x of [.18,2.65]){ctx.fillRect(cell*x,-w*.11,cell*.34,w*.22);ctx.fillRect(cell*(x+.28),-cell*.035,cell*.28,cell*.07);}}
  if(id==="escort"){ctx.fillRect(cell*.42,-w*.18,cell*.58,w*.36);ctx.fillRect(cell*1.05,-w*.1,cell*.26,w*.2);ctx.fillRect(cell*.12,-w*.09,cell*.2,w*.18);}
  if(id==="submarine"){ctx.fillRect(-cell*.18,-w*.12,cell*.7,w*.24);ctx.fillRect(cell*.05,-w*.32,cell*.14,w*.2);ctx.fillRect(cell*.1,-w*.42,cell*.05,w*.11);}
  ctx.strokeStyle=ghost?"#143b43":sunk?"#30282a":"#163b45";ctx.lineWidth=Math.max(1,cell*.035);ctx.strokeRect(-cell*.13,-cell*.04,len-cell*.75,cell*.08);ctx.restore();
  for(const c of cells) if(hits.has(`${c.x},${c.y}`)){ctx.fillStyle="#ff8585";ctx.beginPath();ctx.arc(m+(c.x+.5)*cell,m+(c.y+.5)*cell,cell*.12,0,Math.PI*2);ctx.fill();}
}

function drawWake(ctx:CanvasRenderingContext2D,c:Coord,m:number,cell:number,t:number,index:number){const x=m+(c.x+.5)*cell,y=m+(c.y+.5)*cell,p=(t*1.25+index*.19)%1;ctx.save();ctx.strokeStyle="#7ce5df";ctx.lineWidth=Math.max(1,cell*.035);for(let i=0;i<2;i++){const q=(p+i*.42)%1;ctx.globalAlpha=.65*(1-q);ctx.beginPath();ctx.arc(x,y,cell*(.13+q*.34),0,Math.PI*2);ctx.stroke();}ctx.restore();}

function drawMark(ctx:CanvasRenderingContext2D,c:Coord,mark:string,m:number,cell:number,t:number){const x=m+(c.x+.5)*cell,y=m+(c.y+.5)*cell;
  if(mark==="miss"){ctx.strokeStyle="#71909b";ctx.lineWidth=Math.max(1,cell*.05);ctx.beginPath();ctx.arc(x,y,cell*.13,0,Math.PI*2);ctx.stroke();ctx.fillStyle="#71909b";ctx.fillRect(x-cell*.025,y-cell*.025,cell*.05,cell*.05);}
  if(mark==="echo"){ctx.strokeStyle="#7ce5df";ctx.lineWidth=Math.max(1,cell*.04);for(let i=0;i<2;i++){ctx.globalAlpha=.45+.3*Math.sin(t*4+i);ctx.beginPath();ctx.arc(x,y,cell*(.15+i*.11),0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;}
  if(mark==="hit"||mark==="sunk"){ctx.fillStyle=mark==="sunk"?"#e5d78a":"#ff8585";ctx.globalAlpha=.7+.25*Math.sin(t*8);ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?cell*.16:cell*.27;ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.globalAlpha=1;}
}

export function pointerToCoord(canvas:HTMLCanvasElement,clientX:number,clientY:number):Coord|null{const rect=canvas.getBoundingClientRect();const size=rect.width,m=size*.075,cell=(size-m*1.18)/GRID_SIZE;const x=Math.floor((clientX-rect.left-m)/cell),y=Math.floor((clientY-rect.top-m)/cell);return x>=0&&y>=0&&x<8&&y<8?{x,y}:null;}
