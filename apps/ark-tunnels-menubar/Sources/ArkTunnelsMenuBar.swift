import AppKit
import SwiftUI

private let agentLabel = "com.kurark.ark-tunnels"

struct TunnelStatus: Decodable {
  struct Backend: Decodable, Identifiable {
    struct Mapping: Decodable, Identifiable {
      let label: String
      let localIP: String
      let localPort: Int
      let source: String
      let url: String

      var id: String { "\(localIP):\(localPort):\(url)" }
    }

    let id: String
    let name: String?
    let pid: Int?
    let running: Bool
    let mappings: [Mapping]
  }

  let backends: [Backend]
  let errors: [String]
  let pid: Int?
  let updatedAt: String?
}

@MainActor
final class TunnelStore: ObservableObject {
  struct ExposedMapping: Identifiable {
    let backend: TunnelStatus.Backend
    let mapping: TunnelStatus.Backend.Mapping
    var id: String { mapping.id }
  }

  @Published private(set) var status: TunnelStatus?
  @Published private(set) var agentLoaded = false
  @Published private(set) var message: String?

  private var timer: Timer?

  var mappings: [ExposedMapping] {
    guard agentLoaded, statusIsFresh else { return [] }
    let exposed: [ExposedMapping] = status?.backends.flatMap { backend -> [ExposedMapping] in
      guard backend.running else { return [] }
      return backend.mappings.map { ExposedMapping(backend: backend, mapping: $0) }
    } ?? []
    return exposed.sorted { $0.mapping.localPort < $1.mapping.localPort }
  }

  var isHealthy: Bool {
    agentLoaded && statusIsFresh && status?.errors.isEmpty == true
  }

  var statusTitle: String {
    if !agentLoaded { return "Agent is not running" }
    if !statusIsFresh { return "Waiting for tunnel status" }
    if let errors = status?.errors, !errors.isEmpty { return "Tunnel needs attention" }
    if mappings.isEmpty { return "No exposed ports" }
    return "\(mappings.count) port\(mappings.count == 1 ? "" : "s") exposed"
  }

  init() {
    refresh()
    timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
      Task { @MainActor in self?.refresh() }
    }
  }

  func refresh() {
    agentLoaded = Self.command("/bin/launchctl", ["print", Self.launchTarget]).status == 0
    do {
      let data = try Data(contentsOf: Self.statusURL)
      status = try JSONDecoder().decode(TunnelStatus.self, from: data)
      if message == "Restarting agent…" { message = nil }
    } catch {
      status = nil
      if agentLoaded { message = "Waiting for tunnel status…" }
    }
  }

  func restart() {
    message = "Restarting agent…"
    let result = Self.command("/bin/launchctl", ["kickstart", "-k", Self.launchTarget])
    if result.status != 0 {
      message = "Restart failed. Run ark-tunnels install."
    }
    refresh()
  }

  func open(_ mapping: TunnelStatus.Backend.Mapping) {
    guard let url = URL(string: mapping.url) else { return }
    NSWorkspace.shared.open(url)
  }

  func copy(_ mapping: TunnelStatus.Backend.Mapping) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(mapping.url, forType: .string)
    message = "Copied \(mapping.url)"
  }

  func openConfig() {
    NSWorkspace.shared.activateFileViewerSelecting([Self.configURL])
  }

  private static var configRoot: URL {
    FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent(".config/ark-tunnels", isDirectory: true)
  }

  private static var configURL: URL { configRoot.appendingPathComponent("backends.json") }
  private static var statusURL: URL { configRoot.appendingPathComponent("status.json") }
  private static var launchTarget: String { "gui/\(getuid())/\(agentLabel)" }

  private var statusIsFresh: Bool {
    guard let updatedAt = status?.updatedAt else { return false }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = formatter.date(from: updatedAt) else { return false }
    return Date().timeIntervalSince(date) < 10
  }

  private static func command(_ executable: String, _ arguments: [String]) -> (status: Int32, output: String) {
    let process = Process()
    let pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    process.standardOutput = pipe
    process.standardError = pipe
    do {
      try process.run()
      process.waitUntilExit()
      let data = pipe.fileHandleForReading.readDataToEndOfFile()
      return (process.terminationStatus, String(decoding: data, as: UTF8.self))
    } catch {
      return (1, error.localizedDescription)
    }
  }
}

struct TunnelMenu: View {
  @ObservedObject var store: TunnelStore

  private var mappingListHeight: CGFloat {
    min(max(CGFloat(store.mappings.count) * 55, 55), 360)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 8) {
        Circle()
          .fill(store.isHealthy ? Color.green : Color.orange)
          .frame(width: 9, height: 9)
        Text(store.statusTitle).font(.headline)
        Spacer()
        Button {
          store.refresh()
        } label: {
          Image(systemName: "arrow.clockwise")
        }
        .buttonStyle(.plain)
        .help("Refresh")
      }

      Divider()

      if store.mappings.isEmpty {
        VStack(spacing: 8) {
          Image(systemName: "network.slash")
            .font(.system(size: 28))
            .foregroundStyle(.secondary)
          Text("No Exposed Ports")
            .font(.headline)
          Text(store.agentLoaded
            ? "Start an app inside a configured auto-expose range."
            : "Install or restart the Ark Tunnels agent.")
            .font(.caption)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 120)
      } else {
        ScrollView {
          LazyVStack(spacing: 6) {
            ForEach(store.mappings) { item in
              MappingRow(backend: item.backend, mapping: item.mapping, store: store)
            }
          }
        }
        .frame(height: mappingListHeight)
      }

      if let firstError = store.status?.errors.first {
        Label(firstError, systemImage: "exclamationmark.triangle.fill")
          .font(.caption)
          .foregroundStyle(.orange)
          .lineLimit(3)
      } else if let message = store.message {
        Text(message)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }

      Divider()

      HStack {
        Button("Restart Agent") { store.restart() }
        Button("Open Config") { store.openConfig() }
        Spacer()
        Button("Quit") { NSApplication.shared.terminate(nil) }
      }
      .controlSize(.small)
    }
    .padding(14)
    .frame(width: 410)
  }
}

struct MappingRow: View {
  let backend: TunnelStatus.Backend
  let mapping: TunnelStatus.Backend.Mapping
  @ObservedObject var store: TunnelStore

  var body: some View {
    HStack(spacing: 10) {
      Text(String(mapping.localPort))
        .font(.system(.body, design: .monospaced, weight: .semibold))
        .frame(width: 48, alignment: .trailing)

      VStack(alignment: .leading, spacing: 2) {
        Text(mapping.url.replacingOccurrences(of: "https://", with: ""))
          .lineLimit(1)
        Text(backend.name ?? backend.id)
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Spacer(minLength: 8)

      Button { store.copy(mapping) } label: {
        Image(systemName: "doc.on.doc")
      }
      .buttonStyle(.plain)
      .help("Copy URL")

      Button { store.open(mapping) } label: {
        Image(systemName: "arrow.up.forward.square")
      }
      .buttonStyle(.plain)
      .help("Open URL")
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(Color.primary.opacity(0.055), in: RoundedRectangle(cornerRadius: 8))
  }
}

@main
struct ArkTunnelsMenuBarApp: App {
  @StateObject private var store = TunnelStore()

  var body: some Scene {
    MenuBarExtra {
      TunnelMenu(store: store)
    } label: {
      HStack(spacing: 4) {
        Image(systemName: store.isHealthy ? "point.3.connected.trianglepath.dotted" : "exclamationmark.triangle")
        Text(String(store.mappings.count))
          .monospacedDigit()
      }
    }
    .menuBarExtraStyle(.window)
  }
}
