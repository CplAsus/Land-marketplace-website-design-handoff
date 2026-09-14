/* ทรายทองพัฒนา — public marketplace. Administration lives in admin.html. */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var core = window.SiteCore;
  var contactRequest = 0;
  var modalOpener = null;

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  var state = {
    page: 'home',
    favs: [],
    onlyFavs: false,
    dataStatus: 'loading',
    compare: [],
    activeId: 'l1',
    showCompareModal: false,
    // contact modal
    contactType: null, contactDone: false, contactErr: false, contactErrorMessage: '', contactSubmitting: false,
    cName: '', cPhone: '', cLine: '', cDate: '', cNote: '', cWebsite: '', contactConsent: false, reportReason: '', docSel: [],
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

  function remoteListing(row) {
    return {
      id: row.id,
      status: row.status,
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
    if (!cfg || !cfg.url || !cfg.publishableKey) { set({dataStatus:'offline'}); return; }
    set({dataStatus:'loading'});
    var endpoint = cfg.url + '/rest/v1/land_listings?published=eq.true&status=in.(available,reserved,sold)&select=*&order=sort_order.desc,created_at.desc';
    core.fetchWithTimeout(endpoint, {
      headers: { apikey: cfg.publishableKey }
    }).then(function (res) {
      if (!res.ok) throw new Error('Unable to load listings');
      return res.json();
    }).then(function (rows) {
      if (!Array.isArray(rows)) throw new Error('Invalid listings response');
      var mapped = rows.filter(function(row) { return row.published && row.status !== 'draft'; }).map(remoteListing);
      if (mapped.length) mapped[0].featured = true;
      set({ listings:mapped, dataStatus:'ready', contactType:state.contactType && mapped.some(function(l) { return l.id === state.activeId; }) ? state.contactType : null, compare:state.compare.filter(function(id) { return mapped.some(function(l) { return l.id === id; }); }) });
    }).catch(function () {
      // Embedded content is a fallback, not confirmation of current availability.
      set({dataStatus:'offline'});
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
  function perRai(l) { return l.rai > 0 ? Math.round(l.price / l.rai) : 0; }
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
    return core.googleMapUrl(value);
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
  function updateRoute(id) {
    var hash = id ? '#listing/' + encodeURIComponent(id) : '#home';
    if (window.location.hash !== hash) history.pushState(null, '', hash);
  }
  function readRoute() {
    var match = window.location.hash.match(/^#listing\/(.+)$/);
    var id = '';
    try { id = match ? decodeURIComponent(match[1]) : ''; } catch (error) {}
    set({page:id ? 'detail' : 'home', activeId:id, lightbox:-1, contactType:null, showCompareModal:false});
    scrollPageTop();
  }
  function go(p) { updateRoute(''); set({ page:p, contactType:null, lightbox:-1 }); scrollPageTop(); }
  function scrollFeatured() {
    var el = document.getElementById('featured-listings');
    if (el) { el.focus({preventScroll:true}); window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 80, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  }
  function clearFilters() {
    set({ filterDistrict:'ทุกพื้นที่', filterBudget:'ไม่จำกัด', filterSize:'ทุกขนาด', filterPurpose:'ทุกประเภท', onlyFavs:false });
    setTimeout(scrollFeatured, 0);
  }
  function filteredListings() {
    return state.listings.filter(function (l) {
      if (state.onlyFavs && !state.favs.includes(l.id)) return false;
      if (!state.onlyFavs && l.status === 'sold') return false;
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
  function openDetail(id) { updateRoute(id); set({ page:'detail', activeId:id, lightbox:-1, showCompareModal:false }); scrollPageTop(); }
  function toggleFav(id) {
    var f = state.favs.slice(), i = f.indexOf(id);
    i >= 0 ? f.splice(i, 1) : f.push(id);
    try { localStorage.setItem('ttp_favorites_v1', JSON.stringify(f)); } catch (error) {}
    set({favs:f});
  }
  function toggleCompare(id) { var c = state.compare.slice(); var i = c.indexOf(id); if (i >= 0) c.splice(i, 1); else if (c.length < 4) c.push(id); set({ compare: c }); }

  // contact
  function openContact(type) {
    if (!state.listings.length) return;
    contactRequest++;
    set({ activeId:activeListing().id, contactType:type, contactDone:false, contactErr:false, contactErrorMessage:'', contactSubmitting:false, cName:'', cPhone:'', cLine:'', cDate:'', cNote:'', cWebsite:'', contactConsent:false, reportReason:'', docSel:[], advisorOpen:false });
  }
  function closeContact() { if (!state.contactSubmitting) { contactRequest++; set({contactType:null}); } }
  function updateContact(field, value) {
    state[field] = value;
    if (state.contactErr) set({contactErr:false, contactErrorMessage:''});
  }
  function toggleDoc(v) { var arr = state.docSel.slice(); var i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); set({ docSel: arr }); }
  async function submitContact() {
    if (state.contactSubmitting) return;
    var name = state.cName.trim(), phone = state.cPhone.trim();
    var validationError = core.contactError(state);
    if (validationError) {
      set({ contactErr:true, contactErrorMessage:validationError });
      return;
    }
    // Honeypot: bots often fill this hidden field. Show success without storing spam.
    if (state.cWebsite.trim()) { set({ contactDone:true, contactErr:false, contactSubmitting:false }); return; }
    var cfg = window.SUPABASE_CONFIG, listing = activeListing();
    if (!cfg || !cfg.url || !cfg.publishableKey) {
      set({ contactErr:true, contactErrorMessage:'ระบบรับข้อมูลยังไม่พร้อม กรุณาโทร 097-428-7891', contactSubmitting:false });
      return;
    }
    var listingId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(listing.id || '')) ? listing.id : null;
    var payload = {
      listing_id: listingId,
      listing_title: String(listing.title || '').slice(0, 300),
      customer_name: name.slice(0, 120),
      phone: phone.slice(0, 40),
      line_id: state.cLine.trim() ? state.cLine.trim().slice(0, 100) : null,
      request_type: state.contactType || 'interest',
      appointment_date: state.cDate || null,
      message: state.cNote.trim() ? state.cNote.trim().slice(0, 2000) : null,
      requested_documents: state.docSel.slice(0, 10),
      report_reason: state.reportReason || null,
      source: (window.location.origin + window.location.pathname).slice(0, 500)
    };
    set({ contactSubmitting:true, contactErr:false, contactErrorMessage:'' });
    var request = contactRequest;
    try {
      var response = await core.fetchWithTimeout(cfg.url + '/rest/v1/customer_leads', {
        method: 'POST',
        headers: { apikey:cfg.publishableKey, 'Content-Type':'application/json', Prefer:'return=minimal' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('lead_submit_failed');
      if (request !== contactRequest) return;
      set({ contactDone:true, contactErr:false, contactSubmitting:false });
    } catch (error) {
      if (request !== contactRequest) return;
      set({ contactErr:true, contactErrorMessage:'ส่งข้อมูลไม่สำเร็จ กรุณาลองอีกครั้งหรือโทร 097-428-7891', contactSubmitting:false });
    }
  }

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
    if (l.status === 'reserved' || l.status === 'sold') badge += '<span class="listing-status">' + (l.status === 'sold' ? 'ขายแล้ว' : 'จองแล้ว') + '</span>';
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
        '<a href="#home" ' + click(function (e) { e.preventDefault(); go('home'); }) + ' aria-label="ทรายทองพัฒนา กลับหน้าแรก" style="display:flex;align-items:center;gap:11px;cursor:pointer;flex:none">' +
          '<div style="width:46px;height:46px;border-radius:50%;overflow:hidden;background:#fff;border:1px solid #EFE3D0;flex:none;box-shadow:0 2px 8px rgba(31,74,52,.15)"><img src="' + LOGO + '" alt="ทรายทองพัฒนา" style="width:100%;height:100%;object-fit:cover;transform:scale(1.05)"></div>' +
          '<div style="line-height:1.05">' +
            '<div style="font-family:\'Noto Serif Thai\',serif;font-weight:700;font-size:21.5px;color:#1F4A34">ทรายทองพัฒนา</div>' +
            '<div style="font-size:13.7px;color:#8A8F84;letter-spacing:.3px;font-weight:500">ที่ดินสายคลอง · ปทุมธานี · นครนายก</div>' +
          '</div>' +
        '</a>' +
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
    var resultText = 'พบ ' + filtered.length + ' แปลง' + (hasFilters ? 'ตามตัวกรองที่เลือก' : ' · ข้อมูลจากทรายทองพัฒนา');
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
          '<p style="font-size:23.4px;line-height:1.6;color:rgba(255,255,255,.82);margin:0 0 40px;max-width:680px;font-weight:300">ที่ดินปทุมธานี นครนายก และพื้นที่สายคลอง ค้นหาตามทำเล งบประมาณ ขนาด และวัตถุประสงค์</p>' +
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
      '<section id="featured-listings" tabindex="-1" class="featured-section" style="max-width:1240px;margin:0 auto;padding:64px 24px 20px">' +
        '<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px;gap:16px;flex-wrap:wrap">' +
          '<div><h2 style="font-family:\'Noto Serif Thai\',serif;font-size:36.4px;font-weight:600;margin:0 0 4px;color:#1B2019">' + (state.onlyFavs ? 'ที่ดินที่บันทึกไว้' : 'ที่ดินพร้อมขาย') + '</h2><p aria-live="polite" style="margin:0;color:#63695f;font-size:18.9px">' + resultText + '</p></div>' +
          '<button class="saved-filter" aria-pressed="' + state.onlyFavs + '" ' + click(function() { set({onlyFavs:!state.onlyFavs}); scrollFeatured(); }) + '>' + (state.onlyFavs ? 'ดูประกาศทั้งหมด' : 'ที่บันทึกไว้ (' + state.favs.length + ')') + '</button>' +
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
    if (!state.listings.some(function(l) { return l.id === state.activeId; })) {
      return '<main class="unavailable-listing"><h1>' + (state.dataStatus === 'loading' ? 'กำลังค้นหาประกาศ…' : 'ไม่พบประกาศนี้') + '</h1><p>ประกาศอาจถูกนำออก หรือยังไม่สามารถโหลดข้อมูลล่าสุดได้</p><button class="saved-filter" ' + click(function() { go('home'); }) + '>กลับไปดูประกาศทั้งหมด</button></main>';
    }
    var a = activeListing();
    var imgs = galleryImgs(a);
    var exactPoint = a.lat != null && a.lng != null ? core.coordinates(a.lat + ',' + a.lng) : null;
    var lat = exactPoint ? exactPoint.lat : districtCoord(a.district)[0];
    var lng = exactPoint ? exactPoint.lng : districtCoord(a.district)[1];
    var moreCount = Math.max(0, imgs.length - 3);

    var badges = [a.status === 'sold' ? 'ขายแล้ว' : a.status === 'reserved' ? 'จองแล้ว' : null, a.verified ? 'ตรวจสอบเบื้องต้นแล้ว' : null, a.ready ? 'ฟรีค่าโอน' : null].filter(Boolean)
      .map(function (b) { return '<span style="display:inline-flex;align-items:center;gap:5px;background:#EAF1EB;color:#1F4A34;font-size:16.3px;font-weight:600;padding:6px 12px;border-radius:20px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2F8F5B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' + esc(b) + '</span>'; }).join('');

    var highlights = (a.highlights || []).map(function (h) { return '<li style="display:flex;align-items:flex-start;gap:9px;font-size:18.9px;color:#4A5047;line-height:1.5"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F8F5B" stroke-width="2.4" style="flex:none;margin-top:2px"><polyline points="20 6 9 17 4 12"></polyline></svg>' + esc(h) + '</li>'; }).join('');

    var utils = [
      a.power ? { l:'ไฟฟ้า', i:ICON.bolt } : { l:'ไม่มีไฟฟ้า', i:ICON.bolt },
      a.water ? { l:'น้ำประปา/คลอง', i:ICON.wave } : { l:'ไม่มีน้ำ', i:ICON.wave },
      a.road ? { l:'ถนนเข้าถึง', i:ICON.road } : { l:'โปรดสอบถามทางเข้า', i:ICON.road }
    ].map(function (u) { return '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E7E3DA;border-radius:12px;padding:12px 16px;font-size:17.6px;font-weight:500;color:#3B4038">' + ic(u.i) + esc(u.l) + '</div>'; }).join('');

    var purposes = (a.purposes || []).map(function (p) { return '<span style="background:#F4EFE4;color:#7A5C3E;font-size:17.6px;font-weight:600;padding:8px 16px;border-radius:12px">' + esc(p) + '</span>'; }).join('');

    var nearby = (a.nearby || []).map(function (n) { return '<li style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #E7E3DA;border-radius:10px;padding:12px 15px;font-size:17.6px;color:#4A5047"><span>' + esc(n.name) + '</span><span style="color:#8A8F84;font-weight:500">' + esc(n.dist) + '</span></li>'; }).join('');

    var thirdOverlay = '<div ' + click(function () { openLightbox(2); }) + ' style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;cursor:pointer">' + (imgs.length > 3 ? '<span style="background:rgba(23,55,38,.6);color:#fff;font-size:19.5px;font-weight:700;padding:8px 16px;border-radius:20px">+' + moreCount + ' รูป</span>' : '') + '</div>';

    var isFav = state.favs.includes(a.id);
    var favBg = isFav ? '#FBEDEB' : '#fff', favBorder = isFav ? '#E7C9C5' : '#E7E3DA', favColor = isFav ? '#C0453B' : '#4A5047', favFill = isFav ? '#C0453B' : 'none', favLabel = isFav ? 'บันทึกแล้ว' : 'บันทึกไว้';

    var related = state.listings.filter(function (l) { return l.id !== a.id && l.status !== 'sold'; }).slice(0, 4).map(landCard).join('');

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
          (exactPoint ? '<div style="border:1px solid #E7E3DA;border-radius:16px;overflow:hidden;margin-bottom:14px"><iframe loading="lazy" title="ทำเลที่ดิน" src="' + attr(mapSrcFor(lat, lng)) + '" style="width:100%;height:360px;border:0;display:block"></iframe></div>' : '<p class="map-notice">ยังไม่ระบุพิกัดแปลง กรุณาสอบถามผู้ขายก่อนเดินทาง</p>') +
          (exactPoint || googleMapUrl(a.mapUrl) ? '<a href="' + attr(googleMapLinkFor(a, lat, lng)) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:7px;color:#1F4A34;font-size:18.2px;font-weight:700;margin:0 0 14px;text-decoration:none">เปิดตำแหน่งนี้ใน Google Maps ↗</a>' : '') +
          '<ul class="nearby-list" style="list-style:none;padding:0;margin:0 0 8px;display:grid;grid-template-columns:1fr 1fr;gap:10px">' + nearby + '</ul>' +
        '</div>' +

        // STICKY CTA
        '<div class="detail-cta" style="position:sticky;top:90px;display:flex;flex-direction:column;gap:16px">' +
          '<div style="background:#fff;border:1px solid #E7E3DA;border-radius:18px;padding:24px;box-shadow:0 10px 30px rgba(31,74,52,.08)">' +
            '<div style="font-size:16.9px;color:#8A8F84;margin-bottom:2px">ราคาขาย</div>' +
            '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px"><span style="font-size:41.6px;font-weight:700;color:#1F4A34;letter-spacing:-.5px">฿' + fmt(a.price) + '</span></div>' +
            '<div style="font-size:17.6px;color:#6B7065;padding-bottom:18px;margin-bottom:18px;border-bottom:1px solid #EEEBE3">' + fmt(perRai(a)) + ' บาท/ไร่ · ' + esc(a.sizeText) + '</div>' +
            '<div style="display:flex;flex-direction:column;gap:10px">' +
              '<button ' + click(function () { openContact('interest'); }) + ' class="lead-callback-btn">ให้คุณทรายติดต่อกลับ</button>' +
              '<div class="lead-quick-actions"><button ' + click(function () { openContact('appt'); }) + '>นัดดูแปลง</button><button ' + click(function () { openContact('docs'); }) + '>ขอเอกสาร</button></div>' +
              '<a href="tel:0974287891" class="btn-dark" style="width:100%;box-sizing:border-box;background:#1F4A34;color:#fff;border:none;border-radius:12px;padding:15px;font-size:20.2px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;text-decoration:none"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"></path></svg>โทรหาผู้ขาย · 097-428-7891</a>' +
              '<a href="https://www.facebook.com/saithongptn" target="_blank" rel="noopener" class="btn-fb" style="width:100%;box-sizing:border-box;background:#1877F2;color:#fff;border:none;border-radius:12px;padding:14px;font-size:18.9px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.5V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"></path></svg>แชทผ่านเฟซบุ๊ก</a>' +
              '<button ' + click(function () { toggleFav(a.id); }) + ' class="btn-fav" style="width:100%;background:' + favBg + ';border:1px solid ' + favBorder + ';border-radius:12px;padding:14px;font-size:18.9px;font-weight:600;color:' + favColor + ';cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="17" height="17" viewBox="0 0 24 24" fill="' + favFill + '" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"></path></svg>' + favLabel + '</button>' +
              '<button ' + click(function () { openContact('report'); }) + ' class="lead-report-link">แจ้งปัญหาเกี่ยวกับประกาศนี้</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // nearby
      (related ? '<div style="margin-top:56px">' +
        '<h2 style="font-family:\'Noto Serif Thai\',serif;font-size:31.2px;font-weight:600;color:#1B2019;margin:0 0 20px">ที่ดินใกล้เคียงที่คุณอาจสนใจ</h2>' +
        '<div class="grid-4" style="display:grid;grid-template-columns:repeat(4,1fr);gap:22px">' + related + '</div>' +
      '</div>' : '') +
    '</main>';
  }

  function footer() {
    var cols = [
      { title:'ประกาศที่ดิน', links:['ดูประกาศทั้งหมด','ที่ดินที่บันทึกไว้'] },
      { title:'เหมาะสำหรับ', links:['สร้างบ้าน','ลงทุน','โกดัง / โรงงาน'] },
      { title:'ข้อมูลทำเล', links:['ปทุมธานี (ทุกอำเภอ)','นครนายก (ทุกอำเภอ)'] },
      { title:'ติดต่อทรายทองพัฒนา', links:['โทร 097-428-7891','Facebook ทรายทองพัฒนา','แผนที่สำนักงาน'] }
    ].map(function (c) {
      var links = c.links.map(function (lk) {
        var href = '#home';
        if (lk === 'โทร 097-428-7891') href = 'tel:0974287891';
        else if (lk === 'Facebook ทรายทองพัฒนา') href = 'https://www.facebook.com/saithongptn';
        else if (lk === 'แผนที่สำนักงาน') href = 'https://www.bing.com/maps/search?q=สำนักงานขาย+ทรายทองพัฒนา%2C+Amphoe+Muang+Pathum+Thani%2C+Thailand';
        var action = href === '#home' ? ' ' + click(function(e) {
          e.preventDefault();
          state.onlyFavs = lk === 'ที่ดินที่บันทึกไว้';
          state.filterDistrict = c.title === 'ข้อมูลทำเล' ? lk : 'ทุกพื้นที่';
          state.filterPurpose = c.title === 'เหมาะสำหรับ' ? lk : 'ทุกประเภท';
          state.filterBudget = 'ไม่จำกัด'; state.filterSize = 'ทุกขนาด';
          go('home'); setTimeout(scrollFeatured, 260);
        }) : '';
        return '<a href="' + attr(href) + '"' + action + (href.indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '') + ' class="foot-link" style="font-size:16.9px;color:rgba(255,255,255,.75)">' + esc(lk) + '</a>';
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
    if (state.advisorHidden || state.contactType || state.lightbox >= 0 || state.showCompareModal) return '';
    var panel = state.advisorOpen ?
      '<div class="advisor-panel" role="dialog" aria-label="ปรึกษาซื้อขายที่ดิน">' +
        '<button ' + click(function () { set({ advisorOpen: false }); }) + ' class="advisor-panel-close" aria-label="ปิดหน้าต่างปรึกษา">×</button>' +
        '<div class="advisor-panel-head"><img src="assets/advisor-khunsai.png" alt="คุณทราย"><div><small>ผู้ให้คำปรึกษา</small><strong>คุณทราย · ทรายทองพัฒนา</strong></div></div>' +
        '<h3>ปรึกษาซื้อ–ขายที่ดินฟรี</h3>' +
        '<p>สอบถามข้อมูลแปลง นัดชมที่ดิน หรือฝากขายกับคุณทรายได้โดยตรง</p>' +
        '<div class="advisor-actions">' +
          '<button ' + click(function () { openContact('interest'); }) + ' class="advisor-request">ให้คุณทรายติดต่อกลับ</button>' +
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
    return '<div class="compare-overlay modal-layer" ' + click(function () { set({ showCompareModal: false }); }) + ' style="position:fixed;inset:0;z-index:70;background:rgba(20,31,24,.55);display:flex;align-items:center;justify-content:center;padding:30px">' +
      '<div ' + click(function (e) { e.stopPropagation(); }) + ' class="thin" style="background:#fff;border-radius:20px;max-width:920px;width:100%;max-height:86vh;overflow:auto;padding:28px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px"><h2 style="font-family:\'Noto Serif Thai\',serif;font-size:31.2px;font-weight:600;margin:0;color:#1B2019">เปรียบเทียบที่ดิน</h2><button ' + click(function () { set({ showCompareModal: false }); }) + ' style="width:38px;height:38px;border-radius:10px;background:#F1F0EA;border:none;cursor:pointer;font-size:26px;color:#4A5047">×</button></div>' +
        '<div class="compare-modal-grid" style="display:grid;grid-template-columns:repeat(' + Math.max(1, items.length) + ',1fr);gap:16px">' + cols + '</div>' +
      '</div>' +
    '</div>';
  }

  function contactModal() {
    var ct = state.contactType; if (!ct) return '';
    var a = activeListing();
    var cfg = {
      interest:{ title:'ให้คุณทรายติดต่อกลับ', subtitle:'ฝากข้อมูลไว้ คุณทรายจะติดต่อกลับเพื่อให้รายละเอียดแปลงนี้โดยตรง', cta:'ส่งข้อมูลให้ติดต่อกลับ', notePlaceholder:'เช่น สนใจแบ่งซื้อ ต้องการสอบถามราคา หรือช่วงเวลาที่สะดวกรับสาย', isAppt:false, isDocs:false, isReport:false, doneTitle:'รับข้อมูลเรียบร้อยแล้ว', doneMsg:'ระบบบันทึกคำขอของคุณแล้ว หากต้องการติดต่อเร่งด่วน โทร 097-428-7891' },
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

      var apptDate = c.isAppt ? '<div><label style="display:block;font-size:16.3px;font-weight:600;color:#3B4038;margin-bottom:5px">วันที่สะดวกนัดดู</label><input type="date" min="' + core.todayLocal() + '" data-fk="cDate" value="' + attr(state.cDate) + '" ' + oninput(function (e) { updateContact('cDate', e.target.value); }) + ' style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:10px;padding:11px 13px;font-size:18.2px;outline:none;color:#3B4038"></div>' : '';

      body = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><h2 style="font-family:\'Noto Serif Thai\',serif;font-size:28.6px;font-weight:700;margin:0;color:#1B2019">' + esc(c.title) + '</h2><button ' + click(closeContact) + ' style="width:38px;height:38px;border-radius:10px;background:#F1F0EA;border:none;cursor:pointer;font-size:26px;color:#4A5047">×</button></div>' +
        '<p style="font-size:17.6px;color:#8A8F84;margin:0 0 20px;line-height:1.5">' + esc(c.subtitle) + '</p>' +
        '<div style="display:flex;gap:12px;align-items:center;background:#F7F5F0;border-radius:12px;padding:12px 14px;margin-bottom:20px"><div style="width:40px;height:40px;border-radius:9px;overflow:hidden;background:#E4EAE1;flex:none"><img src="' + attr(galleryImgs(a)[0]) + '" alt="" style="width:100%;height:100%;object-fit:cover"></div><div style="min-width:0"><div style="font-size:17.6px;font-weight:600;color:#1B2019;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(a.title) + '</div><div style="font-size:16.3px;color:#1F4A34;font-weight:600">฿' + fmt(a.price) + ' · ' + esc(a.sizeText) + '</div></div></div>' +
        reasons + docs +
        '<div style="display:flex;flex-direction:column;gap:12px"><div class="contact-primary-fields" style="display:flex;gap:12px"><div style="flex:1"><label style="display:block;font-size:16.3px;font-weight:600;color:#3B4038;margin-bottom:5px">ชื่อของคุณ *</label><input data-fk="cName" maxlength="120" autocomplete="name" value="' + attr(state.cName) + '" ' + oninput(function (e) { updateContact('cName', e.target.value); }) + ' placeholder="ชื่อ-นามสกุล" style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:10px;padding:11px 13px;font-size:18.2px;outline:none"></div><div style="flex:1"><label style="display:block;font-size:16.3px;font-weight:600;color:#3B4038;margin-bottom:5px">เบอร์โทร *</label><input data-fk="cPhone" inputmode="tel" maxlength="40" autocomplete="tel" value="' + attr(state.cPhone) + '" ' + oninput(function (e) { updateContact('cPhone', e.target.value); }) + ' placeholder="08x-xxx-xxxx" style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:10px;padding:11px 13px;font-size:18.2px;outline:none"></div></div>' +
        '<div><label style="display:block;font-size:16.3px;font-weight:600;color:#3B4038;margin-bottom:5px">LINE ID <span style="font-weight:400;color:#8A8F84">(ถ้ามี)</span></label><input data-fk="cLine" maxlength="100" autocomplete="off" value="' + attr(state.cLine) + '" ' + oninput(function (e) { updateContact('cLine', e.target.value); }) + ' placeholder="เช่น saithong123" style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:10px;padding:11px 13px;font-size:18.2px;outline:none"></div>' +
        apptDate +
        '<div><label style="display:block;font-size:16.3px;font-weight:600;color:#3B4038;margin-bottom:5px">ข้อความถึงผู้ขาย</label><textarea data-fk="cNote" maxlength="2000" ' + oninput(function (e) { updateContact('cNote', e.target.value); }) + ' rows="3" placeholder="' + attr(c.notePlaceholder) + '" style="width:100%;box-sizing:border-box;border:1px solid #E0DBD0;border-radius:10px;padding:11px 13px;font-size:18.2px;outline:none;resize:vertical;font-family:inherit">' + esc(state.cNote) + '</textarea></div>' +
        '<div class="contact-honeypot" aria-hidden="true"><label>เว็บไซต์<input tabindex="-1" autocomplete="off" data-fk="cWebsite" value="' + attr(state.cWebsite) + '" ' + oninput(function (e) { updateContact('cWebsite', e.target.value); }) + '></label></div>' +
        '<label class="contact-consent"><input type="checkbox" ' + (state.contactConsent ? 'checked ' : '') + onchange(function (e) { set({ contactConsent:e.target.checked, contactErr:false, contactErrorMessage:'' }); }) + '><span>ยินยอมให้ทรายทองพัฒนาใช้ข้อมูลนี้เพื่อติดต่อกลับเกี่ยวกับที่ดินที่สนใจ</span></label></div>' +
        (state.contactErr ? '<div class="contact-error" role="alert">' + esc(state.contactErrorMessage || 'กรุณาตรวจสอบข้อมูลอีกครั้ง') + '</div>' : '') +
        '<button ' + click(submitContact) + ' class="btn-dark contact-submit" ' + (state.contactSubmitting ? 'disabled' : '') + '>' + (state.contactSubmitting ? 'กำลังส่งข้อมูล…' : esc(c.cta)) + '</button>';
    }

    return '<div class="contact-overlay modal-layer" ' + click(closeContact) + ' style="position:fixed;inset:0;z-index:78;background:rgba(20,31,24,.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow:auto"><div ' + click(function (e) { e.stopPropagation(); }) + ' style="background:#fff;border-radius:20px;max-width:480px;width:100%;padding:28px 30px 30px">' + body + '</div></div>';
  }

  function lightbox() {
    if (state.lightbox < 0) return '';
    var imgs = galleryImgs(activeListing());
    var multi = imgs.length > 1;
    var nav = multi ? '<button ' + click(function (e) { e.stopPropagation(); lbStep(-1); }) + ' aria-label="ก่อนหน้า" style="position:absolute;left:26px;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.14);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"></path></svg></button><button ' + click(function (e) { e.stopPropagation(); lbStep(1); }) + ' aria-label="ถัดไป" style="position:absolute;right:26px;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.14);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"></path></svg></button>' : '';
    return '<div class="lightbox-overlay modal-layer" role="dialog" aria-modal="true" aria-label="รูปภาพที่ดิน" tabindex="-1" ' + click(closeLightbox) + ' style="position:fixed;inset:0;z-index:82;background:rgba(12,20,15,.92);display:flex;align-items:center;justify-content:center;padding:40px">' +
      '<button ' + click(closeLightbox) + ' aria-label="ปิด" style="position:absolute;top:22px;right:26px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.14);border:none;color:#fff;font-size:31.2px;cursor:pointer">×</button>' +
      nav +
      '<img ' + click(function (e) { e.stopPropagation(); }) + ' src="' + attr(imgs[state.lightbox]) + '" alt="" style="max-width:90vw;max-height:84vh;object-fit:contain;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
      '<div style="position:absolute;bottom:26px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.5);color:#fff;font-size:17.6px;font-weight:600;padding:7px 16px;border-radius:20px">' + (state.lightbox + 1) + ' / ' + imgs.length + '</div>' +
    '</div>';
  }

  function switcher() {
    return '';
  }

  function dataNotice() {
    if (state.dataStatus === 'ready') return '';
    if (state.dataStatus === 'loading') return '<div class="data-notice" role="status">กำลังตรวจสอบประกาศล่าสุด…</div>';
    return '<div class="data-notice is-offline" role="status"><span>โหลดข้อมูลล่าสุดไม่ได้ ข้อมูลที่แสดงอาจเปลี่ยนแปลง โปรดโทรยืนยันกับคุณทราย</span><a href="tel:0974287891">097-428-7891</a><button ' + click(loadRemoteListings) + '>ลองอีกครั้ง</button></div>';
  }

  function focusableElements(scope) {
    return Array.from(scope.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')).filter(function(el) {
      return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[inert]');
    });
  }

  function enhanceAccessibility() {
    var main = app.querySelector('main');
    if (main) { main.id = 'main-content'; main.tabIndex = -1; }
    app.querySelectorAll('svg').forEach(function(svg) { svg.setAttribute('aria-hidden','true'); svg.setAttribute('focusable','false'); });
    app.querySelectorAll('button').forEach(function(button) {
      button.type = 'button';
      if (button.textContent.trim() === '×' && !button.getAttribute('aria-label')) button.setAttribute('aria-label','ปิดหน้าต่าง');
    });
    app.querySelectorAll('.search-field').forEach(function(field, index) {
      var select = field.querySelector('select');
      select.setAttribute('aria-label', field.firstElementChild.textContent.trim());
      select.dataset.fk = 'search-' + index;
    });
    app.querySelectorAll('.contact-overlay input[data-fk],.contact-overlay textarea').forEach(function(input) {
      input.id = 'contact-' + input.dataset.fk;
      var label = input.previousElementSibling;
      if (label && label.tagName === 'LABEL') label.htmlFor = input.id;
      if (input.dataset.fk === 'cName') { input.required = true; input.minLength = 2; }
      if (input.dataset.fk === 'cPhone') { input.type = 'tel'; input.required = true; }
      if (input.dataset.fk === 'cDate') input.required = true;
    });
    app.querySelectorAll('.gallery [data-click]').forEach(function(el,index) {
      el.setAttribute('role','button'); el.tabIndex = 0;
      el.setAttribute('aria-label','ดูรูปที่ดิน ' + (index + 1));
    });
    app.querySelectorAll('.gallery img,.land-card img').forEach(function(img) {
      var card = img.closest('.land-card');
      img.alt = card ? card.querySelector('h3').textContent : activeListing().title;
      img.decoding = 'async';
      if (img.closest('.land-card')) img.loading = 'lazy';
    });
    app.querySelectorAll('.land-card').forEach(function(card) {
      var name = card.querySelector('h3').textContent;
      var fav = card.querySelector('button[aria-label="บันทึก"]');
      if (fav) { var listing = state.listings.find(function(l) { return l.title === name; }); fav.setAttribute('aria-pressed', String(!!listing && state.favs.includes(listing.id))); }
    });
    var modal = app.querySelector('.contact-overlay > div,.compare-overlay > div,.lightbox-overlay');
    if (modal) {
      modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.tabIndex = -1;
      var heading = modal.querySelector('h2');
      if (heading) { heading.id = 'dialog-title'; modal.setAttribute('aria-labelledby','dialog-title'); }
      if (state.contactSubmitting) modal.querySelectorAll('input,textarea,button').forEach(function(el) { el.disabled = true; });
      Array.from(app.firstElementChild.children).forEach(function(el) { if (!el.classList.contains('modal-layer')) el.inert = true; });
    }
    document.body.classList.toggle('has-modal', !!modal);
    var keys = {};
    app.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]').forEach(function(el) {
      var group = el.closest('.contact-overlay') ? 'contact' : el.closest('.compare-overlay') ? 'compare' : el.closest('.lightbox-overlay') ? 'lightbox' : 'page';
      keys[group] = (keys[group] || 0) + 1;
      el.dataset.focusKey = group + '-' + keys[group];
    });
    return modal;
  }

  /* ------------------------------------------------------------------ *
   * Render loop
   * ------------------------------------------------------------------ */
  function render() {
    // capture focus before we replace innerHTML
    var act = document.activeElement, fk = null, ss = null, se = null;
    var oldModal = app.querySelector('[aria-modal="true"]');
    var focusKey = act && act.dataset ? act.dataset.focusKey : null;
    if (act && act.dataset && act.dataset.fk) {
      fk = act.dataset.fk;
      try { ss = act.selectionStart; se = act.selectionEnd; } catch (e) {}
    }

    H = [];
    var main;
    if (state.page === 'detail') main = detail();
    else main = home();

    app.innerHTML =
      '<div style="min-height:100vh">' +
        '<a class="skip-link" href="#main-content">ข้ามไปเนื้อหา</a>' + header() + dataNotice() + main + footer() +
        compareBar() + advisorWidget() + compareModal() + contactModal() + lightbox() +
        switcher() +
      '</div>';

    var modal = enhanceAccessibility();
    updateAdvisorVisibility();
    if (modal && !oldModal) modalOpener = focusKey;
    function focusKeyElement(key) {
      var target = Array.from(app.querySelectorAll('[data-focus-key]')).find(function(el) { return el.dataset.focusKey === key; });
      if (target && !target.closest('[inert]')) target.focus({preventScroll:true});
    }
    if (modal && !oldModal) modal.focus({preventScroll:true});
    else if (!modal && oldModal) { focusKeyElement(modalOpener); modalOpener = null; }
    else if (focusKey) focusKeyElement(focusKey);

    // restore focus
    if (fk) {
      var el = app.querySelector('[data-fk="' + (window.CSS && CSS.escape ? CSS.escape(fk) : fk) + '"]');
      if (el && !el.closest('[inert]')) { el.focus({preventScroll:true}); if (ss != null && el.setSelectionRange) { try { el.setSelectionRange(ss, se); } catch (e) {} } }
    }
    document.title = state.page === 'detail' && state.listings.some(function(l) { return l.id === state.activeId; }) ? activeListing().title + ' · ทรายทองพัฒนา' : 'ซื้อขายที่ดินปทุมธานี · ทรายทองพัฒนา';
  }

  /* delegated events */
  function updateAdvisorVisibility() {
    var widget = app.querySelector('.advisor-widget');
    var hero = app.querySelector('.hero-search');
    if (widget) widget.hidden = !!(window.innerWidth <= 620 && hero && hero.getBoundingClientRect().bottom > 0 && !state.advisorOpen);
  }
  window.addEventListener('scroll', updateAdvisorVisibility, {passive:true});
  window.addEventListener('resize', updateAdvisorVisibility);
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
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.gallery [role="button"]')) { e.preventDefault(); e.target.click(); return; }
    if (e.key === 'Enter' && e.target.matches('.contact-overlay input:not([type="checkbox"]):not([type="radio"])')) { e.preventDefault(); submitContact(); return; }
    var t = e.target.closest('[data-keydown]'); if (t) { var f = H[+t.dataset.keydown]; if (f) f(e); }
  });
  // Esc closes any open overlay
  document.addEventListener('keydown', function (e) {
    var modal = app.querySelector('[aria-modal="true"]');
    if (e.key === 'Tab' && modal) {
      var items = focusableElements(modal), first = items[0], last = items[items.length - 1];
      if (!first) { e.preventDefault(); modal.focus(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === modal)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === modal)) { e.preventDefault(); first.focus(); }
    }
    if (state.lightbox >= 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); lbStep(e.key === 'ArrowLeft' ? -1 : 1); return; }
    if (e.key !== 'Escape') return;
    if (state.lightbox >= 0) return closeLightbox();
    if (state.contactType) return closeContact();
    if (state.showCompareModal) return set({ showCompareModal: false });
    if (state.advisorOpen) return set({advisorOpen:false});
  });
  window.addEventListener('popstate', readRoute);
  window.addEventListener('hashchange', function() { if (window.location.hash !== '#main-content') readRoute(); });

  /* boot */
  state.listings = defaults();
  state.reviews = defaultReviews();
  try { var saved = JSON.parse(localStorage.getItem('ttp_favorites_v1') || '[]'); if (Array.isArray(saved)) state.favs = saved.filter(function(id) { return typeof id === 'string'; }); } catch (error) {}
  readRoute();
  loadRemoteListings();
})();
