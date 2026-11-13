import Foundation

struct T3NativeStrings {
  static let shared = T3NativeStrings(
    locale: Bundle.main.object(forInfoDictionaryKey: "T3AppLocale") as? String
  )
  private let isChinese: Bool

  init(locale: String?) { isChinese = locale == "zh-CN" }

  func text(_ english: String, _ chinese: String) -> String {
    isChinese ? chinese : english
  }
}
