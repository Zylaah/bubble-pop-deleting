# Tab Explode Animation for Zen

## Overview

This UserScript adds a fun, visual "bubble explosion" animation when a tab or a tab group is closed in Mozilla Zen. Instead of just disappearing, the closed tab or group will burst into a configurable number of small bubbles that animate outwards.


## Prerequisites

Before installing this script, you need to have **`fx-autoconfig`** (or a similar method for loading `userChrome.js` scripts) set up in your Zen profile. This allows Zen to load custom JavaScript files.

If you haven't set this up, please refer to this repository : https://github.com/MrOtherGuy/fx-autoconfig

## Installation

1.  **Ensure Prerequisites are Met:** Verify that you have `fx-autoconfig` or a similar `userChrome.js` loader installed and working.
2.  **Download the Script:**
    *   Save the `tab_explode_animation.uc.js` file.
3.  **Place the Script:**
    *   Navigate to your Zen profile directory. You can usually find this by going to `about:support` in Zen and looking for "Profile Folder" or "Profile Directory".
    *   Inside your profile directory, find or create a folder named `chrome`.
    *   Inside the `chrome` folder, find or create a folder named `JS`.
    *   Place the `tab_explode_animation.uc.js` file into this `chrome/JS` folder.
    *   The final path should look something like: `[Your Zen Profile Folder]/chrome/JS/tab_explode_animation.uc.js`
4.  **Restart Zen:** For the script to be loaded, you need to restart Zen completely.

## Configuration

You can adjust the following constants at the top of the `tab_explode_animation.uc.js` file:

*   `BUBBLE_COUNT`: The number of bubbles to generate for each explosion (Default: `25`).
*   `ANIMATION_DURATION`: The duration of the explosion animation in milliseconds (Default: `600`).

---

Enjoy the bubbly tab closing experience! 
