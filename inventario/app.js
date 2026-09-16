const SUPABASE_URL='https://tfamwywmchpvurizggax.supabase.co';
const SUPABASE_KEY='sb_publishable_1IkYUQPEVIbd__qD00FI0Q_gIOVxkfZ';
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let products=[];let editingId=null;let stream=null;let detector=null;let scanning=false;
const $=id=>document.getElementById(id);
function esc(s=''){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}
async function load(){
 const {data,error}=await db.from('products').select('*').order('name');
 if(error){$('list').innerHTML=`<div class="empty">No se pudo cargar el inventario.<br><small>${esc(error.message)}</small></div>`;return}
 products=data||[];render();
}
function render(){
 const q=$('search').value.trim().toLowerCase();const rows=products.filter(p=>(p.name||'').toLowerCase().includes(q)||(p.barcode||'').toLowerCase().includes(q));
 $('totalProducts').textContent=products.length;$('totalStock').textContent=products.reduce((a,p)=>a+(p.stock||0),0);$('lowStock').textContent=products.filter(p=>(p.stock||0)<=(p.min_stock||0)).length;
 $('list').innerHTML=rows.length?rows.map(p=>`<article class="product" data-id="${p.id}"><div><h3>${esc(p.name)}</h3><p>${esc(p.barcode||'Sin código')} · ${esc(p.category||'Sin categoría')}</p></div><div class="stock ${(p.stock||0)<=(p.min_stock||0)?'low':''}">${p.stock||0}<small>unidades · tocar para editar</small></div></article>`).join(''):'<div class="empty">No hay productos todavía.<br>Pulsa <b>＋ Nuevo</b> o escanea un código.</div>';
 document.querySelectorAll('.product').forEach(x=>x.onclick=()=>openProduct(Number(x.dataset.id)));
}
function openProduct(id=null,code=''){
 editingId=id;const p=products.find(x=>x.id===id)||{};$('modalTitle').textContent=id?'Editar producto':'Nuevo producto';
 $('barcode').value=p.barcode||code;$('name').value=p.name||'';$('category').value=p.category||'';$('price').value=p.price??'';$('stock').value=p.stock??0;$('minStock').value=p.min_stock??5;$('deleteBtn').classList.toggle('hidden',!id);$('modal').classList.remove('hidden');setTimeout(()=>$('name').focus(),50);
}
async function save(){
 const payload={barcode:$('barcode').value.trim()||null,name:$('name').value.trim(),category:$('category').value.trim()||null,price:Number($('price').value||0),stock:Math.max(0,parseInt($('stock').value||0)),min_stock:Math.max(0,parseInt($('minStock').value||0))};
 if(!payload.name){alert('Escribe el nombre del producto.');return}
 let error;if(editingId){({error}=await db.from('products').update(payload).eq('id',editingId));}else{({error}=await db.from('products').insert(payload));}
 if(error){alert(error.message);return}$('modal').classList.add('hidden');await load();
}
async function remove(){if(!editingId||!confirm('¿Eliminar este producto?'))return;const {error}=await db.from('products').delete().eq('id',editingId);if(error)alert(error.message);else{$('modal').classList.add('hidden');load();}}
function findCode(code){code=String(code).trim();const p=products.find(x=>String(x.barcode||'')===code);if(p){closeScanner();openProduct(p.id);return}closeScanner();openProduct(null,code);}
async function startScanner(){
 $('scanner').classList.remove('hidden');$('scanMsg').textContent='Solicitando cámara…';
 try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});$('video').srcObject=stream;await $('video').play();$('scanMsg').textContent='Apunta la cámara al código de barras.';}
 catch(e){$('scanMsg').textContent='No se pudo abrir la cámara. Revisa el permiso del navegador.';return}
 if('BarcodeDetector' in window){try{detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','codabar']});scanLoop();}catch(e){detector=null}}
}
async function scanLoop(){if(scanning||!detector)return;scanning=true;while(!$('scanner').classList.contains('hidden')&&stream){try{const codes=await detector.detect($('video'));if(codes.length&&codes[0].rawValue){findCode(codes[0].rawValue);break}}catch(e){}await new Promise(r=>setTimeout(r,180))}scanning=false}
function closeScanner(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}$('video').srcObject=null;$('scanner').classList.add('hidden');scanning=false}
$('search').oninput=render;$('newBtn').onclick=()=>openProduct();$('scanBtn').onclick=startScanner;$('closeModal').onclick=()=>$('modal').classList.add('hidden');$('closeScanner').onclick=closeScanner;$('saveBtn').onclick=save;$('deleteBtn').onclick=remove;$('manualBtn').onclick=()=>{if($('manualCode').value.trim())findCode($('manualCode').value)};$('manualCode').onkeydown=e=>{if(e.key==='Enter')$('manualBtn').click()};
load();
