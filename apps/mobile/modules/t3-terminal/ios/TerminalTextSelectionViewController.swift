import UIKit

final class TerminalTextSelectionViewController: UIViewController {
  private let text: String
  private let fontSize: CGFloat

  init(text: String, fontSize: CGFloat) {
    self.text = text
    self.fontSize = fontSize
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    return nil
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = T3NativeStrings.shared.text("Terminal text", "终端文本")
    view.backgroundColor = .systemBackground

    navigationItem.leftBarButtonItem = UIBarButtonItem(
      title: T3NativeStrings.shared.text("Copy All", "全部复制"), style: .plain, target: self, action: #selector(copyAll))
    navigationItem.rightBarButtonItem = UIBarButtonItem(
      barButtonSystemItem: .done, target: self, action: #selector(close))

    let textView = UITextView()
    textView.text = text
    textView.font = .monospacedSystemFont(ofSize: max(fontSize, 14), weight: .regular)
    textView.textColor = .label
    textView.backgroundColor = .systemBackground
    textView.isEditable = false
    textView.isSelectable = true
    // Login flows print auth URLs; tapping one opens it.
    textView.dataDetectorTypes = .link
    textView.accessibilityLabel = T3NativeStrings.shared.text("Terminal output", "终端输出")
    textView.textContainerInset = UIEdgeInsets(top: 16, left: 12, bottom: 16, right: 12)
    textView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(textView)

    NSLayoutConstraint.activate([
      textView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
      textView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
      textView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      textView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
    ])
  }

  @objc
  private func copyAll() {
    UIPasteboard.general.string = text
    close()
  }

  @objc
  private func close() {
    dismiss(animated: !UIAccessibility.isReduceMotionEnabled)
  }
}

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
