import Cocoa
import ApplicationServices
import WebKit
import Darwin

private enum WorkMode: String {
    case morning, work, learning, mentorship
    static func resolve(_ value: String) -> WorkMode? {
        ["climate", "investments"].contains(value) ? .work : WorkMode(rawValue: value)
    }
    // Keep the existing Safari profile and its logins/pinned work tabs.
    var safariProfile: String { self == .work ? "Климат" : title }
    var title: String {
        switch self {
        case .morning: "Утро"
        case .work: "Работа"
        case .learning: "Обучение"
        case .mentorship: "Наставничество"
        }
    }
    var wallpaperResource: String {
        switch self {
        case .morning: "Magic-Morning"
        case .work: "Investments"
        case .learning: "Learning"
        case .mentorship: "Mentorship"
        }
    }
    var erpURL: String? {
        let base: String = switch self {
        case .morning: "https://nikolaypiura.github.io/ERPNIKOLAY/?module=morning&theme=light"
        case .work, .mentorship: "https://nikolaypiura.github.io/ERPNIKOLAY/?module=overview&theme=dark"
        case .learning: "https://nikolaypiura.github.io/ERPNIKOLAY/?module=overview&theme=light"
        }
        return base + "&workmode=" + rawValue
    }
    var needsTelegram: Bool { self == .work || self == .mentorship }
    var needsChatGPT: Bool { self == .work }
    // Morning and weekday work use the authenticated Yandex web player through
    // the ERP bridge. PIURA Modes never focuses or hides a separate music window.
    var needsMusic: Bool { self == .morning || self == .work }
    var needsZoom: Bool { self == .mentorship }
}
private struct DisplayTarget {
    let screen: NSScreen
    let rect: CGRect
    var bounds: String { "{\(Int(rect.minX)), \(Int(rect.minY)), \(Int(rect.maxX)), \(Int(rect.maxY))}" }
    var usableRect: CGRect {
        let v = screen.visibleFrame, f = screen.frame
        return CGRect(x: v.minX, y: rect.minY + f.maxY - v.maxY, width: v.width, height: v.height)
    }
    var usableBounds: String { let r = usableRect; return "{\(Int(r.minX)), \(Int(r.minY)), \(Int(r.maxX)), \(Int(r.maxY))}" }
}
private struct ModeResult { let ok: Bool; let message: String }
private final class WallpaperJob {
    var records: [[String: Any]] = []
    var expected: [(UInt32, String)] = []
}
final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var pageReady = false
    private var pendingLaunch: (WorkMode, Bool, String)?
    private var pendingMusicCommand: (String, String)?
    private var remoteCommandRunning = false
    private var requestID = ""
    private var runDeadline = Date.distantFuture
    private var startedAt = Date()
    private var phaseAt = Date()
    private var timings: [String: Double] = [:]
    private func markPhase(_ name: String) {
        timings[name] = (Date().timeIntervalSince(phaseAt) * 100).rounded() / 100
        phaseAt = Date()
        if let data = try? JSONSerialization.data(withJSONObject: ["phase":name,"elapsed":Date().timeIntervalSince(startedAt),"request":requestID]) {
            try? data.write(to: supportDirectory.appendingPathComponent("progress.json"), options:.atomic)
        }
    }
    private var launchConfigured = false
    private var safariWindowID = 0
    private var erpWindowID = 0
    private var leftWindowID = -1
    private var yandexWindowCache: [Int:AXUIElement] = [:]
    private var yandexMusicExtensionButton: AXUIElement?
    private var isModeRunning = false
    private var isPreviewRun = false
    private var verifiedWindows: [[String: Any]] = []
    private var menuTrace: [String] = []
    private let workspace = NSWorkspace.shared
    private let adminScaleURL = "https://drive.google.com/drive/u/0/folders/1wjAuLeNUYsIzeTrBJPDWbKXQAIGKZUPG"
    private let workTableURL = "https://docs.google.com/spreadsheets/d/1tZFDTfb0AtUB5l7I5KbSSUUUaNOP6ux7M9SWYHb4BMc/edit?gid=720489481#gid=720489481"
    private let erpBaseURL = "https://nikolaypiura.github.io/ERPNIKOLAY/"
    private let musicURL = "https://music.yandex.ru/"
    private let morningAdminPreviewBaseURL = "https://nikolaypiura.github.io/ERPNIKOLAY/morning-admin-preview.html"
    private var morningAdminPreviewURL: String { morningAdminPreviewBaseURL + "?build=20260911-batch19" }
    private let ethicalProgramURL = "https://docs.google.com/spreadsheets/d/1y7rhjj0b__Rng1b8K0RndbnfV2I2Lfy4BMGCplgmZWU/edit?gid=0#gid=0"
    private let tradingViewURL = "https://ru.tradingview.com/symbols/USDRUB/"
    private let policyURL = "https://nikolaypiura.github.io/ERPNIKOLAY/communication-policy.html"
    private let courseURL = "https://extension.flag.today/course/8ad3b992482ce35a3a4357adf3ef54251331cd5326808a871e41e8a0d566f84d/complete?savedLesson=%D0%A3%D1%80%D0%BE%D0%BA%20%D0%BD%D0%BE%D0%BC%D0%B5%D1%80%207"
    private let investmentURLs = [
        "https://docs.google.com/spreadsheets/d/1EmXh84m_H_4I--AbL2tRxBoONr6uTg1CxlyQpiSrFlA/edit?gid=1710033294#gid=1710033294",
        "https://docs.google.com/spreadsheets/d/1GWFyFKRVq1Z4x68gWICBmlilqP5FzYOXXBkC4xYzEbA/edit?gid=123675552#gid=123675552",
        "https://docs.google.com/spreadsheets/d/13ju_0mu-jHpAE73ZTMwdGKEGxDYvBXcn7EcsO4TTTMc/edit?gid=925953727#gid=925953727",
        "https://docs.google.com/spreadsheets/d/1ZrjETAPuytFmxlPtNShmYUMqMfDttltG51_MUrxN2dg/edit?gid=1180642012#gid=1180642012",
        "https://docs.google.com/spreadsheets/d/1EyNYpTSY9ofBIlBGhovu329VXXPBU5JQI5DvfBmHHuM/edit?gid=833941911#gid=833941911"
    ]
    private let telegramIDs = ["ru.keepcoder.Telegram", "org.telegram.desktop"]

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        configureMenu()
        configureWindow()
        launchConfigured = true
        if let (command, id) = pendingMusicCommand {
            pendingMusicCommand = nil
            performMusicCommand(command, id: id)
            return
        }
        if let (mode, preview, id) = pendingLaunch {
            pendingLaunch = nil
            beginMode(mode, preview: preview, id: id)
        }
    }
    // Native Split View temporarily hides this panel while macOS presents its
    // second-window chooser. Keep the process alive until the mode finishes.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { !isModeRunning && !remoteCommandRunning }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return true
    }
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first(where: { $0.scheme == "piura-modes" }), let host = url.host else { return }
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let id = components?.queryItems?.first(where: { $0.name == "request" })?.value ?? UUID().uuidString
        if host == "music" {
            let command = components?.queryItems?.first(where: { $0.name == "action" })?.value ?? "toggle"
            requestID = id
            guard launchConfigured else { pendingMusicCommand = (command, id); return }
            performMusicCommand(command, id: id)
            return
        }
        guard let mode = WorkMode.resolve(host) else { return }
        let preview = components?.queryItems?.contains(where: { $0.name == "preview" && $0.value == "1" }) ?? false
        guard launchConfigured else { pendingLaunch = (mode, preview, id); return }
        beginMode(mode, preview: preview, id: id)
    }
    private func configureMenu() {
        let bar = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu(title: "PIURA Modes")
        appMenu.addItem(withTitle: "Завершить PIURA Modes", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        bar.addItem(appItem)
        let diagnosticsItem = NSMenuItem()
        let diagnostics = NSMenu(title: "Проверка")
        for (title, action, key) in [
            ("Расположение «Утро»", #selector(previewMorning), "1"),
            ("Расположение «Работа»", #selector(previewWork), "2"),
            ("Расположение «Обучение»", #selector(previewLearning), "4"),
            ("Расположение «Наставничество»", #selector(previewMentorship), "5")
        ] {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
            item.keyEquivalentModifierMask = [.command, .shift]
            item.target = self
            diagnostics.addItem(item)
        }
        diagnosticsItem.submenu = diagnostics
        let benchmark = NSMenuItem(title: "Сохранить Codex на время замеров", action: #selector(toggleBenchmarkHost(_:)), keyEquivalent: "")
        benchmark.target = self
        benchmark.state = UserDefaults.standard.bool(forKey: "benchmarkKeepCodex") ? .on : .off
        diagnostics.addItem(.separator()); diagnostics.addItem(benchmark)
        bar.addItem(diagnosticsItem)
        NSApp.mainMenu = bar
    }
    @objc private func previewMorning() { if pageReady { beginMode(.morning, preview: true) } }
    @objc private func toggleBenchmarkHost(_ sender: NSMenuItem) {
        let enabled = sender.state != .on
        sender.state = enabled ? .on : .off
        UserDefaults.standard.set(enabled, forKey: "benchmarkKeepCodex")
    }
    @objc private func previewWork() { if pageReady { beginMode(.work, preview: true) } }
    @objc private func previewLearning() { if pageReady { beginMode(.learning, preview: true) } }
    @objc private func previewMentorship() { if pageReady { beginMode(.mentorship, preview: true) } }
    private func configureWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(self, name: "piura")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        let visible = (display(named: "Studio Display") ?? display(at: 0))?.screen.visibleFrame
            ?? NSRect(x: 0, y: 0, width: 1200, height: 820)
        let width = min(1320, visible.width - 80), height = min(760, visible.height - 80)
        let frame = NSRect(x: visible.midX - width / 2, y: visible.midY - height / 2, width: width, height: height)
        window = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "PIURA · Режимы"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.appearance = NSAppearance(named: .darkAqua)
        window.isMovableByWindowBackground = true
        window.contentView = webView
        guard let url = Bundle.main.url(forResource: "modes", withExtension: "html") else { return }
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self, !self.isModeRunning, !self.remoteCommandRunning, self.requestID.isEmpty else { return }
            self.window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "piura", let body = message.body as? [String: Any] else { return }
        if body["action"] as? String == "music" {
            let command = body["command"] as? String ?? "toggle"
            performMusicCommand(command, id: body["requestID"] as? String ?? UUID().uuidString)
            return
        }
        guard let raw = body["mode"] as? String, let mode = WorkMode.resolve(raw) else { return }
        beginMode(mode, preview: body["preview"] as? Bool ?? false, id: body["requestID"] as? String ?? UUID().uuidString)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
    }
    private func beginMode(_ mode: WorkMode, preview: Bool, id: String = UUID().uuidString) {
        // Keep the most recent intent instead of discarding clicks during launch.
        guard !isModeRunning else { pendingLaunch = (mode, preview, id); return }
        requestID = id
        isPreviewRun = preview
        isModeRunning = true
        startedAt = Date(); phaseAt = startedAt; timings = [:]
        runDeadline = Date().addingTimeInterval(150)
        webView.evaluateJavaScript("window.piuraModeStarted('\(mode.rawValue)',\(preview))")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak self] in
            guard let self else { return }
            if !preview {
                self.window.orderOut(nil)
                NSApp.setActivationPolicy(.accessory)
            }
            let result = self.runMode(mode, preview: preview)
            self.writeReport(mode: mode, preview: preview, result: result)
            self.runDeadline = min(self.runDeadline, Date().addingTimeInterval(5))
            self.finishInWebView(result)
            self.isModeRunning = false
            if let (next, nextPreview, nextID) = self.pendingLaunch {
                self.pendingLaunch = nil
                self.beginMode(next, preview: nextPreview, id: nextID)
                return
            }
            if let (command, commandID) = self.pendingMusicCommand {
                self.pendingMusicCommand = nil
                self.performMusicCommand(command, id: commandID)
                return
            }
            if !preview {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    if !self.isModeRunning && self.requestID == id { NSApp.terminate(nil) }
                }
            }
        }
    }
    private func performMusicCommand(_ command: String, id: String) {
        let allowed = ["toggle", "play", "pause", "wave", "next", "previous", "status"]
        guard allowed.contains(command) else {
            deliverMusicResult(["ok":false,"message":"Неизвестная команда музыки.","requestID":id])
            return
        }
        guard !isModeRunning, !remoteCommandRunning else {
            pendingMusicCommand = (command, id)
            return
        }
        requestID = id
        remoteCommandRunning = true
        window.orderOut(nil)
        NSApp.setActivationPolicy(.accessory)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            guard let self else { return }
            var payload: [String: Any]
            do {
                payload = try self.controlYandexMusic(command)
                payload["ok"] = true
            } catch {
                payload = ["ok":false,"message":error.localizedDescription]
            }
            payload["requestID"] = id
            self.writeMusicReport(payload)
            self.deliverMusicResult(payload)
            self.remoteCommandRunning = false
            if let (next, nextID) = self.pendingMusicCommand {
                self.pendingMusicCommand = nil
                self.performMusicCommand(next, id: nextID)
                return
            }
            // Stay resident as an accessory after the first command. Subsequent
            // Play/Pause presses then reuse the same native bridge instead of
            // cold-launching another process, while no window or Dock icon is shown.
        }
    }
    private func writeMusicReport(_ payload: [String: Any]) {
        let allowed = ["ok", "message", "state", "command", "requestID", "backgroundTabCreated", "diagnostic", "artist", "title"]
        let report = payload.filter { allowed.contains($0.key) }
        try? FileManager.default.createDirectory(at: supportDirectory, withIntermediateDirectories: true)
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: supportDirectory.appendingPathComponent("last-music.json"), options: .atomic)
        }
    }
    private func controlYandexMusic(_ command: String) throws -> [String: Any] {
        try repairYandexMusicExtension()
        guard workspace.runningApplications.contains(where: {
            $0.bundleIdentifier == "ru.yandex.desktop.yandex-browser" && !$0.isTerminated
        }) else {
            throw modeError("Сначала включите режим — фоновый плеер подготовится автоматически.")
        }
        // Keep the authenticated Yandex Music session in a background tab of
        // the already-visible ERP window. Creating/selecting browser windows is
        // deliberately forbidden here: Play/Pause must not flash Yandex UI.
        let location = try runAppleScript("""
        tell application "Yandex"
          set erpID to -1
          set erpTab to -1
          set musicID to -1
          set musicTab to -1
          set createdTab to false
          repeat with w in every window
            set tabNumber to 0
            repeat with t in every tab of w
              set tabNumber to tabNumber + 1
              set u to URL of t
              if erpID is -1 and (u is "\(erpBaseURL)" or u starts with "\(erpBaseURL)?" or u starts with "\(erpBaseURL)index.html") then
                set erpID to id of w
                set erpTab to tabNumber
              end if
              if musicID is -1 and u starts with "\(musicURL)" then
                set musicID to id of w
                set musicTab to tabNumber
              end if
            end repeat
          end repeat
          if erpID is -1 then error "ERP window is not available"
          if musicID is -1 then
            tell window id erpID
              make new tab at end of tabs with properties {URL:"\(musicURL)"}
              set musicTab to count of tabs
            end tell
            set musicID to erpID
            set createdTab to true
          end if
          -- ERP is the immutable visible surface on the right monitor. Music
          -- and accidental sale pages may remain loaded, but never active.
          set active tab index of window id erpID to erpTab
          set minimized of window id erpID to false
          if musicID is not erpID then set minimized of window id musicID to true
          return (musicID as text) & "," & (musicTab as text) & "," & (createdTab as text) & "," & (erpID as text) & "," & (erpTab as text)
        end tell
        """)
        let parts = location.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count == 5, let windowID = Int(parts[0]), let tabNumber = Int(parts[1]),
              let visibleERPWindowID = Int(parts[3]), let visibleERPTabNumber = Int(parts[4]) else {
            throw modeError("Не удалось подготовить фоновую вкладку Яндекс Музыки.")
        }
        defer {
            // A final invariant, including error paths: the right monitor must
            // show ERP, never Music, sale, or another background tab.
            _ = try? runAppleScript("tell application \"Yandex\" to set active tab index of window id \(visibleERPWindowID) to \(visibleERPTabNumber)")
        }
        func execute(_ javascript: String) throws -> String {
            try runAppleScript("tell application \"Yandex\" to return execute tab \(tabNumber) of window id \(windowID) javascript \"\(appleScriptEscape(javascript))\"")
        }
        let readState = """
        (() => {
          const buttons=[...document.querySelectorAll('button')];
          const controls=buttons.filter(button=>String(button.className||'').includes('VibePlayerControls_'));
          const labels=controls.map(button=>(button.getAttribute('aria-label')||button.title||'').toLowerCase());
          const play=labels.some(label=>label.includes('воспроиз')||label.includes('play'));
          const pause=labels.some(label=>label.includes('пауза')||label.includes('pause'));
          const api=window.externalAPI;
          let apiPlaying=null,track=null;
          try{if(typeof api?.isPlaying==='function')apiPlaying=!!api.isPlaying();if(typeof api?.getCurrentTrack==='function')track=api.getCurrentTrack()}catch{}
          const mediaPlaying=[...document.querySelectorAll('audio,video')].some(item=>!item.paused&&!item.ended);
          const sessionState=navigator.mediaSession?.playbackState||'';
          const playing=apiPlaying??(sessionState==='playing'||mediaPlaying||(sessionState!=='paused'&&controls.length&&pause&&!play));
          const metadata=navigator.mediaSession?.metadata;
          const trackArtists=Array.isArray(track?.artists)?track.artists.map(item=>item?.title||item?.name||'').filter(Boolean).join(', '):'';
          const artist=(trackArtists||metadata?.artist||'').trim();
          return JSON.stringify({ready:!!(controls.length||typeof api?.togglePause==='function'||document.querySelector('audio,video')),state:playing?'playing':'paused',title:track?.title||metadata?.title||'',artist:artist&&!/яндекс|yandex/i.test(artist)?artist:'Исполнитель'});
        })()
        """
        var before: [String: Any]?
        let readyDeadline = Date().addingTimeInterval(parts[2] == "true" ? 10 : 3)
        repeat {
            if let data = try? execute(readState).data(using: .utf8),
               let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               value["ready"] as? Bool == true { before = value; break }
            pumpRunLoop(0.2)
        } while Date() < readyDeadline
        guard var result = before else { throw modeError("Фоновый плеер Яндекс Музыки ещё не загрузился.") }
        result.removeValue(forKey: "ready")
        result["command"] = command
        result["backgroundTabCreated"] = parts[2] == "true"
        let wasPlaying = result["state"] as? String == "playing"
        if command == "status" || (command == "play" && wasPlaying) || (command == "pause" && !wasPlaying) { return result }

        // Only use the installed global controller while ERP remains the active
        // tab. Yandex may reject cold-start autoplay; in that case report the
        // limitation and never expose or activate the Music tab.
        _ = try execute("document.documentElement.setAttribute('data-piura-music-command','\(command)');'ready'")
        _ = try runNativeAppleScript("tell application \"System Events\" to key code 40 using control down")
        let expectedState = ["play", "wave"].contains(command) ? "playing" :
            (command == "pause" ? "paused" : (command == "toggle" ? (wasPlaying ? "paused" : "playing") : nil))
        let oldTitle = result["title"] as? String ?? ""
        let confirmationDeadline = Date().addingTimeInterval(command == "wave" ? 8 : 4)
        repeat {
            pumpRunLoop(0.2)
            if let data = try? execute(readState).data(using: .utf8),
               let updated = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                result = updated
                let confirmed = expectedState.map { result["state"] as? String == $0 }
                    ?? ((result["title"] as? String ?? "") != oldTitle)
                if confirmed { break }
            }
        } while Date() < confirmationDeadline
        if let expectedState, result["state"] as? String != expectedState {
            throw modeError(expectedState == "playing" ? "Яндекс Музыка не подтвердила запуск." : "Яндекс Музыка не подтвердила паузу.")
        }
        if expectedState == nil, (result["title"] as? String ?? "") == oldTitle {
            throw modeError("Яндекс Музыка не подтвердила переключение трека.")
        }
        result.removeValue(forKey: "ready")
        result["command"] = command
        result["backgroundTabCreated"] = parts[2] == "true"
        return result
    }
    private func postYandexPlayPauseShortcut() throws {
        // The installed Yandex Music controller has its global Play/Pause
        // command assigned to Ctrl+K in the browser profile. Posting that exact
        // shortcut reaches the extension while Safari/ERP remains frontmost.
        let source = CGEventSource(stateID: .hidSystemState)
        guard let down = CGEvent(keyboardEventSource: source, virtualKey: 40, keyDown: true),
              let up = CGEvent(keyboardEventSource: source, virtualKey: 40, keyDown: false) else {
            throw modeError("macOS не создала команду Play/Pause.")
        }
        down.flags = [.maskControl]
        up.flags = [.maskControl]
        down.post(tap: .cghidEventTap)
        pumpRunLoop(0.03)
        up.post(tap: .cghidEventTap)
    }
    private func pressYandexMusicExtensionToolbar() throws {
        if let cached = yandexMusicExtensionButton,
           AXUIElementPerformAction(cached, kAXPressAction as CFString) == .success {
            pumpRunLoop(0.1)
            return
        }
        yandexMusicExtensionButton = nil
        guard let yandex = workspace.runningApplications.first(where: {
            $0.bundleIdentifier == "ru.yandex.desktop.yandex-browser" && !$0.isTerminated
        }) else { throw modeError("Яндекс Браузер не найден для управления музыкой.") }
        let root = AXUIElementCreateApplication(yandex.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 1)
        var rawWindows: CFTypeRef?
        _ = AXUIElementCopyAttributeValue(root, kAXWindowsAttribute as CFString, &rawWindows)
        let stop = Date().addingTimeInterval(3)
        var queue = (rawWindows as? [AXUIElement] ?? []).map { ($0, 0) }
        var visited = 0
        let extensionTitle = "play/pause button for yandex music"
        while !queue.isEmpty, visited < 8_000, Date() < stop {
            let (element, depth) = queue.removeFirst()
            visited += 1
            let searchable = [kAXTitleAttribute, kAXDescriptionAttribute, kAXHelpAttribute]
                .map { axString(element, $0).lowercased() }.joined(separator: " ")
            let compact = searchable.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
            let labels = ["play", "pause", "воспроизведение", "пауза"]
            let isControl = searchable.contains(extensionTitle)
                || labels.contains(where: { compact == $0 || compact.hasPrefix($0 + " ") })
            if isControl, AXUIElementPerformAction(element, kAXPressAction as CFString) == .success {
                yandexMusicExtensionButton = element
                pumpRunLoop(0.1)
                return
            }
            let role = axString(element, kAXRoleAttribute)
            guard depth < 14, role != "AXWebArea", role != kAXScrollAreaRole else { continue }
            var rawChildren: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &rawChildren) == .success,
               let children = rawChildren as? [AXUIElement] {
                queue.append(contentsOf: children.map { ($0, depth + 1) })
            }
        }
        throw modeError("Не найдена фоновая кнопка управления Яндекс Музыкой.")
    }
    private func pressHiddenYandexMusicControl(
        windowID: Int,
        tabNumber: Int,
        command: String,
        visibleERPWindowID: Int,
        visibleERPTabNumber: Int
    ) throws {
        guard let yandex = workspace.runningApplications.first(where: {
            $0.bundleIdentifier == "ru.yandex.desktop.yandex-browser" && !$0.isTerminated
        }) else { throw modeError("Яндекс Браузер не найден для управления музыкой.") }
        let previousFront = workspace.frontmostApplication
        let marker = "PIURA-HIDDEN-MUSIC-\(UUID().uuidString)"
        let words: String
        switch command {
        case "wave": words = "['моя волна','my wave']"
        case "next": words = "['следующ','next']"
        case "previous": words = "['предыдущ','previous']"
        default: words = "[]"
        }
        let markControl = """
        (()=>{const candidates=[...document.querySelectorAll('button,a,[role="button"]')];const visible=e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return !e.disabled&&b.width>0&&b.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=e=>(e.getAttribute('aria-label')||e.title||e.textContent||'').trim().toLowerCase();const words=\(words);const target=\(command == "wave" || command == "next" || command == "previous" ? "candidates.find(e=>visible(e)&&words.some(word=>label(e).includes(word)))" : "candidates.find(e=>visible(e)&&String(e.className||'').includes('VibePlayerControls_playButton'))||candidates.find(e=>visible(e)&&/воспроиз|пауза|play|pause/i.test(label(e)))");if(!target)return JSON.stringify({ready:false,labels:candidates.filter(visible).map(label).filter(Boolean).slice(-40)});target.dataset.piuraHiddenMusic='true';target.dataset.piuraOriginalAria=target.getAttribute('aria-label')||'';target.setAttribute('aria-label','\(marker)');target.focus({preventScroll:true});return JSON.stringify({ready:true,tag:target.tagName,label:label(target)})})()
        """
        let cleanup = """
        (()=>{const target=document.querySelector('[data-piura-hidden-music="true"]');if(!target)return 'gone';const original=target.dataset.piuraOriginalAria||'';target.removeAttribute('data-piura-hidden-music');delete target.dataset.piuraOriginalAria;if(original)target.setAttribute('aria-label',original);else target.removeAttribute('aria-label');return 'clean'})()
        """
        let executePrefix = "tell application \"Yandex\" to return execute tab \(tabNumber) of window id \(windowID) javascript "
        guard setSkyLightWindowAlpha(UInt32(windowID), 0.001) else {
            throw modeError("macOS не разрешила скрытое управление музыкой.")
        }
        defer {
            _ = try? runAppleScript(executePrefix + "\"\(appleScriptEscape(cleanup))\"")
            _ = try? runAppleScript("""
            tell application "Yandex"
              set visible of window id \(windowID) to false
              set active tab index of window id \(visibleERPWindowID) to \(visibleERPTabNumber)
              set minimized of window id \(visibleERPWindowID) to false
            end tell
            """)
            _ = setSkyLightWindowAlpha(UInt32(windowID), 1)
            if let previousFront, !previousFront.isTerminated { previousFront.activate(options: []) }
        }
        _ = try runAppleScript("""
        tell application "Yandex"
          set active tab index of window id \(windowID) to \(tabNumber)
          set minimized of window id \(windowID) to false
          set visible of window id \(windowID) to true
          set index of window id \(windowID) to 1
          activate
        end tell
        """)
        var marked = ""
        let markDeadline = Date().addingTimeInterval(command == "wave" ? 8 : 4)
        repeat {
            marked = (try? runAppleScript(executePrefix + "\"\(appleScriptEscape(markControl))\"")) ?? ""
            if marked.contains("\"ready\":true") { break }
            pumpRunLoop(0.2)
        } while Date() < markDeadline
        guard marked.contains("\"ready\":true") else {
            throw modeError(command == "wave" ? "Кнопка «Моя волна» ещё не загрузилась." : "Кнопка плеера Яндекс Музыки не найдена.")
        }
        pumpRunLoop(0.15)
        let root = AXUIElementCreateApplication(yandex.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 1)
        func pressMarkedControl(timeout: TimeInterval) -> Bool {
            let stop = Date().addingTimeInterval(timeout)
            repeat {
                var rawWindows: CFTypeRef?
                _ = AXUIElementCopyAttributeValue(root, kAXWindowsAttribute as CFString, &rawWindows)
                var queue = (rawWindows as? [AXUIElement] ?? []).map { ($0, 0) }
                var visited = 0
                while !queue.isEmpty, visited < 14_000, Date() < stop {
                    let (element, depth) = queue.removeFirst()
                    visited += 1
                    let matches = [kAXTitleAttribute, kAXDescriptionAttribute, kAXIdentifierAttribute]
                        .contains(where: { axString(element, $0) == marker })
                    if matches {
                        if AXUIElementPerformAction(element, kAXPressAction as CFString) == .success { return true }
                        // Some Yandex links expose the marked element but omit
                        // AXPress. The DOM target was focused before traversal;
                        // Return is the equivalent trusted activation and the
                        // transparent helper remains the active surface.
                        let source = CGEventSource(stateID: .hidSystemState)
                        if let down = CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: true),
                           let up = CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: false) {
                            down.post(tap: .cghidEventTap)
                            pumpRunLoop(0.03)
                            up.post(tap: .cghidEventTap)
                            return true
                        }
                        return false
                    }
                    guard depth < 22 else { continue }
                    var rawChildren: CFTypeRef?
                    if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &rawChildren) == .success,
                       let children = rawChildren as? [AXUIElement] {
                        queue.append(contentsOf: children.map { ($0, depth + 1) })
                    }
                }
                pumpRunLoop(0.12)
            } while Date() < stop
            return false
        }
        guard pressMarkedControl(timeout: 4) else {
            throw modeError("Скрытая кнопка Яндекс Музыки недоступна.")
        }
        pumpRunLoop(0.35)
        if command == "wave" {
            let alreadyPlaying = (try? runAppleScript(executePrefix + "\"navigator.mediaSession?.playbackState||''\"")) == "playing"
            if alreadyPlaying { return }
            _ = try? runAppleScript(executePrefix + "\"\(appleScriptEscape(cleanup))\"")
            let markPlay = """
            (()=>{const candidates=[...document.querySelectorAll('button,[role="button"]')];const visible=e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return !e.disabled&&b.width>0&&b.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=e=>(e.getAttribute('aria-label')||e.title||e.textContent||'').trim().toLowerCase();const target=candidates.find(e=>visible(e)&&String(e.className||'').includes('VibePlayerControls_playButton'))||candidates.find(e=>visible(e)&&/воспроиз|play/i.test(label(e)));if(!target)return JSON.stringify({ready:false});target.dataset.piuraHiddenMusic='true';target.dataset.piuraOriginalAria=target.getAttribute('aria-label')||'';target.setAttribute('aria-label','\(marker)');target.focus({preventScroll:true});return JSON.stringify({ready:true,label:label(target)})})()
            """
            var playMarked = ""
            let playDeadline = Date().addingTimeInterval(8)
            repeat {
                playMarked = (try? runAppleScript(executePrefix + "\"\(appleScriptEscape(markPlay))\"")) ?? ""
                if playMarked.contains("\"ready\":true") { break }
                pumpRunLoop(0.2)
            } while Date() < playDeadline
            guard playMarked.contains("\"ready\":true"), pressMarkedControl(timeout: 4) else {
                throw modeError("Яндекс Музыка не отдала кнопку запуска «Моей волны».")
            }
        }
        pumpRunLoop(0.2)
    }
    private func postSystemMediaKey(_ keyCode: Int) throws {
        func event(state: Int) -> CGEvent? {
            NSEvent.otherEvent(
                with: .systemDefined,
                location: .zero,
                // Media-key events carry their down/up phase in both the
                // system-defined payload and modifier flags. Chromium ignores
                // synthetic events that omit the matching phase flags.
                modifierFlags: NSEvent.ModifierFlags(rawValue: UInt(state << 8)),
                timestamp: ProcessInfo.processInfo.systemUptime,
                windowNumber: 0,
                context: nil,
                subtype: 8,
                data1: (keyCode << 16) | (state << 8),
                data2: -1
            )?.cgEvent
        }
        guard let down = event(state: 0xA), let up = event(state: 0xB) else {
            throw modeError("macOS не создала системную медиакоманду.")
        }
        down.post(tap: .cghidEventTap)
        pumpRunLoop(0.03)
        up.post(tap: .cghidEventTap)
    }
    private func legacyControlYandexMusic(_ command: String) throws -> [String: Any] {
        try repairYandexMusicExtension()
        guard try runningApplication("ru.yandex.desktop.yandex-browser", launch: true) != nil else {
            throw modeError("Яндекс Браузер не найден.")
        }
        let location = try runAppleScript("""
        tell application "Yandex"
          set musicID to -1
          set musicTab to -1
          set createdWindow to false
          repeat with w in every window
            set tabNumber to 0
            repeat with t in every tab of w
              set tabNumber to tabNumber + 1
              if URL of t starts with "\(musicURL)" then
                set musicID to id of w
                set musicTab to tabNumber
                if (count of tabs of w) is 1 then
                  set minimized of w to true
                end if
                exit repeat
              end if
            end repeat
            if musicID is not -1 then exit repeat
          end repeat
          if musicID is -1 then
            set musicID to id of (make new window)
            set URL of active tab of window id musicID to "\(musicURL)"
            set musicTab to 1
            set minimized of window id musicID to true
            set createdWindow to true
          end if
          return (musicID as text) & "," & (musicTab as text) & "," & (createdWindow as text)
        end tell
        """)
        let parts = location.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count == 3, let windowID = Int(parts[0]), let tabNumber = Int(parts[1]) else {
            throw modeError("Не удалось найти вкладку Яндекс Музыки.")
        }
        func execute(_ javascript: String) throws -> String {
            try runAppleScript("tell application \"Yandex\" to return execute tab \(tabNumber) of window id \(windowID) javascript \"\(appleScriptEscape(javascript))\"")
        }
        let readState = """
        (() => {
          const allButtons=[...document.querySelectorAll('button')];
          const globalButtons=allButtons.filter(button=>String(button.className||'').includes('VibePlayerControls_'));
          const buttons=globalButtons.length?globalButtons:allButtons;
          const visible=element=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return !element.disabled&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&style.pointerEvents!=='none'};
          const label=button=>(button.getAttribute('aria-label')||button.title||'').toLowerCase();
          const find=words=>buttons.find(button=>visible(button)&&words.some(word=>label(button).includes(word)));
          const play=find(['воспроиз','play']),pause=find(['пауза','pause']);
          const media=[...document.querySelectorAll('audio,video')];
          const mediaPlaying=media.some(item=>!item.paused&&!item.ended);
          const sessionState=navigator.mediaSession?.playbackState;
          const api=window.externalAPI;
          let apiPlaying=null,track=null;
          try{if(typeof api?.isPlaying==='function')apiPlaying=!!api.isPlaying();if(typeof api?.getCurrentTrack==='function')track=api.getCurrentTrack()}catch{}
          /* Yandex Media Session may lag behind its global player button. */
          const playing=apiPlaying??(globalButtons.length?!!pause&&!play:(mediaPlaying||sessionState==='playing'));
          const metadata=navigator.mediaSession?.metadata;
          const trackArtists=Array.isArray(track?.artists)?track.artists.map(item=>item?.title||item?.name||'').filter(Boolean).join(', '):'';
          const artist=(trackArtists||metadata?.artist||'').trim();
          const usefulArtist=artist&&!/яндекс|yandex/i.test(artist)?artist:'Исполнитель';
          const externalMethods=['isPlaying','togglePause','play','pause','next','prev','getCurrentTrack'].filter(name=>typeof api?.[name]==='function');
          const result={ready:!!(externalMethods.length||play||pause||media.length),state:playing?'playing':'paused',title:track?.title||metadata?.title||'',artist:usefulArtist};
          if('\(command)'==='status')result.diagnostic={controls:buttons.filter(visible).map(button=>({label:label(button),className:String(button.className||''),testid:button.getAttribute('data-testid')||''})).filter(item=>/воспроиз|play|пауза|pause|следующ|next|предыдущ|previous/.test(item.label)).slice(0,20),globalControls:globalButtons.length,media:media.map(item=>({paused:item.paused,ended:item.ended,readyState:item.readyState,muted:item.muted,volume:item.volume})),sessionState:sessionState||'',externalMethods};
          return JSON.stringify(result);
        })()
        """
        var state: [String: Any]?
        let readyDeadline = Date().addingTimeInterval(8)
        repeat {
            if let data = try? execute(readState).data(using: .utf8),
               let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               value["ready"] as? Bool == true { state = value; break }
            pumpRunLoop(0.35)
        } while Date() < readyDeadline
        guard var before = state else { throw modeError("Яндекс Музыка ещё не загрузила плеер.") }
        let requestedVolume = command.hasPrefix("volume:") ? Int(command.dropFirst("volume:".count)) : nil
        if let requestedVolume {
            _ = try runNativeAppleScript("set volume output volume \(requestedVolume)")
        }
        let outputVolume = Int((try? runNativeAppleScript("get output volume of (get volume settings)")) ?? "") ?? requestedVolume ?? 50
        before["volume"] = outputVolume
        if command == "status" || requestedVolume != nil {
            before.removeValue(forKey: "ready")
            before["command"] = command
            before["hiddenWindowCreated"] = parts[2] == "true"
            return before
        }
        let actionScript = """
        (() => {
          const action='\(command)';
          const allButtons=[...document.querySelectorAll('button')];
          const globalButtons=allButtons.filter(button=>String(button.className||'').includes('VibePlayerControls_'));
          const buttons=globalButtons.length?globalButtons:allButtons;
          const visible=element=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return !element.disabled&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&style.pointerEvents!=='none'};
          const label=button=>(button.getAttribute('aria-label')||button.title||'').toLowerCase();
          const find=words=>buttons.find(button=>visible(button)&&words.some(word=>label(button).includes(word)));
          const pause=find(['пауза','pause']),play=find(['воспроиз','play']);
          const media=[...document.querySelectorAll('audio,video')];
          const sessionState=navigator.mediaSession?.playbackState;
          const api=window.externalAPI;
          let apiPlaying=null;
          try{if(typeof api?.isPlaying==='function')apiPlaying=!!api.isPlaying()}catch{}
          const playing=apiPlaying??(globalButtons.length?!!pause&&!play:(media.some(item=>!item.paused&&!item.ended)||sessionState==='playing'));
          try{
            if(action==='toggle'&&typeof api?.togglePause==='function'){api.togglePause();return JSON.stringify({clicked:true,mechanism:'externalAPI',expectedState:playing?'paused':'playing'})}
            if(action==='next'&&typeof api?.next==='function'){api.next();return JSON.stringify({clicked:true,mechanism:'externalAPI'})}
            if(action==='previous'&&typeof api?.prev==='function'){api.prev();return JSON.stringify({clicked:true,mechanism:'externalAPI'})}
          }catch{}
          const target=action==='toggle'?(playing?pause:play):(action==='next'?find(['следующ','next']):find(['предыдущ','previous']));
          if(!target)return JSON.stringify({clicked:false});
          return JSON.stringify({clicked:true,mechanism:'accessibility',expectedState:action==='toggle'?(playing?'paused':'playing'):null});
        })()
        """
        guard let actionData = try execute(actionScript).data(using: .utf8),
              let action = try? JSONSerialization.jsonObject(with: actionData) as? [String: Any],
              action["clicked"] as? Bool == true else { throw modeError("Кнопка плеера Яндекс Музыки не найдена.") }
        if command == "toggle", before["state"] as? String == "paused" {
            _ = try? runNativeAppleScript("set volume without output muted")
        }
        if action["mechanism"] as? String == "accessibility" {
            try pressYandexMusicAccessibility(windowID: windowID, tabNumber: tabNumber, command: command, wasPlaying: before["state"] as? String == "playing")
        }
        pumpRunLoop(0.15)
        var result = before
        let expectedState = action["expectedState"] as? String
        if let data = try? execute(readState).data(using: .utf8),
           let updated = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            result = updated
        }
        var attempts = 1
        func confirm(until deadline: Date) {
            repeat {
                if let data = try? execute(readState).data(using: .utf8),
                   let updated = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { result = updated }
                if expectedState == nil || result["state"] as? String == expectedState { break }
                pumpRunLoop(0.3)
            } while Date() < deadline
        }
        confirm(until: Date().addingTimeInterval(command == "toggle" ? 2.8 : 0.1))
        if let expectedState, result["state"] as? String != expectedState {
            // Chromium occasionally exposes the button before the web player has
            // attached its handler. Retry only while the observed state is still
            // unchanged, so an already successful Play can never be toggled back.
            attempts = 2
            yandexMusicExtensionButton = nil
            try pressYandexMusicAccessibility(
                windowID: windowID,
                tabNumber: tabNumber,
                command: command,
                wasPlaying: result["state"] as? String == "playing"
            )
            pumpRunLoop(0.45)
            confirm(until: Date().addingTimeInterval(command == "toggle" ? 4.5 : 0.7))
        }
        if let expectedState, result["state"] as? String != expectedState {
            throw modeError(expectedState == "playing" ? "Яндекс Музыка не подтвердила запуск." : "Яндекс Музыка не подтвердила паузу.")
        }
        result.removeValue(forKey: "ready")
        result["command"] = command
        result["volume"] = outputVolume
        result["hiddenWindowCreated"] = parts[2] == "true"
        result["attempts"] = attempts
        return result
    }
    private func pressYandexMusicAccessibility(windowID: Int, tabNumber: Int, command: String, wasPlaying: Bool) throws {
        guard let yandex = workspace.runningApplications.first(where: { $0.bundleIdentifier == "ru.yandex.desktop.yandex-browser" }) else {
            throw modeError("Яндекс Браузер не найден для управления плеером.")
        }
        let expectedLabel: String
        switch command {
        case "wave": expectedLabel = "Моя волна"
        case "toggle": expectedLabel = wasPlaying ? "Пауза" : "Воспроизведение"
        case "next": expectedLabel = "Следующая песня"
        case "previous": expectedLabel = "Предыдущая песня"
        default: throw modeError("Неизвестная команда плеера.")
        }
        let marker = "PIURA-PLAYER-\(UUID().uuidString)"
        let markControl = """
        (() => {
          const controls=[...document.querySelectorAll('button')].filter(button=>String(button.className||'').includes('VibePlayerControls_'));
          const buttons=(command == "wave" ? "[...document.querySelectorAll('button,a,[role=\\\"button\\\"]')]" : "controls");
          if(!buttons.length)return JSON.stringify({ready:false,reason:'global-controls-missing'});
          const visible=element=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return !element.disabled&&box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'};
          const label=button=>(button.getAttribute('aria-label')||button.title||'').trim().toLowerCase();
          const words=\(command == "next" ? "['следующ','next']" : (command == "wave" ? "['моя волна','my wave']" : "['предыдущ','previous']"));
          const target=\(command == "toggle" ? "buttons.find(button=>visible(button)&&String(button.className||'').includes('VibePlayerControls_playButton'))" : "buttons.find(button=>visible(button)&&words.some(word=>label(button).includes(word)))");
          if(!target)return JSON.stringify({ready:false,reason:'global-button-missing',labels:buttons.filter(visible).map(label)});
          target.dataset.piuraMusicTarget='true';
          target.dataset.piuraOriginalAria=target.getAttribute('aria-label')||'';
          target.setAttribute('aria-label','\(marker)');
          target.focus({preventScroll:true});
          return JSON.stringify({ready:true,focused:document.activeElement===target,className:String(target.className||'')});
        })()
        """
        let cleanupControl = """
        (() => {
          const target=document.querySelector('[data-piura-music-target="true"]');
          if(!target)return 'gone';
          const original=target.dataset.piuraOriginalAria||'';
          const current=target.getAttribute('aria-label')||'';
          target.removeAttribute('data-piura-music-target');
          delete target.dataset.piuraOriginalAria;
          if(current==='\(marker)'){
            if(original)target.setAttribute('aria-label',original);else target.removeAttribute('aria-label');
          }
          return 'clean';
        })()
        """
        _ = try runAppleScript("tell application \"Yandex\" to return execute tab \(tabNumber) of window id \(windowID) javascript \"document.documentElement.setAttribute('data-piura-music-command','\(command)')\"")
        if ["toggle", "next", "previous"].contains(command),
           let cached = yandexMusicExtensionButton,
           AXUIElementPerformAction(cached, kAXPressAction as CFString) == .success {
            pumpRunLoop(0.1)
            return
        }
        yandexMusicExtensionButton = nil
        // Chromium only exposes a trusted AXPress target while its player window
        // is a normal front window. Keep every already-visible Yandex window at
        // the screen-saver layer for the few hundred milliseconds required by
        // AXPress: the ERP stays pixel-for-pixel unchanged while the hidden
        // player becomes frontmost underneath it.
        let frozenWindows = elevateVisibleYandexWindows()
        guard !frozenWindows.isEmpty else {
            throw modeError("Не удалось скрыто подготовить управление плеером.")
        }
        var levelsRestored = false
        var invisibleMusicWindowID: UInt32?
        defer {
            if let invisibleMusicWindowID { _ = setSkyLightWindowAlpha(invisibleMusicWindowID, 1) }
            if !levelsRestored { restoreYandexWindowLevels(frozenWindows) }
        }
        pumpRunLoop(0.05)
        let preparation = try runAppleScript("""
        tell application "Yandex"
          set frontID to id of front window
          set oldBounds to bounds of window id \(windowID)
          set minimized of window id \(windowID) to false
          set active tab index of window id \(windowID) to \(tabNumber)
          set index of window id \(windowID) to 1
          activate
          return (frontID as text) & "," & (item 1 of oldBounds as text) & "," & (item 2 of oldBounds as text) & "," & (item 3 of oldBounds as text) & "," & (item 4 of oldBounds as text)
        end tell
        """)
        let values = preparation.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        guard values.count == 5, let frontID = Int(values[0]),
              let x1 = Int(values[1]), let y1 = Int(values[2]),
              let x2 = Int(values[3]), let y2 = Int(values[4]) else {
            _ = try? runAppleScript("tell application \"Yandex\" to set minimized of window id \(windowID) to true")
            throw modeError("Не удалось подготовить скрытый плеер.")
        }
        let existingWindowIDs = Set(frozenWindows.map(\.windowID))
        guard let musicWindowID = visibleYandexWindowIDs().first(where: { !existingWindowIDs.contains($0) }),
              setSkyLightWindowAlpha(musicWindowID, 0.001) else {
            _ = try? runAppleScript("tell application \"Yandex\" to set minimized of window id \(windowID) to true")
            throw modeError("Не удалось сделать плеер невидимым.")
        }
        invisibleMusicWindowID = musicWindowID
        // The player is now frontmost and compositor-visible to Chromium. A
        // 0.1% alpha keeps Chromium's trusted control live,
        // while the user continues to see the ERP immediately below unchanged.
        restoreYandexWindowLevels(frozenWindows)
        levelsRestored = true
        pumpRunLoop(0.05)
        defer {
            _ = try? runAppleScript("""
            tell application "Yandex"
              try
                execute tab \(tabNumber) of window id \(windowID) javascript "\(appleScriptEscape(cleanupControl))"
              end try
              set minimized of window id \(windowID) to true
              set bounds of window id \(windowID) to {\(x1), \(y1), \(x2), \(y2)}
              if exists window id \(frontID) then set index of window id \(frontID) to 1
              activate
            end tell
            """)
        }
        let root = AXUIElementCreateApplication(yandex.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 1)
        if ["toggle", "next", "previous"].contains(command) {
            let extensionTitle = "play/pause button for yandex music"
            var rawWindows: CFTypeRef?
            _ = AXUIElementCopyAttributeValue(root, kAXWindowsAttribute as CFString, &rawWindows)
            let stop = Date().addingTimeInterval(3)
            var queue = (rawWindows as? [AXUIElement] ?? []).map { ($0, 0) }, visited = 0
            while !queue.isEmpty, visited < 8_000, Date() < stop {
                let (element, depth) = queue.removeFirst(); visited += 1
                let searchable = [kAXTitleAttribute, kAXDescriptionAttribute, kAXHelpAttribute]
                    .map { axString(element, $0).lowercased() }.joined(separator: " ")
                let extensionStateTitles = ["play", "pause", "воспроизведение", "пауза"]
                let compactTitle = searchable.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
                let isExtensionControl = searchable.contains(extensionTitle)
                    || extensionStateTitles.contains(where: { compactTitle == $0 || compactTitle.hasPrefix($0 + " ") })
                if isExtensionControl {
                    guard AXUIElementPerformAction(element, kAXPressAction as CFString) == .success else {
                        throw modeError("Скрытая кнопка Play/Pause недоступна.")
                    }
                    yandexMusicExtensionButton = element
                    pumpRunLoop(0.1)
                    return
                }
                let role = axString(element, kAXRoleAttribute)
                guard depth < 14, role != "AXWebArea", role != kAXScrollAreaRole else { continue }
                var rawChildren: CFTypeRef?
                if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &rawChildren) == .success,
                   let children = rawChildren as? [AXUIElement] {
                    queue.append(contentsOf: children.map { ($0, depth + 1) })
                }
            }
            throw modeError("Не найдена скрытая кнопка Play/Pause Яндекс Музыки.")
        }
        func deepMatch(in candidate: AXUIElement, until stop: Date) -> AXUIElement? {
            var queue: [(AXUIElement, Int)] = [(candidate, 0)], visited = 0
            while !queue.isEmpty, visited < 12_000, Date() < stop {
                let (element, depth) = queue.removeFirst(); visited += 1
                for attribute in [kAXTitleAttribute, kAXDescriptionAttribute, kAXIdentifierAttribute] {
                    let value = axString(element, attribute)
                    if value == marker { return element }
                }
                guard depth < 20 else { continue }
                var rawChildren: CFTypeRef?
                if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &rawChildren) == .success,
                   let children = rawChildren as? [AXUIElement] { queue.append(contentsOf: children.map { ($0, depth + 1) }) }
            }
            return nil
        }
        func findPlayerButton(_ timeout: TimeInterval) -> AXUIElement? {
            var rawWindows: CFTypeRef?
            _ = AXUIElementCopyAttributeValue(root, kAXWindowsAttribute as CFString, &rawWindows)
            let windows = (rawWindows as? [AXUIElement] ?? []).sorted {
                let left = axString($0, kAXTitleAttribute).lowercased().contains("яндекс музыка")
                let right = axString($1, kAXTitleAttribute).lowercased().contains("яндекс музыка")
                return left && !right
            }
            let stop = Date().addingTimeInterval(timeout)
            for candidate in windows {
                if let match = deepMatch(in: candidate, until: stop) { return match }
            }
            return nil
        }
        pumpRunLoop(0.25)
        let marked = try runAppleScript("tell application \"Yandex\" to return execute tab \(tabNumber) of window id \(windowID) javascript \"\(appleScriptEscape(markControl))\"")
        guard marked.contains("\"ready\":true") else {
            throw modeError("Не найдена глобальная кнопка «\(expectedLabel)» в плеере.")
        }
        pumpRunLoop(0.2)
        var focused: CFTypeRef?
        var button: AXUIElement?
        if AXUIElementCopyAttributeValue(root, kAXFocusedUIElementAttribute as CFString, &focused) == .success,
           let focused, CFGetTypeID(focused) == AXUIElementGetTypeID() {
            let candidate = focused as! AXUIElement
            for attribute in [kAXTitleAttribute, kAXDescriptionAttribute, kAXIdentifierAttribute] where axString(candidate, attribute) == marker {
                button = candidate
            }
        }
        if button == nil { button = findPlayerButton(2.8) }
        guard let button else { throw modeError("Не найдена точная кнопка «\(expectedLabel)» в живом плеере.") }
        if AXUIElementPerformAction(button, kAXPressAction as CFString) != .success {
            throw modeError("Скрытая кнопка «\(expectedLabel)» недоступна для нажатия.")
        }
        pumpRunLoop(0.45)
    }
    private func deliverMusicResult(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.piuraMusicResult?.(\(json))")
        let javascript = "(()=>{const r=\(json);window.piuraMusicResult?.(r);document.querySelectorAll('iframe').forEach(f=>f.contentWindow.postMessage({...r,type:'piura-music-result'},location.origin));return 'delivered'})()"
        _ = try? runAppleScript("""
        tell application "Yandex"
          repeat with w in every window
            repeat with t in every tab of w
              if URL of t starts with "\(erpBaseURL)" then
                try
                  execute t javascript "\(appleScriptEscape(javascript))"
                end try
              end if
            end repeat
          end repeat
        end tell
        """)
    }
    private func runMode(_ mode: WorkMode, preview: Bool) -> ModeResult {
        let displays = NSScreen.screens.sorted { $0.frame.midX < $1.frame.midX }.map(target)
        guard displays.count == 3 else {
            return ModeResult(ok: false, message: "Нужны все три монитора: центральный, левый и правый.")
        }
        let left = displays[0], center = displays[1], right = displays[2]
        var notes: [String] = []
        var closingApps: [NSRunningApplication] = []
        var wallpaperJob: WallpaperJob?
        verifiedWindows = []
        yandexWindowCache.removeAll()
        menuTrace = []
        if !preview {
            guard hasAccessibilityAccess(promptIfNeeded: true) else {
                return ModeResult(ok: false, message: "Разрешите PIURA Modes управление компьютером в настройках macOS и запустите режим снова.")
            }
            guard canControlSystemEvents() else {
                return ModeResult(ok: false, message: "Разрешите PIURA Modes управлять System Events и запустите режим снова.")
            }
            closingApps = closeRegularApplications(exceptFor: mode)
            do { try setSystemDarkAppearance() } catch { notes.append("Тёмный Mac: \(error.localizedDescription)") }
            do { wallpaperJob = try startDesktopWallpaper(for: mode) } catch { notes.append("Обои рабочего стола: \(error.localizedDescription)") }
        }
        markPhase("system")
        do { try arrangeSafari(on: center, mode: mode) } catch { notes.append("Safari: \(error.localizedDescription)") }
        markPhase("safari")
        if pendingLaunch != nil { return ModeResult(ok: false, message: "Переключаюсь на последний выбранный режим.") }
        do { try arrangeYandex(right: right, left: left, mode: mode) } catch { notes.append("Яндекс: \(error.localizedDescription)") }
        markPhase("yandex")
        if mode.needsTelegram {
            if AXIsProcessTrusted() {
                do { try arrangeTelegramSplitView(on: center) } catch { notes.append("Telegram: \(error.localizedDescription)") }
            } else { notes.append("для пары Telegram нужен Универсальный доступ PIURA Modes") }
        }
        markPhase("telegram")
        // Notes and Zoom must never become candidates for Telegram's second half.
        do { try openCompanionApps(for: mode) } catch { notes.append("Рабочие приложения: \(error.localizedDescription)") }
        markPhase("companions")
        if pendingLaunch != nil { return ModeResult(ok: false, message: "Переключаюсь на последний выбранный режим.") }
        if !preview {
            if mode == .morning && !setDoNotDisturb(enabled: true) { notes.append("проверьте режим «Не беспокоить»") }
            verifiedWindows.append(["musicControlledFromERP":true,"musicRequested":mode.needsMusic])
        }
        if mode.needsChatGPT {
            do { try arrangeChatGPT(on: left) } catch { notes.append("ChatGPT: \(error.localizedDescription)") }
        }
        markPhase("musicAndChat")
        do { try restoreForeground(for: mode) } catch { notes.append("Передний план: \(error.localizedDescription)") }
        markPhase("foreground")
        if !preview && mode.needsMusic {
            do { try verifyERPMusicPlaying() } catch { notes.append("Музыка ERP: \(error.localizedDescription)") }
        }
        markPhase("musicCheck")
        verifiedWindows.append(["workspaceReadySeconds":Date().timeIntervalSince(startedAt),"workspaceErrors":notes])
        if !preview {
            if let job = wallpaperJob {
                do { try finishDesktopWallpaper(job) } catch { notes.append("Обои рабочего стола: \(error.localizedDescription)") }
            }
            markPhase("wallpapers")
            do { try verifyFinalSides(for: mode, left: left, right: right) } catch { notes.append("Итоговая проверка экранов: \(error.localizedDescription)") }
            markPhase("screenCheck")
            do { try verifyOfficeLighting(for: mode) } catch { notes.append("Свет кабинета: \(error.localizedDescription)") }
            markPhase("lighting")
        }
        // Give normal quit requests the whole layout transition to finish.
        // Do not report a delayed Zoom shutdown as a failure after just 2.5 s.
        let quitDeadline = min(Date().addingTimeInterval(5), runDeadline)
        while Date() < quitDeadline && closingApps.contains(where: { !$0.isTerminated }) { pumpRunLoop(0.1) }
        let remaining = closingApps.filter { !$0.isTerminated }.map { $0.localizedName ?? "Приложение" }
        if !remaining.isEmpty { notes.append("Не закрылись (возможно, ожидают сохранения): " + remaining.joined(separator: ", ")) }
        markPhase("finishQuitting")
        var success = preview
            ? "Проверено расположение режима «\(mode.title)»."
            : "Режим «\(mode.title)» включён."
        if verifiedWindows.contains(where: { $0["requiresGoogleSignIn"] as? Bool == true }) {
            success += " Для закрытых страниц нужен вход в Google в профиле «\(mode.title)»."
        }
        return ModeResult(ok: notes.isEmpty, message: notes.isEmpty ? success : "Выполнено не полностью: " + notes.joined(separator: " · "))
    }
    private func display(named name: String) -> DisplayTarget? { NSScreen.screens.first(where: { $0.localizedName == name }).map(target) }
    private func display(at index: Int) -> DisplayTarget? { NSScreen.screens.indices.contains(index) ? target(NSScreen.screens[index]) : nil }
    private func leftmostDisplay() -> DisplayTarget? { NSScreen.screens.min(by: { $0.frame.minX < $1.frame.minX }).map(target) }
    private func rightmostDisplay() -> DisplayTarget? { NSScreen.screens.max(by: { $0.frame.maxX < $1.frame.maxX }).map(target) }
    private func target(_ screen: NSScreen) -> DisplayTarget {
        let f = screen.frame
        let mainHeight = NSScreen.screens.first(where: { $0.frame.origin == .zero })?.frame.height ?? f.height
        return DisplayTarget(screen: screen, rect: CGRect(x: f.minX, y: mainHeight - f.maxY, width: f.width, height: f.height))
    }
    private func closeRegularApplications(exceptFor mode: WorkMode) -> [NSRunningApplication] {
        var keep: Set<String> = ["com.piura.modes", "com.apple.finder", "com.apple.Safari"]
        keep.insert("ru.yandex.desktop.yandex-browser")
        if UserDefaults.standard.bool(forKey: "benchmarkKeepCodex") {
            keep.insert("com.openai.codex")
            verifiedWindows.append(["benchmarkHostPreserved":"com.openai.codex"])
            if !mode.needsChatGPT { workspace.runningApplications.first(where: { $0.bundleIdentifier == "com.openai.codex" })?.hide() }
        }
        if mode.needsTelegram { keep.formUnion(telegramIDs) }
        if mode.needsChatGPT { keep.formUnion(["com.openai.chat", "com.openai.codex"]) }
        if mode.needsZoom { keep.insert("us.zoom.xos") }
        let currentPID = ProcessInfo.processInfo.processIdentifier
        let apps = workspace.runningApplications.filter { app in
            app.activationPolicy == .regular && app.processIdentifier != currentPID && (app.bundleIdentifier.map { !keep.contains($0) } ?? true)
        }
        for app in apps { _ = app.terminate() }
        // Never discard unsaved work or dismiss another app's save dialog.
        return apps
    }
    private func setSystemDarkAppearance() throws {
        let result = try runAppleScript("tell application \"System Events\" to tell appearance preferences\nif dark mode is false then set dark mode to true\nreturn dark mode as text\nend tell")
        guard result == "true" else { throw modeError("macOS не подтвердила тёмный режим.") }
        verifiedWindows.append(["macOSAppearance":"dark"])
    }
    private func openCompanionApps(for mode: WorkMode) throws {
        var ids: [String] = []
        if mode.needsZoom { ids.append("us.zoom.xos") }
        for id in ids {
            if workspace.runningApplications.contains(where: { $0.bundleIdentifier == id && !$0.isTerminated }) {
                verifiedWindows.append(["companionApp":id, "reused":true]); continue
            }
            guard let url = workspace.urlForApplication(withBundleIdentifier: id) else { throw modeError("Не найдено приложение \(id).") }
            let config = NSWorkspace.OpenConfiguration(); config.activates = false
            var finished = false; var failure: Error?
            workspace.openApplication(at: url, configuration: config) { _, error in failure = error; finished = true }
            let deadline = Date().addingTimeInterval(8)
            while !finished && Date() < deadline { pumpRunLoop(0.05) }
            if let failure { throw failure }
            guard finished else { throw modeError("Не завершился запуск \(id).") }
            verifiedWindows.append(["companionApp":id, "reused":false])
        }
    }
    private var supportDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("PIURA Modes", isDirectory: true)
    }
    private func startDesktopWallpaper(for mode: WorkMode) throws -> WallpaperJob {
        let directory = supportDirectory.appendingPathComponent("Wallpapers", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let job = WallpaperJob()
        for (index, screen) in NSScreen.screens.sorted(by: { $0.frame.midX < $1.frame.midX }).enumerated() {
            var resource = mode.wallpaperResource + (screen.frame.height > screen.frame.width ? "-Portrait" : "")
            if mode == .morning && index == 0 { resource = "Magic-Morning-Left" }
            if mode == .work && index == 0 { resource = "Investments-Left" }
            if mode == .learning && index == 0 { resource = "Learning-Left" }
            if mode == .learning && index == 2 { resource = "Learning-Right" }
            if mode == .mentorship && index == 1 { resource = "Mentorship-Center" }
            if mode == .mentorship && index == 2 { resource = "Mentorship-Right" }
            guard let source = Bundle.main.url(forResource: resource, withExtension: "png") else {
                throw modeError("Нет файла обоев \(resource).")
            }
            let destination = directory.appendingPathComponent(resource + ".png")
            let data = try Data(contentsOf: source)
            if (try? Data(contentsOf: destination)) != data { try data.write(to: destination, options: .atomic) }
            // Prepare files first, but defer desktop changes until Spaces settle.
            guard let displayID = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
                throw modeError("Не найден идентификатор монитора \(screen.localizedName).")
            }
            // Address each desktop by its actual physical display ID.
            let id = displayID.uint32Value, name = screen.localizedName
            let orientation = screen.frame.height > screen.frame.width ? "portrait" : "landscape"
            job.expected.append((id, destination.path))
            job.records.append(["wallpaper":destination.path,"display":name,"orientation":orientation])
        }
        return job
    }
    private func finishDesktopWallpaper(_ job: WallpaperJob) throws {
        let distinct = Set(job.expected.map { $0.1 }).count
        guard distinct == job.records.count else { throw modeError("Обои мониторов не должны повторяться.") }
        // One atomic per-display/Space update, after the working windows are ready.
        // Avoid three slow System Events writes to transient fullscreen Spaces.
        // Register each current desktop through AppKit as well. A matching
        // preferences file alone does not prove that WallpaperAgent loaded it.
        for (id,path) in job.expected {
            guard let screen = NSScreen.screens.first(where: { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == id }) else { throw modeError("Монитор отключён во время смены обоев.") }
            let url = URL(fileURLWithPath:path)
            try NSWorkspace.shared.setDesktopImageURL(url, for:screen, options:[.imageScaling:NSImageScaling.scaleProportionallyUpOrDown.rawValue,.allowClipping:true])
        }
        let deadline = Date().addingTimeInterval(3)
        func currentWallpapersMatch() -> Bool {
            job.expected.allSatisfy { id,path in
                guard let screen = NSScreen.screens.first(where: { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == id }) else { return false }
                return NSWorkspace.shared.desktopImageURL(for:screen)?.standardizedFileURL == URL(fileURLWithPath:path).standardizedFileURL
            }
        }
        while !currentWallpapersMatch() && Date() < deadline { pumpRunLoop(0.1) }
        for screen in NSScreen.screens { verifiedWindows.append(["wallpaperSystemReadback":NSWorkspace.shared.desktopImageURL(for:screen)?.path ?? "missing", "display":screen.localizedName]) }
        guard currentWallpapersMatch() else { throw modeError("macOS не подтвердила применение обоев на всех трёх мониторах.") }
        verifiedWindows.append(["wallpaperAppKitReadback":true])
        verifiedWindows.append(contentsOf:job.records)
        verifiedWindows.append(["desktops":job.records.count,"distinctWallpapers":distinct,"changedAfterLayout":true])
    }
    private func synchronizeWallpaperSpaces(_ job: WallpaperJob) throws {
        let storeURL = supportDirectory.deletingLastPathComponent().appendingPathComponent("com.apple.wallpaper/Store/Index.plist")
        let originalData = try Data(contentsOf:storeURL)
        guard let original = try PropertyListSerialization.propertyList(from:originalData, options:[], format:nil) as? [String:Any] else {
            throw modeError("Не удалось прочитать рабочие пространства обоев.")
        }
        var urls: [String:URL] = [:]
        for (id,path) in job.expected {
            guard let uuid = CGDisplayCreateUUIDFromDisplayID(id)?.takeRetainedValue() else { throw modeError("Нет UUID монитора.") }
            urls[CFUUIDCreateString(nil,uuid) as String] = URL(fileURLWithPath:path)
        }
        if !WallpaperStore.matches(urls,in:original) {
            let updated = try WallpaperStore.applying(urls,to:original)
            guard WallpaperStore.matches(urls,in:updated) else { throw modeError("Не подтверждены обои всех рабочих пространств.") }
            let backup = supportDirectory.appendingPathComponent("WallpaperStore-before-modes10.plist")
            if !FileManager.default.fileExists(atPath:backup.path) { try originalData.write(to:backup,options:.atomic) }
            let data = try PropertyListSerialization.data(fromPropertyList:updated, format:.binary, options:0)
            try data.write(to:storeURL,options:.atomic)
            // Reload only the user's wallpaper renderer, never Dock or apps.
            for agent in NSRunningApplication.runningApplications(withBundleIdentifier:"com.apple.wallpaper.agent") { _ = agent.terminate() }
            pumpRunLoop(0.4)
        }
        let reloaded = try PropertyListSerialization.propertyList(from:Data(contentsOf:storeURL),options:[],format:nil) as? [String:Any] ?? [:]
        guard WallpaperStore.matches(urls,in:reloaded) else { throw modeError("macOS перезаписала обои пространств; требуется повторная проверка.") }
        verifiedWindows.append(["wallpaperSpacesSynchronized":true,"physicalDisplayUUIDs":Array(urls.keys),"spaceCount":(reloaded["Spaces"] as? [String:Any])?.count ?? 0])
    }
    // A recoverable URL inventory is written before closing unwanted windows.
    // Browsers still own their normal close/save-confirmation behavior.
    private func backupBrowserWindows(_ browser: String) throws {
        let snapshot = try runAppleScript("""
        tell application "\(browser)"
          set inventory to ""
          repeat with w in every window
            try
              set inventory to inventory & "WINDOW " & (id of w as text) & linefeed
              repeat with t in every tab of w
                set inventory to inventory & (URL of t as text) & linefeed
              end repeat
            end try
          end repeat
          return inventory
        end tell
        """)
        let directory = supportDirectory.appendingPathComponent("SessionBackups")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                attributes: [.posixPermissions: 0o700])
        let destination = directory.appendingPathComponent("\(requestID)-\(browser).txt")
        try snapshot.write(to: destination, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: destination.path)
    }
    private func axString(_ element: AXUIElement, _ attribute: String) -> String {
        var value: CFTypeRef?
        _ = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
        return value as? String ?? ""
    }
    private func profileName(of window: AXUIElement) -> String? {
        var queue: [(AXUIElement, Int)] = [(window, 0)]
        var visited = 0
        while !queue.isEmpty && visited < 200 {
            let (item, depth) = queue.removeFirst(); visited += 1
            let identifier = axString(item, kAXIdentifierAttribute)
            if identifier.hasPrefix("TabGroupPickerButton?"),
               let components = URLComponents(string: "https://local/" + identifier),
               let name = components.queryItems?.first(where: { $0.name == "Profile" })?.value { return name }
            // Do not traverse page contents or inspect messages.
            if depth < 5 && axString(item, kAXRoleAttribute) != "AXWebArea" {
                var children: CFTypeRef?
                _ = AXUIElementCopyAttributeValue(item, kAXChildrenAttribute as CFString, &children)
                queue.append(contentsOf: (children as? [AXUIElement] ?? []).map { ($0, depth + 1) })
            }
        }
        let title = axString(window, kAXTitleAttribute)
        return title.components(separatedBy: " — ").count > 1 ? title.components(separatedBy: " — ").first : nil
    }
    private func safariURLs(_ id: Int) throws -> [String] {
        let text = try runAppleScript("""
        tell application "Safari"
          set urls to {}
          repeat with t in every tab of window id \(id)
            set u to URL of t
            if u is missing value then set u to "about:blank"
            set end of urls to u as text
          end repeat
          set AppleScript's text item delimiters to linefeed
          return urls as text
        end tell
        """)
        return text.components(separatedBy: "\n")
    }
    private func isSafariBlank(_ url: String) -> Bool {
        ["", "missing value", "about:blank", "favorites://"].contains(url)
    }
    private func tabMatches(_ actual: String, desired: String) -> Bool {
        if isSafariBlank(actual) && isSafariBlank(desired) { return true }
        let decoded = (0..<3).reduce(actual) { value, _ in value.removingPercentEncoding ?? value }
        if desired.contains("/folders/"), let id = URL(string: desired)?.lastPathComponent {
            return decoded.contains(id)
        }
        if desired.contains("/course/"), let id = URL(string: desired)?.path.components(separatedBy: "/").dropFirst(2).first {
            return decoded.contains(id)
        }
        if desired.contains("/spreadsheets/d/"), let id = URL(string: desired)?.path.components(separatedBy: "/").dropFirst(3).first {
            return decoded.contains(id)
        }
        let destination = (0..<3).reduce(desired) { value, _ in value.removingPercentEncoding ?? value }.components(separatedBy: "#")[0]
        return decoded.hasPrefix(destination) ||
            (URL(string: actual)?.host == "accounts.google.com" && decoded.contains(destination))
    }
    private func arrangeSafari(on target: DisplayTarget, mode: WorkMode) throws {
        guard let app = try runningApplication("com.apple.Safari", launch: true) else { throw modeError("Safari не найден.") }
        app.activate(options: [])
        let root = AXUIElementCreateApplication(app.processIdentifier)
        var value: CFTypeRef?
        _ = AXUIElementCopyAttributeValue(root, kAXWindowsAttribute as CFString, &value)
        let candidates = (value as? [AXUIElement] ?? []).filter { isDocumentWindow($0) && profileName(of: $0) == mode.safariProfile }
        var id = 0
        if let existing = candidates.first {
            _ = AXUIElementSetAttributeValue(existing, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
            _ = AXUIElementPerformAction(existing, kAXRaiseAction as CFString)
            pumpRunLoop(0.25)
            id = Int(try runAppleScript("tell application \"Safari\" to return id of front window as text")) ?? 0
        } else {
            try pressMenuPath(of: app, titles: ["File", "New \(mode.safariProfile) Window"])
            pumpRunLoop(0.4)
            id = Int(try runAppleScript("tell application \"Safari\" to return id of front window as text")) ?? 0
        }
        guard id != 0, profileName(of: try firstWindow(of: app)) == mode.safariProfile else {
            throw modeError("Safari не подтвердил профиль «\(mode.title)». Личные вкладки не изменены.")
        }
        safariWindowID = id
        let previousWindowCount = (value as? [AXUIElement] ?? []).filter(isDocumentWindow).count
        if previousWindowCount > (candidates.isEmpty ? 0 : 1) { try backupBrowserWindows("Safari") }
        // Close by immutable IDs, never by shifting window indices.
        _ = try runAppleScript("""
        tell application "Safari"
          set oldIDs to id of every window
          repeat with oldID in oldIDs
            if (oldID as integer) is not \(id) then close window id (oldID as integer)
          end repeat
          repeat 80 times
            if (count of windows) is 1 then exit repeat
            delay 0.1
          end repeat
          if (count of windows) is not 1 then error "Safari ожидает закрытия старого окна."
          set miniaturized of window id \(id) to false
          set index of window id \(id) to 1
          activate
        end tell
        """)
        let extras = UserDefaults.standard.stringArray(forKey: "investmentExtraURLs") ?? []
        let required: [String]
        switch mode {
        case .morning: required = [adminScaleURL, ethicalProgramURL]
        case .work: required = [workTableURL] + investmentURLs + [tradingViewURL] + extras
        case .learning: required = [courseURL]
        case .mentorship: required = []
        }
        let firstSetup = !UserDefaults.standard.bool(forKey: "profileSeeded-v5.1-\(mode.rawValue)")
        var urls = try safariURLs(id)
        for desired in required {
            let duplicates = urls.indices.filter { tabMatches(urls[$0], desired: desired) }
            for offset in duplicates.dropFirst().reversed() {
                _ = try runAppleScript("tell application \"Safari\" to close tab \(offset + 1) of window id \(id)")
                urls.remove(at: offset)
            }
            let existing = urls.firstIndex(where: { tabMatches($0, desired: desired) })
            let index: Int
            if let existing { index = existing + 1 }
            else {
                index = Int(try runAppleScript("""
                tell application "Safari"
                  set taskTab to make new tab at end of tabs of window id \(id) with properties {URL:"\(appleScriptEscape(desired))"}
                  set current tab of window id \(id) to taskTab
                  return count of tabs of window id \(id)
                end tell
                """)) ?? 0
                urls.append(desired)
            }
            guard index > 0 else { throw modeError("Safari не создал вкладку.") }
            // Pin once (or when restoring a genuinely missing tab), not on every launch.
            if mode != .learning && (firstSetup || existing == nil) {
                _ = try runAppleScript("tell application \"Safari\" to set current tab of window id \(id) to tab \(index) of window id \(id)")
                try pressMenuPath(of: app, titles: ["Window"])
                var menuBar: CFTypeRef?
                _ = AXUIElementCopyAttributeValue(root, kAXMenuBarAttribute as CFString, &menuBar)
                guard let menuBar, CFGetTypeID(menuBar) == AXUIElementGetTypeID() else { throw modeError("Нет меню закрепления вкладки.") }
                let menuRoot = menuBar as! AXUIElement
                if let pin = descendant(of: menuRoot, title: "Pin Tab", deadline: Date()) {
                    _ = AXUIElementPerformAction(pin, kAXPressAction as CFString)
                    pumpRunLoop(0.15)
                } else if descendant(of: menuRoot, title: "Unpin Tab", deadline: Date()) != nil {
                    activateAndDismissMenus(app)
                } else { throw modeError("Safari не подтвердил закрепление вкладки.") }
                // Pinning changes tab order. Refresh only after a real mutation.
                urls = try safariURLs(id)
            }
        }
        urls = try safariURLs(id)
        let loadDeadline = Date().addingTimeInterval(7)
        while !required.allSatisfy({ desired in urls.contains(where: { tabMatches($0, desired: desired) }) }) && Date() < loadDeadline {
            pumpRunLoop(0.2)
            urls = try safariURLs(id)
        }
        // Never close a loading/authentication tab based on a transient blank
        // URL, especially in a new profile with no existing pinned tabs.
        guard required.allSatisfy({ desired in urls.contains(where: { tabMatches($0, desired: desired) }) }) else {
            throw modeError("Ожидается загрузка нужных страниц профиля «\(mode.title)»; вкладки сохранены.")
        }
        // Learning has exactly the course; other task profiles drop only empty
        // startup tabs. Climate keeps the user's remaining work tabs unchanged.
        for offset in urls.indices.reversed() {
            let blank = isSafariBlank(urls[offset])
            let remove = mode == .learning ? !tabMatches(urls[offset], desired: courseURL) :
                (mode == .morning || mode == .work) && blank && urls.count > 1
            if remove {
                _ = try runAppleScript("tell application \"Safari\" to close tab \(offset + 1) of window id \(id)")
                urls.remove(at: offset)
            }
        }
        if mode == .mentorship {
            let blankIndex = urls.firstIndex(where: isSafariBlank)
            if let blankIndex {
                _ = try runAppleScript("tell application \"Safari\" to set current tab of window id \(id) to tab \(blankIndex + 1) of window id \(id)")
            } else {
                _ = try runAppleScript("tell application \"Safari\" to set current tab of window id \(id) to (make new tab at end of tabs of window id \(id) with properties {URL:\"about:blank\"})")
            }
        } else if let desired = required.first, let index = urls.firstIndex(where: { tabMatches($0, desired: desired) }) {
            _ = try runAppleScript("tell application \"Safari\" to set current tab of window id \(id) to tab \(index + 1) of window id \(id)")
        }
        guard required.allSatisfy({ desired in urls.contains(where: { tabMatches($0, desired: desired) }) }) else {
            throw modeError("Профиль «\(mode.title)» не подтвердил нужные вкладки.")
        }
        UserDefaults.standard.set(true, forKey: "profileSeeded-v5.1-\(mode.rawValue)")
        try fullScreenWindow(of: app, on: target)
        try verifyBrowserWindow(app: "Safari", id: id, target: target, expectedURL: required.first ?? "about:blank")
        verifiedWindows.append(["safariProfile":mode.title, "tabCount":urls.count,
                                "requiresGoogleSignIn":urls.contains(where: { $0.contains("accounts.google.com") })])
        if mode == .work { verifiedWindows.append(["workIncludesInvestmentTabs":required.allSatisfy { desired in urls.contains { tabMatches($0, desired:desired) } }]) }
    }
    private func arrangeYandex(right: DisplayTarget, left: DisplayTarget, mode: WorkMode) throws {
        guard let erpURL = mode.erpURL else { return }
        guard let app = try runningApplication("ru.yandex.desktop.yandex-browser", launch: true) else { throw modeError("Яндекс не найден.") }
        let leftURL = mode == .morning ? morningAdminPreviewURL : policyURL
        let needsLeft = mode == .morning || mode == .mentorship
        let leftScript = needsLeft ? """
          repeat with w in every window
            if id of w is not erpID then
              set tabNumber to 0
              repeat with t in every tab of w
                set tabNumber to tabNumber + 1
                if URL of t starts with "\(leftURL)" then
                  set leftID to id of w
                  set active tab index of w to tabNumber
                  exit repeat
                end if
              end repeat
            end if
            if leftID is not -1 then exit repeat
          end repeat
          if leftID is -1 then
            set leftID to id of (make new window)
            set URL of active tab of window id leftID to "\(leftURL)"
          end if
          set minimized of window id leftID to false
        """ : ""
        let ids = try runAppleScript("""
        tell application "Yandex"
          activate
          set erpID to -1
          repeat with w in every window
            set tabNumber to 0
            repeat with t in every tab of w
              set tabNumber to tabNumber + 1
              set u to URL of t
              if u is "\(erpBaseURL)" or u starts with "\(erpBaseURL)?" or u starts with "\(erpBaseURL)index.html" then
                set erpID to id of w
                set active tab index of w to tabNumber
                exit repeat
              end if
            end repeat
            if erpID is not -1 then exit repeat
          end repeat
          if erpID is -1 then set erpID to id of (make new window)
          set leftID to -1
          \(leftScript)
          set switchedInPlace to false
          try
            set switchResult to execute active tab of window id erpID javascript "window.piuraApplyWorkMode?.('\(mode.rawValue)') ? 'updated' : 'missing'"
            set switchedInPlace to switchResult is "updated"
          end try
          if switchedInPlace is false and URL of active tab of window id erpID is not "\(erpURL)" then set URL of active tab of window id erpID to "\(erpURL)"
          set minimized of window id erpID to false
          set index of window id erpID to 1
          \(needsLeft ? "set index of window id leftID to 1" : "")
          return (erpID as text) & "," & (leftID as text)
        end tell
        """)
        let values = ids.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        guard values.count == 2 else { throw modeError("Не удалось выделить нужные окна Яндекса.") }
        erpWindowID = values[0]
        leftWindowID = values[1]
        // Start the same physical color-wheel command while the windows arrange.
        // Preview runs do not change the room lights.
        if !isPreviewRun {
            let start = try runAppleScript("tell application \"Yandex\" to execute active tab of window id \(erpWindowID) javascript \"(() => {const e=document.documentElement;if(e.dataset.officeControllerReady!=='10.2'){if(!document.getElementById('piura-office-loader-10-2')){const s=document.createElement('script');s.id='piura-office-loader-10-2';s.src='https://nikolaypiura.github.io/ERPNIKOLAY/office-modes.js?v=modes10.2';document.head.append(s)}return 'loading'}e.dataset.officeModeRequest='\(mode.rawValue)';document.dispatchEvent(new Event('piura:office-mode'));return 'started'})()\"")
            verifiedWindows.append(["officeStart":start])
        }
        let allIDs = try runAppleScript("tell application \"Yandex\" to return id of every window")
            .split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        verifiedWindows.append(["yandexTargetIDs":values, "yandexBeforeCleanup":allIDs])
        if allIDs.contains(where: { !values.contains($0) }) { try backupBrowserWindows("Yandex") }
        for oldID in allIDs where !values.contains(oldID) {
            _ = try runAppleScript("tell application \"Yandex\" to close window id \(oldID)")
        }
        let remainingIDs = try runAppleScript("tell application \"Yandex\" to return id of every window")
            .split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        verifiedWindows.append(["yandexAfterCleanup":remainingIDs])
        guard Set(remainingIDs) == Set(values.filter { $0 != -1 }) else {
            throw modeError("Яндекс не подтвердил закрытие лишних окон.")
        }
        let erpWindow = try yandexWindow(id: values[0], app: app)
        if mode == .learning {
            try placeWindow(of: app, in: right.usableRect, raise: true, selected: erpWindow)
        } else {
            try fullScreenWindow(of: app, on: right, selected: erpWindow)
        }
        try verifyBrowserWindow(app: "Yandex", id: values[0], target: right, expectedURL: erpURL, fullScreen: mode != .learning)
        if needsLeft {
            let leftWindow = try yandexWindow(id: values[1], app: app)
            try fullScreenWindow(of: app, on: left, selected: leftWindow)
            try verifyBrowserWindow(app: "Yandex", id: values[1], target: left, expectedURL: leftURL)
        } else {
            _ = try runAppleScript("tell application \"Yandex\" to set minimized of window id \(values[0]) to true")
            let minimized = try runAppleScript("tell application \"Yandex\" to return minimized of window id \(values[0]) as text")
            guard minimized == "true" else { throw modeError("ERP не свернулась для режима обучения.") }
            verifiedWindows.append(["learningERPMinimized":true])
        }
    }
    private func yandexWindow(id: Int, app: NSRunningApplication) throws -> AXUIElement {
        // Raise the immutable browser ID, then bind its exact AX window. Never
        // use the app's first window for both monitors: that swaps music/ERP.
        var title = try runAppleScript("tell application \"Yandex\"\nset index of window id \(id) to 1\nactivate\nreturn title of active tab of window id \(id)\nend tell")
        let root = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(root,1)
        let deadline = Date().addingTimeInterval(6)
        var lastTitles: [String] = []
        repeat {
            var windows: CFTypeRef?
            _ = AXUIElementCopyAttributeValue(root, kAXWindowsAttribute as CFString, &windows)
            var candidates = windows as? [AXUIElement] ?? []
            // Fullscreen Chromium can omit another display's window from
            // AXWindows. Retain only the exact ID binding from this run, and
            // also inspect direct main/focused references with the same title.
            if let cached = yandexWindowCache[id] { candidates.append(cached) }
            for attribute in [kAXMainWindowAttribute,kAXFocusedWindowAttribute] {
                var candidate: CFTypeRef?
                _ = AXUIElementCopyAttributeValue(root,attribute as CFString,&candidate)
                if let candidate,CFGetTypeID(candidate) == AXUIElementGetTypeID() { candidates.append(candidate as! AXUIElement) }
            }
            lastTitles = candidates.map { axString($0,kAXTitleAttribute) }
            if let match = candidates.first(where: {
                let axTitle = axString($0, kAXTitleAttribute)
                return isDocumentWindow($0) && !axTitle.isEmpty && !title.isEmpty &&
                    (axTitle == title || title.contains(axTitle) || axTitle.hasPrefix(title + " —"))
            }) {
                yandexWindowCache[id] = match
                _ = AXUIElementPerformAction(match, kAXRaiseAction as CFString)
                return match
            }
            pumpRunLoop(0.1)
            title = (try? runAppleScript("tell application \"Yandex\" to return title of active tab of window id \(id)")) ?? title
        } while Date() < deadline
        verifiedWindows.append(["yandexMissingID":id,"yandexAXTitles":lastTitles,"expectedTitle":title])
        throw modeError("Яндекс не подтвердил окно №\(id) «\(title)»; другие окна не перемещены.")
    }
    private func verifyBrowserWindow(app: String, id: Int, target: DisplayTarget, expectedURL: String, fullScreen: Bool = true) throws {
        let actual = try runAppleScript("""
        tell application "\(app)"
          set w to window id \(id)
          set b to bounds of w
          set u to URL of \(app == "Safari" ? "current tab" : "active tab") of w
          return (item 1 of b as text) & "," & (item 2 of b as text) & "," & (item 3 of b as text) & "," & (item 4 of b as text) & "|" & u
        end tell
        """)
        let parts = actual.components(separatedBy: "|")
        let b = parts[0].split(separator: ",").compactMap { Double($0) }
        guard b.count == 4, parts.count == 2,
              app == "Safari" ? tabMatches(parts[1], desired: expectedURL) : browserURLMatches(parts[1], desired: expectedURL) else {
            throw modeError("\(app) не подтвердил нужную вкладку.")
        }
        let rect = CGRect(x: b[0], y: b[1], width: b[2]-b[0], height: b[3]-b[1])
        let expected = fullScreen ? target.rect : target.usableRect
        guard abs(rect.midX - expected.midX) < 40, abs(rect.midY - expected.midY) < 60,
              abs(rect.width - expected.width) < 40, abs(rect.height - expected.height) < 80 else {
            throw modeError("\(app) не занял назначенный монитор целиком.")
        }
        verifiedWindows.append(["app":app, "windowID":id, "display":target.screen.localizedName,
                                "frame":[rect.minX,rect.minY,rect.width,rect.height], "url":parts[1]])
    }
    private func browserURLMatches(_ actual: String, desired: String) -> Bool {
        guard desired.hasPrefix(erpBaseURL + "?"), let a = URLComponents(string: actual), let d = URLComponents(string: desired) else {
            return actual.hasPrefix(desired)
        }
        return a.host == d.host && a.path == d.path && (d.queryItems ?? []).allSatisfy { expected in
            a.queryItems?.contains(expected) == true
        }
    }
    private func arrangeTelegramSplitView(on target: DisplayTarget) throws {
        guard let telegram = try runningApplication(telegramIDs[0], launch: true),
              let lite = try runningApplication(telegramIDs[1], launch: true) else {
            throw modeError("Не найдены оба приложения Telegram.")
        }
        telegram.activate(options: [.activateAllWindows])
        try raiseWindow(of: telegram)
        pumpRunLoop(0.2)
        if telegramSplitIsExact(telegram: telegram, lite: lite, target: target) {
            verifiedWindows.append(["reusedTelegramPair":true,"telegramPIDs":[telegram.processIdentifier,lite.processIdentifier]])
            return
        }

        window.orderOut(nil)
        // Remove every other app from the chooser, preserving its windows and
        // documents. This also repairs an existing Telegram + Notes pairing.
        let hiddenForPairing = workspace.runningApplications.filter {
            $0.activationPolicy == .regular && !$0.isHidden &&
            !telegramIDs.contains($0.bundleIdentifier ?? "") && $0.bundleIdentifier != "com.piura.modes"
        }
        for other in hiddenForPairing { _ = other.hide() }
        defer { for other in hiddenForPairing where !other.isTerminated { other.unhide() } }
        try moveWindowToDisplay(telegram, target: target)
        try moveWindowToDisplay(lite, target: target)
        let liteRoot = AXUIElementCreateApplication(lite.processIdentifier)
        var liteWindows: CFTypeRef?
        _ = AXUIElementCopyAttributeValue(liteRoot, kAXWindowsAttribute as CFString, &liteWindows)
        guard (liteWindows as? [AXUIElement] ?? []).filter({ isDocumentWindow($0) }).count == 1,
              hiddenForPairing.allSatisfy({ $0.isHidden || $0.isTerminated }) else {
            throw modeError("Не удалось изолировать единственное окно Telegram Lite. Чужое окно не выбрано.")
        }
        telegram.activate(options: [.activateAllWindows])
        pumpRunLoop(0.4)
        try selectLeftFullScreenTile(of: telegram)
        // Only Telegram Lite remains eligible, so this cannot select Notes.
        pumpRunLoop(1.2)
        if telegramSplitIsExact(telegram: telegram, lite: lite, target: target) { return }
        let pendingWindow = try firstWindow(of: telegram)
        var pendingFullScreen: CFTypeRef?
        _ = AXUIElementCopyAttributeValue(pendingWindow, "AXFullScreen" as CFString, &pendingFullScreen)
        guard pendingFullScreen as? Bool == true else {
            let frame = windowRect(pendingWindow).map { "\(Int($0.minX)),\(Int($0.minY)); \(Int($0.width))×\(Int($0.height))" } ?? "неизвестно"
            throw modeError("Telegram не перешёл в полноэкранную левую половину (\(frame); \(menuTrace.joined(separator: " · "))).")
        }
        postPointerMove(to: CGPoint(x: target.rect.minX + target.rect.width * 0.75, y: target.rect.midY))
        pumpRunLoop(0.35)
        postPointerClick(at: CGPoint(x: target.rect.minX + target.rect.width * 0.75, y: target.rect.midY))
        let pairDeadline = Date().addingTimeInterval(6)
        while Date() < pairDeadline {
            if telegramSplitIsExact(telegram: telegram, lite: lite, target: target) { return }
            pumpRunLoop(0.15)
        }
        guard telegramSplitIsExact(telegram: telegram, lite: lite, target: target) else {
            throw modeError("macOS не объединила Telegram в один полноэкранный Split View.")
        }
    }
    private func moveWindowToDisplay(_ app: NSRunningApplication, target: DisplayTarget) throws {
        var window = try firstWindow(of: app)
        var fullscreen: CFTypeRef?
        if AXUIElementCopyAttributeValue(window, "AXFullScreen" as CFString, &fullscreen) == .success,
           fullscreen as? Bool == true {
            _ = AXUIElementSetAttributeValue(window, "AXFullScreen" as CFString, kCFBooleanFalse)
            let deadline = Date().addingTimeInterval(5)
            repeat {
                pumpRunLoop(0.2)
                _ = AXUIElementCopyAttributeValue(window, "AXFullScreen" as CFString, &fullscreen)
            } while fullscreen as? Bool == true && Date() < deadline
            pumpRunLoop(0.5)
            window = try firstWindow(of: app)
        }
        _ = AXUIElementSetAttributeValue(window, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
        var point = CGPoint(x: target.rect.minX + 120, y: target.rect.minY + 120)
        if let value = AXValueCreate(.cgPoint, &point) {
            _ = AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, value)
        }
        pumpRunLoop(0.25)
    }
    private func pressMenuPath(of app: NSRunningApplication, titles: [String]) throws {
        activateAndDismissMenus(app)
        let application = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(application, 1)
        var menuBar: CFTypeRef?
        guard AXUIElementCopyAttributeValue(application, kAXMenuBarAttribute as CFString, &menuBar) == .success,
              let menuBar, CFGetTypeID(menuBar) == AXUIElementGetTypeID() else { throw modeError("Не найдено меню приложения.") }
        let root = menuBar as! AXUIElement
        var current = root
        for (index, title) in titles.enumerated() {
            guard var item = descendant(of: current, title: title, deadline: Date().addingTimeInterval(2)) else {
                throw modeError("Нет команды окна «\(title)» в \(app.localizedName ?? "Telegram").")
            }
            if let frame = windowRect(item) {
                menuTrace.append("\(title)=\(Int(frame.minX)),\(Int(frame.minY));\(Int(frame.width))×\(Int(frame.height))")
            }
            if index > 0 && index < titles.count - 1 {
                // This menu opens its submenu only on a genuine pointer hover.
                guard let frame = windowRect(item) else { throw modeError("Нет границ подменю «\(title)».") }
                _ = AXUIElementPerformAction(item, kAXPressAction as CFString)
                postPointerMove(to: CGPoint(x: frame.midX, y: frame.minY - frame.height * 0.7))
                pumpRunLoop(0.2)
                postPointerMove(to: CGPoint(x: frame.midX, y: frame.midY))
                pumpRunLoop(1.2)
            } else if index == titles.count - 1 && index > 0 {
                if AXUIElementPerformAction(item, kAXPressAction as CFString) == .success {
                    pumpRunLoop(0.4)
                    return
                }
                var frame = windowRect(item)
                let visibleDeadline = Date().addingTimeInterval(2)
                while (frame?.width ?? 0) <= 1 && Date() < visibleDeadline {
                    pumpRunLoop(0.1)
                    if let refreshed = descendant(of: current, title: title, deadline: Date()) {
                        item = refreshed
                        frame = windowRect(refreshed)
                    }
                }
                guard let frame, frame.width > 1, frame.height > 1 else { throw modeError("Команда «\(title)» не показалась на экране.") }
                postPointerClick(at: CGPoint(x: frame.midX, y: frame.midY))
            } else if AXUIElementPerformAction(item, kAXPressAction as CFString) != .success {
                throw modeError("Не удалось открыть «\(title)».")
            }
            current = root
            pumpRunLoop(0.25)
        }
    }
    private func selectLeftFullScreenTile(of app: NSRunningApplication) throws {
        app.activate(options: [.activateAllWindows])
        pumpRunLoop(0.4)
        // Open the real menu first; hidden submenu AppleScript clicks can fail.
        // Never substitute Move & Resize: that is not a fullscreen Space.
        try pressMenuPath(of: app, titles: ["Window", "Full Screen Tile", "Left of Screen"])
    }
    private func descendant(of root: AXUIElement, title: String, deadline: Date, role: String? = nil) -> AXUIElement? {
        repeat {
            var queue: [(AXUIElement, Int)] = [(root, 0)], visited = 0
            while !queue.isEmpty, visited < 800 {
                let (element, depth) = queue.removeFirst(); visited += 1
                var value: CFTypeRef?
                for attribute in [kAXTitleAttribute, kAXDescriptionAttribute, kAXIdentifierAttribute] {
                    value = nil
                    if AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success {
                        let candidate = value as? String ?? ""
                        let matches = candidate == title || candidate.caseInsensitiveCompare(title) == .orderedSame || (["Control Center","Do Not Disturb"].contains(title) && candidate.hasPrefix(title+","))
                        if matches && (role == nil || axString(element,kAXRoleAttribute) == role) { return element }
                        }
                    }
                guard depth < 8 else { continue }
                value = nil
                if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value) == .success,
                   let children = value as? [AXUIElement] { queue.append(contentsOf: children.map { ($0, depth + 1) }) }
            }
            pumpRunLoop(0.1)
        } while Date() < deadline
        return nil
    }
    private func postPointerMove(to point: CGPoint) {
        let source = CGEventSource(stateID: .hidSystemState)
        CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    }
    private func postPointerClick(at point: CGPoint) {
        let source = CGEventSource(stateID: .hidSystemState)
        CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
        CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    }
    private func pressElementAt(x: CGFloat, y: CGFloat) throws {
        let system = AXUIElementCreateSystemWide()
        var hit: AXUIElement?
        guard AXUIElementCopyElementAtPosition(system, Float(x), Float(y), &hit) == .success, var element = hit else {
            throw modeError("Не найдено второе окно для Split View в точке \(Int(x)),\(Int(y)).")
        }
        var inspected: [String] = []
        for _ in 0..<8 {
            var actions: CFArray?
            let names: [String]
            if AXUIElementCopyActionNames(element, &actions) == .success {
                names = actions as? [String] ?? []
            } else { names = [] }
            var roleValue: CFTypeRef?, titleValue: CFTypeRef?
            _ = AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleValue)
            _ = AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &titleValue)
            inspected.append("\((roleValue as? String) ?? "?"):\((titleValue as? String) ?? ""):\(names.joined(separator: ","))")
            if !names.isEmpty {
                // The Split View chooser exposes app thumbnails as either a
                // pressable item or a raisable window, depending on macOS.
                for action in [kAXPressAction, kAXRaiseAction, "AXPick"] where names.contains(action) {
                    if AXUIElementPerformAction(element, action as CFString) == .success { return }
                }
            }
            var parent: CFTypeRef?
            guard AXUIElementCopyAttributeValue(element, kAXParentAttribute as CFString, &parent) == .success,
                  let parent, CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
            element = parent as! AXUIElement
        }
        throw modeError("Не удалось выбрать Telegram Lite второй половиной (\(Int(x)),\(Int(y)); \(inspected.joined(separator: " > "))).")
    }
    private func telegramSplitIsExact(telegram: NSRunningApplication, lite: NSRunningApplication, target: DisplayTarget) -> Bool {
        guard let first = try? firstWindow(of: telegram), let second = try? firstWindow(of: lite),
              let a = windowRect(first), let b = windowRect(second) else { return false }
        let left = a, right = b
        var aFull: CFTypeRef?, bFull: CFTypeRef?
        _ = AXUIElementCopyAttributeValue(first, "AXFullScreen" as CFString, &aFull)
        _ = AXUIElementCopyAttributeValue(second, "AXFullScreen" as CFString, &bFull)
        let r = target.rect, tolerance: CGFloat = 24
        let bothFullScreen = aFull as? Bool == true && bFull as? Bool == true
        let expected = r
        // Matching frames alone can describe windows in two DIFFERENT Spaces.
        // Both exact app PIDs must also be visible in the same active display.
        let visible = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        let visiblePIDs = Set(visible.filter { ($0[kCGWindowLayer as String] as? Int) == 0 }.compactMap { $0[kCGWindowOwnerPID as String] as? Int32 })
        let exact =
            bothFullScreen &&
            visiblePIDs.contains(telegram.processIdentifier) && visiblePIDs.contains(lite.processIdentifier) &&
            abs(left.minX - expected.minX) < tolerance && abs(right.maxX - expected.maxX) < tolerance &&
            abs(left.minY - expected.minY) < tolerance && abs(right.minY - expected.minY) < tolerance &&
            abs(left.height - expected.height) < tolerance && abs(right.height - expected.height) < tolerance &&
            abs(right.minX - left.maxX) < 18 && abs(left.width - right.width) < 16
        if exact {
            verifiedWindows.append(["app": telegram.bundleIdentifier ?? "", "frame": [left.minX, left.minY, left.width, left.height], "splitView": true])
            verifiedWindows.append(["app": lite.bundleIdentifier ?? "", "frame": [right.minX, right.minY, right.width, right.height], "splitView": true])
        }
        return exact
    }
    private func arrangeChatGPT(on target: DisplayTarget) throws {
        let candidates = ["com.openai.chat", "com.openai.codex"]
        guard let id = candidates.first(where: { workspace.urlForApplication(withBundleIdentifier: $0) != nil }),
              let app = try runningApplication(id, launch: true) else { throw modeError("Приложение ChatGPT не найдено.") }
        try fullScreenWindow(of: app, on: target)
        app.activate(options: [.activateAllWindows])
    }
    private func fullScreenWindow(of app: NSRunningApplication, on target: DisplayTarget, selected: AXUIElement? = nil) throws {
        var element = try selected ?? firstWindow(of: app)
        let selectedTitle = axString(element, kAXTitleAttribute)
        func refreshSelectedWindow() {
            guard selected != nil, !selectedTitle.isEmpty else { return }
            // Chromium can replace its AX window when entering a new Space.
            // Rebind by the SAME document title, never by the first app window.
            var windows: CFTypeRef?
            _ = AXUIElementCopyAttributeValue(AXUIElementCreateApplication(app.processIdentifier), kAXWindowsAttribute as CFString, &windows)
            if let match = (windows as? [AXUIElement] ?? []).first(where: { isDocumentWindow($0) && axString($0,kAXTitleAttribute) == selectedTitle }) { element = match }
        }
        func exact(_ item: AXUIElement) -> Bool {
            var full: CFTypeRef?
            _ = AXUIElementCopyAttributeValue(item, "AXFullScreen" as CFString, &full)
            guard full as? Bool == true, let rect = windowRect(item) else { return false }
            return abs(rect.minX - target.rect.minX) < 4 && abs(rect.minY - target.rect.minY) < 4 &&
                abs(rect.width - target.rect.width) < 4 && abs(rect.height - target.rect.height) < 4
        }
        if !exact(element) {
            app.activate(options: [])
            _ = AXUIElementPerformAction(element, kAXRaiseAction as CFString)
            try placeWindow(of: app, in: target.usableRect, raise: true, selected: element)
            if selected == nil { element = try firstWindow(of: app) }
            guard AXUIElementSetAttributeValue(element, "AXFullScreen" as CFString, kCFBooleanTrue) == .success else {
                throw modeError("Не удалось включить полный экран \(app.localizedName ?? "").")
            }
            let deadline = Date().addingTimeInterval(6)
            var stable = 0
            var triedBrowserMenu = false
            let menuFallbackAt = Date().addingTimeInterval(1)
            while stable < 2 && Date() < deadline {
                refreshSelectedWindow()
                stable = exact(element) ? stable + 1 : 0
                if stable == 0 && !triedBrowserMenu && Date() >= menuFallbackAt && app.bundleIdentifier == "ru.yandex.desktop.yandex-browser" {
                    var flag: CFTypeRef?
                    _ = AXUIElementCopyAttributeValue(element,"AXFullScreen" as CFString,&flag)
                    if flag as? Bool == false {
                        triedBrowserMenu = true
                        _ = AXUIElementPerformAction(element,kAXRaiseAction as CFString)
                        _ = AXUIElementSetAttributeValue(element,kAXMainAttribute as CFString,kCFBooleanTrue)
                        // The named Enter command cannot accidentally toggle
                        // an already-fullscreen browser back out of its Space.
                        try? pressMenuPath(of:app,titles:["View","Enter Full Screen"])
                    }
                }
                pumpRunLoop(0.15)
            }
        }
        guard exact(element), let rect = windowRect(element) else {
            var flag: CFTypeRef?
            _ = AXUIElementCopyAttributeValue(element,"AXFullScreen" as CFString,&flag)
            verifiedWindows.append(["fullScreenFailure":app.bundleIdentifier ?? "", "title":selectedTitle, "flag":flag as? Bool ?? false, "frame":windowRect(element).map { [$0.minX,$0.minY,$0.width,$0.height] } ?? []])
            throw modeError("\(app.localizedName ?? "") не подтвердило настоящий полный экран.")
        }
        app.activate(options: [])
        _ = AXUIElementPerformAction(element, kAXRaiseAction as CFString)
        verifiedWindows.append(["app":app.bundleIdentifier ?? "", "fullScreen":true,
                                "display":target.screen.localizedName,
                                "frame":[rect.minX,rect.minY,rect.width,rect.height]])
    }
    private func runningApplication(_ id: String, launch: Bool) throws -> NSRunningApplication? {
        let existing = workspace.runningApplications.first(where: { $0.bundleIdentifier == id && !$0.isTerminated })
        if let existing {
            let root = AXUIElementCreateApplication(existing.processIdentifier)
            var value: CFTypeRef?
            _ = AXUIElementCopyAttributeValue(root, kAXWindowsAttribute as CFString, &value)
            if (value as? [AXUIElement] ?? []).contains(where: isDocumentWindow) {
                if existing.isHidden { existing.unhide() }
                return existing
            }
        }
        guard launch, let url = workspace.urlForApplication(withBundleIdentifier: id) else { return existing }
        let configuration = NSWorkspace.OpenConfiguration()
        // Reopen only if no document window exists; preserve valid Spaces.
        configuration.activates = telegramIDs.contains(id)
        var completed = false
        var openedApp: NSRunningApplication?
        var launchError: Error?
        workspace.openApplication(at: url, configuration: configuration) { app, error in
            openedApp = app; launchError = error; completed = true
        }
        let deadline = Date().addingTimeInterval(12)
        while !completed && Date() < deadline { pumpRunLoop(0.1) }
        if let launchError { throw launchError }
        if let openedApp { activateAndDismissMenus(openedApp) }
        return openedApp
    }
    private func activateAndDismissMenus(_ app: NSRunningApplication) {
        app.activate(options: [.activateAllWindows])
        let root = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 1)
        _ = AXUIElementSetAttributeValue(root, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
        var bar: CFTypeRef?
        if AXUIElementCopyAttributeValue(root, kAXMenuBarAttribute as CFString, &bar) == .success,
           let bar, CFGetTypeID(bar) == AXUIElementGetTypeID() {
            var children: CFTypeRef?
            _ = AXUIElementCopyAttributeValue(bar as! AXUIElement, kAXChildrenAttribute as CFString, &children)
            for item in children as? [AXUIElement] ?? [] {
                _ = AXUIElementPerformAction(item, kAXCancelAction as CFString)
            }
        }
        pumpRunLoop(0.3)
    }
    private func isDocumentWindow(_ candidate: AXUIElement) -> Bool {
        var role: CFTypeRef?, subrole: CFTypeRef?
        _ = AXUIElementCopyAttributeValue(candidate, kAXRoleAttribute as CFString, &role)
        _ = AXUIElementCopyAttributeValue(candidate, kAXSubroleAttribute as CFString, &subrole)
        return role as? String == kAXWindowRole && subrole as? String == kAXStandardWindowSubrole
    }
    private func firstWindow(of app: NSRunningApplication) throws -> AXUIElement {
        let element = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(element, 1)
        let deadline = Date().addingTimeInterval(8)
        var lastError = AXError.noValue
        repeat {
            var value: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, kAXFocusedWindowAttribute as CFString, &value) == .success,
               let value, CFGetTypeID(value) == AXUIElementGetTypeID(), isDocumentWindow(value as! AXUIElement) {
                return value as! AXUIElement
            }
            value = nil
            lastError = AXUIElementCopyAttributeValue(element, kAXWindowsAttribute as CFString, &value)
            if lastError == .success,
               let windows = value as? [AXUIElement], let window = windows.first(where: isDocumentWindow) { return window }
            // Some native apps expose AXMainWindow/AXFocusedWindow while their
            // AXWindows collection is temporarily empty or unsupported.
            for attribute in [kAXMainWindowAttribute, kAXFocusedWindowAttribute] {
                value = nil
                if AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success,
                   let value, CFGetTypeID(value) == AXUIElementGetTypeID(),
                   isDocumentWindow(value as! AXUIElement) { return (value as! AXUIElement) }
            }
            value = nil
            if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value) == .success,
               let children = value as? [AXUIElement] {
                if let child = children.first(where: isDocumentWindow) { return child }
            }
            pumpRunLoop(0.15)
        } while Date() < deadline
        throw modeError("Нет доступного окна \(app.localizedName ?? "приложения") (AX \(lastError.rawValue)).")
    }
    private func placeWindow(of app: NSRunningApplication, in rect: CGRect, raise: Bool, selected: AXUIElement? = nil) throws {
        var element = try selected ?? firstWindow(of: app)
        var fullscreen: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, "AXFullScreen" as CFString, &fullscreen) == .success,
           (fullscreen as? Bool) == true {
            guard AXUIElementSetAttributeValue(element, "AXFullScreen" as CFString, kCFBooleanFalse) == .success else {
                throw modeError("Выйдите из полноэкранного режима \(app.localizedName ?? "приложения").")
            }
            let exitDeadline = Date().addingTimeInterval(5)
            repeat {
                pumpRunLoop(0.2)
                fullscreen = nil
                _ = AXUIElementCopyAttributeValue(element, "AXFullScreen" as CFString, &fullscreen)
            } while fullscreen as? Bool == true && Date() < exitDeadline
            if selected == nil { element = try firstWindow(of: app) }
        }
        _ = AXUIElementSetAttributeValue(element, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
        var point = rect.origin
        var size = rect.size
        guard let position = AXValueCreate(.cgPoint, &point), let dimensions = AXValueCreate(.cgSize, &size) else { throw modeError("Не удалось вычислить положение окна.") }
        var actual: CGRect?
        for _ in 0..<6 {
            _ = AXUIElementSetAttributeValue(element, kAXPositionAttribute as CFString, position)
            let resize = AXUIElementSetAttributeValue(element, kAXSizeAttribute as CFString, dimensions)
            let move = AXUIElementSetAttributeValue(element, kAXPositionAttribute as CFString, position)
            guard move == .success && resize == .success else { throw modeError("macOS не разрешила переместить окно \(app.localizedName ?? "приложения").") }
            if raise { _ = AXUIElementPerformAction(element, kAXRaiseAction as CFString) }
            pumpRunLoop(0.2)
            actual = windowRect(element)
            if let actual, abs(actual.minX - rect.minX) < 4, abs(actual.minY - rect.minY) < 4,
               abs(actual.width - rect.width) < 4, abs(actual.height - rect.height) < 4 {
                verifiedWindows.append(["app": app.bundleIdentifier ?? "", "frame": [actual.minX, actual.minY, actual.width, actual.height]])
                return
            }
        }
        let detail = actual.map { "\(Int($0.minX)),\(Int($0.minY)); \(Int($0.width))×\(Int($0.height))" } ?? "неизвестно"
        throw modeError("Окно \(app.localizedName ?? "приложения") не сохранило нужное положение (\(detail)).")
    }
    private func windowRect(_ window: AXUIElement) -> CGRect? {
        var position: CFTypeRef?, dimensions: CFTypeRef?
        guard AXUIElementCopyAttributeValue(window, kAXPositionAttribute as CFString, &position) == .success,
              AXUIElementCopyAttributeValue(window, kAXSizeAttribute as CFString, &dimensions) == .success,
              let position, let dimensions, CFGetTypeID(position) == AXValueGetTypeID(),
              CFGetTypeID(dimensions) == AXValueGetTypeID() else { return nil }
        var point = CGPoint.zero, size = CGSize.zero
        guard AXValueGetValue(position as! AXValue, .cgPoint, &point),
              AXValueGetValue(dimensions as! AXValue, .cgSize, &size) else { return nil }
        return CGRect(origin: point, size: size)
    }
    private func raiseWindow(of app: NSRunningApplication) throws {
        _ = AXUIElementPerformAction(try firstWindow(of: app), kAXRaiseAction as CFString)
    }
    private func startYandexMusic() -> Bool {
        let readState = """
        (() => {
          const controls = document.querySelector('[class*="VibePlayerControls_root"]');
          if (navigator.mediaSession?.playbackState === 'playing') return 'already-playing';
          const pause = controls?.querySelector('button[aria-label*="Пауза"],button[title*="Пауза"]');
          if (pause) return 'already-playing';
          const play = controls?.querySelector('button[aria-label="Воспроизведение"],button[aria-label*="Воспроизвести"],button[aria-label*="Play"]');
          if (!play) return 'missing';
          return 'ready';
        })()
        """
        func script(_ javascript: String) -> String { """
        tell application "Yandex"
          repeat with w in every window
            repeat with t in every tab of w
              if URL of t starts with "\(musicURL)" then return execute t javascript "\(appleScriptEscape(javascript))"
            end repeat
          end repeat
        end tell
        """ }
        var clicked = false
        for _ in 0..<12 {
            let state = try? runAppleScript(script(readState))
            if state == "already-playing" {
                verifiedWindows.append(["musicPlaying":true, "playClicks":clicked ? 1 : 0])
                return true
            }
            if state == "ready" && !clicked {
                clicked = true
                let playOnce = readState.replacingOccurrences(of: "return 'ready';", with: "play.click(); return 'pending';")
                _ = try? runAppleScript(script(playOnce))
            }
            pumpRunLoop(0.5)
        }
        verifiedWindows.append(["musicPlaying":false, "playClicks":clicked ? 1 : 0])
        return false
    }
    private func configureMusic(for mode:WorkMode) throws {
        // Moderate output levels, without a separate app or blocking UI step.
        let volume = mode == .morning ? 25 : 40
        guard let source = Bundle.main.url(forResource:"music-appearance",withExtension:"js") else { throw modeError("Нет оформления музыки.") }
        let inspect = try String(contentsOf:source,encoding:.utf8)
            .components(separatedBy:"\n").filter { !$0.trimmingCharacters(in:.whitespaces).hasPrefix("//") }.joined(separator:"\n")
            .replacingOccurrences(of:"PIURA_MODE",with:"'\(mode.rawValue)'")
        let result = try runAppleScript("""
        set volume output volume \(volume)
        tell application "Yandex" to return execute active tab of window id \(leftWindowID) javascript "\(appleScriptEscape(inspect))"
        """)
        verifiedWindows.append(["musicAppearance":result,"outputVolume":volume])
        if mode == .morning && !result.contains("\"light\":true") { throw modeError("Светлая музыка не подтверждена.") }
    }
    private func verifyERPMusicPlaying() throws {
        var clicked = false
        let deadline = min(Date().addingTimeInterval(12), runDeadline)
        while Date() < deadline {
            let command = clicked ? "false" : "true"
            let javascript = """
            (() => {
              const frame=document.getElementById('moduleFrame');
              const doc=frame?.contentDocument;
              const card=doc?.getElementById('musicCard');
              const button=doc?.getElementById('musicPlay');
              if(card?.classList.contains('is-playing'))return 'playing';
              if(!frame||!doc||!card||!button)return 'loading';
              if(\(command)){button.click();return 'clicked'}
              return 'waiting';
            })()
            """
            let state = try runAppleScript("tell application \"Yandex\" to execute active tab of window id \(erpWindowID) javascript \"\(appleScriptEscape(javascript))\"")
            if state == "playing" {
                verifiedWindows.append(["musicPlaying":true,"musicControlledFromERP":true,"playClicks":clicked ? 1 : 0])
                return
            }
            if state == "clicked" { clicked = true }
            pumpRunLoop(0.4)
        }
        verifiedWindows.append(["musicPlaying":false,"musicControlledFromERP":true,"playClicks":clicked ? 1 : 0])
        throw modeError("кнопка Play нажата, но встроенный плеер не подтвердил воспроизведение")
    }
    private func restoreForeground(for mode: WorkMode) throws {
        var failures: [String] = []
        func attempt(_ action: () throws -> Void) {
            do { try action() } catch { failures.append(error.localizedDescription) }
        }
        attempt {
        if mode == .morning {
            let result = try runAppleScript("""
            tell application "Yandex"
              set previewTabNumber to 0
              set tabNumber to 0
              repeat with t in every tab of window id \(leftWindowID)
                set tabNumber to tabNumber + 1
                if URL of t starts with "\(morningAdminPreviewBaseURL)" then set previewTabNumber to tabNumber
              end repeat
              if previewTabNumber is 0 then error "Нет вкладки целей и планов."
              set active tab index of window id \(leftWindowID) to previewTabNumber
              set minimized of window id \(leftWindowID) to false
              return URL of active tab of window id \(leftWindowID)
            end tell
            """)
            guard result.hasPrefix(morningAdminPreviewURL) else { throw modeError("Слева не открылся обзор целей и планов.") }
            verifiedWindows.append(["morningLeftForeground":"goals-only","musicControlledFromERP":true])
        }
        }
        attempt {
        if mode != .learning,
           let yandex = workspace.runningApplications.first(where: { $0.bundleIdentifier == "ru.yandex.desktop.yandex-browser" }) {
            let visible = CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
            let alreadyVisible = rightmostDisplay().map { right in visible.contains { info in
                guard info[kCGWindowOwnerPID as String] as? Int32 == yandex.processIdentifier,
                      info[kCGWindowLayer as String] as? Int == 0,
                      let bounds = info[kCGWindowBounds as String] as? [String:Any],
                      let x = bounds["X"] as? Double,let y = bounds["Y"] as? Double,
                      let w = bounds["Width"] as? Double,let h = bounds["Height"] as? Double else { return false }
                return abs(x-right.rect.minX)<4 && abs(y-right.rect.minY)<4 && abs(w-right.rect.width)<4 && abs(h-right.rect.height)<4
            }} ?? false
            if !alreadyVisible {
                let erp = try yandexWindow(id:erpWindowID,app:yandex)
                _ = AXUIElementSetAttributeValue(erp,kAXMinimizedAttribute as CFString,kCFBooleanFalse)
                _ = AXUIElementPerformAction(erp,kAXRaiseAction as CFString)
            }
            verifiedWindows.append(["erpVisibleAtFinish":true,"reusedVisibleERP":alreadyVisible])
        }
        }
        attempt {
        if mode == .mentorship || mode == .learning,
           let safari = workspace.runningApplications.first(where: { $0.bundleIdentifier == "com.apple.Safari" }) {
            _ = try runAppleScript("tell application \"Safari\"\nset index of window id \(safariWindowID) to 1\nactivate\nend tell")
            try raiseWindow(of: safari)
            verifiedWindows.append(["centerForeground":"Safari"])
        }
        }
        attempt {
        if mode.needsChatGPT,
           let chat = workspace.runningApplications.first(where: { ["com.openai.chat", "com.openai.codex"].contains($0.bundleIdentifier ?? "") }) {
            chat.activate(options: []); try raiseWindow(of: chat)
        }
        }
        if !failures.isEmpty { throw modeError(failures.joined(separator:" · ")) }
    }
    private func verifyFinalSides(for mode: WorkMode, left: DisplayTarget, right: DisplayTarget) throws {
        // Read-only final verification: music is controlled separately by the
        // ERP card and never owns a display as part of a mode recipe.
        if mode != .learning {
            try verifyBrowserWindow(app:"Yandex",id:erpWindowID,target:right,expectedURL:mode.erpURL!)
        }
        if mode == .morning {
            try verifyBrowserWindow(app:"Yandex",id:leftWindowID,target:left,expectedURL:morningAdminPreviewURL)
        } else if mode == .mentorship {
            try verifyBrowserWindow(app:"Yandex",id:leftWindowID,target:left,expectedURL:policyURL)
        }
        if mode == .work {
            let screens = NSScreen.screens.sorted { $0.frame.midX < $1.frame.midX }
            guard screens.count == 3,
                  let telegram = workspace.runningApplications.first(where: { $0.bundleIdentifier == telegramIDs[0] }),
                  let lite = workspace.runningApplications.first(where: { $0.bundleIdentifier == telegramIDs[1] }),
                  telegramSplitIsExact(telegram:telegram,lite:lite,target:target(screens[1])) else {
                throw modeError("В конце работы на центральном экране должна быть видна пара Telegram + Telegram Lite.")
            }
            verifiedWindows.append(["finalTelegramPairVisible":true])
        }
        verifiedWindows.append(["finalSideWindowsVerified":true,"musicDisplay":"ERP control only"])
    }
    private func verifyOfficeLighting(for mode: WorkMode) throws {
        let deadline = Date().addingTimeInterval(12)
        var lastState = ""
        repeat {
            let json = try runAppleScript("tell application \"Yandex\" to execute active tab of window id \(erpWindowID) javascript \"document.documentElement.dataset.officeLighting || '{}'\"")
            lastState = json
            if let data = json.data(using: .utf8), let state = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let status = state["status"] as? String ?? ""
                if state["mode"] as? String == mode.rawValue {
                    if status == "done" { verifiedWindows.append(["officeLighting":state]); return }
                    if status == "partial" || status == "failed" {
                        verifiedWindows.append(["officeLighting":state])
                        throw modeError("Не все источники света подтвердили цвет; подробности в отчёте.")
                    }
                } else {
                    _ = try runAppleScript("tell application \"Yandex\" to execute active tab of window id \(erpWindowID) javascript \"(() => {const e=document.documentElement;if(e.dataset.officeControllerReady!=='10.2'){if(!document.getElementById('piura-office-loader-10-2')){const s=document.createElement('script');s.id='piura-office-loader-10-2';s.src='https://nikolaypiura.github.io/ERPNIKOLAY/office-modes.js?v=modes10.2';document.head.append(s)}return 'loading'}e.dataset.officeModeRequest='\(mode.rawValue)';document.dispatchEvent(new Event('piura:office-mode'));return 'started'})()\"")
                }
            }
            pumpRunLoop(0.25)
        } while Date() < deadline
        verifiedWindows.append(["officeLastState":lastState])
        let documentInfo = try? runAppleScript("tell application \"Yandex\" to execute active tab of window id \(erpWindowID) javascript \"JSON.stringify({path:location.pathname,ready:document.readyState,scripts:Array.from(document.scripts).map(s=>s.getAttribute('src'))})\"")
        verifiedWindows.append(["officeDocument":documentInfo ?? "unknown"])
        throw modeError("Нет подтверждения цветового круга. Проверьте связь с освещением.")
    }
    private func setDoNotDisturb(enabled: Bool) -> Bool {
        guard let controlCenter = workspace.runningApplications.first(where: { $0.bundleIdentifier == "com.apple.controlcenter" }) else { return false }
        let root = AXUIElementCreateApplication(controlCenter.processIdentifier)
        var button: AXUIElement?
        for attribute in ["AXExtrasMenuBar", kAXMenuBarAttribute] {
            var bar: CFTypeRef?
            _ = AXUIElementCopyAttributeValue(root,attribute as CFString,&bar)
            if let bar, CFGetTypeID(bar) == AXUIElementGetTypeID() {
                button = descendant(of:bar as! AXUIElement,title:"Control Center",deadline:Date(),role:kAXMenuBarItemRole)
                if button != nil { break }
            }
        }
        guard let button else { verifiedWindows.append(["focusResult":"Control Center button unavailable"]); return false }
        if let rect = windowRect(button) { postPointerMove(to:CGPoint(x:rect.midX,y:rect.midY)); pumpRunLoop(0.2) }
        let pressed = AXUIElementPerformAction(button,kAXPressAction as CFString)
        if pressed != .success, let rect = windowRect(button) { postPointerClick(at:CGPoint(x:rect.midX,y:rect.midY)) }
        defer {
            // Close only the system popup; never interact with a conversation.
            let source = CGEventSource(stateID:.hidSystemState)
            CGEvent(keyboardEventSource:source,virtualKey:53,keyDown:true)?.post(tap:.cghidEventTap)
            CGEvent(keyboardEventSource:source,virtualKey:53,keyDown:false)?.post(tap:.cghidEventTap)
        }
        // The stable identifier survives the label changing to the active Focus.
        guard let focus = descendant(of:root,title:"controlcenter-focus-modes",deadline:Date().addingTimeInterval(2)),
              AXUIElementPerformAction(focus,kAXPressAction as CFString) == .success else {
            verifiedWindows.append(["focusResult":"Focus control unavailable"]); return false
        }
        guard let dnd = descendant(of:root,title:"Do Not Disturb",deadline:Date().addingTimeInterval(2),role:kAXCheckBoxRole) else {
            verifiedWindows.append(["focusResult":"Do Not Disturb control unavailable"]); return false
        }
        func state() -> Bool? {
            var value: CFTypeRef?
            _ = AXUIElementCopyAttributeValue(dnd,kAXValueAttribute as CFString,&value)
            return (value as? NSNumber).map { $0.intValue != 0 }
        }
        guard let current = state() else { verifiedWindows.append(["focusResult":"Focus value unavailable"]); return false }
        if current != enabled { _ = AXUIElementPerformAction(dnd,kAXPressAction as CFString) }
        let deadline = Date().addingTimeInterval(1)
        while state() != enabled && Date() < deadline { pumpRunLoop(0.1) }
        let confirmed = state() == enabled
        verifiedWindows.append(["focusResult":confirmed ? "true" : "Focus value did not change","doNotDisturb":confirmed && enabled])
        return confirmed
    }
    private func hasAccessibilityAccess(promptIfNeeded: Bool) -> Bool {
        if AXIsProcessTrusted() { return true }
        guard promptIfNeeded else { return false }
        webView.evaluateJavaScript("window.piuraModeNeedsAccess()")
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
        let deadline = Date().addingTimeInterval(45)
        while Date() < deadline { if AXIsProcessTrusted() { return true }; pumpRunLoop(0.1) }
        return false
    }
    private func canControlSystemEvents() -> Bool { (try? runNativeAppleScript("tell application \"System Events\" to get name")) != nil }
    private func pumpRunLoop(_ seconds: TimeInterval) {
        if Thread.isMainThread { RunLoop.current.run(until: Date().addingTimeInterval(seconds)) }
        else { Thread.sleep(forTimeInterval: seconds) }
    }
    private typealias WindowLevelRecord = (windowID: UInt32, level: Int32)
    private typealias SkyLightMainConnection = @convention(c) () -> UInt32
    private typealias SkyLightSetWindowLevel = @convention(c) (UInt32, UInt32, Int32) -> Int32
    private typealias SkyLightSetWindowAlpha = @convention(c) (UInt32, UInt32, Float) -> Int32
    private func withSkyLight(_ operation: (UInt32, SkyLightSetWindowLevel) -> Void) {
        guard let handle = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_NOW),
              let mainSymbol = dlsym(handle, "SLSMainConnectionID"),
              let levelSymbol = dlsym(handle, "SLSSetWindowLevel") else { return }
        defer { dlclose(handle) }
        let main = unsafeBitCast(mainSymbol, to: SkyLightMainConnection.self)
        let setLevel = unsafeBitCast(levelSymbol, to: SkyLightSetWindowLevel.self)
        operation(main(), setLevel)
    }
    private func elevateVisibleYandexWindows() -> [WindowLevelRecord] {
        let candidates = visibleYandexWindowRecords()
        var elevated: [WindowLevelRecord] = []
        withSkyLight { connection, setLevel in
            for candidate in candidates where setLevel(connection, candidate.windowID, Int32(NSWindow.Level.screenSaver.rawValue)) == 0 {
                elevated.append(candidate)
            }
        }
        return elevated
    }
    private func visibleYandexWindowRecords() -> [WindowLevelRecord] {
        guard let yandex = workspace.runningApplications.first(where: { $0.bundleIdentifier == "ru.yandex.desktop.yandex-browser" && !$0.isTerminated }),
              let rows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return [] }
        return rows.compactMap { row in
            guard (row[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == yandex.processIdentifier,
                  (row[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 0 > 0,
                  let boundsValue = row[kCGWindowBounds as String] as CFTypeRef?,
                  CFGetTypeID(boundsValue) == CFDictionaryGetTypeID(),
                  let bounds = CGRect(dictionaryRepresentation: boundsValue as! CFDictionary),
                  bounds.width * bounds.height > 100_000,
                  let windowID = (row[kCGWindowNumber as String] as? NSNumber)?.uint32Value else { return nil }
            return (windowID, (row[kCGWindowLayer as String] as? NSNumber)?.int32Value ?? 0)
        }
    }
    private func visibleYandexWindowIDs() -> [UInt32] { visibleYandexWindowRecords().map(\.windowID) }
    private func setSkyLightWindowAlpha(_ windowID: UInt32, _ alpha: Float) -> Bool {
        guard let handle = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_NOW),
              let mainSymbol = dlsym(handle, "SLSMainConnectionID"),
              let alphaSymbol = dlsym(handle, "SLSSetWindowAlpha") else { return false }
        defer { dlclose(handle) }
        let main = unsafeBitCast(mainSymbol, to: SkyLightMainConnection.self)
        let setAlpha = unsafeBitCast(alphaSymbol, to: SkyLightSetWindowAlpha.self)
        return setAlpha(main(), windowID, alpha) == 0
    }
    private func restoreYandexWindowLevels(_ records: [WindowLevelRecord]) {
        withSkyLight { connection, setLevel in
            for record in records { _ = setLevel(connection, record.windowID, record.level) }
        }
    }
    private func repairYandexMusicExtension() throws {
        guard let bridgeURL = Bundle.main.url(forResource: "yandex-music-action", withExtension: "js"),
              let bridge = try? String(contentsOf: bridgeURL, encoding: .utf8) else {
            throw modeError("В приложении отсутствует мост Яндекс Музыки.")
        }
        let extensions = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Yandex/YandexBrowser/Default/Extensions/ofiimbenfigghacebjfkihnklgifkcnh", isDirectory: true)
        let versions = (try? FileManager.default.contentsOfDirectory(at: extensions, includingPropertiesForKeys: nil)) ?? []
        guard let actionURL = versions.sorted(by: { $0.lastPathComponent > $1.lastPathComponent })
            .map({ $0.appendingPathComponent("action-play.js") })
            .first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
            throw modeError("Не найден установленный контроллер Яндекс Музыки.")
        }
        let installed = (try? String(contentsOf: actionURL, encoding: .utf8)) ?? ""
        if installed.contains("PIURA_BACKGROUND_WAVE_V2") { return }
        guard installed.contains("BaseSonataControlsDesktop_sonataButton__GbwFt") else {
            throw modeError("Контроллер Яндекс Музыки обновился и требует проверки совместимости.")
        }
        try bridge.write(to: actionURL, atomically: true, encoding: .utf8)
    }
    private func modeError(_ message: String) -> NSError { NSError(domain: "PIURAModes", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    private func appleScriptEscape(_ value: String) -> String {
        value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: " ")
    }
    private func runNativeAppleScript(_ source: String) throws -> String {
        try runAppleScript(source)
    }
    @discardableResult
    private func runAppleScript(_ source: String) throws -> String {
        guard Date() < runDeadline else { throw modeError("Истекло время запуска режима; можно повторить запуск.") }
        let process = Process()
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("piura-script-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: directory) }
        let scriptURL = directory.appendingPathComponent("run.applescript")
        try ("with timeout of 18 seconds\n" + source + "\nend timeout").write(to: scriptURL, atomically: true, encoding: .utf8)
        let outURL = directory.appendingPathComponent("out"), errURL = directory.appendingPathComponent("err")
        FileManager.default.createFile(atPath: outURL.path, contents: nil)
        FileManager.default.createFile(atPath: errURL.path, contents: nil)
        let output = try FileHandle(forWritingTo: outURL), errors = try FileHandle(forWritingTo: errURL)
        defer { try? output.close(); try? errors.close() }
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = [scriptURL.path]
        process.standardOutput = output; process.standardError = errors
        try process.run()
        let deadline = min(Date().addingTimeInterval(20), runDeadline)
        while process.isRunning && Date() < deadline { pumpRunLoop(0.05) }
        if process.isRunning {
            process.terminate()
            pumpRunLoop(0.2)
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            throw modeError("macOS не ответила за 20 секунд.")
        }
        let outputText = try String(contentsOf: outURL, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let errorText = try String(contentsOf: errURL, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        guard process.terminationStatus == 0 else { throw modeError(errorText.isEmpty ? "Ошибка автоматизации macOS." : errorText) }
        return outputText
    }
    private func finishInWebView(_ result: ModeResult) {
        let payload: [String: Any] = ["ok": result.ok, "message": result.message, "requestID": requestID]
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.piuraModeFinished(\(json))")
        guard workspace.runningApplications.contains(where: { $0.bundleIdentifier == "ru.yandex.desktop.yandex-browser" }) else { return }
        let js = "(()=>{const r=\(json);window.piuraModeFinished?.(r);document.querySelectorAll('iframe').forEach(f=>f.contentWindow.postMessage({...r,type:'piura-mode-result'},location.origin));return 'delivered'})()"
        _ = try? runAppleScript("""
        tell application "Yandex"
          repeat with w in every window
            repeat with t in every tab of w
              if URL of t starts with "\(erpBaseURL)" then
                try
                  execute t javascript "\(appleScriptEscape(js))"
                end try
              end if
            end repeat
          end repeat
        end tell
        """)
    }
    private func writeReport(mode: WorkMode, preview: Bool, result: ModeResult) {
        let payload: [String: Any] = ["mode": mode.rawValue, "requestID": requestID, "preview": preview, "ok": result.ok, "message": result.message, "windows": verifiedWindows, "time": ISO8601DateFormatter().string(from: Date()), "menuTrace": menuTrace, "durationSeconds": (Date().timeIntervalSince(startedAt) * 100).rounded() / 100, "timings": timings]
        try? FileManager.default.createDirectory(at: supportDirectory, withIntermediateDirectories: true)
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: supportDirectory.appendingPathComponent("last-run.json"), options: .atomic)
            let history = supportDirectory.appendingPathComponent("Reports")
            try? FileManager.default.createDirectory(at: history, withIntermediateDirectories: true)
            try? data.write(to: history.appendingPathComponent("\(Date().timeIntervalSince1970)-\(mode.rawValue).json"), options: .atomic)
        }
    }
}
@main
struct PIURAModesMain {
    static func main() {
        let application = NSApplication.shared
        let appDelegate = AppDelegate()
        application.delegate = appDelegate
        application.run()
    }
}
