(function () {
  'use strict';
  var root = document.getElementById('admin-app');
  var cfg = window.SUPABASE_CONFIG;
  var client = window.supabase.createClient(cfg.url, cfg.publishableKey);
  var session = null;
  var listings = [];
  var leads = [];
  var activeSection = 'listings';
  var leadStatusFilter = 'all';
  var editingImages = [];
  var editingPurposes = [];
  var PROVINCE_DISTRICTS = {
    'ปทุมธานี': ['เมืองปทุมธานี','คลองหลวง','ธัญบุรี','หนองเสือ','ลาดหลุมแก้ว','ลำลูกกา','สามโคก'],
    'นครนายก': ['เมืองนครนายก','ปากพลี','บ้านนา','องครักษ์']
  };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function list(v) { return String(v || '').split(/,|\n/).map(function(x){return x.trim();}).filter(Boolean); }
  function googleMapUrl(v) { var u=String(v||'').trim(); return /^(?:https?:\/\/)?(?:(?:(?:www|maps)\.)?google\.[^/]+(?:\/maps|\/\?q=)|maps\.app\.goo\.gl|goo\.gl\/maps)(?:\/|$|[^\s]*)/i.test(u) ? u : ''; }
  function coordinatesFromMapUrl(v) {
    var u=String(v||'').trim(), m=u.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/) || u.match(/[?&](?:query|q|ll)=(-?\d+(?:\.\d+)?)%?2C\s*(-?\d+(?:\.\d+)?)/i);
    return m ? (Number(m[1]) + ', ' + Number(m[2])) : '';
  }
  function statusText(v) { return {draft:'ฉบับร่าง',available:'พร้อมขาย',reserved:'จองแล้ว',sold:'ขายแล้ว'}[v] || v; }
  function leadStatusText(v) { return {new:'ลูกค้าใหม่',contacted:'ติดต่อแล้ว',appointment:'นัดหมายแล้ว',closed:'ปิดการติดตาม'}[v] || v; }
  function leadTypeText(v) { return {interest:'สนใจที่ดิน',appt:'ขอนัดดูแปลง',docs:'ขอเอกสาร',report:'แจ้งปัญหาประกาศ'}[v] || v; }
  function emailStatusText(v) { return {pending:'รอส่งอีเมล',sending:'กำลังส่งอีเมล',sent:'ส่งอีเมลแล้ว',failed:'ส่งอีเมลไม่สำเร็จ'}[v] || 'รอส่งอีเมล'; }
  function leadDate(v) { try{return new Date(v).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'});}catch(e){return String(v||'');} }
  function nextSortOrder() {
    return listings.reduce(function(max, item){return Math.max(max, Number(item.sort_order) || 0);}, 0) + 1;
  }
  function districtsForProvince(province) { return (PROVINCE_DISTRICTS[province] || PROVINCE_DISTRICTS['ปทุมธานี']).slice(); }
  function parsePrice(v) { return Number(String(v == null ? '' : v).replace(/,/g, '').replace(/[^0-9]/g, '')) || 0; }
  function formatPriceInput(v) {
    var digits = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    return digits ? Number(digits).toLocaleString('en-US') : '';
  }
  function draftStorageKey(id){return 'saithong-admin-draft-v1:' + ((session&&session.user&&session.user.id)||'admin') + ':' + (id||'new');}
  function hasLocalDraft(id){try{return !!localStorage.getItem(draftStorageKey(id));}catch(e){return false;}}

  function loginView(message) {
    root.innerHTML = '<section class="card login"><h1>เข้าสู่ระบบผู้ดูแล</h1><p class="muted">ใช้บัญชีที่ได้รับสิทธิ์จากทรายทองพัฒนา</p>' +
      (message ? '<div class="error">' + esc(message) + '</div>' : '') +
      '<form id="login-form"><div class="field"><label>อีเมล</label><input name="email" type="email" required autocomplete="username"></div>' +
      '<div class="field" style="margin-top:14px"><label>รหัสผ่าน</label><input name="password" type="password" required minlength="8" autocomplete="current-password"></div>' +
      '<button class="btn btn-primary full" style="margin-top:20px">เข้าสู่ระบบ</button></form></section>';
    document.getElementById('login-form').addEventListener('submit', login);
  }

  async function login(e) {
    e.preventDefault();
    var btn = e.target.querySelector('button'); btn.disabled = true;
    var data = new FormData(e.target);
    var result = await client.auth.signInWithPassword({email:data.get('email'),password:data.get('password')});
    if (result.error) { loginView('อีเมลหรือรหัสผ่านไม่ถูกต้อง'); return; }
    session = result.data.session; await verifyAdmin();
  }

  async function verifyAdmin() {
    var uid = session && session.user && session.user.id;
    if (!uid) { loginView(); return; }
    var check = await client.from('site_admins').select('user_id').eq('user_id', uid).maybeSingle();
    if (check.error || !check.data) {
      await client.auth.signOut(); session = null;
      loginView('บัญชีนี้ยังไม่ได้รับสิทธิ์ผู้ดูแล'); return;
    }
    await loadAdminData();
  }

  async function loadAdminData() {
    root.innerHTML = '<p class="loading">กำลังโหลดข้อมูลระบบจัดการ…</p>';
    var results = await Promise.all([
      client.from('land_listings').select('*').order('sort_order',{ascending:false}).order('created_at',{ascending:false}),
      client.from('customer_leads').select('*').order('created_at',{ascending:false})
    ]);
    if (results[0].error || results[1].error) {
      root.innerHTML = '<div class="error">โหลดข้อมูลไม่สำเร็จ: ' + esc((results[0].error||results[1].error).message) + '</div>';
      return;
    }
    listings = results[0].data || [];
    leads = results[1].data || [];
    panelView();
  }

  async function loadListings() {
    var result = await client.from('land_listings').select('*').order('sort_order',{ascending:false}).order('created_at',{ascending:false});
    if (result.error) { root.innerHTML = '<div class="error">โหลดข้อมูลไม่สำเร็จ: ' + esc(result.error.message) + '</div>'; return; }
    listings = result.data || []; panelView();
  }

  async function loadLeads() {
    var result = await client.from('customer_leads').select('*').order('created_at',{ascending:false});
    if (result.error) { window.alert('โหลดข้อมูลลูกค้าไม่สำเร็จ: ' + result.error.message); return; }
    leads = result.data || []; panelView();
  }

  function adminTabs() {
    var newCount = leads.filter(function(x){return x.status==='new';}).length;
    return '<nav class="admin-tabs" aria-label="เมนูระบบจัดการ"><button data-section="listings" class="'+(activeSection==='listings'?'active':'')+'">ประกาศที่ดิน <span>'+listings.length+'</span></button><button data-section="leads" class="'+(activeSection==='leads'?'active':'')+'">ลูกค้าสนใจ <span class="'+(newCount?'has-new':'')+'">'+newCount+' ใหม่</span></button></nav>';
  }

  function bindAdminTabs() {
    root.querySelectorAll('[data-section]').forEach(function(button){button.onclick=function(){activeSection=button.dataset.section;panelView();};});
  }

  function panelView() {
    var openModal = document.querySelector('#editor-modal,#lead-modal'); if (openModal) openModal.remove(); document.body.classList.remove('modal-open');
    if (activeSection === 'leads') { leadsView(); return; }
    var rows = listings.map(function (x, index) {
      var image = (x.images || [])[0] || 'logo.png';
      var rankControl = index === 0 ? '<span class="top-rank">★ อยู่บนสุด</span>' : '<button class="btn btn-feature" data-feature="' + x.id + '">★ ดันขึ้นบน</button>';
      return '<article class="listing-row '+(index===0?'is-featured':'')+'"><img src="' + esc(image) + '" alt=""><div><h3>' + esc(x.title) + '</h3><p>' + esc(x.district) + ' · ' + esc(x.province || 'ปทุมธานี') + ' · ฿' + Number(x.price).toLocaleString('en-US') + ' · ' + statusText(x.status) + (x.published ? ' · เผยแพร่แล้ว' : ' · ยังไม่เผยแพร่') + (hasLocalDraft(x.id)?' · <span class="draft-label">มีฉบับร่าง</span>':'') + '</p></div><div class="row-actions">'+rankControl+'<button class="btn btn-light" data-edit="' + x.id + '">แก้ไข</button><button class="btn btn-danger" data-delete="' + x.id + '">ลบ</button></div></article>';
    }).join('');
    root.innerHTML = adminTabs() + '<div class="toolbar"><div><h1 class="panel-title">จัดการประกาศที่ดิน</h1><p class="muted" style="margin:0">ข้อมูลที่บันทึกจะแสดงกับลูกค้าทุกเครื่อง</p></div><div class="toolbar-actions"><button id="logout" class="btn btn-light">ออกจากระบบ</button><button id="add" class="btn btn-gold">'+(hasLocalDraft(null)?'เขียนฉบับร่างต่อ':'+ เพิ่มที่ดิน')+'</button></div></div><div class="list">' + (rows || '<div class="card empty">ยังไม่มีประกาศ</div>') + '</div>';
    bindAdminTabs();
    document.getElementById('logout').onclick = async function(){await client.auth.signOut();session=null;loginView();};
    document.getElementById('add').onclick = function(){formView(null);};
    root.querySelectorAll('[data-feature]').forEach(function(b){b.onclick=function(){featureListing(b.dataset.feature,b);};});
    root.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){formView(listings.find(function(x){return x.id===b.dataset.edit;}));};});
    root.querySelectorAll('[data-delete]').forEach(function(b){b.onclick=function(){removeListing(b.dataset.delete);};});
  }

  function leadsView() {
    var counts = {all:leads.length,new:0,contacted:0,appointment:0,closed:0};
    leads.forEach(function(item){if(Object.prototype.hasOwnProperty.call(counts,item.status))counts[item.status]++;});
    var statuses = ['all','new','contacted','appointment','closed'];
    var filters = statuses.map(function(status){
      var label = status==='all'?'ทั้งหมด':leadStatusText(status);
      return '<button data-lead-filter="'+status+'" class="'+(leadStatusFilter===status?'active':'')+'"><span>'+esc(label)+'</span><strong>'+counts[status]+'</strong></button>';
    }).join('');
    var filtered = leadStatusFilter==='all' ? leads : leads.filter(function(item){return item.status===leadStatusFilter;});
    var rows = filtered.map(function(item){
      var digits = String(item.phone||'').replace(/\D/g,'');
      var appt = item.appointment_date ? '<span class="lead-appointment">นัด '+esc(new Date(item.appointment_date+'T00:00:00').toLocaleDateString('th-TH',{dateStyle:'medium'}))+'</span>' : '';
      var line = item.line_id ? '<span>LINE: '+esc(item.line_id)+'</span>' : '';
      var emailState='<span class="lead-email-state email-'+esc(item.email_notification_status||'pending')+'">'+esc(emailStatusText(item.email_notification_status))+'</span>';
      return '<article class="lead-row '+(item.status==='new'?'is-new':'')+'"><div class="lead-row-main"><div class="lead-name-line"><h3>'+esc(item.customer_name)+'</h3><span class="lead-type">'+esc(leadTypeText(item.request_type))+'</span>'+appt+emailState+'</div><div class="lead-contact-line"><a href="tel:'+esc(digits)+'">'+esc(item.phone)+'</a>'+line+'<span>'+esc(leadDate(item.created_at))+'</span></div><p>'+esc(item.listing_title||'ไม่ระบุแปลง')+'</p></div><div class="lead-row-actions"><select data-lead-status="'+item.id+'" aria-label="สถานะลูกค้า">'+['new','contacted','appointment','closed'].map(function(status){return '<option value="'+status+'" '+(status===item.status?'selected':'')+'>'+esc(leadStatusText(status))+'</option>';}).join('')+'</select><button class="btn btn-light" data-view-lead="'+item.id+'">ดูรายละเอียด</button></div></article>';
    }).join('');
    root.innerHTML = adminTabs() + '<div class="toolbar lead-toolbar"><div><h1 class="panel-title">ลูกค้าที่สนใจที่ดิน</h1><p class="muted" style="margin:0">ติดตามการติดต่อ นัดหมาย และบันทึกผลการพูดคุย</p></div><button id="logout" class="btn btn-light">ออกจากระบบ</button></div><section class="lead-summary" aria-label="สรุปลูกค้า">'+filters+'</section><div class="lead-list">'+(rows||'<div class="card empty">ยังไม่มีข้อมูลลูกค้าในสถานะนี้</div>')+'</div>';
    bindAdminTabs();
    document.getElementById('logout').onclick = async function(){await client.auth.signOut();session=null;loginView();};
    root.querySelectorAll('[data-lead-filter]').forEach(function(button){button.onclick=function(){leadStatusFilter=button.dataset.leadFilter;leadsView();};});
    root.querySelectorAll('[data-lead-status]').forEach(function(select){select.onchange=function(){updateLeadStatus(select.dataset.leadStatus,select.value,select);};});
    root.querySelectorAll('[data-view-lead]').forEach(function(button){button.onclick=function(){leadDetailView(leads.find(function(item){return item.id===button.dataset.viewLead;}));};});
  }

  async function updateLeadStatus(id, status, control) {
    if(control)control.disabled=true;
    var result=await client.from('customer_leads').update({status:status}).eq('id',id);
    if(result.error){if(control)control.disabled=false;window.alert('อัปเดตสถานะไม่สำเร็จ: '+result.error.message);return;}
    await loadLeads();
  }

  function leadDetailView(item) {
    if(!item)return;
    var modal=document.createElement('div');modal.id='lead-modal';modal.className='modal-overlay';
    var documents=(item.requested_documents||[]).map(function(value){return '<span>'+esc(value)+'</span>';}).join('');
    var digits=String(item.phone||'').replace(/\D/g,'');
    var retryEmail=item.email_notification_status==='sent'?'':'<button type="button" id="retry-lead-email" class="btn btn-light">ส่งอีเมลแจ้งเตือน'+(item.email_notification_status==='failed'?'อีกครั้ง':'ตอนนี้')+'</button>';
    modal.innerHTML='<section class="lead-detail-modal"><div class="modal-head"><div><span class="lead-modal-kicker">'+esc(leadTypeText(item.request_type))+'</span><h1>'+esc(item.customer_name)+'</h1></div><button type="button" class="modal-close" aria-label="ปิด">×</button></div><div class="lead-detail-grid"><div><small>เบอร์โทร</small><a href="tel:'+esc(digits)+'">'+esc(item.phone)+'</a></div><div><small>LINE ID</small><strong>'+esc(item.line_id||'ไม่ได้ระบุ')+'</strong></div><div class="span-2"><small>ที่ดินที่สนใจ</small><strong>'+esc(item.listing_title||'ไม่ได้ระบุ')+'</strong></div><div><small>วันที่ส่งข้อมูล</small><strong>'+esc(leadDate(item.created_at))+'</strong></div><div><small>วันที่ขอนัดดู</small><strong>'+(item.appointment_date?esc(new Date(item.appointment_date+'T00:00:00').toLocaleDateString('th-TH',{dateStyle:'long'})):'ไม่ได้ระบุ')+'</strong></div><div class="span-2 lead-email-detail"><small>อีเมลแจ้งเตือน</small><strong class="lead-email-state email-'+esc(item.email_notification_status||'pending')+'">'+esc(emailStatusText(item.email_notification_status))+'</strong>'+(item.email_notification_sent_at?'<span>'+esc(leadDate(item.email_notification_sent_at))+'</span>':'')+(item.email_notification_error?'<span class="lead-email-error">'+esc(item.email_notification_error)+'</span>':'')+retryEmail+'</div></div>'+(item.report_reason?'<div class="lead-message"><small>เหตุผลที่แจ้ง</small><p>'+esc(item.report_reason)+'</p></div>':'')+(documents?'<div class="lead-documents"><small>เอกสารที่ขอ</small><div>'+documents+'</div></div>':'')+'<div class="lead-message"><small>ข้อความจากลูกค้า</small><p>'+esc(item.message||'ไม่มีข้อความเพิ่มเติม')+'</p></div><div class="field"><label>สถานะการติดตาม</label><select id="lead-detail-status">'+['new','contacted','appointment','closed'].map(function(status){return '<option value="'+status+'" '+(status===item.status?'selected':'')+'>'+esc(leadStatusText(status))+'</option>';}).join('')+'</select></div><div class="field" style="margin-top:14px"><label>บันทึกของทีมงาน</label><textarea id="lead-admin-note" maxlength="4000" rows="4" placeholder="เช่น โทรแล้ว ลูกค้าสนใจนัดดูวันเสาร์">'+esc(item.admin_note||'')+'</textarea></div><div id="lead-modal-message"></div><div class="lead-modal-actions"><button type="button" id="delete-lead" class="btn btn-danger">ลบข้อมูล</button><span></span><a class="btn btn-light" href="tel:'+esc(digits)+'">โทรหาลูกค้า</a><button type="button" id="save-lead" class="btn btn-primary">บันทึกการติดตาม</button></div></section>';
    document.body.appendChild(modal);document.body.classList.add('modal-open');
    function close(){modal.remove();document.body.classList.remove('modal-open');}
    modal.querySelector('.modal-close').onclick=close;
    modal.onclick=function(event){if(event.target===modal)close();};
    modal.querySelector('#save-lead').onclick=async function(){
      var button=this,message=modal.querySelector('#lead-modal-message');button.disabled=true;message.innerHTML='<div class="success">กำลังบันทึก…</div>';
      var result=await client.from('customer_leads').update({status:modal.querySelector('#lead-detail-status').value,admin_note:modal.querySelector('#lead-admin-note').value.trim()||null}).eq('id',item.id);
      if(result.error){button.disabled=false;message.innerHTML='<div class="error">บันทึกไม่สำเร็จ: '+esc(result.error.message)+'</div>';return;}
      close();await loadLeads();
    };
    modal.querySelector('#delete-lead').onclick=async function(){
      if(!window.confirm('ลบข้อมูลลูกค้ารายนี้ออกจากระบบหรือไม่?'))return;
      var result=await client.from('customer_leads').delete().eq('id',item.id);
      if(result.error){window.alert('ลบไม่สำเร็จ: '+result.error.message);return;}close();await loadLeads();
    };
    var retryButton=modal.querySelector('#retry-lead-email');
    if(retryButton)retryButton.onclick=async function(){
      var message=modal.querySelector('#lead-modal-message');retryButton.disabled=true;message.innerHTML='<div class="success">กำลังส่งอีเมลแจ้งเตือน…</div>';
      var result=await client.functions.invoke('notify-new-lead',{body:{lead_id:item.id}});
      if(result.error){retryButton.disabled=false;message.innerHTML='<div class="error">ส่งอีเมลไม่สำเร็จ: '+esc(result.error.message||'กรุณาตรวจสอบการตั้งค่าระบบ')+'</div>';return;}
      close();await loadLeads();
    };
  }

  function formView(x) {
    var originalId = x && x.id;
    var draftKey = draftStorageKey(originalId);
    var savedDraft = null;
    try { savedDraft = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch(e) { savedDraft = null; }
    x = x || {status:'draft',province:'ปทุมธานี',district:'ลำลูกกา',deed:'โฉนด (นส.4)',owner_name:'นายหน้า',sort_order:0,road:true,water:true,power:true,transfer_fee_free:false,published:false,images:[],purposes:[]};
    editingImages = savedDraft&&Array.isArray(savedDraft.images) ? savedDraft.images.slice() : (x.images || []).slice();
    editingPurposes = savedDraft&&Array.isArray(savedDraft.purposes) ? savedDraft.purposes.slice() : (x.purposes || []).slice();
    var nearby = (x.nearby || []).map(function(n){return n.name + ' | ' + n.dist;}).join('\n');
    var coord = (x.latitude != null && x.longitude != null) ? (x.latitude + ', ' + x.longitude) : '';
    var mapLink = googleMapUrl(x.video_url);
    var sizeParts = landSizeParts(x);
    var initialProvince = (savedDraft && savedDraft.values && savedDraft.values.province) || x.province || 'ปทุมธานี';
    if (!PROVINCE_DISTRICTS[initialProvince]) initialProvince = 'ปทุมธานี';
    var districts = districtsForProvince(initialProvince);
    var initialDistrict = (savedDraft && savedDraft.values && savedDraft.values.district) || x.district || districts[0];
    if (districts.indexOf(initialDistrict) < 0) initialDistrict = districts[0];
    var deeds = ['โฉนด (นส.4)','น.ส.3 ก.','น.ส.3','ส.ป.ก.','โปรดสอบถามผู้ขาย'];
    var owners = ['นายหน้า','เจ้าของขายเอง','ทรายทองพัฒนา'];
    var purposeOptions = ['สร้างบ้าน','เกษตร','ลงทุน','รีสอร์ต','โกดัง','ร้านอาหาร'];
    var restoredMessage = savedDraft ? 'กู้คืนฉบับร่างแล้ว · กรอกต่อได้ทันที' + (savedDraft.pendingFiles&&savedDraft.pendingFiles.length?' · โปรดเลือกรูปจากเครื่องใหม่':'') : 'ระบบจะบันทึกฉบับร่างให้อัตโนมัติ';
    var modal = document.createElement('div'); modal.id='editor-modal'; modal.className='modal-overlay';
    modal.innerHTML = '<section class="editor-modal"><div class="modal-head"><h1>' + (x.id ? 'แก้ไขประกาศที่ดิน' : 'เพิ่มประกาศที่ดิน') + '</h1><button type="button" class="modal-close" aria-label="ปิด">×</button></div>' +
      '<div id="draft-bar" class="draft-bar '+(savedDraft?'restored':'')+'"><span class="draft-dot"></span><span id="draft-status">'+restoredMessage+'</span>'+(savedDraft?'<button type="button" id="discard-draft">ล้างฉบับร่าง</button>':'')+'</div>' +
      '<form id="listing-form"><input type="hidden" name="id" value="' + esc(x.id || '') + '"><input type="hidden" name="sort_order" value="' + esc(x.sort_order || 0) + '"><div class="form-grid">' +
      field('ชื่อประกาศ *','title',x.title,'text',true,'span-2') + selectField('จังหวัด','province',initialProvince,Object.keys(PROVINCE_DISTRICTS)) + selectField('อำเภอ','district',initialDistrict,districts) + selectField('เอกสารสิทธิ์','deed',x.deed,deeds,'span-2') +
      field('ราคาขายรวม (บาท) *','price',formatPriceInput(x.price),'text',true,'span-2 price-input-field') +
      '<div class="land-calc-card span-2"><div class="calc-head"><div><strong>ขนาดที่ดิน</strong><small>กรอกแยกเป็น ไร่–งาน–ตารางวา ระบบจะคำนวณให้ทันที</small></div><span>1 ไร่ = 400 ตร.ว.</span></div>' +
        '<div class="land-size-inputs"><div class="field"><label>ไร่</label><input name="size_rai" type="number" min="0" step="1" inputmode="numeric" value="'+esc(sizeParts.rai)+'"></div><div class="field"><label>งาน</label><input name="size_ngan" type="number" min="0" step="1" inputmode="numeric" value="'+esc(sizeParts.ngan)+'"></div><div class="field"><label>ตารางวา</label><input name="size_wa" type="number" min="0" step="any" inputmode="decimal" value="'+esc(sizeParts.wa)+'"></div></div>' +
        '<input type="hidden" name="rai" value="'+esc(x.rai || '')+'"><input type="hidden" name="size_text" value="'+esc(x.size_text || '')+'">' +
        '<div class="calc-summary"><div class="calc-total"><small>พื้นที่รวม</small><strong id="total-wa">0 ตารางวา</strong><span id="rai-equivalent">0 ไร่</span></div><div class="price-stat"><small>ราคาต่อไร่</small><strong id="per-rai">฿0</strong></div><div class="price-stat gold"><small>ราคาต่อตารางวา</small><strong id="per-wa">฿0</strong></div></div>' +
      '</div>' + field('หน้ากว้าง × ลึก','dimensions',x.dimensions,'text',false,'span-2') +
      selectField('ผู้ขาย','owner_name',x.owner_name,owners) + field('ป้ายกำกับ (คั่นด้วย ,)','tags',(x.tags||[]).join(', '),'text',false) +
      '<div class="field span-2"><label>รูปภาพแปลงที่ดิน (เพิ่มได้หลายรูป)</label><p class="field-hint image-order-hint">ลากรูปเพื่อจัดลำดับ หรือใช้ปุ่ม ← → ใต้รูป รูปแรกจะเป็นหน้าปก</p><div id="images-preview" class="images-preview sortable-images"></div><div class="url-add"><input id="image-url" type="url" placeholder="วางลิงก์รูป (URL) แล้วกดเพิ่ม"><button type="button" id="add-url" class="btn btn-primary">เพิ่ม</button></div><label class="upload-drop">⇧ <span>อัปโหลดรูปจากเครื่อง (เลือกหลายรูปได้)</span><input name="image_files" type="file" accept="image/jpeg,image/png,image/webp" multiple></label></div>' +
      '<div class="map-input-card span-2"><div class="map-input-head"><strong>ตำแหน่งแปลงที่ดิน</strong><small>หมุดบนหน้าเว็บและปุ่มเปิด Google Maps จะอ้างอิงจุดเดียวกัน</small></div>' +
      field('พิกัดแผนที่ (ละติจูด, ลองจิจูด)','coordinates',coord,'text',false,'') +
      field('ลิงก์ Google Maps (ไม่บังคับ)','map_url',mapLink,'url',false,'') +
      '<p class="field-hint map-hint">วางลิงก์ Google Maps แบบเต็มที่มีพิกัด ระบบจะดึงพิกัดให้อัตโนมัติ หรือกรอกพิกัดด้านบนเอง เช่น 14.096229, 100.641842</p></div>' +
      area('จุดเด่นของแปลง (บรรทัดละ 1 ข้อ)','highlights',(x.highlights||[]).join('\n'),'span-2') + area('สถานที่ใกล้เคียง: ชื่อ | ระยะทาง','nearby',nearby,'span-2') +
      '<div class="field span-2"><label>เหมาะสำหรับ</label><div id="purpose-chips" class="purpose-chips">' + purposeOptions.map(function(p){return '<button type="button" data-purpose="'+esc(p)+'" class="purpose-chip '+(editingPurposes.indexOf(p)>=0?'active':'')+'">'+esc(p)+'</button>';}).join('') + '</div></div>' +
      '<div class="field span-2 utility-field"><label>สถานะและสาธารณูปโภค</label><p class="field-hint">เลือกข้อมูลที่ตรงกับแปลงนี้ ลูกค้าจะเห็นเป็นจุดเด่นในหน้าประกาศ</p><div class="utility-checks">' + check('verified','ตรวจสอบแล้ว',x.verified,'ข้อมูลแปลงได้รับการยืนยัน') + check('transfer_fee_free','ฟรีค่าโอน',x.transfer_fee_free,'ผู้ขายรับผิดชอบค่าโอน') + check('road','ติดถนน',x.road,'มีทางสาธารณะเข้าถึง') + check('water','มีน้ำ',x.water,'มีระบบประปาพร้อมใช้') + check('power','มีไฟฟ้า',x.power,'มีไฟฟ้าเข้าถึงแปลง') + check('published','เผยแพร่',x.published,'แสดงประกาศให้ลูกค้าเห็น','publish-check') + '</div></div>' +
      '<div class="field"><label>สถานะประกาศ</label><select name="status">' + ['draft','available','reserved','sold'].map(function(s){return '<option value="'+s+'" '+(x.status===s?'selected':'')+'>'+statusText(s)+'</option>';}).join('') + '</select></div></div>' +
      '<div id="form-message"></div><div class="form-actions"><button type="button" id="cancel" class="btn btn-light">ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึกประกาศ</button></div></form></section>';
    document.body.appendChild(modal); document.body.classList.add('modal-open');
    var form=modal.querySelector('#listing-form'),draftTimer=null,draftDirty=false;
    form.dataset.draftKey=draftKey;
    if(savedDraft&&savedDraft.values){Object.keys(savedDraft.values).forEach(function(name){var el=form.elements[name];if(!el||name==='id'||el.type==='file')return;if(el.type==='checkbox')el.checked=!!savedDraft.values[name];else el.value=savedDraft.values[name];});}
    function draftTime(){return new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});}
    function saveDraftNow(){
      if(!form||!form.isConnected)return;
      if(draftTimer){clearTimeout(draftTimer);draftTimer=null;}
      var values={};Array.from(form.elements).forEach(function(el){if(!el.name||el.name==='id'||el.type==='file'||el.type==='submit'||el.type==='button')return;values[el.name]=el.type==='checkbox'?el.checked:el.value;});
      var fileInput=form.elements.image_files,pendingFiles=fileInput?Array.from(fileInput.files||[]).map(function(file){return file.name;}):[];
      try{localStorage.setItem(draftKey,JSON.stringify({values:values,images:editingImages.slice(),purposes:editingPurposes.slice(),pendingFiles:pendingFiles,savedAt:Date.now()}));var status=modal.querySelector('#draft-status'),bar=modal.querySelector('#draft-bar');if(status)status.textContent='บันทึกฉบับร่างแล้ว · '+draftTime()+(pendingFiles.length?' · รูปจากเครื่องต้องเลือกใหม่เมื่อกลับมา':'');if(bar)bar.classList.add('saved');draftDirty=false;}catch(err){var statusErr=modal.querySelector('#draft-status');if(statusErr)statusErr.textContent='พื้นที่บันทึกฉบับร่างเต็ม กรุณาบันทึกประกาศ';}
    }
    function scheduleDraftSave(){draftDirty=true;var bar=modal.querySelector('#draft-bar'),status=modal.querySelector('#draft-status');if(bar)bar.classList.remove('saved');if(status)status.textContent='กำลังบันทึกฉบับร่าง…';if(draftTimer)clearTimeout(draftTimer);draftTimer=setTimeout(saveDraftNow,350);}
    function closeModal(keepDraft){if(keepDraft!==false&&draftDirty)saveDraftNow();if(draftTimer)clearTimeout(draftTimer);window.removeEventListener('beforeunload',saveDraftNow);modal.remove();document.body.classList.remove('modal-open');panelView();}
    form._draftCleanup=function(){if(draftTimer)clearTimeout(draftTimer);window.removeEventListener('beforeunload',saveDraftNow);};
    form.addEventListener('input',scheduleDraftSave);form.addEventListener('change',scheduleDraftSave);window.addEventListener('beforeunload',saveDraftNow);
    modal.querySelector('.modal-close').onclick=closeModal; modal.querySelector('#cancel').onclick=closeModal;
    modal.onclick=function(e){if(e.target===modal)closeModal();};
    if(modal.querySelector('#discard-draft'))modal.querySelector('#discard-draft').onclick=function(){try{localStorage.removeItem(draftKey);}catch(e){}savedDraft=null;draftDirty=false;var original=originalId?listings.find(function(item){return item.id===originalId;}):null;closeModal(false);formView(original||null);};
    modal.querySelector('#add-url').onclick=function(){var input=modal.querySelector('#image-url'),u=input.value.trim();if(u&&editingImages.indexOf(u)<0){editingImages.push(u);input.value='';renderImages();scheduleDraftSave();}};
    modal.querySelectorAll('[data-purpose]').forEach(function(b){b.onclick=function(){var p=b.dataset.purpose,i=editingPurposes.indexOf(p);if(i>=0)editingPurposes.splice(i,1);else editingPurposes.push(p);b.classList.toggle('active');scheduleDraftSave();};});
    modal.querySelector('[name=image_files]').onchange=function(){renderLocalPreviews(this.files);};
    var provinceInput=modal.querySelector('[name=province]'),districtInput=modal.querySelector('[name=district]');
    provinceInput.addEventListener('change',function(){
      var options=districtsForProvince(this.value),current=districtInput.value;
      districtInput.innerHTML=options.map(function(name){return '<option value="'+esc(name)+'">'+esc(name)+'</option>';}).join('');
      districtInput.value=options.indexOf(current)>=0?current:options[0];
      districtInput.dispatchEvent(new Event('change',{bubbles:true}));
    });
    var priceInput=modal.querySelector('[name=price]');
    priceInput.value=formatPriceInput(priceInput.value);
    priceInput.oninput=function(){this.value=formatPriceInput(this.value);updateCalculatedPrices();};
    modal.querySelectorAll('[name=size_rai],[name=size_ngan],[name=size_wa]').forEach(function(input){input.oninput=updateCalculatedPrices;});
    modal.querySelector('[name=map_url]').addEventListener('change', function(){var parsed=coordinatesFromMapUrl(this.value),coordInput=modal.querySelector('[name=coordinates]');if(parsed){coordInput.value=parsed;scheduleDraftSave();}});
    modal.querySelector('#listing-form').addEventListener('submit', saveListing);
    function moveImage(from,to){if(from===to||from<0||to<0||from>=editingImages.length||to>=editingImages.length)return;var item=editingImages.splice(from,1)[0];editingImages.splice(to,0,item);renderImages();scheduleDraftSave();}
    function renderImages(){
      var box=modal.querySelector('#images-preview');
      box.innerHTML=editingImages.map(function(u,i){return '<div class="image-thumb" draggable="true" data-image-index="'+i+'"><img src="'+esc(u)+'" alt="รูปที่ '+(i+1)+'">'+(i===0?'<span>หน้าปก</span>':'<span class="image-number">รูปที่ '+(i+1)+'</span>')+'<button type="button" data-remove-image="'+i+'" aria-label="ลบรูปที่ '+(i+1)+'">×</button><div class="image-order-actions"><button type="button" data-move-image="'+i+'" data-direction="-1" aria-label="เลื่อนรูปไปทางซ้าย" '+(i===0?'disabled':'')+'>←</button><button type="button" data-move-image="'+i+'" data-direction="1" aria-label="เลื่อนรูปไปทางขวา" '+(i===editingImages.length-1?'disabled':'')+'>→</button></div></div>';}).join('');
      box.querySelectorAll('[data-remove-image]').forEach(function(b){b.onclick=function(){editingImages.splice(Number(b.dataset.removeImage),1);renderImages();scheduleDraftSave();};});
      box.querySelectorAll('[data-move-image]').forEach(function(b){b.onclick=function(){var from=Number(b.dataset.moveImage);moveImage(from,from+Number(b.dataset.direction));};});
      box.ondragstart=function(e){var card=e.target.closest('[data-image-index]');if(!card)return;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',card.dataset.imageIndex);card.classList.add('dragging');};
      box.ondragend=function(){box.querySelectorAll('.dragging,.drag-over').forEach(function(el){el.classList.remove('dragging','drag-over');});};
      box.ondragover=function(e){var card=e.target.closest('[data-image-index]');if(!card)return;e.preventDefault();box.querySelectorAll('.drag-over').forEach(function(el){el.classList.remove('drag-over');});card.classList.add('drag-over');};
      box.ondrop=function(e){var card=e.target.closest('[data-image-index]');if(!card)return;e.preventDefault();var from=Number(e.dataTransfer.getData('text/plain')),to=Number(card.dataset.imageIndex);moveImage(from,to);};
    }
    function renderLocalPreviews(files){var box=modal.querySelector('#images-preview');Array.from(files||[]).forEach(function(file){var u=URL.createObjectURL(file),d=document.createElement('div');d.className='image-thumb pending';d.innerHTML='<img src="'+u+'" alt=""><span>รูปใหม่</span>';box.appendChild(d);});}
    function updateCalculatedPrices(){
      var price=parsePrice(modal.querySelector('[name=price]').value);
      var rai=Math.max(0,Number(modal.querySelector('[name=size_rai]').value)||0),ngan=Math.max(0,Number(modal.querySelector('[name=size_ngan]').value)||0),wa=Math.max(0,Number(modal.querySelector('[name=size_wa]').value)||0);
      var totalWa=(rai*400)+(ngan*100)+wa,totalRai=totalWa/400;
      modal.querySelector('[name=rai]').value=totalRai||'';
      modal.querySelector('[name=size_text]').value=formatLandSize(totalWa);
      modal.querySelector('#total-wa').textContent=formatNumber(totalWa)+' ตารางวา';
      modal.querySelector('#rai-equivalent').textContent=totalWa?formatNumber(totalRai)+' ไร่':'0 ไร่';
      modal.querySelector('#per-rai').textContent=totalWa&&price?'฿'+Math.round(price/totalRai).toLocaleString('en-US'):'฿0';
      modal.querySelector('#per-wa').textContent=totalWa&&price?'฿'+Math.round(price/totalWa).toLocaleString('en-US'):'฿0';
    }
    renderImages(); updateCalculatedPrices();
  }

  function field(label,name,value,type,required,cls){return '<div class="field '+(cls||'')+'"><label>'+label+'</label><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(type==='number'?'step="any" ':'')+(name==='price'?'inputmode="numeric" autocomplete="off" ':'')+(required?'required':'')+'></div>';}
  function area(label,name,value,cls){return '<div class="field '+(cls||'')+'"><label>'+label+'</label><textarea name="'+name+'">'+esc(value)+'</textarea></div>';}
  function selectField(label,name,value,options,cls){return '<div class="field '+(cls||'')+'"><label>'+label+'</label><select name="'+name+'">'+options.map(function(o){return '<option value="'+esc(o)+'" '+(o===value?'selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select></div>';}
  function check(name,label,yes,description,cls){return '<label class="utility-option '+(cls||'')+'"><input type="checkbox" name="'+name+'" '+(yes?'checked':'')+'><span class="utility-mark" aria-hidden="true"></span><span class="utility-copy"><strong>'+label+'</strong>'+(description?'<small>'+description+'</small>':'')+'</span></label>';}

  function formatNumber(n){return Number.isInteger(n)?String(n):Number(n.toFixed(4)).toString();}
  function formatLandSize(totalWa){
    if(!totalWa)return '';
    var rai=Math.floor(totalWa/400),remain=totalWa-(rai*400),ngan=Math.floor(remain/100),wa=remain-(ngan*100);
    return rai+' ไร่ '+ngan+' งาน '+formatNumber(wa)+' ตารางวา';
  }
  function landSizeParts(x){
    var text=String((x&&x.size_text)||''),mRai=text.match(/([\d.]+)\s*ไร่/),mNgan=text.match(/([\d.]+)\s*งาน/),mWa=text.match(/([\d.]+)\s*(?:ตารางวา|ตร\.?\s*ว\.?)/);
    var found=mRai||mNgan||mWa,totalWa=found?((Number(mRai&&mRai[1])||0)*400)+((Number(mNgan&&mNgan[1])||0)*100)+(Number(mWa&&mWa[1])||0):((Number(x&&x.rai)||0)*400);
    var rai=Math.floor(totalWa/400),remain=totalWa-(rai*400),ngan=Math.floor(remain/100),wa=remain-(ngan*100);
    return {rai:rai,ngan:ngan,wa:formatNumber(wa)};
  }

  async function uploadImages(files) {
    var urls = [];
    for (var i=0;i<files.length;i++) {
      var file=files[i], clean=file.name.replace(/[^a-zA-Z0-9._-]/g,'-');
      var path=session.user.id+'/'+Date.now()+'-'+i+'-'+clean;
      var up=await client.storage.from('land-images').upload(path,file,{cacheControl:'3600',upsert:false});
      if(up.error) throw up.error;
      urls.push(client.storage.from('land-images').getPublicUrl(path).data.publicUrl);
    }
    return urls;
  }

  async function saveListing(e) {
    e.preventDefault(); var form=e.target, btn=form.querySelector('button[type="submit"]'), msg=document.getElementById('form-message'); if(btn) btn.disabled=true; msg.innerHTML='<div class="success">กำลังบันทึก…</div>';
    try {
      var f=new FormData(form), id=f.get('id'), old=listings.find(function(x){return x.id===id;}), images=editingImages.slice();
      var files=form.elements.image_files.files; if(files.length) images=images.concat(await uploadImages(files));
      var nearby=list(f.get('nearby')).map(function(line){var p=line.split('|');return {name:(p[0]||'').trim(),dist:(p[1]||'').trim()};}).filter(function(n){return n.name;});
      var mapUrl=googleMapUrl(f.get('map_url'));
      var coordValue=coordinatesFromMapUrl(mapUrl) || String(f.get('coordinates')||'').trim();
      var cm=coordValue.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      if(String(f.get('map_url')||'').trim()&&!mapUrl)throw new Error('กรุณาใช้ลิงก์จาก Google Maps เท่านั้น');
      if(mapUrl&&!cm)throw new Error('ลิงก์แบบย่อไม่แสดงพิกัด กรุณากรอกพิกัดละติจูดและลองจิจูดเพิ่มเติม');
      if(Number(f.get('rai'))<=0)throw new Error('กรุณากรอกขนาดที่ดินอย่างน้อย 1 ตารางวา');
      var row={slug:(old&&old.slug)||('land-'+Date.now()),title:f.get('title').trim(),district:f.get('district').trim(),province:f.get('province').trim(),price:parsePrice(f.get('price')),rai:Number(f.get('rai')),size_text:f.get('size_text').trim(),deed:f.get('deed').trim(),owner_name:f.get('owner_name').trim(),dimensions:f.get('dimensions').trim(),latitude:cm?Number(cm[1]):null,longitude:cm?Number(cm[2]):null,images:images,video_url:mapUrl,tags:list(f.get('tags')),purposes:editingPurposes.slice(),highlights:list(f.get('highlights')),nearby:nearby,road:f.has('road'),water:f.has('water'),power:f.has('power'),verified:f.has('verified'),transfer_fee_free:f.has('transfer_fee_free'),published:f.has('published'),status:f.get('status'),sort_order:old?Number(old.sort_order||0):nextSortOrder()};
      var result=id?await client.from('land_listings').update(row).eq('id',id):await client.from('land_listings').insert(row);
      if(result.error) throw result.error; try{if(form.dataset.draftKey)localStorage.removeItem(form.dataset.draftKey);}catch(e){} if(form._draftCleanup)form._draftCleanup(); await loadListings();
    } catch(err){if(btn) btn.disabled=false;msg.innerHTML='<div class="error">บันทึกไม่สำเร็จ: '+esc(err.message)+'</div>';}
  }

  async function removeListing(id) {
    if(!window.confirm('ลบประกาศนี้ออกจากฐานข้อมูลหรือไม่?')) return;
    var result=await client.from('land_listings').delete().eq('id',id);
    if(result.error){window.alert('ลบไม่สำเร็จ: '+result.error.message);return;} await loadListings();
  }

  async function featureListing(id, button) {
    var item=listings.find(function(x){return x.id===id;});
    if(!item||listings[0]&&listings[0].id===id)return;
    if(button){button.disabled=true;button.textContent='กำลังดันขึ้นบน…';}
    var result=await client.from('land_listings').update({sort_order:nextSortOrder()}).eq('id',id);
    if(result.error){if(button){button.disabled=false;button.textContent='★ ดันขึ้นบน';}window.alert('เปลี่ยนลำดับไม่สำเร็จ: '+result.error.message);return;}
    await loadListings();
  }

  client.auth.getSession().then(function (r) { session=r.data.session; session?verifyAdmin():loginView(); });
})();
