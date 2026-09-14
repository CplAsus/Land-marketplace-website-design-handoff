/* Shared, dependency-free validation for the public site and admin editor. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function googleMapUrl(value) {
    var input = String(value || '').trim();
    if (!input || /\s/.test(input)) return '';
    try {
      var url = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return '';
      var host = url.hostname.toLowerCase();
      var google = /^(?:(?:www|maps)\.)?google\.(?:com|co\.th)$/.test(host);
      var mapsPath = /^\/maps(?:\/|$)/.test(url.pathname);
      var searchPath = url.pathname === '/' && (url.searchParams.has('q') || url.searchParams.has('ll'));
      if ((google && (mapsPath || searchPath)) || host === 'maps.app.goo.gl' || (host === 'goo.gl' && mapsPath)) {
        url.protocol = 'https:';
        return url.href;
      }
    } catch (error) {}
    return '';
  }

  function coordinates(value) {
    var match = String(value || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;
    var lat = Number(match[1]), lng = Number(match[2]);
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? {lat:lat, lng:lng} : null;
  }

  function coordinatesFromMapUrl(value) {
    var safe = googleMapUrl(value);
    if (!safe) return '';
    var url = new URL(safe);
    var point = coordinates(url.searchParams.get('query') || url.searchParams.get('q') || url.searchParams.get('ll'));
    if (!point) {
      var path = decodeURIComponent(url.pathname);
      var match = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      if (match) point = coordinates(match[1] + ',' + match[2]);
    }
    return point ? point.lat + ', ' + point.lng : '';
  }

  function landSizeParts(listing) {
    // rai is authoritative; size_text can include a parenthesized total in square wah.
    var raiValue = Number(listing && listing.rai);
    var totalWa = Number.isFinite(raiValue) && raiValue > 0 ? Math.round(raiValue * 400 * 10000) / 10000 : 0;
    if (!totalWa) {
      var text = String((listing && listing.size_text) || '');
      var total = text.match(/\(([\d,.]+)\s*(?:ตารางวา|ตร\.?\s*ว\.?)\)/);
      if (total) totalWa = Number(total[1].replace(/,/g, ''));
      else {
        var rai = text.match(/([\d.]+)\s*ไร่/), ngan = text.match(/([\d.]+)\s*งาน/), wa = text.match(/([\d.]+)\s*(?:ตารางวา|ตร\.?\s*ว\.?)/);
        totalWa = Number(rai && rai[1]) * 400 + Number(ngan && ngan[1]) * 100 + Number(wa && wa[1]);
      }
    }
    var wholeRai = Math.floor(totalWa / 400), remain = totalWa - wholeRai * 400;
    var wholeNgan = Math.floor(remain / 100);
    return {rai:wholeRai, ngan:wholeNgan, wa:String(Number((remain - wholeNgan * 100).toFixed(4)))};
  }

  function todayLocal() {
    var date = new Date();
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function contactError(data) {
    if (String(data.cName || '').trim().length < 2) return 'กรุณากรอกชื่ออย่างน้อย 2 ตัวอักษร';
    var phone = String(data.cPhone || '').trim(), digits = phone.replace(/\D/g, '');
    if (!/^\+?[\d\s().-]+$/.test(phone) || digits.length < 9 || digits.length > 15) return 'กรุณากรอกเบอร์โทรที่ติดต่อได้ 9–15 หลัก';
    if (data.contactType === 'appt' && (!/^\d{4}-\d{2}-\d{2}$/.test(data.cDate || '') || data.cDate < todayLocal())) return 'กรุณาเลือกวันนัดดูตั้งแต่วันนี้เป็นต้นไป';
    if (data.contactType === 'docs' && !(data.docSel || []).length && !String(data.cNote || '').trim()) return 'กรุณาเลือกเอกสารที่ต้องการ หรือระบุในข้อความ';
    if (data.contactType === 'report' && !data.reportReason) return 'กรุณาเลือกเหตุผลที่แจ้งปัญหา';
    if (!data.contactConsent) return 'กรุณายินยอมให้ทีมงานติดต่อกลับ';
    return '';
  }

  async function fetchWithTimeout(url, options, timeout) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeout || 12000);
    try { return await fetch(url, Object.assign({}, options, {signal:controller.signal})); }
    finally { clearTimeout(timer); }
  }

  return {googleMapUrl:googleMapUrl, coordinates:coordinates, coordinatesFromMapUrl:coordinatesFromMapUrl,
    landSizeParts:landSizeParts, todayLocal:todayLocal, contactError:contactError, fetchWithTimeout:fetchWithTimeout};
});
