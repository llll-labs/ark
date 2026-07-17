// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "ArkTunnelsMenuBar",
  platforms: [.macOS(.v13)],
  targets: [
    .executableTarget(
      name: "ArkTunnelsMenuBar",
      path: "Sources"
    ),
  ]
)
