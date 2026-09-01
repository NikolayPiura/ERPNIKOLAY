import Cocoa
import ApplicationServices
import WebKit

private enum WorkMode: String {
    case morning, climate
    var title: String { self == .morning ? "Утро" : "Климат" }
    var erpURL: String {
        "https://nikolaypiura.github.io/ERPNIKOLAY/?module=\(self == .morning ? "morning" : "overview")&theme=\(self == .morning ? "light" : "dark")"
    }
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
    private var pairedTelegramScreen: DisplayTarget?
    private var isRaisingPair = false
    private var activationObserver: NSObjectProtocol?
    private let workspace = NSWorkspace.shared
    private let adminScaleURL = "https://drive.google.com/drive/u/0/folders/1wjAuLeNUYsIzeTrBJPDWbKXQAIGKZUPG"
    private let erpBaseURL = "https://nikolaypiura.github.io/ERPNIKOLAY/"
    private let musicURL = "https://music.yandex.ru/"
    private let telegramIDs = ["ru.keepcoder.Telegram", "org.telegram.desktop"]

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        configureMenu()
        configureWindow()
        activationObserver = workspace.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
        ) { [weak self] note in
            guard let self, !self.isModeRunning, !self.isRaisingPair,
                  let screen = self.pairedTelegramScreen,
                  let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  let id = app.bundleIdentifier, self.telegramIDs.contains(id) else { return }
            self.isRaisingPair = true
            try? self.arrangeTelegramPair(on: screen, launch: false, activeID: id)
            self.isRaisingPair = false
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { pairedTelegramScreen == nil }
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
            ("Расположение «Климат»", #selector(previewClimate), "2")
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
    private func configureWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(self, name: "piura")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        let visible = (display(named: "Studio Display") ?? display(at: 0))?.screen.visibleFrame
            ?? NSRect(x: 0, y: 0, width: 1200, height: 820)
        let frame = NSRect(x: visible.midX - 520, y: visible.midY - 320, width: 1040, height: 640)
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
            let result = self.runMode(mode, preview: preview)
            self.finishInWebView(result)
            self.writeReport(mode: mode, preview: preview, result: result)
            self.isModeRunning = false
            if !preview && result.ok {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                    if mode == .climate {
                        self.window.orderOut(nil)
                        NSApp.setActivationPolicy(.accessory)
                    } else { NSApp.terminate(nil) }
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
        pairedTelegramScreen = nil
        if !preview {
            guard hasAccessibilityAccess(promptIfNeeded: true) else {
                return ModeResult(ok: false, message: "Разрешите PIURA Modes управление компьютером в настройках macOS и запустите режим снова.")
            }
            guard canControlSystemEvents() else {
                return ModeResult(ok: false, message: "Разрешите PIURA Modes управлять System Events и запустите режим снова.")
            }
            closeRegularApplications(exceptFor: mode)
            do { try setSystemDarkAppearance() } catch { notes.append("Тёмный Mac: \(error.localizedDescription)") }
            if mode == .morning {
                do { try setMorningDesktopWallpaper() } catch { notes.append("Обои рабочего стола: \(error.localizedDescription)") }
            }
        }
        do { try arrangeSafari(on: center, mode: mode) } catch { notes.append("Safari: \(error.localizedDescription)") }
        do { try arrangeYandex(erp: right, music: left, mode: mode) } catch { notes.append("Яндекс: \(error.localizedDescription)") }
        if mode == .climate {
            if AXIsProcessTrusted() {
                do {
                    try arrangeTelegramPair(on: center, launch: true)
                    if !preview { pairedTelegramScreen = center }
                } catch { notes.append("Telegram: \(error.localizedDescription)") }
            } else { notes.append("для пары Telegram нужен Универсальный доступ PIURA Modes") }
        }
        if !preview {
            if !setDoNotDisturb(enabled: mode == .morning) { notes.append("проверьте режим «Не беспокоить»") }
            if !startYandexMusic() { notes.append("не удалось подтвердить воспроизведение музыки") }
            // The non-destructive preview never operates the active assistant.
            if mode == .climate {
                do { try arrangeChatGPT(on: left) } catch { notes.append("ChatGPT: \(error.localizedDescription)") }
            }
        }
        let success = preview
            ? "Проверено: \(mode == .morning ? "центр — Админ Шкала, справа — Утро, слева — Музыка" : "Safari — рабочая таблица, ERP — тёмная Главная, Telegram — рядом; ChatGPT в проверке не перемещается")."
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
        var keep: Set<String> = ["com.piura.modes", "com.apple.finder", "com.apple.Safari", "ru.yandex.desktop.yandex-browser"]
        if mode == .climate { keep.formUnion(telegramIDs + ["com.openai.chat", "com.openai.codex"]) }
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
    private func setMorningDesktopWallpaper() throws {
        guard let source = Bundle.main.url(forResource: "Magic-Morning", withExtension: "png") else { throw modeError("Файл фона отсутствует в приложении.") }
        let directory = supportDirectory.appendingPathComponent("Wallpapers", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let permanentURL = directory.appendingPathComponent("Magic-Morning.png")
        if !FileManager.default.fileExists(atPath: permanentURL.path) { try FileManager.default.copyItem(at: source, to: permanentURL) }
        let options: [NSWorkspace.DesktopImageOptionKey: Any] = [
            .imageScaling: NSImageScaling.scaleProportionallyUpOrDown.rawValue, .allowClipping: true,
            .fillColor: NSColor(calibratedWhite: 0.9, alpha: 1)
        ]
        // This API changes macOS desktop wallpapers, never browser backgrounds.
        for screen in NSScreen.screens { try workspace.setDesktopImageURL(permanentURL, for: screen, options: options) }
        _ = try runAppleScript("tell application \"System Events\" to tell every desktop to set picture to \"\(appleScriptEscape(permanentURL.path))\"")
        for screen in NSScreen.screens {
            guard workspace.desktopImageURL(for: screen)?.lastPathComponent == permanentURL.lastPathComponent else {
                throw modeError("macOS не подтвердила фон на \(screen.localizedName).")
            }
        }
    }
    private func arrangeSafari(on target: DisplayTarget, mode: WorkMode) throws {
        // Find the user's pinned sheet by title; never publish its private URL.
        let matchTab = mode == .morning
            ? "URL of t contains \"1wjAuLeNUYsIzeTrBJPDWbKXQAIGKZUPG\""
            : "name of t contains \"Рабочая таблица\""
        let emptyWindowAction = mode == .morning
            ? "make new document with properties {URL:\"\(adminScaleURL)\"}"
            : "error \"Откройте Safari с закреплённой вкладкой «Рабочая таблица».\""
        let missingTabAction = mode == .morning
            ? "set targetWindow to front window\nset current tab of targetWindow to make new tab at end of tabs of targetWindow with properties {URL:\"\(adminScaleURL)\"}"
            : "error \"Не найдена закреплённая вкладка «Рабочая таблица». Откройте её в Safari.\""
        _ = try runAppleScript("""
        tell application "Safari"
          activate
          if (count of windows) is 0 then \(emptyWindowAction)
          set targetWindow to missing value
          repeat with w in every window
            repeat with t in every tab of w
              if \(matchTab) then
                set current tab of w to t
                set targetWindow to w
                exit repeat
              end if
            end repeat
            if targetWindow is not missing value then exit repeat
          end repeat
          if targetWindow is missing value then
            \(missingTabAction)
          end if
          set bounds of targetWindow to \(target.bounds)
          set index of targetWindow to 1
        end tell
        """)
    }
    private func arrangeYandex(erp right: DisplayTarget, music left: DisplayTarget, mode: WorkMode) throws {
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
          set URL of active tab of erpWindow to "\(mode.erpURL)"
          set bounds of erpWindow to \(right.bounds)
          set musicWindow to missing value
          repeat with w in every window
            if (id of w) is not erpWindowId then
              set tabNumber to 0
              repeat with t in every tab of w
                set tabNumber to tabNumber + 1
                if URL of t starts with "\(musicURL)" then
                  set musicWindow to w
                  set active tab index of w to tabNumber
                  exit repeat
                end if
              end repeat
            end if
            if musicWindow is not missing value then exit repeat
          end repeat
          if musicWindow is missing value then
            set musicWindow to make new window
            set URL of active tab of musicWindow to "\(musicURL)"
          end if
          set bounds of musicWindow to \(left.bounds)
          set extraMusicWindows to {}
          repeat with w in every window
            if (id of w) is not erpWindowId and (id of w) is not (id of musicWindow) then
              set allMusicTabs to ((count of tabs of w) > 0)
              repeat with t in every tab of w
                if not (URL of t starts with "\(musicURL)") then
                  set allMusicTabs to false
                  exit repeat
                end if
              end repeat
              if allMusicTabs then set end of extraMusicWindows to w
            end if
          end repeat
          repeat with w in extraMusicWindows
            close w
          end repeat
          set index of erpWindow to 1
          set index of musicWindow to 1
        end tell
        """)
    }
    private func arrangeTelegramPair(on target: DisplayTarget, launch: Bool, activeID: String? = nil) throws {
        let topInset: CGFloat = 25
        let r = target.rect
        let split = floor(r.width * 0.41)
        let frames = [
            CGRect(x: r.minX, y: r.minY + topInset, width: split, height: r.height - topInset),
            CGRect(x: r.minX + split, y: r.minY + topInset, width: r.width - split, height: r.height - topInset)
        ]
        for (index, id) in telegramIDs.enumerated() {
            guard let app = try runningApplication(id, launch: launch) else { throw modeError("Не найдено приложение \(id).") }
            try placeWindow(of: app, in: frames[index], raise: true)
        }
        if let activeID, let app = try runningApplication(activeID, launch: false) { try raiseWindow(of: app) }
    }
    private func arrangeChatGPT(on target: DisplayTarget) throws {
        let candidates = ["com.openai.chat", "com.openai.codex"]
        guard let id = candidates.first(where: { workspace.urlForApplication(withBundleIdentifier: $0) != nil }),
              let app = try runningApplication(id, launch: true) else { throw modeError("Приложение ChatGPT не найдено.") }
        try placeWindow(of: app, in: target.rect, raise: true)
        app.activate(options: [.activateAllWindows])
    }
    private func runningApplication(_ id: String, launch: Bool) throws -> NSRunningApplication? {
        if let app = workspace.runningApplications.first(where: { $0.bundleIdentifier == id && !$0.isTerminated }) { return app }
        guard launch, let url = workspace.urlForApplication(withBundleIdentifier: id) else { return nil }
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = false
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
        let deadline = Date().addingTimeInterval(8)
        repeat {
            var value: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, kAXWindowsAttribute as CFString, &value) == .success,
               let windows = value as? [AXUIElement], let window = windows.first { return window }
            pumpRunLoop(0.15)
        } while Date() < deadline
        throw modeError("Нет доступного окна \(app.localizedName ?? "приложения").")
    }
    private func placeWindow(of app: NSRunningApplication, in rect: CGRect, raise: Bool) throws {
        let element = try firstWindow(of: app)
        var fullscreen: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, "AXFullScreen" as CFString, &fullscreen) == .success,
           (fullscreen as? Bool) == true {
            _ = AXUIElementSetAttributeValue(element, "AXFullScreen" as CFString, kCFBooleanFalse)
            pumpRunLoop(0.8)
        }
        _ = AXUIElementSetAttributeValue(element, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
        var point = rect.origin
        var size = rect.size
        guard let position = AXValueCreate(.cgPoint, &point), let dimensions = AXValueCreate(.cgSize, &size) else { throw modeError("Не удалось вычислить положение окна.") }
        _ = AXUIElementSetAttributeValue(element, kAXPositionAttribute as CFString, position)
        let resize = AXUIElementSetAttributeValue(element, kAXSizeAttribute as CFString, dimensions)
        let move = AXUIElementSetAttributeValue(element, kAXPositionAttribute as CFString, position)
        guard move == .success && resize == .success else { throw modeError("macOS не разрешила переместить окно \(app.localizedName ?? "приложения").") }
        if raise { _ = AXUIElementPerformAction(element, kAXRaiseAction as CFString) }
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
        let payload: [String: Any] = ["mode": mode.rawValue, "preview": preview, "ok": result.ok, "message": result.message, "time": ISO8601DateFormatter().string(from: Date())]
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
