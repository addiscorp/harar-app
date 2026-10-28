Pod::Spec.new do |s|
  s.name           = 'SimienEnclave'
  s.version        = '0.1.0'
  s.summary        = "The Simien app's keys in the Secure Enclave, and Bonjour browsing"
  s.author         = 'Addis'
  s.homepage       = 'https://simien.dev'
  s.license        = 'Apache-2.0'
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
