// ==UserScript==
// @name           Tab Explode Animation
// @version        1.1
// @author         Bxthesda
// @description    Adds a bubble explosion animation when a tab or tab group is closed.
// @compatibility  Firefox 100+
// ==/UserScript==

(() => {
    const TAB_EXPLODE_ANIMATION_ID = 'tab-explode-animation-styles';
    const PREF_PREFIX = 'extension.bubble-pop-deleting.';
    const BUBBLE_EDGE_OFFSET = 5; // px, keeps bubbles visually on the element edge
    const MAX_STAGGER = 120; // ms, max animation delay stagger

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
        // Skip standalone pinned/essential tabs (small icons in the sidebar top area),
        // but allow tabs inside zen-folders — they are pinned tabs taken over by the folder.
        if (tab.pinned && !tab.closest('zen-folder')) return;
        if (isGlanceTab(tab)) return;

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

        // Listen on window so we catch TabClose for tabs inside zen-folders too
        // (tabs in folders may not be DOM descendants of tabContainer).
        window.addEventListener('TabClose', onTabClose, true);
        gBrowser.tabContainer.addEventListener('TabGroupRemoved', onTabGroupRemoved);
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
