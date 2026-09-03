const API_URL='https://script.google.com/macros/s/AKfycbzpeCelwZKeuK4Dh4kdP5J4_VltGsu_vwEo73-6__y3VAXMu27VzsdGdpnd25eTktkakw/exec';
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('es-HN',{style:'currency',currency:'HNL',minimumFractionDigits:2}).format(Number(n)||0);

function showError(text){ $('loginMsg').textContent=text; $('loginMsg').className='msg error'; }
function jsonp(url){
 return new Promise((resolve,reject)=>{
  const cb='juntaAgua_'+Date.now()+'_'+Math.floor(Math.random()*10000);
  const script=document.createElement('script');
  const timer=setTimeout(()=>{cleanup();reject(new Error('Tiempo de espera agotado.'));},15000);
  function cleanup(){clearTimeout(timer);delete window[cb];script.remove();}
  window[cb]=data=>{cleanup();resolve(data);};
  script.src=url+(url.includes('?')?'&':'?')+'callback='+cb;
  script.onerror=()=>{cleanup();reject(new Error('No se pudo conectar con el servidor.'));};
  document.body.appendChild(script);
 });
}
function clear(el){el.innerHTML='';}
function empty(el,text='No hay información disponible.'){clear(el);const p=document.createElement('p');p.className='empty';p.textContent=text;el.appendChild(p);}
function addItem(container,title,date,text){
 const item=document.createElement('div');item.className='item';
 if(title){const t=document.createElement('div');t.className='item-title';t.textContent=title;item.appendChild(t);}
 if(date){const d=document.createElement('div');d.className='item-date';d.textContent=date;item.appendChild(d);}
 if(text){const x=document.createElement('div');x.className='item-text';x.textContent=text;item.appendChild(x);}
 container.appendChild(item);
}

function render(data){
 const a=data.abonado,c=data.cuenta,pending=Number(c.totalAdeudado)||0;
 $('nombre').textContent=a.nombre||'Abonado';
 $('codigo').textContent=a.codigo||'—';
 $('identidadVista').textContent=a.identidad||'—';
 $('direccion').textContent=a.direccion||'—';
 const estadoEl = $('estadoAbonado');
 const estadoTexto = String(a.estado || 'SIN ESTADO').trim();
 const estadoNormalizado = estadoTexto.toUpperCase()
   .normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 const esActivo = estadoNormalizado === 'ACTIVO' || estadoNormalizado === 'ACTIVA';
 const esInactivo = ['INACTIVO','INACTIVA','SUSPENDIDO','SUSPENDIDA','BAJA','CANCELADO','CANCELADA'].includes(estadoNormalizado);
 estadoEl.classList.remove('status-active','status-inactive');
 estadoEl.textContent = '● '+estadoTexto;
 estadoEl.classList.add(esActivo && !esInactivo ? 'status-active' : 'status-inactive');
 $('pagadoTotal').textContent=money(c.totalPagado);
 $('anioMetric').textContent='Este año '+(c.anio||'');
 $('mensualidadesPagadas').textContent=money(c.totalMensualidadesPagadas);
 $('mesesPagadosTexto').textContent=(Number(c.cantidadPagados)||0)+' meses';
 $('moraPagada').textContent=money(c.totalMoraPagada);
 const moraMeses=(c.historial||[]).filter(p=>Number(p.mora)>0).length;
 $('mesesMoraTexto').textContent=moraMeses ? moraMeses+' meses con mora' : 'Sin mora';
 $('deuda').textContent=money(pending);
 $('pendienteTexto').textContent=pending>0 ? (Number(c.cantidadPendientes)||0)+' meses pendientes' : 'Estás al día';
 $('deudaGrande').textContent=money(pending);
 $('status').className='status'+(pending>0?' pending':'');
 $('estado').textContent=pending>0?'PENDIENTE':'AL DÍA';
 $('estadoMensaje').textContent=pending>0?'Revisa los meses pendientes y el saldo de tu cuenta.':'Gracias por mantenerte al día con tus pagos.';

 const grid=$('monthGrid');clear(grid);
 (c.historial||[]).forEach(p=>{
   const card=document.createElement('div');
   const late=p.estado==='PAGADO' && Number(p.mora)>0;
   card.className=p.estado==='PAGADO'?(late?'month-card late':'month-card paid'):(p.estado==='PENDIENTE'?'month-card pending':'month-card future');
   const name=document.createElement('div');name.className='m-name';name.textContent=p.mes||'';
   const circle=document.createElement('div');circle.className='circle';circle.textContent=p.estado==='PAGADO'?'✓':(p.estado==='PENDIENTE'?'!':'◷');
   const state=document.createElement('div');state.className='m-state';
   const amount=document.createElement('div');amount.className='m-amount';
   if(p.estado==='PAGADO'){amount.textContent=money(p.monto);state.textContent=late?'PAGADO CON MORA':'PAGADO';}
   else if(p.estado==='PENDIENTE'){amount.textContent='L 65.00';state.textContent='PENDIENTE';}
   else{amount.textContent='—';state.textContent='AÚN NO CORRESPONDE';}
   card.append(name,circle,state,amount);grid.appendChild(card);
 });
 if(!grid.children.length)empty(grid,'Sin información de pagos.');

 const h=$('historialLista');clear(h);
 (c.historial||[]).filter(p=>p.estado==='PAGADO').forEach(p=>{
   const row=document.createElement('div');row.className='item';
   const late=Number(p.mora)>0;
   addItem(row,p.mes,late?'Pagado con mora':'Pagado',money(p.monto)+(late?' · Incluye L5 de mora':''));
   h.appendChild(row);
 });
 if(!h.children.length)empty(h,'Sin pagos registrados.');

 const renderList=(id,items,fn,emptyText)=>{
   const el=$(id);clear(el);(items||[]).forEach(fn);if(!el.children.length)empty(el,emptyText);
 };
 // ===== REUNIONES Y MULTAS =====
 // Acepta tanto la respuesta nueva como variantes antiguas del backend.
 const rm = data.reunionesMultas || data.reunionesYMultas || data.reunionesAsistidas || null;
 const reunionesPublicadas = Array.isArray(data.reuniones) ? data.reuniones : [];
 const rmTotal = rm ? Number(rm.totalReuniones ?? rm.total) || 0 : null;
 const rmAsistidas = rm ? Number(rm.asistidas ?? rm.reunionesAsistidas) || 0 : null;
 const rmMultas = rm ? Number(rm.totalMultas ?? rm.multas) || 0 : null;
 $('reunionesTotal').textContent = rm ? rmTotal : '—';
 $('reunionesAsistidas').textContent = rm ? rmAsistidas : '—';
 $('reunionesMultas').textContent = rm ? money(rmMultas) : '—';
 const detalle = rm && (rm.detalle || rm.reuniones || rm.items) || [];
 const rd = $('reunionesAsistenciaLista'); clear(rd);
 const rr = $('reunionesDetalleResumen'); clear(rr);
 if(rm) [['Reuniones',rmTotal,''],['Asistidas',rmAsistidas,'attended'],['No asistidas',Math.max(0,rmTotal-rmAsistidas),'absent'],['Multas',money(rmMultas),'fine']].forEach(v=>{
   const d=document.createElement('div'); d.className='meeting-stat '+v[2];
   const sm=document.createElement('small'); sm.textContent=v[0];
   const st=document.createElement('strong'); st.textContent=v[1]; d.append(sm,st); rr.appendChild(d);
 });
 detalle.forEach(x=>{
   const row=document.createElement('div'); row.className='meeting-row';
   const left=document.createElement('div');
   const date=document.createElement('div'); date.className='meeting-date'; date.textContent=x.fecha||x.date||x.fechaReunion||'Fecha no disponible';
   const rawAsistencia = x.asistio ?? x.asistencia ?? x.asistioReunion ?? x.presente;
   const yes = rawAsistencia===true || String(rawAsistencia).trim().toUpperCase()==='TRUE' || String(rawAsistencia).trim().toUpperCase()==='VERDADERO' || String(rawAsistencia).trim().toUpperCase()==='SI' || String(rawAsistencia).trim().toUpperCase()==='SÍ' || String(rawAsistencia).trim().toUpperCase()==='ASISTIO' || String(rawAsistencia).trim().toUpperCase()==='ASISTIÓ';
   const st=document.createElement('div'); st.className='meeting-status '+(yes?'yes':'no'); st.textContent=yes?'✓ ASISTIÓ':'✕ NO ASISTIÓ';
   left.append(date,st);
   const fine=document.createElement('div'); fine.className='meeting-fine'; fine.textContent=yes?'Sin multa':money(Number(x.multa ?? x.montoMulta ?? 200)||200);
   row.append(left,fine); rd.appendChild(row);
 });
 if(!detalle.length){
   const p=document.createElement('p'); p.className='empty'; p.textContent='Aún no hay registros de asistencia disponibles.'; rd.appendChild(p);
   rr.innerHTML='';
 }

 renderList('comunicadosLista',data.comunicados,x=>addItem($('comunicadosLista'),x.titulo,x.fecha,x.mensaje),'No hay comunicados publicados.');
 renderList('suministroLista',data.suministro,x=>addItem($('suministroLista'),x.sector,x.fecha,(x.horaInicio||'')+' - '+(x.horaFin||'')+(x.observacion?' · '+x.observacion:'')),'No hay horarios publicados.');
 renderList('cortesLista',data.cortes,x=>addItem($('cortesLista'),x.sector,x.fecha,(x.horaInicio||'')+' - '+(x.horaFin||'')+(x.motivo?' · '+x.motivo:'')),'No hay cortes programados.');
 renderList('reunionesLista',reunionesPublicadas,x=>addItem($('reunionesLista'),x.descripcion||'Reunión de abonados',x.fecha,(x.lugar||'')+' · '+(x.hora||'')),'No hay reuniones publicadas.');
 renderList('consejosLista',data.consejos,x=>addItem($('consejosLista'),x.titulo,x.fecha,x.consejo),'No hay consejos publicados.');

 $('login').classList.add('hidden');
 $('panel').classList.remove('hidden');
 $('salir').classList.remove('hidden');
 $('menuBtn').classList.remove('hidden');
 $('sidebar').classList.add('opened');
 go('inicio');
 document.querySelector('.topbar').scrollIntoView({behavior:'smooth',block:'start'});
}

async function consultar(){
 const id=formatIdentidad($('identidad').value.trim());
 $('identidad').value=id;
 if(id.replace(/\D/g,'').length!==13){showError('Escriba un número de identidad válido.');return;}
 $('loginMsg').className='msg hidden';$('consultar').disabled=true;$('consultar').textContent='Consultando…';
 try{
   const data=await jsonp(API_URL+'?identidad='+encodeURIComponent(id));
   if(!data||!data.ok){showError(data&&data.mensaje?data.mensaje:'No encontramos esa identidad.');return;}
   render(data);
 }catch(err){showError('No fue posible consultar la cuenta. Revise la conexión del sistema.');}
 finally{$('consultar').disabled=false;$('consultar').textContent='Consultar mi cuenta';}
}
function salir(){
 $('panel').classList.add('hidden');$('login').classList.remove('hidden');$('salir').classList.add('hidden');
 $('menuBtn').classList.add('hidden');
 $('sidebar').classList.remove('opened','open');
 $('menuBackdrop').classList.remove('show');
 $('identidad').value='';$('identidad').focus();window.scrollTo({top:0,behavior:'smooth'});
}
function go(target){
 const realTarget = target==='pagos' ? 'inicio' : target;
 document.querySelectorAll('.screen').forEach(v=>{
   v.classList.remove('active');
 });
 const targetEl=document.getElementById(realTarget);
 if(targetEl) targetEl.classList.add('active');
 document.querySelectorAll('.nav button').forEach(b=>{
   b.classList.toggle('active',b.dataset.target===target);
 });
 closeMenu();
 window.scrollTo({top:0,behavior:'smooth'});
}
$('consultar').addEventListener('click',consultar);
$('identidad').addEventListener('keydown',e=>{if(e.key==='Enter')consultar();});
$('salir').addEventListener('click',salir);
function toggleMenu(){
 const side=$('sidebar'), back=$('menuBackdrop');
 const mobile=window.innerWidth<=720;
 if(mobile){
   side.classList.toggle('open');
   back.classList.toggle('show');
 }else{
   side.classList.toggle('opened');
 }
}
function closeMenu(){
 $('sidebar').classList.remove('open');
 $('menuBackdrop').classList.remove('show');
}
function formatIdentidad(value){
 const digits=String(value||'').replace(/\D/g,'').slice(0,13);
 if(digits.length<=4)return digits;
 if(digits.length<=8)return digits.slice(0,4)+'-'+digits.slice(4);
 return digits.slice(0,4)+'-'+digits.slice(4,8)+'-'+digits.slice(8);
}
$('menuBtn').addEventListener('click',toggleMenu);
$('menuBackdrop').addEventListener('click',closeMenu);
$('identidad').addEventListener('input',e=>{e.target.value=formatIdentidad(e.target.value);});
document.querySelectorAll('[data-target]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.target)));
