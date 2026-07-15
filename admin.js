(function () {
  'use strict';
  var root = document.getElementById('admin-app');
  var cfg = window.SUPABASE_CONFIG;
  var client = window.supabase.createClient(cfg.url, cfg.publishableKey);
  var session = null;
  var listings = [];
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
    await loadListings();
  }

  async function loadListings() {
    var result = await client.from('land_listings').select('*').order('sort_order',{ascending:false}).order('created_at',{ascending:false});
    if (result.error) { root.innerHTML = '<div class="error">โหลดข้อมูลไม่สำเร็จ: ' + esc(result.error.message) + '</div>'; return; }
    listings = result.data || []; panelView();
  }

  function panelView() {
    var openModal = document.getElementById('editor-modal'); if (openModal) openModal.remove(); document.body.classList.remove('modal-open');
    var rows = listings.map(function (x) {
      var image = (x.images || [])[0] || 'logo.png';
      return '<article class="listing-row"><img src="' + esc(image) + '" alt=""><div><h3>' + esc(x.title) + '</h3><p>' + esc(x.district) + ' · ' + esc(x.province || 'ปทุมธานี') + ' · ฿' + Number(x.price).toLocaleString('en-US') + ' · ' + statusText(x.status) + (x.published ? ' · เผยแพร่แล้ว' : ' · ยังไม่เผยแพร่') + (hasLocalDraft(x.id)?' · <span class="draft-label">มีฉบับร่าง</span>':'') + '</p></div><div class="row-actions"><button class="btn btn-light" data-edit="' + x.id + '">แก้ไข</button><button class="btn btn-danger" data-delete="' + x.id + '">ลบ</button></div></article>';
    }).join('');
    root.innerHTML = '<div class="toolbar"><div><h1 class="panel-title">จัดการประกาศที่ดิน</h1><p class="muted" style="margin:0">ข้อมูลที่บันทึกจะแสดงกับลูกค้าทุกเครื่อง</p></div><div class="toolbar-actions"><button id="logout" class="btn btn-light">ออกจากระบบ</button><button id="add" class="btn btn-gold">'+(hasLocalDraft(null)?'เขียนฉบับร่างต่อ':'+ เพิ่มที่ดิน')+'</button></div></div><div class="list">' + (rows || '<div class="card empty">ยังไม่มีประกาศ</div>') + '</div>';
    document.getElementById('logout').onclick = async function(){await client.auth.signOut();session=null;loginView();};
    document.getElementById('add').onclick = function(){formView(null);};
    root.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){formView(listings.find(function(x){return x.id===b.dataset.edit;}));};});
    root.querySelectorAll('[data-delete]').forEach(function(b){b.onclick=function(){removeListing(b.dataset.delete);};});
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
      var row={slug:(old&&old.slug)||('land-'+Date.now()),title:f.get('title').trim(),district:f.get('district').trim(),province:f.get('province').trim(),price:parsePrice(f.get('price')),rai:Number(f.get('rai')),size_text:f.get('size_text').trim(),deed:f.get('deed').trim(),owner_name:f.get('owner_name').trim(),dimensions:f.get('dimensions').trim(),latitude:cm?Number(cm[1]):null,longitude:cm?Number(cm[2]):null,images:images,video_url:mapUrl,tags:list(f.get('tags')),purposes:editingPurposes.slice(),highlights:list(f.get('highlights')),nearby:nearby,road:f.has('road'),water:f.has('water'),power:f.has('power'),verified:f.has('verified'),transfer_fee_free:f.has('transfer_fee_free'),published:f.has('published'),status:f.get('status'),sort_order:Number(f.get('sort_order')||0)};
      var result=id?await client.from('land_listings').update(row).eq('id',id):await client.from('land_listings').insert(row);
      if(result.error) throw result.error; try{if(form.dataset.draftKey)localStorage.removeItem(form.dataset.draftKey);}catch(e){} if(form._draftCleanup)form._draftCleanup(); await loadListings();
    } catch(err){if(btn) btn.disabled=false;msg.innerHTML='<div class="error">บันทึกไม่สำเร็จ: '+esc(err.message)+'</div>';}
  }

  async function removeListing(id) {
    if(!window.confirm('ลบประกาศนี้ออกจากฐานข้อมูลหรือไม่?')) return;
    var result=await client.from('land_listings').delete().eq('id',id);
    if(result.error){window.alert('ลบไม่สำเร็จ: '+result.error.message);return;} await loadListings();
  }

  client.auth.getSession().then(function (r) { session=r.data.session; session?verifyAdmin():loginView(); });
})();
