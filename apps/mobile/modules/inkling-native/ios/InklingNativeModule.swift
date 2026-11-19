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

    // Dials the peer through the embedded node's netstack: no system DNS, ATS or proxy involved.
    AsyncFunction("tailnetRequest") {
      (address: String, method: String, path: String, token: String, body: String?) -> [String: Any] in
      guard let handle = await self.node?.tailscale else { throw CocoaError(.featureUnsupported) }
      var conn: Int32 = 0
      guard tailscale_dial(handle, "tcp", address, &conn) == 0 else {
        throw CocoaError(.fileReadUnknown)
      }
      defer { close(conn) }
      let host = address.split(separator: ":").first.map(String.init) ?? address
      let payload = Array((body ?? "").utf8)
      var header = "\(method) \(path) HTTP/1.0\r\nHost: \(host)\r\nAuthorization: Bearer \(token)\r\n"
      if body != nil {
        header += "Content-Type: application/json\r\nContent-Length: \(payload.count)\r\n"
      }
      let request = Array("\(header)\r\n".utf8) + payload
      var sent = 0
      while sent < request.count {
        let count = request[sent...].withUnsafeBytes { write(conn, $0.baseAddress, $0.count) }
        if count <= 0 { throw CocoaError(.fileWriteUnknown) }
        sent += count
      }
      var response = Data()
      var buffer = [UInt8](repeating: 0, count: 16384)
      while true {
        let count = read(conn, &buffer, buffer.count)
        if count <= 0 { break }
        response.append(buffer, count: count)
      }
      guard let split = response.range(of: Data("\r\n\r\n".utf8)) else {
        throw CocoaError(.fileReadCorruptFile)
      }
      let head = String(decoding: response[..<split.lowerBound], as: UTF8.self)
      let status = head.split(separator: " ").dropFirst().first.flatMap { Int($0) } ?? 0
      let body = Data(response[split.upperBound...])
      return ["status": status, "text": String(decoding: body, as: UTF8.self), "base64": body.base64EncodedString()]
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
