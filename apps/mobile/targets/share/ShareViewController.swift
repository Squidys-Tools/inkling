import UIKit
import UniformTypeIdentifiers

// The extension only writes captures into the App Group outbox; the app syncs them.
// It must finish fast and stay small: iOS kills share extensions that hold much memory.
final class ShareViewController: UIViewController {
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    Task { await capture() }
  }

  private func capture() async {
    let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
      .flatMap { $0.attachments ?? [] }
    var saved = 0
    for provider in providers {
      if let entry = await entry(from: provider), (try? Outbox.write(entry)) != nil { saved += 1 }
    }
    await MainActor.run { finish(saved: saved) }
  }

  private func entry(from provider: NSItemProvider) async -> Outbox.Entry? {
    if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
      let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL,
      !url.isFileURL
    {
      return .init(kind: "url", text: url.absoluteString)
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier),
      let data = try? await loadData(provider, UTType.image.identifier)
    {
      return .init(kind: "image", text: provider.suggestedName ?? "Image", file: data)
    }
    if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
      let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier)
        as? String
    {
      return .init(kind: "note", text: text)
    }
    return nil
  }

  private func loadData(_ provider: NSItemProvider, _ type: String) async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
      _ = provider.loadDataRepresentation(forTypeIdentifier: type) { data, error in
        if let data { continuation.resume(returning: data) } else {
          continuation.resume(throwing: error ?? CocoaError(.fileReadUnknown))
        }
      }
    }
  }

  private func finish(saved: Int) {
    let label = UILabel()
    label.text = saved > 0 ? "Saved to inkling" : "Nothing to save"
    label.textAlignment = .center
    label.frame = view.bounds
    view.backgroundColor = .systemBackground
    view.addSubview(label)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
      self?.extensionContext?.completeRequest(returningItems: nil)
    }
  }
}

enum Outbox {
  struct Entry {
    let kind: String
    let text: String
    var file: Data? = nil
  }

  static func write(_ entry: Entry) throws {
    let group = Bundle.main.object(forInfoDictionaryKey: "InklingAppGroup") as? String ?? ""
    guard
      let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
        .appendingPathComponent("outbox", isDirectory: true)
    else { throw CocoaError(.fileNoSuchFile) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let id = UUID().uuidString.lowercased()
    var record: [String: Any] = [
      "id": id, "kind": entry.kind, "text": entry.text,
      "createdAt": Int(Date().timeIntervalSince1970 * 1000),
    ]
    if let file = entry.file {
      let name = "\(id).bin"
      try file.write(to: root.appendingPathComponent(name), options: .atomic)
      record["file"] = name
    }
    // The JSON lands last and atomically, so the app never reads a capture without its file.
    let json = try JSONSerialization.data(withJSONObject: record)
    try json.write(to: root.appendingPathComponent("\(id).json"), options: .atomic)
  }
}
