import Cocoa
import ApplicationServices
import WebKit

private enum WorkMode: String {
    case morning, climate, investments, learning, mentorship
    var title: String {
        switch self {
        case .morning: "Утро"
        case .climate: "Климат"
        case .investments: "Инвестиции"
        case .learning: "Обучение"
        case .mentorship: "Наставничество"
        }
    }
    var wallpaperResource: String {
        switch self {
        case .morning: "Magic-Morning"
        case .climate: "Climate-Cat"
        case .investments: "Investments"
        case .learning: "Learning"
        case .mentorship: "Mentorship"
        }
    }
    var erpURL: String? {
        switch self {
        case .morning: "https://nikolaypiura.github.io/ERPNIKOLAY/?module=morning&theme=light"
        case .climate, .mentorship: "https://nikolaypiura.github.io/ERPNIKOLAY/?module=overview&theme=dark"
        case .investments: "https://nikolaypiura.github.io/ERPNIKOLAY/?module=funds&theme=dark"
        case .learning: nil
        }
    }
    var needsTelegram: Bool { self == .climate || self == .investments }
    var needsChatGPT: Bool { self == .climate || self == .investments }
    var needsMusic: Bool { self == .morning || self == .climate || self == .investments }
}
private struct DisplayTarget {
    let screen: NSScreen
    let rect: CGRect
    var bounds: String { "{\(Int(rect.minX)), \(Int(rect.minY)), \(Int(rect.maxX)), \(Int(rect.maxY))}" }
}
private struct ModeResult { let ok: Bool; let message: String }

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var pageReady = false
    private var pendingLaunch: (WorkMode, Bool)?
    private var isModeRunning = false
    private var verifiedWindows: [[String: Any]] = []
    private var menuTrace: [String] = []
    private let workspace = NSWorkspace.shared
    private let adminScaleURL = "https://drive.google.com/drive/u/0/folders/1wjAuLeNUYsIzeTrBJPDWbKXQAIGKZUPG"
    private let erpBaseURL = "https://nikolaypiura.github.io/ERPNIKOLAY/"
    private let musicURL = "https://music.yandex.ru/"
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
    }
    // Native Split View temporarily hides this panel while macOS presents its
    // second-window chooser. Keep the process alive until the mode finishes.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { !isModeRunning }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return true
    }
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first(where: { $0.scheme == "piura-modes" }),
              let host = url.host, let mode = WorkMode(rawValue: host) else { return }
        let preview = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.contains(where: { $0.name == "preview" && $0.value == "1" }) ?? false
        guard pageReady else { pendingLaunch = (mode, preview); return }
        beginMode(mode, preview: preview)
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
            ("Расположение «Климат»", #selector(previewClimate), "2"),
            ("Расположение «Инвестиции»", #selector(previewInvestments), "3"),
            ("Расположение «Обучение»", #selector(previewLearning), "4"),
            ("Расположение «Наставничество»", #selector(previewMentorship), "5")
        ] {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
            item.keyEquivalentModifierMask = [.command, .shift]
            item.target = self
            diagnostics.addItem(item)
        }
        diagnosticsItem.submenu = diagnostics
        bar.addItem(diagnosticsItem)
        NSApp.mainMenu = bar
    }
    @objc private func previewMorning() { if pageReady { beginMode(.morning, preview: true) } }
    @objc private func previewClimate() { if pageReady { beginMode(.climate, preview: true) } }
    @objc private func previewInvestments() { if pageReady { beginMode(.investments, preview: true) } }
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
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        guard let url = Bundle.main.url(forResource: "modes", withExtension: "html") else { return }
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "piura", let body = message.body as? [String: Any],
              let raw = body["mode"] as? String, let mode = WorkMode(rawValue: raw) else { return }
        beginMode(mode, preview: body["preview"] as? Bool ?? false)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        guard let (mode, preview) = pendingLaunch else { return }
        pendingLaunch = nil
        beginMode(mode, preview: preview)
    }
    private func beginMode(_ mode: WorkMode, preview: Bool) {
        guard !isModeRunning else { return }
        isModeRunning = true
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        webView.evaluateJavaScript("window.piuraModeStarted('\(mode.rawValue)',\(preview))")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak self] in
            guard let self else { return }
            if !preview {
                self.window.orderOut(nil)
                NSApp.setActivationPolicy(.accessory)
            }
            let result = self.runMode(mode, preview: preview)
            self.finishInWebView(result)
            self.writeReport(mode: mode, preview: preview, result: result)
            self.isModeRunning = false
            if !preview {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    NSApp.terminate(nil)
                }
            }
        }
    }
    private func runMode(_ mode: WorkMode, preview: Bool) -> ModeResult {
        guard NSScreen.screens.count >= 3,
              let center = display(named: "Studio Display") ?? display(at: 0),
              let right = display(named: "H27P27") ?? rightmostDisplay(),
              let left = display(named: "LG UltraFine") ?? leftmostDisplay() else {
            return ModeResult(ok: false, message: "Нужны все три монитора: центральный, левый и правый.")
        }
        var notes: [String] = []
        verifiedWindows = []
        menuTrace = []
        if !preview {
            guard hasAccessibilityAccess(promptIfNeeded: true) else {
                return ModeResult(ok: false, message: "Разрешите PIURA Modes управление компьютером в настройках macOS и запустите режим снова.")
            }
            guard canControlSystemEvents() else {
                return ModeResult(ok: false, message: "Разрешите PIURA Modes управлять System Events и запустите режим снова.")
            }
            closeRegularApplications(exceptFor: mode)
            do { try setSystemDarkAppearance() } catch { notes.append("Тёмный Mac: \(error.localizedDescription)") }
            do { try setDesktopWallpaper(for: mode) } catch { notes.append("Обои рабочего стола: \(error.localizedDescription)") }
        }
        do { try arrangeSafari(on: center, mode: mode) } catch { notes.append("Safari: \(error.localizedDescription)") }
        if mode != .learning {
            do { try arrangeYandex(right: right, left: left, mode: mode) } catch { notes.append("Яндекс: \(error.localizedDescription)") }
        }
        if mode.needsTelegram {
            if AXIsProcessTrusted() {
                do { try arrangeTelegramSplitView(on: center) } catch { notes.append("Telegram: \(error.localizedDescription)") }
            } else { notes.append("для пары Telegram нужен Универсальный доступ PIURA Modes") }
        }
        if !preview {
            if mode == .morning && !setDoNotDisturb(enabled: true) { notes.append("проверьте режим «Не беспокоить»") }
            if mode.needsMusic && !startYandexMusic() { notes.append("не удалось подтвердить воспроизведение музыки") }
            if mode.needsChatGPT {
                do { try arrangeChatGPT(on: left) } catch { notes.append("ChatGPT: \(error.localizedDescription)") }
            }
        }
        let success = preview
            ? "Проверено расположение режима «\(mode.title)»."
            : "Режим «\(mode.title)» включён."
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
    private func closeRegularApplications(exceptFor mode: WorkMode) {
        var keep: Set<String> = ["com.piura.modes", "com.apple.finder", "com.apple.Safari"]
        if mode != .learning { keep.insert("ru.yandex.desktop.yandex-browser") }
        if mode.needsTelegram { keep.formUnion(telegramIDs) }
        if mode.needsChatGPT { keep.formUnion(["com.openai.chat", "com.openai.codex"]) }
        let currentPID = ProcessInfo.processInfo.processIdentifier
        let apps = workspace.runningApplications.filter { app in
            app.activationPolicy == .regular && app.processIdentifier != currentPID && (app.bundleIdentifier.map { !keep.contains($0) } ?? true)
        }
        for app in apps { _ = app.terminate() }
        let deadline = Date().addingTimeInterval(2.5)
        while Date() < deadline, apps.contains(where: { !$0.isTerminated }) { pumpRunLoop(0.15) }
        for app in apps where !app.isTerminated { _ = app.forceTerminate() }
    }
    private func setSystemDarkAppearance() throws {
        let result = try runAppleScript("tell application \"System Events\" to tell appearance preferences\nset dark mode to true\nreturn dark mode as text\nend tell")
        guard result == "true" else { throw modeError("macOS не подтвердила тёмный режим.") }
    }
    private var supportDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("PIURA Modes", isDirectory: true)
    }
    private func setDesktopWallpaper(for mode: WorkMode) throws {
        guard let source = Bundle.main.url(forResource: mode.wallpaperResource, withExtension: "png") else { throw modeError("Файл фона отсутствует в приложении.") }
        let directory = supportDirectory.appendingPathComponent("Wallpapers", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let permanentURL = directory.appendingPathComponent("\(mode.wallpaperResource).png")
        if FileManager.default.fileExists(atPath: permanentURL.path) { try FileManager.default.removeItem(at: permanentURL) }
        try FileManager.default.copyItem(at: source, to: permanentURL)
        let options: [NSWorkspace.DesktopImageOptionKey: Any] = [
            .imageScaling: NSImageScaling.scaleProportionallyUpOrDown.rawValue, .allowClipping: true,
            .fillColor: NSColor(calibratedWhite: 0.9, alpha: 1)
        ]
        // This API changes macOS desktop wallpapers, never browser backgrounds.
        for screen in NSScreen.screens { try workspace.setDesktopImageURL(permanentURL, for: screen, options: options) }
        _ = try runAppleScript("tell application \"System Events\" to tell every desktop to set picture to \"\(appleScriptEscape(permanentURL.path))\"")
    }
    private func arrangeSafari(on target: DisplayTarget, mode: WorkMode) throws {
        let action: String
        switch mode {
        case .morning:
            action = """
            set targetWindow to missing value
            repeat with w in every window
              try
                repeat with t in every tab of w
                  if URL of t contains "1wjAuLeNUYsIzeTrBJPDWbKXQAIGKZUPG" then
                    set current tab of w to t
                    set targetWindow to w
                    exit repeat
                  end if
                end repeat
              end try
              if targetWindow is not missing value then exit repeat
            end repeat
            if targetWindow is missing value then
              make new document with properties {URL:"\(adminScaleURL)"}
              set targetWindow to front window
            end if
            """
        case .climate:
            action = """
            set targetWindow to missing value
            repeat with w in every window
              try
                repeat with t in every tab of w
                  if name of t contains "Рабочая таблица" then
                    set current tab of w to t
                    set targetWindow to w
                    exit repeat
                  end if
                end repeat
              end try
              if targetWindow is not missing value then exit repeat
            end repeat
            if targetWindow is missing value then error "Не найдена закреплённая вкладка «Рабочая таблица»."
            """
        case .investments:
            let extraTabs = investmentURLs.dropFirst().map {
                "make new tab at end of tabs of targetWindow with properties {URL:\"\($0)\"}"
            }.joined(separator: "\n")
            action = """
            set targetWindow to missing value
            repeat with w in every window
              try
                repeat with t in every tab of w
                  if URL of t contains "1EmXh84m_H_4I--AbL2tRxBoONr6uTg1CxlyQpiSrFlA" then
                    set current tab of w to t
                    set targetWindow to w
                    exit repeat
                  end if
                end repeat
              end try
              if targetWindow is not missing value then exit repeat
            end repeat
            if targetWindow is missing value then
              make new document with properties {URL:"\(investmentURLs[0])"}
              set targetWindow to front window
              delay 0.4
              \(extraTabs)
            end if
            """
        case .learning:
            action = "make new document with properties {URL:\"\(courseURL)\"}\nset targetWindow to front window"
        case .mentorship:
            action = "make new document with properties {URL:\"about:blank\"}\nset targetWindow to front window"
        }
        _ = try runAppleScript("""
        tell application "Safari"
          activate
          \(action)
          set bounds of targetWindow to \(target.bounds)
          set index of targetWindow to 1
        end tell
        """)
    }
    private func arrangeYandex(right: DisplayTarget, left: DisplayTarget, mode: WorkMode) throws {
        guard let erpURL = mode.erpURL else { return }
        let leftURL = mode.needsMusic ? musicURL : policyURL
        let leftPrefix = mode.needsMusic ? musicURL : policyURL
        _ = try runAppleScript("""
        tell application "Yandex"
          activate
          set erpWindow to missing value
          set erpWindowId to -1
          repeat with w in every window
            set tabNumber to 0
            repeat with t in every tab of w
              set tabNumber to tabNumber + 1
              if URL of t starts with "\(erpBaseURL)" then
                set erpWindow to w
                set erpWindowId to id of w
                set active tab index of w to tabNumber
                exit repeat
              end if
            end repeat
            if erpWindow is not missing value then exit repeat
          end repeat
          if erpWindow is missing value then
            set erpWindow to make new window
            set erpWindowId to id of erpWindow
          end if
          set URL of active tab of erpWindow to "\(erpURL)"
          set bounds of erpWindow to \(right.bounds)
          set leftWindow to missing value
          repeat with w in every window
            if (id of w) is not erpWindowId then
              set tabNumber to 0
              repeat with t in every tab of w
                set tabNumber to tabNumber + 1
                if URL of t starts with "\(leftPrefix)" then
                  set leftWindow to w
                  set active tab index of w to tabNumber
                  exit repeat
                end if
              end repeat
            end if
            if leftWindow is not missing value then exit repeat
          end repeat
          if leftWindow is missing value then
            set leftWindow to make new window
            set URL of active tab of leftWindow to "\(leftURL)"
          end if
          set URL of active tab of leftWindow to "\(leftURL)"
          set bounds of leftWindow to \(left.bounds)
          set extraLeftWindows to {}
          repeat with w in every window
            if (id of w) is not erpWindowId and (id of w) is not (id of leftWindow) then
              set allLeftTabs to ((count of tabs of w) > 0)
              repeat with t in every tab of w
                if not (URL of t starts with "\(leftPrefix)") then
                  set allLeftTabs to false
                  exit repeat
                end if
              end repeat
              if allLeftTabs then set end of extraLeftWindows to w
            end if
          end repeat
          repeat with w in extraLeftWindows
            close w
          end repeat
          set index of erpWindow to 1
          set index of leftWindow to 1
        end tell
        """)
    }
    private func arrangeTelegramSplitView(on target: DisplayTarget) throws {
        guard let telegram = try runningApplication(telegramIDs[0], launch: true),
              let lite = try runningApplication(telegramIDs[1], launch: true) else {
            throw modeError("Не найдены оба приложения Telegram.")
        }
        if telegramSplitIsExact(telegram: telegram, lite: lite, target: target) { return }

        let safariMinimized = (try? runAppleScript("tell application \"Safari\" to if (count of windows) > 0 then set miniaturized of front window to true")) != nil
        window.orderOut(nil)
        defer {
            if safariMinimized { _ = try? runAppleScript("tell application \"Safari\" to if (count of windows) > 0 then set miniaturized of front window to false") }
        }
        try moveWindowToDisplay(telegram, target: target)
        try moveWindowToDisplay(lite, target: target)
        telegram.activate(options: [.activateAllWindows])
        pumpRunLoop(0.4)
        try selectLeftFullScreenTile(of: telegram)
        // The right half is macOS' second-window chooser. A real pointer click
        // is required here; its Mission Control thumbnail is not an AX button.
        pumpRunLoop(4.8)
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
        pumpRunLoop(5.2)
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
            pumpRunLoop(1.2)
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
        let root = AXUIElementCreateApplication(app.processIdentifier)
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
                postPointerMove(to: CGPoint(x: frame.midX, y: max(1, frame.minY - frame.height * 0.7)))
                pumpRunLoop(0.2)
                postPointerMove(to: CGPoint(x: frame.midX, y: frame.midY))
                pumpRunLoop(1.2)
            } else if index == titles.count - 1 && index > 0 {
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
        guard let bundleID = app.bundleIdentifier else { throw modeError("Не найден идентификатор Telegram.") }
        let result = try runNativeAppleScript("""
        tell application "System Events"
          set targetProcess to first application process whose bundle identifier is "\(bundleID)"
          set frontmost of targetProcess to true
          tell targetProcess
            try
              click menu item "Left of Screen" of menu 1 of menu item "Full Screen Tile" of menu 1 of menu bar item "Window" of menu bar 1
              return "left"
            on error
              try
                click menu item "Left of Screen" of menu 1 of menu item "Move & Resize" of menu 1 of menu bar item "Window" of menu bar 1
                return "left"
              on error errorMessage
                return "error:" & errorMessage
              end try
            end try
          end tell
        end tell
        """)
        menuTrace.append(result)
        guard result == "left" else { throw modeError("Не удалось включить левую полноэкранную половину Telegram (\(result)).") }
    }
    private func descendant(of root: AXUIElement, title: String, deadline: Date) -> AXUIElement? {
        repeat {
            var queue: [(AXUIElement, Int)] = [(root, 0)], visited = 0
            while !queue.isEmpty, visited < 800 {
                let (element, depth) = queue.removeFirst(); visited += 1
                var value: CFTypeRef?
                for attribute in [kAXTitleAttribute, kAXDescriptionAttribute] {
                    value = nil
                    if AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success,
                       value as? String == title { return element }
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
        let left = a.minX <= b.minX ? a : b, right = a.minX <= b.minX ? b : a
        var aFull: CFTypeRef?, bFull: CFTypeRef?
        _ = AXUIElementCopyAttributeValue(first, "AXFullScreen" as CFString, &aFull)
        _ = AXUIElementCopyAttributeValue(second, "AXFullScreen" as CFString, &bFull)
        let r = target.rect, tolerance: CGFloat = 24
        let bothFullScreen = aFull as? Bool == true && bFull as? Bool == true
        let expected = r
        let exact =
            bothFullScreen &&
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
        try placeWindow(of: app, in: target.rect, raise: true)
        app.activate(options: [.activateAllWindows])
    }
    private func runningApplication(_ id: String, launch: Bool) throws -> NSRunningApplication? {
        let existing = workspace.runningApplications.first(where: { $0.bundleIdentifier == id && !$0.isTerminated })
        guard launch, let url = workspace.urlForApplication(withBundleIdentifier: id) else { return existing }
        let configuration = NSWorkspace.OpenConfiguration()
        // Reopen even an already-running app: Telegram can be running without
        // an exposed main window after its last window was closed or hidden.
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
        return openedApp
    }
    private func firstWindow(of app: NSRunningApplication) throws -> AXUIElement {
        let element = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(element, 1)
        let deadline = Date().addingTimeInterval(8)
        var lastError = AXError.noValue
        repeat {
            var value: CFTypeRef?
            lastError = AXUIElementCopyAttributeValue(element, kAXWindowsAttribute as CFString, &value)
            if lastError == .success,
               let windows = value as? [AXUIElement], let window = windows.first { return window }
            // Some native apps expose AXMainWindow/AXFocusedWindow while their
            // AXWindows collection is temporarily empty or unsupported.
            for attribute in [kAXMainWindowAttribute, kAXFocusedWindowAttribute] {
                value = nil
                if AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success,
                   let value, CFGetTypeID(value) == AXUIElementGetTypeID() { return (value as! AXUIElement) }
            }
            value = nil
            if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value) == .success,
               let children = value as? [AXUIElement] {
                for child in children {
                    var role: CFTypeRef?
                    if AXUIElementCopyAttributeValue(child, kAXRoleAttribute as CFString, &role) == .success,
                       role as? String == kAXWindowRole { return child }
                }
            }
            pumpRunLoop(0.15)
        } while Date() < deadline
        throw modeError("Нет доступного окна \(app.localizedName ?? "приложения") (AX \(lastError.rawValue)).")
    }
    private func placeWindow(of app: NSRunningApplication, in rect: CGRect, raise: Bool) throws {
        var element = try firstWindow(of: app)
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
            element = try firstWindow(of: app)
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
        let javascript = """
        (() => {
          const controls = document.querySelector('[class*="VibePlayerControls_root"]');
          if (navigator.mediaSession?.playbackState === 'playing') return 'already-playing';
          const pause = controls?.querySelector('button[aria-label*="Пауза"],button[title*="Пауза"]');
          if (pause) return 'already-playing';
          const play = controls?.querySelector('button[aria-label="Воспроизведение"],button[aria-label*="Воспроизвести"],button[aria-label*="Play"]');
          if (!play) return 'missing';
          play.click(); return 'started';
        })()
        """
        let script = """
        tell application "Yandex"
          repeat with w in every window
            repeat with t in every tab of w
              if URL of t starts with "\(musicURL)" then return execute t javascript "\(appleScriptEscape(javascript))"
            end repeat
          end repeat
        end tell
        """
        for _ in 0..<8 {
            if let result = try? runAppleScript(script), ["started", "already-playing"].contains(result) { return true }
            pumpRunLoop(1)
        }
        return false
    }
    private func setDoNotDisturb(enabled: Bool) -> Bool {
        let script = """
        tell application "System Events"
          tell process "ControlCenter"
            try
              click first menu bar item of menu bar 1 whose description is "Control Center"
              delay 0.4
              repeat with uiItem in entire contents of window 1
                try
                  set itemName to name of uiItem as text
                  if itemName contains "Focus" or itemName contains "Фокус" then
                    perform action "AXPress" of uiItem
                    exit repeat
                  end if
                end try
              end repeat
              delay 0.4
              repeat with uiItem in entire contents of window 1
                try
                  set itemName to name of uiItem as text
                  if itemName contains "Do Not Disturb" or itemName contains "Не беспокоить" then
                    set currentValue to value of uiItem as integer
                    if currentValue is not \(enabled ? 1 : 0) then perform action "AXPress" of uiItem
                    key code 53
                    return "true"
                  end if
                end try
              end repeat
              key code 53
            end try
            return "false"
          end tell
        end tell
        """
        return (try? runNativeAppleScript(script)) == "true"
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
    private func pumpRunLoop(_ seconds: TimeInterval) { RunLoop.current.run(until: Date().addingTimeInterval(seconds)) }
    private func modeError(_ message: String) -> NSError { NSError(domain: "PIURAModes", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    private func appleScriptEscape(_ value: String) -> String {
        value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: " ")
    }
    private func runNativeAppleScript(_ source: String) throws -> String {
        var error: NSDictionary?
        guard let script = NSAppleScript(source: source) else { throw modeError("Не удалось подготовить сценарий macOS.") }
        let result = script.executeAndReturnError(&error)
        if let error { throw modeError(error[NSAppleScript.errorMessage] as? String ?? "Ошибка управления macOS.") }
        return result.stringValue ?? ""
    }
    @discardableResult
    private func runAppleScript(_ source: String) throws -> String {
        let process = Process(), input = Pipe(), output = Pipe(), errors = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-"]
        process.standardInput = input; process.standardOutput = output; process.standardError = errors
        try process.run()
        input.fileHandleForWriting.write(Data(source.utf8))
        try? input.fileHandleForWriting.close()
        let deadline = Date().addingTimeInterval(20)
        while process.isRunning && Date() < deadline { pumpRunLoop(0.05) }
        if process.isRunning { process.terminate(); throw modeError("macOS не ответила за 20 секунд.") }
        let outputText = String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        let errorText = String(decoding: errors.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        guard process.terminationStatus == 0 else { throw modeError(errorText.isEmpty ? "Ошибка автоматизации macOS." : errorText) }
        return outputText
    }
    private func finishInWebView(_ result: ModeResult) {
        let payload: [String: Any] = ["ok": result.ok, "message": result.message]
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.piuraModeFinished(\(json))")
    }
    private func writeReport(mode: WorkMode, preview: Bool, result: ModeResult) {
        let payload: [String: Any] = ["mode": mode.rawValue, "preview": preview, "ok": result.ok, "message": result.message, "windows": verifiedWindows, "time": ISO8601DateFormatter().string(from: Date())]
        try? FileManager.default.createDirectory(at: supportDirectory, withIntermediateDirectories: true)
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: supportDirectory.appendingPathComponent("last-run.json"), options: .atomic)
        }
    }
}
let application = NSApplication.shared
let appDelegate = AppDelegate()
application.delegate = appDelegate
application.run()
