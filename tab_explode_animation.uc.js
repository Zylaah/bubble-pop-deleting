// ==UserScript==
// @name           Tab Explode Animation
// @version        1.2
// @author         Bxthesda
// @description    Adds a bubble explosion animation when a tab or tab group is closed.
// @compatibility  Firefox 100+
// ==/UserScript==

(() => {
    const TAB_EXPLODE_ANIMATION_ID = 'tab-explode-animation-styles';
    const PREF_PREFIX = 'extension.bubble-pop-deleting.';
    const BUBBLE_EDGE_OFFSET = 5; // px, keeps bubbles visually on the element edge
    const MAX_STAGGER = 120; // ms, max animation delay stagger
    const LIBRARY_CLOSE_SINGLE_MS = 400;
    const LIBRARY_CLOSE_BULK_MS = 600;
    const LIBRARY_SKIP_GROUP_MS = 50;

    // Defaults matching preferences.json — used as fallbacks
    const DEFAULTS = {
        bubbleCount: 10,
        animationDuration: 600,
        bubbleSizeMin: 4,
        bubbleSizeRange: 4,
        outwardBias: 10,
    };

    function getIntPref(key, fallback) {
        const fullKey = PREF_PREFIX + key;
        try {
            const type = Services.prefs.getPrefType(fullKey);
            if (type === Services.prefs.PREF_INT) {
                return Services.prefs.getIntPref(fullKey, fallback);
            }
            if (type === Services.prefs.PREF_STRING) {
                const val = parseInt(Services.prefs.getCharPref(fullKey), 10);
                return Number.isNaN(val) ? fallback : val;
            }
        } catch (_) { /* pref missing or inaccessible */ }
        return fallback;
    }

    function readConfig() {
        return {
            bubbleCount:       getIntPref('bubble-count',       DEFAULTS.bubbleCount),
            animationDuration: getIntPref('animation-duration', DEFAULTS.animationDuration),
            bubbleSizeMin:     getIntPref('bubble-size-min',    DEFAULTS.bubbleSizeMin),
            bubbleSizeRange:   getIntPref('bubble-size-range',  DEFAULTS.bubbleSizeRange),
            outwardBias:       getIntPref('outward-bias',       DEFAULTS.outwardBias),
        };
    }

    function injectStyles() {
        if (document.getElementById(TAB_EXPLODE_ANIMATION_ID)) return;

        const style = document.createElement('style');
        style.id = TAB_EXPLODE_ANIMATION_ID;
        style.textContent = `
            .tab-explosion-container {
                position: absolute;
                pointer-events: none;
                z-index: 99999;
            }
            .bubble-particle {
                position: absolute;
                background-color: color-mix(in srgb, var(--zen-primary-color), #e6e8e6);
                border-radius: 50%;
                --zen-squircle-value: 1;
                corner-shape: round !important;
                opacity: 0.8;
                animation: bubbleExplode var(--bubble-duration) ease-out forwards;
                will-change: transform, opacity;
            }
            @keyframes bubbleExplode {
                0%   { transform: scale(0.2); opacity: 0.8; }
                100% { transform: translate(var(--tx, 0px), var(--ty, 0px)) scale(var(--s, 1)); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    function isGlanceTab(tab) {
        return tab.hasAttribute('glance-id') || tab.getAttribute('zen-glance-tab') === 'true';
    }

    function eventPath(event) {
        return typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    }

    // Sine Library close controls vs native Library's cloned tab-close-button.
    // Native copies live under .zen-library-space-tabs; the real strip does not.
    function libraryCloseKindFromEvent(event) {
        let sawNativeClose = false;
        let inNativeLibraryStrip = false;
        for (const node of eventPath(event)) {
            if (!node?.classList) continue;
            if (node.classList.contains('library-workspace-cleanup-button')) return 'bulk';
            if (node.classList.contains('library-tab-close-button')) return 'single';
            if (node.classList.contains('tab-close-button')) sawNativeClose = true;
            if (node.classList.contains('zen-library-space-tabs')) inNativeLibraryStrip = true;
        }
        if (sawNativeClose && inNativeLibraryStrip) return 'single';
        return null;
    }

    function visualFromLibraryEvent(event) {
        const path = eventPath(event);
        let sineItem = null;
        let sineFolder = null;
        let nativeTab = null;
        let nativeGroup = null;
        let inNativeLibraryStrip = false;
        for (const node of path) {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
            const cl = node.classList;
            if (cl?.contains('zen-library-space-tabs')) inNativeLibraryStrip = true;
            if (cl?.contains('library-workspace-item') && !sineItem) sineItem = node;
            if (cl?.contains('library-workspace-folder') && !sineFolder) sineFolder = node;
            if (node.localName === 'tab' && !nativeTab) nativeTab = node;
            if ((node.localName === 'tab-group' || node.localName === 'zen-folder') && !nativeGroup) {
                nativeGroup = node;
            }
        }
        if (inNativeLibraryStrip) return nativeTab || nativeGroup;
        return sineItem || sineFolder;
    }

    function libraryRoots() {
        const roots = [];
        for (const host of document.querySelectorAll('zen-library, #zen-library-container')) {
            if (host.shadowRoot) roots.push(host.shadowRoot);
            roots.push(host);
        }
        return roots;
    }

    function findLibraryProxy(element) {
        if (!element) return null;

        if (element.id) {
            const copyId = `${element.id}-copy`;
            for (const root of libraryRoots()) {
                const copy = root.querySelector?.(`#${CSS.escape(copyId)}`);
                if (copy?.closest?.('.zen-library-space-tabs, zen-library-spaces-section')) return copy;
            }
        }

        for (const root of libraryRoots()) {
            for (const item of root.querySelectorAll?.('.library-workspace-item') || []) {
                if (item._libraryDropItem === element) return item;
            }
            if (element.id && (element.localName === 'tab-group' || element.localName === 'zen-folder')) {
                const folder = root.querySelector?.(
                    `.library-workspace-folder[data-folder-id="${CSS.escape(element.id)}"]`
                );
                if (folder) return folder;
            }
        }
        return null;
    }

    function snapshotProxy(proxy) {
        if (!proxy?.isConnected) return null;
        const rect = proxy.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return null;
        return { rect, hideEl: proxy };
    }

    // Click-origin: Library closes the real tab, so TabClose points at the native
    // strip. Capture the visible proxy (and its rect) on the click that caused it.
    let libraryClose = null; // { bulk, rect, hideEl, until }
    let skipNativeGroupUntil = 0;

    function markLibraryClose(event, kind) {
        const snap = snapshotProxy(visualFromLibraryEvent(event));
        libraryClose = {
            bulk: kind === 'bulk',
            rect: snap?.rect || null,
            hideEl: snap?.hideEl || null,
            until: performance.now() + (kind === 'bulk' ? LIBRARY_CLOSE_BULK_MS : LIBRARY_CLOSE_SINGLE_MS),
        };
    }

    function activeLibraryClose() {
        if (!libraryClose || performance.now() >= libraryClose.until) {
            libraryClose = null;
            return null;
        }
        return libraryClose;
    }

    function onLibraryPointer(event) {
        const kind = libraryCloseKindFromEvent(event);
        if (kind) markLibraryClose(event, kind);
    }

    function animateLibraryClose(lib) {
        if (lib.bulk) return;
        if (lib.rect) animateAtRect(lib.rect, lib.hideEl);
        skipNativeGroupUntil = performance.now() + LIBRARY_SKIP_GROUP_MS;
    }

    function getAnimationParent() {
        return document.getElementById('browser')
            || document.getElementById('main-window')
            || document.documentElement;
    }

    function createBubble(edge, width, height, config) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble-particle';

        // Position bubble along the chosen edge
        let x, y;
        switch (edge) {
            case 0: x = Math.random() * width;  y = -BUBBLE_EDGE_OFFSET;          break; // top
            case 1: x = width + BUBBLE_EDGE_OFFSET; y = Math.random() * height;   break; // right
            case 2: x = Math.random() * width;  y = height + BUBBLE_EDGE_OFFSET;  break; // bottom
            case 3: x = -BUBBLE_EDGE_OFFSET;    y = Math.random() * height;       break; // left
        }

        const size = Math.random() * config.bubbleSizeRange + config.bubbleSizeMin;
        bubble.style.left = `${x}px`;
        bubble.style.top = `${y}px`;
        bubble.style.width = bubble.style.height = `${size}px`;

        // Compute outward explosion vector
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() + 1;
        let tx = Math.cos(angle) * dist;
        let ty = Math.sin(angle) * dist;

        // Bias outward from the originating edge
        const bias = config.outwardBias;
        if (edge === 0) ty -= bias;
        if (edge === 1) tx += bias;
        if (edge === 2) ty += bias;
        if (edge === 3) tx -= bias;

        bubble.style.setProperty('--tx', `${tx}px`);
        bubble.style.setProperty('--ty', `${ty}px`);
        bubble.style.setProperty('--s', Math.random() * 0.4 + 0.7);
        bubble.style.animationDelay = `${Math.random() * MAX_STAGGER}ms`;

        return bubble;
    }

    function animateAtRect(rect, elementToHide = null) {
        if (!animationsEnabled) return;
        if (rect.width === 0 && rect.height === 0) return;

        const config = readConfig();

        const parent = getAnimationParent();
        const parentRect = parent.getBoundingClientRect();

        const container = document.createElement('div');
        container.className = 'tab-explosion-container';
        container.style.left = `${rect.left - parentRect.left}px`;
        container.style.top = `${rect.top - parentRect.top}px`;
        container.style.width = `${rect.width}px`;
        container.style.height = `${rect.height}px`;
        container.style.setProperty('--bubble-duration', `${config.animationDuration}ms`);

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < config.bubbleCount; i++) {
            const edge = i < 4 ? i : Math.floor(Math.random() * 4);
            fragment.appendChild(createBubble(edge, rect.width, rect.height, config));
        }
        container.appendChild(fragment);
        parent.appendChild(container);

        if (elementToHide?.isConnected) {
            elementToHide.style.opacity = '0';
            elementToHide.style.transition = 'opacity 0.1s linear';
        }

        setTimeout(() => container.remove(), config.animationDuration + MAX_STAGGER + 50);
    }

    function animateElementClose(element) {
        if (!element?.isConnected) return;
        const rect = element.getBoundingClientRect();
        animateAtRect(rect, element);
    }

    // When closing a folder/group, TabClose may fire for each tab before TabGroupRemoved.
    // We defer tab-in-folder animations briefly; if TabGroupRemoved arrives, we cancel them.
    const pendingTabAnimations = new Map(); // group -> Set<timeoutId>

    function cancelPendingAnimationsForGroup(group) {
        const ids = pendingTabAnimations.get(group);
        if (ids) {
            for (const id of ids) clearTimeout(id);
            pendingTabAnimations.delete(group);
        }
    }

    function onTabClose(event) {
        const tab = event.target;
        if (!tab || tab.localName !== 'tab' || !tab.isConnected) return;
        if (isGlanceTab(tab)) return;

        const lib = activeLibraryClose();
        if (lib) {
            // Closed from Library: never use the native strip rect, and never fade
            // the real tab. Bulk clears skip entirely to avoid a spray of bursts.
            if (!lib.bulk && !lib.rect) {
                const snap = snapshotProxy(findLibraryProxy(tab));
                if (snap) {
                    lib.rect = snap.rect;
                    lib.hideEl = snap.hideEl;
                }
            }
            animateLibraryClose(lib);
            if (!lib.bulk) libraryClose = null;
            return;
        }

        const group = tab.group || tab.closest?.('tab-group, zen-folder');
        if (group) {
            // Tab is in a folder/group — defer animation in case the whole group is being closed.
            // Capture rect now (tab still in DOM); by the time the timeout fires, the tab may be gone.
            const rect = tab.getBoundingClientRect();
            const id = setTimeout(() => {
                const ids = pendingTabAnimations.get(group);
                if (ids) { ids.delete(id); if (!ids.size) pendingTabAnimations.delete(group); }
                animateAtRect(rect);
            }, 30);
            if (!pendingTabAnimations.has(group)) pendingTabAnimations.set(group, new Set());
            pendingTabAnimations.get(group).add(id);
        } else {
            animateElementClose(tab);
        }
    }

    function onTabGroupRemoved(event) {
        const group = event.target;
        if (!group || !group.isConnected) return;
        // Zen Browser uses both <tab-group> and <zen-folder> for groups
        if (group.localName !== 'tab-group' && group.localName !== 'zen-folder') return;
        cancelPendingAnimationsForGroup(group);

        const lib = activeLibraryClose();
        if (lib?.bulk || performance.now() < skipNativeGroupUntil) return;
        if (lib) {
            const snap = snapshotProxy(findLibraryProxy(group));
            if (snap) animateAtRect(snap.rect, snap.hideEl);
            libraryClose = null;
            return;
        }

        animateElementClose(group);
    }

    let animationsEnabled = false;

    function init() {
        // Prevent duplicate init when the script is loaded multiple times (e.g. theme
        // reload, workspace switch). Each extra init would add duplicate listeners, so
        // one TabClose would trigger N handlers and create N×bubbleCount bubbles.
        if (window.__tabExplodeAnimationInit) return;
        window.__tabExplodeAnimationInit = true;

        injectStyles();

        // Suppress animations until session restore is fully complete,
        // preventing stray bubbles from tabs being reorganised at startup.
        SessionStore.promiseAllWindowsRestored.then(() => {
            // Small extra buffer for any residual tab shuffling after restore.
            setTimeout(() => { animationsEnabled = true; }, 500);
        });

        const tc = gBrowser.tabContainer;
        tc.addEventListener('TabClose', onTabClose);
        tc.addEventListener('TabGroupRemoved', onTabGroupRemoved);
        // Capture, composed path: Library close runs removeTab in the same click,
        // and Sine's close button lives in a shadow root.
        window.addEventListener('click', onLibraryPointer, true);
    }

    // Wait for the browser UI to be fully ready (session restore complete,
    // gBrowser available) using Firefox's dedicated observer notification.
    if (gBrowserInit?.delayedStartupFinished) {
        init();
    } else {
        const obs = (subject, topic) => {
            if (topic === 'browser-delayed-startup-finished' && subject === window) {
                Services.obs.removeObserver(obs, topic);
                init();
            }
        };
        Services.obs.addObserver(obs, 'browser-delayed-startup-finished');
    }
})(); 
