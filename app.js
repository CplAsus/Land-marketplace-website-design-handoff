/* ทรายทองพัฒนา — ตลาดที่ดินปทุมธานี (สายคลอง)
 * Vanilla re-implementation of the Claude Design prototype.
 * Two pages (หน้าแรก / รายละเอียด) + owner admin mode (password 123456,
 * localStorage-backed CRUD for listings & reviews). Client-only demo — the
 * password lives in the JS source, so this is NOT a real auth boundary.
 */
(function () {
  'use strict';

  var app = document.getElementById('app');

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  var state = {
    page: 'home',
    favs: [],
    compare: [],
    activeId: 'l1',
    showCompareModal: false,
    // admin
    authed: false, pw: '', pwErr: false, editing: null, reviewEditing: null,
    // contact modal
    contactType: null, contactDone: false, contactErr: false,
    cName: '', cPhone: '', cDate: '', cNote: '', reportReason: '', docSel: [],
    // floating advisor
    advisorOpen: false, advisorHidden: false,
    // media
    lightbox: -1,
    // search filters
    filterDistrict: 'ทุกพื้นที่',
    filterBudget: 'ไม่จำกัด',
    filterSize: 'ทุกขนาด',
    filterPurpose: 'ทุกประเภท',
    listings: [], reviews: []
  };

  function set(patch) { Object.assign(state, patch); render(); }

  /* ------------------------------------------------------------------ *
   * Persistence
   * ------------------------------------------------------------------ */
  function loadListings() {
    try {
      var r = localStorage.getItem('ttp_listings_v2');
      if (r) { var a = JSON.parse(r); if (Array.isArray(a) && a.length) return a; }
    } catch (e) {}
    return defaults();
  }
  function persist(list) { try { localStorage.setItem('ttp_listings_v2', JSON.stringify(list)); } catch (e) {} }
  function loadReviews() {
    try {
      var r = localStorage.getItem('ttp_reviews_v2');
      if (r) { var a = JSON.parse(r); if (Array.isArray(a)) return a; }
    } catch (e) {}
    return defaultReviews();
  }
  function persistReviews(list) { try { localStorage.setItem('ttp_reviews_v2', JSON.stringify(list)); } catch (e) {} }

  function remoteListing(row) {
    return {
      id: row.id,
      title: row.title,
      district: row.district,
      province: row.province || 'ปทุมธานี',
      img: (row.images || [])[0] || '',
      images: row.images || [],
      mapUrl: googleMapUrl(row.video_url),
      price: Number(row.price),
      rai: Number(row.rai),
      sizeText: row.size_text,
      deed: row.deed || 'โปรดสอบถามผู้ขาย',
      owner: row.owner_name || 'ทรายทองพัฒนา',
      verified: !!row.verified,
      ready: !!row.transfer_fee_free,
      road: !!row.road,
      water: !!row.water,
      power: !!row.power,
      purposes: row.purposes || [],
      tags: row.tags || [],
      dim: row.dimensions || '-',
      lat: row.latitude == null ? null : Number(row.latitude),
      lng: row.longitude == null ? null : Number(row.longitude),
      highlights: row.highlights || [],
      nearby: row.nearby || [],
      pin: { x: 50, y: 45 }
    };
  }

  function loadRemoteListings() {
    var cfg = window.SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.publishableKey) return;
    var endpoint = cfg.url + '/rest/v1/land_listings?published=eq.true&select=*&order=sort_order.desc,created_at.desc';
    fetch(endpoint, {
      headers: { apikey: cfg.publishableKey, Authorization: 'Bearer ' + cfg.publishableKey }
    }).then(function (res) {
      if (!res.ok) throw new Error('Unable to load listings');
      return res.json();
    }).then(function (rows) {
      if (Array.isArray(rows) && rows.length) {
        var mapped = rows.map(remoteListing);
        mapped[0].featured = true;
        set({ listings: mapped, activeId: rows[0].id });
      }
    }).catch(function () {
      // Keep the embedded verified listing available if the backend is temporarily offline.
    });
  }

  /* ------------------------------------------------------------------ *
   * Seed data
   * ------------------------------------------------------------------ */
  function img(id) { return 'https://images.unsplash.com/' + id + '?auto=format&fit=crop&w=1000&q=70'; }
  function listImg(l) { return l && l.img ? l.img : img((l && l.imgId) || 'photo-1500382017468-9049fed747ef'); }

  function defaults() {
    var P = 'ปทุมธานี';
    return [
      { id:'land-khlong-7', title:'ขายที่ดินคลอง 7 ลำลูกกา ถมแล้ว ติดคลองและถนนสาธารณะ', district:'ลำลูกกา', province:P,
        img:'assets/land-khlong7-cover.png', images:['assets/land-khlong7-cover.png','assets/land-khlong7-aerial-1.png','assets/land-khlong7-aerial-2.png'],
        price:7500000, rai:1.25, sizeText:'1 ไร่ 1 งาน (500 ตร.ว.)', deed:'โปรดสอบถามผู้ขาย', owner:'ทรายทองพัฒนา', verified:false, ready:true,
        road:true, water:true, power:true, purposes:['สร้างบ้าน','ลงทุน','โกดัง','ร้านอาหาร'], tags:['ถมแล้ว','ติดคลอง 7','ติดถนน','ฟรีค่าโอน'],
        dim:'หน้ากว้าง 58.5 × ลึก 34 ม.', lat:14.096229, lng:100.641842, pin:{x:50,y:45},
        highlights:['ราคา 15,000 บาท/ตร.ว. ขายยกแปลง 7,500,000 บาท','แบ่งขายได้ เริ่มต้น 150 ตร.ว. โปรดสอบถามเงื่อนไข','ถนนสาธารณะหน้าแปลงกว้าง 6 เมตร','เขตชุมชน มีน้ำและไฟฟ้าพร้อม','จากถนนเลียบคลอง 7 ประมาณ 140 เมตร','จากถนนรังสิต-นครนายกประมาณ 4.5 กม.'],
        nearby:[{name:'โรงเรียนนานาชาติเปิดใหม่',dist:'ประมาณ 1.5 กม.'},{name:'ถนนรังสิต-นครนายก',dist:'ประมาณ 4.5 กม.'},{name:'ถนนลำลูกกา',dist:'ประมาณ 7 กม.'},{name:'ดูโฮมรังสิต',dist:'ใกล้พื้นที่'}] }
    ];
  }

  function defaultReviews() {
    return [];
  }

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function perRai(l) { return Math.round(l.price / l.rai); }
  function short(n) { return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'ล'; }

  function districtCoord(d) {
    var m = {
      'ธัญบุรี':[14.026,100.740], 'คลองหลวง':[14.066,100.646], 'ลำลูกกา':[13.958,100.760],
      'หนองเสือ':[14.132,100.820], 'สามโคก':[14.060,100.530], 'ลาดหลุมแก้ว':[14.040,100.470],
      'เมืองปทุมธานี':[14.021,100.525], 'เมืองนครนายก':[14.207,101.213], 'ปากพลี':[14.164,101.268],
      'บ้านนา':[14.272,101.064], 'องครักษ์':[14.121,100.995]
    };
    return m[d] || [14.02, 100.60];
  }
  function mapSrcFor(lat, lng) {
    var dLat = 0.03, dLng = 0.045;
    var bbox = [(lng - dLng).toFixed(4), (lat - dLat).toFixed(4), (lng + dLng).toFixed(4), (lat + dLat).toFixed(4)].join(',');
    return 'https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + '&layer=mapnik&marker=' + lat.toFixed(4) + ',' + lng.toFixed(4);
  }
  function googleMapUrl(value) {
    var url = String(value || '').trim();
    return /^(?:https?:\/\/)?(?:(?:(?:www|maps)\.)?google\.[^/]+(?:\/maps|\/\?q=)|maps\.app\.goo\.gl|goo\.gl\/maps)(?:\/|$|[^\s]*)/i.test(url) ? url : '';
  }
  function googleMapLinkFor(listing, lat, lng) {
    return googleMapUrl(listing && listing.mapUrl) || ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lat + ',' + lng));
  }
  function galleryImgs(l) {
    if (l && l.images && l.images.length) return l.images.filter(function (u, i, a) { return u && a.indexOf(u) === i; });
    var base = listImg(l); var a = [base];
    if (l && l.gid) { (l.gid || []).forEach(function (g) { a.push(img(g)); }); }
    return a.filter(function (u, i, all) { return u && all.indexOf(u) === i; });
  }
  /* html-escape helpers */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;' }[c]; }); }
  function attr(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]; }); }

  /* SVG icon builder */
  function ic(paths, size) {
    size = size || 20;
    var inner = paths.map(function (d) { return '<path d="' + d + '"></path>'; }).join('');
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  var ICON = {
    road: ['M4 20 8 4','M20 20 16 4','M12 6v2','M12 12v2','M12 18v2'],
    wave: ['M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0','M2 18c2-3 4-3 6 0s4 3 6 0 4-3 6 0'],
    doc: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z','M14 2v6h6'],
    bolt: ['M13 2 3 14h9l-1 8 10-12h-9z'],
    wifi: ['M5 12.5a10 10 0 0 1 14 0','M8.5 16a5 5 0 0 1 7 0','M12 19.5h.01','M2 9a16 16 0 0 1 20 0'],
    shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
    phone: ['M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z'],
    flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z','M4 22v-7']
  };

  /* ------------------------------------------------------------------ *
   * Event handler registry (rebuilt each render)
   * ------------------------------------------------------------------ */
  var H = [];
  function click(fn)   { return 'data-click="'   + (H.push(fn) - 1) + '"'; }
  function oninput(fn) { return 'data-input="'   + (H.push(fn) - 1) + '"'; }
  function onchange(fn){ return 'data-change="'  + (H.push(fn) - 1) + '"'; }
  function onkey(fn)   { return 'data-keydown="' + (H.push(fn) - 1) + '"'; }

  /* ------------------------------------------------------------------ *
   * Actions
   * ------------------------------------------------------------------ */
  function scrollPageTop() {
    function resetPosition() {
      var root = document.scrollingElement || document.documentElement;
      if (root) { root.scrollTop = 0; root.scrollLeft = 0; }
      if (document.body) { document.body.scrollTop = 0; document.body.scrollLeft = 0; }
      window.scrollTo(0, 0);
    }
    resetPosition();
    if (window.requestAnimationFrame) requestAnimationFrame(function () { resetPosition(); requestAnimationFrame(resetPosition); });
    setTimeout(resetPosition, 80);
    setTimeout(resetPosition, 240);
  }
  function go(p) { set({ page: p }); scrollPageTop(); }
  function scrollFeatured() {
    var el = document.getElementById('featured-listings');
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 80, behavior: 'smooth' });
  }
  function clearFilters() {
    set({ filterDistrict:'ทุกพื้นที่', filterBudget:'ไม่จำกัด', filterSize:'ทุกขนาด', filterPurpose:'ทุกประเภท' });
    setTimeout(scrollFeatured, 0);
  }
  function filteredListings() {
    return state.listings.filter(function (l) {
      if (state.filterDistrict === 'ปทุมธานี (ทุกอำเภอ)' && l.province !== 'ปทุมธานี') return false;
      if (state.filterDistrict === 'นครนายก (ทุกอำเภอ)' && l.province !== 'นครนายก') return false;
      if (state.filterDistrict !== 'ทุกพื้นที่' && state.filterDistrict !== 'ปทุมธานี (ทุกอำเภอ)' && state.filterDistrict !== 'นครนายก (ทุกอำเภอ)' && l.district !== state.filterDistrict) return false;
      var p = Number(l.price) || 0, r = Number(l.rai) || 0;
      if (state.filterBudget === 'ต่ำกว่า 1 ล้าน' && !(p < 1000000)) return false;
      if (state.filterBudget === '1 - 3 ล้าน' && !(p >= 1000000 && p <= 3000000)) return false;
      if (state.filterBudget === '3 - 5 ล้าน' && !(p >= 3000000 && p <= 5000000)) return false;
      if (state.filterBudget === '5 - 10 ล้าน' && !(p >= 5000000 && p <= 10000000)) return false;
      if (state.filterBudget === 'มากกว่า 10 ล้าน' && !(p > 10000000)) return false;
      if (state.filterSize === 'น้อยกว่า 1 ไร่' && !(r < 1)) return false;
      if (state.filterSize === '1 - 5 ไร่' && !(r >= 1 && r <= 5)) return false;
      if (state.filterSize === '5 - 20 ไร่' && !(r >= 5 && r <= 20)) return false;
      if (state.filterSize === 'มากกว่า 20 ไร่' && !(r > 20)) return false;
      if (state.filterPurpose !== 'ทุกประเภท') {
        var wanted = state.filterPurpose === 'โกดัง / โรงงาน' ? ['โกดัง','โรงงาน'] : [state.filterPurpose];
        var purposes = l.purposes || [];
        if (!wanted.some(function (w) { return purposes.some(function (item) { return String(item).indexOf(w) >= 0; }); })) return false;
      }
      return true;
    });
  }
  function openDetail(id) { set({ page: 'detail', activeId: id, lightbox: -1 }); scrollPageTop(); }
  function toggleFav(id) { var f = state.favs.slice(); var i = f.indexOf(id); i >= 0 ? f.splice(i, 1) : f.push(id); set({ favs: f }); }
  function toggleCompare(id) { var c = state.compare.slice(); var i = c.indexOf(id); if (i >= 0) c.splice(i, 1); else if (c.length < 4) c.push(id); set({ compare: c }); }

  // admin
  function goAdmin() { set({ page: 'admin' }); window.scrollTo(0, 0); }
  function login() { if (state.pw === '123456') set({ authed: true, pwErr: false, pw: '' }); else set({ pwErr: true }); }
  function logout() { set({ authed: false, editing: null }); }
  function blankDraft() { return { id:null, title:'', district:'ธัญบุรี', price:'', rai:'', sizeText:'', deed:'โฉนด (นส.4)', owner:'เจ้าของขายเอง', dim:'', images:[], mapUrl:'', coord:'', tags:'', highlights:'', verified:true, ready:false, road:true, water:false, power:false, purposes:[], _imgUrl:'', _err:false }; }
  function openAdd() { set({ editing: blankDraft() }); }
  function openEdit(id) {
    var l = state.listings.find(function (x) { return x.id === id; }); if (!l) return;
    set({ editing: { id:l.id, title:l.title, district:l.district, price:String(l.price), rai:String(l.rai), sizeText:l.sizeText || '', deed:l.deed, owner:l.owner, dim:l.dim || '', images:galleryImgs(l), mapUrl:l.mapUrl || '', coord:(l.lat && l.lng) ? (l.lat + ', ' + l.lng) : '', tags:(l.tags || []).join(', '), highlights:(l.highlights || []).join('\n'), verified:!!l.verified, ready:!!l.ready, road:!!l.road, water:!!l.water, power:!!l.power, purposes:(l.purposes || []).slice(), _imgUrl:'', _err:false } });
  }
  function closeEdit() { set({ editing: null }); }
  function setDraft(k, v) { var d = Object.assign({}, state.editing); d[k] = v; d._err = false; set({ editing: d }); }
  function addDraftImageUrl() { var d = state.editing; var u = (d._imgUrl || '').trim(); if (!u) return; set({ editing: Object.assign({}, d, { images: (d.images || []).concat([u]), _imgUrl: '' }) }); }
  function addDraftFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []); if (!files.length) return;
    var done = 0, acc = [];
    files.forEach(function (f) {
      var rd = new FileReader();
      rd.onload = function () {
        acc.push(rd.result); done++;
        if (done === files.length) set({ editing: Object.assign({}, state.editing, { images: (state.editing.images || []).concat(acc) }) });
      };
      rd.readAsDataURL(f);
    });
  }
  function removeDraftImage(i) { var d = state.editing; var arr = (d.images || []).slice(); arr.splice(i, 1); set({ editing: Object.assign({}, d, { images: arr }) }); }
  function toggleDraftPurpose(p) { var arr = state.editing.purposes.slice(); var i = arr.indexOf(p); i >= 0 ? arr.splice(i, 1) : arr.push(p); setDraft('purposes', arr); }
  function saveDraft() {
    var d = state.editing; if (!d) return;
    if (!d.title.trim() || !d.price || !d.rai) { set({ editing: Object.assign({}, d, { _err: true }) }); return; }
    var rai = Number(d.rai) || 0, price = Number(d.price) || 0;
    var lat = null, lng = null;
    var cm = (d.coord || '').match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (cm) { lat = Number(cm[1]); lng = Number(cm[2]); } else { var dc = districtCoord(d.district); lat = dc[0]; lng = dc[1]; }
    var images = (d.images || []).filter(Boolean);
    var obj = { id:d.id || ('u' + Date.now()), title:d.title.trim(), district:d.district, province:'ปทุมธานี', price:price, rai:rai, sizeText:d.sizeText.trim() || (rai + ' ไร่'), deed:d.deed, owner:d.owner, dim:d.dim.trim() || '-', images:images, mapUrl:googleMapUrl(d.mapUrl), lat:lat, lng:lng, img:images[0] || '', imgId:'photo-1500382017468-9049fed747ef', gid:['photo-1523348837708-15d4a09cfac2','photo-1416879595882-3373a0480b5b'], verified:!!d.verified, ready:!!d.ready, road:!!d.road, water:!!d.water, power:!!d.power, purposes:d.purposes.slice(), tags:d.tags.split(',').map(function (s) { return s.trim(); }).filter(Boolean), highlights:d.highlights.split('\n').map(function (s) { return s.trim(); }).filter(Boolean), nearby:[], pin:{ x:Math.round(20 + Math.random() * 60), y:Math.round(15 + Math.random() * 55) } };
    var list = state.listings.slice(); var idx = list.findIndex(function (x) { return x.id === obj.id; });
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], obj); else list.unshift(obj);
    persist(list); set({ listings: list, editing: null });
  }
  function deleteListing(id) { if (window.confirm && !window.confirm('ลบประกาศนี้ออกจากเว็บไซต์?')) return; var list = state.listings.filter(function (x) { return x.id !== id; }); persist(list); set({ listings: list }); }
  function resetData() { if (window.confirm && !window.confirm('คืนค่าประกาศทั้งหมดกลับเป็นข้อมูลเริ่มต้น?')) return; var d = defaults(); persist(d); set({ listings: d }); }

  // reviews
  function blankReview() { return { id:null, name:'', plot:'', rating:5, avatar:'', text:'', _err:false }; }
  function openAddReview() { set({ reviewEditing: blankReview() }); }
  function openEditReview(id) { var r = state.reviews.find(function (x) { return x.id === id; }); if (!r) return; set({ reviewEditing: Object.assign({}, r, { _err:false }) }); }
  function closeReview() { set({ reviewEditing: null }); }
  function setReviewDraft(k, v) { var d = Object.assign({}, state.reviewEditing); d[k] = v; d._err = false; set({ reviewEditing: d }); }
  function saveReview() {
    var d = state.reviewEditing; if (!d) return;
    if (!d.name.trim() || !d.text.trim()) { set({ reviewEditing: Object.assign({}, d, { _err:true }) }); return; }
    var obj = { id:d.id || ('rv' + Date.now()), name:d.name.trim(), plot:d.plot.trim(), rating:Number(d.rating) || 5, avatar:d.avatar.trim(), text:d.text.trim() };
    var list = state.reviews.slice(); var idx = list.findIndex(function (x) { return x.id === obj.id; });
    if (idx >= 0) list[idx] = obj; else list.unshift(obj);
    persistReviews(list); set({ reviews: list, reviewEditing: null });
  }
  function deleteReview(id) { if (window.confirm && !window.confirm('ลบรีวิวนี้?')) return; var list = state.reviews.filter(function (x) { return x.id !== id; }); persistReviews(list); set({ reviews: list }); }

  // contact
  function openContact(type) { set({ contactType:type, contactDone:false, contactErr:false, cName:'', cPhone:'', cDate:'', cNote:'', reportReason:'', docSel:[] }); }
  function closeContact() { set({ contactType: null }); }
  function toggleDoc(v) { var arr = state.docSel.slice(); var i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); set({ docSel: arr }); }
  function submitContact() { if (!state.cName.trim() || !state.cPhone.trim()) { set({ contactErr: true }); return; } set({ contactDone: true, contactErr: false }); }

  // lightbox / video
  function openLightbox(i) { set({ lightbox: i }); }
  function closeLightbox() { set({ lightbox: -1 }); }
  function lbStep(dir) {
    var imgs = galleryImgs(activeListing()); var n = imgs.length; if (!n) return;
    set({ lightbox: (state.lightbox + dir + n) % n });
  }

  function activeListing() { var all = state.listings; return all.find(function (l) { return l.id === state.activeId; }) || all[0] || defaults()[0]; }

  /* ------------------------------------------------------------------ *
   * Render — building blocks
   * ------------------------------------------------------------------ */
  var LOGO = 'logo.png';

  function vmCard(l) {
    return {
      l: l, img: listImg(l), priceText: fmt(l.price), perRaiText: fmt(perRai(l)),
      isFav: state.favs.includes(l.id), isCompared: state.compare.includes(l.id)
    };
  }

  function landCard(l) {
    var v = vmCard(l);
    var badge = '';
    if (l.featured) badge += '<span style="display:inline-flex;align-items:center;gap:4px;background:#E3A81E;color:#fff;font-size:14.3px;font-weight:700;padding:4px 9px;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,.18)">★ ที่ดินแนะนำ</span>';
    if (l.verified) badge += '<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,.94);color:#1F4A34;font-size:14.3px;font-weight:600;padding:4px 9px;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,.12)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2F8F5B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>ตรวจสอบแล้ว</span>';
    if (l.ready) badge += '<span style="display:inline-flex;align-items:center;gap:4px;background:#E3A81E;color:#fff;font-size:14.3px;font-weight:600;padding:4px 9px;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,.18)">ฟรีค่าโอน</span>';

    var favSvg = v.isFav
      ? '<svg width="19" height="19" viewBox="0 0 24 24" fill="#C0453B" stroke="#C0453B" stroke-width="1.5"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"></path></svg>'
      : '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#3B4038" stroke-width="1.9"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"></path></svg>';

    var compareBtn = v.isCompared
      ? '<button ' + click(function (e) { e.stopPropagation(); toggleCompare(l.id); }) + ' aria-label="เปรียบเทียบแล้ว" style="width:42px;height:40px;flex:none;background:#1F4A34;border:1px solid #1F4A34;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>'
      : '<button ' + click(function (e) { e.stopPropagation(); toggleCompare(l.id); }) + ' aria-label="เปรียบเทียบ" class="compare-toggle" style="width:42px;height:40px;flex:none;background:#fff;border:1px solid #D9D4C8;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#4A5047"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h7M4 12h7M4 17h4M15 5v14M15 5l-3 3M15 5l3 3"></path></svg></button>';

    var tags = (l.tags || []).map(function (t) { return '<span style="font-size:15px;color:#2F6B4F;background:#EAF1EB;padding:3px 9px;border-radius:20px;font-weight:500">' + esc(t) + '</span>'; }).join('');

    return '' +
    '<div class="land-card" ' + click(function () { openDetail(l.id); }) + '>' +
      '<div style="position:relative;height:196px;background:#E4EAE1;overflow:hidden">' +
        '<img src="' + attr(v.img) + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy">' +
        '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,40,28,.28) 0%,rgba(20,40,28,0) 34%,rgba(20,40,28,0) 62%,rgba(20,40,28,.42) 100%)"></div>' +
        '<div style="position:absolute;top:11px;left:11px;display:flex;flex-direction:column;gap:6px;align-items:flex-start">' + badge + '</div>' +
        '<button ' + click(function (e) { e.stopPropagation(); toggleFav(l.id); }) + ' aria-label="บันทึก" style="position:absolute;top:10px;right:10px;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.92);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.15)">' + favSvg + '</button>' +
        '<div style="position:absolute;left:12px;bottom:11px;display:inline-flex;align-items:center;gap:5px;color:#fff;font-size:16.3px;font-weight:500;text-shadow:0 1px 4px rgba(0,0,0,.5)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.4-7-11a7 7 0 0 1 14 0c0 4.6-7 11-7 11z"></path><circle cx="12" cy="10" r="2.4"></circle></svg>' + esc(l.district) + ' · ' + esc(l.province) + '</div>' +
      '</div>' +
      '<div style="padding:14px 16px 16px;display:flex;flex-direction:column;gap:10px;flex:1">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;min-height:42px">' +
          '<h3 class="clamp2" style="margin:0;font-size:20.2px;font-weight:600;color:#1B2019;line-height:1.35;flex:1">' + esc(l.title) + '</h3>' +
        '</div>' +
        '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">' +
          '<span style="font-size:27.3px;font-weight:700;color:#1F4A34;letter-spacing:-.3px">฿' + v.priceText + '</span>' +
          '<span style="font-size:15.6px;color:#8A8F84;font-weight:500">' + v.perRaiText + '/ไร่</span>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
          '<span style="display:inline-flex;align-items:center;gap:4px;background:#F1F0EA;color:#4A5047;font-size:15.6px;font-weight:500;padding:4px 9px;border-radius:8px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7A5C3E" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="1"></rect><path d="M4 9h16M9 4v16"></path></svg>' + esc(l.sizeText) + '</span>' +
          '<span style="display:inline-flex;align-items:center;gap:4px;background:#F1F0EA;color:#4A5047;font-size:15.6px;font-weight:500;padding:4px 9px;border-radius:8px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7A5C3E" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path></svg>' + esc(l.deed) + '</span>' +
        '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' + tags + '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:2px">' +
          '<button ' + click(function () { openDetail(l.id); }) + ' class="btn-dark" style="flex:1;background:#1F4A34;color:#fff;border:none;border-radius:10px;padding:10px;font-size:17.6px;font-weight:600;cursor:pointer">ดูรายละเอียด</button>' +
          compareBtn +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function header() {
    return '' +
    '<header style="position:sticky;top:0;z-index:50;background:rgba(247,245,240,.9);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid #E7E3DA">' +
      '<div class="site-header-inner" style="max-width:1240px;margin:0 auto;padding:0 24px;height:70px;display:flex;align-items:center;gap:28px">' +
        '<div ' + click(function () { go('home'); }) + ' style="display:flex;align-items:center;gap:11px;cursor:pointer;flex:none">' +
          '<div style="width:46px;height:46px;border-radius:50%;overflow:hidden;background:#fff;border:1px solid #EFE3D0;flex:none;box-shadow:0 2px 8px rgba(31,74,52,.15)"><img src="' + LOGO + '" alt="ทรายทองพัฒนา" style="width:100%;height:100%;object-fit:cover;transform:scale(1.05)"></div>' +
          '<div style="line-height:1.05">' +
            '<div style="font-family:\'Noto Serif Thai\',serif;font-weight:700;font-size:21.5px;color:#1F4A34">ทรายทองพัฒนา</div>' +
            '<div style="font-size:13.7px;color:#8A8F84;letter-spacing:.3px;font-weight:500">ที่ดินสายคลอง · ปทุมธานี · นครนายก</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</header>';
  }

  function heroSelect(options, value, handler) {
    var opts = options.map(function (o) { return '<option' + (o === value ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
    var h = handler ? ' ' + onchange(handler) : '';
    return '<select' + h + ' style="border:none;background:none;font-size:18.2px;color:#4A5047;width:100%;cursor:pointer;outline:none;font-weight:500">' + opts + '</select>';
  }

  function home() {
    var filtered = filteredListings();
    var featured = filtered.map(landCard).join('');
    var hasFilters = state.filterDistrict !== 'ทุกพื้นที่' || state.filterBudget !== 'ไม่จำกัด' || state.filterSize !== 'ทุกขนาด' || state.filterPurpose !== 'ทุกประเภท';
    var resultText = hasFilters ? 'พบ ' + filtered.length + ' แปลงตามตัวกรองที่เลือก' : 'ข้อมูล ราคา และรูปภาพจากทรายทองพัฒนา';
    var emptyResults = '<div style="grid-column:1/-1;text-align:center;background:#fff;border:1px solid #E7E3DA;border-radius:16px;padding:42px 20px;color:#6B7065"><div style="font-size:23.4px;font-weight:700;color:#1F4A34;margin-bottom:6px">ไม่พบที่ดินตามเงื่อนไข</div><div style="font-size:18.2px;margin-bottom:16px">ลองเปลี่ยนงบประมาณ ขนาด หรือวัตถุประสงค์</div><button ' + click(clearFilters) + ' class="btn-outline" style="background:#fff;border:1px solid #D9D4C8;color:#1F4A34;padding:10px 16px;border-radius:10px;font-weight:700;cursor:pointer">ล้างตัวกรอง</button></div>';

    var trustItems = [
      { icon: ICON.shield, title:'ข้อมูลจากผู้ขายโดยตรง', desc:'รายละเอียด ราคา และรูปภาพจัดทำจากข้อมูลของทรายทองพัฒนา' },
      { icon: ICON.doc, title:'ตรวจเอกสารก่อนตัดสินใจ', desc:'สอบถามสำเนาเอกสารสิทธิ์และตรวจสอบกับสำนักงานที่ดินก่อนทำสัญญา' },
      { icon: ICON.phone, title:'นัดชมแปลงจริง', desc:'โทรนัดหมายกับคุณทรายเพื่อเข้าชมพื้นที่และสอบถามเงื่อนไขล่าสุด' },
      { icon: ICON.flag, title:'พิกัดชัดเจน', desc:'มีแผนที่และข้อมูลการเดินทางเพื่อช่วยวางแผนเข้าชมพื้นที่' }
    ].map(function (t) {
      return '<div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:26px 22px">' +
        '<span style="display:flex;width:46px;height:46px;border-radius:12px;background:rgba(235,217,168,.16);align-items:center;justify-content:center;color:#EBD9A8;margin-bottom:16px">' + ic(t.icon) + '</span>' +
        '<h3 style="font-size:20.8px;font-weight:600;color:#fff;margin:0 0 7px">' + esc(t.title) + '</h3>' +
        '<p style="font-size:17.6px;line-height:1.55;color:rgba(255,255,255,.68);margin:0;font-weight:300">' + esc(t.desc) + '</p>' +
      '</div>';
    }).join('');

    var reviews = state.reviews.map(function (rv) {
      var stars = [0,1,2,3,4].map(function (i) {
        var fill = i < rv.rating ? '#E0A82E' : '#E3DDCF';
        return '<svg width="17" height="17" viewBox="0 0 24 24" fill="' + fill + '" stroke="' + fill + '" stroke-width="1"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.5 1.6 6.7L12 17l-6.2 3.6 1.6-6.7L2.2 8.9l6.9-.6z"></path></svg>';
      }).join('');
      var av = (rv.avatar && rv.avatar.trim()) ? rv.avatar : img('photo-1500382017468-9049fed747ef');
      return '<figure style="margin:0;background:#fff;border:1px solid #E7E3DA;border-radius:18px;padding:26px 24px;display:flex;flex-direction:column;gap:14px">' +
        '<div style="display:flex;gap:3px">' + stars + '</div>' +
        '<blockquote style="margin:0;font-size:18.9px;line-height:1.65;color:#3B4038;flex:1">“' + esc(rv.text) + '”</blockquote>' +
        '<figcaption style="display:flex;align-items:center;gap:12px;padding-top:6px;border-top:1px solid #EEEBE3">' +
          '<div style="width:46px;height:46px;border-radius:50%;overflow:hidden;background:#E4EAE1;flex:none"><img src="' + attr(av) + '" alt="" style="width:100%;height:100%;object-fit:cover"></div>' +
          '<div><div style="font-size:18.9px;font-weight:600;color:#1B2019">' + esc(rv.name) + '</div><div style="font-size:16.3px;color:#8A8F84">' + esc(rv.plot) + '</div></div>' +
        '</figcaption>' +
      '</figure>';
    }).join('');

    var reviewSection = state.reviews.length ?
      '<section style="max-width:1240px;margin:0 auto;padding:70px 24px 20px">' +
        '<div style="text-align:center;max-width:600px;margin:0 auto 40px">' +
          '<div style="color:#E3A81E;font-size:16.9px;font-weight:600;letter-spacing:1px;margin-bottom:10px">รีวิวจากลูกค้าจริง</div>' +
          '<h2 style="font-family:\'Noto Serif Thai\',serif;font-size:39px;font-weight:600;color:#1B2019;margin:0 0 12px">เสียงจากผู้ที่ซื้อที่ดินกับเรา</h2>' +
          '<p style="color:#8A8F84;font-size:19.5px;line-height:1.6;margin:0">ประสบการณ์จริงจากลูกค้าที่ซื้อขายที่ดินสายคลอง ปทุมธานี กับทรายทองพัฒนา</p>' +
        '</div>' +
        '<div class="grid-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px">' + reviews + '</div>' +
      '</section>' : '';

    return '<main>' +
      // HERO
      '<section style="position:relative;overflow:hidden;background:#1F4A34">' +
        '<img src="assets/land-khlong7-aerial-1.png" alt="ที่ดินคลอง 7 ลำลูกกา" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.5">' +
        '<div style="position:absolute;inset:0;background:linear-gradient(105deg,rgba(23,55,38,.92) 0%,rgba(23,55,38,.6) 48%,rgba(23,55,38,.25) 100%)"></div>' +
        '<div class="hero-inner" style="position:relative;max-width:1240px;margin:0 auto;padding:76px 24px 92px">' +
          '<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(235,217,168,.16);border:1px solid rgba(235,217,168,.4);color:#EBD9A8;font-size:16.9px;font-weight:500;padding:7px 14px;border-radius:30px;margin-bottom:22px"><span style="width:7px;height:7px;border-radius:50%;background:#7ED9A0"></span>ซื้อขายที่ดินปทุมธานี ราคาถูก สายคลอง by ทรายทองพัฒนา</div>' +
          '<h1 class="hero-h1" style="font-family:\'Noto Serif Thai\',serif;font-weight:700;font-size:67.6px;line-height:1.18;color:#fff;margin:0 0 18px;max-width:820px;letter-spacing:-.5px">ค้นหาที่ดินที่ใช่<br>สำหรับบ้าน ธุรกิจ และการลงทุน</h1>' +
          '<p style="font-size:23.4px;line-height:1.6;color:rgba(255,255,255,.82);margin:0 0 40px;max-width:680px;font-weight:300">รวมที่ดินพร้อมขายในปทุมธานี นครนายก และพื้นที่สายคลอง ค้นหาตามทำเล งบประมาณ ขนาด และเอกสารสิทธิ์ได้ในที่เดียว</p>' +
          '<div class="hero-search" style="background:#fff;border-radius:20px;box-shadow:0 24px 60px rgba(20,40,28,.28);padding:12px;display:flex;align-items:stretch;gap:2px">' +
            '<div class="hov-soft search-field" style="flex:1.3;padding:12px 18px;border-radius:14px;cursor:pointer"><div style="font-size:15.6px;font-weight:600;color:#1F4A34;margin-bottom:3px">ทำเล</div>' + heroSelect(['ทุกพื้นที่','ปทุมธานี (ทุกอำเภอ)','เมืองปทุมธานี','คลองหลวง','ธัญบุรี','หนองเสือ','ลาดหลุมแก้ว','ลำลูกกา','สามโคก','นครนายก (ทุกอำเภอ)','เมืองนครนายก','ปากพลี','บ้านนา','องครักษ์'],state.filterDistrict,function(e){set({filterDistrict:e.target.value});}) + '</div>' +
            '<div class="search-divider" style="width:1px;background:#EAE6DC;margin:8px 0"></div>' +
            '<div class="hov-soft search-field" style="flex:1;padding:12px 18px;border-radius:14px"><div style="font-size:15.6px;font-weight:600;color:#1F4A34;margin-bottom:3px">งบประมาณ</div>' + heroSelect(['ไม่จำกัด','ต่ำกว่า 1 ล้าน','1 - 3 ล้าน','3 - 5 ล้าน','5 - 10 ล้าน','มากกว่า 10 ล้าน'],state.filterBudget,function(e){set({filterBudget:e.target.value});}) + '</div>' +
            '<div class="search-divider" style="width:1px;background:#EAE6DC;margin:8px 0"></div>' +
            '<div class="hov-soft search-field" style="flex:1;padding:12px 18px;border-radius:14px"><div style="font-size:15.6px;font-weight:600;color:#1F4A34;margin-bottom:3px">ขนาดที่ดิน</div>' + heroSelect(['ทุกขนาด','น้อยกว่า 1 ไร่','1 - 5 ไร่','5 - 20 ไร่','มากกว่า 20 ไร่'],state.filterSize,function(e){set({filterSize:e.target.value});}) + '</div>' +
            '<div class="search-divider" style="width:1px;background:#EAE6DC;margin:8px 0"></div>' +
            '<div class="hov-soft search-field" style="flex:1;padding:12px 18px;border-radius:14px"><div style="font-size:15.6px;font-weight:600;color:#1F4A34;margin-bottom:3px">วัตถุประสงค์</div>' + heroSelect(['ทุกประเภท','สร้างบ้าน','เกษตร','ลงทุน','รีสอร์ต','โกดัง / โรงงาน'],state.filterPurpose,function(e){set({filterPurpose:e.target.value});}) + '</div>' +
            '<button ' + click(scrollFeatured) + ' class="btn-search" style="flex:none;background:#E3A81E;border:none;border-radius:14px;padding:0 30px;color:#fff;font-size:19.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:9px"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>ค้นหาที่ดิน</button>' +
          '</div>' +
        '</div>' +
      '</section>' +

      // FEATURED
      '<section id="featured-listings" class="featured-section" style="max-width:1240px;margin:0 auto;padding:64px 24px 20px">' +
        '<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px;gap:16px;flex-wrap:wrap">' +
          '<div><h2 style="font-family:\'Noto Serif Thai\',serif;font-size:36.4px;font-weight:600;margin:0 0 4px;color:#1B2019">ที่ดินพร้อมขาย</h2><p style="margin:0;color:#8A8F84;font-size:18.9px">' + resultText + '</p></div>' +
          (hasFilters ? '<button ' + click(clearFilters) + ' class="btn-outline" style="background:#fff;border:1px solid #D9D4C8;color:#1F4A34;font-size:18.2px;font-weight:600;padding:11px 18px;border-radius:11px;cursor:pointer">ล้างตัวกรอง</button>' : '') +
        '</div>' +
        '<div class="grid-4" style="display:grid;grid-template-columns:repeat(4,1fr);gap:22px">' + (featured || emptyResults) + '</div>' +
      '</section>' +

      // TRUST
      '<section style="background:#1F4A34;margin-top:60px">' +
        '<div style="max-width:1240px;margin:0 auto;padding:64px 24px">' +
          '<div style="text-align:center;max-width:640px;margin:0 auto 44px">' +
            '<div style="color:#EBD9A8;font-size:16.9px;font-weight:600;letter-spacing:1px;margin-bottom:10px">ซื้อขายอย่างมั่นใจ</div>' +
            '<h2 style="font-family:\'Noto Serif Thai\',serif;font-size:41.6px;font-weight:600;color:#fff;margin:0 0 12px">ข้อมูลครบ นัดชมง่าย ติดต่อผู้ขายโดยตรง</h2>' +
            '<p style="color:rgba(255,255,255,.75);font-size:20.2px;line-height:1.6;margin:0;font-weight:300">ควรตรวจสอบสภาพพื้นที่ เอกสารสิทธิ์ ผังเมือง และภาระผูกพันก่อนวางเงินหรือทำสัญญาทุกครั้ง</p>' +
          '</div>' +
          '<div class="grid-4" style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px">' + trustItems + '</div>' +
        '</div>' +
      '</section>' +

      reviewSection +
    '</main>';
  }

  function detail() {
    var a = activeListing();
    var imgs = galleryImgs(a);
    var lat = (a.lat != null) ? a.lat : districtCoord(a.district)[0];
    var lng = (a.lng != null) ? a.lng : districtCoord(a.district)[1];
    var moreCount = Math.max(0, imgs.length - 3);

    var badges = [a.verified ? 'ตรวจสอบเบื้องต้นแล้ว' : null, a.ready ? 'ฟรีค่าโอน' : null].filter(Boolean)
      .map(function (b) { return '<span style="display:inline-flex;align-items:center;gap:5px;background:#EAF1EB;color:#1F4A34;font-size:16.3px;font-weight:600;padding:6px 12px;border-radius:20px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2F8F5B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' + esc(b) + '</span>'; }).join('');

    var highlights = (a.highlights || []).map(function (h) { return '<li style="display:flex;align-items:flex-start;gap:9px;font-size:18.9px;color:#4A5047;line-height:1.5"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F8F5B" stroke-width="2.4" style="flex:none;margin-top:2px"><polyline points="20 6 9 17 4 12"></polyline></svg>' + esc(h) + '</li>'; }).join('');

    var utils = [
      a.power ? { l:'ไฟฟ้า', i:ICON.bolt } : { l:'ไม่มีไฟฟ้า', i:ICON.bolt },
      a.water ? { l:'น้ำประปา/คลอง', i:ICON.wave } : { l:'ไม่มีน้ำ', i:ICON.wave },
      a.road ? { l:'ถนนเข้าถึง', i:ICON.road } : { l:'ทางเข้าแคบ', i:ICON.road }
    ].map(function (u) { return '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E7E3DA;border-radius:12px;padding:12px 16px;font-size:17.6px;font-weight:500;color:#3B4038">' + ic(u.i) + esc(u.l) + '</div>'; }).join('');

    var purposes = (a.purposes || []).map(function (p) { return '<span style="background:#F4EFE4;color:#7A5C3E;font-size:17.6px;font-weight:600;padding:8px 16px;border-radius:12px">' + esc(p) + '</span>'; }).join('');

    var nearby = (a.nearby || []).map(function (n) { return '<li style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #E7E3DA;border-radius:10px;padding:12px 15px;font-size:17.6px;color:#4A5047"><span>' + esc(n.name) + '</span><span style="color:#8A8F84;font-weight:500">' + esc(n.dist) + '</span></li>'; }).join('');

    var thirdOverlay = '<div ' + click(function () { openLightbox(2); }) + ' style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;cursor:pointer">' + (imgs.length > 3 ? '<span style="background:rgba(23,55,38,.6);color:#fff;font-size:19.5px;font-weight:700;padding:8px 16px;border-radius:20px">+' + moreCount + ' รูป</span>' : '') + '</div>';

    var isFav = state.favs.includes(a.id);
    var favBg = isFav ? '#FBEDEB' : '#fff', favBorder = isFav ? '#E7C9C5' : '#E7E3DA', favColor = isFav ? '#C0453B' : '#4A5047', favFill = isFav ? '#C0453B' : 'none', favLabel = isFav ? 'บันทึกแล้ว' : 'บันทึกไว้';

    var related = state.listings.filter(function (l) { return l.id !== a.id; }).slice(0, 4).map(landCard).join('');

    var galleryHtml;
    if (imgs.length === 1) {
      galleryHtml = '<div class="gallery gallery-single" style="background:#101611;border-radius:20px;overflow:hidden;margin-bottom:24px;position:relative;text-align:center">' +
        '<div ' + click(function () { openLightbox(0); }) + ' style="position:relative;cursor:pointer;display:flex;justify-content:center">' +
          '<img src="' + attr(imgs[0]) + '" alt="" style="display:block;width:100%;height:auto;max-height:680px;object-fit:contain">' +
          '<span style="position:absolute;right:16px;bottom:16px;display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.94);color:#1B2019;font-size:16.3px;font-weight:600;padding:7px 13px;border-radius:20px;pointer-events:none"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 8h.01M4 16l4-4 4 4M12 14l3-3 5 5"></path><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>ดูรูปเต็ม 1 รูป</span>' +
        '</div></div>';
    } else if (imgs.length === 2) {
      galleryHtml = '<div class="gallery gallery-two" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;height:430px;border-radius:20px;overflow:hidden;margin-bottom:24px;background:#E4EAE1">' +
        imgs.map(function (u, i) { return '<div ' + click((function (idx) { return function () { openLightbox(idx); }; })(i)) + ' style="position:relative;overflow:hidden;cursor:pointer;background:#E4EAE1"><img src="' + attr(u) + '" alt="" style="width:100%;height:100%;object-fit:cover">' + (i === 1 ? '<span style="position:absolute;right:16px;bottom:16px;background:rgba(255,255,255,.94);color:#1B2019;font-size:16.3px;font-weight:600;padding:7px 13px;border-radius:20px">ดูทั้งหมด 2 รูป</span>' : '') + '</div>'; }).join('') +
      '</div>';
    } else {
      galleryHtml = '<div class="gallery gallery-many" style="display:grid;grid-template-columns:1.55fr 1fr;grid-template-rows:1fr 1fr;gap:10px;height:440px;border-radius:20px;overflow:hidden;margin-bottom:24px">' +
        '<div ' + click(function () { openLightbox(0); }) + ' style="grid-row:span 2;background:#E4EAE1;position:relative;overflow:hidden;cursor:pointer">' +
          '<img src="' + attr(imgs[0]) + '" alt="" style="width:100%;height:100%;object-fit:cover">' +
          '<span style="position:absolute;right:16px;bottom:16px;display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.92);color:#1B2019;font-size:16.3px;font-weight:600;padding:7px 13px;border-radius:20px;pointer-events:none"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 8h.01M4 16l4-4 4 4M12 14l3-3 5 5"></path><rect x="3" y="3" width="18" height="18" rx="2"></rect></svg>ดูรูปทั้งหมด ' + imgs.length + ' รูป</span>' +
        '</div>' +
        '<div ' + click(function () { openLightbox(1); }) + ' style="background:#E4EAE1;overflow:hidden;cursor:pointer"><img src="' + attr(imgs[1]) + '" alt="" style="width:100%;height:100%;object-fit:cover"></div>' +
        '<div style="background:#E4EAE1;overflow:hidden;position:relative"><img src="' + attr(imgs[2]) + '" alt="" style="width:100%;height:100%;object-fit:cover">' + thirdOverlay + '</div>' +
      '</div>';
    }

    return '<main class="detail-page" style="max-width:1240px;margin:0 auto;padding:22px 24px 90px">' +
      '<div style="display:flex;align-items:center;gap:8px;font-size:16.9px;color:#8A8F84;margin-bottom:16px">' +
        '<button ' + click(function () { go('home'); }) + ' style="background:none;border:none;color:#1F4A34;font-weight:500;cursor:pointer;padding:0;display:flex;align-items:center;gap:5px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M11 6l-6 6 6 6"></path></svg>กลับหน้าแรก</button>' +
        '<span>·</span><span>' + esc(a.district) + '</span><span>·</span><span>' + esc(a.province) + '</span>' +
      '</div>' +

      galleryHtml +

      '<div class="detail-grid" style="display:grid;grid-template-columns:1fr 372px;gap:34px;align-items:start">' +
        // LEFT
        '<div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' + badges + '</div>' +
          '<h1 style="font-family:\'Noto Serif Thai\',serif;font-size:39px;font-weight:700;color:#1B2019;margin:0 0 8px;line-height:1.3">' + esc(a.title) + '</h1>' +
          '<div style="display:flex;align-items:center;gap:6px;color:#6B7065;font-size:19.5px;margin-bottom:22px"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#E3A81E" stroke-width="2"><path d="M12 21s-7-6.4-7-11a7 7 0 0 1 14 0c0 4.6-7 11-7 11z"></path><circle cx="12" cy="10" r="2.4"></circle></svg>' + esc(a.district + ' · ' + a.province + ' (ที่ดินสายคลอง)') + '</div>' +
          '<div class="spec-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:22px;background:#fff;border:1px solid #E7E3DA;border-radius:16px;margin-bottom:26px">' +
            '<div><div style="font-size:15.6px;color:#8A8F84;margin-bottom:4px">ขนาดที่ดิน</div><div style="font-size:22.1px;font-weight:700;color:#1B2019">' + esc(a.sizeText) + '</div></div>' +
            '<div><div style="font-size:15.6px;color:#8A8F84;margin-bottom:4px">ราคาต่อไร่</div><div style="font-size:22.1px;font-weight:700;color:#1B2019">฿' + fmt(perRai(a)) + '</div></div>' +
            '<div><div style="font-size:15.6px;color:#8A8F84;margin-bottom:4px">หน้ากว้าง × ลึก</div><div style="font-size:22.1px;font-weight:700;color:#1B2019">' + esc(a.dim) + '</div></div>' +
            '<div><div style="font-size:15.6px;color:#8A8F84;margin-bottom:4px">เอกสารสิทธิ์</div><div style="font-size:22.1px;font-weight:700;color:#1B2019">' + esc(a.deed) + '</div></div>' +
          '</div>' +
          '<h2 style="font-size:24.7px;font-weight:600;color:#1B2019;margin:0 0 12px">จุดเด่นของแปลง</h2>' +
          '<ul class="hl-grid" style="list-style:none;padding:0;margin:0 0 28px;display:grid;grid-template-columns:1fr 1fr;gap:11px">' + highlights + '</ul>' +
          '<h2 style="font-size:24.7px;font-weight:600;color:#1B2019;margin:0 0 12px">สาธารณูปโภค</h2>' +
          '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:28px">' + utils + '</div>' +
          '<h2 style="font-size:24.7px;font-weight:600;color:#1B2019;margin:0 0 12px">เหมาะสำหรับ</h2>' +
          '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:28px">' + purposes + '</div>' +
          '<h2 style="font-size:24.7px;font-weight:600;color:#1B2019;margin:0 0 12px">ทำเลและสถานที่ใกล้เคียง</h2>' +
          '<div style="border:1px solid #E7E3DA;border-radius:16px;overflow:hidden;margin-bottom:14px"><iframe title="ทำเลที่ดิน" src="' + attr(mapSrcFor(lat, lng)) + '" style="width:100%;height:360px;border:0;display:block"></iframe></div>' +
          '<a href="' + attr(googleMapLinkFor(a, lat, lng)) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:7px;color:#1F4A34;font-size:18.2px;font-weight:700;margin:0 0 14px;text-decoration:none">เปิดตำแหน่งนี้ใน Google Maps ↗</a>' +
          '<ul style="list-style:none;padding:0;margin:0 0 8px;display:grid;grid-template-columns:1fr 1fr;gap:10px">' + nearby + '</ul>' +
        '</div>' +

        // STICKY CTA
        '<div class="detail-cta" style="position:sticky;top:90px;display:flex;flex-direction:column;gap:16px">' +
          '<div style="background:#fff;border:1px solid #E7E3DA;border-radius:18px;padding:24px;box-shadow:0 10px 30px rgba(31,74,52,.08)">' +
            '<div style="font-size:16.9px;color:#8A8F84;margin-bottom:2px">ราคาขาย</div>' +
            '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px"><span style="font-size:41.6px;font-weight:700;color:#1F4A34;letter-spacing:-.5px">฿' + fmt(a.price) + '</span></div>' +
            '<div style="font-size:17.6px;color:#6B7065;padding-bottom:18px;margin-bottom:18px;border-bottom:1px solid #EEEBE3">' + fmt(perRai(a)) + ' บาท/ไร่ · ' + esc(a.sizeText) + '</div>' +
            '<div style="display:flex;flex-direction:column;gap:10px">' +
              '<a href="tel:0974287891" class="btn-dark" style="width:100%;box-sizing:border-box;background:#1F4A34;color:#fff;border:none;border-radius:12px;padding:15px;font-size:20.2px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;text-decoration:none"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"></path></svg>โทรหาผู้ขาย · 097-428-7891</a>' +
              '<a href="https://www.facebook.com/saithongptn" target="_blank" rel="noopener" class="btn-fb" style="width:100%;box-sizing:border-box;background:#1877F2;color:#fff;border:none;border-radius:12px;padding:14px;font-size:18.9px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.5V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"></path></svg>แชทผ่านเฟซบุ๊ก</a>' +
              '<button ' + click(function () { toggleFav(a.id); }) + ' class="btn-fav" style="width:100%;background:' + favBg + ';border:1px solid ' + favBorder + ';border-radius:12px;padding:14px;font-size:18.9px;font-weight:600;color:' + favColor + ';cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="17" height="17" viewBox="0 0 24 24" fill="' + favFill + '" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"></path></svg>' + favLabel + '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // nearby
      '<div style="margin-top:56px">' +
        '<h2 style="font-family:\'Noto Serif Thai\',serif;font-size:31.2px;font-weight:600;color:#1B2019;margin:0 0 20px">ที่ดินใกล้เคียงที่คุณอาจสนใจ</h2>' +
        '<div class="grid-4" style="display:grid;grid-template-columns:repeat(4,1fr);gap:22px">' + related + '</div>' +
      '</div>' +
    '</main>';
  }

  function adminLogin() {
    return '<main style="max-width:460px;margin:0 auto;padding:70px 24px 90px">' +
      '<div style="background:#fff;border:1px solid #E7E3DA;border-radius:20px;padding:36px 32px;box-shadow:0 10px 30px rgba(31,74,52,.08)">' +
        '<div style="width:56px;height:56px;border-radius:16px;background:#EAF1EB;display:flex;align-items:center;justify-content:center;color:#1F4A34;margin-bottom:20px"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></div>' +
        '<h1 style="font-family:\'Noto Serif Thai\',serif;font-size:33.8px;font-weight:700;color:#1B2019;margin:0 0 6px">สำหรับเจ้าของเว็บไซต์</h1>' +
        '<p style="color:#8A8F84;font-size:18.9px;margin:0 0 24px;line-height:1.5">เข้าสู่ระบบเพื่อเพิ่มหรือแก้ไขประกาศที่ดิน</p>' +
        '<label style="display:block;font-size:17.6px;font-weight:600;color:#3B4038;margin-bottom:8px">รหัสผ่าน</label>' +
        '<input type="password" data-fk="pw" value="' + attr(state.pw) + '" ' + oninput(function (e) { set({ pw: e.target.value, pwErr: false }); }) + ' ' + onkey(function (e) { if (e.key === 'Enter') login(); }) + ' placeholder="กรอกรหัสผ่าน" style="width:100%;border:1.5px solid ' + (state.pwErr ? '#C0453B' : '#E0DBD0') + ';border-radius:12px;padding:13px 15px;font-size:19.5px;color:#1B2019;outline:none;margin-bottom:6px">' +
        (state.pwErr ? '<div style="color:#C0453B;font-size:16.3px;font-weight:500;margin-bottom:8px">รหัสผ่านไม่ถูกต้อง</div>' : '') +
        '<button ' + click(login) + ' class="btn-dark" style="width:100%;margin-top:12px;background:#1F4A34;color:#fff;border:none;border-radius:12px;padding:14px;font-size:19.5px;font-weight:600;cursor:pointer">เข้าสู่ระบบ</button>' +
        '<div style="margin-top:18px;font-size:15.6px;color:#A7A99F;text-align:center">รหัสผ่านตัวอย่าง: 123456</div>' +
      '</div>' +
    '</main>';
  }

  function adminPanel() {
    var rows = state.listings.map(function (l) {
      return '<div class="admin-row" style="display:grid;grid-template-columns:64px 1fr 130px 130px 150px;gap:14px;padding:14px 20px;align-items:center;border-top:1px solid #EEEBE3">' +
        '<div style="width:56px;height:44px;border-radius:9px;overflow:hidden;background:#E4EAE1"><img src="' + attr(listImg(l)) + '" alt="" style="width:100%;height:100%;object-fit:cover"></div>' +
        '<div><div style="font-size:18.2px;font-weight:600;color:#1B2019;line-height:1.35">' + esc(l.title) + '</div><div style="font-size:15.6px;color:#8A8F84;margin-top:2px">' + esc(l.sizeText) + ' · ' + esc(l.deed) + '</div></div>' +
        '<div class="admin-hide" style="font-size:17.6px;color:#4A5047">' + esc(l.district) + '</div>' +
        '<div class="admin-hide" style="font-size:18.2px;font-weight:700;color:#1F4A34">฿' + fmt(l.price) + '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button ' + click((function (id) { return function () { openEdit(id); }; })(l.id)) + ' class="btn-outline" style="background:#fff;border:1px solid #D9D4C8;color:#1F4A34;font-size:16.3px;font-weight:600;padding:8px 13px;border-radius:9px;cursor:pointer">แก้ไข</button>' +
          '<button ' + click((function (id) { return function () { deleteListing(id); }; })(l.id)) + ' class="btn-del" aria-label="ลบ" style="width:36px;height:34px;background:#fff;border:1px solid #E7C9C5;color:#C0453B;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"></path></svg></button>' +
        '</div>' +
      '</div>';
    }).join('');

    var reviewRows = state.reviews.map(function (rv) {
      var av = (rv.avatar && rv.avatar.trim()) ? rv.avatar : img('photo-1500382017468-9049fed747ef');
      return '<div class="admin-row" style="display:grid;grid-template-columns:56px 1fr 100px 130px;gap:14px;padding:14px 20px;align-items:center;border-top:1px solid #EEEBE3">' +
        '<div style="width:48px;height:48px;border-radius:50%;overflow:hidden;background:#E4EAE1"><img src="' + attr(av) + '" alt="" style="width:100%;height:100%;object-fit:cover"></div>' +
        '<div><div style="font-size:18.2px;font-weight:600;color:#1B2019">' + esc(rv.name) + ' <span style="color:#8A8F84;font-weight:400;font-size:16.3px">· ' + esc(rv.plot) + '</span></div><div style="font-size:16.3px;color:#8A8F84;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px">' + esc(rv.text) + '</div></div>' +
        '<div class="admin-hide" style="font-size:17.6px;font-weight:700;color:#E3A81E">★ ' + rv.rating + '.0</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button ' + click((function (id) { return function () { openEditReview(id); }; })(rv.id)) + ' class="btn-outline" style="background:#fff;border:1px solid #D9D4C8;color:#1F4A34;font-size:16.3px;font-weight:600;padding:8px 13px;border-radius:9px;cursor:pointer">แก้ไข</button>' +
          '<button ' + click((function (id) { return function () { deleteReview(id); }; })(rv.id)) + ' class="btn-del" aria-label="ลบ" style="width:36px;height:34px;background:#fff;border:1px solid #E7C9C5;color:#C0453B;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"></path></svg></button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<main style="max-width:1080px;margin:0 auto;padding:34px 24px 90px">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px">' +
        '<div>' +
          '<div style="display:inline-flex;align-items:center;gap:7px;background:#EAF1EB;color:#1F4A34;font-size:16.3px;font-weight:600;padding:5px 12px;border-radius:20px;margin-bottom:10px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="20 6 9 17 4 12"></polyline></svg>เข้าสู่ระบบในฐานะเจ้าของเว็บไซต์</div>' +
          '<h1 style="font-family:\'Noto Serif Thai\',serif;font-size:36.4px;font-weight:700;color:#1B2019;margin:0">จัดการประกาศที่ดิน <span style="color:#8A8F84;font-weight:500;font-size:26px">· ' + state.listings.length + ' รายการ</span></h1>' +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
          '<button ' + click(resetData) + ' class="btn-danger-h" style="background:#fff;border:1px solid #E0DBD0;color:#8A8F84;font-size:17.6px;font-weight:500;padding:11px 16px;border-radius:11px;cursor:pointer">คืนค่าเริ่มต้น</button>' +
          '<button ' + click(logout) + ' class="btn-outline" style="background:#fff;border:1px solid #E0DBD0;color:#4A5047;font-size:17.6px;font-weight:500;padding:11px 16px;border-radius:11px;cursor:pointer">ออกจากระบบ</button>' +
          '<button ' + click(openAdd) + ' class="btn-dark" style="background:#1F4A34;border:none;color:#fff;font-size:18.2px;font-weight:600;padding:12px 20px;border-radius:11px;cursor:pointer;display:flex;align-items:center;gap:7px;box-shadow:0 2px 10px rgba(31,74,52,.22)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"></path></svg>เพิ่มที่ดินใหม่</button>' +
        '</div>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #E7E3DA;border-radius:16px;overflow:hidden">' +
        '<div class="admin-head" style="display:grid;grid-template-columns:64px 1fr 130px 130px 150px;gap:14px;padding:14px 20px;background:#F1F0EA;font-size:16.3px;font-weight:600;color:#6B7065"><div>รูป</div><div>ชื่อประกาศ</div><div class="admin-hide">อำเภอ</div><div class="admin-hide">ราคา</div><div style="text-align:right">จัดการ</div></div>' +
        rows +
      '</div>' +
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:40px 0 18px">' +
        '<h2 style="font-family:\'Noto Serif Thai\',serif;font-size:28.6px;font-weight:700;color:#1B2019;margin:0">รีวิวลูกค้า <span style="color:#8A8F84;font-weight:500;font-size:20.8px">· ' + state.reviews.length + ' รายการ</span></h2>' +
        '<button ' + click(openAddReview) + ' class="btn-marigold" style="background:#E3A81E;border:none;color:#fff;font-size:17.6px;font-weight:600;padding:11px 18px;border-radius:11px;cursor:pointer;display:flex;align-items:center;gap:7px;box-shadow:0 2px 10px rgba(184,137,46,.25)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"></path></svg>เพิ่มรีวิว</button>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #E7E3DA;border-radius:16px;overflow:hidden">' +
        '<div class="admin-head" style="display:grid;grid-template-columns:56px 1fr 100px 130px;gap:14px;padding:14px 20px;background:#F1F0EA;font-size:16.3px;font-weight:600;color:#6B7065"><div>รูป</div><div>ลูกค้า / รีวิว</div><div class="admin-hide">คะแนน</div><div style="text-align:right">จัดการ</div></div>' +
        reviewRows +
      '</div>' +
    '</main>';
  }

  function footer() {
    var cols = [
      { title:'ประกาศปัจจุบัน', links:['ที่ดินคลอง 7 ลำลูกกา','500 ตารางวา','ถมแล้วพร้อมใช้'] },
      { title:'เหมาะสำหรับ', links:['สร้างบ้าน','บ้านสวนติดคลอง','โกดัง / ร้านอาหาร'] },
      { title:'ข้อมูลทำเล', links:['ลำลูกกา ปทุมธานี','ติดคลอง 7','ติดถนนสาธารณะ'] },
      { title:'ติดต่อทรายทองพัฒนา', links:['โทร 097-428-7891','Facebook ทรายทองพัฒนา','แผนที่สำนักงาน'] }
    ].map(function (c) {
      var links = c.links.map(function (lk) {
        var href = '#';
        if (lk === 'โทร 097-428-7891') href = 'tel:0974287891';
        else if (lk === 'Facebook ทรายทองพัฒนา') href = 'https://www.facebook.com/saithongptn';
        else if (lk === 'แผนที่สำนักงาน') href = 'https://www.bing.com/maps/search?q=สำนักงานขาย+ทรายทองพัฒนา%2C+Amphoe+Muang+Pathum+Thani%2C+Thailand';
        return '<a href="' + attr(href) + '"' + (href.indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '') + ' class="foot-link" style="font-size:16.9px;color:rgba(255,255,255,.62)">' + esc(lk) + '</a>';
      }).join('');
      return '<div><div style="font-size:17.6px;font-weight:600;color:#fff;margin-bottom:14px">' + esc(c.title) + '</div><div style="display:flex;flex-direction:column;gap:9px">' + links + '</div></div>';
    }).join('');

    return '<footer style="background:#141F18;color:rgba(255,255,255,.7);margin-top:70px">' +
      '<div style="max-width:1240px;margin:0 auto;padding:56px 24px 30px">' +
        '<div class="footer-grid" style="display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr 1fr;gap:30px;padding-bottom:40px;border-bottom:1px solid rgba(255,255,255,.1)">' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:#fff;flex:none"><img src="' + LOGO + '" alt="ทรายทองพัฒนา" style="width:100%;height:100%;object-fit:cover;transform:scale(1.05)"></div><div style="font-family:\'Noto Serif Thai\',serif;font-weight:700;font-size:22.1px;color:#fff">ซื้อขายที่ดินปทุมธานี ราคาถูก สายคลอง<br><span style="font-size:16.9px;font-weight:500">by ทรายทองพัฒนา</span></div></div>' +
            '<p style="font-size:17.6px;line-height:1.6;margin:0 0 16px;font-weight:300;max-width:280px">ข้อมูลที่ดินพร้อมขายในปทุมธานีและพื้นที่สายคลอง นัดชมแปลงจริงและสอบถามรายละเอียดกับคุณทรายโดยตรง</p>' +
            '<div style="display:flex;align-items:center;gap:8px;color:#EBD9A8;font-weight:600;font-size:19.5px"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"></path></svg>097-428-7891 (ทราย)</div>' +
          '</div>' +
          cols +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding-top:22px;font-size:16.3px;color:rgba(255,255,255,.5);flex-wrap:wrap;gap:12px"><span>© 2026 ทรายทองพัฒนา · ซื้อขายที่ดินปทุมธานี สายคลอง</span><span>ควรตรวจสอบข้อมูลและเอกสารสิทธิ์ก่อนทำสัญญา · <a href="admin.html" style="color:rgba(255,255,255,.5)">สำหรับผู้ดูแล</a></span></div>' +
      '</div>' +
    '</footer>';
  }

  /* ---- overlays ---- */
  function compareBar() {
    if (!(state.compare.length > 0 && !state.showCompareModal)) return '';
    return '<div class="compare-bar" style="position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:60;background:#1B2019;color:#fff;border-radius:16px;padding:12px 14px 12px 20px;display:flex;align-items:center;gap:16px;box-shadow:0 12px 40px rgba(0,0,0,.35)">' +
      '<span style="font-size:18.2px;font-weight:600">เปรียบเทียบที่ดิน · ' + state.compare.length + '</span>' +
      '<button ' + click(function () { set({ showCompareModal: true }); }) + ' style="background:#EBD9A8;color:#1B2019;border:none;border-radius:10px;padding:10px 18px;font-size:17.6px;font-weight:700;cursor:pointer">ดูการเปรียบเทียบ</button>' +
      '<button ' + click(function () { set({ compare: [] }); }) + ' style="background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:16.9px">ล้าง</button>' +
    '</div>';
  }

  function advisorWidget() {
    if (state.advisorHidden) return '';
    var panel = state.advisorOpen ?
      '<div class="advisor-panel" role="dialog" aria-label="ปรึกษาซื้อขายที่ดิน">' +
        '<button ' + click(function () { set({ advisorOpen: false }); }) + ' class="advisor-panel-close" aria-label="ปิดหน้าต่างปรึกษา">×</button>' +
        '<div class="advisor-panel-head"><img src="assets/advisor-khunsai.png" alt="คุณทราย"><div><small>ผู้ให้คำปรึกษา</small><strong>คุณทราย · ทรายทองพัฒนา</strong></div></div>' +
        '<h3>ปรึกษาซื้อ–ขายที่ดินฟรี</h3>' +
        '<p>สอบถามข้อมูลแปลง นัดชมที่ดิน หรือฝากขายกับคุณทรายได้โดยตรง</p>' +
        '<div class="advisor-actions">' +
          '<a href="tel:0974287891" class="advisor-call">โทร 097-428-7891</a>' +
          '<a href="https://m.me/saithongptn" target="_blank" rel="noopener" class="advisor-facebook">แชทผ่าน Facebook</a>' +
        '</div>' +
      '</div>' : '';
    return '<aside class="advisor-widget' + (state.advisorOpen ? ' is-open' : '') + '">' +
      panel +
      '<div class="advisor-launcher">' +
        '<button ' + click(function () { set({ advisorOpen: !state.advisorOpen }); }) + ' class="advisor-prompt" aria-expanded="' + (state.advisorOpen ? 'true' : 'false') + '">ปรึกษาซื้อ–ขายที่ดินฟรี</button>' +
        '<button ' + click(function (e) { e.stopPropagation(); set({ advisorHidden: true, advisorOpen: false }); }) + ' class="advisor-dismiss" aria-label="ซ่อนปุ่มปรึกษา">×</button>' +
        '<button ' + click(function () { set({ advisorOpen: !state.advisorOpen }); }) + ' class="advisor-avatar" aria-label="เปิดหน้าต่างปรึกษากับคุณทราย"><img src="assets/advisor-khunsai.png" alt="คุณทราย"><span>คุณทราย</span></button>' +
      '</div>' +
    '</aside>';
  }

  function compareModal() {
    if (!state.showCompareModal) return '';
    var items = state.compare.map(function (id) { return state.listings.find(function (l) { return l.id === id; }); }).filter(Boolean);
    var cols = items.map(function (l) {
      return '<div style="border:1px solid #E7E3DA;border-radius:14px;overflow:hidden">' +
        '<div style="height:120px;background:#E4EAE1"><img src="' + attr(listImg(l)) + '" alt="" style="width:100%;height:100%;object-fit:cover"></div>' +
        '<div style="padding:14px"><div style="font-size:18.2px;font-weight:600;color:#1B2019;line-height:1.35;margin-bottom:10px;min-height:38px">' + esc(l.title) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;font-size:16.9px">' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#8A8F84">ราคา</span><span style="font-weight:700;color:#1F4A34">฿' + fmt(l.price) + '</span></div>' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#8A8F84">ขนาด</span><span style="font-weight:600">' + esc(l.sizeText) + '</span></div>' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#8A8F84">ต่อไร่</span><span style="font-weight:600">฿' + fmt(perRai(l)) + '</span></div>' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#8A8F84">เอกสาร</span><span style="font-weight:600">' + esc(l.deed) + '</span></div>' +
          '<div style="display:flex;justify-content:space-between"><span style="color:#8A8F84">อำเภอ</span><span style="font-weight:600">' + esc(l.district) + '</span></div>' +
        '</div></div></div>';
    }).join('');
    return '<div ' + click(function () { set({ showCompareModal: false }); }) + ' style="position:fixed;inset:0;z-index:70;background:rgba(20,31,24,.55);display:flex;align-items:center;justify-content:center;padding:30px">' +
      '<div ' + click(function (e) { e.stopPropagation(); }) + ' class="thin" style="background:#fff;border-radius:20px;max-width:920px;width:100%;max-height:86vh;overflow:auto;padding:28px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px"><h2 style="font-family:\'Noto Serif Thai\',serif;font-size:31.2px;font-weight:600;margin:0;color:#1B2019">เปรียบเทียบที่ดิน</h2><button ' + click(function () { set({ showCompareModal: false }); }) + ' style="width:38px;height:38px;border-radius:10px;background:#F1F0EA;border:none;cursor:pointer;font-size:26px;color:#4A5047">×</button></div>' +
        '<div class="compare-modal-grid" style="display:grid;grid-template-columns:repeat(' + Math.max(1, items.length) + ',1fr);gap:16px">' + cols + '</div>' +
      '</div>' +
    '</div>';
  }

  function field(label, value, handler, opts) {
    opts = opts || {};
    var star = opts.required ? ' *' : '';
    var type = opts.type || 'text';
    var extra = opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : '';
    var fk = opts.fk || label;
    return '<label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:6px">' + esc(label) + star + '</label>' +
      '<input type="' + type + '" data-fk="' + attr(fk) + '"' + extra + ' value="' + attr(value) + '" ' + oninput(handler) + ' placeholder="' + attr(opts.placeholder || '') + '" style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:11px;padding:12px 14px;font-size:18.9px;color:#1B2019;outline:none' + (opts.mb === false ? '' : ';margin-bottom:16px') + '">';
  }
  function selectField(label, value, options, handler, fk) {
    var opts = options.map(function (o) { return '<option' + (o === value ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
    return '<label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:6px">' + esc(label) + '</label>' +
      '<select data-fk="' + attr(fk || label) + '" ' + onchange(handler) + ' style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:11px;padding:12px 14px;font-size:18.2px;color:#3B4038;cursor:pointer;outline:none">' + opts + '</select>';
  }

  function editModal() {
    var d = state.editing; if (!d) return '';
    var edRai = Number(d.rai) || 0, edPrice = Number(d.price) || 0, showCalc = edRai > 0 && edPrice > 0;

    var calc = showCalc ? '<div style="display:flex;gap:10px;margin-bottom:16px">' +
      '<div style="flex:1;background:#EAF1EB;border-radius:11px;padding:11px 14px"><div style="font-size:15px;color:#6B7065">ราคาต่อไร่</div><div style="font-size:20.8px;font-weight:700;color:#1F4A34">฿' + fmt(Math.round(edPrice / edRai)) + '</div></div>' +
      '<div style="flex:1;background:#F4EFE4;border-radius:11px;padding:11px 14px"><div style="font-size:15px;color:#6B7065">ราคาต่อตารางวา</div><div style="font-size:20.8px;font-weight:700;color:#E3A81E">฿' + fmt(Math.round(edPrice / (edRai * 400))) + '</div></div>' +
    '</div>' : '';

    var thumbs = (d.images || []).length ? '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px">' + (d.images || []).map(function (u, i) {
      return '<div style="position:relative;width:88px;height:66px;border-radius:10px;overflow:hidden;background:#E4EAE1;border:1px solid #E0DBD0"><img src="' + attr(u) + '" alt="" style="width:100%;height:100%;object-fit:cover">' +
        (i === 0 ? '<span style="position:absolute;left:4px;top:4px;background:rgba(31,74,52,.9);color:#fff;font-size:12.4px;font-weight:600;padding:2px 6px;border-radius:6px">หน้าปก</span>' : '') +
        '<button ' + click((function (idx) { return function () { removeDraftImage(idx); }; })(i)) + ' aria-label="ลบรูป" style="position:absolute;right:3px;top:3px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.6);border:none;color:#fff;cursor:pointer;font-size:18.2px;line-height:1;display:flex;align-items:center;justify-content:center">×</button></div>';
    }).join('') + '</div>' : '';

    var purposes = ['สร้างบ้าน','เกษตร','ลงทุน','รีสอร์ต','โกดัง'].map(function (pp) {
      var on = !!(d.purposes && d.purposes.includes(pp));
      return '<button ' + click((function (p) { return function () { toggleDraftPurpose(p); }; })(pp)) + ' style="border:1px solid ' + (on ? '#1F4A34' : '#E0DBD0') + ';background:' + (on ? '#1F4A34' : '#fff') + ';color:' + (on ? '#fff' : '#4A5047') + ';border-radius:20px;padding:8px 15px;font-size:16.9px;font-weight:500;cursor:pointer">' + esc(pp) + '</button>';
    }).join('');

    function checkbox(label, key, val) {
      return '<label style="display:flex;align-items:center;gap:8px;font-size:17.6px;color:#4A5047;cursor:pointer"><input type="checkbox"' + (val ? ' checked' : '') + ' ' + onchange((function (k) { return function (e) { setDraft(k, e.target.checked); }; })(key)) + ' style="width:17px;height:17px;accent-color:#1F4A34;cursor:pointer">' + esc(label) + '</label>';
    }

    return '<div ' + click(closeEdit) + ' style="position:fixed;inset:0;z-index:75;background:rgba(20,31,24,.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow:auto">' +
      '<div ' + click(function (e) { e.stopPropagation(); }) + ' style="background:#fff;border-radius:20px;max-width:640px;width:100%;padding:28px 30px 30px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px"><h2 style="font-family:\'Noto Serif Thai\',serif;font-size:29.9px;font-weight:700;margin:0;color:#1B2019">' + (d.id ? 'แก้ไขประกาศที่ดิน' : 'เพิ่มที่ดินใหม่') + '</h2><button ' + click(closeEdit) + ' style="width:38px;height:38px;border-radius:10px;background:#F1F0EA;border:none;cursor:pointer;font-size:26px;color:#4A5047">×</button></div>' +
        field('ชื่อประกาศ', d.title, function (e) { setDraft('title', e.target.value); }, { required:true, placeholder:'เช่น ที่ดินติดคลอง 7 ธัญบุรี', fk:'title' }) +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">' +
          '<div>' + selectField('อำเภอ', d.district, ['ธัญบุรี','คลองหลวง','ลำลูกกา','หนองเสือ','สามโคก','ลาดหลุมแก้ว','เมืองปทุมธานี'], function (e) { setDraft('district', e.target.value); }, 'district') + '</div>' +
          '<div>' + selectField('เอกสารสิทธิ์', d.deed, ['โฉนด (นส.4)','น.ส.3 ก.'], function (e) { setDraft('deed', e.target.value); }, 'deed') + '</div>' +
          '<div>' + field('ราคา (บาท)', d.price, function (e) { setDraft('price', e.target.value.replace(/[^0-9]/g, '')); }, { required:true, inputmode:'numeric', placeholder:'2850000', fk:'price', mb:false }) + '</div>' +
          '<div>' + field('ขนาด (ไร่)', d.rai, function (e) { setDraft('rai', e.target.value.replace(/[^0-9.]/g, '')); }, { required:true, inputmode:'decimal', placeholder:'2.5', fk:'rai', mb:false }) + '</div>' +
          '<div>' + field('ขนาด (ไร่-งาน-ตร.ว.)', d.sizeText, function (e) { setDraft('sizeText', e.target.value); }, { placeholder:'2-1-30 ไร่', fk:'sizeText', mb:false }) + '</div>' +
          '<div>' + field('หน้ากว้าง × ลึก', d.dim, function (e) { setDraft('dim', e.target.value); }, { placeholder:'40 × 92 ม.', fk:'dim', mb:false }) + '</div>' +
        '</div>' +
        calc +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">' +
          '<div>' + selectField('ผู้ขาย', d.owner, ['เจ้าของขายเอง','นายหน้า'], function (e) { setDraft('owner', e.target.value); }, 'owner') + '</div>' +
          '<div>' + field('ป้ายกำกับ (คั่นด้วย ,)', d.tags, function (e) { setDraft('tags', e.target.value); }, { placeholder:'ติดคลอง, ติดถนน, ใกล้เมือง', fk:'tags', mb:false }) + '</div>' +
        '</div>' +
        '<label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:8px">รูปภาพแปลงที่ดิน (เพิ่มได้หลายรูป)</label>' +
        thumbs +
        '<div style="display:flex;gap:10px;margin-bottom:10px">' +
          '<input data-fk="_imgUrl" value="' + attr(d._imgUrl) + '" ' + oninput(function (e) { setDraft('_imgUrl', e.target.value); }) + ' ' + onkey(function (e) { if (e.key === 'Enter') { e.preventDefault(); addDraftImageUrl(); } }) + ' placeholder="วางลิงก์รูป (URL) แล้วกดเพิ่ม" style="flex:1;border:1px solid #E0DBD0;border-radius:11px;padding:11px 14px;font-size:18.2px;color:#1B2019;outline:none">' +
          '<button ' + click(addDraftImageUrl) + ' style="flex:none;background:#1F4A34;color:#fff;border:none;border-radius:11px;padding:0 18px;font-size:18.2px;font-weight:600;cursor:pointer">เพิ่ม</button>' +
        '</div>' +
        '<label class="upload-drop" style="display:flex;align-items:center;justify-content:center;gap:8px;border:1.5px dashed #C9C2B2;border-radius:11px;padding:13px;font-size:17.6px;font-weight:600;color:#1F4A34;cursor:pointer;margin-bottom:18px"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M17 8l-5-5-5 5M12 3v12"></path></svg>อัปโหลดรูปจากเครื่อง (เลือกหลายรูปได้)<input type="file" accept="image/*" multiple ' + onchange(function (e) { addDraftFiles(e.target.files); }) + ' style="display:none"></label>' +
        '<label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:6px">พิกัดแผนที่ (lat, lng)</label>' +
        '<input data-fk="coord" value="' + attr(d.coord) + '" ' + oninput(function (e) { setDraft('coord', e.target.value); }) + ' placeholder="เช่น 14.0260, 100.7400 — วางจาก Google Maps (เว้นว่างจะใช้ตำแหน่งอำเภอ)" style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:11px;padding:12px 14px;font-size:18.2px;color:#1B2019;outline:none;margin-bottom:16px">' +
        '<label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:6px">ลิงก์ Google Maps (ไม่บังคับ)</label>' +
        '<input data-fk="mapUrl" value="' + attr(d.mapUrl) + '" ' + oninput(function (e) { setDraft('mapUrl', e.target.value); }) + ' placeholder="https://maps.app.goo.gl/..." style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:11px;padding:12px 14px;font-size:18.2px;color:#1B2019;outline:none;margin-bottom:16px">' +
        '<label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:6px">จุดเด่นของแปลง (บรรทัดละ 1 ข้อ)</label>' +
        '<textarea data-fk="highlights" ' + oninput(function (e) { setDraft('highlights', e.target.value); }) + ' rows="3" placeholder="ติดคลองชลประทาน น้ำตลอดปี" style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:11px;padding:12px 14px;font-size:18.2px;color:#1B2019;outline:none;resize:vertical;font-family:inherit;margin-bottom:16px">' + esc(d.highlights) + '</textarea>' +
        '<label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:8px">เหมาะสำหรับ</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">' + purposes + '</div>' +
        '<label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:8px">สถานะและสาธารณูปโภค</label>' +
        '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:24px">' + checkbox('ตรวจสอบแล้ว','verified',d.verified) + checkbox('พร้อมโอน','ready',d.ready) + checkbox('ติดถนน','road',d.road) + checkbox('มีน้ำ','water',d.water) + checkbox('มีไฟฟ้า','power',d.power) + '</div>' +
        (d._err ? '<div style="color:#C0453B;font-size:16.9px;font-weight:500;margin-bottom:14px">กรุณากรอกชื่อประกาศ ราคา และขนาดที่ดิน</div>' : '') +
        '<div style="display:flex;gap:12px;justify-content:flex-end"><button ' + click(closeEdit) + ' style="background:#fff;border:1px solid #E0DBD0;color:#4A5047;font-size:18.9px;font-weight:600;padding:13px 22px;border-radius:12px;cursor:pointer">ยกเลิก</button><button ' + click(saveDraft) + ' class="btn-dark" style="background:#1F4A34;border:none;color:#fff;font-size:18.9px;font-weight:600;padding:13px 26px;border-radius:12px;cursor:pointer">บันทึกประกาศ</button></div>' +
      '</div>' +
    '</div>';
  }

  function reviewModal() {
    var d = state.reviewEditing; if (!d) return '';
    var preview = (d.avatar && d.avatar.trim()) ? d.avatar : img('photo-1500382017468-9049fed747ef');
    var starPicker = [1,2,3,4,5].map(function (n) {
      var fill = n <= d.rating ? '#E0A82E' : '#E3DDCF';
      return '<button ' + click((function (v) { return function () { setReviewDraft('rating', v); }; })(n)) + ' aria-label="ให้คะแนน" style="background:none;border:none;cursor:pointer;padding:2px"><svg width="30" height="30" viewBox="0 0 24 24" fill="' + fill + '" stroke="' + fill + '" stroke-width="1"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.5 1.6 6.7L12 17l-6.2 3.6 1.6-6.7L2.2 8.9l6.9-.6z"></path></svg></button>';
    }).join('');

    return '<div ' + click(closeReview) + ' style="position:fixed;inset:0;z-index:75;background:rgba(20,31,24,.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow:auto">' +
      '<div ' + click(function (e) { e.stopPropagation(); }) + ' style="background:#fff;border-radius:20px;max-width:540px;width:100%;padding:28px 30px 30px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px"><h2 style="font-family:\'Noto Serif Thai\',serif;font-size:29.9px;font-weight:700;margin:0;color:#1B2019">' + (d.id ? 'แก้ไขรีวิว' : 'เพิ่มรีวิวลูกค้า') + '</h2><button ' + click(closeReview) + ' style="width:38px;height:38px;border-radius:10px;background:#F1F0EA;border:none;cursor:pointer;font-size:26px;color:#4A5047">×</button></div>' +
        '<div style="display:flex;align-items:center;gap:16px;margin-bottom:18px"><div style="width:64px;height:64px;border-radius:50%;overflow:hidden;background:#E4EAE1;flex:none;border:2px solid #EEEBE3"><img src="' + attr(preview) + '" alt="" style="width:100%;height:100%;object-fit:cover"></div><div style="flex:1"><label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:6px">รูปลูกค้า (URL)</label><input data-fk="rAvatar" value="' + attr(d.avatar) + '" ' + oninput(function (e) { setReviewDraft('avatar', e.target.value); }) + ' placeholder="วางลิงก์รูปโปรไฟล์ลูกค้า" style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:11px;padding:11px 14px;font-size:18.2px;color:#1B2019;outline:none"></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">' +
          '<div><label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:6px">ชื่อลูกค้า *</label><input data-fk="rName" value="' + attr(d.name) + '" ' + oninput(function (e) { setReviewDraft('name', e.target.value); }) + ' placeholder="เช่น คุณสมชาย ก." style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:11px;padding:12px 14px;font-size:18.9px;color:#1B2019;outline:none"></div>' +
          '<div><label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:6px">แปลง / ทำเลที่ซื้อ</label><input data-fk="rPlot" value="' + attr(d.plot) + '" ' + oninput(function (e) { setReviewDraft('plot', e.target.value); }) + ' placeholder="เช่น ที่ดินธัญบุรี 2 ไร่" style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:11px;padding:12px 14px;font-size:18.9px;color:#1B2019;outline:none"></div>' +
        '</div>' +
        '<label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:8px">คะแนน</label>' +
        '<div style="display:flex;gap:6px;margin-bottom:16px">' + starPicker + '</div>' +
        '<label style="display:block;font-size:16.9px;font-weight:600;color:#3B4038;margin-bottom:6px">ข้อความรีวิว *</label>' +
        '<textarea data-fk="rText" ' + oninput(function (e) { setReviewDraft('text', e.target.value); }) + ' rows="4" placeholder="เล่าประสบการณ์การซื้อขายที่ดิน..." style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:11px;padding:12px 14px;font-size:18.2px;color:#1B2019;outline:none;resize:vertical;font-family:inherit;margin-bottom:16px">' + esc(d.text) + '</textarea>' +
        (d._err ? '<div style="color:#C0453B;font-size:16.9px;font-weight:500;margin-bottom:14px">กรุณากรอกชื่อลูกค้าและข้อความรีวิว</div>' : '') +
        '<div style="display:flex;gap:12px;justify-content:flex-end"><button ' + click(closeReview) + ' style="background:#fff;border:1px solid #E0DBD0;color:#4A5047;font-size:18.9px;font-weight:600;padding:13px 22px;border-radius:12px;cursor:pointer">ยกเลิก</button><button ' + click(saveReview) + ' class="btn-dark" style="background:#1F4A34;border:none;color:#fff;font-size:18.9px;font-weight:600;padding:13px 26px;border-radius:12px;cursor:pointer">บันทึกรีวิว</button></div>' +
      '</div>' +
    '</div>';
  }

  function contactModal() {
    var ct = state.contactType; if (!ct) return '';
    var a = activeListing();
    var cfg = {
      appt:{ title:'นัดเข้าดูที่ดิน', subtitle:'กรอกข้อมูลเพื่อนัดหมายเข้าชมแปลงที่ดินกับผู้ขาย', cta:'ส่งคำขอนัดดู', notePlaceholder:'เช่น สะดวกช่วงบ่าย หรือขอให้พาชมแนวเขต', isAppt:true, isDocs:false, isReport:false, doneTitle:'ส่งคำขอนัดดูแล้ว', doneMsg:'ทีมงานทรายทองพัฒนาจะติดต่อกลับเพื่อยืนยันวันและเวลานัดหมายโดยเร็ว' },
      docs:{ title:'ขอเอกสารเพิ่มเติม', subtitle:'เลือกเอกสารที่ต้องการ แล้วกรอกข้อมูลติดต่อกลับ', cta:'ส่งคำขอเอกสาร', notePlaceholder:'ระบุเอกสารอื่น ๆ ที่ต้องการเพิ่มเติม', isAppt:false, isDocs:true, isReport:false, doneTitle:'ส่งคำขอเอกสารแล้ว', doneMsg:'ผู้ขายจะจัดส่งสำเนาเอกสารที่คุณเลือกให้ทางช่องทางที่ติดต่อไว้' },
      report:{ title:'รายงานประกาศนี้', subtitle:'แจ้งปัญหาที่พบเพื่อให้ทีมงานตรวจสอบ', cta:'ส่งรายงาน', notePlaceholder:'อธิบายรายละเอียดเพิ่มเติม (ถ้ามี)', isAppt:false, isDocs:false, isReport:true, doneTitle:'รับเรื่องแล้ว ขอบคุณครับ', doneMsg:'ทีมงานจะตรวจสอบประกาศนี้และดำเนินการตามความเหมาะสมโดยเร็วที่สุด' }
    };
    var c = cfg[ct];

    var body;
    if (state.contactDone) {
      body = '<div style="text-align:center;padding:14px 0 6px"><div style="width:64px;height:64px;border-radius:50%;background:#EAF1EB;display:flex;align-items:center;justify-content:center;margin:0 auto 18px"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2F8F5B" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div><h2 style="font-family:\'Noto Serif Thai\',serif;font-size:28.6px;font-weight:700;margin:0 0 8px;color:#1B2019">' + esc(c.doneTitle) + '</h2><p style="font-size:18.2px;color:#6B7065;line-height:1.6;margin:0 0 22px">' + esc(c.doneMsg) + '</p><button ' + click(closeContact) + ' class="btn-dark" style="background:#1F4A34;color:#fff;border:none;border-radius:12px;padding:13px 30px;font-size:18.9px;font-weight:600;cursor:pointer">เรียบร้อย</button></div>';
    } else {
      var reasons = c.isReport ? '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px">' + ['ข้อมูลไม่ตรงกับความจริง','ราคาหรือรูปภาพไม่ถูกต้อง','ขายไปแล้ว/ไม่มีอยู่จริง','สงสัยว่าเป็นการหลอกลวง'].map(function (r) {
        var on = state.reportReason === r;
        return '<label style="display:flex;align-items:center;gap:10px;border:1px solid ' + (on ? '#1F4A34' : '#E0DBD0') + ';background:' + (on ? '#F1F5F1' : '#fff') + ';border-radius:11px;padding:12px 14px;cursor:pointer;font-size:17.6px;color:#3B4038"><input type="radio" name="reportReason"' + (on ? ' checked' : '') + ' ' + onchange((function (rr) { return function () { set({ reportReason: rr }); }; })(r)) + ' style="accent-color:#1F4A34;width:16px;height:16px">' + esc(r) + '</label>';
      }).join('') + '</div>' : '';

      var docs = c.isDocs ? '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px">' + ['สำเนาโฉนด','ระวางที่ดิน','รูปแปลงเพิ่มเติม','ผังแปลง','ราคาประเมินราชการ'].map(function (dv) {
        var on = state.docSel.includes(dv);
        return '<button ' + click((function (val) { return function () { toggleDoc(val); }; })(dv)) + ' style="border:1px solid ' + (on ? '#1F4A34' : '#E0DBD0') + ';background:' + (on ? '#1F4A34' : '#fff') + ';color:' + (on ? '#fff' : '#4A5047') + ';border-radius:20px;padding:8px 14px;font-size:16.3px;font-weight:500;cursor:pointer">' + esc(dv) + '</button>';
      }).join('') + '</div>' : '';

      var apptDate = c.isAppt ? '<div><label style="display:block;font-size:16.3px;font-weight:600;color:#3B4038;margin-bottom:5px">วันที่สะดวกนัดดู</label><input type="date" data-fk="cDate" value="' + attr(state.cDate) + '" ' + oninput(function (e) { set({ cDate: e.target.value }); }) + ' style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:10px;padding:11px 13px;font-size:18.2px;outline:none;color:#3B4038"></div>' : '';

      body = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><h2 style="font-family:\'Noto Serif Thai\',serif;font-size:28.6px;font-weight:700;margin:0;color:#1B2019">' + esc(c.title) + '</h2><button ' + click(closeContact) + ' style="width:38px;height:38px;border-radius:10px;background:#F1F0EA;border:none;cursor:pointer;font-size:26px;color:#4A5047">×</button></div>' +
        '<p style="font-size:17.6px;color:#8A8F84;margin:0 0 20px;line-height:1.5">' + esc(c.subtitle) + '</p>' +
        '<div style="display:flex;gap:12px;align-items:center;background:#F7F5F0;border-radius:12px;padding:12px 14px;margin-bottom:20px"><div style="width:40px;height:40px;border-radius:9px;overflow:hidden;background:#E4EAE1;flex:none"><img src="' + attr(galleryImgs(a)[0]) + '" alt="" style="width:100%;height:100%;object-fit:cover"></div><div style="min-width:0"><div style="font-size:17.6px;font-weight:600;color:#1B2019;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(a.title) + '</div><div style="font-size:16.3px;color:#1F4A34;font-weight:600">฿' + fmt(a.price) + ' · ' + esc(a.sizeText) + '</div></div></div>' +
        reasons + docs +
        '<div style="display:flex;flex-direction:column;gap:12px"><div class="contact-primary-fields" style="display:flex;gap:12px"><div style="flex:1"><label style="display:block;font-size:16.3px;font-weight:600;color:#3B4038;margin-bottom:5px">ชื่อของคุณ *</label><input data-fk="cName" value="' + attr(state.cName) + '" ' + oninput(function (e) { set({ cName: e.target.value, contactErr: false }); }) + ' placeholder="ชื่อ-นามสกุล" style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:10px;padding:11px 13px;font-size:18.2px;outline:none"></div><div style="flex:1"><label style="display:block;font-size:16.3px;font-weight:600;color:#3B4038;margin-bottom:5px">เบอร์โทร *</label><input data-fk="cPhone" inputmode="tel" value="' + attr(state.cPhone) + '" ' + oninput(function (e) { set({ cPhone: e.target.value, contactErr: false }); }) + ' placeholder="08x-xxx-xxxx" style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:10px;padding:11px 13px;font-size:18.2px;outline:none"></div></div>' +
        apptDate +
        '<div><label style="display:block;font-size:16.3px;font-weight:600;color:#3B4038;margin-bottom:5px">ข้อความถึงผู้ขาย</label><textarea data-fk="cNote" ' + oninput(function (e) { set({ cNote: e.target.value }); }) + ' rows="2" placeholder="' + attr(c.notePlaceholder) + '" style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:10px;padding:11px 13px;font-size:18.2px;outline:none;resize:vertical;font-family:inherit">' + esc(state.cNote) + '</textarea></div></div>' +
        (state.contactErr ? '<div style="color:#C0453B;font-size:16.9px;font-weight:500;margin-top:12px">กรุณากรอกชื่อและเบอร์โทรติดต่อ</div>' : '') +
        '<button ' + click(submitContact) + ' class="btn-dark" style="width:100%;margin-top:18px;background:#1F4A34;color:#fff;border:none;border-radius:12px;padding:14px;font-size:19.5px;font-weight:700;cursor:pointer">' + esc(c.cta) + '</button>';
    }

    return '<div ' + click(closeContact) + ' style="position:fixed;inset:0;z-index:78;background:rgba(20,31,24,.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow:auto"><div ' + click(function (e) { e.stopPropagation(); }) + ' style="background:#fff;border-radius:20px;max-width:480px;width:100%;padding:28px 30px 30px">' + body + '</div></div>';
  }

  function lightbox() {
    if (state.lightbox < 0) return '';
    var imgs = galleryImgs(activeListing());
    var multi = imgs.length > 1;
    var nav = multi ? '<button ' + click(function (e) { e.stopPropagation(); lbStep(-1); }) + ' aria-label="ก่อนหน้า" style="position:absolute;left:26px;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.14);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"></path></svg></button><button ' + click(function (e) { e.stopPropagation(); lbStep(1); }) + ' aria-label="ถัดไป" style="position:absolute;right:26px;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.14);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"></path></svg></button>' : '';
    return '<div ' + click(closeLightbox) + ' style="position:fixed;inset:0;z-index:82;background:rgba(12,20,15,.92);display:flex;align-items:center;justify-content:center;padding:40px">' +
      '<button ' + click(closeLightbox) + ' aria-label="ปิด" style="position:absolute;top:22px;right:26px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.14);border:none;color:#fff;font-size:31.2px;cursor:pointer">×</button>' +
      nav +
      '<img ' + click(function (e) { e.stopPropagation(); }) + ' src="' + attr(imgs[state.lightbox]) + '" alt="" style="max-width:90vw;max-height:84vh;object-fit:contain;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
      '<div style="position:absolute;bottom:26px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.5);color:#fff;font-size:17.6px;font-weight:600;padding:7px 16px;border-radius:20px">' + (state.lightbox + 1) + ' / ' + imgs.length + '</div>' +
    '</div>';
  }

  function switcher() {
    return '';
  }

  /* ------------------------------------------------------------------ *
   * Render loop
   * ------------------------------------------------------------------ */
  function render() {
    // capture focus before we replace innerHTML
    var act = document.activeElement, fk = null, ss = null, se = null;
    if (act && act.dataset && act.dataset.fk) {
      fk = act.dataset.fk;
      try { ss = act.selectionStart; se = act.selectionEnd; } catch (e) {}
    }

    H = [];
    var main;
    if (state.page === 'detail') main = detail();
    else if (state.page === 'admin') main = state.authed ? adminPanel() : adminLogin();
    else main = home();

    app.innerHTML =
      '<div style="min-height:100vh">' +
        header() + main + footer() +
        compareBar() + advisorWidget() + compareModal() + editModal() + reviewModal() + contactModal() + lightbox() +
        switcher() +
      '</div>';

    // restore focus
    if (fk) {
      var el = app.querySelector('[data-fk="' + (window.CSS && CSS.escape ? CSS.escape(fk) : fk) + '"]');
      if (el) { el.focus(); if (ss != null && el.setSelectionRange) { try { el.setSelectionRange(ss, se); } catch (e) {} } }
    }
  }

  /* delegated events */
  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-click]'); if (t && app.contains(t)) { var f = H[+t.dataset.click]; if (f) f(e); }
  });
  app.addEventListener('input', function (e) {
    var t = e.target.closest('[data-input]'); if (t) { var f = H[+t.dataset.input]; if (f) f(e); }
  });
  app.addEventListener('change', function (e) {
    var t = e.target.closest('[data-change]'); if (t) { var f = H[+t.dataset.change]; if (f) f(e); }
  });
  app.addEventListener('keydown', function (e) {
    var t = e.target.closest('[data-keydown]'); if (t) { var f = H[+t.dataset.keydown]; if (f) f(e); }
  });
  // Esc closes any open overlay
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (state.lightbox >= 0) return closeLightbox();
    if (state.contactType) return closeContact();
    if (state.editing) return closeEdit();
    if (state.reviewEditing) return closeReview();
    if (state.showCompareModal) return set({ showCompareModal: false });
  });

  /* boot */
  state.listings = loadListings();
  state.reviews = loadReviews();
  render();
  loadRemoteListings();
})();
