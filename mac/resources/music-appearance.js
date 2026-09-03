// Local morning skin using Yandex Music's own semantic color tokens.
// Does not reload playback, change macOS appearance, or invert album artwork.
(mode => {
  const id='piura-music-morning', existing=document.getElementById(id);
  if(mode!=='morning'){existing?.remove();return JSON.stringify({theme:'original',light:false})}
  let style=existing;
  if(!style){style=document.createElement('style');style.id=id;document.head.append(style)}
  style.textContent=`
    :root,body,body.ym-dark-theme {
      color-scheme:light!important;
      --ym-background-color-primary-enabled-basic:#fff!important;
      --ym-background-color-primary-enabled-content:#f8faf7!important;
      --ym-background-color-primary-enabled-player:#edf3e9!important;
      --ym-background-color-primary-enabled-popover:#fff!important;
      --ym-background-color-primary-enabled-menu:rgba(255,255,255,.96)!important;
      --ym-background-color-primary-enabled-header:rgba(255,255,255,.8)!important;
      --ym-background-color-primary-enabled-vibe:linear-gradient(180deg,#fff,#f0f6e9)!important;
      --ym-controls-color-primary-text-enabled:#57604f!important;
      --ym-controls-color-primary-text-enabled_variant:#1c291a!important;
      --ym-controls-color-primary-text-vibe:linear-gradient(#1c291a,#44593d)!important;
      --ym-controls-color-primary-text-vibe_icon:#344d2d!important;
      --ym-controls-color-secondary-text-enabled:#606d58!important;
      --ym-controls-color-secondary-text-enabled_variant:#172612!important;
      --ym-controls-color-secondary-text-selected:#172612!important;
      --ym-controls-color-secondary-text-hovered:#172612!important;
      --ym-controls-color-secondary-on_default-enabled:#273821!important;
      --ym-controls-color-secondary-on_default-enabled_variant:#606d58!important;
      --ym-controls-color-secondary-on_default-hovered:#172612!important;
      --ym-controls-color-secondary-on_outline-enabled:#273821!important;
      --ym-controls-color-secondary-default-enabled:rgba(37,63,25,.07)!important;
      --ym-controls-color-secondary-default-hovered:rgba(37,63,25,.13)!important;
      --ym-controls-color-secondary-card-enabled:rgba(245,248,241,.94)!important;
      --ym-controls-color-secondary-card-hovered:#e9f1e0!important;
      --ym-slider-color-primary-enabled:#42573a!important;
      --ym-slider-color-primary-progress:rgba(30,50,20,.16)!important;
      --ym-logo-color-primary-enabled:#253b1c!important;
      --ym-logo-color-primary-text:#365022!important;
      --ym-surface-color-primary-enabled-entity:rgba(245,249,239,.88)!important;
      --ym-surface-color-primary-enabled-list:rgba(30,50,20,.06)!important;
      background-color:#fff!important;color:#1c291a!important;
    }
    body canvas {opacity:.12!important}
  `;
  const base=getComputedStyle(document.body).getPropertyValue('--ym-background-color-primary-enabled-basic').trim();
  return JSON.stringify({theme:'morning-light',light:base==='#fff',background:base});
})(PIURA_MODE)
