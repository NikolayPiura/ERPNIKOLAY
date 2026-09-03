import Foundation

@main struct WallpaperStoreTests {
    static func main() throws {
        let idle: [String:Any] = ["Content":["unchanged":"screen saver"]]
        let record: [String:Any] = ["Desktop":["Content":[:]],"Idle":idle,"Type":"individual"]
        let input: [String:Any] = ["AllSpacesAndDisplays":"$null","SystemDefault":record,"Displays":["other":record],"Spaces":["desktop":["Default":record,"Displays":["other":record]],"fullscreen":["Default":record,"Displays":[:]]]]
        let urls = ["left":URL(fileURLWithPath:"/left.png"),"center":URL(fileURLWithPath:"/center.png"),"right":URL(fileURLWithPath:"/right.png")]
        let changed = try WallpaperStore.applying(urls,to:input)
        precondition(WallpaperStore.matches(urls,in:changed))
        precondition(!WallpaperStore.matches(urls,in:input))
        let displays = changed["Displays"] as! [String:[String:Any]]
        precondition(NSDictionary(dictionary:displays["other"]!).isEqual(to:record))
        precondition(NSDictionary(dictionary:displays["left"]!["Idle"] as! [String:Any]).isEqual(to:idle))
        precondition(NSDictionary(dictionary:changed["SystemDefault"] as! [String:Any]).isEqual(to:record))
        var invalid = input; invalid["AllSpacesAndDisplays"] = record
        do { _ = try WallpaperStore.applying(urls,to:invalid); fatalError("must reject global override") } catch {}
        print("WallpaperStore: all display/Space pairs updated; screen savers, defaults, other displays preserved")
    }
}
