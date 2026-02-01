// ==UserScript==
// @name           Tab Explode Animation
// @version        1.0
// @author         Bxthesda
// @description    Adds a bubble explosion animation when a tab or tab group is closed.
// @compatibility  Firefox 100+
// ==/UserScript==

(() => {
    console.log("Tab Explode Animation: Script execution started.");

    const TAB_EXPLODE_ANIMATION_ID = 'tab-explode-animation-styles';
    const BUBBLE_COUNT = 25; // Number of bubbles
    const ANIMATION_DURATION = 600; // Milliseconds
    
    // Add a flag to prevent animations during startup
    let browserFullyLoaded = false;
    
    function injectStyles() {
        if (document.getElementById(TAB_EXPLODE_ANIMATION_ID)) {
            return;
        }

        const css = `
            .tab-explosion-container {
                position: absolute;
                pointer-events: none; 
                z-index: 99999;
            }

            .bubble-particle {
                position: absolute;
                background-color: color-mix(in srgb, var(--zen-primary-color), #FFFFFF);
                border-radius: 50%;
                opacity: 0.8;
                animation-name: bubbleExplode;
                animation-duration: ${ANIMATION_DURATION}ms;
                animation-timing-function: ease-out;
                animation-fill-mode: forwards; 
                will-change: transform, opacity;
            }

            @keyframes bubbleExplode {
                0% {
                    transform: scale(0.2);
                    opacity: 0.8;
                }
                100% {
                    transform: translate(var(--tx, 0px), var(--ty, 0px)) scale(var(--s, 1));
                    opacity: 0;
                }
            }
        `;

        const styleElement = document.createElement('style');
        styleElement.id = TAB_EXPLODE_ANIMATION_ID;
        styleElement.textContent = css;
        document.head.appendChild(styleElement);
        console.log("Tab Explode Animation: Styles injected.");
    }

    function animateElementClose(element) {
        // Check if browser is still starting up
        if (!browserFullyLoaded) {
            console.log("Tab Explode Animation: Animation prevented during browser startup.");
            return;
        }
        
        // --- BEGIN DEBUG LOG for animateElementClose ---
        console.log("Tab Explode Animation: animateElementClose invoked. Element:", element);
        if (element && typeof element.getBoundingClientRect === 'function') {
            const rect = element.getBoundingClientRect();
            console.log(`Tab Explode Animation: animateElementClose DEBUG: Element rect: L=${rect.left}, T=${rect.top}, W=${rect.width}, H=${rect.height}, R=${rect.right}, B=${rect.bottom}`);
            console.log(`Tab Explode Animation: animateElementClose DEBUG: Element isConnected: ${element.isConnected}, id: ${element.id}, class: ${element.className}, localName: ${element.localName}`);
        } else {
            console.log("Tab Explode Animation: animateElementClose DEBUG: Element is null, undefined, or has no getBoundingClientRect method.");
        }
        // --- END DEBUG LOG for animateElementClose ---

        if (!element || !element.isConnected) {
            console.warn("Tab Explode Animation: animateElementClose: Element is null or not connected to the DOM. Aborting animation for:", element);
            return;
        }

        const elementRect = element.getBoundingClientRect(); // Viewport-relative
        
        // NEW CHECK for zero-size elements (often due to display:none or not yet rendered)
        if (elementRect.width === 0 && elementRect.height === 0) {
            console.warn(`Tab Explode Animation: animateElementClose: Element has zero width and height (L=${elementRect.left}, T=${elementRect.top}). This usually means it's hidden (e.g., display: none) or not yet rendered. Aborting animation to prevent top-left placement. Element:`, element);
            return;
        }

        const explosionContainer = document.createElement('div');
        explosionContainer.className = 'tab-explosion-container'; // Has position: absolute

        // Determine the parent for the animation.
        // #browser is a high-level container for the browser content area.
        let parentForAnimation = document.getElementById('browser');
        if (!parentForAnimation || !parentForAnimation.isConnected) {
            // Fallback to main-window or even documentElement if #browser is not suitable
            parentForAnimation = document.getElementById('main-window') || document.documentElement;
        }
        
        const parentRect = parentForAnimation.getBoundingClientRect();

        // --- BEGIN DEBUG LOG for parent and positioning ---
        console.log("Tab Explode Animation: animateElementClose DEBUG: Chosen parentForAnimation:", parentForAnimation);
        console.log(`Tab Explode Animation: animateElementClose DEBUG: Parent rect: L=${parentRect.left}, T=${parentRect.top}, W=${parentRect.width}, H=${parentRect.height}`);
        const finalLeft = elementRect.left - parentRect.left;
        const finalTop = elementRect.top - parentRect.top;
        console.log(`Tab Explode Animation: animateElementClose DEBUG: Explosion container calculated style: left=${finalLeft}px, top=${finalTop}px, width=${elementRect.width}px, height=${elementRect.height}px`);
        // --- END DEBUG LOG for parent and positioning ---
        
        explosionContainer.style.left = `${finalLeft}px`;
        explosionContainer.style.top = `${finalTop}px`;
        explosionContainer.style.width = `${elementRect.width}px`;
        explosionContainer.style.height = `${elementRect.height}px`;
        
        parentForAnimation.appendChild(explosionContainer);

        for (let i = 0; i < BUBBLE_COUNT; i++) {
            const bubble = document.createElement('div');
            bubble.className = 'bubble-particle';

            let initialX, initialY;
            let edge;
            if (i < 4) { // Assign the first four bubbles to distinct edges (0, 1, 2, 3)
                edge = i;
            } else {     // For subsequent bubbles, assign to a random edge
                edge = Math.floor(Math.random() * 4);
            }

            const bubbleSizeOffset = 5; // Half of average bubble size, to keep them visually on edge

            switch (edge) {
                case 0: // Top edge
                    initialX = Math.random() * elementRect.width;
                    initialY = -bubbleSizeOffset;
                    break;
                case 1: // Right edge
                    initialX = elementRect.width + bubbleSizeOffset;
                    initialY = Math.random() * elementRect.height;
                    break;
                case 2: // Bottom edge
                    initialX = Math.random() * elementRect.width;
                    initialY = elementRect.height + bubbleSizeOffset;
                    break;
                case 3: // Left edge
                    initialX = -bubbleSizeOffset;
                    initialY = Math.random() * elementRect.height;
                    break;
            }
            
            bubble.style.left = `${initialX}px`; 
            bubble.style.top = `${initialY}px`;
            bubble.style.width = `${Math.random() * 4 + 4}px`; // Random size (4px to 8px)
            bubble.style.height = bubble.style.width;

            // Random final translation and scale for each bubble
            const angle = Math.random() * Math.PI * 2;
            let distance = Math.random() * 1 + 1; // Explosion radius, even further reduced spread
            let finalTranslateX = Math.cos(angle) * distance;
            let finalTranslateY = Math.sin(angle) * distance;
            
            // Bias explosion outwards from the edge
            const outwardBias = 10; // Reduced outward bias
            if (edge === 0) finalTranslateY -= outwardBias; // Upwards from top
            if (edge === 1) finalTranslateX += outwardBias; // Rightwards from right
            if (edge === 2) finalTranslateY += outwardBias; // Downwards from bottom
            if (edge === 3) finalTranslateX -= outwardBias; // Leftwards from left

            const finalScale = Math.random() * 0.4 + 0.7; // Scale up a bit

            bubble.style.setProperty('--tx', `${finalTranslateX}px`);
            bubble.style.setProperty('--ty', `${finalTranslateY}px`);
            bubble.style.setProperty('--s', finalScale);
            
            // Stagger animation start slightly
            bubble.style.animationDelay = `${Math.random() * 120}ms`;

            explosionContainer.appendChild(bubble);
        }

        // Make the original element content invisible immediately
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.1s linear';

        // Remove the explosion container after the animation
        setTimeout(() => {
            if (explosionContainer.parentNode) {
                explosionContainer.parentNode.removeChild(explosionContainer);
            }
        }, ANIMATION_DURATION + 100); // Add slight buffer for animation delay
    }

    function onTabClose(event) {
        const tab = event.target;

        // Log every TabClose event during startup
        console.log(`Tab Explode Animation: TabClose event received at ${new Date().toISOString()}, browserFullyLoaded=${browserFullyLoaded}`);
        
        // --- BEGIN GENERAL DEBUG LOG for onTabClose ---
        console.log("Tab Explode Animation: onTabClose event triggered. Event target:", tab);
        if (tab) {
            console.log(`Tab Explode Animation: onTabClose DEBUG: target.localName: ${tab.localName}, id: ${tab.id}, class: ${tab.className}, pinned: ${tab.pinned}, connected: ${tab.isConnected}`);
            const glanceAttrValue = tab.getAttribute ? tab.getAttribute('zen-glance-tab') : 'N/A (no getAttribute)';
            const hasGlanceAttr = tab.hasAttribute ? tab.hasAttribute('zen-glance-tab') : 'N/A (no hasAttribute)';
            const hasGlanceIdAttr = tab.hasAttribute ? tab.hasAttribute('glance-id') : 'N/A (no hasAttribute)'; // New check
            console.log(`Tab Explode Animation: onTabClose DEBUG: zen-glance-tab value: '${glanceAttrValue}', hasAttribute: ${hasGlanceAttr}, has glance-id: ${hasGlanceIdAttr}`);
            
            if (tab.hasAttribute && tab.hasAttribute('glance-id')) { // Main check for Glance-related tabs
                console.log("Tab Explode Animation: onTabClose DEBUG: This is a Glance-related tab based on 'glance-id' attribute.");
            } else if (tab.getAttribute && tab.getAttribute('zen-glance-tab') === 'true') {
                console.log("Tab Explode Animation: onTabClose DEBUG: This is a Glance tab based on 'zen-glance-tab' attribute.");
            } else {
                console.log("Tab Explode Animation: onTabClose DEBUG: This is NOT identified as a Glance tab.");
            }
        } else {
            console.log("Tab Explode Animation: onTabClose DEBUG: event.target is null or undefined.");
        }
        // --- END GENERAL DEBUG LOG for onTabClose ---

        // Ensure it's a normal tab and not something else
        // and also not a Glance tab (checking for 'glance-id' or 'zen-glance-tab')
        if (tab && tab.localName === 'tab' && 
            !tab.pinned && 
            tab.isConnected && 
            (!tab.hasAttribute || (!tab.hasAttribute('glance-id') && tab.getAttribute('zen-glance-tab') !== 'true'))) { 
            
            console.log("Tab Explode Animation: TabClose event triggered for tab (ANIMATING based on conditions):", tab);
            animateElementClose(tab);
            
        } else if (tab && tab.hasAttribute && (tab.hasAttribute('glance-id') || tab.getAttribute('zen-glance-tab') === 'true')) {
            console.log("Tab Explode Animation: TabClose event for a Glance-related tab (SKIPPING animation):", tab);
        } else {
            console.log("Tab Explode Animation: TabClose event, conditions for animation NOT MET or it's an unidentified Glance tab. Target:", tab);
        }
    }

    function onTabGroupRemove(event) {
        const group = event.target;

        // Log every TabGroupRemove event during startup
        console.log(`Tab Explode Animation: TabGroupRemove event received at ${new Date().toISOString()}, browserFullyLoaded=${browserFullyLoaded}`);
        
        // --- BEGIN GENERAL DEBUG LOG for onTabGroupRemove ---
        console.log("Tab Explode Animation: onTabGroupRemove event received. Event:", event);
        console.log("Tab Explode Animation: onTabGroupRemove event target:", group);
        if (group) {
            console.log(`Tab Explode Animation: onTabGroupRemove DEBUG: target.localName: ${group.localName}, id: ${group.id}, class: ${group.className}, connected: ${group.isConnected}`);
        } else {
            console.log("Tab Explode Animation: onTabGroupRemove DEBUG: event.target is null or undefined.");
        }
        // --- END GENERAL DEBUG LOG for onTabGroupRemove ---

        console.log("Tab Explode Animation: TabGroupRemove event received (original log):", event); // Keeping original log for now
        if (group && group.localName === 'tab-group' && group.isConnected) {
            console.log("Tab Explode Animation: TabGroupRemove event triggered for group (ANIMATING):", group);
            animateElementClose(group);
        } else {
            console.log("Tab Explode Animation: TabGroupRemove event, conditions for animation NOT MET. Target:", group);
        }
    }

    function init() {
        console.log("Tab Explode Animation: init() function called.");
        injectStyles();
        if (typeof gBrowser !== 'undefined' && gBrowser.tabContainer) {
            console.log("Tab Explode Animation: gBrowser and gBrowser.tabContainer are available.");
            gBrowser.tabContainer.addEventListener('TabClose', onTabClose, false);
            
            // Add multiple event listeners to catch tab group removal
            gBrowser.tabContainer.addEventListener('TabGroupRemove', onTabGroupRemove, false);
            gBrowser.tabContainer.addEventListener('TabGroupClosed', onTabGroupRemove, false);
            gBrowser.tabContainer.addEventListener('TabGroupRemoved', onTabGroupRemove, false);
            
            // Also listen for the custom event that might be used
            document.addEventListener('TabGroupRemoved', onTabGroupRemove, false);
            
            console.log("Tab Explode Animation: Listeners attached to TabClose and TabGroup events.");
            
            // Set a delay before allowing animations to run
            setTimeout(() => {
                browserFullyLoaded = true;
                console.log("Tab Explode Animation: Browser startup complete, animations enabled.");
            }, 5000); // 5 second delay to ensure browser is fully loaded
        } else {
            // Retry if gBrowser is not ready
            console.log("Tab Explode Animation: gBrowser not ready, scheduling retry.");
            setTimeout(init, 1000);
        }
    }

    // Wait for the browser to be fully loaded
    console.log("Tab Explode Animation: Setting up load event listener or calling init directly.");
    if (document.readyState === "complete") {
        console.log("Tab Explode Animation: Document already complete, calling init().");
        init();
    } else {
        console.log("Tab Explode Animation: Document not complete, adding load event listener for init().");
        window.addEventListener("load", init, { once: true });
    }

})(); 
