import Foundation

// macOS 26 keeps a separate wallpaper choice for every Space/display pair.
// System Events changes only the current Space, leaving the base Desktop stale.
// This narrowly updates Desktop choices for the connected physical displays;
// screen savers, other displays, and the Space inventory remain untouched.
enum WallpaperStore {
    static func applying(_ urls: [String: URL], to original: [String: Any]) throws -> [String: Any] {
        guard original["AllSpacesAndDisplays"] as? String == "$null",
              var displays = original["Displays"] as? [String: Any],
              var spaces = original["Spaces"] as? [String: Any],
              let fallback = original["SystemDefault"] as? [String: Any],
              fallback["Desktop"] is [String: Any] else {
            throw NSError(domain: "PIURA.Wallpaper", code: 1, userInfo: [NSLocalizedDescriptionKey: "Неизвестная структура обоев macOS или включены общие обои всех экранов. Настройки сохранены без изменений."])
        }
        func updated(_ value: Any?, url: URL) throws -> [String: Any] {
            var record = value as? [String: Any] ?? fallback
            var desktop = record["Desktop"] as? [String: Any] ?? [:]
            let config = try PropertyListSerialization.data(fromPropertyList: ["type":"imageFile", "url":["relative":url.absoluteString]], format:.binary, options:0)
            desktop["Content"] = ["Choices":[["Configuration":config,"Files":[String](),"Provider":"com.apple.wallpaper.choice.image"]],"EncodedOptionValues":"$null","Shuffle":"$null"]
            desktop["LastSet"] = Date()
            record["Desktop"] = desktop
            return record
        }
        for (id,url) in urls { displays[id] = try updated(displays[id], url:url) }
        for (spaceID,value) in spaces {
            guard var space = value as? [String: Any] else { continue }
            var entries = space["Displays"] as? [String: Any] ?? [:]
            for (id,url) in urls { entries[id] = try updated(entries[id] ?? displays[id], url:url) }
            space["Displays"] = entries
            spaces[spaceID] = space
        }
        var result = original
        result["Displays"] = displays; result["Spaces"] = spaces
        return result
    }
    static func matches(_ urls: [String: URL], in store: [String: Any]) -> Bool {
        func matchesEntries(_ entries: [String: Any]) -> Bool {
            urls.allSatisfy { id,url in
                guard let record = entries[id] as? [String: Any],
                      let desktop = record["Desktop"] as? [String: Any],
                      let content = desktop["Content"] as? [String: Any],
                      let choices = content["Choices"] as? [[String: Any]],
                      let data = choices.first?["Configuration"] as? Data,
                      let config = try? PropertyListSerialization.propertyList(from:data, options:[], format:nil) as? [String: Any],
                      let path = (config["url"] as? [String: String])?["relative"] else { return false }
                return URL(string:path)?.standardizedFileURL == url.standardizedFileURL
            }
        }
        guard let displays = store["Displays"] as? [String: Any], matchesEntries(displays),
              let spaces = store["Spaces"] as? [String: [String: Any]] else { return false }
        return spaces.values.allSatisfy { matchesEntries($0["Displays"] as? [String: Any] ?? [:]) }
    }
}
