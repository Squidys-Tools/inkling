import Foundation
import onnxruntime_objc

// Runs the Nomic text ONNX graph; tokenizing and pooling stay in JS to mirror desktop.
final class TextEmbedding {
  private let env: ORTEnv
  private let session: ORTSession

  init(modelPath: String) throws {
    env = try ORTEnv(loggingLevel: .warning)
    session = try ORTSession(env: env, modelPath: modelPath, sessionOptions: ORTSessionOptions())
  }

  func hiddenStates(ids: [Int64], typeIds: [Int64]) throws -> [Float] {
    let shape: [NSNumber] = [1, NSNumber(value: ids.count)]
    func tensor(_ values: [Int64]) throws -> ORTValue {
      let data = values.withUnsafeBufferPointer { NSMutableData(bytes: $0.baseAddress, length: $0.count * 8) }
      return try ORTValue(tensorData: data, elementType: .int64, shape: shape)
    }
    let outputs = try session.run(
      withInputs: [
        "input_ids": try tensor(ids),
        "token_type_ids": try tensor(typeIds),
        "attention_mask": try tensor(ids.map { _ in 1 }),
      ],
      outputNames: ["last_hidden_state"], runOptions: nil)
    guard let hidden = outputs["last_hidden_state"] else { throw CocoaError(.fileReadCorruptFile) }
    let data = try hidden.tensorData() as Data
    return data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
  }
}
