var piuraCommand = document.documentElement.getAttribute('data-piura-music-command') || 'toggle';
document.documentElement.removeAttribute('data-piura-music-command');

var vibeButtons = Array.from(document.querySelectorAll('button')).filter(function(button) {
    return String(button.className || '').includes('VibePlayerControls_');
});

if (piuraCommand === 'next' || piuraCommand === 'previous') {
    var pattern = piuraCommand === 'next' ? /следующ|next/i : /предыдущ|previous/i;
    var skipButton = vibeButtons.find(function(button) {
        return pattern.test(button.getAttribute('aria-label') || button.title || '');
    });
    if (skipButton) skipButton.click();
} else {
    var playButton = document.querySelector('button[class*="VibePlayerControls_playButton"]');
    if (!playButton) {
        var legacyButtons = document.querySelectorAll('button.BaseSonataControlsDesktop_sonataButton__GbwFt');
        playButton = legacyButtons[2];
    }
    if (playButton) {
        playButton.click();
        listenForPlayState(playButton);
        postButtonState(!isPlayState(playButton));
    }
}

function isPlayState(button) {
    var label = (button.getAttribute('aria-label') || button.title || '').toLowerCase();
    if (label.includes('воспроиз') || label.includes('play')) return true;
    if (label.includes('пауза') || label.includes('pause')) return false;
    var svg = button.querySelector('svg use');
    if (!svg) return false;
    var href = svg.getAttribute('xlink:href');
    return href && href.includes('play_filled_l');
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
