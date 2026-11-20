Pod::Spec.new do |s|
  s.name           = 'InklingNative'
  s.version        = '0.0.0'
  s.summary        = 'inkling native bridges: App Group outbox, embedded Tailscale, ONNX inference'
  s.author         = ''
  s.homepage       = 'https://github.com/Squidys-Tools/inkling'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'onnxruntime-objc', '1.30.0'
  s.vendored_frameworks = 'Frameworks/TailscaleKit.xcframework'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "*.swift"
end
