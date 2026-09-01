import Cocoa
import ApplicationServices
import WebKit

private struct DisplayTarget {
    let screen: NSScreen
    let bounds: (Int, Int, Int, Int)
}

private struct ModeResult {
    let ok: Bool
    let message: String
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var pendingMorningLaunch: Bool?
    private var isModeRunning = false
    private let workspace = NSWorkspace.shared

    private let adminScaleURL = "https://drive.google.com/drive/u/0/folders/1wjAuLeNUYsIzeTrBJPDWbKXQAIGKZUPG"
    private let erpBaseURL = "https://nikolaypiura.github.io/ERPNIKOLAY/"
    private let erpMorningURL = "https://nikolaypiura.github.io/ERPNIKOLAY/?module=morning&theme=light"
    private let musicURL = "https://music.yandex.ru/"
    private let wallpaperPath = "/System/Library/Desktop Pictures/Sonoma.heic"

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        configureWindow()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first(where: { $0.scheme == "piura-modes" && $0.host == "morning" }) else { return }
        let preview = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.contains(where: { $0.name == "preview" && $0.value == "1" }) ?? false
        if webView == nil || webView.url == nil {
            pendingMorningLaunch = preview
            return
        }
        beginMorningMode(preview: preview, updateStatus: true)
    }

    private func configureWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(self, name: "piura")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")

        let target = display(named: "Studio Display") ?? display(at: 0)
        let visible = target?.screen.visibleFrame ?? NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1200, height: 820)
        let width = min(1220, max(920, visible.width * 0.76))
        let height = min(900, max(700, visible.height * 0.82))
        let frame = NSRect(x: visible.midX - width / 2, y: visible.midY - height / 2, width: width, height: height)

        window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "PIURA · Режимы"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isMovableByWindowBackground = true
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        guard let fileURL = Bundle.main.url(forResource: "modes", withExtension: "html") else {
            showNativeError("Не найден modes.html в приложении.")
            return
        }
        webView.loadFileURL(fileURL, allowingReadAccessTo: fileURL.deletingLastPathComponent())
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "piura", let body = message.body as? [String: Any], body["mode"] as? String == "morning" else { return }
        let preview = body["preview"] as? Bool ?? false
        beginMorningMode(preview: preview, updateStatus: false)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let preview = pendingMorningLaunch else { return }
        pendingMorningLaunch = nil
        beginMorningMode(preview: preview, updateStatus: true)
    }

    private func beginMorningMode(preview: Bool, updateStatus: Bool) {
        guard !isModeRunning else { return }
        isModeRunning = true
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if updateStatus {
            webView.evaluateJavaScript("window.piuraModeStarted(\(preview ? "true" : "false"))")
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak self] in
            guard let self else { return }
            let result = self.runMorningMode(preview: preview)
            self.finishInWebView(result)
            self.isModeRunning = false
            if !preview && result.ok {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { NSApp.terminate(nil) }
            }
        }
    }

    private func runMorningMode(preview: Bool) -> ModeResult {
        guard let center = display(named: "Studio Display") ?? display(at: 0),
              let right = display(named: "H27P27") ?? rightmostDisplay(),
              let left = display(named: "LG UltraFine") ?? leftmostDisplay() else {
            return ModeResult(ok: false, message: "Не удалось определить все три монитора.")
        }

        if !preview {
            guard hasAccessibilityAccess(promptIfNeeded: true) else {
                return ModeResult(ok: false, message: "Разрешите PIURA Modes управление компьютером в настройках macOS и нажмите «Утро» ещё раз.")
            }
            guard canControlSystemEvents() else {
                return ModeResult(ok: false, message: "Разрешите PIURA Modes управлять System Events и нажмите «Утро» ещё раз.")
            }
            closeRegularApplicationsExceptMorningSet()
            setLightAppearance()
            setMorningWallpaper()
        }

        var notes: [String] = []
        do {
            try arrangeSafari(on: center)
        } catch {
            notes.append("Safari: \(error.localizedDescription)")
        }
        do {
            try arrangeYandex(erp: right, music: left)
        } catch {
            notes.append("Яндекс: \(error.localizedDescription)")
        }

        if preview {
            return notes.isEmpty
                ? ModeResult(ok: true, message: "Готово: центр — Админ Шкала, справа — Утро, слева — Музыка.")
                : ModeResult(ok: false, message: notes.joined(separator: " · "))
        }

        let focusEnabled = enableDoNotDisturb()
        Thread.sleep(forTimeInterval: 2.2)
        let musicStarted = startYandexMusic()
        if !focusEnabled { notes.append("нужен доступ для режима «Не беспокоить»") }
        if !musicStarted { notes.append("музыку нужно запустить один раз вручную") }

        return notes.isEmpty
            ? ModeResult(ok: true, message: "Режим «Утро» включён.")
            : ModeResult(ok: true, message: "Режим включён; " + notes.joined(separator: " · "))
    }

    private func display(named name: String) -> DisplayTarget? {
        guard let screen = NSScreen.screens.first(where: { $0.localizedName == name }) else { return nil }
        return DisplayTarget(screen: screen, bounds: appleScriptBounds(for: screen))
    }

    private func display(at index: Int) -> DisplayTarget? {
        guard NSScreen.screens.indices.contains(index) else { return nil }
        let screen = NSScreen.screens[index]
        return DisplayTarget(screen: screen, bounds: appleScriptBounds(for: screen))
    }

    private func leftmostDisplay() -> DisplayTarget? {
        guard let screen = NSScreen.screens.min(by: { $0.frame.minX < $1.frame.minX }) else { return nil }
        return DisplayTarget(screen: screen, bounds: appleScriptBounds(for: screen))
    }

    private func rightmostDisplay() -> DisplayTarget? {
        guard let screen = NSScreen.screens.max(by: { $0.frame.maxX < $1.frame.maxX }) else { return nil }
        return DisplayTarget(screen: screen, bounds: appleScriptBounds(for: screen))
    }

    private func appleScriptBounds(for screen: NSScreen) -> (Int, Int, Int, Int) {
        let frame = screen.frame
        let mainHeight = NSScreen.screens.first(where: { $0.frame.origin == .zero })?.frame.height ?? NSScreen.main?.frame.height ?? frame.height
        let left = Int(frame.minX.rounded())
        let top = Int((mainHeight - frame.maxY).rounded())
        let right = Int(frame.maxX.rounded())
        let bottom = top + Int(frame.height.rounded())
        return (left, top, right, bottom)
    }

    private func closeRegularApplicationsExceptMorningSet() {
        let keep = Set([
            Bundle.main.bundleIdentifier ?? "com.piura.modes",
            "com.apple.finder",
            "com.apple.Safari",
            "ru.yandex.desktop.yandex-browser"
        ])
        for app in workspace.runningApplications where app.activationPolicy == .regular {
            guard let identifier = app.bundleIdentifier, !keep.contains(identifier) else { continue }
            _ = app.terminate()
        }
        Thread.sleep(forTimeInterval: 0.8)
    }

    private func setLightAppearance() {
        _ = try? runAppleScript("tell application \"System Events\" to tell appearance preferences to set dark mode to false")
    }

    private func setMorningWallpaper() {
        let url = URL(fileURLWithPath: wallpaperPath)
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        let options: [NSWorkspace.DesktopImageOptionKey: Any] = [
            .imageScaling: NSImageScaling.scaleProportionallyUpOrDown.rawValue,
            .allowClipping: true,
            .fillColor: NSColor(calibratedRed: 0.91, green: 0.94, blue: 0.97, alpha: 1)
        ]
        for screen in NSScreen.screens { try? workspace.setDesktopImageURL(url, for: screen, options: options) }
    }

    private func arrangeSafari(on target: DisplayTarget) throws {
        let b = target.bounds
        let script = """
        tell application "Safari"
          activate
          if (count of windows) is 0 then make new document with properties {URL:"\(adminScaleURL)"}
          set URL of current tab of front window to "\(adminScaleURL)"
          set bounds of front window to {\(b.0), \(b.1), \(b.2), \(b.3)}
        end tell
        """
        _ = try runAppleScript(script)
    }

    private func arrangeYandex(erp right: DisplayTarget, music left: DisplayTarget) throws {
        let rb = right.bounds, lb = left.bounds
        let script = """
        tell application "Yandex"
          activate
          if (count of windows) is 0 then make new window

          set erpWindow to missing value
          set erpWindowId to -1
          repeat with w in every window
            set tabNumber to 0
            repeat with t in every tab of w
              set tabNumber to tabNumber + 1
              if (URL of t starts with "\(erpBaseURL)") then
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
          set URL of active tab of erpWindow to "\(erpMorningURL)"
          set bounds of erpWindow to {\(rb.0), \(rb.1), \(rb.2), \(rb.3)}

          set musicWindow to missing value
          repeat with w in every window
            if (id of w) is not erpWindowId then
              set tabNumber to 0
              repeat with t in every tab of w
                set tabNumber to tabNumber + 1
                if (URL of t starts with "\(musicURL)") then
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
          set bounds of musicWindow to {\(lb.0), \(lb.1), \(lb.2), \(lb.3)}

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
        """
        _ = try runAppleScript(script)
    }

    private func startYandexMusic() -> Bool {
        let javascript = """
        (() => {
          const controls = document.querySelector('[class*="VibePlayerControls_root"]');
          const pause = controls?.querySelector('button[aria-label*="Пауза"],button[title*="Пауза"],[data-testid="pause-button"]');
          if (pause) return 'already-playing';
          const play = controls?.querySelector('button[aria-label="Воспроизведение"],button[aria-label*="Воспроизвести"],button[title*="Воспроизвести"],button[aria-label*="Play"],button[title*="Play"],[data-testid="play-button"]');
          if (!play) return 'missing';
          play.click();
          return 'started';
        })()
        """.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "\"", with: "\\\"")
        let script = """
        tell application "Yandex"
          repeat with w in every window
            repeat with t in every tab of w
              if (URL of t starts with "\(musicURL)") then
                set resultText to execute t javascript "\(javascript)"
                return resultText
              end if
            end repeat
          end repeat
        end tell
        """
        for _ in 0..<8 {
            if let result = try? runAppleScript(script), ["started", "already-playing"].contains(result) {
                return true
            }
            Thread.sleep(forTimeInterval: 1)
        }
        return false
    }

    private func enableDoNotDisturb() -> Bool {
        let script = """
        tell application "System Events"
          tell process "ControlCenter"
            set didOpenFocus to false
            set didEnableDnd to false
            try
              click first menu bar item of menu bar 1 whose description is "Control Center"
              delay 0.5
              repeat with uiItem in entire contents of window 1
                try
                  set itemName to name of uiItem as text
                  if itemName contains "Focus" or itemName contains "Фокус" then
                    perform action "AXPress" of uiItem
                    set didOpenFocus to true
                    exit repeat
                  end if
                end try
              end repeat
              if didOpenFocus then
                delay 0.4
                repeat with uiItem in entire contents of window 1
                  try
                    set itemName to name of uiItem as text
                    if itemName contains "Do Not Disturb" or itemName contains "Не беспокоить" then
                      perform action "AXPress" of uiItem
                      set didEnableDnd to true
                      exit repeat
                    end if
                  end try
                end repeat
              end if
            end try
            return didEnableDnd as text
          end tell
        end tell
        """
        guard let result = try? runNativeAppleScript(script) else { return false }
        return result == "true"
    }

    private func hasAccessibilityAccess(promptIfNeeded: Bool) -> Bool {
        if AXIsProcessTrusted() { return true }
        guard promptIfNeeded else { return false }
        webView.evaluateJavaScript("window.piuraModeNeedsAccess()")
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
        let deadline = Date().addingTimeInterval(45)
        while Date() < deadline {
            if AXIsProcessTrusted() { return true }
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
        }
        return false
    }

    private func canControlSystemEvents() -> Bool {
        (try? runNativeAppleScript("tell application \"System Events\" to get name")) != nil
    }

    private func runNativeAppleScript(_ source: String) throws -> String {
        var error: NSDictionary?
        guard let script = NSAppleScript(source: source) else {
            throw NSError(domain: "PIURAModes", code: 4, userInfo: [NSLocalizedDescriptionKey: "Не удалось подготовить системный сценарий."])
        }
        let result = script.executeAndReturnError(&error)
        if let error {
            let message = error[NSAppleScript.errorMessage] as? String ?? "Ошибка управления macOS."
            throw NSError(domain: "PIURAModes", code: 5, userInfo: [NSLocalizedDescriptionKey: message])
        }
        return result.stringValue ?? ""
    }

    @discardableResult
    private func runAppleScript(_ source: String) throws -> String {
        let process = Process()
        let input = Pipe()
        let output = Pipe()
        let errors = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-"]
        process.standardInput = input
        process.standardOutput = output
        process.standardError = errors

        try process.run()
        if let data = source.data(using: .utf8) {
            input.fileHandleForWriting.write(data)
        }
        try? input.fileHandleForWriting.close()

        let deadline = Date().addingTimeInterval(15)
        while process.isRunning && Date() < deadline {
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
        }
        if process.isRunning {
            process.terminate()
            throw NSError(domain: "PIURAModes", code: 3, userInfo: [NSLocalizedDescriptionKey: "macOS не дала ответ за 15 секунд."])
        }

        let outputText = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let errorText = String(data: errors.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard process.terminationStatus == 0 else {
            throw NSError(
                domain: "PIURAModes",
                code: Int(process.terminationStatus),
                userInfo: [NSLocalizedDescriptionKey: errorText.isEmpty ? "Ошибка автоматизации macOS." : errorText]
            )
        }
        return outputText
    }

    private func finishInWebView(_ result: ModeResult) {
        let payload: [String: Any] = ["ok": result.ok, "message": result.message]
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.piuraModeFinished(\(json))")
    }

    private func showNativeError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "PIURA Modes"
        alert.informativeText = message
        alert.runModal()
    }
}

let application = NSApplication.shared
let appDelegate = AppDelegate()
application.delegate = appDelegate
application.run()
