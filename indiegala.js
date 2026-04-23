// ==UserScript==
// @name         IndieGala AutoJoin PRO (SMART BALANCE + LOG)
// @namespace    indiegala.autojoin.smart
// @downloadURL  https://raw.githubusercontent.com/cantthinkofanickname/IndieGala-AutoJoin/main/indiegala.js
// @updateURL    https://raw.githubusercontent.com/cantthinkofanickname/IndieGala-AutoJoin/main/indiegala.js
// @version      1.1
// @match        https://www.indiegala.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let running = false;
    let currentPage = 1;
    const MAX_PAGES = 30;

    let localBalance = 0;

    let stats = {
        joined: 0,
        skipped: 0
    };

    const SETTINGS_KEY = "ig_autojoin_settings";

    let settings = {
        level: 0,
        delayMin: 4000,
        delayMax: 8000,
        delayPages: 5000,

        skipDLC: true,
        skipSoundtrack: true,
        skipTrash: true
    };

    function loadSettings() {
        let saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            try {
                settings = { ...settings, ...JSON.parse(saved) };
            } catch {}
        }
    }

    function saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rand = (min, max) => Math.floor(Math.random() * (max - min) + min);

    function getCookie(name) {
        let match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? match[2] : null;
    }

    /************** 💰 BALANCE **************/
    function getBalance() {
        let el = document.getElementById('galasilver-amount');
        if (!el) return 0;
        let val = el.textContent.trim().replace(/[^\d]/g, '');
        return parseInt(val) || 0;
    }

    /************** FILTER **************/
    function isTrash(title) {
        let t = title.toLowerCase();

        const dlc = [" dlc"," add-on"," addon"," expansion"," expansion pack"," extra"," content pack","background"];
        const ost = ["soundtrack"," ost"," music pack"];
        const trash = ["pack","bundle","edition","collection"];

        if (settings.skipDLC) {
            let isDLC = dlc.some(p=>t.includes(p));
            if (!isDLC && t.includes(" - ")) {
                let parts = t.split(" - ");
                if (parts[1] && parts[1].length < 20) isDLC = true;
            }
            if (isDLC) { log(`Skip DLC: ${title}`); return true; }
        }

        if (settings.skipSoundtrack && ost.some(p=>t.includes(p))) {
            log(`Skip OST: ${title}`);
            return true;
        }

        if (settings.skipTrash && trash.some(p=>t.includes(p))) {
            log(`Skip trash: ${title}`);
            return true;
        }

        return false;
    }

    /************** UI **************/
    function createUI() {
        if (document.getElementById("bot_float_btn")) return;

        let btn = document.createElement('div');
        btn.id = "bot_float_btn";
        btn.innerHTML = "";
        btn.style = `
            position:fixed;
            top:20px;
            right:20px;
            width:60px;
            height:60px;
            background:#ff3b3b;
            color:#fff;
            display:flex;
            align-items:center;
            justify-content:center;
            border-radius:50%;
            cursor:pointer;
            z-index:999999;
        `;

        let panel = document.createElement('div');
        panel.id = "bot_panel";
        panel.style = `
            position:fixed;
            top:90px;
            right:20px;
            background:#1e1e1e;
            padding:15px;
            border-radius:10px;
            z-index:999999;
            color:#fff;
            width:260px;
            display:none;
            max-height:70vh;
            overflow:auto;
        `;

        panel.innerHTML = `
            <divAutoJoin SMART</div>

            <div>Level:</div>
            <input id="bot_level" type="number" style="width:100%;margin-bottom:6px;">

            <hr>

            <label><input type="checkbox" id="skip_dlc"> Skip DLC</label><br>
            <label><input type="checkbox" id="skip_sound"> Skip Soundtrack</label><br>
            <label><input type="checkbox" id="skip_trash"> Skip Pack</label>

            <hr>

            <div>Delay JOIN (ms):</div>
            <input id="delay_min" type="number" placeholder="Min" style="width:48%;">
            <input id="delay_max" type="number" placeholder="Max" style="width:48%;float:right;margin-bottom:6px;">

            <div>Delay Pages (ms):</div>
            <input id="delay_pages" type="number" style="width:100%;margin-bottom:6px;">

            <hr>

            <button id="bot_start" style="width:100%;margin-bottom:5px;">START</button>
            <button id="bot_stop" style="width:100%;">STOP</button>

            <div style="margin-top:10px;font-size:12px;">
                Balance: <span id="stat_balance">0</span><br>
                Joined: <span id="stat_joined">0</span><br>
                Skipped: <span id="stat_skipped">0</span>
            </div>

            <hr>

            <div>Log:</div>
            <textarea id="bot_log" style="width:100%;height:150px;background:#000;color:#0f0;font-size:11px;padding:5px;border-radius:5px;overflow:auto;" readonly></textarea>
        `;

        document.documentElement.appendChild(btn);
        document.documentElement.appendChild(panel);

        // подставляем сохраненные значения
        document.getElementById('bot_level').value = settings.level;
        document.getElementById('skip_dlc').checked = settings.skipDLC;
        document.getElementById('skip_sound').checked = settings.skipSoundtrack;
        document.getElementById('skip_trash').checked = settings.skipTrash;
        document.getElementById('delay_min').value = settings.delayMin;
        document.getElementById('delay_max').value = settings.delayMax;
        document.getElementById('delay_pages').value = settings.delayPages;

        btn.onclick = () => {
            panel.style.display = panel.style.display === "none" ? "block" : "none";
        };

        document.getElementById('bot_start').onclick = () => {
            settings.level = +document.getElementById('bot_level').value;
            settings.skipDLC = document.getElementById('skip_dlc').checked;
            settings.skipSoundtrack = document.getElementById('skip_sound').checked;
            settings.skipTrash = document.getElementById('skip_trash').checked;
            settings.delayMin = +document.getElementById('delay_min').value || settings.delayMin;
            settings.delayMax = +document.getElementById('delay_max').value || settings.delayMax;
            settings.delayPages = +document.getElementById('delay_pages').value || settings.delayPages;

            saveSettings();

            running = true;
            currentPage = 1;
            stats.joined = 0;
            stats.skipped = 0;

            localBalance = getBalance(); // берем баланс с сайта один раз
            updateStats();
            clearLog();

            loadNextPage(); // сразу с первой страницы
        };

        document.getElementById('bot_stop').onclick = () => {
            running = false;
            log("Stopped manually");
        };
    }

    function updateStats() {
        document.getElementById('stat_joined').textContent = stats.joined;
        document.getElementById('stat_skipped').textContent = stats.skipped;
        document.getElementById('stat_balance').textContent = localBalance;
    }

    function log(msg) {
        let textarea = document.getElementById('bot_log');
        if (!textarea) return;
        textarea.value += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
        textarea.scrollTop = textarea.scrollHeight;
    }

    function clearLog() {
        let textarea = document.getElementById('bot_log');
        if (textarea) textarea.value = '';
    }

    /************** JOIN **************/
    async function joinAllGiveaways() {
        let container = document.getElementById('ajax-contents-container');
        if (!container) return;

        let cards = container.querySelectorAll('.items-list-item');

        for (let card of cards) {
            if (!running) return;

            if (localBalance <= 0) {
                log("💸 Баланс 0 → STOP");
                running = false;
                return;
            }

            let priceEl = card.querySelector('.items-list-item-data-button a');
            let price = parseInt(priceEl?.dataset.price) || 0;

            if (price > localBalance) {
                log(`⛔ Цена ${price} > баланс ${localBalance} → STOP PAGE`);
                running = false;
                return;
            }

            let title = card.querySelector('.items-list-item-title a')?.textContent.trim() || "";
            // === LEVEL FILTER ===
            let levelText = card.querySelector('.items-list-item-type span')?.textContent || "";
            let matchLevel = levelText.match(/Lev\.\s*(\d+)/i);
            let giveawayLevel = matchLevel ? parseInt(matchLevel[1]) : 0;

            if (giveawayLevel > settings.level) {
                log(`⛔ Skip level ${giveawayLevel} > ${settings.level}: ${title}`);
                stats.skipped++;
                updateStats();
                continue;
            }

            if (isTrash(title)) {
                stats.skipped++;
                updateStats();
                continue;
            }

            let btn = card.querySelector('.items-list-item-ticket-click');
            if (!btn) continue;

            let m = btn.getAttribute('onclick')?.match(/'(\d+)',\s*\d+,\s*'([^']+)'/);
            if (!m) continue;

            let id = m[1];
            let token = m[2];
            let csrf = getCookie('csrftoken');

            log(`✅ Joining: ${title} | ${price} iS`);

            try {
                let res = await fetch("https://www.indiegala.com/giveaways/join", {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "accept": "application/json, text/javascript, */*; q=0.01",
                        "content-type": "application/json",
                        "x-requested-with": "XMLHttpRequest",
                        "x-csrf-token": csrf,
                        "x-csrftoken": csrf
                    },
                    body: JSON.stringify({ id, token })
                });

                if (res.status === 200) {
                    let data = {};
                    try {
                        data = await res.json();
                    } catch {}

                    if (data && data.status === "ok" && typeof data.silver_tot !== "undefined") {
                        localBalance = parseInt(data.silver_tot) || localBalance;
                        stats.joined++;
                        // log(`💰 Новый баланс (с сайта): ${localBalance}`);
                    } else {
                        stats.skipped++;
                        log(`⚠️ Ответ без баланса или ошибка`);
                    }

                } else {
                    stats.skipped++;
                }

                updateStats();

                if (localBalance <= 0) {
                    log("💸 Баланс 0 → STOP");
                    running = false;
                    return;
                }

                if (res.status === 403) await sleep(15000);

            } catch {}

            await sleep(rand(settings.delayMin, settings.delayMax));
        }
    }

    /************** FLOW **************/
    async function processPage() {
        if (!running) return;

        await joinAllGiveaways();
        setTimeout(loadNextPage, settings.delayPages);
    }

    function loadNextPage() {
        if (!running) return;

        if (currentPage > MAX_PAGES) {
            log("🏁 Дошли до лимита страниц");
            running = false;
            return;
        }

        let url = `/giveaways/ajax/${currentPage}/price/asc/level/${settings.level}`;

        log(`📄 Loading page: ${currentPage}`);

        loadGiveawaysListContents(url);

        currentPage++;

        setTimeout(processPage, 4000);
    }

    /************** INIT **************/
    (function init() {
        loadSettings();

        function wait() {
            if (!document.documentElement) return setTimeout(wait, 300);
            createUI();
        }
        wait();
    })();

})();
