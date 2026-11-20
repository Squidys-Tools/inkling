import ExpoModulesCore

public class InklingNativeModule: Module {
  private var embedding: TextEmbedding?
  // Async functions run concurrently; two first calls must not each load the ONNX session.
  private let embeddingLock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("InklingNative")

    Function("appGroupPath") { (group: String) -> String? in
      FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.path
    }

    AsyncFunction("textHiddenStates") { (modelPath: String, ids: [Int], typeIds: [Int]) -> [Float] in
      let embedding = try self.embeddingLock.withLock {
        if let embedding = self.embedding { return embedding }
        let loaded = try TextEmbedding(modelPath: modelPath)
        self.embedding = loaded
        return loaded
      }
      return try embedding.hiddenStates(
        ids: ids.map(Int64.init), typeIds: typeIds.map(Int64.init))
    }
  }
}
