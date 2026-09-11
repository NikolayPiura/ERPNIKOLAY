// PIURA_BACKGROUND_WAVE_V2
// This file is injected by the installed Yandex Music media-key extension.
// The native app writes the requested command into the already-open background
// tab before firing the extension's global shortcut. No browser window is
// selected, moved, opened, or closed by this bridge.
var piuraCommand = document.documentElement.getAttribute('data-piura-music-command');
document.documentElement.removeAttribute('data-piura-music-command');

if (piuraCommand) {
    performPiuraMusicCommand(piuraCommand);
}

function performPiuraMusicCommand(command) {
    var candidates = Array.from(document.querySelectorAll('button,a,[role="button"]'));
    var vibeButtons = candidates.filter(function(element) {
        return String(element.className || '').includes('VibePlayerControls_');
    });
    var label = function(element) {
        return (element.getAttribute('aria-label') || element.title || element.textContent || '').trim().toLowerCase();
    };
    var visible = function(element) {
        var box = element.getBoundingClientRect();
        var style = getComputedStyle(element);
        return !element.disabled && box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    var find = function(words, pool) {
        return (pool || candidates).find(function(element) {
            var value = label(element);
            return visible(element) && words.some(function(word) { return value.includes(word); });
        });
    };

    if (command === 'wave') {
        var wave = find(['моя волна', 'my wave']);
        if (wave) wave.click();
        return;
    }

    if (command === 'next' || command === 'previous') {
        var words = command === 'next' ? ['следующ', 'next'] : ['предыдущ', 'previous'];
        var skipButton = find(words, vibeButtons.length ? vibeButtons : candidates);
        if (skipButton) skipButton.click();
        return;
    }

    var playButton = vibeButtons.find(function(element) {
        return String(element.className || '').includes('VibePlayerControls_playButton');
    });
    if (!playButton) {
        playButton = find(['воспроиз', 'пауза', 'play', 'pause'], candidates);
    }
    if (!playButton) {
        var legacyButtons = document.querySelectorAll('button.BaseSonataControlsDesktop_sonataButton__GbwFt');
        playButton = legacyButtons[2];
    }
    if (!playButton) return;

    var currentlyPlaying = !isPlayState(playButton);
    if (command === 'play' && currentlyPlaying) return;
    if (command === 'pause' && !currentlyPlaying) return;
    playButton.click();
    listenForPlayState(playButton);
    postButtonState(!isPlayState(playButton));
}

function isPlayState(button) {
    var label = (button.getAttribute('aria-label') || button.title || '').toLowerCase();
    if (label.includes('воспроиз') || label.includes('play')) return true;
    if (label.includes('пауза') || label.includes('pause')) return false;
    var svg = button.querySelector('svg use');
    if (!svg) return false;
    var href = svg.getAttribute('xlink:href') || svg.getAttribute('href');
    return !!href && href.includes('play');
}

function listenForPlayState(button) {
    var lastState = isPlayState(button);
    var observer = new MutationObserver(function() {
        var currentState = isPlayState(button);
        if (currentState !== lastState) {
            lastState = currentState;
            postButtonState(!currentState);
        }
    });
    observer.observe(button, {attributes: true, childList: true, subtree: true, attributeOldValue: true});
}

function postButtonState(isPlaying) {
    ['ofiimbenfigghacebjfkihnklgifkcnh', 'hjocpbbmnildbfmheenhbgopfobjlegj'].forEach(function(id) {
        chrome.runtime.sendMessage(id, {state: isPlaying ? 'Pause' : 'Play'});
    });
}
