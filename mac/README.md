# PIURA Modes

The signed local application handles the five `piura-modes://` links from the dashboard. macOS stays dark. Morning is light in ERP; Learning switches ERP to light and minimizes it. Mode colors control the physical office lights through the existing color-wheel handler, not ERP accent palettes. The unrelated sockets and HVAC are not switched by mode colors.

## Safari profiles

Create profiles named `Утро`, `Климат`, `Инвестиции`, `Обучение`, and `Наставничество` in Safari before use. Profile identity is verified from the native toolbar, not inferred from a shared Google URL. Profiles keep their own cookies; private Google pages can require a one-time sign-in.

- Morning: the supplied Admin Scale Drive folder and Ethical Program, pinned. The left Yandex window starts Yandex Music, then keeps it playing in a background tab while a full-screen two-column Goals + Plans preview stays visible above it.
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

Each mode uses three distinct wallpaper files, with a separate portrait composition on the right. Files are prepared early but desktop changes happen only after the fullscreen Spaces and foreground arrangement settle. They are applied and read back by native display ID; parallel wallpaper changes were rejected because Spaces could replace the result. See resources/WALLPAPERS.md, WALLPAPERS-modes7.md and WALLPAPERS-modes8.md for provenance and actual dimensions.

The final read-only audit checks that music has exactly one window and that it is on the left. Learning and Mentorship must have zero music windows. Playback observation never clicks a button; an initial Play is attempted at most once. Lighting failures are reported as partial completion, not silently marked successful.

For full timing runs only, the native Проверка menu has a `Сохранить Codex на время замеров` checkbox. This preserves the test host process (hidden in quiet modes); disable it after measurement. It does not relax any browser, music, wallpaper or Telegram checks. Use `node scripts/summarize-mode-benchmarks.mjs` for a filtered local timing summary; raw reports can contain private tab URLs.

The native Проверка menu checks browser layouts without quitting other applications or changing wallpaper. Full modes additionally change wallpaper, close other applications and start music where needed. Results are local in Application Support/PIURA Modes/Reports; avoid publishing these private reports or their browser URLs.

On this Mac, all five native Safari Start Pages were configured separately:
Suggestions, Privacy Report, Reading List and Recently Closed Tabs are hidden
(not deleted). Start Page backgrounds are Magic-Morning, Climate, Investments,
Learning-Left and Mentorship-Center. They are saved in Safari, so mode switching
does not reopen customization dialogs. The corresponding desktop wallpapers
remain separate and use each mode's per-monitor mapping.

## Local build

Measured full runs and remaining hardware limitations: [September 2 verification](MODE-TESTS-2026-09-02.md).

Run `npm run build:modes`, then install the reported app at the canonical `~/Applications/PIURA Modes.app`. The stable signing requirement preserves the app identity across builds. `npm test` and `npm run check` validate web integration and safety invariants.

Exact existing URLs for the additionally mentioned Perfect Money/fund and Interactive Brokers pages were not present in the inspected open profiles. No financial login URL is guessed or account created. The six confirmed investment pins are configured.
