# PIURA Modes

The signed local application handles the five `piura-modes://` links from the dashboard. macOS stays dark. Morning is light in ERP; Learning switches ERP to light and minimizes it. Each mode has its own ERP accent palette.

## Safari profiles

Create profiles named `Утро`, `Климат`, `Инвестиции`, `Обучение`, and `Наставничество` in Safari before use. Profile identity is verified from the native toolbar, not inferred from a shared Google URL. Profiles keep their own cookies; private Google pages can require a one-time sign-in.

- Morning: the supplied Admin Scale Drive folder and Ethical Program, pinned.
- Climate: the existing work profile and its work-table pin. TradingView is removed only after investment setup succeeds.
- Investments: five supplied sheets plus the observed TradingView URL, pinned. Existing pins are reused, redirect URLs are matched by document identity, and duplicates are removed.
- Learning: only the supplied Flag course.
- Mentorship: an empty tab in its own profile; the Climate pins are never removed.

Only the current profile window remains open. Before closing other browser windows, the app saves a private URL inventory under Application Support/PIURA Modes/SessionBackups (permissions 0600). Normal browser close/save confirmations are not dismissed. Other applications quit normally; unsaved documents are never force-discarded.

## Screens and verification

Exactly three connected screens are ordered physically left to right. Safari is native fullscreen in the center; ChatGPT is fullscreen on the left. Telegram uses macOS Full Screen Tile, not resized floating windows; both fullscreen flags and adjacent frames are checked. ERP stays right. Learning keeps only a minimized ERP window in Yandex.

Yandex ERP and music/policy windows are independently identified by immutable
browser IDs and full tab titles (window names may be ellipsized). Their exact AX
windows enter native fullscreen, with separate screen verification. Climate
keeps/opens Zoom and Notes; Mentorship keeps/opens Zoom without taking foreground.

Repeated runs reuse existing document windows, preserve a verified Telegram
Split View, skip unchanged wallpapers, and inventory Safari tabs once rather
than once per pin. ERP changes module/theme in place while preserving the cloud
connection URL. Local reports contain `durationSeconds` and per-phase `timings`.

Wallpapers use landscape/portrait resources per screen. They are applied and verified by the native display ID, including when a fullscreen Space is active. See resources/WALLPAPERS.md for provenance and actual dimensions.

The native Проверка menu checks browser layouts without quitting other applications or changing wallpaper. Full modes additionally change wallpaper, close other applications and start music where needed. Results are local in Application Support/PIURA Modes/Reports; avoid publishing these private reports or their browser URLs.

On this Mac, all five native Safari Start Pages were configured separately:
Suggestions, Privacy Report, Reading List and Recently Closed Tabs are hidden
(not deleted). Start Page backgrounds are Magic-Morning, Climate, Investments,
Learning-Left and Mentorship-Center. They are saved in Safari, so mode switching
does not reopen customization dialogs. The corresponding desktop wallpapers
remain separate and use each mode's per-monitor mapping.

## Local build

Run `npm run build:modes`, then install the reported app at the canonical `~/Applications/PIURA Modes.app`. The stable signing requirement preserves the app identity across builds. `npm test` and `npm run check` validate web integration and safety invariants.

Exact existing URLs for the additionally mentioned Perfect Money/fund and Interactive Brokers pages were not present in the inspected open profiles. No financial login URL is guessed or account created. The six confirmed investment pins are configured.
