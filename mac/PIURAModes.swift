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
        case .climate: "Climate"
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
        case .learning: "https://nikolaypiura.github.io/ERPNIKOLAY/?module=overview&theme=dark"
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
    var usableRect: CGRect {
        let v = screen.visibleFrame, f = screen.frame
        return CGRect(x: v.minX, y: rect.minY + f.maxY - v.maxY, width: v.width, height: v.height)
    }
    var usableBounds: String { let r = usableRect; return "{\(Int(r.minX)), \(Int(r.minY)), \(Int(r.maxX)), \(Int(r.maxY))}" }
}
private struct ModeResult { let ok: Bool; let message: String }

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var pageReady = false
    private var pendingLaunch: (WorkMode, Bool, String)?
    private var requestID = ""
    private var runDeadline = Date.distantFuture
    private var launchConfigured = false
    private var safariWindowID = 0
    private var isModeRunning = false
    private var verifiedWindows: [[String: Any]] = []
    private var menuTrace: [String] = []
    private let workspace = NSWorkspace.shared
    private let adminScaleURL = "https://drive.google.com/drive/u/0/folders/1wjAuLeNUYsIzeTrBJPDWbKXQAIGKZUPG"
    private let workTableURL = "https://docs.google.com/spreadsheets/d/1tZFDTfb0AtUB5l7I5KbSSUUUaNOP6ux7M9SWYHb4BMc/edit?gid=720489481#gid=720489481"
    private let erpBaseURL = "https://nikolaypiura.github.io/ERPNIKOLAY/"
    private let musicURL = "https://music.yandex.ru/"
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
        if let (mode, preview, id) = pendingLaunch {
            pendingLaunch = nil
            beginMode(mode, preview: preview, id: id)
        }
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
        let id = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "request" })?.value ?? UUID().uuidString
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
        guard let url = Bundle.main.url(forResource: "modes", withExtension: "html") else { return }
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self, !self.isModeRunning, self.requestID.isEmpty else { return }
            self.window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "piura", let body = message.body as? [String: Any],
              let raw = body["mode"] as? String, let mode = WorkMode(rawValue: raw) else { return }
        beginMode(mode, preview: body["preview"] as? Bool ?? false, id: body["requestID"] as? String ?? UUID().uuidString)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
    }
    private func beginMode(_ mode: WorkMode, preview: Bool, id: String = UUID().uuidString) {
        // Keep the most recent intent instead of discarding clicks during launch.
        guard !isModeRunning else { pendingLaunch = (mode, preview, id); return }
        requestID = id
        isModeRunning = true
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
            if !preview {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    if !self.isModeRunning && self.requestID == id { NSApp.terminate(nil) }
                }
            }
        }
    }
    private func runMode(_ mode: WorkMode, preview: Bool) -> ModeResult {
        let displays = NSScreen.screens.sorted { $0.frame.midX < $1.frame.midX }.map(target)
        guard displays.count == 3 else {
            return ModeResult(ok: false, message: "Нужны все три монитора: центральный, левый и правый.")
        }
        let left = displays[0], center = displays[1], right = displays[2]
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
            let remaining = closeRegularApplications(exceptFor: mode)
            if !remaining.isEmpty { notes.append("Не закрылись (возможно, ожидают сохранения): " + remaining.joined(separator: ", ")) }
            do { try setSystemDarkAppearance() } catch { notes.append("Тёмный Mac: \(error.localizedDescription)") }
            do { try setDesktopWallpaper(for: mode) } catch { notes.append("Обои рабочего стола: \(error.localizedDescription)") }
        }
        do { try arrangeSafari(on: center, mode: mode) } catch { notes.append("Safari: \(error.localizedDescription)") }
        if pendingLaunch != nil { return ModeResult(ok: false, message: "Переключаюсь на последний выбранный режим.") }
        do { try arrangeYandex(right: right, left: left, mode: mode) } catch { notes.append("Яндекс: \(error.localizedDescription)") }
        if mode.needsTelegram {
            if AXIsProcessTrusted() {
                do { try arrangeTelegramSplitView(on: center) } catch { notes.append("Telegram: \(error.localizedDescription)") }
            } else { notes.append("для пары Telegram нужен Универсальный доступ PIURA Modes") }
        }
        if pendingLaunch != nil { return ModeResult(ok: false, message: "Переключаюсь на последний выбранный режим.") }
        if !preview {
            if mode == .morning && !setDoNotDisturb(enabled: true) { notes.append("проверьте режим «Не беспокоить»") }
            if mode.needsMusic && !startYandexMusic() { notes.append("не удалось подтвердить воспроизведение музыки") }
        }
        if mode.needsChatGPT {
            do { try arrangeChatGPT(on: left) } catch { notes.append("ChatGPT: \(error.localizedDescription)") }
        }
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
    private func closeRegularApplications(exceptFor mode: WorkMode) -> [String] {
        var keep: Set<String> = ["com.piura.modes", "com.apple.finder", "com.apple.Safari"]
        keep.insert("ru.yandex.desktop.yandex-browser")
        if mode.needsTelegram { keep.formUnion(telegramIDs) }
        if mode.needsChatGPT { keep.formUnion(["com.openai.chat", "com.openai.codex"]) }
        let currentPID = ProcessInfo.processInfo.processIdentifier
        let apps = workspace.runningApplications.filter { app in
            app.activationPolicy == .regular && app.processIdentifier != currentPID && (app.bundleIdentifier.map { !keep.contains($0) } ?? true)
        }
        for app in apps { _ = app.terminate() }
        let deadline = Date().addingTimeInterval(2.5)
        while Date() < deadline, apps.contains(where: { !$0.isTerminated }) { pumpRunLoop(0.15) }
        // Never discard unsaved work or dismiss another app's save dialog.
        return apps.filter { !$0.isTerminated }.map { $0.localizedName ?? "Приложение" }
    }
    private func setSystemDarkAppearance() throws {
        let result = try runAppleScript("tell application \"System Events\" to tell appearance preferences\nset dark mode to true\nreturn dark mode as text\nend tell")
        guard result == "true" else { throw modeError("macOS не подтвердила тёмный режим.") }
        verifiedWindows.append(["macOSAppearance":"dark"])
    }
    private var supportDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("PIURA Modes", isDirectory: true)
    }
    private func setDesktopWallpaper(for mode: WorkMode) throws {
        let directory = supportDirectory.appendingPathComponent("Wallpapers", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let options: [NSWorkspace.DesktopImageOptionKey: Any] = [
            .imageScaling: NSImageScaling.scaleProportionallyUpOrDown.rawValue, .allowClipping: true,
            .fillColor: NSColor(calibratedWhite: 0.08, alpha: 1)
        ]
        for screen in NSScreen.screens {
            let resource = mode.wallpaperResource + (screen.frame.height > screen.frame.width ? "-Portrait" : "")
            guard let source = Bundle.main.url(forResource: resource, withExtension: "png") else {
                throw modeError("Нет файла обоев \(resource).")
            }
            let destination = directory.appendingPathComponent(resource + ".png")
            let data = try Data(contentsOf: source)
            if (try? Data(contentsOf: destination)) != data { try data.write(to: destination, options: .atomic) }
            try workspace.setDesktopImageURL(destination, for: screen, options: options)
            guard let displayID = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
                throw modeError("Не найден идентификатор монитора \(screen.localizedName).")
            }
            // NSWorkspace can report the previous image while a fullscreen
            // Space is active. Address the desktop by its real display ID too.
            let confirmed = try runAppleScript("""
            tell application "System Events"
              tell desktop id \(displayID.uint32Value)
                set picture to "\(appleScriptEscape(destination.path))"
                repeat 20 times
                  if picture is "\(appleScriptEscape(destination.path))" then exit repeat
                  delay 0.1
                end repeat
                return picture as text
              end tell
            end tell
            """)
            guard confirmed == destination.path else {
                throw modeError("Монитор \(screen.localizedName) не подтвердил обои.")
            }
            verifiedWindows.append(["wallpaper":destination.path, "display":screen.localizedName,
                                    "orientation":screen.frame.height > screen.frame.width ? "portrait" : "landscape"])
        }
        verifiedWindows.append(["desktops":NSScreen.screens.count])
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
        try backupBrowserWindows("Safari")
        let root = AXUIElementCreateApplication(app.processIdentifier)
        var value: CFTypeRef?
        _ = AXUIElementCopyAttributeValue(root, kAXWindowsAttribute as CFString, &value)
        let candidates = (value as? [AXUIElement] ?? []).filter { isDocumentWindow($0) && profileName(of: $0) == mode.title }
        var id = 0
        if let existing = candidates.first {
            _ = AXUIElementSetAttributeValue(existing, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
            _ = AXUIElementPerformAction(existing, kAXRaiseAction as CFString)
            pumpRunLoop(0.25)
            id = Int(try runAppleScript("tell application \"Safari\" to return id of front window as text")) ?? 0
        } else {
            try pressMenuPath(of: app, titles: ["File", "New \(mode.title) Window"])
            pumpRunLoop(0.4)
            id = Int(try runAppleScript("tell application \"Safari\" to return id of front window as text")) ?? 0
        }
        guard id != 0, profileName(of: try firstWindow(of: app)) == mode.title else {
            throw modeError("Safari не подтвердил профиль «\(mode.title)». Личные вкладки не изменены.")
        }
        safariWindowID = id
        // Close by immutable IDs, never by shifting window indices.
        _ = try runAppleScript("""
        tell application "Safari"
          set oldIDs to id of every window
          repeat with oldID in oldIDs
            if (oldID as integer) is not \(id) then close window id (oldID as integer)
          end repeat
          repeat 40 times
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
        case .climate: required = [workTableURL]
        case .investments: required = investmentURLs + [tradingViewURL] + extras
        case .learning: required = [courseURL]
        case .mentorship: required = []
        }
        let firstSetup = !UserDefaults.standard.bool(forKey: "profileSeeded-v5.1-\(mode.rawValue)")
        for desired in required {
            let before = try safariURLs(id)
            let duplicates = before.indices.filter { tabMatches(before[$0], desired: desired) }
            for offset in duplicates.dropFirst().reversed() {
                _ = try runAppleScript("tell application \"Safari\" to close tab \(offset + 1) of window id \(id)")
            }
            let urls = try safariURLs(id)
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
            }
        }
        var urls = try safariURLs(id)
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
        if mode == .climate && UserDefaults.standard.bool(forKey: "profileSeeded-v5.1-investments") {
            for index in urls.indices.reversed() where tabMatches(urls[index], desired: tradingViewURL) {
                _ = try runAppleScript("tell application \"Safari\" to close tab \(index + 1) of window id \(id)")
            }
            urls = try safariURLs(id)
        }
        // Learning has exactly the course; other task profiles drop only empty
        // startup tabs. Climate keeps the user's remaining work tabs unchanged.
        for offset in urls.indices.reversed() {
            let blank = isSafariBlank(urls[offset])
            let remove = mode == .learning ? !tabMatches(urls[offset], desired: courseURL) :
                (mode == .morning || mode == .investments) && blank && urls.count > 1
            if remove { _ = try runAppleScript("tell application \"Safari\" to close tab \(offset + 1) of window id \(id)") }
        }
        urls = try safariURLs(id)
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
        let active = try runAppleScript("tell application \"Safari\" to return URL of current tab of window id \(id)")
        try verifyBrowserWindow(app: "Safari", id: id, target: target, expectedURL: active)
        verifiedWindows.append(["safariProfile":mode.title, "tabCount":urls.count,
                                "requiresGoogleSignIn":urls.contains(where: { $0.contains("accounts.google.com") })])
        if mode == .investments { verifiedWindows.append(["investmentTabs":urls]) }
    }
    private func arrangeYandex(right: DisplayTarget, left: DisplayTarget, mode: WorkMode) throws {
        guard let erpURL = mode.erpURL else { return }
        _ = try runningApplication("ru.yandex.desktop.yandex-browser", launch: true)
        try backupBrowserWindows("Yandex")
        let leftURL = mode.needsMusic ? musicURL : policyURL
        let needsLeft = mode != .learning
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
          set bounds of window id leftID to \(left.usableBounds)
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
          if URL of active tab of window id erpID is not "\(erpURL)" then set URL of active tab of window id erpID to "\(erpURL)"
          set minimized of window id erpID to false
          set bounds of window id erpID to \(right.usableBounds)
          set index of window id erpID to 1
          \(needsLeft ? "set index of window id leftID to 1" : "")
          return (erpID as text) & "," & (leftID as text)
        end tell
        """)
        let values = ids.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        guard values.count == 2 else { throw modeError("Не удалось выделить нужные окна Яндекса.") }
        let allIDs = try runAppleScript("tell application \"Yandex\" to return id of every window")
            .split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        verifiedWindows.append(["yandexTargetIDs":values, "yandexBeforeCleanup":allIDs])
        for oldID in allIDs where !values.contains(oldID) {
            _ = try runAppleScript("tell application \"Yandex\" to close window id \(oldID)")
        }
        pumpRunLoop(0.4)
        let remainingIDs = try runAppleScript("tell application \"Yandex\" to return id of every window")
            .split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        verifiedWindows.append(["yandexAfterCleanup":remainingIDs])
        guard Set(remainingIDs) == Set(values.filter { $0 != -1 }) else {
            throw modeError("Яндекс не подтвердил закрытие лишних окон.")
        }
        try verifyBrowserWindow(app: "Yandex", id: values[0], target: right, expectedURL: erpURL)
        if needsLeft {
            try verifyBrowserWindow(app: "Yandex", id: values[1], target: left, expectedURL: leftURL)
        } else {
            _ = try runAppleScript("tell application \"Yandex\" to set minimized of window id \(values[0]) to true")
            let minimized = try runAppleScript("tell application \"Yandex\" to return minimized of window id \(values[0]) as text")
            guard minimized == "true" else { throw modeError("ERP не свернулась для режима обучения.") }
            verifiedWindows.append(["learningERPMinimized":true])
        }
    }
    private func verifyBrowserWindow(app: String, id: Int, target: DisplayTarget, expectedURL: String) throws {
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
        guard b.count == 4, parts.count == 2, parts[1].hasPrefix(expectedURL) else {
            throw modeError("\(app) не подтвердил нужную вкладку.")
        }
        let rect = CGRect(x: b[0], y: b[1], width: b[2]-b[0], height: b[3]-b[1])
        let expected = app == "Safari" ? target.rect : target.usableRect
        guard abs(rect.midX - expected.midX) < 40, abs(rect.midY - expected.midY) < 60,
              abs(rect.width - expected.width) < 40, abs(rect.height - expected.height) < 80 else {
            throw modeError("\(app) не занял назначенный монитор целиком.")
        }
        verifiedWindows.append(["app":app, "windowID":id, "display":target.screen.localizedName,
                                "frame":[rect.minX,rect.minY,rect.width,rect.height], "url":parts[1]])
    }
    private func arrangeTelegramSplitView(on target: DisplayTarget) throws {
        guard let telegram = try runningApplication(telegramIDs[0], launch: true),
              let lite = try runningApplication(telegramIDs[1], launch: true) else {
            throw modeError("Не найдены оба приложения Telegram.")
        }
        if telegramSplitIsExact(telegram: telegram, lite: lite, target: target) {
            telegram.activate(options: [.activateAllWindows])
            try raiseWindow(of: telegram)
            return
        }

        window.orderOut(nil)
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
        let left = a, right = b
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
        try fullScreenWindow(of: app, on: target)
        app.activate(options: [.activateAllWindows])
    }
    private func fullScreenWindow(of app: NSRunningApplication, on target: DisplayTarget) throws {
        var element = try firstWindow(of: app)
        func exact(_ item: AXUIElement) -> Bool {
            var full: CFTypeRef?
            _ = AXUIElementCopyAttributeValue(item, "AXFullScreen" as CFString, &full)
            guard full as? Bool == true, let rect = windowRect(item) else { return false }
            return abs(rect.minX - target.rect.minX) < 4 && abs(rect.minY - target.rect.minY) < 4 &&
                abs(rect.width - target.rect.width) < 4 && abs(rect.height - target.rect.height) < 4
        }
        if !exact(element) {
            try placeWindow(of: app, in: target.usableRect, raise: true)
            element = try firstWindow(of: app)
            guard AXUIElementSetAttributeValue(element, "AXFullScreen" as CFString, kCFBooleanTrue) == .success else {
                throw modeError("Не удалось включить полный экран \(app.localizedName ?? "").")
            }
            let deadline = Date().addingTimeInterval(6)
            while !exact(element) && Date() < deadline { pumpRunLoop(0.2) }
        }
        guard exact(element), let rect = windowRect(element) else {
            throw modeError("\(app.localizedName ?? "") не подтвердило настоящий полный экран.")
        }
        _ = AXUIElementPerformAction(element, kAXRaiseAction as CFString)
        verifiedWindows.append(["app":app.bundleIdentifier ?? "", "fullScreen":true,
                                "display":target.screen.localizedName,
                                "frame":[rect.minX,rect.minY,rect.width,rect.height]])
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
          play.click(); return 'pending';
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
            if let result = try? runAppleScript(script), result == "already-playing" {
                verifiedWindows.append(["musicPlaying":true])
                return true
            }
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
        let payload: [String: Any] = ["mode": mode.rawValue, "requestID": requestID, "preview": preview, "ok": result.ok, "message": result.message, "windows": verifiedWindows, "time": ISO8601DateFormatter().string(from: Date()), "menuTrace": menuTrace]
        try? FileManager.default.createDirectory(at: supportDirectory, withIntermediateDirectories: true)
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: supportDirectory.appendingPathComponent("last-run.json"), options: .atomic)
            let history = supportDirectory.appendingPathComponent("Reports")
            try? FileManager.default.createDirectory(at: history, withIntermediateDirectories: true)
            try? data.write(to: history.appendingPathComponent("\(Date().timeIntervalSince1970)-\(mode.rawValue).json"), options: .atomic)
        }
    }
}
let application = NSApplication.shared
let appDelegate = AppDelegate()
application.delegate = appDelegate
application.run()
