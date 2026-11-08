// Сборка сайта: шаблоны из src/pages + словари из src/i18n -> готовые HTML по языкам.
// Запуск из корня: node tools/build.mjs. Зависимостей нет, результат – обычные файлы в корне.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));
const cfg = JSON.parse(read('src/config.json'));
const LOCALES = cfg.locales;
const EN = LOCALES[0];

// --- Словари ---
// Неразрывный пробел между числом и словом («30 дней», «iOS 26+»): строка не разорвется посередине
const nbspNumbers = s => s.replace(/(\d) (?=\p{L})/gu, '$1\u00a0').replace(/\b(iOS|Android) (\d)/g, '$1\u00a0$2');
// Перед тире – тоже неразрывный, чтобы строка не начиналась с «–»
const tidy = s => nbspNumbers(s.replace(/ – /g, '\u00a0– '));

// Региональный вариант (es-419, fr-CA) задает _base и переопределяет только отличия
const BASE = {};
function loadDict(code) {
    const raw = JSON.parse(read(`src/i18n/${code}.json`));
    if (raw._base) BASE[code] = raw._base;
    const base = raw._base ? loadDict(raw._base) : {};
    const out = { ...base };
    for (const [k, v] of Object.entries(raw)) if (k !== '_base') out[k] = tidy(v);
    return out;
}
const DICT = Object.fromEntries(LOCALES.map(l => [l.code, loadDict(l.code)]));
// Код локали и ее базы по цепочке: es-419 -> es
const chain = code => code ? [code, ...chain(BASE[code])] : [];
const missing = {};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Страницы ---
const PAGES = {
    home: { tpl: 'home', dir: '', title: 'title_home', desc: 'desc_home' },
    contact: { tpl: 'contact', dir: 'contact/', title: 'title_contact', desc: 'desc_contact' },
    privacy: { tpl: 'legal', dir: 'privacy/', title: 'title_privacy', desc: 'desc_privacy', doc: 'privacy_policy' },
    'app-privacy': { tpl: 'legal', dir: 'app-privacy/', title: 'title_app_privacy', desc: 'desc_app_privacy', doc: 'app_privacy' },
    terms: { tpl: 'legal', dir: 'terms/', title: 'title_terms', desc: 'desc_terms', doc: 'terms' }
};

// Юридический текст есть не на всех языках: берем текст базы (es-419 -> es), а если нет и его – ссылки ведут на английский
const legalFile = (loc, id) => chain(loc.code).map(c => `src/legal/${id}.${c}.html`).find(exists);
const hasPage = (loc, id) => !PAGES[id].doc || !!legalFile(loc, id);
const urlOf = (loc, id) => (hasPage(loc, id) ? loc.path : EN.path) + PAGES[id].dir;
const abs = u => cfg.site + u;

function ico(name, cls) {
    return `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="/images/icons.svg#${name}"></use></svg>`;
}

function fmtNumber(loc, n) {
    return new Intl.NumberFormat(loc.code, { maximumFractionDigits: 1 }).format(n);
}

function langMenu(loc, id, extra) {
    const items = LOCALES.map(l => {
        const href = id && hasPage(l, id) ? urlOf(l, id) : l.path;
        const cur = l.code === loc.code ? ' aria-current="page"' : '';
        return `<li><a href="${href}" hreflang="${l.hreflang}" lang="${l.hreflang}" data-lang="${l.code}"${cur}>${esc(l.name)}</a></li>`;
    }).join('');
    const t = DICT[loc.code];
    return `            <details class="lang-menu${extra || ''}">
                <summary aria-label="${esc(t.lang_label)}: ${esc(loc.name)}">${ico('language')}<span>${loc.short || loc.code.toUpperCase()}</span>${ico('expand_more', 'ic-caret')}</summary>
                <ul>${items}</ul>
            </details>`;
}

function storeLinks(loc, place) {
    const t = DICT[loc.code];
    const { ios, android } = cfg.stores;
    const src = 'site-' + place;
    // Пока ссылки на стор нет, значок ведет на /get/ – там «Скоро в App Store и Google Play» на языке телефона
    const attrs = (store, url) => url
        ? ` data-store="${store}" data-src="${src}" href="${esc(url)}" target="_blank" rel="noopener"`
        : ' href="/get/"';
    // В японском название стора стоит перед глаголом: «App Store からダウンロード»
    const text = (small, name) => t.badge_name_first === 'true'
        ? `<b>${name}</b><small>${esc(small)}</small>`
        : `<small>${esc(small)}</small><b>${name}</b>`;
    const badges = [
        `<a class="badge badge-ios"${attrs('ios', ios)}>${ico('apple', 'ico')}<span class="badge-text">${text(t.ios_small, 'App Store')}</span></a>`,
        `<a class="badge badge-gp"${attrs('android', android)}>${ico('google-play', 'ico')}<span class="badge-text">${text(t.gp_small, 'Google Play')}</span></a>`
    ];
    let qr = '';
    if (place !== 'get') qr = `<div class="qr"><img src="/images/qr-get.svg" alt="${esc(t.qr_alt)}" width="50" height="50"${place === 'final' ? ' loading="lazy"' : ''}><span>${esc(t.qr)}</span></div>`;
    let tm = '';
    if (place !== 'hero') {
        tm = '<div class="trademarks">'
            + '<span class="only-not-ios">Google Play and the Google Play logo are trademarks of Google LLC.</span>'
            + '<span class="only-not-android">Apple, the Apple logo and App Store are trademarks of Apple Inc.</span>'
            + '</div>';
    }
    return badges.join('\n') + qr + tm;
}

function storesBlock(loc, place) {
    const cls = place === 'hero' ? 'stores' : 'stores stores-final';
    const id = place === 'hero' ? ' id="get"' : '';
    return `                    <div class="${cls}"${id}>\n${storeLinks(loc, place)}\n                    </div>`;
}

function faq(loc) {
    const t = DICT[loc.code];
    const qa = [['q0', ['a0']], ['q1', ['a1']], ['q2', ['a2']], ['q3', ['a3_1', 'a3_2']], ['q4', ['a4']], ['q5', ['a5']], ['q6', ['a6']], ['q7', ['a7']]];
    return qa.map(([q, as], i) => `                    <details${i === 0 ? ' open' : ''}>
                        <summary><span>${esc(t[q])}</span>${ico('add', 'ic-plus')}${ico('remove', 'ic-minus')}</summary>
${as.map(a => `                        <p>${esc(t[a])}</p>`).join('\n')}
                    </details>`).join('\n');
}

// Только значки: названия сетей видны лишь в подсказке и для скринридера
function socials(cls = '', indent = '                    ') {
    const links = Object.entries(cfg.social).filter(([, u]) => u);
    if (!links.length) return '';
    const label = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };
    return indent + `<div class="socials${cls}">` + links.map(([k, u]) =>
        `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${label[k]}" title="${label[k]}">${ico(k, 'ico')}</a>`).join('') + '</div>';
}

// hreflang="es-419" Google не понимает (регион – только код страны), поэтому у локали может быть список hreflangAlso
const hreflangs = l => [l.hreflang, ...(l.hreflangAlso || [])];

function alternates(id, loc) {
    const lines = [`    <link rel="canonical" href="${abs(urlOf(loc, id))}">`];
    for (const l of LOCALES) if (hasPage(l, id)) for (const h of hreflangs(l)) lines.push(`    <link rel="alternate" hreflang="${h}" href="${abs(urlOf(l, id))}">`);
    lines.push(`    <link rel="alternate" hreflang="x-default" href="${abs(urlOf(EN, id))}">`);
    return lines.join('\n');
}

function og(id, loc, title, desc) {
    const img = [...chain(loc.code), 'en'].map(c => `og-${c}.jpg`).find(f => exists(`images/og/${f}`));
    const alt = LOCALES.filter(l => l !== loc && hasPage(l, id)).map(l => `    <meta property="og:locale:alternate" content="${l.og}">`);
    return [
        '    <meta property="og:type" content="website">',
        '    <meta property="og:site_name" content="Pelusa">',
        `    <meta property="og:url" content="${abs(urlOf(loc, id))}">`,
        `    <meta property="og:title" content="${title}">`,
        `    <meta property="og:description" content="${desc}">`,
        `    <meta property="og:image" content="${cfg.site}/images/og/${img}">`,
        '    <meta property="og:image:width" content="1200">',
        '    <meta property="og:image:height" content="630">',
        `    <meta property="og:locale" content="${loc.og}">`,
        ...alt,
        '    <meta name="twitter:card" content="summary_large_image">'
    ].join('\n');
}

function pageData(obj) {
    // Данные для script.js: не исполняется, поэтому CSP не мешает
    return `    <script type="application/json" id="page-data">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

function runtime(loc) {
    const t = DICT[loc.code];
    return { lang: loc.code, mb: t.mb, snd_on: t.snd_on, snd_off: t.snd_off, home: loc.path, iosPt: cfg.stores.iosProviderToken };
}

function legalDoc(loc, id) {
    let html = read(legalFile(loc, id));
    // Ссылки между документами – на версию того же языка
    html = html.replace(/href="\/(privacy|app-privacy|terms|contact)\/"/g, (m, p) => `href="${urlOf(loc, p)}"`);
    // Неразрывные пробелы – только в тексте, не внутри тегов
    html = html.split(/(<[^>]*>)/).map(part => (part.startsWith('<') ? part : nbspNumbers(part))).join('');
    return html.trim().split('\n').map(l => (l ? '            ' + l : l)).join('\n');
}

// --- Ролики: media/<слот>-<ios|android>-<язык>.{mp4,webm,webp}. Нет своего языка – берем базу (es-419 -> es), потом английский ---
function mediaAttr(slot, loc) {
    const out = {};
    for (const plat of ['ios', 'android']) {
        for (const code of [...chain(loc.code), 'en']) {
            const base = `media/${slot}-${plat}-${code}`;
            if (!exists(base + '.mp4')) continue;
            out[plat] = { mp4: '/' + base + '.mp4' };
            if (exists(base + '.webm')) out[plat].webm = '/' + base + '.webm';
            if (exists(base + '.webp')) out[plat].poster = '/' + base + '.webp';
            break;
        }
    }
    if (!Object.keys(out).length) return '';
    // Постер первого экрана сразу в HTML, чтобы телефон не стоял пустым до скрипта; остальные ставит скрипт, когда блок рядом
    const poster = slot === 'v1' && (out.android || out.ios).poster;
    return (poster ? ` poster="${poster}"` : '') + ` data-sources='${JSON.stringify(out)}'`;
}

// --- Шаблонизатор: {{>partial}}, {{{raw}}}, {{text}} ---
function render(tplName, ctx) {
    let html = read(`src/pages/${tplName}.html`);
    html = html.replace(/\{\{>(\w+)\}\}/g, (m, p) => read(`src/partials/${p}.html`).replace(/\n$/, ''));
    html = html.replace(/\{\{\{([^}]+)\}\}\}|\{\{(\w+)\}\}/g, (m, raw, key) => {
        if (key) {
            const t = DICT[ctx.loc.code];
            if (!(key in t)) (missing[ctx.loc.code] ||= new Set()).add(key);
            const v = key in t ? t[key] : DICT.en[key];
            if (v == null) throw new Error(`Нет ключа ${key}`);
            return esc(v);
        }
        const [name, ...args] = raw.split(':');
        if (name === 'ico') return ico(args[0], args[1]);
        if (name === 'url') return urlOf(ctx.loc, args[0]);
        if (name === 'stores') return ctx.storesBlock ? ctx.storesBlock(args[0]) : storesBlock(ctx.loc, args[0]);
        if (name === 'poster') {
            const f = chain(ctx.loc.code).map(c => `images/posters/${args[0]}-${c}.webp`).find(exists);
            return '/' + (f || `images/posters/${args[0]}.webp`);
        }
        if (name === 'media') return mediaAttr(args[0], ctx.loc);
        if (!(name in ctx.vars)) throw new Error(`Нет переменной ${name} в ${tplName}`);
        return ctx.vars[name];
    });
    // Комментарии с планами в публикуемый HTML не попадают
    html = html.replace(/[ \t]*<!--[\s\S]*?-->\n?/g, '').replace(/\n{3,}/g, '\n\n');
    return html;
}

function write(rel, html) {
    const file = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
}

function commonVars(loc, id, extra) {
    const t = DICT[loc.code];
    const p = PAGES[id];
    const title = esc(t[p.title]);
    const desc = esc(t[p.desc]);
    const isHome = id === 'home';
    return {
        lang: loc.hreflang,
        title,
        description: desc,
        robots: 'index, follow',
        alternates: alternates(id, loc),
        og: og(id, loc, title, isHome ? esc(t.og_desc) : desc),
        script_subset: loc.code === 'ru' ? 'cyrillic' : 'latin',
        version: cfg.version,
        head_extra: isHome && loc === EN ? '    <script src="/lang.js?v=' + cfg.version + '"></script>' : '',
        home: loc.path,
        nav: isHome
            ? `            <nav class="header-nav" aria-label="${esc(t.main_nav)}">
                <a href="#how">${esc(t.nav_how)}</a>
                <a href="#sound">${esc(t.nav_sound)}</a>
                <a href="#privacy">${esc(t.nav_privacy)}</a>
                <a href="#faq">${esc(t.nav_faq)}</a>
            </nav>`
            : '            <span class="header-spacer"></span>',
        langmenu: langMenu(loc, id),
        langmenu_footer: langMenu(loc, id, ' lang-menu-up'),
        footer_socials: socials(' socials-footer', '                '),
        download_href: isHome ? '#download' : loc.path + '#download',
        page_data: pageData(runtime(loc)),
        ...extra
    };
}

const generated = [];
const sitemap = [];

for (const loc of LOCALES) {
    const t = DICT[loc.code];
    for (const id of Object.keys(PAGES)) {
        if (!hasPage(loc, id)) continue;
        const p = PAGES[id];
        let extra = {};
        if (id === 'home') {
            // es-419, fr-CA и pt-PT – варианты, а не отдельные языки: считаем по основе кода
            const langs = t.langs_many.replace('{n}', new Set(cfg.appLanguages.map(c => c.split('-')[0])).size);
            extra = {
                platforms: esc(nbspNumbers(t.platforms.replace('{langs}', langs))),
                freed_start: '312\u00a0' + esc(t.mb),
                // Есть ролик – он заменяет прототип на первом экране (V1) и карточку с годами (V7)
                hero_video: mediaAttr('v1', loc) ? ' has-video' : '',
                nos_video: mediaAttr('v7', loc) ? ' has-video' : '',
                contrast2: cfg.freedGb == null
                    ? esc(t.c2_nogb)
                    // В японском слова не разделяют пробелами
                    : [esc(t.c2a), `<mark>${fmtNumber(loc, cfg.freedGb)}\u00a0${esc(t.gb)}</mark>`, esc(t.c2b)].join(loc.code === 'ja' ? '' : ' '),
                socials: socials(),
                faq: faq(loc)
            };
            if (loc === EN) {
                // Предложение открыть сайт на языке браузера – только на английской главной
                const offers = Object.fromEntries(LOCALES.filter(l => l !== EN).map(l => [l.code, {
                    text: DICT[l.code].lang_offer, go: DICT[l.code].lang_offer_go, close: DICT[l.code].lang_offer_close, url: l.path
                }]));
                extra.page_data = pageData({ ...runtime(loc), offers });
            }
        }
        if (p.doc) {
            extra = {
                doc_title: esc(t[p.doc]),
                doc: legalDoc(loc, id),
                updated: new Intl.DateTimeFormat(loc.code, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(cfg.updated))
            };
        }
        const html = render(p.tpl, { loc, vars: commonVars(loc, id, extra) });
        const rel = urlOf(loc, id).slice(1) + 'index.html';
        write(rel, html);
        generated.push(rel);
        sitemap.push({ id, loc });
    }
}

// --- /get: цель QR-кода. Один адрес на все языки, текст подбирает go.js ---
{
    const loc = EN;
    const soon = !cfg.stores.ios && !cfg.stores.android;
    const texts = Object.fromEntries(LOCALES.map(l => [l.code, {
        title: DICT[l.code][soon ? 'get_title_soon' : 'get_title'],
        sub: DICT[l.code].soon_p,
        home: DICT[l.code].nav_home_long,
        homeUrl: l.path
    }]));
    const vars = {
        lang: 'en', title: esc(DICT.en.title_get), description: esc(DICT.en.og_desc), robots: 'noindex',
        alternates: '', og: '', script_subset: 'latin', version: cfg.version, head_extra: '', home: '/',
        get_mode: soon ? 'soon' : 'stores',
        get_title: esc(texts.en.title),
        page_data: pageData({ ...runtime(loc), mode: soon ? 'soon' : 'stores', stores: { ios: cfg.stores.ios, android: cfg.stores.android }, texts })
    };
    const block = () => soon
        ? `        <p class="get-sub" id="getSub">${esc(DICT.en.soon_p)}</p>`
        : `        <div class="stores stores-final">\n${storeLinks(loc, 'get')}\n        </div>`;
    write('get/index.html', render('get', { loc, vars, storesBlock: block }));
    generated.push('get/index.html');
}

// --- 404 ---
{
    const vars = {
        lang: 'en', title: 'Pelusa – 404', description: esc(DICT.en.nf_text), robots: 'noindex',
        alternates: '', og: '', script_subset: 'latin', version: cfg.version, head_extra: '',
        nf_lines: '        <p class="nf-text">' + LOCALES.map(l => `<span lang="${l.hreflang}">${esc(DICT[l.code].nf_text)}</span>`).join(' · ') + '</p>',
        nf_links: LOCALES.map((l, i) => `            <a ${i === 0 ? 'class="header-download" ' : ''}href="${l.path}" lang="${l.hreflang}">${esc(DICT[l.code].nav_home_long)}</a>`).join('\n')
    };
    write('404.html', render('404', { loc: EN, vars }));
    generated.push('404.html');
}

// --- Сохраненный выбор языка на английской главной ---
{
    const paths = Object.fromEntries(LOCALES.filter(l => l !== EN).map(l => [l.code, l.path]));
    write('lang.js', `// Сгенерировано tools/build.mjs. Если язык уже выбран вручную – сразу открываем его версию главной.
(function () {
    var p = ${JSON.stringify(paths)}, l = null;
    try { l = localStorage.getItem('lang'); } catch (e) {}
    if (l && p[l] && location.pathname === '/') location.replace(p[l] + location.search + location.hash);
})();
`);
}

// --- sitemap.xml ---
{
    const urls = sitemap.map(({ id, loc }) => {
        const alts = LOCALES.filter(l => hasPage(l, id))
            .flatMap(l => hreflangs(l).map(h => `        <xhtml:link rel="alternate" hreflang="${h}" href="${abs(urlOf(l, id))}"/>`)).join('\n');
        return `    <url>
        <loc>${abs(urlOf(loc, id))}</loc>
        <lastmod>${cfg.updated}</lastmod>
${alts}
        <xhtml:link rel="alternate" hreflang="x-default" href="${abs(urlOf(EN, id))}"/>
    </url>`;
    }).join('\n');
    write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`);
}

console.log(`Готово: ${generated.length} страниц (${LOCALES.map(l => l.code).join(', ')})`);
for (const [code, keys] of Object.entries(missing)) console.warn(`  ${code}: нет перевода, взят английский – ${[...keys].join(', ')}`);
