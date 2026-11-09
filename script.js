// Pelusa – лендинг. Тексты уже в HTML (собирает tools/build.mjs), здесь только поведение.

const pageEl = document.getElementById('page-data');
const PAGE = pageEl ? JSON.parse(pageEl.textContent) : { lang: 'en', mb: 'MB' };
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function detectPlatform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'desktop';
}

const platform = detectPlatform();
document.body.classList.remove('plat-desktop');
document.body.classList.add('plat-' + platform);

// Язык браузера -> один из языков сайта (es-AR -> es-419, если есть, иначе es; pt -> pt-BR, pt-PT и pt-AO -> pt-PT)
function bestLocale(available) {
    const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    for (const p of prefs) {
        const c = String(p).toLowerCase();
        const base = c.split('-')[0];
        const hit = available.find(a => a.toLowerCase() === c);
        if (hit) return hit;
        if (base === 'es' && c !== 'es' && c !== 'es-es' && available.includes('es-419')) return 'es-419';
        if (base === 'pt') { const pt = c === 'pt' ? 'pt-BR' : 'pt-PT'; if (available.includes(pt)) return pt; }
        if (available.includes(base)) return base;
    }
    return null;
}

// --- Метка источника: /?src=yt-ru-01 или /get/?src=... уходит в ссылку стора ---
const SRC = (() => {
    try {
        const s = new URLSearchParams(location.search).get('src');
        return s && /^[\w.-]{1,40}$/.test(s) ? s : null;
    } catch (e) { return null; }
})();

function withSrc(url, store, src) {
    if (!url || !src) return url;
    const sep = url.includes('?') ? '&' : '?';
    if (store === 'android') return url + sep + 'referrer=' + encodeURIComponent('utm_source=' + src);
    if (store === 'ios' && PAGE.iosPt) return url + sep + 'pt=' + encodeURIComponent(PAGE.iosPt) + '&ct=' + encodeURIComponent(src);
    return url;
}

const storeUrl = {};
document.querySelectorAll('[data-store]').forEach(a => {
    storeUrl[a.dataset.store] = a.getAttribute('href');
    a.href = withSrc(storeUrl[a.dataset.store], a.dataset.store, SRC || a.dataset.src);
});

// «Скачать» в шапке: на телефоне сразу в свой стор, если приложение там уже есть
document.querySelectorAll('[data-download]').forEach(a => {
    const url = storeUrl[platform];
    if (url) {
        a.href = withSrc(url, platform, SRC || 'site-header');
        a.target = '_blank';
        a.rel = 'noopener';
    }
});

// --- Выбор языка запоминаем, чтобы английская главная потом сама открывала нужную версию ---
document.querySelectorAll('[data-lang]').forEach(a => {
    a.addEventListener('click', () => {
        try { localStorage.setItem('lang', a.dataset.lang); } catch (e) {}
    });
});
document.querySelectorAll('.lang-menu').forEach(menu => {
    document.addEventListener('click', e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    menu.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); } });
});

// --- На английской главной: подсказка, что сайт есть на языке браузера ---
const offer = document.getElementById('langOffer');
if (offer && PAGE.offers) {
    let saved = null;
    try { saved = localStorage.getItem('lang'); } catch (e) {}
    const code = saved ? null : bestLocale(Object.keys(PAGE.offers));
    if (code) {
        const o = PAGE.offers[code];
        const p = document.createElement('p');
        p.lang = code;
        p.textContent = o.text;
        const go = document.createElement('a');
        go.href = o.url;
        go.lang = code;
        go.textContent = o.go;
        go.addEventListener('click', () => { try { localStorage.setItem('lang', code); } catch (e) {} });
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'lang-offer-close';
        close.setAttribute('aria-label', o.close);
        close.innerHTML = '<svg class="ic" aria-hidden="true"><use href="/images/icons.svg#close"></use></svg>';
        close.addEventListener('click', () => {
            offer.hidden = true;
            try { localStorage.setItem('lang', 'en'); } catch (e) {}
        });
        offer.append(p, go, close);
        offer.hidden = false;
    }
}

// --- /get: текст на языке телефона и, если приложение уже в сторе, сразу переход ---
const getTitle = document.querySelector('[data-get]');
if (getTitle && PAGE.texts) {
    const code = bestLocale(Object.keys(PAGE.texts)) || 'en';
    const tx = PAGE.texts[code];
    document.documentElement.lang = code;
    getTitle.textContent = tx.title;
    const sub = document.getElementById('getSub');
    if (sub) sub.textContent = tx.sub;
    const home = document.getElementById('getHome');
    if (home) { home.textContent = tx.home; home.href = tx.homeUrl; }
    const target = PAGE.stores && PAGE.stores[platform];
    if (PAGE.mode === 'stores' && target) location.replace(withSrc(target, platform, SRC || 'qr'));
    else if (PAGE.mode === 'stores' && platform !== 'desktop') {
        // В сторе этой платформы приложения еще нет: «скоро» вместо кнопок
        getTitle.textContent = platform === 'ios' ? tx.soonIos : tx.soon;
        const stores = document.getElementById('getStores');
        if (stores) stores.hidden = true;
        if (sub) sub.hidden = false;
    }
}

// --- Звук и отдача ---
const audio = {
    ctx: null,
    buffers: {},
    ensure() {
        if (!this.ctx) {
            const A = window.AudioContext || window.webkitAudioContext;
            if (!A) return null;
            this.ctx = new A();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    },
    load(name) {
        if (this.buffers[name]) return this.buffers[name];
        const ctx = this.ensure();
        if (!ctx) return Promise.resolve(null);
        this.buffers[name] = fetch('/sounds/' + name + '.mp3')
            .then(r => r.arrayBuffer())
            .then(b => new Promise((ok, fail) => ctx.decodeAudioData(b, ok, fail)))
            .catch(() => null);
        return this.buffers[name];
    },
    play(name) {
        const ctx = this.ensure();
        if (!ctx) return;
        this.load(name).then(buf => {
            if (!buf) return;
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start();
        });
    }
};

function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}

const VIBES = { jar: [12], box: [25], bin: [18, 40, 12], bag: [30], crate: [10, 30, 10] };
const pad = document.querySelector('.sound-pad');

// Звуки пэда подгружаем заранее, как только пэд почти на экране
if (pad && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
        if (!es.some(e => e.isIntersecting)) return;
        io.disconnect();
        pad.addEventListener('pointerdown', () => Object.keys(VIBES).forEach(n => audio.load(n)), { once: true });
    }, { rootMargin: '200px' });
    io.observe(pad);
}

document.querySelectorAll('[data-sound]').forEach(btn => {
    let timer = null;
    btn.addEventListener('click', () => {
        const kind = btn.dataset.sound;
        audio.play(kind);
        vibrate(VIBES[kind]);
        btn.classList.remove('is-bounce');
        void btn.offsetWidth;
        btn.classList.add('is-bounce');
        clearTimeout(timer);
        timer = setTimeout(() => btn.classList.remove('is-bounce'), 180);
    });
});

// --- V1: живой прототип ролика в телефоне на первом экране ---
let soundOn = false;
const soundToggle = document.getElementById('soundToggle');

if (soundToggle) {
    soundToggle.addEventListener('click', () => {
        soundOn = !soundOn;
        soundToggle.classList.toggle('is-on', soundOn);
        document.getElementById('soundLabel').textContent = soundOn ? PAGE.snd_on : PAGE.snd_off;
        if (soundOn) {
            ['tick', 'tick2', 'tick3', 'jar5'].forEach(n => audio.load(n));
            audio.play('tick');
        }
    });
}

const hero = (() => {
    const feed = document.getElementById('heroFeed');
    // Вместо прототипа на первом экране может стоять ролик V1
    if (!feed || feed.closest('.has-video')) return null;
    const jar = document.getElementById('heroJar');
    const jarCount = document.getElementById('heroJarCount');
    const freed = document.getElementById('heroFreed');
    const num = new Intl.NumberFormat(PAGE.lang);

    // Теплое вперемешку с мусором: чек, дубль, скриншот, размытое, документ
    const BASE = ['p13', 'j02', 'p02', 'p05', 'j06', 'p09', 'j01', 'p11', 'p04', 'p16', 'j05', 'p14', 'j03', 'p10', 'p06', 'p12', 'p03', 'p07'];
    const JUNK = [1, 4, 6, 10, 12];
    const TICKS = ['tick', 'tick2', 'tick3'];
    // Отложено до броска и после: стопка из пяти фото весит около 18 МБ, как на постере шага 2
    const BEFORE = 312, AFTER = 330;
    const PHASES = 16, RESULT_FROM = 7;
    const cw = (300 - 16 - 12) / 3, jx = 75, jy = 549;

    const tiles = BASE.map((name, i) => {
        const el = document.createElement('div');
        el.className = 'tile-ph';
        const img = document.createElement('img');
        img.src = '/images/photos/' + name + '.webp';
        img.alt = '';
        el.appendChild(img);
        el.insertAdjacentHTML('beforeend', '<svg class="ic tick" aria-hidden="true"><use href="/images/icons.svg#check"></use></svg>');
        feed.appendChild(el);
        const col = i % 3, row = Math.floor(i / 3);
        return { el, junk: JUNK.indexOf(i), dx: jx - (8 + col * (cw + 6) + cw / 2), dy: jy - (34 + row * 106 + 50) };
    });

    let phase = reduceMotion ? 9 : 0;
    let iv = null;
    let loops = 0;

    function render() {
        const selN = phase >= 1 && phase <= 5 ? phase : phase === 6 ? 5 : 0;
        const flying = phase === 6, removed = phase >= RESULT_FROM;
        tiles.forEach(tl => {
            const junk = tl.junk >= 0;
            tl.el.hidden = removed && junk;
            tl.el.classList.toggle('is-back', phase === 0 && junk);
            tl.el.classList.toggle('is-sel', junk && tl.junk < selN);
            const fly = flying && junk;
            tl.el.classList.toggle('is-fly', fly);
            tl.el.style.transform = fly ? 'translate(' + tl.dx.toFixed(0) + 'px,' + tl.dy.toFixed(0) + 'px) scale(0.18) rotate(' + (8 - tl.junk * 4) + 'deg)' : '';
        });
        jar.classList.toggle('is-gulp', phase === RESULT_FROM);
        jar.classList.toggle('is-wobble', phase === RESULT_FROM + 1);
        jarCount.hidden = !removed;
        freed.textContent = num.format(removed ? AFTER : BEFORE) + ' ' + PAGE.mb;
    }

    function step() {
        phase = (phase + 1) % PHASES;
        if (phase === 0 && ++loops >= 3) { stop(); phase = 9; render(); return; }
        render();
        if (!soundOn) return;
        if (phase >= 1 && phase <= 5) audio.play(TICKS[phase % 3]);
        if (phase === RESULT_FROM) { audio.play('jar5'); vibrate([12]); }
    }

    // После трех циклов анимация останавливается на чистой ленте (WCAG 2.2.2)
    const start = () => { if (!iv && loops < 3) iv = setInterval(step, 650); };
    const stop = () => { clearInterval(iv); iv = null; };
    if (!reduceMotion) {
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(es => es.forEach(e => (e.isIntersecting ? start() : stop()))).observe(document.getElementById('heroPhone'));
        } else start();
    }
    render();
    return { render };
})();

// --- Ролики V1–V7: версия под платформу (на компьютере – Android, если ее нет – iOS).
// Файлы подключаем, только когда блок рядом, и не раньше, чем догрузилась сама страница: до этого виден постер ---
const videos = Array.from(document.querySelectorAll('video[data-media]')).filter(v => v.dataset.sources);
videos.forEach(v => {
    const all = JSON.parse(v.dataset.sources);
    v._media = all[platform] || all.android || all.ios;
    // Постер первого экрана уже в HTML (тут меняем его под платформу); без IntersectionObserver ставим постеры всем сразу
    if (v._media.poster && (v.hasAttribute('poster') || !('IntersectionObserver' in window))) v.poster = v._media.poster;
});
const attach = v => {
    if (v._attached) return;
    v._attached = true;
    ['webm', 'mp4'].forEach(type => {
        if (!v._media[type]) return;
        const s = document.createElement('source');
        s.src = v._media[type];
        s.type = 'video/' + type;
        v.appendChild(s);
    });
    v.preload = 'auto';
    v.load();
    if (v._visible && !reduceMotion) v.play().catch(() => {});
};
const pageReady = new Promise(r => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })));
if ('IntersectionObserver' in window && videos.length) {
    pageReady.then(() => {
        const near = new IntersectionObserver(es => es.forEach(e => {
            if (!e.isIntersecting) return;
            near.unobserve(e.target);
            attach(e.target);
        }), { rootMargin: '300px 0px' });
        const soon = new IntersectionObserver(es => es.forEach(e => {
            if (!e.isIntersecting) return;
            soon.unobserve(e.target);
            if (e.target._media.poster) e.target.poster = e.target._media.poster;
        }), { rootMargin: '900px 0px' });
        videos.forEach(v => soon.observe(v));
        videos.forEach(v => near.observe(v));
    });
    const io = new IntersectionObserver(es => es.forEach(e => {
        const v = e.target;
        v._visible = e.isIntersecting;
        if (!v._attached || reduceMotion) return;
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
    }), { threshold: 0.35 });
    videos.forEach(v => io.observe(v));
}

// --- FAQ: открыт один ответ за раз ---
document.querySelectorAll('.faq details').forEach(d => {
    d.addEventListener('toggle', () => {
        if (!d.open) return;
        document.querySelectorAll('.faq details[open]').forEach(o => { if (o !== d) o.open = false; });
    });
});
