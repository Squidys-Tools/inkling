import ExpoModulesCore
import TailscaleKit

public class InklingNativeModule: Module {
  private var node: TailscaleNode?
  private var upError: String?
  private var embedding: TextEmbedding?

  public func definition() -> ModuleDefinition {
    Name("InklingNative")

    Function("appGroupPath") { (group: String) -> String? in
      FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.path
    }

    // up() blocks until the node logs in, so it runs detached and the app polls status.
    AsyncFunction("startTailscale") { (hostName: String) in
      if self.node != nil { return }
      let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("tailscale", isDirectory: true)
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let config = Configuration(
        hostName: hostName, path: dir.path, authKey: nil, controlURL: kDefaultControlURL,
        ephemeral: false)
      let node = try TailscaleNode(config: config, logger: nil)
      self.node = node
      Task.detached {
        do { try await node.up() } catch { self.upError = "\(error)" }
      }
    }

    AsyncFunction("textHiddenStates") { (modelPath: String, ids: [Int], typeIds: [Int]) -> [Float] in
      if self.embedding == nil { self.embedding = try TextEmbedding(modelPath: modelPath) }
      return try self.embedding!.hiddenStates(
        ids: ids.map(Int64.init), typeIds: typeIds.map(Int64.init))
    }

    AsyncFunction("tailscaleStatus") { () -> [String: Any] in
      guard let node = self.node else { return ["state": "Stopped"] }
      let data = try await node.statusJSON()
      let status = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
      var result: [String: Any] = [
        "state": status["BackendState"] as? String ?? "Unknown",
        "authURL": status["AuthURL"] as? String ?? "",
        "ips": status["TailscaleIPs"] as? [String] ?? [],
      ]
      if let upError = self.upError { result["error"] = upError }
      return result
    }
  }
}
