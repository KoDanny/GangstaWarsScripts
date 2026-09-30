// ==UserScript==
// @name         [GWars] AP & Work Timers(0.1.3)
// @namespace    http://tampermonkey.net/
// @version      0.1.3
// @description  Добавляет таймеры работы и очков действий в шапку игры
// @author       Mr.Bonanno
// @match        https://www.gwars.io/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gwars.io
// @updateURL    https://raw.githubusercontent.com/KoDanny/GangstaWarsScripts/main/gw-scripts/ap-and-work-timers/ap-and-work-timers.meta.js
// @downloadURL  https://raw.githubusercontent.com/KoDanny/GangstaWarsScripts/main/gw-scripts/ap-and-work-timers/ap-and-work-timers.user.js
// @grant        none
// ==/UserScript==

(function () {
	'use strict';

	//========= CONFIG ==============

	const Config = {
		AP_TIMER: true, // Отображает таймер AP, false - отключить таймер
		WORK_TIMER: true, // Отображает таймер работы, false - отключить таймер
		WITH_SECONDS: false, // При включении счетчик (02:32:57), при отключении (2 ч 32 мин)
	};

	const STORAGE_KEYS = {
		AP: 'gwars_ap_timer',
		WORK: 'gwars_work_timer',
	};

	const PATTERNS = {
		// Нативный тайтл таймера AP, например "12:34 до 5/10"
		apTitle: /^(\d+):(\d+)\s+до\s+(\d+)\/(\d+)$/,
		// Кнопка "Работать N час"
		workButton: /Работать\s+(\d+)\s+час/i,
		// Строка "Выдача з/п: HH:MM"
		payClock: /выдача\s+з\/п:\s*(\d{1,2}):(\d{2})/i,
		payClockParts: /^(\d{1,2}):(\d{2})$/,
	};

	const CONSTANTS = {
		// ID'ы "родных" таймеров
		AP_SOURCE_IDS: ['opapnext', 'meapt'],
		// Одно AP восстанавливается за 5 минут
		AP_PERIOD_MS: 5 * 60 * 1000,
		// Игра платит не ровно раз в час: каждая выплата сдвигается на +1 минуту.
		PAY_PERIOD_MS: 61 * 60 * 1000,
		// Тик опроса: обновляет цифры по времени.
		TICK_MS: 1000,
		COLSPAN_FULL: 100,
	};

	//========= STORAGE ==============

	const Storage = {
		load(key) {
			try {
				return JSON.parse(localStorage.getItem(key)) || null;
			} catch {
				return null;
			}
		},
		save(key, data) {
			try {
				localStorage.setItem(key, JSON.stringify(data));
			} catch {
				// Приватный режим, превышена квота и т.п. — молча игнорируем
			}
		},
	};

	//========= TIME UTILS ==============

	const TimeUtils = {
		pad: (n) => String(n).padStart(2, '0'),

		format(ms) {
			const total = Math.max(0, Math.ceil(ms / 1000));
			const h = Math.floor(total / 3600);
			const m = Math.floor((total % 3600) / 60);
			const s = total % 60;

			if (Config.WITH_SECONDS) {
				return `${TimeUtils.pad(h)}:${TimeUtils.pad(m)}:${TimeUtils.pad(s)}`;
			}

			const min = m < 10 ? m : TimeUtils.pad(m);
			return h ? `${h} ч ${min} мин` : `${min} мин`;
		},

		formatClock(ts) {
			const d = new Date(ts);
			return `${TimeUtils.pad(d.getHours())}:${TimeUtils.pad(d.getMinutes())}`;
		},
	};

	//========= RENDER CACH ==============

	//  Шобы не перерисовывать ДОМ
	const createRenderCache = () => {
		let lastKey = '';
		return (key, renderFn) => {
			if (key === lastKey) return;
			lastKey = key;
			renderFn();
		};
	};

	//========= LAYOUT ==============

	const LINK_STYLE = 'color: #990000; font-weight: bold; white-space: nowrap;';

	// Создаем свое и ищем, куда бы вставить
	const Layout = (() => {
		// --- CSS ---
		const style = document.createElement('style');
		style.textContent = `
			@media (max-width: 800px) {
				#margintopdiv { margin-top: 84px !important; }
				#gwars-timers-container .gw-timer-separator { display: none; }

			}

			.gw-timer-row { white-space: nowrap; }
			.gw-timers-container { margin-left: 6px; }
			.gw-timers-cell { padding-left: 24px; }
		`;
		document.head.appendChild(style);

		// --- DOM-строки таймеров (создаются один раз) ---
		const apRow = (() => {
			const el = document.createElement('span');
			el.id = 'gwars-ap-timer';
			el.className = 'gw-timer-row';
			return el;
		})();

		const workRow = (() => {
			const el = document.createElement('span');
			el.id = 'gwars-work-timer';
			el.className = 'gw-timer-row';
			return el;
		})();

		let container = null;
		let observer = null;
		let observerTarget = null;
		let isRendering = false;

		// --- Определение контекста страницы ---

		const isOutland = () => location.pathname.startsWith('/walk');

		const isPda = () =>
			!!(
				document.getElementById('pdainfolayer0') ||
				document.getElementById('margintopdiv')
			);

		// Разделитель перед каждой строкой таймера
		const separator = () => (isPda() ? ' ' : ' | ');

		// --- Поиск родного контейнера, куда вставляются таймеры ---

		const findContainerElem = () => {
			if (isOutland()) {
				return document.querySelector(
					'body > table:nth-child(1) > tbody > tr > td:nth-child(1)',
				);
			}
			const header = document.getElementById('hpheader');
			return header ? header.closest('td') : null;
		};

		// --- Создание/пересоздание контейнера и вставка строк ---

		const buildTimersContainer = (parent) => {
			if (isPda()) {
				let td = document.getElementById('gwars-timers-cell');
				const tbody = parent.closest('tbody');

				if (!td || !td.isConnected || td.closest('tbody') !== tbody) {
					const tr = document.createElement('tr');
					td = document.createElement('td');
					td.id = 'gwars-timers-cell';
					td.classList.add(
						isOutland() && isPda() ? 'greengreenbg' : 'greenbg_pda_header',
						'gw-timers-cell',
					);
					td.colSpan = CONSTANTS.COLSPAN_FULL;

					if (isOutland()) {
						td.classList.remove('gw-timers-cell');
					}

					tr.appendChild(td);
					tbody.appendChild(tr);
				}
				container = td;
			} else {
				let span = document.getElementById('gwars-timers-container');
				if (!span || !span.isConnected || span.parentNode !== parent) {
					span = document.createElement('span');
					span.id = 'gwars-timers-container';
					parent.appendChild(span);
				}
				container = span;
			}

			// Перепривязка строк таймеров
			if (Config.WORK_TIMER) {
				container.append(workRow);
			}
			if (Config.AP_TIMER) {
				container.append(apRow);
			}
		};

		const isContainerAlive = (parent) =>
			container &&
			container.isConnected &&
			parent.contains(container) &&
			apRow.parentNode === container;

		const getOrCreateContainer = () => {
			const parent = findContainerElem();
			if (!parent) return null;

			if (isContainerAlive(parent)) return container;

			if (apRow.parentNode) apRow.parentNode.removeChild(apRow);
			if (workRow.parentNode) workRow.parentNode.removeChild(workRow);

			buildTimersContainer(parent);
			return container;
		};

		const withSuppressedObserver = (fn) => {
			isRendering = true;
			try {
				fn();
			} finally {
				isRendering = false;
			}
		};

		const attachObserver = (onNeedRestore) => {
			if (observer) {
				observer.disconnect();
				observer = null;
			}

			observerTarget = document.body;
			if (!observerTarget) return false;

			observer = new MutationObserver(() => {
				if (isRendering) return;
				if (container && container.isConnected) return;
				onNeedRestore();
			});

			observer.observe(observerTarget, { childList: true, subtree: true });
			return true;
		};

		const isObserverAlive = () =>
			observer && observerTarget && observerTarget.isConnected;

		return {
			apRow,
			workRow,
			separator,
			getOrCreateContainer,
			attachObserver,
			isObserverAlive,
			withSuppressedObserver,
		};
	})();
	// =========== AP Timer ===============

	const ApTimer = (() => {
		// Синхронизация с «родным» таймером на странице.
		// lastAnchor нужен, чтобы не перезаписывать состояние на каждом тике.
		let lastAnchor = null;

		const renderIfChanged = createRenderCache();

		const parseTitle = (title) => {
			const match = title.match(PATTERNS.apTitle);
			if (!match) return null;
			const [, minutes, seconds, nextPoint, total] = match;
			return {
				nextInMs: (+minutes * 60 + +seconds) * 1000,
				nextPoint: +nextPoint,
				current: +nextPoint - 1,
				total: +total,
			};
		};

		const findSourceElem = () => {
			for (const id of CONSTANTS.AP_SOURCE_IDS) {
				const el = document.getElementById(id);
				if (el && PATTERNS.apTitle.test(el.title || '')) return el;
			}
			return null;
		};

		const syncFromPage = () => {
			const sourceEl = findSourceElem();
			if (!sourceEl) return false;

			const state = parseTitle(sourceEl.title);
			if (!state) return false;

			const anchor = `${state.nextPoint}/${state.total}`;
			if (anchor === lastAnchor) return false;
			lastAnchor = anchor;

			const now = Date.now();
			Storage.save(STORAGE_KEYS.AP, {
				endTime:
					now +
					state.nextInMs +
					(state.total - state.nextPoint) * CONSTANTS.AP_PERIOD_MS,
				total: state.total,
				current: state.current,
				nextAt: now + state.nextInMs,
			});
			return true;
		};

		const render = (now) => {
			if (!Config.AP_TIMER) return;

			const row = Layout.apRow;
			const sep = Layout.separator();
			const data = Storage.load(STORAGE_KEYS.AP);

			// Нет данных — кнопка обновления
			if (!data) {
				row.innerHTML = `${sep}<b>AP:</b> <a class="nul" href="/ops.php" style="${LINK_STYLE}">Обновить</a>`;
				return;
			}

			const msLeft = data.endTime - now;
			const total = data.total;

			// AP заполнены полностью
			if (msLeft <= 0) {
				row.innerHTML = `${sep}<b>AP:</b> <a class="nul" href="/ops.php" style="${LINK_STYLE}">${total}/${total} (Максимум)</a>`;
				return;
			}

			// Идёт восстановление
			const remainingPeriods = Math.ceil(msLeft / CONSTANTS.AP_PERIOD_MS);
			const current = total - remainingPeriods;

			row.innerHTML = `${sep}<b>AP:</b> <a class="nul" href="/ops.php">[${current}/${total}] (${TimeUtils.format(msLeft)})</a>`;
		};

		const tick = (now) => {
			if (!Config.AP_TIMER) return;

			syncFromPage();

			const data = Storage.load(STORAGE_KEYS.AP);
			let renderKey = 'none';
			if (data) {
				const msLeft = Math.max(0, data.endTime - now);
				const remainingPeriods = Math.ceil(msLeft / CONSTANTS.AP_PERIOD_MS);
				const current =
					msLeft <= 0 ? data.total : data.total - remainingPeriods;
				renderKey = `${current}|${Math.ceil(msLeft / 1000)}`;
			}

			renderIfChanged(renderKey, () => render(now));
		};

		return { tick };
	})();

	//========= WORK TIMER ==============

	const WorkTimer = (() => {
		const renderIfChanged = createRenderCache();

		const parsePayClock = () => {
			const text = document.body?.textContent || '';
			const match = text.match(PATTERNS.payClock);
			if (!match) return null;
			return `${TimeUtils.pad(+match[1])}:${match[2]}`;
		};

		const onClick = (event) => {
			const btn = event.target.closest('input.mainbutton');
			if (!btn) return;

			const match = btn.value.match(PATTERNS.workButton);
			if (!match) return;

			const hours = +match[1];
			const now = Date.now();
			const durationMs = hours * 60 * 60 * 1000;

			const form = btn.closest('form#objectworkform');
			const idInput = form?.querySelector('input[name="id"]');
			const objectId = idInput ? idInput.value : null;

			Storage.save(STORAGE_KEYS.WORK, {
				endTime: now + durationMs,
				hours,
				startTime: now,
				objectId,
				payClock: parsePayClock(),
			});
		};

		// Первая выдача з/п после устройства на работу
		const getFirstPayTime = (startTime, payClock) => {
			const match = payClock.match(PATTERNS.payClockParts);
			if (!match) return null;

			const [, hours, minutes] = match;
			const base = new Date(startTime);
			base.setHours(+hours, +minutes, 0, 0);

			let ts = base.getTime();
			if (ts < startTime) ts += 24 * 60 * 60 * 1000;
			return ts;
		};

		const getNextPayTime = (workData, now) => {
			if (!workData.payClock) return null;

			const firstPay = getFirstPayTime(workData.startTime, workData.payClock);
			if (firstPay === null) return null;

			if (now < firstPay) return firstPay;

			const elapsedPeriods = Math.floor(
				(now - firstPay) / CONSTANTS.PAY_PERIOD_MS,
			);
			return firstPay + (elapsedPeriods + 1) * CONSTANTS.PAY_PERIOD_MS;
		};

		const render = (now) => {
			if (!Config.WORK_TIMER) return;

			const row = Layout.workRow;
			const sep = Layout.separator();
			const data = Storage.load(STORAGE_KEYS.WORK);

			if (!data) {
				row.style.display = 'none';
				return;
			}
			row.style.display = '';

			const msLeft = data.endTime - now;

			// Работа завершена
			if (msLeft <= 0) {
				row.innerHTML = `${sep}<b>Работа:</b> <a class="nul" href="/object.php?id=${data.objectId}" style="${LINK_STYLE}">Не работает</a>`;
				return;
			}

			const nextPay = getNextPayTime(data, now);
			const payPart = nextPay ? `з/п ${TimeUtils.formatClock(nextPay)}` : '';
			const linkText = `до ${TimeUtils.formatClock(data.endTime)} (${TimeUtils.format(
				msLeft,
			)}), <i>${payPart}</i>`;

			row.innerHTML = `${sep}<b>Работа:</b> <a class="nul" href="/object.php?id=${data.objectId}">${linkText}</a>`;
		};

		const tick = (now) => {
			if (!Config.WORK_TIMER) return;

			const data = Storage.load(STORAGE_KEYS.WORK);
			const renderKey = data
				? `${data.endTime}|${Math.ceil(Math.max(0, data.endTime - now) / 1000)}`
				: 'none';

			renderIfChanged(renderKey, () => render(now));
		};

		return { onClick, tick };
	})();

	//========= INIT ==============

	const init = () => {
		document.addEventListener('click', WorkTimer.onClick, true);

		const tick = () => {
			Layout.withSuppressedObserver(() => {
				Layout.getOrCreateContainer();
				const now = Date.now();
				ApTimer.tick(now);
				WorkTimer.tick(now);
			});

			if (!Layout.isObserverAlive()) {
				Layout.attachObserver(tick);
			}
		};

		setInterval(tick, CONSTANTS.TICK_MS);
		tick();
	};

	init();
})();
