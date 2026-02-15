// ==UserScript==
// @name           Tab Explode Animation
// @version        1.0
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
        try { return Services.prefs.getIntPref(PREF_PREFIX + key, fallback); }
        catch { return fallback; }
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

    function animateElementClose(element) {
        if (!animationsEnabled) return;
        if (!element?.isConnected) return;

        const rect = element.getBoundingClientRect();
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

        // Build all bubbles in a fragment to minimise reflows
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < config.bubbleCount; i++) {
            // First 4 bubbles each get a guaranteed distinct edge; the rest are random
            const edge = i < 4 ? i : Math.floor(Math.random() * 4);
            fragment.appendChild(createBubble(edge, rect.width, rect.height, config));
        }
        container.appendChild(fragment);
        parent.appendChild(container);

        // Hide the original element immediately
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.1s linear';

        // Clean up after all animations complete (duration + max stagger + small buffer)
        setTimeout(() => container.remove(), config.animationDuration + MAX_STAGGER + 50);
    }

    function onTabClose(event) {
        const tab = event.target;
        if (!tab || tab.localName !== 'tab' || tab.pinned || !tab.isConnected) return;
        if (isGlanceTab(tab)) return;
        animateElementClose(tab);
    }

    function onTabGroupRemoved(event) {
        const group = event.target;
        if (!group || !group.isConnected) return;
        // Zen Browser uses both <tab-group> and <zen-folder> for groups
        if (group.localName !== 'tab-group' && group.localName !== 'zen-folder') return;
        animateElementClose(group);
    }

    let animationsEnabled = false;

    function init() {
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
