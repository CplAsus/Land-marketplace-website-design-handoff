(function () {
  'use strict';
  var root = document.getElementById('admin-app');
  var cfg = window.SUPABASE_CONFIG;
  var client = window.supabase.createClient(cfg.url, cfg.publishableKey);
  var session = null;
  var listings = [];

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
    x = x || {status:'draft',province:'ปทุมธานี',district:'ลำลูกกา',deed:'โปรดสอบถามผู้ขาย',owner_name:'ทรายทองพัฒนา',sort_order:0,road:true,water:true,power:true,transfer_fee_free:false,published:false,images:[]};
    var nearby = (x.nearby || []).map(function(n){return n.name + ' | ' + n.dist;}).join('\n');
    root.innerHTML = '<div class="toolbar"><div><h1 class="panel-title">' + (x.id ? 'แก้ไขประกาศ' : 'เพิ่มข้อมูลที่ดิน') + '</h1><p class="muted" style="margin:0">กรอกข้อมูลจริงและตรวจสอบก่อนเปิดเผยแพร่</p></div><button id="back" class="btn btn-light">← กลับ</button></div>' +
      '<form id="listing-form" class="card"><input type="hidden" name="id" value="' + esc(x.id || '') + '"><div class="form-grid">' +
      field('ชื่อประกาศ','title',x.title,'text',true,'span-2') + field('อำเภอ','district',x.district,'text',true) + field('จังหวัด','province',x.province,'text',true) +
      field('ราคารวม (บาท)','price',x.price,'number',true) + field('ขนาดเป็นไร่ เช่น 1.25','rai',x.rai,'number',true) + field('ข้อความขนาด','size_text',x.size_text,'text',true) + field('เอกสารสิทธิ์','deed',x.deed,'text',true) +
      field('หน้ากว้าง × ลึก','dimensions',x.dimensions,'text',false) + field('ชื่อผู้ขาย','owner_name',x.owner_name,'text',true) + field('ละติจูด','latitude',x.latitude,'number',false) + field('ลองจิจูด','longitude',x.longitude,'number',false) +
      area('แท็ก (คั่นด้วยจุลภาค)','tags',(x.tags||[]).join(', ')) + area('เหมาะสำหรับ (คั่นด้วยจุลภาค)','purposes',(x.purposes||[]).join(', ')) + area('จุดเด่น หนึ่งบรรทัดต่อข้อ','highlights',(x.highlights||[]).join('\n'),'span-2') + area('สถานที่ใกล้เคียง: ชื่อ | ระยะทาง','nearby',nearby,'span-2') +
      '<div class="field"><label>สถานะ</label><select name="status">' + ['draft','available','reserved','sold'].map(function(s){return '<option value="'+s+'" '+(x.status===s?'selected':'')+'>'+statusText(s)+'</option>';}).join('') + '</select></div>' + field('ลำดับการแสดง','sort_order',x.sort_order,'number',false) +
      '<div class="field span-2"><label>รูปที่ดิน (เลือกได้หลายรูป รูปแรกเป็นภาพหลัก)</label><input name="image_files" type="file" accept="image/jpeg,image/png,image/webp" multiple><div class="images-preview">' + (x.images||[]).map(function(i){return '<img src="'+esc(i)+'" alt="">';}).join('') + '</div></div>' +
      '<div class="checks span-2">' + check('road','ติดถนน',x.road) + check('water','มีน้ำ',x.water) + check('power','มีไฟฟ้า',x.power) + check('verified','ตรวจสอบแล้ว',x.verified) + check('transfer_fee_free','ฟรีค่าโอน',x.transfer_fee_free) + check('published','เผยแพร่ให้ลูกค้าเห็น',x.published) + '</div></div>' +
      '<div id="form-message"></div><div class="form-actions"><button type="button" id="cancel" class="btn btn-light">ยกเลิก</button><button type="submit" class="btn btn-primary">บันทึกข้อมูล</button></div></form>';
    document.getElementById('back').onclick=panelView; document.getElementById('cancel').onclick=panelView;
    document.getElementById('listing-form').addEventListener('submit', saveListing);
  }

  function field(label,name,value,type,required,cls){return '<div class="field '+(cls||'')+'"><label>'+label+'</label><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+(type==='number'?'step="any" ':'')+(required?'required':'')+'></div>';}
  function area(label,name,value,cls){return '<div class="field '+(cls||'')+'"><label>'+label+'</label><textarea name="'+name+'">'+esc(value)+'</textarea></div>';}
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
      var f=new FormData(form), id=f.get('id'), old=listings.find(function(x){return x.id===id;}), images=(old&&old.images)||[];
      var files=form.elements.image_files.files; if(files.length) images=images.concat(await uploadImages(files));
      var nearby=list(f.get('nearby')).map(function(line){var p=line.split('|');return {name:(p[0]||'').trim(),dist:(p[1]||'').trim()};}).filter(function(n){return n.name;});
      var row={slug:(old&&old.slug)||('land-'+Date.now()),title:f.get('title').trim(),district:f.get('district').trim(),province:f.get('province').trim(),price:Number(f.get('price')),rai:Number(f.get('rai')),size_text:f.get('size_text').trim(),deed:f.get('deed').trim(),owner_name:f.get('owner_name').trim(),dimensions:f.get('dimensions').trim(),latitude:f.get('latitude')?Number(f.get('latitude')):null,longitude:f.get('longitude')?Number(f.get('longitude')):null,images:images,tags:list(f.get('tags')),purposes:list(f.get('purposes')),highlights:list(f.get('highlights')),nearby:nearby,road:f.has('road'),water:f.has('water'),power:f.has('power'),verified:f.has('verified'),transfer_fee_free:f.has('transfer_fee_free'),published:f.has('published'),status:f.get('status'),sort_order:Number(f.get('sort_order')||0)};
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
