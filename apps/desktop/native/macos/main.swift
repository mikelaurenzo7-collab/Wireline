import Foundation
import AppKit
import ApplicationServices
import CoreGraphics
import Darwin

// One typed request per process. No shell, AppleScript, arbitrary selectors or file paths.
// This helper is embedded and signed with the companion. It never captures the entire screen.
struct Bounds: Codable, Equatable { let x: Int; let y: Int; let width: Int; let height: Int }
struct WindowInfo: Codable, Equatable {
    let id: String; let title: String; let appName: String; let processId: Int
    let bounds: Bounds; let scaleFactor: Double
}
let blockedBundles: Set<String> = [
    "com.apple.Terminal", "com.googlecode.iterm2", "com.apple.ScriptEditor2",
    "com.apple.systempreferences", "com.apple.systemuiserver", "com.apple.loginwindow",
    "com.apple.SecurityAgent", "com.apple.keychainaccess"
]
let blockedNames: Set<String> = ["Terminal", "iTerm2", "Script Editor", "System Settings", "SecurityAgent", "loginwindow"]
let modifiers: Set<String> = ["CTRL", "ALT", "SHIFT", "COMMAND"]
let keyCodes: [String: CGKeyCode] = [
    "A": 0, "S": 1, "D": 2, "F": 3, "H": 4, "G": 5, "Z": 6, "X": 7, "C": 8, "V": 9,
    "B": 11, "Q": 12, "W": 13, "E": 14, "R": 15, "Y": 16, "T": 17,
    "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "9": 25, "7": 26, "8": 28, "0": 29,
    "O": 31, "U": 32, "I": 34, "P": 35, "ENTER": 36, "L": 37, "J": 38, "K": 40,
    "N": 45, "M": 46, "TAB": 48, "SPACE": 49, "BACKSPACE": 51, "ESC": 53,
    "COMMAND": 55, "SHIFT": 56, "ALT": 58, "CTRL": 59, "HOME": 115, "PAGEUP": 116,
    "DELETE": 117, "END": 119, "PAGEDOWN": 121, "LEFT": 123, "RIGHT": 124, "DOWN": 125, "UP": 126
]
var inputStarted = false

func output(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) { FileHandle.standardOutput.write(data) }
}
func dictionary<T: Encodable>(_ value: T) -> Any {
    guard let data = try? JSONEncoder().encode(value), let result = try? JSONSerialization.jsonObject(with: data) else { return NSNull() }
    return result
}
func integer(_ value: Any?, _ minimum: Int, _ maximum: Int) -> Int? {
    guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID() else { return nil }
    let number = value.doubleValue
    guard number.isFinite, number.rounded() == number, number >= Double(minimum), number <= Double(maximum) else { return nil }
    return Int(number)
}
func windows() -> [[String: Any]] {
    (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
}
func parseID(_ value: String) -> (CGWindowID, pid_t, Int64)? {
    let parts = value.split(separator: ":", omittingEmptySubsequences: false)
    guard parts.count == 3, parts.allSatisfy({ !$0.isEmpty && $0.count <= 20 && $0.allSatisfy(\.isNumber) }),
          let number = UInt32(parts[0]), let pid = Int32(parts[1]), let started = Int64(parts[2]), number > 0, pid > 0, started > 0 else { return nil }
    return (number, pid, started)
}
func inspect(_ row: [String: Any]) -> WindowInfo? {
    guard let number = integer(row[kCGWindowNumber as String], 1, Int(UInt32.max)),
          let pid = integer(row[kCGWindowOwnerPID as String], 1, Int(Int32.max)),
          integer(row[kCGWindowLayer as String], -10000, 10000) == 0,
          let application = NSRunningApplication(processIdentifier: pid_t(pid)), !application.isTerminated,
          !blockedBundles.contains(application.bundleIdentifier ?? ""),
          let appName = application.localizedName, !blockedNames.contains(appName),
          let launchDate = application.launchDate,
          let title = row[kCGWindowName as String] as? String, !title.isEmpty,
          let rawBounds = row[kCGWindowBounds as String] as? [String: Any],
          let rect = CGRect(dictionaryRepresentation: rawBounds as CFDictionary), rect.width > 0, rect.height > 0,
          rect.width <= 16384, rect.height <= 16384, abs(rect.minX) <= 100000, abs(rect.minY) <= 100000 else { return nil }
    let started = Int64((launchDate.timeIntervalSince1970 * 1000).rounded())
    // CG window coordinates are top-left based global points. Electron's source pixels may
    // be Retina-scaled; the TypeScript adapter maps those pixels back to these coordinates.
    let bounds = Bounds(x: Int(rect.minX.rounded()), y: Int(rect.minY.rounded()), width: Int(rect.width.rounded()), height: Int(rect.height.rounded()))
    let displays = NSScreen.screens
    let mainHeight = displays.first?.frame.height ?? 0
    let cocoaRect = CGRect(x: rect.minX, y: mainHeight - rect.maxY, width: rect.width, height: rect.height)
    let scale = displays.first(where: { $0.frame.intersects(cocoaRect) })?.backingScaleFactor ?? 1
    return WindowInfo(id: "\(number):\(pid):\(started)", title: String(title.prefix(500)), appName: String(appName.prefix(200)), processId: pid, bounds: bounds, scaleFactor: scale)
}
func resolve(_ id: String) -> WindowInfo? {
    guard let (number, _, _) = parseID(id), let row = windows().first(where: { integer($0[kCGWindowNumber as String], 1, Int(UInt32.max)) == Int(number) }),
          let window = inspect(row), window.id == id else { return nil }
    return window
}
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}
func element(_ value: CFTypeRef?) -> AXUIElement? {
    guard let value, CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return unsafeBitCast(value, to: AXUIElement.self)
}
func point(_ value: CFTypeRef?) -> CGPoint? {
    guard let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
    let axValue = unsafeBitCast(value, to: AXValue.self)
    guard AXValueGetType(axValue) == .cgPoint else { return nil }
    var point = CGPoint.zero
    return AXValueGetValue(axValue, .cgPoint, &point) ? point : nil
}
func size(_ value: CFTypeRef?) -> CGSize? {
    guard let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
    let axValue = unsafeBitCast(value, to: AXValue.self)
    guard AXValueGetType(axValue) == .cgSize else { return nil }
    var size = CGSize.zero
    return AXValueGetValue(axValue, .cgSize, &size) ? size : nil
}
func matchingAXWindow(_ window: WindowInfo) -> AXUIElement? {
    let app = AXUIElementCreateApplication(pid_t(window.processId))
    guard let entries = attribute(app, kAXWindowsAttribute) as? [AXUIElement] else { return nil }
    let matches = entries.filter {
        guard let title = attribute($0, kAXTitleAttribute) as? String, String(title.prefix(500)) == window.title,
              let position = point(attribute($0, kAXPositionAttribute)), let extent = size(attribute($0, kAXSizeAttribute)) else { return false }
        return abs(position.x - Double(window.bounds.x)) <= 1 && abs(position.y - Double(window.bounds.y)) <= 1 &&
            abs(extent.width - Double(window.bounds.width)) <= 1 && abs(extent.height - Double(window.bounds.height)) <= 1
    }
    // Public AX has no stable CGWindowID accessor. Duplicate title/geometry is ambiguous.
    return matches.count == 1 ? matches[0] : nil
}
func sensitive(_ target: AXUIElement) -> Bool {
    guard let role = attribute(target, kAXRoleAttribute) as? String else { return true }
    let subrole = attribute(target, kAXSubroleAttribute) as? String ?? ""
    return role == "AXUnknown" || subrole == "AXSecureTextField" || (attribute(target, "AXProtectedContent") as? Bool) == true
}
func focusedElement(_ window: WindowInfo) -> AXUIElement? {
    let app = AXUIElementCreateApplication(pid_t(window.processId))
    guard let target = element(attribute(app, kAXFocusedUIElementAttribute)) else { return nil }
    var pid: pid_t = 0
    guard AXUIElementGetPid(target, &pid) == .success, pid == window.processId else { return nil }
    return target
}
func safeFocus(_ window: WindowInfo, _ targetWindow: AXUIElement) -> Bool {
    guard NSWorkspace.shared.frontmostApplication?.processIdentifier == window.processId,
          let focusedWindow = element(attribute(AXUIElementCreateApplication(pid_t(window.processId)), kAXFocusedWindowAttribute)),
          CFEqual(focusedWindow, targetWindow) else { return false }
    return true
}
func topWindowAt(_ point: CGPoint) -> CGWindowID? {
    for row in windows() {
        guard let alpha = row[kCGWindowAlpha as String] as? NSNumber, alpha.doubleValue > 0,
              let raw = row[kCGWindowBounds as String] as? [String: Any], let bounds = CGRect(dictionaryRepresentation: raw as CFDictionary), bounds.contains(point),
              let id = integer(row[kCGWindowNumber as String], 1, Int(UInt32.max)) else { continue }
        return CGWindowID(id)
    }
    return nil
}
func validAction(_ action: [String: Any], _ bounds: Bounds) -> Bool {
    guard let type = action["type"] as? String else { return false }
    func exact(_ keys: [String]) -> Bool { Set(action.keys) == Set(keys) }
    if type == "click" || type == "scroll" {
        guard integer(action["x"], 0, bounds.width - 1) != nil, integer(action["y"], 0, bounds.height - 1) != nil else { return false }
        if type == "click" { return exact(["type", "x", "y", "button", "clickCount"]) && ["left", "right"].contains(action["button"] as? String ?? "") && integer(action["clickCount"], 1, 2) != nil }
        guard let dx = integer(action["deltaX"], -2000, 2000), let dy = integer(action["deltaY"], -2000, 2000) else { return false }
        return exact(["type", "x", "y", "deltaX", "deltaY"]) && (dx != 0 || dy != 0)
    }
    if type == "type_text" {
        guard exact(["type", "text"]), let text = action["text"] as? String, !text.isEmpty, text.utf16.count <= 2000 else { return false }
        return text.unicodeScalars.allSatisfy { $0.value == 10 || !CharacterSet.controlCharacters.contains($0) } &&
            text.range(of: #"(?i)^[\s\uFEFF]*(?:javascript|vbscript|data|file|shell|powershell|cmd|ms-[a-z0-9-]+):"#, options: .regularExpression) == nil && unicodeChunks(text) != nil
    }
    guard type == "keypress", exact(["type", "keys"]), let keys = action["keys"] as? [String], (1...4).contains(keys.count), Set(keys).count == keys.count,
          keys.allSatisfy({ keyCodes[$0] != nil }), keys.filter({ !modifiers.contains($0) }).count == 1,
          keys.dropLast().allSatisfy({ modifiers.contains($0) }) else { return false }
    return !(keys.contains("TAB") && (keys.contains("ALT") || keys.contains("COMMAND"))) &&
        !(keys.contains("SPACE") && (keys.contains("ALT") || keys.contains("COMMAND"))) &&
        !(keys.contains("ESC") && keys.contains(where: { modifiers.contains($0) })) &&
        !(keys.contains("COMMAND") && keys.contains(where: { ["H", "M", "Q"].contains($0) })) &&
        !(keys.contains("CTRL") && keys.contains(where: { ["UP", "DOWN", "LEFT", "RIGHT"].contains($0) })) &&
        !(keys.contains("DELETE") && keys.contains("CTRL") && keys.contains("ALT"))
}
func flags(_ keys: [String]) -> CGEventFlags {
    var value: CGEventFlags = []
    if keys.contains("CTRL") { value.insert(.maskControl) }
    if keys.contains("ALT") { value.insert(.maskAlternate) }
    if keys.contains("SHIFT") { value.insert(.maskShift) }
    if keys.contains("COMMAND") { value.insert(.maskCommand) }
    return value
}
func unicodeChunks(_ text: String) -> [[UInt16]]? {
    // Quartz consumers may truncate long event strings. Keep each payload <=20
    // UTF-16 units and never split a surrogate pair. Source compatibility note:
    // https://github.com/enigo-rs/enigo/blob/main/src/macos/macos_impl.rs
    var chunks: [[UInt16]] = []
    var current: [UInt16] = []
    for scalar in text.unicodeScalars {
        let units = Array(String(scalar).utf16)
        if current.count + units.count > 20 { chunks.append(current); current = [] }
        current.append(contentsOf: units)
    }
    if !current.isEmpty { chunks.append(current) }
    // Leading line feeds are not reliably posted by Quartz. Refuse the whole
    // action before input rather than insert hidden text or substitute Submit.
    guard !chunks.isEmpty, chunks.allSatisfy({ $0.first != 10 }) else { return nil }
    return chunks
}
// Cleanup emits only up-events for the interrupted action. It never refocuses a window,
// moves the cursor, sends another down-event or claims the original write was not applied.
func release(_ action: [String: Any]) -> String {
    guard CGPreflightPostEventAccess(), let source = CGEventSource(stateID: .hidSystemState) else { return "unknown" }
    if action["type"] as? String == "click" {
        guard let position = CGEvent(source: source)?.location else { return "unknown" }
        let right = action["button"] as? String == "right"
        guard let up = CGEvent(mouseEventSource: source, mouseType: right ? .rightMouseUp : .leftMouseUp, mouseCursorPosition: position, mouseButton: right ? .right : .left) else { return "unknown" }
        up.post(tap: .cghidEventTap)
    } else if action["type"] as? String == "keypress" {
        // Modifiers are event flags rather than independently held keys on macOS.
        guard let keys = action["keys"] as? [String], let key = keys.last, let code = keyCodes[key],
              let up = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false) else { return "unknown" }
        up.flags = []; up.post(tap: .cghidEventTap)
    } else if action["type"] as? String == "type_text" {
        guard let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) else { return "unknown" }
        up.post(tap: .cghidEventTap)
    }
    return "applied"
}
func activate(_ window: WindowInfo) -> Bool {
    guard AXIsProcessTrusted(), parseID(window.id) != nil,
          let targetWindow = matchingAXWindow(window), let app = NSRunningApplication(processIdentifier: pid_t(window.processId)) else { return false }
    guard AXUIElementPerformAction(targetWindow, kAXRaiseAction as CFString) == .success else { return false }
    app.activate(options: [.activateIgnoringOtherApps])
    for _ in 0..<8 { if safeFocus(window, targetWindow) { break }; Thread.sleep(forTimeInterval: 0.025) }
    return safeFocus(window, targetWindow) && resolve(window.id) == window
}
func execute(_ window: WindowInfo, _ action: [String: Any]) -> String {
    guard CGPreflightPostEventAccess(), AXIsProcessTrusted(), parseID(window.id) != nil,
          let targetWindow = matchingAXWindow(window) else { return "rejected" }
    // Activation must precede the adapter's final screenshot, never the input itself.
    guard safeFocus(window, targetWindow), resolve(window.id) == window,
          CGEventSource.flagsState(.combinedSessionState).intersection([.maskControl, .maskShift, .maskAlternate, .maskCommand]).isEmpty,
          let source = CGEventSource(stateID: .hidSystemState) else { return "rejected" }
    let type = action["type"] as! String
    var needsRelease = false
    defer { if needsRelease { _ = release(action) } }
    if type == "click" || type == "scroll" {
        let position = CGPoint(x: window.bounds.x + (action["x"] as! Int), y: window.bounds.y + (action["y"] as! Int))
        guard let (number, _, _) = parseID(window.id), topWindowAt(position) == number else { return "rejected" }
        var pointed: AXUIElement?
        guard AXUIElementCopyElementAtPosition(AXUIElementCreateSystemWide(), Float(position.x), Float(position.y), &pointed) == .success,
              let pointed, !sensitive(pointed) else { return "rejected" }
        var pointedPID: pid_t = 0
        guard AXUIElementGetPid(pointed, &pointedPID) == .success, pointedPID == window.processId,
              let move = CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: position, mouseButton: .left) else { return "rejected" }
        inputStarted = true
        move.post(tap: .cghidEventTap)
        guard safeFocus(window, targetWindow), topWindowAt(position) == number else { return "unknown" }
        if type == "click" {
            let right = (action["button"] as! String) == "right"
            for count in 1...(action["clickCount"] as! Int) {
                guard safeFocus(window, targetWindow),
                      let down = CGEvent(mouseEventSource: source, mouseType: right ? .rightMouseDown : .leftMouseDown, mouseCursorPosition: position, mouseButton: right ? .right : .left),
                      let up = CGEvent(mouseEventSource: source, mouseType: right ? .rightMouseUp : .leftMouseUp, mouseCursorPosition: position, mouseButton: right ? .right : .left) else { return "unknown" }
                down.setIntegerValueField(.mouseEventClickState, value: Int64(count)); up.setIntegerValueField(.mouseEventClickState, value: Int64(count))
                needsRelease = true
                down.post(tap: .cghidEventTap); up.post(tap: .cghidEventTap)
                needsRelease = false
            }
        } else {
            guard let event = CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 2, wheel1: -Int32(action["deltaY"] as! Int), wheel2: -Int32(action["deltaX"] as! Int), wheel3: 0) else { return "unknown" }
            event.location = position; event.post(tap: .cghidEventTap)
        }
        return "applied"
    }
    guard let focused = focusedElement(window), !sensitive(focused), safeFocus(window, targetWindow), resolve(window.id) == window else { return "rejected" }
    if type == "type_text" {
        guard let chunks = unicodeChunks(action["text"] as! String) else { return "rejected" }
        for units in chunks {
            guard safeFocus(window, targetWindow), resolve(window.id) == window,
                  let currentFocus = focusedElement(window), !sensitive(currentFocus),
                  CFEqual(currentFocus, focused),
                  let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true), let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) else { return inputStarted ? "unknown" : "rejected" }
            units.withUnsafeBufferPointer { buffer in
                down.keyboardSetUnicodeString(stringLength: units.count, unicodeString: buffer.baseAddress!)
                up.keyboardSetUnicodeString(stringLength: units.count, unicodeString: buffer.baseAddress!)
            }
            down.flags = []; up.flags = []
            inputStarted = true; needsRelease = true
            down.post(tap: .cghidEventTap); up.post(tap: .cghidEventTap)
            needsRelease = false
        }
    } else {
        let keys = action["keys"] as! [String]
        guard let key = keys.last, let code = keyCodes[key], let down = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true), let up = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false) else { return "rejected" }
        down.flags = flags(keys); up.flags = flags(keys)
        inputStarted = true; needsRelease = true
        down.post(tap: .cghidEventTap); up.post(tap: .cghidEventTap)
        needsRelease = false
    }
    // Posting input has no application acknowledgement. The companion observes the result;
    // this status never claims that a document saved, message sent or business task completed.
    return "applied"
}

// Main-process store operation; deliberately independent of capture/input permissions.
// Fixed basenames and openat/renameat keep the replacement in the opened directory.
func commitWorkspace(_ request: [String: Any]) -> Bool {
    guard Set(request.keys) == Set(["version", "operation", "directory", "temporaryBasename"]),
          let directory = request["directory"] as? String, directory.hasPrefix("/"), directory.utf16.count <= 4096,
          !directory.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
          let temporary = request["temporaryBasename"] as? String,
          temporary.range(of: #"\Aworkspace-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.tmp\z"#, options: .regularExpression) != nil else { return false }
    let directoryFD = Darwin.open(directory, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
    guard directoryFD >= 0 else { return false }
    defer { Darwin.close(directoryFD) }
    let parent = (directory as NSString).deletingLastPathComponent
    let parentFD = Darwin.open(parent, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
    guard parentFD >= 0 else { return false }
    defer { Darwin.close(parentFD) }
    let fileFD = Darwin.openat(directoryFD, temporary, O_RDWR | O_NOFOLLOW)
    guard fileFD >= 0 else { return false }
    defer { Darwin.close(fileFD) }
    var info = stat()
    guard Darwin.fstat(fileFD, &info) == 0, (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG),
          info.st_size >= 0, info.st_size <= 32 * 1024 * 1024 else { return false }
    var targetInfo = stat()
    if Darwin.fstatat(directoryFD, "workspace.enc", &targetInfo, AT_SYMLINK_NOFOLLOW) == 0 {
        guard (targetInfo.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG) else { return false }
    } else if errno != ENOENT { return false }
    guard Darwin.fsync(fileFD) == 0,
          Darwin.renameat(directoryFD, temporary, directoryFD, "workspace.enc") == 0,
          Darwin.fsync(directoryFD) == 0,
          Darwin.fsync(parentFD) == 0 else { return false }
    // Apple fsync(2): plain fsync need not flush the drive cache; F_FULLFSYNC does.
    // Refuse unsupported filesystems instead of silently reducing durability.
    return Darwin.fcntl(fileFD, F_FULLFSYNC) == 0
}

func main() {
    var input = Data()
    while input.count <= 65536 {
        let chunk = FileHandle.standardInput.readData(ofLength: min(4096, 65537 - input.count))
        if chunk.isEmpty { break }; input.append(chunk)
    }
    guard input.count <= 65536, let request = (try? JSONSerialization.jsonObject(with: input)) as? [String: Any],
          integer(request["version"], 1, 1) == 1, let operation = request["operation"] as? String else { output(["status": "rejected"]); return }
    if operation == "commit_workspace" {
        output(["status": commitWorkspace(request) ? "committed" : "rejected"]); return
    }
    guard AXIsProcessTrusted() else { output(["status": "rejected", "code": "accessibility_required"]); return }
    if operation == "release" {
        guard let action = request["action"] as? [String: Any], validAction(action, Bounds(x: 0, y: 0, width: 16384, height: 16384)) else { output(["status": "rejected"]); return }
        output(["status": release(action)]); return
    }
    if operation == "list" { output(["status": "ok", "windows": windows().compactMap(inspect).prefix(200).map(dictionary)]); return }
    guard operation == "inspect" || operation == "activate" || operation == "execute", let id = request["windowId"] as? String, let window = resolve(id) else { output(["status": "rejected"]); return }
    if operation == "inspect" {
        if let focused = focusedElement(window), sensitive(focused) { output(["status": "rejected"]); return }
        let foreground = matchingAXWindow(window).map { safeFocus(window, $0) } ?? false
        output(["status": "ok", "window": dictionary(window), "foreground": foreground]); return
    }
    guard let expected = request["expectedWindow"], let data = try? JSONSerialization.data(withJSONObject: expected),
          let expectedWindow = try? JSONDecoder().decode(WindowInfo.self, from: data), expectedWindow == window else { output(["status": "rejected"]); return }
    if operation == "activate" { output(["status": activate(window) ? "ok" : "rejected"]); return }
    guard let action = request["action"] as? [String: Any], validAction(action, window.bounds) else { output(["status": "rejected"]); return }
    output(["status": execute(window, action)])
}
main()
