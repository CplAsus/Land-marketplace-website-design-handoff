(function () {
  'use strict';
  var root = document.getElementById('admin-app');
  var cfg = window.SUPABASE_CONFIG;
  var client = window.supabase.createClient(cfg.url, cfg.publishableKey);
  var session = null;
  var listings = [];
  var editingImages = [];
  var editingPurposes = [];

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function list(v) { return String(v || '').split(/,|\n/).map(function(x){return x.trim();}).filter(Boolean); }
  function statusText(v) { return {draft:'ฉบับร่าง',available:'พร้อมขาย',reserved:'จองแล้ว',sold:'ขายแล้ว'}[v] || v; }

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
      return '<article class="listing-row"><img src="' + esc(image) + '" alt=""><div><h3>' + esc(x.title) + '</h3><p>' + esc(x.district) + ' · ฿' + Number(x.price).toLocaleString('en-US') + ' · ' + statusText(x.status) + (x.published ? ' · เผยแพร่แล้ว' : ' · ยังไม่เผยแพร่') + '</p></div><div class="row-actions"><button class="btn btn-light" data-edit="' + x.id + '">แก้ไข</button><button class="btn btn-danger" data-delete="' + x.id + '">ลบ</button></div></article>';
    }).join('');
    root.innerHTML = '<div class="toolbar"><div><h1 class="panel-title">จัดการประกาศที่ดิน</h1><p class="muted" style="margin:0">ข้อมูลที่บันทึกจะแสดงกับลูกค้าทุกเครื่อง</p></div><div class="toolbar-actions"><button id="logout" class="btn btn-light">ออกจากระบบ</button><button id="add" class="btn btn-gold">+ เพิ่มที่ดิน</button></div></div><div class="list">' + (rows || '<div class="card empty">ยังไม่มีประกาศ</div>') + '</div>';
    document.getElementById('logout').onclick = async function(){await client.auth.signOut();session=null;loginView();};
    document.getElementById('add').onclick = function(){formView(null);};
    root.querySelectorAll('[data-edit]').forEach(function(b){b.onclick=function(){formView(listings.find(function(x){return x.id===b.dataset.edit;}));};});
    root.querySelectorAll('[data-delete]').forEach(function(b){b.onclick=function(){removeListing(b.dataset.delete);};});
  }

  function formView(x) {
    x = x || {status:'draft',province:'ปทุมธานี',district:'ลำลูกกา',deed:'โฉนด (นส.4)',owner_name:'นายหน้า',sort_order:0,road:true,water:true,power:true,transfer_fee_free:false,published:false,images:[],purposes:[]};
    editingImages = (x.images || []).slice();
    editingPurposes = (x.purposes || []).slice();
    var nearby = (x.nearby || []).map(function(n){return n.name + ' | ' + n.dist;}).join('\n');
    var coord = (x.latitude != null && x.longitude != null) ? (x.latitude + ', ' + x.longitude) : '';
    var districts = ['เมืองปทุมธานี','คลองหลวง','ธัญบุรี','หนองเสือ','ลาดหลุมแก้ว','ลำลูกกา','สามโคก'];
    var deeds = ['โฉนด (นส.4)','น.ส.3 ก.','น.ส.3','ส.ป.ก.','โปรดสอบถามผู้ขาย'];
    var owners = ['นายหน้า','เจ้าของขายเอง','ทรายทองพัฒนา'];
    var purposeOptions = ['สร้างบ้าน','เกษตร','ลงทุน','รีสอร์ต','โกดัง','ร้านอาหาร'];
    var modal = document.createElement('div'); modal.id='editor-modal'; modal.className='modal-overlay';
    modal.innerHTML = '<section class="editor-modal"><div class="modal-head"><h1>' + (x.id ? 'แก้ไขประกาศที่ดิน' : 'เพิ่มประกาศที่ดิน') + '</h1><button type="button" class="modal-close" aria-label="ปิด">×</button></div>' +
      '<form id="listing-form"><input type="hidden" name="id" value="' + esc(x.id || '') + '"><input type="hidden" name="province" value="ปทุมธานี"><input type="hidden" name="sort_order" value="' + esc(x.sort_order || 0) + '"><div class="form-grid">' +
      field('ชื่อประกาศ *','title',x.title,'text',true,'span-2') + selectField('อำเภอ','district',x.district,districts) + selectField('เอกสารสิทธิ์','deed',x.deed,deeds) +
      field('ราคา (บาท) *','price',x.price,'number',true) + field('ขนาด (ไร่) *','rai',x.rai,'number',true) + field('ขนาด (ไร่-งาน-ตร.ว.)','size_text',x.size_text,'text',true) + field('หน้ากว้าง × ลึก','dimensions',x.dimensions,'text',false) +
      '<div class="price-stat"><small>ราคาต่อไร่</small><strong id="per-rai">฿0</strong></div><div class="price-stat gold"><small>ราคาต่อตารางวา</small><strong id="per-wa">฿0</strong></div>' +
      selectField('ผู้ขาย','owner_name',x.owner_name,owners) + field('ป้ายกำกับ (คั่นด้วย ,)','tags',(x.tags||[]).join(', '),'text',false) +
      '<div class="field span-2"><label>รูปภาพแปลงที่ดิน (เพิ่มได้หลายรูป)</label><div id="images-preview" class="images-preview"></div><div class="url-add"><input id="image-url" type="url" placeholder="วางลิงก์รูป (URL) แล้วกดเพิ่ม"><button type="button" id="add-url" class="btn btn-primary">เพิ่ม</button></div><label class="upload-drop">⇧ <span>อัปโหลดรูปจากเครื่อง (เลือกหลายรูปได้)</span><input name="image_files" type="file" accept="image/jpeg,image/png,image/webp" multiple></label></div>' +
      field('วิดีโอแปลง (ลิงก์ YouTube หรือไฟล์วิดีโอ)','video_url',x.video_url,'url',false,'span-2') + field('พิกัดแผนที่ (lat, lng)','coordinates',coord,'text',false,'span-2') +
      area('จุดเด่นของแปลง (บรรทัดละ 1 ข้อ)','highlights',(x.highlights||[]).join('\n'),'span-2') + area('สถานที่ใกล้เคียง: ชื่อ | ระยะทาง','nearby',nearby,'span-2') +
      '<div class="field span-2"><label>เหมาะสำหรับ</label><div id="purpose-chips" class="purpose-chips">' + purposeOptions.map(function(p){return '<button type="button" data-purpose="'+esc(p)+'" class="purpose-chip '+(editingPurposes.indexOf(p)>=0?'active':'')+'">'+esc(p)+'</button>';}).join('') + '</div></div>' +
      '<div class="field span-2"><label>สถานะและสาธารณูปโภค</label><div class="checks compact">' + check('verified','ตรวจสอบแล้ว',x.verified) + check('transfer_fee_free','ฟรีค่าโอน',x.transfer_fee_free) + check('road','ติดถนน',x.road) + check('water','มีน้ำ',x.water) + check('power','มีไฟฟ้า',x.power) + check('published','เผยแพร่',x.published) + '</div></div>' +
      '<div class="field"><label>สถานะประกาศ</label><select name="status">' + ['draft','available','reserved','sold'].map(function(s){return '<option value="'+s+'" '+(x.status===s?'selected':'')+'>'+statusText(s)+'</option>';}).join('') + '</select></div></div>' +
      '<div id="form-message"></div><div class="form-actions"><button type="button" id="cancel" class="btn btn-light">ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึกประกาศ</button></div></form></section>';
    document.body.appendChild(modal); document.body.classList.add('modal-open');
    function closeModal(){modal.remove();document.body.classList.remove('modal-open');}
    modal.querySelector('.modal-close').onclick=closeModal; modal.querySelector('#cancel').onclick=closeModal;
    modal.onclick=function(e){if(e.target===modal)closeModal();};
    modal.querySelector('#add-url').onclick=function(){var input=modal.querySelector('#image-url'),u=input.value.trim();if(u){editingImages.push(u);input.value='';renderImages();}};
    modal.querySelectorAll('[data-purpose]').forEach(function(b){b.onclick=function(){var p=b.dataset.purpose,i=editingPurposes.indexOf(p);if(i>=0)editingPurposes.splice(i,1);else editingPurposes.push(p);b.classList.toggle('active');};});
    modal.querySelector('[name=image_files]').onchange=function(){renderLocalPreviews(this.files);};
    modal.querySelector('[name=price]').oninput=updateCalculatedPrices; modal.querySelector('[name=rai]').oninput=updateCalculatedPrices;
    modal.querySelector('#listing-form').addEventListener('submit', saveListing);
    function renderImages(){var box=modal.querySelector('#images-preview');box.innerHTML=editingImages.map(function(u,i){return '<div class="image-thumb"><img src="'+esc(u)+'" alt="">'+(i===0?'<span>หน้าปก</span>':'')+'<button type="button" data-remove-image="'+i+'">×</button></div>';}).join('');box.querySelectorAll('[data-remove-image]').forEach(function(b){b.onclick=function(){editingImages.splice(Number(b.dataset.removeImage),1);renderImages();};});}
    function renderLocalPreviews(files){var box=modal.querySelector('#images-preview');Array.from(files||[]).forEach(function(file){var u=URL.createObjectURL(file),d=document.createElement('div');d.className='image-thumb pending';d.innerHTML='<img src="'+u+'" alt=""><span>รูปใหม่</span>';box.appendChild(d);});}
    function updateCalculatedPrices(){var price=Number(modal.querySelector('[name=price]').value)||0,rai=Number(modal.querySelector('[name=rai]').value)||0;modal.querySelector('#per-rai').textContent=rai?'฿'+Math.round(price/rai).toLocaleString('en-US'):'฿0';modal.querySelector('#per-wa').textContent=rai?'฿'+Math.round(price/(rai*400)).toLocaleString('en-US'):'฿0';}
    renderImages(); updateCalculatedPrices();
  }

  function field(label,name,value,type,required,cls){return '<div class="field '+(cls||'')+'"><label>'+label+'</label><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(type==='number'?'step="any" ':'')+(required?'required':'')+'></div>';}
  function area(label,name,value,cls){return '<div class="field '+(cls||'')+'"><label>'+label+'</label><textarea name="'+name+'">'+esc(value)+'</textarea></div>';}
  function selectField(label,name,value,options){return '<div class="field"><label>'+label+'</label><select name="'+name+'">'+options.map(function(o){return '<option value="'+esc(o)+'" '+(o===value?'selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select></div>';}
  function check(name,label,yes){return '<label><input type="checkbox" name="'+name+'" '+(yes?'checked':'')+'> '+label+'</label>';}

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
      var cm=String(f.get('coordinates')||'').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
      var row={slug:(old&&old.slug)||('land-'+Date.now()),title:f.get('title').trim(),district:f.get('district').trim(),province:f.get('province').trim(),price:Number(f.get('price')),rai:Number(f.get('rai')),size_text:f.get('size_text').trim(),deed:f.get('deed').trim(),owner_name:f.get('owner_name').trim(),dimensions:f.get('dimensions').trim(),latitude:cm?Number(cm[1]):null,longitude:cm?Number(cm[2]):null,images:images,video_url:String(f.get('video_url')||'').trim(),tags:list(f.get('tags')),purposes:editingPurposes.slice(),highlights:list(f.get('highlights')),nearby:nearby,road:f.has('road'),water:f.has('water'),power:f.has('power'),verified:f.has('verified'),transfer_fee_free:f.has('transfer_fee_free'),published:f.has('published'),status:f.get('status'),sort_order:Number(f.get('sort_order')||0)};
      var result=id?await client.from('land_listings').update(row).eq('id',id):await client.from('land_listings').insert(row);
      if(result.error) throw result.error; await loadListings();
    } catch(err){if(btn) btn.disabled=false;msg.innerHTML='<div class="error">บันทึกไม่สำเร็จ: '+esc(err.message)+'</div>';}
  }

  async function removeListing(id) {
    if(!window.confirm('ลบประกาศนี้ออกจากฐานข้อมูลหรือไม่?')) return;
    var result=await client.from('land_listings').delete().eq('id',id);
    if(result.error){window.alert('ลบไม่สำเร็จ: '+result.error.message);return;} await loadListings();
  }

  client.auth.getSession().then(function (r) { session=r.data.session; session?verifyAdmin():loginView(); });
})();
