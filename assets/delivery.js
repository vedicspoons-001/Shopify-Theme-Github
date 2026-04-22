.vs-delivery-widget { display: none; }



(function () {
  'use strict';

  const CONFIG = {
    cutoffHour: 12,
    timezone: 'Asia/Kolkata',
    defaultPreparationDays: 1,
  };

  const NEIGHBOURING_STATES = [
    'gujarat', 'madhya pradesh', 'chhattisgarh',
    'telangana', 'karnataka', 'goa'
  ];

  const NORTH_EAST_STATES = [
    'jammu and kashmir', 'jammu & kashmir', 'ladakh',
    'arunachal pradesh', 'assam', 'manipur', 'meghalaya',
    'mizoram', 'nagaland', 'sikkim', 'tripura'
  ];

  const METRO_CITIES = [
    'delhi', 'new delhi', 'bengaluru', 'bangalore', 'hyderabad',
    'chennai', 'kolkata', 'ahmedabad', 'surat', 'jaipur',
    'lucknow', 'kanpur', 'nagpur', 'indore', 'bhopal',
    'visakhapatnam', 'patna', 'vadodara', 'ludhiana',
    'coimbatore', 'kochi', 'thiruvananthapuram', 'bhubaneswar',
    'guwahati', 'chandigarh', 'amritsar', 'agra', 'varanasi',
    'rajkot', 'meerut', 'faridabad', 'ghaziabad', 'noida',
    'gurugram', 'gurgaon', 'raipur', 'jodhpur', 'madurai',
    'ranchi', 'jabalpur', 'gwalior', 'vijayawada', 'mysuru',
    'mysore', 'hubli', 'tiruchirappalli', 'bareilly', 'aligarh',
    'moradabad', 'aurangabad', 'nashik'
  ];

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  function nowIST() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: CONFIG.timezone }));
  }

  function isPastCutoff() {
    return nowIST().getHours() >= CONFIG.cutoffHour;
  }

  function addCalendarDays(date, days) {
    let d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  function toTitleCase(str) {
    return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  }

  function countdownToMidnight() {
    const now = nowIST();
    const cutoff = new Date(now);
    cutoff.setHours(CONFIG.cutoffHour, 0, 0, 0);
    if (now >= cutoff) return null;
    const diff = cutoff - now;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { h, m, s };
  }

  // ─── ZONE DETECTION ────────────────────────────────────────────────────────

  async function getZoneFromPincode(pincode) {
    const code = parseInt(pincode);
    const isMumbaiRange = (code >= 400001 && code <= 400104);

    try {
      const res  = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
      const data = await res.json();

      if (!data || data[0].Status !== 'Success' || !data[0].PostOffice || !data[0].PostOffice.length) {
        if (isMumbaiRange) return { zone: 'mumbai', city: 'Mumbai', state: 'Maharashtra', area: '', isMetro: true };
        return { zone: 'india', city: '', state: '', area: '', isMetro: false };
      }

      const post     = data[0].PostOffice[0];
      const area     = (post.Name     || '').trim();
      const city     = (post.District || '').trim();
      const state    = (post.State    || '').trim();
      const cityLow  = city.toLowerCase();
      const stateLow = state.toLowerCase();

      console.log('API → Name:', area, '| District:', city, '| State:', state);

      if (isMumbaiRange) return { zone: 'mumbai', city, state, area, isMetro: true };
      if (stateLow === 'maharashtra') return { zone: 'maharashtra', city, state, area, isMetro: false };

      const isNeighbouring = NEIGHBOURING_STATES.some(s => stateLow === s || stateLow.includes(s));
      if (isNeighbouring) return { zone: 'neighbouring', city, state, area, isMetro: false };

      const isNorthEast = NORTH_EAST_STATES.some(s => stateLow === s || stateLow.includes(s));
      if (isNorthEast) return { zone: 'northeast', city, state, area, isMetro: false };

      const isMetro = METRO_CITIES.some(m => cityLow === m || cityLow.includes(m));
      return { zone: 'india', city, state, area, isMetro };

    } catch (e) {
      if (isMumbaiRange) return { zone: 'mumbai', city: 'Mumbai', state: 'Maharashtra', area: '', isMetro: true };
      return { zone: 'india', city: '', state: '', area: '', isMetro: false };
    }
  }

  // ─── RATES ─────────────────────────────────────────────────────────────────

  function getRatesForZone(pincode, zoneData) {
    const { zone, isMetro } = zoneData;

    if (zone === 'mumbai') return {
      rates: [
        { name: 'Standard Delivery', delivery_days_min: 4, delivery_days_max: 4, _type: 'normal' },
        { name: 'Express Delivery',  delivery_days_min: 1, delivery_days_max: 1, _type: 'express', _zone: 'mumbai' }
      ], note: null
    };

    if (zone === 'maharashtra') return {
      rates: [
        { name: 'Standard Delivery', delivery_days_min: 4, delivery_days_max: 5, _type: 'normal' },
        { name: 'Express Delivery',  delivery_days_min: 1, delivery_days_max: 1, _type: 'express' }
      ], note: null
    };

    if (zone === 'neighbouring') return {
      rates: [
        { name: 'Standard Delivery', delivery_days_min: 4, delivery_days_max: 5, _type: 'normal' },
        { name: 'Express Delivery',  delivery_days_min: 2, delivery_days_max: 2, _type: 'express' }
      ], note: null
    };

    if (zone === 'northeast') return {
      rates: [
        { name: 'Standard Delivery', delivery_days_min: 8,  delivery_days_max: 10, _type: 'normal' },
        { name: 'Express Delivery',  delivery_days_min: 2,  delivery_days_max: 4,  _type: 'express' }
      ], note: null
    };

    // Rest of India — note shows for BOTH metro and non-metro
    const expressMin = isMetro ? 2 : 4;
    return {
      rates: [
        { name: 'Standard Delivery', delivery_days_min: 6, delivery_days_max: 8, _type: 'normal' },
        { name: 'Express Delivery',  delivery_days_min: expressMin, delivery_days_max: expressMin, _type: 'express' }
      ],
      note: isMetro
        ? '⚡ Metropolitan city — Express Delivery in 2 Days'
        : '📦 Non-metropolitan city — Express Delivery in 4 Days'
    };
  }

  // ─── CLASSIFY ──────────────────────────────────────────────────────────────

  function classifyRate(rate) {
    if (rate._type) return rate._type;
    const name = (rate.name || '').toLowerCase();
    if (name.includes('express')) return 'express';
    if (name.includes('pickup') || name.includes('store')) return 'pickup';
    if (name.includes('international')) return 'international';
    return 'normal';
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────

  function renderRates(rates, note) {
    const now  = nowIST();
    const past = isPastCutoff();
    const baseOffset = past ? 1 : 0;

    rates.forEach(rate => {
      const type    = classifyRate(rate);
      const minDays = rate.delivery_days_min !== undefined ? rate.delivery_days_min : 1;
      const maxDays = rate.delivery_days_max !== undefined ? rate.delivery_days_max : minDays;
      const isMumbaiExpress = (rate._zone === 'mumbai' && type === 'express');
      let label;

      if (type === 'express') {
        if (isMumbaiExpress) {
          label = past ? 'Tomorrow (within 24 hrs)' : 'Today (within 12 hrs)';
        } else {
          const fromDate = addCalendarDays(now, baseOffset + minDays);
          const toDate   = addCalendarDays(now, baseOffset + maxDays);
          label = minDays === maxDays ? formatDate(fromDate) : `${formatDate(fromDate)} – ${formatDate(toDate)}`;
        }
        document.querySelectorAll('.vs-express-date, .vs-cart-express-date').forEach(el => el.textContent = label);
        document.querySelectorAll('.vs-cart-express-price, .vs-shipping-option.vs-express .vs-option-price').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.vs-shipping-option.vs-express').forEach(el => el.style.display = '');

      } else if (type === 'international') {
        const fromDate = addCalendarDays(now, baseOffset + minDays);
        const toDate   = addCalendarDays(now, baseOffset + maxDays);
        label = minDays === maxDays ? formatDate(fromDate) : `${formatDate(fromDate)} – ${formatDate(toDate)}`;
        document.querySelectorAll('.vs-cart-intl').forEach(el => el.style.display = '');
        document.querySelectorAll('.vs-cart-intl-date').forEach(el => el.textContent = label);

      } else {
        // Standard — calendar days, no prep
        const fromDate = addCalendarDays(now, baseOffset + minDays);
        const toDate   = addCalendarDays(now, baseOffset + maxDays);
        label = minDays === maxDays ? formatDate(fromDate) : `${formatDate(fromDate)} – ${formatDate(toDate)}`;
        document.querySelectorAll('.vs-normal-date, .vs-cart-normal-date').forEach(el => el.textContent = label);
        document.querySelectorAll('.vs-cart-normal-price, .vs-shipping-option.vs-normal .vs-option-price').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.vs-shipping-option.vs-normal').forEach(el => el.style.display = '');
      }
    });

    document.querySelectorAll('.vs-delivery-note').forEach(el => {
      if (note) { el.textContent = note; el.style.display = ''; }
      else { el.style.display = 'none'; }
    });
  }

  // ─── PINCODE HANDLER ───────────────────────────────────────────────────────

  function setupPincodeHandler(inputSel, btnSel, msgSel) {
    const input = document.querySelector(inputSel);
    const btn   = document.querySelector(btnSel);
    const msg   = document.querySelector(msgSel);
    if (!input || !btn || !msg) return;

    const saved = sessionStorage.getItem('vs_pincode');
    if (saved) input.value = saved;

    btn.addEventListener('click', () => triggerCheck(input.value.trim()));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') triggerCheck(input.value.trim());
    });

    async function triggerCheck(val) {
      if (!val) return;

      // Validate: exactly 6 digits
      if (!/^\d{6}$/.test(val)) {
        msg.textContent = '✗ Invalid Pincode — Please enter a valid 6-digit pincode';
        msg.className = 'vs-pincode-msg vs-error';
        document.querySelectorAll('.vs-shipping-option').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.vs-delivery-note').forEach(el => el.style.display = 'none');
        return;
      }

      msg.textContent = 'Checking...';
      msg.className = 'vs-pincode-msg';

      const zoneData = await getZoneFromPincode(val);
      const { rates, note } = getRatesForZone(val, zoneData);

      // Show area + city e.g. "✓ Santacruz, Mumbai"
      let locationText = '✓ Delivery available';
      if (zoneData.area && zoneData.city) {
        locationText = `✓ ${toTitleCase(zoneData.area)}, ${toTitleCase(zoneData.city)}`;
      } else if (zoneData.city) {
        locationText = `✓ ${toTitleCase(zoneData.city)}`;
      }
      msg.textContent = locationText;
      msg.className = 'vs-pincode-msg vs-success';

      sessionStorage.setItem('vs_pincode', val);

      fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributes: { 'Delivery Pincode': val } })
      });

      renderRates(rates, note);
    }
  }

  // ─── COUNTDOWN ─────────────────────────────────────────────────────────────

  function startCountdown(timeSel, wrapSel) {
    const wrap = document.querySelector(wrapSel);
    const el   = document.querySelector(timeSel);
    if (!wrap || !el) return;
    function tick() {
      const t = countdownToMidnight();
      if (!t) { wrap.style.display = 'none'; return; }
      el.textContent = `${String(t.h).padStart(2,'0')}:${String(t.m).padStart(2,'0')}:${String(t.s).padStart(2,'0')}`;
    }
    tick();
    setInterval(tick, 1000);
  }


// ─── GEOLOCATION ───────────────────────────────────────────────────────────

async function detectAndFillPincode(inputSel, btnSel) {
  const input = document.querySelector(inputSel);
  if (!input) return;

  const saved = sessionStorage.getItem('vs_pincode');
  if (saved) return;

  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      try {
        const res  = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        const pincode = (data.address?.postcode || '').replace(/\s/g, '');
        if (pincode && /^\d{6}$/.test(pincode)) {
          input.value = pincode;
          document.querySelector(btnSel)?.click();
        }
      } catch (e) {
        console.log('Geocode failed:', e);
      }
    },
    (err) => console.log('Location denied:', err.message),
    { timeout: 8000, maximumAge: 300000 }
  );
}






  // ─── INIT ──────────────────────────────────────────────────────────────────

  function initProductWidget() {
  const widget = document.getElementById('vs-delivery-widget');
  if (!widget) return;
  startCountdown('.vs-countdown-time', '.vs-countdown');
  setupPincodeHandler('.vs-pincode-input', '.vs-pincode-btn', '.vs-pincode-msg');
  detectAndFillPincode('.vs-pincode-input', '.vs-pincode-btn');
}

  function initCartWidget() {
    const widget = document.getElementById('vs-cart-delivery');
    if (!widget) return;
    startCountdown('.vs-cart-countdown-time', '.vs-cart-countdown');
    setupPincodeHandler('.vs-cart-pincode-input', '.vs-cart-pincode-btn', '.vs-cart-pincode-msg');

    const datePicker = widget.querySelector('.vs-date-picker');
    if (datePicker) {
      const tomorrow = new Date(nowIST());
      tomorrow.setDate(tomorrow.getDate() + 1);
      datePicker.min = tomorrow.toISOString().split('T')[0];
      datePicker.addEventListener('change', function () {
        fetch('/cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attributes: { 'Requested Delivery Date': this.value } })
        });
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initProductWidget();
    initCartWidget();
  });

})();

